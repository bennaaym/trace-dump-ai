"use client";

import Link from "next/link";
import {
  Camera,
  ChevronRight,
  Layers3,
  Map as MapIcon,
  MapPin,
  Search,
  ShieldCheck,
  VideoOff,
  X,
} from "lucide-react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "../../_lib/format";
import type {
  OperationsCamera,
  OperationsIncident,
  OperationsMapData,
  ReviewStatus,
} from "../../_lib/types";

type CameraStateFilter = "all" | "enabled" | "disabled";
type ReviewFilter = "all" | ReviewStatus;
type DateRangeFilter = "all" | "7" | "30" | "90";

const BORDEAUX: [number, number] = [-0.5792, 44.8378];
const DAY_MS = 86_400_000;
const HEAT_SIGMA_METERS = 100;
const HEAT_REFERENCE_INCIDENTS = 5;

export function OperationsWorkspace({
  data,
  initialCameraId,
  referenceTime,
}: {
  data: OperationsMapData;
  initialCameraId: string | null;
  referenceTime: string;
}) {
  const [query, setQuery] = useState("");
  const [cameraState, setCameraState] = useState<CameraStateFilter>("all");
  const [review, setReview] = useState<ReviewFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    data.cameras.some((camera) => camera.id === initialCameraId)
      ? initialCameraId
      : null,
  );
  const [showCameras, setShowCameras] = useState(true);
  const [showIncidents, setShowIncidents] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const handleHeatmapChange = (checked: boolean) => {
    setShowHeatmap(checked);
    if (!checked) setReview("all");
  };

  const periodIncidents = useMemo(() => {
    const unique = [
      ...new Map(
        data.incidents.map((incident) => [incident.id, incident]),
      ).values(),
    ];
    if (dateRange === "all") return unique;
    const cutoff = Date.parse(referenceTime) - Number(dateRange) * DAY_MS;
    return unique.filter(
      (incident) =>
        Date.parse(incident.occurredAt ?? incident.createdAt) >= cutoff,
    );
  }, [data.incidents, dateRange, referenceTime]);

  const incidentsByCamera = useMemo(() => {
    const result = new Map<string, OperationsIncident[]>();
    for (const incident of periodIncidents) {
      const current = result.get(incident.cameraId) ?? [];
      current.push(incident);
      result.set(incident.cameraId, current);
    }
    return result;
  }, [periodIncidents]);

  const displayCameras = useMemo(
    () =>
      data.cameras.map((camera) =>
        withIncidentStats(camera, incidentsByCamera.get(camera.id) ?? []),
      ),
    [data.cameras, incidentsByCamera],
  );

  const filteredCameras = useMemo(
    () =>
      displayCameras.filter((camera) => {
        const searchMatches = camera.name
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase());
        const stateMatches =
          cameraState === "all" ||
          (cameraState === "enabled" ? camera.enabled : !camera.enabled);
        return searchMatches && stateMatches;
      }),
    [cameraState, displayCameras, query],
  );
  const visibleIds = useMemo(
    () => new Set(filteredCameras.map((camera) => camera.id)),
    [filteredCameras],
  );

  const filteredIncidents = useMemo(
    () =>
      periodIncidents.filter(
        (incident) =>
          visibleIds.has(incident.cameraId) &&
          (review === "all" || incident.reviewStatus === review),
      ),
    [periodIncidents, review, visibleIds],
  );
  const heatIncidents = useMemo(
    () =>
      review === "all"
        ? filteredIncidents.filter(
            (incident) => incident.reviewStatus !== "dismissed",
          )
        : filteredIncidents,
    [filteredIncidents, review],
  );
  const mappedIncidentCount = filteredIncidents.filter(
    (incident) => incident.latitude != null && incident.longitude != null,
  ).length;
  const selectedCamera =
    displayCameras.find(
      (camera) => camera.id === selectedId && visibleIds.has(camera.id),
    ) ?? null;
  return (
    <div className="mx-auto max-w-[1700px]">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
            Monitor
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor camera locations and suspected dumping activity across
            Bordeaux.
          </p>
        </div>
      </header>

      <section
        aria-label="Network summary"
        className="mt-5 grid gap-3 sm:grid-cols-3"
      >
        <Summary
          label="Total cameras"
          value={data.cameras.length}
          icon={Camera}
        />
        <Summary
          label="Enabled cameras"
          value={data.cameras.filter((camera) => camera.enabled).length}
          icon={ShieldCheck}
          tone="teal"
        />
        <Summary
          label="Recorded incidents"
          value={periodIncidents.length}
          icon={MapPin}
          tone="red"
        />
      </section>

      <section className="surface mt-4 p-3" aria-label="Operations filters">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,0.55fr))]">
          <label className="relative">
            <span className="sr-only">Search cameras</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cameras"
              className="h-9 w-full rounded-lg border bg-slate-50 pr-3 pl-9 text-xs"
            />
          </label>
          <Filter
            value={cameraState}
            onChange={setCameraState}
            label="Camera state"
          >
            <option value="all">All camera states</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </Filter>
          <Filter
            value={review}
            onChange={setReview}
            label="Review status"
            disabled={!showHeatmap}
            hint={
              showHeatmap
                ? undefined
                : "This filter works only when Heatmap is active."
            }
          >
            <option value="all">All review states</option>
            <option value="pending_review">Pending review</option>
            <option value="confirmed">Confirmed</option>
            <option value="needs_investigation">Needs investigation</option>
            <option value="dismissed">Dismissed</option>
          </Filter>
          <Filter value={dateRange} onChange={setDateRange} label="Date range">
            <option value="all">All dates</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Filter>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-slate-500">
            <Layers3 className="size-4" /> Layers
          </span>
          <LayerToggle
            checked={showCameras}
            onChange={setShowCameras}
            label="Cameras"
          />
          <LayerToggle
            checked={showIncidents}
            onChange={setShowIncidents}
            label="Incidents"
          />
          <LayerToggle
            checked={showHeatmap}
            onChange={handleHeatmapChange}
            label="Heatmap"
          />
          <span className="ml-auto text-slate-400">
            {mappedIncidentCount} matching incident
            {mappedIncidentCount === 1 ? "" : "s"} · {filteredCameras.length} of{" "}
            {data.cameras.length} cameras
          </span>
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <OperationsMap
          cameras={filteredCameras}
          incidents={filteredIncidents}
          heatIncidents={heatIncidents}
          selectedId={selectedId}
          showCameras={showCameras}
          showIncidents={showIncidents}
          showHeatmap={showHeatmap}
          onSelect={setSelectedId}
        />
        <CameraPanel
          camera={selectedCamera}
          summary={{ cameras: displayCameras, incidents: periodIncidents }}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  );
}

