// Shared by the administrator editor, the server validator and the app renderer.
// Selectors and CSS property names are fixed here; saved designs contain values only.
export const UI_PROPERTIES = {
  text: { label: '文字内容', type: 'text', maxLength: 300 },
  backgroundColor: { label: '背景颜色', type: 'color', css: 'background-color' },
  color: { label: '文字颜色', type: 'color', css: 'color' },
  fontSize: { label: '字号', type: 'number', css: 'font-size', min: 10, max: 56, unit: 'px' },
  borderRadius: { label: '圆角', type: 'number', css: 'border-radius', min: 0, max: 100, unit: 'px' },
  padding: { label: '内部留白', type: 'number', css: 'padding', min: 0, max: 80, unit: 'px' },
  gap: { label: '元素间距', type: 'number', css: 'gap', min: 0, max: 80, unit: 'px' },
  width: { label: '宽度', type: 'number', css: 'width', min: 32, max: 1600, unit: 'px' },
  height: { label: '高度', type: 'number', css: 'height', min: 32, max: 1000, unit: 'px' },
  maxWidth: { label: '最大宽度', type: 'number', css: 'max-width', min: 280, max: 1800, unit: 'px' },
  x: { label: '水平偏移', type: 'number', min: -160, max: 160, unit: 'px' },
  y: { label: '垂直偏移', type: 'number', min: -160, max: 160, unit: 'px' },
  columns: { label: '每行数量', type: 'number', min: 1, max: 6, unit: '' },
};

const surface = ['backgroundColor', 'color', 'borderRadius', 'padding'];
const button = [...surface, 'fontSize', 'height', 'x', 'y'];
const copyTarget = (label, selector) => ({ label: '文字 · ' + label, selector, properties: ['text', 'color', 'fontSize', 'x', 'y'] });
const legacyTargets = {
  student: ['page', 'main', 'navigation', 'navigationItems', 'record', 'headings', 'library', 'sound', 'soundCards', 'primary', 'secondary', 'account', 'subpageCards'],
  teacher: ['page', 'main', 'header', 'title', 'navigation', 'panels', 'primary', 'secondary', 'classroom', 'scene', 'roster', 'member'],
};
export const UI_PAGES = {
  student: {
    label: '学生端', url: '/',
    targets: {
      page: { label: '页面画布', selector: 'body', properties: ['backgroundColor', 'color', 'fontSize'] },
      main: { label: '内容区域', selector: 'main', properties: ['maxWidth', 'padding'] },
      navigation: { label: '底部导航', selector: '.student-bottom-nav', properties: [...surface, 'gap', 'height'] },
      navigationItems: { label: '导航文字', selector: '.student-bottom-nav .nav-item', properties: ['color', 'fontSize', 'gap'] },
      record: { label: '录音按钮', selector: '.nav-record-disc', properties: ['backgroundColor', 'color', 'width', 'height', 'borderRadius', 'x', 'y'] },
      headings: { label: '页面标题', selector: '.library-tools h1, .my-heading h1', properties: ['color', 'fontSize', 'x', 'y'] },
      library: { label: '声音库排列', selector: '#library', properties: ['gap', 'columns'] },
      sound: { label: '声音图标', selector: '.sound-open', properties: [...surface, 'width', 'height'] },
      soundCards: { label: '作品卡片', selector: '.sound-card', properties: [...surface, 'gap'] },
      primary: { label: '主要按钮', selector: '.primary', properties: button },
      secondary: { label: '次要按钮', selector: '.secondary', properties: button },
      account: { label: '账号区域', selector: '#student-account-content', properties: surface },
      subpageCards: { label: '我的页面入口', selector: '.student-subpage-card', properties: [...surface, 'gap', 'fontSize'] },
      introTitle: copyTarget('首页标题', '.intro h1'),
      introDescription: copyTarget('首页说明', '.intro p'),
      libraryTitle: copyTarget('声音库标题', '.library-tools h1'),
      myTitle: copyTarget('我的页面标题', '.my-heading h1'),
      libraryLabel: copyTarget('库导航', '[data-ui-copy="library-nav"]'),
      recordLabel: copyTarget('录音导航', '#studio-tab > span:last-child'),
      myLabel: copyTarget('我的导航', '#classroom-tab > span'),
      recordTitle: copyTarget('录音面板标题', '.record-panel > h2'),
      recordDescription: copyTarget('录音说明', '.record-panel > p.muted'),
      editTitle: copyTarget('裁切面板标题', '.edit-panel > h2'),
      editDescription: copyTarget('裁切说明', '.edit-panel > p.muted'),
      emptyTitle: copyTarget('空白编辑区标题', '#editor-empty h3'),
      emptyDescription: copyTarget('空白编辑区说明', '#editor-empty p'),
      classroomLabel: copyTarget('我的课堂入口', '#open-my-classroom strong'),
      avatarLabel: copyTarget('我的形象入口', '#open-my-avatar strong'),
      classroomTitle: copyTarget('课堂页面标题', '.class-heading h2'),
      classroomDescription: copyTarget('课堂页面说明', '.class-heading p.muted'),
      footerMessage: copyTarget('页脚说明', 'main > footer > span:first-child'),
    },
  },
  teacher: {
    label: '教师端', url: '/teacher.html',
    targets: {
      page: { label: '页面画布', selector: 'body', properties: ['backgroundColor', 'color', 'fontSize'] },
      main: { label: '内容区域', selector: 'main', properties: ['maxWidth', 'padding'] },
      header: { label: '顶部栏', selector: 'header', properties: [...surface, 'gap'] },
      title: { label: '页面标题', selector: '.intro h1', properties: ['text', 'color', 'fontSize', 'x', 'y'] },
      navigation: { label: '功能导航', selector: '.tabs', properties: [...surface, 'gap'] },
      panels: { label: '内容面板', selector: '.panel', properties: surface },
      primary: { label: '主要按钮', selector: '.primary', properties: button },
      secondary: { label: '次要按钮', selector: '.secondary', properties: button },
      classroom: { label: '课堂详情', selector: '.class-detail', properties: surface },
      scene: { label: '课堂场景', selector: '.teacher-scene', properties: [...surface, 'height'] },
      roster: { label: '作品等待区', selector: '.teacher-roster', properties: ['gap', 'padding'] },
      member: { label: '学生作品卡片', selector: '.member-card', properties: surface },
      introDescription: copyTarget('首页说明', '.intro p'),
      classroomLabel: copyTarget('课堂功能按钮', '#classroom-tab'),
      classroomTitle: copyTarget('课堂页面标题', '.class-heading h2'),
      classroomDescription: copyTarget('课堂页面说明', '.class-heading p.muted'),
      createTitle: copyTarget('创建课堂标题', '#create-form h3'),
      createLabel: copyTarget('创建课堂按钮', '#create-form > button'),
      classListTitle: copyTarget('课堂列表标题', '.class-list-heading h3'),
      refreshLabel: copyTarget('刷新按钮', '#refresh-class'),
      rhythmTitle: copyTarget('节奏面板标题', '#rhythm-title'),
      rhythmDescription: copyTarget('节奏面板说明', '.rhythm-heading p.muted'),
      footerMessage: copyTarget('页脚说明', 'main > footer > span:last-child'),
    },
  },
};

