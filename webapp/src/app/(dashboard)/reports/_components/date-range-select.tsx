"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import type { InsightsRange } from "../_lib/insights-data";

export function DateRangeSelect({ value }: { value: InsightsRange }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
      <span>Date range</span>
      <select
        value={value}
        disabled={isPending}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("range", event.target.value);
          startTransition(() =>
            router.replace(`${pathname}?${next.toString()}`),
          );
        }}
        className="h-9 rounded-lg border bg-white px-3 text-xs text-slate-700 disabled:opacity-60"
      >
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="all">All recorded data</option>
      </select>
    </label>
  );
}
