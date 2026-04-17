import os
import re

total_files = 0
overloaded_files = []

for root, _, files in os.walk('f'):
    if 'main.ts' in files:
        total_files += 1
        path = os.path.join(root, 'main.ts')
        with open(path, 'r') as f:
            content = f.read()
            
            lines = content.split('\n')
            
            # Look for non-main exports and complex logic
            types_count = len(re.findall(r'^export (?:type|interface|enum) ', content, re.MULTILINE))
            functions_count = len(re.findall(r'^export (?:async )?function (?!main\b)', content, re.MULTILINE))
            classes_count = len(re.findall(r'^export class ', content, re.MULTILINE))
            
            # An overloaded file is one that defines multiple responsibilities or types inside main.ts
            if types_count > 0 or functions_count > 0 or classes_count > 0 or len(lines) > 150:
                overloaded_files.append((path, len(lines), types_count, functions_count, classes_count))

print(f"Total main.ts files: {total_files}")
print(f"Overloaded main.ts files: {len(overloaded_files)}")
print("\nTop overloaded files:")
overloaded_files.sort(key=lambda x: x[1], reverse=True)
for p, l, t, f, c in overloaded_files:
    print(f"{p}: {l} lines, {t} types, {f} funcs, {c} classes")
