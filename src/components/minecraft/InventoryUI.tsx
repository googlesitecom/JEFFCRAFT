"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Inventory, ItemStack, HOTBAR_SIZE } from "@/lib/minecraft/inventory";
import { BlockType, BLOCKS } from "@/lib/minecraft/blocks";
import { ItemType, ITEMS, isItem } from "@/lib/minecraft/items";
import { matchRecipe, getAvailableRecipes, RECIPES, Recipe } from "@/lib/minecraft/recipes";
import { getAllBlockIds } from "@/lib/minecraft/blocks";
import { getAllItemIds } from "@/lib/minecraft/items";
import { ArmorSlots, equipArmor, getArmorSlot, serializeArmor, deserializeArmor, emptyArmor } from "@/lib/minecraft/armor";
import { readGamepad, wasButtonPressedLabelled, isGamepadConnected } from "@/lib/minecraft/gamepad";

interface InventoryUIProps {
  inventory: Inventory;
  iconUrls: Record<string, string>;
  isCraftingTable: boolean;
  isCreative?: boolean;
  // Armor state (for survival mode equip slots). If undefined, armor slots are hidden.
  armor?: ArmorSlots;
  onArmorChange?: (armor: ArmorSlots) => void;
  onClose: () => void;
  onInventoryChange: () => void;
}

