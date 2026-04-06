# リーマンズ — デプロイガイド

## ディレクトリ構造

```
leehmans/
├── index.html          # エントリーポイント
├── package.json        # 依存関係・ビルドスクリプト
├── vite.config.ts      # Vite設定
├── tsconfig.json       # TypeScript設定
└── src/
    ├── main.tsx        # Reactマウント
    ├── App.tsx         # UIコンポーネント（JSX）
    ├── gameLogic.ts    # 純粋関数群（計算エンジン・アクション）
    ├── constants.ts    # マスターデータ・定数
    ├── types.ts        # TypeScript型定義
    └── index.css       # CSS変数・ベーススタイル
```

## ローカル開発

```bash
# 1. 依存関係インストール
npm install

# 2. 開発サーバー起動（http://localhost:5173）
npm run dev

# 3. プロダクションビルド（dist/ に出力）
npm run build

# 4. ビルド結果のプレビュー
npm run preview
```

## Vercel へのデプロイ

### 方法A: CLI（推奨）

```bash
npm install -g vercel
vercel
# プロジェクトルートで実行。設定は自動検出されます。
```

### 方法B: GitHub 経由

1. このフォルダを GitHub リポジトリとしてプッシュ
2. [vercel.com](https://vercel.com) → "New Project" → リポジトリを選択
3. ビルド設定（自動検出）:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Deploy ボタンをクリック

### 方法C: Netlify

```bash
npm run build
# dist/ フォルダを Netlify にドラッグ＆ドロップ
# または: netlify deploy --prod --dir=dist
```

## 技術スタック

| 項目 | 採用技術 |
|---|---|
| フレームワーク | React 18 + TypeScript |
| ビルドツール | Vite 5 |
| スタイル | CSS変数（Tailwind不使用・外部依存ゼロ） |
| フォント | Google Fonts（Noto Sans JP + Space Mono） |
| 状態管理 | useState のみ（Redux不使用） |
| 外部ライブラリ | react, react-dom のみ |

## アーキテクチャ概要

### 関心の分離

```
types.ts      → 型定義のみ（ロジックなし）
constants.ts  → マスターデータ・ゲーム定数
gameLogic.ts  → 純粋関数（副作用なし）
              → calculateBaseEvaluation, calculateFinalPrice
              → executeSale, applyDisaster, applyArchitect...
App.tsx       → React UI（状態はGameState一本管理）
```

### GameState の不変更新

全アクション関数は `(gs: GameState) => GameState` の純粋関数です。
React の `setGs(s => applyXxx(s))` パターンで状態を更新します。

### CSS変数のテーマ

`src/index.css` に claude.ai のテーマトークンを完全再現しています。
ライト/ダークモード両対応（`@media (prefers-color-scheme: dark)` で自動切替）。

## ゲームルール概要

- **人数**: 4人（1ブラウザで交代プレイ）
- **ターン数**: 10ターン
- **初期資金**: 3000万円
- **勝利条件**: 10ターン終了時の現金が最多

### 実装済み機能

- [x] d20景気決定（バブル崩壊・不景気・不安定・安定・天災地変・好景気・バブル景気）
- [x] 不安定フラグ処理
- [x] 不動産購入・維持費・保持年数管理
- [x] 売却計算エンジン（初動優先ルール）
- [x] 人材カード（slot / activatable / prop_attach）
- [x] 建築家（物件進化・山札非依存）
- [x] 政治家（景気任意変更）
- [x] 詐欺師（2↔2強制交換・セコム防御）
- [x] 企業スパイ（5年間20%横取り）
- [x] 地面師（d6倍率売却）
- [x] 保険会社（80%最低保証・天災1億）
- [x] セコム（+2000万・詐欺師対象外）
- [x] 泥棒（幽霊）（売却0円）
- [x] 天災地変（半数ランダム破壊・保険金発動）
- [x] 保持5年強制売却（先着2枚）・焼失（3枚目以降）
- [x] ターン順更新（1〜5年目：現金多い順 / 6〜10年目：現金少ない順）
