"""
GET /profile/{id} - 取得長者基本資料 Lambda
PUT /profile/{id} - 更新長者基本資料 Lambda
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.dynamodb import get_elder_profile, update_elder_profile
from shared.response_helper import success_response, error_response, parse_body


def handler(event, context):
    """Lambda handler: 長者基本資料 CRUD"""
    if event.get("httpMethod") == "OPTIONS":
        return success_response({})

    try:
        http_method = event.get("httpMethod", "GET")
        path_params = event.get("pathParameters", {}) or {}
        elder_id = path_params.get("id")

        if not elder_id:
            return error_response("缺少 elder_id", 400)

        if http_method == "GET":
            return _handle_get(elder_id)
        elif http_method == "PUT":
            return _handle_put(elder_id, event)
        else:
            return error_response(f"不支援的方法: {http_method}", 405)

    except Exception as e:
        print(f"Profile handler error: {e}")
        return error_response(f"處理資料時發生錯誤: {str(e)}")


def _handle_get(elder_id: str) -> dict:
    """取得長者基本資料"""
    profile = get_elder_profile(elder_id)

    if not profile:
        return error_response("找不到該長者資料", 404)

    return success_response({
        "elder_id": elder_id,
        "profile": profile,
    })


def _handle_put(elder_id: str, event: dict) -> dict:
    """更新長者基本資料"""
    body = parse_body(event)

    if not body:
        return error_response("請求 body 不可為空", 400)

    # 驗證允許更新的欄位
    allowed_fields = [
        "name", "age", "gender", "language", "phone", "address",
        "emergency_contact", "emergency_phone", "disease",
        "medications", "allergies", "preferences", "family_info",
    ]

    update_data = {k: v for k, v in body.items() if k in allowed_fields}

    if not update_data:
        return error_response("沒有可更新的欄位", 400)

    updated_profile = update_elder_profile(elder_id, update_data)

    return success_response({
        "elder_id": elder_id,
        "profile": updated_profile,
        "message": "更新成功",
    })
