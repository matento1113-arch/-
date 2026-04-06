import { useState, useRef } from 'react'
import {
  PDEFS, STAFF_DEFS, POLI_CHOICES,
  ARCH_MAP, ARCH_TOP, SPECIAL_CARD_IDS,
  STYPES, ECO_CLR, AVATAR_COLORS,
  MAINT_PER_PROP, PURCHASE_BASE, STAFF_COST,
  getBuyLimit, getFieldLimit, getSellLimit,
} from './constants'
import {
  initGame, fmt, fmtR,
  applyRoll, applyMaintenance, applyDisaster,
  applyBuy, applyDrawStaff,
  applyDeployToField, applyDeploySpy, applyAttach,
  applyArchitect, applyPolitician, applySwindler,
  executeSale, applyEndTurn,
  calculateBaseEvaluation, calculateFinalPrice,
} from './gameLogic'
import type { GameState, OwnedProp, StaffCard, UIFlow } from './types'

/* ============================================================
   スタイルヘルパー
   ============================================================ */
function ecoStyle(eco: string): React.CSSProperties {
  const [bg, color] = (ECO_CLR[eco] ?? '#F1EFE8|#444441').split('|')
  return { background: bg, color }
}
function avatarStyle(i: number, sz = 30): React.CSSProperties {
  const [bg, color] = (AVATAR_COLORS[i % 4]).split('|')
  return { width: sz, height: sz, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: sz / 2.5, fontWeight: 500, background: bg, color, flexShrink: 0 }
}

/* ============================================================
   小コンポーネント
   ============================================================ */
function Chip({ eco, sz = 12 }: { eco: string; sz?: number }) {
  return (
    <span style={{ ...ecoStyle(eco), padding: '2px 7px', borderRadius: 'var(--border-radius-md)',
      fontSize: sz, fontWeight: 500, display: 'inline-block' }}>
      {eco}
    </span>
  )
}

function TBadge({ type }: { type: string }) {
  const s = STYPES[type as keyof typeof STYPES] ?? { bg: '#F1EFE8', fg: '#444441', lbl: type }
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 10, fontWeight: 500,
      padding: '1px 6px', borderRadius: 99 }}>
      {s.lbl}
    </span>
  )
}

type BtnVariant = 'default' | 'info' | 'success' | 'warn' | 'danger'
const BTN_CLR: Record<BtnVariant, string> = {
  default: 'var(--color-border-secondary)|var(--color-text-primary)',
  info:    'var(--color-border-info)|var(--color-text-info)',
  success: 'var(--color-border-success)|var(--color-text-success)',
  warn:    'var(--color-border-warning)|var(--color-text-warning)',
  danger:  'var(--color-border-danger)|var(--color-text-danger)',
}
function Btn({
  onClick, disabled, v = 'default', sm, full, children,
}: {
  onClick?: () => void; disabled?: boolean; v?: BtnVariant
  sm?: boolean; full?: boolean; children: React.ReactNode
}) {
  const [bc, fc] = (BTN_CLR[v] ?? BTN_CLR.default).split('|')
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: sm ? '3px 8px' : '7px 13px', fontSize: sm ? 11 : 13,
        borderRadius: 'var(--border-radius-md)',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', border: `0.5px solid ${bc}`, background: 'transparent',
        opacity: disabled ? 0.4 : 1, color: fc, width: full ? '100%' : undefined,
      }}>
      {children}
    </button>
  )
}

/* ============================================================
   D20ダイス SVG
   ============================================================ */
function D20({ val, rolling, size = 70 }: { val: number | null; rolling?: boolean; size?: number }) {
  const d = val !== null ? String(val) : '—'
  return (
    <svg viewBox="0 0 140 140" width={size} height={size}>
      <polygon points="70,5 130,38 130,102 70,135 10,102 10,38"
        fill="var(--color-background-secondary)" stroke="var(--color-border-primary)" strokeWidth={1} />
      <polygon points="70,36 108,58 108,92 70,114 32,92 32,58"
        fill="none" stroke="var(--color-border-tertiary)" strokeWidth={0.5} />
      {(['70,5|70,36','130,38|108,58','130,102|108,92','70,135|70,114','10,102|32,92','10,38|32,58'] as string[]).map((s, i) => {
        const [[x1,y1],[x2,y2]] = s.split('|').map(p => p.split(','))
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-border-tertiary)" strokeWidth={0.5} />
      })}
      <text x={70} y={78} textAnchor="middle" dominantBaseline="middle"
        fontSize={d.length > 1 ? 26 : 32} fontWeight={500} fontFamily="var(--font-mono)"
        fill="var(--color-text-primary)" opacity={rolling ? 0.3 : 1}>
        {d}
      </text>
    </svg>
  )
}

/* ============================================================
   PropCard — 物件カード表示
   ============================================================ */
