(() => {
  const STORAGE_KEY = 'findit-reports-v2';
  const THEME_KEY = 'findit-theme-v1';
  const SAVED_KEY = 'findit-saved-items-v1';
  const MAX_PHOTO_DATA_LENGTH = 2_800_000;
  const categories = new Set(['Electronics','Mobile Phones','Laptops and Tablets','Bags and Backpacks','Wallets and Purses','Keys','ID Cards and Documents','Books and Stationery','Watches and Jewelry','Clothing','Accessories','Water Bottles','Other']);
  const daysAgo = days => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0,10);
  };
  const starterItems = [
    {id:'findit-demo-1001',type:'Found',name:'Blue water bottle',category:'Water Bottles',location:'Riverside Park',date:daysAgo(1),color:'Powder blue',description:'Sample listing. Found beside the picnic tables.',emoji:'🧴',email:'',demo:true},
    {id:'findit-demo-1002',type:'Found',name:'Set of brass keys',category:'Keys',location:'Maple Street Cafe',date:daysAgo(2),color:'Brass and red',description:'Sample listing. Three keys on a red fabric loop.',emoji:'🔑',email:'',demo:true},
    {id:'findit-demo-1003',type:'Found',name:'Wireless earbuds case',category:'Electronics',location:'Northside Library',date:daysAgo(3),color:'White',description:'Sample listing. Found near the study desks.',emoji:'🎧',email:'',demo:true},
    {id:'findit-demo-1004',type:'Lost',name:'Canvas tote bag',category:'Bags and Backpacks',location:'Market Square',date:daysAgo(3),color:'Natural canvas',description:'Sample listing. Lost near the market stalls.',emoji:'👜',email:'',demo:true},
    {id:'findit-demo-1005',type:'Found',name:'Silver ring',category:'Watches and Jewelry',location:'Willow Creek Trail',date:daysAgo(4),color:'Silver with green stone',description:'Sample listing. Found near the wooden bridge.',emoji:'💍',email:'',demo:true},
    {id:'findit-demo-1006',type:'Lost',name:'Green knit scarf',category:'Clothing',location:'Elm Street Bus Stop',date:daysAgo(5),color:'Sage green',description:'Sample listing. Last seen on the bus stop bench.',emoji:'🧣',email:'',demo:true},
    {id:'findit-demo-1007',type:'Found',name:'Graphite smartphone',category:'Mobile Phones',location:'East Hall Cafe',date:daysAgo(6),color:'Dark graphite, clear case',description:'Sample listing. Found near the window seats.',emoji:'📱',email:'',demo:true},
    {id:'findit-demo-1008',type:'Lost',name:'Navy card wallet',category:'Wallets and Purses',location:'Central Bus Stop',date:daysAgo(7),color:'Navy leather, two card slots',description:'Sample listing. A few cards are inside; identifying details are kept private.',emoji:'👛',email:'',demo:true},
    {id:'findit-demo-1009',type:'Found',name:'Forest green notebook',category:'Books and Stationery',location:'West Campus Library',date:daysAgo(8),color:'Dark green cover with black pen',description:'Sample listing. Found on a study table.',emoji:'📚',email:'',demo:true},
    {id:'findit-demo-1010',type:'Lost',name:'Silver laptop',category:'Laptops and Tablets',location:'Innovation Building',date:daysAgo(9),color:'Slim silver case with no logo',description:'Sample listing. Please verify identifying details privately.',emoji:'💻',email:'',demo:true},
    {id:'findit-demo-1011',type:'Found',name:'Blue campus ID card',category:'ID Cards and Documents',location:'North Gate',date:daysAgo(10),color:'Blue card on a plain lanyard',description:'Sample listing. The card is shown only as a generic example; no personal details are included.',emoji:'🪪',email:'',demo:true},
    {id:'findit-demo-1012',type:'Lost',name:'Silver wristwatch',category:'Watches and Jewelry',location:'Lakeside Walk',date:daysAgo(11),color:'Silver case with navy strap',description:'Sample listing. Lost during an evening walk.',emoji:'⌚',email:'',demo:true},
    {id:'findit-demo-1013',type:'Found',name:'Black sunglasses',category:'Accessories',location:'Garden Courtyard',date:daysAgo(12),color:'Black frame, dark lenses',description:'Sample listing. Found on a bench.',emoji:'🕶️',email:'',demo:true}
  ];
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const formatDate = value => {
    if (!value) return 'Date not shared';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? 'Date not shared' : new Intl.DateTimeFormat('en', {month:'short', day:'numeric'}).format(date);
  };
  const newId = () => `findit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const cleanText = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  function normalizeStoredItem(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const id = cleanText(item.id, 80);
    const name = cleanText(item.name, 60);
    const location = cleanText(item.location, 80);
    if (!id || !name || !location || !['Found','Lost'].includes(item.type)) return null;
    const photoData = typeof item.photoData === 'string' && item.photoData.length <= MAX_PHOTO_DATA_LENGTH && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/i.test(item.photoData) ? item.photoData : '';
    const date = cleanText(item.date, 10);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00`)) ? date : '';
    return {
      id, type:item.type, name, category:categories.has(item.category) ? item.category : 'Other',
      location, date:validDate, color:cleanText(item.color, 60), description:cleanText(item.description, 500),
      email:cleanText(item.email, 100), emoji:cleanText(item.emoji, 8) || '📦',
      demo:item.demo === true, sharedLink:item.sharedLink === true, photoData
    };
  }
  let items = readItems();
  let savedIds = readSavedItems();
  let activeCategory = 'All';
  let activeType = 'All';
  let newestFirst = true;
  let toastTimer;
  let selectedPhotoData = '';
  let currentDetailItem = null;
  let scannerStream = null;
  let scannerFrame = 0;
  let scannerDetector = null;
  const grid = document.querySelector('#item-grid');
  const search = document.querySelector('#search-input');
  const reportDialog = document.querySelector('#report-dialog');
  const detailDialog = document.querySelector('#detail-dialog');
  const scannerDialog = document.querySelector('#scanner-dialog');

  function getHashItemId() {
    const match = window.location.hash.match(/^#item=(.+)$/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); }
    catch { return null; }
  }
  function encodeShareItem(item) {
    const publicReport = {
      id: String(item.id || '').slice(0,80), type: item.type === 'Lost' ? 'Lost' : 'Found',
      name: String(item.name || '').slice(0,60), category: String(item.category || 'Other').slice(0,50),
      location: String(item.location || '').slice(0,80), date: String(item.date || '').slice(0,10),
      color: String(item.color || '').slice(0,60), description: String(item.description || '').slice(0,500),
      emoji: String(item.emoji || '📦').slice(0,8)
    };
    const bytes = new TextEncoder().encode(JSON.stringify(publicReport));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decodeShareItem(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,6000}$/.test(token)) return null;
    try {
      const base64 = token.replace(/-/g,'+').replace(/_/g,'/');
      const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!data || typeof data.id !== 'string' || typeof data.name !== 'string' || typeof data.location !== 'string' || !['Lost','Found'].includes(data.type)) return null;
      return {
        id:data.id.slice(0,80), type:data.type, name:data.name.slice(0,60), category:String(data.category || 'Other').slice(0,50),
        location:data.location.slice(0,80), date:String(data.date || '').slice(0,10), color:String(data.color || '').slice(0,60),
        description:String(data.description || '').slice(0,500), emoji:String(data.emoji || '📦').slice(0,8), email:'', sharedLink:true
      };
    } catch { return null; }
  }
  function getHashShareItem() {
    const match = window.location.hash.match(/^#share=([A-Za-z0-9_-]{1,6000})$/);
    return match ? decodeShareItem(match[1]) : null;
  }
  function shareUrlForItem(item) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = `share=${encodeShareItem(item)}`;
    return url.href;
  }

  function readItems() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved)) {
        const current = saved.map(normalizeStoredItem).filter(Boolean).map(item => {
          if (!item.demo) return item;
          const sampleIndex = Number(item.id.match(/(\d+)$/)?.[1]) || 1;
          return {...item,date:daysAgo(Math.max(1, sampleIndex - 1000))};
        });
        const unique = [...new Map(current.map(item => [item.id, item])).values()];
        const existingIds = new Set(unique.map(item => item.id));
        return [...unique,...starterItems.filter(item => !existingIds.has(item.id))];
      }
      const legacy = JSON.parse(localStorage.getItem('foundly-items-v1'));
      if (Array.isArray(legacy)) {
        const migrated = legacy.map(item => normalizeStoredItem({...item,type:'Found',category:({'Everyday':'Other','Tech':'Electronics','Bags':'Bags and Backpacks'}[item?.category] || item?.category)})).filter(Boolean);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch {}
        return migrated;
      }
      return starterItems;
    } catch { return starterItems; }
  }
  function readSavedItems() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_KEY));
      return Array.isArray(saved) ? [...new Set(saved.filter(id => typeof id === 'string' && id.length <= 80))] : [];
    } catch { return []; }
  }
  function persistSavedItems(nextIds) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(nextIds)); return true; }
    catch { showToast('Could not save this bookmark. Check browser storage.'); return false; }
  }
  function toggleSavedItem(id) {
    const nextIds = savedIds.includes(id) ? savedIds.filter(savedId => savedId !== id) : [...savedIds, id];
    if (!persistSavedItems(nextIds)) return;
    const wasSaved = savedIds.includes(id);
    savedIds = nextIds;
    render();
    showToast(wasSaved ? 'Removed from saved items.' : 'Saved for later on this device.');
  }
  function saveItems(nextItems) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
      return true;
    } catch {
      return false;
    }
  }
  function categoryClass(category) {
    if (['Electronics','Mobile Phones','Laptops and Tablets'].includes(category)) return 'tech';
    if (['Bags and Backpacks','Wallets and Purses'].includes(category)) return 'bags';
    if (['ID Cards and Documents','Books and Stationery','Watches and Jewelry','Other'].includes(category)) return 'other';
    return 'everyday';
  }
  function photoForItem(item) {
    if (typeof item.photoData === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/i.test(item.photoData)) return {src:item.photoData,alt:`Photo provided for ${item.name}`,example:false};
    if (!item.demo) return null;
    const name = String(item.name || '').toLocaleLowerCase();
    const category = String(item.category || '').toLocaleLowerCase();
    const byName = /water|bottle|flask/.test(name) ? 'water-bottle.jpg'
      : /phone|mobile/.test(name) ? 'phone.jpg'
      : /laptop|tablet|computer/.test(name) ? 'laptop.jpg'
      : /wallet|purse/.test(name) ? 'wallet.jpg'
      : /id card|identity|document|passport/.test(name) ? 'id-card.jpg'
      : /book|notebook|stationery/.test(name) ? 'notebook.jpg'
      : /sunglass|eyeglass|glasses/.test(name) ? 'sunglasses.jpg'
      : /key/.test(name) ? 'keys.jpg'
      : /earbud|headphone/.test(name) ? 'earbuds.jpg'
      : /tote|bag|backpack/.test(name) ? 'tote-bag.jpg'
      : /watch/.test(name) ? 'watch.jpg'
      : /ring|jewel/.test(name) ? 'silver-ring.jpg'
      : /scarf|knit/.test(name) ? 'green-scarf.jpg' : '';
    const byCategory = /water bottle/.test(category) ? 'water-bottle.jpg'
      : /mobile phone/.test(category) ? 'phone.jpg'
      : /laptop|tablet/.test(category) ? 'laptop.jpg'
      : /wallet|purse/.test(category) ? 'wallet.jpg'
      : /id card|document/.test(category) ? 'id-card.jpg'
      : /book|stationery/.test(category) ? 'notebook.jpg'
      : /accessor/.test(category) ? 'sunglasses.jpg'
      : /^keys?$/.test(category) ? 'keys.jpg'
      : /^electronics$/.test(category) ? 'earbuds.jpg'
      : /bag|backpack/.test(category) ? 'tote-bag.jpg'
      : /watch/.test(category) ? 'watch.jpg'
      : /jewel/.test(category) ? 'silver-ring.jpg'
      : /^clothing$/.test(category) ? 'green-scarf.jpg' : '';
    const match = byName || byCategory;
    if (!match) return null;
    return {src:`assets/items/${match}`,alt:`Example photo representing ${item.name}`,example:true};
  }
  function filteredItems() {
    const term = search.value.trim().toLocaleLowerCase();
    return items.filter(item => {
      const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
      const matchesType = activeType === 'All' || (activeType === 'Saved' ? savedIds.includes(item.id) : item.type === activeType);
      const haystack = [item.name,item.location,item.color,item.description,item.category].join(' ').toLocaleLowerCase();
      return matchesCategory && matchesType && (!term || haystack.includes(term));
    }).sort((a,b) => newestFirst ? (b.date || '').localeCompare(a.date || '') : (a.date || '').localeCompare(b.date || ''));
  }
  function render() {
    const shown = filteredItems();
    grid.innerHTML = shown.map(item => `
      <article class="item-card" data-id="${escapeHTML(item.id)}">
        <button class="item-open" type="button" data-item-id="${escapeHTML(item.id)}" aria-label="View ${escapeHTML(item.name)}">
        <div class="item-art art-${categoryClass(item.category)}${photoForItem(item) ? ' has-photo' : ''}">${photoForItem(item) ? `<img class="item-photo" src="${escapeHTML(photoForItem(item).src)}" alt="${escapeHTML(photoForItem(item).alt)}" loading="lazy" decoding="async">${photoForItem(item).example ? '<span class="image-note">EXAMPLE PHOTO</span>' : '<span class="image-note report-photo-note">REPORT PHOTO</span>'}` : `<span class="item-emoji" aria-hidden="true">${escapeHTML(item.emoji || '📦')}</span>`}<span class="found-pill">${item.type === 'Lost' ? 'LOOKING FOR' : 'FOUND'}${item.demo ? ' · SAMPLE' : ''}</span>${item.type === 'Found' ? '<span class="qr-chip" aria-hidden="true">▦</span>' : ''}</div>
          <div class="item-body"><div class="item-title-row"><h3 class="item-title">${escapeHTML(item.name)}</h3><span class="item-category">${escapeHTML(item.category)}</span></div><div class="item-meta"><span>⌖ ${escapeHTML(item.location)}</span><span>${escapeHTML(formatDate(item.date))}</span></div><div class="item-footer"><strong>${item.color ? escapeHTML(item.color) : 'Community report'}</strong><span class="scan-hint">${item.type === 'Found' ? '▦ QR details' : '⌕ View report'}</span></div></div>
        </button>
        <button class="save-item${savedIds.includes(item.id) ? ' is-saved' : ''}" type="button" data-save-id="${escapeHTML(item.id)}" aria-label="${savedIds.includes(item.id) ? 'Remove' : 'Save'} ${escapeHTML(item.name)}${savedIds.includes(item.id) ? ' from' : ' for'} saved items" aria-pressed="${savedIds.includes(item.id)}" title="${savedIds.includes(item.id) ? 'Remove saved item' : 'Save for later'}"><span aria-hidden="true">${savedIds.includes(item.id) ? '♥' : '♡'}</span></button>
      </article>`).join('');
    document.querySelector('#empty-state').classList.toggle('hidden', shown.length > 0);
    grid.classList.toggle('hidden', shown.length === 0);
    document.querySelector('#showing-count').textContent = shown.length;
    document.querySelector('#total-count').textContent = items.length;
    document.querySelector('#all-count').textContent = items.length;
    document.querySelector('#saved-count').textContent = savedIds.filter(id => items.some(item => item.id === id)).length;
    if (!shown.length && activeType === 'Saved') {
      document.querySelector('#empty-state h3').textContent = 'No saved items yet.';
      document.querySelector('#empty-state p').textContent = 'Tap the heart on a report to keep it here for later. Saved items stay on this device.';
    } else {
      document.querySelector('#empty-state h3').textContent = 'No reports match that search.';
      document.querySelector('#empty-state p').textContent = 'Change the search or filters, or create a lost or found report.';
    }
    const savedReportCount = items.filter(item => !item.demo).length;
    document.querySelector('#hero-count').textContent = savedReportCount.toLocaleString();
    document.querySelector('#hero-count-label').textContent = savedReportCount === 1 ? 'report saved on this device' : 'reports saved on this device';
    const hasActiveFilters = activeType !== 'All' || activeCategory !== 'All' || Boolean(search.value.trim());
    document.querySelector('#see-all').classList.toggle('hidden', !hasActiveFilters);
  }
  function updateAddress(id) {
    const url = new URL(window.location.href);
    url.hash = `item=${encodeURIComponent(id)}`;
    history.replaceState(null, '', url);
  }
  function suggestionsFor(lostItem) {
    if (lostItem.type !== 'Lost') return [];
    const words = value => new Set(String(value || '').toLocaleLowerCase().match(/[a-z0-9]{3,}/g) || []);
    const lostWords = words(`${lostItem.name} ${lostItem.description} ${lostItem.color}`);
    return items.filter(candidate => candidate.type === 'Found').map(candidate => {
      const reasons = [];
      let score = 0;
      if (candidate.category === lostItem.category) { score += 3; reasons.push('same category'); }
      const overlap = [...words(`${candidate.name} ${candidate.description} ${candidate.color}`)].filter(word => lostWords.has(word));
      if (overlap.length) { score += Math.min(4, overlap.length * 2); reasons.push(`shared words: ${overlap.slice(0,3).join(', ')}`); }
      const placeOverlap = [...words(candidate.location)].filter(word => words(lostItem.location).has(word));
      if (placeOverlap.length) { score += 2; reasons.push('location names overlap'); }
      const days = Math.abs(new Date(`${candidate.date}T12:00:00`) - new Date(`${lostItem.date}T12:00:00`)) / 86400000;
      if (Number.isFinite(days) && days <= 7) { score += 1; reasons.push('reported within a week'); }
      return {item:candidate,score,reasons};
    }).filter(result => result.score > 0 && result.reasons.some(reason => reason !== 'reported within a week')).sort((a,b) => b.score-a.score).slice(0,3);
  }
  function openDetail(id, updateUrl = true) {
    const item = typeof id === 'object' && id ? id : items.find(entry => entry.id === id);
    if (!item) return;
    currentDetailItem = item;
    document.querySelector('#detail-name').textContent = item.name;
    const isFound = item.type === 'Found';
    document.querySelector('#detail-eyebrow').textContent = `${item.demo ? 'SAMPLE · ' : ''}${isFound ? 'FOUND ITEM' : 'LOST ITEM REPORT'}`;
    const art = document.querySelector('#detail-art');
    art.className = `detail-art art-${categoryClass(item.category)}`;
    const photo = photoForItem(item);
    art.innerHTML = photo ? `<img class="detail-photo" src="${escapeHTML(photo.src)}" alt="${escapeHTML(photo.alt)}"><span class="detail-photo-caption">${photo.example ? 'Example photo' : 'Photo added by reporter'}</span>` : escapeHTML(item.emoji || '📦');
    const info = document.querySelector('#detail-info');
    document.querySelector('#detail-status').textContent = '';
    info.innerHTML = `<strong>${isFound ? 'FOUND AT' : 'LAST SEEN AT'}</strong><p>⌖ ${escapeHTML(item.location)}</p><strong>${isFound ? 'DATE FOUND' : 'DATE LOST'}</strong><p>${escapeHTML(formatDate(item.date))}</p><strong>CATEGORY</strong><p>${escapeHTML(item.category)}</p>${item.color ? `<strong>IDENTIFYING DETAILS</strong><p>${escapeHTML(item.color)}</p>` : ''}${item.description ? `<strong>DESCRIPTION</strong><p>${escapeHTML(item.description)}</p>` : ''}<strong>REPORT ID</strong><p>${escapeHTML(item.id)}</p>`;
    const matchArea = document.querySelector('#match-area');
    const matches = suggestionsFor(item);
    matchArea.classList.toggle('hidden', isFound || matches.length === 0);
    matchArea.innerHTML = matches.length ? `<div class="match-heading"><span>✳ POSSIBLE MATCHES</span><small>Rule score, not a probability · verify privately</small></div>${matches.map(({item:match,score,reasons}) => `<button class="match-result" type="button" data-match-id="${escapeHTML(match.id)}"><span><b>${escapeHTML(match.name)}</b><small>${escapeHTML(match.location)} · ${escapeHTML(formatDate(match.date))}</small><small class="match-reasons">${escapeHTML(reasons.join(' · '))}</small></span><strong>${score}/10</strong></button>`).join('')}` : '';
    const qrNode = document.querySelector('#qr-code');
    qrNode.innerHTML = '';
    const target = new URL(shareUrlForItem(item));
    document.querySelector('.qr-area').classList.toggle('hidden', !isFound);
    document.querySelector('#download-qr').disabled = !isFound;
    if (isFound && window.QRCode) new QRCode(qrNode, {text:target.href,width:128,height:128,colorDark:'#242620',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    else if (isFound) qrNode.textContent = 'QR library unavailable offline';
    if (!isFound) qrNode.innerHTML = '';
    document.querySelector('#detail-privacy').textContent = item.demo ? 'Sample data only; this listing has no real owner contact.' : item.sharedLink ? 'Shared report details are in this link. Contact details and photos stay private.' : 'Copy link shares the public report details only. Contact details and photos stay private.';
    document.querySelector('#contact-finder').classList.toggle('hidden', item.demo || item.sharedLink || !item.email);
    document.querySelector('#contact-finder').innerHTML = `${isFound ? 'Contact the finder' : 'Contact the owner'} <span>↗</span>`;
    document.querySelector('#delete-report').classList.toggle('hidden', item.demo || item.sharedLink || !items.some(entry => entry.id === item.id));
    if (updateUrl) updateAddress(item.id);
    if (!detailDialog.open) detailDialog.showModal();
  }
  function closeDialog(dialog) {
    dialog.close();
    if (dialog === detailDialog && /^#(?:item=|share=)/.test(window.location.hash)) history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  function stopQrScanner() {
    cancelAnimationFrame(scannerFrame);
    scannerFrame = 0;
    if (scannerStream) scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
    const video = document.querySelector('#scanner-video');
    video.pause(); video.srcObject = null;
    document.querySelector('#scanner-stage').classList.remove('scanning');
    document.querySelector('#stop-scan').classList.add('hidden');
    document.querySelector('#start-scan').classList.remove('hidden');
  }
  function openScannedReport(rawValue) {
    let reportId = '';
    let sharedItem = null;
    try {
      const url = new URL(rawValue, window.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      reportId = hash.get('item') || '';
      const shareToken = hash.get('share');
      if (shareToken) sharedItem = decodeShareItem(shareToken);
    } catch {}
    if (!reportId && /^findit-[a-z0-9-]+$/i.test(rawValue)) reportId = rawValue;
    let decodedId = reportId;
    try { decodedId = decodeURIComponent(reportId); } catch {}
    const item = sharedItem || items.find(entry => entry.id === decodedId);
    if (!item) {
      document.querySelector('#scanner-status').textContent = reportId ? 'This QR report is not saved in this browser.' : 'That QR code is not a valid FindIt item report.';
      return;
    }
    stopQrScanner();
    closeDialog(scannerDialog);
    openDetail(item, false);
  }
  async function scanQrFrame() {
    if (!scannerStream || !scannerDialog.open) return;
    try {
      const results = await scannerDetector.detect(document.querySelector('#scanner-video'));
      if (results.length) { openScannedReport(results[0].rawValue); return; }
    } catch { /* Wait for the next camera frame. */ }
    scannerFrame = requestAnimationFrame(scanQrFrame);
  }
  document.querySelector('#scan-qr').addEventListener('click', () => {
    document.querySelector('#scanner-status').textContent = 'Camera stays off until you choose Start camera.';
    scannerDialog.showModal();
  });
  document.querySelector('#start-scan').addEventListener('click', async () => {
    const status = document.querySelector('#scanner-status');
    if (!('BarcodeDetector' in window)) { status.textContent = 'QR scanning is not supported in this browser. Try a recent version of Chrome, Edge, or Safari.'; return; }
    if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'Camera access is unavailable here. Open this site on localhost or a secure HTTPS address.'; return; }
    try {
      scannerDetector = new BarcodeDetector({formats:['qr_code']});
      scannerStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const video = document.querySelector('#scanner-video');
      video.srcObject = scannerStream;
      await video.play();
      document.querySelector('#scanner-stage').classList.add('scanning');
      document.querySelector('#start-scan').classList.add('hidden');
      document.querySelector('#stop-scan').classList.remove('hidden');
      status.textContent = 'Point your camera at a FindIt item QR code.';
      scanQrFrame();
    } catch (error) {
      stopQrScanner();
      status.textContent = error?.name === 'NotAllowedError' ? 'Camera permission was not granted. You can still search reports by item name.' : 'The camera could not start. Check that no other app is using it, then try again.';
    }
  });
  document.querySelector('#stop-scan').addEventListener('click', () => {
    stopQrScanner();
    document.querySelector('#scanner-status').textContent = 'Camera stopped. You can restart it whenever you are ready.';
  });
  scannerDialog.addEventListener('close', stopQrScanner);
  function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  }
  document.querySelectorAll('[data-open-report]').forEach(button => button.addEventListener('click', () => {
    const type = button.dataset.reportType;
    const reportForm = document.querySelector('#report-form');
    reportForm.reset(); selectedPhotoData = '';
    document.querySelector('#photo-preview').innerHTML = '';
    document.querySelector('#photo-preview').classList.add('hidden');
    document.querySelector('#report-type').value = type ? (type === 'lost' ? 'Lost' : 'Found') : '';
    document.querySelector('#report-status').textContent = 'Local demo: the report and email are stored in this browser only. No one else can see them; no message is sent automatically.';
    updateReportCopy(); reportDialog.showModal();
  }));
  const photoInput = document.querySelector('#item-photo');
  const photoPreview = document.querySelector('#photo-preview');
  photoInput.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    selectedPhotoData = '';
    photoPreview.innerHTML = '';
    photoPreview.classList.add('hidden');
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { document.querySelector('#report-status').textContent = 'Choose a JPEG, PNG, or WebP image for the item photo.'; photoInput.value = ''; return; }
    if (file.size > 8 * 1024 * 1024) { document.querySelector('#report-status').textContent = 'Choose a photo smaller than 8 MB.'; photoInput.value = ''; return; }
    const reader = new FileReader();
    reader.onerror = () => { document.querySelector('#report-status').textContent = 'This photo could not be opened. Try another image.'; };
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => { document.querySelector('#report-status').textContent = 'This photo could not be opened. Try another image.'; };
      image.onload = () => {
        if (image.naturalWidth > 12000 || image.naturalHeight > 12000 || image.naturalWidth * image.naturalHeight > 40_000_000) {
          document.querySelector('#report-status').textContent = 'This image is too large to process safely. Choose one under 40 megapixels.';
          photoInput.value = '';
          return;
        }
        const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) { document.querySelector('#report-status').textContent = 'This photo could not be prepared. Try another image.'; photoInput.value = ''; return; }
        context.fillStyle = '#ffffff'; context.fillRect(0,0,canvas.width,canvas.height);
        context.drawImage(image,0,0,canvas.width,canvas.height);
        selectedPhotoData = canvas.toDataURL('image/jpeg',0.72);
        if (selectedPhotoData.length > MAX_PHOTO_DATA_LENGTH) {
          selectedPhotoData = canvas.toDataURL('image/jpeg',0.5);
          if (selectedPhotoData.length > MAX_PHOTO_DATA_LENGTH) {
            selectedPhotoData = '';
            document.querySelector('#report-status').textContent = 'This photo is still too large after compression. Choose a smaller photo.';
            photoInput.value = '';
            return;
          }
        }
        photoPreview.innerHTML = `<img src="${selectedPhotoData}" alt="Preview of your item photo"><button type="button" class="remove-photo" aria-label="Remove photo">Remove photo</button>`;
        photoPreview.classList.remove('hidden');
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
  photoPreview.addEventListener('click', event => {
    if (!event.target.closest('.remove-photo')) return;
    selectedPhotoData = ''; photoInput.value = ''; photoPreview.innerHTML = ''; photoPreview.classList.add('hidden');
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(dialog); });
    dialog.addEventListener('close', () => {
      if (dialog === detailDialog && /^#(?:item=|share=)/.test(window.location.hash)) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      }
    });
  });
  document.querySelector('#category-filter').addEventListener('change', event => {
    activeCategory = event.currentTarget.value;
    render();
  });
  document.querySelector('#type-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    activeType = button.dataset.type;
    document.querySelectorAll('#type-filters .filter').forEach(filter => filter.classList.toggle('active', filter === button));
    render();
  });
  function updateReportCopy() {
    const type = document.querySelector('#report-type').value;
    const found = type === 'Found';
    if (!type) {
      document.querySelector('#report-title').textContent = 'Report an item';
      document.querySelector('#report-intro').textContent = 'Choose whether you lost or found the item.';
      document.querySelector('#location-label').innerHTML = 'Where was it lost or found? <span>*</span>';
      document.querySelector('#item-location').placeholder = 'Enter a general place';
      document.querySelector('#date-label').textContent = 'When did it happen?';
      document.querySelector('#contact-label').innerHTML = 'Your email <span>*</span>';
      document.querySelector('#report-form [type="submit"]').textContent = 'Choose lost or found first';
      document.querySelector('#report-form [type="submit"]').disabled = true;
      return;
    }
    document.querySelector('#report-title').textContent = found ? 'Report a found item' : 'Report a lost item';
    document.querySelector('#report-intro').textContent = found ? 'Enter where you found the item and how it can be identified.' : 'Enter where you last saw the item and how it can be identified.';
    document.querySelector('#location-label').innerHTML = `${found ? 'Where was it found?' : 'Where was it last seen?'} <span>*</span>`;
    document.querySelector('#item-location').placeholder = found ? 'e.g. Riverside Park' : 'e.g. Northside Library';
    document.querySelector('#date-label').textContent = found ? 'When was it found?' : 'When was it last seen?';
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    document.querySelector('#item-date').max = today.toISOString().slice(0,10);
    document.querySelector('#contact-label').innerHTML = `${found ? 'Your email (finder)' : 'Your email (owner)'} <span>*</span>`;
    document.querySelector('#item-contact').placeholder = 'you@example.com';
    document.querySelector('#report-form [type="submit"]').textContent = found ? 'Save found report' : 'Save lost report';
    document.querySelector('#report-form [type="submit"]').disabled = false;
  }
  document.querySelector('#report-type').addEventListener('change', updateReportCopy);
  document.querySelector('#match-area').addEventListener('click', event => {
    const match = event.target.closest('[data-match-id]');
    if (match) openDetail(match.dataset.matchId);
  });
  search.addEventListener('input', render);
  document.querySelector('#sort-button').addEventListener('click', () => {
    newestFirst = !newestFirst;
    document.querySelector('#sort-button span').textContent = newestFirst ? 'Newest first' : 'Oldest first';
    render();
  });
  grid.addEventListener('click', event => {
    const saveButton = event.target.closest('[data-save-id]');
    if (saveButton) { toggleSavedItem(saveButton.dataset.saveId); return; }
    const openButton = event.target.closest('[data-item-id]');
    if (openButton) openDetail(openButton.dataset.itemId);
  });
  window.addEventListener('storage', event => {
    if (event.key === SAVED_KEY) { savedIds = readSavedItems(); render(); }
  });
  document.querySelector('#see-all').addEventListener('click', () => {
    activeCategory = 'All'; activeType = 'All'; search.value = '';
    document.querySelector('#category-filter').value = 'All';
    document.querySelectorAll('#type-filters .filter').forEach(button => button.classList.toggle('active', button.dataset.type === 'All'));
    render();
  });
  document.querySelector('#report-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const category = String(data.get('category') || 'Other');
    const type = String(data.get('type') || 'Found');
    const emojis = {'Electronics':'🎧','Mobile Phones':'📱','Laptops and Tablets':'💻','Bags and Backpacks':'👜','Wallets and Purses':'👛','Keys':'🔑','ID Cards and Documents':'🪪','Books and Stationery':'📚','Watches and Jewelry':'💍','Clothing':'🧣','Accessories':'🕶️','Water Bottles':'🧴','Other':'📦'};
    const item = {id:newId(),type,name:String(data.get('name')).trim(),category,location:String(data.get('location')).trim(),date:String(data.get('date') || ''),color:String(data.get('color') || '').trim(),description:String(data.get('description') || '').trim(),email:String(data.get('email') || '').trim(),emoji:emojis[category] || '📦',photoData:selectedPhotoData};
    if (!item.name || !item.location || !item.email) return;
    if (item.date) {
      const today = new Date();
      today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
      if (item.date > today.toISOString().slice(0,10)) {
        document.querySelector('#report-status').textContent = 'The date cannot be in the future. Please check it and try again.';
        document.querySelector('#item-date').focus();
        return;
      }
    }
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    const nextItems = [item, ...items];
    const saved = saveItems(nextItems);
    submitButton.disabled = false;
    if (!saved) {
      document.querySelector('#report-status').textContent = 'Could not save this report. Browser storage may be full or disabled. Your report was not added.';
      return;
    }
    items = nextItems; render(); form.reset(); selectedPhotoData = ''; photoPreview.innerHTML = ''; photoPreview.classList.add('hidden'); updateReportCopy(); closeDialog(reportDialog);
    document.querySelector('#report-status').textContent = 'Local demo: the report and email are stored in this browser only. No one else can see them; no message is sent automatically.';
    setTimeout(() => {
      openDetail(item.id);
      document.querySelector('#detail-status').textContent = 'Report saved on this device.';
    }, 250);
  });
  document.querySelector('#contact-finder').addEventListener('click', () => {
    const id = getHashItemId();
    const item = items.find(entry => entry.id === id);
    if (!item) { showToast('This item listing could not be found.'); return; }
    const subject = encodeURIComponent(`FindIt ${item.type === 'Found' ? 'recovery' : 'lost item'} request: ${item.name}`);
    const body = encodeURIComponent(item.type === 'Found' ? `Hi! I think I can identify your found item, “${item.name}”. Could we arrange a safe handoff?` : `Hi! I saw your lost item report for “${item.name}”. I may have information that can help.`);
    window.location.href = `mailto:${encodeURIComponent(item.email)}?subject=${subject}&body=${body}`;
  });
  document.querySelector('#delete-report').addEventListener('click', () => {
    if (!currentDetailItem || currentDetailItem.demo || currentDetailItem.sharedLink) return;
    const item = items.find(entry => entry.id === currentDetailItem.id);
    if (!item || !window.confirm('Delete this report from this browser? This cannot be undone.')) return;
    const nextItems = items.filter(entry => entry.id !== item.id);
    if (!saveItems(nextItems)) { document.querySelector('#detail-status').textContent = 'Could not delete this report because browser storage is unavailable.'; return; }
    items = nextItems;
    savedIds = savedIds.filter(id => id !== item.id);
    persistSavedItems(savedIds);
    closeDialog(detailDialog);
    render();
    showToast('Report deleted from this browser.');
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.focus(); }
  });
  document.querySelector('#copy-link').addEventListener('click', async () => {
    if (!currentDetailItem) { showToast('Open a report before copying its link.'); return; }
    const url = shareUrlForItem(currentDetailItem);
    try { await navigator.clipboard.writeText(url); document.querySelector('#detail-status').textContent = 'Shareable listing link copied. Email and photos are not included.'; }
    catch { document.querySelector('#detail-status').textContent = 'Clipboard access is unavailable in this browser.'; }
  });
  document.querySelector('#download-qr').addEventListener('click', () => {
    const qr = document.querySelector('#qr-code');
    const image = qr.querySelector('img');
    const canvas = qr.querySelector('canvas');
    const url = image?.src || canvas?.toDataURL('image/png');
    if (!url) { document.querySelector('#detail-status').textContent = 'QR code is still loading or unavailable.'; return; }
    const link = document.createElement('a'); link.href = url; link.download = 'findit-item-qr.png'; link.click();
    document.querySelector('#detail-status').textContent = 'QR image download started.';
  });
  document.querySelector('#print-qr').addEventListener('click', () => window.print());
  const themeToggle = document.querySelector('#theme-toggle');
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
    themeToggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#000000' : '#f5f5f7';
  }
  let preferredTheme = 'light';
  try { preferredTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch {}
  applyTheme(preferredTheme);
  themeToggle.addEventListener('click', () => {
    preferredTheme = preferredTheme === 'dark' ? 'light' : 'dark';
    applyTheme(preferredTheme);
    try { localStorage.setItem(THEME_KEY, preferredTheme); } catch {}
  });
  window.addEventListener('hashchange', () => {
    const sharedItem = getHashShareItem();
    if (sharedItem) { openDetail(sharedItem, false); return; }
    const id = getHashItemId();
    if (id && items.some(item => item.id === id)) openDetail(id, false);
    else if (/^#(?:item=|share=)/.test(window.location.hash)) showToast('This report link is invalid or incomplete.');
  });
  render();
  const initialItem = getHashShareItem() || getHashItemId();
  if (initialItem) openDetail(initialItem, false);
  const qrScript = document.createElement('script');
  qrScript.src = 'vendor/qrcodejs/qrcode.min.js';
  qrScript.async = true;
  qrScript.onload = () => { const item = getHashShareItem() || getHashItemId(); if (detailDialog.open && item) openDetail(item, false); };
  qrScript.onerror = () => { document.querySelector('#qr-code').textContent = 'QR unavailable offline'; };
  document.head.appendChild(qrScript);
})();
