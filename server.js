const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const voiceCloning = require('./services/voiceCloning');
require('dotenv').config();

// PKCE helper functions
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

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

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads', 'voice-samples');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}-${sanitizedName}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /\.(mp3|wav|m4a|ogg|flac)$/i;
        if (allowedTypes.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed (mp3, wav, m4a, ogg, flac)'));
        }
    }
});

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
const KICK_AUTH_URL = 'https://id.kick.com/oauth/authorize';    // Fixed: OAuth on id.kick.com
const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';       // Fixed: OAuth on id.kick.com

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
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store in session for later use
    req.session.oauth_state = state;
    req.session.code_verifier = codeVerifier;
    
    const authURL = `${KICK_AUTH_URL}?` + new URLSearchParams({
        response_type: 'code',
        client_id: KICK_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'user:read channels:read events:subscribe webhooks:manage chat:read',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    }).toString();
    
    res.redirect(authURL);
});

// Popup-based OAuth route  
app.get('/auth/popup', (req, res) => {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store in session for later use
    req.session.oauth_state = state;
    req.session.code_verifier = codeVerifier;
    
    const authURL = `${KICK_AUTH_URL}?` + new URLSearchParams({
        response_type: 'code',
        client_id: KICK_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'user:read channels:read events:subscribe webhooks:manage chat:read',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    }).toString();
    
    res.redirect(authURL);
});

app.get('/auth/callback', async (req, res) => {
    const { code, error, state } = req.query;
    
    if (error) {
        console.error('OAuth authorization error:', error);
        return res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({ success: false, error: '${error}' }, '*');
                    window.close();
                } else {
                    window.location.href = '/?error=authorization_failed';
                }
            </script>
        `);
    }
    
    // Validate state parameter for security
    if (state !== req.session.oauth_state) {
        console.error('OAuth state mismatch');
        return res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({ success: false, error: 'Invalid state parameter' }, '*');
                    window.close();
                } else {
                    window.location.href = '/?error=invalid_state';
                }
            </script>
        `);
    }
    
    if (!code) {
        return res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({ success: false, error: 'No authorization code received' }, '*');
                    window.close();
                } else {
                    window.location.href = '/?error=authorization_failed';
                }
            </script>
        `);
    }

    // Get the code_verifier from session
    const codeVerifier = req.session.code_verifier;
    if (!codeVerifier) {
        console.error('Missing code_verifier in session');
        return res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({ success: false, error: 'Missing code verifier' }, '*');
                    window.close();
                } else {
                    window.location.href = '/?error=invalid_session';
                }
            </script>
        `);
    }

    try {
        // Use application/x-www-form-urlencoded with PKCE as required by Kick
        const tokenData = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: KICK_CLIENT_ID,
            client_secret: KICK_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code: code,
            code_verifier: codeVerifier
        });

        const tokenResponse = await axios.post(KICK_TOKEN_URL, tokenData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        req.session.accessToken = tokenResponse.data.access_token;
        req.session.refreshToken = tokenResponse.data.refresh_token;
        
        // Clear the OAuth state and verifier
        delete req.session.oauth_state;
        delete req.session.code_verifier;
        
        console.log('OAuth successful! Token received.');
        
        // If opened in popup, send message to parent and close
        res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({ success: true, message: 'Authentication successful!' }, '*');
                    window.close();
                } else {
                    window.location.href = '/?success=authenticated';
                }
            </script>
        `);
    } catch (error) {
        console.error('OAuth token exchange error:', error.response?.data || error.message);
        
        const errorMessage = error.response?.data?.error_description || error.response?.data?.message || 'Token exchange failed';
        res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({ success: false, error: '${errorMessage}' }, '*');
                    window.close();
                } else {
                    window.location.href = '/?error=token_exchange_failed';
                }
            </script>
        `);
    }
});

