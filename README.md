# Expense Track

A personal expense and net-worth tracker that runs entirely in the browser —
no backend, no server, nothing leaves your machine. Import bank/investment
statement PDFs, and it reconstructs your balances, net worth over time, and
income/expenses, automatically recognizing transfers between your own
accounts so they aren't double-counted as income or spending.

Supports First Direct, HSBC, Monzo, Revolut, Vanguard, and Trading 212
statements out of the box, with a manual column-mapping fallback for any
layout the automatic parser doesn't recognize, and an extensible per-bank
parser architecture for adding more.

## Data & privacy

- All data is stored locally in your browser (IndexedDB). Nothing is ever
  sent to a server.
- Uploaded PDFs are parsed entirely client-side and are never uploaded
  anywhere.
- Use **Dashboard → Export JSON backup** to back up your data or move it to
  another browser/device, and **Import JSON backup** to restore it.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run test     # run the unit test suite
npm run lint     # lint
npm run build    # production build to dist/
```

## Deployment

Pushing to `main` builds and deploys automatically to GitHub Pages via
`.github/workflows/deploy.yml`. One-time setup: in the repo's Settings →
Pages, set **Source** to "GitHub Actions".

## Known limitations

The per-bank PDF parsers (`src/parsers/*`) were built against a best-effort
guess of each bank's typical statement layout, not verified real statements.
If a parser doesn't recognize your statement's columns, the Import page
falls back to a manual column-mapping UI — accuracy of the automatic parsers
will improve as they're tuned against real (redacted) sample statements.

Net worth conversion between currencies uses a manually-entered fixed rate
per account (set on the Accounts page), never a live/fetched exchange rate.
