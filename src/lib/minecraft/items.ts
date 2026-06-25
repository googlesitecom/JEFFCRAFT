// Item definitions: food, materials, tools
// Block IDs are 0-99, Item IDs are 100+

export enum ItemType {
  // Food
  Apple = 100,
  RawPorkchop = 101,
  CookedPorkchop = 102,
  RawBeef = 103,
  CookedBeef = 104,
  RawChicken = 105,
  CookedChicken = 106,
  // Materials
  Stick = 200,
  Coal = 201,
  Charcoal = 202,
  IronIngot = 203,
  GoldIngot = 204,
  Diamond = 205,
  // Tools - Pickaxes
  WoodPickaxe = 300,
  StonePickaxe = 301,
  IronPickaxe = 302,
  DiamondPickaxe = 303,
  GoldPickaxe = 304,
  // Tools - Axes
  WoodAxe = 310,
  StoneAxe = 311,
  IronAxe = 312,
  DiamondAxe = 313,
  GoldAxe = 314,
  // Tools - Swords
  WoodSword = 320,
  StoneSword = 321,
  IronSword = 322,
  DiamondSword = 323,
  GoldSword = 324,
  // Tools - Shovels
  WoodShovel = 330,
  StoneShovel = 331,
  IronShovel = 332,
  DiamondShovel = 333,
  GoldShovel = 334,
  // Materials - Armor
  Leather = 206,
  // Armor - Helmet
  LeatherHelmet = 340,
  IronHelmet = 341,
  DiamondHelmet = 342,
  // Armor - Chestplate
  LeatherChestplate = 350,
  IronChestplate = 351,
  DiamondChestplate = 352,
  // Armor - Leggings
  LeatherLeggings = 360,
  IronLeggings = 361,
  DiamondLeggings = 362,
  // Armor - Boots
  LeatherBoots = 370,
  IronBoots = 371,
  DiamondBoots = 372,
  // Special
  DragonEgg = 400,
  // Nether / End items
  EnderEye = 410,
  FlintAndSteel = 411,
  BlazeRod = 412,
  EnderPearl = 413,
  // Combat & utility items
  Bow = 420,
  Arrow = 421,
  Bucket = 422,
  WaterBucket = 423,
  Gun = 424,
  // Agriculture
  Wheat = 430,
  Seeds = 431,
  Sugar = 432,
  // Misc materials
  Flint = 440,
  Feather = 441,
  String = 442,
  Clay = 443,
  Brick = 444,
  IronBlock = 450,
  GoldBlock = 451,
  DiamondBlock = 452,
}

export type ToolTier = "wood" | "stone" | "iron" | "diamond" | "gold";
export type ToolType = "pickaxe" | "axe" | "sword" | "shovel";
export type ArmorType = "helmet" | "chestplate" | "leggings" | "boots";
export type ArmorTier = "leather" | "iron" | "diamond";

// ====================================================================
// MINING SYSTEM (per user spec)
// ====================================================================
// Each tool has a Tier (0..3) and a Damage-per-second (DPS) used to break blocks.
// Mining time = BlockHardness / ToolDPS.
//
//   Tier 0 (Wood / Hand):  DPS=10,  Durability=60,  can mine stone + coal
//   Tier 1 (Stone):        DPS=20,  Durability=130, can mine + iron
//   Tier 2 (Iron):         DPS=40,  Durability=250, can mine + diamond
//   Tier 3 (Diamond):      DPS=80,  Durability=1500, can mine everything
//
// Gold tools share Tier 0 stats but with very low durability (32).
// If the tool's tier is BELOW the block's required tier, DPS drops to 1 and the block
// does NOT drop its item when broken (it still breaks, just slowly with no reward).
// ====================================================================

export const TOOL_MINING_LEVELS: Record<ToolTier, number> = {
  wood: 0,
  stone: 1,
  iron: 2,
  diamond: 3,
  gold: 0,
};

export const TOOL_DPS: Record<ToolTier, number> = {
  wood: 10,
  stone: 20,
  iron: 40,
  diamond: 80,
  gold: 10, // gold mines as fast as wood
};

export const TOOL_DURABILITY: Record<ToolTier, number> = {
  wood: 200,
  stone: 500,
  iron: 1000,
  diamond: 8000,
  gold: 100,
};

