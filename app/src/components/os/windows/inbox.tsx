import { useEffect, useState } from "react";
import { sfx } from "../../../game/audio";
import { MODE_LABEL, MODE_TELL } from "../../../game/content/kit";
import { diagDepth } from "../../../game/content/repairs";
import { COUNTER_COPY } from "../../../game/content/story";
import { TIER_CONFIGS, jobPay } from "../../../game/content/tiers";
import type { DayAction, GameState } from "../../../game/day-reducer";
import { tip } from "../../../game/content/teaching";
import { customerById } from "../../game/screens";
import { recDeviceFor, recPortraitFor } from "../roster-art";
import { Teach } from "../../game/teach";
import { TapTip } from "../../game/tap-tip";
import { PatchGlyph } from "../../game/patch-glyph";
import { Btn, Chip } from "../kp-ui";

/**
 * INBOX under the day-as-run: the record of what the player has taken and
 * not yet finished. Intake happens FACE TO FACE at the counter; this window
 * holds the accepted ticket, the bench's honest readout of it (as deep as
 * the diagnostic bench can read: every level below the bench's reach is an
 * equal-footprint dead row naming the repair that would light it), and the
 * DIVE button. One person at a time, one ticket at a time.
 */

type Dispatch = (a: DayAction) => void;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function Typed({
  text,
  delay = 0,
  interval = 8,
  className,
}: {
  text: string;
  delay?: number;
  interval?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (reduced) return;
    setN(0);
    setStarted(false);
    const start = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(start);
  }, [text, delay, reduced]);
  useEffect(() => {
    if (!started || reduced) return;
    if (n >= text.length) return;
    const iv = setInterval(() => setN((v) => Math.min(text.length, v + 1)), interval);
    return () => clearInterval(iv);
  }, [started, reduced, n >= text.length, text, interval]);
  return <span className={className}>{reduced ? text : text.slice(0, n)}</span>;
}

function TierPips({ tier }: { tier: number }) {
  return (
    <span className="kp-pip-row" aria-label={`Threat tier ${tier} of 5`}>
      {Array.from({ length: 5 }).map((_, t) => (
        <i key={t} className={t < tier ? "kp-pip-diamond kp-pip-on" : "kp-pip-diamond"} />
      ))}
    </span>
  );
}

/** A print cell. 1:1, never downscaled. A roster gap renders a plate of the
 * identical footprint, so the row never reflows on art coverage. */
function PrintCell({ src, tag }: { src: string | null; tag: string }) {
  if (!src) {
    return (
      <div className="ib-cell ib-nofile">
        <b>
          NO {tag}
          <br />
          ON FILE
        </b>
      </div>
    );
  }
  return (
    <div className="ib-cell">
      <img src={src} alt="" width={160} height={160} />
      <span className="ib-celltag">{tag}</span>
    </div>
  );
}

/** An unread field keeps the read field's exact footprint: the locked row
 * IS the teaching (the diagDepth waiver rests on this). */
function DeadRow({ label, needs }: { label: string; needs: string }) {
  return (
    <div className="ib-tick ib-dead">
      <span>{label}</span>
      <em>NO READ. {needs} WOULD LIGHT THIS.</em>
    </div>
  );
}

