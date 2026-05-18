// =====================================================
// background.js - QuickSave 크롬 익스텐션
// 역할: 우클릭 메뉴 등록 + 클릭 이벤트 처리 + 데이터 저장
// =====================================================

// 1. 익스텐션 설치 또는 업데이트 시 컨텍스트 메뉴 등록
chrome.runtime.onInstalled.addListener(() => {
  // storage 초기화 (처음 설치 시 빈 배열로 시작)
  chrome.storage.local.get(["todo", "readlater"], (result) => {
    if (!result.todo) {
      chrome.storage.local.set({ todo: [] });
    }
    if (!result.readlater) {
      chrome.storage.local.set({ readlater: [] });
    }
  });

  // 우클릭 메뉴 항목 1: 할 일로 저장
  chrome.contextMenus.create({
    id: "save-todo",
    title: "✅ 할 일로 저장",
    contexts: ["page", "link"], // 페이지 빈 곳 + 링크 위에서도 동작
  });

  // 우클릭 메뉴 항목 2: 나중에 읽기로 저장
  chrome.contextMenus.create({
    id: "save-readlater",
    title: "📌 나중에 읽기로 저장",
    contexts: ["page", "link"],
  });
});

// =====================================================
// 2. 컨텍스트 메뉴 클릭 이벤트 처리
// =====================================================
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // 저장할 데이터 구성
  const newItem = {
    id: Date.now(), // 고유 ID (타임스탬프 사용)
    title: tab.title || "제목 없음", // 페이지 제목
    url: info.linkUrl || tab.url, // 링크 위 우클릭이면 linkUrl, 아니면 탭 URL
    date: new Date().toLocaleDateString("ko-KR"), // 저장 날짜 (예: 2026. 5. 18.)
    done: false, // 완료 여부 (TODO 항목용)
  };

  // 클릭된 메뉴에 따라 다른 storage 키에 저장
  if (info.menuItemId === "save-todo") {
    saveItem("todo", newItem, tab.id);
  } else if (info.menuItemId === "save-readlater") {
    saveItem("readlater", newItem, tab.id);
  }
});

// =====================================================
// 3. 데이터 저장 함수
// =====================================================

/**
 * chrome.storage.local에 항목을 저장하는 함수
 * @param {string} key       - 저장 키 ("todo" 또는 "readlater")
 * @param {object} newItem   - 저장할 항목 객체
 * @param {number} tabId     - 알림을 보낼 탭 ID
 */
function saveItem(key, newItem, tabId) {
  // 기존 배열 불러오기
  chrome.storage.local.get([key], (result) => {
    const existingList = result[key] || [];

    // 중복 URL 체크 (같은 URL이 이미 있으면 저장 안 함)
    const isDuplicate = existingList.some((item) => item.url === newItem.url);

    if (isDuplicate) {
      // 중복 시 알림
      showNotification(tabId, "⚠️ 이미 저장된 페이지입니다.");
      return;
    }

    // 새 항목을 배열 맨 앞에 추가 (최신 항목이 위에 보이도록)
    const updatedList = [newItem, ...existingList];

    // storage에 다시 저장
    chrome.storage.local.set({ [key]: updatedList }, () => {
      const label = key === "todo" ? "할 일" : "읽기 목록";
      showNotification(tabId, `✅ ${label}에 저장되었습니다!`);
    });
  });
}

// =====================================================
// 4. 탭에 알림 메시지 표시 함수 (content script 활용)
// =====================================================

/**
 * 저장 완료 후 현재 탭에 간단한 알림 표시
 * @param {number} tabId   - 메시지를 보낼 탭 ID
 * @param {string} message - 표시할 메시지
 */
function showNotification(tabId, message) {
  chrome.scripting
    .executeScript({
      target: { tabId: tabId },
      func: (msg) => {
        // 기존 알림이 있으면 제거
        const existing = document.getElementById("quicksave-toast");
        if (existing) existing.remove();

        // 토스트 메시지 요소 생성
        const toast = document.createElement("div");
        toast.id = "quicksave-toast";
        toast.textContent = msg;
        toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: #333;
        color: #fff;
        padding: 10px 18px;
        border-radius: 8px;
        font-size: 14px;
        font-family: sans-serif;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: fadeIn 0.3s ease;
      `;

        document.body.appendChild(toast);

        // 2.5초 후 자동 제거
        setTimeout(() => {
          if (toast) toast.remove();
        }, 2500);
      },
      args: [message],
    })
    .catch(() => {
      // 일부 페이지(크롬 내부 페이지 등)에서는 스크립트 실행 불가 → 무시
      console.log("QuickSave: 알림 표시 불가 (시스템 페이지)");
    });
}
