const KEY = 'LLMDECISION_REACT_STATE';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('读取本地状态失败：', error);
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('保存本地状态失败：', error);
  }
}

export function clearState() {
  localStorage.removeItem(KEY);
}
