from __future__ import annotations

from typing import Any, Dict, List
import httpx


def normalize_base_url(base_url: str) -> str:
    value = (base_url or "").strip()
    if not value:
        return "https://api.openai.com/v1"

    return value.rstrip("/")


def build_chat_completions_url(base_url: str) -> str:
    base = normalize_base_url(base_url)

    if base.endswith("/chat/completions"):
        return base

    return f"{base}/chat/completions"


async def call_openai_compatible_chat(
    *,
    provider: str,
    base_url: str,
    api_key: str,
    model_id: str,
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    top_p: float = 0.9,
    max_tokens: int = 1200,
) -> Dict[str, Any]:
    if not api_key:
        raise ValueError("缺少 API Key，请在模型调用区填写 API Key。")

    if not model_id:
        raise ValueError("缺少 Model ID，请在模型调用区填写模型 ID。")

    url = build_chat_completions_url(base_url)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model_id,
        "messages": messages,
        "temperature": float(temperature),
        "top_p": float(top_p),
        "max_tokens": int(max_tokens),
    }

    timeout = httpx.Timeout(120.0, connect=20.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)

    if response.status_code >= 400:
        raise RuntimeError(
            f"模型接口调用失败：HTTP {response.status_code}，返回内容：{response.text[:1000]}"
        )

    data = response.json()

    try:
        content = data["choices"][0]["message"]["content"]
    except Exception:
        raise RuntimeError(f"模型接口返回格式异常：{data}")

    return {
        "provider": provider,
        "base_url": normalize_base_url(base_url),
        "model_id": model_id,
        "raw": data,
        "content": content,
    }