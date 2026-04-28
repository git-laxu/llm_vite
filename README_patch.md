# 本次补丁说明

## 覆盖文件

- `src/pages/KnowledgePage.jsx`：完整替换
- `src/styles/pages/knowledge.css`：把 `knowledge.css.append.css` 里的内容追加到现有文件末尾

## 可选后端

`backend/main.py` 提供：
- `POST /api/knowledge/upload`：PDF / DOCX / TXT / JSON 文件解析入口
- `POST /api/knowledge/process`：真实按 chunk_size 和 chunk_overlap 切片，并生成向量记录占位数据

安装后端依赖：

```bash
pip install fastapi uvicorn python-multipart pypdf python-docx
```

启动：

```bash
cd backend
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

注意：当前 `KnowledgePage.jsx` 仍采用前端本地切片逻辑。真实嵌入向量需要在后端接 OpenAI embeddings 或本地 embedding 模型。
