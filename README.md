# LLMdecision React + Vite 重构版

## 运行方式

```bash
npm install
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:8000
```

## 文件组织

```text
src/
  main.jsx
  App.jsx
  styles/
    base.css
    components.css
    pages/
      knowledge.css
      strategy.css
      projects.css
  components/
    AppHeader.jsx
    PageShell.jsx
    Panel.jsx
    Field.jsx
    Modal.jsx
    Toast.jsx
  pages/
    KnowledgePage.jsx
    StrategyPage.jsx
    ProjectsPage.jsx
  services/
    storage.js
    export.js
    llm.js
  data/
    defaults.js
```

## 修改样式的方法

- 改全局颜色、字体、按钮、输入框：`src/styles/base.css`
- 改通用卡片、顶部导航、弹窗、标签页：`src/styles/components.css`
- 改知识库页面：`src/styles/pages/knowledge.css`
- 改策略生成页面：`src/styles/pages/strategy.css`
- 改项目与数据管理页面：`src/styles/pages/projects.css`
