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
  FormLayout, 
  Grid,
  Select,
  Pagination
} from '@shopify/polaris';
import { Search, Edit, Trash, Plus, AlertTriangle, Layers, Package, Calendar, GitBranch } from "lucide-react";
import PolarisTooltip from '../components/PolarisTooltip';
import toast from 'react-hot-toast';
import { useData } from '../contexts/DataContext';

const AllProducts = ({ onNavigate }) => {
  const { products, loading: ctxLoading, fetchProducts } = useData();
  const [localProducts, setLocalProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Edit states
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editFormData, setEditFormData] = useState({ 
    item_name: "", 
    hsn_sac: "", 
    batch_id: "",
    mrp: "", 
    size: "", 
    stock: "", 
    unit: "",
    gst_rate: "",
    mfg_date: ""
  });
  const [isSaving, setIsSaving] = useState(false);

  // Add Batch modal states
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [batchParent, setBatchParent] = useState(null);
  const [batchFormData, setBatchFormData] = useState({ batch_id: '', mfg_date: '', initial_stock: '0' });
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  useEffect(() => {
    fetchProducts().then(res => {
      if (res.success) setLocalProducts(res.products);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (products) setLocalProducts(products);
  }, [products]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortKey, sortDirection]);

  const refetchProducts = async () => {
    setLoading(true);
    const result = await fetchProducts(true);
    if (result.success) setLocalProducts(result.products);
    setLoading(false);
  };

  const handleEditClick = (product) => {
    setSelectedProduct(product);
    setEditFormData({
      item_name: product.item_name,
      hsn_sac: product.hsn_sac || "",
      batch_id: product.batch_id || "",
      mrp: String(product.mrp || ""),
      size: product.size || "",
      stock: String(product.stock || "0"),
      unit: product.unit || "PCS",
      gst_rate: String(product.gst_rate || ""),
      mfg_date: product.mfg_date || ""
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateProduct = async () => {
    setIsSaving(true);
    
    const dataToUpdate = {
      id: selectedProduct.id,
      ...editFormData,
      mrp: parseFloat(editFormData.mrp) || 0,
      stock: parseInt(editFormData.stock) || 0,
      gst_rate: parseFloat(editFormData.gst_rate) || 0,
    };

    const promise = (async () => {
      const result = await window.api.updateProduct(dataToUpdate);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update product');
      }
      return result;
    })();

    toast.promise(promise, {
      loading: 'Updating product...',
      success: 'Product updated successfully!',
      error: (err) => `Update failed: ${err.message}`,
    });

    try {
      await promise;
      setIsEditDialogOpen(false);
      refetchProducts();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    const promise = (async () => {
      const result = await window.api.deleteProduct(id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete product');
      }
      return result;
    })();
    
    toast.promise(promise, {
      loading: 'Deleting product...',
      success: 'Product deleted successfully!',
      error: (err) => `Failed to delete product: ${err.message}`,
    });

    try {
      await promise;
      refetchProducts();
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAddBatch = (product) => {
    setBatchParent(product);
    setBatchFormData({ batch_id: '', mfg_date: '', initial_stock: '0' });
    setIsBatchDialogOpen(true);
  };

  const handleAddBatch = async () => {
    if (!batchFormData.batch_id) {
      toast.error('Batch ID is required');
      return;
    }
    setIsAddingBatch(true);
    const result = await window.api.addBatch({
      parent_id: batchParent.id,
      batch_id: batchFormData.batch_id,
      mfg_date: batchFormData.mfg_date,
      initial_stock: parseInt(batchFormData.initial_stock) || 0
    });
    if (result.success) {
      toast.success('New batch added successfully!');
      setIsBatchDialogOpen(false);
      refetchProducts();
    } else {
      toast.error(`Failed to add batch: ${result.error}`);
    }
    setIsAddingBatch(false);
  };

  const filteredProducts = localProducts
    .filter(p => {
      const s = searchTerm.toLowerCase();
      return (
        p.item_name.toLowerCase().includes(s) ||
        (p.hsn_sac && p.hsn_sac.toLowerCase().includes(s)) ||
        (p.batch_id && p.batch_id.toLowerCase().includes(s)) ||
        (p.size && p.size.toLowerCase().includes(s)) ||
        (p.unit && p.unit.toLowerCase().includes(s)) ||
        String(p.mrp).includes(s) ||
        String(p.gst_rate).includes(s) ||
        String(p.stock).includes(s)
      );
    })
    .sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      
      switch (sortKey) {
        case 'item_name':
          return direction * a.item_name.localeCompare(b.item_name);
        case 'stock':
          return direction * (a.stock - b.stock);
        case 'mrp':
          return direction * (a.mrp - b.mrp);
        case 'created_at':
          return direction * (new Date(a.created_at) - new Date(b.created_at));
        default:
          return 0;
      }
    });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const sortOptions = [
    { label: 'Name (A-Z)', value: 'item_name_asc' },
    { label: 'Name (Z-A)', value: 'item_name_desc' },
    { label: 'Stock (Low to High)', value: 'stock_asc' },
    { label: 'Stock (High to Low)', value: 'stock_desc' },
    { label: 'MRP (Low to High)', value: 'mrp_asc' },
    { label: 'MRP (High to Low)', value: 'mrp_desc' },
    { label: 'Created (Newest)', value: 'created_at_desc' },
    { label: 'Created (Oldest)', value: 'created_at_asc' }
  ];

  const handleSortChange = (value) => {
    const parts = value.split('_');
    const direction = parts.pop();
    const key = parts.join('_');
    setSortKey(key);
    setSortDirection(direction);
  };

  const getStockBadgeTone = (stock) => {
    if (stock <= 5) return 'critical';
    if (stock <= 15) return 'warning';
    return 'success';
  };

  return (
    <Page
      fullWidth
      title="Products Catalog"
      subtitle="View, edit, and manage product inventory details"
      compactTitle
    >
      <Layout>
        {/* Metric Cards Summary */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Total Unique Products" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{localProducts.length}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="info">Active</Badge>
                    <Text variant="bodySm" tone="subdued">in catalog</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Total Stock Units" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">
                    {localProducts.reduce((acc, p) => acc + (p.stock || 0), 0)}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="success">In Stock</Badge>
                    <Text variant="bodySm" tone="subdued">total physical units</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Low Stock Alerts" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">
                    {localProducts.filter(p => (p.stock || 0) <= 10).length}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="warning">Action Recommended</Badge>
                    <Text variant="bodySm" tone="subdued">under 10 units</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Products Ledger Card */}
        <Layout.Section>
          <LegacyCard>
            <Box padding="400">
              <InlineStack gap="300" align="space-between" blockAlign="center">
                <div style={{ flex: 1, maxWidth: '400px' }}>
                  <TextField
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(val) => setSearchTerm(val)}
                    prefix={<Search size={16} />}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setSearchTerm('')}
                  />
                </div>
                <div>
                  <Select
                    label="Sort by"
                    labelInline
                    options={sortOptions}
                    value={`${sortKey}_${sortDirection}`}
                    onChange={handleSortChange}
                  />
                </div>
              </InlineStack>
            </Box>

            <IndexTable
              resourceName={{ singular: 'product', plural: 'products' }}
              itemCount={filteredProducts.length}
              loading={loading}
              headings={[
                { title: 'Item Name' },
                { title: 'HSN/SAC' },
                { title: 'Batch ID' },
                { title: 'Mfg. Date' },
                { title: 'MRP (₹)' },
                { title: 'GST' },
                { title: 'Size' },
                { title: 'Stock' },
                { title: 'Actions', alignment: 'end' }
              ]}
              selectable={false}
            >
              {paginatedProducts.map((product, index) => {
                const { id, item_name, hsn_sac, batch_id, mfg_date, mrp, gst_rate, size, stock, unit } = product;
                return (
                  <IndexTable.Row id={id} key={id} position={index}>
                    <IndexTable.Cell>
                      <Text variant="bodyMd" fontWeight="bold" as="span">
                        {item_name}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{hsn_sac || 'N/A'}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone="info">{batch_id || 'N/A'}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{mfg_date ? new Date(mfg_date).toLocaleDateString() : 'N/A'}</IndexTable.Cell>
                    <IndexTable.Cell>₹{parseFloat(mrp || 0).toFixed(2)}</IndexTable.Cell>
                    <IndexTable.Cell>{gst_rate ? `${gst_rate}%` : '0%'}</IndexTable.Cell>
                    <IndexTable.Cell>{size || 'N/A'}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="100" blockAlign="center">
                        <Badge tone={getStockBadgeTone(stock)}>
                          {stock} {unit || 'PCS'}
                        </Badge>
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '4px', justifyContent: 'flex-end', alignItems: 'center', minWidth: '100px' }}>
                        <PolarisTooltip content="Add New Batch">
                          <Button
                            icon={<GitBranch size={16} />}
                            onClick={() => handleOpenAddBatch(product)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        <PolarisTooltip content="Edit Product">
                          <Button
                            icon={<Edit size={16} />}
                            onClick={() => handleEditClick(product)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        <PolarisTooltip content="Delete Product">
                          <Button
                            icon={<Trash size={16} />}
                            onClick={() => handleDeleteProduct(id)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                      </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>

            <Box padding="400">
              <InlineStack align="center">
                <Pagination
                  hasPrevious={currentPage > 1}
                  onPrevious={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  hasNext={currentPage < totalPages}
                  onNext={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  label={`Page ${currentPage} of ${totalPages || 1}`}
                />
              </InlineStack>
            </Box>
          </LegacyCard>
        </Layout.Section>
      </Layout>

      {/* Add Batch Modal */}
      <Modal
        open={isBatchDialogOpen}
        onClose={() => setIsBatchDialogOpen(false)}
        title={batchParent ? `Add New Batch — ${batchParent.item_name}` : 'Add New Batch'}
        primaryAction={{
          content: isAddingBatch ? 'Adding...' : 'Add Batch',
          onAction: handleAddBatch,
          disabled: isAddingBatch
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setIsBatchDialogOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <Text variant="bodySm" tone="subdued">
              This will create a new local batch for <strong>{batchParent?.item_name}</strong>, linked to the same Shopify product.
              Stock on Shopify will reflect the combined total across all batches.
            </Text>
            <FormLayout.Group>
              <TextField
                label="Batch ID"
                value={batchFormData.batch_id}
                onChange={(val) => setBatchFormData({ ...batchFormData, batch_id: val })}
                placeholder="e.g. BATCH-2025-B"
                autoComplete="off"
                requiredIndicator
              />
              <TextField
                label="Mfg. Date"
                type="date"
                value={batchFormData.mfg_date}
                onChange={(val) => setBatchFormData({ ...batchFormData, mfg_date: val })}
                autoComplete="off"
              />
            </FormLayout.Group>
            <TextField
              label="Initial Stock"
              type="number"
              value={batchFormData.initial_stock}
              onChange={(val) => setBatchFormData({ ...batchFormData, initial_stock: val })}
              suffix={batchParent?.unit || 'PCS'}
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Edit Product Modal */}
      <Modal
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        title="Edit Product Details"
        primaryAction={{
          content: isSaving ? 'Saving...' : 'Save Changes',
          onAction: handleUpdateProduct,
          disabled: isSaving
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setIsEditDialogOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <FormLayout.Group condensed>
              <TextField
                label="Item Name"
                value={editFormData.item_name}
                onChange={(val) => setEditFormData({ ...editFormData, item_name: val })}
                autoComplete="off"
              />
              <TextField
                label="HSN/SAC Code"
                value={editFormData.hsn_sac}
                onChange={(val) => setEditFormData({ ...editFormData, hsn_sac: val })}
                autoComplete="off"
              />
            </FormLayout.Group>

            <FormLayout.Group condensed>
              <TextField
                label="Batch ID"
                value={editFormData.batch_id}
                onChange={(val) => setEditFormData({ ...editFormData, batch_id: val })}
                autoComplete="off"
              />
              <TextField
                label="MRP (₹)"
                type="number"
                value={editFormData.mrp}
                onChange={(val) => setEditFormData({ ...editFormData, mrp: val })}
                autoComplete="off"
              />
            </FormLayout.Group>

            <FormLayout.Group condensed>
              <TextField
                label="Size"
                value={editFormData.size}
                onChange={(val) => setEditFormData({ ...editFormData, size: val })}
                autoComplete="off"
              />
              <TextField
                label="Stock Quantity"
                type="number"
                value={editFormData.stock}
                onChange={(val) => setEditFormData({ ...editFormData, stock: val })}
                autoComplete="off"
              />
            </FormLayout.Group>

            <FormLayout.Group condensed>
              <TextField
                label="Unit (e.g. PCS, BOX)"
                value={editFormData.unit}
                onChange={(val) => setEditFormData({ ...editFormData, unit: val })}
                autoComplete="off"
              />
              <TextField
                label="GST Rate (%)"
                type="number"
                value={editFormData.gst_rate}
                onChange={(val) => setEditFormData({ ...editFormData, gst_rate: val })}
                autoComplete="off"
              />
            </FormLayout.Group>

            <TextField
              label="Mfg Date"
              type="date"
              value={editFormData.mfg_date}
              onChange={(val) => setEditFormData({ ...editFormData, mfg_date: val })}
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default AllProducts;
