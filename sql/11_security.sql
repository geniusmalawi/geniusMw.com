-- ============================================================================
-- GENIUS MALAWI
-- FILE: 11_security.sql
-- PURPOSE: Final Security, Permissions & Database Hardening
-- RUN LAST
-- ============================================================================

BEGIN;

-- ============================================================================
-- REVOKE DEFAULT PERMISSIONS
-- ============================================================================

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- ============================================================================
-- TABLE PERMISSIONS
-- ============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT
SELECT,
INSERT,
UPDATE,
DELETE
ON ALL TABLES IN SCHEMA public
TO authenticated;

GRANT
ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
TO service_role;

-- ============================================================================
-- SEQUENCE PERMISSIONS
-- ============================================================================

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================================
-- FUNCTION PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ============================================================================
-- DEFAULT PRIVILEGES
-- ============================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT
SELECT,
INSERT,
UPDATE,
DELETE
ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL
ON TABLES
TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT EXECUTE
ON FUNCTIONS
TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT EXECUTE
ON FUNCTIONS
TO service_role;

-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime
ADD TABLE public.profiles;

ALTER PUBLICATION supabase_realtime
ADD TABLE public.marketplace_listings;

ALTER PUBLICATION supabase_realtime
ADD TABLE public.posts;

ALTER PUBLICATION supabase_realtime
ADD TABLE public.messages;

ALTER PUBLICATION supabase_realtime
ADD TABLE public.notifications;

ALTER PUBLICATION supabase_realtime
ADD TABLE public.news;

ALTER PUBLICATION supabase_realtime
ADD TABLE public.jobs;

-- ============================================================================
-- DATABASE SETTINGS
-- ============================================================================

COMMENT ON SCHEMA public IS
'GENIUS MALAWI Production Database';

COMMENT ON TABLE public.profiles IS
'Registered users';

COMMENT ON TABLE public.marketplace_listings IS
'Marketplace listings';

COMMENT ON TABLE public.business_pages IS
'Business Pages';

COMMENT ON TABLE public.posts IS
'Social posts';

COMMENT ON TABLE public.messages IS
'Private chat messages';

COMMENT ON TABLE public.news IS
'News system';

COMMENT ON TABLE public.jobs IS
'Job vacancies';

-- ============================================================================
-- VERIFY INSTALLATION
-- ============================================================================

SELECT
'GENIUS MALAWI DATABASE INSTALLED SUCCESSFULLY' AS installation_status,
NOW() AS installed_at,
version() AS postgres_version;

COMMIT;