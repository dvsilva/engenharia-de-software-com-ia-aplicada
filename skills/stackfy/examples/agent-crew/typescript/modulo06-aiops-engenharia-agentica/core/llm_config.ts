import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const dotEnv = fileURLToPath(new URL('../.env', import.meta.url));

if (existsSync(dotEnv)) process.loadEnvFile(dotEnv);

const apiKey = process.env.GROQ_API_KEY ?? null;

export const nexusLlm = {
  client: new OpenAI({
    apiKey,
    baseURL: process.env.GROQ_API_BASE ?? 'https://api.groq.com/openai/v1',
    defaultHeaders: apiKey === null ? { Authorization: null } : {},
  }),
  model: 'llama-3.1-8b-instant',
  temperature: 0.2,
};
