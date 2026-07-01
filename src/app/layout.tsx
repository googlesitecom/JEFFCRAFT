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
  title: "MINECRAFT JAVA EDITION",
  description: "Minecraft Java Edition - voxel sandbox built with Next.js, Three.js, and TypeScript.",
  keywords: ["Minecraft", "Java Edition", "voxel", "sandbox", "Three.js", "Next.js", "TypeScript"],
  authors: [{ name: "JEFFCRAFT" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "MINECRAFT JAVA EDITION",
    description: "Voxel sandbox built with Next.js + Three.js",
    siteName: "Minecraft Java Edition",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MINECRAFT JAVA EDITION",
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
