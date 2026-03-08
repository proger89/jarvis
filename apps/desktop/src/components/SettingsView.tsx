import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCopy } from "../lib/copy";
import type { AppLanguage, AppSettings, OverlayMode } from "../types/settings";

type SettingsViewProps = {
  settings: AppSettings;
  apiKeyPresent: boolean;
  statusMessage: string;
  onSave: (settings: AppSettings, apiKeyDraft: string) => Promise<void>;
};

export function SettingsView({
  settings,
  apiKeyPresent,
  statusMessage,
  onSave,
}: SettingsViewProps) {
  const [language, setLanguage] = useState(settings.language);
  const [wakeWord, setWakeWord] = useState(settings.wakeWord);
  const [addressTitle, setAddressTitle] = useState(settings.addressTitle);
  const [overlayMode, setOverlayMode] = useState(settings.overlayMode);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saveState, setSaveState] = useState("");
  const text = getCopy(language);
  const phaseOneChecklist = [
    {
      title: text.settings.checklistFoundationTitle,
      detail: text.settings.checklistFoundationDetail,
      done: true,
    },
    {
      title: text.settings.checklistOverlayTitle,
      detail: text.settings.checklistOverlayDetail,
      done: true,
    },
    {
      title: text.settings.checklistSettingsTitle,
      detail: text.settings.checklistSettingsDetail,
      done: true,
    },
    {
      title: text.settings.checklistTrayTitle,
      detail: text.settings.checklistTrayDetail,
      done: true,
    },
    {
      title: text.settings.checklistPackagingTitle,
      detail: text.settings.checklistPackagingDetail,
      done: true,
    },
  ];

  useEffect(() => {
    setLanguage(settings.language);
    setWakeWord(settings.wakeWord);
    setAddressTitle(settings.addressTitle);
    setOverlayMode(settings.overlayMode);
  }, [settings]);

  async function closeWindow() {
    await getCurrentWindow().hide();
  }

  async function handleSave() {
    setSaveState("");
    try {
      await onSave(
        {
          language,
          wakeWord,
          addressTitle,
          overlayMode,
        },
        apiKeyDraft,
      );
      setApiKeyDraft("");
      setSaveState(language === "ru" ? "Изменения сохранены." : "Changes saved.");
    } catch {
      setSaveState(language === "ru" ? "Не удалось сохранить настройки." : "Failed to save settings.");
    }
  }

  return (
    <main className="app-shell settings-shell">
      <section className="settings-panel">
        <div className="settings-header">
          <div>
            <p className="eyebrow">{text.settings.eyebrow}</p>
            <h1 className="settings-title">{text.settings.title}</h1>
            <p className="settings-copy">{text.settings.summary}</p>
          </div>
          <span className="mode-chip">{text.settings.modeChip}</span>
        </div>

        <div className="settings-grid">
          <section className="settings-section">
            <div className="section-header">
              <div>
                <h2 className="overlay-title">{text.settings.profileTitle}</h2>
                <p className="section-copy">{text.settings.profileSummary}</p>
              </div>
            </div>

            <div className="field-grid">
              <div className="field">
                <label htmlFor="language">{text.settings.languageLabel}</label>
                <select
                  id="language"
                  value={language}
                  onChange={(event) => setLanguage(event.currentTarget.value as AppLanguage)}
                >
                  <option value="ru">{text.settings.languageRussian}</option>
                  <option value="en">{text.settings.languageEnglish}</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="wake-word">{text.settings.wakeWordLabel}</label>
                <input
                  id="wake-word"
                  value={wakeWord}
                  onChange={(event) => setWakeWord(event.currentTarget.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="address-mode">{text.settings.addressLabel}</label>
                <input
                  id="address-mode"
                  value={addressTitle}
                  onChange={(event) => setAddressTitle(event.currentTarget.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="overlay-mode">{text.settings.overlayModeLabel}</label>
                <select
                  id="overlay-mode"
                  value={overlayMode}
                  onChange={(event) => setOverlayMode(event.currentTarget.value as OverlayMode)}
                >
                  <option value="quiet">{text.settings.overlayModeQuiet}</option>
                  <option value="focus">{text.settings.overlayModeFocus}</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="api-key">{text.settings.apiKeyLabel}</label>
                <input
                  id="api-key"
                  onChange={(event) => setApiKeyDraft(event.currentTarget.value)}
                  placeholder={text.settings.apiKeyPlaceholder}
                  value={apiKeyDraft}
                />
              </div>
            </div>

            <p className="inline-note">{text.settings.inlineNote}</p>
            <p className="inline-note">
              {apiKeyPresent ? text.settings.apiKeyStored : text.settings.apiKeyMissing}
            </p>
            {(saveState || statusMessage) && <p className="inline-note">{saveState || statusMessage}</p>}

            <div className="settings-actions">
              <button className="primary-button" onClick={handleSave} type="button">
                {text.settings.saveButton}
              </button>
              <button className="secondary-button" onClick={closeWindow} type="button">
                {text.settings.closeButton}
              </button>
            </div>
          </section>

          <section className="settings-section">
            <div className="section-header">
              <div>
                <h2 className="overlay-title">{text.settings.executionTitle}</h2>
                <p className="section-copy">{text.settings.executionSummary}</p>
              </div>
            </div>

            <ul className="checklist">
              {phaseOneChecklist.map((item) => (
                <li key={item.title}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <span className={item.done ? "badge done" : "badge pending"}>
                    {item.done ? text.settings.readyBadge : text.settings.pendingBadge}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}