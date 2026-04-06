import {
  PDEFS, STAFF_DEFS, D20_TABLE, ARCH_MAP, ARCH_TOP,
  POLI_CHOICES, PLAYER_NAMES,
  PURCHASE_BASE, MAINT_PER_PROP, MAX_HOLD,
  INIT_CASH, STAFF_COST, INSURANCE_PAYOUT,
  getBuyLimit, getFieldLimit, getSellLimit,
} from './constants'
import type {
  GameState, Player, OwnedProp, StaffCard, AttachedCard,
  BaseEval, FinalPriceResult, EcoType, RollResult,
} from './types'

/* ============================================================
   ユーティリティ
   ============================================================ */
export function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const s = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1e8) return s + (a / 1e8).toFixed(1) + '億'
  return s + (a / 1e4).toFixed(0) + '万'
}

export function fmtR(v: number | string): string {
  if (typeof v === 'string') return v
  if (Math.abs(v - 1/15) < 0.001) return '1/15'
  if (Math.abs(v - 0.1) < 0.001) return '1/10'
  return '×' + v.toFixed(2)
}

/* ============================================================
   山札作成
   ============================================================ */
export function createPropDeck(n: number) {
  let u = 0
  const c: { uid: string; def: typeof PDEFS[0] }[] = []
  PDEFS.forEach(d => {
    const k = n <= 4 ? d.c4 : d.c6
    for (let i = 0; i < k; i++) c.push({ uid: `${d.id}_${u++}`, def: d })
  })
  return shuffle(c)
}

export function createStaffDeck(n: number) {
  let u = 0
  const c: { uid: string; def: typeof STAFF_DEFS[0] }[] = []
  const k = n <= 4 ? 2 : 3
  STAFF_DEFS.forEach(d => {
    for (let i = 0; i < k; i++) c.push({ uid: `${d.id}_${u++}`, def: d })
  })
  return shuffle(c)
}

/* ============================================================
   ターン順更新
   ============================================================ */
export function updateOrder(players: Player[], prev: string[], yr: number): string[] {
  if (yr === 1) return prev
  return [...players]
    .sort((a, b) => {
      const [pi, pj] = [prev.indexOf(a.id), prev.indexOf(b.id)]
      return yr <= 5
        ? (b.cash !== a.cash ? b.cash - a.cash : pi - pj)
        : (a.cash !== b.cash ? a.cash - b.cash : pi - pj)
    })
    .map(p => p.id)
}

/* ============================================================
   ゲーム初期化
   ============================================================ */
export function initGame(): GameState {
  const players: Player[] = PLAYER_NAMES.map((name, i) => ({
    id: 'p' + (i + 1), name, cash: INIT_CASH,
    ownedProps: [], boughtThisYear: 0, soldThisYear: 0,
    hand: [], fieldSlots: [], pendingCards: [],
    spyAttachments: [], acquiredStaffThisTurn: false, sagiUsedThisTurn: false,
  }))
  const propDeck  = createPropDeck(4)
  const staffDeck = createStaffDeck(4)
  const turnOrder = shuffle(players.map(p => p.id))
  return {
    year: 1, eco: '安定', prevEco: null,
    sellRate: 1.0, buyRate: 1.0, prevSell: 1.0, prevBuy: 1.0,
    unstableFlag: false, propDeck, staffDeck, players, turnOrder,
    phase: 'actions', curIdx: 0, rollResult: null,
    log: [
      '【ゲーム開始】初期資金3000万',
      `不動産山札:${propDeck.length}枚 / 人材山札:${staffDeck.length}枚`,
      '1年目 景気:安定（固定）', 'STEP6 アクション開始',
    ],
  }
}

/* ============================================================
   calculateBaseEvaluation（仕様書5-1 Step1〜5）
   ============================================================ */
