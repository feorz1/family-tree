"""Check that a public snapshot references valid records and available photos."""
from server import DATA, REPO, read_data, validate

data = read_data((REPO / DATA).read_bytes())
validate(data, None)
print(f"Checked {len(data['charts'])} charts and {sum(len(c['nodes']) for c in data['charts'])} cards.")
