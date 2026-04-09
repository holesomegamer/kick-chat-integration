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
let startMonitoringTimestamp = null; // Timestamp when monitoring started

// TTS variables
let ttsQueue = [];
let isSpeaking = false;
let ttsCount = 0;
let replayCount = 0;
let speechSynthesis = window.speechSynthesis;
let displayedMessageCount = 0;
let displayedMessages = new Map(); // Track displayed messages by ID

const TTS_COMMANDS = new Set(['tts', 'custom1', 'custom2']);
const TTS_VOICE_PROFILES = {
    default: { pitch: 1.0, rateMultiplier: 1.0 },
    custom1: { pitch: 0.7, rateMultiplier: 0.95 },
    custom2: { pitch: 1.35, rateMultiplier: 1.08 }
};

function hashVoiceTag(tag) {
    const text = String(tag || 'default');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function getVoiceProfile(voice) {
    if (TTS_VOICE_PROFILES[voice]) {
        return TTS_VOICE_PROFILES[voice];
    }

    const hash = hashVoiceTag(voice);
    const pitch = 0.85 + (hash % 40) / 100;
    const rateMultiplier = 0.9 + ((hash >> 4) % 25) / 100;

    return {
        pitch: Math.max(0.6, Math.min(1.5, pitch)),
        rateMultiplier: Math.max(0.8, Math.min(1.2, rateMultiplier))
    };
}

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

function getTTSDirective(msg) {
    if (msg && msg.ttsEligible === true && typeof msg.ttsText === 'string') {
        const parsedText = msg.ttsText.trim();
        const requestedVoice = typeof msg.ttsVoice === 'string' && msg.ttsVoice.trim().length > 0
            ? msg.ttsVoice.trim().toLowerCase()
            : 'default';
        return {
            eligible: parsedText.length > 0,
            text: parsedText,
            voice: requestedVoice
        };
    }

    const rawText = typeof msg?.message === 'string' ? msg.message.trim() : '';
    const match = rawText.match(/^!(\w+)\s+([\s\S]+)$/i);
    const command = match?.[1]?.toLowerCase();
    const parsedText = match?.[2]?.trim() || '';
    if (command && (TTS_COMMANDS.has(command) || command.length > 0) && parsedText.length > 0) {
        const requestedVoice = command === 'tts' ? 'default' : command;
        return {
            eligible: true,
            text: parsedText,
            voice: requestedVoice
        };
    }

    return {
        eligible: false,
        text: '',
        voice: 'default'
    };
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

function isProviderCustomVoice(voice) {
    return voice !== 'default' && voice !== 'custom1' && voice !== 'custom2';
}

async function playProviderVoiceAudio(text, voice) {
    const response = await fetch('/api/tts/custom', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            voiceTag: voice,
            text
        })
    });

    if (!response.ok) {
        let serverMessage = 'Failed to synthesize custom voice audio.';
        try {
            const payload = await response.json();
            if (payload?.error) {
                serverMessage = payload.error;
            }
        } catch (_error) {
            // Ignore JSON parse errors and keep fallback message.
        }
        throw new Error(serverMessage);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);

        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            resolve();
        };

        audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            reject(new Error(`Audio playback failed for !${voice}.`));
        };

        audio.play().catch((error) => {
            URL.revokeObjectURL(audioUrl);
            reject(error);
        });
    });
}

