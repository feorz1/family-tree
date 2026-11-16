"""Private change journal with conditional, field-level inversion."""
from copy import deepcopy
import json
import time

MISSING = object()
PERSON_TABLES = {"photoCatalog", "cardLabels", "modalNames", "births"}
MAP_TABLES = PERSON_TABLES | {"routes", "marriedPairs"}
TUPLES = {
    "cardLabels": ("Имя на карточке", "Подпись на карточке"),
    "modalNames": ("Полное имя", "Девичья фамилия"),
    "births": ("Даты", "Год в указателе", "Подпись года"),
}
FIELDS = {
    "name": "Имя", "sub": "Подпись", "info": "Описание", "source": "Ссылка на источник",
    "sourceLabel": "Название источника", "kind": "Статус", "x": "Положение по горизонтали",
    "y": "Положение по вертикали", "w": "Ширина схемы", "h": "Высота схемы",
    "parents": "Родители или супруги", "children": "Дети", "label": "Описание связи",
    "uncertainChildren": "Предполагаемое родство", "busFraction": "Положение общей линии",
    "endAtSide": "Крепление линии сбоку",
}
KINDS = {
    "": "Семейные сведения", "document": "Архивная запись", "uncertain": "Требует проверки",
    "adopt": "Усыновление", "current": "Основной человек", "group": "Участники записи",
    "red": "Версия", "blue": "Усыновление или крёстные",
}
SCHEMA = """
CREATE TABLE IF NOT EXISTS edit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER NOT NULL,
    action TEXT NOT NULL, actor TEXT, actor_role TEXT, edited_at INTEGER,
    published_commit TEXT, published_at INTEGER, reverts_id INTEGER UNIQUE,
    patches TEXT NOT NULL, sections TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history_state (
    id INTEGER PRIMARY KEY CHECK(id=1), seen INTEGER NOT NULL DEFAULT 0, recovered INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO history_state(id) VALUES(1);
CREATE TABLE IF NOT EXISTS edit_review (
    edit_id INTEGER NOT NULL, section INTEGER NOT NULL, accepted_at INTEGER NOT NULL,
    PRIMARY KEY(edit_id,section)
);
"""


class Conflict(Exception):
    pass


def keyed_list(path):
    return path == ["charts"] or (
        len(path) == 3 and path[0] == "charts" and path[2] in {"nodes", "groups"}
    )


def map_container(path):
    return 1 <= len(path) <= 2 and path[0] in MAP_TABLES


def diff(before, after, path=None, index=None):
    """Paths use an object containing an ID to address a stable row in a list."""
    path = [] if path is None else path
    if before == after:
        return
    route_leaf = len(path) == 3 and path[0] == "routes"
    if not route_leaf and ((map_container(path) and all(x is MISSING or isinstance(x, dict) for x in (before, after)))
        or isinstance(before, dict) and isinstance(after, dict)):
        old = {} if before is MISSING else before
        new = {} if after is MISSING else after
        for key in dict.fromkeys([*old, *new]):
            yield from diff(old.get(key, MISSING), new.get(key, MISSING), [*path, key])
        return
    if keyed_list(path) and isinstance(before, list) and isinstance(after, list):
        old = {row["id"]: (i, row) for i, row in enumerate(before)}
        new = {row["id"]: (i, row) for i, row in enumerate(after)}
        if [uid for uid in old if uid in new] == [uid for uid in new if uid in old]:
            for uid in dict.fromkeys([*old, *new]):
                left, first = old.get(uid, (None, MISSING))
                right, second = new.get(uid, (None, MISSING))
                yield from diff(first, second, [*path, {"id": uid}], (left, right))
            return
    yield {
        "path": path, "beforeExists": before is not MISSING, "afterExists": after is not MISSING,
        "before": None if before is MISSING else before, "after": None if after is MISSING else after,
        **({"index": index[0]} if index and index[0] is not None else {}),
    }


def at(data, path):
    value = data
    for key in path:
        if isinstance(key, dict) and isinstance(value, list):
            value = next((row for row in value if row["id"] == key["id"]), MISSING)
        elif isinstance(key, str) and isinstance(value, dict):
            value = value.get(key, MISSING)
        else:
            return MISSING
    return value


