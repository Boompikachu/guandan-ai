# Stage 10 Multiplayer Architecture

Stage 10 runs Next.js and Socket.IO on one custom Node HTTP server. Run it with:

```text
npm run dev
npm run build
npm start
```

`PORT` and `HOST` may be supplied by the environment. The browser connects to Socket.IO on the same origin as the Next.js application.

## Authority and trust boundary

The server owns the room registry, seat assignments, deck randomness, revealed card, and complete `MatchEngineState`. Clients send only intentions such as card IDs, Pass, Ready, Tribute, or Return Tribute. The server derives the acting seat from the socket's reconnect session and submits a typed action to the Stage 8 engine.

The client never receives a raw engine state. `buildClientRoomView` creates a separate view for each player. It includes that player's own hand, public card counts, the committed trick, levels, finish information, and the current public phase. Opponent hands and reconnect tokens are excluded.

## Rooms and reconnection

Rooms use six-character codes and are held in an in-memory `Map`. Each player receives a cryptographically random reconnect token that is stored in browser `sessionStorage`. A refresh or Socket.IO reconnect presents the code and token to recover the same reserved seat and current private hand.

Disconnecting does not advance or destroy a match. If the disconnected player owns the turn, play waits for that player to resume.

## Randomness

Production room codes, reconnect tokens, Fisher-Yates shuffles, revealed-card selection, and equal-Tribute resolution use Node's `crypto` APIs in `src/server/random.ts`. The pure game engine remains deterministic. RoomManager tests inject deterministic replacements.

## Automatic phases

After an accepted player action, the RoomManager handles only server-owned transitions:

- supply a securely shuffled deck for `AWAITING_NEXT_ROUND_DECK`;
- resolve equal-Tribute recipient assignment;
- resolve equal-Tribute starting-seat selection.

Play, Pass, Tribute card selection, and Return-Tribute card selection always remain human actions.

## Stage 10 limitation

Rooms exist only in one Node process. A server restart loses every active room, and multiple server instances cannot share rooms. Persistence and distributed room synchronization are intentionally deferred to a later stage.

Stage 11 adds conservative memory cleanup: a room is eligible for deletion only after every
player is disconnected and the room has been inactive for 24 hours. Active connections always
protect a room from cleanup.
