import type { CaseStatus } from "@/lib/types";

const labels: Record<CaseStatus, string> = {
  received: "Received", extracting: "Extracting", checking: "Checking guidelines",
  waiting_for_broker: "Waiting for broker", review_ready: "Ready for review",
  approved: "Approved", declined: "Declined", failed: "Needs attention", stopped: "Stopped",
};

export function Status({ value }: { value: CaseStatus }) {
  return <span className={`status status-${value}`}><span className="status-dot" />{labels[value]}</span>;
}
