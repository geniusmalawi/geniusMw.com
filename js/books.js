// =====================================================================
// GENIUS MALAWI - FLAGSHIP BOOKS SERVICE INTERACTIVE JS CONTROLLER
// Location: js/books.js
// Purpose: Orchestrates splash screen dismissal, structures featured syllabus
//          directories, and opens the external MEBV Education Platform inside
//          a premium secure in-app iframe overlay.
// Dependencies: None (Vanilla JS Browser Modules)
// =====================================================================

// Base URL for the official MEBV Education Platform
const MEBV_BASE_URL = 'https://mebv-education-app-mw-malawi.pages.dev/';

// Local structured metadata catalog of featured Malawian syllabus textbooks
const RECENTLY_ADDED_BOOKS = [
    { id: 'b1', title: 'MSCE Mathematics Pupil\'s Book', category: 'Secondary School', image: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=300&q=80', route: 'secondary' },
    { id: 'b2', title: 'Primary Agriculture Std 6', category: 'Primary School', image: 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?auto=format&fit=crop&w=300&q=80', route: 'primary' },
    { id: 'b3', title: 'MSCE Biology Practical Guide', category: 'Secondary School', image: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=300&q=80', route: 'secondary' },
    { id: 'b4', title: 'Introduction to Software Systems', category: 'Tertiary & Higher', image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=300&q=80', route: 'tertiary' }
];

document.addEventListener('DOMContentLoaded', () => {
    // Dismiss Page Splash Screen
    dismissSplashLoader();

    // Ingest Books grids and bind buttons
    renderFeaturedBooks();
    setupCoreLaunchTriggers();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('books-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
        }, 500);
    }
}

// ==========================================
// 2. DATA GRID RENDERERS
// ==========================================
function renderFeaturedBooks() {
    const grid = document.getElementById('featured-books-grid');
    if (!grid) return;

    grid.innerHTML = RECENTLY_ADDED_BOOKS.map(book => `
        <div class="luxury-card" style="padding: 0; display: flex; flex-direction: column; overflow: hidden; height: 100%;">
            <div style="position: relative; aspect-ratio: 1; background: #000; overflow: hidden;">
                <img src="${book.image}" alt="${book.title}" style="width: 100%; height: 100%; object-fit: cover;">
                <span class="badge badge-verified" style="position: absolute; top: 12px; right: 12px; background: rgba(5,5,5,0.75); border: var(--glass-border);">${book.category}</span>
            </div>
            <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                <h4 style="font-size: 14px; color: var(--text-primary); margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height:1.4;">${book.title}</h4>
                <button class="btn-primary" style="width: 100%; padding: 8px; font-size: 11px;" onclick="window.location.href='https://mebv-education-app-mw-malawi.pages.dev/';">Open Book</button>
            </div>
        </div>
    `).join('');
}

// ==========================================
// 3. SEAMLESS REDIRECTION & EMBEDDED IN-APP VIEWPORTS
// ==========================================
function setupCoreLaunchTriggers() {
    const launchBtn = document.getElementById('launch-library-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            window.location.href = MEBV_BASE_URL;
        });
    }
}

window.routeToMEBV = () => {
    window.location.href = MEBV_BASE_URL;
};