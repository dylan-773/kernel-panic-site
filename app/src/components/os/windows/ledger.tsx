import { useEffect, useMemo } from "react";
import { playLedgerPrint } from "../../../game/audio";
import { FINAL_DAY } from "../../../game/content/arc";
import { AUGMENTS, MODE_LABEL, OppMode } from "../../../game/content/kit";
import { PATCH_POUCH_MAX } from "../../../game/patch-cells";
import { BOOST_SLOTS_MAX } from "../../../game/run-reducer";
import type { MetaState, RunState } from "../../../game/save";
import { customerById } from "../../game/screens";
import { cardPortraitFor } from "../roster-art";
import { Chip, DataRows, Hero, Nodes, PipRow, Ruler, SegMeter } from "../kp-ui";

/**
 * LEDGER.LOG: the shop's accounting terminal as a full data sheet. THIS RUN
 * splits into slash rows beside a framed CREDITS hero cell; LIFETIME splits
 * into slash rows beside the MOST LETHAL dossier cell (the face that has
 * ended you the most, straight off the customer file). Print furniture at
 * the foot: dot matrix, seeded hex strip, the bench brand.
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

export function LedgerContent({ meta, run }: { meta: MetaState; run: RunState | null }) {
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
        <Hero text={`LEDGER №${meta.runCount}`} />
        <Chip label="BACK ROOM" value={meta.machineOpened ? "OPEN" : "SEALED"} crimson={meta.machineOpened} />
      </div>

      <span className="kp-ledger2-strip">{"// THIS RUN _"}</span>
      {run ? (
        <div className="kp-ledger2-grid">
          <DataRows
            slash
            rows={[
              { label: "ATTEMPT", value: String(run.runNumber) },
              { label: "DAY", value: `${Math.min(run.day, FINAL_DAY)}/10` },
              { label: "RAM / TURN", value: String(run.ramPerTurn) },
              { label: "KIT TIERS", value: `S${run.kit.scanTier} A${run.kit.attackTier} D${run.kit.defendTier}` },
              { label: "AUGMENTS", value: `${run.kit.augments.length}/${boosts}` },
              {
                label: "NEURAL STRAIN",
                value: (
                  <span className="kp-ledger-strain">
                    <SegMeter pct={run.strain} segs={16} dur={300} steps={8} />
                    <em>{run.strain}/100</em>
                  </span>
                ),
              },
            ]}
          />
          <div className="kp-ledger2-credit kp-frame-nodes">
            <Nodes />
            <span className="kp-rpt-label">CREDITS</span>
            <div className="kp-pay-big">
              {run.credits}
              <i>cr</i>
            </div>
            <div className="kp-ledger2-pips">
              <span className="kp-rpt-label">POUCH</span>
              <PipRow filled={run.patchPouch.length} total={PATCH_POUCH_MAX} size="sm" />
            </div>
            <div className="kp-ledger2-pips">
              <span className="kp-rpt-label">BAYS</span>
              <PipRow filled={run.boostSlots} total={BOOST_SLOTS_MAX} size="sm" />
            </div>
          </div>
        </div>
      ) : (
        <DataRows slash rows={[{ label: "ACTIVE RUN", value: "none" }]} />
      )}

      <Ruler left="RUN" right="LIFETIME" />

      <span className="kp-ledger2-strip">{"// LIFETIME _"}</span>
      <div className="kp-ledger2-grid">
        <DataRows
          slash
          rows={[
            { label: "ATTEMPTS", value: String(meta.runCount) },
            { label: "MACHINE BEATEN", value: String(st.runsWon) },
            { label: "JOBS CLEARED", value: String(st.divesCleared) },
            { label: "DIVES LOST", value: String(st.divesLost) },
            { label: "SCANS RUN", value: String(st.scans) },
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

      <LedgerFoot seedKey={`ledger-${meta.runCount}`} />
    </div>
  );
}
