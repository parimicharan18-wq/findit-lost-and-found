const rawUrl = process.argv[2];
if (!rawUrl) throw new Error('Pass the published HTTPS site URL.');
const site = new URL(rawUrl);
const localHttp = site.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(site.hostname);
if ((site.protocol !== 'https:' && !localHttp) || site.username || site.password) throw new Error('The smoke check only accepts HTTPS URLs (or loopback HTTP for local verification).');

async function fetchOk(url) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, { redirect:'follow', signal:AbortSignal.timeout(15_000) });
      if (response.ok) return response;
      lastError = new Error(`${response.status} from ${url}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  throw lastError || new Error(`Could not fetch ${url}`);
}

const htmlResponse = await fetchOk(site.href);
if (!htmlResponse.headers.get('content-type')?.includes('text/html')) throw new Error('Published root did not return HTML.');
const html = await htmlResponse.text();
if (!html.includes('<title>FindIt') || !html.includes('id="item-grid"') || !html.includes("default-src 'self'")) {
  throw new Error('Published HTML is missing the FindIt title, listing grid, or content policy.');
}
const localAssets = new Set([...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
  .map(match => match[1])
  .filter(value => !/^[a-z]+:/i.test(value))
  .map(value => new URL(value, site).href));
const appUrl = [...localAssets].find(value => new URL(value).pathname.endsWith('/app.js'));
if (!appUrl) throw new Error('Published HTML does not load the FindIt app script.');
const manifestResponse = await fetchOk(new URL('./manifest.webmanifest', site).href);
const manifest = await manifestResponse.json();
const iconSizes = new Set((manifest.icons || []).flatMap(icon => String(icon.sizes || '').split(/\\s+/)));
if (!iconSizes.has('192x192') || !iconSizes.has('512x512') || manifest.display !== 'standalone') {
  throw new Error('Published PWA manifest is missing the required app icons or standalone display mode.');
}
for (const icon of manifest.icons || []) await fetchOk(new URL(icon.src, manifestResponse.url).href);
const workerResponse = await fetchOk(new URL('./service-worker.js', site).href);
const workerSource = await workerResponse.text();
if (!workerSource.includes('findit-report-sync') || !workerSource.includes('APP_SHELL_PATHS')) {
  throw new Error('Published service worker is missing offline cache or background report sync.');
}
const appResponse = await fetchOk(appUrl);
const appSource = await appResponse.text();
const qrRelativePath = appSource.match(/qrScript\.src\s*=\s*'([^']+)'/)?.[1];
if (!qrRelativePath) throw new Error('App script does not configure a local QR generator.');
localAssets.add(new URL(qrRelativePath, appUrl).href);
for (const asset of localAssets) await fetchOk(asset);
console.log(`Deployment smoke check passed for ${site.origin}${site.pathname} (${localAssets.size} local assets).`);
