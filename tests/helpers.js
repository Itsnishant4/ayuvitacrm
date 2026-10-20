const { _electron: electron, expect } = require('@playwright/test');
const path = require('path');

function getShopifyTestCredentials(overrides = {}) {
  const domain = overrides.domain || process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = overrides.clientId || process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = overrides.clientSecret || process.env.SHOPIFY_CLIENT_SECRET;
  const adminToken = overrides.adminToken || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!domain || !clientId || !clientSecret) {
    throw new Error('Missing Shopify test credentials. Set SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET.');
  }

  return { domain, clientId, clientSecret, adminToken };
}

// Clean database using window.api calls
async function cleanTestDb(window) {
  console.log('Cleaning test database via window APIs...');
  try {
    await window.evaluate(async () => {
      // 1. Delete matching test orders
      const ordersRes = await window.api.getOrders();
      if (ordersRes.success && Array.isArray(ordersRes.orders)) {
        for (const o of ordersRes.orders) {
          if (o.bill_to_name && o.bill_to_name.startsWith('Test')) {
            await window.api.deleteOrder(o.id);
          }
        }
      }

      // 2. Delete matching test products
      const productsRes = await window.api.getProducts();
      if (productsRes.success && Array.isArray(productsRes.products)) {
        for (const p of productsRes.products) {
          if (p.item_name && p.item_name.startsWith('Test')) {
            await window.api.deleteProduct(p.id);
          }
        }
      }

      // 3. Delete matching test referrals
      const partnersRes = await window.api.supabaseGetPartners({ role: 'admin' });
      if (partnersRes.success && Array.isArray(partnersRes.partners)) {
        for (const p of partnersRes.partners) {
          if (p.name && p.name.startsWith('Test')) {
            await window.api.supabaseDeletePartner(p.id);
          }
        }
      }

      // 4. Delete matching test customers
      const customersRes = await window.api.getCustomers();
      if (customersRes.success && Array.isArray(customersRes.customers)) {
        for (const c of customersRes.customers) {
          if (c.name && c.name.startsWith('Test')) {
            await window.api.deleteCustomer(c.id);
          }
        }
      }
    });
    console.log('Test database cleaned successfully.');
  } catch (err) {
    console.error('Failed to clean test DB in window:', err);
  }
}

async function bootstrapShopifyData(window, overrides = {}) {
  const { domain, clientId, clientSecret, adminToken } = getShopifyTestCredentials(overrides);

  await cleanTestDb(window);

  await window.getByRole('button', { name: 'Settings & Support' }).click();
  await window.locator('text=Developer Console').click();
  await expect(window.locator('header').first()).toContainText('Developer Console');

  const domainInput = window.getByLabel('Store myshopify Domain');
  const clientIdInput = window.getByLabel('Client ID (for OAuth / Auto-refresh)');
  const clientSecretInput = window.getByLabel('Client Secret (for OAuth / Auto-refresh)');
  const tokenInput = window.getByLabel('Admin Access Token (shpat_...)');

  await domainInput.fill(domain);
  await clientIdInput.fill(clientId);
  await clientSecretInput.fill(clientSecret);

  if (adminToken) {
    await tokenInput.fill(adminToken);
  } else {
    throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN. The app requires a real Admin API token to sync Shopify data.');
  }

  await window.getByRole('button', { name: 'Test Connection' }).click();
  await window.locator('text=Connection successful!').waitFor({ state: 'visible', timeout: 120000 });

  await window.getByRole('button', { name: 'Save Settings' }).click();
  await window.locator('text=Credentials saved successfully to local database.').waitFor({ state: 'visible', timeout: 120000 });

  await window.getByRole('button', { name: 'Sync All Data' }).click();
  await expect(window.locator('text=Sync complete!')).toBeVisible({ timeout: 120000 });
}

// Launch app helper
async function launchApp() {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      CRM_TESTING: 'true',
    }
  });

  // Capture Electron main process logs
  const appProcess = electronApp.process();
  appProcess.stdout.on('data', (data) => {
    console.log(`[Electron Main STDOUT] ${data.toString().trim()}`);
  });
  appProcess.stderr.on('data', (data) => {
    console.error(`[Electron Main STDERR] ${data.toString().trim()}`);
  });

  // Find the main window (the one with window.api exposed via preload.js)
  let window;
  const startTime = Date.now();
  while (Date.now() - startTime < 15000) {
    for (const w of electronApp.windows()) {
      const isMain = await w.evaluate(() => typeof window.api !== 'undefined').catch(() => false);
      if (isMain) {
        window = w;
        break;
      }
    }
    if (window) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!window) {
    throw new Error('Timeout waiting for main window with window.api');
  }
  
  // Wait for the window to load
  await window.waitForLoadState('load');

  // Clear localStorage to ensure a clean session for each test
  const cleared = await window.evaluate(() => {
    const hasToken = !!localStorage.getItem('auth_token');
    localStorage.clear();
    return hasToken;
  }).catch(() => false);

  if (cleared) {
    await window.reload();
    await window.waitForLoadState('load');
  }
  
  return { electronApp, window };
}

