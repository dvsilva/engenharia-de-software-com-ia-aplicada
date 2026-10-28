import pytest
from playwright.sync_api import Page, expect


class TestEventRegistration:
    @pytest.fixture(autouse=True)
    def visit(self, page: Page) -> None:
        page.goto("/event/new")

    def test_should_successfully_register_a_new_event(self, page: Page) -> None:
        page.locator("#nome").fill("Alvaro Neto Conference")
        page.locator("#endereco").fill("Main Street, 456")
        page.locator("#capacidade").fill("200")
        page.locator("#data").fill("2026-06-15")

        page.locator(".submit-btn").click()

        success = page.locator(".success-msg")

        expect(success).to_be_visible()
        expect(success).to_contain_text("Evento cadastrado com sucesso!")

    def test_should_show_error_messages_when_submitting_an_empty_form(
        self, page: Page
    ) -> None:
        page.locator(".submit-btn").click()

        errors = page.locator(".error-text")

        expect(errors).to_have_count(4)
        expect(errors.nth(0)).to_contain_text("O nome é obrigatório.")
        expect(errors.nth(1)).to_contain_text("O endereço é obrigatório.")
        expect(errors.nth(2)).to_contain_text(
            "Informe uma capacidade válida (mínimo 1)."
        )
        expect(errors.nth(3)).to_contain_text("A data é obrigatória.")
