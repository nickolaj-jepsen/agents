# Changelog

## [Unreleased]

- **Breaking:** `info` reports `cheapest`, the cheapest Danish in-stock offer with shipping, and `internationalFrom`, in place of `lowest`, which counted out-of-stock offers.
- **Breaking:** `compare` returns `specs` as a list of `{group, spec, values}`.
- `offers` prices a shop's running sale (a Black Friday price, say) as the product page does, with `regularPrice` and `campaignEnds` beside it, and shows each offer's `condition`.
- `facets` works again; PriceRunner stopped answering its old address.

## [0.1.0] - 2026-11-25

- First versioned release.
