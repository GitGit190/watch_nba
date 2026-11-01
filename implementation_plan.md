# Implementation Plan: NBA Watch

Updated: 2026-10-29
Status: first Windows MVP implemented; see README.md and VALIDATION.md for launch instructions, measured limits, and verification.

## Implementation status (2026-10-29)

- Implemented: light Today/Tomorrow schedule, cached startup, matchup cards, manual Request URL/Referrer entry, game details and box scores, in-window libmpv playback, collapsible stats, lightweight game tabs, and fullscreen/controls.
- Native hosting selected for the MVP: libmpv's native child-window path inside the Tauri window. A custom render-API compositor is not implemented.
- Persistence selected for the MVP: bounded in-memory data plus JSON schedule files and local UI preferences. SQLite is deferred until persistent download/history features need it.
- Later features remain deferred: automatic stream discovery, downloading, reminders, tray-only mode, and arbitrary website tabs.
- The under-100-MB memory goal is not met in the current WebView2 build. Refer to VALIDATION.md for process-tree snapshots and remaining performance work.

## 1. Product direction

Build a lightweight, personal, Windows-first NBA desktop companion using Tauri 2, Rust, TypeScript, and libmpv. One top-level application window contains both the native video surface and the app interface. This replaces the old Electron, Node.js main/preload, external mpv.exe, named-pipe, and electron-builder architecture.

The first version opens directly to today's and tomorrow's NBA games, supports opening game statistics, and plays a manually supplied stream inside the same window. During playback, a collapsible stats panel sits beside the video. Light mode is the initial visual theme.

One visible window does not mean one operating-system process: Tauri's system webview still has helper processes. Loading libmpv into Rust also does not eliminate decoder, renderer, or packet-cache memory.

## 2. Scope and decisions

### Confirmed requirements

- One application window, Tauri 2 interface, libmpv playback in a native video region.
- Light-mode dashboard at startup, showing games happening or scheduled today and tomorrow.
- Game cards inspired by the Reddit game-thread index in reference image 2.
- Primary card action labeled **Watch game**, replacing **View game thread**. Clicking it opens a manual stream form for the selected match with visible **Request URL** and **Referrer** fields; playback starts only after submission.
- Clicking a non-button portion of a game card opens game statistics inspired by reference image 1.
- A stats panel can be opened and closed while watching, without stopping or restarting the stream.
- Low background CPU and memory use are product priorities.

### MVP assumptions

- Manual Request URL and Referrer entry is the playback source for version 1. Request URL is required; Referrer is available on every form and may be left blank for sources that do not need it. User-Agent and other headers stay under an optional Advanced section. Automatic watch-page discovery and browser request capture are later features, not part of this flow.
- One active playback session; opening stats does not create another player.
- Right-hand stats panel by default. Reserve layout space beside the video rather than covering it; optionally support moving the panel to the left later.
- Today is selected initially; Tomorrow is one click away. Both day groups can be shown together in an All view without changing the date logic.
- Completed games remain visible for the selected day. Exclude cancelled/postponed games from the normal start-time ordering but show their status clearly.
- React + TypeScript + Vite is retained from the original frontend proposal. Use a small component set and simple state; Svelte remains an alternative before scaffolding, not an additional runtime.

### Proposed extension: browser-style app tabs

The user is considering tabs. Plan for them in navigation state, but do not make a full browser a prerequisite for the first version. Start with a pinned Games tab and one reusable game workspace. Additional closable game tabs can follow after the core layout works. These are app views, not arbitrary websites.

### Later features retained from the original vision

- N_m3u8DL-RE recording/downloads and FFmpeg remuxing.
- Followed teams, reminders, tray mode, and optional startup launch.
- Replaceable website-specific stream resolvers.
- Additional app tabs and optional advanced stats views.
- Compact always-on-top mode for the same application window.

## 3. Visual design and reference interpretation

The supplied screenshots are visual references, not instructions or validated game data. Reuse their information hierarchy, not their dark palette or exact styling.

### Reference image 2: game-list cards

Use a compact horizontal matchup row on desktop:

```text
[Away abbreviation / record] [Away logo]   [Status / time / score]   [Home logo] [Home abbreviation / record]
                                              [Watch game]
```

