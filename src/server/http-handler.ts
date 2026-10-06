import type { IncomingMessage, ServerResponse } from "node:http";

type NextRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

const HEALTH_BODY = JSON.stringify({ status: "ok" });

function isHealthRequest(request: IncomingMessage): boolean {
  const pathname = request.url?.split("?", 1)[0];
  return pathname === "/health" && (request.method === "GET" || request.method === "HEAD");
}

function sendHealth(response: ServerResponse, headOnly: boolean): void {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(headOnly ? undefined : HEALTH_BODY);
}

export function createApplicationRequestHandler(
  nextHandler: NextRequestHandler,
): NextRequestHandler {
  return (request, response) => {
    if (isHealthRequest(request)) {
      sendHealth(response, request.method === "HEAD");
      return;
    }

    void Promise.resolve(nextHandler(request, response)).catch((error: unknown) => {
      console.error("Unexpected HTTP request failure.", error);
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Internal server error." }));
    });
  };
}
