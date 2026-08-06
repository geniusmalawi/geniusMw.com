-- ============================================================================
-- GENIUS MALAWI
-- FILE: 03_tables_part3.sql
-- PURPOSE: Business Pages, News, Jobs & Social Features
-- RUN FIFTH
-- ============================================================================

BEGIN;

-- ============================================================================
-- BUSINESS PAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.business_pages (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    business_name TEXT NOT NULL,

    username TEXT UNIQUE NOT NULL,

    description TEXT,

    category TEXT NOT NULL,

    phone TEXT,

    whatsapp TEXT,

    email TEXT,

    website TEXT,

    district TEXT,

    address TEXT,

    logo_url TEXT,

    cover_photo TEXT,

    verified BOOLEAN DEFAULT FALSE,

    followers INTEGER DEFAULT 0,

    likes INTEGER DEFAULT 0,

    rating NUMERIC(3,2) DEFAULT 0,

    total_reviews INTEGER DEFAULT 0,

    response_rate INTEGER DEFAULT 100,

    average_reply_minutes INTEGER DEFAULT 0,

    total_sales INTEGER DEFAULT 0,

    completed_orders INTEGER DEFAULT 0,

    report_count INTEGER DEFAULT 0,

    is_suspended BOOLEAN DEFAULT FALSE,

    suspended_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- BUSINESS VERIFICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.business_followers (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_page_id UUID NOT NULL REFERENCES public.business_pages(id) ON DELETE CASCADE,

    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(business_page_id, follower_id)

);

ALTER TABLE public.business_pages
    ADD COLUMN IF NOT EXISTS whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.business_reviews (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES public.business_pages(id) ON DELETE CASCADE,

    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),

    comment TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(business_id, reviewer_id)

);

CREATE TABLE IF NOT EXISTS public.business_verifications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES public.business_pages(id) ON DELETE CASCADE,

    national_id_url TEXT NOT NULL,

    passport_photo_url TEXT NOT NULL,

    selfie_url TEXT NOT NULL,

    business_certificate_url TEXT,

    tax_certificate_url TEXT,

    utility_bill_url TEXT,

    status public.verification_status DEFAULT 'pending',

    reviewed_by UUID REFERENCES public.profiles(id),

    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- NEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.news (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    author_id UUID REFERENCES public.profiles(id),

    title TEXT NOT NULL,

    slug TEXT UNIQUE,

    summary TEXT,

    content TEXT NOT NULL,

    cover_image TEXT,

    category TEXT,

    tags TEXT[] DEFAULT '{}',

    views INTEGER DEFAULT 0,

    likes INTEGER DEFAULT 0,

    comments INTEGER DEFAULT 0,

    shares INTEGER DEFAULT 0,

    featured BOOLEAN DEFAULT FALSE,

    status public.news_status DEFAULT 'pending',

    published_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- JOBS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.jobs (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    employer_id UUID REFERENCES public.profiles(id),

    company_name TEXT NOT NULL,

    title TEXT NOT NULL,

    description TEXT NOT NULL,

    requirements TEXT,

    responsibilities TEXT,

    qualifications TEXT,

    experience TEXT,

    skills TEXT,

    languages TEXT,

    benefits TEXT,

    category TEXT,

    industry TEXT,

    required_education TEXT,

    required_experience TEXT,

    required_skills TEXT,

    application_method TEXT,

    application_email TEXT,

    application_website TEXT,

    logo_url TEXT,

    attachment_url TEXT,

    location TEXT,

    district TEXT,

    country TEXT,

    employment_type TEXT,

    job_level TEXT,

    vacancies INTEGER DEFAULT 1,

    work_mode TEXT,

    salary_type TEXT,

    salary_min INTEGER,

    salary_max INTEGER,

    salary_currency TEXT,

    salary TEXT,

    external_url TEXT,

    is_external BOOLEAN DEFAULT FALSE,

    allow_in_applications BOOLEAN DEFAULT TRUE,

    company_description TEXT,

    company_website TEXT,

    company_email TEXT,

    company_phone TEXT,

    physical_address TEXT,

    contact_person TEXT,

    contact_email TEXT,

    contact_phone TEXT,

    applications INTEGER DEFAULT 0,

    views INTEGER DEFAULT 0,

    featured BOOLEAN DEFAULT FALSE,

    urgent BOOLEAN DEFAULT FALSE,

    status public.job_status DEFAULT 'pending',

    deadline DATE,

    start_date DATE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- JOB APPLICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_applications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,

    applicant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    cover_letter TEXT,

    cv_url TEXT,

    status TEXT DEFAULT 'submitted',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(job_id, applicant_id)

);

-- ============================================================================
-- POSTS
-- ============================================================================

ALTER TABLE public.business_followers
    ADD COLUMN IF NOT EXISTS business_page_id UUID,
    ADD COLUMN IF NOT EXISTS follower_id UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.business_followers
    DROP CONSTRAINT IF EXISTS business_followers_business_page_id_fkey;

ALTER TABLE public.business_followers
    ADD CONSTRAINT business_followers_business_page_id_fkey
    FOREIGN KEY (business_page_id) REFERENCES public.business_pages(id) ON DELETE CASCADE;

ALTER TABLE public.business_followers
    DROP CONSTRAINT IF EXISTS business_followers_follower_id_fkey;

ALTER TABLE public.business_followers
    ADD CONSTRAINT business_followers_follower_id_fkey
    FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.business_followers
    ADD CONSTRAINT business_followers_unique UNIQUE (business_page_id, follower_id);

CREATE TABLE IF NOT EXISTS public.posts (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    business_page_id UUID REFERENCES public.business_pages(id) ON DELETE CASCADE,

    content TEXT,

    post_type TEXT DEFAULT 'text',

    image_url TEXT,

    video_url TEXT,

    visibility TEXT DEFAULT 'public',

    status TEXT DEFAULT 'published',

    review_status TEXT DEFAULT 'pending',

    is_hidden BOOLEAN DEFAULT FALSE,

    report_count INTEGER DEFAULT 0,

    likes INTEGER DEFAULT 0,

    comments INTEGER DEFAULT 0,

    shares INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- STORIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stories (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    media_url TEXT NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- REELS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reels (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    video_url TEXT NOT NULL,

    caption TEXT,

    likes INTEGER DEFAULT 0,

    comments INTEGER DEFAULT 0,

    shares INTEGER DEFAULT 0,

    views INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS business_page_id UUID REFERENCES public.business_pages(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published',
    ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0;

COMMIT;