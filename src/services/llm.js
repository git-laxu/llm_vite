
// 前端策略生成就不再走本地模拟，而是请求：
// POST http://127.0.0.1:8001/api/strategy/generate

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001';

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();

  if (text) return text;

  return 'https://api.openai.com/v1';
}

export async function generateStrategy(form, semanticContext, knowledgeItems) {
  const response = await fetch(`${API_BASE}/api/strategy/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      form,
      semantic_context: semanticContext,
      knowledge_items: knowledgeItems || [],
      knowledge_top_k: Number(form.knowledgeTopK || 5),
      llm_config: {
        provider: form.provider || 'openai',
        base_url: normalizeBaseUrl(form.baseUrl),
        api_key: form.apiKey || '',
        model_id: form.modelId || 'gpt-4o-mini',
        temperature: Number(form.temperature ?? 0.7),
        top_p: Number(form.topP ?? 0.9),
        max_tokens: Number(form.maxTokens ?? 1200)
      }
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.detail || data?.message || JSON.stringify(data) || response.statusText;
    throw new Error(`策略生成失败：${detail}`);
  }

  return data;
}