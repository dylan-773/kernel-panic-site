import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sfx } from "../../../game/audio";
import { DADLOG_CHROME, JournalEntry, visibleJournal } from "../../../game/content/journal";
import type { MetaState } from "../../../game/save";

/**
 * DAD.LOG as a KP/OS v3 instrument panel (ui-demos/dadlog-v3, cycle
 * ux-2026-07-31-dadlog-v3). System: ../RULINGS.md.
 *
 * Dad's own volume, mounted read only. GLANCE ORDER: 1st the recovered
 * document's title, the surface's one focal element; 2nd the file index
 * rail; 3rd the attachment. The volume string, the recovery meter, the
 * source-media plate and the bank rows are ambient.
 *
 * THE ALARM is the damaged segment and nothing else. It is never colour
 * alone: the row also floods inverse video and MOVES, which is the one
 * channel the ambient hazard chrome structurally never gets.
 *
 * The main row is FIXED HEIGHT. A document that does not fit does not
 * scroll, it turns a page (law 8): blocks are laid out at full text,
 * measured, then packed greedily into the page box. Measuring the FULL
 * text first is what makes the typewriter safe, because page assignment
 * can never shift while typing.
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

/** The fixed attachment mapping: the cell renders what the open artifact
 * earns; text artifacts earn nothing and say so. FULL COLOUR prints, cut
 * at exactly 240x320 so one dither dot is one CSS pixel. */
const V3 = "/assets/px/window/v3";
const ATTACH: Record<string, Attach> = {
  will: { src: `${V3}/scan-will-color.png`, tag: "FIG. 01 // SCAN", cap: "FOLDED FOUR, TAPE MARKS" },
  bills: { src: `${V3}/scan-notice-color.png`, tag: "FIG. 01 // SCAN", cap: "CLINIC LETTERHEAD" },
  receipts: { src: `${V3}/scan-receipts-color.png`, tag: "FIG. 01 // SCAN", cap: "STUB STRIP, SHOEBOX" },
  diagnosis: { src: `${V3}/scan-consult-color.png`, tag: "FIG. 01 // SCAN", cap: "SEALED ENVELOPE" },
  solder: { src: `${V3}/scan-solder-color.png`, tag: "FIG. 01 // FRAGMENT", cap: "RECOVERED STILL" },
  patch: { src: `${V3}/scan-tower-color.png`, tag: "FIG. 01 // DEVICE PLATE", cap: "BACK ROOM TOWER" },
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

/** Deterministic hash: seeds the wave strip, the media plate and the banks. */
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function WaveStrip({ id }: { id: string }) {
  const { pts, hex } = useMemo(() => {
    const next = seeded(id);
    const p: string[] = [];
    for (let x = 0; x <= 168; x += 6) {
      const y = 10 + ((next() % 100) / 100) * 14 - 7;
      p.push(`${x},${Math.round(y)}`);
    }
    return { pts: p.join(" "), hex: hexGroups(next, 3).replace(/ /g, " - ") };
  }, [id]);
  return (
    <span className="dl-wave" aria-hidden="true">
      <svg width={168} height={20} viewBox="0 0 168 20">
        <polyline points={pts} shapeRendering="crispEdges" />
      </svg>
      <span>{hex}</span>
    </span>
  );
}

/** Typewriter with a blinking caret. */
function Typed({ text, delay, interval = 24 }: { text: string; delay: number; interval?: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) return;
    setN(0);
    let iv: ReturnType<typeof setInterval> | null = null;
    const to = setTimeout(() => {
      iv = setInterval(() => setN((v) => Math.min(text.length, v + 1)), interval);
    }, delay);
    return () => {
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
  }, [text, delay, interval, reduced]);
  const shown = reduced ? text : text.slice(0, n);
  return (
    <>
      {shown}
      {!reduced && n < text.length && <span className="kp-boot-cursor">_</span>}
    </>
  );
}

