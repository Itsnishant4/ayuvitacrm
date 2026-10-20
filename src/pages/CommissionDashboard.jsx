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
  Pagination
} from '@shopify/polaris';
import { Search, FileDown, Calendar, Percent, Landmark, IndianRupee, HelpCircle } from "lucide-react";
import PolarisTooltip from '../components/PolarisTooltip';
import toast from 'react-hot-toast';
import { exportToCSV } from '../lib/exportUtils';
import { useData } from '../contexts/DataContext';

const CommissionDashboard = ({ user, onNavigate }) => {
  const { orders: ctxOrders, partners: ctxPartners, loading: ctxLoading, fetchOrders, fetchPartners } = useData();
  const [orders, setOrders] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchOrders();
    fetchPartners(user?.referral_code, user?.role);
  }, []);

  useEffect(() => {
    if (ctxOrders) setOrders(ctxOrders);
  }, [ctxOrders]);

  useEffect(() => {
    if (ctxPartners) setPartners(ctxPartners);
  }, [ctxPartners]);

  useEffect(() => {
    if (ctxOrders && ctxPartners) setLoading(false);
  }, [ctxOrders, ctxPartners]);

  // Helper to map code to partner object
  const getPartnerByCode = (code) => {
    if (!code || !partners) return null;
    return partners.find(p => p.referral_code.toLowerCase() === code.toLowerCase());
  };

  // Get full nodes list for hierarchy stack
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

  // Resolve full parent chain for a partner (for tooltip details)
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

  // Find all partners matching the search term (by code or name) to associate override income
  const matchingPartners = searchTerm.trim() && partners 
    ? partners.filter(p => 
        p.referral_code.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        p.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
      )
    : [];

  // Calculate commissions for each order
  const calculatedCommissions = orders
    .map(order => {
      const referralCode = order.referral_code || '';
      if (!referralCode) return null;

      // Find the partner who owns this referral code
      const partner = getPartnerByCode(referralCode);
      if (!partner) return null;

      const orderTotal = parseFloat(order.total_amount || 0);
      const shipping = parseFloat(order.shipping_charges || 0);
      const commissionableTotal = Math.max(0, orderTotal - shipping);

      let retailerCode = '';
      let retailerName = '';
      let retailerAmount = 0;

      let cityCode = '';
      let cityName = '';
      let cityAmount = 0;

      let stateCode = '';
      let stateName = '';
      let stateAmount = 0;

      let overrideCode = '';
      let overrideName = '';
      let overrideAmount = 0;

      const chain = getChainNodes(referralCode);

      // 1. Retailer (10%) - only for retailer / sub_retailer roles
      if (partner.role === 'retailer' || partner.role === 'sub_retailer') {
        retailerCode = partner.referral_code;
        retailerName = partner.name;
        retailerAmount = commissionableTotal * 0.10;
      }

      // 2. City Franchisee (25%) - resolved from chain
      const cityPartner = chain.find(node => node.role === 'city_franchisee');
      if (cityPartner) {
        cityCode = cityPartner.referral_code;
        cityName = cityPartner.name;
        cityAmount = commissionableTotal * 0.25;
      }

      // 3. State Franchisee (30%) - resolved from chain
      const statePartner = chain.find(node => node.role === 'state_franchisee');
      if (statePartner) {
        stateCode = statePartner.referral_code;
        stateName = statePartner.name;
        stateAmount = commissionableTotal * 0.30;
      }

      // 4. Override Partner (5%) - only applicable if partner is sub_retailer
      if (partner.role === 'sub_retailer' && partner.parent_code) {
        const parent = getPartnerByCode(partner.parent_code);
        if (parent) {
          overrideCode = parent.referral_code;
          overrideName = parent.name;
          overrideAmount = commissionableTotal * 0.05;
        }
      }

      return {
        id: order.id,
        invoice_number: order.invoice_number,
        invoice_date: order.invoice_date,
        bill_to_name: order.bill_to_name,
        total_amount: orderTotal,
        shipping_charges: shipping,
        commissionable_amount: commissionableTotal,
        referral_code: referralCode,
        partner_role: partner.role,
        retailerCode,
        retailerName,
        retailerAmount,
        cityCode,
        cityName,
        cityAmount,
        stateCode,
        stateName,
        stateAmount,
        overrideCode,
        overrideName,
        overrideAmount
      };
    })
    .filter(Boolean)
    // Filter by search term & dates
    .filter(comm => {
      const matchesPartner = matchingPartners.some(p => 
        (comm.retailerCode || '').toLowerCase() === p.referral_code.toLowerCase() ||
        (comm.cityCode || '').toLowerCase() === p.referral_code.toLowerCase() ||
        (comm.stateCode || '').toLowerCase() === p.referral_code.toLowerCase() ||
        (comm.overrideCode || '').toLowerCase() === p.referral_code.toLowerCase()
      );

      const matchesSearch = 
        comm.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comm.bill_to_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comm.referral_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comm.retailerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comm.cityName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comm.stateName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comm.overrideName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        matchesPartner;

      const orderDate = new Date(comm.invoice_date).setHours(0, 0, 0, 0);
      const matchesStart = filterStartDate ? orderDate >= new Date(filterStartDate).setHours(0, 0, 0, 0) : true;
      const matchesEnd = filterEndDate ? orderDate <= new Date(filterEndDate).setHours(23, 59, 59, 999) : true;

      return matchesSearch && matchesStart && matchesEnd;
    });

  // Calculate totals
  const totalSales = calculatedCommissions.reduce((sum, c) => sum + c.commissionable_amount, 0);
  
  // Franchisee/Admin view specific calculations
  let directEarnings = 0;
  let overrideEarnings = 0;
  let totalPayableToRetailers = 0;
  let totalPayableToSubRetailers = 0;

  calculatedCommissions.forEach(c => {
    const franchiseeRoles = ['state_franchisee', 'city_franchisee'];
    // If Franchisee view:
    if (franchiseeRoles.includes(user?.role)) {
      const code = user.referral_code.toLowerCase();
      // Franchisee earnings
      if (user.role === 'state_franchisee') {
        if (c.stateCode.toLowerCase() === code) {
          directEarnings += c.stateAmount;
        }
        // State Franchisee pays City Franchisee (25%) if present
        if (c.cityCode && c.stateCode.toLowerCase() === code) {
          totalPayableToRetailers += c.cityAmount;
        }
      } else if (user.role === 'city_franchisee') {
        if (c.cityCode.toLowerCase() === code) {
          directEarnings += c.cityAmount;
        }
      }

      // Track payables to downline retailers/sub-retailers if this user is their ancestor
      const isAncestor = [c.stateCode.toLowerCase(), c.cityCode.toLowerCase()].includes(code);
      if (isAncestor) {
        if (c.partner_role === 'retailer') {
          totalPayableToRetailers += c.retailerAmount; // 10%
        } else if (c.partner_role === 'sub_retailer') {
          totalPayableToSubRetailers += c.retailerAmount; // 10%
          if (c.overrideCode.toLowerCase() === code) {
            overrideEarnings += c.overrideAmount;
          } else {
            totalPayableToRetailers += c.overrideAmount; // 5% override goes to downline retailer
          }
        }
      }
    } else {
      // Main Admin totals
      directEarnings += (c.stateAmount || 0) + (c.cityAmount || 0);
      
      if (c.partner_role === 'retailer') {
        totalPayableToRetailers += c.retailerAmount;
      } else if (c.partner_role === 'sub_retailer') {
        totalPayableToSubRetailers += c.retailerAmount;
        totalPayableToRetailers += c.overrideAmount;
      }
    }
  });

  const totalCommissionsPaid = directEarnings + overrideEarnings + totalPayableToRetailers + totalPayableToSubRetailers;

  // Calculated totals for filtered invoices summary row
  let filteredTotalRetailer = 0;
  let filteredTotalCity = 0;
  let filteredTotalState = 0;
  let filteredTotalOverride = 0;

  if (searchTerm.trim()) {
    calculatedCommissions.forEach(c => {
      const isRetailerMatch = 
        (c.retailerCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.retailerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        matchingPartners.some(p => (c.retailerCode || '').toLowerCase() === p.referral_code.toLowerCase());

      const isCityMatch = 
        (c.cityCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.cityName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        matchingPartners.some(p => (c.cityCode || '').toLowerCase() === p.referral_code.toLowerCase());

      const isStateMatch = 
        (c.stateCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.stateName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        matchingPartners.some(p => (c.stateCode || '').toLowerCase() === p.referral_code.toLowerCase());

      const isOverrideMatch = 
        (c.overrideCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.overrideName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        matchingPartners.some(p => (c.overrideCode || '').toLowerCase() === p.referral_code.toLowerCase());

      if (isRetailerMatch) filteredTotalRetailer += c.retailerAmount || 0;
      if (isCityMatch) filteredTotalCity += c.cityAmount || 0;
      if (isStateMatch) filteredTotalState += c.stateAmount || 0;
      if (isOverrideMatch) filteredTotalOverride += c.overrideAmount || 0;
    });
  } else {
    filteredTotalRetailer = calculatedCommissions.reduce((sum, c) => sum + (c.retailerAmount || 0), 0);
    filteredTotalCity = calculatedCommissions.reduce((sum, c) => sum + (c.cityAmount || 0), 0);
    filteredTotalState = calculatedCommissions.reduce((sum, c) => sum + (c.stateAmount || 0), 0);
    filteredTotalOverride = calculatedCommissions.reduce((sum, c) => sum + (c.overrideAmount || 0), 0);
  }

  const filteredCombinedTotal = filteredTotalRetailer + filteredTotalCity + filteredTotalState + filteredTotalOverride;

  // Determine total label based on search
  let totalLabel = "Total";
  if (searchTerm.trim()) {
    if (matchingPartners.length > 0) {
      totalLabel = `${matchingPartners[0].name}'s Total`;
    } else {
      totalLabel = `Total (${searchTerm.trim()})`;
    }
  }

  // Pagination
  const totalPages = Math.ceil(calculatedCommissions.length / itemsPerPage);
  const paginatedCommissions = calculatedCommissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = () => {
    const exportData = calculatedCommissions.map(c => ({
      "Invoice Number": c.invoice_number,
      "Date": new Date(c.invoice_date).toLocaleDateString(),
      "Customer": c.bill_to_name,
      "Order Value (Gross)": `INR ${c.total_amount.toFixed(2)}`,
      "Shipping Charges": `INR ${c.shipping_charges.toFixed(2)}`,
      "Commissionable Value (Net)": `INR ${c.commissionable_amount.toFixed(2)}`,
      "Referral Code Used": c.referral_code,
      "Partner Level": c.partner_role,
      "State Franchisee Name": c.stateName || 'N/A',
      "State Franchisee Code": c.stateCode || 'N/A',
      "State Franchisee Commission (30%)": `INR ${c.stateAmount.toFixed(2)}`,
      "City Franchisee Name": c.cityName || 'N/A',
      "City Franchisee Code": c.cityCode || 'N/A',
      "City Franchisee Commission (25%)": `INR ${c.cityAmount.toFixed(2)}`,
      "Retailer Name": c.retailerName || 'N/A',
      "Retailer Code": c.retailerCode || 'N/A',
      "Retailer Commission (10%)": `INR ${c.retailerAmount.toFixed(2)}`,
      "Override Partner Name": c.overrideName || 'N/A',
      "Override Code": c.overrideCode || 'N/A',
      "Override Commission (5%)": `INR ${c.overrideAmount.toFixed(2)}`
    }));
    exportToCSV(exportData, `Commissions_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const getBadgeForRole = (role) => {
    switch (role) {
      case 'state_franchisee': return <Badge tone="attention">State Franchisee</Badge>;
      case 'city_franchisee': return <Badge tone="warning">City Franchisee</Badge>;
      case 'retailer': return <Badge tone="info">Retailer</Badge>;
      case 'sub_retailer': return <Badge tone="success">Sub-Retailer</Badge>;
      default: return <Badge tone="subdued">Partner</Badge>;
    }
  };

  return (
    <Page
      fullWidth
      title="Commission Dashboard"
      subtitle="Monitor branch earnings, overrides, and downline commission payables in real-time"
      compactTitle
      secondaryActions={[
        {
          content: 'Export Report',
          icon: <FileDown size={16} />,
          onAction: handleExport
        }
      ]}
    >
      <Layout>
        {/* Metric Cards */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
              <LegacyCard title="Total Branch Revenue" sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">
                    ₹{totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="info">Sales Value</Badge>
                    <Text variant="bodySm" tone="subdued">across direct & downline</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
              <LegacyCard title={['state_franchisee', 'city_franchisee'].includes(user?.role) ? "Owner Earnings" : "Total Franchisee Earnings"} sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p" tone="success">
                    ₹{(['state_franchisee', 'city_franchisee'].includes(user?.role) ? (directEarnings + overrideEarnings) : directEarnings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="success">Earnings</Badge>
                    <Text variant="bodySm" tone="subdued">direct & override share</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
              <LegacyCard title={['state_franchisee', 'city_franchisee'].includes(user?.role) ? "Retailer Payables" : "Total Retailer Payables"} sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p" tone="success">
                    ₹{totalPayableToRetailers.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="attention">Payable</Badge>
                    <Text variant="bodySm" tone="subdued">to downline retailers</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
              <LegacyCard title={['state_franchisee', 'city_franchisee'].includes(user?.role) ? "Sub-Retailer Payables" : "Total Sub-Retailer Payables"} sectioned>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p" tone="success">
                    ₹{totalPayableToSubRetailers.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <InlineStack align="start" gap="100">
                    <Badge tone="attention">Payable</Badge>
                    <Text variant="bodySm" tone="subdued">to downline sub-retailers</Text>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Filter and Table Card */}
        <Layout.Section>
          <LegacyCard>
            <Box padding="400">
              <InlineStack gap="300" align="space-between" blockAlign="center">
                <div style={{ flex: 1, maxWidth: '350px' }}>
                  <TextField
                    placeholder="Search invoice, code, partner..."
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
                      Clear Dates
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
            </Box>

            {calculatedCommissions.length === 0 && !loading ? (
              <Box padding="800" align="center">
                <Text variant="bodyMd" tone="subdued">No matching transactions found containing commissionable referral codes.</Text>
              </Box>
            ) : (
              <IndexTable
                resourceName={{ singular: 'commission', plural: 'commissions' }}
                itemCount={calculatedCommissions.length}
                loading={loading}
                headings={[
                  { title: 'Invoice' },
                  { title: 'Customer' },
                  { title: 'Sales Total' },
                  { title: 'Code Used' },
                  { title: 'State Franchisee (30%)' },
                  { title: 'City Franchisee (25%)' },
                  { title: 'Retailer (10%)' },
                  { title: 'Override Partner (5%)' }
                ]}
                selectable={false}
              >
                {paginatedCommissions.map((comm, idx) => {
                  return (
                    <IndexTable.Row id={comm.id} key={comm.id} position={idx}>
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="bold" as="span">
                            {comm.invoice_number?.startsWith('#') ? comm.invoice_number : `#${comm.invoice_number}`}
                          </Text>
                          <Text variant="bodyXs" tone="subdued">{new Date(comm.invoice_date).toLocaleDateString()}</Text>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{comm.bill_to_name}</IndexTable.Cell>
                      <IndexTable.Cell>₹{comm.commissionable_amount.toFixed(2)}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="100" blockAlign="center"  wrap={false}>
                          <Badge tone="attention">{comm.referral_code}</Badge>
                          {getBadgeForRole(comm.partner_role)}
                          <PolarisTooltip content={getHierarchyDetails(comm.referral_code)}>
                            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {getChainNodes(comm.referral_code).map((node, i) => {
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
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {comm.stateName ? (
                          <BlockStack gap="050">
                            <Text variant="bodyMd" fontWeight="bold" as="span">
                              {comm.stateName}
                            </Text>
                            <Text variant="bodyXs" tone="success">₹{comm.stateAmount.toFixed(2)}</Text>
                          </BlockStack>
                        ) : (
                          <Text variant="bodyMd" tone="subdued">—</Text>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {comm.cityName ? (
                          <BlockStack gap="050">
                            <Text variant="bodyMd" fontWeight="bold" as="span">
                              {comm.cityName}
                            </Text>
                            <Text variant="bodyXs" tone="success">₹{comm.cityAmount.toFixed(2)}</Text>
                          </BlockStack>
                        ) : (
                          <Text variant="bodyMd" tone="subdued">—</Text>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {comm.retailerName ? (
                          <BlockStack gap="050">
                            <Text variant="bodyMd" fontWeight="bold" as="span">
                              {comm.retailerName}
                            </Text>
                            <Text variant="bodyXs" tone="success">₹{comm.retailerAmount.toFixed(2)}</Text>
                          </BlockStack>
                        ) : (
                          <Text variant="bodyMd" tone="subdued">—</Text>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {comm.overrideName ? (
                          <BlockStack gap="050">
                            <Text variant="bodyMd" fontWeight="bold" as="span">{comm.overrideName}</Text>
                            <Text variant="bodyXs" tone="success">₹{comm.overrideAmount.toFixed(2)}</Text>
                          </BlockStack>
                        ) : (
                          <Text variant="bodyMd" tone="subdued">—</Text>
                        )}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}

                <IndexTable.Row id="totals-row" position={paginatedCommissions.length}>
                  <IndexTable.Cell className="bg-zinc-50 dark:bg-zinc-900/30 border-t-2 border-double border-zinc-200 dark:border-zinc-800">
                    <Text variant="bodyMd" fontWeight="bold">{totalLabel}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell className="bg-zinc-50 dark:bg-zinc-900/30 border-t-2 border-double border-zinc-200 dark:border-zinc-800">
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued">Combined Comm.</Text>
                      <Text variant="bodyMd" fontWeight="bold" tone="success">
                        ₹{filteredCombinedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell className="bg-zinc-50 dark:bg-zinc-900/30 border-t-2 border-double border-zinc-200 dark:border-zinc-800">
                    <Text variant="bodyMd" fontWeight="bold">
                      ₹{totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell className="bg-zinc-50 dark:bg-zinc-900/30 border-t-2 border-double border-zinc-200 dark:border-zinc-800">
                    <Text variant="bodyMd" tone="subdued">—</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell className="bg-zinc-50 dark:bg-zinc-900/30 border-t-2 border-double border-zinc-200 dark:border-zinc-800">
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued">Total State</Text>
                      <Text variant="bodyMd" fontWeight="bold" tone="success">
                        ₹{filteredTotalState.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell className="bg-zinc-50 dark:bg-zinc-900/30 border-t-2 border-double border-zinc-200 dark:border-zinc-800">
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued">Total City</Text>
                      <Text variant="bodyMd" fontWeight="bold" tone="success">
                        ₹{filteredTotalCity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell className="bg-zinc-50 dark:bg-zinc-900/30 border-t-2 border-double border-zinc-200 dark:border-zinc-800">
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued">Total Retailer</Text>
                      <Text variant="bodyMd" fontWeight="bold" tone="success">
                        ₹{filteredTotalRetailer.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell className="bg-zinc-50 dark:bg-zinc-900/30 border-t-2 border-double border-zinc-200 dark:border-zinc-800">
                    <BlockStack gap="050">
                      <Text variant="bodyXs" tone="subdued">Total Override</Text>
                      <Text variant="bodyMd" fontWeight="bold" tone="success">
                        ₹{filteredTotalOverride.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              </IndexTable>
            )}

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
    </Page>
  );
};

export default CommissionDashboard;
