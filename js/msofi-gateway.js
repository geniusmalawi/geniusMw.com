// =====================================================================
// GENIUS MALAWI - MSOFI AI GATEWAY
// Location: js/msofi-gateway.js
// Purpose: Provides a modular tool layer for Msofi AI so the assistant
//          can route library-style requests to the MEBV platform instead
//          of relying on the model's internal memory.
// =====================================================================

import { supabase } from './supabase.js';

const DEFAULT_MEBV_ENDPOINTS = [
    'https://mebv-education-app-mw-malawi.pages.dev/api/search',
    'https://mebv-education-app-mw-malawi.pages.dev/api/library/search',
    'https://mebv-education-app-mw-malawi.pages.dev/api/books'
];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildSearchQuery(message) {
    return String(message || '').replace(/\s+/g, ' ').trim();
}

function detectLibraryIntent(message) {
    const text = String(message || '').toLowerCase();
    if (!text) return { isLibraryRequest: false, reason: 'empty' };

    const hasLibrarySignals = /book|books|textbook|textbooks|pdf|past paper|past papers|novel|novels|nursing|primary|jce|msce|form 4|form 3|form 2|form 1|download|study guide|revision|syllabus/i.test(text);
    if (!hasLibrarySignals) return { isLibraryRequest: false, reason: 'no-signal' };

    if (/(past paper|past papers|exam paper|exam papers|jce|msce|form 4|form 3|form 2|form 1)/i.test(text)) {
        return { isLibraryRequest: true, category: 'past-papers', query: buildSearchQuery(message) };
    }

    if (/(nursing|pharmacology|nurse|medical book|nursing book)/i.test(text)) {
        return { isLibraryRequest: true, category: 'nursing-books', query: buildSearchQuery(message) };
    }

    if (/(novel|novels)/i.test(text)) {
        return { isLibraryRequest: true, category: 'novels', query: buildSearchQuery(message) };
    }

    if (/(primary|std|standard|junior)/i.test(text)) {
        return { isLibraryRequest: true, category: 'primary-books', query: buildSearchQuery(message) };
    }

    if (/(pdf|educational pdf|download)/i.test(text)) {
        return { isLibraryRequest: true, category: 'educational-pdfs', query: buildSearchQuery(message) };
    }

    if (/(book|books|textbook|textbooks)/i.test(text)) {
        return { isLibraryRequest: true, category: 'books', query: buildSearchQuery(message) };
    }

    return { isLibraryRequest: false, reason: 'unclear' };
}

function normalizeMebvResult(item) {
    const record = item || {};
    const title = record.title || record.name || record.book_title || record.bookName || 'Untitled resource';
    const description = record.description || record.summary || record.about || record.notes || '';
    const category = record.category || record.subject || record.type || 'Library';
    const thumbnail = record.thumbnail || record.image_url || record.cover_url || record.image || '';
    const fileSize = record.file_size || record.size || record.fileSize || record.bytes || '';
    const downloadUrl = record.download_url || record.downloadUrl || record.url || record.file_url || record.fileUrl || '';
    const externalUrl = record.external_url || record.externalUrl || record.source_url || record.sourceUrl || '';

    const resolvedDownloadUrl = typeof downloadUrl === 'string' && downloadUrl.startsWith('http')
        ? downloadUrl
        : (typeof externalUrl === 'string' && externalUrl.startsWith('http') ? externalUrl : '');

    return {
        id: record.id || `${title}-${Math.random().toString(36).slice(2, 8)}`,
        title: String(title),
        category: String(category),
        description: String(description),
        thumbnail: String(thumbnail || ''),
        file_size: String(fileSize || ''),
        download_url: resolvedDownloadUrl,
        source: record.source || 'MEBV Library'
    };
}

function normalizeMebvPayload(payload) {
    if (Array.isArray(payload)) return payload.map(normalizeMebvResult);
    if (payload && typeof payload === 'object') {
        const candidates = [payload.results, payload.data, payload.items, payload.books, payload.documents, payload.resources];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate.map(normalizeMebvResult);
        }
        if (payload.search && Array.isArray(payload.search.results)) {
            return payload.search.results.map(normalizeMebvResult);
        }
    }
    return [];
}

