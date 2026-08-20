/**
 * The walkable world: three rooms above one another in fiction, three
 * painted isometric plates in practice. The shop is downstairs, the
 * bedroom upstairs, the back room behind the doorway (ruling 15: the door
 * is open, always). All coordinates are NATIVE image pixels of each room
 * plate; the camera renders at an integer zoom so the art is never
 * resampled (the scene layer's surviving half of law 5).
 *
 * Geometry here is authored against the painted plates and verified with
 * the in-scene debug overlay (backquote). The city does not exist: there
 * is no exterior, ever. Customers arrive AT the front door and leave
 * through it; the player's world is these three rooms.
 */

export type RoomId = "shop" | "bedroom" | "backroom";

export type StationId =
  | "counter"
  | "bench"
  | "backroomDoor"
  | "stairsUp"
  | "stairsDown"
  | "bed"
  | "tower"
  | "backroomExit"
  | "solderBay"
  | "shelves"
  | "powerBox"
  | "onionRouter"
  | "diagBench"
  | "bottomDrawer"
  | "ledgerTerminal"
  | "driveRig";

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Interactable {
  id: StationId;
  /** Player stands inside this to interact. */
  zone: Rect;
  /** Where the prompt and the interaction focus anchor. */
  anchor: Vec;
  /** Draw priority when zones overlap: nearest anchor wins, ties by order. */
  order: number;
}

export interface StateOverlay {
  id: string;
  /** Drawn into the room plate once this repair is owned. */
  requires: import("../content/repairs").RepairId;
  rect: Rect;
  image: string;
}

export interface RoomDef {
  id: RoomId;
  image: string;
  width: number;
  height: number;
  /** Walkable floor polygon, native px. */
  floor: Vec[];
  /** Solid furniture (foot regions), native px. */
  obstacles: Rect[];
  /** Repaired-state patches, baked into the plate when owned. */
  stateOverlays?: StateOverlay[];
  /** Occluders: regions redrawn ABOVE actors when the actor is behind
   * them. `base` is the floor-contact line's y: an actor whose feet are
   * above (less than) base renders behind the cutout. */
  occluders: Array<Rect & { base: number }>;
  interactables: Interactable[];
  spawns: Record<string, Vec>;
}