export function calculateBaseEvaluation(
  prop: OwnedProp, sellRate: number, eco: EcoType
): BaseEval {
  const def = prop.def
  const baseSale  = def.sale
  const holdBonus = prop.holdingYears * def.hb
  const preRate   = baseSale + holdBonus
  const afterRate = Math.round(preRate * sellRate)
  let ecoBonus = 0
  if (def.sp?.type === 'eco') ecoBonus = def.sp.map[eco] ?? 0
  const total = afterRate + ecoBonus
  const fM = (n: number) => (n / 10000).toFixed(0) + '万'
  const rS = sellRate === 1 ? '×1.0'
    : Math.abs(sellRate - 1/15) < 0.001 ? '×1/15'
    : Math.abs(sellRate - 0.1) < 0.001  ? '×1/10'
    : '×' + sellRate.toFixed(2)
  const hP = holdBonus > 0 ? ` + ${fM(holdBonus)}(保持${prop.holdingYears}年)` : ''
  const eP = ecoBonus  > 0 ? ` + ${fM(ecoBonus)}(景気)` : ''
  return {
    baseSale, holdBonus, preRate, afterRate, ecoBonus, total,
    formula: `(${fM(baseSale)}${hP}) ${rS} = ${fM(afterRate)}${eP} = ${fM(total)}`,
  }
}

/* ============================================================
   calculateFinalPrice（仕様書5-1 Step2 初動優先ルール）
   ============================================================ */
export function calculateFinalPrice(
  prop: OwnedProp,
  baseEval: BaseEval,
  { skipInsurance = false } = {}
): FinalPriceResult {
  const cards = prop.attachedCards ?? []
  let price = baseEval.total
  const baseSale = prop.def.sale
  const minG = Math.round(baseSale * 0.8)

  if (!cards.length) {
    return {
      finalPrice: price, minGuarantee: minG,
      isCorrupted: false, isProtected: false, pattern: 'none',
      steps: [
        { label: '基礎評価額', price },
        { label: '最終評価額', price, note: '付属カードなし' },
      ],
    }
  }

  const firstId    = cards[0].def.id
  const isCorrupted = firstId === 'obak'
  const isProtected = firstId === 'secu' || firstId === 'insu'
  const firstName  = cards[0].def.name
  const steps = [
    { label: '基礎評価額', price },
    {
      label: '初動判定', price,
      note: isCorrupted ? `パターンA:[${firstName}]先頭`
          : isProtected ? `パターンB:[${firstName}]先頭`
          : 'パターンC:通常',
      isHeader: true,
    },
  ]

  if (isCorrupted) {
    for (const c of cards) {
      if (c.def.id === 'obak') { price = 0; steps.push({ label: '泥棒（幽霊）', price, note: '0円に' }) }
      else steps.push({ label: c.def.name, price, note: '[幽霊]先付けにより無効', blocked: true })
    }
  } else if (isProtected) {
    for (const c of cards) {
      if (c.def.id === 'secu') {
        price += 20_000_000; steps.push({ label: 'セコム', price, note: '+2000万' })
      } else if (c.def.id === 'insu') {
        if (!skipInsurance) {
          if (price < minG) { price = minG; steps.push({ label: '保険会社', price, note: `${fmt(minG)}(基本の80%)へ` }) }
          else steps.push({ label: '保険会社', price, note: '最低保証不要' })
        } else {
          steps.push({ label: '保険会社', price, note: '地面師使用により無効', blocked: true })
        }
      } else if (c.def.id === 'obak') {
        steps.push({ label: '泥棒（幽霊）', price, note: `[${firstName}]先付けによりブロック`, blocked: true })
      }
    }
  } else {
    for (const c of cards) {
      if (c.def.id === 'secu') {
        price += 20_000_000; steps.push({ label: 'セコム', price, note: '+2000万' })
      } else if (c.def.id === 'insu') {
        if (!skipInsurance) {
          if (price < minG) { price = minG; steps.push({ label: '保険会社', price, note: `${fmt(minG)}(基本の80%)へ` }) }
          else steps.push({ label: '保険会社', price, note: '最低保証不要' })
        } else {
          steps.push({ label: '保険会社', price, note: '地面師使用により無効', blocked: true })
        }
      } else if (c.def.id === 'obak') {
        price = 0; steps.push({ label: '泥棒（幽霊）', price, note: '0円に' })
      }
    }
  }

  steps.push({ label: '最終評価額', price })
  return {
    finalPrice: price, minGuarantee: minG,
    isCorrupted, isProtected,
    pattern: isCorrupted ? 'A' : isProtected ? 'B' : 'C',
    steps,
  }
}

