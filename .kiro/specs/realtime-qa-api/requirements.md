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

1. WHEN a Caregiver submits an audio file in one of the supported formats (mp3, mp4, wav, flac, ogg, webm), THE Voice_Recognizer SHALL transcribe the audio into text using AWS Transcribe batch mode and return up to 3 alternative transcriptions ranked by confidence score
2. WHEN a Caregiver initiates a streaming audio session, THE Voice_Recognizer SHALL transcribe the audio using AWS Transcribe streaming mode and deliver partial transcription results within 3 seconds of each spoken utterance
3. THE Voice_Recognizer SHALL support transcription in zh-TW, zh-CN, and en-US languages
4. WHERE a custom vocabulary is configured, THE Voice_Recognizer SHALL apply the custom vocabulary to the transcription request for elder care terminology
5. WHEN an audio input contains multiple speakers, THE Voice_Recognizer SHALL identify and label each speaker using speaker diarization with a maximum of 5 speaker labels
6. IF the audio input is corrupted or unreadable, THEN THE Voice_Recognizer SHALL return an error response containing an error code and a message indicating the nature of the failure
7. IF the audio input format is not one of mp3, mp4, wav, flac, ogg, or webm, THEN THE Voice_Recognizer SHALL reject the request with an error response indicating the unsupported format and listing the accepted formats
8. IF the submitted audio file exceeds 200 MB in size, THEN THE Voice_Recognizer SHALL reject the request with an error response indicating the file size limit has been exceeded

### Requirement 2: Natural Language Understanding

**User Story:** As a Caregiver, I want the system to understand the intent and sentiment of my queries, so that I can receive contextually relevant answers.

#### Acceptance Criteria

1. WHEN a text input of 1 to 5000 characters is received, THE NLU_Processor SHALL perform sentiment analysis and return a sentiment label (POSITIVE, NEGATIVE, NEUTRAL, MIXED) with a confidence score ranging from 0.0 to 1.0
2. WHEN a text input is received, THE NLU_Processor SHALL extract named entities and return each entity with its type (PERSON, DATE, MEDICATION, CONDITION, ORGANIZATION, QUANTITY) and a confidence score ranging from 0.0 to 1.0
3. WHEN a text input is received, THE NLU_Processor SHALL detect and return up to 20 key phrases ranked by relevance score ranging from 0.0 to 1.0
4. WHEN a text input is received, THE NLU_Processor SHALL classify the query into one of the Care_Event categories: health_status, emotion_state, daily_activities, medication_records, emergency_events, social_interaction, nutrition, or sleep_patterns
5. IF the NLU_Processor detects the input language with a confidence score below 0.5, THEN THE NLU_Processor SHALL default to zh-TW processing
6. IF AWS Comprehend or the Bedrock LLM service is unavailable, THEN THE NLU_Processor SHALL return an error response indicating the specific unavailable service within 5 seconds
7. WHEN a text input is received, THE NLU_Processor SHALL complete all NLU processing (sentiment analysis, entity extraction, key phrase detection, and classification) and return results within 10 seconds
8. IF the text input is empty or exceeds 5000 characters, THEN THE NLU_Processor SHALL reject the input with an error response indicating the input length constraint

### Requirement 3: Intelligent Summary Generation with RAG

**User Story:** As a Caregiver, I want to receive AI-generated summaries about an Elder_Subject's status, so that I can quickly understand their condition without reading all records.

#### Acceptance Criteria

1. WHEN a query is processed, THE Summary_Generator SHALL retrieve relevant context from the Knowledge_Base using vector similarity search
2. WHEN relevant context is retrieved, THE Summary_Generator SHALL generate a summary response using the anthropic.claude-3-sonnet-20240229-v1:0 model with a maximum output length of 1024 tokens
3. THE Summary_Generator SHALL include source references in the generated summary, where each reference contains the document identifier and the Care_Event category of the source document
4. WHILE generating responses, THE Summary_Generator SHALL enforce a rate limit of 1 request per second to Bedrock services
5. IF the Knowledge_Base returns no relevant results for a query, THEN THE Summary_Generator SHALL respond with a message indicating insufficient information is available and SHALL NOT invoke the Bedrock model
6. IF a query is outside the defined Care_Event categories, THEN THE Summary_Generator SHALL reject the query and return a response indicating the topic is unsupported without invoking the Bedrock model
7. IF the Bedrock service returns an error or is unavailable, THEN THE Summary_Generator SHALL return an error response indicating summary generation failed and preserve the original query for retry

