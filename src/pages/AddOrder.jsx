import React, { useState, useEffect, useMemo } from 'react';
import { 
  Page, 
  Layout, 
  LegacyCard, 
  TextField, 
  Button, 
  InlineStack, 
  BlockStack, 
  Text,
  Box,
  Grid,
  Modal
} from '@shopify/polaris';
import { 
  Trash2, 
  Check,
  Printer
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PrintInvoiceDialog from '../components/PrintInvoiceDialog';
import toast from 'react-hot-toast';
import { CustomSearchableDropdown, CustomDropdownItem } from "@/components/ui/custom-dropdown";

const parseAddress = (addressStr) => {
  const result = { street: '', city: '', state: '', zip: '', country: '' };
  if (!addressStr) return result;

  const parts = addressStr.split(',').map(p => p.trim());

  const zipIndex = parts.findIndex(p => /^\d{5,6}$/.test(p));
  if (zipIndex !== -1) {
    result.zip = parts[zipIndex];
    parts.splice(zipIndex, 1);
  }

  if (parts.length >= 4) {
    result.country = parts[parts.length - 1] || '';
    result.state = parts[parts.length - 2] || '';
    result.city = parts[parts.length - 3] || '';
    result.street = parts.slice(0, parts.length - 3).filter(Boolean).join(', ');
  } else if (parts.length === 3) {
    result.state = parts[2] || '';
    result.city = parts[1] || '';
    result.street = parts[0] || '';
  } else if (parts.length === 2) {
    result.city = parts[1] || '';
    result.street = parts[0] || '';
  } else {
    result.street = parts[0] || '';
  }

  return result;
};

const joinAddress = ({ street, city, state, zip, country }) => {
  return [street, city, state, zip, country].filter(Boolean).join(', ');
};

const parseShopifyJson = (value, fallback = []) => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const formatDiscountValue = (application) => {
  const value = parseFloat(application.value || 0);
  if (application.value_type === 'percentage') {
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}%`;
  }
  return `₹${value.toFixed(2)}`;
};

const getShopifyDiscountSummary = (orderData, itemSubtotal, shippingCharges) => {
  const applications = parseShopifyJson(orderData.shopify_discount_applications);
  const codes = parseShopifyJson(orderData.shopify_discount_codes);
  const codeByIndex = codes.reduce((acc, discount, index) => {
    if (discount?.code) acc[index] = discount.code;
    return acc;
  }, {});

  let lineDiscount = 0;
  let shippingDiscount = 0;
  const visibleDiscounts = [];

  applications.forEach((application, index) => {
    if (application.type !== 'discount_code') return;

    const code = application.code || codeByIndex[index] || 'Shopify discount';
    const value = parseFloat(application.value || 0);
    const isPercentage = application.value_type === 'percentage';
    let amount = 0;

    if (application.target_type === 'line_item' && application.target_selection === 'all') {
      amount = isPercentage ? itemSubtotal * (value / 100) : value;
      lineDiscount += amount;
    } else if (application.target_type === 'shipping_line') {
      amount = isPercentage ? shippingCharges * (value / 100) : value;
      shippingDiscount += amount;
    }

    visibleDiscounts.push({
      code,
      label: formatDiscountValue(application),
      target: application.target_type === 'shipping_line' ? 'Shipping' : 'Order',
    });
  });

  const fallbackLineDiscount = parseFloat(orderData.shopify_line_item_discount || 0);
  const fallbackShippingDiscount = parseFloat(orderData.shopify_shipping_discount || 0);

  if (lineDiscount === 0 && fallbackLineDiscount > 0 && applications.length === 0) {
    lineDiscount = fallbackLineDiscount;
  }
  if (shippingDiscount === 0 && fallbackShippingDiscount > 0 && applications.length === 0) {
    shippingDiscount = fallbackShippingDiscount;
  }

  return {
    discounts: visibleDiscounts,
    lineDiscount: Math.min(Math.max(lineDiscount, 0), Math.max(itemSubtotal, 0)),
    shippingDiscount: Math.min(Math.max(shippingDiscount, 0), Math.max(shippingCharges, 0)),
  };
};

// ==========================================
// Sub-components for AddOrder page
// ==========================================

const SuccessScreen = ({
  editOrder,
  invoiceNumber,
  setIsPrintDialogOpen,
  setSuccess,
  setSelectedItems,
  generateInvoiceNumber,
  onBack,
  savedOrderForPrint,
  isPrintDialogOpen,
}) => {
  return (
    <Page>
      <div className="flex flex-col items-center justify-center min-h-[50vh] py-8">
        <div className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl p-10 shadow-xl shadow-zinc-100/50 dark:shadow-none flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Success Icon Badge */}
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 mb-8 ring-8 ring-emerald-50/50 dark:ring-emerald-950/10">
            <Check className="w-10 h-10 stroke-[3]" />
          </div>
          
          {/* Success Heading & Subtitle */}
          <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-3">
            {editOrder ? 'Order Updated Successfully' : 'Order Created Successfully'}
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mb-8 leading-relaxed">
            Invoice <span className="font-bold text-zinc-800 dark:text-zinc-200">{invoiceNumber?.startsWith('#') ? invoiceNumber : `#${invoiceNumber}`}</span> has been processed and is ready for download, sharing, or printing.
          </p>
          
          {/* Actions Grid */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full border-t border-zinc-100 dark:border-zinc-800 pt-8">
            <Button 
              variant="primary"
              icon={<Printer size={16} />}
              onClick={() => setIsPrintDialogOpen(true)}
            >
              Print Invoice
            </Button>
            {!editOrder && (
              <Button 
                onClick={() => {
                  setSuccess(false);
                  setSelectedItems([]);
                  generateInvoiceNumber();
                }}
              >
                Create Another Order
              </Button>
            )}
            <Button onClick={onBack}>Done & View Ledger</Button>
          </div>
        </div>
      </div>
      {savedOrderForPrint && (
        <PrintInvoiceDialog 
          isOpen={isPrintDialogOpen} 
          onClose={() => setIsPrintDialogOpen(false)} 
          order={savedOrderForPrint} 
        />
      )}
    </Page>
  );
};

const InvoiceParametersCard = ({
  orderData,
  setOrderData,
  referrals,
  refSearch,
  setRefSearch,
  isRefOpen,
  setIsRefOpen,
  filteredReferrals,
  generateInvoiceNumber,
}) => {
  return (
    <LegacyCard title="Invoice Parameters" sectioned>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700 flex justify-between">
            <span>Invoice Number</span>
            <button 
              type="button" 
              onClick={generateInvoiceNumber} 
              className="text-primary hover:underline text-[10px]"
            >
              Generate
            </button>
          </label>
          <Input 
            value={orderData.invoice_number}
            onChange={(e) => setOrderData({...orderData, invoice_number: e.target.value})}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Invoice Date</label>
          <Input 
            type="date"
            value={orderData.invoice_date}
            onChange={(e) => setOrderData({...orderData, invoice_date: e.target.value})}
            required
          />
        </div>

        <div className="space-y-1 relative">
          <label className="text-xs font-semibold text-gray-700">Referral Channel</label>
          <CustomSearchableDropdown
            triggerText={orderData.referral_id 
              ? referrals.find(r => r.id === orderData.referral_id)?.name 
              : "Select Referral"}
            placeholder="Search..."
            searchValue={refSearch}
            onSearchChange={setRefSearch}
            isOpen={isRefOpen}
            setIsOpen={setIsRefOpen}
          >
            <CustomDropdownItem onClick={() => {
              setOrderData({...orderData, referral_id: ''});
              setIsRefOpen(false);
            }}>
              No Referral (Direct)
            </CustomDropdownItem>
            {filteredReferrals.map(r => (
              <CustomDropdownItem 
                key={r.id} 
                onClick={() => {
                  setOrderData({...orderData, referral_id: r.id});
                  setIsRefOpen(false);
                }}
              >
                {r.name} ({r.referral_code})
              </CustomDropdownItem>
            ))}
          </CustomSearchableDropdown>
        </div>

      </div>
    </LegacyCard>
  );
};

const BillingDetailsCard = ({
  orderData,
  setOrderData,
  custSearch,
  setCustSearch,
  isCustOpen,
  setIsCustOpen,
  filteredCustomers,
  setNewCustomerName,
  setIsNewCustomerOpen,
}) => {
  const addr = parseAddress(orderData.bill_to_address || '');
  const handleAddrChange = (field, value) => {
    const updated = { ...addr, [field]: value };
    setOrderData(prev => ({
      ...prev,
      bill_to_address: joinAddress(updated)
    }));
  };

  return (
    <LegacyCard title="Billing Account Details" sectioned>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div className="space-y-1 relative">
          <label className="text-xs font-semibold text-gray-700">Bill To Customer</label>
          <CustomSearchableDropdown
            triggerText={orderData.bill_to_name || "Select Customer Profile"}
            placeholder="Search customer..."
            searchValue={custSearch}
            onSearchChange={setCustSearch}
            isOpen={isCustOpen}
            setIsOpen={setIsCustOpen}
          >
            {filteredCustomers.length === 0 ? (
              <div className="p-3 text-center">
                <p className="text-xs text-gray-500 mb-2">Not found</p>
                <Button 
                  size="slim"
                  onClick={() => {
                    setNewCustomerName(custSearch);
                    setIsNewCustomerOpen(true);
                    setIsCustOpen(false);
                  }}
                >
                  Add "{custSearch}"
                </Button>
              </div>
            ) : (
              filteredCustomers.map(c => (
                <CustomDropdownItem 
                  key={c.id} 
                  onClick={() => {
                    setOrderData(prev => ({ 
                      ...prev, 
                      bill_to_name: c.name,
                      bill_to_address: c.address || '', 
                      bill_to_phone: c.phone || '' 
                    }));
                    setIsCustOpen(false);
                  }}
                >
                  <div>
                    <p className="font-bold text-sm">{c.name}</p>
                    <p className="text-[10px] text-gray-500">{c.phone || 'No phone'}</p>
                  </div>
                </CustomDropdownItem>
              ))
            )}
          </CustomSearchableDropdown>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Billing Contact Phone</label>
          <Input 
            placeholder="Phone number"
            value={orderData.bill_to_phone || ''}
            onChange={(e) => setOrderData({...orderData, bill_to_phone: e.target.value})}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Customer Email</label>
          <Input 
            placeholder="Email address"
            value={orderData.email || ''}
            onChange={(e) => setOrderData({...orderData, email: e.target.value})}
          />
        </div>

        <div className="space-y-1 col-span-full">
          <label className="text-xs font-semibold text-gray-700">Billing Address Line 1</label>
          <Input 
            placeholder="Street Address, Apartment, Suite, etc."
            value={addr.street}
            onChange={(e) => handleAddrChange('street', e.target.value)}
          />
        </div>

        <div className="space-y-1 col-span-full">
          <label className="text-xs font-semibold text-gray-700">Billing Address Line 2 (optional)</label>
          <Input 
            placeholder="Locality, Landmark, etc."
            value={orderData.billing_address2 || ''}
            onChange={(e) => setOrderData({...orderData, billing_address2: e.target.value})}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Billing City</label>
          <Input 
            placeholder="City"
            value={addr.city}
            onChange={(e) => handleAddrChange('city', e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Billing State / Province</label>
          <Input 
            placeholder="State"
            value={addr.state}
            onChange={(e) => handleAddrChange('state', e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Billing Pincode / ZIP Code</label>
          <Input 
            placeholder="ZIP / Pincode"
            value={addr.zip}
            onChange={(e) => handleAddrChange('zip', e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Billing Country</label>
          <Input 
            placeholder="Country"
            value={addr.country}
            onChange={(e) => handleAddrChange('country', e.target.value)}
          />
        </div>

      </div>
    </LegacyCard>
  );
};

const OrderItemsCard = ({
  selectedItems,
  productSearch,
  setProductSearch,
  isProductOpen,
  setIsProductOpen,
  filteredProducts,
  addItem,
  updateItemField,
  removeItem,
  parseQuantity,
}) => {
  return (
    <LegacyCard title="Order Items" sectioned>
      <div className="flex justify-between items-center mb-4">
        <Text variant="headingMd" as="h3">Selected Products</Text>
        <div className="w-72 relative">
          <CustomSearchableDropdown
            triggerText="Add Product SKU"
            placeholder="Search product catalog..."
            searchValue={productSearch}
            onSearchChange={setProductSearch}
            isOpen={isProductOpen}
            setIsOpen={setIsProductOpen}
          >
            {filteredProducts.length === 0 ? (
              <div className="p-2 text-center text-xs text-gray-500">
                No products found
              </div>
            ) : (
              filteredProducts.map(p => (
                <CustomDropdownItem 
                  key={p.id} 
                  onClick={() => {
                    addItem(p);
                    setIsProductOpen(false);
                  }}
                >
                  <div className="flex justify-between items-center w-full">
                    <div>
                      <p className="font-semibold text-sm">{p.item_name}</p>
                      <p className="text-[10px] text-gray-500">
                        Stock: {p.stock} {p.unit} | Size: {p.size || 'N/A'}
                      </p>
                    </div>
                    <span className="font-bold text-xs text-primary">₹{p.mrp}</span>
                  </div>
                </CustomDropdownItem>
              ))
            )}
          </CustomSearchableDropdown>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Item SKU</TableHead>
              <TableHead>MRP</TableHead>
              <TableHead>Size/Unit</TableHead>
              <TableHead>Mfg Date</TableHead>
              <TableHead>Batch/HSN</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Net Total</TableHead>
              <TableHead className="text-right pr-4">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-400">
                  No items added. Choose a product SKU from the catalog to get started.
                </TableCell>
              </TableRow>
            ) : (
              selectedItems.map((item) => {
                const isRemoved = item.shopify_current_quantity === 0;
                const rowClassName = isRemoved ? 'bg-gray-50 text-gray-400' : '';
                const inputClassName = isRemoved ? 'opacity-60 line-through' : '';

                return (
                <TableRow key={item.product_id} className={rowClassName}>
                  <TableCell className="pl-4">
                    <div className="flex flex-col gap-1 w-36">
                      <Input 
                        className={`h-8 font-semibold text-xs ${inputClassName}`}
                        value={item.item_name}
                        onChange={(e) => updateItemField(item.product_id, 'item_name', e.target.value)}
                        disabled={isRemoved}
                      />
                      {isRemoved && (
                        <span className="text-[10px] font-semibold text-red-500">Removed in Shopify</span>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500">GST:</span>
                        <input 
                          type="text"
                          className={`w-10 h-5 border border-gray-300 rounded text-center text-[10px] ${inputClassName}`}
                          value={item.gst_rate}
                          onChange={(e) => updateItemField(item.product_id, 'gst_rate', parseFloat(e.target.value) || 0)}
                          disabled={isRemoved}
                        />
                        <span className="text-[10px] text-gray-500">%</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="text-xs">₹</span>
                      <Input 
                        type="text"
                        className={`w-16 h-8 text-xs text-right ${inputClassName}`}
                        value={item.mrp}
                        onChange={(e) => updateItemField(item.product_id, 'mrp', parseFloat(e.target.value) || 0)}
                        disabled={isRemoved}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 w-14">
                      <Input 
                        className={`h-6 text-[10px] px-1 ${inputClassName}`}
                        value={item.size || ''}
                        onChange={(e) => updateItemField(item.product_id, 'size', e.target.value)}
                        placeholder="Size"
                        disabled={isRemoved}
                      />
                      <Input 
                        className={`h-6 text-[10px] px-1 ${inputClassName}`}
                        value={item.unit || ''}
                        onChange={(e) => updateItemField(item.product_id, 'unit', e.target.value)}
                        placeholder="Unit"
                        disabled={isRemoved}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input 
                      className={`w-24 h-8 text-[10px] px-1 ${inputClassName}`}
                      value={item.mfg_date || ''}
                      onChange={(e) => updateItemField(item.product_id, 'mfg_date', e.target.value)}
                      placeholder="MFG date"
                      disabled={isRemoved}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 w-20">
                      <Input 
                        className={`h-6 text-[10px] px-1 ${inputClassName}`}
                        value={item.batch_id || ''}
                        onChange={(e) => updateItemField(item.product_id, 'batch_id', e.target.value)}
                        placeholder="Batch"
                        disabled={isRemoved}
                      />
                      <Input 
                        className={`h-6 text-[10px] px-1 ${inputClassName}`}
                        value={item.hsn_sac || ''}
                        onChange={(e) => updateItemField(item.product_id, 'hsn_sac', e.target.value)}
                        placeholder="HSN"
                        disabled={isRemoved}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input 
                      className={`w-16 h-8 text-xs text-center ${inputClassName}`}
                      value={item.quantity_string}
                      onChange={(e) => updateItemField(item.product_id, 'quantity_string', e.target.value)}
                      disabled={isRemoved}
                    />
                  </TableCell>
                  <TableCell className={`font-bold text-xs ${isRemoved ? 'line-through text-gray-400' : ''}`}>
                    ₹{Math.max(0, (parseQuantity(item.quantity_string, true) * item.mrp) * (1 - (parseFloat(item.discount_percent || 0) / 100))).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <Button 
                      icon={<Trash2 size={16} />} 
                      onClick={() => removeItem(item.product_id)}
                      variant="plain"
                      disabled={isRemoved}
                    />
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </LegacyCard>
  );
};

const ShippingDetailsCard = ({
  orderData,
  setOrderData,
}) => {
  const addr = parseAddress(orderData.shipping_address || '');
  const handleAddrChange = (field, value) => {
    const updated = { ...addr, [field]: value };
    setOrderData(prev => ({
      ...prev,
      shipping_address: joinAddress(updated)
    }));
  };

  return (
    <LegacyCard title="Shipping Account Details" sectioned>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Ship To Name</label>
          <Input 
            placeholder="Recipient Name"
            value={orderData.shipping_name || ''}
            onChange={(e) => setOrderData({...orderData, shipping_name: e.target.value})}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shipping Contact Phone</label>
          <Input 
            placeholder="Shipping Phone"
            value={orderData.shipping_phone || ''}
            onChange={(e) => setOrderData({...orderData, shipping_phone: e.target.value})}
          />
        </div>

        <div className="space-y-1 col-span-full">
          <label className="text-xs font-semibold text-gray-700">Shipping Address Line 1</label>
          <Input 
            placeholder="Street Address, Apartment, Suite, etc."
            value={addr.street}
            onChange={(e) => handleAddrChange('street', e.target.value)}
          />
        </div>

        <div className="space-y-1 col-span-full">
          <label className="text-xs font-semibold text-gray-700">Shipping Address Line 2 (optional)</label>
          <Input 
            placeholder="Locality, Landmark, etc."
            value={orderData.shipping_address2 || ''}
            onChange={(e) => setOrderData({...orderData, shipping_address2: e.target.value})}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shipping City</label>
          <Input 
            placeholder="City"
            value={addr.city}
            onChange={(e) => handleAddrChange('city', e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shipping State / Province</label>
          <Input 
            placeholder="State"
            value={addr.state}
            onChange={(e) => handleAddrChange('state', e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shipping Pincode / ZIP Code</label>
          <Input 
            placeholder="ZIP / Pincode"
            value={addr.zip}
            onChange={(e) => handleAddrChange('zip', e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shipping Country</label>
          <Input 
            placeholder="Country"
            value={addr.country}
            onChange={(e) => handleAddrChange('country', e.target.value)}
          />
        </div>

      </div>
    </LegacyCard>
  );
};

const OrderNotesCard = ({
  orderData,
  setOrderData,
}) => {
  return (
    <LegacyCard title="Order Notes & Sync Metadata" sectioned>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Order Tags (comma separated)</label>
          <Input 
            placeholder="e.g. wholesale, urgent, cod"
            value={orderData.tags || ''}
            onChange={(e) => setOrderData({...orderData, tags: e.target.value})}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shipping Carrier / Method</label>
          <Input 
            placeholder="e.g. Standard, BlueDart, DTDC"
            value={orderData.shipping_carrier || ''}
            onChange={(e) => setOrderData({...orderData, shipping_carrier: e.target.value})}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shopify Financial Status</label>
          <select 
            className="w-full h-10 border border-gray-300 rounded px-3 text-sm bg-white cursor-pointer"
            value={orderData.shopify_financial_status || ''}
            onChange={(e) => setOrderData({...orderData, shopify_financial_status: e.target.value})}
          >
            <option value="">Select Financial Status</option>
            <option value="pending">Pending</option>
            <option value="authorized">Authorized</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="partially_refunded">Partially Refunded</option>
            <option value="refunded">Refunded</option>
            <option value="voided">Voided</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shopify Fulfillment Status</label>
          <select 
            className="w-full h-10 border border-gray-300 rounded px-3 text-sm bg-white cursor-pointer"
            value={orderData.shopify_fulfillment_status || ''}
            onChange={(e) => setOrderData({...orderData, shopify_fulfillment_status: e.target.value || null})}
          >
            <option value="">Unfulfilled</option>
            <option value="partial">Partially Fulfilled</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="restocked">Restocked</option>
          </select>
        </div>

        <div className="space-y-1 col-span-full">
          <label className="text-xs font-semibold text-gray-700">Shopify Order Note</label>
          <Textarea 
            placeholder="Enter special instructions or notes..."
            rows={2}
            value={orderData.shopify_order_note || ''}
            onChange={(e) => setOrderData({...orderData, shopify_order_note: e.target.value})}
          />
        </div>

      </div>
    </LegacyCard>
  );
};

const InvoiceSummaryCard = ({
  grossSubtotal,
  totalDiscount,
  subtotal,
  taxableSubtotal,
  gstAmount,
  shopifyDiscountSummary,
  discountedShipping,
  orderData,
  setOrderData,
  totalAmount,
  finalAmount,
  loading,
  selectedItems,
  editOrder,
}) => {
  return (
    <LegacyCard title="Invoice Summary" sectioned>
      <BlockStack gap="400">
        
        <InlineStack align="space-between">
          <Text variant="bodyMd" tone="subdued">Item Subtotal:</Text>
          <Text variant="bodyMd" fontWeight={totalDiscount > 0 ? "regular" : "bold"} textDecorationLine={totalDiscount > 0 ? "line-through" : "none"}>
            ₹{grossSubtotal?.toFixed(2) || subtotal?.toFixed(2)}
          </Text>
        </InlineStack>

        {totalDiscount > 0 && (
          <InlineStack align="space-between">
            <Text variant="bodyMd" tone="subdued">Discount Applied:</Text>
            <Text variant="bodyMd" tone="success" fontWeight="bold">- ₹{totalDiscount.toFixed(2)}</Text>
          </InlineStack>
        )}

        {totalDiscount > 0 && (
          <InlineStack align="space-between">
            <Text variant="bodyMd" tone="subdued">Net Item Subtotal:</Text>
            <Text variant="bodyMd" fontWeight="bold">₹{subtotal.toFixed(2)}</Text>
          </InlineStack>
        )}

        {shopifyDiscountSummary?.discounts?.length > 0 && (
          <Box padding="300" background="bg-fill-info-subdued" borderRadius="200">
            <BlockStack gap="200">
              <Text variant="bodySm" fontWeight="bold">Shopify coupon applied</Text>
              {shopifyDiscountSummary.discounts.map((discount, index) => (
                <InlineStack key={`${discount.code}-${index}`} align="space-between">
                  <Text variant="bodySm" tone="subdued">{discount.code} · {discount.target}</Text>
                  <Text variant="bodySm" fontWeight="bold">{discount.label}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Box>
        )}

        {shopifyDiscountSummary?.lineDiscount > 0 && (
          <InlineStack align="space-between">
            <Text variant="bodyMd" tone="subdued">Shopify Coupon Discount:</Text>
            <Text variant="bodyMd" tone="success" fontWeight="bold">- ₹{shopifyDiscountSummary.lineDiscount.toFixed(2)}</Text>
          </InlineStack>
        )}

        {shopifyDiscountSummary?.lineDiscount > 0 && (
          <InlineStack align="space-between">
            <Text variant="bodyMd" tone="subdued">Discounted Item Subtotal:</Text>
            <Text variant="bodyMd" fontWeight="bold">₹{taxableSubtotal.toFixed(2)}</Text>
          </InlineStack>
        )}

        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text variant="bodyMd" tone="subdued">GST Charges:</Text>
            <Text variant="bodyXs" tone="subdued">Applicable on rates</Text>
          </BlockStack>
          <InlineStack gap="200" blockAlign="center">
            {orderData.apply_gst && (
              <Text variant="bodyMd" fontWeight="bold">₹{gstAmount.toFixed(2)}</Text>
            )}
            <Switch 
              checked={orderData.apply_gst}
              onCheckedChange={(checked) => setOrderData({...orderData, apply_gst: checked})}
            />
          </InlineStack>
        </InlineStack>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">Shipping Fees (₹)</label>
          <Input 
            type="number"
            className="text-right"
            value={orderData.shipping_charges}
            onChange={(e) => setOrderData({...orderData, shipping_charges: e.target.value})}
          />
        </div>

        <Box borderBlockStartWidth="025" borderColor="border-subdued" paddingBlockStart="300">
          <InlineStack align="space-between">
            <Text variant="headingMd" as="span" fontWeight="bold">Gross Bill Amount:</Text>
            <Text variant="headingLg" as="span" fontWeight="bold" tone="magic">₹{totalAmount.toFixed(2)}</Text>
          </InlineStack>
          {shopifyDiscountSummary?.shippingDiscount > 0 && (
            <InlineStack align="space-between">
              <Text variant="bodySm" tone="subdued">Discounted Shipping:</Text>
              <Text variant="bodySm" fontWeight="bold">₹{discountedShipping.toFixed(2)}</Text>
            </InlineStack>
          )}
        </Box>

        <div className="space-y-1">
          <label className="text-xs font-bold text-green-700">Settled Money Received (₹)</label>
          <Input 
            type="number"
            className="text-right border-green-300 font-bold text-green-700 bg-green-50/50"
            value={orderData.received_amount}
            onChange={(e) => setOrderData({...orderData, received_amount: e.target.value})}
          />
        </div>

        <Box padding="300" background={finalAmount > 0 ? "bg-fill-danger-subdued" : "bg-fill-success-subdued"} borderRadius="200">
          <BlockStack gap="050" align="center">
            <Text variant="bodyXs" tone="subdued">Open Ledger Balance</Text>
            <Text variant="headingMd" as="p" fontWeight="bold" tone={finalAmount > 0 ? "critical" : "success"}>
              ₹{Math.abs(finalAmount).toFixed(2)} {finalAmount > 0 ? '(Due)' : finalAmount < 0 ? '(Advance)' : '(Settled)'}
            </Text>
          </BlockStack>
        </Box>

        <Box paddingBlockStart="200">
          <Button 
            submit 
            variant="primary" 
            fullWidth 
            size="large"
            loading={loading}
            disabled={selectedItems.length === 0}
          >
            {editOrder ? 'Update Invoice' : 'Issue Invoice'}
          </Button>
        </Box>

      </BlockStack>
    </LegacyCard>
  );
};

const QuickCustomerModal = ({
  isNewCustomerOpen,
  setIsNewCustomerOpen,
  newCustomerName,
  setNewCustomerName,
  setOrderData,
  setCustSearch,
}) => {
  return (
    <Modal
      open={isNewCustomerOpen}
      onClose={() => setIsNewCustomerOpen(false)}
      title="Quick Create Customer Account"
      primaryAction={{
        content: 'Set and Close',
        onAction: () => {
          setOrderData(prev => ({ 
            ...prev, 
            bill_to_name: newCustomerName,
            bill_to_address: '',
            bill_to_phone: ''
          }));
          setIsNewCustomerOpen(false);
          setCustSearch('');
          toast.success('Customer profile assigned');
        }
      }}
    >
      <Modal.Section>
        <TextField
          label="Customer Full Name"
          value={newCustomerName}
          onChange={(val) => setNewCustomerName(val)}
          autoComplete="off"
        />
      </Modal.Section>
    </Modal>
  );
};

const QuickReferralModal = ({
  isNewReferralOpen,
  setIsNewReferralOpen,
  newReferralName,
  setNewReferralName,
  setReferrals,
  setOrderData,
  setRefSearch,
}) => {
  return (
    <Modal
      open={isNewReferralOpen}
      onClose={() => setIsNewReferralOpen(false)}
      title="Quick Register Partner Account"
      primaryAction={{
        content: 'Create Referral Code',
        onAction: async () => {
          if (!newReferralName) return;
          try {
            const res = await window.api.addPartner({ 
              name: newReferralName, 
              phone: '', 
              referral_code: newReferralName.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000)
            });
            if (res.success) {
              toast.success('Referral code registered');
              const updatedRes = await window.api.getPartners();
              if (updatedRes.success) {
                setReferrals(updatedRes.partners);
                // Find the added partner's id
                const added = updatedRes.partners.find(p => p.name === newReferralName);
                if (added) {
                  setOrderData(prev => ({ ...prev, referral_id: added.id }));
                }
              }
              setIsNewReferralOpen(false);
              setRefSearch('');
            } else {
              toast.error(res.error || 'Failed to create');
            }
          } catch (e) {
            toast.error(e.message);
          }
        }
      }}
    >
      <Modal.Section>
        <TextField
          label="Partner Name"
          value={newReferralName}
          onChange={(val) => setNewReferralName(val)}
          autoComplete="off"
        />
      </Modal.Section>
    </Modal>
  );
};

const AddOrder = ({ onBack, editOrder }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [savedOrderForPrint, setSavedOrderForPrint] = useState(null);
  
  // Quick Creation State
  const [isNewReferralOpen, setIsNewReferralOpen] = useState(false);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [newReferralName, setNewReferralName] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  
  // Data from DB
  const [products, setProducts] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  // Form State
  const [orderData, setOrderData] = useState({
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    referral_id: '',
    bill_to_name: '',
    bill_to_address: '',
    bill_to_phone: '',
    shipping_charges: 0,
    received_amount: 0,
    apply_gst: false,
    email: '',
    shipping_name: '',
    shipping_address: '',
    shipping_phone: '',
    tags: '',
    shipping_carrier: '',
    shopify_financial_status: '',
    shopify_fulfillment_status: '',
    shopify_order_note: '',
    billing_address2: '',
    shipping_address2: '',
    shopify_discount_codes: '',
    shopify_discount_applications: '',
    shopify_total_discounts: 0,
    shopify_line_item_discount: 0,
    shopify_shipping_discount: 0,
  });
  
  const [selectedItems, setSelectedItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [refSearch, setRefSearch] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [isRefOpen, setIsRefOpen] = useState(false);
  const [isCustOpen, setIsCustOpen] = useState(false);
  const [isProductOpen, setIsProductOpen] = useState(false);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(custSearch))
    );
  }, [customers, custSearch]);

  // Load initial databases
  useEffect(() => {
    fetchInitialData();
    
    if (editOrder) {
      setOrderData({
        invoice_number: editOrder.invoice_number,
        invoice_date: editOrder.invoice_date ? editOrder.invoice_date.split('T')[0] : new Date().toISOString().split('T')[0],
        referral_id: editOrder.referral_id || '',
        bill_to_name: editOrder.bill_to_name,
        bill_to_address: editOrder.bill_to_address || '',
        bill_to_phone: editOrder.bill_to_phone || '',
        shipping_charges: editOrder.shipping_charges || 0,
        received_amount: editOrder.received_amount || 0,
        apply_gst: editOrder.apply_gst || false,
        email: editOrder.email || '',
        shipping_name: editOrder.shipping_name || '',
        shipping_address: editOrder.shipping_address || '',
        shipping_phone: editOrder.shipping_phone || '',
        tags: editOrder.tags || '',
        shipping_carrier: editOrder.shipping_carrier || '',
        shopify_financial_status: editOrder.shopify_financial_status || '',
        shopify_fulfillment_status: editOrder.shopify_fulfillment_status || '',
        shopify_order_note: editOrder.shopify_order_note || '',
        billing_address2: editOrder.billing_address2 || '',
        shipping_address2: editOrder.shipping_address2 || '',
        shopify_discount_codes: editOrder.shopify_discount_codes || '',
        shopify_discount_applications: editOrder.shopify_discount_applications || '',
        shopify_total_discounts: editOrder.shopify_total_discounts || 0,
        shopify_line_item_discount: editOrder.shopify_line_item_discount || 0,
        shopify_shipping_discount: editOrder.shopify_shipping_discount || 0,
      });
      fetchOrderItems(editOrder);
    } else {
      // Load draft order from localStorage if it exists
      const savedData = localStorage.getItem('draft_order_data');
      const savedItems = localStorage.getItem('draft_order_items');
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setOrderData(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error("Error parsing saved draft order data", e);
        }
      } else {
        generateInvoiceNumber();
      }
      if (savedItems) {
        try {
          setSelectedItems(JSON.parse(savedItems));
        } catch (e) {
          console.error("Error parsing saved draft order items", e);
        }
      }
    }
  }, [editOrder]);

  // Sync draft to localStorage
  useEffect(() => {
    if (!editOrder && !success) {
      localStorage.setItem('draft_order_data', JSON.stringify(orderData));
    }
  }, [orderData, editOrder, success]);

  useEffect(() => {
    if (!editOrder && !success) {
      localStorage.setItem('draft_order_items', JSON.stringify(selectedItems));
    }
  }, [selectedItems, editOrder, success]);

  const fetchInitialData = async () => {
    const productsRes = await window.api.getProducts();
    if (productsRes.success) setProducts(productsRes.products);

    const referralsRes = await window.api.getPartners();
    if (referralsRes.success) setReferrals(referralsRes.partners);

    const customersRes = await window.api.getCustomers();
    if (customersRes.success) setCustomers(customersRes.customers);
  };

  const fetchOrderItems = async (orderOrId) => {
    const orderId = typeof orderOrId === 'object' ? orderOrId.id : orderOrId;
    const shopifyOrderId = typeof orderOrId === 'object' ? orderOrId.shopify_order_id : null;

    if (shopifyOrderId && window.api.refreshShopifyOrderItemState) {
      await window.api.refreshShopifyOrderItemState(shopifyOrderId, orderId).catch((err) => {
        console.error('Failed to refresh Shopify item state:', err);
      });
    }

    const res = await window.api.getOrderItems(orderId);
    if (res.success) {
      setSelectedItems(res.items.map(item => {
        const chargeableQty = parseFloat(String(item.quantity_string || '0').split('+')[0]) || 0;
        const unitPrice = parseFloat(item.price_per_item || item.mrp || 0);
        const totalDiscount = parseFloat(item.total_discount || 0);
        const grossTotal = chargeableQty * unitPrice;
        let discountPercent = 0;
        if (grossTotal > 0 && !isNaN(grossTotal) && !isNaN(totalDiscount)) {
          discountPercent = (totalDiscount / grossTotal) * 100;
        }
        return {
          product_id: item.product_id,
          item_name: item.item_name,
          mrp: unitPrice,
          unit: item.unit,
          size: item.size,
          batch_id: item.batch_id,
          hsn_sac: item.hsn_sac,
          gst_rate: item.gst_rate || 0,
          quantity_string: String(item.quantity_string || ''),
          shopify_current_quantity: item.shopify_current_quantity ?? null,
          mfg_date: item.mfg_date || '',
          total_discount: totalDiscount,
          discount_percent: Math.round(discountPercent * 100) / 100
        };
      }));
    }
  };

  const generateInvoiceNumber = async () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    // Call DB count to generate increment ID
    const countRes = await window.api.getOrdersCount();
    const nextNum = (countRes.count + 1).toString().padStart(4, '0');
    
    setOrderData(prev => ({
      ...prev,
      invoice_number: `INV-${year}${month}-${nextNum}`
    }));
  };

  const clearForm = () => {
    if (!confirm('Clear all fields? Draft progress will be reset.')) return;
    
    localStorage.removeItem('draft_order_data');
    localStorage.removeItem('draft_order_items');
    
    setSelectedItems([]);
    setOrderData({
      invoice_number: '',
      invoice_date: new Date().toISOString().split('T')[0],
      referral_id: '',
      bill_to_name: '',
      bill_to_address: '',
      bill_to_phone: '',
      shipping_charges: 0,
      received_amount: 0,
      apply_gst: false,
      billing_address2: '',
      shipping_address2: '',
      shopify_discount_codes: '',
      shopify_discount_applications: '',
      shopify_total_discounts: 0,
      shopify_line_item_discount: 0,
      shopify_shipping_discount: 0,
    });
    generateInvoiceNumber();
    toast.success('Form cleared');
  };

  const filteredProducts = products.filter(p => 
    p.item_name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredReferrals = referrals.filter(r => 
    r.name.toLowerCase().includes(refSearch.toLowerCase()) || 
    (r.phone && r.phone.includes(refSearch))
  );

  const addItem = (product) => {
    const exists = selectedItems.find(item => item.product_id === product.id);
    if (exists) {
      toast.error('Product already added');
      return;
    }
    
    setSelectedItems([...selectedItems, {
      product_id: product.id,
      item_name: product.item_name,
      mrp: product.mrp,
      unit: product.unit,
      size: product.size,
      batch_id: product.batch_id,
      hsn_sac: product.hsn_sac,
      gst_rate: product.gst_rate || 0,
      quantity_string: '1', // Default quantity
      mfg_date: product.mfg_date || '',
    }]);
    setProductSearch('');
  };

  const removeItem = (productId) => {
    setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
  };

  const updateItemField = (productId, field, value) => {
    setSelectedItems(selectedItems.map(item => 
      item.product_id === productId ? { ...item, [field]: value } : item
    ));
  };

  const parseQuantity = (qtyStr, chargeableOnly = false) => {
    const parts = qtyStr.split('+').map(p => parseFloat(p.trim()) || 0);
    if (chargeableOnly) return parts[0] || 0;
    return parts.reduce((a, b) => a + b, 0);
  };

  const { grossSubtotal, totalDiscount, subtotal, gstAmount } = useMemo(() => {
    let grossSub = 0;
    let totDisc = 0;
    let sub = 0;
    let gst = 0;
    selectedItems.forEach(item => {
      if (item.shopify_current_quantity === 0) return;
      const q = parseQuantity(item.quantity_string, true);
      const discountPercent = parseFloat(item.discount_percent || 0);
      const itemGross = q * item.mrp;
      const discount = Math.max(0, itemGross * discountPercent / 100);
      const itemSubtotal = Math.max(0, itemGross - discount);
      grossSub += itemGross;
      totDisc += discount;
      sub += itemSubtotal;
      if (orderData.apply_gst) {
        gst += (itemSubtotal * (item.gst_rate || 0)) / 100;
      }
    });
    return { grossSubtotal: grossSub, totalDiscount: totDisc, subtotal: sub, gstAmount: gst };
  }, [selectedItems, orderData.apply_gst]);

  const shippingCharges = parseFloat(orderData.shipping_charges) || 0;
  const shopifyDiscountSummary = useMemo(
    () => getShopifyDiscountSummary(orderData, subtotal, shippingCharges),
    [
      orderData.shopify_discount_applications,
      orderData.shopify_discount_codes,
      orderData.shopify_line_item_discount,
      orderData.shopify_shipping_discount,
      subtotal,
      shippingCharges
    ]
  );
  const taxableSubtotal = Math.max(0, subtotal - shopifyDiscountSummary.lineDiscount);
  const gstAmountAfterShopifyDiscount = subtotal > 0 ? gstAmount * (taxableSubtotal / subtotal) : 0;
  const discountedShipping = Math.max(0, shippingCharges - shopifyDiscountSummary.shippingDiscount);
  const totalAmount = taxableSubtotal + gstAmountAfterShopifyDiscount + discountedShipping;
  const finalAmount = totalAmount - (parseFloat(orderData.received_amount) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      toast.error('Please add at least one product');
      return;
    }

    setLoading(true);
    let finalInvoiceDate = orderData.invoice_date;
    if (finalInvoiceDate) {
      const todayStr = new Date().toLocaleDateString('en-CA');
      if (finalInvoiceDate === todayStr) {
        finalInvoiceDate = new Date().toISOString();
      } else if (!finalInvoiceDate.includes('T')) {
        finalInvoiceDate = new Date(finalInvoiceDate + 'T12:00:00').toISOString();
      }
    } else {
      finalInvoiceDate = new Date().toISOString();
    }

    const finalOrderData = {
      ...orderData,
      invoice_date: finalInvoiceDate,
      total_amount: totalAmount,
      final_amount: finalAmount,
      shipping_charges: parseFloat(orderData.shipping_charges) || 0,
      received_amount: parseFloat(orderData.received_amount) || 0,
    };

    const itemsWithCalculations = selectedItems.map(item => {
      if (item.shopify_current_quantity === 0) {
        return {
          ...item,
          price_per_item: item.mrp,
          total: 0,
          total_discount: 0
        };
      }
      const chargeableQty = parseQuantity(item.quantity_string, true);
      const discountPercent = parseFloat(item.discount_percent || 0);
      const itemTotal = chargeableQty * item.mrp;
      const discount = Math.max(0, itemTotal * discountPercent / 100);
      return {
        ...item,
        price_per_item: item.mrp,
        total: Math.max(0, itemTotal - discount),
        total_discount: discount
      };
    });

    const promise = editOrder 
      ? window.api.updateOrder(editOrder.id, finalOrderData, itemsWithCalculations)
      : window.api.createOrder(finalOrderData, itemsWithCalculations);

    try {
      const result = await toast.promise(
        promise.then(res => {
          if (!res.success) {
            let errorMsg = res.error || 'Unknown error';
            if (errorMsg.includes('UNIQUE constraint failed: orders.invoice_number')) {
              errorMsg = 'Invoice number already exists. Please use a different one.';
            }
            throw new Error(errorMsg);
          }
          return res;
        }),
        {
          loading: editOrder ? 'Updating order...' : 'Creating order...',
          success: editOrder ? 'Order updated successfully!' : 'Order created successfully!',
          error: (err) => `${err.message}`,
        }
      );

      if (!editOrder) {
        localStorage.removeItem('draft_order_data');
        localStorage.removeItem('draft_order_items');
      }
      
      const selectedPartner = referrals.find(p => p.id === parseInt(orderData.referral_id));
      const referralCode = selectedPartner ? selectedPartner.referral_code : '';

      setSavedOrderForPrint({
        ...finalOrderData,
        id: result.id,
        referral_code: referralCode,
        items: itemsWithCalculations.map(item => ({
          ...item,
          quantity: parseQuantity(item.quantity_string)
        }))
      });
      setSuccess(true);
    } catch (err) {
      console.error("Order submission error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SuccessScreen
        editOrder={editOrder}
        invoiceNumber={orderData.invoice_number}
        setIsPrintDialogOpen={setIsPrintDialogOpen}
        setSuccess={setSuccess}
        setSelectedItems={setSelectedItems}
        generateInvoiceNumber={generateInvoiceNumber}
        onBack={onBack}
        savedOrderForPrint={savedOrderForPrint}
        isPrintDialogOpen={isPrintDialogOpen}
      />
    );
  }

  return (
    <Page
      backAction={{ content: 'Orders', onAction: onBack }}
      title={editOrder ? "Edit Order details" : "Add New Invoice"}
      subtitle="Assemble inventory orders, reference discounts, and log receivables"
      compactTitle
      secondaryActions={!editOrder ? [
        {
          content: 'Clear Draft',
          onAction: clearForm,
          destructive: true
        }
      ] : []}
    >
      <Layout>
        <Layout.Section>
          <form onSubmit={handleSubmit}>
            <Grid>
              {/* Upper Left Form: Parameters & Billing */}
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 8, lg: 8, xl: 8 }}>
                <BlockStack gap="500">
                  {/* Order Parameters */}
                  <InvoiceParametersCard
                    orderData={orderData}
                    setOrderData={setOrderData}
                    referrals={referrals}
                    refSearch={refSearch}
                    setRefSearch={setRefSearch}
                    isRefOpen={isRefOpen}
                    setIsRefOpen={setIsRefOpen}
                    filteredReferrals={filteredReferrals}
                    generateInvoiceNumber={generateInvoiceNumber}
                  />

                  {/* Customer Billing details */}
                  <BillingDetailsCard
                    orderData={orderData}
                    setOrderData={setOrderData}
                    custSearch={custSearch}
                    setCustSearch={setCustSearch}
                    isCustOpen={isCustOpen}
                    setIsCustOpen={setIsCustOpen}
                    filteredCustomers={filteredCustomers}
                    setNewCustomerName={setNewCustomerName}
                    setIsNewCustomerOpen={setIsNewCustomerOpen}
                  />
                </BlockStack>
              </Grid.Cell>

              {/* Upper Right Column: Summary Calculations */}
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                <InvoiceSummaryCard
                  grossSubtotal={grossSubtotal}
                  totalDiscount={totalDiscount}
                  subtotal={subtotal}
                  taxableSubtotal={taxableSubtotal}
                  gstAmount={gstAmountAfterShopifyDiscount}
                  shopifyDiscountSummary={shopifyDiscountSummary}
                  discountedShipping={discountedShipping}
                  orderData={orderData}
                  setOrderData={setOrderData}
                  totalAmount={totalAmount}
                  finalAmount={finalAmount}
                  loading={loading}
                  selectedItems={selectedItems}
                  editOrder={editOrder}
                />
              </Grid.Cell>

              {/* Middle: Order Items - Full Width */}
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 12, lg: 12, xl: 12 }}>
                <OrderItemsCard
                  selectedItems={selectedItems}
                  productSearch={productSearch}
                  setProductSearch={setProductSearch}
                  isProductOpen={isProductOpen}
                  setIsProductOpen={setIsProductOpen}
                  filteredProducts={filteredProducts}
                  addItem={addItem}
                  updateItemField={updateItemField}
                  removeItem={removeItem}
                  parseQuantity={parseQuantity}
                />
              </Grid.Cell>

              {/* Lower Left Form: Shipping & Notes */}
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 8, lg: 8, xl: 8 }}>
                <BlockStack gap="500">
                  {/* Customer Shipping details */}
                  <ShippingDetailsCard
                    orderData={orderData}
                    setOrderData={setOrderData}
                  />

                  {/* Order Notes & Sync Metadata */}
                  <OrderNotesCard
                    orderData={orderData}
                    setOrderData={setOrderData}
                  />
                </BlockStack>
              </Grid.Cell>
            </Grid>
          </form>
        </Layout.Section>
      </Layout>

      {/* Quick Add Dialogs */}
      <QuickCustomerModal
        isNewCustomerOpen={isNewCustomerOpen}
        setIsNewCustomerOpen={setIsNewCustomerOpen}
        newCustomerName={newCustomerName}
        setNewCustomerName={setNewCustomerName}
        setOrderData={setOrderData}
        setCustSearch={setCustSearch}
      />

      <QuickReferralModal
        isNewReferralOpen={isNewReferralOpen}
        setIsNewReferralOpen={setIsNewReferralOpen}
        newReferralName={newReferralName}
        setNewReferralName={setNewReferralName}
        setReferrals={setReferrals}
        setOrderData={setOrderData}
        setRefSearch={setRefSearch}
      />

      {savedOrderForPrint && (
        <PrintInvoiceDialog 
          isOpen={isPrintDialogOpen} 
          onClose={() => setIsPrintDialogOpen(false)} 
          order={savedOrderForPrint} 
        />
      )}
    </Page>
  );
};

export default AddOrder;
