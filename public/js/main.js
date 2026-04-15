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
const chatProcessingIndicator = document.getElementById('chatProcessingIndicator');
const chatProcessingText = document.getElementById('chatProcessingText');
const ttsProcessingIndicator = document.getElementById('ttsProcessingIndicator');
const ttsProcessingText = document.getElementById('ttsProcessingText');
const activityDock = document.getElementById('activityDock');

// Moderation DOM elements
const enableBanListCheckbox = document.getElementById('enableBanList');
const enablePermissionFilterCheckbox = document.getElementById('enablePermissionFilter');
const permissionModeSelect = document.getElementById('permissionModeSelect');
const banUsernameInput = document.getElementById('banUsernameInput');
const addBanBtn = document.getElementById('addBanBtn');
const banListContainer = document.getElementById('banList');
const saveModerationSettingsBtn = document.getElementById('saveModerationSettingsBtn');
const loadModerationSettingsBtn = document.getElementById('loadModerationSettingsBtn');

// State variables
let isMonitoring = false;
let currentChannel = '';
let messages = [];
let isAuthenticated = false;
let isPollingActive = false;
let debugMode = false;
let pollingInterval = null;
let startMonitoringTimestamp = null; // Timestamp when monitoring started
let activeChatFetchRequests = 0;
let activeTtsGenerationRequests = 0;

// TTS variables
let ttsQueue = [];
let isSpeaking = false;
let ttsCount = 0;
let replayCount = 0;
let speechSynthesis = window.speechSynthesis;
let displayedMessageCount = 0;
let displayedMessages = new Map(); // Track displayed messages by ID
let activeProviderAudio = null;
let manualTTSQueue = [];
let lastSpokenMessage = null;
let ttsMode = 'autoplay';
let ttsTriggerMode = 'chat_commands';
let channelPointsRewardTitle = 'Test-tts';
let modeSpeedMultipliers = {
    autoplay: 1,
    manual: 1,
    hybrid: 1
};
let lastTriggerModeChangeTime = 0; // Track when user last changed trigger mode

// Moderation state variables
let moderationSettings = {
    banList: [],
    permissionMode: 'all',
    enableBanList: true,
    enablePermissionFilter: false
};

const TTS_COMMANDS = new Set(['tts', 'custom1', 'custom2']);
const TTS_VOICE_PROFILES = {
    default: { pitch: 1.0, rateMultiplier: 1.0 },
    custom1: { pitch: 0.7, rateMultiplier: 0.95 },
    custom2: { pitch: 1.35, rateMultiplier: 1.08 }
};
const HYBRID_AUTO_BADGES = new Set(['broadcaster', 'moderator', 'vip', 'staff']);
const TTS_MODE_DESCRIPTIONS = {
    autoplay: 'Autoplay mode reads all eligible new messages automatically.',
    manual: 'Manual mode queues eligible messages and only plays when you trigger playback.',
    hybrid: 'Hybrid mode autoplays broadcaster/mod/vip messages and queues the rest for manual playback.'
};
const TTS_TRIGGER_MODE_DESCRIPTIONS = {
    chat_commands: 'Chat commands are currently the only accepted trigger.',
    channel_points: 'Only matching channel point redemptions with text input will trigger TTS.',
    both: 'Chat commands and matching channel point redemptions will both trigger TTS.'
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

function getToggleButtonState(buttonOrId, fallback = false) {
    const button = typeof buttonOrId === 'string'
        ? document.getElementById(buttonOrId)
        : buttonOrId;

    if (!button) {
        return fallback;
    }

    return button.dataset.enabled === 'true';
}

function setToggleButtonState(buttonOrId, enabled, options = {}) {
    const button = typeof buttonOrId === 'string'
        ? document.getElementById(buttonOrId)
        : buttonOrId;

    if (!button) {
        return;
    }

    const onText = options.onText || 'Enabled';
    const offText = options.offText || 'Disabled';
    const nextState = Boolean(enabled);

    button.dataset.enabled = String(nextState);
    button.setAttribute('aria-pressed', nextState ? 'true' : 'false');
    button.classList.toggle('is-on', nextState);
    button.classList.toggle('is-off', !nextState);
    button.textContent = nextState ? onText : offText;
}

function syncToggleButtons() {
    setToggleButtonState('ttsEnabled', getToggleButtonState('ttsEnabled', true), {
        onText: 'Enabled',
        offText: 'Disabled'
    });
    setToggleButtonState('ttsMuted', getToggleButtonState('ttsMuted', false), {
        onText: 'Mute',
        offText: 'Mute'
    });
    setToggleButtonState('enableBanList', moderationSettings.enableBanList, {
        onText: 'Enabled',
        offText: 'Disabled'
    });
    setToggleButtonState('enablePermissionFilter', moderationSettings.enablePermissionFilter, {
        onText: 'Enabled',
        offText: 'Disabled'
    });
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

function setChatProcessingState(isProcessing) {
    if (!chatProcessingIndicator) {
        return;
    }

    chatProcessingIndicator.classList.toggle('active', isProcessing);
    chatProcessingIndicator.style.display = isProcessing ? 'flex' : 'none';

    if (chatProcessingText) {
        chatProcessingText.textContent = isProcessing
            ? 'Processing new chat messages...'
            : 'Chat processing idle';
    }

    updateActivityDockVisibility();
}

function setTtsProcessingState(isProcessing, voiceTag = null) {
    if (!ttsProcessingIndicator) {
        return;
    }

    ttsProcessingIndicator.classList.toggle('active', isProcessing);
    ttsProcessingIndicator.style.display = isProcessing ? 'flex' : 'none';

    if (ttsProcessingText) {
        if (isProcessing) {
            const normalizedVoice = String(voiceTag || '').trim();
            ttsProcessingText.textContent = normalizedVoice
                ? `Generating voice !${normalizedVoice}...`
                : 'Waiting for TTS generation...';
        } else {
            ttsProcessingText.textContent = 'TTS generation idle';
        }
    }

    updateActivityDockVisibility();
}

function updateActivityDockVisibility() {
    if (!activityDock) {
        return;
    }

    const hasActivity = activeChatFetchRequests > 0 || activeTtsGenerationRequests > 0;
    activityDock.style.display = hasActivity ? 'block' : 'none';
}

// Moderation functions
async function loadModerationSettings() {
    try {
        const response = await fetch('/api/moderation/settings');
        const data = await response.json();
        
        if (data.success) {
            moderationSettings = data.settings;
            updateModerationUI();
            debugLog('✅ Moderation settings loaded:', moderationSettings);
        } else {
            debugLog('❌ Failed to load moderation settings:', data.error);
        }
    } catch (error) {
        debugLog('❌ Error loading moderation settings:', error);
    }
}

async function saveModerationSettings() {
    try {
        const response = await fetch('/api/moderation/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                permissionMode: moderationSettings.permissionMode,
                enableBanList: moderationSettings.enableBanList,
                enablePermissionFilter: moderationSettings.enablePermissionFilter
            })
        });
        
        const data = await response.json();
        if (data.success) {
            debugLog('✅ Moderation settings saved');
            showStatusMessage('Moderation settings saved successfully');
        } else {
            debugLog('❌ Failed to save moderation settings:', data.error);
            showStatusMessage('Failed to save moderation settings: ' + data.error, 'error');
        }
    } catch (error) {
        debugLog('❌ Error saving moderation settings:', error);
        showStatusMessage('Error saving moderation settings', 'error');
    }
}

