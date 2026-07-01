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
import { MultiplayerManager, MultiplayerMessage } from "@/lib/minecraft/multiplayer";
import { PlayerModel } from "@/lib/minecraft/player-model";
import { ShaderManager } from "@/lib/minecraft/shader-manager";
import { ArmorSlots, emptyArmor, serializeArmor, deserializeArmor, equipArmor as equipArmorFn, totalDefense } from "@/lib/minecraft/armor";
import { computeMining, BLOCK_HARDNESS as MINING_BLOCK_HARDNESS } from "@/lib/minecraft/mining";
import { NetherWorld } from "@/lib/minecraft/nether";
import { EndermanManager, Enderman } from "@/lib/minecraft/enderman";
import { BlazeManager, Blaze } from "@/lib/minecraft/blaze";
import { EndWorld } from "@/lib/minecraft/end";
import { EnderDragon } from "@/lib/minecraft/ender-dragon";
import { InputMode, readGamepad, isGamepadConnected, resetGamepadState, wasButtonPressed, wasButtonPressedLabelled, wasGamepadConnected, clearAutoDetect, onGamepadConnectionChange, getConnectedGamepadName } from "@/lib/minecraft/gamepad";
import { useControllerNav } from "@/lib/minecraft/use-controller-nav";
import { MCSlider, MCToggle, MCSelect, MCAction, useFocusGrid } from "@/lib/minecraft/mc-controls";
import { useVirtualMouse, VirtualMouseCursor } from "@/lib/minecraft/virtual-mouse";

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
  [BlockType.Chest]: { id: BlockType.Chest, count: 1 },
  [BlockType.Obsidian]: { id: BlockType.Obsidian, count: 1 },
  [BlockType.Netherrack]: { id: BlockType.Netherrack, count: 1 },
  [BlockType.SoulSand]: { id: BlockType.SoulSand, count: 1 },
  [BlockType.Glowstone]: { id: BlockType.Glowstone, count: 1 },
  [BlockType.EndStone]: { id: BlockType.EndStone, count: 1 },
  [BlockType.StoneBricks]: { id: BlockType.StoneBricks, count: 1 },
  [BlockType.Slab]: { id: BlockType.Slab, count: 1 },
  [BlockType.Stairs]: { id: BlockType.Stairs, count: 1 },
  [BlockType.Fence]: { id: BlockType.Fence, count: 1 },
  [BlockType.WoodenDoor]: { id: BlockType.WoodenDoor, count: 1 },
  [BlockType.Ladder]: { id: BlockType.Ladder, count: 1 },
  [BlockType.Sign]: { id: BlockType.Sign, count: 1 },
  [BlockType.Anvil]: { id: BlockType.Anvil, count: 1 },
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
  armorDefense: number; // total armor defense points (for armor bar)
}

interface WorldConfig {
  name: string;
  seed: number;
  mode: GameMode;
}

