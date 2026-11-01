import http from "node:http";
const root = "https://test-streams.mux.dev/x36xhzz/";
const port = Number(process.env.MEDIA_TEST_PORT ?? 9331);
const expected = process.env.EXPECTED_REFERRER ?? "https://player.example/";
let valid = 0,
  denied = 0;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:9331");
    if (url.pathname === "/counts") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ valid, denied }));
      return;
    }
    if ((req.headers.referer ?? "") !== expected) {
      denied++;
      res.writeHead(403);
      res.end("Wrong referrer");
      return;
    }
    valid++;
    const target = url.searchParams.get("target") ?? root + "x36xhzz.m3u8";
    if (!target.startsWith(root)) {
      res.writeHead(400);
      res.end();
      return;
    }
    const response = await fetch(target);
    if (!response.ok) {
      res.writeHead(response.status);
      res.end();
      return;
    }
    if (target.includes(".m3u8")) {
      const text = await response.text();
      const rewritten = text
        .split("\n")
        .map((line) =>
          line.trim() && !line.startsWith("#")
            ? "http://127.0.0.1:" +
              port +
              "/proxy?target=" +
              encodeURIComponent(new URL(line, target).href)
            : line,
        )
        .join("\n");
      res.setHeader("content-type", "application/vnd.apple.mpegurl");
      res.end(rewritten);
    } else {
      res.setHeader(
        "content-type",
        response.headers.get("content-type") ?? "video/mp2t",
      );
      res.end(Buffer.from(await response.arrayBuffer()));
    }
  } catch {
    res.writeHead(502);
    res.end();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log("Local referrer-verification fixture listening on " + port),
);
