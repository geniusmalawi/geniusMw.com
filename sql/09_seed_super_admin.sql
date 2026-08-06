-- ============================================================================
-- GENIUS MALAWI
-- FILE: 09_seed_super_admin.sql
-- PURPOSE: Promote an Existing Registered User to Super Admin
-- RUN LAST
-- ============================================================================

BEGIN;

-- ============================================================================
-- CHANGE THIS EMAIL IF NECESSARY
-- ============================================================================

UPDATE public.profiles
SET
    role = 'super_admin',
    subscription = 'premium',
    premium_until = NOW() + INTERVAL '100 years',
    verification_status = 'approved',
    blue_badge = TRUE,
    account_status = 'active',
    updated_at = NOW()
WHERE email = 'geniusmalawi2026@gmail.com';

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT
    id,
    genius_id,
    full_name,
    email,
    role,
    subscription,
    verification_status,
    blue_badge,
    account_status
FROM public.profiles
WHERE email='geniusmalawi2026@gmail.com';