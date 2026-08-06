// =====================================================================
// GENIUS MALAWI - MSOFI AI INTELLIGENCE INTERACTIVE CONTROLLER
// Location: js/msofi-ai.js
// Purpose: Handles chat execution flow, enforces daily free tier usage caps,
//          evaluates disclaimers, parses PDF attachments, triggers voice capture,
//          and communicates with the secure Supabase Edge Function API.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI, storageAPI, validateFile } from './supabase.js';
import { detectLibraryIntent, searchMebvLibrary, renderLibraryResultsHtml, escapeHtml } from './msofi-gateway.js';

// Navigation monitoring via native API overrides was removed to avoid
// assigning to read-only Location properties in some browsers.
// Use `popstate`/`hashchange` listeners or wrap app navigation functions instead.

// Application state variables
let currentUser = null;
let userProfile = null;
let activeConversationId = null;
let currentDailyUsage = { chat_count: 0, pdf_upload_count: 0, image_gen_count: 0 };
let attachedFileInstance = null;
let pendingLibraryResults = null;
let pendingLibraryQuery = null;
let persistedConversationTurns = [];
let aiConversationSubscription = null;
let conversationHistory = [];
let conversationHistorySearchQuery = '';
let profilePanelState = { mode: 'overview' };
let profilePhotoPreviewUrl = null;
let profilePhotoFile = null;
let messageToolbarSequence = 0;
let suppressAutoScroll = false;
let scrollToBottomButton = null;
let profileSaveInFlight = false;
let profilePhotoUploadInFlight = false;
let sidebarSearchActiveIndex = -1;
const SCROLL_BOTTOM_DISTANCE = 160;
const SCROLL_BUTTON_FADE_DISTANCE = 240;

function logOverlayEvent(action, reason, callingFunction) {
    const timestamp = new Date().toISOString();
    console.log(`[Msofi Overlay] ${action} | Reason: ${reason} | Calling function: ${callingFunction} | Timestamp: ${timestamp}`);
}

function openModalOverlay(reason, callingFunction) {
    const overlay = document.getElementById('msofi-modal-overlay');
    if (!overlay) return null;

    overlay.removeAttribute('hidden');
    overlay.classList.remove('hidden');
    overlay.style.display = '';
    overlay.style.pointerEvents = 'auto';
    overlay.innerHTML = '';
    logOverlayEvent('Overlay opened', reason, callingFunction);
    return overlay;
}

function hideModalOverlay(reason, callingFunction) {
    const overlay = document.getElementById('msofi-modal-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');
    overlay.style.display = '';
    overlay.style.pointerEvents = 'none';
    overlay.setAttribute('hidden', 'hidden');
    overlay.innerHTML = '';
    logOverlayEvent('Overlay hidden', reason, callingFunction);
}

function showAboutMsofiModal() {
    const overlay = openModalOverlay('About Msofi AI', 'showAboutMsofiModal');
    if (!overlay) return;

    overlay.innerHTML = `
        <div class="msofi-modal-card" style="max-width: 640px; width: min(92vw, 640px);">
            <div class="msofi-modal-header">
                <div>
                    <div class="msofi-modal-title">About Msofi AI</div>
                    <div class="msofi-toast-body" style="margin-top:6px;">Msofi AI is a focused, monochrome workspace for secure conversations, document analysis, and practical support for Malawian users.</div>
                </div>
                <button type="button" class="btn-secondary" data-action="close">Close</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px; color:#000;">
                <p style="margin:0; font-size:14px; line-height:1.6;">The experience is designed to stay simple, fast, and dependable while keeping your conversations and uploaded files centered around the current workspace.</p>
                <div style="border:1px solid rgba(0,0,0,0.14); border-radius:10px; padding:12px; background:#ffffff;">
                    <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">What you can do</div>
                    <ul style="margin:0; padding-left:18px; font-size:13px; line-height:1.6;">
                        <li>Ask questions and get guided answers.</li>
                        <li>Use the chat workspace with recent conversations and search.</li>
                        <li>Upload files and work with the current conversation context.</li>
                    </ul>
                </div>
                <div style="display:flex; justify-content:flex-end;">
                    <button type="button" class="btn-primary" data-action="support">Open Help & Support</button>
                </div>
            </div>
        </div>
    `;

    overlay.querySelector('[data-action="close"]').addEventListener('click', () => {
        hideModalOverlay('About modal closed', 'showAboutMsofiModal');
    });
    overlay.querySelector('[data-action="support"]').addEventListener('click', () => {
        window.location.assign('./support.html');
    });
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) hideModalOverlay('About modal closed', 'showAboutMsofiModal');
    });
}

function showProfileStatusModal({ title, body, tone = 'info', confirmLabel = 'Close', onConfirm, showCancel = false, cancelLabel = 'Cancel' }) {
    const overlay = openModalOverlay(`Profile status modal (${title})`, 'showProfileStatusModal');
    if (!overlay) return;

    const icon = tone === 'success' ? '✓' : tone === 'error' ? '!' : tone === 'warning' ? '!' : 'i';
    overlay.innerHTML = `
        <div class="msofi-modal-card">
            <div class="msofi-modal-header">
                <div>
                    <div class="msofi-modal-title">${escapeHtml(title || 'Notice')}</div>
                    <div class="msofi-toast-body" style="margin-top:6px;">${escapeHtml(body || '')}</div>
                </div>
            </div>
            <div class="msofi-modal-actions">
                ${showCancel ? `<button type="button" class="btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>` : ''}
                <button type="button" class="btn-primary" data-action="confirm">${escapeHtml(confirmLabel)}</button>
            </div>
        </div>
    `;

    const confirmBtn = overlay.querySelector('[data-action="confirm"]');
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');

    const close = () => {
        hideModalOverlay('Profile status modal closed', 'showProfileStatusModal');
    };

    confirmBtn?.addEventListener('click', async () => {
        close();
        try {
            await onConfirm?.();
        } catch (err) {
            console.error('Profile status modal confirm handler failed:', err?.message || err);
        }
    });
    cancelBtn?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });

    return overlay;
}

function showFeedback({ title, body, tone = 'info', duration = 2600 }) {
    const layer = document.getElementById('msofi-feedback-layer');
    if (!layer) return;

    const toast = document.createElement('div');
    toast.className = 'msofi-toast';
    toast.dataset.tone = tone;
    toast.innerHTML = `
        <div class="msofi-toast-icon">${tone === 'success' ? '✓' : tone === 'error' ? '!' : tone === 'warning' ? '!' : 'i'}</div>
        <div>
            <div class="msofi-toast-title">${escapeHtml(title || 'Notice')}</div>
            <div class="msofi-toast-body">${escapeHtml(body || '')}</div>
        </div>
    `;
    layer.appendChild(toast);
    window.setTimeout(() => {
        toast.remove();
    }, duration);
}

function normalizeSharedDriveDownloadUrl(url) {
    const normalized = String(url || '').trim();
    if (!normalized) return normalized;

    const driveFileMatch = normalized.match(/^https?:\/\/(?:www\.)?drive\.google\.com\/file\/d\/([^/]+)(?:\/.*)?(?:\?.*)?$/i);
    if (driveFileMatch) {
        return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
    }

    const openIdMatch = normalized.match(/^https?:\/\/(?:www\.)?drive\.google\.com\/open\?id=([^&]+)/i);
    if (openIdMatch) {
        return `https://drive.google.com/uc?export=download&id=${openIdMatch[1]}`;
    }

    try {
        const parsed = new URL(normalized);
        if (/drive\.google\.com$/i.test(parsed.hostname) && parsed.searchParams.has('id')) {
            return `https://drive.google.com/uc?export=download&id=${parsed.searchParams.get('id')}`;
        }
    } catch (err) {
        console.warn('Unable to normalize Google Drive URL:', err?.message || err);
    }

    return normalized;
}

