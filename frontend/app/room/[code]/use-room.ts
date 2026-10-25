import { useEffect, useEffectEvent, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  API_BASE_URL,
  createRoomClient,
  reconnectRoom,
  type RoomClient,
  type HostChanged,
  type RoomStatePayload,
} from "@/lib/api";
import { clearSession, getSession } from "@/lib/session";

// reconnecting: the socket dropped and Socket.IO is retrying on its own (server restart, network).
// disconnected: closed for good (by the server or this page); only a retry opens it again.
export type Connection = "connecting" | "connected" | "reconnecting" | "disconnected";

export type Problem = {
  title: string;
  message: string;
  action: "join" | "home" | "retry";
};

export type RoomView =
  | { kind: "checking" }
  | { kind: "ready"; playerId: string; client: RoomClient }
  | ({ kind: "blocked" } & Problem);

type Checked =
  | { kind: "ok"; playerId: string; token: string }
  | { kind: "problem"; problem: Problem };

export const PROBLEMS = {
  noSession: {
    title: "참가 정보가 없습니다",
    message: "이 브라우저에는 이 방의 참가 정보가 없습니다. 방 코드로 참여해주세요.",
    action: "join",
  },
  expired: {
    title: "참가 정보가 만료되었습니다.",
    message: "다시 참여해주세요.",
    action: "join",
  },
  notFound: {
    title: "방을 찾을 수 없습니다.",
    message: "방 코드를 다시 확인해주세요.",
    action: "home",
  },
  unreachable: {
    title: "서버에 연결할 수 없습니다.",
    message: "잠시 후 다시 시도해주세요.",
    action: "retry",
  },
  rateLimited: {
    title: "재접속 요청이 너무 많습니다.",
    message: "잠시 후 다시 시도해주세요.",
    action: "retry",
  },
  serverError: {
    title: "서버에서 오류가 발생했습니다.",
    message: "잠시 후 다시 시도해주세요.",
    action: "retry",
  },
  kicked: {
    title: "방에서 내보내졌습니다.",
    message: "다른 방에 참여하거나 새 방을 만들어보세요.",
    action: "home",
  },
} satisfies Record<string, Problem>;

// The stored session is checked with the backend before any socket is opened.
async function checkSession(code: string): Promise<Checked> {
  const session = getSession();
  if (!session || session.roomCode !== code) {
    return { kind: "problem", problem: PROBLEMS.noSession };
  }
  const result = await reconnectRoom(code, session.reconnectToken);
  if (result.ok && result.data.player.id === session.playerId) {
    return { kind: "ok", playerId: session.playerId, token: session.reconnectToken };
  }
  if (!result.ok && (result.status === 0 || result.status >= 500)) {
    // The session itself may still be valid, so it is kept for a retry.
    return {
      kind: "problem",
      problem: result.status === 0 ? PROBLEMS.unreachable : PROBLEMS.serverError,
    };
  }
  if (!result.ok && result.status === 429) {
    // Rate limited, not rejected: keep the session; retrying is left to the user's button.
    return { kind: "problem", problem: PROBLEMS.rateLimited };
  }
  clearSession();
  const notFound = !result.ok && result.status === 404;
  return { kind: "problem", problem: notFound ? PROBLEMS.notFound : PROBLEMS.expired };
}

type SetupTools = {
  client: RoomClient;
  expire: () => void;
  isCancelled: () => boolean;
};

// The room connection shared by the lobby and the game page: check the stored session with
// the backend, then open one authenticated socket. `setup` adds the page's own listeners.
export function useRoom(code: string, setup: (socket: Socket, tools: SetupTools) => void) {
  const [view, setView] = useState<RoomView>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [state, setState] = useState<RoomStatePayload | null>(null);
  const [hostChanged, setHostChanged] = useState<HostChanged | null>(null);
  // When this socket last came back after a drop, for the passing "다시 연결되었습니다." message.
  const [reconnectedAt, setReconnectedAt] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const setupPage = useEffectEvent(setup);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;
    void checkSession(code).then((checked) => {
      if (cancelled) {
        return;
      }
      if (checked.kind === "problem") {
        setView({ kind: "blocked", ...checked.problem });
        return;
      }
      const client = createRoomClient(code, checked.token);
      setView({ kind: "ready", playerId: checked.playerId, client });
      // The handshake reuses the same reconnect token; Socket.IO reconnects with it too.
      const s = io(API_BASE_URL, {
        auth: { roomCode: code, reconnectToken: checked.token },
      });
      socket = s;
      socketRef.current = s;

      const expire = () => {
        s.disconnect();
        clearSession();
        setView({ kind: "blocked", ...PROBLEMS.expired });
      };
      let wasConnected = false;
      s.on("connect", () => {
        setConnection("connected");
        if (wasConnected) {
          setReconnectedAt(Date.now());
        }
        wasConnected = true;
      });
      // A drop is not a leave: the session stays and Socket.IO reconnects with the same token.
      s.on("disconnect", () => setConnection(s.active ? "reconnecting" : "disconnected"));
      s.on("connect_error", (error: Error & { data?: { code?: string } }) => {
        if (s.active) {
          // Temporary (server down / network): Socket.IO keeps retrying on its own.
          setConnection(wasConnected ? "reconnecting" : "connecting");
          return;
        }
        // Refused by the server's handshake check, e.g. the player no longer exists.
        if (error.data?.code === "UNAUTHORIZED") {
          expire();
          return;
        }
        s.disconnect();
        setView({ kind: "blocked", ...PROBLEMS.unreachable });
      });
      s.on("room:state", (payload: RoomStatePayload) => setState(payload));
      s.on("room:host-changed", (payload: HostChanged) => setHostChanged(payload));
      s.on("player:kicked", () => {
        clearSession();
        s.disconnect();
        setView({ kind: "blocked", ...PROBLEMS.kicked });
      });
      setupPage(s, { client, expire, isCancelled: () => cancelled });
    });
    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [code, attempt]);

  // The "new host" message only passes by; the host badge and buttons follow room:state.
  useEffect(() => {
    if (!hostChanged) {
      return;
    }
    const timer = window.setTimeout(() => setHostChanged(null), 4000);
    return () => window.clearTimeout(timer);
  }, [hostChanged]);

  useEffect(() => {
    if (reconnectedAt === null) {
      return;
    }
    const timer = window.setTimeout(() => setReconnectedAt(null), 3000);
    return () => window.clearTimeout(timer);
  }, [reconnectedAt]);

  function retry() {
    setView({ kind: "checking" });
    setConnection("connecting");
    setState(null);
    setAttempt((value) => value + 1);
  }

  // A REST call came back 401: same outcome as an expired session on entry.
  function expireSession() {
    socketRef.current?.disconnect();
    clearSession();
    setView({ kind: "blocked", ...PROBLEMS.expired });
  }

  return {
    view,
    connection,
    state,
    socketRef,
    retry,
    expireSession,
    hostChanged,
    reconnected: reconnectedAt !== null,
  };
}
