// Armor equip system: the player has 4 armor slots (helmet, chestplate, leggings, boots).
// Equipped armor reduces incoming damage based on the sum of `defense` values.
// Minecraft formula (simplified): damageReduction = defense / (defense + 25) — we use this.
import { ItemType, ITEMS, ArmorType } from "./items";

export interface ArmorSlots {
  helmet: ItemType | null;
  chestplate: ItemType | null;
  leggings: ItemType | null;
  boots: ItemType | null;
}

export function emptyArmor(): ArmorSlots {
  return { helmet: null, chestplate: null, leggings: null, boots: null };
}

// Get the armor slot for an item id, or null if it's not armor
export function getArmorSlot(id: number): ArmorType | null {
  if (id < 100) return null;
  const def = ITEMS[id as ItemType];
  return def?.armorType ?? null;
}

// Sum of defense values of all equipped armor pieces
export function totalDefense(armor: ArmorSlots): number {
  let total = 0;
  for (const slot of [armor.helmet, armor.chestplate, armor.leggings, armor.boots]) {
    if (slot !== null) {
      const def = ITEMS[slot];
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
export function equipArmor(armor: ArmorSlots, itemId: ItemType): { armor: ArmorSlots; swapped: ItemType | null } {
  const slot = getArmorSlot(itemId);
  if (!slot) return { armor, swapped: null };
  const swapped = armor[slot];
  return {
    armor: { ...armor, [slot]: itemId },
    swapped,
  };
}

// Serialize armor slots for save
export function serializeArmor(armor: ArmorSlots): number[] {
  return [armor.helmet ?? -1, armor.chestplate ?? -1, armor.leggings ?? -1, armor.boots ?? -1];
}

// Deserialize armor slots from save
export function deserializeArmor(data: number[] | null): ArmorSlots {
  if (!data || data.length < 4) return emptyArmor();
  const norm = (v: number): ItemType | null => (v >= 0 ? (v as ItemType) : null);
  return {
    helmet: norm(data[0]),
    chestplate: norm(data[1]),
    leggings: norm(data[2]),
    boots: norm(data[3]),
  };
}