function getFilenameFromUrl(url, fallbackName = '') {
    const trimmed = String(fallbackName || '').trim();
    try {
        const parsed = new URL(url);
        const pathSegment = parsed.pathname.split('/').filter(Boolean).pop() || '';
        if (pathSegment && pathSegment.includes('.')) {
            return decodeURIComponent(pathSegment);
        }

        if (trimmed) {
            const extMatch = url.match(/\.([a-z0-9]{2,6})(?:[\?#]|$)/i);
            return extMatch ? `${trimmed}.${extMatch[1]}` : trimmed;
        }
    } catch (err) {
        console.warn('Unable to derive filename from URL:', err?.message || err);
    }

    return trimmed || 'download';
}

function triggerDirectFileDownload(url, filename) {
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    if (filename) {
        link.download = filename;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showDownloadToast({ title, body, tone = 'info', actionLabel, onAction, duration = 5000 }) {
    const layer = document.getElementById('msofi-feedback-layer');
    if (!layer) return;

    const toast = document.createElement('div');
    toast.className = 'msofi-toast';
    toast.dataset.tone = tone;
    toast.innerHTML = `
        <div class="msofi-toast-icon">${tone === 'success' ? '✓' : tone === 'error' ? '!' : tone === 'warning' ? '!' : 'i'}</div>
        <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
            <div>
                <div class="msofi-toast-title">${escapeHtml(title || 'Notice')}</div>
                <div class="msofi-toast-body">${escapeHtml(body || '')}</div>
            </div>
            ${actionLabel ? `<button type="button" class="msofi-download-retry-btn" style="border:1px solid #000; background:#000; color:#fff; padding:8px 10px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; width:fit-content;">${escapeHtml(actionLabel)}</button>` : ''}
        </div>
    `;

    layer.appendChild(toast);

    if (actionLabel) {
        const button = toast.querySelector('.msofi-download-retry-btn');
        button?.addEventListener('click', () => {
            toast.remove();
            onAction?.();
        });
    }

    if (!actionLabel && duration > 0) {
        window.setTimeout(() => toast.remove(), duration);
    }
}

async function handleBookDownload(url, suggestedName = '') {
    if (!url) {
        showFeedback({ title: 'Download unavailable', body: 'No valid download URL was provided.', tone: 'error' });
        return;
    }

    const normalizedUrl = normalizeSharedDriveDownloadUrl(url);
    const filename = getFilenameFromUrl(normalizedUrl, suggestedName);

    try {
        triggerDirectFileDownload(normalizedUrl, filename);
        showFeedback({ title: 'Download started...', body: 'Your download will begin automatically.', tone: 'success' });
    } catch (err) {
        console.warn('Msofi AI download failed:', err?.message || err);
        showDownloadToast({
            title: 'Your browser blocked the automatic download.',
            body: 'Click Retry Download to try again.',
            tone: 'warning',
            actionLabel: 'Retry Download',
            onAction: () => handleBookDownload(url, suggestedName),
            duration: 10000
        });
    }
}

function buildProfilePayload(payload = {}, existingProfile = userProfile || {}, authUser = currentUser) {
    const fallbackProfile = {
        full_name: existingProfile?.full_name || authUser?.user_metadata?.full_name || authUser?.email || '',
        username: existingProfile?.username || authUser?.user_metadata?.username || '',
        email: existingProfile?.email || authUser?.email || null,
        phone: existingProfile?.phone || null,
        bio: existingProfile?.bio || null,
        district: existingProfile?.district || null,
        occupation: existingProfile?.occupation || null,
        education: existingProfile?.education || null,
        profile_photo: existingProfile?.profile_photo || authUser?.user_metadata?.profile_photo || null
    };

    const nextPayload = {};

    const trackedFields = ['full_name', 'username', 'email', 'phone', 'bio', 'district', 'occupation', 'education', 'profile_photo'];
    for (const field of trackedFields) {
        const incomingValue = payload?.[field];
        if (incomingValue === undefined) continue;

        if (incomingValue === null) {
            if (field === 'profile_photo') {
                nextPayload[field] = null;
            } else if (['email', 'phone', 'bio', 'district', 'occupation', 'education'].includes(field)) {
                nextPayload[field] = null;
            }
            continue;
        }

        const normalizedValue = typeof incomingValue === 'string' ? incomingValue.trim() : incomingValue;
        const compareValue = normalizedValue === '' ? null : normalizedValue;
        if (compareValue !== (fallbackProfile[field] ?? null)) {
            nextPayload[field] = compareValue;
        }
    }

    if (payload?.updated_at !== undefined) {
        nextPayload.updated_at = payload.updated_at;
    }

    const finalPayload = {
        full_name: nextPayload.full_name ?? fallbackProfile.full_name ?? '',
        username: nextPayload.username ?? fallbackProfile.username ?? '',
        email: nextPayload.email ?? fallbackProfile.email ?? null,
        phone: nextPayload.phone ?? fallbackProfile.phone ?? null,
        bio: nextPayload.bio ?? fallbackProfile.bio ?? null,
        district: nextPayload.district ?? fallbackProfile.district ?? null,
        occupation: nextPayload.occupation ?? fallbackProfile.occupation ?? null,
        education: nextPayload.education ?? fallbackProfile.education ?? null,
        profile_photo: nextPayload.profile_photo ?? fallbackProfile.profile_photo ?? null,
        updated_at: nextPayload.updated_at || new Date().toISOString()
    };

    return finalPayload;
}

async function upsertProfileRecord(payload, userId = currentUser?.id) {
    if (!userId) throw new Error('You must be signed in to save your profile.');

    const existingProfileResponse = await supabase
        .from('profiles')
        .select('id, role, full_name, username, bio, district, occupation, education, profile_photo, email, phone')
        .eq('id', userId)
        .maybeSingle();

    const existingProfile = existingProfileResponse.error && existingProfileResponse.error.code !== 'PGRST116'
        ? null
        : existingProfileResponse.data || null;

    const safePayload = buildProfilePayload(payload, existingProfile || userProfile || {}, currentUser);

    const { data, error } = await supabase
        .from('profiles')
        .upsert([{ id: userId, ...safePayload }], { onConflict: 'id', ignoreDuplicates: false })
        .select('id, role, full_name, username, bio, district, occupation, education, profile_photo, email, phone')
        .single();

    if (error) throw error;
    return data;
}

async function safeBootstrap(moduleName, initFn) {
    console.log('START:', moduleName);
    try {
        await initFn();
        console.log('SUCCESS:', moduleName);
    } catch (err) {
        console.error('FAILED:', moduleName, err);
        console.error(`Failed to initialize ${moduleName}:`, err?.message || err);
    }
}

function showConfirmation({ title, body, confirmLabel = 'Confirm', onConfirm }) {
    const overlay = openModalOverlay('Confirmation dialog requested', 'showConfirmation');
    if (!overlay) return;

    overlay.innerHTML = `
        <div class="msofi-modal-card">
            <div class="msofi-modal-header">
                <div>
                    <div class="msofi-modal-title">${escapeHtml(title || 'Confirm action')}</div>
                    <div class="msofi-toast-body" style="margin-top:6px;">${escapeHtml(body || '')}</div>
                </div>
            </div>
            <div class="msofi-modal-actions">
                <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
                <button type="button" class="btn-primary" data-action="confirm">${escapeHtml(confirmLabel)}</button>
            </div>
        </div>
    `;

    const confirmBtn = overlay.querySelector('[data-action="confirm"]');
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');

    const close = () => {
        hideModalOverlay('Confirmation dialog closed', 'showConfirmation');
    };

    confirmBtn?.addEventListener('click', async () => {
        close();
        try {
            await onConfirm?.();
        } catch (err) {
            console.error('Confirmation callback failed:', err?.message || err);
            showFeedback({ title: 'Action failed', body: err?.message || 'Please try again.', tone: 'error' });
        }
    });
    cancelBtn?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
}

function openProfileModal(mode = 'overview') {
    const overlay = openModalOverlay(`Profile modal requested (${mode})`, 'openProfileModal');
    if (!overlay) return;

    const profilePhoto = userProfile?.profile_photo || currentUser?.user_metadata?.profile_photo;
    const fullName = userProfile?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email || 'Msofi User';
    const username = userProfile?.username || '';
    const bio = userProfile?.bio || '';
    const district = userProfile?.district || '';
    const occupation = userProfile?.occupation || '';
    const education = userProfile?.education || '';
    const phone = userProfile?.phone || '';
    const email = currentUser?.email || userProfile?.email || '';

    overlay.innerHTML = `
        <div class="msofi-modal-card">
            <div class="msofi-modal-header">
                <div>
                    <div class="msofi-modal-title">Profile</div>
                    <div class="msofi-toast-body" style="margin-top:6px;">Manage your account details and profile picture.</div>
                </div>
                <button type="button" class="btn-secondary" data-action="close-modal">Close</button>
            </div>
            <div class="msofi-account-card" style="margin-bottom:12px;">
                <div class="msofi-account-actions-inline" style="margin-bottom:10px; align-items:center;">
                    <img class="msofi-account-photo-preview" src="${profilePhoto || '../assets/Icon.png?v=2'}" alt="Profile preview">
                    <div style="flex:1; min-width:140px;">
                        <p><strong>${escapeHtml(fullName)}</strong></p>
                        <p>${escapeHtml(username ? `@${username}` : '')}</p>
                        <p>${escapeHtml(bio || 'Share a short bio to personalize your account.')}</p>
                    </div>
                </div>
                <div class="msofi-account-actions-inline">
                    <button type="button" class="btn-primary" data-action="upload-photo-modal">Upload Photo</button>
                    <button type="button" class="btn-secondary" data-action="remove-photo-modal">Remove Photo</button>
                </div>
            </div>
            <div class="msofi-account-card">
                <h4>Account Details</h4>
                <form class="msofi-account-form" id="msofi-profile-modal-form">
                    <label>Full name<input id="msofi-profile-modal-fullname" value="${escapeHtml(fullName)}" required></label>
                    <label>Username<input id="msofi-profile-modal-username" value="${escapeHtml(username)}" required></label>
                    <label>Email<input id="msofi-profile-modal-email" value="${escapeHtml(email)}" type="email"></label>
                    <label>Phone<input id="msofi-profile-modal-phone" value="${escapeHtml(phone)}" inputmode="tel"></label>
                    <label>Bio<textarea id="msofi-profile-modal-bio">${escapeHtml(bio)}</textarea></label>
                    <label>District<input id="msofi-profile-modal-district" value="${escapeHtml(district)}"></label>
                    <label>Occupation<input id="msofi-profile-modal-occupation" value="${escapeHtml(occupation)}"></label>
                    <label>Education<input id="msofi-profile-modal-education" value="${escapeHtml(education)}"></label>
                    <div class="msofi-account-actions-inline">
                        <button type="submit" class="btn-primary" data-action="save-profile">Save Changes</button>
                        <button type="button" class="btn-secondary" data-action="close-modal">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const setBusyState = (busy) => {
        const form = document.getElementById('msofi-profile-modal-form');
        const saveButton = form?.querySelector('[data-action="save-profile"]');
        const uploadButton = overlay.querySelector('[data-action="upload-photo-modal"]');
        const removeButton = overlay.querySelector('[data-action="remove-photo-modal"]');
        if (saveButton) {
            saveButton.disabled = busy;
            saveButton.textContent = busy ? 'Saving…' : 'Save Changes';
        }
        if (uploadButton) uploadButton.disabled = busy || profilePhotoUploadInFlight;
        if (removeButton) removeButton.disabled = busy || profilePhotoUploadInFlight;
    };

    overlay.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => {
        hideModalOverlay('Profile modal closed by user', 'openProfileModal');
    });

    const fileInput = document.getElementById('msofi-profile-photo-uploader');
    if (fileInput) {
        fileInput.onchange = async (event) => {
            const [file] = event.target.files || [];
            if (!file) return;
            if (profilePhotoUploadInFlight || profileSaveInFlight) return;

            try {
                const validation = validateFile(file, 'avatar');
                if (!validation.valid) {
                    showProfileStatusModal({ title: 'Photo upload failed', body: validation.error || 'Please choose a different image.', tone: 'error' });
                    return;
                }

                profilePhotoUploadInFlight = true;
                setBusyState(true);
                const uploadedUrl = await storageAPI.uploadFile(file, 'avatars', 'avatar');

                const previousPhotoUrl = userProfile?.profile_photo || '';
                const previousPhotoMatch = previousPhotoUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
                if (previousPhotoMatch?.[1] && previousPhotoMatch?.[2]) {
                    try {
                        await supabase.storage.from(previousPhotoMatch[1]).remove([decodeURIComponent(previousPhotoMatch[2])]);
                    } catch (err) {
                        console.warn('Unable to remove previous profile photo:', err?.message || err);
                    }
                }

                const nextProfile = {
                    ...(userProfile || {}),
                    profile_photo: uploadedUrl,
                    updated_at: new Date().toISOString()
                };
                userProfile = nextProfile;
                currentUser = currentUser ? { ...currentUser, user_metadata: { ...(currentUser.user_metadata || {}), profile_photo: uploadedUrl } } : currentUser;
                await upsertProfileRecord({ profile_photo: uploadedUrl, updated_at: new Date().toISOString() }, currentUser?.id);
                await loadUserProfile();
                refreshProfileUI();
                hideModalOverlay('Profile photo updated', 'openProfileModal');
                showProfileStatusModal({ title: 'Photo updated', body: 'Your profile picture is now live across Msofi AI.', tone: 'success' });
            } catch (err) {
                showProfileStatusModal({ title: 'Photo upload failed', body: err?.message || 'Please try again.', tone: 'error' });
            } finally {
                profilePhotoUploadInFlight = false;
                setBusyState(false);
                event.target.value = '';
            }
        };
    }

    overlay.querySelector('[data-action="upload-photo-modal"]')?.addEventListener('click', () => {
        fileInput?.click();
    });

    overlay.querySelector('[data-action="remove-photo-modal"]')?.addEventListener('click', async () => {
        if (profilePhotoUploadInFlight || profileSaveInFlight) return;
        try {
            profileSaveInFlight = true;
            setBusyState(true);
            const userId = currentUser?.id;
            if (!userId) throw new Error('You must be signed in to remove your photo.');

            await upsertProfileRecord({ profile_photo: null, updated_at: new Date().toISOString() }, userId);
            userProfile = { ...(userProfile || {}), profile_photo: null, updated_at: new Date().toISOString() };
            currentUser = currentUser ? { ...currentUser, user_metadata: { ...(currentUser.user_metadata || {}), profile_photo: null } } : currentUser;
            await loadUserProfile();
            refreshProfileUI();
            hideModalOverlay('Profile photo removed', 'openProfileModal');
            showProfileStatusModal({ title: 'Photo removed', body: 'Your profile picture has been removed.', tone: 'success' });
        } catch (err) {
            showProfileStatusModal({ title: 'Unable to remove photo', body: err.message || 'Please try again.', tone: 'error' });
        } finally {
            profileSaveInFlight = false;
            setBusyState(false);
        }
    });

    const form = document.getElementById('msofi-profile-modal-form');
    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (profileSaveInFlight || profilePhotoUploadInFlight) return;

        const nextFullName = document.getElementById('msofi-profile-modal-fullname').value.trim();
        const nextUsername = document.getElementById('msofi-profile-modal-username').value.trim();
        const nextEmail = document.getElementById('msofi-profile-modal-email').value.trim();
        const nextPhone = document.getElementById('msofi-profile-modal-phone').value.trim();
        const nextBio = document.getElementById('msofi-profile-modal-bio').value.trim();
        const nextDistrict = document.getElementById('msofi-profile-modal-district').value.trim();
        const nextOccupation = document.getElementById('msofi-profile-modal-occupation').value.trim();
        const nextEducation = document.getElementById('msofi-profile-modal-education').value.trim();

        if (!nextFullName || !nextUsername) {
            showProfileStatusModal({ title: 'Profile update required', body: 'Full name and username are required.', tone: 'warning' });
            return;
        }

        if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
            showProfileStatusModal({ title: 'Email invalid', body: 'Please enter a valid email address before saving.', tone: 'warning' });
            return;
        }

        try {
            profileSaveInFlight = true;
            setBusyState(true);
            if (nextEmail && nextEmail !== (userProfile?.email || currentUser?.email || '')) {
                const { error: authError } = await supabase.auth.updateUser({ email: nextEmail });
                if (authError) throw authError;
            }

            const payload = {
                full_name: nextFullName,
                username: nextUsername,
                email: nextEmail || (userProfile?.email || currentUser?.email || null),
                phone: nextPhone || null,
                bio: nextBio || null,
                district: nextDistrict || null,
                occupation: nextOccupation || null,
                education: nextEducation || null,
                updated_at: new Date().toISOString()
            };

            const updatedProfile = await upsertProfileRecord(payload, currentUser?.id);

            const nextUserProfile = {
                ...(userProfile || {}),
                ...updatedProfile,
                profile_photo: updatedProfile?.profile_photo || userProfile?.profile_photo || null,
                phone: updatedProfile?.phone || userProfile?.phone || null
            };
            userProfile = nextUserProfile;
            currentUser = currentUser ? { ...currentUser, email: nextEmail || currentUser.email, user_metadata: { ...(currentUser.user_metadata || {}), full_name: nextFullName, username: nextUsername, profile_photo: nextUserProfile.profile_photo || currentUser.user_metadata?.profile_photo } } : currentUser;
            await loadUserProfile();
            refreshProfileUI();
            hideModalOverlay('Profile updated successfully', 'openProfileModal');
            showProfileStatusModal({ title: 'Profile saved', body: 'Your account details are now updated everywhere in Msofi AI.', tone: 'success' });
        } catch (err) {
            showProfileStatusModal({ title: 'Unable to save changes', body: err.message || 'Please try again.', tone: 'error', showCancel: true, cancelLabel: 'Dismiss', onConfirm: () => { openProfileModal('overview'); } });
        } finally {
            profileSaveInFlight = false;
            setBusyState(false);
        }
    });
}

function createConversationId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createConversationRecord(id, title = 'New Conversation', createdAt = new Date().toISOString()) {
    return {
        id,
        title,
        updated_at: createdAt,
        pinned: false,
        messages: []
    };
}

function parseConversationMetadata(modelValue) {
    if (!modelValue) return {};

    if (typeof modelValue === 'object') return modelValue;

    if (typeof modelValue === 'string') {
        const trimmed = modelValue.trim();
        if (!trimmed) return {};
        try {
            return JSON.parse(trimmed);
        } catch (err) {
            return {};
        }
    }

    return {};
}

function buildConversationMetadata(conversationId, title, pinned, updatedAt) {
    return JSON.stringify({
        conversation_id: conversationId,
        conversation_title: title,
        pinned: Boolean(pinned),
        updated_at: updatedAt
    });
}

function isMeaningfulPrompt(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';

    return raw
        .replace(/^(hi|hello|hey|thanks|thank you|please|can you|could you|would you|help me|i need)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function generateConversationTitle(prompt) {
    const meaningfulPrompt = isMeaningfulPrompt(prompt);
    if (!meaningfulPrompt) return 'New Conversation';

    const words = meaningfulPrompt
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter((word) => !/^(a|an|the|and|or|but|for|to|of|in|on|with|my|our|your|is|are|can|could|would|should|please|help|tell|show|give|need|want|use|from|about|into|this|that|these|those|i|we|you|it|be|do|does|did|what|when|where|why|how|who|which|hi|hello|hey)$/i.test(word))
        .slice(0, 12);

    if (!words.length) return 'New Conversation';

    const targetWords = Math.min(8, Math.max(4, words.length));
    const titleWords = words.slice(0, targetWords);
    return titleWords.join(' ');
}

function formatConversationTimestamp(value) {
    if (!value) return 'Just now';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function getConversationById(conversationId) {
    return conversationHistory.find((conversation) => conversation.id === conversationId) || null;
}

function ensureActiveConversation() {
    if (activeConversationId && getConversationById(activeConversationId)) {
        return getConversationById(activeConversationId);
    }

    const fallback = createConversationRecord(createConversationId(), 'New Conversation');
    conversationHistory = [fallback, ...conversationHistory.filter((conversation) => conversation.id !== fallback.id)];
    activeConversationId = fallback.id;
    return fallback;
}

function setActiveConversation(conversationId) {
    const conversation = getConversationById(conversationId);
    if (!conversation) return;

    activeConversationId = conversation.id;
    persistedConversationTurns = (conversation.messages || []).map((entry) => ({ ...entry }));
    renderPersistedConversationHistory();
    renderConversationHistoryList();
}

function updateConversationTitle(conversationId, title) {
    const conversation = getConversationById(conversationId);
    if (!conversation) return;

    conversation.title = title || 'New Conversation';
    conversation.updated_at = conversation.updated_at || new Date().toISOString();
    renderConversationHistoryList();
}

function addMessageToConversation(conversationId, prompt, response, rowId, createdAt) {
    const conversation = getConversationById(conversationId) || createConversationRecord(conversationId, 'New Conversation', createdAt || new Date().toISOString());
    if (!conversationHistory.some((entry) => entry.id === conversationId)) {
        conversationHistory = [conversation, ...conversationHistory];
    }

    const message = {
        id: rowId || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: String(prompt || '').trim(),
        response: String(response || '').trim(),
        created_at: createdAt || new Date().toISOString()
    };

    const existingMessage = conversation.messages.find((entry) => entry.id === message.id);
    if (!existingMessage) {
        conversation.messages.push(message);
    }

    conversation.updated_at = message.created_at;
    if (!conversation.title || conversation.title === 'New Conversation') {
        const inferredTitle = generateConversationTitle(message.prompt);
        conversation.title = inferredTitle;
    }

    if (activeConversationId === conversationId) {
        persistedConversationTurns = conversation.messages.map((entry) => ({ ...entry }));
        renderPersistedConversationHistory();
    }

    renderConversationHistoryList();
}

function getFilteredConversationList() {
    return conversationHistory
        .filter((conversation) => !conversation.pinned && !conversation.deleted)
        .filter((conversation) => {
            const query = (conversationHistorySearchQuery || '').trim().toLowerCase();
            if (!query) return true;
            return `${conversation.title || ''} ${conversation.messages?.map((entry) => `${entry.prompt || ''} ${entry.response || ''}`).join(' ')}`.toLowerCase().includes(query);
        })
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

function getFilteredPinnedConversationList() {
    return conversationHistory
        .filter((conversation) => conversation.pinned && !conversation.deleted)
        .filter((conversation) => {
            const query = (conversationHistorySearchQuery || '').trim().toLowerCase();
            if (!query) return true;
            return `${conversation.title || ''} ${conversation.messages?.map((entry) => `${entry.prompt || ''} ${entry.response || ''}`).join(' ')}`.toLowerCase().includes(query);
        })
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

function renderConversationHistoryList() {
    const list = document.getElementById('chat-history-list');
    const section = document.getElementById('conversation-history-section');
    const count = document.getElementById('conversation-history-count');

    if (!list || !section) return;

    const visibleConversations = getFilteredConversationList();
    const pinnedConversations = getFilteredPinnedConversationList();

    const orderedConversations = [...pinnedConversations, ...visibleConversations];
    const isAuthenticated = Boolean(currentUser?.id);
    section.hidden = false;

    if (count) {
        count.textContent = String(conversationHistory.filter((conversation) => !conversation.deleted).length);
    }

    if (!orderedConversations.length) {
        list.innerHTML = isAuthenticated
            ? '<p class="conversation-history-empty">No previous chat history found.</p>'
            : '<p class="conversation-history-empty">Sign in to save this workspace history across devices.</p>';
        return;
    }

    list.innerHTML = orderedConversations.map((conversation) => {
        const isActive = activeConversationId === conversation.id;
        const title = escapeHtml(conversation.title || 'New Conversation');

        return `
            <button type="button" class="conversation-history-title-only ${isActive ? 'active' : ''}" data-action="open" data-conversation-id="${conversation.id}">
                ${title}
            </button>
        `;
    }).join('');

    list.querySelectorAll('[data-action="open"]').forEach((button) => {
        button.addEventListener('click', () => {
            const conversationId = button.getAttribute('data-conversation-id');
            const conversation = getConversationById(conversationId);
            if (!conversation) return;
            setActiveConversation(conversationId);
        });
    });
}

async function persistConversationMetadata(conversationId, title, pinned = false, deleted = false) {
    if (!currentUser?.id || !conversationId) return;

    const conversation = getConversationById(conversationId);
    if (!conversation) return;

    const updatedAt = new Date().toISOString();
    conversation.updated_at = updatedAt;

    const metadata = buildConversationMetadata(conversationId, title || 'New Conversation', pinned, updatedAt);
    const messageIds = (conversation.messages || []).map((entry) => entry.id).filter(Boolean);

    if (!messageIds.length) return;

    try {
        const { error } = await supabase
            .from('ai_chat_history')
            .update({ model: metadata })
            .in('id', messageIds);

        if (error) throw error;
    } catch (err) {
        console.warn('Unable to update conversation metadata:', err?.message || err);
    }
}

async function deleteCurrentConversation() {
    const conversation = getConversationById(activeConversationId);
    if (!conversation) return;

    const conversationId = conversation.id;
    const remainingConversations = conversationHistory.filter((entry) => entry.id !== conversationId && !entry.deleted);

    conversation.deleted = true;
    conversation.updated_at = new Date().toISOString();

    if (currentUser?.id) {
        try {
            const messageIds = (conversation.messages || []).map((entry) => entry.id).filter(Boolean);
            if (messageIds.length) {
                await supabase.from('ai_chat_history').delete().in('id', messageIds);
            }
        } catch (err) {
            console.warn('Unable to delete persisted conversation rows:', err?.message || err);
        }
    }

    conversationHistory = conversationHistory.filter((entry) => entry.id !== conversationId);

    if (remainingConversations.length) {
        const nextConversation = [...remainingConversations].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
        activeConversationId = nextConversation?.id || null;
        persistedConversationTurns = (nextConversation?.messages || []).map((entry) => ({ ...entry }));
        renderPersistedConversationHistory();
    } else {
        activeConversationId = null;
        persistedConversationTurns = [];
        showConversationWelcomeCard();
    }

    renderConversationHistoryList();
    renderPersistedConversationHistory();
    showFeedback({ title: 'Conversation deleted', body: 'The selected chat was removed from your workspace.', tone: 'success' });
}

async function getAuthenticatedUserId() {
    if (currentUser?.id) return currentUser.id;

    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (user?.id) {
            currentUser = currentUser ? { ...currentUser, id: user.id } : { id: user.id };
            return user.id;
        }
    } catch (err) {
        console.warn('Unable to resolve authenticated user id for ai_usage write:', err?.message || err);
    }

    return null;
}

function setupAuthStateListener() {
    if (typeof supabase?.auth?.onAuthStateChange !== 'function') return;

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            conversationHistory = [];
            activeConversationId = null;
            persistedConversationTurns = [];
            showConversationWelcomeCard();
            renderConversationHistoryList();
            return;
        }

        if (session?.user) {
            currentUser = session.user;
            await loadUserProfile();
            await fetchOrInitDailyUsage();
            renderLimitTracker();
            await loadPersistedConversationHistory();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    hideModalOverlay('Startup begin', 'DOMContentLoaded');

    try {
        console.log('START:', 'loadUserProfile');
        const session = await authAPI.checkSession(false);
        currentUser = session?.user || null;
        console.log('SUCCESS:', 'loadUserProfile');
    } catch (err) {
        console.error('FAILED:', 'loadUserProfile', err);
        console.warn('Msofi AI session check failed:', err?.message || err);
        currentUser = null;
    }

    try {
        console.log('START:', 'loadUserProfile');
        await loadUserProfile();
        console.log('SUCCESS:', 'loadUserProfile');
    } catch (err) {
        console.error('FAILED:', 'loadUserProfile', err);
        console.warn('Profile bootstrap warning:', err?.message || err);
        userProfile = {
            role: null,
            full_name: currentUser?.user_metadata?.full_name || currentUser?.email || 'Msofi Guest',
            username: currentUser?.user_metadata?.username || '',
            bio: '',
            district: '',
            occupation: '',
            education: '',
            email: currentUser?.email || ''
        };
    }

    try {
        console.log('START:', 'fetchOrInitDailyUsage');
        await fetchOrInitDailyUsage();
        console.log('SUCCESS:', 'fetchOrInitDailyUsage');
    } catch (err) {
        console.error('FAILED:', 'fetchOrInitDailyUsage', err);
        console.warn('Usage bootstrap warning:', err?.message || err);
        currentDailyUsage = { chat_count: 0, pdf_upload_count: 0, image_gen_count: 0 };
    }

    console.log('START:', 'renderLimitTracker');
    renderLimitTracker();
    console.log('SUCCESS:', 'renderLimitTracker');

    try {
        console.log('START:', 'setupSidebarNavigation');
        setupSidebarNavigation();
        console.log('SUCCESS:', 'setupSidebarNavigation');
    } catch (err) {
        console.error('FAILED:', 'setupSidebarNavigation', err);
    }

    try {
        console.log('START:', 'setupAccountMenu');
        setupAccountMenu();
        console.log('SUCCESS:', 'setupAccountMenu');
    } catch (err) {
        console.error('FAILED:', 'setupAccountMenu', err);
    }

    try {
        console.log('START:', 'setupConversationHistorySearch');
        setupConversationHistorySearch();
        console.log('SUCCESS:', 'setupConversationHistorySearch');
    } catch (err) {
        console.error('FAILED:', 'setupConversationHistorySearch', err);
    }

    try {
        console.log('START:', 'setupMessageViewportAutoScroll');
        setupMessageViewportAutoScroll();
        console.log('SUCCESS:', 'setupMessageViewportAutoScroll');
    } catch (err) {
        console.error('FAILED:', 'setupMessageViewportAutoScroll', err);
    }

    try {
        console.log('START:', 'setupMessagingSubmission');
        setupMessagingSubmission();
        console.log('SUCCESS:', 'setupMessagingSubmission');
    } catch (err) {
        console.error('FAILED:', 'setupMessagingSubmission', err);
    }

    window.addEventListener('focus', () => {
        scrollViewportToBottom(true);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            scrollViewportToBottom(true);
        }
    });

    try {
        console.log('START:', 'loadPersistedConversationHistory');
        await loadPersistedConversationHistory();
        console.log('SUCCESS:', 'loadPersistedConversationHistory');
        window.requestAnimationFrame(() => scrollViewportToBottom(true));
    } catch (err) {
        console.error('FAILED:', 'loadPersistedConversationHistory', err);
        console.warn('Conversation bootstrap warning:', err?.message || err);
        conversationHistory = [];
        activeConversationId = null;
        persistedConversationTurns = [];
        showConversationWelcomeCard();
        renderConversationHistoryList();
    }

    await safeBootstrap('auth state listener', async () => {
        setupAuthStateListener();
    });

    await safeBootstrap('mode switcher', async () => {
        setupModeSwitcher();
    });

    await safeBootstrap('topbar controls', async () => {
        setupTopbarControls();
    });

    await safeBootstrap('chat lifecycle', async () => {
        setupChatLifecycle();
    });

    await safeBootstrap('sidebar navigation', async () => {
        setupSidebarNavigation();
    });

    await safeBootstrap('account menu', async () => {
        setupAccountMenu();
    });

    await safeBootstrap('attachment flow', async () => {
        setupAttachmentFlow();
    });

    await safeBootstrap('voice input', async () => {
        setupVoiceInput();
    });

    await safeBootstrap('message submission', async () => {
        setupMessagingSubmission();
    });

    await safeBootstrap('conversation search', async () => {
        setupConversationHistorySearch();
    });

    hideModalOverlay('Initialization complete', 'DOMContentLoaded');
    dismissSplashLoader();
});

// ==========================================
// 1. SPLASH LOADER TRANSITION
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('ai-splash');
    if (!splash) return;

    splash.classList.add('hidden');
    splash.setAttribute('aria-hidden', 'true');
    splash.style.display = 'none';
    splash.style.visibility = 'hidden';
    splash.style.pointerEvents = 'none';
    splash.style.opacity = '0';
}

// ==========================================
// 2. PROFILE & RESOURCE LIMIT INGESTION
// ==========================================
async function loadUserProfile() {
    try {
        if (!currentUser?.id) {
            userProfile = {
                role: null,
                full_name: currentUser?.user_metadata?.full_name || 'Msofi Guest',
                username: currentUser?.user_metadata?.username || '',
                bio: '',
                district: '',
                occupation: '',
                education: '',
                email: currentUser?.email || ''
            };
        } else {
            const { data, error } = await supabase
                .from('profiles')
                .select('role, full_name, username, bio, district, occupation, education, profile_photo, email, phone')
                .eq('id', currentUser.id)
                .maybeSingle();

            if (error) throw error;
            userProfile = data || {};

            if (!userProfile?.full_name && currentUser?.user_metadata?.full_name) {
                userProfile.full_name = currentUser.user_metadata.full_name;
            }
            if (!userProfile?.email && currentUser?.email) {
                userProfile.email = currentUser.email;
            }
        }

        const badgeContainer = document.getElementById('user-badge-container');
        if (badgeContainer) {
            const isPremium = ['premium_user', 'super_admin'].includes(userProfile?.role);
            badgeContainer.innerHTML = isPremium 
                ? `<span class="badge badge-premium">PREMIUM PASS</span>` 
                : `<span class="badge badge-verified" style="color:#333333; border-color:rgba(0,0,0,0.12);">FREE TIER</span>`;
        }
        refreshProfileUI();
    } catch (err) {
        console.warn('Profile load warning:', err?.message || err);
        userProfile = {
            role: null,
            full_name: currentUser?.user_metadata?.full_name || currentUser?.email || 'Msofi Guest',
            username: currentUser?.user_metadata?.username || '',
            bio: '',
            district: '',
            occupation: '',
            education: '',
            email: currentUser?.email || ''
        };
        const badgeContainer = document.getElementById('user-badge-container');
        if (badgeContainer) {
            badgeContainer.innerHTML = `<span class="badge badge-verified" style="color:#333333; border-color:rgba(0,0,0,0.12);">FREE TIER</span>`;
        }
        refreshProfileUI();
    }
}

async function fetchOrInitDailyUsage() {
    const today = new Date().toISOString().split('T')[0];
    const userId = await getAuthenticatedUserId();

    if (!userId) {
        currentDailyUsage = { chat_count: 0, pdf_upload_count: 0, image_gen_count: 0 };
        return;
    }

    try {
        // Query daily log record safely
        const { data, error } = await supabase
            .from('ai_usage')
            .select('chat_count, pdf_upload_count, image_gen_count')
            .eq('user_id', userId)
            .eq('request_date', today)
            .maybeSingle();

        if (error) {
            console.warn("ai_usage lookup warning:", error.message);
        }

        if (data) {
            currentDailyUsage = data;
        } else {
            // Register standard ledger entry for today if absent
            const { data: inserted, error: insertErr } = await supabase
                .from('ai_usage')
                .insert({
                    user_id: userId,
                    request_date: today,
                    chat_count: 0,
                    pdf_upload_count: 0,
                    image_gen_count: 0
                })
                .select('chat_count, pdf_upload_count, image_gen_count')
                .single();

            if (insertErr) throw insertErr;
            currentDailyUsage = inserted;
        }
    } catch (err) {
        console.error('Failed to initialize local usage ledger:', err.message);
        // Fallback gracefully to prevent UI thread lockups
        currentDailyUsage = { chat_count: 0, pdf_upload_count: 0, image_gen_count: 0 };
    }
}

function renderLimitTracker() {
    const tracker = document.getElementById('ai-limit-tracker');
    if (!tracker) return;

    const isPremium = ['premium_user', 'super_admin'].includes(userProfile?.role);
    if (isPremium) {
        tracker.textContent = 'Msofi AI Mode: Unlimited Access Enabled';
        tracker.style.display = 'block';
    } else {
        const pdfLeft = Math.max(0, 1 - currentDailyUsage.pdf_upload_count);
        const imgLeft = Math.max(0, 2 - currentDailyUsage.image_gen_count);
        tracker.innerHTML = `Daily Limits left: Document Analysis: <strong>${pdfLeft}/1</strong> | Images: <strong>${imgLeft}/2</strong>`;
        tracker.style.display = 'block';
    }
}

function showConversationWelcomeCard() {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport) return;

    viewport.innerHTML = `
        <div id="welcome-message-card" style="max-width: 650px; margin: 40px auto 0; text-align: center; animation: fadeIn 0.6s ease;">
            <img src="../assets/Icon.png?v=2" alt="Msofi AI Icon" style="width: 80px; height: 80px; margin: 0 auto 16px;">
            <h2 style="font-size: 28px; margin-bottom: 12px; color: #000000;">Meet Msofi AI</h2>
            <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px;">
                Msofi is your specialized super intelligence trained to deliver premium academic, business, and operational insights. Explore various utility modes tailored to assist you.
            </p>
        </div>
    `;
}

function renderPersistedConversationHistory() {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport) return;

    if (!persistedConversationTurns.length) {
        if (!document.getElementById('welcome-message-card')) {
            showConversationWelcomeCard();
        }
        return;
    }

    viewport.innerHTML = '';
    persistedConversationTurns.forEach((turn) => {
        appendMessageBubble('user', turn.prompt);
        appendMessageBubble('msofi', turn.response);
    });
    window.requestAnimationFrame(() => scrollViewportToBottom(true));
}

async function loadPersistedConversationHistory() {
    if (!currentUser?.id) {
        conversationHistory = [];
        activeConversationId = null;
        persistedConversationTurns = [];
        showConversationWelcomeCard();
        renderConversationHistoryList();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('ai_chat_history')
            .select('id, prompt, response, created_at, model')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const groupedConversations = new Map();
        (data || []).forEach((row) => {
            const metadata = parseConversationMetadata(row.model);
            const conversationId = metadata.conversation_id || `conv-${row.id}`;
            if (!groupedConversations.has(conversationId)) {
                groupedConversations.set(conversationId, createConversationRecord(conversationId, metadata.conversation_title || generateConversationTitle(row.prompt), metadata.updated_at || row.created_at));
                groupedConversations.get(conversationId).pinned = Boolean(metadata.pinned);
            }

            const conversation = groupedConversations.get(conversationId);
            conversation.messages.push({
                id: row.id,
                prompt: row.prompt || '',
                response: row.response || '',
                created_at: row.created_at
            });
            conversation.updated_at = metadata.updated_at || row.created_at || conversation.updated_at;
            if (conversation.title === 'New Conversation' || conversation.title === 'Conversation') {
                conversation.title = metadata.conversation_title || generateConversationTitle(row.prompt);
            }
        });

        conversationHistory = Array.from(groupedConversations.values())
            .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

        if (!activeConversationId && conversationHistory.length) {
            activeConversationId = conversationHistory[0].id;
        }

        const activeConversation = getConversationById(activeConversationId);
        persistedConversationTurns = (activeConversation?.messages || []).map((entry) => ({ ...entry }));
        renderPersistedConversationHistory();
        renderConversationHistoryList();
        subscribeToConversationHistory();
    } catch (err) {
        console.error('Failed to restore Msofi AI conversation history:', err.message);
        conversationHistory = [];
        activeConversationId = null;
        persistedConversationTurns = [];
        renderPersistedConversationHistory();
        renderConversationHistoryList();
    }
}

function subscribeToConversationHistory() {
    if (!currentUser?.id) return;

    if (aiConversationSubscription) {
        try {
            supabase.removeChannel(aiConversationSubscription);
        } catch (err) {
            console.warn('Unable to remove previous conversation subscription:', err?.message || err);
        }
    }

    aiConversationSubscription = supabase.channel(`msofi-ai-history-${currentUser.id}`);
    aiConversationSubscription
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'ai_chat_history',
            filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
            const row = payload.new;
            if (!row) return;
            const metadata = parseConversationMetadata(row.model);
            const conversationId = metadata.conversation_id || `conv-${row.id}`;
            const conversation = getConversationById(conversationId) || createConversationRecord(conversationId, metadata.conversation_title || generateConversationTitle(row.prompt), row.created_at);
            if (!conversationHistory.some((entry) => entry.id === conversationId)) {
                conversationHistory = [conversation, ...conversationHistory];
            }

            const alreadyExists = conversation.messages?.some((entry) => entry.id === row.id);
            if (!alreadyExists) {
                conversation.messages.push({
                    id: row.id,
                    prompt: row.prompt || '',
                    response: row.response || '',
                    created_at: row.created_at
                });
                conversation.updated_at = row.created_at;
                conversation.title = metadata.conversation_title || conversation.title || generateConversationTitle(row.prompt);
                conversation.pinned = Boolean(metadata.pinned);
                if (activeConversationId === conversationId) {
                    persistedConversationTurns = conversation.messages.map((entry) => ({ ...entry }));
                    renderPersistedConversationHistory();
                }
                renderConversationHistoryList();
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'ai_chat_history',
            filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
            const row = payload.new;
            if (!row) return;
            const metadata = parseConversationMetadata(row.model);
            const conversationId = metadata.conversation_id || `conv-${row.id}`;
            const conversation = getConversationById(conversationId);
            if (!conversation) return;

            const existingMessage = conversation.messages.find((entry) => entry.id === row.id);
            if (existingMessage) {
                existingMessage.prompt = row.prompt || existingMessage.prompt;
                existingMessage.response = row.response || existingMessage.response;
                existingMessage.created_at = row.created_at || existingMessage.created_at;
            }
            conversation.title = metadata.conversation_title || conversation.title || generateConversationTitle(row.prompt || '');
            conversation.pinned = Boolean(metadata.pinned);
            conversation.updated_at = metadata.updated_at || row.created_at || conversation.updated_at;
            renderConversationHistoryList();
        })
        .subscribe();
}

async function persistCurrentConversationTurn(prompt, response) {
    if (!currentUser?.id) return;

    const normalizedPrompt = String(prompt || '').trim();
    const normalizedResponse = String(response || '').trim();
    if (!normalizedPrompt && !normalizedResponse) return;

    const conversationId = activeConversationId || createConversationId();
    if (!activeConversationId) {
        activeConversationId = conversationId;
        const newConversation = createConversationRecord(conversationId, generateConversationTitle(normalizedPrompt), new Date().toISOString());
        conversationHistory = [newConversation, ...conversationHistory.filter((entry) => entry.id !== conversationId)];
        persistedConversationTurns = [];
    }

    try {
        const metadata = buildConversationMetadata(conversationId, getConversationById(conversationId)?.title || generateConversationTitle(normalizedPrompt), getConversationById(conversationId)?.pinned || false, new Date().toISOString());
        const { data, error } = await supabase
            .from('ai_chat_history')
            .insert({
                user_id: currentUser.id,
                prompt: normalizedPrompt || 'Uploaded attachment',
                response: normalizedResponse || 'No response captured',
                model: metadata
            })
            .select('id, created_at')
            .single();

        if (error) throw error;

        addMessageToConversation(conversationId, normalizedPrompt || 'Uploaded attachment', normalizedResponse || 'No response captured', data?.id, data?.created_at);
    } catch (err) {
        console.warn('Unable to persist Msofi AI conversation history:', err?.message || err);
    }
}

// Increment local resource counters upon message dispatch success
async function incrementUsage(field) {
    const today = new Date().toISOString().split('T')[0];
    const updatePayload = {};
    updatePayload[field] = currentDailyUsage[field] + 1;
    const userId = await getAuthenticatedUserId();

    if (!userId) {
        return;
    }

    try {
        const { error } = await supabase
            .from('ai_usage')
            .update(updatePayload)
            .eq('user_id', userId)
            .eq('request_date', today);

        if (error) throw error;
        currentDailyUsage[field] = updatePayload[field];
        renderLimitTracker();
    } catch (err) {
        console.error('Usage tally update execution failed:', err.message);
    }
}

// ==========================================
// 3. CONFIGURATION MODE ACTIONS & SAFETY ADVISORIES
// ==========================================
function setupModeSwitcher() {
    const select = document.getElementById('ai-mode-select');
    if (!select) return;

    select.addEventListener('change', () => {
        const mode = select.value;
        const banner = document.getElementById('ai-disclaimer-banner');

        if (!banner) return;

        banner.style.display = 'none';
        banner.innerHTML = '';

        if (mode === 'medical') {
            banner.style.display = 'block';
            banner.innerHTML = `
                <strong style="color:#000000; text-transform:uppercase; font-size:11px; display:block; margin-bottom:4px;">Medical Information Warning</strong>
                <span style="font-size:12px; color:var(--text-secondary);">Msofi provides educational biological information only. This service is NOT clinical medical advice, diagnostics, or a therapeutic guide. Consult licensed Malawian medical practitioners for treatments.</span>
            `;
        } else if (mode === 'legal') {
            banner.style.display = 'block';
            banner.innerHTML = `
                <strong style="color:#000000; text-transform:uppercase; font-size:11px; display:block; margin-bottom:4px;">Legal Reference Notice</strong>
                <span style="font-size:12px; color:var(--text-secondary);">Msofi legal search facilitates statute index reading and statutory queries. This tool does not constitute licensed legal advice or legal counsel representation.</span>
            `;
        }
    });
}

window.changeAIMode = () => {
    const select = document.getElementById('ai-mode-select');
    if (select) {
        select.dispatchEvent(new Event('change'));
    }
};

function setupTopbarControls() {
    const modeButton = document.getElementById('msofi-mode-toggle');
    const modeDropdown = document.getElementById('msofi-mode-dropdown');
    const menuButton = document.getElementById('msofi-topbar-menu-btn');
    const menuPanel = document.getElementById('msofi-topbar-menu');
    const shareBtn = document.getElementById('msofi-share-btn');
    const upgradeBtn = document.getElementById('msofi-topbar-upgrade-btn');
    const select = document.getElementById('ai-mode-select');

    modeButton?.addEventListener('click', () => {
        const isOpen = modeDropdown?.hidden === false;
        if (modeDropdown) modeDropdown.hidden = isOpen;
        modeButton.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('click', (event) => {
        if (modeButton && modeDropdown && !modeButton.contains(event.target) && !modeDropdown.contains(event.target)) {
            modeDropdown.hidden = true;
            modeButton.setAttribute('aria-expanded', 'false');
        }
        if (menuButton && menuPanel && !menuButton.contains(event.target) && !menuPanel.contains(event.target)) {
            menuPanel.hidden = true;
        }
    });

    menuButton?.addEventListener('click', () => {
        if (menuPanel) menuPanel.hidden = !menuPanel.hidden;
    });

    menuPanel?.querySelectorAll('[data-menu-action]').forEach((actionButton) => {
        actionButton.addEventListener('click', async () => {
            const action = actionButton.dataset.menuAction;
            menuPanel.hidden = true;

            if (action === 'profile') {
                openProfileModal('overview');
                return;
            }
            if (action === 'history') {
                const historySection = document.getElementById('conversation-history-section');
                const searchInput = document.getElementById('conversation-search-panel-input');
                historySection?.removeAttribute('hidden');
                openConversationSearchPanel();
                searchInput?.focus();
                searchInput?.select();
                return;
            }
            if (action === 'export') {
                const conversations = conversationHistory.map((conversation) => `${conversation.title}\n${conversation.messages.map((entry) => `${entry.prompt}\n${entry.response}`).join('\n\n')}`).join('\n\n---\n\n');
                const blob = new Blob([conversations || 'No conversations available.'], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'msofi-conversations.txt';
                link.click();
                URL.revokeObjectURL(url);
                showFeedback({ title: 'Conversations exported', body: 'Your chat history was exported as a text file.', tone: 'success' });
                return;
            }
            if (action === 'clear-current') {
                showConfirmation({
                    title: 'Clear current conversation',
                    body: 'This will clear the visible chat and reset the current workspace view.',
                    confirmLabel: 'Clear now',
                    onConfirm: () => {
                        const viewport = document.getElementById('messages-viewport');
                        if (viewport) {
                            viewport.innerHTML = '';
                            showConversationWelcomeCard();
                        }
                        showFeedback({ title: 'Conversation cleared', body: 'The current conversation view has been reset.', tone: 'success' });
                    }
                });
                return;
            }
            if (action === 'delete-chat') {
                const conversation = getConversationById(activeConversationId);
                if (!conversation) {
                    showFeedback({ title: 'Nothing to delete', body: 'There is no active conversation to remove.', tone: 'info' });
                    return;
                }

                showConfirmation({
                    title: 'Delete this conversation?',
                    body: 'This will permanently remove this conversation from your chat history. This action cannot be undone.',
                    confirmLabel: 'Delete',
                    onConfirm: async () => {
                        await deleteCurrentConversation();
                    }
                });
                return;
            }
            if (action === 'help') {
                window.location.assign('./support.html');
                return;
            }
            if (action === 'about') {
                showAboutMsofiModal();
                return;
            }
            if (action === 'signout') {
                try {
                    console.warn('[msofi] signing out and redirecting to login', { currentPath: window.location.pathname });
                    await authAPI.signOut();
                    currentUser = null;
                    userProfile = null;
                    window.location.href = '../pages/login.html';
                } catch (err) {
                    console.error('Failed to sign out:', err?.message || err);
                }
                return;
            }
        });
    });

    shareBtn?.addEventListener('click', async () => {
        const messageText = document.querySelector('.ai-message-bubble:last-child .ai-message-body')?.textContent || 'Msofi AI workspace';
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Msofi AI workspace', text: messageText });
            } else {
                await navigator.clipboard.writeText(messageText);
                showFeedback({ title: 'Shared', body: 'The workspace summary was copied to your clipboard.', tone: 'success' });
            }
        } catch (err) {
            showFeedback({ title: 'Share failed', body: err?.message || 'Unable to share right now.', tone: 'error' });
        }
    });

    upgradeBtn?.addEventListener('click', () => {
        window.location.href = '../pages/payments.html';
    });
}

// ==========================================
// 4. CHAT HISTORIES & LIFECYCLES
// ==========================================
function createSquareCroppedImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 320;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, size, size, 0, 0, 320, 320);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Unable to prepare profile image.'));
                        return;
                    }
                    resolve(new File([blob], file.name || 'profile-photo.png', { type: file.type || 'image/png' }));
                }, file.type || 'image/png', 0.92);
            };
            img.onerror = () => reject(new Error('Could not read the selected image.'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
    });
}

function refreshProfileUI() {
    const sidebarProfileAvatar = document.getElementById('msofi-sidebar-profile-avatar');
    const sidebarProfileName = document.getElementById('msofi-sidebar-profile-name');
    const sidebarProfilePlan = document.getElementById('msofi-sidebar-profile-plan');
    const profilePreview = document.querySelector('.msofi-account-photo-preview');

    const isLoggedIn = Boolean(currentUser?.id);

    if (!isLoggedIn) {
        if (sidebarProfileAvatar) {
            sidebarProfileAvatar.textContent = 'M';
            sidebarProfileAvatar.innerHTML = '';
        }
        if (sidebarProfileName) sidebarProfileName.textContent = 'Abraham Msofi';
        if (sidebarProfilePlan) sidebarProfilePlan.textContent = 'Free';
        return;
    }

    const fullName = userProfile?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email || 'Msofi User';
    const isPremium = ['premium_user', 'super_admin'].includes(userProfile?.role);
    const profilePhoto = userProfile?.profile_photo || currentUser?.user_metadata?.profile_photo || '';

    if (sidebarProfileAvatar) {
        if (profilePhoto) {
            sidebarProfileAvatar.innerHTML = `<img src="${profilePhoto}" alt="Profile" class="msofi-account-avatar-img">`;
        } else {
            const initials = String(fullName).split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'M';
            sidebarProfileAvatar.textContent = initials;
            sidebarProfileAvatar.innerHTML = initials;
        }
    }

    if (sidebarProfileName) sidebarProfileName.textContent = fullName;
    if (sidebarProfilePlan) sidebarProfilePlan.textContent = isPremium ? 'Pro' : 'Free';

    if (profilePreview) {
        profilePreview.src = profilePhoto || '../assets/Icon.png?v=2';
    }
}

function setMenuState() {
    refreshProfileUI();
}

function setupAccountMenu() {
    const sidebarProfileTrigger = document.querySelector('.msofi-sidebar-profile-trigger');

    sidebarProfileTrigger?.addEventListener('click', () => {
        openProfileModal('overview');
    });

    refreshProfileUI();
}

function setupChatLifecycle() {
    const newChatBtn = document.getElementById('new-chat-btn');
    const deleteBtn = document.getElementById('delete-history-btn');

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            const nextConversationId = createConversationId();
            activeConversationId = nextConversationId;
            const newConversation = createConversationRecord(nextConversationId, 'New Conversation');
            conversationHistory = [newConversation, ...conversationHistory.filter((entry) => entry.id !== nextConversationId)];
            persistedConversationTurns = [];
            showConversationWelcomeCard();
            renderConversationHistoryList();
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!currentUser?.id) {
                const viewport = document.getElementById('messages-viewport');
                viewport.innerHTML = '<p style="text-align:center; font-size:14px; color:var(--text-muted); margin-top:40px;">Workspace memory successfully cleared.</p>';
                activeConversationId = null;
                persistedConversationTurns = [];
                showConversationWelcomeCard();
                return;
            }

            showConfirmation({
                title: 'Clear saved conversation history',
                body: 'This will remove the current chat history from your account workspace.',
                confirmLabel: 'Delete history',
                onConfirm: async () => {
                    const conversation = getConversationById(activeConversationId);
                    if (conversation) {
                        conversation.deleted = true;
                        conversation.updated_at = new Date().toISOString();
                        await persistConversationMetadata(activeConversationId, conversation.title || 'New Conversation', conversation.pinned, true);
                    }

                    activeConversationId = null;
                    persistedConversationTurns = [];
                    showConversationWelcomeCard();
                    renderConversationHistoryList();
                    showFeedback({ title: 'History cleared', body: 'Your saved conversation history has been removed.', tone: 'success' });
                }
            });
            return;

        });
    }
}

function setupSidebarNavigation() {
    const sidebar = document.querySelector('.msofi-sidebar-panel');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const navButtons = document.querySelectorAll('[data-sidebar-action]');
    const searchInput = document.getElementById('conversation-search-panel-input');
    const modeSelect = document.getElementById('ai-mode-select');

    if (collapseBtn && sidebar) {
        collapseBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    const searchButton = document.querySelector('.msofi-sidebar-search');
    searchButton?.addEventListener('click', () => {
        const historySection = document.getElementById('conversation-history-section');
        historySection?.removeAttribute('hidden');
        openConversationSearchPanel();
    });

    navButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const action = button.dataset.sidebarAction;
            if (action === 'search') {
                const historySection = document.getElementById('conversation-history-section');
                historySection?.removeAttribute('hidden');
                openConversationSearchPanel();
                return;
            }

            if (action === 'images') {
                modeSelect.value = 'image';
                window.changeAIMode();
                showFeedback({ title: 'Image mode enabled', body: 'Msofi AI is ready for image generation requests.', tone: 'success' });
                return;
            }

            if (action === 'library') {
                modeSelect.value = 'general';
                window.changeAIMode();
                showFeedback({ title: 'Library view ready', body: 'Your workspace is prepared to search the MEBV library when the prompt is clearly a document request.', tone: 'info' });
                return;
            }

            if (action === 'plugins') {
                showFeedback({ title: 'Plugins workspace', body: 'This workspace is ready for plugin-assisted chat flows.', tone: 'info' });
                return;
            }

            if (action === 'projects') {
                modeSelect.value = 'business';
                window.changeAIMode();
                showFeedback({ title: 'Projects mode enabled', body: 'Your conversation context is now aligned for project planning and operations.', tone: 'success' });
                return;
            }

            if (action === 'codex') {
                modeSelect.value = 'coding';
                window.changeAIMode();
                showFeedback({ title: 'Codex mode enabled', body: 'Your workspace is now set for coding and debugging support.', tone: 'success' });
                return;
            }

            if (action === 'more') {
                sidebar.classList.toggle('collapsed');
                showFeedback({ title: 'Sidebar refreshed', body: 'The workspace navigation can now expand or collapse smoothly.', tone: 'info' });
            }
        });
    });
}

function openConversationSearchPanel() {
    const panel = document.getElementById('conversation-search-panel');
    const input = document.getElementById('conversation-search-panel-input');
    const results = document.getElementById('conversation-search-results');
    if (!panel || !input || !results) return;

    panel.hidden = false;
    input.value = conversationHistorySearchQuery || '';
    input.focus();
    input.select();
    sidebarSearchActiveIndex = -1;
    renderConversationSearchResults();
}

function closeConversationSearchPanel() {
    const panel = document.getElementById('conversation-search-panel');
    const input = document.getElementById('conversation-search-panel-input');
    if (!panel || !input) return;

    panel.hidden = true;
    conversationHistorySearchQuery = '';
    input.value = '';
    sidebarSearchActiveIndex = -1;
    renderConversationHistoryList();
}

function renderConversationSearchResults() {
    const results = document.getElementById('conversation-search-results');
    const input = document.getElementById('conversation-search-panel-input');
    if (!results || !input) return;

    const query = (input.value || '').trim().toLowerCase();
    conversationHistorySearchQuery = query;

    const items = conversationHistory
        .filter((conversation) => !conversation.deleted)
        .filter((conversation) => {
            if (!query) return false;
            const haystack = `${conversation.title || ''} ${conversation.messages?.map((entry) => `${entry.prompt || ''} ${entry.response || ''}`).join(' ')}`.toLowerCase();
            return haystack.includes(query);
        })
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
        .slice(0, 10);

    if (!query) {
        results.innerHTML = '<div class="conversation-search-empty">Recent conversations</div>';
        return;
    }

    if (!items.length) {
        results.innerHTML = '<div class="conversation-search-empty">No matching conversations found.</div>';
        return;
    }

    results.innerHTML = items.map((conversation, index) => `
        <button type="button" class="conversation-search-result ${index === sidebarSearchActiveIndex ? 'is-selected' : ''}" data-action="open-search-result" data-conversation-id="${conversation.id}">
            <span class="conversation-search-result-title">${escapeHtml(conversation.title || 'New Conversation')}</span>
            <span class="conversation-search-result-meta">${escapeHtml((conversation.messages?.length ? `${conversation.messages.length} messages` : 'New conversation'))}</span>
        </button>
    `).join('');

    results.querySelectorAll('[data-action="open-search-result"]').forEach((button) => {
        button.addEventListener('click', () => {
            const conversationId = button.getAttribute('data-conversation-id');
            const conversation = getConversationById(conversationId);
            if (!conversation) return;
            setActiveConversation(conversationId);
            closeConversationSearchPanel();
        });
    });
}

function setupConversationHistorySearch() {
    const searchInput = document.getElementById('conversation-search-panel-input');
    const closeBtn = document.getElementById('conversation-search-close-btn');
    const panel = document.getElementById('conversation-search-panel');
    if (!searchInput || !panel) return;

    searchInput.addEventListener('input', () => {
        sidebarSearchActiveIndex = -1;
        renderConversationSearchResults();
        renderConversationHistoryList();
    });

    searchInput.addEventListener('keydown', (event) => {
        const results = panel.querySelectorAll('.conversation-search-result');
        if (!results.length) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            sidebarSearchActiveIndex = (sidebarSearchActiveIndex + 1) % results.length;
            results.forEach((button, index) => button.classList.toggle('is-selected', index === sidebarSearchActiveIndex));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            sidebarSearchActiveIndex = (sidebarSearchActiveIndex - 1 + results.length) % results.length;
            results.forEach((button, index) => button.classList.toggle('is-selected', index === sidebarSearchActiveIndex));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const selectedButton = results[sidebarSearchActiveIndex] || results[0];
            selectedButton?.click();
        } else if (event.key === 'Escape') {
            closeConversationSearchPanel();
        }
    });

    closeBtn?.addEventListener('click', () => {
        closeConversationSearchPanel();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
            closeConversationSearchPanel();
        }
    });
}

// ==========================================
// 5. ATTACHMENT PIPELINE UTILITIES
// ==========================================
function setupAttachmentFlow() {
    const fileUploader = document.getElementById('ai-file-uploader');
    const previewBox = document.getElementById('attachment-preview-box');
    const previewName = document.getElementById('attachment-name');
    const cancelBtn = document.getElementById('cancel-attachment-btn');
    const trigger = document.getElementById('attachment-menu-trigger');

    if (!fileUploader || !previewBox || !previewName || !cancelBtn || !trigger) return;

    const attachmentMenuOptions = [
        { id: 'document', label: 'Upload Document', icon: '📄', accept: '.pdf,.doc,.docx,.txt,.rtf,.odt', description: 'PDF, DOC, DOCX, TXT, RTF, ODT' },
        { id: 'image', label: 'Upload Image', icon: '🖼', accept: 'image/*', description: 'JPG, JPEG, PNG, GIF, WEBP, BMP' },
        { id: 'video', label: 'Upload Video', icon: '🎥', accept: 'video/*', description: 'MP4, MOV, AVI, MKV, WEBM' },
        { id: 'audio', label: 'Upload Audio', icon: '🎵', accept: 'audio/*', description: 'MP3, WAV, AAC, OGG, M4A' },
        { id: 'spreadsheet', label: 'Upload Spreadsheet', icon: '📊', accept: '.xls,.xlsx,.csv,.ods', description: 'XLS, XLSX, CSV, ODS' },
        { id: 'presentation', label: 'Upload Presentation', icon: '📽', accept: '.ppt,.pptx,.odp', description: 'PPT, PPTX, ODP' },
        { id: 'any', label: 'Upload Any File', icon: '📦', accept: '*/*', description: 'All supported files' }
    ];

    let activeMenu = null;

    const closeMenu = () => {
        if (activeMenu) {
            activeMenu.remove();
            activeMenu = null;
        }
        document.removeEventListener('mousedown', handleOutsideClick);
    };

    const handleOutsideClick = (event) => {
        if (!activeMenu) return;
        if (activeMenu.contains(event.target) || trigger.contains(event.target)) return;
        closeMenu();
    };

    const openMenu = () => {
        closeMenu();

        const rect = trigger.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.setAttribute('role', 'menu');
        menu.style.cssText = [
            'position: fixed',
            'z-index: 2147483647',
            'left: 0',
            'top: 0',
            'min-width: 260px',
            'padding: 8px',
            'background: #ffffff',
            'border: 1px solid rgba(0, 0, 0, 0.16)',
            'border-radius: 14px',
            'box-shadow: 0 18px 42px rgba(0, 0, 0, 0.14)',
            'display: grid',
            'gap: 6px',
            'opacity: 0',
            'transform: translateY(8px) scale(0.98)',
            'transition: opacity 160ms ease, transform 160ms ease'
        ].join(';');

        menu.innerHTML = attachmentMenuOptions.map((option) => `
            <button type="button" class="msofi-attachment-menu-item" data-attachment-option="${option.id}" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 10px 12px; border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 10px; background: #ffffff; color: #000000; cursor: pointer; text-align: left; font-size: 13px; line-height: 1.3;">
                <span style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <span style="font-size:16px; line-height:1;">${option.icon}</span>
                    <span style="display:flex; flex-direction:column; min-width:0;">
                        <span style="font-weight:600; color:#000;">${option.label}</span>
                        <span style="font-size:11px; color:rgba(0,0,0,0.65); margin-top:2px;">${option.description}</span>
                    </span>
                </span>
                <span style="font-size:14px; color:#000;">›</span>
            </button>
        `).join('');

        document.body.appendChild(menu);
        const menuHeight = menu.offsetHeight || 260;
        const menuWidth = menu.offsetWidth || 260;
        const left = Math.min(rect.left, window.innerWidth - menuWidth - 16);
        const top = Math.max(16, rect.top - menuHeight - 12);
        menu.style.left = `${Math.max(16, left)}px`;
        menu.style.top = `${top}px`;
        requestAnimationFrame(() => {
            menu.style.opacity = '1';
            menu.style.transform = 'translateY(0) scale(1)';
        });

        activeMenu = menu;
        document.addEventListener('mousedown', handleOutsideClick);

        menu.querySelectorAll('[data-attachment-option]').forEach((button) => {
            button.addEventListener('click', () => {
                const selectedOption = attachmentMenuOptions.find((entry) => entry.id === button.dataset.attachmentOption);
                if (!selectedOption) return;

                closeMenu();
                fileUploader.accept = selectedOption.accept || '';
                fileUploader.click();
            });
        });
    };

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (activeMenu) {
            closeMenu();
            return;
        }
        openMenu();
    });

    trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            if (activeMenu) {
                closeMenu();
                return;
            }
            openMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenu();
        }
    });

    fileUploader.addEventListener('change', () => {
        const file = fileUploader.files[0];
        if (!file) return;

        const validation = validateFile(file, 'chat_file');
        if (!validation.valid) {
            showFeedback({ title: 'Attachment issue', body: validation.error, tone: 'warning' });
            fileUploader.value = '';
            return;
        }

        attachedFileInstance = file;
        previewName.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        previewBox.style.display = 'flex';
    });

    cancelBtn.addEventListener('click', () => {
        attachedFileInstance = null;
        fileUploader.value = '';
        previewBox.style.display = 'none';
    });
}

// ==========================================
// 6. SPEECH INPUT INTERACTIVE CONTEXTS (ENGLISH ONLY)
// ==========================================
function setupVoiceInput() {
    const voiceBtn = document.getElementById('voice-input-btn');
    const textInput = document.getElementById('chat-text-input');

    if (!voiceBtn || !textInput) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        voiceBtn.style.display = 'none';
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US'; // English-only speech model conversion
    recognition.interimResults = false;

    recognition.onstart = () => {
        voiceBtn.textContent = 'Listening...';
        voiceBtn.style.borderColor = '#000000';
    };

    recognition.onerror = () => {
        voiceBtn.textContent = 'Voice';
        voiceBtn.style.borderColor = '#000000';
    };

    recognition.onend = () => {
        voiceBtn.textContent = 'Voice';
        voiceBtn.style.borderColor = '#000000';
    };

    recognition.onresult = (event) => {
        textInput.value = event.results[0][0].transcript;
    };

    voiceBtn.addEventListener('click', () => {
        recognition.start();
    });
}

// ==========================================
// 7. MESSAGE CONTEXT PACKAGING & API DISPATCH
// ==========================================
function getLibraryField(item, keys) {
    for (const key of keys) {
        const value = item?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value && typeof value === 'number') return String(value);
    }
    return '';
}

async function renderPdfPreviewImage(pdfUrl) {
    if (!pdfUrl) return '';

    const normalizedUrl = String(pdfUrl || '').trim();
    if (!normalizedUrl) return '';

    const isDrivePdf = /drive\.google\.com|googleapis\.com/i.test(normalizedUrl);
    if (isDrivePdf) {
        return '';
    }

    try {
        if (!window.__msofiPdfPreviewLib) {
            const pdfModule = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs');
            window.__msofiPdfPreviewLib = pdfModule;
        }

        const pdfjsLib = window.__msofiPdfPreviewLib;
        if (!pdfjsLib?.getDocument) return '';

        const workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs';
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

        const pdfDoc = await pdfjsLib.getDocument({ url: normalizedUrl }).promise;
        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1.05 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;
        return `<div style="margin:10px 0;"><img src="${canvas.toDataURL('image/png')}" alt="Preview" style="width:100%; max-width:320px; border-radius:8px; border:1px solid #000; background:#fff;" /></div>`;
    } catch (err) {
        console.warn('Unable to generate PDF preview:', err?.message || err);
        return '';
    }
}

function buildLibrarySelectionListHtml(results, query) {
    if (!Array.isArray(results) || !results.length) {
        return 'No matching book was found in the MEBV Library.';
    }

    const intro = `<div style="font-size:13px; color:#000; margin-bottom:10px;">Please choose the book you want by entering the number shown below.</div>`;
    const header = `<div style="font-size:12px; color:#000; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:10px; font-weight:700;">MEBV Library • ${escapeHtml(query || 'library search')}</div>`;
    const cards = results.slice(0, 6).map((item, index) => {
        const title = escapeHtml(item?.title || 'Untitled resource');
        const subject = escapeHtml(getLibraryField(item, ['subject', 'subject_name', 'subjectName']) || 'Not listed');
        const formClass = escapeHtml(getLibraryField(item, ['form', 'class', 'class_name', 'form_name', 'level']) || 'Not listed');
        const category = escapeHtml(getLibraryField(item, ['category', 'type']) || 'Library');
        const sizeText = item?.file_size ? `File size: ${escapeHtml(item.file_size)}` : 'File size: Not listed';
        const description = escapeHtml(String(item?.description || 'No description provided by the library catalogue.').trim());

        return `
            <div style="margin-top:10px; padding:12px; border:1px solid #000; border-radius:var(--radius-md); background:#fff;">
                <div style="font-size:11px; color:#000; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; font-weight:700;">${index + 1}. ${title}</div>
                <div style="font-size:13px; color:#000; font-weight:700; margin-bottom:6px;">${title}</div>
                <div style="font-size:12px; color:#000; line-height:1.5; margin-bottom:6px;">Subject: ${subject}</div>
                <div style="font-size:12px; color:#000; line-height:1.5; margin-bottom:6px;">Form/Class: ${formClass}</div>
                <div style="font-size:12px; color:#000; line-height:1.5; margin-bottom:6px;">Category: ${category}</div>
                <div style="font-size:12px; color:#000; line-height:1.5; margin-bottom:6px;">${sizeText}</div>
                <div style="font-size:12px; color:#000; line-height:1.5;">${description}</div>
            </div>
        `;
    }).join('');

    return `${intro}${header}${cards}<div style="margin-top:12px; font-size:13px; color:#000;">Reply with the number of the book you want to download.</div>`;
}

function getLibraryPreviewImageUrl(item) {
    const previewUrl = item?.thumbnail || item?.image_url || item?.cover_url || item?.image || item?.preview_url || item?.preview_image || '';
    return typeof previewUrl === 'string' && previewUrl.trim() ? previewUrl.trim() : '../assets/Icon.png?v=2';
}

async function buildLibrarySelectionResultHtml(item) {
    const title = escapeHtml(item?.title || 'Untitled resource');
    const subject = escapeHtml(getLibraryField(item, ['subject', 'subject_name', 'subjectName']) || 'Not listed');
    const formClass = escapeHtml(getLibraryField(item, ['form', 'class', 'class_name', 'form_name', 'level']) || 'Not listed');
    const category = escapeHtml(getLibraryField(item, ['category', 'type']) || 'Library');
    const sizeText = item?.file_size ? `File size: ${escapeHtml(item.file_size)}` : 'File size: Not listed';
    const description = escapeHtml(String(item?.description || 'No description provided by the library catalogue.').trim());
    const previewUrl = getLibraryPreviewImageUrl(item);
    const previewMarkup = previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${title}" style="width:100%; max-width:240px; max-height:280px; object-fit:cover; border-radius:var(--radius-md); display:block; border:1px solid #000; background:#fff;" />`
        : `<div style="padding:14px; border:1px dashed #000; border-radius:var(--radius-md); background:#fff; color:#000;">Preview not available for this book.</div>`;
    const downloadLink = item?.download_url
        ? `<button type="button" data-book-download-url="${escapeHtml(item.download_url)}" data-book-download-name="${escapeHtml(title)}" style="display:inline-flex; align-items:center; justify-content:center; gap:8px; margin-top:12px; padding:10px 14px; border-radius:var(--radius-md); border:1px solid #000; background:#fff; color:#000; text-decoration:none; font-weight:700; cursor:pointer;">Download ${title}</button>`
        : '<span style="font-size:12px; color:#000;">Download not available yet</span>';

    return `
        <div style="padding:14px; border:1px solid #000; border-radius:var(--radius-md); background:#fff;">
            <div style="font-size:12px; color:#000; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; font-weight:700;">Selected Book</div>
            <div style="display:grid; gap:12px;">
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="font-size:14px; color:#000; font-weight:700;">${title}</div>
                    <div style="font-size:12px; color:#000;">Category: ${category}</div>
                    <div style="font-size:12px; color:#000;">Subject: ${subject}</div>
                    <div style="font-size:12px; color:#000;">Form/Class: ${formClass}</div>
                    <div style="font-size:12px; color:#000;">${sizeText}</div>
                </div>
                <div style="padding:10px; border:1px solid #000; border-radius:var(--radius-md); background:#fff;">
                    <div style="font-size:12px; color:#000; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; font-weight:700;">Preview</div>
                    ${previewMarkup}
                </div>
                <div style="padding:10px; border:1px solid #000; border-radius:var(--radius-md); background:#fff;">
                    <div style="font-size:12px; color:#000; line-height:1.5; margin-bottom:8px;">${description || 'No description provided by the library catalogue.'}</div>
                    ${downloadLink}
                </div>
            </div>
        </div>
    `;
}

function renderInlineMarkdown(text) {
    return escapeHtml(text)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function buildMarkdownBlocks(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];

    if (/<\/?[a-z][\s\S]*>/i.test(raw) && !/^\s*(#{1,3}\s|[-*]\s|\d+\.\s|```|[|].*[|])/.test(raw)) {
        return [{ type: 'html', html: raw, text: raw }];
    }

    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            index += 1;
            continue;
        }

        if (/^```/.test(trimmed)) {
            const codeLines = [];
            index += 1;
            while (index < lines.length && !/^```/.test(lines[index].trim())) {
                codeLines.push(lines[index]);
                index += 1;
            }
            index += 1;
            const codeText = codeLines.join('\n');
            blocks.push({
                type: 'code',
                html: `<pre class="ai-code-block">${escapeHtml(codeText)}</pre>`,
                text: codeText
            });
            continue;
        }

        if (/^#{1,3}\s+/.test(trimmed)) {
            const level = trimmed.match(/^#{1,3}/)[0].length;
            const headingText = trimmed.replace(/^#{1,3}\s+/, '');
            blocks.push({
                type: 'heading',
                html: `<h${level} class="ai-markdown-heading">${renderInlineMarkdown(headingText)}</h${level}>`,
                text: headingText,
                level
            });
            index += 1;
            continue;
        }

        if (/^\|/.test(trimmed)) {
            const rows = [];
            while (index < lines.length && /^\|/.test(lines[index].trim())) {
                rows.push(lines[index].trim());
                index += 1;
            }
            if (rows.length >= 2) {
                const tableRows = rows.map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()));
                const header = tableRows[0];
                const separator = tableRows[1].every((cell) => /^:?-{3,}:?$/.test(cell));
                if (separator) {
                    const bodyRows = tableRows.slice(2).map((cells) => cells.map((cell) => cell));
                    const headerCells = header.map((cell) => cell);
                    blocks.push({
                        type: 'table',
                        html: `<div class="ai-markdown-table-wrap"><table class="ai-markdown-table"><thead><tr>${headerCells.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
                        text: rows.join(' '),
                        rows: bodyRows,
                        header: headerCells
                    });
                    continue;
                }
            }
        }

        const listLines = [];
        while (index < lines.length) {
            const currentLine = lines[index].trim();
            if (!currentLine) break;
            if (!/^(?:[-*]|\d+\.)\s+/.test(currentLine)) break;
            listLines.push(currentLine);
            index += 1;
        }

        if (listLines.length) {
            const ordered = listLines[0].match(/^\d+\./);
            const items = listLines.map((item) => item.replace(/^(?:[-*]|\d+\.)\s+/, ''));
            blocks.push({
                type: 'list',
                html: `<${ordered ? 'ol' : 'ul'} class="ai-markdown-list">${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`,
                text: listLines.join(' '),
                items
            });
            continue;
        }

        const paragraphLines = [];
        while (index < lines.length) {
            const currentLine = lines[index].trim();
            if (!currentLine) break;
            if (/^(#{1,3}\s+|```|\||(?:[-*]|\d+)\s+)/.test(currentLine)) break;
            paragraphLines.push(currentLine);
            index += 1;
        }

        if (paragraphLines.length) {
            const textBody = paragraphLines.join(' ');
            blocks.push({
                type: 'paragraph',
                html: `<p class="ai-markdown-paragraph">${renderInlineMarkdown(textBody)}</p>`,
                text: textBody
            });
            continue;
        }

        index += 1;
    }

    return blocks;
}

function formatAssistantResponse(text, isCode = false) {
    const raw = String(text || '').trim();
    if (!raw) return '';

    if (isCode) {
        return `<pre class="ai-code-block">${escapeHtml(raw)}</pre>`;
    }

    const blocks = buildMarkdownBlocks(raw);
    if (!blocks.length) return '';
    return blocks.map((block) => block.html).join('');
}

function stripMessageMarkup(text) {
    const template = document.createElement('div');
    template.innerHTML = String(text || '');
    return template.textContent || template.innerText || '';
}

function getMessageActionIcon(action) {
    const commonStroke = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"';

    if (action === 'copy') {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" ${commonStroke}><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"></path></svg>`;
    }

    if (action === 'thumbs-up') {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" ${commonStroke}><path d="M7 10v10"></path><path d="M7 20h9.5a2 2 0 0 0 2-1.6l1.3-6A2 2 0 0 0 18 9H13l-1-4.2A1.8 1.8 0 0 0 10.2 3H10v7"></path></svg>`;
    }

    if (action === 'thumbs-down') {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" ${commonStroke}><path d="M17 14V4"></path><path d="M17 4H7.5a2 2 0 0 0-2 1.6l-1.3 6A2 2 0 0 0 6 14h5l1 4.2A1.8 1.8 0 0 0 13.8 21H14v-7"></path></svg>`;
    }

    if (action === 'regenerate') {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" ${commonStroke}><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>`;
    }

    return `<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" ${commonStroke}><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path><path d="M12 3v13"></path><path d="M7 11l5-5 5 5"></path></svg>`;
}

function buildMessageToolbarHtml(messageText, sender = 'user') {
    const safeMessageText = escapeHtml(stripMessageMarkup(messageText || '')).trim();
    const isAssistant = sender === 'assistant' || sender === 'msofi';

    return `
        <div class="ai-message-toolbar" aria-label="Message actions">
            <button class="ai-message-action" type="button" data-message-action="copy" data-message-text="${safeMessageText}" title="Copy">
                <span class="ai-message-action-icon" aria-hidden="true">${getMessageActionIcon('copy')}</span>
            </button>
            <button class="ai-message-action" type="button" data-message-action="thumbs-up" data-message-text="${safeMessageText}" title="Helpful">
                <span class="ai-message-action-icon" aria-hidden="true">${getMessageActionIcon('thumbs-up')}</span>
            </button>
            <button class="ai-message-action" type="button" data-message-action="thumbs-down" data-message-text="${safeMessageText}" title="Not helpful">
                <span class="ai-message-action-icon" aria-hidden="true">${getMessageActionIcon('thumbs-down')}</span>
            </button>
            <button class="ai-message-action" type="button" data-message-action="regenerate" data-message-text="${safeMessageText}" title="${isAssistant ? 'Regenerate response' : 'Try again'}">
                <span class="ai-message-action-icon" aria-hidden="true">${getMessageActionIcon('regenerate')}</span>
            </button>
            <button class="ai-message-action" type="button" data-message-action="share" data-message-text="${safeMessageText}" title="Share">
                <span class="ai-message-action-icon" aria-hidden="true">${getMessageActionIcon('share')}</span>
            </button>
        </div>
    `;
}

let streamViewportFollowRaf = null;
let streamViewportFollowActive = false;
let lastStreamViewportHeight = 0;

function isViewportNearBottom(viewport, threshold = SCROLL_BOTTOM_DISTANCE) {
    return viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight) <= threshold;
}

function hideScrollToBottomButton() {
    if (!scrollToBottomButton) return;
    scrollToBottomButton.classList.remove('visible');
    scrollToBottomButton.setAttribute('hidden', 'hidden');
}

function scrollViewportToBottom(force = false, smooth = false) {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport) return;

    const distanceFromBottom = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
    if (!force && distanceFromBottom > SCROLL_BOTTOM_DISTANCE) {
        return;
    }

    suppressAutoScroll = false;
    if (smooth) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    } else {
        viewport.scrollTop = viewport.scrollHeight;
    }

    hideScrollToBottomButton();
}

function updateScrollToBottomButton() {
    if (!scrollToBottomButton) return;
    const viewport = document.getElementById('messages-viewport');
    if (!viewport) return;

    const distanceFromBottom = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
    const shouldShow = distanceFromBottom > SCROLL_BUTTON_FADE_DISTANCE;
    scrollToBottomButton.classList.toggle('visible', shouldShow);
    if (shouldShow) {
        scrollToBottomButton.removeAttribute('hidden');
    } else {
        scrollToBottomButton.setAttribute('hidden', 'hidden');
    }
}

function createScrollToBottomButton() {
    if (scrollToBottomButton) return;

    scrollToBottomButton = document.createElement('button');
    scrollToBottomButton.type = 'button';
    scrollToBottomButton.className = 'msofi-scroll-to-bottom-btn';
    scrollToBottomButton.setAttribute('hidden', 'hidden');
    scrollToBottomButton.setAttribute('aria-label', 'Scroll to latest message');
    scrollToBottomButton.innerHTML = '↓';
    scrollToBottomButton.addEventListener('click', () => {
        scrollViewportToBottom(true, true);
    });

    document.body.appendChild(scrollToBottomButton);
}

function stopStreamViewportFollow() {
    if (streamViewportFollowRaf !== null) {
        window.cancelAnimationFrame(streamViewportFollowRaf);
        streamViewportFollowRaf = null;
    }
    streamViewportFollowActive = false;
}

function beginStreamViewportFollow() {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport || suppressAutoScroll) return;

    lastStreamViewportHeight = viewport.scrollHeight;
    streamViewportFollowActive = true;
    stopStreamViewportFollow();
    streamViewportFollowRaf = window.requestAnimationFrame(stepStreamViewportFollow);
}

function stepStreamViewportFollow() {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport || !streamViewportFollowActive || suppressAutoScroll) {
        streamViewportFollowRaf = null;
        return;
    }

    const targetTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight - 18);
    const currentTop = viewport.scrollTop;
    const delta = targetTop - currentTop;

    if (delta <= 0.5) {
        viewport.scrollTop = viewport.scrollHeight;
        streamViewportFollowRaf = null;
        return;
    }

    const smoothFactor = Math.min(0.16, Math.max(0.06, Math.abs(delta) / 420));
    viewport.scrollTop = currentTop + (delta * smoothFactor);
    lastStreamViewportHeight = viewport.scrollHeight;
    streamViewportFollowRaf = window.requestAnimationFrame(stepStreamViewportFollow);
}

