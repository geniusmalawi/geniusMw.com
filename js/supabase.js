// =====================================================================
// GENIUS MALAWI - CENTRAL SUPABASE CLIENT & CORE SDK
// Location: js/supabase.js
// Purpose: Initializes the single, unified Supabase connection securely, 
//          configures authentication routines, enforces file security 
//          validation, and manages central storage.
// Dependencies: js/env.js (Imported directly as an ES Module dependency)
// =====================================================================

import { ENV } from './env.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Retrieve credentials strictly from the imported global configuration object
const SUPABASE_URL = ENV?.SUPABASE_URL;
const SUPABASE_ANON_KEY = ENV?.SUPABASE_ANON_KEY;

// Strict Configuration Guardrail (Prevents connection attempts with undefined or placeholder states)
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const securityError = 'GENIUS MALAWI Security Exception: The Supabase connection credentials could not be resolved. Ensure "js/env.js" contains valid keys and is imported.';
    console.error(securityError);
    alert(securityError);
    throw new Error(securityError);
}

// 1. Initialize Supabase Client with persistent session handling
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// ==========================================
// 2. SECURITY & FILE VALIDATION RULES
// ==========================================

const EXECUTABLE_BLOCKLIST = [
    'exe', 'bat', 'sh', 'cmd', 'msi', 'bin', 'com', 'vbs', 'scr', 'pif', 'wsf', 'cpl', 'gadget',
    'jar', 'py', 'pl', 'rb', 'msu', 'msp', 'ps1', 'reg'
];

const FILE_LIMITS = {
    avatar: { size: 5 * 1024 * 1024, mime: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] },
    cover: { size: 10 * 1024 * 1024, mime: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] },
    marketplace_img: { size: 10 * 1024 * 1024, mime: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] },
    news_img: { size: 10 * 1024 * 1024, mime: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] },
    marketplace_vid: { size: 250 * 1024 * 1024, mime: ['video/mp4'] },
    ai_pdf: { size: 50 * 1024 * 1024, mime: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] },
    payment_proof: { size: 10 * 1024 * 1024, mime: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'] },
    chat_file: { size: 25 * 1024 * 1024, mime: [] } // Subject to standard blocklist only
};

/**
 * Validates files locally prior to network transmission.
 * @param {File} file - The file object to evaluate.
 * @param {string} uploadType - The context category ('avatar', 'cover', 'marketplace_img', etc.).
 * @returns {{valid: boolean, error: string|null}} Validation status and localized message.
 */
export function validateFile(file, uploadType) {
    if (!file || !file.name) {
        return { valid: false, error: 'No file or valid file name was provided for verification.' };
    }

    const nameParts = file.name.split('.');
    if (nameParts.length < 2) {
        return { valid: false, error: 'File validation failed: Missing file extension.' };
    }

    const extension = nameParts.pop().toLowerCase();
    
    // Check strict executable blocklist
    if (EXECUTABLE_BLOCKLIST.includes(extension)) {
        return { valid: false, error: 'Security Violation: Executable and scripting formats are strictly blocked from upload.' };
    }

    const rule = FILE_LIMITS[uploadType];
    if (!rule) {
        return { valid: false, error: 'Unrecognized upload classification rule.' };
    }

    // Check size limitations
    if (file.size > rule.size) {
        const readableSize = (rule.size / (1024 * 1024)).toFixed(0) + 'MB';
        return { valid: false, error: `File size threshold exceeded. Maximum supported size is ${readableSize}.` };
    }

    // Check mime-type boundaries if defined
    if (rule.mime.length > 0 && !rule.mime.includes(file.type)) {
        return { valid: false, error: 'Unsupported file extension or format type.' };
    }

    return { valid: true, error: null };
}

// ==========================================
// 3. SECURE AUTHENTICATION API WRAPPERS
// ==========================================

