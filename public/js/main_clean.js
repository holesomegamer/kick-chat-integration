// Initialize Socket.IO connection
const socket = io();

// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusBtn = document.getElementById('statusBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginBtn = document.getElementById('loginBtn');
const channelInput = document.getElementById('channelInput');
const chatContainer = document.getElementById('liveChatMessages');
const statusDisplay = document.getElementById('statusDisplay');
const messageCount = document.getElementById('messageCount');

// State variables
let isMonitoring = false;
let currentChannel = '';
let messages = [];
let isAuthenticated = false;
let isPollingActive = false;
let debugMode = false;
let pollingInterval = null;

// TTS variables
let ttsQueue = [];
let isSpeaking = false;
let ttsCount = 0;
let replayCount = 0;
let speechSynthesis = window.speechSynthesis;
let displayedMessageCount = 0;
let displayedMessages = new Map(); // Track displayed messages by ID

// Utility functions
function debugLog(...args) {
    if (debugMode) {
        console.log('🐛', ...args);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimestamp(timestamp) {
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            return 'Invalid Date';
        }
        return date.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    } catch (error) {
        debugLog('❌ Error formatting timestamp:', error);
        return 'Invalid Date';
    }
}

// Toggle debug mode
function toggleDebugMode() {
    debugMode = !debugMode;
    
    const debugButtons = document.querySelector('.debug-buttons');
    const debugToggleBtn = document.getElementById('debugToggleBtn');
    
    if (debugButtons) {
        debugButtons.style.display = debugMode ? 'block' : 'none';
    }
    
    if (debugToggleBtn) {
        debugToggleBtn.textContent = debugMode ? '🐛 Hide Debug Tools' : '🔧 Show Debug Tools';
        debugToggleBtn.className = debugMode ? 'btn btn-warning' : 'btn btn-secondary';
    }
    
    console.log(`🐛 Debug mode ${debugMode ? 'ENABLED' : 'DISABLED'}`);
}

// Check authentication status
function checkAuthenticationStatus() {
    const authBadge = document.querySelector('.status-badge.authenticated');
    const loginBtn = document.getElementById('loginBtn');
    
    isAuthenticated = authBadge !== null && loginBtn === null;
    debugLog('🔍 Authentication status checked:', isAuthenticated);
    return isAuthenticated;
}

// TTS Functions
function speakText(text, username, forceReplay = false, onComplete = null) {
    const ttsEnabled = document.getElementById('ttsEnabled')?.checked;
    const ttsSpeed = parseFloat(document.getElementById('ttsSpeed')?.value || 1);
    
    if (!ttsEnabled || !speechSynthesis) {
        debugLog('🔊 TTS disabled or not available');
        if (onComplete) onComplete(false);
        return;
    }
    
    if (!text || typeof text !== 'string') {
        debugLog('🔊 TTS: Skipping invalid text:', text);
        if (onComplete) onComplete(false);
        return;
    }
    
    const cleanText = text.replace(/[^\w\s.,!?-]/g, '').trim();
    if (cleanText.length < 2) {
        debugLog('🔊 TTS: Skipping short message:', cleanText);
        if (onComplete) onComplete(false);
        return;
    }
    
    if (forceReplay) {
        debugLog(`🔊 Manual TTS replay: ${username}: ${cleanText.substring(0, 50)}...`);
    }
    
    const utterance = new SpeechSynthesisUtterance(`${username} says: ${cleanText}`);
    utterance.rate = ttsSpeed;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    
    utterance.onstart = function() {
        isSpeaking = true;
        debugLog(`🔊 Speaking${forceReplay ? ' (manual)' : ''}: ${username}: ${cleanText.substring(0, 50)}...`);
    };
    
    utterance.onend = function() {
        isSpeaking = false;
        ttsCount++;
        updateMessageStats();
        debugLog(`🔊 Finished speaking: ${username}`);
        if (onComplete) onComplete(true);
        processNextInTTSQueue();
    };
    
    utterance.onerror = function(event) {
        console.error('TTS Error:', event.error);
        isSpeaking = false;
        if (onComplete) onComplete(false);
        processNextInTTSQueue();
    };
    
    if (isSpeaking) {
        ttsQueue.push(utterance);
        debugLog(`🔊 Added to TTS queue: ${username} (queue length: ${ttsQueue.length})`);
    } else {
        speechSynthesis.speak(utterance);
    }
}

function processNextInTTSQueue() {
    if (ttsQueue.length > 0 && !isSpeaking) {
        const nextUtterance = ttsQueue.shift();
        speechSynthesis.speak(nextUtterance);
    }
}

function setupTTSControls() {
    const ttsSpeedSlider = document.getElementById('ttsSpeed');
    const speedValueSpan = document.getElementById('speedValue');
    
    if (ttsSpeedSlider && speedValueSpan) {
        ttsSpeedSlider.addEventListener('input', function() {
            speedValueSpan.textContent = `${this.value}x`;
        });
    }
}

