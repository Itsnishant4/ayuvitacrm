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
  Grid,
  Select,
  Pagination,
  Popover as PolarisPopover,
  DatePicker,
  Modal,
  Spinner
} from '@shopify/polaris';
import { Search, Edit, Trash, FileDown, Plus, ListOrdered, Calendar as CalendarIcon, Printer, Share, MessageSquare, Eye, RefreshCw, Ban } from "lucide-react";
import PolarisTooltip from '../components/PolarisTooltip';
import toast from 'react-hot-toast';
import PrintInvoiceDialog from '../components/PrintInvoiceDialog';
import { format } from "date-fns";
import { exportToCSV } from '../lib/exportUtils';
import { useData } from '../contexts/DataContext';


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

const formatDateWithTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const pad = (num) => String(num).padStart(2, '0');
  
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

  // If the original date string has a time part
  const hasTime = dateStr.includes('T') || dateStr.includes(':');
  if (!hasTime) {
    return `${day}/${month}/${year}`;
  }

  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const formattedHours = pad(hours);

  return `${day}/${month}/${year} ${formattedHours}:${minutes} ${ampm}`;
};


const getPaymentBadge = (order) => {
  if (order.status === 'cancelled') {
    return <Badge tone="critical">CANCELLED</Badge>;
  }
  const status = order.shopify_financial_status || (order.final_amount <= 0 ? 'paid' : 'pending');
  let tone = 'warning';
  if (status === 'paid') tone = 'success';
  else if (['refunded', 'voided', 'partially_refunded'].includes(status)) tone = 'critical';
  
  const label = status.replace('_', ' ').toUpperCase();
  return <Badge tone={tone}>{label}</Badge>;
};

const getFulfillmentBadge = (order) => {
  if (order.status === 'cancelled') {
    return <Badge tone="critical">CANCELLED</Badge>;
  }
  const status = order.shopify_fulfillment_status || 'unfulfilled';
  let tone = 'critical';
  if (status === 'fulfilled') tone = 'success';
  else if (status === 'partial') tone = 'warning';
  
  const label = status.toUpperCase();
  return <Badge tone={tone}>{label}</Badge>;
};

const getDeliveryBadge = (order) => {
  if (order.status === 'cancelled') {
    return <Badge tone="critical">CANCELLED</Badge>;
  }
  const status = order.delivery_status || 'pending';
  let tone = 'warning';
  if (status === 'delivered') tone = 'success';
  else if (['in_transit', 'out_for_delivery', 'confirmed'].includes(status)) tone = 'info';
  else if (['failure', 'exception', 'undelivered'].includes(status)) tone = 'critical';
  
  const label = status.replace('_', ' ').toUpperCase();
  return <Badge tone={tone}>{label}</Badge>;
};

const renderTags = (tagsStr) => {
  if (!tagsStr) return <Text tone="subdued">-</Text>;
  const tagList = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
  if (tagList.length === 0) return <Text tone="subdued">-</Text>;
  return (
    <InlineStack gap="100">
      {tagList.map((tag, idx) => (
        <Badge key={idx}>{tag}</Badge>
      ))}
    </InlineStack>
  );
};

