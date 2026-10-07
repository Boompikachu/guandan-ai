"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useOnlineRoom } from "../../hooks/useOnlineRoom";
import { HowToPlay } from "../rules/HowToPlay";
import { OnlineCancelledMatch, OnlineGame, OnlineMatchComplete } from "./OnlineGame";
import { OnlineHome } from "./OnlineHome";
import { OnlineLobby } from "./OnlineLobby";
import { OnlineOpening } from "./OnlineOpening";

export function OnlineApp({ initialRoomCode = "" }: { initialRoomCode?: string }) {
  const room = useOnlineRoom();
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    if (room.view && window.location.pathname === "/") {
      window.history.replaceState(null, "", `/room/${room.view.roomCode}`);
    }
  }, [room.view]);

  async function leaveRoom() {
    await room.leaveRoom();
  }

  let screen: ReactNode;

  if (!room.view && room.cancelledMatchMessage) {
    screen = (
      <OnlineCancelledMatch
        message={room.cancelledMatchMessage}
        onReturnHome={room.clearCancelledMatch}
      />
    );
  } else if (!room.view) {
    screen = (
      <OnlineHome
        initialRoomCode={initialRoomCode}
        connectionStatus={room.connectionStatus}
        errorMessage={room.errorMessage}
        publicRooms={room.publicRooms}
        onCreate={room.createRoom}
        onJoin={room.joinRoom}
        onOpenRules={() => setRulesOpen(true)}
      />
    );
  } else if (room.view.phase === "LOBBY") {
    screen = (
      <OnlineLobby
        view={room.view}
        connectionStatus={room.connectionStatus}
        errorMessage={room.errorMessage}
        onSetReady={room.setReady}
        onStart={room.startMatch}
        onOpenRules={() => setRulesOpen(true)}
        onLeave={() => void leaveRoom()}
      />
    );
  } else if (room.view.phase === "MATCH_COMPLETE") {
    screen = <OnlineMatchComplete view={room.view} onReturnHome={() => void leaveRoom()} />;
  } else if (room.view.phase === "OPENING") {
    screen = (
      <OnlineOpening
        view={room.view}
        connectionStatus={room.connectionStatus}
        errorMessage={room.errorMessage}
        onRoll={room.rollOpeningDice}
        onFlip={room.flipOpeningCard}
        onOpenRules={() => setRulesOpen(true)}
        onLeave={() => void leaveRoom()}
      />
    );
  } else {
    screen = (
      <OnlineGame
        view={room.view}
        connectionStatus={room.connectionStatus}
        errorMessage={room.errorMessage}
        onClearError={room.clearError}
        onPlay={room.play}
        onPass={room.pass}
        onTribute={room.submitTribute}
        onReturn={room.submitReturn}
        onOpenRules={() => setRulesOpen(true)}
        onLeave={() => void leaveRoom()}
      />
    );
  }

  return (
    <>
      {screen}
      {rulesOpen ? <HowToPlay onClose={() => setRulesOpen(false)} /> : null}
    </>
  );
}
