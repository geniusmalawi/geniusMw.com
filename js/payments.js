// =====================================================================
// GENIUS MALAWI - PREMIUM UPGRADE & BILLING CONTROLLER
// Location: js/payments.js
// Purpose: Implements payment reference keys, manages instruction sets,
//          validates and uploads receipt proofs, and writes billing ledger logs.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI, storageAPI, validateFile } from './supabase.js';

let currentUser = null;
let currentReference = '';

// Instructions definitions for each transfer method
const METHOD_INSTRUCTIONS = {
    airtel_money: `
        <strong style="color:var(--gold-light); display:block; margin-bottom:8px; font-size:14px; text-transform:uppercase;">Airtel Money Guide</strong>
        1. Dial <strong>*211#</strong> on your Airtel phone.<br>
        2. Select Send Money.<br>
        3. Enter Number: <strong style="color:var(--text-primary);">0993984344</strong>.<br>
        4. Enter Amount: <strong>MWK 5,000</strong>.<br>
        5. Confirm transfer and capture a screenshot of the confirmation SMS to upload below.
    `,
    tnm_mpamba: `
        <strong style="color:var(--gold-light); display:block; margin-bottom:8px; font-size:14px; text-transform:uppercase;">TNM Mpamba Guide</strong>
        1. Dial <strong>*444#</strong> on your TNM phone.<br>
        2. Select Send Money.<br>
        3. Enter Number: <strong style="color:var(--text-primary);">0897228943</strong>.<br>
        4. Enter Amount: <strong>MWK 5,000</strong>.<br>
        5. Confirm transfer and capture a screenshot of the confirmation SMS to upload below.
    `,
    bank_transfer: `
        <strong style="color:var(--gold-light); display:block; margin-bottom:8px; font-size:14px; text-transform:uppercase;">National Bank Guide</strong>
        1. Access your online banking terminal or mobile banking application.<br>
        2. Bank Name: <strong style="color:var(--text-primary);">National Bank of Malawi</strong>.<br>
        3. Account Number: <strong style="color:var(--text-primary);">1011288266</strong>.<br>
        4. Transfer Amount: <strong>MWK 5,000</strong>.<br>
        5. Reference: Enter your unique Reference Number displayed above.<br>
        6. Export the transaction receipt as a PDF or image and upload below.
    `,
    visa: `
        <strong style="color:var(--gold-light); display:block; margin-bottom:8px; font-size:14px; text-transform:uppercase;">Visa & MasterCard Guide</strong>
        1. Complete a secure manual debit/wire transfer from your card online banking app to our National Bank account.<br>
        2. Account Number: <strong style="color:var(--text-primary);">1011288266</strong>.<br>
        3. Reference: Enter your unique Reference Number displayed above.<br>
        4. Save the transactional PDF receipt and upload below.
    `
};

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Splash Screen
    dismissSplashLoader();

    // 1. Guard check session: User must be signed in to see page
    const session = await authAPI.checkSession(true);
    if (!session) return;
    currentUser = session.user;

    // 2. Generate unique reference and configure views
    initBillingDisplay();
    setupBillingToggles();
    setupInstructionSwitcher();
    setupProofSubmission();
});

// ==========================================
// 1. SPLASH LOADER TRANSITION
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('payment-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

// ==========================================
// 2. REFERENCE KEY GENERATOR
// ==========================================
function initBillingDisplay() {
    const refDisplay = document.getElementById('billing-reference-display');
    if (!refDisplay) return;

    // Generate unique random reference key (Capitalized Alpha-Numeric)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randCode = '';
    for (let i = 0; i < 6; i++) {
        randCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    currentReference = `GM-PAY-${randCode}`;
    refDisplay.textContent = currentReference;
}

// ==========================================
// 3. UI VIEW TOGGLES & TRIGGERS
// ==========================================
function setupBillingToggles() {
    const activateBtn = document.getElementById('activate-billing-btn');
    const billingSection = document.getElementById('billing-step-section');

    if (activateBtn && billingSection) {
        activateBtn.addEventListener('click', () => {
            billingSection.style.display = 'block';
            
            // Smoothly scroll down to the checkout dashboard
            billingSection.scrollIntoView({ behavior: 'smooth' });
        });
    }
}

function setupInstructionSwitcher() {
    const methodSelect = document.getElementById('payment-method-select');
    const instructionBox = document.getElementById('method-instruction-box');

    if (!methodSelect || !instructionBox) return;

    // Set initial display
    instructionBox.innerHTML = METHOD_INSTRUCTIONS[methodSelect.value];

    // Listen to selections
    methodSelect.addEventListener('change', () => {
        const method = methodSelect.value;
        if (METHOD_INSTRUCTIONS[method]) {
            instructionBox.innerHTML = METHOD_INSTRUCTIONS[method];
        }
    });
}

// ==========================================
// 4. FEEDBACK ALERT BOX
// ==========================================
function displayAlert(message, type = 'error') {
    const alertBox = document.getElementById('billing-alert');
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
    const alertBox = document.getElementById('billing-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
    }
}

// ==========================================
// 5. PROOF SUBMISSION & STORAGE DISPATCH
// ==========================================
function setupProofSubmission() {
    const form = document.getElementById('proof-submission-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const method = document.getElementById('payment-method-select').value;
        const proofFile = document.getElementById('billing-proof-file').files[0];

        if (!proofFile) {
            displayAlert('Verification Constraint: Receipt document file must be selected.');
            return;
        }

        // Validate formatting rules using standard checker in supabase.js
        const validation = validateFile(proofFile, 'payment_proof');
        if (!validation.valid) {
            displayAlert(validation.error);
            return;
        }

        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Transmitting verification file...';
            submitBtn.disabled = true;

            displayAlert('Uploading document receipt, please wait...', 'success');

            // Step 1: Upload verification receipt to payments bucket
            const uploadedUrl = await storageAPI.uploadFile(proofFile, 'payments', 'payment_proof');

            displayAlert('Inserting ledger metadata...', 'success');

            // Step 2: Register entry in payments table holding a pending state
            const { error } = await supabase
                .from('payments')
                .insert({
                    user_id: currentUser.id,
                    reference_number: currentReference,
                    amount: 5000.00, // Standard Premium Subscription Flat-rate
                    payment_method: method,
                    proof_url: uploadedUrl,
                    status: 'pending' // Admin must audit and confirm
                });

            if (error) throw error;

            displayAlert('Billing transaction registered. Super Admin has been notified to manually inspect and verify payment confirmation.', 'success');
            
            // Clean interface state
            form.reset();
            initBillingDisplay(); // Renew invoice code for potential future actions

        } catch (err) {
            displayAlert(err.message || 'An error occurred during billing submission.');
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Submit Proof of Payment';
            submitBtn.disabled = false;
        }
    });
}