import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function safeJson<T>(data: T) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

/**
 * POST /api/expenses/bulk
 * Body: { rows: Array<{
 *   date: string,
 *   salesPersonId?: number,
 *   salesperson?: string,
 *   customerId?: number,
 *   customer?: string,
 *   amount: number,
 *   category?: string,
 *   remarks?: string
 * }> }
 */
export async function POST(req: Request) {
  try {
    const { rows } = (await req.json()) ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    const prismaAny = prisma as any;

    const [salesPersons, customers] = await Promise.all([
      prismaAny.sales_person.findMany({ select: { id: true, name: true } }),
      prismaAny.customer.findMany({ select: { id: true, name: true } }),
    ]);
    const spByName = new Map<string, bigint>();
    for (const s of salesPersons) spByName.set(String(s.name), BigInt(s.id));
    const custByName = new Map<string, bigint>();
    for (const c of customers) custByName.set(String(c.name), BigInt(c.id));

    const created: any[] = [];
    const errors: any[] = [];

    await prismaAny.$transaction(
      async (tx: any) => {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i] || {};
          try {
            const d = r.date ? new Date(r.date) : new Date();
            const amt = Number(r.amount ?? 0);
            const cat = r.category ?? "General";

            let spId: bigint | undefined =
              r.salesPersonId != null ? BigInt(r.salesPersonId) : undefined;
            if (!spId && r.salesperson) spId = spByName.get(String(r.salesperson));

            let custId: bigint | undefined =
              r.customerId != null ? BigInt(r.customerId) : undefined;
            if (!custId && r.customer) custId = custByName.get(String(r.customer));

            if (!spId || !custId) {
              errors.push({
                index: i,
                error: "Missing sales person and/or customer id; ensure IDs are set or names match existing rows.",
              });
              continue;
            }

            const row = await tx.expense.create({
              data: {
                expense_date: d,
                expense_amount: amt,
                category: cat,
                remarks: r.remarks ?? null,
                sales_person_id: spId,
                customer_id: custId,
              },
              include: { sales_person: true, customer: true },
            });
            created.push(row);
          } catch (err: any) {
            errors.push({ index: i, error: err?.message ?? "Create failed" });
          }
        }
      },
      { timeout: 60000 }
    );

    return NextResponse.json(safeJson({ created, errors }), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Bulk expenses insert failed" }, { status: 500 });
  }
}
