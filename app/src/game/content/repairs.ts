/**
 * Repairs and unlocks: the spine of both progression and story. Nothing is
 * bought that could be repaired instead - every system the player unlocks
 * was already in the shop, broken, left by Dad. Each repair carries three
 * payloads: a mechanic, a window, and an artifact of him (a repair missing
 * the third is an upgrade, not a repair, and should be reconsidered).
 *
 * Order does not matter: the player chooses what to fix, prices are flat
 * and expensive (a dependency tree would quietly restore the linear order
 * the redesign removed), and every artifact stands alone under the single
 * ceiling that nothing before a win states what is inside the machine.
 */

export type RepairId =
  | "solderBay"
  | "onionRouter"
  | "diagBench1"
  | "diagBench2"
  | "diagBench3"
  | "powerBox"
  | "shelves"
  | "bottomDrawer"
  | "ledgerTerminal"
  | "driveRig";

export interface RepairDef {
  id: RepairId;
  /** The object's name in the room, e.g. "THE SOLDER BAY". */
  label: string;
  /** Credits. Flat, never day-indexed. */
  cost: number;
  /** Which physical station in the room this repair belongs to. */
  station:
    | "solderBay"
    | "onionRouter"
    | "diagBench"
    | "powerBox"
    | "shelves"
    | "bottomDrawer"
    | "ledgerTerminal"
    | "driveRig";
  /** Journal entry surfaced at the object the moment it is repaired. */
  artifactId: string | null;
  /** Recovered sector playback (1..7) this repair turns up, if any. */
  sector: number | null;
  /** Must be repaired before this one shows a price (stages of one station). */
  stageAfter?: RepairId;
  /** One-line summary of the mechanic it unlocks, for the examine read. */
  unlocks: string;
}

export const REPAIRS: RepairDef[] = [
  {
    id: "solderBay",
    label: "THE SOLDER BAY",
    cost: 140,
    station: "solderBay",
    artifactId: "solder",
    sector: 1,
    unlocks: "Welding two patch pieces into their union, at SOLDER.BAY.",
  },
  {
    id: "onionRouter",
    label: "THE ONION ROUTER",
    cost: 220,
    station: "onionRouter",
    artifactId: null,
    sector: 4,
    unlocks: "The darknet, evenings only, at DARKNET.LNK. Blind pulls for board material.",
  },
  {
    id: "diagBench1",
    label: "THE DIAGNOSTIC BENCH",
    cost: 120,
    station: "diagBench",
    artifactId: "diagnosis",
    sector: null,
    unlocks: "Intake reads the threat tier before you take the job.",
  },
  {
    id: "diagBench2",
    label: "THE DIAGNOSTIC BENCH II",
    cost: 260,
    station: "diagBench",
    stageAfter: "diagBench1",
    artifactId: null,
    sector: 2,
    unlocks: "Intake reads the dominant routine: the honest tell, before the dive.",
  },
  {
    id: "diagBench3",
    label: "THE DIAGNOSTIC BENCH III",
    cost: 480,
    station: "diagBench",
    stageAfter: "diagBench2",
    artifactId: null,
    sector: null,
    unlocks: "Intake reads the opening move: how it will spend its first turn.",
  },
  {
    id: "powerBox",
    label: "THE POWER BOX",
    cost: 100,
    station: "powerBox",
    artifactId: null,
    sector: 5,
    unlocks: "The shop's own lights. Nothing else. That was the point of the bills.",
  },
  {
    id: "shelves",
    label: "THE SHELVES",
    cost: 160,
    station: "shelves",
    artifactId: "receipts",
    sector: 3,
    unlocks: "Room for one more patch piece in the pouch.",
  },
  {
    id: "bottomDrawer",
    label: "THE BOTTOM DRAWER",
    cost: 60,
    station: "bottomDrawer",
    artifactId: "bills",
    sector: 6,
    unlocks: "Whatever he filed under W.",
  },
  {
    id: "ledgerTerminal",
    label: "THE LEDGER TERMINAL",
    cost: 90,
    station: "ledgerTerminal",
    artifactId: "notickets",
    sector: null,
    unlocks: "The books: LEDGER.LOG, today against lifetime.",
  },
  {
    id: "driveRig",
    label: "THE DRIVE RECOVERY RIG",
    cost: 320,
    station: "driveRig",
    artifactId: "grading",
    sector: 7,
    unlocks: "Deeper recovery passes on DAD.VOL.",
  },
];

export const REPAIR_BY_ID: Record<RepairId, RepairDef> = Object.fromEntries(
  REPAIRS.map((r) => [r.id, r]),
) as Record<RepairId, RepairDef>;

export function isRepairId(v: unknown): v is RepairId {
  return typeof v === "string" && v in REPAIR_BY_ID;
}

/** The next unpurchased stage at a station, or null when it is fully repaired. */
export function nextRepairAt(
  station: RepairDef["station"],
  done: RepairId[],
): RepairDef | null {
  for (const r of REPAIRS) {
    if (r.station !== station) continue;
    if (done.includes(r.id)) continue;
    if (r.stageAfter && !done.includes(r.stageAfter)) continue;
    return r;
  }
  return null;
}

/** Diagnostic depth the bench can read at intake (0..3). */
export function diagDepth(done: RepairId[]): 0 | 1 | 2 | 3 {
  if (done.includes("diagBench3")) return 3;
  if (done.includes("diagBench2")) return 2;
  if (done.includes("diagBench1")) return 1;
  return 0;
}

/** Patch pouch capacity: 5 base, +1 with the shelves cleared. */
export function pouchCapFor(done: RepairId[]): number {
  return 5 + (done.includes("shelves") ? 1 : 0);
}
