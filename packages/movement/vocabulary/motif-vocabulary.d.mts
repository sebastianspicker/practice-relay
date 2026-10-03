/** Generated from motif-vocabulary.json. Do not edit manually. */
/** One Motif symbol generated from the canonical vocabulary. */
export interface MotifVocabularyEntry {
  readonly id: string;
  readonly group: string;
  readonly label: string;
}

export const MOTIF_VOCABULARY: readonly [
  { readonly id: "walk"; readonly group: "locomotion"; readonly label: "Walk"; },
  { readonly id: "run"; readonly group: "locomotion"; readonly label: "Run"; },
  { readonly id: "turn"; readonly group: "rotation"; readonly label: "Turn"; },
  { readonly id: "stillness"; readonly group: "pause"; readonly label: "Stillness"; },
  { readonly id: "gesture_arm"; readonly group: "gesture"; readonly label: "Arm gesture"; },
  { readonly id: "gesture_leg"; readonly group: "gesture"; readonly label: "Leg gesture"; },
  { readonly id: "travel"; readonly group: "locomotion"; readonly label: "Travel"; },
  { readonly id: "jump"; readonly group: "locomotion"; readonly label: "Jump"; },
  { readonly id: "fall"; readonly group: "weight"; readonly label: "Fall"; },
  { readonly id: "rise"; readonly group: "weight"; readonly label: "Rise"; },
  { readonly id: "twist"; readonly group: "rotation"; readonly label: "Twist"; },
  { readonly id: "balance"; readonly group: "support"; readonly label: "Balance"; },
  { readonly id: "effort_strong"; readonly group: "effort"; readonly label: "Strong effort"; },
  { readonly id: "effort_light"; readonly group: "effort"; readonly label: "Light effort"; },
  { readonly id: "phrase_begin"; readonly group: "phrasing"; readonly label: "Phrase begin"; },
  { readonly id: "phrase_end"; readonly group: "phrasing"; readonly label: "Phrase end"; },
];

export const MOTIF_SYMBOL_IDS: readonly [
  "walk",
  "run",
  "turn",
  "stillness",
  "gesture_arm",
  "gesture_leg",
  "travel",
  "jump",
  "fall",
  "rise",
  "twist",
  "balance",
  "effort_strong",
  "effort_light",
  "phrase_begin",
  "phrase_end",
];
