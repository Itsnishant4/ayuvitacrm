import React, { useState, useEffect } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { 
  Users, 
  Package, 
  FileText, 
  Plus, 
  LayoutDashboard, 
  Settings, 
  Boxes,
  UserPlus
} from "lucide-react"

export function CommandMenu({ onNavigate }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({
    customers: [],
    products: [],
    orders: []
  })

  useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  useEffect(() => {
    if (open) {
      fetchData()
    }
  }, [open])

  const fetchData = async () => {
    const [custRes, prodRes, orderRes] = await Promise.all([
      window.api.getCustomers(),
      window.api.getProducts(),
      window.api.getOrders()
    ])

    setData({
      customers: custRes.success ? custRes.customers : [],
      products: prodRes.success ? prodRes.products : [],
      orders: orderRes.success ? orderRes.orders : []
    })
  }

  const runCommand = (command) => {
    setOpen(false)
    command()
  }

  return (
    <CommandDialog  open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search everything (customers, orders, products)..." />
      <CommandList className="max-h-[450px]">
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => runCommand(() => onNavigate('add-order'))}>
            <Plus className="mr-2 h-4 w-4" />
            <span>Create New Invoice</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onNavigate('manage-customers'))}>
            <UserPlus className="mr-2 h-4 w-4" />
            <span>Add New Customer</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => runCommand(() => onNavigate('dashboard'))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onNavigate('manage-orders'))}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Manage Orders</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onNavigate('all-products'))}>
            <Package className="mr-2 h-4 w-4" />
            <span>Products</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onNavigate('stock-management'))}>
            <Boxes className="mr-2 h-4 w-4" />
            <span>Stock Management</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {data.customers.length > 0 && (
          <CommandGroup heading="Customers">
            {data.customers.slice(0, 5).map((customer) => (
              <CommandItem 
                key={customer.id} 
                onSelect={() => runCommand(() => {
                  localStorage.setItem('prefill_customer', JSON.stringify(customer));
                  onNavigate('add-order');
                })}
              >
                <Users className="mr-2 h-4 w-4 text-blue-500" />
                <span>{customer.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{customer.phone}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {data.products.length > 0 && (
          <CommandGroup heading="Products">
            {data.products.slice(0, 5).map((product) => (
              <CommandItem 
                key={product.id} 
                onSelect={() => runCommand(() => onNavigate('all-products'))}
              >
                <Package className="mr-2 h-4 w-4 text-emerald-500" />
                <span>{product.item_name}</span>
                <span className="ml-2 text-xs text-muted-foreground">Stock: {product.stock}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {data.orders.length > 0 && (
          <CommandGroup heading="Recent Orders">
            {data.orders.slice(0, 5).map((order) => (
              <CommandItem 
                key={order.id} 
                onSelect={() => runCommand(() => {
                  localStorage.setItem('edit_order_id', order.id);
                  onNavigate('add-order');
                })}
              >
                <FileText className="mr-2 h-4 w-4 text-amber-500" />
                <span>Invoice {order.invoice_number?.startsWith('#') ? order.invoice_number : `#${order.invoice_number}`}</span>
                <span className="ml-2 text-xs text-muted-foreground">{order.bill_to_name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
