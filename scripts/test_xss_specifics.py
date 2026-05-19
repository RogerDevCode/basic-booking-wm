import asyncio

from f.message_preprocessor.main import _preprocess


async def simulate(text: str):
    print(f"\nPAYLOAD: '{text}'")
    prep_res = _preprocess(text)
    scan = prep_res.security_scan
    print(f"CLEANED: '{prep_res.cleaned_text}'")
    print(f"THREAT DETECTED: {scan.threat_detected}")


async def main():
    payloads = [
        "soy programador en javascript",
        "me llego un alert(1) en la pantalla",
        "javascript:alert(1)",
        "<script>alert('hack')</script>",
    ]
    for p in payloads:
        await simulate(p)


if __name__ == "__main__":
    asyncio.run(main())
