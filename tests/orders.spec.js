const { test, expect } = require('@playwright/test');
const { launchApp, loginAsAdmin, bootstrapShopifyData } = require('./helpers');

test.describe('CRM Orders Edit and Inventory Integration Flow', () => {
  let electronApp;
  let window;
  let testProductName;
  let invNumber;

  test.beforeEach(async () => {
    const app = await launchApp();
    electronApp = app.electronApp;
    window = app.window;

    await loginAsAdmin(window);
    await bootstrapShopifyData(window);

    const seeded = await window.evaluate(async () => {
      const ordersRes = await window.api.getOrders();
      const orders = (ordersRes.success && Array.isArray(ordersRes.orders)) ? ordersRes.orders : [];
      const order = orders.find((o) => o.sync_source === 'shopify') || orders[0];
      if (!order) return null;

      const itemsRes = await window.api.getOrderItems(order.id);
      const items = (itemsRes.success && Array.isArray(itemsRes.items)) ? itemsRes.items : [];
      return {
        invoiceNumber: order.invoice_number,
        productName: items[0]?.item_name || ''
      };
    });

    invNumber = seeded?.invoiceNumber || '';
    testProductName = seeded?.productName || '';
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Should search an order, edit it, verify stock adjustments, and delete to restore stock', async () => {
    expect(invNumber).toBeTruthy();
    expect(testProductName).toBeTruthy();

    // 1. Navigate to Manage Orders
    await window.getByRole('link', { name: 'Manage Orders' }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('header')).toContainText('Manage Orders');

    // 2. Search for the seeded order
    const orderSearch = window.getByPlaceholder('Search order ID, client name, or referral code...');
    await orderSearch.fill(invNumber);
    await window.waitForTimeout(3000);

    // Verify row is visible in table
    const orderRow = window.locator('tr').filter({ hasText: invNumber });
    await expect(orderRow).toBeVisible();
    await expect(orderRow).toContainText('Test Order Customer');

    // 3. Click Edit Order (fourth button in actions column)
    await orderRow.locator('button').nth(3).click();
    await window.waitForTimeout(3000);

    // Verify view has navigated to Edit Order
    await expect(window.locator('header')).toContainText('Edit Order');

    // 4. Verify existing details and modify quantity
    await window.waitForTimeout(1000);
    const editProductRow = window.locator('input').filter({ hasValue: testProductName }).locator('xpath=./ancestor::tr');
    await expect(editProductRow).toBeVisible();

    const qtyInput = editProductRow.locator('input').last();
    // Validate current quantity is 4
    await expect(qtyInput).toHaveValue('4');

    // Change quantity from 4 to 2
    await qtyInput.fill('2');
    await window.waitForTimeout(3000);

    // Calculate billing update: subtotal = 200. GST (18%) = 36. Total = 236.
    // Fill Money Received with 236
    await window.locator('label:has-text("Money Received") + input').fill('236');
    await window.waitForTimeout(3000);

    // Click "Update Invoice"
    await window.getByRole('button', { name: 'Update Invoice' }).click();
    await window.waitForTimeout(3000);
    await window.waitForTimeout(1000);

    // Verify success screen
    await expect(window.getByRole('heading', { name: 'Order Updated Successfully' })).toBeVisible();
    
    // Go back to ledger
    await window.getByRole('button', { name: 'Done & View Ledger' }).click();
    await window.waitForTimeout(3000);
    await window.waitForTimeout(1000);
    await expect(window.locator('header')).toContainText('Manage Orders');

    // 5. Verify stock is adjusted (original stock was 10. we changed order qty from 4 to 2, so stock should be 8)
    await window.getByRole('link', { name: 'Manage Products' }).click();
    await window.waitForTimeout(3000);
    const prodSearch = window.getByPlaceholder('Search products...');
    await prodSearch.fill(testProductName);
    await window.waitForTimeout(3000);
    await expect(window.locator('table')).toContainText('8 PCS');

    // 6. Delete order and verify stock is fully restored to 10
    await window.getByRole('link', { name: 'Manage Orders' }).click();
    await window.waitForTimeout(3000);
    await orderSearch.fill(invNumber);
    await window.waitForTimeout(3000);

    // Set dialog handler for deletion confirm
    window.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('delete this order');
      await dialog.accept();
    });

    const editOrderRow = window.locator('tr').filter({ hasText: invNumber });
    // Click Delete (sixth button in actions column)
    await editOrderRow.locator('button').nth(5).click();
    await window.waitForTimeout(3000);

    // Verify row is deleted
    await expect(editOrderRow).not.toBeVisible();
    await window.waitForTimeout(3000);

    // Verify stock is restored to 10
    await window.getByRole('button', { name: 'Manage Products' }).click();
    await window.waitForTimeout(3000);
    await prodSearch.fill(testProductName);
    await window.waitForTimeout(3000);
    await expect(window.locator('table')).toContainText('10 PCS');
  });
});
