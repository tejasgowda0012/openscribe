mod audio;
mod credentials;
mod platform;
pub mod provider;
pub mod apple_time;
pub mod storage;
pub mod notes;
pub mod meetings;
pub mod meeting_audio;
pub mod summary;
mod migrate;

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
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("Recordings");
    audio::start(&state, device_id, root, app).map(|path| path.to_string_lossy().to_string())
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
    path: String,
    config: provider::ProviderConfig,
    hints: Option<provider::SpeechHints>,
) -> Result<provider::ProviderResult, String> {
    provider::transcribe(&PathBuf::from(path), &config, hints.as_ref()).await
}

#[tauri::command]
async fn clean_transcript(
    text: String,
    config: provider::ProviderConfig,
    instruction: String,
) -> Result<provider::ProviderResult, String> {
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
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("openscribe-ready", ());
            }
            Ok(())
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
            meetings::meeting_audio_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenScribe");
}
