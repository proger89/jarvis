import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { getCopy } from "../lib/copy";
import type { AppSettings } from "../types/settings";
import { JarvisMask } from "./JarvisMask";
import { WaveRibbon } from "./WaveRibbon";
import { useAudioWaveform } from "../hooks/useAudioWaveform";
import { useRealtimeSession } from "../hooks/useRealtimeSession";
import type { OverlayState } from "../types/overlay";

type OverlayViewProps = {
  settings: AppSettings;
  apiKeyPresent: boolean;
  onSettingsPatch: (patch: Partial<AppSettings>) => Promise<void>;
};

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

type SpeechRecognitionResultLike = {
  0?: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtorLike = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtorLike;
    webkitSpeechRecognition?: SpeechRecognitionCtorLike;
  }
}

export function OverlayView({ settings, apiKeyPresent, onSettingsPatch }: OverlayViewProps) {
  const ACTIVATION_COOLDOWN_MS = 1200;
  const text = getCopy(settings.language);
  const isDevBuild = import.meta.env.DEV;
  const overlayWindow = getCurrentWindow();
  const { level, permission, samples, start, stop } = useAudioWaveform(settings.inputDeviceId);
  const {
    connectionState,
    remoteAudioLevel,
    remoteSamples,
    lastError,
    lastEventType,
    activeToolName,
    userSubtitle,
    assistantSubtitle,
    toolSummary,
    pendingOpenRequest,
    startSession,
    interruptResponse,
    confirmPendingOpen,
    rejectPendingOpen,
    stopSession,
  } = useRealtimeSession({
    inputDeviceId: settings.inputDeviceId,
    outputDeviceId: settings.outputDeviceId,
    onSettingsPatch,
  });
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [showDebugControls, setShowDebugControls] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const stateChangedAtRef = useRef(Date.now());
  const heardVoiceRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const lastRemoteVoiceAtRef = useRef(0);
  const lastAppliedWindowStateRef = useRef<OverlayState | null>(null);
  const wakeTimerRef = useRef<number | null>(null);
  const activationCooldownUntilRef = useRef(0);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeWordTriggeredAtRef = useRef(0);

  function logDebug(scope: string, message: string) {
    void invoke("log_debug_event", {
      scope,
      message,
    }).catch(() => {
      // Ignore debug logging failures silently.
    });
  }

  const speakingSamples = useMemo(() => {
    if (overlayState === "speaking") {
      return remoteSamples.map((sample, index) => {
        const motion = Math.abs(Math.sin(Date.now() / 280 + index * 0.4)) * 0.04;
        return Math.min(1, sample + motion);
      });
    }

    const speakerBase = overlayState === "thinking" ? 0.08 : 0;
    return samples.map((sample, index) => {
      const motion = overlayState === "thinking" ? Math.abs(Math.sin(Date.now() / 380 + index * 0.45)) * 0.06 : 0;
      return Math.min(1, sample + speakerBase + motion);
    });
  }, [overlayState, remoteSamples, samples]);

  const openConfirmVisible = Boolean(pendingOpenRequest);
  const statusRail = useMemo(() => {
    if (overlayState === "tool") {
      return {
        tone: "tool",
        title: text.overlay.stateBadge.tool,
        message: toolSummary || activeToolName || text.overlay.actionPrefix,
      };
    }

    if (overlayState === "error") {
      return {
        tone: "error",
        title: text.overlay.stateBadge.error,
        message: lastError || text.overlay.fallbackRetry,
      };
    }

    return null;
  }, [activeToolName, lastError, overlayState, text.overlay.actionPrefix, text.overlay.fallbackRetry, text.overlay.stateBadge.error, text.overlay.stateBadge.tool, toolSummary]);

  useEffect(() => {
    return () => {
      if (wakeTimerRef.current !== null) {
        window.clearTimeout(wakeTimerRef.current);
      }

      speechRecognitionRef.current?.stop();
      speechRecognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

    if (!SpeechRecognitionCtor) {
      return;
    }

    if (!apiKeyPresent || !isOnline || connectionState !== "disconnected") {
      speechRecognitionRef.current?.stop();
      speechRecognitionRef.current = null;
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = settings.language === "ru" ? "ru-RU" : "en-US";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result: SpeechRecognitionResultLike) => result[0]?.transcript ?? "")
        .join(" ")
        .trim()
        .toLowerCase();

      const wakeWord = settings.wakeWord.trim().toLowerCase();
      if (!wakeWord || !transcript.includes(wakeWord)) {
        return;
      }

      const now = Date.now();
      if (now - wakeWordTriggeredAtRef.current < 1800) {
        return;
      }

      wakeWordTriggeredAtRef.current = now;
      logDebug("wakeword", `recognized wake phrase: ${settings.wakeWord}`);
      void handlePrimaryAction();
    };

    recognition.onend = () => {
      if (speechRecognitionRef.current !== recognition) {
        return;
      }

      if (apiKeyPresent && isOnline && connectionState === "disconnected") {
        try {
          recognition.start();
        } catch {
          // Ignore restart errors silently.
        }
      }
    };

    try {
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      speechRecognitionRef.current = null;
    }

    return () => {
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
      recognition.stop();
    };
  }, [apiKeyPresent, connectionState, isOnline, settings.language, settings.wakeWord]);

  useEffect(() => {
    const unlistenPromise = listen("jarvis://hotkey-activate", () => {
      void handlePrimaryAction();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [apiKeyPresent, connectionState, isOnline, permission, settings]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    async function syncOverlayWindow() {
      if (lastAppliedWindowStateRef.current === overlayState) {
        return;
      }

      lastAppliedWindowStateRef.current = overlayState;

      const monitor = await currentMonitor();
      const scaleFactor = await overlayWindow.scaleFactor();

      const width = overlayState === "idle" ? 620 : 860;
      const height = overlayState === "idle" ? 250 : 340;
      const showAboveWindows = settings.overlayMode === "focus";

      await overlayWindow.setIgnoreCursorEvents(false);
      await overlayWindow.setFocusable(true);
      await overlayWindow.setAlwaysOnTop(showAboveWindows);
      await overlayWindow.setSize(new LogicalSize(width, height));

      if (monitor) {
        const monitorSize = monitor.size.toLogical(scaleFactor);
        const monitorPosition = monitor.position.toLogical(scaleFactor);
        await overlayWindow.setPosition(
          new LogicalPosition(
            monitorPosition.x + (monitorSize.width - width) / 2,
            monitorPosition.y + (monitorSize.height - height) / 2,
          ),
        );
      }
    }

    void syncOverlayWindow();
  }, [overlayState, overlayWindow, settings.overlayMode]);

  useEffect(() => {
    function handleKeys(event: KeyboardEvent) {
      if (event.code === "Space") {
        event.preventDefault();
        void handlePrimaryAction();
      }

      if (event.code === "Escape") {
        event.preventDefault();
        handleReset();
      }

      if (event.code === "Backquote") {
        event.preventDefault();
        if (isDevBuild) {
          setShowDebugControls((current) => !current);
        }
      }
    }

    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [isDevBuild]);

  useEffect(() => {
    const now = Date.now();
    const speechThreshold = 0.1;
    const silenceThreshold = 0.045;

    if (connectionState === "connecting") {
      transitionTo("thinking");
      return;
    }

    if (connectionState === "error") {
      activationCooldownUntilRef.current = 0;
      transitionTo("error");
      return;
    }

    if (connectionState === "disconnected") {
      activationCooldownUntilRef.current = 0;
      if (overlayState !== "idle" && overlayState !== "wake") {
        transitionTo("idle");
      }
      return;
    }

    if (overlayState === "wake") {
      return;
    }

    if (lastEventType === "response.created") {
      transitionTo("thinking");
    }

    if (activeToolName) {
      transitionTo("tool");
      return;
    }

    if (remoteAudioLevel > 0.028) {
      lastRemoteVoiceAtRef.current = now;
      transitionTo("speaking");
      return;
    }

    if (overlayState === "speaking" && permission === "granted" && level > speechThreshold) {
      interruptResponse();
      heardVoiceRef.current = true;
      lastVoiceAtRef.current = now;
      transitionTo("listening");
      return;
    }

    if (overlayState === "speaking" && now - lastRemoteVoiceAtRef.current > 900) {
      activationCooldownUntilRef.current = now + ACTIVATION_COOLDOWN_MS;
      transitionTo("listening");
      return;
    }

    if (permission !== "granted") {
      return;
    }

    if (overlayState === "listening") {
      if (level > speechThreshold) {
        heardVoiceRef.current = true;
        lastVoiceAtRef.current = now;
      }

      if (heardVoiceRef.current && level < silenceThreshold && now - lastVoiceAtRef.current > 900) {
        transitionTo("thinking");
      }
    }

    if (connectionState === "connected" && (overlayState === "idle" || overlayState === "tool" || overlayState === "error")) {
      transitionTo("listening");
    }
  }, [activeToolName, connectionState, interruptResponse, lastEventType, level, overlayState, permission, remoteAudioLevel]);

  function transitionTo(nextState: OverlayState) {
    stateChangedAtRef.current = Date.now();
    setOverlayState(nextState);
  }

  async function handlePrimaryAction() {
    logDebug("overlay.action", `handlePrimaryAction state=${overlayState} connection=${connectionState} permission=${permission}`);
    if (!apiKeyPresent) {
      await openSettings();
      return;
    }

    if (!isOnline) {
      return;
    }

    if (connectionState === "disconnected" && Date.now() < activationCooldownUntilRef.current) {
      return;
    }

    if (connectionState === "connected" || connectionState === "connecting") {
      if (overlayState === "speaking" || overlayState === "thinking" || overlayState === "tool") {
        interruptResponse();
        heardVoiceRef.current = false;
        lastVoiceAtRef.current = 0;
        transitionTo("listening");
        return;
      }

      stopSession();
      heardVoiceRef.current = false;
      lastVoiceAtRef.current = 0;
      activationCooldownUntilRef.current = 0;
      transitionTo("idle");
      return;
    }

    if (permission !== "granted") {
      await start();
    }

    activationCooldownUntilRef.current = 0;
    heardVoiceRef.current = false;
    lastVoiceAtRef.current = 0;
    transitionTo("wake");

    if (wakeTimerRef.current !== null) {
      window.clearTimeout(wakeTimerRef.current);
    }

    wakeTimerRef.current = window.setTimeout(() => {
      wakeTimerRef.current = null;
      void startSession();
    }, 320);
  }

  function handleReset() {
    heardVoiceRef.current = false;
    lastVoiceAtRef.current = 0;
    activationCooldownUntilRef.current = 0;
    if (wakeTimerRef.current !== null) {
      window.clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = null;
    }
    stopSession();
    transitionTo("idle");
  }

  async function openSettings() {
    await overlayWindow.setAlwaysOnTop(false);
    await invoke("show_settings_window");
  }

  return (
    <main className={`app-shell speaking-overlay-shell overlay-state-${overlayState}`}>
      <section className="speaking-overlay-panel">
        <div className="speaking-center-stage">
          <div className="wave-band wave-band-left" aria-hidden="true">
            <WaveRibbon className="wave-ribbon" samples={speakingSamples} />
          </div>

          <button className={`mask-stage mask-stage-${overlayState}`} onClick={() => void handlePrimaryAction()} type="button">
            <div className="mask-glow mask-glow-cyan" />
            <div className="mask-glow mask-glow-amber" />
            <div className="mask-target-ring mask-target-ring-outer" />
            <div className="mask-target-ring mask-target-ring-inner" />
            <JarvisMask audioLevel={Math.max(level, remoteAudioLevel)} state={overlayState} />
          </button>

          <div className="wave-band wave-band-right" aria-hidden="true">
            <WaveRibbon className="wave-ribbon" mirrored samples={speakingSamples} />
          </div>
        </div>

        {statusRail && (
          <section className={`overlay-status-rail overlay-status-rail-${statusRail.tone}`}>
            <span>{statusRail.title}</span>
            <strong>{statusRail.message}</strong>
          </section>
        )}

        {openConfirmVisible && pendingOpenRequest && (
          <section className="open-confirm-panel">
            <div>
              <p className="open-confirm-title">{text.overlay.openConfirmTitle}</p>
              <p className="open-confirm-copy">{pendingOpenRequest.title}</p>
              <p className="open-confirm-url">{pendingOpenRequest.url}</p>
            </div>
            <div className="open-confirm-actions">
              <button className="hud-settings-button" onClick={rejectPendingOpen} type="button">
                {text.overlay.openConfirmCancel}
              </button>
              <button className="hud-primary-action" onClick={() => void confirmPendingOpen()} type="button">
                {text.overlay.openConfirmApprove}
              </button>
            </div>
          </section>
        )}

        {isDevBuild && showDebugControls && (
          <aside className="hud-debug-console">
            <div className="hud-debug-grid">
              <div>
                <span>Overlay</span>
                <strong>{overlayState}</strong>
              </div>
              <div>
                <span>Connection</span>
                <strong>{connectionState}</strong>
              </div>
              <div>
                <span>Permission</span>
                <strong>{permission}</strong>
              </div>
              <div>
                <span>Event</span>
                <strong>{lastEventType || "idle"}</strong>
              </div>
              <div>
                <span>Remote level</span>
                <strong>{remoteAudioLevel.toFixed(3)}</strong>
              </div>
              <div>
                <span>Remote peak</span>
                <strong>{Math.max(...remoteSamples).toFixed(3)}</strong>
              </div>
              <div>
                <span>Input level</span>
                <strong>{level.toFixed(3)}</strong>
              </div>
              <div>
                <span>Cooldown</span>
                <strong>{Math.max(0, activationCooldownUntilRef.current - Date.now())}</strong>
              </div>
            </div>

            {(lastError || activeToolName || toolSummary || userSubtitle || assistantSubtitle) && (
              <div className="hud-debug-log">
                {lastError && <p>Error: {lastError}</p>}
                {activeToolName && <p>Tool: {activeToolName}</p>}
                {toolSummary && <p>Tool summary: {toolSummary}</p>}
                {userSubtitle && <p>You: {userSubtitle}</p>}
                {assistantSubtitle && <p>Jarvis: {assistantSubtitle}</p>}
              </div>
            )}

            <div className="hud-dev-strip">
              <button className="hud-dev-button" onClick={() => transitionTo("idle")} type="button">
                {text.overlay.devIdle}
              </button>
              <button className="hud-dev-button" onClick={() => transitionTo("wake")} type="button">
                {text.overlay.devWake}
              </button>
              <button className="hud-dev-button" onClick={() => transitionTo("listening")} type="button">
                {text.overlay.devListening}
              </button>
              <button className="hud-dev-button" onClick={() => transitionTo("thinking")} type="button">
                {text.overlay.devThinking}
              </button>
              <button className="hud-dev-button" onClick={() => transitionTo("speaking")} type="button">
                {text.overlay.devSpeaking}
              </button>
              <button className="hud-dev-button" onClick={handleReset} type="button">
                {text.overlay.devReset}
              </button>
              <button className="hud-dev-button" onClick={() => void start()} type="button">
                {text.overlay.devMicOn}
              </button>
              <button className="hud-dev-button" onClick={stop} type="button">
                {text.overlay.devMicOff}
              </button>
              <button className="hud-dev-button" onClick={() => void startSession()} type="button">
                {text.overlay.devLiveOn}
              </button>
              <button className="hud-dev-button" onClick={stopSession} type="button">
                {text.overlay.devLiveOff}
              </button>
            </div>
          </aside>
        )}
      </section>
    </main>
  );
}