### Requirement 4: Knowledge Base Vector Search

**User Story:** As a Caregiver, I want the system to search through elder care knowledge effectively, so that responses are grounded in accurate information.

#### Acceptance Criteria

1. THE Knowledge_Base SHALL store document embeddings in an OpenSearch Serverless vector index with a fixed embedding dimension of 1024
2. WHEN a query embedding is provided, THE Knowledge_Base SHALL return the top 5 most relevant documents that meet or exceed a cosine similarity score of 0.7
3. THE Knowledge_Base SHALL index documents with metadata including Care_Event category, timestamp, and Elder_Subject identifier
4. WHEN a new knowledge document is ingested, THE Knowledge_Base SHALL generate and store its vector embedding within 5 seconds for documents up to 10,000 characters in length
5. IF the OpenSearch Serverless collection is unavailable, THEN THE Knowledge_Base SHALL return a service unavailable error indicating the client should retry after 5 seconds
6. WHEN a query embedding is provided with a metadata filter, THE Knowledge_Base SHALL restrict the search results to documents matching the specified Care_Event category and Elder_Subject identifier
7. IF no documents meet or exceed the cosine similarity score of 0.7, THEN THE Knowledge_Base SHALL return an empty result set with a flag indicating no relevant documents were found

### Requirement 5: Real-time Query API (REST)

**User Story:** As a Caregiver, I want to send text queries via a REST API, so that I can integrate the Q&A system into my existing care management tools.

#### Acceptance Criteria

1. THE Query_API SHALL expose a POST /query endpoint that accepts JSON payloads containing a query_text field (maximum 1000 characters), a language field restricted to one of zh-TW, zh-CN, or en-US, and an Elder_Subject identifier field (non-empty string, maximum 128 characters)
2. WHEN a valid query is received, THE Query_API SHALL return a JSON response containing the answer text, a confidence score between 0.0 and 1.0 inclusive, a Care_Event category, and a list of source references (zero or more items) within 30 seconds
3. IF an incoming request payload is missing required fields, contains fields that violate type or length constraints, or fails JSON parsing, THEN THE Query_API SHALL reject the request with an HTTP 400 status and a response body indicating which fields failed validation
4. IF the Lambda function execution exceeds 30 seconds, THEN THE Query_API SHALL return an HTTP 504 timeout response with a JSON body indicating a timeout occurred
5. THE Query_API SHALL authenticate all requests using API key authentication via API Gateway and IF a request is missing a valid API key, THEN THE Query_API SHALL return an HTTP 403 response
6. WHEN a request is received, THE Query_API SHALL log the request metadata (timestamp, endpoint, HTTP method, response status, and response latency) to CloudWatch without logging query_text content, Elder_Subject identifiers, or answer text
7. THE Query_API SHALL include CORS response headers allowing all origins for the POST /query endpoint

### Requirement 6: Real-time Query API (WebSocket)

**User Story:** As a Caregiver, I want to receive streaming responses via WebSocket, so that I can see answers as they are generated without waiting for the full response.

#### Acceptance Criteria

1. THE Query_API SHALL expose a WebSocket endpoint with route handlers for $connect, $disconnect, and $default routes that supports persistent connections for streaming responses
2. WHEN a WebSocket connection is established, THE Query_API SHALL send a JSON connection acknowledgment message containing the connection ID and server timestamp within 2 seconds
3. WHILE a response is being generated, THE Query_API SHALL stream partial response chunks of no more than 32 KB each as JSON frames containing a sequence number and text fragment, and SHALL send a final frame with a completion indicator when generation is complete
4. IF a WebSocket connection is idle for more than 10 minutes, THEN THE Query_API SHALL close the connection with a close frame containing a timeout reason code
5. WHEN a WebSocket client disconnects unexpectedly, THE Query_API SHALL remove the associated connection record from DynamoDB within 5 seconds of detecting the disconnect event
6. IF the WebSocket message payload exceeds 128 KB, THEN THE Query_API SHALL reject the message with an error frame indicating the payload size limit was exceeded
7. WHEN a client sends a query message via the $default route, THE Query_API SHALL accept a JSON payload containing query_text, language, and elder_subject_id fields, and SHALL initiate streaming response generation
8. IF an error occurs during active response streaming, THEN THE Query_API SHALL send an error frame indicating the failure reason and close the stream gracefully while preserving any partial response already delivered
9. THE Query_API SHALL authenticate WebSocket connections during the $connect route using the same API key mechanism as the REST endpoint

