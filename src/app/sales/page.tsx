"use client";

import React from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import FileUpload from "@/components/ui/FileUpload";
import { DataTable, Column } from "@/components/ui/DataTable";
import { SalesRecord, PaymentStatus } from "@/lib/types";
import { loadSales, saveSales } from "@/lib/storage";
import { mapSalesRows } from "@/lib/csv";
import { useSession } from "next-auth/react";

function currency(n: number | undefined) {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
}

type MasterSalesPerson = { id: number; name: string };
type MasterCustomer = { id: number; name: string };
type MasterMachineModel = { id: number; model_name: string; price?: number | string | null };

type SaleForm = {
  date: string;
  salesPersonId?: number;
  customerId?: number;
  machineModelId?: number;
    invoiceNumber?: string;
    purchasedPrice?: number;
    purchasedDate?: string;
    totalPurchase?: number;
    soldPrice?: number;
    totalPrice?: number;
    transportFee?: number;
    additionalCost?: number;
    additionalRevenue: number;
    revenue?: number;
    installationCost?: number;
    vat?: number;
    commission?: number;
    quantity: number;
    procurementPerson?: string;
    remarks?: string;
    purchaseBill?: string;
    supplier?: string;
    vatApplicable?: boolean;
    courierLink?: string;
};

const defaultForm: SaleForm = {
  date: new Date().toISOString().slice(0, 10),
  salesPersonId: undefined,
  customerId: undefined,
  machineModelId: undefined,
  invoiceNumber: "",
  purchasedPrice: 0,
  purchasedDate: undefined,
  totalPurchase: undefined,
  soldPrice: 0,
  totalPrice: undefined,
  transportFee: undefined,
  additionalCost: undefined,
  additionalRevenue: 0,
  revenue: undefined,
  installationCost: undefined,
  vat: undefined,
  commission: undefined,
  quantity: 1,
  procurementPerson: "",
  remarks: "",
  purchaseBill: "",
  supplier: "",
  vatApplicable: undefined,
  courierLink: "",
};

function mapDbSaleToRecord(row: any): SalesRecord {
  const qty = Number(row?.quantity ?? row?.qty ?? 1);
  // Prefer new schema fields; fallback to legacy
  const purchased = Number(row?.unit_purchase_price ?? row?.purchased_price ?? row?.purchasedPrice ?? 0);
  const sold = Number(row?.unit_sales_price ?? row?.sold_price ?? row?.soldPrice ?? 0);
  const addRev = Number(row?.additional_revenue ?? row?.additionalRevenue ?? 0);

  const totalPrice = Number(row?.total_price ?? row?.totalPrice ?? 0);
  const total = Number(
    row?.total_amount ?? row?.totalAmount ?? (isFinite(totalPrice) && totalPrice > 0 ? totalPrice : (sold + addRev) * qty)
  );

  const toIso = (d: any) => (d ? new Date(d).toISOString() : undefined);

  return {
    id: String(row?.id ?? crypto.randomUUID()),
    date: new Date(row?.sales_date ?? row?.date ?? row?.created_at ?? Date.now()).toISOString(),
    salesperson: row?.sales_person?.name ?? row?.salesperson ?? "",
    customer: row?.customer?.name ?? row?.customer ?? "",
    machineModel: row?.machine_model?.model_name ?? row?.machineModel ?? "",

    // New/canonical fields surfaced for UI
    description: row?.description ?? undefined,
    installationCost: row?.unit_installation_charge != null ? Number(row?.unit_installation_charge) : (row?.installation_cost != null ? Number(row?.installation_cost) : undefined),
    hostingRate: row?.hosting_rate != null ? Number(row?.hosting_rate) : undefined,
    pickupCost: row?.pickup_cost != null ? Number(row?.pickup_cost) : undefined,
    courierCharge: row?.courier_charge != null ? Number(row?.courier_charge) : (row?.transport_fee != null ? Number(row?.transport_fee) : undefined),
    receiptDate: toIso(row?.receipt_date),
    receiptAccount: row?.receipt_account ?? undefined,
    deliveryDate: toIso(row?.delivery_date),
    pluginDate: toIso(row?.plugin_date),
    procurementPerson: row?.procurement_incharge ?? row?.procurement_person ?? undefined,

    purchasedPrice: purchased,          // Unit Purchase Price
    soldPrice: sold,                    // Unit Sales Price
    additionalRevenue: addRev,
    revenue: row?.revenue_amount != null ? Number(row?.revenue_amount) : undefined,
    quantity: qty,
    totalAmount: total,
    paymentStatus: (row?.payment_status ?? "Pending") as PaymentStatus,
    remarks: row?.remarks ?? "",

    // extras/compat
    ...(row?.invoice_number != null || row?.invoiceNumber != null ? { invoiceNumber: String(row?.invoice_number ?? row?.invoiceNumber) } : {}),
    ...(row?.vat != null ? { vat: Number(row?.vat) } : {}),
    ...(row?.purchase_date ? { purchasedDate: toIso(row?.purchase_date) } : row?.purchased_date ? { purchasedDate: toIso(row?.purchased_date) } : {}),
    ...(row?.total_purchase != null ? { totalPurchase: Number(row?.total_purchase) } : {}),
    ...(isFinite(totalPrice) ? { totalPrice } : {}),
    ...(row?.additional_cost != null ? { additionalCost: Number(row?.additional_cost) } : {}),
    ...(row?.commission != null ? { commission: Number(row?.commission) } : {}),

    // vendor mapping to supplier field used in UI table
    ...(row?.vendor ? { supplier: String(row?.vendor) } : row?.supplier ? { supplier: String(row?.supplier) } : {}),

    ...(row?.purchase_bill ? { purchaseBill: String(row?.purchase_bill) } : {}),
    ...(row?.courier_link ? { courierLink: String(row?.courier_link) } : {}),
    ...(typeof row?.vat_applicable === "boolean" ? { vatApplicable: row?.vat_applicable } : {}),
  } as any;
}

