// Initialize Socket.IO connection
const socket = io();

// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusBtn = document.getElementById('statusBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginBtn = document.getElementById('loginBtn');
const channelInput = document.getElementById('channelInput');
const chatContainer = document.getElementById('liveChatMessages'); // Updated to match new HTML
const statusDisplay = document.getElementById('statusDisplay');
const messageCount = document.getElementById('messageCount');
const connectionCount = document.getElementById('connectionCount');
const webhookStatus = document.getElementById('webhookStatus');

// Webhook management elements
const subscribeBtn = document.getElementById('subscribeBtn');
const checkSubsBtn = document.getElementById('checkSubsBtn');
const testWebhookBtn = document.getElementById('testWebhookBtn');
const debugTokenBtn = document.getElementById('debugTokenBtn');
const exploreApiBtn = document.getElementById('exploreApiBtn');

// State
let isMonitoring = false;
let currentChannel = '';
let messages = [];
let isAuthenticated = false; // Track authentication state

// Check initial authentication status from DOM
function checkAuthenticationStatus() {
    const authBadge = document.querySelector('.status-badge.authenticated');
    const loginBtn = document.getElementById('loginBtn');
    
    isAuthenticated = authBadge !== null && loginBtn === null;
    console.log('🔍 Authentication status checked:', isAuthenticated);
    return isAuthenticated;
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM loaded, initializing app...');
    
    // Check authentication status first
    checkAuthenticationStatus();
    
    setupEventListeners();
    updateUI();
});

// Event listeners
function setupEventListeners() {
    // Button event listeners
    startBtn?.addEventListener('click', startChatMonitoring);
    stopBtn?.addEventListener('click', stopChatMonitoring);
    statusBtn?.addEventListener('click', checkStatus);
    logoutBtn?.addEventListener('click', logout);
    loginBtn?.addEventListener('click', openOAuthPopup);
    
    // Webhook management buttons
    subscribeBtn?.addEventListener('click', subscribeToEvents);
    checkSubsBtn?.addEventListener('click', checkSubscriptions);
    testWebhookBtn?.addEventListener('click', testWebhook);
    debugTokenBtn?.addEventListener('click', debugToken);
    exploreApiBtn?.addEventListener('click', exploreApi);
    
    // API webhook subscription
    const apiWebhookBtn = document.getElementById('apiWebhookBtn');
    apiWebhookBtn?.addEventListener('click', subscribeWebhookAPI);
    
    // Token permissions check
    const checkPermissionsBtn = document.getElementById('checkPermissionsBtn');
    checkPermissionsBtn?.addEventListener('click', checkTokenPermissions);
    
    // Direct API test
    const directApiTestBtn = document.getElementById('directApiTestBtn');
    directApiTestBtn?.addEventListener('click', directApiTest);
    
    // V1 Webhook test
    const testV1WebhooksBtn = document.getElementById('testV1Webhooks');
    console.log('Setting up V1 webhook button:', testV1WebhooksBtn);
    if (testV1WebhooksBtn) {
        testV1WebhooksBtn.addEventListener('click', function(e) {
            console.log('🎉 V1 Webhook button clicked!', e);
            testV1Webhooks();
        });
        console.log('✅ V1 Webhook button listener added');
    } else {
        console.error('❌ testV1Webhooks button not found in DOM');
    }
    
    // Force V1 Test (bypasses authentication)
    const forceV1TestBtn = document.getElementById('forceV1Test');
    console.log('Setting up Force V1 test button:', forceV1TestBtn);
    if (forceV1TestBtn) {
        forceV1TestBtn.addEventListener('click', function(e) {
            console.log('🔧 Force V1 Test button clicked!', e);
            forceV1Test();
        });
        console.log('✅ Force V1 Test button listener added');
    } else {
        console.error('❌ forceV1Test button not found in DOM');
    }
    
    // Try Chat Connection (alternative to webhooks)
    const tryChatConnectionBtn = document.getElementById('tryChatConnection');
    console.log('Setting up Chat Connection test button:', tryChatConnectionBtn);
    if (tryChatConnectionBtn) {
        tryChatConnectionBtn.addEventListener('click', function(e) {
            console.log('🔄 Chat Connection button clicked!', e);
            tryChatConnection();
        });
        console.log('✅ Chat Connection button listener added');
    } else {
        console.error('❌ tryChatConnection button not found in DOM');
    }
    
    // Examine Chat Data (detailed analysis)
    const examineChatDataBtn = document.getElementById('examineChatData');
    console.log('Setting up Examine Chat Data button:', examineChatDataBtn);
    if (examineChatDataBtn) {
        examineChatDataBtn.addEventListener('click', function(e) {
            console.log('🔍 Examine Chat Data button clicked!', e);
            examineChatData();
        });
        console.log('✅ Examine Chat Data button listener added');
    } else {
        console.error('❌ examineChatData button not found in DOM');
    }
    
    // Set up Kick WebSocket Investigation button
    const investigateKickWSBtn = document.getElementById('investigateKickWS');
    console.log('Setting up Kick WebSocket Investigation button:', investigateKickWSBtn);
    if (investigateKickWSBtn) {
        investigateKickWSBtn.addEventListener('click', function(e) {
            console.log('🔌 Kick WebSocket Investigation button clicked!', e);
            investigateKickWebSockets();
        });
        console.log('✅ Kick WebSocket Investigation button listener added');
    } else {
        console.error('❌ investigateKickWS button not found in DOM');
    }
    
    // Set up Inspect Messages button
    const inspectMessagesBtn = document.getElementById('inspectMessages');
    console.log('Setting up Inspect Messages button:', inspectMessagesBtn);
    if (inspectMessagesBtn) {
        inspectMessagesBtn.addEventListener('click', function(e) {
            console.log('💬 Inspect Messages button clicked!', e);
            inspectChatMessages();
        });
        console.log('✅ Inspect Messages button listener added');
    } else {
        console.error('❌ inspectMessages button not found in DOM');
    }
    
    // Set up Inspect Raw Content button
    const inspectRawBtn = document.getElementById('inspectRawContent');
    console.log('Setting up Inspect Raw Content button:', inspectRawBtn);
    if (inspectRawBtn) {
        inspectRawBtn.addEventListener('click', function(e) {
            console.log('📄 Inspect Raw Content button clicked!', e);
            inspectRawContent();
        });
        console.log('✅ Inspect Raw Content button listener added');
    } else {
        console.error('❌ inspectRawContent button not found in DOM');
    }
    
    // Set up Discover Real APIs button
    const discoverEndpointsBtn = document.getElementById('discoverEndpoints');
    console.log('Setting up Discover Real APIs button:', discoverEndpointsBtn);
    if (discoverEndpointsBtn) {
        discoverEndpointsBtn.addEventListener('click', function(e) {
            console.log('🎯 Discover Real APIs button clicked!', e);
            discoverRealEndpoints();
        });
        console.log('✅ Discover Real APIs button listener added');
    } else {
        console.error('❌ discoverEndpoints button not found in DOM');
    }
    
    // Set up Extract JS Config button
    const extractJSConfigBtn = document.getElementById('extractJSConfig');
    console.log('Setting up Extract JS Config button:', extractJSConfigBtn);
    if (extractJSConfigBtn) {
        extractJSConfigBtn.addEventListener('click', function(e) {
            console.log('🔧 Extract JS Config button clicked!', e);
            extractJSConfig();
        });
        console.log('✅ Extract JS Config button listener added');
    } else {
        console.error('❌ extractJSConfig button not found in DOM');
    }
    
    // Set up Investigate Chat Implementation button
    const investigateChatBtn = document.getElementById('investigateChatImplementation');
    console.log('🔍 Setting up Investigate Chat Implementation button:', investigateChatBtn);
    if (investigateChatBtn) {
        console.log('✅ Investigate Chat Implementation button found in DOM');
        investigateChatBtn.addEventListener('click', function(e) {
            console.log('🚀 Investigate Chat Implementation button clicked!', e);
            e.preventDefault();
            investigateChatImplementation();
        });
        console.log('✅ Investigate Chat Implementation button listener added');
        
        // Test that function is available
        if (typeof investigateChatImplementation === 'function') {
            console.log('✅ investigateChatImplementation function is defined');
        } else {
            console.error('❌ investigateChatImplementation function is NOT defined');
        }
    } else {
        console.error('❌ investigateChatImplementation button not found in DOM');
        console.log('Available button IDs:', Array.from(document.querySelectorAll('button')).map(b => b.id));
    }
    
    // Set up Test button for debugging
    const testBtn = document.getElementById('testButton');
    console.log('🧪 Setting up Test button:', testBtn);
    if (testBtn) {
        testBtn.addEventListener('click', function(e) {
            console.log('🧪 TEST BUTTON CLICKED!');
            alert('Test button works! If you can see this, JavaScript is working.');
            showNotification('🧪 Test button clicked - JavaScript is working!', 'success');
        });
        console.log('✅ Test button listener added');
    }
    
    // Set up Analyze Working Endpoints button
    const analyzeEndpointsBtn = document.getElementById('analyzeWorkingEndpoints');
    console.log('🎯 Setting up Analyze Working Endpoints button:', analyzeEndpointsBtn);
    if (analyzeEndpointsBtn) {
        analyzeEndpointsBtn.addEventListener('click', function(e) {
            console.log('🎯 Analyze Working Endpoints button clicked!');
            e.preventDefault();
            analyzeWorkingEndpoints();
        });
        console.log('✅ Analyze Working Endpoints button listener added');
    }
    
    // Set up Get Live Chat button
    const getLiveChatBtn = document.getElementById('getLiveChat');
    console.log('💬 Setting up Get Live Chat button:', getLiveChatBtn);
    if (getLiveChatBtn) {
        getLiveChatBtn.addEventListener('click', function(e) {
            console.log('💬 Get Live Chat button clicked!');
            e.preventDefault();
            getLiveChatMessages();
        });
        console.log('✅ Get Live Chat button listener added');
    }
    
    // Set up TTS controls
    setupTTSControls();
    
    // Add a really simple connectivity test
    console.log('🔧 Adding simple connectivity test...');
    setTimeout(() => {
        // Test basic server connectivity
        fetch('/messages')
            .then(response => {
                console.log('✅ Server connectivity test OK:', response.status);
            })
            .catch(error => {
                console.error('❌ Server connectivity test failed:', error);
            });
    }, 1000);
    
    // Enter key on channel input
    channelInput?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !startBtn.disabled) {
            startChatMonitoring();
        }
    });
    
    // Listen for OAuth popup messages
    window.addEventListener('message', handleOAuthCallback);
}

