let restoreMenu = document.querySelector('[data-status-restore-menu]');
if (!restoreMenu) {
  restoreMenu = document.createElement('div');
  restoreMenu.dataset.statusRestoreMenu = 'true';
  restoreMenu.style.cssText = `
    position: fixed;
    z-index: 10000;
    min-width: 200px;
    padding: 4px;
    display: none;
    border-radius: 6px;
  `;

  document.body.appendChild(restoreMenu);
}

(function () {
  const statusBar = document.querySelector('.status-bar');
  if (!statusBar) return;

  const STORAGE_KEY = 'obsidian-status-bar-layout';

  // 状态
  let dragEnabled = false;
  let draggedEl = null;

  /* ===============================
     小工具 & 辅助函数（Helpers）
     把通用的工具函数集中放在一起，便于维护
  =============================== */

  /**
   * 简便创建 div 并设置文本/样式
   * @param {string} [text]
   * @param {string} [css]
   * @returns {HTMLDivElement}
   */
  function createDiv(text, css) {
    const d = document.createElement('div');
    if (text) d.textContent = text;
    if (css) d.style.cssText = css;
    return d;
  }

  /** 保存当前 statusBar 布局（顺序 + 可见性）到 localStorage */
  function saveLayout() {
    const data = [...statusBar.children]
      .filter(el => el !== sortBtn)
      .map(el => ({
        class: el.className,
        hidden: el.style.display === 'none'
      }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /** 从 localStorage 恢复布局 */
  function restoreLayout() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      data.forEach(item => {
        const el = [...statusBar.children].find(e => e.className === item.class);
        if (!el) return;
        statusBar.appendChild(el);
        if (item.hidden) el.style.display = 'none';
      });
    } catch (err) {
      console.warn('restoreLayout parse error', err);
    }
  }

  /** 获取 statusBar 的样式变量（颜色等） */
  function getStatusBarColor(prop) {
    return getComputedStyle(statusBar).getPropertyValue(prop);
  }

  /* ===============================
     恢复菜单（Restore Menu）
  =============================== */

  //菜单展示优化
  function getDisplayName(el) {
    // 1. 尝试从 class 里提取
    if (el.className && typeof el.className === 'string') {
      const classes = el.className
        .split(/\s+/)
        .filter(c => c && c !== 'status-bar-item');

      if (classes.length) {
        return classes.join(' ');
      }
    }

    // 2. 回退到 aria / title
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;

    const title = el.getAttribute('title');
    if (title) return title;

    // 3. 再回退到文本
    const text = el.textContent?.trim();
    if (text) return text;

    // 4. 最终兜底
    return '(unknown item)';
  }

  /** 打开“状态栏元素显示控制”菜单 */
  //
  function openRestoreMenu() {
    restoreMenu.innerHTML = '';
    restoreMenu.style.display = 'block';
    restoreMenu.style.flexDirection = 'column';

    const rows = [...statusBar.children]
      .filter(el => el !== sortBtn && el.dataset.alwaysVisible !== 'true')
      .map(el => ({ el, name: getDisplayName(el) }));

    rows.forEach(({ el, name }) => {
      const row = document.createElement('div');
      row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px;
      gap: 8px;
      border-radius: 4px;
      cursor: grab;
    `;
      row.draggable = true;

      const label = document.createElement('div');
      label.textContent = name;
      label.style.cssText = `
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 260px;
    `;
      label.style.flex = '1';
      label.style.userSelect = 'none';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = el.style.display !== 'none';
      checkbox.onchange = () => {
        el.style.display = checkbox.checked ? '' : 'none';
        saveLayout();
      };

      row.appendChild(label);
      row.appendChild(checkbox);
      restoreMenu.appendChild(row);

      // ====== 拖拽逻辑 ======
      row.addEventListener('dragstart', e => {
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', null); // required for Firefox
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
      });

      row.addEventListener('dragover', e => {
        e.preventDefault();
        const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        const dragging = restoreMenu.querySelector('.dragging');
        if (!dragging || dragging === row) return;
        restoreMenu.insertBefore(dragging, after ? row.nextSibling : row);
      });

      row.addEventListener('drop', () => {
        // 拖拽完成后同步 status-bar 顺序
        const newOrder = [...restoreMenu.children].map(r => {
          return rows.find(item => item.name === r.querySelector('div').textContent)?.el;
        }).filter(Boolean);

        newOrder.forEach(el => statusBar.appendChild(el));
        saveLayout();
      });
    });

    // 样式
    restoreMenu.style.color = getStatusBarColor('color');
    restoreMenu.style.background = getStatusBarColor('background-color');
    restoreMenu.style.border = `1px solid ${getStatusBarColor('border-color') || 'currentColor'}`;
    restoreMenu.style.borderRadius = '6px';
    restoreMenu.style.padding = '4px';

    const rect = sortBtn.getBoundingClientRect();
    restoreMenu.style.left = rect.left + 'px';
    restoreMenu.style.top = rect.top - restoreMenu.offsetHeight - 8 + 'px';
  }



  // 点击其他位置时关闭菜单
  function closeRestoreMenu() {
    restoreMenu.style.display = 'none';
  }
  document.addEventListener('click', e => {
    if (!restoreMenu.contains(e.target) && e.target !== sortBtn) closeRestoreMenu();
  });

  /* ===============================
     Tooltip（悬浮提示）
  =============================== */

  const tooltip = createDiv('', `
    position: fixed;
    padding: 4px 8px;
    font-size: 12px;
    border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 9999;
    display: none;
  `);
  document.body.appendChild(tooltip);

  /** 在目标元素上显示 tooltip */
  function showTooltipForElement(text, el) {
    const barRect = statusBar.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    tooltip.textContent = text;
    tooltip.style.color = getStatusBarColor('color');
    tooltip.style.background = getStatusBarColor('background-color');
    tooltip.style.border = `1px solid ${getStatusBarColor('border-color') || 'currentColor'}`;
    tooltip.style.display = 'block';

    const tipRect = tooltip.getBoundingClientRect();
    tooltip.style.left = elRect.left + elRect.width / 2 - tipRect.width / 2 + 'px';
    tooltip.style.top = barRect.top - tipRect.height - 8 + 'px';
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  /* ===============================
     排列按钮（Sort Button）
  =============================== */


  let sortBtn = document.querySelector('.status-bar-sort-btn');
  if (!sortBtn) {
    sortBtn = document.createElement('div');
    sortBtn.textContent = '🧲';
    sortBtn.classList.add('status-bar-item', 'mod-clickable', 'mod-primary', 'status-bar-sort-btn');
    sortBtn.dataset.alwaysVisible = 'true';
    sortBtn.style.userSelect = 'none';
    sortBtn.style.cursor = 'pointer';
    statusBar.prepend(sortBtn);


    sortBtn.addEventListener('mouseenter', () => showTooltipForElement('排列状态栏', sortBtn));
    sortBtn.addEventListener('mouseleave', hideTooltip);

    sortBtn.addEventListener('click', () => {
      dragEnabled = !dragEnabled;
      sortBtn.textContent = dragEnabled ? '✔' : '🧲';
      [...statusBar.children].forEach(el => {
        if (el === sortBtn) return;
        el.draggable = dragEnabled;
        el.style.cursor = dragEnabled ? 'move' : '';
      });
    });
    sortBtn.addEventListener('contextmenu', e => {
      e.preventDefault();
      openRestoreMenu();
    });

    /* ===============================
       拖拽排序（Drag & Drop）
    =============================== */

    statusBar.addEventListener('dragstart', e => {
      if (!dragEnabled) return;
      draggedEl = e.target;
      e.target.style.opacity = '0.5';
    });

    statusBar.addEventListener('dragend', e => {
      e.target.style.opacity = '';
      draggedEl = null;
      saveLayout();
    });

    statusBar.addEventListener('dragover', e => {
      if (!dragEnabled) return;
      e.preventDefault();
      const target = e.target.closest('.status-bar > *');
      if (!target || target === draggedEl || target === sortBtn) return;
      const rect = target.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      statusBar.insertBefore(draggedEl, after ? target.nextSibling : target);
    });

    /* ===============================
       Hover 控件：显示删除按钮 + tooltip
    =============================== */

    /**
     * 为 status bar 子元素附加 hover 行为（删除按钮与 tooltip）
     * @param {HTMLElement} el
     */
    function attachHover(el) {
      el.style.position = 'relative';

      const del = createDiv('×', `
      position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:12px;cursor:pointer;background:${getStatusBarColor('background-color')};color:${getStatusBarColor('color')};border:1px solid currentColor;`
      );

      del.onclick = e => {
        e.stopPropagation();
        el.style.display = 'none';
        saveLayout();
      };

      el.appendChild(del);

      el.addEventListener('mouseenter', () => {
        if (!dragEnabled) return;
        del.style.display = 'flex';
        showTooltipForElement(`class=\"${el.className}\"`, el);
      });
      el.addEventListener('mouseleave', () => {
        del.style.display = 'none';
        hideTooltip();
      });
    }

    [...statusBar.children].forEach(el => {
      if (el !== sortBtn) attachHover(el);
    });

    /* ===============================
       初始化：恢复之前保存的布局
    =============================== */
    restoreLayout();
  }
})();
