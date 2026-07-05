import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audit Evidence AI",
  description: "Deterministic audit evidence review workspace"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
