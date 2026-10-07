# Multiplayer Architecture

Stage 10 runs Next.js and Socket.IO on one custom Node HTTP server. Run it with:

```text
npm run dev
npm run build
npm start
```

`PORT` and `HOST` may be supplied by the environment. The browser connects to Socket.IO on the same origin as the Next.js application.

## Authority and trust boundary

The server owns the room registry, seat assignments, competitive profiles, dice rolls, deck randomness, opening Flip Card, starting-seat result, and complete `MatchEngineState`. Clients send only intentions such as Roll, Flip, card IDs, Pass, Ready, Tribute, or Return Tribute. A client cannot supply dice values, choose the revealed card, nominate a starting player, or spoof a seat. The server derives the acting seat from the socket's reconnect session and submits typed actions to the game engine.

The client never receives a raw engine state. `buildClientRoomView` creates a separate view for each player. During the opening it exposes only public roll results, the Flipper, the revealed card, and the resolved starter; the pending deck remains private and no hand exists yet. After dealing, the view includes that player's own hand, public card counts, the committed trick, levels, finish information, and the current public phase. Opponent hands, competitive identity keys, reconnect tokens, and server state are excluded.

## Rooms and reconnection

Rooms use six-character codes and are held in an in-memory `Map`. Each player receives a cryptographically random reconnect token that is stored in browser `sessionStorage`. A refresh or Socket.IO reconnect presents the code and token to recover the same reserved seat and current private hand. Reconnection also restores an opening ceremony in progress, including completed public rolls, tie rounds, the Flipper, and any revealed starting result.

Disconnecting does not reset or pause an active playing-turn deadline. A reconnect restores the same absolute server deadline, so time elapsed while disconnected still counts. Opening Dice, Flip Card, Tribute, and Return-Tribute phases do not use the playing-turn timer.

## Randomness

Production room codes, reconnect tokens, two-die rolls, Fisher-Yates shuffles, and equal-Tribute resolution use Node's `crypto` APIs in `src/server/random.ts`. The opening Flip Card is always the top card of the securely shuffled 108-card deck. That same physical card remains in the deck and is dealt exactly once. The pure game engine and opening-rule reducer remain deterministic; RoomManager tests inject deterministic replacements.

## First-round opening

Starting a match enters an authoritative opening phase before any cards are dealt:

- all four players roll exactly two server-generated dice;
- if the highest total is tied, only those tied players reroll, repeating until unique;
- the unique winner becomes the Flipper and is the only player allowed to reveal the deck's top card;
- A counts as 1, numbered cards use their printed value, J/Q/K count as 11/12/13, and either Joker means the Flipper starts;
- counting begins with the Flipper as one and proceeds clockwise;
- after a short public result display, the server deals all 108 cards, 27 to each player, and starts Round 1 from the resolved seat.

Later rounds do not repeat this ceremony. Their lead and Tribute/Return-Tribute flow continue to come from the established game engine.

## Automatic phases

After an accepted player action, the RoomManager handles only server-owned transitions:

- complete the opening deal after the public starting-seat result;
- supply a securely shuffled deck for `AWAITING_NEXT_ROUND_DECK`;
- resolve equal-Tribute recipient assignment;
- resolve equal-Tribute starting-seat selection.

Tribute card selection and Return-Tribute card selection remain human actions. Normal playing turns have one server-owned 60-second deadline. If a responding turn expires, RoomManager submits a normal Pass through the existing engine. If a fresh-trick leader expires, it deterministically chooses the weakest owned Single whose action passes the same engine validation. The room stores an incrementing turn sequence so an old timeout or late client action cannot commit after the turn has changed. Clients receive only the absolute deadline and sequence; local selection, focus, refresh, and reconnect never extend it.

## Competitive identity and Rating

The browser keeps a stable anonymous competitive player ID in `localStorage`. It is intentionally separate from the reconnect token in `sessionStorage`: the former associates completed results across rooms, while the latter grants access to one reserved room seat.

Only an authoritative four-human `MATCH_COMPLETE` result changes Rating. Team Elo applies one shared delta to both teammates, and the server stores the personal before/after result for the completion screen. A unique match-result ID makes processing idempotent, so reconnects or repeated completion checks cannot award a result twice. Intentional leaves and cancelled or abandoned matches never manufacture a winner and never change Rating.

The leaderboard response is a sanitized Top 100 view containing public display names, Rating, tier, wins, and losses. It never includes competitive player IDs, reconnect tokens, hands, or engine state.

## Current persistence limitation

Rooms and competitive profiles currently exist only in one Node process. A server restart, redeploy, crash, or instance replacement loses every active room and resets the leaderboard. Multiple server instances cannot share rooms or Rating data. Durable persistence and distributed synchronization remain future work.

Stage 11 adds conservative memory cleanup: a room is eligible for deletion only after every
player is disconnected and the room has been inactive for 24 hours. Active connections always
protect a room from cleanup.
