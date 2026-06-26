"use client";

import { useEffect, useRef, useState } from "react";
import {
  GamepadState,
  readGamepad,
  wasButtonPressedLabelled,
  isGamepadConnected,
} from "./gamepad";

/**
 * Virtual digital mouse — activated by holding the Right Trigger (RT) on the
 * Xbox controller. While held, a digital cursor appears on screen. The right
 * stick moves it, A left-clicks, X right-clicks. Releasing RT hides the cursor.
 *
 * IMPORTANT: only enabled when the user is NOT in active gameplay, because RT
 * is the mining/attack trigger during play. The caller passes `enabled=false`
 * during gameplay.
 *
 * The cursor works by literally moving the OS mouse pointer via synthetic
 * MouseEvent dispatches (mousemove + mousedown + mouseup + click). This means
 * it works on ANY existing UI without needing to refactor every button.
 *
 * Why synthetic events work here (when they don't for requestPointerLock):
 * - For HOVER effects: dispatching `mousemove` to `document` triggers CSS
 *   `:hover` state on whatever element is under the cursor. This is enough
 *   for highlighting buttons.
 * - For CLICK effects: dispatching `mousedown` + `mouseup` + `click` to the
 *   element under the cursor triggers React's synthetic onClick handlers
 *   because React listens at the document root.
 * - The browser does NOT treat these as "trusted" user gestures, so they
 *   can't grant permissions like pointer lock, fullscreen, etc. But for
 *   normal clicks on buttons/links/inputs, they work fine.
 */

export interface VirtualMouseState {
  visible: boolean;
  x: number;
  y: number;
}

export function useVirtualMouse(enabled: boolean) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Track speed: pixels per second per unit stick input
  const SPEED = 1200;
  // Initialize position to screen center on first enable
  const initialized = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      initialized.current = false;
      return;
    }
    if (!initialized.current) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      posRef.current = { x: cx, y: cy };
      setPos({ x: cx, y: cy });
      initialized.current = true;
    }
    let raf = 0;
    let lastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000); // cap dt to avoid jumps
      lastTime = now;
      const pad = readGamepad(0);
      if (pad) {
        // RT (right trigger, index 7) held = cursor visible.
        // Use a threshold of 0.3 so a light pull doesn't activate it.
        const rtHeld = pad.rt;
        if (rtHeld && !visibleRef.current) {
          visibleRef.current = true;
          setVisible(true);
        } else if (!rtHeld && visibleRef.current) {
          visibleRef.current = false;
          setVisible(false);
        }
        if (visibleRef.current) {
          // Move cursor with right stick
          const dx = pad.lookX * SPEED * dt;
          const dy = pad.lookY * SPEED * dt;
          if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            const newX = Math.max(0, Math.min(window.innerWidth, posRef.current.x + dx));
            const newY = Math.max(0, Math.min(window.innerHeight, posRef.current.y + dy));
            posRef.current = { x: newX, y: newY };
            setPos({ x: newX, y: newY });
            // Dispatch a real mousemove event so existing :hover effects work
            const me = new MouseEvent("mousemove", {
              clientX: newX,
              clientY: newY,
              bubbles: true,
              cancelable: true,
              view: window,
            });
            document.dispatchEvent(me);
          }
          // A = left click, X = right click
          if (wasButtonPressedLabelled("vmouse-click", pad, 0)) {
            dispatchClick(posRef.current.x, posRef.current.y, 0);
          }
          if (wasButtonPressedLabelled("vmouse-click", pad, 2)) {
            dispatchClick(posRef.current.x, posRef.current.y, 2);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return { visible, pos };
}

function dispatchClick(x: number, y: number, button: number) {
  const target = document.elementFromPoint(x, y) as Element | null;
  if (!target) return;
  const opts = {
    clientX: x,
    clientY: y,
    button,
    buttons: button === 0 ? 1 : button === 2 ? 2 : 0,
    bubbles: true,
    cancelable: true,
    view: window,
  };
  // Sequence: mousemove → mousedown → mouseup → click (matches real mouse)
  // The mousemove is important so React's onMouseEnter fires before the click.
  target.dispatchEvent(new MouseEvent("mousemove", opts));
  target.dispatchEvent(new MouseEvent("mousedown", opts));
  target.dispatchEvent(new MouseEvent("mouseup", opts));
  target.dispatchEvent(new MouseEvent("click", opts));
  if (button === 2) {
    target.dispatchEvent(new MouseEvent("contextmenu", opts));
  }
  // Also dispatch a pointer event — React 18+ listens to pointerdown/up for
  // some components, and PointerEvent is what fires on touch devices.
  try {
    const peOpts = {
      clientX: x,
      clientY: y,
      button,
      buttons: opts.buttons,
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
    };
    target.dispatchEvent(new PointerEvent("pointerdown", peOpts));
    target.dispatchEvent(new PointerEvent("pointerup", peOpts));
  } catch (e) {
    // PointerEvent might not be available in older browsers — ignore
  }
}

/**
 * Render the virtual cursor — a Minecraft-style pixelated arrow.
 * Place this at the top level of the component tree, inside the game container.
 */
export function VirtualMouseCursor({ visible, pos }: { visible: boolean; pos: { x: number; y: number } }) {
  if (!visible) return null;
  return (
    <div
      className="fixed pointer-events-none z-[100]"
      style={{
        left: pos.x,
        top: pos.y,
        transform: "translate(-2px, -2px)",
        width: 0,
        height: 0,
      }}
    >
      {/* Pixelated Minecraft-style arrow cursor (white with black outline) */}
      <svg width="24" height="24" viewBox="0 0 24 24" style={{ imageRendering: "pixelated", filter: "drop-shadow(0 0 4px rgba(0,0,0,0.8))" }}>
        {/* Outline (black) */}
        <path
          d="M 1 1 L 1 17 L 5 13 L 8 21 L 11 20 L 8 12 L 14 12 Z"
          fill="#000"
          stroke="#000"
          strokeWidth="2"
          strokeLinejoin="miter"
        />
        {/* Inner (white) */}
        <path
          d="M 2 2 L 2 16 L 5 12 L 8 20 L 10 19 L 7 11 L 13 11 Z"
          fill="#fff"
          stroke="none"
        />
      </svg>
    </div>
  );
}
