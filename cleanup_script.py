import os
import re

def fix_imports(content):
    pattern = r'(from\s+["\'])(\.\.?/[^"\']+(?<!\.ts)(?<!\.json)(?<!\.js)(?<!\.css)(?<!\.png)(?<!\.jpg)(?<!\.svg)(?<!\.ico))(["\'])'
    def replace_import(match):
        prefix = match.group(1)
        path = match.group(2)
        suffix = match.group(3)
        return f"{prefix}{path}.ts{suffix}"
    return re.sub(pattern, replace_import, content)

def refactor_main(content, filename):
    if not filename.endswith('main.ts'):
        return content
    
    # 1. Add //nobundling if missing
    content = content.strip()
    if not content.startswith('//nobundling'):
        content = '//nobundling\n' + content
    else:
        # Normalize double //nobundling
        content = re.sub(r'^(//nobundling\n)+', '//nobundling\n', content)

    # 2. Refactor main signature
    match = re.search(r'export\s+async\s+function\s+main', content)
    if not match: return content
    
    start_idx = match.start()
    open_paren = content.find('(', start_idx)
    if open_paren == -1: return content
    
    # Match parentheses (simple match, assuming no nested parens in args)
    close_paren = content.find(')', open_paren)
    if close_paren == -1: return content
    
    args_content = content[open_paren+1:close_paren].strip()
    
    # Find the opening brace of the body
    body_open = -1
    depth = 0
    for i in range(close_paren + 1, len(content)):
        char = content[i]
        if char == '<': depth += 1
        elif char == '>': depth -= 1
        elif char == '{':
            if depth == 0:
                body_open = i
                break
    
    if body_open == -1:
        body_open = content.find('{', close_paren)
    
    if body_open == -1: return content
    
    return_type = content[close_paren+1:body_open].strip()
    body_after = content[body_open+1:].strip()
    
    # Fix existing bug: user_metadata?
    body_after = body_after.replace('user_metadata?', 'user_metadata')

    # If already refactored to args: any
    if args_content == 'args: any':
        # Just return with fixed body (nobundling already handled)
        new_signature = f"export async function main(args: any){(' ' + return_type) if return_type else ''} {{"
        return content[:start_idx] + new_signature + "\n" + body_after

    new_body_lines = []
    if args_content:
        if args_content.startswith('{'):
            brace_end = args_content.rfind('}')
            destructured_part = args_content[1:brace_end].strip()
            names = [n.split(':')[0].split('=')[0].strip().rstrip('?') for n in destructured_part.split(',')]
            type_info_part = args_content[brace_end+1:].strip()
            type_info = type_info_part[1:].strip() if type_info_part.startswith(':') else 'any'
            new_body_lines.append(f"  const {{ {', '.join(names)} }} = (args || {{}}) as {type_info};")
        else:
            arg_list = [a.strip() for a in args_content.split(',')]
            if len(arg_list) == 1:
                arg = arg_list[0]
                name = arg.split(':')[0].split('=')[0].strip().rstrip('?')
                if name.lower() in ['args', 'rawinput', 'input', 'payload', 'data', 'params', '_rawinput']:
                    type_info = arg.split(':')[1].split('=')[0].strip() if ':' in arg else 'any'
                    new_body_lines.append(f"  const {name}: {type_info} = args;")
                else:
                    new_body_lines.append(f"  const {{ {name} }} = args || {{}};")
            else:
                names = [a.split(':')[0].split('=')[0].strip().rstrip('?') for a in arg_list]
                new_body_lines.append(f"  const {{ {', '.join(names)} }} = args || {{}};")

    new_signature = f"export async function main(args: any){(' ' + return_type) if return_type else ''} {{"
    return content[:start_idx] + new_signature + "\n" + "\n".join(new_body_lines) + "\n" + body_after

def main():
    base_dir = 'f'
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('.ts'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = fix_imports(content)
                new_content = refactor_main(new_content, file)
                
                if new_content != content:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated {path}")

if __name__ == "__main__":
    main()
