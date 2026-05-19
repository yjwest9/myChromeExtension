// content.js - QuickSave 드래그 가능한 플로팅 패널

(function () {
  if (window.__quicksaveLoaded) return;
  window.__quicksaveLoaded = true;

  const PANEL_ID = 'quicksave-panel';
  const MIN_VISIBLE = 60; // 화면 끝에서 최소 남겨야 할 px

  function createPanel(savedX, savedY) {
    const container = document.createElement('div');
    container.id = PANEL_ID;
    container.style.cssText = `
      position: fixed;
      left: ${savedX}px;
      top: ${savedY}px;
      z-index: 2147483647;
      display: none;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      overflow: hidden;
    `;

    // 드래그 핸들 (패널 상단)
    const handle = document.createElement('div');
    handle.id = 'qs-drag-handle';
    handle.style.cssText = `
      background: #2a2a3d;
      border-bottom: 1px solid #3a3a55;
      padding: 5px 10px;
      cursor: grab;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #9090b0;
      font-size: 11px;
      font-family: 'Segoe UI', sans-serif;
      letter-spacing: 1px;
    `;

    const handleLabel = document.createElement('span');
    handleLabel.textContent = '⠿ QuickSave';

    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      cursor: pointer;
      font-size: 14px;
      color: #9090b0;
      padding: 0 2px;
      line-height: 1;
    `;
    closeBtn.title = '닫기';
    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', () => {
      container.style.display = 'none';
    });

    handle.appendChild(handleLabel);
    handle.appendChild(closeBtn);

    // 팝업 내용을 담는 iframe
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('popup.html');
    iframe.style.cssText = `
      width: 360px;
      height: 520px;
      border: none;
      display: block;
    `;

    container.appendChild(handle);
    container.appendChild(iframe);
    document.body.appendChild(container);

    // 드래그 로직
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseInt(container.style.left) || 0;
      origTop = parseInt(container.style.top) || 0;
      handle.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const panelW = 360;
      const panelH = 520 + 30; // iframe + 핸들

      let newLeft = origLeft + dx;
      let newTop = origTop + dy;

      // 화면 가장자리까지 이동 가능, 최소 MIN_VISIBLE px만 남김 (잘릴 수 있음)
      newLeft = Math.max(-(panelW - MIN_VISIBLE), Math.min(window.innerWidth - MIN_VISIBLE, newLeft));
      newTop = Math.max(-(panelH - MIN_VISIBLE), Math.min(window.innerHeight - MIN_VISIBLE, newTop));

      container.style.left = newLeft + 'px';
      container.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      handle.style.cursor = 'grab';
      chrome.storage.local.set({
        panelX: parseInt(container.style.left),
        panelY: parseInt(container.style.top),
      });
    });

    return container;
  }

  function togglePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (!existing) {
      chrome.storage.local.get(['panelX', 'panelY'], (result) => {
        const x = result.panelX !== undefined ? result.panelX : 20;
        const y = result.panelY !== undefined ? result.panelY : 60;
        const panel = createPanel(x, y);
        panel.style.display = 'block';
      });
      return;
    }
    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'toggle-panel') {
      togglePanel();
    }
  });
})();
