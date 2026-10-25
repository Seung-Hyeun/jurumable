import { Suspense } from "react";
import RoomLobby from "./room-lobby";
import { RoomLoading } from "./room-ui";

// The room code is only known per request, so (with Cache Components) it is read inside
// Suspense. Everything else in the lobby depends on this browser's session and the socket.
export default function RoomPage({ params }: PageProps<"/room/[code]">) {
  return (
    <Suspense fallback={<RoomLoading message="대기방 연결 중..." />}>
      {params.then(({ code }) => (
        <RoomLobby code={code} />
      ))}
    </Suspense>
  );
}
