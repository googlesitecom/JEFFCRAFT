"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "@/lib/minecraft/world";
import { Player, GameMode } from "@/lib/minecraft/player";
import { buildChunkGeometry, ChunkMeshes } from "@/lib/minecraft/mesher";
import { buildTextureCanvases, buildIconDataURLs } from "@/lib/minecraft/textures";
import { getSharedAtlas, resetAtlas } from "@/lib/minecraft/atlas";
import { BlockType, BLOCKS, HOTBAR_BLOCKS } from "@/lib/minecraft/blocks";
import { ItemType, ITEMS, isItem, getDisplayName } from "@/lib/minecraft/items";
import { Inventory } from "@/lib/minecraft/inventory";
import { InventoryUI } from "./InventoryUI";
import { FurnaceUI } from "./FurnaceUI";
import { AnimalManager, Animal } from "@/lib/minecraft/animals";

const RENDER_RADIUS = 5;
const MAX_CHUNK_BUILDS_PER_FRAME = 2;

// Block hardness (mining time in seconds with bare hands)
const BLOCK_HARDNESS: Partial<Record<BlockType, number>> = {
  [BlockType.Grass]: 0.6,
  [BlockType.Dirt]: 0.5,
  [BlockType.Sand]: 0.5,
  [BlockType.Gravel]: 0.6,
  [BlockType.Snow]: 0.3,
  [BlockType.Planks]: 1.0,
  [BlockType.Wood]: 1.5,
  [BlockType.Leaves]: 0.3,
  [BlockType.Glass]: 0.3,
  [BlockType.Brick]: 2.0,
  [BlockType.Stone]: 1.5,
  [BlockType.Cobblestone]: 2.0,
  [BlockType.CoalOre]: 3.0,
  [BlockType.IronOre]: 3.0,
  [BlockType.GoldOre]: 3.0,
  [BlockType.DiamondOre]: 3.0,
  [BlockType.Bedrock]: Infinity,
  [BlockType.CraftingTable]: 1.0,
  [BlockType.Bookshelf]: 1.0,
  [BlockType.Pumpkin]: 1.0,
};

// What each block drops when broken
const BLOCK_DROPS: Partial<Record<BlockType, { id: number; count: number }>> = {
  [BlockType.Grass]: { id: BlockType.Dirt, count: 1 },
  [BlockType.Dirt]: { id: BlockType.Dirt, count: 1 },
  [BlockType.Sand]: { id: BlockType.Sand, count: 1 },
  [BlockType.Gravel]: { id: BlockType.Gravel, count: 1 },
  [BlockType.Snow]: { id: BlockType.Snow, count: 1 },
  [BlockType.Planks]: { id: BlockType.Planks, count: 1 },
  [BlockType.Wood]: { id: BlockType.Wood, count: 1 },
  [BlockType.Leaves]: { id: BlockType.Leaves, count: 1 }, // sometimes drops sapling/apple, keep simple
  [BlockType.Glass]: { id: BlockType.Glass, count: 1 }, // Minecraft: glass breaks and drops nothing, but we'll be generous
  [BlockType.Brick]: { id: BlockType.Brick, count: 1 },
  [BlockType.Stone]: { id: BlockType.Cobblestone, count: 1 }, // stone drops cobblestone
  [BlockType.Cobblestone]: { id: BlockType.Cobblestone, count: 1 },
  [BlockType.CoalOre]: { id: ItemType.Coal, count: 1 },
  [BlockType.IronOre]: { id: BlockType.IronOre, count: 1 }, // needs smelting, but we'll give the ore for now
  [BlockType.GoldOre]: { id: BlockType.GoldOre, count: 1 },
  [BlockType.DiamondOre]: { id: ItemType.Diamond, count: 1 },
  [BlockType.CraftingTable]: { id: BlockType.CraftingTable, count: 1 },
  [BlockType.Bookshelf]: { id: BlockType.Bookshelf, count: 1 },
  [BlockType.Pumpkin]: { id: BlockType.Pumpkin, count: 1 },
};

interface GameStats {
  fps: number;
  x: number;
  y: number;
  z: number;
  chunks: number;
  health: number;
  hunger: number;
  air: number;
  inWater: boolean;
  headInWater: boolean;
  breakProgress: number; // 0-1
}

interface WorldConfig {
  name: string;
  seed: number;
  mode: GameMode;
}

