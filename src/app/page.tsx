"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MinecraftGame = dynamic(() => import("@/components/minecraft/MinecraftGame"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <div className="text-white font-mono text-xl">Cargando Minecraft...</div>
    </div>
  ),
});

export default function Home() {
  // Defer rendering until the client has mounted to avoid any hydration mismatch
  // caused by browser extensions (e.g. Securly) that inject HTML before React hydrates.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-white font-mono text-xl">Cargando Minecraft...</div>
      </div>
    );
  }

  return <MinecraftGame />;
}
