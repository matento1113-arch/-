import type { PropDef, StaffDef } from './types'

/* ── ゲーム定数 ── */
export const PURCHASE_BASE    = 3_000_000
export const MAINT_PER_PROP   = 2_000_000
export const MAX_HOLD         = 5
export const INIT_CASH        = 30_000_000
export const STAFF_COST       = 5_000_000
export const FIELD_SLOT_LIMIT = 2
export const INSURANCE_PAYOUT = 100_000_000

export const getBuyLimit   = (yr: number) => yr === 1 ? 3 : 2
export const getFieldLimit = (fieldSlots: {def:{id:string}}[]) =>
  fieldSlots.some(c => c.def.id === 'agnt') ? 3 : FIELD_SLOT_LIMIT
export const getSellLimit  = (fieldSlots: {def:{id:string}}[]) => {
  const n = fieldSlots.filter(c => c.def.id === 'lawy').length
  return n >= 2 ? 8 : n >= 1 ? 4 : 2
}

/* ── 建築家グレードアップ対応表（仕様書9-2） ── */
export const ARCH_MAP: Record<string, string> = {
  ikk: 'bss', kky: 'bss',
  m1r: 'm1b', m1f: 'm1b',
  ina: 'gnz', ekn: 'gnz',
}
export const ARCH_TOP = new Set(['bss', 'm1b', 'gnz', 'skg'])

/* ── 政治家 景気選択肢 ── */
export const POLI_CHOICES = [
  { id: 'hakai',   eco: 'バブル崩壊' as const, sell: 0.1,    buy: 'prev' as const, label: 'バブル崩壊（売×0.1）',       v: 'danger'  },
  { id: 'fukeiki', eco: '不景気'    as const, sell: 0.5,    buy: 0.5,             label: '不景気（売×0.5 / 買×0.5）',   v: 'warn'    },
  { id: 'antei',   eco: '安定'      as const, sell: 1.0,    buy: 1.0,             label: '安定（売×1.0 / 買×1.0）',     v: 'default' },
  { id: 'tensai',  eco: '天災地変'  as const, sell: 'prev' as const, buy: 'prev' as const, label: '天災地変（売買前年引継）', v: 'danger'  },
  { id: 'kokeiki', eco: '好景気'    as const, sell: 1.5,    buy: 1.0,             label: '好景気（売×1.5）',             v: 'success' },
  { id: 'bubble',  eco: 'バブル景気'as const, sell: 3.0,    buy: 2.0,             label: 'バブル景気（売×3.0）',         v: 'info'    },
]

/* ── d20 景気テーブル（仕様書3-1） ── */
export const D20_TABLE = [
  { r: [1],                  eco: 'バブル崩壊'  as const },
  { r: [2,3,4,5,6],         eco: '不景気'      as const },
  { r: [7],                  eco: '不安定'      as const },
  { r: [8,9,10,11,12],      eco: '安定'        as const },
  { r: [13],                 eco: '天災地変'    as const },
  { r: [14,15,16,17,18,19], eco: '好景気'      as const },
  { r: [20],                 eco: 'バブル景気'  as const },
]

/* ── 不動産カード一覧（仕様書9-1 定義B準拠） ── */
export const PDEFS: PropDef[] = [
  { id:'ikk', name:'一軒家',            c4:10,c6:12, sale:20_000_000,  hb:0,          sp:null },
  { id:'m1r', name:'マンションの1室',   c4:10,c6:12, sale:10_000_000,  hb:3_000_000,  sp:null },
  { id:'ina', name:'田舎の家',           c4:10,c6:12, sale:10_000_000,  hb:0,
    sp:{ type:'eco', map:{ '好景気':15_000_000, 'バブル景気':15_000_000 } } },
  { id:'kky', name:'高級住宅',           c4:5, c6:7,  sale:30_000_000,  hb:0,          sp:null },
  { id:'m1f', name:'マンション1フロア',  c4:5, c6:7,  sale:20_000_000,  hb:4_000_000,  sp:null },
  { id:'ekn', name:'駅近物件',           c4:5, c6:7,  sale:20_000_000,  hb:0,
    sp:{ type:'eco', map:{ '好景気':20_000_000, 'バブル景気':20_000_000 } } },
  { id:'bss', name:'別荘',               c4:3, c6:5,  sale:50_000_000,  hb:0,          sp:null },
  { id:'m1b', name:'マンション1棟',      c4:3, c6:5,  sale:30_000_000,  hb:5_000_000,  sp:null },
  { id:'gnz', name:'銀座一等地',         c4:3, c6:5,  sale:30_000_000,  hb:0,
    sp:{ type:'eco', map:{ '好景気':45_000_000, 'バブル景気':60_000_000 } } },
  { id:'skg', name:'最強の家',            c4:1, c6:1,  sale:200_000_000, hb:0,          sp:null },
]

