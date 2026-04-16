const voiceLibraryGrid = document.getElementById('voiceLibraryGrid');
const voiceCount = document.getElementById('voiceCount');
const toggleVoiceFormBtn = document.getElementById('toggleVoiceFormBtn');
const cancelVoiceFormBtn = document.getElementById('cancelVoiceFormBtn');
const voiceFormPanel = document.getElementById('voiceFormPanel');
const voiceUploadForm = document.getElementById('voiceUploadForm');
const voiceFormFeedback = document.getElementById('voiceFormFeedback');
const voiceGuidanceText = document.getElementById('voiceGuidanceText');
const providerModeText = document.getElementById('providerModeText');
const localProviderHealthBadge = document.getElementById('localProviderHealthBadge');
const checkLocalHealthBtn = document.getElementById('checkLocalHealthBtn');
const localProviderHealthText = document.getElementById('localProviderHealthText');

let voices = Array.isArray(window.__INITIAL_VOICES__) ? window.__INITIAL_VOICES__ : [];
let refreshTimer = null;

async function fetchVoicesPayload() {
    const primaryResponse = await fetch('/api/voices');
    const primaryData = await primaryResponse.json();

    if (!primaryResponse.ok || !primaryData.success) {
        throw new Error(primaryData.error || 'Failed to refresh voices');
    }

    if (Object.prototype.hasOwnProperty.call(primaryData, 'localProviderHealth')) {
        return primaryData;
    }

    // Guarded fallback for environments where the page origin differs from the app API origin.
    const fallbackResponse = await fetch('http://127.0.0.1:3001/api/voices');
    const fallbackData = await fallbackResponse.json();

    if (!fallbackResponse.ok || !fallbackData.success) {
        throw new Error(fallbackData.error || 'Failed to refresh voices');
    }

    return fallbackData;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setFormFeedback(message, type = 'info') {
    if (!voiceFormFeedback) {
        return;
    }

    voiceFormFeedback.textContent = message || '';
    voiceFormFeedback.className = `form-feedback ${type}`;
}

function toggleVoiceForm(forceVisible) {
    if (!voiceFormPanel) {
        return;
    }

    const shouldShow = typeof forceVisible === 'boolean' ? forceVisible : voiceFormPanel.hidden;
    voiceFormPanel.hidden = !shouldShow;

    if (toggleVoiceFormBtn) {
        toggleVoiceFormBtn.textContent = shouldShow ? 'Hide Form' : 'Add Voice';
    }

    if (shouldShow) {
        document.getElementById('voiceName')?.focus();
    }
}

function getStatusTone(status) {
    if (status === 'ready') {
        return 'ready';
    }

    if (status === 'failed') {
        return 'failed';
    }

    return 'processing';
}

function renderVoices() {
    if (!voiceLibraryGrid) {
        return;
    }

    if (voiceCount) {
        voiceCount.textContent = `${voices.length} voice${voices.length === 1 ? '' : 's'}`;
    }

    if (!voices.length) {
        voiceLibraryGrid.innerHTML = `
            <div class="empty-state">
                <h4>No voices queued yet</h4>
                <p>Add a voice sample to start testing the custom cloning workflow.</p>
            </div>
        `;
        return;
    }

    voiceLibraryGrid.innerHTML = voices.map((voice) => {
        const progressValue = Number.isFinite(voice.progress) ? voice.progress : 0;
        const tone = getStatusTone(voice.status);
        const providerLabelMap = {
            local: 'Local TTS',
            elevenlabs: 'ElevenLabs',
            mock: 'Mock pipeline'
        };
        const modeLabelMap = {
            local: 'Local',
            live: 'Live',
            mock: 'Mock'
        };
        const providerLabel = providerLabelMap[voice.provider] || 'Unknown provider';
        const modeLabel = modeLabelMap[voice.mode] || 'Unknown mode';
        const statusLabel = (voice.status || 'queued').replace(/(^\w)/, (match) => match.toUpperCase());
        const externalId = voice.externalVoiceId ? `<p><strong>Voice ID:</strong> ${escapeHtml(voice.externalVoiceId)}</p>` : '';
        const errorBlock = voice.error ? `<p class="voice-error">${escapeHtml(voice.error)}</p>` : '';
        const verificationNote = voice.requiresVerification ? '<p class="voice-note">Provider verification required before production use.</p>' : '';

        // Handle voice avatar image with green cube fallback
        const imageUrl = voice.imagePath ? `/uploads/voice-images/${escapeHtml(voice.imageFileName)}` : null;
        const avatarHtml = imageUrl 
            ? `<img src="${imageUrl}" alt="${escapeHtml(voice.name)} avatar" class="voice-avatar-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
               <div class="voice-avatar-placeholder" style="display: none;"></div>`
            : `<div class="voice-avatar-placeholder"></div>`;

        return `
            <article class="voice-card ${tone}">
                <div class="voice-card-header">
                    <div class="voice-card-info">
                        <div class="voice-avatar">
                            ${avatarHtml}
                        </div>
                        <div class="voice-details">
                            <h4>${escapeHtml(voice.name)}</h4>
                            <p class="voice-tag">!${escapeHtml(voice.tag)}</p>
                        </div>
                    </div>
                    <span class="voice-status-chip ${tone}">${escapeHtml(statusLabel)}</span>
                </div>
                <p><strong>Upload:</strong> ${escapeHtml(voice.originalFileName || voice.sampleFileName || 'Unknown')}</p>
                <p><strong>Provider:</strong> ${providerLabel} (${modeLabel})</p>
                <div class="voice-progress-row">
                    <div class="voice-progress-track">
                        <span class="voice-progress-fill ${tone}" style="width: ${progressValue}%"></span>
                    </div>
                    <span class="voice-progress-label">${progressValue}%</span>
                </div>
                <div class="voice-card-actions">
                    <button type="button" class="btn btn-secondary voice-action-btn" data-action="edit" data-voice-id="${escapeHtml(voice.id)}">Edit</button>
                    <button type="button" class="btn btn-danger voice-action-btn" data-action="delete" data-voice-id="${escapeHtml(voice.id)}">Delete</button>
                </div>
                ${externalId}
                ${verificationNote}
                ${errorBlock}
            </article>
        `;
    }).join('');
}

async function refreshVoices() {
    try {
        const data = await fetchVoicesPayload();

        voices = data.voices || [];
        renderVoices();

        if (voiceGuidanceText) {
            voiceGuidanceText.textContent = `Recommended: ${data.recommendedFormat.preferred}. ${data.recommendedFormat.details}`;
        }

        if (providerModeText) {
            if (data.activeProvider === 'local') {
                providerModeText.textContent = 'Provider mode: Local TTS service enabled. New uploads will be processed by your localhost voice service.';
            } else if (data.activeProvider === 'elevenlabs') {
                providerModeText.textContent = 'Provider mode: ElevenLabs API key detected. New uploads will attempt live cloning.';
            } else {
                providerModeText.textContent = 'Provider mode: Mock processing. Enable LOCAL_TTS_ENABLED or add ELEVENLABS_API_KEY to switch to a real provider.';
            }
        }

        if (localProviderHealthText) {
            const health = data.localProviderHealth || {
                status: 'unchecked',
                reachable: false,
                baseUrl: '',
                message: ''
            };
            const baseUrlLabel = health.baseUrl ? ` (${health.baseUrl})` : '';

            if (health.status === 'online' || health.reachable === true) {
                if (localProviderHealthBadge) {
                    localProviderHealthBadge.className = 'provider-health-badge online';
                    localProviderHealthBadge.textContent = 'Local TTS: Online';
                }
                localProviderHealthText.className = 'provider-health online';
                localProviderHealthText.textContent = `Local provider health: Online${baseUrlLabel}.`;
            } else if (health.status === 'offline') {
                if (localProviderHealthBadge) {
                    localProviderHealthBadge.className = 'provider-health-badge offline';
                    localProviderHealthBadge.textContent = 'Local TTS: Offline';
                }
                localProviderHealthText.className = 'provider-health offline';
                localProviderHealthText.textContent = `Local provider health: Offline${baseUrlLabel}. ${health.message || ''}`.trim();
            } else {
                if (localProviderHealthBadge) {
                    localProviderHealthBadge.className = 'provider-health-badge unchecked';
                    localProviderHealthBadge.textContent = 'Local TTS: Not Checked';
                }
                localProviderHealthText.className = 'provider-health unchecked';
                localProviderHealthText.textContent = `Local provider health: Not checked${baseUrlLabel}.`;
            }
        }
    } catch (error) {
        setFormFeedback(error.message, 'error');
    }
}

async function handleVoiceSubmit(event) {
    event.preventDefault();
    setFormFeedback('Uploading sample and queueing voice processing...', 'info');

    const submitButton = voiceUploadForm.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }

    try {
        const formData = new FormData(voiceUploadForm);
        const rawTag = String(formData.get('tag') || '').trim();
        formData.set('tag', rawTag.replace(/^!+/, ''));

        const response = await fetch('/api/voices', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to queue voice clone');
        }

        setFormFeedback(`Queued !${data.voice.tag} for processing.`, 'success');
        voiceUploadForm.reset();
        toggleVoiceForm(false);
        
        // Force immediate refresh of voice library
        await refreshVoices();
        
        // Add the new voice to the local array immediately for instant UI update
        voices.unshift(data.voice);
        renderVoices();
        
    } catch (error) {
        setFormFeedback(error.message, 'error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

async function updateVoice(voiceId, payload) {
    const response = await fetch(`/api/voices/${encodeURIComponent(voiceId)}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update voice');
    }

    return data.voice;
}

async function deleteVoice(voiceId) {
    const response = await fetch(`/api/voices/${encodeURIComponent(voiceId)}`, {
        method: 'DELETE'
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete voice');
    }
}

async function handleVoiceLibraryClick(event) {
    const actionButton = event.target.closest('[data-action][data-voice-id]');
    if (!actionButton) {
        return;
    }

    const { action, voiceId } = actionButton.dataset;
    const voice = voices.find((entry) => entry.id === voiceId);
    if (!voice) {
        setFormFeedback('Voice entry not found.', 'error');
        return;
    }

    if (action === 'edit') {
        const nextName = window.prompt('Update voice name', voice.name);
        if (nextName === null) {
            return;
        }

        const nextTag = window.prompt('Update custom !tag', voice.tag);
        if (nextTag === null) {
            return;
        }

        try {
            setFormFeedback(`Saving changes to !${voice.tag}...`, 'info');
            await updateVoice(voice.id, {
                name: nextName,
                tag: nextTag.replace(/^!+/, '')
            });
            setFormFeedback('Voice updated.', 'success');
            await refreshVoices();
        } catch (error) {
            setFormFeedback(error.message, 'error');
        }

        return;
    }

    if (action === 'delete') {
        const confirmed = window.confirm(`Delete voice "${voice.name}" with tag !${voice.tag}? This will also remove the uploaded sample from disk.`);
        if (!confirmed) {
            return;
        }

        try {
            setFormFeedback(`Deleting !${voice.tag}...`, 'info');
            await deleteVoice(voice.id);
            
            // Immediate UI update - remove from local array for instant feedback
            voices = voices.filter(v => v.id !== voice.id);
            renderVoices();
            
            setFormFeedback('Voice deleted.', 'success');
            
            // Server refresh to ensure consistency
            await refreshVoices();
        } catch (error) {
            setFormFeedback(error.message, 'error');
            // Refresh on error to restore consistent state
            await refreshVoices();
        }
    }
}

function startPolling() {
    refreshVoices();
    refreshTimer = window.setInterval(refreshVoices, 3000);
}

function setupEventListeners() {
    toggleVoiceFormBtn?.addEventListener('click', () => toggleVoiceForm());
    cancelVoiceFormBtn?.addEventListener('click', () => {
        voiceUploadForm.reset();
        setFormFeedback('');
        toggleVoiceForm(false);
    });
    checkLocalHealthBtn?.addEventListener('click', async () => {
        const previousLabel = checkLocalHealthBtn.textContent;
        checkLocalHealthBtn.disabled = true;
        checkLocalHealthBtn.textContent = 'Checking...';

        try {
            await refreshVoices();
            setFormFeedback('Local provider health check complete.', 'success');
        } catch (_error) {
            // refreshVoices handles user-facing errors internally.
        } finally {
            checkLocalHealthBtn.disabled = false;
            checkLocalHealthBtn.textContent = previousLabel;
        }
    });
    voiceUploadForm?.addEventListener('submit', handleVoiceSubmit);
    voiceLibraryGrid?.addEventListener('click', handleVoiceLibraryClick);
    
    // Donate button scroll functionality
    const donateBtn = document.getElementById('donateBtn');
    if (donateBtn) {
        donateBtn.addEventListener('click', function() {
            const donationSection = document.getElementById('donationSection');
            if (donationSection) {
                donationSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderVoices();
    setupEventListeners();
    startPolling();
});

window.addEventListener('beforeunload', () => {
    if (refreshTimer) {
        window.clearInterval(refreshTimer);
    }
});
