// 이미 주입된 경우 이벤트 중복 등록 방지
if (!window.__qsReady) {
  window.__qsReady = true;
  // 우클릭 순간 가장 가까운 <a> 텍스트를 session에 저장
  document.addEventListener("contextmenu", (e) => {
    const a = e.target.closest("a");
    chrome.storage.session.set({ _qsLinkText: a ? a.textContent.trim() : "" });
  }, true);
}
