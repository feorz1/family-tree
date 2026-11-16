"""Invite-only accounts for the shared editor."""
from collections import deque
import hashlib
import hmac
from http.cookies import CookieError, SimpleCookie
import re
import secrets
from threading import Lock
import time

INVITE_AGE = 7 * 86400
SESSION_AGE = 30 * 86400
OWNER_INVITE_AGE = OWNER_SESSION_AGE = 86400
OWNER_PASSWORD_MIN = 16
COOKIE = "__Host-family_session"
USERNAME = re.compile(r"[a-z0-9_.-]{3,40}")
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")
ATTEMPTS = deque()
ATTEMPT_LOCK = Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS editors (
    username TEXT PRIMARY KEY, display_name TEXT NOT NULL, created INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, password TEXT, invite TEXT, expires INTEGER,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'admin'))
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES editors(username), expires INTEGER NOT NULL
);
"""


class AccessError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def initialize(db):
    db.executescript(SCHEMA)
    with db:
        db.execute("BEGIN IMMEDIATE")
        if "role" not in {column[1] for column in db.execute("PRAGMA table_info(editors)")}:
            db.execute("ALTER TABLE editors ADD COLUMN role TEXT NOT NULL DEFAULT 'editor' "
                       "CHECK (role IN ('editor', 'admin'))")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS single_owner ON editors(role) WHERE role='admin'")


def token_hash(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def read_token(headers):
    try:
        jar = SimpleCookie(headers.get("Cookie", ""))
        value = jar[COOKIE].value if COOKIE in jar else ""
    except CookieError:
        return ""
    return value if TOKEN.fullmatch(value) else ""


def cookie(token, max_age):
    return f"{COOKIE}={token}; Path=/; Max-Age={max_age}; Secure; HttpOnly; SameSite=Lax"


def user_at(db, token):
    if not token:
        return None
    return db.execute(
        "SELECT e.username, e.display_name, e.role FROM sessions s JOIN editors e USING(username) "
        "WHERE s.token=? AND s.expires>? AND e.active=1",
        (token_hash(token), int(time.time())),
    ).fetchone()


def roster(db):
    now = int(time.time())
    return [
        {"username": user, "name": name, "state":
         "revoked" if not active else "active" if password else "pending" if expires > now else "expired"}
        for user, name, active, password, expires in db.execute(
            "SELECT username, display_name, active, password, expires FROM editors "
            "WHERE role='editor' ORDER BY display_name"
        )
    ]


def make_invite(db, body):
    name = body.get("displayName", "").strip()
    user = body.get("username", "").strip().lower()
    if not USERNAME.fullmatch(user) or not 1 <= len(name) <= 80:
        raise AccessError("Проверь имя и логин")
    existing = db.execute("SELECT active, password, expires, role FROM editors WHERE username=?", (user,)).fetchone()
    now = int(time.time())
    if existing and (existing[3] == "admin" or (existing[0] and (existing[1] or existing[2] > now))):
        raise AccessError("Такой логин уже есть. При необходимости отзови прежний доступ.", 409)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO editors (username, display_name, created, invite, expires) VALUES (?,?,?,?,?) "
        "ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name, created=excluded.created,"
        " active=1, invite=excluded.invite, expires=excluded.expires, password=NULL WHERE editors.role='editor'",
        (user, name, now, token_hash(token), now+INVITE_AGE),
    )
    return user, token


def create_owner_invite(db, user):
    # This entry point is used only by the VPS operator, never by an HTTP handler.
    if not USERNAME.fullmatch(user):
        raise AccessError("Некорректный логин владельца")
    owner = db.execute("SELECT username, password FROM editors WHERE role='admin'").fetchone()
    if owner and (owner[0] != user or owner[1]):
        raise AccessError("Учётка владельца уже существует", 409)
    if db.execute("SELECT 1 FROM editors WHERE username=? AND role='editor'", (user,)).fetchone():
        raise AccessError("Логин уже занят редактором", 409)
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    db.execute(
        "INSERT INTO editors (username, display_name, created, invite, expires, role) VALUES (?,?,?,?,?,'admin') "
        "ON CONFLICT(username) DO UPDATE SET invite=excluded.invite, expires=excluded.expires "
        "WHERE editors.role='admin' AND editors.password IS NULL",
        (user, "Владелец", now, token_hash(token), now + OWNER_INVITE_AGE),
    )
    return token


def revoke(db, user):
    updated = db.execute("UPDATE editors SET active=0, invite=NULL, expires=NULL WHERE username=? AND role='editor'", (user,))
    if not updated.rowcount:
        raise AccessError("Нет редактора с таким логином", 404)
    db.execute("DELETE FROM sessions WHERE username=?", (user,))


def password_hash(password, salt):
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=32768, r=8, p=3, maxmem=64*1024*1024).hex()


def verify_password(password, stored):
    salt, expected = stored.split(":") if stored else ("00"*16, "00"*64)
    return hmac.compare_digest(password_hash(password, bytes.fromhex(salt)), expected)


def limit_attempts(ip):
    now = time.monotonic()
    with ATTEMPT_LOCK:
        while ATTEMPTS and ATTEMPTS[0][0] <= now - 60:
            ATTEMPTS.popleft()
        if len(ATTEMPTS) >= 60 or sum(key == ip for _, key in ATTEMPTS) >= 8:
            raise AccessError("Слишком много попыток. Попробуй через минуту.", 429)
        ATTEMPTS.append((now, ip))


def grant_session(db, user, role):
    now = int(time.time())
    token = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires<=?", (now,))
    age = OWNER_SESSION_AGE if role == "admin" else SESSION_AGE
    db.execute("INSERT INTO sessions VALUES (?,?,?)", (token_hash(token), user, now + age))
    return token, age


def activate(db, body):
    token, password = body.get("token", ""), body.get("password", "")
    if not TOKEN.fullmatch(token):
        raise AccessError("Ссылка недействительна. Попроси новое приглашение.", 403)
    if not 12 <= len(password) <= 128:
        raise AccessError("Пароль должен содержать от 12 до 128 символов")
    row = db.execute(
        "SELECT username, role FROM editors WHERE invite=? AND expires>? AND active=1 AND password IS NULL",
        (token_hash(token), int(time.time())),
    ).fetchone()
    if not row:
        raise AccessError("Ссылка уже использована, отозвана или просрочена.", 403)
    if row[1] == "admin" and len(password) < OWNER_PASSWORD_MIN:
        raise AccessError(f"Пароль владельца должен содержать от {OWNER_PASSWORD_MIN} до 128 символов")
    salt = secrets.token_bytes(16)
    db.execute("UPDATE editors SET password=?, invite=NULL, expires=NULL WHERE username=?",
               (salt.hex()+":"+password_hash(password, salt), row[0]))
    return grant_session(db, row[0], row[1])


def login(db, body):
    user = body.get("username", "").strip().lower()
    password = body.get("password", "")
    if not USERNAME.fullmatch(user) or not 1 <= len(password) <= 128:
        raise AccessError("Проверь логин и пароль", 401)
    row = db.execute("SELECT password, role FROM editors WHERE username=? AND active=1", (user,)).fetchone()
    stored = row[0] if row else None
    if not verify_password(password, stored) or not stored:
        raise AccessError("Проверь логин и пароль", 401)
    return grant_session(db, user, row[1])
