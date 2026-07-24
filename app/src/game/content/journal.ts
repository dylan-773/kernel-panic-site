import { MetaState } from "../save";

/**
 * DAD.LOG: the player's own journal. Entries unlock as runs fail and the
 * picture of what the father was doing in the back room fills in. All
 * static; unlock keys are run count plus the finale flag.
 */

export interface JournalEntry {
  id: string;
  /** Visible once meta.runCount >= this (0 = always). */
  unlockAtRun: number;
  /** Requires the finale to have been won. */
  requiresOpened?: boolean;
  kind: "note" | "bill" | "memo";
  title: string;
  date: string;
  body: string[];
}

export const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: "will",
    unlockAtRun: 0,
    kind: "note",
    title: "THE WILL",
    date: "found taped inside the register",
    body: [
      "Kids. The shop goes to both of you. Do not argue about it, I can hear you arguing about it from here.",
      "Rhea takes the counter. You take the bench. You are bad with people and she is bad with computers. Between the two of you there is exactly one whole shopkeeper. That was always the design.",
      "The back room stays locked until it does not. You will know the difference. Love, Dad.",
    ],
  },
  {
    id: "backroom",
    unlockAtRun: 0,
    kind: "memo",
    title: "THE BACK ROOM",
    date: "day one at the bench",
    body: [
      "Every machine in this shop has a ticket, an owner, and a smell. Except one.",
      "The tower in the back room has no ticket. Rhea says it is quarantined, that Dad walled off a nasty virus in there years ago and never got around to wiping it. She says leave it.",
      "The lock opened for me this morning like it was expecting me.",
    ],
  },
  {
    id: "failed1",
    unlockAtRun: 1,
    kind: "memo",
    title: "ANOTHER FAILED RUN",
    date: "after the first dive",
    body: [
      "Another failed run. That damned computer.",
      "What was Dad hiding in there? Whatever security protocol he wrote for that thing is unlike anything I have ever seen. It did not fight me. It graded me, and then it shut the door.",
      "Rhea heard me shouting from the counter. She did not ask.",
    ],
  },
  {
    id: "bills",
    unlockAtRun: 2,
    kind: "bill",
    title: "THE DRAWER OF BILLS",
    date: "bottom drawer of the bench",
    body: [
      "MERIDIAN NEUROCARE - FINAL NOTICE. Patient: Overby. Diagnosis code NF-3, neurofilament degradation, stage three. Balance outstanding: more than this shop clears in a year.",
      "There are eleven of these. He filed them under W for whatever.",
      "Stage three of what? He fixed computers. He was not a diver. As far as I knew.",
    ],
  },
  {
    id: "solder",
    unlockAtRun: 3,
    kind: "memo",
    title: "SOLDER SMOKE",
    date: "cannot place the year",
    body: [
      "The machine leaks when I lose. Fragments. Tonight it was his hands and a soldering iron and my own voice, small, asking why the iron does not stick to everything.",
      "Because it only sticks where you have cleaned, he said. Everything joins where it is clean.",
      "I do not think these fragments are corruption. I think they are cargo.",
    ],
  },
  {
    id: "receipts",
    unlockAtRun: 4,
    kind: "bill",
    title: "RECEIPTS",
    date: "pharmacy on 9th, shoebox",
    body: [
      "Strain suppressants. Filled weekly, cash, going back six years. The dosage climbs every few months like a staircase.",
      "The last receipt is dated four days before he died.",
      "He stood at that counter every week, four blocks from ours, and never said a word to either of us.",
    ],
  },
  {
    id: "diagnosis",
    unlockAtRun: 5,
    kind: "bill",
    title: "THE DIAGNOSIS",
    date: "sealed envelope, never opened until now",
    body: [
      "Meridian consult summary. Chronic neural strain scarring, cumulative. Cause: sustained high-intensity dive activity, estimated in excess of nine thousand logged hours.",
      "Recommendation, underlined twice by some doctor who clearly did not know him: CEASE ALL DIVE ACTIVITY IMMEDIATELY.",
      "The envelope was sealed. He read his death sentence at the clinic, decided it changed nothing, and came home and made dinner.",
    ],
  },
  {
    id: "notickets",
    unlockAtRun: 6,
    kind: "memo",
    title: "NO TICKETS",
    date: "went through the ledger twice",
    body: [
      "Nine thousand hours. I checked the ledger for the client who owned that machine. There is no client. Nobody ever paid for work on the back room tower.",
      "The dive hours were his own. Nightly, after close, for years. The strain that killed him was not an accident and it was not a job.",
      "He was building something in there and he paid for it with his nervous system, on an installment plan, in secret.",
    ],
  },
  {
    id: "grading",
    unlockAtRun: 8,
    kind: "memo",
    title: "IT IS GRADING ME",
    date: "cannot sleep",
    body: [
      "Security keeps people out. This is not security.",
      "It goes easy when I am weak. It gets harder exactly as fast as I get better. It uses every trick I have learned, back at me, like a sparring partner who has read my file.",
      "It is not a lock. It is a curriculum. Dad did not seal something in. He left something waiting.",
    ],
  },
  {
    id: "patch",
    unlockAtRun: 0,
    requiresOpened: true,
    kind: "note",
    title: "PATCH",
    date: "the morning after",
    body: [
      "Its name is Patch. He named it for the thing that holds a broken thing together while it mends.",
      "Nine thousand hours. The bills, the suppressants, the nights. He spent the last of his signal teaching a machine how to raise the difficulty gently, because he knew he would not be here to do it himself.",
      "Rhea sat with it for an hour today. She still calls it the virus. It seems to like that.",
    ],
  },
];

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
