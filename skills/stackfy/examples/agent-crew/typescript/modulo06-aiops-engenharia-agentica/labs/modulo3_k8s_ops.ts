import { getArchitect, getSreAgent } from '../core/agents.ts';
import { kickoff, type Task } from '../core/crew.ts';
import {
  analyzeCanaryMetrics,
  applyK8sManifest,
  generateK8sManifest,
} from '../tools/k8s_ops.ts';

const architect = getArchitect([generateK8sManifest]);
const sre = getSreAgent([applyK8sManifest, analyzeCanaryMetrics]);

const taskDesign: Task = {
  description:
    "Desenhe o manifesto K8s para o app 'nexus-api' com 2 réplicas na porta 80. Use a imagem 'nginx:latest' e inclua readinessProbe.",
  expectedOutput:
    'Arquivo YAML criado no disco com sintaxe Kubernetes V1 estrita.',
  agent: architect,
};

const taskSync: Task = {
  description:
    "Realize a reconciliação (Sync) do manifesto 'nexus-api-k8s.yaml' no cluster usando o apply_k8s_manifest.",
  expectedOutput:
    'Confirmação de que o estado desejado foi enviado ao cluster.',
  agent: sre,
};

const taskMonitor: Task = {
  description:
    "Após o deploy, analise estas métricas: 'error_rate: 1%, latency: 80ms'. Decida o sucesso do rollout.",
  expectedOutput: 'Decisão final sobre o estado do deploy (Healthy/Unhealthy).',
  agent: sre,
};

console.log('\n🚀 INICIANDO MÓDULO 3: K8S AI-OPS & GITOPS FLOW\n');

await kickoff([taskDesign, taskSync, taskMonitor]);
