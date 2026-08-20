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
  /** Player stands inside this to interact. Keep it small and keep its
   * CENTER on the standing pad: overlapping zones resolve by center
   * distance, so a zone centered on unwalkable art loses everywhere. */
  zone: Rect;
  /** The prop's visible pixels. A CLICK anywhere in here routes to this
   * station (walk to the zone, then interact), so furniture is clickable
   * even though nobody can stand on it. */
  hotspot?: Rect;
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
  // The shop plate was padded 28px top and bottom on 2026-08-19 to complete
  // the room's clipped apexes, so every shop coordinate below is the old
  // value +28 in y unless it was retuned against the art (obstacles,
  // occluders and zones were: see the debug overlay workflow in the vault).
  shop: {
    id: "shop",
    image: "/assets/overworld/shop.png",
    width: 632,
    height: 456,
    floor: [
      { x: 97, y: 319 },
      { x: 303, y: 217 },
      { x: 352, y: 217 },
      { x: 548, y: 296 },
      { x: 552, y: 348 },
      { x: 542, y: 380 },
      { x: 348, y: 404 },
      { x: 152, y: 306 },
    ],
    obstacles: [
      { x: 62, y: 186, w: 128, h: 92 }, // the solder bay desk
      { x: 172, y: 78, w: 116, h: 136 }, // the shelves
      { x: 203, y: 211, w: 134, h: 96 }, // the counter island
      { x: 356, y: 176, w: 120, h: 104 }, // the bench: desk, terminal, rig
      { x: 398, y: 280, w: 50, h: 24 }, // the work chair
      { x: 498, y: 72, w: 134, h: 150 }, // the staircase, upper run
      { x: 548, y: 210, w: 84, h: 190 }, // the staircase, lower run + stringer
      { x: 22, y: 250, w: 128, h: 116 }, // dead stock, west corner
      { x: 470, y: 224, w: 36, h: 42 }, // the bench's side rack
      { x: 420, y: 256, w: 60, h: 78 }, // east stock, front crates
      { x: 472, y: 250, w: 74, h: 56 }, // east stock, right stack
      { x: 352, y: 298, w: 114, h: 82 }, // the phone desk, south east
    ],
    occluders: [
      // The hanging lamp is at ceiling height: always above actors.
      { x: 288, y: 28, w: 74, h: 110, base: 9999 },
      // The counter: an actor north of its base walks behind it.
      { x: 203, y: 204, w: 140, h: 106, base: 304 },
      // The bench desk and terminal.
      { x: 352, y: 156, w: 152, h: 134, base: 286 },
      // The solder bay desk with its lamp.
      { x: 60, y: 148, w: 134, h: 132, base: 276 },
      // The south east phone desk.
      { x: 350, y: 272, w: 118, h: 110, base: 378 },
      // East stock, split to match its two masses so the corridor to the
      // stairs never redraws floor over the player.
      { x: 418, y: 246, w: 66, h: 90, base: 332 },
      { x: 470, y: 242, w: 80, h: 66, base: 304 },
    ],
    stateOverlays: [
      { id: "solder-fixed", requires: "solderBay", rect: { x: 68, y: 186, w: 124, h: 88 }, image: "/assets/overworld/states/solder-fixed.png" },
      { id: "power-fixed", requires: "powerBox", rect: { x: 42, y: 168, w: 34, h: 38 }, image: "/assets/overworld/states/power-fixed.png" },
      { id: "router-fixed", requires: "onionRouter", rect: { x: 354, y: 134, w: 74, h: 40 }, image: "/assets/overworld/states/router-fixed.png" },
      { id: "shelves-fixed", requires: "shelves", rect: { x: 176, y: 83, w: 108, h: 104 }, image: "/assets/overworld/states/shelves-fixed.png" },
      { id: "drive-fixed", requires: "driveRig", rect: { x: 424, y: 256, w: 96, h: 56 }, image: "/assets/overworld/states/drive-fixed.png" },
    ],
    interactables: [
      { id: "counter", zone: { x: 196, y: 184, w: 164, h: 170 }, hotspot: { x: 203, y: 208, w: 138, h: 104 }, anchor: { x: 272, y: 268 }, order: 5 },
      { id: "bench", zone: { x: 356, y: 224, w: 128, h: 110 }, hotspot: { x: 352, y: 156, w: 152, h: 132 }, anchor: { x: 416, y: 268 }, order: 4 },
      { id: "backroomDoor", zone: { x: 284, y: 196, w: 86, h: 92 }, hotspot: { x: 296, y: 124, w: 70, h: 118 }, anchor: { x: 327, y: 178 }, order: 3 },
      { id: "stairsUp", zone: { x: 506, y: 330, w: 54, h: 48 }, hotspot: { x: 500, y: 44, w: 132, h: 356 }, anchor: { x: 566, y: 340 }, order: 6 },
      { id: "solderBay", zone: { x: 144, y: 278, w: 62, h: 54 }, hotspot: { x: 60, y: 148, w: 136, h: 130 }, anchor: { x: 150, y: 242 }, order: 7 },
      { id: "shelves", zone: { x: 152, y: 270, w: 52, h: 38 }, hotspot: { x: 160, y: 78, w: 112, h: 202 }, anchor: { x: 228, y: 178 }, order: 8 },
      { id: "powerBox", zone: { x: 150, y: 280, w: 40, h: 26 }, hotspot: { x: 42, y: 168, w: 34, h: 38 }, anchor: { x: 58, y: 193 }, order: 9 },
      { id: "onionRouter", zone: { x: 344, y: 204, w: 70, h: 56 }, hotspot: { x: 352, y: 132, w: 76, h: 44 }, anchor: { x: 385, y: 163 }, order: 10 },
      { id: "bottomDrawer", zone: { x: 476, y: 336, w: 64, h: 44 }, hotspot: { x: 420, y: 290, w: 60, h: 44 }, anchor: { x: 452, y: 318 }, order: 11 },
      { id: "ledgerTerminal", zone: { x: 196, y: 296, w: 54, h: 50 }, hotspot: { x: 252, y: 214, w: 42, h: 46 }, anchor: { x: 268, y: 240 }, order: 12 },
      { id: "driveRig", zone: { x: 452, y: 336, w: 76, h: 40 }, hotspot: { x: 472, y: 250, w: 74, h: 56 }, anchor: { x: 505, y: 280 }, order: 13 },
      { id: "diagBench", zone: { x: 350, y: 372, w: 120, h: 34 }, hotspot: { x: 352, y: 272, w: 114, h: 108 }, anchor: { x: 440, y: 320 }, order: 14 },
    ],
    spawns: {
      start: { x: 300, y: 323 },
      fromBedroom: { x: 528, y: 352 },
      fromBackroom: { x: 344, y: 240 },
      customerDoor: { x: 208, y: 332 },
      customerCounter: { x: 272, y: 328 },
    },
  },
  bedroom: {
    id: "bedroom",
    image: "/assets/overworld/bedroom.png",
    width: 500,
    height: 360,
    floor: [
      { x: 92, y: 222 },
      { x: 282, y: 126 },
      { x: 428, y: 200 },
      { x: 248, y: 318 },
    ],
    obstacles: [
      { x: 200, y: 124, w: 150, h: 96 }, // the bed
      { x: 156, y: 128, w: 60, h: 68 }, // the nightstand and lamp
      { x: 78, y: 140, w: 104, h: 100 }, // the dresser
      { x: 320, y: 150, w: 72, h: 108 }, // the unpacked boxes
      { x: 76, y: 218, w: 96, h: 96 }, // the small desk
      { x: 264, y: 220, w: 92, h: 112 }, // the stair rail cut
    ],
    occluders: [
      { x: 196, y: 112, w: 152, h: 108, base: 212 }, // the bed
      { x: 152, y: 116, w: 68, h: 80, base: 194 }, // nightstand and lamp
      { x: 316, y: 140, w: 80, h: 124, base: 256 }, // the boxes
    ],
    interactables: [
      { id: "bed", zone: { x: 196, y: 208, w: 66, h: 70 }, hotspot: { x: 200, y: 116, w: 150, h: 104 }, anchor: { x: 276, y: 190 }, order: 5 },
      { id: "stairsDown", zone: { x: 226, y: 236, w: 60, h: 72 }, hotspot: { x: 262, y: 218, w: 96, h: 116 }, anchor: { x: 310, y: 270 }, order: 6 },
    ],
    spawns: {
      fromShop: { x: 250, y: 282 },
    },
  },
  backroom: {
    id: "backroom",
    image: "/assets/overworld/backroom.png",
    width: 460,
    height: 360,
    floor: [
      { x: 102, y: 202 },
      { x: 262, y: 114 },
      { x: 392, y: 208 },
      { x: 212, y: 312 },
    ],
    obstacles: [
      { x: 190, y: 90, w: 72, h: 120 }, // the tower
      { x: 118, y: 142, w: 56, h: 74 }, // the stool
    ],
    occluders: [
      { x: 186, y: 74, w: 82, h: 140, base: 180 }, // the tower
      { x: 114, y: 126, w: 64, h: 94, base: 186 }, // the stool
    ],
    interactables: [
      { id: "tower", zone: { x: 158, y: 180, w: 150, h: 90 }, hotspot: { x: 186, y: 74, w: 82, h: 140 }, anchor: { x: 226, y: 160 }, order: 5 },
      { id: "backroomExit", zone: { x: 126, y: 244, w: 100, h: 86 }, anchor: { x: 168, y: 280 }, order: 6 },
    ],
    spawns: {
      fromShop: { x: 200, y: 270 },
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

/** The station a CLICK at this point means: among every zone and hotspot
 * holding the point, the SMALLEST rect wins, so a gadget mounted on a
 * larger prop (the register on the counter, the drawer in the crates)
 * stays clickable inside the bigger thing's footprint. */
export function clickStationAt(room: RoomDef, p: Vec): Interactable | null {
  let best: Interactable | null = null;
  let bestArea = Infinity;
  for (const it of room.interactables) {
    for (const r of [it.zone, it.hotspot]) {
      if (!r || !inRect(p, r)) continue;
      const area = r.w * r.h;
      if (area < bestArea) {
        bestArea = area;
        best = it;
      }
    }
  }
  return best;
}
