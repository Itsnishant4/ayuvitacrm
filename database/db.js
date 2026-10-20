const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const bcrypt = require('bcryptjs');

require('dotenv').config();

let db;

function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'referral_crm.db');

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create referrals and orders tables if they don't exist (from previous plan)
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT NOT NULL,
      referral_code TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referral_id INTEGER,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_date DATE NOT NULL,
      bill_to_name TEXT NOT NULL,
      bill_to_address TEXT,
      bill_to_phone TEXT,
      shipping_charges REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      received_amount REAL DEFAULT 0,
      final_amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      order_json TEXT,
      FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity_string TEXT NOT NULL,
      unit TEXT,
      size TEXT,
      batch_id TEXT,
      hsn_sac TEXT,
      price_per_item REAL,
      mrp REAL NOT NULL,
      gst_rate REAL NOT NULL,
      total REAL,
      total_discount REAL,
      shopify_current_quantity INTEGER,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS products (
      shopify_variant_id TEXT,
      shopify_location_id TEXT,
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      hsn_sac TEXT,
      batch_id TEXT,
      mrp REAL,
      size TEXT,
      stock INTEGER,
      unit TEXT,
      gst_rate REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      product_json TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      change_amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      address TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Add gst_rate to products if it doesn't exist
    const prodCols = db.prepare("PRAGMA table_info(products)").all();
    const prodColNames = prodCols.map(c => c.name);
    if (!prodColNames.includes('shopify_variant_id')) db.exec("ALTER TABLE products ADD COLUMN shopify_variant_id TEXT");
    if (!prodColNames.includes('shopify_location_id')) db.exec("ALTER TABLE products ADD COLUMN shopify_location_id TEXT");
  const productsTableInfo = db.prepare("PRAGMA table_info(products)").all();
  const hasGstRate = productsTableInfo.some(column => column.name === 'gst_rate');
  if (!hasGstRate) {
    try {
      db.exec("ALTER TABLE products ADD COLUMN gst_rate REAL DEFAULT 0");
    } catch (e) {
      console.error("Migration error: Failed to add gst_rate column", e);
    }
  }

  // Migration: Rename quantity to stock if it exists

// Add product_json column if missing
const prodInfo = db.prepare("PRAGMA table_info(products)").all();
const prodNames = prodInfo.map(c => c.name);
if (!prodNames.includes('product_json')) {
  try { db.exec("ALTER TABLE products ADD COLUMN product_json TEXT"); }
  catch (e) { console.error('Migration error adding product_json', e); }
}

  const hasQuantity = productsTableInfo.some(column => column.name === 'quantity');
  const hasStock = productsTableInfo.some(column => column.name === 'stock');
  if (hasQuantity && !hasStock) {
    try {
      db.exec("ALTER TABLE products RENAME COLUMN quantity TO stock");
    } catch (e) {
      console.error("Migration error: Failed to rename quantity to stock", e);
    }
  }

  // Migration: Handle orders table transition
  const ordersTableInfo = db.prepare("PRAGMA table_info(orders)").all();
  const hasOldColumns = ordersTableInfo.some(column => column.name === 'order_name');
  
  if (hasOldColumns) {
    // NOTE: Previously this block DROPPED the entire orders table, causing data loss.
    // Updated to perform a safe migration: add missing columns without dropping data.
    try {
      // Example: if a new column is needed, use ALTER TABLE. Here we just log.
      console.log('Schema migration: detected legacy columns, performing safe upgrade (no data loss).');
      // Add any required columns here using ALTER TABLE if needed.
      // Ensure we have a column to store the raw Shopify order JSON
      const orderInfo = db.prepare('PRAGMA table_info(orders)').all();
      const orderNames = orderInfo.map(c => c.name);
      if (!orderNames.includes('order_json')) {
        try { db.exec('ALTER TABLE orders ADD COLUMN order_json TEXT'); }
        catch (e) { console.error('Migration error adding order_json', e); }
      }
    } catch (e) {
      console.error('Migration error during safe upgrade', e);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referral_id INTEGER,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_date DATE NOT NULL,
      bill_to_name TEXT NOT NULL,
      bill_to_address TEXT,
      bill_to_phone TEXT,
      shipping_charges REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      received_amount REAL DEFAULT 0,
      final_amount REAL NOT NULL,
      apply_gst INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity_string TEXT NOT NULL,
      mrp REAL NOT NULL,
      gst_rate REAL NOT NULL,
      total REAL,
      total_discount REAL,
      shopify_current_quantity INTEGER,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoice_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      data TEXT NOT NULL, -- JSON string
      preview_image TEXT, -- Optional base64 or path
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Self-healing Migrations
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shopify_sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const prodCols = db.prepare("PRAGMA table_info(products)").all();
    const prodColNames = prodCols.map(c => c.name);
    if (!prodColNames.includes('batch_id')) db.exec("ALTER TABLE products ADD COLUMN batch_id TEXT");
    if (!prodColNames.includes('mfg_date')) db.exec("ALTER TABLE products ADD COLUMN mfg_date TEXT");
    if (!prodColNames.includes('shopify_product_id')) db.exec("ALTER TABLE products ADD COLUMN shopify_product_id TEXT");
    if (!prodColNames.includes('shopify_variant_id')) db.exec("ALTER TABLE products ADD COLUMN shopify_variant_id TEXT");
    if (!prodColNames.includes('shopify_inventory_item_id')) db.exec("ALTER TABLE products ADD COLUMN shopify_inventory_item_id TEXT");
    if (!prodColNames.includes('last_shopify_sync')) db.exec("ALTER TABLE products ADD COLUMN last_shopify_sync DATETIME");
    
    const itemsCols = db.prepare("PRAGMA table_info(order_items)").all();
    const itemsColNames = itemsCols.map(c => c.name);
    if (!itemsColNames.includes('unit')) db.exec("ALTER TABLE order_items ADD COLUMN unit TEXT");
    if (!itemsColNames.includes('size')) db.exec("ALTER TABLE order_items ADD COLUMN size TEXT");
    if (!itemsColNames.includes('batch_id')) db.exec("ALTER TABLE order_items ADD COLUMN batch_id TEXT");
    if (!itemsColNames.includes('hsn_sac')) db.exec("ALTER TABLE order_items ADD COLUMN hsn_sac TEXT");
    if (!itemsColNames.includes('mfg_date')) db.exec("ALTER TABLE order_items ADD COLUMN mfg_date TEXT");
    if (!itemsColNames.includes('price_per_item')) db.exec("ALTER TABLE order_items ADD COLUMN price_per_item REAL");
    if (!itemsColNames.includes('total')) db.exec("ALTER TABLE order_items ADD COLUMN total REAL");
    if (!itemsColNames.includes('total_discount')) db.exec("ALTER TABLE order_items ADD COLUMN total_discount REAL");
    if (!itemsColNames.includes('shopify_current_quantity')) db.exec("ALTER TABLE order_items ADD COLUMN shopify_current_quantity INTEGER");
    
    const orderCols = db.prepare("PRAGMA table_info(orders)").all();
    const orderColNames = orderCols.map(c => c.name);
    if (!orderColNames.includes('apply_gst')) db.exec("ALTER TABLE orders ADD COLUMN apply_gst INTEGER DEFAULT 1");
    if (!orderColNames.includes('shopify_order_id')) db.exec("ALTER TABLE orders ADD COLUMN shopify_order_id TEXT");
    if (!orderColNames.includes('shopify_order_number')) db.exec("ALTER TABLE orders ADD COLUMN shopify_order_number TEXT");
    if (!orderColNames.includes('shopify_financial_status')) db.exec("ALTER TABLE orders ADD COLUMN shopify_financial_status TEXT");
    if (!orderColNames.includes('shopify_fulfillment_status')) db.exec("ALTER TABLE orders ADD COLUMN shopify_fulfillment_status TEXT");
    if (!orderColNames.includes('shopify_order_note')) db.exec("ALTER TABLE orders ADD COLUMN shopify_order_note TEXT");
    if (!orderColNames.includes('sync_source')) db.exec("ALTER TABLE orders ADD COLUMN sync_source TEXT DEFAULT 'local'");
    if (!orderColNames.includes('last_shopify_sync')) db.exec("ALTER TABLE orders ADD COLUMN last_shopify_sync DATETIME");
    if (!orderColNames.includes('email')) db.exec("ALTER TABLE orders ADD COLUMN email TEXT");
    if (!orderColNames.includes('shipping_name')) db.exec("ALTER TABLE orders ADD COLUMN shipping_name TEXT");
    if (!orderColNames.includes('shipping_address')) db.exec("ALTER TABLE orders ADD COLUMN shipping_address TEXT");
    if (!orderColNames.includes('shipping_phone')) db.exec("ALTER TABLE orders ADD COLUMN shipping_phone TEXT");
    if (!orderColNames.includes('tags')) db.exec("ALTER TABLE orders ADD COLUMN tags TEXT");
    if (!orderColNames.includes('shipping_carrier')) db.exec("ALTER TABLE orders ADD COLUMN shipping_carrier TEXT");
    if (!orderColNames.includes('delivery_status')) db.exec("ALTER TABLE orders ADD COLUMN delivery_status TEXT DEFAULT 'pending'");
    if (!orderColNames.includes('status')) db.exec("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'active'");
    if (!orderColNames.includes('billing_address2')) db.exec("ALTER TABLE orders ADD COLUMN billing_address2 TEXT");
    if (!orderColNames.includes('shipping_address2')) db.exec("ALTER TABLE orders ADD COLUMN shipping_address2 TEXT");
    if (!orderColNames.includes('shopify_discount_codes')) db.exec("ALTER TABLE orders ADD COLUMN shopify_discount_codes TEXT");
    if (!orderColNames.includes('shopify_discount_applications')) db.exec("ALTER TABLE orders ADD COLUMN shopify_discount_applications TEXT");
    if (!orderColNames.includes('shopify_total_discounts')) db.exec("ALTER TABLE orders ADD COLUMN shopify_total_discounts REAL DEFAULT 0");
    if (!orderColNames.includes('shopify_line_item_discount')) db.exec("ALTER TABLE orders ADD COLUMN shopify_line_item_discount REAL DEFAULT 0");
    if (!orderColNames.includes('shopify_shipping_discount')) db.exec("ALTER TABLE orders ADD COLUMN shopify_shipping_discount REAL DEFAULT 0");

    const customerCols = db.prepare("PRAGMA table_info(customers)").all();
    const customerColNames = customerCols.map(c => c.name);
    if (!customerColNames.includes('shopify_customer_id')) db.exec("ALTER TABLE customers ADD COLUMN shopify_customer_id TEXT");
    if (!customerColNames.includes('email')) db.exec("ALTER TABLE customers ADD COLUMN email TEXT");
    if (!customerColNames.includes('referral_id')) db.exec("ALTER TABLE customers ADD COLUMN referral_id INTEGER");
    if (!customerColNames.includes('referral_code')) db.exec("ALTER TABLE customers ADD COLUMN referral_code TEXT");
    if (!customerColNames.includes('last_shopify_sync')) db.exec("ALTER TABLE customers ADD COLUMN last_shopify_sync DATETIME");

    // Backfill referral_code for existing customers based on their orders
    try {
      db.exec(`
        UPDATE customers 
        SET referral_code = (
          SELECT referrals.referral_code 
          FROM orders 
          JOIN referrals ON orders.referral_id = referrals.id
          WHERE orders.bill_to_name = customers.name
          LIMIT 1
        )
        WHERE referral_code IS NULL 
          AND EXISTS (
            SELECT 1 
            FROM orders 
            WHERE orders.bill_to_name = customers.name
          )
      `);
    } catch (e) {
      console.error("Migration error backfilling customers.referral_code:", e.message);
    }

    // Migrations for referrals table
    const refCols = db.prepare("PRAGMA table_info(referrals)").all();
    const refColNames = refCols.map(c => c.name);
    if (!refColNames.includes('parent_code')) db.exec("ALTER TABLE referrals ADD COLUMN parent_code TEXT");
    if (!refColNames.includes('role')) db.exec("ALTER TABLE referrals ADD COLUMN role TEXT DEFAULT 'retailer'");
    if (!refColNames.includes('region')) db.exec("ALTER TABLE referrals ADD COLUMN region TEXT");

    // Seed Shopify settings from .env on first run only — values edited via the app UI always win
    const shopifyEnv = {
      shopify_domain: process.env.SHOPIFY_DOMAIN || process.env.SHOPIFY_STORE_URL || '',
      shopify_token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '',
      shopify_client_id: process.env.SHOPIFY_CLIENT_ID || '',
      shopify_client_secret: process.env.SHOPIFY_CLIENT_SECRET || '',
      shopify_token_expires_at: process.env.SHOPIFY_TOKEN_EXPIRES_AT || '',
    };
    for (const [key, value] of Object.entries(shopifyEnv)) {
      if (!value) continue;
      const row = db.prepare("SELECT key FROM shopify_sync_metadata WHERE key = ?").get(key);
      if (!row) {
        db.prepare("INSERT INTO shopify_sync_metadata (key, value) VALUES (?, ?)").run(key, value);
        console.log(`Seeded Shopify setting '${key}' from .env`);
      }
    }

    // Migration: rename franchisee role to state_franchisee in referrals and users
    try {
      db.exec("UPDATE referrals SET role = 'state_franchisee' WHERE role = 'franchisee'");
      db.exec("UPDATE referrals SET role = 'state_franchisee' WHERE role IS NULL OR role = ''");
      db.exec("UPDATE users SET role = 'state_franchisee' WHERE role = 'franchisee'");
    } catch (e) {
      console.error("Migration error renaming franchisee role:", e.message);
    }

    // Migrations for local users table
    const usersCols = db.prepare("PRAGMA table_info(users)").all();
    const usersColNames = usersCols.map(c => c.name);
    if (!usersColNames.includes('referral_code')) db.exec("ALTER TABLE users ADD COLUMN referral_code TEXT");
    if (!usersColNames.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'state_franchisee'");

    // Migrations for invoice_templates table
    const templateCols = db.prepare("PRAGMA table_info(invoice_templates)").all();
    const templateColNames = templateCols.map(c => c.name);
    if (!templateColNames.includes('is_default')) {
      db.exec("ALTER TABLE invoice_templates ADD COLUMN is_default INTEGER DEFAULT 0");
    }

    // Seed default template if not present
    const defaultTemplateName = "Default Elegant Template";
    const existingDefault = db.prepare("SELECT id FROM invoice_templates WHERE name = ?").get(defaultTemplateName);
    if (!existingDefault) {
      const pathsToCheck = [
        path.join(app.getAppPath(), 'invoice-template-1779686239784.json'),
        path.join(__dirname, '..', 'invoice-template-1779686239784.json'),
        path.join(__dirname, 'invoice-template-1779686239784.json'),
        path.join(process.resourcesPath || '', 'invoice-template-1779686239784.json')
      ];
      let foundPath = null;
      for (const p of pathsToCheck) {
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }
      if (foundPath) {
        try {
          const fileContent = fs.readFileSync(foundPath, 'utf8');
          const parsed = JSON.parse(fileContent);
          // Ensure any other default templates are reset
          db.prepare("UPDATE invoice_templates SET is_default = 0 WHERE is_default = 1").run();
          const stmt = db.prepare("INSERT INTO invoice_templates (name, data, preview_image, is_default) VALUES (?, ?, ?, ?)");
          stmt.run(defaultTemplateName, JSON.stringify(parsed), null, 1);
          console.log("Successfully seeded default invoice template from " + foundPath);
        } catch (err) {
          console.error("Error seeding default invoice template:", err);
        }
      } else {
        console.warn("Could not find default invoice template file to seed.");
      }
    }
  } catch (e) {
    console.error("Migration error:", e);
  }

  return db;
}

function closeDatabase() {
  if (db) db.close();
}

function getDatabasePath() {
  return path.join(app.getPath('userData'), 'referral_crm.db');
}

function getDb() {
  return db;
}

const dbHelpers = {
  signup: async (username, password, referralCode, role = 'franchisee') => {
    try {
      // Pre-check for existing username
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return { success: false, error: 'Username already exists. Please choose another.' };
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const info = db.prepare('INSERT INTO users (username, password, referral_code, role) VALUES (?, ?, ?, ?)').run(username, hashedPassword, referralCode || null, role);
      return { success: true, id: info.lastInsertRowid };
    } catch (error) {
      if (error.message.includes('UNIQUE') || error.code === 'SQLITE_CONSTRAINT') {
        return { success: false, error: 'Username already exists. Please choose another.' };
      }
      return { success: false, error: error.message };
    }
  },
  login: async (username, password) => {
    try {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user) return { success: false, error: 'User not found' };
      
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return { success: false, error: 'Invalid password' };
      
      return { success: true, user: { id: user.id, username: user.username, referral_code: user.referral_code, role: user.role } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  addPartner: async (data) => {
    try {
      const info = db.prepare(
        'INSERT INTO referrals (name, email, phone, referral_code, role) VALUES (?, ?, ?, ?, ?)'
      ).run(data.name, data.email, data.phone, data.referral_code, data.role || 'state_franchisee');
      return { success: true, id: info.lastInsertRowid };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        return { success: false, error: 'Partner with this phone or referral code already exists' };
      }
      return { success: false, error: error.message };
    }
  },
  updatePartner: async (data) => {
    try {
      const info = db.prepare(
        'UPDATE referrals SET name = ?, email = ?, phone = ?, referral_code = ?, role = ? WHERE id = ?'
      ).run(data.name, data.email, data.phone, data.referral_code, data.role || 'state_franchisee', data.id);
      return { success: true, updated: info.changes > 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  deletePartner: async (id) => {
    try {
      const info = db.prepare('DELETE FROM referrals WHERE id = ?').run(id);
      return { success: true, deleted: info.changes > 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getPartners: async () => {
    try {
      const partners = db.prepare('SELECT * FROM referrals ORDER BY created_at DESC').all();
      return { success: true, partners };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  addProduct: async (data) => {
    try {
      const info = db.prepare(
        'INSERT INTO products (item_name, hsn_sac, batch_id, mfg_date, mrp, size, stock, unit, gst_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(data.item_name, data.hsn_sac, data.batch_id, data.mfg_date, data.mrp, data.size, data.stock, data.unit, data.gst_rate);
      return { success: true, id: info.lastInsertRowid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  addBatch: async (data) => {
    // Clone an existing product into a new batch row, sharing the same Shopify variant link
    try {
      const parent = db.prepare('SELECT * FROM products WHERE id = ?').get(data.parent_id);
      if (!parent) return { success: false, error: 'Parent product not found' };
      const info = db.prepare(
        `INSERT INTO products (item_name, hsn_sac, batch_id, mfg_date, mrp, size, stock, unit, gst_rate,
          shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_location_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        parent.item_name,
        parent.hsn_sac,
        data.batch_id,
        data.mfg_date,
        parent.mrp,
        parent.size,
        data.initial_stock || 0,
        parent.unit,
        parent.gst_rate,
        parent.shopify_product_id || null,
        parent.shopify_variant_id || null,
        parent.shopify_inventory_item_id || null,
        parent.shopify_location_id || null
      );
      return { success: true, id: info.lastInsertRowid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  getProducts: async () => {
    try {
      const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
      return { success: true, products };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  updateProduct: async (data) => {
    try {
      const info = db.prepare(
        'UPDATE products SET item_name = ?, hsn_sac = ?, batch_id = ?, mfg_date = ?, mrp = ?, size = ?, stock = ?, unit = ?, gst_rate = ? WHERE id = ?'
      ).run(data.item_name, data.hsn_sac, data.batch_id, data.mfg_date, data.mrp, data.size, data.stock, data.unit, data.gst_rate, data.id);
      return { success: true, updated: info.changes > 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  updateStock: async (id, newStock, change) => {
    try {
      const info = db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, id);
      
      // Log history
      const reason = change > 0 ? 'Manual Stock Addition' : 'Manual Stock Deduction';
      db.prepare('INSERT INTO stock_history (product_id, change_amount, reason) VALUES (?, ?, ?)').run(id, change, reason);
      
      return { success: true, updated: info.changes > 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  deleteProduct: async (id) => {
    try {
      const info = db.prepare('DELETE FROM products WHERE id = ?').run(id);
      return { success: true, deleted: info.changes > 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  createOrder: (order, items) => {
    const stmt = db.prepare(`
      INSERT INTO orders (
        referral_id, invoice_number, invoice_date, bill_to_name, bill_to_address, bill_to_phone, 
        shipping_charges, total_amount, received_amount, final_amount, apply_gst,
        email, shipping_name, shipping_address, shipping_phone, tags, shipping_carrier,
        shopify_financial_status, shopify_fulfillment_status, shopify_order_note, delivery_status,
        billing_address2, shipping_address2, shopify_discount_codes, shopify_discount_applications,
        shopify_total_discounts, shopify_line_item_discount, shopify_shipping_discount
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction((orderData, itemData) => {
      // Look up referral code for the order
      let orderReferralCode = null;
      if (orderData.referral_id) {
        const refRow = db.prepare('SELECT referral_code FROM referrals WHERE id = ?').get(orderData.referral_id);
        if (refRow) {
          orderReferralCode = refRow.referral_code;
        }
      }

      // 1. Save/Update Customer
      db.prepare(`
        INSERT INTO customers (name, address, phone, referral_code) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET 
          address = excluded.address, 
          phone = excluded.phone,
          referral_code = COALESCE(customers.referral_code, excluded.referral_code)
      `).run(
        orderData.bill_to_name, 
        orderData.bill_to_address, 
        orderData.bill_to_phone, 
        orderReferralCode
      );

      const info = stmt.run(
        orderData.referral_id || null,
        orderData.invoice_number,
        orderData.invoice_date,
        orderData.bill_to_name,
        orderData.bill_to_address,
        orderData.bill_to_phone,
        orderData.shipping_charges,
        orderData.total_amount,
        orderData.received_amount,
        orderData.final_amount,
        orderData.apply_gst ? 1 : 0,
        orderData.email || null,
        orderData.shipping_name || null,
        orderData.shipping_address || null,
        orderData.shipping_phone || null,
        orderData.tags || null,
        orderData.shipping_carrier || null,
        orderData.shopify_financial_status || (orderData.final_amount <= 0 ? 'paid' : 'pending'),
        orderData.shopify_fulfillment_status || 'unfulfilled',
        orderData.shopify_order_note || null,
        orderData.delivery_status || 'pending',
        orderData.billing_address2 || null,
        orderData.shipping_address2 || null,
        orderData.shopify_discount_codes || null,
        orderData.shopify_discount_applications || null,
        orderData.shopify_total_discounts || 0,
        orderData.shopify_line_item_discount || 0,
        orderData.shopify_shipping_discount || 0
      );
      const orderId = info.lastInsertRowid;
      
      const itemStmt = db.prepare(`
        INSERT INTO order_items (order_id, product_id, item_name, quantity_string, unit, size, batch_id, mfg_date, hsn_sac, price_per_item, mrp, gst_rate, total, total_discount, shopify_current_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      const historyStmt = db.prepare('INSERT INTO stock_history (product_id, change_amount, reason) VALUES (?, ?, ?)');
      const parseQty = (q) => String(q || '0').split('+').reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0);
      
      for (const item of itemData) {
        const prodId = item.product_id || item.id;
        itemStmt.run(
          orderId, 
          prodId, 
          item.item_name, 
          item.quantity_string, 
          item.unit || null,
          item.size || null,
          item.batch_id || null,
          item.mfg_date || null,
          item.hsn_sac || null,
          item.price_per_item || item.mrp || 0,
          item.mrp || 0, 
          item.gst_rate || 0,
          item.total || 0,
          item.total_discount || 0,
          item.shopify_current_quantity ?? null
        );

        // Deduct stock and log history with validation
        const qty = parseQty(item.quantity_string);
        const currentStockRow = db.prepare('SELECT stock FROM products WHERE id = ?').get(prodId);
        const currentStock = currentStockRow ? currentStockRow.stock : 0;
        if (qty > currentStock) {
          throw new Error(`Insufficient stock for product ID ${prodId}. Available: ${currentStock}, required: ${qty}`);
        }
        stockStmt.run(qty, prodId);
        historyStmt.run(prodId, -qty, `Order #${orderData.invoice_number}`);
      }
      return orderId;
    });

    try {
      const id = transaction(order, items);
      return { success: true, id };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  getTemplates: () => {
    try {
      const templates = db.prepare("SELECT * FROM invoice_templates ORDER BY created_at DESC").all();
      return { success: true, templates };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  saveTemplate: (name, data, previewImage, id) => {
    try {
      if (id) {
        const stmt = db.prepare("UPDATE invoice_templates SET name = ?, data = ?, preview_image = ? WHERE id = ?");
        stmt.run(name, JSON.stringify(data), previewImage, id);
        return { success: true, id };
      } else {
        const stmt = db.prepare("INSERT INTO invoice_templates (name, data, preview_image) VALUES (?, ?, ?)");
        const info = stmt.run(name, JSON.stringify(data), previewImage);
        return { success: true, id: info.lastInsertRowid };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  deleteTemplate: (id) => {
    try {
      db.prepare("DELETE FROM invoice_templates WHERE id = ?").run(id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  getLatestInvoiceNumber: async () => {
    try {
      const row = db.prepare('SELECT invoice_number FROM orders ORDER BY id DESC LIMIT 1').get();
      return { success: true, lastInvoiceNumber: row ? row.invoice_number : null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getOrders: async () => {
    try {
      const orders = db.prepare(`
        SELECT orders.*, referrals.name as referral_name, referrals.referral_code as referral_code
        FROM orders 
        LEFT JOIN referrals ON orders.referral_id = referrals.id
        ORDER BY orders.invoice_date DESC, orders.id DESC
      `).all();

      // Fetch all items to map item counts efficiently
      const items = db.prepare('SELECT order_id, quantity_string FROM order_items').all();
      const itemCounts = {};
      for (const item of items) {
        const qty = item.quantity_string?.split('+').reduce((sum, part) => sum + (parseFloat(part) || 0), 0) || 0;
        itemCounts[item.order_id] = (itemCounts[item.order_id] || 0) + qty;
      }

      // Fallback: Parse referral code from note if referral_id is not linked to a partner
      for (const order of orders) {
        order.total_items = itemCounts[order.id] || 0;
        if (!order.referral_code && order.shopify_order_note) {
          const note = order.shopify_order_note;
          const refMatch = note.match(/ref=([a-z0-9_-]+)/i) || 
                           note.match(/referral:\s*([a-z0-9_-]+)/i) ||
                           note.match(/referral\s+code:\s*([a-z0-9_-]+)/i) ||
                           note.match(/referral\s*code\s*=\s*([a-z0-9_-]+)/i);
          if (refMatch) {
            order.referral_code = refMatch[1];
            try {
              const partner = db.prepare('SELECT name FROM referrals WHERE referral_code = ?').get(order.referral_code);
              if (partner) {
                order.referral_name = partner.name;
              }
            } catch (err) {
              console.error(err);
            }
          }
        }
      }

      return { success: true, orders };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getOrder: async (orderId) => {
    try {
      const order = db.prepare(`
        SELECT orders.*, referrals.name as referral_name, referrals.referral_code as referral_code
        FROM orders 
        LEFT JOIN referrals ON orders.referral_id = referrals.id
        WHERE orders.id = ?
      `).get(orderId);

      if (order) {
        // Fetch and calculate total items
        const items = db.prepare('SELECT quantity_string FROM order_items WHERE order_id = ?').all(orderId);
        const totalItems = items.reduce((sum, item) => {
          const qty = item.quantity_string?.split('+').reduce((s, part) => s + (parseFloat(part) || 0), 0) || 0;
          return sum + qty;
        }, 0);
        order.total_items = totalItems;

        if (!order.referral_code && order.shopify_order_note) {
          const note = order.shopify_order_note;
          const refMatch = note.match(/ref=([a-z0-9_-]+)/i) || 
                           note.match(/referral:\s*([a-z0-9_-]+)/i) ||
                           note.match(/referral\s+code:\s*([a-z0-9_-]+)/i) ||
                           note.match(/referral\s*code\s*=\s*([a-z0-9_-]+)/i);
          if (refMatch) {
            order.referral_code = refMatch[1];
            try {
              const partner = db.prepare('SELECT name FROM referrals WHERE referral_code = ?').get(order.referral_code);
              if (partner) {
                order.referral_name = partner.name;
              }
            } catch (err) {
              console.error(err);
            }
          }
        }
      }

      return { success: true, order };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getOrderItems: async (orderId) => {
    try {
      const items = db.prepare(`
        SELECT oi.*, p.batch_id, p.unit
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `).all(orderId);
      return { success: true, items };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  updateOrder: async (orderId, orderData, items) => {
    const transaction = db.transaction((id, order, itemsList) => {
      // 1. Save/Update Customer
      db.prepare(`
        INSERT INTO customers (name, address, phone) 
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET 
          address = excluded.address, 
          phone = excluded.phone
      `).run(order.bill_to_name, order.bill_to_address, order.bill_to_phone);

      const parseQty = (q) => String(q || '0').split('+').reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0);
      const stockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      const deductStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      const historyStmt = db.prepare('INSERT INTO stock_history (product_id, change_amount, reason) VALUES (?, ?, ?)');

      const currentOrder = db.prepare('SELECT invoice_number FROM orders WHERE id = ?').get(id);

      // 2. Revert old stock levels
      const oldItems = db.prepare('SELECT product_id, quantity_string FROM order_items WHERE order_id = ?').all(id);
      for (const oldItem of oldItems) {
        if (oldItem.product_id) {
          const qty = parseQty(oldItem.quantity_string);
          stockStmt.run(qty, oldItem.product_id);
          historyStmt.run(oldItem.product_id, qty, `Order Update (Refund): #${currentOrder?.invoice_number || id}`);
        }
      }

      // 3. Update order
      db.prepare(`
        UPDATE orders SET 
          referral_id = ?, invoice_number = ?, invoice_date = ?, bill_to_name = ?, 
          bill_to_address = ?, bill_to_phone = ?, shipping_charges = ?, 
          total_amount = ?, received_amount = ?, final_amount = ?, apply_gst = ?,
          email = ?, shipping_name = ?, shipping_address = ?, shipping_phone = ?, 
          tags = ?, shipping_carrier = ?, shopify_financial_status = ?, 
          shopify_fulfillment_status = ?, shopify_order_note = ?, delivery_status = ?,
          billing_address2 = ?, shipping_address2 = ?, shopify_discount_codes = ?,
          shopify_discount_applications = ?, shopify_total_discounts = ?,
          shopify_line_item_discount = ?, shopify_shipping_discount = ?
        WHERE id = ?
      `).run(
        order.referral_id || null, order.invoice_number, order.invoice_date, order.bill_to_name,
        order.bill_to_address, order.bill_to_phone, order.shipping_charges,
        order.total_amount, order.received_amount, order.final_amount,
        order.apply_gst ? 1 : 0, 
        order.email || null, order.shipping_name || null, order.shipping_address || null, order.shipping_phone || null,
        order.tags || null, order.shipping_carrier || null, order.shopify_financial_status || null,
        order.shopify_fulfillment_status || null, order.shopify_order_note || null, order.delivery_status || 'pending',
        order.billing_address2 || null, order.shipping_address2 || null,
        order.shopify_discount_codes || null,
        order.shopify_discount_applications || null,
        order.shopify_total_discounts || 0,
        order.shopify_line_item_discount || 0,
        order.shopify_shipping_discount || 0,
        id
      );

      // 4. Replace items
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
      
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, item_name, quantity_string, unit, size, batch_id, mfg_date, hsn_sac, price_per_item, mrp, gst_rate, total, total_discount, shopify_current_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const item of itemsList) {
        const prodId = item.product_id || item.id;
        insertItem.run(
          id, 
          prodId, 
          item.item_name, 
          item.quantity_string, 
          item.unit || null,
          item.size || null,
          item.batch_id || null,
          item.mfg_date || null,
          item.hsn_sac || null,
          item.price_per_item || item.mrp || 0,
          item.mrp || 0, 
          item.gst_rate || 0,
          item.total || 0,
          item.total_discount || 0,
          item.shopify_current_quantity ?? null
        );

// 4. Deduct new stock levels with validation
          const newQty = parseQty(item.quantity_string);
          const prodStockRow = db.prepare('SELECT stock FROM products WHERE id = ?').get(prodId);
          const prodStock = prodStockRow ? prodStockRow.stock : 0;
          if (newQty > prodStock) {
            throw new Error(`Insufficient stock for product ID ${prodId} during order update. Available: ${prodStock}, required: ${newQty}`);
          }
          deductStmt.run(newQty, prodId);
      }
      
      return true;
    });

    try {
      transaction(orderId, orderData, items);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  deleteOrder: async (id) => {
      try {
        // Attempt to delete order from Shopify if sync is enabled
        if (process.env.SHOPIFY_SYNC === 'true') {
          const adminUrl = process.env.ADMIN_URL || 'https://ayuvitacrm.vercel.app';
          // Assume there is an endpoint that handles Shopify order deletion
          await require('axios').post(`${adminUrl}/api/shopify/delete-order`, { orderId: id });
        }
      } catch (e) {
        console.error('Shopify sync delete failed:', e.message);
      }

    try {
      const transaction = db.transaction((orderId) => {
        const parseQty = (q) => String(q || '0').split('+').reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0);
        const stockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
        const historyStmt = db.prepare('INSERT INTO stock_history (product_id, change_amount, reason) VALUES (?, ?, ?)');

        // 1. Restore stock before deletion (only if not already cancelled)
        const order = db.prepare('SELECT invoice_number, shopify_order_id, status FROM orders WHERE id = ?').get(orderId);
        const shopifyOrderId = order?.shopify_order_id || null;

        if (order && order.status !== 'cancelled') {
          const items = db.prepare('SELECT product_id, quantity_string FROM order_items WHERE order_id = ?').all(orderId);
          for (const item of items) {
            if (item.product_id) {
              const qty = parseQty(item.quantity_string);
              stockStmt.run(qty, item.product_id);
              historyStmt.run(item.product_id, qty, `Order Deleted: #${order?.invoice_number || orderId}`);
            }
          }
        }

        // 2. Delete order (CASCADE will handle order_items)
        db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
        
        return shopifyOrderId;
      });

      const shopifyOrderId = transaction(id);
      return { success: true, shopifyOrderId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  cancelOrder: async (id) => {
    try {
      const transaction = db.transaction((orderId) => {
        const order = db.prepare('SELECT invoice_number, status FROM orders WHERE id = ?').get(orderId);
        if (!order) {
          throw new Error('Order not found');
        }
        if (order.status === 'cancelled') {
          return; // Already cancelled
        }

        const parseQty = (q) => String(q || '0').split('+').reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0);
        const stockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
        const historyStmt = db.prepare('INSERT INTO stock_history (product_id, change_amount, reason) VALUES (?, ?, ?)');

        // 1. Restore stock
        const items = db.prepare('SELECT product_id, quantity_string FROM order_items WHERE order_id = ?').all(orderId);
        for (const item of items) {
          if (item.product_id) {
            const qty = parseQty(item.quantity_string);
            stockStmt.run(qty, item.product_id);
            historyStmt.run(item.product_id, qty, `Order Cancelled: #${order.invoice_number}`);
          }
        }

        // 2. Update order status
        db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(orderId);
      });

      transaction(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getCustomers: async (role, referralCode) => {
    try {
      let query = 'SELECT * FROM customers';
      let params = [];
      if (['state_franchisee', 'city_franchisee'].includes(role) && referralCode) {
        query += `
          WHERE 
            LOWER(referral_code) IN (
              WITH RECURSIVE downline AS (
                SELECT referral_code FROM referrals WHERE LOWER(referral_code) = LOWER(?)
                UNION ALL
                SELECT r.referral_code FROM referrals r
                JOIN downline d ON LOWER(r.parent_code) = LOWER(d.referral_code)
              )
              SELECT LOWER(referral_code) FROM downline
            )
            OR name IN (
              SELECT DISTINCT bill_to_name 
              FROM orders 
              WHERE referral_id IN (
                WITH RECURSIVE downline AS (
                  SELECT id, referral_code FROM referrals WHERE LOWER(referral_code) = LOWER(?)
                  UNION ALL
                  SELECT r.id, r.referral_code FROM referrals r
                  JOIN downline d ON LOWER(r.parent_code) = LOWER(d.referral_code)
                )
                SELECT id FROM downline
              )
            )
        `;
        params.push(referralCode, referralCode);
      }
      query += ' ORDER BY name ASC';
      const customers = db.prepare(query).all(...params);
      return { success: true, customers };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getCustomersWithStats: async (role, referralCode) => {
    try {
      let query = `
        SELECT 
          customers.*, 
          COUNT(orders.id) as total_orders,
          COALESCE(SUM(orders.total_amount), 0) as total_sales,
          COALESCE(SUM(orders.received_amount), 0) as total_received,
          COALESCE(SUM(orders.final_amount), 0) as total_due
        FROM customers
        LEFT JOIN orders ON customers.name = orders.bill_to_name
      `;
      let params = [];
      if (['state_franchisee', 'city_franchisee'].includes(role) && referralCode) {
        query += `
          WHERE 
            LOWER(customers.referral_code) IN (
              WITH RECURSIVE downline AS (
                SELECT referral_code FROM referrals WHERE LOWER(referral_code) = LOWER(?)
                UNION ALL
                SELECT r.referral_code FROM referrals r
                JOIN downline d ON LOWER(r.parent_code) = LOWER(d.referral_code)
              )
              SELECT LOWER(referral_code) FROM downline
            )
            OR customers.name IN (
              SELECT DISTINCT bill_to_name 
              FROM orders 
              WHERE referral_id IN (
                WITH RECURSIVE downline AS (
                  SELECT id, referral_code FROM referrals WHERE LOWER(referral_code) = LOWER(?)
                  UNION ALL
                  SELECT r.id, r.referral_code FROM referrals r
                  JOIN downline d ON LOWER(r.parent_code) = LOWER(d.referral_code)
                )
                SELECT id FROM downline
              )
            )
        `;
        params.push(referralCode, referralCode);
      }
      query += `
        GROUP BY customers.id
        ORDER BY customers.name ASC
      `;
      const customers = db.prepare(query).all(...params);
      return { success: true, customers };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  addCustomer: async (data) => {
    try {
      const info = db.prepare('INSERT INTO customers (name, address, phone, referral_code) VALUES (?, ?, ?, ?)').run(
        data.name, 
        data.address, 
        data.phone, 
        data.referral_code || null
      );
      return { success: true, id: info.lastInsertRowid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  updateCustomer: async (id, data) => {
    try {
      db.prepare('UPDATE customers SET name = ?, address = ?, phone = ? WHERE id = ?').run(data.name, data.address, data.phone, id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  deleteCustomer: async (id) => {
    try {
      db.prepare('DELETE FROM customers WHERE id = ?').run(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getStockHistory: async (productId) => {
    try {
      const history = db.prepare('SELECT * FROM stock_history WHERE product_id = ? ORDER BY created_at DESC').all(productId);
      return { success: true, history };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getCustomerOrders: async (customerName) => {
    try {
      const orders = db.prepare('SELECT * FROM orders WHERE bill_to_name = ? ORDER BY invoice_date DESC').all(customerName);
      return { success: true, orders };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getAnalytics: async (startDate, endDate, referralCode = null, role = null) => {
    try {
      // We will build parameters for each query independently to avoid concat mismatches
      const baseParams = [];
      let dateFilter = "";
      if (startDate && endDate) {
        dateFilter = "date(invoice_date) BETWEEN ? AND ?";
        baseParams.push(startDate, endDate);
      } else {
        dateFilter = "date(invoice_date) >= date('now', '-30 days')";
      }

      // Branch isolation filter
      let branchFilter = "";
      const branchParams = [];
      if (['state_franchisee', 'city_franchisee'].includes(role) && referralCode) {
        // Fetch all downline ids including self using recursive CTE
        const ids = db.prepare(`
          WITH RECURSIVE downline AS (
            SELECT id, referral_code FROM referrals WHERE LOWER(referral_code) = LOWER(?)
            UNION ALL
            SELECT r.id, r.referral_code FROM referrals r
            JOIN downline d ON LOWER(r.parent_code) = LOWER(d.referral_code)
          )
          SELECT id FROM downline;
        `).all(referralCode).map(row => row.id);

        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          branchFilter = `referral_id IN (${placeholders})`;
          branchParams.push(...ids);
        } else {
          branchFilter = "1 = 0";
        }
      }

      // Base active orders filter (excluding cancelled ones)
      const baseFilters = ["status != 'cancelled'"];
      const queryParams = [];

      if (dateFilter) {
        baseFilters.push(dateFilter);
        queryParams.push(...baseParams);
      }
      if (branchFilter) {
        baseFilters.push(branchFilter);
        queryParams.push(...branchParams);
      }

      const whereClause = "WHERE " + baseFilters.join(" AND ");

      // 1. Sales Trend
      const salesTrend = db.prepare(`
        SELECT 
          date(invoice_date) as date,
          SUM(total_amount) as total_sales
        FROM orders
        ${whereClause}
        GROUP BY date(invoice_date)
        ORDER BY date(invoice_date) ASC
      `).all(queryParams);

      // 2. Top Selling Products
      const topProducts = db.prepare(`
        SELECT 
          item_name as name,
          COUNT(*) as order_count,
          SUM(total) as revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        ${whereClause}
        GROUP BY product_id
        ORDER BY revenue DESC
        LIMIT 5
      `).all(queryParams);

      // 3. Referral Performance
      // The whereClause already isolates orders to the franchisee and their downline partners
      const referralStats = db.prepare(`
        SELECT 
          r.name as name,
          COUNT(o.id) as total_orders,
          SUM(o.total_amount) as revenue
        FROM referrals r
        JOIN orders o ON r.id = o.referral_id
        ${whereClause}
        GROUP BY r.id
        ORDER BY revenue DESC
        LIMIT 5
      `).all(queryParams);

      // 4. Summary Stats (total_orders, total_revenue, total_customers, low_stock_count)
      let totalCustomersQuery = "SELECT COUNT(*) FROM customers";
      let totalCustomersParams = [];
      
      if (['state_franchisee', 'city_franchisee'].includes(role) && referralCode) {
        totalCustomersQuery = `
          SELECT COUNT(*) FROM customers
          WHERE 
            LOWER(referral_code) IN (
              WITH RECURSIVE downline AS (
                SELECT referral_code FROM referrals WHERE LOWER(referral_code) = LOWER(?)
                UNION ALL
                SELECT r.referral_code FROM referrals r
                JOIN downline d ON LOWER(r.parent_code) = LOWER(d.referral_code)
              )
              SELECT LOWER(referral_code) FROM downline
            )
            OR name IN (
              SELECT DISTINCT bill_to_name 
              FROM orders 
              WHERE referral_id IN (
                WITH RECURSIVE downline AS (
                  SELECT id, referral_code FROM referrals WHERE LOWER(referral_code) = LOWER(?)
                  UNION ALL
                  SELECT r.id, r.referral_code FROM referrals r
                  JOIN downline d ON LOWER(r.parent_code) = LOWER(d.referral_code)
                )
                SELECT id FROM downline
              )
            )
        `;
        totalCustomersParams.push(referralCode, referralCode);
      }

      const totalOrdersRow = db.prepare(`SELECT COUNT(*) as count FROM orders ${whereClause}`).get(queryParams);
      const totalRevenueRow = db.prepare(`SELECT COALESCE(SUM(total_amount), 0) as sum FROM orders ${whereClause}`).get(queryParams);
      const totalCustomersRow = db.prepare(totalCustomersQuery).get(totalCustomersParams);
      const lowStockRow = db.prepare(`SELECT COUNT(*) as count FROM products WHERE stock <= 10`).get();
      
      const summary = {
        total_orders: totalOrdersRow ? totalOrdersRow.count : 0,
        total_revenue: totalRevenueRow ? totalRevenueRow.sum : 0,
        total_customers: totalCustomersRow ? Object.values(totalCustomersRow)[0] : 0,
        low_stock_count: lowStockRow ? lowStockRow.count : 0
      };

      return { 
        success: true, 
        salesTrend, 
        topProducts, 
        referralStats,
        summary
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  saveShopifySettings: async (domain, token, clientId = '', clientSecret = '', tokenExpiresAt = '') => {
    try {
      db.prepare('INSERT OR REPLACE INTO shopify_sync_metadata (key, value) VALUES (?, ?)').run('shopify_domain', domain);
      db.prepare('INSERT OR REPLACE INTO shopify_sync_metadata (key, value) VALUES (?, ?)').run('shopify_token', token);
      db.prepare('INSERT OR REPLACE INTO shopify_sync_metadata (key, value) VALUES (?, ?)').run('shopify_client_id', clientId);
      db.prepare('INSERT OR REPLACE INTO shopify_sync_metadata (key, value) VALUES (?, ?)').run('shopify_client_secret', clientSecret);
      db.prepare('INSERT OR REPLACE INTO shopify_sync_metadata (key, value) VALUES (?, ?)').run('shopify_token_expires_at', tokenExpiresAt);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  getShopifySettings: async () => {
    try {
      const domainRow = db.prepare('SELECT value FROM shopify_sync_metadata WHERE key = ?').get('shopify_domain');
      const tokenRow = db.prepare('SELECT value FROM shopify_sync_metadata WHERE key = ?').get('shopify_token');
      const clientIdRow = db.prepare('SELECT value FROM shopify_sync_metadata WHERE key = ?').get('shopify_client_id');
      const clientSecretRow = db.prepare('SELECT value FROM shopify_sync_metadata WHERE key = ?').get('shopify_client_secret');
      const expiresAtRow = db.prepare('SELECT value FROM shopify_sync_metadata WHERE key = ?').get('shopify_token_expires_at');
      const lastSyncRow = db.prepare('SELECT value FROM shopify_sync_metadata WHERE key = ?').get('last_sync_timestamp');
      return {
        success: true,
        domain: domainRow ? domainRow.value : '',
        token: tokenRow ? tokenRow.value : '',
        clientId: clientIdRow ? clientIdRow.value : '',
        clientSecret: clientSecretRow ? clientSecretRow.value : '',
        tokenExpiresAt: expiresAtRow ? expiresAtRow.value : '',
        lastSync: lastSyncRow ? lastSyncRow.value : ''
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  updateSyncMetadata: async (key, value) => {
    try {
      db.prepare('INSERT OR REPLACE INTO shopify_sync_metadata (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, value);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

module.exports = { initDatabase, closeDatabase, getDatabasePath, getDb, dbHelpers };
