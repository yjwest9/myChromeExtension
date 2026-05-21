// =====================================================
// background.js - QuickSave 크롬 익스텐션
// 역할: 우클릭 메뉴 등록 + 메시지 처리 + 데이터 저장 + 창 관리 + 뱃지 + 알림
// =====================================================

// 서비스워커 재시작 시 사용자 지정 단축키를 storage에서 복원해 재적용
// (서비스워커는 슬립 후 재기동되면 in-memory 상태가 초기화되므로 필수)
chrome.storage.local.get(["customShortcut"], (result) => {
  if (result.customShortcut) {
    chrome.commands.update({ name: "open-popup", shortcut: result.customShortcut }, () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.remove(["customShortcut"]);
      }
    });
  }
});

// 팝업(popup.js)에서 postMessage로 오는 요청을 종류별로 처리하는 중앙 리스너
// - updateShortcut : 새 단축키 적용 (chrome.commands.update는 service worker에서만 동작)
// - resetShortcut  : 단축키를 기본값(Alt+Shift+Q)으로 초기화
// - setAlarm       : 지정한 일시(alarmAt)에 chrome.alarms 등록 + 제목 storage 보존
// - clearAlarm     : 등록된 알람 취소 + storage에서 제목 제거
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "updateShortcut") {
    chrome.commands.update({ name: "open-popup", shortcut: message.shortcut }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // 비동기 sendResponse를 위해 true 반환
  }
  if (message.type === "resetShortcut") {
    chrome.commands.update({ name: "open-popup", shortcut: "Alt+Shift+Q" }, () => {
      sendResponse({ success: !chrome.runtime.lastError });
    });
    return true;
  }
  if (message.type === "setAlarm") {
    const { itemId, alarmAt, title } = message;
    const alarmName = `due-${itemId}`;
    const fireTime = new Date(alarmAt).getTime();
    // 기존 알람 제거 후 미래 시각이면 새로 등록 (이미 지난 시각은 무시)
    chrome.alarms.clear(alarmName, () => {
      if (fireTime > Date.now()) {
        chrome.alarms.create(alarmName, { when: fireTime });
        chrome.storage.local.set({ [`_alarm_${itemId}`]: title });
      }
    });
  }
  if (message.type === "clearAlarm") {
    chrome.alarms.clear(`due-${message.itemId}`);
    chrome.storage.local.remove([`_alarm_${message.itemId}`]);
  }
});

// 등록된 알람이 발화하면 Windows 알림으로 마감 항목 제목을 표시
// 알람 이름이 "due-"로 시작하는 것만 처리 (다른 알람과 충돌 방지)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("due-")) return;
  const itemId = alarm.name.replace("due-", "");
  chrome.storage.local.get([`_alarm_${itemId}`], (result) => {
    const title = result[`_alarm_${itemId}`] || "TODO 마감일";
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "📅 QuickSave 마감 알림",
      message: `오늘 마감: ${title}`,
    });
  });
});

// 익스텐션 최초 설치 또는 업데이트 시 한 번만 실행
// - storage에 todo/readlater 배열이 없을 때만 빈 배열로 초기화
// - 우클릭 컨텍스트 메뉴 2개 등록 (페이지 / 링크 / 텍스트 선택 3가지 상황 모두 지원)
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["todo", "readlater"], (result) => {
    if (!result.todo) chrome.storage.local.set({ todo: [] });
    if (!result.readlater) chrome.storage.local.set({ readlater: [] });
  });

  chrome.contextMenus.create({
    id: "save-todo",
    title: "✅ 할 일로 저장",
    contexts: ["page", "link", "selection"],
  });

  chrome.contextMenus.create({
    id: "save-readlater",
    title: "📌 나중에 읽기로 저장",
    contexts: ["page", "link", "selection"],
  });
});

// 우클릭 메뉴 클릭 이벤트 처리
// - 링크 위에서 클릭하면 executeScript로 <a> 텍스트를 읽어 제목으로 사용
// - 텍스트를 드래그 선택한 뒤 클릭하면 selectionText를 메모에 자동 채움
chrome.contextMenus.onClicked.addListener((info, tab) => {
  function doSave(title) {
    const newItem = {
      id: Date.now(),
      title: title || tab.title || "제목 없음",
      url: info.linkUrl || tab.url,
      date: new Date().toLocaleDateString("ko-KR"),
      memo: info.selectionText || "",
      tags: [],
      done: false,
    };
    if (info.menuItemId === "save-todo") saveItem("todo", newItem, tab.id);
    else if (info.menuItemId === "save-readlater") saveItem("readlater", newItem, tab.id);
  }

  if (!info.linkUrl) {
    doSave(tab.title);
    return;
  }

  // 링크 저장: DOM에서 URL로 <a> 찾아 텍스트 추출 (decodeURIComponent로 인코딩 차이 처리)
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (href) => {
      const decode = u => { try { return decodeURIComponent(u); } catch { return u; } };
      const target = decode(href);
      for (const a of document.querySelectorAll("a")) {
        try {
          if (decode(a.href) === target) {
            const t = a.textContent.trim();
            if (t) return t;
          }
        } catch {}
      }
      return null;
    },
    args: [info.linkUrl],
  }, (results) => {
    doSave(results?.[0]?.result || tab.title);
  });
});

// =====================================================
// 뱃지 — 미완료 TODO 개수 표시
// =====================================================

// 미완료 TODO(done: false)의 수를 세어 아이콘 뱃지에 숫자로 표시 (보라색 배경)
// 미완료가 0개이면 뱃지를 제거
function updateBadge() {
  chrome.storage.local.get(["todo"], (result) => {
    const count = (result.todo || []).filter((t) => !t.done).length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    if (count > 0) {
      chrome.action.setBadgeBackgroundColor({ color: "#7b3ff2" });
    }
  });
}

