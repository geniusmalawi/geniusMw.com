// =====================================================================
// GENIUS MALAWI - MAIN APP CORE CONTROLLER
// Location: js/app.js
// Purpose: Controls initialization events, handles dynamic session injection,
//          manages the 10s Super Admin sequence, implements English-only Voice search,
//          governs accessibility profiles, and populates directory updates.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial State Sync
    dismissSplashScreen();
    await synchronizeUserAuthState();
    initializeAccessibilityPreferences();
    initializeResponsiveState();
    
    // 2. Event Registrations
    setupUniversalSearch();
    setupVoiceSearch();
    setupAdminConsoleTrigger();
    setupAccessibilityToggles();
    setupResponsiveListeners();
    await populateSystemFeeds();
});

// ==========================================
// 1. SPLASH SCREEN TRANSITIONS
// ==========================================
function dismissSplashScreen() {
    const splash = document.getElementById('global-splash');
    if (splash) {
        // Smooth luxury fade-out sequence
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 800); 
    }
}

function syncModalBodyLock() {
    const visibleModal = document.querySelector('.splash-screen:not(.hidden)');
    document.body.classList.toggle('modal-open', !!visibleModal);
}

function initializeResponsiveState() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const isLandscape = width >= height;
    const isFoldable = width >= 700 && width <= 1100 && height >= 600 && height <= 1100 && coarsePointer;

    let device = 'desktop';
    if (width < 480 || (coarsePointer && width < 900)) {
        device = 'mobile';
    } else if (width < 900) {
        device = 'tablet';
    } else if (width < 1280) {
        device = 'laptop';
    } else if (width < 1800) {
        device = 'desktop';
    } else {
        device = 'large-monitor';
    }

    document.documentElement.setAttribute('data-device', isFoldable ? 'foldable' : device);
    document.documentElement.setAttribute('data-orientation', isLandscape ? 'landscape' : 'portrait');
    document.documentElement.setAttribute('data-viewport-width', String(width));
    document.documentElement.setAttribute('data-viewport-height', String(height));
}

function setupResponsiveListeners() {
    const onViewportChange = () => initializeResponsiveState();

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);

    const orientationQuery = window.matchMedia('(orientation: landscape)');
    if (typeof orientationQuery.addEventListener === 'function') {
        orientationQuery.addEventListener('change', onViewportChange);
    } else if (typeof orientationQuery.addListener === 'function') {
        orientationQuery.addListener(onViewportChange);
    }
}

// ==========================================
// 2. AUTHENTICATION & PROFILE NAVBAR MANAGEMENT
// ==========================================
async function synchronizeUserAuthState() {
    const navAuthContainer = document.getElementById('nav-auth-container');
    if (!navAuthContainer) return;

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        const session = data ? data.session : null;

        if (session && session.user) {
            // Retrieve actual user Profile info
            const { data: profile, error: profileErr } = await supabase
                .from('profiles')
                .select('full_name, role')
                .eq('id', session.user.id)
                .single();

            if (profileErr) throw profileErr;

            if (profile) {
                const profileRole = typeof profile.role === 'string' ? profile.role : '';
                const fullName = typeof profile.full_name === 'string' ? profile.full_name : 'User';
                
                const isPremium = profileRole === 'premium_user' || profileRole === 'super_admin';
                const premiumBadge = isPremium 
                    ? `<span class="badge badge-premium" style="margin-left:8px;">PREMIUM</span>`
                    : '';

                // Inject signed-in navigation controls safely
                navAuthContainer.innerHTML = `
                    <div style="display:flex; align-items:center; gap:16px;">
                        <span style="font-size:14px; font-weight:500;">
                            Welcome, <span class="gold-text-gradient" style="font-weight:700;">${fullName}</span>${premiumBadge}
                        </span>
                        <a href="pages/profile.html" class="btn-secondary" style="padding: 8px 16px; font-size:12px;">My Account</a>
                        <button id="auth-signout-btn" class="btn-primary" style="padding: 8px 16px; font-size:12px; background:var(--heritage-red); color:#fff; box-shadow:none;">Sign Out</button>
                    </div>
                `;

                const signOutBtn = document.getElementById('auth-signout-btn');
                if (signOutBtn) {
                    signOutBtn.addEventListener('click', async () => {
                        try {
                            await authAPI.signOut();
                            window.location.reload();
                        } catch (signOutErr) {
                            console.error('Sign out error:', signOutErr.message);
                        }
                    });
                }
            }
        }
    } catch (err) {
        console.error('Error synchronizing active user auth profile:', err.message);
    }
}

