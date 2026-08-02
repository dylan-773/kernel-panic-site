import { useEffect, useRef, useState } from "react";
import { sfx } from "../../../game/audio";
import { PATCH_POUCH_MAX, armCount, shapeClassOf } from "../../../game/patch-cells";
import { darkPullPrice, type RunAction } from "../../../game/run-reducer";
import type { RunState } from "../../../game/save";
import { PatchGlyph } from "../../game/patch-glyph";

/**
 * DARKNET.LNK: the gray market as a real dark-web CLI (ported from the
 * approved ui-demos/kpos-shell/darknet.html study). Every open dials the
 * channel fresh: an unregistered-channel handshake over three relay hops,
 * the vendor banner, then a live prompt. Trades are typed or clicked; the
 * chips type themselves into the prompt so the mouse-only path is complete.
 * BUY runs escrow, dispatches buyDarkPatch (the reducer owns the roll), and
 * reveals the piece the reducer actually rolled with a decelerating shape
 * scramble. The market is only live during the night phase; the link drops
 * on screen change and EXIT burns the channel and closes the window.
 *
 * The log is imperative DOM inside one ref'd region (append-only ring
 * buffer, BUS.LOG plumbing: bottom-anchored, clipped, no scrollbar ever);
 * React owns everything around it.
 *
 * v3 (ui-demos/darknet-v3, cycle ux-2026-07-31-darknet-v3): the surface
 * gains ONE FOCAL CELL whose CONTENT moves through four states on a single
 * footprint. PENDING while the channel dials, OFFER carrying tonight's
 * price at hero scale (it used to live in a 13px chip), REVEAL lifting the
 * piece that landed out of the log and into the place the eye is already
 * trained on, and DEAD carrying the surface's one alarm. The stepped-notch
 * chrome is DARKNET's identity and is deliberately unmapped to any role.
 */

type Dispatch = (a: RunAction) => void;

const SHAPE_NOUN: Record<"I" | "L" | "T" | "X", string> = {
  I: "STRAIGHT",
  L: "ELBOW",
  T: "TEE",
  X: "CROSS",
};

const TRADES = ["HELP", "LIST", "BUY", "BAL", "POUCH", "EXIT"] as const;

const CLOSERS = [
  "Told you. Never know what you're gonna get.",
  "It is a good one. They are all good ones if you squint.",
  "Solder it to something. It will not sort itself out.",
];

const EGGS: Record<string, string> = {
  who: "Nobody. That is rather the point.",
  whoami: "Whoever you want. That is also the point.",
  refund: "Funny.",
  hello: "We are not friends. What do you want.",
  hi: "We are not friends. What do you want.",
};

/* the vendor's double chevron: pixel bitmap, second stroke hot */
const MARK = [
  "XX..YY...",
  ".XX..YY..",
  "..XX..YY.",
  "...XX..YY",
  "..XX..YY.",
  ".XX..YY..",
  "XX..YY...",
];

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

/** DOM twin of PatchGlyph (patch-glyph.tsx): same geometry, same classes. */
function glyphSvg(mask: number, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "-12 -12 24 24");
  svg.setAttribute("class", "kp-patch-glyph kp-glyph-signal");
  svg.setAttribute("aria-hidden", "true");
  const ends: Array<[number, number]> = [[0, -10], [10, 0], [0, 10], [-10, 0]];
  for (let d = 0; d < 4; d++) {
    if ((mask & (1 << d)) === 0) continue;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", String(ends[d][0]));
    line.setAttribute("y2", String(ends[d][1]));
    line.setAttribute("class", "kp-pp-arm");
    line.setAttribute("stroke-width", "3.5");
    svg.appendChild(line);
  }
  const hub = document.createElementNS(SVG_NS, "circle");
  hub.setAttribute("cx", "0");
  hub.setAttribute("cy", "0");
  hub.setAttribute("r", "3");
  hub.setAttribute("class", "kp-pp-node");
  svg.appendChild(hub);
  return svg;
}

