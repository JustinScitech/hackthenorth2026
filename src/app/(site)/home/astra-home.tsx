"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  FileText,
  Layers3,
  MapPin,
  Maximize2,
  Play,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  X,
  Plus,
  Minus,
  Expand,
  Shrink,
  Building2,
  Droplets,
  Flame,
  HardHat,
  History,
  Warehouse,
  Layers,
} from "lucide-react";
import { Mark } from "../../ui/logo";
import {
  DEMO_DURATION,
  DEMO_PROPERTY,
  getPhase,
  RISK_SIGNALS,
  WORKFLOW,
  type RiskId,
} from "./demo-data";
import {
  INSPECTIONS,
  type CameraAction,
  type CameraCommand,
} from "./inspection-data";
import styles from "./home.module.css";

const PropertyScene = dynamic(() => import("./property-scene"), {
  ssr: false,
  loading: () => (
    <div className={styles.sceneRoot}>
      {/* A small, locally rendered poster paints before the 3D bundle loads. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/models/northline-poster.webp"
        alt="Northline commercial property digital twin"
        className={styles.scenePoster}
        fetchPriority="high"
      />
      <div className={styles.sceneLoading}>
        <span />
        Preparing your digital twin
      </div>
    </div>
  ),
});

export function AstraHome() {
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(0);
  const [ready, setReady] = useState(false);
  const [selected, setSelectedState] = useState<RiskId | null>(null);
  const [waterLevel, setWaterLevel] = useState(0.35);
  const [cutaway, setCutaway] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sceneAvailable, setSceneAvailable] = useState(true);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({
    action: "site",
    revision: 0,
  });
  const setSelected = useCallback((id: RiskId | null) => {
    setSelectedState(id);
    setSourceOpen(false);
    setWaterLevel(0.35);
    setCutaway(id === "construction" || id === "business" || id === "fire");
  }, []);
  const cameraAction = (action: CameraAction) =>
    setCameraCommand((previous) => ({
      action,
      revision: previous.revision + 1,
    }));
  const [activeStep, setActiveStep] = useState(2);
  const [resetView, setResetView] = useState(0);
  const [showSignals, setShowSignals] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [running, setRunning] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const phase = getPhase(elapsed);
  const complete = elapsed >= DEMO_DURATION;
  const evidence = RISK_SIGNALS.find((signal) => signal.id === selected);
  const inspection = selected ? INSPECTIONS[selected] : null;
  const count = RISK_SIGNALS.filter(
    (signal) => elapsed >= signal.revealAt,
  ).length;
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (reduced) {
      setElapsed(DEMO_DURATION);
      setRunning(false);
      return;
    }
    let last = performance.now();
    progressRef.current = 0;
    setElapsed(0);
    setRunning(true);
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (
        !document.hidden &&
        stageRef.current &&
        stageRef.current.getBoundingClientRect().bottom > 0
      ) {
        progressRef.current = Math.min(
          DEMO_DURATION,
          progressRef.current + now - last,
        );
        setElapsed(progressRef.current);
        if (progressRef.current >= DEMO_DURATION) {
          setRunning(false);
          clearInterval(timer);
        }
      }
      last = now;
    }, 80);
    return () => clearInterval(timer);
  }, [ready, run, reduced]);

  useEffect(() => {
    const sections = document.querySelectorAll("[data-astra-reveal]");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealed);
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selected) setSelected(null);
        else setExpanded(false);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [selected, setSelected]);

  useEffect(() => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = reduced ? "auto" : "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = previous;
    };
  }, [reduced]);

  useEffect(() => {
    if (!expanded || !stageRef.current) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const stage = stageRef.current;
    stage.querySelector<HTMLButtonElement>("[data-expand-control]")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        stage.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,canvas[tabindex="0"]',
        ),
      ).filter(
        (element) =>
          element.offsetParent !== null &&
          element.getAttribute("aria-hidden") !== "true",
      );
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    stage.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      stage.removeEventListener("keydown", trap);
      previousFocus?.focus();
    };
  }, [expanded]);

  function replay() {
    setSelected(null);
    setCameraCommand((previous) => ({
      action: "site",
      revision: previous.revision + 1,
    }));
    setRun((value) => value + 1);
    setResetView((value) => value + 1);
    setShowSignals(true);
  }
  function skip() {
    progressRef.current = DEMO_DURATION;
    setElapsed(DEMO_DURATION);
    setRunning(false);
  }

  return (
    <main className={styles.home}>
      <a href="#underwriting" className={styles.skipLink}>
        Skip to underwriting
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Astra Risk home">
          <Mark size={34} priority />
          <span>
            astra<span className={styles.brandRisk}>risk</span>
          </span>
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="#experience" className={styles.navActive}>
            The platform
          </a>
          <a href="#underwriting">How it works</a>
          <Link href="/docs">
            Documentation
            <ArrowUpRight size={12} />
          </Link>
        </nav>
        <Link href="/overview" className={styles.headerCta}>
          Open workspace
          <ArrowUpRight size={15} />
        </Link>
      </header>

      <section
        className={styles.hero}
        id="experience"
        aria-labelledby="hero-title"
      >
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            INTELLIGENCE, GROUNDED IN REALITY
          </div>
          <h1 id="hero-title">
            AI underwriting
            <br />
            that sees the
            <br />
            <span>whole risk.</span>
          </h1>
          <p className={styles.intro}>
            Astra reads submissions, investigates real-world risk, evaluates
            carrier appetite, and explains every decision.
          </p>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.primaryCta}
              onClick={replay}
            >
              <ScanLine size={17} />
              Run Astra
              <ArrowUpRight size={16} />
            </button>
            <a className={styles.secondaryCta} href="#underwriting">
              View underwriting
              <ArrowDown size={15} />
            </a>
          </div>
          <div className={styles.heroNote}>
            <ShieldCheck size={14} />
            <span>Agent intelligence. Underwriter authority.</span>
          </div>
          <div className={styles.submission} key={run}>
            <div
              className={`${styles.documentIcon} ${ready && !complete ? styles.documentEntering : ""}`}
            >
              <FileText size={20} />
            </div>
            <div>
              <span className={styles.microLabel}>
                IT STARTS WITH A SUBMISSION
              </span>
              <strong>Northline_Fabrication.pdf</strong>
              <span className={styles.submissionMeta}>
                ACORD form + property schedule + loss runs
              </span>
            </div>
            <span className={styles.documentStatus}>
              {elapsed > 1200 ? (
                <CheckCheck size={17} />
              ) : (
                <ArrowRight size={17} />
              )}
            </span>
          </div>
        </div>

        {ready && elapsed < 1300 && !reduced && (
          <div
            key={`submission-${run}`}
            className={styles.submissionTransfer}
            aria-hidden="true"
          >
            <svg viewBox="0 0 300 90" preserveAspectRatio="none">
              <path d="M 0 0 H 85 Q 120 0 120 30 V 55 Q 120 80 150 80 H 300" />
            </svg>
            <FileText size={18} className={styles.flyingDocument} />
          </div>
        )}
        <div
          data-astra-stage
          className={`${styles.sceneStage} ${expanded ? styles.sceneExpanded : ""} ${selected ? styles.sceneInspecting : ""}`}
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded ? true : undefined}
          ref={stageRef}
          aria-label="Interactive property risk assessment"
        >
          <div className={styles.sceneTopline}>
            <span>
              <span className={styles.liveDot} />
              LIVE RISK INTELLIGENCE
            </span>
            <span className={styles.demoTag}>ILLUSTRATIVE DEMO</span>
          </div>
          <div className={styles.coordinate}>SITE 01 / 43.65° N · 79.38° W</div>
          <div className={styles.sceneViewport}>
            <PropertyScene
              elapsed={elapsed}
              selected={selected}
              onSelect={setSelected}
              onReady={markReady}
              resetView={resetView}
              showSignals={showSignals}
              reducedMotion={reduced}
              command={cameraCommand}
              inspection={{ waterLevel, cutaway }}
              expanded={expanded}
              onAvailability={setSceneAvailable}
            />
          </div>
          <div
            className={styles.inspectionLenses}
            aria-label="Investigate a risk"
          >
            {(
              [
                { id: "roof", label: "Roof", Icon: HardHat },
                { id: "flood", label: "Flood", Icon: Droplets },
                { id: "fire", label: "Fire", Icon: Flame },
                { id: "construction", label: "Structure", Icon: Building2 },
                { id: "hazards", label: "Neighbors", Icon: Warehouse },
                { id: "business", label: "Operations", Icon: ScanLine },
                { id: "claims", label: "Loss runs", Icon: History },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={selected === id}
                onClick={() => setSelected(selected === id ? null : id)}
                title={INSPECTIONS[id].action}
                aria-label={label}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className={styles.analysisHud} aria-live="polite">
            <span className={styles.hudIcon}>
              <ScanLine size={14} />
            </span>
            <span>
              {inspection
                ? inspection.action
                : complete
                  ? "The investigation is yours to explore"
                  : phase < 2
                    ? "Turning documents into a property investigation"
                    : "Connecting site observations to source evidence"}
              <small>
                {inspection
                  ? "SELECTED INVESTIGATION"
                  : complete
                    ? "SELECT A RISK ABOVE OR EXPLORE THE PROPERTY"
                    : "AUTONOMOUS SITE SURVEY · DEMO"}
              </small>
            </span>
          </div>
          <div className={styles.siteName}>
            <MapPin size={13} />
            <span>
              Northline Fabrication
              <small>Commercial property · $3.2M TIV</small>
            </span>
          </div>
          <div
            data-astra-node
            className={`${styles.astraNode} ${running && ready ? styles.nodeRunning : ""}`}
          >
            <Mark size={22} />
            <span>
              ASTRA AI
              <small>
                {!ready
                  ? "Connecting to site"
                  : complete
                    ? "Investigation complete"
                    : WORKFLOW[phase].label + " in progress"}
              </small>
            </span>
            <span className={styles.liveDot} />
          </div>
          <div className={styles.sceneTools} aria-label="Scene controls">
            <button
              type="button"
              data-expand-control
              onClick={() => setExpanded((value) => !value)}
              aria-label={
                expanded ? "Close expanded viewer" : "Expand property viewer"
              }
              title={
                expanded ? "Exit expanded view (Esc)" : "Expand property viewer"
              }
            >
              {expanded ? <Shrink size={16} /> : <Expand size={16} />}
            </button>
            <button
              type="button"
              onClick={() => {
                setResetView((value) => value + 1);
                setSelected(null);
                cameraAction("site");
              }}
              disabled={!sceneAvailable}
              title="Reset camera"
              aria-label="Reset camera"
            >
              <Maximize2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => setShowSignals((value) => !value)}
              className={showSignals ? styles.toolActive : ""}
              aria-pressed={showSignals}
              title="Toggle risk signals"
              aria-label="Toggle risk signals"
            >
              <Layers3 size={15} />
            </button>
            <button
              type="button"
              onClick={replay}
              title="Replay investigation"
              aria-label="Replay investigation"
            >
              <RotateCcw size={15} />
            </button>
          </div>
          <div className={styles.cameraBar} aria-label="Camera views">
            <div>
              {(
                [
                  ["site", "Site"],
                  ["roof", "Roof"],
                  ["street", "Street"],
                  ["plan", "Plan"],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => cameraAction(id)}
                  disabled={!sceneAvailable}
                  aria-label={`Camera: ${label}`}
                  className={
                    !selected && cameraCommand.action === id
                      ? styles.cameraSelected
                      : ""
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <span />
            <button
              type="button"
              onClick={() => cameraAction("zoom-out")}
              disabled={!sceneAvailable}
              aria-label="Zoom out"
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={() => cameraAction("zoom-in")}
              disabled={!sceneAvailable}
              aria-label="Zoom in"
            >
              <Plus size={14} />
            </button>
            <small>DRAG TO ORBIT · SHIFT + DRAG TO PAN · SCROLL TO ZOOM</small>
          </div>

          <aside
            className={`${styles.decisionPanel} ${elapsed >= 1200 && !selected ? styles.panelVisible : ""}`}
            aria-label="Underwriting decision"
          >
            <div className={styles.panelHeading}>
              <span className={styles.liveDot} />
              UNDERWRITING SNAPSHOT<span>01</span>
            </div>
            <div className={styles.panelProperty}>
              Northline Fabrication<span>Commercial property</span>
            </div>
            <div className={styles.scoreRow}>
              <span>Risk score</span>
              <strong>
                {elapsed >= 5600 ? DEMO_PROPERTY.riskScore : "—"}
                <small> / 100</small>
              </strong>
            </div>
            <div className={styles.appetiteRow}>
              <span>APPETITE MATCH</span>
              <strong>
                {elapsed >= 5900
                  ? Math.min(92, Math.round(((elapsed - 5900) / 700) * 92))
                  : "—"}
                <small>%</small>
              </strong>
            </div>
            <div className={styles.matchTrack}>
              <i
                style={{
                  width:
                    elapsed >= 6600
                      ? "92%"
                      : `${Math.max(0, ((elapsed - 5900) / 700) * 92)}%`,
                }}
              />
            </div>
            <div className={styles.panelFindings}>
              <span>KEY FINDINGS</span>
              <p>
                <Check size={11} />
                {count >= 4
                  ? "Construction within appetite"
                  : "Reading property schedule…"}
              </p>
              <p>
                <span className={styles.amberDot} />
                {count >= 3
                  ? "Roof & flood review flagged"
                  : "Investigating site exposure…"}
              </p>
            </div>
            <div
              className={`${styles.recommendation} ${complete ? styles.recommendationReady : ""}`}
            >
              <ShieldCheck size={16} />
              <span>
                {complete ? "Proceed to Quote" : "Evaluating risk…"}
                <small>
                  {complete
                    ? "Recommended · subject to review"
                    : "Connecting the evidence"}
                </small>
              </span>
              {complete && <ArrowUpRight size={14} />}
            </div>
          </aside>

          {evidence && inspection && (
            <aside
              className={styles.evidencePanel}
              aria-label={`${evidence.label} evidence`}
            >
              <div className={styles.evidenceHeader}>
                <span className={styles.microLabel}>
                  EVIDENCE /{" "}
                  {String(RISK_SIGNALS.indexOf(evidence) + 1).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close evidence"
                >
                  <X size={17} />
                </button>
              </div>
              <div className={styles.evidenceCategory}>
                <span
                  className={
                    evidence.severity === "attention"
                      ? styles.amberDot
                      : styles.liveDot
                  }
                />
                {evidence.label}
              </div>
              <h3>{evidence.value}</h3>
              <p>{inspection.summary}</p>
              <div className={styles.inspectionMetric}>
                <span>{inspection.metricLabel}</span>
                <strong>{inspection.metric}</strong>
              </div>
              {selected === "flood" && (
                <div className={styles.scenarioControl}>
                  <label htmlFor="astra-water-level">
                    Illustrative water rise
                    <strong>{(waterLevel * 1.5).toFixed(2)} m</strong>
                  </label>
                  <input
                    id="astra-water-level"
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(waterLevel * 100)}
                    onChange={(event) =>
                      setWaterLevel(Number(event.target.value) / 100)
                    }
                    disabled={!sceneAvailable}
                    aria-label="Illustrative water rise"
                    aria-valuetext={`${(waterLevel * 1.5).toFixed(2)} metres above the sample baseline`}
                  />
                  <div>
                    <span>Baseline</span>
                    <span>+1.5 m scenario</span>
                  </div>
                  <p>
                    {waterLevel > 0.65
                      ? "Scenario reaches the eastern service yard. Building elevation needs verification."
                      : "Water remains near the drainage edge. A low setting does not establish safety."}
                  </p>
                </div>
              )}
              {selected &&
                ["roof", "construction", "business", "fire"].includes(
                  selected,
                ) && (
                  <button
                    type="button"
                    className={styles.cutawayControl}
                    onClick={() => setCutaway((value) => !value)}
                    aria-pressed={cutaway}
                    disabled={!sceneAvailable}
                  >
                    <Layers size={14} />
                    <span>
                      {selected === "roof"
                        ? cutaway
                          ? "Reassemble roof"
                          : "Lift roof assembly"
                        : cutaway
                          ? "Restore building exterior"
                          : "Reveal building interior"}
                    </span>
                    <span className={styles.toggleTrack}>
                      <i />
                    </span>
                  </button>
                )}
              {!sceneAvailable && (
                <p className={styles.staticNotice}>
                  Static view. Source evidence and reasoning are still
                  available.
                </p>
              )}
              <ol className={styles.reasoningSteps}>
                {inspection.steps.map((step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className={styles.nextAction}>
                <span>ASTRA'S NEXT ACTION</span>
                <p>{inspection.nextAction}</p>
              </div>
              <button
                type="button"
                className={styles.sourceToggle}
                onClick={() => setSourceOpen((value) => !value)}
                aria-label={
                  sourceOpen ? "Hide source excerpt" : "Read source excerpt"
                }
                aria-expanded={sourceOpen}
                aria-controls="astra-source-excerpt"
              >
                <FileText size={13} />
                <span>
                  {sourceOpen ? "Hide source excerpt" : "Read source excerpt"}
                  <small>{inspection.sourceKind}</small>
                </span>
                <ChevronRight size={13} />
              </button>
              {sourceOpen && (
                <blockquote
                  id="astra-source-excerpt"
                  className={styles.sourceExcerpt}
                >
                  {inspection.sourceExcerpt}
                  <cite>{inspection.sourceKind} · illustrative document</cite>
                </blockquote>
              )}
              <button
                type="button"
                className={styles.evidenceBack}
                onClick={() => setSelected(null)}
              >
                Back to full assessment
                <ArrowUpRight size={14} />
              </button>
            </aside>
          )}
        </div>
      </section>

      <div className={styles.sequenceBar}>
        <div className={styles.sequenceState} role="status" aria-live="polite">
          <span className={styles.liveDot} />
          {!ready
            ? "INITIALIZING DIGITAL TWIN"
            : complete
              ? "INVESTIGATION COMPLETE"
              : `${WORKFLOW[phase].label.toUpperCase()} IN PROGRESS`}
        </div>
        <div className={styles.sequenceSteps}>
          {WORKFLOW.map((step, index) => (
            <span
              key={step.label}
              className={ready && phase >= index ? styles.stepDone : ""}
            >
              {(ready && phase > index) || complete ? (
                <Check size={12} />
              ) : (
                <span className={styles.stepNumber}>{index + 1}</span>
              )}
              {step.label}
              {index < 4 && (
                <ChevronRight size={12} className={styles.stepArrow} />
              )}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={complete ? replay : skip}
          className={styles.sequenceTime}
        >
          {complete ? <RotateCcw size={12} /> : <Play size={11} />}
          {complete ? "Replay" : "Skip to result"}
          <span>{(elapsed / 1000).toFixed(1)}s</span>
        </button>
        <div
          className={styles.sequenceProgress}
          style={{ transform: `scaleX(${elapsed / DEMO_DURATION})` }}
        />
      </div>

      <section className={styles.signalSummary} aria-label="Assessment summary">
        <div>
          <span className={styles.summaryIcon}>
            <FileText size={19} />
          </span>
          <p>
            <strong>One submission.</strong>
            <span>Every detail, connected.</span>
          </p>
        </div>
        <div>
          <strong className={styles.summaryNumber}>
            {elapsed >= 1200 ? "24" : "—"}
            <span>facts extracted</span>
          </strong>
        </div>
        <div>
          <strong className={styles.summaryNumber}>
            {count}
            <span>risk signals investigated</span>
          </strong>
        </div>
        <div>
          <strong className={styles.summaryNumber}>
            100<span>% explainable findings</span>
          </strong>
        </div>
        <a href="#underwriting" className={styles.scrollPrompt}>
          FOLLOW THE EVIDENCE
          <ArrowDownRight size={22} />
        </a>
      </section>

      <section
        id="underwriting"
        className={styles.underwriting}
        data-astra-reveal
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>
              <span className={styles.liveDot} />
              FROM THE REAL WORLD TO YOUR WORKSPACE
            </span>
            <h2>
              Every angle.
              <br />
              <span>One clear decision.</span>
            </h2>
          </div>
          <p>
            The context you need, already connected.
            <br />
            Follow the investigation from the first document
            <br className={styles.desktopBreak} /> to a decision you can stand
            behind.
          </p>
        </div>
        <div className={styles.workspacePreview}>
          <div className={styles.workspaceTop}>
            <span>
              <Mark size={22} />
              astra
              <span className={styles.workspaceDivider} />
              Underwriting workspace
              <ChevronRight size={12} />
              <strong>Northline Fabrication</strong>
            </span>
            <span className={styles.samplePill}>SAMPLE CASE</span>
          </div>
          <div className={styles.workspaceBody}>
            <nav
              className={styles.workflowNav}
              aria-label="Explore underwriting stages"
            >
              <span className={styles.microLabel}>THE INVESTIGATION</span>
              {WORKFLOW.map((step, index) => (
                <button
                  type="button"
                  key={step.label}
                  onClick={() => setActiveStep(index)}
                  aria-pressed={activeStep === index}
                  className={activeStep === index ? styles.workflowActive : ""}
                >
                  <span className={styles.workflowNumber}>
                    {index < activeStep ? (
                      <Check size={13} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    {step.label}
                    <small>
                      {index === activeStep
                        ? "Exploring this stage"
                        : "View stage"}
                    </small>
                  </span>
                  <ChevronRight size={13} />
                </button>
              ))}
              <div className={styles.workflowFooter}>
                <ShieldCheck size={16} />
                <span>
                  You make the call.<small>Astra shows its work.</small>
                </span>
              </div>
            </nav>
            <div className={styles.workflowContent} key={activeStep}>
              <div className={styles.workflowContentTop}>
                <span className={styles.microLabel}>
                  0{activeStep + 1} / {WORKFLOW[activeStep].label.toUpperCase()}
                </span>
                <span className={styles.completedPill}>
                  <Check size={11} />
                  Complete
                </span>
              </div>
              <h3>{WORKFLOW[activeStep].title}</h3>
              <p>{WORKFLOW[activeStep].description}</p>
              <div className={styles.factTable}>
                {WORKFLOW[activeStep].items.map(([label, value], index) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong
                      className={
                        activeStep === 2 && index < 3 ? styles.factWarning : ""
                      }
                    >
                      {value}
                    </strong>
                    {activeStep === 2 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(
                            (
                              ["roof", "flood", "hazards", "claims"] as RiskId[]
                            )[index],
                          );
                          document
                            .getElementById("experience")
                            ?.scrollIntoView({
                              behavior: reduced ? "instant" : "smooth",
                            });
                        }}
                        aria-label={`Inspect ${label} evidence`}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    ) : (
                      <Check size={14} />
                    )}
                  </div>
                ))}
              </div>
              <div className={styles.sourceNote}>
                <FileText size={13} />
                Linked to source evidence
                <span>4 findings · full audit trail</span>
              </div>
            </div>
            <aside className={styles.workspaceDecision}>
              <span className={styles.microLabel}>THE BIG PICTURE</span>
              <div className={styles.largeScore}>
                92<span>%</span>
              </div>
              <span className={styles.workspaceMatch}>Appetite match</span>
              <div className={styles.workspaceMatchTrack}>
                <i />
              </div>
              <p>
                Strong alignment.
                <br />A few things to look closer at.
              </p>
              <div className={styles.reviewNote}>
                <ShieldCheck size={15} />
                <span>
                  Ready for your review<small>2 conditions to resolve</small>
                </span>
              </div>
              <Link href="/cases/new?sample=1">
                Open a sample case
                <ArrowUpRight size={14} />
              </Link>
            </aside>
          </div>
        </div>
        <div className={styles.previewCaption}>
          <span>
            <span className={styles.liveDot} />
            ILLUSTRATIVE WORKFLOW · REAL POSSIBILITIES
          </span>
          <Link href="/overview">
            Explore the live workspace
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <section className={styles.closing} data-astra-reveal>
        <div className={styles.closingMark}>
          <Mark size={50} />
        </div>
        <p>LESS CHASING. MORE UNDERWRITING.</p>
        <h2>
          A clearer view.
          <br />A more confident decision.
        </h2>
        <Link href="/cases/new" className={styles.primaryCta}>
          Start a submission
          <ArrowUpRight size={17} />
        </Link>
        <span>Built for the judgment only you can bring.</span>
      </section>
      <footer className={styles.footer}>
        <Link href="/" className={styles.brand}>
          <Mark size={26} />
          <span>
            astra<span className={styles.brandRisk}>risk</span>
          </span>
        </Link>
        <p>Intelligence, grounded in reality.</p>
        <nav aria-label="Footer navigation">
          <Link href="/docs">
            Documentation
            <ArrowUpRight size={12} />
          </Link>
          <Link href="/overview">
            Workspace
            <ArrowUpRight size={12} />
          </Link>
        </nav>
        <small>Demo data. Recommendations require underwriter review.</small>
      </footer>
    </main>
  );
}
