// =====================================================================
// GENIUS MALAWI - MY PROFILE WORKSPACE INTERACTIVE JS CONTROLLER
// Location: js/profile.js
// Purpose: Implements profile variables loading, handles live cover and
//          avatar uploads, coordinates identity metadata form submissions,
//          copies referral tokens, and handles account soft deactivation.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI, storageAPI, validateFile, publishProfileUpdate } from './supabase.js';

let currentUser = null;
let userProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Splash Screen
    dismissSplashLoader();

    // 1. Strict Security Guardrail: User must be signed in to see page
    const session = await authAPI.checkSession(true);
    if (!session) return;
    currentUser = session.user;

    // 2. Initialize Profile
    await loadUserProfileData();
    setupMediaUploaders();
    setupReferralCopy();
    setupFormSubmission();
    setupAccountDeactivation();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('profile-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

// ==========================================
// 2. CENTRAL FEEDBACK ALERTS PANEL
// ==========================================
function displayAlert(message, type = 'error') {
    const alertBox = document.getElementById('profile-alert');
    if (!alertBox) return;

    alertBox.textContent = message;
    alertBox.style.display = 'block';

    if (type === 'error') {
        alertBox.style.backgroundColor = 'rgba(226, 28, 38, 0.15)';
        alertBox.style.color = 'var(--heritage-red)';
        alertBox.style.border = '1px solid rgba(226, 28, 38, 0.3)';
    } else {
        alertBox.style.backgroundColor = 'rgba(0, 169, 92, 0.15)';
        alertBox.style.color = 'var(--heritage-green)';
        alertBox.style.border = '1px solid rgba(0, 169, 92, 0.3)';
    }
}

function clearAlert() {
    const alertBox = document.getElementById('profile-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
    }
}

// ==========================================
// 3. PROFILE DATA INGESTION & BINDINGS
// ==========================================
async function loadUserProfileData() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;
        userProfile = data;

        // Populate header details
        document.getElementById('header-fullname').textContent = userProfile.full_name;
        document.getElementById('header-genius-id').textContent = userProfile.genius_id;
        document.getElementById('referral-code-display').value = userProfile.referral_code;

        // Render role designation badge
        const badgeContainer = document.getElementById('header-role-badge');
        if (badgeContainer) {
            const isPremium = ['premium_user', 'super_admin'].includes(userProfile.role);
            badgeContainer.innerHTML = isPremium 
                ? `<span class="badge badge-premium">PREMIUM USER</span>` 
                : `<span class="badge badge-secondary" style="border-color:rgba(255,255,255,0.1);">STANDARD TIER</span>`;
        }

        // Set cover and avatar graphics dynamically if resolved
        if (userProfile.profile_photo) {
            document.getElementById('profile-avatar-img').src = userProfile.profile_photo;
        }
        if (userProfile.cover_url) {
            document.getElementById('profile-cover-img').src = userProfile.cover_url;
        }

        // Populate Form Fields
        document.getElementById('profile-fullname').value = userProfile.full_name;
        document.getElementById('profile-username').value = userProfile.username;
        document.getElementById('profile-email').value = currentUser.email;
        document.getElementById('profile-phone').value = userProfile.phone || '';
        document.getElementById('profile-dob').value = userProfile.date_of_birth || '';
        document.getElementById('profile-district').value = userProfile.district || '';
        document.getElementById('profile-occupation').value = userProfile.occupation || '';
        document.getElementById('profile-education').value = userProfile.education || '';
        document.getElementById('profile-bio').value = userProfile.bio || '';

    } catch (err) {
        console.error('Error fetching profile variables:', err.message);
        displayAlert('Failed to synchronize user profiles metadata.');
    }
}

