"use client";

import { useState, useEffect } from "react";
import { Inventory, HOTBAR_SIZE } from "@/lib/minecraft/inventory";
import { BlockType, BLOCKS } from "@/lib/minecraft/blocks";
import { ItemType, ITEMS, isItem } from "@/lib/minecraft/items";

interface FurnaceUIProps {
  inventory: Inventory;
  iconUrls: Record<string, string>;
  onClose: () => void;
  onInventoryChange: () => void;
}

// Smelting recipes: input -> output
const SMELTING_RECIPES: Record<number, number> = {
  [ItemType.RawPorkchop]: ItemType.CookedPorkchop,
  [ItemType.RawBeef]: ItemType.CookedBeef,
  [ItemType.RawChicken]: ItemType.CookedChicken,
  // Ore smelting (bonus)
  [BlockType.IronOre]: ItemType.IronIngot,
  [BlockType.GoldOre]: ItemType.GoldIngot,
  [BlockType.Sand]: BlockType.Glass,
};

// Fuels: how many items each fuel can smelt
const FUELS: Record<number, number> = {
  [BlockType.Wood]: 1.5, // 1.5 items per log
  [BlockType.Planks]: 1.5,
  [BlockType.CraftingTable]: 1.5,
  [BlockType.CoalOre]: 0,
  [ItemType.Coal]: 8, // 8 items per coal
  [ItemType.Charcoal]: 8,
  [BlockType.Leaves]: 0.2,
};

