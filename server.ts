import { createServer } from "node:http";
import { attachSocketServer } from "./src/server/socket-server";

const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";

if (production) {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
}

async function main(): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const hostname = process.env.HOST ?? "0.0.0.0";
  const { default: next } = await import("next");
  const app = next({ dev: !production, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((request, response) => {
    void handle(request, response);
  });
  const { io } = attachSocketServer(httpServer);

  httpServer.listen(port, hostname, () => {
    const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
    console.log(`Guandan Go listening at http://${displayHost}:${port}`);
  });

  function shutdown(): void {
    io.close();
    httpServer.close(() => process.exit(0));
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error("Guandan Go server failed to start.", error);
  process.exitCode = 1;
});
