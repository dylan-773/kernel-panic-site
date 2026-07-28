import { useEffect, useState } from "react";
import { sfx } from "../../game/audio";
import { DAY_CONFIGS, FINAL_DAY, jobPay } from "../../game/content/arc";
import { CUSTOMERS, CustomerProfile } from "../../game/content/customers";
import {
  ATTACK_MODE_LABEL,
  AUGMENT_BY_ID,
  AttackMode,
  DEFEND_MODE_LABEL,
  DefendMode,
  GRIDLOCK_CHIP,
  MODE_LABEL,
  MODE_TELL,
  attackModeDesc,
  defendModeDesc,
  scanDesc,
} from "../../game/content/kit";
import { Scene } from "../../game/content/story";
import {
  BOOST_SLOTS_MAX,
  DAY_REST_REGEN,
  GameState,
  MAX_RAM,
  PATCH_HEAL,
  RunAction,
  darkPullPrice,
  nightPatchCost,
  slotCost,
} from "../../game/run-reducer";
import { PATCH_POUCH_MAX, armUnionCraft, shapeClassOf } from "../../game/patch-cells";
import { tip } from "../../game/content/teaching";
import { MetaState, NightPick, RunState } from "../../game/save";
import { VERSION_LABEL } from "../../game/version";
import { Teach } from "./teach";
import { TapTip } from "./tap-tip";
import { PatchGlyph } from "./patch-glyph";

/** Result-screen flavor for a dropped piece, by shape class. */
const DROP_LINES: Record<"I" | "L" | "T" | "X", string> = {
  I: "A straight run pulled from the wreck. Two arms, dead opposite.",
  L: "An elbow pulled from the wreck. Bent, but sound.",
  T: "A tee pulled from the wreck. Three arms, rare enough to notice.",
  X: "A cross pulled from the wreck. Four arms. Somebody's whole day, salvaged.",
};

const SHAPE_NOUN: Record<"I" | "L" | "T" | "X", string> = {
  I: "Straight",
  L: "Elbow",
  T: "Tee",
  X: "Cross",
};

export function customerById(id: string): CustomerProfile {
  return CUSTOMERS.find((c) => c.id === id) ?? CUSTOMERS[0];
}

type Dispatch = (a: RunAction) => void;

/**
 * The patch pouch with the crafting bench. Select a piece, legal partners
 * light up, pick one, confirm: the pair fuses into the union of their
 * arms. Never available mid dive; the reducer enforces the same.
 */
