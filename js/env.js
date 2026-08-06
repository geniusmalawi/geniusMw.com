// =====================================================================
// GENIUS MALAWI - CENTRAL ENVIRONMENTAL CONFIGURATION MODULE
// Location: js/env.js
// Purpose: Declares secure production environment variables, API endpoints, 
//          and system settings globally, preventing credential leakage 
//          and facilitating seamless production deployments.
// Dependencies: None (Imported directly as an ES Module dependency)
// =====================================================================

export const ENV = {
    // Production Supabase API Connection Credentials (Verified Integration)
    SUPABASE_URL: "https://gaycwlbebemzfdbudqcz.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdheWN3bGJlYmVtemZkYnVkcWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNzY0OTcsImV4cCI6MjA5OTg1MjQ5N30.IP6uD2p6CMMINldUqo6FKyGsVUCVKQ_YGibRU0tuBs8",

    // Platform Identity Configurations
    PLATFORM_NAME: "Genius Malawi",
    PLATFORM_SLOGAN: "Connecting Malawi. Empowering Every Dream.",
    VERSION: "2026.1.0",

    // Central Helpdesk Contact Anchors
    SUPPORT_EMAIL: "geniusmalawi2026@gmail.com",
    SUPPORT_WHATSAPP: "+265897228943",
    SUPPORT_PHONE: "+265 (0) 993984344",

    // Billing Specifications
    PREMIUM_MONTHLY_RATE: 5000.00, // Malawian Kwacha (MWK)
    AIRTEL_MONEY_WALLET: "0993984344",
    TNM_MPAMBA_WALLET: "0897228943",
    NATIONAL_BANK_ACCOUNT: "1011288266"
};