/* ============================================================
   景気ロール解決（仕様書3-2）
   ============================================================ */
export function resolveEco(
  roll: number, prevEco: EcoType | null,
  prevSell: number, prevBuy: number, unstableFlag: boolean
): RollResult {
  const row = D20_TABLE.find(r => r.r.includes(roll))!
  let rawEco = row.eco as EcoType
  let eco: EcoType = rawEco
  const msgs: string[] = []

  if (rawEco === 'バブル崩壊') {
    if (prevEco === 'バブル景気') msgs.push('バブル崩壊条件成立')
    else { eco = '不景気'; msgs.push('出目1:不景気') }
  }

  let sell: number, buy: number
  switch (eco) {
    case 'バブル崩壊': sell = 0.1;     buy = prevBuy;  break
    case '不景気':    sell = 0.5;     buy = 0.5;      break
    case '不安定':    sell = prevSell; buy = prevBuy;  break
    case '安定':      sell = 1.0;     buy = 1.0;      break
    case '天災地変':  sell = prevSell; buy = prevBuy;  break
    case '好景気':    sell = 1.5;     buy = 1.0;      break
    case 'バブル景気':sell = 3.0;     buy = 2.0;      break
    default:          sell = 1.0;     buy = 1.0
  }

  let nextFlag = false
  if (unstableFlag) {
    if (eco === '天災地変') {
      msgs.push('不安定フラグON:天災補正なし')
    } else if (eco === 'バブル崩壊') {
      sell = 1/15; msgs.push('不安定フラグON:売却1/15')
    } else if (eco === '不景気') {
      sell *= 0.5; buy *= 0.5; msgs.push('不安定フラグON:不景気特例→×0.25')
    } else {
      const [ps, pb] = [sell, buy]
      sell *= 1.5; buy *= 1.5
      msgs.push(`不安定フラグON:×1.5 売${fmtR(ps)}→${fmtR(sell)}`)
    }
  } else {
    msgs.push('不安定フラグOFF')
  }

  if (eco === '不安定') { nextFlag = true; msgs.push('今年が不安定→来年フラグON') }

  return {
    eco, rawEco, roll,
    sell: parseFloat(sell.toFixed(6)),
    buy:  parseFloat(buy.toFixed(6)),
    nextFlag, msgs,
  }
}

/* ============================================================
   executeSale — 売却完了処理
   ============================================================ */