app.post('/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Messages endpoint with channel parameter
app.get('/messages/:channel', (req, res) => {
    console.log(`🔍 GET /messages/${req.params.channel} request received!`);
    console.log('Query params:', req.query);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    res.json({
        success: true,
        channel: req.params.channel,
        messages: chatHistory,
        count: chatHistory.length,
        timestamp: new Date().toISOString()
    });
});

// Channel info endpoint  
app.get('/channel/:channel', (req, res) => {
    console.log(`🔍 GET /channel/${req.params.channel} request received!`);
    res.json({
        success: true,
        channel: req.params.channel,
        status: 'active'
    });
});

// Status/health check endpoint
app.get('/status', (req, res) => {
    console.log('🔍 GET /status request received!');
    res.json({
        success: true,
        status: 'online',
        server_time: new Date().toISOString(),
        polling_active: true
    });
});

// Voice Library Routes
app.get('/voices', async (req, res) => {
    try {
        const voicesPath = path.join(__dirname, 'data', 'voices.json');
        let voices = [];
        let localProviderHealth = { status: 'unchecked', reachable: false, baseUrl: '', message: '' };
        
        if (fs.existsSync(voicesPath)) {
            const voicesData = fs.readFileSync(voicesPath, 'utf8');
            voices = JSON.parse(voicesData);
        }
        
        // Check local TTS health
        try {
            const baseUrl = process.env.LOCAL_TTS_BASE_URL || 'http://127.0.0.1:8000';
            const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 3000 });
            localProviderHealth = {
                status: 'online',
                reachable: true,
                baseUrl: baseUrl,
                message: 'Local TTS service is running'
            };
        } catch (error) {
            localProviderHealth = {
                status: 'offline',
                reachable: false,
                baseUrl: process.env.LOCAL_TTS_BASE_URL || 'http://127.0.0.1:8000',
                message: error.message
            };
        }
        
        res.render('voices', {
            isAuthenticated: !!req.session.accessToken,
            voices: voices,
            localProviderHealth: localProviderHealth
        });
    } catch (error) {
        console.error('Error loading voices page:', error);
        res.status(500).send('Error loading voices page');
    }
});

// API Routes for Voice Management
app.get('/api/voices', (req, res) => {
    try {
        const voicesPath = path.join(__dirname, 'data', 'voices.json');
        if (fs.existsSync(voicesPath)) {
            const voicesData = fs.readFileSync(voicesPath, 'utf8');
            const voices = JSON.parse(voicesData);
            res.json({ success: true, voices: voices });
        } else {
            res.json({ success: true, voices: [] });
        }
    } catch (error) {
        console.error('Error loading voices:', error);
        res.status(500).json({ success: false, error: 'Failed to load voices' });
    }
});

app.post('/api/voices', upload.any(), async (req, res) => {
    try {
        const { name, tag } = req.body;
        
        // Find the uploaded file
        const file = req.files?.find(f => f.fieldname === 'sampleFile');
        
        if (!file) {
            return res.status(400).json({ success: false, error: 'No voice file uploaded' });
        }
        
        if (!name || !tag) {
            return res.status(400).json({ success: false, error: 'Name and tag are required' });
        }
        
        // Create voice clone
        const result = await voiceCloning.createVoiceClone({
            name: name,
            tag: tag,
            samplePath: file.path
        });
        
        // Save to voices.json
        const voicesPath = path.join(__dirname, 'data', 'voices.json');
        let voices = [];
        
        if (fs.existsSync(voicesPath)) {
            const voicesData = fs.readFileSync(voicesPath, 'utf8');
            voices = JSON.parse(voicesData);
        }
        
        const newVoice = {
            id: result.id || crypto.randomUUID(),
            name: name,
            tag: tag,
            samplePath: file.path,
            sampleFileName: file.filename,
            originalFileName: file.originalname,
            status: result.status || 'ready',
            progress: result.progress || 100,
            provider: result.provider || 'local',
            mode: result.mode || 'local',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            error: result.error || null,
            externalVoiceId: result.externalVoiceId,
            requiresVerification: result.requiresVerification || false
        };
        
        voices.unshift(newVoice);
        
        fs.writeFileSync(voicesPath, JSON.stringify(voices, null, 2));
        
        res.json({ success: true, voice: newVoice, result: result });
    } catch (error) {
        console.error('Error creating voice:', error.message);
        
        // Handle specific error types
        if (error.message.includes('already exists')) {
            return res.status(409).json({ 
                success: false, 
                error: error.message,
                type: 'duplicate_tag'
            });
        }
        
        if (error.message.includes('Failed to connect')) {
            return res.status(503).json({ 
                success: false, 
                error: 'Local TTS service is not available. Please check if it\'s running.',
                type: 'service_unavailable'
            });
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to create voice clone',
            type: 'unknown_error'
        });
    }
});

