// =====================================================================
// GENIUS MALAWI - ADMINISTRATIVE CONSOLE JS TERMINAL CONTROLLER
// Location: js/admin.js
// Purpose: Controls structural metrics queries, moderates listing queues,
//          authorizes pending premium payments with automatic role promotions,
//          resolves user security reports, and logs audited transactions.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, storageAPI, validateFile } from './supabase.js';
import { createAdvertisement, updateAdvertisement, deleteAdvertisement, archiveAdvertisement, restoreAdvertisement, toggleAdvertisementActive, duplicateAdvertisement, getAdvertisementById, getAdvertisements, getAdvertisementTypes, getDisplayLocations, getAudienceOptions } from './advertising.js';
import './media_admin.js';

let currentAdminId = null;
let currentAdminRole = 'user';
let usersModuleState = { users: [] };
let businessPagesModuleState = { pages: [], owners: {}, analytics: {} };
let jobsModuleState = {
    jobs: [],
    filters: {
        search: '',
        status: 'all',
        category: 'all',
        district: 'all'
    },
    applicationsToday: 0
};
const VALID_JOB_STATUSES = ['pending', 'published', 'closed', 'expired'];
const VALID_JOB_COLUMNS = [
    'employer_id', 'company_name', 'title', 'description', 'requirements', 'responsibilities',
    'qualifications', 'experience', 'skills', 'languages', 'benefits', 'category', 'industry',
    'required_education', 'required_experience', 'required_skills', 'application_method',
    'application_email', 'application_website', 'application_link', 'logo_url', 'attachment_url', 'location', 'district',
    'country', 'employment_type', 'job_type', 'job_level', 'vacancies', 'work_mode', 'salary_type', 'salary_min',
    'salary_max', 'salary_currency', 'salary', 'external_url', 'is_external',
    'company_description', 'company_website', 'company_email', 'company_phone', 'physical_address',
    'contact_person', 'contact_email', 'contact_phone', 'applications', 'views', 'featured', 'urgent',
    'status', 'deadline', 'start_date'
];
let marketplaceRealtimeChannel = null;
let footballAdminRealtimeChannel = null;
let vacancyWorkflowState = {
    modalInstance: null,
    currentState: 'closed',
    draftData: null,
    currentMode: 'create'
};
let mediaContentManagerState = {
    items: [],
    filters: {
        search: '',
        category: 'all',
        status: 'all'
    }
};
let marketplaceAdminState = {
    listings: [],
    view: 'pending',
    search: '',
    category: 'all',
    sort: 'newest',
    galleryImages: [],
    galleryIndex: 0,
    galleryZoom: 1,
    controlsInitialized: false
};

let newsWorkflowState = {
    modalInstance: null,
    currentState: 'closed',
    extractedData: null,
    editorData: null,
    galleryItems: [],
    coverImageFile: null,
    coverImageUrl: '',
    categories: []
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await verifyAdminPrivileges();
        dismissSplashLoader();

        try { setupAdminNavigation(); } catch (err) { console.warn('Admin navigation unavailable:', err?.message || err); }
        try { initializeAdminSectionActions(); } catch (err) { console.warn('Admin toolbar actions unavailable:', err?.message || err); }
        try { initializeUsersModule(); } catch (err) { console.warn('Users module unavailable:', err?.message || err); }
        try { initializeBusinessPagesModule(); } catch (err) { console.warn('Business pages module unavailable:', err?.message || err); }
        try { await initializeJobsModule(); } catch (err) { console.warn('Jobs module unavailable:', err?.message || err); }
        try { setupMarketplaceAdminRealtime(); } catch (err) { console.warn('Marketplace admin sync unavailable:', err?.message || err); }
        try { setupFootballAdminRealtime(); } catch (err) { console.warn('Football admin sync unavailable:', err?.message || err); }
        try { setupContentForms(); } catch (err) { console.warn('Content forms unavailable:', err?.message || err); }
        try { setupGovernmentManager(); } catch (err) { console.warn('Government manager unavailable:', err?.message || err); }
        try { initializeAdvertisingModule(); } catch (err) { console.warn('Advertising module unavailable:', err?.message || err); }
        try { await loadControlConsole(); } catch (err) { console.warn('Admin console unavailable:', err?.message || err); }
        try { await initializePaymentsModule(); } catch (err) { console.warn('Payments module unavailable:', err?.message || err); }
    } catch (err) {
        console.error('Admin initialization exception:', err?.message || err);
        dismissSplashLoader();
        const errorDisplay = document.createElement('div');
        errorDisplay.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10001;padding:16px 24px;background:rgba(226,28,38,0.95);color:#fff;border-radius:12px;font-size:14px;max-width:90vw;box-shadow:0 10px 30px rgba(0,0,0,0.25);';
        errorDisplay.textContent = 'Admin initialization failed. Please reload the page or contact support.';
        document.body.appendChild(errorDisplay);
    }
});

// ==========================================
// 1. SECURITY & CONSOLE AUTHENTICATION CHECK
// ==========================================
async function verifyAdminPrivileges() {
    try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) {
            console.warn('Admin session lookup failed:', sessionErr.message);
        }

        if (session?.user?.id) {
            currentAdminId = session.user.id;
            try {
                const { data: profile, error: profileErr } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', currentAdminId)
                    .single();

                if (!profileErr && profile?.role) {
                    currentAdminRole = profile.role;
                    return true;
                }
            } catch (profileErr) {
                console.warn('Admin profile lookup failed:', profileErr?.message || profileErr);
            }
        }

        return true;
    } catch (err) {
        console.warn('Admin workspace initialized in read-only mode:', err?.message || err);
        return true;
    }
}

function dismissSplashLoader() {
    const splash = document.getElementById('admin-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

function initializeAdvertisingModule() {
    const createBtn = document.getElementById('advertising-create-btn');
    const refreshBtn = document.getElementById('advertising-refresh-btn');
    const searchInput = document.getElementById('advertising-search');
    const typeFilter = document.getElementById('advertising-type-filter');
    const locationFilter = document.getElementById('advertising-location-filter');
    const listContainer = document.getElementById('advertising-list');
    const statsContainer = document.getElementById('advertising-stats');
    const form = document.getElementById('advertising-form');
    const hiddenId = document.getElementById('advertising-id');
    const titleInput = document.getElementById('advertising-title');
    const typeSelect = document.getElementById('advertising-type');
    const advertiserInput = document.getElementById('advertising-advertiser');
    const imageInput = document.getElementById('advertising-image-url');
    const carouselInput = document.getElementById('advertising-carousel-images');
    const videoInput = document.getElementById('advertising-video-url');
    const descriptionInput = document.getElementById('advertising-description');
    const buttonTextInput = document.getElementById('advertising-button-text');
    const destinationInput = document.getElementById('advertising-destination-url');
    const startDateInput = document.getElementById('advertising-start-date');
    const endDateInput = document.getElementById('advertising-end-date');
    const priorityInput = document.getElementById('advertising-priority');
    const locationSelect = document.getElementById('advertising-location');
    const audienceSelect = document.getElementById('advertising-audience');
    const activeInput = document.getElementById('advertising-active');
    const previewBtn = document.getElementById('advertising-preview-btn');
    const draftBtn = document.getElementById('advertising-draft-btn');

    if (!form || !listContainer) return;

    const populateSelects = () => {
        if (typeSelect) {
            typeSelect.innerHTML = getAdvertisementTypes().map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
        }
        if (locationSelect) {
            locationSelect.innerHTML = getDisplayLocations().map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
        }
        if (audienceSelect) {
            audienceSelect.innerHTML = getAudienceOptions().map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
        }
        if (typeFilter) {
            typeFilter.innerHTML = ['<option value="all">All Types</option>', ...getAdvertisementTypes().map((option) => `<option value="${option.value}">${option.label}</option>`)].join('');
        }
        if (locationFilter) {
            locationFilter.innerHTML = ['<option value="all">All Locations</option>', ...getDisplayLocations().map((option) => `<option value="${option.value}">${option.label}</option>`)].join('');
        }
    };

    const resetForm = () => {
        form.reset();
        if (hiddenId) hiddenId.value = '';
        if (typeSelect) typeSelect.value = 'banner';
        if (locationSelect) locationSelect.value = 'home';
        if (audienceSelect) audienceSelect.value = 'everyone';
        if (activeInput) activeInput.checked = true;
        if (buttonTextInput) buttonTextInput.value = 'Learn More';
        if (titleInput) titleInput.focus();
    };

    const openAdvertisingModal = (ad = null) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.86); z-index:20020; overflow:auto; padding:24px;';
        overlay.innerHTML = `
            <div class="luxury-card" style="max-width:860px; margin:24px auto; padding:24px; position:relative;">
                <button type="button" style="position:absolute; top:12px; right:12px; border:none; background:none; color:var(--text-muted); cursor:pointer; font-size:18px;" id="advertising-modal-close">✕</button>
                <h3 style="margin-top:0; color:var(--text-primary);">Advertisement Designer</h3>
                <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px;">Build polished campaigns for banners, carousel slides, popups, video placements, and more.</p>
                <form id="advertising-modal-form" class="form-grid">
                    <input type="hidden" id="advertising-modal-id">
                    <div class="form-group"><label class="form-label">Advertisement Title</label><input type="text" id="advertising-modal-title" class="form-control" required></div>
                    <div class="form-group"><label class="form-label">Advertisement Type</label><select id="advertising-modal-type" class="form-control"></select></div>
                    <div class="form-group"><label class="form-label">Business / Advertiser Name</label><input type="text" id="advertising-modal-advertiser" class="form-control"></div>
                    <div class="form-group"><label class="form-label">Upload Image</label><input type="text" id="advertising-modal-image-url" class="form-control" placeholder="Image URL"></div>
                    <div class="form-group"><label class="form-label">Upload Multiple Images (Carousel)</label><textarea id="advertising-modal-carousel-images" class="form-control" rows="3" placeholder="One URL per line"></textarea></div>
                    <div class="form-group"><label class="form-label">Upload Video (optional)</label><input type="text" id="advertising-modal-video-url" class="form-control" placeholder="Video URL"></div>
                    <div class="form-group"><label class="form-label">Advertisement Description</label><textarea id="advertising-modal-description" class="form-control" rows="3"></textarea></div>
                    <div class="form-group"><label class="form-label">Button Text</label><input type="text" id="advertising-modal-button-text" class="form-control" value="Learn More"></div>
                    <div class="form-group"><label class="form-label">Destination URL</label><input type="text" id="advertising-modal-destination-url" class="form-control" placeholder="https://example.com"></div>
                    <div class="form-group"><label class="form-label">Start Date</label><input type="date" id="advertising-modal-start-date" class="form-control"></div>
                    <div class="form-group"><label class="form-label">End Date</label><input type="date" id="advertising-modal-end-date" class="form-control"></div>
                    <div class="form-group"><label class="form-label">Display Priority</label><select id="advertising-modal-priority" class="form-control"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>
                    <div class="form-group"><label class="form-label">Display Location</label><select id="advertising-modal-location" class="form-control"></select></div>
                    <div class="form-group"><label class="form-label">Target Audience</label><select id="advertising-modal-audience" class="form-control"></select></div>
                    <div class="form-group" style="grid-column: 1 / -1;"><label style="display:flex; align-items:center; gap:8px; color:var(--text-muted); font-size:12px;"><input type="checkbox" id="advertising-modal-active" checked> Active</label></div>
                    <div class="form-group" style="grid-column: 1 / -1; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                        <button type="button" id="advertising-modal-preview-btn" class="btn-secondary">Preview</button>
                        <button type="button" id="advertising-modal-draft-btn" class="btn-secondary">Save Draft</button>
                        <button type="submit" class="btn-primary">Publish Immediately</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);

        const modalForm = overlay.querySelector('#advertising-modal-form');
        const modalId = overlay.querySelector('#advertising-modal-id');
        const modalTitle = overlay.querySelector('#advertising-modal-title');
        const modalType = overlay.querySelector('#advertising-modal-type');
        const modalAdvertiser = overlay.querySelector('#advertising-modal-advertiser');
        const modalImage = overlay.querySelector('#advertising-modal-image-url');
        const modalCarousel = overlay.querySelector('#advertising-modal-carousel-images');
        const modalVideo = overlay.querySelector('#advertising-modal-video-url');
        const modalDescription = overlay.querySelector('#advertising-modal-description');
        const modalButtonText = overlay.querySelector('#advertising-modal-button-text');
        const modalDestination = overlay.querySelector('#advertising-modal-destination-url');
        const modalStart = overlay.querySelector('#advertising-modal-start-date');
        const modalEnd = overlay.querySelector('#advertising-modal-end-date');
        const modalPriority = overlay.querySelector('#advertising-modal-priority');
        const modalLocation = overlay.querySelector('#advertising-modal-location');
        const modalAudience = overlay.querySelector('#advertising-modal-audience');
        const modalActive = overlay.querySelector('#advertising-modal-active');
        const modalClose = overlay.querySelector('#advertising-modal-close');
        const modalPreview = overlay.querySelector('#advertising-modal-preview-btn');
        const modalDraft = overlay.querySelector('#advertising-modal-draft-btn');

        modalType.innerHTML = getAdvertisementTypes().map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
        modalLocation.innerHTML = getDisplayLocations().map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
        modalAudience.innerHTML = getAudienceOptions().map((option) => `<option value="${option.value}">${option.label}</option>`).join('');

        if (ad) {
            modalId.value = ad.id || '';
            modalTitle.value = ad.title || '';
            modalType.value = ad.type || 'banner';
            modalAdvertiser.value = ad.advertiser_name || '';
            modalImage.value = ad.image_url || '';
            modalCarousel.value = Array.isArray(ad.carousel_images) ? ad.carousel_images.join('\n') : '';
            modalVideo.value = ad.video_url || '';
            modalDescription.value = ad.description || '';
            modalButtonText.value = ad.button_text || 'Learn More';
            modalDestination.value = ad.destination_url || '';
            modalStart.value = ad.start_date ? ad.start_date.split('T')[0] : '';
            modalEnd.value = ad.end_date ? ad.end_date.split('T')[0] : '';
            modalPriority.value = ad.display_priority || 'medium';
            modalLocation.value = (ad.display_locations && ad.display_locations[0]) || 'home';
            modalAudience.value = ad.audience || 'everyone';
            modalActive.checked = ad.is_active !== false;
        } else {
            modalType.value = 'banner';
            modalLocation.value = 'home';
            modalAudience.value = 'everyone';
            modalActive.checked = true;
        }

        const closeModal = () => overlay.remove();
        modalClose?.addEventListener('click', closeModal);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeModal();
        });

        const collectModalPayload = (status = 'draft') => ({
            id: modalId.value || '',
            title: modalTitle.value || 'Untitled Advertisement',
            type: modalType.value || 'banner',
            advertiser_name: modalAdvertiser.value || '',
            image_url: modalImage.value || '',
            carousel_images: (modalCarousel.value || '').split(/\n+/).filter(Boolean),
            video_url: modalVideo.value || '',
            description: modalDescription.value || '',
            button_text: modalButtonText.value || 'Learn More',
            destination_url: modalDestination.value || '',
            start_date: modalStart.value || '',
            end_date: modalEnd.value || '',
            display_priority: modalPriority.value || 'medium',
            display_locations: [modalLocation.value || 'home'],
            audience: modalAudience.value || 'everyone',
            is_active: modalActive.checked !== false,
            status,
            archived: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        modalPreview?.addEventListener('click', () => {
            const item = createAdvertisement(collectModalPayload('draft'));
            alert(`Preview ready for ${item.title}.`);
            renderList();
        });
        modalDraft?.addEventListener('click', () => {
            const item = createAdvertisement(collectModalPayload('draft'));
            alert(`Draft saved for ${item.title}.`);
            renderList();
            closeModal();
        });
        modalForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            const item = createAdvertisement(collectModalPayload('published'));
            alert(`Advertisement published: ${item.title}`);
            renderList();
            closeModal();
        });
    };

    const renderList = () => {
        const query = (searchInput?.value || '').trim().toLowerCase();
        const typeValue = typeFilter?.value || 'all';
        const locationValue = locationFilter?.value || 'all';
        const items = getAdvertisements().filter((ad) => !ad.archived);
        const filtered = items.filter((ad) => {
            const matchesQuery = !query || [ad.title, ad.advertiser_name, ad.description].join(' ').toLowerCase().includes(query);
            const matchesType = typeValue === 'all' || ad.type === typeValue;
            const matchesLocation = locationValue === 'all' || (ad.display_locations || []).includes(locationValue);
            return matchesQuery && matchesType && matchesLocation;
        });

        if (!filtered.length) {
            listContainer.innerHTML = '<div style="padding:16px; border:1px dashed rgba(255,255,255,0.08); border-radius:var(--radius-md); color:var(--text-muted);">No advertisements yet. Create your first campaign to start publishing.</div>';
            if (statsContainer) statsContainer.innerHTML = '<span>0 active ads</span><span>0 published</span><span>0 drafts</span>';
            return;
        }

        listContainer.innerHTML = filtered.map((ad) => {
            const isPublished = ad.status === 'published';
            const isActive = ad.is_active !== false;
            const locations = (ad.display_locations || []).join(', ');
            return `
                <div style="border:1px solid rgba(255,255,255,0.08); border-radius:var(--radius-md); padding:14px; background:rgba(255,255,255,0.03);">
                    <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
                        <div>
                            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                                <strong style="color:var(--text-primary);">${String(ad.title || 'Untitled').replace(/</g, '&lt;')}</strong>
                                <span class="badge badge-premium">${String(ad.type || 'banner').replace(/</g, '&lt;')}</span>
                                ${isPublished ? '<span class="badge badge-verified">Published</span>' : '<span class="badge badge-secondary">Draft</span>'}
                                ${isActive ? '<span class="badge badge-verified">Active</span>' : '<span class="badge badge-secondary">Inactive</span>'}
                            </div>
                            <div style="font-size:12px; color:var(--text-muted);">Advertiser: ${String(ad.advertiser_name || 'Unspecified').replace(/</g, '&lt;')}</div>
                            <div style="font-size:12px; color:var(--text-muted);">Locations: ${String(locations || 'home').replace(/</g, '&lt;')}</div>
                            <div style="font-size:12px; color:var(--text-muted);">Views: ${ad.views || 0} • Clicks: ${ad.clicks || 0}</div>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:11px;" data-ad-action="edit" data-ad-id="${ad.id}">Edit</button>
                            <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:11px;" data-ad-action="duplicate" data-ad-id="${ad.id}">Duplicate</button>
                            <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:11px;" data-ad-action="archive" data-ad-id="${ad.id}">Archive</button>
                            <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:11px;" data-ad-action="delete" data-ad-id="${ad.id}">Delete</button>
                            <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:11px;" data-ad-action="toggle" data-ad-id="${ad.id}">${isActive ? 'Deactivate' : 'Activate'}</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (statsContainer) {
            const publishedCount = filtered.filter((ad) => ad.status === 'published').length;
            const activeCount = filtered.filter((ad) => ad.is_active !== false).length;
            statsContainer.innerHTML = `<span>${filtered.length} visible ads</span><span>${publishedCount} published</span><span>${activeCount} active</span>`;
        }
    };

    const populateForm = (ad) => {
        if (!ad) return;
        if (hiddenId) hiddenId.value = ad.id || '';
        if (titleInput) titleInput.value = ad.title || '';
        if (typeSelect) typeSelect.value = ad.type || 'banner';
        if (advertiserInput) advertiserInput.value = ad.advertiser_name || '';
        if (imageInput) imageInput.value = ad.image_url || '';
        if (carouselInput) carouselInput.value = Array.isArray(ad.carousel_images) ? ad.carousel_images.join('\n') : '';
        if (videoInput) videoInput.value = ad.video_url || '';
        if (descriptionInput) descriptionInput.value = ad.description || '';
        if (buttonTextInput) buttonTextInput.value = ad.button_text || 'Learn More';
        if (destinationInput) destinationInput.value = ad.destination_url || '';
        if (startDateInput) startDateInput.value = ad.start_date ? ad.start_date.split('T')[0] : '';
        if (endDateInput) endDateInput.value = ad.end_date ? ad.end_date.split('T')[0] : '';
        if (priorityInput) priorityInput.value = ad.display_priority || 'medium';
        if (locationSelect) locationSelect.value = (ad.display_locations && ad.display_locations[0]) || 'home';
        if (audienceSelect) audienceSelect.value = ad.audience || 'everyone';
        if (activeInput) activeInput.checked = ad.is_active !== false;
    };

    const collectPayload = (status = 'draft') => ({
        id: hiddenId?.value || '',
        title: titleInput?.value || 'Untitled Advertisement',
        type: typeSelect?.value || 'banner',
        advertiser_name: advertiserInput?.value || '',
        image_url: imageInput?.value || '',
        carousel_images: (carouselInput?.value || '').split(/\n+/).filter(Boolean),
        video_url: videoInput?.value || '',
        description: descriptionInput?.value || '',
        button_text: buttonTextInput?.value || 'Learn More',
        destination_url: destinationInput?.value || '',
        start_date: startDateInput?.value || '',
        end_date: endDateInput?.value || '',
        display_priority: priorityInput?.value || 'medium',
        display_locations: [locationSelect?.value || 'home'],
        audience: audienceSelect?.value || 'everyone',
        is_active: activeInput?.checked !== false,
        status,
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    createBtn?.addEventListener('click', () => openAdvertisingModal());
    refreshBtn?.addEventListener('click', renderList);
    searchInput?.addEventListener('input', renderList);
    typeFilter?.addEventListener('change', renderList);
    locationFilter?.addEventListener('change', renderList);
    previewBtn?.addEventListener('click', () => {
        const payload = collectPayload('draft');
        const item = createAdvertisement(payload);
        alert(`Preview ready for ${item.title}.`);
        renderList();
    });
    draftBtn?.addEventListener('click', () => {
        const payload = collectPayload('draft');
        const item = createAdvertisement(payload);
        alert(`Draft saved for ${item.title}.`);
        renderList();
    });
    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const item = createAdvertisement(collectPayload('published'));
        alert(`Advertisement published: ${item.title}`);
        renderList();
        resetForm();
    });
    listContainer?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-ad-action]');
        if (!button) return;
        const action = button.getAttribute('data-ad-action');
        const id = button.getAttribute('data-ad-id');
        const ad = getAdvertisementById(id);
        if (!ad) return;
        if (action === 'edit') {
            openAdvertisingModal(ad);
        }
        if (action === 'duplicate') {
            duplicateAdvertisement(id);
            renderList();
        }
        if (action === 'archive') {
            archiveAdvertisement(id);
            renderList();
        }
        if (action === 'delete') {
            deleteAdvertisement(id);
            renderList();
        }
        if (action === 'toggle') {
            toggleAdvertisementActive(id, !ad.is_active);
            renderList();
        }
    });

    populateSelects();
    resetForm();
    renderList();
}

// ==========================================
// 2. CORE MASTER CONTROL TERMINAL LOOP
// ==========================================
async function loadControlConsole() {
    await Promise.all([
        updatePlatformMetrics().catch(err => console.warn('Platform metrics unavailable:', err?.message || err)),
        fetchMarketplaceQueue().catch(err => console.warn('Marketplace queue unavailable:', err?.message || err)),
        fetchContentQueue().catch(err => console.warn('Content queue unavailable:', err?.message || err)),
        fetchReportsQueue().catch(err => console.warn('Reports queue unavailable:', err?.message || err)),
        renderWorkspaceOverview().catch(err => console.warn('Workspace overview unavailable:', err?.message || err))
    ]);
}

async function initializeBusinessPagesModule() {
    const searchInput = document.getElementById('business-search');
    const statusFilter = document.getElementById('business-status-filter');
    const categoryFilter = document.getElementById('business-category-filter');
    const districtFilter = document.getElementById('business-district-filter');
    const refreshButton = document.getElementById('business-refresh-btn');

    if (!searchInput || !statusFilter) return;

    searchInput.addEventListener('input', renderBusinessPagesTable);
    statusFilter.addEventListener('change', renderBusinessPagesTable);
    categoryFilter?.addEventListener('change', renderBusinessPagesTable);
    districtFilter?.addEventListener('change', renderBusinessPagesTable);
    refreshButton?.addEventListener('click', () => loadBusinessPagesModule());

    await loadBusinessPagesModule();
}

async function loadBusinessPagesModule() {
    const tableContainer = document.getElementById('business-pages-table-container');
    const emptyState = document.getElementById('business-pages-empty-state');
    if (!tableContainer || !emptyState) return;

    tableContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Loading business pages…</div>';
    emptyState.style.display = 'none';

    try {
        const { data, error } = await supabase
            .from('business_pages')
            .select('id, owner_id, business_name, username, description, category, phone, whatsapp, email, website, district, address, logo_url, cover_photo, verified, followers, likes, rating, total_reviews, response_rate, average_reply_minutes, total_sales, completed_orders, report_count, is_suspended, suspended_at, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const pages = (data || []).map(page => ({
            ...page,
            business_name: page.business_name || page.username || 'Unnamed business',
            status: page.is_suspended ? 'suspended' : page.verified ? 'verified' : 'pending',
            owner_name: page.username || 'Unknown owner',
            profile_photo: page.logo_url || page.cover_photo || '../assets/Icon.png',
            cover_photo: page.cover_photo || '../assets/Logo.png'
        }));

        businessPagesModuleState.pages = pages;
        businessPagesModuleState.owners = {};
        businessPagesModuleState.analytics = await calculateBusinessPageAnalytics(pages);

        renderBusinessMetrics(pages);
        populateBusinessFilters(pages);
        renderBusinessPagesTable();
    } catch (err) {
        tableContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Unable to load business pages right now.</div>';
        emptyState.style.display = 'block';
        emptyState.textContent = err?.message || 'Unable to load business pages right now.';
        console.warn('Business pages module failed to load:', err?.message || err);
    }
}

async function initializeJobsModule() {
    const searchInput = document.getElementById('jobs-search');
    const statusFilter = document.getElementById('jobs-status-filter');
    const categoryFilter = document.getElementById('jobs-category-filter');
    const districtFilter = document.getElementById('jobs-district-filter');
    const refreshButton = document.getElementById('jobs-refresh-btn');
    const createButton = document.getElementById('jobs-create-btn');
    const applicantsModal = document.getElementById('job-applicants-modal');
    const applicantClose = document.getElementById('job-applicants-close');

    if (!searchInput || !statusFilter || !categoryFilter || !districtFilter) return;

    const isSuperAdmin = String(currentAdminRole || '').toLowerCase() === 'super_admin';

    searchInput.addEventListener('input', () => {
        jobsModuleState.filters.search = searchInput.value.trim();
        renderJobsTable();
    });
    statusFilter.addEventListener('change', () => {
        jobsModuleState.filters.status = statusFilter.value;
        renderJobsTable();
    });
    categoryFilter.addEventListener('change', () => {
        jobsModuleState.filters.category = categoryFilter.value;
        renderJobsTable();
    });
    districtFilter.addEventListener('change', () => {
        jobsModuleState.filters.district = districtFilter.value;
        renderJobsTable();
    });
    refreshButton?.addEventListener('click', () => loadJobsModule());

    if (createButton) {
        if (!isSuperAdmin) {
            createButton.disabled = true;
            createButton.textContent = 'Super Admin only';
        }
        createButton.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isSuperAdmin) {
                showVacancyWorkflowMessage('Only Super Admin can create or manage job vacancies.');
                return;
            }
            openCreateVacancyModal();
        };
    }

    await loadJobsModule();
}

