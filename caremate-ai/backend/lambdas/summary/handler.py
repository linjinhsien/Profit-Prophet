"""
POST /summary - 每日摘要 Lambda

功能：
1. 根據指定日期彙整長者的對話記錄
2. 使用 AI 自動產生每日生活摘要報告
3. 包含睡眠、飲食、運動、服藥、情緒的結構化分析
4. 提供照護者可快速瀏覽的格式化資訊
"""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.dynamodb import get_recent_memories, get_elder_profile
from shared.bedrock_client import invoke_claude
from shared.response_helper import success_response, error_response, parse_body


def handler(event, context):
    """Lambda handler: 產生每日摘要"""
    if event.get("httpMethod") == "OPTIONS":
        return success_response({})

    try:
        body = parse_body(event)
        elder_id = body.get("elder_id")
        date_str = body.get("date")  # 格式: YYYY-MM-DD
        summary_type = body.get("type", "daily")  # daily / weekly

        if not elder_id:
            return error_response("缺少 elder_id", 400)

        # 取得長者資料
        profile = get_elder_profile(elder_id)

        # 根據摘要類型取得記憶
        if summary_type == "weekly":
            memories = get_recent_memories(elder_id, days=7)
        else:
            memories = get_recent_memories(elder_id, days=7)
            # 過濾指定日期
            if date_str:
                memories = [
                    m for m in memories
                    if m.get("timestamp", "").startswith(date_str)
                ]

        if not memories:
            return success_response({
                "elder_id": elder_id,
                "date": date_str or datetime.now().strftime("%Y-%m-%d"),
                "summary": "今天尚無對話記錄。",
                "stats": {
                    "conversation_count": 0,
                    "sleep": "",
                    "food": [],
                    "activity": [],
                    "drug": "",
                    "emotion": "無資料",
                },
                "alerts": [],
            })

        # 彙整生活紀錄
        stats = _aggregate_life_records(memories)

        # 分析異常狀況
        alerts = _detect_alerts(stats, profile)

        # 使用 Claude 產生摘要
        summary_prompt = _build_summary_prompt(profile, memories, stats, summary_type)
        summary_text = invoke_claude(
            user_message=summary_prompt,
            system_prompt=_get_summary_system_prompt(summary_type),
            max_tokens=800,
            temperature=0.3,
        )

        return success_response({
            "elder_id": elder_id,
            "date": date_str or datetime.now().strftime("%Y-%m-%d"),
            "type": summary_type,
            "summary": summary_text,
            "stats": stats,
            "conversation_count": len(memories),
            "alerts": alerts,
        })

    except Exception as e:
        print(f"Summary handler error: {e}")
        return error_response(f"產生摘要時發生錯誤: {str(e)}")


def _get_summary_system_prompt(summary_type: str) -> str:
    """取得摘要生成的系統提示"""
    if summary_type == "weekly":
        return """你是一位專業的照護紀錄助手。請根據以下一週的資料，產生結構化的週報摘要。
格式要求：
1. 整體狀況概述（2-3 句）
2. 各面向分析：睡眠、飲食、活動、用藥、情緒
3. 需要關注的事項（如有異常）
4. 建議事項

用中文回應，語氣專業但易讀，適合家屬和照護人員閱讀。"""
    else:
        return """你是一位照護紀錄助手，請根據以下資料產生簡潔的每日照護摘要報告。
格式要求：
1. 今日概況（1-2 句）
2. 生活紀錄重點（睡眠、飲食、活動、用藥）
3. 情緒觀察
4. 需注意事項（如有）

用中文回應，語氣專業但易讀。約 150-250 字。"""


def _aggregate_life_records(memories: list) -> dict:
    """彙整生活紀錄"""
    stats = {
        "conversation_count": len(memories),
        "sleep": [],
        "food": [],
        "activity": [],
        "drug": [],
        "emotion": [],
    }

    for mem in memories:
        for field in ["sleep", "food", "activity", "drug", "emotion"]:
            value = mem.get(field, "")
            if value:
                stats[field].append(value)

    return stats


