---
name: pricerunner
description: Search and compare Danish prices on PriceRunner.dk — product search with facet filters (brand, price range, specs), category browsing and sorting, shop offers incl. shipping, price history ("is this a good price?"), reviews, spec comparison, similar products and current price drops. Use when the user asks what something costs in Denmark, where to buy it cheapest, whether a price is good, to find/compare products by specs, or mentions PriceRunner.
disable-model-invocation: true
argument-hint: "<product, category or question>"
metadata:
  version: 0.1.0
  summary: "searches and compares Danish prices on PriceRunner.dk."
  category: utilities
---

# PriceRunner.dk

The arguments name a product, a category or a price question.

- `scripts/pricerunner.py` wraps PriceRunner's unofficial frontend JSON API (no auth, stdlib Python).
- Every command prints one line of compact JSON; pipe through `jq` to trim. Prices are DKK.
- The API is reverse-engineered from the site's JS and can break without notice. If a command starts returning HTTP 404/400, say so rather than guessing.

```bash
PR="python3 <skill-dir>/scripts/pricerunner.py"   # substitute the absolute path of this skill directory
$PR <command> -h                                   # full flags per command
```

## Commands

| Command              | Use                                                                                                                       | Output keys                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `search "<q>"`       | Free-text search: products, the filters PriceRunner applied, and filter option ids to refine with.                        | `total`, `appliedParams`, `applied[]`, `products[]`, `facets[{id, name, options[{id, value}]}]`                  |
| `categories [REGEX]` | Category tree. Find the `cl` id for a product type.                                                                       | `[{id, name, kind, parents, cl}]`                                                                                |
| `filters CAT`        | Every filter id available in a category (`PRICE`, `BRAND`, `RATING`, numeric spec ids…) with type.                        | `[{id, name, type, unit, group}]`                                                                                |
| `facets CAT ID…`     | Option ids + product counts for those filters; ranges get min/max buckets. Pass `-f` to see counts under current filters. | `[{id, name, unit, options[{id, value, count}]}]`                                                                |
| `list CAT`           | Browse a category with filters and sorting.                                                                               | `category`, `subcategories[]`, `total`, `products[]`, `quickFilters[]`                                           |
| `offers PRODUCT`     | Shop offers, default Danish in-stock new, cheapest `total` first.                                                         | `summary`, `offers[{merchant, price, regularPrice, campaignEnds, shipping, total, stock, condition, delivery}]`  |
| `history PRODUCT`    | Daily lowest price: current, low/high/median in the window, `currentPercentile` (0 = cheapest seen), downsampled series.  | `current`, `lowest{price, date, merchant}`, `highest`, `median`, `currentPercentile`, `series[]`                 |
| `info PRODUCT`       | Cheapest Danish in-stock offer, review score, pro reviews with pros/cons.                                                 | `name`, `url`, `cheapest{merchant, price, regularPrice, shipping, total, stock}`, `internationalFrom`, `reviews` |
| `compare PRODUCT…`   | Spec table; by default only rows that differ.                                                                             | `products[]`, `specs[{group, spec, values{<product name>: value}}]`                                              |
| `similar PRODUCT`    | Alternatives in the same category.                                                                                        | `[product]`                                                                                                      |
| `deals`              | Current price drops.                                                                                                      | `total`, `products[]`                                                                                            |

A product in `products[]` is `{id, name, price, oldPrice, dropPct, categoryId, rating, ratings, merchants, url}`.

`PRODUCT` accepts a bare id (`3216399795`), `94-3216399795`, or a pricerunner.dk `/pl/` URL.

## Filters

`-f` takes `ID=VALUE` and is repeatable; the `af_` prefix is added for you.

- Options (OR within one filter): `-f BRAND=162,1766`
- Range: `-f PRICE=500_1500`, `-f PRICE=_1500` (max only), `-f PRICE=2000_` (min only). Same for numeric spec filters (e.g. battery hours).
- Rating: `-f RATING=4_`
- In stock only: `-f ONLY_IN_STOCK=true` (works in `list`; `search` ignores it)
- Filter ids are numeric for specs (e.g. `59671607` = IP-klasse in headphones) and per category. Always look them up with `filters` then `facets`; never guess option ids.
- Category scoping differs by command: `search -c 94` or `search -c 100003567-100014541` (sub id); `list 94 --sub 100003567-100014541`.

## Workflow

1. **Vague request** ("cheap noise-cancelling earbuds"): `search` first. Its `appliedParams` shows what PriceRunner auto-extracted from the query (often an `af_CATEGORY`); pass `--no-extract` if that narrowed wrongly. Use `categoryId` from the results for the next steps.
2. **Spec-driven request** ("laptop with 32 GB RAM under 10.000 kr"): `categories 'bærbar'` → `filters 27` → `facets 27 <ramId> -g 32` → `list 27 -f <ramId>=<optId> -f PRICE=_10000 -s PRICE_ASC`.
3. **"Where do I buy X cheapest?"**: `offers`. Quote `total` (price + shipping), stock and delivery days. A `regularPrice` marks a shop's running sale: name the sale and its `campaignEnds` date. Mention `--international` if `summary.internationalOffer.minPrice` is notably lower.
4. **"Is this a good price / should I wait?"**: `history -i ONE_YEAR` (or `TWO_YEARS`). Compare `current` with `lowest` and `median`; a low `currentPercentile` means it is near its cheapest. Note seasonal dips (Black Friday, November) visible in `series`.
5. **Cheapest-first listings** (`-s PRICE_ASC`) surface miscategorised junk and one-shop marketplace listings. Set a realistic `PRICE` minimum and prefer products with several `merchants`, or sort by `POPULARITY`/`RATING` and filter by price instead.
6. **Choosing between models**: `compare` for differing specs, `info` for review scores and pro pros/cons.

## Answer

- Give a short answer with product names, prices and pricerunner.dk links, not raw JSON.
- Quote prices from `offers` or `info.cheapest`, which count shipping and only new, available stock. `summary`'s minimums and the `price` in `list`/`search` results are PriceRunner's overview: check a shortlist with `offers` before quoting it.
- Offer `url`s go through Klarna's clickout redirect; prefer linking the product page `url` from `search`/`list`/`info`.
