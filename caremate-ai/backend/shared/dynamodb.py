"""
DynamoDB 存取層
"""
import boto3
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from .config import AWS_REGION, TABLE_ELDER_PROFILE, TABLE_ELDER_MEMORY, MEMORY_SUMMARY_DAYS

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)

profile_table = dynamodb.Table(TABLE_ELDER_PROFILE)
memory_table = dynamodb.Table(TABLE_ELDER_MEMORY)


def get_elder_profile(elder_id: str) -> Optional[dict]:
    """取得長者基本資料"""
    response = profile_table.get_item(Key={"elder_id": elder_id})
    return response.get("Item")


def update_elder_profile(elder_id: str, data: dict) -> dict:
    """更新長者基本資料"""
    update_expr_parts = []
    expr_attr_values = {}
    expr_attr_names = {}

    for key, value in data.items():
        if key == "elder_id":
            continue
        safe_key = f"#attr_{key}"
        safe_val = f":val_{key}"
        update_expr_parts.append(f"{safe_key} = {safe_val}")
        expr_attr_names[safe_key] = key
        expr_attr_values[safe_val] = value

    if not update_expr_parts:
        return get_elder_profile(elder_id)

    response = profile_table.update_item(
        Key={"elder_id": elder_id},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeNames=expr_attr_names,
        ExpressionAttributeValues=expr_attr_values,
        ReturnValues="ALL_NEW",
    )
    return response.get("Attributes")


def save_conversation_memory(elder_id: str, data: dict) -> None:
    """儲存對話記憶（含生活紀錄擷取結果）"""
    item = {
        "elder_id": elder_id,
        "timestamp": datetime.utcnow().isoformat(),
        "question": data.get("question", ""),
        "answer": data.get("answer", ""),
        "sleep": data.get("sleep", ""),
        "food": data.get("food", ""),
        "activity": data.get("activity", ""),
        "drug": data.get("drug", ""),
        "emotion": data.get("emotion", ""),
    }
    # 轉換 float 為 Decimal（DynamoDB 不支援 float）
    item = _convert_floats(item)
    memory_table.put_item(Item=item)


def get_recent_memories(elder_id: str, days: int = MEMORY_SUMMARY_DAYS) -> list:
    """取得近 N 天的對話記憶"""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    response = memory_table.query(
        KeyConditionExpression="elder_id = :eid AND #ts >= :cutoff",
        ExpressionAttributeNames={"#ts": "timestamp"},
        ExpressionAttributeValues={
            ":eid": elder_id,
            ":cutoff": cutoff,
        },
        ScanIndexForward=False,  # 最新的在前面
        Limit=50,
    )
    return response.get("Items", [])


def get_memory_summary(elder_id: str) -> dict:
    """組合長者記憶摘要（用於 Prompt 注入）"""
    profile = get_elder_profile(elder_id)
    recent = get_recent_memories(elder_id)

    summary = {
        "profile": profile or {},
        "recent_conversations": [],
        "life_records": {
            "sleep": [],
            "food": [],
            "activity": [],
            "drug": [],
            "emotion": [],
        },
    }

    for mem in recent:
        if mem.get("question") or mem.get("answer"):
            summary["recent_conversations"].append({
                "timestamp": mem.get("timestamp", ""),
                "q": mem.get("question", ""),
                "a": mem.get("answer", ""),
            })
        # 收集生活紀錄
        for field in ["sleep", "food", "activity", "drug", "emotion"]:
            if mem.get(field):
                summary["life_records"][field].append({
                    "timestamp": mem.get("timestamp", ""),
                    "value": mem.get(field),
                })

    return summary


def _convert_floats(obj):
    """遞迴轉換 float 為 Decimal"""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_floats(i) for i in obj]
    return obj
