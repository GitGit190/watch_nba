import { describe, it, expect } from "vitest";
import {
  gamesForDay,
  localDays,
  parseGames,
  parseStats,
  validateSource,
} from "./domain";
const raw = {
  events: [
    {
      id: "42",
      date: "2026-10-29T01:00:00Z",
      competitions: [
        {
          status: { type: { state: "in", shortDetail: "Q2 4:32" }, period: 2 },
          competitors: [
            {
              homeAway: "away",
              team: {
                id: "1",
                abbreviation: "MEM",
                displayName: "Memphis Grizzlies",
              },
              score: "48",
            },
            {
              homeAway: "home",
              team: {
                id: "2",
                abbreviation: "SAC",
                displayName: "Sacramento Kings",
              },
              score: "44",
            },
          ],
        },
      ],
    },
  ],
};
describe("media source validation", () => {
  it("accepts signed or extensionless media URLs without transformation", () => {
    expect(
      validateSource(
        " https://video.example/play?token=a%2Fb&x=1 ",
        "https://player.example/",
      ),
    ).toBeNull();
    expect(validateSource("https://example.com/live", "")).toBeNull();
  });
  it("rejects header injection and non HTTP schemes", () => {
    expect(
      validateSource(
        "https://example.com/a",
        "https://example.com/\r\nCookie:bad",
      ),
    ).not.toBeNull();
    expect(validateSource("file:///C:/secret", "")).not.toBeNull();
    expect(validateSource("", "")).not.toBeNull();
  });
});
describe("schedule normalization", () => {
  it("maps game status, team identities and scores", () => {
    const [g] = parseGames(raw);
    expect(g.id).toBe("42");
    expect(g.status).toBe("live");
    expect(g.away.score).toBe(48);
    expect(g.home.abbreviation).toBe("SAC");
  });
  it("deduplicates events across provider dates", () =>
    expect(parseGames({ events: [...raw.events, ...raw.events] })).toHaveLength(
      1,
    ));
  it("keeps previous-day live games discoverable today", () => {
    const [g] = parseGames(raw);
    g.date = "2026-10-28T01:00:00Z";
    expect(gamesForDay([g], "2026-10-29", "2026-10-29")).toHaveLength(1);
    expect(gamesForDay([g], "2026-10-30", "2026-10-29")).toHaveLength(0);
  });
  it("handles a local calendar rollover", () => {
    const d = localDays(new Date(2026, 11, 31, 23, 59));
    expect(d.today).toBe("2026-12-31");
    expect(d.tomorrow).toBe("2027-01-01");
    expect(d.dates.length).toBeGreaterThanOrEqual(3);
  });
});
describe("stats normalization", () => {
  it("preserves missing metrics rather than inventing zeros", () => {
    const stats = parseStats({}, parseGames(raw)[0]);
    expect(stats.metrics[0].away).toBe("—");
    expect(stats.boxTeams).toEqual([]);
  });
  it("preserves shooting counts", () => {
    const stats = parseStats(
      {
        boxscore: {
          teams: [
            {
              team: { id: "1" },
              statistics: [
                {
                  name: "fieldGoalsMade-fieldGoalsAttempted",
                  displayValue: "18-40",
                },
              ],
            },
          ],
        },
      },
      parseGames(raw)[0],
    );
    expect(stats.metrics[0].away).toBe("18-40");
  });
});

describe("provider line-score variants", () => {
  it("reads summary displayValue and preserves unavailable quarters", () => {
    const copy: any = structuredClone(raw);
    copy.events[0].competitions[0].competitors[0].linescores = [
      { displayValue: "32" },
      { displayValue: "23" },
      {},
    ];
    const game = parseGames(copy)[0];
    expect(game.away.quarters).toEqual([32, 23, null]);
  });
});
