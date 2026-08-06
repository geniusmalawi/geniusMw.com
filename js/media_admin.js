import { supabase, storageAPI } from './supabase.js';

// Minimal Media Admin controller for Super Admin
// Provides CRUD for Live TV, Live Radio, Videos, and Music.

const MEDIA_TAB_MAP = {
    tv: { table: 'media_live_tv', key: 'name' },
    radio: { table: 'media_radio', key: 'name' },
    videos: { table: 'media_videos', key: 'title' },
    music: { table: 'media_music', key: 'title' }
};

let currentMediaTab = 'tv';
let mediaState = {
    tv: [],
    radio: [],
    videos: [],
    music: []
};

export function initMediaAdmin() {
    bindTabControls();
    document.getElementById('media-refresh-btn')?.addEventListener('click', () => loadCurrentTab());
    document.getElementById('media-add-btn')?.addEventListener('click', () => openAddModal());
    document.getElementById('media-bulk-action-btn')?.addEventListener('click', () => performBulkAction());
    document.getElementById('media-search')?.addEventListener('input', (e) => renderMediaList());
    loadCurrentTab();
}

function bindTabControls() {
    document.querySelectorAll('.media-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.media-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMediaTab = btn.getAttribute('data-media-tab');
            loadCurrentTab();
        });
    });
}

async function loadCurrentTab() {
    const map = MEDIA_TAB_MAP[currentMediaTab];
    if (!map) return;

    const { data, error } = await supabase.from(map.table).select('*').order('display_order', { ascending: true });
    if (error) {
        console.error('Failed to load media:', error.message || error);
        showEmpty('Unable to load media.');
        return;
    }

    mediaState[currentMediaTab] = data || [];
    renderMediaList();
}

function showEmpty(message) {
    const empty = document.getElementById('media-empty-state');
    const list = document.getElementById('media-list-container');
    if (!list || !empty) return;
    list.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = message || 'No media found.';
}

function renderMediaList() {
    const list = document.getElementById('media-list-container');
    const empty = document.getElementById('media-empty-state');
    if (!list || !empty) return;

    const items = mediaState[currentMediaTab] || [];
    const q = (document.getElementById('media-search')?.value || '').toLowerCase().trim();
    const filtered = items.filter(item => {
        if (!q) return true;
        return JSON.stringify(item).toLowerCase().includes(q);
    });

    if (!filtered.length) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';

    list.innerHTML = filtered.map(item => buildMediaCard(item)).join('');

    // Attach controls
    document.querySelectorAll('.media-edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        openEditModal(id);
    }));

    document.querySelectorAll('.media-delete-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        deleteMediaItem(id);
    }));

    document.querySelectorAll('.media-duplicate-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        duplicateMediaItem(id);
    }));

    document.querySelectorAll('.media-archive-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        toggleArchiveItem(id);
    }));

    document.querySelectorAll('.media-toggle-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        const field = btn.getAttribute('data-field');
        toggleMediaFlag(id, field);
    }));

    document.querySelectorAll('.media-preview-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        previewMedia(id);
    }));

    // Drag reorder
    enableDragReorder();

    // attach selection toggles
    document.querySelectorAll('.media-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return; // ignore clicks on buttons
            card.classList.toggle('selected');
        });
    });
}

