# Rule: AMLSync client pricing on top of Didit costs

Use this rule whenever you calculate, quote or display a client price for any service that AMLSync delivers using Didit (identity verification, AML screening, KYB, non-document lookups, digital ID wallets, phone checks, etc.).

## 1. Core formula

```
client_price_EUR = didit_cost_EUR + margin_EUR
didit_cost_EUR   = didit_cost_USD × EUR_PER_USD
```

- Didit publishes prices in **USD**. AMLSync bills clients in **EUR**.
- `EUR_PER_USD`: use the current ECB reference rate. If you can't look it up, ask the user for the rate. Never guess it. Always state the rate and date you used.
- Base the calculation on Didit's **public list price** (didit.me/pricing). Ignore free-tier allowances and plan discounts (Growth 4%, Scale 10%). Those savings stay with AMLSync as extra margin.

## 2. Margin tiers (the higher the Didit cost, the higher the margin)

The tier is chosen by the Didit cost in **USD** for one billable unit:

| Didit cost per unit (USD) | AMLSync margin (EUR) |
|---|---|
| under $0.50 | **+ €1.00** |
| $0.50 to $2.00 (inclusive) | **+ €2.00** |
| over $2.00 | **+ €3.00** |

- The margin is always between €1 and €3. It is never below €1 and never above €3.
- Tier boundaries: exactly $0.50 → €2 tier; exactly $2.00 → €2 tier; $2.01 and up → €3 tier.

## 3. What counts as one billable unit

- **Standalone service** (e.g. one AML screening, one non-document lookup, one KYB registry check): that service is one unit. It gets one margin.
- **Bundled package sold to the client as one item** (e.g. "Full onboarding check" = KYC bundle + AML screening): first add up all Didit costs in the package, then pick **one** tier from the total and add **one** margin. Do not add a margin per component.
- **Recurring services** (e.g. Ongoing AML Monitoring at $0.07 per user per year): the unit is one user per year.

## 4. Rounding

- Calculate with full precision, then round the final client price **up** to the nearest €0.05.
- Show the client price with 2 decimals (e.g. €1.35).

## 5. Pass-through costs

- **Phone verification**: Didit charges $0.02 + the carrier cost for that country. The carrier cost changes, so use the actual carrier cost for that country (check the Didit Workflow Builder). If you don't know it, mark the price as "estimate".
- **Database validation**: Didit does not publish per-country prices for this publicly. Ask the user for the Didit cost before quoting.
- **KYB registry prices** are Didit's staging rates (not yet live in production). Flag them as "subject to change" in any quote.

## 6. Didit reference prices (USD, list prices from didit.me/pricing, checked 20 Nov 2026)

Re-check didit.me/pricing before you send a client quote. Prices can change.

### Flat-price modules (same in every country)

| Module | Didit USD | Tier |
|---|---|---|
| Full KYC bundle (ID + passive liveness + face match + device/IP) | 0.33 | +€1 |
| ID Verification | 0.15 | +€1 |
| NFC Reading | 0.15 | +€1 |
| Proof of Address | 0.20 | +€1 |
| Document AI (per document) | 0.20 | +€1 |
| Passive Liveness | 0.10 | +€1 |
| Active Liveness | 0.15 | +€1 |
| Face Match 1:1 | 0.05 | +€1 |
| Biometric Authentication | 0.10 | +€1 |
| Age Estimation | 0.10 | +€1 |
| AML Screening | 0.20 | +€1 |
| Ongoing AML Monitoring (per user per year) | 0.07 | +€1 |
| Email Verification | 0.02 | +€1 |
| Device & IP Analysis | 0.03 | +€1 |
| Custom Questionnaire | 0.10 | +€1 |
| Wallet Screening (KYT) | 0.15 | +€1 |
| Travel Rule (per outbound exchange) | 0.02 | +€1 |
| KYB Company AML / Person AML / KYB document step (each) | 0.20 | +€1 |
| KYB manual-entry completion | 0.75 | +€2 |

### Non-document verification (national ID number lookup), per country

