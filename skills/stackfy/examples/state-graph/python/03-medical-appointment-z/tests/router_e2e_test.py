import json
import unittest

from server import Reply, inject
from services.appointment_service import professionals


def make_a_request(question: str) -> Reply:
    return inject("POST", "/chat", {"question": question})


class MedicalAppointmentSystemE2ETests(unittest.TestCase):
    @unittest.skip("skipped in the original")
    def test_schedule_appointment_success(self) -> None:
        response = make_a_request(
            f"Olá, sou Maria Santos e quero agendar uma consulta com {professionals[0]['name']} para amanhã às 16h para um check-up regular"
        )
        print("Schedule Success Response:", response.body)
        body = json.loads(response.body)

        self.assertEqual(response.status, 200)
        self.assertEqual(body["intent"], "schedule")
        self.assertEqual(body["actionSuccess"], True)

    def test_cancel_appointment_success(self) -> None:
        make_a_request(
            f"Sou Joao da Silva e quero agendar uma consulta com {professionals[1]['name']} para hoje às 14h"
        )
        response = make_a_request(
            f"Cancele minha consulta com {professionals[1]['name']} que tenho hoje às 14h, me chamo Joao da Silva"
        )
        print("Cancel Success Response:", response.body)
        body = json.loads(response.body)

        self.assertEqual(response.status, 200)
        self.assertEqual(body["intent"], "cancel")
        self.assertEqual(body["actionSuccess"], True)


if __name__ == "__main__":
    unittest.main()
