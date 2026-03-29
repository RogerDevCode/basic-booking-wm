#!/bin/bash
# STEP 3: Deploy Scripts to Windmill
set -e
echo "Deploying scripts to Windmill..."
wmill sync push
echo "✅ Scripts deployed!"