// Log in as test admin helper
async function loginAsAdmin(window, username = 'test_admin_user', password = 'test_admin_password') {
  // If we are already logged in, do nothing
  const header = window.locator('header');
  const isDashboard = await header.isVisible() && (await header.textContent()).includes('Dashboard');
  if (isDashboard) return;

  // Make sure we are on sign in page
  const signUpLink = window.getByRole('button', { name: 'Sign Up' });
  const isSignUpVisible = await signUpLink.isVisible();
  if (!isSignUpVisible) {
    const signInBtn = window.getByRole('button', { name: 'Sign In' }).first();
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
    }
  }

  // Fill in credentials
  await window.getByLabel('Username').fill(username);
  await window.getByLabel('Password').fill(password);
  await window.getByRole('button', { name: 'Sign In', exact: true }).click();

  // If there's an error (e.g. user not found), register the user first
  try {
    const errorBanner = window.locator('text=Authentication Error');
    await window.waitForTimeout(500); // short wait for UI to register response
    if (await errorBanner.isVisible()) {
      console.log('Admin user does not exist. Registering user:', username);
      await window.getByRole('button', { name: 'Sign Up' }).click();
      await window.getByLabel('Username').fill(username);
      await window.getByLabel('Password').fill(password);
      await window.getByRole('button', { name: 'Register Operator' }).click();
      
      // Now log in
      await window.getByLabel('Username').fill(username);
      await window.getByLabel('Password').fill(password);
      await window.getByRole('button', { name: 'Sign In', exact: true }).click();
    }
  } catch (err) {
    // ignore
  }

  // Wait for the dashboard to be active
  await window.waitForSelector('header');
}

// Seed a test order directly inside Electron's Node runtime
async function seedTestOrderData(window, productName, invoiceNumber) {
  console.log(`Seeding test order ${invoiceNumber}...`);
  return await window.evaluate(async ({ productName, invoiceNumber }) => {
    try {
      // 1. Add partner
      const partnerRes = await window.api.addPartner({
        name: "Test Order Partner",
        email: "orderpartner@example.com",
        phone: "1234567890",
        referral_code: "ORDREF100"
      });
      const partnerId = partnerRes.id;

      // 2. Add product
      const productRes = await window.api.addProduct({
        item_name: productName,
        hsn_sac: "HSN-ORD",
        batch_id: "BATCH-ORD1",
        mfg_date: "2026-05-01",
        mrp: 100,
        size: "100ml",
        stock: 10,
        unit: "PCS",
        gst_rate: 18
      });
      const productId = productRes.id;

      // 3. Create order
      const orderRes = await window.api.createOrder({
        referral_id: partnerId,
        invoice_number: invoiceNumber,
        invoice_date: "2026-05-25",
        bill_to_name: "Test Order Customer",
        bill_to_address: "123 Street, City, State, 123456, Country",
        bill_to_phone: "1234567890",
        shipping_charges: 0,
        total_amount: 472,
        received_amount: 472,
        final_amount: 0,
        apply_gst: true,
        email: "customer@example.com",
        shipping_name: "Test Order Customer",
        shipping_address: "123 Street, City, State, 123456, Country",
        shipping_phone: "1234567890",
        tags: "test-tag",
        shipping_carrier: "DHL",
        shopify_financial_status: "paid",
        shopify_fulfillment_status: "unfulfilled",
        shopify_order_note: "This is a test order note",
        delivery_status: "pending"
      }, [
        {
          product_id: productId,
          item_name: productName,
          quantity_string: "4",
          unit: "PCS",
          size: "100ml",
          batch_id: "BATCH-ORD1",
          mfg_date: "2026-05-01",
          hsn_sac: "HSN-ORD",
          price_per_item: 100,
          mrp: 100,
          gst_rate: 18,
          total: 472
        }
      ]);

      return { success: orderRes.success, error: orderRes.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, { productName, invoiceNumber });
}

module.exports = {
  cleanTestDb,
  bootstrapShopifyData,
  launchApp,
  loginAsAdmin,
  seedTestOrderData
};