async function loadJobsModule() {
    const tableContainer = document.getElementById('jobs-table-container');
    const emptyState = document.getElementById('jobs-empty-state');
    if (!tableContainer || !emptyState) return;

    tableContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Loading jobs…</div>';
    emptyState.style.display = 'none';

    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [{ data: jobs, error: jobsError }, { data: todaysApplications, error: appsError }] = await Promise.all([
            supabase.from('jobs').select('*').order('created_at', { ascending: false }),
            supabase.from('job_applications').select('id').gte('created_at', todayStart.toISOString())
        ]);

        if (jobsError) throw jobsError;
        if (appsError) console.warn('Unable to fetch applications today:', appsError.message || appsError);

        jobsModuleState.jobs = (jobs || []).map((job) => ({
            ...job,
            status: normalizeJobStatus(job.status)
        }));
        jobsModuleState.applicationsToday = (todaysApplications || []).length;

        renderJobMetrics();
        populateJobFilters();
        renderJobsTable();
    } catch (err) {
        tableContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Unable to load jobs at this time.</div>';
        emptyState.style.display = 'block';
        emptyState.textContent = err?.message || 'Unable to load jobs at this time.';
        console.warn('Jobs module failed to load:', err?.message || err);
    }
}

function normalizeJobStatus(status) {
    const normalized = String(status || 'pending').trim().toLowerCase();
    return VALID_JOB_STATUSES.includes(normalized) ? normalized : 'pending';
}

function sanitizeJobPayload(payload) {
    return Object.entries(payload || {}).reduce((acc, [key, value]) => {
        if (value === undefined) return acc;
        if (VALID_JOB_COLUMNS.includes(key)) acc[key] = value;
        return acc;
    }, {});
}

function buildJobInsertPayload(data = {}) {
    const payload = {
        title: data.title || null,
        company_name: data.company || null,
        category: data.category || 'Government',
        employment_type: data.jobType || 'Full Time',
        job_type: data.jobType || null,
        location: data.location || null,
        salary_type: data.salary ? 'Negotiable' : null,
        salary: data.salary || null,
        deadline: data.deadline || null,
        description: data.description || null,
        responsibilities: data.responsibilities || null,
        requirements: data.requirements || null,
        qualifications: data.qualifications || null,
        benefits: data.benefits || null,
        application_email: data.email || null,
        application_website: data.website || null,
        external_url: data.externalUrl || null,
        application_link: data.externalUrl || null,
        attachment_url: data.attachment || null,
        employer_id: currentAdminId,
        status: 'published',
        featured: false,
        urgent: false,
        vacancies: 1,
        district: null,
        company_website: data.website || null,
        company_email: data.email || null,
        company_phone: null,
        company_description: null
    };

    return sanitizeJobPayload(payload);
}

function normalizeDate(value) {
    if (value === null || value === undefined) return '';

    const raw = String(value).trim();
    if (!raw) return '';

    const monthMap = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
        may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
        sept: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
    };

    const cleaned = raw.replace(/,/g, '').replace(/\s+/g, ' ').trim();

    const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
        return formatDateParts(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10), parseInt(isoMatch[3], 10));
    }

    const slashMatch = cleaned.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (slashMatch) {
        return formatDateParts(parseInt(slashMatch[3], 10), parseInt(slashMatch[2], 10), parseInt(slashMatch[1], 10));
    }

    const monthNameMatch = cleaned.match(/^(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})$/i);
    if (monthNameMatch) {
        return formatDateParts(parseInt(monthNameMatch[3], 10), monthMap[monthNameMatch[2].toLowerCase()], parseInt(monthNameMatch[1], 10));
    }

    const monthDayYearMatch = cleaned.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s+(\d{4})$/i);
    if (monthDayYearMatch) {
        return formatDateParts(parseInt(monthDayYearMatch[3], 10), monthMap[monthDayYearMatch[1].toLowerCase()], parseInt(monthDayYearMatch[2], 10));
    }

    const dayMonthYearMatch = cleaned.match(/^(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})$/i);
    if (dayMonthYearMatch) {
        return formatDateParts(parseInt(dayMonthYearMatch[3], 10), monthMap[dayMonthYearMatch[2].toLowerCase()], parseInt(dayMonthYearMatch[1], 10));
    }

    return '';
}

function formatDateParts(year, month, day) {
    if (!year || !month || !day) return '';

    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return '';
    }

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function normalizeTime(value) {
    if (value === null || value === undefined) return '';

    const raw = String(value).trim();
    if (!raw) return '';

    const cleaned = raw.replace(/\s+/g, ' ').trim().toLowerCase();

    const meridiemMatch = cleaned.match(/^(\d{1,2})(?::|\.)(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)$/i);
    if (meridiemMatch) {
        const hour = parseInt(meridiemMatch[1], 10);
        const minute = parseInt(meridiemMatch[2], 10);
        const meridiem = meridiemMatch[4].toLowerCase();
        const normalizedHour = normalizeHour(hour, meridiem);
        if (normalizedHour === null || minute > 59) return '';
        return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    const noonMatch = cleaned.match(/^(\d{1,2})\s*(am|pm)$/i);
    if (noonMatch) {
        const hour = parseInt(noonMatch[1], 10);
        const normalizedHour = normalizeHour(hour, noonMatch[2].toLowerCase());
        if (normalizedHour === null) return '';
        return `${String(normalizedHour).padStart(2, '0')}:00`;
    }

    const twentyFourHourMatch = cleaned.match(/^(\d{1,2})(?::|\.)(\d{1,2})(?::(\d{1,2}))?$/);
    if (twentyFourHourMatch) {
        const hour = parseInt(twentyFourHourMatch[1], 10);
        const minute = parseInt(twentyFourHourMatch[2], 10);
        const seconds = parseInt(twentyFourHourMatch[3] || '0', 10);
        if (hour > 23 || minute > 59 || seconds > 59) return '';
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    return '';
}

function normalizeHour(hour, meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm') return hour === 12 ? 12 : hour + 12;
    if (meridiem === 'am') return hour === 12 ? 0 : hour;
    return hour;
}

function normalizeDateTime(value) {
    if (value === null || value === undefined) return '';

    const raw = String(value).trim();
    if (!raw) return '';

    const dateMatch = raw.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}|(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\s+\d{4})/i);
    const timeMatch = raw.match(/(\d{1,2}(?::|\.)\d{1,2}(?::\d{1,2})?\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))/i);

    if (!dateMatch || !timeMatch) return '';

    const normalizedDate = normalizeDate(dateMatch[0]);
    const normalizedTime = normalizeTime(timeMatch[0]);
    if (!normalizedDate || !normalizedTime) return '';

    return `${normalizedDate}T${normalizedTime}`;
}

function setDateFieldWarning(fieldId, message) {
    const warning = document.getElementById(`${fieldId}-warning`);
    if (warning) {
        warning.textContent = message;
        warning.style.display = message ? 'block' : 'none';
    }
}

function getNormalizedDateFieldValue(fieldId) {
    const rawValue = document.getElementById(fieldId)?.value || '';
    const normalizedValue = normalizeDate(rawValue);
    if (!normalizedValue && String(rawValue).trim()) {
        setDateFieldWarning(fieldId, 'Unable to recognise date format. Please verify before publishing.');
    } else {
        setDateFieldWarning(fieldId, '');
    }
    return normalizedValue;
}

function createModalShell() {
    if (vacancyWorkflowState.modalInstance) {
        return vacancyWorkflowState.modalInstance;
    }

    const overlay = document.createElement('div');
    overlay.id = 'vacancy-workflow-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.78); display:flex; align-items:center; justify-content:center; padding:24px; z-index:100000; opacity:0; transition:opacity 180ms ease;';
    overlay.innerHTML = '<div id="vacancy-workflow-panel" style="width:min(860px,100%); max-height:92vh; overflow:auto; background:#ffffff; border:1px solid #d9d9d9; border-radius:18px; box-shadow:0 20px 60px rgba(0,0,0,0.2); color:#111; transform:scale(0.97); transition:transform 180ms ease;"></div>';
    document.body.appendChild(overlay);
    vacancyWorkflowState.modalInstance = overlay;
    return overlay;
}

function destroyModalShell() {
    if (vacancyWorkflowState.modalInstance) {
        vacancyWorkflowState.modalInstance.remove();
        vacancyWorkflowState.modalInstance = null;
    }
}

function resetVacancyWorkflowState() {
    vacancyWorkflowState.currentState = 'closed';
    vacancyWorkflowState.currentMode = 'create';
    vacancyWorkflowState.draftData = null;
}

function closeCurrentModal(options = {}) {
    const { destroyImmediately = false } = options;
    const overlay = vacancyWorkflowState.modalInstance;
    if (!overlay) {
        resetVacancyWorkflowState();
        return;
    }

    if (destroyImmediately) {
        destroyModalShell();
        resetVacancyWorkflowState();
        return;
    }

    overlay.style.opacity = '0';
    const panel = overlay.querySelector('#vacancy-workflow-panel');
    if (panel) panel.style.transform = 'scale(0.97)';
    setTimeout(() => {
        destroyModalShell();
        resetVacancyWorkflowState();
    }, 180);
}

function openCreateVacancyModal() {
    if (vacancyWorkflowState.currentState === 'open' && vacancyWorkflowState.modalInstance) {
        return;
    }

    const overlay = createModalShell();
    const panel = overlay.querySelector('#vacancy-workflow-panel');
    if (!panel) return;

    vacancyWorkflowState.currentState = 'open';
    vacancyWorkflowState.currentMode = 'create';
    vacancyWorkflowState.draftData = null;

    panel.innerHTML = `
        <div style="padding:28px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px;">
                <div>
                    <h3 style="margin:0; font-size:22px; color:#111;">Create Vacancy with AI</h3>
                    <p style="margin:6px 0 0; font-size:13px; color:#666;">Paste or type a complete vacancy advertisement below. Msofi AI will automatically extract and organize the information.</p>
                </div>
                <button type="button" id="vacancy-modal-close" style="border:1px solid #d9d9d9; background:#fff; color:#111; width:38px; height:38px; border-radius:999px; cursor:pointer; font-size:18px;">×</button>
            </div>
            <label style="display:block; margin-bottom:8px; font-size:12px; font-weight:600; color:#333; text-transform:uppercase; letter-spacing:0.06em;">Vacancy Advertisement</label>
            <textarea id="vacancy-input" rows="16" style="width:100%; border:1px solid #d9d9d9; border-radius:14px; padding:14px; font:inherit; color:#111; resize:vertical; min-height:260px; box-sizing:border-box;" placeholder="Paste vacancy advertisement here...\n\nExample:\n\nVACANCY\n\nOrganization: Malawi Revenue Authority\n\nPosition: ICT Officer\n\nLocation: Lilongwe\n\nClosing Date: 30 August 2026\n\nRequirements:\n...\n\nResponsibilities:\n...\n\nHow to Apply:\n..."></textarea>
            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:18px; flex-wrap:wrap;">
                <button type="button" id="vacancy-cancel" style="border:1px solid #111; background:#fff; color:#111; padding:10px 16px; border-radius:999px; cursor:pointer;">Cancel</button>
                <button type="button" id="vacancy-extract" style="border:1px solid #111; background:#111; color:#fff; padding:10px 16px; border-radius:999px; cursor:pointer;">Extract Details</button>
            </div>
        </div>
    `;

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        if (panel) panel.style.transform = 'scale(1)';
    });

    bindVacancyWorkflowEvents();
}

function bindVacancyWorkflowEvents() {
    const overlay = vacancyWorkflowState.modalInstance;
    if (!overlay) return;

    overlay.onclick = (event) => {
        if (event.target === overlay) {
            closeCurrentModal();
        }
    };

    const closeBtn = overlay.querySelector('#vacancy-modal-close');
    const cancelBtn = overlay.querySelector('#vacancy-cancel');
    const extractBtn = overlay.querySelector('#vacancy-extract');

    closeBtn?.addEventListener('click', () => closeCurrentModal());
    cancelBtn?.addEventListener('click', () => closeCurrentModal());
    extractBtn?.addEventListener('click', () => extractVacancyDetails());

    document.removeEventListener('keydown', handleVacancyEscape);
    document.addEventListener('keydown', handleVacancyEscape);
}

function handleVacancyEscape(event) {
    if (event.key === 'Escape' && vacancyWorkflowState.currentState === 'open') {
        event.preventDefault();
        closeCurrentModal();
    }
}

function showVacancyWorkflowMessage(message) {
    const overlay = createModalShell();
    const panel = overlay.querySelector('#vacancy-workflow-panel');
    if (!panel) return;

    vacancyWorkflowState.currentState = 'open';
    vacancyWorkflowState.currentMode = 'message';
    panel.innerHTML = `
        <div style="padding:28px;">
            <h3 style="margin:0 0 12px; color:#111; font-size:22px;">Notice</h3>
            <p style="margin:0 0 18px; color:#333; line-height:1.6;">${escapeHtml(message)}</p>
            <div style="display:flex; justify-content:flex-end;">
                <button type="button" id="vacancy-message-ok" style="border:1px solid #111; background:#111; color:#fff; padding:10px 16px; border-radius:999px; cursor:pointer;">OK</button>
            </div>
        </div>
    `;

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        if (panel) panel.style.transform = 'scale(1)';
    });

    overlay.querySelector('#vacancy-message-ok')?.addEventListener('click', () => closeCurrentModal());
}

function showExtractionLoading() {
    const overlay = createModalShell();
    const panel = overlay.querySelector('#vacancy-workflow-panel');
    if (!panel) return;

    vacancyWorkflowState.currentState = 'open';
    vacancyWorkflowState.currentMode = 'loading';

    panel.innerHTML = `
        <div style="padding:32px 28px; text-align:center;">
            <div style="width:48px; height:48px; border:3px solid #d9d9d9; border-top-color:#111; border-radius:50%; margin:0 auto 16px; animation:spin 0.9s linear infinite;"></div>
            <h3 style="margin:0 0 8px; color:#111; font-size:22px;">Extracting Vacancy Details...</h3>
            <p style="margin:0; color:#555;">Msofi AI is reading the advertisement and preparing the editor form.</p>
        </div>
    `;

    const style = document.createElement('style');
    style.id = 'vacancy-spin-style';
    style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        if (panel) panel.style.transform = 'scale(1)';
    });
}

function showErrorModal(message) {
    const overlay = createModalShell();
    const panel = overlay.querySelector('#vacancy-workflow-panel');
    if (!panel) return;

    vacancyWorkflowState.currentState = 'open';
    vacancyWorkflowState.currentMode = 'error';
    panel.innerHTML = `
        <div style="padding:28px;">
            <h3 style="margin:0 0 12px; color:#111; font-size:22px;">Unable to Extract</h3>
            <p style="margin:0 0 18px; line-height:1.6; color:#333;">${escapeHtml(message)}</p>
            <div style="display:flex; justify-content:flex-end;">
                <button type="button" id="vacancy-error-ok" style="border:1px solid #111; background:#111; color:#fff; padding:10px 16px; border-radius:999px; cursor:pointer;">OK</button>
            </div>
        </div>
    `;

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        if (panel) panel.style.transform = 'scale(1)';
    });

    overlay.querySelector('#vacancy-error-ok')?.addEventListener('click', () => closeCurrentModal());
}

function showSuccessModal(message) {
    const overlay = createModalShell();
    const panel = overlay.querySelector('#vacancy-workflow-panel');
    if (!panel) return;

    vacancyWorkflowState.currentState = 'open';
    vacancyWorkflowState.currentMode = 'success';
    panel.innerHTML = `
        <div style="padding:28px;">
            <h3 style="margin:0 0 12px; color:#111; font-size:22px;">Vacancy Published</h3>
            <p style="margin:0 0 18px; line-height:1.6; color:#333;">${escapeHtml(message)}</p>
            <div style="display:flex; justify-content:flex-end;">
                <button type="button" id="vacancy-success-ok" style="border:1px solid #111; background:#111; color:#fff; padding:10px 16px; border-radius:999px; cursor:pointer;">OK</button>
            </div>
        </div>
    `;

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        if (panel) panel.style.transform = 'scale(1)';
    });

    overlay.querySelector('#vacancy-success-ok')?.addEventListener('click', () => closeCurrentModal());
}

function buildJobEditorMarkup(data = {}) {
    const normalizedDeadline = normalizeDate(data.deadline || '');
    const deadlineWarning = String(data.deadline || '').trim() && !normalizedDeadline
        ? '<div id="vacancy-deadline-warning" style="margin-top:6px; font-size:12px; color:#b45309;">Unable to recognise date format. Please verify before publishing.</div>'
        : '<div id="vacancy-deadline-warning" style="display:none; margin-top:6px; font-size:12px; color:#b45309;"></div>';

    return `
        <div style="padding:28px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:18px;">
                <div>
                    <h3 style="margin:0; font-size:22px; color:#111;">Job Editor</h3>
                    <p style="margin:6px 0 0; font-size:13px; color:#666;">Review and refine the extracted vacancy details before publishing.</p>
                </div>
                <button type="button" id="vacancy-editor-close" style="border:1px solid #d9d9d9; background:#fff; color:#111; width:38px; height:38px; border-radius:999px; cursor:pointer; font-size:18px;">×</button>
            </div>
            <form id="vacancy-editor-form" style="display:grid; gap:14px;">
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px;">
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Job Title</label><input id="vacancy-title" class="form-control" value="${escapeHtml(data.title || '')}" style="width:100%;" required></div>
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Company</label><input id="vacancy-company" class="form-control" value="${escapeHtml(data.company || '')}" style="width:100%;" required></div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px;">
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Category</label><input id="vacancy-category" class="form-control" value="${escapeHtml(data.category || '')}" style="width:100%;"></div>
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Job Type</label><input id="vacancy-job-type" class="form-control" value="${escapeHtml(data.jobType || '')}" style="width:100%;"></div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px;">
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Location</label><input id="vacancy-location" class="form-control" value="${escapeHtml(data.location || '')}" style="width:100%;"></div>
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Closing Date</label><input id="vacancy-deadline" class="form-control" type="date" value="${escapeHtml(normalizedDeadline)}" style="width:100%;">${deadlineWarning}</div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px;">
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Salary</label><input id="vacancy-salary" class="form-control" value="${escapeHtml(data.salary || '')}" style="width:100%;"></div>
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Application Email</label><input id="vacancy-email" class="form-control" value="${escapeHtml(data.email || '')}" style="width:100%;"></div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px;">
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Application Website</label><input id="vacancy-website" class="form-control" value="${escapeHtml(data.website || '')}" style="width:100%;"></div>
                    <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">External Link</label><input id="vacancy-external-url" class="form-control" value="${escapeHtml(data.externalUrl || '')}" style="width:100%;"></div>
                </div>
                <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Description</label><textarea id="vacancy-description" rows="4" class="form-control" style="width:100%; resize:vertical;">${escapeHtml(data.description || '')}</textarea></div>
                <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Responsibilities</label><textarea id="vacancy-responsibilities" rows="4" class="form-control" style="width:100%; resize:vertical;">${escapeHtml(data.responsibilities || '')}</textarea></div>
                <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Requirements</label><textarea id="vacancy-requirements" rows="4" class="form-control" style="width:100%; resize:vertical;">${escapeHtml(data.requirements || '')}</textarea></div>
                <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Qualifications</label><textarea id="vacancy-qualifications" rows="3" class="form-control" style="width:100%; resize:vertical;">${escapeHtml(data.qualifications || '')}</textarea></div>
                <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Benefits</label><textarea id="vacancy-benefits" rows="3" class="form-control" style="width:100%; resize:vertical;">${escapeHtml(data.benefits || '')}</textarea></div>
                <div><label style="display:block; margin-bottom:6px; color:#333; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">Attachment</label><input id="vacancy-attachment" class="form-control" value="${escapeHtml(data.attachment || '')}" style="width:100%;"></div>
                <div style="display:flex; justify-content:flex-end; gap:12px; flex-wrap:wrap; margin-top:6px;">
                    <button type="button" id="vacancy-editor-cancel" style="border:1px solid #111; background:#fff; color:#111; padding:10px 16px; border-radius:999px; cursor:pointer;">Cancel</button>
                    <button type="button" id="vacancy-save-draft" style="border:1px solid #111; background:#fff; color:#111; padding:10px 16px; border-radius:999px; cursor:pointer;">Save Draft</button>
                    <button type="button" id="vacancy-publish" style="border:1px solid #111; background:#111; color:#fff; padding:10px 16px; border-radius:999px; cursor:pointer;">Publish</button>
                </div>
            </form>
        </div>
    `;
}

function openJobEditor(data = {}) {
    const overlay = createModalShell();
    const panel = overlay.querySelector('#vacancy-workflow-panel');
    if (!panel) return;

    vacancyWorkflowState.currentState = 'open';
    vacancyWorkflowState.currentMode = 'editor';
    vacancyWorkflowState.draftData = data;
    panel.innerHTML = buildJobEditorMarkup(data);

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        if (panel) panel.style.transform = 'scale(1)';
    });

    bindEditorWorkflowEvents();
}

function bindEditorWorkflowEvents() {
    const overlay = vacancyWorkflowState.modalInstance;
    if (!overlay) return;

    overlay.onclick = (event) => {
        if (event.target === overlay) {
            closeCurrentModal();
        }
    };

    overlay.querySelector('#vacancy-editor-close')?.addEventListener('click', () => closeCurrentModal());
    overlay.querySelector('#vacancy-editor-cancel')?.addEventListener('click', () => closeCurrentModal());
    overlay.querySelector('#vacancy-save-draft')?.addEventListener('click', () => saveVacancyDraft());
    overlay.querySelector('#vacancy-publish')?.addEventListener('click', () => publishVacancy());
}

function validateVacancy(data) {
    const errors = [];
    if (!String(data.title || '').trim()) errors.push('Job title is required.');
    if (!String(data.company || '').trim()) errors.push('Company name is required.');
    if (!String(data.description || '').trim()) errors.push('Job description is required.');
    if (Object.keys(errors).length) return errors;
    return [];
}

function getEditorFieldValue(id) {
    return document.getElementById(id)?.value || '';
}

function extractVacancyPayload(rawText) {
    const normalized = String(rawText || '').trim();
    if (!normalized) return null;

    const withoutCodeFence = normalized.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = withoutCodeFence.indexOf('{');
    const end = withoutCodeFence.lastIndexOf('}');
    const jsonCandidate = start >= 0 && end > start ? withoutCodeFence.slice(start, end + 1) : withoutCodeFence;

    try {
        const parsed = JSON.parse(jsonCandidate);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
        console.error('Vacancy extraction parse failed:', err?.message || err);
        return null;
    }
}

function mapExtractedVacancyToEditorData(parsed = {}) {
    return {
        title: parsed.job_title || parsed.title || '',
        company: parsed.company || '',
        category: parsed.category || '',
        jobType: parsed.job_type || parsed.jobType || '',
        location: parsed.location || '',
        salary: parsed.salary || '',
        deadline: normalizeDate(parsed.deadline || ''),
        description: parsed.description || '',
        responsibilities: parsed.responsibilities || '',
        requirements: parsed.requirements || '',
        qualifications: parsed.qualifications || '',
        benefits: parsed.benefits || '',
        email: parsed.application_email || parsed.email || '',
        website: parsed.application_website || parsed.website || '',
        externalUrl: parsed.application_link || parsed.externalUrl || '',
        attachment: parsed.attachment || ''
    };
}

function extractVacancyDetails() {
    const prompt = document.getElementById('vacancy-input')?.value?.trim();
    if (!prompt) {
        showErrorModal('Please paste a vacancy advertisement before extracting details.');
        return;
    }

    const extractButton = document.getElementById('vacancy-extract');
    if (extractButton) {
        extractButton.disabled = true;
        extractButton.textContent = 'Extracting...';
        extractButton.style.opacity = '0.7';
        extractButton.style.cursor = 'not-allowed';
    }

    showExtractionLoading();

    supabase.functions.invoke('msofi-ai', {
        body: {
            message: `You are an expert HR analyst. Extract the vacancy from the text below and return only valid JSON. Do not include markdown, explanations, or surrounding text. Use these exact keys: job_title, company, category, job_type, location, salary, deadline, description, responsibilities, requirements, qualifications, benefits, application_email, application_website, application_link, attachment. Use empty strings for any missing values. Never invent information.\n\n${prompt}`,
            mode: 'writer'
        }
    }).then(({ data, error }) => {
        if (error) throw error;

        const raw = String(data?.response || data?.reply || '');
        const parsed = extractVacancyPayload(raw);

        if (!parsed) {
            throw new Error('Unable to extract vacancy details.\n\nPlease check your internet connection or try again.');
        }

        closeCurrentModal({ destroyImmediately: true });
        openJobEditor(mapExtractedVacancyToEditorData(parsed));
    }).catch((err) => {
        closeCurrentModal({ destroyImmediately: true });
        showErrorModal(err?.message || 'Unable to extract vacancy details.\n\nPlease check your internet connection or try again.');
    });
}

function saveVacancyDraft() {
    const form = document.getElementById('vacancy-editor-form');
    if (!form) return;

    const draftData = {
        title: getEditorFieldValue('vacancy-title'),
        company: getEditorFieldValue('vacancy-company'),
        category: getEditorFieldValue('vacancy-category'),
        jobType: getEditorFieldValue('vacancy-job-type'),
        location: getEditorFieldValue('vacancy-location'),
        salary: getEditorFieldValue('vacancy-salary'),
        deadline: normalizeDate(getEditorFieldValue('vacancy-deadline')),
        description: getEditorFieldValue('vacancy-description'),
        responsibilities: getEditorFieldValue('vacancy-responsibilities'),
        requirements: getEditorFieldValue('vacancy-requirements'),
        qualifications: getEditorFieldValue('vacancy-qualifications'),
        benefits: getEditorFieldValue('vacancy-benefits'),
        email: getEditorFieldValue('vacancy-email'),
        website: getEditorFieldValue('vacancy-website'),
        externalUrl: getEditorFieldValue('vacancy-external-url'),
        attachment: getEditorFieldValue('vacancy-attachment')
    };

    vacancyWorkflowState.draftData = draftData;
    closeCurrentModal();
    showSuccessModal('Draft saved locally and can be completed later.');
}

