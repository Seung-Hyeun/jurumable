"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  CONTENT_KINDS,
  contentErrorMessage,
  type ApiResult,
  type ContentInputMap,
  type ContentKind,
  type Contents,
  type MissionType,
  type RoomClient,
} from "@/lib/api";
import {
  CONTENT_MAX_LENGTH,
  contentError,
  durationError,
  formatDuration,
} from "@/lib/content";
import { MissionTypeBadge } from "../../_components/badge";
import {
  FormError,
  cardClass,
  optionClass,
  secondaryButton,
  smallButton,
  smallDangerButton,
  smallPrimaryButton,
} from "../../_components/page-shell";

// A row as the panel sees it; questions and penalties just have no type / duration.
export type ContentItem = {
  id: string;
  content: string;
  type?: MissionType;
  durationSeconds?: number | null;
};

type Draft = { content: string; type: MissionType; duration: string };
type Action = "create" | "update" | "delete";
type FormState = { mode: "add" } | { mode: "edit"; id: string } | null;

const BLANK: Draft = { content: "", type: "NORMAL", duration: "" };

const TEXT = {
  questions: {
    tab: "Q&A",
    noun: "질문",
    field: "질문 내용",
    add: "질문 추가",
    empty: "등록된 질문이 없습니다.\n첫 질문을 추가해보세요.",
    confirm: "이 질문을 삭제할까요?",
  },
  missions: {
    tab: "미션",
    noun: "미션",
    field: "미션 내용",
    add: "미션 추가",
    empty: "등록된 미션이 없습니다.\n첫 미션을 추가해보세요.",
    confirm: "이 미션을 삭제할까요?",
  },
  penalties: {
    tab: "벌칙",
    noun: "벌칙",
    field: "벌칙 내용",
    add: "벌칙 추가",
    empty: "등록된 벌칙이 없습니다.\n첫 벌칙을 추가해보세요.",
    confirm: "이 벌칙을 삭제할까요?",
  },
} satisfies Record<ContentKind, Record<string, string>>;

function toDraft(item: ContentItem): Draft {
  return {
    content: item.content,
    type: item.type ?? "NORMAL",
    duration: item.durationSeconds ? String(item.durationSeconds) : "",
  };
}

function validate(kind: ContentKind, draft: Draft) {
  const invalid = contentError(draft.content);
  if (invalid || kind !== "missions" || draft.type === "NORMAL") {
    return invalid;
  }
  return durationError(draft.duration);
}

// NORMAL missions send no durationSeconds; the backend stores null for them.
function toInput(kind: ContentKind, draft: Draft): ContentInputMap[ContentKind] {
  const content = draft.content.trim();
  if (kind !== "missions") {
    return { content };
  }
  return draft.type === "TIMED"
    ? { content, type: "TIMED", durationSeconds: Number(draft.duration) }
    : { content, type: "NORMAL" };
}

export function ContentTabs({
  contents,
  loadFailed,
  client,
  onPatch,
  onUnauthorized,
}: {
  contents: Contents;
  loadFailed: boolean;
  client: RoomClient;
  onPatch: (kind: ContentKind, update: (list: ContentItem[]) => ContentItem[]) => void;
  onUnauthorized: () => void;
}) {
  const [tab, setTab] = useState<ContentKind>("questions");

  // Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern).
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = CONTENT_KINDS.indexOf(tab);
    const last = CONTENT_KINDS.length - 1;
    const target =
      event.key === "ArrowRight"
        ? (index + 1) % CONTENT_KINDS.length
        : event.key === "ArrowLeft"
          ? (index + last) % CONTENT_KINDS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) {
      return;
    }
    event.preventDefault();
    const next = CONTENT_KINDS[target];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <section aria-label="게임 콘텐츠" className={cardClass}>
      <h2 className="mb-3 text-lg font-bold">게임 콘텐츠</h2>
      <div
        role="tablist"
        aria-label="콘텐츠 종류"
        onKeyDown={handleKeyDown}
        className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-1"
      >
        {CONTENT_KINDS.map((kind) => {
          const selected = kind === tab;
          const count = contents[kind]?.length;
          return (
            <button
              key={kind}
              id={`tab-${kind}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${kind}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(kind)}
              className={`h-12 min-w-0 rounded-xl px-2 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 ${selected ? "bg-white dark:bg-zinc-700 text-violet-700 dark:text-violet-300 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
            >
              {count === undefined ? TEXT[kind].tab : `${TEXT[kind].tab} ${count}`}
            </button>
          );
        })}
      </div>
      <ContentPanel
        key={tab}
        kind={tab}
        items={contents[tab]}
        loadFailed={loadFailed}
        client={client}
        onPatch={(update) => onPatch(tab, update)}
        onUnauthorized={onUnauthorized}
      />
    </section>
  );
}

