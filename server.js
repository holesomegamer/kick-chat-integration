const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'kick-chat-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global variables
let chatMonitoring = false;
let currentChannel = '';
let connectedClients = [];
let chatHistory = [];

// Kick.com OAuth configuration
const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback';
const KICK_AUTH_URL = 'https://kick.com/oauth2/authorize';
const KICK_TOKEN_URL = 'https://kick.com/oauth2/token';

// Routes
app.get('/', (req, res) => {
    res.render('index', {
        isAuthenticated: !!req.session.accessToken,
        chatMonitoring: chatMonitoring,
        currentChannel: currentChannel
    });
});

// OAuth Routes
app.get('/auth/kick', (req, res) => {
    const authURL = `${KICK_AUTH_URL}?client_id=${KICK_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=chat:read`;
    res.redirect(authURL);
});

app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.redirect('/?error=authorization_failed');
    }

    try {
        const tokenResponse = await axios.post(KICK_TOKEN_URL, {
            client_id: KICK_CLIENT_ID,
            client_secret: KICK_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code: code,
            grant_type: 'authorization_code'
        });

        req.session.accessToken = tokenResponse.data.access_token;
        req.session.refreshToken = tokenResponse.data.refresh_token;
        
        res.redirect('/?success=authenticated');
    } catch (error) {
        console.error('OAuth error:', error.response?.data || error.message);
        res.redirect('/?error=token_exchange_failed');
    }
});

app.post('/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Chat control routes
app.post('/chat/start', (req, res) => {
    const { channel } = req.body;
    
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!channel) {
        return res.status(400).json({ error: 'Channel name required' });
    }
    
    currentChannel = channel;
    chatMonitoring = true;
    chatHistory = [];
    
    // Notify all connected clients
    io.emit('chatStarted', { channel: currentChannel });
    
    res.json({ 
        success: true, 
        message: `Started monitoring ${channel}`,
        channel: currentChannel
    });
});

app.post('/chat/stop', (req, res) => {
    chatMonitoring = false;
    currentChannel = '';
    
    // Notify all connected clients
    io.emit('chatStopped');
    
    res.json({ 
        success: true, 
        message: 'Stopped chat monitoring'
    });
});

app.get('/chat/status', (req, res) => {
    res.json({
        isMonitoring: chatMonitoring,
        channel: currentChannel,
        isAuthenticated: !!req.session.accessToken,
        messageCount: chatHistory.length,
        connectedClients: connectedClients.length
    });
});

// Webhook endpoint for receiving chat messages
app.post('/webhook/chat', (req, res) => {
    console.log('Received webhook:', req.body);
    
    if (!chatMonitoring) {
        return res.status(200).json({ message: 'Chat monitoring is disabled' });
    }
    
    const chatMessage = {
        id: Date.now(),
        timestamp: new Date(),
        username: req.body.username || 'Unknown',
        message: req.body.message || '',
        channel: req.body.channel || currentChannel,
        metadata: req.body
    };
    
    // Add to history
    chatHistory.push(chatMessage);
    
    // Keep only last 100 messages
    if (chatHistory.length > 100) {
        chatHistory = chatHistory.slice(-100);
    }
    
    // Broadcast to all connected clients
    io.emit('newChatMessage', chatMessage);
    
    res.status(200).json({ success: true });
});

// API route to get chat history
app.get('/api/chat/history', (req, res) => {
    res.json(chatHistory);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    connectedClients.push(socket.id);
    
    // Send current status to newly connected client
    socket.emit('statusUpdate', {
        isMonitoring: chatMonitoring,
        channel: currentChannel,
        messageCount: chatHistory.length
    });
    
    // Send chat history to newly connected client
    socket.emit('chatHistory', chatHistory);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        connectedClients = connectedClients.filter(id => id !== socket.id);
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure to:');
    console.log('1. Set up your .env file with Kick.com OAuth credentials');
    console.log('2. Run ngrok to expose your webhook endpoint');
    console.log('3. Configure your Kick.com app with the correct redirect URI');
});