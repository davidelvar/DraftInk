use serde::Serialize;
use tauri::{Emitter, Listener, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to DraftInk.", name)
}

#[tauri::command]
fn write_file(path: &str, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: &str, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_contents(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary_file(path: &str) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| e.to_string())
}

/// Returns the path to the boards directory, creating it if needed.
fn get_boards_dir() -> Result<std::path::PathBuf, String> {
    let base = dirs::document_dir()
        .or_else(|| dirs::home_dir())
        .ok_or_else(|| "Cannot determine documents directory".to_string())?;
    let boards_dir = base.join("DraftInk").join("boards");
    if !boards_dir.exists() {
        std::fs::create_dir_all(&boards_dir).map_err(|e| e.to_string())?;
    }
    Ok(boards_dir)
}

#[tauri::command]
fn get_boards_directory() -> Result<String, String> {
    let dir = get_boards_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

#[derive(Serialize)]
struct BoardFileInfo {
    path: String,
    name: String,
    last_modified: u64,
}

#[tauri::command]
fn list_board_files() -> Result<Vec<BoardFileInfo>, String> {
    let boards_dir = get_boards_dir()?;
    let mut files = Vec::new();
    let entries = std::fs::read_dir(&boards_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("inkboard") {
            let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            let modified = meta
                .modified()
                .map_err(|e| e.to_string())?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_secs();
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();
            files.push(BoardFileInfo {
                path: path.to_string_lossy().to_string(),
                name,
                last_modified: modified,
            });
        }
    }
    // Sort newest first
    files.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(files)
}

#[tauri::command]
fn delete_board_file(path: &str) -> Result<(), String> {
    let file_path = std::path::Path::new(path);
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }
    // Safety: only allow deleting .inkboard files inside the boards directory
    let boards_dir = get_boards_dir()?;
    let canonical_file = file_path.canonicalize().map_err(|e| e.to_string())?;
    let canonical_dir = boards_dir.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_file.starts_with(&canonical_dir) {
        return Err("Cannot delete files outside the boards directory".to_string());
    }
    if canonical_file.extension().and_then(|e| e.to_str()) != Some("inkboard") {
        return Err("Can only delete .inkboard files".to_string());
    }
    std::fs::remove_file(&canonical_file).map_err(|e| e.to_string())
}

#[tauri::command]
fn ensure_directory(path: &str) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// Returns the path to the custom templates directory, creating it if needed.
fn get_templates_dir() -> Result<std::path::PathBuf, String> {
    let boards_dir = get_boards_dir()?;
    let templates_dir = boards_dir.join("templates");
    if !templates_dir.exists() {
        std::fs::create_dir_all(&templates_dir).map_err(|e| e.to_string())?;
    }
    Ok(templates_dir)
}

#[tauri::command]
fn list_template_files() -> Result<Vec<BoardFileInfo>, String> {
    let templates_dir = get_templates_dir()?;
    let mut files = Vec::new();
    let entries = match std::fs::read_dir(&templates_dir) {
        Ok(e) => e,
        Err(_) => return Ok(files),
    };
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("inkboard") {
            let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            let modified = meta
                .modified()
                .map_err(|e| e.to_string())?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_secs();
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Template")
                .to_string();
            files.push(BoardFileInfo {
                path: path.to_string_lossy().to_string(),
                name,
                last_modified: modified,
            });
        }
    }
    files.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(files)
}

#[tauri::command]
fn delete_template_file(path: &str) -> Result<(), String> {
    let file_path = std::path::Path::new(path);
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }
    let templates_dir = get_templates_dir()?;
    let canonical_file = file_path.canonicalize().map_err(|e| e.to_string())?;
    let canonical_dir = templates_dir.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_file.starts_with(&canonical_dir) {
        return Err("Cannot delete files outside the templates directory".to_string());
    }
    if canonical_file.extension().and_then(|e| e.to_str()) != Some("inkboard") {
        return Err("Can only delete .inkboard files".to_string());
    }
    std::fs::remove_file(&canonical_file).map_err(|e| e.to_string())
}

/// Build the tray menu, including a dynamic "Open Recent" submenu.
fn build_tray_menu(app: &tauri::AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let recent_sub = {
        let mut builder = SubmenuBuilder::new(app, "Open Recent");
        match list_board_files() {
            Ok(files) => {
                let items: Vec<_> = files.into_iter().take(8).collect();
                if items.is_empty() {
                    builder = builder.item(
                        &MenuItemBuilder::with_id("recent_none", "No recent boards")
                            .enabled(false)
                            .build(app)?,
                    );
                } else {
                    for file in items {
                        builder = builder.item(
                            &MenuItemBuilder::with_id(
                                format!("recent_{}", file.path),
                                &file.name,
                            )
                            .build(app)?,
                        );
                    }
                }
            }
            Err(_) => {
                builder = builder.item(
                    &MenuItemBuilder::with_id("recent_none", "No recent boards")
                        .enabled(false)
                        .build(app)?,
                );
            }
        }
        builder.build()?
    };

    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("new_board", "New Board").build(app)?)
        .item(&recent_sub)
        .separator()
        .item(&MenuItemBuilder::with_id("toggle_window", "Show / Hide Window").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("quit", "Quit DraftInk").build(app)?)
        .build()?;

    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();
            let icon_bytes = include_bytes!("../icons/icon.png");
            let icon = tauri::image::Image::from_bytes(icon_bytes).expect("Failed to load icon");
            main_window.set_icon(icon.clone()).expect("Failed to set window icon");

            // ── System tray ──────────────────────────────────
            let handle = app.handle().clone();
            let tray_menu = build_tray_menu(&handle)
                .expect("Failed to build tray menu");

            TrayIconBuilder::with_id("draftink-tray")
                .icon(icon)
                .tooltip("DraftInk")
                .menu(&tray_menu)
                .on_menu_event(move |app_handle, event| {
                    let id = event.id().as_ref();

                    if id == "new_board" {
                        let _ = app_handle.emit("tray-new-board", ());
                        // Show & focus the window
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    } else if id == "toggle_window" {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    } else if id == "quit" {
                        app_handle.exit(0);
                    } else if let Some(path) = id.strip_prefix("recent_") {
                        let _ = app_handle.emit("tray-open-board", path.to_string());
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, tauri::tray::TrayIconEvent::Click { .. }) {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Listen for refresh-tray-menu events from the frontend
            let handle2 = app.handle().clone();
            app.listen("refresh-tray-menu", move |_| {
                if let Ok(new_menu) = build_tray_menu(&handle2) {
                    // Update the first (only) tray icon's menu
                    if let Some(tray) = handle2.tray_by_id("draftink-tray") {
                        let _ = tray.set_menu(Some(new_menu));
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            write_file,
            write_binary_file,
            read_file_contents,
            read_binary_file,
            get_boards_directory,
            list_board_files,
            delete_board_file,
            ensure_directory,
            list_template_files,
            delete_template_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
