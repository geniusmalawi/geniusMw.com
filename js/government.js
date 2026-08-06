// =====================================================================
// GENIUS MALAWI - GOVERNMENT SERVICES CONTROLLER
// Location: js/government.js
// Purpose: Orchestrates splash screen dismissal, provides internal search
//          indexing across government guidelines, and registers metrics on
//          download events.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, storageAPI, validateFile } from './supabase.js';

let currentUser = null;
let currentPortals = [];
let currentHotlines = [];
let currentForms = [];

document.addEventListener('DOMContentLoaded', async () => {
    dismissSplashLoader();
    setupGuidelineSearch();
    await loadGovernmentContent();
    setupDownloadMetrics();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('gov-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

// ==========================================
// 2. GUIDELINE FILTERING ENGINE
// ==========================================
function setupGuidelineSearch() {
    // Note: We can overlay a small search interaction in the DOM or reuse a search mechanism
    // Let's implement an interactive, live page filter on guideline cards.
    const searchBar = document.createElement('div');
    searchBar.className = 'luxury-card';
    searchBar.style.cssText = 'padding: 16px; margin-bottom: 24px;';
    searchBar.innerHTML = `
        <div style="display:flex; gap:12px; align-items:center;">
            <input type="text" id="guide-internal-search" class="form-control" placeholder="Search guidelines (e.g., tax, passport, business)..." style="font-size:14px; padding:10px 14px;">
            <button id="clear-guide-search-btn" class="btn-secondary" style="padding:10px 16px; font-size:13px; display:none;">Clear</button>
        </div>
    `;

    const parentSection = document.querySelector('main.container section');
    if (!parentSection) return;

    // Insert search bar right before the first guidelines card
    parentSection.insertBefore(searchBar, parentSection.firstChild);

    const input = document.getElementById('guide-internal-search');
    const clearBtn = document.getElementById('clear-guide-search-btn');
    const cards = parentSection.querySelectorAll('.luxury-card:not(:first-child)');

    if (!input || !cards) return;

    const performFilter = () => {
        const query = input.value.toLowerCase().trim();
        
        if (query.length > 0) {
            clearBtn.style.display = 'block';
        } else {
            clearBtn.style.display = 'none';
        }

        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            if (text.includes(query)) {
                card.style.display = 'block';
                card.style.animation = 'fadeIn 0.3s ease';
            } else {
                card.style.display = 'none';
            }
        });
    };

    input.addEventListener('keyup', performFilter);

    clearBtn.addEventListener('click', () => {
        input.value = '';
        performFilter();
    });
}

// ==========================================
// 3. GOVERNMENT CONTENT LOADERS
// ==========================================
async function loadGovernmentContent() {
    try {
        const [{ data: portalsData, error: portalsErr }, { data: hotlinesData, error: hotlinesErr }, { data: formsData, error: formsErr }] = await Promise.all([
            supabase.from('government_portals').select('*').is('deleted_at', null).eq('is_active', true).order('display_order', { ascending: true }),
            supabase.from('government_hotlines').select('*').is('deleted_at', null).eq('is_active', true).eq('status', 'Active').order('display_order', { ascending: true }),
            supabase.from('government_forms').select('*').is('deleted_at', null).eq('is_active', true).eq('status', 'Active').order('created_at', { ascending: false })
        ]);

        if (portalsErr) throw portalsErr;
        if (hotlinesErr) throw hotlinesErr;
        if (formsErr) throw formsErr;

        currentPortals = portalsData || [];
        currentHotlines = hotlinesData || [];
        currentForms = formsData || [];

        renderPortals();
        renderHotlines();
        renderForms();
    } catch (err) {
        console.error('Failed to load government content:', err.message);
    }
}

function renderPortals() {
    const portalContainer = document.getElementById('government-portals-list');
    const emptyElement = document.getElementById('government-portals-empty');

    if (!portalContainer) return;

    if (!currentPortals.length) {
        if (emptyElement) {
            emptyElement.textContent = 'No official government portals are available at the moment.';
        }
        return;
    }

    const sortedPortals = [...currentPortals].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

    portalContainer.innerHTML = sortedPortals.map(item => `
        <div class="luxury-card" style="padding: 22px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                <div>
                    <span class="badge badge-verified" style="margin-bottom: 10px;">${item.institution}</span>
                    <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--text-primary);">${item.button_label || 'Official Portal'}</h3>
                    <p style="font-size: 13px; color: var(--text-muted); line-height: 1.7; margin-bottom: 10px;">${item.description || 'Official government service portal managed by Genius Malawi.'}</p>
                </div>
                <a href="${item.website_url || '#'}" target="_blank" class="btn-secondary" style="align-self: start; padding: 10px 18px; font-size: 12px;">${item.website_url ? 'Visit Portal' : 'Unavailable'}</a>
            </div>
        </div>
    `).join('');
}

function renderHotlines() {
    const container = document.getElementById('emergency-hotlines-list');
    if (!container) return;

    if (!currentHotlines.length) {
        container.innerHTML = '<p style="font-size: 12px; color: var(--text-muted);">No active hotlines available right now.</p>';
        return;
    }

    container.innerHTML = currentHotlines.map(item => {
        const callLink = item.hotline_number ? `<a href="tel:${item.hotline_number}" class="btn-primary" style="padding: 6px 12px; font-size: 11px; background: var(--heritage-red); color: #fff; box-shadow: none;">Call</a>` : '';
        const whatsappLink = item.whatsapp_number ? `<a href="https://wa.me/${item.whatsapp_number.replace(/[^0-9]/g, '')}" target="_blank" class="btn-secondary" style="padding: 6px 12px; font-size: 11px;">WhatsApp</a>` : '';
        const copyBtn = item.hotline_number ? `<button class="btn-secondary" data-copy="${item.hotline_number}" style="padding: 6px 12px; font-size: 11px;">Copy</button>` : '';
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 8px; gap: 12px;">
                <div style="flex: 1;">
                    <strong style="font-size: 14px; color: var(--text-primary); display: block;">${item.institution_name}</strong>
                    <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">${item.description || item.category || 'Emergency contact'}</span>
                    <span style="font-size: 11px; color: var(--gold-base); display: block; margin-top: 4px;">${item.hotline_number || 'No hotline listed'}</span>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${callLink}
                    ${whatsappLink}
                    ${copyBtn}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(btn.getAttribute('data-copy'));
                btn.textContent = 'Copied';
                setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
            } catch (err) {
                console.warn('Copy failed:', err.message);
            }
        });
    });
}

