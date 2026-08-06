// =====================================================================
// GENIUS MALAWI - CAREERS & TALENT PORTAL JS CONTROLLER
// Location: js/jobs.js
// Purpose: Orchestrates splash screen dismissal, dynamic job fetching,
//          filtering by sector/location, external link toggling,
//          and Msofi AI CV/Cover Letter document generators.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI, storageAPI } from './supabase.js';

let currentUser = null;
let currentJobs = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Page Splash Screen
    dismissSplashLoader();

    // Ingest session variables using the shared auth helper
    try {
        const session = await authAPI.checkSession(false);
        if (session) {
            currentUser = session.user;
        }
    } catch (err) {
        console.error('Session initialization failed:', err.message);
    }

    // Initialize Page Modules
    await fetchActiveJobs();
    setupFilters();
    setupJobDetails();
    setupAIGenerationFlow();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('jobs-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}
function syncModalBodyLock() {
    const visibleModal = document.querySelector('.splash-screen:not(.hidden)');
    document.body.classList.toggle('modal-open', !!visibleModal);
}
// ==========================================
// 2. DATABASE INGESTION & GRID BUILDERS
// ==========================================
async function fetchActiveJobs() {
    try {
        const { data, error } = await supabase
            .from('jobs')
            .select(`*, employer:employer_id (full_name)`)
            .eq('status', 'published')
            .order('created_at', { ascending: false });

        if (error) throw error;
        currentJobs = data || [];
        renderJobsGrid(currentJobs);
    } catch (err) {
        console.error('Error fetching careers database:', err.message);
    }
}

function renderJobsGrid(jobs) {
    const grid = document.getElementById('jobs-grid');
    if (!grid) return;

    if (jobs.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">No open careers matching selection criteria are indexed.</p>`;
        return;
    }

    grid.innerHTML = jobs.map(item => {
        const formattedDate = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        // Loop through candidate requirements list
        const requirements = Array.isArray(item.requirements)
            ? item.requirements
            : String(item.requirements || '').split(',').map(r => r.trim()).filter(Boolean);
        const requirementsList = requirements.length
            ? requirements.map(req => `<li style="margin-left: 16px; font-size: 12px; color: var(--text-muted);">${req}</li>`).join('')
            : '<li style="margin-left: 16px; font-size: 12px; color: var(--text-muted);">No specific requirements listed.</li>';

        // Determine action button target (external vs local contact)
        const applyAction = item.is_external
            ? `<a href="${item.external_url}" target="_blank" class="btn-primary" style="padding: 10px 16px; font-size: 12px; width: 100%; text-align: center;">Apply Externally</a>`
            : `<button class="btn-primary" style="padding: 10px 16px; font-size: 12px; width: 100%;" onclick="window.openJobDetails('${item.id}')">View Details</button>`;

        return `
            <div class="luxury-card" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <h3 style="font-size: 18px; margin-bottom: 4px; color: var(--text-primary);">${item.title}</h3>
                            <strong style="font-size: 13px; color: var(--gold-base); font-family: var(--font-body);">${item.company_name}</strong>
                        </div>
                        <span class="badge badge-verified" style="font-size: 10px;">${item.category}</span>
                    </div>

                    <div style="display: flex; gap: 12px; font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
                        <span>Location: <strong>${item.location}</strong></span>
                        <span>&bull;</span>
                        <span>Posted: <strong>${formattedDate}</strong></span>
                    </div>

                    <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px;">${item.description}</p>
                    
                    <strong style="font-size: 12px; color: var(--text-primary); display: block; margin-bottom: 8px; text-transform: uppercase;">Candidate Profile Requirements:</strong>
                    <ul style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px;">
                        ${requirementsList}
                    </ul>
                </div>
                <div style="border-top: 1px solid var(--gold-translucent); padding-top: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    ${applyAction}
                    <button class="btn-secondary" type="button" style="padding: 10px 16px; font-size: 12px;" onclick="window.toggleSaveJob('${item.id}')">${getSavedJobLabel(item.id)}</button>
                    <button class="btn-secondary" type="button" style="padding: 10px 16px; font-size: 12px;" onclick="window.shareJob('${item.id}')">Share</button>
                </div>
            </div>
        `;
    }).join('');
}

// Global action handles
window.openJobDetails = (jobId) => {
    const selectedJob = currentJobs.find(job => job.id === jobId);
    if (!selectedJob) {
        alert('Unable to locate the selected job vacancy. Please refresh the page and try again.');
        return;
    }
    renderJobDetailsModal(selectedJob);
};

window.toggleSaveJob = (jobId) => {
    const savedJobs = JSON.parse(localStorage.getItem('saved_jobs') || '[]');
    const existingIndex = savedJobs.indexOf(jobId);
    if (existingIndex >= 0) {
        savedJobs.splice(existingIndex, 1);
        localStorage.setItem('saved_jobs', JSON.stringify(savedJobs));
        alert('Job removed from saved list.');
    } else {
        savedJobs.push(jobId);
        localStorage.setItem('saved_jobs', JSON.stringify(savedJobs));
        alert('Job saved for later review.');
    }
    renderJobsGrid(currentJobs);
};

window.shareJob = (jobId) => {
    const job = currentJobs.find(item => item.id === jobId);
    if (!job) return;
    const shareText = `${job.title} at ${job.company_name} - view the job via Genius Malawi.`;
    const shareUrl = `${window.location.origin}/pages/jobs.html#job-${job.id}`;
    if (navigator.share) {
        navigator.share({ title: job.title, text: shareText, url: shareUrl }).catch(() => {
            navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
            alert('Job link copied to clipboard.');
        });
    } else {
        navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        alert('Job link copied to clipboard.');
    }
};

function getSavedJobLabel(jobId) {
    const savedJobs = JSON.parse(localStorage.getItem('saved_jobs') || '[]');
    return savedJobs.includes(jobId) ? 'Remove Save' : 'Save Job';
}

// ==========================================
// 3. SECTOR & LOCATION FILTER HANDLING
// ==========================================
function setupFilters() {
    const searchInput = document.getElementById('job-search');
    const searchBtn = document.getElementById('job-search-btn');
    const categorySelect = document.getElementById('job-category-filter');
    const locationInput = document.getElementById('job-location-filter');

    const executeFilter = () => {
        const query = searchInput.value.toLowerCase().trim();
        const sector = categorySelect.value;
        const location = locationInput.value.toLowerCase().trim();

        let filtered = [...currentJobs];

        if (query) {
            filtered = filtered.filter(item => 
                item.title.toLowerCase().includes(query) ||
                item.company_name.toLowerCase().includes(query) ||
                item.description.toLowerCase().includes(query)
            );
        }

        if (sector !== 'all') {
            filtered = filtered.filter(item => item.category === sector);
        }

        if (location) {
            filtered = filtered.filter(item => item.location.toLowerCase().includes(location));
        }

        renderJobsGrid(filtered);
    };

    if (searchBtn) searchBtn.addEventListener('click', executeFilter);
    if (categorySelect) categorySelect.addEventListener('change', executeFilter);
    if (locationInput) locationInput.addEventListener('keyup', executeFilter);
}

// ==========================================
// 4. MODALS & SLIDEOUT COMPARTMENTS
// ==========================================
function setupJobDetails() {
    const closeDetailBtn = document.getElementById('close-job-detail-btn');
    const detailModal = document.getElementById('job-detail-modal');
    const applicationForm = document.getElementById('job-detail-application-form');
    const saveBtn = document.getElementById('job-save-btn');
    const shareBtn = document.getElementById('job-share-btn');

    if (closeDetailBtn && detailModal) {
        closeDetailBtn.addEventListener('click', () => {
            detailModal.classList.add('hidden');
            syncModalBodyLock();
        });
    }

    if (applicationForm) {
        applicationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitJobApplication();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const jobId = saveBtn.dataset.jobId;
            if (jobId) window.toggleSaveJob(jobId);
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const jobId = shareBtn.dataset.jobId;
            if (jobId) window.shareJob(jobId);
        });
    }

    window.closeJobDetailModal = () => {
        if (!detailModal) return;
        detailModal.classList.add('hidden');
        syncModalBodyLock();
    };
}

