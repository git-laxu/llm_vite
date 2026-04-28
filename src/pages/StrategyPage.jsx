// 

import { useEffect, useMemo, useRef, useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import Panel from '../components/Panel.jsx';
import { Field, TextArea, TextInput, NumberInput, SelectInput } from '../components/Field.jsx';
import { copyText, downloadJson } from '../services/export.js';
import { generateStrategy } from '../services/llm.js';

const defaultStrategyForm = {
  climate: {
    location: '哈尔滨',
    climateType: '寒冷地区',
    season: '冬季',
    outdoorTemp: -12,
    outdoorHumidity: 45,
    solarRadiation: 260,
    outdoorWindSpeed: 2.4
  },
  building: {
    spaceType: '办公空间',
    maxCapacity: 12,
    layoutType: '开敞型',
    orientation: '南向',
    width: 10,
    depth: 8,
    height: 3,
    windowWallRatio: 40,
    envelopeType: '普通围护结构',
    shadingState: '无遮阳',
    hvacMode: '空调与自然通风联合'
  },
  environment: {
    airTemp: 24,
    relativeHumidity: 45,
    airVelocity: 0.2,
    blackGlobeTemp: 24.8,
    meanRadiantTemp: 24.5,
    co2: 700
  },
  occupants: {
    count: 1,
    persons: [
      {
        id: 'P1',
        x: 4.5,
        y: 3.2,
        activity: '坐姿办公',
        clothing: 0.9,
        thermalBehavior: '无行为'
      }
    ]
  },
  comfort: {
    tsvById: { P1: 0 },
    thermalPreference: '保持当前状态',
    discomfortArea: '无明显不适区域'
  },
  target: '提升热舒适并兼顾节能',
  constraints: '优先局部调节；避免过度升温；控制能耗波动',
  energyPriority: true,
  localPriority: true,

  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelId: 'gpt-4o-mini',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1200,
  knowledgeTopK: 5
};

function normalizeForm(raw = {}) {
  const merged = {
    ...defaultStrategyForm,
    ...raw,
    climate: { ...defaultStrategyForm.climate, ...(raw.climate || {}) },
    building: { ...defaultStrategyForm.building, ...(raw.building || {}) },
    environment: { ...defaultStrategyForm.environment, ...(raw.environment || {}) },
    occupants: { ...defaultStrategyForm.occupants, ...(raw.occupants || {}) },
    comfort: { ...defaultStrategyForm.comfort, ...(raw.comfort || {}) }
  };

  // 兼容旧版本扁平字段，避免本地 storage 中旧数据导致页面空白。
  if (raw.location) merged.climate.location = raw.location;
  if (raw.spaceType) merged.building.spaceType = raw.spaceType;
  if (raw.airTemp !== undefined) merged.environment.airTemp = raw.airTemp;
  if (raw.humidity !== undefined) merged.environment.relativeHumidity = raw.humidity;
  if (raw.tsv !== undefined && !raw.comfort?.tsvById) {
    const firstId = merged.occupants.persons?.[0]?.id || 'P1';
    merged.comfort.tsvById = { [firstId]: Number(raw.tsv) };
  }

  if (!Array.isArray(merged.occupants.persons)) merged.occupants.persons = [];
  merged.occupants.count = merged.occupants.persons.length;

  return merged;
}

function getTsvValue(form, personId) {
  return form.comfort.tsvById?.[personId] ?? 0;
}

function classifyTsv(tsv) {
  const value = Number(tsv);
  if (value <= -1) return '偏冷';
  if (value >= 1) return '偏热';
  return '中性';
}

export default function StrategyPage({ state, updateState, notify }) {
  const [form, setForm] = useState(() => normalizeForm(state.strategyForm));
  const [semanticContext, setSemanticContext] = useState('');
  const [loading, setLoading] = useState(false);

// recentProjects：最近使用的 3 个项目
// currentProject：当前选中的项目
// projectDropdownOpen：控制项目下拉框是否打开
// projectModalOpen：控制新建项目弹窗是否打开
// newProjectName：弹窗输入的项目名称
  const projectDropdownRef = useRef(null);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const recentProjects = useMemo(() => {
    const projects = state.projects || [];

    return projects
      .slice()
      .sort((a, b) => {
        const timeA = new Date(a.lastUsedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.lastUsedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, 3);
  }, [state.projects]);

  const currentProject = useMemo(() => {
    const projects = state.projects || [];
    return projects.find(project => project.id === state.currentProjectId) || null;
  }, [state.projects, state.currentProjectId]);

  // 点击页面其他地方时，项目下拉框自动关闭。
  useEffect(() => {
  function handleClickOutside(event) {
    if (
      projectDropdownRef.current &&
      !projectDropdownRef.current.contains(event.target)
    ) {
      setProjectDropdownOpen(false);
    }
  }

  document.addEventListener('mousedown', handleClickOutside);

  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, []);

  // 
  useEffect(() => {
    updateState(prev => ({ ...prev, strategyForm: form }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selectProject(project)：选择已有项目
  function selectProject(project) {
    const now = new Date().toISOString();

    updateState(prev => ({
      ...prev,
      currentProjectId: project.id,
      projects: (prev.projects || []).map(item =>
        item.id === project.id
          ? { ...item, lastUsedAt: now }
          : item
      )
    }));

  setProjectDropdownOpen(false);
  notify(`已切换到项目：${project.name}`);
}

// createProject()：新建项目，并自动切换到这个项目
  function createProject() {
    const name = newProjectName.trim();

    if (!name) {
      notify('请输入项目名称', 'error');
      return;
    }

    const now = new Date().toISOString();

    const project = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      lastUsedAt: now
    };

    updateState(prev => ({
      ...prev,
      currentProjectId: project.id,
      projects: [project, ...(prev.projects || [])]
    }));

    setProjectModalOpen(false);
    setProjectDropdownOpen(false);
    setNewProjectName('');
    notify(`项目已新建：${name}`);
  }

  // 
  function commit(next) {
    setForm(next);
    updateState(prev => ({ ...prev, strategyForm: next }));
  }

  function updateGroupField(group, key, value) {
    commit({ ...form, [group]: { ...form[group], [key]: value } });
  }

  function updateRootField(key, value) {
    commit({ ...form, [key]: value });
  }

  function updatePerson(index, key, value) {
    const persons = form.occupants.persons.map((person, i) => (
      i === index ? { ...person, [key]: value } : person
    ));
    commit({ ...form, occupants: { ...form.occupants, persons, count: persons.length } });
  }

  function updatePersonTsv(personId, value) {
    commit({
      ...form,
      comfort: {
        ...form.comfort,
        tsvById: { ...form.comfort.tsvById, [personId]: Number(value) }
      }
    });
  }

  function addPerson() {
    const nextIndex = form.occupants.persons.length + 1;
    const id = `P${nextIndex}`;
    const persons = [
      ...form.occupants.persons,
      { id, x: 0, y: 0, activity: '坐姿办公', clothing: 0.9, thermalBehavior: '无行为' }
    ];
    commit({
      ...form,
      occupants: { ...form.occupants, persons, count: persons.length },
      comfort: { ...form.comfort, tsvById: { ...form.comfort.tsvById, [id]: 0 } }
    });
  }

  function removePerson(index) {
    const removed = form.occupants.persons[index];
    const persons = form.occupants.persons.filter((_, i) => i !== index);
    const nextTsvById = { ...form.comfort.tsvById };
    delete nextTsvById[removed.id];
    commit({
      ...form,
      occupants: { ...form.occupants, persons, count: persons.length },
      comfort: { ...form.comfort, tsvById: nextTsvById }
    });
  }

  function buildSemanticContext() {
    const parts = [];
    const { climate, building, environment, occupants, comfort } = form;

    parts.push(`【静态气候信息】当前场景位于${climate.location || '未填写位置'}，气候分区为${climate.climateType || '未设置'}，季节为${climate.season || '未设置'}，室外温度${climate.outdoorTemp}℃，室外相对湿度${climate.outdoorHumidity}%，太阳辐射强度${climate.solarRadiation}W/m²，室外风速${climate.outdoorWindSpeed}m/s。`);

    parts.push(`【建筑空间特征信息】空间类型为${building.spaceType || '未设置'}，最大容纳人数${building.maxCapacity}人，布局类型为${building.layoutType || '未设置'}，建筑朝向为${building.orientation || '未设置'}，空间尺寸为${building.width}m × ${building.depth}m × ${building.height}m，窗墙比约${building.windowWallRatio}%，围护结构为${building.envelopeType || '未设置'}，遮阳状态为${building.shadingState || '未设置'}，当前空调/通风模式为${building.hvacMode || '未设置'}。`);

    parts.push(`【动态室内环境信息】当前室内空气温度${environment.airTemp}℃，相对湿度${environment.relativeHumidity}%，风速${environment.airVelocity}m/s，黑球温度${environment.blackGlobeTemp}℃，平均辐射温度${environment.meanRadiantTemp}℃，CO₂浓度${environment.co2}ppm。`);

    if (occupants.persons.length > 0) {
      const personText = occupants.persons.map(person => (
        `${person.id}位于(${Number(person.x).toFixed(1)}, ${Number(person.y).toFixed(1)})，活动状态为${person.activity}，服装热阻${person.clothing}clo，热适应行为为${person.thermalBehavior}`
      )).join('；');
      parts.push(`【人行为信息】在室人员共${occupants.persons.length}人。${personText}。`);

      const tsvText = occupants.persons.map(person => {
        const tsv = getTsvValue(form, person.id);
        return `${person.id}的TSV=${tsv}（${classifyTsv(tsv)}）`;
      }).join('；');
      parts.push(`【热舒适信息】${tsvText}。总体热偏好为${comfort.thermalPreference || '未设置'}，主要不适区域为${comfort.discomfortArea || '未设置'}。`);
    } else {
      parts.push('【人行为信息】暂无在室人员信息。');
      parts.push(`【热舒适信息】总体热偏好为${comfort.thermalPreference || '未设置'}，主要不适区域为${comfort.discomfortArea || '未设置'}。`);
    }

    parts.push(`【调节目标与运行约束】调节目标为“${form.target || '未设置'}”。建筑运行约束为“${form.constraints || '未设置'}”。优先级设置：${form.localPriority ? '优先局部调节' : '允许整体调节'}，${form.energyPriority ? '节能优先' : '舒适优先'}。`);

    const text = parts.join('\n');
    setSemanticContext(text);
    notify('语义化状态上下文已生成');
  }

  async function runStrategy() {
  setLoading(true);

  try {
    const context = semanticContext || buildContextWithoutNotify(form);
    const result = await generateStrategy(form, context, state.knowledgeItems);

    updateState(prev => ({
      ...prev,
      strategyResult: result,
      histories: [
        {
          id: crypto.randomUUID(),
          title: result.task || '建筑热环境调节策略生成',
          summary: result.summary || '',
          createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          result
        },
        ...prev.histories
      ]
    }));

    notify('后端模型策略已生成');
  } catch (error) {
    notify(error.message || '策略生成失败，请检查后端服务、API Key、Base URL 和 Model ID', 'error');
  } finally {
    setLoading(false);
  }
}

  const result = state.strategyResult;

  // return (
  //   <PageShell title="决策策略生成" description="基于静态气候、建筑空间、室内环境、人员行为与热舒适状态生成建筑环境调节策略。" className="strategy-page">
  //     <div className="strategy-layout">
  return (
  <PageShell className="strategy-page">
    <section className="strategy-hero-panel">
      <div className="strategy-hero-text">
        <h2>决策策略生成</h2>
        <p>基于静态气候、建筑空间、室内环境、人员行为与热舒适状态生成建筑环境调节策略。</p>
      </div>

      <div className="project-selector strategy-hero-project" ref={projectDropdownRef}>
        <button
          type="button"
          className="project-button"
          onClick={() => setProjectDropdownOpen(open => !open)}
        >
          {currentProject ? `项目：${currentProject.name}` : '项目'}
          <span className={projectDropdownOpen ? 'project-button__arrow is-open' : 'project-button__arrow'}>
            ▾
          </span>
        </button>

        {projectDropdownOpen && (
          <div className="project-dropdown">
            {recentProjects.length === 0 ? (
              <div className="project-dropdown__empty">
                暂无最近项目
              </div>
            ) : (
              recentProjects.map(project => (
                <button
                  type="button"
                  key={project.id}
                  className={
                    project.id === state.currentProjectId
                      ? 'project-dropdown__item is-active'
                      : 'project-dropdown__item'
                  }
                  onClick={() => selectProject(project)}
                >
                  <span>{project.name}</span>
                  <small>
                    最近使用：{project.lastUsedAt
                      ? new Date(project.lastUsedAt).toLocaleString('zh-CN', { hour12: false })
                      : '暂无记录'}
                  </small>
                </button>
              ))
            )}

            <button
              type="button"
              className="project-dropdown__item project-dropdown__item--create"
              onClick={() => {
                setProjectModalOpen(true);
                setProjectDropdownOpen(false);
              }}
            >
              ＋ 新建项目
            </button>
          </div>
        )}
      </div>
    </section>

    <div className="strategy-layout">
        <Panel title="场景信息输入" description="按状态表征逻辑录入五类信息，形成可供模型推理的结构化状态。"
          className="strategy-input-panel">
          <div className="strategy-input-stack">
            <section className="strategy-input-group">
              <h4>静态气候信息</h4>
              <div className="strategy-input-grid">
                <Field label="地理位置"><TextInput value={form.climate.location} onChange={e => updateGroupField('climate', 'location', e.target.value)} /></Field>
                <Field label="气候分区"><SelectInput value={form.climate.climateType} onChange={e => updateGroupField('climate', 'climateType', e.target.value)}><option>严寒地区</option><option>寒冷地区</option><option>夏热冬冷地区</option><option>夏热冬暖地区</option><option>温和地区</option></SelectInput></Field>
                <Field label="季节"><SelectInput value={form.climate.season} onChange={e => updateGroupField('climate', 'season', e.target.value)}><option>春季</option><option>夏季</option><option>秋季</option><option>冬季</option><option>过渡季</option></SelectInput></Field>
                <Field label="室外温度 / ℃"><NumberInput step="0.1" value={form.climate.outdoorTemp} onChange={e => updateGroupField('climate', 'outdoorTemp', e.target.value)} /></Field>
                <Field label="室外相对湿度 / %"><NumberInput step="1" value={form.climate.outdoorHumidity} onChange={e => updateGroupField('climate', 'outdoorHumidity', e.target.value)} /></Field>
                <Field label="太阳辐射 / W·m⁻²"><NumberInput step="1" value={form.climate.solarRadiation} onChange={e => updateGroupField('climate', 'solarRadiation', e.target.value)} /></Field>
                <Field label="室外风速 / m·s⁻¹"><NumberInput step="0.1" value={form.climate.outdoorWindSpeed} onChange={e => updateGroupField('climate', 'outdoorWindSpeed', e.target.value)} /></Field>
              </div>
            </section>

            <section className="strategy-input-group">
              <h4>建筑空间特征信息</h4>
              <div className="strategy-input-grid">
                <Field label="空间类型"><SelectInput value={form.building.spaceType} onChange={e => updateGroupField('building', 'spaceType', e.target.value)}><option>开放办公区</option><option>独立办公室</option><option>会议室</option><option>教室</option><option>居住空间</option><option>商业空间</option></SelectInput></Field>
                <Field label="最大容纳人数"><NumberInput min="1" value={form.building.maxCapacity} onChange={e => updateGroupField('building', 'maxCapacity', e.target.value)} /></Field>
                <Field label="布局类型"><SelectInput value={form.building.layoutType} onChange={e => updateGroupField('building', 'layoutType', e.target.value)}><option>围合型</option><option>半围合型</option><option>开敞型</option><option>走廊型</option></SelectInput></Field>
                <Field label="建筑朝向"><SelectInput value={form.building.orientation} onChange={e => updateGroupField('building', 'orientation', e.target.value)}><option>北向</option><option>南向</option><option>东向</option><option>西向</option><option>东北向</option><option>西北向</option><option>东南向</option><option>西南向</option></SelectInput></Field>
                <Field label="面宽 / m"><NumberInput min="1" step="0.1" value={form.building.width} onChange={e => updateGroupField('building', 'width', e.target.value)} /></Field>
                <Field label="进深 / m"><NumberInput min="1" step="0.1" value={form.building.depth} onChange={e => updateGroupField('building', 'depth', e.target.value)} /></Field>
                <Field label="层高 / m"><NumberInput min="2" step="0.1" value={form.building.height} onChange={e => updateGroupField('building', 'height', e.target.value)} /></Field>
                <Field label="窗墙比 / %"><NumberInput min="0" max="100" value={form.building.windowWallRatio} onChange={e => updateGroupField('building', 'windowWallRatio', e.target.value)} /></Field>
                <Field label="围护结构"><SelectInput value={form.building.envelopeType} onChange={e => updateGroupField('building', 'envelopeType', e.target.value)}><option>普通围护结构</option><option>高保温围护结构</option><option>高气密围护结构</option><option>轻质围护结构</option></SelectInput></Field>
                <Field label="遮阳状态"><SelectInput value={form.building.shadingState} onChange={e => updateGroupField('building', 'shadingState', e.target.value)}><option>无遮阳</option><option>内遮阳开启</option><option>外遮阳开启</option><option>遮阳部分开启</option></SelectInput></Field>
                <Field label="空调/通风模式"><SelectInput value={form.building.hvacMode} onChange={e => updateGroupField('building', 'hvacMode', e.target.value)}><option>自然通风</option><option>机械通风</option><option>空调运行</option><option>空调与自然通风联合</option><option>辐射系统运行</option></SelectInput></Field>
              </div>
            </section>

            <section className="strategy-input-group">
              <h4>动态室内环境信息</h4>
              <div className="strategy-input-grid">
                <Field label="空气温度 / ℃"><NumberInput step="0.1" value={form.environment.airTemp} onChange={e => updateGroupField('environment', 'airTemp', e.target.value)} /></Field>
                <Field label="相对湿度 / %"><NumberInput min="0" max="100" value={form.environment.relativeHumidity} onChange={e => updateGroupField('environment', 'relativeHumidity', e.target.value)} /></Field>
                <Field label="风速 / m·s⁻¹"><NumberInput step="0.01" value={form.environment.airVelocity} onChange={e => updateGroupField('environment', 'airVelocity', e.target.value)} /></Field>
                <Field label="黑球温度 / ℃"><NumberInput step="0.1" value={form.environment.blackGlobeTemp} onChange={e => updateGroupField('environment', 'blackGlobeTemp', e.target.value)} /></Field>
                <Field label="平均辐射温度 / ℃"><NumberInput step="0.1" value={form.environment.meanRadiantTemp} onChange={e => updateGroupField('environment', 'meanRadiantTemp', e.target.value)} /></Field>
                <Field label="CO₂浓度 / ppm"><NumberInput step="1" value={form.environment.co2} onChange={e => updateGroupField('environment', 'co2', e.target.value)} /></Field>
              </div>
            </section>

            <section className="strategy-input-group">
              <div className="group-title-row">
                <h4>人行为信息</h4>
                <button className="btn btn-secondary btn-sm" type="button" onClick={addPerson}>新增人员</button>
              </div>
              <div className="person-list">
                {form.occupants.persons.length === 0 ? <div className="empty-state compact">暂无人员信息</div> : form.occupants.persons.map((person, index) => (
                  <div className="person-card" key={person.id}>
                    <div className="person-card-header">
                      <strong>{person.id}</strong>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => removePerson(index)}>删除</button>
                    </div>
                    <div className="person-grid">
                      {/* <Field label="人员ID"><TextInput value={person.id} onChange={e => updatePerson(index, 'id', e.target.value)} /></Field> */}
                      <Field label="X位置"><NumberInput step="0.1" value={person.x} onChange={e => updatePerson(index, 'x', e.target.value)} /></Field>
                      <Field label="Y位置"><NumberInput step="0.1" value={person.y} onChange={e => updatePerson(index, 'y', e.target.value)} /></Field>
                      <Field label="服装热阻 / clo"><NumberInput step="0.1" value={person.clothing} onChange={e => updatePerson(index, 'clothing', e.target.value)} /></Field>
                      <Field label="活动状态"><SelectInput value={person.activity} onChange={e => updatePerson(index, 'activity', e.target.value)}><option>静坐</option><option>坐姿办公</option><option>站立交流</option><option>低强度走动</option><option>中等活动</option></SelectInput></Field>
                      <Field label="热适应行为"><SelectInput value={person.thermalBehavior} onChange={e => updatePerson(index, 'thermalBehavior', e.target.value)}><option>无行为</option><option>开窗</option><option>关窗</option><option>增减衣物</option><option>移动位置</option><option>使用风扇</option><option>使用局部取暖</option><option>调节遮阳</option></SelectInput></Field>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="strategy-input-group">
              <h4>热舒适信息</h4>
              <div className="comfort-list">
                {form.occupants.persons.map(person => (
                  <div className="comfort-row" key={`comfort-${person.id}`}>
                    <span>{person.id}</span>
                    <input type="range" min="-3" max="3" step="1" value={getTsvValue(form, person.id)} onChange={e => updatePersonTsv(person.id, e.target.value)} />
                    <strong>{getTsvValue(form, person.id)} / {classifyTsv(getTsvValue(form, person.id))}</strong>
                  </div>
                ))}
              </div>
              <div className="strategy-input-grid comfort-extra-grid">
                <Field label="总体热偏好"><SelectInput value={form.comfort.thermalPreference} onChange={e => updateGroupField('comfort', 'thermalPreference', e.target.value)}><option>希望更冷</option><option>保持当前状态</option><option>希望更暖</option><option>希望增强空气流动</option><option>希望降低吹风感</option></SelectInput></Field>
                <Field label="主要不适区域"><TextInput value={form.comfort.discomfortArea} onChange={e => updateGroupField('comfort', 'discomfortArea', e.target.value)} /></Field>
              </div>
            </section>

            <section className="strategy-input-group">
              <h4>调节目标与运行约束</h4>
              <div className="strategy-input-grid adjust-aim-constraint">
                <Field label="调节目标"><TextInput value={form.target} onChange={e => updateRootField('target', e.target.value)} /></Field>
                <Field label="建筑运行约束"><TextInput value={form.constraints} onChange={e => updateRootField('constraints', e.target.value)} /></Field>
              </div>
              <div className="check-row">
                <label><input type="checkbox" checked={form.energyPriority} onChange={e => updateRootField('energyPriority', e.target.checked)} /> 节能优先</label>
                <label><input type="checkbox" checked={form.localPriority} onChange={e => updateRootField('localPriority', e.target.checked)} /> 优先局部调节</label>
              </div>
            </section>
          </div>
        </Panel>

        <Panel title="语义化状态上下文" description="根据左侧输入生成可供模型理解的状态文本。" 
          className="semantic-context-panel"
          
          actions={
          <>
            <button className="btn btn-primary" onClick={buildSemanticContext}>语义生成</button>
            <button className="btn btn-secondary" onClick={async () => { await copyText(semanticContext); notify('内容已复制'); }}>复制内容</button>
          </>
        }>
          <TextArea className="semantic-textarea" value={semanticContext} onChange={e => setSemanticContext(e.target.value)} placeholder="点击“语义生成”后自动生成，也可以手动编辑。" />
        </Panel>

        {/* <Panel title="模型调用区" description="当前版本保留模型参数配置，默认使用本地模拟生成逻辑。">
          <div className="model-config-grid">
            <Field label="API Key"><TextInput value={form.apiKey} onChange={e => updateRootField('apiKey', e.target.value)} placeholder="后续接后端时使用" /></Field>
            <Field label="模型ID"><TextInput value={form.modelId} onChange={e => updateRootField('modelId', e.target.value)} /></Field>
            <Field label="temperature"><NumberInput step="0.1" value={form.temperature} onChange={e => updateRootField('temperature', e.target.value)} /></Field>
            <Field label="top_p"><NumberInput step="0.1" value={form.topP} onChange={e => updateRootField('topP', e.target.value)} /></Field>
            <Field label="max_tokens"><NumberInput value={form.maxTokens} onChange={e => updateRootField('maxTokens', e.target.value)} /></Field>
          </div>
          <div className="button-row">
            <button className="btn btn-dark generate-button" disabled={loading} onClick={runStrategy}>{loading ? '策略生成中...' : '生成策略'}</button>
          </div>
        </Panel> */}
        {/* Provider：选择模型服务商
            Base URL：模型服务接口地址
            API Key：模型平台密钥
            Model ID：具体调用哪个模型
            知识检索数量：后端使用多少条知识作为上下文 */}
        <Panel
          title="模型调用区" description="通过后端 /api/strategy/generate 统一调用大语言模型，支持 OpenAI 兼容接口。">
          <div className="model-config-grid">
            <div className="model-config-row-top">
            <Field label="Provider">
              <SelectInput
                value={form.provider}
                onChange={e => {
                  const provider = e.target.value;

                  let baseUrl = form.baseUrl;
                  let modelId = form.modelId;

                  if (provider === 'openai') {
                    baseUrl = 'https://api.openai.com/v1';
                    modelId = modelId || 'gpt-4o-mini';
                  }

                  if (provider === 'aliyun') {
                    baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
                    modelId = modelId || 'qwen-plus';
                  }

                  if (provider === 'deepseek') {
                    baseUrl = 'https://api.deepseek.com/v1';
                    modelId = modelId || 'deepseek-chat';
                  }

                  commit({
                    ...form,
                    provider,
                    baseUrl,
                    modelId
                  });
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="aliyun">阿里云百炼 / DashScope</option>
                <option value="deepseek">DeepSeek</option>
                <option value="custom">自定义 OpenAI 兼容接口</option>
              </SelectInput>
            </Field>

            <Field label="Base URL">
              <TextInput
                value={form.baseUrl}
                onChange={e => updateRootField('baseUrl', e.target.value)}
                placeholder="例如 https://api.openai.com/v1"
              />
            </Field>

            <Field label="API Key">
              <TextInput
                value={form.apiKey}
                onChange={e => updateRootField('apiKey', e.target.value)}
                placeholder="填写当前模型服务平台的 API Key"
                type="password"
              />
            </Field>

            <Field label="Model ID">
              <TextInput
                value={form.modelId}
                onChange={e => updateRootField('modelId', e.target.value)}
                placeholder="例如 gpt-4o-mini / qwen-plus / deepseek-chat"
              />
            </Field>
            </div>

            <div className="model-config-row-bottom">
            <Field label="temperature">
              <NumberInput
                step="0.1"
                value={form.temperature}
                onChange={e => updateRootField('temperature', e.target.value)}
              />
            </Field>

            <Field label="top_p">
              <NumberInput
                step="0.1"
                value={form.topP}
                onChange={e => updateRootField('topP', e.target.value)}
              />
            </Field>

            <Field label="max_tokens">
              <NumberInput
                value={form.maxTokens}
                onChange={e => updateRootField('maxTokens', e.target.value)}
              />
            </Field>

            <Field label="知识检索数量">
              <NumberInput
                value={form.knowledgeTopK}
                onChange={e => updateRootField('knowledgeTopK', e.target.value)}
              />
            </Field>
          </div>
          </div>

          <div className="button-row">
            <button
              className="btn btn-dark generate-button"
              disabled={loading}
              onClick={runStrategy}
            >
              {loading ? '策略生成中...' : '生成策略'}
            </button>
          </div>
        </Panel>

        <Panel title="策略输出区" description="展示任务、约束、知识依据、策略摘要与结构化结果。" className="strategy-result-panel" actions={
          <>
            <button className="btn btn-secondary" onClick={async () => { await copyText(result ? JSON.stringify(result, null, 2) : ''); notify('结果已复制'); }}>复制结果</button>
            <button className="btn btn-secondary" onClick={() => downloadJson('strategy-result.json', result || {})}>导出结果</button>
          </>
        }>
          {!result ? (
            <div className="empty-state">暂无策略结果</div>
          ) : (
            <div className="result-grid">
              <div className="result-card"><span>任务</span><strong>{result.task}</strong></div>
              <div className="result-card"><span>约束</span><strong>{result.constraints}</strong></div>
              <div className="result-card span-2"><span>规则/知识</span><strong>{result.knowledge.join('；')}</strong></div>
              <div className="result-card span-2"><span>策略摘要</span><p>{result.summary}</p></div>
              <div className="json-block span-2"><span>结构化结果 JSON</span><pre>{JSON.stringify(result.json, null, 2)}</pre></div>
            </div>
          )}
        </Panel>
      </div>

        {projectModalOpen && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal__header">
                <h3>新建项目</h3>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                    setProjectModalOpen(false);
                    setNewProjectName('');
                  }}
                >
                  ×
                </button>
              </div>

              <div className="modal__body">
                <div className="modal-form">
                  <Field label="项目名称">
                    <TextInput
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      placeholder="请输入项目名称"
                      autoFocus
                    />
                  </Field>

                  <div className="project-modal-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setProjectModalOpen(false);
                        setNewProjectName('');
                      }}
                    >
                      取消
                    </button>

                    <button
                      type="button"
                      className="btn btn-dark"
                      onClick={createProject}
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageShell>
      );
}

function buildContextWithoutNotify(form) {
  const personSummary = form.occupants.persons.map(person => `${person.id}: TSV=${form.comfort.tsvById?.[person.id] ?? 0}, 行为=${person.thermalBehavior}`).join('；');
  return `位置${form.climate.location}，气候分区${form.climate.climateType}，空间${form.building.spaceType}，空气温度${form.environment.airTemp}℃，相对湿度${form.environment.relativeHumidity}%，平均辐射温度${form.environment.meanRadiantTemp}℃，人员热舒适与行为：${personSummary}。目标：${form.target}。约束：${form.constraints}。`;
}
