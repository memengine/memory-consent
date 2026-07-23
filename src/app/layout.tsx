import type { Metadata } from "next";

import "./globals.css";
import "./polish.css";
import "./home-polish.css";
import "./manage-polish.css";

export const metadata: Metadata = {
  title: "MemoryOS Consent Center",
  description: "Register your Memory Passport, approve agent access, and manage cross-agent permissions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
