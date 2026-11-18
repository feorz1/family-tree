"""Private family tree editor. Run behind a local SSH forward."""
import base64
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.error import URLError
from urllib.parse import parse_qs, unquote, urlencode, urlsplit
from urllib.request import urlopen

import accounts
import history

ADMIN = Path(__file__).resolve().parent
REPO = Path(os.environ.get("TREE_REPO", ADMIN.parent)).resolve()
STATE = Path(os.environ.get("TREE_STATE", ADMIN / ".local")).resolve()
PORT = int(os.environ.get("TREE_PORT", "18146"))
SHARED_HOST = os.environ.get("TREE_SHARED_HOST", "")
SHARED_BIND = os.environ.get("TREE_SHARED_BIND", "")
SHARED_PORT = int(os.environ.get("TREE_SHARED_PORT", "18148"))
PUBLIC_URL = os.environ.get("TREE_PUBLIC_URL", "https://feorz1.github.io/family-tree/")
DATA = "data/tree.js"
PREFIX = "const treeData = "
CHARTS = {"family", "khramov", "boyko", "perikov", "leviny", "nikiforov", "korkota"}
PHOTO = re.compile(r"assets/(?:photos|sources)/[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp)", re.I)
UPLOAD = re.compile(r"assets/photos/editor-([a-f0-9]{64})\.(png|jpg|webp)")
IDENTIFIER = re.compile(r"[a-z][a-z0-9_]{0,60}")
MAX_PHOTO = 8 * 1024 * 1024


class EditError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def demand(condition, message):
    if not condition:
        raise EditError(message)


def read_data(raw):
    text = raw.decode("utf-8").strip()
    demand(text.startswith(PREFIX) and text.endswith(";"), "Некорректный файл данных")
    return json.loads(text[len(PREFIX):-1])


def data_script(data):
    return (PREFIX + json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + ";\n").encode("utf-8")


