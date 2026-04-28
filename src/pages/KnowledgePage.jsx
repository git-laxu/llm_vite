// ==========================================================
// 决定页面里有哪些面板、面板顺序、面板内部有哪些组件。
// ==========================================================

import { useMemo, useRef, useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import Panel from '../components/Panel.jsx';
import Modal from '../components/Modal.jsx';
import { Field, SelectInput, TextArea, TextInput, NumberInput } from '../components/Field.jsx';
// import { downloadJson } from '../services/export.js';
import { downloadJson, downloadKnowledgeZip } from '../services/export.js';

const API_BASE = 'http://127.0.0.1:8001';

function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

const CREATE_DOMAIN_VALUE = '__CREATE_DOMAIN__';

const jsonPlaceholder = `请输入有效的JSON格式的知识数据，例如：
{
   "knowledge":[
      {
         "id": "KO01",
         "category":"热环境调节",
         "content":"当室内温度高于28°C时，应优先调节空调温度设定值",
         "priority": 1
       }
   ]
}`;

const fileAcceptMap = {
  pdf: '.pdf,application/pdf',
  word: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jsonfile: '.json,application/json'
};

const fileLabelMap = {
  pdf: 'PDF',
  word: 'Word',
  jsonfile: 'JSON'
};

function normalizeJsonKnowledge(parsed, fallbackDomain, fallbackType) {
  const sourceArray = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.knowledge)
      ? parsed.knowledge
      : Array.isArray(parsed.items)
        ? parsed.items
        : [parsed];

  return sourceArray.map((item, index) => ({
    id: item.id || crypto.randomUUID(),
    title: item.title || item.name || item.category || `JSON知识条目 ${index + 1}`,
    domain: item.domain || item.category || fallbackDomain || '未分类领域',
    type: item.type || item.itemType || fallbackType || '结构化信息',
    source: item.source || '手动JSON',
    content: item.content || item.text || item.description || JSON.stringify(item, null, 2),
    priority: item.priority ?? '',
    createdAt: nowText()
  }));
}

function getEmbeddingDimension(modelName) {
  const model = String(modelName || '').toLowerCase();

  if (model.includes('3-large')) return 3072;
  if (model.includes('3-small')) return 1536;
  if (model.includes('ada')) return 1536;
  if (model.includes('bge')) return 1024;
  if (model.includes('m3e')) return 768;

  return 1536;
}

// 建议删除该函数
function getKnowledgeProcessText(item) {
  const parts = [
    item.title,
    item.domain,
    item.type,
    item.source,
    item.content
  ];

  if (item.fileMeta) {
    parts.push(JSON.stringify(item.fileMeta));
  }

  if (item.priority !== undefined && item.priority !== '') {
    parts.push(`priority:${item.priority}`);
  }

  return parts.filter(Boolean).join('\n');
}

// 建议删除该函数
function splitTextIntoChunks(text, chunkSize, chunkOverlap) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleanText) return [];

  const size = Number(chunkSize);
  const overlap = Number(chunkOverlap);

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('文本切片长度必须大于0');
  }

  if (!Number.isFinite(overlap) || overlap < 0) {
    throw new Error('切片重叠不能小于0');
  }

  if (overlap >= size) {
    throw new Error('切片重叠必须小于文本切片长度');
  }

  const chunks = [];
  const step = size - overlap;

  for (let start = 0; start < cleanText.length; start += step) {
    const end = Math.min(start + size, cleanText.length);
    const content = cleanText.slice(start, end);

    if (content.trim()) {
      chunks.push({
        id: `CHUNK_${String(chunks.length + 1).padStart(4, '0')}`,
        start,
        end,
        length: content.length,
        content
      });
    }

    if (end >= cleanText.length) break;
  }

  return chunks;
}

// 建议删除该函数
function buildChunksFromKnowledge(knowledgeItems, chunkSize, chunkOverlap) {
  const allChunks = [];

  knowledgeItems.forEach(item => {
    const processText = getKnowledgeProcessText(item);
    const chunks = splitTextIntoChunks(processText, chunkSize, chunkOverlap);

    chunks.forEach((chunk, index) => {
      allChunks.push({
        ...chunk,
        id: `${item.id || 'ITEM'}_${chunk.id}`,
        knowledgeId: item.id,
        knowledgeTitle: item.title,
        knowledgeDomain: item.domain,
        knowledgeType: item.type,
        chunkIndex: index + 1
      });
    });
  });

  return allChunks;
}

// 建议删除该函数
function vectorizeChunks(chunks, embeddingModel) {
  const dimension = getEmbeddingDimension(embeddingModel);

  return chunks.map((chunk, index) => ({
    id: `VECTOR_${String(index + 1).padStart(4, '0')}`,
    chunkId: chunk.id,
    knowledgeId: chunk.knowledgeId,
    embeddingModel,
    embeddingDimension: dimension,
    vectorPreview: `[${dimension}维向量占位]`
  }));
}

