# Kernel Panic — design brief (final GDD build)

The screen is the shop's computer. The whole site boots into KP/OS, a
retro-futuristic pixel desktop: BIOS boot text, one chunky window, a taskbar,
scanline CRT overlay. No marketing page exists; the game is the page.

## Direction

- Retro-futuristic pixel art. Raster assets (portraits, stills, wallpaper)
  are AI-generated to a locked palette and rendered `image-rendering:
  pixelated`; UI chrome, icons, and the duel board are code-drawn with hard
  edges (`crispEdges`, stepped `steps()` animations, no border-radius).
- Palette is the committed `--kp-*` token block in `styles.css`: ink slate
  ground, bone text, one rose accent, filament-white player signal, crimson
  intrusion, gold payload, steel chrome. Every generated KP/OS asset embeds
  these hexes in its prompt.
- The overworld scene layer (room plates, state patches, walk sprites) is
  neon cyberpunk under KP-NEON/16, per the scene art law at
  `vault/40-presentation/rulings/law-12-scene-art.md`. KP/OS keeps the
  `--kp-*` tokens; the two palettes share their dark bases and rose-hot.
- Type: Silkscreen (display/chrome), VT323 (terminal body), IBM Plex Mono
  (small labels). Google Fonts, allowed by the worker CSP.
- Motion is quantized: `steps()` timing everywhere, no smooth easing. The
  CRT overlay (scanlines + vignette) sits above everything at low opacity.

## Game (matches the final GDD)

One duel mechanic: both sides race to connect their port to the center core
on a shared grid of placed, rotatable bridge nodes. Turn-based RAM economy;
eight ability verbs with ~24 config-row variants; scripted opponent with
per-day arc configs (`src/game/content/arc.ts` is the whole balance table).
Ten-day roguelike run, Neural Strain life bar, unwinnable tutorial dive,
Day 10 finale against the father's machine. Only unlocked ability options
persist between runs. All content is a static baked library; the shipped
game makes zero API calls while played.

`src/game/dev/sim.ts` (bun-runnable) is the balance instrument: a proxy
player bot plays every day config across 200 seeds and prints win rates,
duel lengths, and strain chips.
