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

# Skip intro/TOC (PDF pages 1–6) and back-cover blurb (last page)
INTRO_PAGE_COUNT = 6
BACK_COVER_PAGE_COUNT = 1

WATERMARK_RE = re.compile(r"Omistaja Viet Dang.*", re.IGNORECASE)
PAGE_NUM_RE = re.compile(r"^\d{1,3}$")
SECTION_HEADER_RE = re.compile(
    r"^(Uppvärmning|BIOGRAFI|Vilket ord\?|Dialog|MODELL:?\s*Dialogi?|Reagera|Berätta|Din åsikt|Att skriva)",
    re.IGNORECASE,
)

TRUE_SECTION_HEADERS = frozenset(
    {
        "Uppvärmning",
        "Reagera",
        "Berätta",
        "Din åsikt",
        "Att skriva",
        "Vilket ord?",
    }
)

SPEAKING_TRAILER_RE = re.compile(
    r"(?:\n|^)(Berätta|Din åsikt|Att skriva|Reagera)$",
    re.IGNORECASE | re.MULTILINE,
)

TIMING_JUNK_RE = re.compile(r"^\d+\s*sek\.?$", re.IGNORECASE)


# ALL-CAPS vocabulary tokens (ÅÄÖ allowed); min 3 chars, skip common noise
VOCAB_TOKEN_RE = re.compile(r"^[A-ZÅÄÖ][A-ZÅÄÖ\s/\-]+$")

VOCAB_DENYLIST = frozenset(
    {
        "MODELL",
        "DIALOG",
        "BIOGRAFI",
        "UPPVÄRMNING",
        "LYSSNA",
        "LÄSA EN BOK",
        "SKRIVA UT",
        "INNEHÅLLSFÖRTECKNING",
    }
)

VOCAB_DENY_SUBSTRINGS = ("TALARE/", "MODELL", "DIALOG")

MODELL_HEADER_RE = re.compile(r"^MODELL:?\s*Dialogi?\s*(\d+)\.?\s*(.*)$", re.IGNORECASE)
MODELL_SPLIT_RE = re.compile(r"(?=MODELL:?\s*Dialogi?\s*\d+)", re.IGNORECASE)

MODEL_STOP_LINE_RE = re.compile(
    r"^(Dialog\s+\d+|Reagera|Berätta|Din åsikt|Att skriva)$",
    re.IGNORECASE,
)

DIALOGUE_CUE_ONLY_RE = re.compile(
    r"^(Vän|Du|Kollega|Bekant|Försäljare|Budbärare|Disponent|Chef|Frisör|Man|Tjänsteman|"
    r"Säljare|Försäljare|Kvinna|Sinä|Ilona|Nieminen|Säljare):\s*$",
    re.IGNORECASE,
)

SPEAKER_LINE_RE = re.compile(
    r"^(Vän|Du|Kollega|Bekant|Försäljare|Budbärare|Disponent|Chef|Frisör|Man|Tjänsteman|"
    r"Säljare|Kvinna|Sinä|Ilona|Nieminen|Tjänsteman):\s*",
    re.IGNORECASE,
)

OVNING_RE = re.compile(r"^Övning\s+(\d+)\s*[.:]?\s*(.*)$", re.IGNORECASE | re.MULTILINE)

WRITING_BLOCK_START_RE = re.compile(
    r"^(?:Du (?:vill|har|letar|är|sitter|behöver|tycker)|"
    r"Din (?:utländska vän|kollega|vän vill)|"
    r"Välj (?:tema )?[AB]|Det (?:finns|hyreshus)|Något viktigt|"
    r"Konst eller sport|Övning\s+\d+)",
    re.MULTILINE,
)

WRITING_TRAILER_RE = re.compile(
    r"\nAtt förbereda sig för provet.*$|(?:\n|^)S?BN 978-.*$",
    re.IGNORECASE | re.DOTALL,
)

SPEAKING_STOP_RE = re.compile(r"^(Att skriva|Vardagsliv|Natur och miljö|Fritid|Samhälle)$")

WARMUP_STOP_RE = re.compile(
    r"^(BIOGRAFI|Vilket ord\?|Dialog\s+\d|MODELL:?\s*Dialogi?)",
    re.IGNORECASE,
)


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


def all_chapter_title_lines() -> set[str]:
    titles: set[str] = set()
    for cid in CHAPTER_TITLES:
        titles.update(chapter_titles_for(cid))
    titles.update({"Fritid", "Samhället"})
    return titles


CHAPTER_TITLE_LINES = all_chapter_title_lines()


