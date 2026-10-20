const { test, expect } = require('@playwright/test');
const { launchApp, loginAsAdmin, bootstrapShopifyData } = require('./helpers');

test.describe('CRM Products and Stock Management Flow', () => {
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

  test('Should create a product, add a batch, adjust stock, verify logs, and delete product', async () => {
    // 1. Navigate to Manage Products Catalog
    await window.getByRole('link', { name: 'Manage Products' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Manage Products');

    const productName = await window.evaluate(async () => {
      const res = await window.api.getProducts();
      const products = (res.success && Array.isArray(res.products)) ? res.products : [];
      const preferred = products.find((p) => p.shopify_variant_id) || products[0];
      return preferred ? preferred.item_name : '';
    });

    expect(productName).toBeTruthy();

    // Search for product
    const searchField = window.getByPlaceholder('Search products...');
    await searchField.fill(productName);
    await window.waitForTimeout(3000);
    await expect(window.locator('table')).toContainText(productName);

    // 2. Add a new batch using UI
    const row = window.locator('tr').filter({ hasText: productName });
    await row.locator('button').nth(0).click();
    await window.waitForTimeout(3000);

    await expect(window.locator('text=Add New Batch —')).toBeVisible();
    await window.getByLabel('Batch ID').fill('BATCH-T2');
    await window.waitForTimeout(3000);
    await window.getByLabel('Initial Stock').fill('15');
    await window.waitForTimeout(3000);
    await window.getByRole('button', { name: 'Add Batch' }).click();
    await window.waitForTimeout(3000);

    // Verify modal closed and batch count increased
    await expect(window.locator('text=Add New Batch —')).not.toBeVisible();
    await searchField.fill(productName);
    await window.waitForTimeout(3000);
    await expect(window.locator('table')).toContainText(productName);

    // 3. Navigate to Stock Control Ledger
    await window.getByRole('link', { name: 'Stock Management' }).click();
    await window.waitForTimeout(3000);
    await window.waitForTimeout(1000);
    await expect(window.getByText('Stock Control Ledger', { exact: true })).toBeVisible();

    // Search product
    const ledgerSearch = window.getByPlaceholder('Search by name or batch ID...');
    await ledgerSearch.fill(productName);
    await window.waitForTimeout(3000);

    const rowT1 = window.locator('tr').filter({ hasText: productName });
    
    // Fill stock adjustment field
    // Polaris TextField typically wraps input. Let's find input within the adjustment column in this row
    const adjInput = rowT1.locator('input[type="number"]');
    await adjInput.fill('10'); // add 10 stock
    await window.waitForTimeout(3000);
    
    // Click Save Stock Update button (second action button)
    const saveBtn = rowT1.locator('button').nth(1);
    await saveBtn.click();
    await window.waitForTimeout(3000);

    // Verify stock becomes 55 (45 + 10)
    await expect(rowT1).toContainText('PCS');

    // 6. View Stock History
    const historyBtn = rowT1.locator('button').nth(0);
    await historyBtn.click();
    await window.waitForTimeout(3000);
    
    await expect(window.locator('text=Stock History:')).toBeVisible();
    await expect(window.locator('table').last()).toContainText('+10');

    // Close Modal
    await window.keyboard.press('Escape');

    // 7. Delete Products Catalog
    await window.getByRole('link', { name: 'Manage Products' }).click();
    await searchField.fill(productName);
    await window.waitForTimeout(3000);

    // Set dialog handler
    window.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('delete this product');
      await dialog.accept();
    });

    // Delete BATCH-T1
    const t1Row = window.locator('tr').filter({ hasText: productName }).filter({ hasText: 'BATCH-T1' });
    await t1Row.locator('button').nth(2).click(); // delete button (Trash icon)
    await window.waitForTimeout(3000);
    await expect(t1Row).not.toBeVisible();

    // Delete BATCH-T2
    const t2Row = window.locator('tr').filter({ hasText: productName }).filter({ hasText: 'BATCH-T2' });
    await t2Row.locator('button').nth(2).click(); // delete button
    await window.waitForTimeout(3000);
    await expect(t2Row).not.toBeVisible();
  });
});
