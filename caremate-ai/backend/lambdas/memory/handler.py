"""
GET /memory/{id} - 取得長者記憶 Lambda

功能：
1. 取得長者的長期記憶資料
2. 包含個人偏好、家庭資訊、健康資訊
3. 包含近 7 天對話摘要
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.dynamodb import get_memory_summary, get_recent_memories, get_elder_profile
from shared.response_helper import success_response, error_response


def handler(event, context):
    """Lambda handler: 取得長者記憶"""
    if event.get("httpMethod") == "OPTIONS":
        return success_response({})

    try:
        # 從路徑參數取得 elder_id
        path_params = event.get("pathParameters", {}) or {}
        elder_id = path_params.get("id")

        if not elder_id:
            return error_response("缺少 elder_id", 400)

        # 取得完整記憶摘要
        memory_summary = get_memory_summary(elder_id)

        # 取得長者基本資料
        profile = get_elder_profile(elder_id)

        # 組裝回應
        response_data = {
            "elder_id": elder_id,
            "profile": profile or {},
            "personal_preferences": _extract_preferences(profile),
            "family_info": _extract_family_info(profile),
            "health_info": _extract_health_info(profile),
            "recent_summary": _build_recent_summary(memory_summary),
            "life_records": memory_summary.get("life_records", {}),
        }

        return success_response(response_data)

    except Exception as e:
        print(f"Memory handler error: {e}")
        return error_response(f"取得記憶時發生錯誤: {str(e)}")


def _extract_preferences(profile: dict) -> dict:
    """擷取個人偏好"""
    if not profile:
        return {}
    preferences = profile.get("preferences", {})
    if isinstance(preferences, str):
        return {"notes": preferences}
    return preferences


def _extract_family_info(profile: dict) -> dict:
    """擷取家庭資訊"""
    if not profile:
        return {}
    return profile.get("family_info", {})


def _extract_health_info(profile: dict) -> dict:
    """擷取健康資訊"""
    if not profile:
        return {}
    return {
        "diseases": profile.get("disease", ""),
        "medications": profile.get("medications", []),
        "allergies": profile.get("allergies", []),
    }


def _build_recent_summary(memory_summary: dict) -> list:
    """建構近期對話摘要"""
    conversations = memory_summary.get("recent_conversations", [])
    summaries = []

    # 按日期分組
    daily_groups = {}
    for conv in conversations:
        date = conv.get("timestamp", "")[:10]
        if date not in daily_groups:
            daily_groups[date] = []
        daily_groups[date].append(conv)

    # 每日摘要
    for date, convs in sorted(daily_groups.items(), reverse=True)[:7]:
        topics = []
        for c in convs[:3]:
            if c.get("q"):
                topics.append(c["q"][:30])

        summaries.append({
            "date": date,
            "conversation_count": len(convs),
            "topics": topics,
        })

    return summaries
