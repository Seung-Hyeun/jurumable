import { Suspense } from "react";
import JoinRoomForm, { InviteJoinRoomForm } from "./join-room-form";

// The invite code (?code=) is read in the browser, so the page itself stays prerendered; until
// then the same form shows with an empty code.
export default function JoinRoomPage() {
  return (
    <Suspense fallback={<JoinRoomForm initialCode="" />}>
      <InviteJoinRoomForm />
    </Suspense>
  );
}
