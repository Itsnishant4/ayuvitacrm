// Shopify API helper functions
// Reads store URL and access token from database if available, otherwise falls back to environment variables.
// Requires environment variables (or database records):
//   SHOPIFY_STORE_URL   – e.g. https://myshop.myshopify.com
//   SHOPIFY_API_VERSION – e.g. 2024-04
//   SHOPIFY_ACCESS_TOKEN – private app token with appropriate scopes

const axios = require('axios');
const { getDb } = require('./db');

function getShopifyCredentials() {
  let domain = process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_STORE_URL || '';
  let token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '';

  try {
    const db = getDb();
    if (db) {
      const domainRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_domain'").get();
      const tokenRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_token'").get();
      if (domainRow && domainRow.value) {
        domain = domainRow.value;
      }
      if (tokenRow && tokenRow.value) {
        token = tokenRow.value;
      }
    }
  } catch (err) {
    // Database might not be initialized or query failed
  }

  return { domain, token };
}

function getBaseUrl() {
  const { domain } = getShopifyCredentials();
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';
  if (!domain) throw new Error('SHOPIFY_STORE_URL environment variable or database setting is not set');

  return `${domain.includes('https') ? domain.replace(/\/*$/, '') : 'https://' + domain.replace(/\/*$/, '')}/admin/api/${apiVersion}`;
}

function getHeaders() {
  const { token } = getShopifyCredentials();
  if (!token) throw new Error('SHOPIFY_ACCESS_TOKEN environment variable or database setting is not set');
  return { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
}

// ----- Products -----
async function fetchProducts(params = {}) {
  const url = `${getBaseUrl()}/products.json`;
  const resp = await axios.get(url, { headers: getHeaders(), params });
  return resp.data.products;
}

async function getProduct(productId) {
  const url = `${getBaseUrl()}/products/${productId}.json`;
  const resp = await axios.get(url, { headers: getHeaders() });
  return resp.data.product;
}

async function shopifyAddProduct(product) {
  const url = `${getBaseUrl()}/products.json`;
  const resp = await axios.post(url, { product }, { headers: getHeaders() });
  return resp.data.product;
}

async function shopifyUpdateProduct(productId, product) {
  const url = `${getBaseUrl()}/products/${productId}.json`;
  const resp = await axios.put(url, { product }, { headers: getHeaders() });
  return resp.data.product;
}

async function shopifyDeleteProduct(productId) {
  const url = `${getBaseUrl()}/products/${productId}.json`;
  await axios.delete(url, { headers: getHeaders() });
  return { success: true };
}

// ----- Inventory (stock) -----
/**
 * Set inventory level for a variant at a location.
 * @param {string|number} inventoryItemId - Shopify inventory item ID.
 * @param {string|number} locationId - Shopify location ID.
 * @param {number} available - Desired quantity.
 */
async function setInventoryLevel(inventoryItemId, locationId, available) {
  const url = `${getBaseUrl()}/inventory_levels/set.json`;
  const body = { location_id: locationId, inventory_item_id: inventoryItemId, available };
  const resp = await axios.post(url, body, { headers: getHeaders() });
  return resp.data.inventory_level;
}

// ----- Orders -----
async function fetchOrders(params = {}) {
  const url = `${getBaseUrl()}/orders.json`;
  const resp = await axios.get(url, { headers: getHeaders(), params });
  return resp.data.orders;
}

async function shopifyCreateOrder(order) {
  const url = `${getBaseUrl()}/orders.json`;
  const resp = await axios.post(url, { order }, { headers: getHeaders() });
  return resp.data.order;
}

async function shopifyUpdateOrder(orderId, order) {
  const url = `${getBaseUrl()}/orders/${orderId}.json`;
  const resp = await axios.put(url, { order }, { headers: getHeaders() });
  return resp.data.order;
}

async function shopifyDeleteOrder(orderId) {
  const url = `${getBaseUrl()}/orders/${orderId}.json`;
  await axios.delete(url, { headers: getHeaders() });
  return { success: true };
}

module.exports = {
  fetchProducts,
  getProduct,
  shopifyAddProduct,
  shopifyUpdateProduct,
  shopifyDeleteProduct,
  setInventoryLevel,
  fetchOrders,
  shopifyCreateOrder,
  shopifyUpdateOrder,
  shopifyDeleteOrder,
};
