"use client";

import React from "react";
import { DataTable, Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

type Row = {
  id: number;
  name: string;
  phone?: string | null;
  joining_date?: string | null;
  salary?: number | string | null;
  allowance?: number | string | null;
  image_url?: string | null;
  role?: string | null;
  exclude_from_commission?: boolean | null;
};

function currency(n: any) {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(num);
}

export default function SalesPersonPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    joining_date: "",
    salary: "",
    allowance: "",
    image_url: "",
    role: "",
    exclude_from_commission: false,
  });

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/sales-person", { cache: "no-store" });
        if (res.ok) setRows(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<Row | null>(null);

  const columns: Column<Row>[] = [
    {
      key: "image_url",
      header: "Photo",
      render: (r) =>
        r.image_url ? (
          <img src={r.image_url} alt={r.name} className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs">
            {r.name?.[0]?.toUpperCase() ?? "?"}
          </div>
        ),
    },
    { key: "name", header: "Name", sortable: true },
    { key: "role", header: "Role", sortable: true },
    { key: "phone", header: "Phone", sortable: true },
    {
      key: "joining_date",
      header: "Joining Date",
      sortable: true,
      render: (r) => (r.joining_date ? new Date(r.joining_date).toLocaleDateString() : ""),
    },
    { key: "salary", header: "Salary", sortable: true, render: (r) => currency(r.salary) },
    { key: "allowance", header: "Monthly Allowance", sortable: true, render: (r) => currency(r.allowance) },
    { key: "exclude_from_commission", header: "Exclude From Commission", sortable: true, render: (r) => (r.exclude_from_commission ? "Yes" : "No") },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary h-9" onClick={() => { setEditRow(r); setEditOpen(true); }}>
            Edit
          </button>
          <button
            className="h-9 px-3 rounded-lg border border-[var(--border)] hover:bg-red-50 text-red-600"
            title="Delete"
            aria-label="Delete"
            onClick={() => onDelete(r.id)}
          >
            🗑️
          </button>
        </div>
      ),
    },
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/sales-person", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || undefined,
          joining_date: form.joining_date || undefined,
          salary: form.salary ? Number(form.salary) : undefined,
          allowance: form.allowance ? Number(form.allowance) : undefined,
          imageUrl: form.image_url || undefined,
          role: form.role || undefined,
          excludeFromCommission: Boolean(form.exclude_from_commission),
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setRows((prev) => [...prev, created]);
      setOpen(false);
      setForm({ name: "", phone: "", joining_date: "", salary: "", allowance: "", image_url: "", role:"", exclude_from_commission: false });
    } catch {
      // no-op
    }
  }

  async function onDelete(id: number) {
    const ok = confirm("Delete this sales person? This cannot be undone.");
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/sales-person?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to delete");
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(e?.message || "Failed to delete");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Person</h1>
          <p className="text-[var(--muted)] text-sm">Directory of your sales team</p>
        </div>
        <Button onClick={() => setOpen(true)}>Add Sales Person</Button>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} initialSort={{ key: "id", direction: "asc" }} />

      <Modal open={open} onClose={() => setOpen(false)} title="Add Sales Person" footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button form="sp-form" type="submit">Save</Button>
        </>
      }>
        <form id="sp-form" onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm mb-1 block">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm mb-1 block">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Joining Date</label>
            <input type="date" className="input" value={form.joining_date} onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Salary</label>
            <input type="number" step="0.01" className="input" value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Monthly Allowance</label>
            <input type="number" step="0.01" className="input" value={form.allowance} onChange={(e) => setForm((f) => ({ ...f, allowance: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Image URL</label>
            <input className="input" placeholder="https://..." value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Role</label>
            <input className="input" placeholder="Sales Executive" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="checkbox"
                checked={!!form.exclude_from_commission}
                onChange={(e) => setForm((f) => ({ ...f, exclude_from_commission: e.target.checked }))}
              />
              <span>Exclude From Commission</span>
            </label>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Sales Person" footer={
        <>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button form="sp-edit-form" type="submit">Update</Button>
        </>
      }>
        <form
          id="sp-edit-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editRow) return;
            try {
              const payload = {
                id: editRow.id,
                name: editRow.name,
                phone: editRow.phone,
                joining_date: editRow.joining_date,
                salary: editRow.salary !== "" && editRow.salary != null ? Number(editRow.salary as any) : undefined,
                allowance: editRow.allowance !== "" && editRow.allowance != null ? Number(editRow.allowance as any) : undefined,
                // Map snake_case -> camelCase for API
                imageUrl: editRow.image_url || undefined,
                role: editRow.role || undefined,
                excludeFromCommission: editRow.exclude_from_commission,
              };
              const res = await fetch("/api/admin/sales-person", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (!res.ok) throw new Error();
              const updated = await res.json();
              setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
              setEditOpen(false);
            } catch {}
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <div>
            <label className="text-sm mb-1 block">Name</label>
            <input
              className="input"
              value={editRow?.name ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, name: e.target.value } : r))}
              required
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Phone</label>
            <input
              className="input"
              value={editRow?.phone ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, phone: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Joining Date</label>
            <input
              type="date"
              className="input"
              value={editRow?.joining_date ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, joining_date: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Salary</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={editRow?.salary as any ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, salary: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Monthly Allowance</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={editRow?.allowance as any ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, allowance: e.target.value } : r))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Image URL</label>
            <input
              className="input"
              placeholder="https://..."
              value={editRow?.image_url ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, image_url: e.target.value } : r))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Role</label>
            <input
              className="input"
              placeholder="Sales Executive"
              value={editRow?.role ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, role: e.target.value } : r))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="checkbox"
                checked={!!editRow?.exclude_from_commission}
                onChange={(e) => setEditRow((r) => (r ? { ...r, exclude_from_commission: e.target.checked } : r))}
              />
              <span>Exclude From Commission</span>
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
