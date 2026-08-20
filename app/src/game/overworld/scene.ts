import type PhaserNS from "phaser";
import { CUSTOMERS } from "../content/customers";
import { OverworldBridge } from "./bridge";
import {
  Interactable,
  ROOMS,
  RoomDef,
  RoomId,
  Vec,
  inRect,
  clickStationAt,
  interactableAt,
  walkable,
} from "./world";

/**
 * The room, running in Phaser. One scene renders whichever room the player
 * is in: the painted plate at depth 0, occluder cutouts (frames of the same
 * texture) at their base depths, actors depth-sorted by their feet. The
 * camera renders at INTEGER zoom only, so the art is never resampled; when
 * the whole room fits it sits still, otherwise it follows the player.
 *
 * Phaser is passed in, never imported: the module graph reachable from the
 * routes must stay clean of window/document at load (SSR bundles every dep).
 */

const DIRS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"] as const;
type Dir = (typeof DIRS)[number];

const WALK_SPEED = 105; // native px/s
const NPC_SPEED = 66;

function dirOf(vx: number, vy: number, fallback: Dir): Dir {
  if (vx === 0 && vy === 0) return fallback;
  const ang = Math.atan2(vy, vx); // 0 = east, +90 = south (screen y down)
  const oct = Math.round(ang / (Math.PI / 4));
  switch ((oct + 8) % 8) {
    case 0: return "east";
    case 1: return "south-east";
    case 2: return "south";
    case 3: return "south-west";
    case 4: return "west";
    case 5: return "north-west";
    case 6: return "north";
    default: return "north-east";
  }
}

export interface OverworldHandles {
  destroy(): void;
}

