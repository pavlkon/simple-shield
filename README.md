# Simple Shield Ad Blocker

A lightweight, in-memory ad and tracker blocker built for Firefox (Manifest V3).

![Benchmark Score](https://img.shields.io/badge/D3ward_Benchmark-100%25-brightgreen)
![License](https://img.shields.io/badge/License-GPLv3-blue)

## Features

- **0.01ms Request Engine:** Uses `webRequestBlocking` with $O(1)$ Hash Set lookups in RAM zero browser lag or stutter.
- **2.6+ Million Blocked Domains:** Powered by HaGeZi, OISD, StevenBlack, EasyList, and EasyPrivacy.
- **100% Local & Private:** Zero telemetry, no remote tracking, no "Acceptable Ads" pay-to-pass bypasses.
- **100% Benchmark Score:** Achieves a perfect 100% score on the d3ward ad-blocker benchmark.

## How to Build Rules

To fetch and compile the latest blocklists into JSON chunks:

```bash
python update_rules.py
