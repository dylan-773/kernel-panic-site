import type { ReactNode } from "react";
import { PX_ICONS, PxIcon } from "./kp-ui";

/**
 * Desktop icons: free-floating shaded pixel pictograms in the KP mark's own
 * language (no cell boxes), with a solid-ink tag label beneath. Art lives as
 * bitmap rows in kp-ui.tsx's PX_ICONS; every tone derives from the hue vars.
 */

export type IconName =
  | "inbox"
  | "loadout"
  | "solder"
  | "report"
  | "night"
  | "journal"
  | "manual"
  | "ledger"
  | "darknet";

export interface DesktopIconProps {
  label: string;
  icon: IconName;
  onOpen: () => void;
  badge?: number;
  /** Carries a teaching tip, for icons that stand for a whole reference. */
  hint?: string;
  /** Stagger slot for the login slot-in choreography. */
  order?: number;
}

export function DesktopIcon({ label, icon, onOpen, badge, hint, order = 0 }: DesktopIconProps) {
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <button
      type="button"
      className="kp-dicon kp-slot-anim"
      style={{ animationDelay: `${order * 50}ms` }}
      onClick={onOpen}
      title={hint}
    >
      <span className="kp-dicon-glyph">
        <PxIcon rows={PX_ICONS[icon]} cell={3} />
        {showBadge && <span className="kp-dicon-badge">{badge > 99 ? "99+" : badge}</span>}
      </span>
      <span className="kp-dicon-label">{label}</span>
    </button>
  );
}

export function IconGrid({ children }: { children: ReactNode }) {
  return <div className="kp-dicon-grid">{children}</div>;
}

/* ---------- the dock (v3, ux-2026-07-31-desktop-dive review round 3) ----------
 * The Windows-style left icon column is gone. The eight app icons live in a
 * dock centered on the bottom edge, which is both the launcher AND the
 * running-window indicator: a running app carries an --r-line underline
 * plate, and clicking it surfaces its window rather than re-opening it.
 */

export interface DockIconProps extends DesktopIconProps {
  /** True when this app has a window open: paints the running plate. */
  running?: boolean;
}

export function DockIcon({ label, icon, onOpen, badge, hint, order = 0, running = false }: DockIconProps) {
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <button
      type="button"
      className={running ? "ds-dock-icon ds-running kp-slot-anim" : "ds-dock-icon kp-slot-anim"}
      style={{ animationDelay: `${order * 50}ms` }}
      onClick={onOpen}
      title={hint}
      aria-pressed={running}
    >
      <span className="ds-dock-glyph">
        <PxIcon rows={PX_ICONS[icon]} cell={3} />
        {showBadge && <span className="kp-dicon-badge">{badge > 99 ? "99+" : badge}</span>}
      </span>
      <span className="ds-dock-label">{label}</span>
      <i className="ds-dock-run" aria-hidden="true" />
    </button>
  );
}

export function Dock({ children }: { children: ReactNode }) {
  return (
    <nav className="ds-dock" aria-label="Application dock">
      {children}
    </nav>
  );
}
