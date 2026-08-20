import { useEffect, useMemo } from "react";
import { playLedgerPrint } from "../../../game/audio";
import { AUGMENTS, MODE_LABEL, OppMode } from "../../../game/content/kit";
import { REPAIRS, pouchCapFor } from "../../../game/content/repairs";
import type { DayState, MetaState, ShopState } from "../../../game/save";
import { WEEKDAYS, weekdayOf } from "../../../game/save";
import { customerById } from "../../game/screens";
import { cardPortraitFor } from "../roster-art";
import { Chip, DataRows, Hero, Nodes, PipRow, Ruler, SegMeter } from "../kp-ui";

/**
 * LEDGER.LOG: the books, not a score. TODAY (held, unbanked, marked so)
 * against LIFETIME, the MOST LETHAL dossier, print furniture at the foot.
 * The window itself is a repair: the ledger terminal boots to a cursor
 * until it is fixed, which is what makes the books worth reading.
 */

function topOf(counts: Record<string, number>): { key: string; n: number } | null {
  let best: { key: string; n: number } | null = null;
  for (const [key, n] of Object.entries(counts)) {
    if (!best || n > best.n) best = { key, n };
  }
  return best;
}

function seeded(id: string): () => number {
  let s = 0;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

function LedgerFoot({ seedKey }: { seedKey: string }) {
  const hex = useMemo(() => {
    const next = seeded(seedKey);
    return Array.from({ length: 4 }, () =>
      (next() % 0xffff).toString(16).toUpperCase().padStart(4, "0"),
    ).join(" - ");
  }, [seedKey]);
  return (
    <div className="kp-ledger-foot">
      <div className="kp-dotmatrix kp-dotmatrix-print" aria-hidden="true">
        {Array.from({ length: 64 }).map((_, i) => (
          <i key={i} style={{ animationDelay: `${i * 4.5}ms` }} />
        ))}
      </div>
      <span className="kp-jentry-hex">{hex}</span>
      <div className="kp-foot-brand">
        <span className="kp-foot-batt" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>KP/OS REPAIR BENCH v9.2</span>
      </div>
    </div>
  );
}

export function LedgerContent({
  meta,
  shop,
  day,
}: {
  meta: MetaState;
  shop: ShopState;
  day: DayState;
}) {
  /* a fresh statement prints on every open (the window unmounts when
   * closed, so mount = open) */
  useEffect(() => {
    playLedgerPrint();
  }, []);
  const st = meta.stats;
  const mode = topOf(st.modeUse);
  const lethal = topOf(st.lostTo);
  const lethalCustomer = lethal ? customerById(lethal.key) : null;
  const boosts = AUGMENTS.filter((a) => a.kind === "boost").length;

  return (
    <div className="kp-ledger2">
      <div className="kp-ledger2-head">
        <Hero text={`LEDGER D${shop.day}`} />
        <Chip label="BACK ROOM" value={meta.machineOpened ? "OPEN" : "SEALED"} crimson={meta.machineOpened} />
      </div>

      <span className="kp-ledger2-strip">{"// TODAY, UNBANKED _"}</span>
      <div className="kp-ledger2-grid">
        <DataRows
          slash
          rows={[
            { label: "DAY", value: `${shop.day} (${WEEKDAYS[weekdayOf(shop.day)]})` },
            { label: "JOBS RUN", value: `${day.jobsWon} won / ${day.jobsResolved} run` },
            { label: "TURNED AWAY", value: String(day.declined) },
            { label: "HELD PAY", value: `${day.held.credits} cr` },
            { label: "HELD SALVAGE", value: `${day.held.salvage} sv` },
            {
              label: "NEURAL STRAIN",
              value: (
                <span className="kp-ledger-strain">
                  <SegMeter pct={day.strain} segs={16} dur={300} steps={8} />
                  <em>{day.strain}/100</em>
                </span>
              ),
            },
          ]}
        />
        <div className="kp-ledger2-credit kp-frame-nodes">
          <Nodes />
          <span className="kp-rpt-label">BANKED</span>
          <div className="kp-pay-big">
            {shop.credits}
            <i>cr</i>
          </div>
          <div className="kp-ledger2-pips">
            <span className="kp-rpt-label">SALVAGE</span>
            <em className="kp-ledger2-sv">{shop.salvage} sv</em>
          </div>
          <div className="kp-ledger2-pips">
            <span className="kp-rpt-label">POUCH</span>
            <PipRow filled={shop.patchPouch.length} total={pouchCapFor(shop.repairs)} size="sm" />
          </div>
          <div className="kp-ledger2-pips">
            <span className="kp-rpt-label">REPAIRS</span>
            <PipRow filled={shop.repairs.length} total={REPAIRS.length} size="sm" />
          </div>
        </div>
      </div>

      <Ruler left="TODAY" right="LIFETIME" />

      <span className="kp-ledger2-strip">{"// LIFETIME _"}</span>
      <div className="kp-ledger2-grid">
        <DataRows
          slash
          rows={[
            { label: "DAYS CLOSED", value: String(st.daysClosed) },
            { label: "DAYS LOST", value: String(st.daysBusted) },
            { label: "TOWER ATTEMPTS", value: String(shop.attempts) },
            { label: "JOBS CLEARED", value: String(st.divesCleared) },
            { label: "DIVES LOST", value: String(st.divesLost) },
            { label: "AUGMENTS OWNED", value: `${shop.deck.ownedBoosts.length}/${boosts}` },
            {
              label: "MOST USED MODE",
              value: mode ? `${MODE_LABEL[mode.key as OppMode] ?? mode.key} x${mode.n}` : "none yet",
            },
          ]}
        />
        <div className={lethalCustomer ? "kp-ledger2-lethal" : "kp-ledger2-lethal kp-ledger2-lethal-none"}>
          <span className="kp-rpt-label">MOST LETHAL</span>
          {lethalCustomer ? (
            <>
              <div className="kp-cell">
                <span className="kp-cell-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <img src={cardPortraitFor(lethalCustomer)} alt="" width={880} height={880} />
                <i className="tint" aria-hidden="true" />
              </div>
              <span className="kp-ledger2-lethal-tag">
                {lethalCustomer.name.toUpperCase()} x{lethal!.n}
              </span>
            </>
          ) : (
            <>
              <span className="kp-piece-hole" aria-hidden="true" />
              <span className="kp-rail-dim">nobody yet</span>
            </>
          )}
        </div>
      </div>

      <LedgerFoot seedKey={`ledger-${shop.day}`} />
    </div>
  );
}
