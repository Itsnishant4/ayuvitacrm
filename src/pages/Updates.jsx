import React, { useState, useEffect } from "react"
import {
  Page,
  Layout,
  LegacyCard,
  Text,
  Button,
  Spinner,
  Banner,
  ProgressBar,
  BlockStack,
  InlineStack,
  Badge
} from '@shopify/polaris'
import { toast } from "react-hot-toast"

const Updates = () => {
  const [currentVersion, setCurrentVersion] = useState("")
  const [status, setStatus] = useState(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")

  useEffect(() => {
    window.api.getAppVersion().then(setCurrentVersion)

    const unsub = window.api.onElectronUpdateStatus((data) => {
      switch (data.type) {
        case 'update-available':
          setStatus('available')
          setError("")
          break
        case 'update-not-available':
          setStatus('uptodate')
          setError("")
          break
        case 'download-progress':
          setStatus('downloading')
          setProgress(Math.round(data.progress))
          break
        case 'update-downloaded':
          setStatus('downloaded')
          setProgress(100)
          break
        case 'error':
          setStatus('error')
          setError(data.error)
          break
      }
    })

    return unsub
  }, [])

  const handleCheck = async () => {
    setStatus('checking')
    setError("")
    const result = await window.api.checkElectronUpdate()
    if (!result.success) {
      setStatus('error')
      setError(result.error)
    }
  }

  const handleDownload = () => {
    window.api.downloadElectronUpdate()
    toast.success("Downloading update...")
  }

  const handleInstall = () => {
    window.api.installElectronUpdate()
  }

  return (
    <Page title="Software Updates" subtitle="Check for and install new app versions" compactTitle>
      <Layout>
        <Layout.Section>
          <LegacyCard sectioned>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Text variant="headingMd" as="h2">Current Version</Text>
                <Badge>{currentVersion ? `v${currentVersion}` : '...'}</Badge>
              </InlineStack>

              <div>
                {status === null && (
                  <Button onClick={handleCheck}>Check for Updates</Button>
                )}

                {status === 'checking' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Spinner size="small" />
                    <Text variant="bodyMd" tone="subdued">Checking for updates...</Text>
                  </div>
                )}

                {status === 'available' && (
                  <Banner tone="warning">
                    <Text>An update is available. Download now?</Text>
                    <div style={{ marginTop: 12 }}>
                      <Button onClick={handleDownload} primary>Download Update</Button>
                    </div>
                  </Banner>
                )}

                {status === 'downloading' && (
                  <BlockStack gap="200">
                    <Text variant="bodyMd" tone="subdued">Downloading update...</Text>
                    <ProgressBar progress={progress} />
                    <Text variant="bodySm" tone="subdued">{progress}%</Text>
                  </BlockStack>
                )}

                {status === 'downloaded' && (
                  <Banner tone="success">
                    <Text>Update downloaded successfully. Install now?</Text>
                    <div style={{ marginTop: 12 }}>
                      <Button onClick={handleInstall} primary>Install & Restart</Button>
                    </div>
                  </Banner>
                )}

                {status === 'uptodate' && (
                  <Banner tone="success">
                    <Text>You are running the latest version.</Text>
                    <div style={{ marginTop: 12 }}>
                      <Button onClick={handleCheck}>Check Again</Button>
                    </div>
                  </Banner>
                )}

                {status === 'error' && (
                  <Banner tone="critical">
                    <Text>Update failed: {error}</Text>
                    <div style={{ marginTop: 12 }}>
                      <Button onClick={handleCheck}>Try Again</Button>
                    </div>
                  </Banner>
                )}
              </div>
            </BlockStack>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  )
}

export default Updates