import { MetaState, ShopState } from "../save";
import { RepairId } from "./repairs";

/**
 * DAD.LOG: Dad's own volume, read-only, mounted on the bench terminal.
 * Every entry is the recovered ARTIFACT itself (a scan, a log, a query,
 * a device profile), with diegetic file metadata; the player's voice
 * survives only as a terse bench annotation on a file. Entries unlock as
 * the SHOP is repaired (ruling 16): the thing you fix is the thing that
 * was hiding it, so the recovery-pass fiction is now literally true.
 * Copy gated story-redesign-2026-08-16 (rulings 12, 13, 15, 16, 17).
 */

export type JournalUnlock =
  | { kind: "start" }
  | { kind: "attempt" }
  | { kind: "repair"; id: RepairId }
  | { kind: "win" };

export interface JournalEntry {
  id: string;
  unlock: JournalUnlock;
  kind: "note" | "bill" | "memo";
  /** Diegetic filename on DAD.VOL. */
  filename: string;
  /** Bare-noun doctype for the metadata datarow. */
  doctype: string;
  /** Where it was found or how it was recovered. */
  provenance: string;
  title: string;
  body: string[];
  /** The player's annotation, clearly subordinate to the artifact. */
  benchNote?: string;
}

export const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: "will",
    unlock: { kind: "start" },
    kind: "note",
    filename: "WILL.SCN",
    doctype: "SCAN",
    provenance: "scanned paper, found taped inside the register, folded in four",
    title: "THE WILL",
    body: [
      "Kid. The whole thing is yours. I am sorry about the counter.",
      "You were always a bench person. You are getting the register anyway. That was always the design, such as it was.",
      "The back room stays locked until it does not. You will know the difference. Love, Dad.",
    ],
    benchNote: "Found this before I found anything else in this place. Should have started here.",
  },
  {
    id: "backroom",
    unlock: { kind: "start" },
    kind: "memo",
    filename: "TICKET_QUERY.LOG",
    doctype: "LOG",
    provenance: "shop system query, bench terminal, day one",
    title: "THE BACK ROOM",
    body: [
      "QUERY: BACK ROOM TOWER. TICKET NUMBER. OWNER OF RECORD. SERVICE HISTORY.",
      "RESULT: NO TICKET. NO OWNER. NO ENTRY IN THIS SYSTEM, EVER.",
      "ACCESS LOG, SAME MORNING. BACK ROOM DOOR. LOCK STATUS: OPEN. METHOD: KEY MATCH, FIRST ATTEMPT, NO FORCE LOGGED.",
    ],
    benchNote:
      "Nobody ever told me it was a virus. I told me that, the first morning, standing in a doorway that was not even shut. It opened like it was expecting me.",
  },
  {
    id: "failed1",
    unlock: { kind: "attempt" },
    kind: "memo",
    filename: "SESSION_001.LOG",
    doctype: "LOG",
    provenance: "tower telemetry, first dive",
    title: "IT SHUT THE DOOR",
    body: [
      "SESSION LOG. ATTEMPT 001. RESULT: LOSS. OPPONENT ENGAGED NO OFFENSIVE ROUTINE.",
      "EVERY MOVE LOGGED. A SCORE ASSIGNED. CHANNEL CLOSED FROM THE OTHER SIDE. NO DAMAGE TAKEN, EITHER SIGNAL.",
      "TIMESTAMP MATCHES CLOSE OF BUSINESS. NOTHING ELSE ON THIS DRIVE FOR THAT HOUR.",
    ],
    benchNote:
      "It did not fight me. It graded me, then shut the door. I swore at it for a while. Nobody came to tell me to stop.",
  },
  {
    id: "bills",
    unlock: { kind: "repair", id: "bottomDrawer" },
    kind: "bill",
    filename: "NOTICE_07.SCN",
    doctype: "SCAN",
    provenance: "scanned paper, bottom drawer of the bench, one of eleven filed under W",
    title: "FINAL NOTICE",
    body: [
      "MERIDIAN NEUROCARE. FINAL NOTICE. ACCOUNT NO. 118823. STATUS: PAST DUE, THIRD NOTICE.",
      "DIAGNOSIS CODE NF-3, NEUROFILAMENT DEGRADATION, STAGE THREE. ACCOUNT STATUS: REFERRED TO COLLECTIONS, PAYMENT PLAN IN DEFAULT.",
      "REMIT PAYMENT OR CONTACT BILLING TO ARRANGE TERMS. THIS IS YOUR THIRD AND FINAL NOTICE BEFORE REFERRAL.",
    ],
    benchNote:
      "There are eleven of these, filed under W for whatever, one balance alone worth more than this shop clears in a year. Stage three of what. He fixed computers. He was not a diver, as far as I knew.",
  },
  {
    id: "solder",
    unlock: { kind: "repair", id: "solderBay" },
    kind: "memo",
    filename: "FRAGMENT_03.REC",
    doctype: "FRAG",
    provenance: "partial recovery, surfaced while rebuilding the bay",
    title: "SOLDER SMOKE",
    body: [
      "Recovered off the bay itself, corroded into the old flux tin. No visible seams, like it was always meant to play whole.",
      "A hand. A soldering iron. A small voice asking why the iron does not stick to everything.",
      "His answer, clear as anything: 'Because it only sticks where you have cleaned. Everything joins where it is clean.'",
    ],
    benchNote: "I do not think these are corruption. I think they are cargo.",
  },
  {
    id: "receipts",
    unlock: { kind: "repair", id: "shelves" },
    kind: "bill",
    filename: "RECEIPTS.SCN",
    doctype: "SCAN",
    provenance: "scanned paper, shoebox, pharmacy on 9th, six years of stubs",
    title: "RECEIPTS",
    body: [
      "STRAIN SUPPRESSANT, CASH SALE. WEEKLY REFILL. PHARMACY ON 9TH, SIX YEARS OF DATED STUBS, SAME COUNTER.",
      "DOSAGE STEPS UP EVERY FEW MONTHS LIKE A STAIRCASE, LOGGED RECEIPT TO RECEIPT.",
      "LAST STUB IN THE SHOEBOX. NOTHING AFTER IT.",
    ],
    benchNote:
      "Four blocks from our counter, every week, and I never heard a word about it. Last stub is dated four days before he died.",
  },
  {
    id: "diagnosis",
    unlock: { kind: "repair", id: "diagBench1" },
    kind: "bill",
    filename: "CONSULT_SUMMARY.SCN",
    doctype: "SCAN",
    provenance: "scanned paper, sealed envelope, never opened until now",
    title: "THE DIAGNOSIS",
    body: [
      "MERIDIAN NEUROCARE. CONSULT SUMMARY. CHRONIC NEURAL STRAIN SCARRING, CUMULATIVE.",
      "CAUSE: SUSTAINED HIGH INTENSITY DIVE ACTIVITY, ESTIMATED IN EXCESS OF NINE THOUSAND LOGGED HOURS.",
      "RECOMMENDATION, UNDERLINED TWICE: CEASE ALL DIVE ACTIVITY IMMEDIATELY.",
    ],
    benchNote:
      "The envelope was never opened before this. He read it at the clinic, decided it changed nothing, and came home and made dinner.",
  },
  {
    id: "notickets",
    unlock: { kind: "repair", id: "ledgerTerminal" },
    kind: "memo",
    filename: "LEDGER_XREF.QRY",
    doctype: "QUERY",
    provenance: "ledger cross reference, run twice to be sure",
    title: "NO TICKETS",
    body: [
      "CROSS REFERENCE: BACK ROOM TOWER AGAINST NINE THOUSAND LOGGED DIVE HOURS.",
      "MATCHING CLIENT RECORD: NONE. MATCHING INVOICE: NONE. MATCHING PAYMENT: NONE.",
      "HOURS ATTRIBUTE TO OPERATOR ONLY. NIGHTLY. AFTER CLOSE. YEARS.",
    ],
    benchNote:
      "Nobody paid for that machine. He built it on an installment plan, and the currency was his own nervous system.",
  },
  {
    id: "grading",
    unlock: { kind: "repair", id: "driveRig" },
    kind: "memo",
    filename: "SESSION_SUMMARY.LOG",
    doctype: "LOG",
    provenance: "tower telemetry, aggregate, every session logged",
    title: "IT IS GRADING ME",
    body: [
      "SESSION VARIANCE REPORT. OPPONENT DIFFICULTY TRACKS OPERATOR PERFORMANCE WITHIN A NARROW BAND, SESSION OVER SESSION.",
      "NO SESSION LOGGED AT MAXIMUM DIFFICULTY REGARDLESS OF OPERATOR SKILL FLOOR. NONE LOGGED AT MINIMUM REGARDLESS OF CEILING.",
      "PATTERN CONSISTENT WITH ADAPTIVE INSTRUCTION. NOT CONSISTENT WITH STATIC ACCESS CONTROL.",
    ],
    benchNote:
      "It is not a lock. It is a curriculum. Dad did not seal something in here. He left something waiting.",
  },
  {
    id: "patch",
    unlock: { kind: "win" },
    kind: "note",
    filename: "PATCH.SYS",
    doctype: "SYS",
    provenance: "full volume unlocked, recovered whole, the morning after",
    title: "PATCH",
    body: [
      "DEVICE PROFILE. NAME: PATCH. NAMED BY THE HOUSE RULE, THE THING THAT HOLDS A BROKEN THING TOGETHER WHILE IT MENDS.",
      "OPERATOR HOURS LOGGED AGAINST THIS UNIT: NINE THOUSAND PLUS. BILLS, SUPPRESSANTS, AND NIGHTS INCLUDED. ALL OF IT SPENT TEACHING IT TO RAISE THE DIFFICULTY GENTLY, BECAUSE HE KNEW HE WOULD NOT BE HERE TO DO IT HIMSELF.",
      "LOG ENDS.",
    ],
    benchNote:
      "The file ends there. Everything after this is just me, the shop, and it, back there, wide awake. Still calling it the same thing out of habit. It does not seem to mind.",
  },
];

