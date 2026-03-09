use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use reqwest::blocking::multipart;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{env, fs, fs::OpenOptions, io::Write, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use serde_json::json;
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

const SETTINGS_FILE_NAME: &str = "jarvis-settings.json";
const SETTINGS_SNAPSHOT_FILE_NAME: &str = "jarvis-settings-snapshot.json";
const API_KEY_FILE_NAME: &str = "jarvis-api-key.txt";
const DEBUG_LOG_FILE_NAME: &str = "jarvis-debug.log";
const MEMORY_FILE_NAME: &str = "jarvis-memory-facts.json";
const MEMORY_DB_FILE_NAME: &str = "jarvis-memory.sqlite3";
const KEYRING_SERVICE: &str = "JarvisDesktop";
const KEYRING_USERNAME: &str = "openai_api_key";
const REALTIME_MODEL: &str = "gpt-realtime";
const REALTIME_VOICE: &str = "marin";
const REALTIME_INSTRUCTIONS: &str = include_str!("../../../../jarvis_persona_prompt.txt");
const GLOBAL_ACTIVATION_SHORTCUT: &str = "Ctrl+Alt+J";

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchSource {
    title: String,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchWebResult {
    summary: String,
    sources: Vec<SearchSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemoryFact {
    key: String,
    value: String,
    scope: String,
    updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RememberFactResult {
    ok: bool,
    message: String,
    fact: MemoryFact,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecallFactResult {
    ok: bool,
    message: String,
    matches: Vec<MemoryFact>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClearMemoryResult {
    ok: bool,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionSummary {
    id: i64,
    user_summary: String,
    assistant_summary: String,
    tool_summary: String,
    created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolAuditRecord {
    id: i64,
    tool_name: String,
    status: String,
    detail: String,
    created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceHistoryRecord {
    id: i64,
    device_kind: String,
    device_id: String,
    created_at: u64,
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

fn settings_snapshot_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    config_dir.push(SETTINGS_SNAPSHOT_FILE_NAME);
    Ok(config_dir)
}

fn api_key_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    config_dir.push(API_KEY_FILE_NAME);
    Ok(config_dir)
}

fn debug_log_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    config_dir.push(DEBUG_LOG_FILE_NAME);
    Ok(config_dir)
}

fn migrate_legacy_settings_file(app: &AppHandle, connection: &Connection) -> Result<(), String> {
    let legacy_path = settings_file_path(app)?;

    if !legacy_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&legacy_path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<UiSettings>(&content).unwrap_or_default();
    let sanitized = sanitize_settings(parsed);

    connection
        .execute(
            "INSERT INTO profile (id, language, wake_word, address_title) VALUES (1, ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET language = excluded.language, wake_word = excluded.wake_word, address_title = excluded.address_title",
            params![sanitized.language, sanitized.wake_word, sanitized.address_title],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "INSERT INTO preferences (id, overlay_mode, input_device_id, output_device_id) VALUES (1, ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET overlay_mode = excluded.overlay_mode, input_device_id = excluded.input_device_id, output_device_id = excluded.output_device_id",
            params![sanitized.overlay_mode, sanitized.input_device_id, sanitized.output_device_id],
        )
        .map_err(|error| error.to_string())?;

    fs::remove_file(legacy_path).map_err(|error| error.to_string())?;
    Ok(())
}

fn memory_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    config_dir.push(MEMORY_FILE_NAME);
    Ok(config_dir)
}

fn memory_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    config_dir.push(MEMORY_DB_FILE_NAME);
    Ok(config_dir)
}

fn migrate_legacy_memory_file(app: &AppHandle, connection: &Connection) -> Result<(), String> {
    let legacy_path = memory_file_path(app)?;

    if !legacy_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&legacy_path).map_err(|error| error.to_string())?;
    let facts = serde_json::from_str::<Vec<MemoryFact>>(&content).map_err(|error| error.to_string())?;

    for fact in facts {
        connection
            .execute(
                "INSERT INTO memory_facts (key, value, scope, updated_at) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, scope = excluded.scope, updated_at = excluded.updated_at",
                params![fact.key, fact.value, fact.scope, fact.updated_at as i64],
            )
            .map_err(|error| error.to_string())?;
    }

    fs::remove_file(legacy_path).map_err(|error| error.to_string())?;
    Ok(())
}

fn open_memory_db(app: &AppHandle) -> Result<Connection, String> {
    let path = memory_db_path(app)?;
    let connection = Connection::open(path).map_err(|error| error.to_string())?;

    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                language TEXT NOT NULL,
                wake_word TEXT NOT NULL,
                address_title TEXT NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                overlay_mode TEXT NOT NULL,
                input_device_id TEXT NOT NULL,
                output_device_id TEXT NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS memory_facts (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                scope TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS session_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_summary TEXT NOT NULL,
                assistant_summary TEXT NOT NULL,
                tool_summary TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS tool_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tool_name TEXT NOT NULL,
                status TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS device_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_kind TEXT NOT NULL,
                device_id TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;

    migrate_legacy_settings_file(app, &connection)?;
    migrate_legacy_memory_file(app, &connection)?;

    Ok(connection)
}

fn load_memory_facts(app: &AppHandle) -> Result<Vec<MemoryFact>, String> {
    let connection = open_memory_db(app)?;
    let mut statement = connection
        .prepare("SELECT key, value, scope, updated_at FROM memory_facts ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(MemoryFact {
                key: row.get(0)?,
                value: row.get(1)?,
                scope: row.get(2)?,
                updated_at: row.get::<_, i64>(3)? as u64,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut facts = Vec::new();
    for row in rows {
        facts.push(row.map_err(|error| error.to_string())?);
    }

    Ok(facts)
}

fn upsert_memory_fact(app: &AppHandle, fact: &MemoryFact) -> Result<(), String> {
    let connection = open_memory_db(app)?;
    connection
        .execute(
            "INSERT INTO memory_facts (key, value, scope, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, scope = excluded.scope, updated_at = excluded.updated_at",
            params![fact.key, fact.value, fact.scope, fact.updated_at as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn clear_memory_store(app: &AppHandle) -> Result<(), String> {
    let connection = open_memory_db(app)?;
    connection
        .execute("DELETE FROM memory_facts", [])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM session_summaries", [])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM tool_audit_log", [])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM device_history", [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn save_tool_audit_record(app: &AppHandle, tool_name: &str, status: &str, detail: &str) -> Result<(), String> {
    let connection = open_memory_db(app)?;
    connection
        .execute(
            "INSERT INTO tool_audit_log (tool_name, status, detail, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![tool_name, status, detail, current_timestamp() as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn save_device_history_record(app: &AppHandle, device_kind: &str, device_id: &str) -> Result<(), String> {
    let connection = open_memory_db(app)?;
    connection
        .execute(
            "INSERT INTO device_history (device_kind, device_id, created_at) VALUES (?1, ?2, ?3)",
            params![device_kind, device_id, current_timestamp() as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn load_tool_audit_records(app: &AppHandle) -> Result<Vec<ToolAuditRecord>, String> {
    let connection = open_memory_db(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, tool_name, status, detail, created_at FROM tool_audit_log ORDER BY created_at DESC LIMIT 20",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(ToolAuditRecord {
                id: row.get(0)?,
                tool_name: row.get(1)?,
                status: row.get(2)?,
                detail: row.get(3)?,
                created_at: row.get::<_, i64>(4)? as u64,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|error| error.to_string())?);
    }
    Ok(records)
}

fn load_device_history_records(app: &AppHandle) -> Result<Vec<DeviceHistoryRecord>, String> {
    let connection = open_memory_db(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, device_kind, device_id, created_at FROM device_history ORDER BY created_at DESC LIMIT 20",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(DeviceHistoryRecord {
                id: row.get(0)?,
                device_kind: row.get(1)?,
                device_id: row.get(2)?,
                created_at: row.get::<_, i64>(3)? as u64,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|error| error.to_string())?);
    }
    Ok(records)
}

fn save_session_summary_record(
    app: &AppHandle,
    user_summary: &str,
    assistant_summary: &str,
    tool_summary: &str,
) -> Result<(), String> {
    let connection = open_memory_db(app)?;
    connection
        .execute(
            "INSERT INTO session_summaries (user_summary, assistant_summary, tool_summary, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![user_summary, assistant_summary, tool_summary, current_timestamp() as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn load_session_summaries(app: &AppHandle) -> Result<Vec<SessionSummary>, String> {
    let connection = open_memory_db(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, user_summary, assistant_summary, tool_summary, created_at
             FROM session_summaries
             ORDER BY created_at DESC
             LIMIT 10",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(SessionSummary {
                id: row.get(0)?,
                user_summary: row.get(1)?,
                assistant_summary: row.get(2)?,
                tool_summary: row.get(3)?,
                created_at: row.get::<_, i64>(4)? as u64,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut summaries = Vec::new();
    for row in rows {
        summaries.push(row.map_err(|error| error.to_string())?);
    }

    Ok(summaries)
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn write_debug_log(app: &AppHandle, scope: &str, message: &str) {
    let Ok(path) = debug_log_file_path(app) else {
        return;
    };

    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };

    let _ = writeln!(file, "[{}] [{}] {}", current_timestamp(), scope, message);
}

fn read_settings_snapshot(app: &AppHandle) -> Result<Option<UiSettings>, String> {
    let path = settings_snapshot_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<UiSettings>(&content).map_err(|error| error.to_string())?;
    Ok(Some(sanitize_settings(parsed)))
}

fn save_settings_snapshot(app: &AppHandle, settings: &UiSettings) -> Result<(), String> {
    let path = settings_snapshot_file_path(app)?;
    let payload = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

fn load_settings_from_disk(app: &AppHandle) -> Result<UiSettings, String> {
    write_debug_log(app, "settings", "load_settings_from_disk called");
    if let Ok(connection) = open_memory_db(app) {
        let profile_row = connection.query_row(
            "SELECT language, wake_word, address_title FROM profile WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        );

        let preferences_row = connection.query_row(
            "SELECT overlay_mode, input_device_id, output_device_id FROM preferences WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        );

        if let (Ok((language, wake_word, address_title)), Ok((overlay_mode, input_device_id, output_device_id))) = (profile_row, preferences_row) {
            write_debug_log(app, "settings", "loaded settings from sqlite");
            return Ok(sanitize_settings(UiSettings {
                language,
                wake_word,
                address_title,
                overlay_mode,
                input_device_id,
                output_device_id,
            }));
        }
    }

    if let Some(snapshot) = read_settings_snapshot(app)? {
        write_debug_log(app, "settings", "loaded settings from snapshot fallback");
        return Ok(snapshot);
    }

    write_debug_log(app, "settings", "falling back to default settings");
    Ok(UiSettings::default())
}

fn save_settings_to_disk(app: &AppHandle, settings: &UiSettings) -> Result<(), String> {
    write_debug_log(app, "settings", &format!(
        "save_settings language={} wake_word={} overlay_mode={} input={} output={}",
        settings.language,
        settings.wake_word,
        settings.overlay_mode,
        settings.input_device_id,
        settings.output_device_id
    ));
    let snapshot_result = save_settings_snapshot(app, settings);

    let sqlite_result: Result<(), String> = (|| {
        let connection = open_memory_db(app)?;
        connection
            .execute(
                "INSERT INTO profile (id, language, wake_word, address_title) VALUES (1, ?1, ?2, ?3)
                 ON CONFLICT(id) DO UPDATE SET language = excluded.language, wake_word = excluded.wake_word, address_title = excluded.address_title",
                params![settings.language, settings.wake_word, settings.address_title],
            )
            .map_err(|error| error.to_string())?;

        connection
            .execute(
                "INSERT INTO preferences (id, overlay_mode, input_device_id, output_device_id) VALUES (1, ?1, ?2, ?3)
                 ON CONFLICT(id) DO UPDATE SET overlay_mode = excluded.overlay_mode, input_device_id = excluded.input_device_id, output_device_id = excluded.output_device_id",
                params![settings.overlay_mode, settings.input_device_id, settings.output_device_id],
            )
            .map_err(|error| error.to_string())?;

        Ok(())
    })();

    match (snapshot_result, sqlite_result) {
        (Ok(()), _) | (_, Ok(())) => Ok(()),
        (Err(snapshot_error), Err(sqlite_error)) => Err(format!("Не удалось сохранить настройки. snapshot: {}; sqlite: {}", snapshot_error, sqlite_error)),
    }
}

fn api_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USERNAME).map_err(|error| error.to_string())
}

fn read_api_key_from_dotenv() -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(current_dir) = env::current_dir() {
        let mut dir = Some(current_dir.as_path());
        for _ in 0..5 {
            if let Some(path) = dir {
                candidates.push(path.join(".env"));
                dir = path.parent();
            } else {
                break;
            }
        }
    }

    for path in candidates {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        for line in content.lines() {
            if let Some(value) = line.strip_prefix("OPENAI_API_KEY=") {
                let trimmed = value.trim().trim_matches('"').trim_matches('\'');
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }

    None
}

fn read_api_key_from_disk(app: &AppHandle) -> Result<Option<String>, String> {
    let path = api_key_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    Ok(Some(trimmed.to_string()))
}

fn save_api_key_to_disk(app: &AppHandle, api_key: &str) -> Result<(), String> {
    let path = api_key_file_path(app)?;
    fs::write(path, api_key.trim()).map_err(|error| error.to_string())
}

fn mask_api_key(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() <= 10 {
        return "**********".to_string();
    }

    format!("{}...{}", &trimmed[..8], &trimmed[trimmed.len() - 4..])
}

fn hydrate_api_key_from_fallbacks(app: &AppHandle) -> Result<(), String> {
    let entry = api_key_entry()?;

    if let Ok(value) = entry.get_password() {
        if !value.trim().is_empty() {
            return Ok(());
        }
    }

    if let Some(value) = read_api_key_from_disk(app)? {
        write_debug_log(app, "api_key", "hydrated keyring from disk fallback");
        let _ = entry.set_password(&value);
        return Ok(());
    }

    let fallback = env::var("OPENAI_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(read_api_key_from_dotenv);

    if let Some(value) = fallback {
        write_debug_log(app, "api_key", "hydrated key from env or dotenv fallback");
        let _ = entry.set_password(&value);
        save_api_key_to_disk(app, &value)?;
    }

    Ok(())
}

fn load_api_key(app: &AppHandle) -> Result<String, String> {
    let entry = api_key_entry()?;

    if let Ok(value) = entry.get_password() {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            write_debug_log(app, "api_key", "loaded key from keyring");
            return Ok(trimmed.to_string());
        }
    }

    if let Some(value) = read_api_key_from_disk(app)? {
        write_debug_log(app, "api_key", "loaded key from disk fallback");
        let _ = entry.set_password(&value);
        return Ok(value);
    }

    if let Ok(value) = env::var("OPENAI_API_KEY") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            write_debug_log(app, "api_key", "loaded key from process environment");
            return Ok(trimmed.to_string());
        }
    }

    if let Some(value) = read_api_key_from_dotenv() {
        write_debug_log(app, "api_key", "loaded key from dotenv fallback");
        return Ok(value);
    }

    Err("Ключ не найден. Сохраните его в настройках или передайте через OPENAI_API_KEY.".to_string())
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

#[tauri::command]
fn hide_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.hide().map_err(|error| error.to_string())?;
    }

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
    let previous = load_settings_from_disk(&app).unwrap_or_default();
    let sanitized = sanitize_settings(settings);
    save_settings_to_disk(&app, &sanitized)?;

    if previous.input_device_id != sanitized.input_device_id {
        save_device_history_record(&app, "input", &sanitized.input_device_id)?;
    }

    if previous.output_device_id != sanitized.output_device_id {
        save_device_history_record(&app, "output", &sanitized.output_device_id)?;
    }

    Ok(sanitized)
}

#[tauri::command]
fn api_key_status(app: AppHandle) -> Result<bool, String> {
    Ok(load_api_key(&app).map(|value| !value.trim().is_empty()).unwrap_or(false))
}

#[tauri::command]
fn api_key_preview(app: AppHandle) -> Result<Option<String>, String> {
    match load_api_key(&app) {
        Ok(value) if !value.trim().is_empty() => Ok(Some(mask_api_key(&value))),
        Ok(_) => Ok(None),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn save_api_key(app: AppHandle, api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    let keyring_result = api_key_entry()?.set_password(trimmed).map_err(|error| error.to_string());
    let disk_result = save_api_key_to_disk(&app, trimmed);

    match (keyring_result, disk_result) {
        (Ok(_), Ok(_)) | (Ok(_), Err(_)) | (Err(_), Ok(_)) => {
            write_debug_log(&app, "api_key", "saved key to persistent storage");
            Ok(())
        }
        (Err(keyring_error), Err(disk_error)) => Err(format!(
            "Не удалось сохранить ключ ни в keyring, ни в локальное хранилище: {}; {}",
            keyring_error, disk_error
        )),
    }
}

#[tauri::command]
fn create_realtime_session(app: AppHandle, offer_sdp: String) -> Result<RealtimeSessionInitResult, String> {
    write_debug_log(&app, "realtime", "create_realtime_session called");
    let key = load_api_key(&app)?;

    if key.trim().is_empty() {
        return Err("Ключ пустой. Сохраните его в настройках или передайте через OPENAI_API_KEY.".to_string());
    }

    if offer_sdp.trim().is_empty() {
        return Err("Браузер не передал описание соединения для голосового канала.".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .build()
        .map_err(|error| error.to_string())?;

    let session = json!({
        "type": "realtime",
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
    });

    let form = multipart::Form::new()
        .text("sdp", offer_sdp)
        .text("session", session.to_string());

    let response = client
        .post(format!("https://api.openai.com/v1/realtime/calls?model={}", REALTIME_MODEL))
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
        write_debug_log(&app, "realtime", &format!("create_realtime_session failed: {}", message));
        return Err(message);
    }

    write_debug_log(&app, "realtime", "create_realtime_session succeeded");

    Ok(RealtimeSessionInitResult {
        model: REALTIME_MODEL.to_string(),
        voice: REALTIME_VOICE.to_string(),
        answer_sdp: body_text,
    })
}

#[tauri::command]
fn verify_api_key(app: AppHandle) -> Result<ApiKeyCheckResult, String> {
    write_debug_log(&app, "api_key", "verify_api_key called");
    let key = load_api_key(&app)?;

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
        write_debug_log(&app, "api_key", "verify_api_key succeeded");
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

    write_debug_log(&app, "api_key", &format!("verify_api_key failed: {}", message));

    Ok(ApiKeyCheckResult { ok: false, message })
}

#[tauri::command]
fn log_debug_event(app: AppHandle, scope: String, message: String) -> Result<(), String> {
    write_debug_log(&app, scope.trim(), message.trim());
    Ok(())
}

#[tauri::command]
fn search_web(app: AppHandle, query: String, intent: Option<String>) -> Result<SearchWebResult, String> {
    let key = load_api_key(&app)?;

    if key.trim().is_empty() {
        return Err("Ключ пустой. Сохраните его в настройках или передайте через OPENAI_API_KEY.".to_string());
    }

    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Err("Нужно передать запрос для поиска.".to_string());
    }

    let search_context_size = match intent.as_deref() {
        Some("research") | Some("news") => "high",
        _ => "medium",
    };

    let prompt = format!(
        "Search the web for this request and answer in concise Russian. Request: {}",
        trimmed_query
    );

    let client = reqwest::blocking::Client::builder()
        .build()
        .map_err(|error| error.to_string())?;

    let body = json!({
        "model": "gpt-4.1-mini",
        "input": prompt,
        "tools": [
            {
                "type": "web_search_preview",
                "search_context_size": search_context_size
            }
        ]
    });

    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(key.trim())
        .json(&body)
        .send()
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let payload: serde_json::Value = response.json().map_err(|error| error.to_string())?;

    if !status.is_success() {
        let message = payload
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(|message| message.as_str())
            .unwrap_or("Не удалось выполнить поиск в интернете.")
            .to_string();
        return Err(message);
    }

    let mut summary = payload
        .get("output_text")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    let mut sources: Vec<SearchSource> = Vec::new();

    if let Some(output_items) = payload.get("output").and_then(|value| value.as_array()) {
        for item in output_items {
            if let Some(content_items) = item.get("content").and_then(|value| value.as_array()) {
                for content in content_items {
                    if summary.is_empty() {
                        if let Some(text) = content.get("text").and_then(|value| value.as_str()) {
                            summary = text.trim().to_string();
                        }
                    }

                    if let Some(annotations) = content.get("annotations").and_then(|value| value.as_array()) {
                        for annotation in annotations {
                            if annotation.get("type").and_then(|value| value.as_str()) != Some("url_citation") {
                                continue;
                            }

                            let title = annotation
                                .get("title")
                                .and_then(|value| value.as_str())
                                .unwrap_or("Источник")
                                .to_string();
                            let url = annotation
                                .get("url")
                                .and_then(|value| value.as_str())
                                .unwrap_or_default()
                                .to_string();

                            if !url.is_empty() && !sources.iter().any(|source| source.url == url) {
                                sources.push(SearchSource { title, url });
                            }
                        }
                    }
                }
            }
        }
    }

    if summary.is_empty() {
        summary = "Поиск завершен, но короткий итог не получен.".to_string();
    }

    sources.truncate(5);

    Ok(SearchWebResult { summary, sources })
}

#[tauri::command]
fn remember_fact(app: AppHandle, key: String, value: String, scope: Option<String>) -> Result<RememberFactResult, String> {
    let normalized_key = key.trim().to_lowercase();
    let normalized_value = value.trim().to_string();
    let normalized_scope = scope
        .unwrap_or_else(|| "preference".to_string())
        .trim()
        .to_lowercase();

    if normalized_key.is_empty() || normalized_value.is_empty() {
        return Err("Для памяти нужны и ключ, и значение.".to_string());
    }

    let fact = MemoryFact {
        key: normalized_key.clone(),
        value: normalized_value,
        scope: normalized_scope,
        updated_at: current_timestamp(),
    };

    upsert_memory_fact(&app, &fact)?;

    Ok(RememberFactResult {
        ok: true,
        message: format!("Запомнил {}.", fact.key),
        fact,
    })
}

#[tauri::command]
fn recall_fact(app: AppHandle, query: String) -> Result<RecallFactResult, String> {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
        return Err("Для поиска по памяти нужен запрос.".to_string());
    }

    let mut facts = load_memory_facts(&app)?;
    facts.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

    let matches: Vec<MemoryFact> = facts
        .into_iter()
        .filter(|fact| {
            fact.key.contains(&normalized_query)
                || fact.value.to_lowercase().contains(&normalized_query)
                || fact.scope.contains(&normalized_query)
        })
        .take(5)
        .collect();

    let message = if matches.is_empty() {
        "Подходящие факты не найдены.".to_string()
    } else {
        format!("Нашел {} фактов.", matches.len())
    };

    Ok(RecallFactResult {
        ok: true,
        message,
        matches,
    })
}

#[tauri::command]
fn list_memory_facts(app: AppHandle) -> Result<Vec<MemoryFact>, String> {
    let mut facts = load_memory_facts(&app)?;
    facts.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(facts)
}

#[tauri::command]
fn clear_memory_facts(app: AppHandle) -> Result<ClearMemoryResult, String> {
    clear_memory_store(&app)?;
    Ok(ClearMemoryResult {
        ok: true,
        message: "Локальная память очищена.".to_string(),
    })
}

#[tauri::command]
fn save_session_summary(
    app: AppHandle,
    user_summary: String,
    assistant_summary: String,
    tool_summary: String,
) -> Result<(), String> {
    let user_summary = user_summary.trim();
    let assistant_summary = assistant_summary.trim();
    let tool_summary = tool_summary.trim();

    if user_summary.is_empty() && assistant_summary.is_empty() && tool_summary.is_empty() {
        return Ok(());
    }

    save_session_summary_record(&app, user_summary, assistant_summary, tool_summary)
}

#[tauri::command]
fn list_session_summaries(app: AppHandle) -> Result<Vec<SessionSummary>, String> {
    load_session_summaries(&app)
}

#[tauri::command]
fn log_tool_audit(app: AppHandle, tool_name: String, status: String, detail: String) -> Result<(), String> {
    save_tool_audit_record(&app, tool_name.trim(), status.trim(), detail.trim())
}

#[tauri::command]
fn list_tool_audit_logs(app: AppHandle) -> Result<Vec<ToolAuditRecord>, String> {
    load_tool_audit_records(&app)
}

#[tauri::command]
fn list_device_history(app: AppHandle) -> Result<Vec<DeviceHistoryRecord>, String> {
    load_device_history_records(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            hydrate_api_key_from_fallbacks(&app.handle().clone())?;
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts([GLOBAL_ACTIVATION_SHORTCUT])?
                    .with_handler(|app, shortcut, event| {
                        if event.state == ShortcutState::Pressed
                            && shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyJ)
                        {
                            focus_window(app, "overlay");
                            let _ = app.emit_to("overlay", "jarvis://hotkey-activate", true);
                        }
                    })
                    .build(),
            )?;
            ensure_settings_window(&app.handle().clone())?;
            build_tray(&app.handle().clone())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_settings_window,
            hide_settings_window,
            load_settings,
            save_settings,
            api_key_status,
            api_key_preview,
            save_api_key,
            verify_api_key,
            log_debug_event,
            create_realtime_session,
            search_web,
            remember_fact,
            recall_fact,
            list_memory_facts,
            clear_memory_facts,
            save_session_summary,
            list_session_summaries,
            log_tool_audit,
            list_tool_audit_logs,
            list_device_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