// Socket.IO event listeners
socket.on('connect', () => {
    console.log('Connected to server');
    updateConnectionStatus(true);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
});

socket.on('statusUpdate', (data) => {
    isMonitoring = data.isMonitoring;
    currentChannel = data.channel;
    updateUI();
    updateMessageCount(data.messageCount || 0);
});

socket.on('chatHistory', (history) => {
    messages = history;
    displayChatHistory();
    updateMessageCount(messages.length);
});

socket.on('newChatMessage', (message) => {
    messages.push(message);
    displayNewMessage(message);
    updateMessageCount(messages.length);
    
    // Keep only last 100 messages in memory
    if (messages.length > 100) {
        messages = messages.slice(-100);
        // Refresh display if we're pruning old messages
        displayChatHistory();
    }
});

socket.on('chatStarted', (data) => {
    isMonitoring = true;
    currentChannel = data.channel;
    updateUI();
    showNotification(`Started monitoring ${data.channel}`, 'success');
});

socket.on('chatStopped', () => {
    isMonitoring = false;
    currentChannel = '';
    updateUI();
    showNotification('Stopped chat monitoring', 'info');
});

socket.on('webhookActivity', (data) => {
    console.log('Webhook activity:', data);
    if (webhookStatus) {
        webhookStatus.textContent = `Webhooks: ${data.status}`;
        webhookStatus.style.color = data.type === 'chat_message' ? '#28a745' : '#ffc107';
    }
    
    // Auto-clear status after 5 seconds
    setTimeout(() => {
        if (webhookStatus) {
            webhookStatus.textContent = 'Webhooks: Monitoring...';
            webhookStatus.style.color = '#17a2b8';
        }
    }, 5000);
});

// Chat control functions
async function startChatMonitoring() {
    const channel = channelInput.value.trim();
    
    if (!channel) {
        showNotification('Please enter a channel name', 'error');
        channelInput.focus();
        return;
    }
    
    try {
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';
        
        const response = await fetch('/chat/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ channel })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isMonitoring = true;
            currentChannel = channel;
            messages = []; // Clear old messages when starting new channel
            messageHistory.clear(); // Clear message history for fresh start
            updateUI();
            clearChatContainer();
            
            // Start polling for live updates
            startChatPolling(channel);
            
            showNotification(data.message + ' - Live polling started!', 'success');
        } else {
            showNotification(data.error || 'Failed to start monitoring', 'error');
        }
    } catch (error) {
        console.error('Error starting chat monitoring:', error);
        showNotification('Error starting chat monitoring', 'error');
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = 'Start Monitoring';
    }
}

async function stopChatMonitoring() {
    try {
        stopBtn.disabled = true;
        stopBtn.textContent = 'Stopping...';
        
        const response = await fetch('/chat/stop', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            isMonitoring = false;
            currentChannel = '';
            updateUI();
            showNotification(data.message, 'info');
        } else {
            showNotification('Failed to stop monitoring', 'error');
        }
    } catch (error) {
        console.error('Error stopping chat monitoring:', error);
        showNotification('Error stopping chat monitoring', 'error');
    } finally {
        stopBtn.disabled = false;
        stopBtn.textContent = 'Stop Monitoring';
    }
}

async function checkStatus() {
    try {
        statusBtn.disabled = true;
        statusBtn.textContent = 'Checking...';
        
        const response = await fetch('/chat/status');
        const data = await response.json();
        
        isMonitoring = data.isMonitoring;
        currentChannel = data.channel;
        
        updateUI();
        updateMessageCount(data.messageCount);
        updateConnectionCount(data.connectedClients);
        
        const statusMessage = data.isAuthenticated 
            ? (data.isMonitoring 
                ? `Monitoring ${data.channel} - ${data.messageCount} messages` 
                : 'Ready to monitor')
            : 'Not authenticated';
            
        showNotification(statusMessage, data.isAuthenticated ? 'success' : 'warning');
    } catch (error) {
        console.error('Error checking status:', error);
        showNotification('Error checking status', 'error');
    } finally {
        statusBtn.disabled = false;
        statusBtn.textContent = 'Check Status';
    }
}

async function logout() {
    try {
        const response = await fetch('/auth/logout', {
            method: 'POST'
        });
        
        if (response.ok) {
            window.location.reload();
        } else {
            showNotification('Error logging out', 'error');
        }
    } catch (error) {
        console.error('Error logging out:', error);
        showNotification('Error logging out', 'error');
    }
}

// UI update functions
function updateUI() {
    // Update status display
    if (statusDisplay) {
        if (isMonitoring && currentChannel) {
            statusDisplay.innerHTML = `<span class="status-indicator monitoring">🟢 Monitoring: ${currentChannel}</span>`;
        } else {
            statusDisplay.innerHTML = `<span class="status-indicator stopped">🔴 Not Monitoring</span>`;
        }
    }
    
    // Update channel input
    if (channelInput && currentChannel) {
        channelInput.value = currentChannel;
    }
    
    // Update buttons based on monitoring state
    if (startBtn) {
        startBtn.textContent = isMonitoring ? 'Restart Monitoring' : 'Start Monitoring';
    }
    
    // Show/hide stop button
    const stopPollingBtn = document.getElementById('stopPollingBtn');
    if (stopPollingBtn) {
        stopPollingBtn.style.display = isMonitoring ? 'inline-block' : 'none';
    }
}

function updateConnectionStatus(connected) {
    // You can add connection status indicators here if needed
    console.log('Connection status:', connected ? 'Connected' : 'Disconnected');
}

function updateMessageCount(count) {
    if (messageCount) {
        messageCount.textContent = `Messages: ${count}`;
    }
}

function updateConnectionCount(count) {
    if (connectionCount) {
        connectionCount.textContent = `Connected: ${count}`;
    }
}

// Chat display functions
function displayChatHistory() {
    if (!chatContainer) return; // Add null check
    
    clearChatContainer();
    if (messages.length === 0) {
        chatContainer.innerHTML = '<div class="no-messages">No chat messages yet...</div>';
        return;
    }
    
    messages.forEach(message => {
        displayMessage(message, false);
    });
    
    scrollToBottom();
}

function displayNewMessage(message) {
    if (!chatContainer) return; // Add null check
    
    if (chatContainer.querySelector('.no-messages')) {
        clearChatContainer();
    }
    
    displayMessage(message, true);
    scrollToBottom();
}

function displayMessage(message, isNew = false) {
    if (!chatContainer) return; // Add null check
    
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message${isNew ? ' new' : ''}`;
    
    const timestamp = new Date(message.timestamp).toLocaleString();
    
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="username">${escapeHtml(message.username)}</span>
            <span class="timestamp">${timestamp}</span>
        </div>
        <div class="message-content">${escapeHtml(message.message)}</div>
    `;
    
    chatContainer.appendChild(messageElement);
}

function clearChatContainer() {
    if (chatContainer) {
        chatContainer.innerHTML = '<div class="no-messages">💬 Live chat messages will appear here...</div>';
    }
}

function scrollToBottom() {
    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '6px',
        color: 'white',
        fontWeight: '600',
        zIndex: '9999',
        opacity: '0',
        transition: 'opacity 0.3s ease',
        maxWidth: '300px'
    });
    
    // Set background color based on type
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Fade in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
    });
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// OAuth popup functions
function openOAuthPopup() {
    const popup = window.open(
        '/auth/popup',
        'oauthPopup',
        'width=500,height=600,scrollbars=yes,resizable=yes'
    );
    
    if (!popup) {
        showNotification('Popup blocked! Please allow popups for OAuth login.', 'error');
        return;
    }
    
    // Disable login button and show loading state
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Authenticating...';
    }
    
    // Check if popup is closed manually
    const checkClosed = setInterval(() => {
        if (popup.closed) {
            clearInterval(checkClosed);
            resetLoginButton();
            showNotification('Authentication cancelled', 'warning');
        }
    }, 1000);
    
    // Set timeout for popup
    setTimeout(() => {
        if (!popup.closed) {
            popup.close();
            clearInterval(checkClosed);
            resetLoginButton();
            showNotification('Authentication timeout. Please try again.', 'error');
        }
    }, 120000); // 2 minutes timeout
}

function handleOAuthCallback(event) {
    // Verify origin for security
    if (event.origin !== window.location.origin) {
        return;
    }
    
    const data = event.data;
    
    if (data.success) {
        showNotification(data.message || 'Successfully authenticated!', 'success');
        setTimeout(() => {
            window.location.reload(); // Reload to update authentication status
        }, 1500);
    } else {
        showNotification(`Authentication failed: ${data.error}`, 'error');
        resetLoginButton();
    }
}

function resetLoginButton() {
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'OAuth Login with Kick.com';
    }
}

// Webhook management functions
async function subscribeToEvents() {
    const channel = channelInput.value.trim();
    
    if (!channel) {
        showNotification('Please enter a channel name first', 'error');
        channelInput.focus();
        return;
    }
    
    subscribeBtn.disabled = true;
    subscribeBtn.textContent = 'Subscribing...';
    
    try {
        const response = await fetch('/subscribe/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ channel: channel })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message || 'Successfully subscribed to events!', 'success');
        } else {
            console.error('Subscription error details:', data);
            showNotification(`Subscription failed: ${data.message || data.error}`, 'error');
        }
    } catch (error) {
        console.error('Subscription error:', error);
        showNotification('Error subscribing to events', 'error');
    } finally {
        subscribeBtn.disabled = false;
        subscribeBtn.textContent = 'Subscribe to Chat Events';
    }
}

