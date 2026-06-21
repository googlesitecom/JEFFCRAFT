// Inventory system with stacks + durability per item
import { ItemType, getMaxStack, ITEMS } from "./items";
import { BlockType } from "./blocks";

export interface ItemStack {
  id: number; // BlockType or ItemType
  count: number;
  // Durability: remaining uses for tools/armor. undefined = full durability (or item has no durability).
  // When durability reaches 0, the item is destroyed (slot becomes null).
  durability?: number;
}

export const INVENTORY_SIZE = 27; // main inventory
export const HOTBAR_SIZE = 9;

// Returns the max durability for an item, or undefined if it has none.
export function getMaxDurability(id: number): number | undefined {
  if (id < 100) return undefined; // blocks don't have durability
  const def = ITEMS[id as ItemType];
  return def?.maxDurability;
}

// Initialize a fresh item's durability when it enters the inventory.
// If the item already has durability set, leave it alone.
function ensureDurability(stack: ItemStack): ItemStack {
  if (stack.durability !== undefined) return stack;
  const max = getMaxDurability(stack.id);
  if (max !== undefined) {
    stack.durability = max;
  }
  return stack;
}

export class Inventory {
  // 36 slots: 0-8 = hotbar, 9-35 = main inventory
  slots: (ItemStack | null)[];
  selectedHotbar: number = 0;

  constructor() {
    this.slots = new Array(HOTBAR_SIZE + INVENTORY_SIZE).fill(null);
  }

  // Get the currently selected hotbar item
  getSelected(): ItemStack | null {
    return this.slots[this.selectedHotbar];
  }

  setSelected(slot: number) {
    if (slot >= 0 && slot < HOTBAR_SIZE) {
      this.selectedHotbar = slot;
    }
  }

  // Add an item to the inventory. Returns leftover count that didn't fit.
  // For tools/armor (maxStack=1), each new item gets fresh durability.
  addItem(id: number, count: number = 1, durability?: number): number {
    if (count <= 0) return 0;
    const maxStack = getMaxStack(id);

    // For tools/armor (maxStack=1), each item is its own stack.
    if (maxStack === 1) {
      for (let i = 0; i < count; i++) {
        // Find the first empty slot
        let placed = false;
        for (let j = 0; j < this.slots.length; j++) {
          if (!this.slots[j]) {
            const stack: ItemStack = { id, count: 1 };
            const max = getMaxDurability(id);
            if (max !== undefined) {
              stack.durability = durability ?? max;
            }
            this.slots[j] = stack;
            placed = true;
            break;
          }
        }
        if (!placed) {
          // No space for remaining items
          return count - i;
        }
      }
      return 0;
    }

    // Regular stackable items (blocks, food, materials)
    // First, try to stack onto existing slots (only matching id and ignoring durability since these have none)
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === id && slot.count < maxStack) {
        const space = maxStack - slot.count;
        const add = Math.min(space, count);
        slot.count += add;
        count -= add;
      }
    }

    // Then, fill empty slots (hotbar first, then main)
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(maxStack, count);
        this.slots[i] = { id, count: add };
        count -= add;
      }
    }

    return count; // leftover
  }

  // Remove items from a specific slot
  removeFromSlot(slot: number, count: number = 1): boolean {
    const s = this.slots[slot];
    if (!s || s.count < count) return false;
    s.count -= count;
    if (s.count <= 0) this.slots[slot] = null;
    return true;
  }

  // Remove the currently selected hotbar item
  removeSelected(count: number = 1): boolean {
    return this.removeFromSlot(this.selectedHotbar, count);
  }

  // Apply 1 durability damage to a specific slot's tool/armor.
  // If the item's durability reaches 0, the item is destroyed.
  // Returns true if the item was destroyed.
  damageItem(slot: number, amount: number = 1): boolean {
    const s = this.slots[slot];
    if (!s) return false;
    const max = getMaxDurability(s.id);
    if (max === undefined) return false; // not a damageable item
    if (s.durability === undefined) s.durability = max;
    s.durability -= amount;
    if (s.durability <= 0) {
      this.slots[slot] = null;
      return true;
    }
    return false;
  }

  // Apply durability damage to the currently selected hotbar item.
  damageSelected(amount: number = 1): boolean {
    return this.damageItem(this.selectedHotbar, amount);
  }

  // Swap two slots (for dragging items in UI)
  swapSlots(a: number, b: number) {
    const tmp = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = tmp;
  }

  // Set a slot directly (used by UI)
  setSlot(slot: number, stack: ItemStack | null) {
    if (stack) ensureDurability(stack);
    this.slots[slot] = stack;
  }

  // Add to an existing slot's count (for merging in UI)
  addToSlot(slot: number, count: number) {
    const s = this.slots[slot];
    if (s) {
      s.count += count;
      if (s.count <= 0) this.slots[slot] = null;
    }
  }

  // Subtract from a slot's count (for splitting in UI)
  subtractFromSlot(slot: number, count: number): number {
    const s = this.slots[slot];
    if (!s) return 0;
    const removed = Math.min(count, s.count);
    s.count -= removed;
    if (s.count <= 0) this.slots[slot] = null;
    return removed;
  }

  // Count total items of a specific id
  countItem(id: number): number {
    let total = 0;
    for (const s of this.slots) {
      if (s && s.id === id) total += s.count;
    }
    return total;
  }

  // Clear all slots
  clear() {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i] = null;
    }
  }

  // Serialize for save (includes durability)
  serialize(): { id: number; count: number; durability?: number }[] {
    return this.slots.map((s) => {
      if (!s) return { id: -1, count: 0 };
      if (s.durability !== undefined) {
        return { id: s.id, count: s.count, durability: s.durability };
      }
      return { id: s.id, count: s.count };
    });
  }

  deserialize(data: { id: number; count: number; durability?: number }[]) {
    for (let i = 0; i < this.slots.length && i < data.length; i++) {
      const d = data[i];
      if (d.id < 0 || d.count <= 0) {
        this.slots[i] = null;
      } else {
        const stack: ItemStack = { id: d.id, count: d.count };
        if (d.durability !== undefined) {
          stack.durability = d.durability;
        } else {
          // Backwards compat: old saves without durability → fresh item
          ensureDurability(stack);
        }
        this.slots[i] = stack;
      }
    }
  }
}
