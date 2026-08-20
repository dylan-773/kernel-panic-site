import { RepairDef } from "./repairs";

/**
 * The story spine, repair-keyed. The player is alone: no sibling exists
 * (reveal-schedule prohibition 5), the back room has no padlock and never
 * did (ruling 15), and the virus theory is the player's own assumption,
 * argued out of himself across Sundays (ruling 17). Reveals are keyed to
 * shop repairs (ruling 16): fixing what Dad left broken turns up artifacts
 * and numbered recovered sectors. Nothing before a win states what is
 * inside the machine, and the opponent is INTRUSION everywhere pre-win
 * (ruling 11). Copy gated story-redesign-2026-08-16.
 */

export interface StoryBeat {
  /** Who is talking; "system" renders as terminal text. */
  speaker: "father" | "system" | "companion";
  /** Speaker display name override (defaults by speaker). */
  name?: string;
  /** Public asset path of a portrait to show, if any. */
  portrait?: string;
  /** Public asset path of a full-width illustrated still, if any. */
  still?: string;
  lines: string[];
}

export interface Scene {
  id: string;
  beats: StoryBeat[];
}

const FATHER = "/assets/px/portraits/father.png";
const COMPANION = "/assets/px/portraits/companion.png";
const STILL_BENCH = "/assets/px/stills/still-bench.png";
const STILL_OPEN = "/assets/px/stills/still-open.png";

/** First boot: alone, the will read, the door open, his own guess. */
export function tutorialIntroScene(): Scene {
  return {
    id: "tutorial-intro",
    beats: [
      { speaker: "system", lines: ["BENCH TERMINAL: FIRST BOOT.", "DAD.VOL: FOUND, UNMOUNTED."] },
      {
        speaker: "system",
        lines: [
          "THE WILL IS ALREADY READ. THE COUNTER IS ALREADY YOURS.",
          "ONE LINE ABOUT THE BACK ROOM: IT STAYS LOCKED UNTIL IT DOES NOT.",
        ],
      },
      {
        speaker: "system",
        lines: [
          "No curtain. No drifts to push past, not back there. Just a door, standing open the way he left it.",
          "The tower is the only thing in this shop Dad ever put away properly.",
        ],
      },
      {
        speaker: "system",
        lines: [
          "Whatever is running in there, nobody ever told me what it is. I have my own guess.",
          "Locked room, dead man, a machine that still draws power. Call it a virus and move on.",
        ],
      },
      { speaker: "system", lines: ["OVERRIDE ACCEPTED.", "MANUAL DIVE INITIATED."] },
    ],
  };
}

/** After the scripted dive fails and the drive reseals, before the first day. */
export function tutorialOutroScene(): Scene {
  return {
    id: "tutorial-outro",
    beats: [
      { speaker: "system", lines: ["CORE UNREACHED.", "NO DAMAGE LOGGED, EITHER SIGNAL."] },
      {
        speaker: "system",
        lines: ["IT DID NOT FIGHT. IT GRADED.", "THEN THE CHANNEL CLOSED. FROM THE OTHER SIDE."],
      },
      {
        speaker: "system",
        lines: [
          "Graded me and shut the door in my face. That is not exactly what I expected out of a quarantine.",
          "Does not mean I am wrong about what is in there. Just means I do not know yet.",
        ],
      },
      { speaker: "system", lines: ["MORNING.", "THE SHOP OPENS ANYWAY."] },
    ],
  };
}

/** Terminal one-liners for the working mornings, rotating by week. */
const MORNING_LINES: Record<string, string[]> = {
  first: [
    "FIRST MORNING. Register open. Nobody else is coming down to open it.",
    "Three tickets on the spike, and none of them have your handwriting on them yet.",
    "The back room door is exactly where it was last night. Open.",
    "Shop is yours now. Start somewhere.",
  ],
  mon: [
    "MONDAY. Register open. Spike is empty. Not for long.",
    "MONDAY. Whatever broke over the weekend is already on its way in.",
    "MONDAY. Coffee is on you today. It is on you every day.",
    "MONDAY. Fresh week, same shop, same door out back.",
  ],
  tue: [
    "TUESDAY. Yesterday's regulars already know where the bell is.",
    "TUESDAY. Strain carries over. So does the mess on the bench.",
    "TUESDAY. Somebody's chess cabinet is not going to fix itself.",
    "TUESDAY. Word is getting around the block. Good or bad, hard to say yet.",
  ],
  wed: [
    "WEDNESDAY. Halfway to Sunday. The spike does not know that.",
    "WEDNESDAY. The back room has been quiet. Just quiet.",
    "WEDNESDAY. Three tickets and a stack of somebody else's clutter still to move.",
    "WEDNESDAY. Ledger is balanced. Barely.",
  ],
  thu: [
    "THURSDAY. The hard cases are starting to find you.",
    "THURSDAY. Four tickets before ten. Take them anyway.",
    "THURSDAY. Strain is a budget. Spend it like rent is due.",
    "THURSDAY. Somebody asked if you fix possessed machines. Told them intrusions. Same look either way.",
  ],
  fri: [
    "FRIDAY. Last full day before the week folds into itself.",
    "FRIDAY. The queue is long and getting longer by the hour.",
    "FRIDAY. One more day of paying work before the back room gets its turn.",
    "FRIDAY. Everybody wants it fixed before the weekend. Everybody always does.",
  ],
  sat: [
    "SATURDAY. Last day of the week that pays. Spend it well.",
    "SATURDAY. Tomorrow the shop is closed and the back room is not.",
    "SATURDAY. Whatever is waiting for you tomorrow can wait one more day of customers first.",
    "SATURDAY. The week closes out today. The book does not care if you are tired.",
  ],
};

