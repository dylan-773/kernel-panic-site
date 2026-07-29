import { MetaState } from "../save";

/**
 * DAD.LOG: Dad's own volume, read-only, mounted on the bench terminal.
 * Every entry is the recovered ARTIFACT itself (a scan, a log, a query,
 * a device profile), with diegetic file metadata; the player's voice
 * survives only as a terse bench annotation on a file. Entries unlock as
 * runs complete and the recovery pass pieces the volume back together.
 * All static; unlock keys are run count plus the finale flag.
 * Copy gated ux-2026-07-29-dadlog (lore ledger rulings 12 and 13; two
 * loremaster rounds plus the tutorial gate's run-cadence fix).
 */

export interface JournalEntry {
  id: string;
  /** Visible once meta.runCount >= this (0 = always). */
  unlockAtRun: number;
  /** Requires the finale to have been won. */
  requiresOpened?: boolean;
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
    unlockAtRun: 0,
    kind: "note",
    filename: "WILL.SCN",
    doctype: "SCAN",
    provenance: "scanned paper, found taped inside the register, folded in four",
    title: "THE WILL",
    body: [
      "Kids. The shop goes to both of you. Do not argue about it, I can hear you arguing about it from here.",
      "Rhea takes the counter. You take the bench. You are bad with people and she is bad with computers. Between the two of you there is exactly one whole shopkeeper. That was always the design.",
      "The back room stays locked until it does not. You will know the difference. Love, Dad.",
    ],
    benchNote: "Found this before I found anything else in this place. Should have started here.",
  },
  {
    id: "backroom",
    unlockAtRun: 0,
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
    benchNote: "Rhea calls it quarantine, a virus Dad walled off years back and never wiped. Maybe. It opened like it was expecting me.",
  },
  {
    id: "failed1",
    unlockAtRun: 1,
    kind: "memo",
    filename: "SESSION_001.LOG",
    doctype: "LOG",
    provenance: "tower telemetry, first dive, tonight",
    title: "ANOTHER FAILED RUN",
    body: [
      "SESSION LOG. ATTEMPT 001. RESULT: LOSS. OPPONENT ENGAGED NO OFFENSIVE ROUTINE.",
      "EVERY MOVE LOGGED. A SCORE ASSIGNED. CHANNEL CLOSED FROM THE OTHER SIDE. NO DAMAGE TAKEN, EITHER SIGNAL.",
      "TIMESTAMP MATCHES CLOSE OF BUSINESS. NOTHING ELSE ON THIS DRIVE FOR THAT HOUR.",
    ],
    benchNote: "It did not fight me. It graded me, then shut the door. Rhea heard me swearing from the counter. She did not ask.",
  },
  {
    id: "bills",
    unlockAtRun: 2,
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
    benchNote: "There are eleven of these, filed under W for whatever, one balance alone worth more than this shop clears in a year. Stage three of what. He fixed computers. He was not a diver, as far as I knew.",
  },
  {
    id: "solder",
    unlockAtRun: 3,
    kind: "memo",
    filename: "FRAGMENT_03.REC",
    doctype: "FRAG",
    provenance: "partial recovery, surfaced off a lost dive, tonight",
    title: "SOLDER SMOKE",
    body: [
      "Fragment surfaces only on a loss. This one has weight to it and no visible seams, like it was always meant to play whole.",
      "A hand. A soldering iron. A small voice asking why the iron does not stick to everything.",
      "His answer, clear as anything: 'Because it only sticks where you have cleaned. Everything joins where it is clean.'",
    ],
    benchNote: "I do not think these are corruption. I think they are cargo.",
  },
  {
    id: "receipts",
    unlockAtRun: 4,
    kind: "bill",
    filename: "RECEIPTS.SCN",
    doctype: "SCAN",
    provenance: "scanned paper, shoebox, pharmacy on 9th, six years of stubs",
    title: "RECEIPTS",
    body: [
      "STRAIN SUPPRESSANT, CASH SALE. WEEKLY REFILL. PHARMACY ON 9TH, SIX YEARS OF DATED STUBS, SAME COUNTER.",
      "DOSAGE STEPS UP EVERY FEW MONTHS LIKE A STAIRCASE, LOGGED RECEIPT TO RECEIPT.",
      "LAST STUB DATED FOUR DAYS BEFORE HE DIED.",
    ],
    benchNote: "Four blocks from our counter, every week, and neither of us ever heard a word about it.",
  },
  {
    id: "diagnosis",
    unlockAtRun: 5,
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
    benchNote: "The seal was never broken. He read this at the clinic, decided it changed nothing, and came home and made dinner.",
  },
  {
    id: "notickets",
    unlockAtRun: 6,
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
    benchNote: "Nobody paid for that machine. He built it on an installment plan, and the currency was his own nervous system.",
  },
  {
    id: "grading",
    unlockAtRun: 8,
    kind: "memo",
    filename: "SESSION_SUMMARY.LOG",
    doctype: "LOG",
    provenance: "tower telemetry, aggregate, eight sessions logged",
    title: "IT IS GRADING ME",
    body: [
      "SESSION VARIANCE REPORT. OPPONENT DIFFICULTY TRACKS OPERATOR PERFORMANCE WITHIN A NARROW BAND, SESSION OVER SESSION.",
      "NO SESSION LOGGED AT MAXIMUM DIFFICULTY REGARDLESS OF OPERATOR SKILL FLOOR. NONE LOGGED AT MINIMUM REGARDLESS OF CEILING.",
      "PATTERN CONSISTENT WITH ADAPTIVE INSTRUCTION. NOT CONSISTENT WITH STATIC ACCESS CONTROL.",
    ],
    benchNote: "It is not a lock. It is a curriculum. Dad did not seal something in here. He left something waiting.",
  },
  {
    id: "patch",
    unlockAtRun: 0,
    requiresOpened: true,
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
    benchNote: "The file ends there. Everything after this is just us in the shop. Rhea sat with it for an hour today. She still calls it the virus. It seems to like that.",
  },
];

/** The archive reader's chrome lines (gated with the entries). */
export const DADLOG_CHROME = {
  /** {n} = recovered count, {d} = 9, or 10 once the finale opens PATCH.SYS. */
  volumeHeaderMeta: "DAD.VOL // READ ONLY // RECOVERY {n}/{d}",
  indexRailHeader: "// RECOVERED FILES _",
  damagedRowText: "damaged, partial recovery",
  damagedPage: {
    doctype: "DAMAGED",
    provenance: "partial recovery, more passes needed",
    title: "????",
    body: [
      "SEGMENT DAMAGED. PARTIAL RECOVERY ONLY.",
      "EVERY RUN LOGGED HERE, WIN OR LOSE, WRITES ONE NEW RECOVERY PASS. MORE PASSES RECOVER MORE OF THE SEGMENT.",
    ],
  },
  emptyDrawerState: "VOLUME MOUNTED. NOTHING RECOVERED YET.",
  recoveryBeat: ["READING SEGMENT...", "RECOVERY COMPLETE. FILE MOUNTED."],
  footChipLabel: "FILE",
} as const;

export function visibleJournal(meta: MetaState): { unlocked: JournalEntry[]; nextLocked: JournalEntry | null } {
  const unlocked = JOURNAL_ENTRIES.filter(
    (e) => meta.runCount >= e.unlockAtRun && (!e.requiresOpened || meta.machineOpened),
  );
  const nextLocked =
    JOURNAL_ENTRIES.find(
      (e) => !unlocked.includes(e) && !e.requiresOpened,
    ) ?? null;
  return { unlocked, nextLocked };
}
