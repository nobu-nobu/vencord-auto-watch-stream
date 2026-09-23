# AutoWatchStream

参加しているDiscordのボイスチャンネルで、新しく始まった画面共有を自動視聴するVencord用UserPluginです。

## 機能

- 同じVCで新しく始まった配信を自動視聴します。
- ほかの配信を視聴中なら、自動で切り替えません。
- 手動で視聴をやめても、同じ配信を繰り返し開きません。
- VC参加時やプラグイン有効化時に、すでに始まっている配信は対象外です。
- 複数の配信を同時に検知した場合、ストアの並び順で最初の1つを選びます。

## 表示方法

AutoWatchStreamの設定で、次の3つから選択できます。変更は次の自動視聴から反映されます。

| 設定 | 動作 |
| --- | --- |
| フォーカスビュー（初期設定） | 配信中のVC画面を開き、配信を大きく表示 |
| ピクチャー・イン・ピクチャー（PiP） | 開いているチャットを維持し、Discord標準のPiPウィンドウを右上に配置 |
| ポップアウトビュー | Discord標準の通話ポップアウトを開く |

小窓モードではチャット画面を開いて使用してください。別ウィンドウは配信専用の独自プレイヤーではなく、Discordの通話ウィンドウです。

## 導入

これは公式プラグイン一覧に含まれない個人用プラグインです。通常のVencordにファイルを置くだけでは使えず、ソースからのビルドが必要です。

1. [Vencordの公式手順](https://docs.vencord.dev/installing/)に従って、Git・Node.js・pnpmとVencordのビルド環境を用意します。
2. **Vencordフォルダを開いたターミナル**で、以下を実行します。非公開リポジトリのため、GitHubで招待を承認し、そのアカウントでGit認証する必要があります。

```sh
git clone https://github.com/nobu-nobu/vencord-auto-watch-stream.git src/userplugins/autoWatchStream
pnpm install --frozen-lockfile
pnpm build --disable-updater
pnpm inject
```

3. Discordを完全終了して起動し直します。
4. ユーザー設定 → **Plugins** → **AutoWatchStream** をONにします。歯車から表示方法を選びます。
5. 相手と同じVCへ参加してから、相手に配信を開始してもらいます。

`--disable-updater`は、公式ビルドへの更新でこのUserPluginが消えることを避けるために指定しています。Vencord本体の更新は手動で行い、更新後に再ビルドしてください。

詳しい配置方法は[Vencord Custom Plugins](https://docs.vencord.dev/installing/custom-plugins/)を参照してください。クローンしたVencordフォルダは導入後も使用されるため、移動・削除しないでください。

## プラグインの更新

Vencordフォルダで実行し、その後Discordを再起動します。

```sh
git -C src/userplugins/autoWatchStream pull --ff-only
pnpm build --disable-updater
```

## 動作確認の範囲

2026-09-23時点：自動視聴で映像が表示されたことは利用者が確認済みです。表示方法3種類の追加版は型チェック・lint・ビルド・14項目の模擬テストを通していますが、3種類すべての実機動作確認は未完了です。

Discordの内部関数を利用しているため、Discordの更新で動かなくなる場合があります。自動視聴は配信の通知を受けてから約750ミリ秒後に試みます。起動直後の競合防止のため、視聴開始後8秒以内の別の配信は自動で開きません。

Vencord本体にソースを組み込んだ状態で、以下を実行できます。

```sh
node src/userplugins/autoWatchStream/tests/behavior.cjs
pnpm testTsc
pnpm exec eslint src/userplugins/autoWatchStream/index.ts
```

模擬テストは実際のDiscord接続・映像再生を検証しません。動かない場合は、まずPlugins画面でONになっているか確認してください。

## ライセンス

GPL-3.0-or-later。Vencord由来の著作権表示を保持しています。このプラグインはAI支援で作成した非公式の個人用プラグインで、DiscordおよびVencord公式とは関係ありません。
