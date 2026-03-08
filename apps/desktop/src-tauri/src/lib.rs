use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use reqwest::blocking::multipart;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use serde_json::json;

const SETTINGS_FILE_NAME: &str = "jarvis-settings.json";
const KEYRING_SERVICE: &str = "JarvisDesktop";
const KEYRING_USERNAME: &str = "openai_api_key";
const REALTIME_MODEL: &str = "gpt-realtime";
const REALTIME_VOICE: &str = "marin";
const REALTIME_INSTRUCTIONS: &str = include_str!("../../../../jarvis_persona_prompt.txt");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiSettings {
    language: String,
    wake_word: String,
    address_title: String,
    overlay_mode: String,
    input_device_id: String,
    output_device_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiKeyCheckResult {
    ok: bool,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RealtimeSessionInitResult {
    model: String,
    voice: String,
    answer_sdp: String,
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            language: "ru".to_string(),
            wake_word: "Джарвис".to_string(),
            address_title: "Мистер Старк".to_string(),
            overlay_mode: "quiet".to_string(),
            input_device_id: "default".to_string(),
            output_device_id: "default".to_string(),
        }
    }
}

fn sanitize_settings(settings: UiSettings) -> UiSettings {
    let language = match settings.language.as_str() {
        "ru" | "en" => settings.language,
        _ => "ru".to_string(),
    };

    let wake_word = if settings.wake_word.trim().is_empty() {
        "Джарвис".to_string()
    } else {
        settings.wake_word.trim().to_string()
    };

    let address_title = if settings.address_title.trim().is_empty() {
        "Мистер Старк".to_string()
    } else {
        settings.address_title.trim().to_string()
    };

    let overlay_mode = match settings.overlay_mode.as_str() {
        "quiet" | "focus" => settings.overlay_mode,
        _ => "quiet".to_string(),
    };

    let input_device_id = if settings.input_device_id.trim().is_empty() {
        "default".to_string()
    } else {
        settings.input_device_id.trim().to_string()
    };

    let output_device_id = if settings.output_device_id.trim().is_empty() {
        "default".to_string()
    } else {
        settings.output_device_id.trim().to_string()
    };

    UiSettings {
        language,
        wake_word,
        address_title,
        overlay_mode,
        input_device_id,
        output_device_id,
    }
}

fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    config_dir.push(SETTINGS_FILE_NAME);
    Ok(config_dir)
}

fn load_settings_from_disk(app: &AppHandle) -> Result<UiSettings, String> {
    let path = settings_file_path(app)?;

    if !path.exists() {
        return Ok(UiSettings::default());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<UiSettings>(&content).unwrap_or_default();
    Ok(sanitize_settings(parsed))
}

fn save_settings_to_disk(app: &AppHandle, settings: &UiSettings) -> Result<(), String> {
    let path = settings_file_path(app)?;
    let content = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn api_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USERNAME).map_err(|error| error.to_string())
}

fn focus_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn ensure_settings_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("settings").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("JARVIS Settings")
        .inner_size(1120.0, 760.0)
        .min_inner_size(920.0, 640.0)
        .visible(false)
        .center()
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn show_settings_window(app: AppHandle) -> Result<(), String> {
    ensure_settings_window(&app)?;

    focus_window(&app, "settings");

    Ok(())
}

fn build_tray(app: &AppHandle) -> Result<(), String> {
    let menu = MenuBuilder::new(app)
        .text("show_overlay", "Show Overlay")
        .text("open_settings", "Open Settings")
        .separator()
        .text("quit", "Quit")
        .build()
        .map_err(|error| error.to_string())?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "default app icon is unavailable".to_string())?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("JARVIS")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_overlay" => focus_window(app, "overlay"),
            "open_settings" => {
                let _ = show_settings_window(app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_window(tray.app_handle(), "overlay");
            }
        })
        .build(app)
        .map(|_| ())
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<UiSettings, String> {
    load_settings_from_disk(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: UiSettings) -> Result<UiSettings, String> {
    let sanitized = sanitize_settings(settings);
    save_settings_to_disk(&app, &sanitized)?;
    Ok(sanitized)
}

#[tauri::command]
fn api_key_status() -> Result<bool, String> {
    let entry = api_key_entry()?;
    Ok(entry
        .get_password()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false))
}

