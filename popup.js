// =====================================================
// popup.js - QuickSave 팝업 동작 로직 (전체 수정본)
// =====================================================

// --- 상태 변수 ---
let currentTab = "todo"; // "todo" | "readlater" | "search"
let selectedTag = "전체";
let searchQuery = "";
let todoList = [];
let readlaterList = [];
let editingId = null; // 현재 편집 중인 항목 id
let editingListKey = null; // "todo" | "readlater"

// =====================================================
// 1. 초기 실행
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  bindTabEvents();
  bindSearchEvent();
  bindClearEvent();
  bindEditModal();
  bindSettingsModal();
});

// 창 닫힐 때 위치 저장 (다음에 같은 위치에서 열리도록)
window.addEventListener("beforeunload", () => {
  chrome.storage.local.set({
    popupX: window.screenX,
    popupY: window.screenY,
  });
});

// =====================================================
// 2. 데이터 불러오기
// =====================================================
function loadData() {
  chrome.storage.local.get(
    ["todo", "readlater", "shortcutEnabled"],
    (result) => {
      todoList = result.todo || [];
      readlaterList = result.readlater || [];

      // 단축키 토글 상태 복원 (기본값: 활성화)
      const toggle = document.getElementById("shortcutToggle");
      toggle.checked = result.shortcutEnabled !== false;

      renderAll();
    },
  );
}

// =====================================================
// 3. 전체 렌더링
// =====================================================
function renderAll() {
  renderTagFilter();
  renderList();
}

// =====================================================
// 4. 태그 필터 버튼 렌더링
// — "전체" 버튼 클릭 시 selectedTag를 "전체"로 설정하고 active 처리
// =====================================================
function renderTagFilter() {
  // 검색 탭일 때는 todo + readlater 합쳐서 태그 추출
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
    // ★ 수정: selectedTag와 같으면 active 클래스 부여 ("전체" 포함)
    btn.className = "tag-filter-btn" + (tag === selectedTag ? " active" : "");
    btn.textContent = tag === "전체" ? "전체" : `#${tag}`;
    btn.addEventListener("click", () => {
      selectedTag = tag; // "전체" 클릭 시 selectedTag = "전체" 로 정상 설정
      renderAll();
    });
    container.appendChild(btn);
  });
}

// =====================================================
// 5. 항목 목록 렌더링
// — 검색어 있으면 currentTab 무관하게 전체에서 검색
// =====================================================
function renderList() {
  let list;

  if (currentTab === "search") {
    // 검색 탭: todo + readlater 합쳐서 검색
    list = [...todoList, ...readlaterList];
  } else {
    list = currentTab === "todo" ? todoList : readlaterList;
  }

  // 태그 필터
  let filtered = list;
  if (selectedTag !== "전체") {
    filtered = list.filter((item) => (item.tags || []).includes(selectedTag));
  }

  // 검색어 필터
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
    // 검색 탭일 때 이 항목이 todo인지 readlater인지 판별
    const listKey =
      currentTab === "search"
        ? todoList.find((t) => t.id === item.id)
          ? "todo"
          : "readlater"
        : currentTab;

    const li = createItemCard(item, listKey);
    ul.appendChild(li);
  });
}

// =====================================================
// 6. 항목 카드 생성
// — 편집 버튼(✏️) 추가 (방법 A)
// =====================================================
function createItemCard(item, listKey) {
  const li = document.createElement("li");
  li.className = "item-card" + (item.done ? " done" : "");
  li.dataset.id = item.id;

  const topRow = document.createElement("div");
  topRow.className = "item-top";

  // 체크박스 (TODO만)
  if (listKey === "todo") {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "item-checkbox";
    checkbox.checked = item.done;
    checkbox.addEventListener("change", () => toggleDone(item.id));
    topRow.appendChild(checkbox);
  }

  // 제목
  const title = document.createElement("span");
  title.className = "item-title";
  title.textContent = item.title || "제목 없음";
  title.title = item.url;
  title.addEventListener("click", () => chrome.tabs.create({ url: item.url }));
  topRow.appendChild(title);

  // ★ 추가: 편집 버튼 (방법 A — 메모/태그 수정)
  const editBtn = document.createElement("button");
  editBtn.className = "item-edit";
  editBtn.textContent = "✏️";
  editBtn.title = "메모/태그 편집";
  editBtn.addEventListener("click", () => openEditModal(item, listKey));
  topRow.appendChild(editBtn);

  // 삭제 버튼
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "item-delete";
  deleteBtn.textContent = "🗑️";
  deleteBtn.title = "삭제";
  deleteBtn.addEventListener("click", () => deleteItem(item.id, listKey));
  topRow.appendChild(deleteBtn);

  li.appendChild(topRow);

  // 메모
  if (item.memo && item.memo.trim() !== "") {
    const memo = document.createElement("div");
    memo.className = "item-memo";
    memo.textContent = `📝 ${item.memo}`;
    li.appendChild(memo);
  }

  // 하단: 태그 + 날짜
  const bottomRow = document.createElement("div");
  bottomRow.className = "item-bottom";

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "item-tags";

  // 검색 탭: 타입 뱃지를 태그와 같은 행에 표시
  if (currentTab === "search") {
    const typeBadge = document.createElement("span");
    typeBadge.className =
      "item-type-badge " + (listKey === "todo" ? "badge-todo" : "badge-readlater");
    typeBadge.textContent = listKey === "todo" ? "✅ TODO" : "📌 Read it later";
    tagsWrap.appendChild(typeBadge);
  }

  (item.tags || []).forEach((tag) => {
    const tagEl = document.createElement("span");
    tagEl.className = "item-tag";
    tagEl.textContent = `#${tag}`;
    tagsWrap.appendChild(tagEl);
  });
  bottomRow.appendChild(tagsWrap);

  const date = document.createElement("span");
  date.className = "item-date";
  date.textContent = item.date || "";
  bottomRow.appendChild(date);

  li.appendChild(bottomRow);
  return li;
}

