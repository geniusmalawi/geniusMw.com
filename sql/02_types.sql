-- ============================================================================
-- GENIUS MALAWI
-- FILE: 02_types.sql
-- PURPOSE: All ENUM types used throughout the system
-- RUN SECOND
-- ============================================================================

BEGIN;

-- ============================================================================
-- USER ROLES
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='user_role') THEN
CREATE TYPE public.user_role AS ENUM (
'super_admin',
'user',
'business',
'seller',
'news_publisher'
);
END IF;
END$$;

-- ============================================================================
-- GENDER
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='gender_type') THEN
CREATE TYPE public.gender_type AS ENUM (
'male',
'female',
'other',
'unspecified'
);
END IF;
END$$;

-- ============================================================================
-- ACCOUNT STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='account_status') THEN
CREATE TYPE public.account_status AS ENUM (
'active',
'suspended',
'banned',
'deleted'
);
END IF;
END$$;

-- ============================================================================
-- VERIFICATION STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='verification_status') THEN
CREATE TYPE public.verification_status AS ENUM (
'pending',
'approved',
'rejected'
);
END IF;
END$$;

-- ============================================================================
-- SUBSCRIPTION PLAN
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='subscription_plan') THEN
CREATE TYPE public.subscription_plan AS ENUM (
'free',
'premium'
);
END IF;
END$$;

-- ============================================================================
-- MARKETPLACE CATEGORY
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='marketplace_category') THEN
CREATE TYPE public.marketplace_category AS ENUM (
'physical_product',
'service',
'house',
'land',
'car',
'livestock',
'job',
'rental',
'other'
);
END IF;
END$$;

-- ============================================================================
-- MARKETPLACE STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='listing_status') THEN
CREATE TYPE public.listing_status AS ENUM (
'pending',
'approved',
'rejected',
'sold',
'expired'
);
END IF;
END$$;

-- ============================================================================
-- ORDER STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='order_status') THEN
CREATE TYPE public.order_status AS ENUM (
'pending',
'accepted',
'processing',
'completed',
'cancelled',
'refunded'
);
END IF;
END$$;

-- ============================================================================
-- PAYMENT METHOD
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='payment_method') THEN
CREATE TYPE public.payment_method AS ENUM (
'airtel_money',
'tnm_mpamba',
'visa',
'mastercard',
'bank_transfer'
);
END IF;
END$$;

-- ============================================================================
-- PAYMENT STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='payment_status') THEN
CREATE TYPE public.payment_status AS ENUM (
'pending',
'paid',
'failed',
'cancelled',
'refunded'
);
END IF;
END$$;

-- ============================================================================
-- NEWS STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='news_status') THEN
CREATE TYPE public.news_status AS ENUM (
'draft',
'pending',
'published',
'archived'
);
END IF;
END$$;

-- ============================================================================
-- JOB STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='job_status') THEN
CREATE TYPE public.job_status AS ENUM (
'pending',
'published',
'closed',
'expired'
);
END IF;
END$$;

-- ============================================================================
-- CHAT MESSAGE TYPE
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='message_type') THEN
CREATE TYPE public.message_type AS ENUM (
'text',
'image',
'video',
'audio',
'file',
'location'
);
END IF;
END$$;

-- ============================================================================
-- REPORT TYPE
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='report_type') THEN
CREATE TYPE public.report_type AS ENUM (
'fake_product',
'scam',
'fake_news',
'copyright',
'message',
'business',
'profile',
'ai_abuse',
'other'
);
END IF;
END$$;

-- ============================================================================
-- REPORT STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='report_status') THEN
CREATE TYPE public.report_status AS ENUM (
'pending',
'under_review',
'resolved',
'rejected'
);
END IF;
END$$;

-- ============================================================================
-- NOTIFICATION TYPE
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='notification_type') THEN
CREATE TYPE public.notification_type AS ENUM (
'system',
'marketplace',
'payment',
'news',
'chat',
'job',
'ai',
'verification',
'promotion'
);
END IF;
END$$;

-- ============================================================================
-- ADVERTISEMENT STATUS
-- ============================================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='advert_status') THEN
CREATE TYPE public.advert_status AS ENUM (
'pending',
'approved',
'rejected',
'expired'
);
END IF;
END$$;

COMMIT;
```