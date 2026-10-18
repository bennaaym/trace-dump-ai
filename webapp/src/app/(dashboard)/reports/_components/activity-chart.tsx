"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ActivityChart({
  data,
  aggregation,
}: {
  data: Array<{ date: string; count: number }>;
  aggregation: "daily" | "weekly";
}) {
  const total = data.reduce((sum, point) => sum + point.count, 0);
  if (!total) {
    return (
      <div className="grid h-52 place-items-center rounded-lg border border-dashed bg-slate-50 px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            No incidents in this period
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The chart will appear when recorded incidents fall within the
            selected dates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-56 w-full"
      aria-label={`Incident activity, ${aggregation} aggregation`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#e2e8f0"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            labelFormatter={(label) => formatDate(String(label), aggregation)}
            formatter={(value) => [Number(value), "Recorded incidents"]}
            contentStyle={{
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgb(15 23 42 / 0.08)",
              fontSize: "12px",
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#0f9488"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#0f9488", strokeWidth: 0 }}
            activeDot={{
              r: 5,
              fill: "#0f4c81",
              stroke: "#fff",
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDate(value: string, aggregation: "daily" | "weekly") {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
  return aggregation === "weekly" ? `Week of ${formatted}` : formatted;
}
