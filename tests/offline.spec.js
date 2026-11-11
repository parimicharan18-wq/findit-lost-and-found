const { test, expect } = require('@playwright/test');

async function seedOwnerSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('findit-owner-session-v1', JSON.stringify({
      access_token:'test-access-token',
      refresh_token:'test-refresh-token',
      user:{id:'test-owner',email:'owner@example.test',user_metadata:{},app_metadata:{provider:'email'}}
    }));
  });
  await page.route('**/auth/v1/user*', route => route.fulfill({
    contentType:'application/json',
    body:JSON.stringify({id:'test-owner',email:'owner@example.test',user_metadata:{},app_metadata:{provider:'email'}})
  }));
}

test('installed app shell opens offline and local reports remain available', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.FINDIT_CONFIG = {supabaseUrl:'',supabasePublishableKey:''};
  });
  await seedOwnerSession(page);
  await page.goto('/');
  await expect(page.locator('.item-card')).toHaveCount(13);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', {name:/Lost something/})).toBeVisible();
  await expect(page.locator('.item-card')).toHaveCount(13);
  await expect(page.locator('#offline-status-text')).toContainText('Offline mode');

  await page.getByRole('button', {name:'I lost an item'}).first().click();
  await page.locator('#item-name').fill('Offline blue umbrella');
  await page.locator('#item-location').fill('College library');
  await page.locator('#item-contact').fill('offline@example.test');
  await page.getByRole('button', {name:'Save lost report'}).click();
  await expect(page.locator('#detail-name')).toHaveText('Offline blue umbrella');
  await expect(page.locator('#detail-status')).toContainText('Saved offline');
  await page.reload();
  await page.getByRole('searchbox', {name:'Search reports'}).fill('Offline blue umbrella');
  await expect(page.locator('.item-card')).toHaveCount(1);
});

test('offline community reports are queued and sync once after reconnection', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.FINDIT_CONFIG = {
      supabaseUrl:'https://findit-shared-test.supabase.co',
      supabasePublishableKey:'sb_publishable_test'
    };
  });
  await seedOwnerSession(page);

  await page.route('https://findit-shared-test.supabase.co/rest/v1/findit_owner_items?**', route => route.fulfill({
    contentType:'application/json',body:'[]'
  }));
  await page.route('https://findit-shared-test.supabase.co/rest/v1/findit_reports?**', route => route.fulfill({
    contentType:'application/json',body:'[]'
  }));

  let createCalls = 0;
  await page.route('https://findit-shared-test.supabase.co/rest/v1/rpc/findit_create_report', async route => {
    createCalls += 1;
    const payload = route.request().postDataJSON();
    return route.fulfill({
      contentType:'application/json',
      body:JSON.stringify({id:payload.p_report.id,type:payload.p_report.type,name:payload.p_report.name})
    });
  });

  await page.goto('/');
  await expect(page.locator('#items')).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', {name:'I found an item'}).first().click();
  await page.locator('#item-name').fill('Offline found keys');
  await page.locator('#item-location').fill('Library entrance');
  await page.locator('#item-contact').fill('finder@example.test');
  await page.getByRole('button', {name:'Save found report'}).click();
  await expect(page.locator('#detail-status')).toContainText('Saved offline');
  expect(createCalls).toBe(0);

  await context.setOffline(false);
  await expect.poll(() => createCalls, {timeout:10000}).toBe(1);
  await expect(page.locator('#offline-status-text')).toContainText('up to date');
  expect(createCalls).toBe(1);
});
