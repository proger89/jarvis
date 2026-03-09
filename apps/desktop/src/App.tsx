import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { OverlayView } from "./components/OverlayView";
import { SettingsView } from "./components/SettingsView";
import { defaultSettings, type AppSettings } from "./types/settings";
import "./App.css";

const SETTINGS_SNAPSHOT_STORAGE_KEY = "jarvis.settings.snapshot";

type WindowMode = "overlay" | "settings" | "unknown";

function App() {
  const [windowMode, setWindowMode] = useState<WindowMode>("unknown");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [apiKeyPresent, setApiKeyPresent] = useState(false);
  const [apiKeyPreview, setApiKeyPreview] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  function writeRendererSettingsSnapshot(nextSettings: AppSettings) {
    window.localStorage.setItem(SETTINGS_SNAPSHOT_STORAGE_KEY, JSON.stringify(nextSettings));
  }

  function readRendererSettingsSnapshot() {
    const raw = window.localStorage.getItem(SETTINGS_SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AppSettings;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    if (currentWindow.label === "settings") {
      setWindowMode("settings");
      return;
    }

    if (currentWindow.label === "overlay") {
      setWindowMode("overlay");
      return;
    }

    setWindowMode("unknown");
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [storedSettings, storedApiKey, storedApiKeyPreview] = await Promise.all([
          invoke<AppSettings>("load_settings"),
          invoke<boolean>("api_key_status"),
          invoke<string | null>("api_key_preview"),
        ]);

        const rendererSnapshot = readRendererSettingsSnapshot();
        const resolvedSettings = rendererSnapshot ?? storedSettings;

        setSettings(resolvedSettings);
        setApiKeyPresent(storedApiKey);
        setApiKeyPreview(storedApiKeyPreview);
        void invoke("log_debug_event", {
          scope: "frontend.bootstrap",
          message: `settings_loaded language=${resolvedSettings.language} wakeWord=${resolvedSettings.wakeWord} overlayMode=${resolvedSettings.overlayMode}`,
        }).catch(() => {
          // Ignore debug logging failures silently.
        });
      } catch {
        const rendererSnapshot = readRendererSettingsSnapshot();
        if (rendererSnapshot) {
          setSettings(rendererSnapshot);
        }
        setStatusMessage("Не удалось загрузить настройки.");
      } finally {
        setIsReady(true);
      }
    }

    void bootstrap();
  }, []);

  async function handleSave(nextSettings: AppSettings, apiKeyDraft: string) {
    const savedSettings = await invoke<AppSettings>("save_settings", {
      settings: nextSettings,
    });

    writeRendererSettingsSnapshot(savedSettings);

    if (apiKeyDraft.trim()) {
      await invoke("save_api_key", { apiKey: apiKeyDraft.trim() });
      setApiKeyPresent(true);
      setApiKeyPreview(await invoke<string | null>("api_key_preview"));
    }

    setSettings(savedSettings);
    setStatusMessage(savedSettings.language === "ru" ? "Настройки сохранены." : "Settings saved.");
  }

  async function handleOverlaySettingsPatch(patch: Partial<AppSettings>) {
    const savedSettings = await invoke<AppSettings>("save_settings", {
      settings: {
        ...settings,
        ...patch,
      },
    });

    writeRendererSettingsSnapshot(savedSettings);
    setSettings(savedSettings);
  }

  if (!isReady) {
    return <main className="loading-screen">Джарвис запускается...</main>;
  }

  if (windowMode === "settings") {
    return (
      <SettingsView
        apiKeyPresent={apiKeyPresent}
        apiKeyPreview={apiKeyPreview}
        onSave={handleSave}
        settings={settings}
        statusMessage={statusMessage}
      />
    );
  }

  return (
    <OverlayView
      apiKeyPresent={apiKeyPresent}
      onSettingsPatch={handleOverlaySettingsPatch}
      settings={settings}
    />
  );
}

export default App;
