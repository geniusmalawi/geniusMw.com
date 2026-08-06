-- ============================================================================
-- GENIUS MALAWI
-- FILE: 06_triggers.sql
-- PURPOSE: Safe Production Triggers (Supabase Compatible)
-- RUN NINTH
-- ============================================================================

BEGIN;

-- ============================================================================
-- REMOVE OLD TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_profiles_updated_at
ON public.profiles;

DROP TRIGGER IF EXISTS update_business_pages_updated_at
ON public.business_pages;

DROP TRIGGER IF EXISTS update_marketplace_listings_updated_at
ON public.marketplace_listings;

DROP TRIGGER IF EXISTS update_news_updated_at
ON public.news;

DROP TRIGGER IF EXISTS update_jobs_updated_at
ON public.jobs;

DROP TRIGGER IF EXISTS update_posts_updated_at
ON public.posts;

DROP TRIGGER IF EXISTS update_conversations_updated_at
ON public.conversations;

DROP TRIGGER IF EXISTS on_auth_user_created
ON auth.users;

DROP FUNCTION IF EXISTS public.handle_new_user();

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_business_pages_updated_at
BEFORE UPDATE ON public.business_pages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_marketplace_listings_updated_at
BEFORE UPDATE ON public.marketplace_listings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_news_updated_at
BEFORE UPDATE ON public.news
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_posts_updated_at
BEFORE UPDATE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- SAFE SUPABASE AUTH TRIGGER
-- Compatible with Supabase Auth
-- No recursive trigger
-- No manual auth.users modification
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS
$$
DECLARE

v_username TEXT;

BEGIN

v_username :=
LOWER(
REGEXP_REPLACE(
COALESCE(split_part(NEW.email,'@',1),'user'),
'[^a-zA-Z0-9]',
'',
'g'
)
);

IF EXISTS
(
SELECT 1
FROM public.profiles
WHERE id=NEW.id
)
THEN
RETURN NEW;
END IF;

INSERT INTO public.profiles
(

id,
genius_id,
username,
full_name,
email,
gender,
country,
subscription,
verification_status,
blue_badge,
role

)

VALUES
(

NEW.id,

public.generate_genius_id(),

v_username ||

FLOOR(RANDOM()*100000)::TEXT,

COALESCE(
NEW.raw_user_meta_data->>'full_name',
split_part(NEW.email,'@',1)
),

NEW.email,

'unspecified',

'Malawi',

'free',

'pending',

FALSE,

'user'

);

RETURN NEW;

END;
$$;

CREATE TRIGGER on_auth_user_created

AFTER INSERT

ON auth.users

FOR EACH ROW

EXECUTE FUNCTION public.handle_new_user();

COMMIT;