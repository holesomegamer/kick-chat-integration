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

function captureRawBody(req, res, buf) {
    if (buf && buf.length > 0) {
        req.rawBody = buf.toString('utf8');
    }
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ verify: captureRawBody }));
app.use(bodyParser.urlencoded({ extended: true, verify: captureRawBody }));
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
const CHAT_ROUTE_DEBUG_LOGS = process.env.CHAT_DEBUG_LOGS === '1';
const CHAT_CACHE_TTL_MS = 10 * 60 * 1000;
// Cache for user lookups to avoid repeated API calls
const userLookupCache = new Map();
const USER_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function lookupUsernameById(userId, accessToken) {
    if (!userId || !accessToken) {
        return null;
    }

    const cacheKey = String(userId);
    const cached = userLookupCache.get(cacheKey);
    
    // Check if we have a valid cached entry
    if (cached && (Date.now() - cached.timestamp) < USER_CACHE_DURATION) {
        return cached.username;
    }

    // Try multiple different endpoint formats that Kick might use
    const endpointsToTry = [
        `https://kick.com/api/v2/users/${userId}`,
        `https://kick.com/api/v1/users/${userId}`, 
        `https://kick.com/api/user/${userId}`,
        `https://kick.com/api/users/${userId}`,
        `${KICK_API_BASE_URL}/api/v2/users/${userId}`,
        `${KICK_API_BASE_URL}/api/v1/users/${userId}`,
        `${KICK_API_BASE_URL}/user/${userId}`,
        `${KICK_API_BASE_URL}/users/${userId}`,
        // Try public endpoints without authentication
        `https://kick.com/api/v1/users/${userId}/profile`,
        `https://kick.com/api/v2/users/${userId}/profile`
    ];

    for (const [index, endpoint] of endpointsToTry.entries()) {
        try {
            console.log(`👤 Trying endpoint ${index + 1}/${endpointsToTry.length}: ${endpoint}`);
            
            const headers = {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
            
            // Add auth header only for authenticated endpoints
            if (endpoint.includes('api/v1') || endpoint.includes('api/v2')) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }

            const response = await axios.get(endpoint, {
                headers,
                timeout: 5000
            });

            console.log(`👤 Response from ${endpoint}:`, JSON.stringify(response.data, null, 2));

            // Try different username field names
            const username = response.data?.username 
                || response.data?.slug 
                || response.data?.user?.username
                || response.data?.user?.slug
                || response.data?.name
                || response.data?.display_name
                || response.data?.user?.name
                || response.data?.user?.display_name;
                
            if (username) {
                // Cache the result
                userLookupCache.set(cacheKey, {
                    username: username,
                    timestamp: Date.now()
                });
                console.log(`👤 SUCCESS! Resolved user ID ${userId} -> ${username} (via endpoint ${index + 1})`);
                return username;
            } else {
                console.log(`👤 No username found in response from ${endpoint}`);
            }
        } catch (error) {
            console.log(`👤 Endpoint ${index + 1} failed (${error.response?.status || error.code}): ${error.message}`);
        }
    }

    console.warn(`⚠️ All ${endpointsToTry.length} username lookup attempts failed for ID ${userId}`);
    return null;
}

function cleanupUserCache() {
    const cutoff = Date.now() - USER_CACHE_DURATION;
    for (const [userId, entry] of userLookupCache.entries()) {
        if (entry.timestamp < cutoff) {
            userLookupCache.delete(userId);
        }
    }
}

// Clean up cache periodically
setInterval(cleanupUserCache, USER_CACHE_DURATION);

const CHANNEL_POINT_EVENT_RETENTION_MS = 60 * 60 * 1000;
const KICK_API_BASE_URL = 'https://api.kick.com';
const KICK_PUBLIC_KEY_URL = `${KICK_API_BASE_URL}/public/v1/public-key`;
const KICK_REDEMPTION_EVENT_NAME = 'channel.reward.redemption.updated';
const KICK_REDEMPTION_EVENT_VERSION = 1;
const KICK_WEBHOOK_PATH = '/api/kick/webhooks';
const KICK_POLLABLE_REDEMPTION_STATUSES = ['pending', 'accepted'];
const chatProbeCache = new Map();
const processedRedemptionIds = new Map();

let kickPublicKeyCache = {
    value: null,
    fetchedAt: 0
};

let channelPointEvents = [];

let ttsTriggerSettings = {
    mode: 'chat_commands',
    channelPointsRewardTitle: 'Test-tts',
    lastWebhookReceivedAt: null,
    lastWebhookEventType: null,
    lastWebhookError: null,
    lastAcceptedRedemptionAt: null,
    lastAcceptedRedemption: null,
    subscriptionStatus: 'not_attempted',
    subscriptionId: null,
    subscriptionError: null,
    subscriptionUpdatedAt: null
};

// User moderation and permission settings
let moderationSettings = {
    banList: new Set(), // Set of banned usernames (case-insensitive)
    permissionMode: 'all', // 'all', 'subscribers_only', 'moderators_only', 'vips_only'
    enableBanList: true,
    enablePermissionFilter: false
};

// Track logged ban messages to avoid spam
const loggedBannedUsers = new Set();
const loggedPermissionUsers = new Set();

// Clear logged user sets periodically (every 5 minutes)
setInterval(() => {
    loggedBannedUsers.clear();
    loggedPermissionUsers.clear();
    console.log('🧹 Cleared moderation logging cache');
}, 5 * 60 * 1000);

