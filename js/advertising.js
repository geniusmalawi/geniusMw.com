const ADVERTISEMENT_STORAGE_KEY = 'genius-malawi-advertisements-v1';
const ADVERTISEMENT_VIEW_KEY = 'genius-malawi-advertisement-views-v1';
const ADVERTISEMENT_CLICK_KEY = 'genius-malawi-advertisement-clicks-v1';

const AD_TYPES = [
    { value: 'banner', label: 'Banner Advertisement' },
    { value: 'carousel', label: 'Carousel Advertisement' },
    { value: 'popup', label: 'Popup Advertisement' },
    { value: 'sidebar', label: 'Sidebar Advertisement' },
    { value: 'sponsored-card', label: 'Sponsored Card' },
    { value: 'full-screen', label: 'Full Screen Advertisement' },
    { value: 'video', label: 'Video Advertisement' },
    { value: 'image', label: 'Image Advertisement' }
];

const DISPLAY_LOCATIONS = [
    { value: 'home', label: 'Home Page' },
    { value: 'news', label: 'News' },
    { value: 'books', label: 'Books' },
    { value: 'jobs', label: 'Jobs' },
    // Football display location removed — only keep core sections
    { value: 'government', label: 'Government Services' },
    { value: 'media', label: 'Media & Entertainment' },
    { value: 'entire-website', label: 'Entire Website' }
];

const AUDIENCE_OPTIONS = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'logged-in', label: 'Logged-in Users' },
    { value: 'guests', label: 'Guests' }
];

function safeStorage() {
    try { return window.localStorage; } catch (err) { return null; }
}

function getStoredAdvertisements() {
    const storage = safeStorage();
    if (!storage) return [];
    try {
        const raw = storage.getItem(ADVERTISEMENT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        return [];
    }
}

function saveStoredAdvertisements(items) {
    const storage = safeStorage();
    if (!storage) return;
    storage.setItem(ADVERTISEMENT_STORAGE_KEY, JSON.stringify(items));
}

function getStoredCounters(key) {
    const storage = safeStorage();
    if (!storage) return {};
    try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        return {};
    }
}

function saveStoredCounters(key, value) {
    const storage = safeStorage();
    if (!storage) return;
    storage.setItem(key, JSON.stringify(value));
}

