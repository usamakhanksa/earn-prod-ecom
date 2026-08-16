# API REGISTRATION GUIDE

How to obtain credentials for every platform in the OmniSell connector registry, what auth mechanism each uses, and what to do when a platform has no API at all.

> **Accuracy warning — read this first.** Provider developer programmes, endpoint versions, scope names, and approval requirements change frequently, and several entries in the original research list were dead or fabricated. Treat this document as a **starting map, not a source of truth.** Before a connector reaches users it must pass §7's verification protocol: a human opens the live developer docs, confirms the auth flow and scopes, records `apiDocsUrl` + `tosUrl` + `verifiedAt` + `verifiedBy` in the admin registry, and runs a real sandbox call. Anything unverified stays in Tier D and is invisible to users.

---

## 1. Auth mechanisms you'll encounter

| Mechanism | How OmniSell handles it | Storage |
|---|---|---|
| **OAuth 2.0 + PKCE** | User clicks Connect → redirect to provider → consent → code returned to `/v1/oauth/callback/:slug` → exchanged server-side for tokens → refresh worker renews before expiry | Encrypted token set + `expiresAt` |
| **OAuth 2.0 (confidential client)** | Same, with client secret held server-side only | Encrypted token set |
| **API key / Personal Access Token** | User pastes the token into the connection wizard → immediate test call → saved | Encrypted, masked hint shown (`••••4821`) |
| **HMAC key pair** (consumer key + secret, e.g. WooCommerce) | Both stored encrypted; requests signed per-call | Encrypted pair |
| **Partner-approved key** | Same as API key, but the connector is `GATED`: admin enables it per tenant only after the tenant proves partner status | Encrypted |
| **None (manual)** | No credentials. Export Pack path only | Nothing stored |

Everything is envelope-encrypted: a per-tenant data key (DEK) wrapped by the `KMS_MASTER_KEY`. Credentials are never logged, never returned by any API response, and never sent to the browser or mobile app.

---

## 2. Tier A — self-serve, full automation

These are the GA connectors. Credentials are obtainable by any user with an account, no approval queue.

### 2.1 Print-on-demand fulfilment

| Platform | Auth | Where to get it | Notes for the adapter |
|---|---|---|---|
| **Printful** | OAuth 2.0 (for multi-tenant) or private token (for single-store) | Printful dashboard → Developers / API section → create an app or private token | Rate-limited per key; catalog, cost, order, and fulfilment endpoints all available. Use OAuth for a SaaS — private tokens are per-store and don't scale |
| **Printify** | Personal Access Token | Printify account → My Profile / Settings → Connections → API / Personal access tokens | Token is scoped to the user's shops; you must first list shops, then operate per `shopId`. Blueprint + print-provider + variant hierarchy is three levels deep — model it properly |
| **Gelato** | API key | Gelato dashboard → Developers / API keys | Separate product, order, and shipment API surfaces. Global print routing means shipping estimates need a destination country |
| **Prodigi** | API key, separate sandbox and live keys | Prodigi dashboard → Settings / API | Sandbox is genuinely usable — build contract tests against it |
| **CustomCat** | API key | Account settings / integrations | Verify current API status before promoting past Tier B |
| **Teelaunch** | API key / app integration | Account → integrations | Historically Shopify-centric; confirm standalone API access |
| **Inkthreadable** | API key | Account → API | UK-based; check EU/GCC shipping coverage before recommending |
| **AOP+** | API key | Account → integrations | All-over-print specialist; print-file specs are unusually strict — encode them in `fieldSpec` |

### 2.2 Marketplaces and storefronts

| Platform | Auth | Where to get it | Notes |
|---|---|---|---|
| **Etsy** | OAuth 2.0 + PKCE | Etsy developer portal → register an app → receive a keystring → request production access | **App review is required for production.** Scopes are granular (`listings_r`, `listings_w`, `transactions_r`, `shops_r`…) — request the minimum. Strict rate limits. Digital and physical listings behave differently |
| **Shopify** | OAuth 2.0 (public app) or Admin API access token (custom app) | Shopify Partners → create app; or a merchant creates a custom app in their admin | Public app = App Store review + webhooks + mandatory GDPR webhooks. Custom app token is faster for early users. Use the Admin GraphQL API |
| **WooCommerce** | Consumer key + secret (HMAC or Basic over HTTPS) | WordPress admin → WooCommerce → Settings → Advanced → REST API → Add key | Self-hosted, so base URL varies per tenant. Validate the URL, require HTTPS, handle permalink-dependent route styles |
| **BigCommerce** | API account token | Store control panel → Advanced Settings → API Accounts | Scope selection at token creation; cannot be changed after |
| **Squarespace / Wix / Ecwid** | OAuth 2.0 (app-based) | Their respective developer portals | Digital-product support varies significantly — confirm capability flags per platform rather than assuming |

