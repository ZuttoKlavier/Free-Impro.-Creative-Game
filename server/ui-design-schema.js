// Shared by the administrator editor, the server validator and the app renderer.
// Selectors and CSS property names are fixed here; saved designs contain values only.
export const UI_PROPERTIES = {
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
    },
  },
  teacher: {
    label: '教师端', url: '/teacher.html',
    targets: {
      page: { label: '页面画布', selector: 'body', properties: ['backgroundColor', 'color', 'fontSize'] },
      main: { label: '内容区域', selector: 'main', properties: ['maxWidth', 'padding'] },
      header: { label: '顶部栏', selector: 'header', properties: [...surface, 'gap'] },
      title: { label: '页面标题', selector: '.intro h1', properties: ['color', 'fontSize', 'x', 'y'] },
      navigation: { label: '功能导航', selector: '.tabs', properties: [...surface, 'gap'] },
      panels: { label: '内容面板', selector: '.panel', properties: surface },
      primary: { label: '主要按钮', selector: '.primary', properties: button },
      secondary: { label: '次要按钮', selector: '.secondary', properties: button },
      classroom: { label: '课堂详情', selector: '.class-detail', properties: surface },
      scene: { label: '课堂场景', selector: '.teacher-scene', properties: [...surface, 'height'] },
      roster: { label: '作品等待区', selector: '.teacher-roster', properties: ['gap', 'padding'] },
      member: { label: '学生作品卡片', selector: '.member-card', properties: surface },
    },
  },
};

export const emptyDesign = () => ({ version: 1, pages: { student: {}, teacher: {} } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const allowedKeys = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));

export function validateDesign(value) {
  const invalid = () => { throw Object.assign(new Error('页面设置无效，请使用编辑器中的颜色和数值控件。'), { status: 400 }); };
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
        if (spec.type === 'color') {
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
      if (property === 'x' || property === 'y') return [];
      if (property === 'columns') return [`grid-template-columns:repeat(${value},minmax(0,1fr))!important`];
      return [`${spec.css}:${value}${spec.unit || ''}!important`];
    });
    if (Object.hasOwn(styles, 'x') || Object.hasOwn(styles, 'y')) declarations.push(`translate:${styles.x || 0}px ${styles.y || 0}px!important`);
    const selector = definition.targets[key].selector.split(',').map(part => `html[data-ui-page="${page}"] ${part.trim()}`).join(',');
    return `${selector}{${declarations.join(';')}}`;
  }).join('\n');
}
