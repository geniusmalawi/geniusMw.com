// =====================================================================
// GENIUS MALAWI - PASSWORDS RESET JS CONTROLLER
// Location: js/reset-password.js
// Purpose: Orchestrates splash screen dismissal, handles password updates
//          using secure Supabase Auth triggers, and displays alerts.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Dismiss Reset Page Loader
    dismissSplashLoader();

    // Initialize Event Bindings
    setupResetFlow();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('reset-splash');
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
    const alertBox = document.getElementById('reset-alert');
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
    const alertBox = document.getElementById('reset-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
    }
}

// ==========================================
// 3. RESET SUBMISSION FLOW
// ==========================================
function setupResetFlow() {
    const form = document.getElementById('reset-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const password = document.getElementById('reset-password').value;
        const confirm = document.getElementById('reset-confirm').value;

        if (password.length < 6) {
            displayAlert('Password must be at least 6 characters in length.');
            return;
        }

        if (password !== confirm) {
            displayAlert('Verification Violation: Password entries do not match.');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.textContent = 'Updating password...';
            submitBtn.disabled = true;

            // Trigger password update for the currently authenticated session user
            const { error } = await supabase.auth.updateUser({ password: password });

            if (error) throw error;

            displayAlert('Password successfully updated. Directing you to login portal...', 'success');
            
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);

        } catch (err) {
            displayAlert(err.message || 'An error occurred during password update.');
            submitBtn.textContent = 'Update Password';
            submitBtn.disabled = false;
        }
    });
}