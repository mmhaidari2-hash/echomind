import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Inter, Plus_Jakarta_Sans, Vazirmatn } from "next/font/google";

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

/** Plus Jakarta Sans — the geometric sans display face of the Dark
    Obsidian design. Clean, executive, never bookish. */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
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
  themeColor: "#090A0F",
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
      className={`${inter.variable} ${jakarta.variable} ${jetbrainsMono.variable} ${vazirmatn.variable}`}
    >
      <body className="bg-obsidian font-sans antialiased">
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