export function executeSale(
  gs: GameState, propUid: string,
  { useJimu = false, forcedPid = null as string | null, forced = false } = {}
): GameState {
  const pid  = forcedPid ?? gs.turnOrder[gs.curIdx]
  const p    = gs.players.find(x => x.id === pid)!
  const prop = p?.ownedProps.find(op => op.uid === propUid)
  if (!prop) return gs

  const baseEval    = calculateBaseEvaluation(prop, gs.sellRate, gs.eco)
  const finalResult = calculateFinalPrice(prop, baseEval, { skipInsurance: useJimu })
  let saleAmount    = finalResult.finalPrice
  const logs: string[] = []

  let newPropDeck  = [...gs.propDeck, { uid: prop.uid, def: prop.def }]
  let newStaffDeck = [...gs.staffDeck]
  ;(prop.attachedCards ?? []).forEach(ac => newStaffDeck.push({ uid: ac.uid, def: ac.def }))

  let jimuRoll: number | null = null
  if (useJimu) {
    jimuRoll = Math.floor(Math.random() * 6) + 1
    const mult = jimuRoll - 1
    const before = saleAmount
    saleAmount = Math.round(before * mult)
    const jc = p.pendingCards.find(c => c.def.id === 'jimu')
    if (jc) newStaffDeck.push({ uid: jc.uid, def: jc.def })
    logs.push(`地面師発動！d6=${jimuRoll}（×${mult}倍）: ${fmt(before)}→${fmt(saleAmount)}`)
  }

  // スパイ按分
  const spyPay = p.spyAttachments.map(s => ({
    toPid: s.attachedByPid,
    amount: Math.round(saleAmount * 0.2),
  }))
  const totalCut   = spyPay.reduce((a, s) => a + s.amount, 0)
  const sellerRec  = saleAmount - totalCut

  if (spyPay.length > 0) {
    spyPay.forEach(s => {
      const spy = gs.players.find(x => x.id === s.toPid)
      logs.push(`企業スパイ（${spy?.name}）が${fmt(s.amount)}を横取り`)
    })
    logs.push(`${p.name}の最終受取: ${fmt(sellerRec)}`)
  } else {
    logs.push(`${p.name}: ${fmt(saleAmount)}受取`)
  }

  const newPlayers = gs.players.map(x => {
    if (x.id === pid) return {
      ...x,
      cash: x.cash + sellerRec,
      ownedProps: x.ownedProps.filter(op => op.uid !== propUid),
      soldThisYear: forced ? (x.soldThisYear ?? 0) : (x.soldThisYear ?? 0) + 1,
      pendingCards: useJimu ? x.pendingCards.filter(c => c.def.id !== 'jimu') : x.pendingCards,
    }
    const cut = spyPay.filter(s => s.toPid === x.id).reduce((a, s) => a + s.amount, 0)
    return cut > 0 ? { ...x, cash: x.cash + cut } : x
  })

  const tag = forced ? '【強制売却】' : ''
  return {
    ...gs,
    players:   newPlayers,
    propDeck:  shuffle(newPropDeck),
    staffDeck: shuffle(newStaffDeck),
    log: [
      ...gs.log,
      `${tag}${p.name}: 「${prop.def.name}」売却 → ${fmt(saleAmount)}`,
      ...logs,
    ],
  }
}

/* ============================================================
   アクション関数群
   ============================================================ */
export function applyRoll(gs: GameState, roll: number): GameState {
  const res = resolveEco(roll, gs.prevEco, gs.sellRate, gs.buyRate, gs.unstableFlag)
  const nextPhase = res.eco === '天災地変' ? 'disaster' : 'maintenance'
  return {
    ...gs,
    eco: res.eco, prevEco: gs.eco,
    sellRate: res.sell, buyRate: res.buy,
    prevSell: gs.sellRate, prevBuy: gs.buyRate,
    unstableFlag: res.nextFlag, rollResult: res,
    phase: nextPhase,
    log: [
      ...gs.log,
      `d20=${res.roll}→${res.eco}（売${fmtR(res.sell)}/買${fmtR(res.buy)}）`,
      ...res.msgs,
      ...(res.eco === '天災地変' ? ['⚠️ 天災地変！STEP3で全プレイヤーの物件半数を破壊します'] : []),
    ],
  }
}

export function applyMaintenance(gs: GameState): GameState {
  const msgs = ['--- STEP5 維持費 ---']
  const np = gs.players.map(p => {
    const t = (p.ownedProps.length + p.fieldSlots.length + p.pendingCards.length) * MAINT_PER_PROP
    msgs.push(t > 0 ? `${p.name}: -${fmt(t)}` : `${p.name}: 0円`)
    return { ...p, cash: p.cash - t }
  })
  return { ...gs, players: np, phase: 'actions', curIdx: 0, log: [...gs.log, ...msgs, 'STEP6 開始'] }
}

