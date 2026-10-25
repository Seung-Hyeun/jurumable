"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_SETTINGS,
  getSettings,
  resetSettings,
  saveSettings,
  subscribeSettings,
  type AppSettings,
  type Theme,
} from "@/lib/settings";
import {
  PageShell,
  cardClass,
  optionClass,
  secondaryButton,
} from "../_components/page-shell";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "SYSTEM", label: "시스템 설정" },
  { value: "LIGHT", label: "라이트" },
  { value: "DARK", label: "다크" },
];

// One on / off setting. The button is the switch (role="switch" + aria-checked) and says 켜짐 /
// 꺼짐 in words; the label names it and is clickable too.
function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label id={`${id}-label`} htmlFor={id} className="cursor-pointer text-base font-bold">
          {label}
        </label>
        <p id={`${id}-description`} className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        onClick={() => onChange(!checked)}
        className="flex h-11 shrink-0 items-center gap-2 rounded-full pl-1 text-sm font-bold text-zinc-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 dark:text-zinc-300"
      >
        <span
          aria-hidden="true"
          className={`flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ${checked ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600"}`}
        >
          <span
            className={`size-6 rounded-full bg-white shadow-sm motion-safe:transition-transform ${checked ? "translate-x-5" : ""}`}
          />
        </span>
        <span className="w-8 text-left">{checked ? "켜짐" : "꺼짐"}</span>
      </button>
    </div>
  );
}

export default function SettingsPage() {
  // The server render (and hydration) uses the defaults; the stored settings follow right after.
  const settings = useSyncExternalStore(subscribeSettings, getSettings, () => DEFAULT_SETTINGS);

  // No save button: every change is stored and applied (theme, animations) at once.
  function update(change: Partial<AppSettings>) {
    saveSettings({ ...getSettings(), ...change });
  }

  function reset() {
    if (window.confirm("설정을 기본값으로 되돌릴까요?")) {
      resetSettings();
    }
  }

  return (
    <PageShell back={{ href: "/", label: "처음으로" }}>
      <h1 className="text-3xl font-black text-violet-700 dark:text-violet-300">설정</h1>
      <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
        이 브라우저에만 저장되는 내 설정입니다. 방이나 다른 참가자에게는 영향을 주지 않습니다.
      </p>

      <section aria-labelledby="sound-title" className={`${cardClass} mt-8`}>
        <h2 id="sound-title" className="text-lg font-bold">
          사운드
        </h2>
        <div className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
          <SwitchRow
            id="bgm"
            label="배경음악"
            description="게임 중 배경음악을 재생합니다."
            checked={settings.bgmEnabled}
            onChange={(bgmEnabled) => update({ bgmEnabled })}
          />
          <SwitchRow
            id="sound-effects"
            label="효과음"
            description="주사위, 투표, 룰렛 등의 효과음을 재생합니다."
            checked={settings.soundEffectsEnabled}
            onChange={(soundEffectsEnabled) => update({ soundEffectsEnabled })}
          />
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          음원은 아직 준비 중이라 지금은 소리가 나지 않습니다. 선택은 저장됩니다.
        </p>
      </section>

      <section aria-labelledby="display-title" className={`${cardClass} mt-4`}>
        <h2 id="display-title" className="text-lg font-bold">
          화면
        </h2>
        <div className="mt-1">
          <SwitchRow
            id="animations"
            label="애니메이션"
            description="주사위와 룰렛 등의 화면 효과를 사용합니다. 기기에서 동작 줄이기를 켜 두었다면 그 설정이 우선합니다."
            checked={settings.animationsEnabled}
            onChange={(animationsEnabled) => update({ animationsEnabled })}
          />
        </div>
        <fieldset className="mt-3">
          <legend className="text-base font-bold">테마</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {THEME_OPTIONS.map(({ value, label }) => (
              <label key={value} className={optionClass}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={settings.theme === value}
                  onChange={() => update({ theme: value })}
                  className="sr-only"
                />
                {settings.theme === value && <span aria-hidden="true">✓&nbsp;</span>}
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <button type="button" onClick={reset} className={`${secondaryButton} mt-8`}>
        기본 설정으로 초기화
      </button>
    </PageShell>
  );
}