function generateId() {
    return `ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAd(item = {}) {
    return {
        id: item.id || generateId(),
        title: item.title || 'Untitled Advertisement',
        type: item.type || 'banner',
        advertiser_name: item.advertiser_name || '',
        image_url: item.image_url || '',
        carousel_images: Array.isArray(item.carousel_images) ? item.carousel_images : [],
        video_url: item.video_url || '',
        description: item.description || '',
        button_text: item.button_text || 'Learn More',
        destination_url: item.destination_url || '#',
        start_date: item.start_date || '',
        end_date: item.end_date || '',
        display_priority: item.display_priority || 'medium',
        display_locations: Array.isArray(item.display_locations) ? item.display_locations : (item.display_location ? [item.display_location] : ['home']),
        audience: item.audience || 'everyone',
        is_active: item.is_active !== false,
        status: item.status || 'draft',
        archived: Boolean(item.archived),
        views: Number(item.views || 0),
        clicks: Number(item.clicks || 0),
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString()
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDisplayLocationFromPath(pathname) {
    const location = String(pathname || '').toLowerCase();
    if (location.includes('/pages/news') || location.includes('/news')) return 'news';
    if (location.includes('/pages/books') || location.includes('/books')) return 'books';
    if (location.includes('/pages/jobs') || location.includes('/jobs')) return 'jobs';
    if (location.includes('/pages/government') || location.includes('/government')) return 'government';
    if (location.includes('/pages/media') || location.includes('/media')) return 'media';
    if (location.includes('/pages') && location.includes('football')) return 'football';
    return 'home';
}

function isActiveAndVisible(ad) {
    const normalized = normalizeAd(ad);
    if (normalized.archived || !normalized.is_active || normalized.status !== 'published') return false;
    const now = Date.now();
    const start = normalized.start_date ? new Date(normalized.start_date).getTime() : 0;
    const end = normalized.end_date ? new Date(normalized.end_date).getTime() : Number.MAX_SAFE_INTEGER;
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
}

function matchesAudience(ad) {
    const normalized = normalizeAd(ad);
    if (!normalized.audience || normalized.audience === 'everyone') return true;
    const isLoggedIn = Boolean(window.__gmSessionUser);
    if (normalized.audience === 'logged-in' && isLoggedIn) return true;
    if (normalized.audience === 'guests' && !isLoggedIn) return true;
    return false;
}

function getAdvertisementsForLocation(location) {
    const currentLocation = location || getDisplayLocationFromPath(window.location.pathname);
    return getStoredAdvertisements().map(normalizeAd).filter((ad) => {
        if (!isActiveAndVisible(ad)) return false;
        if (!matchesAudience(ad)) return false;
        const locations = ad.display_locations || [];
        return locations.includes(currentLocation) || locations.includes('entire-website') || (currentLocation === 'home' && locations.includes('home'));
    }).sort((a, b) => {
        const rank = { high: 3, medium: 2, low: 1 };
        return (rank[b.display_priority] || 2) - (rank[a.display_priority] || 2);
    });
}

function createAdvertisement(payload) {
    const items = getStoredAdvertisements().map(normalizeAd);
    const normalized = normalizeAd({ ...payload, id: payload.id || generateId() });
    const index = items.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
        items[index] = normalized;
    } else {
        items.unshift(normalized);
    }
    saveStoredAdvertisements(items);
    return normalized;
}

function updateAdvertisement(id, updates) {
    const items = getStoredAdvertisements().map(normalizeAd);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const updated = normalizeAd({ ...items[index], ...updates, id, updated_at: new Date().toISOString() });
    items[index] = updated;
    saveStoredAdvertisements(items);
    return updated;
}

function deleteAdvertisement(id) {
    const items = getStoredAdvertisements().map(normalizeAd).filter((item) => item.id !== id);
    saveStoredAdvertisements(items);
    return items;
}

function archiveAdvertisement(id) {
    return updateAdvertisement(id, { archived: true, is_active: false });
}

function restoreAdvertisement(id) {
    return updateAdvertisement(id, { archived: false, is_active: true });
}

function toggleAdvertisementActive(id, isActive) {
    return updateAdvertisement(id, { is_active: Boolean(isActive) });
}

function duplicateAdvertisement(id) {
    const ad = getAdvertisementById(id);
    if (!ad) return null;
    const clone = normalizeAd({ ...ad, id: generateId(), title: `${ad.title} Copy`, status: 'draft', archived: false, is_active: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    createAdvertisement(clone);
    return clone;
}

function getAdvertisementById(id) {
    return getStoredAdvertisements().map(normalizeAd).find((item) => item.id === id) || null;
}

function incrementAdvertisementView(id) {
    const counters = getStoredCounters(ADVERTISEMENT_VIEW_KEY);
    counters[id] = (counters[id] || 0) + 1;
    saveStoredCounters(ADVERTISEMENT_VIEW_KEY, counters);
    const items = getStoredAdvertisements().map(normalizeAd);
    const index = items.findIndex((item) => item.id === id);
    if (index >= 0) {
        items[index] = normalizeAd({ ...items[index], views: (items[index].views || 0) + 1 });
        saveStoredAdvertisements(items);
    }
    return counters[id];
}

function incrementAdvertisementClick(id) {
    const counters = getStoredCounters(ADVERTISEMENT_CLICK_KEY);
    counters[id] = (counters[id] || 0) + 1;
    saveStoredCounters(ADVERTISEMENT_CLICK_KEY, counters);
    const items = getStoredAdvertisements().map(normalizeAd);
    const index = items.findIndex((item) => item.id === id);
    if (index >= 0) {
        items[index] = normalizeAd({ ...items[index], clicks: (items[index].clicks || 0) + 1 });
        saveStoredAdvertisements(items);
    }
    return counters[id];
}

function attachClick(link, ad) {
    if (!link) return;
    link.addEventListener('click', (event) => {
        event.preventDefault();
        incrementAdvertisementClick(ad.id);
        if (ad.destination_url) {
            window.open(ad.destination_url, '_blank', 'noopener,noreferrer');
        }
    });
}

function renderBannerAd(ad) {
    let target = document.getElementById('ad-banner-container') || document.getElementById('ad-display');
    if (!target) {
        target = document.createElement('section');
        target.id = 'ad-banner-container';
        target.className = 'luxury-card';
        target.style.cssText = 'margin:24px 0; padding:24px; text-align:center;';
        document.body.insertBefore(target, document.body.firstChild);
    }
    target.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; align-items:center; justify-content:center;">
            <p style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--gold-base); margin:0;">Sponsored</p>
            <h3 style="margin:0; color:var(--text-primary);">${escapeHtml(ad.title)}</h3>
            <p style="margin:0; color:var(--text-secondary); text-align:center;">${escapeHtml(ad.description || ad.advertiser_name)}</p>
            <a href="${ad.destination_url || '#'}" class="btn-primary" style="padding:10px 16px;" data-ad-link="${ad.id}">${escapeHtml(ad.button_text || 'Learn More')}</a>
        </div>
    `;
    attachClick(target.querySelector('[data-ad-link]'), ad);
    return target;
}