// =====================================================
// 7. 완료 토글
// =====================================================
function toggleDone(id) {
  const idx = todoList.findIndex((item) => item.id === id);
  if (idx === -1) return;
  todoList[idx].done = !todoList[idx].done;
  chrome.storage.local.set({ todo: todoList }, () => renderAll());
}

// =====================================================
// 8. 항목 삭제
// — listKey 파라미터로 todo/readlater 구분 (검색 탭 대응)
// =====================================================
function deleteItem(id, listKey) {
  if (listKey === "todo") {
    todoList = todoList.filter((item) => item.id !== id);
    chrome.storage.local.set({ todo: todoList }, () => renderAll());
  } else {
    readlaterList = readlaterList.filter((item) => item.id !== id);
    chrome.storage.local.set({ readlater: readlaterList }, () => renderAll());
  }
}

// =====================================================
// 9. 전체 삭제
// =====================================================
function bindClearEvent() {
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    const label =
      currentTab === "todo"
        ? "TODO"
        : currentTab === "readlater"
          ? "읽기 목록"
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
        chrome.storage.local.set({ todo: [], readlater: [] }, () => renderAll());
      }
    });
  });
}

// 커스텀 confirm 모달
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
// 10. 탭 전환 이벤트
// =====================================================
function bindTabEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      currentTab = btn.dataset.tab;
      selectedTag = "전체";

      // 검색 탭이 아닌 탭을 누르면 검색어 초기화
      if (currentTab !== "search") {
        searchQuery = "";
        document.getElementById("searchInput").value = "";
        document.getElementById("searchTab").style.display = "none";
      }

      renderAll();
    });
  });
}

// =====================================================
// 11. 검색 이벤트
// — 검색어 입력 시 자동으로 "검색결과" 탭 활성화 (전체 탭 통합 검색)
// — 검색어 지우면 이전 탭으로 복귀
// =====================================================
function bindSearchEvent() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    const searchTabBtn = document.getElementById("searchTab");

    if (searchQuery.trim() !== "") {
      // 검색 탭 표시 + 활성화
      searchTabBtn.style.display = "";
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      searchTabBtn.classList.add("active");
      currentTab = "search";
      selectedTag = "전체";
    } else {
      // 검색어 없으면 검색 탭 숨기고 TODO 탭으로 복귀
      searchTabBtn.style.display = "none";
      currentTab = "todo";
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelector(".tab-btn[data-tab='todo']")
        .classList.add("active");
    }

    renderAll();
  });
}

// =====================================================
// 12. 메모/태그 편집 모달 (방법 A)
// =====================================================
function openEditModal(item, listKey) {
  editingId = item.id;
  editingListKey = listKey;

  document.getElementById("editMemoInput").value = item.memo || "";
  document.getElementById("editTagInput").value = (item.tags || []).join(",");
  document.getElementById("editModal").style.display = "flex";
}

function bindEditModal() {
  // 엔터키로 저장
  ["editMemoInput", "editTagInput"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("editSaveBtn").click();
      }
    });
  });

  // 취소
  document.getElementById("editCancelBtn").addEventListener("click", () => {
    document.getElementById("editModal").style.display = "none";
    editingId = null;
    editingListKey = null;
  });

  // 저장
  document.getElementById("editSaveBtn").addEventListener("click", () => {
    if (editingId === null) return;

    const newMemo = document.getElementById("editMemoInput").value.trim();
    const rawTags = document.getElementById("editTagInput").value;
    const newTags = rawTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");

    if (editingListKey === "todo") {
      const idx = todoList.findIndex((item) => item.id === editingId);
      if (idx !== -1) {
        todoList[idx].memo = newMemo;
        todoList[idx].tags = newTags;
        chrome.storage.local.set({ todo: todoList });
      }
    } else {
      const idx = readlaterList.findIndex((item) => item.id === editingId);
      if (idx !== -1) {
        readlaterList[idx].memo = newMemo;
        readlaterList[idx].tags = newTags;
        chrome.storage.local.set({ readlater: readlaterList });
      }
    }

    document.getElementById("editModal").style.display = "none";
    editingId = null;
    editingListKey = null;
    renderAll();
  });
}

