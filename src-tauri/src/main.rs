#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod data;
mod player;
mod windowing;
use std::sync::atomic::Ordering;
use tauri::Manager;
fn main() {
    tauri::Builder::default()
        .manage(data::DataService::new())
        .manage(player::PlayerService::new())
        .manage(windowing::VideoHost::new())
        .invoke_handler(tauri::generate_handler![
            data::fetch_schedule,
            data::fetch_stats,
            player::player_info,
            player::player_load,
            player::player_state,
            player::player_control,
            windowing::set_video_rect,
            windowing::set_window_overlay,
            windowing::window_action,
            windowing::toggle_fullscreen
        ])
        .setup(|app| {
            #[cfg(windows)]
            {
                let window = app
                    .get_webview_window("main")
                    .ok_or("Missing main window")?;
                let hwnd = window.hwnd()?.0 as isize;
                windowing::native::install(app.handle().clone(), hwnd);
                let video = windowing::create(hwnd)?;
                app.state::<windowing::VideoHost>()
                    .handle
                    .store(video, Ordering::Relaxed);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Application initialization failed")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<player::PlayerService>().shutdown();
            }
        });
}
