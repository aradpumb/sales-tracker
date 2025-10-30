import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

// POST /api/admin/machine-model/bulk
// Body: { rows: [{ model_name, hashrate?, power?, price?, algorithm, coin }, ...] }
export async function POST(req: Request) {
  try {
    const { rows } = (await req.json()) ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }
    const prismaAny = prisma as any;

    const toNum = (v: any): number | undefined => {
      if (v == null) return undefined;
      const s = String(v).trim();
      const m = s.match(/[-+]?\d[\d,]*(\.\d+)?/);
      if (!m) return undefined;
      const cleaned = m[0].replace(/,/g, "");
      const n = parseFloat(cleaned);
      return isFinite(n) ? n : undefined;
    };

    const created: any[] = [];
    const failed: Array<{ row: any; error: string }> = [];

    for (const r of rows) {
      if (!r?.model_name) {
        failed.push({ row: r, error: "Missing model_name" });
        continue;
      }

      try {
        const c = await prismaAny.machine_model.create({
          data: {
            model_name: String(r.model_name),
            hashrate: toNum(r.hashrate),
            power: toNum(r.power),
            price: toNum(r.price),
            algorithm: typeof r.algorithm === "string" ? r.algorithm.trim() : String(r.algorithm ?? ""),
            coin: typeof r.coin === "string" ? r.coin.trim() : String(r.coin ?? ""),
          },
          select: {
            id: true,
            model_name: true,
            hashrate: true,
            power: true,
            price: true,
            algorithm: true,
            coin: true,
          },
        });
        created.push(c);
      } catch (err: any) {
        failed.push({ row: r, error: err?.message ?? "create failed" });
      }
    }

    return NextResponse.json({ created, failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Bulk insert failed" }, { status: 500 });
  }
}
