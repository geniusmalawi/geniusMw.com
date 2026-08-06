// =====================================================================
// GENIUS MALAWI - PREMIUM MEDIA CENTER CONTROLLER
// Location: js/media.js
// Purpose: Orchestrates splash screen dismissal, tab selection routing,
//          loads live TV iframes, manages live radio audio streams,
//          indexes YouTube video galleries, and powers the continuous
//          universal floating audio player for music streams.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase } from './supabase.js';

let activeCategory = 'live-tv';
let playlistQueue = [];
let currentTrackIndex = 0;
let isPlayingState = false;
let footballMatches = [];
let footballRealtimeChannel = null;
const DEFAULT_FOOTBALL_STREAM = 'https://www.youtube.com/embed/live_stream?channel=UC2PCH5V-HlP_fUisO_y056A';

const FALLBACK_FOOTBALL = [
    { id: 'f1', title: 'Malawi Super League Spotlight', home_team: 'Mighty Tigers', away_team: 'Big Bullets', competition: 'Super League', kickoff_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), stream_url: 'https://www.youtube.com/embed/live_stream?channel=UC2PCH5V-HlP_fUisO_y056A', match_summary: 'Live matchday updates, highlights, and fan discussion in one place.' }
];

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Splash Screen
    dismissSplashLoader();

    // 1. Initialize Active Workspace
    await loadMediaTier('live-tv');

    // 2. Bind Event Handlers
    setupTabSwitching();
    setupContinuousAudioPlayer();
    try { setupFootballRealtime(); } catch (err) { console.warn('Football live sync unavailable:', err?.message || err); }
    await loadFootballMatches();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('media-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

// ==========================================
// 2. TAB ROUTING SWITCHERS
// ==========================================
function setupTabSwitching() {
    const tabs = {
        'tab-live-tv': 'live-tv',
        'tab-live-radio': 'live-radio',
        'tab-videos': 'videos',
        'tab-music': 'music',
        'tab-football': 'football'
    };

    Object.keys(tabs).forEach(tabId => {
        const btn = document.getElementById(tabId);
        if (!btn) return;

        btn.addEventListener('click', async () => {
            // Remove active styles from all buttons
            Object.keys(tabs).forEach(id => {
                const target = document.getElementById(id);
                if (target) {
                    target.style.borderColor = 'transparent';
                    target.style.color = 'var(--text-muted)';
                }
            });

            // Activate current selection styling
            btn.style.borderColor = 'var(--gold-base)';
            btn.style.color = 'var(--text-primary)';

            activeCategory = tabs[tabId];
            await loadMediaTier(activeCategory);
        });
    });
}

// ==========================================
// 3. MEDIA VIEWPORT DATA INITIALIZERS
// ==========================================
async function loadMediaTier(category) {
    const grid = document.getElementById('media-viewport-grid');
    const title = document.getElementById('media-viewport-title');
    const badge = document.getElementById('media-viewport-badge');

    if (!grid || !title || !badge) return;

    grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">Syncing channels, please wait...</p>`;

    try {
        if (category === 'live-tv') {
            title.textContent = 'Live Television Streams';
            badge.textContent = 'Live Broadcasts';
            await loadLiveTV();

        } else if (category === 'live-radio') {
            title.textContent = 'Live Radio Broadcasts';
            badge.textContent = 'Live Airwaves';
            await loadLiveRadio();

        } else if (category === 'videos') {
            title.textContent = 'Original Platform Videos';
            badge.textContent = 'Curated Video Clips';
            await loadVideos();

        } else if (category === 'music') {
            title.textContent = 'Music Streaming Services';
            badge.textContent = 'Premium Sound';
            await loadMusic();
        } else if (category === 'football') {
            title.textContent = 'Football Live & Highlights';
            badge.textContent = 'Matchday Central';

            renderFootballGrid(footballMatches);
        }
    } catch (err) {
        console.error('Failed to load media tier details:', err.message);
    }
}

// ==========================================
// 4. RENDERING DRAWERS FOR VARIOUS MEDIA TYPES
// ==========================================
function escapeForHtmlAttribute(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderTVStreamGrid(streams) {
    const grid = document.getElementById('media-viewport-grid');
    if (!grid) return;

    if (!streams || streams.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No live TV channels available.</p>';
        return;
    }

    grid.innerHTML = streams.map(item => `
        <div class="luxury-card" style="padding: 0; display: flex; flex-direction: column; overflow: hidden; height: 100%;">
            <div style="position: relative; aspect-ratio: 16/10; background: #000; overflow: hidden;">
                <img src="${escapeForHtmlAttribute(item.logo_url || item.cover_url || item.thumbnail_url || '')}" alt="" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;">
                <span class="badge badge-verified" style="position: absolute; top: 12px; right: 12px;">Live TV</span>
            </div>
            <div style="padding: 20px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                <h3 style="font-size: 16px; color: var(--text-primary); margin-bottom: 16px;">${escapeForHtmlAttribute(item.name || 'Live TV')}</h3>
                <button class="btn-primary" style="width: 100%; padding: 10px; font-size: 12px;" onclick="window.playVideoIframe('${escapeForHtmlAttribute(item.stream_url || '')}', '${escapeForHtmlAttribute(item.name || 'Live TV')}')">Watch Stream</button>
            </div>
        </div>
    `).join('');
}

function renderRadioStreamGrid(streams) {
    const grid = document.getElementById('media-viewport-grid');
    if (!grid) return;

    if (!streams || streams.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No live radio stations available.</p>';
        return;
    }

    grid.innerHTML = streams.map(item => `
        <div class="luxury-card" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                <div style="width: 48px; height: 48px; border-radius: var(--radius-sm); background: var(--gold-translucent); border: var(--glass-border); display: flex; align-items: center; justify-content: center; font-size: 20px;">📻</div>
                <div>
                    <h3 style="font-size: 15px; color: var(--text-primary);">${escapeForHtmlAttribute(item.name || 'Live Radio')}</h3>
                    <span style="font-size: 11px; color: var(--text-muted);">${escapeForHtmlAttribute(item.genre || item.country || '')}</span>
                </div>
            </div>
            <button class="btn-primary" style="width: 100%; padding: 10px; font-size: 12px;" onclick="window.loadAndPlayAudioTrack('${escapeForHtmlAttribute(item.stream_url || '')}', '${escapeForHtmlAttribute(item.name || 'Live Radio')}', '${escapeForHtmlAttribute(item.genre || '')}', '📻')">Tune In Live</button>
        </div>
    `).join('');
}

function renderVideosGrid(streams) {
    const grid = document.getElementById('media-viewport-grid');
    if (!grid) return;

    if (!streams || streams.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No videos available.</p>';
        return;
    }

    grid.innerHTML = streams.map(item => `
        <div class="luxury-card" style="padding: 0; display: flex; flex-direction: column; overflow: hidden; height: 100%;">
            <div style="position: relative; aspect-ratio: 16/10; background: #000; overflow: hidden;">
                <img src="${escapeForHtmlAttribute(item.thumbnail_url || item.cover_url || '')}" alt="" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;">
                <span class="badge badge-premium" style="position: absolute; top: 12px; right: 12px;">Originals</span>
            </div>
            <div style="padding: 20px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                <h3 style="font-size: 15px; color: var(--text-primary); margin-bottom: 16px;">${escapeForHtmlAttribute(item.title || 'Video')}</h3>
                <button class="btn-primary" style="width: 100%; padding: 10px; font-size: 12px;" onclick="window.playVideoIframe('${escapeForHtmlAttribute(item.video_url || item.youtube_url || item.vimeo_url || '')}', '${escapeForHtmlAttribute(item.title || 'Video')}')">Play Video</button>
            </div>
        </div>
    `).join('');
}

function renderMusicGrid(streams) {
    const grid = document.getElementById('media-viewport-grid');
    if (!grid) return;

    if (!streams || streams.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No music available.</p>';
        playlistQueue = [];
        return;
    }

    playlistQueue = streams;

    grid.innerHTML = streams.map((item, index) => `
        <div class="luxury-card" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                <div style="width: 48px; height: 48px; border-radius: var(--radius-sm); background: var(--gold-translucent); border: var(--glass-border); display: flex; align-items: center; justify-content: center; font-size: 20px;">🎵</div>
                <div>
                    <h3 style="font-size: 15px; color: var(--text-primary);">${escapeForHtmlAttribute(item.title || 'Music')}</h3>
                    <span style="font-size: 11px; color: var(--text-muted);">${escapeForHtmlAttribute(item.artist || item.album || '')}</span>
                </div>
            </div>
            <button class="btn-primary" style="width: 100%; padding: 10px; font-size: 12px;" onclick="window.playQueuedMusicTrack(${index})">Stream Track</button>
        </div>
    `).join('');
}

async function loadLiveTV() {
    try {
        const { data, error } = await supabase
            .from('media_live_tv')
            .select('id, name, logo_url, cover_url, thumbnail_url, stream_url, description, country, status, featured')
            .eq('is_deleted', false)
            .eq('is_archived', false)
            .neq('status', 'offline')
            .order('display_order', { ascending: true, nullsFirst: true });

        if (error) throw error;
        renderTVStreamGrid(data || []);
    } catch (err) {
        console.error('Failed to load live TV channels:', err?.message || err);
        renderTVStreamGrid([]);
    }
}

async function loadLiveRadio() {
    try {
        const { data, error } = await supabase
            .from('media_radio')
            .select('id, name, logo_url, stream_url, country, genre, description, status, featured')
            .eq('is_deleted', false)
            .eq('is_archived', false)
            .neq('status', 'offline')
            .order('display_order', { ascending: true, nullsFirst: true });

        if (error) throw error;
        renderRadioStreamGrid(data || []);
    } catch (err) {
        console.error('Failed to load live radio streams:', err?.message || err);
        renderRadioStreamGrid([]);
    }
}

async function loadVideos() {
    try {
        const { data, error } = await supabase
            .from('media_videos')
            .select('id, title, thumbnail_url, video_url, youtube_url, vimeo_url, description, category, duration, status, featured')
            .eq('is_deleted', false)
            .eq('is_archived', false)
            .eq('status', 'published')
            .order('display_order', { ascending: true, nullsFirst: true });

        if (error) throw error;
        renderVideosGrid(data || []);
    } catch (err) {
        console.error('Failed to load platform videos:', err?.message || err);
        renderVideosGrid([]);
    }
}

async function loadMusic() {
    try {
        const { data, error } = await supabase
            .from('media_music')
            .select('id, title, artist, album, cover_url, audio_url, streaming_url, genre, duration, status, featured')
            .eq('is_deleted', false)
            .eq('is_archived', false)
            .eq('status', 'published')
            .order('display_order', { ascending: true, nullsFirst: true });

        if (error) throw error;
        const musicItems = (data || []).map(item => ({
            ...item,
            url: item.streaming_url || item.audio_url || ''
        }));
        renderMusicGrid(musicItems);
    } catch (err) {
        console.error('Failed to load music stream library:', err?.message || err);
        renderMusicGrid([]);
    }
}

async function loadFootballMatches() {
    try {
        const { data, error } = await supabase
            .from('football_matches')
            .select('id, title, home_team, away_team, competition, stream_url, original_url, embed_url, stream_type, match_summary, status, kickoff_at, created_at, updated_at, team_a_logo_url, team_b_logo_url, thumbnail_url')
            .is('deleted_at', null)
            .order('kickoff_at', { ascending: true, nullsFirst: false });

        if (error) throw error;

        footballMatches = (data || []).filter(Boolean);
        if (activeCategory === 'football') {
            renderFootballGrid(footballMatches);
        }
        return footballMatches;
    } catch (err) {
        console.error('Failed to load football matches:', err?.message || err);
        footballMatches = [];
        if (activeCategory === 'football') {
            renderFootballGrid(footballMatches);
        }
        return footballMatches;
    }
}

// Realtime subscriptions for media changes so user pages update instantly
function setupMediaRealtime() {
    try {
        const tables = ['media_live_tv', 'media_radio', 'media_videos', 'media_music'];
        tables.forEach(table => {
            supabase.channel(`media-${table}-sync`)
                .on('postgres_changes', { event: '*', schema: 'public', table }, async (payload) => {
                    // reload appropriate tier when data changes
                    if (activeCategory === 'live-tv' && table === 'media_live_tv') await loadMediaTier('live-tv');
                    if (activeCategory === 'live-radio' && table === 'media_radio') await loadMediaTier('live-radio');
                    if (activeCategory === 'videos' && table === 'media_videos') await loadMediaTier('videos');
                    if (activeCategory === 'music' && table === 'media_music') await loadMediaTier('music');
                })
                .subscribe();
        });
    } catch (err) {
        console.warn('Media realtime subscription failed', err?.message || err);
    }
}

// Initialize subscriptions
try { setupMediaRealtime(); } catch (e) { }

function setupFootballRealtime() {
    if (footballRealtimeChannel) return;

    footballRealtimeChannel = supabase.channel('football-user-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'football_matches' }, async () => {
            await loadFootballMatches();
        })
        .subscribe((status) => {
            if (status !== 'SUBSCRIBED' && status !== 'TIMED OUT') {
                console.warn('Football live sync status:', status);
            }
        });
}

window.refreshFootballMatches = async () => {
    await loadFootballMatches();
};

function renderFootballGrid(matches) {
    const grid = document.getElementById('media-viewport-grid');
    if (!grid) return;

    if (!matches || matches.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No live football matches available right now.</p>';
        return;
    }

    grid.innerHTML = matches.map(item => {
        const titleText = item.title || `${item.home_team} vs ${item.away_team}`;
        const streamUrl = item.stream_url || DEFAULT_FOOTBALL_STREAM;

        return `
            <div class="luxury-card" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; gap: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="badge badge-premium">${item.competition || 'Football'}</span>
                    <span class="badge badge-verified">${item.status || 'Live'}</span>
                </div>
                <div style="text-align: center;">
                    <h3 style="font-size: 16px; color: var(--text-primary); margin-bottom: 8px;">${item.home_team} vs ${item.away_team}</h3>
                    <p style="font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0;">${item.match_summary || 'Live football coverage and highlights from Malawi.'}</p>
                </div>
                <div style="font-size: 12px; color: var(--text-muted);">Kickoff: ${item.kickoff_at ? new Date(item.kickoff_at).toLocaleString() : 'TBC'}</div>
                <button class="btn-primary" style="width: 100%; padding: 10px; font-size: 12px;" onclick="window.openFootballMatchViewer('${escapeForHtmlAttribute(item.id)}')">Watch Live</button>
            </div>
        `;
    }).join('');
}

// ==========================================
// 5. IFRAME VIDEO LAYOUT POPUP MODALS
// ==========================================
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    const normalizedType = String(streamType || '').trim().toLowerCase();

    if (!trimmedUrl) return '';

    if (normalizedType === 'youtube') {
        return buildYoutubeEmbedUrl(trimmedUrl) || trimmedUrl;
    }

    if (normalizedType === 'vimeo') {
        return buildVimeoEmbedUrl(trimmedUrl) || trimmedUrl;
    }

    return trimmedUrl;
}

