"use client";

import React, {Suspense, useState} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DataTable, Column } from "@/components/ui/DataTable";

type SaleRow = {
  id: number | string;
  date: string;
  customer: string;
  // Legacy fields kept optional for compatibility
  machine?: string;
  purchased?: number;
  sold?: number;
  addRev?: number;
  qty?: number;
  profit?: number;
  // New fields used in current UI and calculations
  revenue?: number;
  margin?: number;
};

type ExpenseRow = {
  id: number | string;
  date: string;
  category: string;
  amount: number;
  customer?: string;
};

function currency(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function periodRange(period: "month" | "last" | "life") {
  if (period === "life") return { start: null as Date | null, end: null as Date | null };
  const now = new Date();
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now };
  }
  const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(firstThis.getTime() - 1);
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start, end };
}

function inRange(d: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return true;
  return d >= start && d <= end;
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

export default function SalespersonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id);
  const searchParams = useSearchParams();
  const [period, setPeriod] = React.useState<"month" | "last" | "life">("month");
  const [periodReady, setPeriodReady] = React.useState(false);

  // Update URL and localStorage only on user action (button click)
  const setPeriodAndSync = React.useCallback(
    (p: "month" | "last" | "life") => {
      setPeriod(p);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("perfPeriod", p);
          const params = new URLSearchParams(window.location.search);
          params.set("period", p);
          // preserve current path (/performance/[id]) and replace only the query
          const qs = params.toString();
          const base = window.location.pathname;
          const href = qs ? `${base}?${qs}` : base;
          router.replace(href, { scroll: false });
        }
      } catch {}
    },
    [router]
  );
  const initDone = React.useRef(false);

  // Read from URL or localStorage on mount
  React.useEffect(() => {
    try {
      const qp = searchParams?.get("period");
      if (qp === "month" || qp === "last" || qp === "life") {
        setPeriod(qp);
      } else {
        const saved = window.localStorage.getItem("perfPeriod") as any;
        if (saved === "month" || saved === "last" || saved === "life") {
          setPeriod(saved);
        }
      }
    } catch {} finally {
      initDone.current = true;
      setPeriodReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to URL and localStorage on change (only after initial read)
  React.useEffect(() => {
    if (!initDone.current) return;
    try {
      window.localStorage.setItem("perfPeriod", period);
      const current = searchParams?.get("period");
      if (current !== period) {
        const params = new URLSearchParams(Array.from(searchParams?.entries?.() ?? []));
        params.set("period", period);
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    } catch {}
  }, [period, router, searchParams]);

  // Handle browser back/forward: sync period from current URL and allow fetch
  React.useEffect(() => {
    const onPopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const qp = urlParams.get("period");
        if (qp === "month" || qp === "last" || qp === "life") {
          setPeriod(qp);
          // ensure data fetch can run with new period from URL
          initDone.current = true;
        }
      } catch {}
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const [tab, setTab] = React.useState<"sales" | "expenses">("sales");
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState<string>("Salesperson");

  const [sales, setSales] = React.useState<SaleRow[]>([]);
  const [expenses, setExpenses] = React.useState<ExpenseRow[]>([]);

  // Removed duplicate localStorage sync to prevent overriding period from the URL

  React.useEffect(() => {
    if (!periodReady) return;
    (async () => {
      try {
        const [mastersRes, salesRes, expRes] = await Promise.all([
          fetch("/api/masters", { cache: "no-store" }),
          fetch("/api/sales", { cache: "no-store" }),
          fetch("/api/expenses", { cache: "no-store" }),
        ]);
        if (mastersRes.ok) {
          const m = await mastersRes.json();
          const sp = (m.salesPersons || []).find((x: any) => String(x.id) === id);
          setName(sp?.name || `ID ${id}`);
        }
        const { start, end } = periodRange(period);

        if (salesRes.ok) {
          const all = await salesRes.json();
          const filtered = (all as any[]).filter((s) => {
            const spId =
              s.sales_person_id ??
              s.salesPersonId ??
              (s.sales_person?.id != null ? s.sales_person.id : undefined);
            if (String(spId) !== id) return false;
            const d = new Date(s.sales_date ?? s.date ?? s.created_at ?? Date.now());
            return inRange(d, start, end);
          });
          const mapped: any[] = filtered.map((s) => {
            const quantity = Number(s.quantity ?? s.Quantity ?? 1);

            // Prefer new schema fields and fall back to legacy ones
            const unitSalesPrice = Number(s.unit_sales_price ?? s.unitSalesPrice ?? s.sold_price ?? 0);
            const unitInstallationCharge = Number(s.unit_installation_charge ?? s.unitInstallationCharge ?? s.installation_cost ?? 0);
            const additionalRevenue = Number(s.additional_revenue ?? s.additionalRevenue ?? 0);
            const vat = Number(s.vat ?? 0);

            const unitPurchasePrice = Number(s.unit_purchase_price ?? s.unitPurchasePrice ?? s.purchased_price ?? 0);
            const pickupCost = Number(s.pickup_cost ?? s.pickupCost ?? 0);
            const courierCharge = Number(s.courier_charge ?? s.courierCharge ?? s.transport_fee ?? 0);
            const commission = Number(s.commission ?? 0);
            const hostingRate = Number(s.hosting_rate ?? 0);
            const vendor = String(s.vendor ?? s.vendor ?? "");

            // New formulas
            const revenue = unitSalesPrice * quantity + unitInstallationCharge * quantity + additionalRevenue + vat;
            const procurement = unitPurchasePrice * quantity + pickupCost + courierCharge;
            const baseMargin = revenue - procurement - commission - vat;
            const extraInstallDeduction = vendor === "CM HK." ? 0 : unitInstallationCharge * quantity;
            const margin = baseMargin - extraInstallDeduction;

            return {
              id: s.id,
              date: new Date(s.sales_date ?? s.date ?? s.created_at ?? Date.now()).toISOString(),
              customer: s.customer?.name ?? "",
              machineModel: s.machine_model?.model_name ?? "",
              description: s.description ?? "",
              invoiceNumber: s.invoice_number ?? "",
              receiptDate: s.receipt_date ? new Date(s.receipt_date).toISOString() : "",
              receiptAccount: s.receipt_account ?? "",
              courierLink: s.courier_link ?? "",
              vendor: vendor,
              purchasedPrice: Number(s.unit_purchase_price ?? s.purchased_price ?? unitPurchasePrice ?? 0),
              purchasedDate: s.purchase_date
                ? new Date(s.purchase_date).toISOString()
                : s.purchased_date
                ? new Date(s.purchased_date).toISOString()
                : "",
              soldPrice: Number(s.unit_sales_price ?? s.sold_price ?? unitSalesPrice ?? 0),
              deliveryDate: s.delivery_date ? new Date(s.delivery_date).toISOString() : "",
              pluginDate: s.plugin_date ? new Date(s.plugin_date).toISOString() : "",
              hostingRate,
              pickupCost,
              courierCharge,
              additionalRevenue,
              revenue,
              installationCost: unitInstallationCharge,
              vat,
              commission,
              quantity,
              procurementPerson: s.procurement_incharge ?? s.procurement_person ?? "",
              remarks: s.remarks ?? "",
              unitPurchasePrice,
              unitSalesPrice,
              margin,
            };
          });
          setSales(mapped as any);
        }
        if (expRes.ok) {
          const all = await expRes.json();
          const filtered = (all as any[]).filter((e) => {
            const spId =
              e.sales_person_id ??
              e.salesPersonId ??
              (e.sales_person?.id != null ? e.sales_person.id : undefined);
            if (String(spId) !== id) return false;
            const d = new Date(e.expense_date ?? e.date ?? e.created_at ?? Date.now());
            return inRange(d, start, end);
          });
          const mapped: ExpenseRow[] = filtered.map((e) => ({
            id: e.id,
            date: new Date(e.expense_date ?? e.date ?? e.created_at ?? Date.now()).toISOString(),
            category: e.category ?? "",
            amount: Number(e.expense_amount ?? e.amount ?? 0),
            customer: e.customer?.name ?? "",
          }));
          setExpenses(mapped);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, period, periodReady]);

  const marginTotal = React.useMemo(
    () => sales.reduce((acc, r) => acc + (r.margin ?? 0), 0),
    [sales]
  );
  const expenseTotal = React.useMemo(
    () => expenses.reduce((acc, e) => acc + (e.amount ?? 0), 0),
    [expenses]
  );
  const profitTotal = React.useMemo(() => marginTotal - expenseTotal, [marginTotal, expenseTotal]);
    const commissionRate = getCommissionRate(profitTotal);

  const saleCols: Column<any>[] = [
    { key: "date", header: "Sales Date", sortable: true, render: (r) => new Date(r.date).toLocaleDateString() },
    { key: "customer", header: "Customer", sortable: true },
    { key: "invoiceNumber", header: "Invoice Number", sortable: true },
    { key: "description", header: "Description", sortable: true, render: (r) => r.machineModel || r.description || "" },
    { key: "quantity", header: "Quantity", sortable: true },
    { key: "installationCost", header: "Unit Installation Charge", sortable: true, render: (r) => currency(r.installationCost) },
    { key: "hostingRate", header: "Hosting Rate", sortable: true, render: (r) => currency(r.hostingRate ?? 0) },
    { key: "soldPrice", header: "Unit Sales Price", sortable: true, render: (r) => currency(r.soldPrice) },
    { key: "additionalRevenue", header: "Additional Revenue", sortable: true, render: (r) => currency(r.additionalRevenue) },
    { key: "receiptDate", header: "Receipt Date", sortable: true, render: (r) => (r.receiptDate ? new Date(r.receiptDate).toLocaleDateString() : "") },
    { key: "receiptAccount", header: "Receipt Account", sortable: true, render: (r) => r.receiptAccount ?? "" },
    { key: "vat", header: "VAT", sortable: true, render: (r) => currency(r.vat) },
    { key: "procurementPerson", header: "Procurement Incharge", sortable: true, render: (r) => r.procurementPerson ?? "" },
    { key: "purchasedDate", header: "Purchase Date", sortable: true, render: (r) => (r.purchasedDate ? new Date(r.purchasedDate).toLocaleDateString() : "") },
    { key: "vendor", header: "Vendor", sortable: true },
    { key: "purchasedPrice", header: "Unit Purchase Price", sortable: true, render: (r) => currency(r.purchasedPrice) },
    { key: "pickupCost", header: "Pickup Cost", sortable: true, render: (r) => currency(r.pickupCost ?? 0) },
    { key: "commission", header: "Commission", sortable: true, render: (r) => currency(r.commission) },
    { key: "courierCharge", header: "Courier Charge", sortable: true, render: (r) => currency(r.courierCharge ?? 0) },
    { key: "deliveryDate", header: "Delivery Date", sortable: true, render: (r) => (r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString() : "") },
    { key: "pluginDate", header: "Plug-in Date", sortable: true, render: (r) => (r.pluginDate ? new Date(r.pluginDate).toLocaleDateString() : "") },
    { key: "remarks", header: "Remarks" },
    // Computed
    { key: "revenue", header: "Revenue", sortable: true, render: (r) => currency(r.revenue) },
    { key: "margin", header: "Margin", sortable: true, render: (r) => currency(r.margin) },
  ];

    const expenseCols: Column<ExpenseRow>[] = [
    { key: "date", header: "Date", sortable: true, render: (r) => new Date(r.date).toLocaleDateString() },
    { key: "category", header: "Category", sortable: true },
    { key: "customer", header: "Customer", sortable: true },
    { key: "amount", header: "Amount", sortable: true, render: (r) => currency(r.amount) },
  ];

  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16">
      <div role="progressbar" aria-label="Loading" className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-[var(--ring)] animate-spin" />
    </div>}>
      <div className="space-y-6">
        <button className="btn btn-secondary h-9" onClick={() => router.back()}>
          ← Back
        </button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-[var(--muted)]">Sales Executive</p>
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-2">
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
      </div>

      {/* Margin summary */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-sm text-[var(--muted)]">Total Profit ({period === "month" ? "This Month" : period === "last" ? "Last Month" : "Lifetime"})</div>
          <div className="text-xl font-semibold">{currency(profitTotal)}</div>
        </div>
        <div className="mt-3">
          <div className="text-sm">
            Commission rate reached: <span className="font-semibold">{Math.round(commissionRate * 100)}%</span>
          </div>
          <div className="mt-2 h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="progress-gradient"
              style={{ width: `${Math.min(100, Math.round(commissionRate * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button className={`btn ${tab === "sales" ? "btn-primary" : "btn-secondary"} h-8 text-xs px-3`} onClick={() => setTab("sales")}>
          Sales
        </button>
        <button className={`btn ${tab === "expenses" ? "btn-primary" : "btn-secondary"} h-8 text-xs px-3`} onClick={() => setTab("expenses")}>
          Expenses
        </button>
      </div>

          {loading ? (
              <div className="flex items-center justify-center py-16">
                  <div
                      role="progressbar"
                      aria-label="Loading"
                      className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-[var(--ring)] animate-spin"
                  />
              </div>
          ) : tab === "sales" ? (
              <SalesTable sales={sales} saleCols={saleCols}  />
          ) : (
              <DataTable
                  columns={expenseCols}
                  data={expenses}
                  initialSort={{ key: "date", direction: "desc" }}
              />
          )}

      </div>
    </Suspense>
  );
}


function SalesTable({ sales, saleCols }: { sales: any[]; saleCols: Column<any>[] }) {
    const [expandedRow, setExpandedRow] = useState<number | null>(null);

    // Summary columns (collapsed view)
    const summaryCols = [
        {
            key: "customer",
            header: "Customer",
            render: (row: { customer: any; }) => row.customer,
        },
        {
            key: "revenueTotal",
            header: "Revenue",
            render: (row: { revenue: any; }) => currency(row.revenue || 0),
        },
        {
            key: "margin",
            header: "Margin",
            render: (row: { margin: number; }) => currency(row.margin),
        },
    ];

    return (
        <div className="overflow-x-auto">
            <table className="table w-full border border-[var(--border)] rounded-lg">
                <thead>
                <tr className="bg-[var(--muted-bg)] text-left">
                    {summaryCols.map((col) => (
                        <th key={col.key} className="px-4 py-2">{col.header}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {sales.map((row, idx) => (
                    <React.Fragment key={idx}>
                        {/* Collapsed row */}
                        <tr
                            className="cursor-pointer hover:bg-[var(--muted-bg)] transition"
                            onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                        >
                            {summaryCols.map((col) => (
                                <td key={col.key} className="px-4 py-2 border-t border-[var(--border)]">
                                    {col.render(row)}
                                </td>
                            ))}
                        </tr>

                        {/* Expanded details */}
                        {expandedRow === idx && (
                            <tr>
                                <td colSpan={summaryCols.length} className="p-0">
                                    <div className="bg-gray-50 dark:bg-slate-900 border-t border-[var(--border)] p-2">
                                        <DataTable
                                            columns={saleCols}
                                            data={[row]}
                                            initialSort={{ key: "date", direction: "desc" }}
                                            hidePageSizeControls
                                            hidePaginationControls
                                        />
                                    </div>
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
                ))}
                </tbody>
            </table>
        </div>
    );
}


