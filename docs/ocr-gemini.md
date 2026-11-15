# Gemini による名刺読み取り

撮影画面で「AIで読み取り」をオンにすると、画像をサーバー経由で Gemini API に送り、返された項目を確認画面に表示します。失敗時は端末内の従来の OCR に切り替わります。画像はこの API では保存しません。無料枠では Google のサービス改善に画像が利用される場合があります。

Vercel のプロジェクト設定の Environment Variables にサーバー用 `GEMINI_API_KEY` を設定し、必要なら `GEMINI_MODEL` を指定して再デプロイします。モデルの既定値は `gemini-flash-lite-latest` です。キーをブラウザー公開用の変数に設定しないでください。

利用者は撮影画面のチェックを外すとオフにできます。管理者は Vercel の `GEMINI_API_KEY` を削除して再デプロイすると機能を無効化できます。
