import { useEffect, useState } from "react";
import { sfx } from "../../game/audio";
import { DAY_CONFIGS, FINAL_DAY } from "../../game/content/arc";
import { CUSTOMERS, CustomerProfile } from "../../game/content/customers";
import {
  ATTACK_MODE_LABEL,
  AUGMENT_BY_ID,
  AttackMode,
  DEFEND_MODE_LABEL,
  DefendMode,
  MODE_LABEL,
  MODE_TELL,
  attackModeDesc,
  defendModeDesc,
  scanDesc,
} from "../../game/content/kit";
import { Scene } from "../../game/content/story";
import {
  DAY_REST_REGEN,
  GameState,
  MAX_RAM,
  PATCH_CELL_COST,
  PATCH_CELL_MAX,
  PATCH_COST,
  PATCH_HEAL,
  RunAction,
} from "../../game/run-reducer";
import { tip } from "../../game/content/teaching";
import { MetaState, RunState } from "../../game/save";
import { Teach } from "./teach";
import { TapTip } from "./tap-tip";

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

export function StoryScene({
  scene,
  onDone,
  tag,
}: {
  scene: Scene;
  onDone: () => void;
  /** Persistent corner chrome, e.g. "DAY 4" on morning scenes. */
  tag?: string;
}) {
  const [beat, setBeat] = useState(0);
  useEffect(() => setBeat(0), [scene.id]);
  const b = scene.beats[beat];
  if (!b) return null;
  const last = beat >= scene.beats.length - 1;
  const advance = () => {
    sfx("story", { bus: "ui", jitter: 0.05 });
    if (last) onDone();
    else setBeat(beat + 1);
  };
  return (
    <div className="kp-story" onClick={advance}>
      {tag && <span className="kp-story-daytag">{tag}</span>}
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
                <TapTip text={tip("threatTier")}>
                  <span className="kp-job-tier">
                    THREAT {"■".repeat(job.tier)}
                    {"□".repeat(5 - job.tier)}
                  </span>
                </TapTip>
                <span className="kp-job-pay">{done ? "CLEARED" : `${40 + 25 * job.tier} cr`}</span>
              </div>
            </button>
          );
        })}
      </div>
      <footer className="kp-screen-foot">
        <TapTip text={tip("strain")}>
          <span>STRAIN {run.strain}</span>
        </TapTip>
        <span>{run.credits} cr</span>
        <TapTip text={tip("ram")}>
          <span>RAM {run.ramPerTurn}/turn</span>
        </TapTip>
        {run.patchCells > 0 && <span>CELLS x{run.patchCells}</span>}
        <span>
          KIT S{run.kit.scanTier}/A{run.kit.attackTier}/D{run.kit.defendTier}
        </span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analyze                                                             */
/* ------------------------------------------------------------------ */

