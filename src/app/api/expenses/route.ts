import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function safeJson<T>(data: T) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

/**
 * GET /api/expenses
 */
export async function GET() {
  try {
    const prismaAny = prisma as any;
    const rows = await prismaAny.expense.findMany({
      orderBy: { id: "desc" },
      include: { sales_person: true, customer: true },
    });
    return NextResponse.json(safeJson(rows));
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/expenses
 * Preferred body: { date, salesPersonId, customerId, amount, category, remarks }
 * If IDs are not provided, you may pass names which must exist.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { date, salesPersonId, customerId, amount, category, remarks, salesperson, customer } =
      body || {};

    const d = date ? new Date(date) : new Date();
    const amt = Number(amount ?? 0);
    const cat = category ?? "General";

    const prismaAny = prisma as any;

    let spId: bigint | undefined =
      salesPersonId != null ? BigInt(salesPersonId) : undefined;
    let custId: bigint | undefined =
      customerId != null ? BigInt(customerId) : undefined;

    if (!spId && salesperson) {
      const sp = await prismaAny.sales_person.findFirst({ where: { name: salesperson } });
      if (!sp) return NextResponse.json({ error: `Sales person "${salesperson}" not found` }, { status: 400 });
      spId = BigInt(sp.id);
    }

    if (!custId && customer) {
      const c = await prismaAny.customer.findFirst({ where: { name: customer } });
      if (!c) return NextResponse.json({ error: `Customer "${customer}" not found` }, { status: 400 });
      custId = BigInt(c.id);
    }

    if (!spId || !custId) {
      return NextResponse.json(
        { error: "salesPersonId and customerId are required" },
        { status: 400 }
      );
    }

    const created = await prismaAny.expense.create({
      data: {
        expense_date: d,
        expense_amount: amt,
        category: cat,
        remarks: remarks ?? null,
        sales_person_id: spId,
        customer_id: custId,
      },
      include: { sales_person: true, customer: true },
    });

    return NextResponse.json(safeJson(created), { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Failed to create expense" },
      { status: 500 }
    );
  }
}

// DELETE /api/expenses?id=123
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await (prisma as any).expense.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to delete expense" }, { status: 500 });
  }
}
