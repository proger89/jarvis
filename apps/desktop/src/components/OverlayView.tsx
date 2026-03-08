import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

export function OverlayView({ settings, apiKeyPresent, onSettingsPatch }: OverlayViewProps) {
  const text = getCopy(settings.language);
  const overlayWindow = getCurrentWindow();
  const { level, permission, samples, start, stop } = useAudioWaveform(settings.inputDeviceId);
  const {
    connectionState,
    remoteAudioLevel,
    lastError,
    lastEventType,
    userSubtitle,
    assistantSubtitle,
    activeToolName,
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

  const speakingSamples = useMemo(() => {
    const activeLevel = overlayState === "speaking" ? Math.max(level, remoteAudioLevel) : level;
    const speakerBase = overlayState === "speaking" ? 0.22 : overlayState === "thinking" ? 0.1 : 0;
    return samples.map((sample, index) => {
      const motion = overlayState === "speaking" ? Math.abs(Math.sin(Date.now() / 250 + index * 0.55)) * 0.18 : 0;
      const remoteLift = overlayState === "speaking" ? activeLevel * 0.5 : 0;
      return Math.min(1, sample + speakerBase + motion + remoteLift);
    });
  }, [level, overlayState, remoteAudioLevel, samples]);

  const openConfirmVisible = Boolean(pendingOpenRequest);

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

      const width = overlayState === "idle" ? 640 : 1040;
      const height = overlayState === "idle" ? 280 : 500;
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
        setShowDebugControls((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  });

  useEffect(() => {
    const now = Date.now();
    const speechThreshold = 0.1;
    const silenceThreshold = 0.045;

    if (connectionState === "connecting") {
      transitionTo("thinking");
      return;
    }

    if (connectionState === "error") {
      transitionTo("error");
      return;
    }

    if (connectionState === "disconnected") {
      if (overlayState !== "idle") {
        transitionTo("idle");
      }
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
    if (!apiKeyPresent) {
      await openSettings();
      return;
    }

    if (!isOnline) {
      return;
    }

    if (connectionState === "connected" || connectionState === "connecting") {
      stopSession();
      heardVoiceRef.current = false;
      lastVoiceAtRef.current = 0;
      transitionTo("idle");
      return;
    }

    if (permission !== "granted") {
      await start();
    }

    heardVoiceRef.current = false;
    lastVoiceAtRef.current = 0;
    await startSession();
  }

  async function handleFallbackAction() {
    if (!apiKeyPresent) {
      await openSettings();
      return;
    }

    if (permission !== "granted") {
      await start();
      return;
    }

    if (isOnline && connectionState !== "connected" && connectionState !== "connecting") {
      await startSession();
    }
  }

  function handleReset() {
    heardVoiceRef.current = false;
    lastVoiceAtRef.current = 0;
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

        {(lastError || toolSummary || activeToolName || userSubtitle || assistantSubtitle) && (
          <section className="overlay-mini-status">
            <p>{lastError || toolSummary || assistantSubtitle || userSubtitle || activeToolName}</p>
          </section>
        )}

        {(!apiKeyPresent || !isOnline || permission === "denied" || permission === "unavailable") && (
          <div className="overlay-mini-actions">
            <button className="hud-settings-button" onClick={() => void handleFallbackAction()} type="button">
              {!apiKeyPresent ? text.overlay.fallbackOpenSettings : text.overlay.fallbackRetry}
            </button>
          </div>
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

        {showDebugControls && (
          <div className="hud-dev-strip">
            <button className="hud-dev-button" onClick={() => transitionTo("idle")} type="button">
              {text.overlay.devIdle}
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
        )}
      </section>
    </main>
  );
}