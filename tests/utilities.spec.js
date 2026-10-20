const { test, expect } = require('@playwright/test');
const { launchApp, loginAsAdmin, bootstrapShopifyData } = require('./helpers');

test.describe('CRM Utilities, Invoice Designer, and Settings Flow', () => {
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

  test('Should create, save, and delete an invoice template in Invoice Designer', async () => {
    // Navigate to Invoice Designer
    await window.getByRole('button', { name: 'Settings & Support' }).click();
    await window.locator('text=Invoice Editor').click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header').first()).toContainText('Invoice Designer');

    // 1. Create New Template
    await window.getByRole('button', { name: 'Create New' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('text=Designing Invoice')).toBeVisible();

    // 2. Add elements to canvas
    await window.getByRole('button', { name: 'Plain Text' }).click();
    await window.waitForTimeout(3000);
    // Verify an element has been added (should be in the layers tab list)
    await window.getByRole('tab', { name: 'Layers' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('text=New Text').first()).toBeVisible();

    // 3. Open Save Template Dialog
    await window.getByRole('button', { name: 'Template Actions' }).click();
    await window.waitForTimeout(3000);
    await window.getByRole('menuitem', { name: 'Save Template' }).click();
    await window.waitForTimeout(3000);

    // Enter name and save
    const templateName = `Test Invoice Temp ${Date.now()}`;
    await window.locator('input#name').fill(templateName);
    await window.waitForTimeout(3000);
    await window.getByRole('button', { name: 'Save Template', exact: true }).click();
    await window.waitForTimeout(3000);

    // Dialog should close
    await expect(window.getByRole('dialog')).not.toBeVisible();

    // Click exit to selection view
    await window.locator('header button').first().click(); // click close (X button in header)
    await window.waitForTimeout(3000);
    await expect(window.locator('header').first()).toContainText('Invoice Designer');

    // 4. Verify template is in collection list
    await expect(window.locator('body')).toContainText(templateName);

    // 5. Delete template
    // Locate template card, find trash button, click it, and accept confirm dialog
    window.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('delete this template');
      await dialog.accept();
    });

    const card = window.locator('.group').filter({ hasText: templateName });
    const trashBtn = card.locator('button');
    await trashBtn.click();
    await window.waitForTimeout(3000);

    // Verify deleted
    await expect(window.locator('body')).not.toContainText(templateName);
  });

  test('Should view database specs and trigger backup', async () => {
    // Navigate to Database settings
    await window.getByRole('button', { name: 'Settings & Support' }).click();
    await window.locator('text=System Settings').click();
    await window.waitForTimeout(3000);

    // Check system specs are present
    await expect(window.locator('text=System Specifications')).toBeVisible();
    await expect(window.locator('text=SQLite 3')).toBeVisible();

    // Click backup (should invoke ipc backup, which opens electron dialog)
    // Note: Since electron dialog is handled by macOS native sheet, clicking "Create Backup File"
    // will open a dialog. The main process handles this asynchronously. If it returns cancellation,
    // the UI handles it gracefully (no crash). Let's test that clicking it doesn't crash the UI.
    const backupBtn = window.getByRole('button', { name: 'Create Backup File' });
    await expect(backupBtn).toBeVisible();
    await backupBtn.click();
    await window.waitForTimeout(3000);

    // Wait short time to ensure no crash and button is active
    await window.waitForTimeout(500);
    await expect(backupBtn).toBeEnabled();
  });

  test('Should execute IPC call in API Playground', async () => {
    // Navigate to API Playground
    await window.getByRole('button', { name: 'Settings & Support' }).click();
    await window.locator('text=API Playground').click();
    await window.waitForTimeout(3000);

    // Select getCurrentVersion in API Playground
    await window.getByLabel('Select API method').selectOption('getCurrentVersion');
    await window.waitForTimeout(3000);

    // Click run
    await window.getByRole('button', { name: 'Run' }).click();
    await window.waitForTimeout(3000);

    // Verify response contains version info
    await window.waitForTimeout(500);
    await expect(window.locator('pre')).toContainText('"version":');
  });

  test('Should configure Shopify details in Developer Console and run sync', async () => {
    // 1. Navigate to Developer Console
    await window.getByRole('button', { name: 'Settings & Support' }).click();
    await window.locator('text=Developer Console').click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header').first()).toContainText('Developer Console');

    // 2. Fill credentials
    const domainInput = window.getByLabel('Store myshopify Domain');
    const tokenInput = window.getByLabel('Admin Access Token (shpat_...)');

    await domainInput.fill('mock-test-store.myshopify.com');
    await window.waitForTimeout(3000);
    await tokenInput.fill('shpat_mocktoken123456');
    await window.waitForTimeout(3000);

    // 3. Click Save Settings
    await window.getByRole('button', { name: 'Save Settings' }).click();
    await window.waitForTimeout(3000);

    // Verify success banner/log
    await expect(window.locator('text=Credentials saved successfully')).toBeVisible();

    // 4. Click Sync All Data
    await window.getByRole('button', { name: 'Sync All Data' }).click();
    await window.waitForTimeout(3000);

    // Verify that sync logs start showing up in the console
    await expect(window.locator('text=Starting pull sync')).toBeVisible();
    
    // Wait for the sync to run and log
    await window.waitForTimeout(2000);
  });
});