/** The archive reader's chrome lines (gated with the entries). */
export const DADLOG_CHROME = {
  /** {n} = recovered count, {d} = 9, or 10 once the win opens PATCH.SYS. */
  volumeHeaderMeta: "DAD.VOL // READ ONLY // RECOVERY {n}/{d}",
  indexRailHeader: "// RECOVERED FILES _",
  damagedRowText: "damaged, partial recovery",
  damagedPage: {
    doctype: "DAMAGED",
    provenance: "partial recovery, more of the shop needed",
    title: "????",
    body: [
      "SEGMENT DAMAGED. PARTIAL RECOVERY ONLY.",
      "THE VOLUME REASSEMBLES AS THE SHOP DOES. FIX WHAT HE LEFT AND THE DRIVE GIVES MORE BACK.",
    ],
  },
  emptyDrawerState: "VOLUME MOUNTED. NOTHING RECOVERED YET.",
  recoveryBeat: ["READING SEGMENT...", "RECOVERY COMPLETE. FILE MOUNTED."],
  footChipLabel: "FILE",
} as const;

function unlocked(e: JournalEntry, shop: ShopState, meta: MetaState): boolean {
  switch (e.unlock.kind) {
    case "start":
      return true;
    case "attempt":
      return shop.attempts >= 1;
    case "repair":
      return shop.repairs.includes(e.unlock.id);
    case "win":
      return meta.machineOpened;
  }
}

export function visibleJournal(
  shop: ShopState,
  meta: MetaState,
): { unlocked: JournalEntry[]; nextLocked: JournalEntry | null } {
  const open = JOURNAL_ENTRIES.filter((e) => unlocked(e, shop, meta));
  const nextLocked =
    JOURNAL_ENTRIES.find((e) => !open.includes(e) && e.unlock.kind !== "win") ?? null;
  return { unlocked: open, nextLocked };
}
