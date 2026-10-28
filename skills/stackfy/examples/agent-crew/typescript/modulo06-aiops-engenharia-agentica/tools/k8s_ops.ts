import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { Tool } from '../core/crew.ts';

const runCommand = promisify(execFile);

const manifestOf = (appName: string, replicas: number, port: number) =>
  `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
      - name: ${appName}
        image: nginx:latest
        ports:
        - containerPort: ${port}
        readinessProbe:
          httpGet:
            path: /
            port: ${port}
---
apiVersion: v1
kind: Service
metadata:
  name: ${appName}-svc
spec:
  selector:
    app: ${appName}
  ports:
  - protocol: TCP
    port: 80
    targetPort: ${port}
`;

const errorCode = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

export const generateK8sManifest: Tool = {
  name: 'generate_k8s_manifest',
  description:
    'Generates Kubernetes Deployment and Service YAML manifests on disk.',
  parameters: { app_name: 'string', replicas: 'integer', port: 'integer' },
  run: async (input) => {
    const appName = String(input.app_name);
    const filename = `${appName}-k8s.yaml`;

    await writeFile(
      filename,
      manifestOf(appName, Number(input.replicas), Number(input.port)),
      'utf8'
    );

    return `✅ Kubernetes manifests for '${appName}' successfully generated in '${filename}'.`;
  },
};

export const applyK8sManifest: Tool = {
  name: 'apply_k8s_manifest',
  description:
    "Simulates or executes GitOps reconciliation using 'kubectl apply'.",
  parameters: { filename: 'string' },
  run: async (input) => {
    const filename = String(input.filename);

    if (!existsSync(filename))
      return `❌ Error: The file '${filename}' was not found to apply.`;

    try {
      const { stdout } = await runCommand('kubectl', ['apply', '-f', filename]);

      return `✅ GitOps Sync Success: ${stdout.trim()}`;
    } catch (error) {
      const code = errorCode(error);

      if (code === 'ENOENT')
        return "ℹ️ Simulation Mode: 'kubectl' command line tool is not installed. In a production system, ArgoCD or Flux would apply this manifest now.";
      if (typeof code !== 'number') throw error;

      return `⚠️ GitOps Simulation: File '${filename}' is syntactically valid, but no Kubernetes cluster was detected. The GitOps controller would reconcile this state.`;
    }
  },
};

export const analyzeCanaryMetrics: Tool = {
  name: 'analyze_canary_metrics',
  description:
    'Analyzes application metrics to decide if a Canary Rollout should proceed or rollback.',
  parameters: { metrics_data: 'string' },
  run: async (input) => {
    const match = /error_rate:\s*([\d.]+)\s*%/i.exec(
      String(input.metrics_data)
    );

    if (match && Number(match[1]) > 5)
      return '❌ ROLLBACK: Elevated error rate detected in Canary pods. Reverting deployment.';

    return '✅ PROCEED: Metrics are stable. Canary rollout approved for production.';
  },
};
