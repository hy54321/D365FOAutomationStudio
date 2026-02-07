export const inspectorMethods = {
    async startInspector() {
        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });
        } else {
            this.showNotification('No D365FO tab connected', 'error');
        }
    },

    async refreshElements() {
        const tab = await this.getLinkedOrActiveTab();
        if (tab) {
            const activeFormOnly = document.getElementById('activeFormOnly')?.checked || false;
            await chrome.tabs.sendMessage(tab.id, { 
                action: 'discoverElements',
                activeFormOnly: activeFormOnly
            });
        } else {
            this.showNotification('No D365FO tab connected', 'error');
        }
    },

    displayDiscoveredElements(elements, activeForm) {
        this.discoveredElements = elements;

        // Update active form info
        const activeFormInfo = document.getElementById('activeFormInfo');
        const activeFormName = document.getElementById('activeFormName');
        if (activeForm && activeFormInfo && activeFormName) {
            activeFormInfo.classList.remove('is-hidden');
            activeFormName.textContent = activeForm;
        } else if (activeFormInfo) {
            activeFormInfo.classList.add('is-hidden');
        }

        // Build form filter options
        const formFilter = document.getElementById('formFilter');
        if (formFilter) {
            const forms = [...new Set(elements.map(el => el.formName).filter(f => f && f !== 'Unknown'))];
            forms.sort();

            const currentValue = formFilter.value;
            formFilter.innerHTML = '<option value="all">All Forms</option>';
            forms.forEach(form => {
                const count = elements.filter(el => el.formName === form).length;
                formFilter.innerHTML += `<option value="${form}">${form} (${count})</option>`;
            });

            // Restore previous selection if still valid
            if (currentValue !== 'all' && forms.includes(currentValue)) {
                formFilter.value = currentValue;
            }
        }

        this.filterElements();
    },

    filterElements(searchText = '') {
        const search = searchText || document.getElementById('elementFilter').value;
        const typeFilter = document.getElementById('elementTypeFilter').value;
        const formFilter = document.getElementById('formFilter')?.value || 'all';

        let filtered = this.discoveredElements.filter(el => {
            if (typeFilter !== 'all' && el.type !== typeFilter) return false;
            if (formFilter !== 'all' && el.formName !== formFilter) return false;
            if (search && !el.displayText.toLowerCase().includes(search.toLowerCase()) && 
                !el.controlName.toLowerCase().includes(search.toLowerCase())) {
                return false;
            }
            return true;
        });

        this.displayElements(filtered);
    },

    displayElements(elements) {
        const container = document.getElementById('elementsList');
        container.innerHTML = '';

        elements.forEach(el => {
            const item = document.createElement('div');
            item.className = 'element-item';

            // Show form name as a badge if available
            const formBadge = el.formName && el.formName !== 'Unknown' 
                ? `<span class="element-form" title="Form: ${el.formName}">${el.formName}</span>` 
                : '';

            item.innerHTML = `
                <div>
                    <span class="element-type ${el.type}">${el.type}</span>
                    <span class="element-name">${el.displayText}</span>
                    ${formBadge}
                </div>
                <div class="element-control">${el.controlName}</div>
            `;
            item.addEventListener('click', () => {
                // If we're editing a step, populate it with this element
                if (this.currentStep) {
                    // Reuse centralized picker handling so IF/loop condition picks
                    // populate conditionControlName instead of controlName.
                    if (typeof this.handleElementPicked === 'function') {
                        this.handleElementPicked(el);
                    } else {
                        this.currentStep.controlName = el.controlName;
                        this.currentStep.displayText = el.displayText;
                        this.currentStep.role = el.role;
                        if (el.fieldType) {
                            this.currentStep.fieldType = el.fieldType;
                        }
                        const controlNameInput = document.getElementById('stepControlName');
                        if (controlNameInput) {
                            controlNameInput.value = el.controlName;
                        }
                        const displayTextInput = document.getElementById('stepDisplayText');
                        if (displayTextInput) {
                            displayTextInput.value = el.displayText;
                        }
                        this.autoSaveStep?.();
                        document.querySelector('[data-tab="builder"]')?.click();
                        this.showNotification(`Element selected: ${el.displayText}`, 'success');
                    }
                } else {
                    // No step being edited, just copy to clipboard
                    navigator.clipboard.writeText(el.controlName);
                    this.showNotification('Control name copied to clipboard', 'info');
                }

                // Visual feedback
                item.style.background = '#c8e6c9';
                setTimeout(() => {
                    item.style.background = '';
                }, 500);
            });
            container.appendChild(item);
        });

        if (elements.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999;">No elements found. Click "Refresh" to scan the page.</p>';
        }
    }
};
