import { OppMode } from "./kit";

/**
 * The duel-era customer roster. Twelve regulars, six shared pixel portraits,
 * written ahead of time in the copy.ts voice. Every job is an intrusion now:
 * something is inside the device, and the fix is a race to the core.
 */

export interface CustomerProfile {
  id: string;
  name: string;
  device: string;
  /** Public asset path of the pixel portrait. */
  portrait: string;
  /** Intake lines, one drawn per job. */
  quotes: [string, string];
  winLine: string;
  lossLine: string;
  /** Difficulty tiers (1..5) this customer's jobs appear at. */
  tiers: number[];
  dominant: OppMode;
}

export const CUSTOMERS: CustomerProfile[] = [
  {
    id: "juno-vex",
    name: "Juno Vex",
    device: "Hexlight arcade handheld",
    portrait: "/assets/px/portraits/cust-06.png",
    quotes: [
      "There is a second player in there. No cart, no link, and it keeps setting records I cannot touch.",
      "It runs faster every boot. Yesterday the menu loaded before I pressed anything. That is not a feature.",
    ],
    winLine: "The records are mine again. First try. Tell nobody how long that actually took me.",
    lossLine: "The ghost keeps the high score. And the handheld.",
    tiers: [1, 2],
    dominant: "armSiphon",
  },
  {
    id: "sable-okonkwo",
    name: "Sable Okonkwo",
    device: "Kestrel courier drone",
    portrait: "/assets/px/portraits/cust-01.png",
    quotes: [
      "Something in her nav keeps rewriting my routes. She flew a package to the wrong district twice and looked proud of it.",
      "I lock the flight plan, it unlocks it. I set a waypoint, it moves it. Get it out of my drone.",
    ],
    winLine: "She flies straight again. First clean run all month. You are on my good list, which is short.",
    lossLine: "The drone flies for somebody else now.",
    tiers: [1, 2],
    dominant: "redirect",
  },
  {
    id: "aldous-wick",
    name: "Aldous Wick",
    device: "Meridian ledger terminal",
    portrait: "/assets/px/portraits/cust-02.png",
    quotes: [
      "Every entry I touch costs me twice. It leaves little surprises in my books and waits for me to step on them.",
      "Forty years of accounts in that terminal, and now the machine bites the hand that files.",
    ],
    winLine: "The books balance. First time since spring. You do honest work, son.",
    lossLine: "Forty years of accounts, and it kept every one.",
    tiers: [1, 2, 3],
    dominant: "armHalt",
  },
  {
    id: "wren-tallis",
    name: "Wren Tallis",
    device: "Studio master ledger",
    portrait: "/assets/px/portraits/cust-03.png",
    quotes: [
      "Something is hiding in the masters. I can hear it breathing between tracks and I cannot find it.",
      "Notes go missing overnight. Not deleted, hidden. It is playing hide and seek with my album.",
    ],
    winLine: "Every track is back. Even the ones I forgot I wrote. You beautiful person.",
    lossLine: "The album belongs to whatever is in there now.",
    tiers: [1, 2],
    dominant: "ward",
  },
  {
    id: "bram-hollander",
    name: "Bram Hollander",
    device: "Copperline register hub",
    portrait: "/assets/px/portraits/cust-05.png",
    quotes: [
      "My own register shields the till from me. Me. I have owned that machine for eleven years.",
      "It walls off a different drawer every day. Today it is the receipts. Tomorrow, who knows, the front door.",
    ],
    winLine: "The till opens for its rightful owner. I could kiss you. I will not.",
    lossLine: "Eleven years of loyalty, and the register picked the intruder.",
    tiers: [2, 3],
    dominant: "lock",
  },
  {
    id: "dex-marlowe",
    name: "Dex Marlowe",
    device: "Nocta cram deck",
    portrait: "/assets/px/portraits/cust-06.png",
    quotes: [
      "It undoes my homework. I finish a page, it reroutes the file somewhere I cannot follow.",
      "My study plan keeps pointing at the arcade. I did not set that. I would have, but I did not.",
    ],
    winLine: "My essay is back and it is due in an hour. You are my favorite adult. Low bar, still.",
    lossLine: "The deck kept the essay. And the kid's trust.",
    tiers: [2, 3],
    dominant: "redirect",
  },
  {
    id: "june-aksoy",
    name: "June Aksoy",
    device: "Halcyon clinic gateway",
    portrait: "/assets/px/portraits/cust-04.png",
    quotes: [
      "The gateway walls off a ward at a time. Last night it was pediatrics. Please be fast, and please be quiet about it.",
      "It locks the charts the second a shift changes. Like it knows when we are fewest.",
    ],
    winLine: "Charts are open and the wards are talking to each other. I owe you a coffee and my silence.",
    lossLine: "The clinic gateway stayed shut. So did she, on the way out.",
    tiers: [3, 4],
    dominant: "ward",
  },
  {
    id: "ines-calloway",
    name: "Ines Calloway",
    device: "Ferrox lifter exosuit",
    portrait: "/assets/px/portraits/cust-01.png",
    quotes: [
      "It cuts my grip servos mid lift, forty crates up. It waits for the worst second. It is good at picking it.",
      "Whatever is in there shuts my systems down one at a time, like it is testing which one I will miss most.",
    ],
    winLine: "Servos held through a full lift. No drops. I might even sleep tonight.",
    lossLine: "The suit dropped one crate too many. So did you.",
    tiers: [3, 4],
    dominant: "armHalt",
  },
  {
    id: "emeric-snow",
    name: "Emeric Snow",
    device: "Ivora chess cabinet",
    portrait: "/assets/px/portraits/cust-02.png",
    quotes: [
      "Fifty years I have played that cabinet. Last month it stopped playing chess and started playing me.",
      "It knows my moves before I make them. There is a door in that machine somebody left open.",
    ],
    winLine: "It plays fair again. Lost to it twice this morning. Felt wonderful.",
    lossLine: "The cabinet is still playing. You resigned for both of us.",
    tiers: [4, 5],
    dominant: "purge",
  },
  {
    id: "vera-stanek",
    name: "Vera Stanek",
    device: "Apothek dosage safe",
    portrait: "/assets/px/portraits/cust-04.png",
    quotes: [
      "It waits until I reach for the keypad, then it kills the lights. The whole dispensary, dark, every time.",
      "The safe rations power like it rations pills. Tonight it decided the cold storage units were optional.",
    ],
    winLine: "Lights stay on and the safe stays honest. Night shift thanks you. Loudly, for once.",
    lossLine: "The dispensary went dark. It is still dark.",
    tiers: [4, 5],
    dominant: "armSiphon",
  },
  {
    id: "casimir-bell",
    name: "Casimir Bell",
    device: "Ledgerstone pawn vault",
    portrait: "/assets/px/portraits/cust-05.png",
    quotes: [
      "My vault grew a lock I did not buy. It walls itself up at noon like it has somewhere better to be.",
      "Everything my customers trusted me with is behind that wall, and the wall gets a new layer every day.",
    ],
    winLine: "The vault opens on my word again. Take something off the shelf. Within reason.",
    lossLine: "The vault kept his customers' things. And his word.",
    tiers: [4, 5],
    dominant: "lock",
  },
  {
    id: "noor-behzadi",
    name: "Noor Behzadi",
    device: "Polyverb synth brain",
    portrait: "/assets/px/portraits/cust-03.png",
    quotes: [
      "It performs while I sleep. There are recordings of sets I never played. My style, but colder.",
      "Something slips into my rig through a door I cannot find, and it is getting better than me.",
    ],
    winLine: "The rig plays what I play and nothing else. The imposter era is over.",
    lossLine: "The rig plays on without her. Cold, perfect, not hers.",
    tiers: [4, 5],
    dominant: "purge",
  },
];
