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


    def test_review_refinement_groups_card_and_leaves_other_edits_separate(self):
        before = copy.deepcopy(self.before)
        before["charts"][0]["nodes"].append({"id":"another","name":"Другое имя","info":""})
        proposed = copy.deepcopy(before)
        proposed["photoCatalog"]["family"]["person"] = [{"src":"assets/photos/test.png","portrait":True}]
        history.record(self.db, 1, before, proposed, actor="Анастасия", role="editor")
        original_id = history.listing(self.db)[0][0]["id"]
        history.accept(self.db, original_id, 0)
        corrected = copy.deepcopy(proposed)
        corrected["photoCatalog"]["family"]["person"][0]["crop"] = {"x": .3, "y": .5, "zoom": 1.5}
        corrected["charts"][0]["nodes"][1]["info"] = "Отдельная заметка"
        history.record(self.db, 2, proposed, corrected, actor="Владелец", role="admin", review=(original_id, 0))
        entries, _ = history.listing(self.db)
        self.assertEqual(len(entries), 2)
        photo_entry = entries[1]
        self.assertEqual(photo_entry["actor"], "Анастасия")
        section = photo_entry["sections"][0]
        self.assertEqual(section["refinements"][0]["actor"], "Владелец")
        self.assertIsNone(section["fields"][0]["before"])
        self.assertEqual(section["fields"][0]["after"][0]["crop"]["zoom"], 1.5)
        self.assertIsNotNone(section["acceptedAt"])
        self.assertEqual(len(history.listing(self.db, only="photos")[0]), 1)
        self.assertEqual(len(history.listing(self.db, only="cards")[0]), 1)
        restored = history.undo(self.db, original_id, corrected)
        self.assertNotIn("person", restored["photoCatalog"]["family"])
        self.assertEqual(restored["charts"][0]["nodes"][1]["info"], "Отдельная заметка")
        corrected["photoCatalog"]["family"]["person"][0]["crop"]["zoom"] = 2
        with self.assertRaises(history.Conflict):
            history.undo(self.db, original_id, corrected)

    def test_filtered_entries_retain_review_section_index(self):
        after = copy.deepcopy(self.before)
        after["charts"][0]["nodes"].append({"id":"second","name":"Второй","info":""})
        after["photoCatalog"]["family"]["person"] = [{"src":"assets/photos/test.png","portrait":True}]
        history.record(self.db, 1, self.before, after, actor="Анастасия", role="editor")
        photo_section = history.listing(self.db, only="photos")[0][0]["sections"][0]
        self.assertEqual(photo_section["index"], 1)
        self.assertEqual(photo_section["person"], "person")


if __name__ == "__main__":
    unittest.main()
