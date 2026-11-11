const CACHE_NAME = 'findit-shell-v11';
const DB_NAME = 'findit-offline-v1';
const DB_VERSION = 1;
const OUTBOX = 'outbox';

const BASE_URL = self.registration.scope;
const APP_SHELL_PATHS = [
  './',
  './index.html',
  './privacy.html',
  './styles.css?v=34',
  './app.js?v=16',
  './owner-portal.js?v=9',
  './shared-config.js?v=1',
  './shared-backend.js?v=3',
  './offline-sync.js?v=1',
  './pwa.js?v=3',
  './manifest.webmanifest',
  './assets/findit-app-icon.svg',
  './vendor/qrcodejs/qrcode.min.js',
  './assets/items/earbuds.jpg',
  './assets/items/green-scarf.jpg',
  './assets/items/id-card.jpg',
  './assets/items/keys.jpg',
  './assets/items/laptop.jpg',
  './assets/items/lost-found-hero.jpg',
  './assets/items/lost-found-scene.jpg',
  './assets/items/notebook.jpg',
  './assets/items/phone.jpg',
  './assets/items/silver-ring.jpg',
  './assets/items/sunglasses.jpg',
  './assets/items/tote-bag.jpg',
  './assets/items/wallet.jpg',
  './assets/items/watch.jpg',
  './assets/items/water-bottle.jpg'
];
const APP_SHELL = APP_SHELL_PATHS.map(path => new URL(path, BASE_URL).toString());
const INDEX_URL = new URL('./index.html', BASE_URL).toString();

function openOutboxDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, {keyPath:'id'});
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', {keyPath:'key'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline queue is unavailable.'));
  });
}

async function getQueuedReports() {
  const db = await openOutboxDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX, 'readonly');
    const request = tx.objectStore(OUTBOX).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Could not read offline queue.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Offline queue read failed.')); };
  });
}

async function claimQueuedReport(id) {
  const db = await openOutboxDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX, 'readwrite');
    const store = tx.objectStore(OUTBOX);
    const request = store.get(id);
    let claimed = null;
    request.onsuccess = () => {
      const record = request.result;
      if (!record || record.state === 'synced' || (record.state === 'syncing' && record.lockUntil > Date.now())) return;
      record.state = 'syncing';
      record.lockUntil = Date.now() + 120000;
      record.lastAttemptAt = Date.now();
      store.put(record);
      claimed = record;
    };
    tx.oncomplete = () => { db.close(); resolve(claimed); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not lock offline report.')); };
  });
}

async function updateQueuedReport(id, patch) {
  const db = await openOutboxDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX, 'readwrite');
    const store = tx.objectStore(OUTBOX);
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) return;
      store.put({...request.result,...patch});
    };
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not update offline queue.')); };
  });
}

function authHeaders(record, extra = {}) {
  return {apikey:record.publishableKey, ...extra};
}

async function syncOneQueuedReport(record) {
  if (!record.baseUrl || !record.publishableKey || !record.ownerToken || !record.report) {
    throw new Error('Offline report is missing sync configuration.');
  }

  const report = record.report;
  const response = await fetch(record.baseUrl + '/rest/v1/rpc/findit_create_report', {
    method:'POST',
    headers:authHeaders(record, {'content-type':'application/json'}),
    body:JSON.stringify({p_report:{
      id:report.id, type:report.type, name:report.name, category:report.category,
      location:report.location, date:report.date || null, color:report.color || '',
      description:report.description || '', emoji:report.emoji || '📦'
    },p_owner_token:record.ownerToken})
  });
  if (!response.ok) throw new Error('The community server did not accept this report (' + response.status + ').');
  const savedReport = await response.json();
  let photoPath = String(savedReport?.photo_path || '');
  let photoError = false;

  if (report.photoData && !photoPath) {
    try {
      const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/i.exec(report.photoData);
      if (!match) throw new Error('Unsupported photo data.');
      const binary = atob(match[2]);
      if (binary.length > 280000) throw new Error('Photo is larger than the shared upload limit.');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const mimeType = 'image/' + match[1].toLowerCase();
      const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      photoPath = report.id + '/' + crypto.randomUUID() + '.' + extension;
      const upload = await fetch(record.baseUrl + '/storage/v1/object/findit-item-photos/' + photoPath.split('/').map(encodeURIComponent).join('/'), {
        method:'POST',
        headers:authHeaders(record, {
          'content-type':mimeType,
          'x-findit-owner-token':record.ownerToken,
          'x-upsert':'false'
        }),
        body:new Blob([bytes], {type:mimeType})
      });
      if (!upload.ok) throw new Error('Photo upload failed.');
      const attach = await fetch(record.baseUrl + '/rest/v1/rpc/findit_attach_photo', {
        method:'POST',
        headers:authHeaders(record, {'content-type':'application/json'}),
        body:JSON.stringify({p_report_id:report.id,p_owner_token:record.ownerToken,p_photo_path:photoPath})
      });
      if (!attach.ok) throw new Error('Photo attachment failed.');
    } catch {
      photoPath = '';
      photoError = true;
    }
  }

  await updateQueuedReport(record.id, {
    state:'synced',
    photoPath,
    photoError,
    syncedAt:Date.now(),
    lockUntil:0,
    report:{...report,photoData:''}
  });
}

async function processOfflineQueue() {
  const records = await getQueuedReports();
  let completed = false;
  for (const record of records) {
    if (record.state === 'synced') continue;
    const claimed = await claimQueuedReport(record.id);
    if (!claimed) continue;
    try {
      await syncOneQueuedReport(claimed);
      completed = true;
    } catch (error) {
      await updateQueuedReport(claimed.id, {
        state:'pending',
        attempts:Number(claimed.attempts || 0) + 1,
        lastError:String(error?.message || 'Sync failed.').slice(0,240),
        lockUntil:0
      });
    }
  }
  const clients = await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client => client.postMessage({type:'FINDIT_OFFLINE_SYNC_FINISHED',completed}));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(name => name.startsWith('findit-shell-') && name !== CACHE_NAME).map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

async function notifyOpenAppOrSyncInBackground() {
  const clients = await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if (clients.length) {
    clients.forEach(client => client.postMessage({type:'FINDIT_OFFLINE_SYNC_NEEDED'}));
    return;
  }
  await processOfflineQueue();
}

self.addEventListener('sync', event => {
  if (event.tag === 'findit-report-sync') event.waitUntil(notifyOpenAppOrSyncInBackground());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'FINDIT_SYNC_NOW') {
    event.waitUntil?.(notifyOpenAppOrSyncInBackground());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(INDEX_URL, copy));
        }
        return response;
      }).catch(async () => (await caches.match(request)) || (await caches.match(INDEX_URL)) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const update = fetch(request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => null);
      return cached || update.then(response => response || Response.error());
    })
  );
});
