# from __future__ import annotations

# import hashlib
# from typing import Any, Dict, List

# from fastapi import FastAPI, File, Form, UploadFile
# from fastapi.middleware.cors import CORSMiddleware
# from pydantic import BaseModel, Field

# from services.knowledge_file_service import build_knowledge_item_from_upload

from __future__ import annotations

import hashlib
import io
import json
from typing import Any, Dict, List, Optional
from typing import Any, Dict, List

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse

from services.embedding_service import create_embeddings, get_vector_dimension
from services.knowledge_file_service import build_knowledge_item_from_upload
from services.vector_store import upsert_chunks_to_chroma, get_collection
from services.llm_service import call_openai_compatible_chat


app = FastAPI(
    title="LLMdecision Knowledge Backend",
    version="0.2.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



class KnowledgeItem(BaseModel):
    id: str
    title: str = ""
    domain: str = ""
    type: str = ""
    source: str = ""
    content: str = ""
    importKind: str = ""
    parser: str = ""
    priority: str | int | float | None = ""
    createdAt: str = ""
    fileMeta: Dict[str, Any] | None = None


class ProcessRequest(BaseModel):
    knowledge_items: List[KnowledgeItem] = Field(default_factory=list)
    chunk_size: int = 1000
    chunk_overlap: int = 100
    embedding_provider: str = "local"
    embedding_model: str = "bge-small-zh-v1.5"
    # embedding_model: str = "text-embedding-3-small"
    vector_store_name: str = "thermal_strategy_kb"
    process_mode: str = "all"

# ====================================================================================================
# StrategyModelConfig：接收 Provider、Base URL、API Key、Model ID 等模型配置
# StrategyGenerateRequest：接收前端传来的策略生成请求
# pick_fallback_knowledge：先用前端传来的知识条目前几条作为知识依据
# build_strategy_messages：组织发送给大模型的 prompt
# normalize_strategy_output：把模型返回内容整理成前端能显示的结构
# ====================================================================================================
class StrategyModelConfig(BaseModel):
    provider: str = "openai"
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    model_id: str = "gpt-4o-mini"
    temperature: float = 0.7
    top_p: float = 0.9
    max_tokens: int = 1200


class StrategyGenerateRequest(BaseModel):
    form: Dict[str, Any] = Field(default_factory=dict)
    semantic_context: str = ""
    knowledge_items: List[KnowledgeItem] = Field(default_factory=list)
    llm_config: StrategyModelConfig = Field(default_factory=StrategyModelConfig)
    knowledge_top_k: int = 5


def pick_fallback_knowledge(knowledge_items: List[KnowledgeItem], top_k: int = 5) -> List[Dict[str, Any]]:
    selected = []

    for item in knowledge_items[:top_k]:
        selected.append({
            "id": item.id,
            "title": item.title,
            "domain": item.domain,
            "type": item.type,
            "source": item.source,
            "content": (item.content or "")[:1200],
        })

    return selected


def build_strategy_messages(
    *,
    form: Dict[str, Any],
    semantic_context: str,
    retrieved_knowledge: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    knowledge_text = "\n\n".join(
        [
            f"【知识 {index + 1}】标题：{item.get('title', '')}\n"
            f"领域：{item.get('domain', '')}\n"
            f"类型：{item.get('type', '')}\n"
            f"来源：{item.get('source', '')}\n"
            f"内容：{item.get('content', '')}"
            for index, item in enumerate(retrieved_knowledge)
        ]
    )

    system_prompt = """
你是建筑热环境调节策略生成助手，任务是根据建筑环境状态、人体热舒适状态、建筑运行约束和知识库内容生成可执行的热环境调节策略。
你的输出必须是严格 JSON，不要输出 Markdown，不要输出解释性前后缀。
JSON 必须包含以下字段：
{
  "task": "任务名称",
  "constraints": "运行约束摘要",
  "knowledge": ["使用到的知识依据1", "使用到的知识依据2"],
  "summary": "策略摘要",
  "actions": ["具体策略1", "具体策略2", "具体策略3"],
  "json": {
    "strategy_type": "策略类型",
    "control_priority": [],
    "device_actions": [],
    "risk_check": [],
    "data_used": {}
  }
}
""".strip()

    user_prompt = f"""
【语义化状态上下文】
{semantic_context}

【完整表单数据 JSON】
{json.dumps(form, ensure_ascii=False, indent=2)}

【检索到的知识库内容】
{knowledge_text if knowledge_text else "暂无可用知识库内容。"}

请基于以上信息生成建筑热环境调节策略。要求：
1. 策略需要同时考虑热舒适、节能、局部优先调节和建筑运行约束；
2. 策略内容要具体到设备或系统动作，例如送风温度、风速、遮阳、辐射表面、自适应表皮、开窗等；
3. 输出必须是合法 JSON；
4. 不要输出 Markdown 代码块。
""".strip()

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def normalize_strategy_output(
    *,
    model_content: str,
    form: Dict[str, Any],
    retrieved_knowledge: List[Dict[str, Any]],
) -> Dict[str, Any]:
    try:
        parsed = json.loads(model_content)

        return {
            "task": parsed.get("task", "建筑热环境调节策略生成"),
            "constraints": parsed.get("constraints", form.get("constraints", "")),
            "knowledge": parsed.get(
                "knowledge",
                [item.get("title", "") for item in retrieved_knowledge if item.get("title")]
            ),
            "summary": parsed.get("summary", ""),
            "actions": parsed.get("actions", []),
            "json": parsed.get("json", parsed),
            "rawModelText": model_content,
        }
    except Exception:
        return {
            "task": "建筑热环境调节策略生成",
            "constraints": form.get("constraints", ""),
            "knowledge": [item.get("title", "") for item in retrieved_knowledge if item.get("title")],
            "summary": model_content[:500],
            "actions": [model_content],
            "json": {
                "strategy_type": "llm_text_response",
                "raw_text": model_content,
                "data_used": form,
            },
            "rawModelText": model_content,
        }

def split_text(text: str, chunk_size: int, chunk_overlap: int) -> List[Dict[str, Any]]:
    clean_text = " ".join((text or "").split())

    if not clean_text:
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")

    if chunk_overlap < 0:
        raise ValueError("chunk_overlap must be greater than or equal to 0")

    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    step = chunk_size - chunk_overlap
    chunks: List[Dict[str, Any]] = []
    start = 0

    while start < len(clean_text):
        end = min(start + chunk_size, len(clean_text))
        content = clean_text[start:end]

        if content.strip():
            chunks.append(
                {
                    "id": f"CHUNK_{len(chunks) + 1:04d}",
                    "start": start,
                    "end": end,
                    "length": len(content),
                    "content": content,
                }
            )

        if end >= len(clean_text):
            break

        start += step

    return chunks


@app.post("/api/knowledge/upload")
async def upload_knowledge_file(
    file: UploadFile = File(...),
    domain: str = Form("未分类领域"),
    item_type: str = Form("结构化信息"),
):
    file_bytes = await file.read()

    item = build_knowledge_item_from_upload(
        file_bytes=file_bytes,
        filename=file.filename or "uploaded_file",
        content_type=file.content_type,
        domain=domain,
        item_type=item_type,
    )

    return item

# 后端调用真实 embedding API，拿到真实向量，并写入 Chroma======================================================================
@app.post("/api/knowledge/process")
async def process_knowledge(payload: ProcessRequest):
    mode = (payload.process_mode or "all").lower().strip()

    if mode not in {"parse", "vector", "all"}:
        mode = "all"

    all_chunks: List[Dict[str, Any]] = []

    for item in payload.knowledge_items:
        process_text = "\n".join(
            part
            for part in [
                item.title,
                item.domain,
                item.type,
                item.source,
                item.content,
            ]
            if part
        )

        chunks = split_text(
            process_text,
            payload.chunk_size,
            payload.chunk_overlap,
        )

        for index, chunk in enumerate(chunks, start=1):
            all_chunks.append(
                {
                    **chunk,
                    "id": f"{item.id}_{chunk['id']}",
                    "knowledgeId": item.id,
                    "knowledgeTitle": item.title,
                    "knowledgeDomain": item.domain,
                    "knowledgeType": item.type,
                    "knowledgeSource": item.source,
                    "chunkIndex": index,
                }
            )

    should_vectorize = mode in {"vector", "all"}
    vector_records: List[Dict[str, Any]] = []
    embedding_dimension = 0
    vector_store_result: Dict[str, Any] | None = None

    if should_vectorize and all_chunks:
        chunk_texts = [chunk["content"] for chunk in all_chunks]

        # embeddings = create_embeddings(
        #     texts=chunk_texts,
        #     model=payload.embedding_model,
        # )
        try:
            embeddings = create_embeddings(
                texts=chunk_texts,
                model=payload.embedding_model,
                provider=payload.embedding_provider,
            )

        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Embedding API 调用失败：{str(error)}"
            )

        if embeddings:
            embedding_dimension = get_vector_dimension(embeddings[0])

        vector_store_result = upsert_chunks_to_chroma(
            collection_name=payload.vector_store_name,
            chunks=all_chunks,
            embeddings=embeddings,
            embedding_model=payload.embedding_model,
        )
        print("[CHROMA] 写入结果：", vector_store_result)

        for index, chunk in enumerate(all_chunks, start=1):
            embedding = embeddings[index - 1]

            vector_records.append(
                {
                    "id": f"VECTOR_{index:04d}",
                    "chunkId": chunk["id"],
                    "knowledgeId": chunk["knowledgeId"],
                    "knowledgeTitle": chunk["knowledgeTitle"],
                    "embeddingModel": payload.embedding_model,
                    "embeddingDimension": len(embedding),
                    "vectorPreview": [round(value, 6) for value in embedding[:8]],
                    "vectorStoreName": payload.vector_store_name,
                    "vectorStoreCollection": vector_store_result["collectionName"] if vector_store_result else "",
                    "vectorStorePersistPath": vector_store_result["persistPath"] if vector_store_result else "",
                }
            )

    return {
        "status": "completed",
        "processMode": mode,
        "chunks": len(all_chunks),
        "vectors": len(vector_records),
        "embeddingDimension": embedding_dimension,
        "chunkSize": payload.chunk_size,
        "chunkOverlap": payload.chunk_overlap,
        "embeddingModel": payload.embedding_model,
        "vectorStoreName": payload.vector_store_name,
        "vectorStoreResult": vector_store_result,
        "parsedChunks": all_chunks,
        "vectorRecords": vector_records,
    }

@app.get("/api/knowledge/vector-store/status")
async def vector_store_status(collection_name: str = "thermal_strategy_kb"):
    collection = get_collection(collection_name)

    return {
        "collectionName": collection_name,
        "count": collection.count(),
    }

@app.get("/api/status")
async def status():
    return {
        "ok": True,
        "service": "knowledge-backend",
        "version": "0.2.0",
    }

# ====================================================================================================
# 前端提交状态信息和模型参数
# → 后端组织 prompt
# → 后端调用真实大语言模型
# → 后端把结果整理成前端可显示结构
# → 返回给前端
# ====================================================================================================
# @app.post("/api/strategy/generate")
# async def generate_strategy(payload: StrategyGenerateRequest):
#     retrieved_knowledge = pick_fallback_knowledge(
#         payload.knowledge_items,
#         payload.knowledge_top_k,
#     )

#     messages = build_strategy_messages(
#         form=payload.form,
#         semantic_context=payload.semantic_context,
#         retrieved_knowledge=retrieved_knowledge,
#     )

#     model_response = await call_openai_compatible_chat(
#         provider=payload.llm_config.provider,
#         base_url=payload.llm_config.base_url,
#         api_key=payload.llm_config.api_key,
#         model_id=payload.llm_config.model_id,
#         messages=messages,
#         temperature=payload.llm_config.temperature,
#         top_p=payload.llm_config.top_p,
#         max_tokens=payload.llm_config.max_tokens,
#     )

#     result = normalize_strategy_output(
#         model_content=model_response["content"],
#         form=payload.form,
#         retrieved_knowledge=retrieved_knowledge,
#     )

#     result["modelInfo"] = {
#         "provider": model_response["provider"],
#         "baseUrl": model_response["base_url"],
#         "modelId": model_response["model_id"],
#     }

#     result["retrievedKnowledge"] = retrieved_knowledge

#     return result
@app.post("/api/strategy/generate")
async def generate_strategy(payload: StrategyGenerateRequest):
    try:
        retrieved_knowledge = pick_fallback_knowledge(
            payload.knowledge_items,
            payload.knowledge_top_k,
        )

        messages = build_strategy_messages(
            form=payload.form,
            semantic_context=payload.semantic_context,
            retrieved_knowledge=retrieved_knowledge,
        )

        model_response = await call_openai_compatible_chat(
            provider=payload.llm_config.provider,
            base_url=payload.llm_config.base_url,
            api_key=payload.llm_config.api_key,
            model_id=payload.llm_config.model_id,
            messages=messages,
            temperature=payload.llm_config.temperature,
            top_p=payload.llm_config.top_p,
            max_tokens=payload.llm_config.max_tokens,
        )

        result = normalize_strategy_output(
            model_content=model_response["content"],
            form=payload.form,
            retrieved_knowledge=retrieved_knowledge,
        )

        result["modelInfo"] = {
            "provider": model_response["provider"],
            "baseUrl": model_response["base_url"],
            "modelId": model_response["model_id"],
        }

        result["retrievedKnowledge"] = retrieved_knowledge

        return JSONResponse(
            content=result,
            media_type="application/json; charset=utf-8"
        )

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except RuntimeError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error)
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"策略生成接口内部错误：{type(error).__name__}: {str(error)}"
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8001,
        reload=True,
    )