function normalizeComparableText(value) {
    return String(value || '').trim().toLowerCase();
}

function toTimestampMs(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return null;
        }
        return value < 1e12 ? value * 1000 : value;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            const numeric = Number(trimmed);
            if (!Number.isFinite(numeric)) {
                return null;
            }
            return numeric < 1e12 ? numeric * 1000 : numeric;
        }

        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
}

// Moderation helper functions
function isUserBanned(username) {
    if (!moderationSettings.enableBanList || !username) {
        return false;
    }
    return moderationSettings.banList.has(normalizeComparableText(username));
}

function hasPermissionToSpeak(message) {
    if (!moderationSettings.enablePermissionFilter) {
        return true;
    }
    
    const badges = message.badges || message.sender?.identity?.badges || [];
    const username = message.user || message.sender?.username || message.username;
    
    switch (moderationSettings.permissionMode) {
        case 'subscribers_only':
            return badges.some(badge => badge.type === 'subscriber' || badge.slug === 'subscriber');
        case 'moderators_only':
            return badges.some(badge => badge.type === 'moderator' || badge.slug === 'moderator');
        case 'vips_only':
            return badges.some(badge => badge.type === 'vip' || badge.slug === 'vip');
        case 'all':
        default:
            return true;
    }
}

function shouldProcessMessage(message) {
    // This function now just adds moderation metadata to messages
    // All messages are included in the chat display
    const username = message.user || message.sender?.username || message.username;
    
    // Check ban status
    const isBanned = isUserBanned(username);
    if (isBanned && !loggedBannedUsers.has(username)) {
        console.log(`🚫 User is banned (messages will show with banned tag): ${username}`);
        loggedBannedUsers.add(username);
    }
    
    // Check permission requirements  
    const hasPermission = hasPermissionToSpeak(message);
    if (!hasPermission && !loggedPermissionUsers.has(username)) {
        console.log(`🔒 User lacks required permissions for ${moderationSettings.permissionMode} mode: ${username}`);
        loggedPermissionUsers.add(username);
    }
    
    // Add moderation flags to message for frontend processing
    message.moderationFlags = {
        isBanned: isBanned,
        hasPermission: hasPermission,
        autoTtsEligible: !isBanned && hasPermission // Only eligible for auto TTS if not banned and has permissions
    };
    
    return true; // Always include message in display
}

function pruneProcessedRedemptions() {
    const cutoff = Date.now() - CHANNEL_POINT_EVENT_RETENTION_MS;
    for (const [redemptionId, timestampMs] of processedRedemptionIds.entries()) {
        if (timestampMs < cutoff) {
            processedRedemptionIds.delete(redemptionId);
        }
    }
}

function pruneChannelPointEvents() {
    const cutoff = Date.now() - CHANNEL_POINT_EVENT_RETENTION_MS;
    channelPointEvents = channelPointEvents
        .filter((event) => {
            const eventTimestampMs = toTimestampMs(event.timestamp);
            return eventTimestampMs === null || eventTimestampMs >= cutoff;
        })
        .slice(0, 200);
}

function buildTtsSettingsResponse(req) {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

    return {
        mode: ttsTriggerSettings.mode,
        channelPointsRewardTitle: ttsTriggerSettings.channelPointsRewardTitle,
        webhookPath: KICK_WEBHOOK_PATH,
        webhookUrl: `${publicBaseUrl}${KICK_WEBHOOK_PATH}`,
        subscriptionStatus: ttsTriggerSettings.subscriptionStatus,
        subscriptionId: ttsTriggerSettings.subscriptionId,
        subscriptionError: ttsTriggerSettings.subscriptionError,
        subscriptionUpdatedAt: ttsTriggerSettings.subscriptionUpdatedAt,
        lastWebhookReceivedAt: ttsTriggerSettings.lastWebhookReceivedAt,
        lastWebhookEventType: ttsTriggerSettings.lastWebhookEventType,
        lastWebhookError: ttsTriggerSettings.lastWebhookError,
        lastAcceptedRedemptionAt: ttsTriggerSettings.lastAcceptedRedemptionAt,
        lastAcceptedRedemption: ttsTriggerSettings.lastAcceptedRedemption,
        signatureVerificationDisabled: process.env.KICK_SKIP_WEBHOOK_SIGNATURE === '1'
    };
}

function formatKickApiError(error, fallbackMessage) {
    const responseData = error?.response?.data;

    if (typeof responseData === 'string' && responseData.trim()) {
        return responseData;
    }

    if (responseData?.message) {
        return responseData.message;
    }

    if (Array.isArray(responseData?.data) && responseData.data.length > 0) {
        const first = responseData.data[0];
        if (typeof first?.error === 'string' && first.error.trim()) {
            return first.error;
        }
        if (typeof first?.message === 'string' && first.message.trim()) {
            return first.message;
        }
    }

    return error?.message || fallbackMessage;
}

async function getKickPublicKey() {
    const cacheTtlMs = 60 * 60 * 1000;
    if (kickPublicKeyCache.value && Date.now() - kickPublicKeyCache.fetchedAt < cacheTtlMs) {
        return kickPublicKeyCache.value;
    }

    const response = await axios.get(KICK_PUBLIC_KEY_URL, { timeout: 5000 });
    const publicKey = response.data?.data?.public_key;

    if (!publicKey) {
        throw new Error('Kick public key response did not include a public key');
    }

    kickPublicKeyCache = {
        value: publicKey,
        fetchedAt: Date.now()
    };

    return publicKey;
}

