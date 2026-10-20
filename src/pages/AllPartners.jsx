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
import { Search, Edit, Trash, FileDown, Plus, Users, Award, Calendar, Link, Eye } from "lucide-react";
import PolarisTooltip from '../components/PolarisTooltip';
import toast from 'react-hot-toast';
import { exportToCSV } from '../lib/exportUtils';
import { useData } from '../contexts/DataContext';

const AllPartners = ({ user, onNavigate }) => {
  const { partners: ctxPartners, orders: ctxOrders, loading: ctxLoading, fetchOrders: fetchCtxOrders, fetchPartners: fetchCtxPartners } = useData();
  const [partners, setPartners] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Edit states
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: "", email: "", phone: "", referral_code: "", role: "retailer", region: "" });
  const [isSaving, setIsSaving] = useState(false);

  // Add Referral Modal states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    referral_code: '', 
    role: 'retailer', 
    parent_code: '',
    region: ''
  });
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [refCodeManuallyEdited, setRefCodeManuallyEdited] = useState(false);

  // View Orders Modal states
  const [isOrdersDialogOpen, setIsOrdersDialogOpen] = useState(false);
  const [selectedPartnerForOrders, setSelectedPartnerForOrders] = useState(null);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Auto-generate referral code from role and parent selection
  const generateRefCode = (role, parentCode) => {
    if (role === 'retailer') {
      const retailerCodes = partners
        .filter(p => p.referral_code && p.referral_code.startsWith('AV-'))
        .map(p => {
          const num = parseInt(p.referral_code.split('-')[1]);
          return isNaN(num) ? 0 : num;
        });
      const maxNum = retailerCodes.length > 0 ? Math.max(...retailerCodes) : 0;
      const nextNumStr = String(maxNum + 1).padStart(3, '0');
      return `AV-${nextNumStr}`;
    } else if (role === 'sub_retailer' && parentCode) {
      const parentParts = parentCode.split('-');
      const parentNum = parentParts.length > 1 ? parentParts[1] : '';
      
      const prefix = `BV-${parentNum}`;
      const childIndices = partners
        .filter(p => p.referral_code && p.referral_code.startsWith(prefix))
        .map(p => {
          const suffix = p.referral_code.substring(prefix.length);
          const index = parseInt(suffix);
          return isNaN(index) ? 0 : index;
        });
      const maxIndex = childIndices.length > 0 ? Math.max(...childIndices) : 0;
      return `${prefix}${maxIndex + 1}`;
    } else if (role === 'state_franchisee') {
      const stateCodes = partners
        .filter(p => p.referral_code && p.referral_code.startsWith('RV-'))
        .map(p => {
          const num = parseInt(p.referral_code.split('-')[1]);
          return isNaN(num) ? 0 : num;
        });
      const maxNum = stateCodes.length > 0 ? Math.max(...stateCodes) : 0;
      const nextNumStr = String(maxNum + 1).padStart(3, '0');
      return `RV-${nextNumStr}`;
    } else if (role === 'city_franchisee') {
      const cityCodes = partners
        .filter(p => p.referral_code && p.referral_code.startsWith('CV-'))
        .map(p => {
          const num = parseInt(p.referral_code.split('-')[1]);
          return isNaN(num) ? 0 : num;
        });
      const maxNum = cityCodes.length > 0 ? Math.max(...cityCodes) : 0;
      const nextNumStr = String(maxNum + 1).padStart(3, '0');
      return `CV-${nextNumStr}`;
    }
    return '';
  };

  // Resolve full parent chain for a partner (for tooltip details)
  const getHierarchyDetails = (partner) => {
    if (!partner || !partner.referral_code) return '—';
    
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

  // Get full nodes list for hierarchy stack
  const getChainNodes = (partner) => {
    if (!partner || !partner.referral_code) return [];
    
    const franchiseeRoles = ['state_franchisee', 'city_franchisee'];
    const nodes = [];
    let current = partner;
    let depth = 0;
    
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

  // Get color styles based on partner role
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

  useEffect(() => {
    if (refCodeManuallyEdited) return;
    const generated = generateRefCode(addFormData.role, addFormData.parent_code);
    setAddFormData(prev => ({ ...prev, referral_code: generated }));
  }, [addFormData.role, addFormData.parent_code, partners, refCodeManuallyEdited]);

  useEffect(() => {
    fetchCtxPartners(user?.referral_code, user?.role);
    fetchCtxOrders().then(res => {
      if (res.success) setOrders(res.orders);
    });
  }, []);

  useEffect(() => {
    if (ctxPartners) setPartners(ctxPartners);
  }, [ctxPartners]);

  useEffect(() => {
    if (ctxOrders) setOrders(ctxOrders);
  }, [ctxOrders]);

  useEffect(() => {
    if (ctxPartners && ctxOrders) setLoading(false);
  }, [ctxPartners, ctxOrders]);

  // Reset page when search or sorting triggers
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortKey, sortDirection]);

  const refetchPartners = async (showToast = false) => {
    setLoading(true);
    const promise = fetchCtxPartners(user?.referral_code, user?.role, true);
    if (showToast) {
      toast.promise(promise, {
        loading: 'Refreshing referrals from cloud...',
        success: 'Referrals loaded',
        error: 'Failed to load referrals',
      });
    }
    const result = await promise;
    if (result.success) setPartners(result.partners);
    setLoading(false);
  };

  const handleEditClick = (partner) => {
    setSelectedPartner(partner);
    setEditFormData({
      name: partner.name,
      email: partner.email || "",
      phone: partner.phone || "",
      referral_code: partner.referral_code || "",
      role: partner.role || "retailer",
      region: partner.region || ""
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdatePartner = async () => {
    setIsSaving(true);
    
    const promise = (async () => {
      const result = await window.api.supabaseUpdatePartner({
        id: selectedPartner.id,
        partner: {
          name: editFormData.name,
          email: editFormData.email,
          phone: editFormData.phone,
          referral_code: editFormData.referral_code,
          role: editFormData.role,
          region: editFormData.region || null
        }
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to update referral');
      }
      return result;
    })();

    toast.promise(promise, {
      loading: 'Updating referral details...',
      success: 'Referral updated successfully!',
      error: (err) => `Update failed: ${err.message}`,
    });

    try {
      await promise;
      setIsEditDialogOpen(false);
      refetchPartners();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePartner = async (id) => {
    if (!confirm('Are you sure you want to delete this referral?')) return;
    
    const promise = (async () => {
      const result = await window.api.supabaseDeletePartner(id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete referral');
      }
      return result;
    })();
    
    toast.promise(promise, {
      loading: 'Deleting referral...',
      success: 'Referral deleted successfully!',
      error: (err) => `Failed to delete referral: ${err.message}`,
    });

    try {
      await promise;
      refetchPartners();
    } catch (e) {
      console.error(e);
    }
  };

  const handleViewOrdersClick = (partner) => {
    setFilterStartDate('');
    setFilterEndDate('');
    setSelectedPartnerForOrders(partner);
    setIsOrdersDialogOpen(true);
  };

  const handleAddPartner = async () => {
    if (!addFormData.name || !addFormData.phone) {
      setAddError('Name and phone number are required.');
      return;
    }
    if (!addFormData.referral_code) {
      setAddError('Referral code is required.');
      return;
    }
    setIsAdding(true);
    setAddError('');

    // If logged in as franchisee, automatically set parent_code to user's code for downline roles
    let parent = addFormData.parent_code;
    const franchiseeRoles = ['state_franchisee', 'city_franchisee'];
    if (franchiseeRoles.includes(user?.role) && ['city_franchisee', 'retailer'].includes(addFormData.role)) {
      parent = user.referral_code;
    }

    const result = await window.api.supabaseAddPartner({
      name: addFormData.name,
      email: addFormData.email || null,
      phone: addFormData.phone,
      referral_code: addFormData.referral_code,
      role: addFormData.role,
      parent_code: parent || null,
      region: addFormData.region || null
    });

    if (result.success) {
      toast.success('Referral added successfully to cloud!');
      setIsAddDialogOpen(false);
      setAddFormData({ name: '', email: '', phone: '', referral_code: '', role: 'retailer', parent_code: '', region: '' });
      setRefCodeManuallyEdited(false);
      refetchPartners();
    } else {
      setAddError(result.error);
      toast.error(`Error: ${result.error}`);
    }
    setIsAdding(false);
  };

  const filteredPartners = partners
    .filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.phone && p.phone.includes(searchTerm)) ||
      (p.referral_code && p.referral_code.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'name') {
        return direction * a.name.localeCompare(b.name);
      }
      if (sortKey === 'created_at') {
        return direction * (new Date(a.created_at) - new Date(b.created_at));
      }
      return 0;
    });

  const totalPages = Math.ceil(filteredPartners.length / itemsPerPage);
  const paginatedPartners = filteredPartners.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const sortOptions = [
    { label: 'Name (A-Z)', value: 'name_asc' },
    { label: 'Name (Z-A)', value: 'name_desc' },
    { label: 'Date Joined (Newest)', value: 'created_at_desc' },
    { label: 'Date Joined (Oldest)', value: 'created_at_asc' }
  ];

  const handleSortChange = (value) => {
    const parts = value.split('_');
    const direction = parts.pop();
    const key = parts.join('_');
    setSortKey(key);
    setSortDirection(direction);
  };

  // Get retailer role options for parent code selection
  const retailerOptions = partners
    .filter(p => p.role === 'retailer')
    .map(p => ({ label: `${p.name} (${p.referral_code})`, value: p.referral_code }));

  const roleOptions = user?.role === 'admin' 
    ? [
        { label: 'State Franchisee', value: 'state_franchisee' },
        { label: 'City Franchisee', value: 'city_franchisee' },
        { label: 'Retailer', value: 'retailer' },
        { label: 'Sub-Retailer', value: 'sub_retailer' }
      ]
    : user?.role === 'state_franchisee'
    ? [
        { label: 'City Franchisee', value: 'city_franchisee' },
        { label: 'Retailer', value: 'retailer' },
        { label: 'Sub-Retailer', value: 'sub_retailer' }
      ]
    : [
        { label: 'Retailer', value: 'retailer' },
        { label: 'Sub-Retailer', value: 'sub_retailer' }
      ];

  const getRoleBadge = (role) => {
    switch (role) {
      case 'state_franchisee': return <Badge tone="attention">🏅 State Franchisee</Badge>;
      case 'city_franchisee': return <Badge tone="warning">🌆 City Franchisee</Badge>;
      case 'retailer': return <Badge tone="info">🛍️ Retailer</Badge>;
      case 'sub_retailer': return <Badge tone="success">🔗 Sub-Retailer</Badge>;
      default: return <Badge tone="subdued">Partner</Badge>;
    }
  };

  return (
    <Page
      fullWidth
      title="Referral Partners"
      subtitle="View, edit, and audit referral partners and custom promotional codes via Cloud"
      compactTitle
      primaryAction={{
        content: 'Add Referral',
        onAction: () => { 
          // Default parent to user code if franchisee
          const franchiseeRoles = ['state_franchisee', 'city_franchisee'];
          setAddFormData({ 
            name: '', 
            email: '', 
            phone: '', 
            referral_code: '', 
            role: 'retailer', 
            parent_code: franchiseeRoles.includes(user?.role) ? user.referral_code : '',
            region: ''
          }); 
          setAddError(''); 
          setRefCodeManuallyEdited(false); 
          setIsAddDialogOpen(true); 
        }
      }}
      secondaryActions={[
        {
          content: 'Export CSV',
          icon: <FileDown size={16} />,
          onAction: () => exportToCSV(partners, `Referrals_${new Date().toISOString().split('T')[0]}.csv`)
        }
      ]}
    >
      <Layout>
        {/* Metric Summary Cards */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Total Partners" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{partners.length}</Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="info">Registered</Badge>
                    <Text variant="bodySm" tone="subdued">active chain list</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Active Codes" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">
                    {partners.filter(p => p.referral_code).length}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="success">In Use</Badge>
                    <Text variant="bodySm" tone="subdued">active promo paths</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
              <LegacyCard title="Joined (Last 30 Days)" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">
                    {partners.filter(p => {
                      const joinDate = new Date(p.created_at);
                      const diffTime = Math.abs(new Date() - joinDate);
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      return diffDays <= 30;
                    }).length}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="info">Growth</Badge>
                    <Text variant="bodySm" tone="subdued">new partners added</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Partners Table Card */}
        <Layout.Section>
          <LegacyCard>
            <Box padding="400">
              <InlineStack gap="300" align="space-between" blockAlign="center">
                <div style={{ flex: 1, maxWidth: '400px' }}>
                  <TextField
                    placeholder="Search referral partners..."
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
              resourceName={{ singular: 'referral', plural: 'referrals' }}
              itemCount={filteredPartners.length}
              loading={loading}
              headings={[
                { title: 'Partner Name' },
                { title: 'Level' },
                { title: 'Referral Code' },
                { title: 'Hierarchy' },
                { title: 'Contact Phone' },
                { title: 'Registered Date' },
                { title: 'Actions', alignment: 'end' }
              ]}
              selectable={false}
            >
              {paginatedPartners.map((partner, index) => {
                const { id, name, referral_code, email, phone, role, created_at } = partner;
                return (
                  <IndexTable.Row id={id} key={id} position={index}>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="bold" as="span">
                          {name}
                        </Text>
                        {email && <Text variant="bodyXs" tone="subdued">{email}</Text>}
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {getRoleBadge(role)}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="200" align="start" blockAlign="center">
                        {referral_code && (
                          <PolarisTooltip content="Copy Referral Link">
                            <Button
                              icon={<Link size={14} />}
                              onClick={() => {
                                navigator.clipboard.writeText(`https://ayuvitaayurveda.in/pages/referral?ref=${referral_code}`);
                                toast.success("Referral link copied!");
                              }}
                              variant="plain"
                            />
                          </PolarisTooltip>
                        )}
                        <Badge tone="success">{referral_code || 'N/A'}</Badge>
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <PolarisTooltip content={getHierarchyDetails(partner)}>
                        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {getChainNodes(partner).map((node, i) => {
                            const letter = node.name ? node.name.trim()[0].toUpperCase() : node.referral_code.trim()[0].toUpperCase();
                            const colors = getRoleColors(node.role);
                            return (
                              <div
                                key={i}
                                className={`flex items-center justify-center w-7 h-7 rounded-full border-2 border-white dark:border-[#09090b] font-bold text-xs ${colors}`}
                                style={{
                                  marginLeft: i === 0 ? '0' : '-8px',
                                  zIndex: i,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                }}
                              >
                                {letter}
                              </div>
                            );
                          })}
                        </div>
                      </PolarisTooltip>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{phone || 'N/A'}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {new Date(created_at).toLocaleDateString()}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '4px', justifyContent: 'flex-end', alignItems: 'center', minWidth: '120px' }}>
                        <PolarisTooltip content="View Orders">
                          <Button
                            icon={<Eye size={16} />}
                            onClick={() => handleViewOrdersClick(partner)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        <PolarisTooltip content="Edit Partner">
                          <Button
                            icon={<Edit size={16} />}
                            onClick={() => handleEditClick(partner)}
                            variant="plain"
                          />
                        </PolarisTooltip>
                        <PolarisTooltip content="Delete Partner">
                          <Button
                            icon={<Trash size={16} />}
                            onClick={() => handleDeletePartner(id)}
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

      {/* Add Referral Modal */}
      <Modal
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        title="Add New Referral Partner"
        primaryAction={{
          content: isAdding ? 'Adding...' : 'Create Partner',
          onAction: handleAddPartner,
          disabled: isAdding
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
            <FormLayout.Group>
              <TextField
                label="Full Name"
                value={addFormData.name}
                onChange={(val) => setAddFormData({ ...addFormData, name: val })}
                autoComplete="off"
                requiredIndicator
              />
              <TextField
                label="Mobile Phone Number"
                value={addFormData.phone}
                onChange={(val) => setAddFormData({ ...addFormData, phone: val })}
                placeholder="e.g. +91 9876543210"
                autoComplete="off"
                requiredIndicator
              />
            </FormLayout.Group>
            
            <FormLayout.Group>
              <Select
                label="Partner Level"
                options={roleOptions}
                value={addFormData.role}
                onChange={(val) => setAddFormData({ ...addFormData, role: val, parent_code: '' })}
              />
              
              {addFormData.role === 'sub_retailer' && (
                <Select
                  label="Select Parent Retailer"
                  options={[{ label: 'Select a Retailer...', value: '' }, ...retailerOptions]}
                  value={addFormData.parent_code}
                  onChange={(val) => setAddFormData({ ...addFormData, parent_code: val })}
                  requiredIndicator
                />
              )}

              {(addFormData.role === 'city_franchisee' || addFormData.role === 'retailer') && (
                <Select
                  label={addFormData.role === 'city_franchisee' ? 'Select Parent State Franchisee' : 'Select Parent City Franchisee'}
                  options={[
                    { label: 'None / Central', value: '' },
                    ...partners
                      .filter(p => addFormData.role === 'city_franchisee' ? p.role === 'state_franchisee' : ['state_franchisee', 'city_franchisee'].includes(p.role))
                      .map(p => ({ label: `${p.name} (${p.referral_code})`, value: p.referral_code }))
                  ]}
                  value={addFormData.parent_code}
                  onChange={(val) => setAddFormData({ ...addFormData, parent_code: val })}
                />
              )}
            </FormLayout.Group>

            <TextField
              label="Email Address"
              type="email"
              value={addFormData.email}
              onChange={(val) => setAddFormData({ ...addFormData, email: val })}
              placeholder="partner@example.com"
              autoComplete="off"
            />
            
            {(addFormData.role === 'state_franchisee' || addFormData.role === 'city_franchisee') && (
              <TextField
                label={addFormData.role === 'state_franchisee' ? 'State Name' : 'City Name'}
                value={addFormData.region}
                onChange={(val) => setAddFormData({ ...addFormData, region: val })}
                placeholder={addFormData.role === 'state_franchisee' ? 'e.g. Maharashtra' : 'e.g. Mumbai'}
                autoComplete="off"
              />
            )}

            <TextField
              label="Referral Code"
              value={addFormData.referral_code}
              onChange={(val) => {
                setRefCodeManuallyEdited(true);
                setAddFormData({ ...addFormData, referral_code: val.toUpperCase() });
              }}
              helpText="Auto-generated based on role sequence. You can change it to any custom code."
              autoComplete="off"
              requiredIndicator
            />
            {addError && (
              <Box padding="300" background="bg-fill-danger-subdued" borderRadius="100">
                <Text variant="bodyMd" tone="critical">{addError}</Text>
              </Box>
            )}
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Edit Partner Modal */}
      <Modal
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        title="Edit Referral Details"
        primaryAction={{
          content: isSaving ? 'Saving...' : 'Save Changes',
          onAction: handleUpdatePartner,
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
            <TextField
              label="Full Name"
              value={editFormData.name}
              onChange={(val) => setEditFormData({ ...editFormData, name: val })}
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="Referral Code"
              value={editFormData.referral_code}
              onChange={(val) => setEditFormData({ ...editFormData, referral_code: val })}
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="Email Address"
              type="email"
              value={editFormData.email}
              onChange={(val) => setEditFormData({ ...editFormData, email: val })}
              autoComplete="off"
            />
            <TextField
              label="Phone Number"
              value={editFormData.phone}
              onChange={(val) => setEditFormData({ ...editFormData, phone: val })}
              autoComplete="off"
            />
            {(editFormData.role === 'state_franchisee' || editFormData.role === 'city_franchisee') && (
              <TextField
                label={editFormData.role === 'state_franchisee' ? 'State Name' : 'City Name'}
                value={editFormData.region}
                onChange={(val) => setEditFormData({ ...editFormData, region: val })}
                autoComplete="off"
              />
            )}
            <Select
              label="Role"
              options={[
                { label: 'State Franchisee', value: 'state_franchisee' },
                { label: 'City Franchisee', value: 'city_franchisee' },
                { label: 'Retailer', value: 'retailer' },
                { label: 'Sub-Retailer', value: 'sub_retailer' }
              ]}
              value={editFormData.role}
              onChange={(val) => setEditFormData({ ...editFormData, role: val })}
              disabled={user?.role !== 'admin'}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Associated Orders Modal */}
      <Modal
        open={isOrdersDialogOpen}
        onClose={() => {
          setIsOrdersDialogOpen(false);
          setFilterStartDate('');
          setFilterEndDate('');
        }}
        title={selectedPartnerForOrders ? `Orders for ${selectedPartnerForOrders.name} (${selectedPartnerForOrders.referral_code})` : 'Associated Orders'}
        large
      >
        <Modal.Section>
          {(() => {
            const partnerOrders = selectedPartnerForOrders 
              ? orders.filter(o => {
                  const matchesRef = o.referral_code && o.referral_code.toLowerCase() === selectedPartnerForOrders.referral_code.toLowerCase();
                  if (!matchesRef) return false;
                  
                  const orderDate = new Date(o.invoice_date).setHours(0, 0, 0, 0);
                  const matchesStart = filterStartDate ? orderDate >= new Date(filterStartDate).setHours(0, 0, 0, 0) : true;
                  const matchesEnd = filterEndDate ? orderDate <= new Date(filterEndDate).setHours(23, 59, 59, 999) : true;
                  
                  return matchesStart && matchesEnd;
                })
              : [];
            const partnerTotalRevenue = partnerOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

            return (
              <BlockStack gap="400">
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                    <LegacyCard sectioned>
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="p">Associated Orders</Text>
                        <Text variant="heading2xl" as="p">{partnerOrders.length}</Text>
                      </BlockStack>
                    </LegacyCard>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                    <LegacyCard sectioned>
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="p">Total Revenue Generated</Text>
                        <Text variant="heading2xl" as="p" tone="success">
                          ₹{partnerTotalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </BlockStack>
                    </LegacyCard>
                  </Grid.Cell>
                </Grid>

                <LegacyCard>
                  <Box padding="300" borderBlockEndWidth="025" borderColor="border">
                    <InlineStack gap="300" align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h3">Associated Orders List</Text>
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

                  {partnerOrders.length === 0 ? (
                    <Box padding="800" align="center">
                      <Text variant="bodyMd" tone="subdued">No orders associated with this referral code for the selected date range.</Text>
                    </Box>
                  ) : (
                    <IndexTable
                      resourceName={{ singular: 'order', plural: 'orders' }}
                      itemCount={partnerOrders.length}
                      headings={[
                        { title: 'Invoice Number' },
                        { title: 'Date' },
                        { title: 'Customer' },
                        { title: 'Amount' },
                        { title: 'Status' }
                      ]}
                      selectable={false}
                    >
                      {partnerOrders.map((order, idx) => {
                        const { id, invoice_number, invoice_date, bill_to_name, total_amount, final_amount } = order;
                        const isPaid = (final_amount || 0) <= 0;
                        return (
                          <IndexTable.Row id={id} key={id} position={idx}>
                            <IndexTable.Cell>
                              <Text variant="bodyMd" fontWeight="bold" as="span">
                                {invoice_number?.startsWith('#') ? invoice_number : `#${invoice_number}`}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              {new Date(invoice_date).toLocaleDateString()}
                            </IndexTable.Cell>
                            <IndexTable.Cell>{bill_to_name}</IndexTable.Cell>
                            <IndexTable.Cell>₹{parseFloat(total_amount || 0).toFixed(2)}</IndexTable.Cell>
                            <IndexTable.Cell>
                              <Badge tone={isPaid ? 'success' : 'warning'}>
                                {isPaid ? 'Paid' : 'Pending'}
                              </Badge>
                            </IndexTable.Cell>
                          </IndexTable.Row>
                        );
                      })}
                    </IndexTable>
                  )}
                </LegacyCard>
              </BlockStack>
            );
          })()}
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default AllPartners;
