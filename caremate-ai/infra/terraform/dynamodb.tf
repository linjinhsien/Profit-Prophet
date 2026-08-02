###############################################################################
# DynamoDB Tables
###############################################################################

# 長者基本資料表
resource "aws_dynamodb_table" "elder_profile" {
  name         = "${var.project_name}_elder_profile"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "elder_id"

  attribute {
    name = "elder_id"
    type = "S"
  }

  # 啟用加密
  server_side_encryption {
    enabled = true
  }

  # 啟用時間點回復
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-elder-profile"
  }
}

# 長者記憶/對話紀錄表
resource "aws_dynamodb_table" "elder_memory" {
  name         = "${var.project_name}_elder_memory"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "elder_id"
  range_key    = "timestamp"

  attribute {
    name = "elder_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  # 啟用加密
  server_side_encryption {
    enabled = true
  }

  # 啟用時間點回復
  point_in_time_recovery {
    enabled = true
  }

  # TTL - 自動清除 90 天以上的記錄
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-elder-memory"
  }
}
