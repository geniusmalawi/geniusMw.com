-- =============================================================
-- GENIUS MALAWI - MEDIA, NEWS & FOOTBALL CONTENT COMPATIBILITY
-- =============================================================
-- Purpose: Adds compatibility-safe tables and columns for news and
-- football content so the media/news experience remains functional
-- without breaking the existing app.
-- =============================================================

create extension if not exists pgcrypto;

create table if not exists public.news_articles (
    id uuid primary key default gen_random_uuid(),
    publisher_id uuid references public.profiles(id) on delete set null,
    title text not null,
    content text not null,
    image_url text,
    category text not null default 'General',
    subtitle text,
    summary text,
    source_name text,
    author text,
    tags text[] default '{}',
    cover_caption text,
    gallery_urls text[] default '{}',
    status text not null default 'draft',
    is_breaking boolean not null default false,
    is_featured boolean not null default false,
    is_pinned boolean not null default false,
    views_count integer not null default 0,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    published_at timestamptz
);

create table if not exists public.football_matches (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    home_team text not null,
    away_team text not null,
    competition text default 'Malawi Football',
    kickoff_at timestamptz,
    stream_url text,
    match_summary text,
    image_url text,
    status text not null default 'scheduled',
    is_featured boolean not null default false,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.news_articles
    add column if not exists subtitle text,
    add column if not exists summary text,
    add column if not exists source_name text,
    add column if not exists author text,
    add column if not exists tags text[] default '{}',
    add column if not exists cover_caption text,
    add column if not exists gallery_urls text[] default '{}',
    add column if not exists status text default 'draft',
    add column if not exists is_breaking boolean default false,
    add column if not exists is_featured boolean default false,
    add column if not exists is_pinned boolean default false,
    add column if not exists views_count integer default 0,
    add column if not exists published_at timestamptz;

alter table public.football_matches
    add column if not exists stream_url text,
    add column if not exists original_url text,
    add column if not exists embed_url text,
    add column if not exists stream_type text default 'youtube',
    add column if not exists match_summary text,
    add column if not exists image_url text,
    add column if not exists team_a_logo_url text,
    add column if not exists team_b_logo_url text,
    add column if not exists thumbnail_url text,
    add column if not exists status text default 'scheduled',
    add column if not exists ended_at timestamptz,
    add column if not exists is_draft boolean default false,
    add column if not exists is_featured boolean default false;

create index if not exists idx_news_articles_category on public.news_articles(category);
create index if not exists idx_news_articles_status on public.news_articles(status);
create index if not exists idx_football_matches_status on public.football_matches(status);
create index if not exists idx_football_matches_featured on public.football_matches(is_featured);

alter table public.news_articles enable row level security;
alter table public.football_matches enable row level security;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'news_articles' AND policyname = 'news_articles_select_all'
    ) THEN
        CREATE POLICY news_articles_select_all ON public.news_articles FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'news_articles' AND policyname = 'news_articles_insert_auth'
    ) THEN
        CREATE POLICY news_articles_insert_auth ON public.news_articles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'news_articles' AND policyname = 'news_articles_update_auth'
    ) THEN
        CREATE POLICY news_articles_update_auth ON public.news_articles FOR UPDATE USING (auth.uid() IS NOT NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'football_matches' AND policyname = 'football_matches_select_all'
    ) THEN
        CREATE POLICY football_matches_select_all ON public.football_matches FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'football_matches' AND policyname = 'football_matches_insert_auth'
    ) THEN
        CREATE POLICY football_matches_insert_auth ON public.football_matches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'football_matches' AND policyname = 'football_matches_update_auth'
    ) THEN
        CREATE POLICY football_matches_update_auth ON public.football_matches FOR UPDATE USING (auth.uid() IS NOT NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'football_matches' AND policyname = 'football_matches_delete_auth'
    ) THEN
        CREATE POLICY football_matches_delete_auth ON public.football_matches FOR DELETE USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

insert into public.football_matches (title, home_team, away_team, competition, kickoff_at, stream_url, match_summary, status, is_featured)
select 'Premier League Spotlight', 'Mighty Tigers', 'Big Bullets', 'Malawi Super League', now() + interval '2 hours', 'https://www.youtube.com/embed/live_stream?channel=UC2PCH5V-HlP_fUisO_y056A', 'Live match highlights and matchday updates for the latest football action from Malawi.', 'scheduled', true
where not exists (
    select 1 from public.football_matches where title = 'Premier League Spotlight'
);
