# Cache, Tasks startup and live server GPT — 2026-09-21

## Delivered scope and identities

This supersedes the earlier same-day activation-preflight blocker for **Staging only**. No application/user data was cleared. Production application code, DNS, destinations, ports, TLS validation, shared wealthos.ir settings and other projects were not changed.

| Surface | Verified result |
|---|---|
| Local source | Tasks launch and GPT continuation fixes; paid execution disabled and old budget authority FROZEN |
| Public Staging `https://personalagent.wealthos.ir:8443/` | Deployed `1b6676742c759216d1f2516cf8d6026cedf8bcd5`; real GPT responses and confirmation flow passed; owner-only funded access retained |
| Production `https://personalagent.wealthos.ir/` | Older deployment, not silently upgraded; worker differs legitimately from Staging |
| Released phone APK | Still preview40, unchanged; it does not contain the newly generated offline startup code |
| Bundled interface source | Ordinary startup is Tasks; independently checked in the browser; not a newly released APK |
| Owner phone | Installed identity/signature/local-only data and actual GPT/notification/Alarm acceptance remain unverified |

## Preservation and rollback

Owner-only operation evidence is outside Git at `C:/Users/pc/Desktop/project-backups/tia-cache-startup-20260921/`. The Git bundle was restored and checked, source was archived, local database and a fresh consistent server SQL snapshot were restored separately;18tables passed integrity/foreign-key checks. Pre-transfer monetary snapshots preserved6receipts and156237microUSD. Original backups were retained.

Before each tested Staging release, the standard deployment tool backed up configuration, PM2 state and the live database, and checked migrations on a separate restored copy. The final pre-release backup is `/home/wealthos_dev/.staging/personal-agent/data/backups/pre-release-20260921T094453Z`; previous code target is `c13ad9585de4bacd77e614f10ab1113374390879`. The monetary ledger also has a separate checked snapshot before this release. An application rollback MUST NOT restore an old spend database, duplicate active ledgers, or erase receipts. Stop paid execution on uncertainty; retain the current ledger. Returning paid execution to local requires a new forward handoff of the current state, not unfreezing its old snapshot.

## Exact CDN changes and remaining limitations

Before change, Page Rules listed no paths. Added only the hostname path `personalagent.wealthos.ir/**`, priority5, with active **Cache Settings=Off** and **Browser Caching=Off**. Rollback is to disable these two new rules. No browser cache/cookies/session/phone storage was cleared and no CDN purge was needed.

Fresh Windows public GETs at09:46UTC and the earlier Linux comparison distinguish443 from8443. Staging root/login/API preserve `private/no-store`; both workers use `no-store, no-cache, must-revalidate, max-age=0` and BYPASS. Worker hashes:

- Staging8443: `e00e53b1890e57bfee548a40f17eb65f61b929db51e7b7dd11148a4a09c47c0c` (current source/origin3010).
- Production443: `4440f79593219fb07ce1785e1f2bb1b08aa54a157c034c99950d9e02b258ddbc` (its old origin3011), not substituted for Staging.

Actual public browser startup showed Tasks and current loaded chunks, including `00dye9l7r3os3.js` and `388av0llixrx6.js`; CSS and Persian RTL rendered. HTTP health alone was not used as UI evidence.

**Not fully resolved:** the provider Page Rules editor rejects additional Ignore Cache Control / Client Headers / Browser TTL writes with `Cannot read properties of undefined (reading 'pathId')`. Those settings were NOT saved. An asset-specific path `personalagent.wealthos.ir/_next/static/**`, priority10, exists with **zero rules** and no effect. Its unsaved modal was closed. The two effective rules temporarily disable browser caching of hashed assets too, with a performance/download trade-off. An administrator/provider should repair this editor and scope immutable hashed-asset caching without changing auth/API no-store. Do not retry through hidden-state manipulation or broaden domain scope.

Production root/login still return origin `s-maxage=31536000`; its health/tasks responses lack no-store and its recovery asset is404. CDN BYPASS alone does not correct those old application headers. This is a remaining Production-origin issue, not proof of a bad certificate or permission to deploy the new application under the cache-only authorization.

## Tasks startup

`initialDashboardView` is shared with the generated Android interface. No valid view query means Tasks; explicit today/tasks/calendar/assistant/settings remain intact. PWA starts at `/?view=tasks` without changing its installation id/scope. Ordinary login returns to Tasks, while an explicit assistant return stays explicit. No saved data or drafts were deleted and no stored navigation key was rewritten.

Local and public browser desktop/mobile checks covered ordinary startup, reload, + opening the editor and assistant deep links. Public mobile viewport was independently read from rendered DOM as390×844 and visually checked; desktop1280×720 was visually checked. Temporary viewport overrides were reset. A transitional tool screenshot did not reflect the requested dimensions and was not counted as mobile evidence. Bundled browser DOM independently showed `panel=tasks`, selected کارها, editorClosed,390×844.

The prior source default was Today, not an auto-open editor; the precise cause of the owner's reported phone New form cannot be asserted without identifying that installed version. These fixes set the intended policy without falsely identifying the phone's cause.