def is_chapter_title_line(line: str) -> bool:
    cleaned = re.sub(r"^\d+\s*", "", line.strip())
    return cleaned in CHAPTER_TITLE_LINES


def is_true_section_header(line: str) -> bool:
    """Lone section divider — not 'Berätta för din granne…' glued to a prompt."""
    stripped = line.strip()
    if stripped in TRUE_SECTION_HEADERS:
        return True
    if stripped.startswith("BIOGRAFI"):
        return True
    if MODELL_HEADER_RE.match(stripped):
        return True
    if re.match(r"^Dialog\s+\d+", stripped, re.IGNORECASE) and not stripped.upper().startswith("MODELL"):
        return True
    return False


def _strip_trailing_chapter_title(text: str) -> str:
    text = text.strip()
    for title in sorted(CHAPTER_TITLE_LINES, key=len, reverse=True):
        if text.endswith(title):
            text = text[: -len(title)].strip()
    return text


def _dedupe_consecutive(items: list[str]) -> list[str]:
    result: list[str] = []
    for item in items:
        if result and result[-1] == item:
            continue
        result.append(item)
    return result


def _strip_speaking_trailer(block: str) -> str:
    block = SPEAKING_TRAILER_RE.sub("", block).strip()
    lines = block.splitlines()
    while lines and (is_chapter_title_line(lines[-1]) or lines[-1].strip() in TRUE_SECTION_HEADERS):
        lines.pop()
    return "\n".join(lines).strip()


def is_chapter_opener(text: str, cid: int) -> bool:
    """True when a page is the chapter title page (not every running header)."""
    titles = chapter_titles_for(cid)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return False

    if len(text.strip()) < 120 and any(t in text for t in titles):
        return True

    if len(lines) >= 2 and re.match(r"^\d+\.$", lines[0]):
        second = re.sub(r"^\d+\s*", "", lines[1])
        if any(second == t or second.endswith(t) for t in titles):
            return True

    first = re.sub(r"^\d+\s*", "", lines[0])
    if first in titles and len(text.strip()) < 120:
        return True

    return False


def find_chapter_ranges(pages: list[str]) -> dict[int, tuple[int, int]]:
    """Return {chapter_id: (start_page_idx, end_page_idx_exclusive)}."""
    search_end = len(pages) - BACK_COVER_PAGE_COUNT if BACK_COVER_PAGE_COUNT else len(pages)
    searchable = pages[INTRO_PAGE_COUNT:search_end]

    starts: list[tuple[int, int]] = []
    for cid in sorted(CHAPTER_TITLES):
        for idx, text in enumerate(searchable):
            if is_chapter_opener(text, cid):
                starts.append((idx + INTRO_PAGE_COUNT, cid))
                break

    starts.sort()
    end_limit = search_end
    ranges: dict[int, tuple[int, int]] = {}
    for i, (start_idx, cid) in enumerate(starts):
        end_idx = starts[i + 1][0] if i + 1 < len(starts) else end_limit
        ranges[cid] = (start_idx, end_idx)
    return ranges


def is_vocab_noise(line: str) -> bool:
    token = line.strip()
    if not token or token in VOCAB_DENYLIST:
        return True
    upper = token.upper()
    if upper in VOCAB_DENYLIST:
        return True
    for needle in VOCAB_DENY_SUBSTRINGS:
        if needle in upper:
            return True
    return False


def _model_is_polluted(model: str) -> bool:
    """True when model text swallowed later sections (Reagera, writing, ISBN, etc.)."""
    if len(model) > 2000:
        return True
    markers = (
        r"\nReagera\n",
        r"\nBerätta\n",
        r"\nDin åsikt\n",
        r"\nAtt skriva\n",
        r"\nÖvning\s+\d",
        r"Att förbereda sig för provet",
        r"ISBN 978",
        r"SBN 978",
    )
    return any(re.search(pat, model) for pat in markers)


def _pick_model_sv(extracted: str, curated: str) -> str:
    ex = (extracted or "").strip()
    cu = (curated or "").strip()
    if not cu:
        return ex
    if not ex:
        return cu
    ex_bad = _model_is_polluted(ex)
    cu_bad = _model_is_polluted(cu)
    if cu_bad and not ex_bad:
        return ex
    if ex_bad and not cu_bad:
        return cu
    if cu_bad and ex_bad:
        return ex if len(ex) <= len(cu) else cu
    return cu if len(cu) > len(ex) else ex


def _is_vocab_fragment(token: str, phrases: list[str]) -> bool:
    """True when token is a whole-word piece of a longer phrase (not a substring of a word)."""
    upper = token.upper().strip()
    if not upper:
        return True
    for phrase in phrases:
        p_upper = phrase.upper()
        if upper == p_upper:
            continue
        if re.search(rf"(?:^|\s){re.escape(upper)}(?:\s|$)", p_upper):
            return True
    return False


