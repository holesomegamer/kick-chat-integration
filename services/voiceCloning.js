const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/voices/add';
const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

function isLocalTTSEnabled() {
    const value = String(process.env.LOCAL_TTS_ENABLED || '').trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function getLocalTTSBaseUrl() {
    return String(process.env.LOCAL_TTS_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

function getConfiguredCloneProvider() {
    if (isLocalTTSEnabled()) {
        return {
            provider: 'local',
            mode: 'local',
            configured: true
        };
    }

    if (process.env.ELEVENLABS_API_KEY) {
        return {
            provider: 'elevenlabs',
            mode: 'live',
            configured: true
        };
    }

    return {
        provider: 'mock',
        mode: 'mock',
        configured: false
    };
}

async function createVoiceClone({ name, tag, samplePath }) {
    if (isLocalTTSEnabled()) {
        return createLocalVoiceClone({ name, tag, samplePath });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
        return simulateVoiceClone({ name, tag, samplePath });
    }

    const form = new FormData();
    form.append('name', name);
    form.append('description', `Kick voice clone for !${tag}`);
    form.append('labels', JSON.stringify({ source: 'kick-chat-integration', tag }));
    form.append('remove_background_noise', 'false');
    form.append('files', fs.createReadStream(samplePath));

    const response = await axios.post(ELEVENLABS_API_URL, form, {
        headers: {
            ...form.getHeaders(),
            'xi-api-key': apiKey
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });

    return {
        provider: 'elevenlabs',
        externalVoiceId: response.data.voice_id,
        requiresVerification: response.data.requires_verification === true,
        mode: 'live'
    };
}

async function createLocalVoiceClone({ name, tag, samplePath }) {
    try {
        const localBaseUrl = getLocalTTSBaseUrl();
        const form = new FormData();
        form.append('name', name);
        form.append('tag', tag);
        form.append('sample_file', fs.createReadStream(samplePath));

        const response = await axios.post(`${localBaseUrl}/clone`, form, {
            headers: {
                ...form.getHeaders()
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        return {
            provider: 'local',
            externalVoiceId: response.data.voice_id || response.data.id || tag,
            requiresVerification: false,
            mode: 'local',
            status: 'ready',
            error: null
        };
    } catch (error) {
        // Handle axios errors properly
        if (error.response) {
            const statusCode = error.response.status;
            const errorData = error.response.data;
            
            if (statusCode === 409) {
                throw new Error(`Voice tag "${tag}" already exists. Please choose a different tag.`);
            }
            
            throw new Error(errorData.detail || errorData.message || `HTTP ${statusCode} error from local TTS service`);
        }
        
        throw new Error(`Failed to connect to local TTS service: ${error.message}`);
    }
}

function simulateVoiceClone({ tag }) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                provider: 'mock',
                externalVoiceId: `mock-${tag}-${Date.now()}`,
                requiresVerification: false,
                mode: 'mock'
            });
        }, 2500);
    });
}

async function synthesizeVoiceText({ externalVoiceId, text }) {
    return synthesizeVoiceTextForProvider({
        provider: 'elevenlabs',
        externalVoiceId,
        text
    });
}

async function synthesizeVoiceTextForProvider({ provider, externalVoiceId, text, voiceTag }) {
    if (provider === 'local') {
        return synthesizeWithLocalProvider({ externalVoiceId, text, voiceTag });
    }

    if (provider === 'elevenlabs') {
        return synthesizeWithElevenLabs({ externalVoiceId, text });
    }

    throw new Error(`Unsupported synthesis provider: ${provider}`);
}

async function synthesizeWithElevenLabs({ externalVoiceId, text }) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY is not configured for live custom voice playback.');
    }

    const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
    const response = await axios.post(
        `${ELEVENLABS_TTS_URL}/${externalVoiceId}`,
        {
            text,
            model_id: modelId,
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
            }
        },
        {
            responseType: 'arraybuffer',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg'
            }
        }
    );

    return {
        audioBuffer: response.data,
        contentType: 'audio/mpeg'
    };
}

async function synthesizeWithLocalProvider({ externalVoiceId, text, voiceTag }) {
    const localBaseUrl = getLocalTTSBaseUrl();
    const response = await axios.post(
        `${localBaseUrl}/synthesize`,
        {
            voice_id: externalVoiceId,
            voice_tag: voiceTag,
            text
        },
        {
            responseType: 'arraybuffer',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg,audio/wav,application/octet-stream'
            }
        }
    );

    return {
        audioBuffer: response.data,
        contentType: response.headers['content-type'] || 'audio/mpeg'
    };
}

async function deleteVoiceClone({ tag, externalVoiceId, provider }) {
    if (provider === 'local') {
        return deleteLocalVoiceClone({ tag, externalVoiceId });
    }

    if (provider === 'elevenlabs') {
        return deleteElevenLabsVoice({ externalVoiceId });
    }

    // For mock provider, just return success
    return { success: true, provider: 'mock' };
}

async function deleteLocalVoiceClone({ tag, externalVoiceId }) {
    try {
        const localBaseUrl = getLocalTTSBaseUrl();
        
        // Try deleting by voice_id first, then by tag as fallback
        const deleteUrl = externalVoiceId 
            ? `${localBaseUrl}/voices/${encodeURIComponent(externalVoiceId)}`
            : `${localBaseUrl}/voices/tag/${encodeURIComponent(tag)}`;

        const response = await axios.delete(deleteUrl, {
            timeout: 10000
        });

        return {
            success: true,
            provider: 'local',
            message: 'Voice deleted from local TTS service'
        };
    } catch (error) {
        // If the voice doesn't exist in the service, that's okay
        if (error.response && error.response.status === 404) {
            return {
                success: true,
                provider: 'local',
                message: 'Voice was not found in local TTS service (may have already been deleted)'
            };
        }

        // If the endpoint doesn't exist (405/501), the TTS service might not support deletion yet
        if (error.response && (error.response.status === 405 || error.response.status === 501)) {
            return {
                success: false,
                provider: 'local',
                error: 'Local TTS service does not support voice deletion yet'
            };
        }

        // Log the error but don't fail the entire deletion
        console.warn(`Failed to delete voice from local TTS service: ${error.message}`);
        return {
            success: false,
            provider: 'local',
            error: error.message
        };
    }
}

async function deleteElevenLabsVoice({ externalVoiceId }) {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return {
                success: false,
                provider: 'elevenlabs',
                error: 'ELEVENLABS_API_KEY not configured'
            };
        }

        const response = await axios.delete(
            `https://api.elevenlabs.io/v1/voices/${externalVoiceId}`,
            {
                headers: {
                    'xi-api-key': apiKey
                },
                timeout: 10000
            }
        );

        return {
            success: true,
            provider: 'elevenlabs',
            message: 'Voice deleted from ElevenLabs'
        };
    } catch (error) {
        // If the voice doesn't exist, that's okay
        if (error.response && error.response.status === 404) {
            return {
                success: true,
                provider: 'elevenlabs',
                message: 'Voice was not found in ElevenLabs (may have already been deleted)'
            };
        }

        console.warn(`Failed to delete voice from ElevenLabs: ${error.message}`);
        return {
            success: false,
            provider: 'elevenlabs',
            error: error.message
        };
    }
}

module.exports = {
    createVoiceClone,
    deleteVoiceClone,
    synthesizeVoiceText,
    synthesizeVoiceTextForProvider,
    getConfiguredCloneProvider
};
