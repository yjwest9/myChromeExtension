// =====================================================
// popup.js - QuickSave 팝업 동작 로직
// 역할: 데이터 렌더링 + 사용자 인터랙션 처리 + 모달 관리
// =====================================================

// --- 전역 상태 변수 ---
let currentTab = "todo";      // 현재 활성 탭: "todo" | "readlater" | "search"
let selectedTag = "전체";     // 현재 선택된 태그 필터
let searchQuery = "";          // 검색창 입력값
let todoList = [];             // TODO 항목 배열 (storage와 동기화)
let readlaterList = [];        // LATER 항목 배열 (storage와 동기화)
let editingId = null;          // 현재 편집 중인 항목 ID
let editingListKey = null;     // 편집 중인 항목이 속한 리스트 ("todo" | "readlater")

// =====================================================
// 초기화
// =====================================================

// DOM 준비 완료 후 데이터 로드 및 각 이벤트 바인딩 실행
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  bindTabEvents();
  bindSearchEvent();
  bindClearEvent();
  bindEditModal();
  bindSettingsModal();
  bindQuickAdd();
});

// storage가 바뀌면(우클릭 저장 등) 팝업을 새로고침 없이 즉시 업데이트
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.todo) todoList = changes.todo.newValue || [];
  if (changes.readlater) readlaterList = changes.readlater.newValue || [];
  if (changes.todo || changes.readlater) renderAll();
});

// 팝업 창이 닫힐 때 현재 위치를 storage에 저장 → 다음에 같은 자리에서 열림
window.addEventListener("beforeunload", () => {
  chrome.storage.local.set({
    popupX: window.screenX,
    popupY: window.screenY,
  });
});

// =====================================================
// 데이터 로드
// =====================================================

// storage에서 todo/readlater 배열과 단축키 활성화 여부를 불러와 초기 렌더링
function loadData() {
  chrome.storage.local.get(
    ["todo", "readlater", "shortcutEnabled"],
    (result) => {
      todoList = result.todo || [];
      readlaterList = result.readlater || [];

      const toggle = document.getElementById("shortcutToggle");
      toggle.checked = result.shortcutEnabled !== false;

      renderAll();
    },
  );
}

// =====================================================
// 렌더링
// =====================================================

// 태그 필터 버튼과 항목 목록을 함께 다시 그림 (상태 변경 시 항상 이걸 호출)
function renderAll() {
  renderTagFilter();
  renderList();
}

// 현재 탭의 항목에서 태그를 수집해 필터 버튼으로 렌더링
// 선택된 태그(selectedTag)에 해당하는 버튼은 active 스타일 적용
function renderTagFilter() {
  const list =
    currentTab === "search"
      ? [...todoList, ...readlaterList]
      : currentTab === "todo"
        ? todoList
        : readlaterList;

  const allTags = ["전체"];
  list.forEach((item) => {
    (item.tags || []).forEach((tag) => {
      if (!allTags.includes(tag)) allTags.push(tag);
    });
  });

  const container = document.getElementById("tagFilterList");
  container.innerHTML = "";

  allTags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.className = "tag-filter-btn" + (tag === selectedTag ? " active" : "");
    btn.textContent = tag === "전체" ? "전체" : `#${tag}`;
    btn.addEventListener("click", () => {
      selectedTag = tag;
      renderAll();
    });
    container.appendChild(btn);
  });
}

