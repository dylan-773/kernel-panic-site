import { useEffect, useReducer, useState, type ReactNode } from "react";
import { playMusic, playUiPress, setMuted, setMusicOn, sfx, testBeep, unlockAudio } from "../../game/audio";
import {
  ATTACK_MODE_LABEL,
  AUGMENTS,
  AUGMENT_BY_ID,
  DEFEND_MODE_LABEL,
  MODE_LABEL,
  MODE_TELL,
  OppMode,
  attackModeDesc,
  defendModeDesc,
  scanDesc,
} from "../../game/content/kit";
import { dayDuelConfig, finaleConfig, tutorialConfig, FINAL_DAY } from "../../game/content/arc";
import {
  dayOpenScene,
  finaleWinScene,
  runEndScene,
  runOpenerScene,
  tutorialIntroScene,
  tutorialOutroScene,
} from "../../game/content/story";
import { mixSeed } from "../../game/duel-setup";
import { visibleJournal } from "../../game/content/journal";
import { tip } from "../../game/content/teaching";
import { darkPullPrice, runReducer } from "../../game/run-reducer";
import { PATCH_POUCH_MAX } from "../../game/patch-cells";
import { PatchGlyph } from "../game/patch-glyph";
import { BASE_KIT } from "../../game/duel-types";
import {
  EMPTY_META,
  applyOneTimeSoundReset,
  duelKitOf,
  loadSlotMeta,
  loadSlotRun,
  migrateLegacySave,
  saveSlotMeta,
  saveSlotRun,
} from "../../game/save";
import { DuelScreen } from "../game/duel";
import { TeachProvider } from "../game/teach";
import {
  AnalyzeScreen,
  DesktopIdle,
  FinalePre,
  JobBoard,
  KitScreen,
  ResultScreen,
  StoryScene,
  UpgradeScreen,
  customerById,
} from "../game/screens";
import { BootScreen } from "./boot";
import { LoginScreen } from "./login";
import { DesktopIcon, IconGrid } from "./icons";
import { FloatingWindow, useWindowManager, WinDef } from "./wm";

const WIN_DEFS: WinDef[] = [
  { id: "flow", title: "SHOPFRONT.EXE", x: 230, y: 16, w: 780 },
  { id: "loadout", title: "LOADOUT.CFG", x: 340, y: 46, w: 620 },
  { id: "manual", title: "MANUAL.TXT", x: 120, y: 66, w: 540 },
  { id: "ledger", title: "LEDGER.LOG", x: 500, y: 120, w: 380 },
  { id: "journal", title: "DAD.LOG", x: 200, y: 30, w: 560 },
  { id: "darknet", title: "DARKNET.LNK", x: 420, y: 150, w: 400 },
];

function windowTitle(screen: string | null): string {
  switch (screen) {
    case "analyze":
      return "DIAGNOSTIC.LOG";
    case "opener":
    case "tutIntro":
    case "tutOutro":
    case "runEnd":
    case "finaleWin":
      return "SHOPFRONT";
    case "dayOpen":
      return "MORNING.LOG";
    case "upgrade":
      return "NIGHT.SYS";
    case "finalePre":
      return "BACKROOM.LCK";
    case "day":
      return "JOBS.QUE";
    default:
      return "SHOPFRONT.EXE";
  }
}

/** Flow screens where closing the window has no sensible meaning. */
const UNCLOSABLE_SCREENS = new Set([
  "opener",
  "tutIntro",
  "tutOutro",
  "dayOpen",
  "runEnd",
  "finaleWin",
  "upgrade",
  "result",
]);

