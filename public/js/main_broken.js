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

// State management
let isMonitoring = false;
let currentChannel = '';
let messages = [];
let isAuthenticated = false;
let debugMode = false; // Set to false for production
let pollingIntervalMs = 30000; // 30 seconds to reduce API calls
let isPollingActive = false;
let pollingInterval;

// TTS Management
let ttsQueue = [];
let isSpeaking = false;
let ttsCount = 0;
let replayCount = 0;
let speechSynthesis = window.speechSynthesis;

// Message tracking to prevent duplicates and manage played state
let displayedMessageCount = 0;
let displayedMessages = new Map(); // Track messages by ID to preserve played state

// Check initial authentication status
function checkAuthenticationStatus() {
    const authBadge = document.querySelector('.status-badge.authenticated');
    const loginBtn = document.getElementById('loginBtn');
    
    isAuthenticated = authBadge !== null && loginBtn === null;
    debugLog('🔍 Authentication status checked:', isAuthenticated);
    return isAuthenticated;
}

// Debug helper functions
function debugLog(...args) {
    if (debugMode) console.log(...args);
}

function toggleDebugMode() {
    const debugButtons = document.querySelector('.debug-buttons');
    const debugToggleBtn = document.getElementById('debugToggleBtn');
    
    debugMode = !debugMode; // Toggle the state
    
    if (debugButtons) {
        debugButtons.style.display = debugMode ? 'block' : 'none';
    }
    
    if (debugToggleBtn) {
        debugToggleBtn.textContent = debugMode ? '🐛 Hide Debug Tools' : '🔧 Show Debug Tools';
        debugToggleBtn.className = debugMode ? 'btn btn-warning' : 'btn btn-secondary';
    }
    
    debugLog('🐛 Debug mode:', debugMode ? 'enabled' : 'disabled');
}
    const debugButtons = document.querySelector('.debug-buttons');
    const debugToggleBtn = document.getElementById('debugToggleBtn');
    
    if (debugButtons) {
        debugButtons.style.display = debugMode ? 'block' : 'none';
    }
    
    if (debugToggleBtn) {
        debugToggleBtn.textContent = debugMode ? '🐛 Hide Debug Tools' : '🔧 Show Debug Tools';
        debugToggleBtn.className = debugMode ? 'btn btn-warning' : 'btn btn-secondary';
    }
    
    debugLog('🐛 Debug mode:', debugMode ? 'enabled' : 'disabled');
    debugMode = !debugMode;
    console.log(`🐛 Debug mode ${debugMode ? 'ENABLED' : 'DISABLED'}`);
    
    // Show/hide debug section
    const debugSection = document.getElementById('debugSection');
    const debugButtonGroup = document.getElementById('debugButtonGroup');
    
    if (debugSection) {
        debugSection.style.display = debugMode ? 'block' : 'none';
    }
    if (debugButtonGroup) {
        debugButtonGroup.style.display = debugMode ? 'block' : 'none';
    }
    
    return debugMode;
}

// Utility functions
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

// TTS functionality
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

// Display chat messages with duplicate prevention
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
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        messageDiv.dataset.messageId = msg.id;
        
        const userStyle = msg.color ? `style="color: ${msg.color};"` : '';
        
        const badges = (msg.badges || []).map(badge => 
            `<span class="badge badge-${badge.type}">${badge.text || badge.type}</span>`
        ).join(' ');
        
        const formattedTime = formatTimestamp(msg.timestamp);
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
        
        chatContainer.appendChild(messageDiv);
        
        // Auto-play new messages only once
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

// Fetch chat messages from server
async function fetchChatMessages(channelName) {
    try {
        debugLog('📡 Making fetch request to /api/get-live-chat-messages');
        
        const response = await fetch('/api/get-live-chat-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        debugLog('📡 Server response:', data);
        
        if (data.success && data.messages && data.messages.length > 0) {
            debugLog(`📡 Received ${data.messages.length} messages`);
            displayChatMessages(data.messages);
        } else {
            debugLog('📡 No new messages or empty response');
        }
        
    } catch (error) {
        console.error('❌ Error fetching messages:', error);
    }
}

// Start chat polling with controlled frequency
async function startChatPolling(channelName) {
    console.log(`🚀 Starting live chat polling for: ${channelName}`);
    isPollingActive = true;
    
    const startPollingBtn = document.getElementById('startPollingBtn');
    const stopPollingBtn = document.getElementById('stopPollingBtn');
    
    if (startPollingBtn) startPollingBtn.style.display = 'none';
    if (stopPollingBtn) stopPollingBtn.style.display = 'inline-block';
    
    // Initial fetch
    await fetchChatMessages(channelName);
    
    // Set up controlled interval (30 seconds to reduce API load)
    pollingInterval = setInterval(async () => {
        if (!isPollingActive) {
            stopChatPolling();
            return;
        }
        await fetchChatMessages(channelName);
    }, pollingIntervalMs);
}

// Fetch chat messages from server
async function fetchChatMessages(channelName) {
    try {
        debugLog(`📡 Fetching messages for channel: ${channelName}`);
        
        const response = await fetch('/api/get-live-chat-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ channel_name: channelName })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        debugLog('📨 Server response:', data);

        if (data.success && data.messages && data.messages.length > 0) {
            displayChatMessages(data.messages);
            debugLog(`✅ Displayed ${data.messages.length} messages`);
        } else {
            debugLog('📭 No messages received from server');
        }

        return data;
        
    } catch (error) {
        console.error('❌ Error fetching chat messages:', error);
        const chatContainer = document.getElementById('liveChatMessages');
        if (chatContainer && !chatContainer.querySelector('.error-message')) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error-message';
            errorMsg.textContent = `Error: ${error.message}`;
            chatContainer.appendChild(errorMsg);
        }
        return null;
    }
}
}
    pollingInterval = setInterval(async () => {
        if (!isPollingActive) {
            stopChatPolling();
            return;
        }
        await fetchChatMessages(channelName);
    }, pollingIntervalMs);
}

