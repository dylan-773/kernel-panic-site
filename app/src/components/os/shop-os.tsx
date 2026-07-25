import { useEffect, useReducer, useState, type ReactNode } from "react";
import { playMusic, playUiPress, setMuted, setMusicOn, sfx, testBeep, unlockAudio } from "../../game/audio";
import {
  ATTACK_MODE_LABEL,
  AUGMENTS,
  DEFEND_MODE_LABEL,
  MODE_TELL,
  attackModeDesc,
  defendModeDesc,
  scanDesc,
} from "../../game/content/kit";
import { dayDuelConfig, finaleConfig, tutorialConfig, FINAL_DAY } from "../../game/content/arc";
import { finaleWinScene, runEndScene, runOpenerScene } from "../../game/content/story";
import { mixSeed } from "../../game/duel-setup";
import { visibleJournal } from "../../game/content/journal";
import { runReducer } from "../../game/run-reducer";
import {
  EMPTY_META,
  applyOneTimeSoundReset,
  loadSlotMeta,
  loadSlotRun,
  migrateLegacySave,
  saveSlotMeta,
  saveSlotRun,
} from "../../game/save";
import { DuelScreen } from "../game/duel";
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
];

function windowTitle(screen: string | null): string {
  switch (screen) {
    case "analyze":
      return "DIAGNOSTIC.LOG";
    case "opener":
    case "runEnd":
    case "finaleWin":
      return "SHOPFRONT";
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
const UNCLOSABLE_SCREENS = new Set(["opener", "runEnd", "finaleWin", "upgrade", "result"]);

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
      <h3>AUGMENTS</h3>
      <div className="kp-manual-abilities">
        {AUGMENTS.map((a) => (
          <div key={a.id} className="kp-manual-ability">
            <strong>
              {a.name}
              <em>{a.kind === "config" ? "config" : "boost"}</em>
            </strong>
            <p>{a.desc}</p>
          </div>
        ))}
      </div>
      <p className="kp-rail-dim">
        Every cleared job offers a draft of augments; every closed day offers +1 RAM or a program
        tier. Everything resets when the run ends. Only you remember.
      </p>
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

export function ShopOS() {
  const [state, dispatch] = useReducer(runReducer, { meta: EMPTY_META, run: null });
  const [ready, setReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [startOpen, setStartOpen] = useState(false);
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
    const duelKit = isTutorial
      ? { scanTier: 1 as const, attackTier: 1 as const, defendTier: 1 as const, attackMode: "redirect" as const, defendMode: "purge" as const, augments: [] }
      : {
          scanTier: run.kit.scanTier,
          attackTier: run.kit.attackTier,
          defendTier: run.kit.defendTier,
          attackMode: run.kit.attackMode,
          defendMode: run.kit.defendMode,
          augments: run.kit.augments,
        };
    return (
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
            else dispatch({ type: "duelFinished", won: r.won, chip: r.chip, capWin: r.capWin });
          }}
        />
        <div className="kp-crt" aria-hidden="true" />
      </div>
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
          <DesktopIcon label="MANUAL.TXT" icon="manual" onOpen={() => { sfx("icon", { bus: "ui" }); wm.toggle("manual"); }} />
          <DesktopIcon label="LEDGER.LOG" icon="ledger" onOpen={() => { sfx("icon", { bus: "ui" }); wm.toggle("ledger"); }} />
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
              {def.id === "ledger" &&
                (run ? (
                  <div className="kp-ledgerwin">
                    <div><span>ATTEMPT</span><em>{run.runNumber}</em></div>
                    <div><span>DAY</span><em>{Math.min(run.day, FINAL_DAY)}/10</em></div>
                    <div><span>NEURAL STRAIN</span><em>{run.strain}/100</em></div>
                    <div><span>CREDITS</span><em>{run.credits} cr</em></div>
                    <div><span>RAM / TURN</span><em>{run.ramPerTurn}</em></div>
                    <div><span>KIT TIERS</span><em>S{run.kit.scanTier} A{run.kit.attackTier} D{run.kit.defendTier}</em></div>
                    <div><span>AUGMENTS</span><em>{run.kit.augments.length}/{AUGMENTS.filter((a) => a.kind === "boost").length}</em></div>
                  </div>
                ) : (
                  <p className="kp-rail-dim kp-float-pad">No active run.</p>
                ))}
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
            onClick={() => {
              if (window.confirm("Abandon this run? Unlocked routines are kept.")) {
                dispatch({ type: "endRunAck" });
              }
            }}
          >
            ABANDON
          </button>
        )}
        <button type="button" className="kp-task-btn" onClick={() => dispatch({ type: "toggleSound" })}>
          SND {meta.sound ? "ON" : "OFF"}
        </button>
      </footer>
      <div className="kp-crt" aria-hidden="true" />
    </div>
  );
}