## Live GPT and one budget authority

The already protected replacement credential was transferred privately to Staging, outside Git/client/APK, with owner-only server files. No key was created or printed. Raw external voice remains disabled. The exact owner account was matched separately on local/server; the synthetic account was not treated as the owner.

The local source was frozen transactionally; the packet preserved every existing receipt. The sole active version2 ledger is bound to `server.r1host.com` and its exact private canonical path. Local paid configuration is false and its ledger remains FROZEN. Server activation permits only the verified owner after QA; the temporary synthetic ID was removed and a new attempted externally-consented synthetic request returned **local**, without additional spending. Restart retained the ledger digest unchanged. Only explicitly consented text can leave tia; proposal execution still requires separate confirmation.

Final09:47UTC state:

- Local:6receipts,156237microUSD,FROZEN/halted.
- Server:12receipts,164434microUSD,zero pending,ACTIVE; shared monthly cap2000000microUSD.
- Six new real requests in this work accounted for8197microUSD (approximately$0.008197); remaining accounted allowance$1.835566. The ledger includes conservative historic accounting, not a provider invoice or an unlimited spending authorization.
- Server state digest `a825379af08c2610891ba70eb71f206f65be20dc478c659ca40e313048be7247`.

## Live regressions found, fixed and retested

Two earlier acceptance attempts deliberately remained failed even though GPT returned real responses:

1. An otherwise complete draft was blocked by generic approval prose (“می‌خواهید این جلسه ساخته شود؟”). Only complete, unambiguous, entity-matching create confirmation is treated as redundant; actual ambiguity and destructive confirmation remain.
2. A correction to a pending creation was mislabeled UPDATE with no persisted target. Normalize only when the owned prior draft and local continuation both remain targetless CREATE of the same entity. Preserve real update/delete/complete, target ownership and explicit approval.

Final public8443 synthetic acceptance passed real Persian title/time17:00 and three reminders[1440,180,60], same-draft correction to18:00, no effects before approval, explicit confirmation and idempotent retry, cancellation and refusal to execute a cancelled draft. No-consent was local. The single synthetic meeting was subsequently completed through the ordinary authenticated API; read-only database verification found exactly1DONE meeting and3CANCELLED reminders. No personal tasks, audio or device recipients were used. Test records/cost evidence remain preserved, not deleted.

## Code/build/native evidence

- Full local **1018tests in86files**, Type Check and relevant Lint passed. CI [35584608903](https://github.com/tparkhondeh/personalAgent/actions/runs/35584608903) passed full Type Check, Lint, Test, backup validation, Build and packaged-server integration suites.
- Exact web artifact10631699010, ZIP SHA256 `8595473acf02fc5220c7dc5354eb42bfbaf0d946dd32ff96de8e9ad795af6595`, verified before extraction and deployment. Packaged tar SHA was separately checked. No rebuilding on the server or untested APK substitution.
- Native Run35582388630 failed because it expected old Today text although actual WebView rendered Tasks. The expectation and source guard were corrected; text/RTL/screenshot/log gates were retained. An intermediate web CI caught the stale source guard and failed; final full tests passed after alignment. Do not count either failure as success.
- Android16 [35584608948](https://github.com/tparkhondeh/personalAgent/actions/runs/35584608948) **passed**:14instrumented tests,0failures/errors/skips; real Persian Tasks content and RTL; clear system UI; app log checker reported no failures or observation failures. Evidence artifact10632550549 was downloaded and ZIP SHA256 `f78205a8d5f85e6c562488892a7644cfae39ba82317251308b4c0a2546d48817` matched. The actual cold-launch PNG was visually examined: light pastel Tasks dashboard, selected Tasks, + button, no system overlay. This internal connected build points to `http://10.0.2.2:3001/`; it is not the phone delivery, a public-server GPT test on Android, or a new13/14 acceptance.

## Safe phone handoff remains blocked

Existing release: **tia آزمایشی40**,1.0.40/code40,`ir.wealthos.personalagent.stable40`; source`34180286b90008498c839f3ec3b4fd72749c750a`; APK SHA256`909bf6f8b5dbb46f937210a787215006cfd7b223eaf880a359636fc1b2262fe9`. [Existing preview only](https://github.com/tparkhondeh/personalAgent/releases/download/phone-preview-stable-40/tia-stable-40.apk).

This is NOT the new Tasks/offline/GPT-completion delivery. Existing signing evidence does not allow a compatible upgrade using the available internal signing key. The owner's exact installed name/version was requested once during this work; the owner asked for clearer wording, so a simple request for the phone's App Info screenshot was given. Version/signature evidence has not yet been received and no phone is connected. Do not uninstall or clear it, change identity/signing, or present the internal candidate as a safe update. After installed identity/data/signature are confirmed, use matching signing material or a separately approved, tested data-preserving migration. Real phone GPT, notification/Alarm and background behavior still require acceptance. Production promotion and immutable asset-cache refinement are distinct gates.
