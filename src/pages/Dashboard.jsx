import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie
} from 'recharts';
import {
  TrendingUp, ShoppingBag, Users, AlertTriangle, IndianRupee, Package, Award,
  FilePlus, UserPlus, Database, Boxes, PackagePlus, ListOrdered, UsersRound, Calendar as CalendarIcon, Check, ChevronRight
} from 'lucide-react';
import {
  Page,
  Layout,
  LegacyCard,
  Grid,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Box,
  ButtonGroup,
  DatePicker,
  Popover as PolarisPopover,
  Avatar
} from '@shopify/polaris';
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import toast from 'react-hot-toast';
import { useData } from '../contexts/DataContext';

const Dashboard = ({ user, onNavigate }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Date range state
  const [dateRange, setDateRange] = useState(() => {
    const saved = localStorage.getItem('dashboard_default_range');
    if (saved) {
      const { from, to, label } = JSON.parse(saved);
      return {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        label: label || 'Last 30 Days'
      };
    }
    return { from: subDays(new Date(), 30), to: new Date(), label: 'Last 30 Days' };
  });

  const [popoverActive, setPopoverActive] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const kpiCellSpan = ['state_franchisee', 'city_franchisee'].includes(user?.role)
    ? { xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }
    : { xs: 6, sm: 6, md: 3, lg: 3, xl: 3 };

  const { products, fetchProducts } = useData();

  useEffect(() => {
    fetchAnalytics();
    fetchProducts();

    const handleSyncComplete = () => fetchAnalytics();
    window.addEventListener('shopify-sync-completed', handleSyncComplete);
    
    return () => {
      window.removeEventListener('shopify-sync-completed', handleSyncComplete);
    };
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    const start = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : null;
    const end = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : null;

    const result = await window.api.getAnalytics(start, end, user?.referral_code, user?.role);
    const productsRes = products ? { success: true, products } : await window.api.getProducts();

    if (result.success) {
      if (productsRes.success) {
        // Fetch actual low stock products
        result.lowStockProducts = productsRes.products
          .filter(p => p.stock <= 15)
          .sort((a, b) => a.stock - b.stock)
          .slice(0, 5);
      } else {
        result.lowStockProducts = [];
      }
      setData(result);
    }
    setLoading(false);
  };

  const setRangePreset = (days, label) => {
    let from, to;
    if (days === 0) { // Yesterday
      from = subDays(startOfDay(new Date()), 1);
      to = subDays(endOfDay(new Date()), 1);
    } else if (days === 1) { // Today
      from = startOfDay(new Date());
      to = endOfDay(new Date());
    } else {
      from = subDays(new Date(), days);
      to = new Date();
    }
    setDateRange({ from, to, label });
  };

  const handleSetDefault = () => {
    localStorage.setItem('dashboard_default_range', JSON.stringify({
      from: dateRange.from,
      to: dateRange.to,
      label: dateRange.label
    }));
    toast.success(`"${dateRange.label}" set as default view`, { icon: '📌' });
  };

  const handleCustomDateSelect = (range) => {
    if (range.start && range.end) {
      setDateRange({
        from: range.start,
        to: range.end,
        label: 'Custom Range'
      });
      setPopoverActive(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '24px' }}>
        <BlockStack gap="500">
          <Box padding="400" background="bg-surface" borderRadius="200" shadow="md">
            <Text variant="headingXl" as="h2">Loading Analytics...</Text>
          </Box>
        </BlockStack>
      </div>
    );
  }

  // Premium Shopify Polaris color palette
  const COLORS = ['#008060', '#47c1bf', '#5c6ac4', '#eec200', '#00848e'];

  // Custom date picker popover activator
  const datePickerActivator = (
    <Button
      onClick={() => setPopoverActive(!popoverActive)}
      icon={<CalendarIcon size={16} />}
      variant={dateRange.label === 'Custom Range' ? 'secondary' : 'plain'}
    >
      {dateRange.label === 'Custom Range' ? 'Custom Range' : 'Custom Date'}
    </Button>
  );

  return (
    <Page
      fullWidth
      title="Business Dashboard"
      subtitle={`Viewing data for ${dateRange.label} (${dateRange.from ? format(dateRange.from, 'PP') : ''} - ${dateRange.to ? format(dateRange.to, 'PP') : ''})`}
      compactTitle
      secondaryActions={[
        {
          content: 'Set as Default Range',
          onAction: handleSetDefault
        }
      ]}
    >
      <Layout>
        {/* Logged in User Profile Banner */}
        <Layout.Section>
          <LegacyCard sectioned>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Avatar size="md" name={user?.username || 'User'} />
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h2">
                    Welcome back, {user?.username || 'User'}
                  </Text>
                  <InlineStack gap="150" blockAlign="center">
                    <Badge tone={user?.role === 'admin' ? 'brand' : 'success'}>
                      {user?.role === 'admin' ? 'Admin' : 'Franchisee'}
                    </Badge>
                    {user?.referral_code && (
                      <Badge tone="attention">
                        Referral Code: {user.referral_code}
                      </Badge>
                    )}
                  </InlineStack>
                </BlockStack>
              </InlineStack>
              <Text variant="bodySm" tone="subdued">
                Session Active • {user?.role === 'admin' ? 'System-wide access' : 'Branch data isolated'}
              </Text>
            </InlineStack>
          </LegacyCard>
        </Layout.Section>

        {/* Filters and Quick Actions Panel Row */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
              <LegacyCard sectioned>
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h3" tone="subdued">Analytics Timeframe</Text>
                  <InlineStack align="space-between" blockAlign="center">
                    <ButtonGroup variant="segmented">
                      <Button
                        pressed={dateRange.label === 'Yesterday'}
                        onClick={() => setRangePreset(0, 'Yesterday')}
                      >
                        Yesterday
                      </Button>
                      <Button
                        pressed={dateRange.label === 'Last 7 Days'}
                        onClick={() => setRangePreset(7, 'Last 7 Days')}
                      >
                        7 Days
                      </Button>
                      <Button
                        pressed={dateRange.label === 'Last 30 Days'}
                        onClick={() => setRangePreset(30, 'Last 30 Days')}
                      >
                        30 Days
                      </Button>
                    </ButtonGroup>

                    <PolarisPopover
                      active={popoverActive}
                      activator={datePickerActivator}
                      onClose={() => setPopoverActive(false)}
                    >
                      <Box padding="400">
                        <DatePicker
                          month={selectedMonth.getMonth()}
                          year={selectedMonth.getFullYear()}
                          onChange={handleCustomDateSelect}
                          onMonthChange={(month, year) => setSelectedMonth(new Date(year, month))}
                          selected={{
                            start: dateRange.from,
                            end: dateRange.to
                          }}
                          allowRange
                        />
                      </Box>
                    </PolarisPopover>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>

            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
              <LegacyCard sectioned>
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h3" tone="subdued">Quick Tasks</Text>
                  <InlineStack gap="200" wrap>
                    <Button onClick={() => onNavigate('manage-orders')} icon={<ListOrdered size={15} />} variant="secondary">
                      Orders
                    </Button>
                    <Button onClick={() => onNavigate('manage-customers')} icon={<UserPlus size={15} />} variant="secondary">
                      Customers
                    </Button>
                    {!['state_franchisee', 'city_franchisee'].includes(user?.role) && (
                      <Button onClick={() => onNavigate('stock-management')} icon={<Boxes size={15} />} variant="secondary">
                        Stock
                      </Button>
                    )}
                    <Button onClick={() => onNavigate('add-partner')} icon={<UsersRound size={15} />} variant="secondary">
                      Partner
                    </Button>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Premium KPI Cards */}
        <Layout.Section>
          <Grid>
            {/* KPI 1: Revenue */}
            <Grid.Cell columnSpan={kpiCellSpan}>
              <LegacyCard sectioned>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="bodyMd" tone="subdued" fontWeight="medium">Total Revenue</Text>
                    <Text variant="heading2xl" as="p" fontWeight="bold">₹{data?.summary.total_revenue.toLocaleString()}</Text>
                    <InlineStack align="start" gap="100" blockAlign="center">
                      <Badge tone="success">+14.2%</Badge>
                      <Text variant="bodySm" tone="subdued">vs. last month</Text>
                    </InlineStack>
                  </BlockStack>
                  <Box padding="300" background="bg-fill-success-secondary" borderRadius="500">
                    <IndianRupee className="w-6 h-6 text-green-700" />
                  </Box>
                </InlineStack>
              </LegacyCard>
            </Grid.Cell>

            {/* KPI 2: Total Store Orders */}
            <Grid.Cell columnSpan={kpiCellSpan}>
              <LegacyCard sectioned>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="bodyMd" tone="subdued" fontWeight="medium">Store Orders</Text>
                    <Text variant="heading2xl" as="p" fontWeight="bold">{data?.summary.total_orders}</Text>
                    <InlineStack align="start" gap="100" blockAlign="center">
                      <Badge tone="success">+8.5%</Badge>
                      <Text variant="bodySm" tone="subdued">vs. last month</Text>
                    </InlineStack>
                  </BlockStack>
                  <Box padding="300" background="bg-fill-info-secondary" borderRadius="500">
                    <ShoppingBag className="w-6 h-6 text-blue-700" />
                  </Box>
                </InlineStack>
              </LegacyCard>
            </Grid.Cell>

            {/* KPI 3: Total Customers */}
            <Grid.Cell columnSpan={kpiCellSpan}>
              <LegacyCard sectioned>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="bodyMd" tone="subdued" fontWeight="medium">Total Customers</Text>
                    <Text variant="heading2xl" as="p" fontWeight="bold">{data?.summary.total_customers}</Text>
                    <InlineStack align="start" gap="100" blockAlign="center">
                      <Badge tone="info">Active</Badge>
                      <Text variant="bodySm" tone="subdued">registered users</Text>
                    </InlineStack>
                  </BlockStack>
                  <Box padding="300" background="bg-fill-brand-secondary" borderRadius="500">
                    <Users className="w-6 h-6 text-indigo-700" />
                  </Box>
                </InlineStack>
              </LegacyCard>
            </Grid.Cell>

            {/* KPI 4: Low Stock Alert */}
            {!['state_franchisee', 'city_franchisee'].includes(user?.role) && (
              <Grid.Cell columnSpan={kpiCellSpan}>
                <LegacyCard sectioned>
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodyMd" tone="subdued" fontWeight="medium">Low Stock alerts</Text>
                      <Text variant="heading2xl" as="p" fontWeight="bold">{data?.summary.low_stock_count}</Text>
                      <InlineStack align="start" gap="100" blockAlign="center">
                        <Badge tone={data?.summary.low_stock_count > 0 ? 'warning' : 'info'}>
                          {data?.summary.low_stock_count > 0 ? 'Action Required' : 'Optimal'}
                        </Badge>
                        <Text variant="bodySm" tone="subdued">items low</Text>
                      </InlineStack>
                    </BlockStack>
                    <Box padding="300" background={data?.summary.low_stock_count > 0 ? 'bg-fill-warning-secondary' : 'bg-fill-success-secondary'} borderRadius="500">
                      <AlertTriangle className={`w-6 h-6 ${data?.summary.low_stock_count > 0 ? 'text-amber-700' : 'text-green-700'}`} />
                    </Box>
                  </InlineStack>
                </LegacyCard>
              </Grid.Cell>
            )}
          </Grid>
        </Layout.Section>

        {/* Row 1: Area Chart (Sales Trend) & Pie Chart (Referrals) */}
        <Layout.Section>
          <Grid>
            {/* Sales Trend Performance */}
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 8, xl: 8 }}>
              <LegacyCard title="Sales Trend Performance" sectioned>
                <div style={{ height: '320px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.salesTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="premiumSalesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#008060" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#008060" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        fontSize={10}
                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        stroke="#7a7a7a"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        fontSize={10}
                        stroke="#7a7a7a"
                        tickFormatter={(val) => `₹${val}`}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e1e3e5',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                          fontSize: '12px'
                        }}
                        formatter={(val) => [`₹${val}`, 'Revenue']}
                      />
                      <Area
                        type="monotone"
                        dataKey="total_sales"
                        stroke="#008060"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#premiumSalesGrad)"
                        dot={{ r: 4, fill: '#008060', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </LegacyCard>
            </Grid.Cell>

            {/* Referral Performance Share */}
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 4, xl: 4 }}>
              <LegacyCard title="Referral Performance Share" sectioned>
                <div style={{ height: '320px', width: '100%' }}>
                  {data?.referralStats && data.referralStats.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data?.referralStats}
                          cx="50%"
                          cy="48%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="revenue"
                          nameKey="name"
                        >
                          {data?.referralStats.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e1e3e5', fontSize: '11px' }}
                          formatter={(val) => [`₹${val}`, 'Sales contribution']}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={40}
                          iconSize={10}
                          formatter={(value) => <span style={{ fontSize: '11px', color: '#6d7175' }}>{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <UsersRound className="w-10 h-10 text-muted-foreground opacity-30 mb-2" />
                      <Text variant="bodyMd" tone="subdued">No referral data recorded in this period</Text>
                    </div>
                  )}
                </div>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Row 2: Bar Chart (Top Products) & Critical Stock Alerts */}
        <Layout.Section>
          <Grid>
            {/* Top Products Chart */}
            <Grid.Cell columnSpan={['state_franchisee', 'city_franchisee'].includes(user?.role) ? { xs: 6, sm: 6, md: 6, lg: 12, xl: 12 } : { xs: 6, sm: 6, md: 6, lg: 8, xl: 8 }}>
              <LegacyCard title="Top Selling Products by Revenue" sectioned>
                <div style={{ height: '330px', width: '100%' }}>
                  {data?.topProducts && data.topProducts.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.topProducts} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          fontSize={11}
                          width={110}
                          stroke="#6d7175"
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e1e3e5', fontSize: '11px' }}
                          formatter={(val) => [`₹${val}`, 'Revenue']}
                        />
                        <Bar dataKey="revenue" radius={[0, 8, 8, 0]} barSize={18}>
                          {data?.topProducts.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <Package className="w-10 h-10 text-muted-foreground opacity-30 mb-2" />
                      <Text variant="bodyMd" tone="subdued">No sales recorded for any products</Text>
                    </div>
                  )}
                </div>
              </LegacyCard>
            </Grid.Cell>

            {/* Critical Stock Alerts List */}
            {!['state_franchisee', 'city_franchisee'].includes(user?.role) && (
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 4, xl: 4 }}>
                <LegacyCard title="Critical Stock Alerts" sectioned>
                  <div style={{ height: '330px', overflowY: 'auto' }}>
                    {data?.lowStockProducts && data.lowStockProducts.length > 0 ? (
                      <BlockStack gap="300">
                        {data.lowStockProducts.map((p, i) => (
                          <Box
                            key={i}
                            padding="300"
                            background="bg-surface"
                            borderStyle="solid"
                            borderWidth="025"
                            borderColor="border"
                            borderRadius="200"
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap="300" blockAlign="center">
                                <Box padding="200" background="bg-fill-warning-secondary" borderRadius="200">
                                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                                </Box>
                                <BlockStack gap="050">
                                  <Text variant="bodyMd" fontWeight="semibold">{p.item_name}</Text>
                                  <Text variant="bodySm" tone="subdued">SKU: {p.batch_id || 'N/A'}</Text>
                                </BlockStack>
                              </InlineStack>
                              <BlockStack gap="050" align="end">
                                <Badge tone="critical">{p.stock} {p.unit}</Badge>
                                <Text variant="bodySm" tone="subdued">remaining</Text>
                              </BlockStack>
                            </InlineStack>
                          </Box>
                        ))}
                      </BlockStack>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center" style={{ height: '280px' }}>
                        <Box padding="400" background="bg-fill-success-secondary" borderRadius="500" className="mb-3">
                          <Check className="w-8 h-8 text-green-700" />
                        </Box>
                        <Text variant="headingMd" as="h4" fontWeight="semibold">Inventory Stable</Text>
                        <Text variant="bodyMd" tone="subdued">All products are currently well-stocked.</Text>
                      </div>
                    )}
                  </div>
                </LegacyCard>
              </Grid.Cell>
            )}
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Dashboard;
