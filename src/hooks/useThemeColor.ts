import { useEffect } from 'react';

/**
 * iOS 26 以降のホーム画面 Web App はステータスバーを不透明で描き、その背景に
 * `<meta name="theme-color">` を使う。画面ごとに上端の色が違う（ページヘッダーは
 * bg-primary、採点画面のツールバーは gray-100 / gray-800）ため、表示中の画面に
 * 合わせて meta を書き換え、ステータスバーとアプリ上端の継ぎ目を消す。
 */
export type ThemeColorKey = 'brand' | 'toolbar';

const THEME_COLORS: Record<ThemeColorKey, { light: string; dark: string }> = {
  // EntryPage / TrialPage の header（bg-primary）
  brand: { light: '#1B4F72', dark: '#1B4F72' },
  // JudgeSheet のツールバー（bg-gray-100 / dark:bg-gray-800）
  toolbar: { light: '#F3F4F6', dark: '#1F2937' },
};

export function useThemeColor(key: ThemeColorKey) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      meta.content = THEME_COLORS[key][mq.matches ? 'dark' : 'light'];
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [key]);
}