def merge_vocab(curated: list[str], extracted: list[str]) -> list[str]:
    """Prefer curated multi-word phrases; add new extracted tokens that are not fragments."""
    curated = [w for w in curated if not is_vocab_noise(w)]
    if not curated:
        return _drop_vocab_fragments(extracted)

    result = list(curated)
    seen = {w.upper() for w in result}
    curated_upper = " ".join(w.upper() for w in curated)

    for word in extracted:
        upper = word.upper()
        if upper in seen or is_vocab_noise(word):
            continue
        if _is_vocab_fragment(word, result):
            continue
        if len(word.split()) == 1 and upper in curated_upper:
            continue
        seen.add(upper)
        result.append(word)
    return _drop_vocab_fragments(result)


def _drop_vocab_fragments(words: list[str]) -> list[str]:
    cleaned = [w for w in words if not is_vocab_noise(w)]
    return [w for w in cleaned if not _is_vocab_fragment(w, cleaned)]


def extract_vocab_grids(text: str) -> list[str]:
    """Collect ALL-CAPS word-grid tokens from uppvärmning / themed sections."""
    words: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or SECTION_HEADER_RE.match(line) or is_vocab_noise(line):
            continue
        if len(line) > 60:
            continue
        if VOCAB_TOKEN_RE.match(line) and len(line) >= 3:
            token = line.strip()
            if token not in seen:
                seen.add(token)
                words.append(token)
    return _drop_vocab_fragments(words)


def extract_warmup(text: str) -> list[str]:
    """Question lines after Uppvärmning until BIOGRAFI / Vilket ord? / Dialog."""
    questions: list[str] = []
    in_warmup = False
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        prompt = " ".join(buf).strip()
        prompt = re.sub(r"\s+", " ", prompt)
        if prompt.upper() in {"VAD?", "VAD"}:
            buf = []
            return
        if len(prompt) > 8 and prompt != "?":
            questions.append(prompt)
        buf = []

    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower() == "uppvärmning":
            in_warmup = True
            continue
        if not in_warmup:
            continue
        if WARMUP_STOP_RE.match(stripped) or stripped.lower().startswith("dialog "):
            flush()
            break
        if is_chapter_title_line(stripped):
            continue
        if stripped in {"?", "VAD?", "VAD"}:
            continue
        if VOCAB_TOKEN_RE.match(stripped) and len(stripped) >= 3 and len(stripped) < 60:
            flush()
            continue
        if stripped.startswith("•"):
            stripped = stripped.lstrip("•").strip()
            if not stripped or stripped in {"?", "VAD?", "VAD"}:
                continue
        if re.match(r"^\d+\.\s+", stripped):
            flush()
            buf = [re.sub(r"^\d+\.\s+", "", stripped)]
            continue
        if stripped.endswith("?"):
            if buf:
                buf.append(stripped)
                flush()
            else:
                questions.append(stripped)
            continue
        if buf:
            buf.append(stripped)
        elif len(stripped) > 20:
            buf = [stripped]

    flush()
    return _dedupe_consecutive(questions)


def _split_glued_verbs(sv: str, prompt: str) -> list[tuple[str, str]]:
    """Split BIOGRAFI lines like 'FÅ BARNBARN GÅ I PENSION+ när'."""
    words = sv.split()
    if len(words) >= 4:
        for i in range(2, len(words) - 1):
            first = " ".join(words[:i])
            second = " ".join(words[i:])
            if len(first.split()) >= 2 and len(second.split()) >= 2:
                return [(first, prompt), (second, prompt)]
    return [(sv, prompt)]


