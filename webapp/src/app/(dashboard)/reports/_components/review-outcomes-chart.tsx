"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ReviewStatus } from "../../_lib/types";

const colors: Record<ReviewStatus, string> = {
  pending_review: "#f59e0b",
  needs_investigation: "#3b82f6",
  confirmed: "#10b981",
  dismissed: "#94a3b8",
};
const labels: Record<ReviewStatus, string> = {
  pending_review: "Pending review",
  needs_investigation: "Needs investigation",
  confirmed: "Confirmed",
  dismissed: "Dismissed",
};

export function ReviewOutcomesChart({
  data,
}: {
  data: Array<{ status: ReviewStatus; count: number }>;
}) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) {
    return (
      <div className="grid h-36 place-items-center rounded-lg border border-dashed bg-slate-50 text-center text-xs text-slate-500">
        No review outcomes in this period
      </div>
    );
  }

  return (
    <div className="grid items-center gap-3 sm:grid-cols-[150px_1fr]">
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.filter((item) => item.count > 0)}
              dataKey="count"
              nameKey="status"
              innerRadius={40}
              outerRadius={60}
              paddingAngle={2}
              stroke="none"
            >
              {data
                .filter((item) => item.count > 0)
                .map((item) => (
                  <Cell key={item.status} fill={colors[item.status]} />
                ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => [
                Number(value),
                labels[item.payload.status as ReviewStatus],
              ]}
              contentStyle={{
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <div
            key={item.status}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors[item.status] }}
              />
              <span className="truncate">{labels[item.status]}</span>
            </span>
            <strong className="text-slate-900">{item.count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
