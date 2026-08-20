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
    // Retuned 2026-08-20 against the neon plate (PixelLab job daa98931, see
    // pipeline/art/overworld/RECORD.md). The old geometry maps onto it through
    // x' = 0.92x + 26, y' = 0.93(y - 28) + 42; the south east quadrant was
    // re-derived by hand because the painting moved the stair foot up to a
    // pocket at (466..530, 232..264) and sealed the old bottom-right lane
    // with the east stock crates.
    floor: [
      { x: 115, y: 313 },
      { x: 305, y: 218 },
      { x: 350, y: 218 },
      { x: 455, y: 228 },
      { x: 528, y: 238 },
      { x: 530, y: 264 },
      { x: 470, y: 300 },
      { x: 452, y: 340 },
      { x: 430, y: 368 },
      { x: 346, y: 392 },
      { x: 166, y: 301 },
    ],
    obstacles: [
      { x: 83, y: 189, w: 118, h: 86 }, // the solder bay desk
      { x: 184, y: 88, w: 107, h: 126 }, // the shelves
      { x: 213, y: 212, w: 123, h: 89 }, // the counter island
      { x: 354, y: 180, w: 106, h: 97 }, // the bench: desk, terminal, rig
      { x: 484, y: 83, w: 123, h: 140 }, // the staircase, upper run
      { x: 530, y: 211, w: 77, h: 177 }, // the staircase stringer, east of the foot pocket
      { x: 46, y: 248, w: 118, h: 108 }, // dead stock, west corner
      { x: 430, y: 285, w: 70, h: 58 }, // east stock, low crate and monitor
      { x: 474, y: 242, w: 72, h: 90 }, // east stock, cabinet and monitor
      { x: 376, y: 293, w: 66, h: 62 }, // the phone desk and lamp table, south east
    ],
    occluders: [
      // The hanging lamp is at ceiling height: always above actors.
      { x: 291, y: 42, w: 68, h: 102, base: 9999 },
      // The counter: an actor north of its base walks behind it.
      { x: 213, y: 206, w: 129, h: 99, base: 299 },
      // The bench desk and terminal. Ends at x462 so the stair-pocket lane
      // (x460..474) never redraws floor over the actor standing in it, and
      // at y277 so the south strip (y280..292) stays in front of it.
      { x: 350, y: 161, w: 112, h: 116, base: 277 },
      // The solder bay desk with its lamp.
      { x: 81, y: 154, w: 123, h: 123, base: 273 },
      // The south east phone desk and lamp table. Top at the painted desk
      // top (y291) so the frame never carries floor rows over the strip.
      { x: 374, y: 291, w: 72, h: 66, base: 357 },
      // East stock, split to match its two masses.
      { x: 428, y: 283, w: 74, h: 64, base: 345 },
      { x: 472, y: 238, w: 76, h: 96, base: 331 },
    ],
    stateOverlays: [
      { id: "solder-fixed", requires: "solderBay", rect: { x: 89, y: 189, w: 114, h: 82 }, image: "/assets/overworld/states/solder-fixed.png" },
      { id: "power-fixed", requires: "powerBox", rect: { x: 65, y: 172, w: 31, h: 35 }, image: "/assets/overworld/states/power-fixed.png" },
      { id: "router-fixed", requires: "onionRouter", rect: { x: 352, y: 141, w: 68, h: 37 }, image: "/assets/overworld/states/router-fixed.png" },
      { id: "shelves-fixed", requires: "shelves", rect: { x: 188, y: 93, w: 99, h: 97 }, image: "/assets/overworld/states/shelves-fixed.png" },
      { id: "drive-fixed", requires: "driveRig", rect: { x: 474, y: 246, w: 72, h: 62 }, image: "/assets/overworld/states/drive-fixed.png" },
    ],
    interactables: [
      { id: "counter", zone: { x: 206, y: 187, w: 151, h: 158 }, hotspot: { x: 213, y: 209, w: 127, h: 97 }, anchor: { x: 276, y: 265 }, order: 5 },
      { id: "bench", zone: { x: 354, y: 224, w: 118, h: 102 }, hotspot: { x: 350, y: 161, w: 140, h: 123 }, anchor: { x: 409, y: 265 }, order: 4 },
      { id: "backroomDoor", zone: { x: 287, y: 198, w: 79, h: 86 }, hotspot: { x: 298, y: 131, w: 64, h: 110 }, anchor: { x: 327, y: 182 }, order: 3 },
      { id: "stairsUp", zone: { x: 458, y: 226, w: 64, h: 26 }, hotspot: { x: 486, y: 57, w: 121, h: 331 }, anchor: { x: 505, y: 225 }, order: 6 },
      { id: "solderBay", zone: { x: 158, y: 274, w: 57, h: 50 }, hotspot: { x: 81, y: 154, w: 125, h: 121 }, anchor: { x: 164, y: 241 }, order: 7 },
      { id: "shelves", zone: { x: 166, y: 267, w: 48, h: 35 }, hotspot: { x: 173, y: 88, w: 103, h: 188 }, anchor: { x: 236, y: 182 }, order: 8 },
      { id: "powerBox", zone: { x: 164, y: 276, w: 37, h: 24 }, hotspot: { x: 65, y: 172, w: 31, h: 35 }, anchor: { x: 79, y: 195 }, order: 9 },
      { id: "onionRouter", zone: { x: 342, y: 206, w: 64, h: 52 }, hotspot: { x: 350, y: 139, w: 70, h: 41 }, anchor: { x: 380, y: 168 }, order: 10 },
      { id: "bottomDrawer", zone: { x: 368, y: 279, w: 72, h: 14 }, hotspot: { x: 400, y: 258, w: 56, h: 24 }, anchor: { x: 416, y: 272 }, order: 11 },
      { id: "ledgerTerminal", zone: { x: 206, y: 291, w: 50, h: 46 }, hotspot: { x: 258, y: 215, w: 39, h: 43 }, anchor: { x: 273, y: 239 }, order: 12 },
      { id: "driveRig", zone: { x: 456, y: 258, w: 20, h: 34 }, hotspot: { x: 474, y: 242, w: 72, h: 90 }, anchor: { x: 480, y: 268 }, order: 13 },
      { id: "diagBench", zone: { x: 318, y: 300, w: 36, h: 56 }, hotspot: { x: 376, y: 269, w: 68, h: 88 }, anchor: { x: 352, y: 330 }, order: 14 },
    ],
    spawns: {
      start: { x: 302, y: 316 },
      fromBedroom: { x: 502, y: 238 },
      fromBackroom: { x: 342, y: 239 },
      customerDoor: { x: 220, y: 322 },
      customerCounter: { x: 276, y: 321 },
    },
  },
  // Bedroom retuned 2026-08-20 against the neon plate (PixelLab job c6db652f,
  // see pipeline/art/overworld/RECORD.md). The neon plate ships UNPADDED at
  // its native 440x300: its walls run full bleed to the canvas, so the old
  // 30px completion ring no longer exists. Mapping from the old padded
  // coords: x' = 0.92(x - 30) + 12, y' = 0.94(y - 30). The old "unpacked
  // boxes" mass is painted as a computer desk now; the rect still blocks it.
  bedroom: {
    id: "bedroom",
    image: "/assets/overworld/bedroom.png",
    width: 440,
    height: 300,
    floor: [
      { x: 69, y: 180 },
      { x: 244, y: 90 },
      { x: 378, y: 160 },
      { x: 213, y: 271 },
    ],
    obstacles: [
      { x: 168, y: 88, w: 138, h: 90 }, // the bed
      { x: 128, y: 92, w: 55, h: 64 }, // the nightstand and lamp
      { x: 56, y: 103, w: 96, h: 94 }, // the dresser
      { x: 279, y: 113, w: 66, h: 102 }, // the desk with the terminal (was the boxes)
      { x: 54, y: 177, w: 88, h: 90 }, // the small desk
      { x: 227, y: 179, w: 85, h: 105 }, // the stair rail cut
    ],
    occluders: [
      { x: 165, y: 77, w: 140, h: 102, base: 171 }, // the bed
      { x: 124, y: 81, w: 63, h: 75, base: 154 }, // nightstand and lamp
      { x: 275, y: 103, w: 74, h: 117, base: 212 }, // the terminal desk
    ],
    interactables: [
      { id: "bed", zone: { x: 165, y: 167, w: 61, h: 66 }, hotspot: { x: 168, y: 81, w: 138, h: 98 }, anchor: { x: 238, y: 150 }, order: 5 },
      { id: "stairsDown", zone: { x: 192, y: 194, w: 55, h: 68 }, hotspot: { x: 225, y: 177, w: 88, h: 109 }, anchor: { x: 270, y: 226 }, order: 6 },
    ],
    spawns: {
      fromShop: { x: 214, y: 237 },
    },
  },
  // Backroom retuned 2026-08-20 against the neon plate (PixelLab job
  // ee28db6a, see pipeline/art/overworld/RECORD.md). Ships UNPADDED at its
  // native 400x300, same reasoning as the bedroom. Mapping from the old
  // padded coords: x' = 0.85(x - 30) + 32, y' = 0.85(y - 30) + 24.
  backroom: {
    id: "backroom",
    image: "/assets/overworld/backroom.png",
    width: 400,
    height: 300,
    floor: [
      { x: 93, y: 170 },
      { x: 229, y: 95 },
      { x: 340, y: 175 },
      { x: 187, y: 264 },
    ],
    obstacles: [
      { x: 168, y: 75, w: 61, h: 102 }, // the tower
      { x: 107, y: 119, w: 48, h: 63 }, // the stool
    ],
    occluders: [
      { x: 165, y: 61, w: 70, h: 119, base: 152 }, // the tower
      { x: 103, y: 106, w: 54, h: 80, base: 157 }, // the stool
    ],
    interactables: [
      { id: "tower", zone: { x: 141, y: 152, w: 128, h: 76 }, hotspot: { x: 165, y: 61, w: 70, h: 119 }, anchor: { x: 199, y: 134 }, order: 5 },
      { id: "backroomExit", zone: { x: 114, y: 206, w: 85, h: 73 }, anchor: { x: 149, y: 236 }, order: 6 },
    ],
    spawns: {
      fromShop: { x: 176, y: 228 },
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
