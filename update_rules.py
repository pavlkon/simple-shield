#!/usr/bin/env python3
import json
import urllib.request
from pathlib import Path

LIST_URLS = [
    "https://raw.githubusercontent.com/d3ward/toolz/master/src/d3host.txt",
    "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt",
    "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.txt",
    "https://raw.githubusercontent.com/sjhgvr/oisd/main/domainswild2_big.txt",
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt",
    "https://easylist.to/easylist/easylist.txt",
    "https://easylist.to/easylist/easyprivacy.txt",
    "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext"
]

PROTECTED_INFRASTRUCTURE = {
    "googleapis.com", "ajax.googleapis.com", "fonts.googleapis.com",
    "gstatic.com", "cloudflare.com", "cdnjs.cloudflare.com",
    "jsdelivr.net", "unpkg.com", "githubassets.com"
}

def extract_domain_and_path(line):
    line = line.strip()
    if not line or line.startswith("!") or line.startswith("#") or line.startswith("["):
        return None, None

    if line.startswith("0.0.0.0 ") or line.startswith("127.0.0.1 "):
        parts = line.split()
        if len(parts) >= 2:
            domain = parts[1].lower().strip()
            if domain != "localhost" and "." in domain and domain not in PROTECTED_INFRASTRUCTURE:
                return domain, None
        return None, None

    if not line.startswith("||") and not line.startswith("@@") and "/" not in line and " " not in line:
        domain = line.lower().strip()
        if "." in domain and domain not in PROTECTED_INFRASTRUCTURE:
            parts = domain.split(".")
            if len(parts[-1]) >= 2 and len(parts[0]) >= 1:
                return domain, None

    if line.startswith("@@") or not line.startswith("||"):
        return None, None

    raw = line[2:]
    if "$" in raw:
        raw = raw.split("$")[0]

    if "/" in raw:
        parts = raw.split("/", 1)
        domain_part = parts[0].lower().strip()
        path_part = parts[1].rstrip("^").strip()

        if path_part and len(path_part) > 2 and "*" not in raw:
            clean_path_rule = f"{domain_part}/{path_part}".lower()
            return None, clean_path_rule
        else:
            domain_part = domain_part.rstrip("^")
    else:
        domain_part = raw.rstrip("^").lower().strip()

    if not domain_part or "*" in domain_part or " " in domain_part:
        return None, None

    if "." not in domain_part or domain_part in PROTECTED_INFRASTRUCTURE:
        return None, None

    parts = domain_part.split(".")
    if len(parts[-1]) < 2 or len(parts[0]) < 1:
        return None, None

    return domain_part, None

def main():
    blocked_domains = set()
    blocked_paths = set()

    print("Downloading and compiling blocklists...")
    for url in LIST_URLS:
        print(f"Fetching: {url}")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                content = response.read().decode('utf-8', errors='ignore')
                for line in content.splitlines():
                    domain, path_rule = extract_domain_and_path(line)
                    if domain:
                        blocked_domains.add(domain)
                    if path_rule:
                        blocked_paths.add(path_rule)
        except Exception as e:
            print(f" -> Failed to download {url}: {e}")

    out_dir = Path("rules")
    out_dir.mkdir(parents=True, exist_ok=True)

    # Save paths separately
    (out_dir / "network_paths.json").write_text(json.dumps({"paths": sorted(list(blocked_paths))}))

    # FIX: Split domains into 100,000-domain chunks so no individual JSON file exceeds 2MB!
    CHUNK_SIZE = 100000
    sorted_domains = sorted(list(blocked_domains))
    chunks = [sorted_domains[i:i + CHUNK_SIZE] for i in range(0, len(sorted_domains), CHUNK_SIZE)]

    for idx, chunk in enumerate(chunks):
        fname = f"network_rules_{idx}.json"
        (out_dir / fname).write_text(json.dumps({"domains": chunk}, separators=(',', ':')))

    print(f"\nSUCCESS: Saved {len(blocked_domains)} domains across {len(chunks)} small JSON chunk files!")

if __name__ == "__main__":
    main()
