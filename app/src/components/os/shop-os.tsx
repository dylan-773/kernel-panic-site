import { useEffect, useState, type ReactNode } from "react";
import { playMusic, sfx, testBeep } from "../../game/audio";
import { tip } from "../../game/content/teaching";
import type { DayAction, GameState } from "../../game/day-reducer";
import { WEEKDAYS, weekdayOf } from "../../game/save";
import { Dock, DockIcon } from "./icons";
import { KpMark } from "./kp-ui";
import { Ticker, WallReg, WallScope } from "./desk";
import { FloatingWindow, WindowManager, WinDef } from "./wm";
import { WIN_DEFS } from "./win-defs";
import { InboxContent } from "./windows/inbox";
import { ReportContent } from "./windows/report";
import { LoadoutContent } from "./windows/loadout";
import { SolderContent } from "./windows/solder";
import { NightContent } from "./windows/night";
import { ManualContent } from "./windows/manual";
import { DadlogContent } from "./windows/dadlog";
import { LedgerContent } from "./windows/ledger";
import { DarknetContent } from "./windows/darknet";

/**
 * KP/OS: the bench terminal, seen only while seated. The shell owns the
 * game state, the window manager and the theme, so standing up costs
 * nothing: the windows are where you left them when you sit back down.
 * The glass is this terminal's physical surface; it arrived with the
 * camera and it leaves with it. The room outside has none.
 */

const STRAIN_ALARM_AT = 35;

/** The six glass layers of law 6. FLAT and OFF are the only modes. */
function Glass() {
  return (
    <div className="ds-glass" aria-hidden="true">
      <i className="g-scan" />
      <i className="g-mask" />
      <i className="g-bloom" />
      <i className="g-spec" />
      <i className="g-vig" />
      <i className="g-bezel" />
    </div>
  );
}

/** Which window fronts each phase when the player sits down. */
function phaseOwner(phase: string | null): string | null {
  switch (phase) {
    case "open":
      return "inbox";
    case "result":
      return "report";
    case "evening":
      return "night";
    default:
      return null;
  }
}

