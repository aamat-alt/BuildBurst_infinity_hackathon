// project.html?id=123 - project summary + the tasks this user may see.
(function () {
  const { api, requireUser, esc, initials, hours, homeFor } = window.Nova;

  const id = new URLSearchParams(window.location.search).get('id');
  const tbody = document.getElementById('tasks-tbody');
  const content = document.getElementById('project-content');

  function taskRow(t) {
    return `
<tr class="hover:bg-surface-container-low/50 transition-colors duration-150">
<td class="py-space-md px-space-lg align-top">
<div class="font-title-sm text-title-sm text-on-surface mb-0.5">${esc(t.title)}</div>
<div class="text-secondary font-body-sm text-body-sm leading-normal max-w-xl">${esc(t.description)}</div>
</td>
<td class="py-space-md px-space-lg align-top whitespace-nowrap">
<div class="flex items-center gap-space-sm">
<div class="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-fixed font-label-sm text-label-sm flex items-center justify-center font-bold">${esc(initials(t.assigneeName))}</div>
<span class="font-title-sm text-title-sm text-on-surface">${esc(t.assigneeName)}</span>
</div>
</td>
<td class="py-space-md px-space-lg align-top whitespace-nowrap">
<span class="font-mono text-body-md text-on-surface">${esc(t.deadline)}</span>
</td>
<td class="py-space-md px-space-lg align-top whitespace-nowrap text-right">
<span class="font-body-md text-body-md text-secondary font-medium">${hours(t.estimatedHours)}</span>
</td>
</tr>`;
  }

  function showNotFound(message, user) {
    const back = user ? homeFor(user) : 'dashboard.html';
    content.innerHTML = `
<div class="w-full bg-surface-container-lowest rounded-xl shadow-sm p-space-xl text-center flex flex-col items-center gap-space-md">
<span class="material-symbols-outlined text-[40px] text-secondary">folder_off</span>
<h1 class="font-headline-sm text-headline-sm text-on-surface">${esc(message)}</h1>
<a class="font-label-md text-label-md text-primary hover:underline" href="${back}">← Back</a>
</div>`;
  }

  requireUser().then(async (user) => {
    if (!id) return showNotFound('No project selected', user);
    try {
      const { project } = await api(`/projects/${encodeURIComponent(id)}`);
      document.title = `${project.name} · NovaWorks`;
      document.getElementById('client-name').textContent = project.clientName;
      document.getElementById('project-name').textContent = project.name;
      document.getElementById('project-desc').textContent = project.description || '';
      document.getElementById('manager-initials').textContent = initials(project.managerName);
      document.getElementById('manager-name').textContent = project.managerName;
      document.getElementById('project-deadline').textContent = project.deadline;
      document.getElementById('tasks-note').textContent = user.role === 'AGENT'
        ? `· your ${project.tasks.length} task${project.tasks.length === 1 ? '' : 's'}, ${hours(project.totalHours)}`
        : `· ${project.tasks.length} task${project.tasks.length === 1 ? '' : 's'}, ${hours(project.totalHours)}`;
      tbody.innerHTML = project.tasks.length
        ? project.tasks.map(taskRow).join('')
        : '<tr><td colspan="4" class="py-space-xl px-space-lg text-center text-secondary">No tasks in this project yet.</td></tr>';
    } catch (err) {
      if (err.status === 404) showNotFound('Project not found', user);
      else if (err.status !== 401) showNotFound(err.message, user);
    }
  }).catch(() => { /* 401 already redirected */ });
})();
