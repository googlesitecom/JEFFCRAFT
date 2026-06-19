"use client";

import { useState, useCallback, useEffect } from "react";
import { Inventory, ItemStack, HOTBAR_SIZE } from "@/lib/minecraft/inventory";
import { BlockType, BLOCKS } from "@/lib/minecraft/blocks";
import { ItemType, ITEMS, isItem } from "@/lib/minecraft/items";
import { matchRecipe, getAvailableRecipes, RECIPES, Recipe } from "@/lib/minecraft/recipes";
import { getAllBlockIds } from "@/lib/minecraft/blocks";
import { getAllItemIds } from "@/lib/minecraft/items";

interface InventoryUIProps {
  inventory: Inventory;
  iconUrls: Record<string, string>;
  isCraftingTable: boolean;
  isCreative?: boolean;
  onClose: () => void;
  onInventoryChange: () => void;
}

export function InventoryUI({
  inventory,
  iconUrls,
  isCraftingTable,
  isCreative = false,
  onClose,
  onInventoryChange,
}: InventoryUIProps) {
  // Craft grid: 3x3, each cell holds an ItemStack (id + count)
  const [craftGrid, setCraftGrid] = useState<(ItemStack | null)[][]>(
    Array.from({ length: 3 }, () => Array(3).fill(null))
  );
  const [showRecipeBook, setShowRecipeBook] = useState(false);
  // Cursor-held item (for pick-up / place)
  const [heldItem, setHeldItem] = useState<ItemStack | null>(null);
  // Force re-render counter
  const [, forceUpdate] = useState(0);
  const refresh = () => forceUpdate((v) => v + 1);

  // Recompute craft result whenever grid or inventory changes
  const computeResult = (grid: (ItemStack | null)[][]): { id: number; count: number } | null => {
    // Convert grid to ids for matchRecipe
    const idGrid: (number | null)[][] = grid.map((row) => row.map((s) => (s ? s.id : null)));
    return matchRecipe(idGrid, isCraftingTable);
  };

  const result = computeResult(craftGrid);

  // Get icon URL for any id
  const getIcon = (id: number): string => {
    if (id < 100) {
      const def = BLOCKS[id as BlockType];
      if (!def) return "";
      if (id === BlockType.Grass) return iconUrls["grass_side"] ?? "";
      return iconUrls[def.textures.side] ?? iconUrls[def.textures.top] ?? "";
    }
    const def = ITEMS[id as ItemType];
    return def ? iconUrls[def.icon] ?? "" : "";
  };

  const getName = (id: number): string => {
    if (id < 100) return BLOCKS[id as BlockType]?.name ?? "Unknown";
    return ITEMS[id as ItemType]?.name ?? "Unknown";
  };

  // === Click on an inventory slot ===
  // Left click: pick up entire stack, or place held stack
  // Right click: pick up half, or place 1
  const handleSlotClick = (slot: number, isRight: boolean) => {
    const current = inventory.slots[slot];

    if (heldItem === null) {
      // Pick up
      if (current) {
        if (isRight) {
          // Pick up half
          const half = Math.ceil(current.count / 2);
          const remaining = current.count - half;
          setHeldItem({ id: current.id, count: half });
          if (remaining > 0) {
            inventory.setSlot(slot, { id: current.id, count: remaining });
          } else {
            inventory.setSlot(slot, null);
          }
        } else {
          // Pick up all
          setHeldItem({ id: current.id, count: current.count });
          inventory.setSlot(slot, null);
        }
        onInventoryChange();
        refresh();
      }
    } else {
      // Place
      if (current && current.id === heldItem.id) {
        // Merge
        const max = isItem(current.id) ? (ITEMS[current.id as ItemType]?.maxStack ?? 64) : 64;
        const space = max - current.count;
        const add = Math.min(space, heldItem.count);
        if (add > 0) {
          inventory.setSlot(slot, { id: current.id, count: current.count + add });
          const remaining = heldItem.count - add;
          setHeldItem(remaining > 0 ? { id: heldItem.id, count: remaining } : null);
          onInventoryChange();
          refresh();
        }
      } else if (!current) {
        // Place all (or 1 if right click)
        if (isRight) {
          inventory.setSlot(slot, { id: heldItem.id, count: 1 });
          const remaining = heldItem.count - 1;
          setHeldItem(remaining > 0 ? { id: heldItem.id, count: remaining } : null);
        } else {
          inventory.setSlot(slot, { id: heldItem.id, count: heldItem.count });
          setHeldItem(null);
        }
        onInventoryChange();
        refresh();
      } else {
        // Swap (only on left click)
        if (!isRight) {
          const oldCurrent = { id: current.id, count: current.count };
          inventory.setSlot(slot, { id: heldItem.id, count: heldItem.count });
          setHeldItem(oldCurrent);
          onInventoryChange();
          refresh();
        }
      }
    }
  };

  // === Click on a craft grid slot ===
  const handleCraftSlotClick = (x: number, y: number, isRight: boolean) => {
    // For 2x2 crafting (inventory), only allow top-left 2x2
    if (!isCraftingTable && (x >= 2 || y >= 2)) return;

    const newGrid = craftGrid.map((row) => [...row]);
    const current = newGrid[y][x];

    if (heldItem === null) {
      // Pick up from grid
      if (current) {
        if (isRight) {
          // Pick up half
          const half = Math.ceil(current.count / 2);
          const remaining = current.count - half;
          setHeldItem({ id: current.id, count: half });
          newGrid[y][x] = remaining > 0 ? { id: current.id, count: remaining } : null;
        } else {
          setHeldItem({ id: current.id, count: current.count });
          newGrid[y][x] = null;
        }
        setCraftGrid(newGrid);
        refresh();
      }
    } else {
      // Place into grid
      if (current && current.id === heldItem.id) {
        // Merge
        const max = 64;
        const space = max - current.count;
        const add = Math.min(space, heldItem.count);
        if (add > 0) {
          newGrid[y][x] = { id: current.id, count: current.count + add };
          const remaining = heldItem.count - add;
          setHeldItem(remaining > 0 ? { id: heldItem.id, count: remaining } : null);
          setCraftGrid(newGrid);
          refresh();
        }
      } else if (!current) {
        if (isRight) {
          newGrid[y][x] = { id: heldItem.id, count: 1 };
          const remaining = heldItem.count - 1;
          setHeldItem(remaining > 0 ? { id: heldItem.id, count: remaining } : null);
        } else {
          newGrid[y][x] = { id: heldItem.id, count: heldItem.count };
          setHeldItem(null);
        }
        setCraftGrid(newGrid);
        refresh();
      } else if (!isRight) {
        // Swap
        const oldCurrent = { id: current.id, count: current.count };
        newGrid[y][x] = { id: heldItem.id, count: heldItem.count };
        setHeldItem(oldCurrent);
        setCraftGrid(newGrid);
        refresh();
      }
    }
  };

  // === Click on result: take the crafted item ===
  const handleTakeResult = (isRight: boolean) => {
    if (!result) return;
    if (heldItem === null) {
      // Take the result
      inventory.addItem(result.id, result.count);
      // Clear grid
      setCraftGrid(Array.from({ length: 3 }, () => Array(3).fill(null)));
      onInventoryChange();
      refresh();
    } else if (heldItem.id === result.id && heldItem.count + result.count <= 64) {
      // Stack onto held item
      inventory.addItem(result.id, result.count);
      setHeldItem({ id: heldItem.id, count: heldItem.count + result.count });
      setCraftGrid(Array.from({ length: 3 }, () => Array(3).fill(null)));
      onInventoryChange();
      refresh();
    }
  };

  // === Recipe book: auto-craft by filling grid from inventory ===
  const handleRecipeClick = (recipe: Recipe) => {
    // For shaped recipes, build the pattern in the grid and consume ingredients
    if (recipe.type !== "shaped") {
      // Shapeless: just consume ingredients and give result
      const needed: Array<{ id: number; count: number }> = [];
      for (const ing of recipe.ingredients) {
        if (ing === null) continue;
        if (ing === "any_planks") needed.push({ id: BlockType.Planks, count: 1 });
        else if (ing === "any_log") needed.push({ id: BlockType.Wood, count: 1 });
        else needed.push({ id: ing, count: 1 });
      }
      // Check we have all
      for (const n of needed) {
        if (inventory.countItem(n.id) < n.count) return;
      }
      // Consume
      for (const n of needed) {
        for (let i = 0; i < inventory.slots.length; i++) {
          const s = inventory.slots[i];
          if (s && s.id === n.id) {
            inventory.subtractFromSlot(i, n.count);
            break;
          }
        }
      }
      // Give result
      inventory.addItem(recipe.result.id, recipe.result.count);
      onInventoryChange();
      refresh();
      return;
    }

    // Shaped recipe: try to fill the grid
    const pattern = recipe.pattern;
    // Find bounding box of pattern
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
    if (pMaxX < 0) return;

    // Build the grid (place at top-left)
    const newGrid: (ItemStack | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));
    const toConsume: Array<{ id: number; count: number }> = [];
    for (let y = pMinY; y <= pMaxY; y++) {
      for (let x = pMinX; x <= pMaxX; x++) {
        const ing = pattern[y][x];
        if (ing === null) continue;
        let itemId: number | null = null;
        if (ing === "any_planks") itemId = BlockType.Planks;
        else if (ing === "any_log") itemId = BlockType.Wood;
        else itemId = ing;
        if (itemId !== null) {
          const gridX = x - pMinX;
          const gridY = y - pMinY;
          // Check bounds (2x2 for inventory crafting)
          if (!isCraftingTable && (gridX >= 2 || gridY >= 2)) return;
          newGrid[gridY][gridX] = { id: itemId, count: 1 };
          toConsume.push({ id: itemId, count: 1 });
        }
      }
    }

    // Check we have all ingredients
    const neededMap = new Map<number, number>();
    for (const c of toConsume) {
      neededMap.set(c.id, (neededMap.get(c.id) ?? 0) + 1);
    }
    for (const [id, count] of neededMap) {
      if (inventory.countItem(id) < count) return;
    }

    // Consume ingredients from inventory
    for (const c of toConsume) {
      for (let i = 0; i < inventory.slots.length; i++) {
        const s = inventory.slots[i];
        if (s && s.id === c.id && s.count >= c.count) {
          inventory.subtractFromSlot(i, c.count);
          break;
        }
      }
    }

    // Set the grid and give the result immediately
    setCraftGrid(newGrid);
    // Give result directly (since we consumed ingredients)
    inventory.addItem(recipe.result.id, recipe.result.count);
    // Clear the grid after a brief moment (so user sees the pattern)
    setTimeout(() => {
      setCraftGrid(Array.from({ length: 3 }, () => Array(3).fill(null)));
      refresh();
    }, 200);
    onInventoryChange();
    refresh();
  };

  // Show ALL recipes in the book, regardless of crafting surface
  // Recipes that require a table show a small "T" badge
  const allRecipes = RECIPES;
  const craftableIds = new Set(getAvailableRecipes(inventory, isCraftingTable).map((r) => r.result.id + "_" + r.result.count));

  // Creative mode: list all blocks and items
  const creativeItems: number[] = isCreative
    ? [...getAllBlockIds().filter((id) => id !== BlockType.Air), ...getAllItemIds()]
    : [];

  // Click on a creative item: give a stack to the player
  const handleCreativeItemClick = (id: number) => {
    inventory.addItem(id, 64);
    onInventoryChange();
    refresh();
  };

  // Track mouse position for held item cursor
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Render a slot
  const renderSlot = (
    stack: ItemStack | null,
    onClick: (isRight: boolean) => void,
    key: string,
    highlight?: boolean,
    disabled?: boolean
  ) => {
    return (
      <div
        key={key}
        onClick={(e) => { e.preventDefault(); if (!disabled) onClick(false); }}
        onContextMenu={(e) => { e.preventDefault(); if (!disabled) onClick(true); }}
        className={`w-12 h-12 border-2 flex items-center justify-center relative cursor-pointer hover:bg-white/10 ${
          highlight ? "border-yellow-400" : disabled ? "border-stone-700 bg-stone-900/50" : "border-stone-600"
        } bg-stone-800/80`}
        style={{ imageRendering: "pixelated" }}
      >
        {stack && (
          <>
            <img
              src={getIcon(stack.id)}
              alt={getName(stack.id)}
              className="w-10 h-10"
              style={{ imageRendering: "pixelated" }}
              draggable={false}
            />
            {stack.count > 1 && (
              <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold" style={{ textShadow: "1px 1px 0 #000" }}>
                {stack.count}
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-stone-900/95 border-4 border-stone-700 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white font-mono">
            {isCraftingTable ? "Mesa de Crafteo" : "Inventario"}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRecipeBook(!showRecipeBook)}
              className={`px-3 py-1 border-2 text-white text-sm font-mono rounded ${
                showRecipeBook ? "bg-green-600 border-green-400" : "bg-green-700 hover:bg-green-600 border-green-500"
              }`}
            >
              📖 Libro de Recetas
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-stone-700 hover:bg-stone-600 border-2 border-stone-500 text-white text-sm font-mono rounded"
            >
              ✕ Cerrar
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Crafting area */}
          <div className="flex-shrink-0">
            <h3 className="text-white text-sm font-mono mb-2">Crafteo {isCraftingTable ? "(3×3)" : "(2×2)"}</h3>
            <div className="flex items-center gap-4">
              <div className="grid grid-cols-3 gap-1 p-2 bg-stone-800/60 rounded">
                {craftGrid.map((row, y) =>
                  row.map((stack, x) => (
                    <div key={`${x}-${y}`}>
                      {renderSlot(
                        stack,
                        (isRight) => handleCraftSlotClick(x, y, isRight),
                        `craft-${x}-${y}`,
                        false,
                        !isCraftingTable && (x >= 2 || y >= 2)
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="text-white text-2xl">→</div>
              <div className="p-2 bg-stone-800/60 rounded">
                {result ? (
                  <div
                    onClick={(e) => { e.preventDefault(); handleTakeResult(e.button === 2); }}
                    onContextMenu={(e) => { e.preventDefault(); handleTakeResult(true); }}
                    className="w-12 h-12 border-2 border-yellow-400 bg-stone-800 flex items-center justify-center cursor-pointer hover:bg-yellow-400/20 relative"
                    style={{ imageRendering: "pixelated" }}
                  >
                    <img src={getIcon(result.id)} alt={getName(result.id)} className="w-10 h-10" style={{ imageRendering: "pixelated" }} draggable={false} />
                    {result.count > 1 && (
                      <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold" style={{ textShadow: "1px 1px 0 #000" }}>
                        {result.count}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="w-12 h-12 border-2 border-stone-600 bg-stone-800" />
                )}
              </div>
            </div>
            {result && (
              <p className="text-green-400 text-xs font-mono mt-2">
                Resultado: {getName(result.id)} ×{result.count}
              </p>
            )}
          </div>

          {/* Recipe book */}
          {showRecipeBook && (
            <div className="flex-1">
              <h3 className="text-white text-sm font-mono mb-2">Recetas ({allRecipes.length})</h3>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 p-2 bg-stone-800/60 rounded max-h-64 overflow-y-auto">
                {allRecipes.map((recipe, i) => {
                  const canCraft = craftableIds.has(recipe.result.id + "_" + recipe.result.count);
                  const needsTable = recipe.requiresTable && !isCraftingTable;
                  return (
                    <button
                      key={i}
                      onClick={() => canCraft && !needsTable && handleRecipeClick(recipe)}
                      className={`w-12 h-12 border-2 flex items-center justify-center relative ${
                        needsTable
                          ? "border-blue-600 bg-stone-900/60 cursor-help"
                          : canCraft
                            ? "border-green-400 bg-stone-800 hover:bg-green-400/20 cursor-pointer"
                            : "border-stone-700 bg-stone-900/60 cursor-not-allowed opacity-50"
                      }`}
                      title={getName(recipe.result.id) + (needsTable ? " (requiere mesa)" : canCraft ? "" : " (sin materiales)")}
                      style={{ imageRendering: "pixelated" }}
                    >
                      <img src={getIcon(recipe.result.id)} alt={getName(recipe.result.id)} className="w-10 h-10" style={{ imageRendering: "pixelated" }} draggable={false} />
                      {canCraft && !needsTable && (
                        <span className="absolute top-0 right-0 w-2 h-2 bg-green-400 rounded-full" />
                      )}
                      {needsTable && (
                        <span className="absolute bottom-0 right-0 text-[8px] text-blue-400 font-mono font-bold bg-stone-900/80 px-0.5">T</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-stone-400 text-xs font-mono mt-2">
                <span className="text-green-400">●</span> Con materiales · 
                <span className="text-stone-500"> ●</span> Sin materiales · 
                <span className="text-blue-400"> T</span> Requiere mesa
              </p>
            </div>
          )}
        </div>

        {/* Creative items list */}
        {isCreative && (
          <div className="mt-6">
            <h3 className="text-white text-sm font-mono mb-2">Todos los objetos (click para obtener 64)</h3>
            <div className="grid grid-cols-9 sm:grid-cols-12 gap-1 p-2 bg-stone-800/60 rounded max-h-48 overflow-y-auto">
              {creativeItems.map((id) => {
                const icon = getIcon(id);
                const name = getName(id);
                if (!icon) return null;
                return (
                  <button
                    key={id}
                    onClick={() => handleCreativeItemClick(id)}
                    className="w-12 h-12 border-2 border-stone-600 hover:border-green-400 bg-stone-800 flex items-center justify-center cursor-pointer hover:bg-green-400/20"
                    title={name}
                    style={{ imageRendering: "pixelated" }}
                  >
                    <img src={icon} alt={name} className="w-10 h-10" style={{ imageRendering: "pixelated" }} draggable={false} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main inventory (27 slots) */}
        <div className="mt-6">
          <h3 className="text-white text-sm font-mono mb-2">Inventario</h3>
          <div className="grid grid-cols-9 gap-1 p-2 bg-stone-800/60 rounded">
            {inventory.slots.slice(HOTBAR_SIZE).map((stack, i) => (
              <div key={i}>
                {renderSlot(
                  stack,
                  (isRight) => handleSlotClick(i + HOTBAR_SIZE, isRight),
                  `inv-${i}`
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Hotbar (9 slots) */}
        <div className="mt-2">
          <h3 className="text-white text-sm font-mono mb-2">Hotbar</h3>
          <div className="grid grid-cols-9 gap-1 p-2 bg-stone-800/60 rounded">
            {inventory.slots.slice(0, HOTBAR_SIZE).map((stack, i) => (
              <div key={i}>
                {renderSlot(
                  stack,
                  (isRight) => handleSlotClick(i, isRight),
                  `hot-${i}`,
                  i === inventory.selectedHotbar
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Held item following cursor */}
        {heldItem && (
          <div
            className="fixed pointer-events-none z-50"
            style={{ left: mousePos.x, top: mousePos.y, transform: "translate(-50%, -50%)" }}
          >
            <div className="w-12 h-12 border-2 border-yellow-400 bg-stone-800/90 flex items-center justify-center relative" style={{ imageRendering: "pixelated" }}>
              <img src={getIcon(heldItem.id)} alt="" className="w-10 h-10" style={{ imageRendering: "pixelated" }} draggable={false} />
              {heldItem.count > 1 && (
                <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold" style={{ textShadow: "1px 1px 0 #000" }}>
                  {heldItem.count}
                </span>
              )}
            </div>
          </div>
        )}

        <p className="text-stone-400 text-xs font-mono mt-4 text-center">
          <span className="text-yellow-400">Click izq</span>: recoger/colocar todo · 
          <span className="text-yellow-400"> Click der</span>: recoger mitad/colocar 1 · 
          <span className="text-yellow-400"> Click en resultado</span>: craftear
        </p>
      </div>
    </div>
  );
}
