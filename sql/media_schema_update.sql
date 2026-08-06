-- Media Hub schema migration
-- Creates tables for Media Hub management: live tv, radio, videos, music
-- Safe to run multiple times using IF NOT EXISTS and ADD COLUMN IF NOT EXISTS

-- Live TV
CREATE TABLE IF NOT EXISTS public.media_live_tv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    logo_url TEXT,
    category TEXT,
    stream_url TEXT,
    description TEXT,
    country TEXT,
    status TEXT DEFAULT 'offline', -- online/offline
    featured BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    logo_path TEXT,
    logo_bucket TEXT,
    thumbnail_path TEXT,
    thumbnail_bucket TEXT,
    video_path TEXT,
    video_bucket TEXT,
    cover_path TEXT,
    cover_bucket TEXT,
    audio_path TEXT,
    audio_bucket TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Live Radio
CREATE TABLE IF NOT EXISTS public.media_radio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    logo_url TEXT,
    stream_url TEXT,
    country TEXT,
    description TEXT,
    genre TEXT,
    featured BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'offline',
    is_deleted BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    logo_path TEXT,
    logo_bucket TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Original Videos
CREATE TABLE IF NOT EXISTS public.media_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    thumbnail_url TEXT,
    video_url TEXT,
    youtube_url TEXT,
    vimeo_url TEXT,
    description TEXT,
    category TEXT,
    duration TEXT,
    duration_seconds INTEGER,
    featured BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    publish_date DATE,
    status TEXT DEFAULT 'draft', -- draft/published
    is_deleted BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    thumbnail_path TEXT,
    thumbnail_bucket TEXT,
    video_path TEXT,
    video_bucket TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Music Streaming
CREATE TABLE IF NOT EXISTS public.media_music (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    cover_url TEXT,
    audio_url TEXT,
    streaming_url TEXT,
    genre TEXT,
    duration TEXT,
    duration_seconds INTEGER,
    featured BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    description TEXT,
    status TEXT DEFAULT 'draft', -- draft/published
    is_deleted BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    cover_path TEXT,
    cover_bucket TEXT,
    audio_path TEXT,
    audio_bucket TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_media_live_tv_display_order ON public.media_live_tv(display_order);
CREATE INDEX IF NOT EXISTS idx_media_radio_display_order ON public.media_radio(display_order);
CREATE INDEX IF NOT EXISTS idx_media_videos_display_order ON public.media_videos(display_order);
CREATE INDEX IF NOT EXISTS idx_media_music_display_order ON public.media_music(display_order);

CREATE INDEX IF NOT EXISTS idx_media_videos_status ON public.media_videos(status);
CREATE INDEX IF NOT EXISTS idx_media_music_status ON public.media_music(status);

-- End migration
