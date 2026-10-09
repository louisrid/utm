# FANVUE / X ARTICLE TRACKER

**A Netlify website that reads your EXISTING campaign Sheet. No separate publisher entry.**

Source Sheet: https://docs.google.com/spreadsheets/d/1iaKTKoGf58i9uH5sT23r6vxX5XYVx3VfS8fLp-8xRbM/edit

Destination: https://prism-builder.com/

## What works

- Reads every publisher row in the existing `WEEK 1 - LOUIS`, `WEEK 2 - CONNOR` and similarly structured campaign tabs.
- Every row is one article/post placement. The same publisher can appear on multiple rows for additional placements.
- Generates **stable uppercase codes** (A01-P01, A01-P02...) and writes them into the *regular* source tabs.
- Keeps current spreadsheet fields **A:N** intact. Adds `O: UTM ID`, `P: UTM LINK`, `Q: TRACKED CLICKS`, `R: LAST CLICK` automatically.
- Shows price from G, paid status from L, posted status from M, post URL from N, publisher from B. Nothing needs entering separately in the website.
- Publishes anonymous click counts (not signups) to the dashboard.
- On every publisher edit, Apps Script automatically refreshes the website's inventory.
- **Every 12 hours**, Apps Script calculates click totals and cost-per-click reporting (Google's scheduling is approximate).
- Protected private dashboard; links and Google Apps Script credentials are never exposed in the browser.
- No external database; no paid SaaS required for small/normal campaign usage.

## Setup: 1. Deploy the website to Netlify

**Fastest reliable route: Netlify CLI from this project folder.** This deploys the Netlify Functions as well as the website (a simple drag-and-drop static-site upload is not enough).

Requirements: Node.js 18+ and a free Netlify account.

```bash
cd fanvue-utm-tracker
npx netlify-cli login
npx netlify-cli deploy --prod
```

Follow the prompt to create a new site. The site uses `netlify.toml` for the `public` folder and functions directory. Note its URL, e.g. `https://your-project.netlify.app`.

Alternative: commit the folder to GitHub, then use **Netlify > Add new project > Import an existing project**, point it at the repository, leave build command empty, and deploy. Netlify automatically reads `netlify.toml`.

The dashboard initially requests a password but will not connect until Steps 2-3.

## Setup: 2. Connect your original Google Sheet

1. Go to https://script.google.com/home/projects/create (with permission to edit the target Google Sheet).
2. Replace the editor's starter code with **the entire contents of `apps-script/Code.gs`**.
3. Near the top change `SITE_URL: 'https://YOUR-SITE.netlify.app'` to your ACTUAL Netlify site URL.
4. Save; choose `setup` from the function selector and click **Run**.
5. Grant the requested Google access to the script. The script needs permission to edit the existing workbook, create three reporting tabs, and create two triggers.
6. In **Executions / Execution log**, copy the `APP_SCRIPT_TOKEN` value from the `SETUP COMPLETE` log line. **Treat it as a password.**
7. Choose **Deploy > New deployment > Select type: Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Deploy, then copy the URL ending in `/exec`.

The public web app endpoint is protected by the secret token. Do not put the token in a browser URL, public repository or client JS file. Google may display a warning for your own unverified Apps Script; only approve code you personally reviewed.

Once setup completes, the original Sheet gains `UTM ID`, `UTM LINK`, `TRACKED CLICKS`, `LAST CLICK` in columns O:R and three auto-generated tabs: `UTM INDEX`, `UTM EVENTS`, `UTM SUMMARY`.

**Important:** Google may require you to create a **new deployment version** if you change the Apps Script code after its first deployment. You do not need to redeploy for ordinary spreadsheet edits.

## Setup: 3. Finish Netlify configuration

In Netlify **Site configuration > Environment variables**, add these exact variables:

| Name | Value |
|---|---|
| `APP_SCRIPT_URL` | The `/exec` Apps Script Web app URL |
| `APP_SCRIPT_TOKEN` | Secret printed when you ran `setup` |
| `DASHBOARD_KEY` | A long password you choose for the website dashboard |

Deploy the Netlify site again so the Functions receive the environment variables. Refresh the website and enter your chosen `DASHBOARD_KEY`. Your source Sheet publisher rows will be visible.

## Setup: 4. Verify a real click

1. In `WEEK 1 - LOUIS`, check columns O and P beside your first existing account.
2. Open the **UTM LINK** from column P in a normal browser. It should redirect to `prism-builder.com` with short uppercase UTMs.
3. Check `UTM EVENTS`: a new row should contain the tracking code and timestamp.
4. In Apps Script, run `refreshReports` once for an immediate summary; thereafter, it runs automatically twice a day.
5. Check `UTM SUMMARY`, column Q of the original campaign tab, and the website dashboard: the click should appear.

**Important testing point:** some browsers and X may prefetch links. The Netlify function filters common bot / preview user-agent names, but totals are not guaranteed to represent unique human visitors. There is no cookie-based visitor deduplication.

## How to use, once installed

**Only work inside the existing normal Google Sheet.**

- Add an account in column B in a new row: a UTM code and link are generated automatically in O and P.
- Enter the article price in G; update paid status in L, publication status in M, published X link in N.
- The same publisher can have several placements: give each its own row (new permanent code).
- The website reads these fields directly from the synced index. Use its filters for owner, article and status.
- After you publish a link on X, readers are redirected to Prism while the click is recorded. Aggregates recalculate every 12 hours.
- To see updated counts immediately, run `refreshReports` in Google Apps Script, then click **Refresh data** on the website.

If you add a new tab, use the same B/G/H/L/M/N layout and the row-7 headers `ACCOUNT` in B7, `ARTICLE` in G7; the system automatically recognises it at the next edit/sync. Article number is read from H7 (e.g. 1 produces `A01`).

## UTM convention (all capital values)

| Key | Value | Meaning |
|---|---|---|
| `utm_source` | `X` | X/Twitter |
| `utm_medium` | `ART` | Article placement |
| `utm_campaign` | `A01` | Article 1 |
| `utm_content` | `P01` | Publisher placement 1 |

Example short link: `https://your-project.netlify.app/r/A01-P01`

Destination: `https://prism-builder.com/?utm_source=X&utm_medium=ART&utm_campaign=A01&utm_content=P01`

The `P##` identifier is a **placement ID**, not an X handle. It is assigned automatically once and stays stable, even if a row is sorted (sort source columns B:R together). A copied tracking ID is regenerated if duplicated across rows. The website translates the code into the actual account name.

## Data and security boundaries

- Logs: click timestamp and placement code, **no visitor IP storage**, no cookies.
- Site functions use a private Apps Script token stored only in Netlify environment variables.
- Dashboard requires a separate password. Redirect links are intentionally public.
- Automatically recognised publisher sheets are currently constrained to the source workbook and its particular row/column format. A totally different historic promo workbook needs a separate adapter, not guessed column mappings.
- Monetary figures are based on values in the Article price field. Currency is assumed to be **USD**, matching current `$` entries; change the currency label if that changes.
- Clicks and cost per click are **traffic metrics only**. They do not verify Prism sign-ups, Fanvue creator referrals, transactions or earnings. Conversion metrics require access to an approved Prism/Fanvue reporting API or export.
- Google Apps Script and Netlify have free usage quotas and serverless constraints. This design is suitable for an initial modest campaign, **not a guaranteed unlimited-traffic production click service**. Particularly high concurrent traffic can exceed Apps Script limits, causing an error rather than silently inventing clicks.

## Developer checks

```bash
npm test
```

Architecture: public HTML/CSS/JS site -> Netlify `dashboard` function (password gated) -> Apps Script `dashboard` API -> source Google Sheet. A tracking click visits `/r/A01-P01`, Netlify `go` function -> Apps Script `hit` API (synchronously logs event) -> 302 to Prism with UTMs. Google Apps Script triggers refresh its index on every ordinary edit and recompute event summaries every 12 hours.

### Fail-open redirect policy

If Google Apps Script is temporarily slow or unavailable, the Netlify tracking link still redirects the reader to the approved `prism-builder.com` destination using its short capital UTM codes. **That particular click may not be logged**; Netlify function logs mark it as `unconfirmed`. This prioritises publisher traffic and referral opportunities over perfect click counts.