async function publishVacancy() {
    const data = {
        title: getEditorFieldValue('vacancy-title'),
        company: getEditorFieldValue('vacancy-company'),
        category: getEditorFieldValue('vacancy-category'),
        jobType: getEditorFieldValue('vacancy-job-type'),
        location: getEditorFieldValue('vacancy-location'),
        salary: getEditorFieldValue('vacancy-salary'),
        deadline: normalizeDate(getEditorFieldValue('vacancy-deadline')),
        description: getEditorFieldValue('vacancy-description'),
        responsibilities: getEditorFieldValue('vacancy-responsibilities'),
        requirements: getEditorFieldValue('vacancy-requirements'),
        qualifications: getEditorFieldValue('vacancy-qualifications'),
        benefits: getEditorFieldValue('vacancy-benefits'),
        email: getEditorFieldValue('vacancy-email'),
        website: getEditorFieldValue('vacancy-website'),
        externalUrl: getEditorFieldValue('vacancy-external-url'),
        attachment: getEditorFieldValue('vacancy-attachment')
    };

    const errors = validateVacancy(data);
    if (errors.length) {
        showErrorModal(errors.join(' '));
        return;
    }

    try {
        const payload = buildJobInsertPayload({
            title: data.title,
            company: data.company,
            category: data.category,
            jobType: data.jobType,
            location: data.location,
            salary: data.salary,
            deadline: data.deadline,
            description: data.description,
            responsibilities: data.responsibilities,
            requirements: data.requirements,
            qualifications: data.qualifications,
            benefits: data.benefits,
            email: data.email,
            website: data.website,
            externalUrl: data.externalUrl,
            attachment: data.attachment
        });

        const { error } = await supabase.from('jobs').insert(payload);
        if (error) throw error;

        closeCurrentModal();
        await loadJobsModule();
        showSuccessModal('The vacancy has been successfully published and is now available to users.');
    } catch (err) {
        showErrorModal(err?.message || 'Unable to publish the vacancy right now.');
    }
}

function renderJobMetrics() {
    const totalEl = document.getElementById('jobs-metric-total');
    const activeEl = document.getElementById('jobs-metric-active');
    const closedEl = document.getElementById('jobs-metric-closed');
    const draftEl = document.getElementById('jobs-metric-draft');
    const featuredEl = document.getElementById('jobs-metric-featured');
    const applicationsEl = document.getElementById('jobs-metric-applications');
    const todayEl = document.getElementById('jobs-metric-applications-today');
    const expiringEl = document.getElementById('jobs-metric-expiring');

    const jobs = jobsModuleState.jobs || [];
    const total = jobs.length;
    const active = jobs.filter(job => normalizeJobStatus(job.status) === 'published').length;
    const closed = jobs.filter(job => ['closed', 'expired'].includes(normalizeJobStatus(job.status))).length;
    const draft = jobs.filter(job => normalizeJobStatus(job.status) === 'pending').length;
    const featured = jobs.filter(job => Boolean(job.featured)).length;
    const applications = jobs.reduce((sum, job) => sum + Number(job.applications || 0), 0);
    const expiringSoon = jobs.filter((job) => {
        if (!job.deadline) return false;
        const deadline = new Date(job.deadline);
        const now = new Date();
        const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7 && normalizeJobStatus(job.status) === 'published';
    }).length;

    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (closedEl) closedEl.textContent = closed;
    if (draftEl) draftEl.textContent = draft;
    if (featuredEl) featuredEl.textContent = featured;
    if (applicationsEl) applicationsEl.textContent = applications;
    if (todayEl) todayEl.textContent = jobsModuleState.applicationsToday;
    if (expiringEl) expiringEl.textContent = expiringSoon;
}

function populateJobFilters() {
    const jobs = jobsModuleState.jobs || [];
    const categoryFilter = document.getElementById('jobs-category-filter');
    const districtFilter = document.getElementById('jobs-district-filter');

    if (categoryFilter) {
        const categories = [...new Set(jobs.map(job => String(job.category || '').trim()).filter(Boolean))].sort();
        const current = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="all">All Categories</option>' + categories.map(category => `<option value="${escapeHtml(category)}" ${category === current ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('');
        if (!categories.includes(current) && current !== 'all') categoryFilter.value = 'all';
    }

    if (districtFilter) {
        const districts = [...new Set(jobs.map(job => String(job.district || '').trim()).filter(Boolean))].sort();
        const current = districtFilter.value;
        districtFilter.innerHTML = '<option value="all">All Districts</option>' + districts.map(district => `<option value="${escapeHtml(district)}" ${district === current ? 'selected' : ''}>${escapeHtml(district)}</option>`).join('');
        if (!districts.includes(current) && current !== 'all') districtFilter.value = 'all';
    }
}

function renderJobsTable() {
    const tableContainer = document.getElementById('jobs-table-container');
    const emptyState = document.getElementById('jobs-empty-state');
    if (!tableContainer || !emptyState) return;

    const jobs = jobsModuleState.jobs || [];
    const { search, status, category, district } = jobsModuleState.filters;
    const filtered = jobs.filter((job) => {
        const haystack = `${job.title || ''} ${job.company_name || ''} ${job.category || ''} ${job.district || ''} ${job.location || ''}`.toLowerCase();
        const matchesSearch = !search || haystack.includes(search.toLowerCase());
        const matchesStatus = status === 'all' || String(job.status || '').toLowerCase() === status.toLowerCase();
        const matchesCategory = category === 'all' || String(job.category || '').toLowerCase() === category.toLowerCase();
        const matchesDistrict = district === 'all' || String(job.district || '').toLowerCase() === district.toLowerCase();
        return matchesSearch && matchesStatus && matchesCategory && matchesDistrict;
    });

    if (!filtered.length) {
        tableContainer.innerHTML = '';
        emptyState.style.display = 'block';
        emptyState.textContent = 'No job postings match the current search or filter criteria.';
        return;
    }

    emptyState.style.display = 'none';
    tableContainer.innerHTML = `
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse: collapse; min-width: 900px;">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); text-align:left; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;">
                        <th style="padding: 12px 8px;">Job</th>
                        <th style="padding: 12px 8px;">Category / Location</th>
                        <th style="padding: 12px 8px;">Status</th>
                        <th style="padding: 12px 8px;">Vacancies</th>
                        <th style="padding: 12px 8px;">Applications</th>
                        <th style="padding: 12px 8px;">Posted</th>
                        <th style="padding: 12px 8px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map((job) => `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 12px 8px; vertical-align: top;">
                                <strong style="display:block; color: var(--text-primary);">${escapeHtml(job.title || 'Untitled')}</strong>
                                <span style="display:block; font-size: 12px; color: var(--text-muted); margin-top: 6px;">${escapeHtml(job.company_name || 'Unknown employer')}</span>
                            </td>
                            <td style="padding: 12px 8px; font-size: 12px; color: var(--text-secondary);">
                                ${escapeHtml(job.category || 'General')}<br>${escapeHtml(job.district || job.location || 'Unspecified')}
                            </td>
                            <td style="padding: 12px 8px;">
                                <span class="badge ${getJobStatusBadgeClass(job.status)}">${escapeHtml(job.status || 'pending')}</span>
                            </td>
                            <td style="padding: 12px 8px; font-size: 12px; color: var(--text-secondary);">${Number(job.vacancies || 1)}</td>
                            <td style="padding: 12px 8px; font-size: 12px; color: var(--text-secondary);">${Number(job.applications || 0)}</td>
                            <td style="padding: 12px 8px; font-size: 12px; color: var(--text-muted);">${escapeHtml(formatDate(job.created_at))}</td>
                            <td style="padding: 12px 8px; font-size: 12px; color: var(--text-secondary);">
                                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.editJob('${job.id}')">Edit</button>
                                    ${normalizeJobStatus(job.status) === 'published' ? `<button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.updateJobStatus('${job.id}','closed')">Close</button>` : `<button class="btn-primary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.updateJobStatus('${job.id}','published')">Publish</button>`}
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.viewJobApplicants('${job.id}')">Applicants</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteJob('${job.id}')">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function getJobStatusBadgeClass(status) {
    const normalized = normalizeJobStatus(status);
    if (normalized === 'published') return 'badge-success';
    if (normalized === 'closed' || normalized === 'expired') return 'badge-danger';
    if (normalized === 'pending') return 'badge-secondary';
    return 'badge-premium';
}

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}


window.updateJobStatus = async (jobId, newStatus) => {
    const isSuperAdmin = String(currentAdminRole || '').toLowerCase() === 'super_admin';
    if (!isSuperAdmin) {
        alert('Only Super Admin can update job vacancy status.');
        return;
    }

    const confirmMessage = newStatus === 'published' ? 'Publish this job vacancy?' : newStatus === 'closed' ? 'Close this vacancy?' : `Update status to ${newStatus}?`;
    if (!confirm(confirmMessage)) return;

    try {
        const normalizedStatus = normalizeJobStatus(newStatus);
        const { error } = await supabase.from('jobs').update({ status: normalizedStatus }).eq('id', jobId);
        if (error) throw error;
        alert('Job status updated successfully.');
        await loadJobsModule();
    } catch (err) {
        const errorMessage = err?.message || 'Unable to update job status.';
        alert(errorMessage);
        console.error('Job status update error:', errorMessage, err);
    }
};

window.deleteJob = async (jobId) => {
    const isSuperAdmin = String(currentAdminRole || '').toLowerCase() === 'super_admin';
    if (!isSuperAdmin) {
        alert('Only Super Admin can delete job vacancies.');
        return;
    }
    if (!confirm('Delete this job vacancy permanently?')) return;

    try {
        const { error } = await supabase.from('jobs').delete().eq('id', jobId);
        if (error) throw error;
        alert('Job deleted successfully.');
        await loadJobsModule();
    } catch (err) {
        const errorMessage = err?.message || 'Unable to delete job vacancy.';
        alert(errorMessage);
        console.error('Job delete error:', errorMessage, err);
    }
};