function PropCard({
  op, sellRate, eco, attachBtn, onAttach, onSell, sellDisabledReason,
}: {
  op: OwnedProp; sellRate: number; eco: string
  attachBtn?: boolean; onAttach?: () => void
  onSell?: () => void; sellDisabledReason?: string | null
}) {
  const rem = 5 - op.holdingYears
  const isDanger = rem <= 0, isWarn = rem === 1
  const base = calculateBaseEvaluation(op, sellRate, eco as any)
  const fin  = calculateFinalPrice(op, base)
  const hasCards = (op.attachedCards ?? []).length > 0
  const canUpgrade = !ARCH_TOP.has(op.def.id) && ARCH_MAP[op.def.id]

  const bc = attachBtn ? 'var(--color-border-info)'
    : isDanger ? 'var(--color-border-danger)'
    : isWarn   ? 'var(--color-border-warning)'
    : 'var(--color-border-tertiary)'
  const bg = attachBtn ? 'var(--color-background-info)'
    : isDanger ? 'var(--color-background-danger)'
    : isWarn   ? 'var(--color-background-warning)'
    : 'var(--color-background-secondary)'
  const nameColor = attachBtn ? 'var(--color-text-info)'
    : isDanger ? 'var(--color-text-danger)'
    : isWarn   ? 'var(--color-text-warning)'
    : 'var(--color-text-primary)'

  return (
    <div style={{ padding: '8px 10px', borderRadius: 'var(--border-radius-md)',
      border: `0.5px solid ${bc}`, background: bg, marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: nameColor }}>{op.def.name}</span>
          {op.isSecured && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: '#EAF3DE', color: '#27500A' }}>🔒SECOM</span>}
          {canUpgrade && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: '#EEEDFE', color: '#534AB7' }}>進化可</span>}
        </div>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
          {op.holdingYears}/5年
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: isDanger ? 'var(--color-text-danger)' : isWarn ? 'var(--color-text-warning)' : 'var(--color-text-secondary)' }}>
          {isDanger ? '⚠ 売却必須' : isWarn ? '残1年' : `あと${rem}年`}
        </span>
        <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-mono)',
          color: fin.isCorrupted ? 'var(--color-text-secondary)'
            : base.ecoBonus > 0 ? 'var(--color-text-success)'
            : 'var(--color-text-primary)' }}>
          {fmt(fin.finalPrice)}
        </span>
      </div>

      <div style={{ fontSize: 9, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
        {base.formula}
      </div>

      {hasCards && (
        <div style={{ borderTop: `0.5px solid ${bc}`, paddingTop: 3, marginTop: 3 }}>
          {(op.attachedCards ?? []).map((ac, i) => {
            const s = STYPES[ac.def.type as keyof typeof STYPES] ?? { bg: '#F1EFE8', fg: '#444441' }
            return (
              <div key={ac.uid} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                <span style={{ fontSize: 9, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', padding: '0 4px', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>#{i+1}</span>
                <span style={{ background: s.bg, color: s.fg, fontSize: 9, padding: '0 5px', borderRadius: 99 }}>{ac.def.name}</span>
              </div>
            )
          })}
        </div>
      )}

      {attachBtn && onAttach && (
        <div style={{ marginTop: 5 }}>
          <Btn onClick={onAttach} sm v="info">← ここに付与する</Btn>
        </div>
      )}
      {onSell && (
        <div style={{ marginTop: 5 }}>
          <Btn onClick={onSell} sm v={sellDisabledReason ? 'default' : 'danger'} disabled={!!sellDisabledReason}>
            {sellDisabledReason ?? '売却実行'}
          </Btn>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   HandCard — 手札カード表示
   ============================================================ */
function HandCard({
  card, onDeploy, onDeploySpy, onAttach, fieldFull,
}: {
  card: StaffCard; onDeploy: () => void; onDeploySpy: () => void
  onAttach: () => void; fieldFull: boolean
}) {
  const isSpy     = card.def.id === 'spyy'
  const isSlot    = card.def.type === 'slot'
  const isPropAtt = card.def.type === 'prop_attach'
  return (
    <div style={{ padding: '7px 9px', borderRadius: 'var(--border-radius-md)',
      border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <TBadge type={card.def.type} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{card.def.name}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 5 }}>{card.def.desc}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {isSlot && !isSpy && <Btn onClick={onDeploy} disabled={fieldFull} sm>{fieldFull ? 'スロット満杯' : '場に出す'}</Btn>}
        {isSpy && <Btn onClick={onDeploySpy} disabled={fieldFull} sm v="warn">{fieldFull ? 'スロット満杯' : 'スパイ展開'}</Btn>}
        {isPropAtt && <Btn onClick={onAttach} sm v="success">物件に付与</Btn>}
      </div>
    </div>
  )
}

/* ============================================================
   FlowPanel — 付与/スパイ対象選択パネル
   ============================================================ */
function FlowPanel({
  flow, players, currentPid,
  onSelectPlayer, onSelectProp, onCancel, onBack,
}: {
  flow: UIFlow | null; players: GameState['players']; currentPid: string
  onSelectPlayer: (pid: string) => void; onSelectProp: (uid: string) => void
  onCancel: () => void; onBack: () => void
}) {
  if (!flow) return null
  const isSpy = flow.mode === 'spy'
  const tp    = isSpy ? players.filter(p => p.id !== currentPid) : players

  return (
    <div style={{ padding: '10px 12px', borderRadius: 'var(--border-radius-md)',
      background: 'var(--color-background-info)', border: '0.5px solid var(--color-border-info)', marginBottom: 12 }}>
      {flow.step === 'player' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-info)', fontWeight: 500, marginBottom: 8 }}>
            「{flow.cardName}」の{isSpy ? '対象' : '付与先'}プレイヤーを選択
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
            {tp.map(p => (
              <Btn key={p.id} onClick={() => onSelectPlayer(p.id)} v="info" sm>
                {p.name.split(' ')[0]} ({p.ownedProps.length}件)
              </Btn>
            ))}
          </div>
          <Btn onClick={onCancel} sm>キャンセル</Btn>
        </div>
      )}
      {flow.step === 'prop' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-info)', fontWeight: 500, marginBottom: 8 }}>
            {flow.tname}の物件を選択
          </div>
          {(() => {
            const t = players.find(p => p.id === flow.tpid)
            if (!t || t.ownedProps.length === 0) return <p style={{ fontSize: 12 }}>保有物件なし</p>
            return (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
                {t.ownedProps.map(op => (
                  <Btn key={op.uid} onClick={() => onSelectProp(op.uid)} v="info" sm>{op.def.name}</Btn>
                ))}
              </div>
            )
          })()}
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn onClick={onBack} sm>← 戻る</Btn>
            <Btn onClick={onCancel} sm>キャンセル</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   SellPanel — 売却確認パネル
   ============================================================ */
function SellPanel({
  prop, sellRate, eco, curP, onConfirm, onCancel,
}: {
  prop: OwnedProp; sellRate: number; eco: string
  curP: GameState['players'][0]
  onConfirm: (useJimu: boolean) => void; onCancel: () => void
}) {
  const [useJimu, setUseJimu] = useState(false)
  const hasJimu = curP.pendingCards.some(c => c.def.id === 'jimu')
  const base = calculateBaseEvaluation(prop, sellRate, eco as any)
  const fin  = calculateFinalPrice(prop, base, { skipInsurance: useJimu })

  return (
    <div style={{ padding: '12px', borderRadius: 'var(--border-radius-lg)',
      border: '1.5px solid var(--color-border-danger)', background: 'var(--color-background-primary)', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>「{prop.def.name}」を売却</div>
        <div style={{ fontSize: 16, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{fmt(fin.finalPrice)}</div>
      </div>
      {hasJimu && (
        <div style={{ marginTop: 6, padding: '6px 9px', borderRadius: 'var(--border-radius-md)',
          background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={useJimu} onChange={e => setUseJimu(e.target.checked)} />
            <span style={{ fontSize: 12, color: 'var(--color-text-warning)', fontWeight: 500 }}>
              地面師を使用（d6振り(出目-1)倍）
            </span>
          </label>
        </div>
      )}
      {curP.spyAttachments.length > 0 && (
        <div style={{ marginTop: 6, padding: '5px 9px', borderRadius: 'var(--border-radius-md)',
          background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-danger)', fontWeight: 500 }}>
            ⚠ スパイ{curP.spyAttachments.length}件付着中
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Btn onClick={() => onConfirm(useJimu)} v="danger">売却確定</Btn>
        <Btn onClick={onCancel}>キャンセル</Btn>
      </div>
    </div>
  )
}

/* ============================================================
   ArchitectPanel — 建築家発動パネル
   ============================================================ */
function ArchitectPanel({ curP, onActivate, onCancel }: {
  curP: GameState['players'][0]
  onActivate: (uid: string) => void
  onCancel: () => void
}) {
  const getUpgradeDef = (op: OwnedProp) => {
    if (ARCH_TOP.has(op.def.id)) return null
    const tid = ARCH_MAP[op.def.id]
    return tid ? PDEFS.find(d => d.id === tid) ?? null : null
  }

  return (
    <div style={{ padding: 12, borderRadius: 'var(--border-radius-lg)',
      border: '1.5px solid #534AB7', background: 'var(--color-background-primary)', marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#3C3489', marginBottom: 10 }}>
        ★ 建築家: 進化させる物件を選択（発動後カードは破棄）
      </div>
      {curP.ownedProps.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>保有物件がありません</p>
        : curP.ownedProps.map(op => {
            const upDef = getUpgradeDef(op)
            const blocked = !upDef
            return (
              <div key={op.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: 'var(--border-radius-md)',
                background: blocked ? 'var(--color-background-secondary)' : '#EEEDFE',
                border: `0.5px solid ${blocked ? 'var(--color-border-tertiary)' : '#AFA9EC'}`,
                opacity: blocked ? 0.5 : 1, marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{op.def.name}</span>
                  {upDef && <span style={{ fontSize: 11, color: '#534AB7', marginLeft: 8 }}>→ {upDef.name}</span>}
                  {blocked && <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginLeft: 6 }}>（最上位のため不可）</span>}
                  <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                    保持{op.holdingYears}年 / 付属{(op.attachedCards ?? []).length}枚（引継）
                  </span>
                </div>
                {!blocked && <Btn onClick={() => onActivate(op.uid)} sm v="info">この物件を進化させる</Btn>}
              </div>
            )
          })
      }
      <div style={{ marginTop: 10 }}><Btn onClick={onCancel} sm>キャンセル</Btn></div>
    </div>
  )
}

/* ============================================================
   PoliticianMenu — 政治家景気選択パネル
   ============================================================ */
function PoliticianMenu({ gs, onSelect, onCancel }: {
  gs: GameState
  onSelect: (id: string) => void
  onCancel: () => void
}) {
  return (
    <div style={{ padding: 12, borderRadius: 'var(--border-radius-lg)',
      border: '1.5px solid var(--color-border-success)', background: 'var(--color-background-primary)', marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
        ★ 政治家: 変更する景気を選択（発動後カードは破棄）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 10 }}>
        {POLI_CHOICES.map(c => {
          const isCurrent = gs.eco === c.eco
          return (
            <div key={c.id} style={{ padding: '8px 10px', borderRadius: 'var(--border-radius-md)',
              border: `0.5px solid ${isCurrent ? 'var(--color-border-secondary)' : 'var(--color-border-tertiary)'}`,
              background: isCurrent ? 'var(--color-background-secondary)' : ecoStyle(c.eco).background,
              opacity: isCurrent ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: ecoStyle(c.eco).color }}>{c.eco}</span>
                {isCurrent && <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>現在</span>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{c.label}</div>
              {!isCurrent && <Btn onClick={() => onSelect(c.id)} sm v={c.v as BtnVariant} full>{c.eco}に変更</Btn>}
            </div>
          )
        })}
      </div>
      <Btn onClick={onCancel} sm>キャンセル</Btn>
    </div>
  )
}

/* ============================================================
   SwindlerPanel — 詐欺師3ステップ選択パネル
   ============================================================ */
function SwindlerPanel({ curP, allPlayers, onConfirm, onCancel }: {
  curP: GameState['players'][0]
  allPlayers: GameState['players']
  onConfirm: (myUids: string[], theirEntries: { pid: string; uid: string }[]) => void
  onCancel: () => void
}) {
  const [step, setStep]               = useState<'my2' | 'their2' | 'confirm'>('my2')
  const [mySelected, setMySelected]   = useState<string[]>([])
  const [theirSelected, setTheirSelected] = useState<{ pid: string; uid: string }[]>([])

  const hasSecom = (op: OwnedProp) =>
    op.isSecured || (op.attachedCards ?? []).some(c => c.def.id === 'secu')
  const others = allPlayers.filter(p => p.id !== curP.id)

  const toggleMy = (uid: string) => setMySelected(prev =>
    prev.includes(uid) ? prev.filter(u => u !== uid) : prev.length < 2 ? [...prev, uid] : prev)
  const toggleTheir = (pid: string, uid: string) => setTheirSelected(prev => {
    const ex = prev.find(e => e.pid === pid && e.uid === uid)
    if (ex)             return prev.filter(e => !(e.pid === pid && e.uid === uid))
    if (prev.length>=2) return prev
    return [...prev, { pid, uid }]
  })

  const ps: React.CSSProperties = { padding: 12, borderRadius: 'var(--border-radius-lg)',
    border: '1.5px solid var(--color-border-warning)', background: 'var(--color-background-primary)', marginBottom: 10 }
  const hs: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--color-text-warning)', marginBottom: 8 }

  if (step === 'my2') return (
    <div style={ps}>
      <div style={hs}>★ 詐欺師 Step 1/3: 自分が手放す物件を2つ選択</div>
      {curP.ownedProps.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>保有物件がありません</p>
        : curP.ownedProps.map(op => {
            const bl = hasSecom(op), sel = mySelected.includes(op.uid)
            return (
              <div key={op.uid}
                className={`selbox${sel ? ' on' : ''}${bl ? ' blocked' : ''}`}
                onClick={bl ? undefined : () => toggleMy(op.uid)}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{op.def.name}</span>
                  {bl  ? <span style={{ fontSize: 10, color: 'var(--color-text-danger)' }}>🔒セコムあり（選択不可）</span>
                  : sel ? <span style={{ fontSize: 10, color: 'var(--color-text-success)' }}>✓ 選択中</span>
                        : <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>クリックで選択</span>}
                </div>
              </div>
            )
          })
      }
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Btn onClick={() => setStep('their2')} disabled={mySelected.length !== 2} v="warn">次へ</Btn>
        <Btn onClick={onCancel} sm>キャンセル</Btn>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>選択中: {mySelected.length}/2枚</div>
    </div>
  )

  if (step === 'their2') return (
    <div style={ps}>
      <div style={hs}>★ 詐欺師 Step 2/3: 相手から受け取る物件を2つ選択</div>
      {others.map(tp => (
        <div key={tp.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4 }}>{tp.name} の物件:</div>
          {tp.ownedProps.length === 0
            ? <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>保有物件なし</div>
            : tp.ownedProps.map(op => {
                const bl = hasSecom(op), sel = theirSelected.some(e => e.pid === tp.id && e.uid === op.uid)
                return (
                  <div key={op.uid}
                    className={`selbox${sel ? ' on' : ''}${bl ? ' blocked' : ''}`}
                    onClick={bl ? undefined : () => toggleTheir(tp.id, op.uid)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{op.def.name}</span>
                      {bl  ? <span style={{ fontSize: 10, color: 'var(--color-text-danger)' }}>🔒セコムあり（選択不可）</span>
                      : sel ? <span style={{ fontSize: 10, color: 'var(--color-text-success)' }}>✓ 選択中</span>
                            : <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>クリックで選択</span>}
                    </div>
                  </div>
                )
              })
          }
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Btn onClick={() => setStep('confirm')} disabled={theirSelected.length !== 2} v="warn">確認 →</Btn>
        <Btn onClick={() => setStep('my2')} sm>← 戻る</Btn>
        <Btn onClick={onCancel} sm>キャンセル</Btn>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>選択中: {theirSelected.length}/2枚</div>
    </div>
  )

  if (step === 'confirm') {
    const myProps    = mySelected.map(uid => curP.ownedProps.find(op => op.uid === uid)!)
    const theirProps = theirSelected.map(e => ({
      player: allPlayers.find(x => x.id === e.pid)!,
      prop:   allPlayers.find(x => x.id === e.pid)!.ownedProps.find(op => op.uid === e.uid)!,
    }))
    return (
      <div style={ps}>
        <div style={hs}>★ 詐欺師 Step 3/3: 交換内容を確認</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 4 }}>自分が手放す</div>
            {myProps.map((p, i) => <div key={i} style={{ fontSize: 12, fontWeight: 500 }}>{p.def.name}</div>)}
          </div>
          <div style={{ fontSize: 18, textAlign: 'center' }}>↔</div>
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 4 }}>相手から受け取る</div>
            {theirProps.map((e, i) => <div key={i} style={{ fontSize: 12, fontWeight: 500 }}>{e.player.name}の{e.prop.def.name}</div>)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={() => onConfirm(mySelected, theirSelected)} v="danger">交換実行</Btn>
          <Btn onClick={() => setStep('their2')} sm>← 戻る</Btn>
          <Btn onClick={onCancel} sm>キャンセル</Btn>
        </div>
      </div>
    )
  }
  return null
}

/* ============================================================
   App — メインコンポーネント
   ============================================================ */
export default function App() {
  const [gs, setGs]               = useState<GameState>(initGame)
  const [rolling, setRolling]     = useState(false)
  const [dispRoll, setDispRoll]   = useState<number | null>(null)
  const [flow, setFlow]           = useState<UIFlow | null>(null)
  const [sellIntent, setSellIntent] = useState<{ propUid: string } | null>(null)
  const [activeSpecial, setActiveSpecial] = useState<'arch' | 'poli' | 'sagi' | null>(null)
  const tmr = useRef<ReturnType<typeof setInterval> | null>(null)

  function doRoll() {
    if (rolling || gs.phase !== 'roll') return
    setRolling(true)
    let cnt = 0
    tmr.current = setInterval(() => {
      setDispRoll(Math.floor(Math.random() * 20) + 1)
      if (++cnt >= 20) {
        clearInterval(tmr.current!)
        const r = Math.floor(Math.random() * 20) + 1
        setDispRoll(r); setRolling(false)
        setGs(s => applyRoll(s, r))
      }
    }, 75)
  }

  const G = {
    maint:    () => setGs(s => applyMaintenance(s)),
    disaster: () => setGs(s => applyDisaster(s)),
    buy:      () => setGs(s => applyBuy(s)),
    draw:     () => setGs(s => applyDrawStaff(s)),
    deploy:   (uid: string) => setGs(s => applyDeployToField(s, uid)),
    startAttach: (uid: string, name: string) => setFlow({ mode: 'attach', cardUid: uid, cardName: name, step: 'player' }),
    startSpy:    (uid: string, name: string) => setFlow({ mode: 'spy',    cardUid: uid, cardName: name, step: 'player' }),
    selectPlayer: (pid: string) => {
      const p = gs.players.find(x => x.id === pid)!
      if (flow?.mode === 'spy') { setGs(s => applyDeploySpy(s, flow.cardUid, pid)); setFlow(null) }
      else setFlow(prev => prev ? { ...prev, step: 'prop', tpid: pid, tname: p.name } : null)
    },
    selectProp: (propUid: string) => {
      if (!flow) return
      setGs(s => applyAttach(s, flow.cardUid, flow.tpid!, propUid))
      setFlow(null)
    },
    backToPlayer: () => setFlow(prev => prev ? { ...prev, step: 'player', tpid: undefined, tname: undefined } : null),
    cancelFlow:   () => setFlow(null),
    startSell:    (uid: string) => setSellIntent({ propUid: uid }),
    confirmSell:  (propUid: string, useJimu: boolean) => {
      setGs(s => executeSale(s, propUid, { useJimu })); setSellIntent(null)
    },
    cancelSell:      () => setSellIntent(null),
    activateArch:    (uid: string) => { setGs(s => applyArchitect(s, uid)); setActiveSpecial(null) },
    activatePoli:    (id: string)  => { setGs(s => applyPolitician(s, id)); setActiveSpecial(null) },
    activateSagi:    (myUids: string[], entries: { pid: string; uid: string }[]) => {
      setGs(s => applySwindler(s, myUids, entries)); setActiveSpecial(null)
    },
    endTurn: () => {
      setFlow(null); setSellIntent(null); setActiveSpecial(null)
      setGs(s => applyEndTurn(s))
    },
    reset: () => {
      setDispRoll(null); setFlow(null); setSellIntent(null); setActiveSpecial(null)
      setGs(initGame())
    },
  }

  const curP = gs.phase === 'actions' ? gs.players.find(p => p.id === gs.turnOrder[gs.curIdx]) ?? null : null
  const canBuy   = !!curP && curP.boughtThisYear < getBuyLimit(gs.year) && gs.propDeck.length > 0
  const canDraw  = !!curP && !curP.acquiredStaffThisTurn && gs.staffDeck.length > 0
  const fieldFull = !!curP && curP.fieldSlots.length >= getFieldLimit(curP.fieldSlots)
  const sellLimit = curP ? getSellLimit(curP.fieldSlots) : 2
  const sellIntentProp = sellIntent && curP ? curP.ownedProps.find(op => op.uid === sellIntent.propUid) ?? null : null
  const hasArch = !!curP && curP.fieldSlots.some(c => c.def.id === 'arch')
  const hasPoli = !!curP && curP.fieldSlots.some(c => c.def.id === 'poli')
  const hasSagi = !!curP && curP.fieldSlots.some(c => c.def.id === 'sagi') && !curP.sagiUsedThisTurn

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        paddingBottom: '1rem', borderBottom: '0.5px solid var(--color-border-tertiary)', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500 }}>リーマンズ</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            仕様書v1.0 完全実装 — 景気・売却エンジン・人材・天災地変
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--border-radius-md)',
            background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
            不動産{gs.propDeck.length}枚
          </span>
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--border-radius-md)',
            background: STYPES.slot.bg, color: STYPES.slot.fg }}>
            人材{gs.staffDeck.length}枚
          </span>
          <Btn onClick={G.reset}>リスタート</Btn>
        </div>
      </div>

      {/* 状態バー */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 7, marginBottom: '1.25rem' }}>
        {[
          { lb: '現在の年',  val: `Y${gs.year > 10 ? 'End' : gs.year}/10` },
          { lb: '今年の景気',eco: gs.eco },
          { lb: '売却レート',val: fmtR(gs.sellRate), mono: true },
          { lb: '購入レート',val: fmtR(gs.buyRate),  mono: true },
          { lb: '不安定F',   val: gs.unstableFlag ? 'ON' : 'OFF', warn: gs.unstableFlag },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--color-background-secondary)',
            borderRadius: 'var(--border-radius-md)', padding: '8px 11px' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2 }}>{m.lb}</div>
            {'eco' in m
              ? <Chip eco={m.eco as string} sz={12} />
              : <div style={{ fontSize: 14, fontWeight: 500,
                  fontFamily: m.mono ? 'var(--font-mono)' : 'inherit',
                  color: m.warn ? 'var(--color-text-warning)' : 'var(--color-text-primary)' }}>
                  {m.val}
                </div>
            }
          </div>
        ))}
      </div>

      {/* フェーズパネル */}
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)',
        borderRadius: 'var(--border-radius-lg)', padding: '1.25rem', marginBottom: '1.25rem' }}>

        {/* STEP2: ロール */}
        {gs.phase === 'roll' && (
          <div>
            <div className="sl">STEP 2 — 景気決定（d20）</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <D20 val={dispRoll} rolling={rolling} />
              <div>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  {gs.year}年目 前年: {gs.prevEco ? <Chip eco={gs.prevEco} /> : '—'}
                </p>
                {gs.rollResult
                  ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Chip eco={gs.rollResult.eco} />
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>出目:{gs.rollResult.roll}</span>
                      </div>
                      {gs.rollResult.eco === '天災地変'
                        ? <Btn onClick={G.disaster} v="danger">→ STEP3 天災地変処理を実行</Btn>
                        : <Btn onClick={G.maint} v="info">→ STEP5 維持費へ</Btn>
                      }
                    </div>
                  )
                  : <Btn onClick={doRoll} disabled={rolling}>{rolling ? 'ロール中...' : 'd20を振る'}</Btn>
                }
              </div>
            </div>
          </div>
        )}

        {/* STEP3: 天災地変 */}
        {gs.phase === 'disaster' && (
          <div>
            <div style={{ padding: 14, borderRadius: 'var(--border-radius-md)',
              background: '#FCEBEB', border: '0.5px solid #A32D2D', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#501313', marginBottom: 6 }}>⚠️ STEP 3: 天災地変</div>
              <div style={{ fontSize: 12, color: '#791F1F', marginBottom: 10 }}>
                各プレイヤーの保有物件の半数（切り捨て）をランダムに全損破棄します。<br/>
                保険会社が付いていた物件には保険金1億が支払われます。
              </div>
              <div>
                {gs.players.map(p => {
                  const cnt = Math.floor(p.ownedProps.length / 2)
                  return (
                    <div key={p.id} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0',
                      borderBottom: '0.5px solid #F09595' }}>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <span style={{ color: '#791F1F' }}>
                        保有{p.ownedProps.length}件 → {cnt}件破壊{cnt === 0 ? ' (対象外)' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <Btn onClick={G.disaster} v="danger">天災地変処理を実行する</Btn>
              </div>
            </div>
          </div>
        )}

        {/* STEP5: 維持費 */}
        {gs.phase === 'maintenance' && (
          <div>
            <div className="sl">STEP 5 — 維持費</div>
            <div style={{ marginBottom: 10 }}>
              {gs.players.map(p => {
                const c = (p.ownedProps.length + p.fieldSlots.length + p.pendingCards.length) * MAINT_PER_PROP
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                    borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 12 }}>
                    <span>{p.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500,
                      color: c > 0 ? 'var(--color-text-danger)' : 'var(--color-text-secondary)' }}>
                      {c > 0 ? `-${fmt(c)}` : '0円'}
                    </span>
                  </div>
                )
              })}
            </div>
            <Btn onClick={G.maint} v="info">維持費確定 → STEP6へ</Btn>
          </div>
        )}

        {/* STEP6: アクション */}
        {gs.phase === 'actions' && curP && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="sl" style={{ marginBottom: 0 }}>
                STEP 6 — アクション（{gs.curIdx + 1}/{gs.turnOrder.length}番手）
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  購入{curP.boughtThisYear}/{getBuyLimit(gs.year)} 売却{curP.soldThisYear ?? 0}/{sellLimit}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  場:{curP.fieldSlots.length}/{getFieldLimit(curP.fieldSlots)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={avatarStyle(gs.players.findIndex(p => p.id === curP.id))}>
                {curP.name[0]}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{curP.name}</div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)',
                  color: curP.cash < 0 ? 'var(--color-text-danger)' : 'var(--color-text-secondary)' }}>
                  現金: {fmt(curP.cash)}{curP.cash < 0 ? ' ⚠ マイナス継続可' : ''}
                </div>
                {curP.spyAttachments.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--color-text-danger)', fontWeight: 500 }}>
                    スパイ{curP.spyAttachments.length}件付着中
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              <Btn onClick={G.buy} disabled={!canBuy}>
                {canBuy
                  ? `不動産購入（${fmt(Math.round(PURCHASE_BASE * gs.buyRate))}）`
                  : curP.boughtThisYear >= getBuyLimit(gs.year) ? '購入上限' : '山札なし'}
              </Btn>
              <Btn onClick={G.draw} disabled={!canDraw}>
                {canDraw
                  ? `人材を引く（500万）${curP.cash < STAFF_COST ? ' ⚠' : ''}`
                  : curP.acquiredStaffThisTurn ? '取得済み' : '山札なし'}
              </Btn>
              {hasArch && <Btn onClick={() => setActiveSpecial(activeSpecial === 'arch' ? null : 'arch')} v="info">★建築家</Btn>}
              {hasPoli && <Btn onClick={() => setActiveSpecial(activeSpecial === 'poli' ? null : 'poli')} v="success">★政治家</Btn>}
              {hasSagi && <Btn onClick={() => setActiveSpecial(activeSpecial === 'sagi' ? null : 'sagi')} v="warn">★詐欺師</Btn>}
              <Btn onClick={G.endTurn} v="info">ターン終了 →</Btn>
            </div>

            {activeSpecial === 'arch' && (
              <ArchitectPanel curP={curP} onActivate={G.activateArch} onCancel={() => setActiveSpecial(null)} />
            )}
            {activeSpecial === 'poli' && (
              <PoliticianMenu gs={gs} onSelect={G.activatePoli} onCancel={() => setActiveSpecial(null)} />
            )}
            {activeSpecial === 'sagi' && (
              <SwindlerPanel curP={curP} allPlayers={gs.players} onConfirm={G.activateSagi} onCancel={() => setActiveSpecial(null)} />
            )}

            {sellIntentProp && (
              <SellPanel prop={sellIntentProp} sellRate={gs.sellRate} eco={gs.eco} curP={curP}
                onConfirm={(useJimu) => G.confirmSell(sellIntent!.propUid, useJimu)}
                onCancel={G.cancelSell} />
            )}

            <FlowPanel flow={flow} players={gs.players} currentPid={curP.id}
              onSelectPlayer={G.selectPlayer} onSelectProp={G.selectProp}
              onCancel={G.cancelFlow} onBack={G.backToPlayer} />

            {curP.hand.length > 0 && (
              <div>
                <div className="sl">手札 {curP.hand.length}枚</div>
                {curP.hand.map(card => (
                  <HandCard key={card.uid} card={card} fieldFull={fieldFull}
                    onDeploy={() => G.deploy(card.uid)}
                    onDeploySpy={() => G.startSpy(card.uid, card.def.name)}
                    onAttach={() => G.startAttach(card.uid, card.def.name)} />
                ))}
              </div>
            )}

            {curP.pendingCards.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="sl">発動前破棄 {curP.pendingCards.length}枚</div>
                {curP.pendingCards.map(card => (
                  <div key={card.uid} style={{ display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px', borderRadius: 'var(--border-radius-md)',
                    border: '0.5px solid var(--color-border-tertiary)', marginBottom: 4 }}>
                    <TBadge type={card.def.type} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{card.def.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginLeft: 6 }}>{card.def.desc}</span>
                  </div>
                ))}
              </div>
            )}

            {curP.fieldSlots.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="sl">場（展開済み）{curP.fieldSlots.length}/{getFieldLimit(curP.fieldSlots)}枚 — 200万/年</div>
                {curP.fieldSlots.map(card => {
                  const tgt = card.targetPid ? gs.players.find(p => p.id === card.targetPid) : null
                  const isSpec = SPECIAL_CARD_IDS.has(card.def.id)
                  return (
                    <div key={card.uid} style={{ display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 8px', borderRadius: 'var(--border-radius-md)', marginBottom: 4,
                      border: `0.5px solid ${isSpec ? '#534AB7' : 'var(--color-border-success)'}`,
                      background: isSpec ? '#EEEDFE' : 'var(--color-background-success)' }}>
                      <TBadge type={card.def.type} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{card.def.name}</span>
                      {isSpec && <span style={{ fontSize: 10, color: '#3C3489', marginLeft: 4 }}>発動ボタンから使用→破棄</span>}
                      {tgt && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>→ {tgt.name}に付着</span>}
                      {!tgt && !isSpec && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Y{card.deployedYear}展開</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ゲーム終了 */}
        {gs.phase === 'gameOver' && (
          <div>
            <div className="sl">最終結果</div>
            {[...gs.players].sort((a, b) => b.cash - a.cash).map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                <span style={{ width: 18, fontSize: 12, fontWeight: 500,
                  color: i === 0 ? 'var(--color-text-success)' : 'inherit' }}>{i + 1}</span>
                <div style={avatarStyle(gs.players.findIndex(x => x.id === p.id), 26)}>{p.name[0]}</div>
                <span style={{ fontSize: 12 }}>{p.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-mono)',
                  color: p.cash < 0 ? 'var(--color-text-danger)' : 'inherit' }}>
                  {fmt(p.cash)}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10 }}><Btn onClick={G.reset} v="success">もう一度</Btn></div>
          </div>
        )}
      </div>

      {/* プレイヤーグリッド */}
      <div className="sl">プレイヤー状態</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: '1.25rem' }}>
        {gs.players.map((p, pi) => {
          const isCur          = gs.phase === 'actions' && gs.turnOrder[gs.curIdx] === p.id
          const isFlowTarget   = flow?.step === 'prop' && flow.tpid === p.id
          const sl             = getSellLimit(p.fieldSlots)
          const soldCnt        = p.soldThisYear ?? 0

          return (
            <div key={p.id} style={{ background: 'var(--color-background-primary)',
              border: isFlowTarget ? '1.5px solid var(--color-border-info)'
                : isCur ? '1.5px solid var(--color-border-success)'
                : '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--border-radius-lg)', padding: '1rem' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={avatarStyle(pi)}>{p.name[0]}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    {gs.turnOrder.indexOf(p.id) + 1}番手
                    {isCur ? ' ◀' : ''}{isFlowTarget ? ' ← 付与対象' : ''}
                  </div>
                  {p.spyAttachments.length > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--color-text-danger)', fontWeight: 500 }}>
                      スパイ{p.spyAttachments.length}件付着中
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: 'var(--color-background-secondary)',
                borderRadius: 'var(--border-radius-md)', padding: '6px 10px', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>現金</div>
                <div style={{ fontSize: 16, fontWeight: 500, fontFamily: 'var(--font-mono)',
                  color: p.cash < 0 ? 'var(--color-text-danger)' : 'var(--color-text-primary)' }}>
                  {fmt(p.cash)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  維持費見込: {fmt((p.ownedProps.length + p.fieldSlots.length + p.pendingCards.length) * MAINT_PER_PROP)}/年
                </div>
              </div>

              {(p.hand.length + p.pendingCards.length + p.fieldSlots.length) > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3 }}>
                    手札{p.hand.length} / 発動前{p.pendingCards.length} / 場{p.fieldSlots.length}/{getFieldLimit(p.fieldSlots)}
                  </div>
                  {[...p.hand, ...p.pendingCards, ...p.fieldSlots].map(card => (
                    <div key={card.uid} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0',
                      borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                      <TBadge type={card.def.type} />
                      <span style={{ fontSize: 11 }}>{card.def.name}</span>
                      {p.fieldSlots.includes(card) && (
                        <span style={{ fontSize: 9, marginLeft: 2,
                          color: SPECIAL_CARD_IDS.has(card.def.id) ? '#3C3489' : 'var(--color-text-success)' }}>
                          {SPECIAL_CARD_IDS.has(card.def.id) ? '▶発動可' : '▶場'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {gs.phase === 'disaster' && p.ownedProps.length > 0 && (
                <div style={{ padding: '4px 8px', borderRadius: 'var(--border-radius-md)',
                  background: '#FCEBEB', border: '0.5px solid #F09595', marginBottom: 4,
                  fontSize: 11, color: '#791F1F', fontWeight: 500 }}>
                  ⚠️ 天災予測: {p.ownedProps.length}件中{Math.floor(p.ownedProps.length / 2)}件が破壊対象
                </div>
              )}

              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3 }}>
                保有物件 {p.ownedProps.length}件{isCur ? `（売却 ${soldCnt}/${sl}）` : ''}
              </div>

              {p.ownedProps.length === 0
                ? <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '6px 0' }}>なし</p>
                : p.ownedProps.map(op => (
                  <PropCard key={op.uid} op={op} sellRate={gs.sellRate} eco={gs.eco}
                    attachBtn={!!isFlowTarget}
                    onAttach={isFlowTarget ? () => G.selectProp(op.uid) : undefined}
                    onSell={isCur ? () => G.startSell(op.uid) : undefined}
                    sellDisabledReason={isCur && soldCnt >= sl ? `売却上限(${sl}枚)` : null} />
                ))
              }
            </div>
          )
        })}
      </div>

      {/* ゲームログ */}
      <div className="sl">ゲームログ（最新25件）</div>
      <div style={{ background: 'var(--color-background-secondary)',
        borderRadius: 'var(--border-radius-md)', padding: '9px 12px' }}>
        {[...gs.log].reverse().slice(0, 25).map((msg, i) => (
          <div key={i} style={{
            fontSize: 11, padding: '2px 0', borderBottom: '0.5px solid var(--color-border-tertiary)',
            color: msg.includes('🔥') || msg.includes('全損破棄') ? 'var(--color-text-danger)'
              : msg.includes('💰') || msg.includes('保険金') ? 'var(--color-text-success)'
              : msg.includes('天災地変') || msg.startsWith('━') ? '#791F1F'
              : msg.startsWith('★') ? '#3C3489'
              : i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            fontWeight: i === 0 || msg.includes('🔥') || msg.startsWith('━') ? 500 : 400,
          }}>
            {msg}
          </div>
        ))}
      </div>
    </div>
  )
}
