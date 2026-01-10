#!/bin/sh
set -e

# Default values
CONNECTION_STRING=""
TOOLS_CONFIG=""

# Parse environment variables
if [ -n "$POSTGRES_CONNECTION_STRING" ]; then
    CONNECTION_STRING="--connection-string $POSTGRES_CONNECTION_STRING"
fi

if [ -n "$SIERRA_TOOLS_CONFIG" ]; then
    TOOLS_CONFIG="--tools-config $SIERRA_TOOLS_CONFIG"
fi

# Build the command
CMD="node build/index.js"

if [ -n "$CONNECTION_STRING" ]; then
    CMD="$CMD $CONNECTION_STRING"
fi

if [ -n "$TOOLS_CONFIG" ]; then
    CMD="$CMD $TOOLS_CONFIG"
fi

# Execute the command
exec $CMD "$@"