export default function KnowledgePage({
  state,
  updateState,
  notify,
  activeTab: controlledActiveTab,
  onTabChange
}) {
  const [internalActiveTab, setInternalActiveTab] = useState('knowledge');
  const activeTab = controlledActiveTab || internalActiveTab;

  function switchTab(tabId) {
    if (onTabChange) {
      onTabChange(tabId);
    } else {
      setInternalActiveTab(tabId);
    }
  }

  const [importMode, setImportMode] = useState('json');

  const knowledgeDomains = state.knowledgeDomains || ['热环境调节', '光环境调节', '节能运行', '人体热舒适'];
  const knowledgeTypes = state.knowledgeTypes || state.knowledgeCategories || ['论文', '标准', '结构化信息', '其它'];

  const [knowledgeDomain, setKnowledgeDomain] = useState(knowledgeDomains[0] || '');
  const [knowledgeType, setKnowledgeType] = useState(knowledgeTypes[0] || '论文');

  const [domainModalOpen, setDomainModalOpen] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');

  const [jsonText, setJsonText] = useState('');
  const [jsonValidation, setJsonValidation] = useState({ status: 'idle', message: '' });

  const [plainTitle, setPlainTitle] = useState('');
  const [plainText, setPlainText] = useState('');

  const [chunkSize, setChunkSize] = useState(state.processing?.chunkSize || 800);
  const [chunkOverlap, setChunkOverlap] = useState(state.processing?.chunkOverlap || 120);
  // const [embeddingModel, setEmbeddingModel] = useState(state.processing?.embeddingModel || 'text-embedding-3-small');
  const [embeddingModel, setEmbeddingModel] = useState(state.processing?.embeddingModel || 'bge-small-zh-v1.5');
  const [vectorStoreName, setVectorStoreName] = useState(state.processing?.vectorStoreName || 'thermal_strategy_kb');

  const [sampleMode, setSampleMode] = useState('direct');
  const [sampleScene, setSampleScene] = useState('');
  const [sampleResponse, setSampleResponse] = useState('');
  const [templateScene, setTemplateScene] = useState('');

  const fileInputRef = useRef(null);
  const rawFileMapRef = useRef(new Map());
  const dragCounterRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const knowledgeCountByDomain = useMemo(() => {
    return knowledgeDomains.map(domain => ({
      domain,
      count: state.knowledgeItems.filter(item => item.domain === domain || item.type === domain).length
    }));
  }, [knowledgeDomains, state.knowledgeItems]);

  function handleDomainSelect(value) {
    if (value === CREATE_DOMAIN_VALUE) {
      setNewDomainName('');
      setDomainModalOpen(true);
      return;
    }

    setKnowledgeDomain(value);
  }

  function addKnowledgeDomain() {
    const value = newDomainName.trim();

    if (!value) {
      notify('请填写新的知识领域名称', 'error');
      return;
    }

    if (knowledgeDomains.includes(value)) {
      notify('该知识领域已经存在', 'error');
      return;
    }

    updateState(prev => ({
      ...prev,
      knowledgeDomains: [...(prev.knowledgeDomains || knowledgeDomains), value]
    }));

    setKnowledgeDomain(value);
    setNewDomainName('');
    setDomainModalOpen(false);
    notify('新的知识领域已添加');
  }

  function deleteKnowledgeDomain(domain) {
    const relatedCount = state.knowledgeItems.filter(item => item.domain === domain || item.type === domain).length;
    const confirmed = window.confirm(
      relatedCount > 0
        ? `确定删除“${domain}”领域及其内部 ${relatedCount} 条知识吗？`
        : `确定删除“${domain}”领域吗？`
    );

    if (!confirmed) return;

    const nextDomains = knowledgeDomains.filter(item => item !== domain);
    const nextSelectedDomain = knowledgeDomain === domain ? (nextDomains[0] || '') : knowledgeDomain;

    updateState(prev => ({
      ...prev,
      knowledgeDomains: nextDomains,
      knowledgeItems: prev.knowledgeItems.filter(item => item.domain !== domain && item.type !== domain),
      processing: {
        ...prev.processing,
        status: 'idle',
        chunks: 0,
        vectors: 0,
        parsedChunks: [],
        vectorRecords: [],
        logs: [
          `[${nowText()}] 删除知识领域：${domain}，并清空该领域相关切片与向量记录`,
          ...(prev.processing?.logs || [])
        ].slice(0, 20)
      }
    }));

    setKnowledgeDomain(nextSelectedDomain);
    notify(`知识领域“${domain}”已删除`);
  }

  function validateJsonText(showSuccessToast = true) {
    if (!jsonText.trim()) {
      const result = { status: 'error', message: 'JSON内容不能为空' };
      setJsonValidation(result);
      notify(result.message, 'error');
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText);
      const normalized = normalizeJsonKnowledge(parsed, knowledgeDomain, knowledgeType);

      if (!normalized.length) {
        const result = { status: 'error', message: 'JSON中没有可导入的知识条目' };
        setJsonValidation(result);
        notify(result.message, 'error');
        return null;
      }

      const result = { status: 'success', message: `JSON格式正确，识别到 ${normalized.length} 条知识` };
      setJsonValidation(result);

      if (showSuccessToast) {
        notify(result.message);
      }

      return normalized;
    } catch (error) {
      const result = { status: 'error', message: `JSON格式不正确：${error.message}` };
      setJsonValidation(result);
      notify(result.message, 'error');
      return null;
    }
  }

  // function addKnowledgeFromJson() {
  //   const normalized = validateJsonText(false);

  //   if (!normalized) return;

  //   updateState(prev => ({
  //     ...prev,
  //     knowledgeItems: [...normalized, ...prev.knowledgeItems]
  //   }));

  //   setJsonText('');
  //   setJsonValidation({ status: 'idle', message: '' });
  //   notify(`已导入 ${normalized.length} 条JSON知识`);
  // }
  function addKnowledgeFromJson() {
  const normalized = validateJsonText(false);
  if (!normalized) return;

  const originalInputText = jsonText.trim();

  const enhancedItems = normalized.map(item => ({
    ...item,
    source: item.source || '手动JSON',
    importKind: 'manual-json',
    originalInputText,
    createdAt: item.createdAt || nowText()
  }));

  updateState(prev => ({
    ...prev,
    knowledgeItems: [...enhancedItems, ...prev.knowledgeItems]
  }));

  setJsonText('');
  setJsonValidation({ status: 'idle', message: '' });
  notify(`已导入 ${enhancedItems.length} 条JSON知识`);
}

  // function addPlainKnowledge() {
  //   if (!plainTitle.trim() || !plainText.trim()) {
  //     notify('请填写知识标题和知识内容', 'error');
  //     return;
  //   }

  //   const item = {
  //     id: crypto.randomUUID(),
  //     title: plainTitle.trim(),
  //     domain: knowledgeDomain || '未分类领域',
  //     type: knowledgeType,
  //     source: '手动文本',
  //     content: plainText.trim(),
  //     priority: '',
  //     createdAt: nowText()
  //   };

  //   updateState(prev => ({
  //     ...prev,
  //     knowledgeItems: [item, ...prev.knowledgeItems]
  //   }));

  //   setPlainTitle('');
  //   setPlainText('');
  //   notify('文本知识已导入');
  // }
  function addPlainKnowledge() {
  if (!plainTitle.trim() || !plainText.trim()) {
    notify('请填写知识标题和知识内容', 'error');
    return;
  }

  const item = {
    id: crypto.randomUUID(),
    title: plainTitle.trim(),
    domain: knowledgeDomain || '未分类领域',
    type: knowledgeType,
    source: '键入文本信息',
    content: plainText.trim(),
    originalInputText: plainText.trim(),
    importKind: 'manual-text',
    priority: '',
    createdAt: nowText()
  };

  updateState(prev => ({
    ...prev,
    knowledgeItems: [item, ...prev.knowledgeItems]
  }));

  setPlainTitle('');
  setPlainText('');
  notify('文本知识已导入');
}


  function isValidFile(file, mode) {
    const lower = file.name.toLowerCase();

    if (mode === 'pdf') return lower.endsWith('.pdf');
    if (mode === 'word') return lower.endsWith('.doc') || lower.endsWith('.docx');
    if (mode === 'jsonfile') return lower.endsWith('.json');

    return false;
  }

  // ======================================================================
  // 把前端选择的 PDF / Word / JSON 文件发给后端 /api/knowledge/upload；
  // 后端保存文件并解析正文；
  // 前端拿到后端返回的知识条目。
  async function uploadKnowledgeFileToBackend(file, domain, itemType) {
  const formData = new FormData();

  formData.append('file', file);
  formData.append('domain', domain || '未分类领域');
  formData.append('item_type', itemType || '结构化信息');

  const response = await fetch(`${API_BASE}/api/knowledge/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`后端上传失败：${response.status} ${errorText}`);
  }

  return await response.json();
}
// ============================================================
async function processKnowledgeByBackend(step) {
  const response = await fetch(`${API_BASE}/api/knowledge/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      knowledge_items: state.knowledgeItems,
      chunk_size: Number(chunkSize),
      chunk_overlap: Number(chunkOverlap),
      embedding_model: embeddingModel,
      vector_store_name: vectorStoreName,
      process_mode: step
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`后端知识处理失败：${response.status} ${errorText}`);
  }

  return await response.json();
}
// ========================================================================

  async function readFileAsText(file, mode) {
    if (mode === 'pdf' || mode === 'word') {
      return `
  文件类型：${file.type || fileLabelMap[mode]}
  文件大小：${file.size} bytes`;
    }

    return await file.text();
  }

