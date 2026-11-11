(() => {
  'use strict';

  const DB_NAME = 'findit-offline-v1';
  const DB_VERSION = 1;
  const OUTBOX = 'outbox';
  const CACHE = 'cache';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('Offline storage is not supported in this browser.'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, {keyPath:'id'});
        if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE, {keyPath:'key'});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
    });
  }

  async function readAll(storeName) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('Could not read offline storage.'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Offline storage read failed.')); };
    });
  }

  async function write(storeName, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not save offline data.')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Offline save was cancelled.')); };
    });
  }

  async function remove(storeName, key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not remove offline data.')); };
    });
  }

  function publicReport(item) {
    return {
      id:String(item.id || ''),
      type:item.type === 'Lost' ? 'Lost' : 'Found',
      name:String(item.name || '').slice(0,60),
      category:String(item.category || 'Other').slice(0,50),
      location:String(item.location || '').slice(0,80),
      date:String(item.date || '').slice(0,10),
      color:String(item.color || '').slice(0,60),
      description:String(item.description || '').slice(0,500),
      emoji:String(item.emoji || '📦').slice(0,8),
      photoData:typeof item.photoData === 'string' ? item.photoData : ''
    };
  }

  async function queueReport(item, config) {
    if (!item || !/^[a-z0-9-]{8,80}$/i.test(item.id || '') || !/^[a-f0-9]{64}$/i.test(item.ownerToken || '')) {
      throw new Error('This report is missing its private sync key.');
    }
    if (!config || !/^https:\/\//.test(config.baseUrl || '') || !config.publishableKey) {
      throw new Error('Community sync is not configured.');
    }
    await write(OUTBOX, {
      id:item.id,
      report:publicReport(item),
      ownerToken:item.ownerToken,
      baseUrl:config.baseUrl,
      publishableKey:config.publishableKey,
      state:'pending',
      attempts:0,
      queuedAt:Date.now(),
      lockUntil:0
    });
    await requestBackgroundSync();
    return true;
  }

  async function getQueue() {
    return readAll(OUTBOX);
  }

  async function claimReport(id) {
    const db = await openDatabase();
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
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not claim a queued report.')); };
    });
  }

  async function markSynced(id, result = {}) {
    const records = await getQueue();
    const record = records.find(entry => entry.id === id);
    if (!record) return false;
    record.state = 'synced';
    record.photoPath = String(result.photoPath || '');
    record.photoError = result.photoError === true;
    record.syncedAt = Date.now();
    record.lockUntil = 0;
    if (record.report) record.report.photoData = '';
    return write(OUTBOX, record);
  }

  async function markPending(id, error) {
    const records = await getQueue();
    const record = records.find(entry => entry.id === id);
    if (!record) return false;
    record.state = 'pending';
    record.attempts = Number(record.attempts || 0) + 1;
    record.lastError = String(error || 'Sync will retry when the connection is available.').slice(0,240);
    record.lockUntil = 0;
    return write(OUTBOX, record);
  }

  async function removeQueuedReport(id) {
    return remove(OUTBOX, id);
  }

  async function cacheReports(reports) {
    const safe = (Array.isArray(reports) ? reports : []).slice(0,200).map(item => ({
      id:String(item.id || ''),
      type:item.type === 'Lost' ? 'Lost' : 'Found',
      name:String(item.name || '').slice(0,60),
      category:String(item.category || 'Other').slice(0,50),
      location:String(item.location || '').slice(0,80),
      date:String(item.date || '').slice(0,10),
      color:String(item.color || '').slice(0,60),
      description:String(item.description || '').slice(0,500),
      emoji:String(item.emoji || '📦').slice(0,8),
      photoPath:String(item.photoPath || '').slice(0,180),
      remote:true,
      demo:false,
      email:''
    })).filter(item => item.id);
    return write(CACHE, {key:'community-feed',value:safe,savedAt:Date.now()});
  }

  async function getCachedReports() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE, 'readonly');
      const request = tx.objectStore(CACHE).get('community-feed');
      request.onsuccess = () => resolve(Array.isArray(request.result?.value) ? request.result.value : []);
      request.onerror = () => reject(request.error || new Error('Could not read cached reports.'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Cached reports could not be read.')); };
    });
  }

  async function requestBackgroundSync() {
    try {
      if (!('serviceWorker' in navigator)) return false;
      const scope = new URL('./', document.baseURI).href;
      const registration = await navigator.serviceWorker.getRegistration(scope);
      if (registration?.sync && typeof registration.sync.register === 'function') {
        await registration.sync.register('findit-report-sync');
        return true;
      }
    } catch {}
    return false;
  }

  async function requestPersistentStorage() {
    try {
      if (!navigator.storage?.persist || !navigator.storage?.persisted) return false;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch { return false; }
  }

  window.FindItOffline = Object.freeze({
    queueReport, getQueue, claimReport, markSynced, markPending,
    removeQueuedReport, cacheReports, getCachedReports,
    requestBackgroundSync, requestPersistentStorage
  });

  requestPersistentStorage();
})();
