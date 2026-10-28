# Event registration end-to-end tests

The **Cypress** event registration spec of cfp-platform_v1 in **Python**, with **pytest** and **Playwright** driving the frontend in Chromium as a user would.

## Requirements

- **Python** 3.12 or later
- The cfp-platform frontend served with its api, by `npx nx serve frontend` from the workspace

## Setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## Running

```bash
pytest
```

The tests open the frontend at `http://localhost:4200`, or at the address in `BASE_URL`, and the success test needs the api behind the frontend's proxy. A single spec runs with `pytest e2e/test_event_registration.py`.

The AI-driven spec stays out, because `cy.prompt` resolves its steps through **Cypress Cloud** and no case can check it.