// 현재 탭·태그 필터·검색어를 적용해 항목 목록을 <ul>에 렌더링
// 항목이 없으면 empty 메시지 표시, 검색 탭이 아닐 때는 드래그 이벤트도 바인딩
function renderList() {
  let list;

  if (currentTab === "search") {
    list = [...todoList, ...readlaterList];
  } else {
    list = currentTab === "todo" ? todoList : readlaterList;
  }

  let filtered = list;
  if (selectedTag !== "전체") {
    filtered = list.filter((item) => (item.tags || []).includes(selectedTag));
  }

  if (searchQuery.trim() !== "") {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (item) =>
        (item.title || "").toLowerCase().includes(q) ||
        (item.memo || "").toLowerCase().includes(q) ||
        (item.tags || []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  const ul = document.getElementById("itemList");
  const emptyMsg = document.getElementById("emptyMsg");
  const countEl = document.getElementById("itemCount");

  ul.innerHTML = "";

  if (filtered.length === 0) {
    ul.style.display = "none";
    emptyMsg.style.display = "block";
    countEl.textContent = "0개 항목";
    return;
  }

  ul.style.display = "flex";
  emptyMsg.style.display = "none";
  countEl.textContent = `${filtered.length}개 항목`;

  filtered.forEach((item) => {
    const listKey =
      currentTab === "search"
        ? todoList.find((t) => t.id === item.id)
          ? "todo"
          : "readlater"
        : currentTab;

    const li = createItemCard(item, listKey);
    ul.appendChild(li);
  });

  if (currentTab !== "search") {
    bindDragEvents(ul, currentTab);
  }
}

// =====================================================
// 카드 생성
// =====================================================

// 항목 하나를 <li> 카드 요소로 만들어 반환
// 드래그 핸들, 체크박스, 파비콘, 제목, 핀·편집·삭제 버튼, 메모, 태그, 날짜 포함
function createItemCard(item, listKey) {
  const li = document.createElement("li");
  li.className = "item-card" + (item.done ? " done" : "");
  li.dataset.id = item.id;
  li.dataset.pinned = item.pinned ? "true" : "false"; // 드래그 경계 체크에 사용
  li.draggable = currentTab !== "search";

  // 알림 일시가 현재 시각보다 이미 지났으면 overdue 스타일 (빨간 테두리) 적용
  const dueOverdue = item.alarmAt ? new Date(item.alarmAt) <= new Date() : false;
  if (item.alarmAt && dueOverdue) li.classList.add("overdue");
  if (item.pinned) li.classList.add("pinned-card"); // 핀 고정 시 왼쪽 보라선

  const topRow = document.createElement("div");
  topRow.className = "item-top";

  // 드래그 핸들 — 검색 탭에서는 숨김 (드래그 비활성)
  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>`;
  if (currentTab === "search") dragHandle.style.visibility = "hidden";
  topRow.appendChild(dragHandle);

  // 완료 체크박스 — TODO와 LATER 모두 제공 (체크 시 취소선 + done 상태 저장)
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "item-checkbox";
  checkbox.checked = item.done;
  checkbox.addEventListener("change", () => toggleDone(item.id, listKey));
  topRow.appendChild(checkbox);

  // 파비콘 — URL이 있는 항목만 표시, 로드 실패 시 자동 숨김
  if (item.url) {
    const favicon = document.createElement("img");
    favicon.className = "item-favicon";
    try {
      const domain = new URL(item.url).hostname;
      favicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      favicon.style.display = "none";
    }
    favicon.onerror = () => {
      favicon.style.display = "none";
    };
    topRow.appendChild(favicon);
  }

  // 제목 — URL이 있으면 클릭 시 새 탭으로 이동, Quick Add 항목은 클릭 불가
  const title = document.createElement("span");
  title.className = "item-title";
  title.textContent = item.title || "제목 없음";
  if (item.url) {
    title.title = item.url;
    title.addEventListener("click", () => chrome.tabs.create({ url: item.url }));
  } else {
    title.style.cursor = "default";
  }
  topRow.appendChild(title);

  // 핀 고정 버튼 — 클릭 시 상단 고정/해제, 검색 탭에서는 숨김
  if (currentTab !== "search") {
    const pinBtn = document.createElement("button");
    pinBtn.className = "item-pin" + (item.pinned ? " pinned" : "");
    pinBtn.title = item.pinned ? "핀 해제" : "상단 고정";
    pinBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="${item.pinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>`;
    pinBtn.addEventListener("click", () => togglePin(item.id, listKey));
    topRow.appendChild(pinBtn);
  }

  // 편집 버튼 — 클릭 시 메모/태그/알림 편집 모달 열기
  const editBtn = document.createElement("button");
  editBtn.className = "item-edit";
  editBtn.title = "메모/태그 편집";
  editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
  editBtn.addEventListener("click", () => openEditModal(item, listKey));
  topRow.appendChild(editBtn);

  // 삭제 버튼 — 클릭 시 항목 제거 + 예약된 알람도 함께 취소
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "item-delete";
  deleteBtn.title = "삭제";
  deleteBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  deleteBtn.addEventListener("click", () => deleteItem(item.id, listKey));
  topRow.appendChild(deleteBtn);

  li.appendChild(topRow);

  // 메모 — 내용이 있을 때만 표시
  if (item.memo && item.memo.trim() !== "") {
    const memo = document.createElement("div");
    memo.className = "item-memo";
    memo.textContent = `📝 ${item.memo}`;
    li.appendChild(memo);
  }

  // 하단 행: 태그 (왼쪽) + 알림 배지 & 저장 날짜 (오른쪽)
  const bottomRow = document.createElement("div");
  bottomRow.className = "item-bottom";

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "item-tags";

  // 검색 탭에서만 TODO/LATER 구분 배지 표시
  if (currentTab === "search") {
    const typeBadge = document.createElement("span");
    typeBadge.className =
      "item-type-badge " +
      (listKey === "todo" ? "badge-todo" : "badge-readlater");
    typeBadge.textContent = listKey === "todo" ? "✅ TODO" : "📌 LATER";
    tagsWrap.appendChild(typeBadge);
  }

  (item.tags || []).forEach((tag) => {
    const tagEl = document.createElement("span");
    tagEl.className = "item-tag";
    tagEl.textContent = `#${tag}`;
    tagsWrap.appendChild(tagEl);
  });
  bottomRow.appendChild(tagsWrap);

  const dateGroup = document.createElement("div");
  dateGroup.className = "item-date-group";

  // 알림 일시가 설정된 경우 🔔 배지 표시 (지난 시각이면 빨간색)
  if (item.alarmAt) {
    const dt = new Date(item.alarmAt);
    const m = dt.getMonth() + 1;
    const d = dt.getDate();
    const h = String(dt.getHours()).padStart(2, "0");
    const min = String(dt.getMinutes()).padStart(2, "0");
    const dueBadge = document.createElement("span");
    dueBadge.className = "item-due-badge" + (dueOverdue ? " overdue" : "");
    dueBadge.textContent = `🔔 ${m}/${d} ${h}:${min}`;
    dateGroup.appendChild(dueBadge);
  }

  // 저장 날짜 (ko-KR 형식, 예: 2026. 5. 21.)
  const date = document.createElement("span");
  date.className = "item-date";
  date.textContent = item.date || "";
  dateGroup.appendChild(date);

  bottomRow.appendChild(dateGroup);
  li.appendChild(bottomRow);
  return li;
}

// =====================================================
// 상태 변경
// =====================================================

// 완료 상태(done)를 토글하고 storage에 저장 — TODO와 LATER 모두 지원
function toggleDone(id, listKey) {
  if (listKey === "todo") {
    const idx = todoList.findIndex((item) => item.id === id);
    if (idx === -1) return;
    todoList[idx].done = !todoList[idx].done;
    chrome.storage.local.set({ todo: todoList }, () => renderAll());
  } else {
    const idx = readlaterList.findIndex((item) => item.id === id);
    if (idx === -1) return;
    readlaterList[idx].done = !readlaterList[idx].done;
    chrome.storage.local.set({ readlater: readlaterList }, () => renderAll());
  }
}

// 핀 상태를 토글하고 storage에 저장
// 핀 고정 시 해당 항목을 배열 맨 앞으로 이동해 항상 상단에 표시
function togglePin(id, listKey) {
  const list = listKey === "todo" ? todoList : readlaterList;
  const idx = list.findIndex((item) => item.id === id);
  if (idx === -1) return;
  list[idx].pinned = !list[idx].pinned;
  if (list[idx].pinned) {
    const [item] = list.splice(idx, 1);
    list.unshift(item);
  }
  chrome.storage.local.set({ [listKey]: list }, () => renderAll());
}

// 항목을 storage에서 제거하고, 등록된 알람도 함께 취소
function deleteItem(id, listKey) {
  chrome.runtime.sendMessage({ type: "clearAlarm", itemId: id });
  if (listKey === "todo") {
    todoList = todoList.filter((item) => item.id !== id);
    chrome.storage.local.set({ todo: todoList }, () => renderAll());
  } else {
    readlaterList = readlaterList.filter((item) => item.id !== id);
    chrome.storage.local.set({ readlater: readlaterList }, () => renderAll());
  }
}

// =====================================================
// 전체 삭제
// =====================================================

// "전체 삭제" 버튼 — 현재 탭 기준으로 확인 모달을 띄운 뒤 삭제 실행
function bindClearEvent() {
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    const label =
      currentTab === "todo"
        ? "TODO"
        : currentTab === "readlater"
          ? "LATER"
          : "검색결과(전체)";

    showConfirm(`${label} 전체를 삭제할까요?`, () => {
      if (currentTab === "todo") {
        todoList = [];
        chrome.storage.local.set({ todo: [] }, () => renderAll());
      } else if (currentTab === "readlater") {
        readlaterList = [];
        chrome.storage.local.set({ readlater: [] }, () => renderAll());
      } else {
        todoList = [];
        readlaterList = [];
        chrome.storage.local.set({ todo: [], readlater: [] }, () =>
          renderAll(),
        );
      }
    });
  });
}

