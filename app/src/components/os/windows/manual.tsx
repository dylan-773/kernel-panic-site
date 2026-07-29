import { useState } from "react";
import { sfx } from "../../../game/audio";
import {
  ATTACK_MODE_LABEL,
  AUGMENTS,
  AUGMENT_BY_ID,
  DEFEND_MODE_LABEL,
  attackModeDesc,
  defendModeDesc,
  scanDesc,
} from "../../../game/content/kit";
import { PATCH_POUCH_MAX } from "../../../game/patch-cells";
import { Btn, Chip, Hero, Stripe } from "../kp-ui";

/**
 * MANUAL.TXT: five tabs over a fixed frame, hero letterhead per tab,
 * PREV/NEXT + N/5 chip, page-flip on every switch. Copy is the shipped
 * manual text verbatim; AUGMENTS packs its cards in column flow.
 */

const TABS = ["DIVE", "KIT", "PATCHES", "AUGMENTS", "BAYS"] as const;
type Tab = (typeof TABS)[number];

function Ability({ name, tag, desc, req }: { name: string; tag: string; desc: string; req?: string }) {
  return (
    <div className="kp-manual-ability">
      <strong>
        {name}
        <em>{tag}</em>
      </strong>
      <p>{desc}</p>
      {req && <p className="kp-aug-req">{req}</p>}
    </div>
  );
}

function PageFor({ tab }: { tab: Tab }) {
  if (tab === "DIVE") {
    return (
      <div className="kp-manual-page">
        <h3>HOW A DIVE WORKS</h3>
        <p>
          The whole grid is scrambled junctions. Click one to rotate it a quarter turn (1 RAM). Your
          signal floods live from YOUR port through every aligned pipe and claims what it touches.
          One good rotation can cascade a whole chain. First flood to touch the CORE wins the job.
        </p>
        <p>
          You can rotate your own claimed junctions and any open junction within TWO steps of your
          territory: set up a chain, then trip it. Cascades of four or more claims BANK bonus RAM for
          your next turn. The intrusion floods from the far port under the same rules, on its own
          RAM. Losing a duel zeroes Neural Strain and ends the run. Sloppy wins chip it.
        </p>
      </div>
    );
  }
  if (tab === "KIT") {
    return (
      <div className="kp-manual-page">
        <h3>THE KIT: three programs, 1 RAM, once per turn each</h3>
        <div className="kp-manual-abilities">
          <Ability
            name="SCAN.EXE"
            tag="always 1 RAM"
            desc={`${scanDesc(1)} Upgrades widen the sweep. Scan before you walk; every trap it finds stays found.`}
          />
          <Ability
            name="ATTACK.EXE"
            tag="configurable"
            desc={`${ATTACK_MODE_LABEL.redirect}: ${attackModeDesc("redirect", 1)} ${ATTACK_MODE_LABEL.armHalt}: ${attackModeDesc("armHalt", 1)} ${ATTACK_MODE_LABEL.armSiphon}: ${attackModeDesc("armSiphon", 1)} Upgrades hit more nodes per cast.`}
          />
          <Ability
            name="DEFEND.EXE"
            tag="configurable"
            desc={`${DEFEND_MODE_LABEL.purge}: ${defendModeDesc("purge", 1)} ${DEFEND_MODE_LABEL.lock}: ${defendModeDesc("lock", 1)} ${DEFEND_MODE_LABEL.ward}: ${defendModeDesc("ward", 1)} Upgrades cover more nodes per cast.`}
          />
        </div>
      </div>
    );
  }
  if (tab === "PATCHES") {
    return (
      <div className="kp-manual-page">
        <div className="kp-manual-diagram">
          <span className="kp-photo-cell-full">
            <img
              src="/assets/px/window/solder-bench.png"
              alt=""
              width={304}
              height={304}
              style={{ width: 180, height: 128, objectFit: "cover", objectPosition: "50% 40%" }}
            />
          </span>
        </div>
        <h3>PATCH PIECES</h3>
        <p>
          Slag blocks used to take a flat cell. Now they take a shaped piece: straight, elbow, tee,
          or cross. Whatever arms a piece rolls on pickup are the arms it keeps, nothing rotates
          once it is in your pouch, and a placed piece is welded where it lands.
        </p>
        <p>
          Craft two pieces at the bench into the union of their arms. Legal only when the result is
          strictly bigger than both pieces you started with; equal or smaller, the bench will not
          make the join.
        </p>
        <p>
          Three ways into the pouch: buy blind off the darknet, pull one from a cleared job, or bank
          a random piece on a clean win. {PATCH_POUCH_MAX} pieces, pouch capped.
        </p>
      </div>
    );
  }
  if (tab === "AUGMENTS") {
    return (
      <div className="kp-manual-page">
        <div className="kp-aug-3col">
          {AUGMENTS.map((a) => (
            <Ability
              key={a.id}
              name={a.name}
              tag={a.kind === "config" ? "config" : "boost"}
              desc={a.desc}
              req={
                a.requires?.kind === "augment"
                  ? `Needs ${AUGMENT_BY_ID[a.requires.id]?.name ?? a.requires.id}.`
                  : a.requires?.kind === "pouch"
                    ? "Needs a piece in the pouch."
                    : undefined
              }
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="kp-manual-page">
      <h3>BOOST BAYS</h3>
      <p>
        Boosts install into bays, three of them to start. Configs are not boosts and never count
        against the cap.
      </p>
      <p>
        A full bay does not block a new boost, it swaps one: take the drop or keep what is already
        installed. Buy more bays at day close. First one runs 150 cr, the next 300.
      </p>
      <p className="kp-rail-dim">
        Every cleared job offers a draft of augments; every closed day offers +1 RAM or a program
        tier. Everything resets when the run ends. Only you remember.
      </p>
    </div>
  );
}

export function ManualContent() {
  const [active, setActive] = useState<Tab>("DIVE");
  const [flip, setFlip] = useState(0);
  const idx = TABS.indexOf(active);

  const nav = (t: Tab | undefined) => {
    if (!t || t === active) return;
    sfx("pageFlip", { bus: "ui" });
    setActive(t);
    setFlip((f) => f + 1);
  };

  return (
    <div className="kp-manual">
      <div className="kp-manual-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={t === active ? "kp-manual-tab kp-tab-on" : "kp-manual-tab"}
            onClick={() => nav(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <Stripe style={{ "--stripe": "var(--kp-line)" } as React.CSSProperties} />
      <div
        key={flip}
        className={`kp-manual-frame ${active === "AUGMENTS" ? "kp-manual-dense" : ""} ${flip > 0 ? "kp-page-flip" : ""}`.trim()}
      >
        <Hero text={active} className="kp-manual-hero" />
        <PageFor tab={active} />
      </div>
      <div className="kp-manual-foot">
        <Btn label="PREV" variant="ghost" disabled={idx <= 0} onClick={() => nav(TABS[idx - 1])} />
        <Btn label="NEXT" variant="ghost" disabled={idx >= TABS.length - 1} onClick={() => nav(TABS[idx + 1])} />
        <Chip label="PAGE" value={`${idx + 1}/${TABS.length}`} />
      </div>
    </div>
  );
}
