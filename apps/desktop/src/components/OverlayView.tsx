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
};

export function OverlayView({ settings, apiKeyPresent }: OverlayViewProps) {
  const text = getCopy(settings.language);
  const overlayWindow = getCurrentWindow();
  const { level, permission, samples, start, stop } = useAudioWaveform(settings.inputDeviceId);
  const { connectionState, remoteAudioLevel, lastError, lastEventType, startSession, stopSession } =
    useRealtimeSession({
      inputDeviceId: settings.inputDeviceId,
      outputDeviceId: settings.outputDeviceId,
    });
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [showDebugControls, setShowDebugControls] = useState(false);
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

  const systemBadges = [
    text.overlay.stateBadge[overlayState],
    connectionState === "connected"
      ? text.overlay.badgeLiveConnection
      : permission === "granted"
        ? text.overlay.badgeLowLatency
        : text.overlay.badgeMicRequired,
    settings.wakeWord,
    apiKeyPresent ? text.overlay.badgeSearchReady : text.overlay.badgeSecureKeyPending,
  ];

  const stateConfig = text.overlay.statePanels[overlayState];

  useEffect(() => {
    async function syncOverlayWindow() {
      if (lastAppliedWindowStateRef.current === overlayState) {
        return;
      }

      lastAppliedWindowStateRef.current = overlayState;

      const monitor = await currentMonitor();
      const scaleFactor = await overlayWindow.scaleFactor();

      if (overlayState === "idle") {
        const width = 420;
        const height = 220;
        const margin = 28;

        await overlayWindow.setIgnoreCursorEvents(true);
        await overlayWindow.setFocusable(false);
        await overlayWindow.setAlwaysOnTop(false);
        await overlayWindow.setSize(new LogicalSize(width, height));

        if (monitor) {
          const monitorSize = monitor.size.toLogical(scaleFactor);
          const monitorPosition = monitor.position.toLogical(scaleFactor);
          await overlayWindow.setPosition(
            new LogicalPosition(
              monitorPosition.x + monitorSize.width - width - margin,
              monitorPosition.y + margin,
            ),
          );
        }

        return;
      }

      const width = 1520;
      const height = 860;
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
      transitionTo("idle");
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

    if (remoteAudioLevel > 0.028) {
      lastRemoteVoiceAtRef.current = now;
      transitionTo("speaking");
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

    if (connectionState === "connected" && overlayState === "idle") {
      transitionTo("listening");
    }
  }, [connectionState, lastEventType, level, overlayState, permission, remoteAudioLevel]);

  function transitionTo(nextState: OverlayState) {
    stateChangedAtRef.current = Date.now();
    setOverlayState(nextState);
  }

  async function handlePrimaryAction() {
    if (!apiKeyPresent) {
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
      <div className="speaking-overlay-frame" aria-hidden="true">
        <span className="frame-corner frame-corner-top-left" />
        <span className="frame-corner frame-corner-top-right" />
        <span className="frame-corner frame-corner-bottom-left" />
        <span className="frame-corner frame-corner-bottom-right" />
      </div>

      <div className="hud-grid" aria-hidden="true" />
      <div className="hud-stars" aria-hidden="true">
        {Array.from({ length: 42 }, (_, index) => (
          <span key={index} className={`star star-${(index % 6) + 1}`} />
        ))}
      </div>

      <section className="speaking-overlay-panel">
        <header className="speaking-header">
          <div>
            <p className="speaking-title">{text.overlay.hudTitle}</p>
            <p className="speaking-subtitle">
              {settings.addressTitle}, {text.overlay.hudSubtitle}
            </p>
            <p className="hud-status-line">{lastError || stateConfig.description}</p>
          </div>
          <div className="hud-top-actions">
            <button className="hud-primary-action" onClick={() => void handlePrimaryAction()} type="button">
              {connectionState === "connected" || connectionState === "connecting"
                ? text.overlay.pauseVoice
                : text.overlay.activateVoice}
            </button>
            <button className="hud-settings-button" onClick={openSettings} type="button">
              {text.overlay.openSettings}
            </button>
          </div>
        </header>

        <div className="speaking-center-stage">
          <div className="wave-band wave-band-left" aria-hidden="true">
            <WaveRibbon className="wave-ribbon" samples={speakingSamples} />
          </div>

          <div className={`mask-stage mask-stage-${overlayState}`}>
            <div className="mask-glow mask-glow-cyan" />
            <div className="mask-glow mask-glow-amber" />
            <div className="mask-target-ring mask-target-ring-outer" />
            <div className="mask-target-ring mask-target-ring-inner" />
            <JarvisMask audioLevel={Math.max(level, remoteAudioLevel)} state={overlayState} />
            <div className="mask-caption-panel">
              <span className="mask-caption-label">{stateConfig.label}</span>
              <strong className="mask-caption-value">{stateConfig.headline}</strong>
              <span className="mask-caption-meta">{stateConfig.meta}</span>
            </div>
          </div>

          <div className="wave-band wave-band-right" aria-hidden="true">
            <WaveRibbon className="wave-ribbon" mirrored samples={speakingSamples} />
          </div>
        </div>

        <footer className="hud-footer">
          {systemBadges.map((badge) => (
            <span key={badge} className="hud-pill">
              {badge}
            </span>
          ))}
        </footer>

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