//   async function handleFiles(files) {
//   const selectedFiles = Array.from(files || []);
//   if (!selectedFiles.length) return;

//   const validFiles = selectedFiles.filter(file => isValidFile(file, importMode));

//   if (!validFiles.length) {
//     notify(`请上传 ${fileLabelMap[importMode]} 格式文件`, 'error');
//     return;
//   }

//   const importedItems = [];

//   for (const file of validFiles) {
//     try {
//       const text = await readFileAsText(file, importMode);

//       const rawFileKey = crypto.randomUUID();
//       rawFileMapRef.current.set(rawFileKey, file);

//       if (importMode === 'jsonfile') {
//         const parsed = JSON.parse(text);

//         const normalized = normalizeJsonKnowledge(parsed, knowledgeDomain, knowledgeType).map(item => ({
//           ...item,
//           source: file.name,
//           importKind: 'file-json',
//           rawFileKey,
//           originalInputText: text,
//           fileMeta: {
//             name: file.name,
//             type: file.type,
//             size: file.size,
//             lastModified: file.lastModified
//           },
//           createdAt: nowText()
//         }));

//         importedItems.push(...normalized);
//       } else {
//         importedItems.push({
//           id: crypto.randomUUID(),
//           title: file.name,
//           domain: knowledgeDomain || '未分类领域',
//           type: knowledgeType,
//           source: file.name,
//           content: text,
//           importKind: importMode === 'pdf' ? 'file-pdf' : 'file-word',
//           rawFileKey,
//           priority: '',
//           fileMeta: {
//             name: file.name,
//             type: file.type,
//             size: file.size,
//             lastModified: file.lastModified
//           },
//           createdAt: nowText()
//         });
//       }
//     } catch (error) {
//       notify(`${file.name} 读取失败：${error.message}`, 'error');
//     }
//   }

