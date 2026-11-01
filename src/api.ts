import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  DataResult,
  NativeInfo,
  PlaybackRequest,
  PlaybackState,
} from "./types";
export const desktop = isTauri();
export async function fetchSchedule(dates: string[]): Promise<DataResult> {
  if (desktop) return invoke("fetch_schedule", { dates });
  const values = await Promise.all(
    dates.map(async (date) => {
      const r = await fetch(
        "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=" +
          date,
      );
      if (!r.ok) throw Error("Schedule provider returned " + r.status);
      return r.json();
    }),
  );
  return {
    data: { events: values.flatMap((v) => v.events ?? []) },
    cached: false,
    fetchedAt: Date.now(),
  };
}
export async function fetchStats(gameId: string): Promise<DataResult> {
  if (desktop) return invoke("fetch_stats", { gameId });
  const r = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=" +
      encodeURIComponent(gameId),
  );
  if (!r.ok) throw Error("Stats provider returned " + r.status);
  return { data: await r.json(), cached: false, fetchedAt: Date.now() };
}
export const nativeInfo = (): Promise<NativeInfo> =>
  desktop
    ? invoke("player_info")
    : Promise.resolve({
        available: false,
        message: "Open the desktop application for native libmpv playback.",
      });
export const play = (request: PlaybackRequest): Promise<void> =>
  desktop
    ? invoke("player_load", { request })
    : Promise.reject(Error("Native playback is available in the Windows app."));
export const control = (action: string, value?: number): Promise<void> =>
  desktop ? invoke("player_control", { action, value }) : Promise.resolve();
export const playerState = (): Promise<PlaybackState> => invoke("player_state");
export const setViewport = (rect: {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  clipTop?: number;
  clipBottom?: number;
}): Promise<void> =>
  desktop ? invoke("set_video_rect", { rect }) : Promise.resolve();
export const fullscreen = (exitOnly = false): Promise<void> =>
  desktop ? invoke("toggle_fullscreen", { exitOnly }) : Promise.resolve();

export async function fetchCachedSchedule(
  dates: string[],
): Promise<DataResult | null> {
  if (!desktop) return null;
  try {
    return await invoke("fetch_schedule", { dates, cacheOnly: true });
  } catch {
    return null;
  }
}
