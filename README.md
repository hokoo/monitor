# Resource monitor

Local demonstration of the common monitor screen and polling loop. Every displayed demo amount is fictitious; Codex, Claude, and Z.ai integrations are not included yet.

Requires Node.js 24. Copy `config.example.json` to `config.json`, edit `locale` (`en` or `ru`) and account/source IDs and labels, then run `node server.mjs`. Open `http://127.0.0.1:8765`. The server listens only on loopback. To see the empty state, start without `config.json`. Changes to config, including locale, take effect after restarting the server and refreshing the page. The in-memory cache resets on restart.

Each account and source needs a unique ID within its parent. The only currently registered adapter is `demo`; it supplies fictitious data for either `subscription` or `api`. New accounts of either type need no code change. Authentication references for future adapters may use `env:NAME` or `local:NAME`; they are server-only and must not contain a secret value. Do not put credentials in the config file. Real adapters will be registered explicitly in later tasks.

Optional server environment variables: `MONITOR_CONFIG` points to a config JSON file; `MONITOR_PORT` sets a loopback port (default 8765). No URL or command-line argument accepts secrets.

Run focused tests with `node --test test/core.test.mjs test/server.test.mjs`.
On a Linux host with the preinstalled global Playwright package, run the browser check with `node test/browser-check.mjs`. It starts and stops its own loopback servers and writes screenshots to `/tmp/monitor-t2-*.png`.