// 확인 모달을 표시하고, 확인 시 onConfirm 콜백 실행 / 취소 시 그냥 닫음
// 이벤트 리스너를 매번 새로 등록하고 닫을 때 제거해 중복 실행 방지
function showConfirm(message, onConfirm) {
  const modal = document.getElementById("confirmModal");
  document.getElementById("confirmMessage").textContent = message;
  modal.style.display = "flex";

  const okBtn = document.getElementById("confirmOkBtn");
  const cancelBtn = document.getElementById("confirmCancelBtn");

  function close() {
    modal.style.display = "none";
    okBtn.removeEventListener("click", handleOk);
    cancelBtn.removeEventListener("click", handleCancel);
  }
  function handleOk() { close(); onConfirm(); }
  function handleCancel() { close(); }

  okBtn.addEventListener("click", handleOk);
  cancelBtn.addEventListener("click", handleCancel);
}

// =====================================================
// 탭 전환
// =====================================================

// 탭 버튼 클릭 이벤트 바인딩
// 탭 전환 시 태그 필터·검색어 초기화, Quick Add 표시 여부도 함께 전환
function bindTabEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      currentTab = btn.dataset.tab;
      selectedTag = "전체";

      if (currentTab !== "search") {
        searchQuery = "";
        document.getElementById("searchInput").value = "";
        document.getElementById("searchTab").style.display = "none";
      }

      // Quick Add 입력창은 TODO 탭에서만 표시
      document.getElementById("quickAddRow").style.display =
        currentTab === "todo" ? "flex" : "none";

      renderAll();
    });
  });
}