export function ShopOS({
  state,
  dispatch,
  slot,
  wm,
  crt,
  onCrtToggle,
  themeLabel,
  onThemeNext,
  onStandUp,
  onLogout,
}: {
  state: GameState;
  dispatch: (a: DayAction) => void;
  slot: number;
  wm: WindowManager;
  crt: "flat" | "off";
  onCrtToggle: () => void;
  themeLabel: string;
  onThemeNext: () => void;
  onStandUp: () => void;
  onLogout: () => void;
}) {
  const { meta, shop, day } = state;
  const [startOpen, setStartOpen] = useState(false);
  const phase = day?.phase ?? null;

  // Every phase transition surfaces the window that owns it; the other
  // flow-set windows step aside so exactly one fronts the loop.
  useEffect(() => {
    const owner = phaseOwner(phase);
    if (!owner) return;
    wm.open(owner);
    for (const other of ["inbox", "report", "night"]) {
      if (other !== owner && wm.isOpen(other)) wm.close(other);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!shop || !day) return null;

  const openTicket = day.ticket ? 1 : 0;

  const topId = wm.openIds.reduce(
    (top, id) => (wm.zIndexOf(id) > wm.zIndexOf(top) ? id : top),
    wm.openIds[0] ?? "",
  );

  const winContent = (id: string): ReactNode => {
    switch (id) {
      case "inbox":
        return <InboxContent state={state} dispatch={dispatch} onConfigureKit={() => wm.open("loadout")} />;
      case "report":
        return day.lastResult ? (
          <ReportContent state={state} dispatch={dispatch} />
        ) : (
          <p className="kp-rail-dim kp-float-pad">NO REPAIR ON FILE. CLEAR A TICKET TO GENERATE A LOG.</p>
        );
      case "loadout":
        return <LoadoutContent state={state} dispatch={dispatch} onOpenSolder={() => wm.open("solder")} />;
      case "solder":
        return shop.repairs.includes("solderBay") ? (
          <SolderContent state={state} dispatch={dispatch} />
        ) : (
          <p className="kp-rail-dim kp-float-pad">
            NO SIGNAL FROM THE BAY. THE PHYSICAL BENCH DOWNSTAIRS IS BROKEN; REPAIR IT AND THIS
            WINDOW COMES ALIVE.
          </p>
        );
      case "night":
        return phase === "evening" ? (
          <NightContent state={state} dispatch={dispatch} onOpenDarknet={() => wm.open("darknet")} />
        ) : (
          <p className="kp-rail-dim kp-float-pad">
            THE SHOP IS OPEN. NIGHT.SYS WAKES AFTER CLOSE, WHEN THE HAUL IS BANKED AND THE
            EVENING IS YOURS TO SPEND.
          </p>
        );
      case "manual":
        return <ManualContent />;
      case "journal":
        return <DadlogContent shop={shop} meta={meta} />;
      case "ledger":
        return shop.repairs.includes("ledgerTerminal") ? (
          <LedgerContent meta={meta} shop={shop} day={day} />
        ) : (
          <p className="kp-rail-dim kp-float-pad">
            THE LEDGER TERMINAL BOOTS TO A CURSOR AND NOTHING ELSE. IT IS A REPAIR, DOWNSTAIRS,
            LIKE EVERYTHING ELSE HE LEFT.
          </p>
        );
      case "darknet":
        return <DarknetContent state={state} dispatch={dispatch} onExit={() => wm.close("darknet")} />;
      default:
        return null;
    }
  };

  return (
    <div className={crt === "flat" ? "kp-os kp-crt-on" : "kp-os"}>
      <div className="kp-wallpaper" aria-hidden="true">
        <i className="kp-dither" />
      </div>
      <WallReg />
      <WallScope day={shop.day} />
      <main className="kp-os-desk">
        {WIN_DEFS.map((def: WinDef) => {
          if (!wm.isOpen(def.id)) return null;
          const pos = wm.posOf(def.id);
          return (
            <FloatingWindow
              key={def.id}
              def={{ ...def, x: pos?.x, y: pos?.y }}
              z={wm.zIndexOf(def.id)}
              focused={topId === def.id}
              closable
              onClose={() => wm.close(def.id)}
              onFocus={() => wm.focus(def.id)}
              onMove={(x, y) => wm.move(def.id, x, y)}
            >
              {winContent(def.id)}
            </FloatingWindow>
          );
        })}
      </main>

      <header className="kp-taskbar">
        <button
          type="button"
          className={startOpen ? "kp-task-mark kp-task-mark-open" : "kp-task-mark"}
          onClick={() => setStartOpen((v) => !v)}
        >
          <KpMark cell={2} sliceMono />
          KP/OS
        </button>
        {startOpen && (
          <div className="kp-startmenu">
            <span className="kp-startmenu-user">USER 0{slot}</span>
            <button
              type="button"
              onClick={() => {
                sfx("tick", { bus: "ui" });
                dispatch({ type: "toggleMusic" });
              }}
            >
              MUSIC {meta.music ? "ON" : "OFF"}
            </button>
            <button type="button" onClick={() => testBeep()}>
              TEST SOUND
            </button>
            <button
              type="button"
              onClick={() => {
                sfx("hueSwap", { bus: "ui" });
                onThemeNext();
              }}
            >
              THEME: {themeLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                sfx("tick", { bus: "ui" });
                onCrtToggle();
              }}
            >
              CRT: {crt === "flat" ? "FLAT" : "OFF"}
            </button>
            <button
              type="button"
              onClick={() => {
                sfx("press", { bus: "ui" });
                void playMusic(null);
                setStartOpen(false);
                onLogout();
              }}
            >
              LOG OUT
            </button>
            <button
              type="button"
              onClick={() => {
                sfx("tick", { bus: "ui" });
                setStartOpen(false);
              }}
            >
              CLOSE
            </button>
          </div>
        )}
        <div className="kp-task-chips">
          <span className="kp-chip-pct">
            <span>USER</span>
            <em>0{slot}</em>
          </span>
          <span className="kp-chip-pct">
            <span>{WEEKDAYS[weekdayOf(shop.day)]}</span>
            <em>DAY {shop.day}</em>
          </span>
          <span
            className={
              day.strain <= STRAIN_ALARM_AT
                ? "kp-chip-pct ds-strain ds-strain-alarm"
                : "kp-chip-pct ds-strain"
            }
          >
            <span>STRAIN</span>
            <em>{day.strain}</em>
            {day.strain <= STRAIN_ALARM_AT && <i className="ds-riskflash" aria-hidden="true" />}
          </span>
          <span className="kp-chip-pct">
            <span>CR</span>
            <em>{shop.credits}</em>
          </span>
          <span className="kp-chip-pct">
            <span>SALVAGE</span>
            <em>{shop.salvage}</em>
          </span>
          {(day.held.credits > 0 || day.held.salvage > 0) && (
            <span className="kp-chip-pct">
              <span>HELD</span>
              <em>
                {day.held.credits}cr{day.held.salvage > 0 ? ` ${day.held.salvage}sv` : ""}
              </em>
            </span>
          )}
        </div>
        <Ticker meta={meta} />
        <button
          type="button"
          className="kp-task-btn"
          onClick={() => {
            sfx("press", { bus: "ui" });
            onStandUp();
          }}
        >
          STAND UP
        </button>
        <button
          type="button"
          className="kp-task-btn"
          onClick={() => {
            sfx("tick", { bus: "ui" });
            dispatch({ type: "toggleSound" });
          }}
        >
          SND {meta.sound ? "ON" : "OFF"}
        </button>
      </header>

      <Dock>
        <DockIcon
          label="INBOX"
          icon="inbox"
          order={0}
          running={wm.isOpen("inbox")}
          badge={openTicket > 0 ? openTicket : undefined}
          onOpen={() => wm.open("inbox")}
        />
        <DockIcon label="LOADOUT.CFG" icon="loadout" order={1} running={wm.isOpen("loadout")} onOpen={() => wm.open("loadout")} />
        <DockIcon label="SOLDER.BAY" icon="solder" order={2} running={wm.isOpen("solder")} onOpen={() => wm.open("solder")} />
        <DockIcon label="REPAIR.LOG" icon="report" order={3} running={wm.isOpen("report")} onOpen={() => wm.open("report")} />
        <DockIcon label="NIGHT.SYS" icon="night" order={4} running={wm.isOpen("night")} onOpen={() => wm.open("night")} />
        <DockIcon label="DAD.LOG" icon="journal" order={5} running={wm.isOpen("journal")} onOpen={() => wm.open("journal")} />
        <DockIcon label="MANUAL.TXT" icon="manual" order={6} running={wm.isOpen("manual")} hint={tip("manualRef")} onOpen={() => wm.open("manual")} />
        <DockIcon label="LEDGER.LOG" icon="ledger" order={7} running={wm.isOpen("ledger")} onOpen={() => wm.open("ledger")} />
        <DockIcon
          label="DARKNET.LNK"
          icon="darknet"
          order={8}
          running={wm.isOpen("darknet")}
          hint="Gray-market patch pieces, no questions asked. Answers after the shop closes, through the repaired router."
          onOpen={() => wm.open("darknet")}
        />
      </Dock>
      {crt === "flat" && <Glass />}
    </div>
  );
}