async function banUser(username) {
    try {
        const response = await fetch('/api/moderation/ban', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username })
        });
        
        const data = await response.json();
        if (data.success) {
            moderationSettings.banList = data.banList;
            updateBanListDisplay();
            debugLog(`✅ Banned user: ${username}`);
            showStatusMessage(`User ${username} has been banned`);
        } else {
            debugLog('❌ Failed to ban user:', data.error);
            showStatusMessage('Failed to ban user: ' + data.error, 'error');
        }
    } catch (error) {
        debugLog('❌ Error banning user:', error);
        showStatusMessage('Error banning user', 'error');
    }
}

async function unbanUser(username) {
    try {
        const response = await fetch(`/api/moderation/ban/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            moderationSettings.banList = data.banList;
            updateBanListDisplay();
            debugLog(`✅ Unbanned user: ${username}`);
            showStatusMessage(`User ${username} has been unbanned`);
        } else {
            debugLog('❌ Failed to unban user:', data.error);
            showStatusMessage('Failed to unban user: ' + data.error, 'error');
        }
    } catch (error) {
        debugLog('❌ Error unbanning user:', error);
        showStatusMessage('Error unbanning user', 'error');
    }
}

function updateModerationUI() {
    setToggleButtonState(enableBanListCheckbox, moderationSettings.enableBanList, {
        onText: 'Enabled',
        offText: 'Disabled'
    });
    setToggleButtonState(enablePermissionFilterCheckbox, moderationSettings.enablePermissionFilter, {
        onText: 'Enabled',
        offText: 'Disabled'
    });
    if (permissionModeSelect) permissionModeSelect.value = moderationSettings.permissionMode;
    updateBanListDisplay();
}

function updateBanListDisplay() {
    if (!banListContainer) return;
    
    if (moderationSettings.banList.length === 0) {
        banListContainer.innerHTML = '<p class="ban-list-empty">No banned users</p>';
    } else {
        const bannedUsersHtml = moderationSettings.banList.map(username => `
            <div class="banned-user">
                <span class="username">${escapeHtml(username)}</span>
                <button class="unban-btn" onclick="unbanUser('${escapeHtml(username)}')">Unban</button>
            </div>
        `).join('');
        banListContainer.innerHTML = bannedUsersHtml;
    }
}

function showStatusMessage(message, type = 'success') {
    // Create or update a status message element
    let statusEl = document.getElementById('moderation-status-message');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'moderation-status-message';
        statusEl.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1000; 
            padding: 12px 16px; border-radius: 4px; font-weight: bold;
            ${type === 'error' ? 'background: #dc3545; color: white;' : 'background: #28a745; color: white;'}
        `;
        document.body.appendChild(statusEl);
    }
    
    statusEl.textContent = message;
    statusEl.className = type;
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (statusEl && statusEl.parentNode) {
            statusEl.parentNode.removeChild(statusEl);
        }
    }, 3000);
}

