const { test, expect } = require('@playwright/test');
const { launchApp, loginAsAdmin, bootstrapShopifyData } = require('./helpers');

test.describe('CRM Dashboard and Navigation Flow', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    const app = await launchApp();
    electronApp = app.electronApp;
    window = app.window;
    await loginAsAdmin(window);
    await bootstrapShopifyData(window);
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Should load KPI metrics on Dashboard', async () => {
    // Check key elements of the dashboard are loaded
    await expect(window.locator('header')).toContainText('Dashboard');
    
    // Check cards
    await expect(window.locator('text=Total Revenue')).toBeVisible();
    await expect(window.locator('text=Store Orders')).toBeVisible();
    await expect(window.locator('text=Total Customers')).toBeVisible();
    await expect(window.locator('text=Low Stock alerts')).toBeVisible();
  });

  test('Should navigate to all main pages and sub-pages via sidebar', async () => {
    // 1. Navigate to Products -> Manage Products
    // First, since it is a collaspible menu, we can hover or click on the CollapsibleTrigger for Products if needed, or simply click on the subitem if it's already visible.
    await window.getByRole('link', { name: 'Manage Products' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Manage Products');

    // 2. Navigate to Products -> Stock Management
    await window.getByRole('link', { name: 'Stock Management' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Dashboard');
    await window.waitForTimeout(3000);
    await expect(window.getByRole('heading', { name: 'Stock Control Ledger' })).toBeVisible();

    // 3. Navigate to Customers -> Manage Customers
    await window.getByRole('link', { name: 'Manage Customers' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Dashboard');
    await expect(window.getByRole('button', { name: 'Add Customer' })).toBeVisible();

    // 4. Navigate to Referrals -> All Referrals
    await window.getByRole('link', { name: 'All Referrals' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('All Referrals');

    // 5. Navigate to Referrals -> Commission Dashboard
    await window.getByRole('link', { name: 'Commission Dashboard' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Commission Dashboard');

    // 6. Navigate to Orders -> Manage Orders
    await window.getByRole('link', { name: 'Manage Orders' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Manage Orders');
  });

  test('Should navigate to settings and utility views', async () => {
    // Open Settings & Support dropdown in the footer
    const settingsTrigger = window.getByRole('button', { name: 'Settings & Support' });
    await expect(settingsTrigger).toBeVisible();
    await settingsTrigger.click();
    await window.waitForTimeout(3000);

    // 1. Navigate to System Settings
    await window.locator('text=System Settings').click();
    await window.waitForTimeout(3000);
    await expect(window.locator('text=Database Backup')).toBeVisible();

    // Re-open settings dropdown
    await settingsTrigger.click();
    await window.waitForTimeout(3000);
    
    // 2. Navigate to Invoice Editor
    await window.locator('text=Invoice Editor').click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Invoice Designer');

    // Re-open settings dropdown
    await settingsTrigger.click();
    await window.waitForTimeout(3000);

    // 3. Navigate to API Playground
    await window.locator('text=API Playground').click();
    await window.waitForTimeout(3000);
    // Default header is "Dashboard"
    await expect(window.getByRole('heading', { name: 'API Playground' })).toBeVisible();

    // Re-open settings dropdown
    await settingsTrigger.click();
    await window.waitForTimeout(3000);

    // 4. Navigate to Developer Console
    await window.locator('text=Developer Console').click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Developer Console');

    // Re-open settings dropdown
    await settingsTrigger.click();
    await window.waitForTimeout(3000);

    // 5. Navigate to App Update
    await window.locator('text=App Update').click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Software Updates');

    // Re-open settings dropdown
    await settingsTrigger.click();
    await window.waitForTimeout(3000);

    // 6. Open Help & Support dialog
    await window.locator('text=Help & Support').click();
    await window.waitForTimeout(3000);
    // Verify dialog opens
    await expect(window.locator('text=CRM Mastery Center')).toBeVisible();
    
    // Close the dialog by clicking outside or close button (if Dialog has close, let's hit Escape key)
    await window.keyboard.press('Escape');
    await expect(window.locator('text=CRM Mastery Center')).not.toBeVisible();
  });
});
