import json
import logging
import time
from typing import List, Dict, Any, Optional
import numpy as np

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .base import LLMProvider
from app.config import settings

logger = logging.getLogger(__name__)


class BedrockProvider(LLMProvider):
    """
    AWS Bedrock LLM Provider for chat and embeddings.
    Seamlessly falls back to Gemini if Bedrock encounters access restrictions,
    throttling, or regional outages.
    """

    def __init__(self, fallback: Optional[LLMProvider] = None):
        self.fallback = fallback
        self.region = settings.BEDROCK_REGION or "us-east-1"
        self.chat_model = settings.BEDROCK_CHAT_MODEL or "us.anthropic.claude-3-5-haiku-20241022-v1:0"
        self.embed_model = settings.BEDROCK_EMBEDDING_MODEL or "amazon.titan-embed-text-v2:0"

        try:
            from botocore.config import Config
            fast_config = Config(retries={"max_attempts": 1}, connect_timeout=3, read_timeout=10)
            self.client = boto3.client("bedrock-runtime", region_name=self.region, config=fast_config)
        except Exception as e:
            logger.warning(f"[BedrockProvider] Failed to initialize Bedrock client: {e}")
            self.client = None

    def chat(self, messages: List[Dict[str, str]], system: str = "") -> str:
        """
        Chat completion using AWS Bedrock Converse API with automatic Gemini fallback.
        """
        if self.client is not None:
            # Build Converse message structure
            converse_messages = []
            for m in messages:
                role = "user" if m.get("role") in ("user", "human") else "assistant"
                content_text = m.get("content", "")
                if content_text:
                    converse_messages.append({
                        "role": role,
                        "content": [{"text": str(content_text)}],
                    })

            system_prompts = [{"text": system}] if system else None

            # Candidate model IDs to try on Bedrock
            candidate_models = [self.chat_model]
            fallbacks = [
                "us.anthropic.claude-3-5-haiku-20241022-v1:0",
                "anthropic.claude-3-haiku-20240307-v1:0",
                "amazon.nova-micro-v1:0",
                "amazon.nova-lite-v1:0",
            ]
            for fb in fallbacks:
                if fb not in candidate_models:
                    candidate_models.append(fb)

            last_bedrock_error = None
            for model_id in candidate_models:
                try:
                    kwargs = {
                        "modelId": model_id,
                        "messages": converse_messages,
                        "inferenceConfig": {
                            "temperature": 0.2,
                            "maxTokens": 2048,
                        },
                    }
                    if system_prompts:
                        kwargs["system"] = system_prompts

                    response = self.client.converse(**kwargs)
                    output_msg = response.get("output", {}).get("message", {})
                    content_parts = output_msg.get("content", [])
                    for part in content_parts:
                        if "text" in part and part["text"]:
                            logger.info(f"[BedrockProvider] Successfully generated response with {model_id}")
                            return part["text"].strip()
                except (ClientError, BotoCoreError, Exception) as err:
                    last_bedrock_error = err
                    logger.warning(
                        f"[BedrockProvider] Model {model_id} failed: {type(err).__name__} ({str(err)[:120]})"
                    )
                    continue

            if last_bedrock_error:
                logger.warning(
                    f"[BedrockProvider] All Bedrock chat attempts failed ({last_bedrock_error}). "
                    f"Engaging Gemini fallback..."
                )
        else:
            logger.warning("[BedrockProvider] Bedrock client is unavailable. Engaging Gemini fallback...")

        # Fallback to Gemini
        if self.fallback:
            return self.fallback.chat(messages=messages, system=system)

        raise RuntimeError("Bedrock chat invocation failed and no fallback provider is available.")

    def embed(self, texts: List[str]) -> List[List[float]]:
        """
        Embed texts using Amazon Titan Embeddings on Bedrock with Gemini fallback.
        """
        if self.client is not None:
            try:
                vectors: List[List[float]] = []
                for text in texts:
                    body = json.dumps({"inputText": text})
                    response = self.client.invoke_model(
                        modelId=self.embed_model,
                        body=body,
                        accept="application/json",
                        contentType="application/json",
                    )
                    data = json.loads(response["body"].read())
                    embedding = data.get("embedding")
                    if not embedding:
                        raise ValueError(f"No embedding returned by Bedrock model {self.embed_model}")
                    vec = np.array(embedding, dtype=np.float32)
                    norm = np.linalg.norm(vec)
                    if norm > 0:
                        vec = vec / norm
                    vectors.append(vec.tolist())
                return vectors
            except Exception as err:
                logger.warning(
                    f"[BedrockProvider] Bedrock embedding failed: {err}. "
                    f"Engaging Gemini embedding fallback..."
                )

        if self.fallback:
            return self.fallback.embed(texts)

        raise RuntimeError("Bedrock embedding failed and no fallback provider is available.")
