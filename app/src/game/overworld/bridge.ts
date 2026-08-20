import type { RepairId } from "../content/repairs";
import type { DayPhase } from "../save";
import type { RoomId, StationId } from "./world";

/**
 * The seam between the two domains: React owns the game state and the
 * interface, Phaser owns the room. The bridge is a plain mutable object -
 * the scene READS the snapshot every frame and EMITS events upward; React
 * writes the snapshot on state change and issues imperative commands
 * (camera choreography, NPC entrances) the reducer has no business knowing
 * about. Nothing here imports Phaser: the module stays SSR-safe.
 */

export interface RoomSnapshot {
  phase: DayPhase;
  sunday: boolean;
  machineOpened: boolean;
  repairs: RepairId[];
  /** Customer profile id standing at the counter, or null. */
  waitingId: string | null;
  /** A ticket is on the spike (job accepted, not resolved). */
  hasTicket: boolean;
  attemptedBackroom: boolean;
  /** Reduced-motion preference, read once by the shell. */
  reducedMotion: boolean;
}

export type SceneEvent =
  | { type: "prompt"; station: StationId | null }
  | { type: "interact"; station: StationId }
  | { type: "roomChanged"; room: RoomId }
  | { type: "customerAtCounter" }
  | { type: "customerGone" }
  | { type: "benchZoomDone" }
  | { type: "standZoomDone" }
  | { type: "step" }
  | { type: "doorBell" }
  | { type: "ready" };

export interface SceneCommands {
  /** Camera settles into the terminal; resolves via benchZoomDone. */
  benchZoom(): void;
  /** Camera stands back up; resolves via standZoomDone. */
  standZoom(): void;
  /** Walk a customer in from the front door to the counter. */
  customerEnter(customerId: string): void;
  /** Walk the current customer out (after resolve or decline). */
  customerLeave(): void;
  /** Hard-place the player (room transitions driven by the shell). */
  teleport(room: RoomId, spawn: string): void;
  /** Freeze input and simulation (a scene overlay or the desktop is up). */
  setPaused(paused: boolean): void;
  /** Toggle the geometry debug overlay. */
  setDebug(on: boolean): void;
}

export class OverworldBridge {
  snapshot: RoomSnapshot;
  private listeners = new Set<(e: SceneEvent) => void>();
  /** Installed by the scene once it boots; no-ops until then. */
  commands: SceneCommands = {
    benchZoom() {},
    standZoom() {},
    customerEnter() {},
    customerLeave() {},
    teleport() {},
    setPaused() {},
    setDebug() {},
  };

  constructor(snapshot: RoomSnapshot) {
    this.snapshot = snapshot;
  }

  emit(e: SceneEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  subscribe(fn: (e: SceneEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