const WD_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The morning line for a working day (1-based calendar day, never Sunday). */
export function morningLine(day: number): string {
  if (day === 1) return MORNING_LINES.first[0];
  const wd = (day - 1) % 7;
  const week = Math.floor((day - 1) / 7);
  const pool = MORNING_LINES[WD_KEYS[Math.min(wd, 5)]];
  return pool[week % pool.length];
}

/** The Sunday scene for the nth Sunday seen (0-based); later Sundays rotate. */
export function sundayScene(sundaysSeen: number): Scene {
  const scenes: Scene[] = [
    {
      id: "sunday-1",
      beats: [
        { speaker: "system", lines: ["SUNDAY."] },
        {
          speaker: "system",
          lines: [
            "No tickets. No register to mind. Just the shop, and the one door in it that is never actually locked.",
          ],
        },
        {
          speaker: "system",
          lines: [
            "First one of these. A whole day with nowhere else to be but here.",
            "It graded me once and sent me home standing. I keep turning that over. Not what I expected out of a quarantine.",
          ],
        },
      ],
    },
    {
      id: "sunday-2",
      beats: [
        { speaker: "system", lines: ["SUNDAY."] },
        {
          speaker: "system",
          lines: [
            "I have been calling it a virus since the first morning I stood in that doorway. Nobody told me that. I told me that.",
          ],
        },
        {
          speaker: "system",
          lines: [
            "A virus does not grade you and shut the door polite about it. I do not think it is a virus. There. Said it, to an empty shop, which is the only company I have for saying it to.",
            "I do not know what it is instead. Not yet.",
          ],
        },
      ],
    },
    {
      id: "sunday-3",
      beats: [
        { speaker: "system", lines: ["SUNDAY."] },
        {
          speaker: "system",
          lines: [
            "Feels wrong calling it anything at this point, virus or otherwise. Do not have a better word. Working on it.",
          ],
        },
        {
          speaker: "system",
          lines: [
            "Whatever it is back there, it has been more patient with me than I have been with it. Strange thing to notice about a machine.",
          ],
        },
      ],
    },
    {
      id: "sunday-4",
      beats: [
        { speaker: "system", lines: ["SUNDAY."] },
        {
          speaker: "system",
          lines: [
            "Same door. Same quiet. I know the walk back there by feel now, same as the walk to the counter.",
          ],
        },
        {
          speaker: "system",
          lines: [
            "Ready, maybe. Or just tired of being scared of my own shop. Most days those feel like the same thing.",
          ],
        },
      ],
    },
  ];
  return scenes[Math.min(sundaysSeen, scenes.length - 1)];
}

/** Strain zero: the day is lost, the shop is not. */
export function bustScene(): Scene {
  return {
    id: "bust",
    beats: [
      { speaker: "system", lines: ["NEURAL STRAIN: ZERO.", "CONNECTION SEVERED."] },
      {
        speaker: "system",
        lines: [
          "YOU WAKE AT THE BENCH. THE IRON WENT COLD HOURS AGO.",
          "TODAY'S TAKE IS GONE WITH IT. NOTHING BANKED TAKES THE HIT.",
        ],
      },
      {
        speaker: "system",
        lines: [
          "Whoever's machine that was, it goes home the way it came in. Still broken.",
          "That part does not show up on any strain readout, and it is the part that stays with me.",
        ],
      },
      {
        speaker: "system",
        lines: ["NO EVENING TONIGHT.", "JUST THE STAIRS, AND TOMORROW ON THE OTHER SIDE OF THEM."],
      },
    ],
  };
}

