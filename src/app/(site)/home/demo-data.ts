/** Homepage-only illustrative data. Replace this adapter with Astra agent output. */
export type RiskId =
  | "roof"
  | "flood"
  | "fire"
  | "construction"
  | "hazards"
  | "business"
  | "claims";
export type RiskSignal = {
  id: RiskId;
  label: string;
  shortLabel: string;
  value: string;
  severity: "good" | "attention";
  position: [number, number, number];
  revealAt: number;
  source: string;
  reasoning: string;
  finding: string;
};
export const DEMO_DURATION = 7600;
export const DEMO_PROPERTY = {
  name: "Northline Fabrication",
  address: "142 Industrial Way · Commercial property",
  id: "AST–0142",
  value: "$3.2M",
  area: "24,800 sq ft",
  match: 92,
  riskScore: 28,
};
export const RISK_SIGNALS: RiskSignal[] = [
  {
    id: "roof",
    label: "Roof condition",
    shortLabel: "Roof condition",
    value: "Roof age: 18 years",
    severity: "attention",
    position: [-2.8, 4.05, -0.2],
    revealAt: 2100,
    source: "Property schedule · p. 3",
    finding: "Roof inspection recommended",
    reasoning:
      "The scheduled roof is 18 years old. Age raises a maintenance question, but does not establish damage. Request a recent inspection and confirm any replacement work before quoting.",
  },
  {
    id: "fire",
    label: "Fire protection",
    shortLabel: "Fire protection",
    value: "Hydrant within 30 m",
    severity: "good",
    position: [1.65, 0.85, 3.27],
    revealAt: 2700,
    source: "Site survey · fire protection",
    finding: "Sprinklers and hydrant documented",
    reasoning:
      "The submission documents full sprinkler coverage and a nearby hydrant. These are favorable protection signals. Confirm the most recent sprinkler inspection with the broker.",
  },
  {
    id: "flood",
    label: "Flood exposure",
    shortLabel: "Flood exposure",
    value: "Flood Zone AE",
    severity: "attention",
    position: [8.65, 0.6, 1.0],
    revealAt: 3200,
    source: "Illustrative flood map · site overlay",
    finding: "Zone AE · separate flood review",
    reasoning:
      "The illustrative map places the drainage edge in Zone AE. A map boundary alone does not establish building-level exposure. Confirm the surveyed elevation and refer flood coverage for separate review.",
  },
  {
    id: "construction",
    label: "Building construction",
    shortLabel: "Construction",
    value: "Noncombustible · Class 3",
    severity: "good",
    position: [3.6, 2.7, 0.7],
    revealAt: 3700,
    source: "Statement of values · p. 2",
    finding: "Noncombustible construction",
    reasoning:
      "Steel framing and masonry walls are consistent with the submitted noncombustible classification. The selected demonstration appetite accepts this construction class, subject to verification.",
  },
  {
    id: "hazards",
    label: "Nearby hazards",
    shortLabel: "Nearby hazards",
    value: "Elevated fire exposure",
    severity: "attention",
    position: [6.1, 3.6, -4],
    revealAt: 4200,
    source: "Adjacent occupancy · site survey",
    finding: "Adjacent warehouse requires review",
    reasoning:
      "A neighboring warehouse introduces an external fire exposure. Confirm its occupancy, stored materials, and separation distance. This is a review item, not evidence of an active fire hazard.",
  },
  {
    id: "business",
    label: "Business type",
    shortLabel: "Business type",
    value: "Light manufacturing",
    severity: "good",
    position: [-4.5, 1.8, 1.7],
    revealAt: 4700,
    source: "ACORD submission · operations",
    finding: "Operations align with appetite",
    reasoning:
      "The broker describes light metal fabrication without foundry operations. That business type falls within the demonstration carrier appetite. Any hot work requires documented controls.",
  },
  {
    id: "claims",
    label: "Claims history",
    shortLabel: "Claims history",
    value: "No losses in 5 years",
    severity: "good",
    position: [-8.7, 1.1, -1.5],
    revealAt: 5200,
    source: "Five-year loss runs · p. 1–5",
    finding: "Five-year loss history is clear",
    reasoning:
      "The sample loss runs report no claims over five years. This supports a favorable history assessment; confirm the loss-run dates and continuity before final review.",
  },
];
export const WORKFLOW = [
  {
    label: "Submission",
    title: "Messy documents. Structured facts.",
    description:
      "Astra reads the submission and connects every extracted fact to its source.",
    time: "00:00",
    items: [
      ["Insured", "Northline Fabrication"],
      ["Total insured value", "$3,200,000"],
      ["Occupancy", "Light manufacturing"],
      ["Construction", "Noncombustible · Class 3"],
    ],
  },
  {
    label: "Enrichment",
    title: "The property is only the beginning.",
    description:
      "Site context adds the details a submission cannot tell you on its own.",
    time: "00:01",
    items: [
      ["Property footprint", "24,800 sq ft"],
      ["Fire protection", "Hydrant within 30 m"],
      ["Drainage proximity", "Eastern property boundary"],
      ["Adjacent occupancy", "Masonry warehouse"],
    ],
  },
  {
    label: "Investigation",
    title: "Every finding has a foundation.",
    description:
      "Open a finding to follow the evidence and understand what still needs a closer look.",
    time: "00:03",
    items: [
      ["Roof condition", "Inspection recommended"],
      ["Flood exposure", "Zone AE · review required"],
      ["Adjacent warehouse", "Confirm separation & occupancy"],
      ["Claims history", "No losses in 5 years"],
    ],
  },
  {
    label: "Appetite",
    title: "The right risk. The right appetite.",
    description:
      "Astra weighs the property against a sample carrier appetite, making exceptions visible.",
    time: "00:06",
    items: [
      ["Business class", "Within appetite"],
      ["Construction", "Within appetite"],
      ["Loss experience", "Favorable"],
      ["Appetite match", "92% · strong alignment"],
    ],
  },
  {
    label: "Decision",
    title: "A clear recommendation. Your call.",
    description:
      "Evidence and open questions come together in a review-ready decision. The underwriter stays in control.",
    time: "00:07",
    items: [
      ["Recommendation", "Proceed to quote review"],
      ["Risk score", "28 / 100 · moderate-low"],
      ["Conditions", "Roof inspection + flood review"],
      ["Final authority", "Human underwriter"],
    ],
  },
] as const;
export function getPhase(elapsed: number) {
  if (elapsed < 1200) return 0;
  if (elapsed < 2400) return 1;
  if (elapsed < 5600) return 2;
  if (elapsed < 6600) return 3;
  return 4;
}
