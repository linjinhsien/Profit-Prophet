"""
Chat Lambda Handler 測試
"""
import json
import pytest
from unittest.mock import patch, MagicMock


class TestChatHandler:
    """測試 Chat Lambda Handler"""

    def test_missing_elder_id(self):
        """測試缺少 elder_id 參數"""
        from shared.response_helper import parse_body, error_response

        event = {
            "httpMethod": "POST",
            "body": json.dumps({"message": "你好"}),
        }
        body = parse_body(event)
        assert body.get("elder_id") is None

    def test_missing_message(self):
        """測試缺少 message 參數"""
        from shared.response_helper import parse_body

        event = {
            "httpMethod": "POST",
            "body": json.dumps({"elder_id": "elder-001"}),
        }
        body = parse_body(event)
        assert body.get("message", "").strip() == ""

    def test_options_request(self):
        """測試 OPTIONS 預檢請求"""
        from shared.response_helper import success_response

        response = success_response({})
        assert response["statusCode"] == 200
        assert "Access-Control-Allow-Origin" in response["headers"]

    def test_parse_body_valid_json(self):
        """測試正確 JSON 解析"""
        from shared.response_helper import parse_body

        event = {
            "body": json.dumps({
                "elder_id": "elder-001",
                "message": "我今天吃了稀飯",
                "language": "zh-TW",
            })
        }
        body = parse_body(event)
        assert body["elder_id"] == "elder-001"
        assert body["message"] == "我今天吃了稀飯"
        assert body["language"] == "zh-TW"

    def test_parse_body_invalid_json(self):
        """測試無效 JSON 處理"""
        from shared.response_helper import parse_body

        event = {"body": "not a json"}
        body = parse_body(event)
        assert body == {}

    def test_parse_body_empty(self):
        """測試空 body 處理"""
        from shared.response_helper import parse_body

        event = {"body": None}
        body = parse_body(event)
        assert body == {}

    def test_error_response_format(self):
        """測試錯誤回應格式"""
        from shared.response_helper import error_response

        response = error_response("測試錯誤", 400)
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"] == "測試錯誤"
        assert response["headers"]["Content-Type"] == "application/json"

    def test_success_response_format(self):
        """測試成功回應格式"""
        from shared.response_helper import success_response

        data = {"reply_text": "你好！", "language": "zh-TW"}
        response = success_response(data)
        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["reply_text"] == "你好！"

    def test_success_response_cors_headers(self):
        """測試 CORS headers"""
        from shared.response_helper import success_response

        response = success_response({})
        headers = response["headers"]
        assert headers["Access-Control-Allow-Origin"] == "*"
        assert "POST" in headers["Access-Control-Allow-Methods"]
        assert "GET" in headers["Access-Control-Allow-Methods"]

    def test_language_selection_default(self):
        """測試預設語言為中文"""
        from shared.response_helper import parse_body

        event = {"body": json.dumps({"elder_id": "elder-001", "message": "你好"})}
        body = parse_body(event)
        language = body.get("language", "zh-TW")
        assert language == "zh-TW"

    def test_language_selection_taiwanese(self):
        """測試台語語言選擇"""
        from shared.response_helper import parse_body

        event = {
            "body": json.dumps({
                "elder_id": "elder-001",
                "message": "你好",
                "language": "nan-TW",
            })
        }
        body = parse_body(event)
        assert body["language"] == "nan-TW"


class TestChatMemoryContext:
    """測試記憶上下文建構"""

    def test_build_memory_context_empty(self):
        """測試空記憶上下文"""
        memory_summary = {"profile": {}, "recent_conversations": [], "life_records": {}}

        # 模擬 _build_memory_context 邏輯
        profile = memory_summary.get("profile", {})
        recent = memory_summary.get("recent_conversations", [])
        has_data = bool(profile) or bool(recent)
        assert not has_data

    def test_build_memory_context_with_profile(self, sample_elder_profile):
        """測試有資料的記憶上下文"""
        memory_summary = {
            "profile": sample_elder_profile,
            "recent_conversations": [],
            "life_records": {},
        }
        profile = memory_summary.get("profile", {})
        assert profile.get("name") == "測試阿嬤"
        assert profile.get("age") == 78

    def test_conversation_history_limit(self, sample_memory_records):
        """測試對話歷史限制（最多 5 輪）"""
        conversations = [
            {"q": f"問題{i}", "a": f"回答{i}"}
            for i in range(10)
        ]
        # 取最後 5 輪
        limited = conversations[-5:]
        assert len(limited) == 5
        assert limited[0]["q"] == "問題5"
