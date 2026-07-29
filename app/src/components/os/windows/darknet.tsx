import { useEffect, useRef, useState } from "react";
import { sfx } from "../../../game/audio";
import { PATCH_POUCH_MAX, armCount, shapeClassOf } from "../../../game/patch-cells";
import { darkPullPrice, type RunAction } from "../../../game/run-reducer";
import type { RunState } from "../../../game/save";
import { Chip, Stripe } from "../kp-ui";

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
    push(el("p", `kp-dnet-line ${cls ?? ""}`.trim(), text));
  const gap = (): void => {
    push(el("i", "kp-dnet-gap"));
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
      const n = line("kp-dnet-sys", `${label} `);
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
      const row = el("div", "kp-dnet-pouchrow kp-pouch-row2");
      for (let i = 0; i < PATCH_POUCH_MAX; i++) {
        if (i < pouch.length) {
          const slot = el("span", "kp-pouch-slot");
          slot.appendChild(glyphSvg(pouch[i], 20));
          row.appendChild(slot);
        } else {
          row.appendChild(el("span", "kp-pouch-slot empty"));
        }
      }
      row.appendChild(el("i", "kp-dnet-pouchtag", `POUCH ${pouch.length}/${PATCH_POUCH_MAX}`));
      push(row);
    });
  };

  const banner = (): void => {
    instant(() => {
      const ban = el("div", reduced ? "kp-dnet-banner" : "kp-dnet-banner kp-dnet-banner-glitch");
      const mark = el("span", "kp-dnet-mark");
      mark.appendChild(chevMark(5));
      ban.appendChild(mark);
      const col = el("div");
      col.appendChild(el("div", "kp-dnet-word", "DARKNET"));
      col.appendChild(el("span", "kp-dnet-wordtag", "SALVAGE EXCHANGE // NO NAMES ON FILE"));
      ban.appendChild(col);
      push(ban);
    });
  };

  const vendorGreeting = (): void => {
    typeLine("kp-dnet-ven", "Salvage off a hundred dead machines, sorted by nobody.", 14);
    typeLine("kp-dnet-dim", "type HELP for trades, or click one below.", 18);
    instant(() => {
      hooks.setRoute("SCRAMBLED", false);
      setLive(true);
    });
  };

  const cmdHelp = (): void => {
    const r = hooks.runRef.current;
    const price = r ? darkPullPrice(r) : 0;
    instant(() => {
      const box = el("div", "kp-dnet-help");
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
    typeLine("kp-dnet-ven", "Tonight, same as every night. One crate.", 15);
    instant(() => {
      const card = el("div", "kp-dnet-card kp-frame-ticks");
      card.appendChild(el("i", "kp-tick2"));
      card.appendChild(el("span", "kp-dnet-cardtag", "TONIGHT ONLY"));
      const cell = el("div", "kp-dnet-cell");
      cell.appendChild(el("span", "kp-dnet-q", "?"));
      cell.appendChild(el("i", "kp-dnet-cellsweep"));
      card.appendChild(cell);
      const rows = el("div", "kp-dnet-cardrows");
      rows.appendChild(datarow("ITEM", "PATCH PIECE"));
      rows.appendChild(datarow("SHAPE", "UNSORTED"));
      rows.appendChild(datarow("PRICE", `${price} CR`));
      rows.appendChild(datarow("STOCK", "A CRATE FULL"));
      card.appendChild(rows);
      push(card);
    });
    typeLine("kp-dnet-ven", "Pay first. Shape is the surprise. That is the whole business model here.", 13);
  };

  const cmdBal = (): void => {
    const r = hooks.runRef.current;
    instant(() => {
      const wrap = el("div", "kp-dnet-rowbox");
      wrap.appendChild(datarow("BAL", `${r ? r.credits : 0} CR`));
      push(wrap);
    });
    typeLine("kp-dnet-ven", "It spends the same as clean money.", 15);
  };

  const cmdPouch = (): void => {
    const r = hooks.runRef.current;
    pouchStrip(r ? r.patchPouch : []);
    if (r && r.patchPouch.length >= PATCH_POUCH_MAX) {
      typeLine("kp-dnet-ven", "That is a full bag. I admire the appetite.", 15);
    }
  };

  const cmdBuy = (): void => {
    const r = hooks.runRef.current;
    if (!r || r.screen !== "upgrade") return;
    const cost = darkPullPrice(r);
    if (r.patchPouch.length >= PATCH_POUCH_MAX) {
      typeLine("kp-dnet-ven", "Dealer is not a storage locker. Pouch is full. Come back with room.", 13);
      return;
    }
    if (r.credits < cost) {
      instant(() => {
        push(el("p", "kp-dnet-warn", `// SHORT _ NEED ${cost} CR. YOU HOLD ${r.credits} CR.`));
      });
      typeLine("kp-dnet-ven", "No tab. A tab needs a name and there are no names here.", 13);
      return;
    }

    /* escrow fills, then the reducer takes the money and rolls the piece;
     * the darkBuys effect queues the reveal behind the handoff beats */
    enq((done) => {
      const row = el("div", "kp-dnet-escrow");
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
    typeLine("kp-dnet-sys", "package inbound on the wire.", 16);
  };

  /** Queued by the component when run.darkBuys ticks up: the reveal lands
   * on the mask the reducer rolled. */
  const reveal = (mask: number, buys: number, credits: number, pouch: number[]): void => {
    enq((done) => {
      const card = el("div", "kp-dnet-card kp-dnet-reveal kp-frame-ticks");
      card.appendChild(el("i", "kp-tick2"));
      card.appendChild(el("span", "kp-dnet-cardtag", "SIGNAL DROP"));
      const cell = el("div", "kp-dnet-cell");
      card.appendChild(cell);
      const rows = el("div", "kp-dnet-cardrows");
      card.appendChild(rows);
      push(card);

      const land = () => {
        cell.textContent = "";
        cell.appendChild(glyphSvg(mask, 68));
        cell.appendChild(el("i", "kp-scan-sweep"));
        if (!reduced) card.classList.add("kp-dnet-landed");
        sfx("darknetReveal", { bus: "ui" });
        const cls = shapeClassOf(mask);
        rows.appendChild(datarow("SHAPE", SHAPE_NOUN[cls]));
        rows.appendChild(datarow("ARMS", String(armCount(mask))));
        rows.appendChild(datarow("GUARANTEE", "NONE"));
        if (cls === "X") {
          push(el("p", "kp-dnet-warn", "// JACKPOT _ A CROSS. FOUR ARMS. THREE IN A HUNDRED."));
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
      "kp-dnet-ven",
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
    typeLine("kp-dnet-sys", "keys burned. session never happened.", 18);
    wait(300);
    instant(() => {
      gap();
      push(el("p", "kp-dnet-hero kp-dnet-hero-dim", "NO CARRIER"));
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
      line("kp-dnet-you", `> ${raw}`);
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
        "kp-dnet-ven",
        `The price climbs by the day. Tonight it is ${r ? darkPullPrice(r) : 0} cr. Tomorrow it is more.`,
        13,
      );
    else if (EGGS[cmd]) typeLine("kp-dnet-ven", EGGS[cmd], 15);
    else typeLine("kp-dnet-dim", "no such trade. HELP lists what there is.", 14);
  };

  /** First dial of this mount. The market state decides how far it gets. */
  const connect = (open: boolean): void => {
    hooks.setRoute("DIALING", false);
    typeLine("kp-dnet-dim", "KP/OS TERM LINK 9.2 // UNREGISTERED CHANNEL", 8);
    typeLine("kp-dnet-you", "> dial darknet.lnk", 20);
    typeLine("kp-dnet-sys", "resolving name... no such address on record.", 14);
    typeLine("kp-dnet-sys", "trying anyway.", 22);
    dotsLine("hop 1 // exchange node", "LINKED", 6, 100);
    if (!open) {
      dotsLine("hop 2 // dead relay", "dead air", 8, 150);
      wait(250);
      instant(() => {
        gap();
        push(el("p", "kp-dnet-hero", "MARKET OFFLINE."));
        sfx("darknetLinkDown", { bus: "ui" });
      });
      typeLine("kp-dnet-sys", "Signal only holds after the shop shuts. Trades resume at day close.", 14);
      instant(() => hooks.setRoute("DEAD", true));
      return;
    }
    dotsLine("hop 2 // dead relay", "LINKED", 5, 110);
    dotsLine("hop 3 // [no record]", "LINKED", 4, 120);
    typeLine("kp-dnet-sys", "crypt: keys traded. names were not.", 14);
    typeLine("kp-dnet-sys", "carrier locked at 300 baud. it is enough.", 14);
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
    typeLine("kp-dnet-sys", "signal returns. trying again.", 16);
    dotsLine("hop 2 // dead relay", "LINKED", 5, 110);
    dotsLine("hop 3 // [no record]", "LINKED", 4, 120);
    typeLine("kp-dnet-sys", "carrier locked at 300 baud. it is enough.", 14);
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
    typeLine("kp-dnet-sys", "carrier lost.", 20);
    instant(() => {
      push(el("p", "kp-dnet-hero", "MARKET OFFLINE."));
      hooks.setRoute("DEAD", true);
    });
    typeLine("kp-dnet-sys", "Signal only holds after the shop shuts. Trades resume at day close.", 14);
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
    }
  }, [run, run?.darkBuys]);

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
  /* tier-0 per the tutorial gate (darknet-cli-rate-chip): tonight's price
   * stays readable at a glance, no command required */
  const rate = open && run ? `${darkPullPrice(run)} cr` : "----";

  return (
    <div className="kp-dnet" ref={hostRef}>
      <div className="kp-dnet-strip">
        <Chip label="ROUTE" value={route.txt} crimson={route.dead} />
        <Chip label="PEER" value="NO ID" />
        <Chip label="RATE" value={rate} />
        <span key={`b${credits}`} className="kp-dnet-flash">
          <Chip label="BAL" value={`${credits} cr`} />
        </span>
        <span key={`p${pouchN}`} className="kp-dnet-flash">
          <Chip label="POUCH" value={`${pouchN}/${PATCH_POUCH_MAX}`} />
        </span>
      </div>

      <div className="kp-dnet-clip">
        <div className="kp-dnet-log" ref={logRef} role="log" aria-live="polite" />
      </div>

      <div className={promptDead ? "kp-dnet-prompt kp-dnet-prompt-dead" : "kp-dnet-prompt"}>
        <span className="kp-dnet-plabel">nobody@nowhere:~$</span>
        <span className="kp-dnet-pinput">{buf}</span>
        <span className="kp-dnet-caret" aria-hidden="true" />
      </div>

      <div className="kp-dnet-cmds">
        {TRADES.map((t) => (
          <button key={t} type="button" disabled={lock || promptDead} onClick={() => clickTrade(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="kp-dnet-foot">
        <Stripe />
        <p className="kp-rail-dim">No refunds. No complaints line. Close the window if you want a guarantee.</p>
      </div>
    </div>
  );
}
