// =====================================================================
// GENIUS MALAWI - BROADCAST NEWS HUB JS CONTROLLER
// Location: js/news.js
// Purpose: Orchestrates splash screen dismissal, dynamic news fetching,
//          publisher verification guards, category sorting, search mapping,
//          article uploads, and social interaction triggers.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, storageAPI, validateFile } from './supabase.js';

let currentUser = null;
let userProfile = null;
let currentArticles = [];
let currentLikedArticleIds = new Set();
let currentCommentLikes = new Map();
let currentUserCommentLikes = new Set();
let localRatingsByArticleId = new Map();
let newsRealtimeChannel = null;
let activeDetailArticleId = null;
let newsCategories = [];

const LOCAL_STORAGE_LIKES_KEY = 'gm-news-liked-articles';
const LOCAL_STORAGE_RATINGS_KEY = 'gm-news-article-ratings';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function detectStreamType(url) {
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

function buildPlaybackUrl(url, streamType) {
    const normalizedType = String(streamType || '').trim().toLowerCase();
    const trimmedUrl = String(url || '').trim();
    if (!trimmedUrl) return '';
    if (normalizedType === 'youtube') return buildYoutubeEmbedUrl(trimmedUrl) || trimmedUrl;
    if (normalizedType === 'vimeo') return buildVimeoEmbedUrl(trimmedUrl) || trimmedUrl;
    return trimmedUrl;
}

function getPersistedLocalLikes() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_LIKES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (err) {
        return [];
    }
}

function savePersistedLocalLikes(articleIds) {
    try {
        localStorage.setItem(LOCAL_STORAGE_LIKES_KEY, JSON.stringify(articleIds));
    } catch (err) {
        // ignore storage failures
    }
}

function getPersistedLocalRatings() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_RATINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
        return {};
    }
}

function savePersistedLocalRatings(ratings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_RATINGS_KEY, JSON.stringify(ratings));
    } catch (err) {
        // ignore storage failures
    }
}

function persistLocalArticleRating(articleId, ratingValue) {
    const ratings = getPersistedLocalRatings();
    ratings[articleId] = ratingValue;
    savePersistedLocalRatings(ratings);
    localRatingsByArticleId.set(articleId, ratingValue);
}

function loadLocalInteractionState() {
    currentLikedArticleIds = new Set(getPersistedLocalLikes());
    localRatingsByArticleId = new Map(Object.entries(getPersistedLocalRatings()).map(([id, value]) => [id, Number(value) || 0]).filter(([id, value]) => id && value > 0));
}

function getArticleRatingData(article) {
    const baseCount = Number(article.ratings_count || 0);
    const baseAverage = Number(article.ratings_average || 0);
    const localRating = localRatingsByArticleId.get(article.id) || 0;
    const includeLocal = localRating > 0 && !currentUser?.id;
    const adjustedCount = baseCount + (includeLocal ? 1 : 0);
    const adjustedAverage = adjustedCount
        ? ((baseAverage * baseCount + (includeLocal ? localRating : 0)) / adjustedCount)
        : 0;
    return {
        average: adjustedAverage,
        count: adjustedCount,
        userRating: localRating
    };
}

function applyLocalInteractionOverrides(articles) {
    if (!articles || !articles.length) return;
    articles.forEach(article => {
        if (!currentUser?.id && currentLikedArticleIds.has(article.id)) {
            article.likes_count = Number(article.likes_count || 0) + 1;
        }

        const ratingData = getArticleRatingData(article);
        article.ratings_average = ratingData.average;
        article.ratings_count = ratingData.count;
    });
}

function extractStoryLink(content) {
    const matches = String(content || '').match(/https?:\/\/[^\s]+/gi);
    return matches ? matches[0] : '';
}

function renderStoryMediaPlayer(container, url) {
    if (!container || !url) return;

    const streamType = detectStreamType(url);
    const playbackUrl = buildPlaybackUrl(url, streamType);
    const isYoutube = streamType === 'youtube';
    const isVimeo = streamType === 'vimeo';
    const isHls = streamType === 'hls';
    const isMedia = streamType === 'mp4' || streamType === 'webm' || isHls;

    if (!isYoutube && !isVimeo && !isHls && !isMedia) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = 'width:100%; min-height:320px; border:0; border-radius:var(--radius-md);';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture';
        iframe.allowFullscreen = true;
        container.innerHTML = '';
        container.appendChild(iframe);
        setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), 1800);
        return;
    }

    if (isYoutube || isVimeo) {
        const iframe = document.createElement('iframe');
        iframe.src = playbackUrl || url;
        iframe.style.cssText = 'width:100%; min-height:320px; border:0; border-radius:var(--radius-md);';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture';
        iframe.allowFullscreen = true;
        container.innerHTML = '';
        container.appendChild(iframe);
        return;
    }

    const video = document.createElement('video');
    video.src = playbackUrl || url;
    video.controls = true;
    video.autoplay = false;
    video.playsInline = true;
    video.style.cssText = 'width:100%; min-height:320px; border-radius:var(--radius-md); background:#000;';
    container.innerHTML = '';
    container.appendChild(video);
}

document.addEventListener('DOMContentLoaded', async () => {
    document.documentElement.style.scrollBehavior = 'smooth';

    // Dismiss Splash Screen
    dismissSplashLoader();

    // Session Verification & Publisher Check
    const session = await supabase.auth.getSession();
    if (session?.data?.session) {
        currentUser = session.user;
        await verifyPublisherPermissions();
    }

    loadLocalInteractionState();
    await loadNewsCategories();
    await initializeRealtimeNewsUpdates();
    await fetchActiveArticles();
    await handleInitialArticleOpen();
    setupFilters();
    setupModals();
    setupPostingFlow();
    setupEditorialNavigation();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('news-splash');
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
// 2. PUBLISHER SECURITY CHECKS
// ==========================================
async function verifyPublisherPermissions() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;
        userProfile = data;

        // Display publish button if role fits standard journalism criteria
        const publishBtn = document.getElementById('open-publish-modal-btn');
        if (publishBtn && ['news_publisher', 'verified_publisher', 'super_admin'].includes(userProfile.role)) {
            publishBtn.style.display = 'block';
        }
    } catch (err) {
        console.error('Failed to verify publisher criteria:', err.message);
    }
}

