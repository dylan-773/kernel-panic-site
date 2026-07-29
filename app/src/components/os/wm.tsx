import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export interface WinDef {
  id: string;
  title: string; // e.g. "INBOX"
  x: number;
  y: number; // px offsets within the desktop area
  w: number; // px width (height sizes to content under the .kp-fw ceiling; no internal scroll)
  /** DARKNET.LNK only: stepped-notch title bar + void chevron. */
  notched?: boolean;
  /** Study-grade windows run full height: only the viewport caps them,
   * never the utility-window ceiling. */
  tall?: boolean;
}

export interface WindowManager {
  open: (id: string) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  toggle: (id: string) => void;
  isOpen: (id: string) => boolean;
  zIndexOf: (id: string) => number;
  posOf: (id: string) => { x: number; y: number };
  move: (id: string, x: number, y: number) => void;
  openIds: string[];
}

const BASE_Z = 100;

/**
 * Manages a set of floating windows: which are open, their stacking order,
 * and their current positions. Pure state + callbacks - no context, no DOM
 * access, no rendering.
 */
export function useWindowManager(defs: WinDef[]): WindowManager {
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());
  const [zOrder, setZOrder] = useState<string[]>(() => []);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const initial: Record<string, { x: number; y: number }> = {};
    for (const def of defs) initial[def.id] = { x: def.x, y: def.y };
    return initial;
  });

  const bringToFront = useCallback((id: string) => {
    setZOrder((prev) => {
      if (prev[prev.length - 1] === id) return prev;
      return [...prev.filter((existing) => existing !== id), id];
    });
  }, []);

  const open = useCallback(
    (id: string) => {
      setOpenSet((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      bringToFront(id);
    },
    [bringToFront],
  );

  const close = useCallback((id: string) => {
    setOpenSet((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const focus = useCallback(
    (id: string) => {
      bringToFront(id);
    },
    [bringToFront],
  );

  const toggle = useCallback(
    (id: string) => {
      setOpenSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      bringToFront(id);
    },
    [bringToFront],
  );

  const isOpen = useCallback((id: string) => openSet.has(id), [openSet]);

  const zIndexOf = useCallback(
    (id: string) => {
      const idx = zOrder.indexOf(id);
      return idx === -1 ? BASE_Z : BASE_Z + idx + 1;
    },
    [zOrder],
  );

  const posOf = useCallback((id: string) => positions[id] ?? { x: 0, y: 0 }, [positions]);

  const move = useCallback((id: string, x: number, y: number) => {
    setPositions((prev) => ({ ...prev, [id]: { x, y } }));
  }, []);

  const openIds = useMemo(() => Array.from(openSet), [openSet]);

  return { open, close, focus, toggle, isOpen, zIndexOf, posOf, move, openIds };
}

export interface FloatingWindowProps {
  def: WinDef;
  z: number;
  focused: boolean;
  /** When false the close button is hidden and Escape does not close. */
  closable?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  children?: ReactNode;
}

/** Minimum px of the title bar that must stay inside the parent's bounds while dragging. */
const TITLE_MIN_VISIBLE = 40;
const MIN_WIDTH = 420;

function clampAxis(value: number, min: number, max: number): number {
  if (min >= max) return min;
  return Math.min(Math.max(value, min), max);
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export function FloatingWindow({
  def,
  z,
  focused,
  closable = true,
  onClose,
  onFocus,
  onMove,
  children,
}: FloatingWindowProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const wasFocused = useRef(focused);

  // Every window voices its own lifecycle here, so no opener or closer
  // needs a cue of its own (ux-2026-07-29-v2-sound centralization).
  useEffect(() => {
    void import("../../game/audio").then((a) => a.sfx("winOpen", { bus: "ui" }));
    return () => {
      void import("../../game/audio").then((a) => a.sfx("winClose", { bus: "ui" }));
    };
  }, []);

  // FOCUS-PULSE: refocusing an already-open background window flashes the
  // border 220ms steps(4) and voices winFocus; the initial open stays silent
  // here (winOpen covers it).
  useEffect(() => {
    if (focused && !wasFocused.current) {
      setPulsing(true);
      void import("../../game/audio").then((a) => a.sfx("winFocus", { bus: "ui" }));
      const t = setTimeout(() => setPulsing(false), 240);
      wasFocused.current = focused;
      return () => clearTimeout(t);
    }
    wasFocused.current = focused;
  }, [focused]);

  const clampAndMove = useCallback(
    (rawX: number, rawY: number) => {
      const root = rootRef.current;
      const parent = root?.parentElement;
      if (!root || !parent) {
        onMove(rawX, rawY);
        return;
      }
      const barW = root.offsetWidth;
      const barH = barRef.current?.offsetHeight ?? TITLE_MIN_VISIBLE;
      const parentW = parent.clientWidth;
      const parentH = parent.clientHeight;
      const nextX = clampAxis(rawX, TITLE_MIN_VISIBLE - barW, parentW - TITLE_MIN_VISIBLE);
      const nextY = clampAxis(rawY, TITLE_MIN_VISIBLE - barH, parentH - TITLE_MIN_VISIBLE);
      onMove(nextX, nextY);
    },
    [onMove],
  );

  const handleActivate = useCallback(() => {
    onFocus();
    rootRef.current?.focus();
  }, [onFocus]);

  const handleBarPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest(".kp-fw-close")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      barRef.current?.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: def.x,
        originY: def.y,
      };
      setDragging(true);
    },
    [def.x, def.y],
  );

  const handleBarPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.preventDefault();
      clampAndMove(drag.originX + (e.clientX - drag.startX), drag.originY + (e.clientY - drag.startY));
    },
    [clampAndMove],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (barRef.current?.hasPointerCapture(e.pointerId)) {
      barRef.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && closable) {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose, closable],
  );

  const width = Math.max(def.w, MIN_WIDTH);
  const className = [
    "kp-fw",
    def.tall ? "kp-fw-tall" : "",
    focused ? "kp-fw-focused" : "",
    dragging ? "kp-fw-dragging" : "",
    pulsing ? "kp-fw-refocus" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ left: def.x, top: def.y, width: `min(${width}px, 96vw)`, zIndex: z }}
      onPointerDownCapture={handleActivate}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      role="dialog"
      aria-label={def.title}
    >
      <div
        ref={barRef}
        className={def.notched ? "kp-fw-bar kp-frame-notched-bar" : "kp-fw-bar"}
        onPointerDown={handleBarPointerDown}
        onPointerMove={handleBarPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="kp-fw-title">{def.title}</span>
        {def.notched && (
          <span className="kp-bar-chevron" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        {closable && (
          <button type="button" className="kp-fw-close" onClick={onClose} aria-label={`Close ${def.title}`}>
            <i aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="kp-fw-body">{children}</div>
    </div>
  );
}
