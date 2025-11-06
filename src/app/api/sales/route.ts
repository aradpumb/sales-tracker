import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function safeJson<T>(data: T) {
  // Convert BigInt to number for JSON serialization
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
 * GET /api/sales
 */
export async function GET() {
  try {
    const prismaAny = prisma as any;
    const rows = await prismaAny.sale.findMany({
      orderBy: { id: "desc" },
      include: {
        sales_person: true,
        customer: true,
        machine_model: true,
      },
    });
    return NextResponse.json(safeJson(rows));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to fetch sales" }, { status: 500 });
  }
}

/**
 * POST /api/sales
 * Accepts either IDs (preferred) or names for related entities.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      date,
      salesPersonId,
      customerId,
      machineModelId,
      salesperson,
      customer,
      machineModel,
      // new schema payload fields (with legacy fallbacks handled below)
      purchasedPrice, // unit purchase price
      soldPrice,      // unit sales price
      installationCost, // unit installation charge
      hostingRate,
      additionalRevenue,
      quantity,
      commission,
      vat,
      pickupCost,
      courierCharge,
      receiptDate,
      receiptAccount,
      deliveryDate,
      pluginDate,
      invoiceNumber,
      procurementPerson,
      purchasedDate, // purchase date
      vendor,      // vendor
      remarks,
    } = body || {};

    const d = parseDateAny(date) ?? new Date();
    const qty = Number(quantity ?? 1);
    const purchased = Number(purchasedPrice ?? 0);
    const sold = Number(soldPrice ?? 0);
    const addRev = Number(additionalRevenue ?? 0);

    const purchasedDateParsed = body.purchasedDate ? parseDateAny(body.purchasedDate) : null;

    const prismaAny = prisma as any;

    let spId: bigint | undefined =
      salesPersonId != null ? BigInt(salesPersonId) : undefined;
    let custId: bigint | undefined =
      customerId != null ? BigInt(customerId) : undefined;
    let modelId: bigint | undefined =
      machineModelId != null ? BigInt(machineModelId) : undefined;

    // Resolve by names if IDs are not provided
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
    if (!modelId && machineModel) {
      const mm = await prismaAny.machine_model.findFirst({ where: { model_name: machineModel } });
      if (!mm) return NextResponse.json({ error: `Machine model "${machineModel}" not found` }, { status: 400 });
      modelId = BigInt(mm.id);
    }

    if (!spId || !custId) {
      return NextResponse.json(
        { error: "salesPersonId and customerId are required" },
        { status: 400 }
      );
    }

    // Map to new schema names with legacy fallbacks
    const unit_purchase_price = purchased != null ? purchased : Number(body.unit_purchase_price ?? 0);
    const unit_sales_price = sold != null ? sold : Number(body.unit_sales_price ?? 0);
    const unit_installation_charge =
      installationCost != null ? Number(installationCost) : Number(body.unit_installation_charge ?? 0);
    const hosting_rate = hostingRate != null ? Number(hostingRate) : Number(body.hosting_rate ?? 0);
    const pickup_cost = pickupCost != null ? Number(pickupCost) : Number(body.pickup_cost ?? 0);
    const courier_charge =
      courierCharge != null ? Number(courierCharge) : Number(body.courier_charge ?? body.transportFee ?? 0);
    const receipt_date_parsed = receiptDate ? parseDateAny(receiptDate) : null;
    const delivery_date_parsed = deliveryDate ? parseDateAny(deliveryDate) : null;
    const plugin_date_parsed = pluginDate ? parseDateAny(pluginDate) : null;
    const purchase_date_parsed = purchasedDate ? parseDateAny(purchasedDate) : purchasedDateParsed;

    // Resolve Bill No. from common variants; empty string becomes null
    const billNoRaw =
      body?.billNo ??
      body?.bill_no ??
      (body as any)?.["Bill No"] ??
      (body as any)?.["Bill No."] ??
      null;
    const billNo = billNoRaw != null && billNoRaw !== "" ? String(billNoRaw) : null;

    const created = await prismaAny.sale.create({
      data: {
        sales_date: d,
        quantity: qty,
        remarks: remarks ?? null,

        // new schema fields
        unit_purchase_price,
        unit_sales_price,
        additional_revenue: addRev,
        invoice_number: invoiceNumber ?? body.invoiceNumber ?? null,
        bill_no: billNo,
        procurement_incharge: procurementPerson ?? body.procurement_incharge ?? null,

        hosting_rate,
        pickup_cost,
        courier_charge,
        receipt_date: receipt_date_parsed,
        receipt_account: receiptAccount ?? body.receipt_account ?? null,
        delivery_date: delivery_date_parsed,
        plugin_date: plugin_date_parsed,

        commission: commission != null ? Number(commission) : Number(body.commission ?? 0),
        purchase_date: purchase_date_parsed,
        vat: vat != null ? Number(vat) : Number(body.vat ?? 0),
        unit_installation_charge,
        vendor: vendor ?? body.vendor ?? null,

        sales_person_id: spId,
        customer_id: custId,
        // machine model is optional in new schema
        ...(modelId ? { machine_model_id: modelId } : {}),
      },
      include: {
        sales_person: true,
        customer: true,
        machine_model: true,
      },
    });

    return NextResponse.json(safeJson(created), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to create sale" }, { status: 500 });
  }
}

/**
 * PUT /api/sales
 * Body: { id, ...fields to update }
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const prismaAny = prisma as any;

    const d = body.date ? parseDateAny(body.date) : null;
    const purchasedDateParsed = body.purchasedDate ? parseDateAny(body.purchasedDate) : null;

    const data: any = {
      // Only include provided fields (new schema)
    };
    if (d) data.sales_date = d;
    if (body.purchasedPrice != null || body.unit_purchase_price != null)
      data.unit_purchase_price = Number(body.purchasedPrice ?? body.unit_purchase_price);
    if (body.soldPrice != null || body.unit_sales_price != null)
      data.unit_sales_price = Number(body.soldPrice ?? body.unit_sales_price);
    if (body.installationCost != null || body.unit_installation_charge != null)
      data.unit_installation_charge = Number(body.installationCost ?? body.unit_installation_charge);
    if (body.additionalRevenue != null) data.additional_revenue = Number(body.additionalRevenue);
    if (body.quantity != null) data.quantity = Number(body.quantity);
    if (body.remarks != null) data.remarks = String(body.remarks);
    if (body.invoiceNumber != null) data.invoice_number = String(body.invoiceNumber);
    // Update bill_no when provided in any supported key; empty string clears to null
    if (
      Object.prototype.hasOwnProperty.call(body, "billNo") ||
      Object.prototype.hasOwnProperty.call(body, "bill_no") ||
      Object.prototype.hasOwnProperty.call(body as any, "Bill No") ||
      Object.prototype.hasOwnProperty.call(body as any, "Bill No.")
    ) {
      const raw =
        (body as any).billNo ??
        (body as any).bill_no ??
        (body as any)["Bill No"] ??
        (body as any)["Bill No."];
      data.bill_no = raw != null && raw !== "" ? String(raw) : null;
    }
    // Update bill_no when provided in any supported key; empty string clears to null
    if (
      Object.prototype.hasOwnProperty.call(body, "billNo") ||
      Object.prototype.hasOwnProperty.call(body, "bill_no") ||
      Object.prototype.hasOwnProperty.call(body as any, "Bill No") ||
      Object.prototype.hasOwnProperty.call(body as any, "Bill No.")
    ) {
      const raw =
        (body as any).billNo ??
        (body as any).bill_no ??
        (body as any)["Bill No"] ??
        (body as any)["Bill No."];
      data.bill_no = raw != null && raw !== "" ? String(raw) : null;
    }
    if (body.procurementPerson != null || body.procurement_incharge != null)
      data.procurement_incharge = String(body.procurementPerson ?? body.procurement_incharge);
    if (purchasedDateParsed) data.purchase_date = purchasedDateParsed;
    if (body.vat != null) data.vat = Number(body.vat);
    if (body.vendor != null || body.vendor != null) data.vendor = String(body.vendor ?? body.vendor);
    if (body.commission != null) data.commission = Number(body.commission);
    if (body.pickupCost != null || body.pickup_cost != null)
      data.pickup_cost = Number(body.pickupCost ?? body.pickup_cost);
    if (body.courierCharge != null || body.courier_charge != null || body.transportFee != null)
      data.courier_charge = Number(body.courierCharge ?? body.courier_charge ?? body.transportFee);
    if (body.receiptDate) data.receipt_date = parseDateAny(body.receiptDate);
    if (body.deliveryDate) data.delivery_date = parseDateAny(body.deliveryDate);
    if (body.pluginDate) data.plugin_date = parseDateAny(body.pluginDate);
    if (body.receiptAccount != null || body.receipt_account != null)
      data.receipt_account = String(body.receiptAccount ?? body.receipt_account);
    if (body.hostingRate != null || body.hosting_rate != null)
      data.hosting_rate = Number(body.hostingRate ?? body.hosting_rate);

    const updated = await prismaAny.sale.update({
      where: { id: BigInt(id) },
      data,
      include: {
        sales_person: true,
        customer: true,
        machine_model: true,
      },
    });

    return NextResponse.json(safeJson(updated), { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to update sale" }, { status: 500 });
  }
}

// DELETE /api/sales?id=123
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await (prisma as any).sale.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to delete sale" }, { status: 500 });
  }
}
