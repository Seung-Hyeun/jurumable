"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import {
  MAX_PLAYER_OPTIONS,
  NICKNAME_MAX_LENGTH,
  createRoom,
  nicknameError,
  requestErrorMessage,
} from "@/lib/api";
import { getRecentNickname, saveRecentNickname, subscribeRecentNickname } from "@/lib/profile";
import { saveSession } from "@/lib/session";
import {
  FieldMessage,
  FormError,
  PageShell,
  cardClass,
  inputClass,
  optionClass,
  primaryButton,
} from "../_components/page-shell";

export default function CreateRoomPage() {
  const router = useRouter();
  // The nickname last used in this browser fills the input until the player types. It is read
  // after hydration (the prerendered page has an empty input), so there is no mismatch.
  const recentNickname = useSyncExternalStore(subscribeRecentNickname, getRecentNickname, () => "");
  const [typedNickname, setTypedNickname] = useState<string | null>(null);
  const nickname = typedNickname ?? recentNickname;
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [nicknameProblem, setNicknameProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Pending until the lobby is shown. Next keeps this page (hidden) for the back button, so the
  // form must not stay "방 생성 중..." once the move is over.
  const [navigating, startNavigation] = useTransition();
  // Guards against a second submit before the disabled state has rendered.
  const pending = useRef(false);
  const nicknameInput = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    const invalid = nicknameError(nickname);
    if (invalid) {
      setNicknameProblem(invalid);
      nicknameInput.current?.focus();
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setError(null);
    const result = await createRoom(nickname.trim(), maxPlayers);
    pending.current = false;
    setSubmitting(false);
    if (!result.ok) {
      setError(requestErrorMessage(result, "create"));
      return;
    }
    const { room, host } = result.data;
    // The backend's normalized nickname, never a displayName ("민수 1") that would gain suffixes.
    saveRecentNickname(host.nickname);
    saveSession({
      roomCode: room.code,
      playerId: host.id,
      displayName: host.displayName,
      reconnectToken: host.reconnectToken,
    });
    // The button stays disabled through the move: navigating takes over from submitting.
    startNavigation(() => router.push(`/room/${room.code}`));
  }

  const busy = submitting || navigating;

  return (
    <PageShell back={{ href: "/", label: "처음으로" }}>
      <h1 className="text-3xl font-black text-violet-700 dark:text-violet-300">방 만들기</h1>
      <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
        방을 만들고 친구들에게 방 코드를 알려주세요.
      </p>
      <form
        onSubmit={handleSubmit}
        noValidate
        className={`${cardClass} mt-8 flex flex-col gap-6`}
      >
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
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-bold">최대 인원</legend>
          <div className="grid grid-cols-5 gap-2">
            {MAX_PLAYER_OPTIONS.map((count) => (
              <label
                key={count}
                className={optionClass}
              >
                <input
                  type="radio"
                  name="maxPlayers"
                  value={count}
                  checked={maxPlayers === count}
                  onChange={() => setMaxPlayers(count)}
                  className="sr-only"
                />
                {count}명
              </label>
            ))}
          </div>
        </fieldset>
        <FormError message={error} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "방 생성 중..." : "방 만들기"}
        </button>
      </form>
    </PageShell>
  );
}
