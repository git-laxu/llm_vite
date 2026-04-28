import { useEffect, useRef, useState } from 'react';

const knowledgeTabs = [
  { id: 'knowledge', label: '知识库' },
  { id: 'sample', label: '样本库' }
];

const mainModules = [
  { id: 'strategy', label: '决策策略生成' },
  { id: 'projects', label: '项目与数据管理' }
];

export default function AppHeader({
  activeModule,
  activeKnowledgeTab,
  onChange,
  onKnowledgeTabChange
}) {
  const [knowledgeMenuOpen, setKnowledgeMenuOpen] = useState(false);
  const knowledgeMenuRef = useRef(null);

  const currentKnowledgeLabel =
    knowledgeTabs.find(item => item.id === activeKnowledgeTab)?.label || '知识库';

  function handleKnowledgeMainClick() {
    setKnowledgeMenuOpen(prev => !prev);
  }

  function handleKnowledgeTabClick(tabId) {
    onKnowledgeTabChange(tabId);
    setKnowledgeMenuOpen(false);
  }

  function handleMainModuleClick(moduleId) {
    onChange(moduleId);
    setKnowledgeMenuOpen(false);
  }

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!knowledgeMenuRef.current) return;

      if (!knowledgeMenuRef.current.contains(event.target)) {
        setKnowledgeMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentClick);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, []);

  return (
    <header className="app-header">
      <div className="app-header__title">
        <div className="app-logo">LLM</div>
        <div>
          <h1>建筑环境调节策略生成系统</h1>
          <p>知识增强、状态表征、策略生成与结果管理的一体化平台</p>
        </div>
      </div>

      <nav className="module-nav">
        <div className="module-nav__group" ref={knowledgeMenuRef}>
          <button
            type="button"
            className={`module-nav__item module-nav__item--dropdown ${activeModule === 'knowledge' ? 'is-active' : ''}`}
            onClick={handleKnowledgeMainClick}
          >
            <span>知识库与样本库构建</span>
            <span className="module-nav__sub-label">{currentKnowledgeLabel}</span>
            <span className={`module-nav__chevron ${knowledgeMenuOpen ? 'is-open' : ''}`}>⌄</span>
          </button>

          {knowledgeMenuOpen && (
            <div className="module-dropdown">
              <button
                type="button"
                className={`module-dropdown__item ${activeModule === 'knowledge' && activeKnowledgeTab === 'knowledge' ? 'is-active' : ''}`}
                onClick={() => handleKnowledgeTabClick('knowledge')}
              >
                <span className="module-dropdown__title">知识库</span>
                <span className="module-dropdown__desc">导入、管理、处理与向量化知识文件</span>
              </button>

              <button
                type="button"
                className={`module-dropdown__item ${activeModule === 'knowledge' && activeKnowledgeTab === 'sample' ? 'is-active' : ''}`}
                onClick={() => handleKnowledgeTabClick('sample')}
              >
                <span className="module-dropdown__title">样本库</span>
                <span className="module-dropdown__desc">构建、管理和导出策略生成样本</span>
              </button>
            </div>
          )}
        </div>

        {mainModules.map(item => (
          <button
            key={item.id}
            type="button"
            className={`module-nav__item ${activeModule === item.id ? 'is-active' : ''}`}
            onClick={() => handleMainModuleClick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}