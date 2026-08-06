-- ============================================================================
-- GENIUS MALAWI
-- FILE: 01_extensions.sql
-- PURPOSE: Project initialization, extensions, schemas and helper sequences
-- RUN FIRST
-- ============================================================================

BEGIN;

-- ============================================================================
-- REQUIRED EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CUSTOM SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app_private;

-- ============================================================================
-- GENIUS ID SEQUENCE
-- Produces:
-- GM00000001
-- GM00000002
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.genius_id_seq
START WITH 1
INCREMENT BY 1
MINVALUE 1
NO MAXVALUE
CACHE 1;

-- ============================================================================
-- REFERRAL CODE SEQUENCE
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.referral_seq
START WITH 100000
INCREMENT BY 1
MINVALUE 100000
NO MAXVALUE
CACHE 1;

-- ============================================================================
-- ORDER NUMBER SEQUENCE
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq
START WITH 100000
INCREMENT BY 1
MINVALUE 100000
NO MAXVALUE
CACHE 1;

-- ============================================================================
-- PAYMENT NUMBER SEQUENCE
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq
START WITH 100000
INCREMENT BY 1
MINVALUE 100000
NO MAXVALUE
CACHE 1;

-- ============================================================================
-- REPORT NUMBER SEQUENCE
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.report_number_seq
START WITH 100000
INCREMENT BY 1
MINVALUE 100000
NO MAXVALUE
CACHE 1;

-- ============================================================================
-- HELPER FUNCTION
-- Generates Genius ID
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_genius_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN 'GM' || LPAD(nextval('public.genius_id_seq')::TEXT,8,'0');
END;
$$;

-- ============================================================================
-- HELPER FUNCTION
-- Referral Code
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN 'REF' || nextval('public.referral_seq');
END;
$$;

-- ============================================================================
-- HELPER FUNCTION
-- Order Number
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN 'ORD' || nextval('public.order_number_seq');
END;
$$;

-- ============================================================================
-- HELPER FUNCTION
-- Payment Number
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_payment_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN 'PAY' || nextval('public.payment_number_seq');
END;
$$;

-- ============================================================================
-- HELPER FUNCTION
-- Report Number
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_report_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN 'REP' || nextval('public.report_number_seq');
END;
$$;

COMMIT;