import { VERSION_LABEL } from "../../game/version";
import { KpLockup, Ticks } from "./kp-ui";

/**
 * The BIOS boot screen. This is the entire server-rendered surface: static,
 * deterministic markup with zero client state, so hydration always matches.
 * The line-by-line reveal is pure CSS animation.
 */
export function BootScreen({ onSkip }: { onSkip?: () => void }) {
  const lines = [
    // Name-free per the lore ledger (ruling 8): the family name never
    // prints on a surface the player sees before the story hands it over.
    "REPAIR BENCH BIOS v9.2",
    // Static, so it stays part of the server-rendered surface: this is the
    // one place the build stamp lands in the HTML itself.
    `KERNEL PANIC ${VERSION_LABEL}`,
    "640K NEURAL BUFFER ... OK",
    "SIGNAL BUS ........... OK",
    "BACK ROOM LOCK ....... ENGAGED",
    "MOUNTING SHOPFRONT ...",
  ];
  return (
    <div className="kp-boot" onClick={onSkip} role={onSkip ? "button" : undefined}>
      <i className="kp-boot-dither" aria-hidden="true" />
      <div className="kp-boot-inner kp-frame-ticks">
        <Ticks />
        <KpLockup cell={4} wordPx={26} />
        {lines.map((l, i) => (
          <p key={i} className="kp-boot-line" style={{ animationDelay: `${0.15 + i * 0.22}s` }}>
            {l}
          </p>
        ))}
        <p className="kp-boot-cursor" aria-hidden="true">
          _
        </p>
      </div>
      <div className="kp-crt" aria-hidden="true" />
    </div>
  );
}
