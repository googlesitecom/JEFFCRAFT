// Crafting recipes - Minecraft-style
// Recipes are 3x3 grids (for crafting table) or 2x2 (for inventory crafting)
import { ItemType } from "./items";
import { BlockType } from "./blocks";

// A recipe ingredient: either a specific id or a tag (e.g. "planks" matches any plank type)
export type Ingredient = number | "any_planks" | "any_log" | null;

// Shaped recipe: 3x3 grid (rows top to bottom). null = empty slot.
export interface ShapedRecipe {
  type: "shaped";
  pattern: Ingredient[][]; // 3 rows of 3
  result: { id: number; count: number };
  // Whether this recipe requires a crafting table (3x3). If false, can be done in 2x2.
  requiresTable: boolean;
}

// Shapeless recipe: list of ingredients (order doesn't matter)
export interface ShapelessRecipe {
  type: "shapeless";
  ingredients: Ingredient[];
  result: { id: number; count: number };
  requiresTable: boolean;
}

export type Recipe = ShapedRecipe | ShapelessRecipe;

// Helper to make a 3x3 pattern with shorter notation
function pat(rows: string[], mapping: Record<string, Ingredient>): Ingredient[][] {
  const result: Ingredient[][] = [];
  for (const row of rows) {
    const r: Ingredient[] = [];
    for (const ch of row) {
      if (ch === " " || ch === ".") r.push(null);
      else r.push(mapping[ch] ?? null);
    }
    while (r.length < 3) r.push(null);
    result.push(r);
  }
  while (result.length < 3) result.push([null, null, null]);
  return result;
}

