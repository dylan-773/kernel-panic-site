import { useEffect, useState } from "react";
import { playUiPress, playUiTick } from "../../game/audio";
import { SlotSummary, slotSummaries } from "../../game/save";

/**
 * KP/OS user login: three save slots, picked from a CRT login prompt. The
 * "authentication" is pure theater: the OS types the credentials itself,
 * flashes ACCESS GRANTED, and hands the desktop over.
 */

const PASSWORD = "**********";

interface LoginState {
  slot: number;
  user: string;
  typedUser: string;
  typedPass: string;
  granted: boolean;
}

export function LoginScreen({ onLogin }: { onLogin: (slot: number) => void }) {
  const [slots, setSlots] = useState<SlotSummary[] | null>(null);
  const [login, setLogin] = useState<LoginState | null>(null);

  useEffect(() => {
    setSlots(slotSummaries());
  }, []);

  // The typing performance: username, then password, then the grant.
  useEffect(() => {
    if (!login || login.granted) return;
    const t = setTimeout(() => {
      if (login.typedUser.length < login.user.length) {
        playUiTick();
        setLogin({ ...login, typedUser: login.user.slice(0, login.typedUser.length + 1) });
      } else if (login.typedPass.length < PASSWORD.length) {
        playUiTick();
        setLogin({ ...login, typedPass: PASSWORD.slice(0, login.typedPass.length + 1) });
      } else {
        playUiPress();
        setLogin({ ...login, granted: true });
      }
    }, login.typedUser.length < login.user.length ? 70 : 45);
    return () => clearTimeout(t);
  }, [login]);

  useEffect(() => {
    if (!login?.granted) return;
    const t = setTimeout(() => onLogin(login.slot), 900);
    return () => clearTimeout(t);
  }, [login?.granted, login?.slot, onLogin]);

  const pick = (slot: number) => {
    if (login) return;
    playUiPress();
    setLogin({
      slot,
      user: `user_0${slot}`,
      typedUser: "",
      typedPass: "",
      granted: false,
    });
  };

  return (
    <div className="kp-login">
      <div className="kp-login-head">
        <pre className="kp-boot-mark" aria-hidden="true">
          {"KERNEL PANIC"}
        </pre>
        <p className="kp-login-sub">KP/OS v9.2 - SELECT USER</p>
      </div>

      {!login && (
        <div className="kp-login-slots">
          {(slots ?? []).map((s, i) => (
            <button
              key={s.slot}
              type="button"
              className={s.empty ? "kp-slot kp-slot-empty" : "kp-slot"}
              style={{ animationDelay: `${i * 120}ms` }}
              onClick={() => pick(s.slot)}
            >
              {s.empty ? (
                <>
                  <span className="kp-slot-plus" aria-hidden="true">
                    +
                  </span>
                  <strong>NEW USER</strong>
                  <span className="kp-slot-line">empty slot</span>
                </>
              ) : (
                <>
                  <span className="kp-slot-avatar" aria-hidden="true">
                    {s.machineOpened ? ":)" : ">_"}
                  </span>
                  <strong>USER 0{s.slot}</strong>
                  <span className="kp-slot-line">
                    {s.machineOpened
                      ? "machine opened"
                      : s.day !== null
                        ? `attempt ${s.runCount} - day ${s.day} - strain ${s.strain}`
                        : `${s.runCount} attempt${s.runCount === 1 ? "" : "s"} logged`}
                  </span>
                  <span className="kp-slot-line kp-slot-dim">{s.unlocked}/24 routines</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {login && (
        <div className="kp-login-term">
          <p>
            <span className="kp-login-label">USERNAME:</span> {login.typedUser}
            {login.typedUser.length < login.user.length && <span className="kp-boot-cursor">_</span>}
          </p>
          {login.typedUser.length >= login.user.length && (
            <p>
              <span className="kp-login-label">PASSWORD:</span> {login.typedPass}
              {!login.granted && login.typedPass.length < PASSWORD.length && (
                <span className="kp-boot-cursor">_</span>
              )}
            </p>
          )}
          {login.granted && <p className="kp-login-granted">ACCESS GRANTED. WELCOME BACK.</p>}
        </div>
      )}

      <div className="kp-crt" aria-hidden="true" />
    </div>
  );
}
