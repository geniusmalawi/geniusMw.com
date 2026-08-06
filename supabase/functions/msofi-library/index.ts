// =====================================================================
// GENIUS MALAWI - MSOFI LIBRARY GATEWAY
// Location: supabase/functions/msofi-library/index.ts
// Purpose: Connects Msofi AI to the public MEBV Library page and returns
//          structured book results with thumbnails and download links.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MEBV_SUPABASE_URL = Deno.env.get("MEBV_SUPABASE_URL") || "";
const MEBV_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("MEBV_SUPABASE_SERVICE_ROLE_KEY") || "";
const mebvClient = createClient(
  MEBV_SUPABASE_URL,
  MEBV_SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://geniusmalawi.com',
  'https://www.geniusmalawi.com'
]);

function getCorsHeaders(origin: string | null) {
  const requestOrigin = typeof origin === 'string' ? origin : '';
  const isAllowedOrigin = requestOrigin && (
    ALLOWED_ORIGINS.has(requestOrigin) ||
    requestOrigin.includes('geniusmalawi.com') ||
    requestOrigin.includes('127.0.0.1') ||
    requestOrigin.includes('localhost')
  );

  return {
    'Access-Control-Allow-Origin': isAllowedOrigin ? requestOrigin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function buildJsonResponse(payload: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json'
    }
  });
}

function normalizeCategory(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return 'Library';
  const lowered = value.toLowerCase();
  if (lowered.includes('past')) return 'Past Papers';
  if (lowered.includes('nursing')) return 'Nursing';
  if (lowered.includes('novel')) return 'Novels';
  if (lowered.includes('primary')) return 'Primary Books';
  if (lowered.includes('msce')) return 'MSCE';
  if (lowered.includes('jce')) return 'JCE';
  if (lowered.includes('primary')) return 'Primary Books';
  return value;
}

function normalizeSearchText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(value: string) {
  return normalizeSearchText(value)
    .split(' ')
    .filter(Boolean)
    .filter((word) => word.length > 1);
}

function buildSearchText(record: Record<string, unknown>) {
  const title = String(record.title || record.name || '').trim();
  const description = String(record.description || '').trim();
  const category = String(record.category || record.subject || '').trim();
  const subject = String(record.subject || '').trim();
  const className = String(record.class || record.form || record.level || '').trim();

  return [title, description, category, subject, className].join(' ');
}

function scoreMatch(record: Record<string, unknown>, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedText = normalizeSearchText(buildSearchText(record));
  const queryTerms = extractKeywords(normalizedQuery);
  const textTerms = extractKeywords(normalizedText);

  if (!normalizedQuery) return 0;

  let score = 0;
  if (normalizedText.includes(normalizedQuery)) score += 20;

  for (const term of queryTerms) {
    if (normalizedText.includes(term)) score += 8;
    if (textTerms.includes(term)) score += 6;
  }

  for (const term of queryTerms) {
    if (term.length >= 3) {
      const prefixMatches = textTerms.filter((item) => item.startsWith(term) || term.startsWith(item));
      score += prefixMatches.length * 2;
    }
  }

  if (queryTerms.length > 1) {
    const matchedTerms = queryTerms.filter((term) => normalizedText.includes(term));
    score += matchedTerms.length * 3;
  }

  const synonyms = {
    bio: ['biology'],
    biology: ['bio'],
    form: ['forms', 'form4', 'form4s', 'f4', 'four'],
    four: ['4', 'f4', 'form4']
  };

  for (const [key, aliases] of Object.entries(synonyms)) {
    if (queryTerms.includes(key) && aliases.some((alias) => normalizedText.includes(alias))) {
      score += 4;
    }
  }

  return score;
}

function normalizeBookRecord(record: Record<string, unknown>) {
  const title = String(record.title || record.name || 'Untitled resource').trim();
  const category = normalizeCategory(String(record.category || record.subject || 'Library').trim());
  const description = String(record.description || 'Downloadable educational resource').trim();
  const thumbnail = String(record.cover_url || record.thumbnail || record.image_url || '').trim();
  const downloadUrl = String(record.download_url || record.file_url || record.url || '').trim();
  const fileSize = String(record.file_size || record.size || '').trim();
  const downloadsCount = record.downloads_count ? String(record.downloads_count) : '';

  return {
    title,
    category,
    description,
    thumbnail,
    file_size: fileSize || downloadsCount || 'Not listed',
    download_url: downloadUrl,
    source: 'Supabase books catalog'
  };
}

