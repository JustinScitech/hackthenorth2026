"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowDown,
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
import {
  DEFAULT_LANDING_THEME,
  LANDING_THEME_KEY,
  isLandingTheme,
  landingThemeScript,
  type LandingTheme,
} from "./landing-theme";
import styles from "./home.module.css";
import ui from "./landing.module.css";

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
  const [theme, setThemeState] = useState<LandingTheme>(DEFAULT_LANDING_THEME);
  const rootRef = useRef<HTMLElement>(null);
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

  // Light by default. The pre-hydration script applies a saved preference before paint,
  // and the page follows later changes to the stored value (see setLandingTheme).
  useEffect(() => {
    const applied = rootRef.current?.dataset.theme;
    if (isLandingTheme(applied)) setThemeState(applied);
    const onStorage = (event: StorageEvent) => {
      if (event.key === LANDING_THEME_KEY && isLandingTheme(event.newValue)) setThemeState(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
            entry.target.classList.add(ui.revealed);
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
    <main
      ref={rootRef}
      className={ui.page}
      data-theme={theme}
      suppressHydrationWarning
    >
      {/* Applies a saved dark preference before first paint. */}
      <script dangerouslySetInnerHTML={{ __html: landingThemeScript }} />
      <a href="#underwriting" className={ui.skipLink}>
        Skip to how it works
      </a>

      <header className={ui.nav}>
        <div className={`${ui.container} ${ui.navInner}`}>
          <Link href="/" className={ui.brand} aria-label="Astra Risk home">
            <Mark size={24} priority />
            Astra<small>Risk</small>
          </Link>
          <nav className={ui.navLinks} aria-label="Main navigation">
            <a href="#experience">Platform</a>
            <a href="#underwriting">How it works</a>
            <Link href="/docs">
              Documentation
              <ArrowUpRight size={12} />
            </Link>
          </nav>
          <div className={ui.navActions}>
            <Link href="/overview" className={`${ui.pill} ${ui.pillPrimary} ${ui.pillSm}`}>
              Open workspace
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      <section className={`${ui.container} ${ui.hero}`} id="experience" aria-labelledby="hero-title">
        <div className={ui.heroCopy}>
          <span className={ui.eyebrow} style={{ "--i": 0 } as React.CSSProperties}>
            <span className={ui.liveDot} />
            Intelligence, grounded in reality
          </span>
          <h1 id="hero-title" style={{ "--i": 1 } as React.CSSProperties}>
            AI underwriting{" "}
            <br />
            that sees the <span>whole risk.</span>
          </h1>
          <p className={ui.intro} style={{ "--i": 2 } as React.CSSProperties}>
            Astra reads the submission, investigates the property, checks
            appetite, and shows its work.
          </p>
          <div className={ui.heroActions} style={{ "--i": 3 } as React.CSSProperties}>
            <button
              type="button"
              className={`${ui.pill} ${ui.pillPrimary}`}
              onClick={replay}
            >
              <ScanLine size={16} />
              Run Astra
            </button>
            <a className={ui.pill} href="#underwriting">
              How it works
              <ArrowDown size={15} className={ui.iconDown} />
            </a>
          </div>
          <div className={ui.submission} key={run} style={{ "--i": 4 } as React.CSSProperties}>
            <span
              className={`${ui.documentIcon} ${ready && !complete ? ui.documentEntering : ""}`}
            >
              <FileText size={18} />
            </span>
            <span className={ui.submissionText}>
              <strong>Northline_Fabrication.pdf</strong>
              <span>Submission · ACORD + schedule + loss runs</span>
            </span>
            <span
              className={`${ui.documentStatus} ${elapsed > 1200 ? ui.documentDone : ""}`}
            >
              {elapsed > 1200 ? <CheckCheck size={16} /> : <ArrowRight size={16} />}
            </span>
          </div>
        </div>

        <div className={ui.stageFrame}>
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

        </div>
      </section>

      <div className={ui.container}>
      <div className={ui.statusBar}>
        <div className={ui.statusState} role="status" aria-live="polite">
          <span className={ui.liveDot} />
          {!ready
            ? "Initializing"
            : complete
              ? "Investigation complete"
              : `${WORKFLOW[phase].label} in progress`}
        </div>
        <div className={ui.statusSteps} aria-hidden="true">
          {WORKFLOW.map((step, index) => (
            <span
              key={step.label}
              className={ready && phase >= index ? ui.stepDone : ""}
            >
              {(ready && phase > index) || complete ? (
                <Check size={12} />
              ) : (
                <span className={ui.stepNumber}>{index + 1}</span>
              )}
              {step.label}
              {index < WORKFLOW.length - 1 && (
                <ChevronRight size={12} className={ui.stepArrow} />
              )}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={complete ? replay : skip}
          className={`${ui.pill} ${ui.pillSm} ${ui.statusTime}`}
        >
          {complete ? <RotateCcw size={12} /> : <Play size={11} />}
          {complete ? "Replay" : "Skip to result"}
          <span>{(elapsed / 1000).toFixed(1)}s</span>
        </button>
        <div
          className={ui.statusProgress}
          style={{ transform: `scaleX(${elapsed / DEMO_DURATION})` }}
        />
      </div>

      </div>

      <div className={ui.container}>
      <section className={ui.stats} aria-label="Assessment summary">
        <div>
          <strong>{elapsed >= 1200 ? "24" : "—"}</strong>
          <span>Facts extracted</span>
        </div>
        <div>
          <strong>{count}</strong>
          <span>Risk signals investigated</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>Explainable findings</span>
        </div>
      </section>

      </div>

      <section id="underwriting" className={`${ui.container} ${ui.band}`} data-astra-reveal>
        <div className={ui.bandHead}>
          <div>
            <span className={ui.eyebrow}>
              <span className={ui.liveDot} />
              How it works
            </span>
            <h2>
              Every angle.
              <br />
              <span>One clear decision.</span>
            </h2>
          </div>
          <p>
            Follow a submission from the first document to a decision you can
            stand behind.
          </p>
        </div>
        <div className={ui.workspace}>
          <div className={ui.workspaceTop}>
            <span>
              <Mark size={18} />
              Underwriting workspace
              <ChevronRight size={12} />
              <strong>Northline Fabrication</strong>
            </span>
            <span className={ui.monoPill}>Sample case</span>
          </div>
          <div className={ui.workspaceBody}>
            <nav className={ui.stageNav} aria-label="Explore underwriting stages">
              <span className={ui.eyebrow}>The investigation</span>
              {WORKFLOW.map((step, index) => (
                <button
                  type="button"
                  key={step.label}
                  onClick={() => setActiveStep(index)}
                  aria-pressed={activeStep === index}
                  className={
                    activeStep === index
                      ? ui.stageActive
                      : index < activeStep
                        ? ui.stageDone
                        : ""
                  }
                >
                  <span className={ui.stageNumber}>
                    {index < activeStep ? (
                      <Check size={12} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  {step.label}
                  <ChevronRight size={14} />
                </button>
              ))}
            </nav>
            <div className={ui.stageContent} key={activeStep}>
              <span className={ui.eyebrow}>
                0{activeStep + 1} / {WORKFLOW[activeStep].label}
              </span>
              <h3>{WORKFLOW[activeStep].title}</h3>
              <p>{WORKFLOW[activeStep].description}</p>
              <div className={ui.facts}>
                {WORKFLOW[activeStep].items.map(([label, value], index) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong
                      className={
                        activeStep === 2 && index < 3 ? ui.factWarning : ""
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
                        <ArrowUpRight size={14} />
                      </button>
                    ) : (
                      <Check size={14} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <aside className={ui.decision} aria-label="Decision summary">
              <span className={ui.eyebrow}>The big picture</span>
              <div className={ui.bigScore}>
                {DEMO_PROPERTY.match}
                <span>%</span>
              </div>
              <span className={ui.scoreLabel}>Appetite match</span>
              <div className={ui.track}>
                <i />
              </div>
              <div className={ui.reviewNote}>
                <ShieldCheck size={16} />
                <span>
                  Ready for your review
                  <small>2 conditions to resolve</small>
                </span>
              </div>
              <Link href="/cases/new?sample=1" className={ui.pill}>
                Open a sample case
                <ArrowUpRight size={14} />
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <section className={`${ui.container} ${ui.band} ${ui.closing}`} data-astra-reveal>
        <div className={ui.closingMark}>
          <Mark size={44} />
        </div>
        <span className={ui.eyebrow}>Less chasing. More underwriting.</span>
        <h2>
          A clearer view.
          <br />A more confident decision.
        </h2>
        <Link href="/cases/new" className={`${ui.pill} ${ui.pillPrimary}`}>
          Start a submission
          <ArrowUpRight size={16} />
        </Link>
      </section>

      <footer className={ui.footer}>
        <div className={`${ui.container} ${ui.footerInner}`}>
          <Link href="/" className={ui.brand}>
            <Mark size={20} />
            Astra<small>Risk</small>
          </Link>
          <span>Intelligence, grounded in reality.</span>
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
          <small>Demo data · Recommendations require underwriter review</small>
        </div>
      </footer>
    </main>
  );
}
