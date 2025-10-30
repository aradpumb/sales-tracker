"use client";

import React from "react";
import SideNav from "@/components/SideNav";
import AdminGuard from "@/components/auth/AdminGuard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <AdminGuard>
      <div className="grid grid-cols-1 md:grid-cols-[256px_1fr] gap-6">
        <SideNav mobileOpen={open} onClose={() => setOpen(false)} />
        <div className="min-w-0">
          <div className="md:hidden mb-2">
            <button className="btn btn-secondary" onClick={() => setOpen(true)}>
              Open Menu
            </button>
          </div>
          {children}
        </div>
      </div>
    </AdminGuard>
  );
}