// ==========================================
// 4. ATTACHMENT AND GRAPHIC UPLOADS (LIVE UPDATES)
// ==========================================
function setupMediaUploaders() {
    const avatarUploader = document.getElementById('avatar-uploader');
    const coverUploader = document.getElementById('cover-uploader');

    if (avatarUploader) {
        avatarUploader.addEventListener('change', async () => {
            clearAlert();
            const file = avatarUploader.files[0];
            if (!file) return;

            // Enforce format validation checks from SDK
            const validation = validateFile(file, 'avatar');
            if (!validation.valid) {
                displayAlert(validation.error);
                return;
            }

            try {
                displayAlert('Uploading avatar graphic, please wait... 0%', 'success');

                const uploadedUrl = await storageAPI.uploadFile(file, 'marketplace', 'avatar', {
                    onProgress: ({ percent }) => {
                        const displayPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
                        displayAlert(`Uploading avatar graphic, please wait... ${displayPercent}%`, 'success');
                    }
                });

                const { error } = await supabase
                    .from('profiles')
                    .update({ profile_photo: uploadedUrl })
                    .eq('id', currentUser.id);

                if (error) throw error;

                userProfile = { ...(userProfile || {}), profile_photo: uploadedUrl };

                // Sync local graphic node
                document.getElementById('profile-avatar-img').src = uploadedUrl;
                publishProfileUpdate({ profile_photo: uploadedUrl });
                displayAlert('Profile Avatar successfully updated.', 'success');

            } catch (err) {
                displayAlert(err.message || 'An error occurred during avatar upload.');
            }
        });
    }

    if (coverUploader) {
        coverUploader.addEventListener('change', async () => {
            clearAlert();
            const file = coverUploader.files[0];
            if (!file) return;

            const validation = validateFile(file, 'cover');
            if (!validation.valid) {
                displayAlert(validation.error);
                return;
            }

            try {
                displayAlert('Uploading cover graphic, please wait...', 'success');
                
                const uploadedUrl = await storageAPI.uploadFile(file, 'marketplace', 'cover');

                const { error } = await supabase
                    .from('profiles')
                    .update({ cover_url: uploadedUrl })
                    .eq('id', currentUser.id);

                if (error) throw error;

                document.getElementById('profile-cover-img').src = uploadedUrl;
                displayAlert('Profile Cover successfully updated.', 'success');

            } catch (err) {
                displayAlert(err.message || 'An error occurred during cover upload.');
            }
        });
    }
}

// ==========================================
// 5. REFERRAL CODE SHARING
// ==========================================
function setupReferralCopy() {
    const copyBtn = document.getElementById('copy-ref-code-btn');
    if (!copyBtn) return;

    copyBtn.addEventListener('click', () => {
        const code = document.getElementById('referral-code-display').value;
        const refUrl = `${window.location.origin}/pages/register.html?ref=${code}`;

        navigator.clipboard.writeText(refUrl).then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.style.background = 'var(--heritage-green)';
            
            setTimeout(() => {
                copyBtn.textContent = 'Copy Link';
                copyBtn.style.background = 'var(--gold-gradient)';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy referral link:', err);
        });
    });
}

// ==========================================
// 6. MAIN IDENTITY FORM SUBMISSIONS
// ==========================================
function setupFormSubmission() {
    const form = document.getElementById('profile-update-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const full_name = document.getElementById('profile-fullname').value.trim();
        const username = document.getElementById('profile-username').value.trim();
        const phone = document.getElementById('profile-phone').value.trim();
        const dob = document.getElementById('profile-dob').value;
        const district = document.getElementById('profile-district').value;
        const occupation = document.getElementById('profile-occupation').value.trim();
        const education = document.getElementById('profile-education').value.trim();
        const bio = document.getElementById('profile-bio').value.trim();

        // Enforce validations
        if (!full_name || !username) {
            displayAlert('Identity Constraint: Full Name and Username are mandatory.');
            return;
        }

        if (phone && (!phone.startsWith('+265') || phone.length < 12)) {
            displayAlert('Formatting Violation: Phone number must begin with country code +265.');
            return;
        }

        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Saving changes...';
            submitBtn.disabled = true;

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name,
                    username,
                    phone: phone || null,
                    date_of_birth: dob || null,
                    district: district || null,
                    occupation: occupation || null,
                    education: education || null,
                    bio: bio || null
                })
                .eq('id', currentUser.id);

            if (error) throw error;

            displayAlert('Identity credentials successfully saved.', 'success');
            await loadUserProfileData(); // Reload values on screen

        } catch (err) {
            displayAlert(err.message || 'An unexpected error occurred during database updates.');
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Save Identity Credentials';
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// 7. ACCOUNT SOFT DEACTIVATION FLOW (30 DAYS HOLD)
// ==========================================
function setupAccountDeactivation() {
    const deleteBtn = document.getElementById('delete-account-btn');
    if (!deleteBtn) return;

    deleteBtn.addEventListener('click', async () => {
        const confirmAction = confirm('Security Protocol Check: Are you absolutely certain you want to deactivate your profile? Your account will be hidden and put on a 30-day soft hold, during which you can reactivate it. Proceed?');
        if (!confirmAction) return;

        try {
            displayAlert('Deactivating profile records...', 'error');

            // Flag soft-delete by setting deleted_at timestamp in profiles table
            const { error } = await supabase
                .from('profiles')
                .update({ deleted_at: new Date() })
                .eq('id', currentUser.id);

            if (error) throw error;

            // Trigger remote session termination and exit to home page
            await authAPI.signOut();
            window.location.replace('/');

        } catch (err) {
            displayAlert(err.message || 'An error occurred during account deactivation.');
        }
    });
}