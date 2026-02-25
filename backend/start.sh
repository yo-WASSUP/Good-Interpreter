#!/bin/bash
# Start the Python backend server

cd "$(dirname "$0")"
source venv/bin/activate
python -m app.main
