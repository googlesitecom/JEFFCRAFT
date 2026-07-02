"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Loading screen — shown while the game chunk loads (dynamic import).
 * Styled like Minecraft's loading screen: black background, AXION logo
 * centered, "AXION" text below, and a loading bar at the bottom.
 */
function AxionLoadingScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        // Simulate loading progress — speeds up, slows down, never reaches 100
        // until the actual component is ready (then this unmounts).
        const remaining = 95 - p;
        const increment = Math.max(0.5, remaining * 0.08);
        return Math.min(95, p + increment);
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="w-full h-screen flex flex-col items-center justify-center"
      style={{
        backgroundColor: "#000",
        position: "fixed",
        inset: 0,
        zIndex: 9999,
      }}
    >
      {/* AXION Logo — centered, with subtle pulsing glow */}
      <div
        style={{
          animation: "axion-pulse 2s ease-in-out infinite",
        }}
      >
        <img
          src="/axion-logo.png"
          alt="Axion"
          style={{
            width: "180px",
            height: "auto",
            imageRendering: "auto",
            filter: "drop-shadow(0 0 20px rgba(100,150,255,0.4))",
          }}
          draggable={false}
        />
      </div>

      {/* AXION text — large, bold, below the logo */}
      <h1
        style={{
          fontFamily: "monospace",
          fontSize: "2.5rem",
          fontWeight: 900,
          color: "#fff",
          letterSpacing: "0.15em",
          marginTop: "1.5rem",
          textShadow: "2px 2px 0 #1a1a2a, 0 0 30px rgba(100,150,255,0.3)",
        }}
      >
        AXION
      </h1>

      {/* Loading bar — bottom center, Minecraft-style */}
      <div
        style={{
          position: "absolute",
          bottom: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "60%",
          maxWidth: "480px",
        }}
      >
        {/* Bar background */}
        <div
          style={{
            width: "100%",
            height: "12px",
            backgroundColor: "#1a1a1a",
            borderTop: "2px solid #333",
            borderLeft: "2px solid #333",
            borderBottom: "2px solid #0a0a0a",
            borderRight: "2px solid #0a0a0a",
            overflow: "hidden",
          }}
        >
          {/* Bar fill — animated */}
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              backgroundColor: "#4a8aff",
              backgroundImage:
                "linear-gradient(90deg, #2a5acc 0%, #4a8aff 50%, #6aaaff 100%)",
              transition: "width 0.15s ease-out",
              boxShadow: "0 0 8px rgba(74,138,255,0.6)",
            }}
          />
        </div>
        {/* Percentage text */}
        <p
          style={{
            textAlign: "center",
            fontFamily: "monospace",
            fontSize: "0.75rem",
            color: "#666",
            marginTop: "0.5rem",
            letterSpacing: "0.05em",
          }}
        >
          Loading... {Math.floor(progress)}%
        </p>
      </div>

      {/* Keyframe animation for logo pulse */}
      <style>{`
        @keyframes axion-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.03); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

const MinecraftGame = dynamic(() => import("@/components/minecraft/MinecraftGame"), {
  ssr: false,
  loading: () => <AxionLoadingScreen />,
});

export default function Home() {
  return <MinecraftGame />;
}
