import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { DataPipeline } from "./services/dataPipeline";

// API keys should be set via environment variables
// process.env.HUGGINGFACE_API_KEY = 'your-huggingface-key-here';
// process.env.GOOGLE_AI_API_KEY = 'your-google-ai-key-here';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  // Special logging for chat endpoint
  if (path === '/api/chat') {
    console.log(`🎯 [SERVER] Chat request received: ${req.method} ${path}`);
  }

  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "...";
      }

      log(logLine);
    }
  });

  next();
});

let dataPipeline: DataPipeline | null = null;
try {
  dataPipeline = DataPipeline.getInstance();
  dataPipeline.initialise().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    log(`[pipeline] bootstrap error: ${message}`);
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log(`[pipeline] disabled: ${message}`);
}

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
    if (dataPipeline) {
      const lastRun = dataPipeline.getLastRun();
      if (lastRun) {
        log(`[pipeline] last run (${lastRun.trigger}) at ${lastRun.completedAt.toISOString()} in ${lastRun.durationMs}ms`);
      }
    }
  });
})();
