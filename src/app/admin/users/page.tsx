"use client";

import React from "react";
import { DataTable, Column } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

type Row = {
  id: number;
  name: string | null;
  email: string;
  role: "ADMIN" | "USER";
  created_at?: string | null;
};

export default function AdminUsersPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", password: "", role: "USER" as "ADMIN" | "USER" });

  const [editOpen, setEditOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<Row | null>(null);
  const [editPwd, setEditPwd] = React.useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRows(data);
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  async function updateUser(payload: any) {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  }

  async function removeUser(id: number) {
    const ok = confirm("Delete this user? This cannot be undone.");
    if (!ok) return;
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const created = await res.json();
      setRows((prev) => [created, ...prev]);
      setAddOpen(false);
      setForm({ name: "", email: "", password: "", role: "USER" });
    }
  }

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", sortable: true, render: (r) => r.name ?? "(no name)" },
    { key: "email", header: "Email", sortable: true },
    { key: "role", header: "Role", sortable: true },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : ""),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary h-9" onClick={() => { setEditRow(r); setEditPwd(""); setEditOpen(true); }}>
            Edit
          </button>
          <button
            className="h-9 px-3 rounded-lg border border-[var(--border)] hover:bg-red-50 text-red-600"
            title="Delete"
            aria-label="Delete"
            onClick={() => removeUser(r.id)}
          >
            🗑️
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-[var(--muted)] text-sm">Manage user roles</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Add User</Button>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} initialSort={{ key: "name", direction: "asc" }} />

      {/* Add user modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-user-form" type="submit">Create</Button>
          </>
        }
      >
        <form id="add-user-form" onSubmit={onCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm mb-1 block">Password</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Role</label>
            <select className="select" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Row["role"] }))}>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button form="edit-user-form" type="submit">Update</Button>
          </>
        }
      >
        <form
          id="edit-user-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editRow) return;
            await updateUser({
              id: editRow.id,
              name: editRow.name,
              email: editRow.email,
              role: editRow.role,
              password: editPwd || undefined,
            });
            setEditOpen(false);
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">Name</label>
            <input
              className="input"
              value={editRow?.name ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, name: e.target.value } : r))}
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Email</label>
            <input
              type="email"
              className="input"
              value={editRow?.email ?? ""}
              onChange={(e) => setEditRow((r) => (r ? { ...r, email: e.target.value } : r))}
              required
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">Role</label>
            <select
              className="select"
              value={editRow?.role ?? "USER"}
              onChange={(e) => setEditRow((r) => (r ? { ...r, role: e.target.value as Row["role"] } : r))}
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm mb-1 block">New Password (optional)</label>
            <input
              type="password"
              className="input"
              value={editPwd}
              onChange={(e) => setEditPwd(e.target.value)}
              placeholder="Leave blank to keep current password"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
