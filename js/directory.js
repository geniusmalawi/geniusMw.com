// =====================================================================
// GENIUS MALAWI - BUSINESS DIRECTORY & VERIFIED PAGES CONTROLLER
// Location: js/directory.js
// Purpose: Orchestrates splash screen dismissal, dynamic directory loading,
//          captures GPS locations, registers verified enterprise pages,
//          renders deep business profiles, handles followers and customer reviews.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI, storageAPI, validateFile } from './supabase.js';

let currentUser = null;
let currentProfile = null;
let currentBusinesses = [];
let activeBusinessId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Splash Screen
    dismissSplashLoader();

    // Session Verification using the shared auth helper
    try {
        const session = await authAPI.checkSession(false);
        currentUser = session?.user ?? null;
        if (currentUser) {
            await loadUserProfile();
        }
    } catch (err) {
        console.error('Business directory auth initialization failed:', err.message);
    }

    // Load Directory Entries
    await fetchActiveBusinesses();
    setupFilters();
    setupModals();
    setupGPSCapture();
    setupCreationFlow();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('directory-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

async function loadUserProfile() {
    if (!currentUser) {
        currentProfile = null;
        return null;
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            throw new Error('Your profile is not ready yet. Please complete your profile setup before registering a business page.');
        }

        currentProfile = data;
        return data;
    } catch (err) {
        currentProfile = null;
        throw err;
    }
}

function createBusinessUsername(name) {
    const base = (name || 'business')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    return `${base || 'business'}-${Date.now().toString().slice(-6)}`;
}

function syncModalBodyLock() {
    const visibleModal = document.querySelector('.splash-screen:not(.hidden)');
    document.body.classList.toggle('modal-open', !!visibleModal);
}
// ==========================================
// 2. DATABASE INGESTION & GRID BUILDERS
// ==========================================
async function fetchActiveBusinesses() {
    try {
        const { data, error } = await supabase
            .from('business_pages')
            .select('*, profiles:owner_id (full_name)')
            .order('business_name', { ascending: true });

        if (error) throw error;
        currentBusinesses = data || [];
        renderDirectoryGrid(currentBusinesses);
    } catch (err) {
        console.error('Error fetching directory registries:', err.message);
    }
}

