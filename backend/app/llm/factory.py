from .base import LLMProvider
from .gemini_provider import GeminiProvider
from .bedrock_provider import BedrockProvider
from app.config import settings


def get_llm_provider() -> LLMProvider:
    provider = settings.LLM_PROVIDER.lower().strip()
    if provider in ("bedrock", "aws"):
        gemini_fallback = None
        if settings.GEMINI_API_KEY:
            try:
                gemini_fallback = GeminiProvider()
            except Exception:
                gemini_fallback = None
        return BedrockProvider(fallback=gemini_fallback)

    if provider == "gemini":
        return GeminiProvider()

    raise ValueError(f"Unknown LLM_PROVIDER: {settings.LLM_PROVIDER}")