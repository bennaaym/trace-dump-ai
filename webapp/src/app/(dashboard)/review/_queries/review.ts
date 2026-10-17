import { getIncidents } from "../../incidents/_queries/incidents";

export async function getReviewQueue() {
  const [pending, investigating] = await Promise.all([
    getIncidents({ status: "pending_review" }),
    getIncidents({ status: "needs_investigation" }),
  ]);
  return [...pending.items, ...investigating.items].sort((left, right) =>
    (left.occurredAt ?? left.createdAt).localeCompare(
      right.occurredAt ?? right.createdAt,
    ),
  );
}
