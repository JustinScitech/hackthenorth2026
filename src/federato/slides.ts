import PptxGenJS from "pptxgenjs";
import { rankingExplanation, resourceLabels, summarizeSubmission } from "./presentation";
import type { RankedSubmission } from "./scoring";
import type { TriageReport } from "./triage";

type Report = Omit<TriageReport, "schema">;
type SlideBlock = { label?: string; lines: string[] };
export type TriageSlide = { title: string; subtitle?: string; lines: string[]; blocks: SlideBlock[]; notes: string };

function wrapText(text: string, width = 76): string[] {
  const lines: string[] = [];
  let remaining = text.replace(/\s+/g, " ").trim();
  while (remaining.length > width) {
    const space = remaining.lastIndexOf(" ", width);
    const end = space > 0 ? space : width;
    lines.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) lines.push(remaining);
  return lines;
}

export function buildTriageSlides(report: Report, showAll = false): TriageSlide[] {
  const labels = resourceLabels(report.resource);
  const records = showAll ? report.ranked : report.topSubmissions;
  const slides: TriageSlide[] = [];
  function appendBlocks(title: string, blocks: SlideBlock[], notes = "", subtitle?: string) {
    let group: SlideBlock[] = [];
    let used = 0;
    let page = 0;
    const flush = () => {
      if (!group.length) return;
      slides.push({
        title: `${title.length > 56 ? `${title.slice(0, 53)}…` : title}${page ? " (continued)" : ""}`,
        subtitle,
        lines: group.flatMap((block) => [...(block.label ? [block.label] : []), ...block.lines]),
        blocks: group,
        notes: [title, notes].filter(Boolean).join("\n\n"),
      });
      group = [];
      used = 0;
      page++;
    };
    for (const block of blocks) {
      for (let offset = 0; offset < block.lines.length; offset += 9) {
        const part = { ...block, lines: block.lines.slice(offset, offset + 9) };
        if (offset && part.label) part.label += " (continued)";
        const cost = part.lines.length + (part.label ? 2 : 0) + 1;
        if (used + cost > 13) flush();
        group.push(part);
        used += cost;
      }
    }
    flush();
  }
  function append(title: string, paragraphs: string[], notes = "") {
    appendBlocks(title, paragraphs.map((paragraph) => ({ lines: wrapText(paragraph) })), notes);
  }
  append("Federato triage", [
    `${showAll ? "All evaluated" : "Top-ranked"} ${labels.plural}: ${records.length} exported`,
    `${report.evaluated} of ${report.total} ${report.resource} records evaluated`,
    `Generated: ${new Date(report.generatedAt).toISOString()}`,
    report.resource === "Submission"
      ? "Scope: actual submissions across all lifecycle statuses, including unmatched submissions. Policy evidence is used only for verified unique links."
      : `Scope: ${report.resource} records across lifecycle statuses.`,
    ...(report.truncated ? ["PARTIAL QUEUE: the ranking covers only evaluated records, not the entire queue."] : []),
    ...(report.enrichmentComplete === false ? ["PARTIAL POLICY LOOKUP: no policy enrichment was used because link uniqueness could not be verified."] : []),
  ]);
  append("Scoring and review guidance", [
    report.guidelineVersion,
    rankingExplanation,
    "Eight weighted criteria total 100 points. Target matches earn full points; acceptable matches earn 80%; unknowns and exceptions earn zero. Weights and caps are application choices, not carrier-prescribed scores.",
    "Scores prioritize human review. This deck does not approve, bind, or decline coverage.",
  ], [...report.reasoning, JSON.stringify(report.trace, null, 2)].join("\n\n"));
  if (!records.length) append("No ranked records", ["The API returned an empty queue."]);
  records.forEach((record: RankedSubmission, index: number) => {
    const summary = summarizeSubmission(record);
    const title = `${index + 1}. ${record.account}`;
    const identity = `${labels.singular} ${record.id} · Lifecycle: ${record.lifecycleStatus ?? "Not supplied"}`;
    append(title, [
      identity,
      `Match score: ${record.rawScore}/100 · Priority score: ${record.score}/100`,
      summary.title,
      `Next step: ${summary.action}`,
      ...(record.evidenceNote ? [record.evidenceNote] : []),
      ...(summary.strengths.length ? [`What supports this: ${summary.strengths.join(", ")}`] : []),
      ...(summary.questions.length ? [`What to check: ${summary.questions.join(", ")}`] : []),
      ...(summary.whatWouldChange.length ? [`What would change it: ${summary.whatWouldChange.join(" ")}`] : []),
    ], [summary.plainExplanation, record.explanation].join("\n\n"));
    const statusLabels = { target: "Target match", acceptable: "Acceptable", outside: "Outside appetite", unknown: "Needs verification" };
    appendBlocks(title, record.criteria.length ? record.criteria.map((criterion) => ({
      label: `${criterion.factor} · ${statusLabels[criterion.status]} · ${criterion.points}/${criterion.maximum}`,
      lines: wrapText(criterion.detail),
    })) : [{ lines: ["No factor-level evidence supplied."] }], [
      identity,
      record.evidenceNote,
      record.explanation,
      ...record.criteria.map((criterion) => `${criterion.factor}\n${criterion.detail}\nSource: ${criterion.source}`),
    ].filter(Boolean).join("\n\n"), `Appetite evidence · ${identity}`);
  });
  return slides;
}

