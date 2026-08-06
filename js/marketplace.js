// =====================================================================
// GENIUS MALAWI - PEER-TO-PEER MARKETPLACE CONTROLLER
// Location: js/marketplace.js
// Purpose: Controls listing retrieval, advanced content filters,
//          multi-photo image uploads (max 10), validation of verified video files,
//          approval requests, and seller metric overlays.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI, storageAPI, validateFile } from './supabase.js';

let currentUser = null;
let userProfile = null;
let currentListings = [];
let activeSellerId = null;

function isVerifiedMarketplaceRole(role) {
    return ['seller', 'business', 'super_admin'].includes(role);
}

function formatCategoryLabel(category) {
    const labels = {
        physical_product: 'Physical Products',
        service: 'Services',
        house: 'Houses',
        land: 'Land',
        car: 'Vehicles',
        livestock: 'Livestock',
        rental: 'Rentals',
        other: 'Other'
    };

    return labels[category] || category;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Splash Screen
    dismissSplashLoader();

    // Ingest session variables (Non-blocking reading allowed, but postings require auth)
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) console.error(error);
        if (session) {
            currentUser = session.user;
            await loadUserProfile();
        }
    } catch (err) {
        console.error('Session retrieval failed:', err.message);
    }

    // Add an authentication listener to keep Marketplace synchronized
    supabase.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user ?? null;
        if (currentUser) {
            loadUserProfile();
        }
    });

    // Load Listings and Setup Interactivity
    await fetchActiveListings();
    setupFilters();
    setupModals();
    setupPostingFlow();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('marketplace-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}
function syncModalBodyLock() {
    const visibleModal = document.querySelector('.splash-screen:not(.hidden)');
    document.body.classList.toggle('modal-open', !!visibleModal);
}
// ==========================================
// 2. USER CLASSIFICATION RESOLUTION
// ==========================================
async function loadUserProfile() {
    if (!currentUser) {
        console.warn("Marketplace: no authenticated user.");
        return;
    }
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;
        userProfile = data;

        // Display video upload container if seller has verification privileges
        const videoContainer = document.getElementById('video-upload-container');
        if (videoContainer && isVerifiedMarketplaceRole(userProfile.role)) {
            videoContainer.style.display = 'block';
        }
    } catch (err) {
        console.error('Failed to load user credentials:', err.message);
    }
}

// ==========================================
// 3. DATABASE INGESTION & GRID BUILDERS
// ==========================================
async function fetchActiveListings() {
    try {
        const { data, error } = await supabase
            .from('marketplace_listings')
            .select(`
                *,
                profiles:seller_id (id, full_name, role, created_at)
            `)
            .eq('status', 'approved')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const listings = data || [];
        const enrichedListings = await enrichListingsWithMedia(listings);
        currentListings = enrichedListings;
        renderListingsGrid(currentListings);
    } catch (err) {
        console.error('Error fetching marketplace listings:', err.message);
    }
}

