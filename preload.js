const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  signup: (data) => ipcRenderer.invoke('signup', data),
  login: (data) => ipcRenderer.invoke('login', data),
  verifyToken: (token) => ipcRenderer.invoke('verify-token', token),
  
  // Supabase APIs
  supabaseVerifyReferral: (code) => ipcRenderer.invoke('supabase-verify-referral', code),
  supabaseGetPartners: (payload) => ipcRenderer.invoke('supabase-get-partners', payload),
  supabaseAddPartner: (partner) => ipcRenderer.invoke('supabase-add-partner', partner),
  supabaseUpdatePartner: (payload) => ipcRenderer.invoke('supabase-update-partner', payload),
  supabaseDeletePartner: (id) => ipcRenderer.invoke('supabase-delete-partner', id),

  addPartner: (data) => ipcRenderer.invoke('add-partner', data),
  updatePartner: (data) => ipcRenderer.invoke('update-partner', data),
  deletePartner: (id) => ipcRenderer.invoke('delete-partner', id),
  getPartners: () => ipcRenderer.invoke('get-partners'),
  addProduct: (data) => ipcRenderer.invoke('add-product', data),
  addBatch: (data) => ipcRenderer.invoke('add-batch', data),
  updateProduct: (data) => ipcRenderer.invoke('update-product', data),
  deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),
  getProducts: () => ipcRenderer.invoke('get-products'),
  createOrder: (orderData, items) => ipcRenderer.invoke('create-order', orderData, items),
  getLatestInvoiceNumber: () => ipcRenderer.invoke('get-latest-invoice-number'),
  getOrders: () => ipcRenderer.invoke('get-orders'),
  getOrderItems: (orderId) => ipcRenderer.invoke('get-order-items', orderId),
  refreshShopifyOrderItemState: (shopifyOrderId, localOrderId) => ipcRenderer.invoke('refresh-shopify-order-item-state', { shopifyOrderId, localOrderId }),
  updateOrder: (orderId, orderData, items) => ipcRenderer.invoke('update-order', orderId, orderData, items),
  deleteOrder: (id) => ipcRenderer.invoke('delete-order', id),
  updateStock: (id, newStock, change) => ipcRenderer.invoke('update-stock', id, newStock, change),
  getStockHistory: (productId) => ipcRenderer.invoke('get-stock-history', productId),
  getCustomers: (role, referralCode) => ipcRenderer.invoke('get-customers', role, referralCode),
  getCustomersWithStats: (role, referralCode) => ipcRenderer.invoke('get-customers-with-stats', role, referralCode),
  addCustomer: (data) => ipcRenderer.invoke('add-customer', data),
  updateCustomer: (id, data) => ipcRenderer.invoke('update-customer', id, data),
  deleteCustomer: (id) => ipcRenderer.invoke('delete-customer', id),
  cancelOrder: (id) => ipcRenderer.invoke('cancel-order', id),
  getCustomerOrders: (customerName) => ipcRenderer.invoke('get-customer-orders', customerName),
  getAnalytics: (startDate, endDate, referralCode, role) => ipcRenderer.invoke('get-analytics', startDate, endDate, referralCode, role),
  backupDatabase: () => ipcRenderer.invoke('backup-database'),
  restoreDatabase: () => ipcRenderer.invoke('restore-database'),
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  saveTemplate: (data) => ipcRenderer.invoke('save-template', data),
  deleteTemplate: (id) => ipcRenderer.invoke('delete-template', id),
  ping: () => ipcRenderer.invoke('ping'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkElectronUpdate: () => ipcRenderer.invoke('check-electron-update'),
  downloadElectronUpdate: () => ipcRenderer.invoke('download-electron-update'),
  installElectronUpdate: () => ipcRenderer.invoke('install-electron-update'),
  onElectronUpdateStatus: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('electron-update-status', listener);
    return () => ipcRenderer.removeListener('electron-update-status', listener);
  },
  setAppIcon: (data) => ipcRenderer.invoke('set-app-icon', data),
  getAppIcon: () => ipcRenderer.invoke('get-app-icon'),
  // Shopify API wrappers
  shopifyGetProducts: () => ipcRenderer.invoke('shopify-get-products'),
  shopifyAddProduct: (product) => ipcRenderer.invoke('shopify-add-product', product),
  shopifyUpdateProduct: (payload) => {
    const { id, product } = payload || {};
    return ipcRenderer.invoke('shopify-update-product', { id, product });
  },
  shopifyDeleteProduct: (productId) => ipcRenderer.invoke('shopify-delete-product', productId),
  shopifyGetOrders: () => ipcRenderer.invoke('shopify-get-orders'),
  shopifyCreateOrder: (payload) => {
    const { order } = payload || {};
    return ipcRenderer.invoke('shopify-create-order', order);
  },
  shopifyUpdateOrder: (payload) => {
    const { id, order } = payload || {};
    return ipcRenderer.invoke('shopify-update-order', { id, order });
  },
  shopifyDeleteOrder: (orderId) => ipcRenderer.invoke('shopify-delete-order', orderId),
  shopifySetInventory: (payload) => {
    const { inventoryItemId, locationId, available } = payload || {};
    return ipcRenderer.invoke('shopify-set-inventory', { inventoryItemId, locationId, available });
  },
  // Shopify settings & sync helpers
  getShopifySettings: () => ipcRenderer.invoke('shopify-get-settings'),
  saveShopifySettings: (domain, token, clientId, clientSecret, tokenExpiresAt) => ipcRenderer.invoke('shopify-save-settings', { domain, token, clientId, clientSecret, tokenExpiresAt }),
  testShopifyConnection: (domain, token, clientId, clientSecret) => ipcRenderer.invoke('shopify-test-connection', { domain, token, clientId, clientSecret }),
  generateShopifyToken: (domain, clientId, clientSecret) => ipcRenderer.invoke('shopify-generate-token', { domain, clientId, clientSecret }),
  runShopifyREST: (endpoint) => ipcRenderer.invoke('shopify-run-rest', endpoint),
  runShopifyGraphQL: (query) => ipcRenderer.invoke('shopify-run-graphql', query),
  syncShopifyNow: (scope) => ipcRenderer.invoke('shopify-sync-now', scope),
  resetShopifySyncState: () => ipcRenderer.invoke('shopify-reset-sync'),
  // Listen for sync log events (optional)
  onShopifySyncLog: (callback) => {
    const listener = (_, log) => callback(log);
    ipcRenderer.on('shopify-sync-log', listener);
    return () => ipcRenderer.removeListener('shopify-sync-log', listener);
  }
});

// Broadcast background sync completion to frontend DOM
ipcRenderer.on('shopify-sync-completed', () => {
  window.dispatchEvent(new CustomEvent('shopify-sync-completed'));
});
