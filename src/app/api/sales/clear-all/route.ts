import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * DELETE /api/sales/clear-all
 * Deletes all sales records from the database
 */
export async function DELETE() {
  try {
    const prismaAny = prisma as any;

    // Delete all sales records
    const result = await prismaAny.sale.deleteMany({});

    return NextResponse.json({ 
      success: true, 
      deletedCount: result.count,
      message: `Successfully deleted ${result.count} sales records`
    });
  } catch (e: any) {
    console.error("Error clearing all sales:", e);
    return NextResponse.json({ 
      error: e.message ?? "Failed to clear all sales data" 
    }, { status: 500 });
  }
}
