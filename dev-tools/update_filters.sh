#!/usr/bin/env bash
# Re-downloads the latest EasyList and regenerates rules/ + manifest.json.
# Run this from inside the dev-tools/ directory, or pass the extension root as $1.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_ROOT="${1:-$(dirname "$SCRIPT_DIR")}"

echo "Downloading latest EasyList..."
curl -sSL -o "$SCRIPT_DIR/easylist_raw.txt" \
  "https://raw.githubusercontent.com/easylist/easylist/gh-pages/easylist.txt"

echo "Converting to declarativeNetRequest rules..."
python3 "$SCRIPT_DIR/convert_easylist.py" "$SCRIPT_DIR/easylist_raw.txt" "$EXT_ROOT/rules"

echo "Rebuilding manifest.json..."
cd "$EXT_ROOT"
python3 - <<'PYEOF'
import json, glob
files = sorted(glob.glob('rules/network_rules_*.json'), key=lambda p: int(p.split('_')[-1].split('.')[0]))
entries = [{"id": f"network_rules_{i}", "enabled": (i == 0), "path": f}
           for i, f in enumerate(files)]
json.dump(entries, open('rules/manifest_rulesets.json', 'w'), indent=2)
PYEOF
python3 "$SCRIPT_DIR/build_manifest.py"
rm -f rules/manifest_rulesets.json

echo "Done. Reload the extension (about:debugging > This Firefox > Reload) to pick up the new list."
