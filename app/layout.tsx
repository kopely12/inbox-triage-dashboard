import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import Script from 'next/script';
import "./globals.css";
import { cn } from "@/lib/utils";
import { HydrationWatchdog } from '@/components/hydration-watchdog';

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'iinbox',
  description: 'Manage your iinbox account, billing, and team.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <HydrationWatchdog />
        {/* If React never hydrated (e.g. a JS chunk returned 403), show a reload banner. */}
        <Script id="hydration-check" strategy="afterInteractive">{`
          setTimeout(function() {
            if (document.documentElement.getAttribute('data-hydrated') !== 'true' &&
                document.querySelectorAll('button').length > 0) {
              var b = document.createElement('div');
              b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#7c3aed;color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;font-family:sans-serif;font-size:14px;gap:12px;';
              b.innerHTML = '<span>Page failed to fully load — buttons may not respond.</span><button onclick="location.reload()" style="background:#fff;color:#7c3aed;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap;">Reload page</button>';
              document.body.appendChild(b);
            }
          }, 7000);
        `}</Script>
      </body>
    </html>
  );
}
