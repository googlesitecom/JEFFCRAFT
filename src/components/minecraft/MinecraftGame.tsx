"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "@/lib/minecraft/world";
import { Player, GameMode } from "@/lib/minecraft/player";
import { buildChunkGeometry, ChunkMeshes } from "@/lib/minecraft/mesher";
import { buildTextureCanvases, buildIconDataURLs } from "@/lib/minecraft/textures";
import { getSharedAtlas } from "@/lib/minecraft/atlas";
import { BlockType, BLOCKS, HOTBAR_BLOCKS } from "@/lib/minecraft/blocks";

const RENDER_RADIUS = 5;
const MAX_CHUNK_BUILDS_PER_FRAME = 2;

interface GameStats {
  fps: number;
  x: number;
  y: number;
  z: number;
  chunks: number;
  health: number;
  hunger: number;
}

export default function MinecraftGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<"menu" | "playing">("menu");
  const [selectedMode, setSelectedMode] = useState<GameMode>("creative");
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [stats, setStats] = useState<GameStats>({
    fps: 0,
    x: 0,
    y: 0,
    z: 0,
    chunks: 0,
    health: 20,
    hunger: 20,
  });
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});
  const [isDead, setIsDead] = useState(false);

  // Refs that the game loop reads without re-creating the effect
  const selectedSlotRef = useRef(0);
  const modeRef = useRef<GameMode>("creative");
  const startGameRef = useRef<((mode: GameMode) => void) | null>(null);

  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  useEffect(() => {
    setIconUrls(buildIconDataURLs(buildTextureCanvases()));
  }, []);

  // === Main game effect: only runs when user clicks "Play" ===
  useEffect(() => {
    if (screen !== "playing") return;
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // === Three.js setup ===
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#87ceeb");
    scene.fog = new THREE.Fog("#87ceeb", (RENDER_RADIUS - 1) * CHUNK_SIZE, RENDER_RADIUS * CHUNK_SIZE);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "none";

    // === Lighting ===
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(50, 100, 30);
    scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xbfdfff, 0x6b5a3a, 0.35);
    scene.add(hemi);

    // === Build atlas and shared materials ===
    const canvases = buildTextureCanvases();
    const atlas = getSharedAtlas(canvases);
    // Opaque material: solid blocks + leaves + glass (cutout via alphaTest for glass holes)
    const opaqueMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      side: THREE.FrontSide,
      alphaTest: 0.1, // discard pixels with alpha < 0.1 (glass border holes)
      transparent: false,
      depthWrite: true,
    });
    // Transparent material: water only (alpha-blended)
    const transparentMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // === World & Player ===
    const world = new World(2024);
    const player = new Player(world, camera, modeRef.current);

    // === Chunk manager state ===
    const chunkMeshes: Map<string, ChunkMeshes> = new Map();
    const chunkGroup = new THREE.Group();
    scene.add(chunkGroup);
    const chunksToBuild: Array<{ cx: number; cz: number }> = [];

    function chunkKey(cx: number, cz: number) {
      return `${cx},${cz}`;
    }

    function enqueueChunk(cx: number, cz: number) {
      const key = chunkKey(cx, cz);
      if (chunkMeshes.has(key)) return;
      world.getOrCreateChunk(cx, cz);
      chunkMeshes.set(key, { opaque: null, transparent: null });
      chunksToBuild.push({ cx, cz });
    }

    function buildChunk(cx: number, cz: number) {
      const key = chunkKey(cx, cz);
      const old = chunkMeshes.get(key);
      if (old?.opaque) {
        chunkGroup.remove(old.opaque);
        old.opaque.geometry.dispose();
      }
      if (old?.transparent) {
        chunkGroup.remove(old.transparent);
        old.transparent.geometry.dispose();
      }
      const meshes = buildChunkGeometry(world, cx, cz, atlas, opaqueMaterial, transparentMaterial);
      if (meshes.opaque) chunkGroup.add(meshes.opaque);
      if (meshes.transparent) chunkGroup.add(meshes.transparent);
      chunkMeshes.set(key, meshes);
    }

    function unloadChunk(cx: number, cz: number) {
      const key = chunkKey(cx, cz);
      const m = chunkMeshes.get(key);
      if (!m) return;
      if (m.opaque) {
        chunkGroup.remove(m.opaque);
        m.opaque.geometry.dispose();
      }
      if (m.transparent) {
        chunkGroup.remove(m.transparent);
        m.transparent.geometry.dispose();
      }
      chunkMeshes.delete(key);
    }

    function updateChunkLoading() {
      const pcx = Math.floor(player.position.x / CHUNK_SIZE);
      const pcz = Math.floor(player.position.z / CHUNK_SIZE);

      const candidates: Array<{ cx: number; cz: number; d: number }> = [];
      for (let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) {
        for (let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
          const d = dx * dx + dz * dz;
          if (d > RENDER_RADIUS * RENDER_RADIUS) continue;
          const cx = pcx + dx;
          const cz = pcz + dz;
          const key = chunkKey(cx, cz);
          if (chunkMeshes.has(key)) continue;
          candidates.push({ cx, cz, d });
        }
      }
      candidates.sort((a, b) => a.d - b.d);
      for (const c of candidates) {
        enqueueChunk(c.cx, c.cz);
      }

      const unloadR = RENDER_RADIUS + 2;
      const toUnload: Array<[number, number]> = [];
      for (const [key, _] of chunkMeshes) {
        const [cxStr, czStr] = key.split(",");
        const cx = parseInt(cxStr);
        const cz = parseInt(czStr);
        const dx = cx - pcx;
        const dz = cz - pcz;
        if (Math.abs(dx) > unloadR || Math.abs(dz) > unloadR) {
          toUnload.push([cx, cz]);
        }
      }
      for (const [cx, cz] of toUnload) {
        unloadChunk(cx, cz);
      }
      world.unloadDistantChunks(pcx, pcz, unloadR);

      let built = 0;
      while (built < MAX_CHUNK_BUILDS_PER_FRAME && chunksToBuild.length > 0) {
        const { cx, cz } = chunksToBuild.shift()!;
        buildChunk(cx, cz);
        built++;
      }
    }

    // Initial chunk load
    function initialLoad() {
      const pcx = Math.floor(player.position.x / CHUNK_SIZE);
      const pcz = Math.floor(player.position.z / CHUNK_SIZE);
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          world.getOrCreateChunk(pcx + dx, pcz + dz);
        }
      }
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cx = pcx + dx;
          const cz = pcz + dz;
          const key = chunkKey(cx, cz);
          chunkMeshes.set(key, { opaque: null, transparent: null });
          buildChunk(cx, cz);
        }
      }
    }
    initialLoad();
    setIsLoaded(true);

    function rebuildChunkAt(wx: number, wz: number) {
      const cx = Math.floor(wx / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const key = chunkKey(cx, cz);
      if (!chunkMeshes.has(key)) return;
      buildChunk(cx, cz);
    }

    // Place block at the targeted face (used by right-click AND M key)
    function placeBlock(): boolean {
      const result = player.raycast(6);
      if (!result.hit || !result.block || !result.normal) return false;
      const px = result.block.x + result.normal.x;
      const py = result.block.y + result.normal.y;
      const pz = result.block.z + result.normal.z;
      if (py < 0 || py >= WORLD_HEIGHT) return false;
      const existing = world.getBlock(px, py, pz);
      if (existing !== BlockType.Air && existing !== BlockType.Water) return false;
      const blockType = HOTBAR_BLOCKS[selectedSlotRef.current];
      const playerMinX = player.position.x - 0.3;
      const playerMaxX = player.position.x + 0.3;
      const playerMinY = player.position.y;
      const playerMaxY = player.position.y + 1.7;
      const playerMinZ = player.position.z - 0.3;
      const playerMaxZ = player.position.z + 0.3;
      if (
        px + 1 > playerMinX && px < playerMaxX &&
        py + 1 > playerMinY && py < playerMaxY &&
        pz + 1 > playerMinZ && pz < playerMaxZ
      ) {
        return false;
      }
      world.setBlock(px, py, pz, blockType);
      rebuildChunkAt(px, pz);
      if (px % CHUNK_SIZE === 0) rebuildChunkAt(px - 1, pz);
      if (px % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(px + 1, pz);
      if (pz % CHUNK_SIZE === 0) rebuildChunkAt(px, pz - 1);
      if (pz % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(px, pz + 1);
      return true;
    }

    function breakBlock(): boolean {
      const result = player.raycast(6);
      if (!result.hit || !result.block) return false;
      const { x, y, z } = result.block;
      if (world.getBlock(x, y, z) === BlockType.Bedrock) return false;
      world.setBlock(x, y, z, BlockType.Air);
      rebuildChunkAt(x, z);
      if (x % CHUNK_SIZE === 0) rebuildChunkAt(x - 1, z);
      if (x % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x + 1, z);
      if (z % CHUNK_SIZE === 0) rebuildChunkAt(x, z - 1);
      if (z % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x, z + 1);
      return true;
    }

    // === Block highlight wireframe ===
    const highlightGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const highlightEdges = new THREE.EdgesGeometry(highlightGeo);
    const highlightMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const highlight = new THREE.LineSegments(highlightEdges, highlightMat);
    highlight.visible = false;
    scene.add(highlight);

    // === Input handling ===
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!document.pointerLockElement) return;
      player.setKey(e.code, true);

      if (e.code.startsWith("Digit")) {
        const num = parseInt(e.code.replace("Digit", ""));
        if (num >= 1 && num <= 9) {
          const idx = num - 1;
          setSelectedSlot(idx);
          selectedSlotRef.current = idx;
        }
      }

      if (e.code === "KeyF") {
        player.toggleFly();
      }
      if (e.code === "KeyM") {
        placeBlock();
      }
      if (e.code === "Escape") {
        document.exitPointerLock();
      }
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      player.setKey(e.code, false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      player.addMouseDelta(e.movementX, e.movementY);
    };
    window.addEventListener("mousemove", handleMouseMove);

    const handleMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      if (e.button === 0) {
        breakBlock();
      } else if (e.button === 2) {
        placeBlock();
      }
    };
    renderer.domElement.addEventListener("mousedown", handleMouseDown);
    renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

    const handlePointerLockChange = () => {
      setIsLocked(document.pointerLockElement === renderer.domElement);
    };
    document.addEventListener("pointerlockchange", handlePointerLockChange);

    const handleCanvasClick = () => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    };
    renderer.domElement.addEventListener("click", handleCanvasClick);

    const handleWheel = (e: WheelEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      e.preventDefault();
      let idx = selectedSlotRef.current;
      if (e.deltaY > 0) idx = (idx + 1) % HOTBAR_BLOCKS.length;
      else idx = (idx - 1 + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
      setSelectedSlot(idx);
      selectedSlotRef.current = idx;
    };
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // === Render loop ===
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTime = lastTime;
    let rafId = 0;
    let posUpdateCounter = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (document.pointerLockElement === renderer.domElement && !player.isDead()) {
        player.update(dt);
      }

      // Check death
      if (player.isDead()) {
        setIsDead(true);
      }

      updateChunkLoading();

      const hit = player.raycast(6);
      if (hit.hit && hit.block) {
        highlight.visible = true;
        highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
      } else {
        highlight.visible = false;
      }

      renderer.render(scene, camera);

      frameCount++;
      if (now - fpsTime > 500) {
        const newFps = Math.round((frameCount * 1000) / (now - fpsTime));
        frameCount = 0;
        fpsTime = now;
        posUpdateCounter = 99; // force update
        setStats((s) => ({
          ...s,
          fps: newFps,
          chunks: chunkMeshes.size,
        }));
      }
      posUpdateCounter++;
      if (posUpdateCounter > 10) {
        setStats((s) => ({
          ...s,
          x: Math.floor(player.position.x),
          y: Math.floor(player.position.y),
          z: Math.floor(player.position.z),
          health: player.health,
          hunger: player.hunger,
        }));
        posUpdateCounter = 0;
      }
    };
    animate();

    // === Cleanup ===
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      renderer.domElement.removeEventListener("mousedown", handleMouseDown);
      renderer.domElement.removeEventListener("click", handleCanvasClick);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      chunkMeshes.forEach((c) => {
        c.opaque?.geometry.dispose();
        c.transparent?.geometry.dispose();
      });
      atlas.texture.dispose();
      opaqueMaterial.dispose();
      transparentMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [screen]);

  // === Start game function (from menu) ===
  const startGame = useCallback((mode: GameMode) => {
    modeRef.current = mode;
    setSelectedMode(mode);
    setScreen("playing");
    setIsLoaded(false);
    setIsDead(false);
  }, []);

  // Keep startGame ref in sync for the menu component
  useEffect(() => {
    startGameRef.current = startGame;
  }, [startGame]);

  const handleRespawn = useCallback(() => {
    // Restart the playing effect by toggling screen
    setScreen("menu");
    setTimeout(() => {
      setScreen("playing");
      setIsDead(false);
    }, 50);
  }, []);

  const handleExitToMenu = useCallback(() => {
    setScreen("menu");
    setIsDead(false);
  }, []);

  const handleStartClick = useCallback(() => {
    const canvas = containerRef.current?.querySelector("canvas");
    canvas?.requestPointerLock();
  }, []);

  // === MENU SCREEN ===
  if (screen === "menu") {
    return <MainMenu iconUrls={iconUrls} onStart={startGame} />;
  }

  // === GAME SCREEN ===
  return (
    <div className="relative w-full h-screen overflow-hidden bg-sky-400 select-none">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Crosshair */}
      {isLocked && !isDead && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="relative w-6 h-6">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-white mix-blend-difference" />
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white mix-blend-difference" />
          </div>
        </div>
      )}

      {/* HUD top-left */}
      <div className="absolute top-2 left-2 z-20 text-white font-mono text-xs sm:text-sm bg-black/50 px-2 py-1 rounded">
        <div>FPS: {stats.fps}</div>
        <div>X: {stats.x} Y: {stats.y} Z: {stats.z}</div>
        <div>Chunks: {stats.chunks}</div>
        <div className="mt-1 text-white/70">{BLOCKS[HOTBAR_BLOCKS[selectedSlot]].name}</div>
        <div className="mt-1 text-yellow-300/80">{selectedMode === "creative" ? "Creativo" : "Survival"}</div>
      </div>

      {/* Survival stats: hearts + hunger */}
      {selectedMode === "survival" && (
        <>
          {/* Hearts */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => {
              const filled = Math.min(2, Math.max(0, stats.health - i * 2));
              return (
                <Heart key={i} filled={filled} />
              );
            })}
          </div>
          {/* Hunger */}
          <div className="absolute bottom-20 left-1/2 translate-x-[180px] z-20 flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => {
              const filled = Math.min(2, Math.max(0, stats.hunger - i * 2));
              return (
                <Drumstick key={i} filled={filled} />
              );
            })}
          </div>
        </>
      )}

      {/* Hotbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 p-1 bg-black/40 rounded-md backdrop-blur-sm">
        {HOTBAR_BLOCKS.map((blockType, i) => {
          const def = BLOCKS[blockType];
          const iconName = def.textures.side === "grass_side" ? "grass_side" : def.textures.top === "dirt" ? "dirt" : def.textures.top || def.textures.side;
          const iconUrl = iconUrls[iconName];
          const isSelected = i === selectedSlot;
          return (
            <div
              key={i}
              className={`w-12 h-12 sm:w-14 sm:h-14 border-2 flex items-center justify-center relative ${
                isSelected ? "border-white bg-white/20" : "border-gray-500 bg-gray-800/60"
              }`}
              style={{ imageRendering: "pixelated" }}
            >
              {iconUrl && (
                <img
                  src={iconUrl}
                  alt={def.name}
                  className="w-10 h-10 sm:w-12 sm:h-12"
                  style={{ imageRendering: "pixelated" }}
                  draggable={false}
                />
              )}
              <span className="absolute top-0 left-1 text-[10px] text-white/80 font-mono">{i + 1}</span>
            </div>
          );
        })}
      </div>

      {/* Start overlay (when not pointer-locked yet) */}
      {!isLocked && isLoaded && !isDead && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center cursor-pointer bg-black/50 backdrop-blur-sm"
          onClick={handleStartClick}
        >
          <div className="bg-stone-800/90 border-4 border-stone-900 rounded-lg p-6 sm:p-8 max-w-md mx-4 text-center text-white shadow-2xl">
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-wide" style={{ fontFamily: "monospace" }}>
              MINICRAFT
            </h1>
            <p className="mb-3 text-stone-300 text-sm">
              Modo: <span className="text-yellow-400 font-bold">{selectedMode === "creative" ? "Creativo" : "Survival"}</span>
            </p>
            <div className="text-left text-xs sm:text-sm space-y-1 bg-stone-900/60 p-4 rounded">
              <div><span className="text-yellow-400 font-bold">WASD</span> — Moverse</div>
              <div><span className="text-yellow-400 font-bold">Mouse</span> — Mirar alrededor</div>
              <div><span className="text-yellow-400 font-bold">Espacio</span> — Saltar</div>
              <div><span className="text-yellow-400 font-bold">Shift</span> — Correr</div>
              <div><span className="text-yellow-400 font-bold">Click izq</span> — Romper bloque</div>
              <div><span className="text-yellow-400 font-bold">Click der / M</span> — Colocar bloque</div>
              <div><span className="text-yellow-400 font-bold">1-9 / Rueda</span> — Seleccionar bloque</div>
              {selectedMode === "creative" && (
                <div><span className="text-yellow-400 font-bold">F</span> — Activar/desactivar vuelo</div>
              )}
              <div><span className="text-yellow-400 font-bold">Esc</span> — Pausar</div>
            </div>
            <p className="mt-3 text-xs text-stone-400">Click para jugar</p>
          </div>
        </div>
      )}

      {/* Death screen */}
      {isDead && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-red-950/70 backdrop-blur-sm">
          <div className="text-center text-white">
            <h1 className="text-5xl font-bold mb-6" style={{ fontFamily: "monospace" }}>¡Has muerto!</h1>
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleRespawn}
                className="px-6 py-3 bg-green-700 hover:bg-green-600 border-2 border-green-500 rounded text-lg font-bold transition-colors"
              >
                Reaparecer
              </button>
              <button
                onClick={handleExitToMenu}
                className="px-6 py-3 bg-stone-700 hover:bg-stone-600 border-2 border-stone-500 rounded text-lg font-bold transition-colors"
              >
                Menú principal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading screen */}
      {!isLoaded && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
          <div className="text-white font-mono text-xl">Generando mundo...</div>
        </div>
      )}
    </div>
  );
}

