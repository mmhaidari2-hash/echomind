import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono, Inter, Vazirmatn } from "next/font/google";

import ClerkRoot from "./components/ClerkRoot";
import InstallPrompt from "./components/InstallPrompt";
import NativeShell from "./components/NativeShell";
import OutcomeSync from "./components/OutcomeSync";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Fraunces — the serif display face of the warm editorial design
    (SparkFlow language). Variable optical sizing, italic for accents. */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
});

/** JetBrains Mono — the mono face for technical labels, counts and
    refs (developer-grade precision: tabular numbers, never
    decorative). Next 14 has no Geist export, so JetBrains Mono is
    the real top-tier mono available here. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#F3EAD9",
  colorScheme: "light",
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
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable} ${vazirmatn.variable}`}
    >
      <body className="bg-canvas font-sans antialiased">
        <ClerkRoot>
          {children}
          <NativeShell />
          <OutcomeSync />
          <ServiceWorkerRegister />
          <InstallPrompt />
        </ClerkRoot>
      </body>
    </html>
  );
}
