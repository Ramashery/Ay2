// admin.js
// Content management for nik-greb.com — reads/writes Firestore collections:
//   config/site                 (singleton: SEO / meta fields)
//   config/artDirectionExtra    (singleton: shared Art Direction assets)
//   artDirectionProjects        (one doc per project, field "discipline": web|editorial|identity|3d)
//   photoGallery                (one doc per photo, field "category": landscapes|street|animals|travel|...)
//
// NOTE: login is disabled for now (dev mode) — see bottom of this file.
// Firestore Rules are what actually protects the data at this stage, not this screen.

const firebaseConfig = {
  apiKey: "AIzaSyDzqV4NoS61WrIUd7nDoLEXrExpjz2Auvg",
  authDomain: "ayge-722bd.firebaseapp.com",
  projectId: "ayge-722bd",
  storageBucket: "ayge-722bd.firebasestorage.app",
  messagingSenderId: "623907416178",
  appId: "1:623907416178:web:da7103ea0eea2b210c7aeb",
  measurementId: "G-MM7B72315G"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- STATE ---
let siteData = { site: {}, artDirectionExtra: {}, artDirectionProjects: [], photoGallery: [] };

const DISCIPLINES = ['web', 'editorial', 'identity', '3d'];
const DISCIPLINE_LABELS_DEFAULT = { web: 'Web', editorial: 'Editorial', identity: 'Identity', '3d': '3D & Motion' };

// --- DATA LOADING ---
async function loadData() {
    console.log('Loading data from Firestore...');
    const fresh = { site: {}, artDirectionExtra: {}, artDirectionProjects: [], photoGallery: [] };
    try {
        const [siteDoc, extraDoc, artSnap, photoSnap] = await Promise.all([
            db.collection('config').doc('site').get(),
            db.collection('config').doc('artDirectionExtra').get(),
            db.collection('artDirectionProjects').get(),
            db.collection('photoGallery').get(),
        ]);
        fresh.site = siteDoc.exists ? siteDoc.data() : {};
        fresh.artDirectionExtra = extraDoc.exists ? extraDoc.data() : {};
        fresh.artDirectionProjects = artSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        fresh.photoGallery = photoSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('Data loaded.', fresh);
        return fresh;
    } catch (error) {
        console.error('Error loading data from Firestore:', error);
        alert('Error loading data. Check console. Have you run seed.html yet, and are Firestore rules allowing reads for this account?');
        return fresh;
    }
}

// --- HELPERS: field <-> textarea serialization ---
function specsToText(specs) {
    // Firestore can't store arrays-of-arrays, so specs are saved as
    // [{label, value}, ...] objects. Support both that shape and the
    // legacy [[label, value], ...] pair shape when reading.
    return (specs || []).map(s => Array.isArray(s) ? `${s[0]}: ${s[1]}` : `${s.label}: ${s.value}`).join('\n');
}
function textToSpecs(text) {
    return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        const idx = line.indexOf(':');
        if (idx === -1) return { label: line, value: '' };
        return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    });
}
function tagsToText(tags) { return (tags || []).join(', '); }
function textToTags(text) { return text.split(',').map(s => s.trim()).filter(Boolean); }
function linesToArray(text) { return text.split('\n').map(s => s.trim()).filter(Boolean); }

// --- RENDERING: Site & SEO tab ---
function renderAdminSite() {
    const container = document.querySelector('.tab-content[data-tab-content="site"]');
    if (!container) return;
    const s = siteData.site || {};
    const x = siteData.artDirectionExtra || {};

    container.innerHTML = `
    <div class="admin-section-header"><h2>Site &amp; SEO</h2></div>
    <div class="admin-item" id="admin-site-item">
        <div class="admin-item-content">
            <h4>Meta / SEO</h4>
            <label>Site Title (&lt;title&gt; tag)</label>
            <input type="text" id="site-title" value="${escAttr(s.title)}" disabled>
            <label>Meta Description</label>
            <textarea id="site-description" rows="3" disabled>${escHtml(s.description)}</textarea>
            <label>Author</label>
            <input type="text" id="site-author" value="${escAttr(s.author)}" disabled>
            <label>Base URL (no trailing slash)</label>
            <input type="text" id="site-baseUrl" value="${escAttr(s.baseUrl)}" disabled>
            <label>Open Graph Description</label>
            <textarea id="site-ogDescription" rows="3" disabled>${escHtml(s.ogDescription)}</textarea>
            <label>Open Graph Image (path from base URL)</label>
            <input type="text" id="site-ogImage" value="${escAttr(s.ogImage)}" disabled>
            <label>Default Language</label>
            <input type="text" id="site-defaultLang" value="${escAttr(s.defaultLang || 'en')}" disabled>

            <h4>Art Direction — Shared Content</h4>
            <label>Placeholder Description (used while a project card is loading)</label>
            <textarea id="ad-placeholder" rows="3" disabled>${escHtml(x.AD_PM_DESC_PLACEHOLDER)}</textarea>
            <label>Discipline Backdrop Images (JSON: {"web": "images/...", ...})</label>
            <textarea id="ad-backdrops" rows="6" disabled>${escHtml(JSON.stringify(x.DISCIPLINE_BACKDROPS || {}, null, 2))}</textarea>
            <label>Discipline Labels (JSON: {"web": "Web", ...})</label>
            <textarea id="ad-labels" rows="6" disabled>${escHtml(JSON.stringify(x.DISCIPLINE_LABELS || DISCIPLINE_LABELS_DEFAULT, null, 2))}</textarea>
        </div>
        <div class="admin-item-actions">
            <button class="admin-btn edit-btn" data-action="edit-site">Edit</button>
            <button class="admin-btn save-btn" data-action="save-site">Save</button>
        </div>
    </div>`;
}

