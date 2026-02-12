export const projectMethods = {
    async loadProjects() {
        const result = await this.chrome.storage.local.get(['projects', 'selectedProjectId']);
        this.projects = result.projects || [];
        this.selectedProjectId = result.selectedProjectId || 'all';

        if (this.selectedProjectId !== 'all' && this.selectedProjectId !== 'unassigned'
            && !this.projects.find(p => p.id === this.selectedProjectId)) {
            this.selectedProjectId = 'all';
            await this.chrome.storage.local.set({ selectedProjectId: 'all' });
        }

        this.renderProjectFilter();
        this.renderProjectsManager();
        this.renderProjectTree();
        this.renderWorkflowProjects();
        if (this.renderSharedDataSourcesUI) {
            this.renderSharedDataSourcesUI();
        }
    },

    setupProjectUI() {
        const projectFilter = document.getElementById('projectFilter');
        projectFilter?.addEventListener('change', async (e) => {
            await this.selectProjectFilter(e.target.value || 'all', false);
        });

        document.getElementById('createProject')?.addEventListener('click', () => this.createProjectFromInput());
        document.getElementById('newProjectName')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createProjectFromInput();
            }
        });
        document.getElementById('addProjectQuick')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.createProjectByPrompt(null);
        });

        document.getElementById('projectsTree')?.addEventListener('contextmenu', (e) => {
            this.handleProjectTreeContextMenu(e);
        });
    },

    async selectProjectFilter(projectId, clearConfiguration = true) {
        this.selectedProjectId = projectId || 'all';
        if (clearConfiguration) {
            this.selectedConfigurationId = 'all';
        }

        await this.chrome.storage.local.set({
            selectedProjectId: this.selectedProjectId,
            selectedConfigurationId: this.selectedConfigurationId
        });

        this.renderProjectFilter();
        if (this.renderConfigurationFilter) {
            this.renderConfigurationFilter();
        }
        this.renderProjectTree();
        if (this.renderConfigurationTree) {
            this.renderConfigurationTree();
        }
        this.displayWorkflows();
    },

    createProjectFromInput() {
        const input = document.getElementById('newProjectName');
        if (!input) return;

        const name = input.value.trim();
        if (!name) {
            this.showNotification('Project name is required', 'error');
            return;
        }
        this.createProject(name, null);
        input.value = '';
    },

    createProject(name, parentId = null) {
        if (!name) return false;
        if (this.projects.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            this.showNotification('A project with this name already exists', 'error');
            return false;
        }

        const project = { id: Date.now().toString(), name, parentId: parentId || null };
        this.projects.push(project);
        this.chrome.storage.local.set({ projects: this.projects });
        this.renderProjectFilter();
        this.renderProjectsManager();
        this.renderProjectTree();
        this.renderWorkflowProjects();
        return true;
    },

    createProjectByPrompt(parentId = null) {
        const name = prompt(parentId ? 'New child project name' : 'New project name');
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        this.createProject(trimmed, parentId);
    },

    isProjectDescendant(projectId, ancestorId) {
        if (!projectId || !ancestorId || projectId === ancestorId) return false;
        const map = new Map((this.projects || []).map(p => [p.id, p.parentId || null]));
        let current = map.get(projectId) || null;
        while (current) {
            if (current === ancestorId) return true;
            current = map.get(current) || null;
        }
        return false;
    },

    async setProjectParent(projectId, parentId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        const normalizedParentId = parentId || null;
        if (normalizedParentId === projectId) {
            this.showNotification('A project cannot be its own parent', 'error');
            return;
        }
        if (normalizedParentId && this.isProjectDescendant(normalizedParentId, projectId)) {
            this.showNotification('Invalid parent: this creates a cycle', 'error');
            return;
        }

        project.parentId = normalizedParentId;
        await this.chrome.storage.local.set({ projects: this.projects });
        this.renderProjectTree();
        this.renderProjectsManager();
        this.renderWorkflowProjects();
    },

    async deleteProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;
        if (!confirm(`Delete project "${project.name}"? This will remove it from all workflows.`)) return;

        this.projects = this.projects
            .filter(p => p.id !== projectId)
            .map(p => ({ ...p, parentId: p.parentId === projectId ? null : (p.parentId || null) }));

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

        await this.chrome.storage.local.set({
            projects: this.projects,
            workflows: this.workflows,
            selectedProjectId: this.selectedProjectId
        });

        if (Array.isArray(this.sharedDataSources)) {
            this.sharedDataSources = this.sharedDataSources.map(source => ({
                ...source,
                projectIds: (source.projectIds || []).filter(id => id !== projectId)
            }));
            await this.persistSharedDataSources?.();
        }

        this.renderProjectFilter();
        this.renderProjectsManager();
        this.renderProjectTree();
        this.renderWorkflowProjects();
        if (this.renderSharedDataSourcesUI) {
            this.renderSharedDataSourcesUI();
        }
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
        await this.chrome.storage.local.set({ projects: this.projects });
        this.renderProjectFilter();
        this.renderProjectsManager();
        this.renderProjectTree();
        this.renderWorkflowProjects();
        if (this.renderSharedDataSourcesUI) {
            this.renderSharedDataSourcesUI();
        }
        this.displayWorkflows();
    },

    getProjectChildren(parentId = null) {
        return (this.projects || [])
            .filter(project => (project.parentId || null) === parentId)
            .sort((a, b) => a.name.localeCompare(b.name));
    },

    async assignWorkflowToProject(workflowId, projectId) {
        const workflow = (this.workflows || []).find(w => w.id === workflowId);
        if (!workflow) return;

        if (!Array.isArray(workflow.projectIds)) {
            workflow.projectIds = [];
        }

        if (projectId === 'unassigned') {
            workflow.projectIds = [];
        } else if (projectId && !workflow.projectIds.includes(projectId)) {
            workflow.projectIds.push(projectId);
        }

        await this.chrome.storage.local.set({ workflows: this.workflows });
        this.displayWorkflows();
        this.renderProjectsManager();
        this.renderProjectTree();
        this.renderWorkflowProjects();
    },

    attachProjectDropHandlers(node, targetProjectId) {
        if (!node) return;

        node.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            node.classList.add('drop-target');
        });

        node.addEventListener('dragleave', () => {
            node.classList.remove('drop-target');
        });

        node.addEventListener('drop', async (e) => {
            e.preventDefault();
            node.classList.remove('drop-target');
            const workflowId = e.dataTransfer?.getData('text/workflow-id');
            if (!workflowId) return;
            await this.assignWorkflowToProject(workflowId, targetProjectId);
            const workflow = (this.workflows || []).find(w => w.id === workflowId);
            this.showNotification(`Workflow "${workflow?.name || workflowId}" linked to project`, 'success');
        });
    },

    renderProjectTree() {
        const container = document.getElementById('projectsTree');
        if (!container) return;
        container.innerHTML = '';

        const makeNode = (project, depth) => {
            const item = document.createElement('button');
            item.className = 'tree-node';
            if (this.selectedProjectId === project.id) {
                item.classList.add('active');
            }
            item.style.paddingLeft = `${8 + depth * 14}px`;
            item.textContent = project.name;
            item.title = `Filter by project: ${project.name}`;
            item.dataset.projectId = project.id;
            item.dataset.nodeType = 'project';
            item.addEventListener('click', () => this.selectProjectFilter(project.id, true));
            this.attachProjectDropHandlers(item, project.id);
            container.appendChild(item);

            this.getProjectChildren(project.id).forEach(child => makeNode(child, depth + 1));
        };

        const unassigned = document.createElement('button');
        unassigned.className = 'tree-node';
        unassigned.dataset.nodeType = 'unassigned';
        if (this.selectedProjectId === 'unassigned') {
            unassigned.classList.add('active');
        }
        unassigned.textContent = 'Unassigned workflows';
        unassigned.addEventListener('click', () => this.selectProjectFilter('unassigned', true));
        this.attachProjectDropHandlers(unassigned, 'unassigned');
        container.appendChild(unassigned);

        if (!this.projects.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No projects yet.';
            container.appendChild(empty);
            return;
        }

        this.getProjectChildren(null).forEach(project => makeNode(project, 0));
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
        // Kept for compatibility with existing init flow. Tree is the primary management UI.
    },

    handleProjectTreeContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();

        const node = event.target.closest('.tree-node');
        const projectId = node?.dataset.projectId;

        if (projectId) {
            const project = this.projects.find(p => p.id === projectId);
            if (!project) return;
            this.showTreeContextMenu([
                { label: 'Add child project', action: () => this.createProjectByPrompt(project.id) },
                { label: 'Rename project', action: () => this.renameProject(project.id) },
                { label: 'Move to root', action: () => this.setProjectParent(project.id, null) },
                { label: 'Delete project', action: () => this.deleteProject(project.id) }
            ], event.clientX, event.clientY);
            return;
        }

        this.showTreeContextMenu([
            { label: 'Add project', action: () => this.createProjectByPrompt(null) }
        ], event.clientX, event.clientY);
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
        this.projects
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(project => {
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
        let filtered = this.workflows || [];

        if (this.selectedConfigurationId && this.selectedConfigurationId !== 'all') {
            if (this.selectedConfigurationId === 'unassigned') {
                filtered = filtered.filter(w => !(w.configurationIds || []).length);
            } else if (this.getWorkflowsByConfiguration) {
                // Preserve explicit configuration run order when a configuration is selected.
                filtered = this.getWorkflowsByConfiguration(this.selectedConfigurationId);
            } else {
                filtered = filtered.filter(w => (w.configurationIds || []).includes(this.selectedConfigurationId));
            }
        }

        if (this.selectedProjectId && this.selectedProjectId !== 'all') {
            if (this.selectedProjectId === 'unassigned') {
                filtered = filtered.filter(w => !(w.projectIds || []).length);
            } else {
                filtered = filtered.filter(w => (w.projectIds || []).includes(this.selectedProjectId));
            }
        }

        return filtered;
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
