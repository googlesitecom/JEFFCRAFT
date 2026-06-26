"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  GamepadState,
  readGamepad,
  wasButtonPressedLabelled,
  wasNavPressed,
  isGamepadConnected,
} from "./gamepad";

/**
 * Virtual cursor system for controller-friendly menus.
 *
 * The idea: instead of trying to make every native HTML element (sliders,
 * selects, toggles) keyboard-focusable, we replace them with custom React
 * components that participate in a "focus grid" managed by the parent
 * screen. Each focusable element receives a `focused` prop; when focused,
 * the element listens to the gamepad directly (via its own rAF loop) and
 * responds to A / D-pad left/right / etc.
 *
 * This is the same approach used by Steam Big Picture and most console UIs.
 */

// ============================================================================
// MCSlider — replaces <input type="range">
//   - D-Pad Left / Right (or Left Stick Left/Right) when focused = -/+ step
//   - LB / RB when focused = -/+ 10x step (coarse adjustment)
//   - A when focused = reset to default value (if `defaultValue` provided)
//   - Visual: thick bar with Minecraft-style beveled thumb
// ============================================================================
export function MCSlider({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  onChange,
  focused = false,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue?: number;
  onChange: (v: number) => void;
  focused?: boolean;
  format?: (v: number) => string;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;

  // Repeat-key state: when the user holds D-pad, we step every ~80ms after
  // an initial 250ms delay (matches Steam Big Picture feel)
  const repeatTimerRef = useRef<number | null>(null);
  const lastDirRef = useRef<0 | -1 | 1>(0);

  useEffect(() => {
    if (!focused) {
      lastDirRef.current = 0;
      if (repeatTimerRef.current) {
        window.clearInterval(repeatTimerRef.current);
        repeatTimerRef.current = null;
      }
      return;
    }
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        const nav = wasNavPressed("slider-nav", pad);
        const lb = wasButtonPressedLabelled("slider-nav", pad, 4);
        const rb = wasButtonPressedLabelled("slider-nav", pad, 5);
        const a = wasButtonPressedLabelled("slider-nav", pad, 0);

        // Determine current direction from stick (held, not edge)
        let dir: 0 | -1 | 1 = 0;
        if (nav.left) dir = -1;
        else if (nav.right) dir = 1;
        else if (lb) dir = -1;
        else if (rb) dir = 1;

        if (dir !== 0) {
          // Single-step on edge
          const coarseMul = lb || rb ? 10 : 1;
          const next = clamp(
            valueRef.current + dir * step * coarseMul,
            min,
            max
          );
          // Snap to step
          const snapped = Math.round((next - min) / step) * step + min;
          const finalVal = clamp(snapped, min, max);
          if (finalVal !== valueRef.current) {
            onChangeRef.current(roundTo(finalVal, step));
          }
        }

        // A = reset to default
        if (a && defaultRef.current !== undefined) {
          onChangeRef.current(defaultRef.current);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focused, min, max, step]);

  const pct = ((value - min) / (max - min)) * 100;
  const displayValue = format ? format(value) : value.toFixed(2);

  return (
    <div
      className={`relative py-2 px-3 transition-all ${
        focused ? "scale-[1.02]" : ""
      }`}
      style={{
        backgroundColor: focused ? "rgba(80,120,200,0.35)" : "rgba(40,40,50,0.6)",
        borderTop: `2px solid ${focused ? "#7aaaff" : "rgba(110,110,120,0.6)"}`,
        borderLeft: `2px solid ${focused ? "#7aaaff" : "rgba(110,110,120,0.6)"}`,
        borderBottom: `2px solid ${focused ? "#3a4a7a" : "rgba(0,0,0,0.7)"}`,
        borderRight: `2px solid ${focused ? "#3a4a7a" : "rgba(0,0,0,0.7)"}`,
        boxShadow: focused ? "0 0 10px rgba(120,170,255,0.5)" : "none",
      }}
    >
      <div className="flex justify-between mb-1.5">
        <span className="text-white font-mono text-xs font-bold">
          {focused ? "▶ " : ""}{label}
        </span>
        <span className="text-yellow-300 font-mono text-xs font-bold">
          {displayValue}
        </span>
      </div>
      {/* Custom track + thumb (the native input is hidden but kept for mouse) */}
      <div className="relative h-3" style={{ imageRendering: "pixelated" }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "#1a1a1a",
            borderTop: "1px solid #000",
            borderLeft: "1px solid #000",
            borderBottom: "1px solid #444",
            borderRight: "1px solid #444",
          }}
        />
        <div
          className="absolute top-0 bottom-0 left-0"
          style={{
            width: `${pct}%`,
            backgroundColor: focused ? "#5a9aff" : "#6b6b6b",
            borderTop: "1px solid " + (focused ? "#9acaff" : "#9a9a9a"),
            borderLeft: "1px solid " + (focused ? "#9acaff" : "#9a9a9a"),
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-5"
          style={{
            left: `calc(${pct}% - 8px)`,
            backgroundColor: focused ? "#bcd0ff" : "#c0c0c0",
            borderTop: "2px solid #fff",
            borderLeft: "2px solid #fff",
            borderBottom: "2px solid #555",
            borderRight: "2px solid #555",
            boxShadow: focused ? "0 0 8px rgba(180,210,255,0.9)" : "none",
          }}
        />
      </div>
      {focused && (
        <p className="text-cyan-300 text-[9px] font-mono mt-1 text-center">
          ◀ ▶ ajustar · LB/RB rápido · A reset
        </p>
      )}
    </div>
  );
}

// ============================================================================
// MCToggle — replaces GfxToggle
//   - A when focused = toggle on/off
//   - Visual: switch + label, brighter when focused
// ============================================================================
export function MCToggle({
  label,
  desc,
  value,
  onChange,
  focused = false,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  focused?: boolean;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!focused) return;
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        const a = wasButtonPressedLabelled("toggle-nav", pad, 0);
        if (a) onChangeRef.current(!valueRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focused]);

  return (
    <div
      className={`flex justify-between items-center cursor-pointer transition-all ${
        focused ? "scale-[1.02]" : ""
      }`}
      onClick={() => onChange(!value)}
      style={{
        backgroundColor: focused ? "rgba(80,120,200,0.35)" : "transparent",
        padding: focused ? "6px 8px" : "6px 8px",
        borderTop: `2px solid ${focused ? "#7aaaff" : "transparent"}`,
        borderLeft: `2px solid ${focused ? "#7aaaff" : "transparent"}`,
        borderBottom: `2px solid ${focused ? "#3a4a7a" : "transparent"}`,
        borderRight: `2px solid ${focused ? "#3a4a7a" : "transparent"}`,
        boxShadow: focused ? "0 0 10px rgba(120,170,255,0.5)" : "none",
      }}
    >
      <div>
        <span className="text-white font-mono text-xs font-bold">
          {focused ? "▶ " : ""}{label}
        </span>
        <p className="text-stone-500 text-[10px] font-mono">{desc}</p>
      </div>
      <div
        className="w-10 h-5 rounded-sm relative transition-all"
        style={{
          backgroundColor: value ? "#4a8a3a" : "#3a3a3a",
          borderTop: "2px solid " + (value ? "#7aaa5a" : "#555"),
          borderLeft: "2px solid " + (value ? "#7aaa5a" : "#555"),
          borderBottom: "2px solid " + (value ? "#2a4a1a" : "#222"),
          borderRight: "2px solid " + (value ? "#2a4a1a" : "#222"),
        }}
      >
        <div
          className="absolute top-0.5 w-3.5 h-3.5 transition-all"
          style={{ left: value ? "18px" : "2px", backgroundColor: "#fff" }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// MCSelect — replaces <select>
//   - A when focused = cycle to next option
//   - D-Pad Left/Right when focused = prev/next option
//   - Visual: dropdown-looking button showing current option
// ============================================================================
export function MCSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
  focused = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  focused?: boolean;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!focused) return;
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        const nav = wasNavPressed("select-nav", pad);
        const a = wasButtonPressedLabelled("select-nav", pad, 0);
        const opts = optionsRef.current;
        const curIdx = opts.findIndex((o) => o.value === valueRef.current);
        if (curIdx < 0) return;
        let nextIdx = curIdx;
        if (nav.right || a) nextIdx = (curIdx + 1) % opts.length;
        else if (nav.left) nextIdx = (curIdx - 1 + opts.length) % opts.length;
        if (nextIdx !== curIdx) {
          onChangeRef.current(opts[nextIdx].value);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focused]);

  const curLabel = options.find((o) => o.value === value)?.label ?? String(value);

  return (
    <div
      className={`flex items-center gap-2 transition-all ${
        focused ? "scale-[1.02]" : ""
      }`}
      style={{
        backgroundColor: focused ? "rgba(80,120,200,0.35)" : "transparent",
        padding: "4px 6px",
        borderTop: `2px solid ${focused ? "#7aaaff" : "transparent"}`,
        borderLeft: `2px solid ${focused ? "#7aaaff" : "transparent"}`,
        borderBottom: `2px solid ${focused ? "#3a4a7a" : "transparent"}`,
        borderRight: `2px solid ${focused ? "#3a4a7a" : "transparent"}`,
        boxShadow: focused ? "0 0 10px rgba(120,170,255,0.5)" : "none",
      }}
    >
      <span className="text-white font-mono text-[10px] font-bold min-w-[70px]">
        {focused ? "▶ " : ""}{label}
      </span>
      <div
        className="flex-1 px-2 py-0.5 text-white font-mono text-[10px]"
        style={{
          backgroundColor: "#1f1f1f",
          borderTop: "1px solid #000",
          borderLeft: "1px solid #000",
          borderBottom: "1px solid #444",
          borderRight: "1px solid #444",
        }}
      >
        {curLabel} {focused && <span className="text-cyan-300">◀ ▶</span>}
      </div>
    </div>
  );
}

// ============================================================================
// MCAction — a focusable button (already covered by MCMenuButton's `selected`
// prop, but this one is for inline actions in panels). A when focused = click.
// ============================================================================
export function MCAction({
  children,
  onClick,
  focused = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  focused?: boolean;
  className?: string;
}) {
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!focused) return;
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        const a = wasButtonPressedLabelled("action-nav", pad, 0);
        if (a) onClickRef.current?.();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focused]);

  return (
    <button
      onClick={onClick}
      className={`relative py-2 px-3 font-bold font-mono text-xs tracking-wide text-white transition-all ${className}`}
      style={{
        backgroundColor: focused ? "#8aa8e8" : "#6b6b6b",
        borderTop: `2px solid ${focused ? "#bcd0ff" : "#9a9a9a"}`,
        borderLeft: `2px solid ${focused ? "#bcd0ff" : "#9a9a9a"}`,
        borderBottom: `2px solid ${focused ? "#3a4a7a" : "#3a3a3a"}`,
        borderRight: `2px solid ${focused ? "#3a4a7a" : "#3a3a3a"}`,
        imageRendering: "pixelated",
        textShadow: "1px 1px 0 #1a1a1a",
        boxShadow: focused
          ? "0 0 12px rgba(180,210,255,0.8)"
          : "0 2px 4px rgba(0,0,0,0.4)",
        transform: focused ? "scale(1.05)" : "scale(1)",
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// useFocusGrid — a 2D focus manager for mixed-element panels.
//
// Pass it:
//   - enabled: boolean (whether to poll the gamepad at all)
//   - layout: a 2D array describing the grid. Each cell is either null (empty,
//     skip) or { id: string }. The same `id` is used by the consumer to
//     check `isFocused(id)` and pass `focused={isFocused(id)}` to its
//     MC* components.
//
// Returns:
//   - isFocused(id): returns true if the cell with this id is currently focused
//   - focusedId: the currently-focused id (or null)
//
// Navigation:
//   - D-Pad / left-stick up/down/left/right moves focus between cells
//   - Wraps around rows/columns
//   - Skips null cells
// ============================================================================
export interface FocusCell {
  id: string;
}
export type FocusRow = (FocusCell | null)[];

export function useFocusGrid({
  enabled,
  layout,
  initialId,
}: {
  enabled: boolean;
  layout: FocusRow[];
  initialId?: string;
}) {
  const [focusedId, setFocusedId] = useState<string | null>(
    initialId ?? layout.flat().find((c) => c)?.id ?? null
  );
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Reset to initialId whenever the layout shape changes (i.e., panel changed)
  const layoutSignature = layout
    .map((row) => row.map((c) => c?.id ?? "_").join(","))
    .join("|");
  useEffect(() => {
    const firstId = initialId ?? layout.flat().find((c) => c)?.id ?? null;
    setFocusedId(firstId);
    focusedIdRef.current = firstId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutSignature, initialId]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      const pad = readGamepad(0);
      if (pad) {
        const nav = wasNavPressed("grid-nav", pad);
        if (nav.up || nav.down || nav.left || nav.right) {
          const layout = layoutRef.current;
          const curId = focusedIdRef.current;
          // Find current position
          let curRow = -1, curCol = -1;
          for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
              if (layout[r][c]?.id === curId) { curRow = r; curCol = c; break; }
            }
            if (curRow >= 0) break;
          }
          if (curRow < 0) {
            // Fall back to first cell
            const first = layout.flat().find((c) => c);
            if (first) { setFocusedId(first.id); focusedIdRef.current = first.id; }
          } else {
            // Move in the requested direction, skipping null cells, wrapping around
            const rows = layout.length;
            const newRow = (r: number) => (r + rows) % rows;
            const newCol = (r: number, c: number) => {
              const cols = layout[r].length;
              return (c + cols) % cols;
            };
            let r = curRow, c = curCol;
            let found: FocusCell | null = null;
            // Try up to rows*cols cells to avoid infinite loop on all-null grid
            for (let i = 0; i < rows * Math.max(...layout.map((row) => row.length)) + 1; i++) {
              if (nav.up) r = newRow(r - 1);
              else if (nav.down) r = newRow(r + 1);
              else if (nav.left) c = newCol(r, c - 1);
              else if (nav.right) c = newCol(r, c + 1);
              if (layout[r] && layout[r][c]) { found = layout[r][c]!; break; }
            }
            if (found) {
              setFocusedId(found.id);
              focusedIdRef.current = found.id;
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  const isFocused = (id: string) => focusedId === id;
  return { focusedId, isFocused, setFocusedId };
}

// ============================================================================
// Helpers
// ============================================================================
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function roundTo(v: number, step: number): number {
  const decimals = (step.toString().split(".")[1] || "").length;
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

// Re-export so consumers don't need a separate import line
export { isGamepadConnected, readGamepad };
export type { GamepadState };