// todo storage가 바뀔 때마다 뱃지를 자동 갱신 (체크·저장·삭제 시 즉시 반영)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.todo) updateBadge();
});

// 서비스워커 시작 시 초기 뱃지 설정 (재기동 직후에도 올바른 개수 표시)
updateBadge();

// =====================================================
// 데이터 저장
// =====================================================

// storage 키(todo 또는 readlater)에 새 항목을 맨 앞에 삽입
// 같은 URL이 이미 있으면 저장 않고 토스트 알림으로 중복 안내
function saveItem(key, newItem, tabId) {
  chrome.storage.local.get([key], (result) => {
    const existingList = result[key] || [];
    const isDuplicate = existingList.some((item) => item.url === newItem.url);

    if (isDuplicate) {
      showNotification(tabId, "⚠️ 이미 저장된 페이지입니다.");
      return;
    }

    const updatedList = [newItem, ...existingList];
    chrome.storage.local.set({ [key]: updatedList }, () => {
      const label = key === "todo" ? "할 일" : "나중에 읽기";
      showNotification(tabId, `✅ ${label}에 저장되었습니다!`);
    });
  });
}

// =====================================================
// 팝업 창 열기 / 포커스
// =====================================================

let quicksaveWindowId = null;

// 익스텐션 아이콘 클릭 시 팝업 창 열기 또는 포커스
chrome.action.onClicked.addListener(() => {
  openOrFocusWindow();
});

// 단축키 입력 시 팝업 창 열기 또는 포커스 (단축키 비활성화 상태면 무시)
chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-popup") return;
  chrome.storage.local.get(["shortcutEnabled"], (result) => {
    if (result.shortcutEnabled === false) return;
    openOrFocusWindow();
  });
});

// 기존 팝업 창이 살아있으면 포커스, 닫혔거나 ID를 모르면 새로 생성
// 서비스워커 슬립 후 in-memory winId가 null이 될 수 있어 storage(_winId)도 확인
function openOrFocusWindow() {
  const tryFocus = (winId) => {
    if (!winId) { createQuicksaveWindow(); return; }
    chrome.windows.get(winId, (win) => {
      if (chrome.runtime.lastError || !win) {
        quicksaveWindowId = null;
        chrome.storage.local.remove(["_winId"]);
        createQuicksaveWindow();
      } else {
        quicksaveWindowId = winId;
        chrome.windows.update(winId, { focused: true });
      }
    });
  };

  if (quicksaveWindowId !== null) {
    tryFocus(quicksaveWindowId);
  } else {
    chrome.storage.local.get(["_winId"], (r) => tryFocus(r._winId || null));
  }
}

// 팝업 창을 새로 생성하고 winId를 메모리와 storage 양쪽에 저장
// 이전에 닫았던 위치(popupX/Y)가 있으면 같은 자리에 열림
function createQuicksaveWindow() {
  chrome.storage.local.get(["popupX", "popupY"], (result) => {
    const left = result.popupX !== undefined ? result.popupX : 100;
    const top = result.popupY !== undefined ? result.popupY : 100;
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 376,
        height: 570,
        left,
        top,
      },
      (win) => {
        quicksaveWindowId = win.id;
        chrome.storage.local.set({ _winId: win.id });
      }
    );
  });
}

// 팝업 창이 닫힐 때 winId를 메모리와 storage 양쪽에서 정리
// 서비스워커 슬립으로 in-memory가 null인 경우에도 storage를 확인해 정리
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === quicksaveWindowId) {
    quicksaveWindowId = null;
    chrome.storage.local.remove(["_winId"]);
    return;
  }
  if (quicksaveWindowId === null) {
    chrome.storage.local.get(["_winId"], (r) => {
      if (r._winId === windowId) chrome.storage.local.remove(["_winId"]);
    });
  }
});

// 창 크기가 최솟값 미만으로 줄어들면 즉시 원복 (상하좌우 모두 적용)
const MIN_WINDOW_WIDTH = 376;
const MIN_WINDOW_HEIGHT = 400;

chrome.windows.onBoundsChanged.addListener((win) => {
  const enforce = (winId) => {
    if (!winId || win.id !== winId) return;
    const newW = Math.max(win.width, MIN_WINDOW_WIDTH);
    const newH = Math.max(win.height, MIN_WINDOW_HEIGHT);
    if (newW !== win.width || newH !== win.height) {
      chrome.windows.update(win.id, { width: newW, height: newH });
    }
  };

  if (quicksaveWindowId !== null) {
    enforce(quicksaveWindowId);
  } else {
    chrome.storage.local.get(["_winId"], (r) => {
      if (r._winId) quicksaveWindowId = r._winId;
      enforce(r._winId || null);
    });
  }
});

// =====================================================
// 토스트 알림 (페이지 내 삽입)
// =====================================================

// 우클릭 저장 직후 현재 탭 페이지에 토스트 메시지를 스크립트로 삽입해 표시
// chrome 내부 페이지 등 scripting 불가 환경에서는 조용히 무시
function showNotification(tabId, message) {
  chrome.scripting
    .executeScript({
      target: { tabId: tabId },
      func: (msg) => {
        const existing = document.getElementById("quicksave-toast");
        if (existing) existing.remove();

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
        setTimeout(() => { if (toast) toast.remove(); }, 2500);
      },
      args: [message],
    })
    .catch(() => {
      console.log("QuickSave: 알림 표시 불가 (시스템 페이지)");
    });
}
