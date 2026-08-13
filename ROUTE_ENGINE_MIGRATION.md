# KP野帳 路線差し替えエンジン移行設計

## 目的
現行 `index.html` の現場機能を壊さず、R230/R453 固有の路線データと KP 算出ロジックを分離する。最終的には「路線データを差し替えれば同じ KP野帳を別路線で使える」構造にする。まず別路線1本で再現性と誤差を測る。

## 現行コードの結合点
1. `byRoute` に R230/R453 の100m点データが直接埋め込まれている。
2. `routeMode` と `route` の選択肢が R230/R453 固定。
3. `routeKey` / `shortRouteName` / `hasRouteData` が2路線を直接参照。
4. `onGpsSuccess` が R230 と R453 を個別計算して比較。
5. `weatherLatLon` と `updateTrafficBrain` に路線固有分岐がある。
6. 施工記録、面積、合材、写真確認、当日集計、保存形式は基本的に路線計算から独立している。

## 新しい責務分離
### Route Config
路線ごとに `id`、`label`、`shortName`、`polyline`、`anchors`、`metadata` を持つ。`polyline` は KML LineString 等から得た線形、`anchors` は既知KP点（kp / lat / lon）。

### Route Engine
GPS点を線形へ投影し、路線までの距離、線形上の累積距離、KPアンカー間の区間補間、複数路線からの最寄り選択を担当する。現行 `points[{kp,lat,lon}]` 形式も互換入力として受ける。

重要: KMLの幾何距離をそのまま公式KPとみなさず、KPアンカーで区間ごとに校正する。

### Field Notebook
現行 `index.html` に、KPで施工前登録、R/L/中央、面積、合材、午前午後集計、写真確認、一覧、サマリー、`localStorage['kp_yacho_v12']` を残す。

## localStorage互換方針
既存キー `kp_yacho_v12` は変更しない。既存保存値 R230 / R453 も読み込める状態を維持する。既存フィールドを削除・改名しない。

## 実装順
Phase 1: 純粋計算モジュールを追加し、現行points形式とKML想定のpolyline+KP anchors形式を自動テストする。本番 `index.html` は変更しない。

Phase 2: `byRoute` を `ROUTE_CONFIGS` へ包み、R230/R453の旧ロジックと新ロジックを比較する。route selector をconfigから動的生成し、`onGpsSuccess`を汎用エンジンへ置換する。

Phase 3: 別路線1本をKML+既知KPアンカーで登録し、複数の既知KP地点で表示KPと正解KPの誤差を測る。平均だけでなく最大誤差、アンカー区間外、分岐付近を別集計する。

Phase 4: 売上確認後にKML読み込みUI、バックアップ、必要なら公式系API、全国対応を検討する。

## 本番統合前の必須テスト
1. R230/R453の既知地点で旧ロジックと新ロジックを比較。
2. `kp_yacho_v12` の既存保存データを読み込める。
3. 施工前登録→編集→保存→再読込が壊れない。
4. 面積・合材・午前午後集計が変化しない。
5. Android Chrome でGPS開始、路線固定、自動、手動KPが操作できる。
6. 路線から離れた時の警告が維持される。
7. アンカー区間外では外挿であることをUI上で警告できる。

## 現時点の判断
主な結合はGPS/KP層に集中している。全面改修ではなく段階移行が可能。最初は本番画面を変えず、純粋な路線計算エンジンを独立させ、旧形式とKML+KPアンカー形式の両方で同じAPIを通せることを証明する。
