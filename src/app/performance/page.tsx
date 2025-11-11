"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Perf = {
  id: string;
  name: string;
  role: string;
  revenue: number;
  profit: number; // absolute margin amount (before expenses)
  expense: number;
  margin: number; // 0-1, margin ratio = profit / revenue
  netProfit: number; // margin - expense
  imageUrl?: string | null;
};

function currency(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function periodRange(period: "month" | "last" | "life") {
  if (period === "life") return { start: null as Date | null, end: null as Date | null };
  const now = new Date();
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now };
  }
  // last month
  const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(firstThis.getTime() - 1); // last day of previous month
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start, end };
}

function inRange(d: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return true;
  return d >= start && d <= end;
}


// Treat variants like "CMHK", "CM HK", "CM HK.", case-insensitively, as CMHK vendor
function isCMHKVendor(vendor: string) {
  const v = String(vendor || "").trim().toLowerCase();
  return /cm\s*hk/.test(v) || v === "cmhk";
}

function getCommissionRate(profit: number) {
  if (profit >= 1_000_000) return 0.15;
  if (profit >= 900_000) return 0.13;
  if (profit >= 800_000) return 0.12;
  if (profit >= 700_000) return 0.11;
  if (profit >= 600_000) return 0.10;
  if (profit >= 500_000) return 0.09;
  if (profit >= 400_000) return 0.07;
  if (profit >= 300_000) return 0.06;
  if (profit >= 200_000) return 0.05;
  if (profit >= 100_000) return 0.04;
  return 0;
}


