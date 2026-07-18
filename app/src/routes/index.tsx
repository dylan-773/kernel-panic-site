import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TYPE_META } from "../game/copy";
import { EMPTY_PROGRESS, Progress, levelFromXp, loadProgress, saveProgress } from "../game/progress";
import { DIVE_TYPES, DiveType } from "../game/types";

export const Route = createFileRoute("/")({
  component: Index,
});

const PORT_LABELS: Record<DiveType, string> = {
  hardware: "PORT A",
  network: "PORT B",
  data: "PORT C",
  software: "PORT D",
};

function useLedger(): [Progress, boolean, () => void] {
  const [ledger, setLedger] = useState<Progress>(EMPTY_PROGRESS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setLedger(loadProgress());
    setReady(true);
  }, []);
  const reset = () => {
    if (typeof window !== "undefined" && window.confirm("Wipe the shop ledger and start over?")) {
      saveProgress({ ...EMPTY_PROGRESS });
      setLedger({ ...EMPTY_PROGRESS });
    }
  };
  return [ledger, ready, reset];
}

function BaySchematic({ type }: { type: DiveType }) {
  switch (type) {
    case "hardware":
      return (
        <svg viewBox="0 0 150 84" className="kp-schematic" aria-hidden="true">
          <path d="M18 42 H58 M58 42 H92 M58 42 V20 H92 M92 20 V34" className="kp-sch-trace" />
          <path d="M18 42 V64 H50" className="kp-sch-trace kp-sch-dim" />
          <rect x="10" y="34" width="16" height="16" rx="3" className="kp-sch-port" />
          <rect x="84" y="34" width="16" height="16" rx="2" transform="rotate(45 92 42)" className="kp-sch-and" />
          <path d="M104 42 H132" className="kp-sch-trace" />
          <polygon points="140,42 136,48 128,48 124,42 128,36 136,36" className="kp-sch-core" />
          <path d="M44 56 L50 64 L44 72 M56 56 L50 64 L56 72" className="kp-sch-jam" />
        </svg>
      );
    case "network":
      return (
        <svg viewBox="0 0 150 84" className="kp-schematic" aria-hidden="true">
          <path d="M14 24 H44 V42 H66" className="kp-sch-trace" />
          <path d="M136 60 H112 V42 H94" className="kp-sch-adv" />
          <rect x="6" y="16" width="16" height="16" rx="3" className="kp-sch-port" />
          <rect x="128" y="52" width="16" height="16" rx="3" className="kp-sch-port kp-sch-port-adv" />
          <polygon points="82,42 78,48 70,48 66,42 70,36 78,36" className="kp-sch-core" />
          <circle cx="94" cy="42" r="4" className="kp-sch-advhead" />
        </svg>
      );
    case "data":
      return (
        <svg viewBox="0 0 150 84" className="kp-schematic" aria-hidden="true">
          <path d="M14 42 H52 V22 H84 M84 22 V42 H120" className="kp-sch-trace" />
          <rect x="6" y="34" width="16" height="16" rx="3" className="kp-sch-port" />
          <polygon points="84,50 91,54 91,62 84,66 77,62 77,54" className="kp-sch-frag" />
          <polygon points="52,58 55,64 61,66 55,68 52,74 49,68 43,66 49,64" className="kp-sch-corrupt" />
          <polygon points="128,42 124,48 116,48 112,42 116,36 124,36" className="kp-sch-core" />
        </svg>
      );
    case "software":
      return (
        <svg viewBox="0 0 150 84" className="kp-schematic" aria-hidden="true">
          <path d="M14 42 H48 M48 42 V22 H84 M48 42 V62 H84 M84 62 H120" className="kp-sch-trace" />
          <rect x="6" y="34" width="16" height="16" rx="3" className="kp-sch-port" />
          <circle cx="84" cy="22" r="9" className="kp-sch-bug" />
          <text x="84" y="26" className="kp-sch-bugnum">
            1
          </text>
          <circle cx="120" cy="62" r="9" className="kp-sch-bug" />
          <text x="120" y="66" className="kp-sch-bugnum">
            2
          </text>
        </svg>
      );
  }
}