async function checkSubscriptions() {
    checkSubsBtn.disabled = true;
    checkSubsBtn.textContent = 'Checking...';
    
    try {
        const response = await fetch('/subscriptions');
        const data = await response.json();
        
        if (response.ok) {
            console.log('Current subscriptions:', data.subscriptions);
            const count = data.subscriptions?.length || 0;
            showNotification(`Found ${count} active subscription(s). Check console for details.`, 'info');
        } else {
            showNotification(`Failed to get subscriptions: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Check subscriptions error:', error);
        showNotification('Error checking subscriptions', 'error');
    } finally {
        checkSubsBtn.disabled = false;
        checkSubsBtn.textContent = 'Check Subscriptions';
    }
}

async function testWebhook() {
    testWebhookBtn.disabled = true;
    testWebhookBtn.textContent = 'Testing...';
    
    try {
        const response = await fetch('/test/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                message: 'Test webhook message from frontend!' 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Test webhook sent! Check chat area.', 'success');
        } else {
            showNotification('Test webhook failed', 'error');
        }
    } catch (error) {
        console.error('Test webhook error:', error);
        showNotification('Error testing webhook', 'error');
    } finally {
        testWebhookBtn.disabled = false;
        testWebhookBtn.textContent = 'Test Webhook';
    }
}

async function debugToken() {
    debugTokenBtn.disabled = true;
    debugTokenBtn.textContent = 'Checking...';
    
    try {
        const response = await fetch('/debug/token');
        const data = await response.json();
        
        if (response.ok) {
            console.log('Token debug info:', data);
            const scopes = data.token_info?.data?.scope || 'No scopes found';
            const tokenType = data.token_info?.data?.token_type || 'Unknown';
            showNotification(`Token: ${tokenType}, Scopes: ${scopes}`, 'info');
        } else {
            console.error('Token debug error:', data);
            showNotification(`Token debug failed: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Debug token error:', error);
        showNotification('Error debugging token', 'error');
    } finally {
        debugTokenBtn.disabled = false;
        debugTokenBtn.textContent = 'Debug Token';
    }
}

async function exploreApi() {
    exploreApiBtn.disabled = true;
    exploreApiBtn.textContent = 'Exploring...';
    
    try {
        const response = await fetch('/debug/api-endpoints');
        const data = await response.json();
        
        if (response.ok) {
            console.log('API exploration results:', data.endpoints);
            let workingEndpoints = 0;
            Object.entries(data.endpoints).forEach(([endpoint, result]) => {
                if (result.success) workingEndpoints++;
            });
            showNotification(`Explored ${Object.keys(data.endpoints).length} endpoints, ${workingEndpoints} working. Check console.`, 'info');
        } else {
            console.error('API exploration error:', data);
            showNotification(`API exploration failed: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Explore API error:', error);
        showNotification('Error exploring API', 'error');
    } finally {
        exploreApiBtn.disabled = false;
        exploreApiBtn.textContent = 'Explore API';
    }
}

// API webhook subscription function
async function subscribeWebhookAPI() {
    const channel = channelInput.value.trim();
    
    if (!channel) {
        showNotification('Please enter a channel name first', 'error');
        channelInput.focus();
        return;
    }
    
    const apiWebhookBtn = document.getElementById('apiWebhookBtn');
    apiWebhookBtn.disabled = true;
    apiWebhookBtn.textContent = '🔔 Subscribing...';
    
    try {
        console.log('🔔 Attempting API webhook subscription for channel:', channel);
        
        const response = await fetch('/api/subscribe-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ channel_name: channel })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('✅ API webhook subscription successful:', data);
            showNotification(`Webhook subscribed via API for channel: ${channel}`, 'success');
            
            // Update webhook status
            if (webhookStatus) {
                webhookStatus.textContent = 'Webhooks: API Subscribed ✅';
                webhookStatus.style.color = '#28a745';
            }
        } else {
            console.error('❌ API webhook subscription failed:', data);
            showNotification(`API webhook subscription failed: ${data.error}`, 'error');
        }
        
    } catch (error) {
        console.error('API webhook subscription error:', error);
        showNotification('Error subscribing webhook via API', 'error');
    } finally {
        apiWebhookBtn.disabled = false;
        apiWebhookBtn.textContent = '🔔 Subscribe Webhook via API';
    }
}

// Check token permissions function
async function checkTokenPermissions() {
    const checkPermissionsBtn = document.getElementById('checkPermissionsBtn');
    checkPermissionsBtn.disabled = true;
    checkPermissionsBtn.textContent = '🔍 Checking...';
    
    try {
        console.log('🔍 Checking token permissions...');
        
        const response = await fetch('/debug/token-permissions');
        const data = await response.json();
        
        if (response.ok) {
            console.log('✅ Token permissions check results:', data.token_permissions);
            
            let workingApis = 0;
            let totalApis = 0;
            
            Object.entries(data.token_permissions).forEach(([api, result]) => {
                totalApis++;
                if (result.success) workingApis++;
                console.log(`${result.success ? '✅' : '❌'} ${api}:`, result);
            });
            
            showNotification(`Token permissions: ${workingApis}/${totalApis} APIs accessible. Check console for details.`, 'info');
        } else {
            console.error('❌ Token permissions check failed:', data);
            showNotification(`Token permissions check failed: ${data.error}`, 'error');
        }
        
    } catch (error) {
        console.error('Token permissions check error:', error);
        showNotification('Error checking token permissions', 'error');
    } finally {
        checkPermissionsBtn.disabled = false;
        checkPermissionsBtn.textContent = '🔍 Check Token Permissions';
    }
}

// Direct API test function
async function directApiTest() {
    const directApiTestBtn = document.getElementById('directApiTestBtn');
    directApiTestBtn.disabled = true;
    directApiTestBtn.textContent = '🎯 Testing...';
    
    try {
        console.log('🎯 Running direct API test...');
        
        const response = await fetch('/debug/direct-api-test');
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Direct API test successful:', data);
            showNotification('Direct API test successful! Token is valid.', 'success');
        } else {
            console.error('❌ Direct API test failed:', data);
            if (data.status === 403) {
                showNotification('Token appears to be invalid or expired. Try re-authenticating.', 'error');
            } else {
                showNotification(`Direct API test failed: ${data.error}`, 'error');
            }
        }
        
    } catch (error) {
        console.error('Direct API test error:', error);
        showNotification('Error running direct API test', 'error');
    } finally {
        directApiTestBtn.disabled = false;
        directApiTestBtn.textContent = '🎯 Direct API Test';
    }
}

// Test V1 Webhooks using our successful v1 API discovery
async function testV1Webhooks() {
    console.log('🎉 testV1Webhooks function called!');
    const testV1WebhooksBtn = document.getElementById('testV1Webhooks');
    const channelInput = document.getElementById('channelInput');
    
    console.log('Button found:', testV1WebhooksBtn);
    console.log('Button disabled?', testV1WebhooksBtn?.disabled);
    console.log('Channel input found:', channelInput);
    console.log('Is authenticated:', isAuthenticated);
    
    if (!isAuthenticated) {
        console.log('❌ Not authenticated, stopping');
        showNotification('Please authenticate first', 'error');
        return;
    }
    
    if (testV1WebhooksBtn?.disabled) {
        console.log('❌ Button is disabled, enabling it...');
        testV1WebhooksBtn.disabled = false;
    }
    
    const channelName = channelInput.value.trim();
    console.log('Channel name:', channelName);
    
    if (!channelName) {
        showNotification('Please enter a channel name first', 'error');
        console.log('❌ No channel name provided');
        return;
    }
    
    if (testV1WebhooksBtn) {
        testV1WebhooksBtn.disabled = true;
        testV1WebhooksBtn.textContent = '🎉 Testing V1 Webhooks...';
    }
    
    try {
        console.log('🎉 Testing V1 webhook endpoints with confirmed working API base...');
        showNotification('Testing V1 webhook endpoints...', 'info');
        
        console.log('Making fetch request to /api/subscribe-webhook');
        const response = await fetch('/api/subscribe-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel_name: channelName
            })
        });
        
        console.log('Fetch response received:', response.status);
        const result = await response.json();
        console.log('V1 Webhook test result:', result);
        
        if (result.success) {
            showNotification(`🎉 Webhook subscription successful! Using: ${result.endpoint_used}`, 'success');
            console.log('✅ V1 Webhook working:', result.data);
        } else if (result.best_result) {
            showNotification(`Found promising V1 endpoints: ${result.suggestion}`, 'info');
            console.log('💡 Best result:', result.best_result);
            
            if (result.best_result.getSuccess) {
                console.log('🔍 Endpoint data:', result.best_result.getData);
            }
        } else {
            showNotification(`V1 Webhook failed: ${result.error}`, 'error');
            console.error('❌ V1 Webhook error:', result);
        }
        
    } catch (error) {
        console.error('V1 Webhook test error:', error);
        showNotification('Error testing V1 webhooks', 'error');
    } finally {
        testV1WebhooksBtn.disabled = false;
        testV1WebhooksBtn.textContent = '🎉 V1 Webhook Test';
    }
}

// Debug function to test button manually from console
function debugTestV1Button() {
    console.log('🔧 Manual button test started');
    console.log('Button element:', document.getElementById('testV1Webhooks'));
    console.log('isAuthenticated:', isAuthenticated);
    console.log('Channel input value:', document.getElementById('channelInput')?.value);
    testV1Webhooks();
}

// Force V1 Test - bypasses authentication for debugging
async function forceV1Test() {
    console.log('🔧 FORCE V1 TEST STARTED - bypassing authentication');
    const forceV1TestBtn = document.getElementById('forceV1Test');
    const channelInput = document.getElementById('channelInput');
    
    const channelName = channelInput?.value?.trim() || 'xqc'; // Default to 'xqc' if no channel
    console.log('Using channel:', channelName);
    
    if (forceV1TestBtn) {
        forceV1TestBtn.disabled = true;
        forceV1TestBtn.textContent = '🔧 Testing Connection...';
    }
    
    try {
        // First test basic connectivity
        console.log('🔧 Step 1: Testing basic server connectivity...');
        showNotification('Step 1: Testing server connection...', 'info');
        
        const debugResponse = await fetch('/api/debug-test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                test: 'connectivity',
                channel: channelName,
                timestamp: new Date().toISOString()
            })
        });
        
        console.log('🔧 Basic connectivity test status:', debugResponse.status);
        const debugResult = await debugResponse.json();
        console.log('🔧 Basic connectivity result:', debugResult);
        
        if (!debugResult.success) {
            throw new Error('Basic connectivity failed');
        }
        
        showNotification('✅ Step 1: Server connection OK! Testing webhooks...', 'success');
        
        if (forceV1TestBtn) {
            forceV1TestBtn.textContent = '🔧 Testing Webhooks...';
        }
        
        // Now test webhook endpoints
        console.log('🔧 Step 2: Making webhook test request...');
        
        const response = await fetch('/api/subscribe-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel_name: channelName
            })
        });
        
        console.log('🔧 Webhook test response status:', response.status);
        const result = await response.json();
        console.log('🔧 Webhook test result:', result);
        
        if (result.success) {
            showNotification(`🎉 FORCE TEST SUCCESS! Webhook working on: ${result.endpoint_used}`, 'success');
        } else if (result.best_result) {
            showNotification(`🔧 Force test found endpoints: ${result.suggestion}`, 'info');
            console.log('🔧 Best result details:', result.best_result);
        } else {
            showNotification(`🔧 Force test failed: ${result.error || 'No endpoints found'}`, 'error');
        }
        
    } catch (error) {
        console.error('🔧 Force test error:', error);
        showNotification('Force test network error', 'error');
    } finally {
        if (forceV1TestBtn) {
            forceV1TestBtn.disabled = false;
            forceV1TestBtn.textContent = '🔧 Force V1 Test (Debug)';
        }
    }
}

// Make it available globally for console testing
window.debugTestV1Button = debugTestV1Button;
window.forceV1Test = forceV1Test;

// Try Chat Connection - alternative to webhooks since they're not publicly available
async function tryChatConnection() {
    console.log('🔄 TRYING CHAT CONNECTION INSTEAD OF WEBHOOKS');
    const tryChatConnectionBtn = document.getElementById('tryChatConnection');
    const channelInput = document.getElementById('channelInput');
    
    if (!isAuthenticated) {
        console.log('❌ Not authenticated, stopping');
        showNotification('Please authenticate first', 'error');
        return;
    }
    
    const channelName = channelInput?.value?.trim();
    if (!channelName) {
        showNotification('Please enter a channel name first', 'error');
        return;
    }
    
    if (tryChatConnectionBtn) {
        tryChatConnectionBtn.disabled = true;
        tryChatConnectionBtn.textContent = '🔄 Testing Chat APIs...';
    }
    
    try {
        console.log('🔄 Testing chat API endpoints instead of webhooks...');
        showNotification(`Testing chat APIs for: ${channelName}`, 'info');
        
        const response = await fetch('/api/try-chat-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel_name: channelName
            })
        });
        
        console.log('🔄 Chat API test response status:', response.status);
        const result = await response.json();
        console.log('🔄 Chat API test result:', result);
        
        if (result.success) {
            let workingEndpoints = result.results.filter(r => r.status === 200 && r.type === 'JSON');
            
            if (workingEndpoints.length > 0) {
                showNotification(`🎉 Found ${workingEndpoints.length} working chat APIs!`, 'success');
                console.log('🎉 Working chat endpoints:', workingEndpoints);
                
                // Show detailed results
                workingEndpoints.forEach(endpoint => {
                    console.log(`✅ ${endpoint.endpoint}:`, endpoint.sampleData);
                });
            } else {
                showNotification(`📊 Tested ${result.summary.total_tested} endpoints, ${result.summary.working_endpoints} responded`, 'info');  
                console.log('📊 Full results:', result.results);
            }
        } else {
            showNotification(`Chat API test failed: ${result.error}`, 'error');
            console.error('❌ Chat API error:', result);
        }
        
    } catch (error) {
        console.error('Chat connection test error:', error);
        showNotification('Error testing chat APIs', 'error');
    } finally {
        if (tryChatConnectionBtn) {
            tryChatConnectionBtn.disabled = false;
            tryChatConnectionBtn.textContent = '🔄 Try Chat API Instead';
        }
    }
}

// Make chat function available globally too
window.tryChatConnection = tryChatConnection;

// Examine Chat Data - detailed analysis of API responses for WebSocket/real-time info
async function examineChatData() {
    console.log('🔍 EXAMINING CHAT DATA FOR WEBSOCKET/REAL-TIME CONNECTIONS');
    const examineChatDataBtn = document.getElementById('examineChatData');
    const channelInput = document.getElementById('channelInput');
    
    if (!isAuthenticated) {
        console.log('❌ Not authenticated, stopping');
        showNotification('Please authenticate first', 'error');
        return;
    }
    
    const channelName = channelInput?.value?.trim();
    if (!channelName) {
        showNotification('Please enter a channel name first', 'error');
        return;
    }
    
    if (examineChatDataBtn) {
        examineChatDataBtn.disabled = true;
        examineChatDataBtn.textContent = '🔍 Examining...';
    }
    
    try {
        console.log('🔍 Examining detailed chat data for WebSocket connections...');
        showNotification(`Examining chat data for: ${channelName}`, 'info');
        
        const response = await fetch('/api/examine-chat-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel_name: channelName
            })
        });
        
        console.log('🔍 Chat data examination response status:', response.status);
        const result = await response.json();
        console.log('🔍 Chat data examination result:', result);
        
        if (result.success) {
            const wsCount = result.summary.websocket_endpoints;
            const workingCount = result.summary.working_endpoints;
            
            if (wsCount > 0) {
                showNotification(`🎉 Found WebSocket info in ${wsCount} endpoints!`, 'success');
                console.log('🎉 WEBSOCKET ENDPOINTS FOUND:', result.detailed_results);
                
                // Show which endpoints have WebSocket info
                Object.keys(result.detailed_results).forEach(endpointName => {
                    const endpoint = result.detailed_results[endpointName];
                    if (endpoint.hasWebSocket) {
                        console.log(`🚨 WEBSOCKET FOUND IN ${endpointName}:`, endpoint.fullData);
                    }
                    if (endpoint.chatroomKeys) {
                        console.log(`💬 CHATROOM DATA IN ${endpointName}:`, endpoint.chatroomKeys);
                    }
                });
            } else {
                showNotification(`📊 Examined ${workingCount} endpoints - ${result.next_steps}`, 'info');
                console.log('📊 Full examination results:', result.detailed_results);
                
                // Look for interesting chatroom data
                Object.keys(result.detailed_results).forEach(endpointName => {
                    const endpoint = result.detailed_results[endpointName];
                    if (endpoint.status === 'success') {
                        console.log(`✅ ${endpointName} data structure:`, endpoint.fullData);
                        if (endpoint.chatroomKeys) {
                            console.log(`💬 ${endpointName} chatroom keys:`, endpoint.chatroomKeys);
                        }
                    }
                });
            }
        } else {
            showNotification(`Chat data examination failed: ${result.error}`, 'error');
            console.error('❌ Chat examination error:', result);
        }
        
    } catch (error) {
        console.error('Chat data examination error:', error);
        showNotification('Error examining chat data', 'error');
    } finally {
        if (examineChatDataBtn) {
            examineChatDataBtn.disabled = false;
            examineChatDataBtn.textContent = '🔍 Examine Chat Data';
        }
    }
}

// New function to investigate Kick.com's native WebSocket connections 
async function investigateKickWebSockets() {
    const channelInput = document.getElementById('channelInput');
    const channelName = channelInput ? channelInput.value : 'holesomegamer';
    
    const investigateBtn = document.getElementById('investigateKickWS');
    
    try {
        if (investigateBtn) {
            investigateBtn.disabled = true;
            investigateBtn.textContent = '🔌 Investigating...';
        }
        
        showNotification('🔍 Investigating Kick.com native WebSocket connections...', 'info');
        
        const response = await fetch('/api/investigate-kick-websockets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        const result = await response.json();
        console.log('🔍 Kick WebSocket investigation result:', result);
        
        if (result.success) {
            const wsCount = result.summary.websocket_urls_found;
            const chatApis = result.summary.chat_apis_working;
            showNotification(`Kick WebSocket investigation complete! Found ${wsCount} WebSockets, ${chatApis} chat APIs. Check console.`, 'success');
            
            // Show key findings
            if (wsCount > 0) {
                console.log('🎉 KICK.COM WEBSOCKET URLS FOUND:');
                result.websocket_findings.forEach(finding => {
                    if (finding.generalWebSockets?.length > 0) {
                        console.log(`📍 ${finding.name} - General WebSockets:`);
                        finding.generalWebSockets.forEach(url => console.log(`   🔌 ${url}`));
                    }
                    if (finding.kickWebSockets?.length > 0) {
                        console.log(`📍 ${finding.name} - Kick WebSockets:`);
                        finding.kickWebSockets.forEach(url => console.log(`   🎯 ${url}`));
                    }
                });
            }
            
            if (chatApis > 0) {
                console.log('💬 KICK.COM CHAT APIS FOUND:');
                result.chat_api_findings.forEach(api => {
                    console.log(`   ✅ ${api.url} (${api.status})`);
                });
            }
        } else {
            showNotification('Kick WebSocket investigation failed', 'error');
        }
        
    } catch (error) {
        console.error('Kick WebSocket investigation error:', error);
        showNotification('Kick WebSocket investigation failed', 'error');
    } finally {
        if (investigateBtn) {
            investigateBtn.disabled = false;
            investigateBtn.textContent = '🔌 Find Kick WebSockets';
        }
    }
}

// New function to inspect actual chat message content and structure
async function inspectChatMessages() {
    const channelInput = document.getElementById('channelInput');
    const channelName = channelInput ? channelInput.value : 'holesomegamer';
    
    const inspectBtn = document.getElementById('inspectMessages');
    
    try {
        if (inspectBtn) {
            inspectBtn.disabled = true;
            inspectBtn.textContent = '💬 Inspecting...';
        }
        
        showNotification('🔍 Inspecting chat message data structure...', 'info');
        
        const response = await fetch('/api/inspect-chat-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        const result = await response.json();
        console.log('🔍 Chat message inspection result:', result);
        
        if (result.success) {
            const totalMessages = result.summary.total_messages;
            const chatEndpoints = result.summary.chat_like_endpoints;
            showNotification(`Chat inspection complete! Found ${totalMessages} messages across ${chatEndpoints} chat endpoints. Check console.`, 'success');
            
            // Show detailed findings
            console.log('💬 CHAT MESSAGE ANALYSIS:');
            console.log(`📊 Summary: ${result.summary.working_endpoints} working endpoints, ${totalMessages} total messages`);
            
            result.investigations.forEach(investigation => {
                if (investigation.success) {
                    console.log(`\n📍 ${investigation.name}:`);
                    console.log(`   📊 Type: ${investigation.finalType}`);
                    console.log(`   📏 Messages: ${investigation.messageCount || 'N/A'}`);
                    
                    if (investigation.structure) {
                        console.log(`   🔑 Keys: ${investigation.structure.keys.join(', ')}`);
                    }
                    
                    if (investigation.sampleMessages && investigation.sampleMessages.length > 0) {
                        console.log(`   📝 Sample message structure:`);
                        investigation.sampleMessages.forEach((sample, idx) => {
                            console.log(`     ${idx + 1}. Keys: ${sample.keys?.join(', ')}`);
                            console.log(`        Content: ${sample.hasContent ? '✅' : '❌'}`);
                            console.log(`        User: ${sample.hasUser ? '✅' : '❌'}`);
                            console.log(`        Time: ${sample.hasTime ? '✅' : '❌'}`);
                            if (sample.sample) {
                                console.log(`        Preview: ${sample.sample}`);
                            }
                        });
                    }
                }
            });
            
            if (result.chat_endpoints.length > 0) {
                console.log('\n🎉 CHAT-LIKE ENDPOINTS FOUND:');
                result.chat_endpoints.forEach(endpoint => {
                    console.log(`   ✅ ${endpoint.name}: ${endpoint.url}`);
                });
                
                showNotification('✨ Chat endpoints with message structure found! Ready for implementation.', 'success');
            }
            
        } else {
            showNotification('Chat message inspection failed', 'error');
        }
        
    } catch (error) {
        console.error('Chat message inspection error:', error);
        showNotification('Chat message inspection failed', 'error');
    } finally {
        if (inspectBtn) {
            inspectBtn.disabled = false;
            inspectBtn.textContent = '💬 Inspect Chat Messages';
        }
    }
}

// New function to inspect raw content from chat APIs
async function inspectRawContent() {
    const channelInput = document.getElementById('channelInput');
    const channelName = channelInput ? channelInput.value : 'holesomegamer';
    
    const inspectBtn = document.getElementById('inspectRawContent');
    
    try {
        if (inspectBtn) {
            inspectBtn.disabled = true;
            inspectBtn.textContent = '📄 Analyzing...';
        }
        
        showNotification('🔍 Inspecting raw content from chat APIs...', 'info');
        
        const response = await fetch('/api/inspect-raw-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        const result = await response.json();
        console.log('🔍 Raw content inspection result:', result);
        
        if (result.success) {
            const analysis = result.analysis;
            showNotification(`Raw content analysis complete! Content type: ${analysis.isHtml ? 'HTML' : analysis.isJson ? 'JSON' : 'Text'}. Check console.`, 'info');
            
            // Show detailed analysis
            console.log('📄 RAW CONTENT ANALYSIS:');
            console.log(`🌐 URL: ${result.url}`);
            console.log(`📊 Status: ${analysis.status}`);
            console.log(`📋 Content-Type: ${analysis.contentType}`);
            console.log(`📏 Length: ${analysis.length} characters`);
            console.log(`📄 Format: ${analysis.isHtml ? 'HTML' : analysis.isJson ? 'JSON' : analysis.isXml ? 'XML' : 'Plain Text'}`);
            
            console.log('\n🔍 Content Analysis:');
            console.log(`   🎯 Contains Kick: ${analysis.containsKick ? '✅' : '❌'}`);
            console.log(`   💬 Contains Chat: ${analysis.containsChat ? '✅' : '❌'}`);
            console.log(`   ❌ Contains Error: ${analysis.containsError ? '✅' : '❌'}`);
            console.log(`   🔑 Keywords: ${analysis.keywords.join(', ')}`);
            
            console.log('\n📄 Content Preview:');
            console.log('--- FIRST 500 CHARS ---');
            console.log(analysis.firstChars);
            console.log('--- LAST 200 CHARS ---');
            console.log(analysis.lastChars);
            
            if (result.alternative_tests.length > 0) {
                console.log('\n🧪 Alternative Header Tests:');
                result.alternative_tests.forEach(test => {
                    if (test.error) {
                        console.log(`   ❌ ${test.name}: ${test.error}`);
                    } else {
                        console.log(`   ${test.different ? '🔄' : '📋'} ${test.name}: ${test.status} (${test.length} chars) ${test.different ? '- DIFFERENT CONTENT!' : ''}`);
                    }
                });
            }
            
            // Give specific recommendations
            if (analysis.isHtml) {
                showNotification('⚠️ API returning HTML instead of JSON. May need different authentication or endpoints.', 'warning');
            } else if (analysis.containsError) {
                showNotification('❌ API returning error content. Check authentication or permissions.', 'error');
            } else if (analysis.isJson) {
                showNotification('✅ Found JSON content! This might be the chat data we need.', 'success');
            }
            
        } else {
            showNotification('Raw content inspection failed', 'error');
        }
        
    } catch (error) {
        console.error('Raw content inspection error:', error);
        showNotification('Raw content inspection failed', 'error');
    } finally {
        if (inspectBtn) {
            inspectBtn.disabled = false;
            inspectBtn.textContent = '📄 Inspect Raw Content';
        }
    }
}

// New function to discover Kick.com's actual current API endpoints
async function discoverRealEndpoints() {
    const channelInput = document.getElementById('channelInput');
    const channelName = channelInput ? channelInput.value : 'holesomegamer';
    
    const discoverBtn = document.getElementById('discoverEndpoints');
    
    try {
        if (discoverBtn) {
            discoverBtn.disabled = true;
            discoverBtn.textContent = '🎯 Discovering...';
        }
        
        showNotification('🔍 Discovering Kick.com\'s real API endpoints...', 'info');
        
        const response = await fetch('/api/discover-real-endpoints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        const result = await response.json();
        console.log('🔍 API endpoint discovery result:', result);
        
        if (result.success) {
            const apis = result.summary.api_endpoints_found;
            const workingApis = result.summary.working_json_apis;
            const websockets = result.summary.websocket_urls_found;
            
            showNotification(`Discovery complete! Found ${apis} API endpoints, ${workingApis} working JSON APIs, ${websockets} WebSockets. Check console.`, 'success');
            
            // Show detailed findings
            console.log('🎯 REAL API ENDPOINT DISCOVERY:');
            console.log(`📊 Summary: Found ${apis} endpoints, ${workingApis} working, ${websockets} WebSockets`);
            
            if (result.discovered_apis.length > 0) {
                console.log('\n📡 DISCOVERED API ENDPOINTS:');
                result.discovered_apis.forEach((api, index) => {
                    console.log(`   ${index + 1}. ${api}`);
                });
            }
            
            if (result.websocket_urls.length > 0) {
                console.log('\n🔌 DISCOVERED WEBSOCKET URLS:');
                result.websocket_urls.forEach((ws, index) => {
                    console.log(`   ${index + 1}. ${ws}`);
                });
            }
            
            if (result.working_modern_endpoints.length > 0) {
                console.log('\n✅ WORKING JSON APIS FOUND:');
                result.working_modern_endpoints.forEach((endpoint, index) => {
                    console.log(`   ${index + 1}. ${endpoint.url} (${endpoint.status})`);
                    console.log(`      📄 Type: ${endpoint.contentType}`);
                    console.log(`      📊 Preview: ${endpoint.dataPreview}...`);
                });
                
                showNotification('🎉 Working JSON APIs discovered! Ready for chat integration!', 'success');
            }
            
            if (result.tested_endpoints.filter(e => e.working).length > 0) {
                console.log('\n✅ TESTED WORKING ENDPOINTS:');
                result.tested_endpoints.filter(e => e.working).forEach((endpoint, index) => {
                    console.log(`   ${index + 1}. ${endpoint.url} (${endpoint.status})`);
                });
            }
            
            if (result.javascript_config.length > 0) {
                console.log('\n🔧 JAVASCRIPT CONFIG DATA:');
                result.javascript_config.forEach((config, index) => {
                    console.log(`   Script ${config.script}: ${config.config}`);
                });
            }
            
            if (Object.keys(result.extracted_ids).length > 0) {
                console.log('\n🆔 EXTRACTED IDs:');
                Object.entries(result.extracted_ids).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            }
            
            // Give specific next steps
            if (workingApis > 0) {
                showNotification('🚀 Ready to implement chat! Working APIs found.', 'success');
            } else if (apis > 0) {
                showNotification('⚠️ APIs found but need authentication. Check JavaScript config.', 'warning');
            } else if (websockets > 0) {
                showNotification('🔌 WebSocket URLs found! May need WebSocket implementation.', 'info');
            }
            
        } else {
            showNotification('API endpoint discovery failed', 'error');
        }
        
    } catch (error) {
        console.error('API endpoint discovery error:', error);
        showNotification('API endpoint discovery failed', 'error');
    } finally {
        if (discoverBtn) {
            discoverBtn.disabled = false;
            discoverBtn.textContent = '🎯 Discover Real APIs';
        }
    }
}

// New function to extract JavaScript configuration data for chat
async function extractJSConfig() {
    const channelInput = document.getElementById('channelInput');
    const channelName = channelInput ? channelInput.value : 'holesomegamer';
    
    const extractBtn = document.getElementById('extractJSConfig');
    
    try {
        if (extractBtn) {
            extractBtn.disabled = true;
            extractBtn.textContent = '🔧 Extracting...';
        }
        
        showNotification('🔍 Extracting JavaScript configuration data...', 'info');
        
        const response = await fetch('/api/extract-js-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        const result = await response.json();
        console.log('🔍 JavaScript config extraction result:', result);
        
        if (result.success) {
            const websockets = result.summary.websocket_urls_found;
            const apis = result.summary.api_endpoints_found;
            const configs = result.summary.config_objects_found;
            const chatItems = result.summary.chat_config_items;
            
            showNotification(`JS Config extracted! ${websockets} WebSockets, ${apis} APIs, ${configs} configs, ${chatItems} chat items. Check console.`, 'success');
            
            // Show detailed findings
            console.log('🔧 JAVASCRIPT CONFIG EXTRACTION:');
            console.log(`📊 Summary: ${websockets} WebSockets, ${apis} APIs, ${configs} configs, ${chatItems} chat items`);
            
            if (result.websocket_urls.length > 0) {
                console.log('\n🔌 WEBSOCKET URLS FROM JAVASCRIPT:');
                result.websocket_urls.forEach((ws, index) => {
                    console.log(`   ${index + 1}. ${ws}`);
                });
                
                showNotification('🎉 WebSocket URLs found in JavaScript! Ready for real-time chat!', 'success');
            }
            
            if (result.api_endpoints.length > 0) {
                console.log('\n📡 API ENDPOINTS FROM JAVASCRIPT:');
                result.api_endpoints.forEach((api, index) => {
                    console.log(`   ${index + 1}. ${api}`);
                });
            }
            
            if (Object.keys(result.chat_config).length > 0) {
                console.log('\n💬 CHAT CONFIGURATION:');
                Object.entries(result.chat_config).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            }
            
            if (Object.keys(result.ids).length > 0) {
                console.log('\n🆔 ID VALUES:');
                Object.entries(result.ids).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            }
            
            if (Object.keys(result.tokens).length > 0) {
                console.log('\n🔑 TOKEN VALUES:');
                Object.entries(result.tokens).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value.substring(0, 20)}...`);
                });
            }
            
            if (Object.keys(result.pusher_config).length > 0) {
                console.log('\n🔔 PUSHER CONFIGURATION:');
                Object.entries(result.pusher_config).forEach(([key, values]) => {
                    console.log(`   ${key}: ${Array.isArray(values) ? values.join(', ') : values}`);
                });
            }
            
            if (Object.keys(result.chat_initialization).length > 0) {
                console.log('\n💬 CHAT INITIALIZATION:');
                Object.entries(result.chat_initialization).forEach(([key, values]) => {
                    console.log(`   ${key}: ${Array.isArray(values) ? values.join(', ') : values}`);
                });
            }
            
            if (result.raw_configs.length > 0) {
                console.log('\n🔧 RAW CONFIG OBJECTS:');
                result.raw_configs.forEach((config, index) => {
                    console.log(`   ${index + 1}. Script ${config.script} - ${config.name}`);
                    if (config.parsed) {
                        console.log(`      📊 Parsed keys: ${Object.keys(config.parsed).join(', ')}`);
                    }
                    console.log(`      📄 Raw: ${config.raw.substring(0, 150)}...`);
                });
            }
            
            // Give specific recommendations
            if (websockets > 0) {
                showNotification('🚀 WebSockets found! Ready to implement real-time chat!', 'success');
            } else if (Object.keys(result.pusher_config).length > 0) {
                showNotification('🔔 Pusher config found! Kick.com likely uses Pusher for real-time.', 'info');
            } else if (apis > 0) {
                showNotification('📡 New APIs found! Test these for chat functionality.', 'info');
            } else if (configs > 0) {
                showNotification('⚠️ Config objects found but need deeper analysis.', 'warning');
            }
            
        } else {
            showNotification('JavaScript config extraction failed', 'error');
        }
        
    } catch (error) {
        console.error('JavaScript config extraction error:', error);
        showNotification('JavaScript config extraction failed', 'error');
    } finally {
        if (extractBtn) {
            extractBtn.disabled = false;
            extractBtn.textContent = '🔧 Extract JS Config';
        }
    }
}