export function applyDisaster(gs: GameState): GameState {
  const logs = ['━━━ STEP3: 天災地変発動！━━━']
  let newPropDeck  = [...gs.propDeck]
  let newStaffDeck = [...gs.staffDeck]
  const cashDeltas: Record<string, number> = {}
  let newPlayersProps = gs.players.map(p => ({ ...p }))

  gs.players.forEach((p, pi) => {
    const total = p.ownedProps.length
    const count = Math.floor(total / 2)
    if (count === 0) { logs.push(`${p.name}: 保有${total}件 → 破壊0件（対象外）`); return }

    const indices = Array.from({ length: total }, (_, i) => i)
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]]
    }
    const destroyIdx = new Set(indices.slice(0, count))
    const toDestroy  = p.ownedProps.filter((_, i) => destroyIdx.has(i))
    const toKeep     = p.ownedProps.filter((_, i) => !destroyIdx.has(i))
    let insurancePayout = 0

    toDestroy.forEach(op => {
      const ac = op.attachedCards ?? []
      ac.forEach(c => {
        if (c.def.id === 'insu') {
          insurancePayout += INSURANCE_PAYOUT
          newStaffDeck.push({ uid: c.uid, def: c.def })
          logs.push(`  💰 ${p.name}:「${op.def.name}」保険会社付着 → 保険金${fmt(INSURANCE_PAYOUT)}支払`)
        } else {
          newStaffDeck.push({ uid: c.uid, def: c.def })
        }
      })
      newPropDeck.push({ uid: op.uid, def: op.def })
      logs.push(`  🔥 ${p.name}:「${op.def.name}」（保持${op.holdingYears}年・付属${ac.length}枚）が全損破棄`)
    })

    if (insurancePayout > 0) cashDeltas[p.id] = (cashDeltas[p.id] ?? 0) + insurancePayout
    newPlayersProps[pi] = { ...newPlayersProps[pi], ownedProps: toKeep }
    logs.push(`${p.name}: 保有${total}件 → ${count}件破壊 / ${toKeep.length}件残存${insurancePayout > 0 ? ` 保険金+${fmt(insurancePayout)}` : ''}`)
  })

  const finalPlayers = newPlayersProps.map(p => {
    const d = cashDeltas[p.id] ?? 0
    return d > 0 ? { ...p, cash: p.cash + d } : p
  })

  return {
    ...gs,
    players:   finalPlayers,
    propDeck:  shuffle(newPropDeck),
    staffDeck: shuffle(newStaffDeck),
    phase: 'maintenance',
    log: [...gs.log, ...logs, '━━━ 天災地変処理完了 → STEP5維持費へ ━━━'],
  }
}

export function applyBuy(gs: GameState): GameState {
  const pid = gs.turnOrder[gs.curIdx]
  const p   = gs.players.find(x => x.id === pid)!
  if (p.boughtThisYear >= getBuyLimit(gs.year) || gs.propDeck.length === 0) return gs
  const cost = Math.round(PURCHASE_BASE * gs.buyRate)
  const [card, ...rest] = gs.propDeck
  const newProp: OwnedProp = {
    uid: card.uid, def: card.def,
    purchaseYear: gs.year, holdingYears: 0, attachedCards: [], isSecured: false,
  }
  const np = gs.players.map(x => x.id !== pid ? x : {
    ...x, cash: x.cash - cost,
    ownedProps: [...x.ownedProps, newProp],
    boughtThisYear: x.boughtThisYear + 1,
  })
  return { ...gs, players: np, propDeck: rest, log: [...gs.log, `${p.name}: 「${card.def.name}」購入（${fmt(cost)}）残${rest.length}枚`] }
}

export function applyDrawStaff(gs: GameState): GameState {
  const pid = gs.turnOrder[gs.curIdx]
  const p   = gs.players.find(x => x.id === pid)!
  if (p.acquiredStaffThisTurn || gs.staffDeck.length === 0) return gs
  const [card, ...rest] = gs.staffDeck
  const isAct = card.def.type === 'activatable'
  const ca    = p.cash - STAFF_COST
  const np = gs.players.map(x => x.id !== pid ? x : {
    ...x, cash: ca,
    hand:         isAct ? x.hand : [...x.hand, card],
    pendingCards: isAct ? [...x.pendingCards, card] : x.pendingCards,
    acquiredStaffThisTurn: true,
  })
  return { ...gs, players: np, staffDeck: rest, log: [...gs.log, `${p.name}: 「${card.def.name}」取得（500万）${ca < 0 ? ' ⚠' : ''}残${rest.length}枚`] }
}

