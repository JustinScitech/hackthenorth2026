import type { EvidenceSignal, Facts, Finding, PublicEvidence } from "../lib/types";

export type SignalKind = EvidenceSignal["kind"];
/** A structured fact read from a public page, with the sentence it came from so an underwriter can check it. */
export type { EvidenceSignal };

/** FEMA Special Flood Hazard Area designations; X, B, C, and D are not. */
const highRiskFloodZones = ["A", "AE", "AH", "AO", "AR", "A99", "V", "VE"];
const referConstruction = /\b(?:wood|frame)\b/i;
const passConstruction = /\b(?:masonry|steel|concrete|non[- ]?combustible|fire[- ]?resistive|tilt[- ]?up)\b/i;

/** The sentence (or labelled fragment) that contains a match, trimmed to something quotable. */
function quoteAround(text: string, index: number, length: number): string {
  const start = Math.max(text.lastIndexOf(".", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const rest = text.slice(index + length).search(/[.\n]/);
  const end = rest === -1 ? text.length : index + length + rest + 1;
  return text.slice(start, end).trim();
}

/**
 * Deterministic patterns for the labelled facts assessor cards and listings
 * publish. Only explicit statements count: a year needs "built" or "year
 * built" next to it, a flood zone needs the word "zone", and so on.
 */
export function extractEvidenceSignals(pageText: string): EvidenceSignal[] {
  const text = pageText.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const signals: EvidenceSignal[] = [];
  const thisYear = new Date().getUTCFullYear();
  const take = (kind: SignalKind, match: RegExpMatchArray | null, value: string | number | boolean) => {
    if (!match || match.index === undefined || signals.some((signal) => signal.kind === kind)) return;
    signals.push({ kind, value, quote: quoteAround(text, match.index, match[0].length) });
  };

  const year = text.match(/\b(?:year\s+built|built|constructed)(?:\s+in)?\s*[:#-]?\s*(1[89]\d{2}|20\d{2})\b/i);
  if (year && Number(year[1]) <= thisYear) take("yearBuilt", year, Number(year[1]));

  const construction = text.match(/\b(?:construction(?:\s+type)?|building\s+type)\s*[:#-]\s*([A-Za-z][A-Za-z /-]{1,40}?)(?=[.;,]|\s+\w+:|$)/i)
    ?? text.match(/\b((?:tilt[- ]?up\s+concrete|steel|masonry|concrete|wood\s+frame|frame|non[- ]?combustible|fire[- ]?resistive))\s+(?:building|construction|structure)\b/i);
  if (construction) take("constructionType", construction, construction[1].trim());

  const squareFeet = text.match(/\b(\d{1,3}(?:,\d{3})+|\d{3,7})\s*(?:sq\.?\s*ft\.?|square\s+feet|sf)\b/i) ?? text.match(/\b(?:building\s+)?sq\.?\s*ft\.?\s*[:#-]\s*(\d{1,3}(?:,\d{3})+|\d{3,7})\b/i);
  if (squareFeet) take("squareFeet", squareFeet, Number(squareFeet[1].replace(/,/g, "")));

  const occupancy = text.match(/\b(?:use\s+code|occupancy|use|property\s+type)\s*[:#-]\s*(?:\d+\s+)?([A-Za-z][A-Za-z /-]{2,40}?)(?=[.;,]|\s+\w+:|$)/i);
  if (occupancy) take("occupancy", occupancy, occupancy[1].trim());

  const sprinklered = text.match(/\bsprinklered\s*[:#-]?\s*(yes|no|true|false)\b/i) ?? text.match(/\b(fully\s+sprinklered|sprinkler\s+system|not\s+sprinklered|no\s+sprinklers?)\b/i);
  if (sprinklered) take("sprinklered", sprinklered, !/^(?:no|false|not\s|no\s)/i.test(sprinklered[1]));

  const flood = text.match(/\b(?:fema\s+)?flood\s+zone\s*[:#-]?\s*([AVX](?:[EHO]|99)?|B|C|D)\b/i) ?? text.match(/\bzone\s+([AVX](?:[EHO]|99)?)\b(?!\s*\d)/i);
  if (flood) take("floodZone", flood, flood[1].toUpperCase());

  return signals;
}

/** Turns public-source signals into findings that corroborate, contradict, or add to the broker facts. */
export function evidenceFindings(facts: Facts, evidence: PublicEvidence, signals: EvidenceSignal[]): Finding[] {
  const host = (() => { try { return new URL(evidence.url).hostname; } catch { return evidence.url; } })();
  const source = `Public source: ${host} (unverified)`;
  const cite = (signal: EvidenceSignal) => `"${signal.quote}"`;
  const findings: Finding[] = [];
  for (const signal of signals) {
    const id = `evidence_${signal.kind}`;
    if (signal.kind === "yearBuilt") {
      const stated = facts.yearBuilt.value;
      const year = Number(signal.value);
      findings.push(stated === null
        ? { id, label: "Public year built", result: "unknown", detail: `The public record lists ${year} as the year built; the submission did not state one. Confirm the construction year with the broker before relying on it. ${cite(signal)}`, source }
        : stated === year
          ? { id, label: "Public year built", result: "pass", detail: `The public record agrees with the submission: built in ${year}. ${cite(signal)}`, source }
          : { id, label: "Public year built", result: "refer", detail: `The public record lists ${year}, but the submission says ${stated}. Resolve the discrepancy before review. ${cite(signal)}`, source });
    } else if (signal.kind === "floodZone") {
      const zone = String(signal.value);
      const high = highRiskFloodZones.includes(zone);
      findings.push({ id, label: "Public flood zone", result: high ? "refer" : "pass", detail: high ? `FEMA zone ${zone} is a Special Flood Hazard Area; flood exposure needs underwriter attention. ${cite(signal)}` : `FEMA zone ${zone} indicates minimal flood risk. ${cite(signal)}`, source });
    } else if (signal.kind === "sprinklered") {
      findings.push({ id, label: "Public sprinkler status", result: signal.value ? "pass" : "refer", detail: signal.value ? `The public source describes the building as sprinklered. ${cite(signal)}` : `The public source describes the building as not sprinklered; confirm fire protection. ${cite(signal)}`, source });
    } else if (signal.kind === "constructionType") {
      const label = String(signal.value);
      const eligible = ["jm", "joisted masonry", "steel frame", "steel", "non combustible", "non combustible/steel", "masonry non combustible", "mnc"].includes(label.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim());
      const result = eligible ? "pass" : referConstruction.test(label) ? "refer" : passConstruction.test(label) ? "pass" : "unknown";
      findings.push({ id, label: "Public construction type", result, detail: `${eligible ? "Appetite-eligible construction category reported" : result === "refer" ? "Combustible construction reported" : "Construction reported"}: ${label}. Verify the account-wide eligible construction percentage separately; this public description does not establish the required mix. ${cite(signal)}`, source });
    } else if (signal.kind === "squareFeet") {
      findings.push({ id, label: "Public building size", result: "pass", detail: `The public source lists ${Number(signal.value).toLocaleString("en-US")} square feet. ${cite(signal)}`, source });
    } else {
      findings.push({ id, label: "Public occupancy", result: "pass", detail: `The public source lists the use as ${signal.value}. ${cite(signal)}`, source });
    }
  }
  if (!findings.length) findings.push({ id: "evidence_none", label: "Public source", result: "unknown", detail: `The page at ${host} contained no structured property facts; the excerpt is attached for manual review.`, source });
  return findings;
}
