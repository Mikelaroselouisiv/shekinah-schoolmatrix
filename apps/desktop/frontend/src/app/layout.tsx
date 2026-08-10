import type { Metadata } from "next";
import { Dancing_Script } from "next/font/google";
import { SchoolProfileProvider } from "@/src/contexts/SchoolProfileContext";
import { AppShell } from "@/src/components/AppShell";
import "./globals.css";

const dancingScript = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing-script",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shekinah SchoolMatrix",
  description: "Gestion scolaire Shekinah SchoolMatrix",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={dancingScript.variable}>
      <body>
        <SchoolProfileProvider>
          <AppShell>{children}</AppShell>
        </SchoolProfileProvider>
      </body>
    </html>
  );
}
