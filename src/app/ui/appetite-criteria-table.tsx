import type { Criterion } from "@/federato/scoring";

export function AppetiteCriteriaTable({ criteria, detailed = false }: { criteria: Criterion[]; detailed?: boolean }) {
  return <div className="triage-table-wrap"><table className="triage-table">
    <thead><tr><th>Factor</th><th>Result</th><th>Points</th><th>{detailed ? "Evidence and rule" : "Source"}</th></tr></thead>
    <tbody>{criteria.map((criterion) => <tr key={criterion.concept}>
      <th scope="row">{criterion.factor}</th><td>{criterion.status}</td><td>{criterion.points}/{criterion.maximum}</td>
      <td>{detailed && <>{criterion.detail}<small>Source: {criterion.source}</small></>}{!detailed && criterion.source}</td>
    </tr>)}</tbody>
  </table></div>;
}
