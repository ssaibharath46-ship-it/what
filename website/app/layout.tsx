import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KLU AttendIQ",
  description: "Smart attendance intelligence for KLU students",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
