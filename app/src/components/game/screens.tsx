import { useEffect, useState } from "react";
import { ABILITY_BY_ID, VERB_LABEL, VERB_TELL, copyPrice } from "../../game/content/abilities";
import { DAY_CONFIGS, FINAL_DAY } from "../../game/content/arc";
import { CUSTOMERS, CustomerProfile } from "../../game/content/customers";
import { Scene } from "../../game/content/story";
import { AbilityId } from "../../game/duel-types";
import { GameState, RunAction } from "../../game/run-reducer";
import { MetaState, RunState } from "../../game/save";

export function customerById(id: string): CustomerProfile {
  return CUSTOMERS.find((c) => c.id === id) ?? CUSTOMERS[0];
}

type Dispatch = (a: RunAction) => void;

/* ------------------------------------------------------------------ */
/* Story scene player                                                  */
/* ------------------------------------------------------------------ */

const SPEAKER_NAME: Record<string, string> = {
  sister: "RHEA",
  father: "DAD",
  system: "SYSTEM",
  companion: "???",
};

export function StoryScene({ scene, onDone }: { scene: Scene; onDone: () => void }) {
  const [beat, setBeat] = useState(0);
  useEffect(() => setBeat(0), [scene.id]);
  const b = scene.beats[beat];
  if (!b) return null;
  const last = beat >= scene.beats.length - 1;
  const advance = () => {
    if (last) onDone();
    else setBeat(beat + 1);
  };
  return (
    <div className="kp-story" onClick={advance}>
      {b.still && (
        <div className="kp-story-still">
          <img src={b.still} alt="" width={576} height={384} />
        </div>
      )}
      <div className={`kp-story-beat kp-story-${b.speaker}`} key={beat}>
        {b.portrait && (
          <img className="kp-story-portrait" src={b.portrait} alt="" width={96} height={96} />
        )}
        <div className="kp-story-text">
          <span className="kp-story-name">{b.name ?? SPEAKER_NAME[b.speaker]}</span>
          {b.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      </div>
      <button type="button" className="kp-story-next" onClick={advance}>
        {last ? "CONTINUE" : "NEXT"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Day job board                                                       */
/* ------------------------------------------------------------------ */

export function JobBoard({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  return (
    <div className="kp-screen kp-jobs">
      <header className="kp-screen-head">
        <h2>DAY {run.day} OF {FINAL_DAY}</h2>
        <p>Three tickets. Strain is shared across all of them. Pick your order.</p>
      </header>
      <div className="kp-job-grid">
        {run.jobs.map((job, i) => {
          const c = customerById(job.customerId);
          const done = run.jobsDone[i];
          return (
            <button
              key={i}
              type="button"
              className={done ? "kp-job kp-job-done" : "kp-job"}
              disabled={done}
              onClick={() => dispatch({ type: "pickJob", index: i })}
            >
              <div className="kp-job-top">
                <img src={c.portrait} alt="" width={64} height={64} className="kp-job-face" />
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.device}</span>
                </div>
              </div>
              <p className="kp-job-quote">"{c.quotes[job.quoteIndex]}"</p>
              <div className="kp-job-foot">
                <span className="kp-job-tier">
                  THREAT {"■".repeat(job.tier)}
                  {"□".repeat(5 - job.tier)}
                </span>
                <span className="kp-job-pay">{done ? "CLEARED" : `${40 + 25 * job.tier} cr`}</span>
              </div>
            </button>
          );
        })}
      </div>
      <footer className="kp-screen-foot">
        <span>STRAIN {run.strain}</span>
        <span>{run.credits} cr</span>
        <span>RAM {run.ramPerTurn}/turn</span>
        <span>CAPACITY {run.capacity}</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analyze                                                             */
/* ------------------------------------------------------------------ */

export function AnalyzeScreen({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const job = run.activeJob !== null ? run.jobs[run.activeJob] : null;
  if (!job) return null;
  const c = customerById(job.customerId);
  const day = DAY_CONFIGS[run.day];
  return (
    <div className="kp-screen kp-analyze">
      <header className="kp-screen-head">
        <h2>DIAGNOSTIC</h2>
        <p>
          {c.name} - {c.device}
        </p>
      </header>
      <div className="kp-analyze-grid">
        <div className="kp-analyze-block">
          <h3>INTAKE</h3>
          <p>"{c.quotes[job.quoteIndex]}"</p>
        </div>
        <div className="kp-analyze-block kp-analyze-threat">
          <h3>READOUT</h3>
          <p className="kp-analyze-tell">{VERB_TELL[job.dominant]}</p>
          <div className="kp-analyze-rows">
            <div>
              <span>DOMINANT ROUTINE</span>
              <em>{VERB_LABEL[job.dominant]}</em>
            </div>
            <div>
              <span>THREAT TIER</span>
              <em>{job.tier} of 5</em>
            </div>
            <div>
              <span>GRID</span>
              <em>
                {day.grid[0]}x{day.grid[1]}
              </em>
            </div>
            <div>
              <span>INTRUSION RAM</span>
              <em>{day.oppRam}/turn</em>
            </div>
            {day.headStart > 0 && (
              <div className="kp-analyze-warn">
                <span>WARNING</span>
                <em>Intrusion already {day.headStart} nodes deep</em>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="kp-screen-actions">
        <button type="button" className="kp-btn-ghost" onClick={() => dispatch({ type: "backToDay" })}>
          BACK
        </button>
        <button type="button" className="kp-btn" onClick={() => dispatch({ type: "toBuild" })}>
          ADJUST BUILD
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Build (loadout + copies)                                            */
/* ------------------------------------------------------------------ */

export function BuildScreen({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: Dispatch;
}) {
  const run = state.run as RunState;
  const meta = state.meta;
  const isFinale = run.day === FINAL_DAY;
  return (
    <div className="kp-screen kp-build">
      <header className="kp-screen-head">
        <h2>ADJUST BUILD</h2>
        <p>
          Neural Capacity {run.equipped.length}/{run.capacity} - {run.credits} cr - abilities burn a
          copy per cast
        </p>
      </header>
      <div className="kp-build-grid">
        <div className="kp-build-col">
          <h3>EQUIPPED</h3>
          {run.equipped.length === 0 && <p className="kp-rail-dim">Empty slots. Dive bare if you dare.</p>}
          {run.equipped.map((id) => {
            const def = ABILITY_BY_ID[id];
            return (
              <button
                key={id}
                type="button"
                className="kp-loadout-item kp-loadout-on"
                onClick={() => dispatch({ type: "unequip", id })}
                title={def.desc}
              >
                <strong>{def.name}</strong>
                <span>
                  T{def.tier} - {def.ramCost} RAM - x{run.copies[id] ?? 0}
                </span>
                <em>UNEQUIP</em>
              </button>
            );
          })}
        </div>
        <div className="kp-build-col">
          <h3>ARCHIVE ({meta.unlocked.length}/24)</h3>
          {meta.unlocked.length === 0 && (
            <p className="kp-rail-dim">Nothing unlocked yet. Every cleared job teaches you one new trick.</p>
          )}
          <div className="kp-archive">
            {meta.unlocked.map((id) => {
              const def = ABILITY_BY_ID[id];
              if (!def) return null;
              const equipped = run.equipped.includes(id);
              const copies = run.copies[id] ?? 0;
              const price = copyPrice(def);
              return (
                <div key={id} className={equipped ? "kp-arch-item kp-arch-eq" : "kp-arch-item"}>
                  <div className="kp-arch-info" title={def.desc}>
                    <strong>{def.name}</strong>
                    <span>
                      {VERB_LABEL[def.verb]} - T{def.tier} - {def.ramCost} RAM - x{copies}
                    </span>
                  </div>
                  <div className="kp-arch-actions">
                    <button
                      type="button"
                      disabled={run.credits < price}
                      onClick={() => dispatch({ type: "buyCopy", id })}
                      title={`Buy one copy for ${price} cr`}
                    >
                      +1 ({price})
                    </button>
                    {equipped ? (
                      <button type="button" onClick={() => dispatch({ type: "unequip", id })}>
                        DROP
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={run.equipped.length >= run.capacity || copies < 1}
                        onClick={() => dispatch({ type: "equip", id })}
                      >
                        EQUIP
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="kp-screen-actions">
        {!isFinale && (
          <button type="button" className="kp-btn-ghost" onClick={() => dispatch({ type: "backToDay" })}>
            BACK
          </button>
        )}
        <button type="button" className="kp-btn kp-btn-dive" onClick={() => dispatch({ type: "startDuel" })}>
          {isFinale ? "DIVE INTO THE MACHINE" : "DIVE"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

export function ResultScreen({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const r = run.lastResult;
  if (!r) return null;
  const job = run.jobs[r.jobIndex];
  const c = job ? customerById(job.customerId) : null;
  const unlockedDef = r.unlocked ? ABILITY_BY_ID[r.unlocked] : null;
  return (
    <div className="kp-screen kp-resultscreen">
      <header className="kp-screen-head">
        <h2>REPAIR LOGGED</h2>
        {c && <p>{c.winLine}</p>}
      </header>
      <div className="kp-result-rows">
        <div>
          <span>PAYOUT</span>
          <em>
            {r.pay} cr{r.capWin ? " (timeout rate)" : ""}
          </em>
        </div>
        <div>
          <span>NEURAL STRAIN</span>
          <em className={r.chip > 0 ? "kp-chip-bad" : ""}>
            {r.chip > 0 ? `-${r.chip}` : "clean"} ({run.strain} left)
          </em>
        </div>
        {unlockedDef && (
          <div className="kp-unlock">
            <span>NEW ROUTINE LEARNED</span>
            <em>
              {unlockedDef.name} <i>T{unlockedDef.tier} {VERB_LABEL[unlockedDef.verb]}</i>
            </em>
          </div>
        )}
      </div>
      <div className="kp-screen-actions">
        <button type="button" className="kp-btn" onClick={() => dispatch({ type: "resultNext" })}>
          {run.jobsDone.every(Boolean) ? "CLOSE THE DAY" : "NEXT TICKET"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upgrade                                                             */
/* ------------------------------------------------------------------ */

export function UpgradeScreen({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  return (
    <div className="kp-screen kp-upgrade">
      <header className="kp-screen-head">
        <h2>DAY {run.day} CLOSED</h2>
        <p>One upgrade holds for the rest of the run. Pick.</p>
      </header>
      <div className="kp-upgrade-grid">
        <button type="button" className="kp-upg" onClick={() => dispatch({ type: "chooseUpgrade", pick: "ram" })}>
          <strong>+1 RAM / TURN</strong>
          <span>
            {run.ramPerTurn} to {Math.min(9, run.ramPerTurn + 1)}. More moves, more abilities, every
            single turn.
          </span>
        </button>
        <button type="button" className="kp-upg" onClick={() => dispatch({ type: "chooseUpgrade", pick: "cap" })}>
          <strong>+1 NEURAL CAPACITY</strong>
          <span>
            {run.capacity} to {Math.min(8, run.capacity + 1)}. One more equipped ability per dive.
          </span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Finale gate                                                         */
/* ------------------------------------------------------------------ */

export function FinalePre({ dispatch }: { dispatch: Dispatch }) {
  return (
    <div className="kp-screen kp-finalepre">
      <header className="kp-screen-head">
        <h2>DAY 10</h2>
      </header>
      <div className="kp-finale-copy">
        <p>No tickets today. The counter is dark. The only machine left is the one in the back room.</p>
        <p>It has watched you work for nine days. It will not go easy. It never once has.</p>
      </div>
      <div className="kp-screen-actions">
        <button type="button" className="kp-btn kp-btn-dive" onClick={() => dispatch({ type: "startFinale" })}>
          OPEN THE BACK ROOM
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop idle (no active run)                                        */
/* ------------------------------------------------------------------ */

export function DesktopIdle({
  meta,
  dispatch,
}: {
  meta: MetaState;
  dispatch: Dispatch;
}) {
  const startSeed = () => {
    dispatch({ type: "startRun", seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 });
  };
  return (
    <div className="kp-screen kp-idle">
      <div className="kp-idle-art" aria-hidden="true">
        <img src="/assets/px/stills/still-locked.png" alt="" width={576} height={384} />
      </div>
      <h2>KERNEL PANIC</h2>
      {meta.machineOpened ? (
        <p className="kp-idle-sub">
          The back room is open now. The shop still takes tickets, if you want the practice.
        </p>
      ) : meta.runCount === 0 ? (
        <p className="kp-idle-sub">Your father's shop. Your name on the ledger. His lock on the back room.</p>
      ) : (
        <p className="kp-idle-sub">
          Attempt {meta.runCount} ended. The machine is still there. It is always still there.
        </p>
      )}
      <div className="kp-idle-stats">
        <span>{meta.unlocked.length}/24 routines archived</span>
        <span>{meta.runCount} attempts</span>
      </div>
      <button type="button" className="kp-btn kp-btn-dive" onClick={startSeed}>
        {meta.runCount === 0 ? "OPEN THE SHOP" : "START ATTEMPT " + (meta.runCount + 1)}
      </button>
    </div>
  );
}
