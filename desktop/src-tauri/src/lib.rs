#![recursion_limit = "256"]

pub mod apple_time;
mod audio;
pub mod calendar;
mod credentials;
pub mod dictionary;
pub mod integration;
pub mod meeting_audio;
pub mod meetings;
mod migrate;
pub mod notes;
mod platform;
pub mod provider;
pub mod shortcuts;
pub mod storage;
pub mod summary;
mod tray;

use serde::Serialize;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingResult {
    path: String,
    duration: f64,
}

#[tauri::command]
fn list_audio_inputs() -> Result<Vec<audio::AudioInput>, String> {
    audio::inputs()
}

#[tauri::command]
fn start_recording(
    app: tauri::AppHandle,
    state: tauri::State<audio::RecorderState>,
    device_id: Option<String>,
) -> Result<String, String> {
    let activity = app.state::<integration::ActivityState>();
    let _start = activity.start_gate()?;
    let (id, busy) = meetings::capture_status(&app)?;
    if id.is_some() || busy {
        return Err("Finish the meeting before starting dictation.".into());
    }
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("Recordings");
    audio::start(&state, device_id, root, app.clone())
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn stop_recording(state: tauri::State<audio::RecorderState>) -> Result<RecordingResult, String> {
    let (path, duration) = audio::stop(&state)?;
    Ok(RecordingResult {
        path: path.to_string_lossy().to_string(),
        duration,
    })
}

#[tauri::command]
fn delete_recording(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let recordings = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("Recordings");
    let target = PathBuf::from(path);
    let recordings = recordings
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let target = target.canonicalize().map_err(|error| error.to_string())?;
    if !target.starts_with(&recordings) {
        return Err("OpenScribe can only remove its own recordings.".into());
    }
    std::fs::remove_file(target).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_credential(account: String, secret: String) -> Result<(), String> {
    credentials::save(&account, &secret)
}

#[tauri::command]
fn has_credential(account: String) -> Result<bool, String> {
    credentials::read(&account).map(|value| value.is_some())
}

#[tauri::command]
fn remove_credential(account: String) -> Result<(), String> {
    credentials::remove(&account)
}

#[tauri::command]
async fn transcribe_recording(
    app: tauri::AppHandle,
    path: String,
    config: provider::ProviderConfig,
    hints: Option<provider::SpeechHints>,
) -> Result<provider::ProviderResult, String> {
    let _work = integration::dictation_work(&app)?;
    let hints = match hints {
        Some(hints) => Some(hints),
        None => storage::with_profile(&app, &app.state::<storage::ProfileState>(), |s| {
            // The command's provider/model may come from a recovery job snapshot.
            Ok(Some(integration::hints_for_provider(
                &s.settings,
                &config.provider,
                &config.model,
            )))
        })?,
    };
    provider::transcribe(&PathBuf::from(path), &config, hints.as_ref()).await
}

#[tauri::command]
async fn clean_transcript(
    app: tauri::AppHandle,
    text: String,
    config: provider::ProviderConfig,
    instruction: String,
) -> Result<provider::ProviderResult, String> {
    let _work = integration::dictation_work(&app)?;
    provider::clean(&text, &config, &instruction).await
}

#[tauri::command]
fn paste_keystroke() -> Result<(), String> {
    platform::paste_keystroke()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(audio::RecorderState::default())
        .manage(storage::ProfileState::default())
        .manage(meetings::MeetingState::default())
        .manage(shortcuts::ShortcutManager::default())
        .manage(calendar::CalendarState::default())
        .manage(integration::ActivityState::default())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            integration::install(app.handle()).map_err(std::io::Error::other)?;
            tray::install(app.handle())?;
            calendar::boot(app.handle().clone());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("openscribe-ready", ());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if matches!(window.label(), "main" | "meeting-notes") {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_audio_inputs,
            start_recording,
            stop_recording,
            delete_recording,
            save_credential,
            has_credential,
            remove_credential,
            transcribe_recording,
            clean_transcript,
            paste_keystroke,
            storage::load_profile,
            storage::save_settings,
            storage::save_note,
            storage::delete_note,
            storage::add_capture,
            storage::update_capture,
            storage::remove_capture,
            storage::attachment_path,
            meetings::list_meetings,
            meetings::start_meeting,
            meetings::pause_meeting,
            meetings::resume_meeting,
            meetings::finish_meeting,
            meetings::process_meeting,
            meetings::summarize_short_meeting,
            meetings::skip_summary,
            meetings::retry_live_transcription,
            meetings::cancel_processing,
            meetings::update_meeting,
            meetings::delete_meeting,
            meetings::export_meeting_markdown,
            meetings::meeting_audio_path,
            integration::apply_dictionary,
            integration::set_dictation_busy,
            shortcuts::register_shortcuts,
            shortcuts::suspend_shortcuts,
            calendar::calendar_refresh,
            calendar::calendar_decision
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenScribe");
}