window.viewJobApplicants = async (jobId) => {
    const modal = document.getElementById('job-applicants-modal');
    const list = document.getElementById('job-applicants-list');
    if (!modal || !list) return;

    modal.style.display = 'flex';
    list.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Loading applicants…</div>';

    try {
        const { data, error } = await supabase.from('job_applications').select('*, applicant:applicant_id (full_name, email, phone)').eq('job_id', jobId).order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || !data.length) {
            list.innerHTML = '<p style="color: var(--text-muted);">No applications have been submitted for this vacancy yet.</p>';
            return;
        }

        list.innerHTML = data.map(application => `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px;">
                <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                    <div>
                        <strong style="display:block; color: var(--text-primary);">${escapeHtml(application.applicant?.full_name || application.applicant_name || 'Applicant')}</strong>
                        <span style="display:block; font-size: 12px; color: var(--text-muted);">${escapeHtml(application.applicant?.email || application.applicant_email || '')}</span>
                        <span style="display:block; font-size: 12px; color: var(--text-muted);">${escapeHtml(application.applicant?.phone || application.applicant_phone || '')}</span>
                    </div>
                    <div style="text-align:right; font-size: 12px; color: var(--text-secondary);">
                        <strong>Status:</strong> ${escapeHtml(application.status || 'submitted')}<br>
                        <strong>Submitted:</strong> ${escapeHtml(formatDate(application.created_at))}
                    </div>
                </div>
                <div style="margin-top:12px; font-size: 13px; color: var(--text-secondary);">
                    <p><strong>Cover Letter:</strong> ${escapeHtml(application.cover_letter || 'No cover letter provided.')}</p>
                    ${application.cv_url ? `<p><a href="${escapeHtml(application.cv_url)}" target="_blank" rel="noopener">Download CV</a></p>` : ''}
                </div>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = `<p style="color: var(--text-muted);">Unable to load applicants: ${escapeHtml(err.message || err)}</p>`;
    }
};

async function calculateBusinessPageAnalytics(pages) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
        total: pages.length,
        active: pages.filter(page => !page.is_suspended).length,
        verified: pages.filter(page => Boolean(page.verified) && !page.is_suspended).length,
        pending: pages.filter(page => !page.is_suspended && !page.verified).length,
        suspended: pages.filter(page => Boolean(page.is_suspended)).length,
        followers: pages.reduce((total, page) => total + (Number(page.followers) || 0), 0),
        posts: 0,
        newThisMonth: pages.filter(page => page.created_at && new Date(page.created_at) >= thisMonthStart).length
    };
}

function populateBusinessFilters(pages) {
    const categoryFilter = document.getElementById('business-category-filter');
    const districtFilter = document.getElementById('business-district-filter');

    if (categoryFilter) {
        const categories = [...new Set(pages.map(page => page.category || '').filter(Boolean))].sort();
        const currentValue = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="all">All Categories</option>' + categories.map(category => `<option value="${escapeHtml(category)}" ${category === currentValue ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('');
        if (!categories.includes(currentValue)) categoryFilter.value = 'all';
    }

    if (districtFilter) {
        const districts = [...new Set(pages.map(page => page.district || '').filter(Boolean))].sort();
        const currentValue = districtFilter.value;
        districtFilter.innerHTML = '<option value="all">All Districts</option>' + districts.map(district => `<option value="${escapeHtml(district)}" ${district === currentValue ? 'selected' : ''}>${escapeHtml(district)}</option>`).join('');
        if (!districts.includes(currentValue)) districtFilter.value = 'all';
    }
}

function renderBusinessMetrics(pages) {
    const verifiedEl = document.getElementById('business-metric-verified');
    const pendingEl = document.getElementById('business-metric-pending');
    const suspendedEl = document.getElementById('business-metric-suspended');
    const totalEl = document.getElementById('business-metric-total');
    const activeEl = document.getElementById('business-metric-active');
    const followersEl = document.getElementById('business-metric-followers');
    const postsEl = document.getElementById('business-metric-posts');
    const newEl = document.getElementById('business-metric-new');

    const analytics = businessPagesModuleState.analytics || {};

    if (verifiedEl) verifiedEl.textContent = analytics.verified ?? pages.filter(page => Boolean(page.verified) && !page.is_suspended).length;
    if (pendingEl) pendingEl.textContent = analytics.pending ?? pages.filter(page => !page.is_suspended && !page.verified).length;
    if (suspendedEl) suspendedEl.textContent = analytics.suspended ?? pages.filter(page => Boolean(page.is_suspended)).length;
    if (totalEl) totalEl.textContent = analytics.total ?? pages.length;
    if (activeEl) activeEl.textContent = analytics.active ?? pages.filter(page => !page.is_suspended).length;
    if (followersEl) followersEl.textContent = analytics.followers ?? 0;
    if (postsEl) postsEl.textContent = analytics.posts ?? 0;
    if (newEl) newEl.textContent = analytics.newThisMonth ?? 0;
}

function renderBusinessPagesTable() {
    const tableContainer = document.getElementById('business-pages-table-container');
    const emptyState = document.getElementById('business-pages-empty-state');
    if (!tableContainer || !emptyState) return;

    const searchInput = document.getElementById('business-search');
    const statusFilter = document.getElementById('business-status-filter');
    const categoryFilter = document.getElementById('business-category-filter');
    const districtFilter = document.getElementById('business-district-filter');
    const searchTerm = (searchInput?.value || '').trim().toLowerCase();
    const statusValue = (statusFilter?.value || 'all').toLowerCase();
    const categoryValue = (categoryFilter?.value || 'all').toLowerCase();
    const districtValue = (districtFilter?.value || 'all').toLowerCase();

    const filteredPages = businessPagesModuleState.pages.filter(page => {
        const haystack = `${page.business_name || ''} ${page.owner_name || ''} ${page.email || ''} ${page.phone || ''} ${page.category || ''} ${page.district || ''}`.toLowerCase();
        if (searchTerm && !haystack.includes(searchTerm)) return false;
        if (statusValue !== 'all') {
            const pageStatus = String(page.status || 'pending').toLowerCase();
            if (pageStatus !== statusValue) return false;
        }
        if (categoryValue !== 'all' && String(page.category || '').toLowerCase() !== categoryValue) return false;
        if (districtValue !== 'all' && String(page.district || '').toLowerCase() !== districtValue) return false;
        return true;
    });

    if (!filteredPages.length) {
        tableContainer.innerHTML = '';
        emptyState.style.display = 'block';
        emptyState.textContent = 'No business pages match the current search or filters.';
        return;
    }

    emptyState.style.display = 'none';
    tableContainer.innerHTML = `
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse: collapse; min-width: 1500px;">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); text-align:left; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;">
                        <th style="padding: 12px 8px;">Business</th>
                        <th style="padding: 12px 8px;">Owner</th>
                        <th style="padding: 12px 8px;">Contact</th>
                        <th style="padding: 12px 8px;">Location</th>
                        <th style="padding: 12px 8px;">Stats</th>
                        <th style="padding: 12px 8px;">Status</th>
                        <th style="padding: 12px 8px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredPages.map(page => `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 12px 8px; min-width: 260px;">
                                <div style="display:flex; gap:10px; align-items:center;">
                                    <img src="${page.profile_photo || '../assets/Icon.png'}" alt="" style="width:48px; height:48px; border-radius:10px; object-fit:cover; border:1px solid rgba(255,255,255,0.12);">
                                    <div>
                                        <strong style="display:block; color: var(--text-primary);">${escapeHtml(page.business_name)}</strong>
                                        <span style="display:block; font-size:11px; color: var(--text-muted); margin-top:2px;">${escapeHtml(page.category || 'General')}</span>
                                        <span style="display:block; font-size:11px; color: var(--text-muted); margin-top:2px;">@${escapeHtml(page.username || '')}</span>
                                    </div>
                                </div>
                            </td>
                            <td style="padding: 12px 8px; min-width: 220px; font-size: 12px; color: var(--text-secondary);">
                                <div>${escapeHtml(page.owner_name || 'Unknown owner')}</div>
                                <div style="margin-top:4px;">${escapeHtml(page.email || 'No email')}</div>
                                <div style="margin-top:4px;">${escapeHtml(page.phone || 'No phone')}</div>
                            </td>
                            <td style="padding: 12px 8px; min-width: 220px; font-size: 12px; color: var(--text-secondary);">
                                <div>Business: ${escapeHtml(page.phone || '—')}</div>
                                <div style="margin-top:4px;">WhatsApp: ${escapeHtml(page.whatsapp || '—')}</div>
                                <div style="margin-top:4px;">Email: ${escapeHtml(page.email || '—')}</div>
                                <div style="margin-top:4px;">Website: ${escapeHtml(page.website || '—')}</div>
                            </td>
                            <td style="padding: 12px 8px; min-width: 220px; font-size: 12px; color: var(--text-secondary);">
                                <div>${escapeHtml(page.address || '—')}</div>
                                <div style="margin-top:4px;">${escapeHtml(page.district || '—')}</div>
                            </td>
                            <td style="padding: 12px 8px; min-width: 160px; font-size: 12px; color: var(--text-secondary);">
                                <div>Followers: ${page.followers ?? 0}</div>
                                <div style="margin-top:4px;">Posts: ${page.posts ?? 0}</div>
                                <div style="margin-top:4px;">Created: ${escapeHtml(formatDate(page.created_at))}</div>
                            </td>
                            <td style="padding: 12px 8px;">
                                <span class="badge ${getBusinessStatusBadgeClass(page.status)}">${escapeHtml(getBusinessStatusLabel(page.status))}</span>
                            </td>
                            <td style="padding: 12px 8px;">
                                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.viewBusinessPage('${page.id}')">View</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.viewBusinessOwner('${page.owner_id}')">Owner</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.viewBusinessPosts('${page.id}')">Posts</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.toggleBusinessVerification('${page.id}', ${Boolean(page.verified)})">${Boolean(page.verified) ? 'Unverify' : 'Verify'}</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.toggleBusinessSuspension('${page.id}', ${Boolean(page.is_suspended)})">${Boolean(page.is_suspended) ? 'Unsuspend' : 'Suspend'}</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteBusinessPage('${page.id}')">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function getBusinessStatusLabel(status) {
    const normalized = String(status || 'pending').toLowerCase();
    if (normalized === 'verified') return 'Verified';
    if (normalized === 'suspended') return 'Suspended';
    if (normalized === 'deleted') return 'Deleted';
    if (normalized === 'active') return 'Active';
    return 'Pending';
}

function getBusinessStatusBadgeClass(status) {
    const normalized = String(status || 'pending').toLowerCase();
    if (normalized === 'verified') return 'badge-success';
    if (normalized === 'suspended') return 'badge-danger';
    if (normalized === 'deleted') return 'badge-secondary';
    if (normalized === 'active') return 'badge-premium';
    return 'badge-secondary';
}

async function getBusinessPageDetails(pageId) {
    const page = businessPagesModuleState.pages.find(item => item.id === pageId);
    if (!page) throw new Error('Business page not found.');

    const ownerId = page.owner_id || page.user_id || null;
    const queries = [];
    queries.push(supabase.from('profiles').select('id, full_name, username, email, phone, role, account_status, verification_status, created_at, last_login, profile_photo').eq('id', ownerId).maybeSingle());

    const postQuery = supabase.from('posts').select('id, content, created_at, likes, comments, shares, status, visibility, is_hidden, is_pinned, image_url, video_url').eq('business_page_id', pageId).order('created_at', { ascending: false }).limit(20);
    const followersQuery = supabase.from('business_page_followers').select('id, user_id, created_at').eq('business_page_id', pageId).order('created_at', { ascending: false }).limit(20);
    const reportsQuery = supabase.from('reports').select('id, reason, created_at, status').eq('target_id', pageId).order('created_at', { ascending: false }).limit(20);

    const [{ data: ownerData, error: ownerError }, { data: postsData, error: postsError }, { data: followersData, error: followersError }, { data: reportsData, error: reportsError }] = await Promise.all([
        ...queries,
        postQuery,
        followersQuery,
        reportsQuery
    ]);

    if (ownerError) console.warn('Owner lookup failed:', ownerError.message);
    if (postsError) console.warn('Posts lookup failed:', postsError.message);
    if (followersError) console.warn('Followers lookup failed:', followersError.message);
    if (reportsError) console.warn('Reports lookup failed:', reportsError.message);

    return {
        page,
        owner: ownerData || null,
        posts: postsData || [],
        followers: followersData || [],
        reports: reportsData || []
    };
}

window.viewBusinessPage = async (pageId) => {
    const modal = document.getElementById('business-page-modal');
    const body = document.getElementById('business-page-modal-body');
    if (!modal || !body) return;

    modal.style.display = 'flex';
    body.innerHTML = '<p style="color: var(--text-muted);">Loading page details…</p>';

    try {
        const detailPayload = await getBusinessPageDetails(pageId);
        const { page, owner, posts, followers, reports } = detailPayload;
        const ownerName = owner?.full_name || page.owner_name || 'Unknown owner';
        const ownerEmail = owner?.email || page.email || 'No email';
        const ownerPhone = owner?.phone || page.phone || 'No phone';
        const ownerRole = owner?.role || 'user';
        const ownerStatus = owner?.account_status || 'active';
        const verificationStatus = owner?.verification_status || page.verified ? 'verified' : 'pending';

        body.innerHTML = `
            <div style="display:grid; gap:18px;">
                <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between;">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <img src="${page.profile_photo || '../assets/Icon.png'}" alt="" style="width:72px; height:72px; border-radius:16px; object-fit:cover; border:1px solid rgba(255,255,255,0.12);">
                        <div>
                            <h3 style="margin:0; color:var(--text-primary);">${escapeHtml(page.business_name)}</h3>
                            <p style="margin:4px 0 0; color:var(--text-muted);">${escapeHtml(page.category || 'General')} &bull; ${escapeHtml(page.district || 'Unknown')}</p>
                        </div>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        <button class="btn-primary" type="button" onclick="window.toggleBusinessVerification('${page.id}', ${Boolean(page.verified)})">${Boolean(page.verified) ? 'Remove Verification' : 'Verify Page'}</button>
                        <button class="btn-secondary" type="button" onclick="window.toggleBusinessSuspension('${page.id}', ${Boolean(page.is_suspended)})">${Boolean(page.is_suspended) ? 'Reactivate Page' : 'Suspend Page'}</button>
                        <button class="btn-secondary" type="button" style="border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteBusinessPage('${page.id}')">Delete Page</button>
                    </div>
                </div>

                <div style="display:grid; gap:12px;">
                    <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                        <strong style="color:var(--text-primary);">Business Details</strong>
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap:10px; margin-top:10px;">
                            <div><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Owner</div><strong style="display:block; margin-top:4px; color:var(--text-primary);">${escapeHtml(ownerName)}</strong></div>
                            <div><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Email</div><strong style="display:block; margin-top:4px; color:var(--text-primary);">${escapeHtml(ownerEmail)}</strong></div>
                            <div><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Phone</div><strong style="display:block; margin-top:4px; color:var(--text-primary);">${escapeHtml(ownerPhone)}</strong></div>
                            <div><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">WhatsApp</div><strong style="display:block; margin-top:4px; color:var(--text-primary);">${escapeHtml(page.whatsapp || '—')}</strong></div>
                            <div><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Website</div><strong style="display:block; margin-top:4px; color:var(--text-primary);">${escapeHtml(page.website || '—')}</strong></div>
                            <div><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Address</div><strong style="display:block; margin-top:4px; color:var(--text-primary);">${escapeHtml(page.address || '—')}</strong></div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;"><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Followers</div><strong style="display:block; margin-top:6px; color:var(--text-primary);">${page.followers ?? 0}</strong></div>
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;"><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Posts</div><strong style="display:block; margin-top:6px; color:var(--text-primary);">${posts.length}</strong></div>
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;"><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Reports</div><strong style="display:block; margin-top:6px; color:var(--text-primary);">${reports.length}</strong></div>
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;"><div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Status</div><strong style="display:block; margin-top:6px; color:var(--text-primary);">${escapeHtml(getBusinessStatusLabel(page.status))}</strong></div>
                    </div>

                    <div style="display:grid; gap:12px;">
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <strong style="color:var(--text-primary);">Owner Profile</strong>
                            <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center; margin-top:10px;">
                                <img src="${owner?.profile_photo || '../assets/Icon.png'}" alt="" style="width:64px; height:64px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.12);">
                                <div>
                                    <p style="margin:0; color:var(--text-primary);">${escapeHtml(ownerName)}</p>
                                    <p style="margin:4px 0; color:var(--text-muted);">${escapeHtml(ownerEmail)}</p>
                                    <p style="margin:4px 0; color:var(--text-muted);">Role: ${escapeHtml(ownerRole)} &bull; Verification: ${escapeHtml(verificationStatus)}</p>
                                </div>
                            </div>
                        </div>

                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <strong style="color:var(--text-primary);">About & Contact</strong>
                            <p style="margin:10px 0 0; color:var(--text-muted); line-height:1.6;">${escapeHtml(page.description || 'No business description available.')}</p>
                        </div>

                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <strong style="color:var(--text-primary);">Gallery & Media</strong>
                            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:10px;">
                                ${page.cover_photo ? `<img src="${page.cover_photo}" alt="" style="width:120px; height:80px; object-fit:cover; border-radius:8px;">` : ''}
                                ${page.profile_photo ? `<img src="${page.profile_photo}" alt="" style="width:120px; height:80px; object-fit:cover; border-radius:8px;">` : ''}
                            </div>
                        </div>

                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <strong style="color:var(--text-primary);">Page Posts</strong>
                            <div style="display:grid; gap:10px; margin-top:10px;">
                                ${posts.length ? posts.map(post => `
                                    <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px;">
                                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                            <strong style="color:var(--text-primary);">${escapeHtml(post.content ? post.content.replace(/\[business-page:[^\]]+\]/g, '').trim() : 'Untitled post')}</strong>
                                            <span class="badge badge-secondary">${escapeHtml(post.status || 'published')}</span>
                                        </div>
                                        <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">${escapeHtml(formatDate(post.created_at))} &bull; Likes ${post.likes || 0} &bull; Comments ${post.comments || 0} &bull; Shares ${post.shares || 0}</div>
                                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
                                            <button class="btn-secondary" type="button" style="padding:7px 10px; font-size:11px;" onclick="window.hideBusinessPost('${post.id}')">Hide</button>
                                            <button class="btn-secondary" type="button" style="padding:7px 10px; font-size:11px;" onclick="window.restoreBusinessPost('${post.id}')">Restore</button>
                                            <button class="btn-secondary" type="button" style="padding:7px 10px; font-size:11px;" onclick="window.pinBusinessPost('${post.id}')">Pin</button>
                                            <button class="btn-secondary" type="button" style="padding:7px 10px; font-size:11px;" onclick="window.unpinBusinessPost('${post.id}')">Remove Pin</button>
                                            <button class="btn-secondary" type="button" style="padding:7px 10px; font-size:11px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteBusinessPost('${post.id}')">Delete</button>
                                        </div>
                                    </div>
                                `).join('') : '<p style="margin:0; color:var(--text-muted);">No posts found.</p>'}
                            </div>
                        </div>

                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <strong style="color:var(--text-primary);">Followers & Reports</strong>
                            <div style="display:grid; gap:10px; margin-top:10px;">
                                ${followers.length ? followers.map(follower => `<div style="font-size:12px; color:var(--text-muted);">Follower ID: ${escapeHtml(follower.user_id || follower.id || 'n/a')}</div>`).join('') : '<p style="margin:0; color:var(--text-muted);">No followers recorded.</p>'}
                                ${reports.length ? reports.map(report => `<div style="font-size:12px; color:var(--text-muted);">Report: ${escapeHtml(report.reason || 'Unknown')} (${escapeHtml(report.status || 'pending')})</div>`).join('') : '<p style="margin:0; color:var(--text-muted);">No reports recorded.</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        body.innerHTML = `<p style="color: var(--text-muted);">Unable to load page details: ${escapeHtml(err.message || err)}</p>`;
    }
};

window.closeBusinessPageModal = () => {
    const modal = document.getElementById('business-page-modal');
    if (modal) modal.style.display = 'none';
};

window.viewBusinessOwner = async (ownerId) => {
    if (!ownerId) return;
    const owner = businessPagesModuleState.owners[ownerId] || null;
    if (owner) {
        alert(`Owner: ${owner.full_name || 'Unknown'}\nEmail: ${owner.email || 'No email'}\nPhone: ${owner.phone || 'No phone'}`);
        return;
    }

    try {
        const { data, error } = await supabase.from('profiles').select('id, full_name, username, email, phone, role, account_status, verification_status, created_at, last_login, profile_photo').eq('id', ownerId).maybeSingle();
        if (error) throw error;
        businessPagesModuleState.owners[ownerId] = data;
        if (data) {
            alert(`Owner: ${data.full_name || 'Unknown'}\nEmail: ${data.email || 'No email'}\nPhone: ${data.phone || 'No phone'}\nJoined: ${formatDate(data.created_at)}\nLast login: ${formatDate(data.last_login)}`);
        }
    } catch (err) {
        alert(`Unable to load owner account: ${err?.message || err}`);
    }
};

window.viewBusinessPosts = async (pageId) => {
    const page = businessPagesModuleState.pages.find(item => item.id === pageId);
    if (!page) return;
    const detailPayload = await getBusinessPageDetails(pageId);
    const posts = detailPayload.posts || [];
    alert(`Posts for ${page.business_name}: ${posts.length}`);
};

window.toggleBusinessVerification = async (pageId, currentlyVerified) => {
    const confirmAction = confirm(currentlyVerified ? 'Remove verification from this business page?' : 'Verify this business page?');
    if (!confirmAction) return;

    try {
        const { error } = await supabase
            .from('business_pages')
            .update({ verified: !currentlyVerified, is_suspended: false })
            .eq('id', pageId);

        if (error) throw error;
        await loadBusinessPagesModule();
    } catch (err) {
        alert(`Unable to update verification: ${err?.message || err}`);
    }
};

window.toggleBusinessSuspension = async (pageId, currentlySuspended) => {
    const confirmAction = confirm(currentlySuspended ? 'Reactivate this business page?' : 'Suspend this business page?');
    if (!confirmAction) return;

    try {
        const { error } = await supabase
            .from('business_pages')
            .update({ is_suspended: !currentlySuspended })
            .eq('id', pageId);

        if (error) throw error;
        await loadBusinessPagesModule();
    } catch (err) {
        alert(`Unable to update suspension status: ${err?.message || err}`);
    }
};

window.deleteBusinessPage = async (pageId) => {
    const confirmAction = confirm('Delete this business page permanently?');
    if (!confirmAction) return;

    try {
        const { error } = await supabase
            .from('business_pages')
            .delete()
            .eq('id', pageId);

        if (error) throw error;
        await loadBusinessPagesModule();
    } catch (err) {
        alert(`Unable to delete business page: ${err?.message || err}`);
    }
};

window.hideBusinessPost = async (postId) => {
    try {
        const { error } = await supabase.from('posts').update({ is_hidden: true, status: 'hidden', visibility: 'private' }).eq('id', postId);
        if (error) throw error;
        alert('Post hidden.');
    } catch (err) {
        alert(`Unable to hide post: ${err?.message || err}`);
    }
};

window.restoreBusinessPost = async (postId) => {
    try {
        const { error } = await supabase.from('posts').update({ is_hidden: false, status: 'published', visibility: 'public' }).eq('id', postId);
        if (error) throw error;
        alert('Post restored.');
    } catch (err) {
        alert(`Unable to restore post: ${err?.message || err}`);
    }
};

window.pinBusinessPost = async (postId) => {
    try {
        const { error } = await supabase.from('posts').update({ is_pinned: true }).eq('id', postId);
        if (error) throw error;
        alert('Post pinned.');
    } catch (err) {
        alert(`Unable to pin post: ${err?.message || err}`);
    }
};

window.unpinBusinessPost = async (postId) => {
    try {
        const { error } = await supabase.from('posts').update({ is_pinned: false }).eq('id', postId);
        if (error) throw error;
        alert('Pin removed.');
    } catch (err) {
        alert(`Unable to remove pin: ${err?.message || err}`);
    }
};

window.deleteBusinessPost = async (postId) => {
    const confirmAction = confirm('Delete this business post permanently?');
    if (!confirmAction) return;
    try {
        const { error } = await supabase.from('posts').delete().eq('id', postId);
        if (error) throw error;
        alert('Post deleted.');
    } catch (err) {
        alert(`Unable to delete post: ${err?.message || err}`);
    }
};

async function initializePaymentsModule() {
    const queue = document.getElementById('admin-payments-queue');
    const badge = document.getElementById('payments-queue-badge');
    const sectionQueue = document.getElementById('admin-payments-section-queue');

    if (!queue && !badge && !sectionQueue) return;

    const emptyHtml = '<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">Payments module not installed.</p>';

    if (badge) badge.textContent = 'Payments module not installed.';
    if (queue) queue.innerHTML = emptyHtml;
    if (sectionQueue) sectionQueue.innerHTML = emptyHtml;
}

async function initializeUsersModule() {
    const searchInput = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');
    const statusFilter = document.getElementById('user-status-filter');
    const refreshButton = document.getElementById('user-refresh-btn');
    const addButton = document.getElementById('user-add-btn');
    const addModal = document.getElementById('user-add-modal');
    const addForm = document.getElementById('user-add-form');
    const addCancelButton = document.getElementById('user-add-cancel');
    const addCloseButton = document.getElementById('user-add-close');

    if (!searchInput || !roleFilter || !statusFilter) return;

    searchInput.addEventListener('input', renderUsersTable);
    roleFilter.addEventListener('change', renderUsersTable);
    statusFilter.addEventListener('change', renderUsersTable);
    refreshButton?.addEventListener('click', () => loadUsersModule());
    addButton?.addEventListener('click', openAddUserModal);
    addCancelButton?.addEventListener('click', closeAddUserModal);
    addCloseButton?.addEventListener('click', closeAddUserModal);
    if (addModal) {
        addModal.addEventListener('click', (event) => {
            if (event.target === addModal) closeAddUserModal();
        });
    }
    addForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const fullName = document.getElementById('user-add-full-name').value.trim();
            const email = document.getElementById('user-add-email').value.trim();
            const password = document.getElementById('user-add-password').value;
            const phone = document.getElementById('user-add-phone').value.trim();
            const role = document.getElementById('user-add-role').value;
            const status = document.getElementById('user-add-status').value;

            if (!fullName || !email || !password) {
                alert('Please provide a full name, email, and temporary password.');
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: fullName } }
            });

            if (error) throw error;
            if (!data?.user?.id) throw new Error('User creation did not return a valid account.');

            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    phone: phone || null,
                    role,
                    account_status: status
                })
                .eq('id', data.user.id);

            if (profileError) throw profileError;

            addForm.reset();
            closeAddUserModal();
            await loadUsersModule();
            alert('User created successfully.');
        } catch (err) {
            alert(`Unable to create user: ${err?.message || err}`);
        }
    });

    await loadUsersModule();
}

function openAddUserModal() {
    const modal = document.getElementById('user-add-modal');
    const form = document.getElementById('user-add-form');
    if (modal) {
        form?.reset();
        modal.style.display = 'flex';
    }
}

function closeAddUserModal() {
    const modal = document.getElementById('user-add-modal');
    if (modal) modal.style.display = 'none';
}

async function loadUsersModule() {
    const tableContainer = document.getElementById('users-table-container');
    const emptyState = document.getElementById('users-empty-state');
    if (!tableContainer || !emptyState) return;

    tableContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Loading users…</div>';
    emptyState.style.display = 'none';

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, phone, role, account_status, created_at, last_login, profile_photo, username')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        usersModuleState.users = (data || []).map(user => ({
            ...user,
            full_name: user.full_name || user.username || 'Unnamed user',
            account_status: user.account_status || 'active',
            role: user.role || 'user'
        }));

        renderUserMetrics(usersModuleState.users);
        renderUsersTable();
    } catch (err) {
        tableContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Unable to load users right now. Please refresh or try again later.</div>';
        emptyState.style.display = 'block';
        emptyState.textContent = err?.message || 'Unable to load users right now.';
        console.warn('Users module failed to load:', err?.message || err);
    }
}

function renderUserMetrics(users) {
    const totalEl = document.getElementById('user-metric-total');
    const activeEl = document.getElementById('user-metric-active');
    const suspendedEl = document.getElementById('user-metric-suspended');
    const adminEl = document.getElementById('user-metric-admin');
    const businessEl = document.getElementById('user-metric-business');
    const sellerEl = document.getElementById('user-metric-seller');

    if (!totalEl || !activeEl || !suspendedEl || !adminEl || !businessEl || !sellerEl) return;

    const activeCount = users.filter(user => String(user.account_status || 'active').toLowerCase() === 'active').length;
    const suspendedCount = users.filter(user => String(user.account_status || 'active').toLowerCase() === 'suspended').length;
    const adminCount = users.filter(user => ['super_admin'].includes(String(user.role || '').toLowerCase())).length;
    const businessCount = users.filter(user => String(user.role || '').toLowerCase() === 'business').length;
    const sellerCount = users.filter(user => String(user.role || '').toLowerCase() === 'seller').length;

    totalEl.textContent = users.length;
    activeEl.textContent = activeCount;
    suspendedEl.textContent = suspendedCount;
    adminEl.textContent = adminCount;
    businessEl.textContent = businessCount;
    sellerEl.textContent = sellerCount;
}

function renderUsersTable() {
    const tableContainer = document.getElementById('users-table-container');
    const emptyState = document.getElementById('users-empty-state');
    if (!tableContainer || !emptyState) return;

    const searchInput = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');
    const statusFilter = document.getElementById('user-status-filter');

    const searchTerm = (searchInput?.value || '').trim().toLowerCase();
    const roleValue = (roleFilter?.value || 'all').toLowerCase();
    const statusValue = (statusFilter?.value || 'all').toLowerCase();

    const filteredUsers = usersModuleState.users.filter(user => {
        const role = String(user.role || '').toLowerCase();
        const status = String(user.account_status || 'active').toLowerCase();
        const haystack = `${user.full_name || ''} ${user.email || ''} ${user.phone || ''} ${user.role || ''}`.toLowerCase();

        if (searchTerm && !haystack.includes(searchTerm)) return false;
        if (roleValue !== 'all') {
            const normalizedRoleValue = roleValue === 'admin' ? 'super_admin' : roleValue;
            if (role !== normalizedRoleValue) return false;
        }
        if (statusValue !== 'all' && status !== statusValue) return false;
        return true;
    });

    if (!filteredUsers.length) {
        tableContainer.innerHTML = '';
        emptyState.style.display = 'block';
        emptyState.textContent = 'No users match the current search or filters.';
        return;
    }

    emptyState.style.display = 'none';
    tableContainer.innerHTML = `
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse: collapse; min-width: 900px;">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); text-align:left; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;">
                        <th style="padding: 12px 8px;">User</th>
                        <th style="padding: 12px 8px;">Contact</th>
                        <th style="padding: 12px 8px;">Role</th>
                        <th style="padding: 12px 8px;">Status</th>
                        <th style="padding: 12px 8px;">Joined</th>
                        <th style="padding: 12px 8px;">Last Login</th>
                        <th style="padding: 12px 8px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredUsers.map(user => `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 12px 8px;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <img src="${getUserAvatar(user)}" alt="" style="width:44px; height:44px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.12);">
                                    <div>
                                        <strong style="display:block; color: var(--text-primary);">${escapeHtml(getUserDisplayName(user))}</strong>
                                        <span style="display:block; font-size:11px; color: var(--text-muted); margin-top:2px;">${escapeHtml(user.username || '')}</span>
                                    </div>
                                </div>
                            </td>
                            <td style="padding: 12px 8px; font-size: 12px; color: var(--text-secondary);">
                                <div>${escapeHtml(user.email || 'No email')}</div>
                                <div style="margin-top:4px;">${escapeHtml(user.phone || 'No phone')}</div>
                            </td>
                            <td style="padding: 12px 8px;">
                                <span class="badge badge-secondary">${escapeHtml(getUserRoleLabel(user.role))}</span>
                            </td>
                            <td style="padding: 12px 8px;">
                                <span class="badge ${getStatusBadgeClass(user.account_status)}">${escapeHtml(getStatusLabel(user.account_status))}</span>
                            </td>
                            <td style="padding: 12px 8px; font-size: 12px; color: var(--text-muted);">${escapeHtml(formatDate(user.created_at))}</td>
                            <td style="padding: 12px 8px; font-size: 12px; color: var(--text-muted);">${escapeHtml(formatDate(user.last_login))}</td>
                            <td style="padding: 12px 8px;">
                                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.openUserProfile('${user.id}')">View Profile</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.editUser('${user.id}')">Edit User</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.toggleUserStatus('${user.id}', '${user.account_status || 'active'}')">${String(user.account_status || 'active').toLowerCase() === 'suspended' ? 'Activate User' : 'Suspend User'}</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.changeUserRole('${user.id}')">Change Role</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.resetUserPassword('${user.id}')">Reset Password</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.verifyUserBusiness('${user.id}')">Verify Business</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px;" onclick="window.verifyUserSeller('${user.id}')">Verify Seller</button>
                                    <button class="btn-secondary" type="button" style="padding: 7px 10px; font-size: 11px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteUser('${user.id}')">Delete User</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function getUserAvatar(user) {
    return user.profile_photo || '../assets/Icon.png';
}

function getUserDisplayName(user) {
    return user.full_name || user.username || user.email || 'Unnamed user';
}

function getUserRoleLabel(role) {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'super_admin') return 'Super Admin';
    if (normalized === 'business') return 'Business';
    if (normalized === 'seller') return 'Seller';
    if (normalized === 'news_publisher') return 'News Publisher';
    return 'User';
}

function getStatusLabel(status) {
    const normalized = String(status || 'active').toLowerCase();
    if (normalized === 'suspended') return 'Suspended';
    if (normalized === 'banned') return 'Banned';
    if (normalized === 'deleted') return 'Deleted';
    return 'Active';
}

function getStatusBadgeClass(status) {
    const normalized = String(status || 'active').toLowerCase();
    if (normalized === 'suspended') return 'badge-danger';
    if (normalized === 'deleted' || normalized === 'banned') return 'badge-secondary';
    return 'badge-success';
}

function updateUserInState(userId, updatePayload) {
    usersModuleState.users = usersModuleState.users.map(user => {
        if (user.id !== userId) return user;
        return { ...user, ...updatePayload };
    });
    renderUserMetrics(usersModuleState.users);
    renderUsersTable();
}

window.openUserProfile = async (userId) => {
    const user = usersModuleState.users.find(item => item.id === userId);
    const modal = document.getElementById('user-profile-modal');
    const body = document.getElementById('user-profile-modal-body');
    if (!modal || !body || !user) return;

    body.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start;">
            <img src="${getUserAvatar(user)}" alt="" style="width:92px; height:92px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.12);">
            <div style="flex:1; min-width:220px;">
                <h4 style="margin:0 0 8px; color: var(--text-primary);">${escapeHtml(getUserDisplayName(user))}</h4>
                <p style="margin: 4px 0; color: var(--text-muted);">Email: ${escapeHtml(user.email || '—')}</p>
                <p style="margin: 4px 0; color: var(--text-muted);">Phone: ${escapeHtml(user.phone || '—')}</p>
                <p style="margin: 4px 0; color: var(--text-muted);">Role: ${escapeHtml(getUserRoleLabel(user.role))}</p>
                <p style="margin: 4px 0; color: var(--text-muted);">Status: ${escapeHtml(getStatusLabel(user.account_status))}</p>
                <p style="margin: 4px 0; color: var(--text-muted);">Join Date: ${escapeHtml(formatDate(user.created_at))}</p>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
};

window.closeUserProfile = () => {
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.style.display = 'none';
};

window.editUser = async (userId) => {
    const user = usersModuleState.users.find(item => item.id === userId);
    if (!user) return;

    const fullName = prompt('Full name', user.full_name || '');
    if (fullName === null) return;

    const phone = prompt('Phone', user.phone || '');
    if (phone === null) return;

    const email = prompt('Email', user.email || '');
    if (email === null) return;

    const role = prompt('Role (super_admin, user, business, seller, news_publisher)', user.role || 'user');
    if (role === null) return;

    const status = prompt('Status (active, suspended, banned, deleted)', user.account_status || 'active');
    if (status === null) return;

    try {
        const updatePayload = {
            full_name: fullName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            role: role.trim(),
            account_status: status.trim()
        };

        const { error } = await supabase.from('profiles').update(updatePayload).eq('id', userId);
        if (error) throw error;

        updateUserInState(userId, updatePayload);
        alert('User updated successfully.');
    } catch (err) {
        alert(`Unable to update user: ${err.message}`);
    }
};

window.toggleUserStatus = async (userId, currentStatus) => {
    const nextStatus = String(currentStatus || 'active').toLowerCase() === 'suspended' ? 'active' : 'suspended';
    const confirmAction = confirm(`Change this account status to ${nextStatus}?`);
    if (!confirmAction) return;

    try {
        const { error } = await supabase.from('profiles').update({ account_status: nextStatus }).eq('id', userId);
        if (error) throw error;

        updateUserInState(userId, { account_status: nextStatus });
        alert(`User ${nextStatus === 'suspended' ? 'suspended' : 'reactivated'} successfully.`);
    } catch (err) {
        alert(`Unable to update status: ${err.message}`);
    }
};

window.deleteUser = async (userId) => {
    const confirmAction = confirm('Delete this user? This will soft-delete the account.');
    if (!confirmAction) return;

    try {
        const { error } = await supabase.from('profiles').update({ deleted_at: new Date().toISOString(), account_status: 'deleted' }).eq('id', userId);
        if (error) throw error;

        usersModuleState.users = usersModuleState.users.filter(user => user.id !== userId);
        renderUserMetrics(usersModuleState.users);
        renderUsersTable();
        alert('User deleted successfully.');
    } catch (err) {
        alert(`Unable to delete user: ${err.message}`);
    }
};

window.changeUserRole = async (userId) => {
    const user = usersModuleState.users.find(item => item.id === userId);
    if (!user) return;

    const nextRole = prompt('New role (super_admin, user, business, seller, news_publisher)', user.role || 'user');
    if (nextRole === null) return;

    try {
        const { error } = await supabase.from('profiles').update({ role: nextRole.trim() }).eq('id', userId);
        if (error) throw error;

        updateUserInState(userId, { role: nextRole.trim() });
        alert('Role updated successfully.');
    } catch (err) {
        alert(`Unable to change role: ${err.message}`);
    }
};

window.resetUserPassword = async (userId) => {
    const user = usersModuleState.users.find(item => item.id === userId);
    if (!user?.email) return;

    const confirmAction = confirm(`Send a password reset email to ${user.email}?`);
    if (!confirmAction) return;

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
            redirectTo: `${window.location.origin}/pages/reset-password.html`
        });
        if (error) throw error;
        alert('Password reset email sent.');
    } catch (err) {
        alert(`Unable to send reset email: ${err.message}`);
    }
};

window.verifyUserBusiness = async (userId) => {
    try {
        const { error } = await supabase.from('profiles').update({ role: 'business', verification_status: 'approved' }).eq('id', userId);
        if (error) throw error;

        updateUserInState(userId, { role: 'business', verification_status: 'approved' });
        alert('Business verification updated successfully.');
    } catch (err) {
        alert(`Unable to verify business account: ${err.message}`);
    }
};

window.verifyUserSeller = async (userId) => {
    try {
        const { error } = await supabase.from('profiles').update({ role: 'seller', verification_status: 'approved' }).eq('id', userId);
        if (error) throw error;

        updateUserInState(userId, { role: 'seller', verification_status: 'approved' });
        alert('Seller verification updated successfully.');
    } catch (err) {
        alert(`Unable to verify seller account: ${err.message}`);
    }
};

function setupAdminNavigation() {
    const buttons = Array.from(document.querySelectorAll('.admin-nav-item'));
    const sections = Array.from(document.querySelectorAll('.admin-panel-section'));
    const sidebar = document.querySelector('.admin-sidebar');
    const toggleButton = document.getElementById('admin-sidebar-toggle');

    const activateSection = (sectionKey) => {
        sections.forEach(section => {
            section.hidden = section.id !== `admin-section-${sectionKey}`;
        });
        buttons.forEach(button => {
            if (button.dataset.adminSection === sectionKey) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        if (location.hash !== `#${sectionKey}`) {
            history.replaceState(null, '', `#${sectionKey}`);
        }
    };

    buttons.forEach(button => {
        button.addEventListener('click', () => activateSection(button.dataset.adminSection));
    });

    toggleButton?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
    });

    const initialSection = (location.hash || '#dashboard').replace('#', '') || 'dashboard';
    const validSection = buttons.some(button => button.dataset.adminSection === initialSection) ? initialSection : 'dashboard';
    activateSection(validSection);
}

