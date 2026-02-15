import { Plugin, Notice } from 'obsidian';

interface StatusBarItemSnapshot {
    class: string;
    hidden: boolean;
}

export default class CustomOrderPlugin extends Plugin {
    private statusBar: HTMLElement | null = null;
    private restoreMenu: HTMLElement | null = null;
    private tooltip: HTMLElement | null = null;
    private dragEnabled = false;
    private draggedEl: HTMLElement | null = null;
    private placeholder: HTMLElement | null = null;
    private historyStack: StatusBarItemSnapshot[][] = [];
    private defaultOrder: StatusBarItemSnapshot[] = [];
    private isUIActive = false;
    private originalOrder: HTMLElement[] = [];
    
    private readonly STORAGE_KEY = 'obsidian-status-bar-layout';
    private readonly HISTORY_LIMIT = 20;

    async onload() {
        this.addRibbonIcon('list-ordered', 'Custom Status Bar Order', () => {
            this.toggleUI();
        });

        this.addCommand({
            id: 'toggle-status-bar-sort',
            name: 'Toggle Status Bar Sorting',
            callback: () => {
                this.toggleUI();
            }
        });

        this.addCommand({
            id: 'open-restore-menu',
            name: 'Open Status Bar Restore Menu',
            callback: () => {
                if (!this.isUIActive) {
                    this.showUI();
                }
                this.openRestoreMenu();
            }
        });

        this.app.workspace.onLayoutReady(() => {
            this.statusBar = document.querySelector('.status-bar');
            this.restoreLayout();
        });
    }

    onunload() {
        this.hideUI();
        this.restoreMenu?.remove();
        this.tooltip?.remove();
        this.placeholder?.remove();
        
        const styleEl = document.getElementById('status-sorting-override-style');
        styleEl?.remove();
    }

    private toggleUI() {
        if (this.isUIActive) {
            this.hideUI();
        } else {
            this.showUI();
        }
    }

    private showUI() {
        if (this.isUIActive || !this.statusBar) return;
        this.isUIActive = true;

        this.createRestoreMenu();
        this.createTooltip();
        this.createPlaceholder();
        this.createOverrideStyles();
        this.saveDefaultOrder();
        this.attachHoverToChildren();
        this.setupDragListeners();
        this.updateSortingVisuals();
        
        this.openRestoreMenu();
    }

    private hideUI() {
        if (!this.isUIActive) return;
        this.isUIActive = false;
        this.dragEnabled = false;

        this.closeRestoreMenu();

        if (this.placeholder) {
            this.placeholder.remove();
            this.placeholder = null;
        }

        if (this.statusBar) {
            [...this.statusBar.children].forEach(el => {
                (el as HTMLElement).draggable = false;
                (el as HTMLElement).style.cursor = '';
                (el as HTMLElement).style.outline = '';
                (el as HTMLElement).style.outlineOffset = '';
                (el as HTMLElement).style.position = '';
                (el as HTMLElement).style.transition = '';
                el.classList.remove('status-sorting-disable-hover');
                el.querySelectorAll('[data-status-close-btn]').forEach(btn => btn.remove());
            });
        }

        this.originalOrder = [];
    }

    private createPlaceholder() {
        this.placeholder = document.createElement('div');
        this.placeholder.className = 'status-bar-drag-placeholder';
        this.placeholder.style.cssText = `
            display: none;
            border: 2px dashed var(--text-muted, #888);
            background: var(--background-modifier-hover, rgba(0,0,0,0.1));
            border-radius: 4px;
            min-width: 20px;
            height: 24px;
            margin: 0 2px;
            flex-shrink: 0;
            transition: all 150ms ease;
        `;
    }