function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Unable to load ${src}`));
        document.head.appendChild(script);
    });
}

async function ensureHlsLibrary() {
    if (window.Hls) return window.Hls;

    try {
        await loadExternalScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js');
    } catch (err) {
        console.warn('HLS.js unavailable, using native playback fallback:', err?.message || err);
    }

    return window.Hls || null;
}

window.openFootballMatchViewer = (matchId) => {
    const match = footballMatches.find(item => item.id === matchId);

    if (!match) {
        window.playVideoIframe({
            url: '',
            title: 'Live Stream',
            competition: 'Football',
            matchSummary: 'The selected stream is not available right now.'
        });
        return;
    }

    const sourceUrl = String(match.stream_url || match.original_url || match.embed_url || DEFAULT_FOOTBALL_STREAM || '').trim();
    const detectedStreamType = detectFootballStreamType(sourceUrl);
    const playbackUrl = buildFootballEmbedUrl(sourceUrl, detectedStreamType);

    window.playVideoIframe({
        url: playbackUrl || sourceUrl || DEFAULT_FOOTBALL_STREAM,
        title: match.title || `${match.home_team} vs ${match.away_team}`,
        competition: match.competition || 'Football',
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        status: match.status || 'Live',
        kickoffAt: match.kickoff_at,
        thumbnailUrl: match.thumbnail_url,
        homeLogoUrl: match.team_a_logo_url,
        awayLogoUrl: match.team_b_logo_url,
        matchSummary: match.match_summary,
        streamType: detectedStreamType
    });
};

window.playVideoIframe = (payload, title) => {
    const viewerPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : { url: payload || '', title: title || 'Live Stream' };

    const normalizedUrl = String(viewerPayload.url || '').trim();
    const viewerTitle = viewerPayload.title || 'Live Stream';
    const detectedStreamType = detectFootballStreamType(normalizedUrl);
    const streamType = String(viewerPayload.streamType || detectedStreamType || 'external').toLowerCase();

    if (!normalizedUrl) {
        const errorMessage = 'The stream URL is not available yet. Please try again after the admin publishes a valid stream.';
        const errorViewport = document.createElement('div');
        errorViewport.className = 'splash-screen';
        errorViewport.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(5,5,5,0.96); backdrop-filter:blur(15px); z-index:10000; overflow-y:auto; padding:24px 16px; display:flex; align-items:center; justify-content:center;';
        errorViewport.innerHTML = `<div class="luxury-card" style="width:100%; max-width:560px; padding:24px; text-align:center;">
            <h3 style="font-size:18px; color:var(--text-primary); margin-bottom:8px;">Stream not available</h3>
            <p style="font-size:13px; color:var(--text-muted); line-height:1.6; margin:0;">${escapeHtml(errorMessage)}</p>
        </div>`;
        document.body.appendChild(errorViewport);
        errorViewport.addEventListener('click', () => errorViewport.remove());
        return;
    }

    const viewport = document.createElement('div');
    viewport.className = 'splash-screen';
    viewport.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(5,5,5,0.96); backdrop-filter:blur(15px); z-index:10000; overflow-y:auto; padding:24px 16px; display:flex; align-items:center; justify-content:center;';

    const container = document.createElement('div');
    container.className = 'luxury-card';
    container.style.cssText = 'width:100%; max-width:1100px; padding:24px; position:relative; border:var(--glass-border);';

    const matchStatus = viewerPayload.status || 'Live';
    const matchCompetition = viewerPayload.competition || 'Football';
    const kickerText = viewerPayload.kickoffAt ? new Date(viewerPayload.kickoffAt).toLocaleString() : 'TBC';
    const thumbnailUrl = viewerPayload.thumbnailUrl || viewerPayload.imageUrl || '';

    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
            <div>
                <strong style="font-size:15px; color:var(--text-primary); display:block;">${escapeHtml(viewerTitle)}</strong>
                <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">${escapeHtml(matchCompetition)} • ${escapeHtml(matchStatus)} • Kickoff: ${escapeHtml(kickerText)}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button id="fullscreen-video-btn" class="btn-secondary" style="padding:8px 12px; font-size:11px;">Full Screen</button>
                <button id="refresh-video-btn" class="btn-secondary" style="padding:8px 12px; font-size:11px;">Refresh</button>
                <button id="share-video-btn" class="btn-secondary" style="padding:8px 12px; font-size:11px;">Share</button>
                <button id="report-video-btn" class="btn-secondary" style="padding:8px 12px; font-size:11px;">Report Stream</button>
                <button id="close-video-viewport" class="btn-secondary" style="padding:8px 12px; font-size:11px;">Close</button>
            </div>
        </div>
        <div style="display:grid; gap:16px; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); align-items:start;">
            <div>
                <div id="stream-player-panel" style="position:relative; border-radius:var(--radius-lg); overflow:hidden; border:var(--glass-border); background:#000; min-height:340px; display:flex; align-items:center; justify-content:center;">
                    <div id="stream-loading-state" style="color:#fff; text-align:center; padding:24px;">
                        <div style="font-size:14px; margin-bottom:8px;">Preparing the live stream…</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.7);">The stream will appear here as soon as it is ready.</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
                ${thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="" style="width:100%; border-radius:var(--radius-md); object-fit:cover; max-height:180px;">` : ''}
                <div style="padding:16px; border-radius:var(--radius-md); background:rgba(255,255,255,0.03); border:var(--glass-border);">
                    <strong style="display:block; font-size:14px; color:var(--text-primary); margin-bottom:8px;">${escapeHtml(viewerPayload.homeTeam || viewerPayload.home_team || 'Home Team')} vs ${escapeHtml(viewerPayload.awayTeam || viewerPayload.away_team || 'Away Team')}</strong>
                    <div style="font-size:12px; color:var(--text-muted); line-height:1.6;">${escapeHtml(viewerPayload.matchSummary || viewerPayload.match_summary || 'Live football coverage and highlights from Malawi.')}</div>
                </div>
                <div id="stream-state-message" style="padding:14px 16px; border-radius:var(--radius-md); background:rgba(255,255,255,0.03); border:var(--glass-border); font-size:12px; color:var(--text-muted); line-height:1.6;"></div>
            </div>
        </div>
    `;

    viewport.appendChild(container);
    document.body.appendChild(viewport);

    const playerPanel = document.getElementById('stream-player-panel');
    const loadingState = document.getElementById('stream-loading-state');
    const stateMessage = document.getElementById('stream-state-message');

    const showFallback = (message, autoOpen = false) => {
        if (!playerPanel) return;

        playerPanel.innerHTML = `
            <div style="text-align:center; color:#fff; padding:24px; max-width:420px;">
                <div style="font-size:16px; font-weight:700; margin-bottom:8px;">Stream not available</div>
                <div style="font-size:13px; color:rgba(255,255,255,0.78); line-height:1.6; margin-bottom:14px;">${escapeHtml(message)}</div>
            </div>
        `;
        if (stateMessage) {
            stateMessage.innerHTML = `<strong style="display:block; color:var(--text-primary); margin-bottom:6px;">Playback notice</strong>${escapeHtml(message)}`;
        }

        if (autoOpen) {
            window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const renderEmbeddedStream = async () => {
        if (!playerPanel) return;

        const effectiveStreamType = String(streamType || detectedStreamType || 'external').toLowerCase();
        const isEmbedCapable = /youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|soundcloud\.com|spotify\.com|mp4|m3u8|hls/i.test(normalizedUrl);
        const isYoutube = effectiveStreamType === 'youtube' || /youtube\.com|youtu\.be/i.test(normalizedUrl);
        const isVimeo = effectiveStreamType === 'vimeo' || /vimeo\.com|player\.vimeo\.com/i.test(normalizedUrl);
        const isHls = effectiveStreamType === 'hls' || /\.m3u8|hls/i.test(normalizedUrl);
        const isMp4 = effectiveStreamType === 'mp4' || effectiveStreamType === 'webm' || /\.mp4|\.webm/i.test(normalizedUrl);

        if (!isEmbedCapable) {
            const iframe = document.createElement('iframe');
            iframe.src = normalizedUrl;
            iframe.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0;';
            iframe.allow = 'autoplay; fullscreen; picture-in-picture';
            iframe.allowFullscreen = true;
            iframe.loading = 'eager';
            playerPanel.innerHTML = '';
            playerPanel.style.padding = '0';
            playerPanel.appendChild(iframe);

            const fallbackTimer = setTimeout(() => {
                if (stateMessage) {
                    stateMessage.innerHTML = '<strong style="display:block; color:var(--text-primary); margin-bottom:6px;">Playback notice</strong>This stream is opening in a new tab because it could not be embedded securely in the app.';
                }
                showFallback('This stream is opening in a new tab because it could not be embedded securely in the app.', true);
            }, 2500);

            iframe.addEventListener('load', () => {
                clearTimeout(fallbackTimer);
                if (loadingState) loadingState.remove();
                if (stateMessage) {
                    stateMessage.innerHTML = '<strong style="display:block; color:var(--text-primary); margin-bottom:6px;">External stream ready</strong>The stream is loading inside Genius Malawi.';
                }
            }, { once: true });
            return;
        }

        if (isYoutube || isVimeo) {
            const iframe = document.createElement('iframe');
            iframe.src = buildFootballEmbedUrl(normalizedUrl, effectiveStreamType) || normalizedUrl;
            iframe.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0;';
            iframe.allow = 'autoplay; fullscreen; picture-in-picture';
            iframe.allowFullscreen = true;
            iframe.loading = 'eager';
            playerPanel.innerHTML = '';
            playerPanel.style.padding = '0';
            playerPanel.appendChild(iframe);

            let fallbackHandled = false;
            const resolvePlayback = () => {
                if (fallbackHandled) return;
                fallbackHandled = true;
                clearTimeout(fallbackTimer);
                if (loadingState) loadingState.remove();
                if (stateMessage) {
                    stateMessage.innerHTML = '<strong style="display:block; color:var(--text-primary); margin-bottom:6px;">Live stream ready</strong>The stream is now loading inside Genius Malawi.';
                }
            };

            const fallbackTimer = setTimeout(() => {
                if (fallbackHandled) return;
                fallbackHandled = true;
                if (stateMessage) {
                    stateMessage.innerHTML = '<strong style="display:block; color:var(--text-primary); margin-bottom:6px;">Playback notice</strong>This stream is opening in a new tab so you can continue watching without interruption.';
                }
                showFallback('This stream is opening in a new tab because it could not be embedded securely in the app.', true);
            }, 2500);

            iframe.addEventListener('load', () => {
                resolvePlayback();
            });

            iframe.addEventListener('error', () => {
                if (fallbackHandled) return;
                fallbackHandled = true;
                clearTimeout(fallbackTimer);
                showFallback('The stream is offline or could not be embedded by the provider.', true);
            });
            return;
        }

        if (isHls) {
            const video = document.createElement('video');
            video.controls = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; background:#000;';
            playerPanel.innerHTML = '';
            playerPanel.style.padding = '0';
            playerPanel.appendChild(video);

            try {
                const hlsLib = await ensureHlsLibrary();
                if (hlsLib && hlsLib.isSupported()) {
                    const hls = new hlsLib({ startPosition: -1, enableWorker: false });
                    hls.loadSource(normalizedUrl);
                    hls.attachMedia(video);
                    hls.on(hlsLib.Events.ERROR, (_event, data) => {
                        if (data.fatal) {
                            showFallback('This HLS stream could not be played inside the app. Please try again shortly.', true);
                        }
                    });
                } else {
                    video.src = normalizedUrl;
                    video.type = 'application/vnd.apple.mpegurl';
                }
            } catch (err) {
                showFallback('This HLS stream could not be played inside the app. Please try again shortly.', true);
                return;
            }

            const handleVideoReady = () => {
                if (loadingState) loadingState.remove();
                if (stateMessage) {
                    stateMessage.innerHTML = '<strong style="display:block; color:var(--text-primary); margin-bottom:6px;">Native playback ready</strong>This stream is playing directly inside the app.';
                }
            };

            video.addEventListener('loadeddata', handleVideoReady, { once: true });
            video.addEventListener('canplay', handleVideoReady, { once: true });
            video.addEventListener('error', () => {
                showFallback('This stream could not be loaded. Please try again shortly.', true);
            }, { once: true });
            return;
        }

        if (isMp4) {
            const video = document.createElement('video');
            video.src = normalizedUrl;
            video.controls = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; background:#000;';
            playerPanel.innerHTML = '';
            playerPanel.style.padding = '0';
            playerPanel.appendChild(video);

            video.addEventListener('loadeddata', () => {
                if (loadingState) loadingState.remove();
                if (stateMessage) {
                    stateMessage.innerHTML = '<strong style="display:block; color:var(--text-primary); margin-bottom:6px;">Native playback ready</strong>This stream is playing directly inside the app.';
                }
            }, { once: true });
            video.addEventListener('error', () => {
                showFallback('This stream could not be loaded. Please try again shortly.', true);
            }, { once: true });
            return;
        }

        showFallback('This stream provider does not allow in-app playback.', true);
    };

    renderEmbeddedStream();

    const closeButton = document.getElementById('close-video-viewport');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            viewport.remove();
        });
    }

    const refreshButton = document.getElementById('refresh-video-btn');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            renderEmbeddedStream();
        });
    }

    const fullscreenButton = document.getElementById('fullscreen-video-btn');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', async () => {
            try {
                if (!document.fullscreenElement) {
                    await container.requestFullscreen();
                } else {
                    await document.exitFullscreen();
                }
            } catch (err) {
                console.warn('Fullscreen unavailable:', err?.message || err);
            }
        });
    }

    const shareButton = document.getElementById('share-video-btn');
    if (shareButton) {
        shareButton.addEventListener('click', async () => {
            const shareText = `${viewerTitle} • ${matchCompetition} • ${matchStatus}`;
            if (navigator.share) {
                try {
                    await navigator.share({ title: viewerTitle, text: shareText, url: normalizedUrl });
                    return;
                } catch (err) {
                    console.warn('Share cancelled:', err?.message || err);
                }
            }

            try {
                await navigator.clipboard.writeText(`${shareText}\n${normalizedUrl}`);
                alert('Stream link copied to clipboard.');
            } catch (err) {
                alert('Sharing is unavailable in this browser.');
            }
        });
    }

    const reportButton = document.getElementById('report-video-btn');
    if (reportButton) {
        reportButton.addEventListener('click', () => {
            alert('Thanks for reporting. The stream will be reviewed and updated if needed.');
        });
    }
};

// ==========================================
// 6. CONTINUOUS FLOATING AUDIO PLAYER DRIVERS
// ==========================================
function setupContinuousAudioPlayer() {
    const audio = document.getElementById('core-audio-element');
    const playBtn = document.getElementById('player-play-btn');
    const progressBar = document.getElementById('player-progress-bar');
    const volumeBar = document.getElementById('player-volume-bar');

    const prevBtn = document.getElementById('player-prev-btn');
    const nextBtn = document.getElementById('player-next-btn');

    if (!audio || !playBtn || !progressBar || !volumeBar) return;

    // Toggle Play/Pause states
    playBtn.addEventListener('click', () => {
        if (!audio.src) return;

        if (isPlayingState) {
            audio.pause();
            playBtn.textContent = '▶';
            isPlayingState = false;
        } else {
            audio.play().catch(err => console.warn('Stream play warning:', err.message));
            playBtn.textContent = '⏸';
            isPlayingState = true;
        }
    });

    // Audio Element time triggers
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        
        // Progress percent update
        const percent = (audio.currentTime / audio.duration) * 100;
        progressBar.value = percent;

        // Render readable times
        document.getElementById('player-current-time').textContent = formatSecondsReadable(audio.currentTime);
        document.getElementById('player-total-time').textContent = formatSecondsReadable(audio.duration);
    });

    // Seek scrub triggers
    progressBar.addEventListener('change', () => {
        if (!audio.duration) return;
        audio.currentTime = (progressBar.value / 100) * audio.duration;
    });

    // Volume bar triggers
    volumeBar.addEventListener('input', () => {
        audio.volume = volumeBar.value;
    });

    // Queue Navigation binds
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (playlistQueue.length === 0) return;
            currentTrackIndex = (currentTrackIndex - 1 + playlistQueue.length) % playlistQueue.length;
            window.playQueuedMusicTrack(currentTrackIndex);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (playlistQueue.length === 0) return;
            currentTrackIndex = (currentTrackIndex + 1) % playlistQueue.length;
            window.playQueuedMusicTrack(currentTrackIndex);
        });
    }
}

// Global invocation hook to feed any audio URL to continuous player
window.loadAndPlayAudioTrack = (url, title, artist, avatar) => {
    const player = document.getElementById('floating-media-player');
    const audio = document.getElementById('core-audio-element');
    const playBtn = document.getElementById('player-play-btn');

    if (!player || !audio || !playBtn) return;

    // Reveal floating panel
    player.style.display = 'flex';

    // Set Audio context
    audio.src = url;
    audio.load();

    // Set layout details
    document.getElementById('player-title').textContent = title;
    document.getElementById('player-artist').textContent = artist;
    document.getElementById('player-avatar').textContent = avatar;

    // Trigger Playback
    audio.play()
        .then(() => {
            playBtn.textContent = '⏸';
            isPlayingState = true;
        })
        .catch(err => {
            console.warn('Audio Autoplay policy constraint:', err.message);
            playBtn.textContent = '▶';
            isPlayingState = false;
        });
};

window.playQueuedMusicTrack = (index) => {
    if (!playlistQueue[index]) return;
    currentTrackIndex = index;
    const track = playlistQueue[index];
    window.loadAndPlayAudioTrack(track.url, track.title, track.artist, '🎵');
};

function formatSecondsReadable(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}