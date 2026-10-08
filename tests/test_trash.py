from app import trash


def test_stash_and_restore_roundtrip(tmp_path):
    f = tmp_path / "poster.jpg"
    f.write_bytes(b"old")
    gid = trash.begin("Poster ersetzt", title="X")
    trash.stash(gid, f, move=False)
    f.write_bytes(b"new")
    trash.note_created(gid, f)
    assert [g["id"] for g in trash.listing()] == [gid]
    trash.restore(gid)
    assert f.read_bytes() == b"old"
    # the restore itself is undoable
    assert any(g.get("reason") == "restore" for g in trash.listing())


def test_move_directory_and_restore(tmp_path):
    d = tmp_path / "Old (2000)"
    d.mkdir()
    (d / "poster.jpg").write_bytes(b"x")
    gid = trash.begin("orphan")
    trash.stash(gid, d, move=True)
    assert not d.exists()
    trash.restore(gid)
    assert (d / "poster.jpg").read_bytes() == b"x"


def test_empty_group_is_discarded():
    gid = trash.begin("nothing")
    trash.discard_if_empty(gid)
    assert gid not in [g["id"] for g in trash.listing()]


def test_invalid_id_rejected():
    import pytest
    with pytest.raises(ValueError):
        trash.restore("../etc")
