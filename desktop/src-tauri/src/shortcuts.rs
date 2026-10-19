use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    sync::Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const ACTIONS: [&str; 7] = [
    "dictate",
    "holdToTalk",
    "meeting",
    "screenshotArea",
    "screenshotWindow",
    "screenshotScreen",
    "pasteLast",
];
#[derive(Clone, Debug, Deserialize)]
pub struct Binding {
    pub accelerator: String,
    #[serde(default)]
    pub display: String,
}
pub type Bindings = BTreeMap<String, Binding>;
#[derive(Default)]
pub struct ShortcutManager(Mutex<Registration>);
#[derive(Default)]
struct Registration {
    bindings: Bindings,
    suspended: bool,
    pressed: HashSet<String>,
}
#[derive(Clone, Serialize)]
struct ActionEvent {
    action: String,
    state: &'static str,
}
fn parse(accelerator: &str) -> Result<Shortcut, String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|_| "Choose a valid shortcut with modifiers and one key.".to_string())?;
    if shortcut.mods.is_empty() || shortcut.mods.contains(Modifiers::SUPER) {
        return Err(
            "Choose Ctrl, Alt or Shift with one key; Windows-key combinations are reserved.".into(),
        );
    }
    for reserved in [
        "Alt+Space",
        "Alt+F4",
        "Alt+Tab",
        "Ctrl+Alt+Delete",
        "Ctrl+Escape",
        "Ctrl+Shift+Escape",
    ] {
        if reserved
            .parse::<Shortcut>()
            .is_ok_and(|s| s.id() == shortcut.id())
        {
            return Err("This shortcut is reserved by Windows.".into());
        }
    }
    Ok(shortcut)
}
pub fn validate(bindings: &Bindings) -> Result<(), String> {
    let mut ids = HashSet::new();
    for (action, binding) in bindings {
        if !ACTIONS.contains(&action.as_str()) {
            return Err("Unknown shortcut action.".into());
        }
        if !ids.insert(parse(&binding.accelerator)?.id()) {
            return Err("Two actions use the same shortcut.".into());
        }
    }
    Ok(())
}
fn install(app: &tauri::AppHandle, bindings: &Bindings) -> Result<(), String> {
    for (action, binding) in bindings {
        let shortcut = parse(&binding.accelerator)?;
        let action = action.clone();
        app.global_shortcut()
            .on_shortcut(shortcut, move |app, _, event| {
                let state = app.state::<ShortcutManager>();
                let Ok(mut registration) = state.0.lock() else {
                    return;
                };
                if registration.suspended {
                    return;
                }
                let pressed = event.state() == ShortcutState::Pressed;
                let changed = if pressed {
                    registration.pressed.insert(action.clone())
                } else {
                    registration.pressed.remove(&action)
                };
                if changed {
                    let _ = app.emit(
                        "shortcut://action",
                        ActionEvent {
                            action: action.clone(),
                            state: if pressed { "pressed" } else { "released" },
                        },
                    );
                }
            })
            .map_err(|_| {
                format!(
                    "Could not register {action_name}. Another app may be using its shortcut.",
                    action_name = binding.display
                )
            })?;
    }
    Ok(())
}
fn release_pressed(app: &tauri::AppHandle, registration: &mut Registration) {
    for action in registration.pressed.drain() {
        let _ = app.emit(
            "shortcut://action",
            ActionEvent {
                action,
                state: "released",
            },
        );
    }
}
#[tauri::command]
pub fn register_shortcuts(
    app: tauri::AppHandle,
    state: tauri::State<ShortcutManager>,
    bindings: Bindings,
) -> Result<(), String> {
    validate(&bindings)?;
    let mut registration = state.0.lock().map_err(|_| "Shortcut settings are busy.")?;
    if registration.suspended {
        registration.bindings = bindings;
        return Ok(());
    }
    app.global_shortcut()
        .unregister_all()
        .map_err(|_| "Could not release the previous shortcuts.")?;
    release_pressed(&app, &mut registration);
    if let Err(error) = install(&app, &bindings) {
        let _ = app.global_shortcut().unregister_all();
        if install(&app, &registration.bindings).is_err() {
            return Err(format!(
                "{error} Previous shortcuts could not be restored; assign them again in Settings."
            ));
        }
        return Err(error);
    }
    registration.bindings = bindings;
    Ok(())
}
#[tauri::command]
pub fn suspend_shortcuts(
    app: tauri::AppHandle,
    state: tauri::State<ShortcutManager>,
    suspended: bool,
) -> Result<(), String> {
    let mut registration = state.0.lock().map_err(|_| "Shortcut settings are busy.")?;
    if registration.suspended == suspended {
        return Ok(());
    }
    if suspended {
        app.global_shortcut()
            .unregister_all()
            .map_err(|_| "Could not suspend shortcuts.")?;
        release_pressed(&app, &mut registration);
    } else if let Err(error) = install(&app, &registration.bindings) {
        let _ = app.global_shortcut().unregister_all();
        return Err(error);
    }
    registration.suspended = suspended;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn bindings(pairs: &[(&str, &str)]) -> Bindings {
        pairs
            .iter()
            .map(|(a, k)| {
                (
                    a.to_string(),
                    Binding {
                        accelerator: k.to_string(),
                        display: k.to_string(),
                    },
                )
            })
            .collect()
    }
    #[test]
    fn detects_conflicts_and_reserved_keys() {
        assert!(validate(&bindings(&[
            ("dictate", "Ctrl+Alt+Space"),
            ("meeting", "Alt+Control+Space")
        ]))
        .is_err());
        for key in [
            "Alt+Space",
            "Super+M",
            "A",
            "Ctrl+Alt+Delete",
            "Alt+F4",
            "Ctrl+Shift+Escape",
        ] {
            assert!(validate(&bindings(&[("dictate", key)])).is_err(), "{key}");
        }
        assert!(validate(&bindings(&[("missing", "Ctrl+Alt+M")])).is_err());
    }
    #[test]
    fn all_actions_have_distinct_windows_defaults() {
        assert!(validate(&bindings(&[
            ("dictate", "Ctrl+Alt+Space"),
            ("holdToTalk", "Ctrl+Alt+H"),
            ("meeting", "Ctrl+Alt+M"),
            ("screenshotArea", "Ctrl+Alt+4"),
            ("screenshotWindow", "Ctrl+Alt+5"),
            ("screenshotScreen", "Ctrl+Alt+3"),
            ("pasteLast", "Ctrl+Alt+V")
        ]))
        .is_ok());
    }
}
