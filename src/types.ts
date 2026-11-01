export type GameStatus = "scheduled" | "live" | "final" | "postponed";
export interface Team {
  id: string;
  abbreviation: string;
  name: string;
  city: string;
  logo: string;
  color: string;
  record: string;
  score: number | null;
  quarters: (number | null)[];
}
export interface Game {
  id: string;
  date: string;
  name: string;
  status: GameStatus;
  detail: string;
  clock: string;
  period: number;
  venue: string;
  broadcast: string;
  home: Team;
  away: Team;
}
export interface StatRow {
  key: string;
  label: string;
  away: string;
  home: string;
  awayValue: number;
  homeValue: number;
}
export interface PlayerRow {
  id: string;
  name: string;
  position: string;
  values: string[];
  starter: boolean;
}
export interface BoxTeam {
  id: string;
  name: string;
  labels: string[];
  players: PlayerRow[];
}
export interface GameStats {
  metrics: StatRow[];
  boxTeams: BoxTeam[];
  leaders: { teamId: string; name: string; detail: string }[];
  updatedAt: number;
}
export interface PlaybackRequest {
  gameId: string;
  url: string;
  referrer: string;
  userAgent: string;
}
export interface PlaybackState {
  gameId: string | null;
  status: string;
  paused: boolean;
  volume: number;
  muted: boolean;
  position: number;
  duration: number;
  cacheSeconds: number;
  seekable: boolean;
  error: string | null;
}
export interface NativeInfo {
  available: boolean;
  message: string;
}
export interface DataResult {
  data: unknown;
  cached: boolean;
  fetchedAt: number;
  warning?: string;
}
export const idlePlayer: PlaybackState = {
  gameId: null,
  status: "idle",
  paused: false,
  volume: 75,
  muted: false,
  position: 0,
  duration: 0,
  cacheSeconds: 0,
  seekable: false,
  error: null,
};
