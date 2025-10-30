import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "ADMIN";
}

// GET /api/admin/users — list users (admin only)
export async function GET() {
  const session = await getServerSession(authOptions as any);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await (prisma as any).user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      created_at: true,
    },
    orderBy: { created_at: "desc" },
  });
  const safe = JSON.parse(
    JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
  return NextResponse.json(safe);
}

// POST /api/admin/users — create a new user (admin only)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const { name, email, password, role } = body || {};
  if (!email || !password || !["ADMIN", "USER"].includes(role)) {
    return NextResponse.json({ error: "name, email, password, role required" }, { status: 400 });
  }
  const exists = await (prisma as any).user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "email already exists" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await (prisma as any).user.create({
    data: {
      name: name ?? null,
      email,
      passwordHash,
      role,
    },
    select: { id: true, name: true, email: true, role: true, created_at: true },
  });

  const safe = JSON.parse(
    JSON.stringify(created, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
  return NextResponse.json(safe, { status: 201 });
}

// PUT /api/admin/users — update user (admin only)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const { id, name, email, role, password } = body || {};
  if (id == null) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (role !== undefined) {
    if (!["ADMIN", "USER"].includes(role)) {
      return NextResponse.json({ error: "role must be ADMIN or USER" }, { status: 400 });
    }
    data.role = role;
  }
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const updated = await (prisma as any).user.update({
    where: { id: BigInt(id) },
    data,
    select: { id: true, name: true, email: true, role: true, created_at: true },
  });

  const safe = JSON.parse(
    JSON.stringify(updated, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
  return NextResponse.json(safe);
}

// DELETE /api/admin/users — delete a user (admin only)
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await (prisma as any).user.delete({ where: { id: BigInt(id) } });
  return NextResponse.json({ ok: true });
}
