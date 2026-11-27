"""Offer pricing against recorded shapes of PriceRunner's offers payload; no network."""

import datetime as dt
import json

import pricerunner
import pytest

NOW = dt.datetime(2026, 11, 27, 12, tzinfo=dt.timezone.utc)
MERCHANTS = {"1": {"name": "Proshop.dk"}, "2": {"name": "CS MEGASTORE"}}


def amount(x):
    return {"amount": f"{x:.2f}", "currency": "DKK"}


def offer(merchant, price, shipping=0, stock="IN_STOCK", campaign=None, condition=None):
    o = {
        "merchantId": merchant,
        "price": amount(price),
        "shippingCost": amount(shipping),
        "stockStatus": stock,
        "campaignPrice": None,
        "labels": {"propertyLabels": [], "attributeLabels": []},
    }
    if campaign:
        sale, start, end = campaign
        o["campaignPrice"] = {
            "price": amount(sale),
            "salePriceEffectiveDate": {"start": start, "end": end},
        }
    if condition:
        o["labels"]["attributeLabels"].append(
            {"filterId": "af_ITEM_CONDITION", "value": condition}
        )
    return o


RUNNING = (2499, "2026-11-19T07:30:00Z", "2026-11-30T22:59:00Z")
ENDED = (2499, "2026-11-01T00:00:00Z", "2026-11-20T00:00:00Z")


def test_running_campaign_replaces_the_regular_price():
    o = pricerunner.slim_offer(offer("1", 2999, campaign=RUNNING), MERCHANTS, NOW)
    assert (o["price"], o["regularPrice"], o["total"]) == (2499, 2999, 2499)
    assert o["campaignEnds"] == "2026-11-30T22:59:00Z"


def test_ended_campaign_keeps_the_regular_price():
    o = pricerunner.slim_offer(offer("1", 2999, campaign=ENDED), MERCHANTS, NOW)
    assert o["price"] == 2999
    assert "regularPrice" not in o and "campaignEnds" not in o


def test_condition_comes_from_the_item_condition_label():
    o = pricerunner.slim_offer(
        offer("1", 2609, stock="COLLECT_IN_STORE", condition="REFURBISHED"),
        MERCHANTS,
        NOW,
    )
    assert o["condition"] == "REFURBISHED"


@pytest.fixture
def payload(monkeypatch):
    """Serve one offers payload for every `get`; the test fills it."""
    d = {"offers": [], "merchants": MERCHANTS, "offersSummary": {}}
    monkeypatch.setattr(pricerunner, "get", lambda *a, **k: d)
    return d


def test_offers_sort_by_the_campaign_total(payload):
    payload["offers"] = [
        offer("2", 2697),
        offer("1", 2999, campaign=RUNNING),
    ]
    _, offers = pricerunner.fetch_offers("3547204139", now=NOW)
    assert [o["merchant"] for o in offers] == ["Proshop.dk", "CS MEGASTORE"]


def test_shipping_counts_toward_the_order(payload):
    payload["offers"] = [offer("1", 1705, shipping=49), offer("2", 1753)]
    _, offers = pricerunner.fetch_offers("3336146633", now=NOW)
    assert [o["total"] for o in offers] == [1753, 1754]


def test_info_reports_the_cheapest_offer_not_the_summary(payload, capsys):
    payload["productInfoSet"] = [{"productName": "990 EVO Plus"}]
    payload["offers"] = [offer("2", 1683)]
    # The summary counts out-of-stock and refurbished offers; `info` must not quote it.
    payload["offersSummary"] = {
        "minPriceAcrossAllOffers": amount(1390),
        "internationalOffer": {"minPrice": amount(2853.99)},
    }
    pricerunner.cmd_info(type("A", (), {"product": "3336146633"}))
    out = json.loads(capsys.readouterr().out)
    assert out["cheapest"]["total"] == 1683
    assert out["internationalFrom"] == 2853.99
