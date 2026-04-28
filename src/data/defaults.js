export const defaultAppState = {
  knowledgeDomains: ['热环境调节', '光环境调节', '节能运行', '人体热舒适'],
  knowledgeTypes: ['论文', '标准', '结构化信息', '其它'],
  knowledgeItems: [],
  samples: [],
  projects: [],
  currentProjectId: null,
  histories: [],
  processing: {
    status: 'idle',
    chunks: 0,
    vectors: 0,
    lastTime: '暂无',
    logs: [],
    chunkSize: 800,
    chunkOverlap: 120,
    embeddingModel: 'text-embedding-3-small',
    vectorStoreName: 'thermal_strategy_kb',
    parsedChunks: [],
    vectorRecords: []
  },
  strategyForm: {
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
    // apiKey: '',
    // modelId: 'gpt-4o-mini',
    // temperature: 0.7,
    // topP: 0.9,
    // maxTokens: 1200
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    modelId: 'gpt-4o-mini',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 1200,
    knowledgeTopK: 5
  },
  strategyResult: null
};