def _detect_alerts(stats: dict, profile: dict) -> list:
    """偵測異常狀況，產生警示"""
    alerts = []

    # 檢查情緒異常
    negative_emotions = ["低落", "焦慮", "擔心", "難過", "哭", "沮喪", "孤單"]
    emotion_alerts = [e for e in stats.get("emotion", [])
                     if any(neg in e for neg in negative_emotions)]
    if len(emotion_alerts) >= 2:
        alerts.append({
            "type": "emotion",
            "level": "warning",
            "message": f"近期多次出現負面情緒：{'、'.join(emotion_alerts[:3])}",
        })

    # 檢查飲食異常
    food_records = stats.get("food", [])
    skip_keywords = ["沒吃", "不吃", "食量少", "只吃一半", "沒食慾"]
    food_alerts = [f for f in food_records if any(kw in f for kw in skip_keywords)]
    if len(food_alerts) >= 2:
        alerts.append({
            "type": "food",
            "level": "warning",
            "message": f"近期飲食不正常，出現 {len(food_alerts)} 次食量不足的記錄",
        })

    # 檢查用藥異常
    drug_records = stats.get("drug", [])
    missed_keywords = ["沒吃", "忘記", "未服", "漏吃"]
    if any(any(kw in d for kw in missed_keywords) for d in drug_records):
        alerts.append({
            "type": "drug",
            "level": "critical",
            "message": "有漏服藥物的紀錄，請照護者確認",
        })

    # 檢查睡眠異常
    sleep_records = stats.get("sleep", [])
    poor_sleep_keywords = ["失眠", "睡不著", "只睡", "4小時", "3小時", "淺眠"]
    poor_sleep = [s for s in sleep_records if any(kw in s for kw in poor_sleep_keywords)]
    if len(poor_sleep) >= 2:
        alerts.append({
            "type": "sleep",
            "level": "warning",
            "message": f"近期睡眠品質不佳，出現 {len(poor_sleep)} 次睡眠問題",
        })

    return alerts


def _build_summary_prompt(profile: dict, memories: list, stats: dict, summary_type: str) -> str:
    """建構摘要生成的提示"""
    lines = []

    if profile:
        lines.append(f"長者：{profile.get('name', '未知')}，{profile.get('age', '')}歲，{profile.get('gender', '')}")
        if profile.get("disease"):
            diseases = profile.get("disease") if isinstance(profile.get("disease"), str) else "、".join(profile.get("diseases", []))
            lines.append(f"健康狀況：{diseases}")
        if profile.get("medications"):
            meds = profile.get("medications")
            if isinstance(meds, list):
                lines.append(f"用藥：{'、'.join(meds[:3])}")

    period = "本週" if summary_type == "weekly" else "今日"
    lines.append(f"\n{period}對話次數：{stats['conversation_count']}")

    if stats["sleep"]:
        lines.append(f"睡眠紀錄：{'；'.join(stats['sleep'][:5])}")
    if stats["food"]:
        lines.append(f"飲食紀錄：{'；'.join(stats['food'][:5])}")
    if stats["activity"]:
        lines.append(f"活動紀錄：{'；'.join(stats['activity'][:5])}")
    if stats["drug"]:
        lines.append(f"服藥紀錄：{'；'.join(stats['drug'][:5])}")
    if stats["emotion"]:
        lines.append(f"情緒狀態：{'；'.join(stats['emotion'][:5])}")

    # 加入部分對話內容
    lines.append("\n對話節錄：")
    for mem in memories[:5]:
        q = mem.get("question", "")
        a = mem.get("answer", "")
        if q:
            lines.append(f"  長者：{q[:80]}")
        if a:
            lines.append(f"  助手：{a[:80]}")

    lines.append(f"\n請根據以上資料，產生一份{period}照護摘要。")

    return "\n".join(lines)
