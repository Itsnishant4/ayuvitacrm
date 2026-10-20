const axios = require('axios');
const { getDb } = require('./db');

// Pick a single Admin API version and use it consistently
const API_VERSION = '2026-04';

// Helper to get headers
function getShopifyHeaders(token) {
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

async function generateShopifyToken(domain, clientId, clientSecret) {
  try {
    const formattedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${formattedDomain}/admin/oauth/access_token`;
    const res = await axios.post(url, {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ElectronCRM/1.0'
      },
      timeout: 10000
    });

    if (res.data && res.data.access_token) {
      return {
        success: true,
        accessToken: res.data.access_token,
        expiresIn: res.data.expires_in,
        scope: res.data.scope
      };
    }
    return { success: false, error: 'Invalid response from Shopify token endpoint' };
  } catch (err) {
    return {
      success: false,
      error: err.response && err.response.data ? JSON.stringify(err.response.data) : err.message
    };
  }
}

// Helper to check token expiration and auto-refresh using client credentials if possible
// Helper to read the configured Shopify Admin API token.
async function getValidToken() {
  const db = getDb();
  if (!db) {
    throw new Error('Database is not initialized.');
  }

  const domainRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_domain'").get();
  const tokenRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_token'").get();
  const clientIdRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_client_id'").get();
  const clientSecretRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_client_secret'").get();
  const expiresAtRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_token_expires_at'").get();

  const domain = domainRow ? domainRow.value : (process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_STORE_URL || '');
  let token = tokenRow ? tokenRow.value : (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '');
  const clientId = clientIdRow ? clientIdRow.value : (process.env.SHOPIFY_CLIENT_ID || '');
  const clientSecret = clientSecretRow ? clientSecretRow.value : (process.env.SHOPIFY_CLIENT_SECRET || '');
  const expiresAt = expiresAtRow ? expiresAtRow.value : '';

  if (!domain) {
    throw new Error('Shopify store domain is not configured.');
  }

   if (clientId && clientSecret) {
    const isExpired = !token || !expiresAt || Date.now() >= (parseInt(expiresAt, 10) - 5 * 60 * 1000);
    if (isExpired) {
      console.log('Shopify token is expired or close to expiration. Regenerating token...');
      const genRes = await generateShopifyToken(domain, clientId, clientSecret);
      if (genRes.success) {
        token = genRes.accessToken;
        const newExpiry = Date.now() + genRes.expiresIn * 1000;
        db.prepare("INSERT OR REPLACE INTO shopify_sync_metadata (key, value, updated_at) VALUES ('shopify_token', ?, CURRENT_TIMESTAMP)").run(token);
        db.prepare("INSERT OR REPLACE INTO shopify_sync_metadata (key, value, updated_at) VALUES ('shopify_token_expires_at', ?, CURRENT_TIMESTAMP)").run(newExpiry.toString());
        console.log('Shopify token regenerated and saved successfully.');
      } else {
        console.error('Failed to regenerate Shopify token:', genRes.error);
        if (!token) {
          throw new Error(`Failed to generate Shopify access token: ${genRes.error}`);
        }
      }
    }
  }


  return { domain, token };
}

// 1. Test connection helper
async function testShopifyConnection(domain, token, clientId = '', clientSecret = '') {
  try {
     let testToken = token;
    if (clientId && clientSecret) {
      const genRes = await generateShopifyToken(domain, clientId, clientSecret);
      if (genRes.success) {
        testToken = genRes.accessToken;
      } else {
        return { success: false, error: `Token generation failed: ${genRes.error}` };
      }
    }
   

    const formattedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${formattedDomain}/admin/api/${API_VERSION}/shop.json`;
    const res = await axios.get(url, { headers: getShopifyHeaders(token), timeout: 10000 });
    if (res.data && res.data.shop) {
      return { success: true, shopName: res.data.shop.name, token:testToken };
    }
    return { success: false, error: 'Invalid response from Shopify' };
  } catch (err) {
    return {
      success: false,
      error: err.response && err.response.data ? JSON.stringify(err.response.data) : err.message
    };
  }
}

// 2. Direct REST Executor
async function runShopifyREST(domain, token, endpoint, method = 'GET', data = null) {
  try {
    let activeDomain = domain;
    let activeToken = token;
    try {
      const credentials = await getValidToken();
      activeDomain = credentials.domain;
      activeToken = credentials.token;
    } catch (e) {
      // fallback to arguments
    }

    const formattedDomain = activeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `https://${formattedDomain}/admin/api/${API_VERSION}${cleanEndpoint}`;

    const config = {
      method,
      url,
      headers: getShopifyHeaders(activeToken),
      timeout: 15000
    };
    if (data && (method === 'POST' || method === 'PUT')) {
      config.data = data;
    }

    const res = await axios(config);
    return { success: true, data: res.data, headers: res.headers };
  } catch (err) {
    return {
      success: false,
      error: err.response && err.response.data ? err.response.data : err.message
    };
  }
}

// 3. Direct GraphQL Executor
async function runShopifyGraphQL(domain, token, query, variables = null) {
  try {
    let activeDomain = domain;
    let activeToken = token;
    try {
      const credentials = await getValidToken();
      activeDomain = credentials.domain;
      activeToken = credentials.token;
    } catch (e) {
      // fallback to arguments
    }

    const formattedDomain = activeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${formattedDomain}/admin/api/${API_VERSION}/graphql.json`;

    const res = await axios.post(url, { query, variables }, {
      headers: getShopifyHeaders(activeToken),
      timeout: 15000
    });

    if (res.data.errors) {
      return { success: false, error: res.data.errors };
    }
    return { success: true, data: res.data.data };
  } catch (err) {
    return {
      success: false,
      error: err.response && err.response.data ? err.response.data : err.message
    };
  }
}

// 4. Sync Inventory helper (maps variants, pulls stock changes)
async function syncInventory(domain, token, db, logger) {
  logger('Fetching Shopify variant stock catalog...');

  let hasNextPage = true;
  let cursor = null;
  let matchCount = 0;
  let updateCount = 0;

  const query = `
    query GetVariants($cursor: String) {
      productVariants(first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            sku
            title
            price
            product {
              id
              title
            }
            inventoryItem {
              id
              inventoryLevels(first: 2) {
                edges {
                  node {
                    quantities(names: ["available"]) {
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const res = await runShopifyGraphQL(domain, token, query, { cursor });
    if (!res.success) {
      throw new Error(`Shopify GraphQL inventory fetch failed: ${JSON.stringify(res.error)}`);
    }

    const pageInfo = res.data?.productVariants?.pageInfo;
    hasNextPage = pageInfo?.hasNextPage || false;
    cursor = pageInfo?.endCursor || null;

    const variants = res.data?.productVariants?.edges || [];
    for (const variantEdge of variants) {
      const vNode = variantEdge.node;
      const variantId = vNode.id;
      const sku = vNode.sku;
      const shopifyProductId = vNode.product?.id;
      const title = vNode.product?.title;
      const inventoryItemId = vNode.inventoryItem?.id;

      // Extract available quantities (summed across all locations/edges)
      const levels = vNode.inventoryItem?.inventoryLevels?.edges || [];
      let shopifyQty = 0;
      for (const levelEdge of levels) {
        const qty = levelEdge.node.quantities?.[0]?.quantity || 0;
        shopifyQty += qty;
      }

      // Fallback batch_id if SKU is empty
      const localBatchId = sku || `SHPF-${variantId.split('/').pop()}`;

      const variantTitle = vNode.title || '';
      const itemName = variantTitle && variantTitle !== 'Default Title'
        ? `${title} - ${variantTitle}`
        : title;

      // Try matching by shopify_variant_id first, then SKU (batch_id), then item_name
      let crmProd = db.prepare('SELECT * FROM products WHERE shopify_variant_id = ?').get(variantId);
      if (!crmProd && sku) {
        crmProd = db.prepare('SELECT * FROM products WHERE batch_id = ?').get(sku);
      }
      if (!crmProd) {
        crmProd = db.prepare('SELECT * FROM products WHERE item_name = ?').get(itemName);
      }

      if (crmProd) {
        matchCount++;

        // Link Shopify IDs to local product row
        db.prepare(`
          UPDATE products SET
            shopify_product_id = ?,
            shopify_variant_id = ?,
            shopify_inventory_item_id = ?,
            last_shopify_sync = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(shopifyProductId, variantId, inventoryItemId, crmProd.id);

        // Compare stock and update if different
        if (crmProd.stock !== shopifyQty) {
          updateCount++;
          const changeAmount = shopifyQty - crmProd.stock;

          db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(shopifyQty, crmProd.id);
          db.prepare(`
            INSERT INTO stock_history (product_id, change_amount, reason, created_at)
            VALUES (?, ?, 'Shopify Sync: Stock Match update', CURRENT_TIMESTAMP)
          `).run(crmProd.id, changeAmount);

          logger(`Mapped stock for product "${crmProd.item_name}" [SKU: ${sku || 'None'}] to Shopify level: ${shopifyQty}`);
        }
      } else {
        // Create new product locally if not found
        const mrpVal = parseFloat(vNode.price) || 0.0;

        const info = db.prepare(`
          INSERT INTO products (
            item_name, batch_id, mrp, stock, unit, gst_rate, 
            shopify_product_id, shopify_variant_id, shopify_inventory_item_id, last_shopify_sync
          ) VALUES (?, ?, ?, ?, 'PCS', 0, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(itemName, localBatchId, mrpVal, shopifyQty, shopifyProductId, variantId, inventoryItemId);

        const newProductId = info.lastInsertRowid;

        // Log stock history for initial import
        db.prepare(`
          INSERT INTO stock_history (product_id, change_amount, reason, created_at)
          VALUES (?, ?, 'Shopify Sync: Initial Import', CURRENT_TIMESTAMP)
        `).run(newProductId, shopifyQty);

        matchCount++;
        updateCount++;
        logger(`Imported new Shopify product "${itemName}" [SKU: ${sku || 'None'}] with stock: ${shopifyQty}`);
      }
    }
  }

  logger(`Inventory sync finished. Mapped/Imported ${matchCount} products, updated ${updateCount} stock values.`);
  return updateCount;
}

// 5. Sync Customers helper
async function syncCustomers(domain, token, db, sinceTimestamp, logger) {
  logger('Fetching Shopify customer updates...');
  let url = `/customers.json?limit=250`;
  if (sinceTimestamp) {
    url += `&updated_at_min=${encodeURIComponent(sinceTimestamp)}`;
  }

  const res = await runShopifyREST(domain, token, url);
  if (!res.success) {
    throw new Error(`Shopify REST customer fetch failed: ${JSON.stringify(res.error)}`);
  }

  const customers = res.data?.customers || [];
  let syncCount = 0;

  for (const c of customers) {
    const shopifyId = c.id.toString();
    const email = c.email || '';
    const phone = c.phone || '';
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Shopify Customer';
    const address = c.default_address
      ? `${c.default_address.address1 || ''}, ${c.default_address.city || ''}, ${c.default_address.province || ''}`
      : '';

    // Check if customer exists locally
    let localCust = db.prepare('SELECT id FROM customers WHERE shopify_customer_id = ?').get(shopifyId);
    if (!localCust && email) {
      localCust = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
    }
    if (!localCust && phone) {
      localCust = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
    }

    // Resolve name conflicts and handle merging
    let finalName = name;
    let nameConflict = db.prepare('SELECT id, shopify_customer_id FROM customers WHERE name = ?').get(finalName);
    if (nameConflict && (!localCust || localCust.id !== nameConflict.id)) {
      if (!nameConflict.shopify_customer_id) {
        // Merge Shopify profile with existing name-matched local profile
        localCust = nameConflict;
      } else {
        // Differentiate name to satisfy UNIQUE database constraint
        const suffix = email ? ` (${email})` : ` (#${shopifyId.slice(-4)})`;
        finalName = `${name}${suffix}`;
      }
    }

    if (localCust) {
      // Update customer email, phone, name, and shopify_customer_id
      db.prepare(`
        UPDATE customers SET
          name = ?,
          email = ?,
          phone = ?,
          address = ?,
          shopify_customer_id = ?,
          last_shopify_sync = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalName, email, phone, address, shopifyId, localCust.id);
    } else {
      // Insert customer
      db.prepare(`
        INSERT INTO customers (name, address, phone, email, shopify_customer_id, last_shopify_sync)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(finalName, address, phone, email, shopifyId);
    }
    syncCount++;
  }

  logger(`Customer sync finished. Downloaded/updated ${syncCount} customer profiles.`);
  return syncCount;
}

// 6. Sync Orders helper
async function syncOrders(domain, token, db, sinceTimestamp, logger) {
  // Self-healing: Repair any old Shopify orders that lack address or discount metadata.
  try {
    const unrepaired = db.prepare(`
      SELECT id, invoice_number, shopify_order_id 
      FROM orders 
      WHERE sync_source = 'shopify' 
        AND shopify_order_id IS NOT NULL 
        AND (
          billing_address2 IS NULL OR billing_address2 = ''
          OR shopify_discount_applications IS NULL OR shopify_discount_applications = ''
        )
    `).all();

    if (unrepaired.length > 0) {
      logger(`Self-healing: Found ${unrepaired.length} unrepaired Shopify orders. Fetching address and discount details...`);
      for (const order of unrepaired) {
        try {
          const orderRes = await runShopifyREST(domain, token, `/orders/${order.shopify_order_id}.json`);
          if (orderRes.success && orderRes.data?.order) {
            const o = orderRes.data.order;
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
            const shopifyDiscountCodes = JSON.stringify(o.discount_codes || []);
            const shopifyDiscountApplications = JSON.stringify(o.discount_applications || []);
            const shopifyShippingDiscount = (o.shipping_lines || []).reduce((sum, line) => {
              return sum + (line.discount_allocations || []).reduce((lineSum, alloc) => {
                return lineSum + parseFloat(alloc.amount || alloc.amount_set?.shop_money?.amount || 0);
              }, 0);
            }, 0);
            const shopifyTotalDiscounts = parseFloat(
              o.current_total_discounts ||
              o.current_total_discounts_set?.shop_money?.amount ||
              o.total_discounts ||
              o.total_discounts_set?.shop_money?.amount ||
              0
            );
            const shopifyLineItemDiscount = Math.max(0, shopifyTotalDiscounts - shopifyShippingDiscount);

            db.prepare(`
              UPDATE orders SET
                bill_to_address = ?,
                billing_address2 = ?,
                shipping_address = ?,
                shipping_address2 = ?,
                shopify_discount_codes = ?,
                shopify_discount_applications = ?,
                shopify_total_discounts = ?,
                shopify_line_item_discount = ?,
                shopify_shipping_discount = ?
              WHERE id = ?
            `).run(
              billToAddress,
              billingAddress2,
              shippingAddress,
              shippingAddress2,
              shopifyDiscountCodes,
              shopifyDiscountApplications,
              shopifyTotalDiscounts,
              shopifyLineItemDiscount,
              shopifyShippingDiscount,
              order.id
            );
            logger(`Self-healed address and discount details for Order ${order.invoice_number}`);
          }
        } catch (err) {
          logger(`Self-healing failed for Order ${order.invoice_number}: ${err.message}`, 'warning');
        }
      }
    }
  } catch (e) {
    logger(`Self-healing pre-check failed: ${e.message}`, 'warning');
  }

  // Step 1: Collect ALL Shopify order IDs via pagination (lightweight, for cleanup)
  logger('Fetching all Shopify order IDs for cleanup...');
  const allShopifyOrderIds = [];
  let idsUrl = `/orders.json?status=any&limit=250&fields=id`;
  while (idsUrl) {
    const idsRes = await runShopifyREST(domain, token, idsUrl);
    if (!idsRes.success) {
      throw new Error(`Shopify REST order ID fetch failed: ${JSON.stringify(idsRes.error)}`);
    }
    const idsOrders = idsRes.data?.orders || [];
    for (const o of idsOrders) {
      allShopifyOrderIds.push(o.id.toString());
    }
    const linkHeader = idsRes.headers?.link || idsRes.headers?.Link || '';
    const nextMatch = linkHeader.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (nextMatch) {
      try {
        const u = new URL(nextMatch[1]);
        idsUrl = u.pathname + u.search;
      } catch {
        idsUrl = null;
      }
    } else {
      idsUrl = null;
    }
  }

  // Step 2: Sync order data (latest 250 with timestamp filter)
  logger('Fetching Shopify order updates...');
  let url = `/orders.json?status=any&limit=250`;
  if (sinceTimestamp) {
    url += `&updated_at_min=${encodeURIComponent(sinceTimestamp)}`;
  }

  const res = await runShopifyREST(domain, token, url);
  if (!res.success) {
    throw new Error(`Shopify REST order fetch failed: ${JSON.stringify(res.error)}`);
  }

  const orders = res.data?.orders || [];
  let syncCount = 0;

  for (const o of orders) {
    const shopifyOrderId = o.id.toString();
    const orderNum = o.order_number.toString();
    const note = o.note || '';

    // Parse referral code from Note
    let refCode = null;
    const refMatch = note.match(/ref=([a-z0-9_-]+)/i) || 
                     note.match(/referral:\s*([a-z0-9_-]+)/i) ||
                     note.match(/referral\s+code:\s*([a-z0-9_-]+)/i) ||
                     note.match(/referral\s*code\s*=\s*([a-z0-9_-]+)/i);
    if (refMatch) {
      refCode = refMatch[1];
    }
    let referralId = null;

    if (refCode) {
      const partner = db.prepare('SELECT id FROM referrals WHERE LOWER(referral_code) = LOWER(?)').get(refCode);
      if (partner) {
        referralId = partner.id;
        logger(`Found Referral Partner Match: "${refCode}" on Shopify Order #${orderNum}`);
      } else {
        logger(`Referral Code "${refCode}" in Order #${orderNum} note does not exist in local CRM database.`, 'warning');
      }
    }

    // Extract all fields that we need for insert / update
    const invoiceDate = o.created_at; // Full ISO string
    const billToName = o.billing_address
      ? `${o.billing_address.first_name || ''} ${o.billing_address.last_name || ''}`.trim()
      : (o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'Shopify Customer');
    const billToPhone = o.billing_address ? o.billing_address.phone : (o.customer ? o.customer.phone : '');
    
    const cleanAddress1 = (addrObj) => {
      if (!addrObj || !addrObj.address1) return '';
      return addrObj.addr1Cleaned ? addrObj.address1 : addrObj.address1.replace(/,\s*$/, '').trim();
    };

    const billingAddrObj = o.billing_address || (o.customer && o.customer.default_address);
    const billingAddress1Clean = cleanAddress1(billingAddrObj);
    const billToAddress = billingAddrObj
      ? [billingAddress1Clean, billingAddrObj.city, billingAddrObj.province, billingAddrObj.zip, billingAddrObj.country].filter(Boolean).join(', ')
      : '';
    const billingAddress2 = billingAddrObj?.address2 || '';
      
      
    const email = o.email || o.contact_email || '';
    
    const shippingName = o.shipping_address
      ? `${o.shipping_address.first_name || ''} ${o.shipping_address.last_name || ''}`.trim()
      : billToName;
    const shippingPhone = o.shipping_address ? o.shipping_address.phone : billToPhone;
    const shippingAddrObj = o.shipping_address || billingAddrObj;
    const shippingAddress1Clean = cleanAddress1(shippingAddrObj);
    const shippingAddress = shippingAddrObj
      ? [shippingAddress1Clean, shippingAddrObj.city, shippingAddrObj.province, shippingAddrObj.zip, shippingAddrObj.country].filter(Boolean).join(', ')
      : '';
    const shippingAddress2 = shippingAddrObj?.address2 || '';

    const tags = o.tags || '';
    const shippingCarrier = o.shipping_lines?.[0]?.title || '';
    const shopifyDiscountCodes = JSON.stringify(o.discount_codes || []);
    const shopifyDiscountApplications = JSON.stringify(o.discount_applications || []);
    const shopifyShippingDiscount = (o.shipping_lines || []).reduce((sum, line) => {
      return sum + (line.discount_allocations || []).reduce((lineSum, alloc) => {
        return lineSum + parseFloat(alloc.amount || alloc.amount_set?.shop_money?.amount || 0);
      }, 0);
    }, 0);
    const shopifyTotalDiscounts = parseFloat(
      o.current_total_discounts ||
      o.current_total_discounts_set?.shop_money?.amount ||
      o.total_discounts ||
      o.total_discounts_set?.shop_money?.amount ||
      0
    );
    const shopifyLineItemDiscount = Math.max(0, shopifyTotalDiscounts - shopifyShippingDiscount);
    let shippingCost = parseFloat(o.shipping_lines?.[0]?.discounted_price !== undefined ? o.shipping_lines[0].discounted_price : o.shipping_lines?.[0]?.price || 0);
    // If discounted_price is not available, check discount_allocations
    if (o.shipping_lines?.[0] && o.shipping_lines[0].discounted_price === undefined && o.shipping_lines[0].discount_allocations?.length > 0) {
      const shippingDiscount = o.shipping_lines[0].discount_allocations.reduce((sum, alloc) => sum + parseFloat(alloc.amount || 0), 0);
      shippingCost = Math.max(0, parseFloat(o.shipping_lines[0].price || 0) - shippingDiscount);
    }
    const totalAmount = parseFloat(o.total_price);
    const receivedAmount = o.financial_status === 'paid' ? totalAmount : 0;
    const deliveryStatus = o.fulfillments?.[0]?.shipment_status || o.fulfillment_status || 'unfulfilled';

    // Check if order already exists locally
    const existing = db.prepare('SELECT id FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);

    let currentOrderId;

    if (existing) {
      currentOrderId = existing.id;
      // Update statuses and totals
      db.prepare(`
        UPDATE orders SET
          shopify_financial_status = ?,
          shopify_fulfillment_status = ?,
          received_amount = ?,
          referral_id = COALESCE(?, referral_id),
          last_shopify_sync = CURRENT_TIMESTAMP,
          tags = ?,
          shipping_carrier = ?,
          delivery_status = ?,
          invoice_date = ?,
          bill_to_name = ?,
          bill_to_address = ?,
          bill_to_phone = ?,
          email = ?,
          shipping_name = ?,
          shipping_address = ?,
          shipping_phone = ?,
          shipping_charges = ?,
          total_amount = ?,
          final_amount = ?,
          status = ?,
          billing_address2 = ?,
          shipping_address2 = ?,
          shopify_discount_codes = ?,
          shopify_discount_applications = ?,
          shopify_total_discounts = ?,
          shopify_line_item_discount = ?,
          shopify_shipping_discount = ?
        WHERE id = ?
      `).run(
        o.financial_status,
        o.fulfillment_status,
        receivedAmount,
        referralId,
        tags,
        shippingCarrier,
        deliveryStatus,
        invoiceDate,
        billToName,
        billToAddress,
        billToPhone,
        email,
        shippingName,
        shippingAddress,
        shippingPhone,
        shippingCost,
        totalAmount,
        totalAmount - receivedAmount,
        o.cancelled_at ? 'cancelled' : 'active',
        billingAddress2,
        shippingAddress2,
        shopifyDiscountCodes,
        shopifyDiscountApplications,
        shopifyTotalDiscounts,
        shopifyLineItemDiscount,
        shopifyShippingDiscount,
        existing.id
      );

      // Update customer referral association if matched
      if (referralId && o.customer) {
        const cPhone = o.customer.phone || '';
        const cEmail = o.customer.email || '';
        db.prepare(`
          UPDATE customers SET referral_id = ?
          WHERE shopify_customer_id = ? OR email = ? OR (phone = ? AND phone != '')
        `).run(referralId, o.customer.id.toString(), cEmail, cPhone);
      }
      
      // Clear old order_items so we can recreate them accurately from Shopify
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(currentOrderId);
      
    } else {
      const saveStmt = db.prepare(`
        INSERT INTO orders (
          referral_id, invoice_number, invoice_date, bill_to_name, bill_to_address, bill_to_phone,
          shipping_charges, total_amount, received_amount, final_amount, apply_gst,
          shopify_order_id, shopify_order_number, shopify_financial_status, shopify_fulfillment_status,
          shopify_order_note, sync_source, last_shopify_sync, email, shipping_name, shipping_address,
          shipping_phone, tags, shipping_carrier, delivery_status, status,
          billing_address2, shipping_address2, shopify_discount_codes, shopify_discount_applications,
          shopify_total_discounts, shopify_line_item_discount, shopify_shipping_discount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'shopify', CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const saveResult = saveStmt.run(
        referralId,
        o.name || `#${orderNum}`,
        invoiceDate,
        billToName,
        billToAddress,
        billToPhone,
        shippingCost,
        totalAmount,
        receivedAmount,
        totalAmount - receivedAmount,
        shopifyOrderId,
        orderNum,
        o.financial_status,
        o.fulfillment_status,
        note,
        email,
        shippingName,
        shippingAddress,
        shippingPhone,
        tags,
        shippingCarrier,
        deliveryStatus,
        o.cancelled_at ? 'cancelled' : 'active',
        billingAddress2,
        shippingAddress2,
        shopifyDiscountCodes,
        shopifyDiscountApplications,
        shopifyTotalDiscounts,
        shopifyLineItemDiscount,
        shopifyShippingDiscount
      );

      currentOrderId = saveResult.lastInsertRowid;

      // Associate customer referral if matched
      if (referralId && o.customer) {
        const cPhone = o.customer.phone || '';
        const cEmail = o.customer.email || '';
        db.prepare(`
          UPDATE customers SET referral_id = ?
          WHERE shopify_customer_id = ? OR email = ? OR (phone = ? AND phone != '')
        `).run(referralId, o.customer.id.toString(), cEmail, cPhone);
      }
      logger(`Saved new Shopify Order #${orderNum} in database.`);
    }

    // Save Line Items (for both new and existing orders)
    const lineItems = o.line_items || [];
    for (const item of lineItems) {
      const variantIdStr = item.variant_id ? item.variant_id.toString() : '';
      let product = db.prepare('SELECT id, mrp, gst_rate FROM products WHERE shopify_variant_id = ? OR shopify_variant_id = ?').get(variantIdStr, `gid://shopify/ProductVariant/${variantIdStr}`);
      if (!product && item.sku) {
        product = db.prepare('SELECT id, mrp, gst_rate FROM products WHERE batch_id = ?').get(item.sku);
      }
      if (!product) {
        product = db.prepare('SELECT id, mrp, gst_rate FROM products WHERE item_name = ?').get(item.title);
      }

      const productIdVal = product ? product.id : null;
      const mrpVal = product ? product.mrp : parseFloat(item.price);
      const gstVal = product ? product.gst_rate : 0;

      if (productIdVal) {
        let totalDiscount = parseFloat(item.total_discount || item.total_discount_set?.shop_money?.amount || 0);
        
        // Also check discount_allocations if total_discount is 0
        if (totalDiscount === 0 && item.discount_allocations && item.discount_allocations.length > 0) {
          totalDiscount = item.discount_allocations.reduce((sum, alloc) => sum + parseFloat(alloc.amount || alloc.amount_set?.shop_money?.amount || 0), 0);
        }

        db.prepare(`
          INSERT INTO order_items (
            order_id, product_id, item_name, quantity_string, mrp, gst_rate, unit, size, batch_id, price_per_item, total, total_discount, shopify_current_quantity
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          currentOrderId,
          productIdVal,
          item.title,
          item.quantity.toString(),
          mrpVal,
          gstVal,
          'pcs',
          '',
          item.sku || '',
          parseFloat(item.price),
          parseFloat(item.price) * item.quantity,
          totalDiscount,
          item.current_quantity ?? item.quantity
        );
      }
    }
    syncCount++;
  }

  if (allShopifyOrderIds.length > 0) {
    db.prepare("CREATE TEMP TABLE IF NOT EXISTS _sync_shopify_ids (id TEXT PRIMARY KEY)").run();
    db.prepare("DELETE FROM _sync_shopify_ids").run();
    const insertId = db.prepare("INSERT INTO _sync_shopify_ids (id) VALUES (?)");
    const insertMany = db.transaction((ids) => {
      for (const id of ids) {
        insertId.run(id);
      }
    });
    insertMany(allShopifyOrderIds);
    const deleted = db.prepare("DELETE FROM orders WHERE sync_source = 'shopify' AND shopify_order_id NOT IN (SELECT id FROM _sync_shopify_ids)").run();
    db.prepare("DROP TABLE _sync_shopify_ids").run();
    if (deleted.changes > 0) {
      logger(`Cleaned up ${deleted.changes} deleted Shopify orders from local database.`);
    }
  }

  const fixedPaid = db.prepare("UPDATE orders SET final_amount = 0 WHERE sync_source = 'shopify' AND shopify_financial_status = 'paid' AND final_amount > 0").run();
  if (fixedPaid.changes > 0) {
    logger(`Fixed final_amount for ${fixedPaid.changes} paid Shopify orders (set due to 0).`);
  }

  logger(`Order sync finished. Pulled/updated ${syncCount} Shopify orders.`);
  return syncCount;
}

// Main execution function
async function syncShopifyNow(scope = 'all', logger = console.log) {
  const db = getDb();
  if (!db) {
    throw new Error('Database is not initialized.');
  }

  // 1. Sync referrals from Supabase to local SQLite cache first
  try {
    logger('Fetching referrals from Supabase...');
    const { supabase } = require('./supabaseClient');
    const { data: referrals, error } = await supabase
      .from('referrals')
      .select('*');
    
    if (error) throw error;
    if (referrals && referrals.length > 0) {
      const insertRef = db.prepare(`
        INSERT INTO referrals (name, email, phone, referral_code, parent_code, role)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(referral_code) DO UPDATE SET
          name = excluded.name,
          email = excluded.email,
          phone = excluded.phone,
          parent_code = excluded.parent_code,
          role = excluded.role
      `);
      
      const transact = db.transaction((refs) => {
        for (const r of refs) {
          insertRef.run(r.name, r.email || null, r.phone, r.referral_code, r.parent_code || null, r.role);
        }
      });
      
      transact(referrals);
      logger(`Successfully cached ${referrals.length} referrals from Supabase.`);
    }
  } catch (err) {
    logger(`Failed to sync referrals from Supabase: ${err.message}. Running offline.`, 'warning');
  }

  let domain, token;
  try {
    const credentials = await getValidToken();
    domain = credentials.domain;
    token = credentials.token;
  } catch (err) {
    throw new Error(`Shopify credentials verification failed: ${err.message}`);
  }

  // Retrieve last sync timestamp
  const syncRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'last_sync_timestamp'").get();
  const sinceTimestamp = syncRow ? syncRow.value : null;

  let pulledOrders = 0;
  let updatedInventory = 0;
  let syncedCustomers = 0;

  // Note: We run these sequentially to log debug strings correctly
  if (scope === 'all' || scope === 'inventory') {
    updatedInventory = await syncInventory(domain, token, db, logger);
  }

  if (scope === 'all' || scope === 'orders') {
    syncedCustomers = await syncCustomers(domain, token, db, sinceTimestamp, logger);
    pulledOrders = await syncOrders(domain, token, db, sinceTimestamp, logger);
  }

  // Update sync metadata
  const currentSyncTime = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO shopify_sync_metadata (key, value, updated_at) VALUES ('last_sync_timestamp', ?, CURRENT_TIMESTAMP)").run(currentSyncTime);

  return {
    success: true,
    pulledOrders,
    updatedInventory,
    syncedCustomers
  };
}

// 7. Reset Sync State
async function resetShopifySyncState() {
  const db = getDb();
  if (!db) return { success: false, error: 'Database not initialized' };

  try {
    db.prepare("DELETE FROM shopify_sync_metadata WHERE key = 'last_sync_timestamp'").run();
    db.prepare("UPDATE products SET last_shopify_sync = NULL").run();
    db.prepare("UPDATE customers SET last_shopify_sync = NULL").run();
    db.prepare("UPDATE orders SET last_shopify_sync = NULL WHERE sync_source = 'shopify'").run();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 8. Push Local stock update to Shopify
async function pushStockToShopify(productId, newStock) {
  const db = getDb();
  if (!db) return;

  try {
    const credentials = await getValidToken();
    const domain = credentials.domain;
    const token = credentials.token;

    const prod = db.prepare('SELECT shopify_inventory_item_id, item_name, stock FROM products WHERE id = ?').get(productId);
    if (!prod || !prod.shopify_inventory_item_id) return;

    // Sum stock across all local batches sharing the same Shopify inventory item (so multi-batch products stay in sync)
    const totalRow = db.prepare(
      'SELECT SUM(stock) as total_stock FROM products WHERE shopify_inventory_item_id = ?'
    ).get(prod.shopify_inventory_item_id);
    const totalStock = totalRow ? (totalRow.total_stock || 0) : (newStock !== undefined ? newStock : prod.stock || 0);

    console.log(`Pushing CRM stock update for "${prod.item_name}" to Shopify variant...`);

    // Fetch Location ID and current inventory quantities (both on_hand and available) from Shopify dynamically
    const inventoryQuery = `
      query getInventory($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 2) {
            edges {
              node {
                location {
                  id
                }
                quantities(names: ["on_hand", "available"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    `;
    const invRes = await runShopifyGraphQL(domain, token, inventoryQuery, { id: prod.shopify_inventory_item_id });
    if (!invRes.success || !invRes.data?.inventoryItem?.inventoryLevels?.edges?.[0]?.node) {
      console.error('Failed to resolve Shopify location or inventory details for inventory update.');
      return;
    }
    const node = invRes.data.inventoryItem.inventoryLevels.edges[0].node;
    const locationId = node.location.id;
    
    const quantities = node.quantities || [];
    const onHandObj = quantities.find(q => q.name === 'on_hand');
    const availableObj = quantities.find(q => q.name === 'available');
    
    const currentOnHand = onHandObj ? onHandObj.quantity : 0;
    const currentAvailable = availableObj ? availableObj.quantity : 0;

    const targetStock = totalStock;
    const delta = targetStock - currentAvailable;
    const newOnHand = currentOnHand + delta;

    // Run inventory mutation
    const mutation = `
      mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!, $idempotencyKey: String!) {
        inventorySetOnHandQuantities(input: $input) @idempotent(key: $idempotencyKey) {
          inventoryAdjustmentGroup {
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        reason: "correction",
        setQuantities: [
          {
            inventoryItemId: prod.shopify_inventory_item_id,
            locationId: locationId,
            quantity: newOnHand,
            changeFromQuantity: currentOnHand
          }
        ]
      },
      idempotencyKey: `crm-stock-${productId}-${Date.now()}`
    };

    const mutRes = await runShopifyGraphQL(domain, token, mutation, variables);
    if (!mutRes.success) {
      console.error('Shopify GraphQL inventory mutation returned errors:', mutRes.error);
    } else {
      console.log(`Successfully synced CRM stock change to Shopify for "${prod.item_name}"`);
      db.prepare("UPDATE products SET last_shopify_sync = CURRENT_TIMESTAMP WHERE id = ?").run(productId);
    }
  } catch (err) {
    console.error('Error during pushing stock to Shopify:', err.message);
  }
}

// Delete Shopify Order
async function deleteShopifyOrder(shopifyOrderId) {
  try {
    const credentials = await getValidToken();
    const url = `/orders/${shopifyOrderId}.json`;
    const res = await runShopifyREST(credentials.domain, credentials.token, url, 'DELETE');
    return { success: res.success, data: res.data, error: res.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Update Shopify Order
async function updateShopifyOrder(shopifyOrderId, orderPayload) {
  try {
    const credentials = await getValidToken();
    const url = `/orders/${shopifyOrderId}.json`;
    const res = await runShopifyREST(credentials.domain, credentials.token, url, 'PUT', { order: orderPayload });
    return { success: res.success, data: res.data, error: res.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create a fulfillment on Shopify for an order
async function createShopifyFulfillment(shopifyOrderId, trackingCompany = null, trackingNumber = null) {
  try {
    const credentials = await getValidToken();
    const domain = credentials.domain;
    const token = credentials.token;

    // Step 1: Get fulfillment orders for this Shopify order
    const foUrl = `/orders/${shopifyOrderId}/fulfillment_orders.json`;
    const foRes = await runShopifyREST(domain, token, foUrl, 'GET');
    if (!foRes.success) {
      return { success: false, error: `Failed to fetch fulfillment orders: ${JSON.stringify(foRes.error)}` };
    }

    const allFulfillmentOrders = foRes.data?.fulfillment_orders;
    if (!allFulfillmentOrders || allFulfillmentOrders.length === 0) {
      return { success: false, error: 'No fulfillment orders found for this order' };
    }

    // Filter to only fulfillment orders with status "open" (others are closed/cancelled/already fulfilled)
    const openFulfillmentOrders = allFulfillmentOrders.filter(fo => fo.status === 'open');
    if (openFulfillmentOrders.length === 0) {
      return { success: true, data: null, note: 'All fulfillment orders are already closed or cancelled on Shopify' };
    }

    // Step 2: Get the first available location ID
    const locUrl = `/locations.json`;
    const locRes = await runShopifyREST(domain, token, locUrl, 'GET');
    if (!locRes.success || !locRes.data?.locations?.length) {
      return { success: false, error: 'Failed to fetch locations' };
    }
    const locationId = locRes.data.locations[0].id;

    // Step 3: Create the fulfillment
    const lineItemsByFulfillmentOrder = openFulfillmentOrders.map(fo => ({
      fulfillment_order_id: fo.id,
      fulfillment_order_line_items: fo.line_items?.map(li => ({
        id: li.id,
        quantity: li.quantity
      })) || []
    }));

    const fulfillmentPayload = {
      fulfillment: {
        line_items_by_fulfillment_order: lineItemsByFulfillmentOrder,
        location_id: locationId,
        notify_customer: true
      }
    };

    if (trackingCompany) fulfillmentPayload.fulfillment.tracking_company = trackingCompany;
    if (trackingNumber) fulfillmentPayload.fulfillment.tracking_number = trackingNumber;

    const createUrl = `/fulfillments.json`;
    const createRes = await runShopifyREST(domain, token, createUrl, 'POST', fulfillmentPayload);
    return { success: createRes.success, data: createRes.data, error: createRes.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create Shopify Transaction (e.g. Capture or Payment)
async function createShopifyTransaction(shopifyOrderId, amount) {
  try {
    const credentials = await getValidToken();
    const url = `/orders/${shopifyOrderId}/transactions.json`;
    const payload = {
      transaction: {
        kind: "capture",
        status: "success",
        amount: amount
      }
    };
    const res = await runShopifyREST(credentials.domain, credentials.token, url, 'POST', payload);
    return { success: res.success, data: res.data, error: res.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sync local CRM order items to Shopify Order via GraphQL OrderEdit API
async function syncOrderItemsToShopify(shopifyOrderId, items) {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  try {
    const credentials = await getValidToken();
    const domain = credentials.domain;
    const token = credentials.token;

    const orderGid = shopifyOrderId.startsWith('gid://shopify/Order/') 
      ? shopifyOrderId 
      : `gid://shopify/Order/${shopifyOrderId}`;

    // 1. Begin Order Edit Session
    const beginMutation = `
      mutation orderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder {
            id
            lineItems(first: 250) {
              edges {
                node {
                  id
                  variant {
                    id
                  }
                  quantity
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const beginRes = await runShopifyGraphQL(domain, token, beginMutation, { id: orderGid });
    if (!beginRes.success) {
      console.error("GraphQL request error in orderEditBegin:", beginRes.error);
      return { success: false, error: beginRes.error || 'Failed to begin order edit' };
    }

    const editData = beginRes.data?.orderEditBegin;
    if (!editData) {
      console.error("GraphQL returned no orderEditBegin data:", beginRes.data);
      return { success: false, error: 'No order edit session returned' };
    }

    if (editData.userErrors && editData.userErrors.length > 0) {
      const errMsg = editData.userErrors.map(e => e.message).join(', ');
      console.error("Shopify user errors in orderEditBegin:", errMsg);
      return { success: false, error: errMsg };
    }

    const calculatedOrder = editData.calculatedOrder;
    if (!calculatedOrder) {
      return { success: false, error: 'Calculated order missing from edit session' };
    }

    const calculatedOrderId = calculatedOrder.id;
    const existingLineItems = (calculatedOrder.lineItems?.edges || []).map(e => e.node);

    // 2. Map CRM items to target Shopify variant IDs & quantities.
    // Multiple CRM product rows can point at the same Shopify variant
    // (for example, separate local batches). Shopify order edits are variant
    // based, so aggregate them before comparing with existing line items.
    const localItemsByVariant = new Map();
    const unmappedItems = [];
    const parseSyncQuantity = (qty) => String(qty || '0')
      .split('+')
      .reduce((sum, part) => sum + (parseInt(part, 10) || 0), 0);

    for (const item of items) {
      const q = parseSyncQuantity(item.quantity_string || item.quantity);
      if (q <= 0) continue;

      // Fetch the shopify_variant_id for this CRM product
      const productId = item.product_id || item.id;
      const prod = db.prepare('SELECT item_name, shopify_variant_id FROM products WHERE id = ?').get(productId);
      if (prod && prod.shopify_variant_id) {
        const normalizedVariantId = prod.shopify_variant_id.startsWith('gid://shopify/ProductVariant/')
          ? prod.shopify_variant_id
          : `gid://shopify/ProductVariant/${prod.shopify_variant_id}`;
        localItemsByVariant.set(
          normalizedVariantId,
          (localItemsByVariant.get(normalizedVariantId) || 0) + q
        );
      } else {
        unmappedItems.push(item.item_name || `Product ID ${productId}`);
      }
    }

    if (unmappedItems.length > 0) {
      return {
        success: false,
        error: `Cannot sync ${unmappedItems.join(', ')} to Shopify because the product is not linked to a Shopify variant. Sync products from Shopify or map the variant before updating this Shopify order.`
      };
    }

    const localItemsToSync = Array.from(localItemsByVariant.entries()).map(([shopifyVariantId, quantity]) => ({
      shopifyVariantId,
      quantity
    }));

    // Keep track of which existing calculated line items were matched/updated
    const matchedExistingIds = new Set();
    let changesMade = false;

    // 3. Process additions and quantity updates
    for (const localItem of localItemsToSync) {
      const existingMatch = existingLineItems.find(el => {
        if (!el.variant) return false;
        const v1 = el.variant.id.split('/').pop();
        const v2 = localItem.shopifyVariantId.split('/').pop();
        return v1 === v2;
      });

      if (existingMatch) {
        matchedExistingIds.add(existingMatch.id);
        if (existingMatch.quantity !== localItem.quantity) {
          // Quantity is different, update it
          const setQtyMutation = `
            mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
              orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
                userErrors {
                  field
                  message
                }
              }
            }
          `;
          const setQtyRes = await runShopifyGraphQL(domain, token, setQtyMutation, {
            id: calculatedOrderId,
            lineItemId: existingMatch.id,
            quantity: localItem.quantity
          });
          if (!setQtyRes.success) {
            console.error("GraphQL request error in orderEditSetQuantity:", setQtyRes.error);
            return { success: false, error: setQtyRes.error || 'Failed to set quantity' };
          }
          const setErrors = setQtyRes.data?.orderEditSetQuantity?.userErrors;
          if (setErrors && setErrors.length > 0) {
            const errMsg = setErrors.map(e => e.message).join(', ');
            console.error("Error setting quantity on Shopify:", errMsg);
            return { success: false, error: `Failed to set quantity: ${errMsg}` };
          }
          changesMade = true;
        }
      } else {
        // Line item doesn't exist, add it
        const addLineMutation = `
          mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
            orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
              calculatedLineItem {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const addLineRes = await runShopifyGraphQL(domain, token, addLineMutation, {
          id: calculatedOrderId,
          variantId: localItem.shopifyVariantId,
          quantity: localItem.quantity
        });
        if (!addLineRes.success) {
          console.error("GraphQL request error in orderEditAddVariant:", addLineRes.error);
          return { success: false, error: addLineRes.error || 'Failed to add line item' };
        }
        const addErrors = addLineRes.data?.orderEditAddVariant?.userErrors;
        if (addErrors && addErrors.length > 0) {
          const errMsg = addErrors.map(e => e.message).join(', ');
          console.error("Error adding line item to Shopify:", errMsg);
          return { success: false, error: `Failed to add line item: ${errMsg}` };
        }
        changesMade = true;
      }
    }

    // 4. Remove items that were deleted in the CRM
    for (const el of existingLineItems) {
      if (!matchedExistingIds.has(el.id)) {
        const setQtyMutation = `
          mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
              userErrors {
                field
                message
              }
            }
          }
        `;
        const removeRes = await runShopifyGraphQL(domain, token, setQtyMutation, {
          id: calculatedOrderId,
          lineItemId: el.id,
          quantity: 0
        });
        if (!removeRes.success) {
          console.error("GraphQL request error in orderEditSetQuantity remove:", removeRes.error);
          return { success: false, error: removeRes.error || 'Failed to remove line item' };
        }
        const removeErrors = removeRes.data?.orderEditSetQuantity?.userErrors;
        if (removeErrors && removeErrors.length > 0) {
          const errMsg = removeErrors.map(e => e.message).join(', ');
          console.error("Error removing line item from Shopify:", errMsg);
          return { success: false, error: `Failed to remove line item: ${errMsg}` };
        }
        changesMade = true;
      }
    }

    if (!changesMade) {
      console.log(`No Shopify line item changes detected for order ${shopifyOrderId}; skipping orderEditCommit.`);
      return { success: true, skipped: true };
    }

    // 5. Commit the Order Edit Session
    const commitMutation = `
      mutation orderEditCommit($id: ID!) {
        orderEditCommit(id: $id) {
          order {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const commitRes = await runShopifyGraphQL(domain, token, commitMutation, { id: calculatedOrderId });
    if (!commitRes.success) {
      console.error("GraphQL request error in orderEditCommit:", commitRes.error);
      return { success: false, error: commitRes.error || 'Failed to commit order edit' };
    }

    const commitData = commitRes.data?.orderEditCommit;
    if (commitData?.userErrors && commitData.userErrors.length > 0) {
      const errMsg = commitData.userErrors.map(e => e.message).join(', ');
      console.error("Shopify user errors in orderEditCommit:", errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    console.error('Error during syncOrderItemsToShopify:', err.message);
    return { success: false, error: err.message };
  }
}

async function refreshShopifyOrderItemState(shopifyOrderId, localOrderId) {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  if (!shopifyOrderId || !localOrderId) {
    return { success: false, error: 'Missing Shopify order ID or local order ID' };
  }

  try {
    const credentials = await getValidToken();
    const res = await runShopifyREST(credentials.domain, credentials.token, `/orders/${shopifyOrderId}.json`);
    if (!res.success || !res.data?.order) {
      return { success: false, error: res.error || 'Failed to fetch Shopify order' };
    }

    const order = res.data.order;
    const lineItems = order.line_items || [];
    const updatedProductIds = new Set();
    const updateItem = db.prepare(`
      UPDATE order_items
      SET shopify_current_quantity = ?
      WHERE order_id = ? AND product_id = ?
    `);

    for (const item of lineItems) {
      const variantIdStr = item.variant_id ? item.variant_id.toString() : '';
      let product = variantIdStr
        ? db.prepare('SELECT id FROM products WHERE shopify_variant_id = ? OR shopify_variant_id = ?').get(variantIdStr, `gid://shopify/ProductVariant/${variantIdStr}`)
        : null;

      if (!product && item.sku) {
        product = db.prepare('SELECT id FROM products WHERE batch_id = ?').get(item.sku);
      }
      if (!product) {
        product = db.prepare('SELECT id FROM products WHERE item_name = ?').get(item.title);
      }

      if (product?.id) {
        updateItem.run(item.current_quantity ?? item.quantity ?? 0, localOrderId, product.id);
        updatedProductIds.add(product.id);
      }
    }

    return { success: true, updatedCount: updatedProductIds.size };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  testShopifyConnection,
  generateShopifyToken,
  runShopifyREST,
  runShopifyGraphQL,
  syncShopifyNow,
  resetShopifySyncState,
  pushStockToShopify,
  deleteShopifyOrder,
  updateShopifyOrder,
  createShopifyFulfillment,
  createShopifyTransaction,
  syncOrderItemsToShopify,
  refreshShopifyOrderItemState
};
