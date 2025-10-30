import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import { AuthProvider } from "@/context/AuthContext";
import SessionProviderWrapper from "@/components/auth/SessionProviderWrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crypto Mining Sales Tracker",
  description:
    "Track revenue, sales, and expenses for your crypto mining machines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProviderWrapper>
          <AuthProvider>
            <header className="border-b border-[var(--border)]">
              <NavBar />
            </header>
            <main className="container-app">{children}</main>
          </AuthProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
