# Courtside — NBA Watch

A personal, Windows-first NBA companion built with **Tauri 2, React, TypeScript, Rust, and libmpv**. One application window hosts the interface and a native video surface. Media frames do not pass through JavaScript.

## Current features

- Light-mode Today/Tomorrow schedule in the system timezone, with live games prioritized.
- Matchup cards: click the body for stats or **Watch game** for manual stream entry.
- **Request URL** and optional **Referrer**, with an optional advanced User-Agent field.
- One native libmpv playback session, pause/resume, volume/mute, supported seeking, and fullscreen.
- A collapsible stats sidebar, Overview/Box score views, score hiding, and lightweight game tabs.
- ESPN website data through Rust, with schedule caching and refresh/backoff behavior.
- Locally bundled fonts and team logos; no browser or player per tab.

Stream discovery, downloads, reminders, tray mode, arbitrary website tabs, and automatic video/stat synchronization are not implemented in this first version.

## Run on this machine

Node.js and the Windows C++ Build Tools are installed. Rust was installed locally under `.tools/` without changing your global PATH.

```powershell
cd D:\non_work\watch_nba
.\scripts\dev.ps1
```

To build the standalone application:

```powershell
.\scripts\dev.ps1 -Build
```

The executable is created at `src-tauri/target/release/nba-watch.exe`. Keep its `resources/libmpv-2.dll` resource directory beside it when copying the executable elsewhere. A ready-to-run portable folder is provided under `artifacts/Courtside` when a release is produced during development.

For frontend-only development:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. The browser preview can show schedules/stats, but playback is intentionally available only in the desktop app.

## Setup on another Windows machine

1. Install Node.js, Rust's MSVC toolchain, and Visual Studio C++ Build Tools with a Windows SDK. WebView2 Runtime is also required and is normally present on current Windows systems.
2. Run `npm install`.
3. Run `scripts/setup-player.ps1` to download/extract the pinned x64 libmpv development build, or place a compatible `libmpv-2.dll` in `src-tauri/resources/`.
4. Run `scripts/dev.ps1`.

The app loads the DLL from packaged resources, beside the executable, or the development resource directory. `NBA_WATCH_LIBMPV` can specify an absolute DLL path for development. Installing mpv.exe alone does not necessarily provide libmpv.

## Watch a game

1. Choose a matchup and click **Watch game**.
2. Paste the complete successful media request URL from your browser's Network panel. Preserve signed paths and query parameters.
3. Paste the request's `Referer` value into **Referrer** if the source needs it. This may differ from the watch website's address.
4. Click **Play stream**. Use **Change source** to edit or replace an expired link.

Cancel does not start another stream or stop the existing session. Source URLs and headers are kept only in memory and are not saved to settings or normal logs. A 403 does not identify a single cause; a source may require fresh tokens, cookies, or a browser session beyond the supported URL/referrer/User-Agent form.

Keyboard controls: **Space** toggles pause when not typing; **S** toggles stats in the watch view; **Escape** exits fullscreen. Browsing another app tab retains the one playback session and shows a Return to player control. Closing its tab stops it.

## Architecture and limits

- `src/`: interface, typed command wrappers, and normalized ESPN view models.
- `src-tauri/src/player.rs`: dynamically loaded libmpv C API, a dedicated control/event worker, and sanitized errors. libmpv manages its video-output threads.
- `src-tauri/src/windowing.rs`: a Windows child HWND for native video within the Tauri top-level window. It occupies the blank video viewport above the webview; the sidebar and controls remain outside its rectangle.
- `src-tauri/src/data.rs`: HTTP requests and schedule/stat caching.

The native child-window path is the initial Windows integration. It is not a custom libmpv render-API compositor. Resize, focus, DPI changes, and fullscreen need testing on the target hardware. The native video region does not render HTML overlays.

One window does not imply one process or a fixed memory budget. WebView2 helpers, decoding, rendering, and caches all consume resources. Initial packet-cache caps are 24 MiB forward and 16 MiB backward, with a 15-second forward target; backward duration depends on bitrate, and live seeking depends on the source. Hardware decoding is requested with software fallback.

ESPN endpoints are undocumented website services and can change or refuse access. Dates are normalized in the local timezone. Stats may arrive ahead of the video; use Hide scores if avoiding spoilers. No continuous ticking game clock is invented locally.

## Validation

```powershell
npm test
npm run build
# Start npm run dev in another terminal first:
npm run test:ui
```

`test:ui` uses Edge through Playwright and clearly separate synthetic fixtures; production never substitutes fabricated games. Rust tests validate native source parsing and header-injection rejection:

```powershell
# Use scripts/dev.ps1's project-local Rust environment, or your own Cargo:
cargo test --manifest-path src-tauri/Cargo.toml
```

`scripts/check-native.mjs` is a developer test for a development or release test instance launched with WebView2's local CDP debugging port 9223. It uses public test media; this port is not enabled by normal app startup or release builds. See `VALIDATION.md` for observed results and remaining hardware-specific checks.

## Native dependency provenance

libmpv build: `mpv-dev-x86_64-20261021-git-e471496c56`, obtained from the shinchiro/mpv-winbuild-cmake GitHub releases. Native binaries are ignored by Git; use the setup script to restore them. See `THIRD_PARTY_NOTICES.md` before redistributing a packaged build.

Performance status: the current full WebView2 interface does not meet the under-100-MB idle target. See VALIDATION.md for measurements; the native player and WebView2 helpers must both be counted.

run for de

## Compact viewing (Windows)

The borderless window opens at 1280×720 and maintains 16:9 during resizing.
Drag the empty part of the top bar to move it. The square window action fits
it to the current monitor while keeping 16:9; fullscreen uses the whole monitor.

During playback, video fills the window. Move the mouse to reveal navigation
and mpv's fading playback controls. Navigation hides after two seconds of
inactivity. Hide/Show tabs is in the top bar; T toggles tabs, S toggles stats,
F or double-click toggles fullscreen, Escape exits fullscreen, Space pauses,
M mutes, and Left/Right seek five seconds when supported. Tabs and stats cover
the picture temporarily without changing the video surface size. Non-16:9
sources retain their original proportions with black bars.

The navigation overlay is opaque and uses the existing webview, exposed through
the native video window region. Playback controls are rendered by mpv, rather
than a second webview or JavaScript video frames.
