-- =====================================================================
-- GENIUS MALAWI - PATCH: AI USAGE QUOTA LEDGER
-- Location: sql/patch_ai_usage.sql
-- Purpose: Safely provisions the missing public.ai_usage table,
--          establishes unified tracking indices, and applies Row Level
--          Security policies for secure authenticated quota audits.
-- =====================================================================

-- 1. Create the base tracking table if it does not exist
CREATE TABLE IF NOT EXISTS public.ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    chat_count INTEGER DEFAULT 0 NOT NULL,
    pdf_upload_count INTEGER DEFAULT 0 NOT NULL,
    image_gen_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_daily_quota UNIQUE (user_id, request_date)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- 3. Provision secure authenticated access policies (Avoid overlapping rules)
DROP POLICY IF EXISTS "Users can read their own daily AI quota" ON public.ai_usage;
CREATE POLICY "Users can read their own daily AI quota"
ON public.ai_usage FOR SELECT
TO authenticated
USING (auth.role() = 'authenticated' AND auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own daily AI quota" ON public.ai_usage;
CREATE POLICY "Users can insert their own daily AI quota"
ON public.ai_usage FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated' AND auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own daily AI quota" ON public.ai_usage;
CREATE POLICY "Users can update their own daily AI quota"
ON public.ai_usage FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated' AND auth.uid() IS NOT NULL AND auth.uid() = user_id)
WITH CHECK (auth.role() = 'authenticated' AND auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- 4. Enable efficient indexing over dates and user columns
CREATE INDEX IF NOT EXISTS idx_ai_usage_lookup ON public.ai_usage (user_id, request_date);