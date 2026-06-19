// World save/load system using localStorage
import { World, CHUNK_SIZE } from "./world";
import { BlockType } from "./blocks";
import { Inventory } from "./inventory";

export interface SavedWorld {
  name: string;
  seed: number;
  mode: "creative" | "survival";
  // Player state
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    hunger: number;
  };
  // Inventory
  inventory: { id: number; count: number }[];
  // Modified blocks (only store diffs from generated world)
  modifiedBlocks: { x: number; y: number; z: number; type: number }[];
  // Day time
  dayTime: number;
  // Timestamp
  savedAt: number;
}

const SAVE_PREFIX = "minicraft_world_";

export function saveWorld(world: World, name: string, seed: number, mode: "creative" | "survival", player: { position: { x: number; y: number; z: number }; yaw: number; pitch: number; health: number; hunger: number }, inventory: Inventory, dayTime: number): boolean {
  try {
    // Collect ONLY player-modified blocks (much smaller than comparing all blocks)
    const modifiedBlocks: { x: number; y: number; z: number; type: number }[] = [];
    for (const [key, type] of world.playerModifications) {
      const [x, y, z] = key.split(",").map(Number);
      modifiedBlocks.push({ x, y, z, type });
    }

    const saved: SavedWorld = {
      name,
      seed,
      mode,
      player: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        yaw: player.yaw,
        pitch: player.pitch,
        health: player.health,
        hunger: player.hunger,
      },
      inventory: inventory.serialize(),
      modifiedBlocks,
      dayTime,
      savedAt: Date.now(),
    };

    localStorage.setItem(SAVE_PREFIX + name, JSON.stringify(saved));
    return true;
  } catch (e) {
    console.error("Failed to save world:", e);
    return false;
  }
}

export function loadWorld(name: string): SavedWorld | null {
  try {
    const data = localStorage.getItem(SAVE_PREFIX + name);
    if (!data) return null;
    return JSON.parse(data) as SavedWorld;
  } catch (e) {
    console.error("Failed to load world:", e);
    return null;
  }
}

export function applySavedWorld(world: World, saved: SavedWorld) {
  // Reconstruct the world with the same seed
  // The World constructor already generates based on seed
  // Now apply modified blocks
  for (const mb of saved.modifiedBlocks) {
    world.setBlock(mb.x, mb.y, mb.z, mb.type as BlockType);
  }
}

export function listSavedWorlds(): { name: string; savedAt: number; mode: string }[] {
  const worlds: { name: string; savedAt: number; mode: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SAVE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key)!) as SavedWorld;
        worlds.push({ name: data.name, savedAt: data.savedAt, mode: data.mode });
      } catch {}
    }
  }
  return worlds.sort((a, b) => b.savedAt - a.savedAt);
}

export function deleteWorld(name: string) {
  localStorage.removeItem(SAVE_PREFIX + name);
}
