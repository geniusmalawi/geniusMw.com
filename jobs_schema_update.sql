-- Jobs schema update for the AI vacancy workflow
-- Safe to run multiple times with ALTER TABLE ... ADD COLUMN IF NOT EXISTS

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS application_link TEXT,
    ADD COLUMN IF NOT EXISTS job_type TEXT,
    ADD COLUMN IF NOT EXISTS application_email TEXT,
    ADD COLUMN IF NOT EXISTS application_website TEXT,
    ADD COLUMN IF NOT EXISTS attachment_url TEXT,
    ADD COLUMN IF NOT EXISTS salary TEXT,
    ADD COLUMN IF NOT EXISTS salary_type TEXT,
    ADD COLUMN IF NOT EXISTS company_website TEXT,
    ADD COLUMN IF NOT EXISTS company_email TEXT,
    ADD COLUMN IF NOT EXISTS company_phone TEXT,
    ADD COLUMN IF NOT EXISTS company_description TEXT,
    ADD COLUMN IF NOT EXISTS external_url TEXT,
    ADD COLUMN IF NOT EXISTS qualifications TEXT,
    ADD COLUMN IF NOT EXISTS responsibilities TEXT,
    ADD COLUMN IF NOT EXISTS requirements TEXT,
    ADD COLUMN IF NOT EXISTS benefits TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS employment_type TEXT,
    ADD COLUMN IF NOT EXISTS location TEXT,
    ADD COLUMN IF NOT EXISTS deadline DATE,
    ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS urgent BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS vacancies INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS district TEXT,
    ADD COLUMN IF NOT EXISTS experience TEXT,
    ADD COLUMN IF NOT EXISTS skills TEXT,
    ADD COLUMN IF NOT EXISTS languages TEXT,
    ADD COLUMN IF NOT EXISTS industry TEXT,
    ADD COLUMN IF NOT EXISTS required_education TEXT,
    ADD COLUMN IF NOT EXISTS required_experience TEXT,
    ADD COLUMN IF NOT EXISTS required_skills TEXT,
    ADD COLUMN IF NOT EXISTS application_method TEXT,
    ADD COLUMN IF NOT EXISTS salary_min INTEGER,
    ADD COLUMN IF NOT EXISTS salary_max INTEGER,
    ADD COLUMN IF NOT EXISTS salary_currency TEXT,
    ADD COLUMN IF NOT EXISTS work_mode TEXT,
    ADD COLUMN IF NOT EXISTS job_level TEXT,
    ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS allow_in_applications BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS physical_address TEXT,
    ADD COLUMN IF NOT EXISTS contact_person TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Helpful indexes for the workflow
CREATE INDEX IF NOT EXISTS idx_jobs_category ON public.jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON public.jobs(deadline);
CREATE INDEX IF NOT EXISTS idx_jobs_featured ON public.jobs(featured);
