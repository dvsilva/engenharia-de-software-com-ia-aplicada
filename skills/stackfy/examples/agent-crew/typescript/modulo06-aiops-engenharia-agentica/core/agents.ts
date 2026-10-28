import type { Agent, Tool } from './crew.ts';

export const getArchitect = (tools: Tool[] = []): Agent => ({
  role: 'Arquiteto de Cloud Nexus',
  goal: 'Projetar infraestrutura seguindo normas e gerando código HCL.',
  backstory: 'Especialista em AWS/Terraform com foco em governança.',
  tools,
});

export const getSreAgent = (tools: Tool[] = []): Agent => ({
  role: 'Engenheiro de SRE (K8s Specialist)',
  goal: 'Gerenciar workloads Kubernetes e garantir rollouts seguros.',
  backstory:
    'Especialista em orquestração, GitOps e análise de métricas de tráfego.',
  tools,
});