// === ALL RECIPES ===
export const RECIPES: Recipe[] = [
  // === BASIC ===
  // Planks from logs (1 log = 4 planks) - shapeless
  {
    type: "shapeless",
    ingredients: ["any_log"],
    result: { id: BlockType.Planks, count: 4 },
    requiresTable: false,
  },
  // Stick from 2 planks (vertical)
  {
    type: "shaped",
    pattern: pat(["P..", "P..", "..."], { P: "any_planks" }),
    result: { id: ItemType.Stick, count: 4 },
    requiresTable: false,
  },
  // Crafting Table from 4 planks (2x2)
  {
    type: "shaped",
    pattern: pat(["PP.", "PP.", "..."], { P: "any_planks" }),
    result: { id: BlockType.CraftingTable, count: 1 },
    requiresTable: false,
  },
  // Bookshelf from 6 planks + 3 books (we don't have books, skip for now)

  // === TOOLS - WOOD ===
  // Wooden Pickaxe: 3 planks top, 2 sticks middle column
  {
    type: "shaped",
    pattern: pat(["PPP", ".S.", ".S."], { P: "any_planks", S: ItemType.Stick }),
    result: { id: ItemType.WoodPickaxe, count: 1 },
    requiresTable: true,
  },
  // Wooden Axe
  {
    type: "shaped",
    pattern: pat(["PP.", "PS.", ".S."], { P: "any_planks", S: ItemType.Stick }),
    result: { id: ItemType.WoodAxe, count: 1 },
    requiresTable: true,
  },
  // Wooden Sword
  {
    type: "shaped",
    pattern: pat(["P..", "P..", "S.."], { P: "any_planks", S: ItemType.Stick }),
    result: { id: ItemType.WoodSword, count: 1 },
    requiresTable: true,
  },
  // Wooden Shovel
  {
    type: "shaped",
    pattern: pat(["P..", "S..", "S.."], { P: "any_planks", S: ItemType.Stick }),
    result: { id: ItemType.WoodShovel, count: 1 },
    requiresTable: true,
  },

  // === TOOLS - STONE ===
  {
    type: "shaped",
    pattern: pat(["CCC", ".S.", ".S."], { C: BlockType.Cobblestone, S: ItemType.Stick }),
    result: { id: ItemType.StonePickaxe, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["CC.", "CS.", ".S."], { C: BlockType.Cobblestone, S: ItemType.Stick }),
    result: { id: ItemType.StoneAxe, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["C..", "C..", "S.."], { C: BlockType.Cobblestone, S: ItemType.Stick }),
    result: { id: ItemType.StoneSword, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["C..", "S..", "S.."], { C: BlockType.Cobblestone, S: ItemType.Stick }),
    result: { id: ItemType.StoneShovel, count: 1 },
    requiresTable: true,
  },

  // === TOOLS - IRON ===
  {
    type: "shaped",
    pattern: pat(["III", ".S.", ".S."], { I: ItemType.IronIngot, S: ItemType.Stick }),
    result: { id: ItemType.IronPickaxe, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["II.", "IS.", ".S."], { I: ItemType.IronIngot, S: ItemType.Stick }),
    result: { id: ItemType.IronAxe, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["I..", "I..", "S.."], { I: ItemType.IronIngot, S: ItemType.Stick }),
    result: { id: ItemType.IronSword, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["I..", "S..", "S.."], { I: ItemType.IronIngot, S: ItemType.Stick }),
    result: { id: ItemType.IronShovel, count: 1 },
    requiresTable: true,
  },

  // === TOOLS - DIAMOND ===
  {
    type: "shaped",
    pattern: pat(["DDD", ".S.", ".S."], { D: ItemType.Diamond, S: ItemType.Stick }),
    result: { id: ItemType.DiamondPickaxe, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["DD.", "DS.", ".S."], { D: ItemType.Diamond, S: ItemType.Stick }),
    result: { id: ItemType.DiamondAxe, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["D..", "D..", "S.."], { D: ItemType.Diamond, S: ItemType.Stick }),
    result: { id: ItemType.DiamondSword, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["D..", "S..", "S.."], { D: ItemType.Diamond, S: ItemType.Stick }),
    result: { id: ItemType.DiamondShovel, count: 1 },
    requiresTable: true,
  },

  // === TOOLS - GOLD ===
  {
    type: "shaped",
    pattern: pat(["GGG", ".S.", ".S."], { G: ItemType.GoldIngot, S: ItemType.Stick }),
    result: { id: ItemType.GoldPickaxe, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["GG.", "GS.", ".S."], { G: ItemType.GoldIngot, S: ItemType.Stick }),
    result: { id: ItemType.GoldAxe, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["G..", "G..", "S.."], { G: ItemType.GoldIngot, S: ItemType.Stick }),
    result: { id: ItemType.GoldSword, count: 1 },
    requiresTable: true,
  },
  {
    type: "shaped",
    pattern: pat(["G..", "S..", "S.."], { G: ItemType.GoldIngot, S: ItemType.Stick }),
    result: { id: ItemType.GoldShovel, count: 1 },
    requiresTable: true,
  },

  // === BUILDING BLOCKS ===
  // Crafting Table from 4 planks (2x2)
  {
    type: "shaped",
    pattern: pat(["PP.", "PP.", "..."], { P: "any_planks" }),
    result: { id: BlockType.CraftingTable, count: 1 },
    requiresTable: false,
  },
  // Furnace from 8 cobblestone (ring shape)
  {
    type: "shaped",
    pattern: pat(["CCC", "C.C", "CCC"], { C: BlockType.Cobblestone }),
    result: { id: BlockType.Furnace, count: 1 },
    requiresTable: true,
  },
  // Torch from coal + stick (vertical: coal on top, stick below)
  {
    type: "shaped",
    pattern: pat(["C..", "S..", "..."], { C: ItemType.Coal, S: ItemType.Stick }),
    result: { id: BlockType.Torch, count: 4 },
    requiresTable: false,
  },
  // Bookshelf from 6 planks + 3 books (we use planks pattern to simulate)
  {
    type: "shaped",
    pattern: pat(["PPP", "BBB", "PPP"], { P: "any_planks", B: BlockType.Planks }),
    result: { id: BlockType.Bookshelf, count: 1 },
    requiresTable: true,
  },
  // 4 Cobblestone -> 4 Stone bricks (simplified)
  // Snow block from 4 snow
  {
    type: "shaped",
    pattern: pat(["SS.", "SS.", "..."], { S: BlockType.Snow }),
    result: { id: BlockType.Snow, count: 1 },
    requiresTable: false,
  },
  // Sand -> Sandstone (simplified, 4 sand = 1 sandstone but we'll give sand back)
  // Glass from sand (needs furnace, but we allow crafting for simplicity)
  // 4 gold ingots -> 1 gold block (not implemented yet)
  // Ladder from 7 sticks
  {
    type: "shaped",
    pattern: pat(["S.S", "S.S", "S.S"], { S: ItemType.Stick }),
    result: { id: ItemType.Stick, count: 1 }, // simplified: returns a stick (placeholder)
    requiresTable: true,
  },

  // === ARMOR RECIPES ===
  // Copper armor (made from copper ingots dropped by cows)
  {
    type: "shaped", pattern: pat(["CCC", "C.C", "..."], { C: ItemType.CopperIngot }),
    result: { id: ItemType.CopperHelmet, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["C.C", "CCC", "CCC"], { C: ItemType.CopperIngot }),
    result: { id: ItemType.CopperChestplate, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["CCC", "C.C", "C.C"], { C: ItemType.CopperIngot }),
    result: { id: ItemType.CopperLeggings, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["...", "C.C", "C.C"], { C: ItemType.CopperIngot }),
    result: { id: ItemType.CopperBoots, count: 1 }, requiresTable: true,
  },
  // Iron armor
  {
    type: "shaped", pattern: pat(["III", "I.I", "..."], { I: ItemType.IronIngot }),
    result: { id: ItemType.IronHelmet, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["I.I", "III", "III"], { I: ItemType.IronIngot }),
    result: { id: ItemType.IronChestplate, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["III", "I.I", "I.I"], { I: ItemType.IronIngot }),
    result: { id: ItemType.IronLeggings, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["...", "I.I", "I.I"], { I: ItemType.IronIngot }),
    result: { id: ItemType.IronBoots, count: 1 }, requiresTable: true,
  },
  // Diamond armor
  {
    type: "shaped", pattern: pat(["DDD", "D.D", "..."], { D: ItemType.Diamond }),
    result: { id: ItemType.DiamondHelmet, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["D.D", "DDD", "DDD"], { D: ItemType.Diamond }),
    result: { id: ItemType.DiamondChestplate, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["DDD", "D.D", "D.D"], { D: ItemType.Diamond }),
    result: { id: ItemType.DiamondLeggings, count: 1 }, requiresTable: true,
  },
  {
    type: "shaped", pattern: pat(["...", "D.D", "D.D"], { D: ItemType.Diamond }),
    result: { id: ItemType.DiamondBoots, count: 1 }, requiresTable: true,
  },
];

