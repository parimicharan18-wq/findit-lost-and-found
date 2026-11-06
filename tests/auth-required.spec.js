const { test, expect } = require('@playwright/test');

test('new visitors must create an account before the app unlocks', async ({ page }) => {
  await page.addInitScript(() => {
    window.FINDIT_CONFIG = {supabaseUrl:'https://findit-auth-test.supabase.co',supabasePublishableKey:'sb_publishable_test'};
  });
  await page.route('https://findit-auth-test.supabase.co/auth/v1/settings', route => route.fulfill({
    contentType:'application/json',body:JSON.stringify({external:{phone:false}})
  }));
  await page.route('https://findit-auth-test.supabase.co/auth/v1/signup', route => route.fulfill({
    contentType:'application/json',body:JSON.stringify({
      access_token:'signed-in-test-token',refresh_token:'signed-in-test-refresh',
      user:{id:'new-test-owner',email:'new-owner@example.test',user_metadata:{full_name:'New Owner',mobile:'9876543210'},app_metadata:{provider:'email'},created_at:'2026-11-06T00:00:00Z'}
    })
  }));
  await page.route('https://findit-auth-test.supabase.co/rest/v1/findit_owner_items?**', route => route.fulfill({
    contentType:'application/json',body:'[]'
  }));
  await page.goto('/');

  await expect(page.locator('#owner-auth-dialog')).toBeVisible();
  await expect(page.locator('#items')).toBeHidden();
  await expect(page.locator('#owner-auth-close')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#owner-auth-dialog')).toBeVisible();

  await page.locator('#owner-auth-toggle').click();
  await expect(page.locator('#owner-auth-title')).toHaveText('Create account');
  await page.locator('#owner-full-name').fill('New Owner');
  await page.locator('#owner-mobile').fill('9876543210');
  await page.locator('#owner-email').fill('new-owner@example.test');
  await page.locator('#owner-password').fill('a-long-test-password');
  await page.locator('#owner-confirm-password').fill('a-long-test-password');
  await page.locator('#owner-auth-form [type="submit"]').click();

  await expect(page.locator('#owner-auth-dialog')).toBeHidden();
  await expect(page.locator('#items')).toBeVisible();
  await expect(page.locator('#owner-nav-label')).toHaveText('My profile');
});
