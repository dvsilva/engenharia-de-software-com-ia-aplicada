import os

import pytest
from playwright.sync_api import expect

expect.set_options(timeout=4_000)


@pytest.fixture(scope="session")
def base_url() -> str:
    return os.environ.get("BASE_URL", "http://localhost:4200")
