#!/usr/bin/env python3
"""
CareMate AI - 建立 Amazon Transcribe 台語/客語自訂詞彙庫

Amazon Transcribe Custom Vocabulary 可提升特定詞彙的辨識準確度。
透過加入台語、客語常用詞彙，讓 zh-TW 模型更能正確辨識這些用語。

使用方式：
    python scripts/create-custom-vocabulary.py --region us-west-2

前置條件：
    - AWS 憑證已設定
    - 有 transcribe:CreateVocabulary 權限
"""
import argparse
import boto3
import time


# ============================================================
# 台語常用詞彙（閩南語漢字寫法）
# ============================================================
TAIWANESE_PHRASES = [
    # 日常問候
    "食飽未", "今仔日", "透早好", "暗暝好", "下晝好",
    "按怎", "好無", "敢有", "是按怎",

    # 飲食相關
    "食飯", "食飽", "食早頓", "食中晝", "食暗頓",
    "好料", "燒餅", "肉粽", "鹹粥", "菜脯蛋",
    "滷肉飯", "魯肉飯", "虱目魚", "蚵仔煎",

    # 睡眠相關
    "睏覺", "睏袂去", "歇困", "歇睏",
    "睏甲", "睏好", "透早起來",

    # 身體健康
    "袂爽快", "頭殼痛", "腹肚痛", "身體好無",
    "有食藥無", "藥仔", "食藥仔",
    "血壓", "血糖", "頭暈",

    # 活動
    "行路", "散步", "走路", "看電視",
    "泡茶", "下棋", "唱歌", "種花",

    # 情緒
    "歡喜", "袂爽", "艱苦", "心情好",
    "心情袂好", "想厝", "孤單",

    # 家人稱呼
    "阿公", "阿嬤", "阿爸", "阿母",
    "孫仔", "媳婦", "囝仔", "厝內人",

    # 常用動詞/副詞
    "欲", "毋", "袂", "嘛", "攏", "閣", "較",
    "佮", "遮", "彼", "啥物", "代誌",
    "會當", "無法度", "真", "足",

    # 時間
    "昨昏", "明仔載", "逐工", "逐日",
    "透早", "中晝", "下晡", "暗暝",

    # 長照專用
    "照顧者", "看護", "復健", "輪椅",
    "拐仔", "助行器", "尿布",
]

# ============================================================
# 客語常用詞彙（四縣腔為主）
# ============================================================
HAKKA_PHRASES = [
    # 日常問候
    "食飯仔", "睡目", "行路仔", "看電視仔",
    "恁好無", "今晡日", "天光好", "暗晡好",

    # 飲食
    "食朝", "食晝", "食夜", "食飽了",
    "粄條", "客家菜", "薑絲大腸", "梅干扣肉",

    # 身體
    "身體好無", "頭那痛", "肚屎痛",
    "食藥仔", "看醫生",

    # 家人
    "阿公", "阿婆", "阿爸", "阿姆",
    "孫仔", "新婦", "細人仔",

    # 活動
    "散步仔", "唱山歌", "種菜", "泡茶",

    # 情緒
    "歡喜", "毋好", "想家", "寂寞",
]

# ============================================================
# 長照專業詞彙
# ============================================================
CARE_PHRASES = [
    # 醫療
    "降血壓藥", "降血糖藥", "安眠藥", "止痛藥",
    "胰島素", "抗憂鬱藥", "記憶力藥物",
    "帕金森", "失智症", "骨質疏鬆",
    "退化性關節炎", "高血壓", "糖尿病",
    "白內障", "攝護腺", "慢性腎臟病",

    # 照護
    "日照中心", "居家服務", "長期照護",
    "照護計畫", "生活紀錄", "每日摘要",
    "互動陪伴", "情緒支持",

    # 生活紀錄
    "飲食紀錄", "睡眠品質", "運動時間",
    "服藥紀錄", "情緒狀態", "血壓量測",
]


