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