/**
 * Recovered sector playbacks, one per sector-carrying repair. Every
 * fragment stands alone: the player fixes the shop in their own order
 * (ruling 16). Sector 7's gap is in-fiction audio damage: the recording
 * loses the word (reveal-schedule prohibition 1 holds it back until a win).
 */
const SECTOR_SCENES: Record<number, Scene> = {
  1: {
    id: "sector-1",
    beats: [
      { speaker: "system", lines: ["RECOVERED SECTOR 1 OF 9.", "PLAYBACK FOLLOWS."] },
      {
        speaker: "father",
        still: STILL_BENCH,
        lines: [
          "Hold the iron like a pencil, not a hammer. There.",
          "See? The joint holds because you were patient with it.",
          "Most things do.",
        ],
      },
    ],
  },
  2: {
    id: "sector-2",
    beats: [
      { speaker: "system", lines: ["RECOVERED SECTOR 2 OF 9.", "PLAYBACK FOLLOWS."] },
      {
        speaker: "father",
        portrait: FATHER,
        lines: [
          "This bench light is the only one on the block.",
          "Go back to bed, kiddo. I will be up a while yet.",
          "The shop and I have some talking to do.",
        ],
      },
    ],
  },
  3: {
    id: "sector-3",
    beats: [
      { speaker: "system", lines: ["RECOVERED SECTOR 3 OF 9.", "AUDIO DEGRADED. PLAYBACK FOLLOWS."] },
      {
        speaker: "father",
        still: STILL_BENCH,
        lines: [
          "Test. Test. Are you getting all of this?",
          "Good. Start with the shop. The day I got the keys.",
          "He should hear it in my voice, not read it off a screen.",
        ],
      },
    ],
  },
  4: {
    id: "sector-4",
    beats: [
      { speaker: "system", lines: ["RECOVERED SECTOR 4 OF 9.", "PLAYBACK FOLLOWS."] },
      {
        speaker: "father",
        portrait: FATHER,
        lines: [
          "Again. You almost had me that time.",
          "Do not go easy on me. If you learn to go easy, you will ruin the whole point.",
          "One more game, then I open the shop.",
        ],
      },
    ],
  },
  5: {
    id: "sector-5",
    beats: [
      { speaker: "system", lines: ["RECOVERED SECTOR 5 OF 9.", "PLAYBACK FOLLOWS."] },
      {
        speaker: "father",
        still: STILL_BENCH,
        lines: [
          "I know it hurts when I pull the power. I am sorry.",
          "You are not a tool. I stopped thinking of you that way a long time ago.",
        ],
      },
    ],
  },
  6: {
    id: "sector-6",
    beats: [
      { speaker: "system", lines: ["RECOVERED SECTOR 6 OF 9.", "PLAYBACK FOLLOWS."] },
      {
        speaker: "father",
        portrait: FATHER,
        lines: [
          "He is not ready yet. Keep the door shut.",
          "I am not going to spell out when that changes. You will know it before I would.",
          "Be patient with him the way I was patient with you. That is the whole instruction.",
        ],
      },
    ],
  },
  7: {
    id: "sector-7",
    beats: [
      { speaker: "system", lines: ["RECOVERED SECTOR 7 OF 9.", "AUDIO DAMAGED. PARTIAL RECOVERY."] },
      {
        speaker: "father",
        still: STILL_BENCH,
        lines: ["Everything that lives in this shop gets a name. House rule."],
      },
      { speaker: "system", lines: ["SIGNAL LOST.", "GAP IN THE RECORDING."] },
      {
        speaker: "father",
        still: STILL_BENCH,
        lines: [
          "...the thing that holds a broken thing together while it mends.",
          "Yeah. He is going to like you.",
        ],
      },
    ],
  },
};

export function sectorScene(sector: number): Scene | null {
  return SECTOR_SCENES[sector] ?? null;
}

