import collections
from itertools import product

# --- 상수 ---
CATEGORIES = {
    "aces": "1의 합", "twos": "2의 합", "threes": "3의 합",
    "fours": "4의 합", "fives": "5의 합", "sixes": "6의 합",
    "four_of_a_kind": "포카드", "full_house": "풀하우스",
    "little_straight": "리틀 스트레이트", "big_straight": "빅 스트레이트",
    "yacht": "야치", "choice": "초이스"
}

# --- 메모이제이션 캐시 ---
# 계산된 기대값을 저장하여 중복 계산을 방지합니다.
EV_CACHE = {}

# --- 핵심 점수 계산 로직 ---
def _find_longest_sequence(dice):
    if not dice:
        return 0
    unique_sorted_dice = sorted(list(set(dice)))
    max_len = 0
    current_len = 0
    if not unique_sorted_dice:
        return 0
        
    max_len = 1
    current_len = 1
    for i in range(1, len(unique_sorted_dice)):
        if unique_sorted_dice[i] == unique_sorted_dice[i-1] + 1:
            current_len += 1
        else:
            max_len = max(max_len, current_len)
            current_len = 1
    max_len = max(max_len, current_len)
    return max_len

def calculate_score(category, dice):
    """주어진 카테고리와 주사위 값에 따라 점수를 계산합니다. (스트레이트 로직 수정) """
    counts = collections.Counter(dice)
    if category == "aces": return counts[1] * 1
    if category == "twos": return counts[2] * 2
    if category == "threes": return counts[3] * 3
    if category == "fours": return counts[4] * 4
    if category == "fives": return counts[5] * 5
    if category == "sixes": return counts[6] * 6
    if category == "four_of_a_kind":
        if any(c >= 4 for c in counts.values()): return sum(dice)
    if category == "full_house":
        if sorted(counts.values()) == [2, 3]: return sum(dice)
    if category == "little_straight":
        if _find_longest_sequence(dice) >= 4: return 15
    if category == "big_straight":
        if _find_longest_sequence(dice) >= 5: return 30
    if category == "yacht":
        if 5 in counts.values(): return 50
    if category == "choice":
        return sum(dice)
    return 0

def calculate_best_score_for_hand(dice, available_categories):
    """주어진 주사위 조합으로 얻을 수 있는 가장 높은 점수와 카테고리를 찾습니다."""
    if not available_categories:
        return 0, None
    
    return max(
        ((score, category) for category in available_categories if (score := calculate_score(category, dice)) is not None),
        key=lambda item: item[0],
        default=(0, None)
    )

# --- AI 추천 로직 ---

def get_heuristic_hold_candidates(dice, available_categories):
    """
    휴리스틱(경험적 규칙)을 사용해 유망한 홀드 후보군을 생성합니다.
    사용 가능한 카테고리를 참조하여 관련 없는 후보는 생성하지 않습니다.
    """
    candidates = set()
    counts = collections.Counter(dice)
    unique_dice = sorted(list(set(dice)))
    
    # 규칙 1: 동일 숫자 묶음 (페어, 트리플 등) - 항상 유용
    for val, count in counts.items():
        if count >= 2:
            candidates.add(tuple(sorted([d for d in dice if d == val])))

    # 규칙 2: 스트레이트 가능성 (관련 카테고리가 남아있을 때만!)
    if 'little_straight' in available_categories or 'big_straight' in available_categories:
        if len(unique_dice) >= 3: # 최소 3개는 되어야 가능성 타진
            # 4개 묶음 찾기
            if len(unique_dice) >= 4:
                for i in range(len(unique_dice) - 3):
                    if unique_dice[i+3] - unique_dice[i] <= 4:
                        candidates.add(tuple(unique_dice[i:i+4]))
            # 3개 묶음 찾기
            for i in range(len(unique_dice) - 2):
                if unique_dice[i+2] - unique_dice[i] <= 3:
                    candidates.add(tuple(unique_dice[i:i+3]))

    # 규칙 3: 높은 숫자 (다른 조합이 없을 때)
    if not candidates and not any(c >= 2 for c in counts.values()):
        if 6 in unique_dice: candidates.add((6,))
        if 5 in unique_dice: candidates.add((5,))

    # 규칙 4: 모두 다시 굴리기
    candidates.add(tuple())

    return list(candidates)

def calculate_expected_value(hold_dice, available_categories):
    """
    특정 주사위를 홀드하고 나머지를 굴렸을 때의 점수 기대값을 계산합니다.
    성능을 위해 '한 번 더 굴렸을 때'만 가정합니다.
    """
    num_to_roll = 5 - len(hold_dice)
    if num_to_roll == 0:
        return calculate_best_score_for_hand(hold_dice, available_categories)[0]

    # 캐시 확인
    cache_key = (tuple(sorted(hold_dice)), tuple(sorted(available_categories)))
    if cache_key in EV_CACHE:
        return EV_CACHE[cache_key]

    total_score = 0
    # product(range(1, 7), repeat=num_to_roll)는 모든 재굴림 결과를 생성합니다.
    outcomes = list(product(range(1, 7), repeat=num_to_roll))
    num_outcomes = len(outcomes)

    for result in outcomes:
        final_hand = list(hold_dice) + list(result)
        total_score += calculate_best_score_for_hand(final_hand, available_categories)[0]
    
    expected_value = total_score / num_outcomes
    EV_CACHE[cache_key] = expected_value  # 결과를 캐시에 저장
    return expected_value

def get_ai_recommendation(dice, available_categories, rolls_left):
    """
    메인 AI 함수. 지금 점수를 기록할지, 아니면 다시 굴릴지를 결정합니다.
    """
    # 1. 즉시 점수를 기록할 경우의 가치 계산
    score_now, category_now = calculate_best_score_for_hand(dice, available_categories)
    
    best_value = score_now
    best_action = {"type": "RECORD", "category": category_now, "value": score_now}

    # 2. 굴릴 기회가 남았다면, 홀드/재굴림 옵션의 가치를 평가
    if rolls_left > 0:
        hold_candidates = get_heuristic_hold_candidates(dice, available_categories)
        
        for hold_option in hold_candidates:
            ev = calculate_expected_value(hold_option, available_categories)
            
            if ev > best_value:
                best_value = ev
                best_action = {"type": "HOLD", "dice_to_hold": hold_option, "value": ev}

    # 3. 계산된 최적의 행동을 사용자에게 친숙한 문장으로 변환
    action_type = best_action["type"]
    if action_type == "RECORD":
        text = f"**추천: 점수 기록**\n\n현재 점수({best_action['value']:.1f}점)가 재굴림 기대값보다 높습니다. `{CATEGORIES.get(best_action['category'])}`에 기록하세요."
        if rolls_left == 0:
            text = f"**마지막 굴림입니다**\n\n`{CATEGORIES.get(best_action['category'])}`에 기록하여 **{best_action['value']:.1f}점**을 획득하세요."

    elif action_type == "HOLD":
        hold_dice = best_action['dice_to_hold']
        if not hold_dice:
            text = f"**추천: 모두 다시 굴리기**\n\n현재 조합이 좋지 않습니다. 모든 주사위를 다시 굴려보세요. (기대값: {best_action['value']:.1f}점)"
        else:
            hold_str = ", ".join(map(str, hold_dice))
            text = f"**추천: 주사위 홀드**\n\n`{hold_str}`을(를) 홀드하고 나머지를 다시 굴리세요. (기대값: {best_action['value']:.1f}점)"
    
    return {"recommendation_text": text}