function chevMark(cell: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(MARK[0].length * cell));
  svg.setAttribute("height", String(MARK.length * cell));
  svg.setAttribute("viewBox", `0 0 ${MARK[0].length} ${MARK.length}`);
  svg.setAttribute("aria-hidden", "true");
  for (let r = 0; r < MARK.length; r++) {
    for (let c = 0; c < MARK[r].length; c++) {
      const ch = MARK[r][c];
      if (ch === ".") continue;
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(c));
      rect.setAttribute("y", String(r));
      rect.setAttribute("width", "1");
      rect.setAttribute("height", "1");
      rect.setAttribute("class", ch === "X" ? "a" : "b");
      svg.appendChild(rect);
    }
  }
  return svg;
}

function datarow(label: string, value: string): HTMLElement {
  const r = el("div", "kp-datarow");
  r.appendChild(el("span", "", label));
  r.appendChild(el("em", "", value));
  return r;
}

interface EngineHooks {
  runRef: { current: RunState | null };
  dispatch: Dispatch;
  onExit: () => void;
  setRoute: (txt: string, dead: boolean) => void;
  setPromptDead: (v: boolean) => void;
  setLock: (v: boolean) => void;
}

/** The terminal: a sequential beat queue over an append-only DOM log. */
function makeEngine(log: HTMLElement, hooks: EngineHooks) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timers: number[] = [];
  const q: Array<(done: () => void) => void> = [];
  let busy = false;
  let live = false;
  let dead = false; // EXIT ran; nothing revives this mount

  const stage = (fn: () => void, ms: number): void => {
    if (reduced) {
      fn();
      return;
    }
    timers.push(window.setTimeout(fn, ms));
  };

  const setLive = (v: boolean) => {
    live = v;
    hooks.setPromptDead(!v);
    hooks.setLock(busy || !live);
  };

  const pump = (): void => {
    const fn = q.shift();
    if (!fn) {
      busy = false;
      hooks.setLock(busy || !live);
      return;
    }
    busy = true;
    hooks.setLock(true);
    fn(() => pump());
  };
  const enq = (fn: (done: () => void) => void): void => {
    q.push(fn);
    if (!busy) pump();
  };

  const MAX_NODES = 110;
  const push = (node: HTMLElement): HTMLElement => {
    log.appendChild(node);
    while (log.children.length > MAX_NODES && log.firstChild) log.removeChild(log.firstChild);
    return node;
  };
  const line = (cls?: string, text?: string): HTMLElement =>
    push(el("p", `t-line ${cls ?? ""}`.trim(), text));
  const gap = (): void => {
    push(el("i", "t-gap"));
  };

  const typeLine = (cls: string, text: string, cps = 13): void => {
    enq((done) => {
      const n = line(cls);
      if (reduced) {
        n.textContent = text;
        done();
        return;
      }
      let i = 0;
      const iv = window.setInterval(() => {
        i++;
        n.textContent = text.slice(0, i);
        if (i >= text.length) {
          window.clearInterval(iv);
          done();
        }
      }, cps);
      timers.push(iv);
    });
  };

  const dotsLine = (label: string, verdict: string, nDots = 7, slow = 110): void => {
    enq((done) => {
      const n = line("t-sys", `${label} `);
      if (reduced) {
        n.textContent = `${label} ......... ${verdict}`;
        done();
        return;
      }
      let d = 0;
      const iv = window.setInterval(() => {
        d++;
        n.textContent = `${label} ${". ".repeat(d)}`;
        if (d >= nDots) {
          window.clearInterval(iv);
          n.textContent = `${label} ${". ".repeat(d)}${verdict}`;
          done();
        }
      }, slow);
      timers.push(iv);
    });
  };

  const instant = (fn: () => void): void => {
    enq((done) => {
      fn();
      done();
    });
  };
  const wait = (ms: number): void => {
    enq((done) => stage(done, ms));
  };

  const pouchStrip = (pouch: number[]): void => {
    instant(() => {
      const row = el("div", "o-pouch kp-pouch-row2");
      for (let i = 0; i < PATCH_POUCH_MAX; i++) {
        if (i < pouch.length) {
          const slot = el("span", "kp-pouch-slot");
          slot.appendChild(glyphSvg(pouch[i], 20));
          row.appendChild(slot);
        } else {
          row.appendChild(el("span", "kp-pouch-slot empty"));
        }
      }
      row.appendChild(el("i", "o-pouchtag", `POUCH ${pouch.length}/${PATCH_POUCH_MAX}`));
      push(row);
    });
  };

  const banner = (): void => {
    instant(() => {
      const ban = el("div", reduced ? "banner" : "banner banner-glitch");
      const mark = el("span", "banner-mark");
      mark.appendChild(chevMark(5));
      ban.appendChild(mark);
      const col = el("div");
      col.appendChild(el("div", "banner-word", "DARKNET"));
      col.appendChild(el("span", "banner-tag", "SALVAGE EXCHANGE // NO NAMES ON FILE"));
      ban.appendChild(col);
      push(ban);
    });
  };

  const vendorGreeting = (): void => {
    typeLine("t-ven", "Salvage off a hundred dead machines, sorted by nobody.", 14);
    typeLine("t-dim", "type HELP for trades, or click one below.", 18);
    instant(() => {
      hooks.setRoute("SCRAMBLED", false);
      setLive(true);
    });
  };

  const cmdHelp = (): void => {
    const r = hooks.runRef.current;
    const price = r ? darkPullPrice(r) : 0;
    instant(() => {
      const box = el("div", "o-help");
      const rows: Array<[string, string]> = [
        ["LIST", "what is on the table tonight"],
        ["BUY", `one blind pull, ${price} cr`],
        ["BAL", "what you hold"],
        ["POUCH", "what you carry"],
        ["EXIT", "burn the channel"],
      ];
      for (const [k, v] of rows) {
        const p = el("p");
        p.appendChild(el("b", "", k));
        p.appendChild(document.createTextNode(v));
        box.appendChild(p);
      }
      push(box);
    });
  };

  const cmdList = (): void => {
    const r = hooks.runRef.current;
    const price = r ? darkPullPrice(r) : 0;
    typeLine("t-ven", "Tonight, same as every night. One crate.", 15);
    instant(() => {
      const card = el("div", "o-card kp-frame-ticks");
      card.appendChild(el("i", "kp-tick2"));
      card.appendChild(el("span", "o-tag", "TONIGHT ONLY"));
      const cell = el("div", "o-cell");
      cell.appendChild(el("span", "o-q", "?"));
      cell.appendChild(el("i", "o-sweep"));
      card.appendChild(cell);
      const rows = el("div", "o-rows");
      rows.appendChild(datarow("ITEM", "PATCH PIECE"));
      rows.appendChild(datarow("SHAPE", "UNSORTED"));
      rows.appendChild(datarow("PRICE", `${price} CR`));
      rows.appendChild(datarow("STOCK", "A CRATE FULL"));
      card.appendChild(rows);
      push(card);
    });
    typeLine("t-ven", "Pay first. Shape is the surprise. That is the whole business model here.", 13);
  };

  const cmdBal = (): void => {
    const r = hooks.runRef.current;
    instant(() => {
      const wrap = el("div", "o-row1");
      wrap.appendChild(datarow("BAL", `${r ? r.credits : 0} CR`));
      push(wrap);
    });
    typeLine("t-ven", "It spends the same as clean money.", 15);
  };

  const cmdPouch = (): void => {
    const r = hooks.runRef.current;
    pouchStrip(r ? r.patchPouch : []);
    if (r && r.patchPouch.length >= PATCH_POUCH_MAX) {
      typeLine("t-ven", "That is a full bag. I admire the appetite.", 15);
    }
  };

  const cmdBuy = (): void => {
    const r = hooks.runRef.current;
    if (!r || r.screen !== "upgrade") return;
    const cost = darkPullPrice(r);
    if (r.patchPouch.length >= PATCH_POUCH_MAX) {
      typeLine("t-ven", "Dealer is not a storage locker. Pouch is full. Come back with room.", 13);
      return;
    }
    if (r.credits < cost) {
      instant(() => {
        push(el("p", "t-haz", `// SHORT _ NEED ${cost} CR. YOU HOLD ${r.credits} CR.`));
      });
      typeLine("t-ven", "No tab. A tab needs a name and there are no names here.", 13);
      return;
    }

    /* escrow fills, then the reducer takes the money and rolls the piece;
     * the darkBuys effect queues the reveal behind the handoff beats */
    enq((done) => {
      const row = el("div", "o-escrow");
      row.appendChild(el("span", "", "ESCROW"));
      const bar = el("span", "kp-bar-hatch");
      const fill = el("i");
      fill.style.width = "0%";
      bar.appendChild(fill);
      row.appendChild(bar);
      const amt = el("em", "", "0 cr");
      row.appendChild(amt);
      push(row);
      const pay = () => {
        hooks.dispatch({ type: "buyDarkPatch" });
        done();
      };
      if (reduced) {
        fill.style.width = "97%";
        amt.textContent = `${cost} cr`;
        pay();
        return;
      }
      let step = 0;
      const iv = window.setInterval(() => {
        step++;
        const f = step / 8;
        fill.style.width = `${Math.round(f * 97)}%`;
        amt.textContent = `${Math.round(f * cost)} cr`;
        if (step >= 8) {
          window.clearInterval(iv);
          pay();
        }
      }, 90);
      timers.push(iv);
    });
    dotsLine("handoff at the dead relay", "DONE", 5, 130);
    typeLine("t-sys", "package inbound on the wire.", 16);
  };

  /** Queued by the component when run.darkBuys ticks up: the reveal lands
   * on the mask the reducer rolled. */
  const reveal = (mask: number, buys: number, credits: number, pouch: number[]): void => {
    enq((done) => {
      const card = el("div", "o-card o-reveal kp-frame-ticks");
      card.appendChild(el("i", "kp-tick2"));
      card.appendChild(el("span", "o-tag", "SIGNAL DROP"));
      const cell = el("div", "o-cell");
      card.appendChild(cell);
      const rows = el("div", "o-rows");
      card.appendChild(rows);
      push(card);

      const land = () => {
        cell.textContent = "";
        cell.appendChild(glyphSvg(mask, 68));
        cell.appendChild(el("i", "kp-scan-sweep"));
        if (!reduced) card.classList.add("dn-landed");
        sfx("darknetReveal", { bus: "ui" });
        const cls = shapeClassOf(mask);
        rows.appendChild(datarow("SHAPE", SHAPE_NOUN[cls]));
        rows.appendChild(datarow("ARMS", String(armCount(mask))));
        rows.appendChild(datarow("GUARANTEE", "NONE"));
        if (cls === "X") {
          push(el("p", "t-haz", "// JACKPOT _ A CROSS. FOUR ARMS. THREE IN A HUNDRED."));
        }
        done();
      };

      if (reduced) {
        land();
        return;
      }
      /* scramble: cycle shapes with a growing interval, then land */
      const cycle = [0x3, 0xa, 0x7, 0x9, 0x5, 0xe, 0x6, 0xd];
      const beats = [70, 70, 70, 80, 90, 110, 130, 160, 200, 260];
      let b = 0;
      const tick = () => {
        cell.textContent = "";
        cell.appendChild(glyphSvg(cycle[b % cycle.length], 68));
        b++;
        if (b < beats.length) timers.push(window.setTimeout(tick, beats[b]));
        else timers.push(window.setTimeout(land, 200));
      };
      tick();
    });
    typeLine(
      "t-ven",
      shapeClassOf(mask) === "X"
        ? "A cross. Do not ask which machine gave that up."
        : CLOSERS[(buys + credits) % CLOSERS.length],
      14,
    );
    pouchStrip(pouch);
  };

  const cmdExit = (): void => {
    dead = true;
    setLive(false);
    typeLine("t-sys", "keys burned. session never happened.", 18);
    wait(300);
    instant(() => {
      gap();
      push(el("p", "dn-hero dn-deny", "NO CARRIER"));
      hooks.setRoute("CLOSED", true);
      sfx("darknetLinkDown", { bus: "ui" });
    });
    wait(900);
    instant(() => hooks.onExit());
  };

  const runCmd = (raw: string): void => {
    const cmd = raw.trim().toLowerCase();
    if (!cmd || !live) return;
    instant(() => {
      line("t-you", `> ${raw}`);
    });
    const r = hooks.runRef.current;
    if (cmd === "help" || cmd === "?") cmdHelp();
    else if (cmd === "list" || cmd === "ls" || cmd === "wares") cmdList();
    else if (cmd === "buy" || cmd === "pull") cmdBuy();
    else if (cmd === "bal" || cmd === "balance" || cmd === "credits") cmdBal();
    else if (cmd === "pouch" || cmd === "bag" || cmd === "inv") cmdPouch();
    else if (cmd === "exit" || cmd === "quit" || cmd === "logout") cmdExit();
    else if (cmd === "haggle")
      typeLine(
        "t-ven",
        `The price climbs by the day. Tonight it is ${r ? darkPullPrice(r) : 0} cr. Tomorrow it is more.`,
        13,
      );
    else if (EGGS[cmd]) typeLine("t-ven", EGGS[cmd], 15);
    else typeLine("t-dim", "no such trade. HELP lists what there is.", 14);
  };

  /** First dial of this mount. The market state decides how far it gets. */
  const connect = (open: boolean): void => {
    hooks.setRoute("DIALING", false);
    typeLine("t-dim", "KP/OS TERM LINK 9.2 // UNREGISTERED CHANNEL", 8);
    typeLine("t-you", "> dial darknet.lnk", 20);
    typeLine("t-sys", "resolving name... no such address on record.", 14);
    typeLine("t-sys", "trying anyway.", 22);
    dotsLine("hop 1 // exchange node", "LINKED", 6, 100);
    if (!open) {
      dotsLine("hop 2 // dead relay", "dead air", 8, 150);
      wait(250);
      instant(() => {
        gap();
        push(el("p", "dn-hero", "MARKET OFFLINE."));
        sfx("darknetLinkDown", { bus: "ui" });
      });
      typeLine("t-sys", "Signal only holds after the shop shuts. Trades resume at day close.", 14);
      instant(() => hooks.setRoute("DEAD", true));
      return;
    }
    dotsLine("hop 2 // dead relay", "LINKED", 5, 110);
    dotsLine("hop 3 // [no record]", "LINKED", 4, 120);
    typeLine("t-sys", "crypt: keys traded. names were not.", 14);
    typeLine("t-sys", "carrier locked at 300 baud. it is enough.", 14);
    instant(() => sfx("darknetLinkUp", { bus: "ui" }));
    wait(200);
    banner();
    wait(260);
    vendorGreeting();
  };

  /** The market opened while the window sat on a dead dial: redial. */
  const relink = (): void => {
    if (dead) return;
    instant(() => gap());
    typeLine("t-sys", "signal returns. trying again.", 16);
    dotsLine("hop 2 // dead relay", "LINKED", 5, 110);
    dotsLine("hop 3 // [no record]", "LINKED", 4, 120);
    typeLine("t-sys", "carrier locked at 300 baud. it is enough.", 14);
    instant(() => sfx("darknetLinkUp", { bus: "ui" }));
    wait(200);
    vendorGreeting();
  };

  /** The night closed under the channel: the carrier drops mid-session. */
  const linkDrop = (): void => {
    if (dead) return;
    setLive(false);
    instant(() => {
      gap();
      sfx("darknetLinkDown", { bus: "ui" });
    });
    typeLine("t-sys", "carrier lost.", 20);
    instant(() => {
      push(el("p", "dn-hero", "MARKET OFFLINE."));
      hooks.setRoute("DEAD", true);
    });
    typeLine("t-sys", "Signal only holds after the shop shuts. Trades resume at day close.", 14);
  };

  return {
    connect,
    relink,
    linkDrop,
    runCmd,
    reveal,
    isLive: () => live && !busy,
    destroy: () => {
      timers.forEach((t) => {
        window.clearTimeout(t);
        window.clearInterval(t);
      });
      q.length = 0;
    },
  };
}

