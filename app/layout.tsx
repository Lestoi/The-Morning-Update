export const metadata = { title: "Morning Update", description: "ES/NQ pre-market glance (UK)" };
import "../styles/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      {/* Enforce dark background + text as a fallback even if CSS misses */}
      <body className="bg-neutral-950 text-neutral-100">{children}</body>
    </html>
  );
}
/* Hard-enforce black background + light text */
:root { color-scheme: dark; }
html, body { background:#0a0a0a; color:#e5e5e5; }
