import glob

HEADER = """# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0"
# ]
# ///
"""

modified = 0
for filepath in glob.glob("f/**/main.py", recursive=True):
    with open(filepath) as f:
        content = f.read()

    if not content.startswith("# /// script"):
        with open(filepath, "w") as f:
            f.write(HEADER + content)
        modified += 1
        print(f"Added header to {filepath}")

print(f"Total files modified: {modified}")
