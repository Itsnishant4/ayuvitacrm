// Load the .env that is bundled with packaged builds (see package.json files
// + the release workflow) from the app root inside the asar.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

const isTesting = process.env.CRM_TESTING === 'true';
const isDev = !app.isPackaged || isTesting;

if (isDev && !isTesting && process.env.ELECTRON_RELOAD_DISABLED !== 'true') {
  require('electron-reload')(__dirname);
}

const gotTheLock = isDev ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  if (!isTesting) {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      // Someone tried to run a second instance, we should focus our window.
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        if (windows[0].isMinimized()) windows[0].restore();
        windows[0].focus();
      }
    });
  }
}


const rateLimitMap = new Map(); // channel -> { count, resetTime }
const RATE_LIMIT = 20; // max calls per interval per channel
const RATE_INTERVAL_MS = 60000; // 1 minute
// Login lockout configuration (used for login attempt throttling)
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function isRateLimited(channel) {
  const now = Date.now();
  const entry = rateLimitMap.get(channel) || { count: 0, resetTime: now + RATE_INTERVAL_MS };
  if (now > entry.resetTime) {
    entry.count = 0;
    entry.resetTime = now + RATE_INTERVAL_MS;
  }
  entry.count += 1;
  rateLimitMap.set(channel, entry);
  return entry.count > RATE_LIMIT;
}

function wrapHandler(channel, handler) {
  return async (...args) => {
    if (isRateLimited(channel)) {
      return { success: false, error: 'Rate limit exceeded for this operation' };
    }
    return handler(...args);
  };
}
const { autoUpdater } = require('electron-updater');
const crypto = require('crypto');
const { supabase } = require('./database/supabaseClient');
const { initDatabase, closeDatabase, getDatabasePath, dbHelpers } = require('./database/db');
const {
  testShopifyConnection,
  generateShopifyToken,
  runShopifyREST,
  runShopifyGraphQL,
  syncShopifyNow,
  resetShopifySyncState,
  pushStockToShopify,
  deleteShopifyOrder,
  updateShopifyOrder,
  createShopifyTransaction,
  createShopifyFulfillment,
  syncOrderItemsToShopify,
  refreshShopifyOrderItemState
} = require('./database/shopifySync');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const axios = require('axios');
const AdmZip = require('adm-zip');

let JWT_SECRET;

function loadConfig() {  
  if (process.env.JWT_SECRET) {
    JWT_SECRET = process.env.JWT_SECRET;
  } else {
    const secretFilePath = path.join(app.getPath('userData'), '.jwt_secret');
    if (fs.existsSync(secretFilePath)) {
      JWT_SECRET = fs.readFileSync(secretFilePath, 'utf8').trim();
    } else {
      JWT_SECRET = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretFilePath, JWT_SECRET, { mode: 0o600 });
    }
  }
}

// Auto-updater setup — feed comes from package.json > build.publish (GitHub provider).
// NOTE: electron-builder STRIPS the "build" section from package.json inside the
// packaged asar, so in a packaged app this returns null and electron-updater
// falls back to the app-update.yml that electron-builder ships in resources/.
function setupAutoUpdater() {
  let publish = null;
  try {
    const pkg = require('./package.json');
    publish = (pkg && pkg.build && pkg.build.publish) || null;
  } catch (e) {
    publish = null;
  }
  if (publish && publish.owner && publish.repo) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: publish.owner,
      repo: publish.repo
    });
  } else {
    console.log('[Updater] Using default app-update.yml feed (packaged build).');
  }

  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('electron-update-status', { type: 'update-available', info });
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('electron-update-status', { type: 'update-not-available' });
      }
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('electron-update-status', { type: 'download-progress', progress: progressObj.percent });
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('electron-update-status', { type: 'update-downloaded' });
      }
    });
  });

  autoUpdater.on('error', (error) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('electron-update-status', { type: 'error', error: error.message });
      }
    });
  });
}

function createWindow() {
  // Load custom icon if user set one
  const windowIconPath = process.platform === 'darwin'
    ? undefined
    : path.join(__dirname, 'icon', 'windows', 'icon.ico');
  const dockIconPath = path.join(__dirname, 'icon', 'icon.png');
  const windowIcon = windowIconPath && fs.existsSync(windowIconPath) ? windowIconPath : undefined;
  const dockIcon = fs.existsSync(dockIconPath) ? dockIconPath : undefined;
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    icon: windowIcon
  });

  splash.loadURL(`data:text/html;charset=utf-8,
    <body style="background: %23222; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; border-radius: 12px; margin-top: 15%;">
      <p style="color: %23888;">Loading your workspace...</p>
      <div style="width: 50px; height: 50px; border: 5px solid %23444; border-top-color: %233b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-top: 20px;"></div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    </body>
  `);

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: true,
    },
  });

  // Set Dock icon for macOS
  if (dockIcon && process.platform === 'darwin') {
    app.dock.setIcon(dockIcon);
  }

  // In development, load from Vite's dev server (except during automated testing)
  const isDev = (process.env.NODE_ENV === 'development' || !app.isPackaged) && process.env.CRM_TESTING !== 'true';
  
  if (isDev) {
    win.loadURL('http://localhost:5177');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  const showWindow = () => {
    if (!splash.isDestroyed()) splash.destroy();
    if (!win.isVisible()) win.show();
  };

  win.once('ready-to-show', showWindow);
  
  // Fallback: show window after 5 seconds or when load finishes
  setTimeout(showWindow, 5000);
  win.webContents.on('did-finish-load', showWindow);
}

