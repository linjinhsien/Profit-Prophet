"""
Summary Lambda Handler 測試
"""
import json
import pytest
import boto3
from moto import mock_aws


class TestSummaryHandler:
    """測試每日摘要功能"""

    def setup_method(self, method=None):
        """初始化 DynamoDB 表及測試資料"""
        self.mock = mock_aws()
        self.mock.start()
        self.dynamodb = boto3.resource("dynamodb", region_name="us-west-2")
        self.memory_table = self.dynamodb.create_table(
            TableName="test_elder_memory",
            KeySchema=[
                {"AttributeName": "elder_id", "KeyType": "HASH"},
                {"AttributeName": "timestamp", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "elder_id", "AttributeType": "S"},
                {"AttributeName": "timestamp", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # 插入測試對話記錄
        test_records = [
            {
                "elder_id": "elder-test-001",
                "timestamp": "2026-07-30T08:00:00Z",
                "question": "我昨晚睡得很好，睡了8小時",
                "answer": "太好了！睡得好身體就好。",
                "sleep": "睡了8小時，品質佳",
                "food": "",
                "activity": "",
                "drug": "",
                "emotion": "開心",
            },
            {
                "elder_id": "elder-test-001",
                "timestamp": "2026-07-30T09:00:00Z",
                "question": "我早上吃了豆漿和饅頭",
                "answer": "豆漿饅頭很營養呢！",
                "sleep": "",
                "food": "早餐：豆漿和饅頭",
                "activity": "",
                "drug": "",
                "emotion": "正常",
            },
            {
                "elder_id": "elder-test-001",
                "timestamp": "2026-07-30T10:30:00Z",
                "question": "我剛吃完降血壓的藥了",
                "answer": "很好，記得按時吃藥喔。",
                "sleep": "",
                "food": "",
                "activity": "",
                "drug": "降血壓藥已服用",
                "emotion": "平靜",
            },
            {
                "elder_id": "elder-test-001",
                "timestamp": "2026-07-30T15:00:00Z",
                "question": "我剛去公園走了一圈",
                "answer": "散步很好！走了大概多久？",
                "sleep": "",
                "food": "",
                "activity": "公園散步",
                "drug": "",
                "emotion": "開心",
            },
        ]

        for record in test_records:
            self.memory_table.put_item(Item=record)

    def teardown_method(self, method=None):
        self.mock.stop()

    def test_aggregate_life_records(self):
        """測試彙整生活紀錄"""
        response = self.memory_table.query(
            KeyConditionExpression="elder_id = :eid AND #ts >= :cutoff",
            ExpressionAttributeNames={"#ts": "timestamp"},
            ExpressionAttributeValues={
                ":eid": "elder-test-001",
                ":cutoff": "2026-07-30T00:00:00Z",
            },
        )
        items = response["Items"]

        # 彙整
        stats = {"sleep": [], "food": [], "activity": [], "drug": [], "emotion": []}
        for item in items:
            for field in stats.keys():
                if item.get(field):
                    stats[field].append(item[field])

        assert len(stats["sleep"]) == 1
        assert "8小時" in stats["sleep"][0]
        assert len(stats["food"]) == 1
        assert "豆漿" in stats["food"][0]
        assert len(stats["drug"]) == 1
        assert len(stats["activity"]) == 1
        assert len(stats["emotion"]) == 4  # 開心, 正常, 平靜, 開心 -> 非空共 4 個

    def test_filter_by_date(self):
        """測試按日期過濾"""
        # 加入不同日期的記錄
        self.memory_table.put_item(Item={
            "elder_id": "elder-test-001",
            "timestamp": "2026-07-29T20:00:00Z",
            "question": "晚安",
            "answer": "晚安，好夢。",
            "sleep": "",
            "food": "",
            "activity": "",
            "drug": "",
            "emotion": "平靜",
        })

        # 只查 7/30 的記錄
        response = self.memory_table.query(
            KeyConditionExpression="elder_id = :eid AND #ts BETWEEN :start AND :end",
            ExpressionAttributeNames={"#ts": "timestamp"},
            ExpressionAttributeValues={
                ":eid": "elder-test-001",
                ":start": "2026-07-30T00:00:00Z",
                ":end": "2026-07-30T23:59:59Z",
            },
        )
        assert response["Count"] == 4  # 只有 7/30 的 4 筆

    def test_no_records_for_date(self):
        """測試無記錄日期"""
        response = self.memory_table.query(
            KeyConditionExpression="elder_id = :eid AND #ts >= :cutoff",
            ExpressionAttributeNames={"#ts": "timestamp"},
            ExpressionAttributeValues={
                ":eid": "elder-test-001",
                ":cutoff": "2026-08-01T00:00:00Z",
            },
        )
        assert response["Count"] == 0

    def test_conversation_count(self):
        """測試對話次數計算"""
        response = self.memory_table.query(
            KeyConditionExpression="elder_id = :eid AND #ts >= :cutoff",
            ExpressionAttributeNames={"#ts": "timestamp"},
            ExpressionAttributeValues={
                ":eid": "elder-test-001",
                ":cutoff": "2026-07-30T00:00:00Z",
            },
        )
        assert response["Count"] == 4

    def test_summary_request_validation(self):
        """測試摘要請求參數驗證"""
        from shared.response_helper import parse_body

        # 有效請求
        event = {"body": json.dumps({"elder_id": "elder-001", "date": "2026-07-30"})}
        body = parse_body(event)
        assert body["elder_id"] == "elder-001"
        assert body["date"] == "2026-07-30"

        # 缺少 elder_id
        event = {"body": json.dumps({"date": "2026-07-30"})}
        body = parse_body(event)
        assert body.get("elder_id") is None