function renderImageAd(ad) {
    const wrapper = document.createElement('div');
    wrapper.className = 'luxury-card';
    wrapper.style.cssText = 'margin:24px 0; padding:0; overflow:hidden;';
    wrapper.innerHTML = `
        <img src="${ad.image_url || '../assets/Icon.png?v=2'}" alt="${escapeHtml(ad.title)}" style="width:100%; max-height:320px; object-fit:cover;">
        <div style="padding:20px;">
            <h3 style="margin:0 0 8px; color:var(--text-primary);">${escapeHtml(ad.title)}</h3>
            <p style="margin:0 0 12px; color:var(--text-secondary);">${escapeHtml(ad.description || ad.advertiser_name)}</p>
            <a href="${ad.destination_url || '#'}" class="btn-secondary" data-ad-link="${ad.id}">${escapeHtml(ad.button_text || 'Learn More')}</a>
        </div>
    `;
    document.body.appendChild(wrapper);
    attachClick(wrapper.querySelector('[data-ad-link]'), ad);
    return wrapper;
}

function renderVideoAd(ad) {
    const wrapper = document.createElement('div');
    wrapper.className = 'luxury-card';
    wrapper.style.cssText = 'margin:24px 0; padding:20px;';
    wrapper.innerHTML = `
        <h3 style="margin:0 0 8px; color:var(--text-primary);">${escapeHtml(ad.title)}</h3>
        <p style="margin:0 0 12px; color:var(--text-secondary);">${escapeHtml(ad.description || ad.advertiser_name)}</p>
        <video controls playsinline autoplay style="width:100%; max-height:320px; border-radius:var(--radius-md); background:#000;">
            <source src="${ad.video_url || ad.image_url || ''}" type="video/mp4">
        </video>
        <div style="margin-top:12px;"><a href="${ad.destination_url || '#'}" class="btn-primary" data-ad-link="${ad.id}">${escapeHtml(ad.button_text || 'Watch Now')}</a></div>
    `;
    document.body.appendChild(wrapper);
    attachClick(wrapper.querySelector('[data-ad-link]'), ad);
    return wrapper;
}

