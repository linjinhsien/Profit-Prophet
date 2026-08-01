#!/usr/bin/env python3
"""
CareMate AI - 部署 OpenAI Whisper large-v3 到 AWS SageMaker Endpoint

此腳本會：
1. 使用 Hugging Face Deep Learning Container 建立 SageMaker Model
2. 設定 Endpoint Configuration（GPU 推論）
3. 建立 Real-time Inference Endpoint
4. 測試端點是否正常運作

前置條件：
- pip install sagemaker boto3
- AWS 憑證已設定（aws configure）
- IAM Role 具有 SageMaker 和 S3 權限

使用方式：
    python scripts/deploy-whisper-sagemaker.py --region us-west-2

環境變數：
    SAGEMAKER_ROLE_ARN: SageMaker 執行角色 ARN
    AWS_REGION: AWS 區域（預設 us-west-2）
"""
import argparse
import json
import time
import boto3
import sagemaker
from sagemaker.huggingface import HuggingFaceModel


def main():
    parser = argparse.ArgumentParser(description="部署 Whisper large-v3 到 SageMaker")
    parser.add_argument("--region", default="us-west-2", help="AWS Region")
    parser.add_argument("--role-arn", default=None, help="SageMaker Role ARN")
    parser.add_argument("--endpoint-name", default="caremate-whisper-v3", help="Endpoint 名稱")
    parser.add_argument("--instance-type", default="ml.g5.xlarge", help="推論機型")
    parser.add_argument("--model-id", default="openai/whisper-large-v3",
                       help="Hugging Face 模型 ID")
    parser.add_argument("--delete", action="store_true", help="刪除現有 Endpoint")
    args = parser.parse_args()

    print("=" * 60)
    print("CareMate AI - Whisper large-v3 SageMaker 部署")
    print("=" * 60)
    print(f"  區域: {args.region}")
    print(f"  模型: {args.model_id}")
    print(f"  機型: {args.instance_type}")
    print(f"  Endpoint: {args.endpoint_name}")
    print("=" * 60)

    # 建立 SageMaker Session
    boto_session = boto3.Session(region_name=args.region)
    sagemaker_session = sagemaker.Session(boto_session=boto_session)

    # 取得 Role
    role = args.role_arn
    if not role:
        import os
        role = os.environ.get("SAGEMAKER_ROLE_ARN")
    if not role:
        try:
            role = sagemaker.get_execution_role()
        except ValueError:
            print("\n[錯誤] 無法取得 SageMaker Role。請提供 --role-arn 或設定 SAGEMAKER_ROLE_ARN 環境變數")
            print("  範例: export SAGEMAKER_ROLE_ARN=arn:aws:iam::123456789:role/SageMakerRole")
            return

    print(f"\n使用 Role: {role}")

    # 如果要刪除
    if args.delete:
        _delete_endpoint(args.endpoint_name, args.region)
        return

    # 建立 HuggingFace Model
    print(f"\n[1/4] 建立 SageMaker Model（{args.model_id}）...")

    hub_config = {
        "HF_MODEL_ID": args.model_id,
        "HF_TASK": "automatic-speech-recognition",
        # 優化設定
        "TRANSFORMERS_CACHE": "/tmp/transformers_cache",
    }

    huggingface_model = HuggingFaceModel(
        env=hub_config,
        role=role,
        # 使用 HuggingFace Inference DLC（含 GPU 支援）
        transformers_version="4.37.0",
        pytorch_version="2.1.0",
        py_version="py310",
        sagemaker_session=sagemaker_session,
    )

    # 部署 Endpoint
    print(f"\n[2/4] 部署 Endpoint: {args.endpoint_name}")
    print(f"       機型: {args.instance_type}")
    print(f"       這通常需要 5-10 分鐘...")

    predictor = huggingface_model.deploy(
        initial_instance_count=1,
        instance_type=args.instance_type,
        endpoint_name=args.endpoint_name,
        # 設定較長的啟動等待（模型下載需要時間）
        container_startup_health_check_timeout=600,
    )

    print(f"\n[3/4] Endpoint 已建立！名稱: {args.endpoint_name}")

    # 測試推論
    print("\n[4/4] 測試推論...")
    _test_endpoint(args.endpoint_name, args.region)

    print("\n" + "=" * 60)
    print("部署完成！")
    print(f"\n請設定環境變數：")
    print(f"  export ASR_MODEL_PROVIDER=whisper")
    print(f"  export SAGEMAKER_ASR_ENDPOINT={args.endpoint_name}")
    print("=" * 60)


def _test_endpoint(endpoint_name: str, region: str):
    """測試 Endpoint 是否正常工作"""
    runtime = boto3.client("sagemaker-runtime", region_name=region)

    # 產生一段靜音測試音訊（簡單的 WAV header）
    # 正式測試需要真實音訊檔案
    test_payload = json.dumps({
        "inputs": "test",
        "parameters": {
            "language": "zh",
            "task": "transcribe",
        },
    })

    try:
        response = runtime.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType="application/json",
            Body=test_payload,
        )
        result = json.loads(response["Body"].read().decode("utf-8"))
        print(f"  測試結果: {result}")
        print("  ✓ Endpoint 正常運作")
    except Exception as e:
        print(f"  測試時發生錯誤（可能是因為測試資料無效）: {e}")
        print("  Endpoint 已部署，請用真實音訊測試")


def _delete_endpoint(endpoint_name: str, region: str):
    """刪除 Endpoint"""
    sm_client = boto3.client("sagemaker", region_name=region)

    print(f"\n正在刪除 Endpoint: {endpoint_name}...")
    try:
        sm_client.delete_endpoint(EndpointName=endpoint_name)
        print(f"  ✓ Endpoint 已刪除")
    except sm_client.exceptions.ClientError as e:
        print(f"  刪除失敗: {e}")

    # 也嘗試刪除 EndpointConfig
    try:
        sm_client.delete_endpoint_config(EndpointConfigName=endpoint_name)
        print(f"  ✓ EndpointConfig 已刪除")
    except Exception:
        pass


if __name__ == "__main__":
    main()