function ManualContent() {
  return (
    <div className="kp-manual">
      <h3>HOW A DIVE WORKS</h3>
      <p>
        The whole grid is scrambled junctions. Click one to rotate it a quarter turn (1 RAM). Your
        signal floods live from YOUR port through every aligned pipe and claims what it touches.
        One good rotation can cascade a whole chain. First flood to touch the CORE wins the job.
      </p>
      <p>
        You can rotate your own claimed junctions and any open junction within TWO steps of your
        territory: set up a chain, then trip it. Cascades of four or more claims BANK bonus RAM for
        your next turn. The intrusion floods from the far port under the same rules, on its own
        RAM. Losing a duel zeroes Neural Strain and ends the run. Sloppy wins chip it.
      </p>
      <h3>THE KIT: three programs, 1 RAM, once per turn each</h3>
      <div className="kp-manual-abilities">
        <div className="kp-manual-ability">
          <strong>
            SCAN.EXE<em>always 1 RAM</em>
          </strong>
          <p>{scanDesc(1)} Upgrades widen the sweep. Scan before you walk; every trap it finds stays found.</p>
        </div>
        <div className="kp-manual-ability">
          <strong>
            ATTACK.EXE<em>configurable</em>
          </strong>
          <p>
            {ATTACK_MODE_LABEL.redirect}: {attackModeDesc("redirect", 1)}{" "}
            {ATTACK_MODE_LABEL.armHalt}: {attackModeDesc("armHalt", 1)}{" "}
            {ATTACK_MODE_LABEL.armSiphon}: {attackModeDesc("armSiphon", 1)} Upgrades hit more nodes
            per cast.
          </p>
        </div>
        <div className="kp-manual-ability">
          <strong>
            DEFEND.EXE<em>configurable</em>
          </strong>
          <p>
            {DEFEND_MODE_LABEL.purge}: {defendModeDesc("purge", 1)} {DEFEND_MODE_LABEL.lock}:{" "}
            {defendModeDesc("lock", 1)} {DEFEND_MODE_LABEL.ward}: {defendModeDesc("ward", 1)}{" "}
            Upgrades cover more nodes per cast.
          </p>
        </div>
      </div>
      <h3>PATCH PIECES</h3>
      <p>
        Slag blocks used to take a flat cell. Now they take a shaped piece: straight, elbow, tee,
        or cross. Whatever arms a piece rolls on pickup are the arms it keeps, nothing rotates
        once it is in your pouch, and a placed piece is welded where it lands.
      </p>
      <p>
        Craft two pieces at the bench into the union of their arms. Legal only when the result is
        strictly bigger than both pieces you started with; equal or smaller, the bench will not
        make the join.
      </p>
      <p>
        Three ways into the pouch: buy blind off the darknet, pull one from a cleared job, or bank
        a random piece on a clean win. Five pieces, pouch capped.
      </p>
      <h3>AUGMENTS</h3>
      <div className="kp-manual-abilities">
        {AUGMENTS.map((a) => (
          <div key={a.id} className="kp-manual-ability">
            <strong>
              {a.name}
              <em>{a.kind === "config" ? "config" : "boost"}</em>
            </strong>
            <p>{a.desc}</p>
            {a.requires?.kind === "augment" && (
              <p className="kp-rail-dim">Needs {AUGMENT_BY_ID[a.requires.id]?.name ?? a.requires.id}.</p>
            )}
            {a.requires?.kind === "pouch" && <p className="kp-rail-dim">Needs a piece in the pouch.</p>}
          </div>
        ))}
      </div>
      <h3>BOOST BAYS</h3>
      <p>
        Boosts install into bays, three of them to start. Configs are not boosts and never count
        against the cap.
      </p>
      <p>
        A full bay does not block a new boost, it swaps one: take the drop or keep what is already
        installed. Buy more bays at day close. First one runs 150 cr, the next 300.
      </p>
      <p className="kp-rail-dim">
        Every cleared job offers a draft of augments; every closed day offers +1 RAM or a program
        tier. Everything resets when the run ends. Only you remember.
      </p>
    </div>
  );
}

/**
 * DARKNET.LNK: the gray market. Outside the night phase the vendor is
 * offline and no BUY control exists in the DOM at all; during the night it
 * sells one blind pull at the day's rate, price and balance on the same
 * row, and replays the reveal beat for the last pull.
 */
