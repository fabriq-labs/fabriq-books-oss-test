import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { listFlows, listRecords, visibleEntries } from "../api";
import { CATALOG } from "../catalog";

export function Records() {
  const { key } = useParams();
  const item = CATALOG.find((entry) => entry.key === key);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const load = item.source === "flows" ? listFlows() : listRecords(item.model, item.view);
    load
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [item]);

  if (!item) return <p>Unknown setting.</p>;

  return (
    <div>
      <h1>{item.label}</h1>
      <p className="muted">View {item.view}. Shared rows stay on org_system. Tenant rows stay on your org.</p>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>{item.fields.map((field) => <th key={field}>{field}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={item.fields.length}>No rows</td></tr>
          )}
          {rows.map((row) => (
            <tr key={String(row.id)}>
              {visibleEntries(row, item.fields).map(([field, value]) => (
                <td key={field}>{value == null ? "" : String(value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
