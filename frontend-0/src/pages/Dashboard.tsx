import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listFlows, listRecords } from "../api";
import { useAuth } from "../auth";
import { CATALOG } from "../catalog";

interface Card {
  key: string;
  label: string;
  count: number;
  sample: string;
}

export function Dashboard() {
  const { user, superAdmin } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await Promise.all(CATALOG.map(async (item) => {
          const rows = item.source === "flows"
            ? await listFlows()
            : await listRecords(item.model, item.view);
          const first = rows[0];
          const sample = first
            ? String(first.name || first.email || first.code || first.field_name || "")
            : "None yet";
          return { key: item.key, label: item.label, count: rows.length, sample };
        }));
        if (!cancelled) setCards(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the dashboard");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">
        Signed in as {user?.email} on {user?.org?.name || user?.org_id}
        {superAdmin ? " · Super Admin" : ""}.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {cards.map((card) => (
          <Link key={card.key} className="stat" to={`/settings/${card.key}`}>
            <span className="muted">{card.label}</span>
            <b>{card.count}</b>
            <span className="muted">{card.sample}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
