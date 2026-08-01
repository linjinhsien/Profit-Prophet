"""
pytest 共用 fixtures
使用 moto 模擬 AWS 服務
"""
import os
import sys
import pytest
import boto3
from moto import mock_aws

# 加入專案路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# 設定測試環境變數
os.environ["AWS_DEFAULT_REGION"] = "us-west-2"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SECURITY_TOKEN"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"
os.environ["TABLE_ELDER_PROFILE"] = "test_elder_profile"
os.environ["TABLE_ELDER_MEMORY"] = "test_elder_memory"
os.environ["S3_AUDIO_BUCKET"] = "test-audio-bucket"
os.environ["BEDROCK_MODEL_ID"] = "anthropic.claude-sonnet-4-20250514"
os.environ["BEDROCK_KB_ID"] = ""


@pytest.fixture
def aws_credentials():
    """Mock AWS 憑證"""
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-west-2"


@pytest.fixture
def dynamodb_tables(aws_credentials):
    """建立模擬 DynamoDB 表"""
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-west-2")

        # 建立 elder_profile 表
        dynamodb.create_table(
            TableName="test_elder_profile",
            KeySchema=[
                {"AttributeName": "elder_id", "KeyType": "HASH"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "elder_id", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # 建立 elder_memory 表
        dynamodb.create_table(
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

        yield dynamodb


@pytest.fixture
def s3_bucket(aws_credentials):
    """建立模擬 S3 Bucket"""
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-west-2")
        s3.create_bucket(
            Bucket="test-audio-bucket",
            CreateBucketConfiguration={"LocationConstraint": "us-west-2"},
        )
        yield s3


@pytest.fixture
def sample_elder_profile():
    """範例長者資料"""
    return {
        "elder_id": "elder-test-001",
        "name": "測試阿嬤",
        "age": 78,
        "gender": "女",
        "language": "zh-TW",
        "phone": "0912-345-678",
        "address": "台東縣池上鄉",
        "disease": "高血壓、輕度失智",
        "medications": ["降血壓藥（每日早晚各一次）"],
        "allergies": ["海鮮過敏"],
        "emergency_contact": "陳小明（孫子）",
        "emergency_phone": "0987-654-321",
        "preferences": {
            "wake_time": "06:00",
            "sleep_time": "21:00",
            "favorite_topics": ["種花", "孫子"],
        },
        "family_info": {
            "children": "一子一女",
            "grandchildren": "三個孫子",
        },
    }


@pytest.fixture
def sample_memory_records():
    """範例對話記憶"""
    return [
        {
            "elder_id": "elder-test-001",
            "timestamp": "2026-07-30T08:30:00Z",
            "question": "我今天早上吃了稀飯配蛋",
            "answer": "很好呢！稀飯配蛋營養又好消化。",
            "sleep": "",
            "food": "早餐吃稀飯配蛋",
            "activity": "",
            "drug": "",
            "emotion": "正常",
        },
        {
            "elder_id": "elder-test-001",
            "timestamp": "2026-07-30T10:00:00Z",
            "question": "我剛剛去散步了",
            "answer": "散步很好呢！走了多久？",
            "sleep": "",
            "food": "",
            "activity": "散步",
            "drug": "",
            "emotion": "開心",
        },
        {
            "elder_id": "elder-test-001",
            "timestamp": "2026-07-29T22:00:00Z",
            "question": "我今天有吃藥了",
            "answer": "很好，記得按時吃藥對身體好。",
            "sleep": "昨晚睡了7小時",
            "food": "",
            "activity": "",
            "drug": "降血壓藥已服用",
            "emotion": "平靜",
        },
    ]


@pytest.fixture
def mock_chat_event():
    """模擬 API Gateway Chat 事件"""
    return {
        "httpMethod": "POST",
        "headers": {"Content-Type": "application/json"},
        "body": '{"elder_id": "elder-test-001", "message": "你好，我今天吃了稀飯", "language": "zh-TW"}',
        "pathParameters": None,
        "queryStringParameters": None,
    }


@pytest.fixture
def mock_profile_get_event():
    """模擬 API Gateway GET Profile 事件"""
    return {
        "httpMethod": "GET",
        "headers": {"Content-Type": "application/json"},
        "body": None,
        "pathParameters": {"id": "elder-test-001"},
        "queryStringParameters": None,
    }


@pytest.fixture
def mock_memory_get_event():
    """模擬 API Gateway GET Memory 事件"""
    return {
        "httpMethod": "GET",
        "headers": {"Content-Type": "application/json"},
        "body": None,
        "pathParameters": {"id": "elder-test-001"},
        "queryStringParameters": None,
    }
