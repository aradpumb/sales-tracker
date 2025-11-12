"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { useSession, signOut } from "next-auth/react";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const { data: session, status } = useSession();

  const user = session?.user;
  const isAdmin = (user as any)?.role === "ADMIN";
  const isAuthenticated = status === "authenticated";

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/sales", label: "Sales" },
    { href: "/expenses", label: "Expenses" },
    { href: "/performance", label: "Performance" },
      { href: "/admin/sales-person", label: "Settings" }
  ];

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await signOut({ callbackUrl: `${origin}/login` });
  };

  return (
    <nav className="container-app relative flex items-center justify-between py-4">
      <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg"
          style={{
            background:
              "linear-gradient(90deg, var(--primary-start), var(--primary-end))",
          }}
        />
        <span className="font-bold text-lg">Sales Tracker</span>
        {/*{isAdmin && <span className="ml-2 text-xs badge">Admin</span>}*/}
      </Link>

      {/* Only show navigation links if authenticated */}
      {isAuthenticated && (
        <>
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
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-[var(--muted)]">
                {user?.name || user?.email}
              </span>
              <button className="btn btn-ghost" onClick={handleLogout}>
                Logout
              </button>
            </div>
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
              <div className="border-t border-[var(--border)] pt-2">
                <div className="text-sm text-[var(--muted)] px-3 py-2">
                  {user?.name || user?.email}
                </div>
                <button className="btn btn-secondary justify-start w-full" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Show login button if not authenticated */}
      {!isAuthenticated && status !== "loading" && (
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-secondary">
            Login
          </Link>
        </div>
      )}

      {/* Loading state */}
      {status === "loading" && (
        <div className="flex items-center gap-2">
          <div className="text-sm text-[var(--muted)]">Loading...</div>
        </div>
      )}
    </nav>
  );
}