async function verifyKickWebhookSignature(req) {
    if (process.env.KICK_SKIP_WEBHOOK_SIGNATURE === '1') {
        return true;
    }

    const signature = req.get('Kick-Event-Signature');
    const messageId = req.get('Kick-Event-Message-Id');
    const messageTimestamp = req.get('Kick-Event-Message-Timestamp');

    if (!signature || !messageId || !messageTimestamp) {
        return false;
    }

    const publicKey = await getKickPublicKey();
    const payload = `${messageId}.${messageTimestamp}.${req.rawBody || ''}`;
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(payload);
    verifier.end();

    return verifier.verify(publicKey, signature, 'base64');
}

async function buildChannelPointEventMessage(redemptionPayload, accessToken = null) {
    const rewardTitle = String(redemptionPayload.reward?.title || '').trim();
    const userInput = String(redemptionPayload.user_input || '').trim();
    
    console.log('🎟️ Full channel point redemption payload:');
    console.log(JSON.stringify(redemptionPayload, null, 2));
    
    // Try to get username from payload first
    let redeemerName = redemptionPayload.redeemer?.username 
        || redemptionPayload.user?.username 
        || redemptionPayload.username
        || redemptionPayload.redeemer?.user?.username
        || redemptionPayload.redeemer?.display_name
        || redemptionPayload.user?.display_name
        || redemptionPayload.display_name;
    
    // If no username in payload, try to lookup by user_id
    if (!redeemerName && redemptionPayload.redeemer?.user_id && accessToken) {
        console.log(`👤 No username in payload, looking up user ID: ${redemptionPayload.redeemer.user_id}`);
        redeemerName = await lookupUsernameById(redemptionPayload.redeemer.user_id, accessToken);
    }
    
    // Final fallback
    if (!redeemerName) {
        redeemerName = `User_${redemptionPayload.redeemer?.user_id || 'Unknown'}`;
    }
    
    console.log('🎟️ Username extraction result:', {
        'final_username': redeemerName,
        'user_id': redemptionPayload.redeemer?.user_id
    });
    
    const broadcasterChannel = String(redemptionPayload.broadcaster?.channel_slug || '').trim().toLowerCase();

    // Parse TTS voice from user input (same logic as chat commands)
    let ttsVoice = 'default';
    let ttsText = userInput;
    let ttsEligible = true;
    
    if (userInput) {
        const match = userInput.match(/^!(\w+)\s+([\s\S]+)$/i);
        if (match) {
            const command = match[1].toLowerCase();
            const parsedText = match[2].trim();
            if (parsedText.length > 0) {
                ttsVoice = command === 'tts' ? 'default' : command;
                ttsText = parsedText;
                console.log(`🎟️ Parsed TTS command: !${command} -> voice: ${ttsVoice}, text: "${ttsText}"`);
            }
        }
    }

    return {
        id: `reward:${redemptionPayload.id}`,
        user: redeemerName,
        message: userInput,
        timestamp: redemptionPayload.redeemed_at || new Date().toISOString(),
        badges: [
            { type: 'reward', text: 'Reward' },
            { type: 'reward-title', text: rewardTitle || 'Channel Points' }
        ],
        color: null,
        type: 'channel_point_redemption',
        played: false,
        ttsEligible,
        ttsText,
        ttsVoice,
        rewardTitle,
        broadcasterChannel,
        redemptionStatus: redemptionPayload.status,
        raw: redemptionPayload
    };
}

function flattenRedemptionGroups(payload) {
    const groups = Array.isArray(payload?.data) ? payload.data : [];
    const flattened = [];

    groups.forEach((group) => {
        const reward = group?.reward || null;
        const redemptions = Array.isArray(group?.redemptions) ? group.redemptions : [];
        redemptions.forEach((redemption) => {
            flattened.push({
                ...redemption,
                reward: redemption.reward || reward
            });
        });
    });

    return flattened;
}

async function queueChannelPointRedemption(redemptionPayload, accessToken = null) {
    const redemptionId = String(redemptionPayload?.id || '').trim();
    const rewardTitle = String(redemptionPayload?.reward?.title || '').trim();
    const userInput = String(redemptionPayload?.user_input || '').trim();
    const status = normalizeComparableText(redemptionPayload?.status || 'accepted');
    const expectedRewardTitle = normalizeComparableText(ttsTriggerSettings.channelPointsRewardTitle);

    ttsTriggerSettings.lastWebhookReceivedAt = new Date().toISOString();
    ttsTriggerSettings.lastWebhookEventType = KICK_REDEMPTION_EVENT_NAME;

    if (!redemptionId || !userInput) {
        return { accepted: false, reason: 'missing_redemption_fields' };
    }

    if (status === 'rejected') {
        return { accepted: false, reason: 'redemption_rejected' };
    }

    if (expectedRewardTitle && normalizeComparableText(rewardTitle) !== expectedRewardTitle) {
        return { accepted: false, reason: 'reward_title_mismatch' };
    }

    pruneProcessedRedemptions();
    if (processedRedemptionIds.has(redemptionId)) {
        return { accepted: false, reason: 'duplicate_redemption' };
    }

    // Build message with access token for username lookup (await since it's now async)
    const channelPointMessage = await buildChannelPointEventMessage(redemptionPayload, accessToken);
    processedRedemptionIds.set(redemptionId, Date.now());
    channelPointEvents = channelPointEvents.filter((entry) => entry.id !== channelPointMessage.id);
    channelPointEvents.unshift(channelPointMessage);
    pruneChannelPointEvents();

    ttsTriggerSettings.lastAcceptedRedemptionAt = channelPointMessage.timestamp;
    ttsTriggerSettings.lastAcceptedRedemption = {
        id: redemptionId,
        rewardTitle: rewardTitle || null,
        user: channelPointMessage.user,
        text: userInput,
        status: redemptionPayload.status || 'accepted'
    };
    ttsTriggerSettings.lastWebhookError = null;

    io.emit('channel-point-redemption', channelPointMessage);

    return { accepted: true, message: channelPointMessage };
}

