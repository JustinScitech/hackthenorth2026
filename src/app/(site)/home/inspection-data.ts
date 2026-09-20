/** E7 camera and investigation adapters. Underwriting outputs are illustrative. */
import type { RiskId } from "./demo-data";
export type CameraPreset = "site" | "roof" | "street" | "plan" | "atrium";
export type CameraAction = CameraPreset | "zoom-in" | "zoom-out";
export type CameraCommand = { action: CameraAction; revision: number };
export type SceneInspection = { waterLevel: number; cutaway: boolean };
type View = {
  yaw: number;
  pitch: number;
  zoom: number;
  target: [number, number, number];
};
export const CAMERA_VIEWS: Record<CameraPreset, View & { label: string }> = {
  site: {
    label: "E7 campus overview",
    yaw: 0.64,
    pitch: 1.01,
    zoom: 0.91,
    target: [0, 2.4, 0],
  },
  roof: {
    label: "Roof and clerestories",
    yaw: 0.2,
    pitch: 0.5,
    zoom: 1.22,
    target: [0, 4.8, -1],
  },
  street: {
    label: "E7 courtyard and cycle shelter",
    yaw: 1.13,
    pitch: 1.49,
    zoom: 1.15,
    target: [2.7, 1.45, -1.4],
  },
  plan: {
    label: "Campus plan",
    yaw: 0,
    pitch: 0.04,
    zoom: 0.93,
    target: [0, 0.3, -0.2],
  },
  atrium: {
    label: "Inside the E7 atrium",
    yaw: 1.53,
    pitch: 1.3,
    zoom: 1.15,
    target: [0, 3.7, -3.05],
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
    view: View;
  }
> = {
  roof: {
    action: "Inspect the E7 roof",
    summary:
      "Explore the mechanical penthouse and atrium clerestories. Lift the roof to see how the enclosed spaces relate to the envelope.",
    metric: "Records needed",
    metricLabel: "Roof condition evidence",
    steps: [
      "Locate rooftop services in the reference photos",
      "Separate the roof and atrium canopy",
      "Request membrane and maintenance records",
    ],
    sourceExcerpt:
      "The reference set shows a rooftop mechanical enclosure and the atrium's sawtooth clerestories. Roof age, condition, and replacement records are not provided.",
    sourceKind: "Photo-informed model · sample review note",
    nextAction: "Request a dated roof inspection and maintenance schedule.",
    view: { yaw: 0.22, pitch: 0.59, zoom: 1.3, target: [0, 5.8, -0.5] },
  },
  flood: {
    action: "Explore campus surface water",
    summary:
      "Raise the illustrative water level around the paved entry. Site elevations and drainage capacity have not been surveyed in this model.",
    metric: "Scenario only",
    metricLabel: "No assigned flood zone",
    steps: [
      "Identify paved entries and drain locations",
      "Compare illustrative rise with occupied floors",
      "Request verified elevations and drainage records",
    ],
    sourceExcerpt:
      "This water surface is a visual scenario. It does not represent an official flood zone, predicted water level, or verified flood exposure at Engineering 7.",
    sourceKind: "Synthetic drainage scenario",
    nextAction: "Obtain a site survey and local drainage assessment.",
    view: { yaw: 1.04, pitch: 0.94, zoom: 1.16, target: [3.1, 1.2, 0] },
  },
  fire: {
    action: "Trace a protection scenario",
    summary:
      "Follow an illustrative protection route from campus access into the building. The model demonstrates how Astra connects observations to inspection records.",
    metric: "Verify coverage",
    metricLabel: "Illustrative protection path",
    steps: [
      "Locate the modeled access and riser",
      "Trace multi-level distribution",
      "Request current inspection certificates",
    ],
    sourceExcerpt:
      "Hydrant position and sprinkler paths in this scene are illustrative. No actual E7 coverage, inspection status, or fire-system design is asserted.",
    sourceKind: "Synthetic fire-protection example",
    nextAction: "Verify hydrant access and obtain protection-system records.",
    view: { yaw: 0.58, pitch: 1.13, zoom: 1.2, target: [1, 3.2, 0] },
  },
  construction: {
    action: "Reveal the seven-storey structure",
    summary:
      "Peel back the patterned glass envelope to reveal floor plates, the structural grid, and the atrium between E7 and E5.",
    metric: "7 storeys",
    metricLabel: "Published building form",
    steps: [
      "Read the supplied plan and section",
      "Expose the frame and connected atrium",
      "Verify assembly details from engineering records",
    ],
    sourceExcerpt:
      "The supplied section shows the multi-level atrium, interconnecting bridges, red feature stairs, and sawtooth roof. Structural members in the digital twin are approximate.",
    sourceKind: "Reference plan & section · model interpretation",
    nextAction:
      "Request structural and envelope schedules before classification.",
    view: { yaw: 0.92, pitch: 1.01, zoom: 1.18, target: [0, 3.7, -0.5] },
  },
  hazards: {
    action: "Inspect campus connections",
    summary:
      "Examine the enclosed bridges and shared E5–E7 atrium. Astra flags the evidence needed to understand connected-building exposure.",
    metric: "Connected campus",
    metricLabel: "Atrium and pedestrian links",
    steps: [
      "Locate enclosed campus bridges",
      "Identify shared circulation and service interfaces",
      "Request compartmentation and occupancy records",
    ],
    sourceExcerpt:
      "Reference photographs show enclosed pedestrian links; the E5 and E7 buildings flank a shared atrium. Fire separation and shared-services details require documentary review.",
    sourceKind: "Campus reference photos · sample review note",
    nextAction: "Confirm fire compartments and connected-building schedules.",
    view: { yaw: -0.5, pitch: 1.07, zoom: 1.1, target: [-2.7, 2.9, 1] },
  },
  business: {
    action: "Explore the E7 atrium & labs",
    summary:
      "Look through the atrium's red stairs and overhead bridges into study areas and teaching labs. Interior furniture and room layouts are interpreted from the available references.",
    metric: "Education & research",
    metricLabel: "Published academic program",
    steps: [
      "Explore the red feature stair and atrium bridges",
      "Inspect the illustrative teaching and robotics spaces",
      "Connect each use to the applicable appetite questions",
    ],
    sourceExcerpt:
      "E7 includes engineering teaching and research spaces, the Engineering IDEAs Clinic, and RoboHub. The atrium connects to E5; the room furnishings shown here are an architectural interpretation.",
    sourceKind: "Public building program · interpreted interior",
    nextAction:
      "Confirm laboratory activities, equipment values, and controls.",
    view: { yaw: 1.23, pitch: 1.13, zoom: 1.35, target: [0, 3.5, -2.7] },
  },
  claims: {
    action: "Link the sample loss records",
    summary:
      "Astra demonstrates how annual records are matched to a property and checked for gaps. These are synthetic records, not Waterloo's claims history.",
    metric: "Demo records",
    metricLabel: "No real loss information accessed",
    steps: [
      "Read five synthetic annual records",
      "Match the sample property identity",
      "Check dates and flag evidence gaps",
    ],
    sourceExcerpt:
      "Demonstration data only. All claim values, coverage periods, risk scores, and appetite results are synthetic and do not describe the University of Waterloo's insurance history.",
    sourceKind: "Synthetic loss-run example",
    nextAction: "Request authorized, current loss runs for a real assessment.",
    view: { yaw: 0.64, pitch: 1.01, zoom: 0.95, target: [0, 2.4, 0] },
  },
};
