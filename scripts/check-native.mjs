import path from "node:path";
import { fileURLToPath } from "node:url";
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
import { chromium } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
const page = context.pages()[0];
page.setDefaultTimeout(25000);
console.log("Page:", await page.title());
console.log(
  "Player:",
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("player_info")),
);
await page.getByRole("button", { name: "Games", exact: true }).first().click();
await page.locator(".game-card").first().waitFor();
console.log("Schedule cards:", await page.locator(".game-card").count());
await page
  .getByRole("button", { name: "Watch game", exact: true })
  .first()
  .click();
await page
  .getByLabel("Request URL REQUIRED")
  .fill(
    process.env.TEST_STREAM_URL ??
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  );
await page
  .getByLabel("Referrer OPTIONAL")
  .fill(process.env.TEST_REFERRER ?? "https://test-streams.mux.dev/");
await page.getByRole("button", { name: "Play stream", exact: true }).click();
let state;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  state = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("player_state"),
  );
  if (state.status === "playing" && state.position > 2) break;
  if (state.status === "error") break;
}
console.log("Playback:", JSON.stringify(state));
fs.writeFileSync(
  path.join(projectRoot, "artifacts/native-state.json"),
  JSON.stringify(state, null, 2),
);
if (process.env.EXPECTED_PLAYER_ERROR === "1") {
  if (state.status !== "error") throw Error("Expected the test source to reject playback.");
  await page.getByRole("button", { name: "Edit source", exact: true }).click();
  if ((await page.getByLabel("Request URL REQUIRED").inputValue()) !== process.env.TEST_STREAM_URL) throw Error("Failed source URL was not preserved.");
  if ((await page.getByLabel("Referrer OPTIONAL").inputValue()) !== process.env.TEST_REFERRER) throw Error("Failed source referrer was not preserved.");
  console.log("Native failure checks passed: rejected source, actionable error, preserved source fields.");
  await browser.close();
  process.exit(0);
}
if (state.status !== "playing")
  throw Error("Native playback did not start: " + state.error);
await page.getByRole("button", { name: "Pause", exact: true }).click();
for(let attempt=0;attempt<30;attempt++){await new Promise(r=>setTimeout(r,250));const snapshot=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('player_state'));if(snapshot.paused)break;}
state = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("player_state"),
);
if (!state.paused) throw Error("Pause failed");
await page.getByRole("button", { name: "Play", exact: true }).click();
if (
  (await page
    .getByRole("button", { name: "Close stats panel", exact: true })
    .count()) === 0
)
  await page.getByRole("button", { name: "Stats", exact: true }).click();
await page
  .getByRole("button", { name: "Close stats panel", exact: true })
  .click();
await page.getByRole("button", { name: "Stats", exact: true }).click();
await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
await new Promise((r) => setTimeout(r, 500));
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Change source", exact: true }).click();
await page.getByRole("button", { name: "Cancel / Back", exact: true }).click();
state = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("player_state"),
);
for(let attempt=0;attempt<30 && state.status!=='playing';attempt++){await new Promise(r=>setTimeout(r,250));state=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('player_state'));}
if (state.status !== 'playing') throw Error('Playback interrupted by interface changes');
console.log(
  "Native checks passed: HLS playback, pause/resume, sidebar, fullscreen, source cancel.",
);
await page.screenshot({
  path: path.join(projectRoot, "artifacts/native-ui.png"),
});
await browser.close();