app.delete('/api/voices/:id', (req, res) => {
    try {
        const voiceId = req.params.id;
        const voicesPath = path.join(__dirname, 'data', 'voices.json');
        
        if (!fs.existsSync(voicesPath)) {
            return res.status(404).json({ success: false, error: 'Voice not found' });
        }
        
        const voicesData = fs.readFileSync(voicesPath, 'utf8');
        let voices = JSON.parse(voicesData);
        
        const voiceIndex = voices.findIndex(voice => voice.id === voiceId);
        if (voiceIndex === -1) {
            return res.status(404).json({ success: false, error: 'Voice not found' });
        }
        
        const voice = voices[voiceIndex];
        
        // Delete the voice file if it exists
        if (voice.samplePath && fs.existsSync(voice.samplePath)) {
            fs.unlinkSync(voice.samplePath);
        }
        
        // Remove from array
        voices.splice(voiceIndex, 1);
        
        // Save updated array
        fs.writeFileSync(voicesPath, JSON.stringify(voices, null, 2));
        
        res.json({ success: true, message: 'Voice deleted successfully' });
    } catch (error) {
        console.error('Error deleting voice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/local-tts-health', async (req, res) => {
    try {
        const baseUrl = process.env.LOCAL_TTS_BASE_URL || 'http://127.0.0.1:8000';
        const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
        
        res.json({
            success: true,
            status: 'online',
            reachable: true,
            baseUrl: baseUrl,
            message: 'Local TTS service is running',
            data: healthResponse.data
        });
    } catch (error) {
        res.json({
            success: false,
            status: 'offline',
            reachable: false,
            baseUrl: process.env.LOCAL_TTS_BASE_URL || 'http://127.0.0.1:8000',
            message: error.message
        });
    }
});

// Custom Voice Synthesis Endpoint
app.post('/api/tts/custom', async (req, res) => {
    try {
        const { voiceTag, text } = req.body;
        
        if (!voiceTag || !text) {
            return res.status(400).json({ success: false, error: 'voiceTag and text are required' });
        }
        
        // Find the voice in our database
        const voicesPath = path.join(__dirname, 'data', 'voices.json');
        let voices = [];
        
        if (fs.existsSync(voicesPath)) {
            const voicesData = fs.readFileSync(voicesPath, 'utf8');
            voices = JSON.parse(voicesData);
        }
        
        const voice = voices.find(v => v.tag === voiceTag);
        if (!voice) {
            return res.status(404).json({ success: false, error: `Voice with tag "${voiceTag}" not found` });
        }
        
        // Use the voice cloning service to synthesize
        const synthesisResult = await voiceCloning.synthesizeVoiceTextForProvider({
            provider: voice.provider,
            externalVoiceId: voice.externalVoiceId,
            text: text,
            voiceTag: voiceTag
        });
        
        // Extract audio data and content type
        const audioBuffer = synthesisResult.audioBuffer;
        const contentType = synthesisResult.contentType || 'audio/wav';
        
        // Return audio as blob
        res.set({
            'Content-Type': contentType,
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'no-cache'
        });
        res.send(audioBuffer);
        
    } catch (error) {
        console.error('TTS synthesis error:', error.message);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({ success: false, error: error.message });
        }
        
        if (error.message.includes('service')) {
            return res.status(503).json({ success: false, error: 'Voice synthesis service unavailable' });
        }
        
        res.status(500).json({ success: false, error: 'Failed to synthesize voice audio' });
    }
});

// Get live chat messages using polling approach with confirmed Channel ID
app.post('/api/get-live-chat-messages', async (req, res) => {
    console.log('💬 Live chat messages requested');
    
    try {
        const { channel_name, since_timestamp } = req.body;
        const access_token = req.session.accessToken;
        
        if (!access_token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        console.log('💬 FETCHING LIVE CHAT MESSAGES...');
        if (since_timestamp) {
            console.log('📅 Filtering messages since:', since_timestamp);
        }
        
        const browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Authorization': `Bearer ${access_token}`,
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `https://kick.com/${channel_name}`
        };
        
        // Use confirmed Channel ID: 1580195
        const channelId = '1580195';
        
        // Also try with the actual channel name for some endpoints
        const channelName = channel_name;
        
        // Try multiple chat message endpoints
        const chatEndpoints = [
            {
                name: 'v2/channels/messages',
                url: `https://kick.com/api/v2/channels/${channelId}/messages`,
                description: 'v2 channel messages API (by ID)'
            },
            {
                name: 'v2/channels/messages (by name)',
                url: `https://kick.com/api/v2/channels/${channelName}/messages`,
                description: 'v2 channel messages API (by name)'
            },
            {
                name: 'v1/channels/messages',  
                url: `https://kick.com/api/v1/channels/${channelId}/messages`,
                description: 'v1 channel messages API (by ID)'
            },
            {
                name: 'v1/channels/messages (by name)',
                url: `https://kick.com/api/v1/channels/${channelName}/messages`,
                description: 'v1 channel messages API (by name)'
            },
            {
                name: 'v2/channels/messages?limit=100',
                url: `https://kick.com/api/v2/channels/${channelId}/messages?limit=100`,
                description: 'v2 channel messages with higher limit for real-time'
            },
            {
                name: 'v2/channels/messages/live',
                url: `https://kick.com/api/v2/channels/${channelId}/messages/live`,
                description: 'Live messages endpoint attempt'
            },
            {
                name: 'v2/channels/messages?recent=true',
                url: `https://kick.com/api/v2/channels/${channelId}/messages?recent=true&limit=100`,
                description: 'Messages with recent flag'
            },
            {
                name: 'v2/channels/messages/recent',
                url: `https://kick.com/api/v2/channels/${channelId}/messages/recent`,
                description: 'Recent messages API (by ID)'
            },
            {
                name: 'v2/channels/messages/recent (by name)',
                url: `https://kick.com/api/v2/channels/${channelName}/messages/recent`,
                description: 'Recent messages API (by name)'
            },
            {
                name: 'v2/chatrooms/messages',
                url: `https://kick.com/api/v2/chatrooms/${channelId}/messages`,
                description: 'v2 chatroom messages API (by ID)'
            },
            {
                name: 'v2/chatrooms/messages (by name)',
                url: `https://kick.com/api/v2/chatrooms/${channelName}/messages`,
                description: 'v2 chatroom messages API (by name)'
            },
            {
                name: 'v1/chat/messages',
                url: `https://kick.com/api/v1/chat/${channelName}/messages`,
                description: 'v1 direct chat messages API'
            }
        ];
        
        const messageResults = [];
        let workingEndpoint = null;
        let chatMessages = [];
        
        for (const endpoint of chatEndpoints) {
            try {
                // Reduce verbosity - only log if in debug mode or if working endpoint found
                
                const response = await axios.get(endpoint.url, {
                    headers: browserHeaders,
                    timeout: 8000,
                    validateStatus: () => true
                });
                
                const contentType = response.headers['content-type'] || '';
                const isJson = contentType.includes('application/json');
                
                if (response.status === 200) {
                    let parsedData = null;
                    let messages = [];
                    
                    if (isJson && response.data) {
                        try {
                            parsedData = response.data;
                            
                            // Only log full JSON in debug scenarios
                            // console.log(`📋 EXACT JSON RESPONSE: ${JSON.stringify(parsedData, null, 2)}`);
                            
                            // Look for message arrays in different possible structures
                            if (Array.isArray(parsedData)) {
                                messages = parsedData;
                            } else if (parsedData.data && parsedData.data.messages && Array.isArray(parsedData.data.messages)) {
                                messages = parsedData.data.messages;
                                console.log(`✅ Found ${messages.length} messages from ${endpoint.name}`);
                            } else if (parsedData.data && Array.isArray(parsedData.data)) {
                                messages = parsedData.data;
                            } else if (parsedData.messages && Array.isArray(parsedData.messages)) {
                                messages = parsedData.messages;
                            } else if (parsedData.chat && Array.isArray(parsedData.chat)) {
                                messages = parsedData.chat;
                            }
                            
                            // If we found messages, this is our working endpoint
                            if (messages.length > 0) {
                                workingEndpoint = endpoint;
                                chatMessages = messages;
                                
                                // Process ALL messages for display and TTS (no slice limit)
                                let processedMessages = messages.map(msg => {
                                    return {
                                        id: msg.id || Date.now(),
                                        user: msg.sender?.username || msg.user?.username || msg.username || 'Unknown',
                                        message: msg.content || msg.message || msg.text || String(msg),
                                        timestamp: msg.created_at || msg.timestamp || new Date().toISOString(),
                                        badges: msg.sender?.identity?.badges || msg.badges || [],
                                        color: msg.sender?.identity?.color || null,
                                        type: msg.type || 'message',
                                        played: false, // Initialize played flag for TTS replay control
                                        raw: msg // Include raw message for debugging
                                    };
                                });
                                
                                // Filter by timestamp if provided (only messages AFTER monitoring started)
                                if (since_timestamp) {
                                    const sinceDate = new Date(since_timestamp);
                                    const beforeFilterCount = processedMessages.length;
                                    
                                    processedMessages = processedMessages.filter(msg => {
                                        const msgDate = new Date(msg.timestamp);
                                        return msgDate > sinceDate; // Only messages AFTER the start time
                                    });
                                    
                                    console.log(`📅 Timestamp filter: ${beforeFilterCount} total → ${processedMessages.length} new messages since ${since_timestamp}`);
                                }
                                
                                // Store processed messages for return
                                chatMessages = processedMessages;
                                
                                console.log(`🎯 Using ${endpoint.name} - ${messages.length} messages found`);
                                
                                messageResults.push({
                                    endpoint: endpoint,
                                    status: response.status,
                                    messageCount: messages.length,
                                    messages: processedMessages,
                                    working: true,
                                    isJson: true
                                });
                                
                                break; // Stop at first working endpoint
                            }
                        } catch (parseError) {
                            console.log(`   ❌ Failed to parse JSON: ${parseError.message}`);
                        }
                    } else {
                        console.log(`   📄 Non-JSON response (${response.status})`);
                    }
                    
                    messageResults.push({
                        endpoint: endpoint,
                        status: response.status,
                        messageCount: messages.length,
                        working: response.status === 200 && isJson && messages.length > 0,
                        isJson: isJson,
                        contentPreview: String(response.data).substring(0, 200)
                    });
                } else {
                    console.log(`   ❌ Error response: ${response.status}`);
                    messageResults.push({
                        endpoint: endpoint,
                        status: response.status,
                        working: false,
                        error: `HTTP ${response.status}`
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ Error testing ${endpoint.name}: ${error.message}`);
                messageResults.push({
                    endpoint: endpoint,
                    error: error.message,
                    working: false
                });
            }
        }
        
        const workingEndpoints = messageResults.filter(r => r.working);
        const totalMessages = messageResults.reduce((sum, r) => sum + (r.messageCount || 0), 0);
        
        // Simplified logging - only show essential info
        if (workingEndpoints.length > 0) {
            console.log(`✅ Chat fetch successful: ${totalMessages} messages`);
        } else {
            console.log(`⚠️ No chat messages found`);
        }
        
        res.json({
            success: true,
            channel: channel_name,
            channel_id: channelId,
            summary: {
                working_endpoints: workingEndpoints.length,
                total_messages: totalMessages,
                best_endpoint: workingEndpoint?.name || null
            },
            messages: chatMessages, // Return ALL processed messages for real-time detection
            endpoints_tested: messageResults,
            recommendations: workingEndpoint ? 
                `Use ${workingEndpoint.name} for polling - it returned ${chatMessages.length} messages!` :
                totalMessages > 0 ?
                'Messages found but in unexpected format - check endpoint data structures.' :
                'No chat messages found. Channel might be offline or use different API structure.'
        });
        
    } catch (error) {
        console.error('❌ Live chat message fetch failed:', error.message);
        res.status(400).json({ 
            success: false, 
            error: error.message 
        });
    }
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