### 2.3 Digital products, courses, and checkout

| Platform | Auth | Where to get it | Notes |
|---|---|---|---|
| **Gumroad** | OAuth 2.0 (or application access token for own account) | Gumroad → Settings → Advanced → Applications | Access token grants broad account access — request narrowly and store carefully |
| **Payhip** | API key | Account settings → API | Confirm write capability; may be read/reporting-oriented |
| **Sellfy** | API key / OAuth | Account → developer settings | Verify current API availability |
| **Podia / Thinkific / Teachable / Kajabi** | API key or OAuth depending on platform and plan tier | Each platform's admin → integrations / API | **Several gate API access behind higher-priced plans.** Detect and surface this: "your Teachable plan does not include API access" is a far better error than a 403 |
| **SendOwl / e-Junkie** | API key | Account settings | Older APIs; expect XML or form-encoded responses in places |
| **Paddle** | API key (Merchant of Record) | Paddle dashboard → Developer Tools → Authentication | Paddle handles global sales tax as MoR — this materially simplifies the Tax Centre for tenants who use it |
| **FastSpring** | API credentials (Basic auth) | Dashboard → Integrations → API | Also MoR |
| **Stripe** | Restricted API key / Stripe Connect | Stripe dashboard → Developers → API keys; or Connect for platform flows | Use **restricted keys** with the minimum resource set. Stripe Connect only if OmniSell ever facilitates payments — see the open question in `brb.md` |

---

## 3. Tier B — approval-gated or partial

The connector exists but is `status: GATED`. The tenant obtains partner credentials themselves; a platform admin then enables the connector for that tenant. OmniSell never applies on a user's behalf.

| Platform | Access model | What the user must do |
|---|---|---|
| **Zazzle** | Partner / Associate API — approval required | Apply to Zazzle's partner or developer programme, receive credentials, paste into the wizard. Royalty rate (5–99%) is set on Zazzle's side, not ours |
| **Spring (formerly Teespring)** | Partner API / integrations, availability varies | Contact their partnerships channel; confirm current programme status — this platform has changed ownership |
| **Spreadshirt** | Partner/API programme with per-market marketplaces | Register as a partner; note that marketplace and shop APIs are distinct surfaces across 19+ country marketplaces |
| **CafePress** | Legacy API, availability unclear | Must be confirmed live before leaving Tier D |
| **Upwork** | API keys via their developer programme | Register an app, obtain keys, OAuth on behalf of the user. Read access is far more available than write |
| **Freelancer.com** | OAuth 2.0 developer app | Register in their developer portal |
| **Fiverr** | **No general public seller API.** Affiliate/partner programmes only | Do not promise gig automation. Manual/CSV income logging is the honest path |
| **Guru / PeoplePerHour / 99designs / Malt / Truelancer** | Varies; mostly no public write API | Verify individually. Default to manual logging |
| **Prolific** | API token | Account → Settings → API tokens. Researcher-side API; participant-side automation is not offered and would violate their rules |
| **Respondent / User Interviews / Maze / Userlytics / UserFeel / Loop11 / Optimal Workshop** | API keys, usually researcher-side and often plan-gated | These are *research-buyer* APIs. A creator earning as a *participant* has no API. Model this distinction explicitly or the feature will mislead users |
| **Clickworker / Appen / TELUS International / OneForma** | Enterprise/client-side APIs only | Worker-side earnings are not exposed. Manual/CSV logging |
| **Bugcrowd / HackerOne** | API tokens available to researchers | Account → settings → API token. Read-only reporting is the realistic scope |
| **Scale AI / iMerit / CloudFactory / Sama** | Enterprise client APIs — you buy annotation, you don't earn from them as an individual | **Out of product scope.** These belong in Tier D, not in a creator-income product |

---

## 4. Tier C — no API, Export Pack only

**There are no credentials to register.** These platforms have no public write API and their Terms of Service prohibit automated uploading. OmniSell will not automate them, and no amount of configuration will unlock it.

| Platform | Reality |
|---|---|
| **Redbubble** | Manual upload only. Bulk/automated uploading risks account suspension |
| **Merch by Amazon** | Invite-only, tiered upload limits, manual upload only. Automation is explicitly against policy |
| **Society6** | Manual upload only |
| **TeePublic** | Manual upload only (owned by Articore, same group as Redbubble) |
| **Threadless** | Manual upload via Artist Shops |
| **Design By Humans** | Manual upload only |

