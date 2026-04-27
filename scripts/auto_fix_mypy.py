import glob
import re


def auto_fix_common_mypy_errors() -> None:
    files = glob.glob("f/**/*.py", recursive=True)
    fixed_count = 0

    for filepath in files:
        try:
            with open(filepath, encoding="utf-8") as f:
                content = f.read()

            original_content = content

            # 1. Fix missing return type annotations (adds -> None: to functions ending with :)
            # Only targets simple functions without return type to avoid breaking complex ones
            content = re.sub(
                r"def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*:$", r"def \1(\2) -> None:", content, flags=re.MULTILINE
            )
            content = re.sub(
                r"async\s+def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*:$",
                r"async def \1(\2) -> None:",
                content,
                flags=re.MULTILINE,
            )

            # 2. Fix generic 'dict' without type arguments in return annotations
            content = re.sub(r"->\s*dict:", r"-> dict[str, Any]:", content)

            # 3. Add 'import os' if os.getenv is used but not imported
            if "os.getenv" in content and "import os" not in content:
                content = "import os\n" + content

            # 4. Ensure typing.Any is imported if we are using it
            if "Any" in content and "from typing import Any" not in content and "import typing" not in content:
                # Add to the top after __future__ if exists
                if "from __future__ import annotations" in content:
                    content = content.replace(
                        "from __future__ import annotations\n",
                        "from __future__ import annotations\nfrom typing import Any\n",
                        1,
                    )
                else:
                    content = "from typing import Any\n" + content

            if content != original_content:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                fixed_count += 1

        except Exception as e:
            print(f"Error processing {filepath}: {e}")

    print(f"Archivos corregidos automáticamente: {fixed_count}")


if __name__ == "__main__":
    auto_fix_common_mypy_errors()
