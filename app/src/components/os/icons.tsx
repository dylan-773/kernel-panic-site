import type { ReactElement, ReactNode } from "react";

/**
 * Shared 32x32 pixel-grid wrapper. Every glyph is built only from <rect>
 * elements on integer coordinates so it stays crisp at native size.
 */
function IconSvg({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 32 32"
      width={32}
      height={32}
      shapeRendering="crispEdges"
      focusable="false"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Ticket / clipboard stack - two offset job chits. */
function JobsIcon(): ReactElement {
  return (
    <IconSvg>
      <rect x={10} y={4} width={18} height={12} fill="var(--kp-rose)" />
      <rect x={4} y={10} width={18} height={16} fill="currentColor" />
      <rect x={7} y={16} width={12} height={2} fill="var(--kp-bg0)" fillOpacity={0.45} />
      <rect x={7} y={21} width={12} height={2} fill="var(--kp-bg0)" fillOpacity={0.45} />
    </IconSvg>
  );
}

/** Chip / cartridge with a notched pin-1 corner and bottom pins. */
function LoadoutIcon(): ReactElement {
  return (
    <IconSvg>
      <rect x={10} y={4} width={16} height={20} fill="currentColor" />
      <rect x={6} y={8} width={4} height={16} fill="currentColor" />
      <rect x={8} y={26} width={2} height={4} fill="currentColor" />
      <rect x={12} y={26} width={2} height={4} fill="currentColor" />
      <rect x={16} y={26} width={2} height={4} fill="currentColor" />
      <rect x={20} y={26} width={2} height={4} fill="currentColor" />
      <rect x={24} y={26} width={2} height={4} fill="currentColor" />
      <rect x={20} y={9} width={3} height={3} fill="var(--kp-signal)" />
    </IconSvg>
  );
}

/** Book / README with a stepped, folded top-right corner. */
function ManualIcon(): ReactElement {
  return (
    <IconSvg>
      <rect x={7} y={4} width={18} height={24} fill="currentColor" />
      <rect x={19} y={4} width={6} height={2} fill="var(--kp-gold)" />
      <rect x={19} y={6} width={4} height={2} fill="var(--kp-gold)" />
      <rect x={19} y={8} width={2} height={2} fill="var(--kp-gold)" />
      <rect x={10} y={13} width={12} height={2} fill="var(--kp-rose)" />
      <rect x={10} y={18} width={9} height={2} fill="var(--kp-rose)" />
    </IconSvg>
  );
}

/** Coin stack / credit chit, front coin bearing a currency mark. */
function LedgerIcon(): ReactElement {
  return (
    <IconSvg>
      <rect x={9} y={8} width={16} height={6} fill="currentColor" />
      <rect x={7} y={14} width={18} height={6} fill="currentColor" />
      <rect x={5} y={20} width={20} height={7} fill="currentColor" />
      <rect x={14} y={21} width={2} height={5} fill="var(--kp-gold)" />
      <rect x={12} y={22} width={6} height={2} fill="var(--kp-gold)" />
    </IconSvg>
  );
}

/** Padlocked tower silhouette - shackle + body on top, one lit window. */
function BackroomIcon(): ReactElement {
  return (
    <IconSvg>
      <rect x={13} y={2} width={2} height={5} fill="currentColor" />
      <rect x={17} y={2} width={2} height={5} fill="currentColor" />
      <rect x={10} y={6} width={12} height={6} fill="currentColor" />
      <rect x={8} y={12} width={16} height={18} fill="currentColor" />
      <rect x={12} y={15} width={3} height={3} fill="currentColor" fillOpacity={0.35} />
      <rect x={19} y={15} width={3} height={3} fill="currentColor" fillOpacity={0.35} />
      <rect x={12} y={20} width={3} height={3} fill="currentColor" fillOpacity={0.35} />
      <rect x={19} y={20} width={3} height={3} fill="var(--kp-signal)" />
      <rect x={12} y={25} width={3} height={3} fill="currentColor" fillOpacity={0.35} />
      <rect x={19} y={25} width={3} height={3} fill="currentColor" fillOpacity={0.35} />
    </IconSvg>
  );
}

export type IconName = "jobs" | "loadout" | "manual" | "ledger" | "backroom" | "journal";

function JournalIcon(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} shapeRendering="crispEdges" aria-hidden="true">
      {/* worn diary: cover, spine rings, rose bookmark, taped corner */}
      <rect x={7} y={4} width={19} height={24} fill="currentColor" opacity={0.35} />
      <rect x={6} y={3} width={19} height={24} fill="currentColor" />
      <rect x={8} y={5} width={15} height={20} fill="var(--kp-bg0, #101218)" />
      <rect x={6} y={3} width={3} height={24} fill="var(--kp-gold)" />
      <rect x={4} y={6} width={3} height={2} fill="currentColor" />
      <rect x={4} y={12} width={3} height={2} fill="currentColor" />
      <rect x={4} y={18} width={3} height={2} fill="currentColor" />
      <rect x={4} y={24} width={3} height={2} fill="currentColor" />
      <rect x={18} y={3} width={4} height={9} fill="var(--kp-rose)" />
      <rect x={19} y={12} width={2} height={2} fill="var(--kp-rose)" />
      <rect x={11} y={9} width={9} height={2} fill="currentColor" opacity={0.8} />
      <rect x={11} y={13} width={7} height={2} fill="currentColor" opacity={0.6} />
      <rect x={11} y={17} width={9} height={2} fill="currentColor" opacity={0.6} />
      <rect x={11} y={21} width={5} height={2} fill="currentColor" opacity={0.4} />
    </svg>
  );
}

export const ICONS: Record<IconName, () => ReactElement> = {
  jobs: JobsIcon,
  loadout: LoadoutIcon,
  manual: ManualIcon,
  ledger: LedgerIcon,
  backroom: BackroomIcon,
  journal: JournalIcon,
};

export interface DesktopIconProps {
  label: string;
  icon: IconName;
  onOpen: () => void;
  badge?: number;
  /** Carries a teaching tip, for icons that stand for a whole reference. */
  hint?: string;
}

export function DesktopIcon({ label, icon, onOpen, badge, hint }: DesktopIconProps) {
  const Glyph = ICONS[icon];
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <button type="button" className="kp-dicon" onClick={onOpen} title={hint}>
      <span className="kp-dicon-glyph">
        <Glyph />
        {showBadge && <span className="kp-dicon-badge">{badge > 99 ? "99+" : badge}</span>}
      </span>
      <span className="kp-dicon-label">{label}</span>
    </button>
  );
}

export function IconGrid({ children }: { children: ReactNode }) {
  return <div className="kp-dicon-grid">{children}</div>;
}