function DarknetContent({
  run,
  dispatch,
}: {
  run: import("../../game/save").RunState | null;
  dispatch: (a: import("../../game/run-reducer").RunAction) => void;
}) {
  const open = run !== null && run.screen === "upgrade";
  if (!open) {
    return (
      <div className="kp-darknet kp-darknet-offline">
        <p className="kp-darknet-tag">SELLER: SIGNAL SCRAMBLED. NO ID ON FILE.</p>
        <h3>MARKET OFFLINE.</h3>
        <p>Signal only holds after the shop shuts. Trades resume at day close.</p>
      </div>
    );
  }
  const cost = darkPullPrice(run);
  const full = run.patchPouch.length >= PATCH_POUCH_MAX;
  const broke = run.credits < cost;
  return (
    <div className="kp-darknet">
      <p className="kp-darknet-tag">SELLER: SIGNAL SCRAMBLED. NO ID ON FILE.</p>
      <p>Salvage off a hundred dead machines, sorted by nobody.</p>
      <p>Pay first. Shape is the surprise. That is the whole business model here.</p>
      <div className="kp-darknet-row">
        <button
          type="button"
          className="kp-btn-ghost"
          disabled={full || broke}
          title={full ? `POUCH FULL (${PATCH_POUCH_MAX}/${PATCH_POUCH_MAX})` : broke ? `NEED ${cost} CR` : undefined}
          onClick={() => {
            sfx("darknetReveal", { bus: "ui" });
            dispatch({ type: "buyDarkPatch" });
          }}
        >
          BUY BLIND ({cost} cr)
        </button>
        <span className="kp-rail-dim">{run.credits} cr</span>
      </div>
      {full && <p className="kp-rail-dim">Dealer is not a storage locker. Pouch is full. Come back with room.</p>}
      {run.lastDarkBuy !== null && run.darkBuys > 0 && (
        <div className="kp-darknet-reveal" key={run.darkBuys}>
          <span className="kp-darknet-reveal-glyph">
            <PatchGlyph mask={run.lastDarkBuy} size={44} />
          </span>
          <div>
            <p>PIECE ACQUIRED. SHAPE CONFIRMED ON ARRIVAL.</p>
            <p className="kp-rail-dim">Told you. Never know what you're gonna get.</p>
          </div>
        </div>
      )}
      <div className="kp-darknet-pouch">
        <span className="kp-rail-dim">POUCH {run.patchPouch.length}/{PATCH_POUCH_MAX}</span>
        {run.patchPouch.map((m, i) => (
          <PatchGlyph key={i} mask={m} size={20} />
        ))}
      </div>
      <p className="kp-rail-dim">No refunds. No complaints line. Close the window if you want a guarantee.</p>
    </div>
  );
}

