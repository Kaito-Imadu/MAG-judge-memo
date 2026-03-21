import type { Apparatus, NDDefinition } from '../types';

// E審判の減点ボタン定義
export const E_DEDUCTION_BUTTONS = [
  { type: 'SMALL' as const, label: '-0.1', value: 0.1 },
  { type: 'MEDIUM' as const, label: '-0.3', value: 0.3 },
  { type: 'LARGE' as const, label: '-0.5', value: 0.5 },
  { type: 'FALL' as const, label: '-1.0', value: 1.0 },
];

// ND定義
export const ND_DEFINITIONS: NDDefinition[] = [
  {
    apparatus: 'FX',
    type: 'LINE',
    label: 'ライン減点',
    description: '演技面からのはみ出しによる減点',
    values: [0.1, 0.3, 0.5],
  },
  {
    apparatus: 'FX',
    type: 'TIME',
    label: 'タイム減点',
    description: '70秒を超過した場合の減点',
    values: [0.1, 0.3],
  },
  {
    apparatus: 'PH',
    type: 'TIME',
    label: 'タイム減点',
    description: '演技時間超過による減点',
    values: [0.1, 0.3],
  },
];

export function getNDDefinitions(apparatus: Apparatus): NDDefinition[] {
  return ND_DEFINITIONS.filter((nd) => nd.apparatus === apparatus);
}