### Requirement 7: Data Storage

**User Story:** As a Caregiver, I want my conversation history and generated summaries to be stored, so that I can reference past interactions and track Elder_Subject status over time.

#### Acceptance Criteria

1. THE Data_Store SHALL persist conversation records in a DynamoDB Conversations table with partition key (Elder_Subject ID) and sort key (timestamp)
2. THE Data_Store SHALL persist generated summaries in a DynamoDB Summaries table with partition key (Elder_Subject ID) and sort key (summary timestamp)
3. THE Data_Store SHALL use PAY_PER_REQUEST billing mode for both tables
4. THE Data_Store SHALL use AWS_MANAGED encryption for data at rest on both tables
5. WHEN a conversation record is stored, THE Data_Store SHALL include the query text (maximum 2000 characters), response text (maximum 4000 characters), Care_Event category, confidence score (decimal value from 0.0 to 1.0), and timestamp
6. WHEN a query requests conversation history, THE Data_Store SHALL return a maximum of 50 records per request, sorted by timestamp in descending order
7. WHEN a summary is stored, THE Data_Store SHALL include the summary text, Care_Event category, source references, Elder_Subject ID, and generation timestamp
8. IF a write operation to DynamoDB fails, THEN THE Data_Store SHALL return an error response indicating the failure reason and preserve the original request data for retry
9. IF a conversation history query returns no records for the specified Elder_Subject ID, THEN THE Data_Store SHALL return an empty result set with a zero total count

### Requirement 8: Voice Synthesis

**User Story:** As a Caregiver, I want to hear the system's response spoken aloud, so that I can receive answers hands-free while providing care.

#### Acceptance Criteria

1. WHEN a text response is generated, THE Voice_Synthesizer SHALL convert the response text to speech audio using AWS Polly and return the audio within 10 seconds for texts up to 3000 characters
2. THE Voice_Synthesizer SHALL support Mandarin Chinese (cmn-CN) and English (en-US) voices, selecting the voice based on the language preference specified in the query request
3. WHEN a voice synthesis request is made, THE Voice_Synthesizer SHALL return the audio in MP3 format with a sample rate of 16000 Hz
4. IF the text response exceeds 3000 characters, THEN THE Voice_Synthesizer SHALL split the text at sentence boundaries into segments of no more than 3000 characters each, synthesize each segment sequentially, and concatenate the resulting audio into a single MP3 response
5. IF AWS Polly returns a service error, THEN THE Voice_Synthesizer SHALL return the text-only response with a boolean flag indicating that voice synthesis failed and the original text is being provided as fallback
6. IF the text response exceeds 6000 characters, THEN THE Voice_Synthesizer SHALL truncate the text at 6000 characters before synthesis and include a flag in the response indicating the audio was truncated

### Requirement 9: Monitoring and Observability

**User Story:** As a system operator, I want to monitor API performance and error rates, so that I can ensure system reliability and quickly identify issues.

#### Acceptance Criteria

1. THE Monitor SHALL log all Lambda function invocations with execution duration (in milliseconds), memory usage (in MB), and outcome status (one of: SUCCESS, ERROR, TIMEOUT) to CloudWatch Logs
2. THE Monitor SHALL publish custom CloudWatch metrics every 60 seconds for query latency (in milliseconds), error rate (percentage of invocations with ERROR or TIMEOUT outcome over total invocations), and concurrent WebSocket connections (gauge count)
3. WHEN the error rate exceeds 5% over a 5-minute evaluation window (1 consecutive datapoint), THE Monitor SHALL trigger a CloudWatch alarm that sends a notification to a configured SNS topic
4. THE Monitor SHALL retain all CloudWatch log groups for 30 days using a log group retention policy
5. THE Monitor SHALL NOT log query text, response text, Elder_Subject identifiers, Caregiver identifiers, or any content classified as personal, health, biometric, financial, or regulated data as defined in Constitution Section III
6. IF CloudWatch metric publishing fails, THEN THE Monitor SHALL retry the publish operation up to 3 times with exponential backoff before logging the failure locally

### Requirement 10: Infrastructure as Code

