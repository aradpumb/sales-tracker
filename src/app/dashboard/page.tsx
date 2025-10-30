"use client";

import React from "react";
import { loadExpenses, loadSales } from "@/lib/storage";
import { ExpenseRecord, SalesRecord } from "@/lib/types";

function currency(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

export default function DashboardPage() {
  const [sales, setSales] = React.useState<SalesRecord[]>([]);
  const [expenses, setExpenses] = React.useState<ExpenseRecord[]>([]);

  React.useEffect(() => {
    setSales(loadSales());
    setExpenses(loadExpenses());
  }, []);

  // Total Revenue = totalPrice + (installationCost * quantity) + vat across all sales
  const totalRevenue = sales.reduce((sum, r) => {
    const totalPrice = Number((r as any).totalPrice ?? r.totalAmount ?? 0) || 0;
    const installationCost = Number((r as any).installationCost ?? 0) || 0;
    const quantity = Number((r as any).quantity ?? 1) || 1;
    const vat = Number((r as any).vat ?? 0) || 0;
    const rev = totalPrice + installationCost * quantity + vat;
    return sum + (isFinite(rev) ? rev : 0);
  }, 0);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // Total Profit = Revenue − (totalPurchase + transportFee + additionalCost)
  const totalProfit = sales.reduce((sum, r) => {
    const totalPrice = Number((r as any).totalPrice ?? r.totalAmount ?? 0) || 0;
    const totalPurchase = Number((r as any).totalPurchase ?? 0) || 0;
    const additionalCost = Number((r as any).additionalCost ?? 0) || 0;
    const transportFee = Number((r as any).transportFee ?? 0) || 0;
    const installationCost = Number((r as any).installationCost ?? 0) || 0;
    const quantity = Number((r as any).quantity ?? 1) || 1;
    const vat = Number((r as any).vat ?? 0) || 0;

    const revenue = totalPrice + installationCost * quantity + vat;
    const saleProfit = revenue - (totalPurchase + transportFee + additionalCost);

    return sum + (isFinite(saleProfit) ? saleProfit : 0);
  }, 0);

  const profit = totalProfit; // Use totalProfit for display

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
          <div className="text-2xl font-bold">{currency(profit)}</div>
          <div className="mt-3 bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="progress-gradient"
              style={{
                width: `${totalRevenue ? Math.max(0, Math.min(100, (profit / totalRevenue) * 100)) : 0}%`,
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
                  <div className="font-semibold">{currency(((r as any).totalPrice ?? r.totalAmount) as number)}</div>
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
