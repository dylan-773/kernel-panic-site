import { useEffect, useReducer, useState, type ReactNode } from "react";
import { playMusic, playUiPress, setMuted, setMusicOn, sfx, testBeep, unlockAudio } from "../../game/audio";
import { MODE_TELL } from "../../game/content/kit";
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
import { tip } from "../../game/content/teaching";
import { runReducer } from "../../game/run-reducer";
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
import { DesktopIdle, FinalePre, StoryScene, customerById } from "../game/screens";
import { BootScreen } from "./boot";
import { LoginScreen } from "./login";
import { Dock, DockIcon } from "./icons";
import { KpMark, Nodes } from "./kp-ui";
import { Ticker, WallPoster, WallReg, WallScope } from "./desk";
import { FloatingWindow, useWindowManager, WinDef } from "./wm";
import { InboxContent, INBOX_W_CARD, INBOX_W_LIST } from "./windows/inbox";
import { ReportContent } from "./windows/report";
import { LoadoutContent } from "./windows/loadout";
import { SolderContent } from "./windows/solder";
import { NightContent } from "./windows/night";
import { ManualContent } from "./windows/manual";
import { DadlogContent } from "./windows/dadlog";
import { LedgerContent } from "./windows/ledger";
import { DarknetContent } from "./windows/darknet";

/* v3 (ux-2026-07-31-desktop-dive, review round 3): no window carries a spawn
 * point any more. A plain open lands CENTERED on the desk; the cascade of
 * hand-picked offsets was the thing that made two open windows overlap. */
/* Widths are each panel's own MEASURED 16:9 figure from its demo, not the
 * v2 guesses: every v3 study states the window width its arrangement was
 * built and verified at. */
const WIN_DEFS: WinDef[] = [
  { id: "flow", title: "SHOPFRONT.EXE", w: 860 },
  { id: "inbox", title: "INBOX", w: INBOX_W_LIST, tall: true },
  { id: "report", title: "REPAIR.LOG", w: 900, tall: true },
  { id: "loadout", title: "LOADOUT.CFG", w: 860, tall: true },
  { id: "solder", title: "SOLDER.BAY", w: 860, tall: true },
  { id: "manual", title: "MANUAL.TXT", w: 760 },
  { id: "journal", title: "DAD.LOG", w: 1040, tall: true },
  { id: "ledger", title: "LEDGER.LOG", w: 760, tall: true },
  { id: "darknet", title: "DARKNET.LNK", w: 820, notched: true },
];

/** The desktop's one alarm arms here. Strain DEPLETES toward zero
 * (run-reducer.ts: START_STRAIN 100, the run ends at 0), so the shipped
 * `run.strain > 70` danger check lit the chip at full health. */
const STRAIN_ALARM_AT = 35;

type Scheme = "default" | "nerv" | "tokyo";
const SCHEME_LABEL: Record<Scheme, string> = {
  default: "DEFAULT",
  nerv: "NERV",
  tokyo: "TOKYO NIGHT",
};

/** The six glass layers of law 6. FLAT and OFF are the only modes; OFF
 * removes every layer outright rather than fading them. */
function Glass() {
  return (
    <div className="ds-glass" aria-hidden="true">
      <i className="g-scan" />
      <i className="g-mask" />
      <i className="g-bloom" />
      <i className="g-spec" />
      <i className="g-vig" />
      <i className="g-bezel" />
    </div>
  );
}

function windowTitle(screen: string | null): string {
  switch (screen) {
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
    default:
      return "SHOPFRONT.EXE";
  }
}

/** Which window fronts each reducer screen. */
function screenOwner(screen: string | null): "inbox" | "report" | "flow" | null {
  switch (screen) {
    case "day":
    case "analyze":
      return "inbox";
    case "result":
      return "report";
    case "opener":
    case "tutIntro":
    case "tutOutro":
    case "dayOpen":
    case "upgrade":
    case "finalePre":
    case "runEnd":
    case "finaleWin":
      return "flow";
    default:
      return null;
  }
}

