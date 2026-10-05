import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What's Behind That Smile? — WeCanJusChill",
  description:
    "A place to remove the mask, tell the truth anonymously, read someone else's story, and show them some love.",
  metadataBase: new URL("https://wecanjuschill.net"),
  openGraph: {
    title: "What's Behind That Smile?",
    description: "A place to remove the mask.",
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