// Check if an ingredient matches an item id
export function ingredientMatches(ing: Ingredient, id: number): boolean {
  if (ing === null) return false;
  if (ing === "any_planks") return id === BlockType.Planks;
  if (ing === "any_log") return id === BlockType.Wood;
  return ing === id;
}

// Try to match a 3x3 grid against all shaped recipes.
// `grid` is a 3x3 array of item ids (or -1 for empty).
// `requiresTable`: if false, only match recipes that don't require a table.
export function matchRecipe(
  grid: (number | null)[][],
  allowTableRecipes: boolean
): { id: number; count: number } | null {
  // Try shaped recipes
  for (const recipe of RECIPES) {
    if (recipe.type !== "shaped") continue;
    if (recipe.requiresTable && !allowTableRecipes) continue;
    if (matchShaped(recipe.pattern, grid)) {
      return recipe.result;
    }
  }
  // Try shapeless recipes
  const flatGrid: number[] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const id = grid[y]?.[x];
      if (id !== null && id !== undefined && id >= 0) flatGrid.push(id);
    }
  }
  for (const recipe of RECIPES) {
    if (recipe.type !== "shapeless") continue;
    if (recipe.requiresTable && !allowTableRecipes) continue;
    if (matchShapeless(recipe.ingredients, flatGrid)) {
      return recipe.result;
    }
  }
  return null;
}

