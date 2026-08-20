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
    // Retuned 2026-08-20 v2 against the industrial plate (PixelLab job
    // af3a0be0 plus two material inpaints, see pipeline/art/overworld/
    // RECORD.md). Mapping from the original padded coords: x' = 0.93x + 22,
    // y' = 0.95(y - 28) + 38. The south east quadrant is hand-derived from
    // the painting: the metal staircase lands at a foot pocket
    // (466..532 x 216..250) with an open approach across the floor south of
    // the bench; the east stock repainted as crates, a server rack and a
    // CRT cabinet in new positions. The work chair has no obstacle: it is
    // pushable furniture and the strip stays passable.
    floor: [
      { x: 112, y: 314 },
      { x: 304, y: 218 },
      { x: 349, y: 218 },
      { x: 462, y: 220 },
      { x: 532, y: 230 },
      { x: 538, y: 252 },
      { x: 520, y: 268 },
      { x: 470, y: 290 },
      { x: 452, y: 340 },
      { x: 430, y: 368 },
      { x: 346, y: 395 },
      { x: 163, y: 302 },
    ],
    obstacles: [
      { x: 80, y: 188, w: 119, h: 87 }, // the solder bay desk
      { x: 182, y: 86, w: 108, h: 129 }, // the shelves (metal racking)
      { x: 211, y: 212, w: 110, h: 91 }, // the counter island
      { x: 353, y: 179, w: 112, h: 92 }, // the bench: desk, terminal, rig
      { x: 485, y: 80, w: 125, h: 136 }, // the staircase, upper run
      { x: 540, y: 216, w: 70, h: 175 }, // the stair railing and east wall band
      { x: 42, y: 249, w: 119, h: 110 }, // dead stock, west corner
      { x: 428, y: 298, w: 44, h: 50 }, // east stock, plastic crates
      { x: 468, y: 305, w: 40, h: 58 }, // east stock, server rack
      { x: 503, y: 283, w: 45, h: 55 }, // east stock, CRT cabinet
      { x: 349, y: 294, w: 80, h: 72 }, // the phone desk and lamp table
    ],
    occluders: [
      // The hanging cable fixture is at ceiling height: always above actors.
      { x: 290, y: 38, w: 69, h: 104, base: 9999 },
      // The counter: an actor north of its base walks behind it.
      { x: 211, y: 205, w: 112, h: 95, base: 298 },
      // The bench desk and terminal; ends above the south strip.
      { x: 349, y: 160, w: 116, h: 112, base: 272 },
      // The solder bay desk with its lamp.
      { x: 78, y: 152, w: 125, h: 125, base: 274 },
      // The phone desk and lamp table.
      { x: 348, y: 291, w: 80, h: 72, base: 360 },
      // East stock, three masses.
      { x: 426, y: 296, w: 48, h: 54, base: 348 },
      { x: 466, y: 303, w: 44, h: 62, base: 362 },
      { x: 501, y: 281, w: 49, h: 57, base: 336 },
    ],
    stateOverlays: [
      { id: "solder-fixed", requires: "solderBay", rect: { x: 85, y: 188, w: 115, h: 84 }, image: "/assets/overworld/states/solder-fixed.png" },
      { id: "power-fixed", requires: "powerBox", rect: { x: 61, y: 171, w: 32, h: 36 }, image: "/assets/overworld/states/power-fixed.png" },
      { id: "router-fixed", requires: "onionRouter", rect: { x: 351, y: 139, w: 69, h: 38 }, image: "/assets/overworld/states/router-fixed.png" },
      { id: "shelves-fixed", requires: "shelves", rect: { x: 186, y: 90, w: 100, h: 99 }, image: "/assets/overworld/states/shelves-fixed.png" },
      { id: "drive-fixed", requires: "driveRig", rect: { x: 466, y: 292, w: 78, h: 58 }, image: "/assets/overworld/states/drive-fixed.png" },
    ],
    interactables: [
      { id: "counter", zone: { x: 204, y: 186, w: 153, h: 162 }, hotspot: { x: 211, y: 209, w: 112, h: 92 }, anchor: { x: 270, y: 266 }, order: 5 },
      { id: "bench", zone: { x: 353, y: 224, w: 119, h: 104 }, hotspot: { x: 349, y: 160, w: 120, h: 112 }, anchor: { x: 409, y: 266 }, order: 4 },
      { id: "backroomDoor", zone: { x: 286, y: 198, w: 80, h: 87 }, hotspot: { x: 297, y: 129, w: 65, h: 112 }, anchor: { x: 326, y: 180 }, order: 3 },
      { id: "stairsUp", zone: { x: 468, y: 216, w: 62, h: 32 }, hotspot: { x: 487, y: 53, w: 123, h: 338 }, anchor: { x: 500, y: 212 }, order: 6 },
      { id: "solderBay", zone: { x: 156, y: 276, w: 58, h: 51 }, hotspot: { x: 78, y: 152, w: 126, h: 124 }, anchor: { x: 162, y: 241 }, order: 7 },
      { id: "shelves", zone: { x: 163, y: 268, w: 48, h: 36 }, hotspot: { x: 171, y: 86, w: 104, h: 192 }, anchor: { x: 234, y: 180 }, order: 8 },
      { id: "powerBox", zone: { x: 162, y: 277, w: 37, h: 25 }, hotspot: { x: 61, y: 171, w: 32, h: 36 }, anchor: { x: 76, y: 195 }, order: 9 },
      { id: "onionRouter", zone: { x: 342, y: 205, w: 65, h: 53 }, hotspot: { x: 349, y: 137, w: 71, h: 42 }, anchor: { x: 380, y: 166 }, order: 10 },
      { id: "bottomDrawer", zone: { x: 388, y: 274, w: 56, h: 18 }, hotspot: { x: 392, y: 246, w: 56, h: 24 }, anchor: { x: 418, y: 262 }, order: 11 },
      { id: "ledgerTerminal", zone: { x: 204, y: 293, w: 50, h: 48 }, hotspot: { x: 256, y: 215, w: 39, h: 44 }, anchor: { x: 271, y: 239 }, order: 12 },
      { id: "driveRig", zone: { x: 430, y: 276, w: 40, h: 20 }, hotspot: { x: 468, y: 305, w: 40, h: 58 }, anchor: { x: 486, y: 300 }, order: 13 },
      { id: "diagBench", zone: { x: 318, y: 300, w: 30, h: 56 }, hotspot: { x: 349, y: 291, w: 80, h: 72 }, anchor: { x: 352, y: 330 }, order: 14 },
    ],
    spawns: {
      start: { x: 301, y: 318 },
      fromBedroom: { x: 496, y: 234 },
      fromBackroom: { x: 342, y: 239 },
      customerDoor: { x: 218, y: 323 },
      customerCounter: { x: 275, y: 323 },
    },
  },
  // Bedroom retuned 2026-08-20 v2 against the industrial plate (PixelLab
  // job d52cf58a, see pipeline/art/overworld/RECORD.md). Ships UNPADDED at
  // native 440x300. Mapping from the old padded coords: x' = x - 30,
  // y' = 1.02(y - 30) - 10. The old boxes are hard plastic equipment cases
  // now; the stair opening carries a steel grate railing.
  bedroom: {
    id: "bedroom",
    image: "/assets/overworld/bedroom.png",
    width: 440,
    height: 300,
    floor: [
      { x: 62, y: 186 },
      { x: 252, y: 88 },
      { x: 398, y: 163 },
      { x: 218, y: 284 },
    ],
    obstacles: [
      { x: 170, y: 86, w: 150, h: 98 }, // the bed
      { x: 126, y: 90, w: 60, h: 69 }, // the nightstand and lamp
      { x: 48, y: 102, w: 104, h: 102 }, // the cabinet and server towers
      { x: 290, y: 112, w: 72, h: 110 }, // the equipment cases
      { x: 46, y: 182, w: 108, h: 98 }, // the terminal desk
      { x: 234, y: 184, w: 92, h: 114 }, // the stair opening and rail
    ],
    occluders: [
      { x: 166, y: 74, w: 152, h: 110, base: 176 }, // the bed
      { x: 122, y: 78, w: 68, h: 82, base: 157 }, // nightstand and lamp
      { x: 286, y: 102, w: 80, h: 126, base: 221 }, // the equipment cases
    ],
    interactables: [
      { id: "bed", zone: { x: 166, y: 172, w: 66, h: 71 }, hotspot: { x: 170, y: 78, w: 150, h: 106 }, anchor: { x: 246, y: 153 }, order: 5 },
      { id: "stairsDown", zone: { x: 196, y: 200, w: 60, h: 73 }, hotspot: { x: 232, y: 182, w: 96, h: 118 }, anchor: { x: 280, y: 235 }, order: 6 },
    ],
    spawns: {
      fromShop: { x: 220, y: 247 },
    },
  },
  // Backroom retuned 2026-08-20 v2 against the industrial plate (PixelLab
  // job 11b3d4fd, see pipeline/art/overworld/RECORD.md). Ships UNPADDED at
  // native 400x300. Mapping from the old padded coords: x' = 0.84(x - 30)
  // + 36, y' = 0.83(y - 30) + 30.
  backroom: {
    id: "backroom",
    image: "/assets/overworld/backroom.png",
    width: 400,
    height: 300,
    floor: [
      { x: 96, y: 173 },
      { x: 231, y: 100 },
      { x: 340, y: 178 },
      { x: 189, y: 264 },
    ],
    obstacles: [
      { x: 170, y: 80, w: 60, h: 100 }, // the tower
      { x: 110, y: 123, w: 47, h: 61 }, // the stool
    ],
    occluders: [
      { x: 167, y: 67, w: 69, h: 116, base: 155 }, // the tower
      { x: 107, y: 110, w: 54, h: 78, base: 160 }, // the stool
    ],
    interactables: [
      { id: "tower", zone: { x: 144, y: 155, w: 126, h: 75 }, hotspot: { x: 167, y: 67, w: 69, h: 116 }, anchor: { x: 201, y: 138 }, order: 5 },
      { id: "backroomExit", zone: { x: 117, y: 208, w: 84, h: 71 }, anchor: { x: 152, y: 238 }, order: 6 },
    ],
    spawns: {
      fromShop: { x: 179, y: 229 },
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
