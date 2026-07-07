from backend.app.routes.aliases import _normalize_destination_list


def test_normalize_destination_list_removes_self_and_duplicates():
    result = _normalize_destination_list(
        "dmudzuri@chadzi.co.zw",
        "dmudzuri@chadzi.co.zw, garikai@zimpricecheck.com, GArikai@zimpricecheck.com",
    )

    assert result == ["garikai@zimpricecheck.com"]


def test_normalize_destination_list_returns_empty_when_only_self():
    assert _normalize_destination_list("info@chadzi.co.zw", "info@chadzi.co.zw") == []
