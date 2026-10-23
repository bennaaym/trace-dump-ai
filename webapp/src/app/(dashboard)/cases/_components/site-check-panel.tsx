import { Bot } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "../../_lib/format";
import { siteCheckLabel, type SiteCheckResult } from "../_lib/case-state";
import type { CaseDetail } from "../_queries/cases";

export function SiteCheckBadge({ result }: { result: SiteCheckResult }) {
  const tone = {
    still_present: "danger",
    cleared: "success",
    uncertain: "neutral",
  }[result] as "danger" | "success" | "neutral";
  return <Badge tone={tone}>{siteCheckLabel(result)}</Badge>;
}

export function SiteCheckPanel({
  checks,
  resolved,
  overdue,
}: {
  checks: CaseDetail["siteChecks"];
  resolved: boolean;
  overdue: boolean;
}) {
  const latest = checks.find((check) => check.status === "completed");
  return (
    <section className="surface p-4" aria-label="AI site check">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-slate-500" />
        <h2 className="font-heading text-sm font-bold text-slate-900">
          AI site check
        </h2>
      </div>
      {latest?.result ? (
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <SiteCheckBadge result={latest.result} />
            <span className="text-slate-500">
              footage from {formatDateTime(latest.windowStartAt)} –{" "}
              {formatDateTime(latest.windowEndAt)} UTC
            </span>
          </div>
          {latest.summary && (
            <p className="whitespace-pre-line text-slate-700">
              {latest.summary}
            </p>
          )}
          {latest.uncertainty && (
            <p className="text-slate-500">Uncertainty: {latest.uncertainty}</p>
          )}
          {!resolved && latest.result === "cleared" && (
            <p className="rounded-lg bg-green-50 px-3 py-2 font-semibold text-green-800">
              The AI suggests the site may be cleared. Review the footage and
              resolve the case if you agree.
            </p>
          )}
          {!resolved && latest.result === "still_present" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-800">
              The reported waste was still visible at the last check.
            </p>
          )}
          <p className="text-slate-400">
            An AI lead, not a finding. A person must confirm before the case is
            resolved.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          {overdue
            ? "No check has completed yet. The site-check worker re-examines overdue cases automatically."
            : "Checks begin automatically once a case is more than 24 hours past its recording and still unresolved."}
        </p>
      )}
      {checks.length > 1 && (
        <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-slate-500">
          {checks.map((check) => (
            <li key={check.id} className="flex flex-wrap gap-x-2">
              <span>{formatDateTime(check.createdAt)} UTC</span>
              <span>
                {check.status === "completed" && check.result
                  ? siteCheckLabel(check.result)
                  : check.status === "failed"
                    ? "Could not be completed"
                    : "In progress"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
