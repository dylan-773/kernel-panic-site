import { Link } from "@tanstack/react-router";
import { useEffect, useReducer, useRef, useState } from "react";
import { isMuted, playFx, setMuted } from "../../game/audio";
import { TYPE_META, pickCustomer } from "../../game/copy";
import { DiveState, diveReducer, initDive } from "../../game/dive-reducer";
import { loadProgress, saveProgress } from "../../game/progress";
import { DiveType } from "../../game/types";
import { BoardView } from "./board";

/**
 * Fixed first-load seeds so the server render and the client hydration build
 * the identical board. "New grid" reseeds on the client afterwards.
 */
const BASE_SEEDS: Record<DiveType, number> = {
  hardware: 20260718,
  network: 90817,
  data: 46290,
  software: 77031,
};

function fmtSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

export function DiveScreen({ type }: { type: DiveType }) {
  const [state, dispatch] = useReducer(
    diveReducer,
    type,
    (t: DiveType): DiveState => initDive(t, BASE_SEEDS[t]),
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const meta = TYPE_META[type];
  const customer = pickCustomer(type, state.seed);

  // Sound preference from the local ledger.
  useEffect(() => {
    const p = loadProgress();
    setSoundOn(p.sound);
    setMuted(!p.sound);
  }, []);

  // Dive clock: only the timed modes need one.
  useEffect(() => {
    if (state.phase !== "run") return;
    if (type === "hardware" || type === "data") return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(200, now - last);
      last = now;
      if (dt > 0) dispatch({ type: "tick", dt });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.phase, type]);

  // Play and drain queued sound effects.
  useEffect(() => {
    if (state.fx.length === 0) return;
    for (const e of state.fx) playFx(e.kind);
    dispatch({ type: "fxDrain", upTo: state.fx[state.fx.length - 1].id });
  }, [state.fx]);

  // Bank the payout exactly once per finished dive.
  const bankedRef = useRef(false);
  useEffect(() => {
    if (state.phase === "won" || state.phase === "lost") {
      if (bankedRef.current || !state.result) return;
      bankedRef.current = true;
      const p = loadProgress();
      p.credits += state.result.credits;
      p.xp[type] += state.result.xp;
      if (state.phase === "won") p.clears[type]++;
      saveProgress(p);
    } else {
      bankedRef.current = false;
    }
  }, [state.phase, state.result, type]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
    const p = loadProgress();
    p.sound = next;
    saveProgress(p);
    if (next && isMuted() === false) playFx("rotate");
  };

  const newGrid = () => {
    dispatch({ type: "regen", seed: (Date.now() ^ (Math.random() * 0xffff)) >>> 0 });
    setHelpOpen(false);
  };

  const frozen = type === "network" && state.phase === "run" && state.t < state.frozenUntil;
  const pingActive = type === "software" && state.phase === "run" && state.pingUntil > state.t;
  const crashLeft = state.deadline - state.t;
  const advTotal = Math.max(1, state.board.advPath.length - 1);
  const advProgress = Math.min(1, (state.advClaimed - 1) / advTotal);

  return (
    <div className={`kp-dive kp-dive-${type}`}>
      <header className="kp-dive-top">
        <Link to="/" className="kp-back">
          <span aria-hidden="true">{"<"}</span> Bench
        </Link>
        <div className="kp-dive-title">
          <span className="kp-dive-name">{meta.name} dive</span>
          <span className="kp-stat-chip">{meta.stat}</span>
        </div>
        <div className="kp-dive-actions">
          <button type="button" className="kp-switch" onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? "Sound on" : "Sound off"}
          </button>
          <button
            type="button"
            className="kp-switch"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
          >
            Protocol
          </button>
          <button type="button" className="kp-switch" onClick={newGrid}>
            New grid
          </button>
        </div>
      </header>

      <div className="kp-dive-main">
        <div className="kp-board-wrap">
          <BoardView
            board={state.board}
            power={state.power}
            phase={state.phase}
            t={state.t}
            pingActive={pingActive}
            advClaimed={state.advClaimed}
            onCell={(idx) => dispatch({ type: "click", idx })}
          />

          {frozen && (
            <div className="kp-freeze" role="status">
              <span>CONTROLS FROZEN</span>
            </div>
          )}

          {state.notice && state.phase === "run" && (
            <div key={state.notice.id} className="kp-toast" role="status">
              {state.notice.text}
            </div>
          )}
        </div>

        <aside className="kp-panel">
          <p className="kp-objective">{meta.objective}</p>

          {type === "network" && (
            <div className="kp-meter-block">
              <div className="kp-meter-head">
                <span>Intruder</span>
                <span>{Math.max(0, state.board.advPath.length - state.advClaimed)} nodes out</span>
              </div>
              <div className="kp-meter kp-meter-adv">
                <div className="kp-meter-fill" style={{ width: `${advProgress * 100}%` }} />
              </div>
            </div>
          )}

          {type === "software" && (
            <>
              <div className="kp-meter-block">
                <div className="kp-meter-head">
                  <span>Crash timer</span>
                  <span className={crashLeft < 10000 ? "kp-danger-text" : undefined}>
                    {state.phase === "run" ? fmtSeconds(crashLeft) : fmtSeconds(state.board.crashBaseMs)}
                  </span>
                </div>
                <div className="kp-meter kp-meter-crash">
                  <div
                    className="kp-meter-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, (crashLeft / state.board.crashBaseMs) * 100))}%`,
                    }}
                  />
                </div>
              </div>
              <div className="kp-readout">
                <span>Bugs patched</span>
                <strong>
                  {state.patchedCount} / {state.board.bugCount}
                </strong>
              </div>
              <div className="kp-readout">
                <span>Next in sequence</span>
                <strong>
                  {state.nextExpectedBug <= state.board.bugCount ? `#${state.nextExpectedBug}` : "done"}
                </strong>
              </div>
              <div className="kp-readout">
                <span>Next ping</span>
                <strong>
                  {state.phase === "run"
                    ? pingActive
                      ? "live"
                      : fmtSeconds(state.nextPing - state.t)
                    : "standby"}
                </strong>
              </div>
            </>
          )}

          {type === "data" && (
            <>
              <div className="kp-meter-block">
                <div className="kp-meter-head">
                  <span>Integrity</span>
                  <span className={state.integrity < 60 ? "kp-danger-text" : undefined}>
                    {state.integrity}%
                  </span>
                </div>
                <div className="kp-meter kp-meter-integrity">
                  <div className="kp-meter-fill" style={{ width: `${state.integrity}%` }} />
                </div>
              </div>
              <div className="kp-readout">
                <span>Fragments</span>
                <strong>
                  {state.fragsGot} / {state.board.fragCount}
                  {state.fragsLost > 0 ? ` (${state.fragsLost} lost)` : ""}
                </strong>
              </div>
              <div className="kp-readout">
                <span>Moves vs reference</span>
                <strong>
                  {state.moves} / {state.board.parMoves}
                </strong>
              </div>
            </>
          )}

          {type === "hardware" && (
            <>
              <div className="kp-readout">
                <span>Salvage found</span>
                <strong>
                  {state.lootGot} / {state.board.lootCount}
                </strong>
              </div>
              <div className="kp-readout">
                <span>Moves</span>
                <strong>{state.moves}</strong>
              </div>
            </>
          )}

          {type !== "hardware" && (
            <div className="kp-readout">
              <span>Moves</span>
              <strong>{state.moves}</strong>
            </div>
          )}

          <div className="kp-legend">
            {legendFor(type).map(([glyph, text]) => (
              <div key={text} className="kp-legend-row">
                <span className={`kp-legend-glyph kp-legend-${glyph}`} aria-hidden="true" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {state.phase === "brief" && (
        <div className="kp-overlay">
          <div className="kp-card kp-brief">
            <p className="kp-card-kicker">Incoming job</p>
            <h1 className="kp-card-title">
              {customer.name}
              <span className="kp-card-device">{customer.device}</span>
            </h1>
            <blockquote className="kp-quote">"{customer.quote}"</blockquote>
            <div className="kp-rules">
              <p className="kp-rules-head">{meta.name} dive protocol</p>
              <ul>
                {meta.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <button type="button" className="kp-cta-dive" onClick={() => dispatch({ type: "begin" })}>
              Start the dive
            </button>
          </div>
        </div>
      )}

      {(state.phase === "won" || state.phase === "lost") && state.result && (
        <div className="kp-overlay">
          <div className={`kp-card kp-result ${state.phase === "won" ? "kp-result-won" : "kp-result-lost"}`}>
            <p className="kp-card-kicker">{meta.name} dive report</p>
            <h1 className="kp-result-status">
              {state.phase === "won" ? "Repair complete" : "Dive failed"}
            </h1>
            {state.result.grade && <p className="kp-grade">{state.result.grade}</p>}
            <p className="kp-flavor">{state.result.flavor}</p>
            <dl className="kp-result-rows">
              {state.result.rows.map((row) => (
                <div key={row.label} className="kp-result-row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <div className="kp-result-actions">
              <button type="button" className="kp-cta-again" onClick={newGrid}>
                Dive again
              </button>
              <Link to="/" className="kp-cta-back">
                Back to bench
              </Link>
            </div>
          </div>
        </div>
      )}

      {helpOpen && state.phase === "run" && (
        <div className="kp-helpsheet" role="dialog" aria-label="Dive protocol">
          <p className="kp-rules-head">{meta.name} dive protocol</p>
          <ul>
            {meta.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {type === "network" && <p className="kp-help-note">The intruder does not wait while you read.</p>}
          <button type="button" className="kp-switch" onClick={() => setHelpOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function legendFor(type: DiveType): Array<[string, string]> {
  switch (type) {
    case "hardware":
      return [
        ["source", "Intake port, your signal starts here"],
        ["core", "Core, route the signal into it"],
        ["and", "Dual gate, needs two live feeds"],
        ["jam", "Jammed, tap repeatedly to force"],
        ["loot", "Salvage cache, light it for pay"],
      ];
    case "network":
      return [
        ["source", "Your port"],
        ["adv", "Intruder port and trace"],
        ["core", "Core, first connection wins"],
        ["lock", "Locked junction, wait it out"],
      ];
    case "data":
      return [
        ["source", "Intake port"],
        ["core", "Core, completes the recovery"],
        ["frag", "Data fragment, light to secure"],
        ["corrupt", "Corrupt sector, never feed it"],
      ];
    case "software":
      return [
        ["source", "Intake port"],
        ["bug", "Bug node, revealed by the ping"],
        ["patched", "Patched bug, timer extended"],
      ];
  }
}
