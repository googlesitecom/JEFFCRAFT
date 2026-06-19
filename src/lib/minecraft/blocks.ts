// Block and item type definitions for the Minecraft clone
export enum BlockType {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  Wood = 5,
  Leaves = 6,
  Sand = 7,
  Water = 8,
  Bedrock = 9,
  Planks = 10,
  Glass = 11,
  Brick = 12,
  Coal = 13,
  Iron = 14,
  Gold = 15,
  Diamond = 16,
  Snow = 17,
  Pumpkin = 18,
  Gravel = 19,
  CraftingTable = 20,
  Bookshelf = 21,
}

export interface BlockDef {
  id: BlockType;
  name: string;
  textures: {
    top: string;
    bottom: string;
    side: string;
  };
  transparent?: boolean;
  solid: boolean;
}

export const BLOCKS: Record<BlockType, BlockDef> = {
  [BlockType.Air]: {
    id: BlockType.Air,
    name: "Air",
    textures: { top: "", bottom: "", side: "" },
    transparent: true,
    solid: false,
  },
  [BlockType.Grass]: {
    id: BlockType.Grass,
    name: "Grass Block",
    textures: { top: "grass_top", bottom: "dirt", side: "grass_side" },
    solid: true,
  },
  [BlockType.Dirt]: {
    id: BlockType.Dirt,
    name: "Dirt",
    textures: { top: "dirt", bottom: "dirt", side: "dirt" },
    solid: true,
  },
  [BlockType.Stone]: {
    id: BlockType.Stone,
    name: "Stone",
    textures: { top: "stone", bottom: "stone", side: "stone" },
    solid: true,
  },
  [BlockType.Cobblestone]: {
    id: BlockType.Cobblestone,
    name: "Cobblestone",
    textures: { top: "cobblestone", bottom: "cobblestone", side: "cobblestone" },
    solid: true,
  },
  [BlockType.Wood]: {
    id: BlockType.Wood,
    name: "Wood Log",
    textures: { top: "wood_top", bottom: "wood_top", side: "wood_side" },
    solid: true,
  },
  [BlockType.Leaves]: {
    id: BlockType.Leaves,
    name: "Leaves",
    textures: { top: "leaves", bottom: "leaves", side: "leaves" },
    transparent: true,
    solid: true,
  },
  [BlockType.Sand]: {
    id: BlockType.Sand,
    name: "Sand",
    textures: { top: "sand", bottom: "sand", side: "sand" },
    solid: true,
  },
  [BlockType.Water]: {
    id: BlockType.Water,
    name: "Water",
    textures: { top: "water", bottom: "water", side: "water" },
    transparent: true,
    solid: false,
  },
  [BlockType.Bedrock]: {
    id: BlockType.Bedrock,
    name: "Bedrock",
    textures: { top: "bedrock", bottom: "bedrock", side: "bedrock" },
    solid: true,
  },
  [BlockType.Planks]: {
    id: BlockType.Planks,
    name: "Planks",
    textures: { top: "planks", bottom: "planks", side: "planks" },
    solid: true,
  },
  [BlockType.Glass]: {
    id: BlockType.Glass,
    name: "Glass",
    textures: { top: "glass", bottom: "glass", side: "glass" },
    transparent: true,
    solid: true,
  },
  [BlockType.Brick]: {
    id: BlockType.Brick,
    name: "Bricks",
    textures: { top: "brick", bottom: "brick", side: "brick" },
    solid: true,
  },
  [BlockType.Coal]: {
    id: BlockType.Coal,
    name: "Coal Ore",
    textures: { top: "coal_ore", bottom: "coal_ore", side: "coal_ore" },
    solid: true,
  },
  [BlockType.Iron]: {
    id: BlockType.Iron,
    name: "Iron Ore",
    textures: { top: "iron_ore", bottom: "iron_ore", side: "iron_ore" },
    solid: true,
  },
  [BlockType.Gold]: {
    id: BlockType.Gold,
    name: "Gold Ore",
    textures: { top: "gold_ore", bottom: "gold_ore", side: "gold_ore" },
    solid: true,
  },
  [BlockType.Diamond]: {
    id: BlockType.Diamond,
    name: "Diamond Ore",
    textures: { top: "diamond_ore", bottom: "diamond_ore", side: "diamond_ore" },
    solid: true,
  },
  [BlockType.Snow]: {
    id: BlockType.Snow,
    name: "Snow",
    textures: { top: "snow", bottom: "snow", side: "snow" },
    solid: true,
  },
  [BlockType.Pumpkin]: {
    id: BlockType.Pumpkin,
    name: "Pumpkin",
    textures: { top: "pumpkin_top", bottom: "pumpkin_top", side: "pumpkin_side" },
    solid: true,
  },
  [BlockType.Gravel]: {
    id: BlockType.Gravel,
    name: "Gravel",
    textures: { top: "gravel", bottom: "gravel", side: "gravel" },
    solid: true,
  },
  [BlockType.CraftingTable]: {
    id: BlockType.CraftingTable,
    name: "Crafting Table",
    textures: { top: "crafting_table_top", bottom: "planks", side: "crafting_table_side" },
    solid: true,
  },
  [BlockType.Bookshelf]: {
    id: BlockType.Bookshelf,
    name: "Bookshelf",
    textures: { top: "planks", bottom: "planks", side: "bookshelf" },
    solid: true,
  },
};

// === Items (non-block items like food, tools) ===
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
  IronIngot = 202,
  GoldIngot = 203,
  Diamond = 204,
  // Tools
  WoodPickaxe = 300,
  WoodAxe = 301,
  WoodSword = 302,
  StonePickaxe = 303,
  StoneAxe = 304,
  StoneSword = 305,
  IronPickaxe = 306,
  IronAxe = 307,
  IronSword = 308,
  DiamondPickaxe = 309,
  DiamondAxe = 310,
  DiamondSword = 311,
}

