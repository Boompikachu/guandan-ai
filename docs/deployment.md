# Render Deployment

Stage 11 targets one Render Web Service. The service runs the existing custom Node server,
which serves Next.js pages, static assets, Socket.IO polling, and WebSocket upgrades from the
same public origin.

## Create the service

Connect this GitHub repository to Render and deploy the desired branch. The included root
`render.yaml` defines one Node Web Service with:

```text
Build command: npm ci && npm run build
Start command: npm start
Health check: /health
Instances: 1
```

Render supplies `PORT`; no secrets or additional production variables are required. `HOST`
is optional and defaults to `0.0.0.0`. Do not configure a separate frontend, Socket.IO URL,
wildcard CORS policy, Redis service, or additional instance.

## Important limitations

Rooms are stored in one process. A restart, deploy, crash, service replacement, or free-tier
sleep removes every active room. Multiple instances would each have a different room
registry, so horizontal scaling is unsupported. Fully disconnected rooms are conservatively
removed after 24 hours of inactivity.

Reconnect tokens remain in browser `sessionStorage`. They are never placed in room URLs or
shared with other players.

## Verify the public URL

After Render reports the service healthy:

1. Open `/health` and confirm `{"status":"ok"}`.
2. Open `/`, `/local`, and `/room/ABC234` directly and refresh each route.
3. Confirm the page loads its `/_next/static/` assets without errors.
4. Create a room in one browser and join from another browser.
5. Confirm lobby updates arrive immediately, then refresh one browser and verify it resumes.
6. In browser network tools, confirm Socket.IO polling or a WebSocket upgrade uses the same
   `https://<service>.onrender.com` origin. Render terminates HTTPS/WSS; the app does not manage
   certificates itself.
