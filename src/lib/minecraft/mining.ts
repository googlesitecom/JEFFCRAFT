// Mining system: block hardness (HP) + required tool tier.
// Formula: MiningTime = BlockHardness / ToolDPS  (when tier is sufficient)
//          MiningTime = BlockHardness / 1         (when tier is insufficient, no drop)
import { BlockType } from "./blocks";
import { ItemType, ITEMS, ToolTier, TOOL_MINING_LEVELS, TOOL_DPS, INSUFFICIENT_TIER_DPS } from "./items";

// Block hardness in HP. Higher = takes longer to break.
// Values calibrated to the user spec:
//   - Dirt/grass/sand (soft, hand-breakable): 5 HP
//   - Wood/log/planks (need axe for speed, but hand works): 15 HP
//   - Stone/cobblestone (need pickaxe): 20 HP
//   - Coal ore: 20 HP, requires tier 0
//   - Iron ore: 40 HP, requires tier 1
//   - Gold ore: 80 HP, requires tier 2
//   - Diamond ore: 160 HP, requires tier 2
//   - Bedrock: Infinity (unbreakable)
export const BLOCK_HARDNESS: Partial<Record<BlockType, number>> = {
  [BlockType.Grass]: 5,
  [BlockType.Dirt]: 5,
  [BlockType.Sand]: 5,
  [BlockType.Gravel]: 6,
  [BlockType.Snow]: 4,
  [BlockType.Planks]: 15,
  [BlockType.Wood]: 15,
  [BlockType.Leaves]: 3,
  [BlockType.Glass]: 4,
  [BlockType.Brick]: 30,
  [BlockType.Stone]: 20,
  [BlockType.Cobblestone]: 20,
  [BlockType.CoalOre]: 20,
  [BlockType.IronOre]: 40,
  [BlockType.GoldOre]: 80,
  [BlockType.DiamondOre]: 160,
  [BlockType.Bedrock]: Infinity,
  [BlockType.CraftingTable]: 15,
  [BlockType.Bookshelf]: 15,
  [BlockType.Furnace]: 20,
  [BlockType.Pumpkin]: 10,
  [BlockType.Torch]: 1,
  [BlockType.Chest]: 10,
  [BlockType.Obsidian]: 400, // very hard, requires diamond pickaxe
  [BlockType.Netherrack]: 8,
  [BlockType.SoulSand]: 6,
  [BlockType.Glowstone]: 8,
  [BlockType.NetherPortal]: 10,
  [BlockType.EndStone]: 30,
  [BlockType.StoneBricks]: 30,
  [BlockType.Slab]: 20,
  [BlockType.Stairs]: 20,
  [BlockType.Fence]: 15,
  [BlockType.WoodenDoor]: 15,
  [BlockType.Ladder]: 3,
  [BlockType.Sign]: 3,
  [BlockType.Anvil]: 50,
};

// Required mining tier for each block (0 = any tool including hand).
// If the player's tool tier is below this, DPS drops to 1 and the block does NOT drop items.
//   Tier 0 = wood/hand → stone, cobblestone, coal, brick, furnace
//   Tier 1 = stone → + iron ore
//   Tier 2 = iron → + gold ore, diamond ore
// (Bedrock is unbreakable, so it's not in this table.)
export const BLOCK_REQUIRED_TIER: Partial<Record<BlockType, number>> = {
  [BlockType.Stone]: 0,
  [BlockType.Cobblestone]: 0,
  [BlockType.CoalOre]: 0,
  [BlockType.Brick]: 0,
  [BlockType.Furnace]: 0,
  [BlockType.IronOre]: 1,
  [BlockType.GoldOre]: 2,
  [BlockType.DiamondOre]: 2,
  [BlockType.Obsidian]: 3, // requires diamond pickaxe
  [BlockType.Netherrack]: 0,
  [BlockType.Glowstone]: 0,
  [BlockType.EndStone]: 0,
};

