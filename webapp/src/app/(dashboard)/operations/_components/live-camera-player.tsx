"use client";

import { LoaderCircle, Maximize2, RefreshCw, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PlayerState = "connecting" | "reconnecting" | "live" | "error";

interface SessionResponse {
  session: string;
  offerSDP: string;
  iceServers: RTCIceServer[];
}

const MEDIA_TIMEOUT_MS = 15_000;
const MAX_RECONNECTS = 2;

export function LiveCameraPlayer({
  cameraId,
  cameraName,
}: {
  cameraId: string;
  cameraName: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaReceivedRef = useRef(false);
  const [playerState, setPlayerState] = useState<PlayerState>("connecting");
  const [error, setError] = useState("Live stream unavailable");
  const [retryKey, setRetryKey] = useState(0);
  const [transport, setTransport] = useState<"webrtc" | "jpeg">("webrtc");

  useEffect(() => {
    if (transport === "jpeg") return;
    let cancelled = false;
    let peerConnection: RTCPeerConnection | null = null;
    let session: string | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mediaTimer: ReturnType<typeof setTimeout> | null = null;
    let stallTimer: ReturnType<typeof setInterval> | null = null;
    let reconnects = 0;
    let failureInProgress = false;
    const candidates = new Set<string>();
    const endpoint = `/api/cameras/${encodeURIComponent(cameraId)}/live`;

    const clearTimers = () => {
      if (pollTimer) clearTimeout(pollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (mediaTimer) clearTimeout(mediaTimer);
      if (stallTimer) clearInterval(stallTimer);
      pollTimer = null;
      reconnectTimer = null;
      mediaTimer = null;
      stallTimer = null;
    };

    const release = async () => {
      clearTimers();
      const activePeer = peerConnection;
      peerConnection = null;
      if (activePeer) {
        activePeer.ontrack = null;
        activePeer.onicecandidate = null;
        activePeer.onconnectionstatechange = null;
        activePeer.close();
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      if (session) {
        const handle = session;
        session = null;
        await fetch(`${endpoint}?session=${encodeURIComponent(handle)}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => undefined);
      }
      candidates.clear();
    };

    const fail = (message = "Live stream unavailable") => {
      if (cancelled || failureInProgress) return;
      failureInProgress = true;
      if (reconnects < MAX_RECONNECTS) {
        reconnects += 1;
        setPlayerState("reconnecting");
        void release().then(() => {
          if (!cancelled) reconnectTimer = setTimeout(connect, 2_000);
        });
        return;
      }
      setError(message);
      setPlayerState("reconnecting");
      void release().then(() => {
        if (!cancelled) setTransport("jpeg");
      });
    };

    const fallbackForStalledVideo = () => {
      if (cancelled || failureInProgress) return;
      failureInProgress = true;
      setPlayerState("reconnecting");
      void release().then(() => {
        if (!cancelled) setTransport("jpeg");
      });
    };

    const pollCandidates = async () => {
      const activePeer = peerConnection;
      const activeSession = session;
      if (
        cancelled ||
        !activePeer ||
        !activeSession ||
        ["closed", "failed"].includes(activePeer.iceConnectionState)
      ) {
        return;
      }
      try {
        const payload = await requestJson<{ candidates: string[] }>(
          `${endpoint}?session=${encodeURIComponent(activeSession)}`,
        );
        for (const candidate of payload.candidates) {
          if (candidates.has(candidate)) continue;
          candidates.add(candidate);
          const parsed = JSON.parse(candidate) as RTCIceCandidateInit;
          await activePeer.addIceCandidate(parsed);
        }
      } catch {
        if (!cancelled) fail();
        return;
      }
      if (!cancelled && activePeer.iceConnectionState !== "connected") {
        pollTimer = setTimeout(pollCandidates, 250);
      }
    };

    async function connect() {
      if (cancelled) return;
      failureInProgress = false;
      mediaReceivedRef.current = false;
      setPlayerState(reconnects ? "reconnecting" : "connecting");
      try {
        const sessionData = await requestJson<SessionResponse>(endpoint, {
          method: "POST",
        });
        if (cancelled) {
          await fetch(
            `${endpoint}?session=${encodeURIComponent(sessionData.session)}`,
            { method: "DELETE", keepalive: true },
          ).catch(() => undefined);
          return;
        }
        session = sessionData.session;
        const peer = new RTCPeerConnection({
          iceServers: sessionData.iceServers,
        });
        peerConnection = peer;
        peer.ontrack = (event) => {
          const stream = event.streams[0] ?? new MediaStream([event.track]);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => undefined);
            let lastTime = videoRef.current.currentTime;
            let unchangedChecks = 0;
            stallTimer = setInterval(() => {
              const video = videoRef.current;
              if (!video || !mediaReceivedRef.current) return;
              if (video.currentTime > lastTime + 0.01) {
                lastTime = video.currentTime;
                unchangedChecks = 0;
                return;
              }
              unchangedChecks += 1;
              if (unchangedChecks >= 3) fallbackForStalledVideo();
            }, 1_500);
          }
        };
        peer.onicecandidate = (event) => {
          if (!event.candidate || !session || cancelled) return;
          void requestJson(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session,
              candidate: JSON.stringify(event.candidate.toJSON()),
            }),
          }).catch(() => fail());
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === "failed") fail();
          if (peer.connectionState === "disconnected" && !reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              if (peer.connectionState === "disconnected") fail();
            }, 3_000);
          }
        };
        const offer = JSON.parse(
          sessionData.offerSDP,
        ) as RTCSessionDescriptionInit;
        await peer.setRemoteDescription(offer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await requestJson(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session,
            answerSDP: JSON.stringify(peer.localDescription),
          }),
        });
        void pollCandidates();
        mediaTimer = setTimeout(() => {
          if (!mediaReceivedRef.current) fail("No live media was received.");
        }, MEDIA_TIMEOUT_MS);
      } catch (reason) {
        fail(reason instanceof Error ? reason.message : undefined);
      }
    }

    void connect();
    return () => {
      cancelled = true;
      void release();
    };
  }, [cameraId, retryKey, transport]);

  const showLoading =
    transport === "webrtc" &&
    (playerState === "connecting" || playerState === "reconnecting");

  return (
    <div className="relative m-4 aspect-video overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-white">
      {transport === "webrtc" ? (
        <video
          ref={videoRef}
          aria-label={`Live video from ${cameraName}`}
          autoPlay
          muted
          playsInline
          onPlaying={() => {
            mediaReceivedRef.current = true;
            setPlayerState("live");
          }}
          className="size-full object-contain"
        />
      ) : (
        // The authenticated MJPEG endpoint is the supported live-JPEG fallback
        // when the browser's H.264 WebRTC track connects but stops advancing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/cameras/${encodeURIComponent(cameraId)}/live/jpeg?attempt=${retryKey}`}
          alt={`Live video from ${cameraName}`}
          onLoad={() => setPlayerState("live")}
          onError={() => {
            setError("The XProtect live JPEG stream stopped.");
            setPlayerState("error");
          }}
          className="size-full object-contain"
        />
      )}
      {(playerState === "live" ||
        (transport === "jpeg" && playerState !== "error")) && (
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-red-600/95 px-2 py-1 text-[10px] font-bold tracking-wide shadow">
          <span className="size-1.5 rounded-full bg-white" /> LIVE
        </span>
      )}
      {showLoading && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/90 p-5 text-center">
          <div>
            <LoaderCircle className="mx-auto size-7 animate-spin text-teal-400" />
            <p className="mt-2 text-sm font-semibold">
              {playerState === "reconnecting"
                ? "Reconnecting live stream"
                : "Connecting to live stream"}
            </p>
          </div>
        </div>
      )}
      {playerState === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950 p-5 text-center">
          <div>
            <VideoOff className="mx-auto size-7 text-slate-400" />
            <p className="mt-2 text-sm font-semibold">
              Live stream unavailable
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">{error}</p>
            <button
              type="button"
              onClick={() => {
                setPlayerState("connecting");
                setTransport("webrtc");
                setRetryKey((value) => value + 1);
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-800"
            >
              <RefreshCw className="size-3.5" /> Retry
            </button>
          </div>
        </div>
      )}
      {transport === "webrtc" && playerState === "live" && (
        <button
          type="button"
          onClick={() => videoRef.current?.requestFullscreen()}
          className="absolute right-3 bottom-3 grid size-8 place-items-center rounded-lg bg-slate-950/70 hover:bg-slate-950"
          aria-label="View live stream fullscreen"
        >
          <Maximize2 className="size-4" />
        </button>
      )}
    </div>
  );
}

async function requestJson<T = unknown>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Live stream unavailable",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
