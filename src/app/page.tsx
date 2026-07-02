"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Loading screen — shown while the game chunk loads (dynamic import).
 * Dark navy blue background with subtle black vignette details.
 * AXION logo centered, "AXION" text below, loading bar at the bottom.
 * Stays visible for a minimum of 5 seconds even if the game loads faster.
 */
function AxionLoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [showScreen, setShowScreen] = useState(true);

  // Simulate loading progress (0 → 95, slows down near the end)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        const remaining = 95 - p;
        const increment = Math.max(0.5, remaining * 0.08);
        return Math.min(95, p + increment);
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  // Track minimum 5-second display time
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  // When both the minimum time has elapsed AND progress is near complete,
  // jump to 100% and hide the screen
  useEffect(() => {
    if (minTimeElapsed) {
      setProgress(100);
      const fadeTimer = setTimeout(() => setShowScreen(false), 300);
      return () => clearTimeout(fadeTimer);
    }
  }, [minTimeElapsed]);

  // Also hide if game is ready AND minimum time passed
  useEffect(() => {
    if (gameReady && minTimeElapsed) {
      setProgress(100);
      const fadeTimer = setTimeout(() => setShowScreen(false), 300);
      return () => clearTimeout(fadeTimer);
    }
  }, [gameReady, minTimeElapsed]);

  // Listen for the game component to be ready (the dynamic import resolves)
  useEffect(() => {
    // The dynamic import will replace this loading component when ready.
    // We detect "game ready" by checking if the loading component is still
    // mounted after the import resolves. Since Next.js dynamic() unmounts
    // the loading component when the real component loads, we use a
    // timeout as a fallback. The 5-second minimum is the primary gate.
  }, []);

  if (!showScreen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        // Dark navy blue background with subtle radial gradient (black edges)
        background:
          "radial-gradient(ellipse at center, #0a1a3a 0%, #050d20 50%, #000000 100%)",
        opacity: showScreen ? 1 : 0,
        transition: "opacity 0.3s ease-out",
      }}
    >
      {/* Subtle black vignette overlay for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* AXION Logo — centered, with subtle pulsing glow */}
      <div
        style={{
          animation: "axion-pulse 2s ease-in-out infinite",
          position: "relative",
          zIndex: 1,
        }}
      >
        <img
          src="/axion-logo.png"
          alt="Axion"
          style={{
            width: "180px",
            height: "auto",
            imageRendering: "auto",
            filter: "drop-shadow(0 0 20px rgba(100,150,255,0.5))",
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
          textShadow: "2px 2px 0 #000, 0 0 30px rgba(100,150,255,0.4)",
          position: "relative",
          zIndex: 1,
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
          zIndex: 1,
        }}
      >
        {/* Bar background — dark navy with black borders */}
        <div
          style={{
            width: "100%",
            height: "12px",
            backgroundColor: "#020815",
            borderTop: "2px solid #1a2a4a",
            borderLeft: "2px solid #1a2a4a",
            borderBottom: "2px solid #000",
            borderRight: "2px solid #000",
            overflow: "hidden",
          }}
        >
          {/* Bar fill — blue gradient, animated */}
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              backgroundColor: "#4a8aff",
              backgroundImage:
                "linear-gradient(90deg, #1a3a8a 0%, #4a8aff 50%, #6aaaff 100%)",
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
            color: "#4a6a9a",
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

/**
 * Wrapper that shows the loading screen for a minimum of 5 seconds,
 * then reveals the game.
 */
function GameWithMinLoading({ children }: { children: React.ReactNode }) {
  const [showLoading, setShowLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowLoading(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (showLoading) return <AxionLoadingScreen />;
  return <>{children}</>;
}

const MinecraftGame = dynamic(() => import("@/components/minecraft/MinecraftGame"), {
  ssr: false,
  loading: () => <AxionLoadingScreen />,
});

export default function Home() {
  return (
    <GameWithMinLoading>
      <MinecraftGame />
    </GameWithMinLoading>
  );
}