function renderForms() {
    const list = document.getElementById('government-forms-list');
    const institutionFilter = document.getElementById('gov-form-institution-filter');
    const categoryFilter = document.getElementById('gov-form-category-filter');
    const searchInput = document.getElementById('gov-form-search');

    if (!list) return;

    if (!currentForms.length) {
        list.innerHTML = '<p style="font-size: 12px; color: var(--text-muted);">No government forms available at the moment.</p>';
        return;
    }

    const institutions = [...new Set(currentForms.map(item => item.institution).filter(Boolean))];
    const categories = [...new Set(currentForms.map(item => item.category).filter(Boolean))];

    if (institutionFilter) {
        institutionFilter.innerHTML = '<option value="all">All Institutions</option>' + institutions.map(item => `<option value="${item}">${item}</option>`).join('');
    }
    if (categoryFilter) {
        categoryFilter.innerHTML = '<option value="all">All Categories</option>' + categories.map(item => `<option value="${item}">${item}</option>`).join('');
    }

    const applyFilters = () => {
        const query = (searchInput?.value || '').toLowerCase().trim();
        const institution = institutionFilter?.value || 'all';
        const category = categoryFilter?.value || 'all';

        const filtered = currentForms.filter(item => {
            const matchesQuery = !query || [item.title, item.description, item.institution, item.category].join(' ').toLowerCase().includes(query);
            const matchesInstitution = institution === 'all' || item.institution === institution;
            const matchesCategory = category === 'all' || item.category === category;
            return matchesQuery && matchesInstitution && matchesCategory;
        });

        if (!filtered.length) {
            list.innerHTML = '<p style="font-size: 12px; color: var(--text-muted);">No forms match your current filters.</p>';
            return;
        }

        list.innerHTML = filtered.map(item => `
            <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 12px;">
                <strong style="font-size: 13px; color: var(--text-primary); display: block; margin-bottom: 4px;">${item.title}</strong>
                <span style="display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">${item.institution} &bull; ${item.category}</span>
                <span style="display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">${item.description || 'Official government document'}</span>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <a href="${item.file_url || '#'}" target="_blank" class="btn-secondary" style="padding: 6px 12px; font-size: 11px;">Preview / Download</a>
                </div>
            </div>
        `).join('');
    };

    [searchInput, institutionFilter, categoryFilter].forEach(element => {
        element?.addEventListener('input', applyFilters);
        element?.addEventListener('change', applyFilters);
    });

    applyFilters();
}