export default function PerformancePage() {
  const router = useRouter();

  const [period, setPeriod] = React.useState<"month" | "last" | "life">("month");
  // Default to "none" so period switches do not change order
  const [sortBy, setSortBy] = React.useState<"none" | "revenue" | "profit" | "margin">("none");
  const [loading, setLoading] = React.useState(true);

  // Update URL and localStorage only on user action (button click)
  const setPeriodAndSync = React.useCallback(
    (p: "month" | "last" | "life") => {
      setPeriod(p);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("perfPeriod", p);
          const params = new URLSearchParams(window.location.search);
          params.set("period", p);
          router.replace(`?${params.toString()}`, { scroll: false });
        }
      } catch {}
    },
    [router]
  );
  const initDone = React.useRef(false);

  // Load persisted period from URL or localStorage
  React.useEffect(() => {
    try {
      let initial: "month" | "last" | "life" = "month";
      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search);
        const qp = sp.get("period");
        if (qp === "month" || qp === "last" || qp === "life") {
          initial = qp;
        } else {
          const saved = window.localStorage.getItem("perfPeriod") as any;
          if (saved === "month" || saved === "last" || saved === "life") {
            initial = saved;
          }
        }
      }
      setPeriod(initial);
    } catch {} finally {
      initDone.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // Persist period to URL and localStorage (only after initial load)
  React.useEffect(() => {
    if (!initDone.current) return;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("perfPeriod", period);
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("period") !== period) {
          sp.set("period", period);
          router.replace(`?${sp.toString()}`, { scroll: false });
        }
      }
    } catch {}
  }, [period, router]);

  // Keep period in sync with browser back/forward
  React.useEffect(() => {
    const onPopState = () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const qp = sp.get("period");
        if (qp === "month" || qp === "last" || qp === "life") {
          setPeriod(qp);
        }
      } catch {}
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Handle browser back/forward: sync period from current URL
  React.useEffect(() => {
    const onPopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const qp = urlParams.get("period");
        if (qp === "month" || qp === "last" || qp === "life") {
          setPeriod(qp);
        }
      } catch {}
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);



  // Raw datasets
  const [salesPersons, setSalesPersons] = React.useState<Array<{ id: number; name: string }>>([]);
  const [sales, setSales] = React.useState<any[]>([]);
  const [expenses, setExpenses] = React.useState<any[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const [mastersRes, salesRes, expRes] = await Promise.all([
          fetch("/api/masters", { cache: "no-store" }),
          fetch("/api/sales", { cache: "no-store" }),
          fetch("/api/expenses", { cache: "no-store" }),
        ]);
        if (mastersRes.ok) {
          const masters = await mastersRes.json();
          setSalesPersons(masters.salesPersons || []);
        }
        if (salesRes.ok) setSales(await salesRes.json());
        if (expRes.ok) setExpenses(await expRes.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Stable base order by salesperson name (alphabetical) to keep order across periods
  const baseIndex = React.useMemo(() => {
    const sorted = [...salesPersons].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
    const map = new Map<string, number>();
    sorted.forEach((sp, idx) => map.set(String(sp.id), idx));
    return map;
  }, [salesPersons]);

  const data: Perf[] = React.useMemo(() => {
    const { start, end } = periodRange(period);

    // Seed result record per salesperson
    const result: Record<string, Perf> = {};
    for (const sp of salesPersons) {
      result[String(sp.id)] = {
        id: String(sp.id),
        name: sp.name,
        role: (sp as any).role ?? "Sales Executive",
        revenue: 0,
        expense: 0,
        profit: 0,
        margin: 0,
        netProfit: 0,
        imageUrl: (sp as any).image_url ?? null,
      };
    }

    // Aggregate sales -> revenue and margin (do NOT include expenses in margin)
    for (const s of sales) {
      const spId =
        s.sales_person_id ??
        s.salesPersonId ??
        (s.sales_person?.id != null ? s.sales_person.id : undefined);
      if (spId == null) continue;
      const key = String(spId);
      if (!result[key]) {
        const name = s.sales_person?.name ?? `ID ${key}`;
        result[key] = {
          id: key,
          name,
          role: "Sales Executive",
          revenue: 0,
          expense: 0,
          profit: 0, // absolute margin amount (before expenses)
          margin: 0,
          netProfit: 0,
        };
      }

      // Prefer sales_date from the sale record for period filtering
      const dateVal = s.sales_date ?? s.date ?? s.created_at;
      const d = dateVal ? new Date(dateVal) : new Date();
      if (!inRange(d, start, end)) continue;

      const qty = Number(s.quantity ?? 1);
      const unitSalesPrice = Number(s.unit_sales_price ?? s.sold_price ?? 0);
      const unitInstall = Number(s.unit_installation_charge ?? s.installation_cost ?? 0);
      const addRev = Number(s.additional_revenue ?? 0);
      const vat = Number(s.vat ?? 0);

      const unitPurchase = Number(s.unit_purchase_price ?? s.purchased_price ?? 0);
      const pickup = Number(s.pickup_cost ?? 0);
      const courier = Number(s.courier_charge ?? s.transport_fee ?? 0);
      const commission = Number(s.commission ?? 0);

      const vendorRaw =
        s.vendor ??
        (s.supplier ?? s.vendor_name ?? s.vendor_company ?? s.vendorTitle ?? "");
      const cmhk = isCMHKVendor(String(vendorRaw));

      // Revenue rules:
      //  total price + (installation x qty) + vat (+ any additional revenue if present)
      const saleRevenue =
        unitSalesPrice * qty + unitInstall * qty  + addRev + vat;

      // Procurement = (qty x unit purchase price) + pickup + courier
      const procurement = unitPurchase * qty + pickup + courier;

      // Margin rules:
      // CMHK: Revenue - Procurement - commission - vat
      // non-CMHK: Revenue - Procurement - commission - vat - (qty * installation)
      const saleMargin =
        (saleRevenue - procurement - commission - vat) -
        (cmhk ? 0 : unitInstall * qty);

      result[key].revenue += isFinite(saleRevenue) ? saleRevenue : 0;
      result[key].profit += isFinite(saleMargin) ? saleMargin : 0; // store margin amount
    }

    // Aggregate expenses -> expense only (do NOT affect profit)
    for (const e of expenses) {
      const spId =
        e.sales_person_id ??
        e.salesPersonId ??
        (e.sales_person?.id != null ? e.sales_person.id : undefined);
      if (spId == null) continue;
      const key = String(spId);
      if (!result[key]) {
        const name = e.sales_person?.name ?? `ID ${key}`;
        result[key] = {
          id: key,
          name,
          role: "Sales Executive",
          revenue: 0,
          expense: 0,
          profit: 0,
          margin: 0,
          netProfit: 0,
        };
      }

      const dateVal = e.expense_date ?? e.date ?? e.created_at;
      const d = dateVal ? new Date(dateVal) : new Date();
      if (!inRange(d, start, end)) continue;

      const amt = Number(e.expense_amount ?? e.amount ?? 0);
      result[key].expense += isFinite(amt) ? amt : 0;
    }

    // Finalize: compute margin ratio and net profit (margin - expense)
    const list = Object.values(result).map((r) => {
      const margin = r.revenue > 0 ? r.profit / r.revenue : 0;
      const netProfit = r.profit - r.expense;
      return { ...r, margin, netProfit };
    });

    // Apply sorting
    if (sortBy === "margin") {
      list.sort((a, b) => b.margin - a.margin);
    } else if (sortBy === "profit") {
      list.sort((a, b) => (b.netProfit ?? 0) - (a.netProfit ?? 0));
    } else if (sortBy === "revenue") {
      list.sort((a, b) => b.revenue - a.revenue);
    } else {
      // sortBy === "none" -> keep stable base order
      list.sort((a, b) => {
        const ia = baseIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const ib = baseIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (ia !== ib) return ia - ib;
        // fallback tie-breaker
        return String(a.name).localeCompare(String(b.name));
      });
    }

    return list;
  }, [period, sortBy, salesPersons, sales, expenses, baseIndex]);

  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16">
      <div role="progressbar" aria-label="Loading" className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-[var(--ring)] animate-spin" />
    </div>}>
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-extrabold gradient-title">Sales Performance Tracker</h1>
          <p className="text-[var(--muted)]">Track your team's success metrics</p>
        </div>

      <div className="flex items-center justify-center gap-2">
        <button
          className={`btn ${period === "month" ? "btn-primary" : "btn-secondary"} h-8 text-xs px-3 md:h-10 md:text-sm md:px-4`}
          onClick={() => setPeriodAndSync("month")}
        >
          This Month
        </button>
        <button
          className={`btn ${period === "last" ? "btn-primary" : "btn-secondary"} h-8 text-xs px-3 md:h-10 md:text-sm md:px-4`}
          onClick={() => setPeriodAndSync("last")}
        >
          Last Month
        </button>
        <button
          className={`btn ${period === "life" ? "btn-primary" : "btn-secondary"} h-8 text-xs px-3 md:h-10 md:text-sm md:px-4`}
          onClick={() => setPeriodAndSync("life")}
        >
          Lifetime
        </button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button className="btn btn-secondary h-8 text-xs px-3 md:h-10 md:text-sm md:px-4" onClick={() => setSortBy("revenue")}>Sort by Revenue</button>
        <button className="btn btn-secondary h-8 text-xs px-3 md:h-10 md:text-sm md:px-4" onClick={() => setSortBy("profit")}>Sort by Profit</button>
        <button className="btn btn-secondary h-8 text-xs px-3 md:h-10 md:text-sm md:px-4" onClick={() => setSortBy("margin")}>Sort by Margin</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div role="progressbar" aria-label="Loading" className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-[var(--ring)] animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {data.map((m) => (
              <Link key={m.id} href={`/performance/${m.id}?period=${period}`} className="block">
                  <div className="card p-5 hover:shadow-md transition-shadow">
                      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                          {m.imageUrl ? (
                              <img
                                  src={m.imageUrl}
                                  alt={m.name}
                                  className="w-14 h-14 rounded-full object-cover"
                              />
                          ) : (
                              <div
                                  className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold"
                                  style={{
                                      background: "linear-gradient(90deg, var(--primary-start), var(--primary-end))",
                                  }}
                              >
                                  {m.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                              </div>
                          )}

                          <div className="flex-1 w-full">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full">
                                  <div>
                                      <div className="text-xl font-semibold">{m.name}</div>
                                      <div className="text-sm text-[var(--muted)]">{m.role}</div>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-4 mt-4 sm:mt-0 text-center sm:text-right">
                                      <div>
                                          <div className="text-xs text-[var(--muted)]">
                                            Revenue ({period === "month" ? "This Month" : period === "last" ? "Last Month" : "Lifetime"})
                                          </div>
                                          <div className="font-semibold">{currency(m.revenue)}</div>
                                      </div>
                                      <div>
                                          <div className="text-xs text-[var(--muted)]">
                                            Margin ({period === "month" ? "This Month" : period === "last" ? "Last Month" : "Lifetime"})
                                          </div>
                                          <div className="font-semibold">{currency(m.profit)}</div>
                                      </div>
                                      <div>
                                          <div className="text-xs text-[var(--muted)]">Expense</div>
                                          <div className="font-semibold">{currency(m.expense)}</div>
                                      </div>
                                      <div>
                                          <div className="text-xs text-[var(--muted)]">
                                            Profit ({period === "month" ? "This Month" : period === "last" ? "Last Month" : "Lifetime"})
                                          </div>
                                          <div className="font-semibold">{currency((m as any).netProfit ?? (m.profit - m.expense))}</div>
                                      </div>
                                  </div>
                              </div>

                              <div className="mt-5">
                                  <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                          className="progress-gradient"
                                          style={{ width: `${m.margin * 100}%` }}
                                      />
                                  </div>

                                  <div className="mt-3 text-sm">
                                      {(() => {
                                          const base = (m as any).netProfit ?? (m.profit - m.expense);
                                          const rate = getCommissionRate(base);
                                          const compensation = base * rate;
                                          return (
                                              <div className="mt-3 text-sm">
                                                  Compensation:{" "}
                                                  <span className="font-semibold text-emerald-600">
                    {currency(compensation)}
                  </span>{" "}
                                                  <span className="text-xs text-[var(--muted)]">
                    ({(rate * 100).toFixed(1)}%)
                  </span>
                                              </div>
                                          );
                                      })()}
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
              </Link>

          ))}
          {data.length === 0 && (
            <div className="text-center text-[var(--muted)] py-12">No data available for the selected period.</div>
          )}
        </div>
      )}
      </div>
    </Suspense>
  );
}
