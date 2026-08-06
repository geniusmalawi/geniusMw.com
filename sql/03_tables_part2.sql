-- ============================================================================
-- GENIUS MALAWI
-- FILE: 03_tables_part2.sql
-- PURPOSE: Marketplace Module
-- RUN FOURTH
-- ============================================================================

BEGIN;

-- ============================================================================
-- MARKETPLACE LISTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_listings (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    title TEXT NOT NULL,

    description TEXT,

    category public.marketplace_category NOT NULL,

    price NUMERIC(14,2) NOT NULL DEFAULT 0,

    currency TEXT NOT NULL DEFAULT 'MWK',

    negotiable BOOLEAN DEFAULT FALSE,

    condition TEXT,

    quantity INTEGER DEFAULT 1,

    district TEXT,

    location TEXT,

    latitude DOUBLE PRECISION,

    longitude DOUBLE PRECISION,

    featured BOOLEAN DEFAULT FALSE,

    promoted BOOLEAN DEFAULT FALSE,

    views_count INTEGER DEFAULT 0,

    saves_count INTEGER DEFAULT 0,

    shares_count INTEGER DEFAULT 0,

    sold_count INTEGER DEFAULT 0,

    average_rating NUMERIC(3,2) DEFAULT 0,

    total_reviews INTEGER DEFAULT 0,

    ai_checked BOOLEAN DEFAULT FALSE,

    ai_flagged BOOLEAN DEFAULT FALSE,

    ai_reason TEXT,

    status public.listing_status NOT NULL DEFAULT 'pending',

    approved_by UUID REFERENCES public.profiles(id),

    approved_at TIMESTAMPTZ,

    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    deleted_at TIMESTAMPTZ

);

-- ============================================================================
-- PRODUCT IMAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_images (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,

    image_url TEXT NOT NULL,

    image_order INTEGER DEFAULT 1,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- PRODUCT VIDEOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_videos (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,

    video_url TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- SAVED PRODUCTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_products (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, listing_id)

);

-- ============================================================================
-- PRODUCT REVIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_reviews (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,

    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),

    review TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(listing_id, reviewer_id)

);

-- ============================================================================
-- MARKETPLACE ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_orders (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_number TEXT UNIQUE NOT NULL DEFAULT public.generate_order_number(),

    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id),

    buyer_id UUID NOT NULL REFERENCES public.profiles(id),

    seller_id UUID NOT NULL REFERENCES public.profiles(id),

    quantity INTEGER DEFAULT 1,

    amount NUMERIC(14,2) NOT NULL,

    commission NUMERIC(14,2) DEFAULT 0,

    seller_amount NUMERIC(14,2) DEFAULT 0,

    payment_method public.payment_method,

    payment_status public.payment_status DEFAULT 'pending',

    order_status public.order_status DEFAULT 'pending',

    buyer_confirmed BOOLEAN DEFAULT FALSE,

    seller_confirmed BOOLEAN DEFAULT FALSE,

    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- MARKETPLACE PAYMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_payments (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payment_number TEXT UNIQUE DEFAULT public.generate_payment_number(),

    order_id UUID REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,

    payer_id UUID REFERENCES public.profiles(id),

    amount NUMERIC(14,2),

    payment_method public.payment_method,

    payment_status public.payment_status DEFAULT 'pending',

    transaction_reference TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()

);

-- ============================================================================
-- SELLER FOLLOWERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_followers (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(seller_id,follower_id)

);

COMMIT;