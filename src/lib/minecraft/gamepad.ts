// Xbox controller support for Minecraft clone.
// Uses the standard Gamepad API. Properly handles button edge detection
// (pressed vs held) and works without mouse pointer lock.

export type InputMode = "keyboard" | "controller";

// Xbox button indices (standard mapping)
// 0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT, 8=Back, 9=Start, 10=LS, 11=RS
// 12=DUp, 13=DDown, 14=DLeft, 15=DRight

export interface GamepadState {
  // Analog sticks (-1 to 1, 0 = center)
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  // Digital buttons (true = currently held down)
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  lb: boolean;
  rb: boolean;
  lt: boolean;   // true when trigger > 0.5
  rt: boolean;
  back: boolean;
  start: boolean;
  ls: boolean;   // left stick click
  rs: boolean;   // right stick click
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
}

// Track previous button states for edge detection
let prevButtons: boolean[] = new Array(16).fill(false);

// Returns true if a button was pressed THIS frame (rising edge)
export function wasPressed(current: boolean, index: number): boolean {
  const was = prevButtons[index] || false;
  prevButtons[index] = current;
  return current && !was;
}

export function readGamepad(index: number = 0): GamepadState | null {
  const pads = navigator.getGamepads();
  const pad = pads[index];
  if (!pad) return null;

  const deadzone = 0.2;
  const clamp = (v: number) => {
    const abs = Math.abs(v);
    if (abs < deadzone) return 0;
    // Scale so that values outside deadzone map smoothly to 0..1
    return Math.sign(v) * ((abs - deadzone) / (1 - deadzone));
  };

  const lx = clamp(pad.axes[0] || 0);
  const ly = clamp(pad.axes[1] || 0);
  const rx = clamp(pad.axes[2] || 0);
  const ry = clamp(pad.axes[3] || 0);

  const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
  const trig = (i: number) => (pad.buttons[i]?.value || 0) > 0.5;

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

export function isGamepadConnected(): boolean {
  const pads = navigator.getGamepads();
  for (const p of pads) {
    if (p && p.connected) return true;
  }
  return false;
}

// Reset edge tracking (call when switching input modes)
export function resetGamepadState() {
  prevButtons = new Array(16).fill(false);
}