function renderPopupAd(ad) {
    const popupKey = `popup-${ad.id}`;
    const storage = safeStorage();
    if (storage && storage.getItem(popupKey)) return null;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.75); z-index:20000; padding:20px;';
    overlay.innerHTML = `
        <div class="luxury-card" style="max-width:520px; width:100%; padding:24px; position:relative;">
            <button type="button" style="position:absolute; top:12px; right:12px; border:none; background:none; color:var(--text-muted); cursor:pointer;" data-close-popup>✕</button>
            <h3 style="margin:0 0 8px; color:var(--text-primary);">${escapeHtml(ad.title)}</h3>
            <p style="margin:0 0 12px; color:var(--text-secondary);">${escapeHtml(ad.description || ad.advertiser_name)}</p>
            <img src="${ad.image_url || '../assets/Icon.png?v=2'}" alt="${escapeHtml(ad.title)}" style="width:100%; max-height:220px; object-fit:cover; border-radius:var(--radius-md); margin-bottom:12px;">
            <a href="${ad.destination_url || '#'}" class="btn-primary" style="width:100%; text-align:center;" data-ad-link="${ad.id}">${escapeHtml(ad.button_text || 'Learn More')}</a>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close-popup]').addEventListener('click', () => {
        if (storage) storage.setItem(popupKey, '1');
        overlay.remove();
    });
    attachClick(overlay.querySelector('[data-ad-link]'), ad);
    if (storage) storage.setItem(popupKey, '1');
    return overlay;
}

function renderCarouselAd(ad) {
    const wrapper = document.createElement('div');
    wrapper.className = 'luxury-card';
    wrapper.style.cssText = 'margin:24px 0; padding:20px;';
    const images = Array.isArray(ad.carousel_images) && ad.carousel_images.length ? ad.carousel_images : [ad.image_url || '../assets/Icon.png?v=2'];
    let currentIndex = 0;
    const image = document.createElement('img');
    image.src = images[0];
    image.alt = ad.title;
    image.style.cssText = 'width:100%; max-height:320px; object-fit:cover; border-radius:var(--radius-md); margin-bottom:12px;';
    wrapper.appendChild(image);
    const content = document.createElement('div');
    content.innerHTML = `
        <h3 style="margin:0 0 8px; color:var(--text-primary);">${escapeHtml(ad.title)}</h3>
        <p style="margin:0 0 12px; color:var(--text-secondary);">${escapeHtml(ad.description || ad.advertiser_name)}</p>
        <a href="${ad.destination_url || '#'}" class="btn-primary" data-ad-link="${ad.id}">${escapeHtml(ad.button_text || 'Learn More')}</a>
    `;
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);
    attachClick(content.querySelector('[data-ad-link]'), ad);
    if (images.length > 1) {
        setInterval(() => {
            currentIndex = (currentIndex + 1) % images.length;
            image.src = images[currentIndex];
        }, 5000);
    }
    return wrapper;
}

function renderSidebarAd(ad) {
    const wrapper = document.createElement('aside');
    wrapper.className = 'luxury-card';
    wrapper.style.cssText = 'margin:24px 0; padding:20px;';
    wrapper.innerHTML = `
        <h3 style="margin:0 0 8px; color:var(--text-primary);">${escapeHtml(ad.title)}</h3>
        <p style="margin:0 0 12px; color:var(--text-secondary);">${escapeHtml(ad.description || ad.advertiser_name)}</p>
        <img src="${ad.image_url || '../assets/Icon.png?v=2'}" alt="${escapeHtml(ad.title)}" style="width:100%; max-height:180px; object-fit:cover; border-radius:var(--radius-md); margin-bottom:12px;">
        <a href="${ad.destination_url || '#'}" class="btn-secondary" style="width:100%; text-align:center;" data-ad-link="${ad.id}">${escapeHtml(ad.button_text || 'Learn More')}</a>
    `;
    document.body.appendChild(wrapper);
    attachClick(wrapper.querySelector('[data-ad-link]'), ad);
    return wrapper;
}

function renderSponsoredCardAd(ad) {
    const wrapper = document.createElement('div');
    wrapper.className = 'luxury-card';
    wrapper.style.cssText = 'margin:24px 0; padding:20px;';
    wrapper.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
            <div>
                <div style="font-size:11px; letter-spacing:1px; color:var(--gold-base); text-transform:uppercase; margin-bottom:6px;">Sponsored</div>
                <h3 style="margin:0 0 8px; color:var(--text-primary);">${escapeHtml(ad.title)}</h3>
                <p style="margin:0; color:var(--text-secondary);">${escapeHtml(ad.description || ad.advertiser_name)}</p>
            </div>
            <a href="${ad.destination_url || '#'}" class="btn-primary" data-ad-link="${ad.id}">${escapeHtml(ad.button_text || 'Learn More')}</a>
        </div>
    `;
    document.body.appendChild(wrapper);
    attachClick(wrapper.querySelector('[data-ad-link]'), ad);
    return wrapper;
}