function getQueuedChannelPointEventsSince(sinceTimestamp) {
    const sinceMs = toTimestampMs(sinceTimestamp);
    if (sinceMs === null) {
        return [...channelPointEvents];
    }

    const graceMs = 5000;
    return channelPointEvents.filter((event) => {
        const eventTimestampMs = toTimestampMs(event.timestamp);
        if (eventTimestampMs === null) {
            return true;
        }
        return eventTimestampMs > (sinceMs - graceMs);
    });
}

async function getExistingRewardRedemptionSubscription(accessToken) {
    const response = await axios.get(`${KICK_API_BASE_URL}/public/v1/events/subscriptions`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
        },
        timeout: 8000
    });

    const subscriptions = Array.isArray(response.data?.data) ? response.data.data : [];
    return subscriptions.find((subscription) => {
        return subscription.event === KICK_REDEMPTION_EVENT_NAME
            && Number(subscription.version) === KICK_REDEMPTION_EVENT_VERSION
            && subscription.method === 'webhook';
    }) || null;
}

async function ensureRewardRedemptionSubscription(accessToken) {
    const existingSubscription = await getExistingRewardRedemptionSubscription(accessToken);
    if (existingSubscription) {
        ttsTriggerSettings.subscriptionStatus = 'active';
        ttsTriggerSettings.subscriptionId = existingSubscription.id;
        ttsTriggerSettings.subscriptionError = null;
        ttsTriggerSettings.subscriptionUpdatedAt = new Date().toISOString();
        return {
            created: false,
            subscription: existingSubscription
        };
    }

    const response = await axios.post(`${KICK_API_BASE_URL}/public/v1/events/subscriptions`, {
        method: 'webhook',
        events: [
            {
                name: KICK_REDEMPTION_EVENT_NAME,
                version: KICK_REDEMPTION_EVENT_VERSION
            }
        ]
    }, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        timeout: 8000
    });

    const createdSubscription = Array.isArray(response.data?.data)
        ? response.data.data[0]
        : null;

    ttsTriggerSettings.subscriptionStatus = createdSubscription?.error ? 'error' : 'active';
    ttsTriggerSettings.subscriptionId = createdSubscription?.subscription_id || null;
    ttsTriggerSettings.subscriptionError = createdSubscription?.error || null;
    ttsTriggerSettings.subscriptionUpdatedAt = new Date().toISOString();

    return {
        created: true,
        subscription: createdSubscription
    };
}

async function acceptPendingRewardRedemptions(accessToken, redemptionIds) {
    if (!Array.isArray(redemptionIds) || redemptionIds.length === 0) {
        return;
    }

    try {
        await axios.post(`${KICK_API_BASE_URL}/public/v1/channels/rewards/redemptions/accept`, {
            ids: redemptionIds.slice(0, 25)
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 8000
        });
    } catch (error) {
        console.warn('⚠️ Failed to auto-accept reward redemptions:', error.response?.data || error.message);
    }
}

async function pollChannelPointRedemptions(accessToken, sinceTimestamp = null) {
    if (ttsTriggerSettings.mode === 'chat_commands') {
        return [];
    }

    if (ttsTriggerSettings.subscriptionStatus !== 'active' && ttsTriggerSettings.subscriptionStatus !== 'scope_required') {
        ttsTriggerSettings.subscriptionStatus = 'polling_local';
        ttsTriggerSettings.subscriptionError = null;
        ttsTriggerSettings.subscriptionUpdatedAt = new Date().toISOString();
    }

    const flattenedRedemptions = [];

    for (const status of KICK_POLLABLE_REDEMPTION_STATUSES) {
        try {
            const response = await axios.get(`${KICK_API_BASE_URL}/public/v1/channels/rewards/redemptions`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json'
                },
                params: {
                    status
                },
                timeout: 8000
            });

            flattenedRedemptions.push(...flattenRedemptionGroups(response.data));
        } catch (error) {
            const message = error.response?.data?.message || error.message;
            console.warn(`⚠️ Reward redemption poll failed for status=${status}:`, message);

            if (error.response?.status === 403) {
                ttsTriggerSettings.subscriptionError = 'Missing channel rewards scope. Log out and log in again to grant channel point access.';
                ttsTriggerSettings.subscriptionStatus = 'scope_required';
                ttsTriggerSettings.subscriptionUpdatedAt = new Date().toISOString();
                break;
            }
        }
    }

    if (flattenedRedemptions.length === 0) {
        return [];
    }

    // Filter by timestamp if provided (only get redemptions since monitoring started)
    let filteredRedemptions = flattenedRedemptions;
    if (sinceTimestamp) {
        const sinceMs = toTimestampMs(sinceTimestamp);
        if (sinceMs !== null) {
            const graceMs = 5000; // 5 second grace period
            filteredRedemptions = flattenedRedemptions.filter((redemption) => {
                const redeemedMs = toTimestampMs(redemption.redeemed_at);
                if (redeemedMs === null) {
                    return true; // Include redemptions without valid timestamps
                }
                return redeemedMs > (sinceMs - graceMs);
            });
            console.log(`🎟️ Filtered ${flattenedRedemptions.length} redemptions to ${filteredRedemptions.length} since ${sinceTimestamp}`);
        }
    }

    filteredRedemptions.sort((left, right) => {
        const rightMs = toTimestampMs(right.redeemed_at) || 0;
        const leftMs = toTimestampMs(left.redeemed_at) || 0;
        return rightMs - leftMs;
    });

    const acceptedPendingIds = [];
    const queuedMessages = [];

    for (const redemption of filteredRedemptions) {
        const result = await queueChannelPointRedemption(redemption, accessToken);
        if (result.accepted && result.message) {
            queuedMessages.push(result.message);
            if (normalizeComparableText(redemption.status) === 'pending') {
                acceptedPendingIds.push(String(redemption.id));
            }
        }
    }

    if (acceptedPendingIds.length > 0) {
        await acceptPendingRewardRedemptions(accessToken, acceptedPendingIds);
    }

    return queuedMessages;
}