// Investigate how Kick.com's chat actually works
async function investigateChatImplementation() {
    console.log('🔍 investigateChatImplementation function called!');
    
    const channelName = document.getElementById('channelInput').value.trim();
    console.log('Channel name:', channelName);
    
    if (!channelName) {
        console.log('❌ No channel name provided');
        showNotification('Please enter a channel name', 'error');
        return;
    }

    try {
        console.log('📡 Making fetch request to /api/investigate-chat-implementation');
        showNotification('🔍 INVESTIGATING HOW KICK.COM CHAT ACTUALLY WORKS...', 'info');
        
        const response = await fetch('/api/investigate-chat-implementation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        console.log('📡 Response received:', response);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Response data:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Investigation failed');
        }
        
        let output = `🔍 REAL-TIME CHAT IMPLEMENTATION INVESTIGATION COMPLETE!\n\n`;
        output += `📊 SUMMARY:\n`;
        output += `   📡 SSE endpoints found: ${data.summary.sse_endpoints_found}\n`;
        output += `   🌐 Alternative domains active: ${data.summary.alternative_domains_active}\n`;
        output += `   💬 Chat APIs found: ${data.summary.chat_apis_found}\n`;
        output += `   🔄 Real-time services detected: ${data.summary.realtime_services_detected}\n`;
        output += `   📈 Dynamic endpoints found: ${data.summary.dynamic_endpoints_found}\n\n`;
        
        if (data.sse_endpoints.length > 0) {
            output += `📡 SERVER-SENT EVENT ENDPOINTS:\n`;
            data.sse_endpoints.forEach((endpoint, i) => {
                output += `   ${i + 1}. ${endpoint.url}\n`;
                output += `      Status: ${endpoint.status}, Type: ${endpoint.contentType}\n`;
                if (endpoint.data) {
                    output += `      Data: ${endpoint.data.substring(0, 100)}...\n`;
                }
            });
            output += `\n`;
        }
        
        if (data.alternative_domains.length > 0) {
            output += `🌐 ACTIVE ALTERNATIVE DOMAINS:\n`;
            data.alternative_domains.forEach((domain, i) => {
                output += `   ${i + 1}. ${domain.domain} (${domain.status})\n`;
                output += `      WebSocket related: ${domain.containsWebSocket}\n`;
                output += `      Chat related: ${domain.containsChat}\n`;
            });
            output += `\n`;
        }
        
        if (data.chat_specific_apis.length > 0) {
            output += `💬 CHAT-SPECIFIC APIS DISCOVERED:\n`;
            data.chat_specific_apis.forEach((api, i) => {
                output += `   ${i + 1}. ${api.url}\n`;
                output += `      Status: ${api.status}, Type: ${api.contentType}\n`;
                output += `      Chat API: ${api.isChat}\n`;
                if (api.dataPreview) {
                    output += `      Preview: ${api.dataPreview.substring(0, 150)}...\n`;
                }
            });
            output += `\n`;
        }
        
        if (data.realtime_services.length > 0) {
            output += `🔄 REAL-TIME SERVICES DETECTED:\n`;
            data.realtime_services.forEach((service, i) => {
                output += `   ${i + 1}. ${service.service} (found in ${service.context})\n`;
            });
            output += `\n`;
        }
        
        if (data.polling_candidates.length > 0) {
            output += `📈 POLLING ENDPOINT CANDIDATES:\n`;
            data.polling_candidates.forEach((endpoint, i) => {
                output += `   ${i + 1}. ${endpoint.url}\n`;
                output += `      Dynamic: ${endpoint.dynamic} - ${endpoint.note}\n`;
            });
            output += `\n`;
        }
        
        output += `🎯 RECOMMENDATION:\n${data.recommendations}\n\n`;
        
        output += `🔧 TECHNICAL DETAILS:\n`;
        output += `   Channel ID: ${data.channel_id}\n`;
        output += `   Chatroom ID: ${data.chatroom_id}\n`;
        
        document.getElementById('results').innerHTML = `<pre>${output}</pre>`;
        showNotification(`✅ Chat implementation investigation complete! Found ${data.summary.sse_endpoints_found + data.summary.chat_apis_found + data.summary.dynamic_endpoints_found} potential endpoints`, 'success');
        
    } catch (error) {
        console.error('❌ Investigation error:', error);
        showNotification(`❌ Chat investigation failed: ${error.message}`, 'error');
        document.getElementById('results').innerHTML = `<pre>❌ Investigation failed: ${error.message}</pre>`;
    }
}