// === Heart icon for health ===
function Heart({ filled }: { filled: number }) {
  // filled: 0 (empty), 1 (half), 2 (full)
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      {/* Empty heart background (dark) */}
      <path
        d="M3,2 L5,2 L5,3 L3,3 Z M5,3 L7,3 L7,4 L5,4 Z M7,4 L9,4 L9,5 L7,5 Z M9,3 L11,3 L11,4 L9,4 Z M11,2 L13,2 L13,3 L11,3 Z M3,3 L2,3 L2,5 L3,5 Z M13,3 L14,3 L14,5 L13,5 Z M2,5 L3,5 L3,6 L2,6 Z M13,5 L14,5 L14,6 L13,6 Z M3,6 L4,6 L4,7 L3,7 Z M12,6 L13,6 L13,7 L12,7 Z M4,7 L5,7 L5,8 L4,8 Z M11,7 L12,7 L12,8 L11,8 Z M5,8 L6,8 L6,9 L5,9 Z M10,8 L11,8 L11,9 L10,9 Z M6,9 L7,9 L7,10 L6,10 Z M9,9 L10,9 L10,10 L9,10 Z M7,10 L8,10 L8,11 L7,11 Z M8,10 L9,10 L9,11 L8,11 Z"
        fill="#3a0000"
      />
      {/* Filled portion (red) */}
      {filled >= 1 && (
        <path
          d="M4,3 L5,3 L5,4 L4,4 Z M6,4 L7,4 L7,5 L6,5 Z M8,4 L9,4 L9,5 L8,5 Z M10,3 L11,3 L11,4 L10,4 Z M3,4 L4,4 L4,5 L3,5 Z M12,4 L13,4 L13,5 L12,5 Z M3,5 L4,5 L4,6 L3,6 Z M12,5 L13,5 L13,6 L12,6 Z M4,6 L5,5 L5,6 L4,6 Z M11,6 L12,6 L12,5 L11,5 Z M5,7 L6,7 L6,8 L5,8 Z M10,7 L11,7 L11,8 L10,8 Z M6,8 L7,8 L7,9 L6,9 Z M9,8 L10,8 L10,9 L9,9 Z M7,9 L8,9 L8,10 L7,10 Z M8,9 L9,9 L9,10 L8,10 Z"
          fill="#ff0000"
        />
      )}
    </svg>
  );
}

