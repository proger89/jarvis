import { invoke } from "@tauri-apps/api/core";
import { getCopy } from "../lib/copy";
import type { AppSettings } from "../types/settings";
import { JarvisMask } from "./JarvisMask";

type OverlayViewProps = {
  settings: AppSettings;
  apiKeyPresent: boolean;
};

export function OverlayView({ settings, apiKeyPresent }: OverlayViewProps) {
  const text = getCopy(settings.language);
  const waveformBars = [0.42, 0.58, 0.32, 0.72, 0.86, 0.4, 0.61, 0.3, 0.66, 0.5, 0.28, 0.46];
  const systemBadges = [
    text.overlay.badgeVoiceLock,
    text.overlay.badgeLowLatency,
    settings.wakeWord,
    apiKeyPresent ? text.overlay.badgeSearchReady : text.overlay.badgeSecureKeyPending,
  ];

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
          </div>
          <button className="hud-settings-button" onClick={openSettings} type="button">
            {text.overlay.openSettings}
          </button>
        </header>

        <div className="speaking-center-stage">
          <div className="wave-band wave-band-left" aria-hidden="true">
            <div className="wave-line wave-line-cyan">
              {waveformBars.map((height, index) => (
                <span key={`left-cyan-${index}`} style={{ height: `${height * 100}%` }} />
              ))}
            </div>
            <div className="wave-line wave-line-amber">
              {waveformBars.map((height, index) => (
                <span
                  key={`left-amber-${index}`}
                  style={{ height: `${Math.max(20, (1 - height) * 78)}%` }}
                />
              ))}
            </div>
          </div>

          <div className="mask-stage">
            <div className="mask-glow mask-glow-cyan" />
            <div className="mask-glow mask-glow-amber" />
            <JarvisMask />
          </div>

          <div className="wave-band wave-band-right" aria-hidden="true">
            <div className="wave-line wave-line-cyan">
              {waveformBars.map((_, index) => (
                <span
                  key={`right-cyan-${index}`}
                  style={{ height: `${waveformBars[(index + 3) % waveformBars.length] * 100}%` }}
                />
              ))}
            </div>
            <div className="wave-line wave-line-amber">
              {waveformBars.map((_, index) => (
                <span
                  key={`right-amber-${index}`}
                  style={{ height: `${Math.max(18, (1 - waveformBars[(index + 5) % waveformBars.length]) * 74)}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <footer className="hud-footer">
          {systemBadges.map((badge) => (
            <span key={badge} className="hud-pill">
              {badge}
            </span>
          ))}
        </footer>
      </section>
    </main>
  );
}