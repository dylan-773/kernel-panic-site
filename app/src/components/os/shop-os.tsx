import { useEffect, useReducer, useState, type ReactNode } from "react";
import { setMuted } from "../../game/audio";
import { VERB_TELL } from "../../game/content/abilities";
import { dayDuelConfig, finaleConfig, tutorialConfig, FINAL_DAY } from "../../game/content/arc";
import { finaleWinScene, runEndScene, runOpenerScene } from "../../game/content/story";
import { mixSeed } from "../../game/duel-setup";
import { runReducer } from "../../game/run-reducer";
import { EMPTY_META, loadMeta, loadRun, saveMeta, saveRun } from "../../game/save";
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

function windowTitle(screen: string | null): string {
  switch (screen) {
    case "duel":
    case "tutorial":
      return "DIVE_SHELL.EXE";
    case "build":
      return "LOADOUT.CFG";
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
    default:
      return "SHOPFRONT.EXE";
  }
}

function OsWindow({ title, wide, children }: { title: string; wide: boolean; children: ReactNode }) {
  return (
    <section className={wide ? "kp-window kp-window-wide" : "kp-window"}>
      <header className="kp-window-bar">
        <span className="kp-window-title">{title}</span>
        <span className="kp-window-lights" aria-hidden="true">
          <i />
          <i />
          <i className="kp-window-close" />
        </span>
      </header>
      <div className="kp-window-body">{children}</div>
    </section>
  );
}

export function ShopOS() {
  const [state, dispatch] = useReducer(runReducer, { meta: EMPTY_META, run: null });
  const [ready, setReady] = useState(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    dispatch({ type: "hydrate", meta: loadMeta(), run: loadRun() });
    setReady(true);
    const t = setTimeout(() => setBooted(true), 1700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveMeta(state.meta);
    saveRun(state.run);
  }, [state, ready]);

  useEffect(() => {
    setMuted(!state.meta.sound);
  }, [state.meta.sound]);

  if (!ready || !booted) {
    return <BootScreen onSkip={ready ? () => setBooted(true) : undefined} />;
  }

  const { meta, run } = state;
  const screen = run?.screen ?? null;
  const wide = screen === "duel" || screen === "tutorial";

  let content: ReactNode;
  if (!run) {
    content = <DesktopIdle meta={meta} dispatch={dispatch} />;
  } else {
    switch (run.screen) {
      case "opener":
        content = (
          <StoryScene
            scene={runOpenerScene(run.runNumber)}
            onDone={() => dispatch({ type: "storyDone" })}
          />
        );
        break;
      case "tutorial":
        content = (
          <DuelScreen
            key={`tut-${run.runSeed}`}
            cfg={tutorialConfig()}
            seed={mixSeed(run.runSeed, 0, 0)}
            equipped={[]}
            ramPerTurn={run.ramPerTurn}
            jobTitle="THE MACHINE"
            jobSub="The back room. The lock gave way this morning. It wanted you to come in."
            dominantTell={null}
            strain={run.strain}
            day={0}
            soundOn={meta.sound}
            onFinish={() => dispatch({ type: "tutorialDone" })}
          />
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
      case "duel": {
        const isFinale = run.day === FINAL_DAY;
        const job = run.activeJob !== null ? run.jobs[run.activeJob] : null;
        const customer = job ? customerById(job.customerId) : null;
        const cfg = isFinale
          ? finaleConfig()
          : dayDuelConfig(run.day, (job?.dominant ?? "redirect"), job?.kitSeed ?? run.runSeed);
        const equipped = run.equipped.map((id) => ({ id, copies: run.copies[id] ?? 0 }));
        content = (
          <DuelScreen
            key={`duel-${run.day}-${run.activeJob ?? "f"}`}
            cfg={cfg}
            seed={mixSeed(run.runSeed, run.day, run.activeJob ?? 9)}
            equipped={equipped}
            ramPerTurn={run.ramPerTurn}
            jobTitle={isFinale ? "THE MACHINE" : customer ? customer.device : "UNKNOWN DEVICE"}
            jobSub={
              isFinale
                ? "Everything it has. Everything you have."
                : customer
                  ? `${customer.name} - tier ${job?.tier ?? 1} intrusion`
                  : ""
            }
            dominantTell={
              isFinale
                ? "It runs every routine you have ever seen. All eight."
                : job
                  ? VERB_TELL[job.dominant]
                  : null
            }
            strain={run.strain}
            day={run.day}
            soundOn={meta.sound}
            onFinish={(r) =>
              dispatch({
                type: "duelFinished",
                won: r.won,
                chip: r.chip,
                capWin: r.capWin,
                copiesLeft: r.copiesLeft,
              })
            }
          />
        );
        break;
      }
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
          <StoryScene
            scene={runEndScene(run.runNumber)}
            onDone={() => dispatch({ type: "storyDone" })}
          />
        );
        break;
      case "finaleWin":
        content = (
          <StoryScene scene={finaleWinScene()} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
    }
  }

  return (
    <div className="kp-os">
      <div className="kp-wallpaper" aria-hidden="true" />
      <main className="kp-os-desk">
        <OsWindow title={windowTitle(screen)} wide={wide}>
          {content}
        </OsWindow>
      </main>
      <footer className="kp-taskbar">
        <span className="kp-task-mark">KP/OS</span>
        <span className="kp-task-item">
          {run ? `DAY ${Math.min(run.day, FINAL_DAY)}/10` : "STANDBY"}
        </span>
        {run && <span className="kp-task-item">STRAIN {run.strain}</span>}
        {run && <span className="kp-task-item">{run.credits} CR</span>}
        <span className="kp-task-spacer" />
        {run && run.screen !== "tutorial" && run.screen !== "duel" && (
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
        <button
          type="button"
          className="kp-task-btn"
          onClick={() => dispatch({ type: "toggleSound" })}
        >
          SND {meta.sound ? "ON" : "OFF"}
        </button>
      </footer>
      <div className="kp-crt" aria-hidden="true" />
    </div>
  );
}