def write(data, path, value, index=None):
    current = data
    for key in path[:-1]:
        if isinstance(key, dict):
            current = next((row for row in current if row["id"] == key["id"]), MISSING)
        else:
            current = current.setdefault(key, {})
        if current is MISSING:
            raise Conflict
    key = path[-1]
    if isinstance(key, dict):
        position = next((i for i, row in enumerate(current) if row["id"] == key["id"]), None)
        if position is not None:
            if value is MISSING:
                del current[position]
            else:
                current[position] = value
        elif value is not MISSING:
            current.insert(len(current) if index is None else index, value)
    elif value is MISSING:
        current.pop(key, None)
    else:
        current[key] = value


def inverse(data, patches):
    # Check the whole save before applying anything, including missing fields.
    for patch in patches:
        current = at(data, patch["path"])
        if patch["afterExists"]:
            if current is MISSING or current != patch["after"]:
                raise Conflict
        elif current is not MISSING:
            raise Conflict
    result = deepcopy(data)
    # Restore deleted rows in their original order while keeping unrelated rows.
    for patch in patches:
        value = deepcopy(patch["before"]) if patch["beforeExists"] else MISSING
        write(result, patch["path"], value, patch.get("index"))
    return result


def person_card(data, chart, uid):
    node = at(data, ["charts", {"id": chart}, "nodes", {"id": uid}])
    if node is MISSING:
        return None
    label = data.get("cardLabels", {}).get(chart, {}).get(uid)
    photos = data.get("photoCatalog", {}).get(chart, {}).get(uid, [])
    portrait = next((photo["src"] for photo in photos if photo.get("portrait")), None)
    return {"name": label[0] if label else node["name"], "subtitle": label[1] if label else node.get("sub", ""),
            "portrait": portrait, "crop": next((photo.get("crop") for photo in photos if photo.get("portrait")), None)}


def person_label(before, after, chart, uid):
    card = person_card(after, chart, uid) or person_card(before, chart, uid)
    return card["name"] if card else uid


def removed_items(left, right):
    rest = list(right or [])
    difference = []
    for value in left or []:
        if value in rest:
            rest.remove(value)
        else:
            difference.append(value)
    return difference


def describe(before, after, patches):
    sections = {}
    for patch in patches:
        path = patch["path"]
        table = path[0]
        first, last = patch["before"], patch["after"]
        chart = path[1]["id"] if table == "charts" and len(path) > 1 else path[1] if table in MAP_TABLES and len(path) > 1 else None
        uid = path[2] if table in PERSON_TABLES and len(path) > 2 else None
        if table == "charts" and len(path) > 3 and path[2] == "nodes":
            uid = path[3]["id"]
        key = (chart, uid)
        if key not in sections:
            sections[key] = {"chart": chart, "person": uid, "title": person_label(before, after, chart, uid) if uid else None,
                             "beforeCard": person_card(before, chart, uid) if uid else None,
                             "afterCard": person_card(after, chart, uid) if uid else None, "fields": []}
        fields = sections[key]["fields"]
        label, kind = FIELDS.get(path[-1] if isinstance(path[-1], str) else "", "Карточка" if uid else "Схема"), "text"
        if table in TUPLES:
            for i, label in enumerate(TUPLES[table]):
                old = first[i] if first and i < len(first) else None
                new = last[i] if last and i < len(last) else None
                if old != new:
                    target = {"cardLabels": ("cardName","role"), "modalNames": ("name","maiden"),
                              "births": ("dates","year","yearLabel")}[table][i]
                    fields.append({"label": label, "kind": "text", "target": target, "before": old, "after": new})
            continue
        if table == "photoCatalog":
            label, kind = "Фотографии", "photos"
        elif table == "routes":
            label, kind = "Маршрут линии", "route"
        elif table == "documentaryFacts":
            label = "События и даты"
            first, last = removed_items(first, last), removed_items(last, first)
        elif table == "marriedPairs":
            label = "Супруги"
            first, last = (
                [[person_label(before, after, chart, uid) for uid in pair] for pair in (value or [])]
                for value in (first, last)
            )
        elif table == "identities":
            label = "Карточки одного человека"
            first, last = removed_items(first, last), removed_items(last, first)
        elif table == "charts" and len(path) > 2 and path[2] in {"groups", "extra"}:
            if path[-1] in ("parents", "children", "uncertainChildren"):
                first, last = ([person_label(before, after, chart, uid) for uid in (value or [])] for value in (first, last))
            elif path[2] == "extra":
                label = "Дополнительные связи"
                first, last = removed_items(first, last), removed_items(last, first)
        if path[-1] == "kind":
            first, last = KINDS.get(first, first), KINDS.get(last, last)
        target = {"sub": "role"}.get(path[-1], path[-1]) if isinstance(path[-1], str) else None
        fields.append({"label": label, "kind": kind, "target": target, "before": first, "after": last})
    return list(sections.values())