async function verifyBooksTableAccess() {
  try {
    const { data, error } = await mebvClient
      .from('books')
      .select('id,title')
      .limit(5);

    const payload = (data as Array<Record<string, unknown>> | null) || [];
    const firstFiveTitles = payload.map((item) => String(item.title || '').trim()).filter(Boolean).slice(0, 5);

    if (error) {
      return {
        ok: false,
        reachedSupabase: true,
        status: 500,
        totalRowsReturned: payload.length,
        firstFiveTitles,
        error: {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        },
        reason: error.message
      };
    }

    return {
      ok: true,
      reachedSupabase: true,
      status: 200,
      totalRowsReturned: payload.length,
      firstFiveTitles,
      error: null,
      reason: null
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reachedSupabase: false,
      status: 500,
      totalRowsReturned: 0,
      firstFiveTitles: [],
      error: {
        message: errorMessage,
        details: null,
        hint: null,
        code: null
      },
      reason: `MEBV books verification threw: ${errorMessage}`
    };
  }
}

async function fetchBooksFromCatalog(query: string) {
  const { data, error } = await mebvClient
    .from('books')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(`MEBV Supabase catalog request failed: ${error.message}`);
  }

  const payload = (data as Array<Record<string, unknown>> | null) || [];
  const normalized = payload.map((record) => ({
    ...normalizeBookRecord(record),
    searchText: buildSearchText(record)
  }));

  const scored = normalized
    .map((item) => ({ ...item, score: scoreMatch(item as Record<string, unknown>, query) }))
    .filter((item) => item.score > 0 || !query)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);
}

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: getCorsHeaders(origin)
    });
  }

  if (req.method !== 'POST') {
    return buildJsonResponse({ success: false, error: 'Method not allowed.' }, 200, origin);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query || body.message || '').trim();
    const category = String(body.category || 'library').trim();

    if (!query) {
      return buildJsonResponse({ success: false, results: [], error: 'No search query supplied.' }, 200, origin);
    }

    const urlConfigured = Boolean(MEBV_SUPABASE_URL);
    const serviceRoleConfigured = Boolean(MEBV_SUPABASE_SERVICE_ROLE_KEY);

    console.log(JSON.stringify({
      event: 'msofi-library-request',
      query,
      category,
      source: 'mebv_supabase_catalog',
      urlConfigured,
      serviceRoleConfigured
    }));

    if (!urlConfigured || !serviceRoleConfigured) {
      return buildJsonResponse({
        success: false,
        results: [],
        source: 'mebv_supabase_catalog',
        category,
        query,
        error: 'Edge Function secrets are not configured.'
      }, 200, origin);
    }

    const verification = await verifyBooksTableAccess();
    console.log(JSON.stringify({
      event: 'msofi-library-table-verification',
      connectedProjectUrl: MEBV_SUPABASE_URL,
      reachedSupabase: verification.reachedSupabase,
      totalRowsReturned: verification.totalRowsReturned,
      firstFiveTitles: verification.firstFiveTitles,
      searchKeyword: query,
      error: verification.error,
      reason: verification.reason
    }));

    if (!verification.ok || verification.totalRowsReturned === 0) {
      return buildJsonResponse({
        success: false,
        results: [],
        source: 'mebv_supabase_catalog',
        category,
        query,
        verification,
        error: verification.reason || 'No rows returned from public.books'
      }, 200, origin);
    }

    const results = await fetchBooksFromCatalog(query);

    console.log(JSON.stringify({
      event: 'msofi-library-response',
      searchKeyword: query,
      connectedProjectUrl: MEBV_SUPABASE_URL,
      reachedSupabase: verification.reachedSupabase,
      totalRowsReturned: verification.totalRowsReturned,
      firstFiveTitles: verification.firstFiveTitles,
      matchedBooksCount: results.length,
      matchedBooks: results.map((item) => ({ title: item.title, category: item.category }))
    }));

    return buildJsonResponse({
      success: true,
      results,
      source: 'mebv_supabase_catalog',
      category,
      query,
      verification,
      totalBooksReturned: results.length
    }, 200, origin);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return buildJsonResponse({ success: false, results: [], error: errorMessage }, 200, origin);
  }
});