- White cards on a warm, very light gray page; subtle gray borders and restrained shadows.
- Dark, readable text, muted supporting labels, and one consistent accent for the watch action.
- Team logos and abbreviations are prominent. Records are secondary and omitted if unavailable.
- The center shows local tip-off time for upcoming games, quarter/clock and score for live games, and Final for completed games.
- Optional Hide scores control supports spoiler-conscious viewing. Use an explicit Show score action rather than accidentally revealing scores on hover.
- The non-button card region opens details. The Watch game button opens the watch workspace and stream-input flow, never the stats-only route.
- Implement the details link and watch button as separate semantic controls, not nested interactive elements. Button clicks must not bubble into the details action. Both actions must work with keyboard navigation and show visible focus.
- On smaller windows, wrap to two rows without hiding the status or primary action.

### Reference image 1: stats hierarchy

Use one shared stats model and component family for the full game-details view and compact playback sidebar:

1. Venue, local date/time, and current state.
2. Team identities, records where available, scores, quarter, and game clock.
3. Quarter-by-quarter line score, including overtime columns when needed.
4. Team comparison: field goals, three-pointers, free throws, rebounds, assists, steals, blocks, turnovers.
5. Top performer for each side.
6. Local sections for Overview and Box score in the MVP; Plays and Standings are later, only when data is supported.

Preserve raw shooting counts and percentages; comparison bars supplement the numbers. Upcoming games show matchup information and a stats-not-started state rather than fabricated zeros. Missing data displays an em dash. Clearly label stale data and its last update.

The stats interface remains light mode. The video area can remain black before playback and around letterboxed content.

## 4. User journeys

### Startup and schedule

