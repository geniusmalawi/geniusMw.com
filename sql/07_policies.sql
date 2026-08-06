-- ============================================================================
-- GENIUS MALAWI
-- FILE: 07_policies.sql
-- PURPOSE: Row Level Security (RLS)
-- RUN TENTH
-- ============================================================================

BEGIN;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missing_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES
-- ============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname='public'
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            r.policyname,
            r.schemaname,
            r.tablename
        );
    END LOOP;
END;
$$;

-- ============================================================================
-- PROFILES
-- ============================================================================

CREATE POLICY profiles_select
ON public.profiles
FOR SELECT
USING (TRUE);

CREATE POLICY profiles_insert
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_update
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY profiles_delete
ON public.profiles
FOR DELETE
USING (auth.uid() = id);

-- ============================================================================
-- MARKETPLACE
-- ============================================================================

CREATE POLICY listings_public_read
ON public.marketplace_listings
FOR SELECT
USING (
    (status='approved' AND deleted_at IS NULL)
    OR seller_id=auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

CREATE POLICY listings_insert
ON public.marketplace_listings
FOR INSERT
WITH CHECK (
seller_id=auth.uid()
);

CREATE POLICY listings_update
ON public.marketplace_listings
FOR UPDATE
USING (
    seller_id=auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
)
WITH CHECK (
    seller_id=auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

CREATE POLICY listings_delete
ON public.marketplace_listings
FOR DELETE
USING (
    seller_id=auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

CREATE POLICY marketplace_images_select
ON public.marketplace_images
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.marketplace_listings m
        WHERE m.id = listing_id
        AND (
            (m.status='approved' AND m.deleted_at IS NULL)
            OR m.seller_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'super_admin'
            )
        )
    )
);

CREATE POLICY marketplace_images_insert
ON public.marketplace_images
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.marketplace_listings m
        WHERE m.id = listing_id
        AND (
            m.seller_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'super_admin'
            )
        )
    )
);

CREATE POLICY marketplace_images_update
ON public.marketplace_images
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM public.marketplace_listings m
        WHERE m.id = listing_id
        AND (
            m.seller_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'super_admin'
            )
        )
    )
);

CREATE POLICY marketplace_images_delete
ON public.marketplace_images
FOR DELETE
USING (
    EXISTS (
        SELECT 1
        FROM public.marketplace_listings m
        WHERE m.id = listing_id
        AND (
            m.seller_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'super_admin'
            )
        )
    )
);

CREATE POLICY marketplace_videos_select
ON public.marketplace_videos
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.marketplace_listings m
        WHERE m.id = listing_id
        AND (
            (m.status='approved' AND m.deleted_at IS NULL)
            OR m.seller_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'super_admin'
            )
        )
    )
);

CREATE POLICY marketplace_videos_insert
ON public.marketplace_videos
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.marketplace_listings m
        WHERE m.id = listing_id
        AND (
            m.seller_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'super_admin'
            )
        )
    )
);

CREATE POLICY marketplace_videos_update
ON public.marketplace_videos
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM public.marketplace_listings m
        WHERE m.id = listing_id
        AND (
            m.seller_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'super_admin'
            )
        )
    )
);

CREATE POLICY marketplace_videos_delete
ON public.marketplace_videos
FOR DELETE
USING (
    EXISTS (
        SELECT 1
        FROM public.marketplace_listings m
        WHERE m.id = listing_id
        AND (
            m.seller_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'super_admin'
            )
        )
    )
);

-- ============================================================================
-- BUSINESS PAGES
-- ============================================================================

CREATE POLICY business_public_read
ON public.business_pages
FOR SELECT
USING (TRUE);

CREATE POLICY business_owner_write
ON public.business_pages
FOR ALL
USING (
owner_id=auth.uid()
OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
)
)
WITH CHECK (
owner_id=auth.uid()
OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
)
);

CREATE POLICY business_followers_public_read
ON public.business_followers
FOR SELECT
USING (TRUE);

CREATE POLICY business_followers_write
ON public.business_followers
FOR ALL
USING (follower_id = auth.uid())
WITH CHECK (follower_id = auth.uid());

CREATE POLICY business_reviews_public_read
ON public.business_reviews
FOR SELECT
USING (TRUE);

