import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { sfx } from "../../game/audio";
import {
  TEACH_BY_ID,
  TeachSignals,
  TeachingMoment,
  teachFires,
} from "../../game/content/teaching";

/**
 * First sight teaching. A `<Teach>` sits inline next to the thing it
 * explains, so the callout is anchored by the DOM rather than by measuring
 * anything, and it renders at most once per player, ever.
 *
 * One rule the provider enforces: only ONE callout is ever on screen. When
 * two are eligible at the same instant the lower `order` wins and the other
 * waits for its next chance. Teaching the player two things at once is the
 * failure mode this whole layer exists to prevent.
 */

interface TeachCtx {
  taught: string[];
  activeId: string | null;
  day: number;
  register: (id: string, eligible: boolean) => void;
  mark: (id: string) => void;
}

const Ctx = createContext<TeachCtx | null>(null);

export function TeachProvider({
  taught,
  day,
  onTaught,
  children,
}: {
  taught: string[];
  /** Gates `notBeforeDay`. The opening dive is day 0 and takes no coachmarks. */
  day: number;
  onTaught: (id: string) => void;
  children: ReactNode;
}) {
  const [eligible, setEligible] = useState<string[]>([]);

  const register = useCallback((id: string, on: boolean) => {
    setEligible((prev) => {
      const has = prev.includes(id);
      if (on === has) return prev;
      return on ? [...prev, id] : prev.filter((x) => x !== id);
    });
  }, []);

  const activeId = useMemo(() => {
    let best: TeachingMoment | null = null;
    for (const id of eligible) {
      const m = TEACH_BY_ID[id];
      if (m && (!best || m.order < best.order)) best = m;
    }
    return best ? best.id : null;
  }, [eligible]);

  const value = useMemo<TeachCtx>(
    () => ({ taught, activeId, day, register, mark: onTaught }),
    [taught, activeId, day, register, onTaught],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Teach({ id, signals }: { id: string; signals?: TeachSignals }) {
  const ctx = useContext(Ctx);
  const m = TEACH_BY_ID[id];
  const eligible =
    !!ctx && !!m && !ctx.taught.includes(id) && ctx.day >= m.notBeforeDay && teachFires(m, signals ?? {});
  const register = ctx ? ctx.register : null;

  useEffect(() => {
    if (!register) return;
    register(id, eligible);
    return () => register(id, false);
  }, [id, eligible, register]);

  const showing = eligible && ctx!.activeId === id;
  useEffect(() => {
    if (showing) sfx("teachIn", { bus: "ui" });
  }, [showing]);

  if (!m || !showing) return null;
  return (
    <div className={`kp-teach kp-teach-${m.anchor}`} role="note">
      <strong className="kp-teach-title">{m.title}</strong>
      {m.lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      <button type="button" className="kp-teach-ok" onClick={() => ctx!.mark(id)}>
        GOT IT
      </button>
    </div>
  );
}
