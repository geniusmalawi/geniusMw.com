-- ============================================================================
-- GENIUS MALAWI
-- FILE: 03_tables_part1.sql
-- PURPOSE: Core user and authentication tables
-- RUN THIRD
-- ============================================================================

BEGIN;

-- ============================================================================
-- USER PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (

    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    genius_id TEXT UNIQUE NOT NULL DEFAULT public.generate_genius_id(),

    username TEXT UNIQUE NOT NULL,

    full_name TEXT NOT NULL,

    email TEXT UNIQUE NOT NULL,

    phone TEXT,

    gender public.gender_type NOT NULL DEFAULT 'unspecified',

    date_of_birth DATE,

    country TEXT NOT NULL DEFAULT 'Malawi',

    district TEXT,

    bio TEXT,

    occupation TEXT,

    education TEXT,

    interests TEXT[] DEFAULT '{}',

    profile_photo TEXT,

    cover_photo TEXT,

    role public.user_role NOT NULL DEFAULT 'user',

    account_status public.account_status NOT NULL DEFAULT 'active',

    subscription public.subscription_plan NOT NULL DEFAULT 'free',

    premium_until TIMESTAMPTZ,

    verification_status public.verification_status NOT NULL DEFAULT 'pending',

    blue_badge BOOLEAN NOT NULL DEFAULT FALSE,

    referral_code TEXT UNIQUE DEFAULT public.generate_referral_code(),

    referred_by UUID REFERENCES public.profiles(id),

    followers INTEGER NOT NULL DEFAULT 0 CHECK (followers >= 0),

    following INTEGER NOT NULL DEFAULT 0 CHECK (following >= 0),

    ai_tokens_used BIGINT NOT NULL DEFAULT 0,

    ai_images_generated INTEGER NOT NULL DEFAULT 0,

    downloads_today INTEGER NOT NULL DEFAULT 0,

    marketplace_uploads_today INTEGER NOT NULL DEFAULT 0,

    chat_messages_today INTEGER NOT NULL DEFAULT 0,

    last_login TIMESTAMPTZ,

    last_seen TIMESTAMPTZ,

    login_count INTEGER NOT NULL DEFAULT 0,

    is_online BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ

);

-- ============================================================================
-- USER DEVICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_devices (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    device_name TEXT,

    device_type TEXT,

    operating_system TEXT,

    browser TEXT,

    ip_address TEXT,

    country TEXT,

    district TEXT,

    last_login TIMESTAMPTZ,

    trusted BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- ============================================================================
-- USER SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    refresh_token TEXT,

    device_id UUID REFERENCES public.user_devices(id),

    active BOOLEAN DEFAULT TRUE,

    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- LOGIN HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.login_history (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    email TEXT,

    ip_address TEXT,

    country TEXT,

    district TEXT,

    browser TEXT,

    operating_system TEXT,

    success BOOLEAN,

    reason TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- TWO FACTOR AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.two_factor_auth (

    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

    enabled BOOLEAN DEFAULT FALSE,

    secret TEXT,

    backup_codes TEXT[],

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- USER FOLLOWING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_followers (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(follower_id, following_id)

);

-- ============================================================================
-- USER ACHIEVEMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_achievements (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    achievement_name TEXT NOT NULL,

    description TEXT,

    badge_icon TEXT,

    points INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- REFERRALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.referrals (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    referred_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    reward_given BOOLEAN DEFAULT FALSE,

    reward_points INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(referrer_id, referred_user_id)

);

COMMIT;