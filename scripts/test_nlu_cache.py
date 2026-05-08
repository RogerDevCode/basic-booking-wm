import asyncio
from f.internal._nlu_cache import ensure_nlu_cache, get_nlu_rule, _NLU_CACHE
async def test():
    await ensure_nlu_cache()
    print("msg_generic:", get_nlu_rule("msg_generic", "DEFAULT"))
    print("NLU CACHE:", _NLU_CACHE.get("msg_generic"))
asyncio.run(test())
