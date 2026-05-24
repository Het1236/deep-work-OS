import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DeepWork Life OS — The Architecture of Silence",
  description:
    "A gamified productivity dashboard for tracking deep work, habits, goals, and personal evolution.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
