"use client";

import { useState, useCallback } from "react";
import { Inventory, ItemStack, HOTBAR_SIZE } from "@/lib/minecraft/inventory";
import { BlockType, BLOCKS } from "@/lib/minecraft/blocks";
import { ItemType, ITEMS, isItem, getDisplayName } from "@/lib/minecraft/items";
import { matchRecipe, getAvailableRecipes, Recipe } from "@/lib/minecraft/recipes";

interface InventoryUIProps {
  inventory: Inventory;
  iconUrls: Record<string, string>;
  // For crafting table: 3x3 grid. For inventory crafting: 2x2 grid (we'll still use 3x3 but limit)
  isCraftingTable: boolean;
  onClose: () => void;
  onInventoryChange: () => void;
}

export function InventoryUI({
  inventory,
  iconUrls,
  isCraftingTable,
  onClose,
  onInventoryChange,
}: InventoryUIProps) {
  // Crafting grid: 3x3 (always 3x3 internally, but 2x2 craft only uses top-left when not table)
  const [craftGrid, setCraftGrid] = useState<(number | null)[][]>(
    Array.from({ length: 3 }, () => Array(3).fill(null))
  );
  const [craftResult, setCraftResult] = useState<{ id: number; count: number } | null>(null);
  const [showRecipeBook, setShowRecipeBook] = useState(false);
  // Drag state: which slot is being dragged
  const [draggedFrom, setDraggedFrom] = useState<{ type: "inv" | "craft"; slot: number } | null>(null);
  const [draggedStack, setDraggedStack] = useState<ItemStack | null>(null);

  // Update craft result whenever grid changes
  const updateCraftResult = useCallback((grid: (number | null)[][]) => {
    const result = matchRecipe(grid, isCraftingTable);
    setCraftResult(result);
  }, [isCraftingTable]);

  const handleGridChange = (newGrid: (number | null)[][]) => {
    setCraftGrid(newGrid);
    updateCraftResult(newGrid);
  };

  // Get icon URL for any id
  const getIcon = (id: number): string => {
    if (id < 100) {
      // Block
      const def = BLOCKS[id as BlockType];
      if (!def) return "";
      // Use side texture, or top if it's grass
      if (id === BlockType.Grass) return iconUrls["grass_side"] ?? "";
      return iconUrls[def.textures.side] ?? iconUrls[def.textures.top] ?? "";
    }
    // Item
    const def = ITEMS[id as ItemType];
    return def ? iconUrls[def.icon] ?? "" : "";
  };

  const getName = (id: number): string => {
    if (id < 100) return BLOCKS[id as BlockType]?.name ?? "Unknown";
    return ITEMS[id as ItemType]?.name ?? "Unknown";
  };

  // Handle click on an inventory slot
  const handleSlotClick = (slot: number, e: React.MouseEvent) => {
    e.preventDefault();
    const currentStack = inventory.slots[slot];

    if (draggedStack === null) {
      // Pick up stack
      if (currentStack) {
        if (e.button === 2) {
          // Right click: pick up half
          const half = Math.ceil(currentStack.count / 2);
          const remaining = currentStack.count - half;
          setDraggedStack({ id: currentStack.id, count: half });
          if (remaining > 0) {
            inventory.setSlot(slot, { id: currentStack.id, count: remaining });
          } else {
            inventory.setSlot(slot, null);
          }
        } else {
          setDraggedStack({ id: currentStack.id, count: currentStack.count });
          inventory.setSlot(slot, null);
        }
        setDraggedFrom({ type: "inv", slot });
        onInventoryChange();
      }
    } else {
      // Place stack - work with a local copy of draggedStack
      let newDraggedCount = draggedStack.count;
      const draggedId = draggedStack.id;

      if (currentStack && currentStack.id === draggedId) {
        // Merge
        const max = isItem(currentStack.id) ? (ITEMS[currentStack.id as ItemType]?.maxStack ?? 64) : 64;
        const space = max - currentStack.count;
        const add = Math.min(space, newDraggedCount);
        inventory.setSlot(slot, { id: currentStack.id, count: currentStack.count + add });
        newDraggedCount -= add;
      } else if (!currentStack) {
        // Place
        if (e.button === 2) {
          // Right click: place 1
          inventory.setSlot(slot, { id: draggedId, count: 1 });
          newDraggedCount -= 1;
        } else {
          inventory.setSlot(slot, { id: draggedId, count: newDraggedCount });
          newDraggedCount = 0;
        }
      } else {
        // Swap
        inventory.setSlot(slot, { id: draggedId, count: newDraggedCount });
        setDraggedStack({ id: currentStack.id, count: currentStack.count });
        onInventoryChange();
        return;
      }

      if (newDraggedCount <= 0) {
        setDraggedStack(null);
      } else {
        setDraggedStack({ id: draggedId, count: newDraggedCount });
      }
      onInventoryChange();
    }
  };

  // Handle click on a craft grid slot
  const handleCraftSlotClick = (x: number, y: number, e: React.MouseEvent) => {
    e.preventDefault();
    const slotIdx = y * 3 + x;
    // For 2x2 crafting (inventory), only allow top-left 2x2
    if (!isCraftingTable && (x >= 2 || y >= 2)) return;

    const currentId = craftGrid[y][x];

    if (draggedStack === null) {
      // Pick up
      if (currentId !== null && currentId !== undefined) {
        // Find this item in inventory and remove 1
        // Actually, craft grid items should be tracked separately
        // For simplicity, we'll just place items from inventory
        // Remove from inventory and put in craft grid
        const selected = inventory.getSelected();
        if (selected && selected.count > 0) {
          const newGrid = craftGrid.map((row) => [...row]);
          newGrid[y][x] = selected.id;
          handleGridChange(newGrid);
          inventory.removeSelected(1);
          onInventoryChange();
        }
      } else {
        // Empty slot: place selected item from hotbar
        const selected = inventory.getSelected();
        if (selected && selected.count > 0) {
          const newGrid = craftGrid.map((row) => [...row]);
          newGrid[y][x] = selected.id;
          handleGridChange(newGrid);
          inventory.removeSelected(1);
          onInventoryChange();
        }
      }
    }
  };

  // Take the crafted result
  const handleTakeResult = () => {
    if (!craftResult) return;
    inventory.addItem(craftResult.id, craftResult.count);
    // Clear the craft grid
    handleGridChange(Array.from({ length: 3 }, () => Array(3).fill(null)));
    onInventoryChange();
  };

  // Recipe book: click a recipe to auto-fill the grid
  const handleRecipeClick = (recipe: Recipe) => {
    if (recipe.type === "shaped") {
      // Try to fill the grid with the pattern, taking items from inventory
      const newGrid: (number | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));
      // Find bounding box of pattern
      let pMinX = 3, pMaxX = -1, pMinY = 3, pMaxY = -1;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          if (recipe.pattern[y][x] !== null) {
            pMinX = Math.min(pMinX, x);
            pMaxX = Math.max(pMaxX, x);
            pMinY = Math.min(pMinY, y);
            pMaxY = Math.max(pMaxY, y);
          }
        }
      }
      // Place at top-left of grid (or top-left of 2x2 for inventory craft)
      const offsetX = isCraftingTable ? 0 : 0;
      const offsetY = 0;
      // Try to consume items from inventory
      const toRemove: Array<{ id: number; count: number }> = [];
      for (let y = pMinY; y <= pMaxY; y++) {
        for (let x = pMinX; x <= pMaxX; x++) {
          const ing = recipe.pattern[y][x];
          if (ing === null) continue;
          // Resolve ingredient to concrete id
          let itemId: number | null = null;
          if (ing === "any_planks") itemId = BlockType.Planks;
          else if (ing === "any_log") itemId = BlockType.Wood;
          else itemId = ing;
          if (itemId !== null && inventory.countItem(itemId) > 0) {
            newGrid[y - pMinY + offsetY][x - pMinX + offsetX] = itemId;
            toRemove.push({ id: itemId, count: 1 });
          }
        }
      }
      // Check if we have all items
      const needed: Map<number, number> = new Map();
      for (const r of toRemove) {
        needed.set(r.id, (needed.get(r.id) ?? 0) + 1);
      }
      let canCraft = true;
      for (const [id, count] of needed) {
        if (inventory.countItem(id) < count) {
          canCraft = false;
          break;
        }
      }
      if (canCraft) {
        // Remove items using subtractFromSlot
        for (const r of toRemove) {
          for (let i = 0; i < inventory.slots.length; i++) {
            const s = inventory.slots[i];
            if (s && s.id === r.id && s.count >= r.count) {
              inventory.subtractFromSlot(i, r.count);
              break;
            }
          }
        }
        handleGridChange(newGrid);
        onInventoryChange();
      }
    }
  };

  const availableRecipes = getAvailableRecipes(inventory, isCraftingTable);

  // Render a single slot
  const renderSlot = (id: number | null, count: number, onClick: (e: React.MouseEvent) => void, key: string, highlight?: boolean) => {
    return (
      <div
        key={key}
        onClick={onClick}
        onContextMenu={onClick}
        className={`w-12 h-12 border-2 flex items-center justify-center relative cursor-pointer hover:bg-white/10 ${
          highlight ? "border-yellow-400" : "border-stone-600"
        } bg-stone-800/80`}
        style={{ imageRendering: "pixelated" }}
      >
        {id !== null && id !== undefined && id >= 0 && (
          <>
            <img
              src={getIcon(id)}
              alt={getName(id)}
              className="w-10 h-10"
              style={{ imageRendering: "pixelated" }}
              draggable={false}
            />
            {count > 1 && (
              <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold" style={{ textShadow: "1px 1px 0 #000" }}>
                {count}
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
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
              className="px-3 py-1 bg-green-700 hover:bg-green-600 border-2 border-green-500 text-white text-sm font-mono rounded"
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
          {/* Left: Crafting area */}
          <div className="flex-shrink-0">
            <h3 className="text-white text-sm font-mono mb-2">Crafteo</h3>
            <div className="flex items-center gap-4">
              {/* Craft grid */}
              <div className="grid grid-cols-3 gap-1 p-2 bg-stone-800/60 rounded">
                {craftGrid.map((row, y) =>
                  row.map((id, x) => (
                    <div key={`${x}-${y}`}>
                      {renderSlot(
                        id,
                        id !== null ? 1 : 0,
                        (e) => handleCraftSlotClick(x, y, e),
                        `craft-${x}-${y}`,
                        !isCraftingTable && (x >= 2 || y >= 2)
                      )}
                    </div>
                  ))
                )}
              </div>
              {/* Arrow */}
              <div className="text-white text-2xl">→</div>
              {/* Result */}
              <div className="p-2 bg-stone-800/60 rounded">
                {craftResult ? (
                  <div
                    onClick={handleTakeResult}
                    className="w-12 h-12 border-2 border-yellow-400 bg-stone-800 flex items-center justify-center cursor-pointer hover:bg-yellow-400/20"
                    style={{ imageRendering: "pixelated" }}
                  >
                    <img
                      src={getIcon(craftResult.id)}
                      alt={getName(craftResult.id)}
                      className="w-10 h-10"
                      style={{ imageRendering: "pixelated" }}
                      draggable={false}
                    />
                    {craftResult.count > 1 && (
                      <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold" style={{ textShadow: "1px 1px 0 #000" }}>
                        {craftResult.count}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="w-12 h-12 border-2 border-stone-600 bg-stone-800" />
                )}
              </div>
            </div>
          </div>

          {/* Right: Recipe book (collapsible) */}
          {showRecipeBook && (
            <div className="flex-1">
              <h3 className="text-white text-sm font-mono mb-2">Recetas disponibles ({availableRecipes.length})</h3>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 p-2 bg-stone-800/60 rounded max-h-64 overflow-y-auto">
                {availableRecipes.length === 0 && (
                  <div className="col-span-full text-stone-400 text-xs font-mono p-4 text-center">
                    No tienes materiales para ninguna receta.
                    <br />
                    Recoge madera y materiales primero.
                  </div>
                )}
                {availableRecipes.map((recipe, i) => (
                  <button
                    key={i}
                    onClick={() => handleRecipeClick(recipe)}
                    className="w-12 h-12 border-2 border-stone-600 hover:border-green-400 bg-stone-800 flex items-center justify-center cursor-pointer hover:bg-green-400/10"
                    title={getName(recipe.result.id)}
                    style={{ imageRendering: "pixelated" }}
                  >
                    <img
                      src={getIcon(recipe.result.id)}
                      alt={getName(recipe.result.id)}
                      className="w-10 h-10"
                      style={{ imageRendering: "pixelated" }}
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
              <p className="text-stone-400 text-xs font-mono mt-2">
                Click en una receta para craftear automáticamente.
              </p>
            </div>
          )}
        </div>

        {/* Inventory grid */}
        <div className="mt-6">
          <h3 className="text-white text-sm font-mono mb-2">Inventario</h3>
          <div className="grid grid-cols-9 gap-1 p-2 bg-stone-800/60 rounded">
            {inventory.slots.slice(HOTBAR_SIZE).map((stack, i) => (
              <div key={i}>
                {renderSlot(
                  stack?.id ?? null,
                  stack?.count ?? 0,
                  (e) => handleSlotClick(i + HOTBAR_SIZE, e),
                  `inv-${i}`
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Hotbar */}
        <div className="mt-2">
          <h3 className="text-white text-sm font-mono mb-2">Hotbar</h3>
          <div className="grid grid-cols-9 gap-1 p-2 bg-stone-800/60 rounded">
            {inventory.slots.slice(0, HOTBAR_SIZE).map((stack, i) => (
              <div key={i}>
                {renderSlot(
                  stack?.id ?? null,
                  stack?.count ?? 0,
                  (e) => handleSlotClick(i, e),
                  `hot-${i}`,
                  i === inventory.selectedHotbar
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Dragged item follows cursor */}
        {draggedStack && (
          <div
            className="fixed pointer-events-none z-50"
            style={{ left: 0, top: 0, transform: "translate(-50%, -50%)" }}
          >
            <div className="w-12 h-12 border-2 border-yellow-400 bg-stone-800/80 flex items-center justify-center relative" style={{ imageRendering: "pixelated" }}>
              <img src={getIcon(draggedStack.id)} alt="" className="w-10 h-10" style={{ imageRendering: "pixelated" }} draggable={false} />
              {draggedStack.count > 1 && (
                <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold" style={{ textShadow: "1px 1px 0 #000" }}>
                  {draggedStack.count}
                </span>
              )}
            </div>
          </div>
        )}

        <p className="text-stone-400 text-xs font-mono mt-4 text-center">
          Selecciona un item del hotbar (1-9) y click en el grid de crafteo para colocarlo.
          Click en el resultado para craftear.
        </p>
      </div>
    </div>
  );
}