// =====================================================
// 검색
// =====================================================

// 검색창 입력 이벤트 바인딩
// 입력이 있으면 "검색결과" 탭을 자동 활성화하고 전 탭 통합 검색 실행
// 입력을 지우면 TODO 탭으로 복귀
function bindSearchEvent() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    const searchTabBtn = document.getElementById("searchTab");

    if (searchQuery.trim() !== "") {
      searchTabBtn.style.display = "";
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      searchTabBtn.classList.add("active");
      currentTab = "search";
      selectedTag = "전체";
      document.getElementById("quickAddRow").style.display = "none";
    } else {
      searchTabBtn.style.display = "none";
      currentTab = "todo";
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelector(".tab-btn[data-tab='todo']")
        .classList.add("active");
      document.getElementById("quickAddRow").style.display = "flex";
    }

    renderAll();
  });
}

// =====================================================
// 편집 모달 (메모 / 태그 / 알림 일시)
// =====================================================

// 편집 모달을 열고 선택한 항목의 현재 값을 각 입력 필드에 채움
function openEditModal(item, listKey) {
  editingId = item.id;
  editingListKey = listKey;

  document.getElementById("editMemoInput").value = item.memo || "";
  document.getElementById("editTagInput").value = (item.tags || []).join(",");
  document.getElementById("editAlarmInput").value = item.alarmAt || "";
  document.getElementById("editModal").style.display = "flex";
}

