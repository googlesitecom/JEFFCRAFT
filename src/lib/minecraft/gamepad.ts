// Xbox controller support for Minecraft clone.
// Maps gamepad inputs to the same key codes used by the keyboard handler.
// The player can switch between keyboard and controller from the controls menu.

export type InputMode = "keyboard" | "controller";

// Standard Xbox controller button mapping (Gamepad API standard mapping)
// Button 0: A, 1: B, 2: X, 3: Y, 4: LB, 5: RB, 6: LT, 7: RT, 8: Back, 9: Start, 10: LS, 11: RS, 12: Up, 13: Down, 14: Left, 15: Right

export interface GamepadState {
  // Movement (left stick)
  moveX: number; // -1 to 1
  moveZ: number; // -1 to 1
  // Look (right stick)
  lookX: number; // -1 to 1
  lookY: number;
  // Buttons (pressed this frame)
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  attack: boolean; // A
  place: boolean;  // B
  inventory: boolean; // X
  hotbarUp: boolean; // RB
  hotbarDown: boolean; // LB
  pause: boolean; // Start
  // Trigger states (analog 0-1)
  leftTrigger: number;
  rightTrigger: number;
}

export function readGamepad(index: number = 0): GamepadState | null {
  const pads = navigator.getGamepads();
  const pad = pads[index];
  if (!pad) return null;

  const deadzone = 0.15;
  const clamp = (v: number) => Math.abs(v) < deadzone ? 0 : v;
  const lx = clamp(pad.axes[0] || 0);
  const ly = clamp(pad.axes[1] || 0);
  const rx = clamp(pad.axes[2] || 0);
  const ry = clamp(pad.axes[3] || 0);

  const btn = (i: number) => pad.buttons[i]?.pressed ?? false;

  return {
    moveX: lx,
    moveZ: ly,
    lookX: rx,
    lookY: ry,
    jump: btn(0),        // A
    sneak: btn(4) || (pad.axes[1] && pad.axes[1] > 0.5 ? false : false), // LB or left stick click
    sprint: btn(10),     // Left stick click (LS)
    attack: btn(0),      // RT for attack instead? Let's use RT
    place: btn(2),       // X button
    inventory: btn(1),   // B button
    hotbarUp: btn(5),    // RB
    hotbarDown: btn(4),  // LB
    pause: btn(9),       // Start
    leftTrigger: pad.buttons[6]?.value || 0,
    rightTrigger: pad.buttons[7]?.value || 0,
  };
}

// Check if any gamepad is connected
export function isGamepadConnected(): boolean {
  const pads = navigator.getGamepads();
  for (const p of pads) {
    if (p) return true;
  }
  return false;
}
