-- =============================================================
-- GENIUS MALAWI - GOVERNMENT SERVICES CONTENT TABLES
-- =============================================================
-- Purpose: Adds dynamic portal, hotline, and government form support
-- while preserving compatibility with the existing app.
-- =============================================================

create extension if not exists pgcrypto;

create table if not exists public.government_portals (
    id uuid primary key default gen_random_uuid(),
    institution text not null,
    button_label text not null,
    website_url text not null,
    description text,
    display_order integer not null default 0,
    is_active boolean not null default true,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.government_hotlines (
    id uuid primary key default gen_random_uuid(),
    institution_name text not null,
    hotline_number text,
    alternative_number text,
    whatsapp_number text,
    email text,
    physical_address text,
    description text,
    category text not null default 'General',
    status text not null default 'Active',
    display_order integer not null default 0,
    icon text,
    is_active boolean not null default true,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.government_forms (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    institution text not null,
    category text not null default 'General',
    description text,
    file_url text,
    thumbnail_url text,
    file_size text,
    version text,
    publish_date date,
    status text not null default 'Active',
    is_active boolean not null default true,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_gov_portals_active_order on public.government_portals(is_active, display_order);
create index if not exists idx_gov_hotlines_active_order on public.government_hotlines(is_active, display_order);
create index if not exists idx_gov_forms_active on public.government_forms(is_active, status);

alter table public.government_portals enable row level security;
alter table public.government_hotlines enable row level security;
alter table public.government_forms enable row level security;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'government_portals' AND policyname = 'government_portals_select_all'
    ) THEN
        CREATE POLICY government_portals_select_all ON public.government_portals FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'government_portals' AND policyname = 'government_portals_manage_admin'
    ) THEN
        CREATE POLICY government_portals_manage_admin ON public.government_portals FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'government_hotlines' AND policyname = 'government_hotlines_select_all'
    ) THEN
        CREATE POLICY government_hotlines_select_all ON public.government_hotlines FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'government_hotlines' AND policyname = 'government_hotlines_manage_admin'
    ) THEN
        CREATE POLICY government_hotlines_manage_admin ON public.government_hotlines FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'government_forms' AND policyname = 'government_forms_select_all'
    ) THEN
        CREATE POLICY government_forms_select_all ON public.government_forms FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'government_forms' AND policyname = 'government_forms_manage_admin'
    ) THEN
        CREATE POLICY government_forms_manage_admin ON public.government_forms FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
END $$;

insert into public.government_portals (institution, button_label, website_url, description, display_order, is_active)
select 'Registrar General', 'Visit Registrar General Portal', 'https://www.rg.gov.mw', 'Business registration portal for Malawi', 1, true
where not exists (select 1 from public.government_portals where institution = 'Registrar General');

insert into public.government_portals (institution, button_label, website_url, description, display_order, is_active)
select 'Department of Immigration', 'Immigration Portal', 'https://www.immigration.gov.mw', 'Passport and immigration services portal', 2, true
where not exists (select 1 from public.government_portals where institution = 'Department of Immigration');

insert into public.government_portals (institution, button_label, website_url, description, display_order, is_active)
select 'DRTSS', 'Visit DRTSS Portal', 'https://www.drtss.gov.mw', 'Driver licensing and transport services portal', 3, true
where not exists (select 1 from public.government_portals where institution = 'DRTSS');

insert into public.government_portals (institution, button_label, website_url, description, display_order, is_active)
select 'MRA', 'Visit MRA Revenue Portal', 'https://www.mra.mw', 'Tax registration and revenue services portal', 4, true
where not exists (select 1 from public.government_portals where institution = 'MRA');

insert into public.government_hotlines (institution_name, hotline_number, alternative_number, whatsapp_number, email, physical_address, description, category, status, display_order, icon, is_active)
select 'National Police', '997', null, null, 'police@malawi.gov.mw', 'Lilongwe, Malawi', 'National emergency police dispatch', 'Police', 'Active', 1, '🚓', true
where not exists (select 1 from public.government_hotlines where institution_name = 'National Police');

insert into public.government_hotlines (institution_name, hotline_number, alternative_number, whatsapp_number, email, physical_address, description, category, status, display_order, icon, is_active)
select 'Ambulance / Health', '998', null, null, 'health@malawi.gov.mw', 'Lilongwe, Malawi', 'Medical ambulance dispatch', 'Ambulance', 'Active', 2, '🚑', true
where not exists (select 1 from public.government_hotlines where institution_name = 'Ambulance / Health');

insert into public.government_hotlines (institution_name, hotline_number, alternative_number, whatsapp_number, email, physical_address, description, category, status, display_order, icon, is_active)
select 'Fire Services', '999', null, null, 'fire@malawi.gov.mw', 'Lilongwe, Malawi', 'Fire emergency response', 'Fire', 'Active', 3, '🚒', true
where not exists (select 1 from public.government_hotlines where institution_name = 'Fire Services');

insert into public.government_hotlines (institution_name, hotline_number, alternative_number, whatsapp_number, email, physical_address, description, category, status, display_order, icon, is_active)
select 'ESCOM Electricity', '3726', null, null, 'customercare@escom.mw', 'Lilongwe, Malawi', 'Electricity fault reporting', 'Electricity', 'Active', 4, '⚡', true
where not exists (select 1 from public.government_hotlines where institution_name = 'ESCOM Electricity');