function buildMediaCard(item) {
    const title = item.title || item.name || 'Untitled';
    const thumb = item.thumbnail_url || item.logo_url || item.cover_url || '';
    const desc = item.description || '';
    const badge = item.featured ? '<span class="badge badge-verified">Featured</span>' : '';
    const status = item.status || (item.is_deleted ? 'deleted' : 'published');

    return `
        <div class="media-card luxury-card" data-id="${item.id}">
            <div style="display:flex; gap:12px; align-items:center;">
                <div style="width:88px; height:56px; background:#f1f1f1; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                    ${thumb ? `<img src="${escapeHtml(thumb)}" style="width:100%; height:100%; object-fit:cover;">` : '<div style="color:#888; font-size:12px;">No Image</div>'}
                </div>
                <div style="flex:1;">
                    <div style="display:flex; gap:8px; align-items:center;">
                        <strong>${escapeHtml(title)}</strong>
                        ${badge}
                    </div>
                    <div style="font-size:13px; color:var(--text-muted);">${escapeHtml(desc)}</div>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="btn-secondary media-preview-btn" data-id="${item.id}">Preview</button>
                    <button class="btn-secondary media-duplicate-btn" data-id="${item.id}">Duplicate</button>
                    <button class="btn-secondary media-toggle-btn" data-id="${item.id}" data-field="featured">${item.featured ? 'Unfeature' : 'Feature'}</button>
                    <button class="btn-secondary media-archive-btn" data-id="${item.id}">${item.is_archived ? 'Restore' : 'Archive'}</button>
                    <button class="btn-secondary media-edit-btn" data-id="${item.id}">Edit</button>
                    <button class="btn-danger media-delete-btn" data-id="${item.id}">Delete</button>
                </div>
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function enableDragReorder() {
    const container = document.getElementById('media-list-container');
    let dragEl = null;
    container.querySelectorAll('.media-card').forEach(card => {
        card.draggable = true;
        card.addEventListener('dragstart', (e) => { dragEl = card; card.style.opacity = '0.4'; });
        card.addEventListener('dragend', (e) => { dragEl = null; card.style.opacity = '1'; });
        card.addEventListener('dragover', (e) => { e.preventDefault(); });
        card.addEventListener('drop', async (e) => {
            e.preventDefault();
            if (!dragEl || dragEl === card) return;
            const container = dragEl.parentNode;
            container.insertBefore(dragEl, card.nextSibling);
            await saveReorder();
        });
    });
}

async function saveReorder() {
    const ids = Array.from(document.querySelectorAll('.media-card')).map((el, idx) => ({ id: el.getAttribute('data-id'), order: idx }));
    const table = MEDIA_TAB_MAP[currentMediaTab].table;
    // perform updates in batch
    for (const item of ids) {
        await supabase.from(table).update({ display_order: item.order }).eq('id', item.id);
    }
    await loadCurrentTab();
}

function openAddModal() {
    openMediaModal({ mode: 'add' });
}

async function openEditModal(id) {
    const table = MEDIA_TAB_MAP[currentMediaTab].table;
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error || !data) return alert('Unable to load item for edit.');
    openMediaModal({ mode: 'edit', item: data });
}

function openMediaModal({ mode = 'add', item = {} } = {}) {
    const modal = document.getElementById('media-modal');
    const body = document.getElementById('media-modal-body');
    if (!modal || !body) return;

    const tab = currentMediaTab;
    body.innerHTML = buildModalForm(tab, mode, item);
    modal.style.display = 'flex';

    body.querySelector('.media-modal-close')?.addEventListener('click', () => { modal.style.display = 'none'; });
    body.querySelector('.media-modal-cancel')?.addEventListener('click', () => { modal.style.display = 'none'; });
    body.querySelector('.media-modal-save')?.addEventListener('click', () => saveMediaForm(tab, mode, item.id));
}

function buildModalForm(tab, mode, item) {
    const isEdit = mode === 'edit';
    const map = MEDIA_TAB_MAP[tab];
    // Build fields per tab
    if (tab === 'tv') {
        return `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3>${isEdit ? 'Edit' : 'Add New'} Live TV</h3>
                    <button class="btn-secondary media-modal-close">Close</button>
                </div>
                <div style="display:grid; gap:10px;">
                    <input id="media-name" class="form-control" placeholder="TV Name" value="${escapeHtml(item.name || '')}">
                    <input id="media-logo" type="file" class="form-control">
                    <input id="media-category" class="form-control" placeholder="Category" value="${escapeHtml(item.category || '')}">
                    <input id="media-stream-url" class="form-control" placeholder="Stream URL" value="${escapeHtml(item.stream_url || '')}">
                    <input id="media-country" class="form-control" placeholder="Country" value="${escapeHtml(item.country || '')}">
                    <textarea id="media-description" class="form-control" rows="4" placeholder="Description">${escapeHtml(item.description || '')}</textarea>
                    <div style="display:flex; gap:8px;">
                        <select id="media-status" class="form-control"><option value="online">Online</option><option value="offline">Offline</option></select>
                        <label style="display:flex; align-items:center; gap:6px;"><input id="media-featured" type="checkbox" ${item.featured ? 'checked' : ''}> Featured</label>
                    </div>
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                        <button class="btn-secondary media-modal-cancel">Cancel</button>
                        <button class="btn-primary media-modal-save">${isEdit ? 'Update' : 'Create'}</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (tab === 'radio') {
        return `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3>${isEdit ? 'Edit' : 'Add New'} Live Radio</h3>
                    <button class="btn-secondary media-modal-close">Close</button>
                </div>
                <div style="display:grid; gap:10px;">
                    <input id="media-name" class="form-control" placeholder="Station Name" value="${escapeHtml(item.name || '')}">
                    <input id="media-logo" type="file" class="form-control">
                    <input id="media-stream-url" class="form-control" placeholder="Stream URL" value="${escapeHtml(item.stream_url || '')}">
                    <input id="media-genre" class="form-control" placeholder="Genre" value="${escapeHtml(item.genre || '')}">
                    <input id="media-country" class="form-control" placeholder="Country" value="${escapeHtml(item.country || '')}">
                    <textarea id="media-description" class="form-control" rows="4" placeholder="Description">${escapeHtml(item.description || '')}</textarea>
                    <div style="display:flex; gap:8px;">
                        <select id="media-status" class="form-control"><option value="online">Online</option><option value="offline">Offline</option></select>
                        <label style="display:flex; align-items:center; gap:6px;"><input id="media-featured" type="checkbox" ${item.featured ? 'checked' : ''}> Featured</label>
                    </div>
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                        <button class="btn-secondary media-modal-cancel">Cancel</button>
                        <button class="btn-primary media-modal-save">${isEdit ? 'Update' : 'Create'}</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (tab === 'videos') {
        return `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3>${isEdit ? 'Edit' : 'Add New'} Video</h3>
                    <button class="btn-secondary media-modal-close">Close</button>
                </div>
                <div style="display:grid; gap:10px;">
                    <input id="media-title" class="form-control" placeholder="Title" value="${escapeHtml(item.title || '')}">
                    <input id="media-thumbnail" type="file" class="form-control">
                    <input id="media-video-file" type="file" class="form-control">
                    <input id="media-youtube" class="form-control" placeholder="YouTube URL" value="${escapeHtml(item.youtube_url || '')}">
                    <input id="media-vimeo" class="form-control" placeholder="Vimeo URL" value="${escapeHtml(item.vimeo_url || '')}">
                    <input id="media-category" class="form-control" placeholder="Category" value="${escapeHtml(item.category || '')}">
                    <input id="media-duration" class="form-control" placeholder="Duration (e.g. 02:30)" value="${escapeHtml(item.duration || '')}">
                    <textarea id="media-description" class="form-control" rows="4" placeholder="Description">${escapeHtml(item.description || '')}</textarea>
                    <div style="display:flex; gap:8px;">
                        <input id="media-publish-date" type="date" class="form-control" value="${item.publish_date || ''}">
                        <label style="display:flex; align-items:center; gap:6px;"><input id="media-featured" type="checkbox" ${item.featured ? 'checked' : ''}> Featured</label>
                    </div>
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                        <button class="btn-secondary media-modal-cancel">Cancel</button>
                        <button class="btn-primary media-modal-save">${isEdit ? 'Update' : 'Create'}</button>
                    </div>
                </div>
            </div>
        `;
    }

    // music
    return `
        <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3>${isEdit ? 'Edit' : 'Add New'} Music</h3>
                <button class="btn-secondary media-modal-close">Close</button>
            </div>
            <div style="display:grid; gap:10px;">
                <input id="media-title" class="form-control" placeholder="Song Title" value="${escapeHtml(item.title || '')}">
                <input id="media-artist" class="form-control" placeholder="Artist" value="${escapeHtml(item.artist || '')}">
                <input id="media-album" class="form-control" placeholder="Album" value="${escapeHtml(item.album || '')}">
                <input id="media-cover" type="file" class="form-control">
                <input id="media-audio-file" type="file" class="form-control">
                <input id="media-streaming-url" class="form-control" placeholder="Streaming URL" value="${escapeHtml(item.streaming_url || '')}">
                <input id="media-genre" class="form-control" placeholder="Genre" value="${escapeHtml(item.genre || '')}">
                <input id="media-duration" class="form-control" placeholder="Duration (e.g. 03:24)" value="${escapeHtml(item.duration || '')}">
                <textarea id="media-description" class="form-control" rows="3" placeholder="Description">${escapeHtml(item.description || '')}</textarea>
                <div style="display:flex; gap:8px;">
                    <label style="display:flex; align-items:center; gap:6px;"><input id="media-featured" type="checkbox" ${item.featured ? 'checked' : ''}> Featured</label>
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn-secondary media-modal-cancel">Cancel</button>
                    <button class="btn-primary media-modal-save">${isEdit ? 'Update' : 'Create'}</button>
                </div>
            </div>
        </div>
    `;
}

async function saveMediaForm(tab, mode, id) {
    const table = MEDIA_TAB_MAP[tab].table;
    try {
        let payload = {};
        if (tab === 'tv') {
            const name = document.getElementById('media-name').value.trim();
            const category = document.getElementById('media-category').value.trim();
            const stream_url = document.getElementById('media-stream-url').value.trim();
            const country = document.getElementById('media-country').value.trim();
            const description = document.getElementById('media-description').value.trim();
            const status = document.getElementById('media-status').value;
            const featured = document.getElementById('media-featured').checked;

            payload = { name, category, stream_url, country, description, status, featured };

            const fileInput = document.getElementById('media-logo');
            if (fileInput && fileInput.files && fileInput.files[0]) {
                const res = await storageAPI.uploadFile(fileInput.files[0], 'media', 'live-tv');
                payload.logo_url = res.publicUrl;
                payload.logo_path = res.path;
                payload.logo_bucket = res.bucket;
            }
        } else if (tab === 'radio') {
            const name = document.getElementById('media-name').value.trim();
            const stream_url = document.getElementById('media-stream-url').value.trim();
            const genre = document.getElementById('media-genre').value.trim();
            const country = document.getElementById('media-country').value.trim();
            const description = document.getElementById('media-description').value.trim();
            const status = document.getElementById('media-status').value;
            const featured = document.getElementById('media-featured').checked;
            payload = { name, stream_url, genre, country, description, status, featured };
            const fileInput = document.getElementById('media-logo');
            if (fileInput && fileInput.files && fileInput.files[0]) {
                const res = await storageAPI.uploadFile(fileInput.files[0], 'media', 'radio');
                payload.logo_url = res.publicUrl;
                payload.logo_path = res.path;
                payload.logo_bucket = res.bucket;
            }
        } else if (tab === 'videos') {
            const title = document.getElementById('media-title').value.trim();
            const category = document.getElementById('media-category').value.trim();
            const duration = document.getElementById('media-duration').value.trim();
            const description = document.getElementById('media-description').value.trim();
            const publish_date = document.getElementById('media-publish-date').value || null;
            const featured = document.getElementById('media-featured').checked;

            payload = { title, category, duration, description, publish_date, featured, status: 'published' };

            const thumbInput = document.getElementById('media-thumbnail');
            if (thumbInput && thumbInput.files && thumbInput.files[0]) {
                const res = await storageAPI.uploadFile(thumbInput.files[0], 'media', 'videos');
                payload.thumbnail_url = res.publicUrl;
                payload.thumbnail_path = res.path;
                payload.thumbnail_bucket = res.bucket;
            }

            const vidInput = document.getElementById('media-video-file');
            if (vidInput && vidInput.files && vidInput.files[0]) {
                const res = await storageAPI.uploadFile(vidInput.files[0], 'media', 'videos');
                payload.video_url = res.publicUrl;
                payload.video_path = res.path;
                payload.video_bucket = res.bucket;
            }

            const yt = document.getElementById('media-youtube').value.trim();
            const vimeo = document.getElementById('media-vimeo').value.trim();
            if (yt) payload.youtube_url = yt;
            if (vimeo) payload.vimeo_url = vimeo;
        } else {
            // music
            const title = document.getElementById('media-title').value.trim();
            const artist = document.getElementById('media-artist').value.trim();
            const album = document.getElementById('media-album').value.trim();
            const streaming_url = document.getElementById('media-streaming-url').value.trim();
            const genre = document.getElementById('media-genre').value.trim();
            const duration = document.getElementById('media-duration').value.trim();
            const description = document.getElementById('media-description').value.trim();
            const featured = document.getElementById('media-featured').checked;

            payload = { title, artist, album, streaming_url, genre, duration, description, featured, status: 'published' };

            const coverInput = document.getElementById('media-cover');
            if (coverInput && coverInput.files && coverInput.files[0]) {
                const res = await storageAPI.uploadFile(coverInput.files[0], 'media', 'music');
                payload.cover_url = res.publicUrl;
                payload.cover_path = res.path;
                payload.cover_bucket = res.bucket;
            }

            const audioInput = document.getElementById('media-audio-file');
            if (audioInput && audioInput.files && audioInput.files[0]) {
                const res = await storageAPI.uploadFile(audioInput.files[0], 'media', 'music');
                payload.audio_url = res.publicUrl;
                payload.audio_path = res.path;
                payload.audio_bucket = res.bucket;
            }
        }

        if (mode === 'edit') {
            // if replacing files, remove old ones
            const { data: existing } = await supabase.from(table).select('*').eq('id', id).single();
            if (existing) {
                // logo
                if (payload.logo_path && existing.logo_path && payload.logo_path !== existing.logo_path) {
                    try { await storageAPI.removeFile(existing.logo_bucket, existing.logo_path); } catch (e) { console.warn(e); }
                }
                // thumbnail
                if (payload.thumbnail_path && existing.thumbnail_path && payload.thumbnail_path !== existing.thumbnail_path) {
                    try { await storageAPI.removeFile(existing.thumbnail_bucket, existing.thumbnail_path); } catch (e) { console.warn(e); }
                }
                // video
                if (payload.video_path && existing.video_path && payload.video_path !== existing.video_path) {
                    try { await storageAPI.removeFile(existing.video_bucket, existing.video_path); } catch (e) { console.warn(e); }
                }
                // cover
                if (payload.cover_path && existing.cover_path && payload.cover_path !== existing.cover_path) {
                    try { await storageAPI.removeFile(existing.cover_bucket, existing.cover_path); } catch (e) { console.warn(e); }
                }
                // audio
                if (payload.audio_path && existing.audio_path && payload.audio_path !== existing.audio_path) {
                    try { await storageAPI.removeFile(existing.audio_bucket, existing.audio_path); } catch (e) { console.warn(e); }
                }
            }

            await supabase.from(table).update(payload).eq('id', id);
        } else {
            await supabase.from(table).insert(payload);
        }

        document.getElementById('media-modal').style.display = 'none';
        await loadCurrentTab();
    } catch (err) {
        console.error('Save media failed', err);
        alert('Unable to save media. Check console for details.');
    }
}

async function deleteMediaItem(id) {
    if (!confirm('Delete this item? This will remove it permanently.')) return;
    const table = MEDIA_TAB_MAP[currentMediaTab].table;
    try {
        // fetch item to know file paths
        const { data: item } = await supabase.from(table).select('*').eq('id', id).single();
        if (item) {
            // attempt to remove any storage objects referenced
            try {
                if (item.logo_bucket && item.logo_path) await storageAPI.removeFile(item.logo_bucket, item.logo_path);
                if (item.thumbnail_bucket && item.thumbnail_path) await storageAPI.removeFile(item.thumbnail_bucket, item.thumbnail_path);
                if (item.video_bucket && item.video_path) await storageAPI.removeFile(item.video_bucket, item.video_path);
                if (item.cover_bucket && item.cover_path) await storageAPI.removeFile(item.cover_bucket, item.cover_path);
                if (item.audio_bucket && item.audio_path) await storageAPI.removeFile(item.audio_bucket, item.audio_path);
            } catch (err) {
                console.warn('Failed to delete storage files:', err?.message || err);
            }
        }

        await supabase.from(table).delete().eq('id', id);
        await loadCurrentTab();
    } catch (err) {
        console.error('Delete failed', err);
        alert('Unable to delete item.');
    }
}

async function performBulkAction() {
    const action = prompt('Bulk action (delete/disable/enable/archive/restore/feature/unfeature):');
    if (!action) return;
    const selected = Array.from(document.querySelectorAll('.media-card.selected')).map(el => el.getAttribute('data-id'));
    if (!selected.length) return alert('No items selected for bulk action.');
    const table = MEDIA_TAB_MAP[currentMediaTab].table;

    try {
        if (action === 'delete') {
            if (!confirm('Delete selected items permanently?')) return;
            for (const id of selected) await deleteMediaItem(id);
        } else if (action === 'disable' || action === 'enable') {
            const val = action === 'enable';
            for (const id of selected) await supabase.from(table).update({ status: val ? 'published' : 'disabled' }).eq('id', id);
        } else if (action === 'archive' || action === 'restore') {
            const val = action === 'archive';
            for (const id of selected) await supabase.from(table).update({ is_archived: val }).eq('id', id);
        } else if (action === 'feature' || action === 'unfeature') {
            const val = action === 'feature';
            for (const id of selected) await supabase.from(table).update({ featured: val }).eq('id', id);
        } else {
            alert('Unknown bulk action');
        }

        await loadCurrentTab();
    } catch (err) {
        console.error('Bulk action failed', err);
        alert('Bulk action failed. See console for details.');
    }
}

async function toggleMediaFlag(id, field) {
    const table = MEDIA_TAB_MAP[currentMediaTab].table;
    const item = mediaState[currentMediaTab].find(i => i.id === id);
    if (!item) return;
    const newVal = !Boolean(item[field]);
    try {
        await supabase.from(table).update({ [field]: newVal }).eq('id', id);
        await loadCurrentTab();
    } catch (err) {
        console.error('Toggle failed', err);
    }
}

async function duplicateMediaItem(id) {
    const table = MEDIA_TAB_MAP[currentMediaTab].table;
    try {
        const { data: item, error } = await supabase.from(table).select('*').eq('id', id).single();
        if (error || !item) return alert('Unable to duplicate item');
        // copy metadata but not IDs or timestamps
        const copy = { ...item };
        delete copy.id;
        copy.title = (copy.title || copy.name || 'Copy') + ' (Copy)';
        copy.status = 'draft';
        copy.is_deleted = false;
        copy.is_archived = false;
        // keep file references (not duplicating binary files)
        const { data } = await supabase.from(table).insert(copy).select('*').single();
        // open in editor for review
        openEditModal(data.id);
    } catch (err) {
        console.error('Duplicate failed', err);
        alert('Unable to duplicate item.');
    }
}

async function toggleArchiveItem(id) {
    const table = MEDIA_TAB_MAP[currentMediaTab].table;
    try {
        const { data: item } = await supabase.from(table).select('*').eq('id', id).single();
        if (!item) return;
        const newVal = !Boolean(item.is_archived);
        await supabase.from(table).update({ is_archived: newVal }).eq('id', id);
        await loadCurrentTab();
    } catch (err) {
        console.error('Archive toggle failed', err);
    }
}

function previewMedia(id) {
    const item = mediaState[currentMediaTab].find(i => i.id === id);
    if (!item) return alert('Preview unavailable.');
    const modalBody = document.getElementById('media-modal-body');
    modalBody.innerHTML = buildPreviewHtml(currentMediaTab, item) + '<div style="display:flex; justify-content:flex-end; margin-top:12px;"><button class="btn-secondary media-modal-close">Close</button></div>';
    document.getElementById('media-modal').style.display = 'flex';
    document.querySelector('.media-modal-close')?.addEventListener('click', () => { document.getElementById('media-modal').style.display = 'none'; });
}

function buildPreviewHtml(tab, item) {
    if (tab === 'tv') {
        return `<div><h3>${escapeHtml(item.name)}</h3><div>${item.stream_url ? `<video src="${escapeHtml(item.stream_url)}" controls style="width:100%; max-height:480px;"></video>` : 'No stream URL'}</div><p>${escapeHtml(item.description || '')}</p></div>`;
    }
    if (tab === 'radio') {
        return `<div><h3>${escapeHtml(item.name)}</h3><div>${item.stream_url ? `<audio src="${escapeHtml(item.stream_url)}" controls style="width:100%;"></audio>` : 'No stream URL'}</div><p>${escapeHtml(item.description || '')}</p></div>`;
    }
    if (tab === 'videos') {
        if (item.video_url) return `<div><h3>${escapeHtml(item.title)}</h3><video src="${escapeHtml(item.video_url)}" controls style="width:100%; max-height:560px;"></video><p>${escapeHtml(item.description || '')}</p></div>`;
        if (item.youtube_url) return `<div><h3>${escapeHtml(item.title)}</h3><iframe src="https://www.youtube.com/embed/${extractYouTubeId(item.youtube_url)}" width="100%" height="480" frameborder="0" allowfullscreen></iframe><p>${escapeHtml(item.description || '')}</p></div>`;
        if (item.vimeo_url) return `<div><h3>${escapeHtml(item.title)}</h3><iframe src="${escapeHtml(item.vimeo_url)}" width="100%" height="480" frameborder="0" allowfullscreen></iframe><p>${escapeHtml(item.description || '')}</p></div>`;
        return `<div><h3>${escapeHtml(item.title)}</h3><p>No playable source.</p></div>`;
    }
    // music
    return `<div><h3>${escapeHtml(item.title)} — ${escapeHtml(item.artist || '')}</h3>${item.audio_url ? `<audio src="${escapeHtml(item.audio_url)}" controls style="width:100%;"></audio>` : item.streaming_url ? `<audio src="${escapeHtml(item.streaming_url)}" controls style="width:100%;"></audio>` : '<p>No playable source.</p>'}<p>${escapeHtml(item.description || '')}</p></div>`;
}

function extractYouTubeId(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
        return u.searchParams.get('v');
    } catch (err) {
        return '';
    }
}

// Auto-init when admin panel loads
window.addEventListener('load', () => {
    // Only init if media section exists
    if (document.getElementById('admin-section-media')) {
        initMediaAdmin();
    }
});
