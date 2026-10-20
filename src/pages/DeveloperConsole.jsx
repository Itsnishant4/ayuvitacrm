import React, { useState, useEffect } from 'react';
import {
  Page, Layout, LegacyCard, Grid, Text, Button, TextField, InlineStack, BlockStack, Box, Badge, Banner
} from '@shopify/polaris';
import { Settings, Play, RefreshCw } from 'lucide-react';

const DeveloperConsole = () => {
  // Settings state
  const [domain, setDomain] = useState('');
  const [token, setToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tokenExpiresAt, setTokenExpiresAt] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);
  const [generateLoading, setGenerateLoading] = useState(false);

  // Custom API Explorer state
  const [apiType, setApiType] = useState('REST'); // REST or GraphQL
  const [restEndpoint, setRestEndpoint] = useState('/orders.json?limit=5');
  const [graphqlQuery, setGraphqlQuery] = useState(`query GetStoreInfo {
  shop {
    name
    primaryDomain {
      url
    }
  }
}`);
  const [apiResponse, setApiResponse] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);

  // Sync execution state
  const [syncLogs, setSyncLogs] = useState([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('');

  // Load saved credentials on mount
  useEffect(() => {
    loadSettings();

    let unsubscribe;
    if (window.api && window.api.onShopifySyncLog) {
      unsubscribe = window.api.onShopifySyncLog((log) => {
        addLog(log.message, log.type);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const loadSettings = async () => {
    try {
      const res = await window.api.getShopifySettings();
      if (res.success) {
        setDomain(res.domain || '');
        setToken(res.token || '');
        setClientId(res.clientId || '');
        setClientSecret(res.clientSecret || '');
        setTokenExpiresAt(res.tokenExpiresAt || '');
        setLastSyncTime(res.lastSync || 'Never');
        addLog(`Loaded Shopify settings. Domain: ${res.domain || 'Not configured'}`);
      } else {
        addLog(`Failed to load credentials: ${res.error}`, 'error');
      }
    } catch (err) {
      addLog(`Error reading settings: ${err.message}`, 'error');
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setSyncLogs((prev) => [...prev, { timestamp, message, type }]);
  };

  const handleSaveSettings = async () => {
    setSaveStatus(null);
    try {
      const res = await window.api.saveShopifySettings(domain, token, clientId, clientSecret, tokenExpiresAt);
      if (res.success) {
        setSaveStatus({ type: 'success', message: 'Credentials saved successfully to local database.' });
        addLog('Shopify credentials saved locally.');
      } else {
        setSaveStatus({ type: 'error', message: res.error });
        addLog(`Failed to save settings: ${res.error}`, 'error');
      }
    } catch (err) {
      setSaveStatus({ type: 'error', message: err.message });
      addLog(`Error saving settings: ${err.message}`, 'error');
    }
  };

  const handleTestConnection = async () => {
    addLog('Testing connection to Shopify API...');
    setSaveStatus(null);
    try {
      const res = await window.api.testShopifyConnection(domain, token, clientId, clientSecret);
      if (res.success) {
        setSaveStatus({ type: 'success', message: `Connection successful! Verified with Shopify API. Shop name: ${res.shopName}` });
        addLog(`Shopify connection verified successfully for "${res.shopName}".`);
        if (res.token && res.token !== token) {
          setToken(res.token);
          addLog(`Generated/updated access token dynamically: ${res.token}`);
        }
      } else {
        setSaveStatus({ type: 'error', message: `Connection failed: ${res.error}` });
        addLog(`Shopify connection failed: ${res.error}`, 'error');
      }
    } catch (err) {
      setSaveStatus({ type: 'error', message: err.message });
      addLog(`Error testing connection: ${err.message}`, 'error');
    }
  };

  const handleGenerateToken = async () => {
    if (!domain || !clientId || !clientSecret) {
      setSaveStatus({ type: 'error', message: 'Please enter Domain, Client ID, and Client Secret to generate a token.' });
      addLog('Missing fields for token generation.', 'error');
      return;
    }
    setGenerateLoading(true);
    setSaveStatus(null);
    addLog('Generating Shopify Admin access token via Client Credentials OAuth...');
    try {
      const res = await window.api.generateShopifyToken(domain, clientId, clientSecret);
      if (res.success) {
        setToken(res.accessToken);
        const expiry = Date.now() + res.expiresIn * 1000;
        setTokenExpiresAt(expiry.toString());
        setSaveStatus({ type: 'success', message: 'Shopify token generated successfully! Remember to save settings.' });
        addLog(`Token generated successfully: ${res.accessToken} (expires in ${res.expiresIn}s)`);
      } else {
        setSaveStatus({ type: 'error', message: `Token generation failed: ${res.error}` });
        addLog(`Token generation failed: ${res.error}`, 'error');
      }
    } catch (err) {
      setSaveStatus({ type: 'error', message: err.message });
      addLog(`Token generation error: ${err.message}`, 'error');
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleExecuteExplorer = async () => {
    setApiLoading(true);
    setApiResponse(null);
    addLog(`Executing custom ${apiType} query...`);
    try {
      let res;
      if (apiType === 'REST') {
        res = await window.api.runShopifyREST(restEndpoint);
      } else {
        res = await window.api.runShopifyGraphQL(graphqlQuery);
      }
      setApiResponse(res);
      if (res.success) {
        addLog(`${apiType} query executed successfully.`);
      } else {
        addLog(`${apiType} query failed: ${res.error}`, 'error');
      }
    } catch (err) {
      setApiResponse({ success: false, error: err.message });
      addLog(`Execution error: ${err.message}`, 'error');
    } finally {
      setApiLoading(false);
    }
  };

  const handleTriggerSync = async (scope = 'all') => {
    setSyncLoading(true);
    addLog(`Starting pull sync for: [${scope}]...`);
    try {
      const res = await window.api.syncShopifyNow(scope);
      if (res.success) {
        addLog(`Sync complete! Orders Synced: ${res.pulledOrders}, Inventory Updates: ${res.updatedInventory}`, 'success');
        setLastSyncTime(new Date().toLocaleString());
      } else {
        addLog(`Sync failed: ${res.error}`, 'error');
      }
    } catch (err) {
      addLog(`Sync process crash: ${err.message}`, 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleResetSync = async () => {
    addLog('Resetting Shopify local sync timestamps...');
    try {
      const res = await window.api.resetShopifySyncState();
      if (res.success) {
        addLog('Sync states cleared. Next sync will perform a full-history import.', 'success');
        setLastSyncTime('Never');
      } else {
        addLog(`Failed to reset states: ${res.error}`, 'error');
      }
    } catch (err) {
      addLog(`Reset error: ${err.message}`, 'error');
    }
  };

  return (
    <Page title="Developer & API Testing Console" subtitle="Configure settings, execute test calls, and audit Shopify database syncing" fullWidth>
      <Layout>
        {/* Credentials Manager */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 8, xl: 8 }}>
              <LegacyCard title="Shopify Access Credentials" sectioned>
                <BlockStack gap="400">
                  <Text variant="bodyMd" tone="subdued">
                    Add store domain and your Admin Access Token to verify connectivity.
                  </Text>

                  {saveStatus && (
                    <Banner title={saveStatus.message} tone={saveStatus.type === 'success' ? 'success' : 'critical'} />
                  )}

                  <TextField
                    label="Store myshopify Domain"
                    value={domain}
                    onChange={(val) => setDomain(val)}
                    placeholder="example.myshopify.com"
                    autoComplete="off"
                  />

                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6 }}>
                      <TextField
                        label="Client ID (for OAuth / Auto-refresh)"
                        value={clientId}
                        onChange={(val) => setClientId(val)}
                        placeholder="Client ID (e.g. eb4047...)"
                        autoComplete="off"
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6 }}>
                      <TextField
                        label="Client Secret (for OAuth / Auto-refresh)"
                        value={clientSecret}
                        onChange={(val) => setClientSecret(val)}
                        type="password"
                        placeholder="shpss_..."
                        autoComplete="off"
                      />
                    </Grid.Cell>
                  </Grid>

                  {clientId && clientSecret && (
                    <InlineStack align="start">
                      <Button onClick={handleGenerateToken} loading={generateLoading} icon={<RefreshCw size={15} />}>
                        Generate Access Token via OAuth
                      </Button>
                    </InlineStack>
                  )}

                  <TextField
                    label="Admin Access Token (shpat_...)"
                    value={token}
                    onChange={(val) => setToken(val)}
                    type="password"
                    placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
                    autoComplete="off"
                    helpText={
                      tokenExpiresAt ? (
                        <Text variant="bodySm" tone="subdued">
                          Auto-refresh enabled. Expiry: {new Date(parseInt(tokenExpiresAt, 10)).toLocaleString()}
                        </Text>
                      ) : (
                        "Leave blank if using Client ID/Secret (it will auto-generate) or enter a permanent token manually."
                      )
                    }
                  />

                  <InlineStack align="space-between" blockAlign="center">
                    <Button onClick={handleSaveSettings} variant="primary">
                      Save Settings
                    </Button>
                    <Button onClick={handleTestConnection} icon={<Settings size={15} />}>
                      Test Connection
                    </Button>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>

            {/* Sync Controls & Info */}
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              <LegacyCard title="Sync Controls" sectioned>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" fontWeight="medium">Last Successful Sync</Text>
                    <Text variant="bodyMd" fontWeight="bold">{lastSyncTime}</Text>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Button
                      onClick={() => handleTriggerSync('all')}
                      loading={syncLoading}
                      variant="primary"
                      fullWidth
                      icon={<RefreshCw size={15} />}
                    >
                      Sync All Data
                    </Button>
                    <Button
                      onClick={() => handleTriggerSync('inventory')}
                      loading={syncLoading}
                      fullWidth
                    >
                      Sync Inventory Only
                    </Button>
                    <Button
                      onClick={handleResetSync}
                      tone="critical"
                      variant="plain"
                      fullWidth
                    >
                      Clear Sync History
                    </Button>
                  </BlockStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Live Execution Console logs */}
        <Layout.Section>
          <LegacyCard title="Sync Log Auditor & Console" sectioned>
            <BlockStack gap="300">
              <Box
                padding="300"
                background="bg-surface-secondary"
                borderRadius="200"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid #e1e3e5',
                  backgroundColor: '#1c1e21',
                  color: '#a9b7c6'
                }}
              >
                {syncLogs.length === 0 ? (
                  <div style={{ color: '#808080' }}>Waiting for action triggers...</div>
                ) : (
                  syncLogs.map((log, index) => (
                    <div key={index} style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#6a8759', marginRight: '8px' }}>[{log.timestamp}]</span>
                      <span style={{
                        color: log.type === 'error' ? '#ff6b68' : log.type === 'success' ? '#29b87a' : '#a9b7c6'
                      }}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </Box>
              <InlineStack align="end">
                <Button onClick={() => setSyncLogs([])} variant="plain" tone="critical">
                  Clear Console Logs
                </Button>
              </InlineStack>
            </BlockStack>
          </LegacyCard>
        </Layout.Section>

        {/* API Explorer Panel */}
        <Layout.Section>
          <LegacyCard title="Shopify API Explorer (REST & GraphQL Sandbox)" sectioned>
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
                <BlockStack gap="400">
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                      pressed={apiType === 'REST'}
                      onClick={() => setApiType('REST')}
                    >
                      REST API
                    </Button>
                    <Button
                      pressed={apiType === 'GraphQL'}
                      onClick={() => setApiType('GraphQL')}
                    >
                      GraphQL API
                    </Button>
                  </div>

                  {apiType === 'REST' ? (
                    <TextField
                      label="REST Resource Endpoint"
                      value={restEndpoint}
                      onChange={(val) => setRestEndpoint(val)}
                      placeholder="/orders.json?limit=5"
                      helpText="Specify REST resource paths relative to shop domain."
                    />
                  ) : (
                    <TextField
                      label="GraphQL Body Query / Mutation"
                      value={graphqlQuery}
                      onChange={(val) => setGraphqlQuery(val)}
                      multiline={8}
                    />
                  )}

                  <Button
                    onClick={handleExecuteExplorer}
                    loading={apiLoading}
                    variant="primary"
                    icon={<Play size={15} />}
                  >
                    Execute Call
                  </Button>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 6, xl: 6 }}>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Response Output Payload</Text>
                  <Box
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      border: '1px solid #e1e3e5',
                      backgroundColor: '#2b2b2b',
                      color: '#a9b7c6'
                    }}
                  >
                    {apiResponse ? (
                      <pre>{JSON.stringify(apiResponse, null, 2)}</pre>
                    ) : (
                      <span style={{ color: '#808080' }}>Click "Execute Call" to view the response payload JSON.</span>
                    )}
                  </Box>
                </BlockStack>
              </Grid.Cell>
            </Grid>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default DeveloperConsole;