// ==========================================
// 3. DATABASE INGESTION & GRID BUILDERS
// ==========================================
async function fetchActiveArticles() {
    try {
        const { data, error } = await supabase
            .from('news_articles')
            .select(`
                *,
                profiles:publisher_id (full_name, role),
                news_categories:category_id (id, name, is_active)
            `)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) throw error;
        currentArticles = (data || []).map((article) => ({
            ...article,
            category: article.news_categories?.name || article.category || 'General',
            category_id: article.category_id || article.news_categories?.id || null,
            category_name: article.news_categories?.name || article.category || 'General'
        })).sort((a, b) => {
            if (Number(a.is_featured) !== Number(b.is_featured)) return Number(b.is_featured) - Number(a.is_featured);
            if (Number(a.is_breaking) !== Number(b.is_breaking)) return Number(b.is_breaking) - Number(a.is_breaking);
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        await loadUserLikedArticles();
        applyLocalInteractionOverrides(currentArticles);
        updateNewsSummaryMetrics(currentArticles);
        renderNewsGrid(currentArticles);
    } catch (err) {
        console.error('Error fetching broadcast news feed:', err.message);
    }
}

async function loadUserLikedArticles() {
    const localLikes = new Set(getPersistedLocalLikes());
    currentLikedArticleIds = new Set(localLikes);
    if (!currentUser?.id) return;

    try {
        const { data, error } = await supabase
            .from('news_article_likes')
            .select('article_id')
            .eq('user_id', currentUser.id);

        if (error) throw error;
        (data || []).forEach((row) => {
            if (row.article_id) currentLikedArticleIds.add(row.article_id);
        });
    } catch (err) {
        console.warn('Unable to load liked articles:', err.message);
    }
}

function updateNewsSummaryMetrics(articles) {
    const total = articles.length;
    const commentCount = articles.reduce((sum, item) => sum + Number(item.comments_count || 0), 0);
    const articleLikes = articles.reduce((sum, item) => sum + Number(item.likes_count || 0), 0);
    const featured = articles.filter((item) => item.is_featured).length;

    const totalEl = document.getElementById('news-summary-total');
    const commentEl = document.getElementById('news-summary-comments');
    const likesEl = document.getElementById('news-summary-likes');
    const featuredEl = document.getElementById('news-summary-featured');

    if (totalEl) totalEl.textContent = total.toLocaleString();
    if (commentEl) commentEl.textContent = commentCount.toLocaleString();
    if (likesEl) likesEl.textContent = articleLikes.toLocaleString();
    if (featuredEl) featuredEl.textContent = featured.toLocaleString();
}

async function initializeRealtimeNewsUpdates() {
    if (newsRealtimeChannel) return;

    newsRealtimeChannel = supabase.channel('news-feed-updates');

    const refreshList = async () => {
        await fetchActiveArticles();
        if (activeDetailArticleId) {
            const detailData = await loadArticleDetail(activeDetailArticleId);
            if (detailData) {
                const overlay = document.querySelector('.news-article-overlay');
                if (overlay) {
                    overlay.remove();
                    renderArticleDetailOverlay(detailData);
                }
            }
        }
    };

    newsRealtimeChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'news_articles' }, refreshList)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'news_article_likes' }, refreshList)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'news_article_ratings' }, refreshList)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'news_article_comments' }, refreshList)
        .subscribe();
}

function setupEditorialNavigation() {
    const searchToggle = document.getElementById('news-search-toggle');
    const searchBar = document.getElementById('news-editorial-search-bar');
    const searchInput = document.getElementById('news-search');

    searchToggle?.addEventListener('click', () => {
        searchBar?.classList.toggle('is-open');
        searchInput?.focus();
    });

    renderNewsCategoryNav();

    document.querySelectorAll('.news-editorial-category-btn').forEach((button) => {
        button.addEventListener('click', () => {
            activeNewsCategory = button.dataset.categoryValue || 'all';
            document.querySelectorAll('.news-editorial-category-btn').forEach((item) => {
                item.classList.toggle('is-active', item === button);
            });
            renderNewsGrid(currentArticles);
        });
    });

    searchInput?.addEventListener('input', (event) => {
        activeNewsSearchTerm = event.target.value.trim();
        renderNewsGrid(currentArticles);
    });
}

function renderNewsCategoryNav() {
    const nav = document.getElementById('news-category-nav');
    if (!nav) return;

    const visibleCategories = newsCategories.filter((category) => category.is_active !== false);
    const buttons = [{ value: 'all', label: 'Home' }, ...visibleCategories.map((category) => ({ value: category.name, label: category.name }))];

    nav.innerHTML = buttons.map((category) => {
        const isActive = activeNewsCategory === category.value;
        return `<button class="news-editorial-category-btn${isActive ? ' is-active' : ''}" type="button" data-category-value="${escapeHtml(category.value)}">${escapeHtml(category.label)}</button>`;
    }).join('');
}

function normalizeCategoryValue(value) {
    return String(value || '').trim().toLowerCase();
}

function getFilteredArticles(articles, category) {
    if (!category || category === 'all') return articles;
    const normalized = normalizeCategoryValue(category);
    return articles.filter((item) => {
        const itemCategory = normalizeCategoryValue(item.category_name || item.category || '');
        return itemCategory === normalized || itemCategory.includes(normalized);
    });
}

let activeNewsCategory = 'all';
let activeNewsSearchTerm = '';