// === Drumstick icon for hunger ===
function Drumstick({ filled }: { filled: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      {/* Empty (dark) */}
      <path
        d="M10,2 L12,2 L12,3 L13,3 L13,4 L14,4 L14,5 L13,5 L13,6 L12,6 L12,7 L11,7 L11,8 L10,8 L10,9 L9,9 L9,10 L8,10 L8,11 L7,11 L7,12 L6,12 L6,13 L5,13 L5,14 L4,14 L4,13 L3,13 L3,12 L4,12 L4,11 L5,11 L5,10 L6,10 L6,9 L7,9 L7,8 L8,8 L8,7 L9,7 L9,6 L10,6 L10,5 L11,5 L11,4 L10,4 Z"
        fill="#3a2a00"
      />
      {/* Filled (brown) */}
      {filled >= 1 && (
        <path
          d="M10,3 L11,3 L11,4 L12,4 L12,5 L13,5 L13,6 L12,6 L12,7 L11,7 L11,8 L10,8 L10,9 L9,9 L9,10 L8,10 L8,11 L7,11 L7,12 L6,12 L6,11 L7,11 L7,10 L8,10 L8,9 L9,9 L9,8 L10,8 L10,7 L11,7 L11,6 L12,6 L12,5 L11,5 L11,4 L10,4 Z"
          fill="#8b4513"
        />
      )}
      {filled >= 2 && (
        <path
          d="M5,12 L6,12 L6,13 L5,13 Z M4,13 L5,13 L5,14 L4,14 Z"
          fill="#deb887"
        />
      )}
    </svg>
  );
}

