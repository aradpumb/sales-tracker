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

    const created: any[] = [];
    const failed: Array<{ row: any; error: string }> = [];

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

      // Truncate contact to fit DB column (VARCHAR(20))
      const contactRaw = r.contact ?? null;
      const contactSafe = contactRaw && typeof contactRaw === "string" ? contactRaw.slice(0, 50) : null;

      try {
        const c = await prismaAny.customer.create({
          data: {
            name: r.name,
            account_manager: accountManagerSafe,
            status: statusSafe,
            email: emailSafe,
            contact: contactSafe,
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
        created.push(c);
      } catch (err: any) {
        // don't abort entire import on single row failure
        failed.push({ row: r, error: err?.message ?? "create failed" });
      }
    }

    // Return both created and failed rows so client can show summary
    return NextResponse.json({ created, failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Bulk insert failed" }, { status: 500 });
  }
}
