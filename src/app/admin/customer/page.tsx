"use client";

import React from "react";
import { DataTable, Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Papa from "papaparse";
import { mapCustomerRows } from "@/lib/csv";

type Row = {
  id: number;
  name: string;
  account_manager?: string | null;
  status?: string | null;
  email?: string | null;
  contact?: string | null;
  created_at?: string | null;
};

export default function CustomerPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", account_manager: "", status: "", contact: "", email: "" });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/customer", { cache: "no-store" });
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
      key: "id",
      header: "S/N",
      sortable: true,
      width: 80,
      render: (r) => {
        // show 1-based serial number using current rows order
        const idx = rows.findIndex((x) => x.id === r.id);
        return idx >= 0 ? idx + 1 : "";
      },
    },
    { key: "name", header: "name", sortable: true },
    { key: "account_manager", header: "Account Manager", sortable: true },
    { key: "status", header: "Status", sortable: true },
    { key: "email", header: "Email", sortable: true },
    { key: "contact", header: "Contact", sortable: true },
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
            onClick={async () => {
              const ok = confirm("Delete this customer? This cannot be undone.");
              if (!ok) return;
              const res = await fetch(`/api/admin/customer?id=${r.id}`, { method: "DELETE" });
              if (res.ok) {
                setRows((prev) => prev.filter((x) => x.id !== r.id));
              } else {
                const j = await res.json().catch(() => ({}));
                alert(j?.error || "Failed to delete");
              }
            }}
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
      const res = await fetch("/api/admin/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          account_manager: form.account_manager || undefined,
          status: form.status || undefined,
          contact: form.contact || undefined,
          email: form.email || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setRows((prev) => [...prev, created]);
      setOpen(false);
      setForm({ name: "", account_manager: "", status: "", contact: "", email: "" });
    } catch {
      // no-op
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer</h1>
          <p className="text-[var(--muted)] text-sm">All customers in your CRM</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Hidden file input for CSV upload */}
          <input
            id="csv-upload"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const parsed = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
                const rowsRaw = parsed.data ?? [];
                const mapped = mapCustomerRows(rowsRaw);

                if (!Array.isArray(mapped) || mapped.length === 0) {
                  alert("No valid customer rows found in CSV. Make sure each row has a 'name' column.");
                    if (e.currentTarget) {
                      (e.currentTarget as HTMLInputElement).value = "";
                    }
                  return;
                }

                // Client-side sanitize: ensure contact fits VARCHAR(20)
                const sanitized = mapped.map((m) => {
                  const copy: any = { ...m };
                  if (copy.contact && typeof copy.contact === "string") {
                    copy.contact = copy.contact.slice(0, 20);
                  }
                  return copy;
                });

                const res = await fetch("/api/admin/customer/bulk", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ rows: sanitized }),
                });

                if (!res.ok) {
                  const j = await res.json().catch(() => ({}));
                  throw new Error(j?.error || "CSV upload failed");
                }

                const resJson = await res.json();
                // support both legacy array response and new { created, failed } response
                let created: any[] = [];
                let failed: any[] = [];
                if (Array.isArray(resJson)) {
                  created = resJson;
                } else if (resJson && Array.isArray(resJson.created)) {
                  created = resJson.created;
                  failed = resJson.failed ?? [];
                } else {
                  // fallback: try to treat as array
                  created = Array.isArray(resJson) ? resJson : [];
                }

                if (created.length > 0) {
                  setRows((prev) => [...prev, ...created]);
                }

                alert(`Imported ${created.length} customers.${failed.length ? ` ${failed.length} rows failed.` : ""}`);
              } catch (err: any) {
                console.error(err);
                alert(err?.message || "Failed to import CSV");
              } finally {
                if (e.currentTarget) {
                  e.currentTarget.value = "";
                }
              }
            }}
          />

          <Button onClick={() => (document.getElementById("csv-upload") as HTMLInputElement | null)?.click()}>
            Upload CSV
          </Button>

          <Button onClick={() => setOpen(true)}>Add Customer</Button>
        </div>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} initialSort={{ key: "id", direction: "asc" }} />

      <Modal open={open} onClose={() => setOpen(false)} title="Add Customer" footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button form="cust-form" type="submit">Save</Button>
        </>
      }>
        <form id="cust-form" onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm mb-1 block">Account Manager</label>
            <input className="input" value={form.account_manager} onChange={(e) => setForm((f) => ({ ...f, account_manager: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Status</label>
            <input className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Contact</label>
            <input className="input" value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer" footer={
        <>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button form="cust-edit-form" type="submit">Update</Button>
        </>
      }>
        <form
          id="cust-edit-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editRow) return;
            try {
              const res = await fetch("/api/admin/customer", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editRow),
              });
              if (!res.ok) throw new Error();
              const updated = await res.json();
              setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
              setEditOpen(false);
            } catch {}
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Name</label>
            <input
              className="input"
              value={editRow?.name ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, name: e.target.value } : r))}
              required
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Account Manager</label>
            <input
              className="input"
              value={(editRow as any)?.account_manager ?? ""}
              onChange={(e) => setEditRow((r: any) => (r ? { ...r, account_manager: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Status</label>
            <input
              className="input"
              value={(editRow as any)?.status ?? ""}
              onChange={(e) => setEditRow((r: any) => (r ? { ...r, status: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Contact</label>
            <input
              className="input"
              value={(editRow as any)?.contact ?? ""}
              onChange={(e) => setEditRow((r: any) => (r ? { ...r, contact: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Email</label>
            <input
              type="email"
              className="input"
              value={(editRow as any)?.email ?? ""}
              onChange={(e) => setEditRow((r: any) => (r ? { ...r, email: e.target.value } : r))}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
