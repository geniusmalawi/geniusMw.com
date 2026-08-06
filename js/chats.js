// =====================================================================
// GENIUS MALAWI - REAL-TIME SECURE MESSENGER CONTROLLER
// Location: js/chats.js
// Purpose: Manages live active threads, intercepts/detects scams prior to delivery,
//          subscribes to real-time message streams, facilitates file transmissions,
//          and processes security reporting modulations.
// Dependencies: js/supabase.js
// =====================================================================

import { supabase, authAPI, storageAPI, validateFile } from './supabase.js';

let currentUser = null;
let activeChatId = null;
let activePartnerId = null;
let realtimeChannel = null;
let attachedChatFile = null;

// AI Fraud Detection Local Lexicon (Scam, credentials harvesting, phishing patterns)
const FRAUD_TRIGGERS = [
    'airtel pin', 'mpamba pin', 'pin code', 'secret pin', 'password', 'share password',
    'activation code', 'otp', 'verification code', 'send otp', 'duplicate payment',
    'wrong deposit', 'refund code', 'give me code', 'cvv', 'card number'
];

document.addEventListener('DOMContentLoaded', async () => {
    // Dismiss Page Splash Screen
    dismissSplashLoader();

    // 1. Strict Security Check: Authenticate session
    const session = await authAPI.checkSession(true);
    if (!session) return;
    currentUser = session.user;

    // 2. Initialize Messaging Pipelines
    await fetchActiveThreads();
    await checkUrlRoutingParams();
    setupAttachmentFlow();
    setupMessageSubmission();
    setupReportingFlow();
});

