const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const envText = fs.readFileSync(envPath, 'utf8');
  const vars = {};

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }

  process.env.SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || vars.SHOPIFY_STORE_DOMAIN || '';
  process.env.SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || vars.SHOPIFY_CLIENT_ID || '';
  process.env.SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || vars.SHOPIFY_CLIENT_SECRET || '';
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || vars.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
};
