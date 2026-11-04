'use strict';
const $ = (id) => document.getElementById(id);
const state = { tasks: [], filter: 'all', editing: null, loading: false, request: 0, mutating: false, canEdit: false };
const priorities = { normal: '보통', high: '중요', low: '여유롭게' };
function localDay(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function message(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
}
async function api(path, options = {}) {
  const response = await fetch(`/planner/api${path}`, { ...options, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((x) => x.msg).join(' / ') : data.detail;
    throw new Error(detail || '요청을 처리하지 못했습니다.');
  }
  return data;
}
function clearEdit() {
  state.editing = null;
  $('task-form').reset();
  $('save').textContent = '＋ 계획 추가';
  $('cancel-edit').hidden = true;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, action) {
  const node = element('button', '', label);
  node.type = 'button';
  node.disabled = state.mutating || state.loading;
  node.addEventListener('click', action);
  return node;
}
function render() {
  const active = state.tasks.filter((task) => !task.archived);
  const completed = active.filter((task) => task.done).length;
  const percent = active.length ? Math.round(completed / active.length * 100) : 0;
  $('percent').replaceChildren(document.createTextNode(String(percent)), element('span', '', '%'));
  $('progress').value = percent;
  $('summary').textContent = active.length ? `${active.length}개의 계획 중 ${completed}개 완료` : '오늘의 첫 계획을 적어 보세요.';
  $('day-heading').textContent = new Date(`${$('day').value}T12:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const visible = state.tasks.filter((task) => {
    if (state.filter === 'archived') return task.archived;
    if (task.archived) return false;
    return state.filter === 'all' || (state.filter === 'done' ? task.done : !task.done);
  });
  $('tasks').replaceChildren();
  if (state.loading) {
    $('tasks').append(element('div', 'empty', '계획을 불러오는 중입니다…'));
    return;
  }
  if (!visible.length) {
    const empty = element('div', 'empty');
    empty.append(element('strong', '', state.filter === 'all' ? '아직 비어 있는 하루' : '이곳은 아직 비어 있어요'),
      document.createTextNode(state.filter === 'all' ? (state.canEdit ? '작은 계획 하나부터 시작해 보세요.' : '다른 날짜의 공개 계획을 확인해 보세요.') : '다른 필터에서 계획을 확인해 보세요.'));
    $('tasks').append(empty);
  }
  for (const task of visible) {
    const row = element('article', `task${task.done ? ' done' : ''}`);
    const check = element('input', 'task-check');
    check.type = 'checkbox';
    check.checked = task.done;
    check.disabled = !state.canEdit || task.archived || state.mutating;
    check.setAttribute('aria-label', `${task.title} 완료 표시`);
    check.addEventListener('change', () => update(task, { done: check.checked }));
    const content = element('div', 'task-content');
    const meta = element('div', 'task-meta');
    meta.append(element('span', `badge ${task.priority}`, priorities[task.priority]));
    meta.append(element('span', '', task.start_time ? `${task.start_time}${task.end_time ? ` – ${task.end_time}` : ''}` : '시간 미지정'));
    content.append(element('p', 'task-title', task.title), meta);
    const actions = element('div', 'task-actions');
    if (state.canEdit) {
      if (!task.archived) actions.append(button('수정', () => edit(task)));
      actions.append(button(task.archived ? '복원' : '보관', () => {
        if (!task.archived && !confirm('이 계획을 보관함으로 옮길까요? 데이터는 삭제되지 않습니다.')) return;
        update(task, { archived: !task.archived });
      }));
    }
    row.append(check, content, actions);
    $('tasks').append(row);
  }
}
async function load() {
  if (!$('day').value) return;
  const request = ++state.request;
  const day = $('day').value;
  state.loading = true;
  $('tasks').setAttribute('aria-busy', 'true');
  message('');
  render();
  try {
    const tasks = await api(`/tasks?day=${encodeURIComponent(day)}&include_archived=true`);
    if (request !== state.request) return;
    state.tasks = tasks;
  } catch (error) {
    if (request !== state.request) return;
    state.tasks = [];
    message(`불러오기 실패: ${error.message}`, true);
  } finally {
    if (request === state.request) {
      state.loading = false;
      $('tasks').setAttribute('aria-busy', 'false');
      render();
    }
  }
}
function edit(task) {
  if (!state.canEdit) return;
  state.editing = task;
  $('title').value = task.title;
  $('start-time').value = task.start_time || '';
  $('end-time').value = task.end_time || '';
  $('priority').value = task.priority;
  $('save').textContent = '변경 저장';
  $('cancel-edit').hidden = false;
  $('title').focus();
}
function payload(task) {
  return { title: task.title, task_date: task.task_date, start_time: task.start_time, end_time: task.end_time,
    priority: task.priority, done: task.done, archived: task.archived, version: task.version };
}
async function update(task, changes) {
  if (!state.canEdit || state.mutating) return;
  state.mutating = true;
  render();
  try {
    const saved = await api(`/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({ ...payload(task), ...changes }) });
    if (state.editing?.id === task.id) state.editing = saved;
    await load();
    message('변경 사항을 저장했습니다.');
  } catch (error) {
    message(error.message, true);
  } finally {
    state.mutating = false;
    render();
  }
}
$('task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.canEdit || state.mutating || state.loading || !$('day').value) return;
  const task = { title: $('title').value.trim(), task_date: $('day').value, start_time: $('start-time').value || null,
    end_time: $('end-time').value || null, priority: $('priority').value };
  if (!task.title) return message('할 일을 입력해 주세요.', true);
  if (task.end_time && (!task.start_time || task.end_time <= task.start_time)) {
    return message('시작·종료 시간을 확인해 주세요. 종료 시간은 시작 시간보다 늦어야 합니다.', true);
  }
  state.mutating = true;
  $('save').disabled = true;
  render();
  try {
    const current = state.editing;
    await api(current ? `/tasks/${current.id}` : '/tasks', {
      method: current ? 'PUT' : 'POST', body: JSON.stringify(current ? { ...payload(current), ...task } : task)
    });
    clearEdit();
    await load();
    message('계획을 저장했습니다.');
  } catch (error) {
    message(error.message, true);
  } finally {
    state.mutating = false;
    $('save').disabled = false;
    render();
  }
});
function changeDay(day) {
  if (state.mutating) return;
  if (state.editing && !confirm('저장하지 않은 수정 내용을 닫고 날짜를 바꿀까요?')) {
    $('day').value = state.editing.task_date;
    return;
  }
  $('day').value = day;
  state.tasks = [];
  clearEdit();
  load();
}
$('day').value = localDay();
$('day').addEventListener('change', () => changeDay($('day').value));
$('previous').addEventListener('click', () => { const day = new Date(`${$('day').value}T12:00:00`); day.setDate(day.getDate() - 1); changeDay(localDay(day)); });
$('next').addEventListener('click', () => { const day = new Date(`${$('day').value}T12:00:00`); day.setDate(day.getDate() + 1); changeDay(localDay(day)); });
$('today').addEventListener('click', () => changeDay(localDay()));
$('cancel-edit').addEventListener('click', clearEdit);
$('refresh').addEventListener('click', () => { if (!state.mutating) load(); });
document.querySelectorAll('[data-filter]').forEach((node) => node.addEventListener('click', () => {
  state.filter = node.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === node));
  render();
}));
async function boot() {
  try {
    const config = await api('/config');
    state.canEdit = config.can_edit === true;
    $('composer').hidden = !state.canEdit;
    $('access-label').textContent = state.canEdit ? 'SSH · 편집 가능' : '공개 · 조회 전용';
    $('access-note').textContent = state.canEdit
      ? 'SSH 터널로 접속했습니다. 변경한 일정은 공개 페이지에도 표시됩니다.'
      : '공개된 일정을 조회하는 공간입니다. 편집은 SSH 터널에서만 가능합니다.';
    await load();
  } catch (error) {
    message(`접속 권한 확인 실패: ${error.message}`, true);
  }
}
boot();
