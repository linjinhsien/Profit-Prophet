"""
API Gateway Lambda 回應輔助工具
"""
import json
from decimal import Decimal


class DecimalEncoder(json.JSONEncoder):
    """處理 DynamoDB Decimal 類型的 JSON 編碼器"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def success_response(body: dict, status_code: int = 200) -> dict:
    """成功回應"""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body, cls=DecimalEncoder, ensure_ascii=False),
    }


def error_response(message: str, status_code: int = 500) -> dict:
    """錯誤回應"""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps({"error": message}, ensure_ascii=False),
    }


def parse_body(event: dict) -> dict:
    """解析請求 body"""
    body = event.get("body", "{}")
    if isinstance(body, str):
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}
    return body or {}
