import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { OverlayView } from "./components/OverlayView";
import { SettingsView } from "./components/SettingsView";
import { defaultSettings, type AppSettings } from "./types/settings";
import "./App.css";

type WindowMode = "overlay" | "settings" | "unknown";

function App() {
  const [windowMode, setWindowMode] = useState<WindowMode>("unknown");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [apiKeyPresent, setApiKeyPresent] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

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
        const [storedSettings, storedApiKey] = await Promise.all([
          invoke<AppSettings>("load_settings"),
          invoke<boolean>("api_key_status"),
        ]);

        setSettings(storedSettings);
        setApiKeyPresent(storedApiKey);
      } catch {
        setStatusMessage("Unable to load native settings.");
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

    if (apiKeyDraft.trim()) {
      await invoke("save_api_key", { apiKey: apiKeyDraft.trim() });
      setApiKeyPresent(true);
    }

    setSettings(savedSettings);
    setStatusMessage(savedSettings.language === "ru" ? "Настройки сохранены." : "Settings saved.");
  }

  if (!isReady) {
    return <main className="loading-screen">JARVIS booting...</main>;
  }

  if (windowMode === "settings") {
    return (
      <SettingsView
        apiKeyPresent={apiKeyPresent}
        onSave={handleSave}
        settings={settings}
        statusMessage={statusMessage}
      />
    );
  }

  return <OverlayView apiKeyPresent={apiKeyPresent} settings={settings} />;
}

export default App;
