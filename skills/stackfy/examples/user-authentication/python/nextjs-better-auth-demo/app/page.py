from html import escape
from typing import Any

from app.layout import root_layout
from lib.auth import auth
from lib.better_auth import Request

SIGN_OUT = '''<script type="module">
      import { authClient } from '/lib/auth-client.js';

      document.querySelector('#sign-out').addEventListener('click', async () => {
        await authClient.signOut();
        window.location.reload();
      });
    </script>'''


def signed_in(user: dict[str, Any]) -> str:
    shown = escape(user['email'] or user['name'])

    return f'''<div class="space-y-4">
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <p class="text-green-800 font-medium">
              Logado como <span class="font-bold">{shown}</span>
            </p>
          </div>
          <button id="sign-out" class="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200">
            Sair
          </button>
        </div>
    {SIGN_OUT}'''


SIGNED_OUT = '''<div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p class="text-gray-800 text-center">Você não está logado</p>
          <a href="/login" class="block mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 text-center">
            Ir para Login
          </a>
        </div>'''


def home(request: Request) -> str:
    session = auth.get_session(request)
    state = signed_in(session['user']) if session else SIGNED_OUT

    return root_layout(
        f'''    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
      <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">
          Hello World
        </h1>
        {state}
      </div>
    </div>'''
    )
