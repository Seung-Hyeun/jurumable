// Invite links carry the room code only, never a token or a player id: /join-room?code=AB2CDE on
// whichever origin served this page (localhost in development, the deployed site in production).
export function inviteUrl(code: string) {
  const url = new URL("/join-room", window.location.origin);
  url.searchParams.set("code", code);
  return url.toString();
}

// navigator.clipboard is missing outside a secure context; that is a failed copy too.
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function canShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

// Closing the share sheet (AbortError) is not a failure: there is nothing to tell the user then.
export async function shareInvite(code: string) {
  try {
    await navigator.share({
      title: "주루마블",
      text: `주루마블 방에 참여해보세요! 방 코드: ${code}`,
      url: inviteUrl(code),
    });
    return true;
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError";
  }
}
