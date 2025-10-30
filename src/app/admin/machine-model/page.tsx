"use client";

import React from "react";
import { DataTable, Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import FileUpload from "@/components/ui/FileUpload";
import { mapMachineModelRows } from "@/lib/csv";

type Row = {
  id: number;
  model_name: string;
  hashrate?: number | string | null;
  power?: number | string | null;
  price?: number | string | null;
  algorithm: string;
  coin: string;
};

function currency(n: any) {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(num);
}

export default function MachineModelPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({
    model_name: "",
    hashrate: "",
    power: "",
    price: "",
    algorithm: "",
    coin: "",
  });

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/machine-model", { cache: "no-store" });
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
    { key: "model_name", header: "Model Name", sortable: true },
    { key: "hashrate", header: "Hashrate", sortable: true },
    { key: "power", header: "Power", sortable: true },
    { key: "price", header: "Price", sortable: true, render: (r) => currency(r.price) },
    { key: "algorithm", header: "Algorithm", sortable: true },
    { key: "coin", header: "Coin", sortable: true },
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
              const ok = confirm("Delete this machine model? This cannot be undone.");
              if (!ok) return;
              const res = await fetch(`/api/admin/machine-model?id=${r.id}`, { method: "DELETE" });
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
      const res = await fetch("/api/admin/machine-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: form.model_name,
          hashrate: form.hashrate ? Number(form.hashrate) : undefined,
          power: form.power ? Number(form.power) : undefined,
          price: form.price ? Number(form.price) : undefined,
          algorithm: form.algorithm,
          coin: form.coin,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setRows((prev) => [...prev, created]);
      setOpen(false);
      setForm({ model_name: "", hashrate: "", power: "", price: "", algorithm: "", coin: "" });
    } catch {
      // no-op
    }
  }

  async function onCsv(rowsCsv: Record<string, any>[]) {
    const mapped = mapMachineModelRows(rowsCsv);
    if (!mapped.length) return;

    try {
      const res = await fetch("/api/admin/machine-model/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Bulk upload failed");
      }
      const json = await res.json();
      const created = Array.isArray(json) ? json : json.created ?? [];
      setRows((prev) => [...prev, ...created]);
      const failedCount = Array.isArray(json.failed) ? json.failed.length : 0;
      alert(`Imported ${created.length} machine models.${failedCount ? ` ${failedCount} failed.` : ""}`);
    } catch (e: any) {
      alert(e?.message || "Failed to import CSV");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Machine Model</h1>
          <p className="text-[var(--muted)] text-sm">Supported mining machine models</p>
        </div>
        <div className="flex items-center gap-2">
          <FileUpload label="Upload CSV" onParsed={onCsv} />
          <Button onClick={() => setOpen(true)}>Add Machine Model</Button>
        </div>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} initialSort={{ key: "id", direction: "asc" }} />

      <Modal open={open} onClose={() => setOpen(false)} title="Add Machine Model" footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button form="mm-form" type="submit">Save</Button>
        </>
      }>
        <form id="mm-form" onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Model Name</label>
            <input className="input" value={form.model_name} onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm mb-1 block">Hashrate</label>
            <input type="number" step="0.000001" className="input" value={form.hashrate} onChange={(e) => setForm((f) => ({ ...f, hashrate: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Power</label>
            <input type="number" step="0.000001" className="input" value={form.power} onChange={(e) => setForm((f) => ({ ...f, power: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Price</label>
            <input type="number" step="0.01" className="input" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Algorithm</label>
            <input className="input" value={form.algorithm} onChange={(e) => setForm((f) => ({ ...f, algorithm: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm mb-1 block">Coin</label>
            <input className="input" value={form.coin} onChange={(e) => setForm((f) => ({ ...f, coin: e.target.value }))} required />
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Machine Model" footer={
        <>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button form="mm-edit-form" type="submit">Update</Button>
        </>
      }>
        <form
          id="mm-edit-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editRow) return;
            try {
              const res = await fetch("/api/admin/machine-model", {
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
            <label className="text-sm mb-1 block">Model Name</label>
            <input
              className="input"
              value={editRow?.model_name ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, model_name: e.target.value } : r))}
              required
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Hashrate</label>
            <input
              type="number"
              step="0.000001"
              className="input"
              value={(editRow?.hashrate as any) ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, hashrate: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Power</label>
            <input
              type="number"
              step="0.000001"
              className="input"
              value={(editRow?.power as any) ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, power: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Price</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={(editRow?.price as any) ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, price: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Algorithm</label>
            <input
              className="input"
              value={editRow?.algorithm ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, algorithm: e.target.value } : r))}
              required
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Coin</label>
            <input
              className="input"
              value={editRow?.coin ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, coin: e.target.value } : r))}
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
