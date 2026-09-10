#!/usr/bin/env python3
"""
Semi-automated PDF → JSON extractor for YKI B1 Trainer.

Parses "Förbered dig för allmän språkexamen" (Gimara Oy) and outputs
structured chapter data. Watermarks and mixed layout mean output always
needs manual curation before use — run with --raw to inspect extraction.

Usage:
  python scripts/extract_book.py \\
    --pdf "/path/to/swedish book.pdf" \\
    --out data/book.json \\
    --chapters 1

  python scripts/extract_book.py --pdf book.pdf --out /tmp/raw.json --raw --chapters 1
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import pymupdf
except ImportError:
    print("Install dependencies: pip install -r scripts/requirements.txt", file=sys.stderr)
    raise

CHAPTER_TITLES: dict[int, str] = {
    1: "Människan och omgivningen",
    2: "Vardagsliv",
    3: "Natur och miljö",
    4: "Hälsa och välbefinnande",
    5: "Fritid och hobbyer",
    6: "Arbete och utbildning",
    7: "Samhälle",
}

# PDF sometimes uses alternate spellings on title pages
CHAPTER_TITLE_ALIASES: dict[int, list[str]] = {
    4: ["Hälsa och välmående"],
    5: ["Fritid"],
    7: ["Samhället"],
}

WATERMARK_RE = re.compile(r"Omistaja Viet Dang.*", re.IGNORECASE)
PAGE_NUM_RE = re.compile(r"^\d{1,3}$")
SECTION_HEADER_RE = re.compile(
    r"^(Uppvärmning|BIOGRAFI|Vilket ord\?|Dialog|MODELL Dialog|Reagera|Berätta|Din åsikt|Att skriva)",
    re.IGNORECASE,
)

# ALL-CAPS vocabulary tokens (ÅÄÖ allowed); min 3 chars, skip common noise
VOCAB_TOKEN_RE = re.compile(r"^[A-ZÅÄÖ][A-ZÅÄÖ\s/\-]+$")


def clean_line(line: str) -> str:
    line = WATERMARK_RE.sub("", line).strip()
    line = re.sub(r"\s+", " ", line)
    return line


def page_texts(doc: pymupdf.Document) -> list[str]:
    pages: list[str] = []
    for page in doc:
        raw = page.get_text()
        lines = [clean_line(ln) for ln in raw.splitlines()]
        lines = [ln for ln in lines if ln and not PAGE_NUM_RE.match(ln)]
        pages.append("\n".join(lines))
    return pages


def chapter_titles_for(cid: int) -> list[str]:
    titles = [CHAPTER_TITLES[cid]]
    titles.extend(CHAPTER_TITLE_ALIASES.get(cid, []))
    return titles


def page_starts_chapter(text: str, cid: int) -> bool:
    """True when a page looks like a chapter opener (title page or section start)."""
    for title in chapter_titles_for(cid):
        if title not in text:
            continue
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if not lines:
            continue
        # Title-only page (watermark + title)
        if len(text) < 120:
            return True
        # First substantive line is the chapter title
        first = re.sub(r"^\d+\s*", "", lines[0])
        if first == title or first.endswith(title):
            return True
        # Early line matches (skip page number line)
        for line in lines[:4]:
            cleaned = re.sub(r"^\d+\s*", "", line)
            if cleaned == title:
                return True
    return False


def find_chapter_ranges(pages: list[str]) -> dict[int, tuple[int, int]]:
    """Return {chapter_id: (start_page_idx, end_page_idx_exclusive)}."""
    starts: list[tuple[int, int]] = []
    for cid in sorted(CHAPTER_TITLES):
        for idx, text in enumerate(pages):
            if page_starts_chapter(text, cid):
                starts.append((idx, cid))
                break

    starts.sort()
    ranges: dict[int, tuple[int, int]] = {}
    for i, (start_idx, cid) in enumerate(starts):
        end_idx = starts[i + 1][0] if i + 1 < len(starts) else len(pages)
        ranges[cid] = (start_idx, end_idx)
    return ranges


def extract_vocab_grids(text: str) -> list[str]:
    """Collect ALL-CAPS word-grid tokens from uppvärmning / themed sections."""
    words: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or SECTION_HEADER_RE.match(line):
            continue
        if len(line) > 60:
            continue
        if VOCAB_TOKEN_RE.match(line) and len(line) >= 3:
            token = line.strip()
            if token not in seen and token not in {"MODELL", "DIALOG", "BIOGRAFI"}:
                seen.add(token)
                words.append(token)
    return words


def extract_verbs(text: str) -> list[dict[str, str]]:
    verbs: list[dict[str, str]] = []
    in_biografi = False
    for line in text.splitlines():
        if "BIOGRAFI" in line and "verb" in line.lower():
            in_biografi = True
            continue
        if in_biografi:
            if SECTION_HEADER_RE.match(line) and "BIOGRAFI" not in line:
                break
            m = re.match(r"^([A-ZÅÄÖ][A-ZÅÄÖ\s/\-]+?)\s*\+\s*(.+)$", line)
            if m:
                sv = m.group(1).strip()
                prompt = m.group(2).strip()
                if len(sv) < 50:
                    verbs.append({"sv": sv, "prompt_sv": prompt})
    return verbs


def extract_vilket_ord(text: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    in_section = False
    questions: dict[int, str] = {}
    answers: dict[int, str] = {}
    current_q: int | None = None

    for line in text.splitlines():
        if line.strip() == "Vilket ord?":
            in_section = True
            continue
        if not in_section:
            continue
        if SECTION_HEADER_RE.match(line) and "Vilket ord" not in line:
            break

        key_parts = re.findall(r"(\d+)\.\s+([^\d]+?)(?=\s+\d+\.|$)", line)
        if len(key_parts) >= 3:
            current_q = None
            for num_s, ans in key_parts:
                answers[int(num_s)] = re.sub(r"\s*\(.*\)$", "", ans.strip().rstrip(")")).strip()
            continue

        qm = re.match(r"^(\d+)\.\s+(.+)$", line)
        if qm:
            current_q = int(qm.group(1))
            questions[current_q] = qm.group(2).strip()
        elif current_q is not None and line.strip():
            questions[current_q] = questions[current_q] + " " + line.strip()

    for i in sorted(questions):
        if i in answers and answers[i]:
            items.append({"question_sv": questions[i], "answer_sv": answers[i]})
    return items


def extract_numbered_prompts(text: str, header: str) -> list[str]:
    prompts: list[str] = []
    in_section = False
    buf: list[str] = []

    for line in text.splitlines():
        if line.strip() == header:
            in_section = True
            continue
        if in_section:
            if SECTION_HEADER_RE.match(line) and header not in line:
                if buf:
                    prompts.append(" ".join(buf).strip())
                break
            m = re.match(r"^(\d+)\.\s+(.+)$", line)
            if m:
                if buf:
                    prompts.append(" ".join(buf).strip())
                buf = [m.group(2).strip()]
            elif line.strip().startswith("•") or line.strip().startswith("-"):
                if buf:
                    prompts.append(" ".join(buf).strip())
                    buf = []
            elif buf and line.strip() and not PAGE_NUM_RE.match(line.strip()):
                if re.match(r"^[A-Z]\.\s", line.strip()):
                    if buf:
                        prompts.append(" ".join(buf).strip())
                        buf = []
                    prompts.append(line.strip())
                else:
                    buf.append(line.strip())
    if buf:
        prompts.append(" ".join(buf).strip())
    return [p for p in prompts if len(p) > 10]


def extract_letter_prompts(text: str, header: str) -> list[str]:
    prompts: list[str] = []
    in_section = False
    current: list[str] = []

    for line in text.splitlines():
        if line.strip() == header:
            in_section = True
            continue
        if in_section:
            if SECTION_HEADER_RE.match(line) and header not in line:
                break
            if re.match(r"^[A-Z]\.\s", line.strip()):
                if current:
                    prompts.append("\n".join(current).strip())
                current = [line.strip()]
            elif current and line.strip():
                current.append(line.strip())
    if current:
        prompts.append("\n".join(current).strip())
    return prompts


def extract_dialogues(text: str, chapter_id: int) -> list[dict]:
    dialogues: list[dict] = []
    titles = "|".join(re.escape(t) for t in chapter_titles_for(chapter_id))
    pattern = re.compile(
        rf"Dialog\s*(\d+)\.?\s+(?:{titles})\s*\n(.*?)(?=\nDialog\s*\d|MODELL Dialog|Reagera\n|$)",
        re.DOTALL,
    )
    for m in pattern.finditer(text):
        if "MODELL" in m.group(0)[:30]:
            continue
        num = int(m.group(1))
        body = m.group(2).strip()
        lines = [ln for ln in body.splitlines() if ln.strip() and ln.strip() != "***"]
        scenario: list[str] = []
        hints: list[str] = []
        for ln in lines:
            if ln.startswith("(") and ln.endswith(")"):
                hints.append(ln)
            elif not re.match(r"^(Vän|Du|Kollega|Bekant|Försäljare|Budbärare|Disponent):", ln):
                scenario.append(ln)
        prompt = " ".join(scenario).strip()
        if hints:
            prompt += "\n\n" + "\n".join(hints)
        dialogues.append({"num": num, "prompt_sv": prompt, "model_sv": ""})

    models = extract_models(text)
    for d in dialogues:
        if d["num"] in models:
            d["model_sv"] = models[d["num"]]

    dialogues.sort(key=lambda d: d["num"])
    return dialogues


MODELL_HEADER_RE = re.compile(r"^MODELL:?\s*Dialog\s*(\d+)\.?\s*(.*)$", re.IGNORECASE)


def extract_models(text: str) -> dict[int, str]:
    """Parse MODELL Dialog N blocks into {num: model text}."""
    models: dict[int, str] = {}
    parts = re.split(r"(?=MODELL:?\s*Dialog\s*\d+)", text)
    for part in parts:
        lines = [ln.strip() for ln in part.splitlines() if ln.strip()]
        if not lines:
            continue
        header = MODELL_HEADER_RE.match(lines[0])
        if not header:
            continue
        num = int(header.group(1))
        body: list[str] = []
        for ln in lines[1:]:
            if re.match(r"^Dialog\s+\d+", ln) and not ln.upper().startswith("MODELL"):
                break
            if ln == "***":
                continue
            if ln in CHAPTER_TITLES.values() or ln in {"Fritid", "Samhället"}:
                continue
            body.append(ln)
        model = "\n".join(body).strip()
        if model:
            models[num] = model
    return models


def _writing_type(title: str) -> str:
    lower = title.lower()
    if "klagomål" in lower:
        return "klagomål"
    if "e-post" in lower or "brev" in lower:
        return "e-post"
    if "meddelande" in lower or "inbjudan" in lower:
        return "meddelande"
    return "övrigt"


def extract_writing(text: str) -> list[dict[str, str]]:
    tasks: list[dict[str, str]] = []
    in_section = False
    current_type: str | None = None
    buf: list[str] = []
    ovning_re = re.compile(r"^Övning\s+(\d+)\s*[.:]?\s*(.*)$")

    def flush() -> None:
        nonlocal current_type, buf
        prompt = "\n".join(buf).strip()
        if current_type and len(prompt) > 40:
            tasks.append({"type": current_type, "prompt_sv": prompt})
        current_type = None
        buf = []

    for line in text.splitlines():
        stripped = line.strip()
        if stripped == "Att skriva":
            in_section = True
            continue
        if not in_section:
            continue
        if stripped in CHAPTER_TITLES.values() or stripped in {"Fritid", "Samhället"}:
            break
        ov = ovning_re.match(stripped)
        if ov:
            flush()
            current_type = _writing_type(ov.group(2) or f"Övning {ov.group(1)}")
            title = ov.group(2).strip()
            if title:
                buf = [title]
            else:
                buf = []
            continue
        if current_type and stripped:
            buf.append(stripped)

    flush()
    return tasks[:3]


def extract_chapter(pages: list[str], chapter_id: int) -> dict:
    ranges = find_chapter_ranges(pages)
    if chapter_id not in ranges:
        raise ValueError(f"Chapter {chapter_id} not found in PDF")

    start, end = ranges[chapter_id]
    text = "\n".join(pages[start:end])
    title = CHAPTER_TITLES[chapter_id]

    return {
        "id": chapter_id,
        "title_sv": title,
        "vocabulary": extract_vocab_grids(text),
        "verbs": extract_verbs(text),
        "vilket_ord": extract_vilket_ord(text),
        "dialogues": dedupe_dialogues(extract_dialogues(text, chapter_id)),
        "reagera": extract_numbered_prompts(text, "Reagera"),
        "beratta": extract_letter_prompts(text, "Berätta"),
        "asikt": extract_letter_prompts(text, "Din åsikt"),
        "writing": split_writing_tasks(extract_writing(text)),
        "_meta": {
            "page_range": [start + 1, end],
            "needs_curation": True,
        },
    }


def dedupe_dialogues(dialogues: list[dict]) -> list[dict]:
    by_num: dict[int, dict] = {}
    for d in dialogues:
        num = d["num"]
        prev = by_num.get(num)
        if prev is None:
            by_num[num] = d
            continue
        prompt = d["prompt_sv"] if len(d["prompt_sv"]) >= len(prev["prompt_sv"]) else prev["prompt_sv"]
        model = (
            d["model_sv"]
            if len(d.get("model_sv") or "") >= len(prev.get("model_sv") or "")
            else prev.get("model_sv") or ""
        )
        by_num[num] = {"num": num, "prompt_sv": prompt, "model_sv": model}
    return [by_num[k] for k in sorted(by_num)]


def split_writing_tasks(tasks: list[dict[str, str]]) -> list[dict[str, str]]:
    if len(tasks) >= 3:
        return tasks[:3]
    if not tasks:
        return []
    blob = "\n".join(t["prompt_sv"] for t in tasks)
    chunks = re.split(r"(?=\n(?:Du har |Skriv |Välj tema|Välj A))", "\n" + blob)
    chunks = [c.strip() for c in chunks if len(c.strip()) > 50]
    if len(chunks) < 2:
        return tasks[:3]
    return [{"type": _writing_type(chunk.split("\n", 1)[0]), "prompt_sv": chunk} for chunk in chunks[:3]]


def merge_curated(base: dict, curated_path: Path | None) -> dict:
    """If curated book.json exists, preserve model_sv and other hand-edited fields."""
    if curated_path is None or not curated_path.exists():
        return base

    curated = json.loads(curated_path.read_text(encoding="utf-8"))
    curated_chapters = {c["id"]: c for c in curated.get("chapters", [])}
    cid = base["id"]
    if cid not in curated_chapters:
        return base

    hand = curated_chapters[cid]
    for d in base.get("dialogues", []):
        for hd in hand.get("dialogues", []):
            if hd["num"] == d["num"] and hd.get("model_sv"):
                d["model_sv"] = hd["model_sv"]
    return base


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract YKI book content from PDF")
    parser.add_argument("--pdf", required=True, type=Path, help="Path to Swedish book PDF")
    parser.add_argument("--out", required=True, type=Path, help="Output JSON path")
    parser.add_argument(
        "--chapters",
        default="1",
        help="Comma-separated chapter IDs to extract (default: 1)",
    )
    parser.add_argument(
        "--merge",
        type=Path,
        default=None,
        help="Existing curated book.json to merge model_sv from",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Keep _meta and empty model_sv (for inspection)",
    )
    args = parser.parse_args()

    if not args.pdf.exists():
        print(f"PDF not found: {args.pdf}", file=sys.stderr)
        sys.exit(1)

    chapter_ids = [int(x.strip()) for x in args.chapters.split(",")]
    doc = pymupdf.open(args.pdf)
    pages = page_texts(doc)

    chapters: list[dict] = []
    for cid in chapter_ids:
        ch = extract_chapter(pages, cid)
        ch = merge_curated(ch, args.merge or (args.out if args.out.exists() else None))
        if not args.raw:
            ch.pop("_meta", None)
        chapters.append(ch)

    out_data: dict = {"chapters": chapters}
    merge_source = args.merge or (args.out if args.out.exists() else None)
    if merge_source and merge_source.exists():
        existing = json.loads(merge_source.read_text(encoding="utf-8"))
        existing_ids = {c["id"] for c in chapters}
        for ch in existing.get("chapters", []):
            if ch["id"] not in existing_ids:
                chapters.append(ch)
        chapters.sort(key=lambda c: c["id"])
        out_data = {"chapters": chapters}

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(chapters)} chapter(s) to {args.out}")


if __name__ == "__main__":
    main()
