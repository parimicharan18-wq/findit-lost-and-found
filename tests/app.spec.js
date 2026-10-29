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
  const shareUrl = await page.evaluate(async () => { while (!document.querySelector('#detail-status').textContent.includes('Shareable listing link copied.')) await new Promise(resolve => setTimeout(resolve, 25)); return navigator.clipboard.readText(); });
  const token = new URL(shareUrl).hash.slice('#share='.length);
  const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
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

test('configured community reports appear across browsers and keep reporter email private', async ({ page }) => {
  await page.addInitScript(() => { window.FINDIT_CONFIG = {supabaseUrl:'https://findit-test.supabase.co',supabasePublishableKey:'sb_publishable_test'}; });
  await page.route('https://findit-test.supabase.co/rest/v1/findit_reports?**', route => route.fulfill({
    contentType:'application/json', body:JSON.stringify([{
      id:'shared-report-01',type:'Found',name:'Community keys',category:'Keys',location:'North library',date:'2026-10-28',color:'Brass loop',description:'Small key set',emoji:'🔑',photo_path:null,created_at:'2026-10-28T12:00:00Z'
    }])
  }));
  await page.goto('/');
  await expect(page.locator('.item-title').filter({hasText:'Community keys'})).toBeVisible();
  await expect(page.locator('#hero-count-label')).toHaveText('community reports');
  await page.getByRole('button',{name:'View Community keys'}).click();
  await expect(page.locator('#detail-privacy')).toContainText('Reporter email stays private');
  await expect(page.locator('#contact-finder')).toHaveText(/Message the reporter/);
});

test('a secret Supabase service key cannot enable the browser backend', async ({ page }) => {
  await page.addInitScript(() => { window.FINDIT_CONFIG = {supabaseUrl:'https://findit-test.supabase.co',supabasePublishableKey:'sb_secret_do_not_use_in_browser'}; });
  await page.goto('/');
  await expect(page.locator('#shared-mode-badge')).toHaveText('SAMPLE REPORTS INCLUDED');
  await expect(page.getByRole('button',{name:/My inbox/})).toBeHidden();
});

test('a committed report can be recovered after its first response is lost', async ({ page }) => {
  let createCalls = 0;
  await page.addInitScript(() => { window.FINDIT_CONFIG = {supabaseUrl:'https://findit-test.supabase.co',supabasePublishableKey:'sb_publishable_test'}; });
  await page.route('https://findit-test.supabase.co/rest/v1/findit_reports?**', route => route.fulfill({contentType:'application/json',body:'[]'}));
  await page.route('https://findit-test.supabase.co/rest/v1/rpc/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (path.endsWith('/findit_create_report')) {
      createCalls += 1;
      if (createCalls === 1) return route.fulfill({status:503,contentType:'application/json',body:'{"message":"connection interrupted"}'});
      return route.fulfill({contentType:'application/json',body:JSON.stringify({id:body.p_report.id})});
    }
    if (path.endsWith('/findit_list_messages')) return route.fulfill({contentType:'application/json',body:'[]'});
    return route.fulfill({contentType:'application/json',body:'true'});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'I found an item'}).first().click();
  await page.locator('#item-name').fill('Recovered shared report');
  await page.locator('#item-location').fill('Main library');
  await page.locator('#item-contact').fill('owner@example.test');
  await page.getByRole('button',{name:'Save found report'}).click();
  await expect(page.locator('#detail-name')).toHaveText('Recovered shared report');
  await expect(page.locator('#detail-status')).toContainText('Your report is shared');
  expect(createCalls).toBe(2);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('findit-reports-v2')).find(item => item.name === 'Recovered shared report'));
  expect(stored.remote).toBe(true);
  expect(stored.ownerToken).toMatch(/^[a-f0-9]{64}$/);
});

test('shared report creation sends public fields and a private owner token, never the reporter email', async ({ page }) => {
  let submitted;
  await page.addInitScript(() => { window.FINDIT_CONFIG = {supabaseUrl:'https://findit-test.supabase.co',supabasePublishableKey:'sb_publishable_test'}; });
  await page.route('https://findit-test.supabase.co/rest/v1/findit_reports?**', route => route.fulfill({contentType:'application/json',body:'[]'}));
  await page.route('https://findit-test.supabase.co/rest/v1/rpc/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (path.endsWith('/findit_create_report')) { submitted = body; return route.fulfill({contentType:'application/json',body:JSON.stringify({id:body.p_report.id})}); }
    if (path.endsWith('/findit_list_messages')) return route.fulfill({contentType:'application/json',body:'[]'});
    return route.fulfill({contentType:'application/json',body:'true'});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'I found an item'}).first().click();
  await page.locator('#item-name').fill('Shared test umbrella');
  await page.locator('#item-location').fill('City library');
  await page.locator('#item-contact').fill('private-owner@example.test');
  await page.getByRole('button',{name:'Save found report'}).click();
  await expect(page.locator('#detail-name')).toHaveText('Shared test umbrella');
  expect(submitted.p_report.name).toBe('Shared test umbrella');
  expect(submitted.p_report.email).toBeUndefined();
  expect(submitted.p_owner_token).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(submitted)).not.toContain('private-owner@example.test');
  await expect(page.locator('#detail-privacy')).toContainText('Your email stays in this browser');
});

