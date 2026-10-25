"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { PageShell, cardClass, primaryButton, secondaryButton } from "./_components/page-shell";

// Shown when a page throws while rendering. Nothing from the error itself is displayed; retry()
// renders the page again, and the room pages reconnect on their own when they mount.
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <PageShell back={{ href: "/", label: "처음으로" }}>
      <section role="alert" className={`${cardClass} mt-8 text-center`}>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">문제가 발생했습니다.</h1>
        <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">잠시 후 다시 시도해주세요.</p>
        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={() => retry()} className={primaryButton}>
            다시 시도
          </button>
          <Link href="/" className={secondaryButton}>
            처음으로
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
