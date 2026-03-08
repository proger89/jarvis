import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppSettings } from "../types/settings";

const realtimeTools = [
  {
    type: "function",
    name: "list_audio_devices",
    description: "List available input and output audio devices.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "switch_microphone",
    description: "Switch to a selected microphone device.",
    parameters: {
      type: "object",
      properties: {
        device_id: {
          type: "string",
        },
      },
      required: ["device_id"],
    },
  },
  {
    type: "function",
    name: "switch_output_device",
    description: "Switch to a selected output device.",
    parameters: {
      type: "object",
      properties: {
        device_id: {
          type: "string",
        },
      },
      required: ["device_id"],
    },
  },
  {
    type: "function",
    name: "open_url",
    description: "Open a URL in the system browser after confirmation when appropriate.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
        },
        title: {
          type: "string",
        },
      },
      required: ["url"],
    },
  },
  {
    type: "function",
    name: "search_web",
    description: "Search the web and return a short summary with source links.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
        },
        intent: {
          type: "string",
          enum: ["general", "fact_check", "shopping", "news", "research"],
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "remember_fact",
    description: "Store a durable user preference or explicit personal fact locally.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
        },
        value: {
          type: "string",
        },
        scope: {
          type: "string",
          enum: ["profile", "preference", "project", "temporary"],
        },
      },
      required: ["key", "value"],
    },
  },
  {
    type: "function",
    name: "recall_fact",
    description: "Recall previously stored local memory facts relevant to the current request.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
        },
      },
      required: ["query"],
    },
  },
] as const;

type RealtimeConnectionState = "disconnected" | "connecting" | "connected" | "error";

type RealtimeSessionInitResult = {
  model: string;
  voice: string;
  answerSdp: string;
};

type SearchSource = {
  title: string;
  url: string;
};

type SearchWebResult = {
  summary: string;
  sources: SearchSource[];
};

type ToolResultLike = {
  message?: string;
  summary?: string;
  matches?: Array<{ key?: string; value?: string; scope?: string }>;
};

type PendingOpenRequest = {
  title: string;
  url: string;
};

type UseRealtimeSessionOptions = {
  inputDeviceId: string;
  outputDeviceId: string;
  onSettingsPatch: (patch: Partial<AppSettings>) => Promise<void>;
};

type UseRealtimeSessionResult = {
  connectionState: RealtimeConnectionState;
  remoteAudioLevel: number;
  lastError: string;
  lastEventType: string;
  userSubtitle: string;
  assistantSubtitle: string;
  activeToolName: string;
  toolSummary: string;
  toolSources: SearchSource[];
  pendingOpenRequest: PendingOpenRequest | null;
  startSession: () => Promise<void>;
  interruptResponse: () => void;
  requestOpenApproval: (request: PendingOpenRequest) => Promise<boolean>;
  confirmPendingOpen: () => Promise<void>;
  rejectPendingOpen: () => void;
  stopSession: () => void;
};