app.whenReady().then(() => {
  // Each startup step is guarded so one failed subsystem can never block the
  // window from opening (1.5.1 shipped a startup crash caused by this).
  try { loadConfig(); } catch (e) { console.error('[Startup] loadConfig failed:', e); }
  try { setupAutoUpdater(); } catch (e) { console.error('[Startup] updater init failed:', e); }
  try {
    initDatabase();
  } catch (e) {
    console.error('[Startup] initDatabase failed:', e);
    dialog.showErrorBox('Startup Error', `Database failed to initialize: ${e.message}`);
  }
  runStartupAddressRepair().catch(err => console.error('[Startup Repair Error]', err));
  try {
    createWindow();
  } catch (e) {
    console.error('[Startup] createWindow failed:', e);
  }

  if (!isTesting) {
    startBackgroundSyncScheduler();
    // Check for updates every 6 hours (packaged builds only — dev has no feed)
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch(() => {});
      setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, 6 * 60 * 60 * 1000);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const failedLoginAttempts = new Map();
// Periodic cleanup of old entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [username, info] of failedLoginAttempts.entries()) {
    if (now - info.lastAttempt > LOCKOUT_DURATION_MS) {
      failedLoginAttempts.delete(username);
    }
  }
}, LOCKOUT_DURATION_MS);


function checkRateLimit(username) {
  const attempts = failedLoginAttempts.get(username);
  if (attempts && attempts.count >= LOCKOUT_THRESHOLD) {
    if (Date.now() - attempts.lastAttempt < LOCKOUT_DURATION_MS) {
      return { locked: true, remaining: Math.ceil((LOCKOUT_DURATION_MS - (Date.now() - attempts.lastAttempt)) / 60000) };
    }
    failedLoginAttempts.delete(username);
  }
  return { locked: false };
}

function recordFailedAttempt(username) {
  const attempts = failedLoginAttempts.get(username) || { count: 0, lastAttempt: 0 };
  attempts.count += 1;
  attempts.lastAttempt = Date.now();
  failedLoginAttempts.set(username, attempts);
}

function clearFailedAttempts(username) {
  failedLoginAttempts.delete(username);
}

// Auth Handlers
ipcMain.handle('signup', wrapHandler('signup', async (_, { username, password, referralCode, role }) => {
  const result = await dbHelpers.signup(username, password, referralCode, role);
  if (result.success) {
    const token = jwt.sign({ id: result.id, username, referral_code: referralCode, role }, JWT_SECRET, { expiresIn: '7d' });
    return { ...result, token, user: { id: result.id, username, referral_code: referralCode, role } };
  }
  return result;
}));

ipcMain.handle('login', wrapHandler('login', async (_, { username, password }) => {
  const rateLimit = checkRateLimit(username);
  if (rateLimit.locked) {
    return { success: false, error: `Account locked. Try again in ${rateLimit.remaining} minutes.` };
  }
  
  const result = await dbHelpers.login(username, password);
  if (result.success) {
    clearFailedAttempts(username);
    const token = jwt.sign({ 
      id: result.user.id, 
      username: result.user.username,
      referral_code: result.user.referral_code,
      role: result.user.role 
    }, JWT_SECRET, { expiresIn: '7d' });
    return { ...result, token };
  } else {
    recordFailedAttempt(username);
    return result;
  }
}));

ipcMain.handle('verify-token', wrapHandler('verify-token', async (_, token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { success: true, user: decoded };
  } catch (error) {
    return { success: false, error: 'Invalid or expired token' };
  }
}));