/** Flow-set screens where closing the owning window has no sensible meaning. */
const UNCLOSABLE_SCREENS = new Set([
  "opener",
  "tutIntro",
  "tutOutro",
  "dayOpen",
  "runEnd",
  "finaleWin",
  "upgrade",
  "result",
  "finalePre",
]);

export function ShopOS() {
  const [state, dispatch] = useReducer(runReducer, { meta: EMPTY_META, run: null });
  const [ready, setReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  // The inbox's staged width (the content reports the wide phase).
  const [inboxWide, setInboxWide] = useState(false);
  // v3 ruling 14, desktop-wide: colour is eight ROLE tokens, and a scheme
  // is a remap of those tokens and nothing else. DEFAULT sets no attribute
  // at all, so every role collapses onto the single v2 accent and the shell
  // renders exactly as it shipped. That reversibility is the point.
  const [scheme, setScheme] = useState<Scheme>("default");
  useEffect(() => {
    if (scheme === "default") delete document.documentElement.dataset.scheme;
    else document.documentElement.dataset.scheme = scheme;
  }, [scheme]);
  // The tube: FLAT (default) or OFF. Both chrome bands grow under the glass
  // so their content sits clear of the bezel falloff.
  const [crt, setCrt] = useState<"flat" | "off">("flat");
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
  // The finale bed starts at BACKROOM.LCK, one screen early: the player
  // should read Day 10 with the machine's theme already rising.
  const finaleBed =
    musicScreen === "tutorial" ||
    musicScreen === "finalePre" ||
    (musicScreen === "duel" && state.run?.day === FINAL_DAY);
  useEffect(() => {
    if (slot === null) return;
    void playMusic(finaleBed ? "finale" : inDive ? "dive" : "desk");
  }, [inDive, finaleBed, slot]);

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

  // Every flow transition surfaces the window that owns the new screen (the
  // user may have closed it to sit on the desktop); the other flow-set
  // windows step aside so exactly one fronts the loop.
  const flowScreen = state.run?.screen ?? null;
  useEffect(() => {
    const owner = screenOwner(flowScreen);
    if (!owner) {
      // No live run: the idle desk (OPEN THE SHOP) must front on its own,
      // or a fresh save reads as a dead desktop.
      if (flowScreen === null) wm.open("flow");
      return;
    }
    wm.open(owner);
    for (const other of ["flow", "inbox", "report"] as const) {
      if (other !== owner && wm.isOpen(other)) wm.close(other);
    }
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
      <div className={crt === "flat" ? "kp-os kp-crt-on" : "kp-os"}>
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
          customerId={customer?.id ?? null}
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
                rounds: r.rounds,
                trapRounds: r.trapRounds,
                parRounds: r.parRounds,
                log: r.log,
              });
          }}
        />
        {crt === "flat" && <Glass />}
      </div>
      </TeachProvider>
    );
  }

  // The flow window's own content: story scenes, the night screen, the
  // finale gate, or the idle desk when no run is live.
  let flowContent: ReactNode = null;
  if (!run) {
    flowContent = <DesktopIdle meta={meta} dispatch={dispatch} />;
  } else {
    switch (run.screen) {
      case "opener":
        flowContent = (
          <StoryScene scene={runOpenerScene(run.runNumber)} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      case "tutIntro":
        flowContent = (
          <StoryScene scene={tutorialIntroScene()} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      case "tutOutro":
        flowContent = (
          <StoryScene scene={tutorialOutroScene()} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      case "dayOpen":
        flowContent = (
          <StoryScene
            scene={dayOpenScene(run.day)}
            tag={`DAY ${run.day}`}
            onDone={() => dispatch({ type: "storyDone" })}
          />
        );
        break;
      case "upgrade":
        flowContent = (
          <NightContent
            run={run}
            dispatch={dispatch}
            onOpenDarknet={() => {
              wm.open("darknet");
            }}
          />
        );
        break;
      case "finalePre":
        flowContent = (
          <FinalePre
            dispatch={dispatch}
            onConfigureKit={() => {
              wm.open("loadout");
            }}
          />
        );
        break;
      case "runEnd":
        flowContent = (
          <StoryScene scene={runEndScene(run.runNumber)} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      case "finaleWin":
        flowContent = (
          <StoryScene scene={finaleWinScene()} onDone={() => dispatch({ type: "storyDone" })} />
        );
        break;
      default:
        flowContent = null;
    }
  }

  const openJobs = run ? run.jobsDone.filter((d) => !d).length : 0;

  // Highest z among open windows owns focus styling.
  const topId = wm.openIds.reduce(
    (top, id) => (wm.zIndexOf(id) > wm.zIndexOf(top) ? id : top),
    wm.openIds[0] ?? "",
  );

  const flowClosable = !UNCLOSABLE_SCREENS.has(screen ?? "");
  // Window lifecycle sound lives in FloatingWindow itself (mount winOpen,
  // unmount winClose), so close paths here stay silent.
  const closeWindow = (id: string) => {
    if (id === "inbox") {
      if (screen === "analyze") dispatch({ type: "backToDay" });
      setInboxWide(false);
    }
    wm.close(id);
  };

  // The inbox steps wider while a ticket is open; the content drives the
  // timing through onWide, and takes its own final width the instant the
  // state flips so the frame's stepped transition clips over settled
  // content rather than rewrapping mid-flight.
  const winWidth = (def: WinDef): number =>
    def.id === "inbox" ? (inboxWide ? INBOX_W_CARD : INBOX_W_LIST) : def.w;

  const winContent = (id: string): ReactNode => {
    switch (id) {
      case "flow":
        return flowContent;
      case "inbox":
        return run && (screen === "day" || screen === "analyze") ? (
          <InboxContent
            run={run}
            dispatch={dispatch}
            onWide={setInboxWide}
            onConfigureKit={() => {
              wm.open("loadout");
            }}
          />
        ) : (
          <p className="kp-rail-dim kp-float-pad">
            {run ? "No open tickets right now." : "No active run. Open the shop first."}
          </p>
        );
      case "report":
        return run && run.lastResult ? (
          <ReportContent run={run} dispatch={dispatch} />
        ) : (
          <p className="kp-rail-dim kp-float-pad">
            {run
              ? "NO REPAIR ON FILE. CLEAR A TICKET TO GENERATE A LOG."
              : "NO REPAIR ON FILE. OPEN THE SHOP FIRST."}
          </p>
        );
      case "loadout":
        return run ? (
          <LoadoutContent
            state={state}
            dispatch={dispatch}
            slot={slot ?? 1}
            onOpenSolder={() => {
              wm.open("solder");
            }}
          />
        ) : (
          <p className="kp-rail-dim kp-float-pad">No active run. Open the shop first.</p>
        );
      case "solder":
        return run ? (
          <SolderContent run={run} dispatch={dispatch} />
        ) : (
          <p className="kp-rail-dim kp-float-pad">No active run. Open the shop first.</p>
        );
      case "manual":
        return <ManualContent />;
      case "journal":
        return <DadlogContent meta={meta} />;
      case "ledger":
        return <LedgerContent meta={meta} run={run} />;
      case "darknet":
        return <DarknetContent run={run} dispatch={dispatch} onExit={() => closeWindow("darknet")} />;
      default:
        return null;
    }
  };

  return (
    <TeachProvider
      taught={meta.taught}
      day={run ? run.day : 0}
      onTaught={(id) => dispatch({ type: "taught", id })}
    >
    <div className={crt === "flat" ? "kp-os kp-crt-on" : "kp-os"}>
      <div className="kp-wallpaper" aria-hidden="true">
        <i className="kp-dither" />
      </div>
      <WallReg />
      <WallPoster meta={meta} run={run} idle={wm.openIds.length === 0} />
      <WallScope day={run ? Math.min(run.day, FINAL_DAY) : 0} />
      <main className="kp-os-desk">
        {WIN_DEFS.map((def) => {
          if (!wm.isOpen(def.id)) return null;
          const pos = wm.posOf(def.id);
          const isFlow = def.id === "flow";
          const owner = screenOwner(screen);
          const closable = isFlow
            ? flowClosable
            : def.id === owner
              ? !UNCLOSABLE_SCREENS.has(screen ?? "") || def.id === "inbox"
              : true;
          return (
            <FloatingWindow
              key={def.id}
              def={{
                ...def,
                title: isFlow ? windowTitle(screen) : def.title,
                x: pos?.x,
                y: pos?.y,
                w: winWidth(def),
              }}
              z={wm.zIndexOf(def.id)}
              focused={topId === def.id}
              closable={closable}
              onClose={() => closeWindow(def.id)}
              onFocus={() => wm.focus(def.id)}
              onMove={(x, y) => wm.move(def.id, x, y)}
            >
              {winContent(def.id)}
            </FloatingWindow>
          );
        })}
      </main>

      {/* The slim TOP strip (v3 review round 3). The old bottom taskbar's
          whole payload rehomed: mark + start menu (now dropping down), the
          USER / DAY / STRAIN / CR chips, the stats ticker crawling the
          middle, ABANDON and SND. The strain chip stays on the desk at all
          times and keeps its alarm. */}
      <header className="kp-taskbar">
        <button
          type="button"
          className={startOpen ? "kp-task-mark kp-task-mark-open" : "kp-task-mark"}
          onClick={() => setStartOpen((v) => !v)}
        >
          <KpMark cell={2} sliceMono />
          KP/OS
        </button>
        {startOpen && (
          <div className="kp-startmenu">
            <span className="kp-startmenu-user">USER 0{slot}</span>
            <button
              type="button"
              onClick={() => {
                sfx("tick", { bus: "ui" });
                dispatch({ type: "toggleMusic" });
              }}
            >
              MUSIC {meta.music ? "ON" : "OFF"}
            </button>
            <button type="button" onClick={() => testBeep()}>
              TEST SOUND
            </button>
            <button
              type="button"
              onClick={() => {
                sfx("hueSwap", { bus: "ui" });
                setScheme((s) => (s === "default" ? "nerv" : s === "nerv" ? "tokyo" : "default"));
              }}
            >
              SCHEME: {SCHEME_LABEL[scheme]}
            </button>
            <button
              type="button"
              onClick={() => {
                sfx("tick", { bus: "ui" });
                setCrt((c) => (c === "flat" ? "off" : "flat"));
              }}
            >
              CRT: {crt === "flat" ? "FLAT" : "OFF"}
            </button>
            <button
              type="button"
              onClick={() => {
                sfx("press", { bus: "ui" });
                void playMusic(null);
                setStartOpen(false);
                setSlot(null);
                dispatch({ type: "hydrate", meta: EMPTY_META, run: null });
              }}
            >
              LOG OUT
            </button>
            <button
              type="button"
              onClick={() => {
                sfx("tick", { bus: "ui" });
                setStartOpen(false);
              }}
            >
              CLOSE
            </button>
          </div>
        )}
        <div className="kp-task-chips">
          <span className="kp-chip-pct">
            <span>USER</span>
            <em>0{slot}</em>
          </span>
          <span className="kp-chip-pct">
            <span>DAY</span>
            <em>
              {run
                ? `${Math.min(run.day, FINAL_DAY)}/10 ${Math.round((Math.min(run.day, FINAL_DAY) / FINAL_DAY) * 100)}%`
                : "STANDBY"}
            </em>
          </span>
          {run && (
            // The desktop's ONE --r-warn owner: colour, inverse video, and
            // a composited difference-blend pulse. Three channels, because
            // colour is never allowed to signal alone.
            <span
              className={
                run.strain <= STRAIN_ALARM_AT
                  ? "kp-chip-pct ds-strain ds-strain-alarm"
                  : "kp-chip-pct ds-strain"
              }
            >
              <span>STRAIN</span>
              <em>{run.strain}</em>
              {run.strain <= STRAIN_ALARM_AT && <i className="ds-riskflash" aria-hidden="true" />}
            </span>
          )}
          {run && (
            <span className="kp-chip-pct">
              <span>CR</span>
              <em>{run.credits}</em>
            </span>
          )}
        </div>
        <Ticker meta={meta} />
        {run && (
          <button
            type="button"
            className="kp-task-btn kp-task-danger"
            onClick={() => {
              sfx("press", { bus: "ui" });
              setConfirmAbandon(true);
            }}
          >
            ABANDON
          </button>
        )}
        <button
          type="button"
          className="kp-task-btn"
          onClick={() => {
            sfx("tick", { bus: "ui" });
            dispatch({ type: "toggleSound" });
          }}
        >
          SND {meta.sound ? "ON" : "OFF"}
        </button>
      </header>

      {/* The dock: launcher AND running-window indicator. Clicking a running
          app surfaces its window (wm.open raises it) instead of toggling it
          shut; clicking an app with no window opens one, centered. */}
      <Dock>
        <DockIcon
          label="INBOX"
          icon="inbox"
          order={0}
          running={wm.isOpen("inbox") || wm.isOpen("flow")}
          badge={run && openJobs > 0 ? openJobs : undefined}
          onOpen={() => {
            wm.open(run && screenOwner(screen) !== "flow" ? "inbox" : "flow");
          }}
        />
        <DockIcon label="LOADOUT.CFG" icon="loadout" order={1} running={wm.isOpen("loadout")} onOpen={() => { wm.open("loadout"); }} />
        <DockIcon label="SOLDER.BAY" icon="solder" order={2} running={wm.isOpen("solder")} onOpen={() => { wm.open("solder"); }} />
        <DockIcon label="REPAIR.LOG" icon="report" order={3} running={wm.isOpen("report")} onOpen={() => { wm.open("report"); }} />
        <DockIcon label="DAD.LOG" icon="journal" order={4} running={wm.isOpen("journal")} onOpen={() => { wm.open("journal"); }} />
        <DockIcon label="MANUAL.TXT" icon="manual" order={5} running={wm.isOpen("manual")} hint={tip("manualRef")} onOpen={() => { wm.open("manual"); }} />
        <DockIcon label="LEDGER.LOG" icon="ledger" order={6} running={wm.isOpen("ledger")} onOpen={() => { wm.open("ledger"); }} />
        <DockIcon
          label="DARKNET.LNK"
          icon="darknet"
          order={7}
          running={wm.isOpen("darknet")}
          hint="Gray-market patch pieces, no questions asked. Opens for trade after the shop closes."
          onOpen={() => { wm.open("darknet"); }}
        />
      </Dock>
      {/* An in-OS dialog rather than window.confirm: a browser chrome prompt
          on top of the desktop broke the fiction and styled nothing. */}
      {confirmAbandon && run && (
        <div className="kp-modal" role="dialog" aria-modal="true" aria-label="Abandon this run">
          <div className="kp-modal-box kp-frame-nodes">
            <Nodes />
            <h3>ABANDON THIS RUN?</h3>
            <p>
              This ends attempt {run.runNumber} exactly like a loss. Kit tiers, augments, credits
              and patch pieces all reset for the next attempt. The journal and the ledger keep what
              they already hold.
            </p>
            <div className="kp-modal-actions">
              <button
                type="button"
                className="kp-btn2 kp-btn2-ghost"
                onClick={() => {
                  sfx("press", { bus: "ui" });
                  setConfirmAbandon(false);
                }}
              >
                KEEP DIVING
              </button>
              <button
                type="button"
                className="kp-btn2 kp-btn2-primary kp-btn2-danger"
                onClick={() => {
                  sfx("turnLost", { bus: "ui", vol: 0.6 });
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
      {crt === "flat" && <Glass />}
    </div>
    </TeachProvider>
  );
}