// 편집 모달의 Enter 단축키, 취소, 저장 버튼을 바인딩
// 저장 시 memo/tags/alarmAt을 storage에 반영하고, 알림 예약도 background로 전달
function bindEditModal() {
  // 메모·태그 입력창에서 Enter 누르면 저장 버튼 클릭과 동일하게 처리
  ["editMemoInput", "editTagInput"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("editSaveBtn").click();
      }
    });
  });

  // 취소 버튼 — 모달 닫고 편집 상태 초기화
  document.getElementById("editCancelBtn").addEventListener("click", () => {
    document.getElementById("editModal").style.display = "none";
    editingId = null;
    editingListKey = null;
  });

  // 저장 버튼 — 입력값을 파싱해 해당 항목 업데이트 후 storage 저장
  document.getElementById("editSaveBtn").addEventListener("click", () => {
    if (editingId === null) return;

    const newMemo = document.getElementById("editMemoInput").value.trim();
    const rawTags = document.getElementById("editTagInput").value;
    const newTags = rawTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");
    const newAlarmAt = document.getElementById("editAlarmInput").value;

    if (editingListKey === "todo") {
      const idx = todoList.findIndex((item) => item.id === editingId);
      if (idx !== -1) {
        todoList[idx].memo = newMemo;
        todoList[idx].tags = newTags;
        todoList[idx].alarmAt = newAlarmAt;
        chrome.storage.local.set({ todo: todoList });
      }
    } else {
      const idx = readlaterList.findIndex((item) => item.id === editingId);
      if (idx !== -1) {
        readlaterList[idx].memo = newMemo;
        readlaterList[idx].tags = newTags;
        readlaterList[idx].alarmAt = newAlarmAt;
        chrome.storage.local.set({ readlater: readlaterList });
      }
    }

    // 알림 일시가 있으면 background에 알람 예약 요청, 없으면 취소 요청
    const savedItem = editingListKey === "todo"
      ? todoList.find((i) => i.id === editingId)
      : readlaterList.find((i) => i.id === editingId);
    if (savedItem) {
      if (newAlarmAt) {
        chrome.runtime.sendMessage({
          type: "setAlarm",
          itemId: editingId,
          alarmAt: newAlarmAt,
          title: savedItem.title,
        });
      } else {
        chrome.runtime.sendMessage({ type: "clearAlarm", itemId: editingId });
      }
    }

    document.getElementById("editModal").style.display = "none";
    editingId = null;
    editingListKey = null;
    renderAll();
  });
}

// =====================================================
// 설정 모달 (단축키 / Export / Import)
// =====================================================

