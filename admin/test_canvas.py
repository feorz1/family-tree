import copy
import sqlite3
import unittest

import history
import server


class CanvasPersistenceTest(unittest.TestCase):
    def setUp(self):
        self.data = server.read_data((server.REPO / server.DATA).read_bytes())

    def test_positions_and_visual_line_deletion_validate_without_changing_relations(self):
        node = self.data["charts"][0]["nodes"][0]
        node["position"] = [4100, 3400]
        relationships = copy.deepcopy(self.data["charts"][0]["groups"])
        self.data["routes"]["family"]["canvas-test"] = {
            "points": [[100, 200]], "startPoint": [50, 200], "endPoint": [100, 300],
            "orthogonal": True, "hidden": True, "radius": 8, "startNode": node["id"], "endNode": node["id"],
        }
        server.validate(self.data, None)
        self.assertEqual(self.data["charts"][0]["groups"], relationships)
        restored = server.read_data(server.data_script(self.data))
        self.assertEqual(restored, self.data)

    def test_invalid_positions_and_line_flags_are_rejected(self):
        for position in ([-1, 0], [100000, 0], [True, 1], [1], "1, 2"):
            with self.subTest(position=position):
                self.data["charts"][0]["nodes"][0]["position"] = position
                with self.assertRaises(server.EditError):
                    server.validate(self.data, None)
        del self.data["charts"][0]["nodes"][0]["position"]
        self.data["routes"]["family"]["canvas-test"] = {"points": [], "hidden": "yes"}
        with self.assertRaises(server.EditError):
            server.validate(self.data, None)

    def test_invalid_connector_binding_is_rejected(self):
        self.data["routes"]["family"]["canvas-test"] = {"points": [], "startNode": "unknown_person"}
        with self.assertRaises(server.EditError):
            server.validate(self.data, None)

    def test_card_position_has_its_own_history_kind_and_can_be_reverted(self):
        after = copy.deepcopy(self.data)
        after["charts"][0]["nodes"][0]["position"] = [4100, 3400]
        with sqlite3.connect(":memory:") as db:
            db.executescript(history.SCHEMA)
            history.record(db, 1, self.data, after)
            entries, _ = history.listing(db, only="routes")
            section = entries[0]["sections"][0]
            self.assertEqual(section["fields"][0]["kind"], "position")
            self.assertEqual(section["fields"][0]["after"], [4100, 3400])
            self.assertEqual(history.undo(db, entries[0]["id"], after), self.data)


if __name__ == "__main__":
    unittest.main()