// Match a 3x3 shaped pattern against the grid.
// The pattern can be offset within the grid (e.g. a 2x2 pattern in the corner).
function matchShaped(pattern: Ingredient[][], grid: (number | null)[][]): boolean {
  // Find the bounding box of the pattern
  let pMinX = 3, pMaxX = -1, pMinY = 3, pMaxY = -1;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (pattern[y][x] !== null) {
        pMinX = Math.min(pMinX, x);
        pMaxX = Math.max(pMaxX, x);
        pMinY = Math.min(pMinY, y);
        pMaxY = Math.max(pMaxY, y);
      }
    }
  }
  // Empty pattern
  if (pMaxX < 0) {
    // Pattern is empty - match only if grid is also empty
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (grid[y]?.[x] !== null && grid[y]?.[x] !== undefined) return false;
      }
    }
    return true;
  }

  // Find the bounding box of the grid
  let gMinX = 3, gMaxX = -1, gMinY = 3, gMaxY = -1;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const id = grid[y]?.[x];
      if (id !== null && id !== undefined && id >= 0) {
        gMinX = Math.min(gMinX, x);
        gMaxX = Math.max(gMaxX, x);
        gMinY = Math.min(gMinY, y);
        gMaxY = Math.max(gMaxY, y);
      }
    }
  }
  // Empty grid
  if (gMaxX < 0) return false;

  // Bounding boxes must match in size
  const pW = pMaxX - pMinX;
  const pH = pMaxY - pMinY;
  const gW = gMaxX - gMinX;
  const gH = gMaxY - gMinY;
  if (pW !== gW || pH !== gH) return false;

  // Compare cell by cell (offset)
  for (let y = 0; y <= pH; y++) {
    for (let x = 0; x <= pW; x++) {
      const pIng = pattern[pMinY + y][pMinX + x];
      const gId = grid[gMinY + y]?.[gMinX + x];
      if (pIng === null) {
        if (gId !== null && gId !== undefined && gId >= 0) return false;
      } else {
        if (gId === null || gId === undefined || gId < 0) return false;
        if (!ingredientMatches(pIng, gId)) return false;
      }
    }
  }
  return true;
}

function matchShapeless(ingredients: Ingredient[], flatGrid: number[]): boolean {
  if (ingredients.length !== flatGrid.length) return false;
  // Try to match each ingredient to a grid item (one-to-one)
  const used = new Array(flatGrid.length).fill(false);
  for (const ing of ingredients) {
    let found = false;
    for (let i = 0; i < flatGrid.length; i++) {
      if (used[i]) continue;
      if (ingredientMatches(ing, flatGrid[i])) {
        used[i] = true;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

// Get all recipes that can be crafted with the current inventory (for the recipe book)
export function getAvailableRecipes(
  inventory: { countItem: (id: number) => number },
  allowTableRecipes: boolean
): Recipe[] {
  return RECIPES.filter((r) => {
    if (r.requiresTable && !allowTableRecipes) return false;
    // Check if inventory has all ingredients
    const needed = new Map<number, number>();
    const collect = (ing: Ingredient) => {
      if (ing === null || typeof ing === "string") {
        // For tags like "any_planks", check Planks
        if (ing === "any_planks") {
          needed.set(BlockType.Planks, (needed.get(BlockType.Planks) ?? 0) + 1);
        } else if (ing === "any_log") {
          needed.set(BlockType.Wood, (needed.get(BlockType.Wood) ?? 0) + 1);
        }
        return;
      }
      needed.set(ing, (needed.get(ing) ?? 0) + 1);
    };
    if (r.type === "shaped") {
      for (const row of r.pattern) for (const ing of row) collect(ing);
    } else {
      for (const ing of r.ingredients) collect(ing);
    }
    for (const [id, count] of needed) {
      if (inventory.countItem(id) < count) return false;
    }
    return true;
  });
}
