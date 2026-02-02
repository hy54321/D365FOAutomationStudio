export const projectMethods = {
    async loadProjects() {
        const result = await chrome.storage.local.get(['projects', 'selectedProjectId']);
        this.projects = result.projects || [];
        this.selectedProjectId = result.selectedProjectId || 'all';

        if (this.selectedProjectId !== 'all' && !this.projects.find(p => p.id === this.selectedProjectId)) {
            this.selectedProjectId = 'all';
            await chrome.storage.local.set({ selectedProjectId: 'all' });
        }

        this.renderProjectFilter();
        this.renderProjectsManager();
        this.renderWorkflowProjects();
    },

    setupProjectUI() {
        const projectFilter = document.getElementById('projectFilter');
        projectFilter?.addEventListener('change', async (e) => {
            this.selectedProjectId = e.target.value || 'all';
            await chrome.storage.local.set({ selectedProjectId: this.selectedProjectId });
            this.displayWorkflows();
        });

        document.getElementById('toggleProjectsManager')?.addEventListener('click', () => {
            const panel = document.getElementById('projectsManager');
            if (!panel) return;
            panel.classList.toggle('is-hidden');
        });

        document.getElementById('createProject')?.addEventListener('click', () => this.createProjectFromInput());
        document.getElementById('newProjectName')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createProjectFromInput();
            }
        });
    },

    createProjectFromInput() {
        const input = document.getElementById('newProjectName');
        if (!input) return;
        const name = input.value.trim();
        if (!name) {
            this.showNotification('Project name is required', 'error');
            return;
        }
        if (this.projects.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            this.showNotification('A project with this name already exists', 'error');
            return;
        }

        const project = { id: Date.now().toString(), name };
        this.projects.push(project);
        input.value = '';

        chrome.storage.local.set({ projects: this.projects });
        this.renderProjectFilter();
        this.renderProjectsManager();
        this.renderWorkflowProjects();
    },

    async deleteProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;
        if (!confirm(`Delete project "${project.name}"? This will remove it from all workflows.`)) return;

        this.projects = this.projects.filter(p => p.id !== projectId);
        this.workflows = (this.workflows || []).map(w => ({
            ...w,
            projectIds: (w.projectIds || []).filter(id => id !== projectId)
        }));
        if (this.currentWorkflow?.projectIds) {
            this.currentWorkflow.projectIds = this.currentWorkflow.projectIds.filter(id => id !== projectId);
        }

        if (this.selectedProjectId === projectId) {
            this.selectedProjectId = 'all';
        }

        await chrome.storage.local.set({
            projects: this.projects,
            workflows: this.workflows,
            selectedProjectId: this.selectedProjectId
        });

        this.renderProjectFilter();
        this.renderProjectsManager();
        this.renderWorkflowProjects();
        this.displayWorkflows();
    },

    async renameProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;
        const name = prompt('Rename project', project.name);
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        if (this.projects.some(p => p.id !== projectId && p.name.toLowerCase() === trimmed.toLowerCase())) {
            this.showNotification('A project with this name already exists', 'error');
            return;
        }

        project.name = trimmed;
        await chrome.storage.local.set({ projects: this.projects });
        this.renderProjectFilter();
        this.renderProjectsManager();
        this.renderWorkflowProjects();
        this.displayWorkflows();
    },

    renderProjectFilter() {
        const select = document.getElementById('projectFilter');
        if (!select) return;
        select.innerHTML = '';

        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All projects';
        select.appendChild(allOption);

        const unassignedOption = document.createElement('option');
        unassignedOption.value = 'unassigned';
        unassignedOption.textContent = 'Unassigned workflows';
        select.appendChild(unassignedOption);

        this.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            select.appendChild(option);
        });

        select.value = this.selectedProjectId || 'all';
    },

    renderProjectsManager() {
        const list = document.getElementById('projectsList');
        if (!list) return;
        list.innerHTML = '';

        if (!this.projects.length) {
            list.innerHTML = '<div class="empty-state">No projects yet. Add one above.</div>';
            return;
        }

        this.projects.forEach(project => {
            const count = (this.workflows || []).filter(w => (w.projectIds || []).includes(project.id)).length;
            const item = document.createElement('div');
            item.className = 'project-item';
            item.innerHTML = `
                <div class="project-info">
                    <strong>${project.name}</strong>
                    <span class="project-count">${count} workflow${count === 1 ? '' : 's'}</span>
                </div>
                <div class="project-actions">
                    <button class="btn-icon" data-action="rename" title="Rename">✏️</button>
                    <button class="btn-icon" data-action="delete" title="Delete">🗑️</button>
                </div>
            `;

            item.querySelector('[data-action="rename"]').addEventListener('click', () => this.renameProject(project.id));
            item.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteProject(project.id));
            list.appendChild(item);
        });
    },

    renderWorkflowProjects() {
        const container = document.getElementById('workflowProjectsList');
        if (!container) return;
        container.innerHTML = '';

        if (!this.currentWorkflow) {
            container.innerHTML = '<div class="empty-state">Open or create a workflow to assign projects.</div>';
            return;
        }

        if (!this.projects.length) {
            container.innerHTML = '<div class="empty-state">No projects yet.</div>';
            return;
        }

        const selected = new Set(this.currentWorkflow?.projectIds || []);
        this.projects.forEach(project => {
            const label = document.createElement('label');
            label.className = 'project-checkbox';
            const checked = selected.has(project.id);
            label.innerHTML = `
                <input type="checkbox" value="${project.id}" ${checked ? 'checked' : ''}>
                <span>${project.name}</span>
            `;
            label.querySelector('input').addEventListener('change', (e) => {
                this.toggleWorkflowProject(project.id, e.target.checked);
            });
            container.appendChild(label);
        });
    },

    toggleWorkflowProject(projectId, isChecked) {
        if (!this.currentWorkflow) return;
        const projectIds = new Set(this.currentWorkflow.projectIds || []);
        if (isChecked) {
            projectIds.add(projectId);
        } else {
            projectIds.delete(projectId);
        }
        this.currentWorkflow.projectIds = Array.from(projectIds);
    },

    syncCurrentWorkflowProjectsFromUI() {
        const container = document.getElementById('workflowProjectsList');
        if (!container || !this.currentWorkflow) return;
        const selected = Array.from(container.querySelectorAll('input[type="checkbox"]'))
            .filter(input => input.checked)
            .map(input => input.value);
        this.currentWorkflow.projectIds = selected;
    },

    getFilteredWorkflows() {
        if (!this.selectedProjectId || this.selectedProjectId === 'all') return this.workflows;
        if (this.selectedProjectId === 'unassigned') {
            return (this.workflows || []).filter(w => !(w.projectIds || []).length);
        }
        return (this.workflows || []).filter(w => (w.projectIds || []).includes(this.selectedProjectId));
    },

    getSelectedProjectName() {
        if (!this.selectedProjectId || this.selectedProjectId === 'all') return 'All projects';
        if (this.selectedProjectId === 'unassigned') return 'unassigned workflows';
        return this.projects.find(p => p.id === this.selectedProjectId)?.name || 'Unknown project';
    },

    getProjectNamesByIds(projectIds) {
        if (!projectIds || !projectIds.length) return [];
        const map = new Map(this.projects.map(p => [p.id, p.name]));
        return projectIds.map(id => map.get(id)).filter(Boolean);
    }
};