function getTTSDirective(msg) {
    // First, check if this is a pre-processed channel point redemption or TTS-eligible message
    if (msg && msg.ttsEligible === true && typeof msg.ttsText === 'string') {
        const parsedText = msg.ttsText.trim();
        const requestedVoice = typeof msg.ttsVoice === 'string' && msg.ttsVoice.trim().length > 0
            ? msg.ttsVoice.trim().toLowerCase()
            : 'default';
        debugLog(`🎟️ Channel point redemption TTS directive - eligible: ${parsedText.length > 0}, text: "${parsedText}", voice: ${requestedVoice}`);
        return {
            eligible: parsedText.length > 0,
            text: parsedText,
            voice: requestedVoice
        };
    }

    // If we're in channel_points mode and this isn't a pre-processed message,
    // then it's a regular chat message and should be ignored
    if (ttsTriggerMode === 'channel_points') {
        debugLog(`💬 Regular chat message ignored (channel_points mode): "${msg?.message}"`);
        return {
            eligible: false,
            text: '',
            voice: 'default'
        };
    }

    // Handle regular chat commands (only when in chat_commands or both mode)
    const rawText = typeof msg?.message === 'string' ? msg.message.trim() : '';
    const match = rawText.match(/^!(\w+)\s+([\s\S]+)$/i);
    const command = match?.[1]?.toLowerCase();
    const parsedText = match?.[2]?.trim() || '';
    if (command && (TTS_COMMANDS.has(command) || command.length > 0) && parsedText.length > 0) {
        const requestedVoice = command === 'tts' ? 'default' : command;
        debugLog(`💬 Chat command TTS directive - eligible: true, command: !${command}, text: "${parsedText}", voice: ${requestedVoice}`);
        return {
            eligible: true,
            text: parsedText,
            voice: requestedVoice
        };
    }

    debugLog(`❌ No TTS directive found for message: "${rawText}" (mode: ${ttsTriggerMode})`);
    return {
        eligible: false,
        text: '',
        voice: 'default'
    };
}

function normalizeBadgeType(badge) {
    if (!badge) {
        return '';
    }

    if (typeof badge === 'string') {
        return badge.toLowerCase();
    }

    if (typeof badge.type === 'string') {
        return badge.type.toLowerCase();
    }

    if (typeof badge.name === 'string') {
        return badge.name.toLowerCase();
    }

    return '';
}

function isHybridPriorityMessage(msg) {
    const badges = Array.isArray(msg?.badges) ? msg.badges : [];
    return badges.some((badge) => HYBRID_AUTO_BADGES.has(normalizeBadgeType(badge)));
}

function shouldAutoplayMessage(msg) {
    if (ttsMode === 'autoplay') {
        return true;
    }

    if (ttsMode === 'manual') {
        return false;
    }

    return isHybridPriorityMessage(msg);
}

function getPlaybackSpeedMultiplier(playbackContext = 'auto') {
    if (playbackContext === 'manual') {
        return modeSpeedMultipliers.manual;
    }

    if (playbackContext === 'hybrid') {
        return modeSpeedMultipliers.hybrid;
    }

    return modeSpeedMultipliers[ttsMode] || 1;
}

function isMessageInManualQueue(messageId) {
    return manualTTSQueue.some((item) => item.id === messageId);
}

function removeMessageFromManualQueue(messageId) {
    const before = manualTTSQueue.length;
    manualTTSQueue = manualTTSQueue.filter((item) => item.id !== messageId);
    if (manualTTSQueue.length !== before) {
        updateMessageStats();
    }
}

function queueMessageForManualPlayback(message, directive) {
    if (!message?.id || !directive?.eligible) {
        return;
    }

    if (isMessageInManualQueue(message.id)) {
        return;
    }

    manualTTSQueue.push({
        id: message.id,
        user: message.user || 'Unknown',
        text: directive.text,
        voice: directive.voice,
        timestamp: message.timestamp || new Date().toISOString()
    });
    updateMessageStats();
}

function playQueuedManualMessage(entry) {
    if (!entry) {
        return;
    }

    replayCount++;
    speakText(entry.text, entry.user, entry.voice, true, null, 'manual');
    updateMessageStats();
}

function playNextManualMessage() {
    if (manualTTSQueue.length === 0) {
        debugLog('🔊 Manual queue is empty');
        return;
    }

    const nextEntry = manualTTSQueue.shift();
    playQueuedManualMessage(nextEntry);
}

function skipCurrentPlayback() {
    if (speechSynthesis) {
        speechSynthesis.cancel();
    }

    if (activeProviderAudio) {
        activeProviderAudio.pause();
        activeProviderAudio.currentTime = 0;
        activeProviderAudio = null;
    }

    isSpeaking = false;
    processNextInTTSQueue();
}

function clearPlaybackQueue() {
    ttsQueue = [];
    manualTTSQueue = [];

    if (speechSynthesis) {
        speechSynthesis.cancel();
    }

    if (activeProviderAudio) {
        activeProviderAudio.pause();
        activeProviderAudio.currentTime = 0;
        activeProviderAudio = null;
    }

    isSpeaking = false;
    updateMessageStats();
}

function replayLastMessage() {
    if (!lastSpokenMessage) {
        debugLog('🔊 No previous spoken message to replay');
        return;
    }

    replayCount++;
    speakText(
        lastSpokenMessage.text,
        lastSpokenMessage.user,
        lastSpokenMessage.voice,
        true,
        null,
        'manual'
    );
    updateMessageStats();
}

function updateModeDescription() {
    const descriptionEl = document.getElementById('ttsModeDescription');
    if (descriptionEl) {
        descriptionEl.textContent = TTS_MODE_DESCRIPTIONS[ttsMode] || TTS_MODE_DESCRIPTIONS.autoplay;
    }
}

function updateTriggerModeDescription() {
    const descriptionEl = document.getElementById('ttsTriggerModeDescription');
    if (descriptionEl) {
        descriptionEl.textContent = TTS_TRIGGER_MODE_DESCRIPTIONS[ttsTriggerMode] || TTS_TRIGGER_MODE_DESCRIPTIONS.chat_commands;
    }
}

function updateChannelPointsStatus(message, isError = false) {
    const statusEl = document.getElementById('channelPointsStatus');
    if (!statusEl) {
        return;
    }

    statusEl.textContent = message;
    statusEl.className = isError ? 'tts-mode-description status-error' : 'tts-mode-description';
}

