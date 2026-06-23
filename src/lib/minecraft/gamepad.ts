// Xbox controller support for Minecraft clone.
// Auto-detects controller connection. Polls every frame when active.
// Works completely without mouse/keyboard — no pointer lock needed.

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

// Edge detection: track which buttons were pressed last frame
const prevButtonStates: Map<number, boolean> = new Map();

// Auto-detect: set to controller mode when a gamepad connects
let autoDetectedController = false;

// Listen for gamepad connection/disconnection
if (typeof window !== "undefined") {
  window.addEventListener("gamepadconnected", (e: GamepadEvent) => {
    console.log("Gamepad connected:", e.gamepad.id);
    autoDetectedController = true;
  });
  window.addEventListener("gamepaddisconnected", (e: GamepadEvent) => {
    console.log("Gamepad disconnected:", e.gamepad.id);
    autoDetectedController = false;
  });
}

// Returns true if a button was just pressed (rising edge) since last call
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

// Check edge detection for a specific button
export function wasButtonPressed(state: GamepadState, buttonIndex: number): boolean {
  switch (buttonIndex) {
    case 0: return wasJustPressed(state.a, 0);
    case 1: return wasJustPressed(state.b, 1);
    case 2: return wasJustPressed(state.x, 2);
    case 3: return wasJustPressed(state.y, 3);
    case 4: return wasJustPressed(state.lb, 4);
    case 5: return wasJustPressed(state.rb, 5);
    case 8: return wasJustPressed(state.back, 8);
    case 9: return wasJustPressed(state.start, 9);
    case 10: return wasJustPressed(state.ls, 10);
    case 12: return wasJustPressed(state.dpadUp, 12);
    case 13: return wasJustPressed(state.dpadDown, 13);
    case 14: return wasJustPressed(state.dpadLeft, 14);
    case 15: return wasJustPressed(state.dpadRight, 15);
    default: return false;
  }
}

export function isGamepadConnected(): boolean {
  if (autoDetectedController) return true;
  const pads = navigator.getGamepads();
  if (!pads) return false;
  for (const p of pads) {
    if (p && p.connected) return true;
  }
  return false;
}

export function resetGamepadState() {
  prevButtonStates.clear();
}

// Returns true if a gamepad was recently connected (for auto-switching)
export function wasGamepadConnected(): boolean {
  return autoDetectedController;
}

// Clear the auto-detect flag (after switching)
export function clearAutoDetect() {
  autoDetectedController = false;
}
