// =====================================================
// popup.js - QuickSave 팝업 동작 로직
// =====================================================

// --- 상태 변수 ---
let currentTab = "todo"; // "todo" | "readlater" | "search"
let selectedTag = "전체";
let searchQuery = "";
let todoList = [];
let readlaterList = [];
let editingId = null;
let editingListKey = null;

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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.todo) todoList = changes.todo.newValue || [];
  if (changes.readlater) readlaterList = changes.readlater.newValue || [];
  if (changes.todo || changes.readlater) renderAll();
});

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
// =====================================================
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

// =====================================================
// 5. 항목 목록 렌더링
// =====================================================
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
// 6. 항목 카드 생성
// =====================================================
function createItemCard(item, listKey) {
  const li = document.createElement("li");
  li.className = "item-card" + (item.done ? " done" : "");
  li.dataset.id = item.id;
  li.draggable = currentTab !== "search";

  const topRow = document.createElement("div");
  topRow.className = "item-top";

  // 드래그 핸들
  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>`;
  if (currentTab === "search") dragHandle.style.visibility = "hidden";
  topRow.appendChild(dragHandle);

  // 체크박스 (TODO만)
  if (listKey === "todo") {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "item-checkbox";
    checkbox.checked = item.done;
    checkbox.addEventListener("change", () => toggleDone(item.id));
    topRow.appendChild(checkbox);
  }

  // 파비콘
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

  // 제목
  const title = document.createElement("span");
  title.className = "item-title";
  title.textContent = item.title || "제목 없음";
  title.title = item.url;
  title.addEventListener("click", () => chrome.tabs.create({ url: item.url }));
  topRow.appendChild(title);

  // 편집 버튼
  const editBtn = document.createElement("button");
  editBtn.className = "item-edit";
  editBtn.title = "메모/태그 편집";
  editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
  editBtn.addEventListener("click", () => openEditModal(item, listKey));
  topRow.appendChild(editBtn);

  // 삭제 버튼
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "item-delete";
  deleteBtn.title = "삭제";
  deleteBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
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

  if (currentTab === "search") {
    const typeBadge = document.createElement("span");
    typeBadge.className =
      "item-type-badge " +
      (listKey === "todo" ? "badge-todo" : "badge-readlater");
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
        chrome.storage.local.set({ todo: [], readlater: [] }, () =>
          renderAll(),
        );
      }
    });
  });
}

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
  function handleOk() {
    close();
    onConfirm();
  }
  function handleCancel() {
    close();
  }

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
// =====================================================
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
    } else {
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
// 12. 메모/태그 편집 모달
// =====================================================
function openEditModal(item, listKey) {
  editingId = item.id;
  editingListKey = listKey;

  document.getElementById("editMemoInput").value = item.memo || "";
  document.getElementById("editTagInput").value = (item.tags || []).join(",");
  document.getElementById("editModal").style.display = "flex";
}

function bindEditModal() {
  ["editMemoInput", "editTagInput"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("editSaveBtn").click();
      }
    });
  });

  document.getElementById("editCancelBtn").addEventListener("click", () => {
    document.getElementById("editModal").style.display = "none";
    editingId = null;
    editingListKey = null;
  });

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
// 13. 설정 모달
// =====================================================
function bindSettingsModal() {
  const keyInput = document.getElementById("shortcutKeyInput");
  const actionBtn = document.getElementById("shortcutResetBtn");

  let isCapturing = false;
  let heldMods = new Set();
  let heldNonMod = null;
  let pendingShortcut = null;

  const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta", "CapsLock"];
  const KEY_ALIAS = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
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
      if (mods.length > 0)
        keyInput.value = [...mods, normalizeKey(heldNonMod)].join("+");
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

  document.getElementById("settingsBtn").addEventListener("click", () => {
    document.getElementById("settingsModal").style.display = "flex";
    loadCurrentShortcut();
  });

  document.getElementById("settingsCloseBtn").addEventListener("click", () => {
    cancelCapture();
    document.getElementById("settingsModal").style.display = "none";
  });

  document.getElementById("shortcutToggle").addEventListener("change", (e) => {
    chrome.storage.local.set({ shortcutEnabled: e.target.checked });
  });

  keyInput.addEventListener("click", () => {
    pendingShortcut = null;
    heldMods.clear();
    heldNonMod = null;
    isCapturing = true;
    keyInput.value = "키를 누르세요...";
    keyInput.classList.add("capturing");
    resetBtn();
  });

  keyInput.addEventListener("blur", () => {
    if (isCapturing) cancelCapture();
  });

  keyInput.addEventListener("keydown", (e) => {
    if (!isCapturing) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      cancelCapture();
      return;
    }

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
}

function loadCurrentShortcut() {
  chrome.commands.getAll((commands) => {
    const cmd = commands.find((c) => c.name === "open-popup");
    const input = document.getElementById("shortcutKeyInput");
    if (input) input.value = cmd?.shortcut || "Alt+Shift+Q";
  });
}

// =====================================================
// 14. 드래그로 순서 변경
// =====================================================
function bindDragEvents(ul, listKey) {
  let dragSrcEl = null;

  ul.querySelectorAll(".item-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      dragSrcEl = card;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      ul.querySelectorAll(".item-card").forEach((c) =>
        c.classList.remove("drag-over"),
      );
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (card !== dragSrcEl) {
        ul.querySelectorAll(".item-card").forEach((c) =>
          c.classList.remove("drag-over"),
        );
        card.classList.add("drag-over");
      }
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!dragSrcEl || dragSrcEl === card) return;

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
