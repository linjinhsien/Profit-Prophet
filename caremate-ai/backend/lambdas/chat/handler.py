"""
POST /chat - 文字對話 Lambda

流程：
1. 接收使用者文字訊息
2. 自動偵測語言（國語/台語）
3. 載入長者記憶
4. 情境感知：時間、天氣、對話歷史
5. 呼叫 Bedrock Claude 產生回應
6. 擷取生活紀錄
7. 儲存對話記憶
8. 使用 Polly 產生語音回應
9. 回傳文字 + 語音
"""
import sys
import os
from datetime import datetime

# Lambda Layer 路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.config import SYSTEM_PROMPT_ZH, SYSTEM_PROMPT_NAN, CONTEXT_AWARE_FEATURES
from shared.dynamodb import get_memory_summary, save_conversation_memory
from shared.bedrock_client import invoke_claude, invoke_claude_with_extraction, query_knowledge_base
from shared.audio_service import synthesize_speech, detect_language_from_text
from shared.response_helper import success_response, error_response, parse_body


def handler(event, context):
    """Lambda handler: 處理文字對話"""
    # 處理 OPTIONS 預檢請求
    if event.get("httpMethod") == "OPTIONS":
        return success_response({})

    try:
        body = parse_body(event)
        elder_id = body.get("elder_id")
        message = body.get("message", "").strip()
        language = body.get("language", "zh-TW")

        if not elder_id:
            return error_response("缺少 elder_id", 400)
        if not message:
            return error_response("缺少 message", 400)

        # 1. 自動偵測語言（根據文字內容判斷是否為台語）
        detected_language = detect_language_from_text(message)
        effective_language = language if language in ("nan-TW", "nan") else detected_language

        # 2. 載入長者記憶
        memory_summary = get_memory_summary(elder_id)
        memory_context = _build_memory_context(memory_summary)

        # 3. 建構系統提示
        if effective_language in ("nan-TW", "nan"):
            system_prompt = SYSTEM_PROMPT_NAN.format(memory_context=memory_context)
        else:
            system_prompt = SYSTEM_PROMPT_ZH.format(memory_context=memory_context)

        # 4. 加入情境感知資訊
        context_info = _build_context_awareness(memory_summary)
        system_prompt += context_info

        # 5. 查詢知識庫（如果問題與健康/照護相關）
        health_keywords = ["痛", "不舒服", "暈", "跌倒", "藥", "醫生", "營養", "運動",
                          "袂爽快", "頭殼痛", "腹肚痛", "藥仔"]
        if any(kw in message for kw in health_keywords):
            kb_context = query_knowledge_base(message)
            if kb_context:
                system_prompt += f"\n\n參考知識（來自照護手冊）：\n{kb_context}"

        # 6. 建構對話歷史
        conversation_history = _build_conversation_history(memory_summary)

        # 7. 呼叫 Claude 產生回應
        reply_text = invoke_claude(
            user_message=message,
            system_prompt=system_prompt,
            conversation_history=conversation_history,
        )

        # 8. 擷取生活紀錄
        life_record = invoke_claude_with_extraction(message, reply_text)

        # 9. 儲存對話記憶
        save_conversation_memory(elder_id, {
            "question": message,
            "answer": reply_text,
            "language": effective_language,
            **life_record,
        })

        # 10. 產生語音回應
        audio_result = synthesize_speech(reply_text, effective_language)

        return success_response({
            "reply_text": reply_text,
            "audio_url": audio_result["audio_url"],
            "life_record": life_record,
            "language": effective_language,
            "detected_language": detected_language,
        })

    except Exception as e:
        print(f"Chat handler error: {e}")
        return error_response(f"處理對話時發生錯誤: {str(e)}")


