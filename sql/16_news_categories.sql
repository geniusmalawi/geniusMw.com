-- Dynamic news category management
create extension if not exists pgcrypto;

create table if not exists public.news_categories (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    icon text,
    display_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.news_articles
    add column if not exists category_id uuid references public.news_categories(id) on delete set null;

create index if not exists idx_news_categories_active_order on public.news_categories (is_active, display_order, name);
create index if not exists idx_news_articles_category_id on public.news_articles (category_id);

alter table public.news_categories enable row level security;

-- Public read access for categories
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news_categories' AND policyname = 'news_categories_select_all'
    ) THEN
        CREATE POLICY news_categories_select_all ON public.news_categories FOR SELECT USING (true);
    END IF;
END $$;

-- Authenticated admins may manage categories
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news_categories' AND policyname = 'news_categories_manage_auth'
    ) THEN
        CREATE POLICY news_categories_manage_auth ON public.news_categories
            FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
END $$;

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Home', 1, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'home');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Breaking News', 2, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'breaking news');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'National', 3, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'national');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'International', 4, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'international');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Politics', 5, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'politics');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Business', 6, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'business');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Economy', 7, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'economy');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Technology', 8, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'technology');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Education', 9, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'education');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Health', 10, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'health');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Science', 11, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'science');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Environment', 12, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'environment');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Sports', 13, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'sports');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Football', 14, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'football');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Entertainment', 15, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'entertainment');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Music', 16, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'music');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Culture', 17, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'culture');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Lifestyle', 18, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'lifestyle');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Travel', 19, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'travel');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Agriculture', 20, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'agriculture');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Jobs & Careers', 21, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'jobs & careers');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Opinion', 22, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'opinion');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Editorial', 23, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'editorial');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Investigations', 24, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'investigations');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Crime & Security', 25, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'crime & security');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Religion', 26, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'religion');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Community', 27, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'community');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Events', 28, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'events');

insert into public.news_categories (name, display_order, is_active, created_at, updated_at)
select 'Announcements', 29, true, now(), now()
where not exists (select 1 from public.news_categories where lower(name) = 'announcements');
