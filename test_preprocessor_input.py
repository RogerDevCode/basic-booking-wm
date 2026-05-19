import json

from pydantic import BaseModel, ConfigDict


class PreprocessorInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    raw_text: str


try:
    data = json.loads('{"raw_text": null}')
    print("Test 1 (null text):")
    PreprocessorInput.model_validate(data)
except Exception as e:
    print(e)

try:
    data = {"raw_text": "/start"}
    print("\nTest 2 (valid text):")
    res = PreprocessorInput.model_validate(data)
    print(res)
except Exception as e:
    print(e)