// Which tool type is appropriate for each block (for the "tool speed bonus").
// If the right tool type is used, the tool's DPS applies. Otherwise the hand DPS (10) is used.
export const BLOCK_PREFERRED_TOOL: Partial<Record<BlockType, "pickaxe" | "axe" | "shovel">> = {
  // Pickaxe blocks (stone, ores, brick)
  [BlockType.Stone]: "pickaxe",
  [BlockType.Cobblestone]: "pickaxe",
  [BlockType.CoalOre]: "pickaxe",
  [BlockType.IronOre]: "pickaxe",
  [BlockType.GoldOre]: "pickaxe",
  [BlockType.DiamondOre]: "pickaxe",
  [BlockType.Brick]: "pickaxe",
  [BlockType.Furnace]: "pickaxe",
  // Axe blocks (wood)
  [BlockType.Wood]: "axe",
  [BlockType.Planks]: "axe",
  [BlockType.CraftingTable]: "axe",
  [BlockType.Bookshelf]: "axe",
  // Shovel blocks (soft)
  [BlockType.Grass]: "shovel",
  [BlockType.Dirt]: "shovel",
  [BlockType.Sand]: "shovel",
  [BlockType.Gravel]: "shovel",
  [BlockType.Snow]: "shovel",
};

// Hand DPS (when no tool or wrong tool is used)
export const HAND_DPS = 10;

// Result of evaluating mining for a block with a given held item.
export interface MiningResult {
  dps: number;            // effective DPS applied to the block
  tierSufficient: boolean; // if false, the block will break but won't drop items
  dropItem: boolean;      // whether the block should drop its item when broken
}

// Compute the mining DPS for a given block + held item id (-1 = empty hand)
export function computeMining(blockType: BlockType, heldItemId: number | null): MiningResult {
  const hardness = BLOCK_HARDNESS[blockType] ?? 10;
  if (hardness === Infinity) {
    return { dps: 0, tierSufficient: false, dropItem: false };
  }
  const requiredTier = BLOCK_REQUIRED_TIER[blockType] ?? 0;

  // If holding a tool, get its tier and DPS
  let toolTier = -1; // -1 = no tool
  let toolDPS = HAND_DPS;
  let toolType: string | undefined;
  if (heldItemId !== null && heldItemId >= 100) {
    const itemDef = ITEMS[heldItemId as ItemType];
    if (itemDef?.toolTier !== undefined) {
      toolTier = TOOL_MINING_LEVELS[itemDef.toolTier];
      toolDPS = TOOL_DPS[itemDef.toolTier];
      toolType = itemDef.toolType;
    }
  }

  // Check if the tool type matches the block's preferred tool.
  // If wrong tool type is used on a "preferred" block, treat as hand.
  const preferredTool = BLOCK_PREFERRED_TOOL[blockType];
  let effectiveDPS = toolDPS;
  if (preferredTool && toolType !== preferredTool) {
    // Wrong tool - use hand DPS
    effectiveDPS = HAND_DPS;
  }

  // Check tier sufficiency.
  // If a tool is being used but its tier < required, OR
  // no tool is used on a block that REQUIRES a pickaxe (any tier > 0 needed)
  const tierSufficient = (() => {
    if (toolTier === -1) {
      // Hand: sufficient only if block requires tier 0 (or has no requirement)
      return requiredTier <= 0;
    }
    return toolTier >= requiredTier;
  })();

  // Special rule: stone/ores/etc require at least SOME pickaxe to drop items,
  // even if the block's required tier is 0 (e.g., stone with bare hand → no drop).
  const requiresPickaxeForDrop = preferredTool === "pickaxe";
  const usingPickaxe = toolType === "pickaxe";

  if (!tierSufficient) {
    // Tier too low - DPS drops to 1, no drop
    return { dps: INSUFFICIENT_TIER_DPS, tierSufficient: false, dropItem: false };
  }

  // Tier is sufficient; check drop rules
  if (requiresPickaxeForDrop && !usingPickaxe) {
    // Block requires pickaxe to drop items but player is using hand/wrong tool
    // The block still breaks at hand DPS, but doesn't drop
    return { dps: effectiveDPS, tierSufficient: true, dropItem: false };
  }

  return { dps: effectiveDPS, tierSufficient: true, dropItem: true };
}
