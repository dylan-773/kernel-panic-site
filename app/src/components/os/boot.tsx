/**
 * The BIOS boot screen. This is the entire server-rendered surface: static,
 * deterministic markup with zero client state, so hydration always matches.
 * The line-by-line reveal is pure CSS animation.
 */
export function BootScreen({ onSkip }: { onSkip?: () => void }) {
  const lines = [
    "OVERBY REPAIR BENCH BIOS v9.2",
    "640K NEURAL BUFFER ... OK",
    "SIGNAL BUS ........... OK",
    "BACK ROOM LOCK ....... ENGAGED",
    "MOUNTING SHOPFRONT ...",
  ];
  return (
    <div className="kp-boot" onClick={onSkip} role={onSkip ? "button" : undefined}>
      <div className="kp-boot-inner">
        <pre className="kp-boot-mark" aria-hidden="true">
          {"KERNEL PANIC"}
        </pre>
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
