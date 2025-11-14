# BSV CAD System - Deployment Guide

> **Version**: 1.0  
> **Last Updated**: 2025-11-14  
> **Status**: Production-Ready Infrastructure

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [CI/CD Setup](#cicd-setup)
6. [Monitoring Setup](#monitoring-setup)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites

### Required Software

- **Docker**: 24.0+ ([Install](https://docs.docker.com/get-docker/))
- **Docker Compose**: 2.20+ (included with Docker Desktop)
- **kubectl**: 1.28+ ([Install](https://kubernetes.io/docs/tasks/tools/))
- **Node.js**: 20 LTS ([Install](https://nodejs.org/))
- **Git**: 2.40+ ([Install](https://git-scm.com/downloads))

### Recommended (Optional)

- **k9s**: Kubernetes CLI UI ([Install](https://k9scli.io/))
- **Helm**: Package manager for Kubernetes ([Install](https://helm.sh/docs/intro/install/))
- **Lens**: Kubernetes IDE ([Install](https://k8slens.dev/))

---

## 💻 Local Development

### 1. Clone Repository

```bash
git clone git@github.com:frogitzamna-wq/cad.git
cd cad
git checkout research
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Build TypeScript

```bash
npm run build
```

### 5. Run Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

### 6. Start Development Server

```bash
npm run dev
# Or with ts-node
npx ts-node src/index.ts
```

---

## 🐳 Docker Deployment

### Quick Start (Docker Compose)

#### 1. Build Images

```bash
docker-compose build
```

#### 2. Start Services

```bash
docker-compose up -d
```

#### 3. Verify Services

```bash
docker-compose ps
```

Expected output:
```
NAME                 STATUS              PORTS
cad-app              Up 30 seconds       0.0.0.0:3000->3000/tcp, 0.0.0.0:9090->9090/tcp
cad-indexer          Up 30 seconds
cad-postgres         Up 30 seconds (healthy)  0.0.0.0:5432->5432/tcp
cad-redis            Up 30 seconds (healthy)  0.0.0.0:6379->6379/tcp
cad-prometheus       Up 30 seconds       0.0.0.0:9091->9090/tcp
cad-grafana          Up 30 seconds       0.0.0.0:3001->3000/tcp
cad-nginx            Up 30 seconds       0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

#### 4. Access Services

- **CAD Application**: http://localhost:3000
- **Prometheus**: http://localhost:9091
- **Grafana**: http://localhost:3001 (admin/changeme)
- **Nginx**: http://localhost

#### 5. View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f cad-app

# Last 100 lines
docker-compose logs --tail=100 cad-indexer
```

#### 6. Stop Services

```bash
docker-compose down

# With volumes (clean slate)
docker-compose down -v
```

### Production Docker Build

```bash
# Build for production
docker build -t cad:latest --target production .

# Run production container
docker run -d \
  --name cad-app \
  -p 3000:3000 \
  -p 9090:9090 \
  -e NODE_ENV=production \
  -e BSV_NETWORK=mainnet \
  -v /path/to/keys:/app/keys:ro \
  cad:latest
```

### Multi-Platform Build

```bash
# Setup buildx
docker buildx create --use

# Build for multiple architectures
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/frogitzamna-wq/cad:latest \
  --push \
  .
```

---

## ☸️ Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.28+)
- kubectl configured
- Namespace created

### 1. Create Namespace

```bash
kubectl create namespace cad-production
kubectl config set-context --current --namespace=cad-production
```

### 2. Create Secrets

```bash
# Create secret from environment variables
kubectl create secret generic cad-secrets \
  --from-literal=postgres.user=caduser \
  --from-literal=postgres.password=$(openssl rand -base64 32) \
  --from-literal=redis.password=$(openssl rand -base64 32) \
  --from-literal=jwt.secret=$(openssl rand -base64 32)

# Create secret from keys directory
kubectl create secret generic cad-keys \
  --from-file=keys/
```

### 3. Deploy Base Resources

```bash
# Apply all base manifests
kubectl apply -f k8s/base/
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods

# Check services
kubectl get services

# Check deployments
kubectl get deployments

# Watch rollout status
kubectl rollout status deployment/cad-app
kubectl rollout status deployment/cad-indexer
```

### 5. Access Application

#### Port Forward (Development)

```bash
kubectl port-forward service/cad-app 3000:80
# Access at http://localhost:3000
```

#### LoadBalancer (Production)

```bash
# Get external IP
kubectl get service cad-app-external

# Access via external IP
curl http://<EXTERNAL-IP>/health
```

### 6. Scale Deployment

```bash
# Scale app
kubectl scale deployment cad-app --replicas=5

# Auto-scaling (HPA)
kubectl autoscale deployment cad-app \
  --min=2 \
  --max=10 \
  --cpu-percent=70
```

### 7. Update Deployment

```bash
# Update image
kubectl set image deployment/cad-app \
  cad-app=ghcr.io/frogitzamna-wq/cad:v1.2.0

# Rollout restart
kubectl rollout restart deployment/cad-app

# Rollback
kubectl rollout undo deployment/cad-app
```

### 8. View Logs

```bash
# Tail logs
kubectl logs -f deployment/cad-app

# Multiple pods
kubectl logs -f -l app=cad,component=application

# Previous pod (if crashed)
kubectl logs --previous deployment/cad-app
```

### Production Overlay (Kustomize)

```yaml
# k8s/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: production

resources:
  - ../../base

replicas:
  - name: cad-app
    count: 3

images:
  - name: ghcr.io/frogitzamna-wq/cad
    newTag: v1.0.0

configMapGenerator:
  - name: cad-config
    behavior: merge
    literals:
      - log.level=warn
```

Deploy with Kustomize:

```bash
kubectl apply -k k8s/overlays/production/
```

---

## 🚀 CI/CD Setup

### GitHub Actions Configuration

#### 1. Enable GitHub Container Registry

```bash
# Enable packages in repository settings
# Settings → Packages → Container registry
```

#### 2. Add Secrets

Go to **Settings → Secrets → Actions** and add:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `KUBECONFIG_STAGING` | Base64-encoded kubeconfig | `cat ~/.kube/config | base64` |
| `KUBECONFIG_PRODUCTION` | Base64-encoded kubeconfig | `cat ~/.kube/config | base64` |
| `SNYK_TOKEN` | Snyk security token | Get from snyk.io |
| `SLACK_WEBHOOK_URL` | Slack webhook URL | Get from Slack settings |

#### 3. Trigger Pipeline

```bash
# Push to research branch → deploy to staging
git push origin research

# Push to master → deploy to production
git push origin master

# Manual trigger via GitHub UI
# Actions tab → CI/CD Pipeline → Run workflow
```

#### 4. Monitor Pipeline

- Go to **Actions** tab in GitHub
- Click on running workflow
- View logs for each job

### Local CI Testing (Act)

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Test workflow locally
act -j lint
act -j build
act -j test-unit
```

---

## 📊 Monitoring Setup

### Prometheus

#### Access Prometheus UI

```bash
# Docker Compose
open http://localhost:9091

# Kubernetes (port-forward)
kubectl port-forward service/prometheus 9090:9090
open http://localhost:9090
```

#### Example Queries

```promql
# Total transactions
sum(cad_transactions_total)

# Transaction rate (per second)
rate(cad_transactions_total[5m])

# Indexer lag
cad_indexer_lag_seconds

# P95 transaction duration
histogram_quantile(0.95, cad_transaction_duration_seconds_bucket)

# Memory usage
container_memory_usage_bytes{pod=~"cad-app.*"}
```

### Grafana

#### Access Grafana

```bash
# Docker Compose
open http://localhost:3001
# Login: admin / changeme

# Kubernetes
kubectl port-forward service/grafana 3000:3000
open http://localhost:3000
```

#### Import Dashboards

1. Click **+ → Import**
2. Upload dashboard JSON from `monitoring/grafana/dashboards/`
3. Select Prometheus datasource

### Alerting

Create alert rules in Prometheus:

```yaml
# monitoring/alerts.yml
groups:
  - name: cad_alerts
    interval: 30s
    rules:
      - alert: HighTransactionLatency
        expr: histogram_quantile(0.95, cad_transaction_duration_seconds_bucket) > 10
        for: 5m
        annotations:
          summary: "High transaction latency"
          description: "P95 latency > 10s for 5 minutes"
      
      - alert: IndexerLagging
        expr: cad_indexer_lag_seconds > 60
        for: 2m
        annotations:
          summary: "Indexer lagging behind blockchain"
          description: "Indexer is {{ $value }}s behind"
```

---

## 🔍 Troubleshooting

### Common Issues

#### 1. Container Won't Start

```bash
# Check logs
docker logs cad-app

# Check health
docker inspect cad-app | grep Health

# Rebuild without cache
docker-compose build --no-cache cad-app
```

#### 2. Database Connection Failed

```bash
# Verify postgres is healthy
docker-compose ps postgres

# Check connection
docker-compose exec postgres psql -U caduser -d cad -c "\conninfo"

# Reset database
docker-compose down -v
docker-compose up -d postgres
```

#### 3. Kubernetes Pod CrashLoopBackOff

```bash
# View pod logs
kubectl logs <pod-name>

# Describe pod
kubectl describe pod <pod-name>

# Check events
kubectl get events --sort-by='.lastTimestamp'

# Debug with ephemeral container
kubectl debug <pod-name> -it --image=busybox
```

#### 4. Image Pull Error

```bash
# Login to registry
docker login ghcr.io -u <username>

# Create pull secret
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=<username> \
  --docker-password=<token>

# Add to serviceAccount
kubectl patch serviceaccount cad-app \
  -p '{"imagePullSecrets": [{"name": "ghcr-secret"}]}'
```

#### 5. Network Issues

```bash
# Test connectivity between pods
kubectl run tmp --rm -i --tty --image=nicolaka/netshoot -- /bin/bash
# Inside pod:
curl cad-app:80/health
nslookup postgres

# Check network policies
kubectl get networkpolicies
```

### Performance Tuning

#### Increase Resources

```yaml
# k8s/base/deployment.yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "1000m"
  limits:
    memory: "4Gi"
    cpu: "4000m"
```

#### Enable Caching

```bash
# Redis cache
docker-compose up -d redis

# Verify connection
docker-compose exec redis redis-cli ping
```

### Backup & Recovery

#### Backup Database

```bash
# Docker Compose
docker-compose exec postgres pg_dump -U caduser cad > backup.sql

# Kubernetes
kubectl exec -it deployment/postgres -- pg_dump -U caduser cad > backup.sql
```

#### Restore Database

```bash
# Docker Compose
docker-compose exec -T postgres psql -U caduser cad < backup.sql

# Kubernetes
kubectl exec -i deployment/postgres -- psql -U caduser cad < backup.sql
```

---

## 📞 Support

### Documentation
- [MAINNET_TESTING_PLAN.md](./docs/MAINNET_TESTING_PLAN.md)
- [DEVELOPMENT_SESSION_SUMMARY.md](./docs/DEVELOPMENT_SESSION_SUMMARY.md)
- [RESEARCH_PROGRESS.md](./RESEARCH_PROGRESS.md)

### Community
- GitHub Issues: https://github.com/frogitzamna-wq/cad/issues
- Discussions: https://github.com/frogitzamna-wq/cad/discussions

### External
- **BSV Blockchain**: support@bsvblockchain.org
- **Docker**: https://docs.docker.com/
- **Kubernetes**: https://kubernetes.io/docs/

---

**Version**: 1.0  
**Maintained by**: CAD Development Team  
**License**: MIT