**User Story:** As a developer, I want all infrastructure defined in CDK, so that the system can be reproducibly deployed and version-controlled.

#### Acceptance Criteria

1. THE CDK_Stack SHALL define all AWS resources using Python CDK (aws-cdk-lib), including DynamoDB tables, Lambda functions, API Gateway (REST and WebSocket), S3 buckets, IAM roles, OpenSearch Serverless collection, and CloudWatch log groups
2. THE CDK_Stack SHALL deploy all resources exclusively in us-east-1 or us-west-2 regions
3. THE CDK_Stack SHALL configure Lambda functions with Python 3.11 runtime, 512 MB memory, and 30-second timeout
4. THE CDK_Stack SHALL configure all S3 buckets with Block Public Access enabled
5. THE CDK_Stack SHALL configure DynamoDB tables with PAY_PER_REQUEST billing and AWS_MANAGED encryption
6. THE CDK_Stack SHALL configure API Gateway with API key authentication and a usage plan specifying a throttle rate of 1 request per second, a burst limit of 2 requests, and a daily quota of 1000 requests
7. THE CDK_Stack SHALL apply least-privilege IAM policies to all Lambda execution roles by granting only actions required by each function scoped to specific resource ARNs, with no wildcard (*) actions or wildcard resource ARNs
8. IF a CDK deployment fails, THEN THE CDK_Stack SHALL rollback all changes automatically via CloudFormation rollback behavior
9. THE CDK_Stack SHALL configure all security groups to deny inbound traffic from 0.0.0.0/0 on all ports, allowing only traffic from specific VPC-internal sources required by the application

### Requirement 11: Request/Response Serialization

**User Story:** As a developer, I want well-defined request and response schemas, so that API consumers can reliably integrate with the system.

#### Acceptance Criteria

1. THE Query_API SHALL serialize all API responses as JSON containing fields: answer (string, 1 to 4000 characters), confidence (float, 0.0 to 1.0 inclusive), category (Care_Event enum value), sources (array of document reference objects, 0 to 10 items), and timestamp (ISO 8601 UTC format)
2. THE Query_API SHALL parse incoming request JSON payloads into validated request objects containing fields: query_text (required string, 1 to 2000 characters, must not be blank), language (required string, one of zh-TW, zh-CN, en-US), elder_subject_id (required string, 1 to 128 characters), and session_id (optional string, 1 to 128 characters)
3. THE Query_API SHALL ensure that for all valid request objects, serializing then deserializing produces a field-by-field value-equal object (round-trip property)
4. IF a request payload contains unknown fields, THEN THE Query_API SHALL ignore unknown fields and process only recognized fields
5. IF a required field is missing from the request payload, THEN THE Query_API SHALL return an HTTP 400 response with a JSON body identifying each missing field by name and indicating it is required
6. IF the query_text field is empty or contains only whitespace, THEN THE Query_API SHALL return an HTTP 400 response indicating that query_text must contain non-whitespace content
7. IF the language field contains a value not in the supported set (zh-TW, zh-CN, en-US), THEN THE Query_API SHALL return an HTTP 400 response indicating the unsupported language value and listing the valid options
8. IF the request body is not valid JSON, THEN THE Query_API SHALL return an HTTP 400 response indicating a JSON parse failure

### Requirement 12: Care Event Classification

**User Story:** As a Caregiver, I want queries automatically classified by care topic, so that I can filter and review information by category.

#### Acceptance Criteria

1. THE NLU_Processor SHALL classify each query into exactly one Care_Event category from the defined set: health_status, emotion_state, daily_activities, medication_records, emergency_events, social_interaction, nutrition, sleep_patterns
2. IF the classification confidence is below 0.6, THEN THE NLU_Processor SHALL assign the category as "unclassified" and include the top-3 candidate categories with their confidence scores
3. THE NLU_Processor SHALL format the classification output as a JSON object containing the category label and a confidence score expressed as a decimal value between 0.0 and 1.0 inclusive
4. WHEN an input text contains a Care_Event category name or one of its defined synonyms from the Knowledge_Base, THE NLU_Processor SHALL classify the query into the corresponding category with a confidence score at or above 0.6 (round-trip property)
5. IF the input query text is empty or contains only whitespace, THEN THE NLU_Processor SHALL return a classification error response indicating that the input text is insufficient for classification without assigning any category
