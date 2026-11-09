# Resource monitor

Local monitor screen and polling loop. Demo amounts are fictitious. Codex ChatGPT subscription-limit and GLM Coding Plan quota adapters are available; real accounts need authorization and live verification. OpenAI API, Claude, and Z.ai Standard API credits are not connected.

Requires Node.js 24. Copy `config.example.json` to `config.json`, edit `locale` (`en` or `ru`) and account/source IDs and labels, then run `node server.mjs`. Open `http://127.0.0.1:8765`. The server listens only on loopback. To see the empty state, start without `config.json`. Changes to config, including locale, take effect after restarting the server and refreshing the page. The in-memory cache resets on restart.

Each account and source needs a unique ID within its parent. `demo` supplies fictitious data for either `subscription` or `api`. `zai` reads GLM Coding Plan subscription quotas only. Copy `config.glm.example.json` to `config.json` to configure two independent Z.ai accounts; set each `env:NAME` variable to that account's Coding Plan token in the server process environment. Add more accounts in config with distinct IDs and env names. Never put token values in config, URLs, command arguments, logs, or the browser. The Z.ai adapter does not use working login sessions or support `local:` references.

For two Codex accounts plus one GLM account, use the combined example (keep an existing `config.json` and merge its entries instead):

```sh
cp -n config.codex.example.json config.json
node codex-login.mjs personal
node codex-login.mjs work
read -rsp 'Z.ai token: ' ZAI_MONITOR_TOKEN; echo; export ZAI_MONITOR_TOKEN
node server.mjs
```

Run each `codex-login.mjs` command yourself in a local terminal and complete the official browser login for that profile. Stop the monitor before logging into the same profile. The helper accepts only a profile alias and uses `.monitor-codex/<alias>` as its dedicated `CODEX_HOME`; it does not copy or switch your working Codex login. Each alias may appear only once in config. Profiles and credentials stay in this ignored, private directory. The helper and reader force Codex's file credential store, reject profile symlinks, custom `config.toml`, unsafe `auth.json`, and concurrent use of a profile. The normal 10-second scheduler starts a bounded app-server child per read and holds the profile lock until that child exits. After a crash, check that no monitor/login process owns the profile before removing a stale `.monitor-lock` directory. Never share `auth.json` or profile paths. A missing login appears as “Authorization needed”; finish that profile's login and use Refresh. The Codex adapter reads every returned primary and secondary limit window, including 5h only when its reported duration is 300 minutes. A missing window or percentage stays unknown; previously known values remain visible as stale. Response receipt time is the observation basis. No model request is made. Separate profiles isolate the account state; a real two-account comparison remains to be completed by the user.

The Z.ai reader sends a read-only GET to the fixed `https://api.z.ai/api/monitor/usage/quota/limit` endpoint with the raw token as `Authorization`, following the [official plugin script](https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs). It refuses redirects. This is an undocumented interface and may change. The script identifies `TOKENS_LIMIT.percentage` as 5h used percentage and `TIME_LIMIT.percentage` as monthly MCP used percentage. The screen converts each valid used percentage to remaining percentage. Weekly quota and reset timestamps are explicitly unknown. Missing or partial percentages show unknown on first read; a previously known value and observation time remain visible as stale until a valid replacement arrives. MCP `currentValue`, `usage`, and `usageDetails` are not interpreted because their units are unconfirmed. These percentages are not money, Standard API credits, or a billing balance. The common 10-second scheduler and Retry-After handling apply; a Z.ai-specific cadence has not been established. A successful read uses response-received time as its observation basis because this endpoint does not establish a source measurement timestamp.

Missing tokens and HTTP 401/403 pause the affected source until manual Refresh. HTTP 429 respects Retry-After; network, timeout, and invalid responses use the common safe error states. Other accounts continue independently. No live account comparison has been completed yet, so the undocumented schema and token eligibility remain unverified with a real account.

Optional server environment variables: `MONITOR_CONFIG` points to a config JSON file; `MONITOR_PORT` sets a loopback port (default 8765). No URL or command-line argument accepts secrets.

Run focused tests with `node --test test/core.test.mjs test/zai.test.mjs test/server.test.mjs`.
On a Linux host with the preinstalled global Playwright package, run the browser check with `node test/browser-check.mjs`. It starts and stops its own loopback servers and writes screenshots to `/tmp/monitor-t2-*.png`.
Run Codex protocol and isolation tests with `node --test test/codex.test.mjs`. Run `node test/smoke-codex.mjs` to check the installed app-server using a fresh empty private profile; it expects “login needed” and never opens a login flow or makes model calls.