| Country | Didit USD | Tier |
|---|---|---|
| Argentina | 0.20 | +€1 |
| Bolivia | 0.20 | +€1 |
| Brazil | 0.40 | +€1 |
| Cambodia | 0.35 | +€1 |
| Canada | 3.95 | +€3 |
| Chile | 0.20 | +€1 |
| China | 0.30 | +€1 |
| Colombia | 0.20 | +€1 |
| Costa Rica | 0.20 | +€1 |
| Denmark | 1.39 | +€2 |
| Dominican Republic | 0.05 | +€1 |
| Ecuador | 0.20 | +€1 |
| El Salvador | 0.20 | +€1 |
| Finland | 2.10 | +€3 |
| France | 1.54 | +€2 |
| Guatemala | 0.20 | +€1 |
| Honduras | 0.20 | +€1 |
| India | 0.25 | +€1 |
| Indonesia | 0.35 | +€1 |
| Kenya | 3.15 | +€3 |
| Malaysia | 0.35 | +€1 |
| Mexico | 0.20 | +€1 |
| Netherlands | 0.90 | +€2 |
| Nigeria – NIN | 0.20 | +€1 |
| Nigeria – BVN | 0.35 | +€1 |
| Norway | 2.42 | +€3 |
| Panama | 0.75 | +€2 |
| Paraguay | 0.20 | +€1 |
| Peru | 0.20 | +€1 |
| Singapore | 4.30 | +€3 |
| South Africa | 2.20 | +€3 |
| Sweden | 0.35 | +€1 |
| Thailand | 0.35 | +€1 |
| United Kingdom | 1.85 | +€2 |
| United States | 0.27 | +€1 |
| Uruguay | 0.20 | +€1 |
| Venezuela | 0.20 | +€1 |

### Digital ID wallets (per completed verification)

| Wallet | Didit USD | Tier |
|---|---|---|
| MitID (Denmark) | 0.25 | +€1 |
| BankID Sweden | 0.20 | +€1 |
| Finnish Trust Network | 0.25 | +€1 |
| Smart-ID (Baltics) | 0.21 | +€1 |
| Mobile-ID (Baltics) | 0.21 | +€1 |

### KYB registry checks (staging rates, subject to change)

| Tier / region | Didit USD | Margin tier |
|---|---|---|
| Lite (all listed countries) | 2.00 | +€2 |
| Shareholders – most of Europe (list below) | 4.00 | +€3 |
| Shareholders – rest of world | 5.00 | +€3 |
| UBO – most of Europe (list below) | 5.00 | +€3 |
| UBO – rest of world | 9.00 | +€3 |

**"Most of Europe"** (didit.me/pricing, 20 Nov 2026): Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Iceland, Ireland, Italy, Latvia, Liechtenstein, Luxembourg, Malta, Netherlands, Norway, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden, Switzerland, United Kingdom.

**Exception: Lithuania** stays on the rest-of-world rate ($5 shareholders / $9 UBO) for now. Didit's pricing page lists it in the European group, but Didit told us directly that Lithuania uses the higher rate. Being confirmed with Didit.

## 6a. Identity check sold as one item, and eID wallets

- The identity check is sold as one package: Full KYC bundle $0.33 + NFC reading $0.15 + AML screening $0.20 = **$0.68** → €2 tier.
- The firm is charged this price when the check is sent. If the client then verifies with an eID wallet (Smart-ID, Mobile-ID, MitID, BankID, Finnish Trust Network), the package is wallet + AML screening (Smart-ID: $0.21 + $0.20 = $0.41 → €1 tier), and the difference is **returned automatically as credit** once the verification completes.

## 6b. Register searches

- The search pack stays at **€2 for 5 searches** until it is clear whether Didit charges for registry searches. Didit's pricing page says registry search is free; the $0.50 per search came from Didit's earlier written answer. If searches cost $0.50, the rule applies to the pack (5 × $0.50 = $2.50 → €3 tier, about €5.30).

## 7. Worked example

Assume EUR_PER_USD = 0.86 (example only; use the current rate).

- **Full KYC check**: $0.33 → €0.284 + €1.00 = €1.284 → round up → **€1.30**
- **UK non-document lookup**: $1.85 → €1.591 + €2.00 = €3.591 → **€3.60**
- **Singapore non-document lookup**: $4.30 → €3.698 + €3.00 = €6.698 → **€6.70**
- **Package "KYC + AML"**: $0.33 + $0.20 = $0.53 → €2 tier → €0.456 + €2.00 = €2.456 → **€2.50**

## 8. Output requirements

When you produce a price list or quote:
1. Show for each line: service, Didit cost (USD), Didit cost (EUR), margin (EUR), client price (EUR).
2. State the exchange rate used and its date.
3. Mark estimates and staging rates clearly.
4. Never show Didit costs or margins in a document meant for clients unless the user asks for it. Client-facing versions show only the client price.
