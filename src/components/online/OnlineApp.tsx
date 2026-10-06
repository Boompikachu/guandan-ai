"use client";

import { useEffect } from "react";
import { useOnlineRoom } from "../../hooks/useOnlineRoom";
import { OnlineGame, OnlineMatchComplete } from "./OnlineGame";
import { OnlineHome } from "./OnlineHome";
import { OnlineLobby } from "./OnlineLobby";

export function OnlineApp({ initialRoomCode = "" }: { initialRoomCode?: string }) {
  const room = useOnlineRoom();

  useEffect(() => {
    if (room.view && window.location.pathname === "/") {
      window.history.replaceState(null, "", `/room/${room.view.roomCode}`);
    }
  }, [room.view]);

  function returnHome() {
    room.returnHome();
    window.history.replaceState(null, "", "/");
  }

  if (!room.view) {
    return (
      <OnlineHome
        initialRoomCode={initialRoomCode}
        connectionStatus={room.connectionStatus}
        errorMessage={room.errorMessage}
        onCreate={room.createRoom}
        onJoin={room.joinRoom}
      />
    );
  }

  if (room.view.phase === "LOBBY") {
    return (
      <OnlineLobby
        view={room.view}
        connectionStatus={room.connectionStatus}
        errorMessage={room.errorMessage}
        onSetReady={room.setReady}
        onStart={room.startMatch}
      />
    );
  }

  if (room.view.phase === "MATCH_COMPLETE") {
    return <OnlineMatchComplete view={room.view} onReturnHome={returnHome} />;
  }

  return (
    <OnlineGame
      view={room.view}
      connectionStatus={room.connectionStatus}
      errorMessage={room.errorMessage}
      onClearError={room.clearError}
      onPlay={room.play}
      onPass={room.pass}
      onTribute={room.submitTribute}
      onReturn={room.submitReturn}
    />
  );
}

