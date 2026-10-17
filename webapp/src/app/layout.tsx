import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "TraceDump AI",
  description: "AI-assisted waste dumping investigation",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full font-sans antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
