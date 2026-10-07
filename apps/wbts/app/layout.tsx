import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What's Behind That Smile? — WBTS",
  description: "Real people. Real stories. A place to remove the mask, tell the truth anonymously, and show somebody some love.",
  metadataBase: new URL("https://wbts.wecanjuschill.net"),
  openGraph: {
    title: "What's Behind That Smile?",
    description: "You don't have to say you're fine here.",
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
