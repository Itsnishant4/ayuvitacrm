const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

app.name = 'ayuvitaCRM';
const appDataPath = app.getPath('appData');
const userDataPath = path.join(appDataPath, 'ayuvitaCRM');
app.setPath('userData', userDataPath);

async function runRepair() {
  console.log('--- STARTING ADDRESS LINE 2 REPAIR SCRIPT ---');
  const dbPath = path.join(userDataPath, 'referral_crm.db');
  console.log('Database Path:', dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found!');
    app.quit();
    return;
  }

  const db = new Database(dbPath);
  
  // 1. Fetch Shopify credentials
  const domainRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_domain'").get();
  const tokenRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_token'").get();

  if (!domainRow || !tokenRow || !domainRow.value || !tokenRow.value) {
    console.error('Shopify domain or token credentials not found in settings! Cannot fetch from Shopify.');
    db.close();
    app.quit();
    return;
  }

  const domain = domainRow.value.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token = tokenRow.value;
  console.log(`Using Shopify domain: ${domain}`);

  // 2. Fetch all Shopify orders in the local database
  const orders = db.prepare("SELECT id, invoice_number, shopify_order_id FROM orders WHERE sync_source = 'shopify' AND shopify_order_id IS NOT NULL").all();
  console.log(`Found ${orders.length} Shopify orders in database to review.`);

  let updatedCount = 0;

  for (const order of orders) {
    const shopifyOrderId = order.shopify_order_id;
    console.log(`Processing Order ${order.invoice_number} (ID: ${shopifyOrderId})...`);
    
    try {
      // Fetch details from Shopify REST API
      const url = `https://${domain}/admin/api/2024-04/orders/${shopifyOrderId}.json`;
      const res = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (!res.data || !res.data.order) {
        console.warn(`Order ${order.invoice_number} not found on Shopify.`);
        continue;
      }

      const o = res.data.order;
      const billingAddrObj = o.billing_address || (o.customer && o.customer.default_address);
      const shippingAddrObj = o.shipping_address || billingAddrObj;

      const cleanAddress1 = (addrObj) => {
        if (!addrObj || !addrObj.address1) return '';
        return addrObj.address1.replace(/,\s*$/, '').trim();
      };

      const billingAddress1Clean = cleanAddress1(billingAddrObj);
      const billToAddress = billingAddrObj
        ? [billingAddress1Clean, billingAddrObj.city, billingAddrObj.province, billingAddrObj.zip, billingAddrObj.country].filter(Boolean).join(', ')
        : '';
      const billingAddress2 = billingAddrObj?.address2 || '';

      const shippingAddress1Clean = cleanAddress1(shippingAddrObj);
      const shippingAddress = shippingAddrObj
        ? [shippingAddress1Clean, shippingAddrObj.city, shippingAddrObj.province, shippingAddrObj.zip, shippingAddrObj.country].filter(Boolean).join(', ')
        : '';
      const shippingAddress2 = shippingAddrObj?.address2 || '';

      // Update in database
      db.prepare(`
        UPDATE orders SET
          bill_to_address = ?,
          billing_address2 = ?,
          shipping_address = ?,
          shipping_address2 = ?
        WHERE id = ?
      `).run(billToAddress, billingAddress2, shippingAddress, shippingAddress2, order.id);

      console.log(`Updated Order ${order.invoice_number}:`);
      console.log(`  Billing Address: "${billToAddress}"`);
      console.log(`  Billing Address 2: "${billingAddress2}"`);
      console.log(`  Shipping Address: "${shippingAddress}"`);
      console.log(`  Shipping Address 2: "${shippingAddress2}"`);
      updatedCount++;

    } catch (err) {
      console.error(`Error processing Order ${order.invoice_number}:`, err.message);
    }
  }

  console.log(`--- REPAIR COMPLETED. Updated ${updatedCount} orders. ---`);
  db.close();
  app.quit();
}

app.whenReady().then(() => {
  runRepair().catch(err => {
    console.error('Fatal error during repair execution:', err);
    app.quit();
  });
});