CREATE POLICY business_reviews_insert
ON public.business_reviews
FOR INSERT
WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY business_reviews_update
ON public.business_reviews
FOR UPDATE
USING (reviewer_id = auth.uid());

CREATE POLICY business_verification_owner_write
ON public.business_verifications
FOR ALL
USING (
EXISTS (
    SELECT 1
    FROM public.business_pages bp
    WHERE bp.id = business_id
    AND bp.owner_id = auth.uid()
)
)
WITH CHECK (
EXISTS (
    SELECT 1
    FROM public.business_pages bp
    WHERE bp.id = business_id
    AND bp.owner_id = auth.uid()
)
);

-- ============================================================================
-- POSTS
-- ============================================================================

CREATE POLICY posts_public_read
ON public.posts
FOR SELECT
USING (TRUE);

CREATE POLICY posts_owner
ON public.posts
FOR ALL
USING (
user_id=auth.uid()
OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
)
)
WITH CHECK (
user_id=auth.uid()
OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
)
);

-- ============================================================================
-- STORIES
-- ============================================================================

CREATE POLICY stories_public_read
ON public.stories
FOR SELECT
USING (TRUE);

CREATE POLICY stories_owner
ON public.stories
FOR ALL
USING (
user_id=auth.uid()
)
WITH CHECK (
user_id=auth.uid()
);

-- ============================================================================
-- REELS
-- ============================================================================

CREATE POLICY reels_public_read
ON public.reels
FOR SELECT
USING (TRUE);

CREATE POLICY reels_owner
ON public.reels
FOR ALL
USING (
user_id=auth.uid()
)
WITH CHECK (
user_id=auth.uid()
);

-- ============================================================================
-- NEWS
-- ============================================================================

CREATE POLICY news_public_read
ON public.news
FOR SELECT
USING (
status='published'
);

CREATE POLICY news_owner
ON public.news
FOR ALL
USING (
author_id=auth.uid()
)
WITH CHECK (
author_id=auth.uid()
);

-- ============================================================================
-- JOBS
-- ============================================================================

CREATE POLICY jobs_public_read
ON public.jobs
FOR SELECT
USING (
    status='published'
);

CREATE POLICY jobs_super_admin_full_access
ON public.jobs
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

-- NOTE: Only Super Admin can create, edit, publish, close, reopen, or delete job vacancies.
CREATE POLICY jobs_insert_super_admin_only
ON public.jobs
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

-- ============================================================================
-- JOB APPLICATIONS
-- ============================================================================

CREATE POLICY job_applications_select_owner
ON public.job_applications
FOR SELECT
USING (
    applicant_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

CREATE POLICY job_applications_insert_owner
ON public.job_applications
FOR INSERT
WITH CHECK (
    applicant_id = auth.uid()
);

CREATE POLICY job_applications_update_owner
ON public.job_applications
FOR UPDATE
USING (
    applicant_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
)
WITH CHECK (
    applicant_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

CREATE POLICY job_applications_delete_owner
ON public.job_applications
FOR DELETE
USING (
    applicant_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
);

-- ============================================================================
-- CHAT
-- ============================================================================

CREATE POLICY conversation_members_read
ON public.conversations
FOR SELECT
USING (
EXISTS(
SELECT 1
FROM public.conversation_members
WHERE conversation_id=id
AND user_id=auth.uid()
)
);

CREATE POLICY messages_members
ON public.messages
FOR ALL
USING (
EXISTS(
SELECT 1
FROM public.conversation_members
WHERE conversation_id=messages.conversation_id
AND user_id=auth.uid()
)
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE POLICY notifications_owner
ON public.notifications
FOR ALL
USING (
user_id=auth.uid()
)
WITH CHECK (
user_id=auth.uid()
);

-- ============================================================================
-- AI HISTORY
-- ============================================================================

CREATE POLICY ai_chat_owner
ON public.ai_chat_history
FOR ALL
USING (
user_id=auth.uid()
)
WITH CHECK (
user_id=auth.uid()
);

CREATE POLICY ai_images_owner
ON public.ai_generated_images
FOR ALL
USING (
user_id=auth.uid()
)
WITH CHECK (
user_id=auth.uid()
);

COMMIT;