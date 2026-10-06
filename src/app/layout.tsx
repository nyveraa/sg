import type { Metadata, Viewport } from "next";
import { EB_Garamond, Instrument_Sans, Martian_Mono } from "next/font/google";
import "./globals.css";

const display = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-garamond", display: "swap" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-martian", display: "swap" });

export const metadata: Metadata = {
  title: "onyx.",
  description: "Private messaging, by invitation. Speak in the dark.",
  icons: { icon: "/mark.svg" },
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
