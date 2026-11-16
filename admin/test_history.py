import copy
import sqlite3
import unittest

import history


class ChangeHistoryTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript(history.SCHEMA)
        self.before = {
            "charts": [{"id":"family", "nodes":[{"id":"person", "name":"Имя", "info":"", "sub":""}], "groups":[]}],
            "photoCatalog": {"family":{}}, "cardLabels": {}, "routes": {},
        }

    def test_field_and_photo_history_with_author_and_review(self):
        after = copy.deepcopy(self.before)
        after["charts"][0]["nodes"][0]["info"] = "Новый текст"
        after["photoCatalog"]["family"]["person"] = [{"src":"assets/photos/test.png","portrait":True}]
        history.record(self.db, 1, self.before, after, actor="Редактор", role="editor")
        edit = history.listing(self.db)[0][0]
        card = edit["sections"][0]
        self.assertEqual(edit["actor"], "Редактор")
        self.assertIsNotNone(edit["editedAt"])
        self.assertEqual(card["fields"][0]["before"], "")
        self.assertEqual(card["fields"][0]["after"], "Новый текст")
        self.assertIsNone(card["beforeCard"]["portrait"])
        self.assertEqual(card["afterCard"]["portrait"], "assets/photos/test.png")
        self.assertEqual(history.status(self.db), (edit["id"], 1))
        history.mark_seen(self.db, edit["id"])
        self.assertEqual(history.status(self.db), (edit["id"], 0))
        history.accept(self.db, edit["id"], 0)
        self.assertIsNotNone(history.listing(self.db)[0][0]["sections"][0]["acceptedAt"])

    def test_published_change_can_be_reverted_without_touching_another_field(self):
        after = copy.deepcopy(self.before)
        after["charts"][0]["nodes"][0]["info"] = "Опубликовано"
        history.record(self.db, 1, self.before, after, actor="Владелец", role="admin")
        history.publish(self.db, 1, "abc")
        entry = history.listing(self.db)[0][0]
        self.assertEqual(entry["publication"], "abc")
        after["charts"][0]["nodes"][0]["sub"] = "Другое поле"
        reverted = history.undo(self.db, entry["id"], after)
        self.assertEqual(reverted["charts"][0]["nodes"][0]["info"], "")
        self.assertEqual(reverted["charts"][0]["nodes"][0]["sub"], "Другое поле")
        after["charts"][0]["nodes"][0]["info"] = "Более поздний текст"
        with self.assertRaises(history.Conflict):
            history.undo(self.db, entry["id"], after)

    def test_route_and_crop_values_are_kept_as_editable_units(self):
        old = copy.deepcopy(self.before)
        route = {"points":[[3,5]], "radius":8}
        old["routes"] = {"family":{"route-a":route}}
        new = copy.deepcopy(old)
        new["routes"]["family"]["route-a"]["radius"] = 10
        history.record(self.db, 1, old, new)
        field = history.listing(self.db)[0][0]["sections"][0]["fields"][0]
        self.assertEqual(field["kind"], "route")
        self.assertEqual(field["before"], route)
        self.assertEqual(field["after"]["radius"], 10)


if __name__ == "__main__":
    unittest.main()
