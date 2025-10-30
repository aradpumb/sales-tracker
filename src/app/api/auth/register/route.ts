import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

// Minimal register. In production, protect this (admin-only).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, role } = body || {};
    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }
    const exists = await (prisma as any).user.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: "email already exists" }, { status: 409 });

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await (prisma as any).user.create({
      data: {
        name: name ?? null,
        email,
        passwordHash,
        role: role === "ADMIN" ? "ADMIN" : "USER",
      },
    });
    return NextResponse.json({ id: Number(created.id), email: created.email, role: created.role }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "failed to register" }, { status: 500 });
  }
}
