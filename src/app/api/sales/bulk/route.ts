import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function safeJson<T>(data: T) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// Accepts ISO, dd/mm/yyyy, mm/dd/yyyy, and Excel serials
function parseDateAny(val: any): Date | null {
  if (val == null || val === "") return null;
  if (typeof val === "number" || /^\d+(\.\d+)?$/.test(String(val).trim())) {
    const serial = Number(val);
    if (isFinite(serial) && serial > 0) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    let day: number, month: number;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { day = b; month = a; }
    else { day = a; month = b; }
    const d = new Date(y, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * POST /api/sales/bulk
 * Body: { rows: Array<{
 *   date: string,
 *   salesPersonId?: number,
 *   customerId?: number,
 *   machineModelId?: number,
 *   salesperson?: string,
 *   customer?: string,
 *   machineModel?: string,
 *   purchasedPrice?: number,
 *   soldPrice?: number,
 *   additionalRevenue?: number,
 *   quantity?: number,
 *   totalAmount?: number,
 *   paymentStatus?: string,
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

    const [salesPersons, customers, machineModels] = await Promise.all([
      prismaAny.sales_person.findMany({ select: { id: true, name: true } }),
      prismaAny.customer.findMany({ select: { id: true, name: true } }),
      prismaAny.machine_model.findMany({ select: { id: true, model_name: true } }),
    ]);
    const spByName = new Map<string, bigint>();
    for (const s of salesPersons) spByName.set(String(s.name), BigInt(s.id));
    const custByName = new Map<string, bigint>();
    for (const c of customers) custByName.set(String(c.name), BigInt(c.id));
    const mmByName = new Map<string, bigint>();
    for (const m of machineModels) mmByName.set(String(m.model_name), BigInt(m.id));

    const created: any[] = [];
    const errors: any[] = [];

    // Create rows sequentially to avoid long-running interactive transaction timeouts
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      try {
        const d = r.date ? (parseDateAny(r.date) ?? new Date()) : new Date();
        const qty = Number(r.quantity ?? 1);
        const purchased = Number(r.purchasedPrice ?? 0);
        const sold = Number(r.soldPrice ?? 0);
        const addRev = Number(r.additionalRevenue ?? 0);
        const total = Number(r.totalPrice ?? (sold + addRev) * qty);
        const status = r.paymentStatus ?? "Pending";

        const purchasedDateParsed = r.purchasedDate ? parseDateAny(r.purchasedDate) : null;

        let spId: bigint | undefined =
          r.salesPersonId != null ? BigInt(r.salesPersonId) : undefined;
        let custId: bigint | undefined =
          r.customerId != null ? BigInt(r.customerId) : undefined;
        let modelId: bigint | undefined =
          r.machineModelId != null ? BigInt(r.machineModelId) : undefined;

        if (!spId && r.salesperson) spId = spByName.get(String(r.salesperson));
        if (!custId && r.customer) custId = custByName.get(String(r.customer));
        if (!modelId && r.machineModel) modelId = mmByName.get(String(r.machineModel));

        if (!spId || !custId) {
          errors.push({
            index: i,
            error: "Missing related id(s). Ensure salesPersonId and customerId are set or names match existing rows.",
          });
          continue;
        }

        const commissionVal =
          (r as any).commission ??
          (r as any).Commission ??
          null;

        // Parse decimal-like strings safely (e.g., "3,000" -> 3000)
        const toDecimalOrNull = (v: any): number | null => {
          if (v == null || v === "") return null;
          const s = String(v).replace(/,/g, "").trim();
          const n = Number(s);
          return isFinite(n) ? n : null;
        };

        const unit_installation_charge =
          (r as any).unitInstallationCharge != null
            ? Number((r as any).unitInstallationCharge)
            : (r as any).installationCost != null
            ? Number((r as any).installationCost)
            : null;

        const row = await (prismaAny as any).sale.create({
          data: {
            sales_date: d,
            quantity: qty,
            remarks: r.remarks ?? null,

            unit_purchase_price: purchased,
            unit_sales_price: sold,
            additional_revenue: addRev,
            invoice_number: r.invoiceNumber ?? null,
            procurement_incharge: (r as any).procurementIncharge ?? (r as any).procurementPerson ?? null,

            hosting_rate: (r as any).hostingRate != null ? Number((r as any).hostingRate) : null,
            pickup_cost: (r as any).pickupCost != null ? Number((r as any).pickupCost) : null,
            courier_charge:
              (r as any).courierCharge != null
                ? Number((r as any).courierCharge)
                : (r as any).transportFee != null
                ? Number((r as any).transportFee)
                : null,
            receipt_date: (r as any).receiptDate ? parseDateAny((r as any).receiptDate) : null,
            receipt_account: (r as any).receiptAccount ?? null,
            delivery_date: (r as any).deliveryDate ? parseDateAny((r as any).deliveryDate) : null,
            plugin_date: (r as any).pluginDate ? parseDateAny((r as any).pluginDate) : null,

            commission: commissionVal != null ? Number(commissionVal) : null,
            purchase_date: purchasedDateParsed,
            vat: r.vat != null ? Number(r.vat) : null,
            unit_installation_charge,
            vendor: (r as any).vendor ?? (r as any).supplier ?? null,

            sales_person_id: spId,
            customer_id: custId,
            ...(modelId ? { machine_model_id: modelId } : {}),
          },
          include: {
            sales_person: true,
            customer: true,
            machine_model: true,
          },
        });
        created.push(row);
      } catch (err: any) {
        errors.push({ index: i, error: err?.message ?? "Create failed" });
      }
    }

    return NextResponse.json(safeJson({ created, errors }), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Bulk sales insert failed" }, { status: 500 });
  }
}
