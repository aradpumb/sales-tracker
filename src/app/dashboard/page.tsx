"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { loadExpenses, loadSales } from "@/lib/storage";
import { ExpenseRecord, SalesRecord } from "@/lib/types";

function currency(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

// Treat variants like "CMHK", "CM HK", "CM HK.", case-insensitively, as CMHK vendor
function isCMHKVendor(vendor: string) {
  const v = String(vendor || "").trim().toLowerCase();
  return /cm\s*hk/.test(v) || v === "cmhk";
}

// Revenue matches Sales page totals: unit sales + installation + additional revenue + VAT
function computeRevenue(rec: SalesRecord): number {
  const qty = Number((rec as any).quantity ?? 1) || 1;
  const unitSales = Number((rec as any).soldPrice ?? (rec as any).unitSalesPrice ?? 0) || 0;
  const unitInstall = Number((rec as any).installationCost ?? (rec as any).unitInstallationCharge ?? 0) || 0;
  const addRev = Number((rec as any).additionalRevenue ?? 0) || 0;
  const vat = Number((rec as any).vat ?? 0) || 0;
  const revenue = unitSales * qty + unitInstall * qty + addRev + vat;
  console.log("revenue=",revenue);
  return isFinite(revenue) ? revenue : 0;
}

// Revenue = total price + (installation cost × quantity) + vat
// Procurement = (quantity × unit purchase price) + pickup cost + courier charge
// Margin (CMHK) = Revenue − Procurement − commission − vat
// Margin (non-CMHK) = Margin(CMHK) − (quantity × installation cost)
function computeSaleProfit(rec: SalesRecord): number {

  const unitPurchasePrice = Number((rec as any).unitPurchasePrice ?? (rec as any).purchasedPrice ?? 0) || 0;
  const pickupCost = Number((rec as any).pickupCost ?? 0) || 0;
  const courierCharge = Number((rec as any).courierCharge ?? (rec as any).transportFee ?? 0) || 0;
  const commission = Number((rec as any).commission ?? 0) || 0;
  const vendor = String((rec as any).vendor ?? "");


    const qty = Number((rec as any).quantity ?? 1) || 1;
    const unitSales = Number((rec as any).soldPrice ?? (rec as any).unitSalesPrice ?? 0) || 0;
    const unitInstall = Number((rec as any).installationCost ?? (rec as any).unitInstallationCharge ?? 0) || 0;
    const addRev = Number((rec as any).additionalRevenue ?? 0) || 0;
    const vat = Number((rec as any).vat ?? 0) || 0;
    const revenue = unitSales * qty + unitInstall * qty + addRev + vat;

  const procurement = unitPurchasePrice * qty + pickupCost + courierCharge;
  const baseMargin = revenue - procurement - commission - vat
  const extraInstallDeduction = isCMHKVendor(vendor) ? 0 : unitInstall * qty;
  const margin = baseMargin - extraInstallDeduction;

  return isFinite(margin) ? margin : 0;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sales, setSales] = React.useState<SalesRecord[]>([]);
  const [expenses, setExpenses] = React.useState<ExpenseRecord[]>([]);

  React.useEffect(() => {
    if (status === "loading") return; // Still loading
    if (!session) {
      router.push("/login");
      return;
    }
    setSales(loadSales());
    setExpenses(loadExpenses());
  }, [session, status, router]);

  // Show loading while checking authentication
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated (middleware should handle this, but just in case)
  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-lg">Redirecting to login...</div>
        </div>
      </div>
    );
  }

  // Total Revenue matches Sales page formula across all sales
  const totalRevenue = sales.reduce((sum, r) => sum + computeRevenue(r), 0);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // Lifetime net profit across all salespeople = sum of all sale margins − sum of all expenses
  const totalMargin = sales.reduce((sum, r) => sum + computeSaleProfit(r), 0);
  console.log("margin=",totalMargin);
  console.log("expense=",totalExpenses);
  const netProfit = totalMargin - totalExpenses;

  const recentSales = [...sales].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5);
  const recentExpenses = [...expenses].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold gradient-title">Dashboard</h1>
        <p className="text-[var(--muted)] mt-1">Overview of your mining operation</p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-sm text-[var(--muted)]">Revenue</div>
          <div className="text-2xl font-bold">{currency(totalRevenue)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-[var(--muted)]">Expenses</div>
          <div className="text-2xl font-bold">{currency(totalExpenses)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-[var(--muted)]">Profit</div>
          <div className="text-2xl font-bold">{currency(netProfit)}</div>
          <div className="mt-3 bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="progress-gradient"
              style={{
                width: `${totalRevenue ? Math.max(0, Math.min(100, (netProfit / totalRevenue) * 100)) : 0}%`,
              }}
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Recent Sales</h3>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {recentSales.length === 0 ? (
              <li className="py-6 text-sm text-[var(--muted)]">No sales yet</li>
            ) : (
              recentSales.map((r) => (
                <li key={r.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{r.customer || "Customer"}</div>
                    <div className="text-sm text-[var(--muted)]">
                      {new Date(r.date).toLocaleDateString()} • {r.machineModel}
                    </div>
                  </div>
                  <div className="font-semibold">{currency(computeRevenue(r))}</div>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Recent Expenses</h3>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {recentExpenses.length === 0 ? (
              <li className="py-6 text-sm text-[var(--muted)]">No expenses yet</li>
            ) : (
              recentExpenses.map((e) => (
                <li key={e.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{e.category}</div>
                    <div className="text-sm text-[var(--muted)]">
                      {new Date(e.date).toLocaleDateString()} • {e.salesperson}
                    </div>
                  </div>
                  <div className="font-semibold">{currency(e.amount)}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
