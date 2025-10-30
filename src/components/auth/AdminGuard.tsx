"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as any)?.role;
    if (!role || role !== "ADMIN") {
      router.replace("/login");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <div role="status" className="text-sm text-[var(--muted)]">
          Checking access...
        </div>
      </div>
    );
  }
  const role = (session?.user as any)?.role;
  if (role !== "ADMIN") return null;

  return <>{children}</>;
}
