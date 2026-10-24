"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { Camera, Play, RefreshCw, Square, SwitchCamera } from "lucide-react";
import { useAction } from "next-safe-action/hooks";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "../../_lib/format";
import { simulationAction } from "../_actions/simulation";
import type { SimulationCase, SimulationData } from "../_lib/types";

type SimulationActionInput =
  | { action: "start" }
  | { action: "stop"; runId: string }
  | { action: "switch_scene"; caseId: string; sceneSourceId: string }
  | { action: "run_scene_check"; caseId: string };

export function SimulationControlCenter({ data }: { data: SimulationData }) {
  const router = useRouter();
  const action = useAction(simulationAction);
  const [selectedCaseId, setSelectedCaseId] = useState(data.cases[0]?.id ?? "");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selectedCase =
    data.cases.find((item) => item.id === selectedCaseId) ?? null;
  const sceneCheckActive = isSceneCheckActive(
    selectedCase?.check ?? null,
    data.referenceTime,
  );
  const runActive =
    data.run &&
    ["queued", "starting", "running", "stopping"].includes(data.run.status);
  const activeMonitors = data.cameras.filter((camera) =>
    ["connecting", "monitoring", "activity_detected", "analyzing"].includes(
      camera.monitorStatus,
    ),
  ).length;

  const effectiveSourceId = selectedCase?.sceneSources.some(
    (source) => source.id === selectedSourceId,
  )
    ? selectedSourceId
    : (selectedCase?.sceneSources[0]?.id ?? "");

  useEffect(() => {
    if (
      !runActive &&
      !sceneCheckActive &&
      selectedCase?.sceneState.status !== "switching"
    )
      return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [router, runActive, sceneCheckActive, selectedCase?.sceneState.status]);

  async function execute(input: SimulationActionInput) {
    setError(null);
    const result = await action.executeAsync(input);
    if (result?.data?.success) router.refresh();
    else
      setError(
        result?.data?.error ??
          result?.serverError ??
          "The command could not be submitted.",
      );
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-5">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          Demo Lab
        </h1>
      </header>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-900">
              Monitoring Session
            </h2>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={
                action.isPending ||
                Boolean(runActive) ||
                !data.workerConnected ||
                !data.cameras.length
              }
              onClick={() => execute({ action: "start" })}
            >
              <Play /> Start Session
            </Button>
            <Button
              variant="outline"
              disabled={
                action.isPending ||
                !runActive ||
                data.run?.status === "stopping"
              }
              onClick={() =>
                data.run && execute({ action: "stop", runId: data.run.id })
              }
            >
              <Square /> Stop Session
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Worker"
              value={data.workerConnected ? "Connected" : "Disconnected"}
              detail={
                data.workerLastSeenAt
                  ? formatDateTime(data.workerLastSeenAt)
                  : "No heartbeat"
              }
              tone={data.workerConnected ? "success" : "danger"}
            />
            <Metric
              label="Monitoring session"
              value={label(data.run?.status ?? "idle")}
              detail={data.run?.errorMessage ?? undefined}
            />
            <Metric
              label="Configured cameras"
              value={String(data.cameras.length)}
            />
            <Metric label="Active cameras" value={String(activeMonitors)} />
            <Metric
              label="Run incidents"
              value={String(data.run?.incidents ?? 0)}
            />
          </div>
          {!data.cameras.length ? (
            <Empty>No enabled cameras are configured in Supabase.</Empty>
          ) : (
            <div className="max-h-96 overflow-auto rounded-xl border">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="p-3">Camera</th>
                    <th className="p-3">Location</th>
                    <th className="p-3">Run status</th>
                    <th className="p-3">Pipeline stage</th>
                    <th className="p-3">Last worker activity</th>
                    <th className="p-3">Incidents</th>
                    <th className="p-3">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.cameras.map((camera) => (
                    <Fragment key={camera.id}>
                      <tr>
                        <td className="p-3 font-semibold text-slate-800">
                          {camera.name}
                        </td>
                        <td className="p-3 text-slate-600">
                          {camera.latitude === null
                            ? "Not configured"
                            : `${camera.latitude.toFixed(5)}, ${camera.longitude?.toFixed(5)}`}
                        </td>
                        <td className="p-3">
                          <Status value={camera.monitorStatus} />
                        </td>
                        <td className="p-3">
                          <Status value={camera.pipelineStage} />
                        </td>
                        <td className="p-3 text-slate-600">
                          {camera.lastWorkerActivityAt
                            ? formatDateTime(camera.lastWorkerActivityAt)
                            : "—"}
                        </td>
                        <td className="p-3">{camera.incidentCount}</td>
                        <td className="max-w-xs p-3 text-red-700">
                          <span
                            className="line-clamp-3 break-all"
                            title={camera.errorMessage ?? undefined}
                          >
                            {camera.errorMessage ?? "—"}
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-slate-50/60">
                        <td className="px-3 py-2" colSpan={7}>
                          <details>
                            <summary className="cursor-pointer text-xs font-semibold text-teal-700">
                              Pipeline diagnostics
                            </summary>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                              {DIAGNOSTIC_LABELS.map(([key, counterLabel]) => (
                                <Diagnostic
                                  key={key}
                                  label={counterLabel}
                                  value={
                                    key === "incidents_inserted"
                                      ? camera.incidentCount
                                      : (camera.diagnostics[key] ?? 0)
                                  }
                                />
                              ))}
                            </div>
                            <dl className="mt-3 grid gap-x-5 gap-y-1 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                              <Identifier
                                label="Segment"
                                value={camera.lastSegmentId}
                              />
                              <Identifier
                                label="Detection"
                                value={camera.lastDetectionId}
                              />
                              <Identifier
                                label="Analysis"
                                value={camera.lastAnalysisId}
                              />
                              <Identifier
                                label="Hafnia summary"
                                value={camera.lastHafniaSummaryId}
                              />
                              <Identifier
                                label="Classification"
                                value={camera.lastClassification}
                              />
                              <Identifier
                                label="Stage updated"
                                value={
                                  camera.pipelineStageAt
                                    ? formatDateTime(camera.pipelineStageAt)
                                    : null
                                }
                              />
                            </dl>
                          </details>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-900">
              AI Scene Check
            </h2>
          </div>
          {selectedCase && (
            <Link
              className="text-sm font-semibold text-teal-700 hover:underline"
              href={`/cleanup?case=${selectedCase.id}`}
            >
              Open in Cleanup
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {!data.cases.length ? (
            <Empty>
              No cleanup case has linked post-dumping evidence and a camera.
            </Empty>
          ) : (
            <div className="space-y-5">
              <label className="block max-w-2xl text-sm font-semibold text-slate-700">
                Cleanup case
                <select
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal"
                  value={selectedCaseId}
                  onChange={(event) => setSelectedCaseId(event.target.value)}
                >
                  {data.cases.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.cameraName} · {item.id.slice(0, 8)} ·{" "}
                      {label(item.status)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedCase && (
                <SceneCasePanel
                  cleanupCase={selectedCase}
                  selectedSourceId={effectiveSourceId}
                  setSelectedSourceId={setSelectedSourceId}
                  pending={action.isPending}
                  referenceTime={data.referenceTime}
                  execute={execute}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const DIAGNOSTIC_LABELS = [
  ["frames_received", "Frames received"],
  ["valid_frames_decoded", "Valid frames"],
  ["changed_frames", "Changed frames"],
  ["repeated_frames", "Repeated frames"],
  ["frame_acquisition_errors", "Acquisition errors"],
  ["motion_positive_frames", "Motion-positive"],
  ["yolo_inference_calls", "YOLO calls"],
  ["yolo_detections", "YOLO detections"],
  ["activity_segments_exported", "Activity segments"],
  ["hafnia_requests_sent", "Hafnia requests"],
  ["hafnia_responses_received", "Hafnia responses"],
  ["positive_dumping_classifications", "Positive classifications"],
  ["incidents_inserted", "Incidents inserted"],
  ["incidents_suppressed_by_deduplication", "Deduplicated segments"],
  ["database_or_validation_errors", "Database / validation errors"],
] as const;

function Diagnostic({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="font-heading text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Identifier({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="truncate font-mono" title={value ?? undefined}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

function SceneCasePanel({
  cleanupCase,
  selectedSourceId,
  setSelectedSourceId,
  pending,
  referenceTime,
  execute,
}: {
  cleanupCase: SimulationCase;
  selectedSourceId: string;
  setSelectedSourceId: (value: string) => void;
  pending: boolean;
  referenceTime: string;
  execute: (input: SimulationActionInput) => Promise<void>;
}) {
  const checkBusy = isSceneCheckActive(cleanupCase.check, referenceTime);
  const sceneSwitching = cleanupCase.sceneState.status === "switching";
  const presentation = sceneCheckPresentation(cleanupCase.check, referenceTime);
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-slate-50 px-4 py-3">
        <div>
          <h3 className="font-heading text-base font-bold text-slate-900">
            {cleanupCase.cameraName} · Cleanup case {cleanupCase.id.slice(0, 8)}
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {label(cleanupCase.status)} ·{" "}
            {cleanupCase.assignedTeamName ?? "No team assigned"} ·{" "}
            {cleanupCase.dueAt
              ? `Due ${formatDateTime(cleanupCase.dueAt)}`
              : "No deadline"}
          </p>
          <p className="mt-1 text-xs font-semibold text-teal-700">
            Scene Check:{" "}
            {cleanupCase.check
              ? label(cleanupCase.check.status)
              : "Not scheduled"}
          </p>
        </div>
        <Link
          href="/cleanup"
          className="inline-flex h-8 items-center rounded-md border bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open in Cleanup
        </Link>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Camera Scene</h3>
            <Status value={cleanupCase.sceneState.status} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Current scene:{" "}
            <strong>{cleanupCase.sceneState.sourceName ?? "Unknown"}</strong>
          </p>
          <select
            className="mt-3 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            value={selectedSourceId}
            onChange={(event) => setSelectedSourceId(event.target.value)}
            disabled={!cleanupCase.sceneSources.length || sceneSwitching}
          >
            {!cleanupCase.sceneSources.length && (
              <option value="">No configured scenes</option>
            )}
            {cleanupCase.sceneSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <Button
            className="mt-3"
            variant="outline"
            disabled={pending || sceneSwitching || !selectedSourceId}
            onClick={() =>
              execute({
                action: "switch_scene",
                caseId: cleanupCase.id,
                sceneSourceId: selectedSourceId,
              })
            }
          >
            <SwitchCamera /> Switch Scene
          </Button>
          {!cleanupCase.sceneSources.length && (
            <p className="mt-2 text-xs text-amber-700">
              No active scene sources are configured for this camera.
            </p>
          )}
          {cleanupCase.sceneState.errorMessage && (
            <p className="mt-2 text-xs text-red-700">
              {cleanupCase.sceneState.errorMessage}
            </p>
          )}
        </section>

        <section className="rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Scene Check</h3>
            {cleanupCase.check && <Status value={cleanupCase.check.phase} />}
          </div>
          {cleanupCase.check?.status === "completed" &&
          cleanupCase.check.assessment ? (
            <div className="mt-3">
              <p className="font-heading text-xl font-bold text-slate-900">
                {presentation.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {presentation.summary}
              </p>
              {cleanupCase.check.cleanupScore !== null && (
                <p className="mt-1 text-xs text-slate-500">
                  AI cleanup score: {Math.round(cleanupCase.check.cleanupScore)}
                  /100
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">
                {presentation.title}
              </p>
              {cleanupCase.check && !checkBusy && (
                <p className="mt-1">
                  Scheduled for {formatDateTime(cleanupCase.check.scheduledFor)}
                  . Run the existing check early when the selected scene is
                  ready.
                </p>
              )}
            </div>
          )}
          <Button
            className="mt-3"
            disabled={
              pending ||
              checkBusy ||
              !cleanupCase.check ||
              cleanupCase.status === "resolved" ||
              sceneSwitching ||
              (cleanupCase.sceneSources.length > 0 &&
                cleanupCase.sceneState.status !== "ready")
            }
            onClick={() =>
              execute({ action: "run_scene_check", caseId: cleanupCase.id })
            }
          >
            <RefreshCw /> Run Scene Check Now
          </Button>
          {!cleanupCase.check && (
            <p className="mt-2 text-xs text-amber-700">
              Assign a cleanup deadline first to create the scheduled check.
            </p>
          )}
          {cleanupCase.check &&
            cleanupCase.sceneSources.length > 0 &&
            cleanupCase.sceneState.status !== "ready" && (
              <p className="mt-2 text-xs text-amber-700">
                Switch and verify a camera scene before running the check.
              </p>
            )}
          {cleanupCase.check?.errorMessage && (
            <p className="mt-2 text-xs text-red-700">
              {cleanupCase.check.errorMessage}
            </p>
          )}
        </section>
      </div>
      {(cleanupCase.originalEvidenceUrl || cleanupCase.check?.snapshotUrl) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Evidence
            label="Original evidence"
            url={cleanupCase.originalEvidenceUrl}
            timestamp={cleanupCase.originalEvidenceCapturedAt}
            detail={cleanupCase.check?.reportedLocation ?? undefined}
            region={cleanupCase.originalEvidenceRegion}
          />
          <Evidence
            label="Latest scene"
            url={cleanupCase.check?.snapshotUrl ?? null}
            timestamp={
              cleanupCase.check?.sourceTimestamp ??
              cleanupCase.check?.capturedAt ??
              null
            }
            detail={
              cleanupCase.check?.assessment ? presentation.title : undefined
            }
            region={cleanupCase.originalEvidenceRegion}
            placeholder={
              checkBusy ? "Waiting for fresh camera frame" : "Not available"
            }
          />
        </div>
      )}
      {cleanupCase.check?.status === "completed" && (
        <WhatChanged check={cleanupCase.check} presentation={presentation} />
      )}
      {cleanupCase.check && <TechnicalDetails cleanupCase={cleanupCase} />}
    </div>
  );
}

function Metric({
  label: metricLabel,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {metricLabel}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <p className="font-heading text-lg font-bold text-slate-900">{value}</p>
        {tone && (
          <Badge tone={tone}>{tone === "success" ? "Live" : "Offline"}</Badge>
        )}
      </div>
      {detail && (
        <p className="mt-1 truncate text-xs text-slate-500" title={detail}>
          {detail}
        </p>
      )}
    </div>
  );
}

function WhatChanged({
  check,
  presentation,
}: {
  check: NonNullable<SimulationCase["check"]>;
  presentation: { title: string; summary: string };
}) {
  const items = [
    check.reportedWaste
      ? {
          label: "Reported waste",
          value: [
            check.reportedWaste,
            check.reportedLocation ? `— ${check.reportedLocation}` : "",
          ]
            .filter(Boolean)
            .join(" "),
        }
      : null,
    check.currentObservation
      ? { label: "Latest observation", value: check.currentObservation }
      : check.observations[0]
        ? { label: "Latest observation", value: check.observations[0] }
        : null,
    { label: "Conclusion", value: check.summary ?? presentation.summary },
  ].filter((item): item is { label: string; value: string } => item !== null);
  return (
    <section className="rounded-xl border p-4 text-sm">
      <h3 className="font-semibold text-slate-900">What changed?</h3>
      <dl className="mt-2 space-y-2">
        {items.slice(0, 3).map((item) => (
          <div
            key={item.label}
            className="grid gap-0.5 sm:grid-cols-[145px_1fr]"
          >
            <dt className="font-semibold text-slate-700">{item.label}</dt>
            <dd className="text-slate-600">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TechnicalDetails({ cleanupCase }: { cleanupCase: SimulationCase }) {
  const check = cleanupCase.check;
  if (!check) return null;
  return (
    <details className="rounded-xl border px-4 py-3 text-xs">
      <summary className="cursor-pointer font-semibold text-teal-700">
        Technical Details
      </summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Identifier label="Scene Check ID" value={check.id} />
        <Identifier
          label="XProtect camera GUID"
          value={
            check.captureCameraId ??
            cleanupCase.sceneState.captureCameraId ??
            cleanupCase.cameraId
          }
        />
        <Identifier label="Follow-up source" value={check.followUpSource} />
        <Identifier
          label="Source verification"
          value={
            cleanupCase.sceneState.verifiedAt
              ? formatDateTime(cleanupCase.sceneState.verifiedAt)
              : null
          }
        />
        <Identifier
          label="Hafnia model"
          value={
            [check.modelId, check.modelVersion].filter(Boolean).join(" ") ||
            null
          }
        />
        <Identifier label="Hafnia summary" value={check.hafniaSummaryId} />
        <Identifier label="Captured" value={check.capturedAt} />
        <Identifier label="Source timestamp" value={check.sourceTimestamp} />
        <Identifier label="Analyzed" value={check.analyzedAt} />
        <Identifier
          label="Camera reference matched"
          value={
            check.cameraReferenceMatched === null
              ? null
              : check.cameraReferenceMatched
                ? "Yes"
                : "No"
          }
        />
        <Identifier
          label="AI cleanup score"
          value={
            check.cleanupScore === null
              ? null
              : `${Math.round(check.cleanupScore)}/100`
          }
        />
      </dl>
      {!!check.gatewayInputLimitations.length && (
        <div className="mt-3 text-slate-600">
          <p className="font-semibold">Gateway input limitations</p>
          <ul className="mt-1 list-disc pl-4">
            {check.gatewayInputLimitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {check.errorMessage && (
        <p className="mt-3 text-red-700">{check.errorMessage}</p>
      )}
      {check.rawResponse && (
        <div className="mt-3">
          <p className="font-semibold text-slate-700">
            Raw structured AI response
          </p>
          <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">
            {JSON.stringify(check.rawResponse, null, 2)}
          </pre>
        </div>
      )}
    </details>
  );
}

function Status({ value }: { value: string }) {
  const tone = [
    "running",
    "monitoring",
    "ready",
    "completed",
    "frames_valid",
    "hafnia_analysis_completed",
    "incident_created",
  ].includes(value)
    ? "success"
    : [
          "error",
          "failed",
          "cancelled",
          "configuration_error",
          "pipeline_error",
          "hafnia_budget_exhausted",
        ].includes(value)
      ? "danger"
      : [
            "connecting",
            "analyzing",
            "task_active",
            "acquiring_frames",
            "frame_acquisition_retry",
            "video_analytics_processing",
            "activity_segment_exported",
            "hafnia_analysis_in_progress",
            "switching",
            "capturing",
            "preparing_comparison",
            "applying_decision",
          ].includes(value)
        ? "info"
        : "neutral";
  return <Badge tone={tone}>{label(value)}</Badge>;
}

function Evidence({
  label: evidenceLabel,
  url,
  timestamp,
  detail,
  region,
  placeholder = "Not available",
}: {
  label: string;
  url: string | null;
  timestamp?: string | null;
  detail?: string;
  region?: Record<string, unknown> | null;
  placeholder?: string;
}) {
  const box = normalizedRegion(region);
  const image = url ? (
    <>
      <Image
        src={url}
        alt={evidenceLabel}
        fill
        unoptimized
        className="object-cover"
      />
      {box && (
        <span
          aria-label="Reported waste region"
          className="pointer-events-none absolute border-2 border-amber-400 bg-amber-300/15"
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
          }}
        />
      )}
    </>
  ) : (
    <span className="grid h-full place-items-center text-sm text-slate-400">
      {placeholder}
    </span>
  );
  return (
    <figure>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-100">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0"
            title="Open full-size evidence"
          >
            {image}
          </a>
        ) : (
          image
        )}
      </div>
      <figcaption className="mt-1 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">{evidenceLabel}</span>
        {timestamp && <> · {formatDateTime(timestamp)}</>}
        {detail && <span className="block">{detail}</span>}
      </figcaption>
    </figure>
  );
}

function normalizedRegion(region: Record<string, unknown> | null | undefined) {
  if (!region) return null;
  const values = ["x", "y", "width", "height"].map((key) => region[key]);
  if (
    values.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1,
    )
  )
    return null;
  const [x, y, width, height] = values as number[];
  if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
  return {
    x: x * 100,
    y: y * 100,
    width: width * 100,
    height: height * 100,
  };
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">
      <div>
        <Camera className="mx-auto mb-2 size-6" />
        <p>{children}</p>
      </div>
    </div>
  );
}

function label(value: string) {
  if (value === "monitoring") return "Running";
  if (value === "preparing_comparison") return "Analyzing";
  if (value === "applying_decision") return "Applying Result";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isSceneCheckActive(
  check: SimulationCase["check"],
  referenceTime: string,
) {
  if (!check) return false;
  if (check.status === "running") return true;
  return (
    check.status === "scheduled" &&
    Date.parse(check.scheduledFor) <= Date.parse(referenceTime)
  );
}

function sceneCheckAssessment(
  check: SimulationCase["check"],
  referenceTime: string,
) {
  if (!check) return "Not scheduled";
  if (check.assessment) return label(check.assessment);
  if (check.status === "running") return "Analysis in progress";
  if (isSceneCheckActive(check, referenceTime)) return "Waiting for worker";
  if (check.status === "failed") return "Check failed";
  return "Pending scheduled check";
}

function sceneCheckPresentation(
  check: SimulationCase["check"],
  referenceTime: string,
) {
  if (!check)
    return {
      title: "Not scheduled",
      summary: "Assign a cleanup deadline to schedule a scene check.",
    };
  const title =
    check.assessment === "appears_cleared"
      ? "Appears cleared"
      : check.assessment === "still_visible"
        ? "Waste still visible"
        : check.assessment === "uncertain"
          ? "Unable to determine"
          : sceneCheckAssessment(check, referenceTime);
  const fallback =
    check.assessment === "appears_cleared"
      ? "The reported waste appears absent from the observable area."
      : check.assessment === "still_visible"
        ? "The reported waste remains visible in the inspected area."
        : check.assessment === "uncertain"
          ? "The supplied footage did not support a reliable cleanup decision."
          : "The scene check has not produced an assessment yet.";
  return {
    title,
    summary:
      check.summary ??
      check.comparisonReasoning[0] ??
      check.observations[0] ??
      fallback,
  };
}
