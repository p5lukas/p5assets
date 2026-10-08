from app import config, notify


def _new(title, soon=False, world="HD"):
    return {"title": title, "year": 2026, "world": world, "coming_soon": soon}


def test_compose_counts_and_coming_soon():
    title, text = notify.compose([_new("A", True), _new("B"), _new("C")], False, "http://x")
    assert title == "p5assets: 3 neue Titel ohne Poster, 1 davon Coming Soon"
    assert text.splitlines()[0].startswith("• A")
    assert text.endswith("http://x")


def test_compose_singular_and_overflow():
    assert notify.compose([_new("A")], False, "")[0] == "p5assets: 1 neuer Titel ohne Poster"
    _, text = notify.compose([_new(f"T{i:02d}") for i in range(25)], True, "")
    assert "… und" in text and "[HD]" in text


def test_secrets_are_masked_in_public():
    cfg = config.get()
    cfg["notify"]["discord"]["webhook"] = "https://discord.test/secret"
    pub = config.public(cfg)
    assert "secret" not in str(pub["notify"])