// Supabase Referral Handlers
ipcMain.handle('supabase-verify-referral', wrapHandler('supabase-verify-referral', async (_, code) => {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('name, role')
      .eq('referral_code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, error: 'Referral code not found' };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}));

ipcMain.handle('supabase-get-partners', wrapHandler('supabase-get-partners', async (_, { referralCode, role }) => {
  try {
    // Admin role gets all partners
    if (role === 'admin' || !referralCode) {
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { success: true, partners: data };
    }
    
    // Franchisee role gets themselves and direct/indirect downline
    const { data, error } = await supabase
      .from('referrals')
      .select('*');
    if (error) throw error;

    const descendants = [];
    const queue = [referralCode.toLowerCase()];
    const visited = new Set([referralCode.toLowerCase()]);
    
    while (queue.length > 0) {
      const current = queue.shift();
      const children = data.filter(r => r.parent_code && r.parent_code.toLowerCase() === current && !visited.has(r.referral_code.toLowerCase()));
      for (const child of children) {
        descendants.push(child);
        visited.add(child.referral_code.toLowerCase());
        queue.push(child.referral_code.toLowerCase());
      }
    }
    
    // Add the franchisee themselves to the beginning
    const self = data.find(r => r.referral_code.toLowerCase() === referralCode.toLowerCase());
    if (self) descendants.unshift(self);

    return { success: true, partners: descendants };
  } catch (e) {
    return { success: false, error: e.message };
  }
}));

ipcMain.handle('supabase-add-partner', wrapHandler('supabase-add-partner', async (_, partner) => {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .insert(partner)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        return { success: false, error: 'A referral partner with this referral code, email, or phone number already exists.' };
      }
      if (error.code === '23503' || error.message?.includes('violates foreign key constraint')) {
        return { success: false, error: 'The selected parent referral code does not exist in the system.' };
      }
      throw error;
    }
    return { success: true, partner: data };
  } catch (e) {
    if (e.code === '23505' || e.message?.includes('duplicate key') || e.message?.includes('unique constraint')) {
      return { success: false, error: 'A referral partner with this referral code, email, or phone number already exists.' };
    }
    if (e.code === '23503' || e.message?.includes('violates foreign key constraint')) {
      return { success: false, error: 'The selected parent referral code does not exist in the system.' };
    }
    return { success: false, error: e.message };
  }
}));

ipcMain.handle('supabase-update-partner', wrapHandler('supabase-update-partner', async (_, { id, partner }) => {
  try {
    // 1. Fetch current partner code to see if they are changing the code
    const { data: currentPartner, error: findError } = await supabase
      .from('referrals')
      .select('name, referral_code')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;

    if (currentPartner && partner.referral_code && currentPartner.referral_code !== partner.referral_code) {
      // 2. Check if any downline referrers reference the old referral_code
      const { data: children, error: checkError } = await supabase
        .from('referrals')
        .select('name, referral_code')
        .eq('parent_code', currentPartner.referral_code);

      if (checkError) throw checkError;

      if (children && children.length > 0) {
        const childNames = children.map(c => `${c.name} (${c.referral_code})`).slice(0, 3).join(', ');
        const suffix = children.length > 3 ? '...' : '';
        return {
          success: false,
          error: `Cannot update referral code for "${currentPartner.name}" because they have active downline referrers: ${childNames}${suffix}. Please reassign or delete their downline partners first.`
        };
      }
    }

    // 3. Perform update
    const { data, error } = await supabase
      .from('referrals')
      .update(partner)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23503' || error.message?.includes('violates foreign key constraint')) {
        if (error.message?.includes('referrals_parent_code_fkey') || error.details?.includes('referrals')) {
          return {
            success: false,
            error: 'Cannot update the referral code because other partners reference it as their parent. Please update or reassign their downline partners first.'
          };
        }
        return {
          success: false,
          error: 'Cannot update this partner because they are linked to existing orders or customers in the database.'
        };
      }
      throw error;
    }
    return { success: true, partner: data };
  } catch (e) {
    if (e.code === '23503' || e.message?.includes('violates foreign key constraint')) {
      if (e.message?.includes('referrals_parent_code_fkey') || e.details?.includes('referrals')) {
        return {
          success: false,
          error: 'Cannot update the referral code because other partners reference it as their parent. Please update or reassign their downline partners first.'
        };
      }
      return {
        success: false,
        error: 'Cannot update this partner because they are linked to existing orders or customers in the database.'
      };
    }
    return { success: false, error: e.message };
  }
}));

ipcMain.handle('supabase-delete-partner', wrapHandler('supabase-delete-partner', async (_, id) => {
  try {
    // 1. Fetch the referral code of the partner to be deleted
    const { data: partner, error: findError } = await supabase
      .from('referrals')
      .select('name, referral_code')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;

    if (partner && partner.referral_code) {
      // 2. Check if there are active downline partners referencing this referral_code as parent_code
      const { data: children, error: checkError } = await supabase
        .from('referrals')
        .select('name, referral_code')
        .eq('parent_code', partner.referral_code);

      if (checkError) throw checkError;

      if (children && children.length > 0) {
        const childNames = children.map(c => `${c.name} (${c.referral_code})`).slice(0, 3).join(', ');
        const suffix = children.length > 3 ? '...' : '';
        return {
          success: false,
          error: `Cannot delete partner "${partner.name}" because they have active downline referrers: ${childNames}${suffix}. Please reassign or delete their downline partners first.`
        };
      }
    }

    // 3. Perform delete
    const { error } = await supabase
      .from('referrals')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503' || error.message?.includes('violates foreign key constraint')) {
        if (error.message?.includes('referrals_parent_code_fkey') || error.details?.includes('referrals')) {
          return {
            success: false,
            error: `Cannot delete partner because they have active downline referrers. Please delete or reassign their downline partners first.`
          };
        }
        return {
          success: false,
          error: 'Cannot delete this partner because they are linked to existing orders or customers in the database.'
        };
      }
      throw error;
    }
    return { success: true };
  } catch (e) {
    if (e.code === '23503' || e.message?.includes('violates foreign key constraint')) {
      if (e.message?.includes('referrals_parent_code_fkey') || e.details?.includes('referrals')) {
        return {
          success: false,
          error: `Cannot delete partner because they have active downline referrers. Please delete or reassign their downline partners first.`
        };
      }
      return {
        success: false,
        error: 'Cannot delete this partner because they are linked to existing orders or customers in the database.'
      };
    }
    return { success: false, error: e.message };
  }
}));