def extract_verbs(text: str) -> list[dict[str, str]]:
    verbs: list[dict[str, str]] = []
    in_biografi = False
    for line in text.splitlines():
        if "BIOGRAFI" in line and "verb" in line.lower():
            in_biografi = True
            continue
        if in_biografi:
            if is_true_section_header(line) and "BIOGRAFI" not in line:
                break
            m = re.match(r"^([A-ZÅÄÖÉ][A-ZÅÄÖÉ()\s/\-]+?)\s*\+\s*(.+)$", line)
            if m:
                sv = m.group(1).strip()
                prompt = m.group(2).strip()
                if len(sv) < 50:
                    for verb_sv, verb_prompt in _split_glued_verbs(sv, prompt):
                        verbs.append({"sv": verb_sv, "prompt_sv": verb_prompt})
                continue
            hobby = re.match(r"^(HA \(vad som\) HOBBY)\s*$", line.strip())
            if hobby:
                verbs.append({"sv": hobby.group(1), "prompt_sv": "vad"})
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
        stripped = line.strip()
        if stripped == header:
            in_section = True
            continue
        if not in_section:
            continue
        if is_true_section_header(stripped) and stripped != header:
            if buf:
                prompts.append(" ".join(buf).strip())
            break
        if is_chapter_title_line(stripped) or PAGE_NUM_RE.match(stripped):
            continue
        m = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if m:
            if buf:
                prompts.append(" ".join(buf).strip())
            buf = [m.group(2).strip()]
            continue
        if stripped.startswith("•") or stripped.startswith("-"):
            if buf:
                prompts.append(" ".join(buf).strip())
                buf = []
            continue
        if buf and stripped:
            if re.match(r"^[A-Z]\.\s", stripped):
                if buf:
                    prompts.append(" ".join(buf).strip())
                buf = []
            else:
                buf.append(stripped)
    if buf:
        prompts.append(" ".join(buf).strip())

    cleaned = [_strip_trailing_chapter_title(p) for p in prompts if len(p) > 10]
    return _dedupe_consecutive(cleaned)


def _speaking_scan_limit(text: str) -> int:
    limit = len(text)
    for marker in ("\nAtt skriva", "\nÖvning "):
        idx = text.find(marker)
        if idx != -1:
            limit = min(limit, idx)
    return limit


def _letter_block_end(text: str, start: int) -> int:
    rest = text[start + 1 :]
    m = re.search(r"^[A-L]\.\s", rest, re.M)
    if m:
        return start + 1 + m.start()
    for stop in ("Att skriva", "Reagera", "Övning "):
        idx = text.find(stop, start + 1)
        if idx != -1:
            return idx
    return len(text)


def _extract_letter_blocks(text: str) -> list[tuple[int, str]]:
    att = _speaking_scan_limit(text)
    scan_text = text[:att]
    blocks: list[tuple[int, str]] = []
    for m in re.finditer(r"^[A-L]\.\s", scan_text, re.M):
        start = m.start()
        end = _letter_block_end(scan_text, start)
        block = _strip_speaking_trailer(scan_text[start:end].strip())
        if len(block) > 8:
            blocks.append((start, block))
    return blocks


TOPIC_CONTINUATION_RE = re.compile(
    r"^(Hur|Vad|Varför|När|Kan|Gillar|Berätta|Är du|Finns det)\s",
    re.IGNORECASE,
)


def _looks_like_topic_title(line: str, lines: list[str], index: int) -> bool:
    if line.startswith("•") or not line[0].isupper():
        return False
    if line.endswith("?") and len(line) <= 15:
        return False
    if line.endswith("?") and len(line) < 50 and TOPIC_CONTINUATION_RE.match(line):
        return False
    if index + 1 < len(lines) and lines[index + 1].startswith("•"):
        return True
    return len(line) > 25


def _extract_title_bullet_groups(section_text: str) -> list[str]:
    """Split untitled title+bullet groups (chapter 2 Berätta/åsikt pages)."""
    groups: list[str] = []
    lines = [ln.strip() for ln in section_text.splitlines()]
    i = 0
    while i < len(lines):
        while i < len(lines) and (
            not lines[i]
            or lines[i].startswith("•")
            or re.match(r"^[A-L]\.\s", lines[i])
            or is_chapter_title_line(lines[i])
            or SPEAKING_STOP_RE.match(lines[i])
            or not _looks_like_topic_title(lines[i], lines, i)
        ):
            i += 1
        if i >= len(lines):
            break

        title = lines[i]
        i += 1
        bullets: list[str] = []
        while i < len(lines):
            nxt = lines[i]
            if not nxt:
                i += 1
                break
            if nxt.startswith("•"):
                bullets.append(nxt)
                i += 1
                continue
            if (
                re.match(r"^[A-L]\.\s", nxt)
                or is_chapter_title_line(nxt)
                or SPEAKING_STOP_RE.match(nxt)
                or _looks_like_topic_title(nxt, lines, i)
            ):
                break
            if bullets:
                bullets[-1] = bullets[-1] + " " + nxt
                i += 1
                continue
            break

        if bullets:
            groups.append(_strip_speaking_trailer(title + "\n" + "\n".join(bullets)))
    return groups


def _is_writing_leak(text: str) -> bool:
    """Title+bullet groups that belong in Att skriva, not Din åsikt."""
    stripped = text.strip()
    if not stripped:
        return True
    first_line = stripped.splitlines()[0].strip()
    if re.match(r"^Välj (?:tema )?[AB]", first_line, re.IGNORECASE):
        return True
    if first_line.startswith("Övning "):
        return True
    if first_line.startswith("Skriv ett klagomål") or first_line.startswith("Skriv ett meddelande"):
        return True
    if "Du har sett en annons" in stripped or "Du har fått ett stort blomsterparti" in stripped:
        return True
    return False


