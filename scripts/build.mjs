import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'dist');
const entries = ['index.html', 'privacy.html', 'robots.txt', 'sitemap.xml', 'app.js', 'owner-portal.js', 'shared-config.js', 'shared-backend.js', 'offline-sync.js', 'styles.css', 'pwa.js', 'service-worker.js', 'manifest.webmanifest', 'assets', 'vendor'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of entries) await cp(resolve(root, entry), resolve(output, entry), { recursive: true });

const html = await readFile(resolve(output, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]).filter(value => !/^[a-z]+:/i.test(value));
for (const reference of references) {
  const cleanPath = decodeURIComponent(reference.split('?')[0]).replaceAll('/', sep);
  const resolved = resolve(output, cleanPath);
  const pathFromOutput = relative(output, resolved);
  if (pathFromOutput.startsWith(`..${sep}`) || pathFromOutput === '..') throw new Error(`Build reference escapes output directory: ${reference}`);
  try { await stat(resolved); } catch { throw new Error(`Missing local file referenced by index.html: ${reference}`); }
}
if (!html.includes("default-src 'self'") || !(await readFile(resolve(output, 'app.js'), 'utf8')).includes("vendor/qrcodejs/qrcode.min.js")) {
  throw new Error('Expected local-only scripts and a self-only content policy.');
}
const manifest = JSON.parse(await readFile(resolve(output, 'manifest.webmanifest'), 'utf8'));
const iconSizes = new Set((manifest.icons || []).flatMap(icon => String(icon.sizes || '').split(/\\s+/)));
if (!manifest.name || !manifest.start_url || !['standalone','minimal-ui','fullscreen'].includes(manifest.display) || !iconSizes.has('192x192') || !iconSizes.has('512x512')) {
  throw new Error('PWA manifest is missing its app name, launch mode, or 192/512 icons.');
}
const worker = await readFile(resolve(output, 'service-worker.js'), 'utf8');
if (!worker.includes('findit-report-sync') || !worker.includes('APP_SHELL_PATHS')) {
  throw new Error('Service worker is missing offline caching or queued report sync.');
}

console.log(`Built ${entries.length} site entries into ${relative(root, output)}.`);