export function FurnaceUI({
  inventory,
  iconUrls,
  onClose,
  onInventoryChange,
}: FurnaceUIProps) {
  // Input slot (what to smelt)
  const [inputSlot, setInputSlot] = useState<{ id: number; count: number } | null>(null);
  // Fuel slot
  const [fuelSlot, setFuelSlot] = useState<{ id: number; count: number } | null>(null);
  // Output slot (smelted result)
  const [outputSlot, setOutputSlot] = useState<{ id: number; count: number } | null>(null);
  // Smelting progress (0-1)
  const [smeltProgress, setSmeltProgress] = useState(0);
  // Fuel burn time remaining (0-1)
  const [fuelProgress, setFuelProgress] = useState(0);
  // Held item (for drag/drop)
  const [heldItem, setHeldItem] = useState<{ id: number; count: number } | null>(null);
  const [, forceUpdate] = useState(0);
  const refresh = () => forceUpdate((v) => v + 1);

  // Smelting tick
  useEffect(() => {
    const interval = setInterval(() => {
      // Check if we can smelt
      if (inputSlot && SMELTING_RECIPES[inputSlot.id] !== undefined) {
        const outputId = SMELTING_RECIPES[inputSlot.id];
        // Check output slot can accept
        if (outputSlot && (outputSlot.id !== outputId || outputSlot.count >= 64)) {
          return;
        }

        // Need fuel
        if (fuelProgress <= 0) {
          // Consume fuel
          if (fuelSlot && FUELS[fuelSlot.id] !== undefined) {
            const fuelValue = FUELS[fuelSlot.id];
            setFuelProgress(fuelValue);
            // Consume 1 fuel
            if (fuelSlot.count > 1) {
              setFuelSlot({ id: fuelSlot.id, count: fuelSlot.count - 1 });
            } else {
              setFuelSlot(null);
            }
          } else {
            return; // no fuel
          }
        }

        // Burn fuel
        setFuelProgress((p) => Math.max(0, p - 0.05));
        setSmeltProgress((p) => {
          const newP = p + 0.05;
          if (newP >= 1) {
            // Smelt complete
            const outputId = SMELTING_RECIPES[inputSlot.id];
            setInputSlot((inp) => {
              if (!inp) return null;
              if (inp.count > 1) return { id: inp.id, count: inp.count - 1 };
              return null;
            });
            setOutputSlot((out) => {
              if (!out) return { id: outputId, count: 1 };
              return { id: outputId, count: out.count + 1 };
            });
            return 0;
          }
          return newP;
        });
      } else {
        // Not smelting - slowly lose fuel progress (no, fuel stays)
        // Reset smelt progress if no input
        if (smeltProgress > 0 && (!inputSlot || SMELTING_RECIPES[inputSlot.id] === undefined)) {
          setSmeltProgress(0);
        }
      }
    }, 100); // tick every 100ms
    return () => clearInterval(interval);
  }, [inputSlot, fuelSlot, outputSlot, fuelProgress, smeltProgress]);

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

  // Click handler for inventory slots
  const handleSlotClick = (slot: number, isRight: boolean) => {
    const current = inventory.slots[slot];
    if (heldItem === null) {
      if (current) {
        if (isRight) {
          const half = Math.ceil(current.count / 2);
          const remaining = current.count - half;
          setHeldItem({ id: current.id, count: half });
          if (remaining > 0) inventory.setSlot(slot, { id: current.id, count: remaining });
          else inventory.setSlot(slot, null);
        } else {
          setHeldItem({ id: current.id, count: current.count });
          inventory.setSlot(slot, null);
        }
        onInventoryChange();
        refresh();
      }
    } else {
      if (current && current.id === heldItem.id) {
        const max = isItem(current.id) ? (ITEMS[current.id as ItemType]?.maxStack ?? 64) : 64;
        const space = max - current.count;
        const add = Math.min(space, heldItem.count);
        if (add > 0) {
          inventory.setSlot(slot, { id: current.id, count: current.count + add });
          setHeldItem(heldItem.count - add > 0 ? { id: heldItem.id, count: heldItem.count - add } : null);
          onInventoryChange();
          refresh();
        }
      } else if (!current) {
        if (isRight) {
          inventory.setSlot(slot, { id: heldItem.id, count: 1 });
          setHeldItem(heldItem.count - 1 > 0 ? { id: heldItem.id, count: heldItem.count - 1 } : null);
        } else {
          inventory.setSlot(slot, { id: heldItem.id, count: heldItem.count });
          setHeldItem(null);
        }
        onInventoryChange();
        refresh();
      } else if (!isRight) {
        const oldCurrent = { id: current.id, count: current.count };
        inventory.setSlot(slot, { id: heldItem.id, count: heldItem.count });
        setHeldItem(oldCurrent);
        onInventoryChange();
        refresh();
      }
    }
  };

  // Click handler for furnace slots (input, fuel, output)
  const handleFurnaceSlotClick = (
    slot: "input" | "fuel" | "output",
    isRight: boolean
  ) => {
    const getCurrent = () => {
      if (slot === "input") return inputSlot;
      if (slot === "fuel") return fuelSlot;
      return outputSlot;
    };
    const setCurrent = (val: { id: number; count: number } | null) => {
      if (slot === "input") setInputSlot(val);
      else if (slot === "fuel") setFuelSlot(val);
      else setOutputSlot(val);
    };

    const current = getCurrent();

    if (slot === "output") {
      // Output: can only take, not place
      if (current && heldItem === null) {
        setHeldItem({ id: current.id, count: current.count });
        setCurrent(null);
        refresh();
      } else if (current && heldItem && heldItem.id === current.id && heldItem.count + current.count <= 64) {
        setHeldItem({ id: heldItem.id, count: heldItem.count + current.count });
        setCurrent(null);
        refresh();
      }
      return;
    }

    if (heldItem === null) {
      if (current) {
        if (isRight) {
          const half = Math.ceil(current.count / 2);
          const remaining = current.count - half;
          setHeldItem({ id: current.id, count: half });
          setCurrent(remaining > 0 ? { id: current.id, count: remaining } : null);
        } else {
          setHeldItem({ id: current.id, count: current.count });
          setCurrent(null);
        }
        refresh();
      }
    } else {
      if (current && current.id === heldItem.id) {
        const space = 64 - current.count;
        const add = Math.min(space, heldItem.count);
        if (add > 0) {
          setCurrent({ id: current.id, count: current.count + add });
          setHeldItem(heldItem.count - add > 0 ? { id: heldItem.id, count: heldItem.count - add } : null);
          refresh();
        }
      } else if (!current) {
        if (isRight) {
          setCurrent({ id: heldItem.id, count: 1 });
          setHeldItem(heldItem.count - 1 > 0 ? { id: heldItem.id, count: heldItem.count - 1 } : null);
        } else {
          setCurrent({ id: heldItem.id, count: heldItem.count });
          setHeldItem(null);
        }
        refresh();
      } else if (!isRight) {
        const oldCurrent = { id: current.id, count: current.count };
        setCurrent({ id: heldItem.id, count: heldItem.count });
        setHeldItem(oldCurrent);
        refresh();
      }
    }
  };

  // Track mouse position for held item cursor
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  const renderSlot = (
    stack: { id: number; count: number } | null,
    onClick: (isRight: boolean) => void,
    key: string,
    highlight?: boolean
  ) => {
    return (
      <div
        key={key}
        onClick={(e) => { e.preventDefault(); onClick(false); }}
        onContextMenu={(e) => { e.preventDefault(); onClick(true); }}
        className={`w-12 h-12 border-2 flex items-center justify-center relative cursor-pointer hover:bg-white/10 ${
          highlight ? "border-yellow-400" : "border-stone-600"
        } bg-stone-800/80`}
        style={{ imageRendering: "pixelated" }}
      >
        {stack && (
          <>
            <img src={getIcon(stack.id)} alt={getName(stack.id)} className="w-10 h-10" style={{ imageRendering: "pixelated" }} draggable={false} />
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
        className="bg-stone-900/95 border-4 border-stone-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white font-mono">Horno</h2>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-stone-700 hover:bg-stone-600 border-2 border-stone-500 text-white text-sm font-mono rounded"
          >
            ✕ Cerrar
          </button>
        </div>

        {/* Furnace UI */}
        <div className="flex items-center justify-center gap-4 mb-6 py-4 bg-stone-800/60 rounded">
          {/* Input */}
          <div className="flex flex-col items-center">
            {renderSlot(inputSlot, (isRight) => handleFurnaceSlotClick("input", isRight), "input")}
            <span className="text-white/60 text-xs font-mono mt-1">Entrada</span>
          </div>

          {/* Flame indicator */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-12 border-2 border-stone-600 bg-stone-900 rounded relative overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-orange-600 to-yellow-400 transition-all"
                style={{ height: `${fuelProgress * 100}%` }}
              />
            </div>
            <span className="text-white/60 text-xs font-mono mt-1">Combustible</span>
          </div>

          {/* Fuel */}
          <div className="flex flex-col items-center">
            {renderSlot(fuelSlot, (isRight) => handleFurnaceSlotClick("fuel", isRight), "fuel")}
            <span className="text-white/60 text-xs font-mono mt-1">Fuel</span>
          </div>

          {/* Arrow with progress */}
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 flex items-center justify-center relative">
              <div className="text-white text-2xl">→</div>
              {/* Progress bar */}
              <div className="absolute -bottom-2 left-0 right-0 h-1 bg-stone-700 rounded">
                <div
                  className="h-full bg-yellow-400 transition-all"
                  style={{ width: `${smeltProgress * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Output */}
          <div className="flex flex-col items-center">
            {renderSlot(outputSlot, (isRight) => handleFurnaceSlotClick("output", isRight), "output", true)}
            <span className="text-white/60 text-xs font-mono mt-1">Salida</span>
          </div>
        </div>

        {/* Status text */}
        <div className="text-center mb-4 text-stone-400 text-xs font-mono">
          {inputSlot && SMELTING_RECIPES[inputSlot.id] !== undefined ? (
            fuelSlot || fuelProgress > 0 ? (
              smeltProgress > 0 ? "Cociendo..." : "Esperando combustible..."
            ) : "Necesita combustible (carbón, madera)"
          ) : inputSlot ? (
            `${getName(inputSlot.id)} no se puede cocer`
          ) : (
            "Coloca comida cruda o minerales en la entrada"
          )}
        </div>

        {/* Main inventory */}
        <div>
          <h3 className="text-white text-sm font-mono mb-2">Inventario</h3>
          <div className="grid grid-cols-9 gap-1 p-2 bg-stone-800/60 rounded">
            {inventory.slots.slice(HOTBAR_SIZE).map((stack, i) => (
              <div key={i}>
                {renderSlot(stack, (isRight) => handleSlotClick(i + HOTBAR_SIZE, isRight), `inv-${i}`)}
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
                {renderSlot(stack, (isRight) => handleSlotClick(i, isRight), `hot-${i}`, i === inventory.selectedHotbar)}
              </div>
            ))}
          </div>
        </div>

        {/* Held item */}
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
          Combustibles: <span className="text-yellow-400">Carbón</span> (8 items), 
          <span className="text-yellow-400"> Madera/Tablones</span> (1.5 items) · 
          Cocina: carne cruda, minerales
        </p>
      </div>
    </div>
  );
}