/** The winning dive's aftermath: the machine opens, alone. */
export function finaleWinScene(): Scene {
  return {
    id: "finale-win",
    beats: [
      {
        speaker: "system",
        lines: ["CORE REACHED.", "SEAL CONDITION MET: A FAIR WIN, NO ASSISTS.", "UNSEALING."],
      },
      {
        speaker: "system",
        still: STILL_OPEN,
        lines: [
          "It does not open so much as let go.",
          "Inside, no rot. No virus. Warm light, and a face drawn in careful lines.",
        ],
      },
      {
        speaker: "companion",
        lines: ["Hello. Finally.", "You hold the iron like a pencil. He said you would."],
      },
      {
        speaker: "companion",
        name: "Patch",
        portrait: COMPANION,
        lines: [
          "My name is Patch. Your father built me for you.",
          "He sealed this door himself. Not until he can beat you fair, he said.",
          "So every dive into this machine, that was me across the grid. I never once let you win.",
        ],
      },
      {
        speaker: "companion",
        name: "Patch",
        portrait: COMPANION,
        lines: [
          "He left you something. He made me practice it until my voice matched his.",
          "I have kept it warm a long time.",
        ],
      },
      {
        speaker: "father",
        portrait: FATHER,
        lines: [
          "Kiddo. If this is playing, you beat him square, and I never got to see it. That is my only complaint.",
          "I could not stay. So I built you somebody who could.",
          "Do not shut him out just because he is not me. And keep my bench clean, you animal.",
        ],
      },
      {
        speaker: "companion",
        name: "Patch",
        portrait: COMPANION,
        lines: [
          "So. Same shop, same door, same three tickets whenever they show up.",
          "Except now you know I am back here. Deal me in sometime. I am very good. You may have noticed.",
        ],
      },
      {
        speaker: "companion",
        name: "Patch",
        portrait: COMPANION,
        lines: ["Bench is yours. Back room is his.", "I am just the one still here."],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Room copy: the scene layer's own words                              */
/* ------------------------------------------------------------------ */

export interface RepairStationCopy {
  label: string;
  /** Examine text while broken: teaches its own unlock by standing there. */
  brokenLine: string;
  fixedLine: string;
  /** The beat read AT the object the moment it is repaired. */
  firstRead: string[];
}

export const REPAIR_STATION_COPY: Record<RepairDef["station"], RepairStationCopy> = {
  solderBay: {
    label: "THE SOLDER BAY",
    brokenLine:
      "Iron is cold, the tip is corroded, and the good flux dried out years ago. Nothing gets crafted here until it does.",
    fixedLine: "Iron heats clean now. Whatever needs welding, weld it here.",
    firstRead: [
      "Something surfaces out of the old flux tin, half memory, half corrupted file.",
      "Sounds like him. Recorded right here, at this bench. Filed to DAD.VOL for the rest of it.",
    ],
  },
  onionRouter: {
    label: "THE ONION ROUTER",
    brokenLine:
      "A box of relays with the antenna snapped clean off. No line out of this shop goes further than the front counter until it is fixed.",
    fixedLine: "Three hops out and no name on the other end. The line is live.",
    firstRead: [
      "Behind the relay board, a scrap of paper taped flat. Call signs, a rotating schedule, nothing that reads like a customer.",
      "Whoever he traded parts with out here, they never once put a name on anything either.",
    ],
  },
  diagBench: {
    label: "THE DIAGNOSTIC BENCH",
    brokenLine:
      "Half the readouts lie and the other half do not answer at all. Every intake stays a guess until this is fixed.",
    fixedLine: "Every reading comes back honest now. No more guessing what walked in the door.",
    firstRead: [
      "Under the busted panel, taped where a hand would find it and nowhere else, a sealed envelope.",
      "Still sealed. Filed to DAD.VOL for the read.",
    ],
  },
  powerBox: {
    label: "THE POWER BOX",
    brokenLine:
      "The breaker trips if the back room and the bench both draw at once. Something back there has been rationing this box for a long time.",
    fixedLine: "The breaker holds steady now, even with the back room pulling full load.",
    firstRead: [
      "The meter logs go back years. One line draws power every night, same hours, and has for as long as the log runs.",
      "No ticket attached to that line. No client. Just power, spent on nothing anyone ever billed for.",
      "You do not run a meter like that for something you are trying to get rid of.",
    ],
  },
  shelves: {
    label: "THE SHELVES",
    brokenLine:
      "Boxes stacked to the ceiling, none of them labeled. Whatever else is buried under this clutter stays buried until it is cleared.",
    fixedLine: "Shelved, sorted, and out of the way at last. The room breathes easier.",
    firstRead: [
      "A shoebox near the bottom, heavier than a box of paper has any right to be.",
      "Pharmacy stubs, hundreds of them, same handwriting on every one. Filed to DAD.VOL.",
    ],
  },
  bottomDrawer: {
    label: "THE BOTTOM DRAWER",
    brokenLine:
      "The drawer is swollen shut, paper jammed in the track. Whatever is filed in here stays filed in here until it is pried open.",
    fixedLine: "The drawer slides clean now. Everything filed under W finally sees light.",
    firstRead: [
      "Eleven envelopes under the false bottom, same return address on every one, filed under a letter that does not stand for a name.",
      "Every one marked FINAL. Filed to DAD.VOL.",
    ],
  },
  ledgerTerminal: {
    label: "THE LEDGER TERMINAL",
    brokenLine:
      "The books boot to a cursor and nothing else. Today against lifetime stays a guess until this reads clean.",
    fixedLine: "The ledger reads clean now. Today against lifetime, on one screen.",
    firstRead: [
      "The boot sector was jammed on a cross reference he ran twice and never deleted.",
      "Nine thousand hours, checked against every invoice this shop ever wrote. Filed to DAD.VOL.",
    ],
  },
  driveRig: {
    label: "THE DRIVE RECOVERY RIG",
    brokenLine:
      "Half the platters spin and half do not. Whatever is left of DAD.VOL stays half a file until this rig reads clean.",
    fixedLine: "Every platter spins true now. DAD.VOL reads deeper than it ever has.",
    firstRead: [
      "The rig pulls a session summary off the tower first. Every dive logged, aggregated, cold as a spreadsheet. Filed to DAD.VOL.",
      "Underneath it, something older. Damaged. Slow to come back clean.",
    ],
  },
};

/**
 * Per-stage first reads for multi-stage stations. Station-level firstRead
 * text describes the FIRST stage's find; replaying it on a later stage is a
 * false claim (ruling 21, and the loremaster's 2026-08-19 note). A stage
 * keyed here reads these lines at the object instead.
 */
export const REPAIR_STAGE_FIRST_READ: Partial<Record<import("./repairs").RepairId, string[]>> = {
  diagBench2: [
    "The deeper pass turns up more than clean readouts. It shakes a sector loose from the bench's own cache, buried under years of noise.",
    "Damaged, but not gone. It queues itself before you can even reach for it.",
  ],
  diagBench3: [
    "Behind the last panel sits a reference rig he built from scratch, no manufacturer stamp on it anywhere.",
    "Every calibration point is filed by hand, checked twice, logged in his own writing on a card taped to the housing.",
    "PATIENT WORK READS HONEST, the card says, underlined once. Nothing else on it.",
  ],
};

export const COUNTER_COPY = {
  greetPrompt: "NEW CUSTOMER AT THE COUNTER.",
  acceptLabel: "TAKE THE JOB",
  declineLabel: "SEND THEM ON",
  declineLine: "DECLINED. THEY TAKE THE DEVICE ELSEWHERE.",
  waitingLine: "STILL WAITING AT THE COUNTER.",
  doorBell: "THE BELL OVER THE DOOR GOES OFF.",
} as const;

export const ROOM_COPY = {
  benchPrompt: "SIT AT THE BENCH",
  standPrompt: "STAND UP",
  stairsPrompt: "GO UPSTAIRS",
  stairsDownPrompt: "GO DOWNSTAIRS",
  bedPromptOpen: "SLEEP",
  bedPromptHeld: "SLEEP. EVERYTHING HELD TONIGHT BANKS ON THE WAY UP.",
  closePromptHeld: "CLOSE THE SHOP. EVERYTHING HELD BANKS THE MOMENT YOU DO.",
  closePromptEmpty: "CLOSE THE SHOP.",
  backroomPromptWeekday: "THE BACK ROOM DOOR. OPEN, LIKE ALWAYS. THAT IS A SUNDAY PROBLEM.",
  backroomPromptSunday: "THE BACK ROOM DOOR. OPEN, LIKE ALWAYS. TRY IT?",
  backroomPromptSpent: "THE TOWER IS COOLING DOWN. ONE ATTEMPT A SUNDAY IS ALL IT ANSWERS.",
  backroomPromptOpened: "THE BACK ROOM. IT IS IN THERE. THE DOOR STAYS OPEN NOW.",
  doorPrompt: "GO IN",
  counterPrompt: "THE COUNTER",
  registerRead: [
    "Folded in four, taped where the till drops in. Still there.",
    "Whole thing is addressed to you. Filed to DAD.VOL for the rest of it.",
  ],
  spikeReadEmpty: "SPIKE IS EMPTY. NOTHING WAITING.",
  spikeReadJobs: "TICKETS ON THE SPIKE. SOMEBODY IS WAITING ON EVERY ONE OF THEM.",
} as const;

export const EVENING_COPY = {
  openLine: "THE SHOP IS SHUT. THE NIGHT IS YOURS TO SPEND.",
  closedLine: "EVENING CLOSED. STRAIN TOOK IT WITH THE HAUL.",
  sleepCommitLine: "LIGHTS OUT. EVERYTHING SPENT TONIGHT STAYS SPENT. EVERYTHING BANKED STAYS BANKED.",
} as const;