// Update message statistics
function updateMessageStats() {
    const messageCountEl = document.getElementById('messageCount');
    const ttsCountEl = document.getElementById('ttsCount');
    const replayCountEl = document.getElementById('replayCount');
    const lastUpdateEl = document.getElementById('lastUpdate');
    
    if (messageCountEl) messageCountEl.textContent = `Messages: ${displayedMessageCount}`;
    if (ttsCountEl) ttsCountEl.textContent = `TTS Spoken: ${ttsCount}`;
    if (replayCountEl) replayCountEl.textContent = `Manual Replays: ${replayCount}`;
    if (lastUpdateEl) lastUpdateEl.textContent = `Last Update: ${new Date().toLocaleTimeString()}`;
}

// Display chat messages
function displayChatMessages(messages) {
    debugLog('📋 displayChatMessages called with:', messages);
    
    if (messages && messages.length > 0) {
        debugLog('📋 First message structure:', JSON.stringify(messages[0], null, 2));
    }
    
    const chatContainer = document.getElementById('liveChatMessages');
    if (!chatContainer) {
        console.error('❌ liveChatMessages container not found!');
        return;
    }
    
    // Preserve played status for existing messages
    messages.forEach(msg => {
        if (displayedMessages.has(msg.id)) {
            const existingMsg = displayedMessages.get(msg.id);
            msg.played = existingMsg.played;
            debugLog(`📋 Preserving played status for message ${msg.id}: ${msg.played}`);
        } else {
            displayedMessages.set(msg.id, msg);
        }
    });
    
    chatContainer.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        debugLog('📋 No messages to display');
        chatContainer.innerHTML = '<div class="no-messages">💬 No chat messages found...</div>';
        return;
    }
    
    debugLog(`📋 Displaying ${messages.length} messages`);
    displayedMessageCount = messages.length;
    
    messages.forEach((msg, index) => {
        debugLog(`📋 Processing message ${index + 1}:`, msg);
        debugLog(`📋 Message fields: user=${msg.user}, message=${msg.message}, timestamp=${msg.timestamp}`);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        messageDiv.dataset.messageId = msg.id;
        
        const userStyle = msg.color ? `style="color: ${msg.color};"` : '';
        
        const badges = (msg.badges || []).map(badge => 
            `<span class="badge badge-${badge.type}">${badge.text || badge.type}</span>`
        ).join(' ');
        
        const formattedTime = formatTimestamp(msg.timestamp);
        debugLog(`📋 Timestamp: ${msg.timestamp} -> ${formattedTime}`);
        
        const safeUser = msg.user || 'Unknown';
        const safeMessage = msg.message || '[No message]';
        const playedIndicator = msg.played ? '🔇' : '🔊';
        
        messageDiv.innerHTML = `
            <span class="chat-user" ${userStyle}>${escapeHtml(safeUser)}</span>
            ${badges}
            <span class="chat-text">${escapeHtml(safeMessage)}</span>
            <span class="play-indicator" title="${msg.played ? 'Already played (click to replay)' : 'Not yet played'}">${playedIndicator}</span>
            <span class="chat-timestamp">${formattedTime}</span>
        `;
        
        // Add click handler for manual replay
        messageDiv.addEventListener('click', () => {
            debugLog(`🔊 Manual replay requested for: ${safeUser}: ${safeMessage}`);
            replayCount++;
            
            const indicator = messageDiv.querySelector('.play-indicator');
            if (indicator) {
                indicator.textContent = '🔄';
                indicator.title = 'Playing...';
            }
            
            speakText(safeMessage, safeUser, true, (success) => {
                if (indicator) {
                    if (success) {
                        indicator.textContent = '🔇';
                        indicator.title = 'Already played (click to replay)';
                    } else {
                        indicator.textContent = '❌';
                        indicator.title = 'TTS failed (click to retry)';
                    }
                }
            });
            updateMessageStats();
        });
        
        messageDiv.style.cursor = 'pointer';
        messageDiv.title = 'Click to replay message';
        
        chatContainer.appendChild(messageDiv);
        debugLog(`📋 Message ${index + 1} added to container`);
        
        // Add TTS for new messages
        if (safeMessage && safeMessage !== '[No message]') {
            setTimeout(() => {
                if (!msg.played) {
                    speakText(safeMessage, safeUser, false, (success) => {
                        if (success) {
                            msg.played = true;
                            const indicator = messageDiv.querySelector('.play-indicator');
                            if (indicator) {
                                indicator.textContent = '🔇';
                                indicator.title = 'Already played (click to replay)';
                            }
                            debugLog(`🔊 Message marked as played: ${safeUser}`);
                        }
                    });
                } else {
                    debugLog(`🔊 Skipping already played message: ${safeUser}: ${safeMessage.substring(0, 30)}...`);
                }
            }, index * 200);
        }
    });
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
    updateMessageStats();
    
    debugLog('📋 All messages displayed successfully');
}

