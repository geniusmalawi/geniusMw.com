-- =============================================================
-- GENIUS MALAWI - NEWS ARTICLES METADATA COLUMNS
-- =============================================================
-- Purpose: Add the missing metadata columns required by the
-- Super Admin News publishing workflow and ensure the
-- news_articles schema supports the admin-editor payload.
-- =============================================================

alter table public.news_articles
    add column if not exists publisher_id uuid references public.profiles(id) on delete set null,
    add column if not exists subtitle text,
    add column if not exists summary text,
    add column if not exists author text,
    add column if not exists tags text[] default '{}',
    add column if not exists cover_caption text,
    add column if not exists gallery_urls text[] default '{}';