//   if (!importedItems.length) return;

//   updateState(prev => ({
//     ...prev,
//     knowledgeItems: [...importedItems, ...prev.knowledgeItems]
//   }));

//   notify(`已导入 ${importedItems.length} 条文件知识`);
// }

// 导入 PDF 文件  导入 Word 文件  导入 JSON 文件
  async function handleFiles(files) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) return;

  const validFiles = selectedFiles.filter(file => isValidFile(file, importMode));

  if (!validFiles.length) {
    notify(`请上传 ${fileLabelMap[importMode]} 格式文件`, 'error');
    return;
  }

  const importedItems = [];

  for (const file of validFiles) {
    try {
      const backendItem = await uploadKnowledgeFileToBackend(
        file,
        knowledgeDomain,
        knowledgeType
      );

      importedItems.push({
        ...backendItem,
        createdAt: backendItem.createdAt || nowText()
      });
    } catch (error) {
      notify(`${file.name} 上传或解析失败：${error.message}`, 'error');
    }
  }

  if (!importedItems.length) return;

  updateState(prev => ({
    ...prev,
    knowledgeItems: [...importedItems, ...prev.knowledgeItems]
  }));

  notify(`已通过后端导入 ${importedItems.length} 条文件知识`);
}


  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function removeKnowledge(id) {
    updateState(prev => ({
      ...prev,
      knowledgeItems: prev.knowledgeItems.filter(item => item.id !== id)
    }));
    notify('知识条目已移除');
  }


  // function runProcessing(step) {
  //   if (!state.knowledgeItems.length) {
  //     notify('请先导入知识，再执行处理与向量化', 'error');
  //     return;
  //   }

  //   try {
  //     // const parsedChunks = buildChunksFromKnowledge(state.knowledgeItems, chunkSize, chunkOverlap);

  //     if (!parsedChunks.length) {
  //       notify('当前知识内容为空，无法切分', 'error');
  //       return;
  //     }

  //     const shouldVectorize = step === 'vector' || step === 'all';
  //     // const vectorRecords = shouldVectorize ? vectorizeChunks(parsedChunks, embeddingModel) : [];
  //     const dimension = getEmbeddingDimension(embeddingModel);

  //     updateState(prev => ({
  //       ...prev,
  //       processing: {
  //         ...prev.processing,
  //         status: 'completed',
  //         chunks: parsedChunks.length,
  //         vectors: shouldVectorize ? vectorRecords.length : 0,
  //         lastTime: nowText(),
  //         chunkSize: Number(chunkSize),
  //         chunkOverlap: Number(chunkOverlap),
  //         embeddingModel,
  //         vectorStoreName,
  //         parsedChunks,
  //         vectorRecords,
  //         logs: [
  //           `[${nowText()}] ${
  //             step === 'parse'
  //               ? `完成文本解析与切分：chunkSize=${chunkSize}, overlap=${chunkOverlap}, chunks=${parsedChunks.length}`
  //               : step === 'vector'
  //                 ? `基于当前切片参数重新切分并完成向量化：chunkSize=${chunkSize}, overlap=${chunkOverlap}, model=${embeddingModel}, dimension=${dimension}, chunks=${parsedChunks.length}, vectors=${vectorRecords.length}`
  //                 : `完成解析、切分与向量化：chunkSize=${chunkSize}, overlap=${chunkOverlap}, model=${embeddingModel}, dimension=${dimension}, chunks=${parsedChunks.length}, vectors=${vectorRecords.length}`
  //           }`,
  //           ...(prev.processing.logs || [])
  //         ].slice(0, 20)
  //       }
  //     }));

  //     notify('知识处理状态已更新');
  //   } catch (error) {
  //     notify(error.message, 'error');
  //   }
  // }
  async function runProcessing(step) {
  if (!state.knowledgeItems.length) {
    notify('请先导入知识，再执行处理与向量化', 'error');
    return;
  }

  const size = Number(chunkSize);
  const overlap = Number(chunkOverlap);

  if (!Number.isFinite(size) || size <= 0) {
    notify('文本切片长度必须大于0', 'error');
    return;
  }

  if (!Number.isFinite(overlap) || overlap < 0) {
    notify('切片重叠不能小于0', 'error');
    return;
  }

  if (overlap >= size) {
    notify('切片重叠必须小于文本切片长度', 'error');
    return;
  }

  const actionText =
    step === 'parse'
      ? '文本解析与切分'
      : step === 'vector'
        ? '文本向量化'
        : '解析、切分与向量化';

  updateState(prev => ({
    ...prev,
    processing: {
      ...prev.processing,
      status: 'processing',
      chunkSize: size,
      chunkOverlap: overlap,
      embeddingModel,
      vectorStoreName,
      logs: [
        `[${nowText()}] 已提交后端${actionText}任务：chunkSize=${size}, overlap=${overlap}, model=${embeddingModel}, vectorStore=${vectorStoreName}`,
        ...(prev.processing?.logs || [])
      ].slice(0, 20)
    }
  }));

  try {
    const result = await processKnowledgeByBackend(step);

    updateState(prev => ({
      ...prev,
      processing: {
        ...prev.processing,
        status: result.status || 'completed',
        chunks: result.chunks || 0,
        vectors: result.vectors || 0,
        lastTime: nowText(),
        chunkSize: result.chunkSize ?? size,
        chunkOverlap: result.chunkOverlap ?? overlap,
        embeddingModel: result.embeddingModel || embeddingModel,
        vectorStoreName: result.vectorStoreName || vectorStoreName,
        embeddingDimension: result.embeddingDimension || getEmbeddingDimension(embeddingModel),
        parsedChunks: result.parsedChunks || [],
        vectorRecords: result.vectorRecords || [],
        logs: [
          `[${nowText()}] 后端完成${actionText}：chunks=${result.chunks || 0}, vectors=${result.vectors || 0}, dimension=${result.embeddingDimension || getEmbeddingDimension(embeddingModel)}`,
          ...(prev.processing?.logs || [])
        ].slice(0, 20)
      }
    }));

    notify(`后端已完成${actionText}`);
  } catch (error) {
    updateState(prev => ({
      ...prev,
      processing: {
        ...prev.processing,
        status: 'error',
        logs: [
          `[${nowText()}] 后端知识处理失败：${error.message}`,
          ...(prev.processing?.logs || [])
        ].slice(0, 20)
      }
    }));

    notify(error.message, 'error');
  }
}
// ======================================================================================

