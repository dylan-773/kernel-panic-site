import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "../../../game/audio";
import { DADLOG_CHROME, JournalEntry, visibleJournal } from "../../../game/content/journal";
import type { MetaState } from "../../../game/save";
import { Btn, Chip } from "../kp-ui";

/**
 * DAD.LOG: the archive reader. Dad's own volume mounted read-only: a
 * volume header strip, a doctype tab strip filtering the file index
 * rail, and a document viewer that runs a RECOVERY beat on every open
 * (READING SEGMENT... then the artifact types in). Each file renders a
 * per-entry ATTACHMENT cell: scans and plates where the artifact earns
 * one, a NO VISUAL PAYLOAD cell for text artifacts. Ported from the
 * gated ui-demos/kpos-shell/dadlog.html study (ux-2026-07-29-dadlog).
 */

const TABS = ["ALL", "NOTE", "BILL", "MEMO", "LOCKED"] as const;
type Tab = (typeof TABS)[number];

const DMG_KEY = "@dmg";

interface Row {
  entry: JournalEntry | null; // null = the damaged teaser
  badge: number;
}

interface Attach {
  src: string;
  tag: string;
  cap: string;
}

/** The fixed attachment mapping (ui-spec F): the cell renders what the
 * open artifact earns; text artifacts earn nothing and say so. */
const ATTACH: Record<string, Attach> = {
  will: { src: "/assets/px/window/dadlog-attach-will.png", tag: "FIG. 01 // SCAN", cap: "FOLDED FOUR, TAPE MARKS" },
  bills: { src: "/assets/px/window/dadlog-attach-notice.png", tag: "FIG. 01 // SCAN", cap: "CLINIC LETTERHEAD" },
  receipts: { src: "/assets/px/window/dadlog-attach-receipts.png", tag: "FIG. 01 // SCAN", cap: "STUB STRIP, SHOEBOX" },
  diagnosis: { src: "/assets/px/window/dadlog-attach-consult.png", tag: "FIG. 01 // SCAN", cap: "SEALED ENVELOPE" },
  solder: { src: "/assets/px/window/solder-bench.png", tag: "FIG. 01 // FRAGMENT", cap: "RECOVERED STILL" },
  patch: { src: "/assets/px/window/dadlog-attach-tower.png", tag: "FIG. 01 // DEVICE PLATE", cap: "BACK ROOM TOWER" },
};

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

/** Deterministic hash: seeds the wave/hex strips and the bank rows. */
function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

function hexGroups(next: () => number, n: number): string {
  const groups: string[] = [];
  for (let g = 0; g < n; g++) groups.push((next() % 0xffff).toString(16).toUpperCase().padStart(4, "0"));
  return groups.join(" ");
}

function WaveStrip({ id }: { id: string }) {
  const { pts, hex } = useMemo(() => {
    const next = seeded(id);
    const p: string[] = [];
    for (let x = 0; x <= 180; x += 6) {
      const y = 11 + (((next() % 100) / 100) * 16 - 8);
      p.push(`${x},${Math.round(y)}`);
    }
    return { pts: p.join(" "), hex: hexGroups(next, 4).replace(/ /g, " - ") };
  }, [id]);
  return (
    <div className="kp-jentry-wave" aria-hidden="true">
      <svg width={180} height={22} viewBox="0 0 180 22">
        <polyline points={pts} shapeRendering="crispEdges" />
      </svg>
      <span className="kp-jentry-hex">{hex}</span>
    </div>
  );
}

/** Typewriter with a blinking caret; reports real completion (the late
 * reveals key off finished text, never a wall-clock guess). */
function Typed({
  text,
  delay,
  interval = 24,
  onDone,
}: {
  text: string;
  delay: number;
  interval?: number;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const finish = () => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    };
    if (reduced) {
      setN(text.length);
      finish();
      return;
    }
    setN(0);
    let iv: ReturnType<typeof setInterval> | null = null;
    const to = setTimeout(() => {
      iv = setInterval(() => {
        setN((v) => {
          const next = Math.min(text.length, v + 1);
          if (next >= text.length) {
            if (iv) clearInterval(iv);
            finish();
          }
          return next;
        });
      }, interval);
    }, delay);
    return () => {
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
  }, [text, delay, interval, reduced]);
  const typing = !reduced && n < text.length;
  return (
    <>
      {reduced ? text : text.slice(0, n)}
      {typing && <span className="kp-boot-cursor">_</span>}
    </>
  );
}

