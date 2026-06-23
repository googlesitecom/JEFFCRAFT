"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "@/lib/minecraft/world";
import { Player, GameMode } from "@/lib/minecraft/player";
import { buildChunkGeometry, ChunkMeshes } from "@/lib/minecraft/mesher";
import { buildTextureCanvases, buildIconDataURLs, loadRealTextures } from "@/lib/minecraft/textures";
import { getSharedAtlas, resetAtlas } from "@/lib/minecraft/atlas";
import { BlockType, BLOCKS, HOTBAR_BLOCKS } from "@/lib/minecraft/blocks";
import { ItemType, ITEMS, isItem, getDisplayName } from "@/lib/minecraft/items";
import { Inventory } from "@/lib/minecraft/inventory";
import { InventoryUI } from "./InventoryUI";
import { FurnaceUI } from "./FurnaceUI";
import { AnimalManager, Animal } from "@/lib/minecraft/animals";
import { saveWorld, loadWorld, applySavedWorld, listSavedWorlds, deleteWorld, SavedWorld } from "@/lib/minecraft/save";
import { HandView, HandAction } from "@/lib/minecraft/hand";
import { DropManager } from "@/lib/minecraft/drops";
import { getSound } from "@/lib/minecraft/sound";
import { MonsterManager, Monster } from "@/lib/minecraft/monsters";
import { XpState } from "@/lib/minecraft/xp";
import { DragonManager, DragonPet } from "@/lib/minecraft/dragon";
import { ArmorSlots, emptyArmor, serializeArmor, deserializeArmor, equipArmor as equipArmorFn } from "@/lib/minecraft/armor";
import { computeMining, BLOCK_HARDNESS as MINING_BLOCK_HARDNESS } from "@/lib/minecraft/mining";
import { NetherWorld } from "@/lib/minecraft/nether";
import { EndermanManager, Enderman } from "@/lib/minecraft/enderman";
import { BlazeManager, Blaze } from "@/lib/minecraft/blaze";
import { EndWorld } from "@/lib/minecraft/end";
import { EnderDragon } from "@/lib/minecraft/ender-dragon";

const RENDER_RADIUS = 5;
const MAX_CHUNK_BUILDS_PER_FRAME = 2;

// Block hardness is now defined in mining.ts (BLOCK_HARDNESS).
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
  [BlockType.Obsidian]: { id: BlockType.Obsidian, count: 1 },
  [BlockType.Netherrack]: { id: BlockType.Netherrack, count: 1 },
  [BlockType.SoulSand]: { id: BlockType.SoulSand, count: 1 },
  [BlockType.Glowstone]: { id: BlockType.Glowstone, count: 1 },
  [BlockType.EndStone]: { id: BlockType.EndStone, count: 1 },
};

// XP dropped per block (Minecraft values, simplified)
// coal_ore: 0..2, diamond_ore: 3..7, gold_ore: 0..1, emerald_ore: 3..7
const BLOCK_XP_DROPS: Partial<Record<BlockType, { min: number; max: number }>> = {
  [BlockType.CoalOre]: { min: 0, max: 2 },
  [BlockType.DiamondOre]: { min: 3, max: 7 },
  [BlockType.GoldOre]: { min: 0, max: 1 },
};

// XP dropped when killing entities (Minecraft values)
const ANIMAL_XP = { min: 1, max: 3 };   // passive mobs
const MONSTER_XP = { min: 5, max: 5 };  // zombies, skeletons, spiders, creepers

