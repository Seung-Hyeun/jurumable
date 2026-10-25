import Link from "next/link";
import { TILE_ICON, TILE_TONE, perimeterCell, type TileType } from "@/lib/board";
import {
  PageShell,
  primaryButton,
  secondaryButton,
} from "./_components/page-shell";

// A tiny board around the die, clockwise from the top-left like the real one. Decoration only.
const MINI_BOARD: TileType[] = [
  "START",
  "MISSION",
  "QA",
  "TARGET_DRINK",
  "PENALTY",
  "TWO_DRINKS",
  "REST",
  "ONE_DRINK",
];

export default function Home() {
  return (
    <PageShell>
      <div className="flex flex-1 flex-col justify-center gap-12 py-8">
        <header className="text-center">
          <div aria-hidden="true" className="mx-auto grid w-fit grid-cols-3 grid-rows-3 gap-1.5">
            {MINI_BOARD.map((type, index) => {
              const { row, col } = perimeterCell(index, 3, 3);
              return (
                <span
                  key={type}
                  style={{ gridRow: row, gridColumn: col }}
                  className={`flex size-12 items-center justify-center rounded-xl text-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${TILE_TONE[type]}`}
                >
                  {TILE_ICON[type]}
                </span>
              );
            })}
            <span className="col-start-2 row-start-2 flex size-12 items-center justify-center rounded-xl bg-white text-3xl shadow-md ring-1 ring-black/10 dark:ring-white/15">
              🎲
            </span>
          </div>
          <h1 className="mt-6 text-5xl font-black tracking-tight text-violet-700 dark:text-violet-300">
            주루마블
          </h1>
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            친구들과 함께 즐기는 실시간 보드게임
          </p>
        </header>
        <nav aria-label="메인 메뉴" className="flex flex-col gap-3">
          <Link href="/create-room" className={primaryButton}>
            방 만들기
          </Link>
          <Link href="/join-room" className={secondaryButton}>
            방 참여하기
          </Link>
          {/* The third choice: a plain text button, below the two room actions. */}
          <Link
            href="/settings"
            className="flex h-14 w-full items-center justify-center rounded-2xl px-5 text-lg font-semibold text-zinc-600 transition-colors hover:bg-white/70 active:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:active:bg-zinc-800"
          >
            설정
          </Link>
        </nav>
      </div>
    </PageShell>
  );
}
