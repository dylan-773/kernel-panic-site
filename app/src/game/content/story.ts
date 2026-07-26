/**
 * The story spine: counter scenes at run start, wake-up scenes after a run
 * dies, and the finale. Failed runs are the delivery mechanism. Rhea's virus
 * theory erodes run by run, and recovered fragments of Dad surface after
 * every death, building toward what the locked machine actually holds.
 */

export interface StoryBeat {
  /** Who is talking; "system" renders as terminal text. */
  speaker: "sister" | "father" | "system" | "companion";
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

const SISTER = "/assets/px/portraits/sister.png";
const FATHER = "/assets/px/portraits/father.png";
const COMPANION = "/assets/px/portraits/companion.png";
const STILL_LOCKED = "/assets/px/stills/still-locked.png";
const STILL_BENCH = "/assets/px/stills/still-bench.png";
const STILL_COUNTER = "/assets/px/stills/still-counter.png";
const STILL_OPEN = "/assets/px/stills/still-open.png";

function strainBeat(runCount: number): StoryBeat {
  return {
    speaker: "system",
    lines: ["NEURAL STRAIN: ZERO.", "CONNECTION SEVERED.", "RUN " + runCount + " LOGGED."],
  };
}

/** Counter scene when a new run begins. runCount is 1-based. */
export function runOpenerScene(runCount: number): Scene {
  const id = "run-open-" + runCount;
  switch (runCount) {
    case 1:
      return {
        id,
        beats: [
          {
            speaker: "system",
            lines: ["SHOP TERMINAL ONLINE.", "NEW PROPRIETOR REGISTERED.", "Ten days on the book. Make them count."],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "So the bench is yours now. Keys, tools, debt, all of it.",
              "He would have hated how clean I kept it.",
            ],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "One rule. The machine in the back room stays locked.",
              "It is just a nasty virus in there, and Dad never got around to wiping it. Leave it.",
            ],
          },
          {
            speaker: "system",
            still: STILL_LOCKED,
            lines: [
              "Behind the curtain, past drifts of Dad's clutter, the machine waits.",
              "The padlock is the only thing in this shop Dad ever put away properly.",
            ],
          },
        ],
      };
    case 2:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 2.", "The lock is where you left it. So is the debt."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["You scared me last night. Whatever is wrong with that machine does not get to take my brother too."],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "You went back in. I heard the fans spin up at two in the morning.",
              "It is a virus. Viruses do not need your whole night.",
              "Customers first. Then do whatever it is you are doing.",
            ],
          },
        ],
      };
    case 3:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 3.", "The bench knows your weight now."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["You slept maybe two hours. I counted the mug rings on the bench. That is how I know."],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "You keep going back. Dad had that same look.",
              "Same hours, too. I am not saying anything. I am just saying.",
            ],
          },
        ],
      };
    case 4:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 4.", "The shop opens anyway. It always opens anyway."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["I keep thinking about the word waited. I should not have said it out loud."],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I stood outside the back room last night. Just listening.",
              "It hums different when you are in there. I hate that I know that.",
            ],
          },
        ],
      };
    case 5:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 5.", "Three tickets on the spike. One padlock in the dark."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["It paces you. I wrote that down and then read it back to myself about six times."],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I oiled the hinges on the back door. Do not read into it.",
              "Three tickets today. Eat something first.",
            ],
          },
        ],
      };
    case 6:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 6.", "The clutter shrinks a little more every week. The padlock never has."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["Kind first, then it takes you apart. What kind of virus plays nice on purpose?"],
          },
          {
            speaker: "sister",
            still: STILL_COUNTER,
            lines: [
              "Dad used to come out of that room smiling. I forgot that until this week.",
              "Go on, then. Customers first. Room later.",
            ],
          },
        ],
      };
    case 7:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 7.", "The shop opens anyway."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I keep hearing you talk back to it. Not shouting. Talking.",
              "I do not know what kind of person does that for a virus, but here we are.",
            ],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["Coffee is on the bench. It is even fresh.", "Come back up this time. I mean it."],
          },
        ],
      };
    case 8:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 8.", "The spike is full. The room is patient."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I did the math twice, hoping I would get a different number. I did not.",
              "Whatever he was doing back there, he paid for it himself. Every month. Nobody made him.",
            ],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["That lock looks looser every week. So does my theory.", "Go earn the rent first."],
          },
        ],
      };
    case 9:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 9.", "The spike refills. It always does."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I left something at the door this morning. Do not ask me why.",
              "If it really is just waiting, I figure waiting is easier with coffee.",
            ],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["Go on, before it gets cold.", "The coffee. I meant the coffee."],
          },
        ],
      };
    case 10:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 10.", "Ten times now. The lock has not moved. Neither have you."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I stood at the curtain again last night. Did not touch it. Just stood there.",
              "It feels wrong to keep calling it that. I do not have a better word yet.",
            ],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["Anyway. Three tickets. The world outside that curtain still needs fixing.", "Go."],
          },
        ],
      };
    case 11:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 11.", "The padlock. The curtain. The same morning, again."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I am not scared walking past that door anymore. I noticed this morning.",
              "I do not know when that happened. Somewhere around run six, maybe. I was not paying attention.",
            ],
          },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "Three tickets. Go be the good half of this shop for a few hours.",
              "Then go be whatever the other half of you is doing in there.",
            ],
          },
        ],
      };
    case 12:
      return {
        id,
        beats: [
          { speaker: "system", lines: ["RUN 12.", "The book resets. The padlock does not."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "Twelve of these now. I have stopped asking when you will stop.",
              "I have started asking what happens when you finally get through.",
            ],
          },
          {
            speaker: "sister",
            still: STILL_COUNTER,
            lines: ["Go find out, then.", "I will keep the coffee hot. Same as every time."],
          },
        ],
      };
    default: {
      // Runs 13 and beyond rotate; Rhea's arc has landed by now.
      const fallbacks: StoryBeat[][] = [
        [
          { speaker: "system", lines: ["RUN " + runCount + ".", "The spike is full. The room is patient."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["Coffee is on the bench. It is even fresh.", "Come back up this time. I mean it."],
          },
        ],
        [
          { speaker: "system", lines: ["RUN " + runCount + ".", "The shop opens anyway."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["I will keep the coffee hot.", "Go earn the rent first."],
          },
        ],
        [
          { speaker: "system", lines: ["RUN " + runCount + ".", "Same bench. Same lock. Different you, maybe."] },
          {
            speaker: "sister",
            portrait: SISTER,
            lines: ["I dreamed Dad was in the back room again. Light under the door.", "Anyway. Tickets. Go."],
          },
        ],
      ];
      return { id, beats: fallbacks[(runCount - 13) % fallbacks.length] };
    }
  }
}

