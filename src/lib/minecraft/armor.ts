// Armor equip system: the player has 4 armor slots (helmet, chestplate, leggings, boots).
// Equipped armor reduces incoming damage based on the sum of `defense` values.
// Minecraft formula (simplified): damageReduction = defense / (defense + 25) — we use this.
// Armor also has durability: each piece loses durability when absorbing damage.
import { ItemType, ITEMS, ArmorType } from "./items";

export interface ArmorSlot {
  itemId: ItemType | null;
  durability: number; // remaining durability; -1 means full (will be initialized on equip)
}

export interface ArmorSlots {
  helmet: ArmorSlot;
  chestplate: ArmorSlot;
  leggings: ArmorSlot;
  boots: ArmorSlot;
}

export function emptyArmor(): ArmorSlots {
  return {
    helmet: { itemId: null, durability: -1 },
    chestplate: { itemId: null, durability: -1 },
    leggings: { itemId: null, durability: -1 },
    boots: { itemId: null, durability: -1 },
  };
}

// Get the armor slot for an item id, or null if it's not armor
export function getArmorSlot(id: number): ArmorType | null {
  if (id < 100) return null;
  const def = ITEMS[id as ItemType];
  return def?.armorType ?? null;
}

// Get the equipped item id from an armor slot (or null)
function slotItemId(slot: ArmorSlot): ItemType | null {
  return slot.itemId;
}

// Sum of defense values of all equipped armor pieces
export function totalDefense(armor: ArmorSlots): number {
  let total = 0;
  for (const slot of [armor.helmet, armor.chestplate, armor.leggings, armor.boots]) {
    const id = slotItemId(slot);
    if (id !== null) {
      const def = ITEMS[id];
      if (def?.defense) total += def.defense;
    }
  }
  return total;
}

// Apply armor reduction to incoming damage.
// Returns the reduced damage amount. Uses Minecraft's formula:
// effectiveDamage = rawDamage * (1 - defense / (defense + 25))
export function applyArmorReduction(rawDamage: number, armor: ArmorSlots): number {
  const def = totalDefense(armor);
  if (def <= 0) return rawDamage;
  const reduction = def / (def + 25);
  return Math.max(0, rawDamage * (1 - reduction));
}

// Equip an item into the appropriate armor slot.
// Returns { equipped: newArmorSlots, swapped: previous item (or null) }
// The equipped piece starts at full durability.
export function equipArmor(armor: ArmorSlots, itemId: ItemType): { armor: ArmorSlots; swapped: ItemType | null } {
  const slot = getArmorSlot(itemId);
  if (!slot) return { armor, swapped: null };
  const currentSlot = armor[slot];
  const swapped = currentSlot.itemId;
  const def = ITEMS[itemId];
  const maxDurability = def?.maxDurability ?? 1;
  return {
    armor: {
      ...armor,
      [slot]: { itemId, durability: maxDurability },
    },
    swapped,
  };
}

// Reduce armor durability when the player takes damage.
// Each equipped piece loses 1 durability per damage event (simplified).
// Pieces that reach 0 durability are removed.
// Returns the new armor state.
export function damageArmor(armor: ArmorSlots, rawDamage: number): ArmorSlots {
  const newArmor: ArmorSlots = {
    helmet: { ...armor.helmet },
    chestplate: { ...armor.chestplate },
    leggings: { ...armor.leggings },
    boots: { ...armor.boots },
  };
  // Damage is distributed across all equipped pieces (each loses 1 durability per hit)
  // Minecraft uses a more complex formula based on damage amount, but for simplicity:
  // - Each piece loses 1 durability per hit if it's equipped.
  for (const slotName of ["helmet", "chestplate", "leggings", "boots"] as const) {
    const slot = newArmor[slotName];
    if (slot.itemId === null) continue;
    const def = ITEMS[slot.itemId];
    if (!def?.maxDurability) continue;
    // Initialize durability if not set
    if (slot.durability < 0 || slot.durability === undefined) {
      slot.durability = def.maxDurability;
    }
    slot.durability -= 1;
    if (slot.durability <= 0) {
      // Piece is destroyed
      slot.itemId = null;
      slot.durability = -1;
    }
  }
  return newArmor;
}

// Serialize armor slots for save: returns [helmetId, chestId, legsId, bootsId, helmetDur, chestDur, legsDur, bootsDur]
export function serializeArmor(armor: ArmorSlots): number[] {
  return [
    armor.helmet.itemId ?? -1,
    armor.chestplate.itemId ?? -1,
    armor.leggings.itemId ?? -1,
    armor.boots.itemId ?? -1,
    armor.helmet.durability,
    armor.chestplate.durability,
    armor.leggings.durability,
    armor.boots.durability,
  ];
}

// Deserialize armor slots from save
export function deserializeArmor(data: number[] | null): ArmorSlots {
  if (!data || data.length < 4) return emptyArmor();
  const norm = (v: number): ItemType | null => (v >= 0 ? (v as ItemType) : null);
  const dur = (i: number): number => (data.length > i + 4 ? data[i + 4] : -1);
  return {
    helmet: { itemId: norm(data[0]), durability: dur(0) },
    chestplate: { itemId: norm(data[1]), durability: dur(1) },
    leggings: { itemId: norm(data[2]), durability: dur(2) },
    boots: { itemId: norm(data[3]), durability: dur(3) },
  };
}

