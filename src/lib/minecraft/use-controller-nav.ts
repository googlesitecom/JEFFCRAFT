"use client";

import { useEffect, useRef, useState } from "react";
import {
  GamepadState,
  readGamepad,
  wasNavPressed,
  wasButtonPressedLabelled,
  isGamepadConnected,
} from "./gamepad";

/**
 * A small hook that polls the gamepad every frame and exposes the live state
 * plus edge-detected button presses via a stable callback interface.
 *
 * The hook is designed to be the SINGLE place in a React tree that calls
 * `readGamepad()` per frame — this keeps edge detection consistent across
 * all menu screens. Multiple consumers should subscribe to the same hook
 * instance (lift it up to the parent) rather than each calling it.
 *
 * Returns:
 *  - `connected`: whether a gamepad is currently connected (updates on
 *    connect/disconnect events so React re-renders).
 *  - `poll(cb)`: register a per-frame callback that receives the current
 *    GamepadState (or null) and a label namespace for edge detection. The
 *    callback is automatically removed on unmount.
 *  - `stateRef`: a ref whose `.current` always points to the latest
 *    GamepadState. Useful for handlers that need to read the gamepad outside
 *    of the per-frame callback (e.g., in onClick handlers).
 */
export function useGamepadPoller() {
  const [connected, setConnected] = useState(false);
  const stateRef = useRef<GamepadState | null>(null);
  const cbRef = useRef<((state: GamepadState | null) => void) | null>(null);
  const rafRef = useRef<number | null>(null);

  // Poll loop — runs every frame, calls the registered callback if any
  useEffect(() => {
    const tick = () => {
      const pad = readGamepad(0);
      stateRef.current = pad;
      // Update connection state for React re-render
      const isConn = isGamepadConnected();
      setConnected((prev) => (prev !== isConn ? isConn : prev));
      if (cbRef.current) cbRef.current(pad);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const poll = (cb: (state: GamepadState | null) => void) => {
    cbRef.current = cb;
  };

  return { connected, poll, stateRef };
}

/**
 * Controller menu navigation hook.
 *
 * Tracks a 1D or 2D cursor over a list/grid of menu items and dispatches
 * navigation + confirm/back events based on gamepad input.
 *
 * Usage:
 *   const { selectedIndex, setSelectedIndex } = useControllerNav({
 *     enabled: true,
 *     itemCount: 5,
 *     columns: 1,
 *     onConfirm: () => { ... },
 *     onBack: () => { ... },
 *   });
 *
 * Then pass `selectedIndex` and `setSelectedIndex` to your menu buttons so
 * they can render the focused state and respond to A/Enter.
 *
 * Navigation model:
 *   - D-Pad / Left stick up/down/left/right → move selection
 *   - A (button 0) → onConfirm
 *   - B (button 1) → onBack
 *   - Start (button 9) → onStart (optional)
 *
 * The hook polls the gamepad via requestAnimationFrame internally, so it works
 * even when the parent component isn't in the main game's render loop (e.g.,
 * on the Main Menu before the game has started).
 */
export interface ControllerNavOptions {
  enabled: boolean;
  itemCount: number;
  columns?: number;        // default 1 (vertical list)
  initialIndex?: number;   // default 0
  onConfirm?: () => void;
  onBack?: () => void;
  onStart?: () => void;
  /** Wrap-around when navigating past the end (default: false) */
  wrap?: boolean;
}

export function useControllerNav(opts: ControllerNavOptions) {
  const {
    enabled,
    itemCount,
    columns = 1,
    initialIndex = 0,
    onConfirm,
    onBack,
    onStart,
    wrap = false,
  } = opts;

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const indexRef = useRef(initialIndex);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Keep ref in sync so the per-frame callback can mutate without re-binding
  const setIndex = (i: number) => {
    const count = optsRef.current.itemCount;
    if (count === 0) return;
    let next = i;
    if (optsRef.current.wrap) {
      next = ((i % count) + count) % count;
    } else {
      next = Math.max(0, Math.min(count - 1, i));
    }
    indexRef.current = next;
    setSelectedIndex(next);
  };

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        const cols = optsRef.current.columns || 1;
        const count = optsRef.current.itemCount;
        const rows = Math.ceil(count / cols);
        const cur = indexRef.current;
        const curRow = Math.floor(cur / cols);
        const curCol = cur % cols;

        const nav = wasNavPressed("menu-nav", pad);
        let newRow = curRow;
        let newCol = curCol;

        if (nav.up) newRow = curRow - 1;
        else if (nav.down) newRow = curRow + 1;
        if (nav.left) newCol = curCol - 1;
        else if (nav.right) newCol = curCol + 1;

        // Clamp row/col with optional wrap
        if (optsRef.current.wrap) {
          newRow = ((newRow % rows) + rows) % rows;
          newCol = ((newCol % cols) + cols) % cols;
        } else {
          newRow = Math.max(0, Math.min(rows - 1, newRow));
          newCol = Math.max(0, Math.min(cols - 1, newCol));
        }

        // Compute the new linear index, skipping empty cells (when count
        // isn't a perfect multiple of cols)
        let newIndex = newRow * cols + newCol;
        if (newIndex >= count) {
          // Snap to the last valid index in this row
          newIndex = (rows - 1) * cols + (cols - 1);
          if (newIndex >= count) newIndex = count - 1;
        }

        if (newIndex !== cur && newIndex >= 0 && newIndex < count) {
          setIndex(newIndex);
        }

        if (wasButtonPressedLabelled("menu-nav", pad, 0)) {
          optsRef.current.onConfirm?.();
        }
        if (wasButtonPressedLabelled("menu-nav", pad, 1)) {
          optsRef.current.onBack?.();
        }
        if (wasButtonPressedLabelled("menu-nav", pad, 9)) {
          optsRef.current.onStart?.();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, itemCount, columns]);

  // Reset to initialIndex when itemCount changes (e.g., menu screen changed)
  useEffect(() => {
    setIndex(initialIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount, initialIndex]);

  return { selectedIndex, setSelectedIndex: setIndex };
}
