---
name: infrastructure-as-code
description: Infrastructure kept as files an agent writes, scans, checks against policy, and applies, as the AIOps labs of module 6 do with Terraform HCL scanned by Checkov and checked by governance rules, and with Kubernetes manifests generated from a template and applied with kubectl, beside the manifests that run the project itself in a local cluster.
---

# Infrastructure as code

## Concept

Infrastructure as code declares cloud resources and workloads in files instead of creating them by hand, so they can be reviewed, versioned, scanned, and applied repeatably. **Terraform** describes cloud resources in HCL, and Kubernetes describes workloads as YAML manifests, such as a Deployment that keeps replicas of a container running behind readiness probes and a Service that routes traffic to them. A static scanner such as **Checkov** reads those files without deploying anything and reports each failed check with its id, such as CKV_AWS_18 for an S3 bucket without access logging, exiting with a failure when any check fails. Policy as code, which **Open Policy Agent** popularized, adds the organization's own rules, such as an allowed region. Applying reconciles the real state with the files: kubectl apply creates or updates every object a manifest declares, a GitOps controller such as **Argo CD** or **Flux** does the same from a repository, and a dry run validates the change without applying it.

## How the course implements it

The labs of module 6 give their agents ([agent-crew](agent-crew.md)) tools over these files ([tool-calling](tool-calling.md)), all from tools/, and every file is read and written relative to the working directory, which is the project root when a lab runs as python labs/<lab>.py.

- write_file takes a content and a filename, main.tf by default. It removes every code fence marker from the content, three backticks followed by hcl and then any other three backticks, trims the whitespace around it, writes it as UTF-8, and answers ✅ File 'main.tf' saved successfully. with the file's name.
- run_checkov_scan takes a filename, main.tf by default, and answers ❌ Error: File 'main.tf' not found for scanning. when it is missing. Otherwise it runs checkov -f with the file, --quiet, and --compact, and decides in order: a failing exit code with anything on standard error answers ⚠️ Checkov execution error: and standard error on the next line, trimmed, and standard output containing FAILED answers ❌ Security Failures Detected by Checkov: and standard output on the next line, trimmed. Anything else answers ✅ Checkov: No vulnerabilities detected. Infrastructure code is secure. A missing checkov answers ⚠️ Error: 'checkov' command-line tool not found. Run 'pip install checkov' in the terminal., and any other failure ⚠️ Unexpected error running scanner: and the error.
- validate_opa_policies takes a content and stands in for **Open Policy Agent** with three rules, checked in order. Content without us-east-1 in any case answers ❌ OPA REJECTED: Violation of rule 'SOBERANIA_DADOS'. Nexus resources must reside in us-east-1., content with t3.large in any case answers the COST_CONTROL rejection, Large instance sizes require manual finance approval., and content with 0.0.0.0/0 answers the NO_PUBLIC_INGRESS rejection, Open ingress CIDR ranges are strictly forbidden. Anything else answers ✅ OPA PASSED: Infrastructure code complies with Nexus governance policies.
- generate_k8s_manifest takes an app name and integer replicas and port, and writes <app name>-k8s.yaml from a fixed template: a Deployment of that name and label with the replicas, one nginx:latest container exposing the port with a readiness probe on GET / at the port, and, after a --- line, a Service named <app name>-svc that routes port 80 over TCP to the port. It answers ✅ Kubernetes manifests for 'nexus-api' successfully generated in 'nexus-api-k8s.yaml'. with the app and the file.
- apply_k8s_manifest takes a filename and answers ❌ Error: The file 'nexus-api-k8s.yaml' was not found to apply. when it is missing. Otherwise it runs kubectl apply -f with the file against the current context: success answers ✅ GitOps Sync Success: and kubectl's trimmed output, such as deployment.apps/nexus-api created and service/nexus-api-svc created on two lines. A failure answers ⚠️ GitOps Simulation: File '<file>' is syntactically valid, but no Kubernetes cluster was detected. The GitOps controller would reconcile this state., and a missing kubectl ℹ️ Simulation Mode: 'kubectl' command line tool is not installed. In a production system, ArgoCD or Flux would apply this manifest now.
- analyze_canary_metrics takes the metrics as text and finds error_rate:, a number, and %, in any case and with optional spaces. A rate above 5 answers ❌ ROLLBACK: Elevated error rate detected in Canary pods. Reverting deployment., and anything else, a missing rate included, ✅ PROCEED: Metrics are stable. Canary rollout approved for production.

