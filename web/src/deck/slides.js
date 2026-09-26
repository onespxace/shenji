// 功能介绍 PPT 的幻灯片内容（纯数据）。
// 抽成独立模块的好处：可以用 scripts/validate-deck.mjs 断言结构完整性，
// 避免出现空标题、缺页码说明这类低级错误。

export const DECK_META = {
  title: '审计工作台',
  subtitle: 'AuditDesk · 财经审计教学与实务工具',
  presenter: '审计学本科 2501 班',
  version: 'v2.2',
  updated: '2026-09'
}

export const SLIDES = [
  {
    id: 'cover',
    kind: 'cover',
    eyebrow: '财经审计 · 确定性优先',
    title: '审计工作台',
    subtitle: 'AuditDesk · 面向审计学生与内审人员的本地优先工作台',
    meta: ['版本 v2.2', '浏览器本地运行', '数据不上传']
  },
  {
    id: 'pain',
    kind: 'bullets',
    eyebrow: '问题',
    title: '审计实务的四个现实痛点',
    lead: '工具很多，但大多数解决不了“上手”这一步。',
    bullets: [
      { head: '数据散在各系统', text: '银行流水、发票、工资表格式各异，手工整理耗时且容易出错。' },
      { head: '程序靠记忆', text: '做完就忘，缺少可复现、可留痕的执行工具。' },
      { head: '异常靠直觉', text: '经验判断难以标准化，不同人结论差异大。' },
      { head: 'AI 不敢用', text: '直接问模型怕被编造的条款带偏，不敢写入底稿。' }
    ]
  },
  {
    id: 'principles',
    kind: 'cards',
    eyebrow: '定位',
    title: '四条设计原则',
    lead: '先划清边界，再谈功能。',
    cards: [
      { title: '确定性优先', text: '规则透明、参数可解释、结果可复现，不用黑箱打分。' },
      { title: '证据优先', text: '异常只是待复核线索，不自动变成错报或舞弊结论。' },
      { title: '本地优先', text: '原始文件不上传，工作区状态只存在你自己的浏览器。' },
      { title: '专业边界', text: '不提供审计意见、税务意见，不自动过账或定性舞弊。' }
    ]
  },
  {
    id: 'overview',
    kind: 'modules',
    eyebrow: '全景',
    title: '六个模块，一套工作流',
    lead: '从导入数据到留存底稿，再到辅助整理思路。',
    modules: [
      { name: '数据分析', desc: '8 个确定性审计程序', icon: 'chart' },
      { name: '会计基础', desc: '科目分类 · 基础问答 · 凭证检查', icon: 'ticket' },
      { name: '底稿文书', desc: '询证函 · 监盘表 · 调整汇总', icon: 'doc' },
      { name: '法规速查', desc: '准则与错报要点离线检索', icon: 'search' },
      { name: 'AI 问答', desc: '四大服务商 · Markdown 渲染', icon: 'chat' },
      { name: '使用教程', desc: '上手步骤与可运行用例', icon: 'book' }
    ]
  },
  {
    id: 'tools',
    kind: 'table',
    eyebrow: '模块一',
    title: '数据分析：8 个确定性程序',
    lead: '同一份数据与参数，必然得到同一结果。',
    columns: ['程序', '检查内容', '典型发现'],
    rows: [
      ['本福特定律', '首位数字分布与卡方统计量', '人为干预区间'],
      ['重复检查', '关键字段重复记录', '重复报销、重复付款'],
      ['断号检查', '编号连续性', '凭证被抽走或替换'],
      ['账龄分析', '按日期分层与金额合计', '长期挂账、减值不足'],
      ['分层汇总', '分组求和与总体合计', '类别间异常背离'],
      ['审计抽样', '样本量与固定种子抽取', '可复现的选样记录'],
      ['凭证筛查', '周末、整数、大额、空摘要', '管理层凌驾线索'],
      ['试算平衡', '借贷合计与差额', '不平衡分录']
    ]
  },
  {
    id: 'accounting',
    kind: 'split',
    eyebrow: '模块二',
    title: '会计基础：把口径记准',
    lead: '输入任意科目名称或四位代码，立即得到所属大类。',
    left: {
      title: '能做什么',
      items: [
        '89 个常用科目，六大类归属一一对应',
        '代码、名称、关键字三种方式均可识别',
        '明确区分“科目六大类”与“会计六要素”',
        '速答六要素、三大报表、税率、利润公式'
      ]
    },
    right: {
      title: '常见误区',
      items: [
        '损益类同时承载收入与费用，不是单一要素',
        '成本类与共同类不属于六要素中的任何一项',
        '“利润”没有对应科目，本年利润属所有者权益类',
        '增值税优惠有时效，须按业务发生时点核对'
      ]
    }
  },
  {
    id: 'voucher',
    kind: 'split',
    eyebrow: '模块二',
    title: '凭证检查：上传图片即可核对',
    lead: '10 项形式要素检查，浏览器本地 OCR，图片不上传。',
    left: {
      title: '检查项',
      items: [
        '凭证日期 · 凭证编号 · 经济业务摘要',
        '会计科目（并归入六大类）',
        '借方金额 · 贷方金额 · 借贷平衡',
        '大写金额与阿拉伯数字交叉校验',
        '附件张数 · 制单/审核/记账签名'
      ]
    },
    right: {
      title: '不判断的事',
      items: [
        '签名与签章真伪、是否本人签署',
        '涂改、划线、擦除与事后补记痕迹',
        '发票票据真实性与是否原件',
        '审批权限与业务授权是否合规',
        '关联方、舞弊与经济实质风险'
      ]
    }
  },
  {
    id: 'ai',
    kind: 'cards',
    eyebrow: '模块五',
    title: 'AI 问答：辅助而非替代',
    lead: '按审计助手系统提示作答，输出仅供思路参考。',
    cards: [
      { title: '四大服务商', text: 'DeepSeek、Gemini、Ollama、本地自定义 OpenAI 兼容接口。' },
      { title: 'Markdown 渲染', text: '标题、列表、表格、代码块完整呈现，消息流限宽 768px。' },
      { title: '流式输出', text: '逐字返回并带光标提示，长回答不等待。' },
      { title: 'Key 只存本地', text: '保存在浏览器 localStorage，不写入仓库。' }
    ]
  },
  {
    id: 'mobile',
    kind: 'split',
    eyebrow: '工程',
    title: '移动端：同一套功能的另一种密度',
    lead: '桌面与手机不是两个产品。',
    left: {
      title: '做了什么',
      items: [
        '底部标签栏取代横向滚动导航',
        '“更多”面板收纳次要入口',
        '会话列表改为侧滑抽屉',
        '宽表格在容器内横向滚动，不撑破页面',
        '触控目标不小于 44px'
      ]
    },
    right: {
      title: '精简掉了什么',
      items: [
        '英文 eyebrow 等装饰性文字',
        '页头标签与多余装饰线',
        '低频入口折叠进“更多”',
        '嵌套滚动，改为单一滚动区'
      ]
    }
  },
  {
    id: 'typography',
    kind: 'table',
    eyebrow: '规范',
    title: '可读性：按标准重建字号',
    lead: '中文在 11px 下实际不可读，这是重排的起点。',
    columns: ['依据', '要求', '本项目做法'],
    rows: [
      ['WCAG 1.4.4', '文字可放大到 200%', '全部字号使用 rem'],
      ['WCAG 1.4.12', '行高 ≥ 1.5 倍字号', '正文行高 1.65'],
      ['W3C Design System', '正文基准 16px', '界面正文 15px / 阅读 16px'],
      ['Major Second 阶梯', '1.125 比例并对齐 4px', '12 / 14 / 15 / 16 / 17 / 20 / 22 / 34'],
      ['行业通行做法', '12px 仅用于小标签', '全局无小于 12px 的文字']
    ]
  },
  {
    id: 'quality',
    kind: 'metrics',
    eyebrow: '质量',
    title: '每个功能都有自动化断言',
    lead: '文档与实际行为不允许脱节。',
    metrics: [
      { value: '8/8', label: '审计程序样例' },
      { value: '35/35', label: '会计与凭证断言' },
      { value: '28/28', label: 'Markdown 渲染' },
      { value: '20/20', label: '教学用例自检' },
      { value: '0', label: '小于 12px 的字号' }
    ],
    note: '断言全部由 npm run validate:all 执行，GitHub Actions 每次推送都会跑。'
  },
  {
    id: 'cases',
    kind: 'bullets',
    eyebrow: '演示',
    title: '可运行的审计用例',
    lead: '每条用例都自带样例数据，点一下就能跑出预期结果。',
    bullets: [
      { head: '同一张发票被报销两次', text: '重复检查识别 2 组重复发票号，各 2 条记录。' },
      { head: '记账凭证编号断号', text: '编号范围 1–10，精准指出缺失的 3 与 8。' },
      { head: '期末手工分录借贷不平', text: '借方 501,000.00，贷方 499,500.00，差额 1,500.00。' },
      { head: '摘要含糊的大额整数分录', text: '同时命中大额、空摘要、整数与节假日四类线索。' },
      { head: '大写金额被改动', text: '大写“贰拾万元整”与小写 300,000.00 冲突，立即报错。' }
    ]
  },
  {
    id: 'deploy',
    kind: 'split',
    eyebrow: '交付',
    title: '一条命令上线',
    lead: '静态站点，GitHub Pages 自动部署。',
    left: {
      title: '仓库结构',
      items: [
        'web/  Vue 3 网页版源码',
        'resources/ 审计知识库与本地模型',
        'docs/ 规范与变更记录',
        'scripts/ 断言与资源同步脚本'
      ]
    },
    right: {
      title: '自动化',
      items: [
        '推送后 Actions 自动跑断言',
        '通过后自动构建并发布 Pages',
        'OCR 资源按需生成，不进仓库',
        '同时提供手动上传的静态目录与 ZIP'
      ]
    }
  },
  {
    id: 'closing',
    kind: 'closing',
    eyebrow: '结语',
    title: '工具负责确定性，判断留给人',
    lead: '把重复劳动交给规则，把职业判断留给审计人。',
    points: [
      '所有异常都是待复核线索，不是结论',
      '所有 AI 输出都需要准则与证据支撑',
      '所有数字都能复现，所有结论都能追溯'
    ],
    footer: '郑州工商学院 · 审计学本科 2501 班'
  }
]

export const DECK_HINTS = [
  { keys: '← → / 空格', text: '翻页' },
  { keys: 'Home / End', text: '首页 / 末页' },
  { keys: 'O', text: '总览' },
  { keys: 'F', text: '全屏' },
  { keys: 'Esc', text: '退出总览' }
]
