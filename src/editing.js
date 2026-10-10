// 两个 content script world 各自记录输入状态，不改选区，也不拦截编辑器事件。
export const EDIT_IDLE_MS = 500;

function editorInput(target) {
  const el = target?.nodeType === 1 ? target : target?.parentElement;
  if (!el || el.closest?.("[id^='wxdoc-'], #wxov-float-layer")) return false;
  if (el.id === "melo-hidden-editor") return true;
  return Boolean(el.isContentEditable && el.closest?.("#root-editable, #sc-page-content, .surface"));
}

export function watchEditing({ onIdle, onEdit } = {}) {
  let composing = false;
  let until = 0;
  let timer = 0;

  function scheduleIdle() {
    window.clearTimeout(timer);
    timer = 0;
    if (composing) return;
    timer = window.setTimeout(function () {
      timer = 0;
      if (composing) return;
      if (Date.now() < until) scheduleIdle();
      else onIdle?.();
    }, Math.max(0, until - Date.now()));
  }

  function onActivity(event) {
    if (!editorInput(event.target)) return;
    if (event.type === "keydown") {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key?.length !== 1 && !["Backspace", "Delete", "Enter", "Tab"].includes(event.key)) return;
    }
    if (event.type === "compositionstart") composing = true;
    if (event.type === "compositionend" || event.type === "focusout") composing = false;
    until = Date.now() + EDIT_IDLE_MS;
    onEdit?.();
    scheduleIdle();
  }

  const events = ["keydown", "beforeinput", "input", "compositionstart", "compositionupdate", "compositionend", "focusout"];
  events.forEach((type) => document.addEventListener(type, onActivity, true));

  return {
    isEditing() {
      return composing || Date.now() < until;
    },
    dispose() {
      window.clearTimeout(timer);
      events.forEach((type) => document.removeEventListener(type, onActivity, true));
    },
  };
}
