---
Task ID: jeffcraft-v2-xp-ores
Agent: main (Super Z)
Task: Fix ore generation (ores not appearing), add XP system with orbs+bar, ensure new worlds are randomly seeded

Work Log:
- Identified the critical bug in `world.ts`: `decorateChunk` was calling `placeVein(BlockType.Coal, ...)` etc., but the actual enum values are `CoalOre`, `IronOre`, `GoldOre`, `DiamondOre`. The undefined values became 0 (Air) in the Uint8Array, so every "ore vein" was actually carving out air pockets — no ores ever appeared in the world.
- Fixed by changing all 4 placeVein calls to use the correct enum names (`BlockType.CoalOre`, `BlockType.IronOre`, `BlockType.GoldOre`, `BlockType.DiamondOre`). Ore textures (`coal_ore`, `iron_ore`, `gold_ore`, `diamond_ore`) were already defined in `blocks.ts` and `atlas.ts`, so they will now render with their proper textures automatically.
- Created new `src/lib/minecraft/xp.ts` module implementing Minecraft's XP level curve (Java Edition formula): `xpForNextLevel(level)` and `XpState` class with `addXp()`, `progressFraction`, `serialize()`, `deserialize()`, and `reset()`.
- Extended `src/lib/minecraft/drops.ts`:
  - Added `isXp` field to `DroppedItem` interface
  - Added `spawnXpOrb(amount, x, y, z)` method that creates a small green sphere (MeshBasicMaterial, three sizes/colors based on amount)
  - XP orbs magnetize toward the player when within 6 blocks (like Minecraft), with stronger pull when closer
  - Updated `update()` to return `{id, count, isXp}[]` so the caller can distinguish XP orbs from item drops
  - Shared geometry/material for all XP orbs (disposed once in `dispose()`)
- Updated `src/lib/minecraft/sound.ts` with `orbPickup()` (high ding) and `levelUp()` (ascending C-E-G chime) sounds
- Updated `src/components/minecraft/MinecraftGame.tsx`:
  - Added XP drop tables: coal_ore (0-2), diamond_ore (3-7), gold_ore (0-1), monsters (5), animals (1-3)
  - Wired XP orb spawns into both creative `breakBlock()` and survival `mineBlockContinuous()`
  - Wired XP orb spawns into animal/monster kill logic
  - Pickup logic now branches: regular items go to inventory, XP orbs add to `xpStateRef` and play orb/levelUp sounds
  - Added `xpLevel` and `xpProgress` to `GameStats` and the periodic stats update
  - Added XP state ref (`xpStateRef`) and `pendingXpLoadRef` for save/load support
  - On respawn, XP is preserved (saved before screen change, restored after)
  - On new world, XP is reset to 0
  - HUD: added XP bar (green) BETWEEN hotbar and hearts/hunger. Moved hearts/hunger up from `bottom-[76px]` to `bottom-[100px]`. XP bar at `bottom-[78px]`. Air bubbles moved up to `bottom-[124px]`.
  - HUD: XP level number shown as a green floating number on top of the XP bar
  - Updated CreateWorldScreen: default world name is unique ("Nuevo Mundo N"), random seed button (🎲) added, bigger random seed range (full 32-bit), hint text changes based on whether seed field is empty
  - HUD now displays the world's seed value
- Updated `src/lib/minecraft/save.ts` to include `xp: {level, progress}` in `SavedWorld` interface and `saveWorld()` signature
- Fixed pre-existing TypeScript error at `tierDmg[itemDef.toolTier]` (toolTier can be undefined) by adding `itemDef.toolTier &&` guard
- Verified `npx tsc --noEmit` passes cleanly on all our project files (only unrelated examples/skills have errors)
- Verified dev server returns HTTP 200 on the root URL with the MinecraftGame component chunk loaded

Stage Summary:
- Ores now actually generate in the world (coal/iron/gold/diamond) with their correct textures — the bug was an enum typo causing all "ore" placements to become Air
- XP system fully implemented: orbs drop from coal/diamond/gold ores and from killing mobs/animals; they fly toward the player and add to XP on pickup; level number + green XP bar render above the hotbar with hearts/hunger above the XP bar
- New world creation now uses a random 32-bit seed by default (like Minecraft); each "Crear nuevo mundo" produces a unique world; a 🎲 button is provided to roll a specific random seed
- XP state is saved/loaded with the world; preserved across respawns; reset when leaving to menu without saving
- Files modified: `world.ts`, `xp.ts` (new), `drops.ts`, `sound.ts`, `save.ts`, `MinecraftGame.tsx`