export function InventoryUI({
  inventory,
  iconUrls,
  isCraftingTable,
  isCreative = false,
  armor,
  onArmorChange,
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

  // Get icon URL for any id (returns undefined when missing, to avoid empty src warnings)
  const getIcon = (id: number): string | undefined => {
    if (id < 100) {
      const def = BLOCKS[id as BlockType];
      if (!def) return undefined;
      if (id === BlockType.Grass) return iconUrls["grass_side"] || undefined;
      return iconUrls[def.textures.side] || iconUrls[def.textures.top] || undefined;
    }
    const def = ITEMS[id as ItemType];
    return def ? (iconUrls[def.icon] || undefined) : undefined;
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

  // === Click on an armor slot ===
  // Left-click: equip held item if it's armor of this slot's type.
  //   If slot already had armor, swap it back to held.
  // Right-click: same logic but only places 1 (since armor is maxStack=1, equivalent).
  // If held is null and slot has armor: pick up the armor.
  const handleArmorSlotClick = (slotType: "helmet" | "chestplate" | "leggings" | "boots", isRight: boolean) => {
    if (!armor || !onArmorChange) return;
    const currentSlot = armor[slotType];
    const currentItemId = currentSlot.itemId;

    if (heldItem === null) {
      // Pick up armor from slot
      if (currentItemId !== null) {
        // Carry over durability if the piece was used
        const heldStack: ItemStack = { id: currentItemId, count: 1 };
        if (currentSlot.durability >= 0) heldStack.durability = currentSlot.durability;
        setHeldItem(heldStack);
        onArmorChange({ ...armor, [slotType]: { itemId: null, durability: -1 } });
        onInventoryChange();
        refresh();
      }
      return;
    }

    // Held item must be armor of the right type
    const heldSlotType = getArmorSlot(heldItem.id);
    if (heldSlotType !== slotType) return;

    // Place held into slot, swap current back to held.
    // The newly equipped piece starts at full durability (or uses held durability if it had any).
    const newDurability = heldItem.durability !== undefined
      ? heldItem.durability
      : (ITEMS[heldItem.id as ItemType]?.maxDurability ?? 1);
    onArmorChange({ ...armor, [slotType]: { itemId: heldItem.id as ItemType, durability: newDurability } });
    if (currentItemId !== null) {
      // Swap current back to held (with its durability)
      const swappedStack: ItemStack = { id: currentItemId, count: 1 };
      if (currentSlot.durability >= 0) swappedStack.durability = currentSlot.durability;
      setHeldItem(swappedStack);
    } else {
      setHeldItem(null);
    }
    onInventoryChange();
    refresh();
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
  // Dedupe recipes by result id+count so the recipe book doesn't show duplicates
  const allRecipes = (() => {
    const seen = new Set<string>();
    const unique: Recipe[] = [];
    for (const r of RECIPES) {
      const key = r.result.id + "_" + r.result.count;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }
    return unique;
  })();
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

  // === Controller navigation state ===
  // Selected slot cursor for controller navigation. We support three zones:
  //   - "main": the 9×3 main inventory (inventory indices 9..35), cursor 0..26
  //   - "hotbar": the 9×1 hotbar (inventory indices 0..8), cursor 0..8
  //   - "armor": the 4 vertical armor slots, cursor 0..3
  // The cursor is initialized on first gamepad poll.
  const [controllerSlot, setControllerSlot] = useState<number>(0);
  const [controllerZone, setControllerZone] = useState<"main" | "hotbar" | "armor">("main");
  const [controllerActive, setControllerActive] = useState(false);
  const controllerEnabled = isGamepadConnected();

  // Refs so the per-frame loop always sees the latest cursor without needing
  // to re-create the rAF loop on every state change
  const slotRef = useRef(controllerSlot);
  const zoneRef = useRef(controllerZone);
  slotRef.current = controllerSlot;
  zoneRef.current = controllerZone;

  // Per-frame gamepad polling for inventory navigation
  useEffect(() => {
    if (!controllerEnabled) {
      setControllerActive(false);
      return;
    }
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        // B / Y / Start = close inventory
        if (
          wasButtonPressedLabelled("inv-close", pad, 1) ||
          wasButtonPressedLabelled("inv-close", pad, 3) ||
          wasButtonPressedLabelled("inv-close", pad, 9)
        ) {
          onClose();
          return;
        }
        if (!controllerActive) setControllerActive(true);

        const dpad = {
          up: wasButtonPressedLabelled("inv-nav", pad, 12),
          down: wasButtonPressedLabelled("inv-nav", pad, 13),
          left: wasButtonPressedLabelled("inv-nav", pad, 14),
          right: wasButtonPressedLabelled("inv-nav", pad, 15),
        };
        if (dpad.left || dpad.right || dpad.up || dpad.down) {
          const cols = 9;
          const zone = zoneRef.current;
          const idx = slotRef.current;
          if (zone === "main") {
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            let nr = row, nc = col;
            if (dpad.left) nc = (col - 1 + cols) % cols;
            if (dpad.right) nc = (col + 1) % cols;
            if (dpad.up) { if (row > 0) nr = row - 1; }
            if (dpad.down) {
              if (row === 2) { zoneRef.current = "hotbar"; setControllerZone("hotbar"); slotRef.current = nc; setControllerSlot(nc); }
              else nr = row + 1;
            }
            if (zone === "main") {
              const newIdx = nr * cols + nc;
              slotRef.current = newIdx;
              setControllerSlot(newIdx);
            }
          } else if (zone === "hotbar") {
            let nc = idx;
            if (dpad.left) nc = (idx - 1 + cols) % cols;
            if (dpad.right) nc = (idx + 1) % cols;
            if (dpad.up) { zoneRef.current = "main"; setControllerZone("main"); slotRef.current = 2 * cols + nc; setControllerSlot(2 * cols + nc); }
            else { slotRef.current = nc; setControllerSlot(nc); }
          }
        }

        // A = left-click current slot, X = right-click current slot
        if (wasButtonPressedLabelled("inv-action", pad, 0)) {
          const zone = zoneRef.current;
          const idx = slotRef.current;
          if (zone === "main") handleSlotClick(idx + 9, false);
          else if (zone === "hotbar") handleSlotClick(idx, false);
        }
        if (wasButtonPressedLabelled("inv-action", pad, 2)) {
          const zone = zoneRef.current;
          const idx = slotRef.current;
          if (zone === "main") handleSlotClick(idx + 9, true);
          else if (zone === "hotbar") handleSlotClick(idx, true);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllerEnabled, controllerActive, onClose]);

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
    // Compute durability bar for tools/armor
    let durFraction: number | null = null;
    if (stack && stack.id >= 100) {
      const def = ITEMS[stack.id as ItemType];
      if (def?.maxDurability) {
        const cur = stack.durability !== undefined ? stack.durability : def.maxDurability;
        durFraction = Math.max(0, Math.min(1, cur / def.maxDurability));
      }
    }
    // Controller cursor highlight: bright blue border + glow + slight scale
    const isControllerCursor = controllerActive && highlight;
    return (
      <div
        key={key}
        onClick={(e) => { e.preventDefault(); if (!disabled) onClick(false); }}
        onContextMenu={(e) => { e.preventDefault(); if (!disabled) onClick(true); }}
        className={`w-12 h-12 flex items-center justify-center relative cursor-pointer transition-all ${
          disabled ? "cursor-not-allowed" : "hover:brightness-110"
        } ${isControllerCursor ? "scale-110 z-20" : ""}`}
        style={{
          imageRendering: "pixelated",
          backgroundColor: disabled ? "#6b6b6b" : isControllerCursor ? "#b8d0ff" : "#8b8b8b",
          borderTop: highlight ? (isControllerCursor ? "2px solid #4a8aff" : "2px solid #fff7a8") : "2px solid #c6c6c6",
          borderLeft: highlight ? (isControllerCursor ? "2px solid #4a8aff" : "2px solid #fff7a8") : "2px solid #c6c6c6",
          borderBottom: highlight ? (isControllerCursor ? "2px solid #4a8aff" : "2px solid #fff7a8") : "2px solid #373737",
          borderRight: highlight ? (isControllerCursor ? "2px solid #4a8aff" : "2px solid #fff7a8") : "2px solid #373737",
          boxShadow: isControllerCursor
            ? "0 0 12px rgba(100,150,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.6)"
            : highlight
              ? "inset 0 0 0 1px rgba(255,255,255,0.4)"
              : "inset 1px 1px 0 rgba(255,255,255,0.15)",
        }}
        title={stack ? getName(stack.id) : undefined}
      >
        {stack && (() => {
          const icon = getIcon(stack.id);
          if (!icon) return null;
          return (
            <>
              <img
                src={icon}
                alt={getName(stack.id)}
                className="w-9 h-9 relative z-10"
                style={{
                  imageRendering: "pixelated",
                  filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))",
              }}
              draggable={false}
            />
            {stack.count > 1 && (
              <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold z-20" style={{
                textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
              }}>
                {stack.count}
              </span>
            )}
            {/* Durability bar for tools/armor */}
            {durFraction !== null && (
              <div className="absolute bottom-0.5 left-1 right-1 h-[3px] z-15" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
                <div
                  className="h-full"
                  style={{
                    width: `${durFraction * 100}%`,
                    backgroundColor: durFraction > 0.5 ? "#6ade40" : durFraction > 0.2 ? "#facc15" : "#ef4444",
                  }}
                />
              </div>
            )}
            </>
          );
        })()}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="max-w-4xl w-full mx-4 max-h-[92vh] overflow-y-auto p-6"
        style={{
          backgroundColor: "#c6c6c6",
          imageRendering: "pixelated",
          borderTop: "4px solid #ffffff",
          borderLeft: "4px solid #ffffff",
          borderBottom: "4px solid #373737",
          borderRight: "4px solid #373737",
          boxShadow: "inset 0 0 0 2px #555, 0 12px 40px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5 pb-3" style={{ borderBottom: "2px solid #555" }}>
          <h2 className="text-2xl font-black text-[#2a2a2a] font-mono tracking-wide" style={{ textShadow: "2px 2px 0 #ffffff, -1px -1px 0 #ffffff" }}>
            {isCraftingTable ? "Mesa de Crafteo" : "Inventario"}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRecipeBook(!showRecipeBook)}
              className="px-3 py-1.5 text-white text-sm font-mono font-bold transition-all hover:scale-105"
              style={{
                backgroundColor: showRecipeBook ? "#4a8a4a" : "#5a8a5a",
                borderTop: "2px solid #7aaa7a",
                borderLeft: "2px solid #7aaa7a",
                borderBottom: "2px solid #2a4a2a",
                borderRight: "2px solid #2a4a2a",
                imageRendering: "pixelated",
                textShadow: "1px 1px 0 #1a1a1a",
              }}
            >
              {showRecipeBook ? "▼ Recetas" : "▶ Recetas"}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-white text-sm font-mono font-bold transition-all hover:scale-105"
              style={{
                backgroundColor: "#8a3a3a",
                borderTop: "2px solid #aa5a5a",
                borderLeft: "2px solid #aa5a5a",
                borderBottom: "2px solid #4a1a1a",
                borderRight: "2px solid #4a1a1a",
                imageRendering: "pixelated",
                textShadow: "1px 1px 0 #1a1a1a",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Character model + armor slots (like Minecraft) */}
          {!isCraftingTable && (
            <div className="flex-shrink-0 flex flex-col items-center gap-2">
              {/* Armor slots - functional in survival mode */}
              <div className="flex flex-col gap-1">
                {(["helmet", "chestplate", "leggings", "boots"] as const).map((slot) => {
                  const slotData = armor?.[slot] ?? null;
                  const equippedId = slotData?.itemId ?? null;
                  const equippedDurability = slotData?.durability ?? -1;
                  const canEquip = armor !== undefined && onArmorChange !== undefined;
                  // Compute durability fraction for the bar
                  let durFraction = 1;
                  if (equippedId !== null) {
                    const maxDur = ITEMS[equippedId as ItemType]?.maxDurability ?? 1;
                    const curDur = equippedDurability >= 0 ? equippedDurability : maxDur;
                    durFraction = Math.max(0, Math.min(1, curDur / maxDur));
                  }
                  return (
                    <div
                      key={slot}
                      onClick={(e) => { e.preventDefault(); if (canEquip) handleArmorSlotClick(slot, false); }}
                      onContextMenu={(e) => { e.preventDefault(); if (canEquip) handleArmorSlotClick(slot, true); }}
                      className={`w-12 h-12 flex items-center justify-center relative transition-all ${canEquip ? "hover:brightness-110 cursor-pointer" : ""}`}
                      style={{
                        imageRendering: "pixelated",
                        backgroundColor: "#8b8b8b",
                        borderTop: canEquip ? "2px solid #c6c6c6" : "2px solid #555",
                        borderLeft: canEquip ? "2px solid #c6c6c6" : "2px solid #555",
                        borderBottom: canEquip ? "2px solid #373737" : "2px solid #555",
                        borderRight: canEquip ? "2px solid #373737" : "2px solid #555",
                        boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.15)",
                      }}
                      title={equippedId !== null ? ITEMS[equippedId as ItemType]?.name ?? "Armor" : (canEquip ? `Equipar ${slot}` : slot)}
                    >
                      {equippedId !== null && (() => {
                        const icon = getIcon(equippedId as number);
                        if (!icon) return null;
                        return (
                        <>
                          <img
                            src={icon}
                            alt={ITEMS[equippedId as ItemType]?.name ?? "armor"}
                            className="w-9 h-9 relative z-10"
                            style={{
                              imageRendering: "pixelated",
                              filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))",
                            }}
                            draggable={false}
                          />
                          {/* Defense indicator */}
                          {ITEMS[equippedId as ItemType]?.defense && (
                            <span className="absolute -bottom-1 -right-1 text-[9px] text-cyan-200 font-mono font-bold px-0.5 z-20" style={{
                              backgroundColor: "rgba(0,0,0,0.7)",
                              border: "1px solid rgba(80,200,255,0.5)",
                              textShadow: "1px 1px 0 #000",
                            }}>
                              {ITEMS[equippedId as ItemType]!.defense}
                            </span>
                          )}
                          {/* Durability bar */}
                          <div className="absolute bottom-0.5 left-1 right-1 h-[3px] z-15" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
                            <div
                              className="h-full"
                              style={{
                                width: `${durFraction * 100}%`,
                                backgroundColor: durFraction > 0.5 ? "#6ade40" : durFraction > 0.2 ? "#facc15" : "#ef4444",
                              }}
                            />
                          </div>
                        </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              {/* Character model (Steve-style pixel art) */}
              <div className="w-20 h-28 mt-2 relative" style={{ imageRendering: "pixelated" }}>
                {/* Head */}
                <div className="absolute top-0 left-3 w-8 h-8 bg-[#b8845c] border-2 border-[#5a3a20]" style={{ boxShadow: "inset 2px 2px 0 #d4a378" }} />
                {/* Hair */}
                <div className="absolute top-0 left-3 w-8 h-2 bg-[#4a3020] border-t-2 border-l-2 border-r-2 border-[#5a3a20]" />
                {/* Body (green shirt) */}
                <div className="absolute top-8 left-2 w-10 h-8 bg-[#4a8a3a] border-2 border-[#2a4a1a]" style={{ boxShadow: "inset 2px 2px 0 #6aaa5a" }} />
                {/* Arms (skin) */}
                <div className="absolute top-8 left-0 w-2 h-8 bg-[#b8845c] border-2 border-[#5a3a20]" />
                <div className="absolute top-8 right-0 w-2 h-8 bg-[#b8845c] border-2 border-[#5a3a20]" />
                {/* Legs (blue pants) */}
                <div className="absolute top-16 left-3 w-3 h-6 bg-[#3a3a6a] border-2 border-[#1a1a3a]" />
                <div className="absolute top-16 left-7 w-3 h-6 bg-[#3a3a6a] border-2 border-[#1a1a3a]" />
              </div>
            </div>
          )}

          {/* Crafting area */}
          <div className="flex-shrink-0">
            <h3 className="text-[#2a2a2a] text-sm font-mono font-bold mb-2" style={{ textShadow: "1px 1px 0 #ddd" }}>Crafteo {isCraftingTable ? "(3×3)" : "(2×2)"}</h3>
            <div className="flex items-center gap-4">
              <div className="grid grid-cols-3 gap-1 p-1.5" style={{
                backgroundColor: "#373737",
                borderTop: "2px solid #1a1a1a",
                borderLeft: "2px solid #1a1a1a",
                borderBottom: "2px solid #c6c6c6",
                borderRight: "2px solid #c6c6c6",
                imageRendering: "pixelated",
              }}>
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
              <div className="text-[#2a2a2a] text-3xl font-bold">→</div>
              <div className="p-1.5" style={{
                backgroundColor: "#373737",
                borderTop: "2px solid #1a1a1a",
                borderLeft: "2px solid #1a1a1a",
                borderBottom: "2px solid #c6c6c6",
                borderRight: "2px solid #c6c6c6",
                imageRendering: "pixelated",
              }}>
                {result ? (
                  <div
                    onClick={(e) => { e.preventDefault(); handleTakeResult(e.button === 2); }}
                    onContextMenu={(e) => { e.preventDefault(); handleTakeResult(true); }}
                    className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all hover:scale-105"
                    style={{
                      imageRendering: "pixelated",
                      backgroundColor: "#8b8b8b",
                      borderTop: "2px solid #fff7a8",
                      borderLeft: "2px solid #fff7a8",
                      borderBottom: "2px solid #ffcd30",
                      borderRight: "2px solid #ffcd30",
                      boxShadow: "inset 0 0 0 1px rgba(255,247,168,0.4), 0 0 8px rgba(255,205,48,0.4)",
                    }}
                  >
                    {(() => {
                      const icon = getIcon(result.id);
                      return icon ? (
                        <img src={icon} alt={getName(result.id)} className="w-9 h-9 relative z-10" style={{
                          imageRendering: "pixelated",
                          filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))",
                        }} draggable={false} />
                      ) : null;
                    })()}
                    {result.count > 1 && (
                      <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold z-20" style={{
                        textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
                      }}>
                        {result.count}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="w-12 h-12" style={{
                    backgroundColor: "#8b8b8b",
                    borderTop: "2px solid #c6c6c6",
                    borderLeft: "2px solid #c6c6c6",
                    borderBottom: "2px solid #373737",
                    borderRight: "2px solid #373737",
                  }} />
                )}
              </div>
            </div>
            {result && (
              <p className="text-[#2a6a2a] text-xs font-mono font-bold mt-2" style={{ textShadow: "1px 1px 0 #fff" }}>
                ▶ {getName(result.id)} ×{result.count}
              </p>
            )}
          </div>

          {/* Recipe book */}
          {showRecipeBook && (
            <div className="flex-1">
              <h3 className="text-[#2a2a2a] text-sm font-mono font-bold mb-2" style={{ textShadow: "1px 1px 0 #ddd" }}>Recetas ({allRecipes.length})</h3>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 p-2 max-h-64 overflow-y-auto" style={{
                backgroundColor: "#373737",
                borderTop: "2px solid #1a1a1a",
                borderLeft: "2px solid #1a1a1a",
                borderBottom: "2px solid #c6c6c6",
                borderRight: "2px solid #c6c6c6",
                imageRendering: "pixelated",
              }}>
                {allRecipes.map((recipe, i) => {
                  const canCraft = craftableIds.has(recipe.result.id + "_" + recipe.result.count);
                  const needsTable = recipe.requiresTable && !isCraftingTable;
                  const recipeIcon = getIcon(recipe.result.id);
                  return (
                    <button
                      key={i}
                      onClick={() => canCraft && !needsTable && handleRecipeClick(recipe)}
                      className="w-12 h-12 flex items-center justify-center relative transition-all hover:brightness-110"
                      style={{
                        imageRendering: "pixelated",
                        backgroundColor: needsTable ? "#6b6b6b" : canCraft ? "#8b8b8b" : "#6b6b6b",
                        borderTop: needsTable ? "2px solid #3a5a8a" : canCraft ? "2px solid #6ade40" : "2px solid #555",
                        borderLeft: needsTable ? "2px solid #3a5a8a" : canCraft ? "2px solid #6ade40" : "2px solid #555",
                        borderBottom: needsTable ? "2px solid #1a2a4a" : canCraft ? "2px solid #2a6a2a" : "2px solid #373737",
                        borderRight: needsTable ? "2px solid #1a2a4a" : canCraft ? "2px solid #2a6a2a" : "2px solid #373737",
                        cursor: (canCraft && !needsTable) ? "pointer" : "help",
                        opacity: (!canCraft && !needsTable) ? 0.6 : 1,
                      }}
                      title={getName(recipe.result.id) + (needsTable ? " (requiere mesa)" : canCraft ? "" : " (sin materiales)")}
                    >
                      {recipeIcon ? (
                        <img src={recipeIcon} alt={getName(recipe.result.id)} className="w-9 h-9 relative z-10" style={{
                          imageRendering: "pixelated",
                          filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))",
                        }} draggable={false} />
                      ) : (
                        <span className="text-stone-500 text-xs font-mono font-bold">?</span>
                      )}
                      {canCraft && !needsTable && (
                        <span className="absolute top-0 right-0 w-2 h-2 bg-[#6ade40]" style={{ boxShadow: "0 0 4px rgba(106,222,64,0.8)" }} />
                      )}
                      {needsTable && (
                        <span className="absolute bottom-0 right-0 text-[9px] text-white font-mono font-bold px-0.5 z-20" style={{
                          backgroundColor: "#3a5a8a",
                          textShadow: "1px 1px 0 #1a2a4a",
                        }}>T</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[#3a3a3a] text-xs font-mono mt-2">
                <span className="text-[#2a6a2a] font-bold">●</span> Con materiales ·
                <span className="text-[#555]"> ●</span> Sin materiales ·
                <span className="text-[#1a3a6a] font-bold"> T</span> Requiere mesa
              </p>
            </div>
          )}
        </div>

        {/* Creative items list */}
        {isCreative && (
          <div className="mt-6">
            <h3 className="text-[#2a2a2a] text-sm font-mono font-bold mb-2" style={{ textShadow: "1px 1px 0 #ddd" }}>Todos los objetos (click para obtener 64)</h3>
            <div className="grid grid-cols-9 sm:grid-cols-12 gap-1 p-2 max-h-48 overflow-y-auto" style={{
              backgroundColor: "#373737",
              borderTop: "2px solid #1a1a1a",
              borderLeft: "2px solid #1a1a1a",
              borderBottom: "2px solid #c6c6c6",
              borderRight: "2px solid #c6c6c6",
              imageRendering: "pixelated",
            }}>
              {creativeItems.map((id) => {
                const icon = getIcon(id);
                const name = getName(id);
                if (!icon) return null;
                return (
                  <button
                    key={id}
                    onClick={() => handleCreativeItemClick(id)}
                    className="w-12 h-12 flex items-center justify-center cursor-pointer transition-all hover:scale-105"
                    style={{
                      imageRendering: "pixelated",
                      backgroundColor: "#8b8b8b",
                      borderTop: "2px solid #c6c6c6",
                      borderLeft: "2px solid #c6c6c6",
                      borderBottom: "2px solid #373737",
                      borderRight: "2px solid #373737",
                    }}
                    title={name}
                  >
                    <img src={icon} alt={name} className="w-9 h-9 relative z-10" style={{
                      imageRendering: "pixelated",
                      filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))",
                    }} draggable={false} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main inventory (27 slots) */}
        <div className="mt-6">
          <h3 className="text-[#2a2a2a] text-sm font-mono font-bold mb-2" style={{ textShadow: "1px 1px 0 #ddd" }}>Inventario</h3>
          <div className="grid grid-cols-9 gap-1 p-2" style={{
            backgroundColor: "#373737",
            borderTop: "2px solid #1a1a1a",
            borderLeft: "2px solid #1a1a1a",
            borderBottom: "2px solid #c6c6c6",
            borderRight: "2px solid #c6c6c6",
            imageRendering: "pixelated",
          }}>
            {inventory.slots.slice(HOTBAR_SIZE).map((stack, i) => (
              <div key={i}>
                {renderSlot(
                  stack,
                  (isRight) => handleSlotClick(i + HOTBAR_SIZE, isRight),
                  `inv-${i}`,
                  controllerActive && controllerZone === "main" && controllerSlot === i
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Hotbar (9 slots) */}
        <div className="mt-3">
          <h3 className="text-[#2a2a2a] text-sm font-mono font-bold mb-2" style={{ textShadow: "1px 1px 0 #ddd" }}>Hotbar</h3>
          <div className="grid grid-cols-9 gap-1 p-2" style={{
            backgroundColor: "#373737",
            borderTop: "2px solid #1a1a1a",
            borderLeft: "2px solid #1a1a1a",
            borderBottom: "2px solid #c6c6c6",
            borderRight: "2px solid #c6c6c6",
            imageRendering: "pixelated",
          }}>
            {inventory.slots.slice(0, HOTBAR_SIZE).map((stack, i) => (
              <div key={i}>
                {renderSlot(
                  stack,
                  (isRight) => handleSlotClick(i, isRight),
                  `hot-${i}`,
                  i === inventory.selectedHotbar || (controllerActive && controllerZone === "hotbar" && controllerSlot === i)
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Held item following cursor */}
        {heldItem && (
          <div
            className="fixed pointer-events-none z-[60]"
            style={{ left: mousePos.x, top: mousePos.y, transform: "translate(-50%, -50%)" }}
          >
            <div className="w-12 h-12 flex items-center justify-center relative" style={{
              imageRendering: "pixelated",
              backgroundColor: "rgba(139,139,139,0.95)",
              borderTop: "2px solid #fff7a8",
              borderLeft: "2px solid #fff7a8",
              borderBottom: "2px solid #ffcd30",
              borderRight: "2px solid #ffcd30",
              boxShadow: "0 0 12px rgba(255,205,48,0.6)",
            }}>
              {(() => {
                const icon = getIcon(heldItem.id);
                return icon ? (
                  <img src={icon} alt="" className="w-9 h-9 relative z-10" style={{
                    imageRendering: "pixelated",
                    filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))",
                  }} draggable={false} />
                ) : null;
              })()}
              {heldItem.count > 1 && (
                <span className="absolute bottom-0 right-1 text-white text-xs font-mono font-bold z-20" style={{
                  textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
                }}>
                  {heldItem.count}
                </span>
              )}
            </div>
          </div>
        )}

        <p className="text-[#3a3a3a] text-xs font-mono mt-4 text-center pb-2" style={{ textShadow: "1px 1px 0 #ddd" }}>
          <span className="text-[#2a6a2a] font-bold">Click izq</span>: recoger/colocar todo ·
          <span className="text-[#2a6a2a] font-bold"> Click der</span>: recoger mitad/colocar 1 ·
          <span className="text-[#2a6a2a] font-bold"> Click en resultado</span>: craftear
        </p>
        {controllerActive && (
          <p className="text-[#3a5a8a] text-xs font-mono text-center pb-2" style={{ textShadow: "1px 1px 0 #ddd" }}>
            🎮 D-Pad: mover cursor · A: click izq · X: click der · B/Y: cerrar · Zona: {controllerZone} #{controllerSlot}
          </p>
        )}
      </div>
    </div>
  );
}
