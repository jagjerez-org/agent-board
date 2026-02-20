#!/bin/bash

# Agent Board Skill Startup Script
# Builds and starts the Agent Board web application

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting Agent Board..."
echo "Project directory: $PROJECT_DIR"

cd "$PROJECT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the application
echo "Building application..."
npm run build

# Start the application on port 3100 (to avoid conflicts with other services)
echo "Starting Agent Board on http://localhost:3100"
npm start -- -p 3100