import io
import os
import sys

from server import create_server

if isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(line_buffering=True)

port = int(os.environ.get("PORT", "3000"))
app = create_server(port)

print(f"Server is running on http://0.0.0.0:{port}")
app.serve_forever()
