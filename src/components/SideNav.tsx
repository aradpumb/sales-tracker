"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

function ActiveLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active =
    href === "/admin/sales-person"
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "flex items-center h-10 px-3 rounded-lg bg-white/70 dark:bg-white/5 border border-[var(--border)] ring-2 ring-[var(--ring)]"
          : "flex items-center h-10 px-3 rounded-lg hover:bg-white/60 dark:hover:bg-white/5 border border-transparent"
      }
    >
      {label}
    </Link>
  );
}

export default function SideNav({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();

  function onLogout() {
    try {
      localStorage.clear();
    } catch {}
    router.push("/");
  }

  const content = (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">
          Admin
        </h3>
      </div>
      <nav className="flex flex-col gap-2">
        <ActiveLink href="/admin/sales-person" label="Sales Person" onClick={onClose} />
        <ActiveLink href="/admin/customer" label="Customer" onClick={onClose} />
        <ActiveLink href="/admin/machine-model" label="Machine Model" onClick={onClose} />
        <ActiveLink href="/admin/users" label="Users" onClick={onClose} />
      </nav>
      <div className="mt-auto pt-4 border-t border-[var(--border)]">
        <button onClick={onLogout} className="btn btn-secondary w-full">
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-64 shrink-0">
        <div className="card p-4 sticky top-6">{content}</div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed z-50 left-0 top-0 bottom-0 w-72 bg-[var(--card)] border-r border-[var(--border)] p-4 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold">Menu</span>
              <button className="btn btn-secondary h-9" onClick={onClose}>
                Close
              </button>
            </div>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
