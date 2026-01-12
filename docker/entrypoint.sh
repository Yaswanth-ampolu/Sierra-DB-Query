#!/bin/sh
set -e

# ============================================
# Sierra DB Query MCP Server - Docker Entrypoint
# ============================================

# Default values
CONNECTION_STRING=""
TOOLS_CONFIG=""
HTTP_MODE=""
PORT="${PORT:-7409}"

# ============================================
# Transport Mode Configuration
# ============================================
# HTTP mode is required for:
# - Smithery hosted deployment
# - Browser-based clients
# - Remote access via URL
# ============================================

if [ "$MCP_TRANSPORT" = "http" ] || [ -n "$HTTP_MODE_ENABLED" ]; then
    HTTP_MODE="--http --port $PORT"
    echo "[Sierra MCP] Starting in HTTP mode on port $PORT"
else
    echo "[Sierra MCP] Starting in stdio mode"
fi

# ============================================
# Connection String Configuration
# ============================================
# Priority order:
# 1. POSTGRES_CONNECTION_STRING environment variable
# 2. Per-request connectionString in tool arguments
# ============================================

if [ -n "$POSTGRES_CONNECTION_STRING" ]; then
    CONNECTION_STRING="--connection-string $POSTGRES_CONNECTION_STRING"
    echo "[Sierra MCP] Using connection string from environment"
else
    echo "[Sierra MCP] No default connection string - must be provided per-request"
fi

# ============================================
# Tools Configuration
# ============================================
# Optional: Limit which tools are available
# ============================================

if [ -n "$SIERRA_TOOLS_CONFIG" ]; then
    TOOLS_CONFIG="--tools-config $SIERRA_TOOLS_CONFIG"
    echo "[Sierra MCP] Using tools config: $SIERRA_TOOLS_CONFIG"
fi

# ============================================
# Build and Execute Command
# ============================================

CMD="node build/index.js"

[ -n "$HTTP_MODE" ] && CMD="$CMD $HTTP_MODE"
[ -n "$CONNECTION_STRING" ] && CMD="$CMD $CONNECTION_STRING"
[ -n "$TOOLS_CONFIG" ] && CMD="$CMD $TOOLS_CONFIG"

echo "[Sierra MCP] Executing: $CMD"
exec $CMD "$@"
