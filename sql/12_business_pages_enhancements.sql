BEGIN;

-- Business followers (required by Follow/Unfollow)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'business_followers'
    ) THEN
        CREATE TABLE public.business_followers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            business_id UUID,
            user_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

ALTER TABLE public.business_followers
    ADD COLUMN IF NOT EXISTS business_id UUID,
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS business_page_id UUID,
    ADD COLUMN IF NOT EXISTS follower_id UUID;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_followers' AND column_name = 'business_page_id'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_followers' AND column_name = 'follower_id'
    ) THEN
        UPDATE public.business_followers
        SET business_id = COALESCE(business_id, business_page_id),
            user_id = COALESCE(user_id, follower_id)
        WHERE business_id IS NULL OR user_id IS NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'business_followers_business_id_fkey'
    ) THEN
        ALTER TABLE public.business_followers
        ADD CONSTRAINT business_followers_business_id_fkey
        FOREIGN KEY (business_id) REFERENCES public.business_pages(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'business_followers_user_id_fkey'
    ) THEN
        ALTER TABLE public.business_followers
        ADD CONSTRAINT business_followers_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'business_followers_unique'
    ) THEN
        ALTER TABLE public.business_followers
        ADD CONSTRAINT business_followers_unique UNIQUE (business_id, user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_business_followers_business_id ON public.business_followers(business_id);
CREATE INDEX IF NOT EXISTS idx_business_followers_user_id ON public.business_followers(user_id);

ALTER TABLE public.business_pages
    ADD COLUMN IF NOT EXISTS whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS about TEXT,
    ADD COLUMN IF NOT EXISTS services TEXT,
    ADD COLUMN IF NOT EXISTS products TEXT,
    ADD COLUMN IF NOT EXISTS location TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS opening_hours TEXT,
    ADD COLUMN IF NOT EXISTS website TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS profile_views INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS visitors INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_posts INTEGER DEFAULT 0;

ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS business_page_id UUID REFERENCES public.business_pages(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published',
    ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS document_urls TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS poll_options TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS offer_details TEXT,
    ADD COLUMN IF NOT EXISTS event_details TEXT,
    ADD COLUMN IF NOT EXISTS announcement_details TEXT,
    ADD COLUMN IF NOT EXISTS featured_products TEXT,
    ADD COLUMN IF NOT EXISTS featured_testimonials TEXT;

CREATE TABLE IF NOT EXISTS public.business_post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.business_post_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_post_comments_post_id ON public.business_post_comments(post_id);

CREATE TABLE IF NOT EXISTS public.business_post_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL DEFAULT 'like',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.business_post_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.business_post_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_page_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_page_id UUID NOT NULL REFERENCES public.business_pages(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    attachment_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    delivered_at TIMESTAMPTZ DEFAULT NOW(),
    seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_page_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_page_id UUID NOT NULL REFERENCES public.business_pages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.business_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_post_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_page_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_page_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_followers_public_read ON public.business_followers;
CREATE POLICY business_followers_public_read ON public.business_followers
FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS business_followers_write ON public.business_followers;
CREATE POLICY business_followers_write ON public.business_followers
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS business_pages_owner_write ON public.business_pages;
CREATE POLICY business_pages_owner_write ON public.business_pages
FOR ALL USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
)
WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
);

DROP POLICY IF EXISTS business_posts_public_read ON public.posts;
CREATE POLICY business_posts_public_read ON public.posts FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS business_posts_owner_write ON public.posts;
CREATE POLICY business_posts_owner_write ON public.posts
FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
)
WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
);

DROP POLICY IF EXISTS business_comments_public_read ON public.business_post_comments;
CREATE POLICY business_comments_public_read ON public.business_post_comments FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS business_comments_write ON public.business_post_comments;
CREATE POLICY business_comments_write ON public.business_post_comments
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS business_reactions_public_read ON public.business_post_reactions;
CREATE POLICY business_reactions_public_read ON public.business_post_reactions FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS business_reactions_write ON public.business_post_reactions;
CREATE POLICY business_reactions_write ON public.business_post_reactions
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS business_saves_public_read ON public.business_post_saves;
CREATE POLICY business_saves_public_read ON public.business_post_saves FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS business_saves_write ON public.business_post_saves;
CREATE POLICY business_saves_write ON public.business_post_saves
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS business_reports_write ON public.business_post_reports;
CREATE POLICY business_reports_write ON public.business_post_reports
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS business_messages_write ON public.business_page_messages;
CREATE POLICY business_messages_write ON public.business_page_messages
FOR ALL USING (sender_id = auth.uid() OR receiver_id = auth.uid()) WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS business_notifications_write ON public.business_page_notifications;
CREATE POLICY business_notifications_write ON public.business_page_notifications
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMIT;