function ContentPanel({
  kind,
  items,
  loadFailed,
  client,
  onPatch,
  onUnauthorized,
}: {
  kind: ContentKind;
  items: ContentItem[] | null;
  loadFailed: boolean;
  client: RoomClient;
  onPatch: (update: (list: ContentItem[]) => ContentItem[]) => void;
  onUnauthorized: () => void;
}) {
  const text = TEXT[kind];
  const [form, setForm] = useState<FormState>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState<{ action: Action; id?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a second request before the disabled state has rendered.
  const pending = useRef(false);

  function openForm(next: Exclude<FormState, null>, value: Draft) {
    setForm(next);
    setDraft(value);
    setError(null);
  }

  function closeForm() {
    setForm(null);
    setDraft(BLANK);
    setError(null);
  }

  // The list itself is refreshed by the REST result here and by the socket update for everyone.
  async function run<T>(
    action: Action,
    id: string | undefined,
    call: () => Promise<ApiResult<T>>,
    apply: (data: T) => void,
  ) {
    pending.current = true;
    setBusy({ action, id });
    setError(null);
    const result = await call();
    pending.current = false;
    setBusy(null);
    if (result.ok) {
      apply(result.data);
      return true;
    }
    if (result.status === 401) {
      onUnauthorized();
    } else {
      setError(contentErrorMessage(text.noun, action, result));
    }
    return false;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || pending.current) {
      return;
    }
    const invalid = validate(kind, draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    const input = toInput(kind, draft);
    const saved =
      form.mode === "add"
        ? await run(
            "create",
            undefined,
            () => client.create(kind, input),
            (item: ContentItem) =>
              onPatch((list) =>
                list.some((row) => row.id === item.id) ? list : [...list, item],
              ),
          )
        : await run(
            "update",
            form.id,
            () => client.update(kind, form.id, input),
            (item: ContentItem) =>
              onPatch((list) => list.map((row) => (row.id === item.id ? item : row))),
          );
    if (saved) {
      closeForm();
    }
  }

  async function handleDelete(item: ContentItem) {
    if (pending.current || !window.confirm(text.confirm)) {
      return;
    }
    const removed = await run(
      "delete",
      item.id,
      () => client.remove(kind, item.id),
      () => onPatch((list) => list.filter((row) => row.id !== item.id)),
    );
    if (removed && form?.mode === "edit" && form.id === item.id) {
      closeForm();
    }
  }

  const formProps = {
    kind,
    draft,
    error,
    disabled: busy !== null,
    onChange: setDraft,
    onSubmit: handleSubmit,
    onCancel: closeForm,
  };

  return (
    <div
      role="tabpanel"
      id={`panel-${kind}`}
      aria-labelledby={`tab-${kind}`}
      tabIndex={0}
      className="mt-4 flex flex-col gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
    >
      {items === null && (
        <p className="py-6 text-center text-base text-zinc-500 dark:text-zinc-400">
          {loadFailed
            ? "목록을 불러오지 못했습니다. 새로고침해주세요."
            : "불러오는 중..."}
        </p>
      )}
      {items?.length === 0 && form?.mode !== "add" && (
        <p className="whitespace-pre-line rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-4 py-6 text-center text-base text-zinc-600 dark:text-zinc-400">
          {text.empty}
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) =>
            form?.mode === "edit" && form.id === item.id ? (
              <li key={item.id}>
                <ContentForm
                  {...formProps}
                  idPrefix={`edit-${kind}`}
                  submitLabel={busy?.action === "update" ? "저장 중..." : "저장"}
                />
              </li>
            ) : (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p
                    id={`item-${item.id}`}
                    className="whitespace-pre-wrap wrap-anywhere text-base text-zinc-900 dark:text-zinc-100"
                  >
                    {item.content}
                  </p>
                  {kind === "missions" && (
                    <div className="mt-2">
                      <MissionTypeBadge
                        type={item.type ?? "NORMAL"}
                        durationSeconds={item.durationSeconds ?? null}
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openForm({ mode: "edit", id: item.id }, toDraft(item))}
                    disabled={busy !== null}
                    aria-describedby={`item-${item.id}`}
                    className={smallButton}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={busy !== null}
                    aria-describedby={`item-${item.id}`}
                    className={smallDangerButton}
                  >
                    {busy?.action === "delete" && busy.id === item.id ? "삭제 중..." : "삭제"}
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {form?.mode === "add" ? (
        <ContentForm
          {...formProps}
          idPrefix={`add-${kind}`}
          submitLabel={busy?.action === "create" ? "추가 중..." : "추가"}
        />
      ) : (
        <>
          {form === null && <FormError message={error} />}
          <button
            type="button"
            onClick={() => openForm({ mode: "add" }, BLANK)}
            disabled={busy !== null || items === null}
            className={secondaryButton}
          >
            <span aria-hidden="true">+&nbsp;</span>
            {text.add}
          </button>
        </>
      )}
    </div>
  );
}

function ContentForm({
  kind,
  draft,
  error,
  disabled,
  idPrefix,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: {
  kind: ContentKind;
  draft: Draft;
  error: string | null;
  disabled: boolean;
  idPrefix: string;
  submitLabel: string;
  onChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const length = Array.from(draft.content.trim()).length;
  const seconds = Number(draft.duration);
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-2xl border-2 border-violet-200 dark:border-violet-400/40 bg-violet-50/60 dark:bg-violet-500/10 p-4"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${idPrefix}-content`} className="text-base font-bold">
            {TEXT[kind].field}
          </label>
          <span
            id={`${idPrefix}-count`}
            className={`text-sm ${length > CONTENT_MAX_LENGTH ? "font-bold text-rose-700 dark:text-rose-300" : "text-zinc-500 dark:text-zinc-400"}`}
          >
            {length}/{CONTENT_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id={`${idPrefix}-content`}
          value={draft.content}
          onChange={(event) => onChange({ ...draft, content: event.target.value })}
          rows={3}
          aria-describedby={`${idPrefix}-count`}
          className="w-full resize-y rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 focus:border-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-100 dark:focus-visible:ring-violet-500/30"
        />
      </div>
      {kind === "missions" && (
        <>
          <fieldset className="flex flex-col">
            <legend className="mb-2 text-base font-bold">미션 유형</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["NORMAL", "TIMED"] as const).map((type) => (
                <label
                  key={type}
                  className={optionClass}
                >
                  <input
                    type="radio"
                    name={`${idPrefix}-type`}
                    value={type}
                    checked={draft.type === type}
                    // Switching to NORMAL drops the duration, as the backend does.
                    onChange={() =>
                      onChange({
                        ...draft,
                        type,
                        duration: type === "TIMED" ? draft.duration : "",
                      })
                    }
                    className="sr-only"
                  />
                  {type === "NORMAL" ? "일반" : "시간제"}
                </label>
              ))}
            </div>
          </fieldset>
          {draft.type === "TIMED" && (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${idPrefix}-duration`} className="text-base font-bold">
                제한 시간(초)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id={`${idPrefix}-duration`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={draft.duration}
                  onChange={(event) => onChange({ ...draft, duration: event.target.value })}
                  className="h-12 w-32 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-lg text-zinc-900 dark:text-zinc-100 focus:border-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-100 dark:focus-visible:ring-violet-500/30"
                />
                {Number.isInteger(seconds) && seconds >= 1 && (
                  <span className="text-base text-zinc-600 dark:text-zinc-400">= {formatDuration(seconds)}</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" disabled={disabled} className={smallPrimaryButton}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={disabled} className={smallButton}>
          취소
        </button>
      </div>
    </form>
  );
}
