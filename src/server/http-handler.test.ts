import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApplicationRequestHandler } from "./http-handler";

let server: Server | null = null;

afterEach(async () => {
  if (!server?.listening) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

async function listen(): Promise<string> {
  server = createServer(createApplicationRequestHandler((_request, response) => {
    response.statusCode = 418;
    response.end("Next handler");
  }));
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address.");
  return `http://127.0.0.1:${address.port}`;
}

describe("application HTTP handler", () => {
  it("returns a minimal, non-cacheable health response", async () => {
    const origin = await listen();
    const response = await fetch(`${origin}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("delegates non-health routes to Next.js", async () => {
    const origin = await listen();
    const response = await fetch(`${origin}/room/ABC234`);

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("Next handler");
  });
});
