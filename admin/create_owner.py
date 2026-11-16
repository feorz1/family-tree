"""Print a one-time owner setup link from an SSH session on the VPS."""
import argparse
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlencode

import accounts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--host", required=True, help="Public HTTPS hostname of the editor")
    parser.add_argument("username")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,63}", args.host):
        parser.error("Некорректный адрес редактора")
    try:
        with sqlite3.connect(args.db.resolve().as_uri() + "?mode=rw", uri=True, timeout=10) as db:
            accounts.initialize(db)
            db.execute("BEGIN IMMEDIATE")
            token = accounts.create_owner_invite(db, args.username)
    except (accounts.AccessError, sqlite3.Error) as error:
        parser.exit(1, f"{error}\n")
    fragment = urlencode({"invite": token, "login": args.username, "mode": "owner"})
    print(f"https://{args.host}/join#{fragment}")


if __name__ == "__main__":
    main()
