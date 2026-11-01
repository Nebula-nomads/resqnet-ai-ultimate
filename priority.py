from typing import List, Optional, Tuple

# deterministic scoring weights
W_THREAT = 0.4
W_PEOPLE = 0.3
W_VULN = 0.2
W_SEVERITY = 0.1

# people count at which the "people" sub-score maxes out
PEOPLE_CAP = 25


def _subscore_threat(immediate_threats: Optional[List[str]]) -> float:
    # FIX: AI/fallback parser may return None -> was crashing with TypeError
    if not immediate_threats:
        return 0.2
    threat_words = {"life", "fatal", "critical", "danger", "risk", "severe", "fire", "trapped"}
    hit = any(any(word in t.lower() for word in threat_words) for t in immediate_threats)
    return 1.0 if hit else 0.5


def _subscore_people(people: Optional[int]) -> float:
    if not people:
        return 0.0
    return min(people / float(PEOPLE_CAP), 1.0)


def _subscore_vulnerable(vuln: Optional[List[str]]) -> float:
    if not vuln:
        return 0.0
    return min(len(vuln) * 0.2, 1.0)


def _subscore_severity(category: Optional[str]) -> float:
    mapping = {
        "fire": 1.0,
        "flood": 0.9,
        "earthquake": 1.0,
        "medical": 0.8,
        "infrastructure": 0.6,
    }
    return mapping.get(category.lower(), 0.5) if category else 0.5


def score_priority(
    category: Optional[str],
    immediate_threats: Optional[List[str]],
    people_affected: Optional[int],
    vulnerable_people: Optional[List[str]],
) -> Tuple[int, str, str]:
    """Return (score 0-100, label, explanation)"""
    t = _subscore_threat(immediate_threats)
    p = _subscore_people(people_affected)
    v = _subscore_vulnerable(vulnerable_people)
    s = _subscore_severity(category)
    weighted = (t * W_THREAT + p * W_PEOPLE + v * W_VULN + s * W_SEVERITY)
    score = int(round(weighted * 100))
    if score >= 80:
        label = "Critical"
    elif score >= 60:
        label = "High"
    elif score >= 40:
        label = "Medium"
    else:
        label = "Low"
    explanation = (
        f"Threat={t:.2f}, People={p:.2f}, Vulnerable={v:.2f}, Severity={s:.2f} "
        f"=> weighted={weighted:.2f}"
    )
    return score, label, explanation
