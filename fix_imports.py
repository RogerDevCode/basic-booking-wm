import os
import re

for root, _, files in os.walk("tests"):
    for file in files:
        if file.endswith(".py"):
            path = os.path.join(root, file)
            with open(path) as f:
                content = f.read()
            if "json." in content and "import json" not in content:
                new_content = re.sub(r"(from __future__ import annotations)", r"\1\nimport json", content)
                with open(path, "w") as f:
                    f.write(new_content)