async function searchMebvLibrary(query, context = {}) {
    const normalizedQuery = buildSearchQuery(query || context.query || '');
    if (!normalizedQuery) {
        return { ok: false, results: [], error: 'No search query provided.' };
    }

    try {
        const { data, error } = await supabase.functions.invoke('msofi-library', {
            body: {
                query: normalizedQuery,
                category: context.category || 'library'
            }
        });

        if (!error && data?.success && Array.isArray(data.results)) {
            return { ok: true, results: data.results, query: normalizedQuery, source: data.source || 'msofi_library_function' };
        }

        if (error) {
            console.warn('Msofi library function error:', error.message || error);
        }
    } catch (err) {
        console.warn('Msofi library function lookup failed:', err?.message || err);
    }

    const endpoints = [context.endpoint, ...DEFAULT_MEBV_ENDPOINTS].filter(Boolean);
    const uniqueEndpoints = [...new Set(endpoints)];

    for (const endpoint of uniqueEndpoints) {
        try {
            const url = new URL(endpoint);
            url.searchParams.set('q', normalizedQuery);
            url.searchParams.set('query', normalizedQuery);
            url.searchParams.set('search', normalizedQuery);
            url.searchParams.set('kind', context.category || 'library');

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: { Accept: 'application/json' }
            });

            if (!response.ok) continue;

            const payload = await response.json().catch(() => null);
            const results = normalizeMebvPayload(payload);
            if (results.length) {
                return { ok: true, results, query: normalizedQuery, source: 'mebv_api_fallback' };
            }
        } catch (err) {
            console.warn('MEBV gateway lookup failed for endpoint:', endpoint, err?.message || err);
        }
    }

    return { ok: false, results: [], error: 'No matching book was found in the MEBV Library.' };
}

function renderLibraryResultsHtml(results, query) {
    if (!Array.isArray(results) || !results.length) {
        return 'No matching book was found in the MEBV Library.';
    }

    const header = `<div style="font-size:12px; color:var(--gold-base); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:10px;">MEBV Library • ${escapeHtml(query || 'library search')}</div>`;
    const cards = results.slice(0, 6).map((item) => {
        const thumbnail = item.thumbnail ? `<img src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(item.title)}" style="width:100%; max-height:160px; object-fit:cover; border-radius:var(--radius-md); margin-bottom:10px;">` : '';
        const sizeText = item.file_size ? `<div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">File size: ${escapeHtml(item.file_size)}</div>` : '';
        const action = item.download_url
            ? `<button type="button" data-book-download-url="${escapeHtml(item.download_url)}" data-book-download-name="${escapeHtml(item.title || 'book')}" class="btn-primary" style="display:inline-block; padding:8px 12px; font-size:12px; text-decoration:none; border:none; cursor:pointer;">Download</button>`
            : '<span style="font-size:12px; color:var(--text-muted);">Download not available yet</span>';

        return `
            <div style="margin-top:10px; padding:12px; border:1px solid rgba(212,175,55,0.18); border-radius:var(--radius-md); background:rgba(255,255,255,0.03);">
                ${thumbnail}
                <div style="font-size:11px; color:var(--gold-base); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${escapeHtml(item.category || 'Library item')}</div>
                <div style="font-size:14px; color:var(--text-primary); font-weight:600; margin-bottom:6px;">${escapeHtml(item.title)}</div>
                <div style="font-size:12px; color:var(--text-secondary); line-height:1.5; margin-bottom:8px;">${escapeHtml(item.description || 'No description provided by the library catalogue.')}</div>
                ${sizeText}
                <div>${action}</div>
            </div>
        `;
    }).join('');

    return `${header}${cards}`;
}

export {
    detectLibraryIntent,
    searchMebvLibrary,
    renderLibraryResultsHtml,
    escapeHtml
};

export default {
    detectLibraryIntent,
    searchMebvLibrary,
    renderLibraryResultsHtml,
    escapeHtml
};