The IaC copilot lab writes main.tf through write_file and audits it with run_checkov_scan and validate_opa_policies. The **Kubernetes** lab generates the nexus-api manifests, applies them, and judges the canary metrics from the task's text. The troubleshooting lab writes the fixed checkout Deployment through write_file as checkout-k8s-fix.yaml. The guardrails lab only prints a simulated kubectl apply --dry-run=client before asking for approval ([agent-observability](agent-observability.md)). The project root keeps the files earlier runs left: main.tf, nexus-api-k8s.yaml, checkout-k8s-fix.yaml, and incident_dashboard.json. requirements.txt pins **Checkov** below 3 and declares the **kubernetes** client, which no file imports. The cases reach every answer of these tools except a missing checkov or kubectl, which would take them off the PATH the transcription runs with, **Checkov**'s execution error, and the scanner's unexpected error.

The project also deploys itself. Its Dockerfile builds the whole project on python:3.12-slim into one image, nexus-bot:v1, whose command runs the final project lab, and k8s/ runs that image in a local **Minikube** cluster beside the services it reaches by name. deploy.yml keeps one replica with CPU and memory requests and limits, and job.yaml runs the image once as a Job restarted only on failure. Both read GROQ_API_KEY from the nexus-secrets Secret, whose value in secret.yml is a base64 placeholder, and set imagePullPolicy to Never, so a pod whose image is missing from the cluster's runtime waits in ErrImageNeverPull, the broken pod the troubleshooting lab's README applies. localstack.yml serves **LocalStack** 3.0 with S3, SQS, and IAM at localstack:4566, connect-test.yaml is a Job that lists its buckets with one boto3 call, and streamlit.yaml runs the same image with streamlit run ui/app.py on 0.0.0.0:8501 behind a LoadBalancer Service, pointing AWS_ENDPOINT_URL at **LocalStack**. ollama.yaml serves **Ollama** at ollama:11434, which no code reaches, since the LLM stays on **Groq** ([chat-model](chat-model.md)). It declares its limits twice, and the API server keeps the second, 1 CPU and 2Gi. These manifests are deployment configuration that no lab needs, so no case covers them.

## What usually goes wrong in other languages

- A transcription deploys with the same manifests when its image keeps the nexus-bot:v1 tag and runs the final project by default, and when streamlit.yaml's command becomes the transcription's own interface listening on 0.0.0.0:8501. imagePullPolicy: Never means loading the image into the cluster's runtime first, through **Minikube**'s docker-env as the slides do, kind load docker-image, or k3d image import. PYTHONPATH and OBJC_DISABLE_INITIALIZE_FORK_SAFETY only matter to **Python**, and PYTHONUNBUFFERED keeps kubectl logs live, which a target that buffers standard output away from a terminal, such as **C** or **C++**, gets by flushing after each line.
- **Checkov** and kubectl are command-line tools, so every transcription runs them as processes with the same arguments and inherits the environment, which carries KUBECONFIG. The cases point KUBECONFIG to a file they write and never to the student's own cluster.
- **Checkov** exits with 1 whenever a check fails, so only an empty standard error lets the failures through. **Checkov** 2.5 on **Python** 3.12 writes SyntaxWarnings to standard error the first time it compiles its own modules, so the first scan after installing it answers a Checkov execution error with them, and every later scan answers the failures.
- The answers trim kubectl's and **Checkov**'s output, and write_file trims the content, as **Python**'s strip does: **Go**'s strings.TrimSpace, **JavaScript**'s trim, and **C#**'s Trim match it.
- validate_opa_policies lowercases the content for the region and the instance size, but not for the CIDR.
- generate_k8s_manifest writes the template byte for byte, two-space indentation and the trailing newline included, and the cases compare the file exactly.
- The canary rule reads a decimal rate and compares it strictly above 5, so 5% proceeds.
- Files go to the working directory, not next to the program, and the cases check main.tf, provider.tf, nexus-api-k8s.yaml, and checkout-k8s-fix.yaml there.

## How close common targets get

| Target                            | Fit               | Library                                                                       |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | subprocess.run with captured output, as the original, and **Checkov** below 3 |
| **JavaScript** and **TypeScript** | Direct equivalent | node:child_process's spawnSync                                                |
| **Go**                            | Direct equivalent | os/exec with separate buffers for standard output and standard error          |
| **Java**                          | Direct equivalent | ProcessBuilder                                                                |
| **C#**                            | Direct equivalent | System.Diagnostics.Process with both streams redirected                       |
| **Rust**                          | Direct equivalent | std::process::Command's output                                                |
| **C++**                           | Substitute        | **Boost.Process** or **reproc**, since popen captures standard output only    |

Every target still needs **Checkov** 2 and kubectl installed, as the original does. The tested **TypeScript** transcription of the **Kubernetes** lab, with the agent-crew examples, runs kubectl through node:child_process's execFile.

## Tolerance

**Checkov**'s report depends on its version. **Checkov** 2.5.20 reports 6 passed and 6 failed checks for the lesson's main.tf, and the cases check the header, the counts, and the failed check ids, ignoring the links to each check's guide. kubectl's answer comes from a fresh **k3s** cluster for every run, so it reports both objects as created.

## Where it appears

- modulo06-aiops-engenharia-agentica (the labs, and the manifests that deploy the project)
