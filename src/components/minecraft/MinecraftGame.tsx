"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "@/lib/minecraft/world";
import { Player } from "@/lib/minecraft/player";
import { buildChunkGeometry, ChunkMeshes } from "@/lib/minecraft/mesher";
import { buildTextureCanvases, buildIconDataURLs } from "@/lib/minecraft/textures";
import { getSharedAtlas } from "@/lib/minecraft/atlas";
import { BlockType, BLOCKS, HOTBAR_BLOCKS } from "@/lib/minecraft/blocks";

// Render distance in chunks (radius around player)
const RENDER_RADIUS = 5;
// Maximum chunk loads per frame (to avoid hitches)
const MAX_CHUNK_BUILDS_PER_FRAME = 2;

export default function MinecraftGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [fps, setFps] = useState(0);
  const [posInfo, setPosInfo] = useState({ x: 0, y: 0, z: 0 });
  const [loadedChunks, setLoadedChunks] = useState(0);
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});
  const selectedSlotRef = useRef(0);

  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  useEffect(() => {
    setIconUrls(buildIconDataURLs(buildTextureCanvases()));
  }, []);

  useEffect(() => {
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
    renderer.shadowMap.enabled = false;
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
    const opaqueMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      side: THREE.FrontSide,
    });
    const transparentMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // === World & Player ===
    const world = new World(2024);
    const player = new Player(world, camera);

    // === Chunk manager state ===
    const chunkMeshes: Map<string, ChunkMeshes> = new Map();
    const chunkGroup = new THREE.Group();
    scene.add(chunkGroup);
    const chunksToBuild: Array<{ cx: number; cz: number }> = [];
    let lastPlayerChunkCX = Infinity;
    let lastPlayerChunkCZ = Infinity;

    function chunkKey(cx: number, cz: number) {
      return `${cx},${cz}`;
    }

    function enqueueChunk(cx: number, cz: number) {
      const key = chunkKey(cx, cz);
      if (chunkMeshes.has(key)) return;
      // Ensure world chunk is generated (so peek/getBlock is consistent)
      world.getOrCreateChunk(cx, cz);
      // Mark as "in progress" with a placeholder so it doesn't get re-enqueued
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

      // Enqueue chunks in radius (sorted by distance)
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

      // Unload chunks outside radius + 2
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
      // Also unload from world data
      world.unloadDistantChunks(pcx, pcz, unloadR);

      // Build a few chunks per frame
      let built = 0;
      while (built < MAX_CHUNK_BUILDS_PER_FRAME && chunksToBuild.length > 0) {
        const { cx, cz } = chunksToBuild.shift()!;
        buildChunk(cx, cz);
        built++;
      }
    }

    // Initial chunk load around spawn (synchronous so player has ground)
    function initialLoad() {
      const pcx = Math.floor(player.position.x / CHUNK_SIZE);
      const pcz = Math.floor(player.position.z / CHUNK_SIZE);
      // Generate all chunks in radius first (without trees spilling across uninitialized chunks)
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          world.getOrCreateChunk(pcx + dx, pcz + dz);
        }
      }
      // Build a small initial ring synchronously so player doesn't fall through
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cx = pcx + dx;
          const cz = pcz + dz;
          const key = chunkKey(cx, cz);
          chunkMeshes.set(key, { opaque: null, transparent: null });
          buildChunk(cx, cz);
        }
      }
      lastPlayerChunkCX = pcx;
      lastPlayerChunkCZ = pcz;
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
      const result = player.raycast(6);
      if (!result.hit || !result.block || !result.normal) return;

      if (e.button === 0) {
        const { x, y, z } = result.block;
        if (world.getBlock(x, y, z) === BlockType.Bedrock) return;
        world.setBlock(x, y, z, BlockType.Air);
        rebuildChunkAt(x, z);
        if (x % CHUNK_SIZE === 0) rebuildChunkAt(x - 1, z);
        if (x % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x + 1, z);
        if (z % CHUNK_SIZE === 0) rebuildChunkAt(x, z - 1);
        if (z % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x, z + 1);
      } else if (e.button === 2) {
        const px = result.block.x + result.normal.x;
        const py = result.block.y + result.normal.y;
        const pz = result.block.z + result.normal.z;
        if (py < 0 || py >= WORLD_HEIGHT) return;
        const existing = world.getBlock(px, py, pz);
        if (existing !== BlockType.Air && existing !== BlockType.Water) return;
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
          return;
        }
        world.setBlock(px, py, pz, blockType);
        rebuildChunkAt(px, pz);
        if (px % CHUNK_SIZE === 0) rebuildChunkAt(px - 1, pz);
        if (px % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(px + 1, pz);
        if (pz % CHUNK_SIZE === 0) rebuildChunkAt(px, pz - 1);
        if (pz % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(px, pz + 1);
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

      if (document.pointerLockElement === renderer.domElement) {
        player.update(dt);
      }

      // Update chunk loading every frame
      updateChunkLoading();

      // Update highlight box
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
        setFps(Math.round((frameCount * 1000) / (now - fpsTime)));
        setLoadedChunks(chunkMeshes.size);
        frameCount = 0;
        fpsTime = now;
      }
      posUpdateCounter++;
      if (posUpdateCounter > 15) {
        setPosInfo({
          x: Math.floor(player.position.x),
          y: Math.floor(player.position.y),
          z: Math.floor(player.position.z),
        });
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
  }, []);

  const handleStart = useCallback(() => {
    const canvas = containerRef.current?.querySelector("canvas");
    canvas?.requestPointerLock();
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-sky-400 select-none">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Crosshair */}
      {isLocked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="relative w-6 h-6">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-white mix-blend-difference" />
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white mix-blend-difference" />
          </div>
        </div>
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

      {/* HUD info */}
      <div className="absolute top-2 left-2 z-20 text-white font-mono text-xs sm:text-sm bg-black/50 px-2 py-1 rounded">
        <div>FPS: {fps}</div>
        <div>X: {posInfo.x} Y: {posInfo.y} Z: {posInfo.z}</div>
        <div>Chunks: {loadedChunks}</div>
        <div className="mt-1 text-white/70">{BLOCKS[HOTBAR_BLOCKS[selectedSlot]].name}</div>
      </div>

      {/* Start screen */}
      {!isLocked && isLoaded && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center cursor-pointer bg-black/50 backdrop-blur-sm"
          onClick={handleStart}
        >
          <div className="bg-stone-800/90 border-4 border-stone-900 rounded-lg p-6 sm:p-8 max-w-md mx-4 text-center text-white shadow-2xl">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-wide" style={{ fontFamily: "monospace" }}>
              MINICRAFT
            </h1>
            <p className="mb-4 text-stone-300 text-sm sm:text-base">
              Click para jugar
            </p>
            <div className="text-left text-xs sm:text-sm space-y-1 bg-stone-900/60 p-4 rounded">
              <div><span className="text-yellow-400 font-bold">WASD</span> — Moverse</div>
              <div><span className="text-yellow-400 font-bold">Mouse</span> — Mirar alrededor</div>
              <div><span className="text-yellow-400 font-bold">Espacio</span> — Saltar</div>
              <div><span className="text-yellow-400 font-bold">Shift</span> — Correr</div>
              <div><span className="text-yellow-400 font-bold">Click izq</span> — Romper bloque</div>
              <div><span className="text-yellow-400 font-bold">Click der</span> — Colocar bloque</div>
              <div><span className="text-yellow-400 font-bold">1-9 / Rueda</span> — Seleccionar bloque</div>
              <div><span className="text-yellow-400 font-bold">F</span> — Modo vuelo</div>
              <div><span className="text-yellow-400 font-bold">Esc</span> — Pausar / liberar mouse</div>
            </div>
            <p className="mt-4 text-xs text-stone-400">Mundo infinito procedural · Camina y se generan nuevos chunks</p>
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
