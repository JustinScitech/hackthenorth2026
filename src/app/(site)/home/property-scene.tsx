"use client";
import { useEffect, useRef, useState } from "react";
import {
  Buildings,
  ClockCounterClockwise,
  Drop,
  Fire,
  HardHat,
  Scan,
  Warehouse,
} from "@phosphor-icons/react/dist/ssr";
import { RISK_SIGNALS, type RiskId } from "./demo-data";
import type { CameraCommand, SceneInspection } from "./inspection-data";
import { createPropertyEngine } from "./scene-engine";
import styles from "./home.module.css";

type Props = {
  elapsed: number;
  selected: RiskId | null;
  onSelect: (id: RiskId | null) => void;
  onReady: () => void;
  resetView: number;
  showSignals: boolean;
  reducedMotion: boolean;
  command: CameraCommand;
  inspection: SceneInspection;
  expanded: boolean;
  onAvailability: (available: boolean) => void;
};
const ICONS = {
  roof: HardHat,
  flood: Drop,
  fire: Fire,
  construction: Buildings,
  hazards: Warehouse,
  business: Scan,
  claims: ClockCounterClockwise,
};
const FALLBACK_POSITIONS = [
  [40, 34],
  [49, 68],
  [79, 63],
  [58, 50],
  [62, 24],
  [30, 53],
  [25, 33],
];
export default function PropertyScene(props: Props) {
  const mount = useRef<HTMLDivElement>(null),
    labels = useRef<(HTMLButtonElement | null)[]>([]),
    connections = useRef<(SVGPathElement | null)[]>([]);
  const current = useRef(props);
  current.current = props;
  const [loaded, setLoaded] = useState(false),
    [fallback, setFallback] = useState(false),
    [hovered, setHovered] = useState<RiskId | null>(null);
  useEffect(() => {
    if (!mount.current) return;
    return createPropertyEngine(mount.current, {
      getState: () => current.current,
      onReady: () => {
        setLoaded(true);
        current.current.onAvailability(true);
        current.current.onReady();
      },
      onFailure: () => {
        setFallback(true);
        setLoaded(false);
        current.current.onAvailability(false);
        current.current.onReady();
      },
      onHover: setHovered,
      onSelect: (id) => current.current.onSelect(id),
      onProject: (index, x, y, inView, nodeX, nodeY) => {
        const label = labels.current[index];
        if (label) {
          label.style.left = `${x}%`;
          label.style.top = `${y}%`;
          label.style.visibility = inView ? "" : "hidden";
        }
        connections.current[index]?.setAttribute(
          "d",
          `M ${x} ${y} Q ${(x + nodeX) / 2} ${Math.min(y, nodeY) - 6} ${nodeX} ${nodeY}`,
        );
      },
    });
  }, []);
  useEffect(() => {
    if (fallback)
      labels.current.forEach((label, index) => {
        if (label) {
          label.style.left = `${FALLBACK_POSITIONS[index][0]}%`;
          label.style.top = `${FALLBACK_POSITIONS[index][1]}%`;
          label.style.visibility = "";
        }
      });
  }, [fallback]);
  return (
    <div className={styles.sceneRoot}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/models/engineering-7-poster.webp"
        alt="Architectural interpretation of Waterloo Engineering 7, its patterned glass facade, atrium, road beneath the pedestrian bridge, and attached courtyard wing"
        className={`${styles.scenePoster} ${loaded && !fallback ? styles.posterHidden : ""}`}
        fetchPriority="high"
      />
      <div
        ref={mount}
        className={styles.canvasMount}
        style={{ opacity: fallback ? 0 : 1 }}
      />
      {fallback && (
        <span className={styles.fallbackNote}>
          Static property view · all evidence remains available
        </span>
      )}
      <svg
        className={styles.signalConnections}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {RISK_SIGNALS.map((signal, index) => (
          <path
            key={signal.id}
            ref={(element) => {
              connections.current[index] = element;
            }}
            className={
              props.showSignals &&
              props.elapsed >= signal.revealAt &&
              props.elapsed < 6600 &&
              !props.reducedMotion &&
              !fallback
                ? styles.connectionActive
                : ""
            }
          />
        ))}
      </svg>
      <div className={styles.riskMarkers} aria-label="Property risk signals">
        {RISK_SIGNALS.map((signal, index) => {
          const Icon = ICONS[signal.id];
          const visible =
            props.showSignals &&
            (props.elapsed >= signal.revealAt ||
              props.selected === signal.id) &&
            (!props.selected || props.selected === signal.id);
          return (
            <button
              type="button"
              key={signal.id}
              ref={(element) => {
                labels.current[index] = element;
              }}
              onClick={() =>
                props.onSelect(props.selected === signal.id ? null : signal.id)
              }
              onMouseEnter={() => setHovered(signal.id)}
              onMouseLeave={() => setHovered(null)}
              aria-label={`${signal.label}: ${signal.value}. Inspect evidence.`}
              aria-pressed={props.selected === signal.id}
              tabIndex={visible ? 0 : -1}
              aria-hidden={!visible}
              className={`${styles.riskMarker} ${visible ? styles.markerVisible : ""} ${signal.severity === "attention" ? styles.markerAttention : ""} ${hovered === signal.id || props.selected === signal.id ? styles.markerExpanded : ""} ${["roof", "flood", "hazards"].includes(signal.id) ? styles.markerLabeled : ""}`}
              style={{
                left: `${FALLBACK_POSITIONS[index][0]}%`,
                top: `${FALLBACK_POSITIONS[index][1]}%`,
              }}
            >
              <span className={styles.markerIcon}>
                <Icon size={13} />
              </span>
              <span className={styles.markerText}>
                <strong>{signal.shortLabel}</strong>
                <small>{signal.value}</small>
              </span>
              <span className={styles.markerStem} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