export function InboxContent({
  state,
  dispatch,
  onConfigureKit,
}: {
  state: GameState;
  dispatch: Dispatch;
  onConfigureKit: () => void;
}) {
  const { shop, day } = state;
  if (!shop || !day) return null;
  const ticket = day.ticket;
  const depth = diagDepth(shop.repairs);

  if (!ticket) {
    return (
      <div className="ib-eva ib-idle-eva">
        <div className="ib-mast">
          <div className="ib-mast-l">
            <span className="ib-eyebrow">INBOX.SYS // THE SPIKE</span>
            <div className="ib-dayline">
              <span className="ib-line">
                {day.waiting
                  ? `${COUNTER_COPY.waitingLine} THE COUNTER IS WHERE WORK COMES FROM.`
                  : day.phase === "evening"
                    ? "THE SHOP IS CLOSED. NOTHING WAITS."
                    : "NO TICKET ON THE SPIKE. THE COUNTER IS WHERE WORK COMES FROM."}
              </span>
            </div>
          </div>
        </div>
        <div className="ib-foot">
          <TapTip text={tip("strain")}>
            <span className="kp-chip-pct">
              <span>STRAIN</span>
              <em>{day.strain}</em>
            </span>
          </TapTip>
          <span className="kp-chip-pct">
            <span>JOBS TODAY</span>
            <em>
              {day.jobsWon} WON / {day.jobsResolved} RUN
            </em>
          </span>
          <TapTip text={tip("held")}>
            <span className="kp-chip-pct">
              <span>HELD</span>
              <em>{day.held.credits} CR</em>
            </span>
          </TapTip>
        </div>
      </div>
    );
  }

  const c = customerById(ticket.customerId);
  const cfg = TIER_CONFIGS[Math.max(1, Math.min(5, ticket.tier))];
  const label = MODE_LABEL[ticket.dominant];

  return (
    <div className="ib-eva">
      <div className="ib-grid" data-state="card">
        <div className="ib-mast">
          <div className="ib-mast-l">
            <span className="ib-eyebrow">INBOX.SYS // TICKET ON THE SPIKE</span>
            <div className="ib-dayline">
              <span className="ib-line">One machine, one dive. Strain rides on everything today has earned.</span>
            </div>
          </div>
        </div>

        <section className="ib-pane ib-pane-solo">
          <div className="ib-focal">
            <i className="ib-bracket" aria-hidden="true">
              <i />
            </i>
            <span className="ib-eyebrow">{"// CUSTOMER.REC"}</span>
            {depth >= 2 ? (
              <>
                <span className="ib-dominant" style={{ ["--len" as string]: String(label.length) }}>
                  {label}
                </span>
                <span className="ib-domlabel">DOMINANT ROUTINE</span>
              </>
            ) : (
              <>
                <span className="ib-dominant ib-dominant-dead" style={{ ["--len" as string]: "8" }}>
                  UNREAD
                </span>
                <span className="ib-domlabel">DOMINANT ROUTINE. THE DIAGNOSTIC BENCH II WOULD READ IT.</span>
              </>
            )}
            <div className="ib-tierrow">
              <span className="ib-tierlabel">THREAT TIER</span>
              {depth >= 1 ? (
                <>
                  <TapTip text={tip("threatTier")}>
                    <TierPips tier={ticket.tier} />
                  </TapTip>
                  <span className="ib-tierval">T{ticket.tier} OF 5</span>
                </>
              ) : (
                <span className="ib-tierval ib-deadval">UNREAD. THE DIAGNOSTIC BENCH WOULD READ IT.</span>
              )}
            </div>
            {depth >= 2 ? (
              <p className="ib-tell">
                <Typed text={MODE_TELL[ticket.dominant]} delay={120} />
              </p>
            ) : (
              <p className="ib-tell ib-tell-dead">
                The complaint is a person's account. The readout is the bench's, and this bench cannot
                give one yet.
              </p>
            )}
          </div>

          <div className="ib-support">
            <div className="ib-ticks">
              <div className="ib-tick">
                <span>NAME</span>
                <em>{c.name.toUpperCase()}</em>
              </div>
              <div className="ib-tick">
                <span>DEVICE</span>
                <em>{c.device}</em>
              </div>
              {depth >= 1 ? (
                <div className="ib-tick">
                  <span>GRID</span>
                  <em>
                    {cfg.grid[0]}x{cfg.grid[1]}
                  </em>
                </div>
              ) : (
                <DeadRow label="GRID" needs="THE DIAGNOSTIC BENCH" />
              )}
              {depth >= 3 ? (
                <div className="ib-tick">
                  <span>OPENING MOVE</span>
                  <em>
                    {cfg.headStart > 0
                      ? `ALREADY ${cfg.headStart} NODES DEEP AT LINK`
                      : "STARTS AT ITS OWN EDGE"}
                  </em>
                </div>
              ) : (
                <DeadRow label="OPENING MOVE" needs="THE DIAGNOSTIC BENCH III" />
              )}
            </div>

            {depth >= 3 && cfg.headStart > 0 && (
              <div className="ib-warn reveal">
                <span>WARNING</span>
                <em>Intrusion already {cfg.headStart} nodes deep</em>
                <i className="ib-riskflash" aria-hidden="true" />
              </div>
            )}

            <div className="ib-bottom">
              <div className="ib-cells">
                <PrintCell src={recPortraitFor(c)} tag="SUBJECT" />
                <PrintCell src={recDeviceFor(c)} tag="DEVICE" />
              </div>
              <div className="ib-verdict">
                <Btn
                  label="DIVE"
                  variant="signal"
                  onClick={() => {
                    sfx("claimTick", { bus: "ui" });
                    dispatch({ type: "startDive" });
                  }}
                />
                <Btn label="CONFIGURE DECK" variant="ghost" onClick={onConfigureKit} />
                <span className="ib-rate">
                  <span>TICKET RATE</span>
                  <em>{jobPay(ticket.tier)} CR</em>
                </span>
              </div>
            </div>
          </div>
          <Teach id="analyze-readout" />
        </section>

        <div className="ib-foot">
          <TapTip text={tip("strain")}>
            <span className="kp-chip-pct">
              <span>STRAIN</span>
              <em>{day.strain}</em>
            </span>
          </TapTip>
          <TapTip text={tip("ram")}>
            <Chip label="RAM" value={`${shop.deck.ramPerTurn}/TURN`} />
          </TapTip>
          <Chip
            label="DECK"
            value={`S${shop.deck.scanTier}/A${shop.deck.attackTier}/D${shop.deck.defendTier}`}
          />
          {day.pouch.length > 0 && (
            <span className="ib-pouch">
              <span>POUCH</span>
              {day.pouch.map((m, i) => (
                <PatchGlyph key={i} mask={m} size={13} />
              ))}
            </span>
          )}
          {ticket.visit > 1 && <span className="ib-hint">A REGULAR. SAME MACHINE, NEW TROUBLE.</span>}
        </div>
      </div>
    </div>
  );
}
