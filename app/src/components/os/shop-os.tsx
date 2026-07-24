import { useEffect, useReducer, useState, type ReactNode } from "react";
import { setMuted } from "../../game/audio";
import { ABILITIES, VERB_LABEL, VERB_TELL } from "../../game/content/abilities";
import { dayDuelConfig, finaleConfig, tutorialConfig, FINAL_DAY } from "../../game/content/arc";
import { finaleWinScene, runEndScene, runOpenerScene } from "../../game/content/story";
import { mixSeed } from "../../game/duel-setup";
import { visibleJournal } from "../../game/content/journal";
import { runReducer } from "../../game/run-reducer";
import {
  EMPTY_META,
  loadSlotMeta,
  loadSlotRun,
  migrateLegacySave,
  saveSlotMeta,
  saveSlotRun,
} from "../../game/save";
import { DuelScreen } from "../game/duel";
import {
  AnalyzeScreen,
  BuildScreen,
  DesktopIdle,
  FinalePre,
  JobBoard,
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
    case "build":
      return "PRE-DIVE CHECK";
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
        You can rotate your own claimed junctions and any open junction next to your territory.
        The intrusion floods from the far port under the same rules, on its own RAM. Losing a duel
        zeroes Neural Strain and ends the run. Sloppy wins chip it. Zero, by any means, is the end.
      </p>
      <h3>ROUTINES (one cast per turn)</h3>
      <div className="kp-manual-abilities">
        {ABILITIES.map((a) => (
          <div key={a.id} className="kp-manual-ability">
            <strong>
              {a.name}
              <em>
                T{a.tier} {VERB_LABEL[a.verb]} - {a.ramCost} RAM{a.variant ? " - variant" : ""}
              </em>
            </strong>
            <p>{a.desc}</p>
          </div>
        ))}
      </div>
      <p className="kp-rail-dim">
        Every cleared job teaches one routine at random. Copies burn on use; buy more before a
        dive. Only the routines themselves survive between runs.
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
          dispatch({ type: "hydrate", meta: loadSlotMeta(n), run: loadSlotRun(n) });
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
        : dayDuelConfig(run.day, job?.dominant ?? "redirect", job?.kitSeed ?? run.runSeed);
    const equipped = isTutorial
      ? []
      : run.equipped.map((id) => ({ id, copies: run.copies[id] ?? 0 }));
    return (
      <div className="kp-os">
        <DuelScreen
          key={`dive-${run.runSeed}-${run.day}-${run.activeJob ?? "x"}-${screen}`}
          cfg={cfg}
          seed={isTutorial ? mixSeed(run.runSeed, 0, 0) : mixSeed(run.runSeed, run.day, run.activeJob ?? 9)}
          equipped={equipped}
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
                ? "It runs every routine you have ever seen. All eight."
                : job
                  ? VERB_TELL[job.dominant]
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
                copiesLeft: r.copiesLeft,
              });
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
        content = <AnalyzeScreen run={run} dispatch={dispatch} />;
        break;
      case "build":
        content = <BuildScreen state={state} dispatch={dispatch} />;
        break;
      case "result":
        content = <ResultScreen run={run} dispatch={dispatch} />;
        break;
      case "upgrade":
        content = <UpgradeScreen run={run} dispatch={dispatch} />;
        break;
      case "finalePre":
        content = <FinalePre dispatch={dispatch} />;
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
  // or pre-dive check backs out to the queue; the queue itself just closes.
  const flowClosable = !UNCLOSABLE_SCREENS.has(screen ?? "");
  const closeFlow = () => {
    if (screen === "analyze" || screen === "build") dispatch({ type: "backToDay" });
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
            onOpen={() => wm.open("flow")}
          />
          <DesktopIcon label="LOADOUT.CFG" icon="loadout" onOpen={() => wm.toggle("loadout")} />
          <DesktopIcon label="DAD.LOG" icon="journal" onOpen={() => wm.toggle("journal")} />
          <DesktopIcon label="MANUAL.TXT" icon="manual" onOpen={() => wm.toggle("manual")} />
          <DesktopIcon label="LEDGER.LOG" icon="ledger" onOpen={() => wm.toggle("ledger")} />
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
              onClose={isFlow ? closeFlow : () => wm.close(def.id)}
              onFocus={() => wm.focus(def.id)}
              onMove={(x, y) => wm.move(def.id, x, y)}
            >
              {isFlow && content}
              {def.id === "manual" && <ManualContent />}
              {def.id === "journal" && <JournalContent meta={meta} />}
              {def.id === "loadout" &&
                (run ? (
                  <BuildScreen state={state} dispatch={dispatch} floating />
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
                    <div><span>NEURAL CAPACITY</span><em>{run.capacity}</em></div>
                    <div><span>ROUTINES ARCHIVED</span><em>{meta.unlocked.length}/24</em></div>
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
            <button
              type="button"
              onClick={() => {
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
