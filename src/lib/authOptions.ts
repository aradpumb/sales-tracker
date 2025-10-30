import { PrismaAdapter } from "@next-auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import type { AuthOptions } from "next-auth";
import prismaClient from "@/lib/prisma";
import bcrypt from "bcryptjs";

// We import the PrismaClient from our generated path via prisma.ts (singleton)
const prisma: any = prismaClient;

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
        strategy: "jwt", // required for credentials
    },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds) => {
        if (!creds?.email || !creds?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: String(creds.email) },
        });
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(String(creds.password), user.passwordHash);
        if (!ok) return null;
        return {
          id: String(user.id),
          name: user.name ?? null,
          email: user.email,
          image: user.image ?? null,
          role: user.role ?? "USER",
        } as any;
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Attach role to session.user
      if (session?.user) {
        // user is only populated for database sessions via adapter
        // fetch role if needed
        const dbUser = user?.id
          ? user
          : await prisma.user.findUnique({
              where: { email: session.user.email! },
            });
        (session.user as any).role = dbUser?.role ?? "USER";
        (session.user as any).id = String(dbUser?.id ?? "");
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