export interface ItemDef {
  id: ItemType;
  name: string;
  icon: string; // texture name for icon
  // For food items
  food?: number; // hunger restored
  saturation?: number; // extra saturation
  // Stack size
  maxStack: number;
  // Placeable block (if any)
  placeBlock?: BlockType;
}

export const ITEMS: Record<ItemType, ItemDef> = {
  // Food
  [ItemType.Apple]: { id: ItemType.Apple, name: "Apple", icon: "apple", food: 4, saturation: 2.4, maxStack: 64 },
  [ItemType.RawPorkchop]: { id: ItemType.RawPorkchop, name: "Raw Porkchop", icon: "raw_porkchop", food: 3, saturation: 0.6, maxStack: 64 },
  [ItemType.CookedPorkchop]: { id: ItemType.CookedPorkchop, name: "Cooked Porkchop", icon: "cooked_porkchop", food: 8, saturation: 12.8, maxStack: 64 },
  [ItemType.RawBeef]: { id: ItemType.RawBeef, name: "Raw Beef", icon: "raw_beef", food: 3, saturation: 1.8, maxStack: 64 },
  [ItemType.CookedBeef]: { id: ItemType.CookedBeef, name: "Steak", icon: "cooked_beef", food: 8, saturation: 12.8, maxStack: 64 },
  [ItemType.RawChicken]: { id: ItemType.RawChicken, name: "Raw Chicken", icon: "raw_chicken", food: 2, saturation: 0.3, maxStack: 64 },
  [ItemType.CookedChicken]: { id: ItemType.CookedChicken, name: "Cooked Chicken", icon: "cooked_chicken", food: 6, saturation: 7.5, maxStack: 64 },

  // Materials
  [ItemType.Stick]: { id: ItemType.Stick, name: "Stick", icon: "stick", maxStack: 64 },
  [ItemType.Coal]: { id: ItemType.Coal, name: "Coal", icon: "coal", maxStack: 64 },
  [ItemType.IronIngot]: { id: ItemType.IronIngot, name: "Iron Ingot", icon: "iron_ingot", maxStack: 64 },
  [ItemType.GoldIngot]: { id: ItemType.GoldIngot, name: "Gold Ingot", icon: "gold_ingot", maxStack: 64 },
  [ItemType.Diamond]: { id: ItemType.Diamond, name: "Diamond", icon: "diamond", maxStack: 64 },

  // Tools (no food value)
  [ItemType.WoodPickaxe]: { id: ItemType.WoodPickaxe, name: "Wooden Pickaxe", icon: "wood_pickaxe", maxStack: 1 },
  [ItemType.WoodAxe]: { id: ItemType.WoodAxe, name: "Wooden Axe", icon: "wood_axe", maxStack: 1 },
  [ItemType.WoodSword]: { id: ItemType.WoodSword, name: "Wooden Sword", icon: "wood_sword", maxStack: 1 },
  [ItemType.StonePickaxe]: { id: ItemType.StonePickaxe, name: "Stone Pickaxe", icon: "stone_pickaxe", maxStack: 1 },
  [ItemType.StoneAxe]: { id: ItemType.StoneAxe, name: "Stone Axe", icon: "stone_axe", maxStack: 1 },
  [ItemType.StoneSword]: { id: ItemType.StoneSword, name: "Stone Sword", icon: "stone_sword", maxStack: 1 },
  [ItemType.IronPickaxe]: { id: ItemType.IronPickaxe, name: "Iron Pickaxe", icon: "iron_pickaxe", maxStack: 1 },
  [ItemType.IronAxe]: { id: ItemType.IronAxe, name: "Iron Axe", icon: "iron_axe", maxStack: 1 },
  [ItemType.IronSword]: { id: ItemType.IronSword, name: "Iron Sword", icon: "iron_sword", maxStack: 1 },
  [ItemType.DiamondPickaxe]: { id: ItemType.DiamondPickaxe, name: "Diamond Pickaxe", icon: "diamond_pickaxe", maxStack: 1 },
  [ItemType.DiamondAxe]: { id: ItemType.DiamondAxe, name: "Diamond Axe", icon: "diamond_axe", maxStack: 1 },
  [ItemType.DiamondSword]: { id: ItemType.DiamondSword, name: "Diamond Sword", icon: "diamond_sword", maxStack: 1 },
};

// Items that can be placed as blocks
export const ITEM_PLACE: Partial<Record<ItemType, BlockType>> = {};

// Hotbar default for creative mode (mix of blocks + items)
export const HOTBAR_BLOCKS: BlockType[] = [
  BlockType.Grass,
  BlockType.Dirt,
  BlockType.Stone,
  BlockType.Cobblestone,
  BlockType.Planks,
  BlockType.Wood,
  BlockType.Leaves,
  BlockType.Sand,
  BlockType.Glass,
];

export function isSolid(id: BlockType): boolean {
  return BLOCKS[id]?.solid ?? false;
}

export function isTransparent(id: BlockType): boolean {
  return BLOCKS[id]?.transparent ?? false;
}

export function isAir(id: BlockType): boolean {
  return id === BlockType.Air;
}

// Helper to check if an id is an item (not a block)
export function isItem(id: number): boolean {
  return id >= 100;
}

// Get display name for any id (block or item)
export function getDisplayName(id: number): string {
  if (id < 100) return BLOCKS[id as BlockType]?.name ?? "Unknown";
  return ITEMS[id as ItemType]?.name ?? "Unknown";
}
