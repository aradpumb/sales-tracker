"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {string} from "fast-check";

type Perf = {
  id: string;
  name: string;
  role: string;
  revenue: number;
  profit: number; // absolute margin amount (before expenses)
  expense: number;
  margin: number; // 0-1, margin ratio = profit / revenue
  netProfit: number; // margin - expense
  compensation?: number; // computed compensation for the selected period
  compRate?: number; // optional slab rate when applicable
  imageUrl?: string | null;
};

function currency(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function periodRange(period: "month" | "last" | "life" | "custom", monthKey?: string) {
  if (period === "life") return { start: null as Date | null, end: null as Date | null };

  const now = new Date();

  if (period === "custom") {
    // monthKey format: YYYY-MM
    let year = now.getFullYear();
    let month = now.getMonth();
    if (typeof monthKey === "string") {
      const m = monthKey.trim();
      const y = Number(m.slice(0, 4));
      const mm = Number(m.slice(5, 7)) - 1;
      if (!Number.isNaN(y) && !Number.isNaN(mm) && mm >= 0 && mm <= 11) {
        year = y;
        month = mm;
      }
    }
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999); // last ms of the month
    return { start, end };
  }

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
  // Thresholds converted from AED to USD using ~0.272 USD per AED
  if (profit >= 272_000) return 0.15;   // 1,000,000 AED
  if (profit >= 244_800) return 0.13;   //   900,000 AED
  if (profit >= 217_600) return 0.12;   //   800,000 AED
  if (profit >= 190_400) return 0.11;   //   700,000 AED
  if (profit >= 163_200) return 0.10;   //   600,000 AED
  if (profit >= 136_000) return 0.09;   //   500,000 AED
  if (profit >= 108_800) return 0.07;   //   400,000 AED
  if (profit >= 81_600) return 0.06;    //   300,000 AED
  if (profit >= 54_400) return 0.05;    //   200,000 AED
  if (profit >= 27_200) return 0.04;    //   100,000 AED
  return 0;
}

// Month helpers
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function listRecentMonths(count = 24) {
  const res: Array<{ key: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
    res.push({ key, label });
  }
  return res;
}
function getMonthLabel(key: string) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1;
  if (Number.isNaN(y) || Number.isNaN(m)) return "";
  const d = new Date(y, m, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}
function periodLabel(period: "month" | "last" | "life" | "custom", monthKey?: string) {
  if (period === "month") return "This Month";
  if (period === "last") return "Last Month";
  if (period === "life") return "Lifetime";
  return getMonthLabel(monthKey || currentMonthKey());
}

