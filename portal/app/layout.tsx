import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Site Tracker | Weekly Reporting & Site 5S",
  description: "Weekly project reports, site inspections, HSE observations and corrective action oversight.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
