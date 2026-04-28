import { useMemo, useState } from 'react';
import AppHeader from './components/AppHeader.jsx';
import KnowledgePage from './pages/KnowledgePage.jsx';
import StrategyPage from './pages/StrategyPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import Toast from './components/Toast.jsx';
import { loadState, saveState } from './services/storage.js';
import { defaultAppState } from './data/defaults.js';

function mergeAppState(defaultState, savedState) {
  if (!savedState) return defaultState;

  return {
    ...defaultState,
    ...savedState,
    knowledgeDomains: savedState.knowledgeDomains || defaultState.knowledgeDomains,
    knowledgeTypes: savedState.knowledgeTypes || savedState.knowledgeCategories || defaultState.knowledgeTypes,
    knowledgeItems: savedState.knowledgeItems || defaultState.knowledgeItems,
    samples: savedState.samples || defaultState.samples,
    projects: savedState.projects || defaultState.projects,
    histories: savedState.histories || defaultState.histories,
    processing: {
      ...defaultState.processing,
      ...(savedState.processing || {})
    },
    strategyForm: {
      ...defaultState.strategyForm,
      ...(savedState.strategyForm || {})
    }
  };
}

export default function App() {
  const [activeModule, setActiveModule] = useState('knowledge');
  const [activeKnowledgeTab, setActiveKnowledgeTab] = useState('knowledge');
  const [toast, setToast] = useState(null);

  const initial = useMemo(() => {
    return mergeAppState(defaultAppState, loadState());
  }, []);

  const [appState, setAppState] = useState(initial);

  function updateAppState(patch) {
    setAppState(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      saveState(next);
      return next;
    });
  }

  function notify(message, type = 'success') {
    setToast({ message, type, key: Date.now() });
  }

  function handleModuleChange(moduleId) {
    setActiveModule(moduleId);
  }

  function handleKnowledgeTabChange(tabId) {
    setActiveModule('knowledge');
    setActiveKnowledgeTab(tabId);
  }

  return (
    <div className="app">
      <AppHeader
        activeModule={activeModule}
        activeKnowledgeTab={activeKnowledgeTab}
        onChange={handleModuleChange}
        onKnowledgeTabChange={handleKnowledgeTabChange}
      />

      <main className="app-main">
        {activeModule === 'knowledge' && (
          <KnowledgePage
            state={appState}
            updateState={updateAppState}
            notify={notify}
            activeTab={activeKnowledgeTab}
            onTabChange={handleKnowledgeTabChange}
          />
        )}

        {activeModule === 'strategy' && (
          <StrategyPage
            state={appState}
            updateState={updateAppState}
            notify={notify}
          />
        )}

        {activeModule === 'projects' && (
          <ProjectsPage
            state={appState}
            updateState={updateAppState}
            notify={notify}
          />
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}