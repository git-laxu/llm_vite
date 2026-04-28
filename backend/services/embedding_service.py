# ================================================================
# 1. 读取 backend/.env 里的 OPENAI_API_KEY 和 EMBEDDING_BASE_URL；
# 2. 调用真实 embedding API；
# 3. 返回真实向量数组。
# ================================================================

from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from dotenv import load_dotenv


load_dotenv()


LOCAL_MODEL_MAP = {
    "bge-small-zh-v1.5": "BAAI/bge-small-zh-v1.5",
    "bge-large-zh-v1.5": "BAAI/bge-large-zh-v1.5",
    "m3e-base": "moka-ai/m3e-base",
}


@lru_cache(maxsize=4)
def get_local_embedding_model(model_name: str):
    try:
        from sentence_transformers import SentenceTransformer
    except Exception as error:
        raise RuntimeError(
            "未安装 sentence-transformers。请执行：pip install sentence-transformers torch"
        ) from error

    resolved_model_name = LOCAL_MODEL_MAP.get(model_name, model_name)

    try:
        return SentenceTransformer(resolved_model_name)
    except Exception as error:
        raise RuntimeError(
            f"本地 embedding 模型加载失败：{resolved_model_name}。"
            "请检查网络是否能下载 HuggingFace 模型，或提前把模型下载到本地路径。"
        ) from error


def create_local_embeddings(texts: List[str], model: str) -> List[List[float]]:
    clean_texts = [str(text or "").strip() for text in texts]

    if not clean_texts:
        return []

    if any(not text for text in clean_texts):
        raise ValueError("存在空文本，无法生成 embedding")

    embedder = get_local_embedding_model(model)

    vectors = embedder.encode(
        clean_texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    return vectors.tolist()


def create_openai_embeddings(texts: List[str], model: str) -> List[List[float]]:
    try:
        from openai import OpenAI
    except Exception as error:
        raise RuntimeError("未安装 openai。请执行：pip install openai") from error

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    base_url = os.getenv("EMBEDDING_BASE_URL", "").strip() or None

    if not api_key:
        raise RuntimeError(
            "未配置 OPENAI_API_KEY。使用 OpenAI embedding 时，需要在 backend/.env 中配置真实 API Key。"
        )

    if any(ord(char) > 127 for char in api_key):
        raise RuntimeError(
            "OPENAI_API_KEY 中包含中文或非ASCII字符。请检查 backend/.env。"
        )

    client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)

    response = client.embeddings.create(
        model=model,
        input=texts,
    )

    return [item.embedding for item in response.data]


def create_embeddings(
    texts: List[str],
    model: str,
    provider: str = "local",
) -> List[List[float]]:
    provider_value = str(provider or "local").lower().strip()
    model_value = str(model or "bge-small-zh-v1.5").strip()

    if provider_value == "openai":
        return create_openai_embeddings(texts, model_value)

    return create_local_embeddings(texts, model_value)


def get_vector_dimension(vector: List[float]) -> int:
    return len(vector or [])