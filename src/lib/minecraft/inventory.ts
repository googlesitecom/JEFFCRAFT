// Inventory system with stacks
import { ItemType, getMaxStack } from "./items";
import { BlockType } from "./blocks";

export interface ItemStack {
  id: number; // BlockType or ItemType
  count: number;
}

export const INVENTORY_SIZE = 27; // main inventory
export const HOTBAR_SIZE = 9;

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
  addItem(id: number, count: number = 1): number {
    if (count <= 0) return 0;
    const maxStack = getMaxStack(id);

    // First, try to stack onto existing slots
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

  // Swap two slots (for dragging items in UI)
  swapSlots(a: number, b: number) {
    const tmp = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = tmp;
  }

  // Set a slot directly (used by UI)
  setSlot(slot: number, stack: ItemStack | null) {
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

  // Serialize for save
  serialize(): { id: number; count: number }[] {
    return this.slots.map((s) => (s ? { id: s.id, count: s.count } : { id: -1, count: 0 }));
  }

  deserialize(data: { id: number; count: number }[]) {
    for (let i = 0; i < this.slots.length && i < data.length; i++) {
      const d = data[i];
      if (d.id < 0 || d.count <= 0) {
        this.slots[i] = null;
      } else {
        this.slots[i] = { id: d.id, count: d.count };
      }
    }
  }
}