**What OmniSell gives you instead — the Export Pack:**
```
redbubble-2026-08-10-summer-collection.zip
├─ print-files/
│   ├─ design-01_7632x6480_300dpi_RGB.png     ← resized to that channel's spec
│   └─ design-02_7632x6480_300dpi_RGB.png
├─ mockups/                                    ← channel-appropriate ratios
├─ metadata.csv                                ← title · description · tags · category · pricing
├─ field-cards.html                            ← one-click copy per field, in upload order
└─ CHECKLIST.md                                ← exact click path, in your language
```
After uploading, mark the pack confirmed in **Channels → Export Packs**. Listing state, analytics, and manual income logging then work the same as for automated channels.

---

## 5. Tier D — quarantined

Present in the admin registry with `status: UNVERIFIED`, invisible to users, no adapter code.

**Dead, merged, or renamed:** SunFrog · ViralStyle · TeeChip · Selz (Wix acquisition) · GitHub Jobs (closed 2021) · Stack Overflow Jobs (closed 2022) · Figure Eight (→ Appen) · Lionbridge AI (→ TELUS International) · Playment (→ TELUS International) · Validately (→ UserZoom → UserTesting) · Samasource (→ Sama) · AngelList Talent (→ Wellfound) · Spare5 · Hive Micro.

**Unverifiable domains from the source list:** `dprint.com` · `inkblot.com` · `brikink.com` · `teechiptech.com` · `aftom.com` · `merchfactory.com` · `teeslocal.com` · `trucrowd.com` · `inktale.com` · `shirtly.com` · `kitcreator.com` · `printclever.com` · and `phasis.com` (the real company is Mphasis at `mphasis.com`, and it is an IT-services firm, not a channel).

**Out of scope entirely — not income channels for a creator:**
- IT-services and consulting firms: Accenture, Deloitte, PwC, EY, KPMG, Infosys, TCS, Wipro, HCL, Tech Mahindra, Cognizant, EPAM, Globant, Endava, and the rest of that block.
- Social platforms listed as "IT services, data annotation": Facebook, Twitter/X, LinkedIn, Instagram, Pinterest, Snapchat, TikTok, YouTube, Reddit, Quora, Medium.
- Endpoint-security and vulnerability vendors filed under "user testing": CrowdStrike, SentinelOne, Kaspersky, McAfee, Trend Micro, Qualys, Tenable, Rapid7, Palo Alto Networks, Fortinet, Check Point, and the accompanying CVE databases (NVD, CVE Details, Exploit-DB, Packet Storm).

These were category errors in the source research. They are removed from the product, not deferred.

---

## 6. Connecting a channel in OmniSell (user flow)

1. **Channels → Connections → New connection.**
2. Pick the platform. The tier badge and capability matrix appear immediately — you see what will and won't be automated *before* you connect.
3. **Tier A/B:** either click *Connect with OAuth* (redirect and consent) or paste your API key. **Tier C:** there's nothing to connect; you'll be routed to Export Packs.
4. OmniSell runs a live test call and shows the result — account name, shop list, permission scopes actually granted.
5. Confirm and save. Credentials are encrypted; only a masked hint is ever displayed again.
6. Check **Connection Health** afterwards for last-success time, error rate, rate-limit headroom, and token expiry countdown.

**Rotating a key:** Connections → *(connection)* → Rotate. Paste the new value; the old one is overwritten and a rotation audit event is recorded.
**Disconnecting:** you choose whether to keep existing listings as orphaned records (recommended — preserves history and analytics) or purge them.

---

## 7. Verification protocol (mandatory before any connector goes live)

Run this for every connector. No exceptions, no "it probably still works."

- [ ] Open the live developer documentation. Record the exact URL in `apiDocsUrl`.
- [ ] Open the current Terms of Service / API terms. Record in `tosUrl`. **Read the automation and rate-limit clauses.**
- [ ] Confirm the auth mechanism and the exact scope strings. Do not infer them.
- [ ] Confirm whether writes are permitted, and whether approval is required.
- [ ] Confirm published rate limits; enter them into `rateLimit`.
- [ ] Confirm image and print-file specs; enter them into `fieldSpec`.
- [ ] Create a sandbox or test account and make a real call for every capability you're claiming.
- [ ] Write the adapter, MSW unit tests, and a nightly sandbox contract test.
- [ ] Record `verifiedAt` and `verifiedBy` (a person's name, not a service account).
- [ ] Legal sign-off for any connector where the ToS language on automation is ambiguous.
- [ ] Set the tier and status. Only now does it become visible to users.

Connectors auto-flag in the admin health board 180 days after `verifiedAt`. Re-run this checklist when they do.
