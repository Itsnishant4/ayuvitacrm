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
  Spinner,
  DataTable
} from '@shopify/polaris';
import { Search, Edit, Trash, Plus, FileDown, User, Phone, MapPin, CreditCard, ShoppingBag, FileText } from "lucide-react";
import PolarisTooltip from '../components/PolarisTooltip';
import toast from 'react-hot-toast';
import { exportToCSV } from '../lib/exportUtils';
import { useData } from '../contexts/DataContext';

const ManageCustomers = ({ user, onNavigate }) => {
  const { customers: ctxCustomers, partners, loading: ctxLoading, fetchCustomers, fetchPartners } = useData();
  const [customers, setLocalCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(false);
  
  const [allowedCodes, setAllowedCodes] = useState([]);
  
  const [editingCustomer, setEditingCustomer] = useState({
    id: '',
    name: '',
    phone: '',
    address: ''
  });

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    address: ''
  });

  useEffect(() => {
    fetchCustomers(user?.role, user?.referral_code).then(res => {
      if (res.success) setLocalCustomers(res.customers);
      setLoading(false);
    });
    fetchPartners(user?.referral_code, user?.role);
  }, []);

  useEffect(() => {
    if (ctxCustomers) setLocalCustomers(ctxCustomers);
  }, [ctxCustomers]);

  useEffect(() => {
    if (['state_franchisee', 'city_franchisee'].includes(user?.role) && partners) {
      const codes = partners.map(p => p.referral_code.toLowerCase());
      if (user.referral_code && !codes.includes(user.referral_code.toLowerCase())) {
        codes.push(user.referral_code.toLowerCase());
      }
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

  const refetchCustomers = async () => {
    setLoading(true);
    const result = await fetchCustomers(user?.role, user?.referral_code, true);
    if (result.success) setLocalCustomers(result.customers);
    setLoading(false);
  };

  const fetchCustomerOrders = async (customer) => {
    setSelectedCustomer(customer);
    setIsHistoryDialogOpen(true);
    setLoadingOrders(true);
    const result = await window.api.getCustomerOrders(customer.name);
    if (result.success) {
      setCustomerOrders(result.orders);
    }
    setLoadingOrders(false);
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name) return;

    setActionLoading(true);
    const result = await window.api.addCustomer({
      ...newCustomer,
      referral_code: user?.referral_code || null
    });
    if (result.success) {
      toast.success("Customer added successfully!");
      setIsAddDialogOpen(false);
      setNewCustomer({ name: '', phone: '', address: '' });
      refetchCustomers();
    } else {
      toast.error(`Error: ${result.error}`);
    }
    setActionLoading(false);
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer.name) return;

    setActionLoading(true);
    const result = await window.api.updateCustomer(editingCustomer.id, editingCustomer);
    if (result.success) {
      toast.success("Customer updated successfully!");
      setIsEditDialogOpen(false);
      refetchCustomers();
    } else {
      toast.error(`Error: ${result.error}`);
    }
    setActionLoading(false);
  };

  const handleDeleteCustomer = async (id, name) => {
    if (!confirm(`Are you sure you want to delete customer "${name}"? This action cannot be undone.`)) {
      return;
    }
    setActionLoading(true);
    const result = await window.api.deleteCustomer(id);
    if (result.success) {
      toast.success("Customer deleted successfully!");
      refetchCustomers();
    } else {
      toast.error(`Failed to delete customer: ${result.error}`);
    }
    setActionLoading(false);
  };

  const handleEditClick = (customer) => {
    setEditingCustomer({
      id: customer.id,
      name: customer.name,
      phone: customer.phone || "",
      address: customer.address || ""
    });
    setIsEditDialogOpen(true);
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(searchTerm));
    if (!matchesSearch) return false;

    if (filterStartDate || filterEndDate) {
      if (!c.created_at) return false;
      const createdDate = new Date(c.created_at).setHours(0, 0, 0, 0);
      const matchesStart = filterStartDate ? createdDate >= new Date(filterStartDate).setHours(0, 0, 0, 0) : true;
      const matchesEnd = filterEndDate ? createdDate <= new Date(filterEndDate).setHours(23, 59, 59, 999) : true;
      return matchesStart && matchesEnd;
    }
    return true;
  });

  const totalOutstanding = customers.reduce((acc, c) => acc + (c.total_due || 0), 0);

  // Orders Table Rows for History View
  const historyHeaders = ['Order ID', 'Date', 'Fulfillment', 'Payment', 'Total Amount', 'Due Amount'];
  const filteredOrders = customerOrders.filter(order => {
    if (historyFilter === 'pending') return (order.total_due || 0) > 0;
    return true;
  });

  const historyRows = filteredOrders.map(order => [
    `#${String(order.invoice_number).replace(/^#+/, '')}`,
    order.invoice_date ? new Date(order.invoice_date).toLocaleDateString() : '—',
    order.status || 'Delivered',
    (order.total_due || 0) === 0 ? 'Paid' : (order.total_due === order.total_amount ? 'Unpaid' : 'Partial'),
    `₹${parseFloat(order.total_amount || 0).toFixed(2)}`,
    `₹${parseFloat(order.total_due || 0).toFixed(2)}`
  ]);

  return (
    <Page
      fullWidth
      title="Customer Ledger"
      subtitle="Manage your client directories, invoice metrics, and balances"
      compactTitle
      secondaryActions={[
        {
          content: 'Export CSV',
          icon: <FileDown size={16} />,
          onAction: () => exportToCSV(customers, `Customers_${new Date().toISOString().split('T')[0]}.csv`)
        }
      ]}
    >
      <Layout>
        {/* Metric Cards Summary */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Total Client Directory" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{customers.length}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="info">Active</Badge>
                    <Text variant="bodySm" tone="subdued">active customers</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Total Business Value" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">
                    ₹{customers.reduce((acc, c) => acc + (c.total_spent || 0), 0).toLocaleString()}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="success">Lifetime</Badge>
                    <Text variant="bodySm" tone="subdued">gross revenue contribution</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Outstanding Balances" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">₹{totalOutstanding.toLocaleString()}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone={totalOutstanding > 0 ? 'critical' : 'success'}>
                      {totalOutstanding > 0 ? 'Receivables Open' : 'All Clear'}
                    </Badge>
                    <Text variant="bodySm" tone="subdued">pending payments due</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Customer Directory Ledger */}
        <Layout.Section>
          <LegacyCard>
            <Box padding="400">
              <InlineStack gap="300" align="space-between" blockAlign="center">
                <div style={{ flex: 1, maxWidth: '400px' }}>
                  <TextField
                    placeholder="Search by customer name or phone..."
                    value={searchTerm}
                    onChange={(val) => setSearchTerm(val)}
                    prefix={<Search size={16} />}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setSearchTerm('')}
                  />
                </div>
                <InlineStack gap="200" align="end" blockAlign="center">
                  <div style={{ width: '150px' }}>
                    <TextField
                      label="From"
                      labelHidden
                      type="date"
                      value={filterStartDate}
                      onChange={(val) => setFilterStartDate(val)}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ width: '150px' }}>
                    <TextField
                      label="To"
                      labelHidden
                      type="date"
                      value={filterEndDate}
                      onChange={(val) => setFilterEndDate(val)}
                      autoComplete="off"
                    />
                  </div>
                  {(filterStartDate || filterEndDate) && (
                    <Button 
                      variant="plain" 
                      tone="critical"
                      onClick={() => {
                        setFilterStartDate('');
                        setFilterEndDate('');
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
            </Box>

            <IndexTable
              resourceName={{ singular: 'customer', plural: 'customers' }}
              itemCount={filteredCustomers.length}
              loading={loading}
              headings={[
                { title: 'Customer Details' },
                { title: 'Contact' },
                { title: 'Referral Code' },
                { title: 'Total Orders' },
                { title: 'Total Invoiced' },
                { title: 'Total Due (Receivable)' },
                { title: 'Actions', alignment: 'end' }
              ]}
              selectable={false}
            >
              {filteredCustomers.map((customer, index) => {
                const { id, name, phone, address, referral_code, total_orders, total_spent, total_due } = customer;
                return (
                  <IndexTable.Row id={id} key={id} position={index}>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="bold">{name}</Text>
                        {(() => {
                          if (!address) {
                            return (
                              <InlineStack gap="100" blockAlign="center">
                                <MapPin size={12} className="text-gray-400" />
                                <Text variant="bodySm" tone="subdued">No Address Listed</Text>
                              </InlineStack>
                            );
                          }

                          const displayAddress = address.length > 35 ? `${address.substring(0, 35)}...` : address;

                          const tooltipContent = (
                            <Box padding="100">
                              <InlineStack gap="200" blockAlign="center">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-bold text-sm">
                                  {name ? name.trim()[0].toUpperCase() : '?'}
                                </div>
                                <BlockStack gap="050">
                                  <Text variant="bodySm" fontWeight="bold">{name}</Text>
                                  <Text variant="bodyXs" tone="subdued">{address}</Text>
                                </BlockStack>
                              </InlineStack>
                            </Box>
                          );

                          return (
                            <PolarisTooltip content={tooltipContent} preferredPosition="above">
                              <InlineStack gap="100" blockAlign="center">
                                <MapPin size={12} className="text-gray-400" />
                                <span className="text-xs text-neutral-500 dark:text-neutral-400 cursor-help border-b border-dashed border-neutral-300 dark:border-neutral-700 pb-0.5">
                                  {displayAddress}
                                </span>
                              </InlineStack>
                            </PolarisTooltip>
                          );
                        })()}
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="100" blockAlign="center">
                        <Phone size={12} className="text-gray-400" />
                        <Text variant="bodySm">{phone || 'N/A'}</Text>
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {referral_code ? (
                        <InlineStack gap="100" blockAlign="center">
                          <PolarisTooltip content={getPartnerByCode(referral_code)?.name || 'Referral Partner'}>
                            <Badge tone="info">{referral_code}</Badge>
                          </PolarisTooltip>
                          {getChainNodes(referral_code).length > 0 && (
                            <PolarisTooltip content={getHierarchyDetails(referral_code)}>
                              <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {getChainNodes(referral_code).map((node, i) => {
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
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone="info">{total_orders || 0} orders</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>₹{parseFloat(total_spent || 0).toFixed(2)}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={parseFloat(total_due || 0) > 0 ? 'critical' : 'success'}>
                        ₹{parseFloat(total_due || 0).toFixed(2)}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '4px', justifyContent: 'flex-end', alignItems: 'center', minWidth: '120px' }}>
                        <PolarisTooltip content="View Order History">
                          <Button
                            icon={<ShoppingBag size={16} />}
                            onClick={() => fetchCustomerOrders(customer)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        <PolarisTooltip content="Edit Customer">
                          <Button
                            icon={<Edit size={16} />}
                            onClick={() => handleEditClick(customer)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        <PolarisTooltip content="Delete Customer">
                          <Button
                            icon={<Trash size={16} />}
                            onClick={() => handleDeleteCustomer(id, name)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                      </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>
          </LegacyCard>
        </Layout.Section>
      </Layout>

      {/* Add Customer Modal */}
      <Modal
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        title="Add New Customer"
        primaryAction={{
          content: actionLoading ? 'Saving...' : 'Add Customer',
          onAction: handleAddCustomer,
          disabled: actionLoading || !newCustomer.name
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setIsAddDialogOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Full Name"
              value={newCustomer.name}
              onChange={(val) => setNewCustomer({ ...newCustomer, name: val })}
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="Phone Number"
              value={newCustomer.phone}
              onChange={(val) => setNewCustomer({ ...newCustomer, phone: val })}
              autoComplete="off"
            />
            <TextField
              label="Address Details"
              value={newCustomer.address}
              onChange={(val) => setNewCustomer({ ...newCustomer, address: val })}
              autoComplete="off"
              multiline={3}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        title="Edit Customer Details"
        primaryAction={{
          content: actionLoading ? 'Saving...' : 'Save Changes',
          onAction: handleUpdateCustomer,
          disabled: actionLoading || !editingCustomer.name
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
            <TextField
              label="Full Name"
              value={editingCustomer.name}
              onChange={(val) => setEditingCustomer({ ...editingCustomer, name: val })}
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="Phone Number"
              value={editingCustomer.phone}
              onChange={(val) => setEditingCustomer({ ...editingCustomer, phone: val })}
              autoComplete="off"
            />
            <TextField
              label="Address Details"
              value={editingCustomer.address}
              onChange={(val) => setEditingCustomer({ ...editingCustomer, address: val })}
              autoComplete="off"
              multiline={3}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Invoice History Modal */}
      <Modal
        open={isHistoryDialogOpen}
        onClose={() => setIsHistoryDialogOpen(false)}
        title={`Order History: ${selectedCustomer?.name || ''}`}
        limitHeight
      >
        <Box padding="400">
          <InlineStack gap="300" align="end">
            <Button
              pressed={historyFilter === 'all'}
              onClick={() => setHistoryFilter('all')}
            >
              All Invoices
            </Button>
            <Button
              pressed={historyFilter === 'pending'}
              onClick={() => setHistoryFilter('pending')}
            >
              Unpaid / Due Only
            </Button>
          </InlineStack>
        </Box>
        <Modal.Section>
          {loadingOrders ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Spinner size="large" />
            </div>
          ) : historyRows.length === 0 ? (
            <Box padding="400">
              <Text variant="bodyMd" tone="subdued" align="center">
                No orders match this filter.
              </Text>
            </Box>
          ) : (
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'numeric']}
              headings={historyHeaders}
              rows={historyRows}
            />
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default ManageCustomers;
