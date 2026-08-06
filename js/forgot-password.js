// =====================================================================
// GENIUS MALAWI - PASSWORDS RECOVERY JS CONTROLLER
// Location: js/forgot-password.js
// Purpose: Orchestrates splash screen dismissal, handles email resets
//          requests using secure Supabase Auth triggers, and displays alerts.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Dismiss Recovery Page Loader
    dismissSplashLoader();

    // Initialize Event Bindings
    setupRecoveryFlow();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('forgot-splash');
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
    const alertBox = document.getElementById('recovery-alert');
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
    const alertBox = document.getElementById('recovery-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
    }
}

// ==========================================
// 3. RECOVERY SUBMISSION FLOW
// ==========================================
function setupRecoveryFlow() {
    const form = document.getElementById('recovery-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const email = document.getElementById('recovery-email').value.trim();

        if (!email) {
            displayAlert('Validation Constraint: Email address is required to proceed.');
            return;
        }

        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Transmitting request...';
            submitBtn.disabled = true;

            // Trigger reset link email generation
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/pages/reset-password.html`
            });

            if (error) throw error;

            displayAlert('A password recovery verification link has been dispatched to your email address. Please inspect your inbox and spam folder directories.', 'success');
            form.reset();

        } catch (err) {
            displayAlert(err.message || 'An error occurred during password recovery dispatch.');
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Send Reset Link';
            submitBtn.disabled = false;
        }
    });
}