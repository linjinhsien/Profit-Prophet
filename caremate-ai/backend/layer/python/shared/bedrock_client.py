"""
Amazon Bedrock 呼叫層
支援 Claude Sonnet 模型的 Converse API
"""
import json
import boto3
from typing import Optional
from .config import AWS_REGION, BEDROCK_MODEL_ID, BEDROCK_KB_ID

bedrock_runtime = boto3.client("bedrock-runtime", region_name=AWS_REGION)
bedrock_agent_runtime = boto3.client("bedrock-agent-runtime", region_name=AWS_REGION)


def invoke_claude(
    user_message: str,
    system_prompt: str,
    conversation_history: Optional[list] = None,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """
    呼叫 Claude 模型進行對話
    使用 Bedrock Converse API
    """
    messages = []

    # 加入歷史對話（最近 10 輪）
    if conversation_history:
        for msg in conversation_history[-10:]:
            messages.append({
                "role": msg["role"],
                "content": [{"text": msg["content"]}],
            })

    # 加入當前使用者訊息
    messages.append({
        "role": "user",
        "content": [{"text": user_message}],
    })

    response = bedrock_runtime.converse(
        modelId=BEDROCK_MODEL_ID,
        system=[{"text": system_prompt}],
        messages=messages,
        inferenceConfig={
            "maxTokens": max_tokens,
            "temperature": temperature,
        },
    )

    # 提取回應文字
    output = response.get("output", {})
    message = output.get("message", {})
    content = message.get("content", [])

    if content and content[0].get("text"):
        return content[0]["text"]
    return "抱歉，我現在無法回應，請稍後再試。"


def invoke_claude_with_extraction(
    user_message: str,
    assistant_reply: str,
) -> dict:
    """
    呼叫 Claude 從對話中擷取生活紀錄
    回傳 JSON 格式的結構化資料
    """
    extraction_prompt = """請從以下對話中擷取長者的生活紀錄資訊。
如果對話中沒有提到相關資訊，該欄位留空字串。

對話內容：
使用者：{user_message}
助手：{assistant_reply}

請以 JSON 格式回傳，欄位如下：
- sleep: 睡眠相關資訊（例如：睡了幾小時、睡得好不好）
- food: 飲食相關資訊（例如：吃了什麼、有沒有吃飯）
- activity: 運動/活動相關資訊（例如：散步、做操）
- drug: 服藥相關資訊（例如：有沒有吃藥）
- emotion: 情緒狀態（例如：開心、難過、焦慮）

只回傳 JSON，不要其他文字。""".format(
        user_message=user_message,
        assistant_reply=assistant_reply,
    )

    response = bedrock_runtime.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{
            "role": "user",
            "content": [{"text": extraction_prompt}],
        }],
        inferenceConfig={
            "maxTokens": 512,
            "temperature": 0.1,
        },
    )

    output = response.get("output", {})
    message = output.get("message", {})
    content = message.get("content", [])

    if content and content[0].get("text"):
        try:
            text = content[0]["text"].strip()
            # 處理可能被 markdown code block 包裹的 JSON
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                text = text.rsplit("```", 1)[0]
            return json.loads(text)
        except (json.JSONDecodeError, IndexError):
            pass

    return {"sleep": "", "food": "", "activity": "", "drug": "", "emotion": ""}


def query_knowledge_base(query: str, kb_id: Optional[str] = None) -> str:
    """
    查詢 Bedrock Knowledge Base（RAG）
    用於取得長照相關知識
    """
    knowledge_base_id = kb_id or BEDROCK_KB_ID
    if not knowledge_base_id:
        return ""

    try:
        response = bedrock_agent_runtime.retrieve_and_generate(
            input={"text": query},
            retrieveAndGenerateConfiguration={
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": knowledge_base_id,
                    "modelArn": f"arn:aws:bedrock:{AWS_REGION}::foundation-model/{BEDROCK_MODEL_ID}",
                },
            },
        )
        output = response.get("output", {})
        return output.get("text", "")
    except Exception as e:
        print(f"Knowledge Base 查詢失敗: {e}")
        return ""