function renderDirectoryGrid(businesses) {
    const grid = document.getElementById('directory-grid');
    if (!grid) return;

    if (businesses.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No registered businesses found matching your criteria.</p>`;
        return;
    }

    grid.innerHTML = businesses.map(item => {
        const primaryLogo = item.logo_url || '../assets/Icon.png';
        const verifyBadge = item.verified
            ? `<span class="badge badge-verified" style="font-size: 9px; padding: 2px 6px;">VERIFIED PAGE</span>`
            : `<span class="badge badge-secondary" style="font-size: 9px; padding: 2px 6px; border-color: rgba(255,255,255,0.1); color: var(--text-muted);">STANDARD PAGE</span>`;

        return `
            <div class="luxury-card" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
                <div>
                    <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px;">
                        <img src="${primaryLogo}" alt="${item.business_name}" style="width: 50px; height: 50px; border-radius: var(--radius-sm); object-fit: cover; border: var(--glass-border);">
                        <div style="overflow: hidden;">
                            <h3 style="font-size: 16px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.business_name}</h3>
                            <span style="font-size: 11px; color: var(--gold-base); font-family: var(--font-body);">${item.category}</span>
                        </div>
                    </div>
                    <p style="font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${item.description}</p>
                </div>
                <div style="border-top: 1px solid var(--gold-translucent); padding-top: 16px; display: flex; justify-content: space-between; align-items: center;">
                    ${verifyBadge}
                    <button class="btn-primary" style="padding: 8px 16px; font-size: 12px;" onclick="window.viewBusinessProfile('${item.id}')">View Page</button>
                </div>
            </div>
        `;
    }).join('');
}

function getBusinessFollowStorageKey(businessId) {
    return `business_follow_${businessId}_${currentUser?.id || 'guest'}`;
}

function normalizeWhatsAppNumber(value) {
    if (!value) return '';
    return String(value).replace(/[^0-9+]/g, '').replace(/^00/, '+');
}

function getBusinessPostMarker(businessId) {
    return `[business-page:${businessId}]`;
}

function stripBusinessPostMarker(content) {
    return String(content || '').replace(new RegExp(`\\s*${getBusinessPostMarker('.*')}\\s*`, 'g'), '').trim();
}

function containsBlockedContent(text) {
    const content = String(text || '').toLowerCase();
    const blockedPatterns = [
        /nudity/, /pornography/, /sexual content/, /explicit sexual/, /scam/, /phishing/, /fraud/, /fake investment/, /illegal sales/, /hate speech/, /violent extremism/
    ];
    return blockedPatterns.some(pattern => pattern.test(content));
}

async function fetchBusinessPosts(business) {
    const marker = getBusinessPostMarker(business.id);

    try {
        const { data, error } = await supabase
            .from('posts')
            .select('*')
            .eq('business_page_id', business.id)
            .order('created_at', { ascending: false });

        if (!error) {
            return (data || []).filter(item => String(item.content || '').includes(marker));
        }
    } catch (err) {
        console.warn('Business post lookup using business_page_id failed:', err.message);
    }

    try {
        const { data, error } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', business.owner_id)
            .order('created_at', { ascending: false });

        if (!error) {
            return (data || []).filter(item => String(item.content || '').includes(marker));
        }
    } catch (err) {
        console.warn('Business post lookup using owner id failed:', err.message);
    }

    return [];
}

async function publishBusinessPost(business, payload) {
    const marker = getBusinessPostMarker(business.id);
    const content = `${marker}\n${payload.content}`.trim();

    const insertPayload = {
        user_id: payload.ownerId,
        business_page_id: business.id,
        content,
        visibility: 'public',
        status: 'published',
        review_status: 'approved',
        is_hidden: false,
        report_count: 0,
        likes: 0,
        comments: 0,
        shares: 0
    };

    if (payload.postType) insertPayload.post_type = payload.postType;
    if (payload.imageUrl) insertPayload.image_url = payload.imageUrl;
    if (payload.videoUrl) insertPayload.video_url = payload.videoUrl;

    try {
        return await supabase.from('posts').insert(insertPayload);
    } catch (err) {
        return await supabase.from('posts').insert({
            user_id: payload.ownerId,
            business_page_id: business.id,
            content,
            visibility: 'public',
            status: 'published',
            review_status: 'approved',
            is_hidden: false,
            report_count: 0,
            likes: 0,
            comments: 0,
            shares: 0
        });
    }
}

// ==========================================
// 3. PROFILE OVERLAYS (RATINGS, REVIEWS, FOLLOWERS)
// ==========================================
window.viewBusinessProfile = async (businessId) => {
    activeBusinessId = businessId;
    const business = currentBusinesses.find(b => b.id === businessId);
    if (!business) return;

    // View Overlay Builder container
    const viewport = document.createElement('div');
    viewport.className = 'splash-screen';
    viewport.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(5,5,5,0.95); backdrop-filter:blur(15px); z-index:10000; overflow-y:auto; padding:40px 16px;';
    
    const container = document.createElement('div');
    container.className = 'luxury-card';
    container.style.cssText = 'width:100%; max-width:850px; margin:0 auto; padding:40px; position:relative;';

    // Fetch Followers count & check user follow status
    let followersCount = business.followers ?? 0;
    let isFollowing = false;

    if (currentUser) {
        const localFollowState = localStorage.getItem(getBusinessFollowStorageKey(businessId));
        if (localFollowState === '1') isFollowing = true;

        try {
            const { data: followData } = await supabase
                .from('business_followers')
                .select('*')
                .eq('business_id', businessId)
                .eq('user_id', currentUser.id)
                .maybeSingle();

            if (followData) isFollowing = true;
        } catch (err) {
            if (!/business_followers|does not exist|column/i.test(err.message || '')) {
                console.warn('Follower lookup warning:', err.message);
            }
        }
    }

    const isOwner = !!(currentUser && business.owner_id === currentUser.id);
    const isAdmin = currentProfile?.role === 'super_admin';
    const canModerate = isAdmin || isOwner;
    const whatsappNumber = normalizeWhatsAppNumber(business.whatsapp || business.phone || '');

    const { data: reviews } = await supabase
        .from('business_reviews')
        .select('*, profiles:reviewer_id (full_name)')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

    const posts = await fetchBusinessPosts(business);
    const postsMarkup = posts.length > 0
        ? posts.map(post => {
            const content = stripBusinessPostMarker(post.content || '').trim();
            const isHidden = post.is_hidden === true || post.visibility === 'private' || post.visibility === 'hidden';
            return `
                <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:var(--radius-sm); margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
                        <strong style="font-size:13px; color:var(--text-primary);">${post.post_type || 'Business Update'}</strong>
                        <span style="font-size:11px; color:var(--text-muted);">${new Date(post.created_at).toLocaleString()}</span>
                    </div>
                    <p style="font-size:13px; color:var(--text-muted); line-height:1.6; margin-bottom:8px;">${content}</p>
                    ${isHidden ? '<span style="font-size:11px; color:var(--heritage-red);">Hidden for review</span>' : ''}
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                        <button type="button" class="btn-secondary" data-post-action="like" data-post-id="${post.id}" style="padding:6px 10px; font-size:11px;">Like</button>
                        <button type="button" class="btn-secondary" data-post-action="save" data-post-id="${post.id}" style="padding:6px 10px; font-size:11px;">Save</button>
                        <button type="button" class="btn-secondary" data-post-action="report" data-post-id="${post.id}" style="padding:6px 10px; font-size:11px;">Report</button>
                    </div>
                    <form class="business-post-comment-form" data-post-id="${post.id}" style="margin-top:10px;">
                        <textarea class="form-control" rows="2" placeholder="Write a comment..." required style="resize:none; font-family:var(--font-body);"></textarea>
                        <button type="submit" class="btn-primary" style="width:100%; margin-top:8px;">Comment</button>
                    </form>
                    ${canModerate ? `
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                            <button type="button" class="btn-secondary" data-post-action="delete" data-post-id="${post.id}" style="padding:6px 10px; font-size:11px;">Delete</button>
                            <button type="button" class="btn-secondary" data-post-action="${isHidden ? 'restore' : 'hide'}" data-post-id="${post.id}" style="padding:6px 10px; font-size:11px;">${isHidden ? 'Restore' : 'Hide'}</button>
                        </div>` : ''}
                </div>
            `;
        }).join('')
        : `<p style="font-size:12px; color:var(--text-muted); text-align:center;">No business updates yet. Publish the first update for this page.</p>`;

    const avgRating = reviews && reviews.length > 0
        ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1)
        : '0.0';

    const reviewsListMarkup = reviews && reviews.length > 0
        ? reviews.map(r => `
            <div style="background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:var(--radius-sm); margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <strong style="font-size:13px; color:var(--text-primary);">${r.profiles?.full_name}</strong>
                    <span style="color:var(--gold-base); font-size:12px;">${'★'.repeat(r.rating)}</span>
                </div>
                <p style="font-size:13px; color:var(--text-muted);">${r.comment || ''}</p>
            </div>
        `).join('')
        : `<p style="font-size:12px; color:var(--text-muted); text-align:center;">No reviews yet. Be the first to leave a review!</p>`;

    container.innerHTML = `
        <div style="position:relative; aspect-ratio:21/9; border-radius:var(--radius-lg); overflow:hidden; background:#000; margin-bottom:24px;">
            <img src="${business.cover_photo || business.cover_url || '../assets/Logo.png'}" alt="" style="width:100%; height:100%; object-fit:cover; opacity:0.65;">
            <img src="${business.logo_url || '../assets/Icon.png'}" alt="" style="position:absolute; bottom:20px; left:20px; width:70px; height:70px; border-radius:var(--radius-md); border:var(--glass-border); object-fit:cover;">
        </div>

        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:32px;">
            <div>
                <h1 style="font-size:26px; color:var(--text-primary); margin-bottom:4px;">${business.business_name}</h1>
                <span class="badge badge-premium" style="margin-bottom:8px;">${business.category}</span>
                <p style="font-size:14px; color:var(--text-secondary); line-height:1.6; margin-top:8px;">${business.description}</p>
            </div>
            
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
                <button id="toggle-follow-btn" class="${isFollowing ? 'btn-secondary' : 'btn-primary'}" style="padding:10px 20px; font-size:13px;">${isFollowing ? 'Unfollow' : 'Follow'}</button>
                ${business.phone ? `<a href="tel:${business.phone}" class="btn-secondary" style="border-color:var(--heritage-green); color:#fff; padding:10px 20px; font-size:13px;">Call</a>` : ''}
                ${whatsappNumber ? `<a href="https://wa.me/${whatsappNumber}" target="_blank" rel="noopener" class="btn-secondary" style="border-color:var(--heritage-green); color:#fff; padding:10px 20px; font-size:13px;">WhatsApp</a>` : `<button type="button" class="btn-secondary" disabled style="padding:10px 20px; font-size:13px; opacity:0.7;">WhatsApp</button>`}
                <button type="button" id="message-business-btn" class="btn-secondary" style="padding:10px 20px; font-size:13px;">Message</button>
                ${isAdmin ? `<button type="button" id="toggle-business-suspension-btn" class="btn-secondary" style="border-color:var(--heritage-red); color:#fff; padding:10px 20px; font-size:13px;">${business.is_suspended ? 'Restore Page' : 'Suspend Page'}</button>` : ''}
            </div>
        </div>

        <div class="grid grid-cols-3" style="gap:16px; margin-bottom:40px; text-align:center;">
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Followers</span>
                <h3 style="font-size:22px; margin-top:4px;" id="profile-followers-count">${followersCount}</h3>
            </div>
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Average Rating</span>
                <h3 style="font-size:22px; margin-top:4px; color:var(--gold-base);">${avgRating} ★</h3>
            </div>
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Telephone</span>
                <h3 style="font-size:15px; margin-top:8px; font-family:var(--font-body);">${business.phone}</h3>
            </div>
        </div>

        <div class="grid grid-cols-3" style="gap:12px; margin-bottom:24px; text-align:center;">
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Followers</span>
                <h3 style="font-size:20px; margin-top:4px;">${followersCount}</h3>
            </div>
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Visitors</span>
                <h3 style="font-size:20px; margin-top:4px;">${business.visitors ?? 0}</h3>
            </div>
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Reach</span>
                <h3 style="font-size:20px; margin-top:4px;">${business.reach ?? 0}</h3>
            </div>
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Likes</span>
                <h3 style="font-size:20px; margin-top:4px;">${business.likes ?? 0}</h3>
            </div>
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Comments</span>
                <h3 style="font-size:20px; margin-top:4px;">${business.total_reviews ?? 0}</h3>
            </div>
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-md);">
                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted);">Profile Views</span>
                <h3 style="font-size:20px; margin-top:4px;">${business.profile_views ?? 0}</h3>
            </div>
        </div>

        <div class="grid grid-cols-2" style="gap:32px; align-items:flex-start;">
            <div>
                <h3 style="font-size:16px; border-bottom:1px solid var(--gold-translucent); padding-bottom:8px; margin-bottom:16px;">Business Updates</h3>
                ${canModerate ? `
                    <form id="business-post-form" style="margin-bottom:16px;">
                        <textarea id="business-post-content" class="form-control" rows="3" placeholder="Share an update, offer, event, or promotion..." required style="resize:none; font-family:var(--font-body);"></textarea>
                        <div class="grid grid-cols-2" style="gap:12px; margin-top:12px;">
                            <select id="business-post-type" class="form-control">
                                <option value="text">Text Update</option>
                                <option value="announcement">Announcement</option>
                                <option value="promotion">Promotion</option>
                                <option value="product">Product</option>
                                <option value="event">Event</option>
                                <option value="offer">Offer</option>
                            </select>
                            <input id="business-post-image" class="form-control" placeholder="Image URL (optional)">
                        </div>
                        <input id="business-post-video" class="form-control" placeholder="Video URL (optional)" style="margin-top:12px;">
                        <button type="submit" class="btn-primary" style="width:100%; margin-top:12px;">Publish Update</button>
                    </form>` : ''}
                <div id="business-posts-list" style="max-height:320px; overflow-y:auto; padding-right:8px;">
                    ${postsMarkup}
                </div>
            </div>

            <div>
                <h3 style="font-size:16px; border-bottom:1px solid var(--gold-translucent); padding-bottom:8px; margin-bottom:16px;">Reviews List</h3>
                <div id="reviews-viewport" style="max-height:300px; overflow-y:auto; padding-right:8px;">
                    ${reviewsListMarkup}
                </div>
                <h3 style="font-size:16px; border-bottom:1px solid var(--gold-translucent); padding-bottom:8px; margin-bottom:16px; margin-top:24px;">Write a Review</h3>
                <form id="profile-review-form">
                    <div class="form-group">
                        <label class="form-label">Star Rating (1 to 5)</label>
                        <select id="review-rating-select" class="form-control" required>
                            <option value="5">5 Stars (Excellent)</option>
                            <option value="4">4 Stars (Good)</option>
                            <option value="3">3 Stars (Average)</option>
                            <option value="2">2 Stars (Poor)</option>
                            <option value="1">1 Star (Terrible)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Review Comment</label>
                        <textarea id="review-comment-input" class="form-control" rows="3" placeholder="Share your experience with this enterprise..." required style="resize:none; font-family:var(--font-body);"></textarea>
                    </div>
                    <button type="submit" class="btn-primary" style="width:100%;">Submit Review</button>
                </form>
            </div>
        </div>

        <button id="close-biz-viewport" class="btn-secondary" style="width:100%; margin-top:40px;">Close Business Profile</button>
    `;

    viewport.appendChild(container);
    document.body.appendChild(viewport);

    // Close view bindings
    document.getElementById('close-biz-viewport').addEventListener('click', () => {
        viewport.remove();
        fetchActiveBusinesses();
    });

    // Follower Toggle binding
    const followBtn = document.getElementById('toggle-follow-btn');
    if (followBtn) {
        followBtn.addEventListener('click', async () => {
            if (!currentUser) {
                alert('Authentication required: Log in to follow enterprise hubs.');
                viewport.remove();
                window.location.href = 'login.html';
                return;
            }

            try {
                if (isFollowing) {
                    try {
                        await supabase
                            .from('business_followers')
                            .delete()
                            .eq('business_id', businessId)
                            .eq('user_id', currentUser.id);
                    } catch (err) {
                        if (!/business_followers|does not exist|column/i.test(err.message || '')) {
                            throw err;
                        }
                    }

                    localStorage.removeItem(getBusinessFollowStorageKey(businessId));
                    followersCount = Math.max(0, followersCount - 1);
                    isFollowing = false;
                    followBtn.textContent = 'Follow';
                    followBtn.className = 'btn-primary';
                } else {
                    try {
                        await supabase
                            .from('business_followers')
                            .insert({ business_id: businessId, user_id: currentUser.id });
                    } catch (err) {
                        if (/business_followers|does not exist|column/i.test(err.message || '')) {
                            localStorage.setItem(getBusinessFollowStorageKey(businessId), '1');
                        } else {
                            throw err;
                        }
                    }

                    if (!localStorage.getItem(getBusinessFollowStorageKey(businessId))) {
                        localStorage.setItem(getBusinessFollowStorageKey(businessId), '1');
                    }

                    followersCount++;
                    isFollowing = true;
                    followBtn.textContent = 'Unfollow';
                    followBtn.className = 'btn-secondary';
                }

                try {
                    await supabase
                        .from('business_pages')
                        .update({ followers: followersCount })
                        .eq('id', businessId);
                } catch (err) {
                    console.warn('Follower count sync warning:', err.message);
                }

                document.getElementById('profile-followers-count').textContent = followersCount;

            } catch (err) {
                alert(`Follower Action Exception: ${err.message}`);
            }
        });
    }

    const messageBtn = document.getElementById('message-business-btn');
    if (messageBtn) {
        messageBtn.addEventListener('click', async () => {
            if (!currentUser) {
                alert('Authentication required: Sign in to message this page.');
                return;
            }
            const message = prompt('Write a message to this business page:');
            if (!message || !message.trim()) return;
            try {
                await supabase.from('business_page_messages').insert({
                    business_page_id: businessId,
                    sender_id: currentUser.id,
                    receiver_id: business.owner_id,
                    message: message.trim()
                });
                alert('Your message has been sent.');
            } catch (err) {
                alert(`Message Exception: ${err.message}`);
            }
        });
    }

    const suspensionBtn = document.getElementById('toggle-business-suspension-btn');
    if (suspensionBtn) {
        suspensionBtn.addEventListener('click', async () => {
            if (!isAdmin) return;
            try {
                const nextState = !business.is_suspended;
                const payload = { is_suspended: nextState, suspended_at: nextState ? new Date().toISOString() : null };
                await supabase.from('business_pages').update(payload).eq('id', businessId);
                business.is_suspended = nextState;
                suspensionBtn.textContent = nextState ? 'Restore Page' : 'Suspend Page';
                alert(nextState ? 'Business page suspended for review.' : 'Business page restored.');
            } catch (err) {
                try {
                    await supabase.from('business_pages').update({ verified: false }).eq('id', businessId);
                    business.is_suspended = !business.is_suspended;
                    suspensionBtn.textContent = business.is_suspended ? 'Restore Page' : 'Suspend Page';
                    alert('Page moderation state updated using the available compatibility fields.');
                } catch (fallbackErr) {
                    alert(`Moderation Exception: ${fallbackErr.message}`);
                }
            }
        });
    }

    const postForm = document.getElementById('business-post-form');
    if (postForm) {
        postForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) {
                alert('Authentication required: Log in to publish business updates.');
                return;
            }

            const content = document.getElementById('business-post-content').value.trim();
            const postType = document.getElementById('business-post-type').value;
            const imageUrl = document.getElementById('business-post-image').value.trim();
            const videoUrl = document.getElementById('business-post-video').value.trim();

            if (!content) {
                alert('Please add some content before publishing this update.');
                return;
            }

            if (containsBlockedContent(content)) {
                alert('This post violates Community Guidelines and cannot be published.');
                return;
            }

            const submitBtn = postForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.textContent = 'Publishing...';
                submitBtn.disabled = true;
            }

            try {
                const { error } = await publishBusinessPost(business, {
                    ownerId: currentUser.id,
                    content,
                    postType,
                    imageUrl,
                    videoUrl
                });

                if (error) throw error;
                alert('Business update published successfully.');
                viewport.remove();
                window.viewBusinessProfile(businessId);
            } catch (err) {
                alert(`Post Publish Exception: ${err.message}`);
            } finally {
                if (submitBtn) {
                    submitBtn.textContent = 'Publish Update';
                    submitBtn.disabled = false;
                }
            }
        });
    }

    document.querySelectorAll('[data-post-action]').forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.getAttribute('data-post-action');
            const postId = button.getAttribute('data-post-id');
            if (!postId) return;

            try {
                if (action === 'delete') {
                    await supabase.from('posts').delete().eq('id', postId);
                } else if (action === 'hide') {
                    await supabase.from('posts').update({ visibility: 'private', is_hidden: true, status: 'hidden' }).eq('id', postId);
                } else if (action === 'restore') {
                    await supabase.from('posts').update({ visibility: 'public', is_hidden: false, status: 'published' }).eq('id', postId);
                } else if (action === 'like') {
                    await supabase.from('business_post_reactions').insert({ post_id: postId, user_id: currentUser.id, reaction_type: 'like' });
                    alert('Post liked.');
                } else if (action === 'save') {
                    await supabase.from('business_post_saves').insert({ post_id: postId, user_id: currentUser.id });
                    alert('Post saved.');
                } else if (action === 'report') {
                    const reason = prompt('Why are you reporting this post?') || 'spam';
                    await supabase.from('business_post_reports').insert({ post_id: postId, user_id: currentUser.id, reason });
                    alert('Post reported.');
                }
                viewport.remove();
                window.viewBusinessProfile(businessId);
            } catch (err) {
                alert(`Post Action Exception: ${err.message}`);
            }
        });
    });

    document.querySelectorAll('.business-post-comment-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const postId = form.getAttribute('data-post-id');
            const body = form.querySelector('textarea').value.trim();
            if (!body || !currentUser) return;
            try {
                await supabase.from('business_post_comments').insert({ post_id: postId, user_id: currentUser.id, body });
                alert('Comment submitted.');
                viewport.remove();
                window.viewBusinessProfile(businessId);
            } catch (err) {
                alert(`Comment Exception: ${err.message}`);
            }
        });
    });

    // Review Submission binding
    const reviewForm = document.getElementById('profile-review-form');
    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) {
                alert('Authentication required: Log in to submit customer reviews.');
                viewport.remove();
                window.location.href = 'login.html';
                return;
            }

            const rating = parseInt(document.getElementById('review-rating-select').value);
            const comment = document.getElementById('review-comment-input').value.trim();

            try {
                const { error } = await supabase
                    .from('business_reviews')
                    .insert({
                        business_id: businessId,
                        reviewer_id: currentUser.id,
                        rating,
                        comment
                    });

                if (error) throw error;

                alert('Review successfully submitted.');
                viewport.remove();
                window.viewBusinessProfile(businessId); // Refresh overlay

            } catch (err) {
                alert('Submit Review Exception: You have already reviewed this business.');
            }
        });
    }
};

// ==========================================
// 4. GPS GEOLOCATION CAPTURING UTILITIES
// ==========================================
function setupGPSCapture() {
    const gpsBtn = document.getElementById('biz-gps-btn');
    if (!gpsBtn) return;

    gpsBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            gpsBtn.textContent = 'Acquiring coordinates...';
            navigator.geolocation.getCurrentPosition((pos) => {
                document.getElementById('biz-lat').value = pos.coords.latitude.toFixed(6);
                document.getElementById('biz-lng').value = pos.coords.longitude.toFixed(6);
                gpsBtn.textContent = 'Coordinates Captured';
            }, () => {
                alert('Geolocation Exception: Unable to capture GPS coordinates. Please confirm permission configurations.');
                gpsBtn.textContent = 'Capture Current Location';
            }, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        } else {
            alert('Geolocation Warning: Geolocation commands are not supported by your device browser.');
        }
    });
}

// ==========================================
// 5. QUERY SEARCH & CATEGORIES BAR
// ==========================================
function setupFilters() {
    const searchInput = document.getElementById('dir-search');
    const searchBtn = document.getElementById('dir-search-btn');
    const categoryFilter = document.getElementById('dir-category-filter');
    const locationFilter = document.getElementById('dir-location-filter');

    const executeFilter = () => {
        const query = searchInput.value.toLowerCase().trim();
        const category = categoryFilter.value;
        const location = locationFilter.value.toLowerCase().trim();

        let filtered = [...currentBusinesses];

        if (query) {
            filtered = filtered.filter(item => {
                const ownerName = item.profiles?.full_name || '';
                const haystack = [
                    item.business_name,
                    item.category,
                    item.description,
                    item.about,
                    item.services,
                    item.products,
                    item.location,
                    item.address,
                    ownerName
                ].join(' ').toLowerCase();
                return haystack.includes(query);
            });
        }

        if (category !== 'all') {
            filtered = filtered.filter(item => item.category === category);
        }

        if (location) {
            filtered = filtered.filter(item => (item.description || '').toLowerCase().includes(location));
        }

        renderDirectoryGrid(filtered);
    };

    if (searchBtn) searchBtn.addEventListener('click', executeFilter);
    if (categoryFilter) categoryFilter.addEventListener('change', executeFilter);
    if (locationFilter) locationFilter.addEventListener('keyup', executeFilter);
}

// ==========================================
// 6. DRAWERS & COMPARTMENTS VIEWER
// ==========================================
function setupModals() {
    const openBtn = document.getElementById('open-register-business-btn');
    const closeBtn = document.getElementById('close-register-business-btn');
    const modal = document.getElementById('register-business-modal');

    if (openBtn && modal) {
        openBtn.addEventListener('click', async () => {
            if (!currentUser) {
                alert('Authentication required: Please sign in to continue.');
                window.location.href = 'login.html';
                return;
            }

            try {
                await loadUserProfile();
            } catch (err) {
                alert(err.message || 'Unable to load your profile right now.');
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
}

// ==========================================
// 7. REGISTRATION SUBMISSION FLOWS
// ==========================================
function setupCreationFlow() {
    const form = document.getElementById('new-business-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            const session = await authAPI.checkSession(false);
            currentUser = session?.user ?? null;
            if (!currentUser) {
                window.location.href = 'login.html';
                return;
            }
        }

        try {
            await loadUserProfile();
        } catch (err) {
            alert(err.message || 'Unable to load your profile right now.');
            return;
        }

        const name = document.getElementById('biz-name').value.trim();
        const category = document.getElementById('biz-category').value;
        const phone = document.getElementById('biz-phone').value.trim();
        const whatsapp = document.getElementById('biz-whatsapp').value.trim();
        const email = document.getElementById('biz-email').value.trim();
        const description = document.getElementById('biz-description').value.trim();
        const lat = parseFloat(document.getElementById('biz-lat').value);
        const lng = parseFloat(document.getElementById('biz-lng').value);

        const logoFile = document.getElementById('biz-logo').files[0];
        const coverFile = document.getElementById('biz-cover').files[0];

        if (!logoFile || !coverFile) {
            alert('Validation Constraint: Business Logo and Cover Image are required.');
            return;
        }

        // Validate image limits using global rule
        const logoVal = validateFile(logoFile, 'avatar');
        const coverVal = validateFile(coverFile, 'cover');

        if (!logoVal.valid || !coverVal.valid) {
            alert(logoVal.error || coverVal.error);
            return;
        }

        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Deploying platform assets...';
            submitBtn.disabled = true;

            // Step 1: Upload media payloads
            const logoUrl = await storageAPI.uploadFile(logoFile, 'marketplace', 'avatar');
            const coverUrl = await storageAPI.uploadFile(coverFile, 'marketplace', 'cover');

            const username = createBusinessUsername(name);

            // Step 2: Insert row in business_pages database table
            const baseBusinessPayload = {
                owner_id: currentUser.id,
                business_name: name,
                username,
                description,
                category,
                phone,
                email: email || null,
                website: null,
                district: null,
                address: null,
                logo_url: logoUrl,
                cover_photo: coverUrl,
                verified: false,
                followers: 0,
                likes: 0,
                rating: 0,
                total_reviews: 0,
                response_rate: 100,
                average_reply_minutes: 0,
                total_sales: 0,
                completed_orders: 0,
                report_count: 0
            };

            if (whatsapp) {
                baseBusinessPayload.whatsapp = whatsapp;
            }

            let insertedBusiness = null;
            let insertError = null;

            try {
                const result = await supabase
                    .from('business_pages')
                    .insert(baseBusinessPayload)
                    .select('id')
                    .single();

                insertedBusiness = result.data;
                insertError = result.error;
            } catch (err) {
                insertError = err;
            }

            if (insertError && /whatsapp|column/i.test(insertError.message || '')) {
                const fallbackResult = await supabase
                    .from('business_pages')
                    .insert({
                        owner_id: currentUser.id,
                        business_name: name,
                        username,
                        description,
                        category,
                        phone,
                        email: email || null,
                        website: null,
                        district: null,
                        address: null,
                        logo_url: logoUrl,
                        cover_photo: coverUrl,
                        verified: false,
                        followers: 0,
                        likes: 0,
                        rating: 0,
                        total_reviews: 0,
                        response_rate: 100,
                        average_reply_minutes: 0,
                        total_sales: 0,
                        completed_orders: 0,
                        report_count: 0
                    })
                    .select('id')
                    .single();

                insertedBusiness = fallbackResult.data;
                insertError = fallbackResult.error;
            }

            if (insertError) throw insertError;

            if (insertedBusiness?.id) {
                await supabase.from('business_verifications').insert({
                    business_id: insertedBusiness.id,
                    national_id_url: 'pending',
                    passport_photo_url: 'pending',
                    selfie_url: 'pending',
                    status: 'pending'
                });
            }

            alert('Corporate Page successfully deployed and submitted for admin approval.');
            
            form.reset();
            const registerBusinessModal = document.getElementById('register-business-modal');
            if (registerBusinessModal) {
                registerBusinessModal.classList.add('hidden');
                syncModalBodyLock();
            }
            await fetchActiveBusinesses();

        } catch (err) {
            alert(err.message || 'An unexpected error occurred during submission.');
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Create Business Page';
            submitBtn.disabled = false;
        }
    });
}