type Engine = ReturnType<typeof makeEngine>;

export function DarknetContent({
  run,
  dispatch,
  onExit,
}: {
  run: RunState | null;
  dispatch: Dispatch;
  onExit: () => void;
}) {
  const open = run !== null && run.screen === "upgrade";

  const logRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engRef = useRef<Engine | null>(null);
  const runRef = useRef<RunState | null>(run);
  runRef.current = run;
  const dispatchRef = useRef<Dispatch>(dispatch);
  dispatchRef.current = dispatch;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const [route, setRouteState] = useState<{ txt: string; dead: boolean }>({ txt: "DIALING", dead: false });
  const [promptDead, setPromptDead] = useState(true);
  const [lock, setLock] = useState(true);
  const [buf, setBufState] = useState("");
  const bufRef = useRef("");
  const setBuf = (v: string) => {
    bufRef.current = v;
    setBufState(v);
  };
  const histRef = useRef<string[]>([]);
  const histAtRef = useRef(-1);
  const seenBuysRef = useRef<number>(run ? run.darkBuys : 0);
  const prevOpenRef = useRef<boolean>(open);
  /* the focal cell's REVEAL state: the mask the reducer actually rolled,
   * held until the next trade so the piece stays readable */
  const [revealMask, setRevealMask] = useState<number | null>(null);
  const [scramble, setScramble] = useState<number | null>(null);
  const [jackpot, setJackpot] = useState(false);
  const [lockFlash, setLockFlash] = useState(0);

  /* one engine per mount; every open of the window dials fresh */
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const eng = makeEngine(log, {
      runRef,
      dispatch: (a) => dispatchRef.current(a),
      onExit: () => onExitRef.current(),
      setRoute: (txt, dead) => setRouteState({ txt, dead }),
      setPromptDead,
      setLock,
    });
    engRef.current = eng;
    seenBuysRef.current = runRef.current ? runRef.current.darkBuys : 0;
    eng.connect(prevOpenRef.current);
    /* keys should land in the channel as soon as it opens */
    hostRef.current?.closest<HTMLElement>(".kp-fw")?.focus();
    return () => {
      eng.destroy();
      engRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* market open/close transitions while the window stays up */
  useEffect(() => {
    const eng = engRef.current;
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!eng || prev === open) return;
    if (open) eng.relink();
    else eng.linkDrop();
  }, [open]);

  /* the reducer rolled: reveal exactly what it rolled */
  useEffect(() => {
    const eng = engRef.current;
    if (!eng || !run) return;
    if (run.darkBuys > seenBuysRef.current && run.lastDarkBuy !== null) {
      seenBuysRef.current = run.darkBuys;
      eng.reveal(run.lastDarkBuy, run.darkBuys, run.credits, [...run.patchPouch]);
      setRevealMask(run.lastDarkBuy);
      setJackpot(shapeClassOf(run.lastDarkBuy) === "X");
    }
  }, [run, run?.darkBuys]);

  /* the decelerating shape scramble, in the focal cell. Compositor-safe:
   * only the glyph's mask changes, nothing animates a paint property. */
  useEffect(() => {
    if (revealMask === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setScramble(null);
      return;
    }
    const cycle = [0x3, 0xa, 0x7, 0x9, 0x5, 0xe, 0x6, 0xd];
    const beats = [70, 70, 70, 80, 90, 110, 130, 160, 200, 260];
    let b = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (b >= beats.length) {
        setScramble(null);
        return;
      }
      setScramble(cycle[b % cycle.length]);
      t = setTimeout(tick, beats[b]);
      b++;
    };
    tick();
    return () => clearTimeout(t);
  }, [revealMask]);

  /* the one-shot lock-in flash when the channel resolves and the offer lands */
  useEffect(() => {
    if (route.dead || route.txt === "DIALING") return;
    setLockFlash((n) => n + 1);
  }, [route.dead, route.txt]);

  /* the prompt is real: keys land whenever this window holds focus */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const host = hostRef.current?.closest(".kp-fw");
      if (!host || !document.activeElement || !host.contains(document.activeElement)) return;
      const eng = engRef.current;
      if (!eng || !eng.isLive()) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const v = bufRef.current;
        if (!v.trim()) return;
        histRef.current.unshift(v);
        histAtRef.current = -1;
        setBuf("");
        eng.runCmd(v);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setBuf(bufRef.current.slice(0, -1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (histRef.current.length) {
          histAtRef.current = Math.min(histAtRef.current + 1, histRef.current.length - 1);
          setBuf(histRef.current[histAtRef.current]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        histAtRef.current = Math.max(histAtRef.current - 1, -1);
        setBuf(histAtRef.current === -1 ? "" : histRef.current[histAtRef.current]);
      } else if (e.key.length === 1 && bufRef.current.length < 28) {
        e.preventDefault();
        setBuf(bufRef.current + e.key);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* a clicked trade types itself into the prompt, then runs */
  const clickTrade = (word: string) => {
    const eng = engRef.current;
    if (!eng || !eng.isLive()) return;
    sfx("tick", { bus: "ui" });
    setRevealMask(null);
    setJackpot(false);
    const lower = word.toLowerCase();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setBuf("");
      eng.runCmd(lower);
      return;
    }
    setLock(true);
    let i = 0;
    const iv = window.setInterval(() => {
      i++;
      setBuf(lower.slice(0, i));
      if (i >= lower.length) {
        window.clearInterval(iv);
        setBuf("");
        setLock(false);
        eng.runCmd(lower);
      }
    }, 46);
  };

  const credits = run ? run.credits : 0;
  const pouchN = run ? run.patchPouch.length : 0;

  /* THE FOCAL CELL: one cell, four states, one footprint. Every state fills
   * the same eyebrow + hero + three-row block, so switching never reflows
   * the window. */
  const focalState = route.dead
    ? "dead"
    : revealMask !== null
      ? "reveal"
      : route.txt === "DIALING"
        ? "pending"
        : "offer";

  const focalRows: Array<[string, string]> =
    focalState === "reveal" && revealMask !== null
      ? [
          ["SHAPE", SHAPE_NOUN[shapeClassOf(revealMask)]],
          ["ARMS", String(armCount(revealMask))],
          ["GUARANTEE", "NONE"],
        ]
      : focalState === "offer"
        ? [
            ["ITEM", "PATCH PIECE"],
            ["SHAPE", "UNSORTED"],
            ["STOCK", "A CRATE FULL"],
          ]
        : [
            ["ITEM", "----"],
            ["SHAPE", "----"],
            ["STOCK", "----"],
          ];

  const eyebrow =
    focalState === "offer" ? "RATE" : focalState === "reveal" ? "SIGNAL DROP" : "ROUTE";

  return (
    <div className="dn" ref={hostRef}>
      <div className="dn-grid">
        {/* Z1 FOCAL CELL */}
        <section
          className={focalState === "offer" ? "dn-focal dn-lock" : "dn-focal"}
          data-state={focalState}
          key={`f${lockFlash}${revealMask ?? ""}`}
        >
          <i className="dn-bracket" aria-hidden="true">
            <i />
          </i>
          <span className={jackpot && focalState === "reveal" ? "dn-eyebrow dn-jack" : "dn-eyebrow"}>
            {eyebrow}
            {/* the jackpot flash: the same composited technique as the alarm,
                --r-ok, and it STOPS after three iterations, so a celebration
                can never be mistaken for the alarm, which loops forever */}
            <i className="dn-jack-flash" aria-hidden="true" />
          </span>
          <div className="dn-focal-body">
            <div className="dn-focal-hero">
              {focalState === "pending" && <span className="dn-pend">--</span>}
              {focalState === "offer" && (
                <>
                  {/* tonight's price: the largest glyphs on the page and the
                      only numeral that takes --r-data */}
                  <span className="dn-num">{run ? darkPullPrice(run) : "--"}</span>
                  <span className="dn-unit">CR</span>
                </>
              )}
              {focalState === "reveal" && revealMask !== null && (
                <span className={scramble !== null ? "dn-drop dn-drop-scramble" : "dn-drop"}>
                  <PatchGlyph mask={scramble ?? revealMask} size={96} />
                </span>
              )}
              {focalState === "dead" && (
                <span className="dn-dead">
                  MARKET OFFLINE
                  <i className="dn-alarm-flash" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="dn-focal-rows">
              {focalState === "dead" ? (
                <p className="dn-deadsub">
                  Signal only holds after the shop shuts. Trades resume at day close.
                </p>
              ) : (
                focalRows.map(([k, v]) => (
                  <div key={k} className="kp-datarow">
                    <span>{k}</span>
                    <em>{v}</em>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Z2 STATUS STRIP: shares the focal cell's row, because a row you do
            not share is a row you pay for in full. RATE is gone from here:
            its number lives in the focal cell now, never restated at two
            scales. */}
        <div className="dn-status">
          <span className={route.dead ? "kp-chip-pct chip-alarm" : "kp-chip-pct"}>
            <span>ROUTE</span>
            <em>{route.txt}</em>
          </span>
          <span className="kp-chip-pct">
            <span>PEER</span>
            <em>NO ID</em>
          </span>
          <span key={`b${credits}`} className="kp-chip-pct chip-flash">
            <span>BAL</span>
            <em>{credits} cr</em>
          </span>
          <span key={`p${pouchN}`} className="kp-chip-pct chip-flash">
            <span>POUCH</span>
            <em>
              {pouchN}/{PATCH_POUCH_MAX}
            </em>
          </span>
        </div>

        {/* Z3 THE LOG */}
        <div className="dn-log-clip">
          <div className="dn-log" ref={logRef} role="log" aria-live="polite" />
        </div>

        {/* Z4 PROMPT */}
        <div className={promptDead ? "dn-prompt dead" : "dn-prompt"}>
          <span className="dn-plabel">nobody@nowhere:~$</span>
          <span className="dn-pinput">{buf}</span>
          <span className="dn-caret" aria-hidden="true" />
        </div>

        {/* Z5 TRADES */}
        <div className="dn-cmds">
          {TRADES.map((t) => (
            <button key={t} type="button" disabled={lock || promptDead} onClick={() => clickTrade(t)}>
              {t}
            </button>
          ))}
        </div>

        {/* Z6 FOOTLINE */}
        <div className="dn-footwrap">
          <i className="kp-frame-stripe dn-stripe" />
          <p className="dn-foot">
            No refunds. No complaints line. Close the window if you want a guarantee.
          </p>
        </div>
      </div>
    </div>
  );
}
