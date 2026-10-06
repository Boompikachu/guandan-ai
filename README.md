# Guandan Go

Guandan Go is a browser-based four-player Guandan game. It combines a deterministic
TypeScript game engine with an authoritative real-time multiplayer server and a responsive
Next.js interface.

## Local development

Requires Node.js 22.

```text
npm install
npm run dev
```

Open `http://localhost:3000`. The online room flow is the default; the Stage 9 hot-seat
version remains available at `/local`.

## Verification

```text
npm test
npm run lint
npm run build
```

## Production

```text
npm ci
npm run build
npm start
```

The custom Node server serves Next.js and Socket.IO from one port. It reads `PORT` from the
environment and binds to `0.0.0.0` by default.

## Architecture

- `src/game`: pure deterministic game rules and match engine
- `src/server`: authoritative rooms, private-view filtering, secure randomness, and Socket.IO
- `src/shared`: typed serializable multiplayer protocol
- `src/components`: local and online interfaces

Rooms and reconnect sessions live only in process memory. Production must use one server
instance, and restarts or deployments remove active rooms. See
[`docs/deployment.md`](docs/deployment.md) for Render setup and verification.