export const authAPI = {
    /**
     * Registers a new platform profile using strict email validation.
     */
    async signUp(email, password, fullName) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });
        if (error) throw error;
        return data;
    },

    /**
     * Signs in an existing profile.
     */
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    /**
     * Initiates Google social single-sign-on (SSO).
     */
    async signInWithGoogle() {
        const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
        if (error) throw error;
        return data;
    },

    /**
     * Initiates Facebook social single-sign-on (SSO).
     */
    async signInWithFacebook() {
        const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'facebook' });
        if (error) throw error;
        return data;
    },

    /**
     * Sends a secure 6-digit verification code to the phone number.
     */
    async sendPhoneOTP(phone) {
        const { data, error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
        return data;
    },

    /**
     * Validates verification code submitted by user.
     */
    async verifyPhoneOTP(phone, token) {
        const { data, error } = await supabase.auth.verifyOtp({
            phone,
            token,
            type: 'sms'
        });
        if (error) throw error;
        return data;
    },

    /**
     * Destroys current session and logs out user profile.
     */
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    /**
     * Evaluates security rules to ensure user has authenticated access.
     */
    async checkSession(redirectOnFailure = true) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && redirectOnFailure) {
            console.warn('[auth] redirecting to login because no session was found', { redirectOnFailure, currentPath: window.location.pathname });
            window.location.href = '/pages/login.html';
        }
        return session;
    }
};

// ==========================================
// 4. CENTRALIZED CLOUD STORAGE CONTROLLERS
// ==========================================

function resolveBucketName(bucketName, uploadType) {
    const normalizedBucket = (bucketName || '').toLowerCase();
    const normalizedType = (uploadType || '').toLowerCase();

    if (normalizedBucket === 'marketplace' || normalizedBucket === 'marketplaces' || normalizedBucket === 'products') {
        if (normalizedType === 'avatar') return 'avatars';
        if (normalizedType === 'cover') return 'covers';
        return 'products';
    }

    if (normalizedBucket === 'businesses' || normalizedBucket === 'business') return 'business';
    if (normalizedBucket === 'payments' || normalizedBucket === 'payment') return 'verification';
    if (normalizedBucket === 'avatar') return 'avatars';
    if (normalizedBucket === 'cover') return 'covers';
    if (normalizedBucket === 'news' || normalizedType === 'news_img') return 'news';

    return normalizedBucket;
}

export const storageAPI = {
    /**
     * Securely uploads checked file assets directly to Supabase storage buckets.
     * @param {File} file - Validated file.
     * @param {string} bucketName - Target bucket ('avatars', 'marketplace', 'businesses', 'payments', 'documents').
     * @param {string} uploadType - Rules mapping type.
     * @returns {Promise<string>} Public edge URL of resource.
     */
    async uploadFile(file, bucketName, uploadType) {
        console.log('Uploading News Image...');
        console.log('Bucket:', bucketName);
        console.log('Classification:', uploadType);

        // Enforce script-level guardrail before execution
        const validation = validateFile(file, uploadType);
        if (!validation.valid) {
            console.error('Upload validation failed:', validation.error);
            throw new Error(validation.error);
        }

        const session = await authAPI.checkSession(true);
        const fileExt = file.name.split('.').pop();
        const secureFileName = `${session.user.id}/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
        const resolvedBucketName = resolveBucketName(bucketName, uploadType);
        console.log('Upload Path:', secureFileName);
        console.log('Resolved bucket:', resolvedBucketName);

        const { data, error } = await supabase.storage
            .from(resolvedBucketName)
            .upload(secureFileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Upload failed:', error);
            throw error;
        }

        // Obtain dynamic resource address mapping
        const { data: { publicUrl } } = supabase.storage
            .from(resolvedBucketName)
            .getPublicUrl(data.path);

        console.log('Upload Success');
        console.log('Upload Path:', data.path);
        console.log('Upload URL:', publicUrl);
        console.log('Upload Bucket:', resolvedBucketName);

        // Return both the public URL and the internal storage path for deletion later
        return { publicUrl, path: data.path, bucket: resolvedBucketName };
    },

    /**
     * Remove a file from storage by bucket and path
     * @param {string} bucketName
     * @param {string} path
     */
    async removeFile(bucketName, path) {
        const resolvedBucketName = resolveBucketName(bucketName);
        if (!path) return;
        const { error } = await supabase.storage.from(resolvedBucketName).remove([path]);
        if (error) throw error;
        return true;
    }
};