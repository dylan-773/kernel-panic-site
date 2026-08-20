import { useEffect, useMemo, useState } from "react";
import { sfx } from "../../game/audio";
import { CUSTOMERS } from "../../game/content/customers";
import { MODE_LABEL, MODE_TELL } from "../../game/content/kit";
import { REPAIRS, RepairDef, diagDepth, nextRepairAt } from "../../game/content/repairs";
import { COUNTER_COPY, REPAIR_STAGE_FIRST_READ, REPAIR_STATION_COPY, ROOM_COPY } from "../../game/content/story";
import { jobPay } from "../../game/content/tiers";
import type { DayAction, GameState } from "../../game/day-reducer";
import type { StationId } from "../../game/overworld/world";
import { WEEKDAYS, weekdayOf } from "../../game/save";
import { Teach } from "../game/teach";

/**
 * The room's own interface: a HUD as small as its four facts allow
 * (strain, the clock, the counter, the haul), the interact prompt, the
 * face-to-face intake, and the station panels. This is the scene layer:
 * the KP/OS window laws do not govern it, but the vocabulary carries -
 * boxed label rows, no border radius, risk never colour alone.
 */

type Dispatch = (a: DayAction) => void;

const STRAIN_ALARM_AT = 35;

export function customerProfile(id: string) {
  return CUSTOMERS.find((c) => c.id === id) ?? CUSTOMERS[0];
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

export function RoomHud({ state }: { state: GameState }) {
  const { shop, day } = state;
  if (!shop || !day) return null;
  const heldTotal = day.held.credits;
  const strain = day.strain;
  const alarm = strain <= STRAIN_ALARM_AT;
  return (
    <div className="sc-hud">
      <span className={alarm ? "sc-hud-chip sc-hud-strain sc-alarm" : "sc-hud-chip sc-hud-strain"}>
        <span>STRAIN</span>
        <em>{strain}</em>
        {alarm && <i className="sc-riskflash" aria-hidden="true" />}
      </span>
      <span className="sc-hud-chip">
        <span>{WEEKDAYS[weekdayOf(shop.day)]}</span>
        <em>DAY {shop.day}</em>
      </span>
      <span className="sc-hud-chip">
        <span>CR</span>
        <em>{shop.credits}</em>
      </span>
      {(heldTotal > 0 || day.held.salvage > 0) && (
        <span className="sc-hud-chip sc-hud-held">
          <span>HELD</span>
          <em>
            {heldTotal} cr{day.held.salvage > 0 ? ` +${day.held.salvage} sv` : ""}
          </em>
        </span>
      )}
      {day.waiting && (
        <span className="sc-hud-chip sc-hud-bell">
          <span>COUNTER</span>
          <em>{COUNTER_COPY.waitingLine}</em>
        </span>
      )}
      {day.ticket && !day.waiting && (
        <span className="sc-hud-chip">
          <span>SPIKE</span>
          <em>1 TICKET</em>
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The interact prompt                                                 */
/* ------------------------------------------------------------------ */

export function promptLabel(station: StationId, state: GameState): string {
  const { shop, day } = state;
  if (!shop || !day) return "";
  const evening = day.phase === "evening" || day.phase === "sunday";
  switch (station) {
    case "counter":
      return day.waiting ? COUNTER_COPY.greetPrompt : ROOM_COPY.counterPrompt;
    case "bench":
      return ROOM_COPY.benchPrompt;
    case "backroomDoor":
      return ROOM_COPY.doorPrompt;
    case "stairsUp":
      if (day.phase === "open")
        return day.held.credits > 0 || day.held.salvage > 0
          ? ROOM_COPY.closePromptHeld
          : ROOM_COPY.closePromptEmpty;
      return ROOM_COPY.stairsPrompt;
    case "stairsDown":
      return ROOM_COPY.stairsDownPrompt;
    case "bed":
      return ROOM_COPY.bedPromptOpen;
    case "tower":
      if (state.meta.machineOpened) return ROOM_COPY.backroomPromptOpened;
      if (day.phase !== "sunday") return ROOM_COPY.backroomPromptWeekday;
      return day.attemptedBackroom ? ROOM_COPY.backroomPromptSpent : ROOM_COPY.backroomPromptSunday;
    case "backroomExit":
      return "BACK TO THE SHOP";
    default: {
      const def = REPAIRS.find((r) => r.station === station);
      if (!def) return "";
      const copy = REPAIR_STATION_COPY[def.station];
      const next = nextRepairAt(def.station, shop.repairs);
      if (!next) return copy.label;
      return evening ? `${copy.label} (${next.cost} CR)` : copy.label;
    }
  }
}

export function PromptBar({ station, state }: { station: StationId | null; state: GameState }) {
  if (!station) return null;
  const label = promptLabel(station, state);
  if (!label) return null;
  return (
    <div className="sc-prompt">
      <span className="sc-prompt-key">E</span>
      <span className="sc-prompt-label">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Face-to-face intake                                                 */
/* ------------------------------------------------------------------ */

export function IntakeDialog({
  state,
  dispatch,
  onClose,
}: {
  state: GameState;
  dispatch: Dispatch;
  onClose: (accepted: boolean) => void;
}) {
  const { shop, day } = state;
  const w = day?.waiting ?? null;
  const c = w ? customerProfile(w.customerId) : null;
  const depth = shop ? diagDepth(shop.repairs) : 0;
  const [typed, setTyped] = useState(0);
  const quote = c && w ? c.quotes[w.quoteIndex] : "";
  useEffect(() => {
    setTyped(0);
    if (!quote) return;
    const iv = setInterval(() => setTyped((n) => Math.min(quote.length, n + 1)), 14);
    return () => clearInterval(iv);
  }, [quote]);
  if (!shop || !day || !w || !c) return null;

  return (
    <div className="sc-panelwrap" role="dialog" aria-modal="true" aria-label="Customer at the counter">
      <div className="sc-panel sc-intake">
        <div className="sc-panel-head">
          <span className="sc-eyebrow">{"// THE COUNTER _"}</span>
          <span className="sc-panel-title">{c.name.toUpperCase()}</span>
          <span className="sc-panel-sub">{c.device}</span>
        </div>
        <div className="sc-intake-body">
          <div className="sc-intake-portrait">
            <img src={c.portrait} alt="" width={128} height={128} />
          </div>
          <div className="sc-intake-facts">
            <p className="sc-quote">
              {`"${quote.slice(0, typed)}"`}
              {typed < quote.length && <span className="kp-boot-cursor">_</span>}
            </p>
            <div className="sc-rows">
              <div className="sc-row">
                <span>PAYS</span>
                <em>{jobPay(w.tier)} CR</em>
              </div>
              <div className="sc-row">
                <span>THREAT TIER</span>
                {depth >= 1 ? (
                  <em>
                    {"◆".repeat(w.tier)}
                    {"◇".repeat(5 - w.tier)} T{w.tier}
                  </em>
                ) : (
                  <em className="sc-dead">BENCH CANNOT READ THIS YET (DIAGNOSTIC BENCH)</em>
                )}
              </div>
              <div className="sc-row">
                <span>DOMINANT ROUTINE</span>
                {depth >= 2 ? (
                  <em>{MODE_LABEL[w.dominant]}</em>
                ) : (
                  <em className="sc-dead">BENCH CANNOT READ THIS YET (DIAGNOSTIC BENCH II)</em>
                )}
              </div>
              <div className="sc-row">
                <span>OPENING MOVE</span>
                {depth >= 3 ? (
                  <em>{MODE_TELL[w.dominant]}</em>
                ) : (
                  <em className="sc-dead">BENCH CANNOT READ THIS YET (DIAGNOSTIC BENCH III)</em>
                )}
              </div>
              {w.visit > 1 && (
                <div className="sc-row">
                  <span>REGULAR</span>
                  <em>BEEN IN BEFORE. SAME MACHINE, NEW TROUBLE.</em>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="sc-panel-actions">
          <button
            type="button"
            className="kp-btn2 kp-btn2-signal"
            onClick={() => {
              sfx("granted", { bus: "ui" });
              dispatch({ type: "acceptJob" });
              onClose(true);
            }}
          >
            {COUNTER_COPY.acceptLabel}
          </button>
          <button
            type="button"
            className="kp-btn2 kp-btn2-ghost"
            onClick={() => {
              sfx("press", { bus: "ui" });
              dispatch({ type: "declineJob" });
              onClose(false);
            }}
          >
            {COUNTER_COPY.declineLabel}
          </button>
        </div>
        <Teach id="counter-intake" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Station panels                                                      */
/* ------------------------------------------------------------------ */

export interface StationPanelResult {
  /** A repair just completed: play its first read, then its sector. */
  repaired?: RepairDef;
}

export function StationPanel({
  station,
  state,
  dispatch,
  onClose,
  onRepaired,
}: {
  station: StationId;
  state: GameState;
  dispatch: Dispatch;
  onClose: () => void;
  onRepaired: (def: RepairDef) => void;
}) {
  const { shop, day } = state;
  if (!shop || !day) return null;
  const def = REPAIRS.find((r) => r.station === station);
  const copy = def ? REPAIR_STATION_COPY[def.station] : null;

  if (station === "counter") {
    const willRead = shop.artifactsRead.includes("will");
    return (
      <div className="sc-panelwrap" role="dialog" aria-modal="true" aria-label="The counter">
        <div className="sc-panel">
          <div className="sc-panel-head">
            <span className="sc-eyebrow">{"// THE COUNTER _"}</span>
            <span className="sc-panel-title">THE REGISTER, THE SPIKE, THE LEDGER</span>
          </div>
          <div className="sc-rows">
            <div className="sc-row">
              <span>THE SPIKE</span>
              <em>{day.ticket ? ROOM_COPY.spikeReadJobs : ROOM_COPY.spikeReadEmpty}</em>
            </div>
            <div className="sc-row">
              <span>THE REGISTER</span>
              <em>{willRead ? "THE WILL. STILL TAPED WHERE HE LEFT IT." : ROOM_COPY.registerRead[0]}</em>
            </div>
          </div>
          {!willRead && (
            <p className="sc-read">
              {ROOM_COPY.registerRead.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </p>
          )}
          <div className="sc-panel-actions">
            {!willRead && (
              <button
                type="button"
                className="kp-btn2 kp-btn2-signal"
                onClick={() => {
                  sfx("segmentMount", { bus: "ui" });
                  dispatch({ type: "readArtifact", id: "will" });
                }}
              >
                READ IT
              </button>
            )}
            <button type="button" className="kp-btn2 kp-btn2-ghost" onClick={onClose}>
              STEP AWAY
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!def || !copy) return null;

  const next = nextRepairAt(def.station, shop.repairs);
  const anyDone = REPAIRS.some((r) => r.station === def.station && shop.repairs.includes(r.id));
  const evening = day.phase === "evening" || day.phase === "sunday";
  const canAfford = next ? shop.credits >= next.cost : false;

  return (
    <div className="sc-panelwrap" role="dialog" aria-modal="true" aria-label={copy.label}>
      <div className="sc-panel">
        <div className="sc-panel-head">
          <span className="sc-eyebrow">{"// THE SHOP _"}</span>
          <span className="sc-panel-title">{next ? next.label : copy.label}</span>
          <span className={next ? "sc-state sc-state-broken" : "sc-state sc-state-fixed"}>
            {next ? (anyDone ? "PARTLY REPAIRED" : "BROKEN") : "REPAIRED"}
          </span>
        </div>
        <p className="sc-read">{next ? copy.brokenLine : copy.fixedLine}</p>
        {next && (
          <div className="sc-rows">
            <div className="sc-row">
              <span>UNLOCKS</span>
              <em>{next.unlocks}</em>
            </div>
            <div className="sc-row">
              <span>PRICE</span>
              <em>
                {next.cost} CR{"  "}(YOU HOLD {shop.credits})
              </em>
            </div>
            {!evening && (
              <div className="sc-row">
                <span>WHEN</span>
                <em>REPAIRS HAPPEN IN THE EVENING, AFTER CLOSE.</em>
              </div>
            )}
          </div>
        )}
        <div className="sc-panel-actions">
          {next && evening && (
            <button
              type="button"
              className="kp-btn2 kp-btn2-signal"
              disabled={!canAfford}
              onClick={() => {
                sfx("unlock", { bus: "ui" });
                dispatch({ type: "buyRepair", id: next.id });
                onRepaired(next);
              }}
            >
              {canAfford ? `REPAIR IT (${next.cost} CR)` : `NEED ${next.cost} CR`}
            </button>
          )}
          <button type="button" className="kp-btn2 kp-btn2-ghost" onClick={onClose}>
            STEP AWAY
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* First read: the artifact, at the object                             */
/* ------------------------------------------------------------------ */

export function FirstRead({
  def,
  onDone,
}: {
  def: RepairDef;
  onDone: () => void;
}) {
  const copy = REPAIR_STATION_COPY[def.station];
  const lines = REPAIR_STAGE_FIRST_READ[def.id] ?? copy.firstRead;
  const [line, setLine] = useState(0);
  const last = line >= lines.length - 1;
  return (
    <div
      className="sc-panelwrap"
      role="dialog"
      aria-modal="true"
      aria-label="Something surfaced"
      onClick={() => {
        sfx("story", { bus: "ui" });
        if (last) onDone();
        else setLine(line + 1);
      }}
    >
      <div className="sc-panel sc-firstread">
        <div className="sc-panel-head">
          <span className="sc-eyebrow">{"// TURNED UP _"}</span>
          <span className="sc-panel-title">{copy.label}</span>
        </div>
        <div className="sc-readlines">
          {lines.slice(0, line + 1).map((l, i) => (
            <p key={i} className={i < line ? "sc-readline is-past" : "sc-readline"}>
              {l}
            </p>
          ))}
        </div>
        <div className="sc-panel-actions">
          <button type="button" className="kp-btn2 kp-btn2-signal">
            {last ? "CONTINUE" : "NEXT"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small toasts                                                        */
/* ------------------------------------------------------------------ */

export function MorningCard({ line, onDone }: { line: string; onDone: () => void }) {
  return (
    <div className="sc-panelwrap sc-morningwrap" onClick={onDone} role="dialog" aria-modal="true">
      <div className="sc-panel sc-morning">
        <span className="sc-eyebrow">{"// MORNING _"}</span>
        <p className="sc-morningline">{line}</p>
        <div className="sc-panel-actions">
          <button type="button" className="kp-btn2 kp-btn2-signal" onClick={onDone}>
            OPEN THE SHOP
          </button>
        </div>
      </div>
    </div>
  );
}

export function LossToast({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const c = customerProfile(customerId);
  useEffect(() => {
    const t = setTimeout(onDone, 5200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="sc-toast" role="status" onClick={onDone}>
      <span className="sc-eyebrow">{"// CORE LOST. NO CHARGE, NO STRAIN. _"}</span>
      <p>{c.lossLine}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirms: closing and sleeping                                      */
/* ------------------------------------------------------------------ */

export function ConfirmPanel({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sc-panelwrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sc-panel">
        <div className="sc-panel-head">
          <span className="sc-eyebrow">{"// THE SHOP _"}</span>
          <span className="sc-panel-title">{title}</span>
        </div>
        {body.map((l, i) => (
          <p key={i} className="sc-read">
            {l}
          </p>
        ))}
        <div className="sc-panel-actions">
          <button type="button" className="kp-btn2 kp-btn2-signal" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="kp-btn2 kp-btn2-ghost" onClick={onCancel}>
            NOT YET
          </button>
        </div>
      </div>
    </div>
  );
}

/* Memo for the shell: which stations belong to repairs. */
export const REPAIR_STATIONS: StationId[] = [
  "solderBay",
  "shelves",
  "powerBox",
  "onionRouter",
  "diagBench",
  "bottomDrawer",
  "ledgerTerminal",
  "driveRig",
];

export function useReducedMotionPref(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
}
