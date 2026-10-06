import { createServer } from "node:http";
import { createApplicationRequestHandler } from "./src/server/http-handler";
import { ABANDONED_ROOM_TTL_MS } from "./src/server/room-manager";
import { attachSocketServer } from "./src/server/socket-server";

const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const ROOM_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const FORCE_SHUTDOWN_MS = 10_000;

if (production) {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const hostname = process.env.HOST?.trim() || "0.0.0.0";
  const { default: next } = await import("next");
  const app = next({ dev: !production, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer(createApplicationRequestHandler(handle));
  const { io, manager } = attachSocketServer(httpServer);
  const cleanupTimer = setInterval(() => {
    const removed = manager.cleanupAbandonedRooms(ABANDONED_ROOM_TTL_MS);
    if (removed > 0) console.log(`Removed ${removed} abandoned room(s).`);
  }, ROOM_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, hostname, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
  console.log(`Guandan Go listening at http://${displayHost}:${port}`);

  let shuttingDown = false;
  function shutdown(signal: NodeJS.Signals): void {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(cleanupTimer);
    console.log(`Received ${signal}; closing connections.`);

    const forceTimer = setTimeout(() => {
      console.error("Graceful shutdown timed out.");
      process.exit(1);
    }, FORCE_SHUTDOWN_MS);
    forceTimer.unref();

    io.close(() => {
      clearTimeout(forceTimer);
      if (!httpServer.listening) {
        process.exit(0);
        return;
      }
      httpServer.close(() => process.exit(0));
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((error: unknown) => {
  console.error("Guandan Go server failed to start.", error);
  process.exitCode = 1;
});
