import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const DataContext = createContext(null);

export function DataProvider({ children, user }) {
  const [orders, setOrders] = useState(null);
  const [products, setProducts] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [partners, setPartners] = useState(null);
  const [loading, setLoading] = useState({});

  const fetched = useRef({});

  const fetchOrders = useCallback(async (force) => {
    if (orders && !force) return { success: true, orders };
    setLoading(prev => ({ ...prev, orders: true }));
    const res = await window.api.getOrders();
    if (res.success) {
      setOrders(res.orders);
      fetched.current.orders = true;
    }
    setLoading(prev => ({ ...prev, orders: false }));
    return res;
  }, [orders]);

  const fetchProducts = useCallback(async (force) => {
    if (products && !force) return { success: true, products };
    setLoading(prev => ({ ...prev, products: true }));
    const res = await window.api.getProducts();
    if (res.success) {
      setProducts(res.products);
      fetched.current.products = true;
    }
    setLoading(prev => ({ ...prev, products: false }));
    return res;
  }, [products]);

  const fetchCustomers = useCallback(async (role, referralCode, force) => {
    if (customers && !force) return { success: true, customers };
    setLoading(prev => ({ ...prev, customers: true }));
    const res = await window.api.getCustomersWithStats(role, referralCode);
    if (res.success) {
      setCustomers(res.customers);
      fetched.current.customers = true;
    }
    setLoading(prev => ({ ...prev, customers: false }));
    return res;
  }, [customers]);

  const fetchPartners = useCallback(async (referralCode, role, force) => {
    if (partners && !force) return { success: true, partners };
    setLoading(prev => ({ ...prev, partners: true }));
    const res = await window.api.supabaseGetPartners({ referralCode, role });
    if (res.success) {
      setPartners(res.partners);
      fetched.current.partners = true;
    }
    setLoading(prev => ({ ...prev, partners: false }));
    return res;
  }, [partners]);

  useEffect(() => {
    const handleSync = async () => {
      setOrders(null);
      setProducts(null);
      setCustomers(null);
      setPartners(null);
      const prev = fetched.current;
      fetched.current = {};
      if (prev.orders) fetchOrders(true);
      if (prev.products) fetchProducts(true);
      if (prev.customers && user) fetchCustomers(user?.role, user?.referral_code, true);
      if (prev.partners && user) fetchPartners(user?.referral_code, user?.role, true);
    };
    window.addEventListener('shopify-sync-completed', handleSync);
    return () => window.removeEventListener('shopify-sync-completed', handleSync);
  }, [user]);

  return (
    <DataContext.Provider value={{
      orders, products, customers, partners, loading,
      fetchOrders, fetchProducts, fetchCustomers, fetchPartners
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