// 설정 모달 전체 이벤트 바인딩 — 단축키 캡처, Export/Import 버튼 포함
function bindSettingsModal() {
  const keyInput = document.getElementById("shortcutKeyInput");
  const actionBtn = document.getElementById("shortcutResetBtn");

  let isCapturing = false;   // 단축키 입력 대기 중 여부
  let heldMods = new Set();  // 현재 눌린 수식키 집합
  let heldNonMod = null;     // 현재 눌린 일반 키
  let pendingShortcut = null; // 확정 대기 중인 단축키 문자열

  const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta", "CapsLock"];
  const KEY_ALIAS = {
    ArrowUp: "Up", ArrowDown: "Down",
    ArrowLeft: "Left", ArrowRight: "Right",
    " ": "Space",
  };

  // 키 이름을 chrome.commands 형식으로 정규화 (단일 문자는 대문자, 방향키 등 별칭 적용)
  function normalizeKey(key) {
    if (KEY_ALIAS[key]) return KEY_ALIAS[key];
    return key.length === 1 ? key.toUpperCase() : key;
  }

  // 현재 눌린 수식키를 ["Ctrl", "Alt", "Shift"] 형식 배열로 반환
  function getModParts() {
    const parts = [];
    if (heldMods.has("Control")) parts.push("Ctrl");
    if (heldMods.has("Alt")) parts.push("Alt");
    if (heldMods.has("Shift")) parts.push("Shift");
    return parts;
  }

  // 현재 입력 상태를 단축키 입력창에 실시간으로 표시
  function refreshDisplay() {
    if (pendingShortcut) { keyInput.value = pendingShortcut; return; }
    const mods = getModParts();
    if (heldNonMod) {
      if (mods.length > 0)
        keyInput.value = [...mods, normalizeKey(heldNonMod)].join("+");
    } else if (mods.length > 0) {
      keyInput.value = mods.join("+");
    } else {
      keyInput.value = "키를 누르세요...";
    }
  }

  // 액션 버튼을 "초기화" 모드로 전환
  function resetBtn() {
    actionBtn.textContent = "초기화";
    actionBtn.dataset.mode = "reset";
  }

  // 액션 버튼을 "적용" 모드로 전환 (유효한 단축키가 완성됐을 때)
  function setApplyBtn() {
    actionBtn.textContent = "적용";
    actionBtn.dataset.mode = "apply";
  }

  // 단축키 캡처를 중단하고 입력 상태를 초기화한 뒤 현재 단축키 다시 표시
  function cancelCapture() {
    isCapturing = false;
    heldMods.clear();
    heldNonMod = null;
    pendingShortcut = null;
    keyInput.classList.remove("capturing");
    resetBtn();
    loadCurrentShortcut();
  }

  // 설정 버튼 클릭 → 모달 열기 + 현재 단축키 표시 + 통계 렌더링
  document.getElementById("settingsBtn").addEventListener("click", () => {
    document.getElementById("settingsModal").style.display = "flex";
    loadCurrentShortcut();
    renderStats();
  });

  // 닫기 버튼 — 캡처 중이면 취소 후 모달 닫기
  document.getElementById("settingsCloseBtn").addEventListener("click", () => {
    cancelCapture();
    document.getElementById("settingsModal").style.display = "none";
  });

  // 단축키 ON/OFF 토글 — 변경 즉시 storage에 저장
  document.getElementById("shortcutToggle").addEventListener("change", (e) => {
    chrome.storage.local.set({ shortcutEnabled: e.target.checked });
  });

  // 단축키 입력창 클릭 → 캡처 모드 시작
  keyInput.addEventListener("click", () => {
    pendingShortcut = null;
    heldMods.clear();
    heldNonMod = null;
    isCapturing = true;
    keyInput.value = "키를 누르세요...";
    keyInput.classList.add("capturing");
    resetBtn();
  });

  // 포커스를 잃으면 캡처 취소
  keyInput.addEventListener("blur", () => {
    if (isCapturing) cancelCapture();
  });

  // 키 누름 — 수식키는 집합에 추가, 일반 키 + 수식키 조합이 완성되면 pendingShortcut 저장
  keyInput.addEventListener("keydown", (e) => {
    if (!isCapturing) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") { cancelCapture(); return; }

    if (MODIFIER_KEYS.includes(e.key)) {
      heldMods.add(e.key);
    } else {
      heldNonMod = e.key;
      const mods = getModParts();
      if (mods.length > 0) {
        pendingShortcut = [...mods, normalizeKey(e.key)].join("+");
      }
    }
    refreshDisplay();
  });

  // 키 뗌 — 모든 키를 뗐고 pendingShortcut이 있으면 캡처 완료, 적용 버튼 활성화
  keyInput.addEventListener("keyup", (e) => {
    if (!isCapturing) return;

    if (MODIFIER_KEYS.includes(e.key)) {
      heldMods.delete(e.key);
    } else if (e.key === heldNonMod) {
      heldNonMod = null;
    }

    if (pendingShortcut && heldMods.size === 0 && !heldNonMod) {
      isCapturing = false;
      keyInput.classList.remove("capturing");
      keyInput.value = pendingShortcut;
      setApplyBtn();
    } else {
      refreshDisplay();
    }
  });

  // 적용/초기화 버튼 — 모드에 따라 단축키 적용 또는 기본값 복원
  actionBtn.addEventListener("click", () => {
    if (actionBtn.dataset.mode === "apply" && pendingShortcut) {
      const toApply = pendingShortcut;
      pendingShortcut = null;
      resetBtn();
      chrome.storage.local.set({ customShortcut: toApply }, () => {
        chrome.runtime.sendMessage(
          { type: "updateShortcut", shortcut: toApply },
          (response) => {
            if (response && response.success) {
              keyInput.value = toApply;
            } else {
              chrome.storage.local.remove(["customShortcut"]);
              keyInput.value = "사용 불가 단축키";
              setTimeout(() => loadCurrentShortcut(), 1500);
            }
          },
        );
      });
    } else {
      pendingShortcut = null;
      chrome.storage.local.remove(["customShortcut"], () => {
        chrome.runtime.sendMessage({ type: "resetShortcut" }, () => {
          loadCurrentShortcut();
        });
      });
    }
  });

  // 내보내기 버튼 → exportData() 호출
  document.getElementById("exportBtn").addEventListener("click", exportData);

  // 가져오기 버튼 → 숨겨진 file input 클릭으로 파일 선택 다이얼로그 열기
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFileInput").click();
  });
  document.getElementById("importFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = ""; // 같은 파일 재선택 허용을 위해 초기화
  });
}