export function applyDeployToField(gs: GameState, uid: string): GameState {
  const pid  = gs.turnOrder[gs.curIdx]
  const p    = gs.players.find(x => x.id === pid)!
  const card = p.hand.find(c => c.uid === uid)
  if (!card || card.def.type !== 'slot' || card.def.id === 'spyy') return gs
  const lim  = getFieldLimit(p.fieldSlots)
  if (p.fieldSlots.length >= lim) return { ...gs, log: [...gs.log, `⚠ スロット満杯（${lim}枚）`] }
  const np = gs.players.map(x => x.id !== pid ? x : {
    ...x,
    hand:       x.hand.filter(c => c.uid !== uid),
    fieldSlots: [...x.fieldSlots, { ...card, deployedYear: gs.year }],
  })
  return { ...gs, players: np, log: [...gs.log, `${p.name}: 「${card.def.name}」を場に展開`] }
}

export function applyDeploySpy(gs: GameState, uid: string, tpid: string): GameState {
  const pid  = gs.turnOrder[gs.curIdx]
  const p    = gs.players.find(x => x.id === pid)!
  const card = p.hand.find(c => c.uid === uid)
  if (!card || card.def.id !== 'spyy') return gs
  if (p.fieldSlots.length >= getFieldLimit(p.fieldSlots)) return { ...gs, log: [...gs.log, '⚠ スロット満杯'] }
  const t = gs.players.find(x => x.id === tpid)!
  const np = gs.players.map(x => {
    if (x.id === pid)  return { ...x, hand: x.hand.filter(c => c.uid !== uid), fieldSlots: [...x.fieldSlots, { ...card, deployedYear: gs.year, targetPid: tpid }] }
    if (x.id === tpid) return { ...x, spyAttachments: [...x.spyAttachments, { uid: card.uid, def: card.def, attachedByPid: pid, remainingYears: 5 }] }
    return x
  })
  return { ...gs, players: np, log: [...gs.log, `${p.name}: 企業スパイ→${t.name}に付着`] }
}

export function applyAttach(gs: GameState, cardUid: string, tpid: string, propUid: string): GameState {
  const pid  = gs.turnOrder[gs.curIdx]
  const p    = gs.players.find(x => x.id === pid)!
  const card = p.hand.find(c => c.uid === cardUid)
  if (!card || card.def.type !== 'prop_attach') return gs
  const t    = gs.players.find(x => x.id === tpid)!
  const prop = t?.ownedProps.find(op => op.uid === propUid)
  if (!prop) return gs
  const isSecom = card.def.id === 'secu'
  const ac: AttachedCard = {
    uid: card.uid, def: card.def,
    attachedYear: gs.year,
    attachOrder: (prop.attachedCards ?? []).length,
    attachedByPid: pid,
  }
  const upd = (ops: OwnedProp[]) => ops.map(op => op.uid !== propUid ? op : {
    ...op,
    attachedCards: [...(op.attachedCards ?? []), ac],
    isSecured: isSecom ? true : op.isSecured,
  })
  const np = gs.players.map(x => {
    if (x.id === pid && x.id === tpid) return { ...x, hand: x.hand.filter(c => c.uid !== cardUid), ownedProps: upd(x.ownedProps) }
    if (x.id === pid)  return { ...x, hand: x.hand.filter(c => c.uid !== cardUid) }
    if (x.id === tpid) return { ...x, ownedProps: upd(x.ownedProps) }
    return x
  })
  return { ...gs, players: np, log: [...gs.log, `${p.name}: 「${card.def.name}」→${pid === tpid ? '自分の' : `相手(${t.name})の`}「${prop.def.name}」（付着順${ac.attachOrder + 1}番目）`] }
}

