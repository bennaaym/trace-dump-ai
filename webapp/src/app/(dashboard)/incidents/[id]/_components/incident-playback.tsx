"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  Clock3,
  Film,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";

import type { IncidentDetail, PlaybackStatus } from "../../../_lib/types";
import { preparePlaybackAction } from "../_actions/playback";
import { clampSeekOffset, validEventOffset } from "../_lib/playback-state";

export function IncidentPlayback({
  incident,
  initialSeek,
}: {
  incident: IncidentDetail;
  initialSeek: string | null;
}) {
  const [status, setStatus] = useState<PlaybackStatus>(
    incident.playback.status,
  );
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pollCount = useRef(0);
  const initialJumpDone = useRef(false);
  const prepare = useAction(preparePlaybackAction);
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
      };
      const nextStatus = payload.status ?? "unavailable";
      setStatus(nextStatus);
      setPlaybackUrl(nextStatus === "available" ? (payload.url ?? null) : null);
      return nextStatus;
    } catch {
      setAccessError("Playback access could not be refreshed.");
      return "failed" as const;
    }
  }, [incident.id]);

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
    if (
      initialSeek === "event" &&
      playbackUrl &&
      !initialJumpDone.current &&
      eventOffset != null
    ) {
      initialJumpDone.current = true;
      jumpTo(eventOffset);
    }
  }, [initialSeek, playbackUrl, eventOffset, jumpTo]);

  function jumpToEvent() {
    if (eventOffset == null) return;
    jumpTo(eventOffset);
  }

  async function requestPreparation() {
    setAccessError(null);
    const result = await prepare.executeAsync({ incidentId: incident.id });
    if (result?.data?.success) {
      setStatus(result.data.status === "available" ? "available" : "preparing");
      setPollTimedOut(false);
      pollCount.current = 0;
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
              ref={videoRef}
              src={playbackUrl}
              controls
              preload="metadata"
              playsInline
              onLoadStart={() => setBuffering(true)}
              onCanPlay={() => setBuffering(false)}
              onPlaying={() => setBuffering(false)}
              onWaiting={() => setBuffering(true)}
              onError={() => {
                setPlaybackUrl(null);
                setStatus("expired");
              }}
              className="size-full bg-black object-contain"
              aria-label="Original XProtect incident recording"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-center text-white">
              <div>
                <Film className="mx-auto size-9 text-slate-500" />
                <p className="mt-2 text-xs">Preparing incident recording</p>
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
              ? "No reliable event position"
              : "Jump to suspected event"}
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
                ? "Playback preparation failed"
                : timedOut
                  ? "Preparation is taking longer than expected"
                  : "Recording playback is not prepared"}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-300">
          {preparing
            ? "The recording is being exported and converted in the background."
            : "Automatic recording preparation did not complete. You can retry without blocking this page."}
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
              : status === "expired"
                ? "Refresh playback"
                : "Retry playback"}
          </button>
        )}
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
