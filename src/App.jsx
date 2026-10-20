import React, { useState } from 'react';
import '@shopify/polaris/build/esm/styles.css';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import AddPartner from './pages/AddPartner';
import AllPartners from './pages/AllPartners';
import AllProducts from './pages/AllProducts';
import AddOrder from './pages/AddOrder';
import ManageOrders from './pages/ManageOrders';
import InvoiceDesigner from './pages/InvoiceDesigner';
import StockManagement from './pages/StockManagement';
import ManageCustomers from './pages/ManageCustomers';
import DatabaseSettings from './pages/DatabaseSettings';
import Updates from './pages/Updates';
import ApiPlayground from './pages/ApiPlayground';
import DeveloperConsole from './pages/DeveloperConsole';
import CommissionDashboard from './pages/CommissionDashboard';
// import { ModeToggle } from './components/mode-toggle';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandMenu } from './components/CommandMenu';
import { DataProvider } from './contexts/DataContext';
import { Search, RefreshCw, Sparkles } from 'lucide-react';
import toast, { Toaster } from "react-hot-toast"

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [editingOrder, setEditingOrder] = useState(null); // 'dashboard', 'add-partner', 'all-partners'
  const [isSyncing, setIsSyncing] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  
  const handleSyncAll = async (silent = false) => {
    // When auto-triggered (post-login), skip entirely if Shopify is not configured on this machine
    if (silent === true) {
      try {
        const settings = await window.api.getShopifySettings();
        if (!settings?.success || !settings?.domain || !settings?.token) return;
      } catch (err) {
        return;
      }
    }
    setIsSyncing(true);
    toast.loading('Syncing all data from Shopify...', { id: 'sync-all' });
    try {
      const result = await window.api.syncShopifyNow('all');
      if (result.success) {
        toast.success(`Sync completed! Pulled ${result.pulledOrders} orders, ${result.syncedCustomers} customers, and updated ${result.updatedInventory} products.`, { id: 'sync-all' });
      } else {
        toast.error(`Sync failed: ${result.error}`, { id: 'sync-all' });
      }
    } catch (err) {
      toast.error(`Sync error: ${err.message}`, { id: 'sync-all' });
    } finally {
      setIsSyncing(false);
    }
  };
  
  React.useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        const result = await window.api.verifyToken(token);
        if (result.success) {
          setUser(result.user);
        } else {
          localStorage.removeItem('auth_token');
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  React.useEffect(() => {
    // Listen for update status events sent by main process
    const unsub = window.api.onElectronUpdateStatus((data) => {
      if (data.type === 'update-available') {
        setUpdateAvailable(true);
        setUpdateVersion(data.info?.version || '');
      } else if (data.type === 'update-not-available') {
        setUpdateAvailable(false);
      }
    });

    // Perform a check immediately on startup
    const checkUpdatesOnStartup = async () => {
      try {
        const result = await window.api.checkElectronUpdate();
        if (result.success && result.updateAvailable) {
          setUpdateAvailable(true);
          setUpdateVersion(result.info?.updateInfo?.version || '');
        }
      } catch (err) {
        console.error('Failed to check for updates on startup:', err);
      }
    };

    checkUpdatesOnStartup();

    return unsub;
  }, []);

  // Global Keyboard Shortcuts (Mac & Windows Compatible)
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      // Use Control key as requested to avoid Mac Option character transformation
      if (e.ctrlKey) {
        const code = e.code;

        // Debug log to help identify keys
        console.log('CRM Shortcut Triggered: Ctrl +', code);

        switch (code) {
          case 'KeyI': // Ctrl + I
            e.preventDefault();
            setCurrentView('add-order');
            break;
          case 'KeyC': // Ctrl + C
            e.preventDefault();
            setCurrentView('manage-customers');
            break;
          case 'KeyP': // Ctrl + P
            e.preventDefault();
            setCurrentView('all-products');
            break;
          case 'KeyS': // Ctrl + S
            e.preventDefault();
            setCurrentView('stock-management');
            break;
          case 'KeyR': // Ctrl + R
            e.preventDefault();
            setCurrentView('all-partners');
            break;
          case 'KeyD': // Ctrl + D
            e.preventDefault();
            setCurrentView('dashboard');
            break;
          case 'KeyB': // Ctrl + B
            e.preventDefault();
            setCurrentView('database-settings');
            break;
          case 'KeyO': // Ctrl + O
            e.preventDefault();
            setCurrentView('manage-orders');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAuthSuccess = (result) => {
    if (result.success) {
      setUser(result.user);
      if (result.token) {
        localStorage.setItem('auth_token', result.token);
      }
      // Auto-sync all data from Shopify right after a successful login
      handleSyncAll(true);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
  };

  const renderHeaderTitle = () => {
    switch (currentView) {
      case 'all-partners': return 'All Referrals';
      case 'add-partner': return 'Add New Referral';
      case 'add-product': return 'Add New Product';
      case 'all-products': return 'Manage Products';
      case 'add-order': return editingOrder ? 'Edit Order' : 'Add New Order';
      case 'manage-orders': return 'Manage Orders';
      case 'invoice-designer': return 'Invoice Designer';
      case 'updates': return 'Software Updates';
      case 'developer-console': return 'Developer Console';
      case 'commission-dashboard': return 'Commission Dashboard';
      default: return 'Dashboard';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <AppProvider i18n={enTranslations}>
      <TooltipProvider delayDuration={1000}>
        <Toaster position="top-center" reverseOrder={false} />
        {/* <ModeToggle /> */}
        {!user ? (
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      ) : (
        <DataProvider user={user}>
        <SidebarProvider>
          <AppSidebar
            user={user}
            onLogout={handleLogout}
            onNavigate={(view) => setCurrentView(view)}
          />
          <SidebarInset>
            {updateAvailable && (
              <div className="bg-amber-500/10 dark:bg-amber-500/20 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-sm transition-all duration-300">
                <div className="flex items-center gap-3 text-amber-800 dark:text-amber-300 font-medium">
                  <span>A new version {updateVersion ? `v${updateVersion}` : ''} of ayuvitaCRM is available.</span>
                </div>
                <button
                  onClick={() => setCurrentView('updates')}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                >
                  Update Now
                </button>
              </div>
            )}
            <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="ml-1 hover:bg-foreground/20 p-2" />
                <div className="flex items-center gap-2 px-4 border-l ml-2">
                  <span className="text-sm font-medium text-muted-foreground ">
                    {renderHeaderTitle()}
                  </span>
                </div>
              </div>

               <div className="flex items-center gap-4">
                 <button
                   onClick={handleSyncAll}
                   disabled={isSyncing}
                   className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                 >
                   <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                   <span>Sync all data</span>
                 </button>

                 <button
                   onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                   className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 border rounded-lg hover:bg-muted transition-colors"
                 >
                   <Search className="w-4 h-4" />
                   <span>Search...</span>
                   <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                     <span className="text-xs">⌘</span>K
                   </kbd>
                 </button>
               </div>
            </header>

            <CommandMenu onNavigate={setCurrentView} />

            <div className="flex-1 overflow-y-auto min-w-0 w-full pb-8">
              {currentView === 'dashboard' ? (
                <Dashboard user={user} onNavigate={setCurrentView} />
              ) : currentView === 'add-partner' ? (
                <div className="h-full w-full flex items-center justify-center py-6">
                  <AddPartner onBack={() => setCurrentView('all-partners')} />
                </div>
              ) : currentView === 'all-partners' ? (
                <AllPartners user={user} onNavigate={setCurrentView} />
              ) : currentView === 'commission-dashboard' ? (
                <CommissionDashboard user={user} onNavigate={setCurrentView} />
              ) : currentView === 'manage-customers' ? (
                <ManageCustomers user={user} onNavigate={setCurrentView} />
              ) : currentView === 'all-products' ? (
                <AllProducts onNavigate={setCurrentView} />
              ) : currentView === 'stock-management' ? (
                <StockManagement />
              ) : currentView === 'add-order' ? (
                <AddOrder
                  user={user}
                  onBack={() => {
                    setCurrentView(editingOrder ? 'manage-orders' : 'dashboard');
                    setEditingOrder(null);
                  }}
                  editOrder={editingOrder}
                />
              ) : currentView === 'manage-orders' ? (
                <ManageOrders
                  user={user}
                  onNavigate={setCurrentView}
                  onEdit={(order) => {
                    setEditingOrder(order);
                    setCurrentView('add-order');
                  }}
                />
              ) : currentView === 'invoice-designer' ? (
                <InvoiceDesigner />
              ) : currentView === 'database-settings' ? (
                <DatabaseSettings />
              ) : currentView === 'updates' ? (
                <Updates />
              ) : currentView === 'api-playground' ? (
                <ApiPlayground />
              ) : currentView === 'developer-console' ? (
                <DeveloperConsole />
              ) : null}
            </div>
          </SidebarInset>
        </SidebarProvider>
        </DataProvider>
      )}
      </TooltipProvider>
    </AppProvider>
  );
}

export default App;
