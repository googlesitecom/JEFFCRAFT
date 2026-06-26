// Xbox controller support for Minecraft clone.
// Auto-detects controller connection. Polls every frame when active.
// Works completely without mouse/keyboard — no pointer lock needed.
//
// Edge detection is per-call (labelled) so the same button can be checked by
// multiple consumers in the same frame without one swallowing the event.

export type InputMode = "keyboard" | "controller";

export interface GamepadState {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  lb: boolean;
  rb: boolean;
  lt: boolean;
  rt: boolean;
  back: boolean;
  start: boolean;
  ls: boolean;
  rs: boolean;
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
}

// === Observer pattern for connect/disconnect ===
// Allows React components to subscribe and re-render when the controller state
// changes (for showing toasts, updating the HUD indicator, etc.)
type ConnectionListener = (connected: boolean, gamepadId: string) => void;
const connectionListeners = new Set<ConnectionListener>();

export function onGamepadConnectionChange(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

let connectedGamepadId: string | null = null;

function notifyConnection(connected: boolean, id: string) {
  connectedGamepadId = connected ? id : null;
  connectionListeners.forEach((l) => {
    try { l(connected, id); } catch (e) { console.error("gamepad listener error", e); }
  });
}

// Listen for gamepad connection/disconnection — fires the observer chain
if (typeof window !== "undefined") {
  window.addEventListener("gamepadconnected", (e: GamepadEvent) => {
    console.log("Gamepad connected:", e.gamepad.id);
    notifyConnection(true, e.gamepad.id);
  });
  window.addEventListener("gamepaddisconnected", (e: GamepadEvent) => {
    console.log("Gamepad disconnected:", e.gamepad.id);
    // Only notify if the disconnected pad was the active one
    if (connectedGamepadId === e.gamepad.id || !isGamepadConnected()) {
      notifyConnection(false, e.gamepad.id);
    }
  });
}

// === Edge detection ===
// Per-label state: each consumer passes a unique `label` so that multiple
// wasButtonPressed() calls for the same button in one frame all see the
// correct rising edge (instead of the first call swallowing it).
//
// Layout: Map<label, Map<buttonId, wasPressedLastFrame>>
const edgeState = new Map<string, Map<number, boolean>>();

function wasJustPressedLabelled(label: string, buttonId: number, current: boolean): boolean {
  let m = edgeState.get(label);
  if (!m) { m = new Map(); edgeState.set(label, m); }
  const prev = m.get(buttonId) || false;
  m.set(buttonId, current);
  return current && !prev;
}

// Legacy map — kept for backwards compat with the existing `wasButtonPressed`
// calls in MinecraftGame.tsx (single-call per button per frame).
const prevButtonStates: Map<number, boolean> = new Map();
function wasJustPressed(current: boolean, id: number): boolean {
  const prev = prevButtonStates.get(id) || false;
  prevButtonStates.set(id, current);
  return current && !prev;
}

export function readGamepad(index: number = 0): GamepadState | null {
  // navigator.getGamepads() must be called every frame to get fresh data
  const pads = navigator.getGamepads();
  if (!pads) return null;
  const pad = pads[index];
  if (!pad || !pad.connected) return null;

  const deadzone = 0.2;
  const applyDeadzone = (v: number): number => {
    const abs = Math.abs(v);
    if (abs < deadzone) return 0;
    return Math.sign(v) * ((abs - deadzone) / (1 - deadzone));
  };

  // Axes: 0=LeftX, 1=LeftY, 2=RightX, 3=RightY
  const lx = applyDeadzone(pad.axes[0] || 0);
  const ly = applyDeadzone(pad.axes[1] || 0);
  const rx = applyDeadzone(pad.axes[2] || 0);
  const ry = applyDeadzone(pad.axes[3] || 0);

  const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
  const trig = (i: number) => (pad.buttons[i]?.value || 0) > 0.4;

  return {
    moveX: lx,
    moveY: ly,
    lookX: rx,
    lookY: ry,
    a: btn(0),
    b: btn(1),
    x: btn(2),
    y: btn(3),
    lb: btn(4),
    rb: btn(5),
    lt: trig(6),
    rt: trig(7),
    back: btn(8),
    start: btn(9),
    ls: btn(10),
    rs: btn(11),
    dpadUp: btn(12),
    dpadDown: btn(13),
    dpadLeft: btn(14),
    dpadRight: btn(15),
  };
}

// === Edge-detection accessors ===
//
// `wasButtonPressed` (legacy, single-caller per button per frame) — kept for
// the in-game input loop. Each call must use a unique button index in a frame.
//
// `wasButtonPressedLabelled` (new, multi-caller) — use this from menu
// navigation where multiple consumers may want to check the same button.

export function wasButtonPressed(state: GamepadState, buttonIndex: number): boolean {
  switch (buttonIndex) {
    case 0: return wasJustPressed(state.a, 0);
    case 1: return wasJustPressed(state.b, 1);
    case 2: return wasJustPressed(state.x, 2);
    case 3: return wasJustPressed(state.y, 3);
    case 4: return wasJustPressed(state.lb, 4);
    case 5: return wasJustPressed(state.rb, 5);
    case 6: return wasJustPressed(state.lt, 6);
    case 7: return wasJustPressed(state.rt, 7);
    case 8: return wasJustPressed(state.back, 8);
    case 9: return wasJustPressed(state.start, 9);
    case 10: return wasJustPressed(state.ls, 10);
    case 11: return wasJustPressed(state.rs, 11);
    case 12: return wasJustPressed(state.dpadUp, 12);
    case 13: return wasJustPressed(state.dpadDown, 13);
    case 14: return wasJustPressed(state.dpadLeft, 14);
    case 15: return wasJustPressed(state.dpadRight, 15);
    default: return false;
  }
}

export function wasButtonPressedLabelled(
  label: string,
  state: GamepadState | null,
  buttonIndex: number
): boolean {
  if (!state) return false;
  switch (buttonIndex) {
    case 0: return wasJustPressedLabelled(label, 0, state.a);
    case 1: return wasJustPressedLabelled(label, 1, state.b);
    case 2: return wasJustPressedLabelled(label, 2, state.x);
    case 3: return wasJustPressedLabelled(label, 3, state.y);
    case 4: return wasJustPressedLabelled(label, 4, state.lb);
    case 5: return wasJustPressedLabelled(label, 5, state.rb);
    case 6: return wasJustPressedLabelled(label, 6, state.lt);
    case 7: return wasJustPressedLabelled(label, 7, state.rt);
    case 8: return wasJustPressedLabelled(label, 8, state.back);
    case 9: return wasJustPressedLabelled(label, 9, state.start);
    case 10: return wasJustPressedLabelled(label, 10, state.ls);
    case 11: return wasJustPressedLabelled(label, 11, state.rs);
    case 12: return wasJustPressedLabelled(label, 12, state.dpadUp);
    case 13: return wasJustPressedLabelled(label, 13, state.dpadDown);
    case 14: return wasJustPressedLabelled(label, 14, state.dpadLeft);
    case 15: return wasJustPressedLabelled(label, 15, state.dpadRight);
    default: return false;
  }
}

// Convenience: returns true if any of the four D-Pad directions was just pressed
export function wasDpadPressed(label: string, state: GamepadState | null): {
  up: boolean; down: boolean; left: boolean; right: boolean;
} {
  return {
    up: wasButtonPressedLabelled(label, state, 12),
    down: wasButtonPressedLabelled(label, state, 13),
    left: wasButtonPressedLabelled(label, state, 14),
    right: wasButtonPressedLabelled(label, state, 15),
  };
}

// Returns true if the left stick just crossed the deadzone in a direction
// (acts like a D-Pad press for menu navigation).
export function wasStickPressed(
  label: string,
  state: GamepadState | null,
  threshold = 0.6
): { up: boolean; down: boolean; left: boolean; right: boolean } {
  if (!state) return { up: false, down: false, left: false, right: false };
  // Reuse edge state keyed on synthetic IDs 100+ to avoid collision with real buttons
  const checkAxis = (id: number, value: number, sign: -1 | 1): boolean => {
    const crossed = sign > 0 ? value > threshold : value < -threshold;
    return wasJustPressedLabelled(label, id, crossed);
  };
  return {
    up: checkAxis(100, state.moveY, -1),
    down: checkAxis(101, state.moveY, 1),
    left: checkAxis(102, state.moveX, -1),
    right: checkAxis(103, state.moveX, 1),
  };
}

// Combined "navigation intent" — D-Pad OR left stick, with edge detection.
// Use this in menu navigation handlers.
export function wasNavPressed(label: string, state: GamepadState | null): {
  up: boolean; down: boolean; left: boolean; right: boolean;
} {
  const dpad = wasDpadPressed(label, state);
  const stick = wasStickPressed(label, state);
  return {
    up: dpad.up || stick.up,
    down: dpad.down || stick.down,
    left: dpad.left || stick.left,
    right: dpad.right || stick.right,
  };
}

export function isGamepadConnected(): boolean {
  if (connectedGamepadId) return true;
  const pads = navigator.getGamepads();
  if (!pads) return false;
  for (const p of pads) {
    if (p && p.connected) return true;
  }
  return false;
}

export function resetGamepadState() {
  prevButtonStates.clear();
  edgeState.clear();
}

// Returns true if a gamepad was recently connected (for auto-switching)
let autoDetectedController = false;
export function wasGamepadConnected(): boolean {
  // If currently connected, treat as "was connected" so consumers can auto-switch
  if (isGamepadConnected()) return true;
  return autoDetectedController;
}

// Clear the auto-detect flag (after switching)
export function clearAutoDetect() {
  autoDetectedController = false;
}

// Returns the human-readable name of the connected gamepad (or null)
export function getConnectedGamepadName(): string | null {
  return connectedGamepadId;
}
