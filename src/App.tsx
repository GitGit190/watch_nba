import logoIds from "./logo-ids.json";
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Square,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import * as api from "./api";
import {
  gamesForDay,
  localDays,
  mergeSummary,
  parseGames,
  parseStats,
  timeLabel,
  validateSource,
} from "./domain";
import {
  idlePlayer,
  type Game,
  type GameStats,
  type NativeInfo,
  type PlaybackRequest,
  type PlaybackState,
  type Team,
} from "./types";

function Logo({ team, size = "normal" }: { team: Team; size?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={"team-logo " + size}
      style={{ "--team-color": team.color } as React.CSSProperties}
    >
      {team.logo && !failed ? (
        <img
          src={
            logoIds.includes(team.id) ? "/teams/" + team.id + ".png" : team.logo
          }
          alt={team.name}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{team.abbreviation}</span>
      )}
    </div>
  );
}
function Badge({ game }: { game: Game }) {
  return (
    <span className={"badge " + game.status}>
      {game.status === "live" && <i />}
      {game.status === "live"
        ? "LIVE"
        : game.status === "final"
          ? "FINAL"
          : game.status === "postponed"
            ? "UPDATE"
            : "UPCOMING"}
    </span>
  );
}
function GameCard({
  game,
  hidden,
  onDetails,
  onWatch,
}: {
  game: Game;
  hidden: boolean;
  onDetails: () => void;
  onWatch: () => void;
}) {
  return (
    <article
      className={"game-card " + (game.status === "live" ? "is-live" : "")}
    >
      <button
        className="card-body"
        onClick={onDetails}
        aria-label={"View stats for " + game.name}
      >
        <div className="team-side away">
          <Logo team={game.away} />
          <div>
            <h3>{game.away.abbreviation}</h3>
            <p>{game.away.city}</p>
            <small>{game.away.record || "Record unavailable"}</small>
          </div>
        </div>
        <div className="match-center">
          <Badge game={game} />
          {game.status === "scheduled" || game.status === "postponed" ? (
            <strong className="tipoff">{timeLabel(game)}</strong>
          ) : (
            <strong className="score">
              {hidden ? (
                <span className="hidden-score">Scores hidden</span>
              ) : (
                <>
                  {game.away.score ?? "—"}
                  <span>:</span>
                  {game.home.score ?? "—"}
                </>
              )}
            </strong>
          )}
          <span className="match-detail">
            {game.status === "scheduled"
              ? game.broadcast || "Tip-off · local time"
              : game.status === "final"
                ? "Game complete"
                : game.detail}
          </span>
        </div>
        <div className="team-side home">
          <div>
            <h3>{game.home.abbreviation}</h3>
            <p>{game.home.city}</p>
            <small>{game.home.record || "Record unavailable"}</small>
          </div>
          <Logo team={game.home} />
        </div>
      </button>
      <div className="card-footer">
        <span>
          <span className="venue-dot" />
          {game.venue}
        </span>
        <button className="watch-button" onClick={onWatch}>
          <Play size={13} fill="currentColor" />
          Watch game
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}
function Stats({
  game,
  stats,
  loading,
  error,
  onRetry,
  compact = false,
  hidden = false,
}: {
  game: Game;
  stats: GameStats | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  compact?: boolean;
  hidden?: boolean;
}) {
  const [section, setSection] = useState("Overview");
  const [side, setSide] = useState(game.away.id);
  const box = stats?.boxTeams.find((t) => t.id === side) ?? stats?.boxTeams[0];
  return (
    <div className={"stats-content " + (compact ? "compact" : "")}>
      <div className="stats-score">
        <div>
          <Logo team={game.away} />
          <b>{game.away.abbreviation}</b>
          <span>{hidden ? "—" : (game.away.score ?? "—")}</span>
        </div>
        <div className="stats-score-center">
          <Badge game={game} />
          <small>
            {game.status === "scheduled" ? timeLabel(game) : game.detail}
          </small>
        </div>
        <div>
          <Logo team={game.home} />
          <b>{game.home.abbreviation}</b>
          <span>{hidden ? "—" : (game.home.score ?? "—")}</span>
        </div>
      </div>
      <div className="stats-nav">
        {["Overview", "Box score"].map((s) => (
          <button
            className={section === s ? "active" : ""}
            key={s}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {hidden ? (
        <div className="empty small">
          <EyeOff />
          <h3>Scores are hidden</h3>
          <p>Reveal scores from the toolbar to see game statistics.</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="inline-error">
              {stats ? "Showing the last available stats. " : ""}
              {error} <button onClick={onRetry}>Retry</button>
            </div>
          )}
          {loading && !stats ? (
            <div className="stats-loading">Loading game statistics…</div>
          ) : game.status === "scheduled" ? (
            <div className="empty small">
              <Clock3 />
              <h3>The story starts at tip-off</h3>
              <p>
                Live scores and player stats will appear here once the game
                begins.
              </p>
            </div>
          ) : section === "Overview" ? (
            <>
              {(game.away.quarters.length > 0 ||
                game.home.quarters.length > 0) && (
                <div className="line-score">
                  <table>
                    <thead>
                      <tr>
                        <th>TEAM</th>
                        {Array.from(
                          {
                            length: Math.max(
                              game.away.quarters.length,
                              game.home.quarters.length,
                            ),
                          },
                          (_, i) => (
                            <th key={i}>
                              {i < 4 ? "Q" + (i + 1) : "OT" + (i - 3)}
                            </th>
                          ),
                        )}
                        <th>T</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[game.away, game.home].map((t) => (
                        <tr key={t.id}>
                          <th>{t.abbreviation}</th>
                          {Array.from(
                            {
                              length: Math.max(
                                game.away.quarters.length,
                                game.home.quarters.length,
                              ),
                            },
                            (_, i) => (
                              <td key={i}>{t.quarters[i] ?? "—"}</td>
                            ),
                          )}
                          <td>
                            <b>{t.score ?? "—"}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="section-eyebrow">TEAM COMPARISON</div>
              <div className="comparison-heading">
                <b>{game.away.abbreviation}</b>
                <b>{game.home.abbreviation}</b>
              </div>
              {(stats?.metrics ?? []).map((m) => {
                const total = m.awayValue + m.homeValue;
                return (
                  <div className="stat-row" key={m.key}>
                    <div>
                      <b>{m.away}</b>
                      <span>{m.label}</span>
                      <b>{m.home}</b>
                    </div>
                    <div className="comparison-bars">
                      <i
                        style={{
                          width:
                            (total ? (m.awayValue / total) * 100 : 50) + "%",
                          background: game.away.color,
                        }}
                      />
                      <i
                        style={{
                          width:
                            (total ? (m.homeValue / total) * 100 : 50) + "%",
                          background: game.home.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {!stats?.metrics.length && (
                <p className="muted">Team statistics are not available yet.</p>
              )}
              {!!stats?.leaders.length && (
                <>
                  <div className="section-eyebrow leader-label">
                    TOP PERFORMERS
                  </div>
                  <div className="leaders">
                    {stats.leaders.map((l) => (
                      <div key={l.teamId}>
                        <Trophy size={16} />
                        <div>
                          <b>{l.name}</b>
                          <small>{l.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="box-score">
              <div className="team-switch">
                {[game.away, game.home].map((t) => (
                  <button
                    key={t.id}
                    className={box?.id === t.id ? "active" : ""}
                    onClick={() => setSide(t.id)}
                  >
                    {t.abbreviation}
                  </button>
                ))}
              </div>
              {box?.players.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>PLAYER</th>
                        {box.labels.map((l, i) => (
                          <th key={i}>{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {box.players.map((p) => (
                        <tr key={p.id}>
                          <th>
                            {p.name}
                            <small>
                              {p.position}
                              {p.starter ? " · starter" : ""}
                            </small>
                          </th>
                          {p.values.map((v, i) => (
                            <td key={i}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty small">
                  <Activity />
                  <p>Player statistics are not available yet.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {stats && (
        <p className="stats-updated">
          Updated{" "}
          {new Date(stats.updatedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · ESPN
        </p>
      )}
    </div>
  );
}

export default function App() {
  const [days, setDays] = useState(() => localDays());
  const [selectedDay, setSelectedDay] = useState(() => localDays().today);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [cached, setCached] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [hidden, setHidden] = useState(
    () => localStorage.getItem("hideScores") === "true",
  );
  const [view, setView] = useState<"games" | "details" | "watch">("games");
  const [gameId, setGameId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formReferrer, setFormReferrer] = useState("");
  const [formAgent, setFormAgent] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [player, setPlayer] = useState<PlaybackState>(idlePlayer);
  const [native, setNative] = useState<NativeInfo | null>(null);
  const game = games.find((g) => g.id === gameId) ?? null;
  const activeGame = games.find((g) => g.id === player.gameId);
  const drafts = useRef(new Map<string, PlaybackRequest>());
  const cache = useRef(new Map<string, GameStats>());
  const video = useRef<HTMLDivElement>(null);
  const scheduleBusy = useRef(false);
  const cacheRead = useRef(false);
  const scrollPosition = useRef(0);
  const content = useRef<HTMLElement>(null);
  const lastGame = useRef<Game | null>(null);
  lastGame.current = game;
  const refreshSchedule = useCallback(async () => {
    if (scheduleBusy.current) return;
    scheduleBusy.current = true;
    setLoading(true);
    try {
      const current = localDays();
      setDays(current);
      setSelectedDay((d) => (d < current.today ? current.today : d));
      if (!cacheRead.current) {
        cacheRead.current = true;
        const saved = await api.fetchCachedSchedule(current.dates);
        if (saved) {
          setGames(parseGames(saved.data));
          setCached(true);
          setUpdated(saved.fetchedAt);
        }
      }
      const r = await api.fetchSchedule(current.dates);
      setGames((old) => {
        const parsed = parseGames(r.data);
        return [
          ...parsed,
          ...old.filter(
            (g) => !parsed.some((n) => n.id === g.id) && tabs.includes(g.id),
          ),
        ];
      });
      setCached(r.cached);
      setUpdated(r.fetchedAt);
      setScheduleError(r.warning ?? "");
    } catch (e) {
      setScheduleError(String(e));
    } finally {
      setLoading(false);
      scheduleBusy.current = false;
    }
  }, [tabs]);
  useEffect(() => {
    void refreshSchedule();
    const timer = setInterval(() => {
      if (!document.hidden) void refreshSchedule();
    }, 120000);
    const resume = () => {
      if (!document.hidden) void refreshSchedule();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refreshSchedule]);
  useEffect(() => {
    void api
      .nativeInfo()
      .then(setNative)
      .catch((e) => setNative({ available: false, message: String(e) }));
    if (!api.desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<PlaybackState>("player-state", (e) => {
      setPlayer(e.payload);
      if (["playing", "error", "ended", "idle"].includes(e.payload.status))
        setSubmitting(false);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("hideScores", String(hidden));
  }, [hidden]);
  const refreshStats = useCallback(async () => {
    const selected = lastGame.current;
    if (!selected) return;
    setStatsLoading(true);
    try {
      const r = await api.fetchStats(selected.id);
      const next = parseStats(r.data, selected);
      cache.current.set(selected.id, next);
      if (lastGame.current?.id === selected.id) {
        setStats(next);
        setStatsError(r.warning ?? "");
        setGames((old) =>
          old.map((g) => (g.id === selected.id ? mergeSummary(g, r.data) : g)),
        );
      }
    } catch (e) {
      if (lastGame.current?.id === selected.id) setStatsError(String(e));
    } finally {
      if (lastGame.current?.id === selected.id) setStatsLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!gameId || view === "games" || (view === "watch" && !sidebar)) {
      setStatsLoading(false);
      return;
    }
    setStats(cache.current.get(gameId) ?? null);
    setStatsError("");
    void refreshStats();
    const interval = setInterval(() => {
      if (!document.hidden && lastGame.current?.status === "live")
        void refreshStats();
    }, 20000);
    return () => clearInterval(interval);
  }, [gameId, view, sidebar, refreshStats]);
  const sourceVisible = sourceOpen && view === "watch";
  const nativeVisible =
    view === "watch" &&
    !sourceVisible &&
    player.gameId === gameId &&
    ["loading", "playing", "buffering", "paused"].includes(player.status);
  useEffect(() => {
    const el = video.current;
    if (!el || !api.desktop) {
      void api.setViewport({ x: 0, y: 0, width: 0, height: 0, visible: false });
      return;
    }
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const bounds = el.closest(".content")?.getBoundingClientRect();
        const scale = window.devicePixelRatio;
        void api
          .setViewport({
            clipTop: Math.round(
              Math.max(0, (bounds?.top ?? r.top) - r.top) * scale,
            ),
            clipBottom: Math.round(
              Math.max(0, r.bottom - (bounds?.bottom ?? r.bottom)) * scale,
            ),
            x: Math.round(r.x * scale),
            y: Math.round(r.y * scale),
            width: Math.round(r.width * scale),
            height: Math.round(r.height * scale),
            visible: nativeVisible,
          })
          .catch(() => {});
      });
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener("resize", sync);
    document.addEventListener("scroll", sync, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", sync);
      document.removeEventListener("scroll", sync, true);
      void api.setViewport({ x: 0, y: 0, width: 0, height: 0, visible: false });
    };
  }, [nativeVisible, sidebar, view, sourceVisible, gameId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if (e.key === "Escape") void api.fullscreen(true);
      if (view === "watch" && e.key.toLowerCase() === "s")
        setSidebar((s) => !s);
      if (view === "watch" && e.code === "Space") {
        e.preventDefault();
        void api.control("pause").catch((e) => setFormError(String(e)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);
  const selectGame = (g: Game, watch = false) => {
    if (view === "games")
      scrollPosition.current = content.current?.scrollTop ?? 0;
    setGameId(g.id);
    setTabs((old) => {
      if (old.includes(g.id)) return old;
      if (old.length < 8) return [...old, g.id];
      const evict = old.find((id) => id !== player.gameId) ?? old[0];
      drafts.current.delete(evict);
      cache.current.delete(evict);
      return [...old.filter((id) => id !== evict), g.id];
    });
    setView(watch ? "watch" : "details");
    setSourceOpen(watch);
    setFormError("");
    if (watch) {
      const draft = drafts.current.get(g.id);
      setFormUrl(draft?.url ?? "");
      setFormReferrer(draft?.referrer ?? "");
      setFormAgent(draft?.userAgent ?? "");
    }
  };
  const goHome = () => {
    setView("games");
    setSourceOpen(false);
    requestAnimationFrame(() => {
      if (content.current) content.current.scrollTop = scrollPosition.current;
    });
  };
  const closeTab = (id: string) => {
    if (player.gameId === id) void api.control("stop");
    drafts.current.delete(id);
    cache.current.delete(id);
    setTabs((old) => old.filter((t) => t !== id));
    if (gameId === id) {
      setGameId(null);
      goHome();
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!game) return;
    const error = validateSource(formUrl, formReferrer);
    if (error) {
      setFormError(error);
      return;
    }
    if (/[\r\n]/.test(formAgent)) {
      setFormError("User-Agent must be a single line.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    const request = {
      gameId: game.id,
      url: formUrl.trim(),
      referrer: formReferrer.trim(),
      userAgent: formAgent.trim(),
    };
    drafts.current.set(game.id, request);
    try {
      await api.play(request);
      setSourceOpen(false);
    } catch (e) {
      setFormError(String(e));
      setSubmitting(false);
    }
  };
  const perform = (action: string, value?: number) => {
    void api.control(action, value).catch((e) => setFormError(String(e)));
  };
  const dateHeading = new Date(selectedDay + "T12:00:00").toLocaleDateString(
    [],
    { weekday: "long", month: "long", day: "numeric" },
  );
  const listed = gamesForDay(games, selectedDay, days.today);
  const liveCount = games.filter((g) => g.status === "live").length;
  const hasSession = player.gameId !== null && player.status !== "idle";
  return (
    <div className="app-shell">
      <div className="app-main">
        <header className="topbar">
          <button className="wordmark" onClick={goHome}>
            courtside<span>NBA WATCH</span>
          </button>
          <div className="topbar-right">
            <span className="season">2026—27 SEASON</span>
            <span className="header-divider" />
            <span className="local-zone">
              <Clock3 size={13} />
              {Intl.DateTimeFormat()
                .resolvedOptions()
                .timeZone.replaceAll("_", " ")}
            </span>
          </div>
        </header>
        <nav className="tab-strip" aria-label="App tabs">
          <button
            className={"app-tab " + (view === "games" ? "active" : "")}
            onClick={goHome}
          >
            <CalendarDays size={14} />
            Games
          </button>
          {tabs.map((id) => {
            const g = games.find((x) => x.id === id);
            return (
              g && (
                <div
                  className={
                    "app-tab game-tab " +
                    (view !== "games" && id === gameId ? "active" : "")
                  }
                  key={id}
                >
                  <button
                    onClick={() => {
                      setGameId(id);
                      setView(player.gameId === id ? "watch" : "details");
                      setSourceOpen(false);
                    }}
                  >
                    {player.gameId === id ? (
                      <Radio size={13} />
                    ) : (
                      <Activity size={13} />
                    )}{" "}
                    {g.away.abbreviation} vs {g.home.abbreviation}
                  </button>
                  <button
                    className="close-tab"
                    aria-label={"Close " + g.away.abbreviation + " tab"}
                    onClick={() => closeTab(id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            );
          })}
          <span className="tabs-spacer" />
          <span className="personal-label">YOUR COURTSIDE SEAT</span>
        </nav>
        <main
          className={"content " + (view === "watch" ? "watch-content" : "")}
          ref={content}
        >
          {view === "games" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">THE DAILY LINEUP</div>
                  <h1>Every game. Your court.</h1>
                  <p>
                    Your NBA day, all in one place. Pick a matchup and settle
                    in.
                  </p>
                </div>
                <div className="today-stamp">
                  <span className="live-dot" />
                  {liveCount ? liveCount + " live now" : "Ready for tip-off"}
                </div>
              </div>
              <div className="schedule-toolbar">
                <div className="day-tabs">
                  <button
                    className={selectedDay === days.today ? "active" : ""}
                    onClick={() => setSelectedDay(days.today)}
                  >
                    Today{" "}
                    <span>{new Date(days.today + "T12:00:00").getDate()}</span>
                  </button>
                  <button
                    className={selectedDay === days.tomorrow ? "active" : ""}
                    onClick={() => setSelectedDay(days.tomorrow)}
                  >
                    Tomorrow{" "}
                    <span>
                      {new Date(days.tomorrow + "T12:00:00").getDate()}
                    </span>
                  </button>
                </div>
                <div className="toolbar-actions">
                  <button
                    className="text-button"
                    onClick={() => setHidden((v) => !v)}
                  >
                    {hidden ? <Eye size={15} /> : <EyeOff size={15} />}{" "}
                    {hidden ? "Show scores" : "Hide scores"}
                  </button>
                  <button
                    className={"icon-button " + (loading ? "refreshing" : "")}
                    onClick={() => void refreshSchedule()}
                    title="Refresh schedule"
                    aria-label="Refresh schedule"
                    disabled={loading}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>
              <div className="date-row">
                <h2>{dateHeading}</h2>
                <span>
                  {listed.length} {listed.length === 1 ? "GAME" : "GAMES"}
                  <span className="dot-separator">·</span>LOCAL TIMES
                </span>
              </div>
              {scheduleError && (
                <div className="notice">
                  <CircleHelp size={16} />
                  <span>
                    {games.length ? "Showing saved data. " : ""}
                    {scheduleError}
                  </span>
                  <button onClick={() => void refreshSchedule()}>Retry</button>
                </div>
              )}
              <div className="game-list">
                {loading && !games.length
                  ? Array.from({ length: 3 }, (_, i) => (
                      <div className="skeleton-card" key={i} />
                    ))
                  : listed.length
                    ? listed.map((g) => (
                        <GameCard
                          key={g.id}
                          game={g}
                          hidden={hidden}
                          onDetails={() => selectGame(g)}
                          onWatch={() => selectGame(g, true)}
                        />
                      ))
                    : !loading && (
                        <div className="empty">
                          <CalendarDays />
                          <h3>A little time off the court</h3>
                          <p>
                            No NBA games are listed for this day. Check tomorrow
                            or refresh the schedule.
                          </p>
                          <button
                            className="secondary"
                            onClick={() => setSelectedDay(days.tomorrow)}
                          >
                            View tomorrow
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      )}
              </div>
              <footer className="schedule-footer">
                <span>
                  <Check size={13} />
                  {updated
                    ? (cached ? "Saved schedule" : "Schedule updated") +
                      " · " +
                      new Date(updated).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Schedule supplied by ESPN"}
                </span>
                <span>Click a matchup for stats. Watch on your terms.</span>
              </footer>
              <div className="bottom-note">
                <span className="mini-ball">◉</span>
                <span>Good basketball. Less noise.</span>
              </div>
            </>
          ) : game ? (
            <>
              <div className="workspace-heading">
                <button className="back-link" onClick={goHome}>
                  <ArrowLeft size={15} />
                  All games
                </button>
                <div className="workspace-title">
                  <h1>
                    {game.away.city} <span>vs</span> {game.home.city}
                  </h1>
                  <p>
                    {game.venue}
                    <span className="dot-separator">·</span>
                    {new Date(game.date).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="workspace-actions">
                  <button
                    className="text-button"
                    onClick={() => setHidden((v) => !v)}
                  >
                    {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                    <span>{hidden ? "Reveal" : "Hide"} scores</span>
                  </button>
                  {view === "details" ? (
                    <button
                      className="primary"
                      onClick={() => selectGame(game, true)}
                    >
                      <Play size={14} />
                      Watch game
                    </button>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => setSidebar((s) => !s)}
                    >
                      {sidebar ? (
                        <PanelRightClose size={16} />
                      ) : (
                        <PanelRightOpen size={16} />
                      )}
                      Stats
                    </button>
                  )}
                </div>
              </div>
              {view === "details" ? (
                <section className="details-card">
                  <Stats
                    game={game}
                    stats={stats}
                    loading={statsLoading}
                    error={statsError}
                    onRetry={() => void refreshStats()}
                    hidden={hidden}
                  />
                </section>
              ) : (
                <div
                  className={"watch-layout " + (sidebar ? "with-sidebar" : "")}
                >
                  <section className="player-section">
                    <div className="video-stage" ref={video}>
                      {sourceVisible ? (
                        <div className="source-card">
                          <div className="source-icon">
                            <Play size={22} />
                          </div>
                          <div className="eyebrow">YOUR STREAM. YOUR SEAT.</div>
                          <h2>Bring the game courtside.</h2>
                          <p>
                            Paste the media request from your browser.
                            <br />
                            We'll take it from here.
                          </p>
                          <form onSubmit={submit}>
                            <label htmlFor="stream-url">
                              Request URL <span>REQUIRED</span>
                            </label>
                            <input
                              autoFocus
                              id="stream-url"
                              type="url"
                              value={formUrl}
                              onChange={(e) => setFormUrl(e.target.value)}
                              placeholder="https://…/index.m3u8"
                              required
                              spellCheck={false}
                            />
                            <label htmlFor="stream-referrer">
                              Referrer <span>OPTIONAL</span>
                            </label>
                            <input
                              id="stream-referrer"
                              type="url"
                              value={formReferrer}
                              onChange={(e) => setFormReferrer(e.target.value)}
                              placeholder="https://player-website.com/"
                              spellCheck={false}
                            />
                            <small className="field-help">
                              Use the successful request's Referer header, if
                              needed.
                            </small>
                            <details>
                              <summary>
                                Advanced options
                                <ChevronDown size={13} />
                              </summary>
                              <label htmlFor="stream-agent">User-Agent</label>
                              <input
                                id="stream-agent"
                                value={formAgent}
                                onChange={(e) => setFormAgent(e.target.value)}
                                placeholder="Leave blank to use the default"
                                spellCheck={false}
                              />
                            </details>
                            {formError && (
                              <div className="form-error" role="alert">
                                {formError}
                              </div>
                            )}
                            {native && !native.available && (
                              <div className="native-warning">
                                {native.message}
                              </div>
                            )}
                            {hasSession && player.gameId !== game.id && (
                              <small className="field-help">
                                Playing this stream will replace the current
                                game.
                              </small>
                            )}
                            <div className="form-actions">
                              <button
                                type="button"
                                className="text-button"
                                onClick={() =>
                                  hasSession && player.gameId === game.id
                                    ? setSourceOpen(false)
                                    : setView("details")
                                }
                              >
                                Cancel / Back
                              </button>
                              <button
                                className="primary"
                                disabled={
                                  submitting ||
                                  !formUrl.trim() ||
                                  !native?.available
                                }
                                type="submit"
                              >
                                <Play size={14} fill="currentColor" />
                                {submitting ? "Connecting…" : "Play stream"}
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <div className="video-message">
                          {player.status === "error" ? (
                            <>
                              <CircleHelp size={32} />
                              <h2>Couldn't connect to this stream</h2>
                              <p>
                                {player.error ||
                                  "Check the URL, referrer, or source availability."}
                              </p>
                              <button
                                className="primary"
                                onClick={() => {
                                  setSourceOpen(true);
                                  const d = drafts.current.get(game.id);
                                  setFormUrl(d?.url ?? "");
                                  setFormReferrer(d?.referrer ?? "");
                                }}
                              >
                                Edit source
                              </button>
                            </>
                          ) : player.status === "ended" ? (
                            <>
                              <Trophy size={32} />
                              <h2>That's the final buzzer.</h2>
                              <p>The stream has ended.</p>
                              <button
                                className="primary"
                                onClick={() => selectGame(game, true)}
                              >
                                Change source
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="video-ball">◉</span>
                              <h2>
                                {player.gameId === game.id
                                  ? "Connecting to your stream…"
                                  : "Your courtside seat is ready"}
                              </h2>
                              <p>
                                {player.gameId === game.id
                                  ? "Video is rendered natively by libmpv."
                                  : "Add a stream to start watching this matchup."}
                              </p>
                              {player.gameId !== game.id && (
                                <button
                                  className="primary"
                                  onClick={() => selectGame(game, true)}
                                >
                                  Add stream
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="player-controls">
                      <div>
                        <button
                          className="icon-button"
                          title={player.paused ? "Play" : "Pause"}
                          aria-label={player.paused ? "Play" : "Pause"}
                          disabled={!hasSession}
                          onClick={() => perform("pause")}
                        >
                          {player.paused ? (
                            <Play size={18} />
                          ) : (
                            <Pause size={18} />
                          )}
                        </button>
                        <button
                          className="icon-button"
                          title="Back 5 seconds"
                          aria-label="Back 5 seconds"
                          disabled={!player.seekable}
                          onClick={() => perform("seek", -5)}
                        >
                          <RotateCcw size={17} />
                        </button>
                        <button
                          className="icon-button"
                          title="Forward 5 seconds"
                          aria-label="Forward 5 seconds"
                          disabled={!player.seekable}
                          onClick={() => perform("seek", 5)}
                        >
                          <RotateCw size={17} />
                        </button>
                        <button
                          className="icon-button"
                          title="Mute"
                          aria-label="Mute"
                          disabled={!hasSession}
                          onClick={() => perform("mute")}
                        >
                          {player.muted ? (
                            <VolumeX size={18} />
                          ) : (
                            <Volume2 size={18} />
                          )}
                        </button>
                        <input
                          aria-label="Volume"
                          className="volume"
                          type="range"
                          min="0"
                          max="100"
                          value={player.volume}
                          onChange={(e) =>
                            perform("volume", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="controls-right">
                        <span className="player-status">
                          <i className={hasSession ? "live-dot" : ""} />
                          {hasSession ? player.status : "NO STREAM"}
                        </span>
                        {hasSession && (
                          <span className="cache-label">
                            {Math.round(player.cacheSeconds)}s buffer
                          </span>
                        )}
                        <button
                          className="text-button"
                          onClick={() => selectGame(game, true)}
                        >
                          Change source
                        </button>
                        <button
                          className="icon-button"
                          title="Stop playback"
                          aria-label="Stop playback"
                          disabled={!hasSession}
                          onClick={() => perform("stop")}
                        >
                          <Square size={14} />
                        </button>
                        <button
                          className="icon-button"
                          title="Fullscreen"
                          aria-label="Fullscreen"
                          onClick={() => void api.fullscreen()}
                        >
                          <Maximize2 size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="player-caption">
                      <span>
                        <span className="live-dot" />
                        Native playback · libmpv
                      </span>
                      <span>Space to pause · S for stats</span>
                    </div>
                  </section>
                  {sidebar && (
                    <aside className="stats-sidebar">
                      <div className="sidebar-heading">
                        <h2>Courtside stats</h2>
                        <button
                          className="icon-button"
                          aria-label="Close stats panel"
                          onClick={() => setSidebar(false)}
                        >
                          <X size={17} />
                        </button>
                      </div>
                      <Stats
                        game={game}
                        stats={stats}
                        loading={statsLoading}
                        error={statsError}
                        onRetry={() => void refreshStats()}
                        compact
                        hidden={hidden}
                      />
                    </aside>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <p>Select a game to get started.</p>
              <button onClick={goHome}>Back to games</button>
            </div>
          )}
        </main>
        {hasSession && view !== "watch" && (
          <div className="now-playing">
            <Radio size={16} />
            <span>
              Now playing ·{" "}
              {activeGame
                ? activeGame.away.abbreviation +
                  " vs " +
                  activeGame.home.abbreviation
                : "Your stream"}
            </span>
            <button
              onClick={() => {
                if (player.gameId) {
                  setGameId(player.gameId);
                  setView("watch");
                  setSourceOpen(false);
                }
              }}
            >
              Return to player
              <ArrowRight size={14} />
            </button>
            <button aria-label="Stop stream" onClick={() => perform("stop")}>
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
