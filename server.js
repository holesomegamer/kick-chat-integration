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
const { createVoiceClone, synthesizeVoiceTextForProvider, getConfiguredCloneProvider } = require('./services/voiceCloning');
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

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global variables
let chatMonitoring = false;
let currentChannel = '';
let connectedClients = [];
let chatHistory = [];
let voiceLibrary = [];

const voiceSamplesDir = path.join(__dirname, 'uploads', 'voice-samples');
const voiceDataDir = path.join(__dirname, 'data');
const voiceLibraryFilePath = path.join(voiceDataDir, 'voices.json');
fs.mkdirSync(voiceSamplesDir, { recursive: true });
fs.mkdirSync(voiceDataDir, { recursive: true });

const supportedVoiceMimeTypes = new Set([
    'audio/wav',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/flac',
    'audio/x-flac',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac'
]);

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, voiceSamplesDir),
        filename: (_req, file, cb) => {
            const extension = path.extname(file.originalname || '').toLowerCase() || '.wav';
            const safeBaseName = path.basename(file.originalname || 'sample', extension)
                .toLowerCase()
                .replace(/[^a-z0-9-_]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'sample';
            cb(null, `${Date.now()}-${safeBaseName}${extension}`);
        }
    }),
    limits: {
        fileSize: 25 * 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const allowedExtensions = new Set(['.wav', '.mp3', '.flac', '.m4a', '.aac']);
        const isAllowed = supportedVoiceMimeTypes.has(file.mimetype) || allowedExtensions.has(extension);

        if (!isAllowed) {
            cb(new Error('Unsupported audio file type. Use WAV, MP3, FLAC, M4A, or AAC.'));
            return;
        }

        cb(null, true);
    }
});