// ==========================================
// 3. ACCESSIBILITY ARCHITECTURE CONTEXTS
// ==========================================
function initializeAccessibilityPreferences() {
    let currentContrast = 'false';
    let currentFontSize = 'medium';

    try {
        if (typeof localStorage !== 'undefined') {
            currentContrast = localStorage.getItem('access-high-contrast') || 'false';
            currentFontSize = localStorage.getItem('access-font-size') || 'medium';
        }
    } catch (storageErr) {
        console.warn('Storage warning: LocalStorage is inaccessible.', storageErr.message);
    }

    if (currentContrast === 'true') {
        document.documentElement.setAttribute('data-accessibility', 'high-contrast');
    } else {
        document.documentElement.removeAttribute('data-accessibility');
    }
    
    if (typeof currentFontSize === 'string') {
        document.documentElement.setAttribute('data-font-size', currentFontSize);
    }
}

function setupAccessibilityToggles() {
    const contrastToggle = document.getElementById('contrast-toggle');
    const fontToggle = document.getElementById('font-toggle');

    if (contrastToggle) {
        contrastToggle.addEventListener('click', () => {
            const currentAccessibility = document.documentElement.getAttribute('data-accessibility');
            const isContrast = typeof currentAccessibility === 'string' && currentAccessibility === 'high-contrast';
            
            try {
                if (isContrast) {
                    document.documentElement.removeAttribute('data-accessibility');
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('access-high-contrast', 'false');
                    }
                } else {
                    document.documentElement.setAttribute('data-accessibility', 'high-contrast');
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('access-high-contrast', 'true');
                    }
                }
            } catch (storageErr) {
                console.warn('Unable to write accessibility states to storage.', storageErr.message);
            }
        });
    }

    if (fontToggle) {
        const sizes = ['medium', 'large', 'xlarge'];
        fontToggle.addEventListener('click', () => {
            const currentAttr = document.documentElement.getAttribute('data-font-size');
            const current = typeof currentAttr === 'string' ? currentAttr : 'medium';
            
            const currentIndex = sizes.indexOf(current);
            const nextIndex = currentIndex !== -1 ? (currentIndex + 1) % sizes.length : 0;
            const nextSize = sizes[nextIndex];

            document.documentElement.setAttribute('data-font-size', nextSize);
            
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('access-font-size', nextSize);
                }
            } catch (storageErr) {
                console.warn('Unable to write font preference states to storage.', storageErr.message);
            }
        });
    }
}

// ==========================================
// 4. UNIVERSAL & VOICE SEARCH ENGINE CONTROLLERS
// ==========================================
function setupUniversalSearch() {
    const searchForm = document.getElementById('universal-search-form');
    const searchInput = document.getElementById('search-input');

    if (searchForm && searchInput) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputValue = searchInput.value;
            if (typeof inputValue === 'string') {
                const query = inputValue.trim();
                if (query.length > 0) {
                    // Route directly to integrated search module
                    window.location.href = `pages/search.html?q=${encodeURIComponent(query)}`;
                }
            }
        });
    }
}

function setupVoiceSearch() {
    const voiceBtn = document.getElementById('voice-search-btn');
    const searchInput = document.getElementById('search-input');

    if (!voiceBtn || !searchInput) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        voiceBtn.style.display = 'none';
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US'; // English-Only processing as mandated
    recognition.interimResults = false;

    recognition.onstart = () => {
        voiceBtn.textContent = 'Listening...';
        voiceBtn.style.borderColor = 'var(--heritage-red)';
    };

    recognition.onerror = (e) => {
        console.error('Speech recognition error event:', e.error);
        voiceBtn.textContent = 'Voice';
        voiceBtn.style.borderColor = 'var(--gold-base)';
    };

    recognition.onend = () => {
        voiceBtn.textContent = 'Voice';
        voiceBtn.style.borderColor = 'var(--gold-base)';
    };

    recognition.onresult = (event) => {
        if (event && event.results && event.results[0] && event.results[0][0]) {
            const transcript = event.results[0][0].transcript;
            if (typeof transcript === 'string') {
                searchInput.value = transcript;
                const searchForm = document.getElementById('universal-search-form');
                if (searchForm) {
                    searchForm.dispatchEvent(new Event('submit'));
                }
            }
        }
    };

    voiceBtn.addEventListener('click', () => {
        recognition.start();
    });
}

