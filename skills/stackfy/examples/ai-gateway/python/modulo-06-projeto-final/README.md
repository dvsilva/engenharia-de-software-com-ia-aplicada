# Amplitude Seguros assistant

The final project's assistant in **Python**, the one program of the lesson that the course writes only in **JavaScript**. It classifies a message's domain by keywords, hands out-of-scope and ambiguous texts back without calling a model, sends the rest to the tuned **Gemini** endpoint on **Vertex AI** with urllib and a gcloud token, or with `--local` to the lesson's **MLX-LM** companion as a process, checks the answer's keys and amount, and confirms the fields with the amount in Brazilian currency, formatted without the machine's locale. `chamar_modelo_local.py` is the lesson's companion, unchanged.

## Requirements

- **Python** 3.9 or later
- gcloud, signed in, and `ENDPOINT_MODULO32` with the tuned model's endpoint, for the cloud path
- `mlx-lm` on Apple Silicon, from `requirements.txt`, and the folder placed beside the module's `modulo-04-lora-e-peft`, whose `mlx-adapters` the companion loads, for `--local`

## Running

```bash
python3 amplitude_seguros_assistente.py "<texto do usuário>"
python3 amplitude_seguros_assistente.py --local --skip-tests "<texto do usuário>"
```

The endpoint is called at the address in `GOOGLE_VERTEX_BASE_URL` when it is set.
