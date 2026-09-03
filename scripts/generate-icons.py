#!/usr/bin/env python3
import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "public"


def crc32(data: bytes) -> int:
    return zlib.crc32(data) & 0xFFFFFFFF


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc32(tag + data))


def create_solid_png(size: int, r: int, g: int, b: int) -> bytes:
    row = bytes([0]) + bytes([r, g, b]) * size
    raw = row * size
    compressed = zlib.compress(raw, 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def main() -> None:
    indigo = (79, 70, 229)
    for size, name in ((192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")):
        path = OUT_DIR / name
        path.write_bytes(create_solid_png(size, *indigo))
        print(f"Wrote {name}")


if __name__ == "__main__":
    main()