def _build_memory_context(memory_summary: dict) -> str:
    """建構記憶上下文字串"""
    parts = []
    profile = memory_summary.get("profile", {})

    if profile:
        parts.append(f"長者姓名：{profile.get('name', '未知')}")
        parts.append(f"年齡：{profile.get('age', '未知')}")
        if profile.get("gender"):
            parts.append(f"性別：{profile.get('gender')}")
        if profile.get("disease"):
            parts.append(f"健康狀況：{profile.get('disease')}")
        if profile.get("preferences"):
            prefs = profile.get("preferences")
            if isinstance(prefs, dict):
                if prefs.get("favorite_topics"):
                    parts.append(f"喜愛話題：{'、'.join(prefs['favorite_topics'])}")
                if prefs.get("preferred_language"):
                    parts.append(f"語言偏好：{prefs['preferred_language']}")
            elif isinstance(prefs, str):
                parts.append(f"個人偏好：{prefs}")

    # 近期對話摘要
    recent = memory_summary.get("recent_conversations", [])
    if recent:
        parts.append("\n近期對話摘要（最近 3 則）：")
        for conv in recent[:3]:
            parts.append(f"  - 使用者：{conv.get('q', '')[:50]}")
            parts.append(f"    助手：{conv.get('a', '')[:50]}")

    # 生活紀錄
    life = memory_summary.get("life_records", {})
    life_parts = []
    for field, label in [("emotion", "近期情緒"), ("sleep", "睡眠"), ("food", "飲食"), ("activity", "活動")]:
        records = life.get(field, [])
        if records:
            latest = records[0].get("value", "")
            if latest:
                life_parts.append(f"{label}：{latest}")
    if life_parts:
        parts.append("\n近期生活狀態：")
        parts.extend(life_parts)

    if parts:
        return "長者資訊：\n" + "\n".join(parts)
    return "（尚無長者記憶資料）"


def _build_context_awareness(memory_summary: dict) -> str:
    """建構情境感知資訊"""
    parts = []
    now = datetime.now()
    current_time = now.strftime("%Y-%m-%d %H:%M")
    hour = now.hour

    parts.append(f"\n\n目前時間：{current_time}")

    # 時段提示
    if CONTEXT_AWARE_FEATURES.get("time_greeting"):
        if 6 <= hour < 10:
            parts.append("時段：早晨，適合問候睡眠品質、提醒早餐和用藥")
        elif 10 <= hour < 12:
            parts.append("時段：上午，適合聊天、鼓勵活動")
        elif 12 <= hour < 14:
            parts.append("時段：中午，關心午餐、建議午休")
        elif 14 <= hour < 18:
            parts.append("時段：下午，鼓勵散步、聊聊今天的事")
        elif 18 <= hour < 21:
            parts.append("時段：傍晚，關心晚餐、提醒用藥")
        else:
            parts.append("時段：晚間，建議早點休息、祝好眠")

    # 用藥提醒
    if CONTEXT_AWARE_FEATURES.get("medication_reminder"):
        profile = memory_summary.get("profile", {})
        medications = profile.get("medications", [])
        if medications and hour in (7, 8, 18, 19, 20):
            parts.append(f"提醒：長者有用藥需求（{', '.join(medications[:2])}），可適時關心是否已服藥")

    # 對話記憶回顧
    if CONTEXT_AWARE_FEATURES.get("memory_recall"):
        recent = memory_summary.get("recent_conversations", [])
        if recent:
            last_conv = recent[0]
            last_time = last_conv.get("timestamp", "")
            if last_time:
                parts.append(f"上次對話時間：{last_time[:16]}")
                # 如果距離上次對話超過一天，提醒系統主動關心
                last_q = last_conv.get("q", "")
                if last_q:
                    parts.append(f"上次聊到：{last_q[:30]}")

    return "\n".join(parts)


def _build_conversation_history(memory_summary: dict) -> list:
    """從記憶中建構對話歷史"""
    history = []
    recent = memory_summary.get("recent_conversations", [])

    for conv in recent[-5:]:  # 最近 5 輪對話
        if conv.get("q"):
            history.append({"role": "user", "content": conv["q"]})
        if conv.get("a"):
            history.append({"role": "assistant", "content": conv["a"]})

    return history