/* ── 特殊カード発動 ── */
export function applyArchitect(gs: GameState, propUid: string): GameState {
  const pid      = gs.turnOrder[gs.curIdx]
  const p        = gs.players.find(x => x.id === pid)!
  const archCard = p.fieldSlots.find(c => c.def.id === 'arch')
  if (!archCard) return gs
  const prop = p.ownedProps.find(op => op.uid === propUid)
  if (!prop) return gs
  const targetId = ARCH_MAP[prop.def.id]
  if (!targetId) return { ...gs, log: [...gs.log, `⚠ 「${prop.def.name}」はすでに最上位のため建築家を使用できません`] }
  const masterDef = PDEFS.find(d => d.id === targetId)!
  const upgradedProp: OwnedProp = {
    uid: prop.uid,
    attachedCards: prop.attachedCards,
    holdingYears:  prop.holdingYears,
    isSecured:     prop.isSecured,
    purchaseYear:  prop.purchaseYear,
    def: { ...masterDef },
  }
  const np = gs.players.map(x => x.id !== pid ? x : {
    ...x,
    ownedProps:  x.ownedProps.map(op => op.uid !== propUid ? op : upgradedProp),
    fieldSlots:  x.fieldSlots.filter(c => c.uid !== archCard.uid),
  })
  return {
    ...gs, players: np,
    staffDeck: shuffle([...gs.staffDeck, { uid: archCard.uid, def: archCard.def }]),
    log: [...gs.log, `★建築家発動！「${prop.def.name}」→「${masterDef.name}」に進化（付属${(prop.attachedCards ?? []).length}枚・保持${prop.holdingYears}年継承）`],
  }
}

export function applyPolitician(gs: GameState, choiceId: string): GameState {
  const pid  = gs.turnOrder[gs.curIdx]
  const p    = gs.players.find(x => x.id === pid)!
  const poli = p.fieldSlots.find(c => c.def.id === 'poli')
  if (!poli) return gs
  const choice = POLI_CHOICES.find(c => c.id === choiceId)
  if (!choice) return gs
  const sell = choice.sell === 'prev' ? gs.sellRate : choice.sell
  const buy  = choice.buy  === 'prev' ? gs.buyRate  : choice.buy
  const np = gs.players.map(x => x.id !== pid ? x : {
    ...x, fieldSlots: x.fieldSlots.filter(c => c.uid !== poli.uid),
  })
  return {
    ...gs, players: np, eco: choice.eco, sellRate: sell, buyRate: buy,
    staffDeck: shuffle([...gs.staffDeck, { uid: poli.uid, def: poli.def }]),
    log: [...gs.log, `★政治家発動！景気を「${choice.eco}」に変更（売${fmtR(sell)}/買${fmtR(buy)}）政治家カードは破棄`],
  }
}

export function applySwindler(
  gs: GameState,
  myPropUids: string[],
  theirEntries: { pid: string; uid: string }[]
): GameState {
  const pid  = gs.turnOrder[gs.curIdx]
  const me   = gs.players.find(x => x.id === pid)!
  const sagi = me.fieldSlots.find(c => c.def.id === 'sagi')
  if (!sagi || me.sagiUsedThisTurn) return gs

  const myProps    = myPropUids.map(uid => me.ownedProps.find(op => op.uid === uid)).filter(Boolean) as OwnedProp[]
  const theirProps = theirEntries.map(e => ({
    fromPid: e.pid,
    prop: gs.players.find(x => x.id === e.pid)?.ownedProps.find(op => op.uid === e.uid),
  })).filter(e => e.prop) as { fromPid: string; prop: OwnedProp }[]

  if (myProps.length !== 2 || theirProps.length !== 2) return gs

  const newPlayers = gs.players.map(x => {
    if (x.id === pid) return {
      ...x,
      ownedProps: [
        ...x.ownedProps.filter(op => !myPropUids.includes(op.uid)),
        ...theirProps.map(e => ({ ...e.prop })),
      ],
      fieldSlots: x.fieldSlots.filter(c => c.uid !== sagi.uid),
      sagiUsedThisTurn: true,
    }
    const removeUids = theirEntries.filter(e => e.pid === x.id).map(e => e.uid)
    if (!removeUids.length) return x
    const gainMyProps = theirEntries.map((e, i) => e.pid === x.id ? myProps[i] : null).filter(Boolean) as OwnedProp[]
    return {
      ...x,
      ownedProps: [
        ...x.ownedProps.filter(op => !removeUids.includes(op.uid)),
        ...gainMyProps.map(p => ({ ...p })),
      ],
    }
  })

  const logParts = theirEntries.map((e, i) => {
    const tp = gs.players.find(x => x.id === e.pid)!
    return `「${myProps[i].def.name}」↔${tp.name}の「${theirProps[i].prop.def.name}」`
  })
  return {
    ...gs, players: newPlayers,
    staffDeck: shuffle([...gs.staffDeck, { uid: sagi.uid, def: sagi.def }]),
    log: [...gs.log, `★詐欺師発動！${logParts.join(' / ')} — カードは破棄`],
  }
}