async function copyProcessingLogs() {
  const logs = state.processing.logs || [];

  if (!logs.length) {
    notify('暂无处理日志可复制', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(logs.join('\n'));
    notify('处理日志已复制');
  } catch (error) {
    notify(`复制失败：${error.message}`, 'error');
  }
}
// ======================================================================================

  function clearProcessingLogs() {
    updateState(prev => ({
      ...prev,
      processing: {
        ...prev.processing,
        logs: []
      }
    }));

    notify('处理日志已清空');
  }

  function addSample() {
    if (!sampleScene.trim() || !sampleResponse.trim()) {
      notify('请填写场景描述和LLM响应文本', 'error');
      return;
    }

    updateState(prev => ({
      ...prev,
      samples: [{
        id: crypto.randomUUID(),
        scene: sampleScene.trim(),
        response: sampleResponse.trim(),
        createdAt: nowText()
      }, ...prev.samples]
    }));

    setSampleScene('');
    setSampleResponse('');
    notify('样本已添加');
  }

  function generateSampleByTemplate() {
    if (!templateScene.trim()) {
      notify('请填写场景名称', 'error');
      return;
    }

    updateState(prev => ({
      ...prev,
      samples: [{
        id: crypto.randomUUID(),
        scene: templateScene.trim(),
        response: `针对“${templateScene.trim()}”场景，系统应结合环境状态、人体热舒适状态和建筑运行约束生成可执行调节策略。`,
        createdAt: nowText()
      }, ...prev.samples]
    }));

    setTemplateScene('');
    notify('模板样本已生成');
  }

  function removeSample(id) {
    updateState(prev => ({
      ...prev,
      samples: prev.samples.filter(item => item.id !== id)
    }));
    notify('样本已移除');
  }

  const pageMeta = {
    knowledge: {
      title: '知识库管理',
      description: '导入和管理结构化与非结构化知识文件，完成知识分类、文件导入、文本解析、切片与向量化处理。'
    },
    sample: {
      title: '样本库管理',
      description: '构建和管理用于热环境调节策略生成的样本数据，支持直接输入和模板化生成样本。'
    }
  };

return (
  <PageShell
    className="knowledge-page"
    title={pageMeta[activeTab].title}
    description={pageMeta[activeTab].description}
  >

      {/* <div className="page-tabs">
        <button className={activeTab === 'knowledge' ? 'is-active' : ''} onClick={() => setActiveTab('knowledge')}>知识库管理</button>
        <button className={activeTab === 'sample' ? 'is-active' : ''} onClick={() => setActiveTab('sample')}>样本库管理</button>
      </div> */}
      {/* <div className="page-tabs">
  <button
    className={activeTab === 'knowledge' ? 'is-active' : ''}
    onClick={() => switchTab('knowledge')}
  >
    知识库管理
  </button>

  <button
    className={activeTab === 'sample' ? 'is-active' : ''}
    onClick={() => switchTab('sample')}
  >
    样本库管理
  </button>
</div> */}

      {activeTab === 'knowledge' && (
        <div className="knowledge-layout">
          <Panel title="导入知识" description="支持 JSON、文本、PDF、Word 等知识来源。" className="knowledge-import-panel">
            <div className="knowledge-import-grid">
              <div className="knowledge-meta-grid">
                <Field label="知识领域">
                  <SelectInput value={knowledgeDomain} onChange={event => handleDomainSelect(event.target.value)}>
                    {knowledgeDomains.map(domain => (
                      <option key={domain} value={domain}>{domain}</option>
                    ))}
                    <option value={CREATE_DOMAIN_VALUE}>＋ 新建领域</option>
                  </SelectInput>
                </Field>

                <Field label="条目类型">
                  <SelectInput value={knowledgeType} onChange={event => setKnowledgeType(event.target.value)}>
                    {knowledgeTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </SelectInput>
                </Field>
              </div>

              <div className="mode-switch">
                {[
                  ['json', '键入JSON结构'],
                  ['text', '键入文本信息'],
                  ['pdf', '导入PDF文件'],
                  ['word', '导入Word文件'],
                  ['jsonfile', '导入JSON文件']
                ].map(([id, label]) => (
                  <button key={id} className={importMode === id ? 'is-active' : ''} onClick={() => setImportMode(id)}>{label}</button>
                ))}
              </div>

              {importMode === 'json' && (
                <div className="import-editor">
                  {/* <TextArea
                    value={jsonText}
                    onChange={event => {
                      setJsonText(event.target.value);
                      setJsonValidation({ status: 'idle', message: '' });
                    }}
                    placeholder={jsonPlaceholder}
                  /> */}
                  <TextArea
                    className="json-import-textarea"
                    value={jsonText}
                    onChange={event => {
                      setJsonText(event.target.value);
                      setJsonValidation({ status: 'idle', message: '' });
                    }}
                    placeholder={jsonPlaceholder}
                  />
                  {jsonValidation.message && (
                    <div className={`json-validation json-validation--${jsonValidation.status}`}>
                      {jsonValidation.message}
                    </div>
                  )}
                  <div className="button-row">
                    <button className="btn btn-secondary" onClick={() => validateJsonText(true)}>验证JSON</button>
                    <button className="btn btn-primary" onClick={addKnowledgeFromJson}>导入知识</button>
                  </div>
                </div>
              )}

              {importMode === 'text' && (
                <div className="import-editor">
                  <Field label="知识标题"><TextInput value={plainTitle} onChange={event => setPlainTitle(event.target.value)} /></Field>
                  {/* <Field label="知识内容"><TextArea value={plainText} onChange={event => setPlainText(event.target.value)} /></Field> */}
                  <Field label="知识内容">
                    <TextArea
                      className="textarea plain-knowledge-textarea"
                      value={plainText}
                      onChange={event => setPlainText(event.target.value)}
                    />
                  </Field>
                  <div className="button-row">
                    <button className="btn btn-secondary" onClick={() => { setPlainTitle(''); setPlainText(''); }}>清空</button>
                    <button className="btn btn-primary" onClick={addPlainKnowledge}>导入知识</button>
                  </div>
                </div>
              )}

              {['pdf', 'word', 'jsonfile'].includes(importMode) && (
                <div
                  className={`upload-card ${dragging ? 'is-dragging' : ''}`}
                  onClick={openFilePicker}
                  onDragEnter={event => {
                    event.preventDefault();
                    dragCounterRef.current += 1;
                    setDragging(true);
                  }}
                  onDragOver={event => event.preventDefault()}
                  onDragLeave={event => {
                    event.preventDefault();
                    dragCounterRef.current -= 1;
                    if (dragCounterRef.current <= 0) {
                      dragCounterRef.current = 0;
                      setDragging(false);
                    }
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    dragCounterRef.current = 0;
                    setDragging(false);
                    handleFiles(event.dataTransfer.files);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={fileAcceptMap[importMode]}
                    multiple
                    className="hidden-file-input"
                    onChange={event => {
                      handleFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  <div className="upload-card__icon">⇧</div>
                  <strong>拖拽{fileLabelMap[importMode]}文件到此处，或点击选择本地文件</strong>
                  <button className="btn btn-primary" type="button">选择文件</button>
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="已导入知识"
            description="按知识领域统计和管理已导入条目。"
            className="knowledge-list-panel"
            // actions={<button className="btn btn-secondary" onClick={() => downloadJson('knowledge.json', state.knowledgeItems)}>导出知识库</button>}
            actions={
              <button
                className="btn btn-secondary"
                onClick={() => downloadKnowledgeZip('knowledge-library.zip', state, rawFileMapRef.current)}
              >
                导出知识库
              </button>
            }
          >
            <div className="knowledge-stat-grid">
              {knowledgeCountByDomain.map(item => (
                <div className="stat-card domain-stat-card" key={item.domain}>
                  <button
                    className="domain-delete-button"
                    title={`删除${item.domain}`}
                    onClick={() => deleteKnowledgeDomain(item.domain)}
                  >
                    ×
                  </button>
                  <span>{item.domain}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>

            <div className="knowledge-list">
              {state.knowledgeItems.length === 0 && <div className="empty-state">暂无导入的知识数据</div>}
              {state.knowledgeItems.map(item => (
                <article className="knowledge-item" key={item.id}>
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.content}</p>
                    <small>{item.domain || item.category || '未分类领域'} · {item.type || '未分类类型'} · {item.createdAt}</small>
                    {/* {item.source} ·  */}
                  </div>
                  <button className="btn btn-danger" onClick={() => removeKnowledge(item.id)}>移除</button>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="知识处理与向量化" description="对知识文本进行解析、切分、嵌入与向量库组织。" className="knowledge-process-panel">
            <div className="process-config-grid">
              <Field label="文本切片长度（chunk size）">
                <NumberInput value={chunkSize} min="1" onChange={event => setChunkSize(event.target.value)} />
              </Field>

              <Field label="切片重叠（chunk overlap）">
                <NumberInput value={chunkOverlap} min="0" onChange={event => setChunkOverlap(event.target.value)} />
              </Field>

              <Field label="嵌入模型">
                {/* <SelectInput value={embeddingModel} onChange={event => setEmbeddingModel(event.target.value)}>
                  <option value="text-embedding-3-small">text-embedding-3-small（1536维）</option>
                  <option value="text-embedding-3-large">text-embedding-3-large（3072维）</option>
                  <option value="text-embedding-ada-002">text-embedding-ada-002（1536维）</option>
                  <option value="bge-large-zh-v1.5">bge-large-zh-v1.5（1024维）</option>
                  <option value="m3e-base">m3e-base（768维）</option>
                </SelectInput> */}
                <SelectInput value={embeddingModel} onChange={event => setEmbeddingModel(event.target.value)}>
                  <option value="bge-small-zh-v1.5">bge-small-zh-v1.5（本地，512维）</option>
                  <option value="bge-large-zh-v1.5">bge-large-zh-v1.5（本地，1024维）</option>
                  <option value="m3e-base">m3e-base（本地，768维）</option>
                  <option value="text-embedding-3-small">text-embedding-3-small（OpenAI，1536维）</option>
                  <option value="text-embedding-3-large">text-embedding-3-large（OpenAI，3072维）</option>
                </SelectInput>
              </Field>

              <Field label="向量库名称">
                <TextInput value={vectorStoreName} onChange={event => setVectorStoreName(event.target.value)} />
              </Field>
            </div>

            <div className="button-row process-actions">
              <button className="btn btn-primary" onClick={() => runProcessing('parse')}>执行文本解析与切分</button>
              <button className="btn btn-primary" onClick={() => runProcessing('vector')}>执行文本向量化</button>
              <button className="btn btn-dark" onClick={() => runProcessing('all')}>一键完成处理</button>
              <button className="btn btn-secondary" onClick={() => notify('当前处理状态已刷新')}>刷新状态</button>
            </div>

            <div className="process-status-grid">
              <div className="stat-card"><span>当前状态</span><strong>{state.processing.status}</strong></div>
              <div className="stat-card"><span>已切分片段数</span><strong>{state.processing.chunks}</strong></div>
              <div className="stat-card"><span>已向量化片段数</span><strong>{state.processing.vectors}</strong></div>
              <div className="stat-card"><span>最近处理时间</span><strong>{state.processing.lastTime}</strong></div>
            </div>

            <div className="log-box">
              <div className="log-box__header">
                <strong>处理日志</strong>

                <div className="log-box__actions">
                  <button
                    type="button"
                    className="log-copy-button"
                    onClick={copyProcessingLogs}
                  >
                    复制
                  </button>

                  <button
                    type="button"
                    className="log-clear-button"
                    onClick={clearProcessingLogs}
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className="log-box__content">
                {(state.processing.logs || []).length === 0 ? (
                  <p>暂无处理日志</p>
                ) : (
                  state.processing.logs.map((line, index) => <p key={index}>{line}</p>)
                )}
              </div>
            </div>
            </Panel>
            </div>
          )}

      {activeTab === 'sample' && (
        <div className="sample-layout">
          <Panel title="构建样本" description="手动构建或通过模板生成策略样本。" className="sample-builder-panel">
            <div className="mode-switch compact">
              <button className={sampleMode === 'direct' ? 'is-active' : ''} onClick={() => setSampleMode('direct')}>直接输入</button>
              <button className={sampleMode === 'template' ? 'is-active' : ''} onClick={() => setSampleMode('template')}>填空式输入</button>
            </div>

            {sampleMode === 'direct' ? (
              <div className="sample-editor">
                <Field label="场景描述文本"><TextArea value={sampleScene} onChange={event => setSampleScene(event.target.value)} /></Field>
                <Field label="LLM响应文本"><TextArea value={sampleResponse} onChange={event => setSampleResponse(event.target.value)} /></Field>
                <div className="button-row">
                  <button className="btn btn-secondary" onClick={() => { setSampleScene(''); setSampleResponse(''); }}>清空</button>
                  <button className="btn btn-primary" onClick={addSample}>添加样本</button>
                </div>
              </div>
            ) : (
              <div className="sample-editor">
                <Field label="场景名称"><TextInput value={templateScene} onChange={event => setTemplateScene(event.target.value)} /></Field>
                <div className="button-row">
                  <button className="btn btn-secondary" onClick={() => setTemplateScene('')}>清空</button>
                  <button className="btn btn-primary" onClick={generateSampleByTemplate}>生成样本</button>
                </div>
              </div>
            )}
          </Panel>

          <Panel
            title="已构建样本"
            description="管理用于后续提示优化和策略生成验证的样本。"
            actions={<button className="btn btn-secondary" onClick={() => downloadJson('samples.json', state.samples)}>导出样本库</button>}
          >
            <div className="sample-list">
              {state.samples.length === 0 && <div className="empty-state">暂无样本数据</div>}
              {state.samples.map(item => (
                <article className="sample-item" key={item.id}>
                  <div>
                    <h4>{item.scene}</h4>
                    <p>{item.response}</p>
                    <small>{item.createdAt}</small>
                  </div>
                  <button className="btn btn-danger" onClick={() => removeSample(item.id)}>移除</button>
                </article>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <Modal open={domainModalOpen} title="新建知识领域" onClose={() => setDomainModalOpen(false)}>
        <div className="modal-form">
          <Field label="领域名称">
            <TextInput
              value={newDomainName}
              onChange={event => setNewDomainName(event.target.value)}
              placeholder="请输入知识领域名称"
              autoFocus
            />
          </Field>
          <div className="button-row align-right">
            <button className="btn btn-secondary" onClick={() => setDomainModalOpen(false)}>取消</button>
            <button className="btn btn-primary" onClick={addKnowledgeDomain}>确定</button>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
