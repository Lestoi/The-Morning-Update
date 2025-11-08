import "../styles/globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Morning Update",
  description: "Daily market summary and sentiment dashboard",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" }, // ☕ coffee mug favicon
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  themeColor: "#0a0a0a",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head />
      <body
        className={`${inter.className} bg-[#0a0a0a] text-gray-200 min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
