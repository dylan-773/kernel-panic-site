# Kernel Panic, dive-system prototype: design brief

Adapted pipeline note: this build is an interactive game prototype (four playable
puzzle modes from the Kernel Panic GDD), not a scroll marketing page. Phase 1
boards are replaced by a locked visual system below plus three generated hero
assets (cover, hub backdrop, favicon). Everything else honors the craft floor.

## Design read
For a game designer evaluating the four dive mechanics; the register is a
precision instrument that feels like the shop's own diagnostic bench software.

## Concept spine
"The screen is the bench instrument." Every surface reads as the in-fiction
diagnostic client the player uses to dive into broken machines: mono readouts,
port labels, calibration ticks, schematic traces. The web page is not ABOUT the
game; it IS the shop tool.

## Delivery tier
Editorial-leaning app UI. The wow carrier is the live puzzle engine itself
(interactive SVG signal routing), not scroll cinema. Micro-motion only outside
the game board.

## Locked palette (defense: derived from the fiction, not a template reach)
- Ground: ink slate `#101218`, raised `#161a21`, panel `#1b2029`, line `#2b313d`
- Text: cool bone `#e8ebf2`, dim `#8f97a8`
- Accent (the one brand accent): signal rose `#e94f6d`, used for CTAs, focus,
  selection, and the Perception dive's bug markers
- Functional game-state colors (semantic, not brand): powered signal filament
  white `#ffe9c4` with warm glow (live current), threat crimson `#c8403f`
  (adversary and corruption), payload gold `#d9a53f` (loot and data fragments),
  steel `#9fb2cc` (hardware chrome)
- Bans respected: no near-black plus neon cyan or green, no amber-as-brand on
  black (gold appears only as a game payload state), no violet glow

## Locked type
- Display: Outfit (600 to 800, tight tracking)
- Mono: IBM Plex Mono (all readouts, labels, numbers, body chrome)
- Served from Google Fonts (already allowed by the worker CSP)

## Tier-1 technique
The interactive dive engine: a rotating-junction signal-routing board (SVG)
with live power propagation, per-mode adversarial layers, sound, and results.
It responds to user input by definition; it enacts the spine (you operate the
instrument). No passive autoplay hero.

## Section plan (hub page)
1. Bench header bar (chrome, single line)
2. Hero: split, left copy plus one CTA pair, right generated backdrop in an
   instrument frame
3. Diagnostic bays: four tiles, one per dive type, each with a distinct
   internal layout, live mini schematic, stat chip, and its own Dive CTA
4. Shared engine strip: three-step band (route, rule, payout)
5. Progress readout: credits and per-type XP persisted locally
6. Footer line
No eyebrows used anywhere (budget 2, used 0).

## Asset plan (Higgsfield generated)
- Launch cover 3:2 (gpt_image_2, brand cover system) for OG and marketplace
- Hub backdrop illustration 3:2 (the father's machine in the back room)
- Favicon mark 1:1 (circuit route glyph)
The game boards themselves are live SVG, which is the product, not placeholder.

## CTA inventory (each its own component, no shared button class)
- "Start the dive" (per-type tinted plate button with port-socket motif)
- "Open the bench" (hero primary, rose plate with power-on press state)
- "How dives work" (hero secondary, ghost bracket link)
- "Dive again" / "New grid" / "Back to bench" (result screen, socket row)
- Board chrome toggles (mute, help, reset) as instrument switches

## Copy rules honored
No em or en dashes anywhere visible. Mono chrome labels, plain functional
sentences, GDD voice for flavor text (customers and outcomes).
