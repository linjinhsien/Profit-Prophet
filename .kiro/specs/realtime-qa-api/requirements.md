# Requirements Document

## Introduction

即問即答實時 API 系統 (Real-time Q&A API System) 是一個專為長照照護人員設計的智慧問答系統。照護人員可透過語音或文字輸入，查詢被照護長者的日常狀態資訊。系統整合語音辨識、自然語言理解、RAG 智慧摘要生成及語音合成等能力，即時回應關於長者健康狀態、情緒、日常活動、用藥紀錄、緊急事件、社交互動、營養攝取及睡眠模式等問題。

本系統為 Hackathon 專案 (Profit-Prophet)，遵循 AWS 帳戶安全規範，僅使用合成資料，部署於 us-east-1 或 us-west-2 區域。

## Glossary

- **QA_API_System**: 即問即答實時 API 系統的整體服務，包含所有子模組
- **Voice_Recognizer**: 語音辨識模組，基於 AWS Transcribe 實現語音轉文字功能
- **NLU_Processor**: 自然語言理解模組，基於 AWS Comprehend 進行語意分析
- **Summary_Generator**: 智慧摘要生成模組，基於 Bedrock AgentCore 搭配 RAG 知識庫
- **Query_API**: 即時查詢 API 模組，透過 API Gateway + Lambda 提供 REST 與 WebSocket 介面
- **Data_Store**: 資料儲存模組，基於 DynamoDB 存放對話紀錄與摘要
- **Voice_Synthesizer**: 語音合成模組，基於 AWS Polly 將回應文字轉為語音
- **Monitor**: 監控模組，基於 CloudWatch 提供日誌與指標
- **CDK_Stack**: 基礎設施即程式碼模組，使用 Python CDK 定義所有 AWS 資源
- **Knowledge_Base**: RAG 知識庫，基於 OpenSearch Serverless 向量索引儲存長照知識
- **Caregiver**: 照護人員，系統的主要使用者
- **Elder_Subject**: 被照護長者，系統查詢的對象
- **Care_Event**: 照護事件類別，包含健康狀態、情緒、日常活動、用藥紀錄、緊急事件、社交互動、營養攝取、睡眠模式

## Requirements

### Requirement 1: Voice-to-Text Transcription

**User Story:** As a Caregiver, I want to speak my questions about an Elder_Subject's status, so that I can quickly query without typing.

#### Acceptance Criteria

1. WHEN a Caregiver submits an audio file, THE Voice_Recognizer SHALL transcribe the audio into text using AWS Transcribe batch mode
2. WHEN a Caregiver initiates a streaming audio session, THE Voice_Recognizer SHALL transcribe the audio in real-time using AWS Transcribe streaming mode
3. THE Voice_Recognizer SHALL support transcription in zh-TW, zh-CN, and en-US languages
4. WHERE a custom vocabulary is configured, THE Voice_Recognizer SHALL apply the custom vocabulary to improve transcription accuracy for elder care terminology
5. WHEN an audio input contains multiple speakers, THE Voice_Recognizer SHALL identify and label each speaker using speaker diarization
6. IF the audio input is corrupted or unreadable, THEN THE Voice_Recognizer SHALL return an error response with a descriptive error code and message

### Requirement 2: Natural Language Understanding

**User Story:** As a Caregiver, I want the system to understand the intent and sentiment of my queries, so that I can receive contextually relevant answers.

#### Acceptance Criteria

1. WHEN a text input is received, THE NLU_Processor SHALL perform sentiment analysis and return a sentiment label (POSITIVE, NEGATIVE, NEUTRAL, MIXED) with a confidence score
2. WHEN a text input is received, THE NLU_Processor SHALL extract named entities relevant to elder care (person names, dates, medications, conditions)
3. WHEN a text input is received, THE NLU_Processor SHALL detect key phrases that indicate the query topic
4. THE NLU_Processor SHALL classify the query into one of the Care_Event categories: health status, emotion state, daily activities, medication records, emergency events, social interaction, nutrition, or sleep patterns
5. IF the NLU_Processor cannot determine the language of the input, THEN THE NLU_Processor SHALL default to zh-TW processing

### Requirement 3: Intelligent Summary Generation with RAG

**User Story:** As a Caregiver, I want to receive AI-generated summaries about an Elder_Subject's status, so that I can quickly understand their condition without reading all records.

