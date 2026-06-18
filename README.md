# PDF Slide Viewer

macOS向けの、発表者画面と聴衆画面を持つPDFプレゼンテーションアプリです。

接続中の画面構成を自動認識します。拡張表示では外部画面にスライド、内蔵画面に発表者ビューを配置し、ミラーリング時は両方の画面にスライドを全画面表示します。

主な機能:

- 接続中の画面構成を自動認識
- 発表者ビューと聴衆画面の同期
- サムネイル一覧からのページ移動
- スライド一覧のリスト表示 / タイル表示切り替え
- 聴衆画面の黒画面切り替え

ビルド済みアプリは[GitHub Releases](https://github.com/gepuro/pdf-slide-viewer/releases/latest)からダウンロードできます。配布されるDMGにはElectronランタイムと必要なアプリ資産が同梱されているため、利用者のMacにNode.jsやnpmをインストールする必要はありません。

## 必要環境

利用者向け:

- macOS 13以降
- Apple Silicon Mac

開発者向け:

- macOS 13以降
- Apple Silicon Mac
- Node.js 22以降
- npm

## インストール

1. [Latest Release](https://github.com/gepuro/pdf-slide-viewer/releases/latest)から `PDF-Slide-Viewer-*-arm64.dmg` をダウンロードします。
2. DMGを開き、`PDF Slide Viewer.app` をApplicationsへコピーします。
3. 初回起動時にmacOSの警告が表示される場合は、Finderでアプリを右クリックして「開く」を選択してください。

## 開発実行

```bash
npm install
npm run dev
```

## テストとビルド

```bash
npm test
npm run build
```

署名なしのDMGを作成する場合:

```bash
npm run dist
npm run verify:package
```

成果物は `dist/` またはelectron-builderの出力ディレクトリに生成されます。署名・公証を行っていないため、初回起動時にmacOSのセキュリティ確認が表示される場合があります。

## GitHub Releases

`v` で始まるバージョンタグをpushすると、GitHub ActionsがApple Silicon向けDMGをビルドしてGitHub Releaseへ添付します。

```bash
git tag v1.0.1
git push origin v1.0.1
```

公開されるアプリは署名・公証されていません。ダウンロード後にmacOSで警告が表示される場合は、Finderでアプリを右クリックして「開く」を選択してください。

## 操作

- `⌘O` または「ファイル > PDFを開く…」: PDFを開く
- `←` / `↑` / `PageUp`: 前のスライド
- `→` / `↓` / `Space` / `PageDown`: 次のスライド
- `Home` / `End`: 先頭 / 最後
- 数字キー: ページ直接指定
- 発表者画面のスライド一覧: サムネイルをクリックして移動
- スライド一覧の「リスト」「タイル」: 発表者画面全体の一覧表示を切り替え
- タイル表示のズーム操作: スライド一覧のサムネイルサイズを調整
- `F`: 発表者画面内の現在スライドを全画面表示
- `B`: 聴衆画面の黒画面切り替え
- `Esc`: プレゼンテーション終了

## 未対応

暗号化PDF、発表者ノート、書き込み、動画・音声、アニメーションには対応していません。
