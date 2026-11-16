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
COOKIE = "__Host-family_session"
USERNAME = re.compile(r"[a-z0-9_.-]{3,40}")
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")
ATTEMPTS = deque()
ATTEMPT_LOCK = Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS editors (
    username TEXT PRIMARY KEY, display_name TEXT NOT NULL, created INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, password TEXT, invite TEXT, expires INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES editors(username), expires INTEGER NOT NULL
);
"""


class AccessError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


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
        "SELECT e.username, e.display_name FROM sessions s JOIN editors e USING(username) "
        "WHERE s.token=? AND s.expires>? AND e.active=1",
        (token_hash(token), int(time.time())),
    ).fetchone()


def roster(db):
    now = int(time.time())
    return [
        {"username": user, "name": name, "state":
         "revoked" if not active else "active" if password else "pending" if expires > now else "expired"}
        for user, name, active, password, expires in db.execute(
            "SELECT username, display_name, active, password, expires FROM editors ORDER BY display_name"
        )
    ]


def make_invite(db, body):
    name = body.get("displayName", "").strip()
    user = body.get("username", "").strip().lower()
    if not USERNAME.fullmatch(user) or not 1 <= len(name) <= 80:
        raise AccessError("Проверь имя и логин")
    existing = db.execute("SELECT active, password, expires FROM editors WHERE username=?", (user,)).fetchone()
    now = int(time.time())
    if existing and existing[0] and (existing[1] or existing[2] > now):
        raise AccessError("Такой логин уже есть. При необходимости отзови прежний доступ.", 409)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO editors (username, display_name, created, invite, expires) VALUES (?,?,?,?,?) "
        "ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name, created=excluded.created,"
        " active=1, invite=excluded.invite, expires=excluded.expires, password=NULL",
        (user, name, now, token_hash(token), now+INVITE_AGE),
    )
    return user, token


def revoke(db, user):
    db.execute("UPDATE editors SET active=0, invite=NULL, expires=NULL WHERE username=?", (user,))
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


def grant_session(db, user):
    now = int(time.time())
    token = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires<=?", (now,))
    db.execute("INSERT INTO sessions VALUES (?,?,?)", (token_hash(token), user, now+SESSION_AGE))
    return token


def activate(db, body):
    token, password = body.get("token", ""), body.get("password", "")
    if not TOKEN.fullmatch(token):
        raise AccessError("Ссылка недействительна. Попроси новое приглашение.", 403)
    if not 12 <= len(password) <= 128:
        raise AccessError("Пароль должен содержать от 12 до 128 символов")
    row = db.execute(
        "SELECT username FROM editors WHERE invite=? AND expires>? AND active=1 AND password IS NULL",
        (token_hash(token), int(time.time())),
    ).fetchone()
    if not row:
        raise AccessError("Ссылка уже использована, отозвана или просрочена.", 403)
    salt = secrets.token_bytes(16)
    db.execute("UPDATE editors SET password=?, invite=NULL, expires=NULL WHERE username=?",
               (salt.hex()+":"+password_hash(password, salt), row[0]))
    return grant_session(db, row[0])


def login(db, body):
    user = body.get("username", "").strip().lower()
    password = body.get("password", "")
    if not USERNAME.fullmatch(user) or not 1 <= len(password) <= 128:
        raise AccessError("Проверь логин и пароль", 401)
    row = db.execute("SELECT password FROM editors WHERE username=? AND active=1", (user,)).fetchone()
    stored = row[0] if row else None
    if not verify_password(password, stored) or not stored:
        raise AccessError("Проверь логин и пароль", 401)
    return grant_session(db, user)
