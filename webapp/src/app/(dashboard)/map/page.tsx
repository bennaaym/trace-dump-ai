import type { Metadata } from "next";
import { Layers3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  MapCanvas,
  PageHeader,
  PreviewNotice,
} from "../_components/page-elements";

export const metadata: Metadata = { title: "Map & Heatmap" };

export default function MapPage() {
  return (
    <>
      <PageHeader
        title="Map & Heatmap"
        description="Explore cameras and suspected incidents by geographic location."
        actions={
          <label className="text-xs font-semibold text-slate-500">
            Period
            <select className="ml-2 h-9 rounded-lg border bg-white px-3">
              <option>Last 30 days</option>
            </select>
          </label>
        }
      />
      <PreviewNotice compact />
      <div className="mt-4 grid gap-4 xl:grid-cols-[220px_1fr]">
        <aside className="surface h-fit p-4">
          <div className="flex items-center gap-2">
            <Layers3 className="size-4 text-teal-600" />
            <h2 className="text-sm font-bold">Layers & filters</h2>
          </div>
          <fieldset className="mt-5 space-y-3 text-xs">
            <legend className="mb-2 font-semibold text-slate-500">
              Layers
            </legend>
            {["Incident markers", "Density heatmap", "Camera locations"].map(
              (label) => (
                <label className="flex items-center gap-2" key={label}>
                  <input
                    type="checkbox"
                    defaultChecked
                    className="accent-teal-600"
                  />
                  {label}
                </label>
              ),
            )}
          </fieldset>
          <div className="my-5 border-t" />
          <div className="space-y-3">
            <select
              disabled
              className="h-9 w-full rounded-lg border bg-slate-50 px-3 text-xs"
            >
              <option>All incident types</option>
            </select>
            <select
              disabled
              className="h-9 w-full rounded-lg border bg-slate-50 px-3 text-xs"
            >
              <option>All review statuses</option>
            </select>
            <select
              disabled
              className="h-9 w-full rounded-lg border bg-slate-50 px-3 text-xs"
            >
              <option>All cameras</option>
            </select>
          </div>
          <Badge tone="warning" className="mt-5">
            Coordinates unavailable
          </Badge>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Synthetic Bordeaux coordinates will only be shown when clearly
            identified by the connected source.
          </p>
        </aside>
        <MapCanvas large />
      </div>
    </>
  );
}