/** The per-entry attachment cell (image, or NO VISUAL PAYLOAD). */
function AttachCell({ entry, revealAt }: { entry: JournalEntry | null; revealAt: number }) {
  const reduced = useReducedMotion();
  const a = entry ? ATTACH[entry.id] : undefined;
  const [on, setOn] = useState(reduced);
  const [settled, setSettled] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t1 = setTimeout(() => setOn(true), revealAt);
    // settle: pins the final state; animation clocks freeze without
    // rendered frames (occluded window, battery saver) while JS runs on
    const t2 = setTimeout(() => setSettled(true), revealAt + 750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reduced, revealAt]);

  if (a) {
    return (
      <div className="kp-dad3-media">
        <div className={on ? "kp-photo on" : "kp-photo"}>
          <span className="kp-photo-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <img
            src={a.src}
            alt=""
            width={304}
            height={304}
            className={settled ? "kp-settle" : undefined}
            style={settled ? { clipPath: "none" } : undefined}
          />
          <i className="tint" aria-hidden="true" />
          <i className="sweep" aria-hidden="true" />
          <span className="kp-photo-tag">{a.tag}</span>
        </div>
        <span className="kp-photo-cap">{a.cap}</span>
      </div>
    );
  }
  const cls = ["kp-attach-empty", "kp-frame-ticks", on ? "kp-blockfade" : "", settled ? "kp-settle" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="kp-dad3-media">
      <div className={cls} style={on || reduced ? undefined : { visibility: "hidden" }}>
        <i className="kp-tick2" aria-hidden="true" />
        <b>NO VISUAL PAYLOAD</b>
        {/* the damaged page may not claim TEXT ARTIFACT: the next locked
            entry can turn out to be a scan (tutorial gate round 3) */}
        <i>{entry ? "TEXT ARTIFACT" : "RECOVERY INCOMPLETE"}</i>
      </div>
      <span className="kp-photo-cap">{" "}</span>
    </div>
  );
}

/** One open document: the recovery beat, metadata, hero, body, bench
 * note, wave strip. Remounted (keyed) on every file open. */