// The DPS applied when the tool tier is insufficient for the block (still breaks, slowly).
export const INSUFFICIENT_TIER_DPS = 1;

// Armor durability per tier (Minecraft values, simplified)
export const ARMOR_DURABILITY: Record<ArmorTier, number> = {
  leather: 80,
  iron: 240,
  diamond: 528,
};

// Combat damage per sword tier
export const SWORD_DAMAGE: Record<ToolTier, number> = {
  wood: 4,
  stone: 5,
  iron: 6,
  diamond: 7,
  gold: 4,
};

// Axe combat damage per tier (axes deal more damage than swords in MC, but we keep swords primary)
export const AXE_DAMAGE: Record<ToolTier, number> = {
  wood: 3,
  stone: 4,
  iron: 5,
  diamond: 6,
  gold: 3,
};

export interface ItemDef {
  id: ItemType;
  name: string;
  icon: string;
  food?: number;
  maxStack: number;
  toolType?: ToolType;
  toolTier?: ToolTier;
  miningLevel?: number; // 0-3, derived from toolTier
  dps?: number;         // mining damage per second
  maxDurability?: number; // tools + armor
  armorType?: ArmorType;
  armorTier?: ArmorTier;
  defense?: number;
  attackDamage?: number; // combat damage (swords, axes)
}

