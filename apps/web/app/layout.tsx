import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WCJC — Build. Connect. Own the relationship.",
  description: "A free, open professional network for builders, startups, companies and people who want direct relationships without pay-to-connect walls.",
  metadataBase: new URL("https://wecanjuschill.net"),
  openGraph: {
    title: "WCJC",
    description: "Build. Connect. Own the relationship.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
