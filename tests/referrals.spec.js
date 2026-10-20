const { test, expect } = require('@playwright/test');
const { launchApp, loginAsAdmin, bootstrapShopifyData } = require('./helpers');

test.describe('CRM Referral Partners CRUD Flow', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    const app = await launchApp();
    electronApp = app.electronApp;
    window = app.window;
    await loginAsAdmin(window);
    await bootstrapShopifyData(window);
    // Navigate to All Referrals
    await window.getByRole('link', { name: 'All Referrals' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('All Referrals');
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Should perform complete CRUD operations on a referral partner', async () => {
    // 1. Open "Add Referral" Modal
    const addReferralBtn = window.getByRole('button', { name: 'Add Referral' });
    await expect(addReferralBtn).toBeVisible();
    await addReferralBtn.click();
    await window.waitForTimeout(3000);

    // Verify modal is open
    await expect(window.locator('text=Add New Referral Partner')).toBeVisible();

    // 2. Fill form with validation checks
    const partnerName = `Test Partner ${Date.now()}`;
    const partnerPhone = `98765${Math.floor(10000 + Math.random() * 90000)}`;
    const partnerEmail = `testpartner_${Date.now()}@example.com`;
    const partnerCode = `TESTREF_${Math.floor(1000 + Math.random() * 9000)}`;

    await window.getByLabel('Full Name').fill(partnerName);
    await window.waitForTimeout(3000);
    await window.getByLabel('Mobile Phone Number').fill(partnerPhone);
    await window.waitForTimeout(3000);
    await window.getByLabel('Email Address').fill(partnerEmail);
    await window.waitForTimeout(3000);
    
    // Test manual editing of Referral Code
    await window.getByLabel('Referral Code').fill(partnerCode);
    await window.waitForTimeout(3000);

    // Save partner
    await window.getByRole('button', { name: 'Create Partner' }).click();
    await window.waitForTimeout(3000);

    // Verify toast or modal closing
    await expect(window.locator('text=Add New Referral Partner')).not.toBeVisible();
    await window.waitForTimeout(2000);
    
    // 3. Search and Verify listing
    const searchField = window.getByPlaceholder('Search referral partners...');
    await expect(searchField).toBeVisible();
    await searchField.fill(partnerName);
    await window.waitForTimeout(3000);
    
    // Table row should be visible containing the partner name
    await expect(window.locator('table')).toContainText(partnerName);
    await expect(window.locator('table')).toContainText(partnerCode);

    // 4. Edit the partner
    // Find the edit button. Since Polaris uses SVG icons, we'll locate the button with class edit icon or just click the edit button in the table row
    // Locate row containing partner name, then click the edit button within that row
    const row = window.locator('tr').filter({ hasText: partnerName });
    // Look for the edit icon button (second button in the actions column)
    const editBtn = row.locator('button').nth(2);
    await editBtn.click();
    await window.waitForTimeout(3000);

    // Edit modal should open
    await expect(window.locator('text=Edit Referral Details')).toBeVisible();
    const updatedName = `${partnerName} Edited`;
    await window.getByLabel('Full Name').fill(updatedName);
    await window.waitForTimeout(3000);
    await window.getByRole('button', { name: 'Save Changes' }).click();
    await window.waitForTimeout(3000);

    // Verify modal closes and updated name is shown
    await expect(window.locator('text=Edit Referral Details')).not.toBeVisible();
    await window.waitForTimeout(2000);
    await searchField.fill(updatedName);
    await expect(window.locator('table')).toContainText(updatedName);

    // 5. Delete the partner
    // We need to set up a dialog handler before clicking delete since it triggers window.confirm
    window.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('delete this referral');
      await dialog.accept();
    });

    const updatedRow = window.locator('tr').filter({ hasText: updatedName });
    const deleteBtn = updatedRow.locator('button').nth(3);
    await deleteBtn.click();
    await window.waitForTimeout(3000);

    // Wait for the delete toast confirmation and reload
    await expect(window.locator('text=Referral deleted successfully!')).toBeVisible({ timeout: 5000 });
    await window.waitForTimeout(2000);

    // Verify deletion (should show empty table or no matching records for the updated name)
    await expect(window.locator('table')).not.toContainText(updatedName, { timeout: 10000 });
  });
});
