import os
import json
import re
from typing import Dict, Any, List

from ...db import models as db_models
from ...utils import priority

# Try to load Gemini API key from .env if present
from dotenv import load_dotenv
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# ---------- AI analysis ----------
def _fallback_parse(report: str, latitude: float = None, longitude: float = None, location_name: str = None) -> Dict[str, Any]:
    """Very simple rule‑based parser that extracts a few fields.
    It looks for keywords to guess category and extracts numbers for people.
    """
    category = None
    lower = report.lower()
    if "flood" in lower:
        category = "flood"
    elif "fire" in lower:
        category = "fire"
    elif "earthquake" in lower:
        category = "earthquake"
    elif "medical" in lower or "injury" in lower or "hospital" in lower:
        category = "medical"
    else:
        category = "other"

    # extract number of people (simple regex for digits)
    people_match = re.search(r"(\d+)\s+(?:people|persons|individuals)", lower)
    people = int(people_match.group(1)) if people_match else None

    # vulnerable groups – look for keywords
    vulnerable = []
    if "elderly" in lower:
        vulnerable.append("elderly")
    if "children" in lower:
        vulnerable.append("children")
    if "disabled" in lower:
        vulnerable.append("disabled")

    # immediate threats – very naive extraction
    threats = []
    for word in ["danger", "risk", "life", "fatal", "critical", "injury"]:
        if word in lower:
            threats.append(word)

    # resources – map category to static list (used later for recommendation)
    required_resources = []
    if category == "flood":
        required_resources = ["Rescue boats", "Life jackets", "Medical team"]
    elif category == "fire":
        required_resources = ["Fire engine", "Protective gear", "Medical team"]
    elif category == "earthquake":
        required_resources = ["Search‑and‑rescue team", "Medical supplies"]
    elif category == "medical":
        required_resources = ["Ambulance", "Paramedics"]

    analysis = {
        "category": category,
        "description": report.strip(),
        "location_name": location_name,
        "latitude": latitude,
        "longitude": longitude,
        "people_affected": people,
        "vulnerable_people": vulnerable if vulnerable else None,
        "immediate_threats": threats if threats else None,
        "required_resources": required_resources,
        "confidence": 0.7,  # lower confidence than Gemini
        "recommended_urgency": None,
    }
    return analysis

def analyze_report(report: str, latitude: float = None, longitude: float = None, location_name: str = None) -> Dict[str, Any]:
    """Send the report to Gemini if API key is available; otherwise use fallback.
    Returns a dict matching the fields used by the DB model.
    """
    if GEMINI_API_KEY:
        try:
            from google.generativeai import configure, GenerationConfig, GenerativeModel
            configure(api_key=GEMINI_API_KEY)
            model = GenerativeModel("gemini-1.5-pro")
            prompt = f"You are a disaster‑response analyst. Extract a JSON object with the following keys: category, description, location_name, latitude, longitude, people_affected, vulnerable_people, immediate_threats, required_resources, confidence (0‑1), recommended_urgency. If any field cannot be determined, set it to null. Do not fabricate coordinates. Report: {report}"
            response = model.generate_content(prompt, generation_config=GenerationConfig(temperature=0.2))
            # The model returns a string; attempt to parse JSON
            json_text = re.sub(r"^```(?:json)?|```$", "", response.text.strip(), flags=re.MULTILINE).strip()
            # Ensure it's a JSON object
            analysis = json.loads(json_text)
            # Ensure keys exist
            for key in ["category", "description", "location_name", "latitude", "longitude", "people_affected", "vulnerable_people", "immediate_threats", "required_resources", "confidence", "recommended_urgency"]:
                analysis.setdefault(key, None)
            return analysis
        except Exception as e:
            # If anything goes wrong, fall back
            print(f"Gemini call failed: {e}. Falling back to rule‑based parser.")
    # No API key or error – use fallback
    return _fallback_parse(report, latitude, longitude, location_name)