function randXp(range: { min: number; max: number }): number {
  if (range.max <= 0) return 0;
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

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
  xpLevel: number;
  xpProgress: number; // 0-1
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
    xpLevel: 0, xpProgress: 0,
  });
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});
  const iconUrlsRef = useRef<Record<string, string>>({});
  const [isDead, setIsDead] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showCraftingTable, setShowCraftingTable] = useState(false);
  const [showFurnace, setShowFurnace] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [inventoryVersion, setInventoryVersion] = useState(0); // force re-render of hotbar/inventory

  const selectedSlotRef = useRef(0);
  const worldConfigRef = useRef<WorldConfig | null>(null);
  const inventoryRef = useRef<Inventory>(new Inventory());
  // Refs for save system
  const worldRef = useRef<World | null>(null);
  const playerRef = useRef<any>(null);
  const dayTimeRef = useRef<number>(0.3);
  const pendingLoadRef = useRef<SavedWorld | null>(null);
  const xpStateRef = useRef<XpState>(new XpState());
  const pendingXpLoadRef = useRef<{ level: number; progress: number } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>("");
  // Track if the player has already received the level-10 dragon egg reward (per world)
  const dragonEggAwardedRef = useRef<boolean>(false);
  const [dragonNotification, setDragonNotification] = useState<string>("");
  // Track previous XP level to detect level-ups to 10
  const prevXpLevelRef = useRef<number>(0);
  // Ref to dragon manager for HUD access
  const dragonManagerRef = useRef<DragonManager | null>(null);
  // Force HUD re-render periodically so the dragon mount indicator updates
  const [, setHudTick] = useState(0);
  // Armor state (mirror of player.armor for UI access)
  const armorStateRef = useRef<ArmorSlots>(emptyArmor());
  const pendingArmorLoadRef = useRef<ArmorSlots | null>(null);
  const [, setArmorVersion] = useState(0);

  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  useEffect(() => {
    const urls = buildIconDataURLs(buildTextureCanvases());
    iconUrlsRef.current = urls;
    setIconUrls(urls);
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "none";

    // === Skybox gradient (procedural sphere) ===
    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color("#2a6cd6") },
        bottomColor: { value: new THREE.Color("#87ceeb") },
        offset: { value: 33 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      fog: false,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    scene.add(sky);

    // === Lighting (improved for better visuals) ===
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff4e6, 0.7);
    sun.position.set(50, 100, 30);
    scene.add(sun);
    // Fill light for softer shadows
    const fill = new THREE.DirectionalLight(0xb0c4de, 0.2);
    fill.position.set(-30, 50, -40);
    scene.add(fill);
    const hemi = new THREE.HemisphereLight(0xbfdfff, 0x6b5a3a, 0.4);
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
    // Cutout material: leaves - uses alphaTest (no blending, but discards transparent pixels)
    const cutoutMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      side: THREE.DoubleSide,
      transparent: false,
      alphaTest: 0.5,
      depthWrite: true,
    });
    // Translucent material: water - alpha blended, depthWrite off
    const transparentMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // Glass material: alpha blended, depthWrite OFF so you can see through
    const glassMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // === Load real textures asynchronously and rebuild atlas ===
    loadRealTextures().then((realCanvases) => {
      // Merge real textures into the canvases map
      for (const [name, canvas] of Object.entries(realCanvases)) {
        canvases[name] = canvas;
      }
      // Rebuild the atlas texture
      resetAtlas();
      const newAtlas = getSharedAtlas(canvases);
      // Update the texture on all materials
      opaqueMaterial.map = newAtlas.texture;
      opaqueMaterial.needsUpdate = true;
      cutoutMaterial.map = newAtlas.texture;
      cutoutMaterial.needsUpdate = true;
      transparentMaterial.map = newAtlas.texture;
      transparentMaterial.needsUpdate = true;
      glassMaterial.map = newAtlas.texture;
      glassMaterial.needsUpdate = true;
      // Update icon URLs for hotbar
      const newIcons = buildIconDataURLs(canvases);
      iconUrlsRef.current = newIcons;
      setIconUrls(newIcons);
      setInventoryVersion((v) => v + 1);
      // Force chunk rebuild to use new textures
      for (const [key, _] of chunkMeshes) {
        const [cxStr, czStr] = key.split(",");
        const cx = parseInt(cxStr);
        const cz = parseInt(czStr);
        chunksToBuild.push({ cx, cz });
      }
    });

    // === Hand view (first-person) ===
    const handView = new HandView(atlas);

    // === World & Player ===
    const world = new World(config.seed);
    const player = new Player(world, camera, config.mode);
    // Store refs for save system
    worldRef.current = world;
    playerRef.current = player;

    // === Drop manager (item drops on the ground) ===
    const dropManager = new DropManager(scene, world, atlas);

    // If loading a saved world, apply saved state
    if (pendingLoadRef.current) {
      const saved = pendingLoadRef.current;
      pendingLoadRef.current = null;
      // Apply modified blocks
      applySavedWorld(world, saved);
      // Restore player state
      player.position.set(saved.player.x, saved.player.y, saved.player.z);
      player.yaw = saved.player.yaw;
      player.pitch = saved.player.pitch;
      player.health = saved.player.health;
      player.hunger = saved.player.hunger;
      // Restore inventory
      inventoryRef.current.deserialize(saved.inventory);
      // Restore day time
      dayTimeRef.current = saved.dayTime;
      // Restore XP state if available
      if (pendingXpLoadRef.current) {
        xpStateRef.current.deserialize(pendingXpLoadRef.current);
        pendingXpLoadRef.current = null;
      } else {
        xpStateRef.current.reset();
      }
      // Restore armor if available
      if (pendingArmorLoadRef.current) {
        player.armor = pendingArmorLoadRef.current;
        pendingArmorLoadRef.current = null;
      } else if (saved.armor) {
        player.armor = deserializeArmor(saved.armor);
      } else {
        player.armor = emptyArmor();
      }
      armorStateRef.current = player.armor;
      // Force inventory refresh
      setInventoryVersion((v) => v + 1);
    } else if (pendingXpLoadRef.current) {
      // Respawn case: no saved world to apply, but preserve XP from before respawn
      xpStateRef.current.deserialize(pendingXpLoadRef.current);
      pendingXpLoadRef.current = null;
      // Keep dragonEggAwardedRef state across respawn (already awarded)
      // Restore armor if pending (from respawn), otherwise keep empty (reset on death)
      if (pendingArmorLoadRef.current) {
        player.armor = pendingArmorLoadRef.current;
        pendingArmorLoadRef.current = null;
      } else {
        player.armor = emptyArmor();
      }
      armorStateRef.current = player.armor;
    } else {
      // Fresh new world - reset XP
      xpStateRef.current.reset();
      dragonEggAwardedRef.current = false;
      // Reset armor for new world
      player.armor = emptyArmor();
      armorStateRef.current = player.armor;
    }
    prevXpLevelRef.current = xpStateRef.current.level;
    // Enable tracking of player modifications (for save system)
    world.enablePlayerModificationTracking(true);

    // === Animal Manager (3D models) ===
    const animalManager = new AnimalManager(world, scene);

    // === Monster Manager (zombies & spiders at night) ===
    const monsterManager = new MonsterManager(world, scene);

    // === Enderman Manager (tall black mobs that drop ender pearls) ===
    const endermanManager = new EndermanManager(world, scene);

    // === Blaze Manager (fire mobs from the Nether that drop blaze rods) ===
    const blazeManager = new BlazeManager(world, scene);

    // === Dragon Manager (player's pet dragon) ===
    const dragonManager = new DragonManager(world, scene);
    dragonManagerRef.current = dragonManager;
    let dragonMountedCamera: { eyeX: number; eyeY: number; eyeZ: number; yaw: number; pitch: number } | null = null;

    // Torch lights
    const torchLights = new Map<string, THREE.PointLight>();

    // === Day/Night cycle ===
    let dayTime = dayTimeRef.current;
    let isNight = false;
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

    // === Clouds (simple white planes high in the sky) ===
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, fog: false, side: THREE.DoubleSide });
    for (let i = 0; i < 30; i++) {
      const cloudGeo = new THREE.PlaneGeometry(20 + Math.random() * 30, 8 + Math.random() * 10);
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(
        (Math.random() - 0.5) * 400,
        80 + Math.random() * 20,
        (Math.random() - 0.5) * 400
      );
      cloud.rotation.x = -Math.PI / 2;
      cloudGroup.add(cloud);
    }
    cloudGroup.frustumCulled = false;
    scene.add(cloudGroup);

    function updateDayNight(dt: number) {
      dayTime = (dayTime + dt / DAY_LENGTH) % 1;
      dayTimeRef.current = dayTime;
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
      // Clouds follow player and drift slowly
      cloudGroup.position.x = player.position.x + Math.sin(performance.now() * 0.00001) * 10;
      cloudGroup.position.y = player.position.y;
      cloudGroup.position.z = player.position.z + Math.cos(performance.now() * 0.00001) * 10;

      // Calculate light intensity based on sun height
      const sunHeight = Math.sin(sunAngle); // -1 to 1
      // Day: sunHeight > 0, Night: sunHeight < 0
      const dayFactor = Math.max(0, Math.min(1, (sunHeight + 0.2) / 0.4)); // smooth transition
      const nightFactor = 1 - dayFactor;
      isNight = nightFactor > 0.5;

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
      // Update skybox shader colors
      (skyMat.uniforms.topColor.value as THREE.Color).copy(nightColor).lerp(new THREE.Color("#2a6cd6"), dayFactor);
      (skyMat.uniforms.bottomColor.value as THREE.Color).copy(skyColor);

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
      chunkMeshes.set(key, { opaque: null, cutout: null, transparent: null, glass: null });
      chunksToBuild.push({ cx, cz });
    }

    function buildChunk(cx: number, cz: number) {
      const key = chunkKey(cx, cz);
      const old = chunkMeshes.get(key);
      if (old?.opaque) {
        chunkGroup.remove(old.opaque);
        old.opaque.geometry.dispose();
      }
      if (old?.cutout) {
        chunkGroup.remove(old.cutout);
        old.cutout.geometry.dispose();
      }
      if (old?.transparent) {
        chunkGroup.remove(old.transparent);
        old.transparent.geometry.dispose();
      }
      if (old?.glass) {
        chunkGroup.remove(old.glass);
        old.glass.geometry.dispose();
      }
      const meshes = buildChunkGeometry(world, cx, cz, atlas, opaqueMaterial, cutoutMaterial, transparentMaterial, glassMaterial);
      if (meshes.opaque) chunkGroup.add(meshes.opaque);
      if (meshes.cutout) chunkGroup.add(meshes.cutout);
      if (meshes.transparent) chunkGroup.add(meshes.transparent);
      if (meshes.glass) chunkGroup.add(meshes.glass);
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
      if (m.glass) {
        chunkGroup.remove(m.glass);
        m.glass.geometry.dispose();
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
          chunkMeshes.set(key, { opaque: null, cutout: null, transparent: null, glass: null });
          buildChunk(cx, cz);
        }
      }
    }
    initialLoad();
    setIsLoaded(true);

    // Start background music
    const sound = getSound();
    sound.unlock();
    sound.startMusic();

    function rebuildChunkAt(wx: number, wz: number) {
      const cx = Math.floor(wx / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const key = chunkKey(cx, cz);
      if (!chunkMeshes.has(key)) return;
      buildChunk(cx, cz);
    }

    // Try to ignite a nether portal at the given block position.
    function tryIgnitePortal(bx: number, by: number, bz: number): boolean {
      for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (tryIgnitePortalAt(bx + dx, by, bz + dz, "x")) return true;
        if (tryIgnitePortalAt(bx + dx, by, bz + dz, "z")) return true;
      }
      return false;
    }
    function tryIgnitePortalAt(x: number, y: number, z: number, axis: "x" | "z"): boolean {
      const isObs = (bx: number, by: number, bz: number) => world.getBlock(bx, by, bz) === BlockType.Obsidian;
      const isAirP = (bx: number, by: number, bz: number) => {
        const b = world.getBlock(bx, by, bz);
        return b === BlockType.Air || b === BlockType.NetherPortal;
      };
      let x1: number, x2: number, z1: number, z2: number;
      if (axis === "x") { x1 = x; x2 = x + 1; z1 = z; z2 = z; }
      else { x1 = x; x2 = x; z1 = z; z2 = z + 1; }
      for (let dy = 0; dy < 3; dy++) {
        if (!isAirP(x1, y + dy, z1)) return false;
        if (!isAirP(x2, y + dy, z2)) return false;
      }
      if (!isObs(x1, y - 1, z1) || !isObs(x2, y - 1, z2)) return false;
      if (!isObs(x1, y + 3, z1) || !isObs(x2, y + 3, z2)) return false;
      if (axis === "x") {
        for (let dy = -1; dy <= 3; dy++) {
          if (!isObs(x1 - 1, y + dy, z1) || !isObs(x2 + 1, y + dy, z2)) return false;
        }
      } else {
        for (let dy = -1; dy <= 3; dy++) {
          if (!isObs(x1, y + dy, z1 - 1) || !isObs(x2, y + dy, z2 + 1)) return false;
        }
      }
      for (let dy = 0; dy < 3; dy++) {
        world.setBlock(x1, y + dy, z1, BlockType.NetherPortal);
        world.setBlock(x2, y + dy, z2, BlockType.NetherPortal);
      }
      rebuildChunkAt(x1, z1);
      rebuildChunkAt(x2, z2);
      return true;
    }

    function placeBlock(): boolean {
      const result = player.raycast(6);
      if (!result.hit || !result.block || !result.normal) return false;
      const px = result.block.x + result.normal.x;
      const py = result.block.y + result.normal.y;
      const pz = result.block.z + result.normal.z;
      if (py < 0 || py >= WORLD_HEIGHT) return false;

      // === Special case: Dragon Egg - spawn a dragon instead of placing a block ===
      const mode = worldConfigRef.current?.mode;
      if (mode === "survival") {
        const selected = inventoryRef.current.getSelected();
        if (selected && selected.id === ItemType.DragonEgg) {
          // Don't place if dragon already exists
          if (dragonManager.getActiveDragon()) {
            setDragonNotification("Ya tienes un dragón");
            setTimeout(() => setDragonNotification(""), 2500);
            return false;
          }
          // Spawn dragon above the targeted block
          const spawnX = px + 0.5;
          const spawnY = py + 2;
          const spawnZ = pz + 0.5;
          dragonManager.spawn(spawnX, spawnY, spawnZ);
          // Consume the egg
          inventoryRef.current.removeSelected(1);
          setInventoryVersion((v) => v + 1);
          sound.levelUp();
          setDragonNotification("¡Dragón invocado! Pulsa N para montarlo");
          setTimeout(() => setDragonNotification(""), 4000);
          return true;
        }
        // === Flint and Steel - ignite nether portal ===
        if (selected && selected.id === ItemType.FlintAndSteel) {
          const clickedBlock = world.getBlock(result.block.x, result.block.y, result.block.z);
          if (clickedBlock === BlockType.Obsidian || clickedBlock === BlockType.NetherPortal) {
            if (tryIgnitePortal(result.block.x, result.block.y, result.block.z)) {
              inventoryRef.current.damageSelected(1);
              setInventoryVersion((v) => v + 1);
              sound.blockSound(BlockType.Glass, "break");
              return true;
            }
          }
          sound.blockSound(BlockType.Stone, "break");
          return false;
        }
      }

      const existing = world.getBlock(px, py, pz);
      if (existing !== BlockType.Air && existing !== BlockType.Water) return false;

      // In survival: use the selected hotbar item (must be a placeable block)
      // In creative: use HOTBAR_BLOCKS
      let blockType: BlockType;
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

      // Add torch light
      if (blockType === BlockType.Torch) {
        const torchLight = new THREE.PointLight(0xffaa44, 1.5, 8, 1.5);
        torchLight.position.set(px + 0.5, py + 0.5, pz + 0.5);
        scene.add(torchLight);
        torchLights.set(`${px},${py},${pz}`, torchLight);
      }
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
      // Sound
      sound.blockSound(blockType, "break");
      // Remove torch light if breaking a torch
      if (blockType === BlockType.Torch) {
        const key = `${x},${y},${z}`;
        const tl = torchLights.get(key);
        if (tl) { scene.remove(tl); torchLights.delete(key); }
      }
      // Drop item on the ground (in survival)
      const drop = BLOCK_DROPS[blockType];
      if (drop && worldConfigRef.current?.mode === "survival") {
        dropManager.spawnDrop(drop.id, drop.count, x + 0.5, y + 0.5, z + 0.5);
      }
      // Drop XP (in survival)
      const xpDrop = BLOCK_XP_DROPS[blockType];
      if (xpDrop && worldConfigRef.current?.mode === "survival") {
        const xp = randXp(xpDrop);
        if (xp > 0) dropManager.spawnXpOrb(xp, x + 0.5, y + 0.5, z + 0.5);
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

      const hardness = MINING_BLOCK_HARDNESS[blockType] ?? 10;
      if (hardness === Infinity) {
        // Bedrock - unbreakable
        miningProgress = 0;
        return;
      }

      // Use the new mining system from mining.ts
      const selected = inventoryRef.current.getSelected();
      const heldItemId = selected ? selected.id : null;
      const mining = computeMining(blockType, heldItemId);

      // If DPS is 0 (e.g., bedrock via mining module), can't break
      if (mining.dps <= 0) {
        miningProgress = 0;
        return;
      }

      // Mining time = hardness / DPS
      const miningTime = hardness / mining.dps;
      miningProgress += dt / miningTime;

      if (miningProgress >= 1.0) {
        // Block broken!
        world.setBlock(x, y, z, BlockType.Air);
        rebuildChunkAt(x, z);
        if (x % CHUNK_SIZE === 0) rebuildChunkAt(x - 1, z);
        if (x % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x + 1, z);
        if (z % CHUNK_SIZE === 0) rebuildChunkAt(x, z - 1);
        if (z % CHUNK_SIZE === CHUNK_SIZE - 1) rebuildChunkAt(x, z + 1);

        // Drop item on the ground ONLY if tier is sufficient (per user spec)
        if (mining.dropItem) {
          const drop = BLOCK_DROPS[blockType];
          if (drop) {
            dropManager.spawnDrop(drop.id, drop.count, x + 0.5, y + 0.5, z + 0.5);
          }
          // Drop XP for certain ores (only if drop is allowed)
          const xpDrop = BLOCK_XP_DROPS[blockType];
          if (xpDrop) {
            const xp = randXp(xpDrop);
            if (xp > 0) dropManager.spawnXpOrb(xp, x + 0.5, y + 0.5, z + 0.5);
          }
        }
        // Sound
        sound.blockSound(blockType, "break");
        // Remove torch light
        if (blockType === BlockType.Torch) {
          const key = `${x},${y},${z}`;
          const tl = torchLights.get(key);
          if (tl) { scene.remove(tl); torchLights.delete(key); }
        }

        // Consume tool durability (1 use per block broken, only if a tool was used)
        if (heldItemId !== null && heldItemId >= 100) {
          const itemDef = ITEMS[heldItemId as ItemType];
          if (itemDef?.maxDurability) {
            const destroyed = inventoryRef.current.damageSelected(1);
            if (destroyed) {
              sound.blockSound(BlockType.Stone, "break");
              setInventoryVersion((v) => v + 1);
            }
          }
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

    // === Mining crack overlay (like Minecraft) ===
    // Generate 10 crack textures (stages 0-9) procedurally
    const crackTextures: THREE.Texture[] = [];
    for (let stage = 0; stage < 10; stage++) {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 16, 16);
      // Draw cracks based on stage (more cracks as stage increases)
      const rng = (s: number) => { let x = s; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
      const r = rng(stage * 1000 + 42);
      const numCracks = Math.floor((stage + 1) * 1.5);
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 1;
      for (let i = 0; i < numCracks; i++) {
        const startX = Math.floor(r() * 16);
        const startY = Math.floor(r() * 16);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        // Draw a jagged line
        let x = startX, y = startY;
        const segments = 2 + Math.floor(r() * 3);
        for (let j = 0; j < segments; j++) {
          x += (r() - 0.5) * 6;
          y += (r() - 0.5) * 6;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      crackTextures.push(tex);
    }
    // Crack overlay mesh (slightly larger than block, rendered on top)
    const crackGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const crackMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      depthWrite: false,
    });
    const crackOverlay = new THREE.Mesh(crackGeo, crackMat);
    crackOverlay.visible = false;
    crackOverlay.renderOrder = 999;
    scene.add(crackOverlay);

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
      // M: same as right-click (eat / open crafting table / open furnace / place block)
      if (e.code === "KeyM") {
        performRightClickAction();
      }
      // B: toggle dragon stay/follow mode (only when not mounted)
      if (e.code === "KeyB") {
        const dragon = dragonManager.getActiveDragon();
        if (!dragon) {
          setDragonNotification("No tienes dragón. Alcanza nivel 10 de XP para recibir un huevo.");
          setTimeout(() => setDragonNotification(""), 3500);
        } else if (dragon.isMounted) {
          setDragonNotification("No puedes usar B mientras estás montado");
          setTimeout(() => setDragonNotification(""), 2000);
        } else {
          dragon.isStaying = !dragon.isStaying;
          setDragonNotification(dragon.isStaying
            ? "🐉 Dragón esperando aquí"
            : "🐉 Dragón te sigue");
          setTimeout(() => setDragonNotification(""), 1800);
        }
      }
      if (e.code === "KeyN") {
        // N: mount/dismount dragon pet (if one exists)
        const dragon = dragonManager.getActiveDragon();
        if (!dragon) {
          setDragonNotification("No tienes dragón. Alcanza nivel 10 de XP para recibir un huevo.");
          setTimeout(() => setDragonNotification(""), 3500);
          return;
        }
        // If currently mounted, dismount; otherwise mount
        if (dragon.isMounted) {
          const nowMounted = dragon.toggleMount(player.position);
          // dismount: drop player next to dragon
          player.position.set(dragon.position.x + 1, dragon.position.y, dragon.position.z);
          player.velocity.set(0, 0, 0);
          setDragonNotification("Has desmontado");
          setTimeout(() => setDragonNotification(""), 1500);
        } else {
          // Only mount if dragon is close enough
          const dx = dragon.position.x - player.position.x;
          const dy = dragon.position.y - player.position.y;
          const dz = dragon.position.z - player.position.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 6) {
            setDragonNotification("Acércate al dragón para montarlo");
            setTimeout(() => setDragonNotification(""), 2500);
            return;
          }
          dragon.toggleMount(player.position);
          setDragonNotification("¡Montado! WASD para volar, Espacio subir, Ctrl/Shift bajar");
          setTimeout(() => setDragonNotification(""), 3500);
        }
      }
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

    // === Right-click action (also triggered by M key) ===
    // Order: eat food (if holding food) → open crafting table / furnace → place block
    const performRightClickAction = () => {
      handView.triggerAction("place");
      // 1. If holding food, eat it
      const selected = inventoryRef.current.getSelected();
      if (selected && selected.id >= 100) {
        const itemDef = ITEMS[selected.id as ItemType];
        if (itemDef?.food && itemDef.food > 0) {
          // Eat the food
          player.heal(itemDef.food);
          if (player.hunger < player.maxHunger) {
            player.hunger = Math.min(player.maxHunger, player.hunger + itemDef.food);
          }
          inventoryRef.current.removeSelected(1);
          setInventoryVersion((v) => v + 1);
          handView.triggerAction("eat");
          sound.eat();
          return;
        }
      }
      // 2. Check if we're right-clicking a crafting table or furnace
      const hit = player.raycast(6);
      if (hit.hit && hit.block) {
        const block = world.getBlock(hit.block.x, hit.block.y, hit.block.z);
        if (block === BlockType.CraftingTable) {
          document.exitPointerLock();
          setShowCraftingTable(true);
          return;
        }
        if (block === BlockType.Furnace) {
          document.exitPointerLock();
          setShowFurnace(true);
          return;
        }
      }
      // 3. Otherwise, place block
      if (placeBlock()) {
        const placedId = (() => {
          const sel = inventoryRef.current.getSelected();
          return sel ? sel.id : HOTBAR_BLOCKS[selectedSlotRef.current];
        })();
        sound.blockSound(placedId, "place");
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      if (e.button === 0) {
        leftMouseDown = true;
        handView.triggerAction("swing");
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
        performRightClickAction();
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

      // === Dragon update (mount or follow player) ===
      const dragon = dragonManager.getActiveDragon();
      const isDragonMounted = dragon?.isMounted ?? false;
      // Apply mouse look to player even when mounted (so yaw/pitch sync with camera)
      if (document.pointerLockElement === renderer.domElement && !player.isDead()) {
        // When dragon is mounted, skip normal player movement - the dragon controls position.
        // But still update player's yaw/pitch from mouse (used for dragon camera direction).
        if (isDragonMounted) {
          // Apply mouse-look only (no physics/movement)
          const sensitivity = 0.0022;
          player.yaw -= player.mouseDeltaX * sensitivity;
          player.pitch -= player.mouseDeltaY * sensitivity;
          const maxPitch = Math.PI / 2 - 0.01;
          player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch));
          player.mouseDeltaX = 0;
          player.mouseDeltaY = 0;
        } else {
          player.update(dt);
        }
      }

      // Update the dragon (returns camera position when mounted)
      dragonMountedCamera = dragonManager.update(
        dt,
        player.position,
        player.keys,
        player.yaw,
        player.pitch
      );

      // When mounted, sync player position to dragon (so player.update camera and other systems work)
      if (isDragonMounted && dragon) {
        player.position.set(dragon.position.x, dragon.position.y + 1, dragon.position.z);
        player.velocity.set(0, 0, 0);
        player.onGround = false;
        // Apply camera override after player.update (which is skipped when mounted)
        if (dragonMountedCamera) {
          camera.position.set(dragonMountedCamera.eyeX, dragonMountedCamera.eyeY, dragonMountedCamera.eyeZ);
          camera.rotation.order = "YXZ";
          camera.rotation.y = dragonMountedCamera.yaw;
          camera.rotation.x = dragonMountedCamera.pitch;
          camera.rotation.z = 0;
        }
      }

      // Update animals (always, even when paused)
      animalManager.update(dt, player.position.x, player.position.z);

      // Update item drops and pick up nearby ones
      const pickedUp = dropManager.update(dt, player.position.x, player.position.y + 0.8, player.position.z);
      if (pickedUp.length > 0) {
        let pickedXp = 0;
        let pickedItems = false;
        for (const p of pickedUp) {
          if (p.isXp) {
            pickedXp += p.id; // for XP orbs, id holds the xp amount
          } else {
            inventoryRef.current.addItem(p.id, p.count);
            pickedItems = true;
          }
        }
        if (pickedXp > 0) {
          const levelsGained = xpStateRef.current.addXp(pickedXp);
          if (levelsGained > 0) {
            sound.levelUp();
            // Award dragon egg when player FIRST reaches level 10 (or higher)
            if (
              !dragonEggAwardedRef.current &&
              xpStateRef.current.level >= 10
            ) {
              dragonEggAwardedRef.current = true;
              const leftover = inventoryRef.current.addItem(ItemType.DragonEgg, 1);
              if (leftover === 0) {
                setDragonNotification("¡Has alcanzado el nivel 10! Recibiste un Huevo de Dragón. Colócalo para invocar a tu mascota.");
              } else {
                // Inventory full - drop the egg on the ground at the player's position
                dropManager.spawnDrop(ItemType.DragonEgg, 1, player.position.x, player.position.y + 1, player.position.z);
                setDragonNotification("¡Nivel 10! Huevo de Dragón dejado en el suelo (inventario lleno).");
              }
              setTimeout(() => setDragonNotification(""), 6000);
              sound.craftSuccess();
            }
          } else {
            sound.orbPickup();
          }
        }
        if (pickedItems) {
          sound.pickup();
        }
        setInventoryVersion((v) => v + 1);
      }

      // Update monsters (spawn at night in survival, attack player)
      const isSurvival = worldConfigRef.current?.mode === "survival";
      const monsterDamages = isSurvival ? monsterManager.update(dt, player.position.x, player.position.y, player.position.z, isNight) : [];
      if (monsterDamages.length > 0) {
        for (const md of monsterDamages) {
          player.damage(md.damage);
          if (md.fromX !== undefined) player.knockback(md.fromX, md.fromZ, 5);
          sound.hurt();
        }
      }

      // Update endermen (spawn at night, drop ender pearls)
      if (isSurvival) {
        endermanManager.update(dt, player.position.x, player.position.y, player.position.z, isNight);
      }

      // Update blazes (spawn in survival, attack player with fire)
      if (isSurvival) {
        const blazeDamages = blazeManager.update(dt, player.position.x, player.position.y, player.position.z, isNight);
        for (const bd of blazeDamages) {
          player.damage(bd.damage);
          sound.hurt();
        }
      }

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
        const monster = monsterManager.findClosest(eyeX, eyeY, eyeZ, 4);
        const enderman = endermanManager.findClosest(eyeX, eyeY, eyeZ, 4);
        const blaze = blazeManager.findClosest(eyeX, eyeY, eyeZ, 5);
        if (animal || monster || enderman || blaze) {
          let damage = 1;
          let usedTool = false;
          const selected = inventoryRef.current.getSelected();
          if (selected && selected.id >= 100) {
            const itemDef = ITEMS[selected.id as ItemType];
            if (itemDef?.attackDamage) {
              damage = itemDef.attackDamage;
              usedTool = true;
            }
          }
          sound.hit();
          if (monster) {
            const died = monster.takeDamage(damage);
            if (monster.knockback) monster.knockback(player.position.x, player.position.z, 4);
            if (died) {
              const drops = monster.getDrops();
              for (const drop of drops) {
                dropManager.spawnDrop(drop.id, drop.count, monster.position.x, monster.position.y + 0.5, monster.position.z);
              }
              const xp = randXp(MONSTER_XP);
              if (xp > 0) dropManager.spawnXpOrb(xp, monster.position.x, monster.position.y + 0.5, monster.position.z);
              monsterManager.removeMonster(monster);
            }
          } else if (enderman) {
            const died = enderman.takeDamage(damage);
            if (died) {
              const drops = enderman.getDrops();
              for (const drop of drops) {
                dropManager.spawnDrop(drop.id, drop.count, enderman.position.x, enderman.position.y + 0.5, enderman.position.z);
              }
              const xp = randXp(MONSTER_XP);
              if (xp > 0) dropManager.spawnXpOrb(xp, enderman.position.x, enderman.position.y + 0.5, enderman.position.z);
              endermanManager.removeEnderman(enderman);
            }
          } else if (blaze) {
            const died = blaze.takeDamage(damage);
            blaze.knockback(player.position.x, player.position.z, 3);
            if (died) {
              const drops = blaze.getDrops();
              for (const drop of drops) {
                dropManager.spawnDrop(drop.id, drop.count, blaze.position.x, blaze.position.y + 0.5, blaze.position.z);
              }
              const xp = randXp(MONSTER_XP);
              if (xp > 0) dropManager.spawnXpOrb(xp, blaze.position.x, blaze.position.y + 0.5, blaze.position.z);
              blazeManager.removeBlaze(blaze);
            }
          } else if (animal) {
            const died = animal.takeDamage(damage, player.position);
            if (died) {
              const drops = animal.getDrops();
              for (const drop of drops) {
                dropManager.spawnDrop(drop.id, drop.count, animal.position.x, animal.position.y + 0.5, animal.position.z);
              }
              const xp = randXp(ANIMAL_XP);
              if (xp > 0) dropManager.spawnXpOrb(xp, animal.position.x, animal.position.y + 0.5, animal.position.z);
              animalManager.removeAnimal(animal);
            }
          }
          // Consume tool durability (1 use per attack, only if a tool was used)
          if (usedTool) {
            const destroyed = inventoryRef.current.damageSelected(1);
            if (destroyed) {
              sound.blockSound(BlockType.Stone, "break");
              setInventoryVersion((v) => v + 1);
            }
          }
          // Reset mining when attacking
          miningProgress = 0;
          miningBlock = null;
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
        // Highlight color stays black now (cracks show progress instead)
        (highlight.material as THREE.LineBasicMaterial).color.setRGB(0, 0, 0);

        // Update crack overlay based on mining progress
        if (miningProgress > 0 && miningBlock) {
          const stage = Math.min(9, Math.floor(miningProgress * 10));
          crackOverlay.visible = true;
          crackOverlay.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
          (crackOverlay.material as THREE.MeshBasicMaterial).map = crackTextures[stage];
          (crackOverlay.material as THREE.MeshBasicMaterial).opacity = 0.7;
          (crackOverlay.material as THREE.MeshBasicMaterial).needsUpdate = true;
        } else {
          crackOverlay.visible = false;
        }
      } else {
        highlight.visible = false;
        crackOverlay.visible = false;
      }

      // Water overlay
      waterOverlay.style.display = player.headInWater ? "block" : "none";

      // Keep skybox centered on player so it never clips
      sky.position.copy(player.position);

      renderer.render(scene, camera);

      // Render first-person hand on top
      handView.update(dt);
      // Update held item based on selected slot
      let heldItemId: number | null = null;
      if (worldConfigRef.current?.mode === "survival") {
        const sel = inventoryRef.current.getSelected();
        heldItemId = sel ? sel.id : null;
      } else {
        heldItemId = HOTBAR_BLOCKS[selectedSlotRef.current];
      }
      handView.updateItem(heldItemId);
      handView.render(renderer);

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
          xpLevel: xpStateRef.current.level,
          xpProgress: xpStateRef.current.progressFraction,
        }));
        // Tick HUD to refresh dragon mount indicator
        setHudTick((t) => (t + 1) & 0xffff);
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
        c.glass?.geometry.dispose();
      });
      // Dispose animals
      animalManager.dispose();
      monsterManager.dispose();
      endermanManager.dispose();
      blazeManager.dispose();
      dropManager.dispose();
      dragonManager.dispose();
      dragonManagerRef.current = null;
      // Stop music
      getSound().stopMusic();
      // Dispose torch lights
      torchLights.forEach((l) => scene.remove(l));
      torchLights.clear();
      // Dispose day/night objects
      sunMesh.geometry.dispose();
      (sunMesh.material as THREE.Material).dispose();
      moonMesh.geometry.dispose();
      (moonMesh.material as THREE.Material).dispose();
      starGeo.dispose();
      starMat.dispose();
      // Dispose skybox
      skyGeo.dispose();
      skyMat.dispose();
      // Dispose crack textures and overlay
      for (const tex of crackTextures) {
        tex.dispose();
      }
      crackGeo.dispose();
      crackMat.dispose();
      atlas.texture.dispose();
      opaqueMaterial.dispose();
      cutoutMaterial.dispose();
      transparentMaterial.dispose();
      glassMaterial.dispose();
      handView.dispose();
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
    // Clear inventory for new world (survival starts empty, creative will use creative inventory)
    inventoryRef.current.clear();
    pendingLoadRef.current = null;
    pendingXpLoadRef.current = null;
    pendingArmorLoadRef.current = null;
    // Reset XP state for new world
    xpStateRef.current.reset();
    // Reset armor for new world
    armorStateRef.current = emptyArmor();
  }, []);

  const handleRespawn = useCallback(() => {
    // On respawn, keep XP and armor at current state (like Minecraft keeps XP level)
    // Save them before the screen change so the game effect can restore them.
    pendingXpLoadRef.current = xpStateRef.current.serialize();
    pendingArmorLoadRef.current = armorStateRef.current;
    setScreen("main-menu");
    setTimeout(() => {
      if (worldConfigRef.current) {
        setScreen("playing");
        setIsLoaded(false);
        setIsDead(false);
        // XP and armor will be restored from pending refs in the game effect
      }
    }, 50);
  }, []);

  const handleExitToMenu = useCallback(() => {
    setScreen("main-menu");
    setIsDead(false);
    setCurrentWorld(null);
    // Clear inventory
    inventoryRef.current.clear();
    // Reset XP state when leaving the world without saving
    xpStateRef.current.reset();
    // Reset armor state
    armorStateRef.current = emptyArmor();
    pendingArmorLoadRef.current = null;
  }, []);

  const handleSaveWorld = useCallback(() => {
    if (!worldRef.current || !playerRef.current || !currentWorld) return;
    const success = saveWorld(
      worldRef.current,
      currentWorld.name,
      currentWorld.seed,
      currentWorld.mode,
      {
        position: { x: playerRef.current.position.x, y: playerRef.current.position.y, z: playerRef.current.position.z },
        yaw: playerRef.current.yaw,
        pitch: playerRef.current.pitch,
        health: playerRef.current.health,
        hunger: playerRef.current.hunger,
      },
      inventoryRef.current,
      dayTimeRef.current,
      xpStateRef.current.serialize(),
      serializeArmor(armorStateRef.current)
    );
    setSaveMessage(success ? "✓ Mundo guardado" : "✗ Error al guardar");
    setTimeout(() => setSaveMessage(""), 3000);
  }, [currentWorld]);

  const handleStartClick = useCallback(() => {
    const canvas = containerRef.current?.querySelector("canvas");
    canvas?.requestPointerLock();
  }, []);

  // === SCREENS ===
  if (screen === "main-menu") {
    return (
      <MainMenu
        iconUrls={iconUrls}
        onCreateWorld={() => setScreen("create-world")}
        onLoadWorld={(name) => {
          const saved = loadWorld(name);
          if (saved) {
            // Start world with saved config
            worldConfigRef.current = { name: saved.name, seed: saved.seed, mode: saved.mode };
            setCurrentWorld({ name: saved.name, seed: saved.seed, mode: saved.mode });
            setScreen("playing");
            setIsLoaded(false);
            setIsDead(false);
            // We'll apply the saved world in the effect via a ref
            pendingLoadRef.current = saved;
            pendingXpLoadRef.current = saved.xp || null;
            pendingArmorLoadRef.current = saved.armor ? deserializeArmor(saved.armor) : null;
            // Clear inventory before loading saved one
            inventoryRef.current.clear();
            // Reset local armor state until the effect restores it
            armorStateRef.current = emptyArmor();
          }
        }}
      />
    );
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
        <div className="text-white/60 text-[10px]">Seed: {currentWorld?.seed ?? 0}</div>
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

      {/* Survival stats - centered above hotbar like Minecraft */}
      {mode === "survival" && (
        <>
          {/* Hearts + hunger row (topmost) */}
          <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 z-20 flex flex-row items-end" style={{ filter: "drop-shadow(1px 1px 0 #000)" }}>
            {/* Hearts (left of center) */}
            <div className="flex gap-px">
              {Array.from({ length: 10 }).map((_, i) => (
                <Heart key={i} filled={Math.min(2, Math.max(0, stats.health - i * 2))} />
              ))}
            </div>
            {/* Gap between hearts and hunger */}
            <div className="w-4" />
            {/* Hunger (right side, reversed like Minecraft) */}
            <div className="flex gap-px flex-row-reverse">
              {Array.from({ length: 10 }).map((_, i) => (
                <Drumstick key={i} filled={Math.min(2, Math.max(0, stats.hunger - i * 2))} />
              ))}
            </div>
          </div>
          {/* XP bar (between hearts/hunger and hotbar) */}
          <div className="absolute bottom-[78px] left-1/2 -translate-x-1/2 z-20 flex items-center" style={{ filter: "drop-shadow(1px 1px 0 #000)" }}>
            {/* XP level number (centered on top of bar) */}
            {stats.xpLevel > 0 && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-green-400 font-mono font-bold text-sm leading-none" style={{ textShadow: "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000" }}>
                {stats.xpLevel}
              </div>
            )}
            {/* XP bar background + fill */}
            <div className="w-[364px] sm:w-[364px] h-[9px] bg-black/60 border border-black/80 relative overflow-hidden" style={{ imageRendering: "pixelated" }}>
              <div
                className="h-full bg-green-500 transition-[width] duration-150 ease-linear"
                style={{ width: `${Math.max(0, Math.min(100, stats.xpProgress * 100))}%` }}
              />
            </div>
          </div>
          {/* Air bubbles above hearts */}
          {stats.air < 10 && (
            <div className="absolute bottom-[124px] left-1/2 -translate-x-1/2 z-20 flex gap-px" style={{ filter: "drop-shadow(1px 1px 0 #000)" }}>
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
          let durFraction: number | null = null;

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
                  // Compute durability fraction
                  if (def.maxDurability) {
                    const cur = stack.durability !== undefined ? stack.durability : def.maxDurability;
                    durFraction = Math.max(0, Math.min(1, cur / def.maxDurability));
                  }
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
              {/* Durability bar for tools/armor */}
              {durFraction !== null && (
                <div className="absolute bottom-0 left-1 right-1 h-[3px] bg-black/80 pointer-events-none">
                  <div
                    className="h-full"
                    style={{
                      width: `${durFraction * 100}%`,
                      backgroundColor: durFraction > 0.5 ? "#4ade80" : durFraction > 0.2 ? "#facc15" : "#ef4444",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pause overlay — Minecraft-style menu */}
      {!isLocked && isLoaded && !isDead && !showInventory && !showCraftingTable && !showFurnace && (
        <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          {!showControls ? (
            <div className="max-w-sm w-full mx-4" style={{ imageRendering: "pixelated" }}>
              <h1 className="text-center text-3xl sm:text-4xl font-black mb-6 text-white" style={{ fontFamily: "monospace", textShadow: "3px 3px 0 #1a1a1a, 5px 5px 0 rgba(0,0,0,0.4)", WebkitTextStroke: "1px #1a1a1a" }}>
                {currentWorld?.name || "JEFFCRAFT"}
              </h1>
              <div className="flex flex-col gap-1.5 mb-2">
                <MCMenuButton onClick={handleStartClick} color="green">Continuar</MCMenuButton>
                <MCMenuButton onClick={handleExitToMenu} color="red">Salir del mundo</MCMenuButton>
              </div>
              <div className="flex gap-1.5">
                <MCMenuButton onClick={handleSaveWorld} color="blue" className="flex-1 text-sm">Guardar</MCMenuButton>
                <MCMenuButton onClick={() => setShowControls(true)} color="gray" className="flex-1 text-sm">Controles</MCMenuButton>
              </div>
              {saveMessage && <p className="mt-3 text-center text-xs text-green-400 font-mono">{saveMessage}</p>}
              <p className="mt-2 text-center text-xs text-stone-500 font-mono">{mode === "creative" ? "Creativo" : "Survival"} · Pulsa Esc para reanudar</p>
            </div>
          ) : (
            <div className="max-w-md w-full mx-4" style={{ imageRendering: "pixelated" }}>
              <h2 className="text-center text-2xl font-black mb-4 text-white" style={{ fontFamily: "monospace", textShadow: "2px 2px 0 #1a1a1a" }}>Controles</h2>
              <div className="text-left text-sm space-y-1.5 p-4 mb-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", border: "3px solid rgba(60,60,60,0.9)", borderTopColor: "rgba(120,120,120,0.9)", borderLeftColor: "rgba(120,120,120,0.9)" }}>
                <ControlRow keys="WASD" desc="Moverse" />
                <ControlRow keys="Mouse" desc="Mirar alrededor" />
                <ControlRow keys="Espacio" desc="Saltar / Nadar arriba" />
                <ControlRow keys="Shift" desc="Correr" />
                <ControlRow keys="Click izq" desc={mode === "survival" ? "Minar bloque / Atacar" : "Romper bloque"} />
                <ControlRow keys="Click der / M" desc="Comer / Abrir mesa-horno / Colocar" />
                <ControlRow keys="1-9 / Rueda" desc="Seleccionar slot" />
                {mode === "survival" && <ControlRow keys="E" desc="Abrir inventario" />}
                {mode === "survival" && <ControlRow keys="Click der en mesa" desc="Craftear" />}
                {mode === "survival" && <ControlRow keys="Click der en horno" desc="Cocer comida" />}
                {mode === "survival" && <ControlRow keys="N" desc="Montar/desmontar dragón 🐉" />}
                {mode === "survival" && <ControlRow keys="B" desc="Dragón espera/te sigue" />}
                {mode === "creative" && <ControlRow keys="F" desc="Vuelo" />}
                <ControlRow keys="Esc" desc="Pausar" />
              </div>
              <MCMenuButton onClick={() => setShowControls(false)} color="green">← Volver</MCMenuButton>
            </div>
          )}
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

      {/* Mining cracks are now shown as 3D overlay on the block (like Minecraft) */}

      {/* Dragon notification banner (center top) */}
      {dragonNotification && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-purple-900/90 border-2 border-purple-500 rounded text-white font-mono text-sm text-center shadow-xl" style={{ textShadow: "1px 1px 0 #000" }}>
          🐉 {dragonNotification}
        </div>
      )}

      {/* Dragon mount indicator (top-right corner) */}
      {(() => {
        const dragon = dragonManagerRef.current?.getActiveDragon?.();
        if (!dragon) return null;
        const status = dragon.isMounted ? "[MONTADO]" : dragon.isStaying ? "[ESPERANDO]" : "[Libre]";
        const hint = dragon.isMounted
          ? "Pulsa N para desmontar"
          : dragon.isStaying
            ? "Pulsa N para montar · B para que te siga"
            : "Pulsa N para montar · B para que espere";
        return (
          <div className="absolute top-2 right-2 z-20 px-3 py-1.5 bg-black/50 rounded text-white font-mono text-xs">
            <div className="text-purple-300 font-bold">🐉 Dragón {status}</div>
            <div className="text-white/70">{hint}</div>
          </div>
        );
      })()}

      {/* Inventory UI */}
      {showInventory && (
        <InventoryUI
          inventory={inventoryRef.current}
          iconUrls={iconUrls}
          isCraftingTable={false}
          isCreative={mode === "creative"}
          armor={mode === "survival" ? armorStateRef.current : undefined}
          onArmorChange={mode === "survival" ? (newArmor) => {
            if (playerRef.current) {
              playerRef.current.armor = newArmor;
              armorStateRef.current = newArmor;
              setArmorVersion((v) => v + 1);
            }
          } : undefined}
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
          isCreative={mode === "creative"}
          armor={mode === "survival" ? armorStateRef.current : undefined}
          onArmorChange={mode === "survival" ? (newArmor) => {
            if (playerRef.current) {
              playerRef.current.armor = newArmor;
              armorStateRef.current = newArmor;
              setArmorVersion((v) => v + 1);
            }
          } : undefined}
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

// =============== MAIN MENU (Minecraft Java style) ===============
const SPLASH_TEXTS = [
  "¡Hecho con amor!", "100% voxel puro!", "¡Cava profundamente!", "¡Cuidado con los creepers!",
  "¡Construye algo épico!", "¡Explora el infinito!", "¡Sobrevive!", "¡Craftea hasta el amanecer!",
  "¡Los diamantes brillan!", "¡V2.0!", "¡Bienvenido a Jeffcraft!", "¡Construye. Sobrevive. Prospera!",
];

function MainMenu({
  iconUrls, onCreateWorld, onLoadWorld,
}: {
  iconUrls: Record<string, string>;
  onCreateWorld: () => void;
  onLoadWorld: (name: string) => void;
}) {
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [savedWorlds, setSavedWorlds] = useState<{ name: string; savedAt: number; mode: string }[]>([]);
  const [splashIndex] = useState(() => Math.floor(Math.random() * SPLASH_TEXTS.length));
  const [panOffset, setPanOffset] = useState(0);

  const refreshSavedWorlds = () => setSavedWorlds(listSavedWorlds());

  useEffect(() => {
    const interval = setInterval(() => setPanOffset((p) => (p + 0.3) % 100), 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden select-none" style={{ backgroundColor: "#2a2a2a" }}>
      {/* Panorama background */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${iconUrls["dirt"] || ""})`,
        backgroundSize: "64px 64px", backgroundRepeat: "repeat",
        backgroundPosition: `${panOffset}px 0`, opacity: 0.12, filter: "blur(3px)",
      }} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black/70" />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
        {/* Logo + splash */}
        <div className="mb-8 text-center relative">
          <h1 className="text-6xl sm:text-8xl font-black tracking-wider text-white" style={{
            fontFamily: "monospace", textShadow: "4px 4px 0 #1a1a1a, 6px 6px 0 rgba(0,0,0,0.4)",
            WebkitTextStroke: "2px #1a1a1a", transform: "rotate(-3deg)",
          }}>JEFFCRAFT</h1>
          <span className="absolute top-1/2 -right-4 sm:right-12 text-yellow-300 font-bold text-sm sm:text-lg font-mono"
            style={{ transform: "rotate(-15deg)", textShadow: "2px 2px 0 #1a1a1a" }}>
            {SPLASH_TEXTS[splashIndex]}
          </span>
        </div>

        {!showLoadMenu ? (
          <div className="flex flex-col gap-2 w-full max-w-sm">
            <MCButton onClick={onCreateWorld} primary>Crear nuevo mundo</MCButton>
            <MCButton onClick={() => { refreshSavedWorlds(); setShowLoadMenu(true); }}>Cargar mundo</MCButton>
            <MCButton disabled>Opciones</MCButton>
            <MCButton disabled>Salir del juego</MCButton>
          </div>
        ) : (
          <div className="w-full max-w-sm">
            <h2 className="text-xl font-bold text-white font-mono mb-3 text-center" style={{ textShadow: "2px 2px 0 #1a1a1a" }}>
              Selecciona un mundo
            </h2>
            <div className="bg-stone-900/90 border-2 border-stone-700 p-3 max-h-72 overflow-y-auto" style={{ imageRendering: "pixelated" }}>
              {savedWorlds.length === 0 ? (
                <p className="text-stone-400 text-center font-mono py-6 text-sm">
                  No hay mundos guardados.<br />Crea un mundo y guárdalo desde el menú de pausa.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {savedWorlds.map((w) => (
                    <div key={w.name} className="flex gap-2 items-center bg-stone-800/80 border-2 border-stone-700 p-2 hover:border-stone-500">
                      <div className="flex-1">
                        <div className="text-white font-mono font-bold text-sm">{w.name}</div>
                        <div className="text-stone-400 text-xs font-mono">
                          {w.mode === "creative" ? "Creativo" : "Survival"} · {new Date(w.savedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button onClick={() => onLoadWorld(w.name)} className="px-3 py-1 bg-green-800 hover:bg-green-700 border-2 border-green-600 text-white text-xs font-mono font-bold" style={{ imageRendering: "pixelated" }}>▶ Cargar</button>
                      <button onClick={() => { deleteWorld(w.name); refreshSavedWorlds(); }} className="px-2 py-1 bg-red-900 hover:bg-red-800 border-2 border-red-700 text-white text-xs font-mono" style={{ imageRendering: "pixelated" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <MCButton onClick={() => setShowLoadMenu(false)} className="mt-3">← Volver</MCButton>
          </div>
        )}

        <p className="mt-8 text-white/40 text-xs font-mono">Jeffcraft v2.0 · No afiliado con Mojang o Microsoft</p>
      </div>
    </div>
  );
}

function MCButton({ children, onClick, primary, disabled, className = "" }: {
  children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; className?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} className={`
      relative py-2.5 px-4 text-base font-bold font-mono tracking-wide transition-all
      ${disabled ? "bg-stone-800/50 text-stone-600 cursor-not-allowed border-2 border-stone-900"
        : "bg-stone-800 hover:bg-stone-700 active:bg-stone-900 text-white border-2 border-stone-900 hover:border-white/50 hover:scale-[1.02] active:scale-95 shadow-md"}
      ${primary ? "border-green-600 hover:border-green-400" : ""} ${className}
    `} style={{ imageRendering: "pixelated", textShadow: "1px 1px 0 #1a1a1a" }}>
      {children}
    </button>
  );
}

// Minecraft-style menu button with beveled edges
function MCMenuButton({ children, onClick, color = "gray", className = "" }: {
  children: React.ReactNode; onClick?: () => void; color?: "green" | "red" | "blue" | "gray"; className?: string;
}) {
  const cm: Record<string, {bg:string;h:string;a:string;t:string;b:string}> = {
    green: { bg: "#5a8a3a", h: "#6a9a4a", a: "#4a7a2a", t: "#7aaa5a", b: "#3a6a1a" },
    red:   { bg: "#8a3a3a", h: "#9a4a4a", a: "#7a2a2a", t: "#aa5a5a", b: "#6a1a1a" },
    blue:  { bg: "#3a5a8a", h: "#4a6a9a", a: "#2a4a7a", t: "#5a7aaa", b: "#1a3a6a" },
    gray:  { bg: "#5a5a5a", h: "#6a6a6a", a: "#4a4a4a", t: "#7a7a7a", b: "#3a3a3a" },
  };
  const c = cm[color];
  return (
    <button onClick={onClick} className={`relative py-3 px-4 font-bold font-mono tracking-wide text-white transition-all hover:scale-[1.02] active:scale-95 ${className}`}
      style={{ backgroundColor: c.bg, borderTop: `3px solid ${c.t}`, borderLeft: `3px solid ${c.t}`, borderBottom: `3px solid ${c.b}`, borderRight: `3px solid ${c.b}`, imageRendering: "pixelated", textShadow: "2px 2px 0 #1a1a1a", boxShadow: "0 2px 4px rgba(0,0,0,0.4)" }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = c.h; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = c.bg; }}
      onMouseDown={(e) => { e.currentTarget.style.backgroundColor = c.a; }}
      onMouseUp={(e) => { e.currentTarget.style.backgroundColor = c.h; }}>
      {children}
    </button>
  );
}

function ControlRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono font-bold text-yellow-300 min-w-[140px] text-xs" style={{ textShadow: "1px 1px 0 #000" }}>{keys}</span>
      <span className="text-stone-300 text-xs font-mono flex-1">{desc}</span>
    </div>
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
  // Default world name is unique (Nuevo Mundo N where N = next available)
  const [name, setName] = useState(() => {
    const existing = listSavedWorlds().map((w) => w.name);
    let n = 1;
    while (existing.includes(`Nuevo Mundo ${n}`)) n++;
    return `Nuevo Mundo ${n}`;
  });
  // Default seed is empty (= random), but show a hint button to generate one
  const [seedStr, setSeedStr] = useState("");
  const [mode, setMode] = useState<GameMode>("creative");

  const handleCreate = () => {
    // Generate seed from string or random
    let seed: number;
    if (seedStr.trim() === "") {
      // Random seed (like Minecraft - each new world is unique)
      seed = Math.floor(Math.random() * 2147483647);
    } else {
      // If it's a number, use it directly. Otherwise hash the string.
      const parsed = parseInt(seedStr, 10);
      if (!isNaN(parsed) && seedStr.trim() === String(parsed)) {
        seed = Math.abs(parsed);
      } else {
        let h = 0;
        for (let i = 0; i < seedStr.length; i++) {
          h = (h * 31 + seedStr.charCodeAt(i)) | 0;
        }
        seed = Math.abs(h);
      }
    }
    onCreate({ name: name.trim() || "Nuevo Mundo", seed, mode });
  };

  // Generate a random numeric seed and fill the input
  const handleRandomSeed = () => {
    setSeedStr(String(Math.floor(Math.random() * 2147483647)));
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
            <div className="flex gap-2">
              <input
                type="text"
                value={seedStr}
                onChange={(e) => setSeedStr(e.target.value)}
                className="flex-1 bg-stone-800 border-2 border-stone-600 focus:border-green-400 text-white font-mono px-4 py-2 rounded outline-none transition-colors"
                placeholder="Vacío = semilla aleatoria (como Minecraft)"
              />
              <button
                type="button"
                onClick={handleRandomSeed}
                title="Generar semilla aleatoria"
                className="px-3 py-2 bg-stone-700 hover:bg-stone-600 border-2 border-stone-500 text-white font-mono rounded transition-colors"
              >
                🎲
              </button>
            </div>
            <p className="text-stone-500 text-xs mt-1 font-mono">
              {seedStr.trim() === ""
                ? "Se generará una semilla aleatoria: cada mundo es único"
                : "La misma semilla siempre genera el mismo mundo"}
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