// Local SQLite Referral fallback helpers (for sync cache purposes)
ipcMain.handle('add-partner', wrapHandler('add-partner', async (_, data) => {
  return await dbHelpers.addPartner(data);
}));

ipcMain.handle('update-partner', wrapHandler('update-partner', async (_, data) => {
  return await dbHelpers.updatePartner(data);
}));

ipcMain.handle('delete-partner', wrapHandler('delete-partner', async (_, id) => {
  return await dbHelpers.deletePartner(id);
}));

ipcMain.handle('get-partners', wrapHandler('get-partners', async () => {
  return await dbHelpers.getPartners();
}));

ipcMain.handle('add-product', wrapHandler('add-product', async (_, data) => {
  // Basic validation
  if (!data || !data.item_name || typeof data.mrp !== 'number') {
    return { success: false, error: 'Missing required product fields (item_name, mrp)' };
  }
  return await dbHelpers.addProduct(data);
}));

ipcMain.handle('add-batch', wrapHandler('add-batch', async (_, data) => {
  if (!data || !data.parent_id || !data.batch_id) {
    return { success: false, error: 'Missing required fields (parent_id, batch_id)' };
  }
  return await dbHelpers.addBatch(data);
}));

ipcMain.handle('get-products', wrapHandler('get-products', async () => {
  return await dbHelpers.getProducts();
}));


ipcMain.handle('update-product', wrapHandler('update-product', async (_, data) => {
  const result = await dbHelpers.updateProduct(data);
  if (result.success && data && data.id && data.stock !== undefined) {
    pushStockToShopify(data.id, data.stock).catch(err => console.error('Shopify stock update failed:', err));
  }
  return result;
}));

ipcMain.handle('delete-product', wrapHandler('delete-product', async (_, id) => {
  return await dbHelpers.deleteProduct(id);
}));

ipcMain.handle('create-order', wrapHandler('create-order', async (_, orderData, items) => {
  // Basic validation for order
  if (!orderData || !orderData.invoice_number || !orderData.bill_to_name) {
    return { success: false, error: 'Missing required order fields (invoice_number, bill_to_name)' };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'Order must contain at least one item' };
  }
  const result = await dbHelpers.createOrder(orderData, items);
  if (result.success && items) {
    for (const item of items) {
      if (item.product_id) {
        pushStockToShopify(item.product_id).catch(err => console.error(err));
      }
    }
  }
  return result;
}));

ipcMain.handle('get-latest-invoice-number', wrapHandler('get-latest-invoice-number', async () => {
  return await dbHelpers.getLatestInvoiceNumber();
}));

ipcMain.handle('get-orders', wrapHandler('get-orders', async () => {
  return await dbHelpers.getOrders();
}));

ipcMain.handle('get-order-items', wrapHandler('get-order-items', async (_, orderId) => {
  const orderRes = await dbHelpers.getOrder(orderId);
  if (orderRes.success && orderRes.order?.shopify_order_id) {
    await refreshShopifyOrderItemState(orderRes.order.shopify_order_id, orderId).catch((err) => {
      console.error('Failed to refresh Shopify item state before reading order items:', err);
    });
  }
  return await dbHelpers.getOrderItems(orderId);
}));

ipcMain.handle('refresh-shopify-order-item-state', wrapHandler('refresh-shopify-order-item-state', async (_, { shopifyOrderId, localOrderId }) => {
  return await refreshShopifyOrderItemState(shopifyOrderId, localOrderId);
}));

function formatShopifyError(error) {
  if (!error) return 'Unknown Shopify error';
  if (typeof error === 'string') return error;
  if (error.errors) {
    if (typeof error.errors === 'string') {
      return error.errors;
    }
    if (typeof error.errors === 'object') {
      const messages = [];
      for (const [key, val] of Object.entries(error.errors)) {
        if (Array.isArray(val)) {
          messages.push(`${key}: ${val.join(', ')}`);
        } else {
          messages.push(`${key}: ${JSON.stringify(val)}`);
        }
      }
      return messages.join('; ');
    }
  }
  if (error.error) {
    if (typeof error.error === 'string') return error.error;
    return JSON.stringify(error.error);
  }
  if (error.message) {
    return error.message;
  }
  return JSON.stringify(error);
}

