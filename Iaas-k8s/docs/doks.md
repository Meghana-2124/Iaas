# DigitalOcean Kubernetes (DOKS) Setup Guide

## Prerequisites
- DigitalOcean account (example values)
- API token: `DO_API_TOKEN=xxxx`
- Pulumi installed
- doctl CLI installed
- Example environment variables:
  - DO_API_TOKEN=xxxx
  - PULUMI_ACCESS_TOKEN=xxxx

## Authentication
```bash
doctl auth init
pulumi login
pulumi config set digitalocean:region nyc1
```

## Configuration Reference
- Example `config/doks.json`:
```json
{
  "clusterName": "doks-demo",
  "vmSize": "s-2vcpu-4gb",
  "nodeCount": 3,
  "network": "default"
}
```

## Deployment Examples
- Creating a new DOKS cluster (mock):
```bash
pulumi up --stack dev
# Scale node pool
pulumi up --stack dev --target nodepool
```

- Multi-environment setup (dev/staging/prod):
```bash
pulumi stack select dev
pulumi up
pulumi stack select staging
pulumi up
pulumi stack select prod
pulumi up
```

## Troubleshooting
- Authentication errors → check DO_API_TOKEN
- Node scaling fails → verify droplet size availability
- Pulumi deployment fails → check region and network
- kubeconfig issues → validate Pulumi config and context

## Update README
- Add DOKS as a supported provider
- Link this documentation in the main README
