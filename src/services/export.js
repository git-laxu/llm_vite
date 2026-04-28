import JSZip from 'jszip';

function safeFileName(name) {
  return String(name || 'untitled')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function removeRuntimeFields(item) {
  const {
    rawFile,
    originalFile,
    fileObject,
    originalInputText,
    ...rest
  } = item || {};

  return rest;
}

function getRawFileFromMap(rawFileMap, item) {
  if (!rawFileMap || !item?.rawFileKey) return null;

  if (rawFileMap instanceof Map) {
    return rawFileMap.get(item.rawFileKey) || null;
  }

  return rawFileMap[item.rawFileKey] || null;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export async function downloadKnowledgeZip(filename, state, rawFileMap) {
  const zip = new JSZip();

  const knowledgeItems = state.knowledgeItems || [];
  // const samples = state.samples || [];
  // const processing = state.processing || {};

  const exportedKnowledgeItems = knowledgeItems.map(removeRuntimeFields);

  const manifest = {
    exportedAt: new Date().toISOString(),
    knowledgeCount: knowledgeItems.length,
    // sampleCount: samples.length,
    originalFileCount: knowledgeItems.filter(item => item.rawFileKey).length,
    manualInputCount: knowledgeItems.filter(item =>
      item.importKind === 'manual-json' || item.importKind === 'manual-text'
    ).length,
    note: 'knowledge-library.json 保存知识库描述信息；original_files 保存原始导入文件；manual_inputs 保存键入JSON结构和键入文本信息。'
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('knowledge-library.json', JSON.stringify(exportedKnowledgeItems, null, 2));
  // zip.file('sample-library.json', JSON.stringify(samples, null, 2));
  // zip.file('processing-result.json', JSON.stringify(processing, null, 2));

  const originalFilesFolder = zip.folder('original_files');
  const manualInputsFolder = zip.folder('manual_inputs');

  const addedOriginalFiles = new Set();

  knowledgeItems.forEach((item, index) => {
    const order = String(index + 1).padStart(3, '0');
    const title = safeFileName(item.title || `knowledge_${order}`);

    const rawFile = getRawFileFromMap(rawFileMap, item);

    if (rawFile instanceof File) {
      const fileKey = `${rawFile.name}_${rawFile.size}_${rawFile.lastModified}`;

      if (!addedOriginalFiles.has(fileKey)) {
        addedOriginalFiles.add(fileKey);

        const originalName = safeFileName(rawFile.name);
        originalFilesFolder.file(`${order}_${originalName}`, rawFile);
      }
    }

    if (item.importKind === 'manual-json') {
      manualInputsFolder.file(
        `${order}_${title}_manual_json.txt`,
        item.originalInputText || item.content || ''
      );
    }

    if (item.importKind === 'manual-text') {
      manualInputsFolder.file(
        `${order}_${title}_manual_text.txt`,
        [
          `标题：${item.title || ''}`,
          `领域：${item.domain || ''}`,
          `类型：${item.type || ''}`,
          `来源：${item.source || '键入文本信息'}`,
          '',
          item.originalInputText || item.content || ''
        ].join('\n')
      );
    }
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename || 'knowledge-library.zip';
  link.click();

  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  if (!text) return false;
  await navigator.clipboard.writeText(text);
  return true;
}