test('a shared listing accepts a private message and the matching owner token opens the inbox', async ({ page }) => {
  const ownerToken = 'a'.repeat(64);
  const reportId = 'findit-owner-12345';
  await page.addInitScript(({token,id}) => {
    window.FINDIT_CONFIG = {supabaseUrl:'https://findit-test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
    localStorage.setItem('findit-reports-v2',JSON.stringify([{id,type:'Found',name:'Owner listing',category:'Keys',location:'Campus',date:'2026-10-28',color:'',description:'',emoji:'🔑',email:'not-in-backend@example.test',remote:true,ownerToken:token}]));
  },{token:ownerToken,id:reportId});
  let messageCalls = 0;
  await page.route('https://findit-test.supabase.co/rest/v1/findit_reports?**', route => route.fulfill({
    contentType:'application/json',body:JSON.stringify([{id:reportId,type:'Found',name:'Owner listing',category:'Keys',location:'Campus',date:'2026-10-28',color:'',description:'',emoji:'🔑',photo_path:null,created_at:'2026-10-28T12:00:00Z'}])
  }));
  await page.route('https://findit-test.supabase.co/rest/v1/rpc/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (path.endsWith('/findit_list_messages')) {
      messageCalls += 1;
      expect(body.p_owner_tokens[reportId]).toBe(ownerToken);
      return route.fulfill({contentType:'application/json',body:JSON.stringify([{message_id:'msg-1',report_id:reportId,report_name:'Owner listing',sender_email:'helper@example.test',message:'I found the blue key tag.',created_at:'2026-10-29T12:00:00Z'}])});
    }
    return route.fulfill({contentType:'application/json',body:'true'});
  });
  await page.goto('/');
  await page.getByRole('button',{name:/My inbox/}).click();
  await expect(page.locator('#inbox-list')).toContainText('I found the blue key tag.');
  await expect(page.locator('#inbox-list')).toContainText('helper@example.test');
  await expect(page.locator('#inbox-count')).toHaveText('1');
  expect(messageCalls).toBeGreaterThan(0);
});

test('message senders can contact a shared report without seeing the reporter email', async ({ page }) => {
  const reportId = 'shared-contact-1234';
  let sentMessage;
  await page.addInitScript(() => { window.FINDIT_CONFIG = {supabaseUrl:'https://findit-test.supabase.co',supabasePublishableKey:'sb_publishable_test'}; });
  await page.route('https://findit-test.supabase.co/rest/v1/findit_reports?**', route => route.fulfill({
    contentType:'application/json',body:JSON.stringify([{id:reportId,type:'Lost',name:'Lost red backpack',category:'Bags and Backpacks',location:'Main hall',date:'2026-10-27',color:'Red',description:'',emoji:'🎒',photo_path:null,created_at:'2026-10-27T12:00:00Z'}])
  }));
  await page.route('https://findit-test.supabase.co/rest/v1/rpc/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/findit_list_messages')) return route.fulfill({contentType:'application/json',body:'[]'});
    if (path.endsWith('/findit_send_message')) {
      sentMessage = route.request().postDataJSON();
      return route.fulfill({contentType:'application/json',body:'"message-id"'});
    }
    return route.fulfill({contentType:'application/json',body:'true'});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'View Lost red backpack'}).click();
  await page.getByRole('button',{name:/Message the reporter/}).click();
  await page.locator('#message-email').fill('helper@example.test');
  await page.locator('#message-text').fill('I may have found your item.');
  await page.getByRole('button',{name:'Send private message'}).click();
  await expect(page.locator('#detail-status')).toContainText('private inbox');
  expect(sentMessage.p_report_id).toBe(reportId);
  expect(sentMessage.p_sender_email).toBe('helper@example.test');
  expect(JSON.stringify(sentMessage)).not.toContain('reporter@example.test');
});
