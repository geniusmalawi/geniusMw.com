// =====================================================================
// GENIUS MALAWI - REGISTRATION PORTAL JS CONTROLLER
// Location: js/register.js
// Purpose: Orchestrates splash screen dismissal, registration form validation,
//          pre-signup referral code verification, profile updates, and social sign-ups.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Page Loader
    dismissSplashLoader();

    // Session Pre-Check: Redirect active sessions to dashboard
    const session = await supabase.auth.getSession();
    if (session?.data?.session) {
        window.location.href = '../index.html';
        return;
    }

    // Initialize Event Bindings
    setupRegistrationForm();
    setupSSOButtons();
});

// ==========================================
// 1. SPLASH LOAD HANDLER
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('register-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

// ==========================================
// 2. HELPER: CENTRAL ALERT BOX
// ==========================================
function displayAlert(message, type = 'error') {
    const alertBox = document.getElementById('register-alert');
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
    const alertBox = document.getElementById('register-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
    }
}

// ==========================================
// 3. REGISTRATION PIPELINE
// ==========================================
function setupRegistrationForm() {
    const form = document.getElementById('register-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const fullName = document.getElementById('reg-fullname').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const password = document.getElementById('reg-password').value;
        const referralInput = document.getElementById('reg-referral').value.trim();

        // Client-side validations
        if (password.length < 6) {
            displayAlert('Password must be at least 6 characters in length.');
            return;
        }

        if (phone && (!phone.startsWith('+265') || phone.length < 12)) {
            displayAlert('Phone formatting constraint: Must begin with international country code (+265).');
            return;
        }

        try {
            displayAlert('Verifying network registries...', 'success');
            
            let referredByUUID = null;

            // Optional: Verify referral code if supplied
            if (referralInput) {
                const { data: refProfile, error: refErr } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('referral_code', referralInput.toUpperCase())
                    .single();

                if (refErr || !refProfile) {
                    displayAlert('Invalid Referral: The provided referral code does not match any active user.');
                    return;
                }
                referredByUUID = refProfile.id;
            }

            // Step 1: Sign Up with Auth Credentials
            const signUpResponse = await authAPI.signUp(email, password, fullName);
            
            if (!signUpResponse?.user) {
                throw new Error('An unexpected registration failure occurred.');
            }

            // Step 2: Sync profile fields initialized during trigger execution (ReferredBy & Phone)
            const updatePayload = {};
            if (phone) updatePayload.phone = phone;
            if (referredByUUID) updatePayload.referred_by = referredByUUID;

            if (Object.keys(updatePayload).length > 0) {
                const { error: updateErr } = await supabase
                    .from('profiles')
                    .update(updatePayload)
                    .eq('id', signUpResponse.user.id);

                if (updateErr) {
                    console.warn('Silent non-fatal update warning:', updateErr.message);
                }
            }

            displayAlert('Registration complete! Directing you to login portal...', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);

        } catch (error) {
            displayAlert(error.message || 'An error occurred during account creation. Please try again.');
        }
    });
}

// ==========================================
// 4. SOCIAL REGISTRATION (SSO) BINDINGS
// ==========================================
function setupSSOButtons() {
    const googleBtn = document.getElementById('sso-reg-google');
    const facebookBtn = document.getElementById('sso-reg-facebook');

    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            clearAlert();
            try {
                await authAPI.signInWithGoogle();
            } catch (error) {
                displayAlert(error.message || 'Google signup initialization failed.');
            }
        });
    }

    if (facebookBtn) {
        facebookBtn.addEventListener('click', async () => {
            clearAlert();
            try {
                await authAPI.signInWithFacebook();
            } catch (error) {
                displayAlert(error.message || 'Facebook signup initialization failed.');
            }
        });
    }
}