function renderNewsGrid(articles) {
    const grid = document.getElementById('news-grid');
    const leftColumn = document.getElementById('news-left-column');
    const centerColumn = document.getElementById('news-center-column');
    const rightColumn = document.getElementById('news-right-column');

    if (!grid || !leftColumn || !centerColumn || !rightColumn) return;

    const categoryFiltered = getFilteredArticles(articles, activeNewsCategory);
    const searchFiltered = categoryFiltered.filter((item) => {
        const haystack = [item.title, item.summary, item.content, item.category].filter(Boolean).join(' ').toLowerCase();
        return !activeNewsSearchTerm || haystack.includes(activeNewsSearchTerm.toLowerCase());
    });

    if (!searchFiltered.length) {
        leftColumn.innerHTML = '<div class="news-editorial-empty">No matching stories found.</div>';
        centerColumn.innerHTML = '';
        rightColumn.innerHTML = '';
        return;
    }

    if (!articles.length) {
        leftColumn.innerHTML = '<div class="news-editorial-empty">No verified broadcast updates currently indexed.</div>';
        centerColumn.innerHTML = '';
        rightColumn.innerHTML = '';
        return;
    }

    const featured = searchFiltered.filter(item => item.is_featured && !item.deleted_at);
    const breaking = searchFiltered.filter(item => item.is_breaking && !item.deleted_at);
    const regular = searchFiltered.filter(item => !item.is_featured && !item.is_breaking && !item.deleted_at);
    const heroArticle = featured[0] || breaking[0] || regular[0] || articles[0];
    const leftArticles = regular.filter(item => item.id !== heroArticle.id).slice(0, 3);
    const rightArticles = regular.filter(item => item.id !== heroArticle.id).slice(3, 8);

    const heroMarkup = buildEditorialHeroCard(heroArticle);
    const leftMarkup = leftArticles.length ? leftArticles.map(item => buildEditorialStackCard(item)).join('') : '<div class="news-editorial-empty">No additional stories available.</div>';
    const rightMarkup = rightArticles.length ? rightArticles.map(item => buildEditorialListCard(item)).join('') : '<div class="news-editorial-empty">No headlines available.</div>';

    centerColumn.innerHTML = heroMarkup;
    leftColumn.innerHTML = leftMarkup;
    rightColumn.innerHTML = rightMarkup;
}

function buildEditorialHeroCard(item) {
    const primaryImage = item.image_url || '../assets/Icon.png';
    const summaryText = String(item.summary || item.content || '').replace(/<[^>]*>/g, '').slice(0, 180);
    const formattedDate = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const badge = item.is_breaking ? '<span class="meta">Breaking</span>' : '<span class="meta">Featured</span>';
    const categoryLabel = item.category_name || item.category || 'General';

    return `
        <article class="news-editorial-card hero-card" onclick="window.readFullArticle('${item.id}')" style="cursor:pointer;">
            <img src="${primaryImage}" alt="${escapeHtml(item.title)}" loading="lazy">
            <div class="category">${escapeHtml(categoryLabel)}</div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">${badge}<span class="meta">${escapeHtml(formattedDate)}</span></div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(summaryText)}</p>
        </article>
    `;
}

function buildEditorialStackCard(item) {
    const primaryImage = item.image_url || '../assets/Icon.png';
    const summaryText = String(item.summary || item.content || '').replace(/<[^>]*>/g, '').slice(0, 120);
    const formattedDate = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const categoryLabel = item.category_name || item.category || 'General';

    return `
        <article class="news-editorial-card" onclick="window.readFullArticle('${item.id}')" style="cursor:pointer;">
            <img src="${primaryImage}" alt="${escapeHtml(item.title)}" loading="lazy">
            <div class="category">${escapeHtml(categoryLabel)}</div>
            <div class="meta">${escapeHtml(formattedDate)}</div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(summaryText)}</p>
        </article>
    `;
}

function buildEditorialListCard(item) {
    const formattedDate = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const categoryLabel = item.category_name || item.category || 'General';
    return `
        <article class="news-editorial-card-list-item" onclick="window.readFullArticle('${item.id}')" style="cursor:pointer;">
            <div class="category">${escapeHtml(categoryLabel)}</div>
            <h4>${escapeHtml(item.title)}</h4>
            <div class="meta">${escapeHtml(formattedDate)}</div>
        </article>
    `;
}

