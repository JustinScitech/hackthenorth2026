import type { Finding } from "@/lib/types";
import type { RankedSubmission, ScoreAdjustment } from "@/federato/scoring";
import type { CensusData, DisastersData, DroughtData, EpaData, FloodData, RiverData, SeismicData, SurroundingsData, WeatherData, WildfireData } from "./context-sources";
import { contextSource, type PropertyContext } from "./property-context";

/**
 * Reads the public record gathered for a property and says what it means for triage: one
 * finding per dataset that carries a rule, and a list of point adjustments to the priority
 * score. The thresholds are application choices, labelled as such on the page; the carrier's
 * own appetite score (the raw match) is left exactly as the carrier rules produced it.
 */
export type ContextAssessment = { findings: Finding[]; adjustments: ScoreAdjustment[]; adjustment: number; note: string };

/** Hazards can pull priority down a good way; protection can lift it only a little. */
export const CONTEXT_ADJUSTMENT_RANGE = { min: -20, max: 5 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sign = (points: number) => `${points > 0 ? "+" : ""}${points}`;

export function assessPropertyContext(context: PropertyContext): ContextAssessment {
  const findings: Finding[] = [];
  const adjustments: ScoreAdjustment[] = [];
  const add = (id: string, label: string, result: Finding["result"], detail: string, source: string, points = 0) => {
    findings.push({ id: `context_${id}`, label, result, detail, source });
    if (points !== 0) adjustments.push({ label, points, detail, source });
  };
  const src = (id: Parameters<typeof contextSource>[1]) => context.sources.find((s) => s.id === id);
  const link = (id: Parameters<typeof contextSource>[1]) => src(id)?.url || "public dataset";

  const flood = contextSource<FloodData>(context, "flood");
  if (flood) {
    const zone = flood.data.zone;
    if (flood.data.specialFloodHazardArea) add("flood", "Flood zone", "refer", `${flood.summary} A Special Flood Hazard Area carries a 1% or greater annual flood chance; ask for flood cover and elevation certificates.`, link("flood"), -10);
    else if (zone && /0\.2/.test(flood.data.subtype ?? "")) add("flood", "Flood zone", "pass", `${flood.summary} Moderate risk: a 0.2% annual chance of flooding.`, link("flood"), -3);
    else add("flood", "Flood zone", "pass", flood.summary, link("flood"));
  }

  const wildfire = contextSource<WildfireData>(context, "wildfire");
  if (wildfire) {
    const w = wildfire.data;
    if (w.firesWithin2km >= 1) add("wildfire", "Wildfire history", "refer", `${wildfire.summary} Fire has reached within 2 km; ask for defensible space, roof class, and brush clearance records.`, link("wildfire"), -6);
    else if (w.firesWithin10km >= 5) add("wildfire", "Wildfire history", "refer", `${wildfire.summary} A fire-prone area; check exposure and mitigation.`, link("wildfire"), -5);
    else if (w.firesWithin10km >= 1) add("wildfire", "Wildfire history", "pass", `${wildfire.summary} Some fire activity nearby.`, link("wildfire"), -2);
    else add("wildfire", "Wildfire history", "pass", wildfire.summary, link("wildfire"));
  }

  const river = contextSource<RiverData>(context, "river");
  if (river) {
    const r = river.data;
    // Small streams stay context only; points need a river big enough to matter (ten-year peak of 50 m³/s or more).
    if (r.maxDischarge >= 50 && r.daysOver3xTypicalHigh >= 30) add("river", "River flood signal", "pass", `${river.summary} A flashy river nearby; weigh with the flood zone and elevation.`, link("river"), -3);
    else if (r.maxDischarge >= 50 && r.daysOver3xTypicalHigh >= 10) add("river", "River flood signal", "pass", `${river.summary} Occasional high flows nearby.`, link("river"), -1);
    else add("river", "River flood signal", "pass", river.summary, link("river"));
  }

  const seismic = contextSource<SeismicData>(context, "seismic");
  if (seismic) {
    const n = seismic.data.quakesM45Within100km;
    if (n >= 50) add("seismic", "Seismic activity", "refer", `${seismic.summary} Active seismic region; confirm the construction class and any earthquake cover.`, link("seismic"), -5);
    else if (n >= 10) add("seismic", "Seismic activity", "pass", `${seismic.summary} Moderate seismic history.`, link("seismic"), -2);
    else add("seismic", "Seismic activity", "pass", seismic.summary, link("seismic"));
  }

  const weather = contextSource<WeatherData>(context, "weather");
  if (weather) {
    const w = weather.data;
    const extras = [w.hardFreezeDays >= 200 ? `${w.hardFreezeDays} hard-freeze days point to pipe-freeze exposure.` : "", w.heavyRainDays >= 20 ? `${w.heavyRainDays} heavy-rain days suggest water intrusion exposure.` : ""].filter(Boolean).join(" ");
    if (w.maxGustMph >= 90) add("wind", "Wind history", "refer", `${weather.summary} Gusts at hurricane strength; check roof age and attachment. ${extras}`.trim(), link("weather"), -5);
    else if (w.maxGustMph >= 70) add("wind", "Wind history", "pass", `${weather.summary} Strong-gust territory. ${extras}`.trim(), link("weather"), -2);
    else add("wind", "Wind history", "pass", `${weather.summary} ${extras}`.trim(), link("weather"));
  }

  const around = contextSource<SurroundingsData>(context, "surroundings");
  if (around) {
    const a = around.data;
    const stationNote = a.nearestFireStationMi === null ? "No fire station is mapped within 5 miles." : `Nearest fire station ${a.nearestFireStationMi} mi away, ${a.fireStationsWithin5Mi} within 5 mi, ${a.hydrantsWithin300m} hydrant${a.hydrantsWithin300m === 1 ? "" : "s"} within 300 m.`;
    if (a.nearestFireStationMi === null) add("fire_protection", "Fire protection", "refer", `${stationNote} Response distance is a public-protection concern; ask for the ISO protection class.`, link("surroundings"), -4);
    else if (a.nearestFireStationMi <= 1.5) add("fire_protection", "Fire protection", "pass", `${stationNote} Good response distance.`, link("surroundings"), a.hydrantsWithin300m ? 4 : 3);
    else if (a.nearestFireStationMi <= 5) add("fire_protection", "Fire protection", "pass", stationNote, link("surroundings"), 1);
    const hazards = [a.fuelStationsWithin150m ? `${a.fuelStationsWithin150m} fuel station${a.fuelStationsWithin150m === 1 ? "" : "s"} within 150 m` : "", a.industrialWithin300m ? "industrial land within 300 m" : "", a.railWithin100m ? "a rail line within 100 m" : ""].filter(Boolean);
    if (hazards.length) add("neighbours", "Neighbouring exposures", hazards.length >= 2 ? "refer" : "pass", `${hazards.join(", ")} (OpenStreetMap). Adjacent hazards raise fire and impact exposure; confirm separation and occupancy.`, link("surroundings"), -2 * hazards.length);
    else add("neighbours", "Neighbouring exposures", "pass", "No fuel stations, industrial land, or rail lines mapped next to the property.", link("surroundings"));
    if (a.coastlineWithin5km) add("coast", "Coastal exposure", flood?.data.zone?.startsWith("V") ? "refer" : "pass", "Coastline within 5 km: wind-driven rain and storm-surge exposure to weigh with the flood zone.", link("surroundings"), -2);
    if (a.building) {
      const b = a.building;
      const parts = [b.type ? `mapped as ${b.type.replace(/_/g, " ")}` : "", b.levels ? `${b.levels} levels` : "", b.heightFt ? `about ${b.heightFt} ft tall` : "", b.name ? `named ${b.name}` : ""].filter(Boolean);
      if (parts.length) add("building", "Building record", "pass", `OpenStreetMap has the building ${parts.join(", ")}. Compare against the submission's construction and occupancy.`, link("surroundings"));
    }
  }

  const epa = contextSource<EpaData>(context, "epa");
  if (epa) {
    const e = epa.data;
    if (e.withViolations >= 1) add("epa", "Regulated facilities nearby", "refer", `${epa.summary} Current violations next door are a pollution and fire exposure to ask about.`, link("epa"), -3);
    else if (e.facilitiesWithinHalfMile >= 5) add("epa", "Regulated facilities nearby", "pass", `${epa.summary} Dense regulated activity around the site.`, link("epa"), -2);
    else add("epa", "Regulated facilities nearby", "pass", epa.summary, link("epa"));
  }

  const census = contextSource<CensusData>(context, "census");
  if (census && census.data.vacancyRatePct !== null && census.data.vacancyRatePct >= 20) add("vacancy", "Area vacancy", "pass", `${census.summary} High vacancy can mean weaker upkeep and more vandalism claims nearby.`, link("census"), -2);

  const drought = contextSource<DroughtData>(context, "drought");
  if (drought && drought.data.weeksInSevereDroughtPct >= 50 && (wildfire?.data.firesWithin10km ?? 0) >= 1) add("drought", "Drought and fuel", "pass", `${drought.summary} Combined with the wildfire hazard, dry fuel raises the fire exposure.`, link("drought"), -2);

  const disasters = contextSource<DisastersData>(context, "disasters");
  if (disasters) {
    const n = disasters.data.total;
    if (n >= 30) add("disasters", "Disaster declarations", "refer", `${disasters.summary} A county this often under federal declaration needs the catastrophe exposure priced in.`, link("disasters"), -4);
    else if (n >= 15) add("disasters", "Disaster declarations", "pass", `${disasters.summary} Frequent declarations for the county.`, link("disasters"), -2);
    else add("disasters", "Disaster declarations", "pass", disasters.summary, link("disasters"));
  }

  const unavailable = context.sources.filter((s) => s.status === "unavailable");
  if (unavailable.length) add("unavailable", "Public records partly unavailable", "unknown", `${unavailable.map((s) => s.label).join("; ")} did not answer this time. Re-run the analysis to try again.`, "public datasets");

  const total = clamp(adjustments.reduce((sum, item) => sum + item.points, 0), CONTEXT_ADJUSTMENT_RANGE.min, CONTEXT_ADJUSTMENT_RANGE.max);
  const named = adjustments.map((item) => `${item.label.toLowerCase()} ${sign(item.points)}`).join(", ");
  const note = adjustments.length ? `Public property records move priority by ${sign(total)} (${named}).` : context.sources.length ? "Public property records add context and leave the priority score where the appetite put it." : "";
  return { findings, adjustments, adjustment: total, note };
}

/** Applies the assessment to a scored submission: the priority score moves, the carrier cap still holds, and the raw appetite match stays untouched. */
export function applyContextAdjustment(result: RankedSubmission, assessment: ContextAssessment): RankedSubmission {
  if (!assessment.adjustments.length) return result;
  const cap = result.criteria.some((item) => item.status === "outside") ? 49 : result.missingData.length ? 69 : 100;
  const baseScore = result.baseScore ?? result.score;
  const score = clamp(baseScore + assessment.adjustment, 0, cap);
  const detail = assessment.adjustments.map((item) => `${item.label} ${sign(item.points)}`).join("; ");
  return { ...result, baseScore, score, adjustments: assessment.adjustments, explanation: `${result.explanation} Public property records: ${detail}; priority ${baseScore} → ${score}. These point values are application choices, listed so they can be checked.` };
}
