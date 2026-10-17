import type { Metadata } from "next";
import { Layers3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MapCanvas, PageHeader } from "../_components/page-elements";
import { getMapData } from "./_queries/map";

export const metadata: Metadata = { title: "Map & Heatmap" };

export default async function MapPage() {
  const data = await getMapData();
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
            <p className="text-xs text-slate-500">
              {data.incidents.length} incident marker
              {data.incidents.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-slate-500">
              {data.cameras.length} camera location
              {data.cameras.length === 1 ? "" : "s"}
            </p>
          </div>
          <Badge tone="warning" className="mt-5">
            Simulated geography
          </Badge>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Current Bordeaux camera coordinates are simulated. Incident markers
            use immutable event-time snapshots.
          </p>
        </aside>
        <MapCanvas large cameras={data.cameras} incidents={data.incidents} />
      </div>
    </>
  );
}