#### Acceptance Criteria

1. WHEN a query is processed, THE Summary_Generator SHALL retrieve relevant context from the Knowledge_Base using vector similarity search
2. WHEN relevant context is retrieved, THE Summary_Generator SHALL generate a summary response using the anthropic.claude-3-sonnet-20240229-v1:0 model
3. THE Summary_Generator SHALL include source references in the generated summary to indicate which knowledge documents were used
4. WHILE generating responses, THE Summary_Generator SHALL enforce a rate limit of 1 request per second to Bedrock services
5. IF the Knowledge_Base returns no relevant results, THEN THE Summary_Generator SHALL respond with a message indicating insufficient information is available
6. THE Summary_Generator SHALL constrain response generation to elder care topics only, rejecting queries outside the defined Care_Event categories

### Requirement 4: Knowledge Base Vector Search

**User Story:** As a Caregiver, I want the system to search through elder care knowledge effectively, so that responses are grounded in accurate information.

#### Acceptance Criteria

1. THE Knowledge_Base SHALL store document embeddings in an OpenSearch Serverless vector index
2. WHEN a query embedding is provided, THE Knowledge_Base SHALL return the top-k most relevant documents based on cosine similarity
3. THE Knowledge_Base SHALL index documents with metadata including Care_Event category, timestamp, and Elder_Subject identifier
4. WHEN a new knowledge document is ingested, THE Knowledge_Base SHALL generate and store its vector embedding within 5 seconds
5. IF the OpenSearch Serverless collection is unavailable, THEN THE Knowledge_Base SHALL return a service unavailable error with retry guidance

### Requirement 5: Real-time Query API (REST)

**User Story:** As a Caregiver, I want to send text queries via a REST API, so that I can integrate the Q&A system into my existing care management tools.

#### Acceptance Criteria

1. THE Query_API SHALL expose a POST /query endpoint that accepts JSON payloads containing the query text, language preference, and Elder_Subject identifier
2. WHEN a valid query is received, THE Query_API SHALL return a JSON response containing the answer text, confidence score, Care_Event category, and source references within 30 seconds
3. THE Query_API SHALL validate all incoming requests against a defined JSON schema and reject invalid payloads with HTTP 400 status
4. IF the Lambda function execution exceeds 30 seconds, THEN THE Query_API SHALL return an HTTP 504 timeout response
5. THE Query_API SHALL authenticate all requests using API key authentication via API Gateway
6. WHEN a request is received, THE Query_API SHALL log the request metadata (timestamp, endpoint, response status) to CloudWatch without logging any query content that could contain sensitive information

### Requirement 6: Real-time Query API (WebSocket)

**User Story:** As a Caregiver, I want to receive streaming responses via WebSocket, so that I can see answers as they are generated without waiting for the full response.

#### Acceptance Criteria

1. THE Query_API SHALL expose a WebSocket endpoint that supports persistent connections for streaming responses
2. WHEN a WebSocket connection is established, THE Query_API SHALL send a connection acknowledgment message within 2 seconds
3. WHILE a response is being generated, THE Query_API SHALL stream partial response chunks to the connected client
4. IF a WebSocket connection is idle for more than 10 minutes, THEN THE Query_API SHALL close the connection with a timeout notification
5. WHEN a WebSocket client disconnects unexpectedly, THE Query_API SHALL clean up the associated connection resources in DynamoDB
6. IF the WebSocket message payload exceeds 128 KB, THEN THE Query_API SHALL reject the message with an error frame

### Requirement 7: Data Storage

**User Story:** As a Caregiver, I want my conversation history and generated summaries to be stored, so that I can reference past interactions and track Elder_Subject status over time.

#### Acceptance Criteria

1. THE Data_Store SHALL persist conversation records in a DynamoDB Conversations table with partition key (Elder_Subject ID) and sort key (timestamp)
2. THE Data_Store SHALL persist generated summaries in a DynamoDB Summaries table with partition key (Elder_Subject ID) and sort key (summary timestamp)
3. THE Data_Store SHALL use PAY_PER_REQUEST billing mode for both tables
4. THE Data_Store SHALL use AWS_MANAGED encryption for data at rest on both tables
5. WHEN a conversation record is stored, THE Data_Store SHALL include the query text, response text, Care_Event category, confidence score, and timestamp
6. WHEN a query requests conversation history, THE Data_Store SHALL return records sorted by timestamp in descending order

