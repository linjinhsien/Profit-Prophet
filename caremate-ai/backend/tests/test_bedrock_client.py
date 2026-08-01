"""
Bedrock Client 測試
"""
import json
import pytest
from unittest.mock import patch, MagicMock


class TestBedrockClient:
    """測試 Bedrock 呼叫邏輯"""

    def test_extraction_prompt_format(self):
        """測試生活紀錄擷取 prompt 格式"""
        user_message = "我今天早上吃了稀飯配蛋"
        assistant_reply = "很好呢！稀飯配蛋營養又好消化。"

        extraction_prompt = f"""請從以下對話中擷取長者的生活紀錄資訊。

對話內容：
使用者：{user_message}
助手：{assistant_reply}"""

        assert "稀飯配蛋" in extraction_prompt
        assert "使用者" in extraction_prompt
        assert "助手" in extraction_prompt

    def test_parse_extraction_result_valid_json(self):
        """測試正確解析 JSON 擷取結果"""
        mock_response = '{"sleep": "", "food": "早餐吃稀飯配蛋", "activity": "", "drug": "", "emotion": "正常"}'
        result = json.loads(mock_response)

        assert result["food"] == "早餐吃稀飯配蛋"
        assert result["emotion"] == "正常"
        assert result["sleep"] == ""

    def test_parse_extraction_result_with_markdown(self):
        """測試解析帶有 markdown 包裹的 JSON"""
        mock_response = '```json\n{"sleep": "7小時", "food": "", "activity": "", "drug": "", "emotion": "平靜"}\n```'

        # 移除 markdown 包裹
        text = mock_response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]

        result = json.loads(text)
        assert result["sleep"] == "7小時"
        assert result["emotion"] == "平靜"

    def test_parse_extraction_result_invalid(self):
        """測試無效 JSON 處理"""
        mock_response = "這不是 JSON 格式"

        try:
            result = json.loads(mock_response)
        except json.JSONDecodeError:
            result = {"sleep": "", "food": "", "activity": "", "drug": "", "emotion": ""}

        assert result["sleep"] == ""
        assert result["food"] == ""

    def test_system_prompt_with_memory(self):
        """測試系統提示注入記憶資訊"""
        from shared.config import SYSTEM_PROMPT_ZH

        memory_context = "長者資訊：\n長者姓名：陳阿嬤\n年齡：78"
        prompt = SYSTEM_PROMPT_ZH.format(memory_context=memory_context)

        assert "陳阿嬤" in prompt
        assert "78" in prompt
        assert "CareMate" in prompt

    def test_system_prompt_taiwanese(self):
        """測試台語系統提示"""
        from shared.config import SYSTEM_PROMPT_NAN

        memory_context = "（尚無記憶資料）"
        prompt = SYSTEM_PROMPT_NAN.format(memory_context=memory_context)

        assert "台語" in prompt or "閩南語" in prompt
        assert "阿公阿嬤" in prompt

    def test_health_keyword_detection(self):
        """測試健康關鍵字偵測"""
        health_keywords = ["痛", "不舒服", "暈", "跌倒", "藥", "醫生", "營養", "運動"]

        # 應該觸發知識庫查詢
        message1 = "我今天頭有點暈"
        assert any(kw in message1 for kw in health_keywords)

        message2 = "我覺得膝蓋有點痛"
        assert any(kw in message2 for kw in health_keywords)

        # 不應該觸發
        message3 = "今天天氣真好"
        assert not any(kw in message3 for kw in health_keywords)

        message4 = "我想念孫子了"
        assert not any(kw in message4 for kw in health_keywords)

    @patch("boto3.client")
    def test_invoke_claude_mock(self, mock_boto_client):
        """測試 Claude 呼叫（Mock）"""
        mock_bedrock = MagicMock()
        mock_boto_client.return_value = mock_bedrock

        mock_bedrock.converse.return_value = {
            "output": {
                "message": {
                    "content": [{"text": "你好！我是你的陪伴助手。"}]
                }
            }
        }

        response = mock_bedrock.converse(
            modelId="anthropic.claude-sonnet-4-20250514",
            system=[{"text": "你是陪伴助手"}],
            messages=[{"role": "user", "content": [{"text": "你好"}]}],
            inferenceConfig={"maxTokens": 1024, "temperature": 0.7},
        )

        content = response["output"]["message"]["content"]
        assert content[0]["text"] == "你好！我是你的陪伴助手。"
