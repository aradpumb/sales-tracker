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

    const validRows: any[] = [];
    const failed: Array<{ row: any; error: string }> = [];

    // First pass: validate all rows and prepare data
    for (const r of rows) {
      if (!r?.model_name) {
        failed.push({ row: r, error: "Missing model_name" });
        continue;
      }

      const modelData = {
        model_name: String(r.model_name),
        hashrate: toNum(r.hashrate),
        power: toNum(r.power),
        price: toNum(r.price),
        algorithm: typeof r.algorithm === "string" ? r.algorithm.trim() : String(r.algorithm ?? ""),
        coin: typeof r.coin === "string" ? r.coin.trim() : String(r.coin ?? ""),
      };

      validRows.push(modelData);
    }

    let created: any[] = [];

    // Bulk insert valid rows
    if (validRows.length > 0) {
      try {
        const result = await prismaAny.machine_model.createMany({
          data: validRows,
          skipDuplicates: true, // Skip rows that would cause unique constraint violations
        });

        // Fetch the created records to return them
        // Note: createMany doesn't return the created records, so we need to fetch them
        const createdRecords = await prismaAny.machine_model.findMany({
          where: {
            model_name: {
              in: validRows.map(r => r.model_name)
            }
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

        // Convert BigInt to string to avoid serialization issues
        created = createdRecords.map((record: any) => ({
          ...record,
          id: record.id.toString(), // Convert BigInt to string
        }));

        console.log(`Bulk created ${result.count} machine models`);
      } catch (err: any) {
        console.error("Bulk insert failed:", err);
        return NextResponse.json({ error: `Bulk insert failed: ${err.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ created, failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Bulk insert failed" }, { status: 500 });
  }
}
