import { ENV } from './env.js';

const CURRENT_VERSION = String(ENV?.VERSION || '0.0.0');
const VERSION_ENDPOINT = '/version.json';
const LAST_REFRESH_KEY = 'genius_malawi_last_refresh_version';
const REFRESH_IN_PROGRESS_KEY = 'genius_malawi_refresh_in_progress';
const REFRESH_QUERY_KEY = '__genius_refresh';

function buildRefreshUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set(REFRESH_QUERY_KEY, Date.now().toString());
    return url.toString();
}

async function fetchRemoteVersion() {
    try {
        const response = await fetch(`${VERSION_ENDPOINT}?_=${Date.now()}`, {
            cache: 'no-store',
            credentials: 'same-origin'
        });

        if (!response.ok) {
            console.warn('Version check failed with status', response.status);
            return null;
        }

        const payload = await response.json();
        return payload?.version ? String(payload.version) : null;
    } catch (err) {
        console.warn('Version check request failed:', err);
        return null;
    }
}

async function clearClientCaches() {
    if (!window.caches || !window.caches.keys) return;

    try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((cacheKey) => {
            if (cacheKey && cacheKey.toString().startsWith('geniusmw-')) {
                return caches.delete(cacheKey);
            }
            return null;
        }));
    } catch (err) {
        console.warn('Cache clearing failed:', err);
    }
}

async function updateServiceWorkerRegistration() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;

        await registration.update();
        if (registration.waiting && registration.waiting.state === 'installed') {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    } catch (err) {
        console.warn('Service worker update request failed:', err);
    }
}

async function forceReloadForNewVersion(remoteVersion) {
    if (sessionStorage.getItem(REFRESH_IN_PROGRESS_KEY)) return;

    sessionStorage.setItem(REFRESH_IN_PROGRESS_KEY, '1');
    sessionStorage.setItem(LAST_REFRESH_KEY, remoteVersion);

    await updateServiceWorkerRegistration();
    await clearClientCaches();

    window.location.replace(buildRefreshUrl());
}

async function checkForNewDeployment() {
    const remoteVersion = await fetchRemoteVersion();
    if (!remoteVersion || remoteVersion === CURRENT_VERSION) return;

    const lastRefresh = sessionStorage.getItem(LAST_REFRESH_KEY);
    if (lastRefresh === remoteVersion) return;

    await forceReloadForNewVersion(remoteVersion);
}

function installVersionCheckListeners() {
    window.addEventListener('load', () => {
        checkForNewDeployment().catch((err) => console.warn('Version check failed:', err));
    });

    window.addEventListener('focus', () => {
        checkForNewDeployment().catch((err) => console.warn('Version check failed:', err));
    });

    setInterval(() => {
        checkForNewDeployment().catch((err) => console.warn('Version check failed:', err));
    }, 10 * 60 * 1000);
}

installVersionCheckListeners();
