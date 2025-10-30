"use client";

import React from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import FileUpload from "@/components/ui/FileUpload";
import { DataTable, Column } from "@/components/ui/DataTable";
import { ExpenseRecord } from "@/lib/types";
import { loadExpenses, saveExpenses } from "@/lib/storage";
import { mapExpenseRows } from "@/lib/csv";
import { useSession } from "next-auth/react";

function currency(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

type MasterSalesPerson = { id: number; name: string };
type MasterCustomer = { id: number; name: string };

type ExpenseForm = {
  date: string;
  salesPersonId?: number;
  customerId?: number;
  amount: number;
  category: string;
  remarks?: string;
};

const defaultForm: ExpenseForm = {
  date: new Date().toISOString().slice(0, 10),
  salesPersonId: undefined,
  amount: 0,
  category: "General",
  remarks: "",
};

function mapDbExpenseToRecord(row: any): ExpenseRecord {
  return {
    id: String(row?.id ?? crypto.randomUUID()),
    date: new Date(row?.expense_date ?? row?.date ?? row?.created_at ?? Date.now()).toISOString(),
    salesperson: row?.sales_person?.name ?? row?.salesperson ?? "",
    amount: Number(row?.expense_amount ?? row?.amount ?? 0),
    category: row?.category ?? "General",
    remarks: row?.remarks ?? "",
  };
}

export default function ExpensesPage() {
  const { data: session } = useSession();
  const isAdmin = (session as any)?.user?.role === "ADMIN";


  const [records, setRecords] = React.useState<ExpenseRecord[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<ExpenseForm>({ ...defaultForm });
  const [salesPersons, setSalesPersons] = React.useState<MasterSalesPerson[]>([]);
  const [customers, setCustomers] = React.useState<MasterCustomer[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const [mastersRes, expRes] = await Promise.all([
          fetch("/api/masters", { cache: "no-store" }),
          fetch("/api/expenses", { cache: "no-store" }),
        ]);

        if (mastersRes.ok) {
          const masters = await mastersRes.json();
          setSalesPersons(masters.salesPersons || []);
          setCustomers(masters.customers || []);
        }

        if (expRes.ok) {
          const rows = await expRes.json();
          const mapped = (rows as any[]).map((row: any) => {
            const r = mapDbExpenseToRecord(row);
            return { ...r, customer: row?.customer?.name ?? r.customer };
          });
          setRecords(mapped);
          saveExpenses(mapped);
        } else {
          setRecords(loadExpenses());
        }
      } catch {
        setRecords(loadExpenses());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    saveExpenses(records);
  }, [records]);

  function addRecord(r: Omit<ExpenseRecord, "id">) {
    setRecords((prev) => [{ id: crypto.randomUUID(), ...r }, ...prev]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.salesPersonId) {
      alert("Please select a salesperson");
      return;
    }

    const payload = {
      date: form.date,
      salesPersonId: form.salesPersonId,
      customerId: form.customerId,
      amount: form.amount,
      category: form.category,
      remarks: form.remarks,
    };

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create expense");
      const created = await res.json();
      const mapped = mapDbExpenseToRecord(created);
      setRecords((prev) => [mapped, ...prev]);
    } catch {
      const spName = salesPersons.find((s) => s.id === form.salesPersonId)?.name || "";
      const custName = customers.find((c) => c.id === form.customerId)?.name || "";
      addRecord({
        date: new Date(form.date).toISOString(),
        salesperson: spName,
        customer: custName,
        amount: form.amount,
        category: form.category,
        remarks: form.remarks,
      });
    } finally {
      setOpen(false);
      setForm({ ...defaultForm });
    }
  }

  async function onCsv(rows: Record<string, any>[]) {
    const mapped = mapExpenseRows(rows);
    if (mapped.length === 0) return;

    // Optimistic UI
    setRecords((prev) => [
      ...mapped.map((r) => ({ ...r, id: crypto.randomUUID() })),
      ...prev,
    ]);

    const bulkRows = mapped.map((r) => {
      const sp = salesPersons.find((s) => s.name === r.salesperson);
      const cu = customers.find((c) => c.name === r.customer);
      return {
        date: r.date,
        salesPersonId: sp?.id,
        salesperson: r.salesperson,
        customerId: cu?.id,
        customer: r.customer,
        amount: r.amount,
        category: r.category,
        remarks: r.remarks,
      };
    });

    try {
      const res = await fetch("/api/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bulkRows }),
      });
      if (res.ok) {
        const { created } = await res.json();
        if (Array.isArray(created) && created.length) {
          const mappedCreated = created.map(mapDbExpenseToRecord);
          setRecords((prev) => [...mappedCreated, ...prev]);
        }
      }
    } catch {
      // ignore
    }
  }

  async function onDeleteExpense(id: string) {
    const ok = confirm("Delete this expense? This cannot be undone.");
    if (!ok) return;
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to delete expense");
      }
      setRecords((prev) => prev.filter((r) => String((r as any).id) !== String(id)));
    } catch (e: any) {
      alert(e?.message || "Failed to delete expense");
    }
  }

  const columns: Column<ExpenseRecord>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (r) => new Date(r.date).toLocaleDateString(),
    },
    { key: "salesperson", header: "Salesperson", sortable: true },
    { key: "customer", header: "Customer", sortable: true },
    { key: "amount", header: "Expense Amount", sortable: true, render: (r) => currency(r.amount) },
    { key: "category", header: "Category", sortable: true },
    { key: "remarks", header: "Remarks" },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        isAdmin ? (
          <button
            className="h-9 px-3 rounded-lg border border-[var(--border)] hover:bg-red-50 text-red-600"
            title="Delete"
            aria-label="Delete"
            onClick={() => onDeleteExpense((r as any).id as any)}
          >
            🗑️
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-title">Expenses</h1>
        <p className="text-[var(--muted)] mt-1">Track operational costs and fees</p>
      </div>

      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          {isAdmin ? (
            <>
              <FileUpload label="Upload Expenses CSV" onParsed={onCsv} />
              <a
                href="/samples/expenses_sample.csv"
                download
                className="text-sm text-[var(--muted)] underline hover:no-underline"
              >
                click here to download sample csv
              </a>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? <Button onClick={() => setOpen(true)}>Add Expense</Button> : null}
        </div>
      </div>

      <DataTable columns={columns} data={records} loading={loading} initialSort={{ key: "date", direction: "desc" }} />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Expense"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="expense-form" type="submit">
              Save
            </Button>
          </>
        }
      >
        <form id="expense-form" onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  salesPersonId: Number(e.target.value) || undefined,
                }))
              }
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

          <div>
            <label className="text-sm mb-1 block">Expense Amount</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
            />
          </div>

          <div>
            <label className="text-sm mb-1 block">Category</label>
            <input
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Remarks</label>
            <textarea
              className="textarea"
              rows={3}
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