/** The attachment cell. 1:1, never downscaled: the source is 240x320
 * exactly, so to show less you crop and never resample. */
function ScanCell({ entry, revealAt }: { entry: JournalEntry | null; revealAt: number }) {
  const reduced = useReducedMotion();
  const a = entry ? ATTACH[entry.id] : undefined;
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    setOn(false);
    const t = setTimeout(() => setOn(true), revealAt);
    return () => clearTimeout(t);
  }, [reduced, revealAt, entry]);

  if (!a) {
    return (
      <>
        {/* the no-payload cell holds exactly the room a scan does */}
        <div className="dl-nopay">
          <b>NO VISUAL PAYLOAD</b>
          {/* the damaged page may not claim TEXT ARTIFACT: the next locked
              entry can turn out to be a scan */}
          <i>{entry ? "TEXT ARTIFACT" : "RECOVERY INCOMPLETE"}</i>
        </div>
        <span className="dl-scancap"> </span>
      </>
    );
  }
  return (
    <>
      <div className={on ? "dl-scan on" : "dl-scan"}>
        <img src={a.src} alt="" width={240} height={320} />
        <i className="tint" aria-hidden="true" />
        <span className="dl-scantag">{a.tag}</span>
        <i className="shade" aria-hidden="true" />
      </div>
      <span className="dl-scancap">{a.cap}</span>
    </>
  );
}

/** One open document: the recovery beat, metadata chips, the hero title,
 * the paged body, the bench note and the wave strip. */