// ==========================================
// 4. SECURE SYSTEM DOWNLOAD METRICS
// ==========================================
function setupDownloadMetrics() {
    const formsList = document.getElementById('government-forms-list');
    if (!formsList) return;

    formsList.addEventListener('click', async (event) => {
        const link = event.target.closest('a[href$=".pdf"], a[href$=".PDF"]');
        if (!link) return;

        const formElement = link.closest('div');
        const formName = formElement?.querySelector('strong')?.textContent || 'Unknown Form';
        const fileUrl = link.getAttribute('href');

        try {
            const session = await supabase.auth.getSession();
            const userId = session?.data?.session?.user?.id || null;

            await supabase.from('audit_logs').insert({
                user_id: userId,
                action: 'Download Government Form',
                table_name: 'government_forms',
                record_id: fileUrl,
                new_data: { form_name: formName, url: fileUrl }
            });
        } catch (err) {
            console.warn('Non-fatal metrics log exception:', err.message);
        }
    });
}

// ==========================================
// 5. ADMIN MANAGEMENT CONTROLS
// ==========================================
function setupAdminControls() {
    // Removed admin-specific panel logic from the public government page.
    // Government content is rendered dynamically for public users only.
}

async function loadAdminManagers() {
    try {
        const [{ data: portalsData, error: portalsErr }, { data: hotlinesData, error: hotlinesErr }, { data: formsData, error: formsErr }] = await Promise.all([
            supabase.from('government_portals').select('*').is('deleted_at', null).order('display_order', { ascending: true }),
            supabase.from('government_hotlines').select('*').is('deleted_at', null).order('display_order', { ascending: true }),
            supabase.from('government_forms').select('*').is('deleted_at', null).order('created_at', { ascending: false })
        ]);

        if (portalsErr) throw portalsErr;
        if (hotlinesErr) throw hotlinesErr;
        if (formsErr) throw formsErr;

        renderAdminPortalManager(portalsData || []);
        renderAdminHotlineManager(hotlinesData || []);
        renderAdminFormManager(formsData || []);
    } catch (err) {
        console.error('Admin manager load failed:', err.message);
    }
}

function renderAdminPortalManager(portals) {
    const list = document.getElementById('gov-admin-portals-list');
    if (!list) return;
    list.innerHTML = portals.map(item => `
        <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 10px; margin-bottom: 10px;">
            <strong style="font-size: 13px; color: var(--text-primary);">${item.institution}</strong>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${item.button_label}</div>
            <div style="font-size: 11px; color: var(--gold-base); margin-top: 4px;">${item.website_url}</div>
        </div>
    `).join('');
}

function renderAdminHotlineManager(hotlines) {
    const list = document.getElementById('gov-admin-hotlines-list');
    if (!list) return;
    list.innerHTML = hotlines.map(item => `
        <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 10px; margin-bottom: 10px;">
            <strong style="font-size: 13px; color: var(--text-primary);">${item.institution_name}</strong>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${item.hotline_number || 'No hotline'}</div>
            <div style="font-size: 11px; color: var(--gold-base); margin-top: 4px;">${item.category} &bull; ${item.status}</div>
        </div>
    `).join('');
}

function renderAdminFormManager(forms) {
    const list = document.getElementById('gov-admin-forms-list');
    if (!list) return;
    list.innerHTML = forms.map(item => `
        <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 10px; margin-bottom: 10px;">
            <strong style="font-size: 13px; color: var(--text-primary);">${item.title}</strong>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${item.institution} &bull; ${item.category}</div>
            <div style="font-size: 11px; color: var(--gold-base); margin-top: 4px;">${item.file_url || 'No file yet'}</div>
        </div>
    `).join('');
}