    private createRestoreMenu() {
        this.restoreMenu = document.querySelector('[data-status-restore-menu]');
        if (!this.restoreMenu) {
            this.restoreMenu = document.createElement('div');
            this.restoreMenu.dataset.statusRestoreMenu = 'true';
            this.restoreMenu.style.cssText = `
                position: fixed;
                z-index: 10000;
                min-width: 200px;
                padding: 4px;
                display: none;
                border-radius: 6px;
            `;
            document.body.appendChild(this.restoreMenu);
        }
    }

    private createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.style.cssText = `
            position: fixed;
            padding: 4px 8px;
            font-size: 12px;
            border-radius: 4px;
            pointer-events: none;
            white-space: nowrap;
            z-index: 9999;
            display: none;
        `;
        document.body.appendChild(this.tooltip);
    }

    private createOverrideStyles() {
        if (!document.getElementById('status-sorting-override-style')) {
            const s = document.createElement('style');
            s.id = 'status-sorting-override-style';
            s.textContent = `
                .status-bar-item.is-dragging {
                    opacity: 0.5;
                    transform: scale(0.95);
                }
            `;
            document.head.appendChild(s);
        }
    }

    private saveDefaultOrder() {
        if (!this.statusBar) return;
        this.defaultOrder = [...this.statusBar.children]
            .filter(el => (el as HTMLElement).dataset.alwaysVisible !== 'true')
            .map(el => ({
                class: el.className,
                hidden: (el as HTMLElement).style.display === 'none'
            }));
    }

    private saveLayout() {
        if (!this.statusBar) return;
        const data = [...this.statusBar.children]
            .map(el => ({
                class: el.className,
                hidden: (el as HTMLElement).style.display === 'none'
            }));
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }

    private restoreLayout() {
        if (!this.statusBar) return;
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return;
        try {
            const data = JSON.parse(raw) as StatusBarItemSnapshot[];
            data.forEach(item => {
                const el = [...this.statusBar!.children].find(e => e.className === item.class);
                if (!el) return;
                this.statusBar!.appendChild(el);
                if (item.hidden) (el as HTMLElement).style.display = 'none';
            });
        } catch (err) {
            console.warn('restoreLayout parse error', err);
        }
    }

    private getStatusBarColor(prop: string): string {
        if (!this.statusBar) return '';
        return getComputedStyle(this.statusBar).getPropertyValue(prop);
    }

    private updateSortingVisuals() {
        if (!this.statusBar) return;

        [...this.statusBar.children].forEach(el => {
            (el as HTMLElement).onmouseenter = null;
            (el as HTMLElement).onmouseleave = null;

            if (this.dragEnabled) {
                (el as HTMLElement).onmouseenter = () => {
                    (el as HTMLElement).style.outline = `2px solid ${this.getStatusBarColor('border-color') || 'currentColor'}`;
                    (el as HTMLElement).style.outlineOffset = '-2px';
                };
                (el as HTMLElement).onmouseleave = () => {
                    (el as HTMLElement).style.outline = '';
                    (el as HTMLElement).style.outlineOffset = '';
                };
                el.classList.add('status-sorting-disable-hover');
            } else {
                el.classList.remove('status-sorting-disable-hover');
                (el as HTMLElement).style.outline = '';
                (el as HTMLElement).style.outlineOffset = '';
            }
        });
    }

    private getDisplayName(el: Element): string {
        if (el.className && typeof el.className === 'string') {
            const classes = el.className
                .split(/\s+/)
                .filter(c => c && c !== 'status-bar-item');
            if (classes.length) {
                return classes.join(' ');
            }
        }

        const aria = el.getAttribute('aria-label');
        if (aria) return aria;

        const title = el.getAttribute('title');
        if (title) return title;

        const text = el.textContent?.trim();
        if (text) return text;

        return '(unknown item)';
    }

    private openRestoreMenu() {
        if (!this.restoreMenu || !this.statusBar) return;

        this.restoreMenu.innerHTML = '';

        const actionBar = document.createElement('div');
        actionBar.style.cssText = `
            display: flex;
            gap: 8px;
            padding: 4px 6px;
            font-size: 12px;
            border-bottom: 1px solid ${this.getStatusBarColor('border-color') || 'currentColor'};
        `;

        const actionBtn = (text: string, handler: () => void) => {
            const b = document.createElement('div');
            b.textContent = text;
            b.style.cssText = `
                cursor: pointer;
                user-select: none;
            `;
            b.onclick = handler;
            return b;
        };

        const dragBtn = document.createElement('div');
        dragBtn.textContent = this.dragEnabled ? '✔ 拖拽' : '🧲 拖拽';
        dragBtn.style.cssText = `
            cursor: pointer;
            user-select: none;
            font-weight: bold;
        `;
        dragBtn.onclick = () => {
            this.dragEnabled = !this.dragEnabled;
            this.statusBar!.classList.toggle('is-sorting', this.dragEnabled);

            [...this.statusBar!.children].forEach(el => {
                (el as HTMLElement).draggable = this.dragEnabled;
                (el as HTMLElement).style.cursor = this.dragEnabled ? 'move' : '';
            });

            this.updateSortingVisuals();
            this.openRestoreMenu();
        };

        const closeBtn = document.createElement('div');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = `
            cursor: pointer;
            user-select: none;
            margin-left: auto;
        `;
        closeBtn.onclick = () => {
            this.closeRestoreMenu();
            this.hideUI();
        };

        const rows = [...this.statusBar.children]
            .filter(el => (el as HTMLElement).dataset.alwaysVisible !== 'true')
            .map(el => ({ el: el as HTMLElement, name: this.getDisplayName(el) }));

        actionBar.appendChild(actionBtn('全选', () => {
            this.pushHistory();
            rows.forEach(({ el }) => (el.style.display = ''));
            this.saveLayout();
            this.openRestoreMenu();
        }));

        actionBar.appendChild(actionBtn('全不选', () => {
            this.pushHistory();
            rows.forEach(({ el }) => (el.style.display = 'none'));
            this.saveLayout();
            this.openRestoreMenu();
        }));

        actionBar.appendChild(actionBtn('恢复默认', () => {
            this.pushHistory();
            this.applySnapshot(this.defaultOrder);
            this.openRestoreMenu();
        }));

        actionBar.appendChild(actionBtn('撤销', () => {
            const last = this.historyStack.pop();
            if (!last) return;
            this.applySnapshot(last);
            this.openRestoreMenu();
        }));

        actionBar.appendChild(dragBtn);
        actionBar.appendChild(closeBtn);

        this.restoreMenu.appendChild(actionBar);

        this.restoreMenu.style.display = 'block';
        this.restoreMenu.style.flexDirection = 'column';

        const updateRowNumbers = () => {
            const rowsInMenu = Array.from(this.restoreMenu!.querySelectorAll('.status-item-row'));
            rowsInMenu.forEach((row, index) => {
                const label = row.querySelector('.item-label');
                const text = label!.textContent!.replace(/^\d+\.\s*/, '');
                label!.textContent = `${index + 1}. ${text}`;
            });
        };

        rows.forEach(({ el, name }, index) => {
            const row = document.createElement('div');
            row.className = 'status-item-row';
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
            label.className = 'item-label';
            label.textContent = `${index + 1}. ${name}`;
            label.style.cssText = `
                font-size: 12px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 260px;
                flex: 1;
                user-select: none;
            `;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = el.style.display !== 'none';
            checkbox.onchange = () => {
                this.pushHistory();
                el.style.display = checkbox.checked ? '' : 'none';
                this.saveLayout();
            };

            row.appendChild(label);
            row.appendChild(checkbox);
            this.restoreMenu!.appendChild(row);

            row.addEventListener('dragstart', e => {
                row.classList.add('dragging');
                e.dataTransfer!.effectAllowed = 'move';
                e.dataTransfer!.setData('text/plain', '');
            });

            row.addEventListener('dragend', () => {
                row.classList.remove('dragging');
                setTimeout(updateRowNumbers, 0);
            });

            row.addEventListener('dragover', e => {
                e.preventDefault();
                const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
                const dragging = this.restoreMenu!.querySelector('.dragging');
                if (!dragging || dragging === row) return;
                this.restoreMenu!.insertBefore(dragging, after ? row.nextSibling : row);
            });

            row.addEventListener('drop', () => {
                this.pushHistory();
                const newOrder = [...this.restoreMenu!.querySelectorAll('.status-item-row')].map(r => {
                    const text = r.querySelector('.item-label')!.textContent!.replace(/^\d+\.\s*/, '');
                    return rows.find(item => item.name === text)?.el;
                }).filter(Boolean) as HTMLElement[];

                newOrder.forEach(el => this.statusBar!.appendChild(el));
                this.saveLayout();
                updateRowNumbers();
            });
        });

        this.restoreMenu.style.color = this.getStatusBarColor('color');
        this.restoreMenu.style.background = this.getStatusBarColor('background-color');
        this.restoreMenu.style.border = `1px solid ${this.getStatusBarColor('border-color') || 'currentColor'}`;
        this.restoreMenu.style.borderRadius = '6px';
        this.restoreMenu.style.padding = '4px';

        const barRect = this.statusBar.getBoundingClientRect();
        const menuRect = this.restoreMenu.getBoundingClientRect();
        let left = barRect.right - menuRect.width - 4;
        if (left < 4) left = 4;
        this.restoreMenu.style.left = left + 'px';
        this.restoreMenu.style.top = barRect.top - menuRect.height - 8 + 'px';
    }

    private closeRestoreMenu() {
        if (this.restoreMenu) {
            this.restoreMenu.style.display = 'none';
        }
    }

    private showTooltip(text: string, el: HTMLElement) {
        if (!this.tooltip || !this.statusBar) return;

        const barRect = this.statusBar.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        this.tooltip.textContent = text;
        this.tooltip.style.color = this.getStatusBarColor('color');
        this.tooltip.style.background = this.getStatusBarColor('background-color');
        this.tooltip.style.border = `1px solid ${this.getStatusBarColor('border-color') || 'currentColor'}`;
        this.tooltip.style.display = 'block';

        const tipRect = this.tooltip.getBoundingClientRect();
        this.tooltip.style.left = elRect.left + elRect.width / 2 - tipRect.width / 2 + 'px';
        this.tooltip.style.top = barRect.top - tipRect.height - 8 + 'px';
    }

    private hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }

    private pushHistory() {
        try {
            const snapshot = this.getCurrentOrderSnapshot();
            this.historyStack.push(snapshot);
            if (this.historyStack.length > this.HISTORY_LIMIT) {
                this.historyStack.shift();
            }
        } catch (err) {
            console.warn('pushHistory error', err);
        }
    }

    private getCurrentOrderSnapshot(): StatusBarItemSnapshot[] {
        if (!this.statusBar) return [];
        return [...this.statusBar.children]
            .filter(el => 
                (el as HTMLElement).dataset.alwaysVisible !== 'true' &&
                el !== this.placeholder
            )
            .map(el => ({
                class: el.className,
                hidden: (el as HTMLElement).style.display === 'none'
            }));
    }

    private applySnapshot(snapshot: StatusBarItemSnapshot[]) {
        if (!this.statusBar || !Array.isArray(snapshot)) return;
        snapshot.forEach(item => {
            const el = [...this.statusBar!.children].find(e => e.className === item.class);
            if (!el) return;
            this.statusBar!.appendChild(el);
            (el as HTMLElement).style.display = item.hidden ? 'none' : '';
        });
        this.saveLayout();
        this.updateSortingVisuals();
    }

    private attachHoverToChildren() {
        if (!this.statusBar) return;

        [...this.statusBar.children].forEach(el => {
            const childEl = el as HTMLElement;
            childEl.style.position = 'relative';
            childEl.style.transition = 'transform 120ms ease';

            const del = document.createElement('div');
            del.dataset.statusCloseBtn = 'true';
            del.textContent = '×';
            del.style.cssText = `
                position: absolute;
                top: -4px;
                right: -4px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                display: none;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                cursor: pointer;
                background: ${this.getStatusBarColor('background-color')};
                color: ${this.getStatusBarColor('color')};
                border: 1px solid currentColor;
            `;

            del.onclick = (e) => {
                e.stopPropagation();
                childEl.style.display = 'none';
                this.saveLayout();
            };

            el.appendChild(del);

            el.addEventListener('mouseenter', () => {
                if (!this.dragEnabled) return;
                del.style.display = 'flex';
                this.showTooltip(`class="${el.className}"`, childEl);
            });

            el.addEventListener('mouseleave', () => {
                del.style.display = 'none';
                this.hideTooltip();
            });
        });
    }

    private saveOriginalOrder() {
        if (!this.statusBar) return;
        this.originalOrder = [...this.statusBar.children]
            .filter(el => el !== this.placeholder)
            .map(el => el as HTMLElement);
    }

    private restoreOriginalOrder() {
        if (!this.statusBar || !this.originalOrder.length) return;
        
        this.originalOrder.forEach(el => {
            this.statusBar!.appendChild(el);
        });
    }

    private applyDragResult() {
        if (!this.statusBar || !this.draggedEl || !this.placeholder) return;

        this.statusBar.insertBefore(this.draggedEl, this.placeholder);
        this.saveLayout();
    }

    private setupDragListeners() {
        if (!this.statusBar) return;

        this.statusBar.addEventListener('dragstart', (e) => {
            if (!this.dragEnabled) return;
            
            const target = (e.target as Element).closest('.status-bar > *') as HTMLElement;
            if (!target) return;
            
            this.draggedEl = target;
            this.pushHistory();
            this.saveOriginalOrder();
            
            target.classList.add('is-dragging');
            
            e.dataTransfer!.effectAllowed = 'move';
            e.dataTransfer!.setData('text/plain', '');
            
            setTimeout(() => {
                if (this.placeholder && this.draggedEl) {
                    const rect = this.draggedEl.getBoundingClientRect();
                    this.placeholder.style.width = rect.width + 'px';
                    this.placeholder.style.height = rect.height + 'px';
                    this.placeholder.style.display = 'inline-flex';
                    this.statusBar!.insertBefore(this.placeholder, this.draggedEl.nextSibling);
                }
            }, 0);
        });

        this.statusBar.addEventListener('dragend', (e) => {
            if (!this.dragEnabled) return;
            
            if (this.draggedEl) {
                this.draggedEl.classList.remove('is-dragging');
            }
            
            if (this.placeholder && this.placeholder.parentElement) {
                this.placeholder.remove();
            }
            
            this.applyDragResult();
            
            this.draggedEl = null;
            this.originalOrder = [];
        });

        this.statusBar.addEventListener('dragover', (e) => {
            if (!this.dragEnabled || !this.placeholder) return;
            e.preventDefault();
            
            const target = (e.target as Element).closest('.status-bar > *');
            if (!target || target === this.draggedEl || target === this.placeholder) return;
            
            const rect = target.getBoundingClientRect();
            const after = e.clientX > rect.left + rect.width / 2;
            
            if (after) {
                if (this.placeholder.nextSibling !== target.nextSibling) {
                    const refNode = target.nextSibling as Element | null;
                    this.statusBar!.insertBefore(this.placeholder, refNode);
                }
            } else {
                if (this.placeholder.previousSibling !== target) {
                    this.statusBar!.insertBefore(this.placeholder, target);
                }
            }
        });

        this.statusBar.addEventListener('mouseover', (e) => {
            if (!this.dragEnabled) return;
            const el = (e.target as Element).closest('.status-bar > *');
            if (el) {
                e.stopImmediatePropagation();
            }
        }, true);
    }
}
