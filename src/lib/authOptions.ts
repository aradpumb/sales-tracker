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
    async jwt({ token, user }) {
      // Persist role and id in the token
      if (user) {
        token.role = (user as any).role ?? "USER";
        token.id = (user as any).id ?? token.sub;
      }
      // If token already exists (subsequent calls), keep existing role/id
      token.role = token.role ?? "USER";
      token.id = token.id ?? token.sub;
      return token as any;
    },
    async session({ session, user, token }) {
      // Attach role and id to session.user from token if available
      if (session?.user) {
        const roleFromToken = (token as any)?.role;
        const idFromToken = (token as any)?.id;
        if (roleFromToken) {
          (session.user as any).role = roleFromToken;
        }
        if (idFromToken) {
          (session.user as any).id = String(idFromToken);
        }
        // Fallback to DB lookup if role missing
        if (!(session.user as any).role) {
          const dbUser = user?.id
            ? user
            : await prisma.user.findUnique({
                where: { email: session.user.email! },
              });
          (session.user as any).role = (dbUser as any)?.role ?? "USER";
          (session.user as any).id = String((dbUser as any)?.id ?? "");
        }
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