// =====================================================
// 13. 설정 모달 (단축키 ON/OFF + 단축키 실시간 캡처)
// =====================================================
function bindSettingsModal() {
  const keyInput = document.getElementById("shortcutKeyInput");
  const actionBtn = document.getElementById("shortcutResetBtn");

  // 상태 변수
  let isCapturing = false;
  let heldMods = new Set();   // 현재 눌린 수식키 (Control, Alt, Shift)
  let heldNonMod = null;      // 현재 눌린 일반 키
  let pendingShortcut = null; // 적용 대기 중인 단축키 문자열

  const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta", "CapsLock"];
  const KEY_ALIAS = {
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    " ": "Space",
  };

  function normalizeKey(key) {
    if (KEY_ALIAS[key]) return KEY_ALIAS[key];
    return key.length === 1 ? key.toUpperCase() : key;
  }

  function getModParts() {
    const parts = [];
    if (heldMods.has("Control")) parts.push("Ctrl");
    if (heldMods.has("Alt")) parts.push("Alt");
    if (heldMods.has("Shift")) parts.push("Shift");
    return parts;
  }

  function refreshDisplay() {
    if (pendingShortcut) {
      keyInput.value = pendingShortcut;
      return;
    }
    const mods = getModParts();
    if (heldNonMod) {
      if (mods.length > 0) keyInput.value = [...mods, normalizeKey(heldNonMod)].join("+");
    } else if (mods.length > 0) {
      keyInput.value = mods.join("+");
    } else {
      keyInput.value = "키를 누르세요...";
    }
  }

  function resetBtn() {
    actionBtn.textContent = "초기화";
    actionBtn.dataset.mode = "reset";
  }

  function setApplyBtn() {
    actionBtn.textContent = "적용";
    actionBtn.dataset.mode = "apply";
  }

  function cancelCapture() {
    isCapturing = false;
    heldMods.clear();
    heldNonMod = null;
    pendingShortcut = null;
    keyInput.classList.remove("capturing");
    resetBtn();
    loadCurrentShortcut();
  }

  // 설정 버튼 → 모달 열기
  document.getElementById("settingsBtn").addEventListener("click", () => {
    document.getElementById("settingsModal").style.display = "flex";
    loadCurrentShortcut();
  });

  // 닫기 버튼
  document.getElementById("settingsCloseBtn").addEventListener("click", () => {
    cancelCapture();
    document.getElementById("settingsModal").style.display = "none";
  });

  // 단축키 활성화 토글
  document.getElementById("shortcutToggle").addEventListener("change", (e) => {
    chrome.storage.local.set({ shortcutEnabled: e.target.checked });
  });

  // 입력창 클릭 → 캡처 시작 (apply 대기 중이면 다시 캡처)
  keyInput.addEventListener("click", () => {
    pendingShortcut = null;
    heldMods.clear();
    heldNonMod = null;
    isCapturing = true;
    keyInput.value = "키를 누르세요...";
    keyInput.classList.add("capturing");
    resetBtn();
  });

  // 포커스 잃으면 취소
  keyInput.addEventListener("blur", () => {
    if (isCapturing) cancelCapture();
  });

  // 키 누름 — 실시간 업데이트
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

  // 키 뗌 — 모든 키를 떼면 적용 대기 상태로 전환
  keyInput.addEventListener("keyup", (e) => {
    if (!isCapturing) return;

    if (MODIFIER_KEYS.includes(e.key)) {
      heldMods.delete(e.key);
    } else if (e.key === heldNonMod) {
      heldNonMod = null;
    }

    if (pendingShortcut && heldMods.size === 0 && !heldNonMod) {
      // 완성된 조합 + 모든 키 해제 → 적용 대기
      isCapturing = false;
      keyInput.classList.remove("capturing");
      keyInput.value = pendingShortcut;
      setApplyBtn();
    } else {
      refreshDisplay();
    }
  });

  // 초기화 / 적용 버튼
  actionBtn.addEventListener("click", () => {
    if (actionBtn.dataset.mode === "apply" && pendingShortcut) {
      const toApply = pendingShortcut;
      pendingShortcut = null;
      resetBtn();
      chrome.storage.local.set({ customShortcut: toApply }, () => {
        chrome.runtime.sendMessage({ type: "updateShortcut", shortcut: toApply }, (response) => {
          if (response && response.success) {
            keyInput.value = toApply;
          } else {
            chrome.storage.local.remove(["customShortcut"]);
            keyInput.value = "사용 불가 단축키";
            setTimeout(() => loadCurrentShortcut(), 1500);
          }
        });
      });
    } else {
      // 초기화 → Alt+Shift+Q 복원
      pendingShortcut = null;
      chrome.storage.local.remove(["customShortcut"], () => {
        chrome.runtime.sendMessage({ type: "resetShortcut" }, () => {
          loadCurrentShortcut();
        });
      });
    }
  });
}

function loadCurrentShortcut() {
  chrome.storage.local.get(["customShortcut"], (result) => {
    const input = document.getElementById("shortcutKeyInput");
    if (input) input.value = result.customShortcut || "Alt+Shift+Q";
  });
}

