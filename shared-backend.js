(() => {
  const config = window.FINDIT_CONFIG || {};
  let baseUrl = '';
  let publishableKey = '';

  try {
    const rawUrl = String(config.supabaseUrl || '').trim().replace(/\/$/, '');
    const parsed = new URL(rawUrl);
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if ((parsed.protocol === 'https:' || isLocal && parsed.protocol === 'http:') && parsed.origin === rawUrl) baseUrl = parsed.origin;
  } catch {}
  function isPublishableKey(value) {
    if (typeof value !== 'string') return false;
    const key = value.trim();
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
    const segments = key.split('.');
    if (segments.length !== 3) return false;
    try {
      const payload = segments[1].replace(/-/g,'+').replace(/_/g,'/');
      const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
      return claims.role === 'anon';
    } catch { return false; }
  }
  if (isPublishableKey(config.supabasePublishableKey)) publishableKey = config.supabasePublishableKey.trim().slice(0, 500);

  const enabled = Boolean(baseUrl && publishableKey);
  const categories = new Set(['Electronics','Mobile Phones','Laptops and Tablets','Bags and Backpacks','Wallets and Purses','Keys','ID Cards and Documents','Books and Stationery','Watches and Jewelry','Clothing','Accessories','Water Bottles','Other']);
  const publicFields = 'id,type,name,category,location,date,color,description,emoji,photo_path,created_at';

  function endpoint(path) { return `${baseUrl}${path}`; }
  function headers(extra = {}) { return { apikey:publishableKey, ...extra }; }

  async function request(path, options = {}) {
    if (!enabled) throw new Error('Shared reports are not configured.');
    const response = await fetch(endpoint(path), { ...options, headers:headers(options.headers || {}), credentials:'omit', referrerPolicy:'no-referrer' });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`Shared service request failed (${response.status}).`);
      error.status = response.status;
      error.detail = detail.slice(0, 500);
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function normalizeReport(row) {
    if (!row || typeof row !== 'object' || !['Found','Lost'].includes(row.type)) return null;
    const date = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
    const photoPath = typeof row.photo_path === 'string' && /^[a-z0-9-]{8,80}\/[a-z0-9-]{8,80}\.(?:jpg|png|webp)$/i.test(row.photo_path) ? row.photo_path : '';
    return {
      id:String(row.id || '').slice(0,80), type:row.type,
      name:String(row.name || '').trim().slice(0,60),
      category:categories.has(row.category) ? row.category : 'Other',
      location:String(row.location || '').trim().slice(0,80), date,
      color:String(row.color || '').trim().slice(0,60),
      description:String(row.description || '').trim().slice(0,500),
      emoji:String(row.emoji || '📦').slice(0,8),
      photoPath, photoUrl:photoPath ? `${baseUrl}/storage/v1/object/public/findit-item-photos/${photoPath.split('/').map(encodeURIComponent).join('/')}` : '',
      email:'', remote:true, demo:false
    };
  }

  function assertOwnerToken(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('This browser does not have the private recovery key for that report.');
  }

  function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/i.test(dataUrl)) throw new Error('The image format is not supported.');
    const [metadata, encoded] = dataUrl.split(',');
    const mimeType = metadata.slice(5, metadata.indexOf(';')).toLowerCase();
    const binary = atob(encoded);
    if (binary.length > 280_000) throw new Error('Choose an image smaller than 280 KB for the shared board.');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { blob:new Blob([bytes], {type:mimeType}), mimeType };
  }

  async function listReports() {
    const rows = await request(`/rest/v1/findit_reports?select=${publicFields}&order=created_at.desc&limit=200`);
    return Array.isArray(rows) ? rows.map(normalizeReport).filter(Boolean) : [];
  }

  async function getReport(id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{8,80}$/i.test(id)) return null;
    const rows = await request(`/rest/v1/findit_reports?select=${publicFields}&id=eq.${encodeURIComponent(id)}&limit=1`);
    return Array.isArray(rows) && rows.length ? normalizeReport(rows[0]) : null;
  }

  async function createReport(item, ownerToken) {
    assertOwnerToken(ownerToken);
    const report = {
      id:item.id, type:item.type, name:item.name, category:item.category, location:item.location,
      date:item.date || null, color:item.color || '', description:item.description || '', emoji:item.emoji || '📦'
    };
    await request('/rest/v1/rpc/findit_create_report', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({p_report:report,p_owner_token:ownerToken})
    });

    let photoPath = '';
    if (item.photoData) {
      try {
        const {blob,mimeType} = dataUrlToBlob(item.photoData);
        const extension = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[mimeType];
        photoPath = `${item.id}/${crypto.randomUUID()}.${extension}`;
        await request(`/storage/v1/object/findit-item-photos/${photoPath.split('/').map(encodeURIComponent).join('/')}`, {
          method:'POST', headers:{'content-type':mimeType,'x-findit-owner-token':ownerToken,'x-upsert':'false'}, body:blob
        });
        await request('/rest/v1/rpc/findit_attach_photo', {
          method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({p_report_id:item.id,p_owner_token:ownerToken,p_photo_path:photoPath})
        });
      } catch (error) {
        if (photoPath) await removePhoto(photoPath, ownerToken).catch(() => {});
        return {photoPath:'',photoError:error};
      }
    }
    return {photoPath,photoError:null};
  }

  async function sendMessage(reportId, senderEmail, message) {
    return request('/rest/v1/rpc/findit_send_message', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({p_report_id:reportId,p_sender_email:senderEmail,p_message:message})
    });
  }

  async function listMessages(ownerTokens) {
    const safeTokens = {};
    for (const [reportId,token] of Object.entries(ownerTokens || {}).slice(0,200)) {
      if (/^[a-z0-9-]{8,80}$/i.test(reportId) && /^[a-f0-9]{64}$/i.test(token)) safeTokens[reportId] = token;
    }
    if (!Object.keys(safeTokens).length) return [];
    const rows = await request('/rest/v1/rpc/findit_list_messages', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({p_owner_tokens:safeTokens})
    });
    return Array.isArray(rows) ? rows : [];
  }

  async function removePhoto(path, ownerToken) {
    if (!path || !/^[a-z0-9-]{8,80}\/[a-z0-9-]{8,80}\.(?:jpg|png|webp)$/i.test(path)) return;
    await request(`/storage/v1/object/findit-item-photos/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method:'DELETE', headers:{'x-findit-owner-token':ownerToken}
    });
  }

  async function deleteReport(item, ownerToken) {
    assertOwnerToken(ownerToken);
    if (item.photoPath) await removePhoto(item.photoPath, ownerToken);
    return request('/rest/v1/rpc/findit_delete_report', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({p_report_id:item.id,p_owner_token:ownerToken})
    });
  }

  window.FindItShared = Object.freeze({
    enabled, listReports, getReport, createReport, sendMessage, listMessages, deleteReport,
    publicAssetUrl:path => path ? `${baseUrl}/storage/v1/object/public/findit-item-photos/${String(path).split('/').map(encodeURIComponent).join('/')}` : ''
  });
})();