function PouchCard({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const [sel, setSel] = useState<number | null>(null);
  const [pair, setPair] = useState<number | null>(null);
  useEffect(() => {
    if (sel !== null && sel >= run.patchPouch.length) {
      setSel(null);
      setPair(null);
    }
  }, [run.patchPouch.length, sel]);
  const pouch = run.patchPouch;
  const union = sel !== null && pair !== null ? armUnionCraft(pouch[sel], pouch[pair]) : null;
  const partners = sel === null ? new Set<number>() : new Set(
    pouch.map((_, i) => i).filter((i) => i !== sel && armUnionCraft(pouch[sel], pouch[i]) !== null),
  );
  const noPartner = sel !== null && pair === null && partners.size === 0;
  return (
    <div className="kp-kit-card kp-kit-cells">
      <header>
        <strong>PATCH POUCH</strong>
        <em>
          {pouch.length} / {PATCH_POUCH_MAX}
        </em>
      </header>
      <div className="kp-pieces">
        {pouch.map((m, i) => (
          <button
            key={i}
            type="button"
            className={`kp-piece-slot ${i === sel || i === pair ? "kp-pp-hi" : ""} ${sel !== null && i !== sel && pair === null && !partners.has(i) ? "kp-piece-dim" : ""}`}
            onClick={() => {
              if (sel === null) setSel(i);
              else if (i === sel) {
                setSel(null);
                setPair(null);
              } else if (pair === null && partners.has(i)) setPair(i);
              else if (i === pair) setPair(null);
            }}
          >
            <PatchGlyph mask={m} size={34} />
            <span>{SHAPE_NOUN[shapeClassOf(m)]}</span>
          </button>
        ))}
        {Array.from({ length: PATCH_POUCH_MAX - pouch.length }).map((_, i) => (
          <span key={`e${i}`} className="kp-piece-slot kp-piece-empty" aria-hidden="true">
            <span className="kp-piece-hole" />
          </span>
        ))}
      </div>
      {union !== null && sel !== null && pair !== null && (
        <div className="kp-craft-stage kp-piece-actions">
          <span className="kp-rail-dim">
            JOIN: <PatchGlyph mask={pouch[sel]} size={16} /> + <PatchGlyph mask={pouch[pair]} size={16} /> {"->"} <PatchGlyph mask={union} size={20} /> {SHAPE_NOUN[shapeClassOf(union)]}
          </span>
          <button
            type="button"
            onClick={() => {
              sfx("pieceFuse", { bus: "ui" });
              dispatch({ type: "craftPatch", a: sel, b: pair });
              setSel(null);
              setPair(null);
            }}
          >
            CRAFT
          </button>
          <button type="button" onClick={() => { setSel(null); setPair(null); }}>
            CANCEL
          </button>
        </div>
      )}
      {noPartner && (
        <p className="kp-rail-dim">No legal join for that piece. The result must be strictly bigger than both.</p>
      )}
      <p>
        A piece fills one slag block with exactly the arms it shows, welded where it lands.
        2 RAM, one per turn, single use. Pieces come off the darknet, drop from cleared jobs,
        or bank on clean wins; the pouch holds {PATCH_POUCH_MAX}.
      </p>
    </div>
  );
}

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
                <span className="kp-job-pay">{done ? "CLEARED" : `${jobPay(job.tier)} cr`}</span>
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
        {run.patchPouch.length > 0 && (
          <span className="kp-foot-pouch">
            POUCH{" "}
            {run.patchPouch.map((m, i) => (
              <PatchGlyph key={i} mask={m} size={14} />
            ))}
          </span>
        )}
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

        {/* The pouch used to be readable only from the job board footer, so
            a player checking their kit before a dive could not see it. */}
        <PouchCard run={run} dispatch={dispatch} />

        <div className="kp-kit-card kp-kit-augs">
          <header>
            <TapTip text={tip("boostSlots")}>
              <strong>BOOST BAYS</strong>
            </TapTip>
            <em>
              {kit.augments.length} / {run.boostSlots}
            </em>
          </header>
          <span className="kp-cell-pips" aria-hidden="true">
            {Array.from({ length: run.boostSlots }).map((_, i) => (
              <span key={i} className={i < kit.augments.length ? "kp-pip kp-cell-pip-on" : "kp-pip"} />
            ))}
          </span>
          {kit.augments.length === 0 ? (
            <p className="kp-rail-dim">
              Three bays to start, more are sold at day close. Every cleared job offers a draft.
            </p>
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
              {Array.from({ length: Math.max(0, run.boostSlots - kit.augments.length) }).map((_, i) => (
                <li key={`empty-${i}`} className="kp-bay-empty">
                  <strong>EMPTY BAY</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="kp-kit-card kp-kit-configs">
          <header>
            <strong>CONFIGS</strong>
            <em>{kit.attackModes.length - 1 + kit.defendModes.length - 1} / 4</em>
          </header>
          <p className="kp-rail-dim">
            Mode unlocks live outside the bays and never count against the cap. Switch modes on the
            program cards above.
          </p>
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
  const [pendingSwap, setPendingSwap] = useState<string | null>(null);
  useEffect(() => {
    if (r && r.draft.length > 0) sfx("unlock", { at: 0.3 });
  }, [r]);
  useEffect(() => {
    if (r?.picked) setPendingSwap(null);
  }, [r?.picked]);
  if (!r) return null;
  const baysFull = run.kit.augments.length >= run.boostSlots;
  const swapOffered =
    r.picked === null && baysFull && r.draft.some((id) => AUGMENT_BY_ID[id]?.kind === "boost");
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
          <em>{r.pay} cr</em>
        </div>
        {/* Itemized because the ticket rate on the job board is not what
            lands: a cap win halves it, a dry augment cache adds salvage on
            top, and a bare total made both look like a miscount. */}
        {(r.capWin || r.salvage > 0 || r.cleanRunBonus > 0) && (
          <ul className="kp-chip-breakdown">
            <li>
              <span>ticket rate</span>
              <em>{r.basePay} cr</em>
            </li>
            {r.capWin && (
              <li>
                <span>reduced rate, you hit the turn cap</span>
                <em>-{r.basePay - (r.pay - r.salvage - r.cleanRunBonus)} cr</em>
              </li>
            )}
            {r.cleanRunBonus > 0 && (
              <li>
                <span>clean run, trap free to the cap</span>
                <em>+{r.cleanRunBonus} cr</em>
              </li>
            )}
            {r.salvage > 0 && (
              <li>
                <span>salvage, augment cache dry</span>
                <em>+{r.salvage} cr</em>
              </li>
            )}
          </ul>
        )}
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
            {r.gridlockWin && (
              <li>
                <span>link collapsed in gridlock</span>
                <em>-{GRIDLOCK_CHIP}</em>
              </li>
            )}
            {r.overRotations * 2 + r.trapsFired * 4 + (r.capWin ? 10 : 0) + (r.gridlockWin ? GRIDLOCK_CHIP : 0) > 40 && (
              <li className="kp-chip-capped">
                <span>strain billed, capped</span>
                <em>-40 max</em>
              </li>
            )}
          </ul>
        )}
        {/* The augment fires on a condition the player cannot see from the
            board. Saying so is the whole difference between a reward and a
            coincidence. */}
        {r.cleanRun !== null && (
          <div className="kp-cleanrun">
            <span>CLEAN RUN</span>
            <em>
              {r.cleanRun.status === "banked" ? (
                <>
                  Zero strain billed. Banked a random {SHAPE_NOUN[shapeClassOf(r.cleanRun.mask)].toLowerCase()}.{" "}
                  <PatchGlyph mask={r.cleanRun.mask} size={16} />
                </>
              ) : (
                `Zero strain billed. Pouch already holds the maximum of ${PATCH_POUCH_MAX}.`
              )}
            </em>
          </div>
        )}
        {r.patchDrop !== null && (
          <div className="kp-cleanrun kp-droprow">
            <span>PATCH PIECE RECOVERED</span>
            <em>
              {r.patchDrop.status === "banked" ? (
                <>
                  {DROP_LINES[shapeClassOf(r.patchDrop.mask)]}{" "}
                  <PatchGlyph mask={r.patchDrop.mask} size={16} />
                </>
              ) : (
                `${SHAPE_NOUN[shapeClassOf(r.patchDrop.mask)]} piece pulled from the wreck, but the pouch already holds the maximum of ${PATCH_POUCH_MAX}. Left on the bench.`
              )}
            </em>
          </div>
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
              const dimmed = (r.picked !== null && !picked) || (pendingSwap !== null && pendingSwap !== id);
              const needsSwap = a.kind === "boost" && baysFull;
              return (
                <button
                  key={id}
                  type="button"
                  className={`kp-draft-card ${picked ? "kp-draft-picked" : ""} ${dimmed ? "kp-draft-dim" : ""} ${a.kind === "config" ? "kp-draft-config" : ""} ${pendingSwap === id ? "kp-draft-swapping" : ""}`}
                  disabled={r.picked !== null}
                  onClick={() => {
                    if (needsSwap) {
                      sfx("press", { bus: "ui" });
                      setPendingSwap((p) => (p === id ? null : id));
                      return;
                    }
                    sfx("granted", { bus: "ui" });
                    dispatch({ type: "pickAugment", id });
                  }}
                >
                  <span className="kp-draft-kind">
                    {a.kind === "config" ? "CONFIG" : needsSwap && !picked ? "BOOST. BAYS FULL, PICK TO SWAP" : "BOOST"}
                  </span>
                  <strong>{a.name}</strong>
                  <p>{a.desc}</p>
                  {a.kind === "config" && (
                    <p className="kp-draft-note">
                      Unlocks the mode. Your active kit does not change; switch to it in
                      LOADOUT.CFG when you want it.
                    </p>
                  )}
                  {picked && <em className="kp-draft-stamp">INSTALLED</em>}
                </button>
              );
            })}
          </div>
          {pendingSwap !== null && r.picked === null && (
            <div className="kp-swap-panel">
              <h4>EJECT WHICH BOOST FOR {AUGMENT_BY_ID[pendingSwap]?.name}?</h4>
              <div className="kp-draft-grid">
                {run.kit.augments.map((id) => {
                  const a = AUGMENT_BY_ID[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      className="kp-draft-card kp-swap-card"
                      onClick={() => {
                        sfx("granted", { bus: "ui" });
                        dispatch({ type: "pickAugment", id: pendingSwap, replace: id });
                      }}
                    >
                      <span className="kp-draft-kind">EJECT</span>
                      <strong>{a?.name ?? id}</strong>
                      <p>{a?.desc}</p>
                    </button>
                  );
                })}
              </div>
              <button type="button" className="kp-btn-ghost" onClick={() => setPendingSwap(null)}>
                CANCEL THE SWAP
              </button>
            </div>
          )}
          {r.picked !== null && r.replaced !== null && (
            <p className="kp-rail-dim">EJECTED: {AUGMENT_BY_ID[r.replaced]?.name ?? r.replaced}</p>
          )}
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
      <Teach id="boost-swap" signals={{ swapOffered }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upgrade (day close)                                                 */
/* ------------------------------------------------------------------ */

const NIGHT_PICK_LABEL: Record<Exclude<NightPick, null>, string> = {
  ram: "+1 RAM / TURN",
  scan: "the SCAN.EXE tier",
  attack: "the ATTACK.EXE tier",
  defend: "the DEFEND.EXE tier",
};

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
  const picked = run.nightPick;
  const tierBtn = (
    pick: "scan" | "attack" | "defend",
    tier: number,
    label: string,
    detail: string,
  ) => (
    <button
      type="button"
      className={`kp-upg ${picked === pick ? "kp-upg-picked" : ""}`}
      disabled={tier >= 3}
      aria-pressed={picked === pick}
      onClick={() => dispatch({ type: "chooseUpgrade", pick })}
    >
      <strong>
        {label} {tier >= 3 ? "MAXED" : `T${tier} > T${tier + 1}`}
      </strong>
      <span>{detail}</span>
      {picked === pick && <em className="kp-upg-stamp">SELECTED</em>}
    </button>
  );
  return (
    <div className="kp-screen kp-upgrade">
      <header className="kp-screen-head">
        <h2>DAY {run.day} CLOSED</h2>
        <p>
          One upgrade holds for the rest of the run. Pick it, spend your credits, then close the
          night. Nothing is locked in until you do.
        </p>
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
          className={`kp-upg ${picked === "ram" ? "kp-upg-picked" : ""}`}
          disabled={run.ramPerTurn >= MAX_RAM}
          aria-pressed={picked === "ram"}
          onClick={() => dispatch({ type: "chooseUpgrade", pick: "ram" })}
        >
          <strong>{run.ramPerTurn >= MAX_RAM ? "RAM / TURN MAXED" : "+1 RAM / TURN"}</strong>
          <span>
            {run.ramPerTurn >= MAX_RAM
              ? `Already at the per turn cap of ${MAX_RAM}.`
              : `${run.ramPerTurn} to ${run.ramPerTurn + 1}. More moves, more programs, every single turn.`}
          </span>
          {picked === "ram" && <em className="kp-upg-stamp">SELECTED</em>}
        </button>
        {tierBtn("scan", kit.scanTier, "SCAN.EXE", "Wider sweep radius. Still always 1 RAM.")}
        {tierBtn("attack", kit.attackTier, "ATTACK.EXE", "One more node per cast: redirect or trap in bulk.")}
        {tierBtn("defend", kit.defendTier, "DEFEND.EXE", "One more node per cast: purge, lock, or a wider ward.")}
      </div>
      <div className="kp-patchrow">
        <button
          type="button"
          className="kp-btn-ghost"
          disabled={run.credits < nightPatchCost(run.day) || run.strain >= 100}
          onClick={() => {
            sfx("granted", { bus: "ui" });
            dispatch({ type: "buyPatch" });
          }}
        >
          NIGHT PATCH: +{PATCH_HEAL} STRAIN ({nightPatchCost(run.day)} cr)
        </button>
        <span className="kp-rail-dim">
          STRAIN {run.strain}/100 - {run.credits} cr - rest restored +{DAY_REST_REGEN}
        </span>
      </div>
      <div className="kp-patchrow kp-cellrow">
        <button
          type="button"
          className="kp-btn-ghost"
          disabled={run.credits < darkPullPrice(run) || run.patchPouch.length >= PATCH_POUCH_MAX}
          title={
            run.patchPouch.length >= PATCH_POUCH_MAX
              ? `POUCH FULL (${PATCH_POUCH_MAX}/${PATCH_POUCH_MAX})`
              : run.credits < darkPullPrice(run)
                ? `NEED ${darkPullPrice(run)} CR`
                : undefined
          }
          onClick={() => {
            sfx("granted", { bus: "ui" });
            dispatch({ type: "buyDarkPatch" });
          }}
        >
          BUY BLIND ({darkPullPrice(run)} cr)
        </button>
        <span className="kp-rail-dim">
          POUCH {run.patchPouch.length}/{PATCH_POUCH_MAX} - {run.credits} cr
        </span>
        <span className="kp-cell-pips" aria-hidden="true">
          {run.patchPouch.map((m, i) => (
            <PatchGlyph key={i} mask={m} size={18} />
          ))}
        </span>
        <span className="kp-rail-dim">
          Pay first. Shape is the surprise.
          {run.lastDarkBuy !== null && run.patchPouch.length > 0 && (
            <>
              {" "}LAST PULL: <PatchGlyph mask={run.lastDarkBuy} size={14} />
            </>
          )}
        </span>
      </div>
      <div className="kp-patchrow kp-bayrow">
        <button
          type="button"
          className="kp-btn-ghost"
          disabled={slotCost(run) === null || run.credits < (slotCost(run) ?? 0)}
          title={
            slotCost(run) === null
              ? `ALL ${BOOST_SLOTS_MAX} BAYS INSTALLED`
              : run.credits < (slotCost(run) ?? 0)
                ? `NEED ${slotCost(run)} CR`
                : undefined
          }
          onClick={() => {
            sfx("granted", { bus: "ui" });
            dispatch({ type: "buySlot" });
          }}
        >
          INSTALL BOOST BAY ({slotCost(run) ?? "MAX"}{slotCost(run) !== null ? " cr" : ""})
        </button>
        <span className="kp-rail-dim">
          BAYS {run.kit.augments.length}/{run.boostSlots} - {run.credits} cr
        </span>
        <span className="kp-cell-pips" aria-hidden="true">
          {Array.from({ length: BOOST_SLOTS_MAX }).map((_, i) => (
            <span key={i} className={i < run.boostSlots ? "kp-pip kp-cell-pip-on" : "kp-pip"} />
          ))}
        </span>
        <span className="kp-rail-dim">A full bay drafts as a swap. More bays, more boosts held.</span>
      </div>
      <div className="kp-screen-actions kp-nightclose">
        <span className="kp-rail-dim">
          {picked === null
            ? "Pick one upgrade above to close the night."
            : `Closing the night applies ${NIGHT_PICK_LABEL[picked]} and opens day ${run.day + 1}.`}
        </span>
        <button
          type="button"
          className="kp-btn kp-btn-dive"
          disabled={picked === null}
          onClick={() => dispatch({ type: "closeNight" })}
        >
          CLOSE THE NIGHT
        </button>
      </div>
      <Teach id="day-upgrade" />
      <Teach id="night-shop" />
      <Teach
        id="patch-craft"
        signals={{
          craftReady: run.patchPouch.some((a, i) =>
            run.patchPouch.some((b, j) => j > i && armUnionCraft(a, b) !== null),
          ),
        }}
      />
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
      <p className="kp-idle-version">{VERSION_LABEL}</p>
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