function applyTtsSettings(settings) {
    if (!settings) {
        return;
    }

    // Don't override trigger mode if user changed it recently (within last 10 seconds)
    const timeSinceUserChange = Date.now() - lastTriggerModeChangeTime;
    const shouldUpdateTriggerMode = timeSinceUserChange > 10000; // 10 seconds
    
    if (shouldUpdateTriggerMode && settings.mode) {
        ttsTriggerMode = settings.mode;
    } else if (!shouldUpdateTriggerMode) {
        debugLog(`🔧 Preserving user's recent trigger mode change (${timeSinceUserChange}ms ago)`);
    }
    
    channelPointsRewardTitle = settings.channelPointsRewardTitle || 'Test-tts';

    const triggerModeSelect = document.getElementById('ttsTriggerModeSelect');
    const rewardTitleInput = document.getElementById('channelPointsRewardTitleInput');

    if (triggerModeSelect && shouldUpdateTriggerMode) {
        triggerModeSelect.value = ttsTriggerMode;
    }

    if (rewardTitleInput) {
        rewardTitleInput.value = channelPointsRewardTitle;
    }

    const subscriptionState = settings.subscriptionStatus || 'not_attempted';
    const webhookLabel = settings.webhookUrl || settings.webhookPath || '/api/kick/webhooks';
    let statusMessage = `Webhook: ${webhookLabel} | Subscription: ${subscriptionState}`;

    if (settings.lastAcceptedRedemption?.rewardTitle || settings.lastAcceptedRedemption?.user) {
        const rewardLabel = settings.lastAcceptedRedemption.rewardTitle || channelPointsRewardTitle;
        const userLabel = settings.lastAcceptedRedemption.user || 'unknown user';
        statusMessage += ` | Last redemption: ${rewardLabel} by ${userLabel}`;
    }

    if (settings.subscriptionError) {
        statusMessage += ` | Error: ${settings.subscriptionError}`;
    }

    updateChannelPointsStatus(statusMessage, Boolean(settings.subscriptionError || settings.lastWebhookError));
    updateTriggerModeDescription();
    updateMessageStats();
}

async function loadTtsSettings() {
    try {
        const response = await fetch('/api/tts/settings');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (payload.success) {
            applyTtsSettings(payload.settings);
        }
    } catch (error) {
        console.error('❌ Failed to load TTS settings:', error);
        updateChannelPointsStatus('Failed to load trigger settings.', true);
    }
}

async function saveTtsTriggerSettings() {
    const triggerModeSelect = document.getElementById('ttsTriggerModeSelect');
    const rewardTitleInput = document.getElementById('channelPointsRewardTitleInput');

    const payload = {
        mode: triggerModeSelect?.value || 'chat_commands',
        channelPointsRewardTitle: rewardTitleInput?.value?.trim() || 'Test-tts'
    };

    try {
        const response = await fetch('/api/tts/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        applyTtsSettings(result.settings);
        updateChannelPointsStatus(`Saved trigger settings. Reward title: ${result.settings.channelPointsRewardTitle}`);
    } catch (error) {
        console.error('❌ Failed to save trigger settings:', error);
        updateChannelPointsStatus(`Failed to save trigger settings: ${error.message}`, true);
    }
}

async function subscribeToChannelPointEvents() {
    try {
        updateChannelPointsStatus('Subscribing to reward redemption events...');

        const response = await fetch('/api/kick/channel-point-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        applyTtsSettings(result.settings);
        const subscriptionId = result.subscription?.subscription_id || result.subscription?.id || 'created';
        updateChannelPointsStatus(`Reward redemption subscription ready (${subscriptionId}).`);
    } catch (error) {
        console.error('❌ Failed to subscribe to reward redemptions:', error);
        updateChannelPointsStatus(`Reward redemption subscription failed: ${error.message}`, true);
    }
}

function injectRealtimeMessage(message) {
    if (!isPollingActive || !message || !message.id) {
        return;
    }

    if (message.broadcasterChannel && currentChannel && message.broadcasterChannel !== currentChannel.toLowerCase()) {
        return;
    }

    const mergedMessages = Array.from(displayedMessages.values());
    mergedMessages.push(message);
    mergedMessages.sort((left, right) => {
        const rightTime = Date.parse(right.timestamp || 0) || 0;
        const leftTime = Date.parse(left.timestamp || 0) || 0;
        return rightTime - leftTime;
    });

    displayChatMessages(mergedMessages);
}

function updatePlaybackControlState() {
    const playNextManualBtn = document.getElementById('playNextManualBtn');
    if (playNextManualBtn) {
        playNextManualBtn.disabled = manualTTSQueue.length === 0;
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

function isProviderCustomVoice(voice) {
    return voice !== 'default' && voice !== 'custom1' && voice !== 'custom2';
}

async function playProviderVoiceAudio(text, voice) {
    activeTtsGenerationRequests += 1;
    setTtsProcessingState(true, voice);

    let audioUrl = null;
    try {
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
        audioUrl = URL.createObjectURL(audioBlob);
    } finally {
        activeTtsGenerationRequests = Math.max(0, activeTtsGenerationRequests - 1);
        setTtsProcessingState(activeTtsGenerationRequests > 0);
    }

    return new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);
        const mutedNow = getToggleButtonState('ttsMuted', false);
        const volumeSliderValue = parseInt(document.getElementById('ttsVolume')?.value || '80', 10);
        const normalizedVolume = Math.max(0, Math.min(1, volumeSliderValue / 100));

        audio.volume = mutedNow ? 0 : normalizedVolume;
        activeProviderAudio = audio;

        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            if (activeProviderAudio === audio) {
                activeProviderAudio = null;
            }
            resolve();
        };

        audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            if (activeProviderAudio === audio) {
                activeProviderAudio = null;
            }
            reject(new Error(`Audio playback failed for !${voice}.`));
        };

        audio.play().catch((error) => {
            URL.revokeObjectURL(audioUrl);
            if (activeProviderAudio === audio) {
                activeProviderAudio = null;
            }
            reject(error);
        });
    });
}

