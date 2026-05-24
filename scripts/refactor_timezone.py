import os
import re


def process_file(filepath):
    with open(filepath, encoding="utf-8") as f:
        content = f.read()

    if "DEFAULT_TIMEZONE" not in content and "DEFAULT_TIMEZONE" not in content:
        return

    # Replace the strings
    new_content = content.replace("DEFAULT_TIMEZONE", "DEFAULT_TIMEZONE")
    new_content = new_content.replace("DEFAULT_TIMEZONE", "DEFAULT_TIMEZONE")

    # Add import if needed
    if "DEFAULT_TIMEZONE" in new_content and "DEFAULT_TIMEZONE" not in content:
        if "from f.internal._config import" in new_content:
            new_content = re.sub(r"(from f\.internal\._config import .*?)", r"\1, DEFAULT_TIMEZONE", new_content)
        else:
            # find the last from __future__ import or similar early imports
            match = re.search(r"^(from __future__ import annotations.*?)$", new_content, re.MULTILINE | re.DOTALL)
            import_stmt = "\nfrom f.internal._config import DEFAULT_TIMEZONE\n"
            if match:
                new_content = new_content[: match.end()] + "\n" + import_stmt + new_content[match.end() :]
            else:
                new_content = import_stmt + new_content

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)


for root, _, files in os.walk("."):
    if ".venv" in root or ".git" in root or "__pycache__" in root:
        continue
    for file in files:
        if file.endswith(".py"):
            process_file(os.path.join(root, file))

print("Refactor complete. Running ruff check --fix and ruff format...")
