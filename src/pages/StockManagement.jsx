import React, { useEffect, useState } from 'react';
import { 
  Page, 
  Layout, 
  LegacyCard, 
  IndexTable, 
  Text, 
  Badge, 
  Button, 
  TextField, 
  InlineStack, 
  BlockStack, 
  Box, 
  Modal, 
  Grid,
  Spinner,
  DataTable
} from '@shopify/polaris';
import { Search, Package, AlertTriangle, Save, History, Plus, Minus } from "lucide-react";
import PolarisTooltip from '../components/PolarisTooltip';
import toast from 'react-hot-toast';
import { useData } from '../contexts/DataContext';

const StockManagement = () => {
  const { products, loading: ctxLoading, fetchProducts } = useData();
  const [localProducts, setLocalProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [stockChanges, setStockChanges] = useState({}); // { productId: addedAmount }
  
  // History states
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    fetchProducts().then(res => {
      if (res.success) setLocalProducts(res.products);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (products) setLocalProducts(products);
  }, [products]);

  const refetchProducts = async () => {
    setLoading(true);
    const result = await fetchProducts(true);
    if (result.success) setLocalProducts(result.products);
    setLoading(false);
  };

  const handleStockChange = (productId, value) => {
    setStockChanges(prev => ({
      ...prev,
      [productId]: value
    }));
  };

  const handleUpdateStock = async (product) => {
    const change = parseInt(stockChanges[product.id] || 0);
    if (isNaN(change) || change === 0) return;

    const newStock = (product.stock || 0) + change;
    
    const promise = (async () => {
      const result = await window.api.updateStock(product.id, newStock, change);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update stock');
      }
      return result;
    })();

    toast.promise(promise, {
      loading: change > 0 ? 'Adding stock...' : 'Deducting stock...',
      success: 'Stock updated successfully!',
      error: (err) => `Failed to update stock: ${err.message}`,
    });

    try {
      await promise;
      // Update local state
      setLocalProducts(prev => prev.map(p => 
        p.id === product.id ? { ...p, stock: newStock } : p
      ));
      // Clear input
      setStockChanges(prev => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async (product) => {
    setSelectedProduct(product);
    setIsHistoryOpen(true);
    setLoadingHistory(true);
    const result = await window.api.getStockHistory(product.id);
    if (result.success) {
      setHistory(result.history);
    }
    setLoadingHistory(false);
  };

  const filteredProducts = localProducts.filter(p => 
    p.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.batch_id && p.batch_id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const lowStockCount = localProducts.filter(p => (p.stock || 0) <= 5).length;

  const historyHeaders = ['Date & Time', 'Reason', 'Change Quantity'];
  const historyRows = history.map(log => [
    new Date(log.created_at).toLocaleString(),
    log.reason || 'Manual Adjustment',
    log.change_amount > 0 ? `+${log.change_amount}` : `${log.change_amount}`
  ]);

  return (
    <Page
      fullWidth
      title="Stock Control Ledger"
      subtitle="Quickly adjust product inventory levels and track log updates"
      compactTitle
      primaryAction={{
        content: 'Refresh Stock',
        onAction: refetchProducts
      }}
    >
      <Layout>
        {/* Metric Cards Summary */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Total Items Listed" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{localProducts.length}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="info">Active SKUs</Badge>
                    <Text variant="bodySm" tone="subdued">catalog items</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Critical Low Stock" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{lowStockCount}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone={lowStockCount > 0 ? 'critical' : 'success'}>
                      {lowStockCount > 0 ? 'Alerts Triggered' : 'Healthy Stock'}
                    </Badge>
                    <Text variant="bodySm" tone="subdued">under 5 units</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Stock History Log" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">Adjustments</Text>
                  <InlineStack align="start" gap="100">
                    <Button variant="plain" onClick={refetchProducts}>
                      Sync Inventory
                    </Button>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Ledger list */}
        <Layout.Section>
          <LegacyCard>
            <Box padding="400">
              <div style={{ maxWidth: '400px' }}>
                <TextField
                  placeholder="Search by name or batch ID..."
                  value={searchTerm}
                  onChange={(val) => setSearchTerm(val)}
                  prefix={<Search size={16} />}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchTerm('')}
                />
              </div>
            </Box>

            <IndexTable
              resourceName={{ singular: 'product', plural: 'products' }}
              itemCount={filteredProducts.length}
              loading={loading}
              headings={[
                { title: 'Product Details' },
                { title: 'Current Stock', alignment: 'center' },
                { title: 'Stock Adjustment Quantity' },
                { title: 'Actions', alignment: 'end' }
              ]}
              selectable={false}
            >
              {filteredProducts.map((product, index) => {
                const change = parseInt(stockChanges[product.id] || 0);
                const hasChange = !isNaN(change) && change !== 0;

                return (
                  <IndexTable.Row id={product.id} key={product.id} position={index}>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="bold">{product.item_name}</Text>
                        <InlineStack gap="150">
                          <Text variant="bodySm" tone="subdued">Batch: {product.batch_id || 'N/A'}</Text>
                          <Text variant="bodySm" tone="subdued">•</Text>
                          <Text variant="bodySm" tone="subdued">HSN: {product.hsn_sac || 'N/A'}</Text>
                        </InlineStack>
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <div style={{ textAlign: 'center' }}>
                        <Badge tone={product.stock <= 5 ? 'critical' : product.stock <= 15 ? 'warning' : 'success'}>
                          {product.stock || 0} {product.unit || 'PCS'}
                        </Badge>
                      </div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <div style={{ maxWidth: '140px' }}>
                        <TextField
                          type="number"
                          placeholder="0"
                          value={stockChanges[product.id] || ''}
                          onChange={(val) => handleStockChange(product.id, val)}
                          prefix={change >= 0 ? <Plus size={14} className="text-green-500" /> : <Minus size={14} className="text-red-500" />}
                          suffix={product.unit || 'Unit'}
                          autoComplete="off"
                        />
                      </div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack align="end" gap="100">
                        <PolarisTooltip content="View Stock History">
                          <div style={{ cursor: 'pointer' }}>
                            <Button
                              icon={<History size={16} />}
                              onClick={() => fetchHistory(product)}
                              variant="plain"
                            />
                          </div>
                        </PolarisTooltip>
                        <PolarisTooltip content="Save Stock Update">
                          <div style={{ cursor: !hasChange ? 'not-allowed' : 'pointer' }}>
                            <Button
                              icon={<Save size={16} />}
                              onClick={() => handleUpdateStock(product)}
                              disabled={!hasChange}
                              variant="plain"
                            />
                          </div>
                        </PolarisTooltip>
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>
          </LegacyCard>
        </Layout.Section>
      </Layout>

      {/* Stock History Modal */}
      <Modal
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        title={`Stock History: ${selectedProduct?.item_name || ''}`}
        limitHeight
      >
        <Modal.Section>
          {loadingHistory ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Spinner size="large" />
            </div>
          ) : history.length === 0 ? (
            <Box padding="400">
              <Text variant="bodyMd" tone="subdued" align="center">
                No stock movement logs found for this SKU.
              </Text>
            </Box>
          ) : (
            <DataTable
              columnContentTypes={['text', 'text', 'numeric']}
              headings={historyHeaders}
              rows={historyRows}
            />
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default StockManagement;