// =============== MAIN COMPONENT ===============
export default function MinecraftGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<"main-menu" | "create-world" | "playing" | "multiplayer">("main-menu");
  const [currentWorld, setCurrentWorld] = useState<WorldConfig | null>(null);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [stats, setStats] = useState<GameStats>({
    fps: 0, x: 0, y: 0, z: 0, chunks: 0,
    health: 20, hunger: 20, air: 10, inWater: false, headInWater: false, breakProgress: 0,
    xpLevel: 0, xpProgress: 0, armorDefense: 0,
  });
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});
  const iconUrlsRef = useRef<Record<string, string>>({});
  const [isDead, setIsDead] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showCraftingTable, setShowCraftingTable] = useState(false);
  const [showFurnace, setShowFurnace] = useState(false);
  const [showChest, setShowChest] = useState(false);
  // Furnace state persists across UI open/close (so smelting continues when closed)
  const furnaceStateRef = useRef<{
    input: { id: number; count: number } | null;
    fuel: { id: number; count: number } | null;
    output: { id: number; count: number } | null;
    smeltProgress: number;
    fuelProgress: number;
  }>({ input: null, fuel: null, output: null, smeltProgress: 0, fuelProgress: 0 });
  const [showControls, setShowControls] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showGraphics, setShowGraphics] = useState(false);
  const showControlsRef = useRef(false);
  const showConfigRef = useRef(false);
  const showGraphicsRef = useRef(false);
  // === GRAPHICS SETTINGS ===
  const [gfxSettings, setGfxSettings] = useState({
    pbr: true, shadows: true, shadowQuality: 1024, fog: true, leavesGlow: true,
    toneMapping: 1.2, waterReflections: false, realisticSky: false,
    // Shader system (OFF by default)
    shadersEnabled: false, shaderBloom: false, shaderSSAO: false,
    shaderGodRays: false, shaderWaterWaves: false, shaderWind: false, shaderFog: true,
  });
  const gfxSettingsRef = useRef(gfxSettings);
  const gfxNeedsRebuildRef = useRef(false);
  // Spawn point (set by sleeping in bed)
  const spawnPointRef = useRef<{ x: number; y: number; z: number } | null>(null);
  // Sign editing state
  const [signEditing, setSignEditing] = useState<{ x: number; y: number; z: number } | null>(null);
  const [signText, setSignText] = useState<string[]>(["", "", "", ""]);
  const signEditingRef = useRef(false);
  // Bed sleep fade overlay
  const [sleepFade, setSleepFade] = useState(0);
  // Door state tracking
  const openDoorsRef = useRef<Set<string>>(new Set());
  // Overworld return position (saved before teleporting to Nether)
  const overworldReturnPos = useRef<{ x: number; y: number; z: number } | null>(null);
  // End Portal frame eyes
  const endPortalEyesRef = useRef<Set<string>>(new Set());
  // Chat system (T key)
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ text: string; type: "chat" | "system" }[]>([]);
  // Weather command ref
  const weatherCommandRef = useRef<string | null>(null);
  // Dimension command ref
  const dimensionCommandRef = useRef<string | null>(null);
  // Item name display timer
  const [itemNameVisible, setItemNameVisible] = useState(false);
  const itemNameTimerRef = useRef<number>(0);
  const prevHeldItemIdRef = useRef<number | null>(null);
  // === Chat command processor ===
  const processChatCommand = useCallback((cmd: string) => {
    const parts = cmd.toLowerCase().split(/\s+/);
    const command = parts[0];
    const addMsg = (text: string) => setChatMessages(prev => [...prev, { text, type: "system" }]);
    if (command === "/help") {
      addMsg("=== Commands ===");
      addMsg("/time set <day|night|noon|midnight>");
      addMsg("/gamemode <0|1|creative|survival>");
      addMsg("/tp <x> <y> <z>");
      addMsg("/give <item> [count]");
      addMsg("/heal /feed /weather <clear|rain|thunder>");
      addMsg("/dimension <overworld|nether|end>");
      addMsg("/clear");
    } else if (command === "/time") {
      if (parts[1] === "set" && parts[2]) {
        const t = parts[2];
        if (t === "day") { dayTimeRef.current = 0.3; addMsg("Day"); }
        else if (t === "night") { dayTimeRef.current = 0.8; addMsg("Night"); }
        else if (t === "noon") { dayTimeRef.current = 0.5; addMsg("Noon"); }
        else if (t === "midnight") { dayTimeRef.current = 0.0; addMsg("Midnight"); }
        else { const n = parseFloat(t); if (!isNaN(n)) { dayTimeRef.current = n; addMsg("Time: " + n); } }
      }
    } else if (command === "/gamemode") {
      const gm = parts[1];
      if ((gm === "creative" || gm === "1" || gm === "c") && worldConfigRef.current) {
        worldConfigRef.current.mode = "creative"; setCurrentWorld({ ...worldConfigRef.current }); addMsg("Creative");
      } else if ((gm === "survival" || gm === "0" || gm === "s") && worldConfigRef.current) {
        worldConfigRef.current.mode = "survival"; setCurrentWorld({ ...worldConfigRef.current }); addMsg("Survival");
      }
    } else if (command === "/tp" || command === "/teleport") {
      const x = parseFloat(parts[1]), y = parseFloat(parts[2]), z = parseFloat(parts[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z) && playerRef.current) { playerRef.current.position.set(x, y, z); addMsg("TP: " + x + "," + y + "," + z); }
    } else if (command === "/give") {
      const itemName = parts[1], count = parts[2] ? parseInt(parts[2]) : 64;
      if (itemName) {
        const allItems = [...Object.values(BLOCKS), ...Object.values(ITEMS)] as any[];
        const found = allItems.find(it => it && it.name && it.name.toLowerCase().replace(/\s+/g, "_") === itemName);
        if (found) { inventoryRef.current.addItem(found.id, count); setInventoryVersion(v => v + 1); addMsg("Given: " + found.name + " x" + count); }
        else addMsg("Not found: " + itemName);
      }
    } else if (command === "/heal") { if (playerRef.current) { playerRef.current.health = playerRef.current.maxHealth; addMsg("Healed"); } }
    else if (command === "/feed") { if (playerRef.current) { playerRef.current.hunger = playerRef.current.maxHunger; addMsg("Fed"); } }
    else if (command === "/weather") { if (parts[1] === "clear" || parts[1] === "rain" || parts[1] === "thunder") { weatherCommandRef.current = parts[1]; addMsg("Weather: " + parts[1]); } }
    else if (command === "/dimension" || command === "/dim") { if (parts[1] === "overworld" || parts[1] === "nether" || parts[1] === "end") { dimensionCommandRef.current = parts[1]; addMsg("Dimension: " + parts[1]); } }
    else if (command === "/clear") { inventoryRef.current.clear(); setInventoryVersion(v => v + 1); addMsg("Inventory cleared"); }
    else addMsg("Unknown: " + command);
  }, []);
  const [inputMode, setInputMode] = useState<InputMode>("keyboard");
  const inputModeRef = useRef<InputMode>("keyboard");
  // Sensitivity settings (persisted in refs so the game loop reads them live)
  // Wider ranges + lower minimums for better customization
  const [mouseSens, setMouseSens] = useState(1.5); // 0.1–10.0, default 1.5 (×0.001 in use)
  const [controllerSensX, setControllerSensX] = useState(1.0); // 0.1–10.0, default 1.0
  const [controllerSensY, setControllerSensY] = useState(1.0); // 0.1–10.0, default 1.0
  const mouseSensRef = useRef(1.5);
  const controllerSensXRef = useRef(1.0);
  const controllerSensYRef = useRef(1.0);
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
  // Multiplayer state
  const multiplayerRef = useRef<MultiplayerManager | null>(null);
  const [mpStatus, setMpStatus] = useState<string>("");
  const [mpShareCode, setMpShareCode] = useState<string>("");
  const [mpConnected, setMpConnected] = useState(false);
  const [mpError, setMpError] = useState<string>("");
  const [showHostPanel, setShowHostPanel] = useState(false);
  // Pause menu visibility — unified state that works for both keyboard (pointer
  // lock loss) and controller (Start button). The menu shows when this is true.
  const [pauseMenuVisible, setPauseMenuVisible] = useState(false);
  const pauseMenuVisibleRef = useRef(false);
  useEffect(() => { pauseMenuVisibleRef.current = pauseMenuVisible; }, [pauseMenuVisible]);
  // Lifted MainMenu state — allows controller navigation of the saved-worlds sub-list
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [savedWorlds, setSavedWorlds] = useState<{ name: string; savedAt: number; mode: string }[]>([]);
  const refreshSavedWorlds = useCallback(() => setSavedWorlds(listSavedWorlds()), []);

  // === Virtual digital mouse — activated with the View/Back button (Xbox "two
  // squares" button, index 8). Right stick moves the cursor, A left-clicks, X
  // right-clicks, B closes. Works on ANY UI element by dispatching synthetic
  // MouseEvents to the element under the cursor.
  // Enabled when: a gamepad is connected AND the user is NOT in active gameplay
  // (i.e., when any overlay or menu is open). During gameplay, the right stick
  // is used for camera look, so we don't intercept it.
  const vmouseEnabled = isGamepadConnected() && (
    screen === "main-menu" ||
    screen === "create-world" ||
    screen === "multiplayer" ||
    (screen === "playing" && (
      showInventory || showCraftingTable || showFurnace || showChest ||
      showConfig || showControls || showGraphics || showHostPanel || showLoadMenu ||
      pauseMenuVisible ||
      (!isLocked && !isDead)
    )) ||
    isDead
  );
  const virtualMouse = useVirtualMouse(vmouseEnabled);
  const showHostPanelRef = useRef(false);
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

  // === Gamepad connection toast ===
  // Shows a transient banner when a controller connects or disconnects
  const [gamepadToast, setGamepadToast] = useState<{ message: string; tone: "connect" | "disconnect" } | null>(null);
  const gamepadToastTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const unsub = onGamepadConnectionChange((connected, id) => {
      // Auto-switch to controller mode when one connects
      if (connected) {
        if (inputModeRef.current !== "controller") {
          inputModeRef.current = "controller";
          setInputMode("controller");
          clearAutoDetect();
        }
      }
      // Show toast
      const name = (id || "").split("(")[0].trim().slice(0, 32) || "Controller";
      setGamepadToast({
        message: connected ? `🎮 ${name} connected` : `🎮 Controller disconnected`,
        tone: connected ? "connect" : "disconnect",
      });
      if (gamepadToastTimerRef.current) window.clearTimeout(gamepadToastTimerRef.current);
      gamepadToastTimerRef.current = window.setTimeout(() => setGamepadToast(null), 3500);
    });
    return () => { unsub(); if (gamepadToastTimerRef.current) window.clearTimeout(gamepadToastTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Controller navigation for the in-game pause overlay ===
  // Root pause menu has up to 7 buttons (Continuar, Salir, Guardar, Configuración,
  // Gráficos, Controles, Multijugador/Abrir). The hook moves focus between them
  // via D-Pad/stick and triggers click on A.
  const pauseMenuButtons = useRef<Array<() => void>>([]);
  const pauseMenuNav = useControllerNav({
    enabled: screen === "playing" && pauseMenuVisible && !isDead && !showInventory && !showCraftingTable && !showFurnace && !showChest && !showConfig && !showControls && !showGraphics && !showHostPanel,
    itemCount: 7,
    columns: 1,
    initialIndex: 0,
    onConfirm: () => { pauseMenuButtons.current[pauseMenuNav.selectedIndex]?.(); },
    onBack: () => { /* B = Continuar (same as "resume") */ pauseMenuButtons.current[0]?.(); },
    onStart: () => { /* Start = resume */ pauseMenuButtons.current[0]?.(); },
  });

  // === Controller navigation for the Main Menu ===
  // Main menu has 4 buttons: Crear, Cargar, Multijugador, Opciones
  const mainMenuButtons = useRef<Array<() => void>>([]);
  const mainMenuNav = useControllerNav({
    enabled: screen === "main-menu" && !showLoadMenu,
    itemCount: 4,
    columns: 1,
    initialIndex: 0,
    onConfirm: () => { mainMenuButtons.current[mainMenuNav.selectedIndex]?.(); },
    onBack: () => { /* no-op on main menu */ },
    onStart: () => { mainMenuButtons.current[0]?.(); },
  });

  // === Controller navigation for the "Cargar mundo" sub-list ===
  // Dynamic item count = savedWorlds.length (clamped to >=1 so the hook works
  // even when the list is empty — pressing A then does nothing).
  const loadMenuButtons = useRef<Array<() => void>>([]);
  const loadMenuNav = useControllerNav({
    enabled: screen === "main-menu" && showLoadMenu,
    itemCount: Math.max(1, savedWorlds.length),
    columns: 1,
    initialIndex: 0,
    onConfirm: () => { loadMenuButtons.current[loadMenuNav.selectedIndex]?.(); },
    onBack: () => { setShowLoadMenu(false); },
    onStart: () => { setShowLoadMenu(false); },
  });

  // === Controller navigation for the Death screen ===
  // 2 buttons: Reaparecer, Menú principal
  const deathButtons = useRef<Array<() => void>>([]);
  const deathNav = useControllerNav({
    enabled: isDead,
    itemCount: 2,
    columns: 1,
    initialIndex: 0,
    onConfirm: () => { deathButtons.current[deathNav.selectedIndex]?.(); },
    onBack: () => { /* no-op */ },
  });

  // === Controller navigation for the pause sub-panels (Config/Graphics/Controls/Host) ===
  // B/Start handlers for closing sub-panels are wired in the panel-specific
  // effects below. The Controls and Host panels still use this simple nav
  // for their single "← Volver" button (A activates it, B/Start also closes).
  const controlsBackHandler = () => { setShowControls(false); showControlsRef.current = false; };
  const hostBackHandler = () => { setShowHostPanel(false); showHostPanelRef.current = false; };
  const subPanelNav = useControllerNav({
    enabled: screen === "playing" && (showControls || showHostPanel),
    itemCount: 1,
    columns: 1,
    initialIndex: 0,
    onConfirm: () => {
      if (showControlsRef.current) controlsBackHandler();
      else if (showHostPanelRef.current) hostBackHandler();
    },
    onBack: () => {
      if (showControlsRef.current) controlsBackHandler();
      else if (showHostPanelRef.current) hostBackHandler();
    },
    onStart: () => {
      if (showControlsRef.current) controlsBackHandler();
      else if (showHostPanelRef.current) hostBackHandler();
    },
  });

  // === Focus grid for the Configuración panel ===
  // Layout: 3 sliders stacked vertically, then the "← Volver" button
  // [mouseSens]
  // [controllerSensX]
  // [controllerSensY]
  // [back]
  const configFocus = useFocusGrid({
    enabled: screen === "playing" && showConfig,
    layout: [
      [{ id: "mouseSens" }],
      [{ id: "controllerSensX" }],
      [{ id: "controllerSensY" }],
      [{ id: "back" }],
    ],
  });
  // Handle B = back when in config panel
  useEffect(() => {
    if (!(screen === "playing" && showConfig)) return;
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        // B / Start = back
        if (
          wasButtonPressedLabelled("config-back", pad, 1) ||
          wasButtonPressedLabelled("config-back", pad, 9)
        ) {
          setShowConfig(false); showConfigRef.current = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screen, showConfig]);

  // === Focus grid for the Gráficos panel ===
  // Layout: 6 toggles in 2x3 grid, then shadow select + tone slider in 1 row,
  // then 6 shader toggles in 2x3, then back button
  const graphicsFocus = useFocusGrid({
    enabled: screen === "playing" && showGraphics,
    layout: [
      [{ id: "pbr" }, { id: "shadows" }, { id: "fog" }],
      [{ id: "leavesGlow" }, { id: "waterReflections" }, { id: "realisticSky" }],
      [{ id: "shadowQuality" }, { id: "toneMapping" }],
      [{ id: "shadersEnabled" }, { id: "shaderBloom" }, { id: "shaderSSAO" }],
      [{ id: "shaderGodRays" }, { id: "shaderWaterWaves" }, { id: "shaderWind" }],
      [{ id: "back" }],
    ],
  });
  // B / Start = back when in graphics panel
  useEffect(() => {
    if (!(screen === "playing" && showGraphics)) return;
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        if (
          wasButtonPressedLabelled("graphics-back", pad, 1) ||
          wasButtonPressedLabelled("graphics-back", pad, 9)
        ) {
          setShowGraphics(false); showGraphicsRef.current = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screen, showGraphics]);

  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  // Sync the pause-menu button handlers (so the controller A-button can fire them)
  useEffect(() => {
    pauseMenuButtons.current = [
      handleStartClick,
      handleExitToMenu,
      handleSaveWorld,
      () => { setShowConfig(true); showConfigRef.current = true; },
      () => { setShowGraphics(true); showGraphicsRef.current = true; },
      () => { setShowControls(true); showControlsRef.current = true; },
      mpConnected ? () => { setShowHostPanel(true); showHostPanelRef.current = true; } : hostMultiplayer,
    ];
  });

  // Sync main-menu button handlers
  // Note: "Cargar mundo" opens a sub-menu (lifted state). When the user activates
  // it, we refresh the saved worlds list and set showLoadMenu=true. The sub-list
  // has its own nav hook (loadMenuNav).
  useEffect(() => {
    mainMenuButtons.current = [
      () => setScreen("create-world"),
      () => { refreshSavedWorlds(); setShowLoadMenu(true); },
      () => setScreen("multiplayer"),
      () => { /* Opciones — disabled */ },
    ];
  });

  // Sync load-menu button handlers (one per saved world)
  useEffect(() => {
    loadMenuButtons.current = savedWorlds.map((w) => () => {
      // onLoadWorld logic — duplicated here so the controller can trigger it
      const saved = loadWorld(w.name);
      if (saved) {
        worldConfigRef.current = { name: saved.name, seed: saved.seed, mode: saved.mode };
        setCurrentWorld({ name: saved.name, seed: saved.seed, mode: saved.mode });
        setScreen("playing");
        setShowLoadMenu(false);
        setIsLoaded(false);
      }
    });
  });

  // Sync death-screen button handlers
  useEffect(() => {
    deathButtons.current = [
      handleRespawn,
      handleExitToMenu,
    ];
  });

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
    // Cap pixel ratio at 1.5 for performance. Adaptive scaling is handled in
    // the render loop (drops to 1.0 if FPS < 40, recovers to 1.5 if FPS > 55).
    const targetPixelRatio = Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(targetPixelRatio);
    let currentPixelRatio = targetPixelRatio;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Physically correct lighting (PBR) for better material response
    (renderer as any).physicallyCorrectLights = true;
    (renderer as any).useLegacyLights = false;
    // Shadows: VSM for soft, accurate self-shadowing (better than PCFSoft)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "none";

    // === PMREM environment for PBR reflections (subtle, sky-driven) ===
    const pmremGen = new THREE.PMREMGenerator(renderer);
    // Build a tiny gradient env scene (same colors as sky) for IBL
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(100, 16, 8);
    const envMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color("#2a6cd6") },
        bottomColor: { value: new THREE.Color("#87ceeb") },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main(){
          vWorld = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 bottomColor;
        varying vec3 vWorld;
        void main(){
          float h = normalize(vWorld).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(h,0.0)), 1.0);
        }`,
      side: THREE.BackSide,
    });
    envScene.add(new THREE.Mesh(envGeo, envMat));
    const envRT = pmremGen.fromScene(envScene as any, 0.04);
    scene.environment = envRT.texture;
    pmremGen.dispose();

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

    // === Lighting (PBR-tuned for physically correct mode) ===
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff4e6, 3.5);
    sun.position.set(50, 100, 30);
    // Shadow config: 2048px for crisper shadows, tight frustum around player
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 6; // softer shadow radius (VSM) for realistic penumbra
    scene.add(sun);
    scene.add(sun.target);
    // Fill light: soft blue from opposite direction (sky bounce)
    const fill = new THREE.DirectionalLight(0x88aaff, 1.1);
    fill.position.set(-40, 60, -30);
    scene.add(fill);
    // Hemisphere: sky color from above, ground color from below
    const hemi = new THREE.HemisphereLight(0x88bbff, 0x554433, 1.4);
    scene.add(hemi);
    // Subtle bounce light from below — simulates indirect bounce from ground
    const bounce = new THREE.DirectionalLight(0x8a7a5a, 0.3);
    bounce.position.set(0, -30, 0);
    scene.add(bounce);

    // === Build atlas and shared materials ===
    resetAtlas();
    const canvases = buildTextureCanvases();
    const atlas = getSharedAtlas(canvases);
    // Opaque material: solid blocks (no alpha) — receives shadows
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
    // Water material: semi-transparent blue with depth-based color shift
    // Two variants:
    //   - "plain" Lambert (default): cheap, no shaders required.
    //   - "shader" WaterShader: realistic waves + fresnel + specular + caustics.
    //     Used when `gfxSettings.shadersEnabled && shaderWaterWaves` is on. The
    //     swap happens in the render loop (we re-assign chunkMaterials' water
    //     material whenever the toggle changes).
    const transparentMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: 0x0a2244,
      emissiveIntensity: 0.2,
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

    // === Shader Manager (OptiFine-like post-processing) ===
    const shaderManager = new ShaderManager(renderer, scene, camera);

    // === Realistic water material (lazy-init when first enabled) ===
    // We keep both materials around and swap them on the live chunk meshes when
    // the user toggles `shaderWaterWaves`.
    let waterShaderMat: THREE.ShaderMaterial | null = null;
    let waterShaderActive = false; // tracks whether chunk meshes currently use the shader
    function applyWaterShader(useShader: boolean) {
      if (useShader && !waterShaderMat) {
        waterShaderMat = shaderManager.createWaterMaterial();
      }
      if (useShader === waterShaderActive) return;
      waterShaderActive = useShader;
      const targetMat = useShader ? waterShaderMat : transparentMaterial;
      if (!targetMat) return;
      // Swap material on every existing chunk's transparent mesh
      chunkMeshes.forEach((m) => {
        if (m.transparent) m.transparent.material = targetMat;
      });
    }

    // === Realistic wind material for foliage (leaves) — lazy-init ===
    // When `shaderWind` is enabled, swap the cutout material (used for leaves)
    // for the wind ShaderMaterial which adds vertex displacement + SSS.
    let windShaderMat: THREE.ShaderMaterial | null = null;
    let windShaderActive = false;
    function applyWindShader(useShader: boolean) {
      if (useShader && !windShaderMat) {
        windShaderMat = shaderManager.createWindMaterial(atlas.texture);
      }
      if (useShader === windShaderActive) return;
      windShaderActive = useShader;
      const targetMat = useShader ? windShaderMat : cutoutMaterial;
      if (!targetMat) return;
      chunkMeshes.forEach((m) => {
        if (m.cutout) m.cutout.material = targetMat;
      });
    }

    // === Multiplayer remote player rendering ===
    // Map of peer ID → PlayerModel (3D mesh)
    const remotePlayerModels = new Map<string, PlayerModel>();
    // Throttle: send local player state every 50ms (20 updates/sec)
    let mpSendTimer = 0;
    const MP_SEND_INTERVAL = 0.05; // 50ms
    // Throttle: prune stale players every 2s
    let mpPruneTimer = 0;
    const MP_PRUNE_INTERVAL = 2.0;

    // Torch lights
    const torchLights = new Map<string, THREE.PointLight>();

    // === Day/Night cycle ===
    let dayTime = dayTimeRef.current;
    let isNight = false;
    const DAY_LENGTH = 600; // seconds for full cycle (10 minutes, like Minecraft)
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

      // Sun light intensity (stronger day for sharp shadows, dim night)
      sun.intensity = 3.5 * dayFactor;
      ambient.intensity = 0.55 * dayFactor + 0.18 * nightFactor;
      hemi.intensity = 1.4 * dayFactor + 0.15 * nightFactor;
      fill.intensity = 1.1 * dayFactor + 0.2 * nightFactor;
      bounce.intensity = 0.3 * dayFactor;

      // Shadow camera follows player so shadows always render around the player
      sun.position.set(
        player.position.x + Math.cos(sunAngle) * 80,
        player.position.y + Math.sin(sunAngle) * 80,
        player.position.z + 30
      );
      sun.target.position.copy(player.position);
      sun.target.updateMatrixWorld();

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
      // If the water shader is currently active, swap the material on this fresh chunk too
      if (waterShaderActive && waterShaderMat && meshes.transparent) {
        meshes.transparent.material = waterShaderMat;
      }
      // If the wind shader is currently active, swap the cutout material too
      if (windShaderActive && windShaderMat && meshes.cutout) {
        meshes.cutout.material = windShaderMat;
      }
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
            setDragonNotification("You already have a dragon");
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
          setDragonNotification("Dragon summoned! Press N to mount it");
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

      // In survival AND creative: use the selected hotbar item from inventory
      let blockType: BlockType;
      const selected = inventoryRef.current.getSelected();
      if (!selected || selected.id >= 100) return false;
      blockType = selected.id as BlockType;
      // Remove one from inventory (in creative, items are infinite — don't consume)
      if (mode === "survival") {
        if (!inventoryRef.current.removeSelected(1)) return false;
        setInventoryVersion((v) => v + 1);
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
      // Nether: water evaporates
      if (blockType === BlockType.Water && world.dimension === "nether") { sound.blockSound(BlockType.Stone, "break"); return false; }
      world.setBlock(px, py, pz, blockType);
      // Lava + Water = Obsidian
      const checkLW = (bx: number, by: number, bz: number) => {
        const b = world.getBlock(bx, by, bz);
        if (b === BlockType.Lava) { for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) if (world.getBlock(bx+dx,by+dy,bz+dz) === BlockType.Water) { world.setBlock(bx,by,bz, BlockType.Obsidian); rebuildChunkAt(bx,bz); return; } }
        else if (b === BlockType.Water) { for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) if (world.getBlock(bx+dx,by+dy,bz+dz) === BlockType.Lava) { world.setBlock(bx+dx,by+dy,bz+dz, BlockType.Obsidian); rebuildChunkAt(bx+dx,bz+dz); return; } }
      };
      checkLW(px, py, pz);
      for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) checkLW(px+dx, py+dy, pz+dz);
      // Broadcast block placement to multiplayer peers
      if (multiplayerRef.current?.isConnected()) {
        multiplayerRef.current.sendBlockPlace(px, py, pz, blockType);
      }
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
      // Broadcast block break to multiplayer peers
      if (multiplayerRef.current?.isConnected()) {
        multiplayerRef.current.sendBlockBreak(x, y, z);
      }
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
    let portalTeleportCooldown = 0;
    let fluidFlowTimer = 0;
    let lastGunShot = 0;
    // Ender Eye projectiles
    const enderEyes: Array<{ position: THREE.Vector3; velocity: THREE.Vector3; life: number; mesh: THREE.Mesh }> = [];
    // Gun bullets
    interface Bullet { position: THREE.Vector3; velocity: THREE.Vector3; life: number; mesh: THREE.Mesh; light: THREE.PointLight; }
    const bullets: Bullet[] = [];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Chat (T key)
      if (e.code === "KeyT" && document.pointerLockElement) {
        document.exitPointerLock(); setChatOpen(true); chatOpenRef.current = true; return;
      }
      if (chatOpenRef.current) return;
      if (e.code === "KeyE" && document.pointerLockElement) {
        document.exitPointerLock(); setShowInventory(true); return;
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
          setDragonNotification("You don't have a dragon. Reach XP level 10 to receive an egg.");
          setTimeout(() => setDragonNotification(""), 3500);
        } else if (dragon.isMounted) {
          setDragonNotification("Cannot use B while mounted");
          setTimeout(() => setDragonNotification(""), 2000);
        } else {
          dragon.isStaying = !dragon.isStaying;
          setDragonNotification(dragon.isStaying
            ? "🐉 Dragon waiting here"
            : "🐉 Dragon following you");
          setTimeout(() => setDragonNotification(""), 1800);
        }
      }
      if (e.code === "KeyN") {
        // N: mount/dismount dragon pet (if one exists)
        const dragon = dragonManager.getActiveDragon();
        if (!dragon) {
          setDragonNotification("You don't have a dragon. Reach XP level 10 to receive an egg.");
          setTimeout(() => setDragonNotification(""), 3500);
          return;
        }
        // If currently mounted, dismount; otherwise mount
        if (dragon.isMounted) {
          const nowMounted = dragon.toggleMount(player.position);
          // dismount: drop player next to dragon
          player.position.set(dragon.position.x + 1, dragon.position.y, dragon.position.z);
          player.velocity.set(0, 0, 0);
          setDragonNotification("You dismounted");
          setTimeout(() => setDragonNotification(""), 1500);
        } else {
          // Only mount if dragon is close enough
          const dx = dragon.position.x - player.position.x;
          const dy = dragon.position.y - player.position.y;
          const dz = dragon.position.z - player.position.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 6) {
            setDragonNotification("Approach the dragon to mount it");
            setTimeout(() => setDragonNotification(""), 2500);
            return;
          }
          dragon.toggleMount(player.position);
          setDragonNotification("Mounted! WASD to fly, Space up, Ctrl/Shift down");
          setTimeout(() => setDragonNotification(""), 3500);
        }
      }
      if (e.code === "Escape") {
        // If config, controls, or host panel is open, close it instead of exiting pointer lock
        if (showConfigRef.current || showControlsRef.current || showGraphicsRef.current) {
          setShowConfig(false);
          setShowControls(false);
          setShowGraphics(false);
          showConfigRef.current = false;
          showControlsRef.current = false;
          showGraphicsRef.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (showHostPanelRef.current) {
          setShowHostPanel(false);
          showHostPanelRef.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
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
      // 1b. Bucket logic — place water source, pick up water
      if (selected && (selected.id === ItemType.WaterBucket || selected.id === ItemType.Bucket)) {
        const hit = player.raycast(6);
        if (hit.hit && hit.block && hit.normal) {
          const tx = hit.block.x + hit.normal.x;
          const ty = hit.block.y + hit.normal.y;
          const tz = hit.block.z + hit.normal.z;
          if (ty >= 0 && ty < WORLD_HEIGHT) {
            if (selected.id === ItemType.WaterBucket) {
              // Place water source block (level 0 = infinite source)
              world.setBlock(tx, ty, tz, BlockType.Water);
              world.setFluidLevel(tx, ty, tz, 0); // mark as source
              world.queueFluidUpdate(tx, ty, tz, BlockType.Water);
              // Replace water bucket with empty bucket
              inventoryRef.current.removeSelected(1);
              inventoryRef.current.addItem(ItemType.Bucket, 1);
              setInventoryVersion((v) => v + 1);
              sound.blockSound(BlockType.Water, "place");
              rebuildChunkAt(tx, tz);
              return;
            } else {
              // Empty bucket — pick up water source block (click on water)
              const targetBlock = world.getBlock(hit.block.x, hit.block.y, hit.block.z);
              if (targetBlock === BlockType.Water && world.getFluidLevel(hit.block.x, hit.block.y, hit.block.z) === 0) {
                // Only pick up source blocks (level 0)
                world.setBlock(hit.block.x, hit.block.y, hit.block.z, BlockType.Air);
                world.clearFluidLevel(hit.block.x, hit.block.y, hit.block.z);
                inventoryRef.current.removeSelected(1);
                inventoryRef.current.addItem(ItemType.WaterBucket, 1);
                setInventoryVersion((v) => v + 1);
                sound.blockSound(BlockType.Water, "break");
                rebuildChunkAt(hit.block.x, hit.block.z);
                return;
              }
            }
          }
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
        if (block === BlockType.Chest) {
          document.exitPointerLock();
          setShowChest(true);
          return;
        }
        // Bed: sleep at night (or explode in Nether)
        if (block === BlockType.Bed) {
          if (world.dimension === "nether") {
            // Explode
            const bx = hit.block.x, by = hit.block.y, bz = hit.block.z;
            for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
              if (Math.sqrt(dx*dx+dy*dy+dz*dz) <= 3) { const b = world.getBlock(bx+dx, by+dy, bz+dz); if (b !== BlockType.Air && b !== BlockType.Bedrock) world.setBlock(bx+dx, by+dy, bz+dz, BlockType.Air); }
            }
            rebuildChunkAt(bx, bz);
            const d = Math.sqrt((bx-player.position.x)**2+(by-player.position.y)**2+(bz-player.position.z)**2);
            if (d < 8) player.damage(30);
            sound.blockSound(BlockType.Stone, "break");
            setDragonNotification("The bed exploded!"); setTimeout(() => setDragonNotification(""), 3000);
            return;
          }
          const isNight = dayTimeRef.current > 0.6 || dayTimeRef.current < 0.2;
          if (!isNight) { setDragonNotification("You can only sleep at night"); setTimeout(() => setDragonNotification(""), 3000); return; }
          // Check hostile mobs in 8-block radius
          let hostile = false;
          for (const m of monsterManager.monsters) if (Math.sqrt((m.position.x-player.position.x)**2+(m.position.y-player.position.y)**2+(m.position.z-player.position.z)**2) < 8) { hostile = true; break; }
          if (hostile) { setDragonNotification("Cannot sleep, monsters are nearby"); setTimeout(() => setDragonNotification(""), 3000); return; }
          setSleepFade(0.01);
          spawnPointRef.current = { x: hit.block.x + 1, y: hit.block.y, z: hit.block.z };
          setTimeout(() => { dayTimeRef.current = 0.3; setSleepFade(0); setDragonNotification("Good morning!"); setTimeout(() => setDragonNotification(""), 3000); }, 1500);
          return;
        }
        // Door: toggle open/closed
        if (block === BlockType.WoodenDoor) {
          const key = `${hit.block.x},${hit.block.y},${hit.block.z}`;
          if (openDoorsRef.current.has(key)) openDoorsRef.current.delete(key); else openDoorsRef.current.add(key);
          sound.blockSound(BlockType.Wood, "place");
          return;
        }
        // Sign: open editing UI
        if (block === BlockType.Sign) {
          document.exitPointerLock();
          setSignEditing({ x: hit.block.x, y: hit.block.y, z: hit.block.z });
          setSignText(["", "", "", ""]);
          signEditingRef.current = true;
          return;
        }
        // EndPortalFrame: place Ender Eye
        if (block === BlockType.EndPortalFrame) {
          const sel = inventoryRef.current.getSelected();
          if (sel && sel.id === ItemType.EnderEye) {
            const key = `${hit.block.x},${hit.block.y},${hit.block.z}`;
            if (!endPortalEyesRef.current.has(key)) {
              endPortalEyesRef.current.add(key);
              inventoryRef.current.removeSelected(1);
              setInventoryVersion((v) => v + 1);
              sound.eat();
              // Check if portal should activate (all 8 frames have eyes)
              for (let cdy = -1; cdy <= 1; cdy++) for (let cdx = -1; cdx <= 1; cdx++) for (let cdz = -1; cdz <= 1; cdz++) {
                const ccx = hit.block.x + cdx, ccy = hit.block.y + cdy, ccz = hit.block.z + cdz;
                if (world.getBlock(ccx, ccy, ccz) === BlockType.Air) {
                  let frame = 0, eyes = 0;
                  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dz === 0) continue;
                    if (world.getBlock(ccx+dx, ccy, ccz+dz) === BlockType.EndPortalFrame) { frame++; if (endPortalEyesRef.current.has(`${ccx+dx},${ccy},${ccz+dz}`)) eyes++; }
                  }
                  if (frame === 8 && eyes === 8) { world.setBlock(ccx, ccy, ccz, BlockType.EndPortal); rebuildChunkAt(ccx, ccz); setDragonNotification("End Portal activated!"); setTimeout(() => setDragonNotification(""), 3000); }
                }
              }
              return;
            }
          }
        }
        // Nether portal ignition (Flint and Steel or right-click obsidian)
        if (block === BlockType.Obsidian || block === BlockType.NetherPortal) {
          const sel = inventoryRef.current.getSelected();
          const hasFlint = sel && sel.id === ItemType.FlintAndSteel;
          if (hasFlint || block === BlockType.Obsidian) {
            if (tryIgnitePortal(hit.block.x, hit.block.y, hit.block.z)) {
              if (hasFlint) { inventoryRef.current.damageSelected(1); setInventoryVersion((v) => v + 1); }
              sound.blockSound(BlockType.Glass, "break");
              return;
            }
          }
        }
        // Ender Eye throwing
        if (selected && selected.id === ItemType.EnderEye) {
          world.computeStrongholdPositionsPublic();
          const positions = world.strongholdPositions ?? [{ x: 0, z: 0 }];
          let sx = positions[0].x, sz = positions[0].z, best = Infinity;
          for (const p of positions) { const d = Math.sqrt((p.x-player.position.x)**2+(p.z-player.position.z)**2); if (d < best) { best = d; sx = p.x; sz = p.z; } }
          const dx = sx - player.position.x, dz = sz - player.position.z, dist = Math.sqrt(dx*dx+dz*dz);
          const dirX = dx / dist, dirZ = dz / dist;
          const eyeStart = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
          const eyeVel = new THREE.Vector3(dirX, 0.3, dirZ).normalize().multiplyScalar(15);
          const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0x1a8a4a }));
          eyeMesh.position.copy(eyeStart); scene.add(eyeMesh);
          enderEyes.push({ position: eyeStart.clone(), velocity: eyeVel, life: 3.0, mesh: eyeMesh });
          inventoryRef.current.removeSelected(1); setInventoryVersion((v) => v + 1); handView.triggerAction("swing"); sound.eat();
          setDragonNotification("Ojo de Ender lanzado. Distancia: " + Math.floor(dist) + " bloques");
          setTimeout(() => setDragonNotification(""), 4000);
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
        // Gun firing
        const sel = inventoryRef.current.getSelected();
        if (sel && sel.id === ItemType.Gun) {
          const now = Date.now();
          if (now - lastGunShot > 400) {
            lastGunShot = now;
            handView.triggerAction("swing");
            sound.hit();
            // Bullet toward crosshair
            const cp = Math.cos(player.pitch);
            const fwd = new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp).normalize();
            const bs = new THREE.Vector3(player.position.x + fwd.x * 0.5, player.position.y + 1.5 + fwd.y * 0.5, player.position.z + fwd.z * 0.5);
            const bm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffdd44 }));
            bm.position.copy(bs); scene.add(bm);
            const bl = new THREE.PointLight(0xffaa33, 1.5, 6); bl.position.copy(bs); scene.add(bl);
            bullets.push({ position: bs.clone(), velocity: fwd.clone().multiplyScalar(80), life: 1.0, mesh: bm, light: bl });
            // Hit detection (cone test)
            const eyeX = player.position.x, eyeY = player.position.y + 1.5, eyeZ = player.position.z;
            const coneCos = 0.98;
            const hitMob = (mx: number, my: number, mz: number) => { const dx = mx-eyeX, dy = my-eyeY, dz = mz-eyeZ, d = Math.sqrt(dx*dx+dy*dy+dz*dz); return d <= 30 && (dx*fwd.x+dy*fwd.y+dz*fwd.z)/d > coneCos; };
            const dmg = 8;
            for (const m of monsterManager.monsters) if (hitMob(m.position.x, m.position.y+0.8, m.position.z)) { const died = m.takeDamage(dmg); if (m.knockback) m.knockback(player.position.x, player.position.z, 6); if (died) { for (const d2 of m.getDrops()) dropManager.spawnDrop(d2.id, d2.count, m.position.x, m.position.y+0.5, m.position.z); monsterManager.removeMonster(m); } break; }
            for (const a of animalManager.animals) if (hitMob(a.position.x, a.position.y+0.8, a.position.z)) { const died = a.takeDamage(dmg, player.position); if (died) { for (const d2 of a.getDrops()) dropManager.spawnDrop(d2.id, d2.count, a.position.x, a.position.y+0.5, a.position.z); animalManager.removeAnimal(a); } break; }
            for (const en of endermanManager.endermen) if (hitMob(en.position.x, en.position.y+0.8, en.position.z)) { en.takeDamage(dmg); break; }
            for (const bz of blazeManager.blazes) if (hitMob(bz.position.x, bz.position.y+0.8, bz.position.z)) { const died = bz.takeDamage(dmg); if (died) { for (const d2 of bz.getDrops()) dropManager.spawnDrop(d2.id, d2.count, bz.position.x, bz.position.y+0.5, bz.position.z); blazeManager.removeBlaze(bz); } break; }
            inventoryRef.current.damageSelected(0.5);
          }
          return;
        }
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
      const locked = document.pointerLockElement === renderer.domElement;
      setIsLocked(locked);
      // When pointer lock is lost (Esc pressed, or user clicked away), show
      // the pause menu. When re-locked, hide it.
      if (!locked && !pauseMenuVisibleRef.current && !isDead) {
        // Only show if we're in active gameplay (not already in a menu)
        pauseMenuVisibleRef.current = true;
        setPauseMenuVisible(true);
      }
      if (locked && pauseMenuVisibleRef.current) {
        pauseMenuVisibleRef.current = false;
        setPauseMenuVisible(false);
      }
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
    let rippleSpawnTimer = 0; // throttle for water ripples when player is in water
    let gravityBlockTimer = 0; // throttle for sand/gravel falling
    // Falling block animations (sand, gravel) — mesh falls visually, then lands
    const fallingBlocks: Array<{
      mesh: THREE.Mesh;
      velocity: number;
      blockType: BlockType;
      x: number;
      z: number;
      startY: number;
      landed: boolean;
    }> = [];

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

      // === Gamepad input (Xbox controller) ===
      // Auto-switch to controller when a gamepad is detected
      if (wasGamepadConnected() && inputModeRef.current === "keyboard") {
        inputModeRef.current = "controller";
        setInputMode("controller");
        clearAutoDetect();
      }

      const usingController = inputModeRef.current === "controller";
      const gp = usingController ? readGamepad(0) : null;

      // If controller is active and we have a gamepad, use it for everything.
      // IMPORTANT: skip gameplay input when the pause menu is open (pointer
      // unlocked but not dead and no overlay) — that's when the virtual mouse
      // is active and RT should NOT mine blocks.
      const pauseMenuOpen = screen === "playing" && pauseMenuVisibleRef.current && !isDead && !showInventory && !showCraftingTable && !showFurnace && !showChest;
      if (gp && !player.isDead() && !showInventory && !showCraftingTable && !showFurnace && !showChest && !pauseMenuOpen) {
        // Movement: left stick → WASD
        player.setKey("KeyW", gp.moveY < -0.3);
        player.setKey("KeyS", gp.moveY > 0.3);
        player.setKey("KeyA", gp.moveX < -0.3);
        player.setKey("KeyD", gp.moveX > 0.3);
        // Jump: A
        player.setKey("Space", gp.a);
        // Sprint: LS click
        player.setKey("ShiftLeft", gp.ls);
        // Fly down in creative: LT (left trigger, hold)
        player.setKey("ControlLeft", gp.lt);
        // Look: right stick — uses live controller sensitivity
        const lookSensX = controllerSensXRef.current * 200;
        const lookSensY = controllerSensYRef.current * 200;
        player.addMouseDelta(gp.lookX * lookSensX, gp.lookY * lookSensY);

        // Hotbar: RB = next, LB = previous (edge detected)
        if (wasButtonPressed(gp, 5)) {
          const idx = (selectedSlotRef.current + 1) % 9;
          setSelectedSlot(idx); selectedSlotRef.current = idx;
          inventoryRef.current.setSelected(idx);
        }
        if (wasButtonPressed(gp, 4)) {
          const idx = (selectedSlotRef.current - 1 + 9) % 9;
          setSelectedSlot(idx); selectedSlotRef.current = idx;
          inventoryRef.current.setSelected(idx);
        }
        // D-pad hotbar slots — LB modifier gives access to slots 4-8
        // Without LB: D-pad Up/Down/Left/Right = slots 0/1/2/3
        // With LB held: D-pad Up/Down/Left/Right = slots 4/5/6/7, RB = slot 8
        if (!gp.lb) {
          if (wasButtonPressed(gp, 12)) { setSelectedSlot(0); selectedSlotRef.current = 0; inventoryRef.current.setSelected(0); }
          if (wasButtonPressed(gp, 13)) { setSelectedSlot(1); selectedSlotRef.current = 1; inventoryRef.current.setSelected(1); }
          if (wasButtonPressed(gp, 14)) { setSelectedSlot(2); selectedSlotRef.current = 2; inventoryRef.current.setSelected(2); }
          if (wasButtonPressed(gp, 15)) { setSelectedSlot(3); selectedSlotRef.current = 3; inventoryRef.current.setSelected(3); }
        } else {
          // LB + D-Pad = slots 4-7
          if (wasButtonPressedLabelled("hotbar", gp, 12)) { setSelectedSlot(4); selectedSlotRef.current = 4; inventoryRef.current.setSelected(4); }
          if (wasButtonPressedLabelled("hotbar", gp, 13)) { setSelectedSlot(5); selectedSlotRef.current = 5; inventoryRef.current.setSelected(5); }
          if (wasButtonPressedLabelled("hotbar", gp, 14)) { setSelectedSlot(6); selectedSlotRef.current = 6; inventoryRef.current.setSelected(6); }
          if (wasButtonPressedLabelled("hotbar", gp, 15)) { setSelectedSlot(7); selectedSlotRef.current = 7; inventoryRef.current.setSelected(7); }
          // LB + RB = slot 8 (last)
          if (wasButtonPressedLabelled("hotbar", gp, 5)) { setSelectedSlot(8); selectedSlotRef.current = 8; inventoryRef.current.setSelected(8); }
        }

        // Attack/Mine: RT (hold)
        if (gp.rt) {
          if (!leftMouseDown) {
            leftMouseDown = true;
            handView.triggerAction("swing");
          }
        } else {
          leftMouseDown = false;
          miningProgress = 0;
          miningBlock = null;
        }

        // Place/Interact: A (edge) — also acts as jump when held, but edge = place
        // Wait — A is jump (held). Let's use X for place instead.
        // X = Place/Interact (edge)
        if (wasButtonPressed(gp, 2)) {
          performRightClickAction();
        }

        // Inventory: Y (edge)
        if (wasButtonPressed(gp, 3)) {
          setShowInventory(true);
        }

        // Dragon mount/dismount: B (edge)
        if (wasButtonPressed(gp, 1)) {
          const drag = dragonManager.getActiveDragon();
          if (drag) {
            if (drag.isMounted) {
              drag.toggleMount(player.position);
              player.position.set(drag.position.x + 1, drag.position.y, drag.position.z);
              player.velocity.set(0, 0, 0);
            } else {
              const d = Math.hypot(drag.position.x - player.position.x, drag.position.z - player.position.z);
              if (d <= 6) drag.toggleMount(player.position);
            }
          }
        }

        // Dragon stay/follow: Back (edge)
        if (wasButtonPressed(gp, 8)) {
          const drag = dragonManager.getActiveDragon();
          if (drag && !drag.isMounted) drag.isStaying = !drag.isStaying;
        }

        // Pause: Start (edge) — toggle pause menu visibility directly
        if (wasButtonPressed(gp, 9)) {
          if (document.pointerLockElement) document.exitPointerLock();
          // For controller mode: toggle the pause menu directly
          pauseMenuVisibleRef.current = true;
          setPauseMenuVisible(true);
        }
      }

      // === Player update ===
      // Keyboard: requires pointer lock. Controller: works without it, but
      // we still pause when the pause menu is open (so the player doesn't
      // keep moving/falling while the user is navigating the menu).
      const canUpdate = usingController
        ? (!player.isDead() && !showInventory && !showCraftingTable && !showFurnace && !showChest && !pauseMenuOpen)
        : (document.pointerLockElement === renderer.domElement && !player.isDead());
      if (canUpdate) {
        if (isDragonMounted) {
          const sensitivity = mouseSensRef.current * 0.001;
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
                setDragonNotification("You reached level 10! You received a Dragon Egg. Place it to summon your pet.");
              } else {
                // Inventory full - drop the egg on the ground at the player's position
                dropManager.spawnDrop(ItemType.DragonEgg, 1, player.position.x, player.position.y + 1, player.position.z);
                setDragonNotification("Level 10! Dragon Egg dropped on the ground (inventory full).");
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
      if (leftMouseDown && (document.pointerLockElement === renderer.domElement || usingController) && !player.isDead()) {
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

      // === MULTIPLAYER: send local state + render remote players ===
      const mp = multiplayerRef.current;
      if (mp && mp.isConnected()) {
        // Send local player state (throttled to 20Hz)
        mpSendTimer += dt;
        if (mpSendTimer >= MP_SEND_INTERVAL) {
          mpSendTimer = 0;
          mp.sendPlayerState(player.position, player.yaw, player.pitch);
        }
        // Prune stale players (throttled to 0.5Hz)
        mpPruneTimer += dt;
        if (mpPruneTimer >= MP_PRUNE_INTERVAL) {
          mpPruneTimer = 0;
          mp.pruneStalePlayers();
        }

        // Render remote players: create/update/dispose meshes
        const remoteState = mp.remotePlayers;
        const seenIds = new Set<string>();
        for (const [peerId, state] of remoteState) {
          seenIds.add(peerId);
          let model = remotePlayerModels.get(peerId);
          if (!model) {
            // Create new player model
            model = new PlayerModel(peerId.slice(-8)); // short name = last 8 chars of peer ID
            scene.add(model.group);
            remotePlayerModels.set(peerId, model);
          }
          // Update model pose
          // Estimate walking: check if position changed recently (lastSeen is fresh)
          const isFresh = (Date.now() - state.lastSeen) < 500;
          const isMoving = isFresh; // assume moving if data is fresh
          // Walk animation time: increment based on real time
          const walkT = Date.now() / 1000 * 6;
          model.update(state.position, state.yaw, state.pitch, walkT, isMoving);
        }
        // Remove models for players no longer in remoteState
        for (const [peerId, model] of remotePlayerModels) {
          if (!seenIds.has(peerId)) {
            scene.remove(model.group);
            model.dispose();
            remotePlayerModels.delete(peerId);
          }
        }
      } else {
        // Not connected: clean up any existing remote player models
        for (const [peerId, model] of remotePlayerModels) {
          scene.remove(model.group);
          model.dispose();
        }
        remotePlayerModels.clear();
      }

      // === DIMENSION COMMAND (from chat /dimension) ===
      if (dimensionCommandRef.current) {
        const dim = dimensionCommandRef.current;
        dimensionCommandRef.current = null;
        if (dim !== world.dimension) {
          if (world.dimension === "overworld") overworldReturnPos.current = { x: player.position.x, y: player.position.y, z: player.position.z };
          world.dimension = dim as any; world.clearAllChunks();
          for (const [key, meshes] of chunkMeshes) {
            if (meshes.opaque) { chunkGroup.remove(meshes.opaque); meshes.opaque.geometry.dispose(); }
            if (meshes.cutout) { chunkGroup.remove(meshes.cutout); meshes.cutout.geometry.dispose(); }
            if (meshes.transparent) { chunkGroup.remove(meshes.transparent); meshes.transparent.geometry.dispose(); }
            if (meshes.glass) { chunkGroup.remove(meshes.glass); meshes.glass.geometry.dispose(); }
          }
          chunkMeshes.clear();
          if (dim === "overworld") { const r = overworldReturnPos.current; if (r) player.position.set(r.x, r.y, r.z); }
          else if (dim === "nether") player.position.set(0.5, 40, 0.5);
          else if (dim === "end") player.position.set(0.5, 52, 0.5);
        }
      }

      // === NETHER PORTAL TELEPORTATION ===
      const pBlockX = Math.floor(player.position.x), pBlockY = Math.floor(player.position.y + 0.5), pBlockZ = Math.floor(player.position.z);
      if (world.getBlock(pBlockX, pBlockY, pBlockZ) === BlockType.NetherPortal && portalTeleportCooldown <= 0) {
        portalTeleportCooldown = 3.0;
        if (world.dimension === "overworld") {
          overworldReturnPos.current = { x: player.position.x, y: player.position.y, z: player.position.z };
          world.dimension = "nether"; world.clearAllChunks();
          for (const [key, meshes] of chunkMeshes) { if (meshes.opaque) { chunkGroup.remove(meshes.opaque); meshes.opaque.geometry.dispose(); } if (meshes.cutout) { chunkGroup.remove(meshes.cutout); meshes.cutout.geometry.dispose(); } if (meshes.transparent) { chunkGroup.remove(meshes.transparent); meshes.transparent.geometry.dispose(); } if (meshes.glass) { chunkGroup.remove(meshes.glass); meshes.glass.geometry.dispose(); } }
          chunkMeshes.clear();
          player.position.set(Math.floor(player.position.x / 8) + 0.5, 40, Math.floor(player.position.z / 8) + 0.5);
          setDragonNotification("Teletransportado al Nether"); setTimeout(() => setDragonNotification(""), 3000);
        } else if (world.dimension === "nether") {
          world.dimension = "overworld"; world.clearAllChunks();
          for (const [key, meshes] of chunkMeshes) { if (meshes.opaque) { chunkGroup.remove(meshes.opaque); meshes.opaque.geometry.dispose(); } if (meshes.cutout) { chunkGroup.remove(meshes.cutout); meshes.cutout.geometry.dispose(); } if (meshes.transparent) { chunkGroup.remove(meshes.transparent); meshes.transparent.geometry.dispose(); } if (meshes.glass) { chunkGroup.remove(meshes.glass); meshes.glass.geometry.dispose(); } }
          chunkMeshes.clear();
          const r = overworldReturnPos.current; if (r) player.position.set(r.x, r.y, r.z);
          setDragonNotification("Volviendo al Overworld"); setTimeout(() => setDragonNotification(""), 3000);
        }
      }
      // End Portal teleportation
      if (world.getBlock(pBlockX, pBlockY, pBlockZ) === BlockType.EndPortal && portalTeleportCooldown <= 0 && world.dimension === "overworld") {
        portalTeleportCooldown = 3.0;
        overworldReturnPos.current = { x: player.position.x, y: player.position.y, z: player.position.z };
        world.dimension = "end"; world.clearAllChunks();
        for (const [key, meshes] of chunkMeshes) { if (meshes.opaque) { chunkGroup.remove(meshes.opaque); meshes.opaque.geometry.dispose(); } if (meshes.cutout) { chunkGroup.remove(meshes.cutout); meshes.cutout.geometry.dispose(); } if (meshes.transparent) { chunkGroup.remove(meshes.transparent); meshes.transparent.geometry.dispose(); } if (meshes.glass) { chunkGroup.remove(meshes.glass); meshes.glass.geometry.dispose(); } }
        chunkMeshes.clear();
        player.position.set(0.5, 52, 0.5);
        setDragonNotification("Teletransportado al End"); setTimeout(() => setDragonNotification(""), 3000);
      }
      if (portalTeleportCooldown > 0) portalTeleportCooldown -= dt;

      // === END VOID DAMAGE ===
      if (world.dimension === "end" && player.position.y < -64) player.damage(4 * dt);

      // === FLUID FLOW ===
      fluidFlowTimer += dt;
      if (fluidFlowTimer >= 1.0) {
        fluidFlowTimer = 0;
        const pX = Math.floor(player.position.x), pY = Math.floor(player.position.y), pZ = Math.floor(player.position.z);
        for (let dy = -5; dy <= 5; dy++) for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
          const b = world.getBlockIfLoaded(pX + dx, pY + dy, pZ + dz);
          if (b === BlockType.Water || b === BlockType.Lava) world.queueFluidUpdate(pX + dx, pY + dy, pZ + dz, b);
        }
        if (world.processFluidFlow(100)) { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const cx = Math.floor((pX + dx * CHUNK_SIZE) / CHUNK_SIZE), cz = Math.floor((pZ + dz * CHUNK_SIZE) / CHUNK_SIZE); if (chunkMeshes.has(`${cx},${cz}`)) buildChunk(cx, cz); } }
      }

      // === GRAVITY BLOCKS (sand, gravel falling) — animated fall ===
      // Instead of teleporting the block down, we:
      //   1. Remove the block from the world
      //   2. Spawn a falling mesh (a small cube with the block texture)
      //   3. The mesh falls with gravity until it hits a solid block
      //   4. The block is placed back at the landing position
      gravityBlockTimer += dt;
      if (gravityBlockTimer >= 0.2) {
        gravityBlockTimer = 0;
        const pX = Math.floor(player.position.x), pY = Math.floor(player.position.y), pZ = Math.floor(player.position.z);
        let anyFell = false;
        // Scan from bottom to top so cascading falls work in one pass
        for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
          const bx = pX + dx, by = pY + dy, bz = pZ + dz;
          const b = world.getBlockIfLoaded(bx, by, bz);
          if (b === undefined) continue;
          const def = BLOCKS[b as BlockType];
          if (!def?.gravityAffected) continue;
          // Check if the block below is air or water (can fall through)
          if (by <= 0) continue;
          const below = world.getBlockIfLoaded(bx, by - 1, bz);
          if (below === BlockType.Air || below === BlockType.Water) {
            // Remove the block from the world
            world.setBlock(bx, by, bz, BlockType.Air);
            // Create a falling block mesh
            const tile = atlas.tiles[def.textures.side] || atlas.tiles[def.textures.top];
            const fallGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
            const fallMat = new THREE.MeshLambertMaterial({ map: atlas.texture });
            if (tile) {
              const uvs = fallGeo.attributes.uv;
              for (let f = 0; f < 6; f++) {
                const base = f * 4;
                uvs.setXY(base + 0, tile.u0, tile.v1);
                uvs.setXY(base + 1, tile.u1, tile.v1);
                uvs.setXY(base + 2, tile.u0, tile.v0);
                uvs.setXY(base + 3, tile.u1, tile.v0);
              }
              uvs.needsUpdate = true;
            }
            const fallMesh = new THREE.Mesh(fallGeo, fallMat);
            fallMesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);
            scene.add(fallMesh);
            fallingBlocks.push({
              mesh: fallMesh,
              velocity: 0,
              blockType: b,
              x: bx,
              z: bz,
              startY: by,
              landed: false,
            });
            anyFell = true;
          }
        }
        if (anyFell) {
          // Rebuild affected chunks
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
            const cx = Math.floor((pX + dx * CHUNK_SIZE) / CHUNK_SIZE), cz = Math.floor((pZ + dz * CHUNK_SIZE) / CHUNK_SIZE);
            if (chunkMeshes.has(`${cx},${cz}`)) buildChunk(cx, cz);
          }
        }
      }

      // === Update falling block animations ===
      for (let i = fallingBlocks.length - 1; i >= 0; i--) {
        const fb = fallingBlocks[i];
        // Apply gravity
        fb.velocity += 20 * dt; // gravity acceleration
        fb.mesh.position.y -= fb.velocity * dt;
        // Check if we've fallen one full block
        const fallDistance = fb.startY + 0.5 - fb.mesh.position.y;
        if (fallDistance >= 1.0) {
          // Check the block at the landing position
          const landY = fb.startY - Math.floor(fallDistance);
          const targetBlock = world.getBlockIfLoaded(fb.x, landY, fb.z);
          if (targetBlock === BlockType.Air || targetBlock === BlockType.Water) {
            // Keep falling — update startY to the new position
            fb.startY = landY;
          } else {
            // Landed — place the block at the position above the obstacle
            const placeY = landY + 1;
            world.setBlock(fb.x, placeY, fb.z, fb.blockType);
            // Rebuild chunk
            const cx = Math.floor(fb.x / CHUNK_SIZE), cz = Math.floor(fb.z / CHUNK_SIZE);
            if (chunkMeshes.has(`${cx},${cz}`)) buildChunk(cx, cz);
            // Clean up
            scene.remove(fb.mesh);
            fb.mesh.geometry.dispose();
            (fb.mesh.material as THREE.Material).dispose();
            fallingBlocks.splice(i, 1);
          }
        }
        // Safety: remove if fell too far (into void)
        if (fb.mesh.position.y < -64) {
          scene.remove(fb.mesh);
          fb.mesh.geometry.dispose();
          (fb.mesh.material as THREE.Material).dispose();
          fallingBlocks.splice(i, 1);
        }
      }

      // === ITEM NAME DISPLAY (5s timer) ===
      const heldItemId = inventoryRef.current.getSelected()?.id ?? null;
      if (heldItemId !== prevHeldItemIdRef.current) {
        prevHeldItemIdRef.current = heldItemId;
        if (heldItemId !== null) { itemNameTimerRef.current = Date.now() + 5000; setItemNameVisible(true); }
        else setItemNameVisible(false);
      }
      if (itemNameVisible && Date.now() > itemNameTimerRef.current) setItemNameVisible(false);

      // === UPDATE BULLETS ===
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.life -= dt;
        if (b.life <= 0) { scene.remove(b.mesh); scene.remove(b.light); bullets.splice(i, 1); continue; }
        b.position.addScaledVector(b.velocity, dt);
        b.mesh.position.copy(b.position); b.light.position.copy(b.position);
        const bx2 = Math.floor(b.position.x), by2 = Math.floor(b.position.y), bz2 = Math.floor(b.position.z);
        if (world.getBlock(bx2, by2, bz2) !== BlockType.Air && world.getBlock(bx2, by2, bz2) !== BlockType.Water) { scene.remove(b.mesh); scene.remove(b.light); bullets.splice(i, 1); }
      }
      // === UPDATE ENDER EYES ===
      for (let i = enderEyes.length - 1; i >= 0; i--) {
        const eye = enderEyes[i];
        eye.life -= dt;
        if (eye.life <= 0) { scene.remove(eye.mesh); enderEyes.splice(i, 1); continue; }
        eye.velocity.y -= 5 * dt;
        eye.position.addScaledVector(eye.velocity, dt);
        eye.mesh.position.copy(eye.position);
        eye.mesh.rotation.x += dt * 5; eye.mesh.rotation.y += dt * 3;
      }

      // === APPLY SHADER SETTINGS ===
      const gss = gfxSettingsRef.current;
      if (gss.shadersEnabled !== shaderManager.enabled) {
        shaderManager.setEnabled(gss.shadersEnabled);
        if (gss.shadersEnabled) shaderManager.init();
      }
      if (shaderManager.enabled) {
        shaderManager.updateSetting("bloom", gss.shaderBloom);
        shaderManager.updateSetting("godRays", gss.shaderGodRays);
        shaderManager.updateSetting("waterWaves", gss.shaderWaterWaves);
        shaderManager.updateSetting("windEffect", gss.shaderWind);
        shaderManager.updateSetting("fog", gss.shaderFog);
        shaderManager.updateSetting("toneMappingExposure", gss.toneMapping);

        // Compute sun direction in world space (from dayTime — same as updateDayNight)
        const sunAngle = (dayTime - 0.25) * Math.PI * 2;
        const sunDirWorld = new THREE.Vector3(
          Math.cos(sunAngle),
          Math.sin(sunAngle),
          0.3
        ).normalize();
        // Project sun position to screen space for god rays
        const sunWorldPos = new THREE.Vector3(
          player.position.x + Math.cos(sunAngle) * 150,
          player.position.y + Math.sin(sunAngle) * 150,
          player.position.z
        );
        const sunScreen = sunWorldPos.clone().project(camera);
        const sunScreenPos = new THREE.Vector2(
          (sunScreen.x + 1) * 0.5,
          (sunScreen.y + 1) * 0.5
        );
        // Skip god rays if sun is behind the camera
        const sunVisible = sunScreen.z < 1 && Math.abs(sunScreen.x) < 1.5 && Math.abs(sunScreen.y) < 1.5;
        const fogColor = (scene.fog as THREE.Fog)?.color ?? new THREE.Color("#87ceeb");
        const fogNear = (scene.fog as THREE.Fog)?.near ?? 30;
        const fogFar = (scene.fog as THREE.Fog)?.far ?? 80;
        shaderManager.updateDynamicUniforms(
          sunVisible ? sunScreenPos : null,
          sunDirWorld,
          camera.position,
          (scene.background as THREE.Color) ?? new THREE.Color("#87ceeb"),
          fogColor,
          fogNear,
          fogFar
        );

        // Apply water shader swap if needed (lazy-init, idempotent)
        applyWaterShader(gss.shaderWaterWaves);
        // Apply wind shader swap for foliage (leaves)
        applyWindShader(gss.shaderWind);

        shaderManager.render();
      } else {
        // Make sure we revert to Lambert water/wind if shaders are disabled
        applyWaterShader(false);
        applyWindShader(false);
        renderer.render(scene, camera);
      }

      // Spawn ripples when the player enters or moves through water
      if (player.inWater && waterShaderMat) {
        // Throttle: spawn a ripple every ~0.3s while in water
        rippleSpawnTimer -= dt;
        if (rippleSpawnTimer <= 0) {
          shaderManager.spawnRipple(player.position.x, player.position.y, player.position.z);
          rippleSpawnTimer = 0.3;
        }
      }

      // Sync hand lighting with day/night cycle so the hand dims at night
      // and warms when near a torch
      const _sunAngle = (dayTime - 0.25) * Math.PI * 2;
      const _sunHeight = Math.sin(_sunAngle);
      const _dayFactor = Math.max(0, Math.min(1, (_sunHeight + 0.2) / 0.4));
      // Detect if any torch light is near the player (within 6 blocks)
      let torchNear = false;
      for (const tl of torchLights.values()) {
        if (tl.position.distanceTo(player.position) < 6) { torchNear = true; break; }
      }
      handView.setWorldLight(_dayFactor, torchNear);
      // Tell the hand whether we're actively mining (so it auto-loops the break swing)
      handView.miningHeld = !!(leftMouseDown && miningBlock && !player.isDead());

      // Render first-person hand on top
      handView.update(dt);
      // Update held item based on selected slot (both survival and creative use inventory)
      const heldItemId2: number | null = inventoryRef.current.getSelected()?.id ?? null;
      handView.updateItem(heldItemId2);
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
        // === Adaptive pixel ratio — drop resolution if FPS is low, recover when high ===
        // This is the single biggest performance lever for fillrate-bound scenes.
        if (newFps < 35 && currentPixelRatio > 1.0) {
          currentPixelRatio = 1.0;
          renderer.setPixelRatio(currentPixelRatio);
        } else if (newFps > 55 && currentPixelRatio < targetPixelRatio) {
          currentPixelRatio = targetPixelRatio;
          renderer.setPixelRatio(currentPixelRatio);
        }
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
          armorDefense: totalDefense(armorStateRef.current),
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
      shaderManager.dispose();
      // Dispose water shader material (if it was created)
      if (waterShaderMat) { waterShaderMat.dispose(); waterShaderMat = null; }
      // Dispose wind shader material (if it was created)
      if (windShaderMat) { windShaderMat.dispose(); windShaderMat = null; }
      // Dispose remote player models (multiplayer)
      for (const [peerId, model] of remotePlayerModels) {
        scene.remove(model.group);
        model.dispose();
      }
      remotePlayerModels.clear();
      // Disconnect multiplayer
      if (multiplayerRef.current) {
        multiplayerRef.current.disconnect();
        multiplayerRef.current = null;
      }
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

  // === MULTIPLAYER ===
  // Host: open current world to multiplayer (generates a share code)
  const hostMultiplayer = useCallback(async () => {
    setMpError("");
    setMpStatus("Creating world...");
    if (!multiplayerRef.current) {
      multiplayerRef.current = new MultiplayerManager();
      multiplayerRef.current.onStatusChange = (s) => setMpStatus(s);
      multiplayerRef.current.onError = (e) => { setMpError(e); setMpStatus(""); };
      multiplayerRef.current.onConnected = () => setMpConnected(true);
      // When a client joins, send them the world seed
      multiplayerRef.current.onPlayerJoined = (clientId) => {
        const cfg = worldConfigRef.current;
        if (cfg) {
          const conn = multiplayerRef.current!.hostConnections.get(clientId);
          if (conn) {
            multiplayerRef.current!.sendWorldSeed(conn, cfg.seed, cfg.name, cfg.mode);
          }
        }
      };
      // Handle incoming world mutations from clients (block place/break)
      multiplayerRef.current.onMessage = (msg: MultiplayerMessage) => {
        const w = worldRef.current;
        if (!w) return;
        if (msg.kind === "block-place") {
          w.setBlock(msg.x, msg.y, msg.z, msg.blockType);
        } else if (msg.kind === "block-break") {
          w.setBlock(msg.x, msg.y, msg.z, BlockType.Air);
        }
      };
    }
    try {
      await multiplayerRef.current.hostWorld();
      setMpShareCode(multiplayerRef.current.shareCode);
      setShowHostPanel(true);
      showHostPanelRef.current = true;
    } catch (e: any) {
      setMpError(e?.message || "Error opening world");
    }
  }, []);

  // Client: join a host's world using their code
  const joinMultiplayer = useCallback(async (code: string) => {
    setMpError("");
    setMpStatus("Connecting...");
    if (!multiplayerRef.current) {
      multiplayerRef.current = new MultiplayerManager();
      multiplayerRef.current.onStatusChange = (s) => setMpStatus(s);
      multiplayerRef.current.onError = (e) => { setMpError(e); setMpStatus(""); };
      multiplayerRef.current.onConnected = () => setMpConnected(true);
      // When we receive a world-seed from host, start the world
      // Also handle block place/break from host
      multiplayerRef.current.onMessage = (msg: MultiplayerMessage) => {
        if (msg.kind === "world-seed") {
          const config: WorldConfig = {
            name: msg.name,
            seed: msg.seed,
            mode: msg.mode as GameMode,
          };
          worldConfigRef.current = config;
          setCurrentWorld(config);
          setScreen("playing");
          setIsLoaded(false);
          setIsDead(false);
          inventoryRef.current.clear();
          pendingLoadRef.current = null;
          pendingXpLoadRef.current = null;
          pendingArmorLoadRef.current = null;
          xpStateRef.current.reset();
          armorStateRef.current = emptyArmor();
        } else if (msg.kind === "block-place") {
          const w = worldRef.current;
          if (w) w.setBlock(msg.x, msg.y, msg.z, msg.blockType);
        } else if (msg.kind === "block-break") {
          const w = worldRef.current;
          if (w) w.setBlock(msg.x, msg.y, msg.z, BlockType.Air);
        }
      };
    }
    try {
      await multiplayerRef.current.joinWorld(code);
      setMpShareCode(code);
      setMpConnected(true);
    } catch (e: any) {
      setMpError(e?.message || "Error connecting");
      setMpStatus("");
    }
  }, []);

  // Disconnect from multiplayer
  const disconnectMultiplayer = useCallback(() => {
    if (multiplayerRef.current) {
      multiplayerRef.current.disconnect();
    }
    setMpConnected(false);
    setMpShareCode("");
    setMpStatus("");
    setShowHostPanel(false);
    showHostPanelRef.current = false;
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
    setPauseMenuVisible(false);
    pauseMenuVisibleRef.current = false;
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
    setSaveMessage(success ? "✓ World saved" : "✗ Error saving");
    setTimeout(() => setSaveMessage(""), 3000);
  }, [currentWorld]);

  const handleStartClick = useCallback(() => {
    // Close the pause menu immediately — works for both keyboard and controller.
    // For keyboard/mouse mode, also try to re-lock the pointer. For controller
    // mode, the game runs without pointer lock so just hiding the menu is enough.
    setPauseMenuVisible(false);
    pauseMenuVisibleRef.current = false;
    // Try to re-lock pointer (works for keyboard/mouse; silently fails for
    // controller which is fine since controller mode doesn't need pointer lock).
    const canvas = containerRef.current?.querySelector("canvas");
    if (canvas) {
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof (p as any).catch === "function") {
          (p as Promise<void>).catch(() => {});
        }
      } catch (e) { /* ignore */ }
    }
  }, []);

  // === SCREENS ===
  if (screen === "main-menu") {
    return (
      <MainMenu
        iconUrls={iconUrls}
        onCreateWorld={() => setScreen("create-world")}
        onMultiplayer={() => setScreen("multiplayer")}
        selectedIndex={mainMenuNav.selectedIndex}
        showLoadMenu={showLoadMenu}
        setShowLoadMenu={setShowLoadMenu}
        savedWorlds={savedWorlds}
        refreshSavedWorlds={refreshSavedWorlds}
        loadMenuSelectedIndex={loadMenuNav.selectedIndex}
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
  if (screen === "multiplayer") {
    return (
      <MultiplayerScreen
        onCancel={() => setScreen("main-menu")}
        onJoin={(code) => {
          // Join the world with the given code
          joinMultiplayer(code);
        }}
        externalStatus={mpStatus}
        externalError={mpError}
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

      {/* HUD — Minecraft F3-style: each line is its own separate box */}
      <div className="absolute top-1 left-1 z-20 flex flex-col gap-0.5">
        {/* World name */}
        <div className="font-mono text-[11px] leading-tight px-1.5 py-0.5 text-yellow-300 font-bold" style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #000",
        }}>
          {currentWorld?.name || "World"}
        </div>
        {/* FPS */}
        <div className="font-mono text-[11px] leading-tight px-1.5 py-0.5 text-white" style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #000",
        }}>
          FPS: {stats.fps}
        </div>
        {/* XYZ coordinates */}
        <div className="font-mono text-[11px] leading-tight px-1.5 py-0.5 text-white" style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #000",
        }}>
          X: {stats.x}  Y: {stats.y}  Z: {stats.z}
        </div>
        {/* Chunks */}
        <div className="font-mono text-[11px] leading-tight px-1.5 py-0.5 text-white" style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #000",
        }}>
          Chunks: {stats.chunks}
        </div>
        {/* Seed */}
        <div className="font-mono text-[10px] leading-tight px-1.5 py-0.5 text-white/70" style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #000",
        }}>
          Seed: {currentWorld?.seed ?? 0}
        </div>
        {/* Held item name */}
        <div className="font-mono text-[11px] leading-tight px-1.5 py-0.5 text-white/85" style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #000",
        }}>
          {(() => {
            const stack = inventoryRef.current.slots[selectedSlot];
            if (!stack) return "(empty)";
            if (stack.id < 100) return BLOCKS[stack.id as BlockType]?.name ?? "Unknown";
            return ITEMS[stack.id as ItemType]?.name ?? "Unknown";
          })()}
        </div>
        {/* Game mode */}
        <div className="font-mono text-[11px] leading-tight px-1.5 py-0.5 text-yellow-300/90" style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #000",
        }}>
          {mode === "creative" ? "Creative" : "Survival"}
        </div>
        {/* Inventory hint */}
        <div className="font-mono text-[10px] leading-tight px-1.5 py-0.5 text-white/50" style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #000",
        }}>
          E: Inventory
        </div>
      </div>

      {/* Held item name (5s timer) */}
      {itemNameVisible && (() => {
        const stack = inventoryRef.current.slots[selectedSlot];
        const name = stack ? (stack.id < 100 ? BLOCKS[stack.id as BlockType]?.name ?? "Unknown" : ITEMS[stack.id as ItemType]?.name ?? "Unknown") : "";
        if (!name) return null;
        return <div className="absolute bottom-[150px] left-1/2 -translate-x-1/2 z-20 pointer-events-none font-mono text-sm sm:text-base font-bold" style={{ color: "#fff", textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000" }}>{name}</div>;
      })()}

      {/* Survival stats - centered above hotbar like Minecraft */}
      {mode === "survival" && (
        <>
          {/* Armor bar (above hearts, only if wearing armor) */}
          {stats.armorDefense > 0 && (
            <div className="absolute bottom-[124px] left-1/2 -translate-x-1/2 z-20 flex flex-row items-end" style={{ filter: "drop-shadow(1px 1px 0 #000)" }}>
              <div className="flex gap-px">
                {Array.from({ length: 10 }).map((_, i) => (
                  <ArmorIcon key={i} filled={Math.min(2, Math.max(0, stats.armorDefense - i * 2))} />
                ))}
              </div>
            </div>
          )}
          {/* Hearts + hunger row */}
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

      {/* Hotbar — Minecraft style, nearly opaque with beveled slots */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex p-1"
        key={inventoryVersion}
        style={{
          backgroundColor: "rgba(40,40,40,0.92)",
          borderTop: "2px solid rgba(120,120,120,0.95)",
          borderLeft: "2px solid rgba(120,120,120,0.95)",
          borderBottom: "2px solid rgba(0,0,0,0.95)",
          borderRight: "2px solid rgba(0,0,0,0.95)",
          imageRendering: "pixelated",
          boxShadow: "0 4px 12px rgba(0,0,0,0.7)",
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => {
          const isSelected = i === selectedSlot;
          let iconUrl: string | undefined;
          let count = 0;
          let name = "";
          let durFraction: number | null = null;

          // Both survival and creative use the inventory slots
          {
            const stack = inventoryRef.current.slots[i];
            if (stack) {
              count = stack.count;
              if (stack.id < 100) {
                const def = BLOCKS[stack.id as BlockType];
                if (def) {
                  name = def.name;
                  const iconName = stack.id === BlockType.Grass ? "grass_side" : (def.textures.side || def.textures.top);
                  iconUrl = iconUrls[iconName];
                }
              } else {
                const def = ITEMS[stack.id as ItemType];
                if (def) {
                  name = def.name;
                  iconUrl = iconUrls[def.icon];
                  if (def.maxDurability) {
                    const cur = stack.durability !== undefined ? stack.durability : def.maxDurability;
                    durFraction = Math.max(0, Math.min(1, cur / def.maxDurability));
                  }
                }
              }
            }
          }

          return (
            <div
              key={i}
              className="relative flex items-center justify-center transition-transform"
              style={{
                width: "52px", height: "52px",
                marginRight: i < 8 ? "2px" : "0",
                imageRendering: "pixelated",
                transform: isSelected ? "translateY(-4px) scale(1.06)" : "translateY(0) scale(1)",
              }}
            >
              {/* Slot background — Minecraft-style inset bevel */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: "#8b8b8b",
                  borderTop: "1px solid #373737",
                  borderLeft: "1px solid #373737",
                  borderBottom: "1px solid #ffffff",
                  borderRight: "1px solid #ffffff",
                }}
              />
              {/* Selection highlight - bright white border with glow */}
              {isSelected && (
                <div className="absolute pointer-events-none" style={{
                  inset: "-4px",
                  border: "3px solid #ffffff",
                  boxShadow: "0 0 10px rgba(255,255,255,0.6), inset 0 0 0 1px rgba(0,0,0,0.4)",
                  zIndex: 5,
                }} />
              )}
              {/* Item icon with subtle drop shadow */}
              {iconUrl && (
                <img src={iconUrl} alt={name} className="relative z-10" style={{
                  width: "36px", height: "36px", imageRendering: "pixelated",
                  filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.6))",
                }} draggable={false} />
              )}
              {/* Slot number */}
              <span className="absolute top-0.5 left-1 text-[9px] font-mono pointer-events-none z-20"
                style={{ color: "rgba(255,255,255,0.4)", textShadow: "1px 1px 0 #000" }}>
                {i + 1}
              </span>
              {/* Stack count with 4-direction shadow for readability */}
              {count > 1 && (
                <span className="absolute bottom-0.5 right-1 text-sm font-mono font-bold pointer-events-none z-20"
                  style={{ color: "#fff", textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000" }}>
                  {count}
                </span>
              )}
              {/* Durability bar */}
              {durFraction !== null && (
                <div className="absolute bottom-0.5 left-1.5 right-1.5 h-[4px] pointer-events-none z-15"
                  style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
                  <div className="h-full" style={{
                    width: `${durFraction * 100}%`,
                    backgroundColor: durFraction > 0.5 ? "#4ade80" : durFraction > 0.2 ? "#facc15" : "#ef4444",
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pause overlay — Minecraft-style menu */}
      {pauseMenuVisible && isLoaded && !isDead && !showInventory && !showCraftingTable && !showFurnace && !showChest && (
        <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.78)", backdropFilter: "blur(2px)" }}>
          {!showControls && !showConfig && !showGraphics ? (
            <div className="max-w-sm w-full mx-4" style={{ imageRendering: "pixelated" }}>
              <h1 className="text-center text-3xl sm:text-4xl font-black mb-6 text-white" style={{
                fontFamily: "monospace",
                textShadow: "0 0 30px rgba(80,140,255,0.5), 3px 3px 0 #0a0a1a, 5px 5px 0 rgba(0,0,0,0.5)",
                WebkitTextStroke: "1px #0a0a1a",
                letterSpacing: "0.05em",
              }}>
                {currentWorld?.name || "JEFFCRAFT"}
              </h1>
              <div className="flex flex-col gap-2 mb-2">
                <MCMenuButton onClick={handleStartClick} color="gray" selected={pauseMenuNav.selectedIndex === 0}>Continue</MCMenuButton>
                <MCMenuButton onClick={handleExitToMenu} color="gray" selected={pauseMenuNav.selectedIndex === 1}>Exit World</MCMenuButton>
              </div>
              <div className="flex gap-2 mb-2">
                <MCMenuButton onClick={handleSaveWorld} color="gray" className="flex-1 text-sm" selected={pauseMenuNav.selectedIndex === 2}>Save</MCMenuButton>
                <MCMenuButton onClick={() => { setShowConfig(true); showConfigRef.current = true; }} color="gray" className="flex-1 text-sm" selected={pauseMenuNav.selectedIndex === 3}>Settings</MCMenuButton>
              </div>
              <div className="flex gap-2 mb-2">
                <MCMenuButton onClick={() => { setShowGraphics(true); showGraphicsRef.current = true; }} color="gray" className="flex-1 text-sm" selected={pauseMenuNav.selectedIndex === 4}>Graphics</MCMenuButton>
                <MCMenuButton onClick={() => { setShowControls(true); showControlsRef.current = true; }} color="gray" className="flex-1 text-sm" selected={pauseMenuNav.selectedIndex === 5}>Controls</MCMenuButton>
              </div>
              <div className="flex gap-2 mb-2">
                {/* Multiplayer: open current world to other players */}
                {mpConnected ? (
                  <MCMenuButton
                    onClick={() => { setShowHostPanel(true); showHostPanelRef.current = true; }}
                    color="gray"
                    className="flex-1 text-sm"
                    selected={pauseMenuNav.selectedIndex === 6}
                  >
                    Multiplayer ✓
                  </MCMenuButton>
                ) : (
                  <MCMenuButton
                    onClick={hostMultiplayer}
                    color="gray"
                    className="flex-1 text-sm"
                    selected={pauseMenuNav.selectedIndex === 6}
                  >
                    Open to LAN
                  </MCMenuButton>
                )}
              </div>
              {/* Host panel — shown after hostMultiplayer succeeds */}
              {showHostPanel && (
                <div className="mt-3 p-3" style={{
                  backgroundColor: "rgba(0,0,0,0.7)",
                  borderTop: "3px solid rgba(110,110,120,0.9)",
                  borderLeft: "3px solid rgba(110,110,120,0.9)",
                  borderBottom: "3px solid rgba(0,0,0,0.95)",
                  borderRight: "3px solid rgba(0,0,0,0.95)",
                }}>
                  <p className="text-white font-mono text-xs text-center mb-2" style={{ textShadow: "1px 1px 0 #000" }}>
                    Share this code with your friends:
                  </p>
                  <p className="text-yellow-300 font-mono font-black text-3xl text-center tracking-[0.3em] mb-2" style={{ textShadow: "2px 2px 0 #000" }}>
                    {mpShareCode}
                  </p>
                  {mpStatus && (
                    <p className="text-green-400 font-mono text-[10px] text-center mb-2" style={{ textShadow: "1px 1px 0 #000" }}>
                      {mpStatus}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <MCMenuButton
                      onClick={() => {
                        navigator.clipboard?.writeText(mpShareCode).catch(() => {});
                      }}
                      color="gray"
                      className="flex-1 text-xs"
                    >
                      Copy
                    </MCMenuButton>
                    <MCMenuButton
                      onClick={disconnectMultiplayer}
                      color="gray"
                      className="flex-1 text-xs"
                    >
                      Close World
                    </MCMenuButton>
                  </div>
                </div>
              )}
              {mpError && (
                <p className="mt-2 text-center text-xs text-red-400 font-mono" style={{ textShadow: "1px 1px 0 #000" }}>
                  ⚠ {mpError}
                </p>
              )}
              {saveMessage && <p className="mt-3 text-center text-xs text-green-400 font-mono" style={{ textShadow: "1px 1px 0 #000" }}>{saveMessage}</p>}
              <p className="mt-2 text-center text-xs text-stone-400 font-mono" style={{ textShadow: "1px 1px 0 #000" }}>
                {mode === "creative" ? "Creative" : "Survival"} · Press Esc to resume
              </p>
            </div>
          ) : showConfig ? (
            /* ===== CONFIGURATION PANEL (sensitivity sliders) ===== */
            <div className="max-w-md w-full mx-4" style={{ imageRendering: "pixelated" }}>
              <h2 className="text-center text-2xl font-black mb-4 text-white" style={{
                fontFamily: "monospace",
                textShadow: "2px 2px 0 #0a0a1a, 4px 4px 0 rgba(0,0,0,0.5)",
                letterSpacing: "0.05em",
              }}>Settings</h2>
              <div className="text-left p-4 mb-4 space-y-2" style={{
                backgroundColor: "rgba(0,0,0,0.7)",
                borderTop: "3px solid rgba(110,110,120,0.9)",
                borderLeft: "3px solid rgba(110,110,120,0.9)",
                borderBottom: "3px solid rgba(0,0,0,0.95)",
                borderRight: "3px solid rgba(0,0,0,0.95)",
                boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.1)",
              }}>
                <MCSlider
                  label="Mouse sensitivity"
                  value={mouseSens}
                  min={0.1}
                  max={10.0}
                  step={0.05}
                  defaultValue={1.5}
                  focused={configFocus.isFocused("mouseSens")}
                  onChange={(v) => { setMouseSens(v); mouseSensRef.current = v; }}
                  format={(v) => v.toFixed(2)}
                />
                <MCSlider
                  label="Controller sensitivity (X)"
                  value={controllerSensX}
                  min={0.1}
                  max={10.0}
                  step={0.05}
                  defaultValue={1.0}
                  focused={configFocus.isFocused("controllerSensX")}
                  onChange={(v) => { setControllerSensX(v); controllerSensXRef.current = v; }}
                  format={(v) => v.toFixed(2)}
                />
                <MCSlider
                  label="Controller sensitivity (Y)"
                  value={controllerSensY}
                  min={0.1}
                  max={10.0}
                  step={0.05}
                  defaultValue={1.0}
                  focused={configFocus.isFocused("controllerSensY")}
                  onChange={(v) => { setControllerSensY(v); controllerSensYRef.current = v; }}
                  format={(v) => v.toFixed(2)}
                />
                <p className="text-stone-400 text-[10px] font-mono text-center pt-1">
                  Range: 0.1 (very slow) – 10.0 (very fast). Changes apply immediately.
                </p>
                <p className="text-cyan-300 text-[9px] font-mono text-center">
                  🎮 D-Pad ↑↓ navigate · ◀ ▶ adjust · A reset · B back
                </p>
              </div>
              <MCMenuButton
                onClick={() => { setShowConfig(false); showConfigRef.current = false; }}
                color="gray"
                selected={configFocus.isFocused("back")}
              >← Back</MCMenuButton>
            </div>
          ) : showGraphics ? (
            /* ===== GRAPHICS PANEL — compact 2-column grid ===== */
            <div className="max-w-lg w-full mx-4" style={{ imageRendering: "pixelated" }}>
              <h2 className="text-center text-2xl font-black mb-3 text-white" style={{ fontFamily: "monospace", textShadow: "2px 2px 0 #0a0a1a, 4px 4px 0 rgba(0,0,0,0.5)", letterSpacing: "0.05em" }}>Graphics</h2>
              <div className="p-3 mb-3 max-h-[70vh] overflow-y-auto" style={{ backgroundColor: "rgba(0,0,0,0.7)", borderTop: "3px solid rgba(110,110,120,0.9)", borderLeft: "3px solid rgba(110,110,120,0.9)", borderBottom: "3px solid rgba(0,0,0,0.95)", borderRight: "3px solid rgba(0,0,0,0.95)" }}>
                <p className="text-green-300 font-mono text-[10px] font-bold mb-2">BASIC</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <MCToggle label="PBR" desc="Realistic materials" value={gfxSettings.pbr} onChange={(v) => { setGfxSettings(s => ({...s, pbr: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, pbr: v}; gfxNeedsRebuildRef.current = true; }} focused={graphicsFocus.isFocused("pbr")} />
                  <MCToggle label="Shadows" desc="Dynamic shadows" value={gfxSettings.shadows} onChange={(v) => { setGfxSettings(s => ({...s, shadows: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, shadows: v}; }} focused={graphicsFocus.isFocused("shadows")} />
                  <MCToggle label="Fog" desc="Distance depth" value={gfxSettings.fog} onChange={(v) => { setGfxSettings(s => ({...s, fog: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, fog: v}; }} focused={graphicsFocus.isFocused("fog")} />
                  <MCToggle label="Glowing leaves" desc="Subsurface scattering" value={gfxSettings.leavesGlow} onChange={(v) => { setGfxSettings(s => ({...s, leavesGlow: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, leavesGlow: v}; gfxNeedsRebuildRef.current = true; }} focused={graphicsFocus.isFocused("leavesGlow")} />
                  <MCToggle label="Water reflections" desc="Environment reflections" value={gfxSettings.waterReflections} onChange={(v) => { setGfxSettings(s => ({...s, waterReflections: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, waterReflections: v}; }} focused={graphicsFocus.isFocused("waterReflections")} />
                  <MCToggle label="Realistic sky" desc="Sunsets and glow" value={gfxSettings.realisticSky} onChange={(v) => { setGfxSettings(s => ({...s, realisticSky: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, realisticSky: v}; }} focused={graphicsFocus.isFocused("realisticSky")} />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <MCSelect<number>
                    label="Shadows"
                    value={gfxSettings.shadowQuality}
                    options={[{ value: 512, label: "512 Fast" }, { value: 1024, label: "1024 Medium" }, { value: 2048, label: "2048 Sharp" }]}
                    onChange={(v) => { setGfxSettings(s => ({...s, shadowQuality: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, shadowQuality: v}; }}
                    focused={graphicsFocus.isFocused("shadowQuality")}
                  />
                  <div className="flex-1">
                    <MCSlider
                      label="Exposure"
                      value={gfxSettings.toneMapping}
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      defaultValue={1.2}
                      focused={graphicsFocus.isFocused("toneMapping")}
                      onChange={(v) => { setGfxSettings(s => ({...s, toneMapping: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, toneMapping: v}; }}
                      format={(v) => v.toFixed(1)}
                    />
                  </div>
                </div>
                <div className="pt-2 border-t border-stone-700"><p className="text-cyan-300 font-mono text-[10px] font-bold mb-2">🔮 SHADERS (ULTRA REALISTIC)</p></div>
                <div className="grid grid-cols-2 gap-2">
                  <MCToggle label="✨ Enable Shaders" desc="Full post-processing" value={gfxSettings.shadersEnabled} onChange={(v) => { setGfxSettings(s => ({...s, shadersEnabled: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, shadersEnabled: v}; }} focused={graphicsFocus.isFocused("shadersEnabled")} />
                  <MCToggle label="Bloom" desc="Light glow" value={gfxSettings.shaderBloom} onChange={(v) => { setGfxSettings(s => ({...s, shaderBloom: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, shaderBloom: v}; }} focused={graphicsFocus.isFocused("shaderBloom")} />
                  <MCToggle label="SSAO" desc="Best left OFF, color grading already applied" value={gfxSettings.shaderSSAO} onChange={(v) => { setGfxSettings(s => ({...s, shaderSSAO: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, shaderSSAO: v}; }} focused={graphicsFocus.isFocused("shaderSSAO")} />
                  <MCToggle label="God Rays" desc="Sun rays" value={gfxSettings.shaderGodRays} onChange={(v) => { setGfxSettings(s => ({...s, shaderGodRays: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, shaderGodRays: v}; }} focused={graphicsFocus.isFocused("shaderGodRays")} />
                  <MCToggle label="Water waves" desc="Gerstner waves" value={gfxSettings.shaderWaterWaves} onChange={(v) => { setGfxSettings(s => ({...s, shaderWaterWaves: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, shaderWaterWaves: v}; }} focused={graphicsFocus.isFocused("shaderWaterWaves")} />
                  <MCToggle label="Wind" desc="Leaf movement" value={gfxSettings.shaderWind} onChange={(v) => { setGfxSettings(s => ({...s, shaderWind: v})); gfxSettingsRef.current = {...gfxSettingsRef.current, shaderWind: v}; }} focused={graphicsFocus.isFocused("shaderWind")} />
                </div>
                <p className="text-cyan-300 text-[9px] font-mono text-center mt-3">
                  🎮 D-Pad navigates grid · A toggles/resets · ◀ ▶ adjusts slider · B back
                </p>
              </div>
              <MCMenuButton
                onClick={() => { setShowGraphics(false); showGraphicsRef.current = false; }}
                color="gray"
                selected={graphicsFocus.isFocused("back")}
              >← Back</MCMenuButton>
            </div>
          ) : (
            /* ===== CONTROLS PANEL (existing) ===== */
            <div className="max-w-md w-full mx-4" style={{ imageRendering: "pixelated" }}>
              <h2 className="text-center text-2xl font-black mb-4 text-white" style={{
                fontFamily: "monospace",
                textShadow: "2px 2px 0 #0a0a1a, 4px 4px 0 rgba(0,0,0,0.5)",
                letterSpacing: "0.05em",
              }}>Controls</h2>
              <div className="text-left text-sm space-y-1.5 p-4 mb-4" style={{
                backgroundColor: "rgba(0,0,0,0.7)",
                borderTop: "3px solid rgba(110,110,120,0.9)",
                borderLeft: "3px solid rgba(110,110,120,0.9)",
                borderBottom: "3px solid rgba(0,0,0,0.95)",
                borderRight: "3px solid rgba(0,0,0,0.95)",
                boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.1)",
              }}>
                <ControlRow keys="WASD" desc="Move" />
                <ControlRow keys="Mouse" desc="Look around" />
                <ControlRow keys="Space" desc="Jump / Swim up" />
                <ControlRow keys="Shift" desc="Run" />
                <ControlRow keys="Left click" desc={mode === "survival" ? "Mine block / Attack" : "Break block"} />
                <ControlRow keys="Right click / M" desc="Eat / Open table-furnace / Place" />
                <ControlRow keys="1-9 / Wheel" desc="Select slot" />
                {mode === "survival" && <ControlRow keys="E" desc="Open inventory" />}
                {mode === "survival" && <ControlRow keys="Right click on table" desc="Craft" />}
                {mode === "survival" && <ControlRow keys="Right click on furnace" desc="Cook food" />}
                {mode === "survival" && <ControlRow keys="N" desc="Mount/dismount dragon 🐉" />}
                {mode === "survival" && <ControlRow keys="B" desc="Dragon waits/follows you" />}
                {mode === "creative" && <ControlRow keys="F" desc="Fly" />}
                <ControlRow keys="Esc" desc="Pause" />
                {/* Xbox controller mapping */}
                {inputMode === "controller" && (
                  <>
                    <div className="mt-3 mb-1 text-yellow-300 font-bold text-xs" style={{ textShadow: "1px 1px 0 #000" }}>
                      ── Xbox Controller ──
                    </div>
                    <ControlRow keys="Left Stick" desc="Move" />
                    <ControlRow keys="Right Stick" desc="Look" />
                    <ControlRow keys="A" desc="Jump" />
                    <ControlRow keys="B" desc="Mount/dismount dragon" />
                    <ControlRow keys="X" desc="Place / Interact" />
                    <ControlRow keys="Y" desc="Inventory" />
                    <ControlRow keys="RT" desc="Mine / Attack (hold)" />
                    <ControlRow keys="LT" desc="Descend (creative)" />
                    <ControlRow keys="LB / RB" desc="Previous / next slot" />
                    <ControlRow keys="D-Pad" desc="Slots 1-4 (without LB) / 5-8 (with LB)" />
                    <ControlRow keys="LB + RB" desc="Slot 9" />
                    <ControlRow keys="LS (click)" desc="Run" />
                    <ControlRow keys="Back" desc="Dragon waits/follows" />
                    <ControlRow keys="Start" desc="Pause / Resume" />
                    <ControlRow keys="A / B" desc="Confirm / Back (in menus)" />
                    <ControlRow keys="RT (hold)" desc="Digital mouse (menus only)" />
                  </>
                )}
              </div>
              {/* Input mode selector */}
              <div className="flex gap-2 mb-3 justify-center">
                <button
                  onClick={() => { setInputMode("keyboard"); inputModeRef.current = "keyboard"; resetGamepadState(); }}
                  className="px-4 py-2 font-mono font-bold text-sm transition-all hover:scale-105"
                  style={{
                    backgroundColor: inputMode === "keyboard" ? "#5a8a3a" : "#5a5a5a",
                    borderTop: "2px solid #8aba5a",
                    borderLeft: "2px solid #8aba5a",
                    borderBottom: "2px solid #2a4a1a",
                    borderRight: "2px solid #2a4a1a",
                    color: "#fff",
                    textShadow: "1px 1px 0 #1a1a1a",
                    imageRendering: "pixelated",
                  }}
                >
                  ⌨ Keyboard
                </button>
                <button
                  onClick={() => { setInputMode("controller"); inputModeRef.current = "controller"; resetGamepadState(); }}
                  className="px-4 py-2 font-mono font-bold text-sm transition-all hover:scale-105"
                  style={{
                    backgroundColor: inputMode === "controller" ? "#3a5a8a" : "#5a5a5a",
                    borderTop: "2px solid #5a7aaa",
                    borderLeft: "2px solid #5a7aaa",
                    borderBottom: "2px solid #1a2a4a",
                    borderRight: "2px solid #1a2a4a",
                    color: "#fff",
                    textShadow: "1px 1px 0 #1a1a1a",
                    imageRendering: "pixelated",
                  }}
                >
                  🎮 Xbox Controller
                </button>
              </div>
              {!isGamepadConnected() && inputMode === "controller" && (
                <p className="text-center text-xs text-yellow-400 font-mono mb-2" style={{ textShadow: "1px 1px 0 #000" }}>
                  ⚠ No controller detected. Connect an Xbox controller.
                </p>
              )}
              <MCMenuButton onClick={() => { setShowControls(false); showControlsRef.current = false; }} color="gray" selected={subPanelNav.selectedIndex === 0}>← Back</MCMenuButton>
            </div>
          )}
        </div>
      )}

      {/* === CHAT (T key) === */}
      {chatOpen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center pb-20 pointer-events-none">
          <div className="w-full max-w-2xl mx-4 pointer-events-auto">
            <div className="max-h-48 overflow-y-auto mb-2 p-2" style={{ backgroundColor: "rgba(0,0,0,0.6)", borderTop: "2px solid rgba(80,80,80,0.8)", borderLeft: "2px solid rgba(80,80,80,0.8)", borderBottom: "2px solid rgba(0,0,0,0.9)", borderRight: "2px solid rgba(0,0,0,0.9)" }}>
              {chatMessages.length === 0 ? <p className="text-stone-500 text-xs font-mono">Type /help for commands</p> :
                chatMessages.slice(-8).map((msg, i) => <p key={i} className={`text-xs font-mono mb-0.5 ${msg.type === "system" ? "text-yellow-300" : "text-white"}`} style={{ textShadow: "1px 1px 0 #000" }}>{msg.text}</p>)}
            </div>
            <input type="text" value={chatInput} autoFocus onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { const t = chatInput.trim(); if (t) { if (t.startsWith("/")) processChatCommand(t); else { setChatMessages(prev => [...prev, { text: "<Player> " + t, type: "chat" }]); if (multiplayerRef.current?.isConnected()) multiplayerRef.current.sendChat(t); } } setChatInput(""); setChatOpen(false); chatOpenRef.current = false; }
                else if (e.key === "Escape") { setChatInput(""); setChatOpen(false); chatOpenRef.current = false; }
              }}
              placeholder="Message or command (/help)..." className="w-full px-3 py-2 text-white font-mono text-sm outline-none" style={{ backgroundColor: "rgba(0,0,0,0.8)", borderTop: "2px solid rgba(80,80,80,0.8)", borderLeft: "2px solid rgba(80,80,80,0.8)", borderBottom: "2px solid rgba(0,0,0,0.9)", borderRight: "2px solid rgba(0,0,0,0.9)" }} />
          </div>
        </div>
      )}
      {/* === SLEEP FADE === */}
      {sleepFade > 0 && <div className="absolute inset-0 z-50 pointer-events-none bg-black" style={{ opacity: sleepFade }} />}
      {sleepFade > 0 && sleepFade < 1 && (() => { setTimeout(() => setSleepFade(Math.min(1, sleepFade + 0.05)), 50); return null; })()}
      {/* === SIGN EDITING === */}
      {signEditing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="p-4" style={{ backgroundColor: "#c6c6c6", borderTop: "4px solid #fff", borderLeft: "4px solid #fff", borderBottom: "4px solid #373737", borderRight: "4px solid #373737" }}>
            <h3 className="text-[#2a2a2a] font-mono font-bold text-sm mb-3 text-center">Edit Sign</h3>
            <div className="space-y-1 mb-3">
              {[0,1,2,3].map(line => <input key={line} type="text" value={signText[line]} maxLength={15} onChange={(e) => { const n = [...signText]; n[line] = e.target.value; setSignText(n); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { setSignEditing(null); signEditingRef.current = false; } }} className="w-48 px-2 py-1 text-sm font-mono outline-none" style={{ backgroundColor: "#8b8b8b", border: "2px solid #555", color: "#000" }} placeholder={`Line ${line+1}`} autoFocus={line === 0} />)}
            </div>
            <button onClick={() => { setSignEditing(null); signEditingRef.current = false; }} className="w-full py-2 text-white font-mono font-bold text-sm" style={{ backgroundColor: "#5a8a3a", border: "2px solid #2a4a1a" }}>Done</button>
          </div>
        </div>
      )}
      {/* Death screen */}
      {isDead && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-red-950/70 backdrop-blur-sm">
          <div className="text-center text-white">
            <h1 className="text-5xl font-bold mb-6" style={{ fontFamily: "monospace" }}>You died!</h1>
            <div className="flex gap-4 justify-center">
              <button
                onClick={(e) => { e.preventDefault(); handleRespawn(); }}
                onTouchEnd={(e) => { e.preventDefault(); handleRespawn(); }}
                className={`px-6 py-3 border-2 rounded text-lg font-bold transition-all ${deathNav.selectedIndex === 0 ? "scale-110 bg-green-600 border-green-300 shadow-[0_0_20px_rgba(150,255,150,0.6)]" : "bg-green-700 hover:bg-green-600 border-green-500"}`}
                style={{ touchAction: "manipulation", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
              >
                Respawn
              </button>
              <button
                onClick={(e) => { e.preventDefault(); handleExitToMenu(); }}
                onTouchEnd={(e) => { e.preventDefault(); handleExitToMenu(); }}
                className={`px-6 py-3 border-2 rounded text-lg font-bold transition-all ${deathNav.selectedIndex === 1 ? "scale-110 bg-stone-500 border-stone-200 shadow-[0_0_20px_rgba(200,200,200,0.5)]" : "bg-stone-700 hover:bg-stone-600 border-stone-500"}`}
                style={{ touchAction: "manipulation", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
              >
                Main Menu
              </button>
            </div>
            <p className="mt-4 text-stone-300 text-sm font-mono">🎮 A: confirm · D-Pad: navigate · or tap a button</p>
          </div>
        </div>
      )}

      {!isLoaded && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
          <div className="text-white font-mono text-xl">Generating world...</div>
        </div>
      )}

      {/* Gamepad connection / disconnection toast */}
      {gamepadToast && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 font-mono text-sm font-bold text-white shadow-xl transition-all"
          style={{
            backgroundColor: gamepadToast.tone === "connect" ? "rgba(46, 90, 50, 0.95)" : "rgba(120, 40, 40, 0.95)",
            borderTop: "3px solid " + (gamepadToast.tone === "connect" ? "#7aaa5a" : "#aa5a5a"),
            borderLeft: "3px solid " + (gamepadToast.tone === "connect" ? "#7aaa5a" : "#aa5a5a"),
            borderBottom: "3px solid " + (gamepadToast.tone === "connect" ? "#2a4a1a" : "#4a1a1a"),
            borderRight: "3px solid " + (gamepadToast.tone === "connect" ? "#2a4a1a" : "#4a1a1a"),
            imageRendering: "pixelated",
            textShadow: "1px 1px 0 #000",
          }}
        >
          {gamepadToast.message}
        </div>
      )}

      {/* Virtual digital mouse cursor — shown when the user holds the Right
          Trigger (RT) while a gamepad is connected. */}
      <VirtualMouseCursor visible={virtualMouse.visible} pos={virtualMouse.pos} />
      {virtualMouse.visible && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[90] px-3 py-1.5 bg-stone-900/90 border-2 border-cyan-500 rounded text-cyan-300 font-mono text-xs" style={{ textShadow: "1px 1px 0 #000" }}>
          🖱️ Digital mouse · Right stick: move · A: click · X: right click · Release RT to exit
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
        const status = dragon.isMounted ? "[MOUNTED]" : dragon.isStaying ? "[WAITING]" : "[Free]";
        const hint = dragon.isMounted
          ? "Press N to dismount"
          : dragon.isStaying
            ? "Press N to mount · B to make it follow"
            : "Press N to mount · B to make it wait";
        return (
          <div className="absolute top-2 right-2 z-20 px-3 py-1.5 bg-black/50 rounded text-white font-mono text-xs">
            <div className="text-purple-300 font-bold">🐉 Dragon {status}</div>
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
          furnaceState={furnaceStateRef.current}
          onClose={() => {
            setShowFurnace(false);
          }}
          onInventoryChange={() => setInventoryVersion((v) => v + 1)}
        />
      )}

      {/* Chest UI — simple storage that shares inventory slots 9-35 */}
      {showChest && (
        <ChestUI
          inventory={inventoryRef.current}
          iconUrls={iconUrls}
          onClose={() => setShowChest(false)}
          onInventoryChange={() => setInventoryVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

// =============== CHEST UI ===============
function ChestUI({ inventory, iconUrls, onClose, onInventoryChange }: {
  inventory: Inventory;
  iconUrls: Record<string, string>;
  onClose: () => void;
  onInventoryChange: () => void;
}) {
  const [heldItem, setHeldItem] = useState<{ id: number; count: number } | null>(null);
  const [, forceUpdate] = useState(0);
  const refresh = () => forceUpdate((v) => v + 1);

  const getIcon = (id: number): string | undefined => {
    if (id < 100) {
      const def = BLOCKS[id as BlockType];
      if (!def) return undefined;
      if (id === BlockType.Grass) return iconUrls["grass_side"] || undefined;
      return iconUrls[def.textures.side] || iconUrls[def.textures.top] || undefined;
    }
    const def = ITEMS[id as ItemType];
    return def ? (iconUrls[def.icon] || undefined) : undefined;
  };

  const getName = (id: number): string => {
    if (id < 100) return BLOCKS[id as BlockType]?.name ?? "Unknown";
    return ITEMS[id as ItemType]?.name ?? "Unknown";
  };

  const handleSlotClick = (slot: number) => {
    const current = inventory.slots[slot];
    if (heldItem === null) {
      if (current) {
        setHeldItem({ id: current.id, count: current.count });
        inventory.setSlot(slot, null);
        onInventoryChange();
        refresh();
      }
    } else {
      if (!current) {
        inventory.setSlot(slot, { id: heldItem.id, count: heldItem.count });
        setHeldItem(null);
      } else if (current.id === heldItem.id) {
        const max = current.id < 100 ? 64 : (ITEMS[current.id as ItemType]?.maxStack ?? 64);
        const space = max - current.count;
        const add = Math.min(space, heldItem.count);
        inventory.setSlot(slot, { id: current.id, count: current.count + add });
        const remaining = heldItem.count - add;
        setHeldItem(remaining > 0 ? { id: heldItem.id, count: remaining } : null);
      } else {
        inventory.setSlot(slot, { id: heldItem.id, count: heldItem.count });
        setHeldItem({ id: current.id, count: current.count });
      }
      onInventoryChange();
      refresh();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(20,20,20,0.85)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="max-w-2xl w-full mx-4 p-5"
        style={{
          backgroundColor: "#c6c6c6",
          imageRendering: "pixelated",
          borderTop: "4px solid #ffffff",
          borderLeft: "4px solid #ffffff",
          borderBottom: "4px solid #555555",
          borderRight: "4px solid #555555",
          boxShadow: "inset 0 0 0 2px #555, 0 6px 20px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black text-[#3f3f3f] font-mono" style={{ textShadow: "2px 2px 0 #fff" }}>Chest</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-white text-sm font-mono font-bold"
            style={{
              backgroundColor: "#8a3a3a",
              borderTop: "2px solid #aa5a5a",
              borderLeft: "2px solid #aa5a5a",
              borderBottom: "2px solid #6a1a1a",
              borderRight: "2px solid #6a1a1a",
              imageRendering: "pixelated",
              textShadow: "1px 1px 0 #000",
            }}
          >
            ✕ Close
          </button>
        </div>
        {/* Chest storage (27 slots = slots 9-35 of inventory) */}
        <div className="grid grid-cols-9 gap-1 p-2 mb-3" style={{ backgroundColor: "#8b8b8b", border: "3px solid #555", imageRendering: "pixelated" }}>
          {Array.from({ length: 27 }).map((_, i) => {
            const slot = i + 9; // main inventory slots
            const stack = inventory.slots[slot];
            return (
              <div
                key={i}
                onClick={() => handleSlotClick(slot)}
                className="relative flex items-center justify-center cursor-pointer hover:brightness-110"
                style={{
                  width: "52px",
                  height: "52px",
                  backgroundColor: "#8b8b8b",
                  borderTop: "2px solid #aaaaaa",
                  borderLeft: "2px solid #aaaaaa",
                  borderBottom: "2px solid #555555",
                  borderRight: "2px solid #555555",
                  imageRendering: "pixelated",
                }}
              >
                {stack && (() => {
                  const icon = getIcon(stack.id);
                  return (
                    <>
                      {icon && (
                        <img
                          src={icon}
                          alt={getName(stack.id)}
                          style={{ width: "36px", height: "36px", imageRendering: "pixelated" }}
                          draggable={false}
                        />
                      )}
                      {stack.count > 1 && (
                        <span
                          className="absolute bottom-0 right-1 text-sm font-mono font-bold"
                          style={{ color: "#fff", textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000" }}
                        >
                          {stack.count}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })}
        </div>
        {/* Player hotbar */}
        <div className="grid grid-cols-9 gap-1 p-2" style={{ backgroundColor: "#8b8b8b", border: "3px solid #555", imageRendering: "pixelated" }}>
          {Array.from({ length: 9 }).map((_, i) => {
            const stack = inventory.slots[i];
            return (
              <div
                key={i}
                onClick={() => handleSlotClick(i)}
                className="relative flex items-center justify-center cursor-pointer hover:brightness-110"
                style={{
                  width: "52px",
                  height: "52px",
                  backgroundColor: "#8b8b8b",
                  borderTop: "2px solid #aaaaaa",
                  borderLeft: "2px solid #aaaaaa",
                  borderBottom: "2px solid #555555",
                  borderRight: "2px solid #555555",
                  imageRendering: "pixelated",
                }}
              >
                {stack && (() => {
                  const icon = getIcon(stack.id);
                  return (
                    <>
                      {icon && (
                        <img
                          src={icon}
                          alt={getName(stack.id)}
                          style={{ width: "36px", height: "36px", imageRendering: "pixelated" }}
                          draggable={false}
                        />
                      )}
                      {stack.count > 1 && (
                        <span
                          className="absolute bottom-0 right-1 text-sm font-mono font-bold"
                          style={{ color: "#fff", textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000" }}
                        >
                          {stack.count}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })}
        </div>
        {/* Held item */}
        {heldItem && (
          <div className="mt-2 text-center text-sm font-mono text-[#3f3f3f]">
            Holding: {getName(heldItem.id)} ×{heldItem.count}
          </div>
        )}
      </div>
    </div>
  );
}

// =============== MAIN MENU (Minecraft Java style) ===============
const SPLASH_TEXTS = [
  "Made with love!", "100% pure voxel!", "Dig deeply!", "Watch out for creepers!",
  "Build something epic!", "Explore the infinite!", "Survive!", "Craft until dawn!",
  "Diamonds shine!", "V2.0!", "Welcome to Jeffcraft!", "Build. Survive. Prosper!",
];

function MainMenu({
  iconUrls, onCreateWorld, onMultiplayer, onLoadWorld,
  selectedIndex,
  // Lifted state — allows the parent to drive controller navigation
  showLoadMenu, setShowLoadMenu,
  savedWorlds, refreshSavedWorlds,
  loadMenuSelectedIndex,
}: {
  iconUrls: Record<string, string>;
  onCreateWorld: () => void;
  onMultiplayer: () => void;
  onLoadWorld: (name: string) => void;
  selectedIndex: number;
  showLoadMenu: boolean;
  setShowLoadMenu: (v: boolean) => void;
  savedWorlds: { name: string; savedAt: number; mode: string }[];
  refreshSavedWorlds: () => void;
  loadMenuSelectedIndex: number;
}) {
  const [splashIndex] = useState(() => Math.floor(Math.random() * SPLASH_TEXTS.length));
  const [panOffset, setPanOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setPanOffset((p) => (p + 0.3) % 100), 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden select-none" style={{ backgroundColor: "#0a0a12" }}>
      {/* Panoramic background with slow horizontal pan */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(/IMG_2455.jpeg)`,
        backgroundSize: "cover",
        backgroundPosition: `${panOffset}% center`,
        opacity: 0.95,
        transition: "background-position 0.05s linear",
      }} />
      {/* Subtle vignette for readability (image already has the title) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
        {/* Menu buttons — title removed (image already includes it) */}
        {!showLoadMenu ? (
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <MCMenuButton onClick={onCreateWorld} color="gray" selected={selectedIndex === 0}>Create New World</MCMenuButton>
            <MCMenuButton onClick={() => { refreshSavedWorlds(); setShowLoadMenu(true); }} color="gray" selected={selectedIndex === 1}>Load World</MCMenuButton>
            <MCMenuButton onClick={onMultiplayer} color="gray" selected={selectedIndex === 2}>Multiplayer</MCMenuButton>
            <MCMenuButton onClick={() => {}} color="gray" className="opacity-50 cursor-not-allowed" selected={selectedIndex === 3}>Options</MCMenuButton>
          </div>
        ) : (
          <div className="w-full max-w-sm">
            <h2 className="text-xl font-black text-white font-mono mb-3 text-center" style={{ textShadow: "2px 2px 0 #000" }}>
              Select a world
            </h2>
            <div className="p-2 max-h-72 overflow-y-auto" style={{
              backgroundColor: "rgba(15,15,25,0.92)",
              borderTop: "3px solid rgba(70,70,90,0.7)",
              borderLeft: "3px solid rgba(70,70,90,0.7)",
              borderBottom: "3px solid rgba(8,8,12,0.9)",
              borderRight: "3px solid rgba(8,8,12,0.9)",
              imageRendering: "pixelated",
            }}>
              {savedWorlds.length === 0 ? (
                <p className="text-stone-400 text-center font-mono py-6 text-sm">
                  No saved worlds.<br />Create a world and save it from the pause menu.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {savedWorlds.map((w, i) => {
                    const isFocused = i === loadMenuSelectedIndex;
                    return (
                      <div
                        key={w.name}
                        className="flex gap-2 items-center p-2 transition-all"
                        style={{
                          backgroundColor: isFocused ? "rgba(80,120,200,0.6)" : "rgba(35,35,45,0.7)",
                          borderTop: `2px solid ${isFocused ? "#7aaaff" : "rgba(60,60,70,0.5)"}`,
                          borderLeft: `2px solid ${isFocused ? "#7aaaff" : "rgba(60,60,70,0.5)"}`,
                          borderBottom: `2px solid ${isFocused ? "#3a4a7a" : "rgba(15,15,20,0.7)"}`,
                          borderRight: `2px solid ${isFocused ? "#3a4a7a" : "rgba(15,15,20,0.7)"}`,
                          boxShadow: isFocused ? "0 0 10px rgba(120,170,255,0.6)" : "none",
                          transform: isFocused ? "scale(1.02)" : "scale(1)",
                        }}
                      >
                        <div className="flex-1">
                          <div className="text-white font-mono font-bold text-sm">{isFocused ? "▶ " : ""}{w.name}</div>
                          <div className="text-stone-400 text-xs font-mono">
                            {w.mode === "creative" ? "Creative" : "Survival"} · {new Date(w.savedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.preventDefault(); onLoadWorld(w.name); }}
                          onTouchEnd={(e) => { e.preventDefault(); onLoadWorld(w.name); }}
                          className="px-3 py-1 text-white text-xs font-mono font-bold transition-all hover:scale-105"
                          style={{
                            backgroundColor: "#3a6a2a", borderTop: "2px solid #5a8a3a", borderLeft: "2px solid #5a8a3a",
                            borderBottom: "2px solid #1a3a0a", borderRight: "2px solid #1a3a0a", imageRendering: "pixelated",
                            touchAction: "manipulation", cursor: "pointer", WebkitTapHighlightColor: "transparent",
                          }}
                        >▶ Load</button>
                        <button
                          onClick={(e) => { e.preventDefault(); deleteWorld(w.name); refreshSavedWorlds(); }}
                          onTouchEnd={(e) => { e.preventDefault(); deleteWorld(w.name); refreshSavedWorlds(); }}
                          className="px-2 py-1 text-white text-xs font-mono transition-all hover:scale-105"
                          style={{
                            backgroundColor: "#6a2a2a", borderTop: "2px solid #8a3a3a", borderLeft: "2px solid #8a3a3a",
                            borderBottom: "2px solid #3a1a1a", borderRight: "2px solid #3a1a1a", imageRendering: "pixelated",
                            touchAction: "manipulation", cursor: "pointer", WebkitTapHighlightColor: "transparent",
                          }}
                        >✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mt-3">
              <MCMenuButton onClick={() => setShowLoadMenu(false)} color="gray" className="w-full text-sm">← Back</MCMenuButton>
            </div>
            <p className="text-cyan-300 text-[9px] font-mono text-center mt-2">
              🎮 D-Pad ↑↓ navigates · A loads focused world · B back
            </p>
          </div>
        )}

        {/* Splash text — positioned higher up, at right side of logo */}
        <span
          className="absolute top-[18%] left-[58%] text-yellow-300 font-bold text-base sm:text-2xl font-mono pointer-events-none text-center"
          style={{
            transform: `rotate(-12deg) scale(${1 + Math.sin(Date.now() / 400) * 0.08})`,
            textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 0 12px rgba(255,220,0,0.5)",
            transition: "transform 0.1s",
            letterSpacing: "0.05em",
          }}
        >
          {SPLASH_TEXTS[splashIndex]}
        </span>

        <p className="absolute bottom-2 left-4 text-white/35 text-xs font-mono">Jeffcraft V2 · Not affiliated with Mojang or Microsoft</p>
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

// Minecraft-style menu button — gray background, white text, beveled edges
// Touch-friendly: large tap target, explicit touch handlers, cursor:pointer.
function MCMenuButton({ children, onClick, color = "gray", className = "", selected = false }: {
  children: React.ReactNode; onClick?: () => void; color?: "green" | "red" | "blue" | "gray"; className?: string; selected?: boolean;
}) {
  // All buttons use gray background with white text/detail (color prop is kept for backwards compat but ignored)
  // When `selected` is true (controller navigation focus), use a brighter background + glow + scale
  const bg = selected ? "#8aa8e8" : "#6b6b6b";
  const h = selected ? "#9ab8f8" : "#7b7b7b";
  const a = selected ? "#6a88c8" : "#5b5b5b";
  const t = selected ? "#bcd0ff" : "#9a9a9a"; // top/left highlight (lighter gray)
  const b = selected ? "#3a4a7a" : "#3a3a3a"; // bottom/right shadow (darker gray)
  const glow = selected ? "rgba(180,210,255,0.85)" : "rgba(255,255,255,0.35)";
  const handleTap = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClick?.();
  };
  return (
    <button
      onClick={handleTap}
      onTouchEnd={handleTap}
      className={`relative py-3 px-4 font-bold font-mono tracking-wide text-white transition-all hover:scale-[1.03] hover:-translate-y-px active:scale-95 active:translate-y-0 ${selected ? "scale-[1.04] -translate-y-px" : ""} ${className}`}
      style={{
        backgroundColor: bg,
        borderTop: `3px solid ${t}`,
        borderLeft: `3px solid ${t}`,
        borderBottom: `3px solid ${b}`,
        borderRight: `3px solid ${b}`,
        imageRendering: "pixelated",
        textShadow: "2px 2px 0 #1a1a1a, -1px -1px 0 #1a1a1a",
        boxShadow: selected
          ? `0 4px 16px ${glow}, 0 0 8px rgba(180,210,255,0.5), inset 1px 1px 0 rgba(255,255,255,0.4)`
          : "0 3px 6px rgba(0,0,0,0.5), inset 1px 1px 0 rgba(255,255,255,0.2)",
        touchAction: "manipulation",
        cursor: "pointer",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        WebkitUserSelect: "none",
      }}
      onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.backgroundColor = h; e.currentTarget.style.boxShadow = `0 4px 12px ${glow}, inset 1px 1px 0 rgba(255,255,255,0.3)`; } }}
      onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.backgroundColor = bg; e.currentTarget.style.boxShadow = "0 3px 6px rgba(0,0,0,0.5), inset 1px 1px 0 rgba(255,255,255,0.2)"; } }}
      onMouseDown={(e) => { if (!selected) { e.currentTarget.style.backgroundColor = a; e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.5), inset 1px 1px 3px rgba(0,0,0,0.4)"; } }}
      onMouseUp={(e) => { if (!selected) { e.currentTarget.style.backgroundColor = h; e.currentTarget.style.boxShadow = `0 4px 12px ${glow}, inset 1px 1px 0 rgba(255,255,255,0.3)`; } }}
    >
      {children}
    </button>
  );
}

// Graphics toggle component
function GfxToggle({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex justify-between items-center cursor-pointer" onClick={() => onChange(!value)}>
      <div>
        <span className="text-white font-mono text-xs font-bold">{label}</span>
        <p className="text-stone-500 text-[10px] font-mono">{desc}</p>
      </div>
      <div className="w-10 h-5 rounded-sm relative transition-all" style={{
        backgroundColor: value ? "#4a8a3a" : "#3a3a3a",
        borderTop: "2px solid " + (value ? "#7aaa5a" : "#555"),
        borderLeft: "2px solid " + (value ? "#7aaa5a" : "#555"),
        borderBottom: "2px solid " + (value ? "#2a4a1a" : "#222"),
        borderRight: "2px solid " + (value ? "#2a4a1a" : "#222"),
      }}>
        <div className="absolute top-0.5 w-3.5 h-3.5 transition-all" style={{ left: value ? "18px" : "2px", backgroundColor: "#fff" }} />
      </div>
    </div>
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

// =============== MULTIPLAYER SCREEN (enter join code) ===============
function MultiplayerScreen({
  onCancel,
  onJoin,
  externalStatus,
  externalError,
}: {
  onCancel: () => void;
  onJoin: (code: string) => void;
  externalStatus?: string;
  externalError?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Display external status/error from the parent (live updates during connection)
  const status = externalStatus || "";
  const displayError = externalError || error;

  const handleJoin = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Code must be 6 characters.");
      return;
    }
    setError("");
    setConnecting(true);
    onJoin(trimmed);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden select-none" style={{ backgroundColor: "#0a0a12" }}>
      {/* Background */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(/IMG_2455.jpeg)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: 0.55,
      }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
        <h2 className="text-3xl sm:text-4xl font-black text-white mb-2 text-center" style={{
          fontFamily: "monospace",
          textShadow: "0 0 30px rgba(80,140,255,0.5), 3px 3px 0 #0a0a1a, 5px 5px 0 rgba(0,0,0,0.5)",
          letterSpacing: "0.05em",
        }}>
          Multiplayer
        </h2>
        <p className="text-stone-300 text-sm font-mono mb-6 text-center" style={{ textShadow: "1px 1px 0 #000" }}>
          Enter the 6-character code shared by the host.
        </p>

        <div className="w-full max-w-xs">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter" && !connecting) handleJoin(); }}
            placeholder="ABCDEF"
            maxLength={6}
            disabled={connecting}
            className="w-full text-center text-3xl font-black font-mono text-white tracking-[0.3em] py-3 px-4 mb-4 outline-none"
            style={{
              backgroundColor: "rgba(0,0,0,0.7)",
              borderTop: "3px solid rgba(110,110,120,0.9)",
              borderLeft: "3px solid rgba(110,110,120,0.9)",
              borderBottom: "3px solid rgba(0,0,0,0.95)",
              borderRight: "3px solid rgba(0,0,0,0.95)",
              imageRendering: "pixelated",
              textShadow: "2px 2px 0 #000",
            }}
          />

          {displayError && (
            <p className="text-red-400 text-xs font-mono text-center mb-3" style={{ textShadow: "1px 1px 0 #000" }}>
              ⚠ {displayError}
            </p>
          )}
          {status && !displayError && (
            <p className="text-yellow-300 text-xs font-mono text-center mb-3" style={{ textShadow: "1px 1px 0 #000" }}>
              {status}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <MCMenuButton
              onClick={handleJoin}
              color="gray"
              className={connecting ? "opacity-50 cursor-not-allowed" : ""}
            >
              {connecting ? "Connecting..." : "Connect"}
            </MCMenuButton>
            <MCMenuButton
              onClick={() => { if (!connecting) onCancel(); }}
              color="gray"
              className={connecting ? "opacity-50 cursor-not-allowed" : ""}
            >
              ← Volver
            </MCMenuButton>
          </div>
        </div>

        <p className="absolute bottom-2 left-4 text-white/35 text-xs font-mono">
          P2P via PeerJS · No dedicated server
        </p>
      </div>
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
    while (existing.includes(`New World ${n}`)) n++;
    return `New World ${n}`;
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
    onCreate({ name: name.trim() || "New World", seed, mode });
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
          Create New World
        </h2>

        <div className="w-full max-w-2xl bg-stone-900/80 border-4 border-stone-700 rounded-lg p-6 space-y-6">
          {/* World name */}
          <div>
            <label className="block text-white font-mono text-sm mb-2">World name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="w-full bg-stone-800 border-2 border-stone-600 focus:border-green-400 text-white font-mono px-4 py-2 rounded outline-none transition-colors"
              placeholder="My epic world"
            />
          </div>

          {/* Seed */}
          <div>
            <label className="block text-white font-mono text-sm mb-2">
              World seed <span className="text-stone-500">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={seedStr}
                onChange={(e) => setSeedStr(e.target.value)}
                className="flex-1 bg-stone-800 border-2 border-stone-600 focus:border-green-400 text-white font-mono px-4 py-2 rounded outline-none transition-colors"
                placeholder="Empty = random seed (like Minecraft)"
              />
              <button
                type="button"
                onClick={handleRandomSeed}
                title="Generate random seed"
                className="px-3 py-2 bg-stone-700 hover:bg-stone-600 border-2 border-stone-500 text-white font-mono rounded transition-colors"
              >
                🎲
              </button>
            </div>
            <p className="text-stone-500 text-xs mt-1 font-mono">
              {seedStr.trim() === ""
                ? "A random seed will be generated: each world is unique"
                : "The same seed always generates the same world"}
            </p>
          </div>

          {/* Mode selection */}
          <div>
            <label className="block text-white font-mono text-sm mb-3">Game mode</label>
            <div className="grid grid-cols-2 gap-4">
              <ModeCard
                selected={mode === "creative"}
                onClick={() => setMode("creative")}
                title="Creative"
                icon="🏗️"
                description="Free flight, infinite blocks, no damage"
                color="yellow"
              />
              <ModeCard
                selected={mode === "survival"}
                onClick={() => setMode("survival")}
                title="Survival"
                icon="⚔️"
                description="Survive, hunger, fall damage, drowning"
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
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-8 py-3 bg-green-700 hover:bg-green-600 border-2 border-green-500 text-white font-mono font-bold rounded transition-colors shadow-lg"
          >
            Create World
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
// Heart icon — improved pixel art with outline, fill, and highlight
function Heart({ filled }: { filled: number }) {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      {/* Dark outline (always visible) */}
      <path d="M3,3 L5,3 L5,4 L3,4 Z M5,4 L7,4 L7,5 L5,5 Z M7,5 L9,5 L9,6 L7,6 Z M9,4 L11,4 L11,5 L9,5 Z M11,3 L13,3 L13,4 L11,4 Z M2,4 L3,4 L3,6 L2,6 Z M13,4 L14,4 L14,6 L13,6 Z M2,6 L3,6 L3,7 L2,7 Z M13,6 L14,6 L14,7 L13,7 Z M3,7 L4,7 L4,8 L3,8 Z M12,7 L13,7 L13,8 L12,8 Z M4,8 L5,8 L5,9 L4,9 Z M11,8 L12,8 L12,9 L11,9 Z M5,9 L6,9 L6,10 L5,10 Z M10,9 L11,9 L11,10 L10,10 Z M6,10 L7,10 L7,11 L6,11 Z M9,10 L10,10 L10,11 L9,11 Z M7,11 L8,11 L8,12 L7,12 Z M8,11 L9,11 L9,12 L8,12 Z" fill="#1a0000" />
      {/* Half heart (dark red background) */}
      {filled >= 1 && (
        <path d="M4,4 L5,4 L5,5 L4,5 Z M5,5 L7,5 L7,6 L5,6 Z M7,6 L8,6 L8,7 L7,7 Z M3,5 L4,5 L4,7 L3,7 Z M4,7 L5,7 L5,8 L4,8 Z M5,8 L6,8 L6,9 L5,9 Z M6,9 L7,9 L7,10 L6,10 Z M7,10 L8,10 L8,11 L7,11 Z" fill="#cc0000" />
      )}
      {/* Full heart (bright red + highlight) */}
      {filled >= 2 && (
        <>
          <path d="M8,6 L9,6 L9,7 L8,7 Z M9,5 L11,5 L11,6 L9,6 Z M11,4 L13,4 L13,6 L11,6 Z M12,6 L13,6 L13,7 L12,7 Z M11,7 L12,7 L12,8 L11,8 Z M10,8 L11,8 L11,9 L10,9 Z M9,9 L10,9 L10,10 L9,10 Z M8,10 L9,10 L9,11 L8,11 Z" fill="#ff2222" />
          {/* Highlight pixels */}
          <path d="M4,4 L5,4 L5,5 L4,5 Z" fill="#ff6666" />
          <path d="M3,5 L4,5 L4,6 L3,6 Z" fill="#ff6666" />
        </>
      )}
    </svg>
  );
}

// Drumstick (hunger) icon — improved pixel art
function Drumstick({ filled }: { filled: number }) {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      {/* Dark outline */}
      <path d="M9,2 L12,2 L12,3 L13,3 L13,4 L14,4 L14,6 L13,6 L13,7 L12,7 L12,8 L11,8 L11,9 L10,9 L10,10 L9,10 L9,11 L8,11 L8,12 L7,12 L7,13 L6,13 L6,14 L4,14 L4,13 L3,13 L3,11 L4,11 L4,10 L5,10 L5,9 L6,9 L6,8 L7,8 L7,7 L8,7 L8,6 L9,6 Z" fill="#1a1500" />
      {/* Filled (brown meat) */}
      {filled >= 1 && (
        <path d="M10,3 L12,3 L12,4 L13,4 L13,5 L13,6 L12,6 L12,7 L11,7 L11,8 L10,8 L10,9 L9,9 L9,10 L8,10 L8,11 L7,11 L7,12 L6,12 L6,13 L5,13 L5,12 L4,12 L4,11 L5,11 L5,10 L6,10 L6,9 L7,9 L7,8 L8,8 L8,7 L9,7 L9,6 L10,6 L10,5 L11,5 L11,4 L10,4 Z" fill="#8b5e2a" />
      )}
      {/* Full (lighter brown + bone highlight) */}
      {filled >= 2 && (
        <>
          <path d="M10,4 L11,4 L11,5 L10,5 Z M11,5 L12,5 L12,6 L11,6 Z M9,7 L10,7 L10,8 L9,8 Z M8,9 L9,9 L9,10 L8,10 Z" fill="#b87a3a" />
          <path d="M5,12 L6,12 L6,13 L5,13 Z M4,13 L5,13 L5,14 L4,14 Z" fill="#deb887" />
        </>
      )}
    </svg>
  );
}

// Armor icon — shield shape, gray/silver, shown above hearts
function ArmorIcon({ filled }: { filled: number }) {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      {/* Dark outline */}
      <path d="M4,2 L12,2 L12,4 L13,4 L13,8 L12,8 L12,10 L11,10 L11,12 L10,12 L10,13 L6,13 L6,12 L5,12 L5,10 L4,10 L4,8 L3,8 L3,4 L4,4 Z" fill="#1a1a1a" />
      {/* Filled (silver/gray) */}
      {filled >= 1 && (
        <path d="M5,3 L11,3 L11,5 L12,5 L12,7 L11,7 L11,9 L10,9 L10,11 L9,11 L9,12 L7,12 L7,11 L6,11 L6,9 L5,9 L5,7 L4,7 L4,5 L5,5 Z" fill="#999999" />
      )}
      {/* Full (bright silver + highlight) */}
      {filled >= 2 && (
        <>
          <path d="M6,4 L9,4 L9,5 L6,5 Z M5,5 L6,5 L6,7 L5,7 Z" fill="#cccccc" />
          <path d="M6,4 L7,4 L7,5 L6,5 Z" fill="#eeeeee" />
        </>
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