function OperationsMap({
  cameras,
  incidents,
  heatIncidents,
  selectedId,
  showCameras,
  showIncidents,
  showHeatmap,
  onSelect,
}: {
  cameras: OperationsCamera[];
  incidents: OperationsIncident[];
  heatIncidents: OperationsIncident[];
  selectedId: string | null;
  showCameras: boolean;
  showIncidents: boolean;
  showHeatmap: boolean;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const cameraLayerRef = useRef<LayerGroup | null>(null);
  const incidentLayerRef = useRef<LayerGroup | null>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onSelectRef = useRef(onSelect);
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    const container = containerRef.current;
    void (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || mapRef.current) return;
      const map = leaflet
        .map(container, { zoomControl: false, minZoom: 9, maxZoom: 19 })
        .setView([BORDEAUX[1], BORDEAUX[0]], 12);
      const incidentPane = map.createPane("operations-incidents");
      incidentPane.style.zIndex = "650";
      incidentPane.style.pointerEvents = "auto";
      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(map);
      leaflet.control.zoom({ position: "bottomright" }).addTo(map);
      cameraLayerRef.current = leaflet.layerGroup().addTo(map);
      incidentLayerRef.current = leaflet.layerGroup().addTo(map);
      leafletRef.current = leaflet;
      mapRef.current = map;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      cameraLayerRef.current = null;
      incidentLayerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const incidentLayer = incidentLayerRef.current;
    if (!leaflet || !map || !incidentLayer) return;
    incidentLayer.clearLayers();
    const mappedIncidents = incidents.filter(
      (incident) => incident.latitude != null && incident.longitude != null,
    );
    if (showIncidents) {
      for (const incident of mappedIncidents) {
        leaflet
          .circleMarker([incident.latitude!, incident.longitude!], {
            pane: "operations-incidents",
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: "#ef4444",
            fillOpacity: 0.9,
          })
          .on("click", () => onSelectRef.current(incident.cameraId))
          .addTo(incidentLayer);
      }
    }
  }, [incidents, mapReady, showIncidents]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const canvas = heatCanvasRef.current;
    if (!map || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const size = map.getSize();
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.x * pixelRatio);
      canvas.height = Math.round(size.y * pixelRatio);
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, size.x, size.y);
      if (!showHeatmap) return;

      const latitudeRadians = (map.getCenter().lat * Math.PI) / 180;
      const metersPerPixel =
        (40_075_016.686 * Math.cos(latitudeRadians)) / 2 ** (map.getZoom() + 8);
      const sigmaPixels = HEAT_SIGMA_METERS / metersPerPixel;
      const radius = Math.ceil(sigmaPixels * 3);
      const density = new Float32Array(size.x * size.y);

      for (const incident of heatIncidents) {
        if (incident.latitude == null || incident.longitude == null) continue;
        const point = map.latLngToContainerPoint([
          incident.latitude,
          incident.longitude,
        ]);
        const startX = Math.max(0, Math.floor(point.x - radius));
        const endX = Math.min(size.x - 1, Math.ceil(point.x + radius));
        const startY = Math.max(0, Math.floor(point.y - radius));
        const endY = Math.min(size.y - 1, Math.ceil(point.y + radius));
        const denominator = 2 * sigmaPixels * sigmaPixels;
        for (let y = startY; y <= endY; y += 1) {
          for (let x = startX; x <= endX; x += 1) {
            const distanceSquared = (x - point.x) ** 2 + (y - point.y) ** 2;
            density[y * size.x + x] += Math.exp(-distanceSquared / denominator);
          }
        }
      }

      const image = context.createImageData(size.x, size.y);
      for (let index = 0; index < density.length; index += 1) {
        const normalized = Math.min(
          1,
          density[index] / HEAT_REFERENCE_INCIDENTS,
        );
        if (normalized <= 0.002) continue;
        const [red, green, blue] = heatColor(normalized);
        const pixelIndex = index * 4;
        image.data[pixelIndex] = red;
        image.data[pixelIndex + 1] = green;
        image.data[pixelIndex + 2] = blue;
        image.data[pixelIndex + 3] = Math.round(
          Math.min(0.82, normalized * 3.2) * 255,
        );
      }
      context.putImageData(image, 0, 0);
    };

    draw();
    map.on("move zoom resize", draw);
    return () => {
      map.off("move zoom resize", draw);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [heatIncidents, mapReady, showHeatmap]);

  useEffect(() => {
    if (!mapReady) return;
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const cameraLayer = cameraLayerRef.current;
    if (!leaflet || !map || !cameraLayer) return;
    cameraLayer.clearLayers();
    if (!showCameras) return;
    for (const camera of cameras) {
      if (camera.latitude == null || camera.longitude == null) continue;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = cn(
        "relative grid size-9 place-items-center rounded-full border-[3px] border-white text-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-teal-400",
        camera.id === selectedId && "scale-110 ring-4 ring-teal-300/60",
        camera.enabled ? "bg-teal-600" : "bg-slate-500",
      );
      marker.setAttribute("aria-label", `Select ${camera.name}`);
      marker.title = `${camera.name} · ${camera.incidentCount} suspected incident${camera.incidentCount === 1 ? "" : "s"}`;
      marker.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 5 3V8l-5 3"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>';
      if (camera.incidentCount > 0) {
        const count = document.createElement("span");
        count.className =
          "absolute -right-2 -top-2 grid min-w-5 h-5 place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[9px] font-bold text-white";
        count.textContent = String(camera.incidentCount);
        marker.appendChild(count);
      }
      marker.addEventListener("click", () => onSelectRef.current(camera.id));
      const icon = leaflet.divIcon({
        html: marker,
        className: "camera-map-icon",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      leaflet
        .marker([camera.latitude, camera.longitude], { icon })
        .addTo(cameraLayer);
    }
  }, [cameras, mapReady, selectedId, showCameras]);

  useEffect(() => {
    const camera = cameras.find((item) => item.id === selectedId);
    if (camera?.latitude != null && camera.longitude != null) {
      mapRef.current?.flyTo(
        [camera.latitude, camera.longitude],
        Math.max(mapRef.current.getZoom(), 14),
      );
    }
  }, [cameras, mapReady, selectedId]);

  const mappedCount = cameras.filter(
    (camera) => camera.latitude != null && camera.longitude != null,
  ).length;

  return (
    <div className="surface relative min-h-[620px] overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      <canvas
        ref={heatCanvasRef}
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 625 }}
        aria-hidden="true"
      />
      {showHeatmap && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[700] w-64 rounded-lg border bg-white/95 p-3 text-[10px] shadow-sm backdrop-blur">
          <p className="font-semibold text-slate-700">
            Relative incident density
          </p>
          <div className="mt-2 h-2 rounded-full bg-gradient-to-r from-yellow-200 via-amber-400 to-red-500" />
          <div className="mt-1 flex justify-between text-slate-500">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
      )}
      {!mappedCount && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="rounded-xl border bg-white p-5 text-center shadow-lg">
            <MapPin className="mx-auto size-6 text-teal-600" />
            <p className="mt-2 text-sm font-semibold">No mapped cameras</p>
            <p className="mt-1 text-xs text-slate-500">
              The current filters contain no cameras with coordinates.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CameraPanel({
  camera,
  summary,
  onClose,
}: {
  camera: OperationsCamera | null;
  summary: OperationsMapData;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label={camera ? `${camera.name} details` : "City camera summary"}
      className={cn(
        "surface h-fit overflow-hidden xl:sticky xl:top-20",
        camera
          ? "fixed inset-x-3 bottom-3 z-50 max-h-[82vh] overflow-y-auto shadow-2xl xl:static xl:max-h-none xl:shadow-sm"
          : "hidden xl:block",
      )}
    >
      {camera ? (
        <>
          <div className="flex items-start justify-between border-b p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-bold text-slate-900">
                  {camera.name}
                </h2>
                <Badge tone={camera.enabled ? "teal" : "neutral"}>
                  {camera.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                {camera.id}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-slate-100"
              aria-label="Close camera details"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="m-4 grid aspect-video place-items-center rounded-xl border border-slate-700 bg-slate-950 p-5 text-center text-white">
            <div>
              <VideoOff className="mx-auto size-7 text-slate-400" />
              <p className="mt-2 text-sm font-semibold">
                Live preview unavailable
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-400">
                A secure XProtect WebRTC or authenticated preview bridge is not
                configured. No playback is being simulated.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 px-4">
            <PanelStat label="Total incidents" value={camera.incidentCount} />
            <PanelStat
              label="Pending review"
              value={camera.pendingIncidentCount}
            />
          </div>
          <dl className="mx-4 my-4 grid grid-cols-[118px_1fr] gap-y-2 border-y py-4 text-xs">
            <dt className="text-slate-500">Camera state</dt>
            <dd className="font-medium">
              {camera.enabled ? "Enabled" : "Disabled"}
            </dd>
            <dt className="text-slate-500">Coordinates</dt>
            <dd className="font-mono text-[10px]">{coordinateText(camera)}</dd>
            <dt className="text-slate-500">Location</dt>
            <dd>
              {camera.locationSource === "simulated"
                ? "Simulated Bordeaux location"
                : "XProtect-synchronized location"}
            </dd>
            {camera.lastDetectionAt && (
              <>
                <dt className="text-slate-500">Last detection</dt>
                <dd>{formatDateTime(camera.lastDetectionAt)}</dd>
              </>
            )}
          </dl>
          <div className="space-y-2 px-4 pb-4">
            <Link
              href={`/incidents?camera=${encodeURIComponent(camera.id)}`}
              className="flex h-9 items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700"
            >
              View camera incidents
              <ChevronRight className="size-3.5" />
            </Link>
            {!camera.incidentCount && (
              <p className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">
                No incidents are associated with this camera.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
            <MapIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-base font-bold">City camera summary</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Select a map marker to inspect a camera. All{" "}
            {summary.cameras.length} RLS-visible cameras remain available,
            including disabled cameras.
          </p>
          <div className="mt-5 space-y-3 border-t pt-4 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Mapped cameras</span>
              <strong>
                {summary.cameras.filter((item) => item.latitude != null).length}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Disabled cameras</span>
              <strong>
                {summary.cameras.filter((item) => !item.enabled).length}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cameras without incidents</span>
              <strong>
                {
                  summary.cameras.filter((item) => item.incidentCount === 0)
                    .length
                }
              </strong>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone = "navy",
}: {
  label: string;
  value: number;
  icon: typeof Camera;
  tone?: "navy" | "teal" | "green" | "red" | "amber";
}) {
  const tones = {
    navy: "bg-slate-900",
    teal: "bg-teal-500",
    green: "bg-emerald-500",
    red: "bg-red-500",
    amber: "bg-amber-400 text-slate-900",
  };
  return (
    <div className="surface flex items-center gap-3 p-3">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg text-white",
          tones[tone],
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xl leading-none font-bold text-slate-900">{value}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function Filter<T extends string>({
  value,
  onChange,
  label,
  disabled = false,
  hint,
  children,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="group relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        disabled={disabled}
        className="h-9 w-full rounded-lg border bg-white px-3 text-xs text-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {children}
      </select>
      {hint && (
        <span
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 z-[800] mt-2 w-max max-w-64 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-[10px] leading-4 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function LayerToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-teal-600"
      />
      {label}
    </label>
  );
}

function PanelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

function coordinateText(
  camera: Pick<OperationsCamera, "latitude" | "longitude">,
) {
  return camera.latitude == null || camera.longitude == null
    ? "Unavailable"
    : `${camera.latitude.toFixed(5)}, ${camera.longitude.toFixed(5)}`;
}

function withIncidentStats(
  camera: OperationsCamera,
  incidents: OperationsIncident[],
): OperationsCamera {
  return {
    ...camera,
    incidentCount: incidents.length,
    pendingIncidentCount: incidents.filter(
      (incident) => incident.reviewStatus === "pending_review",
    ).length,
  };
}

function heatColor(intensity: number): [number, number, number] {
  if (intensity <= 0.25) return [250, 204, 21];
  if (intensity <= 0.5) return [234, 179, 8];
  if (intensity <= 0.75) return [249, 115, 22];
  return [239, 68, 68];
}
