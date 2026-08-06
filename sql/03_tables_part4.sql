-- ============================================================================
-- GENIUS MALAWI
-- FILE: 03_tables_part4.sql
-- PURPOSE: Chat, AI, Notifications, Reports & Emergency
-- RUN SIXTH
-- ============================================================================

BEGIN;

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversations (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    is_group BOOLEAN NOT NULL DEFAULT FALSE,

    group_name TEXT,

    group_photo TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- CONVERSATION MEMBERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversation_members (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    joined_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(conversation_id,user_id)

);

-- ============================================================================
-- CHAT MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messages (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,

    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    message_type public.message_type NOT NULL DEFAULT 'text',

    message TEXT,

    media_url TEXT,

    seen BOOLEAN DEFAULT FALSE,

    edited BOOLEAN DEFAULT FALSE,

    deleted BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    notification_type public.notification_type NOT NULL,

    title TEXT NOT NULL,

    body TEXT,

    image_url TEXT,

    action_url TEXT,

    is_read BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- USER REPORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reports (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    report_number TEXT UNIQUE NOT NULL DEFAULT public.generate_report_number(),

    reporter_id UUID REFERENCES public.profiles(id),

    reported_user UUID REFERENCES public.profiles(id),

    listing_id UUID REFERENCES public.marketplace_listings(id),

    report_type public.report_type NOT NULL,

    description TEXT,

    evidence_url TEXT,

    status public.report_status DEFAULT 'pending',

    reviewed_by UUID REFERENCES public.profiles(id),

    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- AI CHAT HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_chat_history (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    prompt TEXT NOT NULL,

    response TEXT NOT NULL,

    model TEXT,

    tokens_used INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- AI IMAGE HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_generated_images (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    prompt TEXT NOT NULL,

    image_url TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- EMERGENCY ALERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.emergency_alerts (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    created_by UUID REFERENCES public.profiles(id),

    title TEXT NOT NULL,

    description TEXT NOT NULL,

    district TEXT,

    image_url TEXT,

    active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- MISSING PERSONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.missing_persons (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    reported_by UUID REFERENCES public.profiles(id),

    full_name TEXT NOT NULL,

    age INTEGER,

    gender public.gender_type,

    last_seen_location TEXT,

    last_seen_date DATE,

    description TEXT,

    photo_url TEXT,

    found BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- BLOOD DONATION REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blood_requests (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    requester_id UUID REFERENCES public.profiles(id),

    hospital_name TEXT,

    patient_name TEXT,

    blood_group TEXT,

    district TEXT,

    urgency TEXT,

    contact_phone TEXT,

    fulfilled BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

COMMIT;