export function bootOverworld(
  Phaser: typeof PhaserNS,
  parent: HTMLElement,
  bridge: OverworldBridge,
): OverworldHandles {
  class RoomScene extends Phaser.Scene {
    roomId: RoomId = "shop";
    room: RoomDef = ROOMS.shop;
    player!: PhaserNS.GameObjects.Sprite;
    npc: PhaserNS.GameObjects.Sprite | null = null;
    npcId: string | null = null;
    npcPath: Vec[] = [];
    npcLeaving = false;
    facing: Dir = "south";
    roomLayer: PhaserNS.GameObjects.Image | null = null;
    occluderImgs: PhaserNS.GameObjects.Image[] = [];
    tintRect!: PhaserNS.GameObjects.Rectangle;
    promptMarker!: PhaserNS.GameObjects.Container;
    keys!: Record<string, { isDown: boolean }>;
    paused = false;
    seated = false;
    debug = false;
    debugGfx: PhaserNS.GameObjects.Graphics | null = null;
    clickTarget: Vec | null = null;
    clickPath: Vec[] = [];
    clickStation: Interactable | null = null;
    navCell = 4;
    navW = 0;
    navH = 0;
    navGrid: Uint8Array = new Uint8Array(0);
    currentPrompt: import("./world").StationId | null = null;
    stepClock = 0;
    interactQueued = false;
    stuckClock = 0;

    constructor() {
      super("room");
    }

    preload(): void {
      for (const room of Object.values(ROOMS)) {
        this.load.image(`room-${room.id}`, room.image);
        for (const ov of room.stateOverlays ?? []) {
          this.load.image(`st-${ov.id}`, ov.image);
        }
      }
      this.load.spritesheet("son-walk", "/assets/overworld/son-walk.png", {
        frameWidth: 48,
        frameHeight: 48,
      });
      this.load.spritesheet("son-idle", "/assets/overworld/son-idle.png", {
        frameWidth: 48,
        frameHeight: 48,
      });
      for (const c of CUSTOMERS) {
        this.load.spritesheet(`cust-${c.id}`, `/assets/overworld/customers/${c.id}-walk.png`, {
          frameWidth: 48,
          frameHeight: 48,
        });
      }
    }

    create(): void {
      // Direction rows are sheet rows; 8 walk frames, 4 idle frames.
      DIRS.forEach((d, row) => {
        this.anims.create({
          key: `son-walk-${d}`,
          frames: this.anims.generateFrameNumbers("son-walk", { start: row * 8, end: row * 8 + 7 }),
          frameRate: 11,
          repeat: -1,
        });
        this.anims.create({
          key: `son-idle-${d}`,
          frames: this.anims.generateFrameNumbers("son-idle", { start: row * 4, end: row * 4 + 3 }),
          frameRate: 4,
          repeat: -1,
        });
        for (const c of CUSTOMERS) {
          if (this.textures.exists(`cust-${c.id}`)) {
            this.anims.create({
              key: `cust-${c.id}-walk-${d}`,
              frames: this.anims.generateFrameNumbers(`cust-${c.id}`, {
                start: row * 8,
                end: row * 8 + 7,
              }),
              frameRate: 10,
              repeat: -1,
            });
          }
        }
      });

      this.player = this.add.sprite(0, 0, "son-idle", 0);
      this.player.setOrigin(0.5, 1);

      this.tintRect = this.add.rectangle(0, 0, 4, 4, 0x070510, 0);
      this.tintRect.setOrigin(0, 0);
      this.tintRect.setDepth(6000);

      // The interact chevron: a small diegetic marker over the live station.
      const chev = this.add.graphics();
      chev.fillStyle(0xeaffe6, 1);
      chev.fillTriangle(-5, -8, 5, -8, 0, 0);
      chev.lineStyle(1, 0x070510, 1);
      chev.strokeTriangle(-5, -8, 5, -8, 0, 0);
      this.promptMarker = this.add.container(0, 0, [chev]);
      this.promptMarker.setDepth(5500);
      this.promptMarker.setVisible(false);
      // The bob rides the INNER graphics: tweening the container would pin
      // it to the position it had when the tween started.
      this.tweens.add({
        targets: chev,
        y: -4,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      const kb = this.input.keyboard;
      if (kb) {
        this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as unknown as Record<
          string,
          { isDown: boolean }
        >;
        // Event-driven, never polled: a fast tap lands between frames and
        // a polled isDown misses it entirely.
        for (const code of [
          Phaser.Input.Keyboard.KeyCodes.E,
          Phaser.Input.Keyboard.KeyCodes.ENTER,
          Phaser.Input.Keyboard.KeyCodes.SPACE,
        ]) {
          kb.addKey(code).on("down", () => {
            if (!this.paused && !this.seated) this.interactQueued = true;
          });
        }
        const tick = kb.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
        tick.on("down", () => this.setDebug(!this.debug));
      }

      this.input.on("pointerdown", (p: PhaserNS.Input.Pointer) => {
        if (this.paused || this.seated) return;
        const wp = this.cameras.main.getWorldPoint(p.x, p.y);
        const target = { x: wp.x, y: wp.y };
        // A walkable click is a walk (with a zone interact if one covers the
        // spot); only an unwalkable click may resolve through prop hotspots.
        this.clickStation = walkable(this.room, target)
          ? interactableAt(this.room, target)
          : clickStationAt(this.room, target);
        if (walkable(this.room, target)) {
          this.clickPath = this.findPath({ x: this.player.x, y: this.player.y }, target);
          this.clickTarget = this.clickPath.length > 0 ? this.clickPath[0] : null;
        } else if (this.clickStation) {
          // Clicked furniture: stand at the nearest NAV CELL of its zone.
          // Nav resolution, not a coarse lattice: a zone whose pad is a
          // narrow strip must still yield a stand point.
          const z = this.clickStation.zone;
          let best: Vec | null = null;
          let bestD = Infinity;
          const gx0 = Math.max(0, Math.floor(z.x / this.navCell));
          const gy0 = Math.max(0, Math.floor(z.y / this.navCell));
          const gx1 = Math.min(this.navW - 1, Math.floor((z.x + z.w) / this.navCell));
          const gy1 = Math.min(this.navH - 1, Math.floor((z.y + z.h) / this.navCell));
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
              if (!this.navGrid[gy * this.navW + gx]) continue;
              const cand = { x: gx * this.navCell + this.navCell / 2, y: gy * this.navCell + this.navCell / 2 };
              const d = (cand.x - this.player.x) ** 2 + (cand.y - this.player.y) ** 2;
              if (d < bestD) {
                bestD = d;
                best = cand;
              }
            }
          }
          if (best) {
            this.clickPath = this.findPath({ x: this.player.x, y: this.player.y }, best);
            this.clickTarget = this.clickPath.length > 0 ? this.clickPath[0] : null;
          } else {
            this.clickPath = [];
            this.clickTarget = null;
          }
        } else {
          this.clickPath = [];
          this.clickTarget = null;
        }
        this.stuckClock = 0;
        (window as unknown as { __kpPath?: object }).__kpPath = {
          target,
          station: this.clickStation?.id ?? null,
          path: this.clickPath.map((w) => ({ x: Math.round(w.x), y: Math.round(w.y) })),
        };
      });

      this.scale.on("resize", () => this.layoutCamera());

      bridge.commands = {
        benchZoom: () => this.benchZoom(),
        standZoom: () => this.standZoom(),
        customerEnter: (id: string) => this.customerEnter(id),
        customerLeave: () => this.customerLeave(),
        teleport: (room: RoomId, spawn: string) => this.enterRoom(room, spawn),
        setPaused: (p: boolean) => {
          this.paused = p;
          if (this.input.keyboard) this.input.keyboard.enabled = !p || this.debug;
        },
        setDebug: (on: boolean) => this.setDebug(on),
      };

      this.enterRoom("shop", "start");
      bridge.emit({ type: "ready" });
    }

    setDebug(on: boolean): void {
      this.debug = on;
      if (!on && this.debugGfx) {
        this.debugGfx.destroy();
        this.debugGfx = null;
      }
      if (on) this.drawDebug();
    }

    drawDebug(): void {
      if (this.debugGfx) this.debugGfx.destroy();
      const g = this.add.graphics();
      g.setDepth(9000);
      g.lineStyle(1, 0x35e66f, 0.9);
      g.beginPath();
      const f = this.room.floor;
      g.moveTo(f[0].x, f[0].y);
      for (const p of f.slice(1)) g.lineTo(p.x, p.y);
      g.closePath();
      g.strokePath();
      g.lineStyle(1, 0xff2a17, 0.9);
      for (const o of this.room.obstacles) g.strokeRect(o.x, o.y, o.w, o.h);
      g.lineStyle(1, 0x23d3ff, 0.8);
      for (const it of this.room.interactables) {
        g.strokeRect(it.zone.x, it.zone.y, it.zone.w, it.zone.h);
        g.fillStyle(0x23d3ff, 1);
        g.fillCircle(it.anchor.x, it.anchor.y, 2);
      }
      this.debugGfx = g;
    }

    enterRoom(roomId: RoomId, spawn: string): void {
      this.roomId = roomId;
      this.room = ROOMS[roomId];
      if (this.roomLayer) this.roomLayer.destroy();
      for (const img of this.occluderImgs) img.destroy();
      this.occluderImgs = [];
      if (this.npc) {
        this.npc.destroy();
        this.npc = null;
        this.npcId = null;
      }

      // The live plate: the painted room with every owned repair's fixed
      // state baked in. One canvas texture backs both the base layer and
      // the occluder cutouts, so a repaired station stays repaired even
      // when its pixels redraw above a passing actor.
      const key = `room-${roomId}-live`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const canvas = this.textures.createCanvas(key, this.room.width, this.room.height);
      if (canvas) {
        canvas.draw(0, 0, this.textures.get(`room-${roomId}`).getSourceImage() as HTMLImageElement);
        this.paintStates(canvas);
        canvas.refresh();
      }
      this.roomLayer = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);

      const tex = this.textures.get(key);
      this.room.occluders.forEach((oc, i) => {
        if (oc.w <= 0 || oc.h <= 0) return;
        const frameKey = `occ-${roomId}-${i}`;
        if (!tex.has(frameKey)) tex.add(frameKey, 0, oc.x, oc.y, oc.w, oc.h);
        const img = this.add.image(oc.x, oc.y, key, frameKey).setOrigin(0, 0);
        img.setDepth(oc.base);
        this.occluderImgs.push(img);
      });

      // Rasterize walkability for click-to-move pathfinding.
      this.navW = Math.ceil(this.room.width / this.navCell);
      this.navH = Math.ceil(this.room.height / this.navCell);
      this.navGrid = new Uint8Array(this.navW * this.navH);
      for (let gy = 0; gy < this.navH; gy++) {
        for (let gx = 0; gx < this.navW; gx++) {
          const cx = gx * this.navCell + this.navCell / 2;
          const cy = gy * this.navCell + this.navCell / 2;
          // Clearance: a nav cell is walkable only with a little margin on
          // every side, so paths do not hug obstacle corners the follower
          // then wedges against.
          const ok =
            walkable(this.room, { x: cx, y: cy }) &&
            walkable(this.room, { x: cx - 2, y: cy }) &&
            walkable(this.room, { x: cx + 2, y: cy }) &&
            walkable(this.room, { x: cx, y: cy - 2 }) &&
            walkable(this.room, { x: cx, y: cy + 2 });
          this.navGrid[gy * this.navW + gx] = ok ? 1 : 0;
        }
      }

      const at = this.room.spawns[spawn] ?? this.room.spawns[Object.keys(this.room.spawns)[0]];
      this.player.setPosition(at.x, at.y);
      this.player.setDepth(at.y);
      this.clickTarget = null;
      this.clickStation = null;

      this.tintRect.setSize(this.room.width, this.room.height);
      this.applyPhaseTint();
      this.layoutCamera();
      if (this.debug) this.drawDebug();
      bridge.emit({ type: "roomChanged", room: roomId });
    }

    stateSignature = "";

    paintStates(canvas: PhaserNS.Textures.CanvasTexture): void {
      const repairs = bridge.snapshot.repairs;
      this.stateSignature = repairs.join(",");
      for (const ov of this.room.stateOverlays ?? []) {
        if (!repairs.includes(ov.requires)) continue;
        if (!this.textures.exists(`st-${ov.id}`)) continue;
        canvas.draw(ov.rect.x, ov.rect.y, this.textures.get(`st-${ov.id}`).getSourceImage() as HTMLImageElement);
      }
    }

    refreshStates(): void {
      const repairs = bridge.snapshot.repairs.join(",");
      if (repairs === this.stateSignature) return;
      const key = `room-${this.roomId}-live`;
      const canvas = this.textures.get(key) as PhaserNS.Textures.CanvasTexture;
      if (!canvas || !(canvas as unknown as { draw?: unknown }).draw) {
        this.stateSignature = repairs;
        return;
      }
      canvas.draw(0, 0, this.textures.get(`room-${this.roomId}`).getSourceImage() as HTMLImageElement);
      this.paintStates(canvas);
      canvas.refresh();
    }

    applyPhaseTint(): void {
      const phase = bridge.snapshot.phase;
      let alpha = 0;
      if (phase === "evening") alpha = 0.34;
      else if (phase === "bust") alpha = 0.5;
      else if (phase === "sunday") alpha = 0.12;
      if (this.roomId === "backroom") alpha = Math.max(alpha, 0.2);
      this.tintRect.setFillStyle(0x070510, alpha);
    }

    layoutCamera(): void {
      const cam = this.cameras.main;
      const vw = this.scale.width;
      const vh = this.scale.height;
      const fitZoom = Math.floor(Math.min(vw / this.room.width, vh / this.room.height));
      const zoom = Math.max(2, fitZoom);
      cam.setZoom(zoom);
      if (this.seated) return;
      if (this.room.width * zoom <= vw && this.room.height * zoom <= vh) {
        // The room fits: park the camera dead centre. Bounds would clamp
        // the negative scroll a smaller-than-viewport world needs, so they
        // are off in this mode.
        cam.stopFollow();
        cam.useBounds = false;
        cam.centerOn(this.room.width / 2, this.room.height / 2);
      } else {
        // Follow, but keep any axis that FITS dead centre: widen the bounds
        // by the viewport excess on that axis so the clamp pins it centred
        // instead of flush against the world's origin.
        const ex = Math.max(0, vw / zoom - this.room.width);
        const ey = Math.max(0, vh / zoom - this.room.height);
        cam.setBounds(-ex / 2, -ey / 2, this.room.width + ex, this.room.height + ey);
        cam.startFollow(this.player, true, 0.12, 0.12);
      }
    }

    benchZoom(): void {
      this.seated = true;
      const cam = this.cameras.main;
      const bench = ROOMS.shop.interactables.find((i) => i.id === "bench");
      const target = bench ? bench.anchor : { x: 420, y: 200 };
      cam.stopFollow();
      if (bridge.snapshot.reducedMotion) {
        bridge.emit({ type: "benchZoomDone" });
        return;
      }
      const z = cam.zoom;
      this.tweens.add({
        targets: cam,
        zoom: z * 2.6,
        scrollX: target.x - cam.width / (2 * z * 2.6),
        scrollY: target.y - 26 - cam.height / (2 * z * 2.6),
        duration: 430,
        ease: "Sine.easeIn",
        onComplete: () => bridge.emit({ type: "benchZoomDone" }),
      });
    }

    standZoom(): void {
      this.seated = false;
      if (bridge.snapshot.reducedMotion) {
        this.layoutCamera();
        bridge.emit({ type: "standZoomDone" });
        return;
      }
      const cam = this.cameras.main;
      const vw = this.scale.width;
      const vh = this.scale.height;
      const zoom = Math.max(2, Math.floor(Math.min(vw / this.room.width, vh / this.room.height)));
      this.tweens.add({
        targets: cam,
        zoom,
        scrollX: this.room.width / 2 - cam.width / (2 * zoom),
        scrollY: this.room.height / 2 - cam.height / (2 * zoom),
        duration: 320,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.layoutCamera();
          bridge.emit({ type: "standZoomDone" });
        },
      });
    }

    customerEnter(id: string): void {
      if (this.roomId !== "shop") return;
      if (this.npc) this.npc.destroy();
      this.npcId = id;
      this.npcLeaving = false;
      const door = ROOMS.shop.spawns.customerDoor;
      const stand = ROOMS.shop.spawns.customerCounter;
      const key = this.textures.exists(`cust-${id}`) ? `cust-${id}` : "son-idle";
      this.npc = this.add.sprite(door.x, door.y, key, 0);
      this.npc.setOrigin(0.5, 1);
      this.npc.setDepth(door.y);
      this.npcPath = [{ x: stand.x, y: stand.y }];
      bridge.emit({ type: "doorBell" });
    }

    customerLeave(): void {
      if (!this.npc) return;
      this.npcLeaving = true;
      const door = ROOMS.shop.spawns.customerDoor;
      this.npcPath = [{ x: door.x, y: door.y }];
    }

    nearestNavCell(p: Vec): { gx: number; gy: number } | null {
      const gx0 = Math.max(0, Math.min(this.navW - 1, Math.floor(p.x / this.navCell)));
      const gy0 = Math.max(0, Math.min(this.navH - 1, Math.floor(p.y / this.navCell)));
      if (this.navGrid[gy0 * this.navW + gx0]) return { gx: gx0, gy: gy0 };
      let best: { gx: number; gy: number } | null = null;
      let bestD = Infinity;
      const R = 8;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const gx = gx0 + dx;
          const gy = gy0 + dy;
          if (gx < 0 || gy < 0 || gx >= this.navW || gy >= this.navH) continue;
          if (!this.navGrid[gy * this.navW + gx]) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = { gx, gy };
          }
        }
      }
      return best;
    }

    /** BFS over the nav grid; returns native-px waypoints, lightly pruned. */
    findPath(from: Vec, to: Vec): Vec[] {
      const a = this.nearestNavCell(from);
      const b = this.nearestNavCell(to);
      if (!a || !b) return [];
      const W = this.navW;
      const H = this.navH;
      const prev = new Int32Array(W * H).fill(-1);
      const seen = new Uint8Array(W * H);
      const q: number[] = [a.gy * W + a.gx];
      seen[a.gy * W + a.gx] = 1;
      const target = b.gy * W + b.gx;
      let found = a.gy * W + a.gx === target;
      for (let head = 0; head < q.length && !found; head++) {
        const cur = q[head];
        const cx = cur % W;
        const cy = (cur / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (seen[ni] || !this.navGrid[ni]) continue;
          // No corner cutting on diagonals.
          if (dx !== 0 && dy !== 0 && (!this.navGrid[cy * W + nx] || !this.navGrid[ny * W + cx])) continue;
          seen[ni] = 1;
          prev[ni] = cur;
          if (ni === target) {
            found = true;
            break;
          }
          q.push(ni);
        }
      }
      if (!found) return [];
      const cells: number[] = [];
      for (let cur = target; cur !== -1; cur = prev[cur]) cells.push(cur);
      cells.reverse();
      const pts = cells.map((c) => ({
        x: (c % W) * this.navCell + this.navCell / 2,
        y: ((c / W) | 0) * this.navCell + this.navCell / 2,
      }));
      // Prune collinear runs so the walk reads as strides, not stutter.
      const out: Vec[] = [];
      for (let i = 0; i < pts.length; i++) {
        if (i === 0 || i === pts.length - 1) {
          out.push(pts[i]);
          continue;
        }
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if ((p1.x - p0.x) * (p2.y - p1.y) !== (p1.y - p0.y) * (p2.x - p1.x)) out.push(pts[i]);
      }
      out.push(to);
      return out;
    }

    moveActor(
      sprite: PhaserNS.GameObjects.Sprite,
      vx: number,
      vy: number,
      dt: number,
      speed: number,
    ): { moved: boolean; dir: Dir } {
      const len = Math.hypot(vx, vy);
      if (len === 0) return { moved: false, dir: this.facing };
      const nx = (vx / len) * speed * dt;
      const ny = (vy / len) * speed * dt;
      let moved = false;
      const tryX = { x: sprite.x + nx, y: sprite.y };
      if (nx !== 0 && walkable(this.room, tryX)) {
        sprite.x = tryX.x;
        moved = true;
      }
      const tryY = { x: sprite.x, y: sprite.y + ny };
      if (ny !== 0 && walkable(this.room, tryY)) {
        sprite.y = tryY.y;
        moved = true;
      }
      sprite.setDepth(sprite.y);
      return { moved, dir: dirOf(vx, vy, this.facing) };
    }

    update(_t: number, dtMs: number): void {
      const dt = Math.min(dtMs, 50) / 1000;

      // The customer walks regardless of pause: intake pauses the PLAYER,
      // not the person crossing the room.
      if (this.npc && this.npcPath.length > 0) {
        const target = this.npcPath[0];
        const dx = target.x - this.npc.x;
        const dy = target.y - this.npc.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 3) {
          this.npcPath.shift();
          if (this.npcPath.length === 0) {
            if (this.npcLeaving) {
              this.npc.destroy();
              this.npc = null;
              this.npcId = null;
              bridge.emit({ type: "customerGone" });
            } else {
              this.npc.anims.stop();
              if (this.npcId && this.textures.exists(`cust-${this.npcId}`)) {
                this.npc.setTexture(`cust-${this.npcId}`, DIRS.indexOf("north") * 8);
              }
              bridge.emit({ type: "customerAtCounter" });
            }
          }
        } else {
          const step = NPC_SPEED * dt;
          this.npc.x += (dx / dist) * step;
          this.npc.y += (dy / dist) * step;
          this.npc.setDepth(this.npc.y);
          const d = dirOf(dx, dy, "south");
          const key = `cust-${this.npcId}-walk-${d}`;
          if (this.npcId && this.anims.exists(key)) this.npc.anims.play(key, true);
        }
      }

      (window as unknown as { __kpRoom?: object }).__kpRoom = {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        room: this.roomId,
        prompt: this.currentPrompt,
        npc: this.npc ? { id: this.npcId, x: Math.round(this.npc.x), y: Math.round(this.npc.y) } : null,
        paused: this.paused,
        seated: this.seated,
        path: this.clickPath.length,
        cam: {
          sx: Math.round(this.cameras.main.scrollX * 10) / 10,
          sy: Math.round(this.cameras.main.scrollY * 10) / 10,
          zoom: this.cameras.main.zoom,
        },
      };

      if (this.paused || this.seated) {
        this.player.anims.play(`son-idle-${this.facing}`, true);
        return;
      }

      let vx = 0;
      let vy = 0;
      if (this.keys) {
        if (this.keys.A?.isDown || this.keys.LEFT?.isDown) vx -= 1;
        if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) vx += 1;
        if (this.keys.W?.isDown || this.keys.UP?.isDown) vy -= 1;
        if (this.keys.S?.isDown || this.keys.DOWN?.isDown) vy += 1;
      }
      if (vx !== 0 || vy !== 0) {
        this.clickTarget = null;
        this.clickPath = [];
        this.clickStation = null;
      } else if (this.clickTarget) {
        const dx = this.clickTarget.x - this.player.x;
        const dy = this.clickTarget.y - this.player.y;
        if (Math.hypot(dx, dy) < 6) {
          this.clickPath.shift();
          this.clickTarget = this.clickPath.length > 0 ? this.clickPath[0] : null;
          if (!this.clickTarget && this.clickStation) {
            // The walk completed at the station's own stand point: the walk
            // was the intent, the interaction is the payoff.
            bridge.emit({ type: "interact", station: this.clickStation.id });
            this.clickStation = null;
          }
        } else {
          vx = dx;
          vy = dy;
        }
      }

      const before = { x: this.player.x, y: this.player.y };
      const { moved, dir } = this.moveActor(this.player, vx, vy, dt, WALK_SPEED);
      if (moved) {
        this.facing = dir;
        this.player.anims.play(`son-walk-${dir}`, true);
        this.stepClock += dt;
        if (this.stepClock > 0.27) {
          this.stepClock = 0;
          bridge.emit({ type: "step" });
        }
        this.stuckClock = 0;
      } else {
        this.player.anims.play(`son-idle-${this.facing}`, true);
        // A blocked click walk gives up quietly instead of running in place.
        if (this.clickTarget && before.x === this.player.x && before.y === this.player.y) {
          this.stuckClock += dt;
          if (this.stuckClock > 0.25) {
            this.stuckClock = 0;
            // Wedged against a corner: skip to the next waypoint before
            // giving up on the walk entirely.
            if (this.clickPath.length > 1) {
              this.clickPath.shift();
              this.clickTarget = this.clickPath[0];
            } else {
              this.clickTarget = null;
              this.clickPath = [];
              if (this.clickStation) {
                if (inRect({ x: this.player.x, y: this.player.y }, this.clickStation.zone)) {
                  bridge.emit({ type: "interact", station: this.clickStation.id });
                }
                this.clickStation = null;
              }
            }
          }
        }
      }

      // The live station under the player's feet drives the prompt.
      const it = interactableAt(this.room, { x: this.player.x, y: this.player.y });
      const promptId = it ? it.id : null;
      if (promptId !== this.currentPrompt) {
        this.currentPrompt = promptId;
        bridge.emit({ type: "prompt", station: promptId });
        if (it) {
          this.promptMarker.setPosition(it.anchor.x, it.anchor.y - 8);
          this.promptMarker.setVisible(true);
        } else {
          this.promptMarker.setVisible(false);
        }
      }

      if (this.interactQueued) {
        this.interactQueued = false;
        if (it) bridge.emit({ type: "interact", station: it.id });
      }

      this.applyPhaseTint();
      this.refreshStates();
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#070510",
    pixelArt: true,
    roundPixels: true,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 640,
      height: parent.clientHeight || 400,
    },
    scene: [RoomScene],
  });

  return {
    destroy() {
      game.destroy(true);
    },
  };
}
