-- ============================================================================
-- GENIUS MALAWI
-- FILE: 04_indexes.sql
-- PURPOSE: Performance Indexes
-- RUN SEVENTH
-- ============================================================================

BEGIN;

-- ============================================================================
-- PROFILES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email
ON public.profiles(email);

CREATE INDEX IF NOT EXISTS idx_profiles_username
ON public.profiles(username);

CREATE INDEX IF NOT EXISTS idx_profiles_role
ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_profiles_status
ON public.profiles(account_status);

CREATE INDEX IF NOT EXISTS idx_profiles_verification
ON public.profiles(verification_status);

CREATE INDEX IF NOT EXISTS idx_profiles_premium
ON public.profiles(subscription);

CREATE INDEX IF NOT EXISTS idx_profiles_country
ON public.profiles(country);

CREATE INDEX IF NOT EXISTS idx_profiles_district
ON public.profiles(district);

-- ============================================================================
-- MARKETPLACE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_marketplace_seller
ON public.marketplace_listings(seller_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_category
ON public.marketplace_listings(category);

CREATE INDEX IF NOT EXISTS idx_marketplace_status
ON public.marketplace_listings(status);

CREATE INDEX IF NOT EXISTS idx_marketplace_price
ON public.marketplace_listings(price);

CREATE INDEX IF NOT EXISTS idx_marketplace_created
ON public.marketplace_listings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_views
ON public.marketplace_listings(views_count DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_featured
ON public.marketplace_listings(featured);

CREATE INDEX IF NOT EXISTS idx_marketplace_promoted
ON public.marketplace_listings(promoted);

-- ============================================================================
-- BUSINESS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_business_owner
ON public.business_pages(owner_id);

CREATE INDEX IF NOT EXISTS idx_business_name
ON public.business_pages(business_name);

CREATE INDEX IF NOT EXISTS idx_business_verified
ON public.business_pages(verified);

CREATE INDEX IF NOT EXISTS idx_business_category
ON public.business_pages(category);

-- ============================================================================
-- NEWS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_news_author
ON public.news(author_id);

CREATE INDEX IF NOT EXISTS idx_news_status
ON public.news(status);

CREATE INDEX IF NOT EXISTS idx_news_created
ON public.news(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_featured
ON public.news(featured);

-- ============================================================================
-- JOBS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_jobs_company
ON public.jobs(company_name);

CREATE INDEX IF NOT EXISTS idx_jobs_status
ON public.jobs(status);

CREATE INDEX IF NOT EXISTS idx_jobs_deadline
ON public.jobs(deadline);

-- ============================================================================
-- POSTS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_posts_user
ON public.posts(user_id);

CREATE INDEX IF NOT EXISTS idx_posts_created
ON public.posts(created_at DESC);

-- ============================================================================
-- REELS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_reels_user
ON public.reels(user_id);

CREATE INDEX IF NOT EXISTS idx_reels_created
ON public.reels(created_at DESC);

-- ============================================================================
-- STORIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_stories_user
ON public.stories(user_id);

CREATE INDEX IF NOT EXISTS idx_stories_expiry
ON public.stories(expires_at);

-- ============================================================================
-- CHAT
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON public.messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_sender
ON public.messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_created
ON public.messages(created_at DESC);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notifications_user
ON public.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_read
ON public.notifications(is_read);

-- ============================================================================
-- REPORTS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_reports_status
ON public.reports(status);

CREATE INDEX IF NOT EXISTS idx_reports_type
ON public.reports(report_type);

-- ============================================================================
-- ORDERS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_buyer
ON public.marketplace_orders(buyer_id);

CREATE INDEX IF NOT EXISTS idx_orders_seller
ON public.marketplace_orders(seller_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON public.marketplace_orders(order_status);

-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_payments_order
ON public.marketplace_payments(order_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
ON public.marketplace_payments(payment_status);

-- ============================================================================
-- LOGIN HISTORY
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_login_user
ON public.login_history(user_id);

CREATE INDEX IF NOT EXISTS idx_login_created
ON public.login_history(created_at DESC);

-- ============================================================================
-- AI
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ai_chat_user
ON public.ai_chat_history(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_images_user
ON public.ai_generated_images(user_id);

COMMIT;