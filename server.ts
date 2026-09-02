import "dotenv/config";
import express from "express";
import { resolve } from "path";
import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ServerIntensityAggregator } from "./server-intensity";

export function createApp() {
  const app = express();
  
  // Nginx 등 프록시 뒤에서 실행될 경우, 클라이언트 IP를 올바르게 식별하기 위해 필요합니다.
  app.set('trust proxy', 1);
  
  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow Vite inline scripts and external map assets in dev
    crossOriginEmbedderPolicy: false,
  }));

  // Rate Limiting (Prevent brute-force & resource exhaustion)
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000, // Limit each IP to 1000 requests per minute (allows for 1Hz polling + map tiles/images)
    message: { error: "Too many requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  app.use("/api/", apiLimiter);
  app.use("/proxy", apiLimiter);

  const aggregator = new ServerIntensityAggregator();

  // 1. 실시간 가공 진도 데이터 SSE (Server-Sent Events) 스트림
  app.get("/api/intensity/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    const unsubscribe = aggregator.subscribeSSE((payload) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {}
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  // 2. 최신 진도 데이터 단건 조회 (REST 폴링 폴백용)
  app.get("/api/intensity/latest", (req, res) => {
    const source = (req.query.source as 'kmoni' | 'yahoo') || 'kmoni';
    const payload = aggregator.getLatestPayload(source);
    if (!payload) {
      return res.status(503).json({ error: "Initializing intensity data..." });
    }
    res.json(payload);
  });

  // 3. 데이터 소스 모드 전환 (kmoni / yahoo) -> No-op for global state protection
  app.post("/api/intensity/mode", express.json(), (req, res) => {
    // The frontend sends this, but we ignore it on the backend 
    // to prevent one user from changing the data source for all users globally.
    // Both data sources are now polled concurrently.
    const mode = req.body?.mode;
    
    // Input Validation (Strict type and value checking)
    if (!mode || typeof mode !== 'string' || (mode !== "kmoni" && mode !== "yahoo")) {
      return res.status(400).json({ error: "Invalid mode. Use 'kmoni' or 'yahoo'." });
    }
    
    return res.json({ success: true, mode });
  });

  // 4. KMA Earthquake API (Proxy)
  app.get("/api/kma/earthquake", async (req, res) => {
    try {
      const authKey = req.query.authKey || process.env.KMA_AUTH_KEY;
      if (!authKey || typeof authKey !== 'string') {
        return res.status(400).json({ error: "API Key is required" });
      }

      // Input Validation: Prevent injection attacks by allowing only alphanumeric and basic symbols
      if (!/^[a-zA-Z0-9_-]+$/.test(authKey)) {
        return res.status(400).json({ error: "Invalid API Key format" });
      }

      const url = `https://apihub.kma.go.kr/api/typ01/url/eqk_now.php?disp=1&help=1&authKey=${authKey}`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `KMA API responded with status: ${response.status}` });
      }

      // The KMA API returns EUC-KR usually, but we fetch as arrayBuffer and decode
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('euc-kr');
      const text = decoder.decode(buffer);

      // Parse CSV format
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      const dataLines = lines.filter(line => !line.startsWith('#') && line.includes(','));
      
      if (dataLines.length === 0) {
         return res.json({ event: null, raw: text });
      }

      // 1. TP     : 2(국외지진정보), 3(국내지진통보), 5(지진정보(재통보)), 10(지진현장경보), 11(지진조기경보), 12(국외지진조기경보(시범)), 14(지진속보)
      // Pick the latest domestic one, or fallback to the latest one overall
      let selectedLine = dataLines[dataLines.length - 1];
      const domesticLines = dataLines.filter(line => {
        const type = line.split(',')[0].trim();
        return ['3', '5', '10', '11', '14'].includes(type);
      });
      if (domesticLines.length > 0) {
        selectedLine = domesticLines[domesticLines.length - 1];
      }

      const fields = selectedLine.split(',').map(f => f.trim());
      
      // Format time: 20260831024920.000 -> 2026-08-31 02:49:20
      let timeFormatted = fields[3] || "";
      if (timeFormatted.length >= 14) {
        timeFormatted = `${timeFormatted.substring(0,4)}-${timeFormatted.substring(4,6)}-${timeFormatted.substring(6,8)} ${timeFormatted.substring(8,10)}:${timeFormatted.substring(10,12)}:${timeFormatted.substring(12,14)}`;
      }
      
      // We send back both the raw fields and parsed structure
      res.json({
        event: {
          time: timeFormatted,
          lat: Number(parseFloat(fields[5])) || 0,
          lon: Number(parseFloat(fields[6])) || 0,
          location: fields[7] || "Unknown",
          magnitude: Number(parseFloat(fields[4])) || 0,
          depth: "", // KMA eqk_now.php CSV doesn't provide explicit depth in this format
          raw: fields
        },
        rawText: text
      });
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message.includes('fetch failed')) {
        // Suppress
      } else {
        console.error("[KMA Proxy Error]:", error.message);
      }
      res.status(500).json({ error: "Failed to fetch from KMA API" });
    }
  });

  // Proxy endpoint to bypass CORS for Yahoo API and Kyoshin Monitor (kmoni)
  const ALLOWED_PROXY_HOSTS = [
    "weather-kyoshin.west.edge.storage-yahoo.jp",
    "api.wolfx.jp",
    "www.kmoni.bosai.go.jp",
    "www.j-shis.bosai.go.jp"
  ];

  app.get("/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    
    // Strict input validation
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: "Missing or invalid url parameter" });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      return res.status(400).json({ error: "Malformed URL provided" });
    }

    // Authorization & SSRF Prevention: Only allow requests to known, safe third-party APIs
    if (!ALLOWED_PROXY_HOSTS.includes(parsedUrl.hostname)) {
      console.warn(`[Security] Blocked unauthorized proxy request to: ${parsedUrl.hostname}`);
      return res.status(403).json({ error: "Access to this host is forbidden (SSRF Protection)" });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Target responded with status: ${response.status}` });
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json") || targetUrl.endsWith(".json")) {
        const data = await response.json();
        res.json(data);
      } else {
        const buffer = await response.arrayBuffer();
        res.setHeader("Content-Type", contentType || "image/gif");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.send(Buffer.from(buffer));
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message.includes('fetch failed')) {
        // Suppress verbose logging for routine timeout/network errors from frequent polling
        // console.warn(`[Proxy Error] Network issue fetching ${targetUrl}`);
      } else {
        console.error(`[Proxy Error] URL: ${targetUrl} | Message:`, error.message);
      }
      res.status(500).json({ error: "Failed to fetch from target URL" });
    }
  });

  // Global Error Handler to catch any unhandled exceptions and prevent stack trace leaks
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Unhandled Exception]:', err.message);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}

export async function startServer() {
  const app = createApp();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Support standard Express v4/v5 SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(resolve(distPath, 'index.html'));
    });
  }

  /**
   * Start the server if this module is the main entry point, or it is ran via PM2.
   * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
   */
  if (process.env['pm_id'] || process.env['NODE_ENV'] !== 'test') {
    const host = process.env['HOST'] || "0.0.0.0";
    const port = Number(process.env['PORT']) || 3000;
    const certPath = resolve("./cert.pem");
    const keyPath = resolve("./key.pem");

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const sslOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      };
      https.createServer(sslOptions, app).listen(port, host, () => {
        console.log(`Node Express server listening on https://${host}:${port}`);
      });
    } else {
      app.listen(port, host, () => {
        console.log(`Node Express server listening on http://${host}:${port}`);
      });
    }
  }

  return app;
}

startServer();

