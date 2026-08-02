"""
DynamoDB 存取層測試
"""
import pytest
import boto3
from moto import mock_aws
from datetime import datetime, timedelta


class TestElderProfile:
    """測試 elder_profile 表操作"""

    def setup_method(self, method=None):
        """每個測試前初始化"""
        self.mock = mock_aws()
        self.mock.start()
        self.dynamodb = boto3.resource("dynamodb", region_name="us-west-2")
        self.table = self.dynamodb.create_table(
            TableName="test_elder_profile",
            KeySchema=[{"AttributeName": "elder_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "elder_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

    def teardown_method(self, method=None):
        self.mock.stop()

    def test_create_profile(self, sample_elder_profile):
        """測試建立長者資料"""
        self.table.put_item(Item=sample_elder_profile)

        response = self.table.get_item(Key={"elder_id": "elder-test-001"})
        item = response["Item"]

        assert item["elder_id"] == "elder-test-001"
        assert item["name"] == "測試阿嬤"
        assert item["age"] == 78
        assert item["disease"] == "高血壓、輕度失智"

    def test_get_nonexistent_profile(self):
        """測試取得不存在的長者資料"""
        response = self.table.get_item(Key={"elder_id": "nonexistent"})
        assert "Item" not in response

    def test_update_profile(self, sample_elder_profile):
        """測試更新長者資料"""
        self.table.put_item(Item=sample_elder_profile)

        # 更新年齡
        self.table.update_item(
            Key={"elder_id": "elder-test-001"},
            UpdateExpression="SET age = :val",
            ExpressionAttributeValues={":val": 79},
        )

        response = self.table.get_item(Key={"elder_id": "elder-test-001"})
        assert response["Item"]["age"] == 79

    def test_profile_with_chinese_fields(self):
        """測試中文欄位正確儲存"""
        profile = {
            "elder_id": "elder-zh-001",
            "name": "王老先生",
            "disease": "糖尿病、關節炎",
            "preferences": {"favorite_topics": ["下棋", "泡茶", "聽歌仔戲"]},
        }
        self.table.put_item(Item=profile)

        response = self.table.get_item(Key={"elder_id": "elder-zh-001"})
        assert response["Item"]["name"] == "王老先生"
        assert "下棋" in response["Item"]["preferences"]["favorite_topics"]


class TestElderMemory:
    """測試 elder_memory 表操作"""

    def setup_method(self, method=None):
        """每個測試前初始化"""
        self.mock = mock_aws()
        self.mock.start()
        self.dynamodb = boto3.resource("dynamodb", region_name="us-west-2")
        self.table = self.dynamodb.create_table(
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

    def teardown_method(self, method=None):
        self.mock.stop()

    def test_save_conversation(self, sample_memory_records):
        """測試儲存對話記錄"""
        for record in sample_memory_records:
            self.table.put_item(Item=record)

        response = self.table.query(
            KeyConditionExpression="elder_id = :eid",
            ExpressionAttributeValues={":eid": "elder-test-001"},
        )
        assert response["Count"] == 3

    def test_query_recent_memories(self, sample_memory_records):
        """測試查詢近期記憶"""
        for record in sample_memory_records:
            self.table.put_item(Item=record)

        # 查詢 7/30 的記錄
        response = self.table.query(
            KeyConditionExpression="elder_id = :eid AND #ts >= :cutoff",
            ExpressionAttributeNames={"#ts": "timestamp"},
            ExpressionAttributeValues={
                ":eid": "elder-test-001",
                ":cutoff": "2026-07-30T00:00:00Z",
            },
        )
        assert response["Count"] == 2

    def test_query_with_sort_order(self, sample_memory_records):
        """測試按時間排序查詢"""
        for record in sample_memory_records:
            self.table.put_item(Item=record)

        # 逆序排列（最新的在前）
        response = self.table.query(
            KeyConditionExpression="elder_id = :eid",
            ExpressionAttributeValues={":eid": "elder-test-001"},
            ScanIndexForward=False,
        )
        items = response["Items"]
        assert items[0]["timestamp"] > items[-1]["timestamp"]

    def test_life_record_extraction(self):
        """測試生活紀錄欄位正確儲存"""
        record = {
            "elder_id": "elder-test-001",
            "timestamp": "2026-07-30T12:00:00Z",
            "question": "我中午吃了便當",
            "answer": "便當不錯呢！吃了什麼菜？",
            "sleep": "",
            "food": "午餐吃便當",
            "activity": "",
            "drug": "",
            "emotion": "正常",
        }
        self.table.put_item(Item=record)

        response = self.table.get_item(
            Key={"elder_id": "elder-test-001", "timestamp": "2026-07-30T12:00:00Z"}
        )
        item = response["Item"]
        assert item["food"] == "午餐吃便當"
        assert item["emotion"] == "正常"
        assert item["sleep"] == ""

    def test_empty_fields_handled(self):
        """測試空欄位處理"""
        record = {
            "elder_id": "elder-test-001",
            "timestamp": "2026-07-30T15:00:00Z",
            "question": "天氣真好",
            "answer": "是啊，今天天氣很舒服呢！",
            "sleep": "",
            "food": "",
            "activity": "",
            "drug": "",
            "emotion": "開心",
        }
        self.table.put_item(Item=record)

        response = self.table.get_item(
            Key={"elder_id": "elder-test-001", "timestamp": "2026-07-30T15:00:00Z"}
        )
        assert response["Item"]["emotion"] == "開心"
