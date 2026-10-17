import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TraceDump AI", template: "%s | TraceDump AI" },
  description: "AI-assisted waste dumping investigation for city teams.",
  icons: { icon: "/brand/favicon.svg" },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#0F2D46",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