function DocView({ entry }: { entry: JournalEntry | null }) {
  const reduced = useReducedMotion();
  const chrome = DADLOG_CHROME;
  const dmg = entry === null;

  // beat: 0 reading, 1 mounted (unlocked only), 2 folding, 3 content
  const [beat, setBeat] = useState(reduced ? 3 : 0);
  useEffect(() => {
    if (reduced) {
      setBeat(3);
      return;
    }
    setBeat(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (dmg) {
      timers.push(setTimeout(() => setBeat(2), 220));
      timers.push(setTimeout(() => setBeat(3), 310));
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
    return () => timers.forEach(clearTimeout);
  }, [reduced, dmg]);

  useEffect(() => {
    if (reduced && !dmg) sfx("segmentMount", { bus: "ui" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = dmg
    ? { filename: "????", doctype: chrome.damagedPage.doctype, provenance: chrome.damagedPage.provenance }
    : { filename: entry.filename, doctype: entry.doctype, provenance: entry.provenance };
  const title = dmg ? chrome.damagedPage.title : entry.title;
  const body: readonly string[] = dmg ? chrome.damagedPage.body : entry.body;
  const benchNote = !dmg ? entry.benchNote : null;

  /* PAGINATION. Blocks lay out at full text, get measured, and are packed
   * greedily into the fixed page box. */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<number[][]>([]);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const kids = Array.from(inner.children) as HTMLElement[];
    kids.forEach((k) => k.classList.remove("hide"));
    const avail = box.clientHeight;
    const gap = 8;
    const out: number[][] = [];
    let cur: number[] = [];
    let used = 0;
    kids.forEach((k, i) => {
      const h = k.offsetHeight;
      const add = cur.length ? h + gap : h;
      if (cur.length && used + add > avail) {
        out.push(cur);
        cur = [i];
        used = h;
      } else {
        cur.push(i);
        used += add;
      }
    });
    if (cur.length) out.push(cur);
    setPages(out.length ? out : [[]]);
    setPage(0);
  }, [entry, body, benchNote]);

  // apply the page assignment to the DOM (class only: never a scrollbar)
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner || pages.length === 0) return;
    const shown = new Set(pages[Math.min(page, pages.length - 1)] ?? []);
    Array.from(inner.children).forEach((k, i) => {
      (k as HTMLElement).classList.toggle("hide", !shown.has(i));
    });
  }, [pages, page]);

  const single = pages.length <= 1;
  const showContent = dmg ? beat >= 3 : true;

  return (
    <section className={dmg ? "dl-doc dmg" : "dl-doc"}>
      {!reduced && beat < 3 && (
        <div className={`dl-beat${beat >= 1 && !dmg ? " mounted" : ""}${beat === 2 ? " fold" : ""}`}>
          <span>{beat >= 1 && !dmg ? chrome.recoveryBeat[1] : chrome.recoveryBeat[0]}</span>
          <span className="kp-boot-cursor">_</span>
        </div>
      )}
      <div className="dl-metarow">
        {/* FILENAME and DOCTYPE only: provenance is the .dl-prov line below
            the hero, and a chip carrying the same sentence both duplicated
            it and blew the metarow's width. */}
        {(
          [
            ["FILENAME", meta.filename],
            ["DOCTYPE", meta.doctype],
          ] as const
        ).map(([label, value]) => (
          <span key={label} className="dl-chip">
            <span>{label}</span>
            <em>{showContent ? value : ""}</em>
          </span>
        ))}
      </div>
      {/* THE FOCAL ELEMENT. Everything else here is annotation around a
          recovered document title. */}
      <h2 className="dl-hero">
        {showContent && (beat >= 3 && !reduced && !dmg ? <Typed text={title} delay={0} /> : title)}
      </h2>
      <p className="dl-prov">{showContent ? meta.provenance : ""}</p>
      {/* hazard-stripe divider: labels the boundary between the metadata
          block and the artifact itself. Ambient chrome, static forever. */}
      <i className="dl-stripe" aria-hidden="true" />
      <div className="dl-page" ref={boxRef}>
        <div className="dl-pagein" ref={innerRef}>
          {body.map((line, i) => (
            <div key={i} className="dl-block">
              {showContent && (beat >= 3 && !reduced && !dmg ? <Typed text={line} delay={i * 90} interval={14} /> : line)}
            </div>
          ))}
          {/* the player's voice stays quarantined in its own dashed box:
              the artifact is Dad's, the annotation is not */}
          {benchNote && (
            <div className="dl-bench dl-block">
              <b>BENCH NOTE</b>
              <p>{">> " + benchNote}</p>
            </div>
          )}
        </div>
      </div>
      <div className="dl-docfoot">
        {!dmg && entry && <WaveStrip id={entry.id} />}
        <span className="dl-pager" data-single={single ? "1" : "0"}>
          <em>
            PAGE {Math.min(page + 1, Math.max(pages.length, 1))}/{Math.max(pages.length, 1)}
          </em>
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            PREV PAGE
          </button>
          <button
            type="button"
            disabled={page >= pages.length - 1}
            onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
          >
            NEXT PAGE
          </button>
        </span>
      </div>
      {/* hairline + heavy corner brackets, scoped to the FOCAL panel only */}
      <i className="dl-bracket" aria-hidden="true">
        <i />
      </i>
    </section>
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
  const [openKey, setOpenKey] = useState<string | null>(() => {
    const last = [...allRows].reverse().find((r) => r.entry);
    return last ? last.entry!.id : null;
  });
  const [beatN, setBeatN] = useState(0);

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

  const plate = useMemo(() => {
    const next = seeded(openRow?.entry ? openRow.entry.id : "dadvol");
    return [
      ["MEDIA", "DAD.VOL"],
      ["MOUNT", "READ ONLY"],
      ["SEGMENT", hexGroups(next, 1)],
      ["CHECKSUM", hexGroups(next, 2)],
      ["PASSES", pad2(meta.runCount)],
    ] as Array<[string, string]>;
  }, [openRow?.entry?.id, meta.runCount]);

  const banks = useMemo(() => {
    const next = seeded("dadvol");
    return ["BANK 1", "BANK 2"].map((label) => ({
      label,
      quads: Array.from({ length: 4 }, () => hexGroups(next, 4)),
    }));
  }, []);

  return (
    <div className="dl">
      <div className="dl-grid">
        {/* Z4 MASTHEAD: the volume, the recovery, the filter. nowrap is
            load bearing: this row must fit the NARROWEST supported window,
            or three viewports render two different arrangements. */}
        <div className="dl-mast">
          {/* the gated volume string, verbatim, but DEMOTED: the instrument
              beside it is the readable form of the same fact, so this is
              the copy record rather than a thing the eye stops on */}
          <span className="dl-volline">{volMeta}</span>
          <div className="dl-recwrap">
            <span className="dl-reclabel">RECOVERY</span>
            <span className="dl-recnum">
              <em>{unlocked.length}</em>
              <b>/</b>
              <em>{d}</em>
            </span>
            <span className="dl-recbar">
              {Array.from({ length: d }).map((_, i) => (
                <i key={i} className={i < unlocked.length ? "on" : undefined} />
              ))}
            </span>
          </div>
          <div className="dl-tabs">
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
        </div>

        <div className="dl-main">
          {/* Z3 RAIL: the index */}
          <aside className="dl-rail">
            <span className="dl-railhead">{chrome.indexRailHeader}</span>
            <div className="dl-list">
              {rows.length === 0 && (
                <p className="dl-railempty">
                  {tab === "ALL" ? chrome.emptyDrawerState : "NONE OF THIS KIND RECOVERED YET"}
                </p>
              )}
              {rows.map((r, i) => (
                <button
                  key={keyOf(r)}
                  type="button"
                  className={["dl-row", r.entry ? "" : "dmg", i === selIndex ? "on" : ""].filter(Boolean).join(" ")}
                  onClick={() => nav(i)}
                >
                  <b>{pad2(r.badge)}</b>
                  <span>{r.entry ? r.entry.filename : "????"}</span>
                  <i>{r.entry ? r.entry.doctype : chrome.damagedPage.doctype}</i>
                  <em>{r.entry ? "RECOVERED" : chrome.damagedRowText}</em>
                  {!r.entry && <i className="dl-flash" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </aside>

          {/* Z1/Z2 DOCUMENT: the focal panel */}
          {openRow ? (
            <DocView key={`d${openKey}-${beatN}`} entry={openRow.entry} />
          ) : (
            <section className="dl-doc">
              <p className="dl-railempty">{chrome.emptyDrawerState}</p>
              <i className="dl-bracket" aria-hidden="true">
                <i />
              </i>
            </section>
          )}

          {/* Z2 MEDIA: the attachment */}
          <aside className="dl-media" data-scan="color">
            {openRow ? (
              <ScanCell key={`a${openKey}-${beatN}`} entry={openRow.entry} revealAt={openRow.entry ? 470 : 310} />
            ) : (
              <>
                <div className="dl-nopay">
                  <b>NO VISUAL PAYLOAD</b>
                  <i>RECOVERY INCOMPLETE</i>
                </div>
                <span className="dl-scancap"> </span>
              </>
            )}
            {/* ambient furniture that fills the media column to the doc
                column's height, so nothing pays for a row of its own */}
            <div className="dl-plate">
              {plate.map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <em>{v}</em>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Z4 FOOTLINE */}
        <div className="dl-foot">
          <button type="button" disabled={selIndex <= 0 || rows.length === 0} onClick={() => nav(selIndex - 1)}>
            PREV
          </button>
          <button
            type="button"
            disabled={rows.length === 0 || selIndex >= rows.length - 1}
            onClick={() => nav(selIndex + 1)}
          >
            NEXT
          </button>
          <span className="kp-chip-pct">
            <span>{chrome.footChipLabel}</span>
            <em>
              {selIndex >= 0 ? selIndex + 1 : 0}/{rows.length}
            </em>
          </span>
          <div className="dl-banks" aria-hidden="true">
            {banks.map((r) => (
              <div key={r.label}>
                <b>{r.label}</b>
                {r.quads.map((q, i) => (
                  <span key={i}>{q}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