### Requirement 8: Voice Synthesis

**User Story:** As a Caregiver, I want to hear the system's response spoken aloud, so that I can receive answers hands-free while providing care.

#### Acceptance Criteria

1. WHEN a text response is generated, THE Voice_Synthesizer SHALL convert the response text to speech audio using AWS Polly
2. THE Voice_Synthesizer SHALL support Mandarin Chinese (cmn-CN) and English (en-US) voices
3. WHEN a voice synthesis request is made, THE Voice_Synthesizer SHALL return the audio in MP3 format
4. IF the text response exceeds 3000 characters, THEN THE Voice_Synthesizer SHALL split the text into segments and synthesize each segment sequentially
5. IF AWS Polly returns a service error, THEN THE Voice_Synthesizer SHALL return the text-only response with an indicator that voice synthesis failed

### Requirement 9: Monitoring and Observability

**User Story:** As a system operator, I want to monitor API performance and error rates, so that I can ensure system reliability and quickly identify issues.

#### Acceptance Criteria

1. THE Monitor SHALL log all Lambda function invocations with execution duration, memory usage, and outcome status to CloudWatch Logs
2. THE Monitor SHALL publish custom CloudWatch metrics for query latency, error rate, and concurrent connections
3. WHEN the error rate exceeds 5% over a 5-minute window, THE Monitor SHALL trigger a CloudWatch alarm
4. THE Monitor SHALL retain logs for 30 days
5. THE Monitor SHALL NOT log any content that could be considered personal, health, or sensitive data per the project constitution

### Requirement 10: Infrastructure as Code

**User Story:** As a developer, I want all infrastructure defined in CDK, so that the system can be reproducibly deployed and version-controlled.

#### Acceptance Criteria

1. THE CDK_Stack SHALL define all AWS resources using Python CDK (aws-cdk-lib)
2. THE CDK_Stack SHALL deploy all resources exclusively in us-east-1 or us-west-2 regions
3. THE CDK_Stack SHALL configure Lambda functions with Python 3.11 runtime, 512 MB memory, and 30-second timeout
4. THE CDK_Stack SHALL configure all S3 buckets with Block Public Access enabled
5. THE CDK_Stack SHALL configure DynamoDB tables with PAY_PER_REQUEST billing and AWS_MANAGED encryption
6. THE CDK_Stack SHALL configure API Gateway with API key authentication and usage plans
7. THE CDK_Stack SHALL apply least-privilege IAM policies to all Lambda execution roles
8. IF a CDK deployment fails, THEN THE CDK_Stack SHALL rollback all changes automatically via CloudFormation rollback behavior

### Requirement 11: Request/Response Serialization

**User Story:** As a developer, I want well-defined request and response schemas, so that API consumers can reliably integrate with the system.

#### Acceptance Criteria

1. THE Query_API SHALL serialize all API responses as JSON following a defined response schema containing fields: answer, confidence, category, sources, and timestamp
2. THE Query_API SHALL parse incoming request JSON payloads into validated request objects containing fields: query_text, language, elder_subject_id, and optional session_id
3. FOR ALL valid request objects, serializing then deserializing SHALL produce an equivalent object (round-trip property)
4. IF a request payload contains unknown fields, THEN THE Query_API SHALL ignore unknown fields and process only recognized fields
5. IF a required field is missing from the request payload, THEN THE Query_API SHALL return an HTTP 400 response with a field-level error description

### Requirement 12: Care Event Classification

**User Story:** As a Caregiver, I want queries automatically classified by care topic, so that I can filter and review information by category.

#### Acceptance Criteria

1. THE NLU_Processor SHALL classify each query into exactly one Care_Event category from the defined set: health_status, emotion_state, daily_activities, medication_records, emergency_events, social_interaction, nutrition, sleep_patterns
2. WHEN the classification confidence is below 0.6, THE NLU_Processor SHALL assign the category as "unclassified" and include the top-3 candidate categories with their confidence scores
3. THE NLU_Processor SHALL format the classification output as a JSON object containing the category label and confidence score
4. FOR ALL input texts containing explicit Care_Event keywords, classifying then extracting the category SHALL return the matching category (round-trip property)
