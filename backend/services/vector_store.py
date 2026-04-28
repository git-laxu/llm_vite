# ================================================================
# 1. 创建 Chroma 持久化目录；
# 2. 创建或获取向量集合 collection；
# 3. 把知识切片、真实 embedding、metadata 一起写入 Chroma；
# 4. 后续策略生成阶段可以用 query_chroma() 做知识检索。
# ================================================================


from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List

import chromadb


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data"
CHROMA_ROOT = DATA_ROOT / "vector_store" / "chroma"


def safe_collection_name(name: str) -> str:
    value = str(name or "thermal_strategy_kb").strip().lower()
    value = re.sub(r"[^a-zA-Z0-9_-]+", "_", value)
    value = value.strip("_")

    if len(value) < 3:
        value = "thermal_strategy_kb"

    return value[:63]


def get_chroma_client():
    CHROMA_ROOT.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(CHROMA_ROOT))


def get_collection(collection_name: str):
    client = get_chroma_client()
    safe_name = safe_collection_name(collection_name)

    return client.get_or_create_collection(
        name=safe_name,
        metadata={
            "description": "Knowledge vector store for building environment regulation strategy generation"
        }
    )


def normalize_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}

    for key, value in metadata.items():
        if value is None:
            normalized[key] = ""
        elif isinstance(value, (str, int, float, bool)):
            normalized[key] = value
        else:
            normalized[key] = str(value)

    return normalized


def upsert_chunks_to_chroma(
    collection_name: str,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    embedding_model: str,
) -> Dict[str, Any]:
    if not chunks:
        return {
            "collectionName": safe_collection_name(collection_name),
            "persistPath": str(CHROMA_ROOT),
            "upserted": 0,
        }

    if len(chunks) != len(embeddings):
        raise ValueError("chunks 数量与 embeddings 数量不一致，无法写入 Chroma")

    collection = get_collection(collection_name)

    ids: List[str] = []
    documents: List[str] = []
    metadatas: List[Dict[str, Any]] = []

    for chunk in chunks:
        chunk_id = str(chunk["id"])

        ids.append(chunk_id)
        documents.append(chunk.get("content", ""))

        metadatas.append(
            normalize_metadata(
                {
                    "chunkId": chunk_id,
                    "knowledgeId": chunk.get("knowledgeId", ""),
                    "knowledgeTitle": chunk.get("knowledgeTitle", ""),
                    "knowledgeDomain": chunk.get("knowledgeDomain", ""),
                    "knowledgeType": chunk.get("knowledgeType", ""),
                    "knowledgeSource": chunk.get("knowledgeSource", ""),
                    "chunkIndex": chunk.get("chunkIndex", 0),
                    "start": chunk.get("start", 0),
                    "end": chunk.get("end", 0),
                    "length": chunk.get("length", 0),
                    "embeddingModel": embedding_model,
                }
            )
        )

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embeddings,
    )

    return {
        "collectionName": safe_collection_name(collection_name),
        "persistPath": str(CHROMA_ROOT),
        "upserted": len(ids),
    }


def query_chroma(
    collection_name: str,
    query_embedding: List[float],
    top_k: int = 5,
) -> Dict[str, Any]:
    collection = get_collection(collection_name)

    return collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )