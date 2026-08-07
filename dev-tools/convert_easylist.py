#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

PROTECTED_INFRASTRUCTURE = {
    "googleapis.com", "ajax.googleapis.com", "fonts.googleapis.com",
    "gstatic.com", "cloudflare.com", "cdnjs.cloudflare.com",
    "jsdelivr.net", "unpkg.com", "githubassets.com"
}

def extract_pure_ad_domain(line):
    """Extracts ONLY dedicated ad/tracker domains (skips normal sites with paths)"""
    if line.startswith("@@"):
        return None

    if not line.startswith("||"):
        return None

    raw = line[2:]

    # Strip options after $
    if "$" in raw:
        raw = raw.split("$")[0]

    # Check for paths
    if "/" in raw:
        parts = raw.split("/", 1)
        domain_part = parts[0]
        path_clean = parts[1].rstrip("^")
        # If there is an actual path (e.g. /ad.js, /telemetry), SKIP IT!
        # Do NOT add normal websites to the domain blocklist.
        if path_clean:
            return None
    else:
        domain_part = raw.rstrip("^")

    domain_part = domain_part.lower().strip()

    if not domain_part or "*" in domain_part or " " in domain_part:
        return None

    if "." not in domain_part or domain_part in PROTECTED_INFRASTRUCTURE:
        return None

    parts = domain_part.split(".")
    if len(parts[-1]) < 2 or len(parts[0]) < 1:
        return None

    return domain_part

def main():
    in_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("easylist_raw.txt")
    lines = in_path.read_text(errors="ignore").splitlines()

    blocked_domains = set()

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("!") or line.startswith("["):
            continue

        if "##" in line or "#@#" in line or "#?#" in line or "#$#" in line:
            continue

        domain = extract_pure_ad_domain(line)
        if domain:
            blocked_domains.add(domain)

    out_dir = Path("rules")
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "network_rules.json").write_text(json.dumps({"domains": sorted(list(blocked_domains))}))
    print(f"Extracted {len(blocked_domains)} dedicated ad/tracker domains.")

if __name__ == "__main__":
    main()
