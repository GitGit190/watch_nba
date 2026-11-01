# Third-party resources

This project is currently a personal app. Before redistribution, review the actual licenses and notices of the exact native binaries you package.

- libmpv: https://github.com/mpv-player/mpv. The client API headers have a permissive license, but that is not the license for the whole mpv binary. mpv core is normally GPL; LGPL builds are possible. The downloaded Windows build and its FFmpeg/codec dependencies may have additional obligations. Do not assume an ISC header licenses the bundled DLL.
- Windows libmpv build provenance: https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20261021
- React, Tauri, Lucide and other JS/Rust dependencies: consult their package metadata and lockfiles.
- DM Sans and Manrope: locally bundled through @fontsource packages; consult their included OFL license files.
- NBA team logos: cached from ESPN's public team assets for identification in this personal application. NBA/team marks remain the property of their respective owners.
- ESPN schedule and stats are obtained from website endpoints. Availability and permission for other uses must be evaluated independently.
