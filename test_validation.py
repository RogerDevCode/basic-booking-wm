from pydantic import ValidationError

from f.internal.fsm_router._router_models import RouterInput

try:
    RouterInput(chat_id="123")  # type: ignore[call-arg]
except ValidationError as e:
    print(e)