export default function SalesPage() {
  const { data: session } = useSession();
  const isAdmin = (session as any)?.user?.role === "ADMIN";

  const [records, setRecords] = React.useState<SalesRecord[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<any | null>(null);
  const [form, setForm] = React.useState<SaleForm>({ ...defaultForm });
  const [loading, setLoading] = React.useState(true);

  // State for filters
  const [filterClient, setFilterClient] = React.useState("");
  const [filterModel, setFilterModel] = React.useState("");
  const [filterSalesPerson, setFilterSalesPerson] = React.useState("");
  const [filterSupplier, setFilterSupplier] = React.useState("");
  const [filterTracking, setFilterTracking] = React.useState("");

  // Sales Date range filter
  const [fromDate, setFromDate] = React.useState<string>("");
  const [toDate, setToDate] = React.useState<string>("");

  const [salesPersons, setSalesPersons] = React.useState<MasterSalesPerson[]>([]);
  const [customers, setCustomers] = React.useState<MasterCustomer[]>([]);
  const [machineModels, setMachineModels] = React.useState<MasterMachineModel[]>([]);

  // Load masters + existing sales
  React.useEffect(() => {
    (async () => {
      try {
        const [mastersRes, salesRes] = await Promise.all([
          fetch("/api/masters", { cache: "no-store" }),
          fetch("/api/sales", { cache: "no-store" }),
        ]);

        if (mastersRes.ok) {
          const masters = await mastersRes.json();
          setSalesPersons(masters.salesPersons || []);
          setCustomers(masters.customers || []);
          setMachineModels(masters.machineModels || []);
        }

        if (salesRes.ok) {
          const rows = await salesRes.json();
          const mapped = (rows as any[]).map(mapDbSaleToRecord);
          setRecords(mapped);
          saveSales(mapped);
        } else {
          setRecords(loadSales());
        }
      } catch {
        setRecords(loadSales());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    saveSales(records);
  }, [records]);

  function addRecord(r: Omit<SalesRecord, "id">) {
    setRecords((prev) => [{ id: crypto.randomUUID(), ...r }, ...prev]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.salesPersonId || !form.customerId || !form.machineModelId) {
      alert("Please select Salesperson, Customer and Machine Model");
      return;
    }

    const payload: any = {
      date: form.date,
      salesPersonId: form.salesPersonId,
      customerId: form.customerId,
      invoiceNumber: form.invoiceNumber || undefined,
      description: (form as any).description || undefined,
      quantity: form.quantity,
      installationCost: form.installationCost,
      hostingRate: (form as any).hostingRate,
      soldPrice: form.soldPrice,
      additionalRevenue: form.additionalRevenue,
      receiptDate: (form as any).receiptDate || undefined,
      receiptAccount: (form as any).receiptAccount || undefined,
      vat: form.vat,
      procurementPerson: form.procurementPerson,
      purchasedDate: form.purchasedDate,
      supplier: form.supplier || undefined,
      purchasedPrice: form.purchasedPrice,
      pickupCost: (form as any).pickupCost,
      commission: form.commission,
      courierCharge: (form as any).courierCharge,
      deliveryDate: (form as any).deliveryDate || undefined,
      pluginDate: (form as any).pluginDate || undefined,
      remarks: form.remarks,
    };

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to create sale");
      }
      const created = await res.json();
      const mapped = mapDbSaleToRecord(created);
      setRecords((prev) => [mapped, ...prev]);
    } catch {
      // Fallback optimistic add using resolved names from masters
      const spName = salesPersons.find((s) => s.id === form.salesPersonId)?.name || "";
      const custName = customers.find((c) => c.id === form.customerId)?.name || "";
      const mmName = machineModels.find((m) => m.id === form.machineModelId)?.model_name || "";
      addRecord({
        date: new Date(form.date).toISOString(),
        salesperson: spName,
        customer: custName,
        machineModel: mmName,
        purchasedPrice: form.purchasedPrice,
        soldPrice: form.soldPrice,
        additionalRevenue: form.additionalRevenue,
        quantity: form.quantity,
        totalAmount: (Number(form.soldPrice ?? 0) + form.additionalRevenue) * form.quantity,
        remarks: form.remarks,
      } as SalesRecord);
    } finally {
      setOpen(false);
      setForm({ ...defaultForm });
    }
  }

  const [uploading, setUploading] = React.useState(false);

  async function onCsv(rows: Record<string, any>[]) {
    // Parse rows using shared mapper to support all fields
    const parsed = mapSalesRows(rows);
    if (!parsed.length) return;

    // Normalize function to eliminate hidden whitespace differences
    const norm = (v: any) =>
      String(v ?? "")
        .replace(/\u00A0/g, " ") // NBSP -> space
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ");

    // Build normalized lookup maps for masters
    const spMap = new Map(salesPersons.map((s) => [norm(s.name), s]));
    const cuMap = new Map(customers.map((c) => [norm(c.name), c]));
    const mmMap = new Map(machineModels.map((m) => [norm(m.model_name), m]));

    // Validate masters strictly; collect errors per row
    const errors: string[] = [];
    parsed.forEach((r, idx) => {
      const rowNum = idx + 1;
      const sp = spMap.get(norm(r.salesperson));
      const cu = cuMap.get(norm(r.customer));
      const mm = mmMap.get(norm(r.machineModel));
      if (!sp) errors.push(`Row ${rowNum}: Unknown Salesperson "${r.salesperson}"`);
      if (!cu) errors.push(`Row ${rowNum}: Unknown Customer "${r.customer}"`);
      if (!mm) errors.push(`Row ${rowNum}: Unknown Machine Model "${r.machineModel}"`);
    });

    if (errors.length) {
      alert(`CSV contains invalid references:\n${errors.join("\n")}`);
      return; // Fail upload
    }

    // Build payload with resolved IDs
    const bulkRows = parsed.map((r) => {
      const sp = spMap.get(norm(r.salesperson))!;
      const cu = cuMap.get(norm(r.customer))!;
      const mm = mmMap.get(norm(r.machineModel))!;
      return {
        date: r.date,
        salesPersonId: sp.id,
        customerId: cu.id,
        machineModelId: mm.id,
        salesperson: r.salesperson,
        customer: r.customer,
        machineModel: r.machineModel,

        invoiceNumber: r.invoiceNumber,
        purchasedPrice: r.purchasedPrice,
        purchasedDate: r.purchasedDate,
        totalPurchase: r.totalPurchase,
        soldPrice: r.soldPrice,
        totalPrice: r.totalPrice ?? r.totalAmount,
        transportFee: r.transportFee,
        additionalCost: r.additionalCost,
        additionalRevenue: r.additionalRevenue,
        revenue: (r as any).revenue,
        vat: r.vat,
        commission: r.commission,
        quantity: r.quantity,
        procurementPerson: r.procurementPerson,
        remarks: r.remarks,

        // new fields passed through to API
        hostingRate: (r as any).hostingRate,
        pickupCost: (r as any).pickupCost,
        courierCharge: (r as any).courierCharge,
        receiptDate: (r as any).receiptDate,
        receiptAccount: (r as any).receiptAccount,
        deliveryDate: (r as any).deliveryDate,
        pluginDate: (r as any).pluginDate,

        // legacy/new naming compatibility
        supplier: (r as any).supplier,
        vendor: (r as any).vendor,

        // extras
        purchaseBill: (r as any).purchaseBill,
        vatApplicable: (r as any).vatApplicable,
        courierLink: r.courierLink,
        installationCost: (r as any).installationCost,
      };
    });

    try {
      setUploading(true);
      alert("uploading in progress");
      const res = await fetch("/api/sales/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bulkRows }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Bulk upload failed");
      }
      const resp = await res.json();
      const created = Array.isArray(resp?.created) ? resp.created : [];
      const errors = Array.isArray(resp?.errors) ? resp.errors : [];

      if (created.length) {
        const mappedCreated = created.map(mapDbSaleToRecord);
        setRecords((prev) => [...mappedCreated, ...prev]);
      }

      if (errors.length > 0) {
        // Format the error messages for display. Row number is index + 2 to account for header.
        const errorDetails = errors
          .map((e: { index: number; error: any; }) => `Row ${e.index + 2}: ${e.error}`)
          .join("\\n");
        alert(
          `Imported ${created.length} row(s).\n\n${errors.length} row(s) failed to import:\n\n${errorDetails}`
        );
      } else {
        alert(`Import complete. Imported ${created.length} row(s).`);
      }
    } catch (e: any) {
      alert(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Memoized lists for filter dropdowns
  const clientNames = React.useMemo(() => [...new Set(records.map((r) => r.customer).filter(Boolean))], [records]);
  const machineModelsList = React.useMemo(() => [...new Set(records.map((r) => r.machineModel).filter(Boolean))], [records]);
  const salesPersonList = React.useMemo(() => [...new Set(records.map((r) => r.salesperson).filter(Boolean))], [records]);
  const supplierList = React.useMemo(() => [...new Set(records.map((r: any) => r.supplier).filter(Boolean))], [records]);
  const trackingLinks = React.useMemo(() => [...new Set(records.map((r: any) => r.courierLink).filter(Boolean))], [records]);

  const filteredRecords = React.useMemo(() => {
    return records.filter((r) => {
      const clientMatch = !filterClient || r.customer.toLowerCase().includes(filterClient.toLowerCase());
      const modelMatch = !filterModel || r.machineModel.toLowerCase().includes(filterModel.toLowerCase());
      const spMatch = !filterSalesPerson || r.salesperson.toLowerCase().includes(filterSalesPerson.toLowerCase());
      const supplierMatch = !filterSupplier || (r as any).supplier?.toLowerCase().includes(filterSupplier.toLowerCase());
      const trackingMatch = !filterTracking || (r as any).courierLink?.toLowerCase().includes(filterTracking.toLowerCase());

      // Sales Date range match
      const d = new Date(r.date);
      const fromOk = !fromDate || d >= new Date(fromDate);
      const toOk = !toDate || d <= new Date(toDate);
      const dateMatch = fromOk && toOk;

      return clientMatch && modelMatch && spMatch && supplierMatch && trackingMatch && dateMatch;
    });
  }, [records, filterClient, filterModel, filterSalesPerson, filterSupplier, filterTracking, fromDate, toDate]);

  // Totals for selected date range using new formulas
  const totalsInRange = React.useMemo(() => {
    let revenue = 0;
    let margin = 0;
    for (const r of filteredRecords) {
      const qty = Number((r as any).quantity ?? 1) || 1;
      const unitSales = Number((r as any).soldPrice ?? (r as any).unitSalesPrice ?? 0) || 0;
      const unitInstall = Number((r as any).installationCost ?? (r as any).unitInstallationCharge ?? 0) || 0;
      const addRev = Number((r as any).additionalRevenue ?? 0) || 0;
      const vat = Number((r as any).vat ?? 0) || 0;

      const unitPurchase = Number((r as any).purchasedPrice ?? (r as any).unitPurchasePrice ?? 0) || 0;
      const pickup = Number((r as any).pickupCost ?? 0) || 0;
      const courier = Number((r as any).courierCharge ?? (r as any).transportFee ?? 0) || 0;
      const commission = Number((r as any).commission ?? 0) || 0;
      const vendor = String((r as any).supplier ?? "");

      const rev = unitSales * qty + unitInstall * qty + addRev + vat;
      const procurement = unitPurchase * qty + pickup + courier;
      const base = rev - procurement - commission - vat;
      const extraInstallDeduction = vendor === "CM HK." ? 0 : unitInstall * qty;
      const mar = base - extraInstallDeduction;

      revenue += isFinite(rev) ? rev : 0;
      margin += isFinite(mar) ? mar : 0;
    }
    return { revenue, margin };
  }, [filteredRecords]);

  async function onDeleteSale(id: string) {
    const ok = confirm("Delete this sale? This cannot be undone.");
    if (!ok) return;
    try {
      const res = await fetch(`/api/sales?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to delete sale");
      }
      setRecords((prev) => prev.filter((r) => String(r.id) !== String(id)));
    } catch (e: any) {
      alert(e?.message || "Failed to delete sale");
    }
  }

  const columns: Column<any>[] = [
    { key: "date", header: "Sales Date", sortable: true, render: (r) => new Date(r.date).toLocaleDateString() },
    { key: "salesperson", header: "Sales Incharge", sortable: true },
    { key: "customer", header: "Customer", sortable: true },
    { key: "invoiceNumber", header: "Invoice Number", sortable: true },
    { key: "description", header: "Description", sortable: true, render: (r) => (r as any).machineModel || (r as any).description || "" },
    { key: "quantity", header: "Quantity", sortable: true },
    { key: "installationCost", header: "Unit Installation Charge", sortable: true, render: (r) => (r as any).installationCost ?? "" },
    { key: "hostingRate", header: "Hosting Rate", sortable: true, render: (r) => (r as any).hostingRate ?? "" },
    { key: "soldPrice", header: "Unit Sales Price", sortable: true, render: (r) => (r as any).soldPrice ?? "" },
    { key: "additionalRevenue", header: "Additional Revenue", sortable: true, render: (r) => (r as any).additionalRevenue ?? "" },
    { key: "receiptDate", header: "Receipt Date", sortable: true, render: (r) => ((r as any).receiptDate ? new Date((r as any).receiptDate).toLocaleDateString() : "") },
    { key: "receiptAccount", header: "Receipt Account", sortable: true, render: (r) => (r as any).receiptAccount ?? "" },
    { key: "vat", header: "VAT", sortable: true, render: (r) => (r as any).vat ?? "" },
    { key: "procurementPerson", header: "Procurement Incharge", sortable: true, render: (r) => (r as any).procurementPerson ?? "" },
    { key: "purchasedDate", header: "Purchase Date", sortable: true, render: (r) => (r.purchasedDate ? new Date(r.purchasedDate).toLocaleDateString() : "") },
    { key: "supplier", header: "Vendor", sortable: true, render: (r) => (r as any).supplier ?? "" },
    { key: "purchasedPrice", header: "Unit Purchase Price", sortable: true, render: (r) => (r as any).purchasedPrice ?? "" },
    { key: "pickupCost", header: "Pickup Cost", sortable: true, render: (r) => (r as any).pickupCost ?? "" },
    { key: "commission", header: "Commission", sortable: true, render: (r) => (r as any).commission ?? "" },
    { key: "courierCharge", header: "Courier Charge", sortable: true, render: (r) => (r as any).courierCharge ?? "" },
    { key: "deliveryDate", header: "Delivery Date", sortable: true, render: (r) => ((r as any).deliveryDate ? new Date((r as any).deliveryDate).toLocaleDateString() : "") },
    { key: "pluginDate", header: "Plug-in Date", sortable: true, render: (r) => ((r as any).pluginDate ? new Date((r as any).pluginDate).toLocaleDateString() : "") },
    { key: "remarks", header: "Remarks" },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        isAdmin ? (
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary h-9"
              onClick={() => {
                setEditRow(r);
                setEditOpen(true);
              }}
            >
              Edit
            </button>
            <button
              className="h-9 px-3 rounded-lg border border-[var(--border)] hover:bg-red-50 text-red-600"
              title="Delete"
              aria-label="Delete"
              onClick={() => onDeleteSale(r.id)}
            >
              🗑️
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-title">Sales</h1>
        <p className="text-[var(--muted)] mt-1">Manage sales for your mining hardware</p>
      </div>

      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          {isAdmin ? (
            <>
              <FileUpload label="Upload Sales CSV" onParsed={onCsv} />
              <a
                href="/samples/sales_sample.csv"
                download
                className="text-sm text-[var(--muted)] underline hover:no-underline"
              >
                click here to download sample csv
              </a>
              {uploading ? (
                <span className="text-xs text-blue-600">uploading in progress</span>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? <Button onClick={() => setOpen(true)}>Add Sale</Button> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <select className="select" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="">Filter by Client</option>
          {clientNames.map((name) => (<option key={name} value={name}>{name}</option>))}
        </select>
        <select className="select" value={filterModel} onChange={(e) => setFilterModel(e.target.value)}>
          <option value="">Filter by Model</option>
          {machineModelsList.map((name) => (<option key={name} value={name}>{name}</option>))}
        </select>
        <select className="select" value={filterSalesPerson} onChange={(e) => setFilterSalesPerson(e.target.value)}>
          <option value="">Filter by Sales Person</option>
          {salesPersonList.map((name) => (<option key={name} value={name}>{name}</option>))}
        </select>
        <select className="select" value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}>
          <option value="">Filter by Supplier</option>
          {supplierList.map((name) => (<option key={name} value={name}>{name}</option>))}
        </select>
        <select className="select" value={filterTracking} onChange={(e) => setFilterTracking(e.target.value)}>
          <option value="">Filter by Tracking Link</option>
          {trackingLinks.map((link) => (<option key={link} value={link}>{link}</option>))}
        </select>
      </div>

      {/* Sales Date range filter + totals */}
      <div className="card p-4 mt-3 flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex items-center gap-2">
          <div>
            <label className="text-sm mb-1 block">From (Sales Date)</label>
            <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm mb-1 block">To (Sales Date)</label>
            <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          {(fromDate || toDate) && (
            <button className="btn btn-secondary h-10 mt-5" onClick={() => { setFromDate(""); setToDate(""); }}>
              Clear
            </button>
          )}
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 md:ml-auto">
          <div className="rounded-lg border border-[var(--border)] p-3">
            <div className="text-xs text-[var(--muted)]">Total Revenue (range)</div>
            <div className="text-lg font-semibold">{currency(totalsInRange.revenue)}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] p-3">
            <div className="text-xs text-[var(--muted)]">Total Margin (range)</div>
            <div className="text-lg font-semibold">{currency(totalsInRange.margin)}</div>
          </div>
        </div>
      </div>

      <DataTable columns={columns} data={filteredRecords} loading={loading} initialSort={{ key: "date", direction: "desc" }} />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Sale"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="sale-form" type="submit">
              Save
            </Button>
          </>
        }
      >
        <form id="sale-form" onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm mb-1 block">Date</label>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Salesperson</label>
            <select
              className="select"
              value={form.salesPersonId ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, salesPersonId: Number(e.target.value) || undefined }))}
              required
            >
              <option value="">Select salesperson</option>
              {salesPersons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm mb-1 block">Customer</label>
            <select
              className="select"
              value={form.customerId ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, customerId: Number(e.target.value) || undefined }))}
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Description</label>
            <input
              type="text"
              className="input"
              value={(form as any).description ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, description: e.target.value || undefined }))}
              placeholder="Description of the sale (optional)"
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Invoice Number</label>
            <input
              type="text"
              className="input"
              value={form.invoiceNumber ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value || undefined }))}
              placeholder="e.g., SGIE3162"
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Courier Link</label>
            <input
              type="url"
              className="input"
              value={form.courierLink ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, courierLink: e.target.value || undefined }))}
              placeholder="https://tracking.example.com/..."
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Unit Purchase Price</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={(form as any).purchasedPrice}
              onChange={(e) => setForm((f: any) => ({ ...f, purchasedPrice: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Purchased Date</label>
            <input
              type="date"
              className="input"
              value={form.purchasedDate ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, purchasedDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Total Purchase</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.totalPurchase ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, totalPurchase: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Unit Sales Price</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.soldPrice}
              onChange={(e) => setForm((f) => ({ ...f, soldPrice: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Total Price</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.totalPrice ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, totalPrice: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Transport Fee</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.transportFee ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, transportFee: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Additional Cost</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.additionalCost ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, additionalCost: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Additional Revenue</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.additionalRevenue}
              onChange={(e) => setForm((f) => ({ ...f, additionalRevenue: Number(e.target.value) }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Revenue</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.revenue ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, revenue: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Unit Installation Charge</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.installationCost ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, installationCost: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">VAT</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.vat ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, vat: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Commission</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.commission ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Quantity</label>
            <input
              type="number"
              className="input"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
            />
          </div>


          <div>
            <label className="text-sm mb-1 block">Purchase Bill</label>
            <input
              className="input"
              value={form.purchaseBill ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, purchaseBill: e.target.value || undefined }))}
              placeholder="PB-12345"
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Vendor</label>
            <input
              className="input"
              value={form.supplier ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value || undefined }))}
              placeholder="Vendor name"
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">VAT Applicable</label>
            <select
              className="select"
              value={form.vatApplicable === undefined ? "" : form.vatApplicable ? "yes" : "no"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  vatApplicable: e.target.value === "" ? undefined : e.target.value === "yes",
                }))
              }
            >
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Procurement Incharge</label>
            <input
              className="input"
              value={form.procurementPerson ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, procurementPerson: e.target.value || undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Pickup Cost</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={(form as any).pickupCost ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, pickupCost: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Courier Charge</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={(form as any).courierCharge ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, courierCharge: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Receipt Date</label>
            <input
              type="date"
              className="input"
              value={(form as any).receiptDate ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, receiptDate: e.target.value || undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Receipt Account</label>
            <input
              className="input"
              value={(form as any).receiptAccount ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, receiptAccount: e.target.value || undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Hosting Rate</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={(form as any).hostingRate ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, hostingRate: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Delivery Date</label>
            <input
              type="date"
              className="input"
              value={(form as any).deliveryDate ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, deliveryDate: e.target.value || undefined }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Plug-in Date</label>
            <input
              type="date"
              className="input"
              value={(form as any).pluginDate ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, pluginDate: e.target.value || undefined }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Remarks</label>
            <textarea
              className="textarea"
              rows={3}
              value={form.remarks ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      {isAdmin && (
        <Modal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="Edit Sale"
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button form="sale-edit-form" type="submit">
                Update
              </Button>
            </>
          }
        >
          <div className="max-h-[80vh] overflow-y-auto pr-1">
            <form
              id="sale-edit-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editRow) return;
                const payload: any = {
                  id: editRow.id,
                  date: editRow.date,
                  invoiceNumber: editRow.invoiceNumber,
                  purchasedPrice: editRow.purchasedPrice,
                  purchasedDate: editRow.purchasedDate,
                  totalPurchase: editRow.totalPurchase,
                  soldPrice: editRow.soldPrice,
                  totalPrice: editRow.totalPrice ?? editRow.totalAmount,
                  transportFee: editRow.transportFee,
                  additionalCost: editRow.additionalCost,
                  additionalRevenue: editRow.additionalRevenue,
                  revenue: editRow.revenue,
                  installationCost: editRow.installationCost,
                  vat: editRow.vat,
                  commission: editRow.commission,
                  quantity: editRow.quantity,
                  procurementPerson: editRow.procurementPerson,
                  remarks: editRow.remarks,
                  purchaseBill: editRow.purchaseBill,
                  supplier: editRow.supplier,
                  vatApplicable: editRow.vatApplicable,
                  courierLink: editRow.courierLink,
                };
                try {
                  const res = await fetch("/api/sales", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  if (!res.ok) throw new Error("Failed to update sale");
                  const updated = await res.json();
                  const mapped = mapDbSaleToRecord(updated);
                  setRecords((prev) => prev.map((x) => (String(x.id) === String(mapped.id) ? mapped : x)));
                  setEditOpen(false);
                } catch (err: any) {
                  alert(err?.message || "Failed to update sale");
                }
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              <div>
                <label className="text-sm mb-1 block">Sales Date</label>
                <input
                  type="date"
                  className="input"
                  value={(editRow?.date ?? "").slice(0, 10)}
                  onChange={(e) => setEditRow((r: any) => ({ ...r, date: e.target.value }))}
                />
              </div>

            <div>
              <label className="text-sm mb-1 block">Invoice Number</label>
              <input
                className="input"
                value={editRow?.invoiceNumber ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, invoiceNumber: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm mb-1 block">Courier Link</label>
              <input
                className="input"
                value={editRow?.courierLink ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, courierLink: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Purchased Price</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.purchasedPrice ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, purchasedPrice: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Purchased Date</label>
              <input
                type="date"
                className="input"
                value={(editRow?.purchasedDate ?? "").slice(0, 10)}
                onChange={(e) => setEditRow((r: any) => ({ ...r, purchasedDate: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Total Purchase</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.totalPurchase ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, totalPurchase: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Sold Price</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.soldPrice ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, soldPrice: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Total Price</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.totalPrice ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, totalPrice: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Transport Fee</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.transportFee ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, transportFee: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Additional Cost</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.additionalCost ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, additionalCost: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Additional Revenue</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.additionalRevenue ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, additionalRevenue: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Revenue</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.revenue ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, revenue: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Installation Cost</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.installationCost ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, installationCost: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">VAT</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.vat ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, vat: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Commission</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={editRow?.commission ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, commission: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Quantity</label>
              <input
                type="number"
                className="input"
                value={editRow?.quantity ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, quantity: Number(e.target.value) }))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm mb-1 block">Procurement Person</label>
              <input
                className="input"
                value={editRow?.procurementPerson ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, procurementPerson: e.target.value || undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Purchase Bill</label>
              <input
                className="input"
                value={editRow?.purchaseBill ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, purchaseBill: e.target.value || undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">Supplier</label>
              <input
                className="input"
                value={editRow?.supplier ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, supplier: e.target.value || undefined }))}
              />
            </div>

            <div>
              <label className="text-sm mb-1 block">VAT Applicable</label>
              <select
                className="select"
                value={editRow?.vatApplicable === undefined ? "" : editRow.vatApplicable ? "yes" : "no"}
                onChange={(e) =>
                  setEditRow((r: any) => ({
                    ...r,
                    vatApplicable: e.target.value === "" ? undefined : e.target.value === "yes",
                  }))
                }
              >
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm mb-1 block">Remarks</label>
              <textarea
                className="textarea"
                rows={3}
                value={editRow?.remarks ?? ""}
                onChange={(e) => setEditRow((r: any) => ({ ...r, remarks: e.target.value }))}
              />
            </div>
          </form>
          </div>
        </Modal>
      )}
    </div>
  );
}