import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "wecanjuschill — Build. Connect. Own the relationship.",
  description: "A free professional network for builders, startups, companies and people who want direct relationships without pay-to-connect walls.",
  metadataBase: new URL("https://wecanjuschill.net"),
  openGraph: {
    title: "wecanjuschill",
    description: "Build. Connect. Own the relationship.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('wecanjuschill.theme.v1');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