// =====================================================
// 저장 통계 (이번 주 TODO 기준)
// =====================================================

// 이번 주 월요일 00:00:00 Date 객체를 반환 (주간 필터 기준점)
function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

// "2026. 5. 21." 형식의 ko-KR 날짜 문자열을 Date 객체로 변환
function parseSavedDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d+)\.\s*(\d+)\.\s*(\d+)/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

// 이번 주에 저장된 TODO 항목을 기준으로 저장 수, 완료 수, 완료율을 계산해 표시
// 설정 모달을 열 때마다 호출돼 최신 통계를 보여줌
function renderStats() {
  const el = document.getElementById("statsContent");
  if (!el) return;

  const weekStart = getWeekStart();
  const weekSaved = todoList.filter((item) => {
    const d = parseSavedDate(item.date);
    return d && d >= weekStart;
  });
  const weekDone = weekSaved.filter((item) => item.done).length;
  const total = weekSaved.length;
  const rate = total > 0 ? Math.round((weekDone / total) * 100) : 0;

  el.innerHTML = `
    <div class="stats-row"><span>저장</span><span class="stats-value">${total}개</span></div>
    <div class="stats-row"><span>완료</span><span class="stats-value">${weekDone}개</span></div>
    <div class="stats-row"><span>완료율</span><span class="stats-value">${rate}%</span></div>
  `;
}

// =====================================================
// Export / Import
// =====================================================

// 현재 todo/readlater 전체를 JSON 파일로 내보냄 (파일명에 오늘 날짜 포함)
function exportData() {
  const data = { todo: todoList, readlater: readlaterList };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quicksave-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// JSON 백업 파일을 읽어 기존 데이터와 병합 (ID 중복 항목은 건너뜀)
function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.todo) && !Array.isArray(data.readlater)) {
        throw new Error("invalid");
      }
      const importedTodo = data.todo || [];
      const importedReadlater = data.readlater || [];
      // 가져온 항목 중 기존에 없는 것만 앞에 추가 (ID 기준 중복 제거)
      const merged = (existing, imported) => [
        ...imported.filter((n) => !existing.some((t) => t.id === n.id)),
        ...existing,
      ];
      todoList = merged(todoList, importedTodo);
      readlaterList = merged(readlaterList, importedReadlater);
      chrome.storage.local.set(
        { todo: todoList, readlater: readlaterList },
        () => renderAll(),
      );
    } catch {
      alert("올바른 QuickSave 백업 파일이 아닙니다.");
    }
  };
  reader.readAsText(file);
}