function parseAddressString(addressStr) {
  const result = { address1: '', address2: '', city: '', province: '', zip: '', country: '' };
  if (!addressStr) return result;

  const parts = addressStr.split(',').map(p => p.trim());

  const zipIndex = parts.findIndex(p => /^\d{5,6}$/.test(p));
  if (zipIndex !== -1) {
    result.zip = parts[zipIndex];
    parts.splice(zipIndex, 1);
  }

  if (parts.length >= 4) {
    result.country = parts[parts.length - 1] || '';
    result.province = parts[parts.length - 2] || '';
    result.city = parts[parts.length - 3] || '';
    result.address1 = parts.slice(0, parts.length - 3).filter(Boolean).join(', ');
  } else if (parts.length === 3) {
    result.province = parts[2] || '';
    result.city = parts[1] || '';
    result.address1 = parts[0] || '';
  } else if (parts.length === 2) {
    result.city = parts[1] || '';
    result.address1 = parts[0] || '';
  } else {
    result.address1 = parts[0] || '';
  }

  return result;
}

ipcMain.handle('update-order', wrapHandler('update-order', async (_, orderId, orderData, items) => {
  if (!orderId) {
    return { success: false, error: 'Missing orderId' };
  }
  if (!orderData || !orderData.invoice_number) {
    return { success: false, error: 'Missing required order fields' };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'Order must contain at least one item' };
  }

  // Fetch current order + old items before any changes (for rollback & Shopify check)
  const oldItemsRes = await dbHelpers.getOrderItems(orderId);
  const orderRes = await dbHelpers.getOrder(orderId);

  // STEP 1: Push changes to Shopify FIRST (if it is a Shopify order)
  // If this fails, local DB is NEVER touched = atomic rollback
  if (orderRes.success && orderRes.order && orderRes.order.shopify_order_id) {
    const shopifyOrderId = orderRes.order.shopify_order_id;
    console.log(`Syncing order update to Shopify for order ${shopifyOrderId}...`);

    // 1a. Update order metadata (address, tags, note, etc.)
    const parsedShipping = parseAddressString(orderData.shipping_address || orderData.bill_to_address || '');
    const parsedBilling = parseAddressString(orderData.bill_to_address || '');

    const shopifyOrderPayload = {
      email: orderData.email || undefined,
      phone: orderData.bill_to_phone || '',
      shipping_address: {
        name: orderData.shipping_name || orderData.bill_to_name || '',
        address1: parsedShipping.address1 || '',
        address2: orderData.shipping_address2 || '',
        city: parsedShipping.city || '',
        province: parsedShipping.province || '',
        zip: parsedShipping.zip || '',
        country: parsedShipping.country || '',
        phone: orderData.shipping_phone || orderData.bill_to_phone || ''
      },
      billing_address: {
        name: orderData.bill_to_name || '',
        address1: parsedBilling.address1 || '',
        address2: orderData.billing_address2 || '',
        city: parsedBilling.city || '',
        province: parsedBilling.province || '',
        zip: parsedBilling.zip || '',
        country: parsedBilling.country || '',
        phone: orderData.bill_to_phone || ''
      },
      tags: orderData.tags || undefined,
      note: orderData.shopify_order_note || undefined,
      financial_status: orderData.shopify_financial_status || undefined
    };

    const syncRes = await updateShopifyOrder(shopifyOrderId, shopifyOrderPayload);
    if (!syncRes.success) {
      const errMsg = formatShopifyError(syncRes.error);
      console.error(`Failed to sync order details to Shopify:`, errMsg);
      return { success: false, error: `Shopify Order details sync failed: ${errMsg}` };
    }
    console.log(`Successfully synced order details to Shopify for ID: ${shopifyOrderId}`);

    // 1b. Sync line item quantities
    const itemsSyncRes = await syncOrderItemsToShopify(shopifyOrderId, items);
    if (!itemsSyncRes.success) {
      console.error(`Failed to sync order items to Shopify:`, itemsSyncRes.error);
      return { success: false, error: `Shopify Order items sync failed: ${itemsSyncRes.error}` };
    }
    console.log(`Successfully synced order items to Shopify for ID: ${shopifyOrderId}`);

    // 1c. Mark as paid on Shopify if applicable
    const isPaid = (orderData.final_amount || 0) <= 0;
    const previouslyPaid = orderRes.order.shopify_financial_status === 'paid';
    if (isPaid && !previouslyPaid) {
      console.log(`Recording capture transaction on Shopify to mark order ${shopifyOrderId} as paid...`);
      const payRes = await createShopifyTransaction(shopifyOrderId, orderData.total_amount);
      if (!payRes.success) {
        const errMsg = formatShopifyError(payRes.error);
        console.error(`Failed to mark Shopify order ${shopifyOrderId} as paid:`, errMsg);
        return { success: false, error: `Shopify transaction failed: ${errMsg}` };
      }
      console.log(`Successfully marked Shopify order ${shopifyOrderId} as paid.`);
    }

    // 1d. Create fulfillment on Shopify if status changed to fulfilled
    const newFulfillmentStatus = orderData.shopify_fulfillment_status;
    const oldFulfillmentStatus = orderRes.order.shopify_fulfillment_status;
    if (newFulfillmentStatus === 'fulfilled' && oldFulfillmentStatus !== 'fulfilled') {
      console.log(`Creating fulfillment on Shopify for order ${shopifyOrderId}...`);
      const fulfillRes = await createShopifyFulfillment(shopifyOrderId);
      if (!fulfillRes.success) {
        const errMsg = formatShopifyError(fulfillRes.error);
        console.error(`Failed to create Shopify fulfillment for order ${shopifyOrderId}:`, errMsg);
        return { success: false, error: `Shopify fulfillment failed: ${errMsg}` };
      }
      if (fulfillRes.note) {
        console.log(`Fulfillment skipped for order ${shopifyOrderId}: ${fulfillRes.note}`);
      } else {
        console.log(`Successfully created fulfillment on Shopify for order ${shopifyOrderId}.`);
      }
    }
  }

  // STEP 2: Only now update the local database (Shopify sync succeeded or not a Shopify order)
  const result = await dbHelpers.updateOrder(orderId, orderData, items);
  if (result.success) {
    // Fire-and-forget stock push to Shopify
    const productIds = new Set();
    if (oldItemsRes && oldItemsRes.success && Array.isArray(oldItemsRes.items)) {
      oldItemsRes.items.forEach(i => { if (i.product_id) productIds.add(i.product_id); });
    }
    if (items) items.forEach(i => { if (i.product_id) productIds.add(i.product_id); });
    for (const prodId of productIds) {
      pushStockToShopify(prodId).catch(err => console.error(err));
    }
  }
  return result;
}));

