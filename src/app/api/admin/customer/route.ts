import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function safeJson<T>(data: T) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// GET /api/admin/customer
export async function GET() {
  try {
    const prismaAny = prisma as any;
    const rows = await prismaAny.customer.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        account_manager: true,
        status: true,
        email: true,
        contact: true,
      },
    });
    return NextResponse.json(safeJson(rows));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to fetch customers" }, { status: 500 });
  }
}

// POST /api/admin/customer
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, account_manager, status, email, contact } = body || {};
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const prismaAny = prisma as any;
    const created = await prismaAny.customer.create({
      data: {
        name,
        account_manager: account_manager ?? null,
        status: status ?? null,
        email: email ?? null,
        contact: contact ?? null,
      },
      select: {
        id: true,
        name: true,
        account_manager: true,
        status: true,
        email: true,
        contact: true,
      },
    });

    return NextResponse.json(safeJson(created), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to create customer" }, { status: 500 });
  }
}

// PUT /api/admin/customer
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, account_manager, status, email, contact } = body || {};
    if (id == null) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const prismaAny = prisma as any;
    const updated = await prismaAny.customer.update({
      where: { id: BigInt(id) },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(account_manager !== undefined ? { account_manager } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(contact !== undefined ? { contact } : {}),
      },
      select: {
        id: true,
        name: true,
        account_manager: true,
        status: true,
        email: true,
        contact: true,
      },
    });

    return NextResponse.json(safeJson(updated));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to update customer" }, { status: 500 });
  }
}

// DELETE /api/admin/customer?id=123
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await (prisma as any).customer.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to delete customer" }, { status: 409 });
  }
}
