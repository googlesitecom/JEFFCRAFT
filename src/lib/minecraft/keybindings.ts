/**
 * Customizable keybinding system — like Minecraft's Controls menu.
 *
 * Default bindings match the current hardcoded values. The user can rebind
 * any action by clicking the key in the Controls panel and pressing a new key.
 * Bindings persist in localStorage.
 */

export interface KeyBindings {
  forward: string;
  backward: string;
  left: string;
  right: string;
  jump: string;
  sprint: string;
  descend: string; // fly down in creative
  inventory: string;
  craft: string; // right-click action (place/interact/eat)
  mine: string; // left-click (break/attack) — mouse button, not keyboard
  pause: string;
  chat: string;
  toggleFly: string;
  dragonMount: string;
  dragonStay: string;
}

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  forward: "KeyW",
  backward: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  sprint: "ShiftLeft",
  descend: "ControlLeft",
  inventory: "KeyE",
  craft: "KeyM",
  mine: "Mouse0", // left mouse button
  pause: "Escape",
  chat: "KeyT",
  toggleFly: "KeyF",
  dragonMount: "KeyN",
  dragonStay: "KeyB",
};

const STORAGE_KEY = "worldbind_keybindings";

export function loadKeyBindings(): KeyBindings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_KEYBINDINGS, ...parsed };
    }
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_KEYBINDINGS };
}

export function saveKeyBindings(bindings: KeyBindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch (e) { /* ignore */ }
}

export function resetKeyBindings(): KeyBindings {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_KEYBINDINGS };
}

/**
 * Convert a KeyboardEvent.code or mouse button to a human-readable label.
 */
export function keyToLabel(key: string): string {
  if (key.startsWith("Key")) return key.slice(3);
  if (key.startsWith("Digit")) return key.slice(5);
  if (key === "Space") return "Space";
  if (key === "ShiftLeft") return "L-Shift";
  if (key === "ShiftRight") return "R-Shift";
  if (key === "ControlLeft") return "L-Ctrl";
  if (key === "ControlRight") return "R-Ctrl";
  if (key === "Tab") return "Tab";
  if (key === "Escape") return "Esc";
  if (key === "Enter") return "Enter";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key === "Mouse0") return "L-Click";
  if (key === "Mouse1") return "M-Click";
  if (key === "Mouse2") return "R-Click";
  return key;
}

export const BINDING_LABELS: Record<keyof KeyBindings, string> = {
  forward: "Move Forward",
  backward: "Move Backward",
  left: "Strafe Left",
  right: "Strafe Right",
  jump: "Jump",
  sprint: "Sprint",
  descend: "Descend (Creative)",
  inventory: "Open Inventory",
  craft: "Use / Place / Interact",
  mine: "Mine / Attack",
  pause: "Pause Menu",
  chat: "Open Chat",
  toggleFly: "Toggle Flight",
  dragonMount: "Mount / Dismount Dragon",
  dragonStay: "Dragon Wait / Follow",
};
