import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type RealtimeConnectionState = "disconnected" | "connecting" | "connected" | "error";

type RealtimeClientSecret = {
  value: string;
  model: string;
  voice: string;
};

type UseRealtimeSessionOptions = {
  inputDeviceId: string;
  outputDeviceId: string;
};

type UseRealtimeSessionResult = {
  connectionState: RealtimeConnectionState;
  remoteAudioLevel: number;
  lastError: string;
  lastEventType: string;
  startSession: () => Promise<void>;
  stopSession: () => void;
};

export function useRealtimeSession({ inputDeviceId, outputDeviceId }: UseRealtimeSessionOptions): UseRealtimeSessionResult {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("disconnected");
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);
  const [lastError, setLastError] = useState("");
  const [lastEventType, setLastEventType] = useState("");

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const analyserContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserFrameRef = useRef<number | null>(null);

  function cleanupRemoteAnalyser() {
    if (analyserFrameRef.current !== null) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }

    analyserRef.current = null;

    if (analyserContextRef.current) {
      void analyserContextRef.current.close();
      analyserContextRef.current = null;
    }

    setRemoteAudioLevel(0);
  }

  function stopSession() {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerConnectionRef.current?.getSenders().forEach((sender) => {
      sender.track?.stop();
    });
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }

    cleanupRemoteAnalyser();
    setConnectionState("disconnected");
    setLastEventType("");
  }

  async function attachRemoteAudio(stream: MediaStream) {
    const audioElement = document.createElement("audio");
    audioElement.autoplay = true;
    audioElement.srcObject = stream;

    if (typeof audioElement.setSinkId === "function" && outputDeviceId !== "default") {
      try {
        await audioElement.setSinkId(outputDeviceId);
      } catch {
        // Some WebView/Windows combinations do not allow selecting a sink here.
      }
    }

    audioElementRef.current = audioElement;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    analyserContextRef.current = audioContext;
    analyserRef.current = analyser;

    const timeDomain = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyserFrameRef.current = requestAnimationFrame(tick);
      analyser.getByteTimeDomainData(timeDomain);

      let energy = 0;
      for (let index = 0; index < timeDomain.length; index += 1) {
        const centered = (timeDomain[index] - 128) / 128;
        energy += centered * centered;
      }

      setRemoteAudioLevel(Math.min(1, Math.sqrt(energy / timeDomain.length) * 2.6));
    };

    analyserFrameRef.current = requestAnimationFrame(tick);

    try {
      await audioElement.play();
    } catch {
      // Autoplay policies can still block playback until the user interacts.
    }
  }

  async function startSession() {
    if (connectionState === "connecting" || connectionState === "connected") {
      return;
    }

    if (!("RTCPeerConnection" in window) || !("mediaDevices" in navigator)) {
      setConnectionState("error");
      setLastError("На этом устройстве нельзя начать живой разговор.");
      return;
    }

    setConnectionState("connecting");
    setLastError("");
    setLastEventType("");

    try {
      const secret = await invoke<RealtimeClientSecret>("create_realtime_client_secret");
      const peerConnection = new RTCPeerConnection();

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          void attachRemoteAudio(stream);
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          ...(inputDeviceId !== "default" ? { deviceId: { exact: inputDeviceId } } : {}),
        },
      });

      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.addEventListener("open", () => {
        setConnectionState("connected");
        setLastEventType("session.open");
      });

      dataChannel.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data as string) as { type?: string };
          setLastEventType(payload.type ?? "server.event");
        } catch {
          setLastEventType("server.event");
        }
      });

      dataChannel.addEventListener("close", () => {
        setConnectionState("disconnected");
      });

      dataChannel.addEventListener("error", () => {
        setConnectionState("error");
        setLastError("Соединение прервалось.");
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const response = await fetch(`https://api.openai.com/v1/realtime/calls?model=${secret.model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        throw new Error(`Не удалось начать разговор. Код ответа: ${response.status}.`);
      }

      const answerSdp = await response.text();
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });

      peerConnectionRef.current = peerConnection;
    } catch (error) {
      stopSession();
      setConnectionState("error");
      setLastError(error instanceof Error ? error.message : "Не удалось начать разговор.");
    }
  }

  useEffect(() => {
    if (audioElementRef.current && typeof audioElementRef.current.setSinkId === "function" && outputDeviceId !== "default") {
      void audioElementRef.current.setSinkId(outputDeviceId).catch(() => {
        // Ignore sink selection failures silently.
      });
    }
  }, [outputDeviceId]);

  useEffect(() => stopSession, []);

  return {
    connectionState,
    remoteAudioLevel,
    lastError,
    lastEventType,
    startSession,
    stopSession,
  };
}