// =============== MAIN COMPONENT ===============
export default function MinecraftGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<"main-menu" | "create-world" | "playing">("main-menu");
  const [currentWorld, setCurrentWorld] = useState<WorldConfig | null>(null);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [stats, setStats] = useState<GameStats>({
    fps: 0, x: 0, y: 0, z: 0, chunks: 0,
    health: 20, hunger: 20, air: 10, inWater: false, headInWater: false, breakProgress: 0,
  });
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});
  const [isDead, setIsDead] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showCraftingTable, setShowCraftingTable] = useState(false);
  const [showFurnace, setShowFurnace] = useState(false);
  const [inventoryVersion, setInventoryVersion] = useState(0); // force re-render of hotbar/inventory

  const selectedSlotRef = useRef(0);
  const worldConfigRef = useRef<WorldConfig | null>(null);
  const inventoryRef = useRef<Inventory>(new Inventory());

  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  useEffect(() => {
    setIconUrls(buildIconDataURLs(buildTextureCanvases()));
  }, []);

  // === Main game effect ===
  useEffect(() => {
    if (screen !== "playing" || !worldConfigRef.current) return;
    if (!containerRef.current) return;

    const config = worldConfigRef.current;
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
    resetAtlas();
    const canvases = buildTextureCanvases();
    const atlas = getSharedAtlas(canvases);
    // Opaque material: solid blocks (no alpha)
    const opaqueMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
    });
    // Cutout material: leaves, glass - uses alphaTest (no blending, but discards transparent pixels)
    const cutoutMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      side: THREE.DoubleSide,
      transparent: false,
      alphaTest: 0.5,
      depthWrite: true,
    });
    // Translucent material: water only - alpha blended, depthWrite off
    const transparentMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // === World & Player ===
    const world = new World(config.seed);
    const player = new Player(world, camera, config.mode);

    // === Animal Manager ===
    // We'll access iconUrls via a ref since the effect doesn't re-run on iconUrls change
    const iconUrlsGlobal = iconUrls;
    // Pre-build animal textures from iconUrls
    const animalTextures: Record<string, THREE.Texture> = {};
    for (const name of ["pig", "cow", "chicken"]) {
      const url = iconUrlsGlobal[name];
      if (url) {
        const img = new Image();
        img.src = url;
        const tex = new THREE.Texture(img);
        img.onload = () => { tex.needsUpdate = true; };
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        animalTextures[name] = tex;
      }
    }

    const animalManager = new AnimalManager(world, scene, (name: string) => animalTextures[name] || null);

    // === Day/Night cycle ===
    let dayTime = 0.3; // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    const DAY_LENGTH = 240; // seconds for full cycle
    // Sun and moon meshes
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffff88, fog: false })
    );
    sunMesh.frustumCulled = false;
    scene.add(sunMesh);
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xeeeeff, fog: false })
    );
    moonMesh.frustumCulled = false;
    scene.add(moonMesh);
    // Stars (simple points)
    const starGeo = new THREE.BufferGeometry();
    const starPositions: number[] = [];
    for (let i = 0; i < 400; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 200;
      starPositions.push(r * Math.sin(phi) * Math.cos(theta), Math.abs(r * Math.cos(phi)), r * Math.sin(phi) * Math.sin(theta));
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true });
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(stars);

    function updateDayNight(dt: number) {
      dayTime = (dayTime + dt / DAY_LENGTH) % 1;
      // Sun position: angle based on dayTime (0.25 = sunrise at east, 0.5 = noon, 0.75 = sunset at west)
      const sunAngle = (dayTime - 0.25) * Math.PI * 2;
      const sunDist = 150;
      sunMesh.position.set(
        player.position.x + Math.cos(sunAngle) * sunDist,
        player.position.y + Math.sin(sunAngle) * sunDist,
        player.position.z
      );
      // Moon is opposite the sun
      moonMesh.position.set(
        player.position.x - Math.cos(sunAngle) * sunDist,
        player.position.y - Math.sin(sunAngle) * sunDist,
        player.position.z
      );
      // Stars follow player
      stars.position.copy(player.position);

      // Calculate light intensity based on sun height
      const sunHeight = Math.sin(sunAngle); // -1 to 1
      // Day: sunHeight > 0, Night: sunHeight < 0
      const dayFactor = Math.max(0, Math.min(1, (sunHeight + 0.2) / 0.4)); // smooth transition
      const nightFactor = 1 - dayFactor;

      // Sun light intensity
      sun.intensity = 0.6 * dayFactor;
      ambient.intensity = 0.7 * dayFactor + 0.15 * nightFactor;
      hemi.intensity = 0.35 * dayFactor + 0.1 * nightFactor;

      // Sky color: day = light blue, night = dark blue
      const dayColor = new THREE.Color("#87ceeb");
      const nightColor = new THREE.Color("#0a0a2a");
      const sunsetColor = new THREE.Color("#ff8844");
      // During sunrise/sunset, blend with orange
      const isTwilight = Math.abs(sunHeight) < 0.3;
      let skyColor: THREE.Color;
      if (isTwilight && dayFactor > 0.3 && dayFactor < 0.7) {
        // Blend day color with sunset
        const t = Math.abs(sunHeight) / 0.3;
        skyColor = nightColor.clone().lerp(sunsetColor, 1 - t).lerp(dayColor, t);
      } else {
        skyColor = nightColor.clone().lerp(dayColor, dayFactor);
      }
      scene.background = skyColor;
      (scene.fog as THREE.Fog).color = skyColor;

      // Sun/moon visibility
      sunMesh.visible = sunHeight > -0.1;
      moonMesh.visible = sunHeight < 0.1;
      (starMat as THREE.PointsMaterial).opacity = nightFactor;
    }

    // === Chunk manager ===
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
      chunkMeshes.set(key, { opaque: null, cutout: null, transparent: null });
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
      const meshes = buildChunkGeometry(world, cx, cz, atlas, opaqueMaterial, cutoutMaterial, transparentMaterial);
      if (meshes.opaque) chunkGroup.add(meshes.opaque);
      if (meshes.cutout) chunkGroup.add(meshes.cutout);
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
      if (m.cutout) {
        chunkGroup.remove(m.cutout);
        m.cutout.geometry.dispose();
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
          chunkMeshes.set(key, { opaque: null, cutout: null, transparent: null });
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

    function placeBlock(): boolean {
      const result = player.raycast(6);
      if (!result.hit || !result.block || !result.normal) return false;
      const px = result.block.x + result.normal.x;
      const py = result.block.y + result.normal.y;
      const pz = result.block.z + result.normal.z;
      if (py < 0 || py >= WORLD_HEIGHT) return false;
      const existing = world.getBlock(px, py, pz);
      if (existing !== BlockType.Air && existing !== BlockType.Water) return false;

      // In survival: use the selected hotbar item (must be a placeable block)
      // In creative: use HOTBAR_BLOCKS
      let blockType: BlockType;
      const mode = worldConfigRef.current?.mode;
      if (mode === "survival") {
        const selected = inventoryRef.current.getSelected();
        if (!selected || selected.id >= 100) return false; // no selected item or it's a tool/food
        blockType = selected.id as BlockType;
        // Remove one from inventory
        if (!inventoryRef.current.removeSelected(1)) return false;
        setInventoryVersion((v) => v + 1);
      } else {
        blockType = HOTBAR_BLOCKS[selectedSlotRef.current];
      }

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
        // Refund the item
        if (mode === "survival") {
          inventoryRef.current.addItem(blockType, 1);
          setInventoryVersion((v) => v + 1);
        }
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

    // Mining state: track which block is being mined and progress
    let miningBlock: { x: number; y: number; z: number } | null = null;
    let miningProgress: number = 0; // 0 to 1

    function breakBlock(): boolean {
      // Instant break (creative mode)
      const result = player.raycast(6);
      if (!result.hit || !result.block) return false;
      const { x, y, z } = result.block;
      const blockType = world.getBlock(x, y, z);
      if (blockType === BlockType.Bedrock) return false;
      world.setBlock(x, y, z, BlockType.Air);
      rebuildChunkAt(x, z);
      if (x % CHUNK_SIZE === 0) rebuildChunkAt(x - 1, z);
      if (x % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x + 1, z);
      if (z % CHUNK_SIZE === 0) rebuildChunkAt(x, z - 1);
      if (z % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x, z + 1);
      // Drop in creative too (for inventory mode)
      const drop = BLOCK_DROPS[blockType];
      if (drop && worldConfigRef.current?.mode === "survival") {
        inventoryRef.current.addItem(drop.id, drop.count);
        setInventoryVersion((v) => v + 1);
      }
      return true;
    }

    // Continuous mining for survival mode - called every frame while mouse held
    function mineBlockContinuous(dt: number) {
      if (!miningBlock) return;
      const { x, y, z } = miningBlock;
      const blockType = world.getBlock(x, y, z);
      if (blockType === BlockType.Air || blockType === BlockType.Bedrock) {
        miningProgress = 0;
        miningBlock = null;
        return;
      }

      const hardness = BLOCK_HARDNESS[blockType] ?? 1.0;
      if (hardness === Infinity) return;

      // Get mining speed from selected tool
      let speed = 1.0;
      const selected = inventoryRef.current.getSelected();
      if (selected && selected.id >= 100) {
        const itemDef = ITEMS[selected.id as ItemType];
        if (itemDef?.miningSpeed) {
          const isStoneLike = [BlockType.Stone, BlockType.Cobblestone, BlockType.CoalOre, BlockType.IronOre, BlockType.GoldOre, BlockType.DiamondOre, BlockType.Brick].includes(blockType);
          if (isStoneLike && itemDef.toolType === "pickaxe") {
            speed = itemDef.miningSpeed;
          } else if (!isStoneLike && (itemDef.toolType === "axe" || itemDef.toolType === "shovel")) {
            speed = itemDef.miningSpeed;
          }
        }
      }

      // Stone and ores require a pickaxe
      const requiresPickaxe = [BlockType.Stone, BlockType.Cobblestone, BlockType.CoalOre, BlockType.IronOre, BlockType.GoldOre, BlockType.DiamondOre, BlockType.Brick].includes(blockType);
      if (requiresPickaxe) {
        const hasPickaxe = selected && selected.id >= 100 && ITEMS[selected.id as ItemType]?.toolType === "pickaxe";
        if (!hasPickaxe) {
          miningProgress = 0;
          return;
        }
      }

      const miningTime = hardness / speed;
      miningProgress += dt / miningTime;

      if (miningProgress >= 1.0) {
        // Block broken!
        world.setBlock(x, y, z, BlockType.Air);
        rebuildChunkAt(x, z);
        if (x % CHUNK_SIZE === 0) rebuildChunkAt(x - 1, z);
        if (x % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x + 1, z);
        if (z % CHUNK_SIZE === 0) rebuildChunkAt(x, z - 1);
        if (z % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x, z + 1);

        // Drop the item
        const drop = BLOCK_DROPS[blockType];
        if (drop) {
          inventoryRef.current.addItem(drop.id, drop.count);
          setInventoryVersion((v) => v + 1);
        }

        miningProgress = 0;
        miningBlock = null;
      }
    }

    // Block highlight
    const highlightGeo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const highlightEdges = new THREE.EdgesGeometry(highlightGeo);
    const highlightMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const highlight = new THREE.LineSegments(highlightEdges, highlightMat);
    highlight.visible = false;
    scene.add(highlight);

    // Underwater overlay (blue tint when head in water)
    const waterOverlay = document.createElement("div");
    waterOverlay.style.position = "absolute";
    waterOverlay.style.inset = "0";
    waterOverlay.style.pointerEvents = "none";
    waterOverlay.style.zIndex = "5";
    waterOverlay.style.background = "rgba(40, 90, 200, 0.35)";
    waterOverlay.style.display = "none";
    container.appendChild(waterOverlay);

    // === Input handling ===
    // Track mouse button states for continuous mining
    let leftMouseDown = false;
    let rightMouseDown = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyE" && document.pointerLockElement) {
        // Open inventory
        document.exitPointerLock();
        setShowInventory(true);
        return;
      }
      if (!document.pointerLockElement) return;
      player.setKey(e.code, true);

      if (e.code.startsWith("Digit")) {
        const num = parseInt(e.code.replace("Digit", ""));
        if (num >= 1 && num <= 9) {
          const idx = num - 1;
          setSelectedSlot(idx);
          selectedSlotRef.current = idx;
          inventoryRef.current.setSelected(idx);
        }
      }

      if (e.code === "KeyF") player.toggleFly();
      if (e.code === "KeyM") placeBlock();
      if (e.code === "Escape") document.exitPointerLock();
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
        leftMouseDown = true;
        // In creative, break immediately. In survival, mining happens in render loop.
        if (worldConfigRef.current?.mode === "creative") {
          breakBlock();
        } else {
          // Start mining - initialize the mining block
          const hit = player.raycast(6);
          if (hit.hit && hit.block) {
            miningBlock = { ...hit.block };
            miningProgress = 0;
          }
        }
      } else if (e.button === 2) {
        rightMouseDown = true;
        // Check if we're right-clicking a crafting table or furnace
        const hit = player.raycast(6);
        if (hit.hit && hit.block) {
          const block = world.getBlock(hit.block.x, hit.block.y, hit.block.z);
          if (block === BlockType.CraftingTable) {
            // Open crafting table UI
            document.exitPointerLock();
            setShowCraftingTable(true);
            return;
          }
          if (block === BlockType.Furnace) {
            // Open furnace UI
            document.exitPointerLock();
            setShowFurnace(true);
            return;
          }
        }
        // Also check for attacking animals on right-click? No, left-click attacks
        placeBlock();
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        leftMouseDown = false;
        miningProgress = 0;
        miningBlock = null;
      } else if (e.button === 2) {
        rightMouseDown = false;
      }
    };
    renderer.domElement.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
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
    let waterAnimTime = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      waterAnimTime += dt;

      // Day/night cycle (always runs)
      updateDayNight(dt);

      if (document.pointerLockElement === renderer.domElement && !player.isDead()) {
        player.update(dt);
      }

      // Update animals (always, even when paused)
      animalManager.update(dt, player.position.x, player.position.z);

      if (player.isDead()) {
        setIsDead(true);
      }

      // Continuous mining in survival mode when left mouse is held
      // But first check if we're aiming at an animal to attack it
      if (leftMouseDown && document.pointerLockElement === renderer.domElement && !player.isDead()) {
        // Try to find an animal in front of the player (within 4 blocks)
        const eyeX = player.position.x;
        const eyeY = player.position.y + 1.5;
        const eyeZ = player.position.z;
        const animal = animalManager.findClosest(eyeX, eyeY, eyeZ, 4);
        if (animal) {
          // Attack the animal - damage based on selected item
          let damage = 1; // bare hands
          const selected = inventoryRef.current.getSelected();
          if (selected && selected.id >= 100) {
            const itemDef = ITEMS[selected.id as ItemType];
            if (itemDef?.toolType === "sword") {
              damage = 4 + (itemDef.toolTier === "diamond" ? 3 : itemDef.toolTier === "iron" ? 2 : itemDef.toolTier === "stone" ? 1 : 0);
            } else if (itemDef?.toolType === "axe") {
              damage = 3;
            }
          }
          const died = animal.takeDamage(damage);
          if (died) {
            // Drop loot
            const drops = animal.getDrops();
            for (const drop of drops) {
              inventoryRef.current.addItem(drop.id, drop.count);
            }
            setInventoryVersion((v) => v + 1);
            animalManager.removeAnimal(animal);
          }
          // Don't process mining while attacking
        } else {
          // Mine block
          const hit = player.raycast(6);
          if (hit.hit && hit.block) {
            if (!miningBlock || miningBlock.x !== hit.block.x || miningBlock.y !== hit.block.y || miningBlock.z !== hit.block.z) {
              miningProgress = 0;
              miningBlock = { ...hit.block };
            }
            mineBlockContinuous(dt);
          } else {
            miningProgress = 0;
            miningBlock = null;
          }
        }
      }

      updateChunkLoading();

      // Highlight
      const hit = player.raycast(6);
      if (hit.hit && hit.block) {
        highlight.visible = true;
        highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
        // Highlight color changes with mining progress
        if (miningProgress > 0) {
          (highlight.material as THREE.LineBasicMaterial).color.setRGB(1, 1 - miningProgress * 0.5, 0);
        } else {
          (highlight.material as THREE.LineBasicMaterial).color.setRGB(0, 0, 0);
        }
      } else {
        highlight.visible = false;
      }

      // Water overlay
      waterOverlay.style.display = player.headInWater ? "block" : "none";

      // Slightly tint water material with time for animated feel
      // (kept simple - just keep opacity stable)

      renderer.render(scene, camera);

      frameCount++;
      if (now - fpsTime > 500) {
        const newFps = Math.round((frameCount * 1000) / (now - fpsTime));
        frameCount = 0;
        fpsTime = now;
        setStats((s) => ({
          ...s,
          fps: newFps,
          chunks: chunkMeshes.size,
        }));
      }
      posUpdateCounter++;
      if (posUpdateCounter > 8) {
        setStats((s) => ({
          ...s,
          x: Math.floor(player.position.x),
          y: Math.floor(player.position.y),
          z: Math.floor(player.position.z),
          health: player.health,
          hunger: player.hunger,
          air: player.air,
          inWater: player.inWater,
          headInWater: player.headInWater,
          breakProgress: miningProgress,
        }));
        posUpdateCounter = 0;
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      renderer.domElement.removeEventListener("mousedown", handleMouseDown);
      renderer.domElement.removeEventListener("click", handleCanvasClick);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      chunkMeshes.forEach((c) => {
        c.opaque?.geometry.dispose();
        c.cutout?.geometry.dispose();
        c.transparent?.geometry.dispose();
      });
      // Dispose animals
      animalManager.dispose();
      // Dispose day/night objects
      sunMesh.geometry.dispose();
      (sunMesh.material as THREE.Material).dispose();
      moonMesh.geometry.dispose();
      (moonMesh.material as THREE.Material).dispose();
      starGeo.dispose();
      starMat.dispose();
      // Dispose animal textures
      for (const tex of Object.values(animalTextures)) {
        tex.dispose();
      }
      atlas.texture.dispose();
      opaqueMaterial.dispose();
      cutoutMaterial.dispose();
      transparentMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      if (waterOverlay.parentElement === container) {
        container.removeChild(waterOverlay);
      }
    };
  }, [screen]);

  const startWorld = useCallback((config: WorldConfig) => {
    worldConfigRef.current = config;
    setCurrentWorld(config);
    setScreen("playing");
    setIsLoaded(false);
    setIsDead(false);
  }, []);

  const handleRespawn = useCallback(() => {
    setScreen("main-menu");
    setTimeout(() => {
      if (worldConfigRef.current) {
        setScreen("playing");
        setIsLoaded(false);
        setIsDead(false);
      }
    }, 50);
  }, []);

  const handleExitToMenu = useCallback(() => {
    setScreen("main-menu");
    setIsDead(false);
    setCurrentWorld(null);
  }, []);

  const handleStartClick = useCallback(() => {
    const canvas = containerRef.current?.querySelector("canvas");
    canvas?.requestPointerLock();
  }, []);

  // === SCREENS ===
  if (screen === "main-menu") {
    return <MainMenu iconUrls={iconUrls} onCreateWorld={() => setScreen("create-world")} />;
  }
  if (screen === "create-world") {
    return (
      <CreateWorldScreen
        onCancel={() => setScreen("main-menu")}
        onCreate={startWorld}
      />
    );
  }

  // === GAME SCREEN ===
  const mode = currentWorld?.mode || "creative";
  return (
    <div className="relative w-full h-screen overflow-hidden bg-sky-400 select-none">
      <div ref={containerRef} className="absolute inset-0" />

      {isLocked && !isDead && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="relative w-6 h-6">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-white mix-blend-difference" />
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white mix-blend-difference" />
          </div>
        </div>
      )}

      {/* HUD */}
      <div className="absolute top-2 left-2 z-20 text-white font-mono text-xs sm:text-sm bg-black/50 px-2 py-1 rounded">
        <div className="font-bold text-yellow-300">{currentWorld?.name || "Mundo"}</div>
        <div>FPS: {stats.fps}</div>
        <div>X: {stats.x} Y: {stats.y} Z: {stats.z}</div>
        <div>Chunks: {stats.chunks}</div>
        <div className="mt-1 text-white/70">
          {mode === "survival"
            ? (() => {
                const stack = inventoryRef.current.slots[selectedSlot];
                if (!stack) return "(vacío)";
                if (stack.id < 100) return BLOCKS[stack.id as BlockType]?.name ?? "Unknown";
                return ITEMS[stack.id as ItemType]?.name ?? "Unknown";
              })()
            : BLOCKS[HOTBAR_BLOCKS[selectedSlot]].name}
        </div>
        <div className="mt-1 text-yellow-300/80">{mode === "creative" ? "Creativo" : "Survival"}</div>
        {mode === "survival" && (
          <div className="mt-1 text-white/50 text-[10px]">E: Inventario</div>
        )}
      </div>

      {/* Survival stats */}
      {mode === "survival" && (
        <>
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Heart key={i} filled={Math.min(2, Math.max(0, stats.health - i * 2))} />
            ))}
          </div>
          <div className="absolute bottom-20 left-1/2 translate-x-[180px] z-20 flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Drumstick key={i} filled={Math.min(2, Math.max(0, stats.hunger - i * 2))} />
            ))}
          </div>
          {/* Air bubbles */}
          {stats.air < 10 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 translate-y-[-30px] z-20 flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Bubble key={i} filled={stats.air > i} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Hotbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 p-1 bg-black/40 rounded-md backdrop-blur-sm" key={inventoryVersion}>
        {Array.from({ length: 9 }).map((_, i) => {
          const isSelected = i === selectedSlot;
          let iconUrl = "";
          let count = 0;
          let name = "";

          if (mode === "survival") {
            // Show inventory items
            const stack = inventoryRef.current.slots[i];
            if (stack) {
              count = stack.count;
              if (stack.id < 100) {
                // Block
                const def = BLOCKS[stack.id as BlockType];
                if (def) {
                  name = def.name;
                  const iconName = stack.id === BlockType.Grass ? "grass_side" : (def.textures.side || def.textures.top);
                  iconUrl = iconUrls[iconName] ?? "";
                }
              } else {
                // Item
                const def = ITEMS[stack.id as ItemType];
                if (def) {
                  name = def.name;
                  iconUrl = iconUrls[def.icon] ?? "";
                }
              }
            }
          } else {
            // Creative: show HOTBAR_BLOCKS
            const blockType = HOTBAR_BLOCKS[i];
            const def = BLOCKS[blockType];
            name = def.name;
            const iconName = def.textures.side === "grass_side" ? "grass_side" : def.textures.top === "dirt" ? "dirt" : def.textures.top || def.textures.side;
            iconUrl = iconUrls[iconName] ?? "";
            count = 0; // infinite in creative
          }

          return (
            <div
              key={i}
              className={`w-12 h-12 sm:w-14 sm:h-14 border-2 flex items-center justify-center relative ${
                isSelected ? "border-white bg-white/20" : "border-gray-500 bg-gray-800/60"
              }`}
              style={{ imageRendering: "pixelated" }}
              title={name}
            >
              {iconUrl && (
                <img src={iconUrl} alt={name} className="w-10 h-10 sm:w-12 sm:h-12" style={{ imageRendering: "pixelated" }} draggable={false} />
              )}
              <span className="absolute top-0 left-1 text-[10px] text-white/80 font-mono">{i + 1}</span>
              {count > 1 && (
                <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold" style={{ textShadow: "1px 1px 0 #000" }}>
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Start overlay */}
      {!isLocked && isLoaded && !isDead && !showInventory && !showCraftingTable && !showFurnace && (
        <div className="absolute inset-0 z-30 flex items-center justify-center cursor-pointer bg-black/60 backdrop-blur-sm" onClick={handleStartClick}>
          <div className="bg-stone-800/95 border-4 border-stone-900 rounded-lg p-6 sm:p-8 max-w-md mx-4 text-center text-white shadow-2xl">
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-wide" style={{ fontFamily: "monospace" }}>
              {currentWorld?.name || "MINICRAFT"}
            </h1>
            <p className="mb-3 text-stone-300 text-sm">
              Modo: <span className="text-yellow-400 font-bold">{mode === "creative" ? "Creativo" : "Survival"}</span>
            </p>
            <div className="text-left text-xs sm:text-sm space-y-1 bg-stone-900/60 p-4 rounded">
              <div><span className="text-yellow-400 font-bold">WASD</span> — Moverse</div>
              <div><span className="text-yellow-400 font-bold">Mouse</span> — Mirar alrededor</div>
              <div><span className="text-yellow-400 font-bold">Espacio</span> — Saltar / Nadar arriba</div>
              <div><span className="text-yellow-400 font-bold">Shift</span> — Correr</div>
              <div><span className="text-yellow-400 font-bold">Click izq</span> — {mode === "survival" ? "Minar bloque / Atacar animal" : "Romper bloque"}</div>
              <div><span className="text-yellow-400 font-bold">Click der / M</span> — Colocar bloque</div>
              <div><span className="text-yellow-400 font-bold">1-9 / Rueda</span> — Seleccionar slot</div>
              {mode === "survival" && <div><span className="text-yellow-400 font-bold">E</span> — Abrir inventario</div>}
              {mode === "survival" && <div><span className="text-yellow-400 font-bold">Click der en mesa</span> — Craftear</div>}
              {mode === "survival" && <div><span className="text-yellow-400 font-bold">Click der en horno</span> — Cocer comida</div>}
              {mode === "creative" && <div><span className="text-yellow-400 font-bold">F</span> — Vuelo</div>}
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
              <button onClick={handleRespawn} className="px-6 py-3 bg-green-700 hover:bg-green-600 border-2 border-green-500 rounded text-lg font-bold transition-colors">
                Reaparecer
              </button>
              <button onClick={handleExitToMenu} className="px-6 py-3 bg-stone-700 hover:bg-stone-600 border-2 border-stone-500 rounded text-lg font-bold transition-colors">
                Menú principal
              </button>
            </div>
          </div>
        </div>
      )}

      {!isLoaded && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
          <div className="text-white font-mono text-xl">Generando mundo...</div>
        </div>
      )}

      {/* Mining progress bar */}
      {stats.breakProgress > 0 && stats.breakProgress < 1 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-8 z-15 w-24 h-3 bg-black/60 border border-white/50 rounded">
          <div
            className="h-full bg-white/80 transition-all"
            style={{ width: `${stats.breakProgress * 100}%` }}
          />
        </div>
      )}

      {/* Inventory UI */}
      {showInventory && (
        <InventoryUI
          inventory={inventoryRef.current}
          iconUrls={iconUrls}
          isCraftingTable={false}
          onClose={() => {
            setShowInventory(false);
          }}
          onInventoryChange={() => setInventoryVersion((v) => v + 1)}
        />
      )}

      {/* Crafting Table UI */}
      {showCraftingTable && (
        <InventoryUI
          inventory={inventoryRef.current}
          iconUrls={iconUrls}
          isCraftingTable={true}
          onClose={() => {
            setShowCraftingTable(false);
          }}
          onInventoryChange={() => setInventoryVersion((v) => v + 1)}
        />
      )}

      {/* Furnace UI */}
      {showFurnace && (
        <FurnaceUI
          inventory={inventoryRef.current}
          iconUrls={iconUrls}
          onClose={() => {
            setShowFurnace(false);
          }}
          onInventoryChange={() => setInventoryVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

// =============== MAIN MENU (Minecraft-style) ===============
function MainMenu({
  iconUrls,
  onCreateWorld,
}: {
  iconUrls: Record<string, string>;
  onCreateWorld: () => void;
}) {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-sky-400 via-sky-500 to-emerald-800 select-none">
      {/* Animated dirt background pattern */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: "repeating-linear-gradient(0deg, #5e3f29 0px, #79553a 16px, #5e3f29 32px), repeating-linear-gradient(90deg, transparent 0px, transparent 16px, rgba(0,0,0,0.2) 16px, rgba(0,0,0,0.2) 32px)"
      }} />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
        {/* Logo */}
        <div className="mb-12 text-center transform -rotate-3">
          <h1
            className="text-6xl sm:text-8xl font-black tracking-wider text-white"
            style={{
              fontFamily: "monospace",
              textShadow: "4px 4px 0 #2a2a2a, 8px 8px 0 rgba(0,0,0,0.3)",
              WebkitTextStroke: "2px #2a2a2a",
            }}
          >
            MINICRAFT
          </h1>
          <p className="text-white/90 mt-2 text-sm font-mono drop-shadow-lg">
            Edición voxel · Java-inspired
          </p>
        </div>

        {/* Menu buttons (Minecraft style) */}
        <div className="flex flex-col gap-3 w-full max-w-md">
          <MenuButton primary onClick={onCreateWorld}>
            Crear nuevo mundo
          </MenuButton>
          <MenuButton disabled>
            Cargar mundo
          </MenuButton>
          <MenuButton disabled>
            Opciones
          </MenuButton>
          <MenuButton disabled>
            Salir del juego
          </MenuButton>
        </div>

        <p className="mt-12 text-white/60 text-xs font-mono">
          Minicraft no está afiliado con Mojang o Microsoft.
        </p>
      </div>

      {/* Decorative blocks at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-16 flex">
        {Array.from({ length: 32 }).map((_, i) => {
          const blocks = ["grass_top", "dirt", "stone", "sand", "wood_top", "leaves"];
          const name = blocks[i % blocks.length];
          const url = iconUrls[name];
          return (
            <div key={i} className="flex-1 h-full" style={{ imageRendering: "pixelated" }}>
              {url && <img src={url} alt="" className="w-full h-full" style={{ imageRendering: "pixelated" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative py-3 px-6 text-lg font-bold font-mono tracking-wide transition-all
        ${disabled
          ? "bg-stone-700/50 text-stone-500 cursor-not-allowed border-2 border-stone-800"
          : primary
            ? "bg-stone-800 hover:bg-stone-700 text-white border-2 border-stone-900 hover:border-green-400 hover:scale-[1.02] active:scale-95 shadow-lg"
            : "bg-stone-800/80 hover:bg-stone-700 text-white border-2 border-stone-900 hover:border-stone-400 hover:scale-[1.02] active:scale-95 shadow-lg"
        }
      `}
      style={{ imageRendering: "pixelated" }}
    >
      {children}
    </button>
  );
}

// =============== CREATE WORLD SCREEN ===============
function CreateWorldScreen({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (config: WorldConfig) => void;
}) {
  const [name, setName] = useState("Nuevo Mundo");
  const [seedStr, setSeedStr] = useState("");
  const [mode, setMode] = useState<GameMode>("creative");

  const handleCreate = () => {
    // Generate seed from string or random
    let seed: number;
    if (seedStr.trim() === "") {
      seed = Math.floor(Math.random() * 1000000);
    } else {
      // Hash string to seed
      let h = 0;
      for (let i = 0; i < seedStr.length; i++) {
        h = (h * 31 + seedStr.charCodeAt(i)) | 0;
      }
      seed = Math.abs(h);
    }
    onCreate({ name: name.trim() || "Nuevo Mundo", seed, mode });
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-stone-800 to-stone-900 select-none">
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
        <h2
          className="text-4xl sm:text-5xl font-black text-white mb-8"
          style={{
            fontFamily: "monospace",
            textShadow: "3px 3px 0 #2a2a2a",
            WebkitTextStroke: "1px #2a2a2a",
          }}
        >
          Crear Nuevo Mundo
        </h2>

        <div className="w-full max-w-2xl bg-stone-900/80 border-4 border-stone-700 rounded-lg p-6 space-y-6">
          {/* World name */}
          <div>
            <label className="block text-white font-mono text-sm mb-2">Nombre del mundo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="w-full bg-stone-800 border-2 border-stone-600 focus:border-green-400 text-white font-mono px-4 py-2 rounded outline-none transition-colors"
              placeholder="Mi mundo épico"
            />
          </div>

          {/* Seed */}
          <div>
            <label className="block text-white font-mono text-sm mb-2">
              Semilla del mundo <span className="text-stone-500">(opcional)</span>
            </label>
            <input
              type="text"
              value={seedStr}
              onChange={(e) => setSeedStr(e.target.value)}
              className="w-full bg-stone-800 border-2 border-stone-600 focus:border-green-400 text-white font-mono px-4 py-2 rounded outline-none transition-colors"
              placeholder="Dejar vacío para semilla aleatoria"
            />
            <p className="text-stone-500 text-xs mt-1 font-mono">
              La misma semilla siempre genera el mismo mundo
            </p>
          </div>

          {/* Mode selection */}
          <div>
            <label className="block text-white font-mono text-sm mb-3">Modo de juego</label>
            <div className="grid grid-cols-2 gap-4">
              <ModeCard
                selected={mode === "creative"}
                onClick={() => setMode("creative")}
                title="Creativo"
                icon="🏗️"
                description="Vuelo libre, bloques infinitos, sin daño"
                color="yellow"
              />
              <ModeCard
                selected={mode === "survival"}
                onClick={() => setMode("survival")}
                title="Survival"
                icon="⚔️"
                description="Sobrevive, hambre, daño por caída, ahogo"
                color="red"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4 mt-8">
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-stone-700 hover:bg-stone-600 border-2 border-stone-500 text-white font-mono font-bold rounded transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            className="px-8 py-3 bg-green-700 hover:bg-green-600 border-2 border-green-500 text-white font-mono font-bold rounded transition-colors shadow-lg"
          >
            Crear Mundo
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  title,
  icon,
  description,
  color,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  icon: string;
  description: string;
  color: "yellow" | "red";
}) {
  const border = selected ? (color === "yellow" ? "border-yellow-400" : "border-red-400") : "border-stone-600";
  const bg = selected ? (color === "yellow" ? "bg-yellow-400/10" : "bg-red-400/10") : "bg-stone-800";
  return (
    <button
      onClick={onClick}
      className={`p-4 border-2 ${border} ${bg} rounded-lg text-left transition-all hover:scale-[1.02]`}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">{icon}</span>
        <h3 className="text-white font-mono font-bold text-lg">{title}</h3>
        {selected && (
          <span className={`ml-auto text-xs font-mono px-2 py-1 rounded ${color === "yellow" ? "bg-yellow-400 text-stone-900" : "bg-red-400 text-stone-900"}`}>
            ✓
          </span>
        )}
      </div>
      <p className="text-stone-400 text-xs font-mono">{description}</p>
    </button>
  );
}

// =============== HUD ICONS ===============
function Heart({ filled }: { filled: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      <path d="M3,2 L5,2 L5,3 L3,3 Z M5,3 L7,3 L7,4 L5,4 Z M7,4 L9,4 L9,5 L7,5 Z M9,3 L11,3 L11,4 L9,4 Z M11,2 L13,2 L13,3 L11,3 Z M3,3 L2,3 L2,5 L3,5 Z M13,3 L14,3 L14,5 L13,5 Z M2,5 L3,5 L3,6 L2,6 Z M13,5 L14,5 L14,6 L13,6 Z M3,6 L4,6 L4,7 L3,7 Z M12,6 L13,6 L13,7 L12,7 Z M4,7 L5,7 L5,8 L4,8 Z M11,7 L12,7 L12,8 L11,8 Z M5,8 L6,8 L6,9 L5,9 Z M10,8 L11,8 L11,9 L10,9 Z M6,9 L7,9 L7,10 L6,10 Z M9,9 L10,9 L10,10 L9,10 Z M7,10 L8,10 L8,11 L7,11 Z M8,10 L9,10 L9,11 L8,11 Z" fill="#3a0000" />
      {filled >= 1 && (
        <path d="M4,3 L5,3 L5,4 L4,4 Z M6,4 L7,4 L7,5 L6,5 Z M8,4 L9,4 L9,5 L8,5 Z M10,3 L11,3 L11,4 L10,4 Z M3,4 L4,4 L4,5 L3,5 Z M12,4 L13,4 L13,5 L12,5 Z M3,5 L4,5 L4,6 L3,6 Z M12,5 L13,5 L13,6 L12,6 Z M4,6 L5,5 L5,6 L4,6 Z M11,6 L12,6 L12,5 L11,5 Z M5,7 L6,7 L6,8 L5,8 Z M10,7 L11,7 L11,8 L10,8 Z M6,8 L7,8 L7,9 L6,9 Z M9,8 L10,8 L10,9 L9,9 Z M7,9 L8,9 L8,10 L7,10 Z M8,9 L9,9 L9,10 L8,10 Z" fill="#ff0000" />
      )}
    </svg>
  );
}

function Drumstick({ filled }: { filled: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      <path d="M10,2 L12,2 L12,3 L13,3 L13,4 L14,4 L14,5 L13,5 L13,6 L12,6 L12,7 L11,7 L11,8 L10,8 L10,9 L9,9 L9,10 L8,10 L8,11 L7,11 L7,12 L6,12 L6,13 L5,13 L5,14 L4,14 L4,13 L3,13 L3,12 L4,12 L4,11 L5,11 L5,10 L6,10 L6,9 L7,9 L7,8 L8,8 L8,7 L9,7 L9,6 L10,6 L10,5 L11,5 L11,4 L10,4 Z" fill="#3a2a00" />
      {filled >= 1 && (
        <path d="M10,3 L11,3 L11,4 L12,4 L12,5 L13,5 L13,6 L12,6 L12,7 L11,7 L11,8 L10,8 L10,9 L9,9 L9,10 L8,10 L8,11 L7,11 L7,12 L6,12 L6,11 L7,11 L7,10 L8,10 L8,9 L9,9 L9,8 L10,8 L10,7 L11,7 L11,6 L12,6 L12,5 L11,5 L11,4 L10,4 Z" fill="#8b4513" />
      )}
      {filled >= 2 && (
        <path d="M5,12 L6,12 L6,13 L5,13 Z M4,13 L5,13 L5,14 L4,14 Z" fill="#deb887" />
      )}
    </svg>
  );
}

function Bubble({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      {filled ? (
        <path d="M4,4 L12,4 L12,12 L4,12 Z M6,6 L10,6 L10,10 L6,10 Z" fill="#aaaaee" />
      ) : (
        <path d="M4,4 L12,4 L12,12 L4,12 Z M6,6 L10,6 L10,10 L6,10 Z" fill="#333344" />
      )}
    </svg>
  );
}