export function createTriageDeck(report: Report, showAll = false) {
  const deck = new PptxGenJS();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "Astra Risk";
  deck.subject = "Federato appetite triage — advisory review";
  deck.title = "Federato triage";
  deck.theme = { headFontFace: "Georgia", bodyFontFace: "Arial" };
  const pages = buildTriageSlides(report, showAll);
  for (const [index, page] of pages.entries()) {
    const slide = deck.addSlide();
    slide.background = { color: "F3EFE4" };
    slide.addText(page.title, { x: 0.8, y: 0.45, w: 11.7, h: 0.85, fontFace: "Georgia", fontSize: 30, color: "1C1E1B", margin: 0, fit: "shrink" });
    if (page.subtitle) slide.addText(page.subtitle, { x: 0.8, y: 1.35, w: 11.7, h: 0.35, fontSize: 12, color: "6C726C", margin: 0, fit: "shrink" });
    let top = 1.95;
    for (const block of page.blocks) {
      if (block.label) {
        slide.addText(block.label, { x: 0.8, y: top, w: 11.7, h: 0.48, fontSize: 19, bold: true, color: "0F6444", margin: 0, fit: "shrink" });
        top += 0.64;
      }
      const height = block.lines.length * 0.31 + 0.1;
      slide.addText(block.lines.join("\n"), { x: 0.8, y: top, w: 11.7, h: height, fontSize: 18, color: "474C47", margin: 0, valign: "top", lineSpacingMultiple: 1, paraSpaceAfter: 0, breakLine: false });
      top += height + 0.28;
    }
    slide.addText(`Astra Risk · Advisory review only · ${index + 1} / ${pages.length}`, { x: 0.65, y: 7, w: 12, h: 0.22, fontSize: 10, color: "6C726C", margin: 0 });
    slide.addNotes(page.notes);
    if (page.subtitle) slide.addText("Exact field paths and full source evidence are in the speaker notes.", { x: 0.8, y: 6.65, w: 11.7, h: 0.22, fontSize: 10, color: "6C726C", margin: 0 });
  }
  return deck;
}

export async function downloadTriageSlides(report: Report, showAll = false) {
  const deck = createTriageDeck(report, showAll);
  await deck.writeFile({ fileName: `federato-triage-${showAll ? "all" : "top"}-${new Date(report.generatedAt).toISOString().slice(0, 10)}.pptx` });
}