// Analyze the content of the working endpoints we discovered
async function analyzeWorkingEndpoints() {
    console.log('🎯 analyzeWorkingEndpoints function called!');
    
    const channelName = document.getElementById('channelInput').value.trim();
    console.log('Channel name:', channelName);
    
    if (!channelName) {
        console.log('❌ No channel name provided');
        showNotification('Please enter a channel name', 'error');
        return;
    }

    try {
        console.log('📡 Making fetch request to /api/analyze-working-endpoints');
        showNotification('🎯 ANALYZING CONTENT OF WORKING ENDPOINTS...', 'info');
        
        const response = await fetch('/api/analyze-working-endpoints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        console.log('📡 Response received:', response);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Response data:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Analysis failed');
        }
        
        let output = `🎯 WORKING ENDPOINTS CONTENT ANALYSIS COMPLETE!\n\n`;
        output += `📊 SUMMARY:\n`;
        output += `   ✅ Working endpoints: ${data.summary.working_endpoints}/4\n`;
        output += `   💬 Chat-relevant endpoints: ${data.summary.chat_relevant}\n`;
        output += `   🔄 Real-time indicators found: ${data.summary.real_time_indicators}\n`;
        output += `   📋 JSON endpoints found: ${data.summary.json_endpoints}\n`;
        output += `   🏆 Top endpoint: ${data.summary.top_endpoint}\n\n`;
        
        if (data.endpoints.length > 0) {
            output += `🔍 DETAILED ENDPOINT ANALYSIS:\n\n`;
            data.endpoints.forEach((endpoint, i) => {
                output += `${i + 1}. ${endpoint.name} (Score: ${endpoint.chatRelevanceScore || 0})\n`;
                output += `   URL: ${endpoint.url}\n`;
                output += `   Status: ${endpoint.status || 'Error'} ${endpoint.statusText || ''}\n`;
                
                if (endpoint.error) {
                    output += `   ❌ Error: ${endpoint.error}\n`;
                } else {
                    output += `   Content-Type: ${endpoint.contentType}\n`;
                    output += `   Data Length: ${endpoint.dataLength} chars\n`;
                    output += `   💬 Contains Chat: ${endpoint.containsChat}\n`;
                    output += `   🔌 Contains WebSocket: ${endpoint.containsWebSocket}\n`;
                    output += `   📡 Contains Pusher: ${endpoint.containsPusher}\n`;
                    output += `   💬 Contains Messages: ${endpoint.containsMessages}\n`;
                    output += `   🔄 Real-time Indicators: ${endpoint.hasRealTimeIndicators}\n`;
                    output += `   📋 Format: ${endpoint.isJson ? 'JSON' : endpoint.isHtml ? 'HTML' : endpoint.isEventStream ? 'Event Stream' : 'Other'}\n`;
                    
                    if (endpoint.dataPreview) {
                        output += `   📄 Preview:\n      ${endpoint.dataPreview.substring(0, 200).replace(/\n/g, '\\n')}...\n`;
                    }
                }
                output += `\n`;
            });
        }
        
        output += `🎯 RECOMMENDATION: ${data.recommendations}\n\n`;
        output += `🚀 NEXT STEPS: ${data.next_steps}\n`;
        
        const resultsElement = document.getElementById('results');
        if (resultsElement) {
            resultsElement.innerHTML = `<pre>${output}</pre>`;
        } else {
            console.log('📋 Results (no results element found):');
            console.log(output);
            alert('Results logged to console - check Developer Tools');
        }
        
        const bestEndpoint = data.endpoints.find(e => e.chatRelevanceScore > 5);
        if (bestEndpoint) {
            showNotification(`🎯 HIGH-PRIORITY ENDPOINT FOUND: ${bestEndpoint.name} (Score: ${bestEndpoint.chatRelevanceScore})!`, 'success');
        } else {
            showNotification(`✅ Analysis complete! Found ${data.summary.working_endpoints} working endpoints`, 'success');
        }
        
    } catch (error) {
        console.error('❌ Analysis error:', error);
        showNotification(`❌ Analysis failed: ${error.message}`, 'error');
        
        const resultsElement = document.getElementById('results');
        if (resultsElement) {
            resultsElement.innerHTML = `<pre>❌ Analysis failed: ${error.message}</pre>`;
        } else {
            console.log(`❌ Analysis failed: ${error.message}`);
            alert(`Analysis failed: ${error.message}`);
        }
    }
}

