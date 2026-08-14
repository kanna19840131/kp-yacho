# 国道5号 公式道路基準点・道路中心線パイロット

## 目的
R230/R453以外の実在路線で、公式道路基準点・道路中心線・公開100m CSVをRoute Packageへ安全に変換できるか検証する。

## 第三路線パイロット
中立な国道5号197KP〜203KPを使用。国交省道路基準点GeoJSON、国土数値情報N13道路中心線を使って `公式データ → KML → Route Config → KP算出` を通した。

N13中心線は197〜203KPの公式基準点から横方向4.64〜12.36m。197/203KPだけをアンカーにした中間KP推定は平均13.97m相当、最大27.77m相当。Leave-one-outは平均20.60m相当、最大36.05m相当だった。

## 公式100m CSV Route Adapter
`official-route-adapter.js` を追加。Route Definition（路線番号・事務所・現旧新区分・補助番号・KP範囲）から公開CSVを解析し、100m地点の欠損・重複・異なる座標の重複・範囲外を監査する。

監査に合格した場合だけ `kp-yacho-route-package/v1` として `points[{kp,lat,lon}]` を生成する。曖昧なデータは自動補完しない。

Route Packageにはデータの出自を残す。公開100m CSVは`referenceClass: road-network-derived`、`positioningBasis: DRM road geometry`、`fieldMarkerEquivalent: false`、`fieldVerified: false`として扱う。公式データであることと、現場の物理KPを実測した値であることを混同しない。

### 国道5号 197〜203KP
期待61点 / CSV61行 / ユニーク61 / 欠損0 / 重複0 / 順序逆転0 / `strictReady: true`。安全なRoute Packageを生成できた。

### R230 0〜10KP監査
期待101点 / CSV101行 / ユニーク92 / 欠損9 / 異座標重複9 / 順序逆転20 / `strictReady: false`。

### R453 0〜10KP監査
期待101点 / CSV100行 / ユニーク96 / 欠損5 / 異座標重複4 / 順序逆転46 / `strictReady: false`。

`precsv.php`ではPHPセッションCookie自体が発行されず、Cookie保持を追加しても結果は変化しなかった。欠損・重複をセッション不足では説明できない。

## 実測版と道路ネットワーク版は別物
道路基準点案内システムでは、実測版と道路ネットワーク版が明確に分かれている。

- 実測版: 地点標近傍の道路基準点を公共測量した座標。
- 道路ネットワーク版: DRM線形上で距離標を定義し計算した座標。

公開100m CSVは後者として扱う必要がある。

## 実測1km / 道路ネットワーク100m / 現行legacyの比較
道路上の線形位置は概ね近いが、同じKP値を置く場所には数十m級の差がある。

### R230 0〜10KP
- 実測1km → 同じ地点標値のネットワーク地点: 平均17.38m / 中央16.11m / p95 26.12m / 最大31.21m
- 実測1km地点 → 現行legacy KP目盛: 平均24.25m相当 / 中央23.51m / p95 43.63m / 最大47.78m
- 実測1km地点 → 現行legacy線形の横距離: 平均13.13m / 中央12.92m / p95 18.22m / 最大22.26m

### R453 0〜10KP
- 実測1km → 同じ地点標値のネットワーク地点: 平均24.20m / 中央23.02m / p95 32.87m / 最大38.95m
- 実測1km地点 → 現行legacy KP目盛: 平均23.63m相当 / 中央8.19m / p95 43.31m / 最大89.16m
- 実測1km地点 → 現行legacy線形の横距離: 平均22.93m / 中央22.65m / p95 33.93m / 最大39.52m
- 3KP付近でlegacy目盛との差約89m相当を確認。

したがって、道路ネットワーク100mを現場KPの唯一の正解とはできず、現行legacyも新データを評価する正解教師にはできない。

## 現行legacyデータの出自調査
GitHubの初期KP野帳には「前に動いたKPアプリのbyRouteデータを貼る」とあり、データ生成自体はGitHub以前。

File Libraryで確認できた最古の具体データは2026-06-05の`kp_230_453.csv`と`kp_230_453_current.html`。後続のKP野帳はこの0.1km座標列を引き継いでいる。

外部ではHG企画が北海道のR230/R453を含む0.1km KP KMLを公開し、北海道向け公開データを「号線KP⇒経緯度変換ツール(Ver20121010)」から作成したと明記している。現行CSVと同系統データである可能性は高いが、公開Google Drive KMLをこの検証環境から取得できず、全座標一致による確定は未了。

詳細は`ROUTE_DATA_PROVENANCE.md`を参照。

## 商品アーキテクチャ仮説
`Route Definition`
→ `Route Data Adapter（公式ネットワーク / 実測 / 顧客KML / JICE等）`
→ `Quality Gate（欠損・重複・精度・版・出自）`
→ `Route Package`
→ `Field Calibration（現場の既知KP）`
→ `Route Engine`
→ `KP野帳`

`Geometry`と`KP Reference`を分離し、公共データをそのまま現場の正解扱いしない。

## 次のゲート
1. 現行CSVとHG企画系KMLの完全一致比較を、取得経路が確保できれば実施。
2. 物理KPまたは契約図書上の既知KPを複数点で照合し、現場基準との差を測る。
3. `Field Calibration`をRoute Packageの仕様として実装する。
4. Android実GPSで静止・走行時の総合誤差を測る。
5. 公開100mデータおよび外部KMLの商用組み込み・再配布条件を確認する。
6. その後に本番`index.html`へ統合する。

## 判断
- 「別路線でも動く」: 通過。
- 「公式100mデータからRoute Packageを作れる」: 品質ゲート付きで通過。
- 「全国どの路線でも公開100m CSVをそのまま商品データにできる」: 否定。
- 「現行legacyが現場KPの絶対的な正解教師である」: 根拠不足のため否定。
- 次の本命: **出自を保持したRoute Package + 現場既知KPによるCalibration**。

本番`index.html`と`localStorage['kp_yacho_v12']`は変更していない。
