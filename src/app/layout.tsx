import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WORLDBIND JAVA",
  description: "Worldbind Java - voxel sandbox built with Next.js, Three.js, and TypeScript.",
  keywords: ["Worldbind", "Java", "voxel", "sandbox", "Three.js", "Next.js", "TypeScript", "Axion"],
  authors: [{ name: "Axion" }],
  icons: {
    icon: "/axion-logo.png",
    shortcut: "/axion-logo.png",
    apple: "/axion-logo.png",
  },
  openGraph: {
    title: "WORLDBIND JAVA",
    description: "Voxel sandbox built with Next.js + Three.js",
    siteName: "Worldbind Java",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WORLDBIND JAVA",
    description: "Voxel sandbox built with Next.js + Three.js",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
