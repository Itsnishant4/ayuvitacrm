"use client"

import React from "react"
import { LayoutDashboard, LogOut, RefreshCcw } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"

const SESSION_PASSWORD_KEY = "admin_panel_password"

export function AdminSidebar() {
  const router = useRouter()
  const pathname = usePathname()

  if (pathname === "/login") {
    return null;
  }

  const menuItems = [
    { icon: <LayoutDashboard className="w-5 h-5" />, label: "Overview", href: "/" },
  ]

  const handleLogout = async () => {
    sessionStorage.removeItem(SESSION_PASSWORD_KEY)
    await fetch("/api/auth/logout", { method: "POST" })
    router.replace("/login")
    router.refresh()
  }

  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen p-4 flex flex-col border-r border-slate-800">
      <div className="flex items-center gap-3 px-2 py-6 mb-4">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <RefreshCcw className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-tight">CRM Admin</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Update Module</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item, i) => (
          <Link 
            key={i} 
            href={item.href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all duration-200 group"
          >
            <span className="group-hover:scale-110 transition-transform">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="pt-6 border-t border-slate-800 space-y-1">
        <button onClick={handleLogout} className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200">
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Log out</span>
        </button>
      </div>
    </div>
  )
}