// Text-to-Speech Management
let ttsQueue = [];
let isSpeaking = false;
let ttsCount = 0;
let replayCount = 0; // Track manual replays
let speechSynthesis = window.speechSynthesis;

// Debug and Polling Configuration
let debugMode = false; // Toggle for debug output - SET TO FALSE for production
let pollingIntervalMs = 30000; // 30 seconds default (was 15, now reduced API calls)
let isPollingActive = false;

// Debug helper functions
function debugLog(...args) {
    if (debugMode) console.log(...args);
}

function toggleDebugMode() {
    debugMode = !debugMode;
    console.log(`🐛 Debug mode ${debugMode ? 'ENABLED' : 'DISABLED'}`);
    return debugMode;
}

// Set up TTS controls
function setupTTSControls() {
    const ttsSpeedSlider = document.getElementById('ttsSpeed');
    const speedValueSpan = document.getElementById('speedValue');
    const pollingIntervalSlider = document.getElementById('pollingInterval');
    const intervalValueSpan = document.getElementById('intervalValue');
    const debugCheckbox = document.getElementById('debugMode');
    const stopPollingBtn = document.getElementById('stopPollingBtn');
    
    // TTS Speed control
    if (ttsSpeedSlider && speedValueSpan) {
        ttsSpeedSlider.addEventListener('input', function() {
            speedValueSpan.textContent = parseFloat(this.value).toFixed(1);
        });
    }
    
    // Polling interval control
    if (pollingIntervalSlider && intervalValueSpan) {
        pollingIntervalSlider.addEventListener('input', function() {
            const newInterval = parseInt(this.value) * 1000;
            intervalValueSpan.textContent = this.value;
            pollingIntervalMs = newInterval;
            
            // If currently polling, restart with new interval
            if (isPollingActive && currentChannel) {
                debugLog(`🔄 Updating polling interval to ${this.value} seconds`);
                startChatPolling(currentChannel);
            }
        });
    }
    
    // Debug mode control
    if (debugCheckbox) {
        debugCheckbox.addEventListener('change', function() {
            debugMode = this.checked;
            console.log(`🐛 Debug mode ${debugMode ? 'ENABLED' : 'DISABLED'}`);
            console.log('🐛 Tip: Debug mode shows detailed console logs for troubleshooting');
        });
    }
    
    // Set up stop polling button
    const stopPollingBtn = document.getElementById('stopPollingBtn');
    if (stopPollingBtn) {
        stopPollingBtn.addEventListener('click', function() {
            stopChatPolling();
            this.style.display = 'none';
        });
    }
    
    // Stop polling button
    if (stopPollingBtn) {
        stopPollingBtn.addEventListener('click', function() {
            stopChatPolling();
            isMonitoring = false;
            updateUI();
            showNotification('Chat monitoring stopped', 'info');
        });
    }
}

