import { Suspense } from "react";
import { RoomLoading } from "../room-ui";
import GameScreen from "./game-screen";

// Same pattern as the lobby: the room code is read inside Suspense, and the game state
// itself only comes from the backend over the socket.
export default function GamePage({ params }: PageProps<"/room/[code]/game">) {
  return (
    <Suspense fallback={<RoomLoading message="게임 화면 연결 중..." />}>
      {params.then(({ code }) => (
        <GameScreen code={code} />
      ))}
    </Suspense>
  );
}
