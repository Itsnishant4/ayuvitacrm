import React, { useState } from 'react';
import { 
  AppProvider,
  LegacyCard, 
  FormLayout, 
  TextField, 
  Button, 
  Text, 
  BlockStack, 
  Box,
  InlineStack,
  Banner
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import toast from 'react-hot-toast';

const AuthPage = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Franchisee code verification states
  const [referralCode, setReferralCode] = useState('');
  const [referralName, setReferralName] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerifyCode = async () => {
    if (!referralCode.trim()) {
      setReferralName('');
      setCodeVerified(false);
      return;
    }
    setVerifyingCode(true);
    setError('');
    try {
      const result = await window.api.supabaseVerifyReferral(referralCode.trim());
      if (result.success) {
        setReferralName(result.data.name);
        setCodeVerified(true);
        toast.success(`Verified: ${result.data.name}`);
      } else {
        setReferralName('');
        setCodeVerified(false);
        setError(result.error || 'Franchisee referral code not found');
      }
    } catch (err) {
      setError('Connection to Supabase failed');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    // If referral code is filled, it must be verified first
    if (mode === 'signup' && referralCode.trim() && !codeVerified) {
      setError('Please verify your Franchisee Code before registering.');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'login') {
        const result = await window.api.login({ username, password });
        if (result.success) {
          toast.success('Successfully logged in!');
          onAuthSuccess(result);
        } else {
          setError(result.error || 'Invalid credentials');
        }
      } else {
        const role = referralCode.trim() ? 'state_franchisee' : 'admin';
        const result = await window.api.signup({ 
          username, 
          password, 
          referralCode: referralCode.trim() || null, 
          role 
        });
        if (result.success) {
          toast.success('Account created! Please sign in.');
          setMode('login');
          setPassword('');
          setReferralCode('');
          setReferralName('');
          setCodeVerified(false);
        } else {
          setError(result.error || 'Failed to create account');
        }
      }
    } catch (err) {
      setError(err.message || 'System connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppProvider i18n={enTranslations}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh', 
          backgroundColor: '#f1f2f4',
          padding: '16px' 
        }}
      >
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <BlockStack gap="500">
            <Box align="center" paddingBlockEnd="200">
              <BlockStack gap="100" align="center">
                <Text variant="heading2xl" as="h1" fontWeight="bold">
                  ayuvitaCRM Portal
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  {mode === 'login' ? 'Sign in to manage your system' : 'Create a franchisee or admin profile'}
                </Text>
              </BlockStack>
            </Box>

            <LegacyCard sectioned>
              <form onSubmit={handleSubmit}>
                <FormLayout>
                  {error && (
                    <Banner tone="critical" title="Authentication Error">
                      <p>{error}</p>
                    </Banner>
                  )}

                  {mode === 'signup' && (
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="end" gap="200">
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Franchisee Code (Leave blank for Admin)"
                            value={referralCode}
                            onChange={(val) => {
                              setReferralCode(val.toUpperCase());
                              setCodeVerified(false);
                              setReferralName('');
                            }}
                            placeholder="e.g. RV-001"
                            autoComplete="off"
                          />
                        </div>
                        {referralCode.trim() && (
                          <Button 
                            onClick={handleVerifyCode} 
                            loading={verifyingCode}
                            disabled={codeVerified}
                          >
                            {codeVerified ? 'Verified' : 'Verify'}
                          </Button>
                        )}
                      </InlineStack>
                      {codeVerified && referralName && (
                        <Box padding="150" background="bg-fill-success-subdued" borderRadius="100">
                          <Text variant="bodySm" tone="success">
                            ✓ Name: <strong>{referralName}</strong>
                          </Text>
                        </Box>
                      )}
                    </BlockStack>
                  )}

                  <TextField
                    label="Username"
                    value={username}
                    onChange={(val) => setUsername(val)}
                    placeholder="Enter username"
                    autoComplete="username"
                    required
                  />

                  <TextField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(val) => setPassword(val)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                    helpText={mode === 'signup' ? 'Password must be at least 8 characters long.' : undefined}
                  />

                  <Box paddingBlockStart="200">
                    <Button 
                      submit 
                      variant="primary" 
                      fullWidth 
                      loading={loading}
                      disabled={mode === 'signup' && referralCode.trim() !== '' && !codeVerified}
                    >
                      {mode === 'login' ? 'Sign In' : 'Register Operator'}
                    </Button>
                  </Box>
                </FormLayout>
              </form>
            </LegacyCard>

            <Box align="center">
              <InlineStack align="center" gap="100">
                <Text variant="bodyMd" tone="subdued">
                  {mode === 'login' ? "Don't have an account?" : "Already registered?"}
                </Text>
                <Button 
                  variant="plain" 
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setError('');
                    setReferralCode('');
                    setReferralName('');
                    setCodeVerified(false);
                  }}
                >
                  {mode === 'login' ? 'Sign Up' : 'Sign In'}
                </Button>
              </InlineStack>
            </Box>
          </BlockStack>
        </div>
      </div>
    </AppProvider>
  );
};

export default AuthPage;
