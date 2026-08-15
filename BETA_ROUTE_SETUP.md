# KP野帳 β 担当路線セットアップ

## 目的

有料βで顧客ごとの路線データを公開リポジトリへ直接埋め込まず、担当路線パッケージJSONとして端末へ読み込ませる。

`beta.html` 自体は共通で使い、顧客ごとの差分は `kp-yacho-route-package` だけにする。

## 重要

このGitHubリポジトリは公開です。

顧客から受領したKML、契約図書、非公開の路線座標、現場固有データをこの公開リポジトリへcommitしないでください。

担当路線パッケージは、利用権・再利用条件・秘密保持条件を確認したデータだけで作成し、顧客へ個別に渡します。

## 路線パッケージ形式

`beta-route-package.example.json` を構成例として使う。

必須項目:

- `type`: `kp-yacho-route-package`
- `schemaVersion`: `1`
- `packageId`: 顧客・路線ごとに重複しないID
- `label`: 利用者へ表示する担当路線名
- `routes`: Route Engineが読める路線定義

推奨項目:

- `rights.confirmed`: 利用権確認済みなら `true`
- `rights.basis`: 顧客保有、許諾、利用条件確認済み公開データ等の根拠
- `metadata.fieldVerified`: 実路線で既知KP照合まで終わったか
- `metadata.sourceType`: `customer-kml`、`licensed`、`official-open-data` 等

## Route Engine側の条件

有料βでは、原則として `polyline + anchors` または `sections[]` を使う。

- 各sectionに異なるKPのアンカーを2点以上持たせる
- KML線形だけの幾何距離を公式KPとみなさない
- 使用予定KP範囲をアンカーで挟む
- アンカー範囲外は `extrapolated` としてβ画面側で自動KPを採用しない
- 登録路線から30m超は注意、200m超は対象路線外として自動KPを止める（初期値）

## 納品までの流れ

1. 顧客から対象路線名、使用KP範囲、既知KP、利用権を確認できる線形データを受領する。
2. 必要なら `kp-calibration-capture.html` で既知KP＋GPSを採取し、JSONを書き出す。
3. `beta-route-package-builder.html` を開き、KML＋既知KP JSON＋権利確認根拠を入力する。
4. BuilderがKMLをRoute Configへ変換し、各sectionのアンカー数とRoute Engine設定を検証する。
5. 使用予定範囲がアンカー内に収まることを確認する。
6. Builderから担当路線パッケージJSONを書き出す。
7. Android端末で `beta.html` を開き、パッケージを読み込む。
8. 既知KP地点で推定KPを照合する。
9. `BETA_RELEASE_CHECKLIST.md` を完了してから顧客へ渡す。

## 端末側

`beta.html` の「担当路線パッケージ読込」からJSONを一度読み込む。

路線データはブラウザのlocalStorageへ保存される。ページ再読込後も保持される。

ブラウザデータを削除した場合は再読込が必要なので、顧客には路線パッケージJSONも保管してもらう。

施工記録のバックアップJSONと路線パッケージJSONは別物。