function Index() {
  const [ledger, ready, reset] = useLedger();

  return (
    <div className="kp-hub">
      <header className="kp-topbar">
        <div className="kp-wordmark">
          <svg viewBox="0 0 24 24" className="kp-mark" aria-hidden="true">
            <path d="M4 12 H10 M10 12 V5 H17 M10 12 V19 H14" className="kp-mark-trace" />
            <rect x="2" y="10" width="4" height="4" rx="1" className="kp-mark-port" />
            <circle cx="19" cy="5" r="2.4" className="kp-mark-node" />
            <circle cx="16" cy="19" r="2.4" className="kp-mark-node kp-mark-node-rose" />
          </svg>
          <span>KERNEL PANIC</span>
        </div>
        <div className="kp-topbar-right">
          <span className="kp-credits">{ready ? `${ledger.credits} cr` : "syncing"}</span>
        </div>
      </header>

      <main>
        <section className="kp-hero">
          <div className="kp-hero-copy">
            <h1>The bench is yours now.</h1>
            <p>
              Your father's repair shop, your name on the ledger. Customers bring in broken
              machines. You dive inside and route the signal home. Four kinds of broken, four
              different dives, one grid engine.
            </p>
            <div className="kp-hero-ctas">
              <a href="#bays" className="kp-cta-primary">
                Open the bench
              </a>
              <a href="#engine" className="kp-cta-ghost">
                How dives work
              </a>
            </div>
          </div>
          <figure className="kp-hero-visual">
            <div className="kp-hero-frame">
              <img
                src="/assets/backroom.jpg"
                alt="The shop's back room: a padlocked tower of salvaged machines with one screen awake"
                width={1264}
                height={848}
              />
              <figcaption>The back room. The machine he never let you touch.</figcaption>
            </div>
          </figure>
        </section>

        <section id="bays" className="kp-bays">
          <div className="kp-section-head">
            <h2>Diagnostic bays</h2>
            <p>
              Each bay runs one problem class with its own rules, its own stat, and its own pay.
              Pick a port and dive.
            </p>
          </div>
          <div className="kp-bay-grid">
            {DIVE_TYPES.map((type) => {
              const meta = TYPE_META[type];
              const lv = levelFromXp(ledger.xp[type]);
              return (
                <Link
                  key={type}
                  to="/dive/$type"
                  params={{ type }}
                  className={`kp-bay kp-bay-${type}`}
                >
                  <div className="kp-bay-top">
                    <span className="kp-bay-port">{PORT_LABELS[type]}</span>
                    <span className="kp-stat-chip">{meta.stat}</span>
                  </div>
                  <h3>{meta.name}</h3>
                  <p className="kp-bay-tag">{meta.tag}</p>
                  <BaySchematic type={type} />
                  <div className="kp-bay-foot">
                    <div className="kp-bay-level">
                      <span>
                        {ready
                          ? `LV ${lv.level} · ${ledger.clears[type]} ${ledger.clears[type] === 1 ? "repair" : "repairs"}`
                          : "LV syncing"}
                      </span>
                      <div className="kp-meter kp-meter-xp">
                        <div
                          className="kp-meter-fill"
                          style={{
                            width: ready ? `${Math.min(100, (lv.into / lv.span) * 100)}%` : "0%",
                          }}
                        />
                      </div>
                    </div>
                    <span className="kp-bay-enter">
                      Enter bay <span aria-hidden="true">{">"}</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section id="engine" className="kp-engine">
          <div className="kp-section-head">
            <h2>One engine, four layers</h2>
          </div>
          <ol className="kp-steps">
            <li>
              <h3>Route</h3>
              <p>
                Tap junctions to rotate them. Signal flows from the intake port through every
                connected arm, live, as you work.
              </p>
            </li>
            <li>
              <h3>Survive the layer</h3>
              <p>
                Dual gates and jams, a racing intruder, corrupted sectors, hidden bugs on a crash
                timer. Same grid, different problem.
              </p>
            </li>
            <li>
              <h3>Collect</h3>
              <p>
                Every completed repair pays credits and XP at the same time. Failure costs the
                payout and leaves an angry customer, never a game over.
              </p>
            </li>
          </ol>
        </section>

        <section className="kp-ledger">
          <div className="kp-section-head">
            <h2>Shop ledger</h2>
            <p>Progress lives in this browser. Wipe it any time.</p>
          </div>
          <div className="kp-ledger-grid">
            <div className="kp-ledger-credits">
              <span className="kp-ledger-label">Credits</span>
              <strong>{ready ? ledger.credits : 0}</strong>
            </div>
            {DIVE_TYPES.map((type) => {
              const lv = levelFromXp(ledger.xp[type]);
              return (
                <div key={type} className="kp-ledger-row">
                  <span className="kp-ledger-label">
                    {TYPE_META[type].stat}
                    <em>LV {ready ? lv.level : 1}</em>
                  </span>
                  <div className="kp-meter kp-meter-xp">
                    <div
                      className="kp-meter-fill"
                      style={{
                        width: ready ? `${Math.min(100, (lv.into / lv.span) * 100)}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="kp-wipe" onClick={reset}>
            Reset progress
          </button>
        </section>
      </main>

      <footer className="kp-footer">
        <p>Kernel Panic. A playable prototype of the dive system: four puzzle types, one signal.</p>
        <p className="kp-footer-dim">
          Prototype build for the Kernel Panic game design document. Best played with sound on.
        </p>
      </footer>
    </div>
  );
}
