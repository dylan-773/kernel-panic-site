---
name: touch-safe-tap-tip-mechanism
description: The one long-press + inline-popover mechanism for touch-safe tips and mid-dive ability info; reuse it, do not invent a second one.
metadata:
  type: project
---

Proposed in the `teaching-2026-07-26` cycle (`pipeline/proposals/ux-agent.json`,
item `touch-safe-tooltips`) to close a cross-cutting gap: every `teach-tip` was
a plain HTML `title` and the mid-dive ability-info panel only opened on
`onMouseEnter`, so touch players could read zero reference text anywhere in
the game.

The mechanism, once the Orchestrator lands it: `components/game/tap-tip.tsx`
exports `useLongPress({ isOpen, onOpen, onClose })` (pointer/click handlers,
touch-only, 400ms hold threshold `LONG_PRESS_MS`, 10px move-cancel slop
`LONG_PRESS_SLOP_PX`, swallows the click that follows a long press via
`onClickCapture` + `stopPropagation` so the primary action is never stolen)
and `TapTip({ text, children })`, a thin wrapper rendering a `.kp-tapwrap` /
`.kp-tap-pop` popover for plain reference text. The ability-info panel
(`kp-ability-info` in duel.tsx) reuses `useLongPress` directly against its
existing lifted `infoProg` state rather than getting a second, competing
popover.

**Reuse this, do not build a second touch-tip mechanism.** If a future cycle
needs another touch-safe reveal (a new stat readout, a new hover-only panel),
wire it through `useLongPress`/`TapTip` from this file. Building a parallel
mechanism would immediately fragment the interaction model (two different
gestures meaning "show me more") which is exactly the kind of incoherence
this agent is supposed to prevent.

**Known, deliberately deferred gaps** (call these "already flagged, not new
work" if they resurface as findings): no visual affordance hints that a
control is long-press-able (discovery relies on the player finding the
gesture); no viewport-edge flipping (`kp-tap-pop` always opens below-left,
can clip near screen edges); no cross-control exclusivity under multitouch;
no haptic feedback on trigger. All four were cut specifically to keep the
first version dependency-free and to avoid redesigning the dock/ability
buttons, per that cycle's explicit constraint. Revisit only if a future
finding specifically calls one out.

**Timing choice:** 400ms hold, 10px slop. Chosen as a standard mobile
long-press threshold with no prior art in this codebase to match; no
teach-sim or player feedback yet validates this number, so treat it as a
starting point, not a locked constant, if a future pass finds it too
slow/twitchy.

See also [[kp-ui-idiom-conventions]] for the broader palette/animation rules
this mechanism reuses (kp-teach-in fade, kp-signal border, no new keyframes).
