#!/bin/sh
set -e

# Default values
CONNECTION_STRING=""
TOOLS_CONFIG=""
HTTP_MODE=""
PORT="${PORT:-7409}"

# Check for HTTP transport mode (required for Smithery hosted deployment)
if [ "$MCP_TRANSPORT" = "http" ] || [ -n "$HTTP_MODE_ENABLED" ]; then
    HTTP_MODE="--http --port $PORT"
fi

# Parse environment variables
if [ -n "$POSTGRES_CONNECTION_STRING" ]; then
    CONNECTION_STRING="--connection-string $POSTGRES_CONNECTION_STRING"
fi

if [ -n "$SIERRA_TOOLS_CONFIG" ]; then
    TOOLS_CONFIG="--tools-config $SIERRA_TOOLS_CONFIG"
fi

# Build the command
CMD="node build/index.js"

if [ -n "$HTTP_MODE" ]; then
    CMD="$CMD $HTTP_MODE"
fi

if [ -n "$CONNECTION_STRING" ]; then
    CMD="$CMD $CONNECTION_STRING"
fi

if [ -n "$TOOLS_CONFIG" ]; then
    CMD="$CMD $TOOLS_CONFIG"
fi

# Execute the command
exec $CMD "$@"