// === Main Menu Component ===
function MainMenu({
  iconUrls,
  onStart,
}: {
  iconUrls: Record<string, string>;
  onStart: (mode: GameMode) => void;
}) {
  const [hovered, setHovered] = useState<GameMode | null>(null);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-sky-400 via-sky-500 to-emerald-700 select-none">
      {/* Animated background blocks (decorative) */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-green-800" />
        <div className="absolute bottom-32 left-0 right-0 h-8 bg-green-600" />
        <div className="absolute bottom-40 left-1/4 w-16 h-20 bg-amber-800" />
        <div className="absolute bottom-40 left-1/4 w-24 h-32 -translate-x-4 bg-green-700" />
        <div className="absolute bottom-40 right-1/4 w-16 h-24 bg-amber-800" />
        <div className="absolute bottom-40 right-1/4 w-24 h-36 translate-x-4 bg-green-700" />
        <div className="absolute bottom-40 left-1/2 w-16 h-28 bg-amber-800 -translate-x-8" />
        <div className="absolute bottom-40 left-1/2 w-24 h-40 bg-green-700 -translate-x-12" />
        {/* Clouds */}
        <div className="absolute top-12 left-1/4 w-32 h-8 bg-white/60 rounded" />
        <div className="absolute top-20 right-1/4 w-40 h-10 bg-white/60 rounded" />
        <div className="absolute top-8 left-1/2 w-24 h-6 bg-white/60 rounded" />
      </div>

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1
            className="text-5xl sm:text-7xl font-black tracking-wider text-white drop-shadow-[4px_4px_0_rgba(0,0,0,0.5)]"
            style={{ fontFamily: "monospace" }}
          >
            MINICRAFT
          </h1>
          <p className="text-white/80 mt-2 text-sm sm:text-base font-mono">
            Mundo infinito procedural · Voxel sandbox
          </p>
        </div>

        {/* Mode selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl w-full">
          {/* Creative */}
          <button
            onMouseEnter={() => setHovered("creative")}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onStart("creative")}
            className={`group relative overflow-hidden rounded-lg border-4 p-6 transition-all transform hover:scale-105 ${
              hovered === "creative"
                ? "border-yellow-400 bg-yellow-400/20 shadow-2xl shadow-yellow-500/50"
                : "border-stone-700 bg-stone-900/80 hover:border-yellow-400"
            }`}
          >
            <div className="flex items-center gap-4 mb-3">
              <div className="w-14 h-14 bg-gradient-to-br from-yellow-300 to-orange-500 rounded flex items-center justify-center text-3xl shadow-inner">
                <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-left">
                <h2 className="text-2xl font-bold text-white">Creativo</h2>
                <p className="text-xs text-stone-300">Vuelo libre · Bloques infinitos</p>
              </div>
            </div>
            <ul className="text-left text-xs text-stone-300 space-y-1">
              <li>✓ Vuelo activado por defecto (F para alternar)</li>
              <li>✓ Sin daño por caída</li>
              <li>✓ Salud infinita</li>
              <li>✓ Construye sin límites</li>
            </ul>
          </button>

          {/* Survival */}
          <button
            onMouseEnter={() => setHovered("survival")}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onStart("survival")}
            className={`group relative overflow-hidden rounded-lg border-4 p-6 transition-all transform hover:scale-105 ${
              hovered === "survival"
                ? "border-red-400 bg-red-400/20 shadow-2xl shadow-red-500/50"
                : "border-stone-700 bg-stone-900/80 hover:border-red-400"
            }`}
          >
            <div className="flex items-center gap-4 mb-3">
              <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-rose-700 rounded flex items-center justify-center text-3xl shadow-inner">
                <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white">
                  <path d="M14.5 3.5l-2 2-7 7-2 5 5-2 7-7 2-2-3-3zm-2.5 6.5l2 2M5 19l-2 2M9 15l-4 4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-left">
                <h2 className="text-2xl font-bold text-white">Survival</h2>
                <p className="text-xs text-stone-300">Sobrevive · Cuidado con caer</p>
              </div>
            </div>
            <ul className="text-left text-xs text-stone-300 space-y-1">
              <li>⚠ Sin vuelo — solo caminar y saltar</li>
              <li>⚠ Daño por caída (&gt;3 bloques)</li>
              <li>⚠ Salud y hambre limitadas</li>
              <li>✓ Recoge bloques al romperlos</li>
            </ul>
          </button>
        </div>

        {/* Controls preview */}
        <div className="mt-8 max-w-2xl w-full bg-stone-900/80 border-2 border-stone-700 rounded-lg p-4">
          <h3 className="text-white font-bold mb-2 text-center text-sm">Controles</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-stone-300 font-mono">
            <div><span className="text-yellow-400">WASD</span> Mover</div>
            <div><span className="text-yellow-400">Mouse</span> Mirar</div>
            <div><span className="text-yellow-400">Espacio</span> Saltar</div>
            <div><span className="text-yellow-400">Shift</span> Correr</div>
            <div><span className="text-yellow-400">Click izq</span> Romper</div>
            <div><span className="text-yellow-400">Click der / M</span> Colocar</div>
            <div><span className="text-yellow-400">1-9</span> Seleccionar</div>
            <div><span className="text-yellow-400">F</span> Vuelo (creativo)</div>
            <div><span className="text-yellow-400">Esc</span> Pausar</div>
          </div>
        </div>

        <p className="mt-6 text-white/70 text-xs font-mono">
          Selecciona un modo para empezar a jugar
        </p>
      </div>
    </div>
  );
}
