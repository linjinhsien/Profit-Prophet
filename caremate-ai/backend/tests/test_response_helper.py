"""
Response Helper 測試
"""
import json
import pytest
from decimal import Decimal
from shared.response_helper import (
    success_response,
    error_response,
    parse_body,
    DecimalEncoder,
)


class TestResponseHelper:
    """測試回應輔助工具"""

    def test_success_response_status_code(self):
        """測試成功回應狀態碼"""
        response = success_response({"data": "test"})
        assert response["statusCode"] == 200

    def test_success_response_custom_status(self):
        """測試自訂狀態碼"""
        response = success_response({"data": "created"}, 201)
        assert response["statusCode"] == 201

    def test_success_response_headers(self):
        """測試回應 headers"""
        response = success_response({})
        headers = response["headers"]
        assert headers["Content-Type"] == "application/json"
        assert headers["Access-Control-Allow-Origin"] == "*"
        assert "GET" in headers["Access-Control-Allow-Methods"]
        assert "POST" in headers["Access-Control-Allow-Methods"]

    def test_error_response_format(self):
        """測試錯誤回應格式"""
        response = error_response("Something went wrong", 500)
        assert response["statusCode"] == 500
        body = json.loads(response["body"])
        assert body["error"] == "Something went wrong"

    def test_error_response_400(self):
        """測試 400 錯誤"""
        response = error_response("缺少 elder_id", 400)
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert "elder_id" in body["error"]

    def test_parse_body_json_string(self):
        """測試解析 JSON 字串"""
        event = {"body": '{"key": "value", "number": 42}'}
        result = parse_body(event)
        assert result["key"] == "value"
        assert result["number"] == 42

    def test_parse_body_none(self):
        """測試 body 為 None"""
        event = {"body": None}
        result = parse_body(event)
        assert result == {}

    def test_parse_body_empty_string(self):
        """測試空字串 body"""
        event = {"body": ""}
        result = parse_body(event)
        assert result == {}

    def test_parse_body_already_dict(self):
        """測試 body 已是 dict"""
        event = {"body": {"key": "value"}}
        result = parse_body(event)
        assert result["key"] == "value"

    def test_parse_body_invalid_json(self):
        """測試無效 JSON"""
        event = {"body": "not json {{{"}
        result = parse_body(event)
        assert result == {}

    def test_decimal_encoder(self):
        """測試 Decimal 編碼器"""
        data = {"age": Decimal("78"), "score": Decimal("7.5")}
        result = json.dumps(data, cls=DecimalEncoder)
        parsed = json.loads(result)
        assert parsed["age"] == 78.0
        assert parsed["score"] == 7.5

    def test_chinese_characters_in_response(self):
        """測試中文字元正確編碼"""
        response = success_response({"message": "你好，我是陪伴助手"})
        body = json.loads(response["body"])
        assert body["message"] == "你好，我是陪伴助手"

    def test_unicode_emoji_in_response(self):
        """測試特殊字元正確編碼"""
        response = success_response({"emotion": "開心"})
        body = json.loads(response["body"])
        assert body["emotion"] == "開心"
