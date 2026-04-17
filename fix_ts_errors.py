import re
import subprocess

def run_tsc():
    result = subprocess.run(["npx", "tsc", "--strict", "--noEmit", "--project", "tsconfig.strict.json"], capture_output=True, text=True)
    return result.stdout

stdout = run_tsc()

# error TS1484: 'Input' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
# format: file.ts:line:col - error TS1484: 'NAME'
pattern1484 = re.compile(r"^(.*?):(\d+):\d+ - error TS1484: '([^']+)'", re.MULTILINE)

fixes = {}
for match in pattern1484.finditer(stdout):
    filename = match.group(1)
    lineno = int(match.group(2))
    name = match.group(3)
    
    if filename not in fixes:
        fixes[filename] = []
    fixes[filename].append((lineno, name))

for filename, name_list in fixes.items():
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    for lineno, name in name_list:
        idx = lineno - 1
        # The line is something like: import { A, B, C } from './types'
        # we want to replace '\bname\b' with 'type name'
        line = lines[idx]
        new_line = re.sub(rf"\b{name}\b", f"type {name}", line)
        lines[idx] = new_line
        
    with open(filename, 'w') as f:
        f.writelines(lines)

print("Fixed TS1484 errors.")