/** Scene after a run dies (strain zero). Sister reacts; from run 2 on, a father fragment follows. */
export function runEndScene(runCount: number): Scene {
  const id = "run-end-" + runCount;
  switch (runCount) {
    case 1:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "Told you. It is just a nasty virus, and it nearly cooked you.",
              "The shop needs you conscious. Leave that room alone.",
            ],
          },
        ],
      };
    case 2:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "Again? Look at your hands. They are still shaking.",
              "Nasty virus. That is all it is. That is all it has to be.",
            ],
          },
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
      };
    case 3:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I watched the feed this time. It waited for you at the core.",
              "Viruses do not wait. Please do not tell me it waited.",
            ],
          },
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
      };
    case 4:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I read the intrusion logs. Start to finish, twice.",
              "It goes easy early and hard late. It paces you. Viruses do not pace anybody.",
            ],
          },
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
      };
    case 5:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "It learns. I am an idiot for saying that out loud, but it learns.",
              "It played you kind tonight, then it took you apart. Kind first. Why kind?",
            ],
          },
          { speaker: "system", lines: ["RECOVERED SECTOR 4 OF 9.", "PLAYBACK FOLLOWS."] },
          {
            speaker: "father",
            portrait: FATHER,
            lines: [
              "He is not ready yet. Keep the door shut.",
              "Not until he can beat you square. Promise me.",
              "No shortcuts. He will hate it. That is fine.",
            ],
          },
        ],
      };
    case 6:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "What was he doing back there? All those nights, all those years.",
              "I used to fall asleep to him talking through that wall. I thought it was the radio.",
            ],
          },
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
      };
    case 7:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I did the math on the old power bills.",
              "Whatever he built back there, he fed it for years. In the dark, out of his own pocket.",
              "You do not do that for a virus.",
            ],
          },
          { speaker: "system", lines: ["RECOVERED SECTOR 6 OF 9.", "PLAYBACK FOLLOWS."] },
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
      };
    case 8:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I do not think it is a virus. There. Said it.",
              "I think it is waiting. I think it has been waiting a long time.",
            ],
          },
          { speaker: "system", lines: ["RECOVERED SECTOR 7 OF 9.", "PLAYBACK FOLLOWS."] },
          {
            speaker: "father",
            still: STILL_BENCH,
            lines: [
              "Everything that lives in this shop gets a name. House rule.",
              "Patch. Because that is what you are. The thing that holds a broken thing together while it mends.",
              "Patch. Yeah. He is going to like you.",
            ],
          },
        ],
      };
    case 9:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "You are getting up slower every time. Or I am getting more scared every time. Hard to tell which anymore.",
              "I want to believe it lets you through eventually. I did not expect to be the one hoping.",
            ],
          },
          { speaker: "system", lines: ["SECTOR SCAN: NO NEW DATA.", "ECHO FOLLOWS."] },
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
      };
    case 10:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I still think about the wall, some nights. Him talking to something on the other side of it.",
              "I used to think it was the radio. I know better now. I still like pretending, some nights.",
            ],
          },
          { speaker: "system", lines: ["SECTOR SCAN: NO NEW DATA.", "ECHO FOLLOWS."] },
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
      };
    case 11:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "I am done being scared of that room. I do not know what I am instead.",
              "Ready, maybe. Or just tired of being scared. Some days those are the same thing.",
            ],
          },
          { speaker: "system", lines: ["SECTOR SCAN: NO NEW DATA.", "ECHO FOLLOWS."] },
          {
            speaker: "father",
            portrait: FATHER,
            lines: [
              "He is not ready yet. Keep the door shut.",
              "Not until he can beat you square. Promise me.",
              "No shortcuts. He will hate it. That is fine.",
            ],
          },
        ],
      };
    case 12:
      return {
        id,
        beats: [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "Twelve times now. I stopped counting how many times you have gone in.",
              "I started counting how close you are coming back out.",
            ],
          },
          { speaker: "system", lines: ["SECTOR SCAN: NO NEW DATA.", "ECHO FOLLOWS."] },
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
      };
    default: {
      // Runs 13 and beyond rotate echoes; no new data before the finale.
      const fallbacks: StoryBeat[][] = [
        [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "Up. Slowly. There is soup.",
              "One of these nights it is going to let you through. I have started believing that.",
            ],
          },
          { speaker: "system", lines: ["SECTOR SCAN: NO NEW DATA.", "ECHO FOLLOWS."] },
          {
            speaker: "father",
            portrait: FATHER,
            lines: ["The joint holds because you were patient with it.", "Most things do."],
          },
        ],
        [
          strainBeat(runCount),
          {
            speaker: "sister",
            portrait: SISTER,
            lines: [
              "You were smiling when I dragged you off the bench. Bad sign. Or a good one.",
              "Tomorrow, then.",
            ],
          },
          { speaker: "system", lines: ["SECTOR SCAN: NO NEW DATA.", "ECHO FOLLOWS."] },
          {
            speaker: "father",
            portrait: FATHER,
            lines: ["Not until he can beat you square.", "Promise me."],
          },
        ],
      ];
      return { id, beats: fallbacks[(runCount - 13) % fallbacks.length] };
    }
  }
}