def extract_beratta_asikt(text: str) -> tuple[list[str], list[str]]:
    """Collect A.–L. clusters and title+bullet groups; assign by section dividers."""
    headers: list[tuple[int, str]] = []
    for m in re.finditer(r"^(Berätta|Din åsikt)$", text, re.M):
        kind = "berätta" if m.group(1) == "Berätta" else "åsikt"
        headers.append((m.start(), kind))

    beratta: list[str] = []
    asikt: list[str] = []

    first_ber = min((pos for pos, kind in headers if kind == "berätta"), default=-1)
    first_asikt = min((pos for pos, kind in headers if kind == "åsikt"), default=-1)

    letter_blocks = _extract_letter_blocks(text)
    for pos, block in letter_blocks:
        if _is_writing_leak(block):
            continue
        if first_asikt != -1 and pos >= first_asikt:
            asikt.append(block)
        elif first_ber != -1 and pos >= first_ber:
            beratta.append(block)
        elif first_asikt != -1 and pos < first_asikt:
            beratta.append(block)

    if not headers:
        return beratta, asikt

    sorted_headers = sorted(headers, key=lambda h: h[0])
    for idx, (hpos, kind) in enumerate(sorted_headers):
        end = sorted_headers[idx + 1][0] if idx + 1 < len(sorted_headers) else len(text)
        for marker in ("Att skriva", "Övning "):
            idx = text.find(marker, hpos)
            if idx != -1 and idx < end:
                end = idx
        section = text[hpos:end]
        section = re.sub(r"^(Berätta|Din åsikt)\s*\n", "", section, count=1, flags=re.M)
        has_letters = any(hpos <= pos < end for pos, _ in letter_blocks)
        if has_letters:
            continue
        for group in _extract_title_bullet_groups(section):
            if _is_writing_leak(group):
                continue
            if kind == "berätta":
                beratta.append(group)
            else:
                asikt.append(group)

    beratta = [_strip_speaking_trailer(b) for b in beratta if not _is_writing_leak(b)]
    asikt = [_strip_speaking_trailer(b) for b in asikt if not _is_writing_leak(b)]
    return beratta, asikt


def _model_should_stop(line: str, body_len: int) -> bool:
    if MODEL_STOP_LINE_RE.match(line):
        return True
    if is_chapter_title_line(line) and body_len > 80:
        return True
    if re.match(r"^Dialog\s+\d+", line) and not line.upper().startswith("MODELL"):
        return True
    return False


def _clean_model_line(line: str) -> str | None:
    if DIALOGUE_CUE_ONLY_RE.match(line):
        return None
    if line == "***":
        return None
    return line


def extract_models(text: str) -> dict[int, str]:
    """Parse MODELL Dialog N blocks into {num: model text}."""
    models: dict[int, str] = {}
    parts = MODELL_SPLIT_RE.split(text)
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
            if _model_should_stop(ln, len(body)):
                break
            cleaned = _clean_model_line(ln)
            if cleaned is not None:
                body.append(cleaned)
        model = "\n".join(body).strip()
        if model:
            models[num] = model
    return models


def _dialogue_spoken_script(lines: list[str]) -> str:
    """Spoken lines printed after the page footer, used when MODELL is empty/short."""
    body: list[str] = []
    in_paren = False
    seen_chapter_footer = False
    for ln in lines:
        stripped = ln.strip()
        if not stripped or stripped == "***":
            continue
        if is_chapter_title_line(stripped):
            seen_chapter_footer = True
            continue
        if not seen_chapter_footer:
            continue
        if TIMING_JUNK_RE.match(stripped):
            continue
        if "(" in stripped:
            in_paren = True
        if in_paren:
            if ")" in stripped:
                in_paren = False
            continue
        if SPEAKER_LINE_RE.match(stripped) and stripped.rstrip().endswith(":"):
            continue
        body.append(stripped)
    return "\n".join(body).strip()


def _normalize_dialogue_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _pick_dialogue_model(prompt: str, model: str, spoken: str) -> str:
    model = _strip_trailing_chapter_title(model.strip())
    if spoken and (
        not model
        or len(model) < 60
        or _normalize_dialogue_text(model) == _normalize_dialogue_text(prompt)
        or _normalize_dialogue_text(prompt) in _normalize_dialogue_text(model)
    ):
        return spoken
    return model


