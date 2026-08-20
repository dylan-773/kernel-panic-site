import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { playMusic, playUiPress, setMuted, setMusicOn, sfx, unlockAudio } from "../../game/audio";
import { MODE_TELL } from "../../game/content/kit";
import { RepairDef } from "../../game/content/repairs";
import {
  bustScene,
  finaleWinScene,
  morningLine,
  sectorScene,
  sundayScene,
  tutorialIntroScene,
  tutorialOutroScene,
} from "../../game/content/story";
import { backroomConfig, tierDuelConfig, tutorialConfig } from "../../game/content/tiers";
import { GameState, dayReducer, genCustomer } from "../../game/day-reducer";
import { mixSeed } from "../../game/duel-setup";
import { BASE_KIT } from "../../game/duel-types";
import { OverworldBridge } from "../../game/overworld/bridge";
import type { RoomId, StationId } from "../../game/overworld/world";
import {
  EMPTY_META,
  applyOneTimeSoundReset,
  duelKitOf,
  isSunday,
  loadSlotDay,
  loadSlotMeta,
  loadSlotShop,
  migrateLegacySave,
  saveSlotDay,
  saveSlotMeta,
  saveSlotShop,
} from "../../game/save";
import { DuelScreen } from "../game/duel";
import { StoryScene, customerById } from "../game/screens";
import { TeachProvider, Teach } from "../game/teach";
import { BootScreen } from "../os/boot";
import { LoginScreen } from "../os/login";
import { ShopOS } from "../os/shop-os";
import { useWindowManager } from "../os/wm";
import { WIN_DEFS } from "../os/win-defs";
import { OverworldStage } from "./overworld-stage";
import {
  ConfirmPanel,
  FirstRead,
  IntakeDialog,
  LossToast,
  MorningCard,
  PromptBar,
  REPAIR_STATIONS,
  RoomHud,
  StationPanel,
  useReducedMotionPref,
} from "./room-ui";

/**
 * The game's two environments, conducted: a walkable 2.5D shop (Phaser)
 * and KP/OS on the bench terminal (the React desktop). Sitting down at the
 * bench is how the player enters KP/OS and standing up is how they leave;
 * the dive is deeper in, not elsewhere. The glass belongs to the terminal:
 * it arrives as the camera settles into the screen and the room has none.
 *
 * The Phaser stage mounts once and never unmounts while a save is open, so
 * the room is exactly as you left it when you stand back up, and the
 * window manager is owned HERE so the desktop's window layout survives the
 * trip too.
 */

const THEMES = [
  { id: "lavender", label: "LAVENDER", hue: "lavender", scheme: null },
  { id: "magenta", label: "MAGENTA", hue: "magenta", scheme: null },
  { id: "phosphor", label: "PHOSPHOR", hue: "phosphor", scheme: null },
  { id: "nerv", label: "NERV", hue: "lavender", scheme: "nerv" },
  { id: "tokyo", label: "TOKYO NIGHT", hue: "lavender", scheme: "tokyo" },
] as const;

