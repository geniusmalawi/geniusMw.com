// =====================================================================
// GENIUS MALAWI - LOGIN PORTAL INTERACTIVE JS CONTROLLER
// Location: js/login.js
// Purpose: Orchestrates splash dismissals, email/password validation flows,
//          two-step OTP phone authentication sequence, and SSO redirects.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Login Page Loader
    dismissSplashLoader();

    // Session Pre-Check: Prevent authenticated users from visiting login
    const session = await supabase.auth.getSession();
    if (session?.data?.session) {
        window.location.href = '../index.html';
        return;
    }

    // Initialize Event Bindings
    setupAuthMethodTabs();
    setupEmailForm();
    setupPhoneOTPFlow();
    setupSSOButtons();
});

// ==========================================
// 1. SPLASH LOAD HANDLER
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('login-splash');
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
    const alertBox = document.getElementById('auth-alert');
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
    const alertBox = document.getElementById('auth-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
    }
}

// ==========================================
// 3. TAB CONTROLLERS
// ==========================================
function setupAuthMethodTabs() {
    const tabEmail = document.getElementById('tab-email');
    const tabPhone = document.getElementById('tab-phone');
    const emailForm = document.getElementById('email-login-form');
    const phoneForm = document.getElementById('phone-login-form');

    if (!tabEmail || !tabPhone || !emailForm || !phoneForm) return;

    tabEmail.addEventListener('click', () => {
        clearAlert();
        emailForm.style.display = 'block';
        phoneForm.style.display = 'none';

        // Tab Styles Update
        tabEmail.style.borderBottom = '2px solid var(--gold-base)';
        tabEmail.style.color = 'var(--text-primary)';
        tabPhone.style.borderBottom = 'none';
        tabPhone.style.color = 'var(--text-muted)';
    });

    tabPhone.addEventListener('click', () => {
        clearAlert();
        emailForm.style.display = 'none';
        phoneForm.style.display = 'block';

        // Tab Styles Update
        tabPhone.style.borderBottom = '2px solid var(--gold-base)';
        tabPhone.style.color = 'var(--text-primary)';
        tabEmail.style.borderBottom = 'none';
        tabEmail.style.color = 'var(--text-muted)';
    });
}

// ==========================================
// 4. EMAIL & PASSWORD LOGIN FLOW
// ==========================================
function setupEmailForm() {
    const form = document.getElementById('email-login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            displayAlert('Email address and password must be supplied.');
            return;
        }

        try {
            // Initiate Supabase Auth sign-in
            await authAPI.signIn(email, password);
            
            displayAlert('Authentication successful. Routing to Super Dashboard...', 'success');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1000);
        } catch (error) {
            displayAlert(error.message || 'An error occurred during secure sign-in. Please check credentials.');
        }
    });
}

// ==========================================
// 5. PHONE OTP LOGIN SEQUENCE (TWO-STEP ACTION)
// ==========================================
function setupPhoneOTPFlow() {
    const sendOtpBtn = document.getElementById('send-otp-btn');
    const changePhoneBtn = document.getElementById('change-phone-btn');
    const phoneForm = document.getElementById('phone-login-form');
    
    const phoneStep = document.getElementById('phone-number-step');
    const otpStep = document.getElementById('phone-otp-step');
    
    const phoneInput = document.getElementById('login-phone');
    const otpInput = document.getElementById('login-otp');

    if (!sendOtpBtn || !changePhoneBtn || !phoneForm || !phoneStep || !otpStep) return;

    let targetPhoneNumber = '';

    // Step A: Send OTP to Device
    sendOtpBtn.addEventListener('click', async () => {
        clearAlert();
        const phone = phoneInput.value.trim();

        // Security check: Must fit Malawian country designation structure
        if (!phone.startsWith('+265') || phone.length < 12) {
            displayAlert('Formatting Violation: System requires international phone syntax prefix starting with +265.');
            return;
        }

        try {
            targetPhoneNumber = phone;
            displayAlert('Contacting system registry to generate session keys...', 'success');
            
            await authAPI.sendPhoneOTP(phone);

            displayAlert(`A 6-digit session key has been dispatched to ${phone}.`, 'success');
            
            // UI Switch steps
            phoneStep.style.display = 'none';
            otpStep.style.display = 'block';
            otpInput.focus();
        } catch (error) {
            displayAlert(error.message || 'An error occurred while requesting verification keys.');
        }
    });

    // Step B: Submit Verification and Log In
    phoneForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const otpToken = otpInput.value.trim();
        if (otpToken.length !== 6) {
            displayAlert('Formatting Violation: Key consists of exactly 6 digits.');
            return;
        }

        try {
            await authAPI.verifyPhoneOTP(targetPhoneNumber, otpToken);

            displayAlert('Profile key verified. Access granted.', 'success');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1000);
        } catch (error) {
            displayAlert(error.message || 'Verification failed. The code provided may be invalid or expired.');
        }
    });

    // Reversion Action: Use different phone configuration
    changePhoneBtn.addEventListener('click', () => {
        clearAlert();
        phoneStep.style.display = 'block';
        otpStep.style.display = 'none';
        otpInput.value = '';
        phoneInput.focus();
    });
}

// ==========================================
// 6. FEDERATED SOCIAL SIGN-ON (SSO) BINDINGS
// ==========================================
function setupSSOButtons() {
    const googleBtn = document.getElementById('sso-google');
    const facebookBtn = document.getElementById('sso-facebook');

    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            clearAlert();
            try {
                await authAPI.signInWithGoogle();
            } catch (error) {
                displayAlert(error.message || 'Google Single-Sign-On redirect could not be initialized.');
            }
        });
    }

    if (facebookBtn) {
        facebookBtn.addEventListener('click', async () => {
            clearAlert();
            try {
                await authAPI.signInWithFacebook();
            } catch (error) {
                displayAlert(error.message || 'Facebook Single-Sign-On redirect could not be initialized.');
            }
        });
    }
}