// ==========================================
// 5. HIDDEN SECURE SUPER ADMIN LISTENER (CTRL + SHIFT + A FOR 10 SECS)
// ==========================================
function setupAdminConsoleTrigger() {
    let adminTimer = null;
    const activeKeys = new Set();
    const modal = document.getElementById('admin-login-modal');
    const closeModal = document.getElementById('close-admin-modal');
    const adminForm = document.getElementById('admin-auth-form');
    const openAdminBtn = document.getElementById('open-admin-modal-btn');

    if (!modal) return;

    const showAdminModal = () => {
        modal.classList.remove('hidden');
        syncModalBodyLock();
        const adminEmailInput = document.getElementById('admin-email');
        if (adminEmailInput) {
            adminEmailInput.focus();
        }
    };

    const hideAdminModal = () => {
        modal.classList.add('hidden');
        syncModalBodyLock();
        if (adminForm) {
            adminForm.reset();
        }
    };

    // Listeners tracking keys
    window.addEventListener('keydown', (e) => {
        if (e && typeof e.key === 'string') {
            const keyLower = e.key.toLowerCase();
            activeKeys.add(keyLower);
            
            if (activeKeys.has('control') && activeKeys.has('shift') && activeKeys.has('a')) {
                if (!adminTimer) {
                    adminTimer = setTimeout(() => {
                        showAdminModal();
                    }, 10000); // Strict 10,000 milliseconds hold threshold
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e && typeof e.key === 'string') {
            const keyLower = e.key.toLowerCase();
            activeKeys.delete(keyLower);
            
            // Interrupt sequence if keys are released early
            if (!(activeKeys.has('control') && activeKeys.has('shift') && activeKeys.has('a'))) {
                if (adminTimer) {
                    clearTimeout(adminTimer);
                    adminTimer = null;
                }
            }
        }
    });

    if (openAdminBtn) {
        openAdminBtn.addEventListener('click', showAdminModal);
    }

    if (closeModal) {
        closeModal.addEventListener('click', hideAdminModal);
    }

    if (adminForm) {
        adminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const emailEl = document.getElementById('admin-email');
            const passwordEl = document.getElementById('admin-password');
            
            if (!emailEl || !passwordEl) {
                alert('Secure Terminal Error: Form structures are missing from workspace.');
                return;
            }

            const rawEmail = emailEl.value;
            const rawPassword = passwordEl.value;

            if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
                alert('Secure Terminal Error: Field variables are invalid.');
                return;
            }

            const email = rawEmail.trim();
            const password = rawPassword;

            if (email.length === 0 || password.length === 0) {
                alert('Secure Terminal Error: Missing required credentials.');
                return;
            }

            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;

                if (data && data.user) {
                    // Validate admin authorization claim
                    const { data: profile, error: profileErr } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', data.user.id)
                        .single();

                    if (profileErr) throw profileErr;

                    if (!profile || profile.role !== 'super_admin') {
                        await authAPI.signOut();
                        throw new Error('Access Denied: You do not possess Super Admin privileges.');
                    }

                    // Redirect directly to the secure dashboard
                    window.location.href = 'admin/dashboard.html';
                }
            } catch (err) {
                alert(err.message);
            }
        });
    }
}

// ==========================================
// 6. DYNAMIC REVENUE FEED & DYNAMIC METRICS
// ==========================================
async function populateSystemFeeds() {
    const trendingContainer = document.getElementById('trending-container');
    const recommendedContainer = document.getElementById('recommended-container');

    try {
        // Fetch premium approved listings
        const { data: listings, error: listErr } = await supabase
            .from('marketplace_listings')
            .select('id, title, price, category')
            .eq('status', 'approved')
            .is('deleted_at', null)
            .order('views_count', { ascending: false })
            .limit(3);

        if (listErr) throw listErr;

        if (trendingContainer) {
            if (Array.isArray(listings) && listings.length > 0) {
                trendingContainer.innerHTML = listings.map(item => {
                    const itemId = typeof item.id === 'string' ? item.id : '';
                    const rawTitle = typeof item.title === 'string' ? item.title : 'Market Item';
                    const rawPrice = typeof item.price === 'string' || typeof item.price === 'number' ? parseFloat(item.price) : 0;
                    
                    const priceFormatted = isNaN(rawPrice) ? '0' : rawPrice.toLocaleString();
                    const titleSafe = rawTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;");

                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <a href="pages/marketplace.html?id=${itemId}" style="font-size:14px; font-weight:600; color:var(--text-primary);">${titleSafe}</a>
                            <span style="font-size:13px; color:var(--gold-base); font-weight:700;">MWK ${priceFormatted}</span>
                        </div>
                    `;
                }).join('');
            } else {
                trendingContainer.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">No listings currently featured. Discover products on our Marketplace!</p>`;
            }
        }

        // Fetch curated recommended news highlights
        const { data: news, error: newsErr } = await supabase
            .from('news_articles')
            .select('id, title, category')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(3);

        if (newsErr) throw newsErr;

        if (recommendedContainer) {
            if (Array.isArray(news) && news.length > 0) {
                recommendedContainer.innerHTML = news.map(article => {
                    const articleId = typeof article.id === 'string' ? article.id : '';
                    const rawTitle = typeof article.title === 'string' ? article.title : 'News Article';
                    const rawCategory = typeof article.category === 'string' ? article.category : 'General';
                    
                    const titleSafe = rawTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    const categorySafe = rawCategory.replace(/</g, "&lt;").replace(/>/g, "&gt;");

                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <a href="pages/news.html?id=${articleId}" style="font-size:14px; font-weight:600; color:var(--text-primary);">${titleSafe}</a>
                            <span class="badge badge-verified" style="font-size:10px;">${categorySafe}</span>
                        </div>
                    `;
                }).join('');
            } else {
                recommendedContainer.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">Browse our modules to tailor future recommendations.</p>`;
            }
        }
    } catch (err) {
        console.warn('Error fetching dynamic platform updates:', err.message);
    }
}