export const ITEMS: Record<ItemType, ItemDef> = {
  // Food
  [ItemType.Apple]: { id: ItemType.Apple, name: "Apple", icon: "apple", food: 4, maxStack: 64 },
  [ItemType.RawPorkchop]: { id: ItemType.RawPorkchop, name: "Raw Porkchop", icon: "raw_porkchop", food: 3, maxStack: 64 },
  [ItemType.CookedPorkchop]: { id: ItemType.CookedPorkchop, name: "Cooked Porkchop", icon: "cooked_porkchop", food: 8, maxStack: 64 },
  [ItemType.RawBeef]: { id: ItemType.RawBeef, name: "Raw Beef", icon: "raw_beef", food: 3, maxStack: 64 },
  [ItemType.CookedBeef]: { id: ItemType.CookedBeef, name: "Steak", icon: "cooked_beef", food: 8, maxStack: 64 },
  [ItemType.RawChicken]: { id: ItemType.RawChicken, name: "Raw Chicken", icon: "raw_chicken", food: 2, maxStack: 64 },
  [ItemType.CookedChicken]: { id: ItemType.CookedChicken, name: "Cooked Chicken", icon: "cooked_chicken", food: 6, maxStack: 64 },
  // Materials
  [ItemType.Stick]: { id: ItemType.Stick, name: "Stick", icon: "stick", maxStack: 64 },
  [ItemType.Coal]: { id: ItemType.Coal, name: "Coal", icon: "coal", maxStack: 64 },
  [ItemType.Charcoal]: { id: ItemType.Charcoal, name: "Charcoal", icon: "charcoal", maxStack: 64 },
  [ItemType.IronIngot]: { id: ItemType.IronIngot, name: "Iron Ingot", icon: "iron_ingot", maxStack: 64 },
  [ItemType.GoldIngot]: { id: ItemType.GoldIngot, name: "Gold Ingot", icon: "gold_ingot", maxStack: 64 },
  [ItemType.Diamond]: { id: ItemType.Diamond, name: "Diamond", icon: "diamond", maxStack: 64 },
  // Pickaxes - Tier 0 (wood/gold): DPS 10, can mine stone/coal
  [ItemType.WoodPickaxe]: { id: ItemType.WoodPickaxe, name: "Wooden Pickaxe", icon: "wood_pickaxe", maxStack: 1, toolType: "pickaxe", toolTier: "wood", miningLevel: 0, dps: 10, maxDurability: 60, attackDamage: 2 },
  [ItemType.GoldPickaxe]: { id: ItemType.GoldPickaxe, name: "Golden Pickaxe", icon: "gold_pickaxe", maxStack: 1, toolType: "pickaxe", toolTier: "gold", miningLevel: 0, dps: 10, maxDurability: 32, attackDamage: 2 },
  // Pickaxes - Tier 1 (stone): DPS 20, can mine + iron
  [ItemType.StonePickaxe]: { id: ItemType.StonePickaxe, name: "Stone Pickaxe", icon: "stone_pickaxe", maxStack: 1, toolType: "pickaxe", toolTier: "stone", miningLevel: 1, dps: 20, maxDurability: 130, attackDamage: 3 },
  // Pickaxes - Tier 2 (iron): DPS 40, can mine + diamond
  [ItemType.IronPickaxe]: { id: ItemType.IronPickaxe, name: "Iron Pickaxe", icon: "iron_pickaxe", maxStack: 1, toolType: "pickaxe", toolTier: "iron", miningLevel: 2, dps: 40, maxDurability: 250, attackDamage: 4 },
  // Pickaxes - Tier 3 (diamond): DPS 80, can mine everything
  [ItemType.DiamondPickaxe]: { id: ItemType.DiamondPickaxe, name: "Diamond Pickaxe", icon: "diamond_pickaxe", maxStack: 1, toolType: "pickaxe", toolTier: "diamond", miningLevel: 3, dps: 80, maxDurability: 1500, attackDamage: 5 },
  // Axes (same tier system as pickaxes; good for wood)
  [ItemType.WoodAxe]: { id: ItemType.WoodAxe, name: "Wooden Axe", icon: "wood_axe", maxStack: 1, toolType: "axe", toolTier: "wood", miningLevel: 0, dps: 10, maxDurability: 60, attackDamage: 3 },
  [ItemType.GoldAxe]: { id: ItemType.GoldAxe, name: "Golden Axe", icon: "gold_axe", maxStack: 1, toolType: "axe", toolTier: "gold", miningLevel: 0, dps: 10, maxDurability: 32, attackDamage: 3 },
  [ItemType.StoneAxe]: { id: ItemType.StoneAxe, name: "Stone Axe", icon: "stone_axe", maxStack: 1, toolType: "axe", toolTier: "stone", miningLevel: 1, dps: 20, maxDurability: 130, attackDamage: 4 },
  [ItemType.IronAxe]: { id: ItemType.IronAxe, name: "Iron Axe", icon: "iron_axe", maxStack: 1, toolType: "axe", toolTier: "iron", miningLevel: 2, dps: 40, maxDurability: 250, attackDamage: 5 },
  [ItemType.DiamondAxe]: { id: ItemType.DiamondAxe, name: "Diamond Axe", icon: "diamond_axe", maxStack: 1, toolType: "axe", toolTier: "diamond", miningLevel: 3, dps: 80, maxDurability: 1500, attackDamage: 6 },
  // Swords (combat-focused, but also a tool that loses durability)
  [ItemType.WoodSword]: { id: ItemType.WoodSword, name: "Wooden Sword", icon: "wood_sword", maxStack: 1, toolType: "sword", toolTier: "wood", miningLevel: 0, dps: 10, maxDurability: 60, attackDamage: 4 },
  [ItemType.GoldSword]: { id: ItemType.GoldSword, name: "Golden Sword", icon: "gold_sword", maxStack: 1, toolType: "sword", toolTier: "gold", miningLevel: 0, dps: 10, maxDurability: 32, attackDamage: 4 },
  [ItemType.StoneSword]: { id: ItemType.StoneSword, name: "Stone Sword", icon: "stone_sword", maxStack: 1, toolType: "sword", toolTier: "stone", miningLevel: 1, dps: 20, maxDurability: 130, attackDamage: 5 },
  [ItemType.IronSword]: { id: ItemType.IronSword, name: "Iron Sword", icon: "iron_sword", maxStack: 1, toolType: "sword", toolTier: "iron", miningLevel: 2, dps: 40, maxDurability: 250, attackDamage: 6 },
  [ItemType.DiamondSword]: { id: ItemType.DiamondSword, name: "Diamond Sword", icon: "diamond_sword", maxStack: 1, toolType: "sword", toolTier: "diamond", miningLevel: 3, dps: 80, maxDurability: 1500, attackDamage: 7 },
  // Shovels (good for dirt/sand/gravel)
  [ItemType.WoodShovel]: { id: ItemType.WoodShovel, name: "Wooden Shovel", icon: "wood_shovel", maxStack: 1, toolType: "shovel", toolTier: "wood", miningLevel: 0, dps: 10, maxDurability: 60, attackDamage: 1 },
  [ItemType.GoldShovel]: { id: ItemType.GoldShovel, name: "Golden Shovel", icon: "gold_shovel", maxStack: 1, toolType: "shovel", toolTier: "gold", miningLevel: 0, dps: 10, maxDurability: 32, attackDamage: 1 },
  [ItemType.StoneShovel]: { id: ItemType.StoneShovel, name: "Stone Shovel", icon: "stone_shovel", maxStack: 1, toolType: "shovel", toolTier: "stone", miningLevel: 1, dps: 20, maxDurability: 130, attackDamage: 2 },
  [ItemType.IronShovel]: { id: ItemType.IronShovel, name: "Iron Shovel", icon: "iron_shovel", maxStack: 1, toolType: "shovel", toolTier: "iron", miningLevel: 2, dps: 40, maxDurability: 250, attackDamage: 3 },
  [ItemType.DiamondShovel]: { id: ItemType.DiamondShovel, name: "Diamond Shovel", icon: "diamond_shovel", maxStack: 1, toolType: "shovel", toolTier: "diamond", miningLevel: 3, dps: 80, maxDurability: 1500, attackDamage: 4 },
  // Leather
  [ItemType.Leather]: { id: ItemType.Leather, name: "Leather", icon: "leather", maxStack: 64 },
  // Armor - Helmets (maxDurability = ARMOR_DURABILITY * 0.11 rounded, simplified to flat values)
  [ItemType.LeatherHelmet]: { id: ItemType.LeatherHelmet, name: "Leather Cap", icon: "leather_helmet", maxStack: 1, armorType: "helmet", armorTier: "leather", defense: 1, maxDurability: 55 },
  [ItemType.IronHelmet]: { id: ItemType.IronHelmet, name: "Iron Helmet", icon: "iron_helmet", maxStack: 1, armorType: "helmet", armorTier: "iron", defense: 2, maxDurability: 165 },
  [ItemType.DiamondHelmet]: { id: ItemType.DiamondHelmet, name: "Diamond Helmet", icon: "diamond_helmet", maxStack: 1, armorType: "helmet", armorTier: "diamond", defense: 3, maxDurability: 363 },
  // Armor - Chestplates
  [ItemType.LeatherChestplate]: { id: ItemType.LeatherChestplate, name: "Leather Tunic", icon: "leather_chestplate", maxStack: 1, armorType: "chestplate", armorTier: "leather", defense: 3, maxDurability: 80 },
  [ItemType.IronChestplate]: { id: ItemType.IronChestplate, name: "Iron Chestplate", icon: "iron_chestplate", maxStack: 1, armorType: "chestplate", armorTier: "iron", defense: 6, maxDurability: 240 },
  [ItemType.DiamondChestplate]: { id: ItemType.DiamondChestplate, name: "Diamond Chestplate", icon: "diamond_chestplate", maxStack: 1, armorType: "chestplate", armorTier: "diamond", defense: 8, maxDurability: 528 },
  // Armor - Leggings
  [ItemType.LeatherLeggings]: { id: ItemType.LeatherLeggings, name: "Leather Pants", icon: "leather_leggings", maxStack: 1, armorType: "leggings", armorTier: "leather", defense: 2, maxDurability: 75 },
  [ItemType.IronLeggings]: { id: ItemType.IronLeggings, name: "Iron Leggings", icon: "iron_leggings", maxStack: 1, armorType: "leggings", armorTier: "iron", defense: 5, maxDurability: 225 },
  [ItemType.DiamondLeggings]: { id: ItemType.DiamondLeggings, name: "Diamond Leggings", icon: "diamond_leggings", maxStack: 1, armorType: "leggings", armorTier: "diamond", defense: 6, maxDurability: 495 },
  // Armor - Boots
  [ItemType.LeatherBoots]: { id: ItemType.LeatherBoots, name: "Leather Boots", icon: "leather_boots", maxStack: 1, armorType: "boots", armorTier: "leather", defense: 1, maxDurability: 65 },
  [ItemType.IronBoots]: { id: ItemType.IronBoots, name: "Iron Boots", icon: "iron_boots", maxStack: 1, armorType: "boots", armorTier: "iron", defense: 2, maxDurability: 195 },
  [ItemType.DiamondBoots]: { id: ItemType.DiamondBoots, name: "Diamond Boots", icon: "diamond_boots", maxStack: 1, armorType: "boots", armorTier: "diamond", defense: 3, maxDurability: 429 },
  // Special
  [ItemType.DragonEgg]: { id: ItemType.DragonEgg, name: "Dragon Egg", icon: "dragon_egg", maxStack: 1 },
  // Nether / End items
  [ItemType.EnderEye]: { id: ItemType.EnderEye, name: "Ender Eye", icon: "ender_eye", maxStack: 64 },
  [ItemType.FlintAndSteel]: { id: ItemType.FlintAndSteel, name: "Flint and Steel", icon: "flint_and_steel", maxStack: 1, maxDurability: 65 },
  [ItemType.BlazeRod]: { id: ItemType.BlazeRod, name: "Blaze Rod", icon: "blaze_rod", maxStack: 64 },
  [ItemType.EnderPearl]: { id: ItemType.EnderPearl, name: "Ender Pearl", icon: "ender_pearl", maxStack: 64 },
  // Combat & utility
  [ItemType.Bow]: { id: ItemType.Bow, name: "Bow", icon: "bow", maxStack: 1, maxDurability: 384 },
  [ItemType.Arrow]: { id: ItemType.Arrow, name: "Arrow", icon: "arrow", maxStack: 64 },
  [ItemType.Bucket]: { id: ItemType.Bucket, name: "Bucket", icon: "bucket", maxStack: 16 },
  [ItemType.WaterBucket]: { id: ItemType.WaterBucket, name: "Water Bucket", icon: "water_bucket", maxStack: 1 },
  [ItemType.Gun]: { id: ItemType.Gun, name: "Pistol", icon: "gun", maxStack: 1, maxDurability: 200, attackDamage: 8 },
  // Agriculture
  [ItemType.Wheat]: { id: ItemType.Wheat, name: "Wheat", icon: "wheat", maxStack: 64 },
  [ItemType.Seeds]: { id: ItemType.Seeds, name: "Seeds", icon: "seeds", maxStack: 64 },
  [ItemType.Sugar]: { id: ItemType.Sugar, name: "Sugar", icon: "sugar", maxStack: 64 },
  // Misc materials
  [ItemType.Flint]: { id: ItemType.Flint, name: "Flint", icon: "flint", maxStack: 64 },
  [ItemType.Feather]: { id: ItemType.Feather, name: "Feather", icon: "feather", maxStack: 64 },
  [ItemType.String]: { id: ItemType.String, name: "String", icon: "string", maxStack: 64 },
  [ItemType.Clay]: { id: ItemType.Clay, name: "Clay", icon: "clay", maxStack: 64 },
  [ItemType.Brick]: { id: ItemType.Brick, name: "Brick", icon: "brick", maxStack: 64 },
  [ItemType.IronBlock]: { id: ItemType.IronBlock, name: "Iron Block", icon: "iron_block", maxStack: 64 },
  [ItemType.GoldBlock]: { id: ItemType.GoldBlock, name: "Gold Block", icon: "gold_block", maxStack: 64 },
  [ItemType.DiamondBlock]: { id: ItemType.DiamondBlock, name: "Diamond Block", icon: "diamond_block", maxStack: 64 },
};

