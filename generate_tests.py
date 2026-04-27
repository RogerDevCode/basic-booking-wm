import ast
import glob
import os


def generate_test_for_file(filepath: str) -> None:
    # e.g., filepath = "f/booking_create/_create_booking_logic.py"
    parts = filepath.split(os.sep)
    # folder = "booking_create", filename = "_create_booking_logic.py"
    if len(parts) < 3:
        return
    folder = parts[1]
    filename = parts[-1]

    if filename == "__init__.py":
        return

    module_name = filename[:-3]
    test_filename = f"test_{module_name}.py"
    test_dir = os.path.join("tests", "py", folder)
    test_filepath = os.path.join(test_dir, test_filename)

    # check if test file already exists
    # Or if a file like `test_contract.py` or `test_<something>.py` exists that covers this.
    # We will generate it if test_filename doesn't exist.
    if os.path.exists(test_filepath):
        return

    os.makedirs(test_dir, exist_ok=True)

    # Read the file to see if there are any async functions
    try:
        with open(filepath, encoding="utf-8") as f:
            content = f.read()
        tree = ast.parse(content)
        has_async = any(isinstance(node, ast.AsyncFunctionDef) for node in ast.walk(tree))

        # Build the python import path: f.booking_create._create_booking_logic
        import_path = ".".join(parts)[:-3]

        with open(test_filepath, "w", encoding="utf-8") as f:
            f.write("import pytest\n")
            f.write("from unittest.mock import MagicMock, AsyncMock, patch\n")
            f.write(f"import {import_path}\n\n")

            f.write(f"# This is an auto-generated test boilerplate for {import_path}\n")
            if has_async:
                f.write("@pytest.mark.asyncio\n")
                f.write(f"async def test_{module_name}_basic_import() -> None:\n")
            else:
                f.write(f"def test_{module_name}_basic_import() -> None:\n")

            f.write("    # Ensure the module is importable and has basic structure\n")
            f.write(f"    assert {import_path} is not None\n")

            print(f"Generated test file: {test_filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")


if __name__ == "__main__":
    files = glob.glob("f/**/*.py", recursive=True)
    for f in files:
        generate_test_for_file(f)
