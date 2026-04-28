# ========================================================================
# 1. 保存上传的原始文件到 backend/data/uploads/knowledge；
# 2. 解析 PDF / DOCX / JSON / TXT 正文；
# 3. 返回一个标准知识条目给前端。
# ========================================================================

from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data"
UPLOAD_ROOT = DATA_ROOT / "uploads" / "knowledge"


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def safe_filename(filename: str) -> str:
    name = filename or "uploaded_file"
    name = re.sub(r'[\\/:*?"<>|]+', "_", name)
    name = re.sub(r"\s+", "_", name).strip("_")
    return name or "uploaded_file"


def file_md5(file_bytes: bytes) -> str:
    return hashlib.md5(file_bytes).hexdigest()


def save_original_file(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

    safe_name = safe_filename(filename)
    digest = file_md5(file_bytes)

    # 用 md5 + 原始文件名作为稳定保存名。
    # 同一个文件重复上传时，md5 相同，保存路径相同，不会反复生成新文件。
    saved_name = f"{digest[:12]}_{safe_name}"
    saved_path = UPLOAD_ROOT / saved_name

    existed = saved_path.exists()

    if not existed:
        with saved_path.open("wb") as f:
            f.write(file_bytes)

    return {
        "savedName": saved_name,
        "savedPath": str(saved_path),
        "relativePath": str(saved_path.relative_to(PROJECT_ROOT)),
        "md5": digest,
        "size": len(file_bytes),
        "deduplicated": existed,
    }


def extract_pdf_text(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except Exception:
        return ""

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        texts = []
        for page in reader.pages:
            try:
                texts.append(page.extract_text() or "")
            except Exception:
                texts.append("")
        return "\n".join(texts).strip()
    except Exception:
        return ""


def extract_docx_text(file_bytes: bytes) -> str:
    try:
        import docx
    except Exception:
        return ""

    try:
        document = docx.Document(io.BytesIO(file_bytes))
        paragraphs = [paragraph.text for paragraph in document.paragraphs if paragraph.text]
        return "\n".join(paragraphs).strip()
    except Exception:
        return ""


def extract_text_file(file_bytes: bytes) -> str:
    return file_bytes.decode("utf-8", errors="ignore").strip()


def normalize_json_content(text: str) -> str:
    try:
        parsed = json.loads(text)
        return json.dumps(parsed, ensure_ascii=False, indent=2)
    except Exception:
        return text


def extract_file_text(file_bytes: bytes, filename: str, content_type: str | None = None) -> Dict[str, Any]:
    lower = (filename or "").lower()
    parser = "metadata-only"
    text = ""

    if lower.endswith(".pdf"):
        text = extract_pdf_text(file_bytes)
        parser = "pdf-pypdf"

    elif lower.endswith(".docx"):
        text = extract_docx_text(file_bytes)
        parser = "docx-python-docx"

    elif lower.endswith(".doc"):
        text = ""
        parser = "doc-unsupported"

    elif lower.endswith(".json"):
        raw_text = extract_text_file(file_bytes)
        text = normalize_json_content(raw_text)
        parser = "json-text"

    elif lower.endswith(".txt") or lower.endswith(".md"):
        text = extract_text_file(file_bytes)
        parser = "plain-text"

    if not text:
        text = (
            f"文件名：{filename}\n"
            f"文件类型：{content_type or ''}\n"
            f"文件大小：{len(file_bytes)} bytes\n"
            f"解析器：{parser}\n"
            "未抽取到正文。PDF 可能是扫描件，老式 .doc 暂不支持直接解析，建议转换为 .docx 后重新上传。"
        )

    return {
        "text": text,
        "parser": parser,
    }


def build_knowledge_item_from_upload(
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
    domain: str,
    item_type: str,
) -> Dict[str, Any]:
    saved = save_original_file(file_bytes, filename)
    extracted = extract_file_text(file_bytes, filename, content_type)

    original_name = filename or "uploaded_file"
    digest = saved["md5"]

    return {
        "id": digest,
        "title": original_name,
        "domain": domain or "未分类领域",
        "type": item_type or "结构化信息",
        "source": original_name,
        "content": extracted["text"],
        "importKind": get_import_kind(original_name),
        "parser": extracted["parser"],
        "priority": "",
        "createdAt": now_text(),
        "fileMeta": {
            "name": original_name,
            "contentType": content_type or "",
            "size": len(file_bytes),
            "md5": digest,
            "savedName": saved["savedName"],
            "relativePath": saved["relativePath"],
            "deduplicated": saved.get("deduplicated", False),   # --------------------------重复文件不上传
        },
    }


def get_import_kind(filename: str) -> str:
    lower = (filename or "").lower()

    if lower.endswith(".pdf"):
        return "file-pdf"
    if lower.endswith(".doc") or lower.endswith(".docx"):
        return "file-word"
    if lower.endswith(".json"):
        return "file-json"
    if lower.endswith(".txt") or lower.endswith(".md"):
        return "file-text"

    return "file"