async function resolveChannelMetadata(channelName, accessToken) {
    const normalizedChannelName = normalizeComparableText(channelName);
    const cachedEntry = getValidCacheEntry(normalizedChannelName);
    const browserHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://kick.com/${normalizedChannelName}`
    };

    const metadata = {
        channelName: normalizedChannelName,
        channelId: cachedEntry?.channelId || null,
        broadcasterUserId: cachedEntry?.broadcasterUserId || null,
        browserHeaders
    };

    try {
        const channelsResponse = await axios.get(`${KICK_API_BASE_URL}/public/v1/channels`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
            },
            params: {
                slug: normalizedChannelName
            },
            timeout: 6000
        });

        const channelRecord = Array.isArray(channelsResponse.data?.data)
            ? channelsResponse.data.data[0]
            : null;

        if (channelRecord?.broadcaster_user_id) {
            metadata.broadcasterUserId = String(channelRecord.broadcaster_user_id);
        }

        if (channelRecord?.id) {
            metadata.channelId = String(channelRecord.id);
        }
    } catch (_error) {
        // Keep going with internal endpoint fallbacks below.
    }

    if (!metadata.channelId && metadata.broadcasterUserId) {
        try {
            const livestreamResponse = await axios.get(`${KICK_API_BASE_URL}/public/v1/livestreams`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json'
                },
                params: {
                    broadcaster_user_id: metadata.broadcasterUserId,
                    limit: 1
                },
                timeout: 6000
            });

            const livestreamRecord = Array.isArray(livestreamResponse.data?.data)
                ? livestreamResponse.data.data[0]
                : null;

            if (livestreamRecord?.channel_id) {
                metadata.channelId = String(livestreamRecord.channel_id);
            }
        } catch (_error) {
            // Keep going with internal endpoint fallbacks below.
        }
    }

    if (!metadata.channelId) {
        const channelInfoEndpoints = [
            `https://kick.com/api/v2/channels/${normalizedChannelName}`,
            `https://kick.com/api/v1/channels/${normalizedChannelName}`
        ];

        for (const infoUrl of channelInfoEndpoints) {
            try {
                const infoResponse = await axios.get(infoUrl, {
                    headers: browserHeaders,
                    timeout: 6000,
                    validateStatus: () => true
                });

                if (infoResponse.status !== 200 || !infoResponse.data) {
                    continue;
                }

                const payload = infoResponse.data;
                const resolvedChannelId =
                    payload.id ||
                    payload.channel?.id ||
                    payload.chatroom?.id ||
                    payload.data?.id ||
                    payload.data?.channel?.id ||
                    payload.data?.chatroom?.id;
                const resolvedBroadcasterId =
                    payload.broadcaster_user_id ||
                    payload.user_id ||
                    payload.channel?.broadcaster_user_id ||
                    payload.data?.broadcaster_user_id ||
                    payload.data?.channel?.broadcaster_user_id;

                if (resolvedChannelId && !metadata.channelId) {
                    metadata.channelId = String(resolvedChannelId);
                }

                if (resolvedBroadcasterId && !metadata.broadcasterUserId) {
                    metadata.broadcasterUserId = String(resolvedBroadcasterId);
                }

                if (metadata.channelId || metadata.broadcasterUserId) {
                    break;
                }
            } catch (_error) {
                // Continue to next resolver endpoint.
            }
        }
    }

    if (metadata.channelId || metadata.broadcasterUserId) {
        updateChatProbeCache(normalizedChannelName, {
            channelId: metadata.channelId,
            broadcasterUserId: metadata.broadcasterUserId,
            preferredEndpointName: cachedEntry?.preferredEndpointName || null
        });
    }

    return metadata;
}

function getValidCacheEntry(channelName) {
    const entry = chatProbeCache.get(channelName);
    if (!entry) {
        return null;
    }

    if (Date.now() - entry.updatedAt > CHAT_CACHE_TTL_MS) {
        chatProbeCache.delete(channelName);
        return null;
    }

    return entry;
}

