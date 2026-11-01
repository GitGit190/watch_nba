# Validation — Windows MVP

Validated on this Windows machine on 2026-10-29.

## Runnable build

Open `artifacts/Courtside/Courtside.exe`. Keep the entire Courtside folder together, including `resources/libmpv-2.dll`. The release embeds the frontend and does not require a Vite server. The app has been left open on its normal dashboard.

The optimized executable SHA-256 is `44F32524A5FCDBCF20B71E604B8AF27DF9D26C90DE38EF5521F8B9E06D6BDC74`.

## Implemented and exercised

- Light dashboard showing today's and tomorrow's games, live status, local start times, and team logos.
- Separate game-details and Watch game actions, overview statistics and player box scores, and score hiding.
- Manual stream request URL, optional referrer, and advanced user-agent entry. Source fields remain in memory rather than being saved.
- Embedded libmpv playback in a native child HWND inside one Tauri top-level window, with pause/resume, volume, seeking when supported, fullscreen, and a statistics sidebar.
- Application tabs share one player. Returning to a playing tab does not create another decoder.
- Schedule caching and bounded stats polling with request deduplication and failure backoff.

## Checks passed

- Frontend: 9 unit tests, including signed URL preservation, header-injection rejection, local date boundaries, duplicate games, and both ESPN quarter-score schemas.
- Rust: 3 unit tests covering native source URL validation and header-injection rejection.
- Production frontend build, optimized Windows native build, and Rust formatting check.
- npm audit reported zero vulnerabilities at validation time.
- Browser UI regression using separate synthetic schedule/stat fixtures: dashboard, details, box score, manual source form, cancel, sidebar, and tomorrow navigation.
- Actual packaged release UI: public HLS test media rendered inside the native viewport; pause/resume, sidebar, fullscreen, and source-form cancellation passed.
- Local test proxy required the supplied referrer on playlists and segments. Playback succeeded. A subsequent source requiring an empty referrer also succeeded, checking that the previous referrer was cleared.
- A deliberately rejected source produced a playback error; Edit source retained the entered fields for correction.
- Native screenshots were inspected for video placement, dashboard layout, and real quarter scores.

Test media was public demonstration video, not an NBA feed. These checks establish player integration, not availability of any third-party game stream. The final normally launched app has no test stream or debug port enabled. Temporary test servers and the Vite server were stopped; ports 1420, 9223, 9331, and 9332 were closed after cleanup.

## Memory observations

The under-100-MB target is **not met** by this implementation.

The normal optimized release, idle on the dashboard without a debugger, measured approximately **254.9 MiB of private committed memory across the app and its WebView2 descendants**. The native host alone used approximately 7.7 MiB, which is not a fair measure of the complete app. The sum of working sets was approximately 469.0 MiB; shared pages mean that sum is not unique physical RAM usage.

The final playback test measured approximately **589.3 MiB of process-tree private committed memory**. That test enabled local WebView2 debugging and used a local proxy with public HLS media, so it is not a clean normal-use benchmark. Decoder, resolution, GPU driver, stream bitrate, and caches affect playback memory. No performance equivalence to standalone mpv is claimed.

Reproduce snapshots with `scripts/measure-memory.ps1 -AppProcessId <PID>`. Raw observations are in `artifacts/memory-idle-normal.json` and `artifacts/memory-playback-final.json`. Private committed memory and working set measure different things.

## Remaining scope and hardware checks

Downloads, automatic stream discovery, team reminders, a system tray, and arbitrary website/browser tabs are deferred. Current tabs are app game tabs. ESPN's website endpoints are undocumented and can change.

The video uses a native child window rather than the libmpv render API. HTML cannot overlay that native video rectangle; controls and statistics occupy adjacent space. Multi-monitor mixed-DPI transitions, prolonged live playback, sleep/resume, device loss, and a comparative standalone-mpv performance benchmark still require hardware-specific testing.

The initial packet cache is capped at 24 MiB forward and 16 MiB backward with a 15-second forward target. This does not guarantee 15 seconds of backward seeking: duration depends on bitrate and the source's seek behavior. Hardware decoding is requested with software fallback.