// ==========================================
// 5. POSTING JOBS FORM UTILITIES
// ==========================================
async function renderJobDetailsModal(job) {
    const detailModal = document.getElementById('job-detail-modal');
    const summary = document.getElementById('job-detail-summary');
    const mainSection = document.getElementById('job-detail-main');
    const descriptionBody = document.getElementById('job-detail-description-body');
    const requirementsList = document.getElementById('job-detail-requirements-list');
    const companyBody = document.getElementById('job-detail-company-body');
    const actionsContainer = document.getElementById('job-detail-actions');
    const applicationSection = document.getElementById('job-detail-application-form');
    const saveBtn = document.getElementById('job-save-btn');
    const shareBtn = document.getElementById('job-share-btn');

    if (!detailModal || !mainSection || !descriptionBody || !requirementsList || !companyBody || !actionsContainer || !saveBtn || !shareBtn) return;

    const requirements = Array.isArray(job.requirements)
        ? job.requirements
        : String(job.requirements || '').split(',').map(r => r.trim()).filter(Boolean);

    const postedDate = job.created_at ? new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
    const deadline = job.deadline ? new Date(job.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Open until filled';
    const companyName = job.company_name || 'Employer';
    const employmentType = job.employment_type || 'Not specified';
    const jobLevel = job.job_level || 'Not specified';
    const vacancies = job.vacancies || 1;
    const workMode = job.work_mode || 'Not specified';
    const salaryType = job.salary_type || 'Not specified';
    const salaryLabel = job.salary_min || job.salary_max ? `${job.salary_currency || 'MWK'} ${job.salary_min || ''}${job.salary_min && job.salary_max ? ' - ' : ''}${job.salary_max || ''}` : job.salary || 'Negotiable';
    const companyDetails = [
        job.company_description,
        job.company_website ? `Website: <a href="${job.company_website}" target="_blank" rel="noopener">${job.company_website}</a>` : null,
        job.company_email ? `Email: <a href="mailto:${job.company_email}">${job.company_email}</a>` : null,
        job.company_phone ? `Phone: ${job.company_phone}` : null,
        job.physical_address ? `Address: ${job.physical_address}` : null,
        job.district ? `District: ${job.district}` : null,
        job.country ? `Country: ${job.country}` : null
    ].filter(Boolean).join('<br>');

    mainSection.innerHTML = `
        <div style="display:grid; gap:10px;">
            <div>
                <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <h3 style="margin:0; color: var(--text-primary); font-size: 22px;">${job.title}</h3>
                        <p style="margin:4px 0 0; color: var(--text-muted); font-size: 13px;">${companyName} • ${job.category || 'General'} • ${job.location || 'Location not specified'}</p>
                    </div>
                    <span class="badge badge-premium" style="font-size: 11px; padding: 8px 12px;">${job.status?.toUpperCase() || 'OPEN'}</span>
                </div>
                <div style="display:grid; gap:8px; font-size: 12px; color: var(--text-secondary); line-height:1.6;">
                    <p><strong>Employment Type:</strong> ${employmentType}</p>
                    <p><strong>Job Level:</strong> ${jobLevel}</p>
                    <p><strong>Vacancies:</strong> ${vacancies}</p>
                    <p><strong>Work Mode:</strong> ${workMode}</p>
                    <p><strong>Salary:</strong> ${salaryLabel} (${salaryType})</p>
                    <p><strong>Deadline:</strong> ${deadline}</p>
                    <p><strong>Posted:</strong> ${postedDate}</p>
                </div>
            </div>
            <div style="display:grid; gap:10px;">
                ${job.featured ? '<span class="badge badge-premium">Featured</span>' : ''}
                ${job.urgent ? '<span class="badge badge-danger">Urgent</span>' : ''}
                <span class="badge badge-secondary">Open for applications</span>
            </div>
        </div>
    `;

    descriptionBody.textContent = job.description || 'No description available at this time.';
    requirementsList.innerHTML = requirements.length
        ? requirements.map(req => `<li style="margin-bottom: 8px; color: var(--text-secondary);">${req}</li>`).join('')
        : '<li style="color: var(--text-muted);">No requirements specified.</li>';
    companyBody.innerHTML = companyDetails || '<span style="color: var(--text-muted);">No employer details listed.</span>';

    actionsContainer.innerHTML = job.is_external
        ? `<a href="${job.external_url}" target="_blank" class="btn-primary" style="width:100%; text-align:center; padding:12px 16px;">Apply Externally</a>`
        : `<button id="job-apply-action-btn" class="btn-primary" type="button" style="width:100%; padding:12px 16px;">Apply Now</button>`;

    applicationSection.classList.add('hidden');
    applicationSection.dataset.jobId = job.id;
    saveBtn.dataset.jobId = job.id;
    shareBtn.dataset.jobId = job.id;
    saveBtn.textContent = getSavedJobLabel(job.id);
    shareBtn.textContent = 'Share Job';

    const applyActionBtn = document.getElementById('job-apply-action-btn');
    if (applyActionBtn) {
        applyActionBtn.addEventListener('click', () => {
            if (!currentUser) {
                alert('Please sign in to submit an application.');
                window.location.href = 'login.html';
                return;
            }
            applicationSection.classList.remove('hidden');
            const nameInput = document.getElementById('application-full-name');
            const emailInput = document.getElementById('application-email');
            const phoneInput = document.getElementById('application-phone');
            if (nameInput) nameInput.value = currentUser.user_metadata?.full_name || currentUser.email || '';
            if (emailInput) emailInput.value = currentUser.email || '';
            if (phoneInput) phoneInput.value = currentUser.user_metadata?.phone || '';
            applicationForm.dataset.jobId = job.id;
        });
    }

    detailModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

async function submitJobApplication() {
    const form = document.getElementById('job-application-form');
    if (!form) return;
    const jobId = form.dataset.jobId;
    if (!jobId) {
        alert('Unable to determine which job you are applying to.');
        return;
    }

    const fullName = document.getElementById('application-full-name').value.trim();
    const email = document.getElementById('application-email').value.trim();
    const phone = document.getElementById('application-phone').value.trim();
    const district = document.getElementById('application-district').value.trim();
    const portfolio = document.getElementById('application-portfolio').value.trim();
    const linkedin = document.getElementById('application-linkedin').value.trim();
    const expectedSalary = document.getElementById('application-expected-salary').value.trim();
    const availabilityDate = document.getElementById('application-availability-date').value || null;
    const coverLetter = document.getElementById('application-cover-letter').value.trim();
    const cvFile = document.getElementById('application-cv').files[0];
    const certificatesFile = document.getElementById('application-certificates').files[0];

    if (!fullName || !email || !phone || !district || !cvFile) {
        alert('Please complete all required application fields and upload your CV.');
        return;
    }

    try {
        const submitBtn = document.getElementById('application-submit-btn');
        submitBtn.textContent = 'Submitting application...';
        submitBtn.disabled = true;

        const cvUrl = await storageAPI.uploadFile(cvFile, 'documents', 'ai_pdf');
        let certificatesUrl = null;
        if (certificatesFile) {
            certificatesUrl = await storageAPI.uploadFile(certificatesFile, 'documents', 'ai_pdf');
        }

        const { error } = await supabase.from('job_applications').insert({
            job_id: jobId,
            applicant_id: currentUser.id,
            applicant_name: fullName,
            applicant_email: email,
            applicant_phone: phone,
            district,
            portfolio_url: portfolio || null,
            linkedin_url: linkedin || null,
            expected_salary: expectedSalary || null,
            availability_date: availabilityDate,
            cover_letter: coverLetter || null,
            cv_url: cvUrl,
            certificates_url: certificatesUrl,
            status: 'submitted'
        });

        if (error) throw error;
        alert('Application submitted successfully.');
        form.reset();
        document.getElementById('job-detail-application-form').classList.add('hidden');
        window.closeJobDetailModal();
    } catch (err) {
        alert(err.message || 'Unable to submit your application at this time.');
    } finally {
        const submitBtn = document.getElementById('application-submit-btn');
        submitBtn.textContent = 'Submit Application';
        submitBtn.disabled = false;
    }
}

// ==========================================
// 6. MSOFI AI INTELLIGENCE BUILDERS (CV & COVER LETTERS)
// ==========================================
function setupAIGenerationFlow() {
    const form = document.getElementById('ai-cv-form');
    const generateBtn = document.getElementById('generate-ai-doc-btn');
    const outputBox = document.getElementById('ai-document-output-box');
    const outputContent = document.getElementById('ai-doc-content-display');
    const copyBtn = document.getElementById('copy-ai-doc-btn');
    const openAICVBtn = document.getElementById('open-ai-cv-btn');
    const closeAICVBtn = document.getElementById('close-ai-cv-btn');
    const aiCvModal = document.getElementById('ai-cv-modal');

    if (openAICVBtn && aiCvModal) {
        openAICVBtn.addEventListener('click', () => {
            aiCvModal.classList.remove('hidden');
            syncModalBodyLock();
        });
    }

    if (closeAICVBtn && aiCvModal) {
        closeAICVBtn.addEventListener('click', () => {
            aiCvModal.classList.add('hidden');
            syncModalBodyLock();
        });
    }

    if (!form || !generateBtn || !outputBox || !outputContent || !copyBtn) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const docType = document.getElementById('ai-document-type').value;
        const targetRole = document.getElementById('ai-target-role').value.trim();
        const rawHistory = document.getElementById('ai-raw-history').value.trim();

        try {
            generateBtn.textContent = 'Msofi constructing document...';
            generateBtn.disabled = true;

            outputBox.style.display = 'none';

            // Packages comprehensive system prompts
            const systemPrompt = `Build a professional, ready-to-deploy ${docType === 'cv' ? 'Curriculum Vitae (CV)' : 'Job Cover Letter'} customized specifically targeting the role: "${targetRole}". Parse and utilize the following credential history: "${rawHistory}". Return standard uppercase section headings, clean spacing alignments, and standard legal disclaimers as suitable. Use English only.`;

            // Dispatches execution directly to edge intelligence functions
            const { data, error } = await supabase.functions.invoke('msofi-ai', {
                body: { message: systemPrompt, mode: 'writer' }
            });

            if (error) throw error;

            outputContent.textContent = data.response;
            outputBox.style.display = 'block';

        } catch (err) {
            alert(`Msofi Generation Exception: ${err.message}`);
        } finally {
            generateBtn.textContent = 'Generate with Msofi AI';
            generateBtn.disabled = false;
        }
    });

    // Copy Content Clipboards
    copyBtn.addEventListener('click', () => {
        const text = outputContent.textContent;
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy Text';
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy document content:', err);
        });
    });
}