// TTS Functions
function speakText(text, username, voice = 'default', forceReplay = false, onComplete = null) {
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

    if (isProviderCustomVoice(voice)) {
        const customVoiceTask = async () => {
            isSpeaking = true;
            try {
                debugLog(`🎙️ Requesting provider voice !${voice} for: ${cleanText.substring(0, 50)}...`);
                await playProviderVoiceAudio(cleanText, voice);
                isSpeaking = false;
                ttsCount++;
                updateMessageStats();
                if (onComplete) onComplete(true);
            } catch (error) {
                console.error('Custom voice playback error:', error.message || error);
                isSpeaking = false;
                if (onComplete) onComplete(false);
            } finally {
                processNextInTTSQueue();
            }
        };

        if (isSpeaking) {
            ttsQueue.push(customVoiceTask);
            debugLog(`🎙️ Added provider voice task to queue: ${voice} (queue length: ${ttsQueue.length})`);
        } else {
            customVoiceTask();
        }
        return;
    }

    const voiceProfile = getVoiceProfile(voice);
    const adjustedRate = Math.max(0.5, Math.min(2, ttsSpeed * voiceProfile.rateMultiplier));
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = adjustedRate;
    utterance.pitch = voiceProfile.pitch;
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
        const nextEntry = ttsQueue.shift();

        if (typeof nextEntry === 'function') {
            nextEntry();
            return;
        }

        speechSynthesis.speak(nextEntry);
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

function renderMonitoringStatus() {
    if (!statusDisplay) {
        return;
    }

    if (isPollingActive && currentChannel) {
        statusDisplay.innerHTML = `<span class="status-indicator monitoring">🟢 Monitoring: ${escapeHtml(currentChannel)}</span>`;
        return;
    }

    statusDisplay.innerHTML = '<span class="status-indicator stopped">🔴 Not Monitoring</span>';
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
    debugLog('📋 displayChatMessages called with:', messages?.length, 'messages');
    
    if (messages && messages.length > 0) {
        debugLog('📋 First message ID:', messages[0].id, 'played:', messages[0].played);
    }
    
    const chatContainer = document.getElementById('liveChatMessages');
    if (!chatContainer) {
        console.error('❌ liveChatMessages container not found!');
        return;
    }

    if (!messages || messages.length === 0) {
        debugLog('📋 No messages to display');
        chatContainer.innerHTML = '<div class="no-messages">💬 No chat messages found...</div>';
        return;
    }

    // Clean up old messages from memory (keep only last 50)
    if (displayedMessages.size > 50) {
        const oldIds = Array.from(displayedMessages.keys()).slice(0, displayedMessages.size - 50);
        oldIds.forEach(id => displayedMessages.delete(id));
        debugLog('🧹 Cleaned up old message tracking, now have:', displayedMessages.size, 'tracked messages');
    }

    // Process messages and identify truly NEW ones (never seen before)
    let newMessages = [];
    let existingMessages = 0;
    
    messages.forEach(msg => {
        if (displayedMessages.has(msg.id)) {
            // This message was seen before - preserve its played status
            const existingMsg = displayedMessages.get(msg.id);
            msg.played = existingMsg.played; 
            existingMessages++;
            debugLog(`📋 EXISTING message ${msg.id}: played=${msg.played}`);
        } else {
            // This is a truly NEW message - mark for auto-play
            msg.played = false;
            newMessages.push(msg);
            debugLog(`📋 NEW message ${msg.id}: will auto-play`);
        }
        // Always update the map with current message object
        displayedMessages.set(msg.id, msg);
    });
    
    debugLog(`📋 Message summary: ${newMessages.length} NEW for auto-play, ${existingMessages} existing (${displayedMessages.size} total tracked)`);
    
    // Reverse messages to show oldest first (natural chat flow)
    const orderedMessages = [...messages].reverse();
    debugLog(`📋 Reversed ${messages.length} messages for chronological display`);
    
    // Clear container and rebuild display
    chatContainer.innerHTML = '';
    displayedMessageCount = messages.length;
    
    orderedMessages.forEach((msg, index) => {
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
        const ttsDirective = getTTSDirective(msg);
        const playedIndicator = !ttsDirective.eligible ? '⏭' : (msg.played ? '🔇' : '🔊');
        const indicatorTitle = !ttsDirective.eligible
            ? 'Ignored for auto TTS (requires !tts command)'
            : (msg.played ? 'Already played (click to replay)' : 'Not yet played');
        
        messageDiv.innerHTML = `
            <span class="chat-user" ${userStyle}>${escapeHtml(safeUser)}</span>
            ${badges}
            <span class="chat-text">${escapeHtml(safeMessage)}</span>
            <span class="play-indicator" title="${indicatorTitle}">${playedIndicator}</span>
            <span class="chat-timestamp">${formattedTime}</span>
        `;
        
        // Add click handler for manual replay
        messageDiv.addEventListener('click', () => {
            if (!ttsDirective.eligible) {
                debugLog(`🔊 Manual replay skipped (no !tts command): ${safeUser}: ${safeMessage}`);
                return;
            }

            debugLog(`🔊 Manual replay requested for: ${safeUser}: ${safeMessage}`);
            replayCount++;
            
            const indicator = messageDiv.querySelector('.play-indicator');
            if (indicator) {
                indicator.textContent = '🔄';
                indicator.title = 'Playing...';
            }
            
            speakText(ttsDirective.text, safeUser, ttsDirective.voice, true, (success) => {
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
        
        // Add TTS for ONLY truly NEW messages (never seen before)
        if (safeMessage && safeMessage !== '[No message]') {
            const isNewMessage = newMessages.some(newMsg => newMsg.id === msg.id);
            if (isNewMessage && !msg.played && ttsDirective.eligible) {
                setTimeout(() => {
                    debugLog(`🔊 AUTO-PLAYING NEW message: ${safeUser}: ${ttsDirective.text.substring(0, 30)}...`);
                    speakText(ttsDirective.text, safeUser, ttsDirective.voice, false, (success) => {
                        if (success) {
                            msg.played = true;
                            // Update the message in the displayedMessages Map
                            displayedMessages.set(msg.id, msg);
                            
                            const indicator = messageDiv.querySelector('.play-indicator');
                            if (indicator) {
                                indicator.textContent = '🔇';
                                indicator.title = 'Already played (click to replay)';
                            }
                            debugLog(`🔊 Message marked as played: ${safeUser}`);
                        }
                    });
                }, index * 200); // Stagger auto-play timing
            } else {
                debugLog(`🔊 SKIPPING auto-play for message ${msg.id}: isNew=${isNewMessage}, played=${msg.played}, eligible=${ttsDirective.eligible}`);
            }
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
        
        const requestBody = {
            channel_name: currentChannel
        };
        
        // Include timestamp filter if monitoring is active
        if (startMonitoringTimestamp) {
            requestBody.since_timestamp = startMonitoringTimestamp;
            debugLog('📅 Requesting messages since:', startMonitoringTimestamp);
        }
        
        const response = await fetch('/api/get-live-chat-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
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
    
    // Set timestamp for filtering new messages only
    startMonitoringTimestamp = new Date().toISOString();
    debugLog('📅 Start monitoring timestamp:', startMonitoringTimestamp);
    
    // Clear previous messages to start fresh
    const chatContainer = document.getElementById('liveChatMessages');
    if (chatContainer) {
        chatContainer.innerHTML = '<div class="no-messages">📡 Monitoring started - waiting for new messages...</div>';
    }
    
    // Initial fetch
    getLiveChatMessages();
    
    // Set up polling interval
    pollingInterval = setInterval(() => {
        debugLog('📡 Polling for new messages...');
        getLiveChatMessages();
    }, 2000); // 2 second intervals for faster real-time updates
    
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
    
    // Reset monitoring timestamp
    startMonitoringTimestamp = null;
    debugLog('📅 Monitoring timestamp reset');
    
    updateUI();
}

// Update UI state
function updateUI() {
    const startPollingBtn = document.getElementById('startBtn');
    const stopPollingBtn = document.getElementById('stopBtn');

    // Keep currentChannel in sync before computing button state.
    if (channelInput && channelInput.value.trim()) {
        currentChannel = channelInput.value.trim();
    }
    
    if (startPollingBtn) {
        startPollingBtn.style.display = isPollingActive ? 'none' : 'inline-block';
        startPollingBtn.disabled = !isAuthenticated || !currentChannel;
    }
    
    if (stopPollingBtn) {
        stopPollingBtn.style.display = isPollingActive ? 'inline-block' : 'none';
    }

    renderMonitoringStatus();
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
    
    // OAuth login button  
    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            window.location.href = '/auth/kick';
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