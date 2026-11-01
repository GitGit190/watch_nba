import type { Game, Team, GameStats, GameStatus } from "./types";
type Json = Record<string, any>;
export function dayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function localDays(now = new Date()): {
  today: string;
  tomorrow: string;
  dates: string[];
} {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(a);
  b.setDate(b.getDate() + 1);
  const end = new Date(b);
  end.setDate(end.getDate() + 1);
  const start = new Date(a);
  start.setDate(start.getDate() - 1);
  const dates = new Set<string>();
  for (let t = start.getTime(); t <= end.getTime(); t += 12 * 3600000)
    dates.add(new Date(t).toISOString().slice(0, 10).replaceAll("-", ""));
  return { today: dayKey(a), tomorrow: dayKey(b), dates: [...dates] };
}
function team(c: Json): Team {
  const t = c.team ?? {};
  return {
    id: String(t.id ?? ""),
    abbreviation: t.abbreviation ?? "TBD",
    name: t.displayName ?? "Team TBD",
    city: t.shortDisplayName ?? t.location ?? "",
    logo: t.logo ?? t.logos?.[0]?.href ?? "",
    color: "#" + (t.color ?? "556379"),
    record:
      c.records?.find((r: Json) => r.type === "total")?.summary ??
      c.records?.[0]?.summary ??
      "",
    score: c.score == null ? null : Number(c.score),
    quarters: (c.linescores ?? []).map((q: Json) => {
      const value = q.value ?? q.displayValue;
      return value == null || !Number.isFinite(Number(value))
        ? null
        : Number(value);
    }),
  };
}
export function parseGames(raw: unknown): Game[] {
  const rows = (raw as Json)?.events ?? [];
  const map = new Map<string, Game>();
  for (const e of rows) {
    const c = e.competitions?.[0];
    if (!c) continue;
    const status = c.status ?? e.status ?? {};
    const type = status.type ?? {};
    const state: GameStatus = type.completed
      ? "final"
      : type.state === "in"
        ? "live"
        : /postpon|cancel|delay/i.test(type.description ?? "")
          ? "postponed"
          : "scheduled";
    map.set(String(e.id), {
      id: String(e.id),
      date: e.date,
      name: e.name ?? "",
      status: state,
      detail: type.shortDetail ?? type.description ?? "Scheduled",
      clock: status.displayClock ?? "",
      period: status.period ?? 0,
      venue: c.venue?.fullName ?? "Venue to be announced",
      broadcast: (c.broadcasts ?? [])
        .flatMap((b: Json) => b.names ?? [])
        .join(" · "),
      away: team(c.competitors?.find((x: Json) => x.homeAway === "away") ?? {}),
      home: team(c.competitors?.find((x: Json) => x.homeAway === "home") ?? {}),
    });
  }
  return [...map.values()];
}
export function gamesForDay(
  games: Game[],
  selected: string,
  today: string,
): Game[] {
  const order = { live: 0, scheduled: 1, postponed: 2, final: 3 };
  return games
    .filter(
      (g) =>
        dayKey(new Date(g.date)) === selected ||
        (selected === today && g.status === "live"),
    )
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        Date.parse(a.date) - Date.parse(b.date),
    );
}
export function timeLabel(g: Game): string {
  return g.status === "live"
    ? g.detail
    : g.status === "final"
      ? "Final"
      : g.status === "postponed"
        ? g.detail
        : new Date(g.date).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
}
export function validateSource(url: string, referrer: string): string | null {
  for (const [label, value, required] of [
    ["Request URL", url, true],
    ["Referrer", referrer, false],
  ] as const) {
    if (/[\r\n]/.test(value)) return label + " must be a single line.";
    if (!value.trim()) {
      if (required) return "Enter the complete media Request URL.";
      continue;
    }
    try {
      const parsed = new URL(value.trim());
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname)
        return label + " must use http:// or https://.";
    } catch {
      return label + " must be a valid absolute URL.";
    }
  }
  return null;
}
const metrics = [
  ["fieldGoalsMade-fieldGoalsAttempted", "Field goals"],
  ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "3-pointers"],
  ["freeThrowsMade-freeThrowsAttempted", "Free throws"],
  ["totalRebounds", "Rebounds"],
  ["assists", "Assists"],
  ["steals", "Steals"],
  ["blocks", "Blocks"],
  ["turnovers", "Turnovers"],
];
export function parseStats(raw: unknown, game: Game): GameStats {
  const j = raw as Json;
  const teams = j.boxscore?.teams ?? [];
  const find = (id: string) =>
    teams.find((t: Json) => String(t.team?.id) === id);
  const stat = (t: Json | undefined, key: string) =>
    t?.statistics?.find((s: Json) => s.name === key)?.displayValue ?? "—";
  const value = (s: string) => Number.parseFloat(s) || 0;
  return {
    updatedAt: Date.now(),
    metrics: metrics.map(([key, label]) => {
      const away = stat(find(game.away.id), key),
        home = stat(find(game.home.id), key);
      return {
        key,
        label,
        away,
        home,
        awayValue: value(away),
        homeValue: value(home),
      };
    }),
    boxTeams: (j.boxscore?.players ?? []).map((t: Json) => ({
      id: String(t.team?.id),
      name: t.team?.displayName ?? "",
      labels: t.statistics?.[0]?.labels ?? [],
      players: (t.statistics?.[0]?.athletes ?? []).map((a: Json) => ({
        id: String(a.athlete?.id),
        name: a.athlete?.displayName ?? "",
        position: a.athlete?.position?.abbreviation ?? "",
        values: a.stats ?? [],
        starter: !!a.starter,
      })),
    })),
    leaders: (j.leaders ?? []).map((t: Json) => {
      const lead =
        t.leaders?.find((l: Json) => l.name === "points")?.leaders?.[0] ??
        t.leaders?.[0]?.leaders?.[0];
      return {
        teamId: String(t.team?.id),
        name: lead?.athlete?.displayName ?? "Not available",
        detail: lead
          ? String(lead.displayValue ?? "—") +
            " " +
            (lead.mainStat?.label ?? "PTS")
          : "",
      };
    }),
  };
}
export function mergeSummary(game: Game, raw: unknown): Game {
  const header = (raw as Json)?.header;
  if (!header) return game;
  const next = parseGames({
    events: [
      {
        ...header,
        id: game.id,
        date: header.competitions?.[0]?.date ?? game.date,
        name: game.name,
      },
    ],
  })[0];
  if (!next) return game;
  return {
    ...next,
    venue: next.venue === "Venue to be announced" ? game.venue : next.venue,
    broadcast: next.broadcast || game.broadcast,
  };
}