export function AnalyzeScreen({
  run,
  dispatch,
  onConfigureKit,
}: {
  run: RunState;
  dispatch: Dispatch;
  onConfigureKit: () => void;
}) {
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
          <p className="kp-analyze-tell">{MODE_TELL[job.dominant]}</p>
          <div className="kp-analyze-rows">
            <div>
              <span>DOMINANT ROUTINE</span>
              <em>{MODE_LABEL[job.dominant]}</em>
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
        <button type="button" className="kp-btn-ghost" onClick={onConfigureKit}>
          CONFIGURE KIT
        </button>
        <button type="button" className="kp-btn kp-btn-dive" onClick={() => dispatch({ type: "startDuel" })}>
          DIVE
        </button>
      </div>
      <Teach id="analyze-readout" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kit configuration (pre-dive and loadout window)                     */
/* ------------------------------------------------------------------ */

const ATTACK_MODES_ALL: AttackMode[] = ["redirect", "armHalt", "armSiphon"];
const DEFEND_MODES_ALL: DefendMode[] = ["purge", "lock", "ward"];

export function KitScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch }) {
  const run = state.run as RunState;
  const kit = run.kit;
  return (
    <div className="kp-screen kp-build">
      <header className="kp-screen-head">
        <h2>KIT CONFIG</h2>
        <p>
          Three programs, 1 RAM each, once per turn each. Tiers come from closed days; configs come
          from cleared jobs. Tune it whenever; it holds until you change it.
        </p>
      </header>
      <div className="kp-kit-grid">
        <div className="kp-kit-card kp-kit-scan">
          <header>
            <strong>SCAN.EXE</strong>
            <em>TIER {"▪".repeat(kit.scanTier)}</em>
          </header>
          <p>{scanDesc(kit.scanTier)}</p>
        </div>

        <div className="kp-kit-card kp-kit-attack">
          <header>
            <strong>ATTACK.EXE</strong>
            <em>TIER {"▪".repeat(kit.attackTier)}</em>
          </header>
          <div className="kp-kit-modes">
            {ATTACK_MODES_ALL.map((m) => {
              const owned = kit.attackModes.includes(m);
              const active = kit.attackMode === m;
              return (
                <TapTip key={m} text={owned ? attackModeDesc(m, kit.attackTier) : tip("modeLocked")}>
                  <button
                    type="button"
                    className={`kp-mode ${active ? "kp-mode-on" : ""} ${owned ? "" : "kp-mode-locked"}`}
                    disabled={!owned}
                    onClick={() => dispatch({ type: "setAttackMode", mode: m })}
                  >
                    {ATTACK_MODE_LABEL[m]}
                    {!owned && <i> ?</i>}
                  </button>
                </TapTip>
              );
            })}
          </div>
          <p>{attackModeDesc(kit.attackMode, kit.attackTier)}</p>
        </div>

        <div className="kp-kit-card kp-kit-defend">
          <header>
            <strong>DEFEND.EXE</strong>
            <em>TIER {"▪".repeat(kit.defendTier)}</em>
          </header>
          <div className="kp-kit-modes">
            {DEFEND_MODES_ALL.map((m) => {
              const owned = kit.defendModes.includes(m);
              const active = kit.defendMode === m;
              return (
                <TapTip key={m} text={owned ? defendModeDesc(m, kit.defendTier) : tip("modeLocked")}>
                  <button
                    type="button"
                    className={`kp-mode ${active ? "kp-mode-on" : ""} ${owned ? "" : "kp-mode-locked"}`}
                    disabled={!owned}
                    onClick={() => dispatch({ type: "setDefendMode", mode: m })}
                  >
                    {DEFEND_MODE_LABEL[m]}
                    {!owned && <i> ?</i>}
                  </button>
                </TapTip>
              );
            })}
          </div>
          <p>{defendModeDesc(kit.defendMode, kit.defendTier)}</p>
        </div>

        <div className="kp-kit-card kp-kit-augs">
          <header>
            <strong>AUGMENTS</strong>
            <em>{kit.augments.length} installed</em>
          </header>
          {kit.augments.length === 0 ? (
            <p className="kp-rail-dim">Nothing yet. Every cleared job offers a draft.</p>
          ) : (
            <ul className="kp-aug-list">
              {kit.augments.map((id) => {
                const a = AUGMENT_BY_ID[id];
                return (
                  <li key={id}>
                    <strong>{a?.name ?? id}</strong>
                    <span>{a?.desc}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="kp-screen-actions">
        {run.screen === "analyze" && (
          <button type="button" className="kp-btn kp-btn-dive" onClick={() => dispatch({ type: "startDuel" })}>
            DIVE
          </button>
        )}
        {run.screen === "finalePre" && (
          <button type="button" className="kp-btn kp-btn-dive" onClick={() => dispatch({ type: "startFinale" })}>
            DIVE INTO THE MACHINE
          </button>
        )}
        {run.screen !== "analyze" && run.screen !== "finalePre" && (
          <span className="kp-rail-dim">Pick a ticket to dive.</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result + augment draft                                              */
/* ------------------------------------------------------------------ */

export function ResultScreen({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const r = run.lastResult;
  useEffect(() => {
    if (r && r.draft.length > 0) sfx("unlock", { at: 0.3 });
  }, [r]);
  if (!r) return null;
  const job = run.jobs[r.jobIndex];
  const c = job ? customerById(job.customerId) : null;
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
            {r.pay} cr{r.capWin ? " (half rate: you hit the turn cap)" : ""}
          </em>
        </div>
        <div>
          <span>NEURAL STRAIN</span>
          <em className={r.chip > 0 ? "kp-chip-bad" : ""}>
            {r.chip > 0 ? `-${r.chip}` : "clean"} ({run.strain} left)
          </em>
        </div>
        {/* The chip has three inputs. Showing only the total left a player who
            stayed under par unable to tell a sprung trap had billed them. */}
        {r.chip > 0 && (
          <ul className="kp-chip-breakdown">
            {r.overRotations > 0 && (
              <li>
                <span>
                  {r.overRotations} rotation{r.overRotations === 1 ? "" : "s"} over par
                </span>
                <em>-{r.overRotations * 2}</em>
              </li>
            )}
            {r.trapsFired > 0 && (
              <li>
                <span>
                  {r.trapsFired} trap{r.trapsFired === 1 ? "" : "s"} sprung
                </span>
                <em>-{r.trapsFired * 4}</em>
              </li>
            )}
            {r.capWin && (
              <li>
                <span>hit the turn cap</span>
                <em>-10</em>
              </li>
            )}
            {r.overRotations * 2 + r.trapsFired * 4 + (r.capWin ? 10 : 0) > 40 && (
              <li className="kp-chip-capped">
                <span>strain billed, capped</span>
                <em>-40 max</em>
              </li>
            )}
          </ul>
        )}
      </div>

      {r.draft.length > 0 ? (
        <div className="kp-draft">
          <h3>{r.picked ? "AUGMENT INSTALLED" : "AUGMENT DRAFT - PICK ONE"}</h3>
          <div className="kp-draft-grid">
            {r.draft.map((id) => {
              const a = AUGMENT_BY_ID[id];
              if (!a) return null;
              const picked = r.picked === id;
              const dimmed = r.picked !== null && !picked;
              return (
                <button
                  key={id}
                  type="button"
                  className={`kp-draft-card ${picked ? "kp-draft-picked" : ""} ${dimmed ? "kp-draft-dim" : ""} ${a.kind === "config" ? "kp-draft-config" : ""}`}
                  disabled={r.picked !== null}
                  onClick={() => {
                    sfx("granted", { bus: "ui" });
                    dispatch({ type: "pickAugment", id });
                  }}
                >
                  <span className="kp-draft-kind">{a.kind === "config" ? "CONFIG" : "BOOST"}</span>
                  <strong>{a.name}</strong>
                  <p>{a.desc}</p>
                  {picked && <em className="kp-draft-stamp">INSTALLED</em>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="kp-rail-dim">Augment cache is dry. Salvage credited instead.</p>
      )}

      <div className="kp-screen-actions">
        <button type="button" className="kp-btn" onClick={() => dispatch({ type: "resultNext" })}>
          {r.picked || r.draft.length === 0
            ? run.jobsDone.every(Boolean)
              ? "CLOSE THE DAY"
              : "NEXT TICKET"
            : "SKIP THE DRAFT"}
        </button>
      </div>
      <Teach id="strain-chip" />
      <Teach id="augment-draft" signals={{ draftOffered: r.draft.length > 0 }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upgrade (day close)                                                 */
/* ------------------------------------------------------------------ */

export function UpgradeScreen({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const kit = run.kit;
  // Night rest already applied by the reducer; animate the fill from the
  // pre-rest value once per mount, silent when the meter was already full.
  const [regenShown, setRegenShown] = useState(false);
  useEffect(() => {
    if (run.lastRegen <= 0) return;
    const t = setTimeout(() => {
      setRegenShown(true);
      sfx("dayCloseRegen", { bus: "ui" });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const strainShown = regenShown || run.lastRegen <= 0 ? run.strain : run.strain - run.lastRegen;
  const tierBtn = (
    pick: "scan" | "attack" | "defend",
    tier: number,
    label: string,
    detail: string,
  ) => (
    <button
      type="button"
      className="kp-upg"
      disabled={tier >= 3}
      onClick={() => dispatch({ type: "chooseUpgrade", pick })}
    >
      <strong>
        {label} {tier >= 3 ? "MAXED" : `T${tier} > T${tier + 1}`}
      </strong>
      <span>{detail}</span>
    </button>
  );
  return (
    <div className="kp-screen kp-upgrade">
      <header className="kp-screen-head">
        <h2>DAY {run.day} CLOSED</h2>
        <p>One upgrade holds for the rest of the run. Pick.</p>
      </header>
      <div className="kp-regen">
        <span>STRAIN</span>
        <div className="kp-strain-bar">
          <div className="kp-strain-fill" style={{ width: `${strainShown}%` }} />
        </div>
        {regenShown && run.lastRegen > 0 && (
          <em className="kp-regen-pop">+{run.lastRegen} STRAIN</em>
        )}
      </div>
      <div className="kp-upgrade-grid">
        <button
          type="button"
          className="kp-upg"
          disabled={run.ramPerTurn >= MAX_RAM}
          onClick={() => dispatch({ type: "chooseUpgrade", pick: "ram" })}
        >
          <strong>{run.ramPerTurn >= MAX_RAM ? "RAM MAXED" : "+1 RAM / TURN"}</strong>
          <span>
            {run.ramPerTurn >= MAX_RAM
              ? "Already at the per turn cap."
              : `${run.ramPerTurn} to ${run.ramPerTurn + 1}. More moves, more programs, every single turn.`}
          </span>
        </button>
        {tierBtn("scan", kit.scanTier, "SCAN.EXE", "Wider sweep radius. Still always 1 RAM.")}
        {tierBtn("attack", kit.attackTier, "ATTACK.EXE", "One more node per cast: redirect or trap in bulk.")}
        {tierBtn("defend", kit.defendTier, "DEFEND.EXE", "One more node per cast: purge, lock, or a wider ward.")}
      </div>
      <div className="kp-patchrow">
        <button
          type="button"
          className="kp-btn-ghost"
          disabled={run.credits < PATCH_COST || run.strain >= 100}
          onClick={() => {
            sfx("granted", { bus: "ui" });
            dispatch({ type: "buyPatch" });
          }}
        >
          NIGHT PATCH: +{PATCH_HEAL} STRAIN ({PATCH_COST} cr)
        </button>
        <span className="kp-rail-dim">
          STRAIN {run.strain}/100 - {run.credits} cr - rest restored +{DAY_REST_REGEN}
        </span>
      </div>
      <div className="kp-patchrow kp-cellrow">
        <button
          type="button"
          className="kp-btn-ghost"
          disabled={run.credits < PATCH_CELL_COST || run.patchCells >= PATCH_CELL_MAX}
          title={
            run.patchCells >= PATCH_CELL_MAX
              ? `HOLDING MAX (${PATCH_CELL_MAX})`
              : run.credits < PATCH_CELL_COST
                ? `NEED ${PATCH_CELL_COST} CR`
                : undefined
          }
          onClick={() => {
            sfx("granted", { bus: "ui" });
            dispatch({ type: "buyPatchCell" });
          }}
        >
          BUY PATCH CELL ({PATCH_CELL_COST} cr)
        </button>
        <span className="kp-rail-dim">
          PATCH CELLS {run.patchCells}/{PATCH_CELL_MAX} - {run.credits} cr
        </span>
        <span className="kp-cell-pips" aria-hidden="true">
          {Array.from({ length: PATCH_CELL_MAX }).map((_, i) => (
            <span key={i} className={i < run.patchCells ? "kp-pip kp-cell-pip-on" : "kp-pip"} />
          ))}
        </span>
        <span className="kp-rail-dim">One slag block becomes a live cross junction. Single use.</span>
      </div>
      <Teach id="day-upgrade" />
      <Teach id="night-shop" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Finale gate                                                         */
/* ------------------------------------------------------------------ */

export function FinalePre({
  dispatch,
  onConfigureKit,
}: {
  dispatch: Dispatch;
  onConfigureKit: () => void;
}) {
  return (
    <div className="kp-screen kp-finalepre">
      <header className="kp-screen-head">
        <h2>DAY 10</h2>
      </header>
      <div className="kp-screen-actions">
        <button type="button" className="kp-btn-ghost" onClick={onConfigureKit}>
          CONFIGURE KIT
        </button>
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
        <span>{meta.runCount} attempts</span>
        <span>{meta.machineOpened ? "back room open" : "back room sealed"}</span>
      </div>
      <button type="button" className="kp-btn kp-btn-dive" onClick={startSeed}>
        {meta.runCount === 0 ? "OPEN THE SHOP" : "START ATTEMPT " + (meta.runCount + 1)}
      </button>
    </div>
  );
}
