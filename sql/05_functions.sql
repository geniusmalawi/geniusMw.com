-- ============================================================================
-- GENIUS MALAWI
-- FILE: 05_functions.sql
-- PURPOSE: Production Functions (No Trigger Yet)
-- RUN EIGHTH
-- ============================================================================

BEGIN;

-- ============================================================================
-- UPDATE updated_at AUTOMATICALLY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- INCREASE PRODUCT VIEWS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_listing_views(
    p_listing UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN

UPDATE public.marketplace_listings
SET
views_count = views_count + 1
WHERE id = p_listing;

END;
$$;

-- ============================================================================
-- FOLLOW USER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.follow_user(

    p_follower UUID,
    p_following UUID

)

RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN

IF p_follower=p_following THEN
RETURN;
END IF;

INSERT INTO public.user_followers
(
follower_id,
following_id
)

VALUES
(
p_follower,
p_following
)

ON CONFLICT DO NOTHING;

UPDATE public.profiles
SET followers=followers+1
WHERE id=p_following;

UPDATE public.profiles
SET following=following+1
WHERE id=p_follower;

END;
$$;

-- ============================================================================
-- UNFOLLOW USER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unfollow_user(

    p_follower UUID,
    p_following UUID

)

RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN

DELETE FROM public.user_followers
WHERE follower_id=p_follower
AND following_id=p_following;

UPDATE public.profiles
SET followers=GREATEST(followers-1,0)
WHERE id=p_following;

UPDATE public.profiles
SET following=GREATEST(following-1,0)
WHERE id=p_follower;

END;
$$;

-- ============================================================================
-- UPDATE PRODUCT RATING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_listing_rating(
    p_listing UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE

v_average NUMERIC;
v_total INTEGER;

BEGIN

SELECT

COALESCE(AVG(rating),0),
COUNT(*)

INTO

v_average,
v_total

FROM public.marketplace_reviews
WHERE listing_id=p_listing;

UPDATE public.marketplace_listings
SET

average_rating=v_average,
total_reviews=v_total

WHERE id=p_listing;

END;
$$;

-- ============================================================================
-- SEARCH USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_users(

    keyword TEXT

)

RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
AS $$

SELECT *

FROM public.profiles

WHERE

LOWER(full_name) LIKE '%'||LOWER(keyword)||'%'

OR

LOWER(username) LIKE '%'||LOWER(keyword)||'%'

ORDER BY followers DESC;

$$;

-- ============================================================================
-- SEARCH PRODUCTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_products(

    keyword TEXT

)

RETURNS SETOF public.marketplace_listings
LANGUAGE sql
STABLE
AS $$

SELECT *

FROM public.marketplace_listings

WHERE

status='approved'

AND

deleted_at IS NULL

AND

(

LOWER(title) LIKE '%'||LOWER(keyword)||'%'

OR

LOWER(description) LIKE '%'||LOWER(keyword)||'%'

)

ORDER BY featured DESC,
promoted DESC,
views_count DESC;

$$;

-- ============================================================================
-- SEARCH NEWS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_news(

    keyword TEXT

)

RETURNS SETOF public.news
LANGUAGE sql
STABLE
AS $$

SELECT *

FROM public.news

WHERE

status='published'

AND

(

LOWER(title) LIKE '%'||LOWER(keyword)||'%'

OR

LOWER(content) LIKE '%'||LOWER(keyword)||'%'

);

$$;

COMMIT;