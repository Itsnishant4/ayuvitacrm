import React from "react"
import { 
  Plus, 
  Users, 
  Package, 
  FileText, 
  TrendingUp, 
  Database, 
  ShieldCheck, 
  Zap, 
  MessageSquare, 
  Search,
  Boxes,
  UsersRound,
  FilePlus,
  History,
  CheckCircle2,
  AlertCircle,
  MousePointer2,
  Clock
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function ShortcutHelp() {
  const shortcuts = [
    { key: "Ctrl + I", use: "New Invoice", icon: <FilePlus className="w-4 h-4" /> },
    { key: "Ctrl + C", use: "Customers", icon: <Users className="w-4 h-4" /> },
    { key: "Ctrl + P", use: "Products", icon: <Package className="w-4 h-4" /> },
    { key: "Ctrl + S", use: "Stock Mgmt", icon: <Boxes className="w-4 h-4" /> },
    { key: "Ctrl + O", use: "Order History", icon: <FileText className="w-4 h-4" /> },
    { key: "Ctrl + R", use: "Referrals", icon: <UsersRound className="w-4 h-4" /> },
    { key: "Ctrl + D", use: "Dashboard", icon: <TrendingUp className="w-4 h-4" /> },
    { key: "Ctrl + B", use: "Backup", icon: <Database className="w-4 h-4" /> },
    { key: "⌘ + K", use: "Search", icon: <Search className="w-4 h-4" /> },
  ]

  return (
    <Tabs defaultValue="shortcuts" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4 h-10">
        <TabsTrigger value="shortcuts" className="gap-2 text-sm">
          <Zap className="w-4 h-4" /> Shortcuts
        </TabsTrigger>
        <TabsTrigger value="docs" className="gap-2 text-sm">
          <FileText className="w-4 h-4" />  Guide
        </TabsTrigger>
      </TabsList>

      <TabsContent value="shortcuts">
        <div className="grid gap-3">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-background rounded-md border shadow-sm">
                  {s.icon}
                </div>
                <span className="text-sm font-medium">{s.use}</span>
              </div>
              <kbd className="pointer-events-none inline-flex h-7 select-none items-center gap-1 rounded border bg-background px-2.5 font-mono text-[11px] font-bold text-foreground shadow-sm">
                {s.key}
              </kbd>
            </div>
          ))}
          <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">💡 Pro Tip</p>
            <p className="text-xs text-muted-foreground italic">Shortcuts work from any page. Use them to jump between billing and stock management in milliseconds.</p>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="docs">
        <div className=" pr-2 overflow-y-auto space-y-10 py-2 scrollbar-thin scrollbar-thumb-muted-foreground/20">
          
          {/* Intro */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight">Welcome to ayuvitaCRM 🚀</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">This guide will help you master every aspect of your business management system. Follow the phases below to optimize your workflow.</p>
          </div>

          {/* Phase 1 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-primary/20">
              <span className="text-2xl">🏗️</span>
              <h3 className="font-extrabold text-lg text-primary ">Phase 1: Business Foundation</h3>
            </div>
            
            <div className="grid gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Package className="w-4 h-4 text-purple-500" /> Smart Inventory Control
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground list-none pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Product Setup:</b> Add items with HSN/SAC codes, MRP, and GST rates (5%, 12%, 18%, 28%).</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Stock Audits:</b> Use the 'Stock Management' page to view full history logs of every stock adjustment with reasons (e.g., 'New Purchase', 'Damage Return').</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Users className="w-4 h-4 text-blue-500" /> Advanced Customer Ledger
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground list-none pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>360° Profile:</b> Every customer has a dedicated 'Statement' showing all past invoices, total billed amount, and total received.</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Quick Billing:</b> From the Customer List, use the 'Quick Invoice' button to auto-fill the order form with that customer's details instantly.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Phase 2 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500/20">
              <span className="text-2xl">💰</span>
              <h3 className="font-extrabold text-lg text-emerald-600 ">Phase 2: High-Speed Operations</h3>
            </div>
            
            <div className="grid gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Zap className="w-4 h-4 text-amber-500" /> Precision Billing Engine
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground list-none pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Smart Dropdowns:</b> Search for customers and products by name or phone number directly inside the billing form—no more manual typing!</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Auto-Calculations:</b> The system handles multi-item GST calculations, item-wise discounts, and final rounding automatically.</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <MessageSquare className="w-4 h-4 text-green-500" /> CRM Communications
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground list-none pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>WhatsApp Sharing:</b> Instantly share PDF invoices. The system pre-fills a professional message with the invoice number and amount.</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Print & Export:</b> Generate clean A4/Thermal style PDF invoices with one click.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Phase 3 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-violet-500/20">
              <span className="text-2xl">📊</span>
              <h3 className="font-extrabold text-lg text-violet-600 ">Phase 3: Business Intelligence</h3>
            </div>
            
            <div className="grid gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> Interactive Analytics
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground list-none pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Sales Trends:</b> View your revenue growth day-by-day. Use the Date Filter to see 'Last 7 Days', 'Last 30 Days', or any custom range.</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Default View:</b> Set your preferred date range (e.g., 'Last 7 Days') as default so it's ready every time you log in.</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Search className="w-4 h-4 text-orange-500" /> Universal Command Center
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground list-none pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Global Search (⌘+K):</b> The fastest way to move. Type a name to find a customer, an ID for an order, or a page name to jump there.</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Quick Action Panel:</b> Use the Dashboard shortcuts to jump into 'New Invoice' or 'Backup' instantly.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Phase 4 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-slate-500/20">
              <span className="text-2xl">🛡️</span>
              <h3 className="font-extrabold text-lg text-slate-600 ">Phase 4: Security & Continuity</h3>
            </div>
            
            <div className="grid gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Database className="w-4 h-4 text-amber-600" /> Database Management
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground list-none pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Data Ownership:</b> Your data is stored locally in a high-performance SQLite database. No cloud, no monthly fees, 100% privacy.</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Backups:</b> Use the 'System Settings' to export a .db file. Keep this safe to move your CRM to a different computer anytime.</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4 text-green-600" /> System Integrity
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground list-none pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                    <span><b>Authentication:</b> Secure session management keeps your business data safe from unauthorized local access.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Help Center */}
          <div className="p-4 rounded-xl bg-muted/50 border-2 border-dashed border-muted flex flex-col items-center text-center space-y-2">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm font-bold">Need more help?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">If you encounter any issues or need custom feature integrations, please contact your system administrator.</p>
          </div>

          
        </div>
      </TabsContent>
    </Tabs>
  )
}