// chrome.commands에서 현재 등록된 단축키를 가져와 입력창에 표시
function loadCurrentShortcut() {
  chrome.commands.getAll((commands) => {
    const cmd = commands.find((c) => c.name === "open-popup");
    const input = document.getElementById("shortcutKeyInput");
    if (input) input.value = cmd?.shortcut || "Alt+Shift+Q";
  });
}

// =====================================================
// 드래그 & 드롭 순서 변경
// =====================================================

// 목록 <ul> 내 카드들에 드래그 이벤트를 바인딩해 순서 변경 지원
// 핀 고정 항목과 일반 항목 간 경계를 넘는 드롭은 차단
function bindDragEvents(ul, listKey) {
  let dragSrcEl = null;

  ul.querySelectorAll(".item-card").forEach((card) => {
    // 드래그 시작 — 소스 카드를 기억하고 반투명 스타일 적용
    card.addEventListener("dragstart", (e) => {
      dragSrcEl = card;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    // 드래그 종료 — 스타일 원복
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      ul.querySelectorAll(".item-card").forEach((c) =>
        c.classList.remove("drag-over"),
      );
    });

    // 드래그 오버 — 핀 상태가 다른 카드 위에서는 드롭 금지 커서 표시
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      const srcPinned = dragSrcEl?.dataset.pinned === "true";
      const dstPinned = card.dataset.pinned === "true";
      if (srcPinned !== dstPinned) {
        e.dataTransfer.dropEffect = "none";
        return;
      }
      e.dataTransfer.dropEffect = "move";
      if (card !== dragSrcEl) {
        ul.querySelectorAll(".item-card").forEach((c) =>
          c.classList.remove("drag-over"),
        );
        card.classList.add("drag-over");
      }
    });

    // 드롭 — 같은 핀 그룹 내에서만 배열 순서를 변경하고 storage에 저장
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!dragSrcEl || dragSrcEl === card) return;

      const srcPinned = dragSrcEl.dataset.pinned === "true";
      const dstPinned = card.dataset.pinned === "true";
      if (srcPinned !== dstPinned) return; // 핀 경계 넘는 드롭 차단

      const cards = [...ul.querySelectorAll(".item-card")];
      const srcIdx = cards.indexOf(dragSrcEl);
      const dstIdx = cards.indexOf(card);

      const list = listKey === "todo" ? todoList : readlaterList;
      const [moved] = list.splice(srcIdx, 1);
      list.splice(dstIdx, 0, moved);

      if (listKey === "todo") {
        chrome.storage.local.set({ todo: todoList }, () => renderAll());
      } else {
        chrome.storage.local.set({ readlater: readlaterList }, () =>
          renderAll(),
        );
      }
    });
  });
}

// =====================================================
// Quick Add — URL 없이 텍스트만으로 TODO 즉시 추가
// =====================================================

// TODO 탭 상단 입력창에서 Enter 또는 + 버튼으로 텍스트만 있는 TODO 항목을 즉시 추가
// 웹페이지 우클릭 없이도 "마트 장보기" 같은 순수 텍스트 할 일을 등록 가능
function bindQuickAdd() {
  const input = document.getElementById("quickAddInput");
  const btn = document.getElementById("quickAddBtn");

  // 입력값으로 항목을 만들어 todoList 맨 앞에 추가하고 입력창 초기화
  function addQuickItem() {
    const text = input.value.trim();
    if (!text) return;
    const newItem = {
      id: Date.now(),
      title: text,
      url: "",   // URL 없는 순수 텍스트 항목
      date: new Date().toLocaleDateString("ko-KR"),
      memo: "",
      tags: [],
      done: false,
      pinned: false,
    };
    todoList.unshift(newItem);
    chrome.storage.local.set({ todo: todoList }, () => renderAll());
    input.value = "";
    input.focus();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addQuickItem();
  });
  btn.addEventListener("click", addQuickItem);
}