export function applyEndTurn(gs: GameState): GameState {
  const n = gs.curIdx + 1
  if (n < gs.turnOrder.length) return { ...gs, curIdx: n, log: [...gs.log, '次プレイヤーへ'] }
  return applyEndYear(gs)
}

export function applyEndYear(gs: GameState): GameState {
  let w: GameState = { ...gs, log: [...gs.log, '--- 年度末処理 ---'] }

  // holdingYears +1
  w = { ...w, players: w.players.map(p => ({ ...p, ownedProps: p.ownedProps.map(op => ({ ...op, holdingYears: op.holdingYears + 1 })) })) }

  // 5年超過チェック
  for (const origP of w.players) {
    const expired = origP.ownedProps.filter(op => op.holdingYears >= MAX_HOLD)
    if (!expired.length) continue
    w = { ...w, log: [...w.log, `${origP.name}: 保持5年超過 ${expired.length}件`] }
    for (const op of expired.slice(0, 2))  w = executeSale(w, op.uid, { forcedPid: origP.id, forced: true })
    for (const op of expired.slice(2)) {
      const cur = w.players.find(x => x.id === origP.id)?.ownedProps.find(o => o.uid === op.uid)
      if (!cur) continue
      const rc = (cur.attachedCards ?? []).map(ac => ({ uid: ac.uid, def: ac.def }))
      w = {
        ...w,
        players:   w.players.map(x => x.id !== origP.id ? x : { ...x, ownedProps: x.ownedProps.filter(o => o.uid !== op.uid) }),
        propDeck:  [...w.propDeck, { uid: cur.uid, def: cur.def }],
        staffDeck: shuffle([...w.staffDeck, ...rc]),
        log: [...w.log, `【焼失】${origP.name}: 「${cur.def.name}」3枚目以降→0円焼失`],
      }
    }
  }

  // リセット
  w = {
    ...w,
    players: w.players.map(p => ({
      ...p, boughtThisYear: 0, soldThisYear: 0,
      acquiredStaffThisTurn: false, sagiUsedThisTurn: false,
      spyAttachments: p.spyAttachments
        .map(s => ({ ...s, remainingYears: s.remainingYears - 1 }))
        .filter(s => s.remainingYears > 0),
    })),
  }

  const ny = w.year + 1

  // ゲーム終了
  if (ny > 10) {
    const fpd = [...w.propDeck], fsd = [...w.staffDeck]
    const gol = ['=== 全10ターン終了 ===']
    const fp  = w.players.map(p => {
      p.ownedProps.forEach(op => {
        fpd.push({ uid: op.uid, def: op.def });
        (op.attachedCards ?? []).forEach(ac => fsd.push({ uid: ac.uid, def: ac.def }))
        gol.push(`【定義C】${p.name}: 「${op.def.name}」0円破棄`)
      })
      return { ...p, ownedProps: [] }
    })
    ;[...fp].sort((a, b) => b.cash - a.cash).forEach((p, i) => gol.push(`${i + 1}位: ${p.name} ${fmt(p.cash)}`))
    return { ...w, players: fp, propDeck: shuffle(fpd), staffDeck: shuffle(fsd), year: 11, phase: 'gameOver', log: [...w.log, ...gol] }
  }

  const no = updateOrder(w.players, w.turnOrder, ny)
  return {
    ...w, year: ny, turnOrder: no, phase: 'roll', curIdx: 0, rollResult: null,
    log: [...w.log, `${ny}年目開始。ターン順: ${no.map(id => w.players.find(p => p.id === id)!.name.split(' ')[0]).join('→')}`],
  }
}
