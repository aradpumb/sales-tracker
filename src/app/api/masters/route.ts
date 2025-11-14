import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function safeJson<T>(data: T) {
  // Convert BigInt to number/string for JSON
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function GET() {
  try {
    const prismaAny = prisma as any;

    const [salesPersons, customers, machineModels] = await Promise.all([
      prismaAny.sales_person.findMany({
        select: {
          id: true,
          name: true,
          image_url: true,
          role: true,
          salary: true,
          exclude_from_commission: true,
        },
        orderBy: { name: "asc" },
      }),
      prismaAny.customer.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prismaAny.machine_model.findMany({
        select: { id: true, model_name: true, price: true },
        orderBy: { model_name: "asc" },
      }),
    ]);

    return NextResponse.json(
      safeJson({ salesPersons, customers, machineModels })
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Failed to load masters" },
      { status: 500 }
    );
  }
}