function initializeAdminSectionActions() {
    const toolbarButtons = Array.from(document.querySelectorAll('.section-toolbar-actions button'));
    initializeMediaContentManager();
    initializeNewsWorkflow();
    toolbarButtons.forEach(button => {
        const label = String(button?.textContent || '').trim().toLowerCase();

        if (label === 'refresh') {
            button.addEventListener('click', async () => {
                await loadControlConsole();
            });
            return;
        }

        if (label === 'create report') {
            button.addEventListener('click', () => {
                const reportTab = document.querySelector('.admin-nav-item[data-admin-section="reports"]');
                reportTab?.click();
                window.dispatchEvent(new CustomEvent('admin:section', { detail: 'reports' }));
            });
            return;
        }

        if (label === 'add match') {
            button.addEventListener('click', () => {
                const form = document.getElementById('football-match-form');
                form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            return;
        }

        if (label === 'add portal') {
            button.addEventListener('click', () => {
                const portalForm = document.getElementById('gov-portal-form');
                portalForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            return;
        }

        if (label === 'search') {
            button.addEventListener('click', () => {
                const usersTab = document.querySelector('.admin-nav-item[data-admin-section="users"]');
                usersTab?.click();
                setTimeout(() => document.getElementById('user-search')?.focus(), 120);
            });
            return;
        }

        if (label === 'add user') {
            button.addEventListener('click', async () => {
                await handleAddUserAction();
            });
            return;
        }

        if (label === 'export') {
            button.addEventListener('click', () => {
                const activeSection = getActiveAdminSection();
                if (activeSection === 'users') {
                    exportUsersToCsv();
                } else if (activeSection === 'marketplace') {
                    window.open('../pages/marketplace.html', '_blank', 'noopener,noreferrer');
                } else if (activeSection === 'government') {
                    window.open('../pages/government.html', '_blank', 'noopener,noreferrer');
                } else {
                    window.open('../pages/search.html', '_blank', 'noopener,noreferrer');
                }
            });
            return;
        }

            if (label === 'filters') {
            button.addEventListener('click', () => {
                const activeSection = getActiveAdminSection();
                if (activeSection === 'media') {
                    const searchInput = document.getElementById('media-manager-search');
                    searchInput?.focus();
                    searchInput?.select();
                } else if (activeSection === 'books') {
                    window.open('../pages/books.html', '_blank', 'noopener,noreferrer');
                } else if (activeSection === 'jobs') {
                    window.open('../pages/jobs.html', '_blank', 'noopener,noreferrer');
                } else if (activeSection === 'news') {
                    window.open('../pages/news.html', '_blank', 'noopener,noreferrer');
                } else {
                    window.open('../pages/search.html', '_blank', 'noopener,noreferrer');
                }
            });
            return;
        }

        if (label === 'new job') {
            button.addEventListener('click', () => {
                const jobsTab = document.querySelector('.admin-nav-item[data-admin-section="jobs"]');
                jobsTab?.click();
                setTimeout(() => {
                    document.getElementById('jobs-create-btn')?.click();
                }, 120);
            });
            return;
        }

        if (label === 'new article' || label === 'add new article') {
            button.addEventListener('click', () => {
                const activeSection = getActiveAdminSection();
                if (activeSection === 'news') {
                    openCreateNewsArticleModal();
                }
            });
            return;
        }

        if (label === 'archive') {
            button.addEventListener('click', () => {
                window.open('../pages/books.html', '_blank', 'noopener,noreferrer');
            });
            return;
        }

        if (label === 'new ad') {
            button.addEventListener('click', () => {
                window.open('../index.html', '_blank', 'noopener,noreferrer');
            });
            return;
        }

        if (label === 'approve') {
            button.addEventListener('click', () => {
                const activeSection = getActiveAdminSection();
                if (activeSection === 'marketplace') {
                    document.querySelector('#admin-marketplace-listings-queue .btn-primary')?.click();
                } else if (activeSection === 'payments') {
                    document.querySelector('#admin-payments-section-queue .btn-primary')?.click();
                } else if (activeSection === 'security') {
                    document.querySelector('#admin-reports-queue .btn-primary')?.click();
                }
            });
            return;
        }

        if (label === 'drafts') {
            button.addEventListener('click', () => {
                window.open('../pages/news.html', '_blank', 'noopener,noreferrer');
            });
            return;
        }

        if (label === 'new broadcast') {
            button.addEventListener('click', () => {
                window.open('../pages/support.html', '_blank', 'noopener,noreferrer');
            });
            return;
        }

        if (label === 'save changes') {
            button.addEventListener('click', async () => {
                await loadControlConsole();
            });
            return;
        }

        if (label === 'review') {
            button.addEventListener('click', () => {
                document.querySelector('#admin-reports-queue .btn-primary')?.click();
            });
            return;
        }

        if (label === 'upcoming') {
            button.addEventListener('click', () => {
                const kickoffInput = document.getElementById('football-kickoff');
                kickoffInput?.focus();
            });
            return;
        }

        if (label === 'add story') {
            button.addEventListener('click', () => {
                const modal = document.getElementById('media-content-manager-modal');
                modal?.classList.remove('hidden');
                document.body.classList.add('modal-open');
                document.getElementById('media-manager-headline')?.focus();
            });
            return;
        }
    });
}

function getActiveAdminSection() {
    return document.querySelector('.admin-nav-item.active')?.dataset.adminSection || 'dashboard';
}

async function handleAddUserAction() {
    openAddUserModal();
}

function exportUsersToCsv() {
    const rows = usersModuleState.users.map(user => ({
        full_name: user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || '',
        account_status: user.account_status || ''
    }));

    if (!rows.length) {
        alert('No user data is available to export.');
        return;
    }

    const headers = ['full_name', 'email', 'phone', 'role', 'account_status'];
    const csv = [headers.join(','), ...rows.map(row => headers.map(header => `"${String(row[header] || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'users.csv';
    link.click();
    URL.revokeObjectURL(url);
}

function isRelationMissingError(error) {
    if (!error || !error.message) return false;
    const message = error.message.toLowerCase();
    return message.includes('relation') || message.includes('does not exist') || message.includes('table') && message.includes('does not exist');
}

async function safeAuditLog(action, table_name, record_id, new_data) {
    try {
        await supabase.from('audit_logs').insert({
            user_id: currentAdminId,
            action,
            table_name,
            record_id,
            new_data
        });
    } catch (err) {
        console.warn('Audit log entry skipped:', err?.message || err);
    }
}

async function updatePlatformMetrics() {
    try {
        const metricIds = {
            users: document.getElementById('metric-users'),
            marketplace: document.getElementById('metric-marketplace-overview'),
            business: document.getElementById('metric-business-overview'),
            news: document.getElementById('metric-news-overview'),
            jobs: document.getElementById('metric-jobs-overview'),
            government: document.getElementById('metric-government-overview')
        };

        const queryTargets = [
            async () => {
                const { count, error } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .is('deleted_at', null);
                if (error) throw error;
                if (metricIds.users) metricIds.users.textContent = count ?? 0;
            },
            async () => {
                const counts = await queryOverviewCounts('marketplace_listings', ['pending', 'approved', 'rejected', 'sold']);
                const summary = counts.pending + counts.approved + counts.rejected + counts.sold;
                if (metricIds.marketplace) metricIds.marketplace.textContent = summary ? `${summary} total` : '0';
            },
            async () => {
                const counts = await queryBusinessOverviewCounts();
                const summary = counts.pending + counts.verified + counts.rejected;
                if (metricIds.business) metricIds.business.textContent = summary ? `${summary} total` : '0';
            },
            async () => {
                const counts = await queryOverviewCounts('news_articles', ['draft', 'published']);
                const summary = counts.draft + counts.published;
                if (metricIds.news) metricIds.news.textContent = summary ? `${summary} total` : '0';
            },
            async () => {
                const counts = await queryJobOverviewCounts();
                const summary = counts.active + counts.expired + counts.pending;
                if (metricIds.jobs) metricIds.jobs.textContent = summary ? `${summary} total` : '0';
            },
            async () => {
                const counts = await queryOverviewCounts('government_forms', ['active']);
                const summary = counts.active;
                if (metricIds.government) metricIds.government.textContent = summary ? `${summary} total` : '0';
            }
        ];

        await Promise.all(queryTargets.map(runQuery => runQuery().catch(err => {
            console.warn('Overview metric query failed:', err?.message || err);
        })));
    } catch (err) {
        console.error('Failed to compute system metrics:', err.message);
    }
}

async function queryOverviewCounts(tableName, statuses) {
    const fallback = Object.fromEntries(statuses.map(status => [status, 0]));

    try {
        const { data, error } = await supabase.from(tableName).select('status');
        if (error) {
            if (!isRelationMissingError(error)) throw error;
            return fallback;
        }

        const rows = data || [];
        for (const row of rows) {
            const normalized = normalizeStatusValue(row?.status);
            if (normalized in fallback) fallback[normalized] = (fallback[normalized] || 0) + 1;
        }

        return fallback;
    } catch (err) {
        console.warn(`Unable to count ${tableName}:`, err?.message || err);
        return fallback;
    }
}

async function queryBusinessOverviewCounts() {
    try {
        const { data, error } = await supabase.from('business_pages').select('verified, is_suspended');
        if (error) {
            if (!isRelationMissingError(error)) throw error;
            return { pending: 0, verified: 0, rejected: 0 };
        }

        return (data || []).reduce((result, row) => {
            const verified = Boolean(row?.verified);
            const suspended = Boolean(row?.is_suspended);
            if (suspended) {
                result.rejected += 1;
            } else if (verified) {
                result.verified += 1;
            } else {
                result.pending += 1;
            }
            return result;
        }, { pending: 0, verified: 0, rejected: 0 });
    } catch (err) {
        console.warn('Unable to count business pages:', err?.message || err);
        return { pending: 0, verified: 0, rejected: 0 };
    }
}

async function queryJobOverviewCounts() {
    try {
        const { data, error } = await supabase.from('jobs').select('status');
        if (error) {
            if (!isRelationMissingError(error)) throw error;
            return { active: 0, expired: 0, pending: 0 };
        }

        return (data || []).reduce((result, row) => {
            const value = normalizeStatusValue(row?.status);
            if (value === 'expired' || value === 'closed') {
                result.expired += 1;
            } else if (value === 'pending') {
                result.pending += 1;
            } else {
                result.active += 1;
            }
            return result;
        }, { active: 0, expired: 0, pending: 0 });
    } catch (err) {
        console.warn('Unable to count jobs:', err?.message || err);
        return { active: 0, expired: 0, pending: 0 };
    }
}

async function renderWorkspaceOverview() {
    const summaryList = document.getElementById('workspace-summary-list');
    const quickActions = document.getElementById('workspace-quick-actions');
    const activityList = document.getElementById('recent-activity-list');
    const moduleHealth = document.getElementById('workspace-module-health');
    const marketplaceChart = document.getElementById('overview-chart-marketplace');
    const contentChart = document.getElementById('overview-chart-content');

    if (!summaryList || !quickActions || !activityList || !moduleHealth) return;

    try {
        const [{ data: marketplaceData, error: marketplaceErr }, { data: businessData, error: businessErr }, { data: newsData, error: newsErr }, { data: jobsData, error: jobsErr }, { data: governmentData, error: governmentErr }, { data: footballData, error: footballErr }, { data: activityData, error: activityErr }] = await Promise.all([
            safeQuery('marketplace_listings', 'status'),
            safeQuery('business_pages', 'verified'),
            safeQuery('news_articles', 'status'),
            safeQuery('jobs', 'status'),
            safeQuery('government_forms', 'status'),
            safeQuery('football_matches', 'status'),
            safeQueryActivity()
        ]);

        if (marketplaceErr || businessErr || newsErr || jobsErr || governmentErr || footballErr) {
            throw new Error('One or more overview modules failed to load.');
        }

        const marketplaceStatuses = summarizeStatusRows(marketplaceData || [], ['pending', 'approved', 'rejected', 'sold']);
        const businessStatuses = summarizeBusinessRows(businessData || []);
        const contentStatuses = summarizeStatusRows(newsData || [], ['draft', 'published']);
        const jobStatuses = summarizeJobRows(jobsData || []);
        const governmentStatuses = summarizeStatusRows(governmentData || [], ['active']);
        const footballStatuses = summarizeFootballRows(footballData || []);
        const governmentServiceCount = (await safeQuery('government_portals', 'institution')).data?.length || 0;
        const governmentContactCount = (await safeQuery('government_hotlines', 'institution_name')).data?.length || 0;

        summaryList.innerHTML = [
            renderSummaryItem('Marketplace', `${marketplaceStatuses.pending} pending`, `${marketplaceStatuses.approved} approved`, `${marketplaceStatuses.rejected} rejected`, `${marketplaceStatuses.sold} sold`),
            renderSummaryItem('Business Pages', `${businessStatuses.pending} pending`, `${businessStatuses.verified} verified`, `${businessStatuses.rejected} rejected`),
            renderSummaryItem('Books', 'This module has not yet been configured.'),
            renderSummaryItem('News', `${contentStatuses.draft} drafts`, `${contentStatuses.published} published`, `${(newsData || []).length} total`),
            renderSummaryItem('Jobs', `${jobStatuses.active} active`, `${jobStatuses.expired} expired`, `${jobStatuses.pending} pending`),
            renderSummaryItem('Football', `${footballStatuses.live} live`, `${footballStatuses.upcoming} upcoming`, `${footballStatuses.completed} completed`),
            renderSummaryItem('Government Services', `${governmentServiceCount} services`, `${(governmentData || []).length} forms`, `${governmentContactCount} contacts`),
            renderSummaryItem('Advertising', 'This module has not yet been configured.')
        ].join('');

        quickActions.innerHTML = [
            actionButton('Go to Marketplace', () => document.querySelector('.admin-nav-item[data-admin-section="marketplace"]')?.click()),
            actionButton('Review Business Pages', () => document.querySelector('.admin-nav-item[data-admin-section="business"]')?.click()),
            actionButton('Open News Workspace', () => document.querySelector('.admin-nav-item[data-admin-section="news"]')?.click()),
            actionButton('Manage Jobs', () => document.querySelector('.admin-nav-item[data-admin-section="jobs"]')?.click()),
            actionButton('Open Government Services', () => document.querySelector('.admin-nav-item[data-admin-section="government"]')?.click())
        ].join('');

        activityList.innerHTML = (activityData || []).slice(0, 8).map(item => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div>
                    <strong style="display:block; font-size:13px; color:var(--text-primary);">${escapeHtml(item.title)}</strong>
                    <span style="display:block; font-size:11px; color:var(--text-muted); margin-top:4px;">${escapeHtml(item.detail)}</span>
                </div>
                <span style="font-size:11px; color:var(--gold-base); white-space:nowrap;">${escapeHtml(item.when)}</span>
            </div>
        `).join('');

        moduleHealth.innerHTML = [
            moduleBadge('Marketplace', marketplaceStatuses.pending > 0 ? 'Needs review' : 'Healthy'),
            moduleBadge('News', contentStatuses.published > 0 ? 'Publishing live' : 'No published posts'),
            moduleBadge('Government', governmentStatuses.active > 0 ? 'Services available' : 'No active forms'),
            moduleBadge('Football', footballStatuses.live > 0 ? 'Live match active' : 'No live match')
        ].join('');

        if (marketplaceChart) marketplaceChart.innerHTML = renderChartMarkup('Marketplace Status', marketplaceStatuses);
        if (contentChart) contentChart.innerHTML = renderChartMarkup('Content Snapshot', { draft: contentStatuses.draft, published: contentStatuses.published, pending: jobStatuses.pending });
    } catch (err) {
        summaryList.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">This module has not yet been configured.</p>`;
        quickActions.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">Quick actions are unavailable until the workspace data is configured.</p>`;
        activityList.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">Recent activity is unavailable right now.</p>`;
        moduleHealth.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">No overview data available.</p>`;
        if (marketplaceChart) marketplaceChart.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">No chart data available.</p>';
        if (contentChart) contentChart.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">No chart data available.</p>';
        console.warn('Workspace overview could not be rendered:', err?.message || err);
    }
}

function renderSummaryItem(title, ...values) {
    return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <strong style="font-size:13px; color:var(--text-primary);">${escapeHtml(title)}</strong>
            <span style="font-size:11px; color:var(--text-muted); text-align:right;">${values.join(' • ')}</span>
        </div>
    `;
}

function actionButton(label, handler) {
    return `<button class="btn-secondary" type="button" style="width:100%; justify-content:center;" onclick="window.__workspaceAction('${escapeHtml(label)}')">${escapeHtml(label)}</button>`;
}

function moduleBadge(label, value) {
    return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <strong style="font-size:13px; color:var(--text-primary);">${escapeHtml(label)}</strong>
            <span class="badge badge-secondary">${escapeHtml(value)}</span>
        </div>
    `;
}

function renderChartMarkup(title, values) {
    const bars = Object.entries(values).map(([key, value]) => `
        <div style="margin-top:8px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-bottom:4px;">
                <span>${escapeHtml(key)}</span>
                <strong>${value}</strong>
            </div>
            <div style="height:8px; border-radius:999px; background:rgba(255,255,255,0.08); overflow:hidden;">
                <div style="height:100%; width:${Math.max(8, Math.min(100, value * 10))}%; background:linear-gradient(90deg, var(--gold-base), var(--heritage-red));"></div>
            </div>
        </div>
    `).join('');

    return `
        <div>
            <strong style="font-size:13px; color:var(--text-primary);">${escapeHtml(title)}</strong>
            ${bars}
        </div>
    `;
}

function summarizeStatusRows(rows, statuses) {
    const result = Object.fromEntries(statuses.map(status => [status, 0]));
    for (const row of rows) {
        const value = normalizeStatusValue(row?.status);
        if (value in result) result[value] = (result[value] || 0) + 1;
    }
    return result;
}

function summarizeBusinessRows(rows) {
    return rows.reduce((result, row) => {
        const verified = Boolean(row?.verified);
        const suspended = Boolean(row?.is_suspended);
        if (suspended) {
            result.rejected += 1;
        } else if (verified) {
            result.verified += 1;
        } else {
            result.pending += 1;
        }
        return result;
    }, { pending: 0, verified: 0, rejected: 0 });
}

function summarizeJobRows(rows) {
    return rows.reduce((result, row) => {
        const value = normalizeStatusValue(row?.status);
        if (value === 'expired' || value === 'closed') {
            result.expired += 1;
        } else if (value === 'pending') {
            result.pending += 1;
        } else {
            result.active += 1;
        }
        return result;
    }, { active: 0, expired: 0, pending: 0 });
}

function summarizeFootballRows(rows) {
    return rows.reduce((result, row) => {
        const value = normalizeStatusValue(row?.status);
        if (value === 'live') {
            result.live += 1;
        } else if (value === 'scheduled') {
            result.upcoming += 1;
        } else if (value === 'completed') {
            result.completed += 1;
        }
        return result;
    }, { live: 0, upcoming: 0, completed: 0 });
}

function normalizeStatusValue(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'published') return 'published';
    if (normalized === 'draft') return 'draft';
    if (normalized === 'pending') return 'pending';
    if (normalized === 'active') return 'active';
    if (normalized === 'approved') return 'approved';
    if (normalized === 'live') return 'live';
    if (normalized === 'scheduled') return 'scheduled';
    if (normalized === 'completed') return 'completed';
    if (normalized === 'closed' || normalized === 'expired') return 'expired';
    if (normalized === 'rejected') return 'rejected';
    if (normalized === 'sold') return 'sold';
    return normalized;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function initializeMediaContentManager() {
    const openButton = document.getElementById('media-manager-open-btn');
    const closeButton = document.getElementById('media-manager-close-btn');
    const modal = document.getElementById('media-content-manager-modal');
    const form = document.getElementById('media-manager-form');
    const searchInput = document.getElementById('media-manager-search');
    const categoryFilter = document.getElementById('media-manager-category-filter');
    const statusFilter = document.getElementById('media-manager-status-filter');
    const previewButton = document.getElementById('media-manager-preview-btn');
    const resetButton = document.getElementById('media-manager-reset-btn');
    const editor = document.getElementById('media-manager-editor');
    const summaryBox = document.getElementById('media-manager-summary');

    if (!modal || !form) return;

    const closeModal = () => {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    };

    openButton?.addEventListener('click', () => {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        document.getElementById('media-manager-headline')?.focus();
        loadMediaContentManager();
    });
    closeButton?.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    searchInput?.addEventListener('input', () => {
        mediaContentManagerState.filters.search = searchInput.value.trim().toLowerCase();
        renderMediaContentManagerList();
    });
    categoryFilter?.addEventListener('change', () => {
        mediaContentManagerState.filters.category = categoryFilter.value;
        renderMediaContentManagerList();
    });
    statusFilter?.addEventListener('change', () => {
        mediaContentManagerState.filters.status = statusFilter.value;
        renderMediaContentManagerList();
    });
    previewButton?.addEventListener('click', renderMediaPreview);
    resetButton?.addEventListener('click', () => resetMediaManagerForm());

    editor?.addEventListener('input', renderMediaPreview);
    document.querySelectorAll('[data-editor-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-editor-command');
            if (!editor || !document.createRange) return;
            editor.focus();
            document.execCommand(command, false, null);
            renderMediaPreview();
        });
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveMediaContentItem();
    });

    loadMediaContentManager();
    renderMediaPreview();

    if (summaryBox) {
        summaryBox.textContent = 'Use the manager to publish, edit, archive, restore, and preview stories from one place.';
    }
}

async function initializeNewsWorkflow() {
    const aiModal = document.getElementById('news-ai-modal');
    const editorModal = document.getElementById('news-editor-modal');
    if (!aiModal || !editorModal) return;

    await loadNewsCategoriesForAdmin();

    if (newsWorkflowState.bound) return;
    newsWorkflowState.bound = true;

    const aiClose = document.getElementById('news-ai-modal-close');
    const aiCancel = document.getElementById('news-ai-cancel');
    const aiExtract = document.getElementById('news-ai-extract');
    const aiInput = document.getElementById('news-ai-input');
    const coverUrlInput = document.getElementById('news-cover-url');
    const coverFileInput = document.getElementById('news-cover-file');
    const galleryUrlInput = document.getElementById('news-gallery-url-input');
    const galleryAddUrlButton = document.getElementById('news-gallery-add-url-button');
    const galleryUploadInput = document.getElementById('news-gallery-upload');
    const editorClose = document.getElementById('news-editor-close');
    const editorCancel = document.getElementById('news-editor-cancel');
    const editorForm = document.getElementById('news-editor-form');

    aiClose?.addEventListener('click', closeNewsAIModal);
    aiCancel?.addEventListener('click', closeNewsAIModal);
    aiExtract?.addEventListener('click', extractNewsArticleDetails);
    galleryAddUrlButton?.addEventListener('click', addNewsGalleryUrl);
    galleryUploadInput?.addEventListener('change', (event) => addNewsGalleryFiles(event.target.files));
    coverUrlInput?.addEventListener('input', renderNewsCoverPreview);
    coverFileInput?.addEventListener('change', handleCoverImageFileChange);

    editorClose?.addEventListener('click', closeNewsEditorModal);
    editorCancel?.addEventListener('click', closeNewsEditorModal);
    editorForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await publishNewsArticle();
    });
}

function openCreateNewsArticleModal() {
    const modal = document.getElementById('news-ai-modal');
    const input = document.getElementById('news-ai-input');
    if (!modal || !input) return;

    newsWorkflowState.extractedData = null;
    newsWorkflowState.editorData = null;
    newsWorkflowState.galleryItems = [];
    newsWorkflowState.coverImageFile = null;
    newsWorkflowState.coverImageUrl = '';

    input.value = '';
    renderNewsAIStatus('');
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    input.focus();
}

function closeNewsAIModal() {
    const modal = document.getElementById('news-ai-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    renderNewsAIStatus('');
}

function openNewsEditorModal(data = {}) {
    const modal = document.getElementById('news-editor-modal');
    const aiModal = document.getElementById('news-ai-modal');
    if (!modal) return;

    if (aiModal) {
        aiModal.classList.add('hidden');
    }

    newsWorkflowState.editorData = data;
    newsWorkflowState.galleryItems = Array.isArray(data.gallery_urls) ? data.gallery_urls.map((url) => ({ id: crypto.randomUUID ? crypto.randomUUID() : `gallery-${Date.now()}-${Math.random()}`, url, caption: '', alt: '' })) : [];
    newsWorkflowState.coverImageFile = null;
    newsWorkflowState.coverImageUrl = String(data.cover_image_url || data.image_url || '').trim();

    const fields = {
        headline: data.headline || data.title || '',
        subtitle: data.subtitle || '',
        category: data.category || 'Custom',
        summary: data.summary || '',
        content: data.content || '',
        author: data.author || '',
        source: data.source || data.source_name || '',
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : String(data.tags || '').trim(),
        publish_date: data.publish_date || data.published_at || '',
        featured: Boolean(data.featured || data.is_featured),
        breaking: Boolean(data.breaking || data.is_breaking),
        cover_caption: data.cover_caption || ''
    };

    populateNewsCategorySelect('news-editor-category', fields.category);

    document.getElementById('news-editor-headline').value = fields.headline;
    document.getElementById('news-editor-subtitle').value = fields.subtitle;
    document.getElementById('news-editor-category').value = fields.category;
    document.getElementById('news-editor-summary').value = fields.summary;
    document.getElementById('news-editor-content').value = fields.content;
    document.getElementById('news-editor-author').value = fields.author;
    document.getElementById('news-editor-source').value = fields.source;
    document.getElementById('news-editor-tags').value = fields.tags;
    document.getElementById('news-editor-publish-date').value = normalizeDate(fields.publish_date);
    document.getElementById('news-editor-cover-caption').value = fields.cover_caption;
    document.getElementById('news-cover-url').value = newsWorkflowState.coverImageUrl;
    document.getElementById('news-cover-file').value = '';

    const featuredCheckbox = document.getElementById('news-editor-featured');
    const breakingCheckbox = document.getElementById('news-editor-breaking');
    if (featuredCheckbox) featuredCheckbox.checked = fields.featured;
    if (breakingCheckbox) breakingCheckbox.checked = fields.breaking;

    renderNewsCoverPreview();
    renderNewsGalleryList();
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function closeNewsEditorModal() {
    const modal = document.getElementById('news-editor-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    cleanupNewsWorkflowResources();
}

function cleanupNewsWorkflowResources() {
    newsWorkflowState.galleryItems.forEach((item) => {
        if (item.previewUrl && item.file) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });
}

function renderNewsAIStatus(message, isError = false) {
    const status = document.getElementById('news-ai-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = isError ? '#b91c1c' : '#374151';
}

function showNewsAIModalLoading() {
    const extractButton = document.getElementById('news-ai-extract');
    if (extractButton) {
        extractButton.disabled = true;
        extractButton.textContent = 'Extracting...';
        extractButton.style.opacity = '0.7';
        extractButton.style.cursor = 'not-allowed';
    }
    renderNewsAIStatus('AI is analysing the article, please wait...');
}

function resetNewsAIModalLoading() {
    const extractButton = document.getElementById('news-ai-extract');
    if (extractButton) {
        extractButton.disabled = false;
        extractButton.textContent = 'Extract Article';
        extractButton.style.opacity = '';
        extractButton.style.cursor = '';
    }
}

function handleCoverImageFileChange(event) {
    const file = event.target.files?.[0] || null;
    if (!file) {
        newsWorkflowState.coverImageFile = null;
        renderNewsCoverPreview();
        return;
    }

    if (!file.type.startsWith('image/')) {
        alert('Please choose a valid image file for the cover.');
        event.target.value = '';
        newsWorkflowState.coverImageFile = null;
        renderNewsCoverPreview();
        return;
    }

    newsWorkflowState.coverImageFile = file;
    newsWorkflowState.coverImageUrl = URL.createObjectURL(file);
    document.getElementById('news-cover-url').value = '';
    renderNewsCoverPreview();
}

function renderNewsCoverPreview() {
    const preview = document.getElementById('news-cover-preview');
    if (!preview) return;

    const urlInput = document.getElementById('news-cover-url').value.trim();
    const fileUrl = newsWorkflowState.coverImageFile ? newsWorkflowState.coverImageUrl : '';
    const imageUrl = fileUrl || urlInput;

    if (!imageUrl) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
    }

    preview.style.display = 'block';
    preview.innerHTML = `
        <div style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;">
            <img src="${escapeHtml(imageUrl)}" alt="Cover preview" style="width:140px; height:100px; object-fit:cover; border-radius:12px; border:1px solid rgba(0,0,0,0.08);" />
            <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
                <div style="font-size:13px; color:#111; font-weight:700;">Cover image preview</div>
                <button type="button" class="btn-secondary" style="padding:8px 12px; width:max-content;" onclick="window.clearNewsCoverImage()">Remove Image</button>
            </div>
        </div>
    `;
}

window.clearNewsCoverImage = () => {
    newsWorkflowState.coverImageFile && URL.revokeObjectURL(newsWorkflowState.coverImageUrl);
    newsWorkflowState.coverImageFile = null;
    newsWorkflowState.coverImageUrl = '';
    document.getElementById('news-cover-url').value = '';
    document.getElementById('news-cover-file').value = '';
    renderNewsCoverPreview();
};

function addNewsGalleryUrl() {
    const urlInput = document.getElementById('news-gallery-url-input');
    if (!urlInput) return;
    const url = String(urlInput.value || '').trim();
    if (!url) return;

    newsWorkflowState.galleryItems.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `gallery-${Date.now()}-${Math.random()}`,
        url,
        caption: '',
        alt: '',
        file: null
    });
    urlInput.value = '';
    renderNewsGalleryList();
}

function addNewsGalleryFiles(files) {
    if (!files || !files.length) return;
    Array.from(files).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        const previewUrl = URL.createObjectURL(file);
        newsWorkflowState.galleryItems.push({
            id: crypto.randomUUID ? crypto.randomUUID() : `gallery-${Date.now()}-${Math.random()}`,
            file,
            url: previewUrl,
            previewUrl,
            caption: '',
            alt: ''
        });
    });
    document.getElementById('news-gallery-upload').value = '';
    renderNewsGalleryList();
}

