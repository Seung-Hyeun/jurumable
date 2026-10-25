"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import {
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  isRoomCode,
  joinRoom,
  nicknameError,
  normalizeRoomCode,
  requestErrorMessage,
} from "@/lib/api";
import { getRecentNickname, saveRecentNickname, subscribeRecentNickname } from "@/lib/profile";
import { getSession, saveSession } from "@/lib/session";
import {
  FieldMessage,
  FormError,
  PageShell,
  cardClass,
  inputClass,
  primaryButton,
} from "../_components/page-shell";

function roomCodeError(code: string) {
  if (!code) {
    return "방 코드를 입력해주세요.";
  }
  if (code.length !== ROOM_CODE_LENGTH) {
    return `방 코드는 ${ROOM_CODE_LENGTH}자리입니다.`;
  }
  return null;
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// The room this browser already has a session for (a string, so the snapshot stays stable).
const storedRoomCode = () => getSession()?.roomCode ?? null;

// An invite link (/join-room?code=AB2CDE) fills in the code; the player still joins themselves.
// The code in the link is user input like any other: only a well-formed code is filled in.
export function InviteJoinRoomForm() {
  const raw = useSearchParams().get("code");
  const code = raw === null ? "" : normalizeRoomCode(raw);
  const initialCode = isRoomCode(code) ? code : "";
  return <JoinRoomForm key={initialCode} initialCode={initialCode} />;
}

export default function JoinRoomForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  // As on the create page: the last nickname fills the input until the player types.
  const recentNickname = useSyncExternalStore(subscribeRecentNickname, getRecentNickname, () => "");
  const [typedNickname, setTypedNickname] = useState<string | null>(null);
  const nickname = typedNickname ?? recentNickname;
  const [codeProblem, setCodeProblem] = useState<string | null>(null);
  const [nicknameProblem, setNicknameProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Pending until the lobby is shown. Next keeps this page (hidden) for the back button, so the
  // form must not stay "참여 중..." once the move is over.
  const [navigating, startNavigation] = useTransition();
  // Guards against a second submit before the disabled state has rendered.
  const pending = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const nicknameInput = useRef<HTMLInputElement>(null);
  const storedRoom = useSyncExternalStore(subscribeToStorage, storedRoomCode, () => null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    const codeInvalid = roomCodeError(code);
    const nicknameInvalid = nicknameError(nickname);
    if (codeInvalid || nicknameInvalid) {
      setCodeProblem(codeInvalid);
      setNicknameProblem(nicknameInvalid);
      (codeInvalid ? codeInput : nicknameInput).current?.focus();
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setError(null);
    const result = await joinRoom(code, nickname.trim());
    pending.current = false;
    setSubmitting(false);
    if (!result.ok) {
      setError(requestErrorMessage(result, "join"));
      return;
    }
    const { room, player } = result.data;
    // The backend's normalized nickname ("민수"), not the room's displayName ("민수 1").
    saveRecentNickname(player.nickname);
    saveSession({
      roomCode: room.code,
      playerId: player.id,
      displayName: player.displayName,
      reconnectToken: player.reconnectToken,
    });
    // The button stays disabled through the move: navigating takes over from submitting.
    startNavigation(() => router.push(`/room/${room.code}`));
  }

  const busy = submitting || navigating;

  return (
    <PageShell back={{ href: "/", label: "처음으로" }}>
      <h1 className="text-3xl font-black text-violet-700 dark:text-violet-300">방 참여하기</h1>
      <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
        친구에게 받은 방 코드와 닉네임을 입력하세요.
      </p>
      {/* Only a hint: joining another room replaces the stored session as before; the old
          membership is not left on the server. */}
      {storedRoom && (
        <p className="mt-4 rounded-2xl bg-violet-50 dark:bg-violet-500/10 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
          {storedRoom === code
            ? "이미 이 방에 참가 중입니다. "
            : `현재 참가 중인 방(${storedRoom}) 정보가 있습니다. 새 방에 참여하면 바뀝니다. `}
          <Link
            href={`/room/${storedRoom}`}
            className="font-bold text-violet-700 dark:text-violet-300 underline"
          >
            그 방으로 가기
          </Link>
        </p>
      )}
      <form
        onSubmit={handleSubmit}
        noValidate
        className={`${cardClass} mt-8 flex flex-col gap-6`}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="room-code" className="text-base font-bold">
            방 코드
          </label>
          <input
            ref={codeInput}
            id="room-code"
            name="roomCode"
            value={code}
            // No maxLength: a pasted " abc234 " must be trimmed before it is cut to 6.
            onChange={(event) => {
              setCode(normalizeRoomCode(event.target.value));
              setCodeProblem(null);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABC234"
            aria-invalid={codeProblem !== null}
            aria-describedby="room-code-message"
            className={`${inputClass} font-mono text-2xl uppercase tracking-[0.3em]`}
          />
          <FieldMessage
            id="room-code-message"
            hint={`영문과 숫자 ${ROOM_CODE_LENGTH}자리입니다.`}
            error={codeProblem}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="nickname" className="text-base font-bold">
            닉네임
          </label>
          <input
            ref={nicknameInput}
            id="nickname"
            name="nickname"
            value={nickname}
            onChange={(event) => {
              setTypedNickname(event.target.value);
              setNicknameProblem(null);
            }}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="off"
            placeholder="예시 : 설모리"
            aria-invalid={nicknameProblem !== null}
            aria-describedby="nickname-message"
            className={inputClass}
          />
          <FieldMessage
            id="nickname-message"
            hint={`게임에서 보일 이름입니다. 최대 ${NICKNAME_MAX_LENGTH}자.`}
            error={nicknameProblem}
          />
        </div>
        <FormError message={error} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "참여 중..." : "방 참여하기"}
        </button>
      </form>
    </PageShell>
  );
}