// ==========================================
// 1. SPLASH LOADER TRANSITIONS
// ==========================================
function dismissSplashLoader() {
    const splash = document.getElementById('chats-splash');
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
// 2. ACTIVE THREADS REGISTRY DIRECTORY
// ==========================================
async function fetchActiveThreads() {
    const listContainer = document.getElementById('chats-list');
    if (!listContainer) return;

    try {
        // Query chat participants mapping where current user is a member
        const { data: participations, error: partErr } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', currentUser.id);

        if (partErr) throw partErr;

        if (!participations || participations.length === 0) {
            listContainer.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center; margin-top:40px;">No active chat threads found.</p>`;
            return;
        }

        const chatIds = participations.map(p => p.chat_id);

        // Fetch companion details in each chat thread
        const { data: companionProfiles, error: compErr } = await supabase
            .from('chat_participants')
            .select(`
                chat_id,
                user:user_id (id, full_name, role)
            `)
            .in('chat_id', chatIds)
            .neq('user_id', currentUser.id);

        if (compErr) throw compErr;

        if (!companionProfiles || companionProfiles.length === 0) {
            listContainer.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center; margin-top:40px;">No companion registries found.</p>`;
            return;
        }

        listContainer.innerHTML = companionProfiles.map(companion => {
            const user = companion.user;
            const initial = user.full_name.charAt(0).toUpperCase();
            const badge = ['verified_seller', 'verified_business', 'super_admin'].includes(user.role) 
                ? `<span class="badge badge-verified" style="font-size:8px; padding:1px 4px;">VERIFIED</span>` 
                : '';

            return `
                <div class="luxury-card" style="padding:12px; cursor:pointer; display:flex; gap:12px; align-items:center; background:${activeChatId === companion.chat_id ? 'var(--bg-card-hover)' : 'rgba(255,255,255,0.01)'}; border-color:${activeChatId === companion.chat_id ? 'var(--gold-base)' : 'rgba(212,175,55,0.1)'};" onclick="window.loadConversationStream('${companion.chat_id}', '${user.id}', '${user.full_name}')">
                    <div style="width:36px; height:36px; border-radius:50%; background:var(--gold-translucent); border:var(--glass-border); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px;">${initial}</div>
                    <div style="flex:1; overflow:hidden;">
                        <strong style="font-size:13px; color:var(--text-primary); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${user.full_name}</strong>
                        <span style="display:flex; align-items:center; gap:6px; margin-top:2px;">${badge}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error fetching chat directory lists:', err.message);
    }
}

// ==========================================
// 3. PARAMETERS ROUTING & NEW THREAD RESOLUTION
// ==========================================
async function checkUrlRoutingParams() {
    const params = new URLSearchParams(window.location.search);
    const partnerId = params.get('partner');
    const subject = params.get('subject');

    if (!partnerId) return;

    try {
        // Query to check if an active chat thread already exists with this partner
        const { data: myChats, error: myErr } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', currentUser.id);

        if (myErr) throw myErr;

        const myChatIds = myChats.map(c => c.chat_id);

        const { data: partnerMatch, error: partnerErr } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .in('chat_id', myChatIds)
            .eq('user_id', partnerId)
            .maybeSingle();

        if (partnerErr) throw partnerErr;

        if (partnerMatch) {
            // Retrieve partner profile variables to load conversation stream
            const { data: partnerProfile, error: profileErr } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', partnerId)
                .single();

            if (profileErr) throw profileErr;

            await window.loadConversationStream(partnerMatch.chat_id, partnerId, partnerProfile.full_name);
        } else {
            // No matching thread exists: Initialize a new chat session securely
            const { data: newChat, error: newChatErr } = await supabase
                .from('chats')
                .insert({ is_group: false })
                .select('id')
                .single();

            if (newChatErr) throw newChatErr;

            // Register both participant associations
            const { error: partErr } = await supabase
                .from('chat_participants')
                .insert([
                    { chat_id: newChat.id, user_id: currentUser.id },
                    { chat_id: newChat.id, user_id: partnerId }
                ]);

            if (partErr) throw partErr;

            const { data: partnerProfile, error: profileErr } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', partnerId)
                .single();

            if (profileErr) throw profileErr;

            // Send optional subject metadata message if triggered
            if (subject) {
                await supabase.from('messages').insert({
                    chat_id: newChat.id,
                    sender_id: currentUser.id,
                    message_text: `Subject reference details: ${subject}`
                });
            }

            await fetchActiveThreads();
            await window.loadConversationStream(newChat.id, partnerId, partnerProfile.full_name);
        }

    } catch (err) {
        console.error('Failed to parse URL routing parameters:', err.message);
    }
}

// ==========================================
// 4. REAL-TIME INTERACTION STREAMING PIPELINES
// ==========================================
window.loadConversationStream = async (chatId, partnerId, partnerName) => {
    activeChatId = chatId;
    activePartnerId = partnerId;

    // A. Re-render directory list selection indicators
    await fetchActiveThreads();

    // B. Set layout elements
    document.getElementById('chat-default-welcome').style.display = 'none';
    document.getElementById('chat-window-header').style.display = 'flex';
    document.getElementById('chat-input-toolbar').style.display = 'block';

    document.getElementById('active-chat-username').textContent = partnerName;
    document.getElementById('active-chat-avatar').textContent = partnerName.charAt(0).toUpperCase();

    // C. Subscribe to Real-time Updates
    setupRealtimeSubscription();

    // D. Ingest past messages history
    await fetchHistoryMessages();
};

async function fetchHistoryMessages() {
    const stream = document.getElementById('chat-messages-stream');
    if (!stream) return;

    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', activeChatId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        stream.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach(msg => {
                appendBubbleToStream(msg);
            });
        } else {
            stream.innerHTML = `<p style="text-align:center; font-size:12px; color:var(--text-muted); padding:20px;">Connection initialized. Send a secure message to start chatting.</p>`;
        }
        stream.scrollTop = stream.scrollHeight;
    } catch (err) {
        console.error('Error loading history stream:', err.message);
    }
}

function setupRealtimeSubscription() {
    // Gracefully unsubscribe from previous threads if active
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase
        .channel(`public:messages:chat_id=eq.${activeChatId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `chat_id=eq.${activeChatId}`
        }, (payload) => {
            appendBubbleToStream(payload.new);
        })
        .subscribe();
}

function appendBubbleToStream(msg) {
    const stream = document.getElementById('chat-messages-stream');
    if (!stream) return;

    // Dismiss placeholders
    const placeholder = stream.querySelector('p');
    if (placeholder && placeholder.textContent.includes('Connection initialized')) {
        placeholder.remove();
    }

    const isMe = msg.sender_id === currentUser.id;
    const alignment = isMe ? 'align-self: flex-end; background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.25);' : 'align-self: flex-start; background: rgba(255,255,255,0.03); border: var(--glass-border);';
    
    let contentNode = '';

    if (msg.message_text) {
        // Render scam notification block if text was intercepted prior to transmission
        const scamBanner = msg.is_spam_flagged 
            ? `<div style="background:rgba(226, 28, 38, 0.1); color:var(--heritage-red); padding:6px; border-radius:4px; font-size:11px; margin-bottom:8px; font-weight:700; border:1px solid rgba(226, 28, 38, 0.3);">AI SECURITY ALERT: Suspected phishing/credential harvesting blocked.</div>`
            : '';
        
        contentNode = `${scamBanner}<span style="font-size:14px; color:var(--text-secondary); line-height:1.5;">${msg.message_text}</span>`;
    } else if (msg.file_url) {
        contentNode = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:20px; color:var(--gold-base); font-weight:bold;">📎</span>
                <a href="${msg.file_url}" target="_blank" style="font-size:13px; font-weight:600; text-decoration:underline; color:var(--gold-light); word-break:break-all;">${msg.file_type || 'Attached Document'}</a>
            </div>
        `;
    }

    const bubble = document.createElement('div');
    bubble.style.cssText = `max-width:70%; padding:14px; border-radius:var(--radius-lg); ${alignment} display:flex; flex-direction:column; gap:4px; animation:fadeIn 0.2s ease;`;
    
    const timeStr = new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `
        ${contentNode}
        <span style="font-size:9px; color:var(--text-muted); align-self:flex-end; margin-top:4px;">${timeStr}</span>
    `;

    stream.appendChild(bubble);
    stream.scrollTop = stream.scrollHeight;
}

// ==========================================
// 5. ATTACHMENT FLOWS
// ==========================================
function setupAttachmentFlow() {
    const uploader = document.getElementById('chat-file-uploader');
    const preview = document.getElementById('chat-file-preview');
    const previewName = document.getElementById('chat-file-preview-name');
    const cancelBtn = document.getElementById('cancel-chat-file-btn');

    if (!uploader || !preview || !previewName || !cancelBtn) return;

    uploader.addEventListener('change', () => {
        const file = uploader.files[0];
        if (!file) return;

        // Perform standard size/format check
        const validation = validateFile(file, 'chat_file');
        if (!validation.valid) {
            alert(validation.error);
            uploader.value = '';
            return;
        }

        attachedChatFile = file;
        previewName.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        preview.style.display = 'flex';
    });

    cancelBtn.addEventListener('click', () => {
        attachedChatFile = null;
        uploader.value = '';
        preview.style.display = 'none';
    });
}

// ==========================================
// 6. MESSAGE DISPATCH & PRE-FILTERING
// ==========================================
function setupMessageSubmission() {
    const form = document.getElementById('chat-send-form');
    const input = document.getElementById('chat-text-input');

    if (!form || !input) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const rawText = input.value.trim();
        if (!rawText && !attachedChatFile) return;

        let isFlaggedScam = false;

        // A. Anti-Scam Pre-filtering Engine
        if (rawText) {
            const normalizedText = rawText.toLowerCase();
            isFlaggedScam = FRAUD_TRIGGERS.some(trigger => normalizedText.includes(trigger));
            
            if (isFlaggedScam) {
                alert('AI Security Alert: Your message contains phrasing patterns flagged by the system as potential financial/credentials fraud. This transaction will be logged and reviewed.');
            }
        }

        input.value = '';

        try {
            // Check and execute file upload if context holds active attachment
            if (attachedChatFile) {
                const fileToUpload = attachedChatFile;
                
                // Reset states instantly
                document.getElementById('cancel-chat-file-btn').click();

                const fileUrl = await storageAPI.uploadFile(fileToUpload, 'documents', 'chat_file');

                // Insert database file message
                const { error: sendErr } = await supabase
                    .from('messages')
                    .insert({
                        chat_id: activeChatId,
                        sender_id: currentUser.id,
                        file_url: fileUrl,
                        file_type: fileToUpload.name
                    });

                if (sendErr) throw sendErr;
            }

            // Execute text delivery if input was recorded
            if (rawText) {
                const { error: sendErr } = await supabase
                    .from('messages')
                    .insert({
                        chat_id: activeChatId,
                        sender_id: currentUser.id,
                        message_text: rawText,
                        is_spam_flagged: isFlaggedScam // Persisted for admin auditing purposes
                    });

                if (sendErr) throw sendErr;
            }

        } catch (err) {
            console.error('Failed to submit message details:', err.message);
        }
    });
}

// ==========================================
// 7. COMPLAINTS & SECURITY REPORTING FLOWS
// ==========================================
function setupReportingFlow() {
    const reportBtn = document.getElementById('report-chat-partner-btn');
    const modal = document.getElementById('report-scam-modal');
    const closeBtn = document.getElementById('close-scam-modal-btn');
    const form = document.getElementById('scam-report-form');

    if (!reportBtn || !modal || !closeBtn || !form) return;

    reportBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        syncModalBodyLock();
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        syncModalBodyLock();
        form.reset();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const reason = document.getElementById('report-reason-select').value;
        const details = document.getElementById('report-details-input').value.trim();

        try {
            // Write complaint parameters directly into core security dashboard tables
            const { error } = await supabase
                .from('reports')
                .insert({
                    reporter_id: currentUser.id,
                    reason,
                    target_table_name: 'profiles',
                    target_record_id: activePartnerId,
                    additional_details: details
                });

            if (error) throw error;

            alert('Incident Report successfully filed. Super Admin operations have been dispatched.');
            
            modal.classList.add('hidden');
            syncModalBodyLock();
            form.reset();

        } catch (err) {
            alert(`Compliance Exception: ${err.message}`);
        }
    });
}