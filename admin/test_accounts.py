import sqlite3
import unittest

import accounts


class OwnerAccountsTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        # This is the editor table from releases before remote owner accounts.
        self.db.execute("""CREATE TABLE editors (
            username TEXT PRIMARY KEY, display_name TEXT NOT NULL, created INTEGER NOT NULL,
            active INTEGER NOT NULL DEFAULT 1, password TEXT, invite TEXT, expires INTEGER
        )""")
        self.db.execute("INSERT INTO editors (username, display_name, created, expires) VALUES ('relative','Родственник',1,1)")
        accounts.initialize(self.db)

    def test_legacy_users_and_new_invites_remain_editors(self):
        self.assertEqual(self.db.execute("SELECT role FROM editors WHERE username='relative'").fetchone(), ("editor",))
        _, token = accounts.make_invite(self.db, {"username":"guest", "displayName":"Гость", "role":"admin"})
        session, age = accounts.activate(self.db, {"token":token, "password":"editor password"})
        self.assertEqual(accounts.user_at(self.db, session), ("guest", "Гость", "editor"))
        self.assertEqual(age, accounts.SESSION_AGE)

    def test_owner_activation_is_one_time_and_creates_an_admin_session(self):
        token = accounts.create_owner_invite(self.db, "owner")
        with self.assertRaisesRegex(accounts.AccessError, "Пароль владельца"):
            accounts.activate(self.db, {"token":token, "password":"shorter password"[:15]})
        password = "Sufficiently long password"
        session, age = accounts.activate(self.db, {"token":token, "password":password})
        self.assertEqual(age, accounts.OWNER_SESSION_AGE)
        self.assertEqual(accounts.user_at(self.db, session), ("owner", "Владелец", "admin"))
        with self.assertRaises(accounts.AccessError):
            accounts.activate(self.db, {"token":token, "password":password})
        with self.assertRaises(accounts.AccessError):
            accounts.create_owner_invite(self.db, "owner")
        again, _ = accounts.login(self.db, {"username":"owner", "password":password})
        self.assertEqual(accounts.user_at(self.db, again)[2], "admin")

    def test_editor_management_cannot_change_the_owner(self):
        accounts.create_owner_invite(self.db, "owner")
        with self.assertRaises(accounts.AccessError):
            accounts.create_owner_invite(self.db, "other-owner")
        with self.assertRaises(accounts.AccessError):
            accounts.make_invite(self.db, {"username":"owner", "displayName":"Другое имя"})
        with self.assertRaises(accounts.AccessError):
            accounts.revoke(self.db, "owner")
        self.assertEqual([row["username"] for row in accounts.roster(self.db)], ["relative"])


if __name__ == "__main__":
    unittest.main()