def git(*args, cwd=REPO):
    result = subprocess.run(
        [os.environ.get("TREE_GIT", "git"), *args], cwd=cwd, capture_output=True, timeout=45,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    if result.returncode:
        print(result.stderr.decode("utf-8", "replace").strip(), flush=True)
        raise EditError("GitHub не принял изменение. Проверьте доступ и повторите публикацию.", 502)
    return result.stdout


def connection():
    return sqlite3.connect(STATE / "draft.sqlite", timeout=10)


def get_draft(db):
    revision, origin, publication, payload = db.execute(
        "SELECT revision, origin, publication, payload FROM draft WHERE id = 1"
    ).fetchone()
    return revision, origin, publication, json.loads(payload)


def valid_link(value):
    return isinstance(value, str) and (
        not value or (urlsplit(value).scheme in {"https", "http"} and urlsplit(value).hostname)
    )


def valid_id(value):
    return isinstance(value, str) and IDENTIFIER.fullmatch(value) and value not in {"constructor", "prototype"}


def number(value, lo, hi):
    return type(value) in {float, int} and lo <= value <= hi


def validate(data, db):
    demand(isinstance(data, dict), "Ожидаются данные родословной")
    charts = data.get("charts")
    demand(isinstance(charts, list) and len(charts) == len(CHARTS), "Не хватает схем")
    ids = {}
    uploads = set()
    for chart in charts:
        key = chart["id"]
        demand(key in CHARTS and key not in ids, "Неизвестная схема")
        demand(number(chart["w"], 1, 30000) and number(chart["h"], 1, 30000), "Недопустимый размер схемы")
        people = chart["nodes"]
        demand(isinstance(people, list) and 0 < len(people) <= 300, "Число карточек в схеме должно быть от 1 до 300")
        nodes = {person["id"] for person in people}
        demand(len(nodes) == len(people) and all(map(valid_id, nodes)), "Повторяющийся или неверный код карточки")
        ids[key] = nodes
        for person in people:
            demand(all(isinstance(person.get(field, ""), str) for field in ("name", "sub", "info", "kind", "source", "sourceLabel")), "Некорректные поля карточки")
            demand(0 < len(person["name"].strip()) <= 160, "Укажите имя до 160 символов")
            demand(number(person["x"], 0, 30000) and number(person["y"], -450 if key == "family" else 0, 30000), "Некорректное положение карточки")
            if "position" in person:
                demand(isinstance(person["position"], list) and len(person["position"]) == 2 and all(number(n, 0, 99000) for n in person["position"]), "Некорректное положение карточки на схеме")
            demand(valid_link(person.get("source", "")), "Ссылка на источник должна начинаться с https:// или http://")
            demand(person.get("kind", "") in {"", "document", "uncertain", "adopt", "current", "group"}, "Неизвестная отметка карточки")
            photos = data["photoCatalog"].get(key, {}).get(person["id"], [])
            for photo in photos:
                if "crop" in photo:
                    crop = photo["crop"]
                    demand(number(crop["x"], 0, 1) and number(crop["y"], 0, 1) and number(crop["zoom"], 1, 3),
                           "Некорректное кадрирование фотографии")
                path = photo["src"]
                demand(isinstance(path, str) and PHOTO.fullmatch(path), "Недопустимое имя фотографии")
                if UPLOAD.fullmatch(path):
                    demand((REPO / path).is_file() or (db is not None and db.execute("SELECT 1 FROM photo WHERE path=?", (path,)).fetchone()), "Фотография не загружена")
                    uploads.add(path)
                else:
                    demand((REPO / path).is_file(), "Фотография отсутствует в опубликованной версии")
        group_ids = set()
        for group in chart["groups"]:
            demand(valid_id(group.get("id")) and group["id"] not in group_ids, "Повторяющийся код связи")
            group_ids.add(group["id"])
            parents, children = group["parents"], group["children"]
            demand(1 <= len(parents) <= 2 and len(set(parents+children)) == len(parents+children) and set(parents+children) <= nodes, "Проверьте участников связи")
            demand(set(group.get("uncertainChildren", [])) <= set(children), "Неизвестный участник предполагаемой связи")
            if "busFraction" in group:
                demand(number(group["busFraction"], 0, 1), "Недопустимое положение общей линии")
        for edge in chart.get("extra", []):
            demand(edge["a"] in nodes and edge["b"] in nodes and edge["a"] != edge["b"], "Проверьте участников дополнительной связи")
        for pair in data["marriedPairs"].get(key, []):
            demand(len(pair) == 2 and len(set(pair)) == 2 and set(pair) <= nodes, "Проверьте пару супругов")

    people_refs = {key + ":" + person for key, people in ids.items() for person in people}
    seen = set()
    for same_person in data["identities"]:
        demand(len(same_person) >= 2 and set(same_person) <= people_refs and not seen.intersection(same_person), "Некорректное объединение карточек")
        seen.update(same_person)
    for fact in data["documentaryFacts"]:
        demand(valid_link(fact.get("url", "")), "Некорректная ссылка архивного события")
        demand(set(fact["people"] + fact.get("birthChild", [])) <= people_refs, "Архивное событие потеряло участников")
    for key, overrides in data["routes"].items():
        demand(key in CHARTS and isinstance(overrides, dict), "Неизвестная схема ручной линии")
        for override in overrides.values():
            points = override["points"]
            demand(isinstance(points, list) and len(points) <= 60, "Слишком много точек у одной линии")
            demand(all(len(point) == 2 and all(number(n, 0, 100000) for n in point) for point in points), "Точка вне схемы")
            for field in ("startPoint", "endPoint"):
                if field in override:
                    demand(isinstance(override[field], list) and len(override[field]) == 2 and all(number(n, 0, 100000) for n in override[field]), "Конец линии вне схемы")
            for field in ("hidden", "orthogonal", "frozen"):
                if field in override:
                    demand(type(override[field]) is bool, "Некорректная настройка линии")
            if "children" in override:
                demand(isinstance(override["children"], list) and all(isinstance(uid, str) and uid in ids[key] for uid in override["children"]), "Неизвестные участники общей линии")
            demand(number(override.get("radius", 8), 0, 80), "Недопустимое скругление")
            for field in ("start", "end"):
                if field not in override:
                    continue
                anchor = override[field]
                demand(anchor["side"] in {"top", "bottom", "left", "right"} and number(anchor["fraction"], 0, 1), "Недопустимое крепление линии")
    return uploads


def save_photo(db, body):
    blob = base64.b64decode(body["base64"], validate=True)
    demand(0 < len(blob) <= MAX_PHOTO, "Фотография должна быть меньше 8 МБ")
    if blob.startswith(bytes.fromhex("89504e470d0a1a0a")):
        ext = "png"
    elif blob.startswith(bytes.fromhex("ffd8ff")):
        ext = "jpg"
    elif blob.startswith(b"RIFF") and blob[8:12] == b"WEBP":
        ext = "webp"
    else:
        raise EditError("Поддерживаются JPEG, PNG и WebP")
    path = "assets/photos/editor-" + hashlib.sha256(blob).hexdigest() + "." + ext
    db.execute("INSERT OR IGNORE INTO photo VALUES (?, ?)", (path, blob))
    return path


def publish(db, revision, origin, data):
    photos = validate(data, db)
    git("fetch", "--no-tags", "origin", "main")
    remote = git("rev-parse", "origin/main").decode().strip()
    old = data_script(read_data(git("show", remote + ":" + DATA)))
    script = data_script(data)
    if old == script:
        db.execute("UPDATE draft SET origin=?, publication=? WHERE id=1", (digest(script), remote))
        return remote
    if digest(old) != origin:
        raise EditError("На GitHub уже есть другая версия данных. Черновик сохранён. Сначала нужно согласовать правки.", 409)
    with tempfile.TemporaryDirectory(prefix="family-publish-") as tmp:
        worktree = Path(tmp) / "site"
        git("worktree", "add", "--detach", str(worktree), remote)
        try:
            (worktree / DATA).write_bytes(script)
            assets = []
            for path in sorted(photos):
                destination = worktree / path
                if not destination.exists():
                    row = db.execute("SELECT bytes FROM photo WHERE path=?", (path,)).fetchone()
                    demand(row, "Файл для публикации отсутствует")
                    destination.write_bytes(row[0])
                    assets.append(path)
            git("add", "--", DATA, *assets, cwd=worktree)
            git("-c", "user.name=Family Tree Editor", "-c", "user.email=family-tree-editor@users.noreply.github.com",
                "commit", "-m", "Publish family tree updates", cwd=worktree)
            commit = git("rev-parse", "HEAD", cwd=worktree).decode().strip()
            git("push", "origin", "HEAD:refs/heads/main", cwd=worktree)
        finally:
            git("worktree", "remove", "--force", str(worktree))
    db.execute("UPDATE draft SET origin=?, publication=? WHERE id=1 AND revision=?", (digest(script), commit, revision))
    return commit


def recover_history(db):
    if db.execute("SELECT recovered FROM history_state WHERE id=1").fetchone()[0]:
        return
    revision, origin, publication, current = get_draft(db)
    for row in reversed(git("log", "-24", "--first-parent", "--format=%H%x09%ct%x09%s", "--", DATA).decode().splitlines()):
        commit, timestamp, name = row.split("\t", 2)
        if name != "Publish family tree updates":
            continue
        try:
            before = read_data(git("show", commit + "^:" + DATA))
            after = read_data(git("show", commit + ":" + DATA))
        except EditError:
            continue
        history.record(db, 0, before, after, action="recovered", publication=commit, published_at=int(timestamp))
    if digest(data_script(current)) != origin:
        baseline = read_data(git("show", (publication or "HEAD") + ":" + DATA))
        if digest(data_script(baseline)) == origin:
            history.record(db, revision, baseline, current, action="recovered")
    db.execute("UPDATE history_state SET recovered=1 WHERE id=1")


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(25)
        super().setup()

    def host_ok(self):
        host = self.headers.get("Host")
        if self.server.shared:
            return host == SHARED_HOST
        return host in {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}

    def viewer(self, db):
        if not self.server.shared:
            return {"role": "admin", "name": "Владелец", "hasSession": False}
        member = accounts.user_at(db, accounts.read_token(self.headers))
        return {"role": member[2], "name": member[1], "username": member[0], "hasSession": True} if member else None

    def require_admin(self, viewer):
        if viewer["role"] != "admin":
            raise EditError("Эта операция доступна владельцу", 403)

    def origin(self):
        return ("https://" if self.server.shared else "http://") + self.headers.get("Host", "")


    def send_content(self, raw, mime, status=200, preview=False, cookie=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        script = "'self' 'unsafe-inline'" if preview else "'self'"
        self.send_header("Content-Security-Policy", f"default-src 'self'; script-src {script}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'")
        self.end_headers()
        self.wfile.write(raw)

    def send_json(self, value, status=200, cookie=None):
        self.send_content(json.dumps(value, ensure_ascii=False).encode(), "application/json; charset=utf-8", status, cookie=cookie)

    def do_GET(self):
        if not self.host_ok():
            return self.send_json({"error": "Проверьте адрес редактора"}, 403)
        path = unquote(urlsplit(self.path).path)
        try:
            with connection() as db:
                viewer = self.viewer(db)
                if path in {"/editor.css", "/auth.js"}:
                    target = ADMIN / path[1:]
                    return self.send_content(target.read_bytes(), mimetypes.guess_type(target.name)[0])
                if path in {"/preview/assets/ui/theme.js", "/preview/assets/ui/components.js",
                            "/preview/assets/ui/theme.css", "/preview/assets/ui/editor.css",
                            "/preview/assets/fonts/MedeoSansVariable.woff2"}:
                    target = REPO / path[len("/preview/"):]
                    return self.send_content(target.read_bytes(), mimetypes.guess_type(target.name)[0])
                if path == "/join" or (path == "/" and not viewer):
                    return self.send_content((ADMIN / "auth.html").read_bytes(), "text/html; charset=utf-8")
                if not viewer:
                    return self.send_json({"error": "Войди в редактор"}, 401)
                if path == "/api/accounts":
                    self.require_admin(viewer)
                    return self.send_json({"accounts": accounts.roster(db), "canInvite": bool(SHARED_HOST and SHARED_BIND)})
                if path in ("/api/history", "/api/history/status"):
                    self.require_admin(viewer)
                    latest, unseen = history.status(db)
                    revision, origin, publication, data = get_draft(db)
                    result = {"latest": latest, "unseen": unseen, "revision": revision,
                              "dirty": digest(data_script(data)) != origin, "publication": publication}
                    if path == "/api/history":
                        query = parse_qs(urlsplit(self.path).query)
                        cursor = query.get("before", [""])[0]
                        before = int(cursor) if cursor.isascii() and cursor.isdecimal() and len(cursor) < 19 else None
                        kind = query.get("type", [None])[0]
                        demand(kind in {None, "photos", "cards", "relations", "routes"}, "Неизвестный вид правки")
                        result["entries"], result["more"] = history.listing(db, before, kind)
                    return self.send_json(result)
                if path == "/api/draft":
                    revision, origin, publication, data = get_draft(db)
                    return self.send_json({"revision": revision, "publication": publication,
                                           "dirty": digest(data_script(data)) != origin, "data": data, "publicUrl": PUBLIC_URL, **viewer})
                if path == "/api/publication":
                    _, origin, publication, _ = get_draft(db)
                    query = parse_qs(urlsplit(self.path).query)
                    current = False
                    if publication and query.get("commit") == [publication]:
                        try:
                            with urlopen(PUBLIC_URL.rstrip("/") + "/" + DATA + "?v=" + publication, timeout=4) as reply:
                                current = digest(data_script(read_data(reply.read(2_000_000)))) == origin
                        except (URLError, TimeoutError, ValueError, EditError):
                            pass
                    return self.send_json({"current": current})
                if path == "/preview/data/tree.js":
                    return self.send_content(data_script(get_draft(db)[3]), "text/javascript; charset=utf-8")
                if path in {"/", "/editor.js", "/access.js", "/history.js", "/crop.js"}:
                    target = ADMIN / ("index.html" if path == "/" else path[1:])
                elif path in {"/preview/", "/preview/index.html"}:
                    target = REPO / "index.html"
                elif path.startswith("/preview/assets/"):
                    relative = path[len("/preview/"):]
                    target = REPO / relative
                    if not target.resolve().is_relative_to(REPO / "assets"):
                        raise FileNotFoundError
                    if UPLOAD.fullmatch(relative):
                        row = db.execute("SELECT bytes FROM photo WHERE path=?", (relative,)).fetchone()
                        if row:
                            return self.send_content(row[0], mimetypes.guess_type(relative)[0])
                else:
                    raise FileNotFoundError
                mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
                return self.send_content(target.read_bytes(), mime, preview=path.startswith("/preview/"))
        except FileNotFoundError:
            return self.send_json({"error": "Файл не найден"}, 404)
        except EditError as error:
            return self.send_json({"error": str(error)}, error.status)

    def do_POST(self):
        if not self.host_ok() or self.headers.get("Origin") != self.origin():
            return self.send_json({"error": "Запрос доступен только из редактора"}, 403)
        try:
            demand(self.headers.get_content_type() == "application/json", "Неверный формат запроса")
            path = self.path
            is_login = path in {"/api/activate", "/api/login"}
            size = int(self.headers.get("Content-Length", "0"))
            max_size = 4096 if is_login else 12 * 1024 * 1024
            demand(0 < size <= max_size, "Слишком большой запрос")
            if self.server.shared and not is_login and not accounts.read_token(self.headers):
                raise EditError("Войди в редактор", 401)
            body = json.loads(self.rfile.read(size))
            if is_login:
                demand(self.server.shared, "Вход доступен по общему адресу редактора")
                # Caddy sets this header for the single shared listener.
                accounts.limit_attempts(self.headers.get("X-Forwarded-For", self.client_address[0])[-128:])
            session_cookie = None
            with connection() as db:
                db.execute("BEGIN IMMEDIATE")
                if is_login:
                    action = accounts.activate if path == "/api/activate" else accounts.login
                    token, age = action(db, body)
                    session_cookie = accounts.cookie(token, age)
                    result = {"ok": True}
                else:
                    viewer = self.viewer(db)
                    if not viewer:
                        raise EditError("Войди в редактор", 401)
                    if path in {"/api/invite", "/api/revoke", "/api/publish"} or path.startswith("/api/history/"):
                        self.require_admin(viewer)
                    result, session_cookie = self.edit(db, path, body, viewer)
            return self.send_json(result, cookie=session_cookie)
        except (EditError, accounts.AccessError) as error:
            return self.send_json({"error": str(error)}, error.status)
        except history.Conflict:
            return self.send_json({"error": "Эта правка уже отменена или затронута более поздними изменениями."}, 409)
        except (ValueError, TypeError, KeyError, AttributeError):
            return self.send_json({"error": "В форме есть некорректные данные"}, 400)
        except (OSError, sqlite3.Error, subprocess.TimeoutExpired) as error:
            print(str(error), flush=True)
            return self.send_json({"error": "Не удалось завершить операцию на сервере. Черновик сохранён."}, 503)

    def edit(self, db, path, body, viewer):
        if path == "/api/invite":
            demand(SHARED_HOST and SHARED_BIND, "Адрес приглашений ещё не подключён")
            username, token = accounts.make_invite(db, body)
            fragment = urlencode({"invite": token, "login": username})
            return {"link": f"https://{SHARED_HOST}/join#{fragment}"}, None
        if path == "/api/revoke":
            accounts.revoke(db, body["username"])
            return {"ok": True}, None
        if path == "/api/logout":
            token = accounts.read_token(self.headers)
            if token:
                db.execute("DELETE FROM sessions WHERE token=?", (accounts.token_hash(token),))
            return {"ok": True}, accounts.cookie("", 0)
        if path == "/api/photo":
            return {"path": save_photo(db, body)}, None
        if path == "/api/history/seen":
            through = body["through"]
            demand(type(through) is int and through >= 0, "Некорректный номер записи")
            history.mark_seen(db, through)
            return {"ok": True}, None
        revision, origin, _, data = get_draft(db)
        if body["revision"] != revision:
            raise EditError("Черновик уже изменён в другом окне. Обновите редактор.", 409)
        if path == "/api/history/accept":
            history.accept(db, body["id"], body["section"])
            return {"ok": True}, None
        if path == "/api/history/revert":
            edit_id = body["id"]
            replacement = history.undo(db, edit_id, data)
            try:
                validate(replacement, db)
            except EditError as error:
                raise EditError("Отмена затронет связанные данные. Черновик сохранён.", 409) from error
            return self.save_draft(db, revision, origin, data, replacement, viewer, reverts=edit_id), None
        if path == "/api/draft":
            replacement = body["data"]
            validate(replacement, db)
            review = None
            if "review" in body:
                self.require_admin(viewer)
                review = (body["review"]["id"], body["review"]["section"])
                history.accept(db, *review)
            return self.save_draft(db, revision, origin, data, replacement, viewer, review=review), None
        if path == "/api/publish":
            commit = publish(db, revision, origin, data)
            history.publish(db, revision, commit)
            return {"commit": commit}, None
        raise EditError("Неизвестный запрос", HTTPStatus.NOT_FOUND)


    def save_draft(self, db, revision, origin, before, after, viewer, reverts=None, review=None):
        revision += 1
        script = data_script(after)
        actor = viewer["name"] if viewer["role"] == "admin" else f'{viewer["name"]} · {viewer["username"]}'
        history.record(db, revision, before, after, actor=actor, role=viewer["role"],
                       action="revert" if reverts is not None else "save", reverts=reverts, review=review)
        db.execute("UPDATE draft SET revision=?, payload=? WHERE id=1", (revision, script.decode()[len(PREFIX):-2]))
        return {"revision": revision, "dirty": digest(script) != origin}


def main():
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with connection() as db:
        db.execute("PRAGMA journal_mode=WAL")
        accounts.initialize(db)
        db.executescript(
            "CREATE TABLE IF NOT EXISTS draft (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL,"
            " origin TEXT NOT NULL, publication TEXT, payload TEXT NOT NULL);"
            "CREATE TABLE IF NOT EXISTS photo (path TEXT PRIMARY KEY, bytes BLOB NOT NULL);"
        )
        if not db.execute("SELECT 1 FROM draft").fetchone():
            data = read_data((REPO / DATA).read_bytes())
            validate(data, db)
            script = data_script(data)
            db.execute("INSERT INTO draft VALUES (1, 0, ?, NULL, ?)", (digest(script), script.decode()[len(PREFIX):-2]))
        db.executescript(history.SCHEMA)
        try:
            with db:
                recover_history(db)
        except EditError as error:
            print("Не удалось восстановить предыдущие правки:", str(error), flush=True)
    local = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    local.shared = False
    if SHARED_HOST and SHARED_BIND:
        shared = ThreadingHTTPServer((SHARED_BIND, SHARED_PORT), Handler)
        shared.shared = True
        Thread(target=shared.serve_forever, daemon=True).start()
    local.serve_forever()


if __name__ == "__main__":
    main()
