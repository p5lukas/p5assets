from app import kometa


def test_slot_names():
    assert kometa.slot_basename(None) == "poster"
    assert kometa.slot_basename(3) == "Season03"
    assert kometa.slot_basename(0) == "Season00"


def test_asset_target_folders_and_flat(tmp_path):
    assert kometa.asset_target(tmp_path, "Show (2020)", 1, True, ".jpg") == tmp_path / "Show (2020)" / "Season01.jpg"
    assert kometa.asset_target(tmp_path, "Show (2020)", None, True, ".png") == tmp_path / "Show (2020)" / "poster.png"
    assert kometa.asset_target(tmp_path, "Show (2020)", 2, False, ".jpg") == tmp_path / "Show (2020)_Season02.jpg"
    assert kometa.asset_target(tmp_path, "Movie (1999)", None, False, ".jpg") == tmp_path / "Movie (1999).jpg"


def test_media_folder_name():
    assert kometa.media_folder_name("/data/movies/Heat (1995)/heat.mkv", True) == "Heat (1995)"
    assert kometa.media_folder_name("/data/tv/Show (2020)", False) == "Show (2020)"
    assert kometa.media_folder_name("D:\\tv\\Show (2020)", False) == "Show (2020)"
    assert kometa.media_folder_name("", False) == ""


def test_guess_slot():
    assert kometa.guess_slot("Show - Season 2.jpg") == ("season", 2)
    assert kometa.guess_slot("Season01.jpg") == ("season", 1)
    assert kometa.guess_slot("Show - Specials.jpg") == ("season", 0)
    assert kometa.guess_slot("Show.jpg") == ("poster", None)
    assert kometa.guess_slot("Show S01E02.jpg")[0] == "ignore"


def test_guess_title():
    assert kometa.guess_title("Breaking Bad (2008) - Season 1.jpg") == ("Breaking Bad", 2008)
    assert kometa.guess_title("Breaking Bad (2008)/Season01.jpg") == ("Breaking Bad", 2008)
    assert kometa.guess_title("Heat (1995)/poster.jpg") == ("Heat", 1995)


def test_match_item():
    items = [{"title": "Heat", "year": 1995, "folder": "Heat (1995)"},
             {"title": "Heat", "year": 2013, "folder": "The Heat (2013)"}]
    assert kometa.match_item("Heat", 1995, items)["year"] == 1995
    assert kometa.match_item("Nothing Like It", 2000, items) is None


def test_letter_of():
    assert kometa.letter_of("Åre") == "A"
    assert kometa.letter_of("The Matrix") == "T"
    assert kometa.letter_of("1917") == "#"
    assert kometa.letter_of("") == "#"


def test_coming_soon():
    f = "Dune 3 (2026) {edition-Coming Soon}"
    assert kometa.is_coming_soon(f)
    assert not kometa.is_coming_soon("Dune 3 (2026)")
    assert kometa.coming_soon_mirrors(f, ["Dune 3 (2026)"]) == ["Dune 3 (2026)"]
    assert kometa.coming_soon_mirrors("Dune 3 (2026)", ["Dune 3 (2026)"]) == []