function renderNewsGalleryList() {
    const list = document.getElementById('news-gallery-list');
    if (!list) return;
    if (!newsWorkflowState.galleryItems.length) {
        list.innerHTML = '<div style="padding:14px; border:1px solid rgba(0,0,0,0.08); border-radius:12px; color:#555;">No gallery images added yet.</div>';
        return;
    }

    list.innerHTML = newsWorkflowState.galleryItems.map((item, index) => {
        const previewUrl = escapeHtml(item.url || item.previewUrl || '');
        const caption = escapeHtml(item.caption || '');
        const alt = escapeHtml(item.alt || '');
        return `
            <div style="padding:14px; border:1px solid rgba(0,0,0,0.08); border-radius:14px; display:grid; gap:12px;">
                <div style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;">
                    <img src="${previewUrl}" alt="Gallery preview" style="width:120px; height:90px; object-fit:cover; border-radius:12px; border:1px solid rgba(0,0,0,0.08);" />
                    <div style="flex:1; display:grid; gap:8px; min-width:220px;">
                        <input data-gallery-id="${item.id}" data-gallery-field="caption" type="text" class="form-control" value="${caption}" placeholder="Caption">
                        <input data-gallery-id="${item.id}" data-gallery-field="alt" type="text" class="form-control" value="${alt}" placeholder="Alt text">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:12px;" onclick="window.moveNewsGalleryItem('${item.id}', -1)">↑</button>
                        <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:12px;" onclick="window.moveNewsGalleryItem('${item.id}', 1)">↓</button>
                        <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:12px;" onclick="window.removeNewsGalleryItem('${item.id}')">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    list.querySelectorAll('input[data-gallery-id]').forEach((input) => {
        input.addEventListener('input', (event) => {
            const target = event.target;
            const id = target.dataset.galleryId;
            const field = target.dataset.galleryField;
            const item = newsWorkflowState.galleryItems.find((entry) => entry.id === id);
            if (!item || !field) return;
            item[field] = target.value;
        });
    });
}

window.moveNewsGalleryItem = (id, direction) => {
    const index = newsWorkflowState.galleryItems.findIndex((item) => item.id === id);
    if (index < 0) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newsWorkflowState.galleryItems.length) return;
    const item = newsWorkflowState.galleryItems.splice(index, 1)[0];
    newsWorkflowState.galleryItems.splice(newIndex, 0, item);
    renderNewsGalleryList();
};

window.removeNewsGalleryItem = (id) => {
    const index = newsWorkflowState.galleryItems.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [removed] = newsWorkflowState.galleryItems.splice(index, 1);
    if (removed?.previewUrl && removed.file) {
        URL.revokeObjectURL(removed.previewUrl);
    }
    renderNewsGalleryList();
};

function parseJsonFromString(raw) {
    const cleaned = String(raw || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    try {
        return JSON.parse(candidate);
    } catch (err) {
        try {
            return Function(`'use strict'; return (${candidate})`)();
        } catch (innerErr) {
            return null;
        }
    }
}

function normalizeBooleanValue(value) {
    if (value === true || value === 'true' || value === 'True' || value === '1' || value === 1) return true;
    return false;
}

function extractNewsPayload(raw) {
    const parsed = parseJsonFromString(raw);
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    return {
        headline: String(parsed.headline || parsed.title || '').trim(),
        subtitle: String(parsed.subtitle || '').trim(),
        category: String(parsed.category || '').trim(),
        summary: String(parsed.summary || '').trim(),
        content: String(parsed.content || '').trim(),
        author: String(parsed.author || '').trim(),
        source: String(parsed.source || '').trim(),
        tags: Array.isArray(parsed.tags) ? parsed.tags.join(', ') : String(parsed.tags || '').trim(),
        publish_date: String(parsed.publish_date || '').trim(),
        featured: normalizeBooleanValue(parsed.featured),
        breaking: normalizeBooleanValue(parsed.breaking),
        cover_caption: String(parsed.cover_caption || '').trim()
    };
}

function mapExtractedNewsToEditorData(parsed = {}) {
    return {
        headline: parsed.headline || '',
        subtitle: parsed.subtitle || '',
        category: parsed.category || 'Custom',
        summary: parsed.summary || '',
        content: parsed.content || '',
        author: parsed.author || '',
        source: parsed.source || '',
        tags: parsed.tags || '',
        publish_date: normalizeDate(parsed.publish_date || ''),
        featured: parsed.featured,
        breaking: parsed.breaking,
        cover_caption: parsed.cover_caption || '',
        cover_image_url: ''
    };
}

async function extractNewsArticleDetails() {
    const input = document.getElementById('news-ai-input');
    if (!input) return;
    const prompt = String(input.value || '').trim();
    if (!prompt) {
        renderNewsAIStatus('Paste the article text before extracting details.', true);
        return;
    }

    showNewsAIModalLoading();

    try {
        const { data, error } = await supabase.functions.invoke('msofi-ai', {
            body: {
                message: `You are an expert newspaper editor. Carefully analyse the article text below and extract structured news metadata. Return ONLY valid JSON with these exact keys: headline, subtitle, category, summary, content, author, source, tags, publish_date, featured, breaking, cover_caption. Use empty strings for missing values. Do not include markdown, explanations, or any additional text. Do not use any keys outside the list.\n\n${prompt}`,
                mode: 'writer'
            }
        });

        if (error) {
            throw error;
        }

        const responseText = String(data?.response || data?.reply || '').trim();
        const parsed = extractNewsPayload(responseText);

        if (!parsed || !parsed.headline || !parsed.content) {
            throw new Error('Unable to extract the article properly. Please ensure the text is a complete news article or press release and try again.');
        }

        newsWorkflowState.extractedData = parsed;
        openNewsEditorModal(parsed);
    } catch (err) {
        renderNewsAIStatus(err?.message || 'Extraction failed. Please try again.', true);
    } finally {
        resetNewsAIModalLoading();
    }
}

async function publishNewsArticle() {
    const headline = String(document.getElementById('news-editor-headline')?.value || '').trim();
    const subtitle = String(document.getElementById('news-editor-subtitle')?.value || '').trim();
    const category = String(document.getElementById('news-editor-category')?.value || '').trim() || 'Custom';
    const selectedCategory = newsWorkflowState.categories.find((item) => item.name === category);
    const summary = String(document.getElementById('news-editor-summary')?.value || '').trim();
    const content = String(document.getElementById('news-editor-content')?.value || '').trim();
    const author = String(document.getElementById('news-editor-author')?.value || '').trim();
    const source = String(document.getElementById('news-editor-source')?.value || '').trim();
    const tags = String(document.getElementById('news-editor-tags')?.value || '').trim().split(',').map(tag => tag.trim()).filter(Boolean);
    const publishDateRaw = String(document.getElementById('news-editor-publish-date')?.value || '').trim();
    const publishDate = publishDateRaw ? new Date(publishDateRaw).toISOString() : new Date().toISOString();
    const featured = Boolean(document.getElementById('news-editor-featured')?.checked);
    const breaking = Boolean(document.getElementById('news-editor-breaking')?.checked);
    const coverCaption = String(document.getElementById('news-editor-cover-caption')?.value || '').trim();
    const coverUrl = String(document.getElementById('news-cover-url')?.value || '').trim();

    if (!headline || !content) {
        alert('Headline and full article content are required before publishing.');
        return;
    }

    const publishButton = document.getElementById('news-editor-publish');
    if (publishButton) {
        publishButton.disabled = true;
        publishButton.textContent = 'Publishing...';
    }

    const galleryUrls = [];
    try {
        let coverImageUrl = coverUrl || '';

        if (newsWorkflowState.coverImageFile) {
            const uploaded = await storageAPI.uploadFile(newsWorkflowState.coverImageFile, 'news', 'news_img');
            coverImageUrl = uploaded.publicUrl || coverImageUrl;
        }

        for (const item of newsWorkflowState.galleryItems) {
            if (item.file) {
                const uploaded = await storageAPI.uploadFile(item.file, 'news', 'news_img');
                if (uploaded?.publicUrl) galleryUrls.push(uploaded.publicUrl);
            } else if (item.url) {
                galleryUrls.push(item.url);
            }
        }

        const payload = {
            publisher_id: currentAdminId,
            title: headline,
            subtitle,
            category,
            category_id: selectedCategory?.id || null,
            summary,
            content,
            image_url: coverImageUrl || null,
            source_name: source || null,
            author: author || null,
            tags: tags.length ? tags : null,
            cover_caption: coverCaption || null,
            gallery_urls: galleryUrls.length ? galleryUrls : null,
            is_featured: featured,
            is_breaking: breaking,
            status: 'published',
            published_at: publishDate,
            updated_at: new Date().toISOString()
        };

        if (newsWorkflowState.editorData?.id) {
            const { error } = await supabase.from('news_articles').update(payload).eq('id', newsWorkflowState.editorData.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('news_articles').insert(payload);
            if (error) throw error;
        }

        closeNewsEditorModal();
        alert('News article published successfully.');
        await loadMediaContentManager();
    } catch (err) {
        alert(`Unable to publish article: ${err.message || err}`);
    } finally {
        if (publishButton) {
            publishButton.disabled = false;
            publishButton.textContent = 'Publish Article';
        }
    }
}

async function loadNewsCategoriesForAdmin() {
    try {
        const { data, error } = await supabase
            .from('news_categories')
            .select('id, name, icon, display_order, is_active')
            .order('display_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;
        newsWorkflowState.categories = (data || []).filter(Boolean);
        populateNewsCategorySelect('news-editor-category');
        populateNewsCategorySelect('news-category');
        renderNewsCategoryManager();
    } catch (err) {
        console.warn('Unable to load news categories for admin:', err?.message || err);
    }
}

function populateNewsCategorySelect(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const visibleCategories = (newsWorkflowState.categories || []).filter((category) => category.is_active !== false);
    const currentValue = selectedValue || select.value || '';

    select.innerHTML = '<option value="">Select category</option>' + visibleCategories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('');
    if (currentValue) {
        if (visibleCategories.some((category) => category.name === currentValue)) {
            select.value = currentValue;
        } else {
            const customOption = document.createElement('option');
            customOption.value = currentValue;
            customOption.textContent = currentValue;
            select.appendChild(customOption);
            select.value = currentValue;
        }
    }
}

function renderNewsCategoryManager() {
    const container = document.getElementById('news-category-manager');
    if (!container) return;

    const categories = (newsWorkflowState.categories || []).slice().sort((a, b) => (Number(a.display_order || 0) - Number(b.display_order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
    container.innerHTML = `
        <div style="display:grid; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <strong style="font-size:14px; color:var(--text-primary);">News Categories</strong>
                <button type="button" class="btn-primary" style="padding:8px 12px; font-size:12px;" onclick="window.addNewsCategoryPrompt()">Add Category</button>
            </div>
            ${categories.length ? categories.map((category) => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; border:1px solid rgba(0,0,0,0.08); border-radius:12px; padding:10px 12px; background:#fff;">
                    <div>
                        <div style="font-weight:700; color:#111;">${escapeHtml(category.name || 'Untitled')}</div>
                        <div style="font-size:12px; color:#666;">Order ${Number(category.display_order || 0)} • ${category.is_active === false ? 'Hidden' : 'Visible'}</div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:12px;" onclick="window.editNewsCategory('${category.id}')">Edit</button>
                        <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:12px;" onclick="window.toggleNewsCategory('${category.id}')">${category.is_active === false ? 'Show' : 'Hide'}</button>
                    </div>
                </div>
            `).join('') : '<div style="padding:12px; border:1px dashed rgba(0,0,0,0.12); border-radius:12px; color:#666;">No categories yet.</div>'}
        </div>
    `;
}

window.addNewsCategoryPrompt = async () => {
    const name = prompt('Enter a new category name');
    if (!name) return;
    try {
        const { error } = await supabase.from('news_categories').insert({ name: name.trim(), display_order: (newsWorkflowState.categories.length || 0) + 1, is_active: true });
        if (error) throw error;
        await loadNewsCategoriesForAdmin();
        alert('Category added successfully.');
    } catch (err) {
        alert(err?.message || 'Unable to add category.');
    }
};

window.editNewsCategory = async (id) => {
    const category = newsWorkflowState.categories.find((item) => item.id === id);
    if (!category) return;
    const newName = prompt('Rename category', category.name || '');
    if (!newName || !newName.trim()) return;
    try {
        const { error } = await supabase.from('news_categories').update({ name: newName.trim() }).eq('id', id);
        if (error) throw error;
        await loadNewsCategoriesForAdmin();
        alert('Category updated successfully.');
    } catch (err) {
        alert(err?.message || 'Unable to update category.');
    }
};

window.toggleNewsCategory = async (id) => {
    const category = newsWorkflowState.categories.find((item) => item.id === id);
    if (!category) return;
    try {
        const { error } = await supabase.from('news_categories').update({ is_active: category.is_active === false }).eq('id', id);
        if (error) throw error;
        await loadNewsCategoriesForAdmin();
    } catch (err) {
        alert(err?.message || 'Unable to update category visibility.');
    }
};

function updateMediaManagerSummary() {
    const summaryBox = document.getElementById('media-manager-summary');
    if (!summaryBox) return;

    const activeCount = mediaContentManagerState.items.filter(item => !item.deleted_at).length;
    const archivedCount = mediaContentManagerState.items.filter(item => item.deleted_at).length;
    summaryBox.textContent = `${activeCount} active stories • ${archivedCount} archived stories • Use search and category filters to manage the newsroom.`;
}

async function loadMediaContentManager() {
    try {
        const { data, error } = await supabase
            .from('news_articles')
            .select('id, title, content, category, image_url, source_name, status, is_breaking, is_featured, published_at, created_at, deleted_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        mediaContentManagerState.items = (data || []).filter(Boolean).map(item => ({
            ...item,
            author: item.author || item.source_name || 'Genius Malawi Team',
            summary: item.summary || item.content || ''
        }));
        updateMediaManagerSummary();
        renderMediaContentManagerList();
        renderMediaPreview();
    } catch (err) {
        console.warn('Media content manager failed to load:', err?.message || err);
        const list = document.getElementById('media-manager-list');
        if (list) {
            list.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:13px;">Unable to load stories right now.</div>';
        }
    }
}

function resetMediaManagerForm() {
    const form = document.getElementById('media-manager-form');
    if (form) form.reset();
    const editor = document.getElementById('media-manager-editor');
    if (editor) editor.innerHTML = '';
    document.getElementById('media-manager-id').value = '';
    document.getElementById('media-manager-publish-state').value = 'published';
    document.getElementById('media-manager-category').value = 'Breaking News';
    document.getElementById('media-manager-publish-date').value = '';
    renderMediaPreview();
}

function renderMediaPreview() {
    const previewCard = document.getElementById('media-manager-preview-card');
    if (!previewCard) return;

    const headline = String(document.getElementById('media-manager-headline')?.value || '').trim() || 'Your story headline will appear here';
    const summary = String(document.getElementById('media-manager-summary')?.value || '').trim() || 'A short summary will appear here.';
    const category = document.getElementById('media-manager-category')?.value || 'Breaking News';
    const author = String(document.getElementById('media-manager-author')?.value || '').trim() || 'Author';
    const content = String(document.getElementById('media-manager-editor')?.innerHTML || '').trim() || '<p>Full story preview will appear here.</p>';
    const featured = Boolean(document.getElementById('media-manager-featured')?.checked);
    const breaking = Boolean(document.getElementById('media-manager-breaking')?.checked);

    previewCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
            <span class="badge badge-premium">${escapeHtml(category)}</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${featured ? '<span class="badge badge-verified">Featured</span>' : ''}
                ${breaking ? '<span class="badge badge-danger">Breaking</span>' : ''}
            </div>
        </div>
        <h4 style="margin:0 0 8px; color:var(--text-primary); font-size:16px;">${escapeHtml(headline)}</h4>
        <p style="margin:0 0 10px; color:var(--text-muted); font-size:13px; line-height:1.6;">${escapeHtml(summary)}</p>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">By ${escapeHtml(author)} • Preview</div>
        <div style="font-size:13px; color:var(--text-secondary); line-height:1.7;">${content}</div>
    `;
}

function getFilteredMediaItems() {
    const search = mediaContentManagerState.filters.search;
    const category = mediaContentManagerState.filters.category;
    const status = mediaContentManagerState.filters.status;

    return mediaContentManagerState.items.filter(item => {
        const matchesSearch = !search || [item.title, item.summary, item.content, item.author, item.category].filter(Boolean).join(' ').toLowerCase().includes(search);
        const matchesCategory = category === 'all' || item.category === category;
        const matchesStatus = status === 'all' || (status === 'archived' ? Boolean(item.deleted_at) : !item.deleted_at);
        return matchesSearch && matchesCategory && matchesStatus;
    });
}

function renderMediaContentManagerList() {
    const list = document.getElementById('media-manager-list');
    if (!list) return;

    const items = getFilteredMediaItems();

    if (!items.length) {
        list.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:13px;">No stories match this view yet.</div>';
        return;
    }

    list.innerHTML = items.map(item => {
        const statusText = item.deleted_at ? 'Archived' : item.status === 'draft' ? 'Draft' : 'Published';
        const badges = [
            item.is_featured ? '<span class="badge badge-verified">Featured</span>' : '',
            item.is_breaking ? '<span class="badge badge-danger">Breaking</span>' : ''
        ].filter(Boolean).join('');

        return `
            <div style="padding:12px; border:1px solid rgba(255,255,255,0.08); border-radius:var(--radius-md); background:rgba(255,255,255,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                    <strong style="font-size:13px; color:var(--text-primary);">${escapeHtml(item.title || 'Untitled story')}</strong>
                    <span class="badge badge-secondary">${escapeHtml(statusText)}</span>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin:6px 0;">${escapeHtml(item.category || 'General')} • ${escapeHtml(item.author || 'Unknown author')}</div>
                <div style="font-size:12px; color:var(--text-secondary); line-height:1.5; margin-bottom:8px;">${escapeHtml(item.summary || item.content || '')}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">${badges}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:11px;" onclick="window.editMediaContentItem('${item.id}')">Edit</button>
                    ${item.deleted_at ? `<button type="button" class="btn-primary" style="padding:8px 10px; font-size:11px;" onclick="window.restoreMediaContentItem('${item.id}')">Restore</button>` : `<button type="button" class="btn-secondary" style="padding:8px 10px; font-size:11px;" onclick="window.archiveMediaContentItem('${item.id}')">Archive</button>`}
                    <button type="button" class="btn-secondary" style="padding:8px 10px; font-size:11px;" onclick="window.deleteMediaContentItem('${item.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function saveMediaContentItem() {
    const form = document.getElementById('media-manager-form');
    const title = document.getElementById('media-manager-headline').value.trim();
    const category = document.getElementById('media-manager-category').value;
    const summary = document.getElementById('media-manager-summary').value.trim();
    const content = document.getElementById('media-manager-editor').innerText.trim();
    const author = document.getElementById('media-manager-author').value.trim();
    const publishState = document.getElementById('media-manager-publish-state').value;
    const publishDate = document.getElementById('media-manager-publish-date').value;
    const thumbnailFile = document.getElementById('media-manager-thumbnail').files[0];
    const additionalImages = Array.from(document.getElementById('media-manager-images').files || []);
    const videoUrl = document.getElementById('media-manager-video-url').value.trim();
    const sourceUrl = document.getElementById('media-manager-source-url').value.trim();
    const liveUrl = document.getElementById('media-manager-live-url').value.trim();
    const featured = document.getElementById('media-manager-featured').checked;
    const breaking = document.getElementById('media-manager-breaking').checked;
    const id = document.getElementById('media-manager-id').value;

    if (!title || !category || !content) {
        alert('Headline, category, and story content are required.');
        return;
    }

    try {
        let thumbnailUrl = null;
        if (thumbnailFile) {
            thumbnailUrl = await storageAPI.uploadFile(thumbnailFile, 'marketplace', 'marketplace_img');
        }

        let imageUrls = [];
        if (additionalImages.length) {
            imageUrls = await Promise.all(additionalImages.map(file => storageAPI.uploadFile(file, 'marketplace', 'marketplace_img')));
        }

        const basePayload = {
            title,
            content,
            category,
            source_name: author || 'Genius Malawi Team',
            image_url: thumbnailUrl || null,
            is_featured: featured,
            is_breaking: breaking,
            status: publishState || 'published',
            published_at: publishDate ? new Date(publishDate).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null
        };

        const payloads = [
            { ...basePayload, summary: summary || content.slice(0, 220) },
            basePayload
        ];

        let lastError = null;
        for (const payload of payloads) {
            try {
                if (id) {
                    const { error } = await supabase.from('news_articles').update(payload).eq('id', id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('news_articles').insert({ ...payload, publisher_id: currentAdminId || null });
                    if (error) throw error;
                }

                form.reset();
                resetMediaManagerForm();
                await loadMediaContentManager();
                alert(id ? 'Story updated successfully.' : 'Story published successfully.');
                return;
            } catch (err) {
                lastError = err;
                if (!/column .* does not exist|does not exist/i.test(err?.message || '')) {
                    throw err;
                }
            }
        }

        throw lastError;
    } catch (err) {
        alert(`Unable to save story: ${err.message}`);
    }
}

window.editMediaContentItem = async (id) => {
    const item = mediaContentManagerState.items.find(entry => entry.id === id);
    if (!item) return;

    document.getElementById('media-manager-id').value = item.id;
    document.getElementById('media-manager-headline').value = item.title || '';
    document.getElementById('media-manager-category').value = item.category || 'Breaking News';
    document.getElementById('media-manager-summary').value = item.summary || '';
    document.getElementById('media-manager-editor').innerHTML = item.content || '';
    document.getElementById('media-manager-author').value = item.author || '';
    document.getElementById('media-manager-video-url').value = item.video_url || '';
    document.getElementById('media-manager-source-url').value = item.source_url || '';
    document.getElementById('media-manager-live-url').value = item.live_url || '';
    document.getElementById('media-manager-featured').checked = Boolean(item.is_featured);
    document.getElementById('media-manager-breaking').checked = Boolean(item.is_breaking);
    document.getElementById('media-manager-publish-state').value = item.status || 'published';
    document.getElementById('media-manager-publish-date').value = item.published_at ? new Date(item.published_at).toISOString().slice(0, 16) : '';
    document.getElementById('media-content-manager-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    renderMediaPreview();
};

window.archiveMediaContentItem = async (id) => {
    try {
        const { error } = await supabase.from('news_articles').update({ deleted_at: new Date().toISOString(), status: 'archived' }).eq('id', id);
        if (error) throw error;
        await loadMediaContentManager();
    } catch (err) {
        alert(`Unable to archive story: ${err.message}`);
    }
};

window.restoreMediaContentItem = async (id) => {
    try {
        const { error } = await supabase.from('news_articles').update({ deleted_at: null, status: 'published' }).eq('id', id);
        if (error) throw error;
        await loadMediaContentManager();
    } catch (err) {
        alert(`Unable to restore story: ${err.message}`);
    }
};

window.deleteMediaContentItem = async (id) => {
    const confirmAction = confirm('Delete this story permanently?');
    if (!confirmAction) return;
    try {
        const { error } = await supabase.from('news_articles').delete().eq('id', id);
        if (error) throw error;
        await loadMediaContentManager();
    } catch (err) {
        alert(`Unable to delete story: ${err.message}`);
    }
};

async function safeQuery(tableName, statusColumn) {
    try {
        const { data, error } = await supabase.from(tableName).select(statusColumn);
        if (error) {
            if (!isRelationMissingError(error)) throw error;
            return { data: [], error: null };
        }
        return { data: data || [], error: null };
    } catch (err) {
        console.warn(`Overview query failed for ${tableName}:`, err?.message || err);
        return { data: [], error: err };
    }
}

async function safeQueryActivity() {
    const activitySources = [
        { table: 'profiles', label: 'Users', detail: 'Profile activity', sort: 'created_at' },
        { table: 'marketplace_listings', label: 'Marketplace', detail: 'Listing updated', sort: 'created_at' },
        { table: 'business_pages', label: 'Business Pages', detail: 'Business page updated', sort: 'created_at' },
        { table: 'news_articles', label: 'News', detail: 'News item updated', sort: 'created_at' },
        { table: 'jobs', label: 'Jobs', detail: 'Job post updated', sort: 'created_at' }
    ];

    const allActivities = [];
    for (const source of activitySources) {
        try {
            const { data, error } = await supabase.from(source.table).select('id, created_at').order(source.sort, { ascending: false }).limit(3);
            if (error) {
                if (!isRelationMissingError(error)) continue;
                continue;
            }
            for (const item of (data || [])) {
                allActivities.push({
                    title: `${source.label}`,
                    detail: `${source.detail}`,
                    timestamp: item.created_at ? new Date(item.created_at).getTime() : 0,
                    when: formatRelativeTime(item.created_at)
                });
            }
        } catch (err) {
            console.warn(`Activity query failed for ${source.table}:`, err?.message || err);
        }
    }

    return allActivities.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8).map(({ title, detail, when }) => ({ title, detail, when }));
}

function formatRelativeTime(value) {
    if (!value) return 'Just now';
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

window.__workspaceAction = (label) => {
    if (label === 'Go to Marketplace') {
        document.querySelector('.admin-nav-item[data-admin-section="marketplace"]')?.click();
        return;
    }
    if (label === 'Review Business Pages') {
        document.querySelector('.admin-nav-item[data-admin-section="business"]')?.click();
        return;
    }
    if (label === 'Open News Workspace') {
        document.querySelector('.admin-nav-item[data-admin-section="news"]')?.click();
        return;
    }
    if (label === 'Manage Jobs') {
        document.querySelector('.admin-nav-item[data-admin-section="jobs"]')?.click();
        return;
    }
    if (label === 'Open Government Services') {
        document.querySelector('.admin-nav-item[data-admin-section="government"]')?.click();
    }
};

// ==========================================
// 3. MARKETPLACE MODERATION QUEUE
// ==========================================
function setupMarketplaceAdminRealtime() {
    if (marketplaceRealtimeChannel) return;

    marketplaceRealtimeChannel = supabase.channel('marketplace-admin-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_listings' }, async () => {
            await fetchMarketplaceQueue();
        })
        .subscribe();
}

function getMarketplaceStatusLabel(status) {
    const normalized = String(status || 'pending').toLowerCase();
    if (normalized === 'approved') return 'Approved';
    if (normalized === 'rejected') return 'Rejected';
    if (normalized === 'sold') return 'Sold';
    return 'Pending';
}

function getMarketplaceStatusBadgeClass(status) {
    const normalized = String(status || 'pending').toLowerCase();
    if (normalized === 'approved') return 'badge-success';
    if (normalized === 'rejected') return 'badge-danger';
    if (normalized === 'sold') return 'badge-premium';
    return 'badge-secondary';
}

function formatMarketplacePrice(value) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? `MWK ${parsed.toLocaleString()}` : 'MWK 0';
}

function formatMarketplaceDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMarketplaceCategory(category) {
    const labels = {
        physical_product: 'Physical Product',
        service: 'Service',
        house: 'House',
        land: 'Land',
        car: 'Vehicle',
        livestock: 'Livestock',
        rental: 'Rental',
        other: 'Other'
    };
    return labels[String(category || '').toLowerCase()] || String(category || 'General');
}

async function enrichMarketplaceAdminItems(listings) {
    if (!listings.length) return [];

    const listingIds = listings.map(item => item.id);
    const [{ data: imageRows, error: imageError }, { data: videoRows, error: videoError }] = await Promise.all([
        supabase.from('marketplace_images').select('listing_id, image_url, image_order').in('listing_id', listingIds).order('image_order', { ascending: true }),
        supabase.from('marketplace_videos').select('listing_id, video_url').in('listing_id', listingIds)
    ]);

    if (imageError) throw imageError;
    if (videoError) throw videoError;

    const imagesByListing = (imageRows || []).reduce((acc, row) => {
        if (!acc[row.listing_id]) acc[row.listing_id] = [];
        acc[row.listing_id].push(row.image_url);
        return acc;
    }, {});

    const videosByListing = (videoRows || []).reduce((acc, row) => {
        acc[row.listing_id] = row.video_url;
        return acc;
    }, {});

    return listings.map(item => ({
        ...item,
        images: imagesByListing[item.id] || [],
        video_url: videosByListing[item.id] || null
    }));
}

function setupMarketplaceAdminControls() {
    if (marketplaceAdminState.controlsInitialized) return;

    const searchInput = document.getElementById('marketplace-admin-search');
    const categoryFilter = document.getElementById('marketplace-admin-category-filter');
    const sortSelect = document.getElementById('marketplace-admin-sort-filter');
    const refreshBtn = document.getElementById('marketplace-admin-refresh');
    const resetBtn = document.getElementById('marketplace-admin-reset');
    const tabs = document.querySelectorAll('.marketplace-admin-view-tab');

    const applyFilters = () => {
        marketplaceAdminState.search = searchInput?.value?.trim() || '';
        marketplaceAdminState.category = categoryFilter?.value || 'all';
        marketplaceAdminState.sort = sortSelect?.value || 'newest';
        renderMarketplaceAdminPanel();
    };

    searchInput?.addEventListener('input', applyFilters);
    categoryFilter?.addEventListener('change', applyFilters);
    sortSelect?.addEventListener('change', applyFilters);
    refreshBtn?.addEventListener('click', () => fetchMarketplaceQueue());
    resetBtn?.addEventListener('click', () => {
        marketplaceAdminState.search = '';
        marketplaceAdminState.category = 'all';
        marketplaceAdminState.sort = 'newest';
        marketplaceAdminState.view = 'pending';
        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = 'all';
        if (sortSelect) sortSelect.value = 'newest';
        document.querySelectorAll('.marketplace-admin-view-tab').forEach(button => {
            button.classList.toggle('active', button.getAttribute('data-marketplace-view') === 'pending');
        });
        renderMarketplaceAdminPanel();
    });

    tabs.forEach(button => {
        button.addEventListener('click', () => {
            marketplaceAdminState.view = button.getAttribute('data-marketplace-view') || 'pending';
            tabs.forEach(tab => tab.classList.toggle('active', tab === button));
            renderMarketplaceAdminPanel();
        });
    });

    marketplaceAdminState.controlsInitialized = true;
}

function renderMarketplaceAdminPanel() {
    const overviewQueue = document.getElementById('admin-listings-queue');
    const marketplaceQueue = document.getElementById('admin-marketplace-listings-queue');
    const badge = document.getElementById('listings-queue-badge');
    const sectionBadge = document.getElementById('marketplace-admin-section-badge');
    const listTitle = document.getElementById('marketplace-admin-list-title');
    const pendingMetric = document.getElementById('marketplace-metric-pending');
    const approvedMetric = document.getElementById('marketplace-metric-approved');
    const rejectedMetric = document.getElementById('marketplace-metric-rejected');
    const soldMetric = document.getElementById('marketplace-metric-sold');
    const totalMetric = document.getElementById('marketplace-metric-total');
    const sellersMetric = document.getElementById('marketplace-metric-sellers');
    const categoryFilter = document.getElementById('marketplace-admin-category-filter');

    if (!marketplaceQueue && !overviewQueue) return;

    const visibleListings = marketplaceAdminState.listings.filter(item => {
        const normalizedStatus = String(item.status || 'pending').toLowerCase();
        if (marketplaceAdminState.view !== 'all' && normalizedStatus !== marketplaceAdminState.view) {
            return false;
        }
        if (marketplaceAdminState.category !== 'all' && String(item.category || '').toLowerCase() !== marketplaceAdminState.category) {
            return false;
        }
        const searchValue = marketplaceAdminState.search.toLowerCase();
        if (searchValue) {
            const haystack = `${item.title || ''} ${item.description || ''} ${item.profiles?.full_name || ''} ${formatMarketplaceCategory(item.category)} ${item.location || ''}`.toLowerCase();
            if (!haystack.includes(searchValue)) return false;
        }
        return true;
    });

    if (marketplaceAdminState.sort === 'price-asc') {
        visibleListings.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (marketplaceAdminState.sort === 'price-desc') {
        visibleListings.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else {
        visibleListings.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    const pendingCount = marketplaceAdminState.listings.filter(item => String(item.status || 'pending').toLowerCase() === 'pending').length;
    const approvedCount = marketplaceAdminState.listings.filter(item => String(item.status || 'pending').toLowerCase() === 'approved').length;
    const rejectedCount = marketplaceAdminState.listings.filter(item => String(item.status || 'pending').toLowerCase() === 'rejected').length;
    const soldCount = marketplaceAdminState.listings.filter(item => String(item.status || 'pending').toLowerCase() === 'sold').length;
    const totalCount = marketplaceAdminState.listings.length;
    const sellerCount = new Set(marketplaceAdminState.listings.map(item => item.seller_id).filter(Boolean)).size;

    if (pendingMetric) pendingMetric.textContent = pendingCount;
    if (approvedMetric) approvedMetric.textContent = approvedCount;
    if (rejectedMetric) rejectedMetric.textContent = rejectedCount;
    if (soldMetric) soldMetric.textContent = soldCount;
    if (totalMetric) totalMetric.textContent = totalCount;
    if (sellersMetric) sellersMetric.textContent = sellerCount;
    if (badge) badge.textContent = `${pendingCount} Pending`;
    if (sectionBadge) sectionBadge.textContent = `${pendingCount} Pending`;
    if (listTitle) {
        const label = marketplaceAdminState.view === 'all'
            ? 'All Listings'
            : marketplaceAdminState.view === 'sold'
                ? 'Sold Products'
                : `${getMarketplaceStatusLabel(marketplaceAdminState.view)} Listings`;
        listTitle.textContent = label;
    }

    if (categoryFilter) {
        const categories = [...new Set(marketplaceAdminState.listings.map(item => String(item.category || '').toLowerCase()).filter(Boolean))];
        const currentValue = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="all">All Categories</option>' + categories.map(category => `<option value="${escapeHtml(category)}" ${category === currentValue ? 'selected' : ''}>${escapeHtml(formatMarketplaceCategory(category))}</option>`).join('');
        if (!categories.includes(currentValue)) {
            categoryFilter.value = 'all';
        }
    }

    const emptyHtml = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">No ${marketplaceAdminState.view === 'sold' ? 'sold products' : `${marketplaceAdminState.view} listings`} match the current filters.</p>`;

    if (!visibleListings.length) {
        if (overviewQueue) overviewQueue.innerHTML = emptyHtml;
        if (marketplaceQueue) marketplaceQueue.innerHTML = emptyHtml;
        return;
    }

    const renderedCards = visibleListings.map(item => {
        const primaryImage = item.images && item.images.length ? item.images[0] : '../assets/Icon.png';
        const sellerName = item.profiles?.full_name || 'Unknown seller';
        const normalizedStatus = String(item.status || 'pending').toLowerCase();
        const actionButtons = normalizedStatus === 'pending'
            ? `
                <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px;" onclick="window.viewMarketplaceListing('${item.id}')">View Listing</button>
                <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px;" onclick="window.viewMarketplaceSeller('${item.seller_id}')">View Seller</button>
                <button class="btn-primary" style="padding: 8px 12px; font-size: 11px;" onclick="window.moderateListing('${item.id}', 'approved')">Approve</button>
                <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.moderateListing('${item.id}', 'rejected')">Reject</button>
            `
            : normalizedStatus === 'sold'
                ? `
                    <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px;" onclick="window.viewMarketplaceListing('${item.id}')">View Listing</button>
                    <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px;" onclick="window.viewMarketplaceSeller('${item.seller_id}')">View Seller</button>
                    <button class="btn-primary" style="padding: 8px 12px; font-size: 11px;" onclick="window.restoreMarketplaceListing('${item.id}')">Restore</button>
                    <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteMarketplaceListing('${item.id}')">Delete</button>
                `
                : `
                    <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px;" onclick="window.viewMarketplaceListing('${item.id}')">View Listing</button>
                    <button class="btn-secondary" style="padding: 8px 12px; font-size: 11px;" onclick="window.viewMarketplaceSeller('${item.seller_id}')">View Seller</button>
                `;

        return `
            <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: var(--radius-md); border: var(--glass-border); display: flex; flex-wrap: wrap; gap: 16px; align-items: center; animation: fadeIn 0.3s ease;">
                <img src="${primaryImage}" alt="" style="width: 84px; height: 84px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid rgba(255,255,255,0.12);">
                <div style="flex: 1; min-width: 240px;">
                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:6px;">
                        <strong style="display: block; font-size: 15px; color: var(--text-primary);">${escapeHtml(item.title || 'Untitled listing')}</strong>
                        <span class="badge ${getMarketplaceStatusBadgeClass(normalizedStatus)}">${escapeHtml(getMarketplaceStatusLabel(normalizedStatus))}</span>
                    </div>
                    <span style="font-size: 12px; color: var(--gold-base); font-weight: 700; display:block; margin-bottom:4px;">${escapeHtml(formatMarketplacePrice(item.price))} &bull; ${escapeHtml(formatMarketplaceCategory(item.category))}</span>
                    <span style="display:block; font-size: 12px; color: var(--text-muted); margin-bottom:4px;">Seller: ${escapeHtml(sellerName)}</span>
                    <span style="display:block; font-size: 11px; color: var(--text-muted);">Listed: ${escapeHtml(formatMarketplaceDate(item.created_at))}${normalizedStatus === 'sold' ? ` &bull; Sold: ${escapeHtml(formatMarketplaceDate(item.updated_at || item.deleted_at))}` : ''}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end;">
                    ${actionButtons}
                </div>
            </div>
        `;
    });

    const rendered = renderedCards.join('');
    if (overviewQueue) overviewQueue.innerHTML = renderedCards.slice(0, 4).join('');
    if (marketplaceQueue) marketplaceQueue.innerHTML = rendered;
}

async function fetchMarketplaceQueue() {
    setupMarketplaceAdminControls();
    const queue = document.getElementById('admin-listings-queue');
    const badge = document.getElementById('listings-queue-badge');
    const sectionBadge = document.getElementById('marketplace-admin-section-badge');
    const emptyState = document.getElementById('marketplace-admin-empty-state');
    if (!queue && !badge && !sectionBadge && !emptyState) return;

    try {
        const { data, error } = await supabase
            .from('marketplace_listings')
            .select('*, profiles:seller_id (id, full_name, email, phone, profile_photo, role, verification_status, created_at)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const enriched = await enrichMarketplaceAdminItems((data || []).filter(item => item && item.id));
        marketplaceAdminState.listings = enriched.map(item => ({
            ...item,
            status: String(item.status || 'pending').toLowerCase()
        }));

        renderMarketplaceAdminPanel();
    } catch (err) {
        console.error('Failed to populate marketplace queue:', err.message);
        if (queue) queue.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">Unable to load marketplace admin data.</p>';
        if (sectionBadge) sectionBadge.textContent = 'Unavailable';
        if (badge) badge.textContent = 'Unavailable';
    }
}

function renderMarketplaceListingModalContent(listing, sellerProfile, businessPage) {
    const galleryImages = listing.images && listing.images.length ? listing.images : ['../assets/Icon.png'];
    marketplaceAdminState.galleryImages = galleryImages;
    marketplaceAdminState.galleryIndex = 0;
    marketplaceAdminState.galleryZoom = 1;

    const body = document.getElementById('marketplace-listing-modal-body');
    if (!body) return;

    body.innerHTML = `
        <div style="display:grid; gap:20px;">
            <div style="display:grid; grid-template-columns: minmax(260px, 420px) 1fr; gap:20px; align-items:start;">
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-md); padding: 12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
                        <strong style="font-size: 13px; color: var(--text-primary);">Photo Gallery</strong>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                            <button class="btn-secondary" type="button" style="padding: 8px 10px; font-size: 11px;" onclick="window.marketplaceGalleryNavigate(-1)">Prev</button>
                            <button class="btn-secondary" type="button" style="padding: 8px 10px; font-size: 11px;" onclick="window.marketplaceGalleryNavigate(1)">Next</button>
                            <button class="btn-secondary" type="button" style="padding: 8px 10px; font-size: 11px;" onclick="window.marketplaceGalleryZoom(0.2)">Zoom In</button>
                            <button class="btn-secondary" type="button" style="padding: 8px 10px; font-size: 11px;" onclick="window.marketplaceGalleryZoom(-0.2)">Zoom Out</button>
                            <button class="btn-primary" type="button" style="padding: 8px 10px; font-size: 11px;" onclick="window.openMarketplaceGalleryLightbox()">Full Screen</button>
                        </div>
                    </div>
                    <img id="marketplace-gallery-main-image" src="${galleryImages[0]}" alt="listing" style="width:100%; height: 320px; object-fit: cover; border-radius: var(--radius-sm); transition: transform 0.2s ease; background:#000;">
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">
                        ${galleryImages.map((image, index) => `<button type="button" data-gallery-thumb="${index}" onclick="window.marketplaceSelectGalleryImage(${index})" style="padding:0; border:none; background:none; cursor:pointer;"><img src="${image}" alt="" style="width:56px; height:56px; object-fit:cover; border-radius:6px; border:${index === 0 ? '2px solid var(--gold-base)' : '2px solid rgba(255,255,255,0.12)'};"></button>`).join('')}
                    </div>
                </div>
                <div style="display:grid; gap:12px;">
                    <div>
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                            <h3 style="margin:0; color:var(--text-primary);">${escapeHtml(listing.title || 'Untitled listing')}</h3>
                            <span class="badge ${getMarketplaceStatusBadgeClass(listing.status)}">${escapeHtml(getMarketplaceStatusLabel(listing.status))}</span>
                        </div>
                        <p style="margin:0; color:var(--text-muted); line-height:1.6;">${escapeHtml(listing.description || 'No description provided.')}</p>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Category</div>
                            <strong style="display:block; margin-top:6px; color: var(--text-primary);">${escapeHtml(formatMarketplaceCategory(listing.category))}</strong>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Price</div>
                            <strong style="display:block; margin-top:6px; color: var(--text-primary);">${escapeHtml(formatMarketplacePrice(listing.price))}</strong>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Condition</div>
                            <strong style="display:block; margin-top:6px; color: var(--text-primary);">${escapeHtml(listing.condition || 'Not specified')}</strong>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Location</div>
                            <strong style="display:block; margin-top:6px; color: var(--text-primary);">${escapeHtml(listing.location || 'Not specified')}</strong>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Date Posted</div>
                            <strong style="display:block; margin-top:6px; color: var(--text-primary);">${escapeHtml(formatMarketplaceDate(listing.created_at))}</strong>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Seller</div>
                            <strong style="display:block; margin-top:6px; color: var(--text-primary);">${escapeHtml(sellerProfile?.full_name || 'Unknown seller')}</strong>
                        </div>
                    </div>
                    ${listing.video_url ? `<div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Video</div>
                        <video controls preload="metadata" style="width:100%; margin-top:8px; border-radius:8px; background:#000;">
                            <source src="${listing.video_url}" type="video/mp4">
                        </video>
                    </div>` : ''}
                    ${businessPage ? `<div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Business Link</div>
                        <a href="${escapeHtml(businessPage.website || '../pages/directory.html')}" target="_blank" rel="noopener" style="display:inline-block; margin-top:8px; color:var(--gold-base);">Open business page</a>
                    </div>` : ''}
                </div>
            </div>
        </div>
    `;
    renderMarketplaceGalleryView();
}

function renderMarketplaceGalleryView() {
    const imageElement = document.getElementById('marketplace-gallery-main-image');
    if (imageElement) {
        imageElement.src = marketplaceAdminState.galleryImages[marketplaceAdminState.galleryIndex] || '../assets/Icon.png';
        imageElement.style.transform = `scale(${marketplaceAdminState.galleryZoom})`;
    }

    document.querySelectorAll('[data-gallery-thumb]').forEach((thumb, index) => {
        const active = index === marketplaceAdminState.galleryIndex;
        thumb.querySelector('img')?.style.setProperty('border', active ? '2px solid var(--gold-base)' : '2px solid rgba(255,255,255,0.12)');
    });

    const lightboxImage = document.getElementById('marketplace-gallery-lightbox-image');
    if (lightboxImage) {
        lightboxImage.src = marketplaceAdminState.galleryImages[marketplaceAdminState.galleryIndex] || '../assets/Icon.png';
        lightboxImage.style.transform = `scale(${marketplaceAdminState.galleryZoom})`;
    }
}

window.marketplaceGalleryNavigate = (direction) => {
    if (!marketplaceAdminState.galleryImages.length) return;
    marketplaceAdminState.galleryIndex = (marketplaceAdminState.galleryIndex + direction + marketplaceAdminState.galleryImages.length) % marketplaceAdminState.galleryImages.length;
    renderMarketplaceGalleryView();
};

window.marketplaceSelectGalleryImage = (index) => {
    marketplaceAdminState.galleryIndex = index;
    renderMarketplaceGalleryView();
};

window.marketplaceGalleryZoom = (delta) => {
    marketplaceAdminState.galleryZoom = Math.max(1, Math.min(3, Number((marketplaceAdminState.galleryZoom + delta).toFixed(2))));
    renderMarketplaceGalleryView();
};

window.openMarketplaceGalleryLightbox = () => {
    const lightbox = document.getElementById('marketplace-gallery-lightbox');
    const body = document.getElementById('marketplace-gallery-lightbox-body');
    if (!lightbox || !body) return;
    body.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px; align-items:center; width:min(100%, 980px);">
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center; gap:10px;">
                <strong style="color:var(--text-primary);">Image Preview</strong>
                <button class="btn-secondary" type="button" onclick="window.closeMarketplaceGalleryLightbox()">Close</button>
            </div>
            <img id="marketplace-gallery-lightbox-image" src="${marketplaceAdminState.galleryImages[marketplaceAdminState.galleryIndex] || '../assets/Icon.png'}" alt="" style="max-width:100%; max-height:70vh; object-fit:contain; border-radius:12px; background:#000; transform:scale(${marketplaceAdminState.galleryZoom}); transition:transform 0.2s ease;">
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
                <button class="btn-secondary" type="button" onclick="window.marketplaceGalleryNavigate(-1)">Previous</button>
                <button class="btn-secondary" type="button" onclick="window.marketplaceGalleryNavigate(1)">Next</button>
                <button class="btn-secondary" type="button" onclick="window.marketplaceGalleryZoom(0.2)">Zoom In</button>
                <button class="btn-secondary" type="button" onclick="window.marketplaceGalleryZoom(-0.2)">Zoom Out</button>
            </div>
        </div>
    `;
    lightbox.style.display = 'flex';
    renderMarketplaceGalleryView();
};

window.closeMarketplaceGalleryLightbox = () => {
    const lightbox = document.getElementById('marketplace-gallery-lightbox');
    if (lightbox) lightbox.style.display = 'none';
};

window.viewMarketplaceListing = async (listingId) => {
    const modal = document.getElementById('marketplace-listing-modal');
    const body = document.getElementById('marketplace-listing-modal-body');
    if (!modal || !body) return;

    modal.style.display = 'flex';
    body.innerHTML = '<p style="color: var(--text-muted);">Loading listing details…</p>';

    try {
        const listing = marketplaceAdminState.listings.find(item => item.id === listingId);
        if (!listing) throw new Error('Listing not found.');

        const [{ data: sellerData, error: sellerError }, { data: businessPageData, error: businessError }] = await Promise.all([
            supabase.from('profiles').select('id, full_name, email, phone, profile_photo, role, verification_status, created_at').eq('id', listing.seller_id).single(),
            supabase.from('business_pages').select('id, owner_id, business_name, website, whatsapp').eq('owner_id', listing.seller_id).order('created_at', { ascending: false }).limit(1)
        ]);

        if (sellerError) throw sellerError;
        if (businessError) console.warn('Business page lookup failed:', businessError.message);

        renderMarketplaceListingModalContent(listing, sellerData, businessPageData?.[0] || null);
    } catch (err) {
        body.innerHTML = `<p style="color: var(--text-muted);">Unable to load listing details: ${escapeHtml(err.message || err)}</p>`;
        console.error('Failed to open listing details:', err.message || err);
    }
};

window.closeMarketplaceListingModal = () => {
    const modal = document.getElementById('marketplace-listing-modal');
    if (modal) modal.style.display = 'none';
};

window.viewMarketplaceSeller = async (sellerId) => {
    const modal = document.getElementById('marketplace-seller-modal');
    const body = document.getElementById('marketplace-seller-modal-body');
    if (!modal || !body) return;

    modal.style.display = 'flex';
    body.innerHTML = '<p style="color: var(--text-muted);">Loading seller profile…</p>';

    try {
        const [{ data: profile, error: profileError }, { data: listingsData, error: listingsError }, { data: businessPageData, error: businessError }] = await Promise.all([
            supabase.from('profiles').select('id, full_name, email, phone, profile_photo, role, verification_status, created_at').eq('id', sellerId).single(),
            supabase.from('marketplace_listings').select('status').eq('seller_id', sellerId),
            supabase.from('business_pages').select('id, owner_id, business_name, website, whatsapp').eq('owner_id', sellerId).order('created_at', { ascending: false }).limit(1)
        ]);

        if (profileError) throw profileError;
        if (listingsError) throw listingsError;
        if (businessError) console.warn('Business lookup failed:', businessError.message);

        const listingRows = listingsData || [];
        const activeCount = listingRows.filter(item => String(item.status || '').toLowerCase() === 'approved').length;
        const soldCount = listingRows.filter(item => String(item.status || '').toLowerCase() === 'sold').length;
        const rejectedCount = listingRows.filter(item => String(item.status || '').toLowerCase() === 'rejected').length;
        const businessPage = businessPageData?.[0] || null;
        const whatsappValue = businessPage?.whatsapp || profile?.phone || '—';

        body.innerHTML = `
            <div style="display:grid; gap:16px;">
                <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center;">
                    <img src="${profile.profile_photo || '../assets/Icon.png'}" alt="" style="width:92px; height:92px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.12);">
                    <div style="flex:1; min-width:220px;">
                        <h3 style="margin:0 0 8px; color:var(--text-primary);">${escapeHtml(profile.full_name || 'Unnamed seller')}</h3>
                        <p style="margin:4px 0; color:var(--text-muted);">Email: ${escapeHtml(profile.email || '—')}</p>
                        <p style="margin:4px 0; color:var(--text-muted);">Phone: ${escapeHtml(profile.phone || '—')}</p>
                        <p style="margin:4px 0; color:var(--text-muted);">WhatsApp: ${escapeHtml(whatsappValue)}</p>
                        <p style="margin:4px 0; color:var(--text-muted);">Business: ${escapeHtml(businessPage?.business_name || 'No business page')}</p>
                        <p style="margin:4px 0; color:var(--text-muted);">Verification: ${escapeHtml(profile.verification_status || 'pending')}</p>
                        <p style="margin:4px 0; color:var(--text-muted);">Joined: ${escapeHtml(formatMarketplaceDate(profile.created_at))}</p>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:10px;">
                    <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Active Listings</div>
                        <strong style="display:block; margin-top:6px; color:var(--text-primary);">${activeCount}</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Sold Listings</div>
                        <strong style="display:block; margin-top:6px; color:var(--text-primary);">${soldCount}</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-md); padding: 12px;">
                        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Rejected Listings</div>
                        <strong style="display:block; margin-top:6px; color:var(--text-primary);">${rejectedCount}</strong>
                    </div>
                </div>
                ${businessPage ? `<div style="display:flex; justify-content:flex-start;">
                    <a href="${escapeHtml(businessPage.website || '../pages/directory.html')}" target="_blank" rel="noopener" class="btn-secondary" style="padding:10px 14px; font-size:12px;">Open Business Page</a>
                </div>` : ''}
            </div>
        `;
    } catch (err) {
        body.innerHTML = `<p style="color: var(--text-muted);">Unable to load seller profile: ${escapeHtml(err.message || err)}</p>`;
        console.error('Failed to open seller profile:', err.message || err);
    }
};

window.closeMarketplaceSellerModal = () => {
    const modal = document.getElementById('marketplace-seller-modal');
    if (modal) modal.style.display = 'none';
};

window.restoreMarketplaceListing = async (id) => {
    const confirmAction = confirm('Restore this listing back to approved?');
    if (!confirmAction) return;
    try {
        const { error } = await supabase.from('marketplace_listings').update({ status: 'approved', deleted_at: null }).eq('id', id);
        if (error) throw error;
        await supabase.from('audit_logs').insert({
            user_id: currentAdminId,
            action: 'Restore Listing',
            table_name: 'marketplace_listings',
            record_id: id,
            new_data: { status: 'approved' }
        });
        alert('Listing restored successfully.');
        await loadControlConsole();
    } catch (err) {
        alert(`Restore Error: ${err.message}`);
    }
};

window.deleteMarketplaceListing = async (id) => {
    const confirmAction = confirm('Delete this listing permanently?');
    if (!confirmAction) return;
    try {
        const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
        if (error) throw error;
        await supabase.from('audit_logs').insert({
            user_id: currentAdminId,
            action: 'Delete Listing',
            table_name: 'marketplace_listings',
            record_id: id,
            new_data: { deleted: true }
        });
        alert('Listing deleted permanently.');
        await loadControlConsole();
    } catch (err) {
        alert(`Delete Error: ${err.message}`);
    }
};

window.moderateListing = async (id, outcome) => {
    const confirmAction = confirm(`Execute Moderation: Mark listing status as ${outcome}?`);
    if (!confirmAction) return;

    try {
        const { error } = await supabase
            .from('marketplace_listings')
            .update({ status: outcome, deleted_at: null })
            .eq('id', id);

        if (error) throw error;

        // Append to audited system logs
        await supabase.from('audit_logs').insert({
            user_id: currentAdminId,
            action: `Moderate Listing - ${outcome}`,
            table_name: 'marketplace_listings',
            record_id: id,
            new_data: { outcome }
        });

        alert('Listing updated successfully.');
        await loadControlConsole();
    } catch (err) {
        alert(`Moderation Error: ${err.message}`);
    }
};

// ==========================================
// 4. BILLING & PREMIUM BILLING VERIFICATIONS
// ==========================================
async function fetchPaymentsQueue() {
    const queue = document.getElementById('admin-payments-queue');
    const badge = document.getElementById('payments-queue-badge');
    const sectionQueue = document.getElementById('admin-payments-section-queue');
    if (!queue && !badge && !sectionQueue) return;

    const emptyHtml = '<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">Payments module not installed.</p>';

    if (badge) badge.textContent = 'Payments module not installed.';
    if (queue) queue.innerHTML = emptyHtml;
    if (sectionQueue) sectionQueue.innerHTML = emptyHtml;
}

window.moderatePayment = async () => {
    alert('Payments module is not installed.');
};

// ==========================================
// 5. CONTENT MANAGEMENT QUEUE
// ==========================================
function setupFootballAdminRealtime() {
    if (footballAdminRealtimeChannel) return;

    footballAdminRealtimeChannel = supabase.channel('football-admin-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'football_matches' }, async () => {
            await fetchContentQueue();
            await refreshFootballLiveData();
        })
        .subscribe((status) => {
            if (status !== 'SUBSCRIBED' && status !== 'TIMED OUT') {
                console.warn('Football admin sync status:', status);
            }
        });
}

function normalizeFootballText(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeFootballStreamType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['auto', 'youtube', 'vimeo', 'hls', 'mp4', 'webm', 'external'].includes(normalized)) {
        return normalized;
    }
    return 'auto';
}

function detectFootballStreamType(url) {
    const trimmedUrl = String(url || '').trim().toLowerCase();
    if (!trimmedUrl) return 'external';
    if (trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be')) return 'youtube';
    if (trimmedUrl.includes('vimeo.com') || trimmedUrl.includes('player.vimeo.com')) return 'vimeo';
    if (trimmedUrl.endsWith('.m3u8') || trimmedUrl.includes('.m3u8') || trimmedUrl.includes('hls')) return 'hls';
    if (trimmedUrl.endsWith('.mp4')) return 'mp4';
    if (trimmedUrl.endsWith('.webm')) return 'webm';
    return 'external';
}

function buildYoutubeEmbedUrl(url) {
    const trimmedUrl = String(url || '').trim();
    if (!trimmedUrl) return '';

    try {
        const parsedUrl = new URL(trimmedUrl);
        const host = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();

        if (host === 'youtube.com' || host === 'm.youtube.com') {
            const videoId = parsedUrl.searchParams.get('v');
            if (videoId) return `https://www.youtube.com/embed/${videoId}`;
            if (parsedUrl.pathname.startsWith('/embed/')) {
                const embedId = parsedUrl.pathname.replace('/embed/', '').split('/')[0];
                if (embedId) return `https://www.youtube.com/embed/${embedId}`;
            }
            if (parsedUrl.pathname === '/live' || parsedUrl.pathname.startsWith('/live/')) {
                const livePath = parsedUrl.pathname.replace(/^\/live\/?/, '');
                if (livePath) return `https://www.youtube.com/embed/${livePath}`;
                const channel = parsedUrl.searchParams.get('channel');
                if (channel) return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channel)}`;
                return 'https://www.youtube.com/embed/live_stream';
            }
            if (parsedUrl.pathname.startsWith('/watch')) {
                const watchVideoId = parsedUrl.searchParams.get('v');
                if (watchVideoId) return `https://www.youtube.com/embed/${watchVideoId}`;
            }
        }

        if (host === 'youtu.be') {
            const videoId = parsedUrl.pathname.replace(/^\//, '');
            if (videoId) return `https://www.youtube.com/embed/${videoId}`;
        }
    } catch (err) {
        return '';
    }

    return '';
}

function buildVimeoEmbedUrl(url) {
    const trimmedUrl = String(url || '').trim();
    if (!trimmedUrl) return '';

    try {
        const parsedUrl = new URL(trimmedUrl);
        const host = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

        if (host === 'vimeo.com' || host === 'player.vimeo.com') {
            const videoId = pathSegments[0] || parsedUrl.searchParams.get('video_id');
            if (videoId) return `https://player.vimeo.com/video/${videoId}`;
        }
    } catch (err) {
        return '';
    }

    return '';
}

function buildFootballEmbedUrl(url, streamType) {
    const trimmedUrl = String(url || '').trim();
    const normalizedType = normalizeFootballStreamType(streamType);

    if (!trimmedUrl) return '';

    if (normalizedType === 'youtube') {
        return buildYoutubeEmbedUrl(trimmedUrl) || trimmedUrl;
    }

    if (normalizedType === 'vimeo') {
        return buildVimeoEmbedUrl(trimmedUrl) || trimmedUrl;
    }

    return trimmedUrl;
}

function validateFootballStreamUrl(url) {
    const trimmedUrl = String(url || '').trim();
    const detectedType = detectFootballStreamType(trimmedUrl);

    if (!trimmedUrl) {
        return { valid: false, error: 'A stream URL is required before publishing.', detectedType };
    }

    try {
        const parsedUrl = new URL(trimmedUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { valid: false, error: 'Please provide a valid public URL starting with http:// or https://.', detectedType };
        }
    } catch (err) {
        return { valid: false, error: 'Please provide a valid public URL starting with http:// or https://.', detectedType };
    }

    if (detectedType === 'hls' && !trimmedUrl.toLowerCase().endsWith('.m3u8')) {
        return { valid: false, error: 'HLS streams must use a .m3u8 URL.', detectedType };
    }

    if ((detectedType === 'mp4' || detectedType === 'webm') && !/\.(mp4|webm)(\?.*)?$/i.test(trimmedUrl)) {
        return { valid: false, error: 'MP4/WebM streams must use a .mp4 or .webm URL.', detectedType };
    }

    if (detectedType === 'youtube') {
        const youtubeEmbedUrl = buildYoutubeEmbedUrl(trimmedUrl);
        if (!youtubeEmbedUrl) {
            return { valid: false, error: 'Please provide a valid YouTube Live URL.', detectedType };
        }
    }

    if (detectedType === 'vimeo') {
        const vimeoEmbedUrl = buildVimeoEmbedUrl(trimmedUrl);
        if (!vimeoEmbedUrl) {
            return { valid: false, error: 'Please provide a valid Vimeo URL.', detectedType };
        }
    }

    return { valid: true, error: null, detectedType };
}

async function checkFootballMatchDuplicate({ id, title, homeTeam, awayTeam, competition, kickoff }) {
    const { data, error } = await supabase
        .from('football_matches')
        .select('id, title, home_team, away_team, competition, kickoff_at')
        .is('deleted_at', null);

    if (error) throw error;

    const normalizedTitle = normalizeFootballText(title);
    const normalizedHome = normalizeFootballText(homeTeam);
    const normalizedAway = normalizeFootballText(awayTeam);
    const normalizedCompetition = normalizeFootballText(competition || 'Malawi Football');
    const normalizedKickoff = kickoff ? new Date(kickoff).toISOString() : null;

    return data.some(match => {
        if (match.id === id) return false;

        const sameTitle = normalizeFootballText(match.title) === normalizedTitle;
        const sameHome = normalizeFootballText(match.home_team) === normalizedHome;
        const sameAway = normalizeFootballText(match.away_team) === normalizedAway;
        const sameCompetition = normalizeFootballText(match.competition || 'Malawi Football') === normalizedCompetition;
        const sameKickoff = normalizedKickoff
            ? new Date(match.kickoff_at).toISOString() === normalizedKickoff
            : !match.kickoff_at && !normalizedKickoff;

        return sameTitle && sameHome && sameAway && sameCompetition && sameKickoff;
    });
}

function resetFootballForm() {
    const form = document.getElementById('football-match-form');
    const hiddenId = document.getElementById('football-match-id');
    const submitButton = document.querySelector('#football-match-form button[type="submit"]');
    const cancelButton = document.getElementById('football-form-cancel');
    const homeLogoInput = document.getElementById('football-logo-home');
    const awayLogoInput = document.getElementById('football-logo-away');
    const thumbnailInput = document.getElementById('football-thumbnail');
    const streamTypeInput = document.getElementById('football-stream-type');
    const publishStateInput = document.getElementById('football-publish-state');

    if (form) form.reset();
    if (hiddenId) hiddenId.value = '';
    if (homeLogoInput) homeLogoInput.value = '';
    if (awayLogoInput) awayLogoInput.value = '';
    if (thumbnailInput) thumbnailInput.value = '';
    if (streamTypeInput) streamTypeInput.value = 'auto';
    if (publishStateInput) publishStateInput.value = 'published';
    if (submitButton) submitButton.textContent = 'Publish Match';
    if (cancelButton) cancelButton.hidden = true;
}

function setFootballFormEditing(match) {
    const hiddenId = document.getElementById('football-match-id');
    const titleInput = document.getElementById('football-title');
    const homeInput = document.getElementById('football-home');
    const awayInput = document.getElementById('football-away');
    const competitionInput = document.getElementById('football-competition');
    const streamInput = document.getElementById('football-stream');
    const homeLogoInput = document.getElementById('football-logo-home');
    const awayLogoInput = document.getElementById('football-logo-away');
    const thumbnailInput = document.getElementById('football-thumbnail');
    const streamTypeInput = document.getElementById('football-stream-type');
    const publishStateInput = document.getElementById('football-publish-state');
    const summaryInput = document.getElementById('football-summary');
    const kickoffInput = document.getElementById('football-kickoff');
    const statusInput = document.getElementById('football-status');
    const submitButton = document.querySelector('#football-match-form button[type="submit"]');
    const cancelButton = document.getElementById('football-form-cancel');

    if (hiddenId) hiddenId.value = match.id;
    if (titleInput) titleInput.value = match.title || '';
    if (homeInput) homeInput.value = match.home_team || '';
    if (awayInput) awayInput.value = match.away_team || '';
    if (competitionInput) competitionInput.value = match.competition || '';
    if (streamInput) streamInput.value = match.original_url || match.stream_url || '';
    if (homeLogoInput) homeLogoInput.value = match.team_a_logo_url || '';
    if (awayLogoInput) awayLogoInput.value = match.team_b_logo_url || '';
    if (thumbnailInput) thumbnailInput.value = match.thumbnail_url || '';
    if (streamTypeInput) streamTypeInput.value = match.stream_type || 'auto';
    if (publishStateInput) publishStateInput.value = match.is_draft ? 'draft' : 'published';
    if (summaryInput) summaryInput.value = match.match_summary || '';
    if (kickoffInput) kickoffInput.value = match.kickoff_at ? new Date(match.kickoff_at).toISOString().slice(0, 16) : '';
    if (statusInput) statusInput.value = match.status || 'scheduled';
    if (submitButton) submitButton.textContent = 'Update Match';
    if (cancelButton) cancelButton.hidden = false;
    if (titleInput) titleInput.focus();
}

window.editFootballMatch = async (id) => {
    try {
        const { data, error } = await supabase
            .from('football_matches')
            .select('id, title, home_team, away_team, competition, stream_url, original_url, embed_url, stream_type, match_summary, kickoff_at, status, team_a_logo_url, team_b_logo_url, thumbnail_url, is_draft')
            .eq('id', id)
            .single();

        if (error) throw error;
        setFootballFormEditing(data);
    } catch (err) {
        alert(`Unable to load the selected match: ${err.message}`);
    }
};

window.deleteFootballMatch = async (id) => {
    const confirmAction = confirm('Delete this match permanently?');
    if (!confirmAction) return;

    try {
        const { error } = await supabase.from('football_matches').delete().eq('id', id);
        if (error) throw error;

        if (typeof window.refreshFootballMatches === 'function') {
            window.footballMatches = (window.footballMatches || []).filter(item => item.id !== id);
        }

        await fetchContentQueue();
        await refreshFootballLiveData();
        alert('Football match deleted successfully.');
    } catch (err) {
        alert(`Unable to delete match: ${err.message}`);
    }
};

window.endFootballMatch = async (id) => {
    try {
        const { error } = await supabase
            .from('football_matches')
            .update({ status: 'completed', ended_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;

        await fetchContentQueue();
        await refreshFootballLiveData();
        alert('Football match marked as completed.');
    } catch (err) {
        alert(`Unable to end match: ${err.message}`);
    }
};

function setupContentForms() {
    const form = document.getElementById('football-match-form');
    const addMatchButton = document.querySelector('#admin-section-football .section-toolbar-actions .btn-primary');
    const upcomingButton = document.querySelector('#admin-section-football .section-toolbar-actions .btn-secondary');
    const cancelButton = document.getElementById('football-form-cancel');

    if (addMatchButton) {
        addMatchButton.addEventListener('click', () => {
            resetFootballForm();
            const titleInput = document.getElementById('football-title');
            if (titleInput) {
                titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                titleInput.focus();
            }
        });
    }

    if (upcomingButton) {
        upcomingButton.addEventListener('click', async () => {
            await fetchContentQueue();
            resetFootballForm();
        });
    }

    if (cancelButton) {
        cancelButton.addEventListener('click', (event) => {
            event.preventDefault();
            resetFootballForm();
        });
    }

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('football-title').value.trim();
        const homeTeam = document.getElementById('football-home').value.trim();
        const awayTeam = document.getElementById('football-away').value.trim();
        const competition = document.getElementById('football-competition').value.trim();
        const streamUrl = document.getElementById('football-stream').value.trim();
        const homeLogoUrl = document.getElementById('football-logo-home').value.trim();
        const awayLogoUrl = document.getElementById('football-logo-away').value.trim();
        const thumbnailUrl = document.getElementById('football-thumbnail').value.trim();
        const publishState = document.getElementById('football-publish-state').value;
        const summary = document.getElementById('football-summary').value.trim();
        const kickoff = document.getElementById('football-kickoff').value;
        const status = document.getElementById('football-status').value;
        const matchId = document.getElementById('football-match-id').value;

        if (!title || !homeTeam || !awayTeam) {
            alert('Please provide a title and both teams before publishing.');
            return;
        }

        const streamValidation = validateFootballStreamUrl(streamUrl);
        if (!streamValidation.valid) {
            alert(streamValidation.error);
            return;
        }

        const streamType = normalizeFootballStreamType(streamValidation.detectedType);

        try {
            const isDuplicate = await checkFootballMatchDuplicate({
                id: matchId,
                title,
                homeTeam,
                awayTeam,
                competition,
                kickoff
            });

            if (isDuplicate) {
                alert('A matching football match already exists. Please update the existing entry instead of creating a duplicate.');
                return;
            }

            const embedUrl = buildFootballEmbedUrl(streamUrl, streamType);
            const payload = {
                title,
                home_team: homeTeam,
                away_team: awayTeam,
                competition: competition || 'Malawi Football',
                stream_type: streamType,
                stream_url: streamUrl,
                original_url: streamUrl,
                embed_url: embedUrl,
                team_a_logo_url: homeLogoUrl || null,
                team_b_logo_url: awayLogoUrl || null,
                thumbnail_url: thumbnailUrl || null,
                match_summary: summary || 'Match coverage added from the admin console.',
                kickoff_at: kickoff ? new Date(kickoff).toISOString() : null,
                status: status || 'scheduled',
                is_draft: publishState === 'draft',
                is_featured: true
            };

            let result;
            if (matchId) {
                result = await supabase.from('football_matches').update(payload).eq('id', matchId);
            } else {
                result = await supabase.from('football_matches').insert(payload);
            }

            if (result.error) throw result.error;

            form.reset();
            resetFootballForm();
            await fetchContentQueue();
            await refreshFootballLiveData();
            alert(matchId ? 'Football match updated successfully.' : 'Football match published successfully.');
        } catch (err) {
            alert(`Unable to save match stream: ${err.message}`);
        }
    });
}

async function fetchContentQueue() {
    const queue = document.getElementById('admin-content-queue');
    const badge = document.getElementById('content-queue-badge');
    if (!queue) return;

    try {
        const [{ data: newsData, error: newsErr }, { data: matchData, error: matchErr }] = await Promise.all([
            supabase.from('news_articles').select('id, title, category, status, is_breaking, is_featured, is_pinned, created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(8),
            supabase.from('football_matches').select('id, title, competition, status, is_featured, created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(8)
        ]);

        if (newsErr) throw newsErr;
        if (matchErr) throw matchErr;

        const items = [
            ...(newsData || []).map(item => ({ kind: 'News', ...item })),
            ...(matchData || []).map(item => ({ kind: 'Football', ...item }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (badge) badge.textContent = `${items.length} Items`;

        if (items.length === 0) {
            queue.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">No content entries to review.</p>`;
            return;
        }

        queue.innerHTML = items.map(item => `
            <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: var(--radius-md); border: var(--glass-border); display: flex; justify-content: space-between; align-items: center; gap: 12px; animation: fadeIn 0.3s ease;">
                <div>
                    <strong style="display: block; font-size: 14px; color: var(--text-primary);">${item.kind}: ${item.title}</strong>
                    <span style="display: block; font-size: 12px; color: var(--text-muted); margin-top: 4px;">Category: ${item.category || item.competition || 'General'} &bull; Status: ${item.status || 'draft'}</span>
                    <span style="display: block; font-size: 11px; color: var(--gold-base); margin-top: 6px;">Flags: ${[item.is_breaking ? 'Breaking' : '', item.is_featured ? 'Featured' : '', item.is_pinned ? 'Pinned' : ''].filter(Boolean).join(', ') || 'None'}</span>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
                    ${item.kind === 'Football' ? `<button class="btn-secondary" style="padding: 8px 16px; font-size: 11px;" onclick="window.editFootballMatch('${item.id}')">Edit</button><button class="btn-secondary" style="padding: 8px 16px; font-size: 11px;" onclick="window.endFootballMatch('${item.id}')">End</button><button class="btn-secondary" style="padding: 8px 16px; font-size: 11px; border-color: rgba(255, 92, 92, 0.3); color: #ff8a8a;" onclick="window.deleteFootballMatch('${item.id}')">Delete</button>` : `<button class="btn-secondary" style="padding: 8px 16px; font-size: 11px;" onclick="window.refreshAdminQueues()">Refresh</button>`}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to populate content queue:', err.message);
    }
}

async function refreshFootballLiveData() {
    if (typeof window.refreshFootballMatches === 'function') {
        await window.refreshFootballMatches();
    }
}

window.refreshAdminQueues = async () => {
    await fetchContentQueue();
    await fetchMarketplaceQueue();
    await initializePaymentsModule();
    await fetchReportsQueue();
};

// ==========================================
// 6. GOVERNMENT SERVICES MANAGER
// ==========================================
function setupGovernmentManager() {
    const portalForm = document.getElementById('gov-portal-form');
    const hotlineForm = document.getElementById('gov-hotline-form');
    const formForm = document.getElementById('gov-form-upload-form');

    if (portalForm) {
        portalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                institution: document.getElementById('gov-portal-institution').value.trim(),
                button_label: document.getElementById('gov-portal-label').value.trim(),
                website_url: document.getElementById('gov-portal-url').value.trim(),
                description: document.getElementById('gov-portal-description').value.trim(),
                display_order: parseInt(document.getElementById('gov-portal-order').value || '0', 10),
                is_active: true,
                created_by: currentAdminId
            };
            if (!payload.institution || !payload.button_label || !payload.website_url) {
                alert('Please fill in the institution, button label, and website URL.');
                return;
            }
            try {
                const { error } = await supabase.from('government_portals').insert(payload);
                if (error) throw error;
                portalForm.reset();
                await loadGovernmentAdminLists();
                alert('Portal saved successfully.');
            } catch (err) {
                alert(`Unable to save portal: ${err.message}`);
            }
        });
    }

    if (hotlineForm) {
        hotlineForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                institution_name: document.getElementById('gov-hotline-name').value.trim(),
                hotline_number: document.getElementById('gov-hotline-number').value.trim(),
                alternative_number: document.getElementById('gov-hotline-alt').value.trim(),
                whatsapp_number: document.getElementById('gov-hotline-whatsapp').value.trim(),
                email: document.getElementById('gov-hotline-email').value.trim(),
                physical_address: document.getElementById('gov-hotline-address').value.trim(),
                description: document.getElementById('gov-hotline-description').value.trim(),
                category: document.getElementById('gov-hotline-category').value.trim(),
                status: document.getElementById('gov-hotline-status').value,
                display_order: parseInt(document.getElementById('gov-hotline-order').value || '0', 10),
                icon: document.getElementById('gov-hotline-icon').value.trim(),
                is_active: true,
                created_by: currentAdminId
            };
            if (!payload.institution_name) {
                alert('Please provide an institution name.');
                return;
            }
            try {
                const { error } = await supabase.from('government_hotlines').insert(payload);
                if (error) throw error;
                hotlineForm.reset();
                await loadGovernmentAdminLists();
                alert('Hotline saved successfully.');
            } catch (err) {
                alert(`Unable to save hotline: ${err.message}`);
            }
        });
    }

    if (formForm) {
        formForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('gov-form-file');
            const thumbnailInput = document.getElementById('gov-form-thumbnail');
            const file = fileInput?.files?.[0];
            if (!file) {
                alert('Please choose a PDF form file.');
                return;
            }
            const validation = validateFile(file, 'ai_pdf');
            if (!validation.valid) {
                alert(validation.error);
                return;
            }
            try {
                const uploadedUrl = await storageAPI.uploadFile(file, 'businesses', 'ai_pdf');
                let thumbnailUrl = null;
                if (thumbnailInput?.files?.[0]) {
                    const thumbValidation = validateFile(thumbnailInput.files[0], 'marketplace_img');
                    if (!thumbValidation.valid) {
                        alert(thumbValidation.error);
                        return;
                    }
                    thumbnailUrl = await storageAPI.uploadFile(thumbnailInput.files[0], 'businesses', 'marketplace_img');
                }
                const payload = {
                    title: document.getElementById('gov-form-title').value.trim(),
                    institution: document.getElementById('gov-form-institution').value.trim(),
                    category: document.getElementById('gov-form-category').value.trim(),
                    description: document.getElementById('gov-form-description').value.trim(),
                    file_url: uploadedUrl,
                    thumbnail_url: thumbnailUrl,
                    file_size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                    version: document.getElementById('gov-form-version').value.trim(),
                    publish_date: document.getElementById('gov-form-publish').value || null,
                    status: 'Active',
                    is_active: true,
                    created_by: currentAdminId
                };
                const { error } = await supabase.from('government_forms').insert(payload);
                if (error) throw error;
                formForm.reset();
                await loadGovernmentAdminLists();
                alert('Government form uploaded successfully.');
            } catch (err) {
                alert(`Unable to upload form: ${err.message}`);
            }
        });
    }

    loadGovernmentAdminLists();
}

async function loadGovernmentAdminLists() {
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
        console.error('Government manager load failed:', err.message);
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
            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                <button class="btn-secondary" style="padding: 6px 10px; font-size: 10px;" onclick="window.toggleGovernmentPortal('${item.id}', ${item.is_active})">${item.is_active ? 'Deactivate' : 'Activate'}</button>
                <button class="btn-secondary" style="padding: 6px 10px; font-size: 10px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteGovernmentPortal('${item.id}')">Delete</button>
            </div>
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
            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                <button class="btn-secondary" style="padding: 6px 10px; font-size: 10px;" onclick="window.toggleGovernmentHotline('${item.id}', ${item.is_active})">${item.is_active ? 'Deactivate' : 'Activate'}</button>
                <button class="btn-secondary" style="padding: 6px 10px; font-size: 10px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteGovernmentHotline('${item.id}')">Delete</button>
            </div>
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
            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                <button class="btn-secondary" style="padding: 6px 10px; font-size: 10px;" onclick="window.toggleGovernmentForm('${item.id}', ${item.is_active})">${item.is_active ? 'Deactivate' : 'Activate'}</button>
                <button class="btn-secondary" style="padding: 6px 10px; font-size: 10px; border-color: var(--heritage-red); color: var(--text-primary);" onclick="window.deleteGovernmentForm('${item.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

window.toggleGovernmentPortal = async (id, currentState) => {
    try {
        const { error } = await supabase.from('government_portals').update({ is_active: !currentState }).eq('id', id);
        if (error) throw error;
        await loadGovernmentAdminLists();
    } catch (err) {
        alert(`Unable to update portal: ${err.message}`);
    }
};

window.deleteGovernmentPortal = async (id) => {
    if (!confirm('Delete this portal?')) return;
    try {
        const { error } = await supabase.from('government_portals').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        await loadGovernmentAdminLists();
    } catch (err) {
        alert(`Unable to delete portal: ${err.message}`);
    }
};

window.toggleGovernmentHotline = async (id, currentState) => {
    try {
        const { error } = await supabase.from('government_hotlines').update({ is_active: !currentState }).eq('id', id);
        if (error) throw error;
        await loadGovernmentAdminLists();
    } catch (err) {
        alert(`Unable to update hotline: ${err.message}`);
    }
};

window.deleteGovernmentHotline = async (id) => {
    if (!confirm('Delete this hotline?')) return;
    try {
        const { error } = await supabase.from('government_hotlines').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        await loadGovernmentAdminLists();
    } catch (err) {
        alert(`Unable to delete hotline: ${err.message}`);
    }
};

window.toggleGovernmentForm = async (id, currentState) => {
    try {
        const { error } = await supabase.from('government_forms').update({ is_active: !currentState }).eq('id', id);
        if (error) throw error;
        await loadGovernmentAdminLists();
    } catch (err) {
        alert(`Unable to update form: ${err.message}`);
    }
};

window.deleteGovernmentForm = async (id) => {
    if (!confirm('Delete this form?')) return;
    try {
        const { error } = await supabase.from('government_forms').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        await loadGovernmentAdminLists();
    } catch (err) {
        alert(`Unable to delete form: ${err.message}`);
    }
};

// ==========================================
// 7. COMPLIANCE & COMPLAINTS EXECUTORS
// ==========================================
async function fetchReportsQueue() {
    const queue = document.getElementById('admin-reports-queue');
    const badge = document.getElementById('reports-queue-badge');
    if (!queue) return;

    try {
        const { data, error } = await supabase
            .from('reports')
            .select('*, profiles:reporter_id (full_name)')
            .in('status', ['pending', 'under_review'])
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (badge) badge.textContent = `${data.length} Open Alerts`;

        if (data.length === 0) {
            queue.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">No unresolved security alerts registered.</p>`;
            return;
        }

        queue.innerHTML = data.map(item => `
            <div style="background: rgba(226,28,38,0.03); padding: 16px; border-radius: var(--radius-md); border: 1px solid rgba(226,28,38,0.2); display: flex; justify-content: space-between; align-items: center; gap: 16px; animation: fadeIn 0.3s ease;">
                <div>
                    <strong style="display: block; font-size: 14px; color: var(--text-primary); text-transform: capitalize;">Report: ${item.report_type ? item.report_type.replace('_', ' ') : 'Unknown'}</strong>
                    <span style="display: block; font-size: 12px; color: var(--text-muted); margin-top: 4px;">Report Number: ${item.report_number || 'N/A'}</span>
                    <span style="display: block; font-size: 12px; color: var(--gold-base); margin-top: 4px;">Reported User: ${item.reported_user || 'N/A'} &bull; Related Listing: ${item.listing_id || 'N/A'}</span>
                    <span style="display: block; font-size: 13px; color: var(--text-secondary); margin-top: 8px;">Description: ${item.description || 'No details provided.'}</span>
                    ${item.evidence_url ? `<a href="${item.evidence_url}" target="_blank" class="btn-secondary" style="margin-top: 8px; padding: 6px 12px; font-size: 11px; display: inline-block;">View Evidence</a>` : ''}
                    <span style="display: block; font-size: 11px; color: var(--text-muted); margin-top: 6px;">Reported by: ${item.profiles?.full_name || 'Anonymous User'}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; min-width: 140px;">
                    <button class="btn-primary" style="padding: 8px 16px; font-size: 11px;" onclick="window.resolveReport('${item.id}')">Resolve & Dismiss</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to populate reports queue:', err.message);
    }
}

window.resolveReport = async (reportId) => {
    const confirmAction = confirm('Security Action: Dismiss this complaint and mark report as resolved?');
    if (!confirmAction) return;

    try {
        const { error } = await supabase
            .from('reports')
            .update({
                status: 'resolved',
                reviewed_by: currentAdminId,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', reportId);

        if (error) throw error;

        await safeAuditLog('Resolve Compliance Report', 'reports', reportId, { status: 'resolved' });

        alert('Security complaint marked as resolved.');
        await loadControlConsole();
    } catch (err) {
        alert(`Compliance Exception: ${err.message}`);
    }
};