function JournalContent({ meta }: { meta: import("../../game/save").MetaState }) {
  const { unlocked, nextLocked } = visibleJournal(meta);
  return (
    <div className="kp-journal">
      {unlocked.map((e) => (
        <article key={e.id} className={`kp-jentry kp-jentry-${e.kind}`}>
          <header>
            <strong>{e.title}</strong>
            <span>{e.date}</span>
          </header>
          {e.body.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </article>
      ))}
      {nextLocked && (
        <article className="kp-jentry kp-jentry-locked">
          <header>
            <strong>????</strong>
            <span>keep diving</span>
          </header>
          <p>There is more in the drawer. It can wait until you cannot sleep again.</p>
        </article>
      )}
    </div>
  );
}

/** Highest-count key in a tally, or null when nothing has been recorded. */
function topOf(counts: Record<string, number>): { key: string; n: number } | null {
  let best: { key: string; n: number } | null = null;
  for (const [key, n] of Object.entries(counts)) {
    if (!best || n > best.n) best = { key, n };
  }
  return best;
}

/**
 * LEDGER.LOG: the current run above the line, the lifetime tallies below.
 * The run rows reset every attempt, which left nothing on screen that a
 * player could point at after twenty of them.
 */
function LedgerContent({
  meta,
  run,
}: {
  meta: import("../../game/save").MetaState;
  run: import("../../game/save").RunState | null;
}) {
  const st = meta.stats;
  const mode = topOf(st.modeUse);
  const lethal = topOf(st.lostTo);
  const lethalName = lethal ? customerById(lethal.key).name : null;
  return (
    <div className="kp-ledgerwin">
      {run ? (
        <>
          <div><span>ATTEMPT</span><em>{run.runNumber}</em></div>
          <div><span>DAY</span><em>{Math.min(run.day, FINAL_DAY)}/10</em></div>
          <div><span>NEURAL STRAIN</span><em>{run.strain}/100</em></div>
          <div><span>CREDITS</span><em>{run.credits} cr</em></div>
          <div><span>RAM / TURN</span><em>{run.ramPerTurn}</em></div>
          <div><span>PATCH POUCH</span><em>{run.patchPouch.length}/{PATCH_POUCH_MAX}</em></div>
          <div><span>BOOST BAYS</span><em>{run.kit.augments.length}/{run.boostSlots}</em></div>
          <div><span>KIT TIERS</span><em>S{run.kit.scanTier} A{run.kit.attackTier} D{run.kit.defendTier}</em></div>
          <div><span>AUGMENTS</span><em>{run.kit.augments.length}/{AUGMENTS.filter((a) => a.kind === "boost").length}</em></div>
        </>
      ) : (
        <div><span>ACTIVE RUN</span><em>none</em></div>
      )}
      <h4 className="kp-ledger-head">LIFETIME</h4>
      <div><span>ATTEMPTS</span><em>{meta.runCount}</em></div>
      <div><span>MACHINE BEATEN</span><em>{st.runsWon}</em></div>
      <div><span>JOBS CLEARED</span><em>{st.divesCleared}</em></div>
      <div><span>DIVES LOST</span><em>{st.divesLost}</em></div>
      <div><span>SCANS RUN</span><em>{st.scans}</em></div>
      <div>
        <span>MOST USED MODE</span>
        <em>{mode ? `${MODE_LABEL[mode.key as OppMode] ?? mode.key} x${mode.n}` : "none yet"}</em>
      </div>
      <div>
        <span>MOST LETHAL</span>
        <em>{lethalName ? `${lethalName} x${lethal!.n}` : "nobody yet"}</em>
      </div>
    </div>
  );
}

export function ShopOS() {
  const [state, dispatch] = useReducer(runReducer, { meta: EMPTY_META, run: null });
  const [ready, setReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const wm = useWindowManager(WIN_DEFS);

  useEffect(() => {
    migrateLegacySave();
    setReady(true);
    const t = setTimeout(() => setBooted(true), 1700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || slot === null) return;
    saveSlotMeta(slot, state.meta);
    saveSlotRun(slot, state.run);
  }, [state, ready, slot]);

  useEffect(() => {
    setMuted(!state.meta.sound);
  }, [state.meta.sound]);

  useEffect(() => {
    setMusicOn(state.meta.music);
  }, [state.meta.music]);

  // Which bed fits the moment: the machine's theme for the tutorial and
  // finale dives, the duel bed for jobs, the desk bed everywhere else.
  const musicScreen = state.run?.screen ?? null;
  const inDive = musicScreen === "duel" || musicScreen === "tutorial";
  const isFinaleDive =
    musicScreen === "tutorial" || (musicScreen === "duel" && state.run?.day === FINAL_DAY);
  useEffect(() => {
    if (slot === null) return;
    void playMusic(inDive ? (isFinaleDive ? "finale" : "dive") : "desk");
  }, [inDive, isFinaleDive, slot]);

  // One delegated listener gives every OS button a press sound.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      unlockAudio();
      const t = e.target as HTMLElement | null;
      if (t?.closest("button")) playUiPress();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  // Every flow transition surfaces the shopfront window (the user may have
  // closed it to sit on the desktop; new game states reopen and focus it).
  const flowScreen = state.run?.screen ?? null;
  useEffect(() => {
    if (flowScreen === "duel" || flowScreen === "tutorial") return;
    wm.open("flow");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowScreen]);

  if (!ready || !booted) {
    return <BootScreen onSkip={ready ? () => setBooted(true) : undefined} />;
  }

  if (slot === null) {
    return (
      <LoginScreen
        onLogin={(n) => {
          dispatch({
            type: "hydrate",
            meta: applyOneTimeSoundReset(loadSlotMeta(n)),
            run: loadSlotRun(n),
          });
          setSlot(n);
        }}
      />
    );
  }

  const { meta, run } = state;
  const screen = run?.screen ?? null;

  // The dive owns the whole screen.
  if (run && (screen === "duel" || screen === "tutorial")) {
    const isTutorial = screen === "tutorial";
    const isFinale = !isTutorial && run.day === FINAL_DAY;
    const job = !isTutorial && run.activeJob !== null ? run.jobs[run.activeJob] : null;
    const customer = job ? customerById(job.customerId) : null;
    const cfg = isTutorial
      ? tutorialConfig()
      : isFinale
        ? finaleConfig()
        : dayDuelConfig(run.day, job?.dominant ?? "redirect", job?.tier ?? 1, job?.kitSeed ?? run.runSeed);
    const duelKit = isTutorial ? BASE_KIT : duelKitOf(run.kit, run.patchPouch);
    return (
      <TeachProvider
        taught={meta.taught}
        day={isTutorial ? 0 : run.day}
        onTaught={(id) => dispatch({ type: "taught", id })}
      >
      <div className="kp-os">
        <DuelScreen
          key={`dive-${run.runSeed}-${run.day}-${run.activeJob ?? "x"}-${screen}`}
          cfg={cfg}
          seed={isTutorial ? mixSeed(run.runSeed, 0, 0) : mixSeed(run.runSeed, run.day, run.activeJob ?? 9)}
          kit={duelKit}
          ramPerTurn={run.ramPerTurn}
          jobTitle={isTutorial || isFinale ? "THE MACHINE" : customer ? customer.device : "UNKNOWN DEVICE"}
          jobSub={
            isTutorial
              ? "The lock gave way this morning. It wanted you to come in."
              : isFinale
                ? "Everything it has. Everything you have."
                : customer
                  ? `${customer.name} - tier ${job?.tier ?? 1} intrusion`
                  : ""
          }
          dominantTell={
            isTutorial
              ? null
              : isFinale
                ? "It runs every config you have ever seen, at full width."
                : job
                  ? MODE_TELL[job.dominant]
                  : null
          }
          strain={run.strain}
          day={isTutorial ? 0 : run.day}
          soundOn={meta.sound}
          onToggleSound={() => dispatch({ type: "toggleSound" })}
          onFinish={(r) => {
            if (isTutorial) dispatch({ type: "tutorialDone" });
            else
              dispatch({
                type: "duelFinished",
                won: r.won,
                chip: r.chip,
                capWin: r.capWin,
                gridlockWin: r.gridlockWin,
                pouchLeft: r.pouchLeft,
                overRotations: r.overRotations,
                trapsFired: r.trapsFired,
                scans: r.scans,
                attackCasts: r.attackCasts,
                defendCasts: r.defendCasts,
              });
          }}
        />
        <div className="kp-crt" aria-hidden="true" />
      </div>
      </TeachProvider>
    );
  }

  let content: ReactNode;
  if (!run) {
    content = <DesktopIdle meta={meta} dispatch={dispatch} />;
  } else {
    switch (run.screen) {
      case "opener":
        content = (
          <StoryScene scene={runOpenerScene(run.runNumber)} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      case "tutIntro":
        content = (
          <StoryScene scene={tutorialIntroScene()} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      case "tutOutro":
        content = (
          <StoryScene scene={tutorialOutroScene()} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      case "dayOpen":
        content = (
          <StoryScene
            scene={dayOpenScene(run.day)}
            tag={`DAY ${run.day}`}
            onDone={() => dispatch({ type: "storyDone" })}
          />
        );
        break;
      case "day":
        content = <JobBoard run={run} dispatch={dispatch} />;
        break;
      case "analyze":
        content = (
          <AnalyzeScreen
            run={run}
            dispatch={dispatch}
            onConfigureKit={() => {
              sfx("icon", { bus: "ui" });
              wm.open("loadout");
            }}
          />
        );
        break;
      case "result":
        content = <ResultScreen run={run} dispatch={dispatch} />;
        break;
      case "upgrade":
        content = <UpgradeScreen run={run} dispatch={dispatch} />;
        break;
      case "finalePre":
        content = (
          <FinalePre
            dispatch={dispatch}
            onConfigureKit={() => {
              sfx("icon", { bus: "ui" });
              wm.open("loadout");
            }}
          />
        );
        break;
      case "runEnd":
        content = (
          <StoryScene scene={runEndScene(run.runNumber)} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      case "finaleWin":
        content = (
          <StoryScene scene={finaleWinScene()} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      default:
        content = null;
    }
  }

  const openJobs = run ? run.jobsDone.filter((d) => !d).length : 0;

  // Highest z among open windows owns focus styling.
  const topId = wm.openIds.reduce(
    (top, id) => (wm.zIndexOf(id) > wm.zIndexOf(top) ? id : top),
    wm.openIds[0] ?? "",
  );

  // Closing the shopfront means different things per screen: a diagnostic
  // backs out to the queue; the queue itself just closes.
  const flowClosable = !UNCLOSABLE_SCREENS.has(screen ?? "");
  const closeFlow = () => {
    sfx("winClose", { bus: "ui" });
    if (screen === "analyze") dispatch({ type: "backToDay" });
    wm.close("flow");
  };

  return (
    <TeachProvider
      taught={meta.taught}
      day={run ? run.day : 0}
      onTaught={(id) => dispatch({ type: "taught", id })}
    >
    <div className="kp-os">
      <div className="kp-wallpaper" aria-hidden="true" />
      <main className="kp-os-desk">
        <IconGrid>
          <DesktopIcon
            label="JOBS.QUE"
            icon="jobs"
            badge={run && openJobs > 0 ? openJobs : undefined}
            onOpen={() => {
              sfx("icon", { bus: "ui" });
              wm.open("flow");
            }}
          />
          <DesktopIcon label="LOADOUT.CFG" icon="loadout" onOpen={() => { sfx("icon", { bus: "ui" }); wm.toggle("loadout"); }} />
          <DesktopIcon label="DAD.LOG" icon="journal" onOpen={() => { sfx("icon", { bus: "ui" }); wm.toggle("journal"); }} />
          <DesktopIcon label="MANUAL.TXT" icon="manual" hint={tip("manualRef")} onOpen={() => { sfx("icon", { bus: "ui" }); wm.toggle("manual"); }} />
          <DesktopIcon label="LEDGER.LOG" icon="ledger" onOpen={() => { sfx("icon", { bus: "ui" }); wm.toggle("ledger"); }} />
          <DesktopIcon
            label="DARKNET.LNK"
            icon="darknet"
            hint="Gray-market patch pieces, no questions asked. Opens for trade after the shop closes."
            onOpen={() => { sfx("icon", { bus: "ui" }); wm.toggle("darknet"); }}
          />
        </IconGrid>

        {WIN_DEFS.map((def) => {
          if (!wm.isOpen(def.id)) return null;
          const pos = wm.posOf(def.id);
          const isFlow = def.id === "flow";
          return (
            <FloatingWindow
              key={def.id}
              def={{ ...def, title: isFlow ? windowTitle(screen) : def.title, x: pos.x, y: pos.y }}
              z={wm.zIndexOf(def.id)}
              focused={topId === def.id}
              closable={isFlow ? flowClosable : true}
              onClose={isFlow ? closeFlow : () => { sfx("winClose", { bus: "ui" }); wm.close(def.id); }}
              onFocus={() => wm.focus(def.id)}
              onMove={(x, y) => wm.move(def.id, x, y)}
            >
              {isFlow && content}
              {def.id === "manual" && <ManualContent />}
              {def.id === "journal" && <JournalContent meta={meta} />}
              {def.id === "loadout" &&
                (run ? (
                  <KitScreen state={state} dispatch={dispatch} />
                ) : (
                  <p className="kp-rail-dim kp-float-pad">No active run. Open the shop first.</p>
                ))}
              {def.id === "ledger" && <LedgerContent meta={meta} run={run} />}
              {def.id === "darknet" && <DarknetContent run={run} dispatch={dispatch} />}
            </FloatingWindow>
          );
        })}
      </main>

      <footer className="kp-taskbar">
        <button
          type="button"
          className={startOpen ? "kp-task-mark kp-task-mark-open" : "kp-task-mark"}
          onClick={() => setStartOpen((v) => !v)}
        >
          KP/OS
        </button>
        {startOpen && (
          <div className="kp-startmenu">
            <span className="kp-startmenu-user">USER 0{slot}</span>
            <button type="button" onClick={() => dispatch({ type: "toggleMusic" })}>
              MUSIC {meta.music ? "ON" : "OFF"}
            </button>
            <button type="button" onClick={() => testBeep()}>
              TEST SOUND
            </button>
            <button
              type="button"
              onClick={() => {
                void playMusic(null);
                setStartOpen(false);
                setSlot(null);
                dispatch({ type: "hydrate", meta: EMPTY_META, run: null });
              }}
            >
              LOG OUT
            </button>
            <button type="button" onClick={() => setStartOpen(false)}>
              CLOSE
            </button>
          </div>
        )}
        <span className="kp-task-item">USER 0{slot}</span>
        <span className="kp-task-item">{run ? `DAY ${Math.min(run.day, FINAL_DAY)}/10` : "STANDBY"}</span>
        {run && <span className="kp-task-item">STRAIN {run.strain}</span>}
        {run && <span className="kp-task-item">{run.credits} CR</span>}
        <span className="kp-task-spacer" />
        {run && (
          <button
            type="button"
            className="kp-task-btn kp-task-danger"
            onClick={() => setConfirmAbandon(true)}
          >
            ABANDON
          </button>
        )}
        <button type="button" className="kp-task-btn" onClick={() => dispatch({ type: "toggleSound" })}>
          SND {meta.sound ? "ON" : "OFF"}
        </button>
      </footer>
      {/* An in-OS dialog rather than window.confirm: a browser chrome prompt
          on top of the desktop broke the fiction and styled nothing. */}
      {confirmAbandon && run && (
        <div className="kp-modal" role="dialog" aria-modal="true" aria-label="Abandon this run">
          <div className="kp-modal-box">
            <h3>ABANDON THIS RUN?</h3>
            <p>
              This ends attempt {run.runNumber} exactly like a loss. Kit tiers, augments, credits
              and patch pieces all reset for the next attempt. The journal and the ledger keep what
              they already hold.
            </p>
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn-ghost" onClick={() => setConfirmAbandon(false)}>
                KEEP DIVING
              </button>
              <button
                type="button"
                className="kp-btn kp-btn-danger"
                onClick={() => {
                  setConfirmAbandon(false);
                  dispatch({ type: "endRunAck" });
                }}
              >
                ABANDON
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="kp-crt" aria-hidden="true" />
    </div>
    </TeachProvider>
  );
}
