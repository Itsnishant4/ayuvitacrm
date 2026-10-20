const { test, expect } = require('@playwright/test');
const { launchApp, loginAsAdmin, bootstrapShopifyData } = require('./helpers');

test.describe('CRM Customers Directory Flow', () => {
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

  test('Should list, edit, view history, and delete a customer', async () => {
    // 1. Create a customer using API Playground
    await window.getByRole('button', { name: 'Settings & Support' }).click();
    await window.waitForTimeout(3000);
    await window.locator('text=API Playground').click();
    await window.waitForTimeout(3000);

    const customerName = `Test Customer XYZ`;
    await window.getByLabel('Select API method').selectOption('addCustomer');
    await window.waitForTimeout(3000);
    await window.getByLabel('Arguments (JSON)').fill(JSON.stringify({
      name: customerName,
      phone: "9998887776",
      address: "456 Main St, City, State, 123456, Country"
    }, null, 2));
    await window.waitForTimeout(3000);
    await window.getByRole('button', { name: 'Run' }).click();
    await window.waitForTimeout(3000);
    await window.waitForTimeout(400);

    // 2. Navigate to Customers -> Manage Customers
    await window.getByRole('link', { name: 'Manage Customers' }).click();
    await window.waitForTimeout(3000);
    await expect(window.getByRole('heading', { name: 'Customer Ledger' })).toBeVisible();

    // 3. Search and Verify
    const searchField = window.getByPlaceholder('Search by customer name or phone...');
    await searchField.fill(customerName);
    await window.waitForTimeout(3000);
    
    const row = window.locator('tr').filter({ hasText: customerName });
    await expect(row).toBeVisible();
    await expect(row).toContainText('9998887776');

    // 4. Edit customer
    // The edit button is the second button in the actions cell
    await row.locator('button').nth(1).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('text=Edit Customer Details')).toBeVisible();

    // Change phone and save
    await window.getByLabel('Phone Number').fill('1112223334');
    await window.getByRole('button', { name: 'Save Changes' }).click();
    await window.waitForTimeout(3000);

    // Verify modal closed and value is updated in row
    await expect(window.locator('text=Edit Customer Details')).not.toBeVisible();
    await expect(row).toContainText('1112223334');

    // 5. View Order History Modal
    // The history button is the first button in the actions cell
    await row.locator('button').nth(0).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('text=Order History: Test Customer XYZ')).toBeVisible();
    
    // Close the history modal
    await window.keyboard.press('Escape');
    await expect(window.locator('text=Order History: Test Customer XYZ')).not.toBeVisible();

    // 6. Delete Customer
    // Set confirm handler
    window.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('delete customer');
      await dialog.accept();
    });

    // Click delete (third button in actions cell)
    await row.locator('button').nth(2).click();
    await window.waitForTimeout(3000);

    // Verify deletion
    await expect(row).not.toBeVisible();
  });
});
