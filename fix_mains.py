import os
import re

modules = [
    "auth_provider", "availability_check", "booking_cancel", "booking_create",
    "booking_orchestrator", "booking_reschedule", "booking_search", "booking_wizard",
    "circuit_breaker", "conversation_logger", "distributed_lock", "dlq_processor",
    "gcal_reconcile", "gcal_sync", "gmail_send", "health_check", "nlu",
    "noshow_trigger", "patient_register", "provider_agenda", "provider_manage",
    "rag_query", "reminder_config", "reminder_cron", "telegram_auto_register",
    "telegram_callback", "telegram_gateway", "telegram_menu", "telegram_send",
    "web_admin_dashboard"
]

def fix_main(file_path):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    with open(file_path, "r") as f:
        content = f.read()

    # Find the async main function name
    # Pattern: async def ([a-zA-Z0-9_]+)\(args: dict\[str, object\]\) -> Result\[(.+)\]:
    match_async = re.search(r"async def ([a-zA-Z0-9_]+)\(args: dict\[str, object\]\) -> Result\[(.+)\]:", content)
    if not match_async:
        # Try without explicit Result return type in case it's different
        match_async = re.search(r"async def ([a-zA-Z0-9_]+)\(args: dict\[str, object\]\)", content)
        if not match_async:
            print(f"Could not find async main in {file_path}")
            return
        async_name = match_async.group(1)
        return_type = "Any"
    else:
        async_name = match_async.group(1)
        return_type = f"Result[{match_async.group(2)}]"

    # Pattern for the sync main function
    sync_main_pattern = re.compile(r"def main\(args: dict\[str, object\]\) -> (?:.+) | None:\n    import traceback\n    try:\n        err, result = asyncio\.run\(([a-zA-Z0-9_]+)\(args\)\)\n        if err:\n            raise err\n        return result\n    except Exception as e:[\s\S]+?raise RuntimeError\(f\"Execution failed: \{e\}\"\) from e", re.MULTILINE)
    
    # Simpler pattern for sync main to be more robust
    sync_main_pattern_simple = re.compile(r"def main\(args: dict\[str, object\]\)[^:]*:\n    import traceback\n    try:\n        err, result = asyncio\.run\(([a-zA-Z0-9_]+)\(args\)\)[\s\S]+?raise RuntimeError\(f\"Execution failed: \{e\}\"\)", re.MULTILINE)

    new_main = f"async def main(args: dict[str, object]) -> {return_type}:\n    \"\"\"Windmill entrypoint.\"\"\"\n    return await {async_name}(args)"

    if sync_main_pattern_simple.search(content):
        new_content = sync_main_pattern_simple.sub(new_main, content)
        with open(file_path, "w") as f:
            f.write(new_content)
        print(f"Fixed {file_path}")
    else:
        print(f"Could not find sync main pattern in {file_path}")

for mod in modules:
    fix_main(f"f/{mod}/main.py")