def _build_dialogue_prompt(lines: list[str]) -> str:
    scenario: list[str] = []
    hints: list[str] = []
    for ln in lines:
        stripped = ln.strip()
        if not stripped or stripped == "***":
            continue
        if is_chapter_title_line(stripped) or TIMING_JUNK_RE.match(stripped):
            continue
        if stripped.startswith("(") and ")" in stripped:
            hints.append(stripped)
            continue
        if SPEAKER_LINE_RE.match(stripped):
            break
        # A second scenario on the same page (e.g. gym call after a warm-up paragraph)
        if scenario and re.match(r"^Du (har|vill|sitter|behöver)\b", stripped):
            scenario = [stripped]
            continue
        scenario.append(stripped)
    prompt = " ".join(scenario).strip()
    prompt = _strip_trailing_chapter_title(prompt)
    if hints:
        prompt += "\n\n" + "\n".join(hints)
    return prompt.strip()


def extract_dialogues(text: str, chapter_id: int) -> list[dict]:
    dialogues: list[dict] = []
    titles = "|".join(re.escape(t) for t in chapter_titles_for(chapter_id))
    pattern = re.compile(
        rf"Dialog\s*(\d+)\.?\s+(?:{titles})\s*\n(.*?)(?=\nDialog\s*\d|MODELL:?\s*Dialogi?|Reagera\n|$)",
        re.DOTALL | re.IGNORECASE,
    )
    for m in pattern.finditer(text):
        if "MODELL" in m.group(0)[:30]:
            continue
        before = text[max(0, m.start() - 10) : m.start()].upper()
        if "MODELL" in before:
            continue
        num = int(m.group(1))
        body = m.group(2).strip()
        lines = [ln for ln in body.splitlines() if ln.strip() and ln.strip() != "***"]
        prompt = _build_dialogue_prompt(lines)
        spoken = _dialogue_spoken_script(lines)
        dialogues.append({"num": num, "prompt_sv": prompt, "model_sv": "", "_spoken": spoken})

    models = extract_models(text)
    for d in dialogues:
        spoken = d.pop("_spoken", "")
        model = _pick_dialogue_model(d["prompt_sv"], models.get(d["num"], ""), spoken)
        d["model_sv"] = model

    dialogues.sort(key=lambda d: d["num"])
    return dialogues


def _writing_type(title: str, body: str = "") -> str:
    lower = f"{title} {body}".lower()
    if "klagomål" in lower:
        return "klagomål"
    if "e-post" in lower or "brev" in lower:
        return "e-post"
    if "meddelande" in lower or "inbjud" in lower:
        return "meddelande"
    return "övrigt"


def _strip_writing_trailer(prompt: str) -> str:
    return WRITING_TRAILER_RE.sub("", prompt).strip()


def _split_writing_body(body_lines: list[str]) -> list[str]:
    text = "\n".join(body_lines).strip()
    if not text:
        return []

    starts = [0]
    for m in WRITING_BLOCK_START_RE.finditer(text):
        if m.start() > 0:
            starts.append(m.start())

    # When a Välj A/B block exists, split a following Din vän vill… prompt separately.
    valj_match = re.search(r"^Välj (?:tema )?[AB]", text, re.MULTILINE)
    if valj_match:
        after_valj = text[valj_match.start() :]
        friend_match = re.search(r"(?:^|\n)(Din vän vill.+)$", after_valj, re.MULTILINE)
        if friend_match:
            abs_start = valj_match.start() + friend_match.start(1)
            if abs_start not in starts:
                starts.append(abs_start)

    starts = sorted(set(starts))

    blocks: list[str] = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(text)
        block = text[start:end].strip()
        block = _strip_writing_trailer(block)
        if len(block) > 40:
            blocks.append(block)
    return _drop_overlapping_blocks(blocks)


def _drop_overlapping_blocks(blocks: list[str]) -> list[str]:
    """Remove blocks that are strict prefixes/substrings of a longer block."""
    kept: list[str] = []
    for i, block in enumerate(blocks):
        normalized = re.sub(r"\s+", " ", block.strip().lower())
        if not normalized:
            continue
        dominated = False
        for j, other in enumerate(blocks):
            if i == j:
                continue
            other_norm = re.sub(r"\s+", " ", other.strip().lower())
            if normalized != other_norm and normalized in other_norm and len(other) > len(block) + 20:
                dominated = True
                break
        if not dominated:
            kept.append(block)
    return kept