async function enrichListingsWithMedia(listings) {
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

function renderListingsGrid(listings) {
    const grid = document.getElementById('marketplace-grid');
    if (!grid) return;

    if (listings.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No approved listings matching search criteria.</p>`;
        return;
    }

    grid.innerHTML = listings.map(item => {
        // Enforce fallback image if none are resolved
        const primaryImage = item.images && item.images.length > 0 ? item.images[0] : '../assets/Icon.png?v=2';
        
        // Reminder block on owner listing view
        const isOwner = currentUser && currentUser.id === item.seller_id;
        const ownerBanner = isOwner 
            ? `<div style="background:var(--heritage-red); color:#fff; text-align:center; padding:4px 0; font-size:11px; font-weight:700;">YOUR ITEM - REMEMBER TO MARK AS SOLD</div>` 
            : '';

        const sellerVerifiedBadge = isVerifiedMarketplaceRole(item.profiles?.role)
            ? `<span class="badge badge-verified" style="font-size:9px; padding:2px 6px; margin-left:6px;">VERIFIED</span>`
            : '';

        return `
            <div class="luxury-card" style="padding: 0; display: flex; flex-direction: column; overflow: hidden; height: 100%;">
                ${ownerBanner}
                <div style="position: relative; aspect-ratio: 1; background: #000; overflow: hidden;">
                    <img src="${primaryImage}" alt="${item.title}" style="width: 100%; height: 100%; object-fit: cover; transition: var(--transition-smooth);">
                    <span class="badge badge-premium" style="position: absolute; bottom: 12px; left: 12px;">MWK ${parseFloat(item.price).toLocaleString()}</span>
                    <span class="badge badge-verified" style="position: absolute; top: 12px; right: 12px; background:rgba(0,0,0,0.6);">${formatCategoryLabel(item.category)}</span>
                </div>
                <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <h4 style="font-size: 16px; margin-bottom: 8px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</h4>
                        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${item.description}</p>
                    </div>
                    <div style="border-top: 1px solid var(--gold-translucent); padding-top: 12px;">
                        <span style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 8px;">Seller: <strong class="gold-text-gradient" style="cursor:pointer;" onclick="window.triggerSellerModal('${item.seller_id}')">${item.profiles?.full_name}</strong>${sellerVerifiedBadge}</span>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-primary" style="flex: 1; padding: 10px; font-size: 12px;" onclick="window.triggerSellerModal('${item.seller_id}')">Contact Seller</button>
                            ${isOwner ? `<button class="btn-secondary" style="border-color:var(--heritage-green); color:#fff; font-size:12px; padding:10px;" onclick="window.markItemAsSold('${item.id}')">Mark Sold</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// 4. ADVANCED CONTENT FILTERING & SEARCH
// ==========================================
function setupFilters() {
    const searchInput = document.getElementById('market-search');
    const searchBtn = document.getElementById('market-search-btn');
    const categoryFilter = document.getElementById('category-filter');
    const priceSort = document.getElementById('price-sort');

    const executeFilter = () => {
        const query = searchInput.value.toLowerCase().trim();
        const category = categoryFilter.value;
        const sort = priceSort.value;

        let filtered = [...currentListings];

        // Apply text queries
        if (query) {
            filtered = filtered.filter(item => 
                item.title.toLowerCase().includes(query) || 
                item.description.toLowerCase().includes(query)
            );
        }

        // Apply category filter matches
        if (category !== 'all') {
            filtered = filtered.filter(item => item.category === category);
        }

        // Apply ordering limits
        if (sort === 'asc') {
            filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        } else if (sort === 'desc') {
            filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        } else {
            // Latest Sort First
            filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        renderListingsGrid(filtered);
    };

    if (searchBtn) searchBtn.addEventListener('click', executeFilter);
    if (categoryFilter) categoryFilter.addEventListener('change', executeFilter);
    if (priceSort) priceSort.addEventListener('change', executeFilter);
}

// ==========================================
// 5. MODALS & VIEWPORT WINDOW CONTROLS
// ==========================================
function setupModals() {
    const openBtn = document.getElementById('open-listing-modal-btn');
    const closeBtn = document.getElementById('close-listing-modal-btn');
    const modal = document.getElementById('post-listing-modal');

    const openSellerBtn = document.getElementById('close-seller-modal-btn');
    const sellerModal = document.getElementById('seller-profile-modal');

    if (openBtn && modal) {
        openBtn.addEventListener('click', async () => {
            const { data: { session } } = await supabase.auth.getSession();
            currentUser = session?.user ?? null;

            if (currentUser && !userProfile) {
                await loadUserProfile();
            }

            if (!currentUser) {
                alert('Authentication required: You must register or log in to list items.');
                window.location.href = 'login.html';
                return;
            }
            modal.classList.remove('hidden');
            syncModalBodyLock();
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            syncModalBodyLock();
        });
    }

    if (openSellerBtn && sellerModal) {
        openSellerBtn.addEventListener('click', () => {
            sellerModal.classList.add('hidden');
            syncModalBodyLock();
        });
    }
}

// Global hook to invoke seller statistical modules from card renderers
window.triggerSellerModal = async (sellerId) => {
    const modal = document.getElementById('seller-profile-modal');
    if (!modal) return;

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sellerId)
            .single();

        if (error) throw error;

        activeSellerId = sellerId;
        
        // Update elements dynamically
        document.getElementById('seller-name').textContent = profile.full_name;
        document.getElementById('seller-avatar').textContent = profile.full_name.charAt(0).toUpperCase();
        
        const dateStr = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        document.getElementById('seller-stat-joined').textContent = dateStr;

        const badgeContainer = document.getElementById('seller-badge-container');
        if (isVerifiedMarketplaceRole(profile.role)) {
            badgeContainer.innerHTML = `<span class="badge badge-verified">VERIFIED MERCHANT</span>`;
        } else {
            badgeContainer.innerHTML = `<span class="badge badge-secondary" style="border-color:rgba(255,255,255,0.1);">STANDARD SELLER</span>`;
        }

        modal.classList.remove('hidden');
        syncModalBodyLock();
    } catch (err) {
        console.error('Failed to query seller card profile:', err.message);
    }
};

// Global hook to resolve sold requests
window.markItemAsSold = async (listingId) => {
    const confirmAction = confirm('Security Action: Would you like to flag this product as successfully sold? This will hide it from the active catalog.');
    if (!confirmAction) return;

    try {
        const { error } = await supabase
            .from('marketplace_listings')
            .update({ status: 'sold', deleted_at: new Date() })
            .eq('id', listingId);

        if (error) throw error;

        alert('Listing updated successfully.');
        await fetchActiveListings();
    } catch (err) {
        alert(err.message);
    }
};

// Chat initiation mapping
const chatTrigger = document.getElementById('seller-chat-trigger');
if (chatTrigger) {
    chatTrigger.addEventListener('click', () => {
        if (!currentUser) {
            alert('Authentication required: Log in to chat with merchants.');
            window.location.href = 'login.html';
            return;
        }
        if (currentUser.id === activeSellerId) {
            alert('Operation Denied: You cannot initialize an inquiry with yourself.');
            return;
        }
        // Redirect directly to centralized chat room passing target parameters
        window.location.href = `chats.html?partner=${activeSellerId}`;
    });
}

// ==========================================
// 6. POSTING PIPELINE UTILITIES
// ==========================================
function setupPostingFlow() {
    const form = document.getElementById('new-listing-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Before submitting a listing verify authentication again
        if (!currentUser) {
            const { data: { session } } = await supabase.auth.getSession();
            currentUser = session?.user ?? null;
        }

        if (!currentUser) {
            alert('Authentication required. Please log in again.');
            window.location.href = 'login.html';
            return;
        }

        const title = document.getElementById('list-title').value.trim();
        const price = parseFloat(document.getElementById('list-price').value);
        const category = document.getElementById('list-category').value;
        const description = document.getElementById('list-description').value.trim();

        const imageFiles = document.getElementById('list-images').files;
        const videoFile = document.getElementById('list-video').files[0];

        // Strict client-side validation rules
        if (imageFiles.length > 10) {
            alert('Formatting Constraint: Gallery uploads are restricted to a maximum of 10 photos.');
            return;
        }

        try {
            // Trigger loading state visually
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Transmitting payloads...';
            submitBtn.disabled = true;

            const imageUrls = [];

            // A. Batch photo loop uploads
            for (let i = 0; i < imageFiles.length; i++) {
                const img = imageFiles[i];
                const uploadUrl = await storageAPI.uploadFile(img, 'marketplace', 'marketplace_img');
                imageUrls.push(uploadUrl);
            }

            let videoUrl = null;

            // B. Secure validated video transmission
            if (videoFile) {
                const isVerified = isVerifiedMarketplaceRole(userProfile?.role);
                if (!isVerified) {
                    alert('Security Constraint: Dynamic video streams are restricted to verified accounts only.');
                    submitBtn.textContent = 'Submit for Review';
                    submitBtn.disabled = false;
                    return;
                }
                videoUrl = await storageAPI.uploadFile(videoFile, 'marketplace', 'marketplace_vid');
            }

            // C. Insert mapping context into database table
            const { data: insertedListing, error: insertError } = await supabase
                .from('marketplace_listings')
                .insert({
                    seller_id: currentUser.id,
                    title,
                    description,
                    price,
                    category,
                    status: 'pending'
                })
                .select('id')
                .single();

            if (insertError) throw insertError;

            try {
                if (imageUrls.length > 0) {
                    const imageRows = imageUrls.map((imageUrl, index) => ({
                        listing_id: insertedListing.id,
                        image_url: imageUrl,
                        image_order: index + 1
                    }));

                    const { error: imageError } = await supabase
                        .from('marketplace_images')
                        .insert(imageRows);

                    if (imageError) throw imageError;
                }

                if (videoUrl) {
                    const { error: videoError } = await supabase
                        .from('marketplace_videos')
                        .insert({
                            listing_id: insertedListing.id,
                            video_url: videoUrl
                        });

                    if (videoError) throw videoError;
                }
            } catch (mediaError) {
                await supabase.from('marketplace_listings').delete().eq('id', insertedListing.id);
                throw mediaError;
            }

            alert('Transmission complete. Listing has been successfully submitted to the Super Admin review queue.');
            
            // Clean interface
            form.reset();
            const postListingModal = document.getElementById('post-listing-modal');
            if (postListingModal) {
                postListingModal.classList.add('hidden');
                syncModalBodyLock();
            }
            await fetchActiveListings();

        } catch (err) {
            alert(err.message || 'An unexpected error occurred during submission.');
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Submit for Review';
            submitBtn.disabled = false;
        }
    });
}