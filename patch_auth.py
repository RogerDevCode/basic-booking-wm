import glob
import re

for model_file in glob.glob("f/web_*/_*_models.py"):
    with open(model_file) as f:
        content = f.read()

    # Replace the ID field in InputSchema with access_token
    if "class InputSchema" in content:
        content = re.sub(
            r"^\s+(admin_user_id|user_id|client_user_id|provider_user_id):\s*str\s*$",
            "    access_token: str",
            content,
            flags=re.MULTILINE,
        )

        with open(model_file, "w") as f:
            f.write(content)

for main_file in glob.glob("f/web_*/main.py"):
    if "web_auth_login" in main_file or "web_admin_users" in main_file:
        continue  # Already patched

    with open(main_file) as f:
        content = f.read()

    # If the file requires the old ID fields
    if "input_data." in content and (
        "admin_user_id" in content
        or "user_id" in content
        or "client_user_id" in content
        or "provider_user_id" in content
    ):
        # Add dependency
        if "dependencies = [" in content and "pyjwt" not in content:
            content = content.replace("dependencies = [", 'dependencies = [\n#   "pyjwt>=2.8.0",')

        # Add import
        if "from ..internal._wmill_adapter import log" in content and "_auth_jwt" not in content:
            content = content.replace(
                "from ..internal._wmill_adapter import log",
                "from ..internal._auth_jwt import verify_access_token\nfrom ..internal._wmill_adapter import log",
            )

        # Add JWT check after validation
        check_block = """    except Exception as e:
        raise RuntimeError(f"Validation error: {e}") from e

    try:
        token_payload = verify_access_token(input_data.access_token)
        # Determine caller ID
        caller_id = token_payload["sub"]
    except Exception as e:
        raise RuntimeError(f"Auth error: {e}") from e
"""
        content = re.sub(
            r'    except Exception as e:\n        raise RuntimeError\(f"Validation error: \{e\}"\) from e',
            check_block,
            content,
            count=1,
        )

        # Replace occurrences of input_data.user_id, input_data.admin_user_id, etc. with caller_id
        content = re.sub(r"input_data\.(admin_user_id|user_id|client_user_id|provider_user_id)", "caller_id", content)

        with open(main_file, "w") as f:
            f.write(content)

print("Patching complete")
