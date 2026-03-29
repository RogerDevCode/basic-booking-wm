#!/bin/bash
# STEP 2: Push Resources to Windmill
set -e
echo "Pushing resources to Windmill..."
cd resources
for f in *.json; do
  echo "  Pushing $f..."
  wmill resource push --file "$f"
done
echo "✅ Resources pushed!"
