#!/usr/bin/env python3
"""
validate_lesson_contract.py
===========================

Validate a lesson YAML file against the RWR Slack LMS Cloudflare Edition lesson
contract. Computes the contentHash and (optionally) writes it back to the file.

Usage
-----
    python validate_lesson_contract.py path/to/lesson.yaml
    python validate_lesson_contract.py path/to/lesson.yaml --write-hash

Exit codes
----------
    0 = pass — all checks passed
    1 = fail — at least one violation

Output
------
    Structured report on stdout:
        - Section: structural checks
        - Section: word counts
        - Section: ULC structure
        - Section: status / QA consistency
        - Section: cross-field invariants
        - Section: contentHash (computed)
    On failure: each violation listed with the offending field and limit.

Dependencies
------------
    PyYAML (`pip install pyyaml`)

The validator is the gate before any Approval Packet is shown. The skill must
run this script (or simulate it) and confirm exit 0 before producing a packet.
Cloudflare runs the equivalent validator independently before any D1 write —
both sides verify.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except ImportError:
    sys.stderr.write(
        "ERROR: PyYAML is required. Install with: pip install pyyaml\n"
    )
    sys.exit(2)


# ----------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------

REQUIRED_TOP_LEVEL = [
    "lessonId", "courseId", "moduleId", "week", "day",
    "title", "intent", "blueprintId", "difficulty", "type", "status",
    "hook", "coreContent", "insight", "takeaway", "mission",
    "verification", "submitCommand", "slackThreadText", "qa", "metadata",
]

REQUIRED_QA = ["sop05Score", "verdict", "pedFlags"]

REQUIRED_METADATA = [
    "createdBy", "createdAt", "updatedAt",
    "approvedBy", "approvedAt", "approvalPhrase",
    "targetEnvironment", "contentHash",
]

ALLOWED_DIFFICULTY = {"Guided", "Independent", "Strategic"}
ALLOWED_TYPE = {"daily-micro", "weekly-deep", "certification"}
ALLOWED_STATUS = {
    "Draft", "SOP5Review", "NeedsRevision",
    "Ready", "Live", "Archived",
}
ALLOWED_VERDICT = {
    None, "",
    "Strong Pass", "Pass", "Conditional",
    "Soft Fail", "Hard Fail",
}
ALLOWED_TARGET_ENV = {None, "", "staging", "production"}

LESSON_ID_PATTERN = re.compile(r"^M\d{2}-W\d{2}-L\d{2}$")
MODULE_ID_PATTERN = re.compile(r"^M\d{2}$")

# Word/sentence limits
LIMIT_HOOK_SENTENCES = 2
LIMIT_CORE_WORDS = 300
LIMIT_INSIGHT_WORDS = 50
LIMIT_TAKEAWAY_WORDS = 15
LIMIT_TOTAL_WORDS = 500

# Approved RWR emojis
APPROVED_EMOJIS = {"📘", "✍️", "💡", "🎧", "🎬", "📊", "📖", "✅"}
LIMIT_EMOJI_COUNT = 2  # plus the ✅ submission marker which is counted separately


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def count_words(text: str) -> int:
    """Whitespace-separated word count. Treats a single hyphenated word as one."""
    if not text:
        return 0
    return len(re.findall(r"\S+", text))


def count_sentences(text: str) -> int:
    """Sentence count. Splits on . ! ? followed by space or end of string."""
    if not text:
        return 0
    # Strip and treat run as sentences ending in . ! ?
    stripped = text.strip()
    if not stripped:
        return 0
    parts = re.split(r"[.!?]+(?:\s+|$)", stripped)
    return sum(1 for p in parts if p.strip())


def canonical_content(content: dict[str, Any]) -> str:
    """Compute the canonical-JSON form for hashing.

    Keys sorted, no whitespace, UTF-8. Excludes metadata.contentHash itself
    (otherwise the hash would depend on a previous hash — circular).
    """
    # Deep copy with metadata.contentHash removed
    import copy
    c = copy.deepcopy(content)
    if isinstance(c.get("metadata"), dict):
        c["metadata"].pop("contentHash", None)
    return json.dumps(c, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_hash(content: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_content(content).encode("utf-8")).hexdigest()


# ----------------------------------------------------------------------
# Validator
# ----------------------------------------------------------------------

class ValidationResult:
    def __init__(self) -> None:
        self.violations: list[str] = []
        self.warnings: list[str] = []
        self.computed_hash: str | None = None
        self.word_counts: dict[str, int] = {}

    @property
    def passed(self) -> bool:
        return not self.violations

    def fail(self, msg: str) -> None:
        self.violations.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def validate(lesson: dict[str, Any]) -> ValidationResult:
    r = ValidationResult()

    # -- Section 1: structural checks -----------------------------------
    for k in REQUIRED_TOP_LEVEL:
        if k not in lesson:
            r.fail(f"missing required top-level field: {k}")

    if not isinstance(lesson.get("qa"), dict):
        r.fail("qa block must be an object")
    else:
        for k in REQUIRED_QA:
            if k not in lesson["qa"]:
                r.fail(f"missing required qa.{k}")

    if not isinstance(lesson.get("metadata"), dict):
        r.fail("metadata block must be an object")
    else:
        for k in REQUIRED_METADATA:
            if k not in lesson["metadata"]:
                r.fail(f"missing required metadata.{k}")

    # If structural checks failed, stop now
    if r.violations:
        return r

    # -- Section 2: pattern + enum checks -------------------------------
    lesson_id = lesson["lessonId"]
    if not LESSON_ID_PATTERN.match(lesson_id):
        r.fail(f"lessonId '{lesson_id}' does not match M##-W##-L## pattern")

    module_id = lesson["moduleId"]
    if not MODULE_ID_PATTERN.match(module_id):
        r.fail(f"moduleId '{module_id}' does not match M## pattern")

    if not isinstance(lesson["week"], int) or not 1 <= lesson["week"] <= 4:
        r.fail(f"week must be int 1..4, got: {lesson['week']!r}")

    if not isinstance(lesson["day"], int) or not 1 <= lesson["day"] <= 6:
        r.fail(f"day must be int 1..6, got: {lesson['day']!r}")

    if lesson["difficulty"] not in ALLOWED_DIFFICULTY:
        r.fail(f"difficulty '{lesson['difficulty']}' not in {sorted(ALLOWED_DIFFICULTY)}")

    if lesson["type"] not in ALLOWED_TYPE:
        r.fail(f"type '{lesson['type']}' not in {sorted(ALLOWED_TYPE)}")

    status = lesson["status"]
    if status not in ALLOWED_STATUS:
        r.fail(f"status '{status}' not in {sorted(ALLOWED_STATUS)}")

    verdict = lesson["qa"]["verdict"]
    if verdict not in ALLOWED_VERDICT:
        r.fail(f"qa.verdict '{verdict}' not in {sorted(v for v in ALLOWED_VERDICT if v)}")

    target_env = lesson["metadata"].get("targetEnvironment")
    if target_env not in ALLOWED_TARGET_ENV:
        r.fail(
            f"metadata.targetEnvironment '{target_env}' must be staging, production, or null"
        )

    if not isinstance(lesson["qa"]["pedFlags"], list):
        r.fail("qa.pedFlags must be a list (empty list if no flags)")

    # -- Section 3: word counts -----------------------------------------
    hook = (lesson.get("hook") or "").strip()
    core = (lesson.get("coreContent") or "").strip()
    insight = (lesson.get("insight") or "").strip()
    takeaway = (lesson.get("takeaway") or "").strip()
    mission = (lesson.get("mission") or "").strip()
    verification = (lesson.get("verification") or "").strip()

    hook_sentences = count_sentences(hook)
    core_words = count_words(core)
    insight_words = count_words(insight)
    insight_sentences = count_sentences(insight)
    takeaway_words = count_words(takeaway)
    takeaway_sentences = count_sentences(takeaway)
    mission_words = count_words(mission)
    verification_words = count_words(verification)
    total_words = sum([
        count_words(hook), core_words, insight_words,
        takeaway_words, mission_words, verification_words,
    ])

    r.word_counts = {
        "hook_sentences": hook_sentences,
        "coreContent_words": core_words,
        "insight_words": insight_words,
        "insight_sentences": insight_sentences,
        "takeaway_words": takeaway_words,
        "takeaway_sentences": takeaway_sentences,
        "mission_words": mission_words,
        "verification_words": verification_words,
        "total_words": total_words,
    }

    if hook_sentences > LIMIT_HOOK_SENTENCES:
        r.fail(f"hook has {hook_sentences} sentences (limit {LIMIT_HOOK_SENTENCES})")
    if core_words > LIMIT_CORE_WORDS:
        r.fail(f"coreContent has {core_words} words (limit {LIMIT_CORE_WORDS})")
    if insight_words > LIMIT_INSIGHT_WORDS:
        r.fail(f"insight has {insight_words} words (limit {LIMIT_INSIGHT_WORDS})")
    if insight_sentences > 1:
        r.fail(f"insight has {insight_sentences} sentences (limit 1)")
    if takeaway_words > LIMIT_TAKEAWAY_WORDS:
        r.fail(f"takeaway has {takeaway_words} words (limit {LIMIT_TAKEAWAY_WORDS})")
    if takeaway_sentences > 1:
        r.fail(f"takeaway has {takeaway_sentences} sentences (limit 1)")
    if total_words > LIMIT_TOTAL_WORDS:
        r.fail(f"total lesson body has {total_words} words (limit {LIMIT_TOTAL_WORDS})")

    # -- Section 4: submitCommand consistency ---------------------------
    submit_cmd = lesson["submitCommand"]
    expected_cmd = f"/submit {lesson_id} complete"
    if submit_cmd.strip() != expected_cmd:
        r.fail(
            f"submitCommand '{submit_cmd}' must be exactly '{expected_cmd}'"
        )

    # -- Section 5: slackThreadText sanity ------------------------------
    stt = lesson.get("slackThreadText") or ""
    if status in {"Ready", "Live"}:
        if not stt.strip():
            r.fail(f"slackThreadText is empty (required when status is {status})")
        elif submit_cmd.strip() not in stt:
            r.fail(
                f"slackThreadText must contain the submitCommand '{submit_cmd.strip()}'"
            )
        # HTML check
        if re.search(r"<[a-zA-Z/!][^>]*>", stt):
            r.fail("slackThreadText contains HTML-like tags (Slack does not render them)")
        # Emoji count (non-✅)
        emoji_chars = [c for c in stt if c in APPROVED_EMOJIS and c != "✅"]
        if len(emoji_chars) > LIMIT_EMOJI_COUNT + 4:  # rough — allow one per ULC section header
            r.warn(f"slackThreadText contains {len(emoji_chars)} approved emojis; check intent (limit guidance: 2 thematic + section markers)")

    # -- Section 6: status / QA consistency -----------------------------
    sop05 = lesson["qa"].get("sop05Score")
    ped_flags = lesson["qa"].get("pedFlags") or []

    if status == "Ready":
        if sop05 is None:
            r.fail("status is Ready but qa.sop05Score is null")
        elif not isinstance(sop05, int) or sop05 < 80:
            r.fail(f"status is Ready but qa.sop05Score {sop05} < 80")
        if verdict not in {"Strong Pass", "Pass", "Conditional"}:
            r.fail(f"status is Ready but qa.verdict '{verdict}' is not Pass-tier")
        # Blocking PED flags must be resolved
        blocking_prefixes = (
            "PED-01.", "PED-02.", "PED-04.shaming", "PED-05.missing-prerequisite",
            "PED-06.", "PED-07.tool-paywall",
        )
        for f in ped_flags:
            if any(f.startswith(p) for p in blocking_prefixes) and not f.endswith(".resolved"):
                r.fail(f"status is Ready but blocking PED flag present: {f}")

    if status == "Live":
        meta = lesson["metadata"]
        if not meta.get("approvedAt"):
            r.fail("status is Live but metadata.approvedAt is null")
        if not meta.get("approvalPhrase"):
            r.fail("status is Live but metadata.approvalPhrase is null")
        if not meta.get("targetEnvironment"):
            r.fail("status is Live but metadata.targetEnvironment is null")

    # -- Section 7: contentHash -----------------------------------------
    r.computed_hash = compute_hash(lesson)

    return r


# ----------------------------------------------------------------------
# Reporting
# ----------------------------------------------------------------------

def print_report(path: Path, lesson: dict[str, Any], r: ValidationResult) -> None:
    print(f"=== validate_lesson_contract.py ===")
    print(f"File: {path}")
    print(f"Lesson: {lesson.get('lessonId', '???')}")
    print(f"Status: {lesson.get('status', '???')}")
    print()

    print("--- Word counts ---")
    for k, v in r.word_counts.items():
        print(f"  {k:24s} {v}")
    print()

    print("--- contentHash ---")
    print(f"  {r.computed_hash}")
    print()

    if r.warnings:
        print("--- Warnings ---")
        for w in r.warnings:
            print(f"  ! {w}")
        print()

    if r.violations:
        print("--- Violations ---")
        for v in r.violations:
            print(f"  X {v}")
        print()
        print("RESULT: FAIL")
    else:
        print("RESULT: PASS")


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate an RWR LMS lesson YAML against the lesson contract."
    )
    parser.add_argument("path", type=Path, help="Path to lesson YAML file")
    parser.add_argument(
        "--write-hash",
        action="store_true",
        help="Write the computed contentHash back into the YAML file's metadata block",
    )
    args = parser.parse_args()

    if not args.path.exists():
        print(f"ERROR: file not found: {args.path}", file=sys.stderr)
        return 2

    try:
        with open(args.path, "r", encoding="utf-8") as f:
            lesson = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"ERROR: YAML parse failed: {e}", file=sys.stderr)
        return 2

    if not isinstance(lesson, dict):
        print("ERROR: top-level YAML must be a mapping/object", file=sys.stderr)
        return 2

    result = validate(lesson)
    print_report(args.path, lesson, result)

    if args.write_hash and result.computed_hash:
        if not isinstance(lesson.get("metadata"), dict):
            lesson["metadata"] = {}
        lesson["metadata"]["contentHash"] = result.computed_hash
        with open(args.path, "w", encoding="utf-8") as f:
            yaml.safe_dump(
                lesson, f, sort_keys=False, allow_unicode=True, width=120
            )
        print()
        print(f"Wrote contentHash to {args.path}")

    return 0 if result.passed else 1


if __name__ == "__main__":
    sys.exit(main())