#[tauri::command]
fn save_api_key(api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    api_key_entry()?
        .set_password(trimmed)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_realtime_session(offer_sdp: String) -> Result<RealtimeSessionInitResult, String> {
    let key = api_key_entry()?
        .get_password()
        .map_err(|_| "Ключ не найден. Сначала сохраните его в настройках.".to_string())?;

    if key.trim().is_empty() {
        return Err("Ключ пустой. Сначала сохраните его в настройках.".to_string());
    }

    if offer_sdp.trim().is_empty() {
        return Err("Браузер не передал описание соединения для голосового канала.".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .build()
        .map_err(|error| error.to_string())?;

    let session = json!({
        "session": {
            "type": "realtime",
            "model": REALTIME_MODEL,
            "instructions": REALTIME_INSTRUCTIONS,
            "audio": {
                "input": {
                    "turn_detection": {
                        "type": "server_vad",
                        "create_response": true,
                        "interrupt_response": true,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 550,
                        "threshold": 0.55
                    },
                    "noise_reduction": {
                        "type": "far_field"
                    }
                },
                "output": {
                    "voice": REALTIME_VOICE,
                    "speed": 1.0
                }
            },
            "tool_choice": "auto",
            "max_output_tokens": 900
        }
    });

    let form = multipart::Form::new()
        .text("sdp", offer_sdp)
        .text("session", session.to_string());

    let response = client
        .post("https://api.openai.com/v1/realtime/calls")
        .bearer_auth(key.trim())
        .header("OpenAI-Beta", "realtime=v1")
        .multipart(form)
        .send()
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body_text = response.text().map_err(|error| error.to_string())?;

    if !status.is_success() {
        let message = serde_json::from_str::<serde_json::Value>(&body_text)
            .ok()
            .and_then(|payload| payload.get("error")?.get("message")?.as_str().map(str::to_string))
            .unwrap_or_else(|| "Не удалось начать голосовой сеанс.".to_string());
        return Err(message);
    }

    Ok(RealtimeSessionInitResult {
        model: REALTIME_MODEL.to_string(),
        voice: REALTIME_VOICE.to_string(),
        answer_sdp: body_text,
    })
}

#[tauri::command]
fn verify_api_key() -> Result<ApiKeyCheckResult, String> {
    let key = api_key_entry()?
        .get_password()
        .map_err(|_| "Ключ не найден. Сначала сохраните его в настройках.".to_string())?;

    if key.trim().is_empty() {
        return Ok(ApiKeyCheckResult {
            ok: false,
            message: "Ключ пустой. Вставьте его и сохраните.".to_string(),
        });
    }

    let client = reqwest::blocking::Client::builder()
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get("https://api.openai.com/v1/models")
        .bearer_auth(key.trim())
        .send()
        .map_err(|error| error.to_string())?;

    if response.status().is_success() {
        return Ok(ApiKeyCheckResult {
            ok: true,
            message: "Ключ подходит. Можно продолжать.".to_string(),
        });
    }

    let status = response.status();
    let message = match status.as_u16() {
        401 => "Ключ не подошел. Проверьте его еще раз.".to_string(),
        429 => "Слишком много запросов. Попробуйте чуть позже.".to_string(),
        _ => format!("Не удалось проверить ключ. Код ответа: {}.", status.as_u16()),
    };

    Ok(ApiKeyCheckResult { ok: false, message })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            ensure_settings_window(&app.handle().clone())?;
            build_tray(&app.handle().clone())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_settings_window,
            load_settings,
            save_settings,
            api_key_status,
            save_api_key,
            verify_api_key,
            create_realtime_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
