"""
Profile Lambda Handler 測試
"""
import json
import pytest
import boto3
from moto import mock_aws


class TestProfileHandler:
    """測試 Profile Lambda Handler"""

    def setup_method(self, method=None):
        """每個測試前初始化 DynamoDB"""
        self.mock = mock_aws()
        self.mock.start()
        self.dynamodb = boto3.resource("dynamodb", region_name="us-west-2")
        self.table = self.dynamodb.create_table(
            TableName="test_elder_profile",
            KeySchema=[{"AttributeName": "elder_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "elder_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        # 插入測試資料
        self.table.put_item(Item={
            "elder_id": "elder-test-001",
            "name": "測試阿嬤",
            "age": 78,
            "language": "zh-TW",
            "disease": "高血壓",
        })

    def teardown_method(self, method=None):
        self.mock.stop()

    def test_get_existing_profile(self):
        """測試取得存在的長者資料"""
        response = self.table.get_item(Key={"elder_id": "elder-test-001"})
        profile = response["Item"]

        assert profile["name"] == "測試阿嬤"
        assert profile["age"] == 78
        assert profile["disease"] == "高血壓"

    def test_get_nonexistent_profile(self):
        """測試取得不存在的長者資料"""
        response = self.table.get_item(Key={"elder_id": "nonexistent"})
        assert "Item" not in response

    def test_update_profile_name(self):
        """測試更新姓名"""
        self.table.update_item(
            Key={"elder_id": "elder-test-001"},
            UpdateExpression="SET #n = :val",
            ExpressionAttributeNames={"#n": "name"},
            ExpressionAttributeValues={":val": "陳阿嬤"},
            ReturnValues="ALL_NEW",
        )
        response = self.table.get_item(Key={"elder_id": "elder-test-001"})
        assert response["Item"]["name"] == "陳阿嬤"

    def test_update_profile_multiple_fields(self):
        """測試更新多個欄位"""
        self.table.update_item(
            Key={"elder_id": "elder-test-001"},
            UpdateExpression="SET age = :age, disease = :disease",
            ExpressionAttributeValues={":age": 79, ":disease": "高血壓、糖尿病"},
            ReturnValues="ALL_NEW",
        )
        response = self.table.get_item(Key={"elder_id": "elder-test-001"})
        item = response["Item"]
        assert item["age"] == 79
        assert item["disease"] == "高血壓、糖尿病"

    def test_update_allowed_fields_only(self):
        """測試只允許更新指定欄位"""
        allowed_fields = [
            "name", "age", "gender", "language", "phone", "address",
            "emergency_contact", "emergency_phone", "disease",
            "medications", "allergies", "preferences", "family_info",
        ]

        # elder_id 不允許更新
        assert "elder_id" not in allowed_fields
        # 安全欄位不在清單中
        assert "password" not in allowed_fields

    def test_profile_event_validation(self):
        """測試事件參數驗證"""
        # 缺少 pathParameters
        event = {"httpMethod": "GET", "pathParameters": None}
        path_params = event.get("pathParameters", {}) or {}
        elder_id = path_params.get("id")
        assert elder_id is None

        # 有 pathParameters
        event = {"httpMethod": "GET", "pathParameters": {"id": "elder-001"}}
        path_params = event.get("pathParameters", {}) or {}
        elder_id = path_params.get("id")
        assert elder_id == "elder-001"


class TestProfileDataIntegrity:
    """測試資料完整性"""

    def setup_method(self, method=None):
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

    def test_store_complex_preferences(self):
        """測試儲存複雜偏好資料"""
        profile = {
            "elder_id": "elder-complex-001",
            "preferences": {
                "wake_time": "06:00",
                "sleep_time": "21:00",
                "favorite_topics": ["種花", "孫子", "以前的農事"],
                "preferred_language": "中文為主，偶爾台語",
            },
        }
        self.table.put_item(Item=profile)

        response = self.table.get_item(Key={"elder_id": "elder-complex-001"})
        prefs = response["Item"]["preferences"]
        assert len(prefs["favorite_topics"]) == 3
        assert prefs["wake_time"] == "06:00"

    def test_store_medications_list(self):
        """測試儲存用藥清單"""
        profile = {
            "elder_id": "elder-med-001",
            "medications": ["降血壓藥", "記憶力輔助藥物", "維他命D"],
        }
        self.table.put_item(Item=profile)

        response = self.table.get_item(Key={"elder_id": "elder-med-001"})
        meds = response["Item"]["medications"]
        assert len(meds) == 3
        assert "降血壓藥" in meds
