// Progressive Web App install experience for the home page
// This script handles the install prompt, Safari guidance, service worker registration, and update notifications.

const installBtn = document.getElementById('pwa-install-btn');
const installLabel = document.getElementById('pwa-install-label');
const body = document.body;
let deferredPrompt = null;
let updateWaitingServiceWorker = null;
let isStandalone = false;
let isIos = false;
let supportsInstallPrompt = false;

function isInStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function detectIos() {
    if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opr\//i.test(navigator.userAgent);
}

function createInstallHintElement() {
    const existing = document.getElementById('pwa-install-hint');
    if (existing) return existing;

    const hint = document.createElement('div');
    hint.id = 'pwa-install-hint';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    hint.style.marginTop = '16px';
    hint.style.padding = '16px 20px';
    hint.style.borderRadius = '18px';
    hint.style.background = 'rgba(255, 255, 255, 0.08)';
    hint.style.color = '#f7f1dc';
    hint.style.fontSize = '0.96rem';
    hint.style.lineHeight = '1.6';
    hint.style.boxShadow = '0 12px 32px rgba(0,0,0,0.22)';
    hint.style.maxWidth = '680px';
    hint.style.marginLeft = 'auto';
    hint.style.marginRight = 'auto';
    hint.style.textAlign = 'left';
    hint.style.display = 'none';
    hint.style.backdropFilter = 'blur(12px)';
    hint.style.border = '1px solid rgba(212, 175, 55, 0.18)';
    hint.innerHTML = `<strong>Install Guide</strong><br /><span id="pwa-install-hint-message">Install the app for fast access and offline support.</span>`;

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Dismiss';
    button.style.marginTop = '12px';
    button.style.padding = '10px 18px';
    button.style.border = 'none';
    button.style.borderRadius = '999px';
    button.style.background = 'rgba(212, 175, 55, 0.96)';
    button.style.color = '#000';
    button.style.fontWeight = '700';
    button.style.cursor = 'pointer';
    button.addEventListener('click', () => {
        hint.style.display = 'none';
    });

    hint.appendChild(button);

    const hero = document.querySelector('main .luxury-card');
    if (hero) {
        hero.insertAdjacentElement('afterend', hint);
    }

    return hint;
}

function showInstallHint(message) {
    const hint = createInstallHintElement();
    hint.style.display = 'block';
    const messageElement = document.getElementById('pwa-install-hint-message');
    if (messageElement) {
        messageElement.textContent = message;
    }
}

function hideInstallHint() {
    const hint = document.getElementById('pwa-install-hint');
    if (hint) {
        hint.style.display = 'none';
    }
}

function updateInstallButton() {
    if (!installBtn || !installLabel) return;

    isStandalone = isInStandaloneMode();
    isIos = detectIos();

    if (isStandalone) {
        installLabel.textContent = 'Open App';
        installBtn.style.display = 'inline-flex';
        installBtn.disabled = false;
        installBtn.setAttribute('aria-label', 'Open installed app');
        hideInstallHint();
        return;
    }

    if (supportsInstallPrompt) {
        installLabel.textContent = 'Install App';
        installBtn.style.display = 'inline-flex';
        installBtn.disabled = false;
        installBtn.setAttribute('aria-label', 'Install app to your device');
        hideInstallHint();
        return;
    }

    if (isIos) {
        installLabel.textContent = 'Install App';
        installBtn.style.display = 'inline-flex';
        installBtn.disabled = false;
        installBtn.setAttribute('aria-label', 'Show install instructions for Safari');
        showInstallHint('To install: tap Share, then Add to Home Screen. This instruction is for iPhone and iPad Safari only.');
        return;
    }

    installBtn.style.display = 'none';
    hideInstallHint();
}

async function handleInstallAction() {
    if (!installBtn || !installLabel) return;

    if (isStandalone) {
        window.location.href = window.location.pathname;
        return;
    }

    if (supportsInstallPrompt && deferredPrompt) {
        installLabel.textContent = 'Installing...';
        installBtn.disabled = true;

        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;

        if (choice.outcome === 'accepted') {
            installLabel.textContent = '✓ App Installed Successfully';
            installBtn.disabled = true;
            installBtn.style.opacity = '0.9';
            hideInstallHint();
        } else {
            installLabel.textContent = 'Install App';
            installBtn.disabled = false;
            showInstallHint('Installation was canceled. Tap Install App again when ready.');
        }

        return;
    }

    if (isIos) {
        showInstallHint('Tap Share, then Add to Home Screen to install Genius Malawi on your device.');
        return;
    }

    showInstallHint('Installation is not available in this browser. Use Chrome, Edge, or Safari on supported platforms.');
}

function setupInstallButtonListener() {
    if (!installBtn) return;

    installBtn.addEventListener('click', (evt) => {
        evt.preventDefault();
        handleInstallAction().catch((err) => {
            console.error('PWA install action failed:', err);
            installLabel.textContent = 'Install App';
            installBtn.disabled = false;
        });
    });
}

function showUpdateAvailable() {
    const existing = document.getElementById('pwa-update-notice');
    if (existing) return;

    const notice = document.createElement('div');
    notice.id = 'pwa-update-notice';
    notice.style.position = 'fixed';
    notice.style.left = '16px';
    notice.style.right = '16px';
    notice.style.bottom = '22px';
    notice.style.zIndex = '9999';
    notice.style.padding = '18px 20px';
    notice.style.background = 'rgba(18, 18, 22, 0.96)';
    notice.style.border = '1px solid rgba(212, 175, 55, 0.28)';
    notice.style.color = '#f7f1dc';
    notice.style.borderRadius = '22px';
    notice.style.boxShadow = '0 20px 60px rgba(0,0,0,0.35)';
    notice.style.display = 'flex';
    notice.style.justifyContent = 'space-between';
    notice.style.alignItems = 'center';
    notice.style.gap = '16px';
    notice.style.fontSize = '0.95rem';

    const text = document.createElement('span');
    text.textContent = 'New Version Available';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Update Now';
    button.style.border = 'none';
    button.style.borderRadius = '999px';
    button.style.padding = '10px 18px';
    button.style.background = 'var(--gold-gradient)';
    button.style.color = '#000';
    button.style.fontWeight = '700';
    button.style.cursor = 'pointer';
    button.addEventListener('click', () => {
        if (!updateWaitingServiceWorker) return;
        updateWaitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
    });

    notice.appendChild(text);
    notice.appendChild(button);
    document.body.appendChild(notice);
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
            if (registration.waiting) {
                updateWaitingServiceWorker = registration.waiting;
                showUpdateAvailable();
            }

            registration.addEventListener('updatefound', () => {
                const installingWorker = registration.installing;
                if (!installingWorker) return;
                installingWorker.addEventListener('statechange', () => {
                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        updateWaitingServiceWorker = installingWorker;
                        showUpdateAvailable();
                    }
                });
            });
        })
        .catch((err) => {
            console.warn('Service worker registration failed:', err);
        });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    supportsInstallPrompt = true;
    updateInstallButton();
});

window.addEventListener('appinstalled', () => {
    installLabel.textContent = '✓ App Installed Successfully';
    installBtn.disabled = true;
    installBtn.style.opacity = '0.9';
    hideInstallHint();
});

window.addEventListener('load', () => {
    setupInstallButtonListener();
    registerServiceWorker();
    updateInstallButton();
    window.setTimeout(() => updateInstallButton(), 200);
});

window.addEventListener('resize', () => {
    updateInstallButton();
});
