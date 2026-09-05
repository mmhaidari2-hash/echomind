import type { Metadata, Viewport } from "next";
import { Inter, Vazirmatn } from "next/font/google";

import InstallPrompt from "./components/InstallPrompt";
import NativeShell from "./components/NativeShell";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#090d16",
  colorScheme: "dark",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "EchoMind",
  description: "AI Assistant",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EchoMind",
  },
  icons: {
    icon: { url: "/icon.png", type: "image/png", sizes: "192x192" },
    apple: { url: "/icon.png", type: "image/png", sizes: "192x192" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${vazirmatn.variable}`}
    >
      <body className="bg-canvas font-sans antialiased">
        {children}
        <NativeShell />
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