// Speak text using TTS
function speakText(text, username, forceReplay = false, onComplete = null) {
    const ttsEnabled = document.getElementById('ttsEnabled')?.checked;
    const ttsSpeed = parseFloat(document.getElementById('ttsSpeed')?.value || 1);
    
    if (!ttsEnabled || !speechSynthesis) {
        console.log('🔊 TTS disabled or not available');
        if (onComplete) onComplete(false);
        return;
    }
    
    // Check if text is valid
    if (!text || typeof text !== 'string') {
        console.log('🔊 TTS: Skipping invalid text:', text);
        if (onComplete) onComplete(false);
        return;
    }
    
    // Clean up text for TTS
    const cleanText = text.replace(/[^\w\s.,!?-]/g, '').trim();
    if (cleanText.length < 2) {
        console.log('🔊 TTS: Skipping short message:', cleanText);
        if (onComplete) onComplete(false);
        return; // Skip very short messages
    }
    
    // Log whether this is a manual or auto replay
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

// Process next item in TTS queue
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
    if (lastUpdateEl) lastUpdateEl.textContent = `Last Update: ${new Date().toLocaleTimeString()} (Cache: ${processedMessages.size})`;
}

// Clear old messages from cache to prevent memory buildup
function cleanupMessageCache() {
    const maxCacheSize = 100; // Keep only last 100 unique messages
    
    if (processedMessages.size > maxCacheSize) {
        console.log(`🧹 Cleaning message cache: ${processedMessages.size} -> ${maxCacheSize}`);
        
        // Convert to array, sort by timestamp, keep newest
        const sortedMessages = Array.from(messageHistory.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, maxCacheSize);
        
        // Clear and rebuild caches
        processedMessages.clear();
        messageHistory.clear();
        
        sortedMessages.forEach(msg => {
            processedMessages.add(msg.uniqueId);
            messageHistory.set(msg.uniqueId, msg);
        });
        
        console.log(`🧹 Cache cleaned: kept ${sortedMessages.length} newest messages`);
    }
}

// Debug function to show cache status
function showCacheStatus() {
    console.log('📊 MESSAGE CACHE STATUS:');
    console.log(`   📋 Total processed messages: ${processedMessages.size}`);
    console.log(`   💾 Messages in history: ${messageHistory.size}`);
    console.log(`   🔊 Auto-played messages: ${Array.from(messageHistory.values()).filter(m => m.played).length}`);
    console.log(`   ⏳ Pending messages: ${Array.from(messageHistory.values()).filter(m => !m.played).length}`);
}

// Call cleanup periodically
setInterval(cleanupMessageCache, 60000); // Clean cache every minute

// Make debug functions globally accessible
window.showCacheStatus = showCacheStatus;
window.clearMessageCache = function() {
    if (confirm('Clear message cache? This will reset TTS played status for all messages.')) {
        processedMessages.clear();
        messageHistory.clear();
        console.log('🧹 Message cache cleared manually');
        updateMessageStats();
        alert('Message cache cleared!');
    }
};

// Display chat messages on the page
let displayedMessageCount = 0;
let processedMessages = new Set(); // Track unique messages that have been processed
let messageHistory = new Map(); // Store message objects by unique ID

