const { test, expect } = require('@playwright/test');

test('search and report filters work with the sample listings', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.item-card')).toHaveCount(13);
  await page.getByRole('searchbox', { name: 'Search reports' }).fill('brass keys');
  await expect(page.locator('.item-card')).toHaveCount(1);
  await expect(page.locator('.item-title')).toHaveText('Set of brass keys');
  await page.getByRole('searchbox', { name: 'Search reports' }).fill('');
  await page.locator('#type-filters').getByRole('button', { name: 'Lost items' }).click({ force: true });
  await expect(page.locator('.item-card')).toHaveCount(5);
});

test('found report persists and produces a locally generated QR code', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I found an item' }).first().click();
  await page.locator('#item-name').fill('Test keys');
  await page.locator('#item-location').fill('Test library');
  await page.locator('#item-contact').fill('finder@example.test');
  await page.locator('#item-photo').setInputFiles({ name:'unsafe.svg', mimeType:'image/svg+xml', buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') });
  await expect(page.locator('#report-status')).toContainText('JPEG, PNG, or WebP');
  await page.locator('#item-photo').setInputFiles({ name:'tiny.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64') });
  await expect(page.locator('#photo-preview img')).toBeVisible();
  await page.getByRole('button', { name: 'Save found report' }).click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await expect(page.locator('#detail-name')).toHaveText('Test keys');
  await expect(page.locator('#detail-art img')).toBeVisible();
  await expect(page.locator('#qr-code canvas')).toHaveCount(1);
  await page.getByRole('button', { name: /Close/ }).click();
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search reports' }).fill('Test keys');
  await expect(page.locator('.item-card')).toHaveCount(1);
});

test('shared report details exclude private email and photo data', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'I lost an item' }).first().click();
  await page.locator('#item-name').fill('Private detail check');
  await page.locator('#item-location').fill('North library');
  await page.locator('#item-contact').fill('private@example.test');
  await page.getByRole('button', { name: 'Save lost report' }).click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await page.locator('#copy-link').click();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  const token = new URL(shareUrl).hash.slice('#share='.length).replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  expect(payload.name).toBe('Private detail check');
  expect(payload.email).toBeUndefined();
  expect(payload.photoData).toBeUndefined();
  await page.evaluate(() => localStorage.clear());
  await page.goto(shareUrl);
  await expect(page.locator('#detail-name')).toHaveText('Private detail check');
  await expect(page.locator('#contact-finder')).toBeHidden();
});

test('malformed saved records are ignored and stored markup is rendered as text', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('findit-reports-v2', JSON.stringify([
      null,
      { id:'bad-entry', type:'<script>', name:'bad', location:'nowhere' },
      { id:'xss-item', type:'Found', name:'<img src=x onerror=window.xss=1>', category:'<img>', location:'Test place', date:'not-a-date', email:'not-an-email', photoData:'javascript:alert(1)' }
    ]));
    window.xss = 0;
  });
  await page.goto('/');
  await expect(page.locator('.item-card')).toHaveCount(14);
  await page.getByRole('searchbox', { name: 'Search reports' }).fill('<img src=x onerror=window.xss=1>');
  await expect(page.locator('.item-card')).toHaveCount(1);
  await page.locator('.item-open').click({ force: true });
  await expect(page.locator('#detail-name')).toHaveText('<img src=x onerror=window.xss=1>');
  await expect(page.locator('#detail-info img, #detail-art img')).toHaveCount(0);
  expect(await page.evaluate(() => window.xss)).toBe(0);
});

test('a user can delete only their local report', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I lost an item' }).first().click();
  await page.locator('#item-name').fill('Delete me');
  await page.locator('#item-location').fill('Test location');
  await page.locator('#item-contact').fill('owner@example.test');
  await page.getByRole('button', { name: 'Save lost report' }).click();
  await expect(page.locator('#delete-report')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#delete-report').click();
  await expect(page.locator('#detail-dialog')).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search reports' }).fill('Delete me');
  await expect(page.locator('.item-card')).toHaveCount(0);
});

test('QR scanner requests no camera access until the visitor starts it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Scan QR' }).click();
  await expect(page.locator('#scanner-dialog')).toBeVisible();
  await expect(page.locator('#scanner-status')).toContainText('Camera stays off');
  await expect(page.locator('#start-scan')).toBeVisible();
  expect(await page.locator('#scanner-video').evaluate(video => video.srcObject)).toBeNull();
});

test('QR scanning opens a shared report in a fresh local context', async ({ page }) => {
  const report = { id:'scan-test', type:'Found', name:'Scanned report', category:'Keys', location:'Test library', date:'2026-01-15', color:'Brass', description:'Test listing', emoji:'🔑' };
  const token = Buffer.from(JSON.stringify(report)).toString('base64url');
  await page.addInitScript(({ token: shareToken }) => {
    class MockBarcodeDetector {
      async detect() { return [{ rawValue:`http://127.0.0.1:4173/#share=${shareToken}` }]; }
    }
    Object.defineProperty(window, 'BarcodeDetector', { value:MockBarcodeDetector });
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }, { token });
  await page.goto('/');
  await page.getByRole('button', { name:'Scan QR' }).click();
  await page.getByRole('button', { name:'Start camera' }).click();
  await expect(page.locator('#detail-name')).toHaveText('Scanned report');
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await expect(page.locator('#contact-finder')).toBeHidden();
});
