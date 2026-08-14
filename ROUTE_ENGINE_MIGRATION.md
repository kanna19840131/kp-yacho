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

## 実データ上の注意
現行R230データには `22.6 → 23.0` のKP飛びと、終端付近で異なるKPが同一座標を持つケースがある。旧 `nearestOnRoute()` はKP差が0.11を超える隣接点を結ばないため、単一LineStringとして連続補間すると旧動作と変わる。

このため新エンジンは1路線=1本の連続線と決め打ちせず、`sections[]` を持つ。旧points形式は、KP飛びまたは同一座標でのKP切替を検出して自動的に複数sectionへ分割する。将来のKML MultiGeometry、旧道・新道、バイパス、枝線にも同じ構造を使う。

## 新しい責務分離
### Route Config
路線ごとに `id`、`label`、`shortName`、`sections`、`metadata` を持つ。各sectionは `polyline` と `anchors` を持つ。KMLだけの幾何距離を公式KPとみなさず、KPアンカーで区間ごとに校正する。

### Route Engine
GPS点を各sectionへ投影し、最も近いsectionを選択する。路線までの距離、section内累積距離、KPアンカー間補間、複数路線からの最寄り選択を担当する。現行 `points[{kp,lat,lon}]` 形式も互換入力として受け、KP飛びを偽補間しない。

### KML Route Loader
KMLの `LineString` / 複数Placemarkを読み取り、`polyline` へ変換する。既知KPアンカーを最寄りsectionへ割り当て、各sectionに2点以上のアンカーがない場合は設定エラーにする。KML線形とKPアンカーが一定距離以上離れている場合も拒否する。

### Field Notebook
現行 `index.html` に、KPで施工前登録、R/L/中央、面積、合材、午前午後集計、写真確認、一覧、サマリー、`localStorage['kp_yacho_v12']` を残す。

## localStorage互換方針
既存キー `kp_yacho_v12` は変更しない。既存保存値 R230 / R453 も読み込める状態を維持する。既存フィールドを削除・改名しない。

## 完了した検証
### 純粋エンジン試験
`route-engine.test.js` は 11/11 通過。
- 旧points形式互換
- 2アンカー校正
- 複数アンカー補正
- 自動路線選択
- 固定路線選択
- アンカー外判定
- 不正設定拒否
- KP飛びをsection分割し偽KPを作らない
- 同一座標でのKP切替をsection分割
- 終端の同一座標KPを旧動作寄りに扱う
- 明示的な複数section

### R230/R453実データ回帰
GitHub Actionsで現行 `index.html` の `byRoute` 全体を抽出し、旧 `nearestOnRoute()` と新エンジンを比較した。
- R230: 455 points / 新エンジンでは2 sections
- R453: 154 points / 1 section
- 実ポイント比較: 609件
- 有効区間中点比較: 605件
- 自動路線判定比較: 62件
- 最大KP差: 7.105427357601002e-15 km（浮動小数点丸め相当）
- 最大路線距離差: 0m

結果: 現行R230/R453について、比較対象では旧GPS→KP挙動を実質そのまま再現できた。

### KMLローダー試験
`kml-route-loader.test.js` は 7/7 通過。
- 座標列解析
- LineString解析
- KML＋2アンカーからKP補間
- 複数Placemark→複数section
- アンカー不足拒否
- KMLから遠すぎるアンカー拒否
- LineStringなしKML拒否

## 実装順
Phase 1: 純粋計算モジュール追加。完了。

Phase 2: sections対応、R230/R453全実データ回帰。完了。

Phase 3: KMLローダーの基礎実装。fixture試験まで完了。次は利用権を確認できる別路線1本のKML＋既知KPアンカーを使い、実路線で誤差を測る。

Phase 4: 実路線試験後、`index.html` を新エンジンへ段階統合する。既存保存データ、施工前登録、編集、面積、合材、当日集計、Android操作を回帰確認してから本番反映する。

Phase 5: 有料βで需要確認後、KML読み込みUI、バックアップ、公式系API、全国対応を検討する。

## 本番統合前の残り必須テスト
1. 別路線1本のKML＋既知KPで実路線誤差を測る。
2. `kp_yacho_v12` の既存保存データを読み込める。
3. 施工前登録→編集→保存→再読込が壊れない。
4. 面積・合材・午前午後集計が変化しない。
5. Android Chrome でGPS開始、路線固定、自動、手動KPが操作できる。
6. 路線から離れた時の警告が維持される。
7. section/アンカー区間外では警告できる。

## 現時点の判断
GPS/KP層の独立は技術的に成立。現行R230/R453との回帰も通った。KML＋KPアンカーを路線設定へ変換する入口も作れた。次の技術ゲートは「別の実路線でも、既知KPに対して許容できる誤差で再現できるか」。本番 `index.html` はその結果を確認するまで変更しない。
