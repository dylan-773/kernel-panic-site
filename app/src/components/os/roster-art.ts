import type { CustomerProfile } from "../../game/content/customers";

/**
 * Roster imagery for the dossier surfaces (CUSTOMER.REC card, DIVE.EXE
 * device cell, REPAIR.LOG client figure), all 1-bit dithered prints under
 * the live ink tint (art-lead batch, ui-integration-2026-07-29). Coverage
 * grows via art orders; every consumer falls back to an existing asset so
 * no cell ever renders empty.
 */

const W = "/assets/px/window";

/** Card portraits (304px 1-bit; Dex's ratified look ships at 880px). */
const CARD_PORTRAITS: Record<string, string> = {
  "juno-vex": `${W}/card-juno-vex-portrait.png`,
  "sable-okonkwo": `${W}/card-sable-okonkwo-portrait.png`,
  "aldous-wick": `${W}/card-aldous-wick-portrait.png`,
  "dex-marlowe": `${W}/card-dex-marlowe-portrait.png`,
};

export function cardPortraitFor(c: CustomerProfile): string {
  return CARD_PORTRAITS[c.id] ?? c.portrait;
}

/** Device macro art per customer (the bench's tap, shown square). */
const DEVICE_ART: Record<string, string> = {
  "juno-vex": `${W}/card-juno-vex-device.png`,
  "sable-okonkwo": `${W}/card-sable-okonkwo-device.png`,
  "aldous-wick": `${W}/card-aldous-wick-device.png`,
  "dex-marlowe": `${W}/card-dex-marlowe-device.png`,
  "wren-tallis": `${W}/card-wren-tallis-device.png`,
};

export function deviceArtFor(c: CustomerProfile): string {
  return DEVICE_ART[c.id] ?? "/assets/px/stills/still-bench.png";
}

/** Happy-client figure prints for REPAIR.LOG (162x234 1-bit). */
const FIGURE_ART: Record<string, string> = {
  "juno-vex": `${W}/figure-juno-vex.png`,
  "sable-okonkwo": `${W}/figure-sable-okonkwo.png`,
  "aldous-wick": `${W}/figure-aldous-wick.png`,
  "wren-tallis": `${W}/figure-wren-tallis.png`,
  "bram-hollander": `${W}/figure-bram-hollander.png`,
};

export function figureArtFor(c: CustomerProfile): string {
  return FIGURE_ART[c.id] ?? c.portrait;
}

/* ---------- v3 FULL COLOUR prints (RULINGS law 5) ----------
 * Cut at the exact size each cell renders, so one dither dot is one CSS
 * pixel and nothing is ever downscaled. A colourisation rather than a
 * reveal: the source art is monochrome ink, gradient-mapped through a lit
 * interior palette and Floyd-Steinberg dithered to 16 colours by
 * pipeline/tools/colourise.py.
 *
 * Coverage is partial by design. Every consumer renders the equal-footprint
 * NO PRINT ON FILE plate for a roster gap rather than substituting another
 * customer's face, so the layout never reflows on art coverage and the file
 * simply has no photo on record.
 */
const V3 = "/assets/px/window/v3";

/** CUSTOMER.REC prints, 160x160. */
const REC_ART: Record<string, string> = {
  "juno-vex": "juno",
  "sable-okonkwo": "sable",
  "aldous-wick": "aldous",
  "dex-marlowe": "dex",
};

export function recPortraitFor(c: CustomerProfile): string | null {
  const key = REC_ART[c.id];
  return key ? `${V3}/rec-${key}-portrait-color.png` : null;
}

export function recDeviceFor(c: CustomerProfile): string | null {
  const key = REC_ART[c.id];
  return key ? `${V3}/rec-${key}-device-color.png` : null;
}

/** REPAIR.LOG client figures, 201x204. */
const CLIENT_ART: Record<string, string> = {
  "juno-vex": "juno",
  "sable-okonkwo": "sable",
  "aldous-wick": "aldous",
  "bram-hollander": "bram",
};

export function clientPrintFor(c: CustomerProfile): string | null {
  const key = CLIENT_ART[c.id];
  return key ? `${V3}/client-${key}-color.png` : null;
}

export interface DeviceMacro {
  src: string;
  /** Natural size. The bezel CROPS this, never resamples it, so the img
   * must be served at exactly the size it was cut at. */
  w: number;
  h: number;
  /** Crop offsets that frame the bezel's window on the device itself. */
  top: number;
  left: number;
  /** Which law 5 treatment the cell renders. */
  feed: "color" | "ink";
}

/** DIVE.EXE device macro. The shipped cell served an 880px dither at rail
 * width, which is a browser downscale, and downscaling a dither mushes the
 * dots to grey. The bezel is loadout-eva's LIVE MONITOR mechanism instead:
 * the image at its NATIVE size inside a fixed window, cropped onto the
 * device. Colour coverage is one hero device so far; the rest fall back to
 * their 1-bit macro under the ink tint, still cropped at 1:1 rather than
 * resampled, and framed on their own centre because the colour crop's
 * offsets are specific to that one composition. */
export function deviceMacroFor(c: CustomerProfile): DeviceMacro {
  if (c.id === "dex-marlowe") {
    return { src: `${V3}/cramdeck-color.png`, w: 880, h: 880, top: -330, left: -340, feed: "color" };
  }
  if (DEVICE_ART[c.id]) {
    return { src: DEVICE_ART[c.id], w: 304, h: 304, top: -77, left: -52, feed: "ink" };
  }
  // No device print on file: the bench still is natively 316x212, so it must
  // be served at that size and centred, or the bezel resamples it.
  return { src: "/assets/px/stills/still-bench.png", w: 316, h: 212, top: -31, left: -58, feed: "ink" };
}