def record(db, revision, before, after, *, actor=None, role=None, action="save",
           reverts=None, publication=None, published_at=None):
    patches = list(diff(before, after))
    if not patches:
        return
    sections = describe(before, after, patches)
    db.execute(
        "INSERT INTO edit_history (revision, action, actor, actor_role, edited_at, published_commit,"
        " published_at, reverts_id, patches, sections) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (revision, action, actor, role, None if action == "recovered" else int(time.time()),
         publication, published_at, reverts, json.dumps(patches, ensure_ascii=False), json.dumps(sections, ensure_ascii=False))
    )


def status(db):
    latest, unseen = db.execute(
        "SELECT COALESCE(MAX(id),0), COUNT(CASE WHEN id>(SELECT seen FROM history_state WHERE id=1) "
        "AND (actor_role='editor' OR (action='recovered' AND published_commit IS NULL)) THEN 1 END) FROM edit_history"
    ).fetchone()
    return latest, unseen


def listing(db, before=None):
    limit = 12
    rows = db.execute(
        """SELECT h.id, h.action, h.actor, h.actor_role, h.edited_at, h.published_commit, h.published_at, h.reverts_id,
                  r.id, h.sections
           FROM edit_history h LEFT JOIN edit_history r ON r.reverts_id=h.id
           WHERE h.id < ? ORDER BY h.id DESC LIMIT ?""",
        (before or 2**63-1, limit+1),
    ).fetchall()
    entries = [
        {"id": row[0], "action": row[1], "actor": row[2], "role": row[3], "editedAt": row[4],
         "publication": row[5], "publishedAt": row[6], "reverts": row[7], "revertedBy": row[8], "sections": json.loads(row[9])}
        for row in rows[:limit]
    ]
    if entries:
        accepted = {(edit, section): stamp for edit, section, stamp in db.execute(
            "SELECT edit_id,section,accepted_at FROM edit_review WHERE edit_id BETWEEN ? AND ?",
            (entries[-1]["id"], entries[0]["id"]),
        )}
        for entry in entries:
            for index, section in enumerate(entry["sections"]):
                section["acceptedAt"] = accepted.get((entry["id"], index))
    return entries, entries[-1]["id"] if len(rows) > limit else None


def mark_seen(db, through):
    latest, _ = status(db)
    db.execute("UPDATE history_state SET seen=MAX(seen,?) WHERE id=1", (min(through, latest),))


def publish(db, revision, commit):
    db.execute("UPDATE edit_history SET published_commit=?, published_at=? WHERE revision<=? AND published_commit IS NULL",
               (commit, int(time.time()), revision))


def undo(db, edit_id, current):
    entry = db.execute("SELECT patches FROM edit_history WHERE id=?", (edit_id,)).fetchone()
    if not entry or db.execute("SELECT 1 FROM edit_history WHERE reverts_id=?", (edit_id,)).fetchone():
        raise Conflict
    return inverse(current, json.loads(entry[0]))


def accept(db, edit_id, section):
    entry = db.execute("SELECT sections FROM edit_history WHERE id=?", (edit_id,)).fetchone()
    if (not entry or type(section) is not int or not 0 <= section < len(json.loads(entry[0]))
        or db.execute("SELECT 1 FROM edit_history WHERE reverts_id=?", (edit_id,)).fetchone()):
        raise Conflict
    db.execute("INSERT OR IGNORE INTO edit_review VALUES(?,?,?)", (edit_id, section, int(time.time())))
