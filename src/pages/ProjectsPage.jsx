import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import Panel from '../components/Panel.jsx';
import Modal from '../components/Modal.jsx';
import { Field, TextArea, TextInput } from '../components/Field.jsx';
import { downloadJson } from '../services/export.js';

function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

export default function ProjectsPage({ state, updateState, notify }) {
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [search, setSearch] = useState('');

  const filteredProjects = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return state.projects;
    return state.projects.filter(item =>
      item.name.toLowerCase().includes(key) || item.description.toLowerCase().includes(key)
    );
  }, [search, state.projects]);

  function createProject() {
    if (!projectName.trim()) {
      notify('请填写项目名称', 'error');
      return;
    }

    updateState(prev => ({
      ...prev,
      projects: [{
        id: crypto.randomUUID(),
        name: projectName.trim(),
        description: projectDesc.trim(),
        createdAt: nowText(),
        taskCount: 0
      }, ...prev.projects]
    }));

    setProjectName('');
    setProjectDesc('');
    setProjectModalOpen(false);
    notify('项目已新建');
  }

  function deleteProject(id) {
    updateState(prev => ({
      ...prev,
      projects: prev.projects.filter(item => item.id !== id)
    }));
    notify('项目已删除');
  }

  function clearHistory() {
    updateState(prev => ({ ...prev, histories: [] }));
    notify('历史策略记录已清空');
  }

  return (
    <PageShell
      className="projects-page"
      title="项目与数据管理"
      description="对项目、任务、策略结果和历史记录进行统一管理。"
    >
      <div className="projects-layout">
        <Panel
          title="项目管理"
          description="创建项目并管理不同任务的数据归档。"
          actions={<button className="btn btn-primary" onClick={() => setProjectModalOpen(true)}>新建项目</button>}
        >
          <div className="project-toolbar">
            <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索项目" />
            <button className="btn btn-secondary" onClick={() => downloadJson('projects.json', state.projects)}>导出项目</button>
          </div>

          <div className="project-list">
            {filteredProjects.length === 0 && <div className="empty-state">暂无项目数据</div>}
            {filteredProjects.map(item => (
              <article className="project-card" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.description || '暂无项目描述'}</p>
                  <small>{item.createdAt} · 任务数 {item.taskCount}</small>
                </div>
                <button className="btn btn-danger" onClick={() => deleteProject(item.id)}>删除</button>
              </article>
            ))}
          </div>
        </Panel>

        <Panel
          title="历史策略记录"
          description="保存每次策略生成的任务、摘要与结构化结果。"
          actions={<button className="btn btn-secondary" onClick={clearHistory}>清空历史</button>}
        >
          <div className="history-list">
            {state.histories.length === 0 && <div className="empty-state">暂无历史策略记录</div>}
            {state.histories.map(item => (
              <article className="history-card" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <small>{item.createdAt}</small>
                </div>
                <button className="btn btn-secondary" onClick={() => downloadJson(`${item.title}.json`, item.result)}>导出</button>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <Modal open={projectModalOpen} title="新建项目" onClose={() => setProjectModalOpen(false)}>
        <div className="modal-form">
          <Field label="项目名称"><TextInput value={projectName} onChange={e => setProjectName(e.target.value)} /></Field>
          <Field label="项目描述"><TextArea value={projectDesc} onChange={e => setProjectDesc(e.target.value)} /></Field>
          <div className="button-row align-right">
            <button className="btn btn-secondary" onClick={() => setProjectModalOpen(false)}>取消</button>
            <button className="btn btn-primary" onClick={createProject}>确定</button>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