export function GameShell() {
  const [state, dispatch] = useReducer(dayReducer, {
    meta: EMPTY_META,
    shop: null,
    day: null,
  } as GameState);
  const [ready, setReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);

  const [seated, setSeated] = useState(false);
  const [deskVisible, setDeskVisible] = useState(false);
  const [prompt, setPrompt] = useState<StationId | null>(null);
  const [roomId, setRoomId] = useState<RoomId>("shop");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [stationOpen, setStationOpen] = useState<StationId | null>(null);
  const [firstRead, setFirstRead] = useState<RepairDef | null>(null);
  const [sectorShown, setSectorShown] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<"close" | "sleep" | "attempt" | null>(null);
  const [lossToast, setLossToast] = useState<string | null>(null);
  const [bustAck, setBustAck] = useState(false);
  const [themeIndex, setThemeIndex] = useState(0);
  const [crt, setCrt] = useState<"flat" | "off">("flat");
  const reducedMotion = useReducedMotionPref();

  const wm = useWindowManager(WIN_DEFS);
  const theme = THEMES[themeIndex];

  const { meta, shop, day } = state;
  const phase = day?.phase ?? null;

  const bridgeRef = useRef<OverworldBridge | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = new OverworldBridge({
      phase: "morning",
      sunday: false,
      machineOpened: false,
      repairs: [],
      waitingId: null,
      hasTicket: false,
      attemptedBackroom: false,
      reducedMotion,
    });
  }
  const bridge = bridgeRef.current;

  /* ---------------- boot, login, persistence ---------------- */

  useEffect(() => {
    migrateLegacySave();
    setReady(true);
    const t = setTimeout(() => setBooted(true), 1700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || slot === null) return;
    saveSlotMeta(slot, state.meta);
    saveSlotShop(slot, state.shop);
    saveSlotDay(slot, state.day);
  }, [state, ready, slot]);

  useEffect(() => setMuted(!meta.sound), [meta.sound]);
  useEffect(() => setMusicOn(meta.music), [meta.music]);

  useEffect(() => {
    document.documentElement.dataset.hue = theme.hue;
    if (theme.scheme === null) delete document.documentElement.dataset.scheme;
    else document.documentElement.dataset.scheme = theme.scheme;
  }, [theme]);

  // One delegated listener gives every button a press sound and unlocks the
  // shared AudioContext (Phaser runs with noAudio: everything routes here).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      unlockAudio();
      const t = e.target as HTMLElement | null;
      if (t?.closest("button")) playUiPress();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  /* ---------------- the bridge: snapshot down, events up ---------------- */

  useEffect(() => {
    bridge.snapshot = {
      phase: phase ?? "morning",
      sunday: shop ? isSunday(shop.day) : false,
      machineOpened: meta.machineOpened,
      repairs: shop ? shop.repairs : [],
      waitingId: day?.waiting?.customerId ?? null,
      hasTicket: !!day?.ticket,
      attemptedBackroom: day?.attemptedBackroom ?? false,
      reducedMotion,
    };
  }, [bridge, phase, shop, day, meta.machineOpened, reducedMotion]);

  const inDive = phase === "duel" || phase === "tutorial";

  useEffect(() => {
    (window as unknown as { __kpShell?: object }).__kpShell = {
      phase,
      waiting: day?.waiting?.customerId ?? null,
      ticket: day?.ticket?.customerId ?? null,
      seated,
      deskVisible,
      intakeOpen,
      stationOpen,
      confirm,
    };
  });
  const modalOpen =
    intakeOpen || stationOpen !== null || firstRead !== null || sectorShown !== null || confirm !== null;

  // Freeze the room's input while anything sits over it.
  useEffect(() => {
    bridge.commands.setPaused(deskVisible || modalOpen || inDive || phase === "morning");
  }, [bridge, deskVisible, modalOpen, inDive, phase]);

  const standUp = useCallback(() => {
    setDeskVisible(false);
    sfx("benchStand", { bus: "game" });
    bridge.commands.standZoom();
  }, [bridge]);

  const teleport = useCallback(
    (room: RoomId, spawn: string) => {
      bridge.commands.teleport(room, spawn);
    },
    [bridge],
  );

  /* Customer flow: the shell walks a customer in, the reducer meets them
   * at the counter. genCustomer is pure, so the sprite that walks in is
   * exactly the customer customerArrived will generate. */
  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEntry = useRef<string | null>(null);
  useEffect(() => {
    const open = phase === "open" && !!shop && !!day && !day.waiting && !day.ticket;
    if (!open) {
      if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
      arrivalTimer.current = null;
      return;
    }
    if (arrivalTimer.current) return;
    const delay = day!.encounterIndex === 0 ? 2600 : 4200 + ((day!.encounterIndex * 2654435761) % 4000);
    arrivalTimer.current = setTimeout(() => {
      arrivalTimer.current = null;
      if (!shop || !day) return;
      const next = genCustomer(shop, day);
      pendingEntry.current = next.customerId;
      bridge.commands.customerEnter(next.customerId);
    }, delay);
    return () => {
      if (arrivalTimer.current) {
        clearTimeout(arrivalTimer.current);
        arrivalTimer.current = null;
      }
    };
  }, [phase, shop, day, bridge]);

  /* Bridge events. */
  useEffect(() => {
    return bridge.subscribe((e) => {
      switch (e.type) {
        case "prompt":
          setPrompt(e.station);
          break;
        case "roomChanged":
          setRoomId(e.room);
          // A customer whose entrance fired while the player was in another
          // room walks in as soon as the shop is on screen again.
          if (e.room === "shop" && pendingEntry.current) {
            bridge.commands.customerEnter(pendingEntry.current);
          }
          break;
        case "customerAtCounter":
          pendingEntry.current = null;
          dispatch({ type: "customerArrived" });
          break;
        case "customerGone":
          break;
        case "doorBell":
          sfx("doorBell", { bus: "game" });
          break;
        case "step":
          sfx("footstep", { bus: "game", jitter: 0.12 });
          break;
        case "benchZoomDone":
          setDeskVisible(true);
          break;
        case "standZoomDone":
          setSeated(false);
          break;
        case "interact":
          handleInteractRef.current(e.station);
          break;
        case "ready":
          break;
      }
    });
  }, [bridge]);

  /* ---------------- interactions ---------------- */

  const handleInteract = useCallback(
    (station: StationId) => {
      if (!shop || !day) return;
      const p = day.phase;
      switch (station) {
        case "counter":
          if (p !== "open" && p !== "evening" && p !== "sunday") return;
          if (day.waiting && p === "open") setIntakeOpen(true);
          else setStationOpen("counter");
          break;
        case "bench":
          if (p !== "open" && p !== "evening" && p !== "sunday" && p !== "result") return;
          setSeated(true);
          sfx("benchSit", { bus: "game" });
          bridge.commands.benchZoom();
          break;
        case "backroomDoor":
          teleport("backroom", "fromShop");
          break;
        case "backroomExit":
          teleport("shop", "fromBackroom");
          break;
        case "stairsUp":
          if (p === "open") setConfirm("close");
          else teleport("bedroom", "fromShop");
          break;
        case "stairsDown":
          teleport("shop", "fromBedroom");
          break;
        case "bed":
          if (p === "evening" || p === "bust" || p === "sunday") setConfirm("sleep");
          break;
        case "tower":
          if (p === "sunday" && !day.attemptedBackroom) setConfirm("attempt");
          break;
        default:
          if (REPAIR_STATIONS.includes(station)) setStationOpen(station);
      }
    },
    [shop, day, bridge, teleport],
  );
  const handleInteractRef = useRef(handleInteract);
  useEffect(() => {
    handleInteractRef.current = handleInteract;
  }, [handleInteract]);

  /* Music: the machine's theme for the tower, the duel bed for jobs, the
   * desk bed everywhere else. */
  const towerDive = phase === "tutorial" || (phase === "duel" && !day?.ticket);
  useEffect(() => {
    if (slot === null) return;
    void playMusic(towerDive ? "finale" : inDive ? "dive" : "desk");
  }, [towerDive, inDive, slot]);

  /* A bust ends any seat: you wake at the bench, the desk is dark. */
  useEffect(() => {
    if (phase === "bust") {
      setBustAck(false);
      setDeskVisible(false);
      setSeated(false);
      bridge.commands.standZoom();
    }
  }, [phase, bridge]);

  /* The result screen lives on the desktop; a dive launched from the chair
   * returns to it. */
  useEffect(() => {
    if (phase === "result" && !seated) {
      setSeated(true);
      setDeskVisible(true);
    }
  }, [phase, seated]);

  /* ---------------- gates before the world ---------------- */

  if (!ready || !booted) {
    return <BootScreen onSkip={ready ? () => setBooted(true) : undefined} />;
  }

  if (slot === null) {
    return (
      <LoginScreen
        onLogin={(n) => {
          const loadedMeta = applyOneTimeSoundReset(loadSlotMeta(n));
          const loadedShop = loadSlotShop(n);
          const loadedDay = loadSlotDay(n);
          dispatch({ type: "hydrate", meta: loadedMeta, shop: loadedShop, day: loadedDay });
          if (!loadedShop) {
            dispatch({
              type: "newGame",
              seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
            });
          }
          setSlot(n);
        }}
      />
    );
  }

  if (!shop || !day) {
    // One render frame between hydrate and newGame on a fresh slot.
    return <BootScreen />;
  }

  /* ---------------- the dive owns the whole screen ---------------- */

  if (inDive) {
    const isTutorial = phase === "tutorial";
    const ticket = day.ticket;
    const isBackroom = !isTutorial && !ticket;
    const customer = ticket ? customerById(ticket.customerId) : null;
    const cfg = isTutorial
      ? tutorialConfig()
      : isBackroom
        ? backroomConfig()
        : tierDuelConfig(ticket!.tier, ticket!.dominant, ticket!.kitSeed);
    const kit = isTutorial ? BASE_KIT : duelKitOf(shop, day);
    const seed = isTutorial
      ? mixSeed(shop.seed, 0, 0)
      : isBackroom
        ? mixSeed(shop.seed, shop.day, 99)
        : mixSeed(shop.seed, shop.day, day.jobsResolved);
    return (
      <TeachProvider
        taught={meta.taught}
        day={isTutorial ? 0 : shop.day}
        onTaught={(id) => dispatch({ type: "taught", id })}
      >
        <div className={crt === "flat" ? "kp-os kp-crt-on" : "kp-os"}>
          <DuelScreen
            key={`dive-${shop.seed}-${shop.day}-${day.jobsResolved}-${phase}`}
            cfg={cfg}
            seed={seed}
            kit={kit}
            ramPerTurn={isTutorial ? 5 : shop.deck.ramPerTurn}
            jobTitle={isTutorial || isBackroom ? "THE MACHINE" : customer ? customer.device : "UNKNOWN DEVICE"}
            jobSub={
              isTutorial
                ? "The door was open. It wanted you to come in."
                : isBackroom
                  ? "Everything it has. Everything you have."
                  : customer
                    ? `${customer.name} - tier ${ticket?.tier ?? 1} intrusion`
                    : ""
            }
            dominantTell={
              isTutorial
                ? null
                : isBackroom
                  ? "It runs every config you have ever seen, at full width."
                  : ticket
                    ? MODE_TELL[ticket.dominant]
                    : null
            }
            strain={day.strain}
            day={isTutorial ? 0 : shop.day}
            customerId={customer?.id ?? null}
            soundOn={meta.sound}
            onToggleSound={() => dispatch({ type: "toggleSound" })}
            onFinish={(r) => {
              if (isTutorial) {
                dispatch({ type: "tutorialDone" });
                return;
              }
              const failedCustomer = !r.won && ticket ? ticket.customerId : null;
              dispatch({
                type: "duelFinished",
                won: r.won,
                chip: r.chip,
                capWin: r.capWin,
                pouchLeft: r.pouchLeft,
                overRotations: r.overRotations,
                trapsFired: r.trapsFired,
                redirectsTaken: r.redirectsTaken,
                pressureRounds: r.pressureRounds,
                scans: r.scans,
                attackCasts: r.attackCasts,
                defendCasts: r.defendCasts,
                rounds: r.rounds,
                trapRounds: r.trapRounds,
                parRounds: r.parRounds,
                log: r.log,
              });
              if (failedCustomer) setLossToast(failedCustomer);
            }}
          />
          {crt === "flat" && <Glass />}
        </div>
      </TeachProvider>
    );
  }

  /* ---------------- overlays over the room ---------------- */

  let overlay: React.ReactNode = null;
  if (phase === "tutIntro") {
    overlay = (
      <SceneShroud>
        <StoryScene scene={tutorialIntroScene()} onDone={() => dispatch({ type: "storyDone" })} />
      </SceneShroud>
    );
  } else if (phase === "tutOutro") {
    overlay = (
      <SceneShroud>
        <StoryScene scene={tutorialOutroScene()} onDone={() => dispatch({ type: "storyDone" })} />
      </SceneShroud>
    );
  } else if (phase === "morning") {
    overlay = <MorningCard line={morningLine(shop.day)} onDone={() => dispatch({ type: "storyDone" })} />;
  } else if (phase === "finaleWin") {
    overlay = (
      <SceneShroud>
        <StoryScene scene={finaleWinScene()} onDone={() => dispatch({ type: "storyDone" })} />
      </SceneShroud>
    );
  } else if (phase === "bust" && !bustAck) {
    overlay = (
      <SceneShroud>
        <StoryScene scene={bustScene()} onDone={() => setBustAck(true)} />
      </SceneShroud>
    );
  } else if (phase === "sunday" && shop.sundayScenes < Math.floor(shop.day / 7)) {
    overlay = (
      <SceneShroud>
        <StoryScene
          scene={sundayScene(shop.sundayScenes)}
          onDone={() => dispatch({ type: "sundaySceneDone" })}
        />
      </SceneShroud>
    );
  } else if (sectorShown !== null) {
    const scene = sectorScene(sectorShown);
    overlay = scene ? (
      <SceneShroud>
        <StoryScene scene={scene} onDone={() => setSectorShown(null)} />
      </SceneShroud>
    ) : null;
  } else if (firstRead) {
    overlay = (
      <FirstRead
        def={firstRead}
        onDone={() => {
          if (firstRead.artifactId) dispatch({ type: "readArtifact", id: firstRead.artifactId });
          const sector = firstRead.sector;
          setFirstRead(null);
          if (sector) setSectorShown(sector);
        }}
      />
    );
  } else if (intakeOpen) {
    overlay = (
      <IntakeDialog
        state={state}
        dispatch={dispatch}
        onClose={(accepted) => {
          setIntakeOpen(false);
          bridge.commands.customerLeave();
          if (!accepted) sfx("inboxFile", { bus: "ui" });
        }}
      />
    );
  } else if (stationOpen) {
    overlay = (
      <StationPanel
        station={stationOpen}
        state={state}
        dispatch={dispatch}
        onClose={() => setStationOpen(null)}
        onRepaired={(def) => {
          setStationOpen(null);
          setFirstRead(def);
        }}
      />
    );
  } else if (confirm === "close") {
    const heldLine =
      day.held.credits > 0 || day.held.salvage > 0
        ? `Everything held today banks the moment you do: ${day.held.credits} cr${day.held.salvage > 0 ? ` and ${day.held.salvage} salvage` : ""}.`
        : "Nothing is held. The day ends quietly.";
    overlay = (
      <ConfirmPanel
        title="CLOSE THE SHOP?"
        body={[heldLine, day.ticket ? "The ticket on the spike goes home unfinished. No charge." : ""]}
        confirmLabel="CLOSE AND GO UP"
        onConfirm={() => {
          setConfirm(null);
          sfx("dayClose", { bus: "ui" });
          dispatch({ type: "closeShop" });
          teleport("bedroom", "fromShop");
        }}
        onCancel={() => setConfirm(null)}
      />
    );
  } else if (confirm === "sleep") {
    overlay = (
      <ConfirmPanel
        title="SLEEP?"
        body={[
          phase === "bust"
            ? "The day is gone. Everything banked is untouched. Tomorrow opens normally."
            : "Everything spent tonight stays spent. Everything banked stays banked.",
        ]}
        confirmLabel="LIGHTS OUT"
        onConfirm={() => {
          setConfirm(null);
          sfx("dayClose", { bus: "ui" });
          dispatch({ type: "sleep" });
        }}
        onCancel={() => setConfirm(null)}
      />
    );
  } else if (confirm === "attempt") {
    overlay = (
      <ConfirmPanel
        title="THE BACK ROOM"
        body={[
          "The door is open. It always was. One attempt, and Sunday is what it costs.",
          "It has already moved by the time you sit down. It always has.",
        ]}
        confirmLabel="JACK IN"
        onConfirm={() => {
          setConfirm(null);
          sfx("claimTick", { bus: "ui" });
          dispatch({ type: "attemptBackroom" });
        }}
        onCancel={() => setConfirm(null)}
      />
    );
  }

  return (
    <TeachProvider taught={meta.taught} day={shop.day} onTaught={(id) => dispatch({ type: "taught", id })}>
      <div className="sc-root">
        <OverworldStage bridge={bridge} />

        {!deskVisible && !overlay && (
          <>
            <RoomHud state={state} />
            <PromptBar station={prompt} state={state} />
            {roomId === "shop" && phase === "open" && <Teach id="walk-interact" />}
          </>
        )}

        {lossToast && <LossToast customerId={lossToast} onDone={() => setLossToast(null)} />}

        {seated && deskVisible && (
          <ShopOS
            state={state}
            dispatch={dispatch}
            slot={slot}
            wm={wm}
            crt={crt}
            onCrtToggle={() => setCrt((c) => (c === "flat" ? "off" : "flat"))}
            themeLabel={theme.label}
            onThemeNext={() => setThemeIndex((i) => (i + 1) % THEMES.length)}
            onStandUp={standUp}
            onLogout={() => {
              void playMusic(null);
              setSlot(null);
              setSeated(false);
              setDeskVisible(false);
              dispatch({ type: "hydrate", meta: EMPTY_META, shop: null, day: null });
            }}
          />
        )}

        {overlay}
      </div>
    </TeachProvider>
  );
}

/** The scene-layer shroud a story panel floats over. */
function SceneShroud({ children }: { children: React.ReactNode }) {
  return (
    <div className="sc-shroud">
      <div className="sc-shroud-panel">{children}</div>
    </div>
  );
}

/** The six glass layers of law 6. The glass belongs to the terminal and the
 * dive; the room never wears it. */
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