/** The finale: the machine opens. */
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
          "The padlock does not open so much as let go.",
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
          "Look after your sister. Let her look after you. And keep my bench clean, you animal.",
        ],
      },
      {
        speaker: "companion",
        name: "Patch",
        portrait: COMPANION,
        lines: [
          "So. Ten days, three tickets a day, a shop to keep alive.",
          "Deal me in. I am very good. You may have noticed.",
        ],
      },
      {
        speaker: "sister",
        still: STILL_COUNTER,
        lines: [
          "Some virus.",
          "He laughs at the edges the way Dad did. You heard it too.",
          "Counter is mine, bench is yours, back room is his. We will make that work.",
        ],
      },
    ],
  };
}

/** Before the scripted first dive: caught at the curtain, keys not yet handed over. */
export function tutorialIntroScene(): Scene {
  return {
    id: "tutorial-intro",
    beats: [
      { speaker: "system", lines: ["BENCH TERMINAL: FIRST BOOT.", "DAD.LOG: FOUND, UNOPENED."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "Do not. I have not even given you the keys yet.",
          "Whatever is back there, it can wait one more day. Can it not?",
        ],
      },
      { speaker: "system", lines: ["OVERRIDE ACCEPTED.", "MANUAL DIVE INITIATED."] },
    ],
  };
}

/** After the scripted dive fails and the machine reseals, before run 1 day 1. */
export function tutorialOutroScene(): Scene {
  return {
    id: "tutorial-outro",
    beats: [
      { speaker: "system", lines: ["CORE UNREACHED.", "THE ROOM SEALS ITSELF AGAIN."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "You scared ten years off me just now.",
          "Whatever Dad locked in there, it stays locked. Are we clear?",
        ],
      },
      { speaker: "system", lines: ["MORNING.", "THE SHOP OPENS ANYWAY."] },
    ],
  };
}

/**
 * Morning cutscene for each day 1..10. Run-count-agnostic by design: the
 * same scene plays on every run's day N, so these stay in the daily shop
 * rhythm register and never carry Rhea's evolving theory.
 */