def main():
    parser = argparse.ArgumentParser(description="建立台語/客語自訂詞彙庫")
    parser.add_argument("--region", default="us-west-2", help="AWS Region")
    parser.add_argument("--vocab-name", default="caremate-taiwanese-hakka-vocab",
                       help="詞彙庫名稱")
    parser.add_argument("--delete", action="store_true", help="刪除現有詞彙庫")
    parser.add_argument("--list", action="store_true", help="列出所有詞彙庫")
    args = parser.parse_args()

    transcribe = boto3.client("transcribe", region_name=args.region)

    if args.list:
        _list_vocabularies(transcribe)
        return

    if args.delete:
        _delete_vocabulary(transcribe, args.vocab_name)
        return

    # 合併所有詞彙（去重複）
    all_phrases = list(set(TAIWANESE_PHRASES + HAKKA_PHRASES + CARE_PHRASES))
    all_phrases.sort()

    print("=" * 60)
    print("CareMate AI - 建立自訂詞彙庫")
    print("=" * 60)
    print(f"  區域: {args.region}")
    print(f"  名稱: {args.vocab_name}")
    print(f"  台語詞彙: {len(TAIWANESE_PHRASES)} 個")
    print(f"  客語詞彙: {len(HAKKA_PHRASES)} 個")
    print(f"  長照詞彙: {len(CARE_PHRASES)} 個")
    print(f"  合計（去重複）: {len(all_phrases)} 個")
    print("=" * 60)

    # 檢查是否已存在
    try:
        existing = transcribe.get_vocabulary(VocabularyName=args.vocab_name)
        status = existing.get("VocabularyState")
        print(f"\n[注意] 詞彙庫 '{args.vocab_name}' 已存在（狀態: {status}）")
        print("  使用 --delete 刪除後重建，或選擇不同名稱")

        # 如果是 FAILED 狀態，自動刪除重建
        if status == "FAILED":
            print("  狀態為 FAILED，自動刪除重建...")
            _delete_vocabulary(transcribe, args.vocab_name)
            time.sleep(2)
        else:
            return
    except transcribe.exceptions.BadRequestException:
        pass  # 不存在，繼續建立
    except Exception as e:
        if "Not found" in str(e) or "does not exist" in str(e):
            pass
        else:
            raise

    # 建立詞彙庫
    print(f"\n建立詞彙庫中...")
    try:
        transcribe.create_vocabulary(
            VocabularyName=args.vocab_name,
            LanguageCode="zh-TW",
            Phrases=all_phrases,
        )
        print(f"  ✓ 已提交建立請求")
    except Exception as e:
        print(f"  ✗ 建立失敗: {e}")
        return

    # 等待完成
    print("\n等待詞彙庫建立完成（通常需要 2-5 分鐘）...")
    max_wait = 300
    elapsed = 0
    while elapsed < max_wait:
        resp = transcribe.get_vocabulary(VocabularyName=args.vocab_name)
        state = resp.get("VocabularyState")

        if state == "READY":
            print(f"\n  ✓ 詞彙庫建立完成！")
            print(f"    名稱: {args.vocab_name}")
            print(f"    語言: zh-TW")
            print(f"    狀態: READY")
            break
        elif state == "FAILED":
            reason = resp.get("FailureReason", "Unknown")
            print(f"\n  ✗ 建立失敗: {reason}")
            break
        else:
            print(f"    狀態: {state}... ({elapsed}s)")
            time.sleep(10)
            elapsed += 10

    if elapsed >= max_wait:
        print("\n  ⚠ 等待逾時，請稍後用 --list 確認狀態")

    # 輸出使用說明
    print("\n" + "=" * 60)
    print("使用方式：")
    print(f"  在 Transcribe 任務中指定 VocabularyName='{args.vocab_name}'")
    print("\n  或設定環境變數：")
    print(f"  export TRANSCRIBE_VOCABULARY_NAME={args.vocab_name}")
    print("=" * 60)


def _list_vocabularies(transcribe):
    """列出所有詞彙庫"""
    resp = transcribe.list_vocabularies(StateEquals="READY")
    vocabs = resp.get("Vocabularies", [])

    if not vocabs:
        print("目前沒有已建立的詞彙庫")
        return

    print(f"\n已建立的詞彙庫（{len(vocabs)} 個）：")
    for v in vocabs:
        print(f"  - {v['VocabularyName']} ({v['LanguageCode']}) - {v['VocabularyState']}")


def _delete_vocabulary(transcribe, name):
    """刪除詞彙庫"""
    try:
        transcribe.delete_vocabulary(VocabularyName=name)
        print(f"  ✓ 已刪除詞彙庫: {name}")
    except Exception as e:
        print(f"  刪除失敗: {e}")


if __name__ == "__main__":
    main()
