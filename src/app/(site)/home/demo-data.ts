/** Homepage demo: E7 architecture is photo-informed; all underwriting results are simulated. */
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
  name: "Waterloo Engineering 7",
  address: "University of Waterloo · East campus",
  id: "AST–E007",
  value: "Demo schedule",
  area: "242,000 sq ft",
  match: 92,
  riskScore: 28,
};
export const RISK_SIGNALS: RiskSignal[] = [
  {
    id: "roof",
    label: "Roof condition",
    shortLabel: "Roof survey",
    value: "Rooftop plant & skylights",
    severity: "attention",
    position: [-1.5, 8.9, 0.2],
    revealAt: 2100,
    source: "E7 exterior photos · roof view",
    finding: "Roof records require review",
    reasoning:
      "The reference photos inform the roof plant and sawtooth atrium geometry. Roof age, membrane condition, and maintenance come from current records, which Astra requests in this simulated assessment.",
  },
  {
    id: "fire",
    label: "Fire protection",
    shortLabel: "Fire protection",
    value: "Trace the protection route",
    severity: "attention",
    position: [6.7, 0.8, 2.6],
    revealAt: 2700,
    source: "Illustrative protection scenario",
    finding: "Protection certificate requested",
    reasoning:
      "The animated hydrant and sprinkler route demonstrate how Astra could trace protection evidence through a multi-storey property. Equipment positions and coverage are illustrative.",
  },
  {
    id: "flood",
    label: "Surface water",
    shortLabel: "Surface water",
    value: "Explore surface-water rise",
    severity: "attention",
    position: [8.2, 0.5, 1.7],
    revealAt: 3200,
    source: "Illustrative campus water scenario",
    finding: "Drainage & elevations to verify",
    reasoning:
      "The slider illustrates water accumulation near the paved entry and service area. A flood map, elevation survey, and assigned flood zone for E7 would come from site records, which Astra would request.",
  },
  {
    id: "construction",
    label: "Building construction",
    shortLabel: "Structure",
    value: "Seven-storey academic building",
    severity: "good",
    position: [5.85, 5.3, 0.5],
    revealAt: 3700,
    source: "Exterior photos · plan & section",
    finding: "Envelope and structure separated",
    reasoning:
      "The model uses the supplied plans and section to show floor plates, the E5–E7 atrium, and the external envelope. Structural members are an interpretation; engineering records would determine the insurance construction classification.",
  },
  {
    id: "hazards",
    label: "Campus connections",
    shortLabel: "Campus connections",
    value: "E5 atrium & enclosed links",
    severity: "attention",
    position: [-7.8, 3.6, 2.95],
    revealAt: 4200,
    source: "Campus photos · connected-building review",
    finding: "Connected-building exposure review",
    reasoning:
      "Enclosed links and the shared E5–E7 atrium create connected-building questions for an underwriter. Astra would request compartmentation, occupancy, and shared-services evidence before drawing a conclusion from a photograph.",
  },
  {
    id: "business",
    label: "Academic operations",
    shortLabel: "Atrium & labs",
    value: "Teaching, research & robotics",
    severity: "good",
    position: [4.65, 3.7, -3],
    revealAt: 4700,
    source: "E7 public program · interpreted interior",
    finding: "Teaching & research occupancy",
    reasoning:
      "E7 houses engineering education, research, and robotics spaces. The model recreates the atrium's red stairs, bridges, study pods, and illustrative teaching workspaces. Specific room layouts and laboratory equipment are approximate.",
  },
  {
    id: "claims",
    label: "Claims history",
    shortLabel: "Claims history",
    value: "Sample records only",
    severity: "good",
    position: [-8.1, 0.8, -1.5],
    revealAt: 5200,
    source: "Synthetic five-year loss-run example",
    finding: "Demo evidence linked to property",
    reasoning:
      "These loss records are fictional examples used to demonstrate evidence linking. The University of Waterloo's real claims history stays entirely separate from this demo.",
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
      ["Property", "Waterloo Engineering 7"],
      ["Schedule", "Illustrative underwriting submission"],
      ["Occupancy", "Teaching & research"],
      ["Evidence", "Photos, floor plan & building section"],
    ],
  },
  {
    label: "Enrichment",
    title: "The property is only the beginning.",
    description:
      "Site context adds the details a submission leaves out.",
    time: "00:01",
    items: [
      ["Published floor area", "242,000 sq ft"],
      ["Building form", "Seven-storey academic building"],
      ["Campus connection", "E5–E7 atrium"],
      ["External access", "Enclosed pedestrian bridges"],
    ],
  },
  {
    label: "Investigation",
    title: "Every finding has a foundation.",
    description:
      "Open a finding to follow the evidence and understand what still needs a closer look.",
    time: "00:03",
    items: [
      ["Roof condition", "Current maintenance evidence needed"],
      ["Surface water", "Illustrative scenario · verify elevations"],
      ["Connected buildings", "Review compartmentation"],
      ["Claims history", "Synthetic demonstration records"],
    ],
  },
  {
    label: "Appetite",
    title: "The right risk. The right appetite.",
    description:
      "Astra weighs the property against a sample carrier appetite, making exceptions visible.",
    time: "00:06",
    items: [
      ["Academic occupancy", "Sample appetite alignment"],
      ["Construction", "Engineering records to verify"],
      ["Loss experience", "Demonstration only"],
      ["Appetite match", "92% · simulated result"],
    ],
  },
  {
    label: "Decision",
    title: "A clear recommendation. Your call.",
    description:
      "Evidence and open questions come together in a review-ready decision. The underwriter stays in control.",
    time: "00:07",
    items: [
      ["Recommendation", "Proceed to quote review · demo"],
      ["Risk score", "28 / 100 · simulated"],
      ["Conditions", "Verify protection, roof & drainage"],
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