// ==========================================
// 4. INTERACTION COMMANDS
// ==========================================
async function getArticleViewKey(articleId) {
    if (currentUser?.id) {
        return `user:${currentUser.id}`;
    }

    const storageKey = `news-article-anon-view-key-${articleId}`;
    let anonymousKey = localStorage.getItem(storageKey);
    if (!anonymousKey) {
        anonymousKey = `anon:${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
        try {
            localStorage.setItem(storageKey, anonymousKey);
        } catch (err) {
            // ignore localStorage write failures
        }
    }
    return anonymousKey;
}

function getRatingLabel(value) {
    return '★'.repeat(value) + '☆'.repeat(5 - value);
}

function getArticleTags(article) {
    if (!article) return [];
    if (Array.isArray(article.tags)) return article.tags.filter(Boolean);
    if (typeof article.tags === 'string') {
        return article.tags.split(',').map(tag => tag.trim()).filter(Boolean);
    }
    return [];
}

function computeReadingTime(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 225));
}

function getArticleHtmlContent(content) {
    const paragraphs = String(content || '')
        .split(/\n{2,}/g)
        .filter(Boolean)
        .map(paragraph => `<p style="margin-bottom:18px; line-height:1.9; font-size:16px; color:#000000;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
        .join('');
    return paragraphs || '<p style="margin-bottom:18px; line-height:1.9; font-size:16px; color:#000000;">No full article content available.</p>';
}

function getRelatedArticlesFor(article) {
    if (!article) return [];
    const tags = getArticleTags(article);
    const category = String(article.category || '').trim().toLowerCase();

    const candidates = currentArticles
        .filter(item => item.id !== article.id && !item.deleted_at)
        .map(item => {
            const itemTags = getArticleTags(item);
            const hasCategory = String(item.category || '').trim().toLowerCase() === category;
            const sharedTags = tags.filter(tag => itemTags.map(t => t.toLowerCase()).includes(tag.toLowerCase()));
            return { item, score: (hasCategory ? 2 : 0) + sharedTags.length };
        })
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(entry => entry.item);

    return candidates;
}

async function incrementArticleView(articleId) {
    try {
        const viewKey = await getArticleViewKey(articleId);
        const { data, error } = await supabase.rpc('increment_news_article_view', { article_id: articleId, view_key: viewKey });
        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('Article view tracking failed:', err.message);
        return null;
    }
}

async function toggleLikeArticle(articleId) {
    const isLocalLike = currentLikedArticleIds.has(articleId);
    try {
        if (!isLocalLike && currentUser?.id) {
            const { error: likeError } = await supabase.rpc('like_news_article', { article_id: articleId });
            if (likeError) throw likeError;
        }

        const updatedLikes = new Set(currentLikedArticleIds);
        if (isLocalLike) {
            updatedLikes.delete(articleId);
        } else {
            updatedLikes.add(articleId);
        }
        currentLikedArticleIds = updatedLikes;
        savePersistedLocalLikes([...updatedLikes]);

        const article = currentArticles.find(item => item.id === articleId);
        if (article) {
            article.likes_count = Number(article.likes_count || 0) + (isLocalLike ? -1 : 1);
            if (article.likes_count < 0) article.likes_count = 0;
        }

        updateNewsSummaryMetrics(currentArticles);
        renderNewsGrid(currentArticles);
        return !isLocalLike;
    } catch (err) {
        if (err?.message) alert(err.message);
        console.warn('Like action failed:', err.message);
        return null;
    }
}

async function rateArticle(articleId, ratingValue) {
    try {
        if (currentUser?.id) {
            const { data, error } = await supabase.rpc('rate_news_article', { article_id: articleId, rating_value: ratingValue });
            if (error) throw error;
            persistLocalArticleRating(articleId, ratingValue);
            await fetchActiveArticles();
            return data;
        }

        persistLocalArticleRating(articleId, ratingValue);
        const article = currentArticles.find(item => item.id === articleId);
        if (article) {
            const localRating = localRatingsByArticleId.get(articleId) || 0;
            const existingCount = Number(article.ratings_count || 0);
            const existingAverage = Number(article.ratings_average || 0);
            const baseCount = existingCount;
            const baseTotal = existingAverage * baseCount;
            const newCount = localRating > 0 ? baseCount : baseCount + 1;
            const newTotal = baseTotal - (localRating || 0) + ratingValue;
            article.ratings_count = newCount;
            article.ratings_average = newCount ? newTotal / newCount : 0;
        }

        updateNewsSummaryMetrics(currentArticles);
        renderNewsGrid(currentArticles);
        return { ratings_average: article?.ratings_average, ratings_count: article?.ratings_count };
    } catch (err) {
        if (err?.message) alert(err.message);
        console.warn('Rating action failed:', err.message);
        return null;
    }
}

async function toggleBookmark(articleId) {
    if (!currentUser?.id) {
        alert('You need to sign in to save articles for later.');
        return;
    }

    try {
        const { data: existing, error: queryError } = await supabase
            .from('news_article_bookmarks')
            .select('id')
            .eq('article_id', articleId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (queryError) throw queryError;

        if (existing) {
            const { error } = await supabase.rpc('remove_news_article_bookmark', { article_id: articleId });
            if (error) throw error;
            return false;
        }

        const { data, error } = await supabase.rpc('bookmark_news_article', { article_id: articleId });
        if (error) throw error;
        return true;
    } catch (err) {
        console.warn('Bookmark toggle failed:', err.message);
        return null;
    }
}

async function fetchBookmarkStatus(articleId) {
    if (!currentUser?.id) return false;

    try {
        const { data, error } = await supabase
            .from('news_article_bookmarks')
            .select('id')
            .eq('article_id', articleId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (error) throw error;
        return Boolean(data?.id);
    } catch (err) {
        console.warn('Bookmark status query failed:', err.message);
        return false;
    }
}

function saveArticlePosition(articleId, overlayElement) {
    const position = overlayElement?.scrollTop ?? window.scrollY ?? window.pageYOffset ?? 0;
    try {
        localStorage.setItem(`news-article-scroll-${articleId}`, String(position));
    } catch (err) {
        // ignore local storage failures
    }
}

function restoreArticlePosition(articleId, overlayElement) {
    try {
        const stored = localStorage.getItem(`news-article-scroll-${articleId}`);
        if (stored) {
            const value = Number(stored);
            if (!Number.isNaN(value)) {
                if (overlayElement) {
                    overlayElement.scrollTop = value;
                } else {
                    window.scrollTo({ top: value, behavior: 'smooth' });
                }
            }
        }
    } catch (err) {
        // ignore
    }
}

async function loadArticleDetail(articleId) {
    activeDetailArticleId = articleId;
    const { data: article, error } = await supabase
        .from('news_articles')
        .select(`*, profiles:publisher_id(full_name, role)`)
        .eq('id', articleId)
        .maybeSingle();

    if (error || !article) {
        alert('Unable to load the requested article. Please try again.');
        return null;
    }

    await incrementArticleView(articleId);

    const [userLike, userRating, isBookmarked, commentsData] = await Promise.all([
        currentUser?.id ? supabase.from('news_article_likes').select('id').eq('article_id', articleId).eq('user_id', currentUser.id).maybeSingle() : Promise.resolve({ data: null }),
        currentUser?.id ? supabase.from('news_article_ratings').select('rating').eq('article_id', articleId).eq('user_id', currentUser.id).maybeSingle() : Promise.resolve({ data: null }),
        fetchBookmarkStatus(articleId),
        supabase.from('news_article_comments').select('*, user: user_id (full_name, profile_photo)').eq('article_id', articleId).order('created_at', { ascending: false })
    ]);

    const anonymousLike = !currentUser?.id && currentLikedArticleIds.has(articleId);
    const anonymousRating = !currentUser?.id ? (localRatingsByArticleId.get(articleId) || 0) : 0;
    const adjustedArticle = { ...article };
    if (anonymousLike) {
        adjustedArticle.likes_count = Number(adjustedArticle.likes_count || 0) + 1;
    }
    if (anonymousRating > 0) {
        const baseCount = Number(adjustedArticle.ratings_count || 0);
        const baseAverage = Number(adjustedArticle.ratings_average || 0);
        adjustedArticle.ratings_count = baseCount + 1;
        adjustedArticle.ratings_average = baseCount
            ? ((baseAverage * baseCount + anonymousRating) / (baseCount + 1))
            : anonymousRating;
    }

    return {
        article: adjustedArticle,
        isLiked: Boolean(userLike?.data?.id) || anonymousLike,
        userRating: currentUser?.id ? (userRating?.data?.rating || 0) : anonymousRating,
        isBookmarked,
        comments: commentsData.data || []
    };
}

function createLocalCommentId() {
    return `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getLocalArticleComments(articleId) {
    try {
        const stored = localStorage.getItem(`news-local-comments-${articleId}`);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function saveLocalArticleComments(articleId, comments) {
    try {
        localStorage.setItem(`news-local-comments-${articleId}`, JSON.stringify(comments));
    } catch (err) {
        // ignore storage failures
    }
}

function submitLocalComment(articleId, body, parentId = null) {
    const comments = getLocalArticleComments(articleId);
    const comment = {
        id: createLocalCommentId(),
        article_id: articleId,
        parent_id: parentId || null,
        body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        likes_count: 0,
        likedByMe: false,
        is_local: true,
        user: {
            full_name: 'Guest Reader',
            profile_photo: '../assets/Icon.png'
        }
    };
    comments.unshift(comment);
    saveLocalArticleComments(articleId, comments);
    return comment;
}

function updateLocalComment(articleId, commentId, body) {
    const comments = getLocalArticleComments(articleId);
    const target = comments.find(comment => comment.id === commentId);
    if (!target) return null;
    target.body = body;
    target.updated_at = new Date().toISOString();
    saveLocalArticleComments(articleId, comments);
    return target;
}

function deleteLocalComment(articleId, commentId) {
    const comments = getLocalArticleComments(articleId);
    const nextComments = comments.filter(comment => comment.id !== commentId);
    saveLocalArticleComments(articleId, nextComments);
    return nextComments;
}

function toggleLocalCommentLike(articleId, commentId) {
    const comments = getLocalArticleComments(articleId);
    const target = comments.find(comment => comment.id === commentId);
    if (!target) return null;
    target.likedByMe = !target.likedByMe;
    target.likes_count = Math.max(0, (target.likes_count || 0) + (target.likedByMe ? 1 : -1));
    saveLocalArticleComments(articleId, comments);
    return target;
}

function getVisibleComments(articleId, comments = []) {
    const localComments = getLocalArticleComments(articleId);
    return [...comments, ...localComments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getShareIcon(type) {
    const iconMap = {
        copy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"></path><path d="M5 3h8a2 2 0 0 1 2 2"></path><path d="M3 7h2"></path></svg>',
        whatsapp: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19.2 6.4 15A8.3 8.3 0 1 1 19 8.2a8.2 8.2 0 0 1-1.2 4.1"></path><path d="M8.7 9.7c.3-.5 1-.8 1.3-.8.2 0 .4 0 .6.2.2.2.3.5.2.8-.2.4-.4.6-.8.9-.3.2-.4.4-.3.6.1.3.7 1.3 1.5 1.9 1 .7 1.8.8 2.1.7.3-.1.4-.3.6-.6.2-.3.4-.4.7-.4.2 0 .4.1.6.3l1.3 1.2c.2.2.3.4.3.7 0 .3-.1.5-.3.7a4.9 4.9 0 0 1-2.4 1.4c-.6.1-1.3 0-1.9-.2A8.7 8.7 0 0 1 8.4 14c-1-.7-1.8-1.6-2.4-2.6-.7-1.1-.9-2.2-.7-3.4.1-.6.3-1.2.7-1.7Z"></path></svg>',
        facebook: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 20v-7h2.4l.4-3H13V4.8c0-.9.3-1.5 1.5-1.5H16V.8c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.4-3.7 3.8V10H8v3h2.1v7"></path></svg>',
        x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16"></path><path d="m20 4-16 16"></path></svg>',
        telegram: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4 3 11l6 2 2 6 4-4 5 4Z"></path></svg>'
    };
    return iconMap[type] || iconMap.copy;
}

function renderCommentItem(comment, isOwner, articleId) {
    const avatar = comment.user?.profile_photo || '../assets/Icon.png';
    const createdAt = new Date(comment.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const replyClass = comment.parent_id ? 'is-reply' : '';
    const likeLabel = comment.likedByMe ? '★ Liked' : '☆ Like';
    const likeCount = Number(comment.likes_count || 0);
    return `
        <div class="news-comment-item ${replyClass}">
            <div class="news-comment-meta">
                <img src="${avatar}" alt="${escapeHtml(comment.user?.full_name || 'User')}">
                <div>
                    <strong>${escapeHtml(comment.user?.full_name || 'Guest Reader')}</strong>
                    <div><time>${createdAt}</time></div>
                </div>
            </div>
            <div class="news-comment-body">${escapeHtml(comment.body)}</div>
            <div class="news-comment-actions">
                <button type="button" class="news-comment-like" data-comment-id="${comment.id}">${likeLabel}${likeCount ? ` (${likeCount})` : ''}</button>
                <button type="button" class="news-comment-reply" data-comment-id="${comment.id}">Reply</button>
                ${isOwner ? `<button type="button" class="news-comment-edit" data-comment-id="${comment.id}">Edit</button><button type="button" class="news-comment-delete" data-comment-id="${comment.id}">Delete</button>` : ''}
            </div>
        </div>
    `;
}

function renderArticleDetailOverlay(articleData) {
    const { article, isLiked, userRating, isBookmarked, comments } = articleData;
    const readingTime = computeReadingTime(article.content || '');
    const tags = getArticleTags(article);
    const relatedArticles = getRelatedArticlesFor(article);
    const ratingDisplay = `${Number(article.ratings_average || 0).toFixed(1)} (${Number(article.ratings_count || 0)})`;

    const overlay = document.createElement('div');
    overlay.className = 'splash-screen news-article-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(255,255,255,0.95); z-index:10000; overflow-y:auto; padding:24px 12px;';

    const panel = document.createElement('div');
    panel.className = 'luxury-card news-article-panel';
    panel.style.cssText = 'width:100%; max-width:1000px; margin:0 auto; padding:28px; border:1px solid rgba(0,0,0,0.12); background:#ffffff;';

    const formattedDate = new Date(article.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const coverCaption = typeof article.cover_caption === 'string' && article.cover_caption.trim() ? article.cover_caption.trim() : '';
    const heroImage = article.image_url ? `
        <figure class="news-article-hero-image">
            <img src="${article.image_url}" alt="${escapeHtml(article.title)}" loading="lazy" decoding="async">
            ${coverCaption ? `<figcaption class="news-article-hero-caption">${escapeHtml(coverCaption)}</figcaption>` : ''}
        </figure>
    ` : '';
    const gallerySection = Array.isArray(article.gallery_urls) && article.gallery_urls.length ? `
        <div class="news-article-gallery">
            ${article.gallery_urls.map(url => `<figure class="news-article-gallery-item"><img src="${escapeHtml(url)}" alt="Gallery image" loading="lazy" decoding="async"></figure>`).join('')}
        </div>
    ` : '';
    const tagHtml = tags.length ? `<div style="display:flex; flex-wrap:wrap; gap:10px;">${tags.map(tag => `<span class="badge badge-secondary" style="font-size:11px; padding:6px 10px; color:#000000; border:1px solid rgba(0,0,0,0.12); background:#ffffff;">${escapeHtml(tag)}</span>`).join('')}</div>` : '';
    const contentHtml = getArticleHtmlContent(article.content);
    const subtitle = typeof article.subtitle === 'string' && article.subtitle.trim() ? article.subtitle : '';
    const visibleComments = getVisibleComments(article.id, comments);
    const commentsCount = visibleComments.length;

    panel.innerHTML = `
        <div class="news-article-shell">
            <div class="news-article-topbar">
                <div class="news-article-breadcrumb">
                    <span>${escapeHtml(article.category || 'General')}</span>
                    <span class="divider"></span>
                    <span>${formattedDate}</span>
                </div>
                <button id="close-article-overview" class="btn-secondary" style="padding:10px 18px; font-size:13px; color:#000000;">Close</button>
            </div>
            <article class="news-article-reader">
                <div class="news-article-hero">
                    ${heroImage}
                    <div class="news-article-header">
                        <p class="news-article-kicker">${escapeHtml(article.category || 'General')}</p>
                        <h1>${escapeHtml(article.title)}</h1>
                        ${subtitle ? `<p class="news-article-subtitle">${escapeHtml(subtitle)}</p>` : ''}
                        <div class="news-article-meta">
                            <span>By <strong>${escapeHtml(article.profiles?.full_name || article.source_name || 'Genius Malawi')}</strong></span>
                            <span>${formattedDate}</span>
                            <span>${readingTime} min read</span>
                        </div>
                    </div>
                </div>
                <div class="news-article-stats">
                    <div class="stat-pill">👁 ${Number(article.views_count || 0).toLocaleString()}</div>
                    <div class="stat-pill">👍 ${Number(article.likes_count || 0).toLocaleString()}</div>
                    <div class="stat-pill">⭐ ${ratingDisplay}</div>
                    <div class="stat-pill">💬 ${commentsCount}</div>
                </div>
                <div class="news-article-toolbar">
                    <button id="news-like-button" class="btn-primary" style="padding: 10px 18px; font-size: 14px; color:#000000;">${isLiked ? 'Liked' : 'Like'} ${Number(article.likes_count || 0).toLocaleString()}</button>
                    <button id="news-bookmark-button" class="btn-secondary" style="padding: 10px 18px; font-size: 14px; color:#000000; ${!currentUser?.id ? 'opacity:0.55; cursor:not-allowed;' : ''}" ${!currentUser?.id ? 'disabled' : ''}>${currentUser?.id ? (isBookmarked ? 'Saved' : 'Save for Later') : 'Save for Later (Sign in)'}</button>
                </div>
                <div class="news-article-action-row">
                    ${['1','2','3','4','5'].map((value) => `<button type="button" class="news-rating-star${value <= (userRating || Math.round(article.ratings_average || 0)) ? ' active' : ''}" data-rating="${value}" style="font-size:18px; border:none; background:none; cursor:pointer; color:#000000;">★</button>`).join('')}
                    <span style="font-size:13px; color:#000000;">${currentUser ? `Your rating: ${userRating || 0}` : 'Rate this article'}</span>
                </div>
                ${tagHtml}
                <div class="news-article-body">
                    <div class="news-article-share-bar" aria-label="Share article">
                        <button type="button" class="news-share-action" data-share-action="copy" title="Copy link" aria-label="Copy link">${getShareIcon('copy')}</button>
                        <a href="https://wa.me/?text=${encodeURIComponent(article.title + ' ' + window.location.origin + '/pages/news.html?id=' + article.id)}" target="_blank" rel="noopener noreferrer" title="Share on WhatsApp" aria-label="Share on WhatsApp">${getShareIcon('whatsapp')}</a>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin + '/pages/news.html?id=' + article.id)}" target="_blank" rel="noopener noreferrer" title="Share on Facebook" aria-label="Share on Facebook">${getShareIcon('facebook')}</a>
                        <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(window.location.origin + '/pages/news.html?id=' + article.id)}" target="_blank" rel="noopener noreferrer" title="Share on X" aria-label="Share on X">${getShareIcon('x')}</a>
                        <a href="https://t.me/share/url?url=${encodeURIComponent(window.location.origin + '/pages/news.html?id=' + article.id)}&text=${encodeURIComponent(article.title)}" target="_blank" rel="noopener noreferrer" title="Share on Telegram" aria-label="Share on Telegram">${getShareIcon('telegram')}</a>
                    </div>
                    <div class="news-article-content">
                        ${gallerySection}
                        <div>${contentHtml}</div>
                    </div>
                </div>
            </article>
            <section class="news-article-section">
                <h2>Related News</h2>
                <div id="news-related-list" class="news-related-grid"></div>
            </section>
            <section class="news-article-section">
                <h2>Comments</h2>
                <div id="news-comment-form-container" style="margin-bottom:4px;"></div>
                <div id="news-comments-list" class="news-comments-list"></div>
            </section>
        </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const closeButton = panel.querySelector('#close-article-overview');
    const copyButton = panel.querySelector('#copy-article-link');
    const likeButton = panel.querySelector('#news-like-button');
    const bookmarkButton = panel.querySelector('#news-bookmark-button');
    const starButtons = panel.querySelectorAll('.news-rating-star');
    const shareButtons = panel.querySelectorAll('.news-share-action');

    closeButton?.addEventListener('click', () => {
        overlay.remove();
        document.body.style.overflow = '';
        activeDetailArticleId = null;
        fetchActiveArticles();
    });

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            overlay.remove();
            document.body.style.overflow = '';
            activeDetailArticleId = null;
            fetchActiveArticles();
        }
    });

    copyButton?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/pages/news.html?id=${article.id}`);
            alert('Article link copied to clipboard.');
        } catch (err) {
            console.warn('Copy failed:', err);
        }
    });

    shareButtons.forEach(button => {
        button.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(`${window.location.origin}/pages/news.html?id=${article.id}`);
                alert('Article link copied to clipboard.');
            } catch (err) {
                console.warn('Copy failed:', err);
            }
        });
    });

    likeButton?.addEventListener('click', async () => {
        await toggleLikeArticle(article.id);
        const updated = await loadArticleDetail(article.id);
        if (updated) {
            overlay.remove();
            renderArticleDetailOverlay(updated);
        }
    });

    bookmarkButton?.addEventListener('click', async () => {
        if (!currentUser?.id) {
            alert('Please sign in to bookmark this article.');
            return;
        }
        const newState = await toggleBookmark(article.id);
        if (newState !== null) {
            bookmarkButton.textContent = newState ? 'Saved' : 'Save for Later';
        }
    });

    starButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const ratingValue = Number(button.dataset.rating);
            await rateArticle(article.id, ratingValue);
            const updated = await loadArticleDetail(article.id);
            if (updated) {
                overlay.remove();
                renderArticleDetailOverlay(updated);
            }
        });
        button.addEventListener('mouseenter', () => {
            const starValue = Number(button.dataset.rating);
            starButtons.forEach((star) => {
                if (Number(star.dataset.rating) <= starValue) {
                    star.style.color = '#000000';
                }
            });
        });
        button.addEventListener('mouseleave', () => {
            starButtons.forEach((star) => {
                const currentStarValue = Number(star.dataset.rating);
                star.style.color = currentStarValue <= (userRating || Math.round(article.ratings_average || 0)) ? '#000000' : '#777777';
            });
        });
    });

    const commentContainer = panel.querySelector('#news-comment-form-container');
    renderCommentForm(commentContainer, article.id, comments);
    renderCommentsList(panel.querySelector('#news-comments-list'), comments, article.id);
    renderRelatedArticles(panel.querySelector('#news-related-list'), relatedArticles);
    restoreArticlePosition(article.id, overlay);
    overlay.addEventListener('scroll', () => saveArticlePosition(article.id, overlay));
    overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            overlay.remove();
            document.body.style.overflow = '';
            fetchActiveArticles();
        }
    });
}

function renderRelatedArticles(container, relatedArticles) {
    if (!container) return;
    if (!relatedArticles.length) {
        container.innerHTML = '<div style="color:#000000;">No related articles found.</div>'; 
        return;
    }
    container.innerHTML = relatedArticles.map(item => {
        const image = item.image_url || '../assets/Icon.png';
        const summaryText = String(item.summary || item.content || '').replace(/<[^>]*>/g, '').slice(0, 110);
        const pubDate = item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        return `
            <article class="news-related-card" data-article-id="${item.id}">
                <img src="${image}" alt="${escapeHtml(item.title)}" loading="lazy">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(summaryText)}</p>
                ${pubDate ? `<span>${escapeHtml(pubDate)}</span>` : ''}
            </article>
        `;
    }).join('');

    container.querySelectorAll('.news-related-card').forEach(card => {
        card.addEventListener('click', () => {
            const articleId = card.dataset.articleId;
            if (articleId) {
                window.readFullArticle?.(articleId);
            }
        });
    });
}

function renderCommentForm(container, articleId, comments) {
    if (!container) return;
    const isSignedIn = Boolean(currentUser?.id);
    container.innerHTML = `
        <div class="news-comment-form-wrap">
            <textarea id="news-comment-input" rows="4" placeholder="Share your perspective on this story..."></textarea>
            <div class="news-comment-form-actions">
                <span>${isSignedIn ? 'Commenting as ' + escapeHtml(currentUser.email || currentUser.id) : 'Posting as a guest reader.'}</span>
                <button id="news-submit-comment" type="button" class="btn-primary">Post Comment</button>
            </div>
        </div>
    `;

    container.querySelector('#news-submit-comment')?.addEventListener('click', async () => {
        const input = container.querySelector('#news-comment-input');
        const body = input?.value.trim();
        if (!body) return alert('Please write a comment before submitting.');
        await submitComment(articleId, body);
        input.value = '';
        const updated = await loadArticleDetail(articleId);
        if (updated) {
            const overlay = document.querySelector('.splash-screen');
            if (overlay) {
                const commentsList = overlay.querySelector('#news-comments-list');
                renderCommentsList(commentsList, updated.comments, articleId);
            }
        }
    });
}

async function submitComment(articleId, body, parentId = null, editId = null) {
    if (!currentUser?.id) {
        if (editId) {
            const updated = updateLocalComment(articleId, editId, body);
            return updated;
        }
        const created = submitLocalComment(articleId, body, parentId);
        return created;
    }
    try {
        if (editId) {
            const { error } = await supabase.from('news_article_comments').update({ body, updated_at: new Date().toISOString() }).eq('id', editId).eq('user_id', currentUser.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('news_article_comments').insert({ article_id: articleId, user_id: currentUser.id, parent_id: parentId, body });
            if (error) throw error;
        }
    } catch (err) {
        alert(err.message || 'Unable to save comment.');
    }
}

function renderCommentsList(container, comments, articleId) {
    if (!container) return;
    const visibleComments = getVisibleComments(articleId, comments);
    if (!visibleComments.length) {
        container.innerHTML = '<div style="color:#000000;">No comments yet. Start the discussion.</div>';
        return;
    }

    container.innerHTML = visibleComments.map(comment => {
        const isOwner = Boolean(comment.is_local || currentUser?.id === comment.user_id);
        return renderCommentItem(comment, isOwner, articleId);
    }).join('');

    container.querySelectorAll('.news-comment-delete').forEach(button => {
        button.addEventListener('click', async (event) => {
            const commentId = event.currentTarget.dataset.commentId;
            if (!commentId || !confirm('Delete this comment?')) return;
            try {
                if (currentUser?.id) {
                    const { error } = await supabase.from('news_article_comments').delete().eq('id', commentId).eq('user_id', currentUser.id);
                    if (error) throw error;
                } else {
                    deleteLocalComment(articleId, commentId);
                }
                const updated = await loadArticleDetail(articleId);
                if (updated) {
                    renderCommentsList(container, updated.comments, articleId);
                }
            } catch (err) {
                alert(err.message || 'Unable to delete comment.');
            }
        });
    });

    container.querySelectorAll('.news-comment-edit').forEach(button => {
        button.addEventListener('click', async (event) => {
            const commentId = event.currentTarget.dataset.commentId;
            if (!commentId) return;
            const commentText = event.currentTarget.closest('.news-comment-item')?.querySelector('.news-comment-body')?.textContent || '';
            const newBody = prompt('Edit your comment:', commentText);
            if (newBody === null || newBody.trim() === '' || newBody.trim() === commentText.trim()) return;
            await submitComment(articleId, newBody.trim(), null, commentId);
            const updated = await loadArticleDetail(articleId);
            if (updated) {
                renderCommentsList(container, updated.comments, articleId);
            }
        });
    });

    container.querySelectorAll('.news-comment-reply').forEach(button => {
        button.addEventListener('click', async (event) => {
            const commentId = event.currentTarget.dataset.commentId;
            const replyBody = prompt('Write a reply to this comment:');
            if (!replyBody || !replyBody.trim()) return;
            await submitComment(articleId, replyBody.trim(), commentId);
            const updated = await loadArticleDetail(articleId);
            if (updated) {
                renderCommentsList(container, updated.comments, articleId);
            }
        });
    });

    container.querySelectorAll('.news-comment-like').forEach(button => {
        button.addEventListener('click', async (event) => {
            const commentId = event.currentTarget.dataset.commentId;
            if (!commentId) return;
            toggleLocalCommentLike(articleId, commentId);
            const updated = await loadArticleDetail(articleId);
            if (updated) {
                renderCommentsList(container, updated.comments, articleId);
            }
        });
    });
}

async function handleInitialArticleOpen() {
    const query = new URLSearchParams(window.location.search);
    const id = query.get('id');
    if (!id) return;

    activeDetailArticleId = id;
    const loaded = await loadArticleDetail(id);
    if (loaded) renderArticleDetailOverlay(loaded);
}

window.readFullArticle = async (articleId) => {
    activeDetailArticleId = articleId;
    const loaded = await loadArticleDetail(articleId);
    if (loaded) {
        renderArticleDetailOverlay(loaded);
    }
};

window.triggerShare = (id, title) => {
    const shareUrl = `${window.location.origin}/pages/news.html?id=${id}`;
    if (navigator.share) {
        navigator.share({ title, url: shareUrl }).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('Share link copied to clipboard.');
        }).catch(() => {
            alert('Copy failed.');
        });
    }
};

window.toggleArticleLike = async (articleId) => {
    const result = await toggleLikeArticle(articleId);
    if (result !== null) {
        if (result) currentLikedArticleIds.add(articleId);
        else currentLikedArticleIds.delete(articleId);
        await fetchActiveArticles();
    }
};

// ==========================================
// 5. QUERY SEARCH & CATEGORY CHANNELS
// ==========================================
function setupFilters() {
    const searchInput = document.getElementById('news-search');
    const searchBtn = document.getElementById('news-search-btn');
    const categoryFilter = document.getElementById('news-category-filter');

    const executeFilter = () => {
        const query = searchInput.value.toLowerCase().trim();
        const category = categoryFilter.value;

        let filtered = [...currentArticles];

        if (query) {
            filtered = filtered.filter(item => 
                item.title.toLowerCase().includes(query) ||
                item.content.toLowerCase().includes(query)
            );
        }

        if (category !== 'all') {
            filtered = filtered.filter(item => item.category === category);
        }

        renderNewsGrid(filtered);
    };

    if (searchBtn) searchBtn.addEventListener('click', executeFilter);
    if (categoryFilter) categoryFilter.addEventListener('change', executeFilter);
}

// ==========================================
// 6. DRAWERS & COMPARTMENTS VIEWER
// ==========================================
function setupModals() {
    const openBtn = document.getElementById('open-publish-modal-btn');
    const closeBtn = document.getElementById('close-publish-modal-btn');
    const modal = document.getElementById('publish-news-modal');

    if (openBtn && modal) {
        openBtn.addEventListener('click', () => {
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

async function loadNewsCategories() {
    try {
        const { data, error } = await supabase
            .from('news_categories')
            .select('id, name, icon, display_order, is_active')
            .order('display_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;
        newsCategories = (data || []).filter(Boolean);
        renderNewsCategoryNav();
        populateNewsCategorySelect('news-category');
    } catch (err) {
        console.warn('Unable to load news categories:', err.message || err);
        newsCategories = [];
    }
}

function populateNewsCategorySelect(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const currentValue = selectedValue || select.value || '';
    const visibleCategories = newsCategories.filter((category) => category.is_active !== false);

    const options = visibleCategories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`);
    const selectedCategory = visibleCategories.find((category) => category.name === currentValue);

    select.innerHTML = `<option value="">Select category</option>${options.join('')}`;

    if (selectedCategory) {
        select.value = selectedCategory.name;
    } else if (currentValue) {
        const customOption = document.createElement('option');
        customOption.value = currentValue;
        customOption.textContent = currentValue;
        select.appendChild(customOption);
        select.value = currentValue;
    }
}

