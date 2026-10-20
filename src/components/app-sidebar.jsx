"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { CustomDropdown, CustomDropdownItem } from "@/components/ui/custom-dropdown"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Users,
  Package,
  LayoutDashboard,
  ShoppingBag,
  Database,
  HelpCircle,
  Keyboard,
  Terminal,
  RefreshCcw,
  Settings,
  ChevronUp,
  FileText
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import sidebarLogo from "../../icon/icon.png"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { ShortcutHelp } from "./ShortcutHelp"

export function AppSidebar({
  user,
  onLogout,
  onNavigate,
  ...props
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = React.useState(false);
  const userData = {
    name: user?.username || "User",
    email: user?.role 
      ? (user.role === 'admin' ? 'Administrator' : `Franchisee (${user.referral_code || 'N/A'})`)
      : "User Profile",
    avatar: "",
  }
  const navMainItems = [
    {
      title: "Dashboard",
      url: "#",
      view: "dashboard",
      icon: (
        <LayoutDashboard className="size-4" />
      ),
      isActive: true,
    },
    ...(!['state_franchisee', 'city_franchisee'].includes(user?.role) ? [{
      title: "Products",
      url: "#",
      icon: (
        <ShoppingBag className="size-4" />
      ),
      isActive: true,
      items: [
        {
          title: "Manage Products",
          url: "#",
          view: "all-products",
        },
        {
          title: "Stock Management",
          url: "#",
          view: "stock-management",
        },
      ],
    }] : []),
    {
      title: "Customers",
      url: "#",
      icon: (
        <Users className="size-4" />
      ),
      isActive: true,
      items: [
        {
          title: "Manage Customers",
          url: "#",
          view: "manage-customers",
        },
      ],
    },
    {
      title: "Referrals",
      url: "#",
      icon: (
        <Users className="size-4" />
      ),
      isActive: true,
      items: [
        {
          title: "All Referrals",
          url: "#",
          view: "all-partners",
        },
        {
          title: "Commission Dashboard",
          url: "#",
          view: "commission-dashboard",
        },
      ],
    },
    {
      title: "Orders",
      url: "#",
      icon: (
        <Package className="size-4" />
      ),
      isActive: true,
      items: [
        {
          title: "Manage Orders",
          url: "#",
          view: "manage-orders",
        },
      ],
    }
  ];

  const sidebarData = {
    navMain: navMainItems
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild onClick={() => onNavigate?.('dashboard')}>
              <a href="#" className="flex items-center gap-3">
                <img src={sidebarLogo} alt="ayuvitaCRM" className="h-10 w-10 rounded-xl object-contain" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-lg">ayuvitaCRM</span>
                  <span className="truncate text-xs opacity-70">Management System</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarData.navMain} onNavigate={onNavigate} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className="px-2 pb-0">
          <CustomDropdown
            isOpen={settingsOpen}
            setIsOpen={setSettingsOpen}
            widthClass="w-56"
            side="top"
            trigger={
              <SidebarMenuItem style={{ listStyle: 'none' }}>
                <SidebarMenuButton className="text-sidebar-foreground/70 hover:text-sidebar-foreground w-full flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Settings className="size-4" />
                    <span>Settings & Support</span>
                  </span>
                  <ChevronUp className="size-4 ml-auto opacity-70" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            }
          >
            <CustomDropdownItem onClick={() => { onNavigate?.('database-settings'); setSettingsOpen(false); }}>
              <div className="flex items-center gap-2">
                <Database className="size-4" />
                <span>System Settings</span>
              </div>
            </CustomDropdownItem>
            <CustomDropdownItem onClick={() => { onNavigate?.('invoice-designer'); setSettingsOpen(false); }}>
              <div className="flex items-center gap-2">
                <FileText className="size-4" />
                <span>Invoice Editor</span>
              </div>
            </CustomDropdownItem>
            <CustomDropdownItem onClick={() => { onNavigate?.('api-playground'); setSettingsOpen(false); }}>
              <div className="flex items-center gap-2">
                <Keyboard className="size-4" />
                <span>API Playground</span>
              </div>
            </CustomDropdownItem>
            <CustomDropdownItem onClick={() => { onNavigate?.('developer-console'); setSettingsOpen(false); }}>
              <div className="flex items-center gap-2">
                <Terminal className="size-4" />
                <span>Developer Console</span>
              </div>
            </CustomDropdownItem>
            <CustomDropdownItem onClick={() => { onNavigate?.('updates'); setSettingsOpen(false); }}>
              <div className="flex items-center gap-2">
                <RefreshCcw className="size-4" />
                <span>App Update</span>
              </div>
            </CustomDropdownItem>
            <CustomDropdownItem onClick={() => { setHelpDialogOpen(true); setSettingsOpen(false); }}>
              <div className="flex items-center gap-2">
                <HelpCircle className="size-4" />
                <span>Help & Support</span>
              </div>
            </CustomDropdownItem>
          </CustomDropdown>

          <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
            <DialogContent className="!max-w-2xl !max-h-[80vh] h-full !overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Keyboard className="w-5 h-5 text-primary" />
                  ayuvitaCRM Support Center
                </DialogTitle>
              </DialogHeader>
              <div className="mt-2">
                <ShortcutHelp />
              </div>
            </DialogContent>
          </Dialog>
        </SidebarMenu>
        <NavUser user={userData} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  );
}
