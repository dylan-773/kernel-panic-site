import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Touch access to the teaching tips.
 *
 * Every tip in the game hangs off a plain HTML `title`, and the mid dive
 * ability panel opens on mouse enter. Neither survives a tap, so a player on
 * a touch device could not read a single tip or any ability description
 * during a dive: the whole tier 1 teaching layer was invisible to them.
 *
 * The mechanism is one long press. Hold a control for 400ms and its text
 * opens inline; tap it again, or tap away, and it closes. Every handler
 * no-ops unless the pointer is a real touch, so mouse and pen behaviour is
 * byte for byte what it was.
 */

const LONG_PRESS_MS = 400;
/** Past this much drift the gesture is a scroll, not a press. */
const LONG_PRESS_SLOP_PX = 10;

export interface LongPressOpts {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function useLongPress({ isOpen, onOpen, onClose }: LongPressOpts) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  /** A press that did something must not also fire the control's click. */
  const eatClick = useRef(false);
  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        eatClick.current = true;
        onOpen();
      }, LONG_PRESS_MS);
    },
    [clear, onOpen],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch" || !start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) clear();
    },
    [clear],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      clear();
      start.current = null;
      // A short tap while the tip is open is the dismiss gesture. A short tap
      // while it is closed is an ordinary tap: let the control have it.
      if (!fired.current && openRef.current) {
        eatClick.current = true;
        onClose();
      }
    },
    [clear, onClose],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      clear();
      start.current = null;
    },
    [clear],
  );

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // Otherwise a long press pops the native selection callout over the tip.
    e.preventDefault();
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!eatClick.current) return;
    eatClick.current = false;
    // Capture phase, so a press on an inert span cannot reach a clickable
    // ancestor either: holding the threat pips must not also pick the job.
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave: onPointerCancel,
    onContextMenu,
    onClickCapture,
  };
}

/**
 * Wraps a control so its tip text is reachable by hold as well as by hover.
 * Renders children bare when there is no text, so call sites can pass a
 * possibly-undefined `tip(...)` without branching.
 */
export function TapTip({ text, children }: { text?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);
  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);
  const handlers = useLongPress({ isOpen: open, onOpen, onClose });

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);

  if (!text) return <>{children}</>;
  return (
    <span className="kp-tapwrap" title={text} ref={wrap} {...handlers}>
      {children}
      {open && (
        <span className="kp-tap-pop" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
