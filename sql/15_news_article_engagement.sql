-- =============================================================
-- GENIUS MALAWI - NEWS ARTICLE ENGAGEMENT FEATURES
-- =============================================================
-- Purpose: Add database support for article views, likes, ratings,
--          comments, bookmarks, and aggregated engagement counters.
-- =============================================================

create extension if not exists pgcrypto;

alter table public.news_articles
    add column if not exists likes_count integer not null default 0,
    add column if not exists ratings_count integer not null default 0,
    add column if not exists ratings_average numeric(3,2) not null default 0,
    add column if not exists comments_count integer not null default 0,
    add column if not exists bookmarks_count integer not null default 0;

create table if not exists public.news_article_views (
    id uuid primary key default gen_random_uuid(),
    article_id uuid not null references public.news_articles(id) on delete cascade,
    viewer_id uuid references public.profiles(id) on delete set null,
    view_key text not null,
    viewed_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);
create unique index if not exists idx_news_article_views_article_view_key on public.news_article_views(article_id, view_key);
create index if not exists idx_news_article_views_article_id on public.news_article_views(article_id);

create table if not exists public.news_article_likes (
    id uuid primary key default gen_random_uuid(),
    article_id uuid not null references public.news_articles(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now()
);
create unique index if not exists idx_news_article_likes_article_user on public.news_article_likes(article_id, user_id);
create index if not exists idx_news_article_likes_article_id on public.news_article_likes(article_id);

create table if not exists public.news_article_ratings (
    id uuid primary key default gen_random_uuid(),
    article_id uuid not null references public.news_articles(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    rating smallint not null check (rating >= 1 and rating <= 5),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists idx_news_article_ratings_article_user on public.news_article_ratings(article_id, user_id);
create index if not exists idx_news_article_ratings_article_id on public.news_article_ratings(article_id);

create table if not exists public.news_article_comments (
    id uuid primary key default gen_random_uuid(),
    article_id uuid not null references public.news_articles(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    parent_id uuid references public.news_article_comments(id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_news_article_comments_article_id on public.news_article_comments(article_id);
create index if not exists idx_news_article_comments_parent_id on public.news_article_comments(parent_id);

create table if not exists public.news_article_bookmarks (
    id uuid primary key default gen_random_uuid(),
    article_id uuid not null references public.news_articles(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now()
);
create unique index if not exists idx_news_article_bookmarks_article_user on public.news_article_bookmarks(article_id, user_id);
create index if not exists idx_news_article_bookmarks_user_id on public.news_article_bookmarks(user_id);

alter table public.news_article_views enable row level security;
alter table public.news_article_likes enable row level security;
alter table public.news_article_ratings enable row level security;
alter table public.news_article_comments enable row level security;
alter table public.news_article_bookmarks enable row level security;

-- Public read policies for engagement tables
DROP POLICY IF EXISTS news_article_views_public_read ON public.news_article_views;
CREATE POLICY news_article_views_public_read ON public.news_article_views FOR SELECT USING (true);
DROP POLICY IF EXISTS news_article_likes_public_read ON public.news_article_likes;
CREATE POLICY news_article_likes_public_read ON public.news_article_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS news_article_ratings_public_read ON public.news_article_ratings;
CREATE POLICY news_article_ratings_public_read ON public.news_article_ratings FOR SELECT USING (true);
DROP POLICY IF EXISTS news_article_comments_public_read ON public.news_article_comments;
CREATE POLICY news_article_comments_public_read ON public.news_article_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS news_article_bookmarks_public_read ON public.news_article_bookmarks;
CREATE POLICY news_article_bookmarks_public_read ON public.news_article_bookmarks FOR SELECT USING (true);

-- Write policies
DROP POLICY IF EXISTS news_article_views_insert_auth ON public.news_article_views;
CREATE POLICY news_article_views_insert_auth ON public.news_article_views FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS news_article_likes_insert_auth ON public.news_article_likes;
CREATE POLICY news_article_likes_insert_auth ON public.news_article_likes FOR INSERT WITH CHECK (auth.uid() is not null and auth.uid() = user_id);
DROP POLICY IF EXISTS news_article_ratings_insert_auth ON public.news_article_ratings;
CREATE POLICY news_article_ratings_insert_auth ON public.news_article_ratings FOR INSERT WITH CHECK (auth.uid() is not null and auth.uid() = user_id);
DROP POLICY IF EXISTS news_article_comments_insert_auth ON public.news_article_comments;
CREATE POLICY news_article_comments_insert_auth ON public.news_article_comments FOR INSERT WITH CHECK (auth.uid() is not null and auth.uid() = user_id);
DROP POLICY IF EXISTS news_article_bookmarks_insert_auth ON public.news_article_bookmarks;
CREATE POLICY news_article_bookmarks_insert_auth ON public.news_article_bookmarks FOR INSERT WITH CHECK (auth.uid() is not null and auth.uid() = user_id);

DROP POLICY IF EXISTS news_article_likes_delete_own ON public.news_article_likes;
CREATE POLICY news_article_likes_delete_own ON public.news_article_likes FOR DELETE USING (auth.uid() is not null and auth.uid() = user_id);
DROP POLICY IF EXISTS news_article_ratings_update_own ON public.news_article_ratings;
CREATE POLICY news_article_ratings_update_own ON public.news_article_ratings FOR UPDATE USING (auth.uid() is not null and auth.uid() = user_id);
DROP POLICY IF EXISTS news_article_ratings_delete_own ON public.news_article_ratings;
CREATE POLICY news_article_ratings_delete_own ON public.news_article_ratings FOR DELETE USING (auth.uid() is not null and auth.uid() = user_id);
DROP POLICY IF EXISTS news_article_comments_update_own ON public.news_article_comments;
CREATE POLICY news_article_comments_update_own ON public.news_article_comments FOR UPDATE USING (auth.uid() is not null and auth.uid() = user_id);
DROP POLICY IF EXISTS news_article_comments_delete_own ON public.news_article_comments;
CREATE POLICY news_article_comments_delete_own ON public.news_article_comments FOR DELETE USING (auth.uid() is not null and auth.uid() = user_id);
DROP POLICY IF EXISTS news_article_bookmarks_delete_own ON public.news_article_bookmarks;
CREATE POLICY news_article_bookmarks_delete_own ON public.news_article_bookmarks FOR DELETE USING (auth.uid() is not null and auth.uid() = user_id);

-- Function for computed article view deduplication
create or replace function public.increment_news_article_view(
    article_id uuid,
    view_key text,
    viewer_id uuid default auth.uid()
)
returns bigint language plpgsql security definer as $$
begin
    if article_id is null then
        raise exception 'Article ID is required.';
    end if;
    if view_key is null or trim(view_key) = '' then
        raise exception 'View key is required.';
    end if;

    insert into public.news_article_views(article_id, viewer_id, view_key, viewed_at, created_at)
    values (article_id, viewer_id, view_key, now(), now())
    on conflict (article_id, view_key)
    do update set viewed_at = now()
        where public.news_article_views.viewed_at < now() - interval '30 minutes';

    update public.news_articles
    set views_count = (
        select count(*) from public.news_article_views where article_id = public.news_articles.id
    )
    where id = article_id;

    return (select views_count from public.news_articles where id = article_id);
end;
$$;

create or replace function public.like_news_article(article_id uuid)
returns bigint language plpgsql security definer as $$
declare
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then
        raise exception 'Authentication required for likes.';
    end if;

    insert into public.news_article_likes(article_id, user_id, created_at)
    values (article_id, v_user_id, now())
    on conflict (article_id, user_id)
    do nothing;

    update public.news_articles
    set likes_count = (
        select count(*) from public.news_article_likes where article_id = public.news_articles.id
    )
    where id = article_id;

    return (select likes_count from public.news_articles where id = article_id);
end;
$$;

create or replace function public.rate_news_article(article_id uuid, rating_value int)
returns jsonb language plpgsql security definer as $$
declare
    v_user_id uuid := auth.uid();
    v_average numeric(3,2);
    v_count integer;
begin
    if v_user_id is null then
        raise exception 'Authentication required for ratings.';
    end if;
    if rating_value < 1 or rating_value > 5 then
        raise exception 'Rating must be between 1 and 5.';
    end if;

    insert into public.news_article_ratings(article_id, user_id, rating, created_at, updated_at)
    values (article_id, v_user_id, rating_value, now(), now())
    on conflict (article_id, user_id)
    do update set rating = excluded.rating, updated_at = now();

    select count(*), coalesce(avg(rating), 0)::numeric(3,2)
    into v_count, v_average
    from public.news_article_ratings
    where public.news_article_ratings.article_id = article_id;

    update public.news_articles
    set ratings_count = v_count,
        ratings_average = v_average
    where id = article_id;

    return jsonb_build_object('ratings_average', v_average, 'ratings_count', v_count);
end;
$$;

create or replace function public.bookmark_news_article(article_id uuid)
returns bigint language plpgsql security definer as $$
declare
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then
        raise exception 'Authentication required for bookmarks.';
    end if;

    insert into public.news_article_bookmarks(article_id, user_id, created_at)
    values (article_id, v_user_id, now())
    on conflict (article_id, user_id)
    do nothing;

    update public.news_articles
    set bookmarks_count = (
        select count(*) from public.news_article_bookmarks where article_id = public.news_articles.id
    )
    where id = article_id;

    return (select bookmarks_count from public.news_articles where id = article_id);
end;
$$;

create or replace function public.remove_news_article_bookmark(article_id uuid)
returns bigint language plpgsql security definer as $$
declare
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then
        raise exception 'Authentication required for bookmarks.';
    end if;

    delete from public.news_article_bookmarks
    where public.news_article_bookmarks.article_id = article_id
      and user_id = v_user_id;

    update public.news_articles
    set bookmarks_count = (
        select count(*) from public.news_article_bookmarks where article_id = public.news_articles.id
    )
    where id = article_id;

    return (select bookmarks_count from public.news_articles where id = article_id);
end;
$$;

create or replace function public.refresh_news_article_comment_count()
returns trigger language plpgsql security definer as $$
declare
    target_article uuid := coalesce(new.article_id, old.article_id);
begin
    update public.news_articles
    set comments_count = (
        select count(*) from public.news_article_comments where article_id = target_article
    )
    where id = target_article;
    return null;
end;
$$;

drop trigger if exists trg_refresh_news_article_comment_count on public.news_article_comments;
create trigger trg_refresh_news_article_comment_count
    after insert or delete on public.news_article_comments
    for each row execute function public.refresh_news_article_comment_count();

create or replace function public.refresh_news_article_like_count()
returns trigger language plpgsql security definer as $$
declare
    target_article uuid := coalesce(new.article_id, old.article_id);
begin
    update public.news_articles
    set likes_count = (
        select count(*) from public.news_article_likes where article_id = target_article
    )
    where id = target_article;
    return null;
end;
$$;

drop trigger if exists trg_refresh_news_article_like_count on public.news_article_likes;
create trigger trg_refresh_news_article_like_count
    after insert or delete on public.news_article_likes
    for each row execute function public.refresh_news_article_like_count();

create or replace function public.refresh_news_article_rating_stats()
returns trigger language plpgsql security definer as $$
declare
    target_article uuid := coalesce(new.article_id, old.article_id);
    v_count integer;
    v_average numeric(3,2);
begin
    select count(*), coalesce(avg(rating), 0)::numeric(3,2)
    into v_count, v_average
    from public.news_article_ratings
    where article_id = target_article;

    update public.news_articles
    set ratings_count = v_count,
        ratings_average = v_average
    where id = target_article;

    return null;
end;
$$;

drop trigger if exists trg_refresh_news_article_rating_stats on public.news_article_ratings;
create trigger trg_refresh_news_article_rating_stats
    after insert or update or delete on public.news_article_ratings
    for each row execute function public.refresh_news_article_rating_stats();

create or replace function public.refresh_news_article_bookmark_count()
returns trigger language plpgsql security definer as $$
declare
    target_article uuid := coalesce(new.article_id, old.article_id);
begin
    update public.news_articles
    set bookmarks_count = (
        select count(*) from public.news_article_bookmarks where article_id = target_article
    )
    where id = target_article;
    return null;
end;
$$;

drop trigger if exists trg_refresh_news_article_bookmark_count on public.news_article_bookmarks;
create trigger trg_refresh_news_article_bookmark_count
    after insert or delete on public.news_article_bookmarks
    for each row execute function public.refresh_news_article_bookmark_count();