// Check if an ID is an item (not a block)
export function isItem(id: number): boolean {
  return id >= 100;
}

// Get item definition
export function getItemDef(id: ItemType): ItemDef | undefined {
  return ITEMS[id];
}

// Get display name for any id (block or item)
export function getDisplayName(id: number, blockNames: Record<number, string>): string {
  if (id < 100) return blockNames[id] ?? "Unknown";
  return ITEMS[id as ItemType]?.name ?? "Unknown";
}

// Get max stack size for any id
export function getMaxStack(id: number): number {
  if (id < 100) return 64; // blocks
  return ITEMS[id as ItemType]?.maxStack ?? 64;
}

// Get icon texture name for any id
export function getIconName(id: number, blockIcons: Record<number, { top: string; side: string }>): string {
  if (id < 100) {
    const icons = blockIcons[id];
    if (!icons) return "";
    // For grass, use grass_side; for others, use side or top
    if (id === 1) return icons.side; // grass
    return icons.side || icons.top;
  }
  return ITEMS[id as ItemType]?.icon ?? "";
}

// Get ALL item ids for creative inventory (all valid blocks + all items)
export function getAllItemIds(): number[] {
  const ids: number[] = [];
  // Add all items (skip undefined)
  for (const id of Object.values(ItemType)) {
    if (typeof id === "number") ids.push(id);
  }
  return ids;
}

