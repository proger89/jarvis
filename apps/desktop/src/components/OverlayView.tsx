import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCopy } from "../lib/copy";
import type { AppSettings } from "../types/settings";
import { JarvisMask } from "./JarvisMask";
import { WaveRibbon } from "./WaveRibbon";
import { useAudioWaveform } from "../hooks/useAudioWaveform";
import type { OverlayState } from "../types/overlay";

type OverlayViewProps = {
  settings: AppSettings;
  apiKeyPresent: boolean;
};

export function OverlayView({ settings, apiKeyPresent }: OverlayViewProps) {
  const text = getCopy(settings.language);
  const { level, permission, samples, start, stop } = useAudioWaveform();
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const stateChangedAtRef = useRef(Date.now());
  const heardVoiceRef = useRef(false);
  const lastVoiceAtRef = useRef(0);

  const speakingSamples = useMemo(() => {
    const speakerBase = overlayState === "speaking" ? 0.22 : overlayState === "thinking" ? 0.1 : 0;
    return samples.map((sample, index) => {
      const motion = overlayState === "speaking" ? Math.abs(Math.sin(Date.now() / 250 + index * 0.55)) * 0.18 : 0;
      return Math.min(1, sample + speakerBase + motion);
    });
  }, [overlayState, samples]);

  const systemBadges = [
    text.overlay.stateBadge[overlayState],
    permission === "granted" ? text.overlay.badgeLowLatency : text.overlay.badgeMicRequired,
    settings.wakeWord,
    apiKeyPresent ? text.overlay.badgeSearchReady : text.overlay.badgeSecureKeyPending,
  ];

  const stateConfig = text.overlay.statePanels[overlayState];

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
    }

    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  });

  useEffect(() => {
    if (permission !== "granted") {
      return;
    }

    const now = Date.now();
    const speechThreshold = 0.1;
    const silenceThreshold = 0.045;

    if (overlayState === "listening") {
      if (level > speechThreshold) {
        heardVoiceRef.current = true;
        lastVoiceAtRef.current = now;
      }

      if (heardVoiceRef.current && level < silenceThreshold && now - lastVoiceAtRef.current > 900) {
        transitionTo("thinking");
      }
    }

    if (overlayState === "thinking" && now - stateChangedAtRef.current > 1300) {
      transitionTo("speaking");
    }

    if (overlayState === "speaking" && now - stateChangedAtRef.current > 2600) {
      heardVoiceRef.current = false;
      transitionTo("idle");
    }
  }, [level, overlayState, permission]);

  function transitionTo(nextState: OverlayState) {
    stateChangedAtRef.current = Date.now();
    setOverlayState(nextState);
  }

  async function handlePrimaryAction() {
    if (permission !== "granted") {
      await start();
    }

    heardVoiceRef.current = false;
    lastVoiceAtRef.current = 0;
    transitionTo(overlayState === "idle" ? "listening" : "idle");
  }

  function handleReset() {
    heardVoiceRef.current = false;
    lastVoiceAtRef.current = 0;
    transitionTo("idle");
  }

  async function openSettings() {
    await invoke("show_settings_window");
  }

  return (
    <main className="app-shell speaking-overlay-shell">
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
            <p className="hud-status-line">{stateConfig.description}</p>
          </div>
          <div className="hud-top-actions">
            <button className="hud-primary-action" onClick={() => void handlePrimaryAction()} type="button">
              {overlayState === "idle" ? text.overlay.activateVoice : text.overlay.pauseVoice}
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
            <JarvisMask audioLevel={level} state={overlayState} />
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
        </div>
      </section>
    </main>
  );
}