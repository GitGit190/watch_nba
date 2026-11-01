use serde::Deserialize;
use std::sync::atomic::{AtomicIsize, Ordering};
use tauri::{AppHandle, Manager, State};
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub visible: bool,
    #[serde(default)]
    pub clip_top: i32,
    #[serde(default)]
    pub clip_bottom: i32,
}
pub struct VideoHost {
    pub handle: AtomicIsize,
}
impl VideoHost {
    pub fn new() -> Self {
        Self {
            handle: AtomicIsize::new(0),
        }
    }
}
#[cfg(windows)]
pub fn create(parent: isize) -> Result<isize, String> {
    use windows_sys::Win32::{System::LibraryLoader::GetModuleHandleW, UI::WindowsAndMessaging::*};
    let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
    let title: Vec<u16> = "Courtside video\0".encode_utf16().collect();
    let handle = unsafe {
        CreateWindowExW(
            0,
            class.as_ptr(),
            title.as_ptr(),
            WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN | 0x00000004, /* SS_BLACKRECT */
            0,
            0,
            1,
            1,
            parent as _,
            std::ptr::null_mut(),
            GetModuleHandleW(std::ptr::null()),
            std::ptr::null(),
        )
    };
    if handle.is_null() {
        Err("Couldn't create the native video surface.".into())
    } else {
        Ok(handle as isize)
    }
}
#[cfg(windows)]
fn position(handle: isize, r: &VideoRect) {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    unsafe {
        if r.visible && r.width > 0 && r.height > 0 {
            let region = windows_sys::Win32::Graphics::Gdi::CreateRectRgn(
                0,
                r.clip_top.max(0),
                r.width,
                (r.height - r.clip_bottom).max(r.clip_top),
            );
            if !region.is_null() {
                if windows_sys::Win32::Graphics::Gdi::SetWindowRgn(handle as _, region, 1) == 0 {
                    windows_sys::Win32::Graphics::Gdi::DeleteObject(region as _);
                }
            }
            SetWindowPos(
                handle as _,
                HWND_TOP,
                r.x,
                r.y,
                r.width,
                r.height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        } else {
            ShowWindow(handle as _, SW_HIDE);
        }
    }
}
#[tauri::command]
pub async fn set_video_rect(
    app: AppHandle,
    state: State<'_, VideoHost>,
    rect: VideoRect,
) -> Result<(), String> {
    let hwnd = state.handle.load(Ordering::Relaxed);
    if hwnd == 0 {
        return Ok(());
    }
    app.run_on_main_thread(move || {
        #[cfg(windows)]
        position(hwnd, &rect);
    })
    .map_err(|_| "Couldn't update the video layout.".into())
}
#[tauri::command]
pub async fn toggle_fullscreen(app: AppHandle, exit_only: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Window unavailable")?;
    let full = window.is_fullscreen().map_err(|e| e.to_string())?;
    window
        .set_fullscreen(if exit_only { false } else { !full })
        .map_err(|e| e.to_string())
}