// --- RENDERING: Art Direction tab ---
function generateArtItemFormHTML(item) {
    const disciplineOptions = DISCIPLINES.map(d =>
        `<option value="${d}" ${item.discipline === d ? 'selected' : ''}>${DISCIPLINE_LABELS_DEFAULT[d]}</option>`
    ).join('');

    return `<div class="admin-item" data-id="${item.id}" data-collection="artDirectionProjects">
        <div class="admin-item-content">
            <h4>Card</h4>
            <label>Discipline</label>
            <select class="f-discipline" disabled>${disciplineOptions}</select>
            <label>Category Label (shown on card, e.g. "Web")</label>
            <input type="text" class="f-cat" value="${escAttr(item.cat)}" disabled>
            <label>Number (e.g. "01")</label>
            <input type="text" class="f-num" value="${escAttr(item.num)}" disabled>
            <label>Sort Order (lower = first)</label>
            <input type="number" class="f-order" value="${item.order ?? 0}" disabled>
            <label>Title</label>
            <input type="text" class="f-title" value="${escAttr(item.title)}" disabled>
            <label>Subtitle</label>
            <input type="text" class="f-sub" value="${escAttr(item.sub)}" disabled>
            <label>Description (HTML allowed, e.g. &lt;a href="..."&gt;)</label>
            <textarea class="f-desc" rows="6" disabled>${escHtml(item.desc)}</textarea>

            <h4>Specs &amp; Tags</h4>
            <label>Specs — one "Label: Value" per line</label>
            <textarea class="f-specs" rows="4" disabled>${escHtml(specsToText(item.specs))}</textarea>
            <label>Tags — comma separated</label>
            <input type="text" class="f-tags" value="${escAttr(tagsToText(item.tags))}" disabled>

            <h4>Media</h4>
            <label>Background Image (path)</label>
            <input type="text" class="f-bg" value="${escAttr(item.bg)}" disabled>
            <div style="display:flex;align-items:center;gap:10px;margin-top:5px;">
                <input type="checkbox" class="f-whiteBg" id="whitebg-${item.id}" ${item.whiteBg ? 'checked' : ''} style="width:auto;" disabled>
                <label for="whitebg-${item.id}" style="margin-bottom:0;cursor:pointer;">White background card</label>
            </div>
            <label>Gallery Images — one path per line (for web / identity / most projects)</label>
            <textarea class="f-images" rows="4" disabled>${escHtml(linesToArray(item.images).join('\n') || (item.images || []).join('\n'))}</textarea>
            <label>Catalogs — JSON array, editorial multi-catalog only: [{"label":"...", "images":["..."]}]</label>
            <small class="hint">Leave as [] if this project doesn't use the catalog viewer.</small>
            <textarea class="f-catalogs" rows="5" disabled>${escHtml(JSON.stringify(item.catalogs || [], null, 2))}</textarea>
            <label>3D Model (.glb path) — 3D &amp; Motion projects only</label>
            <input type="text" class="f-model" value="${escAttr(item.model)}" disabled>
        </div>
        <div class="admin-item-actions">
            <button class="admin-btn edit-btn" data-action="edit">Edit</button>
            <button class="admin-btn save-btn" data-action="save">Save</button>
            <button class="admin-btn delete-btn" data-action="delete">Delete Forever</button>
        </div>
    </div>`;
}