function updateChatProbeCache(channelName, patch) {
    const existing = chatProbeCache.get(channelName) || {};
    chatProbeCache.set(channelName, {
        ...existing,
        ...patch,
        updatedAt: Date.now()
    });
}

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
        scope: 'user:read channels:read channel:rewards:read channel:rewards:write events:subscribe webhooks:manage chat:read',
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
        scope: 'user:read channels:read channel:rewards:read channel:rewards:write events:subscribe webhooks:manage chat:read',
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
        polling_active: true,
        tts_trigger: {
            mode: ttsTriggerSettings.mode,
            reward_title: ttsTriggerSettings.channelPointsRewardTitle,
            last_redemption_at: ttsTriggerSettings.lastAcceptedRedemptionAt,
            subscription_status: ttsTriggerSettings.subscriptionStatus
        }
    });
});

app.get('/api/tts/settings', (req, res) => {
    res.json({
        success: true,
        settings: buildTtsSettingsResponse(req)
    });
});

app.post('/api/tts/settings', (req, res) => {
    const validModes = new Set(['chat_commands', 'channel_points', 'both']);
    const requestedMode = String(req.body?.mode || '').trim().toLowerCase();
    const requestedRewardTitle = String(req.body?.channelPointsRewardTitle || '').trim();

    if (!validModes.has(requestedMode)) {
        return res.status(400).json({
            success: false,
            error: 'mode must be one of: chat_commands, channel_points, both'
        });
    }

    ttsTriggerSettings.mode = requestedMode;
    ttsTriggerSettings.channelPointsRewardTitle = requestedRewardTitle || 'Test-tts';

    res.json({
        success: true,
        settings: buildTtsSettingsResponse(req)
    });
});

// Moderation API endpoints
app.get('/api/moderation/settings', (req, res) => {
    res.json({
        success: true,
        settings: {
            banList: Array.from(moderationSettings.banList),
            permissionMode: moderationSettings.permissionMode,
            enableBanList: moderationSettings.enableBanList,
            enablePermissionFilter: moderationSettings.enablePermissionFilter
        }
    });
});

app.post('/api/moderation/settings', (req, res) => {
    const { permissionMode, enableBanList, enablePermissionFilter } = req.body;
    
    const validModes = ['all', 'subscribers_only', 'moderators_only', 'vips_only'];
    if (permissionMode && !validModes.includes(permissionMode)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid permission mode. Must be: all, subscribers_only, moderators_only, or vips_only'
        });
    }
    
    if (permissionMode) moderationSettings.permissionMode = permissionMode;
    if (typeof enableBanList === 'boolean') moderationSettings.enableBanList = enableBanList;
    if (typeof enablePermissionFilter === 'boolean') moderationSettings.enablePermissionFilter = enablePermissionFilter;
    
    res.json({
        success: true,
        settings: {
            banList: Array.from(moderationSettings.banList),
            permissionMode: moderationSettings.permissionMode,
            enableBanList: moderationSettings.enableBanList,
            enablePermissionFilter: moderationSettings.enablePermissionFilter
        }
    });
});

app.post('/api/moderation/ban', (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Username is required'
        });
    }
    
    const normalizedUsername = normalizeComparableText(username);
    moderationSettings.banList.add(normalizedUsername);
    
    console.log(`🚫 Added user to ban list: ${username}`);
    
    res.json({
        success: true,
        banList: Array.from(moderationSettings.banList),
        message: `User ${username} added to ban list`
    });
});

app.delete('/api/moderation/ban/:username', (req, res) => {
    const { username } = req.params;
    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'Username is required'
        });
    }
    
    const normalizedUsername = normalizeComparableText(username);
    const wasRemoved = moderationSettings.banList.delete(normalizedUsername);
    
    if (wasRemoved) {
        console.log(`✅ Removed user from ban list: ${username}`);
    }
    
    res.json({
        success: true,
        banList: Array.from(moderationSettings.banList),
        message: wasRemoved ? `User ${username} removed from ban list` : `User ${username} was not in ban list`
    });
});

app.post('/api/kick/channel-point-subscription', async (req, res) => {
    const accessToken = req.session.accessToken;
    if (!accessToken) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    try {
        const result = await ensureRewardRedemptionSubscription(accessToken);
        res.json({
            success: true,
            created: result.created,
            subscription: result.subscription,
            settings: buildTtsSettingsResponse(req)
        });
    } catch (error) {
        let message = formatKickApiError(error, 'Failed to subscribe to channel point redemptions');
        if (/bad request/i.test(message)) {
            message = 'Bad request from Kick when subscribing webhook events (often means webhook URL is not configured publicly in Kick app settings). Local polling mode can still work without this.';
        }
        ttsTriggerSettings.subscriptionStatus = 'error';
        ttsTriggerSettings.subscriptionError = message;
        ttsTriggerSettings.subscriptionUpdatedAt = new Date().toISOString();

        res.status(500).json({
            success: false,
            error: message,
            settings: buildTtsSettingsResponse(req)
        });
    }
});

