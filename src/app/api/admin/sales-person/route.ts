import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function safeJson<T>(data: T) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// GET /api/admin/sales-person
export async function GET() {
  try {
    const prismaAny = prisma as any;
    const rows = await prismaAny.sales_person.findMany({
      orderBy: { id: "asc" },
    });
    return NextResponse.json(safeJson(rows));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to fetch sales persons" }, { status: 500 });
  }
}

// POST /api/admin/sales-person
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, phone, joining_date, salary, allowance, imageUrl, role, excludeFromCommission } = body || {};
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const prismaAny = prisma as any;
    const created = await prismaAny.sales_person.create({
      data: {
        name,
        phone: phone ?? null,
        joining_date: joining_date ? new Date(joining_date) : null,
        salary: salary != null ? Number(salary) : null,
        allowance: allowance != null ? Number(allowance) : null,
        image_url: imageUrl ?? null,
        role: role ?? null,
        exclude_from_commission: excludeFromCommission === true,
      },
    });

    return NextResponse.json(safeJson(created), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to create sales person" }, { status: 500 });
  }
}

// PUT /api/admin/sales-person
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, phone, joining_date, salary, allowance, imageUrl, role, excludeFromCommission } = body || {};
    if (id == null) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const prismaAny = prisma as any;
    const updated = await prismaAny.sales_person.update({
      where: { id: BigInt(id) },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(joining_date !== undefined ? { joining_date: joining_date ? new Date(joining_date) : null } : {}),
        ...(salary !== undefined ? { salary: salary != null ? Number(salary) : null } : {}),
        ...(allowance !== undefined ? { allowance: allowance != null ? Number(allowance) : null } : {}),
        ...(imageUrl !== undefined ? { image_url: imageUrl ?? null } : {}),
        ...(role !== undefined ? { role: role ?? null } : {}),
        ...(excludeFromCommission !== undefined ? { exclude_from_commission: Boolean(excludeFromCommission) } : {}),
      },
    });
    return NextResponse.json(safeJson(updated));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to update sales person" }, { status: 500 });
  }
}

// DELETE /api/admin/sales-person?id=123
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await (prisma as any).sales_person.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Likely foreign key constraint
    return NextResponse.json({ error: e.message ?? "Failed to delete sales person" }, { status: 409 });
  }
}