function scrollMessagesViewport(force = false) {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport || suppressAutoScroll) return;

    const distanceFromBottom = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
    if (!force && distanceFromBottom > SCROLL_BOTTOM_DISTANCE) return;

    if (streamViewportFollowRaf === null) {
        beginStreamViewportFollow();
    }
}

function setupMessageViewportAutoScroll() {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport) return;

    createScrollToBottomButton();
    updateScrollToBottomButton();

    viewport.addEventListener('scroll', () => {
        const distanceFromBottom = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
        suppressAutoScroll = distanceFromBottom > SCROLL_BOTTOM_DISTANCE;

        if (suppressAutoScroll) {
            stopStreamViewportFollow();
        } else if (streamViewportFollowActive && streamViewportFollowRaf === null) {
            beginStreamViewportFollow();
        }

        updateScrollToBottomButton();
    }, { passive: true });
}

function appendTypingIndicatorBubble(anchorBubble = null) {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport) return null;

    const welcome = document.getElementById('welcome-message-card');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble ai-bubble-typing';
    bubble.dataset.role = 'assistant';
    bubble.dataset.messageId = `msg-${Date.now()}-${messageToolbarSequence++}`;
    bubble.innerHTML = `
        <strong class="ai-bubble-label">Msofi AI</strong>
        <div class="ai-response-stream">
            <div class="typing-indicator" role="status" aria-live="polite">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        </div>
        ${buildMessageToolbarHtml('', 'assistant')}
    `;

    if (anchorBubble && anchorBubble.parentNode === viewport) {
        anchorBubble.insertAdjacentElement('afterend', bubble);
    } else {
        viewport.appendChild(bubble);
    }

    scrollMessagesViewport(true);
    return bubble;
}

