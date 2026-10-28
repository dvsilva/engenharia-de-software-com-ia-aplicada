import io
import os
import sys
import threading

from server import create_server, inject

SAMPLE_QUESTION = (
    "Estou pensando em criar um video sobre Web AI, "
    "quais titulos você me recomendaria sobre?"
)


def ask_sample_question() -> None:
    try:
        reply = inject("POST", "/chat", {"question": SAMPLE_QUESTION})
    except Exception as error:
        print("Error testing /chat endpoint:", error, file=sys.stderr)
        return

    print("Response from /chat:", reply.status)
    print(reply.body)


if isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(line_buffering=True)

port = int(os.environ.get("PORT", "3000"))
app = create_server(port)

print(f"Server is running on http://0.0.0.0:{port}")

threading.Thread(target=ask_sample_question, daemon=True).start()
app.serve_forever()