export const emptyDesign = () => ({ version: 1, pages: { student: {}, teacher: {} } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const allowedKeys = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));

export function validateDesign(value) {
  const invalid = () => { throw Object.assign(new Error('页面设置无效，请使用编辑器中的文字、颜色和数值控件。'), { status: 400 }); };
  if (!allowedKeys(value, ['version', 'pages']) || value.version !== 1 || !allowedKeys(value.pages, Object.keys(UI_PAGES))) invalid();
  const result = emptyDesign();
  for (const [page, definition] of Object.entries(UI_PAGES)) {
    const targets = Object.hasOwn(value.pages, page) ? value.pages[page] : {};
    if (!allowedKeys(targets, Object.keys(definition.targets))) invalid();
    for (const [target, styles] of Object.entries(targets)) {
      if (!allowedKeys(styles, definition.targets[target].properties)) invalid();
      const clean = {};
      for (const [property, input] of Object.entries(styles)) {
        const spec = UI_PROPERTIES[property];
        if (spec.type === 'text') {
          if (typeof input !== 'string' || input.length > spec.maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input)) invalid();
          clean[property] = input.replace(/\r\n?/g, '\n');
        } else if (spec.type === 'color') {
          if (typeof input !== 'string' || !/^#[0-9a-f]{6}$/i.test(input)) invalid();
          clean[property] = input.toLowerCase();
        } else {
          if (!Number.isInteger(input) || input < spec.min || input > spec.max) invalid();
          clean[property] = input;
        }
      }
      if (Object.keys(clean).length) result.pages[page][target] = clean;
    }
  }
  return result;
}

export function designCSS(design, page) {
  const safe = validateDesign(design);
  const definition = UI_PAGES[page];
  if (!definition) return '';
  return Object.entries(safe.pages[page]).map(([key, styles]) => {
    const declarations = Object.entries(styles).flatMap(([property, value]) => {
      const spec = UI_PROPERTIES[property];
      if (spec.type === 'text') return ['white-space:pre-line!important'];
      if (property === 'x' || property === 'y') return [];
      if (property === 'columns') return [`grid-template-columns:repeat(${value},minmax(0,1fr))!important`];
      return [`${spec.css}:${value}${spec.unit || ''}!important`];
    });
    if (Object.hasOwn(styles, 'x') || Object.hasOwn(styles, 'y')) declarations.push(`translate:${styles.x || 0}px ${styles.y || 0}px!important`);
    const selector = definition.targets[key].selector.split(',').map(part => `html[data-ui-page="${page}"] ${part.trim()}`).join(',');
    return `${selector}{${declarations.join(';')}}`;
  }).join('\n');
}

// Older cached webpages and installed students reject unknown fields/targets.
// Keep their existing appearance readable until they include text support.
export function legacyDesign(design) {
  const safe = validateDesign(design), result = emptyDesign();
  for (const [page, targets] of Object.entries(legacyTargets)) for (const target of targets) {
    const values = Object.fromEntries(Object.entries(safe.pages[page][target] || {}).filter(([name]) => name !== 'text'));
    if (Object.keys(values).length) result.pages[page][target] = values;
  }
  return result;
}
