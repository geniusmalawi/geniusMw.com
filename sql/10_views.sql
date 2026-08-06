-- ============================================================================
-- GENIUS MALAWI
-- FILE: 10_views.sql
-- PURPOSE: Production Views
-- RUN AFTER 09_seed_super_admin.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- ACTIVE USERS
-- ============================================================================

CREATE OR REPLACE VIEW public.v_active_users AS
SELECT
    id,
    genius_id,
    username,
    full_name,
    email,
    profile_photo,
    role,
    subscription,
    verification_status,
    blue_badge,
    followers,
    following,
    created_at
FROM public.profiles
WHERE
    account_status='active'
AND
    deleted_at IS NULL;

-- ============================================================================
-- MARKETPLACE PUBLIC VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.v_marketplace AS
SELECT

m.id,
m.title,
m.description,
m.category,
m.price,
m.currency,
m.location,
m.district,
m.views_count,
m.average_rating,
m.total_reviews,
m.featured,
m.promoted,
m.created_at,

p.id AS seller_id,
p.full_name,
p.username,
p.profile_photo,
p.blue_badge,
p.verification_status

FROM public.marketplace_listings m

JOIN public.profiles p

ON p.id=m.seller_id

WHERE

m.status='approved'
AND
m.deleted_at IS NULL;

-- ============================================================================
-- VERIFIED BUSINESSES
-- ============================================================================

CREATE OR REPLACE VIEW public.v_verified_businesses AS

SELECT *

FROM public.business_pages

WHERE verified=TRUE;

-- ============================================================================
-- PUBLISHED NEWS
-- ============================================================================

CREATE OR REPLACE VIEW public.v_news AS

SELECT

n.*,

p.full_name,
p.username,
p.profile_photo,
p.blue_badge

FROM public.news n

LEFT JOIN public.profiles p

ON p.id=n.author_id

WHERE

status='published';

-- ============================================================================
-- ACTIVE JOBS
-- ============================================================================

CREATE OR REPLACE VIEW public.v_jobs AS

SELECT *

FROM public.jobs

WHERE

status='published';

-- ============================================================================
-- TRENDING PRODUCTS
-- ============================================================================

CREATE OR REPLACE VIEW public.v_trending_products AS

SELECT *

FROM public.marketplace_listings

WHERE

status='approved'

AND deleted_at IS NULL

ORDER BY

featured DESC,

promoted DESC,

views_count DESC,

average_rating DESC;

-- ============================================================================
-- VERIFIED USERS
-- ============================================================================

CREATE OR REPLACE VIEW public.v_verified_users AS

SELECT *

FROM public.profiles

WHERE

verification_status='approved'

AND

account_status='active';

COMMIT;