export const ROOMS: Record<RoomId, RoomDef> = {
  shop: {
    id: "shop",
    image: "/assets/overworld/shop.png",
    width: 632,
    height: 400,
    floor: [
      { x: 97, y: 291 },
      { x: 303, y: 189 },
      { x: 352, y: 189 },
      { x: 560, y: 272 },
      { x: 614, y: 300 },
      { x: 566, y: 348 },
      { x: 348, y: 376 },
      { x: 152, y: 278 },
    ],
    obstacles: [
      { x: 62, y: 158, w: 128, h: 92 }, // the solder bay desk
      { x: 172, y: 50, w: 116, h: 136 }, // the shelves
      { x: 203, y: 183, w: 134, h: 96 }, // the counter island
      { x: 356, y: 148, w: 120, h: 104 }, // the bench: desk, terminal, rig
      { x: 398, y: 252, w: 50, h: 24 }, // the work chair
      { x: 498, y: 44, w: 134, h: 150 }, // the staircase, upper run
      { x: 542, y: 182, w: 90, h: 86 }, // the staircase, lower run
      { x: 22, y: 222, w: 128, h: 116 }, // dead stock, west corner
      { x: 470, y: 196, w: 36, h: 42 }, // the bench's side rack
      { x: 424, y: 232, w: 98, h: 54 }, // dead stock, east of the bench
      { x: 352, y: 270, w: 114, h: 82 }, // the phone desk, south east
    ],
    occluders: [
      // The hanging lamp is at ceiling height: always above actors.
      { x: 288, y: 0, w: 74, h: 110, base: 9999 },
      // The counter: an actor north of its base walks behind it.
      { x: 203, y: 176, w: 140, h: 106, base: 276 },
      // The bench desk and terminal.
      { x: 350, y: 128, w: 160, h: 136, base: 258 },
      // The solder bay desk with its lamp.
      { x: 60, y: 120, w: 134, h: 132, base: 248 },
      // The south east phone desk.
      { x: 346, y: 250, w: 124, h: 104, base: 350 },
      // The east dead stock pile.
      { x: 422, y: 232, w: 132, h: 112, base: 340 },
    ],
    stateOverlays: [
      { id: "solder-fixed", requires: "solderBay", rect: { x: 68, y: 158, w: 124, h: 88 }, image: "/assets/overworld/states/solder-fixed.png" },
      { id: "power-fixed", requires: "powerBox", rect: { x: 42, y: 140, w: 34, h: 38 }, image: "/assets/overworld/states/power-fixed.png" },
      { id: "router-fixed", requires: "onionRouter", rect: { x: 354, y: 106, w: 74, h: 40 }, image: "/assets/overworld/states/router-fixed.png" },
      { id: "shelves-fixed", requires: "shelves", rect: { x: 176, y: 55, w: 108, h: 104 }, image: "/assets/overworld/states/shelves-fixed.png" },
      { id: "drive-fixed", requires: "driveRig", rect: { x: 424, y: 228, w: 96, h: 56 }, image: "/assets/overworld/states/drive-fixed.png" },
    ],
    interactables: [
      { id: "counter", zone: { x: 196, y: 156, w: 164, h: 170 }, anchor: { x: 272, y: 240 }, order: 5 },
      { id: "bench", zone: { x: 356, y: 196, w: 128, h: 110 }, anchor: { x: 416, y: 240 }, order: 4 },
      { id: "backroomDoor", zone: { x: 284, y: 168, w: 86, h: 92 }, anchor: { x: 327, y: 150 }, order: 3 },
      { id: "stairsUp", zone: { x: 546, y: 282, w: 72, h: 58 }, anchor: { x: 578, y: 292 }, order: 6 },
      { id: "solderBay", zone: { x: 144, y: 250, w: 62, h: 54 }, anchor: { x: 150, y: 214 }, order: 7 },
      { id: "shelves", zone: { x: 170, y: 170, w: 110, h: 56 }, anchor: { x: 228, y: 150 }, order: 8 },
      { id: "powerBox", zone: { x: 150, y: 222, w: 54, h: 26 }, anchor: { x: 58, y: 165 }, order: 9 },
      { id: "onionRouter", zone: { x: 344, y: 176, w: 70, h: 56 }, anchor: { x: 385, y: 135 }, order: 10 },
      { id: "bottomDrawer", zone: { x: 440, y: 240, w: 76, h: 62 }, anchor: { x: 485, y: 262 }, order: 11 },
      { id: "ledgerTerminal", zone: { x: 196, y: 268, w: 54, h: 50 }, anchor: { x: 220, y: 252 }, order: 12 },
      { id: "driveRig", zone: { x: 428, y: 292, w: 72, h: 46 }, anchor: { x: 470, y: 262 }, order: 13 },
      { id: "diagBench", zone: { x: 350, y: 344, w: 120, h: 34 }, anchor: { x: 440, y: 292 }, order: 14 },
    ],
    spawns: {
      start: { x: 300, y: 295 },
      fromBedroom: { x: 566, y: 310 },
      fromBackroom: { x: 327, y: 205 },
      customerDoor: { x: 206, y: 306 },
      customerCounter: { x: 272, y: 300 },
    },
  },
  bedroom: {
    id: "bedroom",
    image: "/assets/overworld/bedroom.png",
    width: 440,
    height: 300,
    floor: [
      { x: 62, y: 192 },
      { x: 252, y: 96 },
      { x: 398, y: 170 },
      { x: 218, y: 288 },
    ],
    obstacles: [
      { x: 196, y: 68, w: 148, h: 108 }, // the bed
      { x: 146, y: 92, w: 58, h: 62 }, // the nightstand and lamp
      { x: 48, y: 110, w: 104, h: 100 }, // the dresser
      { x: 292, y: 120, w: 82, h: 100 }, // the unpacked boxes
      { x: 46, y: 188, w: 96, h: 96 }, // the small desk
      { x: 250, y: 196, w: 104, h: 100 }, // the stair rail cut
    ],
    occluders: [
      { x: 192, y: 52, w: 156, h: 128, base: 176 }, // the bed
      { x: 142, y: 70, w: 66, h: 88, base: 154 }, // nightstand and lamp
      { x: 286, y: 108, w: 92, h: 116, base: 220 }, // the boxes
    ],
    interactables: [
      { id: "bed", zone: { x: 176, y: 140, w: 168, h: 104 }, anchor: { x: 262, y: 150 }, order: 5 },
      { id: "stairsDown", zone: { x: 236, y: 200, w: 130, h: 96 }, anchor: { x: 300, y: 250 }, order: 6 },
    ],
    spawns: {
      fromShop: { x: 258, y: 230 },
    },
  },
  backroom: {
    id: "backroom",
    image: "/assets/overworld/backroom.png",
    width: 400,
    height: 300,
    floor: [
      { x: 72, y: 172 },
      { x: 232, y: 84 },
      { x: 362, y: 178 },
      { x: 182, y: 282 },
    ],
    obstacles: [
      { x: 160, y: 60, w: 72, h: 120 }, // the tower
      { x: 88, y: 112, w: 56, h: 74 }, // the stool
    ],
    occluders: [
      { x: 156, y: 44, w: 82, h: 140, base: 180 }, // the tower
      { x: 84, y: 96, w: 64, h: 94, base: 186 }, // the stool
    ],
    interactables: [
      { id: "tower", zone: { x: 128, y: 150, w: 150, h: 90 }, anchor: { x: 196, y: 130 }, order: 5 },
      { id: "backroomExit", zone: { x: 96, y: 214, w: 100, h: 86 }, anchor: { x: 138, y: 250 }, order: 6 },
    ],
    spawns: {
      fromShop: { x: 170, y: 240 },
    },
  },
};

/** Point-in-polygon, ray cast. Floor tests run per movement axis. */
export function inPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function inRect(p: Vec, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** May an actor's FEET stand here? */
export function walkable(room: RoomDef, p: Vec): boolean {
  if (!inPolygon(p, room.floor)) return false;
  for (const o of room.obstacles) if (inRect(p, o)) return false;
  return true;
}

/** The interactable whose zone holds the point, nearest ZONE CENTRE first
 * (anchors sit on walls and furniture; the zone is where the player is). */
export function interactableAt(room: RoomDef, p: Vec): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of room.interactables) {
    if (!inRect(p, it.zone)) continue;
    const cx = it.zone.x + it.zone.w / 2;
    const cy = it.zone.y + it.zone.h / 2;
    const d = (cx - p.x) ** 2 + (cy - p.y) ** 2 + it.order;
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}
