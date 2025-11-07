import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

// POST /api/admin/customer/bulk
// Body: { rows: [{ name, account_manager?, status?, email?, contact? }, ...] }
export async function POST(req: Request) {
  try {
    const { rows } = (await req.json()) ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }
    const prismaAny = prisma as any;

    const validRows: any[] = [];
    const failed: Array<{ row: any; error: string }> = [];

    // First pass: validate all rows and prepare data
    for (const r of rows) {
      if (!r?.name) {
        failed.push({ row: r, error: "Missing required name" });
        continue;
      }

      // Ensure non-nullable fields are provided:
      // - account_manager and status are non-nullable in the schema, so default to empty string when missing.
      // - email is non-nullable and unique; generate a unique placeholder when not provided to avoid unique/NOT NULL errors.
      const accountManagerSafe = r.account_manager ?? "";
      const statusSafe = r.status ?? "";
      const emailSafe =
        r.email && String(r.email).trim().length > 0
          ? String(r.email)
          : `imported+${Date.now()}${Math.random().toString(36).slice(2, 6)}@import.local`;

      // Truncate contact to fit DB column (VARCHAR(50))
      const contactRaw = r.contact ?? null;
      const contactSafe = contactRaw && typeof contactRaw === "string" ? contactRaw.slice(0, 50) : null;

      validRows.push({
        name: r.name,
        account_manager: accountManagerSafe,
        status: statusSafe,
        email: emailSafe,
        contact: contactSafe,
      });
    }

    let created: any[] = [];

    // Bulk insert valid rows
    if (validRows.length > 0) {
      try {
        const result = await prismaAny.customer.createMany({
          data: validRows,
          skipDuplicates: true, // Skip rows that would cause unique constraint violations
        });

        // Fetch the created records to return them
        // Note: createMany doesn't return the created records, so we need to fetch them
        const createdRecords = await prismaAny.customer.findMany({
          where: {
            email: {
              in: validRows.map(r => r.email)
            }
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

        // Convert BigInt to string to avoid serialization issues
        created = createdRecords.map((record: any) => ({
          ...record,
          id: record.id.toString(), // Convert BigInt to string
        }));

        console.log(`Bulk created ${result.count} customers`);
      } catch (err: any) {
        console.error("Bulk insert failed:", err);
        return NextResponse.json({ error: `Bulk insert failed: ${err.message}` }, { status: 500 });
      }
    }

    // Return both created and failed rows so client can show summary
    return NextResponse.json({ created, failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Bulk insert failed" }, { status: 500 });
  }
}
