/** Camera and inspection metadata for the illustrative digital twin. No live service claims. */
import type { RiskId } from "./demo-data";
export type CameraPreset = "site" | "roof" | "street" | "plan";
export type CameraAction = CameraPreset | "zoom-in" | "zoom-out";
export type CameraCommand = { action: CameraAction; revision: number };
export type SceneInspection = { waterLevel: number; cutaway: boolean };
export const CAMERA_VIEWS: Record<
  CameraPreset,
  {
    label: string;
    yaw: number;
    pitch: number;
    zoom: number;
    target: [number, number, number];
  }
> = {
  site: {
    label: "Site overview",
    yaw: 0.67,
    pitch: 0.93,
    zoom: 1,
    target: [0, 0.65, 0],
  },
  roof: {
    label: "Roof survey",
    yaw: 0.18,
    pitch: 0.43,
    zoom: 1.65,
    target: [-0.7, 2.2, -1.4],
  },
  street: {
    label: "Street level",
    yaw: 0.32,
    pitch: 1.36,
    zoom: 1.55,
    target: [-0.7, 1.7, 0.4],
  },
  plan: {
    label: "Site plan",
    yaw: 0,
    pitch: 0.07,
    zoom: 1.05,
    target: [0, 0, 0],
  },
};
export const INSPECTIONS: Record<
  RiskId,
  {
    action: string;
    summary: string;
    metric: string;
    metricLabel: string;
    steps: [string, string, string];
    sourceExcerpt: string;
    sourceKind: string;
    nextAction: string;
    view: {
      yaw: number;
      pitch: number;
      zoom: number;
      target: [number, number, number];
    };
  }
> = {
  roof: {
    action: "Inspect roof",
    summary:
      "Astra compares the scheduled roof age with visible rooftop features and flags the evidence still needed.",
    metric: "18 years",
    metricLabel: "Scheduled roof age",
    steps: [
      "Read the property schedule",
      "Locate roof services & maintenance patches",
      "Request a current roof inspection",
    ],
    sourceExcerpt:
      '"Roof installed: 2008. Standing-seam metal. Two rooftop mechanical units. Replacement date: not provided."',
    sourceKind: "Property schedule · page 3",
    nextAction: "Request a dated roof-condition report.",
    view: { yaw: 0.16, pitch: 0.5, zoom: 1.58, target: [-1.2, 2.4, -1.3] },
  },
  flood: {
    action: "Explore flood exposure",
    summary:
      "Raise the illustrative water level to see how the drainage boundary relates to the property. This is a scenario, not a flood prediction.",
    metric: "Zone AE",
    metricLabel: "Illustrative map classification",
    steps: [
      "Locate the property boundary",
      "Compare drainage & finished floor",
      "Refer elevation uncertainty for review",
    ],
    sourceExcerpt:
      '"Eastern drainage boundary intersects Zone AE. Finished-floor elevation and elevation certificate are not included."',
    sourceKind: "Sample flood overlay · site boundary",
    nextAction: "Obtain an elevation certificate and review flood terms.",
    view: { yaw: 1.02, pitch: 0.78, zoom: 1.3, target: [3.5, 0.55, -0.2] },
  },
  fire: {
    action: "Trace fire protection",
    summary:
      "Follow the protection path from the hydrant to the building and see where sprinkler coverage supports the assessment.",
    metric: "30 m",
    metricLabel: "Reported hydrant distance",
    steps: [
      "Extract sprinkler declarations",
      "Trace site fire-protection access",
      "Check inspection currency",
    ],
    sourceExcerpt:
      '"Automatic sprinklers: 100%. Public hydrant: within 30 metres. Last sprinkler inspection: date to be confirmed."',
    sourceKind: "Site survey · protection section",
    nextAction: "Confirm the latest sprinkler inspection certificate.",
    view: { yaw: 0.35, pitch: 1.1, zoom: 1.48, target: [0.1, 1.5, 0.4] },
  },
  construction: {
    action: "Reveal the structure",
    summary:
      "Open the building to connect the construction classification to its steel frame, exterior envelope, and occupied space.",
    metric: "Class 3",
    metricLabel: "Submitted construction class",
    steps: [
      "Read the construction declaration",
      "Separate envelope, roof & structural frame",
      "Compare with carrier construction rules",
    ],
    sourceExcerpt:
      '"Noncombustible construction. Steel frame, masonry exterior walls, metal roof deck. No combustible structural additions declared."',
    sourceKind: "Statement of values · page 2",
    nextAction: "Confirm all additions match the declared construction.",
    view: { yaw: 0.83, pitch: 0.94, zoom: 1.35, target: [-1, 2, -1] },
  },
  hazards: {
    action: "Inspect adjacent exposure",
    summary:
      "Astra measures the relationship to the neighboring occupancy and separates confirmed site facts from unanswered questions.",
    metric: "Review",
    metricLabel: "Adjacent occupancy status",
    steps: [
      "Identify the neighboring warehouse",
      "Inspect separation and loading areas",
      "Request stored-materials information",
    ],
    sourceExcerpt:
      '"Adjacent use: warehouse. Stored materials: unspecified. Separation distance: requires confirmation from site survey."',
    sourceKind: "Adjacent occupancy · broker notes",
    nextAction: "Confirm separation distance and stored materials.",
    view: { yaw: 1.1, pitch: 0.85, zoom: 1.36, target: [3.4, 1.1, -3] },
  },
  business: {
    action: "Inspect operations",
    summary:
      "Look inside the facility as Astra connects declared operations to equipment, inventory, and the carrier's class of business.",
    metric: "Manufacturing",
    metricLabel: "Declared business type",
    steps: [
      "Read the operations description",
      "Review manufacturing and storage areas",
      "Check hot-work controls against appetite",
    ],
    sourceExcerpt:
      '"Light metal fabrication and assembly. No foundry operations. Hot work is performed under a documented permit procedure."',
    sourceKind: "ACORD submission · operations",
    nextAction: "Verify hot-work procedures and inventory limits.",
    view: { yaw: 0.5, pitch: 0.85, zoom: 1.5, target: [-1, 1.2, -1.5] },
  },
  claims: {
    action: "Review loss history",
    summary:
      "Astra links five years of loss runs to this property, checking dates and gaps before treating the history as complete.",
    metric: "0 claims",
    metricLabel: "Reported over five years",
    steps: [
      "Read five annual loss runs",
      "Match insured name and property",
      "Check continuous coverage dates",
    ],
    sourceExcerpt:
      '"2021: nil. 2022: nil. 2023: nil. 2024: nil. 2025: nil. Valuation date and continuity subject to verification."',
    sourceKind: "Sample loss runs · pages 1–5",
    nextAction: "Confirm current valuations and uninterrupted history.",
    view: { yaw: 0.67, pitch: 0.9, zoom: 1.05, target: [0, 0.6, 0] },
  },
};