def _score_block_for_ovning(num: int, title: str, block: str) -> int:
    lower_title = title.lower()
    lower_block = block.lower()
    score = 0
    if "inbjud" in lower_title and "inbjud" in lower_block:
        score += 10
    if "meddelande" in lower_title and ("meddelande" in lower_block or "meddelande" in lower_title):
        score += 8
    if "klagomål" in lower_title and "klagomål" in lower_block:
        score += 10
    if "brev" in lower_title and ("brev" in lower_block or "lärare" in lower_block):
        score += 8
    if "e-post" in lower_title and "e-post" in lower_block:
        score += 8
    if "åsikt" in lower_title and ("välj" in lower_block or "tema" in lower_block):
        score += 8
    if num == 3 and lower_block.startswith("välj"):
        score += 6
    if num == 1 and "inbjud" in lower_block:
        score += 6
    if num == 2 and lower_block.startswith("din vän"):
        score += 6
    return score


def _assign_blocks_to_ovning(
    headers: list[tuple[int, str]], blocks: list[str]
) -> list[tuple[int, str, str]]:
    if not headers or not blocks:
        return []

    assigned: dict[int, int] = {}
    used_blocks: set[int] = set()

    for num, title in headers:
        best_idx = -1
        best_score = 0
        for idx, block in enumerate(blocks):
            if idx in used_blocks:
                continue
            score = _score_block_for_ovning(num, title, block)
            if score > best_score:
                best_score = score
                best_idx = idx
        if best_idx >= 0 and best_score > 0:
            assigned[num] = best_idx
            used_blocks.add(best_idx)

    remaining_headers = [h for h in headers if h[0] not in assigned]
    remaining_blocks = [i for i in range(len(blocks)) if i not in used_blocks]

    for (num, title), block_idx in zip(
        sorted(remaining_headers, key=lambda h: h[0]),
        remaining_blocks,
    ):
        assigned[num] = block_idx

    results: list[tuple[int, str, str]] = []
    for num, title in sorted(headers, key=lambda h: h[0]):
        if num not in assigned:
            continue
        block = blocks[assigned[num]]
        prompt = block
        if title and title.lower() not in block.lower()[: max(len(title) + 5, 20)]:
            prompt = f"{title}\n{block}" if title else block
        results.append((num, title, _strip_writing_trailer(prompt)))
    return results


def _expand_ovning_lines(lines: list[str]) -> list[str]:
    expanded: list[str] = []
    for line in lines:
        if len(re.findall(r"Övning\s+\d+", line, re.IGNORECASE)) > 1:
            parts = re.split(r"(?=Övning\s+\d+)", line, flags=re.IGNORECASE)
            expanded.extend(part.strip() for part in parts if part.strip())
        else:
            expanded.append(line)
    return expanded


def _find_writing_section(text: str) -> str:
    """Return the writing chunk, including Övning lines that precede Att skriva (ch. 7)."""
    att = text.rfind("Att skriva")
    if att == -1:
        return ""

    scan_start = max(0, att - 4000)
    prefix = text[scan_start:att]
    ov_start = None
    for m in OVNING_RE.finditer(prefix):
        ov_start = scan_start + m.start()
        break

    start = ov_start if ov_start is not None else att
    section = text[start:]
    trailer = section.find("Att förbereda sig för provet")
    if trailer != -1:
        section = section[:trailer]
    return section


def extract_writing(text: str) -> list[dict[str, str]]:
    section_text = _find_writing_section(text)
    if not section_text:
        return []

    section_lines: list[str] = []
    for line in section_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if is_chapter_title_line(stripped):
            break
        if stripped == "Att skriva":
            continue
        if WRITING_TRAILER_RE.match(stripped):
            break
        section_lines.append(stripped)

    section_lines = _expand_ovning_lines(section_lines)

    headers: list[tuple[int, str]] = []
    body_lines: list[str] = []
    for stripped in section_lines:
        ov = OVNING_RE.match(stripped)
        if ov:
            headers.append((int(ov.group(1)), ov.group(2).strip()))
        else:
            body_lines.append(stripped)

    if not headers:
        return []

    blocks = _split_writing_body(body_lines)
    if not blocks:
        return []

    assigned = _assign_blocks_to_ovning(headers, blocks)
    tasks: list[dict[str, str]] = []
    seen_nums: set[int] = set()
    for num, title, prompt in assigned:
        if num in seen_nums:
            continue
        seen_nums.add(num)
        if len(prompt) > 40:
            tasks.append({"type": _writing_type(title, prompt), "prompt_sv": prompt})

    return tasks[:3]