app.post(KICK_WEBHOOK_PATH, async (req, res) => {
    try {
        const signatureValid = await verifyKickWebhookSignature(req);
        if (!signatureValid) {
            ttsTriggerSettings.lastWebhookReceivedAt = new Date().toISOString();
            ttsTriggerSettings.lastWebhookError = 'Invalid or missing Kick webhook signature';
            return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
        }

        const eventType = req.get('Kick-Event-Type') || 'unknown';
        ttsTriggerSettings.lastWebhookReceivedAt = new Date().toISOString();
        ttsTriggerSettings.lastWebhookEventType = eventType;

        if (eventType !== KICK_REDEMPTION_EVENT_NAME) {
            return res.status(202).json({ success: true, ignored: true, eventType });
        }

        // Get access token for username lookup (may not be available in webhook context)
        const accessToken = req.session?.accessToken || null;
        const result = await queueChannelPointRedemption(req.body || {}, accessToken);
        res.json({
            success: true,
            processed: result.accepted,
            reason: result.reason || null
        });
    } catch (error) {
        ttsTriggerSettings.lastWebhookReceivedAt = new Date().toISOString();
        ttsTriggerSettings.lastWebhookError = error.message;
        console.error('Kick webhook processing error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
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

// Get live chat messages using polling approach
app.post('/api/get-live-chat-messages', async (req, res) => {
    console.log('💬 Live chat messages requested');
    
    try {
        const { channel_name, since_timestamp } = req.body;
        const access_token = req.session.accessToken;
        const channelName = String(channel_name || '').trim().toLowerCase();
        const cacheEntry = getValidCacheEntry(channelName);

        if (!channelName) {
            return res.status(400).json({ success: false, error: 'channel_name is required' });
        }
        
        if (!access_token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        console.log('💬 FETCHING LIVE CHAT MESSAGES...');
        if (since_timestamp) {
            console.log('📅 Filtering messages since:', since_timestamp);
        }
        
        const metadata = await resolveChannelMetadata(channelName, access_token);
        const browserHeaders = metadata.browserHeaders;
        const channelId = metadata.channelId;

        if (channelId) {
            if (!cacheEntry?.channelId || cacheEntry.channelId !== channelId) {
                console.log(`🧭 Resolved channel "${channelName}" to id ${channelId}`);
            }
        } else {
            console.log(`⚠️ Could not resolve channel id for "${channelName}". Using name-based endpoints only.`);
        }

        // Try multiple chat message endpoints
        const chatEndpoints = [
            {
                name: 'v2/channels/messages (by name)',
                url: `https://kick.com/api/v2/channels/${channelName}/messages`,
                description: 'v2 channel messages API (by name)'
            },
            {
                name: 'v1/channels/messages (by name)',
                url: `https://kick.com/api/v1/channels/${channelName}/messages`,
                description: 'v1 channel messages API (by name)'
            },
            {
                name: 'v2/channels/messages?limit=100 (by name)',
                url: `https://kick.com/api/v2/channels/${channelName}/messages?limit=100`,
                description: 'v2 channel messages with higher limit (by name)'
            },
            {
                name: 'v2/channels/messages/recent (by name)',
                url: `https://kick.com/api/v2/channels/${channelName}/messages/recent`,
                description: 'Recent messages API (by name)'
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

        if (channelId) {
            chatEndpoints.push(
                {
                    name: 'v2/channels/messages (by id)',
                    url: `https://kick.com/api/v2/channels/${channelId}/messages`,
                    description: 'v2 channel messages API (by ID)'
                },
                {
                    name: 'v1/channels/messages (by id)',
                    url: `https://kick.com/api/v1/channels/${channelId}/messages`,
                    description: 'v1 channel messages API (by ID)'
                },
                {
                    name: 'v2/channels/messages?limit=100 (by id)',
                    url: `https://kick.com/api/v2/channels/${channelId}/messages?limit=100`,
                    description: 'v2 channel messages with higher limit (by ID)'
                },
                {
                    name: 'v2/channels/messages/live (by id)',
                    url: `https://kick.com/api/v2/channels/${channelId}/messages/live`,
                    description: 'Live messages endpoint attempt (by ID)'
                },
                {
                    name: 'v2/channels/messages?recent=true (by id)',
                    url: `https://kick.com/api/v2/channels/${channelId}/messages?recent=true&limit=100`,
                    description: 'Messages with recent flag (by ID)'
                },
                {
                    name: 'v2/channels/messages/recent (by id)',
                    url: `https://kick.com/api/v2/channels/${channelId}/messages/recent`,
                    description: 'Recent messages API (by ID)'
                },
                {
                    name: 'v2/chatrooms/messages (by id)',
                    url: `https://kick.com/api/v2/chatrooms/${channelId}/messages`,
                    description: 'v2 chatroom messages API (by ID)'
                }
            );
        }

        if (cacheEntry?.preferredEndpointName) {
            const preferredIndex = chatEndpoints.findIndex((endpoint) => endpoint.name === cacheEntry.preferredEndpointName);
            if (preferredIndex > 0) {
                const [preferredEndpoint] = chatEndpoints.splice(preferredIndex, 1);
                chatEndpoints.unshift(preferredEndpoint);
            }
        }
        
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
                                    const username = msg.sender?.username || msg.user?.username || msg.username || 'Unknown';
                                    const userId = msg.sender?.id || msg.user?.id || msg.user_id || msg.id;
                                    
                                    // Cache username/user_id mapping from chat messages (only log new entries)
                                    if (username && username !== 'Unknown' && userId) {
                                        const cacheKey = String(userId);
                                        const existingEntry = userLookupCache.get(cacheKey);
                                        
                                        // Only cache and log if it's a new username or expired entry
                                        if (!existingEntry || (Date.now() - existingEntry.timestamp) >= USER_CACHE_DURATION) {
                                            userLookupCache.set(cacheKey, {
                                                username: username,
                                                timestamp: Date.now()
                                            });
                                            console.log(`👤 Cached username: ${userId} -> ${username}`);
                                        }
                                    }
                                    
                                    return {
                                        id: msg.id || Date.now(),
                                        user: username,
                                        message: msg.content || msg.message || msg.text || String(msg),
                                        timestamp: msg.created_at || msg.timestamp || new Date().toISOString(),
                                        badges: msg.sender?.identity?.badges || msg.badges || [],
                                        color: msg.sender?.identity?.color || null,
                                        type: msg.type || 'message',
                                        played: false, // Initialize played flag for TTS replay control
                                        raw: msg, // Include raw message for debugging
                                        moderationFlags: null // Will be set by shouldProcessMessage
                                    };
                                });
                                
                                // Apply moderation flags to all messages (but don't filter them out)
                                processedMessages.forEach(msg => shouldProcessMessage(msg));
                                
                                // Transfer moderation flags from temp message to processed message
                                processedMessages.forEach(msg => {
                                    if (msg.moderationFlags) {
                                        // Copy flags to the message object for frontend use
                                        msg.isBanned = msg.moderationFlags.isBanned;
                                        msg.hasPermission = msg.moderationFlags.hasPermission;
                                        msg.autoTtsEligible = msg.moderationFlags.autoTtsEligible;
                                    }
                                });
                                
                                // Filter by timestamp if provided (only messages AFTER monitoring started)
                                if (since_timestamp) {
                                    const sinceMs = toTimestampMs(since_timestamp);
                                    const beforeFilterCount = processedMessages.length;

                                    if (sinceMs !== null) {
                                        const graceMs = 5000;
                                        processedMessages = processedMessages.filter(msg => {
                                            const msgMs = toTimestampMs(msg.timestamp);
                                            if (msgMs === null) {
                                                return true;
                                            }
                                            return msgMs > (sinceMs - graceMs);
                                        });

                                        console.log(`📅 Timestamp filter: ${beforeFilterCount} total → ${processedMessages.length} new messages since ${since_timestamp}`);
                                    } else {
                                        console.log(`⚠️ Skipping timestamp filter due to invalid since_timestamp: ${since_timestamp}`);
                                    }
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
                            if (CHAT_ROUTE_DEBUG_LOGS) {
                                console.log(`   ❌ Failed to parse JSON: ${parseError.message}`);
                            }
                        }
                    } else {
                        if (CHAT_ROUTE_DEBUG_LOGS) {
                            console.log(`   📄 Non-JSON response (${response.status})`);
                        }
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
                    if (CHAT_ROUTE_DEBUG_LOGS) {
                        console.log(`   ❌ Error response: ${response.status}`);
                    }
                    messageResults.push({
                        endpoint: endpoint,
                        status: response.status,
                        working: false,
                        error: `HTTP ${response.status}`
                    });
                }
                
            } catch (error) {
                if (CHAT_ROUTE_DEBUG_LOGS) {
                    console.log(`   ❌ Error testing ${endpoint.name}: ${error.message}`);
                }
                messageResults.push({
                    endpoint: endpoint,
                    error: error.message,
                    working: false
                });
            }
        }
        
        await pollChannelPointRedemptions(access_token, since_timestamp);

        const queuedChannelPointMessages = getQueuedChannelPointEventsSince(since_timestamp)
            .filter((message) => {
                if (!message.broadcasterChannel) {
                    return true;
                }

                return message.broadcasterChannel === channelName;
            });
        let combinedMessages = Array.isArray(chatMessages) ? [...chatMessages] : [];

        if (queuedChannelPointMessages.length > 0) {
            const existingIds = new Set(combinedMessages.map((message) => message.id));
            queuedChannelPointMessages.forEach((message) => {
                if (!existingIds.has(message.id)) {
                    combinedMessages.push(message);
                }
            });
        }

        combinedMessages.sort((left, right) => {
            const rightMs = toTimestampMs(right.timestamp) || 0;
            const leftMs = toTimestampMs(left.timestamp) || 0;
            return rightMs - leftMs;
        });

        const workingEndpoints = messageResults.filter(r => r.working);
        const totalMessages = combinedMessages.length;
        
        // Simplified logging - only show essential info
        if (workingEndpoints.length > 0) {
            console.log(`✅ Chat fetch successful: ${totalMessages} messages`);
            if (workingEndpoint?.name) {
                updateChatProbeCache(channelName, {
                    channelId: channelId || cacheEntry?.channelId || null,
                    preferredEndpointName: workingEndpoint.name
                });
            }
        } else {
            console.log(`⚠️ No chat messages found`);
        }
        
        res.json({
            success: true,
            channel: channel_name,
            channel_id: channelId,
            tts_trigger: {
                mode: ttsTriggerSettings.mode,
                reward_title: ttsTriggerSettings.channelPointsRewardTitle,
                subscription_status: ttsTriggerSettings.subscriptionStatus,
                subscription_error: ttsTriggerSettings.subscriptionError,
                last_redemption_at: ttsTriggerSettings.lastAcceptedRedemptionAt
            },
            summary: {
                working_endpoints: workingEndpoints.length,
                total_messages: totalMessages,
                best_endpoint: workingEndpoint?.name || null,
                queued_channel_point_messages: queuedChannelPointMessages.length
            },
            messages: combinedMessages,
            endpoints_tested: messageResults,
            recommendations: workingEndpoint ? 
                `Use ${workingEndpoint.name} for polling - it returned ${combinedMessages.length} messages!` :
                totalMessages > 0 ?
                'Messages found but in unexpected format - check endpoint data structures.' :
                'No chat messages found. Channel might be offline or use different API structure.'
        });
        
    } catch (error) {
        console.error('❌ Live chat message fetch failed:', error.response?.data || error.message);
        res.status(400).json({ 
            success: false, 
            error: error.response?.data?.message || error.message 
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