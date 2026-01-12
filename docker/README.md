# Docker Quick Reference

Quick commands for running Sierra DB Query MCP Server with Docker.

## Quick Start

```bash
# Build the image
docker build -t sierra-mcp -f docker/Dockerfile .

# Run in HTTP mode (remote access)
docker run -d \
  -p 7409:7409 \
  -e MCP_TRANSPORT=http \
  -e POSTGRES_CONNECTION_STRING="postgresql://user:pass@host:5432/db" \
  --name sierra-mcp \
  sierra-mcp

# Run in stdio mode (local MCP client)
docker run -i --rm \
  -e POSTGRES_CONNECTION_STRING="postgresql://user:pass@host:5432/db" \
  sierra-mcp
```

## Using Docker Compose

```bash
# Production mode
docker-compose -f docker/docker-compose.yml up -d

# Development mode (includes PostgreSQL + pgAdmin)
docker-compose -f docker/docker-compose.dev.yml up -d

# View logs
docker-compose -f docker/docker-compose.yml logs -f sierra-mcp

# Stop
docker-compose -f docker/docker-compose.yml down
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MCP_TRANSPORT` | Set to `http` for HTTP mode | For remote access |
| `PORT` | HTTP server port (default: 7409) | No |
| `POSTGRES_CONNECTION_STRING` | Default database connection | No* |
| `SIERRA_TOOLS_CONFIG` | Path to tools config JSON | No |

*If not set, connection string must be provided in each tool call.

## Health Check

```bash
curl http://localhost:7409/health
```

## Connecting MCP Client to Docker Container

```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "POSTGRES_CONNECTION_STRING=postgresql://user:pass@host:5432/db",
        "sierra-mcp"
      ]
    }
  }
}
```

## Network Access

When connecting to a database on the host machine from Docker:

```bash
# Linux
docker run -e POSTGRES_CONNECTION_STRING="postgresql://user:pass@host.docker.internal:5432/db" ...

# Or use host network
docker run --network host ...
```