function renderAdminArtDirection() {
    const container = document.querySelector('.tab-content[data-tab-content="artDirection"]');
    if (!container) return;
    const items = siteData.artDirectionProjects || [];
    const grouped = {};
    items.forEach(i => { const d = i.discipline || 'web'; (grouped[d] = grouped[d] || []).push(i); });

    const listsHTML = DISCIPLINES.map(d => {
        const groupItems = (grouped[d] || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        if (!groupItems.length) return '';
        const itemsListHTML = groupItems.map(item =>
            `<li class="admin-list-item" data-id="${item.id}" data-collection="artDirectionProjects">${escHtml(item.title) || 'Untitled'}<span class="admin-list-item-slug">#${escHtml(item.num)}</span></li>`
        ).join('');
        return `<div class="admin-group"><h4 class="group-title">${DISCIPLINE_LABELS_DEFAULT[d]} (${groupItems.length})</h4><ul class="admin-item-list">${itemsListHTML}</ul></div>`;
    }).join('');

    container.innerHTML = `
    <div class="admin-section-header"><h2>Art Direction Projects</h2><button class="admin-btn" data-action="add" data-collection="artDirectionProjects">+ Add New</button></div>
    <div class="admin-hint-box">Grouped by discipline. Click a project to open its editor below.</div>
    ${listsHTML}
    <div class="admin-item-editor-container"></div>`;
}

// --- RENDERING: Photo Gallery tab ---
function generatePhotoItemFormHTML(item) {
    return `<div class="admin-item" data-id="${item.id}" data-collection="photoGallery">
        <div class="admin-item-content">
            <h4>Category</h4>
            <label>Category slug (e.g. "travel", "landscapes", "street", "animals")</label>
            <input type="text" class="f-category" value="${escAttr(item.category)}" list="category-suggestions" disabled>
            <datalist id="category-suggestions">
                <option value="landscapes"><option value="street"><option value="animals"><option value="travel">
            </datalist>
            <label>Category Label i18n Key (e.g. "photo.cat.travel")</label>
            <input type="text" class="f-categoryLabelKey" value="${escAttr(item.categoryLabelKey)}" disabled>
            <label>Sort Order within category</label>
            <input type="number" class="f-order" value="${item.order ?? 0}" disabled>

            <h4>Photo</h4>
            <label>Image path</label>
            <input type="text" class="f-image" value="${escAttr(item.image)}" disabled>
            <label>Title (caption)</label>
            <input type="text" class="f-title" value="${escAttr(item.title)}" disabled>
            <label>Title i18n Key (optional, e.g. "photo.t.islaEnUyuni")</label>
            <input type="text" class="f-titleKey" value="${escAttr(item.titleKey)}" disabled>
            <label>Location</label>
            <input type="text" class="f-location" value="${escAttr(item.location)}" disabled>
            <label>Location i18n Key (optional)</label>
            <input type="text" class="f-locationKey" value="${escAttr(item.locationKey)}" disabled>
            <label>Camera</label>
            <input type="text" class="f-camera" value="${escAttr(item.camera)}" disabled>
            <label>Lens</label>
            <input type="text" class="f-lens" value="${escAttr(item.lens)}" disabled>
            <label>Year</label>
            <input type="text" class="f-year" value="${escAttr(item.year)}" disabled>
            <small class="hint">i18n keys only change which key is looked up in locales/*.json — editing them here doesn't translate the text; update the locale files separately.</small>
        </div>
        <div class="admin-item-actions">
            <button class="admin-btn edit-btn" data-action="edit">Edit</button>
            <button class="admin-btn save-btn" data-action="save">Save</button>
            <button class="admin-btn delete-btn" data-action="delete">Delete Forever</button>
        </div>
    </div>`;
}

function renderAdminPhotoGallery() {
    const container = document.querySelector('.tab-content[data-tab-content="photoGallery"]');
    if (!container) return;
    const items = siteData.photoGallery || [];
    const grouped = {};
    items.forEach(i => { const c = i.category || 'uncategorized'; (grouped[c] = grouped[c] || []).push(i); });

    const categories = Object.keys(grouped).sort();
    const listsHTML = categories.map(cat => {
        const groupItems = grouped[cat].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const itemsListHTML = groupItems.map(item =>
            `<li class="admin-list-item" data-id="${item.id}" data-collection="photoGallery">${escHtml(item.title) || 'Untitled'}<span class="admin-list-item-slug">${escHtml(item.location) || ''}</span></li>`
        ).join('');
        return `<div class="admin-group"><h4 class="group-title">${escHtml(cat)} (${groupItems.length})</h4><ul class="admin-item-list">${itemsListHTML}</ul></div>`;
    }).join('');

    container.innerHTML = `
    <div class="admin-section-header"><h2>Photo Gallery</h2><button class="admin-btn" data-action="add" data-collection="photoGallery">+ Add New</button></div>
    <div class="admin-hint-box">Grouped by category. 55 photos across 4 categories were seeded from the original site.</div>
    ${listsHTML}
    <div class="admin-item-editor-container"></div>`;
}

function renderAdminPanel() {
    renderAdminSite();
    renderAdminArtDirection();
    renderAdminPhotoGallery();
}

// --- ESCAPE HELPERS ---
function escAttr(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escHtml(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// --- ACTIONS ---
async function handleAdminActions(e) {
    const target = e.target;
    const action = target.dataset.action;
    if (!action) return;
    const itemEl = target.closest('.admin-item');

    const setEditingState = (el, isEditing) => {
        el.classList.toggle('is-editing', isEditing);
        el.querySelectorAll('input, textarea, select').forEach(input => input.disabled = !isEditing);
    };

    try {
        if (action === 'edit-site') { setEditingState(itemEl, true); return; }

        if (action === 'save-site') {
            setEditingState(itemEl, false);
            let backdrops, labels;
            try {
                backdrops = JSON.parse(itemEl.querySelector('#ad-backdrops').value || '{}');
                labels = JSON.parse(itemEl.querySelector('#ad-labels').value || '{}');
            } catch (err) {
                alert('Error: Discipline Backdrops / Labels must be valid JSON.');
                return;
            }
            const siteUpdate = {
                title: itemEl.querySelector('#site-title').value,
                description: itemEl.querySelector('#site-description').value,
                author: itemEl.querySelector('#site-author').value,
                baseUrl: itemEl.querySelector('#site-baseUrl').value.replace(/\/$/, ''),
                ogDescription: itemEl.querySelector('#site-ogDescription').value,
                ogImage: itemEl.querySelector('#site-ogImage').value,
                defaultLang: itemEl.querySelector('#site-defaultLang').value || 'en',
            };
            const extraUpdate = {
                AD_PM_DESC_PLACEHOLDER: itemEl.querySelector('#ad-placeholder').value,
                DISCIPLINE_BACKDROPS: backdrops,
                DISCIPLINE_LABELS: labels,
            };
            await db.collection('config').doc('site').set(siteUpdate, { merge: true });
            await db.collection('config').doc('artDirectionExtra').set(extraUpdate, { merge: true });
            siteData.site = { ...siteData.site, ...siteUpdate };
            siteData.artDirectionExtra = { ...siteData.artDirectionExtra, ...extraUpdate };
            renderAdminPanel();
            alert('Site settings saved!');
            return;
        }

        const collection = target.dataset.collection || (itemEl ? itemEl.dataset.collection : null);
        const id = itemEl ? itemEl.dataset.id : null;
        const stateKey = collection === 'artDirectionProjects' ? 'artDirectionProjects' : 'photoGallery';

        switch (action) {
            case 'edit':
                setEditingState(itemEl, true);
                break;

            case 'save': {
                setEditingState(itemEl, false);
                let updatedData;
                if (collection === 'artDirectionProjects') {
                    let catalogs;
                    try { catalogs = JSON.parse(itemEl.querySelector('.f-catalogs').value || '[]'); }
                    catch (err) { alert('Error: Catalogs field must be valid JSON.'); return; }
                    updatedData = {
                        discipline: itemEl.querySelector('.f-discipline').value,
                        cat: itemEl.querySelector('.f-cat').value,
                        num: itemEl.querySelector('.f-num').value,
                        order: parseInt(itemEl.querySelector('.f-order').value) || 0,
                        title: itemEl.querySelector('.f-title').value,
                        sub: itemEl.querySelector('.f-sub').value,
                        desc: itemEl.querySelector('.f-desc').value,
                        specs: textToSpecs(itemEl.querySelector('.f-specs').value),
                        tags: textToTags(itemEl.querySelector('.f-tags').value),
                        bg: itemEl.querySelector('.f-bg').value,
                        whiteBg: itemEl.querySelector('.f-whiteBg').checked,
                        images: linesToArray(itemEl.querySelector('.f-images').value),
                        catalogs: catalogs,
                        model: itemEl.querySelector('.f-model').value,
                    };
                } else {
                    updatedData = {
                        category: itemEl.querySelector('.f-category').value.trim(),
                        categoryLabelKey: itemEl.querySelector('.f-categoryLabelKey').value.trim(),
                        order: parseInt(itemEl.querySelector('.f-order').value) || 0,
                        image: itemEl.querySelector('.f-image').value.trim(),
                        title: itemEl.querySelector('.f-title').value,
                        titleKey: itemEl.querySelector('.f-titleKey').value.trim(),
                        location: itemEl.querySelector('.f-location').value,
                        locationKey: itemEl.querySelector('.f-locationKey').value.trim(),
                        camera: itemEl.querySelector('.f-camera').value,
                        lens: itemEl.querySelector('.f-lens').value,
                        year: itemEl.querySelector('.f-year').value,
                    };
                }
                await db.collection(collection).doc(id).set(updatedData, { merge: true });
                const idx = siteData[stateKey].findIndex(i => i.id === id);
                if (idx !== -1) siteData[stateKey][idx] = { ...siteData[stateKey][idx], ...updatedData };
                renderAdminPanel();
                alert('Item saved!');
                break;
            }

            case 'delete':
                if (confirm('ATTENTION: Are you sure you want to DELETE this item FOREVER?')) {
                    if (confirm('Confirm deletion again. This cannot be undone.')) {
                        await db.collection(collection).doc(id).delete();
                        siteData[stateKey] = siteData[stateKey].filter(i => i.id !== id);
                        renderAdminPanel();
                        alert('Item permanently deleted.');
                    }
                }
                break;

            case 'add': {
                let newItemData;
                if (collection === 'artDirectionProjects') {
                    const newId = `web-${Date.now()}`;
                    newItemData = {
                        id: newId, discipline: 'web', cat: 'Web', num: '00', order: 999,
                        title: 'New Project', sub: '', desc: '', specs: [], tags: [],
                        bg: '', whiteBg: false, images: [], catalogs: [], model: '',
                    };
                } else {
                    const newId = `landscapes-${Date.now()}`;
                    newItemData = {
                        id: newId, category: 'landscapes', categoryLabelKey: 'photo.cat.landscapes', order: 999,
                        image: '', title: 'New Photo', titleKey: '', location: '', locationKey: '',
                        camera: '', lens: '', year: '',
                    };
                }
                const { id: docId, ...data } = newItemData;
                await db.collection(collection).doc(docId).set(data);
                siteData[stateKey].push(newItemData);
                renderAdminPanel();
                alert('New item added. Find it in the list and click Edit to fill it in.');
                break;
            }
        }
    } catch (error) {
        console.error('Admin action failed:', error);
        alert('An error occurred. Please check the console.');
    }
}

function initAdminEventListeners() {
    document.querySelector('.admin-tabs').addEventListener('click', e => {
        if (e.target.matches('.admin-tab')) {
            document.querySelectorAll('.admin-tab, .tab-content').forEach(el => el.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelector(`.tab-content[data-tab-content="${e.target.dataset.tab}"]`).classList.add('active');
        }
    });

    document.querySelector('.admin-content').addEventListener('click', e => {
        const listItem = e.target.closest('.admin-list-item');
        if (listItem) {
            const id = listItem.dataset.id;
            const collection = listItem.dataset.collection;
            const stateKey = collection === 'artDirectionProjects' ? 'artDirectionProjects' : 'photoGallery';
            const itemData = siteData[stateKey]?.find(i => i.id === id);
            if (itemData) {
                const tabContent = listItem.closest('.tab-content');
                tabContent.querySelectorAll('.admin-list-item').forEach(el => el.classList.remove('selected'));
                listItem.classList.add('selected');
                const editorContainer = tabContent.querySelector('.admin-item-editor-container');
                editorContainer.innerHTML = collection === 'artDirectionProjects'
                    ? generateArtItemFormHTML(itemData)
                    : generatePhotoItemFormHTML(itemData);
            }
            return;
        }
        handleAdminActions(e);
    });

    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
}

function showAdminPanel() {
    document.getElementById('admin-panel').classList.add('logged-in');
}

async function initializeAdminApp() {
    showAdminPanel();
    initAdminEventListeners();
    siteData = await loadData();
    renderAdminPanel();
}

// DEV MODE: no login gate. Re-enable Firebase Auth before this goes public —
// see the commented-out block below and admin.html's login-screen markup.
initializeAdminApp();

/*
const auth = firebase.auth();
auth.onAuthStateChanged(user => {
    if (user) initializeAdminApp();
    else document.getElementById('login-screen').classList.remove('hidden');
});
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        errorEl.textContent = 'Login failed. Check email/password.';
    }
});
*/
