from datetime import UTC, datetime, timedelta
from typing import TypedDict

from dates import parse_date, to_iso_string


class Professional(TypedDict):
    id: int
    name: str
    specialty: str


class Appointment(TypedDict):
    date: str
    patientName: str
    reason: str
    professionalId: float


class AppointmentError(Exception):
    pass


today = datetime.now(UTC)
today_at_eleven_am = today.replace(hour=11, minute=0, second=0, microsecond=0)
tomorrow = (datetime.now().astimezone() + timedelta(days=1)).astimezone(UTC)
tomorrow_at_two_pm = tomorrow.replace(hour=14, minute=0, second=0, microsecond=0)

professionals: list[Professional] = [
    {"id": 1, "name": "Dr. Alicio da Silva", "specialty": "Cardiologia"},
    {"id": 2, "name": "Dra. Ana Pereira", "specialty": "Dermatologia"},
    {"id": 3, "name": "Dra. Carol Gomes", "specialty": "Neurologia"},
]

appointments: list[Appointment] = [
    {
        "date": to_iso_string(today_at_eleven_am),
        "patientName": "Joao da Silva",
        "reason": "check-up regular",
        "professionalId": professionals[0]["id"],
    },
    {
        "date": to_iso_string(tomorrow_at_two_pm),
        "patientName": "Luana Costa",
        "reason": "Erupção cutânea",
        "professionalId": professionals[1]["id"],
    },
]


class AppointmentService:
    def get_appointment_for_professional(
        self, professional_id: float, date: datetime, patient_name: str | None = None
    ) -> Appointment | None:
        return next(
            (
                appointment
                for appointment in appointments
                if appointment["professionalId"] == professional_id
                and parse_date(appointment["date"]) == date
                and (not patient_name or appointment["patientName"] == patient_name)
            ),
            None,
        )

    def check_availability(self, professional_id: float, date: datetime) -> bool:
        return self.get_appointment_for_professional(professional_id, date) is None

    def book_appointment(
        self, professional_id: float, date: datetime, patient_name: str, reason: str
    ) -> Appointment:
        if not self.check_availability(professional_id, date):
            raise AppointmentError("Horário indisponível para este profissional")

        new_appointment: Appointment = {
            "date": to_iso_string(date),
            "patientName": patient_name,
            "reason": reason,
            "professionalId": professional_id,
        }

        appointments.append(new_appointment)
        return new_appointment

    def cancel_appointment(
        self, professional_id: float, patient_name: str, date: datetime
    ) -> None:
        booked = self.get_appointment_for_professional(
            professional_id, date, patient_name
        )
        if booked is None:
            raise AppointmentError("Agendamento não encontrado para cancelamento")

        appointments.remove(booked)