ipcMain.handle('backup-database', async () => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Backup Database',
    defaultPath: `ref_crm_backup_${new Date().toISOString().split('T')[0]}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  });

  if (filePath) {
    try {
      const dbPath = getDatabasePath();
      await fs.promises.copyFile(dbPath, filePath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'Cancelled' };
});

ipcMain.handle('restore-database', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Restore Database',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile']
  });

  if (filePaths && filePaths.length > 0) {
    try {
      const dbPath = getDatabasePath();
      closeDatabase();
      await fs.promises.copyFile(filePaths[0], dbPath);
      app.relaunch();
      app.exit();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'Cancelled' };
});

ipcMain.handle('get-stock-history', wrapHandler('get-stock-history', async (_, productId) => {
  return await dbHelpers.getStockHistory(productId);
}));

ipcMain.handle('get-customers', wrapHandler('get-customers', async (_, role, referralCode) => {
  return await dbHelpers.getCustomers(role, referralCode);
}));

ipcMain.handle('get-customers-with-stats', wrapHandler('get-customers-with-stats', async (_, role, referralCode) => {
  return await dbHelpers.getCustomersWithStats(role, referralCode);
}));

ipcMain.handle('add-customer', wrapHandler('add-customer', async (_, data) => {
  return await dbHelpers.addCustomer(data);
}));
ipcMain.handle('update-customer', wrapHandler('update-customer', async (_, id, data) => {
  return await dbHelpers.updateCustomer(id, data);
}));
ipcMain.handle('delete-customer', wrapHandler('delete-customer', async (_, id) => {
  return await dbHelpers.deleteCustomer(id);
}));
ipcMain.handle('cancel-order', wrapHandler('cancel-order', async (_, id) => {
  return await dbHelpers.cancelOrder(id);
}));

ipcMain.handle('update-stock', wrapHandler('update-stock', async (_, id, newStock, change) => {
  const result = await dbHelpers.updateStock(id, newStock, change);
  if (result.success) {
    pushStockToShopify(id, newStock).catch(err => console.error('Shopify stock update failed:', err));
  }
  return result;
}));

ipcMain.handle('delete-order', wrapHandler('delete-order', async (_, id) => {
  const itemsRes = await dbHelpers.getOrderItems(id);
  const result = await dbHelpers.deleteOrder(id);
  
  if (result.success && itemsRes.success && Array.isArray(itemsRes.items)) {
    // Attempt to delete from Shopify if it's a synced order
    if (result.shopifyOrderId) {
      deleteShopifyOrder(result.shopifyOrderId).catch(err => console.error("Failed to delete from Shopify:", err));
    }

    for (const item of itemsRes.items) {
      if (item.product_id) {
        pushStockToShopify(item.product_id).catch(err => console.error(err));
      }
    }
  }
  return result;
}));

ipcMain.handle('get-customer-orders', wrapHandler('get-customer-orders', async (_, customerName) => {
  return await dbHelpers.getCustomerOrders(customerName);
}));

ipcMain.handle('get-analytics', wrapHandler('get-analytics', async (_, startDate, endDate, referralCode, role) => {
  return await dbHelpers.getAnalytics(startDate, endDate, referralCode, role);
}));
ipcMain.handle('get-templates', wrapHandler('get-templates', async () => {
  return dbHelpers.getTemplates();
}));

ipcMain.handle('save-template', wrapHandler('save-template', async (_, { name, data, previewImage, id }) => {
  return dbHelpers.saveTemplate(name, data, previewImage, id);
}));

ipcMain.handle('delete-template', async (_, id) => {
  return dbHelpers.deleteTemplate(id);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-electron-update', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      success: true,
      updateAvailable: result && result.updateInfo ? result.updateInfo.version !== app.getVersion() : false,
      info: result
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-electron-update', async () => {
  try {
    autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-electron-update', () => {
  setImmediate(() => {
    autoUpdater.quitAndInstall();
  });
  return { success: true };
});

// App Icon Handlers

// ----- Shopify API Handlers (direct remote calls) -----
const shopify = require('./database/shopify');

ipcMain.handle('shopify-get-products', async () => {
  try {
    const products = await shopify.fetchProducts();
    return { success: true, products };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify get products error:', errMsg);
    return { success: false, error: errMsg };
  }
});

ipcMain.handle('shopify-add-product', async (_, product) => {
  try {
    const created = await shopify.shopifyAddProduct(product);
    return { success: true, product: created };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify add product error:', errMsg);
    return { success: false, error: errMsg };
  }
});

ipcMain.handle('shopify-update-product', async (_, { id, product }) => {
  try {
    const updated = await shopify.shopifyUpdateProduct(id, product);
    return { success: true, product: updated };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify update product error:', errMsg);
    return { success: false, error: errMsg };
  }
});

ipcMain.handle('shopify-delete-product', async (_, productId) => {
  try {
    const res = await shopify.shopifyDeleteProduct(productId);
    return { success: true };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify delete product error:', errMsg);
    return { success: false, error: errMsg };
  }
});

ipcMain.handle('shopify-get-orders', async () => {
  try {
    const orders = await shopify.fetchOrders();
    return { success: true, orders };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify get orders error:', errMsg);
    return { success: false, error: errMsg };
  }
});

ipcMain.handle('shopify-create-order', async (_, order) => {
  try {
    const created = await shopify.shopifyCreateOrder(order);
    return { success: true, order: created };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify create order error:', errMsg);
    return { success: false, error: errMsg };
  }
});

ipcMain.handle('shopify-update-order', async (_, { id, order }) => {
  try {
    const updated = await shopify.shopifyUpdateOrder(id, order);
    return { success: true, order: updated };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify update order error:', errMsg);
    return { success: false, error: errMsg };
  }
});

ipcMain.handle('shopify-delete-order', async (_, orderId) => {
  try {
    const res = await shopify.shopifyDeleteOrder(orderId);
    return { success: true };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify delete order error:', errMsg);
    return { success: false, error: errMsg };
  }
});

ipcMain.handle('shopify-set-inventory', async (_, { inventoryItemId, locationId, available }) => {
  try {
    const level = await shopify.setInventoryLevel(inventoryItemId, locationId, available);
    return { success: true, level };
  } catch (e) {
    const errMsg = formatShopifyError(e.response && e.response.data ? e.response.data : e.message);
    console.error('Shopify set inventory error:', errMsg);
    return { success: false, error: errMsg };
  }
});

// ---- End Shopify API Handlers ----

// App Icon Handlers
ipcMain.handle('set-app-icon', async (_, { dataUrl }) => {
  try {
    const iconPath = path.join(app.getPath('userData'), 'custom_icon.png');
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    await fs.promises.writeFile(iconPath, Buffer.from(base64, 'base64'));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-app-icon', async () => {
  try {
    const iconPath = path.join(app.getPath('userData'), 'custom_icon.png');
    if (fs.existsSync(iconPath)) {
      const data = await fs.promises.readFile(iconPath, { encoding: 'base64' });
      return { success: true, dataUrl: `data:image/png;base64,${data}` };
    }
    return { success: false };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Shopify Sync & Sandbox Handlers
ipcMain.handle('shopify-get-settings', wrapHandler('shopify-get-settings', async () => {
  return await dbHelpers.getShopifySettings();
}));

ipcMain.handle('shopify-save-settings', wrapHandler('shopify-save-settings', async (_, { domain, token, clientId, clientSecret, tokenExpiresAt }) => {
  return await dbHelpers.saveShopifySettings(domain, token, clientId, clientSecret, tokenExpiresAt);
}));

ipcMain.handle('shopify-test-connection', wrapHandler('shopify-test-connection', async (_, { domain, token, clientId, clientSecret }) => {
  return await testShopifyConnection(domain, token, clientId, clientSecret);
}));

ipcMain.handle('shopify-generate-token', wrapHandler('shopify-generate-token', async (_, { domain, clientId, clientSecret }) => {
  return await generateShopifyToken(domain, clientId, clientSecret);
}));

ipcMain.handle('shopify-run-rest', wrapHandler('shopify-run-rest', async (_, endpoint) => {
  const settings = await dbHelpers.getShopifySettings();
  if (!settings.success || !settings.domain || !settings.token) {
    return { success: false, error: 'Shopify domain or token not configured' };
  }
  return await runShopifyREST(settings.domain, settings.token, endpoint);
}));

ipcMain.handle('shopify-run-graphql', wrapHandler('shopify-run-graphql', async (_, query) => {
  const settings = await dbHelpers.getShopifySettings();
  if (!settings.success || !settings.domain || !settings.token) {
    return { success: false, error: 'Shopify domain or token not configured' };
  }
  return await runShopifyGraphQL(settings.domain, settings.token, query);
}));

ipcMain.handle('shopify-sync-now', wrapHandler('shopify-sync-now', async (event, scope) => {
  const settings = await dbHelpers.getShopifySettings();
  if (!settings.success || !settings.domain || !settings.token) {
    return { success: false, error: 'Shopify domain or token not configured' };
  }
  
  const webContents = event.sender;
  const logger = (msg, type = 'info') => {
    try {
      webContents.send('shopify-sync-log', { message: msg, type });
    } catch (e) {
      // Send failed if sender window is closed
    }
    console.log(`[Shopify Sync] ${msg}`);
  };

  try {
    const result = await syncShopifyNow(scope, logger);
    if (result.success) {
      const win = BrowserWindow.fromWebContents(webContents);
      if (win && !win.isDestroyed()) {
        win.webContents.send('shopify-sync-completed', result);
      }
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}));

ipcMain.handle('shopify-reset-sync', wrapHandler('shopify-reset-sync', async () => {
  return await resetShopifySyncState();
}));

// Background Shopify Sync Scheduler (runs every 10 minutes)
let isBackgroundSyncing = false;
let backgroundSyncInterval = null;

async function runBackgroundShopifySync() {
  if (isBackgroundSyncing) return;
  
  const settings = await dbHelpers.getShopifySettings();
  if (!settings.success || !settings.domain || !settings.token) {
    console.log('[Background Shopify Sync] Sync skipped: Shopify is not configured.');
    return;
  }

  isBackgroundSyncing = true;
  console.log('[Background Shopify Sync] Starting automatic sync...');
  
  const windows = BrowserWindow.getAllWindows();
  const logger = (msg, type = 'info') => {
    windows.forEach(win => {
      try {
        if (!win.isDestroyed() && win.webContents) {
          win.webContents.send('shopify-sync-log', { message: msg, type });
        }
      } catch (e) {
        // Ignore
      }
    });
    console.log(`[Background Shopify Sync] ${msg}`);
  };

  try {
    const result = await syncShopifyNow('all', logger);
    if (result.success) {
      console.log('[Background Shopify Sync] Automatic sync completed successfully.');
      windows.forEach(win => {
        try {
          if (!win.isDestroyed() && win.webContents) {
            win.webContents.send('shopify-sync-completed', result);
          }
        } catch (e) {
          // Ignore
        }
      });
    } else {
      console.error('[Background Shopify Sync] Automatic sync failed:', result.error);
    }
  } catch (err) {
    console.error('[Background Shopify Sync] Error during automatic sync:', err.message);
  } finally {
    isBackgroundSyncing = false;
  }
}

function startBackgroundSyncScheduler() {
  // Initial background sync after 15 seconds to let the application load fully
  setTimeout(runBackgroundShopifySync, 15000);
  
  // Schedule sync every 10 minutes (10 * 60 * 1000 ms = 600,000 ms)
  backgroundSyncInterval = setInterval(runBackgroundShopifySync, 10 * 60 * 1000);
}

async function runStartupAddressRepair() {
  try {
    const { getDb } = require('./database/db');
    const db = getDb();
    if (!db) return;

    // Check if there are any Shopify orders that need repair
    const unrepaired = db.prepare(`
      SELECT id, invoice_number, shopify_order_id 
      FROM orders 
      WHERE sync_source = 'shopify' 
        AND shopify_order_id IS NOT NULL 
        AND (billing_address2 IS NULL OR billing_address2 = '')
    `).all();

    if (unrepaired.length === 0) return;

    // Get credentials
    const domainRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_domain'").get();
    const tokenRow = db.prepare("SELECT value FROM shopify_sync_metadata WHERE key = 'shopify_token'").get();

    if (!domainRow || !tokenRow || !domainRow.value || !tokenRow.value) return;

    const domain = domainRow.value.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const token = tokenRow.value;

    console.log(`[Startup Repair] Found ${unrepaired.length} unrepaired Shopify orders. Repairing in background...`);

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

          db.prepare(`
            UPDATE orders SET
              bill_to_address = ?,
              billing_address2 = ?,
              shipping_address = ?,
              shipping_address2 = ?
            WHERE id = ?
          `).run(billToAddress, billingAddress2, shippingAddress, shippingAddress2, order.id);
          console.log(`[Startup Repair] Successfully repaired Order ${order.invoice_number}`);
        }
      } catch (err) {
        console.error(`[Startup Repair] Failed to repair Order ${order.invoice_number}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Startup Repair] Error during address repair check:', err.message);
  }
}
