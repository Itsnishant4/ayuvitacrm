import React, { useState } from 'react';
import { 
  Page, 
  Layout, 
  LegacyCard, 
  FormLayout, 
  TextField, 
  Button, 
  InlineStack, 
  BlockStack, 
  Text,
  Badge,
  Box
} from '@shopify/polaris';
import { Check, ArrowLeft, UserPlus } from "lucide-react";
import toast from 'react-hot-toast';

const AddPartner = ({ onBack }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const generateRefCode = (name, phone) => {
    if (!name || !phone) return "";
    
    // Get initials (up to 2)
    const nameParts = name.trim().split(/\s+/);
    let initials = "";
    if (nameParts.length >= 2) {
      initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    } else if (nameParts.length === 1) {
      initials = nameParts[0].substring(0, 2).toUpperCase();
    }

    // Get last 4 digits of phone
    const cleanPhone = phone.replace(/\D/g, '');
    const last4 = cleanPhone.slice(-4);
    
    return initials + last4;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    
    // Attempt 1: Initials + Last 4 digits
    let referral_code = generateRefCode(formData.name, formData.phone);
    
    let result = await window.api.addPartner({
      ...formData,
      referral_code
    });

    // Attempt 2: Fallback to Initials + First 4 digits if not unique
    if (!result.success && result.error.toLowerCase().includes('already exists')) {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      const first4 = cleanPhone.substring(0, 4);
      
      const nameParts = formData.name.trim().split(/\s+/);
      let initials = "";
      if (nameParts.length >= 2) {
        initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      } else if (nameParts.length === 1) {
        initials = nameParts[0].substring(0, 2).toUpperCase();
      }
      referral_code = initials + first4;

      result = await window.api.addPartner({
        ...formData,
        referral_code
      });
    }

    if (result.success) {
      setSuccess(true);
      toast.success('Referral added successfully!');
    } else {
      setError(result.error);
      toast.error(`Error: ${result.error}`);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <Page fullWidth>
        <Layout>
          <Layout.Section>
            <Box padding="1000" background="bg-surface" borderRadius="200" shadow="md">
              <BlockStack gap="500" align="center">
                <Box padding="300" background="bg-fill-success" borderRadius="500">
                  <Check className="w-12 h-12 text-green-600" />
                </Box>
                <BlockStack gap="200" align="center">
                  <Text variant="headingXl" as="h2">Referral Added Successfully!</Text>
                  <Text variant="bodyMd" tone="subdued">
                    The partner reference code was automatically generated and saved.
                  </Text>
                </BlockStack>
                <InlineStack gap="300" align="center">
                  <Button 
                    onClick={() => {
                      setSuccess(false);
                      setFormData({
                        name: '',
                        email: '',
                        phone: '',
                      });
                    }}
                  >
                    Add Another
                  </Button>
                  <Button variant="primary" onClick={onBack}>
                    Done & View Referrals
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      fullWidth
      backAction={{ content: 'Referrals', onAction: onBack }}
      title="Add New Referral"
      subtitle="Register a new promoter or partner. A reference coupon code will be generated."
      compactTitle
    >
      <Layout>
        <Layout.Section>
          <form onSubmit={handleSubmit}>
            <LegacyCard sectioned>
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    label="Full Name"
                    value={formData.name}
                    onChange={(val) => setFormData({ ...formData, name: val })}
                    autoComplete="off"
                    requiredIndicator
                  />
                  <TextField
                    label="Mobile Phone Number"
                    value={formData.phone}
                    onChange={(val) => setFormData({ ...formData, phone: val })}
                    placeholder="e.g. +91 9876543210"
                    autoComplete="off"
                    requiredIndicator
                  />
                </FormLayout.Group>

                <TextField
                  label="Email Address"
                  type="email"
                  value={formData.email}
                  onChange={(val) => setFormData({ ...formData, email: val })}
                  placeholder="partner@example.com"
                  autoComplete="off"
                />

                {error && (
                  <Box padding="300" background="bg-fill-danger-subdued" borderRadius="100">
                    <Text variant="bodyMd" tone="critical">
                      {error}
                    </Text>
                  </Box>
                )}

                <Box paddingBlockStart="400">
                  <InlineStack align="end" gap="300">
                    <Button onClick={onBack}>Cancel</Button>
                    <Button submit variant="primary" loading={loading}>
                      Create Partner Profile
                    </Button>
                  </InlineStack>
                </Box>
              </FormLayout>
            </LegacyCard>
          </form>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default AddPartner;
