import type { Apparatus } from '../types';

export interface ApparatusInfo {
  code: Apparatus;
  name: string;
  shortName: string;
  hasND: boolean;
  ndTypes: ('LINE' | 'TIME')[];
}

export const APPARATUS_LIST: ApparatusInfo[] = [
  { code: 'FX', name: 'ゆか', shortName: 'FX', hasND: true, ndTypes: ['LINE', 'TIME'] },
  { code: 'PH', name: 'あん馬', shortName: 'PH', hasND: true, ndTypes: ['TIME'] },
  { code: 'SR', name: 'つり輪', shortName: 'SR', hasND: false, ndTypes: [] },
  { code: 'VT', name: '跳馬', shortName: 'VT', hasND: false, ndTypes: [] },
  { code: 'PB', name: '平行棒', shortName: 'PB', hasND: false, ndTypes: [] },
  { code: 'HB', name: '鉄棒', shortName: 'HB', hasND: false, ndTypes: [] },
];

export const APPARATUS_MAP = Object.fromEntries(
  APPARATUS_LIST.map((a) => [a.code, a])
) as Record<Apparatus, ApparatusInfo>;
