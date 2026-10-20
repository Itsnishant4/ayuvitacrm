import React, { useState } from 'react';
import { Page, Layout, Card, Select, TextField, Button, Text, Spinner } from '@shopify/polaris';

// List of all IPC methods exposed via preload.js
const apiList = [
  { name: 'signup', description: 'Create a new user (username, password)', defaultArgs: { username: 'test', password: 'pass' } },
  { name: 'login', description: 'Login user (username, password)', defaultArgs: { username: 'test', password: 'pass' } },
  { name: 'verifyToken', description: 'Verify JWT token (token)', defaultArgs: '' },
  { name: 'addPartner', description: 'Add a referral partner', defaultArgs: { name: 'Acme', email: 'acme@example.com', phone: '5551234', referral_code: 'ABC123' } },
  { name: 'updatePartner', description: 'Update a partner (id required)', defaultArgs: { id: 1, name: 'Acme', email: 'acme@example.com', phone: '5551234', referral_code: 'ABC123' } },
  { name: 'deletePartner', description: 'Delete a partner (id)', defaultArgs: 1 },
  { name: 'getPartners', description: 'Fetch all partners', defaultArgs: null },
  { name: 'addProduct', description: 'Add a product', defaultArgs: { item_name: 'Sample', hsn_sac: '', batch_id: '', mfg_date: '', mrp: 100, size: '', stock: 10, unit: '', gst_rate: 0 } },
  { name: 'updateProduct', description: 'Update a product (id required)', defaultArgs: { id: 1, item_name: 'Sample', hsn_sac: '', batch_id: '', mfg_date: '', mrp: 100, size: '', stock: 10, unit: '', gst_rate: 0 } },
  { name: 'deleteProduct', description: 'Delete a product (id)', defaultArgs: 1 },
  { name: 'getProducts', description: 'Fetch all products', defaultArgs: null },
  { name: 'addCustomer', description: 'Add a customer', defaultArgs: { name: 'Jane', address: '456 Ave', phone: '555-1111' } },
  { name: 'updateCustomer', description: 'Update a customer (id, data)', defaultArgs: [1, { name: 'Jane' }] },
  { name: 'deleteCustomer', description: 'Delete a customer (id)', defaultArgs: 1 },
  { name: 'getCustomers', description: 'Fetch all customers', defaultArgs: null },
  { name: 'getCustomersWithStats', description: 'Fetch customers with stats', defaultArgs: null },
  { name: 'createOrder', description: 'Create an order (orderData, items)', defaultArgs: [ { bill_to_name: 'John', bill_to_address: '123 St', bill_to_phone: '555-0000', shipping_charges: 0, total_amount: 100, received_amount: 0, final_amount: 100, apply_gst: true }, [] ] },
  { name: 'getOrders', description: 'Fetch all orders', defaultArgs: null },
  { name: 'getOrderItems', description: 'Get items for an order (orderId)', defaultArgs: 1 },
  { name: 'updateOrder', description: 'Update an order (orderId, orderData, items)', defaultArgs: [1, { bill_to_name: 'John' }, []] },
  { name: 'deleteOrder', description: 'Delete an order (id)', defaultArgs: 1 },
  { name: 'updateStock', description: 'Update product stock (id, newStock, change)', defaultArgs: [1, 20, 5] },
  { name: 'getStockHistory', description: 'Get stock history for a product (productId)', defaultArgs: 1 },
  { name: 'getAnalytics', description: 'Get analytics (startDate, endDate)', defaultArgs: [null, null] },
  { name: 'getTemplates', description: 'Fetch invoice templates', defaultArgs: null },
  { name: 'saveTemplate', description: 'Save a template (name, data, previewImage)', defaultArgs: { name: 'MyTemplate', data: {}, previewImage: '' } },
  { name: 'deleteTemplate', description: 'Delete a template (id)', defaultArgs: 1 },
  { name: 'ping', description: 'Ping the main process', defaultArgs: null },
  { name: 'getAppVersion', description: 'Get current app version', defaultArgs: null },
  { name: 'checkElectronUpdate', description: 'Check for Electron app update', defaultArgs: null },
  { name: 'downloadElectronUpdate', description: 'Download available update', defaultArgs: null },
  { name: 'installElectronUpdate', description: 'Install update and restart', defaultArgs: null },
  { name: 'setAppIcon', description: 'Set custom app icon (dataUrl)', defaultArgs: { dataUrl: '' } },
  { name: 'getAppIcon', description: 'Get current custom app icon', defaultArgs: null },
  { name: 'shopifyGetProducts', description: 'Fetch all Shopify products', defaultArgs: null },
  { name: 'shopifyAddProduct', description: 'Add a product directly on Shopify', defaultArgs: { item_name: 'Sample', hsn_sac: '', batch_id: '', mfg_date: '', mrp: 100, size: '', stock: 10, unit: '', gst_rate: 0, shopify_variant_id: 'gid://shopify/ProductVariant/1234567890', shopify_location_id: 'gid://shopify/Location/987654321' } },
  { name: 'shopifyUpdateProduct', description: 'Update a Shopify product', defaultArgs: { id: 1, item_name: 'Sample', hsn_sac: '', batch_id: '', mfg_date: '', mrp: 100, size: '', stock: 10, unit: '', gst_rate: 0, shopify_variant_id: 'gid://shopify/ProductVariant/1234567890', shopify_location_id: 'gid://shopify/Location/987654321' } },
  { name: 'shopifyDeleteProduct', description: 'Delete a Shopify product', defaultArgs: 1 },
  { name: 'shopifySetInventory', description: 'Set inventory level for a Shopify variant', defaultArgs: { inventoryItemId: '123456', locationId: '987654', available: 20 } },
  { name: 'shopifyGetOrders', description: 'Fetch all Shopify orders', defaultArgs: null },
  { name: 'shopifyCreateOrder', description: 'Create an order on Shopify', defaultArgs: { order: { line_items: [{ variant_id: 1234567890, quantity: 1 }], billing_address: { first_name: "John", address1: "123 St", phone: "555-0000" }, shipping_address: { first_name: "John", address1: "123 St", phone: "555-0000" }, financial_status: "pending" } } },
  { name: 'shopifyUpdateOrder', description: 'Update a Shopify order', defaultArgs: { id: 1, order: { note: "Updated via API" } } },
  { name: 'shopifyDeleteOrder', description: 'Delete a Shopify order', defaultArgs: 1 }
];