// ==========================================
// 7. PUBLISHING PIPELINE UTILITIES
// ==========================================
function setupPostingFlow() {
    const form = document.getElementById('new-article-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('news-title').value.trim();
        const categoryName = document.getElementById('news-category').value.trim();
        const imageFile = document.getElementById('news-image').files[0];
        const content = document.getElementById('news-content').value.trim();

        if (!imageFile) {
            alert('Validation Constraint: Article Cover Image is required.');
            return;
        }

        // Validate image limits using global check
        const validation = validateFile(imageFile, 'marketplace_img');
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Publishing broadcast...';
            submitBtn.disabled = true;

            const isBreaking = document.getElementById('news-breaking').checked;
            const isFeatured = document.getElementById('news-featured').checked;
            const isPinned = document.getElementById('news-pinned').checked;
            const selectedCategory = newsCategories.find((item) => item.name === categoryName);

            // Step 1: Upload cover to marketplace folder bucket
            const uploadedUrl = await storageAPI.uploadFile(imageFile, 'marketplace', 'marketplace_img');

            // Step 2: Insert into news_articles database
            const { error } = await supabase
                .from('news_articles')
                .insert({
                    publisher_id: currentUser.id,
                    title,
                    content,
                    image_url: uploadedUrl,
                    category: categoryName || 'General',
                    category_id: selectedCategory?.id || null,
                    is_breaking: isBreaking,
                    is_featured: isFeatured,
                    is_pinned: isPinned,
                    status: 'published',
                    published_at: new Date().toISOString()
                });

            if (error) throw error;

            alert('Article successfully published and broadcasted live.');
            
            // Re-render
            form.reset();
            const publishNewsModal = document.getElementById('publish-news-modal');
            if (publishNewsModal) {
                publishNewsModal.classList.add('hidden');
                syncModalBodyLock();
            }
            await fetchActiveArticles();

        } catch (err) {
            alert(err.message || 'An unexpected error occurred during submission.');
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Publish Broadcast';
            submitBtn.disabled = false;
        }
    });
}