function DocView({ entry }: { entry: JournalEntry | null }) {
  const reduced = useReducedMotion();
  const dmg = entry === null;
  const chrome = DADLOG_CHROME;

  // beat: 0 reading, 1 mounted (unlocked only), 2 folding, 3 content
  const [beat, setBeat] = useState(reduced ? 3 : 0);
  const [flipSettled, setFlipSettled] = useState(reduced);
  const [late, setLate] = useState(false);
  const [dmgSettled, setDmgSettled] = useState(reduced);
  const pendingRef = useRef(0);

  const meta = dmg
    ? { filename: "????", doctype: chrome.damagedPage.doctype, provenance: chrome.damagedPage.provenance }
    : { filename: entry.filename, doctype: entry.doctype, provenance: entry.provenance };
  const title = dmg ? chrome.damagedPage.title : entry.title;
  const body: readonly string[] = dmg ? chrome.damagedPage.body : entry.body;

  pendingRef.current = reduced ? 0 : 4 + body.length; // 3 fields + hero + paragraphs

  useEffect(() => {
    if (reduced) {
      setBeat(3);
      return;
    }
    setBeat(0);
    setLate(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (dmg) {
      timers.push(setTimeout(() => setBeat(2), 220));
      timers.push(setTimeout(() => setBeat(3), 310));
      timers.push(setTimeout(() => setDmgSettled(true), 520));
    } else {
      timers.push(
        setTimeout(() => {
          setBeat(1);
          sfx("segmentMount", { bus: "ui" });
        }, 220),
      );
      timers.push(setTimeout(() => setBeat(2), 380));
      timers.push(setTimeout(() => setBeat(3), 470));
    }
    timers.push(setTimeout(() => setFlipSettled(true), 320));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reduced motion still owes the mount confirm exactly once
  useEffect(() => {
    if (reduced && !dmg) sfx("segmentMount", { bus: "ui" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldDone = () => {
    pendingRef.current -= 1;
    if (pendingRef.current <= 0) setTimeout(() => setLate(true), 80);
  };

  const frameCls = [
    "kp-dad3-frame",
    dmg ? "dmg" : "",
    reduced ? "" : "kp-page-flip",
    flipSettled ? "kp-settle" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showContent = dmg ? beat >= 3 : true;
  const typingLive = !dmg && !reduced && beat >= 3;
  const dmgFadeCls = ["kp-blockfade", dmgSettled ? "kp-settle" : ""].filter(Boolean).join(" ");
  const lateCls = late || reduced ? "kp-latefade show" + (reduced ? " kp-settle" : "") : "kp-latefade";

  return (
    <div className={frameCls}>
      {!reduced && beat < 3 && (
        <div className={beat === 2 ? "kp-seg-status fold" : "kp-seg-status"}>
          <span>{beat >= 1 && !dmg ? chrome.recoveryBeat[1] : chrome.recoveryBeat[0]}</span>
          <span className="kp-boot-cursor">_</span>
        </div>
      )}
      <div
        className={dmg && showContent && !reduced ? "kp-dad3-inner " + dmgFadeCls : "kp-dad3-inner"}
        style={dmg && !showContent ? { visibility: "hidden" } : undefined}
      >
        <div className="kp-dad3-rows">
          {(
            [
              ["FILENAME", meta.filename, 470],
              ["DOCTYPE", meta.doctype, 540],
              ["PROVENANCE", meta.provenance, 610],
            ] as const
          ).map(([label, value, at]) => (
            <div key={label} className="kp-datarow">
              <span>{label}</span>
              <em>
                {typingLive ? (
                  <Typed text={value} delay={at - 470} onDone={fieldDone} />
                ) : (
                  (showContent || reduced) && value
                )}
              </em>
            </div>
          ))}
        </div>
        <div className="kp-dad3-hero">
          {typingLive ? <Typed text={title} delay={220} onDone={fieldDone} /> : (showContent || reduced) && title}
        </div>
        <div className="kp-dad3-body">
          {body.map((line, i) => (
            <p key={i}>
              {typingLive ? (
                <Typed text={line} delay={300 + i * 90} interval={14} onDone={fieldDone} />
              ) : (
                (showContent || reduced) && line
              )}
            </p>
          ))}
        </div>
        {!dmg && entry.benchNote && (
          <>
            <div className={"kp-benchsep " + lateCls} />
            <div className={"kp-benchnote " + lateCls}>
              <b>BENCH NOTE</b>
              <p>{">> " + entry.benchNote}</p>
            </div>
          </>
        )}
        {!dmg && (
          <div className={lateCls}>
            <WaveStrip id={entry.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function Banks() {
  const rows = useMemo(() => {
    const next = seeded("dadvol");
    return ["BANK 1", "BANK 2"].map((label) => ({
      label,
      quads: Array.from({ length: 4 }, () => hexGroups(next, 4)),
    }));
  }, []);
  return (
    <div className="kp-dad3-banks" aria-hidden="true">
      {rows.map((r) => (
        <div key={r.label} className="kp-dad3-bankrow">
          <b>{r.label}</b>
          {r.quads.map((q, i) => (
            <span key={i}>{q}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function DadlogContent({ meta }: { meta: MetaState }) {
  const chrome = DADLOG_CHROME;
  const { unlocked, nextLocked } = visibleJournal(meta);

  const allRows: Row[] = useMemo(() => {
    const out: Row[] = unlocked.map((e, i) => ({ entry: e, badge: i + 1 }));
    if (nextLocked) out.push({ entry: null, badge: unlocked.length + 1 });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.runCount, meta.machineOpened]);

  const [tab, setTab] = useState<Tab>("ALL");
  // the open document is tracked by identity, not list position, so a
  // tab filter change never desyncs the viewer from the rail
  const [openKey, setOpenKey] = useState<string | null>(() => {
    const last = [...allRows].reverse().find((r) => r.entry);
    return last ? last.entry!.id : null;
  });
  const [beatN, setBeatN] = useState(0); // remount key: replays the beat

  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (tab === "ALL") return true;
        if (tab === "LOCKED") return !r.entry;
        return !!r.entry && r.entry.kind === tab.toLowerCase();
      }),
    [allRows, tab],
  );

  const keyOf = (r: Row) => (r.entry ? r.entry.id : DMG_KEY);
  const selIndex = rows.findIndex((r) => keyOf(r) === openKey);
  const openRow = allRows.find((r) => keyOf(r) === openKey) ?? null;

  const nav = (i: number) => {
    if (i < 0 || i >= rows.length) return;
    const r = rows[i];
    if (keyOf(r) === openKey) return;
    sfx(r.entry ? "pageFlip" : "segmentDamaged", { bus: "ui" });
    setOpenKey(keyOf(r));
    setBeatN((n) => n + 1);
  };

  const d = meta.machineOpened ? 10 : 9;
  const volMeta = chrome.volumeHeaderMeta.replace("{n}", String(unlocked.length)).replace("{d}", String(d));

  return (
    <div className="kp-dad3">
      <div className="kp-dad3-vol">
        <span>{volMeta}</span>
        <b className="kp-boot-cursor">_</b>
      </div>
      <div className="kp-dad3-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "on" : undefined}
            onClick={() => {
              if (tab === t) return;
              sfx("tick", { bus: "ui" });
              setTab(t);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="kp-dad3-grid">
        <div className="kp-dad3-rail">
          <span className="kp-dad3-railhead">{chrome.indexRailHeader}</span>
          <div className="kp-dad3-list">
            {rows.length === 0 &&
              (tab === "ALL" ? (
                <p className="kp-rail-dim">{chrome.emptyDrawerState}</p>
              ) : (
                /* a working filter that found nothing must say so, or it
                 * reads as broken (tutorial gate 2b, tier 0) */
                <p className="kp-rail-dim">NONE OF THIS KIND RECOVERED YET</p>
              ))}
            {rows.map((r, i) => (
              <button
                key={keyOf(r)}
                type="button"
                className={["kp-dfile-row", r.entry ? "" : "dmg", i === selIndex ? "on" : ""].filter(Boolean).join(" ")}
                onClick={() => nav(i)}
              >
                <b>{String(r.badge).padStart(2, "0")}</b>
                <span>{r.entry ? r.entry.filename : "????"}</span>
                <i>{r.entry ? r.entry.doctype : chrome.damagedPage.doctype}</i>
                <em>{r.entry ? "RECOVERED" : chrome.damagedRowText}</em>
              </button>
            ))}
          </div>
        </div>
        <div className="kp-dad3-viewer">
          {openRow ? (
            <>
              <AttachCell key={`a${openKey}-${beatN}`} entry={openRow.entry} revealAt={openRow.entry ? 470 : 310} />
              <DocView key={`d${openKey}-${beatN}`} entry={openRow.entry} />
            </>
          ) : (
            <p className="kp-rail-dim">{chrome.emptyDrawerState}</p>
          )}
        </div>
      </div>
      <Banks />
      <div className="kp-dad3-foot">
        <Btn label="PREV" variant="ghost" disabled={selIndex <= 0 || rows.length === 0} onClick={() => nav(selIndex - 1)} />
        <Btn label="NEXT" variant="ghost" disabled={rows.length === 0 || selIndex >= rows.length - 1} onClick={() => nav(selIndex + 1)} />
        <Chip label={chrome.footChipLabel} value={`${selIndex >= 0 ? selIndex + 1 : 0}/${rows.length}`} />
      </div>
    </div>
  );
}