// Stop chat polling
function stopChatPolling() {
    console.log('🛑 Stopping live chat polling...');
    isPollingActive = false;
    
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    const startPollingBtn = document.getElementById('startPollingBtn');
    const stopPollingBtn = document.getElementById('stopPollingBtn');
    
    if (startPollingBtn) startPollingBtn.style.display = 'inline-block';
    if (stopPollingBtn) stopPollingBtn.style.display = 'none';
}

// Set up event listeners
function setupEventListeners() {
    // OAuth login
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.location.href = '/auth/kick';
        });
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.location.href = '/logout';
        });
    }
    
    // Debug toggle button
    const debugToggleBtn = document.getElementById('debugToggleBtn');
    if (debugToggleBtn) {
        debugToggleBtn.addEventListener('click', () => {
            toggleDebugMode();
        });
    }
    
    // Main monitoring controls
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            const channel = document.getElementById('channelInput')?.value || 'HolesomeGamer';
            if (channel) {
                currentChannel = channel;
                isMonitoring = true;
                await startChatPolling(channel);
                updateUI();
                console.log(`🚀 Started monitoring: ${channel}`);
            } else {
                alert('Please enter a channel name');
            }
        });
    }
    
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            stopChatPolling();
            isMonitoring = false;
            updateUI();
            console.log('🛑 Stopped monitoring');
        });
    }
    
    const statusBtn = document.getElementById('statusBtn');
    if (statusBtn) {
        statusBtn.addEventListener('click', () => {
            const status = isMonitoring ? `Monitoring ${currentChannel}` : 'Not monitoring';
            const polling = isPollingActive ? 'Polling active' : 'Polling inactive';
            alert(`Status: ${status}\nPolling: ${polling}\nMessages: ${displayedMessageCount}`);
        });
    }
    
    // TTS Live chat polling controls  
    const startPollingBtn = document.getElementById('startPollingBtn');
    if (startPollingBtn) {
        startPollingBtn.addEventListener('click', async () => {
            const channel = document.getElementById('channelInput')?.value || 'HolesomeGamer';
            if (channel) {
                currentChannel = channel;
                await startChatPolling(channel);
            } else {
                alert('Please enter a channel name');
            }
        });
    }
    
    // Stop live chat monitoring
    const stopPollingBtn = document.getElementById('stopPollingBtn');
    if (stopPollingBtn) {
        stopPollingBtn.addEventListener('click', () => {
            stopChatPolling();
        });
    }
    
    // TTS controls
    setupTTSControls();
    
    // Debug toggle (hidden in production)
    if (debugMode) {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                toggleDebugMode();
            }
        });
    }
}

// Set up TTS controls
function setupTTSControls() {
    const ttsSpeedSlider = document.getElementById('ttsSpeed');
    const speedValueSpan = document.getElementById('speedValue');
    const pollingIntervalSlider = document.getElementById('pollingInterval');
    const intervalValueSpan = document.getElementById('intervalValue');
    const debugCheckbox = document.getElementById('debugMode');
    
    if (ttsSpeedSlider && speedValueSpan) {
        ttsSpeedSlider.addEventListener('input', function() {
            speedValueSpan.textContent = parseFloat(this.value).toFixed(1);
        });
    }
    
    if (pollingIntervalSlider && intervalValueSpan) {
        pollingIntervalSlider.addEventListener('input', function() {
            const newInterval = parseInt(this.value) * 1000;
            pollingIntervalMs = newInterval;
            intervalValueSpan.textContent = `${this.value}s`;
            
            // Restart polling with new interval if currently active
            if (isPollingActive && currentChannel) {
                stopChatPolling();
                setTimeout(() => startChatPolling(currentChannel), 1000);
            }
        });
    }
    
    // Debug mode checkbox
    if (debugCheckbox) {
        debugCheckbox.addEventListener('change', function() {
            debugMode = this.checked;
            toggleDebugMode();
        });
    }
}

// Update UI elements
function updateUI() {
    // Update authentication-dependent elements
    const authElements = document.querySelectorAll('[data-requires-auth]');
    authElements.forEach(el => {
        el.style.display = isAuthenticated ? 'block' : 'none';
    });
    
    // Update monitoring state
    const statusEl = document.getElementById('statusDisplay');
    if (statusEl) {
        statusEl.textContent = isMonitoring ? 
            `Monitoring: ${currentChannel}` : 
            'Not monitoring';
        statusEl.className = isMonitoring ? 'status-active' : 'status-inactive';
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM loaded, initializing Kick2TTS...');
    
    checkAuthenticationStatus();
    setupEventListeners();
    updateUI();
    
    // Initial message stats
    updateMessageStats();
    
    console.log('✅ App initialization complete');
});

// Global error handler
window.addEventListener('error', function(e) {
    console.error('🚨 Global error:', e.error);
});

// Export functions for debugging (only in debug mode)
if (debugMode) {
    window.kickChat = {
        toggleDebug: toggleDebugMode,
        startPolling: startChatPolling,
        stopPolling: stopChatPolling,
        fetchMessages: fetchChatMessages
    };
}