# ---------- Helper to convert DB model to API schema ----------
def incident_to_out(incident: db_models.Incident) -> Dict[str, Any]:
    return {
        "id": incident.id,
        "raw_report": incident.raw_report,
        "category": incident.category,
        "description": incident.description,
        "location_name": incident.location_name,
        "latitude": incident.latitude,
        "longitude": incident.longitude,
        "people_affected": incident.people_affected,
        "vulnerable_people": incident.vulnerable_people,
        "immediate_threats": incident.immediate_threats,
        "required_resources": incident.required_resources,
        "confidence": incident.confidence,
        "recommended_urgency": incident.recommended_urgency,
        "priority_score": incident.priority_score,
        "priority_label": incident.priority_label,
        "priority_explanation": incident.priority_explanation,
        "status": incident.status,
        "notes": incident.notes,
        "is_simulation": incident.is_simulation,
        "is_duplicate": bool(incident.is_duplicate),
        "duplicate_of": incident.duplicate_of,
        "created_at": incident.created_at.isoformat(),
        "updated_at": incident.updated_at.isoformat(),
    }

# ---------- Simulation mode ----------
SIMULATION_DATA = {
    "flood": [
        {
            "raw_report": "Flood water is rising near the riverbank, 20 people trapped in a community centre.",
            "category": "flood",
            "description": "Flood water rising near riverbank, 20 people trapped.",
            "location_name": "Riverbank Community Centre",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "people_affected": 20,
            "vulnerable_people": ["elderly"],
            "immediate_threats": ["life"],
            "required_resources": ["Rescue boats", "Life jackets", "Medical team"],
            "confidence": 0.9,
        }
    ],
    "earthquake": [
        {
            "raw_report": "Strong earthquake has collapsed several houses, 5 families need rescue.",
            "category": "earthquake",
            "description": "Earthquake collapsed houses, 5 families need rescue.",
            "location_name": "Downtown district",
            "latitude": 34.0522,
            "longitude": -118.2437,
            "people_affected": 25,
            "vulnerable_people": ["children", "elderly"],
            "immediate_threats": ["danger"],
            "required_resources": ["Search‑and‑rescue team", "Medical supplies"],
            "confidence": 0.95,
        }
    ],
    "fire": [
        {
            "raw_report": "Warehouse fire near the industrial park, smoke affecting nearby residents.",
            "category": "fire",
            "description": "Warehouse fire near industrial park.",
            "location_name": "Industrial Park",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "people_affected": 0,
            "vulnerable_people": [],
            "immediate_threats": ["fire"],
            "required_resources": ["Fire engine", "Protective gear", "Medical team"],
            "confidence": 0.92,
        }
    ],
    "infrastructure": [
        {
            "raw_report": "Power substation failure causing blackout in the north side of the city.",
            "category": "infrastructure",
            "description": "Power substation failure causing blackout.",
            "location_name": "North Substation",
            "latitude": 51.5074,
            "longitude": -0.1278,
            "people_affected": 0,
            "vulnerable_people": [],
            "immediate_threats": [],
            "required_resources": ["Repair crew", "Generators"],
            "confidence": 0.88,
        }
    ],
}

def run_simulation(scenario: str, db) -> List[db_models.Incident]:
    """Create incidents for the selected scenario and store them as simulation entries."""
    key = scenario.lower().strip()
    if key == "infrastructure_failure":  # name advertised by the API schema
        key = "infrastructure"
    data = SIMULATION_DATA.get(key)
    if not data:
        raise ValueError(f"Unknown scenario: {scenario}")
    created = []
    for item in data:
        # Score priority using deterministic engine
        score, label, explanation = priority.score_priority(
            item.get("category"),
            item.get("immediate_threats", []),
            item.get("people_affected", 0),
            item.get("vulnerable_people", []),
        )
        incident = db_models.Incident(
            raw_report=item["raw_report"],
            category=item.get("category"),
            description=item.get("description"),
            location_name=item.get("location_name"),
            latitude=item.get("latitude"),
            longitude=item.get("longitude"),
            people_affected=item.get("people_affected"),
            vulnerable_people=item.get("vulnerable_people"),
            immediate_threats=item.get("immediate_threats"),
            required_resources=item.get("required_resources"),
            confidence=item.get("confidence"),
            recommended_urgency=None,
            priority_score=score,
            priority_label=label,
            priority_explanation=explanation,
            is_simulation=True,
        )
        db.add(incident)
        db.flush()  # get ID without commit
        created.append(incident)
    db.commit()
    return created
