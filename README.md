# 飲みゲーパーティー

複数ゲームを入れる前提の構成。

```
飲みゲー/
  package.json
  server/
    index.js                      # 共通サーバー（Express + Socket.io）
    games/
      image-match/                # 画像で全員一致（ロジック）
      trap/                       # トラップゲーム（ロジック）
      rank-bj/                    # ランキングBJ（ロジック＋みんラン取得）
  public/
    index.html                    # ゲーム選択ハブ
    games/
      image-match/
      trap/
      rank-bj/
```

## 起動（自分のPCだけ）

```bash
cd 飲みゲー
npm install
npm start
```

- ハブ: http://localhost:3847  
- 画像で全員一致: http://localhost:3847/games/image-match/  
- トラップゲーム: http://localhost:3847/games/trap/  
- ランキングBJ: http://localhost:3847/games/rank-bj/

同じWi-Fiのスマホから使う場合は、PCのIP（例: `http://192.168.x.x:3847`）を開く。

## インターネット公開（友達のスマホから）

Socket.IO があるので、静的ホスティング（GitHub Pages など）では動きません。Nodeサーバーごと上げます。

### Render（おすすめ）

1. [GitHub](https://github.com) にこの `飲みゲー` フォルダをリポジトリとして上げる  
2. [Render](https://render.com) で Sign Up → **New → Web Service** → そのリポジトリを選ぶ  
3. 設定:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
4. Deploy 後、`https://xxxx.onrender.com` が全員用のURL  
   トラップは `https://xxxx.onrender.com/games/trap/`  
   ランキングBJは `https://xxxx.onrender.com/games/rank-bj/`

無料プランはしばらくアクセスがないとスリープします。最初の1回は起動に十数秒かかることがあります。

部屋データはメモリ上なので、再起動すると進行中の試合は消えます。サーバーは1台のままにしてください。

## お題写真（画像で全員一致）

```
飲みゲー/public/games/image-match/questions/images/
```

に写真を入れて、「お題にして」と一声かけてください。

## 新しいゲームを足すとき

1. `server/games/<id>/` にロジック
2. `public/games/<id>/` に画面
3. `public/index.html` に選択カードを追加
4. 必要なら `server/index.js` にソケットイベントを接続
