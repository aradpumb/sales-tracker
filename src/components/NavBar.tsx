"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { useAuth } from "@/context/AuthContext";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const { user, isAdmin, logout } = useAuth();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/sales", label: "Sales" },
    { href: "/expenses", label: "Expenses" },
    { href: "/performance", label: "Performance" },
  ];

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <nav className="container-app relative flex items-center justify-between py-4">
      <Link href="/dashboard" className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg"
          style={{
            background:
              "linear-gradient(90deg, var(--primary-start), var(--primary-end))",
          }}
        />
        <span className="font-bold text-lg">Sales Tracker</span>
        {isAdmin && <span className="ml-2 text-xs badge">Admin</span>}
      </Link>

      {/* Desktop links */}
      <div className="hidden md:flex items-center gap-2">
        {links.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "btn btn-secondary ring-2 ring-[var(--ring)]"
                  : "btn btn-ghost"
              }
            >
              {l.label}
            </Link>
          );
        })}
        {user ? (
          <button className="btn btn-ghost" onClick={logout}>
            Logout
          </button>
        ) : (
          <Link href="/login" className="btn btn-secondary">
            Login
          </Link>
        )}
      </div>

      {/* Mobile toggle */}
      <button
        className="md:hidden btn btn-secondary"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
      >
        Menu
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div
          id="mobile-nav"
          className="absolute right-0 top-full mt-2 w-56 z-40 card p-2 md:hidden flex flex-col gap-2"
        >
          {links.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "btn btn-secondary ring-2 ring-[var(--ring)] justify-start"
                    : "btn btn-ghost justify-start"
                }
              >
                {l.label}
              </Link>
            );
          })}
          {user ? (
            <button className="btn btn-ghost justify-start" onClick={logout}>
              Logout
            </button>
          ) : (
            <Link href="/login" className="btn btn-secondary justify-start">
              Login
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