function renderFullScreenAd(ad) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.9); z-index:20010; padding:24px;';
    wrapper.innerHTML = `
        <div class="luxury-card" style="max-width:780px; width:100%; padding:24px; position:relative;">
            <button type="button" style="position:absolute; top:12px; right:12px; border:none; background:none; color:var(--text-muted); cursor:pointer;" data-close-full-screen>✕</button>
            <h2 style="margin:0 0 8px; color:var(--text-primary);">${escapeHtml(ad.title)}</h2>
            <p style="margin:0 0 16px; color:var(--text-secondary);">${escapeHtml(ad.description || ad.advertiser_name)}</p>
            <img src="${ad.image_url || '../assets/Icon.png?v=2'}" alt="${escapeHtml(ad.title)}" style="width:100%; max-height:320px; object-fit:cover; border-radius:var(--radius-md); margin-bottom:16px;">
            <a href="${ad.destination_url || '#'}" class="btn-primary" style="width:100%; text-align:center;" data-ad-link="${ad.id}">${escapeHtml(ad.button_text || 'Explore Now')}</a>
        </div>
    `;
    document.body.appendChild(wrapper);
    wrapper.querySelector('[data-close-full-screen]').addEventListener('click', () => wrapper.remove());
    attachClick(wrapper.querySelector('[data-ad-link]'), ad);
    return wrapper;
}

function renderPublicAdvertisements() {
    const ads = getAdvertisementsForLocation(getDisplayLocationFromPath(window.location.pathname));
    const rendered = [];
    let bannerRendered = false;
    ads.forEach((ad) => {
        switch (ad.type) {
            case 'banner':
                if (!bannerRendered) {
                    renderBannerAd(ad);
                    bannerRendered = true;
                    rendered.push(ad);
                }
                break;
            case 'carousel':
                renderCarouselAd(ad);
                rendered.push(ad);
                break;
            case 'popup':
                renderPopupAd(ad);
                rendered.push(ad);
                break;
            case 'sidebar':
                renderSidebarAd(ad);
                rendered.push(ad);
                break;
            case 'sponsored-card':
                renderSponsoredCardAd(ad);
                rendered.push(ad);
                break;
            case 'full-screen':
                renderFullScreenAd(ad);
                rendered.push(ad);
                break;
            case 'video':
                renderVideoAd(ad);
                rendered.push(ad);
                break;
            default:
                renderImageAd(ad);
                rendered.push(ad);
        }
    });
    return rendered;
}

function initializePublicAdvertisementEngine() {
    if (typeof window === 'undefined' || !document) return;
    const ads = renderPublicAdvertisements();
    ads.forEach((ad) => incrementAdvertisementView(ad.id));
}

function setSessionUserState(isLoggedIn) {
    window.__gmSessionUser = Boolean(isLoggedIn);
}

function getAdvertisementTypes() { return AD_TYPES; }
function getDisplayLocations() { return DISPLAY_LOCATIONS; }
function getAudienceOptions() { return AUDIENCE_OPTIONS; }
function getAdvertisements() { return getStoredAdvertisements().map(normalizeAd); }
function getVisibleAdvertisements(location) { return getAdvertisementsForLocation(location); }

window.advertisingAPI = {
    getAdvertisementTypes,
    getDisplayLocations,
    getAudienceOptions,
    getAdvertisements,
    createAdvertisement,
    updateAdvertisement,
    deleteAdvertisement,
    archiveAdvertisement,
    restoreAdvertisement,
    toggleAdvertisementActive,
    duplicateAdvertisement,
    getAdvertisementById,
    getVisibleAdvertisements,
    incrementAdvertisementView,
    incrementAdvertisementClick,
    initializePublicAdvertisementEngine,
    setSessionUserState,
    getAdvertisementsForLocation
};

if (typeof window !== 'undefined' && window.document) {
    window.addEventListener('DOMContentLoaded', () => {
        initializePublicAdvertisementEngine();
    }, { once: true });
}

export {
    AD_TYPES,
    DISPLAY_LOCATIONS,
    AUDIENCE_OPTIONS,
    createAdvertisement,
    updateAdvertisement,
    deleteAdvertisement,
    archiveAdvertisement,
    restoreAdvertisement,
    toggleAdvertisementActive,
    duplicateAdvertisement,
    getAdvertisementById,
    getAdvertisementTypes,
    getDisplayLocations,
    getAudienceOptions,
    getAdvertisementsForLocation,
    getAdvertisements,
    initializePublicAdvertisementEngine,
    setSessionUserState,
    getVisibleAdvertisements
};
