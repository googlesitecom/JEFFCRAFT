"use client";

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
  return <MinecraftGame />;
}