/* ── 人材カード一覧（仕様書8） ── */
export const STAFF_DEFS: StaffDef[] = [
  { id:'exec', name:'凄腕経営者',   type:'slot',       fee:2_000_000,  desc:'毎年600万の固定収入' },
  { id:'secr', name:'敏腕秘書',     type:'slot',       fee:2_000_000,  desc:'維持管理費・人件費を0にする' },
  { id:'lawy', name:'弁護士',       type:'slot',       fee:2_000_000,  desc:'購入・売却枚数を2倍' },
  { id:'agnt', name:'エージェント', type:'slot',       fee:2_000_000,  desc:'人材スロット上限を3に拡張' },
  { id:'spyy', name:'企業スパイ',   type:'slot',       fee:2_000_000,  desc:'相手売却額20%を5年横取り' },
  { id:'arch', name:'建築家',       type:'slot',       fee:2_000_000,  desc:'物件を上位物件に進化させる（発動後破棄）' },
  { id:'jimu', name:'地面師',       type:'activatable',fee:2_000_000,  desc:'売却時d6振り（出目-1）倍' },
  { id:'poli', name:'政治家',       type:'slot',       fee:2_000_000,  desc:'景気を任意に変更する（発動後破棄）' },
  { id:'scou', name:'スカウトマン', type:'activatable',fee:2_000_000,  desc:'相手ストック人材1枚を奪う' },
  { id:'sagi', name:'詐欺師',       type:'slot',       fee:2_000_000,  desc:'自分2件↔相手2件の強制交換（発動後破棄・1ターン1回）' },
  { id:'obak', name:'泥棒（幽霊）', type:'prop_attach',fee:2_000_000,  desc:'対象物件の売却価格を0円にする' },
  { id:'secu', name:'セコム',       type:'prop_attach',fee:2_000_000,  desc:'対象物件+2000万（詐欺師交換対象外）' },
  { id:'insu', name:'保険会社',     type:'prop_attach',fee:10_000_000, desc:'売却時80%最低保証 / 天災時1億' },
]

/* ── スタイル定数 ── */
export const STYPES = {
  slot:        { bg:'#E6F1FB', fg:'#0C447C', lbl:'スロット' },
  activatable: { bg:'#FAEEDA', fg:'#633806', lbl:'発動後破棄' },
  prop_attach: { bg:'#EAF3DE', fg:'#27500A', lbl:'物件付属' },
} as const

export const ECO_CLR: Record<string, string> = {
  'バブル景気': '#E6F1FB|#0C447C',
  '好景気':     '#EAF3DE|#27500A',
  '安定':       '#F1EFE8|#444441',
  '不景気':     '#FAEEDA|#633806',
  '不安定':     '#FAEEDA|#854F0B',
  'バブル崩壊': '#FCEBEB|#791F1F',
  '天災地変':   '#FCEBEB|#501313',
}

export const AVATAR_COLORS = [
  '#E6F1FB|#0C447C',
  '#EAF3DE|#27500A',
  '#FAEEDA|#633806',
  '#FBEAF0|#72243E',
]

export const PLAYER_NAMES = ['山田 太郎', '鈴木 花子', '田中 一郎', '佐藤 美咲']

export const SPECIAL_CARD_IDS = new Set(['arch', 'poli', 'sagi'])
