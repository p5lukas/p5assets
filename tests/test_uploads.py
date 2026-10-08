import io
import zipfile

import pytest

from app import uploads


def _png():
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (20, 30), "red").save(b, "PNG")
    return b.getvalue()


def test_safe_rel_blocks_traversal():
    assert uploads.safe_rel("../../etc/passwd") == "etc/passwd"
    assert uploads.safe_rel("/abs/x.jpg") == "abs/x.jpg"
    assert uploads.safe_rel("a\\b\\c.jpg") == "a/b/c.jpg"


def test_zip_import_flattens_unsafe_names_and_skips_junk():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("../../evil/Show (2020)/poster.png", _png())
        zf.writestr("__MACOSX/x.png", _png())
        zf.writestr("readme.txt", "hi")
    sid = uploads.new_session()
    entries = uploads.stage_file(sid, "pack.zip", buf.getvalue())
    assert [e["name"] for e in entries] == ["evil/Show (2020)/poster.png"]
    assert entries[0]["title"] == "Show" and entries[0]["year"] == 2020
    uploads.drop_session(sid)


def test_bad_zip_and_bad_session():
    sid = uploads.new_session()
    with pytest.raises(ValueError):
        uploads.stage_file(sid, "x.zip", b"nope")
    with pytest.raises(ValueError):
        uploads.staged_bytes("../x", "y")
