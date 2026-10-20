"use client"

import React from "react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  ChevronsUpDown,
  LogOut
} from "lucide-react"
import { CustomDropdown, CustomDropdownItem } from "@/components/ui/custom-dropdown"

export function NavUser({
  user,
  onLogout
}) {
  const { isMobile } = useSidebar()
  const [profileOpen, setProfileOpen] = React.useState(false);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <CustomDropdown
          isOpen={profileOpen}
          setIsOpen={setProfileOpen}
          widthClass="w-56"
          side={isMobile ? "bottom" : "top"}
          trigger={
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground w-full">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">{user.name?.trim()?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight ml-2">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email || 'User'}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          }
        >
          <div className="flex items-center gap-2 px-3 py-1.5 text-left text-sm border-b border-gray-100 dark:border-gray-800 pb-2 mb-1">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">{user.name?.trim()?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email || 'User'}</span>
            </div>
          </div>
          <CustomDropdownItem onClick={() => { onLogout(); setProfileOpen(false); }}>
            <div className="flex items-center gap-2">
              <LogOut className="size-4" />
              <span>Log out</span>
            </div>
          </CustomDropdownItem>
        </CustomDropdown>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

