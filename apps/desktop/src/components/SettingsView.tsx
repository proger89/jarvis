import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { getCopy } from "../lib/copy";
import type { AppLanguage, AppSettings, OverlayMode } from "../types/settings";

type DeviceOption = {
  id: string;
  label: string;
};

type ApiKeyCheckResult = {
  ok: boolean;
  message: string;
};

type MemoryFact = {
  key: string;
  value: string;
  scope: string;
  updatedAt: number;
};

type ClearMemoryResult = {
  ok: boolean;
  message: string;
};

type SessionSummary = {
  id: number;
  userSummary: string;
  assistantSummary: string;
  toolSummary: string;
  createdAt: number;
};

type ToolAuditRecord = {
  id: number;
  toolName: string;
  status: string;
  detail: string;
  createdAt: number;
};

type DeviceHistoryRecord = {
  id: number;
  deviceKind: string;
  deviceId: string;
  createdAt: number;
};

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
  const [inputDeviceId, setInputDeviceId] = useState(settings.inputDeviceId);
  const [outputDeviceId, setOutputDeviceId] = useState(settings.outputDeviceId);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saveState, setSaveState] = useState("");
  const [keyCheckMessage, setKeyCheckMessage] = useState("");
  const [inputDevices, setInputDevices] = useState<DeviceOption[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceOption[]>([]);
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
  const [toolAuditLogs, setToolAuditLogs] = useState<ToolAuditRecord[]>([]);
  const [deviceHistory, setDeviceHistory] = useState<DeviceHistoryRecord[]>([]);
  const [memoryMessage, setMemoryMessage] = useState("");
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartMessage, setAutostartMessage] = useState("");
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
      title: text.settings.checklistAutostartTitle,
      detail: text.settings.checklistAutostartDetail,
      done: autostartEnabled,
    },
    {
      title: text.settings.checklistHotkeyTitle,
      detail: text.settings.checklistHotkeyDetail,
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
    setInputDeviceId(settings.inputDeviceId);
    setOutputDeviceId(settings.outputDeviceId);
  }, [settings]);

  useEffect(() => {
    async function loadDevices() {
      if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.enumerateDevices) {
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices
          .filter((device) => device.kind === "audioinput")
          .map((device, index) => ({
            id: device.deviceId || `input-${index}`,
            label: device.label || `${text.settings.microphoneFallback} ${index + 1}`,
          }));

        const speakers = devices
          .filter((device) => device.kind === "audiooutput")
          .map((device, index) => ({
            id: device.deviceId || `output-${index}`,
            label: device.label || `${text.settings.speakerFallback} ${index + 1}`,
          }));

        setInputDevices([{ id: "default", label: text.settings.defaultDevice }, ...microphones]);
        setOutputDevices([{ id: "default", label: text.settings.defaultDevice }, ...speakers]);
      } catch {
        setInputDevices([{ id: "default", label: text.settings.defaultDevice }]);
        setOutputDevices([{ id: "default", label: text.settings.defaultDevice }]);
      }
    }

    void loadDevices();

    if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.addEventListener) {
      return;
    }

    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
  }, [text.settings.defaultDevice, text.settings.microphoneFallback, text.settings.speakerFallback]);

  useEffect(() => {
    if (inputDeviceId !== "default" && inputDevices.length > 0 && !inputDevices.some((device) => device.id === inputDeviceId)) {
      setInputDeviceId("default");
    }
  }, [inputDeviceId, inputDevices]);

  useEffect(() => {
    if (outputDeviceId !== "default" && outputDevices.length > 0 && !outputDevices.some((device) => device.id === outputDeviceId)) {
      setOutputDeviceId("default");
    }
  }, [outputDeviceId, outputDevices]);

  useEffect(() => {
    async function loadAutostartState() {
      try {
        setAutostartEnabled(await isAutostartEnabled());
      } catch {
        setAutostartEnabled(false);
      }
    }

    void loadAutostartState();
  }, []);

  useEffect(() => {
    async function loadMemoryState() {
      try {
        const [facts, summaries, auditLogs, devices] = await Promise.all([
          invoke<MemoryFact[]>("list_memory_facts"),
          invoke<SessionSummary[]>("list_session_summaries"),
          invoke<ToolAuditRecord[]>("list_tool_audit_logs"),
          invoke<DeviceHistoryRecord[]>("list_device_history"),
        ]);
        setMemoryFacts(facts);
        setSessionSummaries(summaries);
        setToolAuditLogs(auditLogs);
        setDeviceHistory(devices);
      } catch {
        setMemoryMessage(text.settings.memoryLoadFailed);
      }
    }

    void loadMemoryState();
  }, [text.settings.memoryLoadFailed]);

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
          inputDeviceId,
          outputDeviceId,
        },
        apiKeyDraft,
      );
      setApiKeyDraft("");
      setSaveState(language === "ru" ? "Изменения сохранены." : "Changes saved.");
    } catch {
      setSaveState(language === "ru" ? "Не удалось сохранить настройки." : "Failed to save settings.");
    }
  }

  async function handleVerifyKey() {
    setKeyCheckMessage("");

    try {
      if (apiKeyDraft.trim()) {
        await onSave(
          {
            language,
            wakeWord,
            addressTitle,
            overlayMode,
            inputDeviceId,
            outputDeviceId,
          },
          apiKeyDraft,
        );
        setApiKeyDraft("");
      }

      const result = await invoke<ApiKeyCheckResult>("verify_api_key");
      setKeyCheckMessage(result.message);
    } catch {
      setKeyCheckMessage(text.settings.keyCheckFailed);
    }
  }

  async function handleAutostartToggle(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.currentTarget.checked;
    setAutostartMessage("");

    try {
      if (nextValue) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }

      setAutostartEnabled(nextValue);
      setAutostartMessage(nextValue ? text.settings.autoStartEnabled : text.settings.autoStartDisabled);
    } catch {
      setAutostartMessage(text.settings.autoStartToggleFailed);
    }
  }

  async function handleForgetMe() {
    setMemoryMessage("");

    try {
      const result = await invoke<ClearMemoryResult>("clear_memory_facts");
      setMemoryFacts([]);
      setSessionSummaries([]);
      setToolAuditLogs([]);
      setDeviceHistory([]);
      setMemoryMessage(result.message);
    } catch {
      setMemoryMessage(text.settings.memoryClearFailed);
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

              <div className="field field-checkbox">
                <label htmlFor="autostart-toggle">{text.settings.autoStartLabel}</label>
                <label className="checkbox-row" htmlFor="autostart-toggle">
                  <input
                    checked={autostartEnabled}
                    id="autostart-toggle"
                    onChange={handleAutostartToggle}
                    type="checkbox"
                  />
                  <span>{text.settings.autoStartHint}</span>
                </label>
              </div>

              <div className="field">
                <label htmlFor="hotkey-fallback">{text.settings.hotkeyFallbackLabel}</label>
                <div className="readonly-chip" id="hotkey-fallback">
                  <strong>{text.settings.hotkeyFallbackValue}</strong>
                  <span>{text.settings.hotkeyFallbackHint}</span>
                </div>
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

              <div className="field">
                <label htmlFor="input-device">{text.settings.inputDeviceLabel}</label>
                <select
                  id="input-device"
                  value={inputDeviceId}
                  onChange={(event) => setInputDeviceId(event.currentTarget.value)}
                >
                  {inputDevices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="output-device">{text.settings.outputDeviceLabel}</label>
                <select
                  id="output-device"
                  value={outputDeviceId}
                  onChange={(event) => setOutputDeviceId(event.currentTarget.value)}
                >
                  {outputDevices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="inline-note">{text.settings.inlineNote}</p>
            <p className="inline-note">
              {apiKeyPresent ? text.settings.apiKeyStored : text.settings.apiKeyMissing}
            </p>
            {autostartMessage && <p className="inline-note">{autostartMessage}</p>}
            {keyCheckMessage && <p className="inline-note">{keyCheckMessage}</p>}
            {(saveState || statusMessage) && <p className="inline-note">{saveState || statusMessage}</p>}

            <div className="settings-actions">
              <button className="primary-button" onClick={handleSave} type="button">
                {text.settings.saveButton}
              </button>
              <button className="secondary-button" onClick={handleVerifyKey} type="button">
                {text.settings.checkKeyButton}
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

          <section className="settings-section">
            <div className="section-header">
              <div>
                <h2 className="overlay-title">{text.settings.memoryTitle}</h2>
                <p className="section-copy">{text.settings.memorySummary}</p>
              </div>
            </div>

            {memoryFacts.length > 0 ? (
              <ul className="memory-list">
                {memoryFacts.map((fact) => (
                  <li key={`${fact.scope}-${fact.key}`}>
                    <div>
                      <strong>{fact.key}</strong>
                      <span>{fact.value}</span>
                    </div>
                    <span className="badge pending">{fact.scope}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">{text.settings.memoryEmpty}</p>
            )}

            {memoryMessage && <p className="inline-note">{memoryMessage}</p>}

            <div className="settings-actions">
              <button className="secondary-button danger-button" onClick={handleForgetMe} type="button">
                {text.settings.forgetMeButton}
              </button>
            </div>
          </section>

          <section className="settings-section">
            <div className="section-header">
              <div>
                <h2 className="overlay-title">{text.settings.summaryTitle}</h2>
                <p className="section-copy">{text.settings.summaryDescription}</p>
              </div>
            </div>

            {sessionSummaries.length > 0 ? (
              <ul className="summary-list">
                {sessionSummaries.map((summary) => (
                  <li key={summary.id}>
                    <div>
                      {summary.userSummary && <strong>{text.settings.summaryUserPrefix} {summary.userSummary}</strong>}
                      {summary.assistantSummary && <span>{text.settings.summaryAssistantPrefix} {summary.assistantSummary}</span>}
                      {summary.toolSummary && <span>{text.settings.summaryToolPrefix} {summary.toolSummary}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">{text.settings.summaryEmpty}</p>
            )}
          </section>

          <section className="settings-section">
            <div className="section-header">
              <div>
                <h2 className="overlay-title">{text.settings.auditTitle}</h2>
                <p className="section-copy">{text.settings.auditSummary}</p>
              </div>
            </div>

            {toolAuditLogs.length > 0 ? (
              <ul className="summary-list">
                {toolAuditLogs.map((record) => (
                  <li key={record.id}>
                    <div>
                      <strong>{record.toolName}</strong>
                      <span>{record.status}</span>
                      <span>{record.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">{text.settings.auditEmpty}</p>
            )}
          </section>

          <section className="settings-section">
            <div className="section-header">
              <div>
                <h2 className="overlay-title">{text.settings.deviceHistoryTitle}</h2>
                <p className="section-copy">{text.settings.deviceHistorySummary}</p>
              </div>
            </div>

            {deviceHistory.length > 0 ? (
              <ul className="summary-list">
                {deviceHistory.map((record) => (
                  <li key={record.id}>
                    <div>
                      <strong>{record.deviceKind}</strong>
                      <span>{record.deviceId}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">{text.settings.deviceHistoryEmpty}</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}