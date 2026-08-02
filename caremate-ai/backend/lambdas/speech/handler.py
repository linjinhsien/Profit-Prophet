"""
POST /speech - 語音對話 Lambda

流程：
1. 接收使用者語音（WebM/Opus）
2. Transcribe 語音轉文字（支援國語/台語自動偵測）
3. 載入長者記憶
4. 情境感知：時間、天氣、對話歷史
5. Bedrock Claude 產生回應（根據語言選擇國語或台語）
6. Polly 文字轉語音
7. 擷取生活紀錄並儲存
8. 回傳文字 + 語音
"""
import sys
import os
import base64
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.config import SYSTEM_PROMPT_ZH, SYSTEM_PROMPT_NAN, CONTEXT_AWARE_FEATURES
from shared.dynamodb import get_memory_summary, save_conversation_memory
from shared.bedrock_client import invoke_claude, invoke_claude_with_extraction, query_knowledge_base
from shared.audio_service import transcribe_audio, synthesize_speech, detect_language_from_text
from shared.response_helper import success_response, error_response, parse_body


def handler(event, context):
    """Lambda handler: 處理語音對話"""
    if event.get("httpMethod") == "OPTIONS":
        return success_response({})

    try:
        # 解析 multipart 或 base64 音訊資料
        body = parse_body(event)
        elder_id = body.get("elder_id")
        language = body.get("language", "zh-TW")

        if not elder_id:
            return error_response("缺少 elder_id", 400)

        # 取得音訊資料
        audio_base64 = body.get("audio")
        if not audio_base64:
            if event.get("isBase64Encoded"):
                audio_base64 = event.get("body", "")
            else:
                return error_response("缺少音訊資料", 400)

        audio_bytes = base64.b64decode(audio_base64)

        # 1. 語音轉文字（支援國台語自動偵測）
        transcribed_text = transcribe_audio(audio_bytes, language)
        if not transcribed_text:
            return error_response("無法辨識語音，請再試一次", 400)

        # 2. 自動偵測實際語言（根據轉寫文字判斷）
        detected_language = detect_language_from_text(transcribed_text)
        # 如果使用者選擇台語，或偵測到台語，使用台語回應
        effective_language = language if language in ("nan-TW", "nan") else detected_language

        # 3. 載入長者記憶
        memory_summary = get_memory_summary(elder_id)
        memory_context = _build_memory_context(memory_summary)

        # 4. 建構情境感知系統提示
        if effective_language in ("nan-TW", "nan"):
            system_prompt = SYSTEM_PROMPT_NAN.format(memory_context=memory_context)
        else:
            system_prompt = SYSTEM_PROMPT_ZH.format(memory_context=memory_context)

        # 5. 加入情境感知資訊
        context_info = _build_context_awareness(memory_summary)
        system_prompt += context_info

        # 6. 查詢知識庫（健康相關問題）
        health_keywords = ["痛", "不舒服", "暈", "跌倒", "藥", "醫生", "營養", "運動",
                          "袂爽快", "頭殼痛", "腹肚痛", "藥仔"]
        if any(kw in transcribed_text for kw in health_keywords):
            kb_context = query_knowledge_base(transcribed_text)
            if kb_context:
                system_prompt += f"\n\n參考知識：\n{kb_context}"

        # 7. 對話歷史
        conversation_history = _build_conversation_history(memory_summary)

        # 8. 呼叫 Claude
        reply_text = invoke_claude(
            user_message=transcribed_text,
            system_prompt=system_prompt,
            conversation_history=conversation_history,
        )

        # 9. 擷取生活紀錄
        life_record = invoke_claude_with_extraction(transcribed_text, reply_text)

        # 10. 儲存對話記憶（含語言資訊）
        save_conversation_memory(elder_id, {
            "question": transcribed_text,
            "answer": reply_text,
            "language": effective_language,
            **life_record,
        })

        # 11. 文字轉語音（使用對應語言）
        audio_result = synthesize_speech(reply_text, effective_language)

        return success_response({
            "transcribed_text": transcribed_text,
            "reply_text": reply_text,
            "audio_url": audio_result["audio_url"],
            "life_record": life_record,
            "language": effective_language,
            "detected_language": detected_language,
        })

    except Exception as e:
        print(f"Speech handler error: {e}")
        return error_response(f"處理語音時發生錯誤: {str(e)}")


def _build_memory_context(memory_summary: dict) -> str:
    """建構記憶上下文"""
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
            elif isinstance(prefs, str):
                parts.append(f"個人偏好：{prefs}")

    # 近期生活紀錄
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

    # 近期對話摘要
    recent = memory_summary.get("recent_conversations", [])
    if recent:
        parts.append("\n近期對話摘要：")
        for conv in recent[:3]:
            parts.append(f"  - {conv.get('q', '')[:40]}...")

    if parts:
        return "長者資訊：\n" + "\n".join(parts)
    return "（尚無記憶資料）"


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

    return "\n".join(parts)


def _build_conversation_history(memory_summary: dict) -> list:
    """建構對話歷史"""
    history = []
    recent = memory_summary.get("recent_conversations", [])
    for conv in recent[-5:]:
        if conv.get("q"):
            history.append({"role": "user", "content": conv["q"]})
        if conv.get("a"):
            history.append({"role": "assistant", "content": conv["a"]})
    return history