def extract_chapter(pages: list[str], chapter_id: int) -> dict:
    ranges = find_chapter_ranges(pages)
    if chapter_id not in ranges:
        raise ValueError(f"Chapter {chapter_id} not found in PDF")

    start, end = ranges[chapter_id]
    text = "\n".join(pages[start:end])
    title = CHAPTER_TITLES[chapter_id]
    beratta, asikt = extract_beratta_asikt(text)

    return {
        "id": chapter_id,
        "title_sv": title,
        "vocabulary": extract_vocab_grids(text),
        "verbs": extract_verbs(text),
        "vilket_ord": extract_vilket_ord(text),
        "warmup": extract_warmup(text),
        "dialogues": dedupe_dialogues(extract_dialogues(text, chapter_id)),
        "reagera": extract_numbered_prompts(text, "Reagera"),
        "beratta": beratta,
        "asikt": asikt,
        "writing": extract_writing(text),
        "_meta": {
            "page_range": [start + 1, end],
            "needs_curation": True,
        },
    }


def validate_extraction(chapters: list[dict]) -> list[str]:
    """Return a list of validation errors; empty means OK."""
    errors: list[str] = []

    if len(chapters) != 7:
        errors.append(f"expected 7 chapters, got {len(chapters)}")

    total_reagera = 0
    total_beratta = 0
    total_dialogues = 0

    for ch in chapters:
        cid = ch["id"]
        writing = ch.get("writing", [])
        if len(writing) != 3:
            errors.append(f"chapter {cid}: expected 3 writing tasks, got {len(writing)}")

        for task in writing:
            prompt = task.get("prompt_sv", "")
            if prompt.rstrip().endswith(" men") or prompt.rstrip().endswith(" men,"):
                errors.append(f"chapter {cid} writing: prompt ends with 'men'")
            if "ISBN" in prompt or "SBN 978" in prompt:
                errors.append(f"chapter {cid} writing: contains ISBN junk")

        reagera = ch.get("reagera", [])
        total_reagera += len(reagera)
        if cid == 1 and len(reagera) < 15:
            errors.append(f"chapter 1 Reagera: expected >= 15, got {len(reagera)}")

        for items, label in (
            (reagera, "reagera"),
            (ch.get("beratta", []), "beratta"),
            (ch.get("asikt", []), "asikt"),
        ):
            for i in range(1, len(items)):
                if items[i] == items[i - 1]:
                    errors.append(f"chapter {cid} {label}: consecutive duplicate at {i}")

        beratta = ch.get("beratta", [])
        total_beratta += len(beratta)
        asikt = ch.get("asikt", [])
        if cid == 2 and len(asikt) < 4:
            errors.append(f"chapter 2 asikt: expected >= 4, got {len(asikt)}")

        for block in beratta + asikt:
            if block.rstrip().endswith(("Berätta", "Din åsikt")):
                errors.append(f"chapter {cid} speaking block ends with section header")

        dialogues = ch.get("dialogues", [])
        total_dialogues += len(dialogues)
        for d in dialogues:
            prompt = (d.get("prompt_sv") or "").strip()
            model = (d.get("model_sv") or "").strip()
            if not model:
                errors.append(f"chapter {cid} dialogue {d.get('num')}: empty model_sv")
            elif model == prompt:
                errors.append(f"chapter {cid} dialogue {d.get('num')}: model_sv equals prompt_sv")

    if total_reagera < 95:
        errors.append(f"total Reagera: expected >= 95, got {total_reagera}")
    if total_beratta < 30:
        errors.append(f"total Berätta: expected >= 30, got {total_beratta}")
    if total_dialogues != 34:
        errors.append(f"total dialogues: expected 34, got {total_dialogues}")

    return errors


def dedupe_dialogues(dialogues: list[dict]) -> list[dict]:
    by_num: dict[int, dict] = {}
    for d in dialogues:
        num = d["num"]
        prev = by_num.get(num)
        if prev is None:
            by_num[num] = d
            continue
        prompt = d["prompt_sv"] if len(d["prompt_sv"]) >= len(prev["prompt_sv"]) else prev["prompt_sv"]
        model = _pick_model_sv(d.get("model_sv") or "", prev.get("model_sv") or "")
        by_num[num] = {"num": num, "prompt_sv": prompt, "model_sv": model}
    return [by_num[k] for k in sorted(by_num)]


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
                d["model_sv"] = _pick_model_sv(d.get("model_sv") or "", hd["model_sv"])

    if hand.get("vocabulary"):
        base["vocabulary"] = merge_vocab(hand["vocabulary"], base.get("vocabulary", []))

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
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip post-extraction quality checks",
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

    if not args.raw and not args.no_validate:
        validation_errors = validate_extraction(chapters)
        if validation_errors:
            for err in validation_errors:
                print(f"VALIDATION: {err}", file=sys.stderr)
            sys.exit(1)

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
