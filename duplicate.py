import os
import json
import re
from typing import List, Dict

from rapidfuzz import fuzz
from geopy.distance import geodesic

from ..db.models import Incident
from sqlalchemy.orm import Session

# Simple geographic proximity: <0.5 km
PROXIMITY_KM = 0.5
# Text similarity threshold
SIMILARITY_THRESHOLD = 80

def find_duplicates(db: Session, analysis: Dict) -> List[int]:
    """Return list of incident IDs that are potential duplicates.
    The `analysis` dict is the result of AI or fallback parsing.
    """
    candidates = []
    latitude = analysis.get("latitude")
    longitude = analysis.get("longitude")
    text = analysis.get("description") or ""
    category = (analysis.get("category") or "").lower()
    # Time window is not stored in this simple version; we consider all records.
    for inc in db.query(Incident).filter(Incident.is_duplicate == False).all():
        # Category match
        if category and inc.category and inc.category.lower() != category:
            continue
        # Geographic check if both have coords
        if latitude and longitude and inc.latitude and inc.longitude:
            dist = geodesic((latitude, longitude), (inc.latitude, inc.longitude)).km
            if dist > PROXIMITY_KM:
                continue
        # Text similarity check on description (fallback to raw_report if missing)
        target_text = inc.description or inc.raw_report
        if not target_text:
            continue
        similarity = fuzz.ratio(text, target_text)
        if similarity < SIMILARITY_THRESHOLD:
            continue
        candidates.append(inc.id)
    return candidates
