import React, { useState } from 'react';
import { 
  Page, 
  Layout, 
  LegacyCard, 
  Text, 
  Badge, 
  Button, 
  InlineStack, 
  BlockStack, 
  Box, 
  Grid,
  Banner
} from '@shopify/polaris';
import { Database, Download, Upload, ShieldAlert, Award } from "lucide-react";
import toast from 'react-hot-toast';

const DatabaseSettings = () => {
  const [loading, setLoading] = useState(false);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const result = await window.api.backupDatabase();
      if (result.success) {
        toast.success("Database backup created successfully!");
      } else if (result.error !== 'Cancelled') {
        toast.error(`Backup failed: ${result.error}`);
      }
    } catch (e) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm("WARNING: Restoring a database will OVERWRITE all your current data. The app will restart automatically. Are you sure you want to proceed?")) {
      return;
    }

    setLoading(true);
    try {
      const result = await window.api.restoreDatabase();
      if (result.success) {
        toast.success("Database restored! Restarting...");
      } else if (result.error !== 'Cancelled') {
        toast.error(`Restore failed: ${result.error}`);
      }
    } catch (e) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page
      title="System & Database"
      subtitle="Configure backups, restore data, and set system parameters"
      compactTitle
    >
      <Layout>
        {/* Core Actions */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
              <LegacyCard title="Database Backup" sectioned>
                <BlockStack gap="400">
                  <Text variant="bodyMd" tone="subdued">
                    Export all products, orders, referral partners, and audit logs into a single backup database file (.db).
                  </Text>
                  <Banner tone="info" title="Weekly Backups Recommended">
                    <p>Keep your business records safe by downloading a copy weekly to external drives.</p>
                  </Banner>
                  <Button 
                    onClick={handleBackup} 
                    disabled={loading}
                    icon={<Download size={16} />}
                    fullWidth
                    variant="primary"
                  >
                    Create Backup File
                  </Button>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>

            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
              <LegacyCard title="Restore Data" sectioned>
                <BlockStack gap="400">
                  <Text variant="bodyMd" tone="subdued">
                    Restore the system state from a previous backup file. Current data will be replaced.
                  </Text>
                  <Banner tone="critical" title="Danger Zone">
                    <p>Restoring will permanently overwrite all active database tables and restart the app.</p>
                  </Banner>
                  <Button 
                    onClick={handleRestore} 
                    disabled={loading}
                    icon={<Upload size={16} />}
                    fullWidth
                    tone="critical"
                    variant="primary"
                  >
                    Restore from Backup
                  </Button>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* System Specs */}
        <Layout.Section>
          <LegacyCard title="System Specifications" sectioned>
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued">App Version</Text>
                  <Text variant="bodyMd" fontWeight="bold">0.1 (Gold)</Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued">Database Engine</Text>
                  <Text variant="bodyMd" fontWeight="bold">SQLite 3 (WAL Mode)</Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued">Environment</Text>
                  <InlineStack gap="100" blockAlign="center">
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                    <Text variant="bodyMd" fontWeight="bold">Protected</Text>
                  </InlineStack>
                </BlockStack>
              </Grid.Cell>
            </Grid>
          </LegacyCard>
        </Layout.Section>

        {/* Custom Icon */}
        <Layout.Section>
          <LegacyCard title="Custom Application Icon" sectioned>
            <BlockStack gap="400">
              <Text variant="bodyMd" tone="subdued">
                Upload a custom branding PNG file. It will automatically crop to a rounded squircle (512x512px).
              </Text>
              
              <div style={{ padding: '16px', border: '1px dashed #c9cccf', borderRadius: '8px', textAlign: 'center', background: '#fafbfb' }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const img = new Image();
                    const reader = new FileReader();
                    
                    reader.onload = (event) => {
                      img.onload = async () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 512;
                        canvas.height = 512;
                        const ctx = canvas.getContext('2d');
                        
                        const scale = Math.min(512 / img.width, 512 / img.height);
                        const w = img.width * scale;
                        const h = img.height * scale;
                        const x = (512 - w) / 2;
                        const y = (512 - h) / 2;
                        
                        const borderRadius = 80;
                        ctx.beginPath();
                        ctx.roundRect(0, 0, 512, 512, borderRadius);
                        ctx.clip();
                        
                        ctx.drawImage(img, x, y, w, h);
                        
                        const roundedDataUrl = canvas.toDataURL('image/png');
                        const result = await window.api.setAppIcon({ dataUrl: roundedDataUrl });
                        
                        if (result.success) {
                          toast.success('Rounded app icon set! Restart app to see changes.');
                        } else {
                          toast.error(`Failed to set icon: ${result.error}`);
                        }
                      };
                      img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </div>

              <InlineStack gap="300">
                <Button 
                  onClick={async () => {
                    const res = await window.api.getAppIcon();
                    if (res.success) {
                      const w = window.open('');
                      w.document.write('<img src="' + res.dataUrl + '" style="max-width:100%;"/>');
                    } else {
                      toast.error('No custom icon set');
                    }
                  }}
                >
                  Preview Current Icon
                </Button>
              </InlineStack>
            </BlockStack>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default DatabaseSettings;
