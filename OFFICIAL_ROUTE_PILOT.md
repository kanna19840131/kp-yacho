# 国道5号 公式道路基準点・道路中心線パイロット

## 目的
R230/R453以外の実在路線で、公式道路基準点・道路中心線・公開100m CSVをRoute Packageへ安全に変換できるか検証する。

## 第三路線パイロット
中立な国道5号197KP〜203KPを使用。国交省道路基準点GeoJSON、国土数値情報N13道路中心線を使って `公式データ → KML → Route Config → KP算出` を通した。

N13中心線は197〜203KPの公式基準点から横方向4.64〜12.36m。197/203KPだけをアンカーにした中間KP推定は平均13.97m相当、最大27.77m相当。Leave-one-outは平均20.60m相当、最大36.05m相当だった。

## 公式100m CSV Route Adapter
`official-route-adapter.js` を追加。Route Definition（路線番号・事務所・現旧新区分・補助番号・KP範囲）から公開CSVを解析し、100m地点の欠損・重複・異なる座標の重複・範囲外を監査する。

監査に合格した場合だけ `kp-yacho-route-package/v1` として `points[{kp,lat,lon}]` を生成する。曖昧なデータは自動補完しない。

### 国道5号 197〜203KP
期待61点 / CSV61行 / ユニーク61 / 欠損0 / 重複0 / 順序逆転0 / `strictReady: true`。安全なRoute Packageを生成できた。

### R230 0〜10KP監査
期待101点 / CSV101行 / ユニーク92 / 欠損9 / 異座標重複9 / 順序逆転20 / `strictReady: false`。

### R453 0〜10KP監査
期待101点 / CSV100行 / ユニーク96 / 欠損5 / 異座標重複4 / 順序逆転46 / `strictReady: false`。

`precsv.php` ではPHPセッションCookie自体が発行されず、Cookie保持を追加しても結果は変化しなかった。欠損・重複をセッション不足では説明できない。

## 既存路線との比較
R230の公式100m点→既存線形の横方向距離は平均5.66m、中央値4.68m、p95 15.15m。地点標値と既存KP線形の差は平均40.96m相当。

R453は横方向距離が平均3.79m、中央値2.98m、p95 7.26m。地点標値と既存KP線形の差は平均35.87m相当。

## 商品アーキテクチャ仮説
`Route Definition`
→ `Route Data Adapter（公式100m / 顧客KML / JICE等）`
→ `Quality Gate（欠損・重複・精度・版）`
→ `Route Package`
→ `Route Engine`
→ `KP野帳`

## 次のゲート
1. R230/R453の100m欠損・重複の原因を追加調査する。
2. ネットワーク地点標と現場KPの基準を照合する。
3. Android実GPSで総合誤差を測る。
4. 公開100mデータの商用組み込み・再配布条件を確認する。
5. その後に本番 `index.html` へ統合する。

## 判断
「別路線でも動く」「公式100mデータからRoute Packageを作れる」は通過。
「全国どの路線でも公開100m CSVをそのまま商品データにできる」は否定。商品版にはQuality Gateが必須。

本番 `index.html` と `localStorage['kp_yacho_v12']` は変更していない。
