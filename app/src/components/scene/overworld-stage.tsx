import { useEffect, useRef } from "react";
import type { OverworldBridge } from "../../game/overworld/bridge";
import type { OverworldHandles } from "../../game/overworld/scene";

/**
 * The Phaser mount. The engine is loaded dynamically inside an effect so
 * the module never evaluates during SSR (vite bundles every dep into the
 * Worker; a top-level Phaser import would touch window at boot). The game
 * instance survives for the life of the shell: sitting at the bench hides
 * this stage, it never unmounts it, so the room is exactly as you left it
 * when you stand back up.
 */
export function OverworldStage({ bridge }: { bridge: OverworldBridge }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<OverworldHandles | null>(null);

  useEffect(() => {
    let dead = false;
    const host = hostRef.current;
    if (!host) return;
    void (async () => {
      const [{ default: Phaser }, { bootOverworld }] = await Promise.all([
        import("phaser"),
        import("../../game/overworld/scene"),
      ]);
      if (dead) return;
      handleRef.current = bootOverworld(Phaser, host, bridge);
    })();
    return () => {
      dead = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // The bridge identity is stable for the life of the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="ow-stage" aria-label="The shop" />;
}
