import path from "node:path";
import { fileURLToPath } from "node:url";
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
import fs from "node:fs";
const dir = path.join(projectRoot, "public/teams");
fs.mkdirSync(dir, { recursive: true });
const r = await fetch(
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=100",
);
if (!r.ok) throw Error("Teams endpoint failed");
const data = await r.json();
const teams = data.sports[0].leagues[0].teams.map((t) => t.team);
let done = 0;
for (let i = 0; i < teams.length; i += 5)
  await Promise.all(
    teams.slice(i, i + 5).map(async (t) => {
      const url = t.logos?.[0]?.href;
      if (!url) return;
      const response = await fetch(url);
      if (response.ok) {
        fs.writeFileSync(
          dir + "/" + t.id + ".png",
          Buffer.from(await response.arrayBuffer()),
        );
        done++;
      }
    }),
  );
fs.writeFileSync(
  path.join(projectRoot, "src/logo-ids.json"),
  JSON.stringify(teams.map((t) => t.id)),
);
console.log("Saved " + done + " team logos for offline rendering.");
