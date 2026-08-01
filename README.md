# Profit-Prophet

AI 驅動的照護人員智慧助理系統，整合語音辨識、自然語言理解與知識庫搜尋，提供即時照護摘要與建議。

## 系統架構圖

完整的系統架構圖請參考 Miro Board：

🔗 [Profit-Prophet Architecture (Miro)](https://miro.com/app/board/uXjVKGfJMCY=/)

包含以下圖表：
- 整體系統架構（5 層架構）
- GitHub 協作工作流架構
- AWS 資源部署架構
- Care Event 分類架構
- 漸進式擴充路線
- 資料流程圖（Sequence Diagram）

詳細架構說明請見 [docs/architecture.md](docs/architecture.md)。

## 技術棧

- **Runtime**: Python 3.11 (AWS Lambda)
- **Infrastructure**: AWS CDK
- **AI Services**: Amazon Bedrock (Claude 3 Sonnet), Comprehend, Transcribe, Polly
- **Data**: DynamoDB, OpenSearch Serverless (向量搜尋)
- **API**: API Gateway (REST + WebSocket)
- **Monitoring**: CloudWatch, SNS