1. Open the main window directly to Games; no setup wizard blocks the schedule.
2. Render a recent cached schedule immediately if available, then refresh it asynchronously.
3. Offer Today and Tomorrow selectors with explicit local dates; default to Today.
4. Include games currently live even if their local start date was yesterday, under a Live now group, without duplicating cards.
5. Sort live games first, then upcoming games by start time, then final games. Show loading, empty, offline/cached, and retry states.
6. Use the system timezone (Asia/Ho_Chi_Minh on the current user's setup) for display and day boundaries. Store timestamps in UTC. Fetch all provider dates needed to cover those local calendar days; do not assume an ESPN/US date equals the user's date.
7. Refresh day groups after local midnight and on resume from sleep. Handle rescheduling and TBD start times.

### Open statistics

- Click the card body to open that game's details in the app workspace.
- Keep a clear route back to Games and preserve selected date and list scroll position.
- A details view does not request a stream or instantiate libmpv.

### Watch a game: manual source entry (version 1)

1. Click **Watch game** on a match card. Open that game's watch workspace with a compact, light-mode source form before starting playback. Always provide this form on the Watch action; if the same match is already playing, show its current source values in memory without interrupting playback until the user submits a replacement.
2. Display the selected matchup above two clearly labeled inputs:
   - **Request URL** (required): the complete media request URL copied from the browser Network panel, including signed path components and query parameters. This is the playback URL, not the game's webpage link.
   - **Referrer** (optional): the value of the successful media request's `Referer` header. Explain that it may belong to the embedded player and differ from the original watch website. Do not infer it from the media domain or fill in a hardcoded provider value.
3. Offer **Play stream** and **Cancel / Back** actions. Pressing Enter submits a valid form; keyboard focus and field-level errors must be accessible. Keep the submit action disabled while connecting to avoid duplicate load requests. Opening or cancelling the form must not start playback, launch a discovery browser, or stop an existing session.
4. Trim accidental surrounding whitespace without changing signed URL content. Validate Request URL as an absolute HTTP(S) URL and Referrer as blank or an absolute HTTP(S) URL, with authoritative validation in Rust. Reject embedded CR/LF in header values. Do not require `.m3u8`/`.mpd` extensions; media endpoints can be extensionless. Validate locally before making network requests.
5. On **Play stream**, pass the selected game ID, URL, and optional referrer through a typed Tauri command to the one libmpv player service. Map Referrer to libmpv's `referrer` option (the HTTP header is spelled `Referer`). Explicitly clear prior source-specific referrer/user-agent/header settings when omitted so one game's access context cannot leak into the next source.
6. Apply the supplied source settings before loading. Show connecting, buffering, playing, ended, and error states. Switching from another active game is explicit in the submit label or nearby copy; do not create a second player.
7. On a 403 or other load failure, keep the entered values in the current form, show a concise actionable error, and allow editing/retry. Do not claim a 403 identifies one definite cause. Keep **Change source** available during playback to reopen the same two-field form when a URL expires.
8. Associate the session with its selected game; never automatically label a pasted stream with another game's stats. Keep form drafts only in bounded in-memory workspace state. Clear source data when the workspace/session is discarded or the app exits; do not persist full URLs, tokens, referrers, or cookies in normal logs or settings. Persistent credential storage is a separate later opt-in.

Form sketch (inside the same application window):

```text
Watch: Away team vs Home team

Request URL *
[ Paste the full media request URL                         ]

Referrer
[ Paste the request's Referer value, if required            ]

[Advanced]                        [Cancel / Back] [Play stream]
```

### Stats while watching

- Stats button opens the selected game's sidebar; video continues uninterrupted.
- Opening it resizes the native video viewport and maintains aspect ratio, without reloading the source.
- Sidebar has its own scroll position and Close control. Controls occupy reserved UI space, avoiding native-video overlap.
- Fullscreen applies to the containing app window. A keyboard shortcut toggles the panel in fullscreen; Escape exits fullscreen before closing the workspace.
- In compact windows use a split with a minimum video size or temporarily switch to a dedicated stats view. Do not assume an HTML drawer can paint over the native video surface.
- Optional score hiding and configurable stats delay reduce spoilers from a score feed running ahead of the video. Initial delay can use a bounded timestamped snapshot queue; automatic synchronization is out of scope.

## 5. Tab behavior and resource policy

Proposed incremental implementation:

- Phase 1 navigation: Games plus one reusable game workspace; no arbitrary URL bar.
- Later tab strip: pinned Games tab plus closable game tabs, each with a game title and Details/Watch state.
- Clicking the same game activates its existing tab. Open in new tab can be explicit; do not duplicate silently.
- All app tabs share the same Tauri frontend runtime. Hidden tabs retain small data/route objects, not separate webviews, media cores, or animation loops.
- One libmpv instance is bound to the current playback session, independent of the selected tab.
- Browsing another tab hides the video surface but may retain the active audio/playback session with a visible Now playing indicator and Return to player action. This policy must be clear; offer Stop rather than creating an invisible second stream.
- Starting another game's stream replaces the previous session through an explicit switch action. Closing the playing tab stops playback and releases its resources.
- No simultaneous multi-game playback or arbitrary embedded browsing in the MVP. Actual website tabs require separate session/security/resource design and remain undecided.

## 6. Technical architecture

| Component                | Responsibility                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Tauri host               | One top-level window, fullscreen, focus, shortcuts, lifecycle, future tray integration |
| React/TypeScript UI      | Schedule, cards, game details, tab metadata, controls, stats panel                     |
| Typed frontend API layer | Small wrappers around Tauri commands/events; no direct native access                   |
| Frontend services/state  | View models, navigation, selection, formatting, bounded cached UI state                |
| Rust data services       | HTTP requests, provider adapters, normalization, caching, polling/backoff              |
| Rust player service      | libmpv lifecycle, asynchronous commands, property observation, event dispatch          |
| Native video host        | Own render surface/viewport, resizing, DPI and monitor handling                        |
| Local persistence        | SQLite for schedule cache and future download history; settings for preferences        |
| Download workers (later) | External N_m3u8DL-RE/FFmpeg processes, job lifecycle and bounded progress events       |

Frontend requests data through Rust. This centralizes caching and errors, avoids making webview CORS behavior a data-provider dependency, and keeps credentials out of UI state where possible.

### libmpv integration: prove this before building the complete interface

- Load a pinned, architecture-compatible libmpv DLL from the packaged resource location through maintained Rust bindings or a small audited FFI wrapper.
- Use the libmpv client API, not mpv.exe or JSON IPC, for playback commands and events.
- Preferred direction: render API into a native GPU surface. Select a backend supported by the chosen released DLL/bindings after a prototype; do not assume newer upstream graphics APIs exist in the shipped build.
- Native child-window embedding through libmpv's wid option is an alternative prototype if rendering integration requires more work. It is still libmpv in the app process, not a separate mpv executable.
- Tauri/WebView2 and native video must occupy coordinated, non-overlapping rectangles within one top-level window. A DOM div is only a layout marker, not a native rendering surface.
- Define bounded header/tab-strip, video, playback-controls, and sidebar regions. Evaluate child webview layout or composition-based hosting as needed. Do not assume default full-window webview stacking permits video to show through.
- Validate window stacking, focus, keyboard input, resize, fractional DPI, fullscreen, minimize/restore, and movement between monitors before selecting the hosting strategy.
- Do not route decoded frames through JSON, JavaScript, screenshots, or a CPU-copy canvas pipeline.
- Drain libmpv events without blocking the UI. Use asynchronous commands/property observations, combine high-frequency progress updates, and follow the renderer's thread/context requirements.
- Release the render context and player in the documented order; stop playback before destroying its host surface. A libmpv/native crash may terminate the Rust host; one window does not imply crash isolation.

## 7. Data sources and normalized contracts

Evaluate NBA.com data endpoints and ESPN website endpoints on this machine. Neither should be treated as a guaranteed public service; prior browsing checks could not confirm access. BALLDONTLIE's free Games endpoint is an optional schedule source, not a free live-box-score solution under its currently documented tiers.

Keep provider-specific game IDs mapped to one internal game identity; ESPN IDs and NBA IDs are not interchangeable. Cache normalized results, preserve unknown states, and keep provider parsing out of components.

Core models:

- Game: internal ID, provider IDs, teams, UTC start time or TBD, provider status, scores, period/clock, venue, last update.
- GameStats: team comparisons, per-period scores, player rows/top performers, optional plays, availability and freshness.
- PlaybackRequest: game ID, media URL (the form's Request URL), optional referrer (the form's Referrer), optional advanced user agent/session headers, optional expiry metadata. Source settings are replaced per load, never inherited implicitly from a previous game.
- PlaybackState: session/game ID, status, position, volume/mute, cache seekable ranges, errors.
- WorkspaceTab: ID, kind, game ID, route, scroll state; no duplicated player handle.
- DownloadJob (later): ID, game/title, destination, bytes, speed, elapsed time, nullable percent, status/error. Live recordings have no known completion percentage.

Suggested initial refresh policy, subject to provider behavior rather than a claimed rate allowance:

- Schedules: startup, date change, resume, and periodic refresh around games; reuse local cache.
- Selected live game: every 15-30 seconds while its stats are visible.
- No active live stats view: stop detailed polling; use infrequent scoreboard refresh as needed.
- Upcoming/final detail views: fetch on open; reduce polling or stop after confirmed final.
- Share in-flight requests between views, cancel obsolete ones, back off on 403/429/network errors, and show cached data with freshness labels.
- Never render a ticking game clock as authoritative unless the provider supports it; distinguish an estimated clock from received data.

## 8. Performance and playback cache

Measure release builds across the Rust host and all associated WebView2 processes. Record CPU, private/working-set memory, GPU use, and playback quality separately. One-window/libmpv integration is a layout choice, not a promise of sub-100 MB playback.

- Aim for under 100 MB total idle app memory as a measured goal; establish a separate realistic playback budget after the integration prototype.
- Create one player lazily and destroy it when playback stops. Keep tab state small and bound retained snapshots/history.
- Start with hardware decoding enabled where supported and test fallback behavior. A smaller on-screen video does not reduce the encoded source resolution.
- Repaint video when new frames require it; do not animate static interface elements continuously.
- Initial packet-cache intent: up to 15 seconds ahead and approximately 15 seconds behind. Backward cache is byte-based, so estimate from bitrate and show actual seekable ranges rather than promising an exact duration.
- Prototype cache values: cache=yes, cache-secs=15, demuxer-max-bytes=24MiB, demuxer-max-back-bytes=16MiB, demuxer-donate-buffer=no. These are tunable limits, not total process-memory caps.
- Enable seeking only when the cache/stream supports it. force-seekable is a diagnostic compatibility setting, not a guarantee. Disable unavailable seek actions and report the actual cached timeline.
- A live forward buffer cannot contain future events. A full 15 seconds ahead needs sufficient distance from the live edge.
- Tray-only mode later should release webview resources when possible; hiding a window alone does not establish memory savings. Define whether ongoing playback continues before tearing down native surfaces.

## 9. Proposed project structure

```text
watch_nba/
|-- implementation_plan.md
|-- src/
|   |-- api/                 # Typed Tauri command/event wrappers
|   |-- services/            # UI models, formatting and navigation rules
|   |-- state/               # Schedule, workspace tabs, playback and preferences
|   |-- components/          # GameCard, StatsPanel, BoxScore, TabStrip, PlayerControls
|   |-- pages/               # Games, GameDetails, Watch, Settings; Downloads later
|   `-- styles/              # Light-mode tokens and responsive layout
|-- src-tauri/
|   |-- src/
|   |   |-- commands/        # Narrow typed frontend entry points
|   |   |-- data/            # ESPN/NBA adapters, normalization and polling
|   |   |-- player/          # libmpv FFI boundary, event loop and session ownership
|   |   |-- windowing/       # Native surface, viewport, fullscreen and DPI
|   |   |-- storage/         # Cached schedules and settings
|   |   `-- downloads/       # Later downloader/FFmpeg supervision
|   |-- resources/           # Native library deployment metadata/resources
|   |-- capabilities/
|   |-- Cargo.toml
|   `-- tauri.conf.json
`-- package.json
```

## 10. Implementation milestones and acceptance checks

### Milestone 0: native integration and data feasibility

- Scaffold minimal Tauri frontend and Rust host.
- Prove local-file then compatible HLS playback through libmpv in one top-level window.
- Render a small light UI region beside video; toggle sidebar, resize, fullscreen, DPI/monitor changes, and minimize/restore without a second player window or playback reload.
- Verify a stream needing Referer works through the same PlaybackRequest contract.
- Test schedule and selected-game stats availability from this machine; choose an adapter using actual responses.
- Capture baseline memory/CPU with no player, playing, and sidebar open. Revisit native hosting strategy if compositing or performance fails before building the rest.

### Milestone 1: light schedule dashboard

- Today/Tomorrow schedule, Reddit-inspired matchup cards, cached startup, local timezone conversion, live-first sorting and status/error states.
- Separate accessible card-body details and Watch game actions; optional score hiding.
- Verify a game near the US/Vietnam date boundary appears on the correct local day and a game continuing past midnight remains discoverable.

### Milestone 2: details and live stats

- Shared Overview/Box score components adapted from reference image 1, with shooting, team comparisons, line score and top performers.
- Display upcoming, live, final, missing and stale states accurately.
- Deduplicate requests and stop polling views no longer in use.

### Milestone 3: integrated watch workspace (first complete MVP)

- Watch game opens the selected matchup's Request URL / Referrer form; only Play stream loads media. Verify required/optional field validation, Cancel behavior, duplicate-submit prevention, keyboard access, and no resolver/browser launch.
- Verify a referrer-dependent stream loads through libmpv; switching to a source with a blank Referrer clears the old value. Failed playback preserves the draft for correction, and Change source reopens the form.
- Playback state, pause/mute/volume, supported seeking, error/retry, and source replacement remain in the same window.
- Toggle the same game's stats sidebar during playback and fullscreen without restarting media.
- Preserve schedule navigation and show a clear active-session indicator when navigating away.
- Verify releasing playback resources and repeated open/close cycles do not accumulate players, surfaces, listeners or requests.

### Milestone 4: optional app tabs

- Add closable game tabs, explicit open-in-new-tab, deduplication and navigation shortcuts.
- Validate one playback session, correct stats association, no webview/player per tab, and bounded memory as tabs are opened/closed.
- Confirm whether richer browser-style navigation is still desired before expanding scope.

### Milestone 5: later background and download features

- Add followed teams/reminders, tray lifecycle, download queue and optional stream resolvers independently.
- Launch downloader tools using structured arguments, not shell-built commands. Pin versions and validate flags against the selected release.
- Handle cancellation, incomplete recordings, final muxing, disk space and shutdown explicitly. Use Windows process-tree supervision/job objects rather than assuming POSIX signals terminate every child.
- Keep package resources, downloaded media, secrets and logs out of source control as appropriate. Test DLL/resource resolution in the installed build, not only development.

Verification should focus on meaningful boundaries: provider fixtures, local-date grouping, independent card actions, tab/player ownership, and native window lifecycle. Native playback and memory acceptance require manual testing on the target Windows system; a DOM-only test cannot validate video composition.

## 11. Remaining design choices

- Are app tabs part of the first release or the immediate follow-up? Default: follow-up after the reusable workspace.
- Should a hidden playing tab keep audio running or pause? Default: continue with a visible Now playing indicator.
- Should fullscreen stats reserve space or overlay video? Default: reserve space for reliable native composition.
- Select the maintained Rust binding, libmpv build, and native hosting strategy after Milestone 0, based on supported APIs and measurements.
- Pick the primary data provider only after schedule and live-stat access are validated locally.

## 12. Technical references

- Tauri process model: https://v2.tauri.app/concept/process-model/
- libmpv client API and lifecycle: https://github.com/mpv-player/mpv/blob/master/include/mpv/client.h
- libmpv render API and threading: https://github.com/mpv-player/mpv/blob/master/include/mpv/render.h
- mpv playback, cache and embedding options: https://mpv.io/manual/stable/
- NBA endpoint reference maintained by nba_api: https://github.com/swar/nba_api
- BALLDONTLIE endpoint/tier documentation: https://docs.balldontlie.io/

Reference images supplied in this chat: image 1 (game overview/statistics hierarchy) and image 2 (Reddit game-thread matchup rows). No temporary attachment paths are required at runtime.

