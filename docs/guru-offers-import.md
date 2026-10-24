# Guru offers — 24 October 2026

Read all 25 visible products and 85 offers through the merchant's authenticated Guru UI. The source was read only; no offer, payment, webhook or subscription was changed in Guru. Product codes identify the local product even when its display name differs.

`guru-offers-2026-10-24.json` records each source offer ID, product code, name, original slug, price in cents, selected payment methods, maximum and free installments, four-decimal interest rate, initial installment selection and exact recurring interval/cycle limit. No promotional prices, cash discounts, quantities other than one or variable-interest offers were present. Teste is a local-only product with no Guru counterpart.

## Compatibility

- Guru's “Taxa única” uses `round(price_cents * (1 + rate / 100 * installments))` above the free installment limit. Verified against Guru's complete 12-row table for R$3,000 at 2.2%, and the R$3,600 table with three free installments. Protocolo R$47 at 2.23%, 3x, totals R$50.14. Existing local offers retain Price unless explicitly changed.
- Rate storage and admin validation preserve four decimals, including 2.2999%.
- Source offers allow up to 18 installments. These are copied as configured; actual acquiring acceptance will be checked during the deferred purchase simulation.
- Subscriptions use exact day intervals (29/30/90), not calendar-month approximations. Finite billing limits are passed as `items[].cycles`; zero omits the limit. Official references: https://docs.pagar.me/reference/criar-plano-1 and https://docs.pagar.me/reference/item-do-plano-1 .
- Six subscription offers contain unsupported Pix and/or boleto methods. Original selections are retained in `guru_config`; native checkout exposes credit card and the admin editor displays the limitation. No automatic Pix/boleto subscription integration was added.
- Product plan mappings and access periods were preserved. Products without a linked app plan still cannot be charged. The existing Protocolo offer ID, URL and visual settings were preserved rather than duplicated.
- Creating an order, billing an existing subscriber, changing production payment flags or performing the final simulated purchase is outside this import. No such action was executed.

## Reproduce and validate

Apply migration `20261024185426_checkout_guru_offer_terms.sql`. Generate reviewable SQL with `node scripts/import-guru-offers.mjs`. It imports by source offer ID, joins local products by their original code, validates types and aborts on unexpected unmapped local offers. New records start inactive. It does not read credentials or call a gateway. Activate imported records only after publishing compatible code and comparing database values to the source manifest.

Validation: 85 offers, 25 product codes, zero commercial-field mismatches; database duplicate RPC preserves financial terms without duplicating source identity; 84 automated tests and production build passed. Real gateway acceptance remains pending the final simulated purchase.