export function dayOpenScene(day: number): Scene {
  const id = "day-open-" + day;
  const byDay: Record<number, StoryBeat[]> = {
    1: [
      { speaker: "system", lines: ["DAY 1.", "SPIKE: THREE TICKETS.", "REGISTER: OPEN."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "Till is counted. Spike is loaded. Try not to break anything before lunch.",
          "Yell if the fans start smelling like smoke.",
        ],
      },
      { speaker: "system", lines: ["THE CURTAIN AT THE BACK DOES NOT MOVE.", "IT NEVER DOES."] },
    ],
    2: [
      { speaker: "system", lines: ["DAY 2.", "STRAIN CARRIES OVER.", "THE COFFEE DOES NOT."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "Pot is fresh. Drink it before it is not.",
          "The Kestrel courier drone is back. Same customer, new complaint.",
        ],
      },
    ],
    3: [
      { speaker: "system", lines: ["DAY 3.", "WORD IS GETTING AROUND."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "Somebody asked if we fix possessed machines now.",
          "I told them we fix intrusions. They looked disappointed either way.",
        ],
      },
      { speaker: "system", lines: ["THE TICKET SPIKE IS GETTING TALLER.", "SO IS THE LINE OUTSIDE."] },
    ],
    4: [
      { speaker: "system", lines: ["DAY 4.", "THE INTRUSIONS ARE PACING THEMSELVES.", "WATCH FOR IT."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: ["Ledger is balanced. Barely.", "Four tickets came in already and it is not even ten."],
      },
    ],
    5: [
      { speaker: "system", lines: ["DAY 5.", "HALFWAY.", "THE BACK ROOM HAS BEEN QUIET. JUST QUIET."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "Halfway through the book and the shop is still standing. Small miracles.",
          "Eat something. I will not ask twice.",
        ],
      },
      {
        speaker: "system",
        still: STILL_LOCKED,
        lines: ["THE PADLOCK CATCHES THE LIGHT WHEN THE SUN COMES THROUGH THE CURTAIN.", "STILL CLOSED."],
      },
    ],
    6: [
      { speaker: "system", lines: ["DAY 6.", "THREE TICKETS. NO EXCUSES."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "Coffee is on the bench. Drink it before it becomes a science experiment.",
          "The Ledgerstone pawn vault sent someone over again. Good, they pay on time.",
        ],
      },
    ],
    7: [
      { speaker: "system", lines: ["DAY 7.", "THE HARD CASES ARE FINDING YOU."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "Take them anyway. Hard cases pay better and complain less.",
          "Three tickets. One of them looks like it bites.",
        ],
      },
    ],
    8: [
      { speaker: "system", lines: ["DAY 8.", "STRAIN IS A BUDGET.", "SPEND IT LIKE RENT IS DUE."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "The register drawer is getting fat with customer receipts again.",
          "Do the deposit before you dive into anything. Please.",
        ],
      },
    ],
    9: [
      { speaker: "system", lines: ["DAY 9.", "LAST DAY OF PAYING WORK.", "TOMORROW THE BACK ROOM SETTLES UP."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: [
          "Last three tickets before the books close for the cycle.",
          "Whatever is waiting for you tomorrow, it can wait one more day of customers first.",
        ],
      },
    ],
    10: [
      { speaker: "system", lines: ["DAY 10.", "NO TICKETS ON THE SPIKE.", "THE BACK ROOM SETTLES UP TODAY."] },
      {
        speaker: "sister",
        still: STILL_COUNTER,
        lines: [
          "No customers today. Just you, the curtain, and that padlock.",
          "I am not going to pretend I am fine with this. I am going to make coffee instead.",
        ],
      },
      { speaker: "system", lines: ["THE PADLOCK WAITS WHERE IT ALWAYS WAITS.", "TODAY IT EITHER LETS GO OR IT DOES NOT."] },
      {
        speaker: "sister",
        portrait: SISTER,
        lines: ["Go on, then.", "I will be at the counter. Same as always."],
      },
    ],
  };
  return { id, beats: byDay[day] ?? byDay[1] };
}

/** Short terminal one-liners for each day 1..9 morning. */
export const DAY_LINES: string[] = [
  "DAY 1. The shop is yours. Three tickets on the spike.",
  "DAY 2. Three tickets waiting. Strain carries over.",
  "DAY 3. Word is getting around. The tickets are getting stranger.",
  "DAY 4. The intrusions are pacing themselves now. Watch for it.",
  "DAY 5. Halfway. The back room has been quiet. Just quiet.",
  "DAY 6. Rhea left coffee on the bench. Three tickets, no excuses.",
  "DAY 7. The hard cases are finding you. Take them anyway.",
  "DAY 8. Strain is a budget. Spend it like rent is due.",
  "DAY 9. Last day of paying work. Tomorrow the back room settles up.",
];
