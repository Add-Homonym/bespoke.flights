import type { Metadata } from "next";
import { Hanken_Grotesk, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { TestModeBanner } from "@/components/layout/test-mode-banner";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "bespoke.flights — Private Charter Flights",
  description: "Book bespoke private charter flights. Multi-leg itineraries, competitive quotes from certified operators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${hankenGrotesk.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans text-body antialiased">
        <TestModeBanner />
        {children}
      </body>
    </html>
  );
}