// Fetch live chat messages
async function getLiveChatMessages() {
    if (!isAuthenticated) {
        console.error('❌ Not authenticated - cannot fetch messages');
        return;
    }

    if (!currentChannel) {
        console.error('❌ No channel specified');
        return;
    }

    try {
        debugLog('📡 Making fetch request to /api/get-live-chat-messages');
        
        const response = await fetch('/api/get-live-chat-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel_name: currentChannel
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        debugLog('📡 Response received:', data);

        if (data.success && data.messages) {
            debugLog(`📡 Retrieved ${data.messages.length} messages`);
            displayChatMessages(data.messages);
        } else {
            console.error('❌ Failed to get messages:', data.error || 'Unknown error');
        }

    } catch (error) {
        console.error('❌ Error fetching live chat messages:', error);
    }
}

// Start chat polling
function startChatPolling() {
    if (isPollingActive) {
        debugLog('📡 Polling already active');
        return;
    }
    
    debugLog('📡 Starting chat polling...');
    isPollingActive = true;
    
    // Initial fetch
    getLiveChatMessages();
    
    // Set up polling interval
    pollingInterval = setInterval(() => {
        debugLog('📡 Polling for new messages...');
        getLiveChatMessages();
    }, 5000); // 5 second intervals
    
    updateUI();
}

// Stop chat polling
function stopChatPolling() {
    debugLog('📡 Stopping chat polling...');
    isPollingActive = false;
    
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    updateUI();
}

// Update UI state
function updateUI() {
    const startPollingBtn = document.getElementById('startBtn');
    const stopPollingBtn = document.getElementById('stopBtn');
    
    if (startPollingBtn) {
        startPollingBtn.style.display = isPollingActive ? 'none' : 'inline-block';
        startPollingBtn.disabled = !isAuthenticated || !currentChannel;
    }
    
    if (stopPollingBtn) {
        stopPollingBtn.style.display = isPollingActive ? 'inline-block' : 'none';
    }
    
    // Update channel from input
    if (channelInput && channelInput.value.trim()) {
        currentChannel = channelInput.value.trim();
    }
}

// Status check
async function checkStatus() {
    try {
        const response = await fetch('/status');
        const data = await response.json();
        
        if (statusDisplay) {
            statusDisplay.innerHTML = `
                <div class="status-item">
                    <strong>Status:</strong> ${data.status || 'unknown'}
                </div>
                <div class="status-item">
                    <strong>Server Time:</strong> ${data.server_time || 'unknown'}
                </div>
                <div class="status-item">
                    <strong>Authentication:</strong> ${isAuthenticated ? 'Authenticated' : 'Not authenticated'}
                </div>
                <div class="status-item">
                    <strong>Polling:</strong> ${isPollingActive ? 'Active' : 'Inactive'}
                </div>
            `;
        }
        
        console.log('✅ Status check completed:', data);
    } catch (error) {
        console.error('❌ Status check failed:', error);
        if (statusDisplay) {
            statusDisplay.innerHTML = '<div class="status-error">Status check failed</div>';
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    // Main control buttons
    if (startBtn) {
        startBtn.addEventListener('click', function() {
            debugLog('🎯 Start button clicked');
            updateUI(); // Update channel from input
            if (isAuthenticated && currentChannel) {
                startChatPolling();
            } else {
                alert('Please authenticate and enter a channel name first');
            }
        });
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            debugLog('🎯 Stop button clicked');
            stopChatPolling();
        });
    }
    
    if (statusBtn) {
        statusBtn.addEventListener('click', function() {
            debugLog('🎯 Status button clicked');
            checkStatus();
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            window.location.href = '/logout';
        });
    }
    
    // Channel input
    if (channelInput) {
        channelInput.addEventListener('input', function() {
            currentChannel = this.value.trim();
            updateUI();
        });
    }
    
    // Debug toggle button
    const debugToggleBtn = document.getElementById('debugToggleBtn');
    if (debugToggleBtn) {
        debugToggleBtn.addEventListener('click', toggleDebugMode);
    }
    
    // Setup TTS controls
    setupTTSControls();
    
    // Initially hide debug buttons
    const debugButtons = document.querySelector('.debug-buttons');
    if (debugButtons) {
        debugButtons.style.display = 'none';
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM loaded, initializing app...');
    
    checkAuthenticationStatus();
    setupEventListeners();
    updateUI();
    
    // Set default channel if available
    if (channelInput && channelInput.value) {
        currentChannel = channelInput.value.trim();
    }
});

// Socket.IO event handlers
socket.on('connect', function() {
    console.log('🔌 Connected to server');
});

socket.on('disconnect', function() {
    console.log('🔌 Disconnected from server');
});

socket.on('chatMessage', function(message) {
    debugLog('💬 Chat message received via socket:', message);
    // Handle real-time messages if needed
});