-- ============================================================================
-- GENIUS MALAWI
-- FILE: 08_storage.sql
-- PURPOSE: Storage Buckets & Storage Policies
-- RUN ELEVENTH
-- ============================================================================

BEGIN;

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars','avatars',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('covers','covers',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('products','products',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('business','business',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('news','news',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('posts','posts',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('stories','stories',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('reels','reels',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents','documents',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat','chat',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('verification','verification',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ai','ai',true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE RLS
-- ============================================================================

CREATE POLICY "Public Read"
ON storage.objects
FOR SELECT
USING (bucket_id IN (
'avatars',
'covers',
'products',
'business',
'news',
'posts',
'stories',
'reels',
'ai'
));

CREATE POLICY "Authenticated Upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (TRUE);

CREATE POLICY "Owner Update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (owner = auth.uid());

CREATE POLICY "Owner Delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (owner = auth.uid());

COMMIT;