export default function ApiPlayground() {
  const [selected, setSelected] = useState(apiList[0].name);
  const [args, setArgs] = useState(JSON.stringify(apiList[0].defaultArgs, null, 2));
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    try {
      const fn = window.api[selected];
      let parsedArgs = null;
      if (args && args.trim().length) {
        parsedArgs = JSON.parse(args);
      }
      // Support calling with an array of arguments or a single argument
      const result = Array.isArray(parsedArgs) ? await fn(...parsedArgs) : await fn(parsedArgs);
      setResponse(result);
    } catch (e) {
      setResponse({ error: e.message });
    }
    setLoading(false);
  };

  const handleSelectChange = (value) => {
    setSelected(value);
    const api = apiList.find((a) => a.name === value);
    setArgs(JSON.stringify(api?.defaultArgs ?? null, null, 2));
    setResponse(null);
  };

  return (
    <Page fullWidth title="API Playground">
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Select
              label="Select API method"
              options={apiList.map((a) => ({ label: `${a.name} – ${a.description}`, value: a.name }))}
              value={selected}
              onChange={handleSelectChange}
            />
            <TextField
              label="Arguments (JSON)"
              multiline={4}
              value={args}
              onChange={(val) => setArgs(val)}
            />
            <Button primary onClick={handleRun} disabled={loading} style={{ marginTop: '1rem' }}>
              {loading ? <Spinner size="small" /> : 'Run'}
            </Button>
            {response !== null && (
              <Card subdued title="Response" sectioned style={{ marginTop: '1rem' }}>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(response, null, 2)}</pre>
              </Card>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
