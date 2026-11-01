import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = "resqnet.db"

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_report TEXT NOT NULL,
            category TEXT,
            description TEXT,
            location_name TEXT,
            latitude REAL,
            longitude REAL,
            people_affected INTEGER,
            vulnerable_people TEXT,
            immediate_threats TEXT,
            required_resources TEXT,
            confidence REAL,
            recommended_urgency TEXT,
            priority_score INTEGER,
            priority_label TEXT,
            priority_explanation TEXT,
            status TEXT DEFAULT 'awaiting',
            notes TEXT,
            is_duplicate INTEGER DEFAULT 0,
            duplicate_of INTEGER,
            is_simulation INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
    ''')
    conn.commit()
    conn.close()

def _serialize_list(lst: Optional[List[Any]]) -> Optional[str]:
    if lst is None:
        return None
    return json.dumps(lst)

def _deserialize_list(txt: Optional[str]) -> Optional[List[Any]]:
    if txt is None:
        return None
    try:
        return json.loads(txt)
    except Exception:
        return None

def create_incident(data: Dict[str, Any]) -> int:
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    cur.execute('''
        INSERT INTO incidents (
            raw_report, category, description, location_name, latitude, longitude,
            people_affected, vulnerable_people, immediate_threats, required_resources,
            confidence, recommended_urgency, priority_score, priority_label, priority_explanation,
            status, notes, is_duplicate, duplicate_of, is_simulation, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ''', (
        data.get('raw_report'),
        data.get('category'),
        data.get('description'),
        data.get('location_name'),
        data.get('latitude'),
        data.get('longitude'),
        data.get('people_affected'),
        _serialize_list(data.get('vulnerable_people')),
        _serialize_list(data.get('immediate_threats')),
        _serialize_list(data.get('required_resources')),
        data.get('confidence'),
        data.get('recommended_urgency'),
        data.get('priority_score'),
        data.get('priority_label'),
        data.get('priority_explanation'),
        data.get('status', 'awaiting'),
        data.get('notes'),
        1 if data.get('is_duplicate') else 0,
        data.get('duplicate_of'),
        1 if data.get('is_simulation') else 0,
        now,
        now,
    ))
    incident_id = cur.lastrowid
    conn.commit()
    conn.close()
    return incident_id

def get_incident(incident_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute('SELECT * FROM incidents WHERE id = ?', (incident_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return _row_to_dict(row)

def list_incidents(status: Optional[str] = None, priority: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    query = 'SELECT * FROM incidents'
    params = []
    conditions = []
    if status:
        conditions.append('status = ?')
        params.append(status)
    if priority:
        conditions.append('priority_label = ?')
        params.append(priority)
    if conditions:
        query += ' WHERE ' + ' AND '.join(conditions)
    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]

def update_incident(incident_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not updates:
        return get_incident(incident_id)
    conn = get_connection()
    cur = conn.cursor()
    set_clauses = []
    params = []
    for key, value in updates.items():
        if key in ['vulnerable_people', 'immediate_threats', 'required_resources']:
            value = _serialize_list(value)
        set_clauses.append(f"{key} = ?")
        params.append(value)
    params.append(datetime.utcnow().isoformat())  # updated_at
    set_clauses.append('updated_at = ?')
    params.append(incident_id)
    sql = f"UPDATE incidents SET {', '.join(set_clauses)} WHERE id = ?"
    cur.execute(sql, params)
    conn.commit()
    conn.close()
    return get_incident(incident_id)

def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'raw_report': row['raw_report'],
        'category': row['category'],
        'description': row['description'],
        'location_name': row['location_name'],
        'latitude': row['latitude'],
        'longitude': row['longitude'],
        'people_affected': row['people_affected'],
        'vulnerable_people': _deserialize_list(row['vulnerable_people']),
        'immediate_threats': _deserialize_list(row['immediate_threats']),
        'required_resources': _deserialize_list(row['required_resources']),
        'confidence': row['confidence'],
        'recommended_urgency': row['recommended_urgency'],
        'priority_score': row['priority_score'],
        'priority_label': row['priority_label'],
        'priority_explanation': row['priority_explanation'],
        'status': row['status'],
        'notes': row['notes'],
        'is_duplicate': bool(row['is_duplicate']),
        'duplicate_of': row['duplicate_of'],
        'is_simulation': bool(row['is_simulation']),
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
    }