export default function PerformancePage() {
  const router = useRouter();

  const [period, setPeriod] = React.useState<"month" | "last" | "life" | "custom">("month");
  const [selectedMonth, setSelectedMonth] = React.useState<string>(currentMonthKey());
  // Default to "none" so period switches do not change order
  const [sortBy, setSortBy] = React.useState<"none" | "revenue" | "profit" | "expense">("none");
  const [loading, setLoading] = React.useState(true);

  // Update URL and localStorage only on user action (button click)
  const setPeriodAndSync = React.useCallback(
    (p: "month" | "last" | "life" | "custom") => {
      setPeriod(p);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("perfPeriod", p);
          const params = new URLSearchParams(window.location.search);
          params.set("period", p);
          if (p !== "custom") {
            params.delete("month");
          } else {
            params.set("month", selectedMonth || currentMonthKey());
          }
          router.replace(`?${params.toString()}`, { scroll: false });
        }
      } catch {}
    },
    [router, selectedMonth]
  );

  const setMonthAndSync = React.useCallback(
    (key: string) => {
      setSelectedMonth(key);
      setPeriod("custom");
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("perfMonth", key);
          window.localStorage.setItem("perfPeriod", "custom");
          const params = new URLSearchParams(window.location.search);
          params.set("period", "custom");
          params.set("month", key);
          router.replace(`?${params.toString()}`, { scroll: false });
        }
      } catch {}
    },
    [router]
  );

  const initDone = React.useRef(false);

  // Load persisted period and month from URL or localStorage
  React.useEffect(() => {
    try {
      let initialPeriod: "month" | "last" | "life" | "custom" = "month";
      let initialMonth: string = currentMonthKey();
      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search);
        const qp = sp.get("period");
        const qm = sp.get("month");
        if (qm && /^\d{4}-\d{2}$/.test(qm)) {
          initialMonth = qm;
        } else {
          const savedMonth = window.localStorage.getItem("perfMonth");
          if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth)) {
            initialMonth = savedMonth;
          }
        }
        if (qp === "month" || qp === "last" || qp === "life" || qp === "custom") {
          initialPeriod = qp as any;
        } else {
          const saved = window.localStorage.getItem("perfPeriod") as any;
          if (saved === "month" || saved === "last" || saved === "life" || saved === "custom") {
            initialPeriod = saved;
          }
        }
      }
      setSelectedMonth(initialMonth);
      setPeriod(initialPeriod);
    } catch {} finally {
      initDone.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // Persist period and month to URL/localStorage (only after initial load)
  React.useEffect(() => {
    if (!initDone.current) return;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("perfPeriod", period);
        if (period === "custom") {
          window.localStorage.setItem("perfMonth", selectedMonth);
        }
        const sp = new URLSearchParams(window.location.search);
        sp.set("period", period);
        if (period === "custom") {
          sp.set("month", selectedMonth || currentMonthKey());
        } else {
          sp.delete("month");
        }
        router.replace(`?${sp.toString()}`, { scroll: false });
      }
    } catch {}
  }, [period, selectedMonth, router]);

  // Keep period and month in sync with browser back/forward
  React.useEffect(() => {
    const onPopState = () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const qp = sp.get("period");
        const qm = sp.get("month");
        if (qp === "month" || qp === "last" || qp === "life" || qp === "custom") {
          setPeriod(qp as any);
        }
        if (qm && /^\d{4}-\d{2}$/.test(qm)) {
          setSelectedMonth(qm);
        }
      } catch {}
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Handle browser back/forward: sync period and month from current URL
  React.useEffect(() => {
    const onPopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const qp = urlParams.get("period");
        const qm = urlParams.get("month");
        if (qp === "month" || qp === "last" || qp === "life" || qp === "custom") {
          setPeriod(qp as any);
        }
        if (qm && /^\d{4}-\d{2}$/.test(qm)) {
          setSelectedMonth(qm);
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
    const { start, end } = periodRange(period, selectedMonth);

    // Build salesperson meta for compensation rules
    const spMeta = new Map<string, { salary: number; exclude: boolean }>();
    for (const sp of salesPersons) {
      const id = String(sp.id);
      const salary = Number((sp as any).salary ?? 0) || 0;

      // Exclude flag can be 0/1, "0"/"1", true/false
      const rawEx =
        (sp as any).exclude_from_commission ??
        (sp as any).excludeCommission ??
        (sp as any).exclude ??
        0;
      let exclude = false;
      if (typeof rawEx === "string") {
        const v = rawEx.trim().toLowerCase();
        exclude = v === "1" || v === "true" || v === "yes";
      } else if (typeof rawEx === "number" || typeof rawEx === "bigint") {
        exclude = Number(rawEx) === 1;
      } else {
        exclude = Boolean(rawEx);
      }

      spMeta.set(id, { salary, exclude });
    }

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
        compensation: 0,
        compRate: undefined,
        imageUrl: (sp as any).image_url ?? null,
      };
    }

    // Track positive commission amounts per salesperson for compensation override
    const commissionBySp = new Map<string, number>();

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
        unitSalesPrice * qty + unitInstall * qty + addRev + vat;

      // Procurement = (qty x unit purchase price) + pickup + courier
      const procurement = unitPurchase * qty + pickup + courier;

      // Margin rules:
      // CMHK: Revenue - Procurement - commission - vat
      // non-CMHK: Revenue - Procurement - commission - vat - (qty * installation)
      const saleMargin =
        (saleRevenue - procurement - commission - vat) -
        (cmhk ? 0 : unitInstall * qty);

      // Track positive commission amounts for excluded salespersons
      if (commission > 0) {
        commissionBySp.set(key, (commissionBySp.get(key) ?? 0) + commission);
      }

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

    // Finalize: compute margin ratio, net profit (margin - expense), and compensation
    const list = Object.values(result).map((r) => {
      const margin = r.revenue > 0 ? r.profit / r.revenue : 0;
      const netProfit = r.profit - r.expense;

      const meta = spMeta.get(r.id) || { salary: 0, exclude: false };
      let compensation = 0;
      let compRate: number | undefined = undefined;

      if (meta.exclude) {
        // Use summed positive commission entries from sales
        compensation = commissionBySp.get(r.id) ?? 0;
        compRate = undefined;
      } else {
        // Threshold: net profit must exceed 3x salary
        const threshold = 3 * (Number(meta.salary) || 0);
        if (netProfit > threshold && netProfit > 0) {
          const rate = getCommissionRate(netProfit);
          compRate = rate;
          compensation = netProfit * rate;
        } else {
          compensation = 0;
          compRate = 0;
        }
      }

      return { ...r, margin, netProfit, compensation, compRate };
    });

    // Apply sorting
    if (sortBy === "expense") {
      list.sort((a, b) => b.expense - a.expense);
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
  }, [period, selectedMonth, sortBy, salesPersons, sales, expenses, baseIndex]);

  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16">
      <div role="progressbar" aria-label="Loading" className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-[var(--ring)] animate-spin" />
    </div>}>
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-extrabold gradient-title">Sales Performance Tracker</h1>
          <p className="text-[var(--muted)]">Track your team's success metrics</p>
        </div>

      <div className="flex items-center justify-center flex-wrap gap-2">
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

        <div className="flex items-center gap-2 ml-2">
          <select
            className="select h-8 text-xs md:h-10 md:text-sm"
            value={selectedMonth}
            onChange={(e) => setMonthAndSync(e.target.value)}
          >
            {listRecentMonths().map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button className="btn btn-secondary h-8 text-xs px-3 md:h-10 md:text-sm md:px-4" onClick={() => setSortBy("revenue")}>Sort by Revenue</button>
        <button className="btn btn-secondary h-8 text-xs px-3 md:h-10 md:text-sm md:px-4" onClick={() => setSortBy("profit")}>Sort by Profit</button>
        <button className="btn btn-secondary h-8 text-xs px-3 md:h-10 md:text-sm md:px-4" onClick={() => setSortBy("expense")}>Sort by Expense</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div role="progressbar" aria-label="Loading" className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-[var(--ring)] animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {data.map((m) => (
              <Link key={m.id} href={`/performance/${m.id}?period=${period}${period === "custom" ? `&month=${selectedMonth}` : ""}`} className="block">
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
                                            Revenue ({periodLabel(period, selectedMonth)})
                                          </div>
                                          <div className="font-semibold">{currency(m.revenue)}</div>
                                      </div>
                                      <div>
                                          <div className="text-xs text-[var(--muted)]">
                                            Margin ({periodLabel(period, selectedMonth)})
                                          </div>
                                          <div className="font-semibold">{currency(m.profit)}</div>
                                      </div>
                                      <div>
                                          <div className="text-xs text-[var(--muted)]">
                                              Expense ({periodLabel(period, selectedMonth)})
                                          </div>
                                          <div className="font-semibold">{currency(m.expense)}</div>
                                      </div>
                                      <div>
                                          <div className="text-xs text-[var(--muted)]">
                                            Profit ({periodLabel(period, selectedMonth)})
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
                                      const comp = (m as any).compensation ?? 0;
                                      const rate = (m as any).compRate ?? 0;
                                      const showRate = rate > 0;
                                      return (
                                        <div className="mt-3 text-sm">
                                          Compensation:{" "}
                                          <span className="font-semibold text-emerald-600">
                                            {currency(comp)}
                                          </span>{" "}
                                          {showRate ? (
                                            <span className="text-xs text-[var(--muted)]">
                                              ({(rate * 100).toFixed(1)}%)
                                            </span>
                                          ) : null}
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
