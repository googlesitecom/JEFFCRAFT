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

---
Task ID: jeffcraft-v2-dragon
Agent: main (Super Z)
Task: Add dragon pet (mountable, flyable, third-person), award dragon egg at XP level 10, fix floating torches

Work Log:
- Downloaded Dragon.glb (340KB, glTF v2) from the repo root at https://github.com/googlesitecom/JEFFCRAFT/raw/main/Dragon.glb into /public/Dragon.glb. Model is "Devil dragon - Minecraft" by geni_o_o on Sketchfab (CC-BY-4.0). Has one animation named "fly" with 25 channels (body, wings, tail, legs).
- Fixed floating torch: in mesher.ts the torch mesh started at y+0.2 (floating 0.2 above the surface). Changed to y+0.01 so the torch base sits exactly on top of the block below. Also reduced width 0.15→0.13 and height 0.5→0.45 for a more proportional Minecraft-style torch.
- Added DragonEgg item (ItemType.DragonEgg = 400) to items.ts with maxStack 1
- Added "dragon_egg" texture name to atlas.ts TEXTURE_NAMES list (79 textures total, fits in 8x12=96 slots)
- Created procedural dragon_egg icon texture in item-textures.ts: dark purple/black oval egg with magenta spots (like Minecraft's dragon egg block)
- Created new src/lib/minecraft/dragon.ts module:
  - DragonPet class loads /Dragon.glb via GLTFLoader, plays the "fly" animation via AnimationMixer
  - Position/velocity/yaw/pitch state; third-person camera computed from yaw+pitch (behind + above dragon, 7 blocks back, 2.5 up)
  - When mounted: WASD moves dragon in camera direction (relative to yaw), Space/Ctrl up/down, smooth velocity interpolation, banking/pitch visual tilt for satisfying flight feel, subtle wing bob
  - When not mounted: dragon flies toward player to follow them, hovers near player when close
  - DragonManager holds the single player dragon; spawn(x,y,z) creates new pet; getActiveDragon() returns first dragon; update() returns camera info when mounted
- Integrated dragon into MinecraftGame.tsx:
  - Imported DragonManager + DragonPet
  - Added refs: dragonEggAwardedRef (one-time reward gate), dragonNotification state, prevXpLevelRef, dragonManagerRef (for HUD access), setHudTick (force re-render for HUD indicator)
  - In game effect: create DragonManager, link to ref; reset dragonEggAwarded on new world
  - placeBlock() now has special case: if player is holding DragonEgg and right-clicks, spawn a dragon at the targeted block + 2 above, consume the egg, play level-up sound, show notification. Refuses to spawn if a dragon already exists.
  - KeyM handler replaced: now toggles mount/dismount on the active dragon. Dismount drops player next to dragon. Mount requires dragon within 6 blocks. Notifications for each state.
  - In animate loop: detect isDragonMounted; when mounted, skip player.update() (player position syncs to dragon, only mouse-look applied to player.yaw/pitch); call dragonManager.update() which returns camera info; apply camera override (third-person behind+above dragon)
  - XP pickup logic: when addXp causes level gain AND current level >= 10 AND not yet awarded, give player a DragonEgg (or drop it on the ground if inventory full), set dragonNotification, play craftSuccess sound
  - HUD: added dragon notification banner (top center, purple); added dragon mount indicator (top right showing mount state and M key hint)
  - Cleanup: dispose dragonManager, clear dragonManagerRef
  - Pause menu help text updated: M is now "Montar/desmontar dragón"
- TypeScript: clean (no errors in any of our project files)
- Dev server: compiles cleanly, page returns HTTP 200

Stage Summary:
- Torch no longer floats: mesh base moved from y+0.2 to y+0.01
- Dragon pet fully implemented: rideable, flyable, third-person camera; mount/dismount with M; Dragon.glb model with fly animation from the GitHub repo; banking/pitch tilt for satisfying flight; follows player when not mounted
- Dragon Egg reward: granted once when XP first reaches level 10; appears in inventory (or drops on ground if full); player places it to spawn their dragon
- All systems typecheck and the dev server compiles without errors
- Files modified: mesher.ts, items.ts, atlas.ts, item-textures.ts, MinecraftGame.tsx
- Files added: dragon.ts, public/Dragon.glb
