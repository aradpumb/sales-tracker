import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function safeJson<T>(data: T) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// GET /api/admin/machine-model
export async function GET() {
  try {
    const prismaAny = prisma as any;
    const rows = await prismaAny.machine_model.findMany({
      orderBy: { id: "asc" },
    });
    return NextResponse.json(safeJson(rows));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to fetch machine models" }, { status: 500 });
  }
}

// POST /api/admin/machine-model
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { model_name, hashrate, power, price, algorithm, coin } = body || {};
    if (!model_name) return NextResponse.json({ error: "model_name is required" }, { status: 400 });
    if (!algorithm) return NextResponse.json({ error: "algorithm is required" }, { status: 400 });
    if (!coin) return NextResponse.json({ error: "coin is required" }, { status: 400 });

    const prismaAny = prisma as any;
    const created = await prismaAny.machine_model.create({
      data: {
        model_name,
        hashrate: hashrate != null ? Number(hashrate) : null,
        power: power != null ? Number(power) : null,
        price: price != null ? Number(price) : null,
        algorithm,
        coin,
      },
    });

    return NextResponse.json(safeJson(created), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to create machine model" }, { status: 500 });
  }
}

// PUT /api/admin/machine-model
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, model_name, hashrate, power, price, algorithm, coin } = body || {};
    if (id == null) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const prismaAny = prisma as any;
    const updated = await prismaAny.machine_model.update({
      where: { id: BigInt(id) },
      data: {
        ...(model_name !== undefined ? { model_name } : {}),
        ...(hashrate !== undefined ? { hashrate: hashrate != null ? Number(hashrate) : null } : {}),
        ...(power !== undefined ? { power: power != null ? Number(power) : null } : {}),
        ...(price !== undefined ? { price: price != null ? Number(price) : null } : {}),
        ...(algorithm !== undefined ? { algorithm } : {}),
        ...(coin !== undefined ? { coin } : {}),
      },
    });

    return NextResponse.json(safeJson(updated));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to update machine model" }, { status: 500 });
  }
}

// DELETE /api/admin/machine-model?id=123
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await (prisma as any).machine_model.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to delete machine model" }, { status: 409 });
  }
}
