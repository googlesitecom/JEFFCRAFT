// Block type definitions for the Minecraft clone
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
  CoalOre = 13,
  IronOre = 14,
  GoldOre = 15,
  DiamondOre = 16,
  Snow = 17,
  Pumpkin = 18,
  Gravel = 19,
  CraftingTable = 20,
  Bookshelf = 21,
}

export type RenderLayer = "opaque" | "cutout" | "translucent";

export interface BlockDef {
  id: BlockType;
  name: string;
  textures: { top: string; bottom: string; side: string };
  // Render layer: opaque (no alpha), cutout (alpha 0 or 1, alphaTest), translucent (alpha blended)
  layer: RenderLayer;
  solid: boolean; // for collisions
}

export const BLOCKS: Record<BlockType, BlockDef> = {
  [BlockType.Air]: {
    id: BlockType.Air, name: "Air",
    textures: { top: "", bottom: "", side: "" },
    layer: "opaque", solid: false,
  },
  [BlockType.Grass]: {
    id: BlockType.Grass, name: "Grass Block",
    textures: { top: "grass_top", bottom: "dirt", side: "grass_side" },
    layer: "opaque", solid: true,
  },
  [BlockType.Dirt]: {
    id: BlockType.Dirt, name: "Dirt",
    textures: { top: "dirt", bottom: "dirt", side: "dirt" },
    layer: "opaque", solid: true,
  },
  [BlockType.Stone]: {
    id: BlockType.Stone, name: "Stone",
    textures: { top: "stone", bottom: "stone", side: "stone" },
    layer: "opaque", solid: true,
  },
  [BlockType.Cobblestone]: {
    id: BlockType.Cobblestone, name: "Cobblestone",
    textures: { top: "cobblestone", bottom: "cobblestone", side: "cobblestone" },
    layer: "opaque", solid: true,
  },
  [BlockType.Wood]: {
    id: BlockType.Wood, name: "Wood Log",
    textures: { top: "wood_top", bottom: "wood_top", side: "wood_side" },
    layer: "opaque", solid: true,
  },
  [BlockType.Leaves]: {
    id: BlockType.Leaves, name: "Leaves",
    textures: { top: "leaves", bottom: "leaves", side: "leaves" },
    layer: "cutout", solid: true,
  },
  [BlockType.Sand]: {
    id: BlockType.Sand, name: "Sand",
    textures: { top: "sand", bottom: "sand", side: "sand" },
    layer: "opaque", solid: true,
  },
  [BlockType.Water]: {
    id: BlockType.Water, name: "Water",
    textures: { top: "water", bottom: "water", side: "water" },
    layer: "translucent", solid: false,
  },
  [BlockType.Bedrock]: {
    id: BlockType.Bedrock, name: "Bedrock",
    textures: { top: "bedrock", bottom: "bedrock", side: "bedrock" },
    layer: "opaque", solid: true,
  },
  [BlockType.Planks]: {
    id: BlockType.Planks, name: "Planks",
    textures: { top: "planks", bottom: "planks", side: "planks" },
    layer: "opaque", solid: true,
  },
  [BlockType.Glass]: {
    id: BlockType.Glass, name: "Glass",
    textures: { top: "glass", bottom: "glass", side: "glass" },
    layer: "cutout", solid: true,
  },
  [BlockType.Brick]: {
    id: BlockType.Brick, name: "Bricks",
    textures: { top: "brick", bottom: "brick", side: "brick" },
    layer: "opaque", solid: true,
  },
  [BlockType.CoalOre]: {
    id: BlockType.CoalOre, name: "Coal Ore",
    textures: { top: "coal_ore", bottom: "coal_ore", side: "coal_ore" },
    layer: "opaque", solid: true,
  },
  [BlockType.IronOre]: {
    id: BlockType.IronOre, name: "Iron Ore",
    textures: { top: "iron_ore", bottom: "iron_ore", side: "iron_ore" },
    layer: "opaque", solid: true,
  },
  [BlockType.GoldOre]: {
    id: BlockType.GoldOre, name: "Gold Ore",
    textures: { top: "gold_ore", bottom: "gold_ore", side: "gold_ore" },
    layer: "opaque", solid: true,
  },
  [BlockType.DiamondOre]: {
    id: BlockType.DiamondOre, name: "Diamond Ore",
    textures: { top: "diamond_ore", bottom: "diamond_ore", side: "diamond_ore" },
    layer: "opaque", solid: true,
  },
  [BlockType.Snow]: {
    id: BlockType.Snow, name: "Snow",
    textures: { top: "snow", bottom: "snow", side: "snow" },
    layer: "opaque", solid: true,
  },
  [BlockType.Pumpkin]: {
    id: BlockType.Pumpkin, name: "Pumpkin",
    textures: { top: "pumpkin_top", bottom: "pumpkin_top", side: "pumpkin_side" },
    layer: "opaque", solid: true,
  },
  [BlockType.Gravel]: {
    id: BlockType.Gravel, name: "Gravel",
    textures: { top: "gravel", bottom: "gravel", side: "gravel" },
    layer: "opaque", solid: true,
  },
  [BlockType.CraftingTable]: {
    id: BlockType.CraftingTable, name: "Crafting Table",
    textures: { top: "crafting_table_top", bottom: "planks", side: "crafting_table_side" },
    layer: "opaque", solid: true,
  },
  [BlockType.Bookshelf]: {
    id: BlockType.Bookshelf, name: "Bookshelf",
    textures: { top: "planks", bottom: "planks", side: "bookshelf" },
    layer: "opaque", solid: true,
  },
};

// Helper functions
export function isAir(id: BlockType): boolean {
  return id === BlockType.Air;
}

export function isSolid(id: BlockType): boolean {
  return BLOCKS[id]?.solid ?? false;
}

export function getRenderLayer(id: BlockType): RenderLayer {
  return BLOCKS[id]?.layer ?? "opaque";
}

// Whether a block occludes neighbor faces (anything except air & water)
export function isOpaque(id: BlockType): boolean {
  if (id === BlockType.Air) return false;
  return BLOCKS[id]?.layer === "opaque";
}

export function isCutout(id: BlockType): boolean {
  return BLOCKS[id]?.layer === "cutout";
}

export function isTranslucent(id: BlockType): boolean {
  return BLOCKS[id]?.layer === "translucent";
}

// Whether this block allows seeing through (used for face culling)
// Air, water, glass, leaves all see-through
export function isSeeThrough(id: BlockType): boolean {
  if (id === BlockType.Air) return true;
  const def = BLOCKS[id];
  return def ? def.layer !== "opaque" : false;
}

// Default hotbar slots (used for creative)
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