export function useRealtimeSession({ inputDeviceId, outputDeviceId, onSettingsPatch }: UseRealtimeSessionOptions): UseRealtimeSessionResult {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("disconnected");
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);
  const [lastError, setLastError] = useState("");
  const [lastEventType, setLastEventType] = useState("");
  const [userSubtitle, setUserSubtitle] = useState("");
  const [assistantSubtitle, setAssistantSubtitle] = useState("");
  const [activeToolName, setActiveToolName] = useState("");
  const [toolSummary, setToolSummary] = useState("");
  const [toolSources, setToolSources] = useState<SearchSource[]>([]);
  const [pendingOpenRequest, setPendingOpenRequest] = useState<PendingOpenRequest | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const analyserContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const respondedItemIdsRef = useRef<Set<string>>(new Set());
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldStayConnectedRef = useRef(false);
  const pendingOpenResolverRef = useRef<((approved: boolean) => void) | null>(null);

  function settlePendingOpen(approved: boolean) {
    pendingOpenResolverRef.current?.(approved);
    pendingOpenResolverRef.current = null;
    setPendingOpenRequest(null);
  }

  function clearReconnectTimer() {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

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

  function resetSessionState() {
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    shouldStayConnectedRef.current = false;
    cleanupRemoteAnalyser();
    setConnectionState("disconnected");
    setLastEventType("");
    setLastError("");
    setUserSubtitle("");
    setAssistantSubtitle("");
    setActiveToolName("");
    setToolSummary("");
    setToolSources([]);
    settlePendingOpen(false);
    respondedItemIdsRef.current.clear();
  }

  function teardownLiveObjects() {
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
  }

  function persistSessionSummary() {
    const nextUserSummary = userSubtitle.trim();
    const nextAssistantSummary = assistantSubtitle.trim();
    const nextToolSummary = toolSummary.trim();

    if (!nextUserSummary && !nextAssistantSummary && !nextToolSummary) {
      return;
    }

    void invoke("save_session_summary", {
      userSummary: nextUserSummary,
      assistantSummary: nextAssistantSummary,
      toolSummary: nextToolSummary,
    }).catch(() => {
      // Ignore summary persistence failures silently in the live session.
    });
  }

  function stopSession() {
    shouldStayConnectedRef.current = false;
    persistSessionSummary();
    teardownLiveObjects();
    resetSessionState();
  }

  function sendClientEvent(message: Record<string, unknown>) {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(JSON.stringify(message));
    }
  }

  function interruptResponse() {
    if (dataChannelRef.current?.readyState !== "open") {
      return;
    }

    sendClientEvent({ type: "response.cancel" });
    setAssistantSubtitle("");
    setActiveToolName("");
    setToolSummary("");
    setToolSources([]);
    setLastEventType("response.cancelled");
  }

  function requestOpenApproval(request: PendingOpenRequest) {
    return new Promise<boolean>((resolve) => {
      settlePendingOpen(false);
      pendingOpenResolverRef.current = resolve;
      setPendingOpenRequest(request);
    });
  }

  async function confirmPendingOpen() {
    if (!pendingOpenRequest) {
      return;
    }

    const request = pendingOpenRequest;
    await openUrl(request.url);
    settlePendingOpen(true);
  }

  function rejectPendingOpen() {
    settlePendingOpen(false);
  }

  function requestAssistantResponse(itemId?: string) {
    if (itemId) {
      if (respondedItemIdsRef.current.has(itemId)) {
        return;
      }

      respondedItemIdsRef.current.add(itemId);
    }

    sendClientEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    });
  }

  async function listAudioDevicesTool() {
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.enumerateDevices) {
      return {
        ok: false,
        message: "Не удалось получить список аудиоустройств.",
      };
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      ok: true,
      inputDeviceId,
      outputDeviceId,
      microphones: devices
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({ id: device.deviceId, label: device.label || "Микрофон" })),
      speakers: devices
        .filter((device) => device.kind === "audiooutput")
        .map((device) => ({ id: device.deviceId, label: device.label || "Динамик" })),
    };
  }

  async function switchDeviceTool(kind: "input" | "output", deviceId: string) {
    if (!deviceId?.trim()) {
      return {
        ok: false,
        message: "Не передан идентификатор устройства.",
      };
    }

    await onSettingsPatch(kind === "input" ? { inputDeviceId: deviceId } : { outputDeviceId: deviceId });

    return {
      ok: true,
      message: kind === "input" ? "Микрофон переключен." : "Устройство вывода переключено.",
      deviceId,
    };
  }

  async function openUrlTool(url: string, title?: string) {
    if (!url?.trim()) {
      return {
        ok: false,
        message: "Ссылка не передана.",
      };
    }

    const approved = await requestOpenApproval({
      title: title?.trim() || "Открыть ссылку",
      url,
    });

    if (!approved) {
      return {
        ok: false,
        message: "Открытие ссылки отменено.",
        url,
      };
    }

    return {
      ok: true,
      message: title ? `Открываю: ${title}` : "Открываю ссылку.",
      url,
    };
  }

  async function executeToolCall(name: string, rawArguments: string) {
    const args = rawArguments.trim() ? JSON.parse(rawArguments) as Record<string, unknown> : {};

    switch (name) {
      case "list_audio_devices":
        return await listAudioDevicesTool();
      case "search_web":
        return await invoke<SearchWebResult>("search_web", {
          query: String(args.query ?? ""),
          intent: typeof args.intent === "string" ? args.intent : undefined,
        });
      case "remember_fact":
        return await invoke("remember_fact", {
          key: String(args.key ?? ""),
          value: String(args.value ?? ""),
          scope: typeof args.scope === "string" ? args.scope : undefined,
        });
      case "recall_fact":
        return await invoke("recall_fact", {
          query: String(args.query ?? ""),
        });
      case "switch_microphone":
        return await switchDeviceTool("input", String(args.device_id ?? ""));
      case "switch_output_device":
        return await switchDeviceTool("output", String(args.device_id ?? ""));
      case "open_url":
        return await openUrlTool(String(args.url ?? ""), typeof args.title === "string" ? args.title : undefined);
      default:
        return {
          ok: false,
          message: `Инструмент ${name} пока не подключен.`,
        };
    }
  }

  async function sendToolOutput(callId: string, name: string, rawArguments: string) {
    try {
      const result = await executeToolCall(name, rawArguments);

      if (name === "search_web") {
        const searchResult = result as SearchWebResult;
        setToolSummary(searchResult.summary ?? "");
        setToolSources(searchResult.sources ?? []);
      } else {
        const toolResult = result as ToolResultLike;
        if (name === "recall_fact" && Array.isArray(toolResult.matches) && toolResult.matches.length > 0) {
          setToolSummary(
            toolResult.matches
              .map((match) => `${match.key ?? "факт"}: ${match.value ?? ""}`.trim())
              .join(" | "),
          );
        } else {
          setToolSummary(toolResult.summary ?? toolResult.message ?? "");
        }
        setToolSources([]);
      }

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
          status: "completed",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось выполнить действие.";
      setToolSummary(message);
      setToolSources([]);
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ ok: false, message }),
          status: "completed",
        },
      });
    }

    sendClientEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    });
  }

  function scheduleReconnect(reason: string) {
    if (!shouldStayConnectedRef.current || reconnectTimerRef.current !== null) {
      return;
    }

    reconnectAttemptRef.current += 1;
    const delay = Math.min(1000 * 2 ** (reconnectAttemptRef.current - 1), 8000);
    setConnectionState("connecting");
    setLastError(`${reason} ${Math.round(delay / 1000)} сек.`);

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void startSession(true);
    }, delay);
  }

  function appendTranscript(current: string, chunk: string) {
    return `${current}${chunk}`.trim();
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

  async function startSession(isReconnect = false) {
    if (!isReconnect && (connectionState === "connecting" || connectionState === "connected")) {
      return;
    }

    shouldStayConnectedRef.current = true;
    clearReconnectTimer();

    if (!("RTCPeerConnection" in window) || !("mediaDevices" in navigator)) {
      setConnectionState("error");
      setLastError("На этом устройстве нельзя начать живой разговор.");
      shouldStayConnectedRef.current = false;
      return;
    }

    setConnectionState("connecting");
    if (!isReconnect) {
      reconnectAttemptRef.current = 0;
      setLastError("");
    }
    setLastEventType("");

    try {
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

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const session = await invoke<RealtimeSessionInitResult>("create_realtime_session", {
        offerSdp: offer.sdp ?? "",
      });

      dataChannel.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        setConnectionState("connected");
        setLastEventType("session.open");
        setLastError("");
        sendClientEvent({
          type: "session.update",
          session: {
            type: "realtime",
            tools: realtimeTools,
            tool_choice: "auto",
            input_audio_transcription: {
              model: "gpt-4o-mini-transcribe",
            },
            turn_detection: {
              type: "server_vad",
            },
          },
        });
      });

      dataChannel.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type?: string;
            delta?: string;
            transcript?: string;
            item_id?: string;
            call_id?: string;
            name?: string;
            arguments?: string;
            error?: { message?: string };
            item?: { type?: string; name?: string };
            response?: { output?: Array<{ type?: string; name?: string }> };
          };
          setLastEventType(payload.type ?? "server.event");

          switch (payload.type) {
            case "error":
              setConnectionState("error");
              setLastError(payload.error?.message ?? "Произошла ошибка во время разговора.");
              break;
            case "response.audio_transcript.delta":
            case "response.text.delta":
              if (payload.delta) {
                setAssistantSubtitle((current) => appendTranscript(current, payload.delta ?? ""));
              }
              break;
            case "response.audio_transcript.done":
            case "response.text.done":
              if (payload.transcript) {
                setAssistantSubtitle(payload.transcript.trim());
              }
              break;
            case "input_audio_buffer.speech_started":
              interruptResponse();
              break;
            case "input_audio_buffer.speech_stopped":
              requestAssistantResponse(payload.item_id);
              break;
            case "conversation.item.input_audio_transcription.completed":
              if (payload.transcript) {
                setUserSubtitle(payload.transcript.trim());
              }
              requestAssistantResponse(payload.item_id);
              break;
            case "response.output_item.added":
              if (payload.item?.type === "function_call") {
                setActiveToolName(payload.item.name ?? "действие");
              }
              break;
            case "response.function_call_arguments.done":
              if (payload.call_id && payload.name) {
                setActiveToolName(payload.name);
                void sendToolOutput(payload.call_id, payload.name, payload.arguments ?? "{}");
              }
              break;
            case "response.done":
              if (!payload.response?.output?.some((item) => item.type === "function_call")) {
                setActiveToolName("");
              }
              break;
            default:
              break;
          }
        } catch {
          setLastEventType("server.event");
        }
      });

      dataChannel.addEventListener("close", () => {
        if (shouldStayConnectedRef.current) {
          teardownLiveObjects();
          scheduleReconnect("Связь пропала. Повторяю подключение через");
        } else {
          resetSessionState();
        }
      });

      dataChannel.addEventListener("error", () => {
        teardownLiveObjects();
        scheduleReconnect("Связь прервалась. Повторяю подключение через");
      });

      peerConnection.addEventListener("connectionstatechange", () => {
        if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "disconnected") {
          teardownLiveObjects();
          scheduleReconnect("Соединение потеряно. Повторяю подключение через");
        }
      });

      await peerConnection.setRemoteDescription({ type: "answer", sdp: session.answerSdp });

      peerConnectionRef.current = peerConnection;
    } catch (error) {
      teardownLiveObjects();
      const message = error instanceof Error ? error.message : "Не удалось начать разговор.";

      if (shouldStayConnectedRef.current) {
        scheduleReconnect(`Не удалось начать разговор. Повторяю подключение через`);
        setLastError(message);
      } else {
        resetSessionState();
        setConnectionState("error");
        setLastError(message);
      }
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
    userSubtitle,
    assistantSubtitle,
    activeToolName,
    toolSummary,
    toolSources,
    pendingOpenRequest,
    startSession,
    interruptResponse,
    requestOpenApproval,
    confirmPendingOpen,
    rejectPendingOpen,
    stopSession,
  };
}