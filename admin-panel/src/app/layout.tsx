import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AdminSidebar } from "@/components/AdminSidebar";


const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CRM Admin Panel",
  description: "Remote Update Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 antialiased`}>
        <div className="flex">

          <AdminSidebar />

          <main className="flex-1 min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
