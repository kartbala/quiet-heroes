#!/usr/bin/env python3
"""Validate heroes.json and the audio directory. Exit 1 on any problem."""
import collections
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def main() -> int:
    problems = []
    with open(os.path.join(HERE, "heroes.json")) as fh:
        heroes = json.load(fh)["heroes"]
    seen = collections.Counter()
    ids = collections.Counter()
    for h in heroes:
        for k in ("id", "name", "blurb", "month", "day", "year", "anchor_reason",
                  "date_confidence", "story", "sources"):
            if k not in h:
                problems.append(f"{h.get('id', '?')}: missing {k}")
        try:
            datetime.date(h["year"], h["month"], h["day"])
        except (ValueError, KeyError) as e:
            problems.append(f"{h.get('id', '?')}: bad date ({e})")
        seen[(h["month"], h["day"])] += 1
        ids[h["id"]] += 1
        words = len(h["story"].split())
        if not 120 <= words <= 200:
            problems.append(f"{h['id']}: story is {words} words")
        if len(h["blurb"].split()) > 15:
            problems.append(f"{h['id']}: blurb over 15 words")
        if "—" in h["story"] or "—" in h["blurb"]:
            problems.append(f"{h['id']}: em dash")
        if not h["sources"]:
            problems.append(f"{h['id']}: no sources")
        mp3 = os.path.join(HERE, "audio", h["id"] + ".mp3")
        if not os.path.exists(mp3) or os.path.getsize(mp3) < 5 * 1024:
            problems.append(f"{h['id']}: audio missing or under 5 KB")
    for k, v in seen.items():
        if v > 1:
            problems.append(f"duplicate date {k[0]:02d}-{k[1]:02d} ({v} heroes)")
    for k, v in ids.items():
        if v > 1:
            problems.append(f"duplicate id {k}")
    per_month = collections.Counter(h["month"] for h in heroes)
    for m in range(1, 13):
        if per_month[m] < 3:
            problems.append(f"month {m} has only {per_month[m]} heroes")
    total_audio = sum(os.path.getsize(os.path.join(HERE, "audio", f))
                      for f in os.listdir(os.path.join(HERE, "audio"))
                      if f.endswith(".mp3"))
    print(f"{len(heroes)} heroes, per month {dict(sorted(per_month.items()))}, "
          f"audio {total_audio / 1e6:.1f} MB")
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