const ManageOrders = ({ user, onEdit, onNavigate }) => {
  const { orders, partners, loading: ctxLoading, fetchOrders, fetchPartners } = useData();
  const [localOrders, setLocalOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState('invoice_date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [sortColumnIndex, setSortColumnIndex] = useState(1);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [datePopoverActive, setDatePopoverActive] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [allowedCodes, setAllowedCodes] = useState([]);
  
  // Date Range Filter States
  const [dateRange, setDateRange] = useState({
    from: undefined,
    to: undefined,
  });
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchOrders().then(res => {
      if (res.success) setLocalOrders(res.orders);
      setLoading(false);
    });
    fetchPartners(user?.referral_code, user?.role);
  }, []);

  useEffect(() => {
    if (orders) setLocalOrders(orders);
  }, [orders]);

  useEffect(() => {
    if (['state_franchisee', 'city_franchisee'].includes(user?.role) && partners) {
      const codes = partners.map(p => p.referral_code.toLowerCase());
      setAllowedCodes(codes);
    }
  }, [partners, user?.role]);

  const getPartnerByCode = (code) => {
    if (!code || !partners) return null;
    return partners.find(p => p.referral_code.toLowerCase() === code.toLowerCase());
  };

  const getChainNodes = (referralCode) => {
    if (!referralCode || !partners) return [];
    
    const partner = getPartnerByCode(referralCode);
    if (!partner) return [{ name: referralCode, referral_code: referralCode, role: 'retailer' }];
    
    const nodes = [];
    let current = partner;
    let depth = 0;
    const franchiseeRoles = ['state_franchisee', 'city_franchisee'];
    
    while (current && depth < 10) {
      if (franchiseeRoles.includes(user?.role) && current.referral_code.toLowerCase() === user.referral_code.toLowerCase()) {
        break;
      }
      
      nodes.unshift(current);
      if (current.parent_code) {
        const parent = partners.find(p => p.referral_code.toLowerCase() === current.parent_code.toLowerCase());
        if (parent) {
          current = parent;
        } else {
          if (franchiseeRoles.includes(user?.role) && current.parent_code.toLowerCase() === user.referral_code.toLowerCase()) {
            break;
          }
          nodes.unshift({ name: current.parent_code, referral_code: current.parent_code, role: 'state_franchisee' });
          break;
        }
      } else {
        break;
      }
      depth++;
    }
    
    return nodes;
  };

  const getRoleColors = (role) => {
    switch (role) {
      case 'state_franchisee':
        return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900';
      case 'city_franchisee':
        return 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900';
      case 'retailer':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900';
      case 'sub_retailer':
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900';
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700';
    }
  };

  const getHierarchyDetails = (referralCode) => {
    if (!referralCode) return '—';
    const partner = getPartnerByCode(referralCode);
    if (!partner) return referralCode;
    
    const chain = [];
    let current = partner;
    let depth = 0;
    const franchiseeRoles = ['state_franchisee', 'city_franchisee'];
    
    while (current && depth < 10) {
      if (franchiseeRoles.includes(user?.role) && current.referral_code.toLowerCase() === user.referral_code.toLowerCase()) {
        break;
      }
      
      chain.unshift(`${current.name} (${current.referral_code})`);
      if (current.parent_code) {
        const parent = partners.find(p => p.referral_code.toLowerCase() === current.parent_code.toLowerCase());
        if (parent) {
          current = parent;
        } else {
          if (franchiseeRoles.includes(user?.role) && current.parent_code.toLowerCase() === user.referral_code.toLowerCase()) {
            break;
          }
          chain.unshift(current.parent_code);
          break;
        }
      } else {
        break;
      }
      depth++;
    }
    
    return chain.join(' → ') || 'Self';
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortKey, sortDirection, dateRange]);

  const refetchOrders = async () => {
    setLoading(true);
    const result = await fetchOrders(true);
    if (result.success) setLocalOrders(result.orders);
    setLoading(false);
  };

  const handleDeleteOrder = async (id) => {
    if (!confirm('Are you sure you want to delete this order? This action cannot be undone.')) return;
    
    const promise = (async () => {
      const result = await window.api.deleteOrder(id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete order');
      }
      return result;
    })();

    toast.promise(promise, {
      loading: 'Deleting order...',
      success: 'Order deleted successfully!',
      error: (err) => `Error: ${err.message}`,
    });

    try {
      await promise;
      setLocalOrders(prev => prev.filter(o => o.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelOrder = async (id) => {
    if (!confirm('Are you sure you want to cancel this order? This will restore stock levels for all products in this order.')) {
      return;
    }
    setLoading(true);
    const result = await window.api.cancelOrder(id);
    if (result.success) {
      toast.success("Order cancelled successfully!");
      refetchOrders();
    } else {
      toast.error("Failed to cancel order: " + result.error);
    }
    setLoading(false);
  };

  const handleShareWhatsApp = (order, type = 'invoice') => {
    const phone = order.bill_to_phone?.replace(/\D/g, '');
    if (!phone) {
      toast.error("Customer phone number not found!");
      return;
    }
    
    let message = "";
    if (type === 'reminder') {
      const dueAmount = order.final_amount.toFixed(2);
      const invoiceLabel = order.invoice_number?.startsWith('#') ? order.invoice_number : `#${order.invoice_number}`;
      message = `Hello ${order.bill_to_name},\n\nThis is a friendly reminder regarding your outstanding payment of *₹${dueAmount}* for Invoice *${invoiceLabel}*.\n\nPlease clear the balance at your earliest convenience.\n\nThank you!`;
    } else {
      const invoiceLabel = order.invoice_number?.startsWith('#') ? order.invoice_number : `#${order.invoice_number}`;
      message = `Hello ${order.bill_to_name},\n\nHere is your Invoice *${invoiceLabel}* for *₹${order.total_amount.toFixed(2)}*.\n\nThank you for your business!`;
    }

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    
    if (type === 'invoice') {
      toast.success("Opening WhatsApp. Please attach the downloaded PDF manually.");
    }
    
    window.open(whatsappUrl, '_blank');
  };

  const handlePrintClick = (order) => {
    setSelectedOrderForPrint(order);
    setIsPrintDialogOpen(true);
  };

  const handleViewDetails = async (order) => {
    setSelectedOrderDetails(order);
    setIsDetailsModalOpen(true);
    setDetailsLoading(true);
    try {
      const result = await window.api.getOrderItems(order.id);
      if (result.success) {
        setSelectedOrderDetails(prev => ({
          ...prev,
          items: result.items
        }));
      } else {
        toast.error("Failed to load order items");
      }
    } catch (err) {
      toast.error("Error loading order items: " + err.message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSyncShopify = async () => {
    setIsSyncing(true);
    const toastId = toast.loading("Syncing Shopify orders & inventory...");
    try {
      const result = await window.api.syncShopifyNow('all');
      if (result.success) {
        toast.success(`Sync completed! Imported ${result.pulledOrders} orders, updated ${result.updatedInventory} products.`, { id: toastId });
        refetchOrders();
      } else {
        toast.error(`Sync failed: ${result.error}`, { id: toastId });
      }
    } catch (err) {
      toast.error(`Error during sync: ${err.message}`, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredOrders = localOrders
    .filter(o => {
      // Role-based branch isolation
      if (['state_franchisee', 'city_franchisee'].includes(user?.role)) {
        const orderRefCode = (o.referral_code || '').toLowerCase();
        if (!orderRefCode || !allowedCodes.includes(orderRefCode)) {
          return false;
        }
      }

      const matchesSearch = 
        o.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.bill_to_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.referral_name && o.referral_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (o.referral_code && o.referral_code.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const orderDate = new Date(o.invoice_date);
      orderDate.setHours(0, 0, 0, 0);
      
      const matchesFromDate = dateRange?.from ? orderDate >= new Date(dateRange.from).setHours(0,0,0,0) : true;
      const matchesToDate = dateRange?.to ? orderDate <= new Date(dateRange.to).setHours(0,0,0,0) : true;
      
      return matchesSearch && matchesFromDate && matchesToDate;
    })
    .sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      
      switch (sortKey) {
        case 'invoice_number':
          return direction * (a.invoice_number || '').localeCompare(b.invoice_number || '');
        case 'invoice_date':
          return direction * (new Date(a.invoice_date || 0) - new Date(b.invoice_date || 0));
        case 'bill_to_name':
          return direction * (a.bill_to_name || '').localeCompare(b.bill_to_name || '');
        case 'referral_code':
          return direction * (a.referral_code || '').localeCompare(b.referral_code || '');
        case 'payment_status': {
          const valA = a.shopify_financial_status || (a.final_amount <= 0 ? 'paid' : 'pending');
          const valB = b.shopify_financial_status || (b.final_amount <= 0 ? 'paid' : 'pending');
          return direction * valA.localeCompare(valB);
        }
        case 'fulfilled_status': {
          const valA = a.shopify_fulfillment_status || 'unfulfilled';
          const valB = b.shopify_fulfillment_status || 'unfulfilled';
          return direction * valA.localeCompare(valB);
        }
        case 'total_amount':
          return direction * (a.total_amount - b.total_amount);
        case 'final_amount':
          return direction * (a.final_amount - b.final_amount);
        case 'total_items':
          return direction * ((a.total_items || 0) - (b.total_items || 0));
        case 'delivery_status': {
          const valA = a.delivery_status || 'pending';
          const valB = b.delivery_status || 'pending';
          return direction * valA.localeCompare(valB);
        }
        case 'tags':
          return direction * (a.tags || '').localeCompare(b.tags || '');
        default:
          return 0;
      }
    });

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filteredTotalSales = filteredOrders.reduce((acc, o) => acc + o.total_amount, 0);
  const filteredTotalDue = filteredOrders.reduce((acc, o) => acc + (o.final_amount > 0 ? o.final_amount : 0), 0);
  const filteredTotalReceived = filteredOrders.reduce((acc, o) => acc + o.received_amount, 0);

  const sortOptions = [
    { label: 'Date (Newest)', value: 'invoice_date_desc' },
    { label: 'Date (Oldest)', value: 'invoice_date_asc' },
    { label: 'Invoice Number (A-Z)', value: 'invoice_number_asc' },
    { label: 'Invoice Number (Z-A)', value: 'invoice_number_desc' },
    { label: 'Total (High to Low)', value: 'total_amount_desc' },
    { label: 'Total (Low to High)', value: 'total_amount_asc' },
    { label: 'Due Amount (High to Low)', value: 'final_amount_desc' },
    { label: 'Due Amount (Low to High)', value: 'final_amount_asc' }
  ];

  const handleSortChange = (value) => {
    const parts = value.split('_');
    const direction = parts.pop();
    const key = parts.join('_');
    setSortKey(key);
    setSortDirection(direction);

    // Sync with sortColumnIndex
    const keyToIndexMap = {
      'invoice_number': 0,
      'invoice_date': 1,
      'bill_to_name': 2,
      'referral_code': 3,
      'payment_status': 4,
      'fulfilled_status': 5,
      'total_amount': 6,
      'final_amount': 7,
      'total_items': 8,
      'delivery_status': 9,
      'tags': 10
    };
    if (keyToIndexMap[key] !== undefined) {
      setSortColumnIndex(keyToIndexMap[key]);
    }
  };

  const handleSort = (headingIndex, direction) => {
    setSortColumnIndex(headingIndex);
    const dir = direction === 'ascending' ? 'asc' : 'desc';
    setSortDirection(dir);
    
    // Map column index to sortKey
    const indexToKeyMap = {
      0: 'invoice_number',
      1: 'invoice_date',
      2: 'bill_to_name',
      3: 'referral_code',
      4: 'payment_status',
      5: 'fulfilled_status',
      6: 'total_amount',
      7: 'final_amount',
      8: 'total_items',
      9: 'delivery_status',
      10: 'tags'
    };
    
    if (indexToKeyMap[headingIndex]) {
      setSortKey(indexToKeyMap[headingIndex]);
    }
  };

  const handleDateSelect = (range) => {
    setDateRange({
      from: range.start,
      to: range.end
    });
    if (range.start && range.end) {
      setDatePopoverActive(false);
    }
  };

  const formatDateToISO = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const month = '' + (d.getMonth() + 1);
    const day = '' + d.getDate();
    const year = d.getFullYear();
    return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  };

  const handleStartDateChange = (val) => {
    setDateRange(prev => ({
      ...prev,
      from: val ? new Date(val) : undefined
    }));
  };

  const handleEndDateChange = (val) => {
    setDateRange(prev => ({
      ...prev,
      to: val ? new Date(val) : undefined
    }));
  };

  const dateFilterActivator = (
    <Button 
      onClick={() => setDatePopoverActive(!datePopoverActive)}
      icon={<CalendarIcon size={16} />}
    >
      {dateRange.from && dateRange.to 
        ? `${format(dateRange.from, 'PP')} - ${format(dateRange.to, 'PP')}` 
        : 'Filter by Date'}
    </Button>
  );

  return (
    <Page
      fullWidth
      title="Sales Orders Ledger"
      subtitle="Track customer invoices, transaction statuses, and payments"
      compactTitle
      secondaryActions={[

        {
          content: 'Export CSV',
          icon: <FileDown size={16} />,
          onAction: () => exportToCSV(localOrders, `Orders_${new Date().toISOString().split('T')[0]}.csv`)
        }
      ]}
    >
      <Layout>
        {/* Metric Cards Summary */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Filtered Total Sales" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">₹{filteredTotalSales.toLocaleString()}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="success">Gross Sales</Badge>
                    <Text variant="bodySm" tone="subdued">active filters</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Total Payments Received" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">₹{filteredTotalReceived.toLocaleString()}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="info">Collected</Badge>
                    <Text variant="bodySm" tone="subdued">net settled cash</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Total Open Receivables" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">₹{filteredTotalDue.toLocaleString()}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone={filteredTotalDue > 0 ? 'critical' : 'success'}>
                      {filteredTotalDue > 0 ? 'Pending Payments' : 'Balanced'}
                    </Badge>
                    <Text variant="bodySm" tone="subdued">remaining due</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Orders Table list */}
        <Layout.Section>
          <LegacyCard>
            <Box padding="400">
              <InlineStack gap="300" align="space-between" blockAlign="center">
                <InlineStack gap="300" blockAlign="center" style={{ flex: 1 }}>
                  <div style={{ width: '260px' }}>
                    <TextField
                      placeholder="Search order ID, client name, or referral code..."
                      value={searchTerm}
                      onChange={(val) => setSearchTerm(val)}
                      prefix={<Search size={16} />}
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setSearchTerm('')}
                    />
                  </div>

                  <InlineStack gap="200" blockAlign="center">
                    <div style={{ width: '150px' }}>
                      <TextField
                        label="From"
                        labelHidden
                        type="date"
                        value={dateRange.from ? formatDateToISO(dateRange.from) : ''}
                        onChange={handleStartDateChange}
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ width: '150px' }}>
                      <TextField
                        label="To"
                        labelHidden
                        type="date"
                        value={dateRange.to ? formatDateToISO(dateRange.to) : ''}
                        onChange={handleEndDateChange}
                        autoComplete="off"
                      />
                    </div>

                    {/* <PolarisPopover
                      active={datePopoverActive}
                      activator={dateFilterActivator}
                      onClose={() => setDatePopoverActive(false)}
                    >
                      {/* <Box padding="400">
                        <DatePicker
                          month={selectedMonth.getMonth()}
                          year={selectedMonth.getFullYear()}
                          onChange={handleDateSelect}
                          onMonthChange={(month, year) => setSelectedMonth(new Date(year, month))}
                          selected={
                            dateRange.from
                              ? { start: dateRange.from, end: dateRange.to || dateRange.from }
                              : undefined
                          }
                          allowRange
                        /> */}
                      {/* </Box> */}
                    {/* </PolarisPopover> */} 

                    {(dateRange.from || dateRange.to) && (
                      <Button 
                        variant="plain" 
                        tone="critical"
                        className="cursor-pointer "
                        onClick={() => setDateRange({ from: undefined, to: undefined })}
                      >
                        Clear
                      </Button>
                    )}
                  </InlineStack>
                </InlineStack>

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
              resourceName={{ singular: 'order', plural: 'orders' }}
              itemCount={filteredOrders.length}
              loading={loading}
              headings={[
                { title: 'Invoice ID' },
                { title: 'Date' },
                { title: 'Customer Name' },
                { title: 'Referral Code' },
                { title: 'Payment Status' },
                { title: 'Fulfilled Status' },
                { title: 'Total Amount' },
                { title: 'Shipping Charge' },
                { title: 'Due Amount (₹)' },
                { title: 'Total Items' },
                { title: 'Delivery Status' },
                { title: 'Tags' },
                { title: 'Actions', alignment: 'end' }
              ]}
              selectable={false}
              sortable={[true, true, true, true, true, true, true, true, true, true, true, true, false]}
              sortColumnIndex={sortColumnIndex}
              sortDirection={sortDirection === 'asc' ? 'ascending' : 'descending'}
              onSort={handleSort}
            >
              {paginatedOrders.map((order, index) => {
                const { id, invoice_number, invoice_date, bill_to_name, referral_name, total_amount, final_amount, received_amount, shipping_charges, tags, total_items, status: orderStatus } = order;
                const isPaid = (final_amount || 0) <= 0;
                const isUnpaid = (final_amount || 0) === (total_amount || 0);
                const isCancelled = orderStatus === 'cancelled';

                return (
                  <IndexTable.Row id={id} key={id} position={index}>
                    <IndexTable.Cell>
                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', opacity: isCancelled ? 0.6 : 1 }}>
                        <Text variant="bodyMd" fontWeight="bold" as="span">
                          {invoice_number?.startsWith('#') ? invoice_number : `#${invoice_number}`}
                        </Text>
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', opacity: isCancelled ? 0.6 : 1 }}>
                        {formatDateWithTime(invoice_date)}
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', opacity: isCancelled ? 0.6 : 1 }}>
                        {bill_to_name}
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', opacity: isCancelled ? 0.6 : 1 }}>
                        {order.referral_code ? (
                          <InlineStack gap="100" blockAlign="center" wrap={false}>
                            <PolarisTooltip content={order.referral_name || 'Referral Partner'}>
                              <Badge tone="info">{order.referral_code}</Badge>
                            </PolarisTooltip>
                            {ctxLoading.partners ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'nowrap', marginLeft: '4px' }}>
                                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse border-2 border-white dark:border-[#09090b]" style={{ marginLeft: '0px' }} />
                                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse border-2 border-white dark:border-[#09090b]" style={{ marginLeft: '-6px' }} />
                                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse border-2 border-white dark:border-[#09090b]" style={{ marginLeft: '-6px' }} />
                              </div>
                            ) : getChainNodes(order.referral_code).length > 0 && (
                              <PolarisTooltip content={getHierarchyDetails(order.referral_code)}>
                                <div style={{ display: 'inline-flex', alignItems: 'center' , flexWrap: 'nowrap' }}>
                                  {getChainNodes(order.referral_code).map((node, i) => {
                                    const letter = node.name ? node.name.trim()[0].toUpperCase() : node.referral_code.trim()[0].toUpperCase();
                                    const colors = getRoleColors(node.role);
                                    return (
                                      <div
                                        key={i}
                                        className={`flex items-center justify-center w-6 h-6 rounded-full border-2 border-white dark:border-[#09090b] font-bold text-[10px] ${colors}`}
                                        style={{
                                          marginLeft: i === 0 ? '4px' : '-6px',
                                          zIndex: i,
                                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                        }}
                                      >
                                        {letter}
                                      </div>
                                    );
                                  })}
                                </div>
                              </PolarisTooltip>
                            )}
                          </InlineStack>
                        ) : (
                          <Text tone="subdued">Direct</Text>
                        )}
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {getPaymentBadge(order)}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {getFulfillmentBadge(order)}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', opacity: isCancelled ? 0.6 : 1 }}>
                        ₹{parseFloat(total_amount || 0).toFixed(2)}
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', opacity: isCancelled ? 0.6 : 1 }}>
                        ₹{parseFloat(shipping_charges || 0).toFixed(2)}
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={isPaid ? 'success' : isUnpaid ? 'critical' : 'warning'}>
                        ₹{parseFloat(final_amount || 0).toFixed(2)}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', opacity: isCancelled ? 0.6 : 1 }}>
                        {total_items || 0}
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {getDeliveryBadge(order)}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', opacity: isCancelled ? 0.6 : 1 }}>
                        {renderTags(tags)}
                      </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '4px', justifyContent: 'flex-end', alignItems: 'center', minWidth: '240px' }}>
                        <PolarisTooltip content="View Details">
                          <Button
                            icon={<Eye size={16} />}
                            onClick={() => handleViewDetails(order)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        <PolarisTooltip content="Print / PDF">
                          <Button
                            icon={<Printer size={16} />}
                            onClick={() => handlePrintClick(order)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        <PolarisTooltip content="WhatsApp Invoice">
                          <Button
                            icon={<Share size={16} />}
                            onClick={() => handleShareWhatsApp(order, 'invoice')}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        {final_amount > 0 && !isCancelled && (
                           <PolarisTooltip content="Payment Reminder">
                             <Button
                               icon={<MessageSquare size={16} />}
                               onClick={() => handleShareWhatsApp(order, 'reminder')}
                               variant="plain"
                             />
                           </PolarisTooltip>
                        )}
                        <PolarisTooltip content="Edit Order">
                          <Button
                            icon={<Edit size={16} />}
                            disabled={isCancelled}
                            onClick={() => onEdit(order)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        {isCancelled ? (
                          <PolarisTooltip content="Order Cancelled">
                            <Button
                              icon={<Ban size={16} />}
                              disabled
                              variant="plain"
                            />
                          </PolarisTooltip>
                        ) : (
                          <PolarisTooltip content="Cancel Order">
                            <Button
                              icon={<Ban size={16} />}
                              onClick={() => handleCancelOrder(id)}
                              variant="plain"
                            />
                          </PolarisTooltip>
                        )}
                        <PolarisTooltip content="Delete Order">
                          <Button
                            icon={<Trash size={16} />}
                            onClick={() => handleDeleteOrder(id)}
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

      {/* Invoice Print Dialog Integration */}
      {selectedOrderForPrint && (
        <PrintInvoiceDialog
          isOpen={isPrintDialogOpen}
          onClose={() => {
            setIsPrintDialogOpen(false);
            setSelectedOrderForPrint(null);
          }}
          order={selectedOrderForPrint}
        />
      )}

      {/* View Order Details Modal */}
      <Modal
        size="large"
        open={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={`Order Details: ${selectedOrderDetails?.invoice_number?.startsWith('#') ? selectedOrderDetails.invoice_number : `#${selectedOrderDetails?.invoice_number || ''}`}`}
        primaryAction={{
          content: 'Close',
          onClick: () => setIsDetailsModalOpen(false),
        }}
      >
        <Modal.Section>
          {detailsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Spinner size="large" />
            </div>
          ) : selectedOrderDetails ? (
            <BlockStack gap="400">
              <Box borderBlockEndWidth="1" paddingBlockEnd="400" borderColor="border-subdued">
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 12, sm: 12, md: 4 }}>
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3">Order Information</Text>
                      <Text as="p"><strong>Date:</strong> {selectedOrderDetails.invoice_date}</Text>
                      <Text as="p"><strong>Source:</strong> <span style={{ textTransform: 'capitalize' }}>{selectedOrderDetails.sync_source || 'Local'}</span></Text>
                      {selectedOrderDetails.shopify_order_number && (
                        <Text as="p"><strong>Shopify Order #:</strong> {selectedOrderDetails.shopify_order_number}</Text>
                      )}
                      <InlineStack gap="200">
                        <Badge tone={selectedOrderDetails.final_amount <= 0 ? 'success' : 'warning'}>
                          Payment: {selectedOrderDetails.shopify_financial_status || (selectedOrderDetails.final_amount <= 0 ? 'paid' : 'pending')}
                        </Badge>
                        {selectedOrderDetails.shopify_fulfillment_status && (
                          <Badge tone={selectedOrderDetails.shopify_fulfillment_status === 'fulfilled' ? 'success' : 'attention'}>
                            Fulfillment: {selectedOrderDetails.shopify_fulfillment_status}
                          </Badge>
                        )}
                      </InlineStack>
                    </BlockStack>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 12, sm: 12, md: 4 }}>
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3">Billing & Customer Details</Text>
                      <Text as="p"><strong>Name:</strong> {selectedOrderDetails.bill_to_name}</Text>
                      {selectedOrderDetails.bill_to_phone && <Text as="p"><strong>Phone:</strong> {selectedOrderDetails.bill_to_phone}</Text>}
                      {selectedOrderDetails.bill_to_address ? (
                        <>
                          {(() => {
                            const parsed = parseAddress(selectedOrderDetails.bill_to_address);
                            return (
                              <>
                                {parsed.street && <Text as="p"><strong>Street Address:</strong> {parsed.street}</Text>}
                                {selectedOrderDetails.billing_address2 && <Text as="p"><strong>Address Line 2:</strong> {selectedOrderDetails.billing_address2}</Text>}
                                {parsed.city && <Text as="p"><strong>City:</strong> {parsed.city}</Text>}
                                {parsed.state && <Text as="p"><strong>State:</strong> {parsed.state}</Text>}
                                {parsed.zip && <Text as="p"><strong>Pincode:</strong> {parsed.zip}</Text>}
                                {parsed.country && <Text as="p"><strong>Country:</strong> {parsed.country}</Text>}
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <Text as="p"><strong>Address:</strong> -</Text>
                      )}
                      <Text as="p"><strong>Referral:</strong> {
                        selectedOrderDetails.referral_name 
                          ? `${selectedOrderDetails.referral_name} (${selectedOrderDetails.referral_code || ''})` 
                          : (selectedOrderDetails.referral_code ? selectedOrderDetails.referral_code : 'Direct')
                      }</Text>
                    </BlockStack>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 12, sm: 12, md: 4 }}>
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3">Shipping Recipient Details</Text>
                      <Text as="p"><strong>Name:</strong> {selectedOrderDetails.shipping_name || '-'}</Text>
                      {selectedOrderDetails.shipping_phone && <Text as="p"><strong>Phone:</strong> {selectedOrderDetails.shipping_phone}</Text>}
                      {selectedOrderDetails.shipping_address ? (
                        <>
                          {(() => {
                            const parsed = parseAddress(selectedOrderDetails.shipping_address);
                            return (
                              <>
                                {parsed.street && <Text as="p"><strong>Street Address:</strong> {parsed.street}</Text>}
                                {selectedOrderDetails.shipping_address2 && <Text as="p"><strong>Address Line 2:</strong> {selectedOrderDetails.shipping_address2}</Text>}
                                {parsed.city && <Text as="p"><strong>City:</strong> {parsed.city}</Text>}
                                {parsed.state && <Text as="p"><strong>State:</strong> {parsed.state}</Text>}
                                {parsed.zip && <Text as="p"><strong>Pincode:</strong> {parsed.zip}</Text>}
                                {parsed.country && <Text as="p"><strong>Country:</strong> {parsed.country}</Text>}
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <Text as="p"><strong>Address:</strong> -</Text>
                      )}
                      {selectedOrderDetails.shipping_carrier && (
                        <Text as="p"><strong>Carrier:</strong> {selectedOrderDetails.shipping_carrier}</Text>
                      )}
                    </BlockStack>
                  </Grid.Cell>
                </Grid>
              </Box>

              
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}><Text fontWeight="bold">Item Name</Text></th>
                    <th style={{ padding: '8px' }}><Text fontWeight="bold">SKU / Batch</Text></th>
                    <th style={{ padding: '8px', textAlign: 'right' }}><Text fontWeight="bold">MRP</Text></th>
                    <th style={{ padding: '8px', textAlign: 'center' }}><Text fontWeight="bold">Quantity</Text></th>
                    <th style={{ padding: '8px', textAlign: 'right' }}><Text fontWeight="bold">GST %</Text></th>
                    <th style={{ padding: '8px', textAlign: 'right' }}><Text fontWeight="bold">Total</Text></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderDetails.items?.map((item, index) => {
                    const qty = item.quantity_string?.split('+').reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0) || 0;
                    const pricePerItemOriginal = parseFloat(item.price_per_item || item.mrp || 0);
                    const totalDiscount = parseFloat(item.total_discount || 0);
                    // Prevent total from becoming negative if discount somehow exceeds base price
                    const lineTotal = Math.max(0, (pricePerItemOriginal * qty) - totalDiscount);
                    const effectivePrice = qty > 0 ? lineTotal / qty : 0;
                    return (
                      <tr key={item.id || index} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '8px' }}>
                          {item.item_name} {item.size ? `(${item.size})` : ''}
                        </td>
                        <td style={{ padding: '8px' }}>{item.batch_id || '-'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>₹{effectivePrice.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{qty} {item.unit || ''}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{item.gst_rate}%</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>₹{lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <Box paddingBlockStart="400" borderBlockStartWidth="1" borderColor="border-subdued" style={{ alignSelf: 'flex-end', width: '300px', marginLeft: 'auto' }}>
                <BlockStack gap="150">
                  <InlineStack align="space-between">
                    <Text>Subtotal:</Text>
                    <Text fontWeight="bold">₹{((selectedOrderDetails.total_amount || 0) - (selectedOrderDetails.shipping_charges || 0)).toFixed(2)}</Text>
                  </InlineStack>
                  {selectedOrderDetails.shipping_charges > 0 && (
                    <InlineStack align="space-between">
                      <Text>Shipping Charges:</Text>
                      <Text fontWeight="bold">₹{parseFloat(selectedOrderDetails.shipping_charges).toFixed(2)}</Text>
                    </InlineStack>
                  )}
                  <InlineStack align="space-between">
                    <Text variant="headingMd">Grand Total:</Text>
                    <Text variant="headingMd">₹{parseFloat(selectedOrderDetails.total_amount || 0).toFixed(2)}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text>Amount Received:</Text>
                    <Text fontWeight="bold" tone={selectedOrderDetails.final_amount <= 0 ? 'success' : 'critical'}>
                      ₹{parseFloat(selectedOrderDetails.received_amount || 0).toFixed(2)}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text variant="headingMd">Due Amount:</Text>
                    <Text variant="headingMd" tone={selectedOrderDetails.final_amount > 0 ? 'critical' : 'success'}>
                      ₹{parseFloat(selectedOrderDetails.final_amount || 0).toFixed(2)}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Box>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default ManageOrders;
