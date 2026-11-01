use crate::windowing::VideoHost;
use libloading::Library;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use std::{
    ffi::{c_char, c_int, c_void, CStr, CString},
    path::PathBuf,
    sync::{mpsc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackRequest {
    pub game_id: String,
    pub url: String,
    #[serde(default)]
    pub referrer: String,
    #[serde(default)]
    pub user_agent: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub game_id: Option<String>,
    pub status: String,
    pub paused: bool,
    pub volume: f64,
    pub muted: bool,
    pub position: f64,
    pub duration: f64,
    pub cache_seconds: f64,
    pub seekable: bool,
    pub error: Option<String>,
}
impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            game_id: None,
            status: "idle".into(),
            paused: false,
            volume: 75.,
            muted: false,
            position: 0.,
            duration: 0.,
            cache_seconds: 0.,
            seekable: false,
            error: None,
        }
    }
}
#[derive(Serialize)]
pub struct NativeInfo {
    available: bool,
    message: String,
}
enum Message {
    Load(PlaybackRequest),
    Control(String, Option<f64>),
    Quit,
}
pub struct PlayerService {
    sender: Mutex<Option<mpsc::Sender<Message>>>,
    snapshot: std::sync::Arc<Mutex<PlaybackState>>,
}
impl PlayerService {
    pub fn new() -> Self {
        Self {
            sender: Mutex::new(None),
            snapshot: std::sync::Arc::new(Mutex::new(PlaybackState::default())),
        }
    }
    pub fn shutdown(&self) {
        if let Ok(mut s) = self.sender.lock() {
            if let Some(tx) = s.take() {
                let _ = tx.send(Message::Quit);
            }
        }
    }
    fn start(&self, app: AppHandle, hwnd: usize) -> Result<mpsc::Sender<Message>, String> {
        let mut sender = self.sender.lock().map_err(|_| "Player unavailable")?;
        if let Some(ref tx) = *sender {
            return Ok(tx.clone());
        }
        let library = find_library(&app)
            .ok_or("libmpv-2.dll is missing. Run scripts/setup-player.ps1 and restart the app.")?;
        let (tx, rx) = mpsc::channel();
        let snapshot = self.snapshot.clone();
        std::thread::Builder::new()
            .name("courtside-player".into())
            .spawn(move || run_player(app, library, hwnd, rx, snapshot))
            .map_err(|_| "Couldn't start the player worker.")?;
        *sender = Some(tx.clone());
        Ok(tx)
    }
}
fn find_library(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(p) = std::env::var_os("NBA_WATCH_LIBMPV") {
        let p = PathBuf::from(p);
        if p.is_absolute() {
            candidates.push(p)
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(p) = exe.parent() {
            candidates.push(p.join("libmpv-2.dll"));
            candidates.push(p.join("resources/libmpv-2.dll"));
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("resources/libmpv-2.dll"));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/libmpv-2.dll"));
    candidates.into_iter().find(|p| p.is_file())
}
fn validate(request: &mut PlaybackRequest) -> Result<(), String> {
    for (label, text, required) in [
        ("Request URL", &mut request.url, true),
        ("Referrer", &mut request.referrer, false),
    ] {
        if text.contains(['\r', '\n']) {
            return Err(format!("{label} must be a single line."));
        }
        *text = text.trim().into();
        if text.is_empty() {
            if required {
                return Err("Enter a media Request URL.".into());
            }
            continue;
        }
        let parsed = url::Url::parse(text)
            .map_err(|_| format!("{label} must be an absolute HTTP(S) URL."))?;
        if !["http", "https"].contains(&parsed.scheme()) || parsed.host_str().is_none() {
            return Err(format!("{label} must use HTTP or HTTPS."));
        }
    }
    if request.user_agent.contains(['\r', '\n']) {
        return Err("User-Agent must be a single line.".into());
    }
    request.user_agent = request.user_agent.trim().into();
    Ok(())
}
#[tauri::command]
pub async fn player_info(app: AppHandle) -> NativeInfo {
    let available = find_library(&app).is_some();
    NativeInfo {
        available,
        message: if available {
            "Native player ready · libmpv".into()
        } else {
            "libmpv-2.dll is missing. Run scripts/setup-player.ps1, then restart.".into()
        },
    }
}
#[tauri::command]
pub async fn player_load(
    app: AppHandle,
    state: State<'_, PlayerService>,
    host: State<'_, VideoHost>,
    mut request: PlaybackRequest,
) -> Result<(), String> {
    validate(&mut request)?;
    let hwnd = host.handle.load(Ordering::Relaxed) as usize;
    if hwnd == 0 {
        return Err("The native video surface is not available on this platform.".into());
    }
    state
        .start(app, hwnd)?
        .send(Message::Load(request))
        .map_err(|_| "The player worker stopped. Restart the app.".into())
}
#[tauri::command]
pub async fn player_state(state: State<'_, PlayerService>) -> Result<PlaybackState, String> {
    state
        .snapshot
        .lock()
        .map(|s| s.clone())
        .map_err(|_| "Player state unavailable.".into())
}
#[tauri::command]
pub async fn player_control(
    state: State<'_, PlayerService>,
    action: String,
    value: Option<f64>,
) -> Result<(), String> {
    if !["pause", "mute", "volume", "seek", "stop"].contains(&action.as_str()) {
        return Err("Unknown player action.".into());
    }
    if value.is_some_and(|v| !v.is_finite()) {
        return Err("Invalid player value.".into());
    }
    let sender = state.sender.lock().map_err(|_| "Player unavailable.")?;
    if let Some(tx) = sender.as_ref() {
        tx.send(Message::Control(action, value))
            .map_err(|_| "Player stopped.".to_string())
    } else {
        Ok(())
    }
}

#[repr(C)]
struct MpvEvent {
    event_id: c_int,
    error: c_int,
    reply_userdata: u64,
    data: *mut c_void,
}
#[repr(C)]
struct LogMessage {
    prefix: *const c_char,
    level: *const c_char,
    text: *const c_char,
    log_level: c_int,
}
#[repr(C)]
struct EndFile {
    reason: c_int,
    error: c_int,
    playlist_entry_id: i64,
    playlist_insert_id: i64,
    playlist_insert_num_entries: c_int,
}
type Create = unsafe extern "C" fn() -> *mut c_void;
type Initialize = unsafe extern "C" fn(*mut c_void) -> c_int;
type SetOption = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type Command = unsafe extern "C" fn(*mut c_void, u64, *const *const c_char) -> c_int;
type GetProperty = unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;
type WaitEvent = unsafe extern "C" fn(*mut c_void, f64) -> *const MpvEvent;
type Destroy = unsafe extern "C" fn(*mut c_void);
struct Mpv {
    handle: *mut c_void,
    _library: Library,
    set_option: SetOption,
    command: Command,
    get_property: GetProperty,
    wait: WaitEvent,
    destroy: Destroy,
}
fn trace(stage: &str) {
    if let Some(path) = std::env::var_os("COURTSIDE_DIAGNOSTICS") {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(file, "{}", stage);
        }
    }
}
impl Mpv {
    fn new(path: PathBuf, hwnd: usize) -> Result<Self, String> {
        unsafe {
            trace("loading DLL");
            let library = Library::new(path)
                .map_err(|_| "Couldn't load libmpv. Check its architecture and dependencies.")?;
            trace("DLL loaded");
            let create = *library
                .get::<Create>(b"mpv_create\0")
                .map_err(|_| "Invalid libmpv library")?;
            let init = *library
                .get::<Initialize>(b"mpv_initialize\0")
                .map_err(|_| "Invalid libmpv library")?;
            let set_option = *library
                .get::<SetOption>(b"mpv_set_option_string\0")
                .map_err(|_| "Invalid libmpv library")?;
            let command = *library
                .get::<Command>(b"mpv_command_async\0")
                .map_err(|_| "Invalid libmpv library")?;
            let get_property = *library
                .get::<GetProperty>(b"mpv_get_property\0")
                .map_err(|_| "Invalid libmpv library")?;
            let wait = *library
                .get::<WaitEvent>(b"mpv_wait_event\0")
                .map_err(|_| "Invalid libmpv library")?;
            let destroy = *library
                .get::<Destroy>(b"mpv_terminate_destroy\0")
                .map_err(|_| "Invalid libmpv library")?;
            trace("creating core");
            let handle = create();
            trace("core created");
            if handle.is_null() {
                return Err("Couldn't create the media player.".into());
            }
            let player = Self {
                handle,
                _library: library,
                set_option,
                command,
                get_property,
                wait,
                destroy,
            };
            for (name, value) in [
                ("config", "no"),
                ("terminal", "no"),
                ("input-default-bindings", "no"),
                ("input-vo-keyboard", "no"),
                ("osc", "no"),
                ("idle", "yes"),
                ("keep-open", "no"),
                ("vo", "gpu"),
                ("gpu-api", "d3d11"),
                ("hwdec", "auto"),
                ("network-timeout", "15"),
                ("cache", "yes"),
                ("cache-secs", "15"),
                ("demuxer-max-bytes", "24MiB"),
                ("demuxer-max-back-bytes", "16MiB"),
                ("demuxer-donate-buffer", "no"),
                ("demuxer-seekable-cache", "yes"),
                ("volume", "75"),
            ] {
                player.option(name, value)?;
            }
            player.option("wid", &hwnd.to_string())?;
            trace("initializing core");
            if init(handle) < 0 {
                return Err("The native player couldn't initialize its video output.".into());
            }
            if let Ok(request_log) =
                player
                    ._library
                    .get::<unsafe extern "C" fn(*mut c_void, *const c_char) -> c_int>(
                        b"mpv_request_log_messages\0",
                    )
            {
                request_log(player.handle, c"warn".as_ptr());
            }
            trace("core initialized");
            Ok(player)
        }
    }
    fn option(&self, name: &str, value: &str) -> Result<(), String> {
        let name = CString::new(name).map_err(|_| "Invalid option")?;
        let value = CString::new(value).map_err(|_| "Invalid option value")?;
        let code = unsafe { (self.set_option)(self.handle, name.as_ptr(), value.as_ptr()) };
        if code < 0 {
            Err("The player rejected a playback setting.".into())
        } else {
            Ok(())
        }
    }
    fn send(&self, args: &[&str]) -> Result<(), String> {
        let strings: Result<Vec<_>, _> = args.iter().map(|a| CString::new(*a)).collect();
        let strings = strings.map_err(|_| "Invalid playback argument")?;
        let mut pointers: Vec<_> = strings.iter().map(|s| s.as_ptr()).collect();
        pointers.push(std::ptr::null());
        if unsafe { (self.command)(self.handle, 0, pointers.as_ptr()) } < 0 {
            Err("Playback command failed.".into())
        } else {
            Ok(())
        }
    }
    fn number(&self, name: &str) -> f64 {
        let Ok(name) = CString::new(name) else {
            return 0.;
        };
        let mut result = 0f64;
        let code = unsafe {
            (self.get_property)(
                self.handle,
                name.as_ptr(),
                5,
                (&mut result as *mut f64).cast(),
            )
        };
        if code >= 0 && result.is_finite() {
            result
        } else {
            0.
        }
    }
    fn flag(&self, name: &str) -> bool {
        let Ok(name) = CString::new(name) else {
            return false;
        };
        let mut result = 0i32;
        unsafe {
            (self.get_property)(
                self.handle,
                name.as_ptr(),
                3,
                (&mut result as *mut i32).cast(),
            ) >= 0
                && result != 0
        }
    }
}
impl Drop for Mpv {
    fn drop(&mut self) {
        unsafe { (self.destroy)(self.handle) }
    }
}
fn publish(app: &AppHandle, snapshot: &Mutex<PlaybackState>, state: &PlaybackState) {
    trace("publishing player state");
    if let Ok(mut shared) = snapshot.lock() {
        *shared = state.clone()
    }
    let _ = app.emit("player-state", state);
    trace("player state published");
}
fn run_player(
    app: AppHandle,
    path: PathBuf,
    hwnd: usize,
    rx: mpsc::Receiver<Message>,
    snapshot: std::sync::Arc<Mutex<PlaybackState>>,
) {
    let mut core: Option<Mpv> = None;
    let mut state = PlaybackState::default();
    let mut last_emit = Instant::now();
    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(Message::Quit) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Ok(Message::Load(request)) => {
                state = PlaybackState {
                    game_id: Some(request.game_id),
                    status: "loading".into(),
                    ..PlaybackState::default()
                };
                publish(&app, &snapshot, &state);
                if core.is_none() {
                    match Mpv::new(path.clone(), hwnd) {
                        Ok(p) => core = Some(p),
                        Err(e) => {
                            state.status = "error".into();
                            state.error = Some(e);
                            publish(&app, &snapshot, &state);
                            continue;
                        }
                    }
                }
                let player = core.as_ref().unwrap();
                let result = player
                    .option("referrer", &request.referrer)
                    .and_then(|_| {
                        player.option(
                            "user-agent",
                            if request.user_agent.is_empty() {
                                "libmpv"
                            } else {
                                &request.user_agent
                            },
                        )
                    })
                    .and_then(|_| player.option("http-header-fields", ""))
                    .and_then(|_| player.option("pause", "no"))
                    .and_then(|_| player.send(&["loadfile", &request.url, "replace"]));
                if let Err(e) = result {
                    state.status = "error".into();
                    state.error = Some(e);
                    publish(&app, &snapshot, &state)
                }
            }
            Ok(Message::Control(action, value)) => {
                if let Some(p) = core.as_ref() {
                    let result = match action.as_str() {
                        "pause" => p.send(&["cycle", "pause"]),
                        "mute" => p.send(&["cycle", "mute"]),
                        "volume" => p.send(&[
                            "set",
                            "volume",
                            &value.unwrap_or(75.).clamp(0., 100.).to_string(),
                        ]),
                        "seek" => {
                            let offset = value.unwrap_or(0.).clamp(-60., 60.);
                            p.send(&["seek", &offset.to_string(), "relative+exact"])
                        }
                        "stop" => {
                            let r = p.send(&["stop"]);
                            state = PlaybackState::default();
                            r
                        }
                        _ => Ok(()),
                    };
                    if let Err(e) = result {
                        state.error = Some(e)
                    }
                    publish(&app, &snapshot, &state);
                }
                if action == "stop" {
                    core = None;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if let Some(p) = core.as_ref() {
            for _ in 0..64 {
                let event = unsafe { (p.wait)(p.handle, 0.) };
                if event.is_null() {
                    break;
                }
                let event = unsafe { &*event };
                if event.event_id == 0 {
                    break;
                }
                match event.event_id {
                    16 => {
                        if !event.data.is_null() {
                            let log = unsafe { &*(event.data as *const LogMessage) };
                            if !log.text.is_null() {
                                let text = unsafe { CStr::from_ptr(log.text) }.to_string_lossy();
                                let clean = text
                                    .split_whitespace()
                                    .map(|part| {
                                        if part.contains("://") {
                                            "[source]"
                                        } else {
                                            part
                                        }
                                    })
                                    .collect::<Vec<_>>()
                                    .join(" ");
                                if cfg!(debug_assertions) {
                                    eprintln!("player: {}", clean);
                                }
                            }
                        }
                    }
                    7 => {
                        if !event.data.is_null() {
                            let end = unsafe { &*(event.data as *const EndFile) };
                            if end.reason == 4 {
                                state.status = "error".into();
                                state.error=Some(format!("Stream failed (player error {}). The URL may have expired or need a different referrer.",end.error));
                            } else if end.reason == 0 {
                                state.status = "ended".into();
                            }
                        }
                    }
                    8 | 21 => {
                        state.status = "playing".into();
                        state.error = None;
                    }
                    5 if event.error < 0 => {
                        state.status = "error".into();
                        state.error=Some("The player couldn't open or control this stream. Check its URL and access headers.".into());
                    }
                    _ => {}
                }
            }
            if state.game_id.is_some() && !["error", "ended"].contains(&state.status.as_str()) {
                state.paused = p.flag("pause");
                state.muted = p.flag("mute");
                state.volume = p.number("volume");
                state.position = p.number("time-pos");
                state.duration = p.number("duration");
                state.cache_seconds = p.number("demuxer-cache-duration");
                state.seekable = p.flag("seekable");
                if state.status != "loading" {
                    state.status = if p.flag("paused-for-cache") {
                        "buffering"
                    } else if state.paused {
                        "paused"
                    } else {
                        "playing"
                    }
                    .into();
                }
            }
        }
        if last_emit.elapsed() >= Duration::from_millis(250) && core.is_some() {
            publish(&app, &snapshot, &state);
            last_emit = Instant::now();
        }
    }
    drop(core);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_signed_url_without_rewriting() {
        let mut request = PlaybackRequest {
            game_id: "1".into(),
            url: " https://video.example/live?token=a%2Fb&n=1 ".into(),
            referrer: " https://player.example/ ".into(),
            user_agent: String::new(),
        };
        validate(&mut request).unwrap();
        assert_eq!(request.url, "https://video.example/live?token=a%2Fb&n=1");
        assert_eq!(request.referrer, "https://player.example/");
    }
    #[test]
    fn rejects_header_injection() {
        let mut r = PlaybackRequest {
            url: "https://example.com/a".into(),
            referrer: "https://example.com/\r\nCookie: bad".into(),
            ..Default::default()
        };
        assert!(validate(&mut r).is_err())
    }
    #[test]
    fn rejects_local_and_non_http_sources() {
        for source in ["file:///C:/secret", "javascript:alert(1)", ""] {
            let mut r = PlaybackRequest {
                url: source.into(),
                ..Default::default()
            };
            assert!(validate(&mut r).is_err())
        }
    }
}
