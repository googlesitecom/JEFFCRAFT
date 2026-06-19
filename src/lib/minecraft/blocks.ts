// Block type definitions for the Minecraft clone

export enum BlockType {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  Wood = 5, // log
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
    name: "Grass",
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
    name: "Brick",
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
};

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
