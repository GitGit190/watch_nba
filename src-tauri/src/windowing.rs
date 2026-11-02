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
    pub clip_right: i32,
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
    native::set_active(r.visible);
    unsafe {
        if r.visible && r.width > 0 && r.height > 0 {
            let region = windows_sys::Win32::Graphics::Gdi::CreateRectRgn(
                0,
                r.clip_top.max(0),
                (r.width - r.clip_right).max(0),
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
    let next = !exit_only && !full;
    #[cfg(windows)]
    native::RATIO_SUSPENDED.store(next, Ordering::Relaxed);
    window.set_fullscreen(next).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn window_action(app: AppHandle, action: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Window unavailable")?;
    #[cfg(windows)]
    if action == "reveal" {
        native::reveal_navigation();
        return Ok(());
    }
    match action.as_str() {
        "close" => window.close(),
        "minimize" => window.minimize(),
        "drag" => window.start_dragging(),
        "fit" => {
            #[cfg(windows)]
            native::RATIO_SUSPENDED.store(false, Ordering::Relaxed);
            if window.is_fullscreen().map_err(|e| e.to_string())? {
                window.set_fullscreen(false).map_err(|e| e.to_string())?;
            }
            if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
                let area = monitor.work_area();
                let width = area.size.width.min(area.size.height * 16 / 9);
                let height = width * 9 / 16;
                window
                    .set_size(tauri::PhysicalSize::new(width, height))
                    .map_err(|e| e.to_string())?;
                window.set_position(tauri::PhysicalPosition::new(
                    area.position.x + ((area.size.width - width) / 2) as i32,
                    area.position.y + ((area.size.height - height) / 2) as i32,
                ))
            } else {
                return Err("Monitor unavailable".into());
            }
        }
        _ => return Err("Unknown window action".into()),
    }
    .map_err(|e| e.to_string())
}

#[cfg(windows)]
pub mod native {
    use super::*;
    use std::sync::{atomic::AtomicBool, Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use windows_sys::Win32::{Foundation::*, UI::WindowsAndMessaging::*};
    static APP: OnceLock<AppHandle> = OnceLock::new();
    static PREVIOUS: AtomicIsize = AtomicIsize::new(0);
    pub static RATIO_SUSPENDED: AtomicBool = AtomicBool::new(false);
    pub static VIDEO_VISIBLE: AtomicBool = AtomicBool::new(false);
    struct Hover {
        point: (i32, i32),
        last: Instant,
        shown: bool,
    }
    static HOVER: OnceLock<Mutex<Hover>> = OnceLock::new();
    const HOVER_TIMER: usize = 0x4353;

    pub fn install(app: AppHandle, hwnd: isize) {
        APP.set(app).ok();
        HOVER
            .set(Mutex::new(Hover {
                point: (0, 0),
                last: Instant::now(),
                shown: true,
            }))
            .ok();
        unsafe {
            PREVIOUS.store(
                SetWindowLongPtrW(hwnd as _, GWLP_WNDPROC, procedure as *const () as isize),
                Ordering::Relaxed,
            );
        }
    }
    pub fn set_active(active: bool) {
        if VIDEO_VISIBLE.swap(active, Ordering::Relaxed) == active {
            return;
        }
        if let Some(app) = APP.get() {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        if active {
                            SetTimer(hwnd.0 as _, HOVER_TIMER, 100, None);
                        } else {
                            KillTimer(hwnd.0 as _, HOVER_TIMER);
                        }
                    }
                }
            }
        }
        if active {
            reveal_navigation();
        }
    }
    pub fn reveal_navigation() {
        if let Some(state) = HOVER.get() {
            if let Ok(mut state) = state.lock() {
                state.shown = true;
                state.last = Instant::now();
            }
        }
        if let Some(app) = APP.get() {
            let _ = app.emit("navigation-visible", true);
        }
    }
    unsafe extern "system" fn procedure(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        if msg == WM_WINDOWPOSCHANGING
            && !RATIO_SUSPENDED.load(Ordering::Relaxed)
            && IsIconic(hwnd) == 0
        {
            let position = &mut *(l as *mut WINDOWPOS);
            if position.flags & SWP_NOSIZE == 0 && position.cx > 0 && position.cy > 0 {
                position.cy = (position.cx * 9 + 8) / 16;
            }
        }
        if msg == WM_SIZING {
            // Constrain the proposed rectangle before Windows applies it.
            let rect = &mut *(l as *mut RECT);
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            match w as u32 {
                WMSZ_TOP | WMSZ_BOTTOM => rect.right = rect.left + (height * 16 + 4) / 9,
                WMSZ_TOPLEFT | WMSZ_TOPRIGHT => rect.top = rect.bottom - (width * 9 + 8) / 16,
                _ => rect.bottom = rect.top + (width * 9 + 8) / 16,
            }
            return 1;
        }
        if msg == WM_TIMER && w == HOVER_TIMER && VIDEO_VISIBLE.load(Ordering::Relaxed) {
            let mut point = POINT { x: 0, y: 0 };
            let mut bounds: RECT = std::mem::zeroed();
            GetCursorPos(&mut point);
            windows_sys::Win32::Graphics::Gdi::ScreenToClient(hwnd, &mut point);
            GetClientRect(hwnd, &mut bounds);
            let inside = point.x >= 0
                && point.y >= 0
                && point.x < bounds.right
                && point.y < bounds.bottom
                && GetAncestor(GetForegroundWindow(), GA_ROOT) == hwnd;
            if let Some(state) = HOVER.get() {
                if let Ok(mut state) = state.lock() {
                    if inside && (state.point != (point.x, point.y) || point.y < 48) {
                        state.last = Instant::now();
                    }
                    state.point = (point.x, point.y);
                    let shown = GetAncestor(GetForegroundWindow(), GA_ROOT) == hwnd
                        && state.last.elapsed() < Duration::from_secs(2);
                    if shown != state.shown {
                        state.shown = shown;
                        if let Some(app) = APP.get() {
                            let _ = app.emit("navigation-visible", shown);
                        }
                    }
                }
            }
            return 0;
        }
        if msg == WM_NCDESTROY {
            KillTimer(hwnd, HOVER_TIMER);
        }
        let previous = PREVIOUS.load(Ordering::Relaxed);
        if previous != 0 {
            CallWindowProcW(
                Some(std::mem::transmute::<
                    isize,
                    unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT,
                >(previous)),
                hwnd,
                msg,
                w,
                l,
            )
        } else {
            DefWindowProcW(hwnd, msg, w, l)
        }
    }
}

#[tauri::command]
pub async fn set_window_overlay(app: AppHandle, enabled: bool) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Window unavailable")?
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())
}
