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

// ============================================================================
// Controller button bindings — same actions as keyboard but for gamepad.
// Each value is a gamepad button index (0-15) or special string for sticks.
// ============================================================================

export interface ControllerBindings {
  jump: number;       // default: A (0)
  interact: number;   // default: LT (6) — place/interact/eat/use bucket
  inventory: number;  // default: Y (3)
  mine: number;       // default: RT (7)
  descend: number;    // default: RS click (11)
  sprint: number;     // default: LS click (10)
  dragonMount: number;// default: B (1)
  dragonStay: number; // default: Back (8)
  pause: number;      // default: Start (9)
}

export const DEFAULT_CONTROLLER_BINDINGS: ControllerBindings = {
  jump: 0,        // A
  interact: 6,    // LT
  inventory: 3,   // Y
  mine: 7,        // RT
  descend: 11,    // RS click
  sprint: 10,     // LS click
  dragonMount: 1, // B
  dragonStay: 8,  // Back
  pause: 9,       // Start
};

const CTRL_STORAGE_KEY = "worldbind_controller_bindings";

export function loadControllerBindings(): ControllerBindings {
  try {
    const saved = localStorage.getItem(CTRL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_CONTROLLER_BINDINGS, ...parsed };
    }
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_CONTROLLER_BINDINGS };
}

export function saveControllerBindings(bindings: ControllerBindings) {
  try {
    localStorage.setItem(CTRL_STORAGE_KEY, JSON.stringify(bindings));
  } catch (e) { /* ignore */ }
}

export function resetControllerBindings(): ControllerBindings {
  try {
    localStorage.removeItem(CTRL_STORAGE_KEY);
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_CONTROLLER_BINDINGS };
}

/** Convert a gamepad button index to a human-readable label. */
export function ctrlButtonToLabel(btn: number): string {
  const labels: Record<number, string> = {
    0: "A", 1: "B", 2: "X", 3: "Y",
    4: "LB", 5: "RB", 6: "LT", 7: "RT",
    8: "Back", 9: "Start", 10: "LS", 11: "RS",
    12: "D-Up", 13: "D-Down", 14: "D-Left", 15: "D-Right",
  };
  return labels[btn] ?? `Btn ${btn}`;
}

export const CTRL_BINDING_LABELS: Record<keyof ControllerBindings, string> = {
  jump: "Jump",
  interact: "Place / Interact / Eat",
  inventory: "Open Inventory",
  mine: "Mine / Attack",
  descend: "Descend (Creative)",
  sprint: "Sprint",
  dragonMount: "Mount / Dismount Dragon",
  dragonStay: "Dragon Wait / Follow",
  pause: "Pause / Resume",
};
