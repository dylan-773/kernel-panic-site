import { DiveType } from "./types";

/**
 * Static flavor library in the GDD voice: customer profiles and outcome
 * beats, written ahead of time and lightly randomized at runtime. The shipped
 * prototype makes no API calls while it is being played.
 */

export interface TypeMeta {
  name: string;
  stat: string;
  tag: string;
  objective: string;
  rules: string[];
}

export const TYPE_META: Record<DiveType, TypeMeta> = {
  hardware: {
    name: "Hardware",
    stat: "Resilience",
    tag: "Baseline dive. No timer. Read the board, force the metal.",
    objective: "Route the signal from the intake port to the core.",
    rules: [
      "Tap a junction to rotate it. Signal flows through connected arms.",
      "The dual gate opens only when fed from two separate directions.",
      "Jammed connectors need repeated force taps before they turn.",
      "Off-route cache nodes hold salvage. Light them up for extra pay.",
    ],
  },
  network: {
    name: "Network",
    stat: "Speed",
    tag: "An intruder is racing you to the core. Route faster than it climbs.",
    objective: "Connect your port to the core before the intruder does.",
    rules: [
      "The intruder advances along its own line on the right side.",
      "It will freeze your controls, lock junctions, and scramble solved work.",
      "Your route stays yours. Rebuild what it breaks and keep moving.",
      "Reach the core first and the intrusion collapses.",
    ],
  },
  data: {
    name: "Data Recovery",
    stat: "Capacity",
    tag: "The drive is mined with corruption. Clean routes recover everything.",
    objective: "Reach the core and light every data fragment on the way.",
    rules: [
      "Corrupt sectors never conduct. Any live connection into one detonates it.",
      "A detonation burns nearby sectors and destroys unrecovered fragments.",
      "Rotate junctions near corruption while they are dark, not while live.",
      "Finish near the reference move count to keep integrity high.",
    ],
  },
  software: {
    name: "Software",
    stat: "Perception",
    tag: "Five bugs hide in plain sight. The ping shows them, memory keeps them.",
    objective: "Route power to every bug before the crash timer runs out.",
    rules: [
      "Bug nodes look identical to ordinary junctions.",
      "A periodic ping reveals their positions and their order, then hides them.",
      "Each bug you reach extends the timer. In sequence order it extends more.",
      "Patch all five and the process stabilizes.",
    ],
  },
};

export interface Customer {
  name: string;
  device: string;
  quote: string;
}

const CUSTOMERS: Record<DiveType, Customer[]> = {
  hardware: [
    {
      name: "Mara Voss",
      device: "Ryoku 9 neural deck",
      quote:
        "It powers on, screams once, and dies. My whole contract archive is on that deck.",
    },
    {
      name: "Otto Grieves",
      device: "Bellweather fabricator arm",
      quote: "Third shop this month. The other two said the bus was fused shut. Prove them wrong.",
    },
    {
      name: "Sable Okonkwo",
      device: "Kestrel courier drone",
      quote: "She clips left on every launch. Something in the spine is not seating right.",
    },
  ],
  network: [
    {
      name: "Petra Lin",
      device: "Anchorline home node",
      quote: "Something is inside my node right now. It locked me out of my own kitchen.",
    },
    {
      name: "Deacon Frey",
      device: "Tessellate storefront hub",
      quote: "My register keeps paying someone in Novagrad. Get it out before close of business.",
    },
    {
      name: "June Aksoy",
      device: "Halcyon clinic gateway",
      quote: "Patient records. Please be fast, and please be quiet about it.",
    },
  ],
  data: [
    {
      name: "Ezra Malachi",
      device: "Coldvault drive brick",
      quote: "Eleven years of family footage. The drive fell in the canal. Save what you can.",
    },
    {
      name: "Wren Tallis",
      device: "Studio master ledger",
      quote: "The album masters are in there. The label wants them Friday. No pressure.",
    },
    {
      name: "Ibis Marchetti",
      device: "Survey rover cartridge",
      quote: "Half the sector map corrupted on reentry. The other half is worth a fortune.",
    },
  ],
  software: [
    {
      name: "Callum Dray",
      device: "Cyberphone OS image",
      quote: "It crashes every four minutes. I timed it. Four minutes, every time.",
    },
    {
      name: "Nadia Reyes",
      device: "Loomwright compiler rig",
      quote: "Five bugs. I found them, I lost them, I found them again. I give up. You find them.",
    },
    {
      name: "Foster Yee",
      device: "Arcade cabinet brain",
      quote: "High score table eats a name every night at 3 AM. The regulars are furious.",
    },
  ],
};

const SUCCESS: Record<DiveType, string[]> = {
  hardware: [
    "The core lights and holds. The deck hums back to life on the bench, and the customer exhales for the first time since they walked in.",
    "Signal seated, connectors freed. The machine boots clean twice in a row. That is a repair you can invoice with a straight face.",
  ],
  network: [
    "Your route reaches the core first. The intruder's line collapses behind it like a cut cable, and the node goes quiet.",
    "Core secured. The intrusion unravels sector by sector, and somewhere far away, someone curses at a dead connection.",
  ],
  data: [
    "The last fragment lights and the archive reassembles. What looked like a dead brick leaves the shop as a working memory.",
    "Recovery complete. The corruption never touched the route, and the customer will never know how close it came.",
  ],
  software: [
    "The fifth patch lands and the crash counter goes silent. The process settles into a steady, boring, beautiful idle.",
    "All bugs pinned and patched. The OS boots straight through where it used to choke. Clean work.",
  ],
};

const FAILURE: Record<DiveType, string[]> = {
  hardware: [
    "The route never seats and the dive collapses. The customer takes the deck back with both hands and does not say goodbye.",
    "The core stays dark. Neural capacity spent, payout gone, and the bench feels heavier than it did this morning.",
  ],
  network: [
    "The intruder reaches the core before you do. The node locks you out along with its owner, who is now standing at the counter.",
    "Breach complete. Not yours, theirs. The customer watches you unplug their compromised hub in silence.",
  ],
  data: [
    "The drive gives up before the route completes. What was recoverable an hour ago is noise now.",
    "Too much corruption touched the route. The archive comes back in pieces too small to matter.",
  ],
  software: [
    "The crash timer hits zero mid-route. The image wipes itself out of spite, and the customer's face does something complicated.",
    "The bugs win this one. The process crashes with your patch half applied, which is somehow worse than not trying.",
  ],
};

export function pickCustomer(type: DiveType, seed: number): Customer {
  const pool = CUSTOMERS[type];
  return pool[Math.abs(seed) % pool.length];
}

export function pickOutcome(type: DiveType, seed: number, won: boolean): string {
  const pool = won ? SUCCESS[type] : FAILURE[type];
  return pool[Math.abs(seed >> 3) % pool.length];
}
