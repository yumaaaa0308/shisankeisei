# 資産プラン - 積立シミュレーター

積立額のペースから将来の資産額を予測し、車・住宅などの将来の支出目標に対して
「今のペースで間に合うか」を確認できるスマホ向けWebアプリ(PWA)です。

- 資産をNISA・DC・現金・持株会の4カテゴリに分けて記録・管理
- カテゴリごとに想定年利・毎月の積立額・年1回のボーナス積立額を設定してシミュレーション
- 自分とパートナーの資産を別々に記録し、世帯合計で将来資産を予測(パートナー管理はON/OFF切替可)
- 複数の目標(金額・年)を登録し、達成見込み/不足額を自動計算
- 資産額を定期的に記録し、実績の推移を確認
- データはすべて**端末内(localStorage)のみ**に保存。サーバー送信やログインは一切なし
- オフラインでも動作(Service Workerでアプリ本体をキャッシュ)

## フォルダ構成

```
asset-plan-app/
├── index.html        画面の土台
├── manifest.json      PWA設定(アイコン・アプリ名など)
├── sw.js               オフラインキャッシュ用Service Worker
├── css/style.css       スタイル
├── js/
│   ├── storage.js       localStorage読み書き・金額フォーマット
│   ├── sim.js            カテゴリ単位の積立シミュレーション計算(複利)
│   ├── model.js           自分+パートナー×カテゴリを合算する世帯集計ロジック
│   ├── chart.js           Canvasグラフ描画(ライブラリ不使用)
│   ├── views.js           各画面のHTML生成
│   └── app.js              画面遷移・イベント処理・保存
├── icons/               PWA用アイコン(generate-icons.ps1で生成)
├── generate-icons.ps1    アイコン再生成用スクリプト(Windows/PowerShell)
└── serve.ps1             ローカル確認用の簡易HTTPサーバー(Windows/PowerShell)
```

## ローカルで動作確認する(Windows)

Node.jsやPythonが無い環境でも確認できるよう、PowerShellだけで動く簡易サーバーを同梱しています。

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

起動したら `http://localhost:5173` をブラウザで開いてください。

## iPhoneの実機で使う(要デプロイ)

iPhoneでPWAとして「ホーム画面に追加」してオフライン動作まで含めてフル機能を使うには、
**HTTPSでの配信**が必要です(Service Workerの制約のため)。このリポジトリはビルド不要の
静的サイトなので、以下のような無料サービスにフォルダをそのままアップロードするだけで動きます。

### 方法A: Netlify Drop(一番簡単・アカウント登録も不要)

1. https://app.netlify.com/drop を開く
2. `asset-plan-app` フォルダをブラウザにドラッグ&ドロップ
3. 発行されたURL(https://xxxx.netlify.app)をiPhoneのSafariで開く

### 方法B: GitHub Pages

1. このフォルダをGitHubリポジトリにpush
2. リポジトリの Settings → Pages で「Deploy from a branch」を選択し、公開する
3. 発行されたURL(https://ユーザー名.github.io/リポジトリ名/)をiPhoneのSafariで開く

### iPhoneのホーム画面に追加する

1. Safariでデプロイ先のURLを開く
2. 共有ボタン(□に↑のアイコン)をタップ
3. 「ホーム画面に追加」を選択

ホーム画面のアイコンから起動すると、Safariのアドレスバーなどが無いフルスクリーンの
アプリのような見た目で動作します。

## データについて

- すべてのデータ(積立設定・目標・資産推移)はこの端末のブラウザの中だけに保存されます
- 別の端末やSafari以外のブラウザとは共有されません
- ブラウザのサイトデータを消去すると、記録したデータも消えます
  (機種変更などに備えたバックアップ/同期機能が必要になったら、追加実装を検討してください)

## アイコンを変更したい場合

`generate-icons.ps1` を編集して以下を実行すると、`icons/` 配下のPNGを再生成できます。

```powershell
powershell -ExecutionPolicy Bypass -File generate-icons.ps1
```