function normalizeVoiceTag(rawTag) {
    return String(rawTag || '')
        .trim()
        .replace(/^!+/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
}

function isValidVoiceTag(tag) {
    return /^[a-z][a-z0-9_-]{1,31}$/.test(tag);
}

function getVoiceSummary(voice) {
    return {
        id: voice.id,
        name: voice.name,
        tag: voice.tag,
        sampleFileName: voice.sampleFileName,
        originalFileName: voice.originalFileName,
        status: voice.status,
        progress: voice.progress,
        provider: voice.provider,
        mode: voice.mode,
        createdAt: voice.createdAt,
        updatedAt: voice.updatedAt,
        error: voice.error,
        externalVoiceId: voice.externalVoiceId,
        requiresVerification: voice.requiresVerification
    };
}

function serializeVoice(voice) {
    return {
        id: voice.id,
        name: voice.name,
        tag: voice.tag,
        samplePath: voice.samplePath,
        sampleFileName: voice.sampleFileName,
        originalFileName: voice.originalFileName,
        status: voice.status,
        progress: voice.progress,
        provider: voice.provider,
        mode: voice.mode,
        createdAt: voice.createdAt,
        updatedAt: voice.updatedAt,
        error: voice.error,
        externalVoiceId: voice.externalVoiceId,
        requiresVerification: voice.requiresVerification
    };
}

function persistVoiceLibrary() {
    const serializedLibrary = voiceLibrary.map(serializeVoice);
    fs.writeFileSync(voiceLibraryFilePath, JSON.stringify(serializedLibrary, null, 2), 'utf8');
}

function loadVoiceLibrary() {
    if (!fs.existsSync(voiceLibraryFilePath)) {
        fs.writeFileSync(voiceLibraryFilePath, '[]\n', 'utf8');
        return [];
    }

    try {
        const rawFile = fs.readFileSync(voiceLibraryFilePath, 'utf8');
        const parsedLibrary = JSON.parse(rawFile);
        if (!Array.isArray(parsedLibrary)) {
            return [];
        }

        return parsedLibrary.map((voice) => ({
            id: voice.id || crypto.randomUUID(),
            name: String(voice.name || '').trim(),
            tag: normalizeVoiceTag(voice.tag),
            samplePath: voice.samplePath || null,
            sampleFileName: voice.sampleFileName || null,
            originalFileName: voice.originalFileName || null,
            status: voice.status || 'ready',
            progress: Number.isFinite(voice.progress) ? voice.progress : 0,
            provider: voice.provider || 'mock',
            mode: voice.mode || 'mock',
            createdAt: voice.createdAt || new Date().toISOString(),
            updatedAt: voice.updatedAt || new Date().toISOString(),
            error: voice.error || null,
            externalVoiceId: voice.externalVoiceId || null,
            requiresVerification: voice.requiresVerification === true
        })).filter((voice) => voice.name && voice.tag);
    } catch (error) {
        console.error('Failed to load persisted voices:', error.message);
        return [];
    }
}

function findVoiceById(voiceId) {
    return voiceLibrary.find((voice) => voice.id === voiceId);
}

function setVoiceProgress(voice, updates) {
    Object.assign(voice, updates, {
        updatedAt: new Date().toISOString()
    });

    persistVoiceLibrary();
}

function getActiveTTSCommandSet() {
    const activeCommands = new Set(['tts', 'custom1', 'custom2']);

    voiceLibrary
        .filter((voice) => voice.status === 'ready' && isValidVoiceTag(voice.tag))
        .forEach((voice) => {
            activeCommands.add(voice.tag);
        });

    return activeCommands;
}

async function processVoiceClone(voice) {
    const milestones = [20, 45, 70];
    setVoiceProgress(voice, { status: 'processing', progress: 10, error: null });

    const milestoneInterval = setInterval(() => {
        if (milestones.length === 0) {
            clearInterval(milestoneInterval);
            return;
        }

        const nextProgress = milestones.shift();
        setVoiceProgress(voice, { progress: nextProgress });
    }, 700);

    try {
        const result = await createVoiceClone({
            name: voice.name,
            tag: voice.tag,
            samplePath: voice.samplePath
        });

        clearInterval(milestoneInterval);
        setVoiceProgress(voice, {
            status: 'ready',
            progress: 100,
            provider: result.provider,
            mode: result.mode,
            externalVoiceId: result.externalVoiceId,
            requiresVerification: result.requiresVerification === true
        });
    } catch (error) {
        clearInterval(milestoneInterval);
        setVoiceProgress(voice, {
            status: 'failed',
            progress: 100,
            error: error.response?.data?.detail || error.message || 'Voice cloning failed.'
        });
    }
}

voiceLibrary = loadVoiceLibrary();

// Kick.com OAuth configuration
const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback';
const KICK_AUTH_URL = 'https://id.kick.com/oauth/authorize';    // Fixed: OAuth on id.kick.com
const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';       // Fixed: OAuth on id.kick.com

function getLocalTTSBaseUrl() {
    return String(process.env.LOCAL_TTS_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

async function getLocalTTSHealth() {
    const baseUrl = getLocalTTSBaseUrl();

    try {
        const response = await axios.get(`${baseUrl}/health`, {
            timeout: 1500
        });

        const payload = response.data && typeof response.data === 'object' ? response.data : {};
        const statusText = String(payload.status || 'ok').toLowerCase();
        const normalizedStatus = statusText === 'ok' || statusText === 'healthy' ? 'online' : statusText;

        return {
            status: normalizedStatus,
            reachable: true,
            baseUrl,
            message: payload.message || 'Local TTS health endpoint is reachable.'
        };
    } catch (error) {
        return {
            status: 'offline',
            reachable: false,
            baseUrl,
            message: error.code === 'ECONNABORTED'
                ? 'Health check timed out.'
                : (error.message || 'Unable to reach Local TTS health endpoint.')
        };
    }
}



// Routes
app.get('/', (req, res) => {
    res.render('index', {
        isAuthenticated: !!req.session.accessToken,
        chatMonitoring: chatMonitoring,
        currentChannel: currentChannel
    });
});

app.get('/voices', async (req, res) => {
    const providerConfig = getConfiguredCloneProvider();
    const localProviderHealth = await getLocalTTSHealth();

    res.render('voices', {
        isAuthenticated: !!req.session.accessToken,
        voices: voiceLibrary.map(getVoiceSummary),
        activeProvider: providerConfig.provider,
        localProviderHealth
    });
});

app.get('/api/voices', async (_req, res) => {
    const providerConfig = getConfiguredCloneProvider();
    const localProviderHealth = await getLocalTTSHealth();

    res.json({
        success: true,
        recommendedFormat: {
            preferred: 'WAV',
            details: 'Use clean, uncompressed WAV when possible. Mono 44.1 kHz or 48 kHz speech recordings are the safest baseline for cloning quality.',
            acceptedExtensions: ['wav', 'mp3', 'flac', 'm4a', 'aac']
        },
        providerConfigured: providerConfig.configured,
        activeProvider: providerConfig.provider,
        localProviderHealth,
        voices: voiceLibrary.map(getVoiceSummary)
    });
});

app.post('/api/tts/custom', async (req, res) => {
    try {
        const voiceTag = normalizeVoiceTag(req.body.voiceTag);
        const text = String(req.body.text || '').trim();

        if (!voiceTag) {
            return res.status(400).json({ success: false, error: 'voiceTag is required.' });
        }

        if (!text) {
            return res.status(400).json({ success: false, error: 'text is required.' });
        }

        if (voiceTag === 'tts' || voiceTag === 'default' || voiceTag === 'custom1' || voiceTag === 'custom2') {
            return res.status(400).json({ success: false, error: 'Use browser voice route for built-in tags.' });
        }

        const voice = voiceLibrary.find((entry) => entry.tag === voiceTag && entry.status === 'ready');
        if (!voice) {
            return res.status(404).json({ success: false, error: `No ready voice found for !${voiceTag}.` });
        }

        if ((voice.provider !== 'elevenlabs' && voice.provider !== 'local') || !voice.externalVoiceId) {
            return res.status(409).json({
                success: false,
                error: `Voice !${voiceTag} is not linked to an active synthesis provider yet.`
            });
        }

        const synthesized = await synthesizeVoiceTextForProvider({
            provider: voice.provider,
            externalVoiceId: voice.externalVoiceId,
            text,
            voiceTag
        });

        res.setHeader('Content-Type', synthesized.contentType || 'audio/mpeg');
        return res.send(Buffer.from(synthesized.audioBuffer));
    } catch (error) {
        return res.status(400).json({
            success: false,
            error: error.response?.data?.detail || error.message || 'Failed to synthesize custom voice.'
        });
    }
});

app.post('/api/voices', upload.single('sampleFile'), async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const tag = normalizeVoiceTag(req.body.tag);

        if (!name) {
            return res.status(400).json({ success: false, error: 'Voice name is required.' });
        }

        if (!isValidVoiceTag(tag)) {
            return res.status(400).json({ success: false, error: 'Custom tag must start with a letter and contain only letters, numbers, underscores, or dashes.' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'An audio sample file is required.' });
        }

        const existingVoice = voiceLibrary.find((voice) => voice.tag === tag);
        if (existingVoice) {
            return res.status(409).json({ success: false, error: `The !${tag} tag is already in use.` });
        }

        const providerConfig = getConfiguredCloneProvider();

        const voice = {
            id: crypto.randomUUID(),
            name,
            tag,
            samplePath: req.file.path,
            sampleFileName: req.file.filename,
            originalFileName: req.file.originalname,
            status: 'queued',
            progress: 0,
            provider: providerConfig.provider,
            mode: providerConfig.mode,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            error: null,
            externalVoiceId: null,
            requiresVerification: false
        };

        voiceLibrary.unshift(voice);
        persistVoiceLibrary();
        processVoiceClone(voice);

        return res.status(202).json({
            success: true,
            voice: getVoiceSummary(voice)
        });
    } catch (error) {
        if (req.file?.path) {
            fs.unlink(req.file.path, () => {});
        }

        return res.status(400).json({
            success: false,
            error: error.message || 'Failed to queue voice clone.'
        });
    }
});

app.patch('/api/voices/:voiceId', (req, res) => {
    const voice = findVoiceById(req.params.voiceId);
    if (!voice) {
        return res.status(404).json({ success: false, error: 'Voice not found.' });
    }

    const name = String(req.body.name || '').trim();
    const tag = normalizeVoiceTag(req.body.tag);

    if (!name) {
        return res.status(400).json({ success: false, error: 'Voice name is required.' });
    }

    if (!isValidVoiceTag(tag)) {
        return res.status(400).json({ success: false, error: 'Custom tag must start with a letter and contain only letters, numbers, underscores, or dashes.' });
    }

    const existingVoice = voiceLibrary.find((entry) => entry.id !== voice.id && entry.tag === tag);
    if (existingVoice) {
        return res.status(409).json({ success: false, error: `The !${tag} tag is already in use.` });
    }

    setVoiceProgress(voice, {
        name,
        tag
    });

    return res.json({
        success: true,
        voice: getVoiceSummary(voice)
    });
});

app.delete('/api/voices/:voiceId', (req, res) => {
    const voiceIndex = voiceLibrary.findIndex((voice) => voice.id === req.params.voiceId);
    if (voiceIndex === -1) {
        return res.status(404).json({ success: false, error: 'Voice not found.' });
    }

    const [removedVoice] = voiceLibrary.splice(voiceIndex, 1);
    persistVoiceLibrary();

    if (removedVoice?.samplePath && fs.existsSync(removedVoice.samplePath)) {
        fs.unlink(removedVoice.samplePath, () => {});
    }

    return res.json({
        success: true,
        deletedVoiceId: removedVoice.id
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
        scope: 'user:read channels:read events:subscribe chat:read',
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
        scope: 'user:read channels:read events:subscribe chat:read',
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
                                    const rawMessageText = msg.content || msg.message || msg.text || String(msg);
                                    const normalizedMessageText = typeof rawMessageText === 'string'
                                        ? rawMessageText.trim()
                                        : String(rawMessageText).trim();
                                    const ttsMatch = normalizedMessageText.match(/^!(\w+)\s+([\s\S]+)$/i);
                                    const ttsCommand = ttsMatch ? ttsMatch[1].toLowerCase() : null;
                                    const ttsText = ttsMatch ? ttsMatch[2].trim() : '';
                                    const activeTTSCommands = getActiveTTSCommandSet();
                                    const ttsEligible = activeTTSCommands.has(ttsCommand) && ttsText.length > 0;
                                    const ttsVoice = ttsCommand === 'custom1'
                                        ? 'custom1'
                                        : (ttsCommand === 'custom2'
                                            ? 'custom2'
                                            : (ttsCommand === 'tts'
                                                ? 'default'
                                                : (ttsCommand && activeTTSCommands.has(ttsCommand) ? ttsCommand : 'default')));

                                    return {
                                        id: msg.id || Date.now(),
                                        user: msg.sender?.username || msg.user?.username || msg.username || 'Unknown',
                                        message: normalizedMessageText,
                                        timestamp: msg.created_at || msg.timestamp || new Date().toISOString(),
                                        badges: msg.sender?.identity?.badges || msg.badges || [],
                                        color: msg.sender?.identity?.color || null,
                                        type: msg.type || 'message',
                                        ttsCommand: ttsCommand,
                                        ttsText: ttsText,
                                        ttsVoice: ttsVoice,
                                        ttsEligible: ttsEligible,
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

app.use((error, req, res, next) => {
    if (req.path === '/api/voices') {
        return res.status(400).json({
            success: false,
            error: error.message || 'Voice upload failed.'
        });
    }

    return next(error);
});













// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure to:');
    console.log('1. Set up your .env file with Kick.com OAuth credentials');
    console.log('2. Configure your Kick.com app with the correct redirect URI');
});