"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  Clock3,
  Film,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";

import { cn } from "@/lib/utils";
import type { IncidentDetail, PlaybackStatus } from "../../../_lib/types";
import { preparePlaybackAction } from "../_actions/playback";
import {
  clampSeekOffset,
  timelinePosition,
  validEventOffset,
} from "../_lib/playback-state";
import { recordingEvidence } from "../_lib/plate-evidence";
import { preferredEvidence } from "./evidence-viewer-state";

type Evidence = IncidentDetail["evidence"][number];

export function IncidentPlayback({
  incident,
  initialSeek,
}: {
  incident: IncidentDetail;
  initialSeek: string | null;
}) {
  const evidence = recordingEvidence(incident.evidence);
  const preferred = preferredEvidence(evidence);
  const [selectedId, setSelectedId] = useState(preferred?.id ?? null);
  const [status, setStatus] = useState<PlaybackStatus>(
    incident.playback.status,
  );
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [accessGeneration, setAccessGeneration] = useState(0);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pollCount = useRef(0);
  const resume = useRef<{ offset: number; playing: boolean } | null>(null);
  const recoveryAttempted = useRef(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const initialJumpDone = useRef(false);
  const prepare = useAction(preparePlaybackAction);
  const selected = evidence.find((item) => item.id === selectedId) ?? preferred;
  const recordingDuration = Math.max(
    0,
    (Date.parse(incident.detection.recordingEndAt) -
      Date.parse(incident.detection.recordingStartAt)) /
      1000,
  );
  const eventOffset = validEventOffset(
    incident.analysis.eventOffsetSeconds,
    recordingDuration,
  );

  const requestedOffset =
    initialSeek === "event"
      ? eventOffset
      : initialSeek != null && /^\d+(?:\.\d+)?$/.test(initialSeek)
        ? validEventOffset(Number(initialSeek), recordingDuration)
        : null;

  const refreshAccess = useCallback(async () => {
    setAccessError(null);
    try {
      const response = await fetch(
        "/api/incidents/" + incident.id + "/playback",
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        status?: PlaybackStatus;
        url?: string;
        expiresInSeconds?: number;
      };
      if (!response.ok && response.status !== 410) {
        throw new Error("Playback access request failed");
      }
      const nextStatus = payload.status ?? "unavailable";
      if (nextStatus === "available" && !payload.url) {
        throw new Error("Playback URL missing");
      }
      const video = videoRef.current;
      if (video)
        resume.current = { offset: video.currentTime, playing: !video.paused };
      setExpiresAt(
        nextStatus === "available"
          ? Date.now() + (payload.expiresInSeconds ?? 300) * 1000
          : null,
      );
      if (nextStatus === "available") setAccessGeneration((value) => value + 1);
      setStatus(nextStatus);
      setPlaybackUrl(nextStatus === "available" ? (payload.url ?? null) : null);
      return nextStatus;
    } catch {
      setStatus("failed");
      setPlaybackUrl(null);
      setExpiresAt(null);
      setAccessError(
        "Playback access could not be refreshed. Check your connection and try again.",
      );
      return "access_error" as const;
    }
  }, [
    incident.id,
    setAccessError,
    setExpiresAt,
    setStatus,
    setPlaybackUrl,
    setAccessGeneration,
  ]);

  const jumpTo = useCallback(
    (offset: number) => {
      const video = videoRef.current;
      if (video) {
        const maximum = Number.isFinite(video.duration)
          ? video.duration
          : recordingDuration;
        video.currentTime = clampSeekOffset(offset, maximum);
      }
    },
    [recordingDuration],
  );

  useEffect(() => {
    if (status !== "available" || playbackUrl) return;
    const timer = window.setTimeout(() => void refreshAccess(), 0);
    return () => window.clearTimeout(timer);
  }, [status, playbackUrl, refreshAccess]);

  useEffect(() => {
    if (status !== "preparing" || pollTimedOut) return;
    const timer = window.setInterval(async () => {
      pollCount.current += 1;
      const next = await refreshAccess();
      if (next !== "preparing") window.clearInterval(timer);
      if (pollCount.current >= 24) {
        window.clearInterval(timer);
        setPollTimedOut(true);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [status, pollTimedOut, refreshAccess]);

  useEffect(() => {
    if (!playbackUrl || expiresAt == null) return;
    const timer = window.setTimeout(
      () => void refreshAccess(),
      Math.max(1000, expiresAt - Date.now() - 30000),
    );
    return () => window.clearTimeout(timer);
  }, [playbackUrl, expiresAt, refreshAccess]);

  function restorePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (resume.current) {
      video.currentTime = clampSeekOffset(
        resume.current.offset,
        video.duration,
      );
      if (resume.current.playing)
        void video.play().catch(() => setBuffering(false));
      resume.current = null;
    } else if (
      initialSeek != null &&
      !initialJumpDone.current &&
      requestedOffset != null
    ) {
      initialJumpDone.current = true;
      jumpTo(requestedOffset);
    }
  }

  function handleVideoError() {
    setBuffering(false);
    const code = videoRef.current?.error?.code;
    if ((code === 2 || code === 4) && !recoveryAttempted.current) {
      recoveryAttempted.current = true;
      void refreshAccess();
      return;
    }
    setPlaybackUrl(null);
    setExpiresAt(null);
    setStatus("failed");
    setAccessError(
      code === 3 || code === 4
        ? "This browser could not decode the recording. Retry playback or report the recording for investigation."
        : "The recording could not be loaded. Check your connection and retry playback.",
    );
  }

  function selectFrame(item: Evidence) {
    setSelectedId(item.id);
    if (item.offsetSeconds != null) jumpTo(item.offsetSeconds);
  }

  function jumpToEvent() {
    if (eventOffset == null) return;
    const event = evidence.find((item) => item.role === "event") ?? preferred;
    if (event) setSelectedId(event.id);
    jumpTo(eventOffset);
  }

  async function requestPreparation() {
    setAccessError(null);
    recoveryAttempted.current = false;
    const current = await refreshAccess();
    if (current === "available") return;
    if (current === "access_error") return;
    const result = await prepare.executeAsync({ incidentId: incident.id });
    if (result?.data?.success) {
      setStatus(result.data.status === "available" ? "available" : "preparing");
      setPollTimedOut(false);
      pollCount.current = 0;
      if (result.data.status === "available") await refreshAccess();
      return;
    }
    setAccessError(
      result?.data?.error ?? "Playback preparation could not be requested.",
    );
  }

  return (
    <section aria-label="XProtect incident recording" className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-slate-950 shadow-sm">
        <div className="relative aspect-video">
          {playbackUrl ? (
            <video
              key={accessGeneration}
              ref={videoRef}
              src={playbackUrl}
              poster={selected?.signedUrl ?? undefined}
              controls
              preload="metadata"
              playsInline
              onLoadStart={() => setBuffering(true)}
              onCanPlay={() => setBuffering(false)}
              onPlaying={() => setBuffering(false)}
              onWaiting={() => setBuffering(true)}
              onLoadedMetadata={restorePlayback}
              onError={handleVideoError}
              className="size-full bg-black object-contain"
              aria-label="Original XProtect incident recording"
            />
          ) : selected?.signedUrl ? (
            <Image
              src={selected.signedUrl}
              alt="Selected incident evidence preview"
              fill
              priority
              unoptimized
              sizes="(min-width: 1280px) 55vw, 100vw"
              className="object-contain"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-center text-white">
              <div>
                <Film className="mx-auto size-9 text-slate-500" />
                <p className="mt-2 text-xs">Recording preview unavailable</p>
              </div>
            </div>
          )}
          {playbackUrl && buffering && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/75 px-2.5 py-1.5 text-[11px] font-semibold text-white">
              <LoaderCircle className="size-3.5 animate-spin" />
              Buffering
            </span>
          )}
          {!playbackUrl && (
            <PlaybackOverlay
              status={status}
              pending={prepare.isPending}
              timedOut={pollTimedOut}
              onRequest={requestPreparation}
            />
          )}
        </div>
        <div className="flex flex-col justify-between gap-3 border-t border-white/10 bg-slate-900 px-4 py-3 text-white sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold">Original XProtect recording</p>
            <p className="mt-1 text-[10px] text-slate-400">
              {formatOffset(recordingDuration)} total · playback does not
              confirm wrongdoing
            </p>
          </div>
          <button
            type="button"
            disabled={eventOffset == null}
            onClick={jumpToEvent}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            <Clock3 className="size-3.5" />
            {eventOffset == null
              ? "Event time unknown"
              : `Jump to suspected event at approximately ${formatOffset(eventOffset)}`}
          </button>
        </div>
      </div>

      {accessError && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-xs text-red-700"
        >
          {accessError}
        </p>
      )}

      <EvidenceTimeline
        evidence={evidence}
        selected={selected}
        duration={recordingDuration}
        onSelect={selectFrame}
      />

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            <strong className="text-slate-700 capitalize">
              {selected.role}
            </strong>{" "}
            frame at {formatOffset(selected.offsetSeconds)}
            {selected.capturedAt ? " · " + formatUtc(selected.capturedAt) : ""}
          </p>
          {selected.signedUrl && (
            <a
              href={selected.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900"
            >
              <ScanSearch className="size-3.5" />
              Open full-resolution frame
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function PlaybackOverlay({
  status,
  pending,
  timedOut,
  onRequest,
}: {
  status: PlaybackStatus;
  pending: boolean;
  timedOut: boolean;
  onRequest: () => void;
}) {
  const preparing = status === "preparing" && !timedOut;
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-950/65 p-6 text-center text-white backdrop-blur-[1px]">
      <div className="max-w-sm">
        {preparing ? (
          <LoaderCircle className="mx-auto size-7 animate-spin text-teal-400" />
        ) : (
          <CircleAlert className="mx-auto size-7 text-slate-300" />
        )}
        <p className="mt-3 text-sm font-bold">
          {preparing
            ? "Preparing secure playback"
            : status === "expired"
              ? "Playback access expired"
              : status === "failed"
                ? "Playback could not be loaded"
                : timedOut
                  ? "Preparation is taking longer than expected"
                  : "Recording playback is not prepared"}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-300">
          {preparing
            ? "The original recording remains in XProtect. Keyframes and review tools remain available."
            : "The incident evidence remains available while playback is refreshed or prepared."}
        </p>
        {!preparing && (
          <button
            type="button"
            disabled={pending}
            onClick={onRequest}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" />
            {pending
              ? "Requesting…"
              : status === "expired" || timedOut
                ? "Refresh playback"
                : status === "failed"
                  ? "Retry playback"
                  : "Prepare recording"}
          </button>
        )}
      </div>
    </div>
  );
}

function EvidenceTimeline({
  evidence,
  selected,
  duration,
  onSelect,
}: {
  evidence: Evidence[];
  selected: Evidence | undefined;
  duration: number;
  onSelect: (item: Evidence) => void;
}) {
  if (!evidence.length) {
    return (
      <p className="rounded-lg border border-dashed bg-slate-50 p-4 text-xs text-slate-500">
        No keyframes are available for this recording.
      </p>
    );
  }
  return (
    <div>
      <div className="relative mx-2 h-8" aria-hidden="true">
        <span className="absolute top-3 right-0 left-0 h-1 rounded-full bg-slate-200" />
        {evidence.map((item) => (
          <span
            key={item.id}
            className={cn(
              "absolute top-1.5 size-4 -translate-x-1/2 rounded-full border-2 border-white shadow",
              item.id === selected?.id ? "bg-teal-500" : "bg-slate-400",
            )}
            style={{
              left: timelinePosition(item.offsetSeconds, duration) + "%",
            }}
          />
        ))}
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        aria-label="Recording evidence timeline"
      >
        {evidence.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === selected?.id}
            onClick={() => onSelect(item)}
            className={cn(
              "w-36 shrink-0 overflow-hidden rounded-lg border-2 bg-white text-left outline-none sm:w-44",
              item.id === selected?.id
                ? "border-teal-500 ring-2 ring-teal-500/20"
                : "border-slate-200 hover:border-slate-400 focus-visible:border-teal-500",
            )}
          >
            <span className="relative block aspect-video bg-slate-900">
              {item.signedUrl ? (
                <Image
                  src={item.signedUrl}
                  alt=""
                  fill
                  unoptimized
                  sizes="176px"
                  className="object-contain"
                />
              ) : (
                <span className="absolute inset-0 grid place-items-center text-[10px] text-slate-400">
                  Image unavailable
                </span>
              )}
            </span>
            <span className="block px-2.5 py-2">
              <span className="block text-xs font-bold text-slate-800 capitalize">
                {item.role}
              </span>
              <span className="mt-0.5 block text-[10px] text-slate-500">
                {formatOffset(item.offsetSeconds)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatOffset(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "time unavailable";
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return (
    "+" +
    minutes.toString().padStart(2, "0") +
    ":" +
    seconds.toFixed(seconds % 1 === 0 ? 0 : 1).padStart(2, "0")
  );
}

function formatUtc(value: string) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
