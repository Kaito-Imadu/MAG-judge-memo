export interface JudgeSettings {
  penWidth: number;
  autoHorizontalLine: boolean;
  horizontalLineLengthRatio: number;
}

const SETTINGS_KEY = 'judge-settings';

export const DEFAULT_JUDGE_SETTINGS: JudgeSettings = {
  penWidth: 2,
  autoHorizontalLine: false,
  horizontalLineLengthRatio: 0.8,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeJudgeSettings(value: Partial<JudgeSettings> | null | undefined): JudgeSettings {
  return {
    penWidth: clamp(Number(value?.penWidth ?? DEFAULT_JUDGE_SETTINGS.penWidth), 0.5, 6),
    autoHorizontalLine: Boolean(value?.autoHorizontalLine ?? DEFAULT_JUDGE_SETTINGS.autoHorizontalLine),
    horizontalLineLengthRatio: clamp(
      Number(value?.horizontalLineLengthRatio ?? DEFAULT_JUDGE_SETTINGS.horizontalLineLengthRatio),
      0.5,
      1,
    ),
  };
}

export function loadJudgeSettings(): JudgeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_JUDGE_SETTINGS;
    return normalizeJudgeSettings(JSON.parse(raw) as Partial<JudgeSettings>);
  } catch {
    return DEFAULT_JUDGE_SETTINGS;
  }
}

export function saveJudgeSettings(next: JudgeSettings): JudgeSettings {
  const normalized = normalizeJudgeSettings(next);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function updateJudgeSettings(patch: Partial<JudgeSettings>): JudgeSettings {
  return saveJudgeSettings({ ...loadJudgeSettings(), ...patch });
}
