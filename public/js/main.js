// Initialize Socket.IO connection
const socket = io();

// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusBtn = document.getElementById('statusBtn');
const logoutBtn = document.getElementById('logoutBtn');
const channelInput = document.getElementById('channelInput');
const chatContainer = document.getElementById('chatContainer');
const statusDisplay = document.getElementById('statusDisplay');
const messageCount = document.getElementById('messageCount');
const connectionCount = document.getElementById('connectionCount');

// State
let isMonitoring = false;
let currentChannel = '';
let messages = [];

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
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
    
    // Enter key on channel input
    channelInput?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !startBtn.disabled) {
            startChatMonitoring();
        }
    });
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
            updateUI();
            clearChatContainer();
            showNotification(data.message, 'success');
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
    if (chatContainer.querySelector('.no-messages')) {
        clearChatContainer();
    }
    
    displayMessage(message, true);
    scrollToBottom();
}

function displayMessage(message, isNew = false) {
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
    chatContainer.innerHTML = '';
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
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