function stopTTSImmediately() {
    if (speechSynthesis) {
        speechSynthesis.cancel();
    }

    if (activeProviderAudio) {
        activeProviderAudio.pause();
        activeProviderAudio.currentTime = 0;
        activeProviderAudio = null;
    }

    ttsQueue = [];
    isSpeaking = false;
    updatePlaybackControlState();
}

function applyCurrentProviderAudioVolume() {
    if (!activeProviderAudio) {
        return;
    }

    const mutedNow = getToggleButtonState('ttsMuted', false);
    const volumeSliderValue = parseInt(document.getElementById('ttsVolume')?.value || '80', 10);
    const normalizedVolume = Math.max(0, Math.min(1, volumeSliderValue / 100));
    activeProviderAudio.volume = mutedNow ? 0 : normalizedVolume;
}

// TTS Functions
function speakText(text, username, voice = 'default', forceReplay = false, onComplete = null, playbackContext = 'auto') {
    const ttsEnabled = getToggleButtonState('ttsEnabled', true);
    const ttsMuted = getToggleButtonState('ttsMuted', false);
    const modeMultiplier = getPlaybackSpeedMultiplier(playbackContext);
    const ttsVolume = parseInt(document.getElementById('ttsVolume')?.value || '80', 10);
    
    if (!ttsEnabled || !speechSynthesis) {
        debugLog('🔊 TTS disabled or not available');
        if (onComplete) onComplete(false);
        return;
    }

    if (ttsMuted) {
        debugLog('🔊 TTS muted - skipping playback');
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

    const spokenPayload = {
        text: cleanText,
        user: username,
        voice,
        context: playbackContext,
        timestamp: new Date().toISOString()
    };

    if (isProviderCustomVoice(voice)) {
        const customVoiceTask = async () => {
            isSpeaking = true;
            try {
                debugLog(`🎙️ Requesting provider voice !${voice} for: ${cleanText.substring(0, 50)}...`);
                await playProviderVoiceAudio(cleanText, voice);
                isSpeaking = false;
                ttsCount++;
                lastSpokenMessage = spokenPayload;
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
    const adjustedRate = Math.max(0.5, Math.min(2, modeMultiplier * voiceProfile.rateMultiplier));
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = adjustedRate;
    utterance.pitch = voiceProfile.pitch;
    utterance.volume = Math.max(0, Math.min(1, ttsVolume / 100));
    
    utterance.onstart = function() {
        isSpeaking = true;
        debugLog(`🔊 Speaking${forceReplay ? ' (manual)' : ''}: ${username}: ${cleanText.substring(0, 50)}...`);
    };
    
    utterance.onend = function() {
        isSpeaking = false;
        ttsCount++;
        lastSpokenMessage = spokenPayload;
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
    const ttsEnabledCheckbox = document.getElementById('ttsEnabled');
    const ttsMutedCheckbox = document.getElementById('ttsMuted');
    const ttsVolumeSlider = document.getElementById('ttsVolume');
    const volumeValueSpan = document.getElementById('volumeValue');
    const ttsModeSelect = document.getElementById('ttsModeSelect');
    const ttsSpeedAutoplay = document.getElementById('ttsSpeedAutoplay');
    const ttsSpeedManual = document.getElementById('ttsSpeedManual');
    const ttsSpeedHybrid = document.getElementById('ttsSpeedHybrid');
    const speedValueAutoplay = document.getElementById('speedValueAutoplay');
    const speedValueManual = document.getElementById('speedValueManual');
    const speedValueHybrid = document.getElementById('speedValueHybrid');
    const ttsTriggerModeSelect = document.getElementById('ttsTriggerModeSelect');
    const saveTtsTriggerSettingsBtn = document.getElementById('saveTtsTriggerSettingsBtn');
    const subscribeChannelPointsBtn = document.getElementById('subscribeChannelPointsBtn');
    const playNextManualBtn = document.getElementById('playNextManualBtn');
    const skipCurrentBtn = document.getElementById('skipCurrentBtn');
    const clearQueueBtn = document.getElementById('clearQueueBtn');
    const replayLastBtn = document.getElementById('replayLastBtn');

    if (ttsEnabledCheckbox) {
        setToggleButtonState(ttsEnabledCheckbox, getToggleButtonState(ttsEnabledCheckbox, true), {
            onText: 'Enabled',
            offText: 'Disabled'
        });

        ttsEnabledCheckbox.addEventListener('click', function() {
            const nextState = !getToggleButtonState(this, true);
            setToggleButtonState(this, nextState, {
                onText: 'Enabled',
                offText: 'Disabled'
            });

            if (!nextState) {
                stopTTSImmediately();
            }
        });
    }

    if (ttsMutedCheckbox) {
        setToggleButtonState(ttsMutedCheckbox, getToggleButtonState(ttsMutedCheckbox, false), {
            onText: 'Mute',
            offText: 'Mute'
        });

        ttsMutedCheckbox.addEventListener('click', function() {
            const nextState = !getToggleButtonState(this, false);
            setToggleButtonState(this, nextState, {
                onText: 'Mute',
                offText: 'Mute'
            });

            if (nextState) {
                stopTTSImmediately();
            } else {
                applyCurrentProviderAudioVolume();
            }
        });
    }

    if (ttsModeSelect) {
        ttsModeSelect.addEventListener('change', function() {
            ttsMode = this.value;
            updateModeDescription();
            updateMessageStats();
        });
    }

    if (ttsTriggerModeSelect) {
        ttsTriggerModeSelect.addEventListener('change', function() {
            ttsTriggerMode = this.value;
            lastTriggerModeChangeTime = Date.now(); // Track when user changed this
            updateTriggerModeDescription();
            updateMessageStats();
            
            // Auto-save the setting when changed
            debugLog(`🔧 Trigger mode changed to: ${ttsTriggerMode} - saving automatically`);
            saveTtsTriggerSettings();
        });
    }

    if (saveTtsTriggerSettingsBtn) {
        saveTtsTriggerSettingsBtn.addEventListener('click', function() {
            saveTtsTriggerSettings();
        });
    }

    if (subscribeChannelPointsBtn) {
        subscribeChannelPointsBtn.addEventListener('click', function() {
            subscribeToChannelPointEvents();
        });
    }

    if (ttsSpeedAutoplay && speedValueAutoplay) {
        ttsSpeedAutoplay.addEventListener('input', function() {
            modeSpeedMultipliers.autoplay = parseFloat(this.value);
            speedValueAutoplay.textContent = `${this.value}x`;
        });
    }

    if (ttsSpeedManual && speedValueManual) {
        ttsSpeedManual.addEventListener('input', function() {
            modeSpeedMultipliers.manual = parseFloat(this.value);
            speedValueManual.textContent = `${this.value}x`;
        });
    }

    if (ttsSpeedHybrid && speedValueHybrid) {
        ttsSpeedHybrid.addEventListener('input', function() {
            modeSpeedMultipliers.hybrid = parseFloat(this.value);
            speedValueHybrid.textContent = `${this.value}x`;
        });
    }

    if (playNextManualBtn) {
        playNextManualBtn.addEventListener('click', function() {
            playNextManualMessage();
        });
    }

    if (skipCurrentBtn) {
        skipCurrentBtn.addEventListener('click', function() {
            skipCurrentPlayback();
        });
    }

    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', function() {
            clearPlaybackQueue();
        });
    }

    if (replayLastBtn) {
        replayLastBtn.addEventListener('click', function() {
            replayLastMessage();
        });
    }

    if (ttsVolumeSlider && volumeValueSpan) {
        ttsVolumeSlider.addEventListener('input', function() {
            volumeValueSpan.textContent = `${this.value}%`;
            applyCurrentProviderAudioVolume();
        });
    }

    syncToggleButtons();
    updateModeDescription();
    updateTriggerModeDescription();
    updatePlaybackControlState();
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
    const manualQueueCountEl = document.getElementById('manualQueueCount');
    const currentModeStatEl = document.getElementById('currentModeStat');
    const currentTriggerModeStatEl = document.getElementById('currentTriggerModeStat');
    const lastUpdateEl = document.getElementById('lastUpdate');
    
    if (messageCountEl) messageCountEl.textContent = `Messages: ${displayedMessageCount}`;
    if (ttsCountEl) ttsCountEl.textContent = `TTS Spoken: ${ttsCount}`;
    if (replayCountEl) replayCountEl.textContent = `Manual Replays: ${replayCount}`;
    if (manualQueueCountEl) manualQueueCountEl.textContent = `Manual Queue: ${manualTTSQueue.length}`;
    if (currentModeStatEl) currentModeStatEl.textContent = `Mode: ${ttsMode}`;
    if (currentTriggerModeStatEl) currentTriggerModeStatEl.textContent = `Trigger: ${ttsTriggerMode}`;
    if (lastUpdateEl) lastUpdateEl.textContent = `Last Update: ${new Date().toLocaleTimeString()}`;
    updatePlaybackControlState();
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
            msg.manualQueued = existingMsg.manualQueued;
            existingMessages++;
            debugLog(`📋 EXISTING message ${msg.id}: played=${msg.played}`);
        } else {
            // This is a truly NEW message - mark for auto-play
            msg.played = false;
            msg.manualQueued = false;
            newMessages.push(msg);
            debugLog(`📋 NEW message ${msg.id}: will auto-play`);
        }

        if (isMessageInManualQueue(msg.id)) {
            msg.manualQueued = true;
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
        let messageClasses = 'chat-message';
        
        // Add banned class if user is banned
        if (msg.isBanned) {
            messageClasses += ' banned-message';
        }
        
        // Add permission class if user lacks permissions
        if (!msg.hasPermission) {
            messageClasses += ' no-permission-message';
        }
        
        messageDiv.className = messageClasses;
        messageDiv.dataset.messageId = msg.id;
        
        const userStyle = msg.color ? `style="color: ${msg.color};"` : '';
        
        const badges = (msg.badges || []).map(badge => 
            `<span class="badge badge-${badge.type}">${badge.text || badge.type}</span>`
        ).join(' ');
        
        const formattedTime = formatTimestamp(msg.timestamp);
        debugLog(`📋 Timestamp: ${msg.timestamp} -> ${formattedTime}`);
        
        const safeUser = msg.user || 'Unknown';
        const safeMessage = msg.message || '[No message]';
        
        // Add moderation indicators
        let moderationIndicators = '';
        if (msg.isBanned) {
            moderationIndicators += '<span class="moderation-tag banned-tag" title="This user is banned - auto TTS disabled">🚫 BANNED</span>';
        }
        if (!msg.hasPermission) {
            moderationIndicators += `<span class="moderation-tag permission-tag" title="User lacks required permissions">🔒 NO PERM</span>`;
        }
        
        const ttsDirective = getTTSDirective(msg);
        
        // Determine if message is eligible for auto TTS (respects ban and permission status)
        const autoTtsEligible = ttsDirective.eligible && (msg.autoTtsEligible !== false);
        
        const playedIndicator = !autoTtsEligible
            ? '⏭'
            : (msg.played ? '🔇' : (msg.manualQueued ? '⏸' : '🔊'));
        const indicatorTitle = !autoTtsEligible
            ? (msg.isBanned ? 'Banned user - auto TTS disabled (click for manual playback)' : 
               !msg.hasPermission ? 'User lacks permissions - auto TTS disabled (click for manual playback)' :
               'Ignored for auto TTS (trigger mode does not allow this message)')
            : (msg.played
                ? 'Already played (click to replay)'
                : (msg.manualQueued ? 'Queued for manual playback' : 'Not yet played'));
        
        messageDiv.innerHTML = `
            <span class="chat-user" ${userStyle}>${escapeHtml(safeUser)}</span>
            ${badges}
            ${moderationIndicators}
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
            removeMessageFromManualQueue(msg.id);
            msg.manualQueued = false;
            displayedMessages.set(msg.id, msg);
            
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
                        msg.played = true;
                        displayedMessages.set(msg.id, msg);
                    } else {
                        indicator.textContent = '❌';
                        indicator.title = 'TTS failed (click to retry)';
                    }
                }
            }, 'manual');
            updateMessageStats();
        });
        
        messageDiv.style.cursor = 'pointer';
        messageDiv.title = 'Click to replay message';
        
        chatContainer.appendChild(messageDiv);
        debugLog(`📋 Message ${index + 1} added to container`);
        
        // Add TTS for ONLY truly NEW messages (never seen before) AND respect auto TTS eligibility
        if (safeMessage && safeMessage !== '[No message]') {
            const isNewMessage = newMessages.some(newMsg => newMsg.id === msg.id);
            if (isNewMessage && !msg.played && autoTtsEligible) {
                if (shouldAutoplayMessage(msg)) {
                    setTimeout(() => {
                        debugLog(`🔊 AUTO-PLAYING NEW message: ${safeUser}: ${ttsDirective.text.substring(0, 30)}...`);
                        speakText(ttsDirective.text, safeUser, ttsDirective.voice, false, (success) => {
                            if (success) {
                                msg.played = true;
                                msg.manualQueued = false;
                                displayedMessages.set(msg.id, msg);

                                const indicator = messageDiv.querySelector('.play-indicator');
                                if (indicator) {
                                    indicator.textContent = '🔇';
                                    indicator.title = 'Already played (click to replay)';
                                }
                                debugLog(`🔊 Message marked as played: ${safeUser}`);
                            }
                        }, ttsMode === 'hybrid' ? 'hybrid' : 'auto');
                    }, index * 200); // Stagger auto-play timing
                } else {
                    queueMessageForManualPlayback(msg, ttsDirective);
                    msg.manualQueued = true;
                    displayedMessages.set(msg.id, msg);
                    const indicator = messageDiv.querySelector('.play-indicator');
                    if (indicator) {
                        indicator.textContent = '⏸';
                        indicator.title = 'Queued for manual playback';
                    }
                }
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

    activeChatFetchRequests += 1;
    setChatProcessingState(true);

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

        if (data.tts_trigger) {
            applyTtsSettings({
                mode: data.tts_trigger.mode || ttsTriggerMode,
                channelPointsRewardTitle: data.tts_trigger.reward_title || channelPointsRewardTitle,
                subscriptionStatus: data.tts_trigger.subscription_status || 'not_attempted',
                subscriptionError: data.tts_trigger.subscription_error || null,
                lastAcceptedRedemption: data.tts_trigger.last_redemption_at
                    ? {
                        rewardTitle: data.tts_trigger.reward_title || channelPointsRewardTitle,
                        user: 'recent redemption'
                    }
                    : null
            });
        }

        if (data.success && data.messages) {
            debugLog(`📡 Retrieved ${data.messages.length} messages`);
            displayChatMessages(data.messages);
        } else {
            console.error('❌ Failed to get messages:', data.error || 'Unknown error');
            if (chatContainer) {
                chatContainer.innerHTML = `<div class="no-messages">❌ ${escapeHtml(data.error || 'Failed to get chat messages')}</div>`;
            }
        }

    } catch (error) {
        console.error('❌ Error fetching live chat messages:', error);
        if (chatContainer) {
            chatContainer.innerHTML = `<div class="no-messages">❌ ${escapeHtml(error.message || 'Error fetching chat messages')}</div>`;
        }
    } finally {
        activeChatFetchRequests = Math.max(0, activeChatFetchRequests - 1);
        setChatProcessingState(activeChatFetchRequests > 0);
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

    manualTTSQueue = [];
    ttsQueue = [];
    displayedMessages.clear();
    displayedMessageCount = 0;
    updateMessageStats();
    
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
    }, 15000); // 15 second intervals for better performance
    
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
    activeChatFetchRequests = 0;
    setChatProcessingState(false);
    activeTtsGenerationRequests = 0;
    setTtsProcessingState(false);

    clearPlaybackQueue();
    
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
    
    // Moderation event listeners
    if (enableBanListCheckbox) {
        enableBanListCheckbox.addEventListener('click', function() {
            moderationSettings.enableBanList = !moderationSettings.enableBanList;
            setToggleButtonState(this, moderationSettings.enableBanList, {
                onText: 'Enabled',
                offText: 'Disabled'
            });
        });
    }
    
    if (enablePermissionFilterCheckbox) {
        enablePermissionFilterCheckbox.addEventListener('click', function() {
            moderationSettings.enablePermissionFilter = !moderationSettings.enablePermissionFilter;
            setToggleButtonState(this, moderationSettings.enablePermissionFilter, {
                onText: 'Enabled',
                offText: 'Disabled'
            });
        });
    }
    
    if (permissionModeSelect) {
        permissionModeSelect.addEventListener('change', function() {
            moderationSettings.permissionMode = this.value;
        });
    }
    
    if (addBanBtn) {
        addBanBtn.addEventListener('click', function() {
            const username = banUsernameInput?.value?.trim();
            if (username) {
                banUser(username);
                banUsernameInput.value = '';
            }
        });
    }
    
    if (banUsernameInput) {
        banUsernameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const username = this.value.trim();
                if (username) {
                    banUser(username);
                    this.value = '';
                }
            }
        });
    }
    
    if (saveModerationSettingsBtn) {
        saveModerationSettingsBtn.addEventListener('click', saveModerationSettings);
    }
    
    if (loadModerationSettingsBtn) {
        loadModerationSettingsBtn.addEventListener('click', loadModerationSettings);
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

    const ttsModeSelect = document.getElementById('ttsModeSelect');
    const ttsSpeedAutoplay = document.getElementById('ttsSpeedAutoplay');
    const ttsSpeedManual = document.getElementById('ttsSpeedManual');
    const ttsSpeedHybrid = document.getElementById('ttsSpeedHybrid');

    if (ttsModeSelect) {
        ttsMode = ttsModeSelect.value;
    }
    if (ttsSpeedAutoplay) {
        modeSpeedMultipliers.autoplay = parseFloat(ttsSpeedAutoplay.value || '1');
    }
    if (ttsSpeedManual) {
        modeSpeedMultipliers.manual = parseFloat(ttsSpeedManual.value || '1');
    }
    if (ttsSpeedHybrid) {
        modeSpeedMultipliers.hybrid = parseFloat(ttsSpeedHybrid.value || '1');
    }
    syncToggleButtons();
    
    checkAuthenticationStatus();
    setupEventListeners();
    updateUI();
    updateModeDescription();
    updateTriggerModeDescription();
    updateMessageStats();
    loadTtsSettings();
    loadModerationSettings();
    
    // Set default channel if available
    if (channelInput && channelInput.value) {
        currentChannel = channelInput.value.trim();
    }
});

// ── Background floating cubes ──────────────────────────────────────────────
(function initBgCubes() {
    const FACE_TRANSFORMS = [
        ['front',  (h) => `translateZ(${h}px)`],
        ['back',   (h) => `rotateY(180deg) translateZ(${h}px)`],
        ['right',  (h) => `rotateY(90deg) translateZ(${h}px)`],
        ['left',   (h) => `rotateY(-90deg) translateZ(${h}px)`],
        ['top',    (h) => `rotateX(90deg) translateZ(${h}px)`],
        ['bottom', (h) => `rotateX(-90deg) translateZ(${h}px)`],
    ];

    function spawnBgCube() {
        const layer = document.getElementById('bgCubesLayer');
        if (!layer) return;

        const size     = 18 + Math.random() * 28;          // 18–46 px
        const half     = size / 2;
        const spin     = (2 + Math.random() * 4).toFixed(2); // 2–6 s
        const life     = (8 + Math.random() * 10).toFixed(2); // 8–18 s
        const peak     = (0.05 + Math.random() * 0.09).toFixed(3); // 0.05–0.14
        // Spawn only on left or right band (outer 18 % of each side)
        const sideWidth = window.innerWidth * 0.18;
        const onLeft    = Math.random() < 0.5;
        const startX    = onLeft
            ? Math.random() * sideWidth
            : window.innerWidth - Math.random() * sideWidth;
        const startY    = Math.random() * window.innerHeight;
        // Drift stays mostly within its starting band
        const dx        = (onLeft ? 1 : -1) * (20 + Math.random() * 80).toFixed(1);
        const dy        = ((Math.random() - 0.5) * 200).toFixed(1);
        const scaleMax  = (1.0 + Math.random() * 1.0).toFixed(2);  // 1.0 – 2.0
        const scaleMid  = (0.5 + Math.random() * 0.4).toFixed(2);  // 0.5 – 0.9
        const scaleStart = (0.2 + Math.random() * 0.3).toFixed(2); // 0.2 – 0.5

        const wrapper = document.createElement('div');
        wrapper.className = 'bg-cube-wrapper';
        wrapper.style.cssText = [
            `left:${startX}px`, `top:${startY}px`,
            `width:${size}px`, `height:${size}px`,
            `--life:${life}s`, `--spin:${spin}s`,
            `--peak:${peak}`, `--dx:${dx}px`, `--dy:${dy}px`,
            `--scale-max:${scaleMax}`, `--scale-mid:${scaleMid}`, `--scale-start:${scaleStart}`,
        ].join(';');

        const inner = document.createElement('div');
        inner.className = 'bg-cube-inner';
        inner.style.cssText = `width:${size}px;height:${size}px`;

        FACE_TRANSFORMS.forEach(([name, tfn]) => {
            const face = document.createElement('span');
            face.className = 'bg-cube-face';
            face.style.cssText = `width:${size}px;height:${size}px;transform:${tfn(half)}`;
            inner.appendChild(face);
        });

        wrapper.appendChild(inner);
        layer.appendChild(wrapper);

        setTimeout(() => wrapper.remove(), (parseFloat(life) + 0.5) * 1000);
    }

    function scheduleBgCube() {
        const delay = 1250 + Math.random() * 3250; // 1.25–4.5 s between spawns (2× rate)
        setTimeout(() => {
            spawnBgCube();
            scheduleBgCube();
        }, delay);
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Seed two independent spawn chains so density doubles immediately
        setTimeout(() => {
            spawnBgCube();
            scheduleBgCube();
        }, 600);
        setTimeout(() => {
            spawnBgCube();
            scheduleBgCube();
        }, 1800);
    });
}());

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

socket.on('channel-point-redemption', function(message) {
    debugLog('🎟️ Channel point redemption received via socket:', message);
    injectRealtimeMessage(message);
});