function displayChatMessages(messages) {
    debugLog('📋 displayChatMessages called with:', messages?.length, 'messages');
    
    if (messages && messages.length > 0 && debugMode) {
        console.log('📋 First message structure:', JSON.stringify(messages[0], null, 2));
    }
    
    const chatContainer = document.getElementById('liveChatMessages');
    if (!chatContainer) {
        console.error('❌ liveChatMessages container not found!');
        return;
    }
    
    if (!messages || messages.length === 0) {
        console.log('📋 No messages to display');
        chatContainer.innerHTML = '<div class="no-messages">💬 No chat messages found...</div>';
        return;
    }
    
    // Process messages and identify new ones
    const newMessages = [];
    const allCurrentMessages = [];
    
    messages.forEach(msg => {
        // Create unique identifier using ID and timestamp
        const uniqueId = `${msg.id}_${msg.timestamp}`;
        
        // Check if this is a new message
        if (!processedMessages.has(uniqueId)) {
            // This is a new message
            msg.uniqueId = uniqueId;
            msg.played = false; // Initialize as unplayed
            processedMessages.add(uniqueId);
            messageHistory.set(uniqueId, msg);
            newMessages.push(msg);
            console.log(`📋 NEW MESSAGE: ${msg.user}: ${msg.message.substring(0, 30)}... (ID: ${uniqueId})`);
        } else {
            // This is an existing message, get preserved state
            const existingMsg = messageHistory.get(uniqueId);
            msg.uniqueId = uniqueId;
            msg.played = existingMsg.played; // Preserve played status
            messageHistory.set(uniqueId, msg); // Update with latest data
        }
        
        allCurrentMessages.push(msg);
    });
    
    console.log(`📋 Processing: ${messages.length} total messages, ${newMessages.length} new messages`);
    console.log(`📋 Processed messages cache size: ${processedMessages.size}`);
    
    // Clear and rebuild display
    chatContainer.innerHTML = '';
    displayedMessageCount = allCurrentMessages.length;
    
    allCurrentMessages.forEach((msg, index) => {
        console.log(`📋 Processing message ${index + 1}:`, msg);
        console.log(`📋 Message fields: user=${msg.user}, message=${msg.message}, timestamp=${msg.timestamp}, played=${msg.played}, uniqueId=${msg.uniqueId}`);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        messageDiv.dataset.messageId = msg.uniqueId; // Store unique message ID for tracking
        
        // Create user color style if available
        const userStyle = msg.color ? `style="color: ${msg.color};"` : '';
        
        // Format badges
        const badges = (msg.badges || []).map(badge => 
            `<span class="badge badge-${badge.type}">${badge.text || badge.type}</span>`
        ).join(' ');
        
        // Test timestamp formatting
        const formattedTime = formatTimestamp(msg.timestamp);
        console.log(`📋 Timestamp: ${msg.timestamp} -> ${formattedTime}`);
        
        // Ensure we have values for required fields
        const safeUser = msg.user || 'Unknown';
        const safeMessage = msg.message || '[No message]';
        const playedIndicator = msg.played ? '🔇' : '🔊'; // Visual indicator for played/unplayed
        
        messageDiv.innerHTML = `
            <span class="chat-user" ${userStyle}>${escapeHtml(safeUser)}</span>
            ${badges}
            <span class="chat-text">${escapeHtml(safeMessage)}</span>
            <span class="play-indicator" title="${msg.played ? 'Already played (click to replay)' : 'Not yet played'}">${playedIndicator}</span>
            <span class="chat-timestamp">${formattedTime}</span>
        `;
        
        chatContainer.appendChild(messageDiv);
        console.log(`📋 Message ${index + 1} added to container`);
        
        // Add click handler for manual replay
        messageDiv.addEventListener('click', () => {
            console.log(`🔊 Manual replay requested for: ${safeUser}: ${safeMessage}`);
            replayCount++; // Increment manual replay counter
            
            // Update visual indicator immediately for user feedback
            const indicator = messageDiv.querySelector('.play-indicator');
            if (indicator) {
                indicator.textContent = '🔄'; // Show "replaying" indicator
                indicator.title = 'Playing...';
            }
            
            speakText(safeMessage, safeUser, true, (success) => {
                // Update indicator based on success/failure
                if (indicator) {
                    if (success) {
                        indicator.textContent = '🔇';
                        indicator.title = 'Already played (click to replay)';
                    } else {
                        indicator.textContent = '❌';
                        indicator.title = 'TTS failed (click to retry)';
                    }
                }
            }); // true = force replay
            updateMessageStats(); // Update stats display immediately
        });
        
        messageDiv.style.cursor = 'pointer';
        messageDiv.title = 'Click to replay message';
    });
    
    // Only queue NEW messages for TTS (not all messages)
    if (newMessages.length > 0) {
        console.log(`🔊 Queuing ${newMessages.length} NEW messages for TTS`);
        
        newMessages.forEach((msg, index) => {
            const safeUser = msg.user || 'Unknown';
            const safeMessage = msg.message || '[No message]';
            
            if (safeMessage && safeMessage !== '[No message]') {
                setTimeout(() => {
                    console.log(`🔊 Auto-playing NEW message: ${safeUser}: ${safeMessage.substring(0, 30)}... (${msg.uniqueId})`);
                    speakText(safeMessage, safeUser, false, (success) => {
                        if (success) {
                            msg.played = true; // Mark as played after successful TTS
                            messageHistory.set(msg.uniqueId, msg); // Update stored message
                            
                            // Update visual indicator in DOM
                            const messageElement = document.querySelector(`[data-message-id="${msg.uniqueId}"]`);
                            if (messageElement) {
                                const indicator = messageElement.querySelector('.play-indicator');
                                if (indicator) {
                                    indicator.textContent = '🔇';
                                    indicator.title = 'Already played (click to replay)';
                                }
                            }
                            console.log(`🔊 NEW message marked as played: ${safeUser} (${msg.uniqueId})`);
                        }
                    });
                }, index * 500); // Longer delay between messages to avoid overwhelming
            }
        });
    } else {
        console.log(`🔊 No new messages to queue for TTS (all ${allCurrentMessages.length} messages already processed)`);
    }
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
    updateMessageStats();
    
    console.log('📋 All messages displayed successfully');
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
            // If the date is invalid, try to parse it differently
            console.log('Invalid timestamp:', timestamp);
            return new Date().toLocaleTimeString(); // Fallback to current time
        }
        return date.toLocaleTimeString();
    } catch (error) {
        console.error('Error formatting timestamp:', timestamp, error);
        return new Date().toLocaleTimeString(); // Fallback to current time
    }
}

// Get live chat messages from Kick.com
async function getLiveChatMessages() {
    console.log('💬 getLiveChatMessages function called!');
    
    const channelName = document.getElementById('channelInput').value.trim();
    console.log('Channel name:', channelName);
    
    if (!channelName) {
        console.log('❌ No channel name provided');
        showNotification('Please enter a channel name', 'error');
        return;
    }

    const getLiveChatBtn = document.getElementById('getLiveChat');
    
    try {
        if (getLiveChatBtn) {
            getLiveChatBtn.disabled = true;
            getLiveChatBtn.textContent = '💬 Fetching Messages...';
        }
        
        console.log('📡 Making fetch request to /api/get-live-chat-messages');
        showNotification('💬 FETCHING LIVE CHAT MESSAGES...', 'info');
        
        const response = await fetch('/api/get-live-chat-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        console.log('📡 Response received:', response);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Response data:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch messages');
        }
        
        // Display messages
        displayChatMessages(data.messages);
        
        // Show success notification
        showNotification(`✅ Found ${data.messages.length} chat messages from ${data.summary.best_endpoint || 'API'}!`, 'success');
        
        // Display results in console
        console.log(`💬 CHAT MESSAGES FETCHED:`);
        console.log(`   Channel: ${data.channel} (ID: ${data.channel_id})`);
        console.log(`   Working endpoints: ${data.summary.working_endpoints}`);
        console.log(`   Total messages: ${data.summary.total_messages}`);
        console.log(`   Best endpoint: ${data.summary.best_endpoint}`);
        
        // Don't auto-start polling - only when monitoring starts
        if (debugMode) console.log(`💬 Messages ready for polling: ${data.messages.length}`);
        
    } catch (error) {
        console.error('❌ Live chat fetch error:', error);
        showNotification(`❌ Failed to fetch chat: ${error.message}`, 'error');
        
        const chatContainer = document.getElementById('liveChatMessages');
        if (chatContainer) {
            chatContainer.innerHTML = `<div class="no-messages">❌ Error: ${error.message}</div>`;
        }
    } finally {
        if (getLiveChatBtn) {
            getLiveChatBtn.disabled = false;
            getLiveChatBtn.textContent = '💬 Get Live Chat Messages';
        }
    }
}

// Auto-polling for live updates
let pollingInterval = null;
function startChatPolling(channelName) {
    // Stop existing polling
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    if (debugMode) console.log(`🔄 Starting chat polling every ${pollingIntervalMs/1000} seconds for ${channelName}...`);
    isPollingActive = true;
    
    // Show stop button
    const stopPollingBtn = document.getElementById('stopPollingBtn');
    if (stopPollingBtn) {
        stopPollingBtn.style.display = 'inline-block';
    }
    
    // Initial fetch
    fetchChatMessages(channelName);
    
    // Set up interval
    pollingInterval = setInterval(async () => {
        if (!isPollingActive) {
            stopChatPolling();
            return;
        }
        await fetchChatMessages(channelName);
    }, pollingIntervalMs);
}

function stopChatPolling() {
    console.log('🛁 Stopping live chat polling...');
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    isPollingActive = false;
    
    // Hide stop button
    const stopPollingBtn = document.getElementById('stopPollingBtn');
    if (stopPollingBtn) {
        stopPollingBtn.style.display = 'none';
    }
    
    console.log('✅ Chat polling stopped');
}

async function fetchChatMessages(channelName) {
    try {
        debugLog('🔄 Fetching messages...');
        
        const response = await fetch('/api/get-live-chat-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_name: channelName })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.messages.length > 0) {
                displayChatMessages(data.messages);
                debugLog(`🔄 Displayed ${data.messages.length} messages`);
            } else {
                debugLog('🔄 No new messages');
            }
        } else {
            debugLog('⚠️ Fetch response not OK:', response.status);
        }
    } catch (error) {
            console.error('Polling error:', error);
        }
    }, 5000); // Poll every 5 seconds
    
    // Stop polling after 10 minutes to prevent excessive requests
    setTimeout(() => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            console.log('🔄 Chat polling stopped after 10 minutes');
            showNotification('Chat polling stopped after 10 minutes', 'info');
        }
    }, 600000); // 10 minutes
}

// Make functions globally accessible
window.examineChatData = examineChatData;
window.investigateKickWebSockets = investigateKickWebSockets;
window.inspectChatMessages = inspectChatMessages;
window.inspectRawContent = inspectRawContent;
window.discoverRealEndpoints = discoverRealEndpoints;
window.extractJSConfig = extractJSConfig;
window.investigateChatImplementation = investigateChatImplementation;
window.analyzeWorkingEndpoints = analyzeWorkingEndpoints;
window.getLiveChatMessages = getLiveChatMessages;

// Handle URL parameters for auth feedback
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('success') === 'authenticated') {
    showNotification('Successfully authenticated with Kick.com!', 'success');
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
}
if (urlParams.get('error')) {
    const errorType = urlParams.get('error');
    const errorMessages = {
        'authorization_failed': 'Authorization failed. Please try again.',
        'token_exchange_failed': 'Failed to exchange token. Please try again.'
    };
    showNotification(errorMessages[errorType] || 'Authentication error', 'error');
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
}