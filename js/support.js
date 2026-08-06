// =====================================================================
// GENIUS MALAWI - CUSTOMER SERVICE & TECHNICAL HELPDESK CONTROLLER
// Location: js/support.js
// Purpose: Handles splash screen dismissal, tab switching views,
//          authenticates support tickets and bug reporting sequences,
//          maps categories to secure database enums, and monitors forms.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI } from './supabase.js';

let currentUser = null;

// Explicit Database Enum Mapper (Ensuring compatibility with reports table constraints)
const SECURITY_ENUM_MAP = {
    // Ticket Category mappings
    billing: 'scam_seller',
    msofi_ai: 'ai_abuse',
    marketplace: 'fake_product',
    jobs: 'fake_product',
    account: 'inappropriate_profile',

    // Technical Log mappings
    bug: 'offensive_messages',
    feature: 'inappropriate_profile'
};

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Splash Screen
    dismissSplashLoader();

    // Session Ingestion (Non-blocking viewing allowed for FAQs, but submissions require auth)
    const session = await supabase.auth.getSession();
    if (session?.data?.session) {
        currentUser = session.user;
    }

    // Initialize Interactive Workspaces
    setupTabSwitching();
    setupTicketSubmission();
    setupBugSubmission();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('support-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

// ==========================================
// 2. TABBED VIEWPORT NAVIGATION
// ==========================================
function setupTabSwitching() {
    const tabs = {
        'tab-ticket': 'pane-ticket',
        'tab-faq': 'pane-faq',
        'tab-bug': 'pane-bug'
    };

    Object.keys(tabs).forEach(tabId => {
        const btn = document.getElementById(tabId);
        if (!btn) return;

        btn.addEventListener('click', () => {
            clearAlert();

            // Reset active indicators for all buttons
            Object.keys(tabs).forEach(id => {
                const targetBtn = document.getElementById(id);
                const targetPane = document.getElementById(tabs[id]);
                
                if (targetBtn && targetPane) {
                    targetBtn.style.borderColor = 'transparent';
                    targetBtn.style.color = 'var(--text-muted)';
                    targetPane.style.display = 'none';
                }
            });

            // Activate current selection
            btn.style.borderColor = 'var(--gold-base)';
            btn.style.color = 'var(--text-primary)';
            
            const activePane = document.getElementById(tabs[tabId]);
            if (activePane) {
                activePane.style.display = 'block';
                activePane.style.animation = 'fadeIn 0.3s ease';
            }
        });
    });
}

// ==========================================
// 3. CENTRAL ALERT FEEDBACK PANEL
// ==========================================
function displayAlert(message, type = 'error') {
    const alertBox = document.getElementById('support-alert');
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
    const alertBox = document.getElementById('support-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
    }
}

// ==========================================
// 4. HELPDESK TICKET SUBMISSIONS
// ==========================================
function setupTicketSubmission() {
    const form = document.getElementById('ticket-submission-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        // Guest Guard check
        if (!currentUser) {
            alert('Authentication required: You must log in to submit helpdesk support tickets.');
            window.location.href = 'login.html';
            return;
        }

        const category = document.getElementById('ticket-category').value;
        const subject = document.getElementById('ticket-subject').value.trim();
        const details = document.getElementById('ticket-details').value.trim();

        // Retrieve mapped enum code safely
        const dbEnumReason = SECURITY_ENUM_MAP[category] || 'inappropriate_profile';

        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Transmitting helpdesk logs...';
            submitBtn.disabled = true;

            // Register support ticket directly into core security dashboard tables
            const { error } = await supabase
                .from('reports')
                .insert({
                    reporter_id: currentUser.id,
                    reason: dbEnumReason,
                    target_table_name: 'support_tickets',
                    target_record_id: 'helpdesk_ticket',
                    additional_details: `Subject: ${subject} | Details: ${details}`
                });

            if (error) throw error;

            displayAlert('Ticket successfully published to helpdesk operations. System operators have been notified.', 'success');
            form.reset();

        } catch (err) {
            displayAlert(err.message || 'An unexpected error occurred during ticket submission.');
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Submit Secure Ticket';
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// 5. BUG LOGGING / TECHNICAL SUGGESTIONS
// ==========================================
function setupBugSubmission() {
    const form = document.getElementById('bug-submission-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        // Guest Guard check
        if (!currentUser) {
            alert('Authentication required: You must log in to publish platform feedback.');
            window.location.href = 'login.html';
            return;
        }

        const bugType = document.getElementById('bug-type').value;
        const subject = document.getElementById('bug-subject').value.trim();
        const details = document.getElementById('bug-details').value.trim();

        const dbEnumReason = SECURITY_ENUM_MAP[bugType] || 'offensive_messages';

        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Transmitting technical details...';
            submitBtn.disabled = true;

            const { error } = await supabase
                .from('reports')
                .insert({
                    reporter_id: currentUser.id,
                    reason: dbEnumReason,
                    target_table_name: 'technical_feedback',
                    target_record_id: `type_${bugType}`,
                    additional_details: `Subject: ${subject} | Description: ${details}`
                });

            if (error) throw error;

            displayAlert('Feedback logged successfully. Our software engineering team will inspect the parameters.', 'success');
            form.reset();

        } catch (err) {
            displayAlert(err.message || 'An unexpected error occurred during technical logging.');
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Publish Technical Feedback';
            submitBtn.disabled = false;
        }
    });
}