function revealTextIntoElement(element, fullText, speed = 16, onComplete = () => {}, finalHtml = '') {
    let index = 0;
    element.textContent = '';

    const tick = () => {
        if (index >= fullText.length) {
            if (finalHtml) {
                element.innerHTML = finalHtml;
            } else {
                element.textContent = fullText;
            }
            onComplete();
            return;
        }

        const step = fullText.slice(index, index + 2);
        index += step.length;
        element.textContent = element.textContent + step;
        scrollMessagesViewport(false);
        window.setTimeout(tick, speed);
    };

    tick();
}

function streamMarkdownBlock(block, streamHost, onComplete) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-markdown-block';
    streamHost.appendChild(wrapper);

    if (block.type === 'html') {
        const element = document.createElement('div');
        element.className = 'ai-markdown-block';
        wrapper.appendChild(element);
        element.innerHTML = block.html || '';
        onComplete();
        return;
    }

    if (block.type === 'heading') {
        const element = document.createElement(`h${block.level || 2}`);
        element.className = 'ai-markdown-heading';
        wrapper.appendChild(element);
        revealTextIntoElement(element, block.text || '', 16, onComplete, renderInlineMarkdown(block.text || ''));
        return;
    }

    if (block.type === 'code') {
        const element = document.createElement('pre');
        element.className = 'ai-code-block';
        wrapper.appendChild(element);
        revealTextIntoElement(element, block.text || '', 8, onComplete);
        return;
    }

    if (block.type === 'list') {
        const listTag = block.items?.[0] && /^\d+\./.test(block.items[0]) ? 'ol' : 'ul';
        const listElement = document.createElement(listTag);
        listElement.className = 'ai-markdown-list';
        wrapper.appendChild(listElement);

        const items = block.items || [];
        let itemIndex = 0;

        const revealNextItem = () => {
            if (itemIndex >= items.length) {
                onComplete();
                return;
            }

            const item = document.createElement('li');
            listElement.appendChild(item);
            const itemText = items[itemIndex] || '';
            revealTextIntoElement(item, itemText, 12, () => {
                itemIndex += 1;
                revealNextItem();
            }, renderInlineMarkdown(itemText));
        };

        revealNextItem();
        return;
    }

    if (block.type === 'table') {
        const table = document.createElement('table');
        table.className = 'ai-markdown-table';
        wrapper.appendChild(table);

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        block.header?.forEach((cell) => {
            const th = document.createElement('th');
            headerRow.appendChild(th);
            revealTextIntoElement(th, cell, 12, () => {}, renderInlineMarkdown(cell));
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        table.appendChild(tbody);

        let rowIndex = 0;
        const revealNextRow = () => {
            if (rowIndex >= (block.rows || []).length) {
                onComplete();
                return;
            }

            const row = document.createElement('tr');
            tbody.appendChild(row);
            const cells = block.rows[rowIndex] || [];
            let cellIndex = 0;
            const revealNextCell = () => {
                if (cellIndex >= cells.length) {
                    rowIndex += 1;
                    revealNextRow();
                    return;
                }
                const cell = document.createElement('td');
                row.appendChild(cell);
                revealTextIntoElement(cell, cells[cellIndex], 10, () => {
                    cellIndex += 1;
                    revealNextCell();
                }, renderInlineMarkdown(cells[cellIndex]));
            };
            revealNextCell();
        };

        revealNextRow();
        return;
    }

    const paragraphElement = document.createElement('p');
    paragraphElement.className = 'ai-markdown-paragraph';
    wrapper.appendChild(paragraphElement);
    revealTextIntoElement(paragraphElement, block.text || '', 16, onComplete, renderInlineMarkdown(block.text || ''));
}

function streamAssistantResponseBubble(bubble, text, isCode = false) {
    if (!bubble) return;

    const streamHost = bubble.querySelector('.ai-response-stream');
    if (!streamHost) return;

    const raw = String(text || '').trim();
    if (!raw) {
        streamHost.innerHTML = '<p class="ai-markdown-paragraph">No response received.</p>';
        return;
    }

    streamViewportFollowActive = true;
    bubble.dataset.messageText = raw;
    const toolbarButtons = bubble.querySelectorAll('[data-message-action]');
    toolbarButtons.forEach((button) => {
        button.dataset.messageText = escapeHtml(stripMessageMarkup(raw));
    });

    const blocks = buildMarkdownBlocks(raw);
    const hasMarkdown = blocks.length > 0;
    const displayBlocks = isCode
        ? [{ type: 'code', text: raw, html: `<pre class="ai-code-block">${escapeHtml(raw)}</pre>` }]
        : (hasMarkdown ? blocks : [{ type: 'paragraph', text: raw }]);

    streamHost.innerHTML = '';

    let blockIndex = 0;
    const processNextBlock = () => {
        if (blockIndex >= displayBlocks.length) {
            bubble.classList.add('stream-complete');
            stopStreamViewportFollow();
            streamViewportFollowActive = false;
            return;
        }

        const block = displayBlocks[blockIndex];
        streamMarkdownBlock(block, streamHost, () => {
            blockIndex += 1;
            if (!streamViewportFollowActive) {
                streamViewportFollowActive = true;
                beginStreamViewportFollow();
            }
            window.setTimeout(processNextBlock, 120);
        });
    };

    beginStreamViewportFollow();
    processNextBlock();
}

function appendMessageBubble(sender, text, isCode = false, anchorBubble = null) {
    const viewport = document.getElementById('messages-viewport');
    if (!viewport) return null;

    // Remove welcome card if active
    const welcome = document.getElementById('welcome-message-card');
    if (welcome) welcome.remove();

    const isHtmlMarkup = /<\/?[a-z][\s\S]*>/i.test(text);
    const cleanText = isCode
        ? `<pre class="ai-code-block">${text}</pre>`
        : isHtmlMarkup
            ? text
            : `<span class="ai-message-body">${formatAssistantResponse(text)}</span>`;

    const bubble = document.createElement('div');
    bubble.className = sender === 'user' ? 'ai-message-bubble ai-message-bubble-user' : 'ai-message-bubble ai-message-bubble-assistant';
    bubble.style.cssText = sender === 'user'
        ? 'background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.14);'
        : 'background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.14);';
    bubble.dataset.role = sender === 'user' ? 'user' : 'assistant';
    bubble.dataset.messageId = `msg-${Date.now()}-${messageToolbarSequence++}`;
    bubble.dataset.messageText = stripMessageMarkup(text || '');

    const senderName = sender === 'user' ? 'You' : 'Msofi AI';
    bubble.innerHTML = `
        <strong class="ai-bubble-label">${senderName}</strong>
        ${cleanText}
        ${buildMessageToolbarHtml(text, sender)}
    `;

    if (anchorBubble && anchorBubble.parentNode === viewport) {
        anchorBubble.insertAdjacentElement('afterend', bubble);
    } else {
        viewport.appendChild(bubble);
    }

    scrollMessagesViewport(true);
    return bubble;
}

/**
 * Executes communication with the secure msofi-ai Edge Function.
 * Implements a single automatic retry block on network/CORS interruptions.
 */
async function callMsofiEdgeFunction(messageText, mode, fileUrl, allowRetry = true) {
    try {
        const { data, error } = await supabase.functions.invoke('msofi-ai', {
            body: {
                message: messageText,
                mode: mode,
                file_url: fileUrl,
                conversation_id: activeConversationId
            }
        });

        if (error) throw error;
        if (!data || data.error) {
            throw new Error(data?.error || 'Msofi cloud engines returned empty response parameters.');
        }
        return data;
    } catch (err) {
        if (allowRetry) {
            console.warn("Msofi cloud connection interrupted. Retrying request execution once...", err.message);
            return await callMsofiEdgeFunction(messageText, mode, fileUrl, false);
        }
        throw err;
    }
}

async function performMsofiSubmission(messageText, mode, options = {}) {
    const isPremium = ['premium_user', 'super_admin'].includes(userProfile?.role);
    const currentAttachment = options.attachedFileInstance || attachedFileInstance;

    if (!messageText && !currentAttachment) return;

    if (mode === 'image' && !isPremium && currentDailyUsage.image_gen_count >= 2) {
        showFeedback({ title: 'Daily limit reached', body: 'Image generation is capped at 2 actions daily on the free tier. Please upgrade for more access.', tone: 'warning' });
        return;
    }

    if (currentAttachment && !isPremium && currentDailyUsage.pdf_upload_count >= 1) {
        showFeedback({ title: 'Daily limit reached', body: 'Document analysis is limited to 1 execution daily on the free tier. Please upgrade for more access.', tone: 'warning' });
        return;
    }

    if (!options.suppressUserBubble) {
        appendMessageBubble('user', messageText || `Uploaded attachment: ${currentAttachment?.name || 'document'}`);
    }

    let fileUrl = null;
    let typingBubble = null;

    try {
        if (currentAttachment) {
            appendMessageBubble('system', 'Uploading document, secure analysis in progress...');
            fileUrl = await storageAPI.uploadFile(currentAttachment, 'documents', 'ai_pdf');
            await incrementUsage('pdf_upload_count');
            document.getElementById('cancel-attachment-btn').click();
        }

        typingBubble = appendTypingIndicatorBubble(options.afterBubble || null);

        const libraryIntent = detectLibraryIntent(messageText);
        let responseText = '';

        if (pendingLibraryResults && /^\d+$/.test(messageText)) {
            const selectionIndex = Number(messageText);
            const selectedBook = pendingLibraryResults[selectionIndex - 1];

            if (selectedBook) {
                pendingLibraryResults = null;
                pendingLibraryQuery = null;
                responseText = await buildLibrarySelectionResultHtml(selectedBook);
            } else {
                responseText = `<div style="margin-bottom:8px; color:var(--text-secondary);">Selection is invalid. Please choose a valid number from the list below.</div>${buildLibrarySelectionListHtml(pendingLibraryResults, pendingLibraryQuery)}`;
            }
        } else if (pendingLibraryResults) {
            responseText = `<div style="margin-bottom:8px; color:var(--text-secondary);">Selection is invalid. Please choose a valid number from the list below.</div>${buildLibrarySelectionListHtml(pendingLibraryResults, pendingLibraryQuery)}`;
        } else if (libraryIntent.isLibraryRequest) {
            const searchResult = await searchMebvLibrary(libraryIntent.query, { category: libraryIntent.category });

            if (searchResult.ok && searchResult.results?.length) {
                pendingLibraryResults = searchResult.results;
                pendingLibraryQuery = libraryIntent.query;
                responseText = buildLibrarySelectionListHtml(searchResult.results, libraryIntent.query);
            } else {
                responseText = 'No matching book was found in the MEBV Library.';
            }
        } else {
            const data = await callMsofiEdgeFunction(messageText, mode, fileUrl);
            responseText = data.response || data.reply || '';

            if (data.conversation_id) {
                activeConversationId = data.conversation_id;
            }
        }

        await incrementUsage(mode === 'image' ? 'image_gen_count' : 'chat_count');

        if (typingBubble) {
            streamAssistantResponseBubble(typingBubble, responseText, mode === 'coding');
        } else {
            appendMessageBubble('msofi', responseText, mode === 'coding');
        }

        if (currentUser?.id) {
            await persistCurrentConversationTurn(messageText || `Uploaded attachment: ${currentAttachment?.name || 'document'}`, responseText);
        } else {
            ensureActiveConversation();
            addMessageToConversation(activeConversationId || createConversationId(), messageText || `Uploaded attachment: ${currentAttachment?.name || 'document'}`, responseText, null, new Date().toISOString());
            renderConversationHistoryList();
        }
    } catch (err) {
        if (typingBubble) {
            streamAssistantResponseBubble(typingBubble, `Workspace Error: Msofi cloud engines could not be reached. Details: ${err.message}`);
        } else {
            appendMessageBubble('msofi', `Workspace Error: Msofi cloud engines could not be reached. Details: ${err.message}`);
        }
    }
}

function setupMessagingSubmission() {
    const form = document.getElementById('chat-input-form');
    const input = document.getElementById('chat-text-input');
    const viewport = document.getElementById('messages-viewport');

    if (!form || !input || !viewport) return;
    if (form.dataset.msofiSubmissionBound === 'true') return;

    form.dataset.msofiSubmissionBound = 'true';
    viewport.dataset.msofiViewportBound = 'true';
    viewport.addEventListener('click', async (event) => {
        const downloadButton = event.target.closest('[data-book-download-url]');
        if (downloadButton) {
            event.preventDefault();
            const downloadUrl = downloadButton.dataset.bookDownloadUrl || '';
            const downloadName = downloadButton.dataset.bookDownloadName || '';
            await handleBookDownload(downloadUrl, downloadName);
            return;
        }

        const actionButton = event.target.closest('[data-message-action]');
        if (!actionButton) return;

        const bubble = actionButton.closest('.ai-message-bubble');
        const messageText = actionButton.dataset.messageText || bubble?.dataset.messageText || '';
        const action = actionButton.dataset.messageAction;

        if (action === 'copy') {
            try {
                await navigator.clipboard.writeText(messageText);
                showFeedback({ title: 'Copied to clipboard.', body: '', tone: 'success' });
            } catch (err) {
                showFeedback({ title: 'Copy failed', body: err?.message || 'Clipboard access was blocked.', tone: 'error' });
            }
            return;
        }

        if (action === 'thumbs-up' || action === 'thumbs-down') {
            const feedbackValue = action === 'thumbs-up' ? 'positive' : 'negative';
            const feedbackStore = JSON.parse(localStorage.getItem('msofi-ai-feedback') || '{}');
            feedbackStore[bubble?.dataset.messageId || `message-${Date.now()}`] = feedbackValue;
            localStorage.setItem('msofi-ai-feedback', JSON.stringify(feedbackStore));
            bubble?.querySelectorAll('[data-message-action="thumbs-up"], [data-message-action="thumbs-down"]').forEach((button) => {
                button.classList.toggle('is-selected', button.dataset.messageAction === action);
            });
            showFeedback({ title: feedbackValue === 'positive' ? 'Feedback recorded.' : 'Feedback recorded.', body: '', tone: 'success' });
            return;
        }

        if (action === 'share') {
            if (navigator.share) {
                try {
                    await navigator.share({ title: 'Msofi AI message', text: messageText });
                } catch (err) {
                    if (err?.name !== 'AbortError') {
                        showFeedback({ title: 'Share failed', body: err?.message || 'Unable to share right now.', tone: 'error' });
                    }
                }
            } else {
                try {
                    await navigator.clipboard.writeText(messageText);
                    showFeedback({ title: 'Message copied for sharing.', body: '', tone: 'success' });
                } catch (err) {
                    showFeedback({ title: 'Copy failed', body: err?.message || 'Clipboard access was blocked.', tone: 'error' });
                }
            }
            return;
        }

        if (action === 'regenerate') {
            const promptBubble = bubble?.dataset.role === 'assistant'
                ? bubble.previousElementSibling
                : bubble;
            const promptText = promptBubble?.dataset.messageText || messageText || '';
            if (!promptText) return;

            const oldAssistantBubble = bubble?.dataset.role === 'assistant'
                ? bubble
                : bubble?.nextElementSibling;

            if (oldAssistantBubble && oldAssistantBubble.classList.contains('ai-message-bubble')) {
                oldAssistantBubble.remove();
            }

            await performMsofiSubmission(promptText, document.getElementById('ai-mode-select').value, {
                suppressUserBubble: true,
                afterBubble: promptBubble || null
            });
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (form.dataset.msofiSubmitting === 'true') return;

        const messageText = input.value.trim();
        const mode = document.getElementById('ai-mode-select').value;

        if (!messageText && !attachedFileInstance) return;

        form.dataset.msofiSubmitting = 'true';
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
        }

        const typedMessage = messageText;
        input.value = '';
        input.style.height = '';
        input.focus();

        try {
            await performMsofiSubmission(typedMessage, mode, { attachedFileInstance });
        } finally {
            form.dataset.msofiSubmitting = 'false';
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
}