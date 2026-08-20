import type { WinDef } from "./wm";

/* v3: no window carries a spawn point; a plain open lands CENTERED on the
 * desk. Widths are each panel's own MEASURED figure from its demo. The
 * story windows are gone: scenes play in the room now, and the desktop is
 * purely the machine's own surfaces. */
export const WIN_DEFS: WinDef[] = [
  { id: "inbox", title: "INBOX", w: 760, tall: true },
  { id: "report", title: "REPAIR.LOG", w: 900, tall: true },
  { id: "loadout", title: "LOADOUT.CFG", w: 860, tall: true },
  { id: "solder", title: "SOLDER.BAY", w: 860, tall: true },
  { id: "night", title: "NIGHT.SYS", w: 860, tall: true },
  { id: "manual", title: "MANUAL.TXT", w: 760 },
  { id: "journal", title: "DAD.LOG", w: 1040, tall: true },
  { id: "ledger", title: "LEDGER.LOG", w: 760, tall: true },
  { id: "darknet", title: "DARKNET.LNK", w: 820, notched: true },
];
