import path from "node:path";
import { fileURLToPath } from "node:url";
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
import { chromium } from "@playwright/test";
import fs from "node:fs";
const artifacts = path.join(projectRoot, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  timezoneId: "Asia/Ho_Chi_Minh",
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
process.on("uncaughtException", async (error) => {
  console.error(error);
  try {
    console.log((await page.locator("body").innerText()).slice(-6500));
    await page.screenshot({ path: artifacts + "/failure.png", fullPage: true });
  } finally {
    await browser.close();
    process.exit(1);
  }
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
});
const teams = [
  {
    id: "13",
    abbreviation: "LAL",
    displayName: "Los Angeles Lakers",
    shortDisplayName: "Lakers",
    color: "552583",
    logo: "https://a.espncdn.com/i/teamlogos/nba/500/lal.png",
  },
  {
    id: "9",
    abbreviation: "GS",
    displayName: "Golden State Warriors",
    shortDisplayName: "Warriors",
    color: "1D428A",
    logo: "https://a.espncdn.com/i/teamlogos/nba/500/gs.png",
  },
  {
    id: "2",
    abbreviation: "BOS",
    displayName: "Boston Celtics",
    shortDisplayName: "Celtics",
    color: "007A33",
    logo: "https://a.espncdn.com/i/teamlogos/nba/500/bos.png",
  },
  {
    id: "18",
    abbreviation: "NY",
    displayName: "New York Knicks",
    shortDisplayName: "Knicks",
    color: "006BB6",
    logo: "https://a.espncdn.com/i/teamlogos/nba/500/ny.png",
  },
];
function event(id, away, home, state, time) {
  return {
    id,
    date: today + "T" + time + ":00+07:00",
    name: away.displayName + " at " + home.displayName,
    competitions: [
      {
        date: today + "T" + time + ":00+07:00",
        status: {
          type: {
            state,
            completed: state === "post",
            shortDetail:
              state === "in"
                ? "Q3 · 6:42"
                : state === "post"
                  ? "Final"
                  : "Scheduled",
          },
          period: state === "in" ? 3 : 0,
        },
        venue: { fullName: "Chase Center" },
        broadcasts: [{ names: ["ESPN"] }],
        competitors: [
          {
            homeAway: "away",
            team: away,
            score: "78",
            records: [{ summary: "3-1" }],
            linescores: [{ value: 26 }, { value: 28 }, { value: 24 }],
          },
          {
            homeAway: "home",
            team: home,
            score: "74",
            records: [{ summary: "2-2" }],
            linescores: [{ value: 24 }, { value: 27 }, { value: 23 }],
          },
        ],
      },
    ],
  };
}
const events = [
  event("42", teams[0], teams[1], "in", "09:00"),
  event("43", teams[2], teams[3], "pre", "11:30"),
  event("44", teams[1], teams[2], "post", "07:30"),
];
await page.route("https://site.api.espn.com/**", async (route) => {
  if (route.request().url().includes("/summary"))
    await route.fulfill({
      json: {
        header: events[0],
        boxscore: {
          teams: teams.slice(0, 2).map((team, i) => ({
            team,
            statistics: [
              {
                name: "fieldGoalsMade-fieldGoalsAttempted",
                displayValue: i ? "28-59" : "30-61",
              },
              { name: "assists", displayValue: i ? "17" : "21" },
              { name: "totalRebounds", displayValue: i ? "31" : "34" },
            ],
          })),
          players: teams.slice(0, 2).map((team, i) => ({
            team,
            statistics: [
              {
                labels: ["MIN", "PTS", "REB", "AST"],
                athletes: [
                  {
                    athlete: {
                      id: String(i),
                      displayName: i ? "Stephen Curry" : "LeBron James",
                      position: { abbreviation: "F" },
                    },
                    starter: true,
                    stats: ["28", "24", "6", "7"],
                  },
                ],
              },
            ],
          })),
        },
      },
    });
  else await route.fulfill({ json: { events } });
});
await page.goto("http://127.0.0.1:1420/", {waitUntil:"domcontentloaded",timeout:60000});
await page.getByRole("heading", { name: "Every game. Your court." }).waitFor();
await page.locator(".game-card").first().waitFor();
if ((await page.locator(".game-card").count()) !== 3)
  throw Error("Expected deduplicated cards");
await page.screenshot({ path: artifacts + "/dashboard.png", fullPage: true });
await page
  .getByRole("button", { name: "View stats for " + events[0].name })
  .click();
await page.getByText("TEAM COMPARISON", { exact: true }).waitFor();
await page.getByRole("button", { name: "Box score", exact: true }).click();
await page.getByText("LeBron James", { exact: false }).waitFor();
await page.getByRole("button", { name: "Watch game", exact: true }).click();
await page.getByLabel("Request URL REQUIRED").waitFor();
await page.getByLabel("Referrer OPTIONAL").fill("https://player.example/");
await page
  .getByLabel("Request URL REQUIRED")
  .fill("https://video.example/live?token=a%2Fb&n=1");
await page.screenshot({ path: artifacts + "/watch-form.png", fullPage: true });
await page.getByRole("button", { name: "Cancel / Back", exact: true }).click();
await page.locator(".details-card").waitFor();
await page.getByRole("button", { name: "Watch game", exact: true }).click();
await page
  .getByRole("button", { name: "Close stats panel", exact: true })
  .click();
if ((await page.locator(".stats-sidebar").count()) !== 0)
  throw Error("Sidebar did not close");
await page.getByRole("button", { name: "Stats", exact: true }).click();
await page.locator(".stats-sidebar").waitFor();
await page.getByRole("button", { name: "All games", exact: true }).click();
await page.getByRole("button", { name: "Tomorrow", exact: false }).click();
await page
  .getByRole("heading", { name: "A little time off the court" })
  .waitFor();
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "UI checks passed: schedule, card action separation, stats, box score, source fields, cancel, sidebar, date navigation.",
);
await browser.close();

