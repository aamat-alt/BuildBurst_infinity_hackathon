// workspace.html - "My Tasks" (agents: own tasks; managers: their projects; admin: all)
// and the read-only Team Directory. Open with #directory to land on the directory tab.
(function () {
  const { api, requireUser, esc, initials, hours, roleLabel, messageBox } = window.Nova;

  const tasksList = document.getElementById('tasks-list');
  const dirGrid = document.getElementById('directory-grid');

  const ROLE_STYLE = {
    ADMIN: { avatar: 'bg-secondary-container text-on-secondary-container', badge: 'bg-secondary-fixed text-on-secondary-fixed-variant' },
    MANAGER: { avatar: 'bg-primary-fixed text-on-primary-fixed', badge: 'bg-surface-variant text-on-surface-variant' },
    AGENT: { avatar: 'bg-primary text-on-primary', badge: 'bg-surface-container-high text-on-surface' },
  };

  function taskItem(t, project, user) {
    // Agents see who leads the project; managers/admin see who the task is assigned to.
    const showLead = user.role === 'AGENT';
    const personLabel = showLead ? 'Project Lead' : 'Assignee';
    const personName = showLead ? (project ? project.managerName : '') : t.assigneeName;
    const context = project ? `${project.clientName} • ${t.projectName}` : t.projectName;
    return `
<a class="block p-space-lg hover:bg-surface-container-low/40 transition-colors duration-150" href="project.html?id=${encodeURIComponent(t.projectId)}">
<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
<div class="flex-1 min-w-0 pr-0 lg:pr-space-lg">
<div class="flex items-center gap-space-xs flex-wrap mb-1.5">
<span class="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-secondary font-medium tracking-tight">${esc(context)}</span>
</div>
<h3 class="font-title-sm text-title-sm text-on-surface font-semibold">${esc(t.title)}</h3>
<p class="font-body-md text-body-md text-secondary mt-1">${esc(t.description)}</p>
</div>
<div class="flex items-center flex-wrap sm:flex-nowrap gap-space-lg text-left shrink-0">
<div class="flex items-center min-w-[130px]">
<div class="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-label-sm text-label-sm font-semibold tracking-wider mr-2">${esc(initials(personName))}</div>
<div class="flex flex-col">
<span class="font-caption text-caption text-secondary uppercase">${personLabel}</span>
<span class="font-body-sm text-body-sm font-medium text-on-surface">${esc(personName)}</span>
</div>
</div>
<div class="flex flex-col min-w-[100px]">
<span class="font-caption text-caption text-secondary uppercase">Deadline</span>
<span class="font-mono text-body-sm text-on-surface font-medium tracking-tight">${esc(t.deadline)}</span>
</div>
<div class="flex flex-col min-w-[70px]">
<span class="font-caption text-caption text-secondary uppercase">Estimated</span>
<span class="font-body-sm text-body-sm font-semibold text-on-surface">${hours(t.estimatedHours)}</span>
</div>
</div>
</div>
</a>`;
  }

  function directoryCard(u) {
    const s = ROLE_STYLE[u.role] || ROLE_STYLE.AGENT;
    const skills = Array.isArray(u.skills) ? u.skills : [];
    return `
<div class="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
<div>
<div class="flex items-center justify-between gap-space-sm mb-space-md">
<div class="w-12 h-12 rounded-full ${s.avatar} flex items-center justify-center font-headline-sm text-headline-sm font-bold tracking-tight">${esc(initials(u.name))}</div>
<span class="font-label-sm text-label-sm px-2.5 py-0.5 rounded-full ${s.badge} font-semibold">${esc(roleLabel(u.role))}</span>
</div>
<h3 class="font-title-md text-title-md text-on-surface font-semibold">${esc(u.name)}</h3>
<p class="font-body-sm text-body-sm text-primary font-medium mt-0.5">${esc(u.specialization)}</p>
<p class="font-body-sm text-body-sm text-secondary mt-0.5">${esc(u.email)} · ${esc(u.id)}</p>
</div>
<div class="flex flex-wrap gap-1.5 mt-space-lg pt-space-md">
${skills.map((sk) => `<span class="font-caption text-caption px-2 py-0.5 rounded-md bg-surface-container text-secondary">${esc(sk)}</span>`).join('')}
</div>
</div>`;
  }

  function applyRoleText(user) {
    document.getElementById('workspace-context').textContent = user.name;
    const mine = user.role === 'AGENT';
    document.getElementById('tasks-tab-label').textContent = mine ? 'My Tasks' : 'Tasks';
    document.getElementById('tasks-subtitle').textContent = {
      AGENT: 'Deliverables assigned to you across client projects',
      MANAGER: 'All deliverables in the projects you manage',
      ADMIN: 'All deliverables across every client project',
    }[user.role] || '';
    document.getElementById('assignee-key').textContent = mine ? 'Assignee:' : 'Scope:';
    document.getElementById('assignee-label').textContent = mine
      ? `${user.name} (${user.specialization || roleLabel(user.role)})`
      : (user.role === 'ADMIN' ? 'All projects' : `${user.name}'s projects`);
  }

  async function load(user) {
    const [tasksRes, projectsRes, usersRes] = await Promise.allSettled([
      api('/tasks'), api('/projects'), api('/users'),
    ]);

    // Tasks
    if (tasksRes.status === 'fulfilled') {
      const tasks = tasksRes.value.tasks;
      const projects = projectsRes.status === 'fulfilled' ? projectsRes.value.projects : [];
      const byId = new Map(projects.map((p) => [p.id, p]));
      tasksList.innerHTML = tasks.length
        ? tasks.map((t) => taskItem(t, byId.get(t.projectId), user)).join('')
        : `<div class="p-space-xl text-center text-secondary font-body-md text-body-md">No tasks ${user.role === 'AGENT' ? 'assigned to you' : 'to show'} yet.</div>`;
      const total = tasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 0), 0);
      document.getElementById('tasks-count').textContent = tasks.length;
      document.getElementById('tasks-footer-count').textContent =
        `Displaying ${tasks.length} deliverable${tasks.length === 1 ? '' : 's'}${user.role === 'AGENT' ? ' assigned to you' : ''}`;
      document.getElementById('tasks-total-hours').textContent = hours(total).replace('hrs', 'hours');
    } else if (tasksRes.reason.status !== 401) {
      tasksList.innerHTML = `<div class="p-space-lg">${messageBox(tasksRes.reason.message, 'error')}</div>`;
    }

    // Directory
    if (usersRes.status === 'fulfilled') {
      const users = usersRes.value.users;
      document.getElementById('directory-count').textContent = users.length;
      dirGrid.innerHTML = users.map(directoryCard).join('');
    } else if (usersRes.reason.status !== 401) {
      dirGrid.innerHTML = messageBox(usersRes.reason.message, 'error');
    }
  }

  // Keep the URL hash in step with the tab buttons, so the header's
  // "Team Directory" link and the browser back button both work.
  const originalSwitchTab = window.switchTab;
  window.switchTab = function (target) {
    originalSwitchTab(target);
    const url = window.location.pathname + window.location.search + (target === 'directory' ? '#directory' : '');
    history.replaceState(null, '', url);
  };

  function syncTabWithHash() {
    originalSwitchTab(window.location.hash === '#directory' ? 'directory' : 'tasks');
  }
  window.addEventListener('hashchange', syncTabWithHash);
  syncTabWithHash();

  requireUser()
    .then((user) => { applyRoleText(user); return load(user); })
    .catch(() => { /* 401 already redirected */ });
})();
