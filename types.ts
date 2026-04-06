/* ============================================================
   リーマンズ — 型定義
   ============================================================ */

export type EcoType =
  | 'バブル景気' | '好景気' | '安定' | '不景気'
  | '不安定' | 'バブル崩壊' | '天災地変'

export type StaffType = 'slot' | 'activatable' | 'prop_attach'

export type GamePhase =
  | 'roll' | 'disaster' | 'maintenance' | 'actions' | 'gameOver'

/* 不動産マスターデータ */
export interface PropDef {
  id: string
  name: string
  c4: number
  c6: number
  sale: number      // 基本売却益（受取総額・定義A）
  hb: number        // 保持ボーナス/年
  sp: SpecialEffect | null
}

export interface SpecialEffect {
  type: 'eco'
  map: Partial<Record<EcoType, number>>
}

/* 人材カードマスターデータ */
export interface StaffDef {
  id: string
  name: string
  type: StaffType
  fee: number
  desc: string
}

/* デッキ上のカードインスタンス */
export interface PropCard {
  uid: string
  def: PropDef
}

export interface StaffCard {
  uid: string
  def: StaffDef
  deployedYear?: number
  targetPid?: string   // 企業スパイの対象
}

/* 物件に付着したスタッフカード */
export interface AttachedCard {
  uid: string
  def: StaffDef
  attachedYear: number
  attachOrder: number
  attachedByPid: string
}

/* プレイヤーが保有する物件 */
export interface OwnedProp {
  uid: string
  def: PropDef
  purchaseYear: number
  holdingYears: number
  attachedCards: AttachedCard[]
  isSecured: boolean
}

/* スパイ被付着情報 */
export interface SpyAttachment {
  uid: string
  def: StaffDef
  attachedByPid: string
  remainingYears: number
}

/* プレイヤー */
export interface Player {
  id: string
  name: string
  cash: number
  ownedProps: OwnedProp[]
  boughtThisYear: number
  soldThisYear: number
  hand: StaffCard[]
  fieldSlots: StaffCard[]
  pendingCards: StaffCard[]
  spyAttachments: SpyAttachment[]
  acquiredStaffThisTurn: boolean
  sagiUsedThisTurn: boolean
}

/* ゲーム全体の状態 */
export interface GameState {
  year: number
  eco: EcoType
  prevEco: EcoType | null
  sellRate: number
  buyRate: number
  prevSell: number
  prevBuy: number
  unstableFlag: boolean
  propDeck: PropCard[]
  staffDeck: StaffCard[]
  players: Player[]
  turnOrder: string[]
  phase: GamePhase
  curIdx: number
  rollResult: RollResult | null
  log: string[]
}

export interface RollResult {
  roll: number
  eco: EcoType
  rawEco: EcoType
  sell: number
  buy: number
  nextFlag: boolean
  msgs: string[]
}

/* 売却計算の中間結果 */
export interface BaseEval {
  baseSale: number
  holdBonus: number
  preRate: number
  afterRate: number
  ecoBonus: number
  total: number
  formula: string
}

export interface FinalPriceResult {
  finalPrice: number
  minGuarantee: number
  isCorrupted: boolean
  isProtected: boolean
  pattern: 'A' | 'B' | 'C' | 'none'
  steps: PriceStep[]
}

export interface PriceStep {
  label: string
  price: number
  note?: string
  blocked?: boolean
  isHeader?: boolean
}

/* UIフロー（付与・スパイ）*/
export interface UIFlow {
  mode: 'attach' | 'spy'
  cardUid: string
  cardName: string
  step: 'player' | 'prop'
  tpid?: string
  tname?: string
}

export interface SwindlerEntry {
  pid: string
  uid: string
}
