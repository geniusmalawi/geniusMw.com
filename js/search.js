// =====================================================================
// GENIUS MALAWI - UNIVERSAL SEARCH ENGINE CONTROLLER
// Location: js/search.js
// Purpose: Parses URL parameters, conducts concurrent searches across
//          jobs, marketplace items, directories, and news indices, and
//          queries Msofi AI for strategic search summaries.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Page Splash Screen
    dismissSplashLoader();

    // Ingest URL queries and execute search pipelines
    await executeUniversalSearchEngine();
    setupActiveFormSubmission();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('search-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

// ==========================================
// 2. MASTER ENGINE WORKFLOW EXECUTIVE
// ==========================================
async function executeUniversalSearchEngine() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');

    if (!query) {
        renderEmptyStates('Please enter a search query above.');
        return;
    }

    // Set UI indicators
    document.getElementById('search-query-indicator').textContent = `"${query}"`;
    document.getElementById('active-search-input').value = query;

    // Run parallel search queries across all major platform indices
    await Promise.all([
        queryMsofiAISuggestions(query),
        queryCareersIndex(query),
        queryMarketplaceIndex(query),
        queryCorporateIndex(query),
        queryBroadcastNewsIndex(query)
    ]);
}

function renderEmptyStates(message) {
    document.getElementById('results-ai-suggestion').textContent = message;
    document.getElementById('results-jobs').innerHTML = `<p style="font-size:13px; color:var(--text-muted);">${message}</p>`;
    document.getElementById('results-marketplace').innerHTML = `<p style="font-size:13px; color:var(--text-muted);">${message}</p>`;
    document.getElementById('results-directory').innerHTML = `<p style="font-size:13px; color:var(--text-muted);">${message}</p>`;
    document.getElementById('results-news').innerHTML = `<p style="font-size:13px; color:var(--text-muted);">${message}</p>`;
}

// ==========================================
// 3. SECURE MSOFI AI CONTEXT INSIGHTS
// ==========================================
async function queryMsofiAISuggestions(query) {
    const container = document.getElementById('results-ai-suggestion');
    if (!container) return;

    try {
        const sysPrompt = `Write a highly professional, brief, 1-paragraph summary providing smart advisory search insights, suggestions, and relevance analysis for a user in Malawi searching for: "${query}". Respond cleanly in English with no introduction greetings.`;

        // Invoke the secure edge function directly
        const { data, error } = await supabase.functions.invoke('msofi-ai', {
            body: { message: sysPrompt, mode: 'general' }
        });

        if (error) throw error;
        container.textContent = data.response;

    } catch (err) {
        container.textContent = `Search Summary Exception: Msofi AI engines could not be reached to process search parameters. (${err.message})`;
    }
}

// ==========================================
// 4. CAREER INDEX SEARCH PIPELINES
// ==========================================
async function queryCareersIndex(query) {
    const container = document.getElementById('results-jobs');
    if (!container) return;

    try {
        const { data, error } = await supabase
            .from('jobs')
            .select('id, title, company_name, location')
            .is('deleted_at', null)
            .or(`title.ilike.%${query}%,company_name.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(4);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">No matching career advertisements found.</p>`;
            return;
        }

        container.innerHTML = data.map(item => `
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:14px; color:var(--text-primary); display:block;">${item.title}</strong>
                    <span style="font-size:12px; color:var(--text-muted);">${item.company_name} &bull; ${item.location}</span>
                </div>
                <a href="jobs.html" class="btn-secondary" style="padding:6px 12px; font-size:11px;">View Job</a>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to query careers database index:', err.message);
    }
}

// ==========================================
// 5. MARKETPLACE PRODUCTS SEARCH PIPELINES
// ==========================================
async function queryMarketplaceIndex(query) {
    const container = document.getElementById('results-marketplace');
    if (!container) return;

    try {
        const { data, error } = await supabase
            .from('marketplace_listings')
            .select('id, title, price, category')
            .eq('status', 'approved')
            .is('deleted_at', null)
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(4);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">No matching marketplace items found.</p>`;
            return;
        }

        container.innerHTML = data.map(item => `
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:14px; color:var(--text-primary); display:block;">${item.title}</strong>
                    <span style="font-size:12px; color:var(--gold-base); font-weight:700;">MWK ${parseFloat(item.price).toLocaleString()} &bull; ${item.category}</span>
                </div>
                <a href="marketplace.html" class="btn-secondary" style="padding:6px 12px; font-size:11px;">View Product</a>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to query marketplace listings index:', err.message);
    }
}

// ==========================================
// 6. CORPORATE DIRECTORY SEARCH PIPELINES
// ==========================================
async function queryCorporateIndex(query) {
    const container = document.getElementById('results-directory');
    if (!container) return;

    try {
        const { data, error } = await supabase
            .from('business_pages')
            .select('id, name, category, phone')
            .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(4);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">No matching business directories found.</p>`;
            return;
        }

        container.innerHTML = data.map(item => `
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:14px; color:var(--text-primary); display:block;">${item.name}</strong>
                    <span style="font-size:12px; color:var(--text-muted);">${item.category} &bull; Tel: ${item.phone}</span>
                </div>
                <a href="directory.html" class="btn-secondary" style="padding:6px 12px; font-size:11px;">Open Profile</a>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to query corporate business directories index:', err.message);
    }
}

// ==========================================
// 7. BROADCAST NEWS SEARCH PIPELINES
// ==========================================
async function queryBroadcastNewsIndex(query) {
    const container = document.getElementById('results-news');
    if (!container) return;

    try {
        const { data, error } = await supabase
            .from('news_articles')
            .select('id, title, category')
            .is('deleted_at', null)
            .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
            .limit(4);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `<p style="font-size:13px; color:var(--text-muted);">No matching broadcast news articles found.</p>`;
            return;
        }

        container.innerHTML = data.map(item => `
            <div style="background:rgba(255,255,255,0.01); border:var(--glass-border); padding:12px; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:14px; color:var(--text-primary); display:block;">${item.title}</strong>
                    <span style="font-size:12px; color:var(--text-muted);">${item.category}</span>
                </div>
                <a href="news.html" class="btn-secondary" style="padding:6px 12px; font-size:11px;">Read Article</a>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to query broadcast news index:', err.message);
    }
}

// ==========================================
// 8. ACTIVE PAGE FORM SUBMISSION
// ==========================================
function setupActiveFormSubmission() {
    const form = document.getElementById('active-search-form');
    const input = document.getElementById('active-search-input');

    if (!form || !input) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = input.value.trim();
        if (query.length > 0) {
            // Reload the window passing target parameters
            window.location.href = `search.html?q=${encodeURIComponent(query)}`;
        }
    });
}