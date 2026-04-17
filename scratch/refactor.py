import os
import glob
import re

print("Finding non-internal main.ts files...")
files = glob.glob("f/**/main.ts", recursive=True)
internal_files = [f for f in files if "f/internal/" not in f]
print(f"Found {len(internal_files)} files to refactor")
for f in internal_files:
    print(f" - {f}")
