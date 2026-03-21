import type { Apparatus, NDDefinition } from '../types';

// E審判の減点ボタン定義
export const E_DEDUCTION_BUTTONS = [
  { type: 'SMALL' as const, label: '-0.1', value: 0.1 },
  { type: 'MEDIUM' as const, label: '-0.3', value: 0.3 },
  { type: 'LARGE' as const, label: '-0.5', value: 0.5 },
  { type: 'FALL' as const, label: '-1.0', value: 1.0 },
];

// NDチェックリスト（見逃し防止用）
const ND_CHECKLIST: NDDefinition[] = [
  // ゆか 8項目
  { apparatus: 'FX', type: 'LINE', label: 'ライン' },
  { apparatus: 'FX', type: 'TIME', label: 'タイム' },
  { apparatus: 'FX', type: 'COMPOSITION', label: '片足平均立ち技 / ジャンプ / リープ' },
  { apparatus: 'FX', type: 'COMPOSITION', label: 'グループIから開始' },
  { apparatus: 'FX', type: 'COMPOSITION', label: 'コーナー動きすべて異なる' },
  { apparatus: 'FX', type: 'COMPOSITION', label: '終末技 2回宙 / 3回宙' },
  { apparatus: 'FX', type: 'COMPOSITION', label: '対角線3回' },
  { apparatus: 'FX', type: 'COMPOSITION', label: 'すべてのコーナー使用' },
  // つり輪 1項目
  { apparatus: 'SR', type: 'COMPOSITION', label: '振動から倒立静止技' },
  // 跳馬 1項目
  { apparatus: 'VT', type: 'LINE', label: 'ライン減点' },
];

export function getNDChecklist(apparatus: Apparatus): NDDefinition[] {
  return ND_CHECKLIST.filter((nd) => nd.apparatus === apparatus);
}
