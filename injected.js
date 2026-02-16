(() => {
  // src/injected/inspector/D365Inspector.js
  var D365Inspector = class {
    constructor() {
      this.isInspecting = false;
      this.highlightElement = null;
      this.overlay = null;
    }
    // Get the form name that contains an element
    getElementFormName(element) {
      const formContainer = element.closest("[data-dyn-form-name]");
      if (formContainer) {
        return formContainer.getAttribute("data-dyn-form-name");
      }
      const formElement = element.closest('[data-dyn-role="Form"]');
      if (formElement) {
        return formElement.getAttribute("data-dyn-controlname") || formElement.getAttribute("data-dyn-form-name");
      }
      const workspace = element.closest('.workspace-content, .workspace, [data-dyn-role="Workspace"]');
      if (workspace) {
        const workspaceName = workspace.getAttribute("data-dyn-controlname");
        if (workspaceName)
          return workspaceName;
      }
      const dialog = element.closest('[data-dyn-role="Dialog"], .dialog-container, .modal-content');
      if (dialog) {
        const dialogName = dialog.getAttribute("data-dyn-controlname") || dialog.querySelector("[data-dyn-form-name]")?.getAttribute("data-dyn-form-name");
        if (dialogName)
          return dialogName;
      }
      let current = element;
      while (current && current !== document.body) {
        const formName = current.getAttribute("data-dyn-form-name") || (current.getAttribute("data-dyn-role") === "Form" ? current.getAttribute("data-dyn-controlname") : null);
        if (formName)
          return formName;
        current = current.parentElement;
      }
      return "Unknown";
    }
    // Get the active/focused form name
    getActiveFormName() {
      const activeDialog = document.querySelector('[data-dyn-role="Dialog"]:not([style*="display: none"]), .dialog-container:not([style*="display: none"])');
      if (activeDialog) {
        const dialogForm = activeDialog.querySelector("[data-dyn-form-name]");
        if (dialogForm)
          return dialogForm.getAttribute("data-dyn-form-name");
        return activeDialog.getAttribute("data-dyn-controlname");
      }
      const activeElement = document.activeElement;
      if (activeElement && activeElement !== document.body) {
        const formName = this.getElementFormName(activeElement);
        if (formName && formName !== "Unknown")
          return formName;
      }
      const visibleForms = document.querySelectorAll("[data-dyn-form-name]");
      if (visibleForms.length > 0) {
        for (let i = visibleForms.length - 1; i >= 0; i--) {
          if (this.isElementVisible(visibleForms[i])) {
            return visibleForms[i].getAttribute("data-dyn-form-name");
          }
        }
      }
      return null;
    }
    // Discover all interactive elements on the page
    discoverElements(activeFormOnly = false) {
      const elements = [];
      const activeForm = activeFormOnly ? this.getActiveFormName() : null;
      document.querySelectorAll('[data-dyn-role="Button"], [data-dyn-role="CommandButton"], [data-dyn-role="MenuItemButton"]').forEach((el) => {
        const controlName = el.getAttribute("data-dyn-controlname");
        if (!controlName)
          return;
        const formName = this.getElementFormName(el);
        if (activeFormOnly && activeForm && formName !== activeForm)
          return;
        const text = this.getElementText(el);
        const visible = this.isElementVisible(el);
        elements.push({
          type: "button",
          controlName,
          displayText: text,
          visible,
          ariaLabel: el.getAttribute("aria-label") || "",
          selector: `[data-dyn-controlname="${controlName}"]`,
          formName,
          element: el
        });
      });
      document.querySelectorAll('[data-dyn-role="Input"], [data-dyn-role="MultilineInput"], [data-dyn-role="ComboBox"], [data-dyn-role="ReferenceGroup"], [data-dyn-role="Lookup"], [data-dyn-role="SegmentedEntry"], input[data-dyn-controlname], input[role="textbox"]').forEach((el) => {
        let controlName = el.getAttribute("data-dyn-controlname");
        let targetElement = el;
        if (!controlName) {
          const parent = el.closest("[data-dyn-controlname]");
          if (parent) {
            controlName = parent.getAttribute("data-dyn-controlname");
            targetElement = parent;
          }
        }
        if (!controlName)
          return;
        if (elements.some((e) => e.controlName === controlName))
          return;
        const formName = this.getElementFormName(targetElement);
        if (activeFormOnly && activeForm && formName !== activeForm)
          return;
        const label = this.getElementLabel(targetElement);
        const fieldInfo = this.detectFieldType(targetElement);
        elements.push({
          type: "input",
          controlName,
          displayText: label,
          visible: this.isElementVisible(targetElement),
          fieldType: fieldInfo,
          selector: `[data-dyn-controlname="${controlName}"]`,
          formName,
          element: targetElement
        });
      });
      document.querySelectorAll('[data-dyn-role="CheckBox"], input[type="checkbox"][data-dyn-controlname]').forEach((el) => {
        let controlName = el.getAttribute("data-dyn-controlname");
        let targetElement = el;
        if (!controlName) {
          const parent = el.closest("[data-dyn-controlname]");
          if (parent) {
            controlName = parent.getAttribute("data-dyn-controlname");
            targetElement = parent;
          }
        }
        if (!controlName)
          return;
        if (elements.some((e) => e.controlName === controlName))
          return;
        const formName = this.getElementFormName(targetElement);
        if (activeFormOnly && activeForm && formName !== activeForm)
          return;
        const label = this.getElementLabel(targetElement);
        const checkbox = targetElement.querySelector('input[type="checkbox"]') || targetElement;
        const isChecked = checkbox.checked || checkbox.getAttribute("aria-checked") === "true";
        elements.push({
          type: "checkbox",
          controlName,
          displayText: label,
          visible: this.isElementVisible(targetElement),
          checked: isChecked,
          selector: `[data-dyn-controlname="${controlName}"]`,
          formName,
          element: targetElement
        });
      });
      document.querySelectorAll('[data-dyn-role="RadioButton"], [role="radiogroup"], [data-dyn-role="FrameOptionButton"]').forEach((el) => {
        const controlName = el.getAttribute("data-dyn-controlname");
        if (!controlName)
          return;
        if (elements.some((e) => e.controlName === controlName))
          return;
        const formName = this.getElementFormName(el);
        if (activeFormOnly && activeForm && formName !== activeForm)
          return;
        const label = this.getElementLabel(el);
        const selectedRadio = el.querySelector('input[type="radio"]:checked, [role="radio"][aria-checked="true"]');
        const currentValue = selectedRadio?.value || selectedRadio?.getAttribute("aria-label") || "";
        elements.push({
          type: "radio",
          controlName,
          displayText: label,
          visible: this.isElementVisible(el),
          currentValue,
          selector: `[data-dyn-controlname="${controlName}"]`,
          formName,
          element: el
        });
      });
      document.querySelectorAll('[data-dyn-role="AppBarTab"], .appBarTab, [role="tab"][data-dyn-controlname]').forEach((el) => {
        const controlName = el.getAttribute("data-dyn-controlname");
        if (!controlName)
          return;
        if (elements.some((e) => e.controlName === controlName))
          return;
        if (el.closest('.dialog-content, [data-dyn-role="Dialog"], .dialog-container, .flyout-container, [role="dialog"]')) {
          return;
        }
        const formName = this.getElementFormName(el);
        if (activeFormOnly && activeForm && formName !== activeForm)
          return;
        const text = this.getElementText(el);
        const isActive = el.getAttribute("aria-selected") === "true" || el.classList.contains("active") || el.classList.contains("selected");
        elements.push({
          type: "action-pane-tab",
          controlName,
          displayText: text,
          visible: this.isElementVisible(el),
          isActive,
          selector: `[data-dyn-controlname="${controlName}"]`,
          formName,
          element: el
        });
      });
      document.querySelectorAll('[data-dyn-role="Grid"]').forEach((el) => {
        const controlName = el.getAttribute("data-dyn-controlname");
        if (!controlName)
          return;
        const formName = this.getElementFormName(el);
        if (activeFormOnly && activeForm && formName !== activeForm)
          return;
        elements.push({
          type: "grid",
          controlName,
          displayText: this.getElementLabel(el) || "Grid",
          visible: this.isElementVisible(el),
          selector: `[data-dyn-controlname="${controlName}"]`,
          formName,
          element: el
        });
        this.discoverGridColumns(el, controlName, formName, elements);
      });
      document.querySelectorAll(".reactGrid").forEach((el) => {
        const formName = this.getElementFormName(el);
        if (activeFormOnly && activeForm && formName !== activeForm)
          return;
        elements.push({
          type: "grid",
          controlName: "reactGrid",
          displayText: "React Grid",
          visible: this.isElementVisible(el),
          selector: ".reactGrid",
          formName,
          element: el
        });
      });
      document.querySelectorAll('[data-dyn-role="Group"], [data-dyn-role="SectionPage"], [data-dyn-role="TabPage"], [data-dyn-role="FastTab"], .section-page, .fasttab').forEach((el) => {
        const controlName = el.getAttribute("data-dyn-controlname");
        if (!controlName)
          return;
        if (elements.some((e) => e.controlName === controlName))
          return;
        const formName = this.getElementFormName(el);
        if (activeFormOnly && activeForm && formName !== activeForm)
          return;
        const hasHeader = el.querySelector('.section-header, .group-header, [data-dyn-role="SectionPageHeader"], .section-page-caption, button[aria-expanded]');
        const isExpandable = el.hasAttribute("aria-expanded") || el.classList.contains("collapsible") || el.classList.contains("section-page") || hasHeader !== null || el.getAttribute("data-dyn-role") === "Group" || el.getAttribute("data-dyn-role") === "SectionPage";
        if (!isExpandable)
          return;
        const isExpanded = el.getAttribute("aria-expanded") === "true" || el.classList.contains("expanded") || !el.classList.contains("collapsed");
        const label = this.getExpandableSectionLabel(el) || controlName;
        elements.push({
          type: "section",
          controlName,
          displayText: label,
          visible: this.isElementVisible(el),
          isExpanded,
          selector: `[data-dyn-controlname="${controlName}"]`,
          formName,
          element: el
        });
        this.discoverReactGridColumns(el, formName, elements);
      });
      return elements;
    }
    // Get readable text from an element
    getElementText(element) {
      let text = element.getAttribute("aria-label");
      if (text && text.trim())
        return text.trim();
      const clone = element.cloneNode(true);
      clone.querySelectorAll(".button-icon, .fa, .glyphicon").forEach((icon) => icon.remove());
      text = clone.textContent?.trim();
      if (text)
        return text;
      text = element.getAttribute("title");
      if (text)
        return text;
      return element.getAttribute("data-dyn-controlname") || "Unknown";
    }
    // Get label for input fields
    getElementLabel(element) {
      let label = element.getAttribute("aria-label");
      if (label && label.trim())
        return label.trim();
      const labelElement = element.closest(".dyn-label-wrapper")?.querySelector(".dyn-label");
      if (labelElement)
        return labelElement.textContent?.trim();
      const container = element.closest(".input_container, .form-group");
      if (container) {
        const containerLabel = container.querySelector("label");
        if (containerLabel)
          return containerLabel.textContent?.trim();
      }
      return element.getAttribute("data-dyn-controlname") || "Unknown";
    }
    // Discover grid columns for input/editing
    discoverGridColumns(gridElement, gridName, formName, elements) {
      const addedColumns = /* @__PURE__ */ new Set();
      const headers = gridElement.querySelectorAll('[data-dyn-role="ColumnHeader"], [role="columnheader"], .dyn-headerCell');
      headers.forEach((header) => {
        const colName = header.getAttribute("data-dyn-controlname");
        if (!colName || addedColumns.has(colName))
          return;
        addedColumns.add(colName);
        const displayText = header.textContent?.trim() || header.getAttribute("aria-label") || colName;
        elements.push({
          type: "grid-column",
          controlName: colName,
          displayText: `${displayText}`,
          gridName,
          visible: this.isElementVisible(header),
          selector: `[data-dyn-controlname="${colName}"]`,
          formName,
          isHeader: true,
          element: header
        });
      });
      const activeRow = gridElement.querySelector('[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow') || gridElement.querySelector('[data-dyn-role="Row"]:first-of-type, [role="row"]:not([role="columnheader"]):first-of-type');
      if (activeRow) {
        const cells = activeRow.querySelectorAll("[data-dyn-controlname]");
        cells.forEach((cell) => {
          const colName = cell.getAttribute("data-dyn-controlname");
          if (!colName || addedColumns.has(colName))
            return;
          const role = cell.getAttribute("data-dyn-role");
          const hasInput = cell.querySelector("input, select, textarea") !== null || ["Input", "ComboBox", "Lookup", "ReferenceGroup", "SegmentedEntry"].includes(role);
          if (hasInput || role) {
            addedColumns.add(colName);
            const displayText = this.getGridColumnLabel(gridElement, colName) || colName;
            const fieldType = this.detectFieldType(cell);
            elements.push({
              type: "grid-column",
              controlName: colName,
              displayText,
              gridName,
              visible: this.isElementVisible(cell),
              selector: `[data-dyn-controlname="${colName}"]`,
              formName,
              isEditable: hasInput,
              fieldType,
              role,
              element: cell
            });
          }
        });
      }
      const gridInputs = gridElement.querySelectorAll('[data-dyn-role="Input"], [data-dyn-role="ComboBox"], [data-dyn-role="Lookup"], [data-dyn-role="ReferenceGroup"]');
      gridInputs.forEach((input) => {
        const colName = input.getAttribute("data-dyn-controlname");
        if (!colName || addedColumns.has(colName))
          return;
        addedColumns.add(colName);
        const displayText = this.getGridColumnLabel(gridElement, colName) || this.getElementLabel(input) || colName;
        const fieldType = this.detectFieldType(input);
        elements.push({
          type: "grid-column",
          controlName: colName,
          displayText,
          gridName,
          visible: this.isElementVisible(input),
          selector: `[data-dyn-controlname="${colName}"]`,
          formName,
          isEditable: true,
          fieldType,
          role: input.getAttribute("data-dyn-role"),
          element: input
        });
      });
    }
    // Get label for a grid column by looking at the header
    getGridColumnLabel(gridElement, columnControlName) {
      const header = gridElement.querySelector(`[data-dyn-role="ColumnHeader"][data-dyn-controlname="${columnControlName}"], [role="columnheader"][data-dyn-controlname="${columnControlName}"]`);
      if (header) {
        const text = header.textContent?.trim();
        if (text)
          return text;
      }
      const allHeaders = gridElement.querySelectorAll('[data-dyn-role="ColumnHeader"], [role="columnheader"]');
      for (const h of allHeaders) {
        const headerName = h.getAttribute("data-dyn-controlname");
        if (headerName && (columnControlName.includes(headerName) || headerName.includes(columnControlName))) {
          const text = h.textContent?.trim();
          if (text)
            return text;
        }
      }
      return null;
    }
    // Discover columns in React FixedDataTable grids
    discoverReactGridColumns(gridElement, formName, elements) {
      const addedColumns = /* @__PURE__ */ new Set();
      const headerCells = gridElement.querySelectorAll(".fixedDataTableLayout_header .dyn-headerCell");
      headerCells.forEach((header, colIndex) => {
        const controlName = header.getAttribute("data-dyn-controlname");
        if (!controlName || addedColumns.has(controlName))
          return;
        addedColumns.add(controlName);
        const label = header.querySelector(".dyn-headerCellLabel");
        const displayText = label?.textContent?.trim() || header.textContent?.trim() || controlName;
        elements.push({
          type: "grid-column",
          controlName,
          displayText,
          gridName: "reactGrid",
          gridType: "react",
          columnIndex: colIndex,
          visible: this.isElementVisible(header),
          selector: `.dyn-headerCell[data-dyn-controlname="${controlName}"]`,
          formName,
          isHeader: true,
          element: header
        });
      });
      const bodyContainer = gridElement.querySelector(".fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer");
      if (bodyContainer) {
        const activeRow = bodyContainer.querySelector('.fixedDataTableRowLayout_main[aria-selected="true"], .fixedDataTableRowLayout_main[data-dyn-row-active="true"]') || bodyContainer.querySelector(".fixedDataTableRowLayout_main.public_fixedDataTableRow_main");
        if (activeRow) {
          const cells = activeRow.querySelectorAll("[data-dyn-controlname]");
          cells.forEach((cell) => {
            const colName = cell.getAttribute("data-dyn-controlname");
            if (!colName || addedColumns.has(colName))
              return;
            const role = cell.getAttribute("data-dyn-role");
            const hasInput = cell.querySelector("input, select, textarea") !== null || ["Input", "ComboBox", "Lookup", "ReferenceGroup", "SegmentedEntry"].includes(role);
            addedColumns.add(colName);
            const displayText = this.getReactGridColumnLabel(gridElement, colName) || colName;
            const fieldType = this.detectFieldType(cell);
            elements.push({
              type: "grid-column",
              controlName: colName,
              displayText,
              gridName: "reactGrid",
              gridType: "react",
              visible: this.isElementVisible(cell),
              selector: `[data-dyn-controlname="${colName}"]`,
              formName,
              isEditable: hasInput,
              fieldType,
              role,
              element: cell
            });
          });
        }
      }
      const gridInputs = gridElement.querySelectorAll('.fixedDataTableLayout_body [data-dyn-role="Input"], .fixedDataTableLayout_body [data-dyn-role="ComboBox"], .fixedDataTableLayout_body [data-dyn-role="Lookup"], .fixedDataTableLayout_body [data-dyn-role="ReferenceGroup"]');
      gridInputs.forEach((input) => {
        const colName = input.getAttribute("data-dyn-controlname");
        if (!colName || addedColumns.has(colName))
          return;
        addedColumns.add(colName);
        const displayText = this.getReactGridColumnLabel(gridElement, colName) || this.getElementLabel(input) || colName;
        const fieldType = this.detectFieldType(input);
        elements.push({
          type: "grid-column",
          controlName: colName,
          displayText,
          gridName: "reactGrid",
          gridType: "react",
          visible: this.isElementVisible(input),
          selector: `[data-dyn-controlname="${colName}"]`,
          formName,
          isEditable: true,
          fieldType,
          role: input.getAttribute("data-dyn-role"),
          element: input
        });
      });
    }
    // Get label for a React grid column by looking at the header
    getReactGridColumnLabel(gridElement, columnControlName) {
      const header = gridElement.querySelector(`.dyn-headerCell[data-dyn-controlname="${columnControlName}"]`);
      if (header) {
        const label = header.querySelector(".dyn-headerCellLabel");
        const text = label?.textContent?.trim() || header.textContent?.trim();
        if (text)
          return text;
      }
      const allHeaders = gridElement.querySelectorAll(".dyn-headerCell[data-dyn-controlname]");
      for (const h of allHeaders) {
        const headerName = h.getAttribute("data-dyn-controlname");
        if (headerName && (columnControlName.includes(headerName) || headerName.includes(columnControlName))) {
          const label = h.querySelector(".dyn-headerCellLabel");
          const text = label?.textContent?.trim() || h.textContent?.trim();
          if (text)
            return text;
        }
      }
      return null;
    }
    // Detect field type (enum, lookup, freetext, etc.)
    detectFieldType(element) {
      const role = element.getAttribute("data-dyn-role");
      const controlName = element.getAttribute("data-dyn-controlname");
      if (role === "SegmentedEntry") {
        return { type: "segmented-lookup", role };
      }
      const hasLookupButton2 = element.classList.contains("field-hasLookupButton") || element.querySelector(".lookup-button") !== null || element.nextElementSibling?.classList.contains("lookup-button");
      const isComboBox = role === "ComboBox" || element.classList.contains("comboBox");
      const select = element.querySelector("select");
      const isMultiline = role === "MultilineInput";
      const isNumeric = element.querySelector('input[type="number"]') !== null;
      const isDate = element.classList.contains("date-field") || element.querySelector('input[type="date"]') !== null;
      const fieldInfo = {
        controlType: role,
        inputType: "text"
      };
      if (isMultiline) {
        fieldInfo.inputType = "textarea";
        fieldInfo.isMultiline = true;
      } else if (isComboBox || select) {
        fieldInfo.inputType = "enum";
        fieldInfo.isEnum = true;
        fieldInfo.values = this.extractEnumValues(element, select);
      } else if (hasLookupButton2) {
        fieldInfo.inputType = "lookup";
        fieldInfo.isLookup = true;
        fieldInfo.allowFreetext = !element.classList.contains("lookup-only");
      } else if (isNumeric) {
        fieldInfo.inputType = "number";
      } else if (isDate) {
        fieldInfo.inputType = "date";
      }
      const input = element.querySelector("input, textarea");
      if (input && input.maxLength > 0) {
        fieldInfo.maxLength = input.maxLength;
      }
      return fieldInfo;
    }
    // Extract enum values from dropdown
    extractEnumValues(element, selectElement) {
      const select = selectElement || element.querySelector("select");
      if (!select)
        return null;
      return Array.from(select.options).filter((opt) => opt.value !== "").map((opt) => ({
        value: opt.value,
        text: opt.text.trim()
      }));
    }
    // Get label for expandable sections
    getExpandableSectionLabel(element) {
      const headerSelectors = [
        ".section-page-caption",
        ".section-header",
        ".group-header",
        ".fasttab-header",
        '[data-dyn-role="SectionPageHeader"]',
        "button[aria-expanded] span",
        "button span",
        ".caption",
        "legend"
      ];
      for (const selector of headerSelectors) {
        const header = element.querySelector(selector);
        if (header) {
          const text = header.textContent?.trim();
          if (text)
            return text;
        }
      }
      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel)
        return ariaLabel;
      const toggleBtn = element.querySelector("button");
      if (toggleBtn) {
        const text = toggleBtn.textContent?.trim();
        if (text && text.length < 100)
          return text;
      }
      return null;
    }
    // Check if element is visible
    isElementVisible(element) {
      return element.offsetParent !== null && window.getComputedStyle(element).visibility !== "hidden" && window.getComputedStyle(element).display !== "none";
    }
    // Start interactive element picker
    startElementPicker(callback) {
      this.isInspecting = true;
      this.pickerCallback = callback;
      this.overlay = document.createElement("div");
      this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(102, 126, 234, 0.1);
            z-index: 999998;
            cursor: crosshair;
        `;
      document.body.appendChild(this.overlay);
      this.highlightElement = document.createElement("div");
      this.highlightElement.style.cssText = `
            position: absolute;
            border: 2px solid #667eea;
            background: rgba(102, 126, 234, 0.1);
            pointer-events: none;
            z-index: 999999;
            transition: all 0.1s ease;
        `;
      document.body.appendChild(this.highlightElement);
      this.mouseMoveHandler = (e) => this.handleMouseMove(e);
      this.clickHandler = (e) => this.handleClick(e);
      this.escapeHandler = (e) => {
        if (e.key === "Escape")
          this.stopElementPicker();
      };
      document.addEventListener("mousemove", this.mouseMoveHandler, true);
      document.addEventListener("click", this.clickHandler, true);
      document.addEventListener("keydown", this.escapeHandler, true);
    }
    handleMouseMove(e) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target || target === this.overlay || target === this.highlightElement)
        return;
      const control = target.closest("[data-dyn-controlname]");
      if (!control) {
        if (this.highlightElement) {
          this.highlightElement.style.display = "none";
        }
        return;
      }
      if (!this.highlightElement)
        return;
      const rect = control.getBoundingClientRect();
      this.highlightElement.style.display = "block";
      this.highlightElement.style.top = rect.top + window.scrollY + "px";
      this.highlightElement.style.left = rect.left + window.scrollX + "px";
      this.highlightElement.style.width = rect.width + "px";
      this.highlightElement.style.height = rect.height + "px";
      const controlName = control.getAttribute("data-dyn-controlname");
      const role = control.getAttribute("data-dyn-role");
      this.highlightElement.setAttribute("title", `${role}: ${controlName}`);
    }
    handleClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const control = target?.closest("[data-dyn-controlname]");
      if (control) {
        const controlName = control.getAttribute("data-dyn-controlname");
        const role = control.getAttribute("data-dyn-role");
        const text = this.getElementText(control);
        const elementInfo = {
          controlName,
          role,
          displayText: text,
          selector: `[data-dyn-controlname="${controlName}"]`
        };
        if (role === "Input" || role === "MultilineInput" || role === "ComboBox") {
          elementInfo.fieldType = this.detectFieldType(control);
        }
        this.pickerCallback(elementInfo);
      }
      this.stopElementPicker();
    }
    stopElementPicker() {
      this.isInspecting = false;
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      if (this.highlightElement) {
        this.highlightElement.remove();
        this.highlightElement = null;
      }
      document.removeEventListener("mousemove", this.mouseMoveHandler, true);
      document.removeEventListener("click", this.clickHandler, true);
      document.removeEventListener("keydown", this.escapeHandler, true);
    }
    // Search elements by text
    findElementByText(text, elementType = null) {
      const elements = this.discoverElements();
      const searchText = text.toLowerCase().trim();
      return elements.filter((el) => {
        if (elementType && el.type !== elementType)
          return false;
        const displayText = el.displayText.toLowerCase();
        const ariaLabel = (el.ariaLabel || "").toLowerCase();
        const controlName = el.controlName.toLowerCase();
        return displayText.includes(searchText) || ariaLabel.includes(searchText) || controlName.includes(searchText);
      });
    }
  };

  // src/injected/utils/logging.js
  function sendLog(level, message) {
    window.postMessage({
      type: "D365_WORKFLOW_LOG",
      log: { level, message }
    }, "*");
  }
  function logStep(message) {
    sendLog("info", message);
    console.log("[D365 Automation]", message);
  }

  // src/injected/utils/async.js
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function setNativeValue(input, value) {
    const isTextArea = input.tagName === "TEXTAREA";
    const descriptor = isTextArea ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value") : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
  }

  // src/injected/utils/text.js
  function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }
  function coerceBoolean(value) {
    if (typeof value === "boolean")
      return value;
    if (typeof value === "number")
      return value !== 0 && !Number.isNaN(value);
    const text = normalizeText(value);
    if (text === "")
      return false;
    if (["true", "1", "yes", "y", "on", "checked"].includes(text))
      return true;
    if (["false", "0", "no", "n", "off", "unchecked"].includes(text))
      return false;
    return false;
  }

  // src/injected/runtime/engine-utils.js
  function getWorkflowErrorDefaults(settings) {
    return {
      mode: settings?.errorDefaultMode || "fail",
      retryCount: Number.isFinite(settings?.errorDefaultRetryCount) ? settings.errorDefaultRetryCount : 0,
      retryDelay: Number.isFinite(settings?.errorDefaultRetryDelay) ? settings.errorDefaultRetryDelay : 1e3,
      gotoLabel: settings?.errorDefaultGotoLabel || ""
    };
  }
  function getStepErrorConfig(step, settings) {
    const defaults = getWorkflowErrorDefaults(settings);
    const mode = step?.onErrorMode && step.onErrorMode !== "default" ? step.onErrorMode : defaults.mode;
    const retryCount = Number.isFinite(step?.onErrorRetryCount) ? step.onErrorRetryCount : defaults.retryCount;
    const retryDelay = Number.isFinite(step?.onErrorRetryDelay) ? step.onErrorRetryDelay : defaults.retryDelay;
    const gotoLabel = step?.onErrorGotoLabel || defaults.gotoLabel;
    return { mode, retryCount, retryDelay, gotoLabel };
  }
  function findLoopPairs(stepsList, onIssue = () => {
  }) {
    const stack = [];
    const pairs = [];
    for (let i = 0; i < stepsList.length; i++) {
      const s = stepsList[i];
      if (!s || !s.type)
        continue;
      if (s.type === "loop-start") {
        stack.push({ startIndex: i, id: s.id });
        continue;
      }
      if (s.type !== "loop-end")
        continue;
      let matched = null;
      if (s.loopRef) {
        for (let j = stack.length - 1; j >= 0; j--) {
          if (stack[j].id === s.loopRef) {
            matched = { startIndex: stack[j].startIndex, endIndex: i };
            stack.splice(j, 1);
            break;
          }
        }
      }
      if (!matched) {
        const last = stack.pop();
        if (last) {
          matched = { startIndex: last.startIndex, endIndex: i };
        } else {
          onIssue(`Unmatched loop-end at index ${i}`);
        }
      }
      if (matched)
        pairs.push(matched);
    }
    if (stack.length) {
      for (const rem of stack) {
        onIssue(`Unclosed loop-start at index ${rem.startIndex}`);
      }
    }
    pairs.sort((a, b) => a.startIndex - b.startIndex);
    return pairs;
  }
  function findIfPairs(stepsList, onIssue = () => {
  }) {
    const stack = [];
    const ifToElse = /* @__PURE__ */ new Map();
    const ifToEnd = /* @__PURE__ */ new Map();
    const elseToEnd = /* @__PURE__ */ new Map();
    for (let i = 0; i < stepsList.length; i++) {
      const s = stepsList[i];
      if (!s || !s.type)
        continue;
      if (s.type === "if-start") {
        stack.push({ ifIndex: i, elseIndex: null });
        continue;
      }
      if (s.type === "else") {
        if (stack.length === 0) {
          onIssue(`Else without matching if-start at index ${i}`);
          continue;
        }
        const top2 = stack[stack.length - 1];
        if (top2.elseIndex === null) {
          top2.elseIndex = i;
        } else {
          onIssue(`Multiple else blocks for if-start at index ${top2.ifIndex}`);
        }
        continue;
      }
      if (s.type !== "if-end")
        continue;
      const top = stack.pop();
      if (!top) {
        onIssue(`If-end without matching if-start at index ${i}`);
        continue;
      }
      ifToEnd.set(top.ifIndex, i);
      if (top.elseIndex !== null) {
        ifToElse.set(top.ifIndex, top.elseIndex);
        elseToEnd.set(top.elseIndex, i);
      }
    }
    if (stack.length) {
      for (const rem of stack) {
        onIssue(`Unclosed if-start at index ${rem.ifIndex}`);
      }
    }
    return { ifToElse, ifToEnd, elseToEnd };
  }

  // src/injected/runtime/conditions.js
  function extractRowValue(fieldMapping, currentRow) {
    if (!currentRow || !fieldMapping)
      return "";
    let value = currentRow[fieldMapping];
    if (value === void 0 && fieldMapping.includes(":")) {
      const fieldName = fieldMapping.split(":").pop();
      value = currentRow[fieldName];
    }
    return value === void 0 || value === null ? "" : String(value);
  }
  function getElementTextForCondition(element) {
    if (!element)
      return "";
    const aria = element.getAttribute?.("aria-label");
    if (aria)
      return aria.trim();
    const text = element.textContent?.trim();
    return text || "";
  }
  function getElementValueForCondition(element) {
    if (!element)
      return "";
    if ("value" in element && element.value !== void 0) {
      return String(element.value ?? "");
    }
    return getElementTextForCondition(element);
  }
  function evaluateCondition(step, currentRow, deps = {}) {
    const findElement = deps.findElementInActiveContext || (() => null);
    const isVisible = deps.isElementVisible || (() => false);
    const type = step?.conditionType || "ui-visible";
    if (type.startsWith("ui-")) {
      const controlName = step?.conditionControlName || step?.controlName || "";
      const element = controlName ? findElement(controlName) : null;
      switch (type) {
        case "ui-visible":
          return !!element && isVisible(element);
        case "ui-hidden":
          return !element || !isVisible(element);
        case "ui-exists":
          return !!element;
        case "ui-not-exists":
          return !element;
        case "ui-text-equals": {
          const actual = normalizeText(getElementTextForCondition(element));
          const expected = normalizeText(step?.conditionValue || "");
          return actual === expected;
        }
        case "ui-text-contains": {
          const actual = normalizeText(getElementTextForCondition(element));
          const expected = normalizeText(step?.conditionValue || "");
          return actual.includes(expected);
        }
        case "ui-value-equals": {
          const actual = normalizeText(getElementValueForCondition(element));
          const expected = normalizeText(step?.conditionValue || "");
          return actual === expected;
        }
        case "ui-value-contains": {
          const actual = normalizeText(getElementValueForCondition(element));
          const expected = normalizeText(step?.conditionValue || "");
          return actual.includes(expected);
        }
        default:
          return false;
      }
    }
    if (type.startsWith("data-")) {
      const fieldMapping = step?.conditionFieldMapping || "";
      const actualRaw = extractRowValue(fieldMapping, currentRow);
      const actual = normalizeText(actualRaw);
      const expected = normalizeText(step?.conditionValue || "");
      switch (type) {
        case "data-equals":
          return actual === expected;
        case "data-not-equals":
          return actual !== expected;
        case "data-contains":
          return actual.includes(expected);
        case "data-empty":
          return actual === "";
        case "data-not-empty":
          return actual !== "";
        default:
          return false;
      }
    }
    return false;
  }

  // src/injected/runtime/timing.js
  var DEFAULT_SETTINGS = Object.freeze({
    delayAfterClick: 800,
    delayAfterInput: 400,
    delayAfterSave: 1e3
  });
  var BASE_TIMINGS = Object.freeze({
    QUICK_RETRY_DELAY: 50,
    INPUT_SETTLE_DELAY: 100,
    FLOW_STABILITY_POLL_DELAY: 120,
    MEDIUM_SETTLE_DELAY: 150,
    INTERRUPTION_POLL_DELAY: 150,
    ANIMATION_DELAY: 200,
    MESSAGE_CLOSE_DELAY: 250,
    UI_UPDATE_DELAY: 300,
    DIALOG_ACTION_DELAY: 350,
    POST_INPUT_DELAY: 400,
    DEFAULT_WAIT_STEP_DELAY: 500,
    SAVE_SETTLE_DELAY: 600,
    CLICK_ANIMATION_DELAY: 800,
    VALIDATION_WAIT: 1e3
  });
  var TIMING_CHANNEL = Object.freeze({
    QUICK_RETRY_DELAY: "input",
    INPUT_SETTLE_DELAY: "input",
    FLOW_STABILITY_POLL_DELAY: "general",
    MEDIUM_SETTLE_DELAY: "input",
    INTERRUPTION_POLL_DELAY: "input",
    ANIMATION_DELAY: "input",
    MESSAGE_CLOSE_DELAY: "click",
    UI_UPDATE_DELAY: "click",
    DIALOG_ACTION_DELAY: "click",
    POST_INPUT_DELAY: "input",
    DEFAULT_WAIT_STEP_DELAY: "click",
    SAVE_SETTLE_DELAY: "save",
    CLICK_ANIMATION_DELAY: "click",
    VALIDATION_WAIT: "save"
  });
  function normalizeDelay(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
      return fallback;
    return parsed;
  }
  function roundDelay(value) {
    return Math.max(10, Math.round(value));
  }
  function getSpeedProfile(scales) {
    const averageScale = (scales.click + scales.input + scales.save) / 3;
    if (averageScale <= 0.9)
      return "fast";
    if (averageScale >= 1.1)
      return "slow";
    return "normal";
  }
  function getWorkflowTimings(settings = {}) {
    const merged = {
      delayAfterClick: normalizeDelay(settings.delayAfterClick, DEFAULT_SETTINGS.delayAfterClick),
      delayAfterInput: normalizeDelay(settings.delayAfterInput, DEFAULT_SETTINGS.delayAfterInput),
      delayAfterSave: normalizeDelay(settings.delayAfterSave, DEFAULT_SETTINGS.delayAfterSave)
    };
    const scales = {
      click: merged.delayAfterClick / DEFAULT_SETTINGS.delayAfterClick,
      input: merged.delayAfterInput / DEFAULT_SETTINGS.delayAfterInput,
      save: merged.delayAfterSave / DEFAULT_SETTINGS.delayAfterSave
    };
    scales.general = (scales.click + scales.input + scales.save) / 3;
    const timings = {};
    Object.entries(BASE_TIMINGS).forEach(([key, baseValue]) => {
      const channel = TIMING_CHANNEL[key] || "general";
      const scale = scales[channel] || scales.general;
      timings[key] = roundDelay(baseValue * scale);
    });
    timings.systemSpeed = getSpeedProfile(scales);
    timings.settings = merged;
    return timings;
  }

  // src/injected/utils/dom.js
  function findElementInActiveContext(controlName) {
    const allMatches = document.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
    if (allMatches.length === 0)
      return null;
    if (allMatches.length === 1)
      return allMatches[0];
    for (const el of allMatches) {
      const dialog = el.closest('[data-dyn-role="Dialog"], .dialog-container, .flyout-container, [role="dialog"]');
      if (dialog && isElementVisible(dialog)) {
        console.log(`Found ${controlName} in dialog context`);
        return el;
      }
    }
    for (const el of allMatches) {
      const tabPage = el.closest('[data-dyn-role="TabPage"], .tabPage');
      if (tabPage) {
        const isExpanded = tabPage.classList.contains("expanded") || tabPage.getAttribute("aria-expanded") === "true" || !tabPage.classList.contains("collapsed");
        if (isExpanded && isElementVisible(el)) {
          console.log(`Found ${controlName} in expanded tab context`);
          return el;
        }
      }
    }
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body) {
      const activeFormContext = activeElement.closest('[data-dyn-form-name], [data-dyn-role="Form"]');
      if (activeFormContext) {
        for (const el of allMatches) {
          if (activeFormContext.contains(el) && isElementVisible(el)) {
            console.log(`Found ${controlName} in active form context`);
            return el;
          }
        }
      }
    }
    const visibleMatches = Array.from(allMatches).filter((el) => isElementVisible(el));
    if (visibleMatches.length > 0) {
      return visibleMatches[visibleMatches.length - 1];
    }
    return allMatches[0];
  }
  function isElementVisible(el) {
    if (!el)
      return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }
  function isD365Loading() {
    const loadingSelectors = [
      '.dyn-loading-overlay:not([style*="display: none"])',
      '.dyn-loading-indicator:not([style*="display: none"])',
      '.dyn-spinner:not([style*="display: none"])',
      '.loading-indicator:not([style*="display: none"])',
      '.dyn-messageBusy:not([style*="display: none"])',
      '[data-dyn-loading="true"]',
      ".busy-indicator",
      '.dyn-loadingStub:not([style*="display: none"])',
      '.dyn-processingMsg:not([style*="display: none"])'
    ];
    for (const selector of loadingSelectors) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        return true;
      }
    }
    if (window.$dyn && window.$dyn.isProcessing) {
      return window.$dyn.isProcessing();
    }
    if (isD365ProcessingMessage()) {
      return true;
    }
    return false;
  }
  function isD365ProcessingMessage() {
    const messageSelectors = [
      ".messageBar",
      ".dyn-messageBar",
      ".dyn-msgBox",
      ".dyn-infoBox",
      '[data-dyn-role="MsgBox"]',
      '[data-dyn-role="InfoBox"]',
      ".dialog-container",
      '[role="dialog"]',
      '[role="alertdialog"]',
      ".sysBoxContent",
      ".processing-dialog"
    ];
    const waitPhrases = [
      "please wait",
      "processing your request",
      "we're processing",
      "being processed",
      "please be patient",
      "operation in progress"
    ];
    for (const selector of messageSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el && el.offsetParent !== null) {
          const text = (el.textContent || "").toLowerCase();
          if (waitPhrases.some((phrase) => text.includes(phrase))) {
            return true;
          }
        }
      }
    }
    const overlays = document.querySelectorAll(
      '.modal, .overlay, [class*="overlay"], [class*="modal"], [class*="blocking"]'
    );
    for (const el of overlays) {
      if (el && el.offsetParent !== null) {
        const text = (el.textContent || "").toLowerCase();
        if (waitPhrases.some((phrase) => text.includes(phrase))) {
          return true;
        }
      }
    }
    return false;
  }
  function findGridCellElement(controlName) {
    const pendingNew = window.__d365_pendingNewRow;
    if (pendingNew && pendingNew.rowElement && Date.now() - pendingNew.timestamp < 15e3) {
      const cell = pendingNew.rowElement.querySelector(
        `[data-dyn-controlname="${controlName}"]`
      );
      if (cell && cell.offsetParent !== null) {
        return cell;
      }
    }
    const selectedRows = document.querySelectorAll('[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow');
    for (const row of selectedRows) {
      const cell = row.querySelector(`[data-dyn-controlname="${controlName}"]`);
      if (cell && cell.offsetParent !== null) {
        return cell;
      }
    }
    const reactGrids = document.querySelectorAll(".reactGrid");
    for (const grid of reactGrids) {
      const activeRow = grid.querySelector('.fixedDataTableRowLayout_main[aria-selected="true"], .fixedDataTableRowLayout_main[data-dyn-row-active="true"]');
      if (activeRow) {
        const cell = activeRow.querySelector(`[data-dyn-controlname="${controlName}"]`);
        if (cell && cell.offsetParent !== null) {
          return cell;
        }
      }
      const bodyContainer = grid.querySelector(".fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer");
      if (bodyContainer) {
        const cells = bodyContainer.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
        let lastVisibleCell = null;
        for (const cell of cells) {
          const isInHeader = cell.closest(".fixedDataTableLayout_header, .dyn-headerCell");
          if (!isInHeader && cell.offsetParent !== null) {
            lastVisibleCell = cell;
          }
        }
        if (lastVisibleCell)
          return lastVisibleCell;
      }
    }
    const grids = document.querySelectorAll('[data-dyn-role="Grid"]');
    for (const grid of grids) {
      const cells = grid.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
      let lastVisibleCell = null;
      for (const cell of cells) {
        const isInHeader = cell.closest('[data-dyn-role="ColumnHeader"], [role="columnheader"], thead');
        if (!isInHeader && cell.offsetParent !== null) {
          lastVisibleCell = cell;
        }
      }
      if (lastVisibleCell)
        return lastVisibleCell;
    }
    return findElementInActiveContext(controlName);
  }
  function hasLookupButton(element) {
    return element.classList.contains("field-hasLookupButton") || element.querySelector('.lookup-button, [data-dyn-role="LookupButton"]') !== null || element.nextElementSibling?.classList.contains("lookup-button");
  }
  function findLookupButton(element) {
    const selectors = [".lookup-button", ".lookupButton", '[data-dyn-role="LookupButton"]'];
    for (const selector of selectors) {
      const direct = element.querySelector(selector);
      if (direct)
        return direct;
    }
    const container = element.closest(".input_container, .form-group, .lookupField") || element.parentElement;
    if (!container)
      return null;
    for (const selector of selectors) {
      const inContainer = container.querySelector(selector);
      if (inContainer)
        return inContainer;
    }
    const ariaButton = container.querySelector('button[aria-label*="Lookup"], button[aria-label*="Open"], button[aria-label*="Select"]');
    if (ariaButton)
      return ariaButton;
    return null;
  }
  function isElementVisibleGlobal(element) {
    if (!element)
      return false;
    const style = window.getComputedStyle(element);
    return element.offsetParent !== null && style.visibility !== "hidden" && style.display !== "none";
  }
  function pickNearestRows(rows, targetElement) {
    if (!rows.length)
      return rows;
    const targetRect = targetElement?.getBoundingClientRect?.();
    if (!targetRect)
      return rows;
    return rows.slice().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const da = Math.abs(ra.left - targetRect.left) + Math.abs(ra.top - targetRect.bottom);
      const db = Math.abs(rb.left - targetRect.left) + Math.abs(rb.top - targetRect.bottom);
      return da - db;
    });
  }
  function getGridRowCount() {
    let count = 0;
    const reactGrids = document.querySelectorAll(".reactGrid");
    for (const grid of reactGrids) {
      const bodyContainer = grid.querySelector(".fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer");
      if (bodyContainer) {
        const rows = bodyContainer.querySelectorAll(
          '.fixedDataTableRowLayout_main, [role="row"]:not([role="columnheader"])'
        );
        for (const row of rows) {
          if (row.offsetParent !== null && !row.closest(".fixedDataTableLayout_header")) {
            count++;
          }
        }
      }
    }
    if (count === 0) {
      const grids = document.querySelectorAll('[data-dyn-role="Grid"]');
      for (const grid of grids) {
        const rows = grid.querySelectorAll(
          '[data-dyn-role="Row"]:not([data-dyn-role="ColumnHeader"]), [role="row"]:not([role="columnheader"]):not(thead [role="row"]), tbody tr'
        );
        for (const row of rows) {
          if (row.offsetParent !== null)
            count++;
        }
      }
    }
    return count;
  }
  function getGridSelectedRow() {
    const reactGrids = document.querySelectorAll(".reactGrid");
    for (const grid of reactGrids) {
      const bodyContainer = grid.querySelector(".fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer");
      if (!bodyContainer)
        continue;
      const allRows = Array.from(bodyContainer.querySelectorAll(
        ".fixedDataTableRowLayout_main"
      )).filter((r) => r.offsetParent !== null && !r.closest(".fixedDataTableLayout_header"));
      for (let i = 0; i < allRows.length; i++) {
        if (allRows[i].getAttribute("aria-selected") === "true" || allRows[i].getAttribute("data-dyn-row-active") === "true") {
          return { row: allRows[i], rowIndex: i, totalRows: allRows.length };
        }
      }
    }
    const selectedRows = document.querySelectorAll(
      '[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow'
    );
    for (const row of selectedRows) {
      if (row.offsetParent !== null) {
        return { row, rowIndex: -1, totalRows: -1 };
      }
    }
    return null;
  }
  function inspectGridState() {
    const grids = [];
    const reactGridEls = document.querySelectorAll(".reactGrid");
    for (const grid of reactGridEls) {
      const bodyContainer = grid.querySelector(".fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer");
      if (!bodyContainer)
        continue;
      const allRows = Array.from(bodyContainer.querySelectorAll(
        ".fixedDataTableRowLayout_main"
      )).filter((r) => r.offsetParent !== null && !r.closest(".fixedDataTableLayout_header"));
      const rowDetails = allRows.map((row, idx) => {
        const isSelected = row.getAttribute("aria-selected") === "true";
        const isActive = row.getAttribute("data-dyn-row-active") === "true";
        const cellControls = Array.from(row.querySelectorAll("[data-dyn-controlname]")).map((c) => c.getAttribute("data-dyn-controlname"));
        const hasInput = !!row.querySelector('input:not([type="hidden"]), textarea, select');
        return { index: idx, isSelected, isActive, cellControls, hasInput };
      });
      grids.push({
        type: "ReactGrid",
        totalRows: allRows.length,
        selectedRows: rowDetails.filter((r) => r.isSelected).map((r) => r.index),
        activeRows: rowDetails.filter((r) => r.isActive).map((r) => r.index),
        rows: rowDetails
      });
    }
    const tradGrids = document.querySelectorAll('[data-dyn-role="Grid"]');
    for (const grid of tradGrids) {
      const controlName = grid.getAttribute("data-dyn-controlname") || "unknown";
      const rows = Array.from(grid.querySelectorAll(
        '[data-dyn-role="Row"], [role="row"]:not(thead [role="row"]), tbody tr'
      )).filter((r) => r.offsetParent !== null);
      const rowDetails = rows.map((row, idx) => {
        const isSelected = row.getAttribute("data-dyn-selected") === "true" || row.getAttribute("aria-selected") === "true" || row.classList.contains("dyn-selectedRow");
        const cellControls = Array.from(row.querySelectorAll("[data-dyn-controlname]")).map((c) => c.getAttribute("data-dyn-controlname"));
        return { index: idx, isSelected, cellControls };
      });
      grids.push({
        type: "TraditionalGrid",
        controlName,
        totalRows: rows.length,
        selectedRows: rowDetails.filter((r) => r.isSelected).map((r) => r.index),
        rows: rowDetails
      });
    }
    return {
      gridCount: grids.length,
      grids,
      pendingNewRow: !!window.__d365_pendingNewRow,
      pendingNewRowData: window.__d365_pendingNewRow || null
    };
  }
  function findLookupFilterInput(lookupDock) {
    if (!lookupDock)
      return null;
    const candidates = Array.from(
      lookupDock.querySelectorAll('input[type="text"], input[role="textbox"]')
    );
    if (!candidates.length)
      return null;
    const segmentInput = candidates.find((input) => input.closest(".segmentedEntry-flyoutSegment"));
    if (segmentInput)
      return segmentInput;
    const segmentContainer = lookupDock.querySelector(".segmentedEntry-flyoutSegment .segmentedEntry-segmentInput");
    if (segmentContainer) {
      const inner = segmentContainer.querySelector('input, [role="textbox"]');
      if (inner)
        return inner;
    }
    const headerCandidate = candidates.find(
      (input) => input.closest('.lookup-header, .lookup-toolbar, .grid-header, [role="toolbar"]')
    );
    if (headerCandidate)
      return headerCandidate;
    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const input of candidates) {
      const rect = input.getBoundingClientRect();
      const score = rect.top * 2 + rect.left;
      if (score < bestScore) {
        bestScore = score;
        best = input;
      }
    }
    return best;
  }

  // src/injected/utils/lookup.js
  async function waitForLookupPopup(timeoutMs = 2e3) {
    const selectors = [
      ".lookup-buttonContainer",
      ".lookupDock-buttonContainer",
      '[role="dialog"]',
      ".lookup-flyout",
      ".lookupFlyout",
      '[data-dyn-role="Lookup"]',
      '[data-dyn-role="LookupGrid"]',
      ".lookup-container",
      ".lookup",
      '[role="grid"]',
      "table"
    ];
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      for (const selector of selectors) {
        const popup = document.querySelector(selector);
        if (!popup)
          continue;
        if (popup.classList?.contains("messageCenter"))
          continue;
        if (popup.getAttribute("aria-label") === "Action center")
          continue;
        if (!isElementVisibleGlobal(popup))
          continue;
        return popup;
      }
      await sleep(100);
    }
    return null;
  }
  async function waitForLookupRows(lookupDock, targetElement, timeoutMs = 3e3) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let rows = lookupDock?.querySelectorAll?.('tr[data-dyn-row], .lookup-row, [role="row"]') || [];
      if (rows.length)
        return rows;
      const globalRows = Array.from(document.querySelectorAll('tr[data-dyn-row], .lookup-row, [role="row"]')).filter(isElementVisibleGlobal);
      if (globalRows.length) {
        return pickNearestRows(globalRows, targetElement);
      }
      await sleep(150);
    }
    return [];
  }
  async function waitForLookupDockForElement(targetElement, timeoutMs = 3e3) {
    const start = Date.now();
    const targetRect = targetElement?.getBoundingClientRect?.();
    while (Date.now() - start < timeoutMs) {
      const docks = Array.from(document.querySelectorAll(".lookupDock-buttonContainer")).filter(isElementVisibleGlobal).filter((dock) => !dock.classList?.contains("messageCenter"));
      if (docks.length) {
        const withRows = docks.filter((dock) => dock.querySelector('tr[data-dyn-row], .lookup-row, [role="row"], [role="grid"], table'));
        const candidates = withRows.length ? withRows : docks;
        const best = pickNearestDock(candidates, targetRect);
        if (best)
          return best;
      }
      await sleep(100);
    }
    return null;
  }
  function pickNearestDock(docks, targetRect) {
    if (!docks.length)
      return null;
    if (!targetRect)
      return docks[0];
    let best = docks[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const dock of docks) {
      const rect = dock.getBoundingClientRect();
      const dx = Math.abs(rect.left - targetRect.left);
      const dy = Math.abs(rect.top - targetRect.bottom);
      const score = dx + dy;
      if (score < bestScore) {
        bestScore = score;
        best = dock;
      }
    }
    return best;
  }
  async function waitForListboxForElement(targetElement, timeoutMs = 2e3) {
    const selectors = ['[role="listbox"]', ".dropDownList", ".comboBoxDropDown", ".dropdown-menu", ".dropdown-list"];
    const start = Date.now();
    const targetRect = targetElement?.getBoundingClientRect?.();
    while (Date.now() - start < timeoutMs) {
      const lists = selectors.flatMap((sel) => Array.from(document.querySelectorAll(sel))).filter(isElementVisibleGlobal);
      if (lists.length) {
        return pickNearestDock(lists, targetRect);
      }
      await sleep(100);
    }
    return null;
  }
  async function waitForListboxForInput(input, targetElement, timeoutMs = 2e3) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const linked = getListboxFromInput(input);
      if (linked && isElementVisibleGlobal(linked)) {
        return linked;
      }
      const fallback = await waitForListboxForElement(targetElement, 200);
      if (fallback)
        return fallback;
      await sleep(100);
    }
    return null;
  }
  function getListboxFromInput(input) {
    if (!input)
      return null;
    const id = input.getAttribute("aria-controls") || input.getAttribute("aria-owns");
    if (id) {
      const el = document.getElementById(id);
      if (el)
        return el;
    }
    const activeId = input.getAttribute("aria-activedescendant");
    if (activeId) {
      const active = document.getElementById(activeId);
      const list = active?.closest?.('[role="listbox"]');
      if (list)
        return list;
    }
    return null;
  }
  function findComboBoxButton(element) {
    const selectors = [
      ".lookupButton",
      ".comboBox-button",
      ".comboBox-dropDownButton",
      ".dropdownButton",
      '[data-dyn-role="DropDownButton"]',
      'button[aria-label*="Open"]',
      'button[aria-label*="Select"]'
    ];
    for (const selector of selectors) {
      const btn = element.querySelector(selector);
      if (btn)
        return btn;
    }
    const container = element.closest(".input_container, .form-group") || element.parentElement;
    if (!container)
      return null;
    for (const selector of selectors) {
      const btn = container.querySelector(selector);
      if (btn)
        return btn;
    }
    return null;
  }
  function collectComboOptions(listbox) {
    const selectors = [
      '[role="option"]',
      ".comboBox-listItem",
      ".comboBox-item",
      "li",
      ".dropdown-list-item",
      ".comboBoxItem",
      ".dropDownListItem",
      ".dropdown-item"
    ];
    const found = [];
    for (const selector of selectors) {
      listbox.querySelectorAll(selector).forEach((el) => {
        if (isElementVisibleGlobal(el))
          found.push(el);
      });
    }
    return found.length ? found : Array.from(listbox.children).filter(isElementVisibleGlobal);
  }

  // src/injected/utils/combobox.js
  async function typeValueSlowly(input, value) {
    if (typeof input.click === "function") {
      input.click();
    }
    input.focus();
    await sleep(100);
    setNativeValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(50);
    const stringValue = String(value);
    let buffer = "";
    for (let i = 0; i < stringValue.length; i++) {
      const char = stringValue[i];
      buffer += char;
      setNativeValue(input, buffer);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      await sleep(80);
    }
    await sleep(200);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
    await sleep(800);
  }
  async function typeValueWithInputEvents(input, value) {
    if (typeof input.click === "function") {
      input.click();
    }
    input.focus();
    await sleep(80);
    setNativeValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(50);
    const stringValue = String(value ?? "");
    let buffer = "";
    for (let i = 0; i < stringValue.length; i++) {
      const char = stringValue[i];
      buffer += char;
      setNativeValue(input, buffer);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      input.dispatchEvent(new InputEvent("input", { data: char, inputType: "insertText", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      await sleep(60);
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(200);
  }
  async function waitForInputValue(input, value, timeoutMs = 2e3) {
    const expected = String(value ?? "").trim();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const current = String(input?.value ?? "").trim();
      if (current === expected)
        return true;
      await sleep(100);
    }
    return false;
  }
  async function setValueOnce(input, value, clearFirst = false) {
    input.focus();
    await sleep(100);
    if (clearFirst) {
      setNativeValue(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(50);
    }
    setNativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(200);
  }
  async function setValueWithVerify(input, value) {
    const expected = String(value ?? "").trim();
    await setValueOnce(input, value, true);
    await sleep(150);
    if (String(input.value ?? "").trim() !== expected) {
      await typeValueSlowly(input, expected);
    }
  }
  async function comboInputMethod1(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(100);
    return input.value;
  }
  async function comboInputMethod2(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, "");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward"
    }));
    await sleep(50);
    setNativeValue(input, value);
    input.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertFromPaste",
      data: value
    }));
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromPaste",
      data: value
    }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(100);
    return input.value;
  }
  async function comboInputMethod3(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, "");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward"
    }));
    await sleep(50);
    const stringValue = String(value);
    let buffer = "";
    for (let i = 0; i < stringValue.length; i++) {
      const char = stringValue[i];
      buffer += char;
      const currentValue = buffer;
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: char,
        code: getKeyCode(char),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));
      input.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: char
      }));
      setNativeValue(input, currentValue);
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: char
      }));
      input.dispatchEvent(new KeyboardEvent("keyup", {
        key: char,
        code: getKeyCode(char),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true
      }));
      await sleep(50);
    }
    await sleep(100);
    return input.value;
  }
  async function comboInputMethod4(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, "");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward"
    }));
    await sleep(50);
    const stringValue = String(value);
    let buffer = "";
    for (let i = 0; i < stringValue.length; i++) {
      const char = stringValue[i];
      const charCode = char.charCodeAt(0);
      buffer += char;
      const currentValue = buffer;
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: char,
        code: getKeyCode(char),
        keyCode: charCode,
        which: charCode,
        bubbles: true,
        cancelable: true
      }));
      input.dispatchEvent(new KeyboardEvent("keypress", {
        key: char,
        code: getKeyCode(char),
        keyCode: charCode,
        charCode,
        which: charCode,
        bubbles: true,
        cancelable: true
      }));
      input.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: char
      }));
      setNativeValue(input, currentValue);
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: char
      }));
      input.dispatchEvent(new KeyboardEvent("keyup", {
        key: char,
        code: getKeyCode(char),
        keyCode: charCode,
        which: charCode,
        bubbles: true
      }));
      await sleep(50);
    }
    await sleep(100);
    return input.value;
  }
  async function comboInputMethod5(input, value) {
    input.focus();
    await sleep(100);
    input.select();
    document.execCommand("delete");
    await sleep(50);
    document.execCommand("insertText", false, value);
    await sleep(100);
    return input.value;
  }
  async function comboInputMethod6(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, value);
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromPaste",
      data: value
    }));
    await sleep(100);
    const valueWithExtra = value + "X";
    setNativeValue(input, valueWithExtra);
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: "X"
    }));
    await sleep(50);
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Backspace",
      code: "Backspace",
      keyCode: 8,
      which: 8,
      bubbles: true,
      cancelable: true
    }));
    setNativeValue(input, value);
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward"
    }));
    input.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Backspace",
      code: "Backspace",
      keyCode: 8,
      which: 8,
      bubbles: true
    }));
    await sleep(100);
    return input.value;
  }
  async function comboInputMethod7(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(50);
    const stringValue = String(value);
    const parent = input.closest("[data-dyn-role]") || input.parentElement;
    for (let i = 0; i < stringValue.length; i++) {
      const char = stringValue[i];
      const currentValue = input.value + char;
      const keyboardEventInit = {
        key: char,
        code: getKeyCode(char),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      };
      const keydownEvent = new KeyboardEvent("keydown", keyboardEventInit);
      const keyupEvent = new KeyboardEvent("keyup", keyboardEventInit);
      input.dispatchEvent(keydownEvent);
      setNativeValue(input, currentValue);
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: char,
        composed: true,
        view: window
      }));
      input.dispatchEvent(keyupEvent);
      if (parent && parent !== input) {
        parent.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await sleep(50);
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (parent) {
      parent.dispatchEvent(new CustomEvent("ValueChanged", {
        bubbles: true,
        detail: { value }
      }));
    }
    await sleep(100);
    return input.value;
  }
  async function comboInputMethod8(input, value) {
    input.focus();
    await sleep(100);
    setNativeValue(input, "");
    await sleep(50);
    input.dispatchEvent(new CompositionEvent("compositionstart", {
      bubbles: true,
      cancelable: true,
      data: ""
    }));
    const stringValue = String(value);
    let currentValue = "";
    for (let i = 0; i < stringValue.length; i++) {
      currentValue += stringValue[i];
      input.dispatchEvent(new CompositionEvent("compositionupdate", {
        bubbles: true,
        data: currentValue
      }));
      setNativeValue(input, currentValue);
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        data: currentValue
      }));
      await sleep(50);
    }
    input.dispatchEvent(new CompositionEvent("compositionend", {
      bubbles: true,
      data: value
    }));
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromComposition",
      data: value
    }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(100);
    return input.value;
  }
  function getKeyCode(char) {
    const upperChar = char.toUpperCase();
    if (upperChar >= "A" && upperChar <= "Z") {
      return "Key" + upperChar;
    }
    if (char >= "0" && char <= "9") {
      return "Digit" + char;
    }
    const specialKeys = {
      " ": "Space",
      "-": "Minus",
      "=": "Equal",
      "[": "BracketLeft",
      "]": "BracketRight",
      "\\": "Backslash",
      ";": "Semicolon",
      "'": "Quote",
      ",": "Comma",
      ".": "Period",
      "/": "Slash",
      "`": "Backquote"
    };
    return specialKeys[char] || "Unidentified";
  }
  async function comboInputWithSelectedMethod(input, value, method) {
    console.log(`[D365] Using combobox input method: ${method}`);
    switch (method) {
      case "method1":
        return await comboInputMethod1(input, value);
      case "method2":
        return await comboInputMethod2(input, value);
      case "method3":
        return await comboInputMethod3(input, value);
      case "method4":
        return await comboInputMethod4(input, value);
      case "method5":
        return await comboInputMethod5(input, value);
      case "method6":
        return await comboInputMethod6(input, value);
      case "method7":
        return await comboInputMethod7(input, value);
      case "method8":
        return await comboInputMethod8(input, value);
      default:
        return await comboInputMethod3(input, value);
    }
  }
  function commitComboValue(input, value, element) {
    if (!input)
      return;
    input.focus();
    setNativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("focusout", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", code: "Tab", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
    input.blur();
    if (element) {
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    document.body?.click?.();
  }
  function dispatchClickSequence(target) {
    if (!target)
      return;
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    target.click();
  }

  // src/injected/steps/action-helpers.js
  function parseGridAndColumn(controlName) {
    const text = String(controlName || "");
    const lastUnderscoreIdx = text.lastIndexOf("_");
    if (lastUnderscoreIdx <= 0 || lastUnderscoreIdx === text.length - 1) {
      return { gridName: text, columnName: "" };
    }
    return {
      gridName: text.substring(0, lastUnderscoreIdx),
      columnName: text.substring(lastUnderscoreIdx + 1)
    };
  }
  function buildFilterFieldPatterns(controlName, gridName, columnName) {
    return [
      `FilterField_${gridName}_${columnName}_${columnName}_Input_0`,
      `FilterField_${controlName}_${columnName}_Input_0`,
      `FilterField_${controlName}_Input_0`,
      `FilterField_${gridName}_${columnName}_Input_0`,
      `${controlName}_FilterField_Input`,
      `${gridName}_${columnName}_FilterField`
    ];
  }
  function buildApplyButtonPatterns(controlName, gridName, columnName) {
    return [
      `${gridName}_${columnName}_ApplyFilters`,
      `${controlName}_ApplyFilters`,
      `${gridName}_ApplyFilters`,
      "ApplyFilters"
    ];
  }
  function getFilterMethodSearchTerms(method) {
    const methodMappings = {
      "is exactly": ["is exactly", "equals", "is equal to", "="],
      contains: ["contains", "like"],
      "begins with": ["begins with", "starts with"],
      "is not": ["is not", "not equal", "!=", "<>"],
      "does not contain": ["does not contain", "not like"],
      "is one of": ["is one of", "in"],
      after: ["after", "greater than", ">"],
      before: ["before", "less than", "<"],
      matches: ["matches", "regex", "pattern"]
    };
    return methodMappings[method] || [String(method || "")];
  }
  function textIncludesAny(text, terms) {
    const normalizedText = String(text || "").toLowerCase();
    return (terms || []).some((term) => normalizedText.includes(String(term || "").toLowerCase()));
  }

  // src/injected/steps/actions.js
  function comboInputWithSelectedMethod2(input, value, comboMethodOverride = "") {
    const method = comboMethodOverride || window.d365CurrentWorkflowSettings?.comboSelectMode || "method3";
    return comboInputWithSelectedMethod(input, value, method);
  }
  function getTimings() {
    return getWorkflowTimings(window.d365CurrentWorkflowSettings || {});
  }
  async function waitForTiming(key) {
    await sleep(getTimings()[key]);
  }
  function isSegmentedEntry(element) {
    if (!element)
      return false;
    if (element.getAttribute("data-dyn-role") === "SegmentedEntry")
      return true;
    if (element.closest?.('[data-dyn-role="SegmentedEntry"]'))
      return true;
    const classList = element.classList;
    if (classList && (classList.contains("segmentedEntry") || classList.contains("segmented-entry") || classList.contains("segmentedEntry-segmentInput"))) {
      return true;
    }
    return !!element.querySelector?.(".segmentedEntry-segmentInput, .segmentedEntry-flyoutSegment");
  }
  async function clickElement(controlName) {
    const element = findElementInActiveContext(controlName);
    if (!element)
      throw new Error(`Element not found: ${controlName}`);
    const isAddLineClick = isGridAddLineButton(controlName, element);
    let rowCountBefore = 0;
    let selectedRowBefore = null;
    if (isAddLineClick) {
      rowCountBefore = getGridRowCount();
      selectedRowBefore = getGridSelectedRow();
      logStep(`Add-line detected ("${controlName}"). Rows before: ${rowCountBefore}, selected row index: ${selectedRowBefore?.rowIndex ?? "none"}`);
    }
    element.click();
    await waitForTiming("CLICK_ANIMATION_DELAY");
    const maxLoadingPolls = 20;
    for (let i = 0; i < maxLoadingPolls; i++) {
      if (!isD365Loading())
        break;
      await sleep(100);
    }
    if (isD365ProcessingMessage()) {
      logStep(`Processing message detected after clicking "${controlName}". Waiting for it to clear...`);
      const processingStart = Date.now();
      const maxProcessingWait = 12e4;
      while (Date.now() - processingStart < maxProcessingWait) {
        await sleep(500);
        if (!isD365ProcessingMessage() && !isD365Loading()) {
          await sleep(300);
          if (!isD365ProcessingMessage() && !isD365Loading()) {
            logStep(`Processing message cleared after ${Math.round((Date.now() - processingStart) / 1e3)}s`);
            break;
          }
        }
      }
      if (isD365ProcessingMessage()) {
        logStep(`Warning: Processing message still visible after ${maxProcessingWait / 1e3}s`);
      }
    }
    if (isAddLineClick) {
      await waitForNewGridRow(rowCountBefore, selectedRowBefore, 8e3);
    }
  }
  function isGridAddLineButton(controlName, element) {
    const name = (controlName || "").toLowerCase();
    const addLineNames = [
      "systemdefinednewbutton",
      "linestripnew",
      "newline",
      "addline",
      "add_line",
      "gridaddnew",
      "buttoncreate",
      "newbutton",
      "systemdefinedaddbutton"
    ];
    if (addLineNames.some((n) => name.includes(n)))
      return true;
    const label = (element?.textContent || "").trim().toLowerCase();
    const ariaLabel = (element?.getAttribute("aria-label") || "").toLowerCase();
    const combined = `${label} ${ariaLabel}`;
    if (/\badd\s*line\b/.test(combined) || /\bnew\s*line\b/.test(combined) || /\+\s*add\s*line/i.test(combined)) {
      return true;
    }
    const toolbar = element?.closest('[data-dyn-role="ActionPane"], [role="toolbar"], .buttonStrip');
    if (toolbar && /\bnew\b/i.test(combined))
      return true;
    return false;
  }
  async function waitForNewGridRow(rowCountBefore, selectedRowBefore, timeout = 8e3) {
    const start = Date.now();
    const prevIdx = selectedRowBefore?.rowIndex ?? -1;
    let settled = false;
    while (Date.now() - start < timeout) {
      if (isD365Loading()) {
        await sleep(100);
        continue;
      }
      const currentCount = getGridRowCount();
      const currentSelected = getGridSelectedRow();
      const curIdx = currentSelected?.rowIndex ?? -1;
      const rowCountIncreased = currentCount > rowCountBefore;
      const selectionChangedToNewerRow = curIdx >= 0 && curIdx !== prevIdx && curIdx >= prevIdx;
      const selectionExists = curIdx >= 0;
      if (rowCountIncreased && selectionExists || selectionChangedToNewerRow) {
        await sleep(150);
        const verifySelected = getGridSelectedRow();
        if (verifySelected && verifySelected.rowIndex === curIdx) {
          window.__d365_pendingNewRow = {
            rowElement: currentSelected.row,
            rowIndex: curIdx,
            timestamp: Date.now()
          };
          logStep(`New grid row confirmed. Rows: ${rowCountBefore} -> ${currentCount}, selected row: ${prevIdx} -> ${curIdx}`);
          settled = true;
          break;
        }
      }
      await sleep(120);
    }
    if (!settled) {
      const lastSelected = getGridSelectedRow();
      if (lastSelected) {
        window.__d365_pendingNewRow = {
          rowElement: lastSelected.row,
          rowIndex: lastSelected.rowIndex,
          timestamp: Date.now()
        };
      }
      logStep(`Warning: waitForNewGridRow timed out after ${timeout}ms. Rows: ${rowCountBefore} -> ${getGridRowCount()}, selected: ${prevIdx} -> ${lastSelected?.rowIndex ?? "none"}`);
    }
  }
  async function applyGridFilter(controlName, filterValue, filterMethod = "is exactly", comboMethodOverride = "") {
    const { gridName, columnName } = parseGridAndColumn(controlName);
    async function findFilterInput() {
      const filterFieldPatterns = buildFilterFieldPatterns(controlName, gridName, columnName);
      let filterInput2 = null;
      let filterFieldContainer2 = null;
      for (const pattern of filterFieldPatterns) {
        filterFieldContainer2 = document.querySelector(`[data-dyn-controlname="${pattern}"]`);
        if (filterFieldContainer2) {
          filterInput2 = filterFieldContainer2.querySelector('input:not([type="hidden"])') || filterFieldContainer2.querySelector("input");
          if (filterInput2 && filterInput2.offsetParent !== null) {
            return { filterInput: filterInput2, filterFieldContainer: filterFieldContainer2 };
          }
        }
      }
      const partialMatches = document.querySelectorAll(`[data-dyn-controlname*="FilterField"][data-dyn-controlname*="${columnName}"]`);
      for (const container of partialMatches) {
        filterInput2 = container.querySelector('input:not([type="hidden"])');
        if (filterInput2 && filterInput2.offsetParent !== null) {
          return { filterInput: filterInput2, filterFieldContainer: container };
        }
      }
      const filterContainers = document.querySelectorAll('.dyn-filter-popup, .filter-panel, [data-dyn-role="FilterPane"], [class*="filter"]');
      for (const container of filterContainers) {
        filterInput2 = container.querySelector('input:not([type="hidden"]):not([readonly])');
        if (filterInput2 && filterInput2.offsetParent !== null) {
          return { filterInput: filterInput2, filterFieldContainer: container };
        }
      }
      const visibleFilterInputs = document.querySelectorAll('[data-dyn-controlname*="FilterField"] input:not([type="hidden"])');
      for (const inp of visibleFilterInputs) {
        if (inp.offsetParent !== null) {
          filterFieldContainer2 = inp.closest('[data-dyn-controlname*="FilterField"]');
          return { filterInput: inp, filterFieldContainer: filterFieldContainer2 };
        }
      }
      return { filterInput: null, filterFieldContainer: null };
    }
    let { filterInput, filterFieldContainer } = await findFilterInput();
    if (!filterInput) {
      const allHeaders = document.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
      let clickTarget = null;
      for (const h of allHeaders) {
        if (h.classList.contains("dyn-headerCell") || h.id?.includes("header") || h.closest(".dyn-headerCell") || h.closest('[role="columnheader"]')) {
          clickTarget = h;
          break;
        }
      }
      if (!clickTarget) {
        clickTarget = document.querySelector(`[id*="${controlName}"][id*="header"]`);
      }
      if (!clickTarget) {
        clickTarget = document.querySelector(`[data-dyn-controlname="${controlName}"]`);
      }
      if (!clickTarget) {
        throw new Error(`Filter column header not found: ${controlName}`);
      }
      clickTarget.click();
      await waitForTiming("CLICK_ANIMATION_DELAY");
      for (let attempt = 0; attempt < 10; attempt++) {
        ({ filterInput, filterFieldContainer } = await findFilterInput());
        if (filterInput)
          break;
        await waitForTiming("ANIMATION_DELAY");
      }
    }
    if (!filterInput) {
      throw new Error(`Filter input not found. Make sure the filter dropdown is open. Expected pattern: FilterField_${gridName}_${columnName}_${columnName}_Input_0`);
    }
    if (filterMethod && filterMethod !== "is exactly") {
      await setFilterMethod(filterFieldContainer, filterMethod);
    }
    filterInput.focus();
    await waitForTiming("INPUT_SETTLE_DELAY");
    filterInput.select();
    filterInput.value = "";
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    await waitForTiming("INPUT_SETTLE_DELAY");
    await comboInputWithSelectedMethod2(filterInput, String(filterValue ?? ""), comboMethodOverride);
    if (normalizeText(filterInput.value) !== normalizeText(filterValue)) {
      setNativeValue(filterInput, String(filterValue ?? ""));
    }
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    filterInput.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForTiming("UI_UPDATE_DELAY");
    const applyBtnPatterns = buildApplyButtonPatterns(controlName, gridName, columnName);
    let applyBtn = null;
    for (const pattern of applyBtnPatterns) {
      applyBtn = document.querySelector(`[data-dyn-controlname="${pattern}"]`);
      if (applyBtn && applyBtn.offsetParent !== null) {
        break;
      }
    }
    if (!applyBtn || applyBtn.offsetParent === null) {
      const allApplyBtns = document.querySelectorAll('[data-dyn-controlname*="ApplyFilters"]');
      for (const btn of allApplyBtns) {
        if (btn.offsetParent !== null) {
          applyBtn = btn;
          break;
        }
      }
    }
    if (applyBtn) {
      applyBtn.click();
      await waitForTiming("VALIDATION_WAIT");
    } else {
      filterInput.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 13,
        code: "Enter",
        bubbles: true
      }));
      filterInput.dispatchEvent(new KeyboardEvent("keyup", {
        key: "Enter",
        keyCode: 13,
        code: "Enter",
        bubbles: true
      }));
      await waitForTiming("VALIDATION_WAIT");
    }
  }
  async function waitUntilCondition(controlName, condition, expectedValue, timeout) {
    const startTime = Date.now();
    let effectiveTimeout = timeout;
    while (Date.now() - startTime < effectiveTimeout) {
      if (isD365Loading() || isD365ProcessingMessage()) {
        const elapsed = Date.now() - startTime;
        if (effectiveTimeout - elapsed < 5e3) {
          effectiveTimeout = Math.min(elapsed + 1e4, timeout + 6e4);
        }
        await sleep(500);
        continue;
      }
      const element = document.querySelector(`[data-dyn-controlname="${controlName}"]`);
      let conditionMet = false;
      switch (condition) {
        case "visible":
          conditionMet = element && element.offsetParent !== null && getComputedStyle(element).visibility !== "hidden" && getComputedStyle(element).display !== "none";
          break;
        case "hidden":
          conditionMet = !element || element.offsetParent === null || getComputedStyle(element).visibility === "hidden" || getComputedStyle(element).display === "none";
          break;
        case "exists":
          conditionMet = element !== null;
          break;
        case "not-exists":
          conditionMet = element === null;
          break;
        case "enabled":
          if (element) {
            const input = element.querySelector("input, button, select, textarea") || element;
            conditionMet = !input.disabled && !input.hasAttribute("aria-disabled");
          }
          break;
        case "has-value":
          if (element) {
            const input = element.querySelector("input, textarea, select") || element;
            const currentValue = input.value || input.textContent || "";
            conditionMet = currentValue.trim() === String(expectedValue).trim();
          }
          break;
      }
      if (conditionMet) {
        await waitForTiming("ANIMATION_DELAY");
        return;
      }
      await waitForTiming("INPUT_SETTLE_DELAY");
    }
    throw new Error(`Timeout waiting for "${controlName}" to be ${condition} (waited ${timeout}ms)`);
  }
  async function setInputValue(controlName, value, fieldType, comboMethodOverride = "") {
    const element = findElementInActiveContext(controlName);
    if (!element)
      throw new Error(`Element not found: ${controlName}`);
    if (fieldType?.type === "segmented-lookup" || isSegmentedEntry(element)) {
      await setSegmentedEntryValue(element, value, comboMethodOverride);
      return;
    }
    if (fieldType?.inputType === "enum" || element.getAttribute("data-dyn-role") === "ComboBox") {
      await setComboBoxValue(element, value, comboMethodOverride);
      return;
    }
    const role = element.getAttribute("data-dyn-role");
    if (role === "RadioButton" || role === "FrameOptionButton" || element.querySelector('[role="radio"], input[type="radio"]')) {
      await setRadioButtonValue(element, value);
      return;
    }
    const input = element.querySelector("input, textarea, select");
    if (!input)
      throw new Error(`Input not found in: ${controlName}`);
    input.focus();
    await waitForTiming("MEDIUM_SETTLE_DELAY");
    if (input.tagName !== "SELECT") {
      await comboInputWithSelectedMethod2(input, value, comboMethodOverride);
    } else {
      setNativeValue(input, value);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await waitForTiming("POST_INPUT_DELAY");
  }
  async function setGridCellValue(controlName, value, fieldType, waitForValidation = false, comboMethodOverride = "") {
    await waitForActiveGridRow(controlName);
    let element = findGridCellElement(controlName);
    if (!element) {
      await activateGridRow(controlName);
      await waitForTiming("UI_UPDATE_DELAY");
      element = findGridCellElement(controlName);
    }
    if (!element) {
      throw new Error(`Grid cell element not found: ${controlName}`);
    }
    const reactCell = element.closest(".fixedDataTableCellLayout_main") || element;
    const isReactGrid = !!element.closest(".reactGrid");
    reactCell.click();
    await waitForTiming("UI_UPDATE_DELAY");
    if (isReactGrid) {
      await waitForTiming("ANIMATION_DELAY");
      element = findGridCellElement(controlName);
      if (!element) {
        throw new Error(`Grid cell element not found after click: ${controlName}`);
      }
    }
    let input = element.querySelector('input:not([type="hidden"]), textarea, select');
    if (!input && isReactGrid) {
      const cellContainer = element.closest(".fixedDataTableCellLayout_main");
      if (cellContainer) {
        input = cellContainer.querySelector('input:not([type="hidden"]), textarea, select');
      }
    }
    if (!input) {
      for (let attempt = 0; attempt < 5; attempt++) {
        await waitForTiming("ANIMATION_DELAY");
        input = element.querySelector('input:not([type="hidden"]), textarea, select');
        if (input && input.offsetParent !== null)
          break;
        const cellContainer = element.closest(".fixedDataTableCellLayout_main");
        if (cellContainer) {
          input = cellContainer.querySelector('input:not([type="hidden"]), textarea, select');
          if (input && input.offsetParent !== null)
            break;
        }
      }
    }
    if (!input && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT")) {
      input = element;
    }
    if (!input) {
      const row2 = element.closest('.fixedDataTableRowLayout_main, [data-dyn-role="Row"], [role="row"], tr');
      if (row2) {
        const possibleInputs = row2.querySelectorAll(`[data-dyn-controlname="${controlName}"] input:not([type="hidden"]), [data-dyn-controlname="${controlName}"] textarea`);
        for (const inp of possibleInputs) {
          if (inp.offsetParent !== null) {
            input = inp;
            break;
          }
        }
      }
    }
    if (!input && isReactGrid) {
      const activeCell = document.querySelector(".dyn-activeRowCell, .fixedDataTableCellLayout_main:focus-within");
      if (activeCell) {
        input = activeCell.querySelector('input:not([type="hidden"]), textarea, select');
      }
    }
    if (!input) {
      throw new Error(`Input not found in grid cell: ${controlName}. The cell may need to be clicked to become editable.`);
    }
    const role = element.getAttribute("data-dyn-role");
    if (fieldType?.type === "segmented-lookup" || role === "SegmentedEntry" || isSegmentedEntry(element)) {
      await setSegmentedEntryValue(element, value, comboMethodOverride);
      return;
    }
    if (fieldType?.inputType === "enum" || role === "ComboBox") {
      await setComboBoxValue(element, value, comboMethodOverride);
      return;
    }
    if (role === "Lookup" || role === "ReferenceGroup" || hasLookupButton(element)) {
      await setLookupSelectValue(controlName, value, comboMethodOverride);
      return;
    }
    input.focus();
    await waitForTiming("INPUT_SETTLE_DELAY");
    input.select?.();
    await waitForTiming("QUICK_RETRY_DELAY");
    await comboInputWithSelectedMethod2(input, value, comboMethodOverride);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForTiming("ANIMATION_DELAY");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    await waitForTiming("UI_UPDATE_DELAY");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", keyCode: 9, which: 9, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", code: "Tab", keyCode: 9, which: 9, bubbles: true }));
    await waitForTiming("ANIMATION_DELAY");
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true, relatedTarget: null }));
    await waitForTiming("ANIMATION_DELAY");
    const row = input.closest('.fixedDataTableRowLayout_main, [data-dyn-role="Row"]');
    if (row) {
      const otherCell = row.querySelector(".fixedDataTableCellLayout_main:not(:focus-within)");
      if (otherCell && otherCell !== input.closest(".fixedDataTableCellLayout_main")) {
        otherCell.click();
        await waitForTiming("ANIMATION_DELAY");
      }
    }
    await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
    if (waitForValidation) {
      await waitForD365Validation(controlName, 5e3);
    }
  }
  async function waitForD365Validation(controlName, timeout = 5e3) {
    const startTime = Date.now();
    let lastLoadingState = false;
    let seenLoading = false;
    while (Date.now() - startTime < timeout) {
      const isLoading = isD365Loading();
      if (isLoading && !lastLoadingState) {
        seenLoading = true;
      } else if (!isLoading && lastLoadingState && seenLoading) {
        await waitForTiming("UI_UPDATE_DELAY");
        return true;
      }
      lastLoadingState = isLoading;
      const cell = findGridCellElement(controlName);
      if (cell) {
        const cellText = cell.textContent || "";
        const hasMultipleValues = cellText.split(/\s{2,}|\n/).filter((t) => t.trim()).length > 1;
        if (hasMultipleValues) {
          await waitForTiming("ANIMATION_DELAY");
          return true;
        }
      }
      await waitForTiming("INPUT_SETTLE_DELAY");
    }
    if (seenLoading) {
      await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
    }
    return false;
  }
  async function waitForActiveGridRow(controlName, timeout = 2e3) {
    const start = Date.now();
    const pendingNew = window.__d365_pendingNewRow;
    const markerFresh = pendingNew && Date.now() - pendingNew.timestamp < 15e3;
    while (Date.now() - start < timeout) {
      if (markerFresh && pendingNew.rowElement) {
        const cell = pendingNew.rowElement.querySelector(
          `[data-dyn-controlname="${controlName}"]`
        );
        if (cell && cell.offsetParent !== null) {
          const isSelected = pendingNew.rowElement.getAttribute("aria-selected") === "true" || pendingNew.rowElement.getAttribute("data-dyn-selected") === "true" || pendingNew.rowElement.getAttribute("data-dyn-row-active") === "true" || pendingNew.rowElement.classList.contains("dyn-selectedRow");
          if (isSelected)
            return true;
        }
      }
      const selectedRows = document.querySelectorAll(
        '[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow'
      );
      for (const row of selectedRows) {
        if (markerFresh && pendingNew.rowElement && row !== pendingNew.rowElement) {
          continue;
        }
        const cell = row.querySelector(`[data-dyn-controlname="${controlName}"]`);
        if (cell && cell.offsetParent !== null)
          return true;
      }
      const reactGrids = document.querySelectorAll(".reactGrid");
      for (const grid of reactGrids) {
        const activeRow = grid.querySelector(
          '.fixedDataTableRowLayout_main[aria-selected="true"], .fixedDataTableRowLayout_main[data-dyn-row-active="true"]'
        );
        if (activeRow) {
          if (markerFresh && pendingNew.rowElement && activeRow !== pendingNew.rowElement) {
            continue;
          }
          const cell = activeRow.querySelector(`[data-dyn-controlname="${controlName}"]`);
          if (cell && cell.offsetParent !== null)
            return true;
        }
      }
      await waitForTiming("INPUT_SETTLE_DELAY");
    }
    if (markerFresh) {
      logStep(`waitForActiveGridRow: timed out waiting for pending new row to contain "${controlName}". Clearing marker.`);
      delete window.__d365_pendingNewRow;
    }
    return false;
  }
  async function activateGridRow(controlName) {
    const reactGrids = document.querySelectorAll(".reactGrid");
    for (const grid of reactGrids) {
      const bodyContainer = grid.querySelector(".fixedDataTableLayout_body, .fixedDataTableLayout_rowsContainer");
      if (bodyContainer) {
        const cell = bodyContainer.querySelector(`[data-dyn-controlname="${controlName}"]`);
        if (cell) {
          const row = cell.closest(".fixedDataTableRowLayout_main");
          if (row) {
            row.click();
            await waitForTiming("ANIMATION_DELAY");
            return true;
          }
        }
      }
    }
    const grids = document.querySelectorAll('[data-dyn-role="Grid"]');
    for (const grid of grids) {
      const cell = grid.querySelector(`[data-dyn-controlname="${controlName}"]`);
      if (cell) {
        const row = cell.closest('[data-dyn-role="Row"], [role="row"], tr');
        if (row) {
          row.click();
          await waitForTiming("ANIMATION_DELAY");
          return true;
        }
      }
    }
    return false;
  }
  async function setLookupSelectValue(controlName, value, comboMethodOverride = "") {
    const element = findElementInActiveContext(controlName);
    if (!element)
      throw new Error(`Element not found: ${controlName}`);
    const input = element.querySelector('input, [role="textbox"]');
    if (!input)
      throw new Error("Input not found in lookup field");
    const lookupButton = findLookupButton(element);
    if (lookupButton) {
      lookupButton.click();
      await waitForTiming("CLICK_ANIMATION_DELAY");
    } else {
      input.focus();
      await waitForTiming("INPUT_SETTLE_DELAY");
      await setValueWithVerify(input, value);
      await openLookupByKeyboard(input);
    }
    const lookupDock = await waitForLookupDockForElement(element);
    if (!lookupDock) {
      throw new Error("Lookup flyout not found");
    }
    const dockInput = findLookupFilterInput(lookupDock);
    if (dockInput) {
      dockInput.click();
      dockInput.focus();
      await waitForTiming("QUICK_RETRY_DELAY");
      await comboInputWithSelectedMethod2(dockInput, value, comboMethodOverride);
      dockInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      dockInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      await waitForTiming("SAVE_SETTLE_DELAY");
    }
    const rows = await waitForLookupRows(lookupDock, element);
    if (!rows.length) {
      throw new Error("Lookup list is empty");
    }
    const searchValue = String(value ?? "").toLowerCase();
    let matched = false;
    for (const row of rows) {
      const text = row.textContent.trim().replace(/\s+/g, " ").toLowerCase();
      const firstCell = row.querySelector('[role="gridcell"], td');
      const firstText = firstCell ? firstCell.textContent.trim().toLowerCase() : "";
      if (firstText === searchValue || text.includes(searchValue)) {
        const target = firstCell || row;
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        target.click();
        matched = true;
        await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
        target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
        await commitLookupValue(input);
        const applied = await waitForInputValue(input, value);
        if (!applied) {
          target.click();
          await waitForTiming("ANIMATION_DELAY");
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
          input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
          await commitLookupValue(input);
        }
        break;
      }
    }
    if (!matched) {
      throw new Error(`Lookup value not found: ${value}`);
    }
  }
  async function setCheckboxValue(controlName, value) {
    const element = findElementInActiveContext(controlName);
    if (!element)
      throw new Error(`Element not found: ${controlName}`);
    let checkbox = element.querySelector('input[type="checkbox"]');
    let isCustomToggle = false;
    if (!checkbox) {
      checkbox = element.querySelector('[role="checkbox"], [role="switch"]');
      if (checkbox) {
        isCustomToggle = true;
      }
    }
    if (!checkbox) {
      if (element.getAttribute("aria-checked") !== null || element.getAttribute("role") === "checkbox" || element.getAttribute("role") === "switch" || element.getAttribute("data-dyn-role") === "CheckBox") {
        checkbox = element;
        isCustomToggle = true;
      }
    }
    if (!checkbox) {
      checkbox = element.querySelector('button, [tabindex="0"]');
      if (checkbox) {
        isCustomToggle = true;
      }
    }
    if (!checkbox)
      throw new Error(`Checkbox not found in: ${controlName}. Element HTML: ${element.outerHTML.substring(0, 200)}`);
    const shouldCheck = coerceBoolean(value);
    let isCurrentlyChecked;
    if (isCustomToggle) {
      isCurrentlyChecked = checkbox.getAttribute("aria-checked") === "true" || checkbox.classList.contains("checked") || checkbox.classList.contains("on") || checkbox.getAttribute("data-checked") === "true";
    } else {
      isCurrentlyChecked = checkbox.checked;
    }
    if (shouldCheck !== isCurrentlyChecked) {
      checkbox.click();
      await waitForTiming("UI_UPDATE_DELAY");
      if (isCustomToggle) {
        checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        checkbox.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      }
    }
  }
  async function openLookupByKeyboard(input) {
    input.focus();
    await waitForTiming("QUICK_RETRY_DELAY");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", altKey: true, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", code: "ArrowDown", altKey: true, bubbles: true }));
    await waitForTiming("MEDIUM_SETTLE_DELAY");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "F4", code: "F4", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "F4", code: "F4", bubbles: true }));
    await waitForTiming("UI_UPDATE_DELAY");
  }
  async function commitLookupValue(input) {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", code: "Tab", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await waitForTiming("CLICK_ANIMATION_DELAY");
  }
  async function closeDialog(formName, action = "ok") {
    const form = document.querySelector(`[data-dyn-form-name="${formName}"]`);
    if (!form) {
      logStep(`Warning: Form ${formName} not found to close`);
      return;
    }
    let buttonName;
    if (formName === "SysRecurrence") {
      buttonName = action === "ok" ? "CommandButtonOk" : "CommandButtonCancel";
    } else if (formName === "SysQueryForm") {
      buttonName = action === "ok" ? "OkButton" : "CancelButton";
    } else if (formName === "SysOperationTemplateForm") {
      buttonName = action === "ok" ? "CommandButton" : "CommandButtonCancel";
    } else {
      buttonName = action === "ok" ? "CommandButton" : "CommandButtonCancel";
    }
    const button = form.querySelector(`[data-dyn-controlname="${buttonName}"]`);
    if (button) {
      button.click();
      await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
      logStep(`Dialog ${formName} closed with ${action.toUpperCase()}`);
    } else {
      logStep(`Warning: ${action.toUpperCase()} button not found in ${formName}`);
    }
  }
  function getCurrentRowValue(fieldMapping) {
    if (!fieldMapping)
      return "";
    const row = window.d365ExecutionControl?.currentDataRow || {};
    const direct = row[fieldMapping];
    if (direct !== void 0 && direct !== null) {
      return String(direct);
    }
    const fieldName = fieldMapping.includes(":") ? fieldMapping.split(":").pop() : fieldMapping;
    const value = row[fieldName];
    return value === void 0 || value === null ? "" : String(value);
  }
  async function resolveDynamicText(text) {
    if (typeof text !== "string" || !text)
      return text || "";
    let resolved = text;
    if (/__D365_PARAM_CLIPBOARD_[a-z0-9_]+__/i.test(resolved)) {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard API not available");
      }
      const clipboardText = await navigator.clipboard.readText();
      resolved = resolved.replace(/__D365_PARAM_CLIPBOARD_[a-z0-9_]+__/gi, clipboardText ?? "");
    }
    resolved = resolved.replace(/__D365_PARAM_DATA_([A-Za-z0-9%._~-]*)__/g, (_, encodedField) => {
      const field = decodeURIComponent(encodedField || "");
      return getCurrentRowValue(field);
    });
    return resolved;
  }
  async function navigateToForm(step) {
    const { navigateMethod, menuItemName, menuItemType, navigateUrl, hostRelativePath, waitForLoad, openInNewTab } = step;
    const resolvedMenuItemName = await resolveDynamicText(menuItemName || "");
    const resolvedNavigateUrl = await resolveDynamicText(navigateUrl || "");
    const resolvedHostRelativePath = await resolveDynamicText(hostRelativePath || "");
    logStep(`Navigating to form: ${resolvedMenuItemName || resolvedNavigateUrl}`);
    let targetUrl;
    const baseUrl = window.location.origin + window.location.pathname;
    if (navigateMethod === "url" && resolvedNavigateUrl) {
      targetUrl = resolvedNavigateUrl.startsWith("http") ? resolvedNavigateUrl : baseUrl + resolvedNavigateUrl;
    } else if (navigateMethod === "hostRelative" && resolvedHostRelativePath) {
      const relativePart = String(resolvedHostRelativePath).trim();
      const normalized = relativePart.startsWith("/") || relativePart.startsWith("?") ? relativePart : `/${relativePart}`;
      targetUrl = `${window.location.protocol}//${window.location.host}${normalized}`;
    } else if (resolvedMenuItemName) {
      const params = new URLSearchParams(window.location.search);
      params.delete("q");
      const typePrefix = menuItemType && menuItemType !== "Display" ? `${menuItemType}:` : "";
      const rawMenuItem = String(resolvedMenuItemName).trim();
      const separatorIndex = Math.min(
        ...["?", "&"].map((ch) => rawMenuItem.indexOf(ch)).filter((idx) => idx >= 0)
      );
      let menuItemBase = rawMenuItem;
      let extraQuery = "";
      if (Number.isFinite(separatorIndex)) {
        menuItemBase = rawMenuItem.slice(0, separatorIndex).trim();
        extraQuery = rawMenuItem.slice(separatorIndex + 1).trim();
      }
      params.set("mi", `${typePrefix}${menuItemBase}`);
      if (extraQuery) {
        const extras = new URLSearchParams(extraQuery);
        extras.forEach((value, key) => {
          if (key && key !== "mi") {
            params.set(key, value);
          }
        });
      }
      targetUrl = baseUrl + "?" + params.toString();
    } else {
      throw new Error("Navigate step requires either menuItemName or navigateUrl");
    }
    logStep(`Navigating to: ${targetUrl}`);
    if (openInNewTab) {
      window.open(targetUrl, "_blank", "noopener");
      logStep("Opened navigation target in a new tab");
      await waitForTiming("UI_UPDATE_DELAY");
      return;
    }
    try {
      const url = new URL(targetUrl);
      const targetMenuItemName = url.searchParams.get("mi") || "";
      const currentWorkflow = window.d365CurrentWorkflow || null;
      const originalWorkflow = currentWorkflow?._originalWorkflow || currentWorkflow || window.d365OriginalWorkflow || null;
      const pendingState = {
        workflow: originalWorkflow,
        workflowId: originalWorkflow?.id || "",
        nextStepIndex: (window.d365ExecutionControl?.currentStepIndex ?? 0) + 1,
        currentRowIndex: window.d365ExecutionControl?.currentRowIndex || 0,
        totalRows: window.d365ExecutionControl?.totalRows || 0,
        data: window.d365ExecutionControl?.currentDataRow || null,
        targetMenuItemName,
        waitForLoad: waitForLoad || 3e3,
        savedAt: Date.now()
      };
      sessionStorage.setItem("d365_pending_workflow", JSON.stringify(pendingState));
      logStep(`Saved workflow state for navigation (nextStepIndex: ${pendingState.nextStepIndex})`);
    } catch (e) {
      console.warn("[D365] Failed to save workflow state in sessionStorage:", e);
    }
    window.postMessage({
      type: "D365_WORKFLOW_NAVIGATING",
      targetUrl,
      waitForLoad: waitForLoad || 3e3
    }, "*");
    await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
    window.location.href = targetUrl;
    await sleep(waitForLoad || 3e3);
  }
  async function activateTab(controlName) {
    logStep(`Activating tab: ${controlName}`);
    let tabElement = findElementInActiveContext(controlName);
    if (!tabElement) {
      tabElement = document.querySelector(`[data-dyn-controlname="${controlName}_header"]`) || document.querySelector(`[data-dyn-controlname="${controlName}"] [role="tab"]`) || document.querySelector(`[aria-controls="${controlName}"]`) || document.querySelector(`a[href*="${controlName}"], button[data-target*="${controlName}"]`);
    }
    if (!tabElement) {
      throw new Error(`Tab element not found: ${controlName}`);
    }
    let clickTarget = tabElement.querySelector('.pivot-link, .tab-link, [role="tab"]');
    if (!clickTarget && (tabElement.tagName === "A" || tabElement.tagName === "BUTTON" || tabElement.getAttribute("role") === "tab")) {
      clickTarget = tabElement;
    }
    if (!clickTarget) {
      clickTarget = tabElement.querySelector("a, button") || tabElement;
    }
    if (!clickTarget || clickTarget === tabElement) {
      const headerName = controlName + "_header";
      const headerEl = document.querySelector(`[data-dyn-controlname="${headerName}"]`);
      if (headerEl) {
        clickTarget = headerEl.querySelector("a, button, .pivot-link") || headerEl;
      }
    }
    logStep(`Clicking tab element: ${clickTarget?.tagName || "unknown"}`);
    if (clickTarget.focus)
      clickTarget.focus();
    await waitForTiming("INPUT_SETTLE_DELAY");
    clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    clickTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    clickTarget.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await waitForTiming("UI_UPDATE_DELAY");
    if (typeof $dyn !== "undefined" && $dyn.controls) {
      try {
        const control = $dyn.controls[controlName];
        if (control) {
          if (typeof control.ActivateTab === "function") {
            control.ActivateTab(true);
            logStep(`Called ActivateTab on ${controlName}`);
          } else if (typeof control.activate === "function") {
            control.activate();
            logStep(`Called activate on ${controlName}`);
          } else if (typeof control.select === "function") {
            control.select();
            logStep(`Called select on ${controlName}`);
          }
        }
      } catch (e) {
        logStep(`D365 control method failed: ${e.message}`);
      }
    }
    await waitForTiming("CLICK_ANIMATION_DELAY");
    const tabContent = document.querySelector(`[data-dyn-controlname="${controlName}"]`);
    if (tabContent) {
      const isVisible = tabContent.offsetParent !== null;
      const isActive = tabContent.classList.contains("active") || tabContent.getAttribute("aria-selected") === "true" || tabContent.getAttribute("aria-hidden") !== "true";
      logStep(`Tab ${controlName} visibility check: visible=${isVisible}, active=${isActive}`);
    }
    logStep(`Tab ${controlName} activated`);
  }
  async function activateActionPaneTab(controlName) {
    logStep(`Activating action pane tab: ${controlName}`);
    let tabElement = findElementInActiveContext(controlName);
    if (!tabElement) {
      const selectors = [
        `[data-dyn-controlname="${controlName}"]`,
        `.appBarTab[data-dyn-controlname="${controlName}"]`,
        `.appBarTab [data-dyn-controlname="${controlName}"]`,
        `[role="tab"][data-dyn-controlname="${controlName}"]`
      ];
      for (const selector of selectors) {
        tabElement = document.querySelector(selector);
        if (tabElement)
          break;
      }
    }
    if (!tabElement) {
      throw new Error(`Action pane tab not found: ${controlName}`);
    }
    let clickTarget = tabElement;
    const header = tabElement.querySelector?.(".appBarTab-header, .appBarTabHeader, .appBarTab_header");
    if (header) {
      clickTarget = header;
    }
    const focusSelector = tabElement.getAttribute?.("data-dyn-focus");
    if (focusSelector) {
      const focusTarget = tabElement.querySelector(focusSelector);
      if (focusTarget) {
        clickTarget = focusTarget;
      }
    }
    if (tabElement.getAttribute?.("role") === "tab") {
      clickTarget = tabElement;
    }
    if (clickTarget === tabElement) {
      const buttonish = tabElement.querySelector?.('button, a, [role="tab"]');
      if (buttonish)
        clickTarget = buttonish;
    }
    if (clickTarget?.focus)
      clickTarget.focus();
    await waitForTiming("INPUT_SETTLE_DELAY");
    dispatchClickSequence(clickTarget);
    if (typeof $dyn !== "undefined" && $dyn.controls) {
      try {
        const control = $dyn.controls[controlName];
        if (control) {
          if (typeof control.activate === "function") {
            control.activate();
          } else if (typeof control.select === "function") {
            control.select();
          }
        }
      } catch (e) {
        logStep(`Action pane control method failed: ${e.message}`);
      }
    }
    await waitForTiming("SAVE_SETTLE_DELAY");
    logStep(`Action pane tab ${controlName} activated`);
  }
  async function expandOrCollapseSection(controlName, action) {
    logStep(`${action === "expand" ? "Expanding" : "Collapsing"} section: ${controlName}`);
    const section = findElementInActiveContext(controlName);
    if (!section) {
      throw new Error(`Section element not found: ${controlName}`);
    }
    let toggleButton = section.querySelector("button[aria-expanded]");
    if (!toggleButton) {
      toggleButton = section.querySelector('.section-page-caption, .section-header, .group-header, [data-dyn-role="SectionPageHeader"]');
    }
    if (!toggleButton) {
      toggleButton = section.querySelector("button");
    }
    if (!toggleButton && section.hasAttribute("aria-expanded")) {
      toggleButton = section;
    }
    let isExpanded = false;
    if (toggleButton && toggleButton.hasAttribute("aria-expanded")) {
      isExpanded = toggleButton.getAttribute("aria-expanded") === "true";
    } else if (section.hasAttribute("aria-expanded")) {
      isExpanded = section.getAttribute("aria-expanded") === "true";
    } else {
      isExpanded = section.classList.contains("expanded") || !section.classList.contains("collapsed");
    }
    logStep(`Section ${controlName} current state: ${isExpanded ? "expanded" : "collapsed"}`);
    const needsToggle = action === "expand" && !isExpanded || action === "collapse" && isExpanded;
    if (needsToggle) {
      const clickTarget = toggleButton || section;
      logStep(`Clicking toggle element: ${clickTarget.tagName}, class=${clickTarget.className}`);
      clickTarget.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      clickTarget.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      clickTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      clickTarget.click();
      await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
      if (typeof $dyn !== "undefined" && $dyn.controls) {
        try {
          const control = $dyn.controls[controlName];
          if (control) {
            if (typeof control.ExpandedChanged === "function") {
              control.ExpandedChanged(action === "collapse" ? 1 : 0);
              logStep(`Called ExpandedChanged(${action === "collapse" ? 1 : 0}) on ${controlName}`);
            } else if (typeof control.expand === "function" && action === "expand") {
              control.expand();
              logStep(`Called expand() on ${controlName}`);
            } else if (typeof control.collapse === "function" && action === "collapse") {
              control.collapse();
              logStep(`Called collapse() on ${controlName}`);
            } else if (typeof control.toggle === "function") {
              control.toggle();
              logStep(`Called toggle() on ${controlName}`);
            }
          }
        } catch (e) {
          logStep(`D365 control method failed: ${e.message}`);
        }
      }
      await waitForTiming("UI_UPDATE_DELAY");
    } else {
      logStep(`Section ${controlName} already ${action}ed, no toggle needed`);
    }
    logStep(`Section ${controlName} ${action}ed`);
  }
  async function configureQueryFilter(tableName, fieldName, criteriaValue, options = {}) {
    logStep(`Configuring query filter: ${tableName ? tableName + "." : ""}${fieldName} = ${criteriaValue}`);
    let queryForm = document.querySelector('[data-dyn-form-name="SysQueryForm"]');
    if (!queryForm) {
      const filterButton = document.querySelector('[data-dyn-controlname="QuerySelectButton"]') || document.querySelector('[data-dyn-form-name="SysOperationTemplateForm"] [data-dyn-controlname*="Query"]');
      if (filterButton) {
        filterButton.click();
        await waitForTiming("VALIDATION_WAIT");
        queryForm = document.querySelector('[data-dyn-form-name="SysQueryForm"]');
      }
    }
    if (!queryForm) {
      throw new Error("Query filter dialog (SysQueryForm) not found. Make sure the filter dialog is open.");
    }
    const findInQuery = (name) => queryForm.querySelector(`[data-dyn-controlname="${name}"]`);
    if (options.savedQuery) {
      const savedQueryBox = findInQuery("SavedQueriesBox");
      if (savedQueryBox) {
        const input = savedQueryBox.querySelector("input");
        if (input) {
          input.click();
          await waitForTiming("UI_UPDATE_DELAY");
          await setInputValueInForm(input, options.savedQuery, options.comboSelectMode || "");
          await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
        }
      }
    }
    const rangeTab = findInQuery("RangeTab") || findInQuery("RangeTab_header");
    if (rangeTab && !rangeTab.classList.contains("active") && rangeTab.getAttribute("aria-selected") !== "true") {
      rangeTab.click();
      await waitForTiming("UI_UPDATE_DELAY");
    }
    const addButton = findInQuery("RangeAdd");
    if (addButton) {
      addButton.click();
      await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
    }
    const grid = findInQuery("RangeGrid");
    if (!grid) {
      throw new Error("Range grid not found");
    }
    const rows = grid.querySelectorAll('[role="row"], tr, .list-row');
    const lastRow = rows[rows.length - 1] || grid;
    if (tableName) {
      const tableCell = lastRow.querySelector('[data-dyn-controlname="RangeTable"]') || grid.querySelectorAll('[data-dyn-controlname="RangeTable"]');
      const lastTableCell = tableCell.length ? tableCell[tableCell.length - 1] : tableCell;
      if (lastTableCell) {
        const input = lastTableCell.querySelector("input") || lastTableCell;
        await setInputValueInForm(input, tableName, options.comboSelectMode || "");
        await waitForTiming("UI_UPDATE_DELAY");
      }
    }
    if (fieldName) {
      const fieldCells = grid.querySelectorAll('[data-dyn-controlname="RangeField"]');
      const lastFieldCell = fieldCells[fieldCells.length - 1] || grid.querySelector('[data-dyn-controlname="RangeField"]');
      if (lastFieldCell) {
        const input = lastFieldCell.querySelector("input") || lastFieldCell;
        input.click?.();
        await waitForTiming("ANIMATION_DELAY");
        await setInputValueInForm(input, fieldName, options.comboSelectMode || "");
        await waitForTiming("UI_UPDATE_DELAY");
      }
    }
    if (criteriaValue) {
      const valueCells = grid.querySelectorAll('[data-dyn-controlname="RangeValue"]');
      const lastValueCell = valueCells[valueCells.length - 1] || grid.querySelector('[data-dyn-controlname="RangeValue"]');
      if (lastValueCell) {
        const input = lastValueCell.querySelector("input") || lastValueCell;
        input.click?.();
        await waitForTiming("ANIMATION_DELAY");
        await setInputValueInForm(input, criteriaValue, options.comboSelectMode || "");
        await waitForTiming("UI_UPDATE_DELAY");
      }
    }
    logStep("Query filter configured");
  }
  async function configureBatchProcessing(enabled, taskDescription, batchGroup, options = {}) {
    logStep(`Configuring batch processing: ${enabled ? "enabled" : "disabled"}`);
    await waitForTiming("UI_UPDATE_DELAY");
    const batchToggle = document.querySelector('[data-dyn-form-name="SysOperationTemplateForm"] [data-dyn-controlname="Fld1_1"]') || findElementInActiveContext("Fld1_1") || document.querySelector('[data-dyn-controlname="Fld1_1"]');
    if (batchToggle) {
      const checkbox = batchToggle.querySelector('input[type="checkbox"]') || batchToggle.querySelector('[role="checkbox"]') || batchToggle.querySelector(".toggle-button");
      const currentState = checkbox?.checked || batchToggle.classList.contains("on") || batchToggle.getAttribute("aria-checked") === "true";
      if (currentState !== enabled) {
        const clickTarget = checkbox || batchToggle.querySelector("button, .toggle-switch, label") || batchToggle;
        clickTarget.click();
        await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
      }
    } else {
      logStep("Warning: Batch processing toggle (Fld1_1) not found");
    }
    if (enabled && taskDescription) {
      await setInputValue("Fld2_1", taskDescription);
      await waitForTiming("ANIMATION_DELAY");
    }
    if (enabled && batchGroup) {
      await setInputValue("Fld3_1", batchGroup);
      await waitForTiming("ANIMATION_DELAY");
    }
    if (enabled && options.private !== void 0) {
      await setCheckbox("Fld4_1", options.private);
      await waitForTiming("ANIMATION_DELAY");
    }
    if (enabled && options.criticalJob !== void 0) {
      await setCheckbox("Fld5_1", options.criticalJob);
      await waitForTiming("ANIMATION_DELAY");
    }
    if (enabled && options.monitoringCategory) {
      await setComboBoxValue("Fld6_1", options.monitoringCategory);
      await waitForTiming("ANIMATION_DELAY");
    }
    logStep("Batch processing configured");
  }
  async function configureRecurrence(step) {
    const { patternUnit, patternCount, endDateOption, endAfterCount, endByDate, startDate, startTime, timezone } = step;
    const patternUnits = ["minutes", "hours", "days", "weeks", "months", "years"];
    logStep(`Configuring recurrence: every ${patternCount} ${patternUnits[patternUnit || 0]}`);
    let recurrenceForm = document.querySelector('[data-dyn-form-name="SysRecurrence"]');
    if (!recurrenceForm) {
      const recurrenceButton = document.querySelector('[data-dyn-form-name="SysOperationTemplateForm"] [data-dyn-controlname="MnuItm_1"]') || findElementInActiveContext("MnuItm_1");
      if (recurrenceButton) {
        recurrenceButton.click();
        await waitForTiming("VALIDATION_WAIT");
        recurrenceForm = document.querySelector('[data-dyn-form-name="SysRecurrence"]');
      }
    }
    if (!recurrenceForm) {
      logStep("Warning: Could not open SysRecurrence dialog");
      return;
    }
    const findInRecurrence = (name) => recurrenceForm.querySelector(`[data-dyn-controlname="${name}"]`);
    if (startDate) {
      const startDateInput = findInRecurrence("StartDate")?.querySelector("input") || findInRecurrence("StartDate");
      if (startDateInput) {
        await setInputValueInForm(startDateInput, startDate);
        await waitForTiming("UI_UPDATE_DELAY");
      }
    }
    if (startTime) {
      const startTimeInput = findInRecurrence("StartTime")?.querySelector("input") || findInRecurrence("StartTime");
      if (startTimeInput) {
        await setInputValueInForm(startTimeInput, startTime);
        await waitForTiming("UI_UPDATE_DELAY");
      }
    }
    if (timezone) {
      const timezoneControl = findInRecurrence("Timezone");
      if (timezoneControl) {
        const input = timezoneControl.querySelector("input");
        if (input) {
          input.click();
          await waitForTiming("ANIMATION_DELAY");
          await setInputValueInForm(input, timezone);
          await waitForTiming("UI_UPDATE_DELAY");
        }
      }
    }
    if (patternUnit !== void 0) {
      const patternUnitControl = findInRecurrence("PatternUnit");
      if (patternUnitControl) {
        const radioInputs = patternUnitControl.querySelectorAll('input[type="radio"]');
        if (radioInputs.length > patternUnit) {
          radioInputs[patternUnit].click();
          await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
        } else {
          const radioOptions = patternUnitControl.querySelectorAll('[role="radio"], label, button');
          if (radioOptions.length > patternUnit) {
            radioOptions[patternUnit].click();
            await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
          }
        }
      }
    }
    if (patternCount) {
      const countControlNames = ["MinuteInt", "HourInt", "DayInt", "WeekInt", "MonthInt", "YearInt"];
      const countControlName = countControlNames[patternUnit || 0];
      const countControl = findInRecurrence(countControlName);
      if (countControl) {
        const input = countControl.querySelector("input") || countControl;
        await setInputValueInForm(input, patternCount.toString());
        await waitForTiming("UI_UPDATE_DELAY");
      }
    }
    if (endDateOption === "noEndDate") {
      const noEndDateGroup = findInRecurrence("EndDate1");
      if (noEndDateGroup) {
        const radio = noEndDateGroup.querySelector('input[type="radio"], [role="radio"]') || noEndDateGroup;
        radio.click();
        await waitForTiming("UI_UPDATE_DELAY");
      }
    } else if (endDateOption === "endAfter" && endAfterCount) {
      const endAfterGroup = findInRecurrence("EndDate2");
      if (endAfterGroup) {
        const radio = endAfterGroup.querySelector('input[type="radio"], [role="radio"]') || endAfterGroup;
        radio.click();
        await waitForTiming("UI_UPDATE_DELAY");
      }
      const countControl = findInRecurrence("EndDateInt");
      if (countControl) {
        const input = countControl.querySelector("input") || countControl;
        await setInputValueInForm(input, endAfterCount.toString());
        await waitForTiming("UI_UPDATE_DELAY");
      }
    } else if (endDateOption === "endBy" && endByDate) {
      const endByGroup = findInRecurrence("EndDate3");
      if (endByGroup) {
        const radio = endByGroup.querySelector('input[type="radio"], [role="radio"]') || endByGroup;
        radio.click();
        await waitForTiming("UI_UPDATE_DELAY");
      }
      const dateControl = findInRecurrence("EndDateDate");
      if (dateControl) {
        const input = dateControl.querySelector("input") || dateControl;
        await setInputValueInForm(input, endByDate);
        await waitForTiming("UI_UPDATE_DELAY");
      }
    }
    logStep("Recurrence configured");
  }
  async function setInputValueInForm(inputElement, value, comboMethodOverride = "") {
    if (!inputElement)
      return;
    inputElement.focus();
    await waitForTiming("INPUT_SETTLE_DELAY");
    inputElement.select?.();
    if (comboMethodOverride && inputElement.tagName !== "SELECT") {
      await comboInputWithSelectedMethod2(inputElement, value, comboMethodOverride);
    } else {
      inputElement.value = value;
    }
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));
    inputElement.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  async function setFilterMethod(filterContainer, method) {
    const operatorPatterns = [
      '[data-dyn-controlname*="FilterOperator"]',
      '[data-dyn-controlname*="_Operator"]',
      ".filter-operator",
      '[data-dyn-role="ComboBox"]'
    ];
    let operatorDropdown = null;
    const searchContainer = filterContainer?.parentElement || document;
    for (const pattern of operatorPatterns) {
      operatorDropdown = searchContainer.querySelector(pattern);
      if (operatorDropdown && operatorDropdown.offsetParent !== null)
        break;
    }
    if (!operatorDropdown) {
      return;
    }
    const dropdownButton = operatorDropdown.querySelector('button, [role="combobox"], .dyn-comboBox-button') || operatorDropdown;
    dropdownButton.click();
    await waitForTiming("UI_UPDATE_DELAY");
    const searchTerms = getFilterMethodSearchTerms(method);
    const options = document.querySelectorAll('[role="option"], [role="listitem"], .dyn-listView-item');
    for (const opt of options) {
      const text = opt.textContent.toLowerCase();
      if (textIncludesAny(text, searchTerms)) {
        opt.click();
        await waitForTiming("ANIMATION_DELAY");
        return;
      }
    }
    const selectEl = operatorDropdown.querySelector("select");
    if (selectEl) {
      for (const opt of selectEl.options) {
        const text = opt.textContent.toLowerCase();
        if (textIncludesAny(text, searchTerms)) {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          await waitForTiming("ANIMATION_DELAY");
          return;
        }
      }
    }
  }
  async function setRadioButtonValue(element, value) {
    logStep(`Setting radio button value: ${value}`);
    const radioInputs = element.querySelectorAll('input[type="radio"]');
    const radioRoles = element.querySelectorAll('[role="radio"]');
    const options = radioInputs.length > 0 ? Array.from(radioInputs) : Array.from(radioRoles);
    if (options.length === 0) {
      const labelButtons = element.querySelectorAll('label, button, [data-dyn-role="RadioButton"]');
      options.push(...Array.from(labelButtons));
    }
    if (options.length === 0) {
      throw new Error(`No radio options found in element`);
    }
    logStep(`Found ${options.length} radio options`);
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0 && numValue < options.length) {
      const targetOption = options[numValue];
      logStep(`Clicking radio option at index ${numValue}`);
      const clickTarget = targetOption.tagName === "INPUT" ? targetOption.closest("label") || targetOption.parentElement?.querySelector("label") || targetOption : targetOption;
      clickTarget.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      clickTarget.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      clickTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      clickTarget.click();
      if (targetOption.tagName === "INPUT") {
        targetOption.checked = true;
        targetOption.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
      return;
    }
    const searchValue = String(value).toLowerCase();
    for (const option of options) {
      const label = option.closest("label") || option.parentElement?.querySelector("label");
      const text = label?.textContent?.trim().toLowerCase() || option.getAttribute("aria-label")?.toLowerCase() || option.textContent?.trim().toLowerCase() || "";
      if (text.includes(searchValue) || searchValue.includes(text)) {
        logStep(`Clicking radio option with text: ${text}`);
        const clickTarget = label || option;
        clickTarget.click();
        if (option.tagName === "INPUT") {
          option.checked = true;
          option.dispatchEvent(new Event("change", { bubbles: true }));
        }
        await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
        return;
      }
    }
    throw new Error(`Radio option not found for value: ${value}`);
  }
  async function setSegmentedEntryValue(element, value, comboMethodOverride = "") {
    const input = element.querySelector('input, [role="textbox"]');
    if (!input)
      throw new Error("Input not found in SegmentedEntry");
    const lookupButton = findLookupButton(element);
    if (!lookupButton) {
      await setValueWithVerify(input, value);
      await openLookupByKeyboard(input);
    }
    if (lookupButton) {
      lookupButton.click();
      await waitForTiming("CLICK_ANIMATION_DELAY");
    }
    const lookupPopup = await waitForLookupPopup();
    if (!lookupPopup) {
      if (!window.d365CurrentWorkflowSettings?.suppressLookupWarnings) {
        console.warn("Lookup popup not found, trying direct input");
      }
      await setValueWithVerify(input, value);
      await commitLookupValue(input);
      return;
    }
    const dock = await waitForLookupDockForElement(element, 1500);
    if (dock) {
      const dockInput = findLookupFilterInput(dock);
      if (dockInput) {
        dockInput.click?.();
        dockInput.focus();
        await waitForTiming("QUICK_RETRY_DELAY");
        await comboInputWithSelectedMethod2(dockInput, value, comboMethodOverride);
        dockInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        dockInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
        await waitForTiming("CLICK_ANIMATION_DELAY");
      }
    }
    const lookupInput = lookupPopup.querySelector('input[type="text"], input[role="textbox"]');
    if (lookupInput) {
      lookupInput.click?.();
      lookupInput.focus();
      await waitForTiming("QUICK_RETRY_DELAY");
      await comboInputWithSelectedMethod2(lookupInput, value, comboMethodOverride);
      lookupInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      lookupInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      await waitForTiming("VALIDATION_WAIT");
    } else {
      await setValueWithVerify(input, value);
    }
    const rows = await waitForLookupRows(lookupPopup, element, 5e3);
    let foundMatch = false;
    for (const row of rows) {
      const text = row.textContent.trim().replace(/\s+/g, " ");
      if (text.toLowerCase().includes(String(value).toLowerCase())) {
        const cell = row.querySelector('[role="gridcell"], td');
        (cell || row).click();
        foundMatch = true;
        await waitForTiming("DEFAULT_WAIT_STEP_DELAY");
        await commitLookupValue(input);
        break;
      }
    }
    if (!foundMatch) {
      const sample = Array.from(rows).slice(0, 8).map((r) => r.textContent.trim().replace(/\s+/g, " "));
      if (!window.d365CurrentWorkflowSettings?.suppressLookupWarnings) {
        console.warn("No matching lookup value found, closing popup", { value, sample });
      }
      const closeBtn = lookupPopup.querySelector('[data-dyn-controlname="Close"], .close-button');
      if (closeBtn)
        closeBtn.click();
      await waitForTiming("UI_UPDATE_DELAY");
      await setValueWithVerify(input, value);
      await commitLookupValue(input);
    }
  }
  async function setComboBoxValue(element, value, comboMethodOverride = "") {
    const input = element.querySelector('input, [role="textbox"], select');
    if (!input)
      throw new Error("Input not found in ComboBox");
    if (input.tagName === "SELECT") {
      const options2 = Array.from(input.options);
      const target = options2.find((opt) => opt.text.trim().toLowerCase() === String(value).toLowerCase()) || options2.find((opt) => opt.text.toLowerCase().includes(String(value).toLowerCase()));
      if (!target)
        throw new Error(`Option not found: ${value}`);
      input.value = target.value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
      await waitForTiming("UI_UPDATE_DELAY");
      return;
    }
    const comboButton = findComboBoxButton(element);
    if (comboButton) {
      comboButton.click();
    } else {
      input.click?.();
    }
    input.focus();
    await waitForTiming("ANIMATION_DELAY");
    if (!input.readOnly && !input.disabled) {
      await comboInputWithSelectedMethod2(input, value, comboMethodOverride);
    }
    const listbox = await waitForListboxForInput(input, element);
    if (!listbox) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      await waitForTiming("UI_UPDATE_DELAY");
      return;
    }
    const options = collectComboOptions(listbox);
    const search = normalizeText(value);
    let matched = false;
    for (const option of options) {
      const text = normalizeText(option.textContent);
      if (text === search || text.includes(search)) {
        options.forEach((opt) => opt.setAttribute("aria-selected", "false"));
        option.setAttribute("aria-selected", "true");
        if (!option.id) {
          option.id = `d365opt_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
        }
        input.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
        const optionText = option.textContent.trim();
        dispatchClickSequence(option);
        const applied = await waitForInputValue(input, optionText, 800);
        if (!applied) {
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
          input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
          input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
        }
        await waitForTiming("POST_INPUT_DELAY");
        if (normalizeText(input.value) !== normalizeText(optionText)) {
          commitComboValue(input, optionText, element);
        } else {
          commitComboValue(input, input.value, element);
        }
        matched = true;
        await waitForTiming("UI_UPDATE_DELAY");
        break;
      }
    }
    if (!matched) {
      throw new Error(`Option not found: ${value}`);
    }
  }
  async function setCheckbox(controlName, checked) {
    const container = findElementInActiveContext(controlName) || document.querySelector(`[data-dyn-controlname="${controlName}"]`);
    if (!container) {
      logStep(`Warning: Checkbox ${controlName} not found`);
      return;
    }
    const checkbox = container.querySelector('input[type="checkbox"]') || container.querySelector('[role="checkbox"]');
    const currentState = checkbox?.checked || container.getAttribute("aria-checked") === "true" || container.classList.contains("on");
    if (currentState !== checked) {
      const clickTarget = checkbox || container.querySelector("label, button") || container;
      clickTarget.click();
    }
  }

  // src/injected/index.js
  function startInjected({ windowObj = globalThis.window, documentObj = globalThis.document, inspectorFactory = () => new D365Inspector() } = {}) {
    if (!windowObj || !documentObj) {
      return { started: false, reason: "missing-window-or-document" };
    }
    const window2 = windowObj;
    const document2 = documentObj;
    const navigator2 = windowObj.navigator || globalThis.navigator;
    window2.D365Inspector = D365Inspector;
    if (window2.d365InjectedScriptLoaded) {
      console.log("D365 injected script already loaded, skipping...");
      return { started: false, reason: "already-loaded" };
    }
    window2.d365InjectedScriptLoaded = true;
    const inspector = inspectorFactory();
    let currentWorkflowSettings = {};
    window2.d365CurrentWorkflowSettings = currentWorkflowSettings;
    const getTimings2 = () => getWorkflowTimings(currentWorkflowSettings);
    const waitForTiming2 = async (key) => {
      await sleep(getTimings2()[key]);
    };
    let currentWorkflow = null;
    let executionControl = {
      isPaused: false,
      isStopped: false,
      currentStepIndex: 0,
      currentRowIndex: 0,
      totalRows: 0,
      processedRows: 0,
      currentDataRow: null,
      pendingFlowSignal: "none",
      pendingInterruptionDecision: null,
      runOptions: {
        skipRows: 0,
        limitRows: 0,
        dryRun: false,
        learningMode: false,
        runUntilInterception: false
      }
    };
    window2.addEventListener("message", (event) => {
      if (event.source !== window2)
        return;
      if (event.data.type === "D365_DISCOVER_ELEMENTS") {
        const activeFormOnly = event.data.activeFormOnly || false;
        const elements = inspector.discoverElements(activeFormOnly);
        const activeForm = inspector.getActiveFormName();
        window2.postMessage({
          type: "D365_ELEMENTS_DISCOVERED",
          elements: elements.map((el) => ({
            ...el,
            element: void 0
            // Remove DOM reference for serialization
          })),
          activeForm
        }, "*");
      }
      if (event.data.type === "D365_START_PICKER") {
        inspector.startElementPicker((element) => {
          const formName = inspector.getElementFormName(document2.querySelector(`[data-dyn-controlname="${element.controlName}"]`));
          window2.postMessage({
            type: "D365_ELEMENT_PICKED",
            element: { ...element, formName }
          }, "*");
        });
      }
      if (event.data.type === "D365_STOP_PICKER") {
        inspector.stopElementPicker();
      }
      if (event.data.type === "D365_ADMIN_INSPECT") {
        const inspectionType = event.data.inspectionType;
        const formName = event.data.formName;
        let result;
        try {
          const data = runAdminInspection(inspector, inspectionType, formName, document2, window2);
          result = { success: true, inspectionType, data };
        } catch (e) {
          result = { success: false, inspectionType, error: e.message };
        }
        window2.postMessage({ type: "D365_ADMIN_INSPECTION_RESULT", result }, "*");
      }
      if (event.data.type === "D365_EXECUTE_WORKFLOW") {
        executeWorkflow(event.data.workflow, event.data.data);
      }
      if (event.data.type === "D365_NAV_BUTTONS_UPDATE") {
        updateNavButtons(event.data.payload);
      }
      if (event.data.type === "D365_PAUSE_WORKFLOW") {
        executionControl.isPaused = true;
      }
      if (event.data.type === "D365_RESUME_WORKFLOW") {
        executionControl.isPaused = false;
      }
      if (event.data.type === "D365_STOP_WORKFLOW") {
        executionControl.isStopped = true;
        executionControl.isPaused = false;
      }
      if (event.data.type === "D365_APPLY_INTERRUPTION_DECISION") {
        executionControl.pendingInterruptionDecision = event.data.payload || null;
        executionControl.isPaused = false;
      }
    });
    let pendingNavButtonsPayload = null;
    let navButtonsRetryTimer = null;
    let navButtonsOutsideClickHandler = null;
    function updateNavButtons(payload) {
      pendingNavButtonsPayload = payload || null;
      renderNavButtons();
    }
    function renderNavButtons() {
      const payload = pendingNavButtonsPayload;
      if (!payload)
        return;
      const navGroup = document2.getElementById("navigationMainActionGroup");
      if (!navGroup) {
        if (!navButtonsRetryTimer) {
          navButtonsRetryTimer = setTimeout(() => {
            navButtonsRetryTimer = null;
            renderNavButtons();
          }, 1e3);
        }
        return;
      }
      const existingContainer = document2.getElementById("d365-nav-buttons-container");
      if (existingContainer) {
        existingContainer.remove();
      }
      const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
      if (!buttons.length)
        return;
      const currentMenuItem = (payload.menuItem || "").toLowerCase();
      const visibleButtons = buttons.filter((button) => {
        const menuItems = Array.isArray(button.menuItems) ? button.menuItems : [];
        if (!menuItems.length)
          return true;
        if (!currentMenuItem)
          return false;
        return menuItems.some((item) => (item || "").toLowerCase() === currentMenuItem);
      });
      if (!visibleButtons.length)
        return;
      const container = document2.createElement("div");
      container.id = "d365-nav-buttons-container";
      container.style.display = "flex";
      container.style.gap = "6px";
      container.style.alignItems = "center";
      container.style.marginRight = "6px";
      const runButtonWorkflow = async (buttonConfig) => {
        const workflow = buttonConfig.workflow;
        if (!workflow) {
          sendLog("error", `Workflow not found for nav button: ${buttonConfig.name || buttonConfig.id}`);
          return;
        }
        const data = workflow.dataSources?.primary?.data || workflow.dataSource?.data || [];
        executeWorkflow(workflow, data);
      };
      const createStyledButton = (label, title = "") => {
        const buttonEl = document2.createElement("button");
        buttonEl.type = "button";
        buttonEl.className = "navigationBar-search";
        buttonEl.textContent = label;
        buttonEl.title = title;
        buttonEl.style.height = "24px";
        buttonEl.style.padding = "0 8px";
        buttonEl.style.borderRadius = "4px";
        buttonEl.style.border = "1px solid rgba(255,255,255,0.35)";
        buttonEl.style.background = "rgba(255,255,255,0.12)";
        buttonEl.style.color = "#ffffff";
        buttonEl.style.fontSize = "12px";
        buttonEl.style.fontWeight = "600";
        buttonEl.style.lineHeight = "22px";
        buttonEl.style.cursor = "pointer";
        buttonEl.style.whiteSpace = "nowrap";
        buttonEl.style.display = "inline-flex";
        buttonEl.style.alignItems = "center";
        buttonEl.style.justifyContent = "center";
        buttonEl.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.08)";
        return buttonEl;
      };
      const closeAllGroupMenus = () => {
        container.querySelectorAll("[data-d365-nav-group-menu]").forEach((menu) => {
          menu.style.display = "none";
        });
      };
      const standaloneButtons = [];
      const groupedButtons = /* @__PURE__ */ new Map();
      visibleButtons.forEach((buttonConfig) => {
        const groupName = (buttonConfig.group || "").trim();
        if (!groupName) {
          standaloneButtons.push(buttonConfig);
          return;
        }
        if (!groupedButtons.has(groupName)) {
          groupedButtons.set(groupName, []);
        }
        groupedButtons.get(groupName).push(buttonConfig);
      });
      standaloneButtons.forEach((buttonConfig) => {
        const buttonWrapper = document2.createElement("div");
        buttonWrapper.className = "navigationBar-company navigationBar-pinnedElement";
        const buttonEl = createStyledButton(buttonConfig.name || buttonConfig.workflowName || "Workflow", buttonConfig.name || "");
        buttonEl.setAttribute("data-d365-nav-button-id", buttonConfig.id || "");
        buttonEl.addEventListener("click", () => runButtonWorkflow(buttonConfig));
        buttonWrapper.appendChild(buttonEl);
        container.appendChild(buttonWrapper);
      });
      Array.from(groupedButtons.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([groupName, groupItems]) => {
        const groupWrapper = document2.createElement("div");
        groupWrapper.className = "navigationBar-company navigationBar-pinnedElement";
        groupWrapper.style.position = "relative";
        const groupButton = createStyledButton(`${groupName} \u25BE`, groupName);
        groupButton.setAttribute("data-d365-nav-group", groupName);
        groupButton.style.borderColor = "rgba(255,255,255,0.55)";
        groupButton.style.background = "rgba(255,255,255,0.2)";
        const groupMenu = document2.createElement("div");
        groupMenu.setAttribute("data-d365-nav-group-menu", groupName);
        groupMenu.style.position = "absolute";
        groupMenu.style.top = "28px";
        groupMenu.style.left = "0";
        groupMenu.style.minWidth = "230px";
        groupMenu.style.maxWidth = "320px";
        groupMenu.style.maxHeight = "320px";
        groupMenu.style.overflowY = "auto";
        groupMenu.style.background = "#fcfdff";
        groupMenu.style.border = "1px solid rgba(30,41,59,0.16)";
        groupMenu.style.borderRadius = "10px";
        groupMenu.style.boxShadow = "0 14px 28px rgba(0,0,0,0.28)";
        groupMenu.style.padding = "8px";
        groupMenu.style.display = "none";
        groupMenu.style.zIndex = "2147483000";
        const groupHeader = document2.createElement("div");
        groupHeader.textContent = groupName;
        groupHeader.style.fontSize = "11px";
        groupHeader.style.fontWeight = "700";
        groupHeader.style.color = "#475569";
        groupHeader.style.margin = "0 2px 6px 2px";
        groupHeader.style.paddingBottom = "6px";
        groupHeader.style.borderBottom = "1px solid #e2e8f0";
        groupMenu.appendChild(groupHeader);
        groupItems.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "")).forEach((buttonConfig) => {
          const itemButton = document2.createElement("button");
          itemButton.type = "button";
          itemButton.textContent = buttonConfig.name || buttonConfig.workflowName || "Workflow";
          itemButton.title = buttonConfig.name || "";
          itemButton.style.display = "block";
          itemButton.style.width = "100%";
          itemButton.style.textAlign = "left";
          itemButton.style.border = "none";
          itemButton.style.background = "transparent";
          itemButton.style.color = "#1f2937";
          itemButton.style.borderRadius = "4px";
          itemButton.style.padding = "8px 9px";
          itemButton.style.fontSize = "12px";
          itemButton.style.fontWeight = "600";
          itemButton.style.lineHeight = "1.3";
          itemButton.style.marginBottom = "3px";
          itemButton.style.cursor = "pointer";
          itemButton.style.transition = "background .15s ease, color .15s ease";
          itemButton.addEventListener("mouseenter", () => {
            itemButton.style.background = "#e8edff";
            itemButton.style.color = "#1e3a8a";
          });
          itemButton.addEventListener("mouseleave", () => {
            itemButton.style.background = "transparent";
            itemButton.style.color = "#1f2937";
          });
          itemButton.addEventListener("click", (event) => {
            event.stopPropagation();
            closeAllGroupMenus();
            runButtonWorkflow(buttonConfig);
          });
          groupMenu.appendChild(itemButton);
        });
        groupButton.addEventListener("click", (event) => {
          event.stopPropagation();
          const isOpen = groupMenu.style.display === "block";
          closeAllGroupMenus();
          groupMenu.style.display = isOpen ? "none" : "block";
          groupButton.style.background = isOpen ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.32)";
        });
        groupWrapper.appendChild(groupButton);
        groupWrapper.appendChild(groupMenu);
        container.appendChild(groupWrapper);
      });
      navGroup.insertBefore(container, navGroup.firstChild);
      if (navButtonsOutsideClickHandler) {
        document2.removeEventListener("click", navButtonsOutsideClickHandler, true);
      }
      navButtonsOutsideClickHandler = (event) => {
        const active = document2.getElementById("d365-nav-buttons-container");
        if (!active || active.contains(event.target))
          return;
        active.querySelectorAll("[data-d365-nav-group-menu]").forEach((menu) => {
          menu.style.display = "none";
        });
      };
      document2.addEventListener("click", navButtonsOutsideClickHandler, true);
    }
    const unhandledUnexpectedEventKeys = /* @__PURE__ */ new Set();
    const acknowledgedMessageBarKeys = /* @__PURE__ */ new Set();
    async function checkExecutionControl() {
      if (executionControl.isStopped) {
        throw createUserStopError();
      }
      while (executionControl.isPaused) {
        await waitForTiming2("ANIMATION_DELAY");
        if (executionControl.isStopped) {
          throw createUserStopError();
        }
      }
    }
    function getTemplateText(text) {
      return normalizeText(text || "").replace(/\b[\d,.]+\b/g, "#").trim();
    }
    function createUserStopError(message = "Workflow stopped by user") {
      const err = new Error(message);
      err.isUserStop = true;
      err.noRetry = true;
      return err;
    }
    function isMessageBarCloseVisible() {
      const closeBtn = document2.querySelector('[data-dyn-controlname="MessageBarClose"]');
      return closeBtn && isElementVisible(closeBtn);
    }
    function shortenForLog(text, max = 220) {
      const normalized = normalizeText(text || "");
      if (normalized.length <= max)
        return normalized;
      return `${normalized.slice(0, max)}...`;
    }
    function consumePendingFlowSignal() {
      const signal = executionControl.pendingFlowSignal || "none";
      executionControl.pendingFlowSignal = "none";
      return signal;
    }
    function startInterruptionActionRecorder() {
      const captured = [];
      const clickHandler = (evt) => {
        const target = evt.target instanceof Element ? evt.target : null;
        if (!target)
          return;
        const button = target.closest('button, [role="button"], [data-dyn-role="CommandButton"]');
        if (!button || !isElementVisible(button))
          return;
        const controlName = button.getAttribute("data-dyn-controlname") || "";
        const text = normalizeText(button.textContent || button.getAttribute("aria-label") || "");
        if (!controlName && !text)
          return;
        captured.push({
          type: "clickButton",
          controlName,
          text
        });
      };
      document2.addEventListener("click", clickHandler, true);
      return {
        stop() {
          document2.removeEventListener("click", clickHandler, true);
          return captured.slice();
        }
      };
    }
    function collectDialogButtons(dialogEl) {
      const selectors = 'button, [role="button"], [data-dyn-role="CommandButton"]';
      const buttons = [];
      const seen = /* @__PURE__ */ new Set();
      dialogEl.querySelectorAll(selectors).forEach((buttonEl) => {
        if (!isElementVisible(buttonEl))
          return;
        const controlName = buttonEl.getAttribute("data-dyn-controlname") || "";
        const text = normalizeText(buttonEl.textContent || buttonEl.getAttribute("aria-label") || "");
        const key = `${controlName.toLowerCase()}|${text}`;
        if (!controlName && !text)
          return;
        if (seen.has(key))
          return;
        seen.add(key);
        buttons.push({ controlName, text, element: buttonEl });
      });
      return buttons;
    }
    function isLikelyModalDialog(dialogEl, text, buttons) {
      const textLength = normalizeText(text || "").length;
      if (!buttons.length)
        return false;
      if (textLength > 450)
        return false;
      const formInputs = dialogEl.querySelectorAll("input, select, textarea");
      if (formInputs.length > 8)
        return false;
      const hasStaticText = !!dialogEl.querySelector('[data-dyn-controlname="FormStaticTextControl1"]');
      const hasLightboxClass = dialogEl.classList?.contains("rootContent-lightBox");
      const hasButtonGroup = !!dialogEl.querySelector('[data-dyn-controlname="ButtonGroup"]');
      return hasStaticText || hasLightboxClass || hasButtonGroup;
    }
    function detectUnexpectedEvents() {
      const events = [];
      const seenEventKeys = /* @__PURE__ */ new Set();
      const dialogSelectors = '[role="dialog"], [data-dyn-role="Dialog"], .dialog-container';
      document2.querySelectorAll(dialogSelectors).forEach((dialogEl) => {
        if (!isElementVisible(dialogEl))
          return;
        const textEl = dialogEl.querySelector('[data-dyn-controlname="FormStaticTextControl1"]') || dialogEl.querySelector("h1, h2, h3") || dialogEl.querySelector('[class*="message"]');
        const text = normalizeText(textEl?.textContent || dialogEl.textContent || "");
        const buttons = collectDialogButtons(dialogEl);
        if (!isLikelyModalDialog(dialogEl, text, buttons))
          return;
        const templateText = getTemplateText(text);
        const key = `dialog|${templateText}`;
        if (!templateText || seenEventKeys.has(key))
          return;
        seenEventKeys.add(key);
        events.push({
          kind: "dialog",
          text,
          templateText,
          buttons,
          element: dialogEl
        });
      });
      document2.querySelectorAll(".messageBar-messageEntry").forEach((entryEl) => {
        if (!isElementVisible(entryEl))
          return;
        const messageEl = entryEl.querySelector(".messageBar-message") || entryEl;
        const text = normalizeText(messageEl.textContent || "");
        const templateText = getTemplateText(text);
        const key = `messageBar|${templateText}`;
        if (!templateText || seenEventKeys.has(key))
          return;
        seenEventKeys.add(key);
        if (acknowledgedMessageBarKeys.has(key))
          return;
        const controls = [];
        const controlKeys = /* @__PURE__ */ new Set();
        const pushControl = (control) => {
          const key2 = `${normalizeText(control?.controlName || "")}|${normalizeText(control?.text || "")}`;
          if (!key2 || controlKeys.has(key2))
            return;
          controlKeys.add(key2);
          controls.push(control);
        };
        const closeButton = entryEl.querySelector('[data-dyn-controlname="MessageBarClose"]') || Array.from(document2.querySelectorAll('[data-dyn-controlname="MessageBarClose"]')).find(isElementVisible) || null;
        const toggleButton = entryEl.querySelector('[data-dyn-controlname="MessageBarToggle"]') || Array.from(document2.querySelectorAll('[data-dyn-controlname="MessageBarToggle"]')).find(isElementVisible) || null;
        if (closeButton && isElementVisible(closeButton)) {
          pushControl({ controlName: "MessageBarClose", text: normalizeText(closeButton.textContent || ""), element: closeButton, visible: true });
        }
        if (toggleButton && isElementVisible(toggleButton)) {
          pushControl({ controlName: "MessageBarToggle", text: normalizeText(toggleButton.textContent || ""), element: toggleButton, visible: true });
        }
        const contextRoot = entryEl.closest('[data-dyn-form-name], [role="dialog"], .rootContent, .rootContent-lightBox') || document2;
        const buttonSelectors = '[data-dyn-role="CommandButton"], button, [role="button"]';
        contextRoot.querySelectorAll(buttonSelectors).forEach((btn) => {
          const controlName = btn.getAttribute("data-dyn-controlname") || "";
          const textValue = normalizeText(btn.textContent || btn.getAttribute("aria-label") || "");
          const token = normalizeText(controlName || textValue);
          const isPrimaryAction = ["ok", "cancel", "yes", "no", "close", "remove", "delete", "save", "new"].includes(token) || token.includes("remove") || token.includes("delete") || token.includes("cancel") || token.includes("close") || token.includes("linestrip") || textValue === "remove" || textValue === "delete";
          if (!isElementVisible(btn) || !controlName && !textValue || !isPrimaryAction)
            return;
          pushControl({ controlName, text: textValue, element: btn, visible: true });
        });
        document2.querySelectorAll(buttonSelectors).forEach((btn) => {
          const controlName = btn.getAttribute("data-dyn-controlname") || "";
          const textValue = normalizeText(btn.textContent || btn.getAttribute("aria-label") || "");
          const token = normalizeText(controlName || textValue);
          const isLikelyFixAction = token.includes("remove") || token.includes("delete") || token.includes("cancel") || token.includes("close") || token.includes("linestripdelete") || textValue === "remove" || textValue === "delete";
          if (!isElementVisible(btn) || !isLikelyFixAction)
            return;
          pushControl({ controlName, text: textValue, element: btn, visible: true });
        });
        events.push({
          kind: "messageBar",
          text,
          templateText,
          controls,
          element: entryEl
        });
      });
      return events;
    }
    function matchHandlerToEvent(handler, event) {
      const trigger = handler?.trigger || {};
      if (trigger.kind !== event.kind)
        return false;
      const triggerTemplate = generalizeInterruptionText(trigger.textTemplate || "");
      const eventTemplate = generalizeInterruptionText(event.templateText || event.text || "");
      const triggerMatchMode = normalizeText(trigger.matchMode || "");
      if (triggerMatchMode === "regex") {
        try {
          const pattern = trigger.regex || trigger.textTemplate || "";
          if (!pattern)
            return false;
          const eventText = normalizeText(event.templateText || event.text || "");
          if (!new RegExp(pattern, "i").test(eventText)) {
            return false;
          }
        } catch (error) {
          return false;
        }
      } else if (triggerMatchMode === "exact") {
        if (triggerTemplate && triggerTemplate !== eventTemplate)
          return false;
      } else {
        if (triggerTemplate && !(eventTemplate.includes(triggerTemplate) || triggerTemplate.includes(eventTemplate))) {
          return false;
        }
      }
      const requiredControls = Array.isArray(trigger.requiredControls) ? trigger.requiredControls : [];
      if (requiredControls.length && event.kind === "messageBar") {
        const available = new Set((event.controls || []).map((ctrl) => normalizeText(ctrl.controlName || ctrl.text || "")));
        if (!requiredControls.every((name) => available.has(normalizeText(name)))) {
          return false;
        }
      }
      const requiredButtons = Array.isArray(trigger.requiredButtons) ? trigger.requiredButtons : [];
      if (requiredButtons.length && event.kind === "dialog") {
        const available = new Set((event.buttons || []).map((btn) => normalizeText(btn.controlName || btn.text || "")));
        return requiredButtons.every((name) => available.has(normalizeText(name)));
      }
      return true;
    }
    function generalizeInterruptionText(rawText) {
      let value = normalizeText(rawText || "");
      if (!value)
        return "";
      value = value.replace(/\bcustomer\s+\d+\b/gi, "customer {number}").replace(/\bitem number\s+[a-z0-9_-]+\b/gi, "item number {value}").replace(/\b\d[\d,./-]*\b/g, "{number}");
      value = value.replace(
        /(\bcannot create a record in )([^.]+?)(\.)/i,
        "$1{record}$3"
      );
      value = value.replace(
        /\bfield\s+['"]?([^'".]+?)['"]?\s+must be filled in\.?/i,
        "field '{field}' must be filled in."
      );
      value = value.replace(
        /\b[a-z][a-z0-9 _()/-]*\s+cannot be deleted while dependent\s+[a-z][a-z0-9 _()/-]*\s+exist\.?/i,
        "{entity} cannot be deleted while dependent {dependency} exist."
      );
      value = value.replace(
        /\bdelete dependent\s+[a-z][a-z0-9 _()/-]*\s+and try again\.?/i,
        "delete dependent {dependency} and try again."
      );
      value = value.replace(
        /(\.\s*)([a-z][a-z0-9 _()/-]*)(\s*:\s*)([^.]+?)(\.\s*the record already exists\.?)/i,
        "$1{field}: {value}$5"
      );
      value = value.replace(
        /(\b[a-z][a-z0-9 _()/-]*\s*:\s*)([^.]+?)(\.\s*the record already exists\.?)/i,
        "{field}: {value}$3"
      );
      return normalizeText(value);
    }
    function findMatchingHandler(event) {
      const handlers = Array.isArray(currentWorkflow?.unexpectedEventHandlers) ? currentWorkflow.unexpectedEventHandlers : [];
      const sorted = handlers.filter(Boolean).slice().sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));
      for (const handler of sorted) {
        if (handler?.enabled === false)
          continue;
        if (matchHandlerToEvent(handler, event)) {
          return handler;
        }
      }
      return null;
    }
    function findDialogButton(event, targetName) {
      const expected = normalizeText(targetName || "");
      if (!expected)
        return null;
      const buttons = Array.isArray(event?.buttons) ? event.buttons : [];
      return buttons.find((btn) => {
        const byControl = normalizeText(btn.controlName || "");
        const byText = normalizeText(btn.text || "");
        return byControl === expected || byText === expected;
      }) || null;
    }
    function findMessageBarControl(event, targetName) {
      const expected = normalizeText(targetName || "");
      if (!expected)
        return null;
      const controls = Array.isArray(event?.controls) ? event.controls : [];
      return controls.find((ctrl) => {
        const byControl = normalizeText(ctrl.controlName || "");
        const byText = normalizeText(ctrl.text || "");
        return byControl === expected || byText === expected;
      }) || null;
    }
    function collectGlobalRemediationControls() {
      const controls = [];
      const seen = /* @__PURE__ */ new Set();
      const buttonSelectors = '[data-dyn-role="CommandButton"], button, [role="button"]';
      document2.querySelectorAll(buttonSelectors).forEach((btn) => {
        if (!isElementVisible(btn))
          return;
        const controlName = btn.getAttribute("data-dyn-controlname") || "";
        const text = normalizeText(btn.textContent || btn.getAttribute("aria-label") || "");
        const token = normalizeText(controlName || text);
        const isRemediationAction = token.includes("remove") || token.includes("delete") || token.includes("cancel") || token.includes("close") || token === "ok" || token === "yes" || token === "no";
        if (!isRemediationAction)
          return;
        const key = `${normalizeText(controlName)}|${text}`;
        if (seen.has(key))
          return;
        seen.add(key);
        controls.push({ controlName, text, element: btn, visible: true });
      });
      return controls;
    }
    function findGlobalClickable(targetName) {
      const expected = normalizeText(targetName || "");
      if (!expected)
        return null;
      const controls = collectGlobalRemediationControls();
      return controls.find((ctrl) => {
        const byControl = normalizeText(ctrl.controlName || "");
        const byText = normalizeText(ctrl.text || "");
        return byControl === expected || byText === expected;
      }) || null;
    }
    function normalizeHandlerActions(handler) {
      if (Array.isArray(handler?.actions) && handler.actions.length) {
        return handler.actions.filter(Boolean);
      }
      if (handler?.action) {
        return [handler.action];
      }
      return [];
    }
    function recordLearnedRule(rule) {
      if (!currentWorkflow || !rule)
        return;
      currentWorkflow.unexpectedEventHandlers = Array.isArray(currentWorkflow.unexpectedEventHandlers) ? currentWorkflow.unexpectedEventHandlers : [];
      const key = JSON.stringify({
        trigger: rule.trigger,
        actions: Array.isArray(rule?.actions) ? rule.actions : [rule?.action].filter(Boolean),
        outcome: rule?.outcome || "next-step"
      });
      const exists = currentWorkflow.unexpectedEventHandlers.some(
        (existing) => JSON.stringify({
          trigger: existing?.trigger,
          actions: Array.isArray(existing?.actions) ? existing.actions : [existing?.action].filter(Boolean),
          outcome: existing?.outcome || "next-step"
        }) === key
      );
      if (exists)
        return;
      currentWorkflow.unexpectedEventHandlers.push(rule);
      window2.postMessage({
        type: "D365_WORKFLOW_LEARNING_RULE",
        payload: {
          workflowId: currentWorkflow?.id || "",
          rule
        }
      }, "*");
    }
    function createRuleFromEvent(event, actions, outcome = "next-step", matchMode = "contains") {
      const requiredButtons = event.kind === "dialog" ? (event.buttons || []).map((btn) => btn.controlName || btn.text).filter(Boolean) : [];
      const requiredControls = event.kind === "messageBar" ? (event.controls || []).map((ctrl) => ctrl.controlName || ctrl.text).filter(Boolean) : [];
      const actionList = Array.isArray(actions) ? actions.filter(Boolean) : [];
      return {
        id: `rule_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        createdAt: Date.now(),
        priority: 100,
        mode: "auto",
        trigger: {
          kind: event.kind,
          textTemplate: generalizeInterruptionText(event.templateText || event.text || ""),
          matchMode: normalizeText(matchMode || "") === "exact" ? "exact" : "contains",
          requiredButtons,
          requiredControls
        },
        actions: actionList,
        action: actionList[0] || null,
        outcome: normalizeFlowOutcome(outcome)
      };
    }
    function normalizeFlowOutcome(rawOutcome) {
      const value = normalizeText(rawOutcome || "");
      if (value === "continue-loop" || value === "continue")
        return "continue-loop";
      if (value === "repeat-loop" || value === "repeat" || value === "retry-loop")
        return "repeat-loop";
      if (value === "break-loop" || value === "break")
        return "break-loop";
      if (value === "stop" || value === "fail")
        return "stop";
      return "next-step";
    }
    function isBenignMessageBarEvent(event) {
      if (!event || event.kind !== "messageBar")
        return false;
      const text = normalizeText(event.text || "");
      return text.includes("newrecordaction button should not re-trigger the new task");
    }
    async function waitForFlowTransitionStability() {
      const maxChecks = 16;
      for (let i = 0; i < maxChecks; i++) {
        const loading = isD365Loading();
        const visibleDialog = document2.querySelector('[role="dialog"]:not([style*="display: none"]), [data-dyn-role="Dialog"]:not([style*="display: none"])');
        if (!loading && !visibleDialog) {
          break;
        }
        await waitForTiming2("FLOW_STABILITY_POLL_DELAY");
      }
    }
    async function waitForEventResolution(event, timeoutMs = 3e3) {
      if (!event)
        return;
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        if (event.kind === "dialog") {
          const dialogEl = event.element;
          const dialogStillVisible = !!dialogEl && dialogEl.isConnected && isElementVisible(dialogEl);
          if (!dialogStillVisible) {
            return;
          }
        } else if (event.kind === "messageBar") {
          const entryEl = event.element;
          const entryStillVisible = !!entryEl && entryEl.isConnected && isElementVisible(entryEl);
          if (!entryStillVisible) {
            return;
          }
        } else {
          return;
        }
        await waitForTiming2("FLOW_STABILITY_POLL_DELAY");
      }
    }
    function buildRuleActionFromOption(event, option) {
      const normalizedControl = normalizeText(option?.controlName || "");
      if (event.kind === "messageBar" && normalizedControl === "messagebarclose") {
        return {
          type: "closeMessageBar",
          buttonControlName: option.controlName || "",
          buttonText: option.text || ""
        };
      }
      return {
        type: "clickButton",
        buttonControlName: option?.controlName || "",
        buttonText: option?.text || ""
      };
    }
    async function applySingleAction(event, action) {
      if (action?.type === "clickButton" && event.kind === "dialog") {
        const button = findDialogButton(event, action.buttonControlName || action.buttonText);
        if (button?.element) {
          button.element.click();
          await waitForTiming2("DIALOG_ACTION_DELAY");
          await waitForEventResolution(event);
          return true;
        }
      }
      if (action?.type === "clickButton" && event.kind === "messageBar") {
        const control = findMessageBarControl(event, action.buttonControlName || action.buttonText);
        if (control?.element) {
          control.element.click();
          await waitForTiming2("DIALOG_ACTION_DELAY");
          return true;
        }
      }
      if (action?.type === "clickButton") {
        const globalControl = findGlobalClickable(action.buttonControlName || action.buttonText);
        if (!globalControl?.element)
          return false;
        globalControl.element.click();
        await waitForTiming2("DIALOG_ACTION_DELAY");
        if (event.kind === "dialog" || event.kind === "messageBar") {
          await waitForEventResolution(event);
        }
        return true;
      }
      if (action?.type === "closeMessageBar" && event.kind === "messageBar") {
        const fromOption = findMessageBarControl(event, action.buttonControlName || action.buttonText);
        const fromControls = (event.controls || []).find((ctrl) => normalizeText(ctrl.controlName || "") === "messagebarclose");
        const fromEntry = event.element?.querySelector?.('[data-dyn-controlname="MessageBarClose"]') || null;
        const fromPage = Array.from(document2.querySelectorAll('[data-dyn-controlname="MessageBarClose"]')).find(isElementVisible) || null;
        const closeElement = fromOption?.element || fromControls?.element || fromEntry || fromPage;
        if (!closeElement || !isElementVisible(closeElement))
          return false;
        closeElement.click();
        await waitForTiming2("MESSAGE_CLOSE_DELAY");
        await waitForEventResolution(event);
        return true;
      }
      if (action?.type === "stop") {
        throw createUserStopError();
      }
      return action?.type === "none";
    }
    async function applyHandler(event, handler) {
      const actions = normalizeHandlerActions(handler);
      if (!actions.length)
        return true;
      let handled = false;
      for (const action of actions) {
        const currentEvents = detectUnexpectedEvents();
        const activeEvent = currentEvents.find((candidate) => {
          if (!candidate || candidate.kind !== event.kind)
            return false;
          if (candidate.element && event.element && candidate.element === event.element)
            return true;
          const candidateTemplate = normalizeText(candidate.templateText || "");
          const eventTemplate = normalizeText(event.templateText || "");
          return candidateTemplate && eventTemplate && candidateTemplate === eventTemplate;
        }) || currentEvents[0] || event;
        const applied = await applySingleAction(activeEvent, action);
        handled = handled || applied;
      }
      return handled;
    }
    function inferFlowOutcomeFromAction(action, event) {
      const token = normalizeText(action?.controlName || action?.text || "");
      if (!token)
        return "next-step";
      if (token.includes("stop"))
        return "stop";
      if (token.includes("cancel") || token.includes("close") || token === "no") {
        if (event?.kind === "messageBar") {
          return "continue-loop";
        }
        return "next-step";
      }
      return "next-step";
    }
    function buildInterruptionOptions(event) {
      const dedupe = /* @__PURE__ */ new Set();
      const all = [];
      const pushUnique = (item) => {
        const option = {
          controlName: item?.controlName || "",
          text: item?.text || ""
        };
        const key = `${normalizeText(option.controlName)}|${normalizeText(option.text)}`;
        if (dedupe.has(key))
          return;
        dedupe.add(key);
        all.push(option);
      };
      if (event.kind === "dialog") {
        (event.buttons || []).forEach(pushUnique);
        collectGlobalRemediationControls().forEach(pushUnique);
      } else {
        (event.controls || []).forEach(pushUnique);
        collectGlobalRemediationControls().forEach(pushUnique);
      }
      const score = (opt) => {
        const token = normalizeText(opt.controlName || opt.text || "");
        if (token === "remove" || token.includes("remove") || token === "delete" || token.includes("delete"))
          return -1;
        if (token === "cancel" || token.includes("cancel"))
          return 0;
        if (token === "close" || token.includes("close"))
          return 1;
        if (token === "no")
          return 2;
        if (token.startsWith("messagebar"))
          return 10;
        return 5;
      };
      return all.sort((a, b) => score(a) - score(b));
    }
    function findEventOptionElement(event, option) {
      const expectedControl = normalizeText(option?.controlName || "");
      const expectedText = normalizeText(option?.text || "");
      const dialogButton = (event.buttons || []).find((btn) => {
        const byControl = normalizeText(btn.controlName || "");
        const byText = normalizeText(btn.text || "");
        return expectedControl && byControl === expectedControl || expectedText && byText === expectedText;
      })?.element || null;
      if (dialogButton)
        return dialogButton;
      const messageControl = (event.controls || []).find((ctrl) => {
        const byControl = normalizeText(ctrl.controlName || "");
        const byText = normalizeText(ctrl.text || "");
        return expectedControl && byControl === expectedControl || expectedText && byText === expectedText;
      })?.element || null;
      if (messageControl)
        return messageControl;
      return findGlobalClickable(option?.controlName || option?.text || "")?.element || null;
    }
    async function requestInterruptionDecision(event) {
      const requestId = `intr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      executionControl.pendingInterruptionDecision = null;
      executionControl.isPaused = true;
      window2.postMessage({
        type: "D365_WORKFLOW_PROGRESS",
        progress: {
          phase: "pausedForInterruption",
          kind: event.kind,
          message: shortenForLog(event.text, 180),
          stepIndex: executionControl.currentStepIndex
        }
      }, "*");
      window2.postMessage({
        type: "D365_WORKFLOW_INTERRUPTION",
        payload: {
          requestId,
          workflowId: currentWorkflow?.id || "",
          stepIndex: executionControl.currentStepIndex,
          kind: event.kind,
          text: shortenForLog(event.text, 600),
          options: buildInterruptionOptions(event)
        }
      }, "*");
      while (!executionControl.isStopped) {
        const decision = executionControl.pendingInterruptionDecision;
        if (decision && decision.requestId === requestId) {
          executionControl.pendingInterruptionDecision = null;
          executionControl.isPaused = false;
          return decision;
        }
        await waitForTiming2("INTERRUPTION_POLL_DELAY");
      }
      throw createUserStopError();
    }
    async function applyInterruptionDecision(event, decision) {
      const actionType = decision?.actionType || "none";
      if (actionType === "stop") {
        throw createUserStopError();
      }
      let clickedOption = null;
      let clickedFollowupOption = null;
      if (actionType === "clickOption") {
        const option = decision?.selectedOption || {};
        const element = findEventOptionElement(event, option);
        if (element && typeof element.click === "function") {
          element.click();
          clickedOption = option;
          await waitForTiming2("DIALOG_ACTION_DELAY");
          const followup = decision?.selectedFollowupOption || null;
          if (followup && normalizeText(followup.controlName || followup.text || "") !== normalizeText(option.controlName || option.text || "")) {
            const refreshEvents = detectUnexpectedEvents();
            const followupEvent = refreshEvents[0] || event;
            const followupElement = findEventOptionElement(followupEvent, followup);
            if (followupElement && typeof followupElement.click === "function") {
              followupElement.click();
              clickedFollowupOption = followup;
              await waitForTiming2("DIALOG_ACTION_DELAY");
            } else {
              sendLog("warning", `Selected follow-up option not found: ${followup.controlName || followup.text || "unknown"}`);
            }
          }
        } else {
          sendLog("warning", `Selected interruption option not found: ${option.controlName || option.text || "unknown"}`);
        }
      }
      if (decision?.saveRule && clickedOption) {
        const actions = [buildRuleActionFromOption(event, clickedOption)];
        if (clickedFollowupOption) {
          actions.push(buildRuleActionFromOption(event, clickedFollowupOption));
        }
        recordLearnedRule(createRuleFromEvent(event, actions, decision?.outcome || "next-step", decision?.matchMode || "contains"));
        sendLog("success", `Learned ${event.kind} handler: ${clickedOption.controlName || clickedOption.text || "action"}${clickedFollowupOption ? " -> follow-up" : ""}`);
      }
      const outcome = normalizeFlowOutcome(decision?.outcome || "next-step");
      if (outcome === "stop") {
        throw createUserStopError();
      }
      if (outcome === "continue-loop" || outcome === "break-loop" || outcome === "repeat-loop") {
        await waitForFlowTransitionStability();
        return { signal: outcome };
      }
      if (event?.kind === "dialog") {
        await waitForFlowTransitionStability();
      }
      return { signal: "none" };
    }
    async function handleUnexpectedEvents(learningMode) {
      const maxDepth = 6;
      for (let depth = 0; depth < maxDepth; depth++) {
        let events = detectUnexpectedEvents();
        if (!events.length && depth === 0) {
          const basePollAttempts = 5;
          const loading = isD365Loading();
          const pollAttempts = loading ? basePollAttempts * 2 : basePollAttempts;
          for (let p = 0; p < pollAttempts; p++) {
            await waitForTiming2("FLOW_STABILITY_POLL_DELAY");
            events = detectUnexpectedEvents();
            if (events.length)
              break;
          }
          if (!events.length)
            return { signal: "none" };
        }
        if (!events.length)
          return { signal: "none" };
        const event = events[0];
        if (isBenignMessageBarEvent(event)) {
          const key2 = `messageBar|${event.templateText}`;
          if (!acknowledgedMessageBarKeys.has(key2)) {
            sendLog("info", `Ignoring benign message bar: ${shortenForLog(event.text, 120)}`);
          }
          acknowledgedMessageBarKeys.add(key2);
          continue;
        }
        const handler = findMatchingHandler(event);
        if (handler && handler.mode !== "alwaysAsk") {
          const handled = await applyHandler(event, handler);
          if (handled) {
            sendLog("info", `Applied learned handler for ${event.kind}: ${shortenForLog(event.text)}`);
            const handlerOutcome = normalizeFlowOutcome(handler?.outcome || "next-step");
            if (handlerOutcome === "stop") {
              throw createUserStopError();
            }
            if (handlerOutcome === "continue-loop" || handlerOutcome === "break-loop" || handlerOutcome === "repeat-loop") {
              await waitForFlowTransitionStability();
              return { signal: handlerOutcome };
            }
            if (event.kind === "dialog") {
              await waitForFlowTransitionStability();
            }
            if (event.kind === "messageBar") {
              acknowledgedMessageBarKeys.add(`messageBar|${event.templateText}`);
            }
            continue;
          }
        }
        if (event.kind === "messageBar") {
          if (learningMode) {
            sendLog("warning", `Learning mode: message bar detected, decision required: ${shortenForLog(event.text)}`);
            const decision = await requestInterruptionDecision(event);
            const result = await applyInterruptionDecision(event, decision);
            if (result?.signal && result.signal !== "none") {
              acknowledgedMessageBarKeys.add(`messageBar|${event.templateText}`);
              return result;
            }
          } else {
            const key2 = `messageBar|${event.templateText}`;
            if (!unhandledUnexpectedEventKeys.has(key2)) {
              unhandledUnexpectedEventKeys.add(key2);
              sendLog("warning", `Message bar detected with no handler: ${shortenForLog(event.text)}`);
            }
          }
          acknowledgedMessageBarKeys.add(`messageBar|${event.templateText}`);
          continue;
        }
        if (learningMode) {
          sendLog("warning", `Learning mode: dialog requires decision: ${shortenForLog(event.text)}`);
          const decision = await requestInterruptionDecision(event);
          const result = await applyInterruptionDecision(event, decision);
          if (result?.signal && result.signal !== "none") {
            return result;
          }
          continue;
        }
        const key = `${event.kind}|${event.templateText}`;
        if (!unhandledUnexpectedEventKeys.has(key)) {
          unhandledUnexpectedEventKeys.add(key);
          sendLog("warning", `Unexpected ${event.kind} detected with no handler: ${shortenForLog(event.text)}`);
        }
        return { signal: "none" };
      }
      return { signal: "none" };
    }
    async function executeWorkflow(workflow, data) {
      try {
        try {
          sessionStorage.removeItem("d365_pending_workflow");
          if (workflow?.id) {
            sessionStorage.setItem("d365_active_workflow_id", workflow.id);
          }
        } catch (e) {
        }
        sendLog("info", `Starting workflow: ${workflow?.name || workflow?.id || "unnamed"}`);
        window2.postMessage({ type: "D365_WORKFLOW_PROGRESS", progress: { phase: "workflowStart", workflow: workflow?.name || workflow?.id } }, "*");
        executionControl.isPaused = false;
        executionControl.isStopped = false;
        executionControl.pendingInterruptionDecision = null;
        executionControl.runOptions = workflow.runOptions || { skipRows: 0, limitRows: 0, dryRun: false, learningMode: false, runUntilInterception: false };
        executionControl.stepIndexOffset = workflow?._originalStartIndex || 0;
        executionControl.currentStepIndex = executionControl.stepIndexOffset;
        executionControl.processedRows = 0;
        unhandledUnexpectedEventKeys.clear();
        acknowledgedMessageBarKeys.clear();
        currentWorkflow = workflow;
        window2.d365OriginalWorkflow = workflow?._originalWorkflow || workflow;
        currentWorkflowSettings = workflow?.settings || {};
        window2.d365CurrentWorkflowSettings = currentWorkflowSettings;
        window2.d365CurrentWorkflow = currentWorkflow;
        window2.d365ExecutionControl = executionControl;
        const steps = workflow.steps;
        let primaryData = [];
        let detailSources = {};
        let relationships = [];
        if (workflow.dataSources) {
          primaryData = workflow.dataSources.primary?.data || [];
          relationships = workflow.dataSources.relationships || [];
          (workflow.dataSources.details || []).forEach((detail) => {
            if (detail.data) {
              detailSources[detail.id] = {
                data: detail.data,
                name: detail.name,
                fields: detail.fields
              };
            }
          });
        } else if (data) {
          primaryData = Array.isArray(data) ? data : [data];
        }
        if (primaryData.length === 0) {
          primaryData = [{}];
        }
        await executeStepsWithLoops(steps, primaryData, detailSources, relationships, workflow.settings);
        const processedRows = executionControl.processedRows > 0 ? executionControl.processedRows : primaryData.length;
        sendLog("info", `Workflow complete: processed ${processedRows} rows`);
        window2.postMessage({
          type: "D365_WORKFLOW_COMPLETE",
          result: { processed: processedRows }
        }, "*");
      } catch (error) {
        if (error && error.isNavigationInterrupt) {
          sendLog("info", "Workflow paused for navigation - will resume after page loads");
          return;
        }
        if (!error || !error._reported) {
          sendLog("error", `Workflow error: ${error?.message || String(error)}`);
          window2.postMessage({
            type: "D365_WORKFLOW_ERROR",
            error: error?.message || String(error),
            stack: error?.stack
          }, "*");
        }
      }
    }
    function getStepFakerRandomItem(list) {
      if (!Array.isArray(list) || !list.length)
        return "";
      return list[Math.floor(Math.random() * list.length)];
    }
    function generateStepFakerValue(generatorName) {
      const firstNames = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica"];
      const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore"];
      const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "apex", "bolt", "crest", "dawn", "ember", "flint"];
      const name = String(generatorName || "First Name");
      if (name === "First Name")
        return getStepFakerRandomItem(firstNames);
      if (name === "Last Name")
        return getStepFakerRandomItem(lastNames);
      if (name === "Full Name")
        return `${getStepFakerRandomItem(firstNames)} ${getStepFakerRandomItem(lastNames)}`;
      if (name === "Email") {
        const first = getStepFakerRandomItem(firstNames).toLowerCase();
        const last = getStepFakerRandomItem(lastNames).toLowerCase();
        return `${first}.${last}@example.com`;
      }
      if (name === "Number")
        return String(Math.floor(Math.random() * 1e4));
      if (name === "Decimal")
        return (Math.random() * 1e4).toFixed(2);
      if (name === "Date") {
        const offsetDays = Math.floor(Math.random() * 365 * 3);
        const d = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1e3);
        return d.toISOString().slice(0, 10);
      }
      if (name === "UUID") {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = Math.floor(Math.random() * 16);
          const v = c === "x" ? r : r & 3 | 8;
          return v.toString(16);
        });
      }
      if (name === "Boolean")
        return Math.random() < 0.5 ? "true" : "false";
      if (name === "Word")
        return getStepFakerRandomItem(words);
      if (name === "Lorem Sentence") {
        const picked = [...words].sort(() => Math.random() - 0.5).slice(0, 5);
        const sentence = picked.join(" ");
        return sentence.charAt(0).toUpperCase() + sentence.slice(1);
      }
      if (name === "Sequential") {
        window2.__d365StepFakerSeq = (window2.__d365StepFakerSeq || 0) + 1;
        return String(window2.__d365StepFakerSeq);
      }
      return getStepFakerRandomItem(firstNames);
    }
    async function resolveStepValue(step, currentRow) {
      const source = step?.valueSource || (step?.fieldMapping ? "data" : "static");
      if (source === "clipboard") {
        try {
          if (!navigator2.clipboard?.readText) {
            throw new Error("Clipboard API not available");
          }
          const text = await navigator2.clipboard.readText();
          return text ?? "";
        } catch (error) {
          sendLog("error", `Clipboard read failed: ${error?.message || String(error)}`);
          throw new Error("Clipboard read failed");
        }
      }
      if (source === "data") {
        const row = currentRow || window2.d365ExecutionControl?.currentDataRow || {};
        const field = step?.fieldMapping || "";
        if (!field)
          return "";
        const value = row[field];
        return value === void 0 || value === null ? "" : String(value);
      }
      if (source === "faker") {
        return generateStepFakerValue(step?.fakerGenerator || "First Name");
      }
      if (source === "random-constant") {
        const options = String(step?.randomValues || "").split(",").map((value) => value.trim()).filter(Boolean);
        if (!options.length)
          return "";
        return options[Math.floor(Math.random() * options.length)];
      }
      return step?.value ?? "";
    }
    async function executeSingleStep(step, stepIndex, currentRow, detailSources, settings, dryRun, learningMode) {
      executionControl.currentStepIndex = typeof step._absoluteIndex === "number" ? step._absoluteIndex : (executionControl.stepIndexOffset || 0) + stepIndex;
      const stepLabel = step.displayText || step.controlName || step.type || `step ${stepIndex}`;
      const absoluteStepIndex = executionControl.currentStepIndex;
      window2.postMessage({
        type: "D365_WORKFLOW_PROGRESS",
        progress: { phase: "stepStart", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
      }, "*");
      let waitTarget = "";
      let shouldWaitBefore = false;
      let shouldWaitAfter = false;
      try {
        const stepType = (step.type || "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        logStep(`Step ${absoluteStepIndex + 1}: ${stepType} -> ${stepLabel}`);
        const runUntilInterception = !!executionControl.runOptions?.runUntilInterception;
        if (learningMode) {
          const interruption = await handleUnexpectedEvents(true);
          if (interruption?.signal && interruption.signal !== "none") {
            return interruption;
          }
          if (!runUntilInterception) {
            sendLog("info", `Learning mode: confirm step ${absoluteStepIndex + 1} (${stepLabel}). Resume to continue.`);
            executionControl.isPaused = true;
            window2.postMessage({
              type: "D365_WORKFLOW_PROGRESS",
              progress: {
                phase: "pausedForConfirmation",
                stepName: stepLabel,
                stepIndex: absoluteStepIndex
              }
            }, "*");
            await checkExecutionControl();
          }
        }
        if (dryRun) {
          sendLog("info", `Dry run - skipping action: ${step.type} ${step.controlName || ""}`);
          window2.postMessage({
            type: "D365_WORKFLOW_PROGRESS",
            progress: { phase: "stepDone", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
          }, "*");
          return { signal: "none" };
        }
        let resolvedValue = null;
        if (["input", "select", "lookupSelect", "gridInput", "filter", "queryFilter"].includes(stepType)) {
          resolvedValue = await resolveStepValue(step, currentRow);
        }
        waitTarget = step.waitTargetControlName || step.controlName || "";
        shouldWaitBefore = !!step.waitUntilVisible;
        shouldWaitAfter = !!step.waitUntilHidden;
        if ((shouldWaitBefore || shouldWaitAfter) && !waitTarget) {
          sendLog("warning", `Wait option set but no control name on step ${absoluteStepIndex + 1}`);
        }
        if (shouldWaitBefore && waitTarget) {
          await waitUntilCondition(waitTarget, "visible", null, 5e3);
        }
        switch (stepType) {
          case "click":
            await clickElement(step.controlName);
            break;
          case "input":
          case "select":
            await setInputValue(step.controlName, resolvedValue, step.fieldType, step.comboSelectMode || "");
            break;
          case "lookupSelect":
            await setLookupSelectValue(step.controlName, resolvedValue, step.comboSelectMode || "");
            break;
          case "checkbox":
            await setCheckboxValue(step.controlName, coerceBoolean(step.value));
            break;
          case "gridInput":
            await setGridCellValue(step.controlName, resolvedValue, step.fieldType, !!step.waitForValidation, step.comboSelectMode || "");
            break;
          case "filter":
            await applyGridFilter(step.controlName, resolvedValue, step.filterMethod || "is exactly", step.comboSelectMode || "");
            break;
          case "queryFilter":
            await configureQueryFilter(step.tableName, step.fieldName, resolvedValue, {
              savedQuery: step.savedQuery,
              closeDialogAfter: step.closeDialogAfter,
              comboSelectMode: step.comboSelectMode || ""
            });
            break;
          case "wait":
            await sleep(Number(step.duration) || getTimings2().DEFAULT_WAIT_STEP_DELAY);
            break;
          case "waitUntil":
            await waitUntilCondition(
              step.controlName,
              step.waitCondition || "visible",
              step.waitValue,
              step.timeout || 1e4
            );
            break;
          case "navigate":
            await navigateToForm(step);
            break;
          case "activateTab":
            await activateTab(step.controlName);
            break;
          case "tabNavigate":
            await activateTab(step.controlName);
            break;
          case "actionPaneTab":
            await activateActionPaneTab(step.controlName);
            break;
          case "expandSection":
            await expandOrCollapseSection(step.controlName, "expand");
            break;
          case "collapseSection":
            await expandOrCollapseSection(step.controlName, "collapse");
            break;
          case "closeDialog":
            await closeDialog();
            break;
          default:
            throw new Error(`Unsupported step type: ${step.type}`);
        }
        if (shouldWaitAfter && waitTarget) {
          await waitUntilCondition(waitTarget, "hidden", null, 5e3);
        }
        const postInterruption = await handleUnexpectedEvents(learningMode);
        if (postInterruption?.signal && postInterruption.signal !== "none") {
          return postInterruption;
        }
        window2.postMessage({
          type: "D365_WORKFLOW_PROGRESS",
          progress: { phase: "stepDone", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
        }, "*");
        const pendingSignal = consumePendingFlowSignal();
        return { signal: pendingSignal };
      } catch (err) {
        if (err && err.isNavigationInterrupt)
          throw err;
        if (learningMode && !err?.isUserStop) {
          const pending = detectUnexpectedEvents();
          if (pending.length) {
            sendLog("warning", `Learning mode: interruption detected during step ${absoluteStepIndex + 1}. Asking for handling...`);
            await handleUnexpectedEvents(true);
            if (shouldWaitAfter && waitTarget) {
              try {
                await waitUntilCondition(waitTarget, "hidden", null, 2500);
                window2.postMessage({
                  type: "D365_WORKFLOW_PROGRESS",
                  progress: { phase: "stepDone", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
                }, "*");
                const pendingSignal = consumePendingFlowSignal();
                return { signal: pendingSignal };
              } catch (_) {
                sendLog("warning", `Learning mode override: continuing even though "${waitTarget}" is still visible after interruption handling.`);
                window2.postMessage({
                  type: "D365_WORKFLOW_PROGRESS",
                  progress: { phase: "stepDone", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
                }, "*");
                const pendingSignal = consumePendingFlowSignal();
                return { signal: pendingSignal };
              }
            }
          }
        }
        sendLog("error", `Error executing step ${absoluteStepIndex + 1}: ${err?.message || String(err)}`);
        throw err;
      }
    }
    async function executeStepsWithLoops(steps, primaryData, detailSources, relationships, settings) {
      const { skipRows = 0, limitRows = 0, dryRun = false, learningMode = false } = executionControl.runOptions;
      const originalTotalRows = primaryData.length;
      let startRowNumber = 0;
      if (skipRows > 0) {
        primaryData = primaryData.slice(skipRows);
        startRowNumber = skipRows;
        sendLog("info", `Skipped first ${skipRows} rows`);
      }
      if (limitRows > 0 && primaryData.length > limitRows) {
        primaryData = primaryData.slice(0, limitRows);
        sendLog("info", `Limited to ${limitRows} rows`);
      }
      const totalRowsToProcess = primaryData.length;
      executionControl.totalRows = originalTotalRows;
      const loopPairs = findLoopPairs(steps, (message) => sendLog("error", message));
      const ifPairs = findIfPairs(steps, (message) => sendLog("error", message));
      const labelMap = /* @__PURE__ */ new Map();
      steps.forEach((step, index) => {
        if (step?.type === "label" && step.labelName) {
          labelMap.set(step.labelName, index);
        }
      });
      if (loopPairs.length === 0) {
        for (let rowIndex = 0; rowIndex < primaryData.length; rowIndex++) {
          await checkExecutionControl();
          const row = primaryData[rowIndex];
          const displayRowNumber = startRowNumber + rowIndex;
          executionControl.currentRowIndex = displayRowNumber;
          executionControl.processedRows = rowIndex + 1;
          executionControl.currentDataRow = row;
          const rowProgress = {
            phase: "rowStart",
            row: displayRowNumber,
            totalRows: originalTotalRows,
            processedRows: rowIndex + 1,
            totalToProcess: totalRowsToProcess,
            step: "Processing row"
          };
          sendLog("info", `Processing row ${displayRowNumber + 1}/${originalTotalRows}`);
          window2.postMessage({ type: "D365_WORKFLOW_PROGRESS", progress: rowProgress }, "*");
          const result = await executeRange(0, steps.length, row);
          if (result?.signal === "break-loop" || result?.signal === "continue-loop" || result?.signal === "repeat-loop") {
            throw new Error("Loop control signal used outside of a loop");
          }
        }
        return;
      }
      const loopPairMap = new Map(loopPairs.map((pair) => [pair.startIndex, pair.endIndex]));
      const initialDataRow = primaryData[0] || {};
      const resolveLoopData = (loopDataSource, currentDataRow) => {
        let loopData = primaryData;
        if (loopDataSource !== "primary" && detailSources[loopDataSource]) {
          const detailSource = detailSources[loopDataSource];
          const relationsForDetail = (relationships || []).filter((r) => r.detailId === loopDataSource);
          if (!relationsForDetail.length) {
            loopData = detailSource.data;
            return loopData;
          }
          const loopStack = Array.isArray(currentDataRow?.__d365_loop_stack) ? currentDataRow.__d365_loop_stack : [];
          const parentLoopSourceId = loopStack.length ? loopStack[loopStack.length - 1] : "";
          if (!parentLoopSourceId) {
            loopData = detailSource.data;
            return loopData;
          }
          const parentScopedRelations = relationsForDetail.filter((rel) => (rel.parentSourceId || "") === parentLoopSourceId);
          const candidateRelations = parentScopedRelations.length ? parentScopedRelations : relationsForDetail;
          const resolveParentValue = (rel, pair) => {
            const explicitKey = rel?.parentSourceId ? `${rel.parentSourceId}:${pair.primaryField}` : "";
            if (explicitKey) {
              const explicitValue = currentDataRow?.[explicitKey];
              if (explicitValue !== void 0 && explicitValue !== null && String(explicitValue) !== "") {
                return explicitValue;
              }
            }
            const fallbackValue = currentDataRow?.[pair.primaryField];
            if (fallbackValue !== void 0 && fallbackValue !== null && String(fallbackValue) !== "") {
              return fallbackValue;
            }
            return void 0;
          };
          const selectedRelation = candidateRelations.find((rel) => {
            const fieldMappings = Array.isArray(rel?.fieldMappings) && rel.fieldMappings.length ? rel.fieldMappings : rel?.primaryField && rel?.detailField ? [{ primaryField: rel.primaryField, detailField: rel.detailField }] : [];
            if (!fieldMappings.length)
              return false;
            return fieldMappings.every((pair) => resolveParentValue(rel, pair) !== void 0);
          }) || null;
          if (!selectedRelation) {
            sendLog("warning", `Relationship filter for ${loopDataSource} could not resolve parent values. Loop will process 0 rows.`);
            loopData = [];
            return loopData;
          }
          const selectedMappings = Array.isArray(selectedRelation.fieldMappings) && selectedRelation.fieldMappings.length ? selectedRelation.fieldMappings : [{ primaryField: selectedRelation.primaryField, detailField: selectedRelation.detailField }];
          loopData = detailSource.data.filter((detailRow) => selectedMappings.every((pair) => {
            const parentValue = resolveParentValue(selectedRelation, pair);
            const childValue = detailRow?.[pair.detailField];
            if (parentValue === void 0)
              return false;
            if (childValue === void 0 || childValue === null)
              return false;
            return String(childValue) === String(parentValue);
          }));
        }
        return loopData;
      };
      async function executeStepWithHandling(step, stepIndex, currentDataRow) {
        const { mode, retryCount, retryDelay, gotoLabel } = getStepErrorConfig(step, settings);
        let attempt = 0;
        while (true) {
          try {
            const stepResult = await executeSingleStep(step, stepIndex, currentDataRow, detailSources, settings, dryRun, learningMode);
            if (stepResult?.signal && stepResult.signal !== "none") {
              consumePendingFlowSignal();
              return { signal: stepResult.signal };
            }
            const pendingSignal = consumePendingFlowSignal();
            if (pendingSignal !== "none") {
              return { signal: pendingSignal };
            }
            return { signal: "none" };
          } catch (err) {
            if (err && err.isNavigationInterrupt)
              throw err;
            if (err && (err.isUserStop || err.noRetry))
              throw err;
            if (retryCount > 0 && attempt < retryCount) {
              attempt += 1;
              sendLog("warning", `Retrying step ${stepIndex + 1} (${attempt}/${retryCount}) after error: ${err?.message || String(err)}`);
              if (retryDelay > 0) {
                await sleep(retryDelay);
              }
              continue;
            }
            switch (mode) {
              case "skip":
                return { signal: "skip" };
              case "goto":
                return { signal: "goto", label: gotoLabel };
              case "break-loop":
                return { signal: "break-loop" };
              case "continue-loop":
                return { signal: "continue-loop" };
              case "repeat-loop":
                return { signal: "repeat-loop" };
              case "fail":
              default:
                throw err;
            }
          }
        }
      }
      async function executeRange(startIdx, endIdx, currentDataRow) {
        if (currentDataRow) {
          executionControl.currentDataRow = currentDataRow;
        }
        let idx = startIdx;
        while (idx < endIdx) {
          await checkExecutionControl();
          const step = steps[idx];
          if (step.type === "label") {
            idx++;
            continue;
          }
          if (step.type === "goto") {
            const targetIndex = labelMap.get(step.gotoLabel);
            if (targetIndex === void 0) {
              throw new Error(`Goto label not found: ${step.gotoLabel || ""}`);
            }
            if (targetIndex < startIdx || targetIndex >= endIdx) {
              return { signal: "goto", targetIndex };
            }
            idx = targetIndex;
            continue;
          }
          if (step.type === "if-start") {
            const conditionMet = evaluateCondition(step, currentDataRow, {
              findElementInActiveContext,
              isElementVisible
            });
            const endIndex = ifPairs.ifToEnd.get(idx);
            const elseIndex = ifPairs.ifToElse.get(idx);
            if (endIndex === void 0) {
              throw new Error(`If-start at index ${idx} has no matching if-end`);
            }
            if (conditionMet) {
              idx++;
              continue;
            }
            if (elseIndex !== void 0) {
              idx = elseIndex + 1;
            } else {
              idx = endIndex + 1;
            }
            continue;
          }
          if (step.type === "else") {
            const endIndex = ifPairs.elseToEnd.get(idx);
            if (endIndex !== void 0) {
              idx = endIndex + 1;
            } else {
              idx++;
            }
            continue;
          }
          if (step.type === "if-end") {
            idx++;
            continue;
          }
          if (step.type === "continue-loop") {
            return { signal: "continue-loop" };
          }
          if (step.type === "repeat-loop") {
            return { signal: "repeat-loop" };
          }
          if (step.type === "break-loop") {
            return { signal: "break-loop" };
          }
          if (step.type === "loop-start") {
            const loopEndIdx = loopPairMap.get(idx);
            if (loopEndIdx === void 0 || loopEndIdx <= idx) {
              throw new Error(`Loop start at index ${idx} has no matching end`);
            }
            const loopMode = step.loopMode || "data";
            if (loopMode === "count") {
              const loopCount = Number(step.loopCount) || 0;
              executionControl.totalRows = loopCount;
              sendLog("info", `Entering loop: ${step.loopName || "Loop"} (count=${loopCount})`);
              for (let iterIndex = 0; iterIndex < loopCount; iterIndex++) {
                await checkExecutionControl();
                executionControl.processedRows = iterIndex + 1;
                window2.postMessage({
                  type: "D365_WORKFLOW_PROGRESS",
                  progress: { phase: "loopIteration", iteration: iterIndex + 1, total: loopCount, step: `Loop "${step.loopName || "Loop"}": iteration ${iterIndex + 1}/${loopCount}` }
                }, "*");
                const result2 = await executeRange(idx + 1, loopEndIdx, currentDataRow);
                if (result2?.signal === "break-loop")
                  break;
                if (result2?.signal === "continue-loop")
                  continue;
                if (result2?.signal === "repeat-loop") {
                  iterIndex = Math.max(-1, iterIndex - 1);
                  continue;
                }
                if (result2?.signal === "goto")
                  return result2;
              }
              idx = loopEndIdx + 1;
              continue;
            }
            if (loopMode === "while") {
              const maxIterations = Number(step.loopMaxIterations) || 100;
              let iterIndex = 0;
              while (iterIndex < maxIterations) {
                await checkExecutionControl();
                if (!evaluateCondition(step, currentDataRow, {
                  findElementInActiveContext,
                  isElementVisible
                }))
                  break;
                window2.postMessage({
                  type: "D365_WORKFLOW_PROGRESS",
                  progress: { phase: "loopIteration", iteration: iterIndex + 1, total: maxIterations, step: `Loop "${step.loopName || "Loop"}": iteration ${iterIndex + 1}/${maxIterations}` }
                }, "*");
                const result2 = await executeRange(idx + 1, loopEndIdx, currentDataRow);
                if (result2?.signal === "break-loop")
                  break;
                if (result2?.signal === "continue-loop") {
                  iterIndex++;
                  continue;
                }
                if (result2?.signal === "repeat-loop") {
                  continue;
                }
                if (result2?.signal === "goto")
                  return result2;
                iterIndex++;
              }
              if (iterIndex >= maxIterations) {
                sendLog("warning", `Loop "${step.loopName || "Loop"}" hit max iterations (${maxIterations})`);
              }
              idx = loopEndIdx + 1;
              continue;
            }
            const loopDataSource = step.loopDataSource || "primary";
            let loopData = resolveLoopData(loopDataSource, currentDataRow);
            const iterationLimit = step.iterationLimit || 0;
            if (iterationLimit > 0 && loopData.length > iterationLimit) {
              loopData = loopData.slice(0, iterationLimit);
            }
            sendLog("info", `Entering loop: ${step.loopName || "Loop"} (source=${loopDataSource}) - ${loopData.length} iterations`);
            for (let iterIndex = 0; iterIndex < loopData.length; iterIndex++) {
              await checkExecutionControl();
              const iterSourceRow = loopData[iterIndex] || {};
              const iterRow = { ...currentDataRow, ...iterSourceRow };
              const parentStack = Array.isArray(currentDataRow?.__d365_loop_stack) ? currentDataRow.__d365_loop_stack : [];
              iterRow.__d365_loop_stack = [...parentStack, loopDataSource];
              if (loopDataSource !== "primary") {
                Object.entries(iterSourceRow).forEach(([field, value]) => {
                  iterRow[`${loopDataSource}:${field}`] = value;
                });
              }
              const isPrimaryLoop = loopDataSource === "primary";
              const totalRowsForLoop = isPrimaryLoop ? originalTotalRows : loopData.length;
              const totalToProcessForLoop = loopData.length;
              const displayRowNumber = isPrimaryLoop ? startRowNumber + iterIndex : iterIndex;
              const loopRowProgress = {
                phase: "rowStart",
                row: displayRowNumber,
                totalRows: totalRowsForLoop,
                processedRows: iterIndex + 1,
                totalToProcess: totalToProcessForLoop,
                step: "Processing row"
              };
              sendLog("info", `Loop iteration ${iterIndex + 1}/${loopData.length} for loop ${step.loopName || "Loop"}`);
              executionControl.processedRows = iterIndex + 1;
              window2.postMessage({ type: "D365_WORKFLOW_PROGRESS", progress: loopRowProgress }, "*");
              window2.postMessage({ type: "D365_WORKFLOW_PROGRESS", progress: { phase: "loopIteration", iteration: iterIndex + 1, total: loopData.length, step: `Loop "${step.loopName || "Loop"}": iteration ${iterIndex + 1}/${loopData.length}` } }, "*");
              const result2 = await executeRange(idx + 1, loopEndIdx, iterRow);
              if (result2?.signal === "break-loop")
                break;
              if (result2?.signal === "continue-loop")
                continue;
              if (result2?.signal === "repeat-loop") {
                iterIndex = Math.max(-1, iterIndex - 1);
                continue;
              }
              if (result2?.signal === "goto")
                return result2;
            }
            idx = loopEndIdx + 1;
            continue;
          }
          if (step.type === "loop-end") {
            idx++;
            continue;
          }
          const result = await executeStepWithHandling(step, idx, currentDataRow);
          if (result?.signal === "skip" || result?.signal === "none") {
            idx++;
            continue;
          }
          if (result?.signal === "goto") {
            const targetIndex = labelMap.get(result.label);
            if (targetIndex === void 0) {
              throw new Error(`Goto label not found: ${result.label || ""}`);
            }
            if (targetIndex < startIdx || targetIndex >= endIdx) {
              return { signal: "goto", targetIndex };
            }
            idx = targetIndex;
            continue;
          }
          if (result?.signal === "break-loop" || result?.signal === "continue-loop" || result?.signal === "repeat-loop") {
            return result;
          }
          idx++;
        }
        return { signal: "none" };
      }
      const finalResult = await executeRange(0, steps.length, initialDataRow);
      if (finalResult?.signal === "break-loop" || finalResult?.signal === "continue-loop" || finalResult?.signal === "repeat-loop") {
        throw new Error("Loop control signal used outside of a loop");
      }
    }
    function runAdminInspection(inspector2, inspectionType, formNameParam, document3, window3) {
      switch (inspectionType) {
        case "scanPage":
          return adminDiscoverEverything(document3, window3);
        case "openForms":
          return adminDiscoverOpenForms(document3, window3);
        case "batchDialog":
          return adminDiscoverBatchDialog(document3);
        case "recurrenceDialog":
          return adminDiscoverRecurrenceDialog(document3);
        case "filterDialog":
          return adminDiscoverFilterDialog(document3);
        case "formTabs":
          return adminDiscoverTabs(document3);
        case "activeTab":
          return adminDiscoverActiveTab(document3);
        case "actionPaneTabs":
          return adminDiscoverActionPaneTabs(document3);
        case "formInputs":
          return adminDiscoverFormInputs(document3, formNameParam);
        case "generateSteps":
          return adminGenerateStepsForTab(document3);
        case "gridState":
          return inspectGridState();
        default:
          throw new Error("Unknown inspection type: " + inspectionType);
      }
    }
    function getMainForm(document3) {
      const forms = document3.querySelectorAll("[data-dyn-form-name]");
      let mainForm = null;
      forms.forEach((f) => {
        const name = f.getAttribute("data-dyn-form-name");
        if (name !== "DefaultDashboard" && f.offsetParent !== null) {
          mainForm = f;
        }
      });
      return mainForm;
    }
    function adminDiscoverOpenForms(document3, window3) {
      const results = {
        currentUrl: {
          full: window3.location.href,
          menuItem: new URLSearchParams(window3.location.search).get("mi"),
          company: new URLSearchParams(window3.location.search).get("cmp")
        },
        forms: [],
        dialogStack: []
      };
      document3.querySelectorAll("[data-dyn-form-name]").forEach((el) => {
        const formName = el.getAttribute("data-dyn-form-name");
        const isDialog = el.closest(".dialog-container") !== null || formName.includes("Dialog") || formName.includes("Form") || formName === "SysRecurrence" || formName === "SysQueryForm";
        const isVisible = el.offsetParent !== null;
        results.forms.push({ formName, isDialog, isVisible });
        if (isDialog && isVisible) {
          results.dialogStack.push(formName);
        }
      });
      results.dialogStack.reverse();
      return results;
    }
    function adminDiscoverBatchDialog(document3) {
      const results = {
        dialogFound: false,
        formName: null,
        allControls: [],
        inputFields: [],
        checkboxes: [],
        comboboxes: [],
        buttons: [],
        groups: [],
        toggles: []
      };
      const dialogForm = document3.querySelector('[data-dyn-form-name="SysOperationTemplateForm"]') || document3.querySelector('[data-dyn-form-name*="Dialog"]') || document3.querySelector(".dialog-content [data-dyn-form-name]");
      if (!dialogForm)
        return results;
      results.dialogFound = true;
      results.formName = dialogForm.getAttribute("data-dyn-form-name");
      dialogForm.querySelectorAll("[data-dyn-controlname]").forEach((el) => {
        const info = {
          controlName: el.getAttribute("data-dyn-controlname"),
          role: el.getAttribute("data-dyn-role"),
          controlType: el.getAttribute("data-dyn-controltype"),
          label: el.querySelector("label")?.textContent?.trim() || el.getAttribute("aria-label") || el.getAttribute("title")
        };
        results.allControls.push(info);
        const role = (info.role || "").toLowerCase();
        if (role.includes("input") || role === "string" || role === "integer" || role === "real")
          results.inputFields.push(info);
        else if (role.includes("checkbox") || role === "yesno")
          results.checkboxes.push(info);
        else if (role.includes("combobox") || role === "dropdown")
          results.comboboxes.push(info);
        else if (role.includes("button"))
          results.buttons.push(info);
        else if (role === "group")
          results.groups.push(info);
      });
      dialogForm.querySelectorAll('.toggle, [role="switch"], input[type="checkbox"]').forEach((el) => {
        const container = el.closest("[data-dyn-controlname]");
        if (container) {
          results.toggles.push({
            controlName: container.getAttribute("data-dyn-controlname"),
            role: container.getAttribute("data-dyn-role"),
            label: container.querySelector("label")?.textContent?.trim(),
            isChecked: el.checked || el.getAttribute("aria-checked") === "true"
          });
        }
      });
      return results;
    }
    function adminDiscoverRecurrenceDialog(document3) {
      const results = {
        dialogFound: false,
        formName: "SysRecurrence",
        startDateTime: {},
        endOptions: {},
        pattern: {},
        buttons: [],
        allControls: []
      };
      const form = document3.querySelector('[data-dyn-form-name="SysRecurrence"]');
      if (!form)
        return results;
      results.dialogFound = true;
      form.querySelectorAll("[data-dyn-controlname]").forEach((el) => {
        const controlName = el.getAttribute("data-dyn-controlname");
        const role = el.getAttribute("data-dyn-role");
        const label = el.querySelector("label")?.textContent?.trim() || el.getAttribute("aria-label");
        const info = { controlName, role, label };
        results.allControls.push(info);
        const nameLower = (controlName || "").toLowerCase();
        if (nameLower === "startdate")
          results.startDateTime.startDate = info;
        else if (nameLower === "starttime")
          results.startDateTime.startTime = info;
        else if (nameLower === "timezone")
          results.startDateTime.timezone = info;
        else if (nameLower === "enddateint")
          results.endOptions.count = info;
        else if (nameLower === "enddatedate")
          results.endOptions.endDate = info;
        else if (nameLower === "patternunit")
          results.pattern.unit = info;
        else if (role === "CommandButton")
          results.buttons.push(info);
      });
      return results;
    }
    function adminDiscoverFilterDialog(document3) {
      const results = {
        dialogFound: false,
        formName: "SysQueryForm",
        tabs: [],
        gridInfo: {},
        savedQueries: null,
        buttons: [],
        checkboxes: [],
        allControls: []
      };
      const queryForm = document3.querySelector('[data-dyn-form-name="SysQueryForm"]');
      if (!queryForm)
        return results;
      results.dialogFound = true;
      queryForm.querySelectorAll('[data-dyn-role="PivotItem"]').forEach((el) => {
        results.tabs.push({
          controlName: el.getAttribute("data-dyn-controlname"),
          label: el.textContent?.trim().split("\n")[0],
          isVisible: el.offsetParent !== null
        });
      });
      const grid = queryForm.querySelector('[data-dyn-controlname="RangeGrid"]');
      if (grid) {
        results.gridInfo = { controlName: "RangeGrid", role: grid.getAttribute("data-dyn-role") };
      }
      queryForm.querySelectorAll("[data-dyn-controlname]").forEach((el) => {
        const controlName = el.getAttribute("data-dyn-controlname");
        const role = el.getAttribute("data-dyn-role");
        const label = el.querySelector("label")?.textContent?.trim();
        const info = { controlName, role, label };
        results.allControls.push(info);
        if (controlName === "SavedQueriesBox")
          results.savedQueries = info;
        else if (role === "CommandButton" || role === "Button")
          results.buttons.push(info);
        else if (role === "CheckBox")
          results.checkboxes.push(info);
      });
      return results;
    }
    function adminDiscoverTabs(document3) {
      const results = { formName: null, activeTab: null, tabs: [] };
      const mainForm = getMainForm(document3);
      if (!mainForm)
        return results;
      results.formName = mainForm.getAttribute("data-dyn-form-name");
      mainForm.querySelectorAll('[data-dyn-role="PivotItem"]').forEach((el) => {
        const controlName = el.getAttribute("data-dyn-controlname");
        const isActive = el.classList.contains("active") || el.getAttribute("aria-selected") === "true";
        const headerEl = mainForm.querySelector(`[data-dyn-controlname="${controlName}_header"]`);
        const label = headerEl?.textContent?.trim() || el.querySelector(".pivot-link-text")?.textContent?.trim() || el.textContent?.trim().split("\n")[0];
        results.tabs.push({ controlName, label: (label || "").substring(0, 50), isActive });
        if (isActive)
          results.activeTab = controlName;
      });
      return results;
    }
    function adminDiscoverActiveTab(document3) {
      const results = {
        formName: null,
        activeTab: null,
        sections: [],
        fields: { inputs: [], checkboxes: [], comboboxes: [], integers: [], dates: [] },
        summary: {}
      };
      const mainForm = getMainForm(document3);
      if (!mainForm)
        return results;
      results.formName = mainForm.getAttribute("data-dyn-form-name");
      const activeTabEl = mainForm.querySelector('[data-dyn-role="PivotItem"].active, [data-dyn-role="PivotItem"][aria-selected="true"]');
      if (activeTabEl)
        results.activeTab = activeTabEl.getAttribute("data-dyn-controlname");
      mainForm.querySelectorAll('[data-dyn-role="SectionPage"], [data-dyn-role="TabPage"]').forEach((el) => {
        if (el.offsetParent === null)
          return;
        const controlName = el.getAttribute("data-dyn-controlname");
        if (!controlName || /^\d+$/.test(controlName))
          return;
        const headerEl = el.querySelector('[data-dyn-role="SectionPageHeader"], .section-header');
        const label = headerEl?.textContent?.trim()?.split("\n")[0];
        const isExpanded = !el.classList.contains("collapsed") && el.getAttribute("aria-expanded") !== "false";
        results.sections.push({ controlName, label: (label || "").substring(0, 50), isExpanded });
      });
      mainForm.querySelectorAll("[data-dyn-controlname]").forEach((el) => {
        if (el.offsetParent === null)
          return;
        const controlName = el.getAttribute("data-dyn-controlname");
        const role = el.getAttribute("data-dyn-role");
        const label = el.querySelector("label")?.textContent?.trim() || el.getAttribute("aria-label");
        if (!role || !controlName || /^\d+$/.test(controlName))
          return;
        const info = { controlName, label: (label || "").substring(0, 40) };
        switch (role) {
          case "Input":
          case "String":
            results.fields.inputs.push(info);
            break;
          case "CheckBox":
          case "YesNo":
            results.fields.checkboxes.push(info);
            break;
          case "ComboBox":
          case "DropdownList":
            results.fields.comboboxes.push(info);
            break;
          case "Integer":
          case "Real":
            results.fields.integers.push(info);
            break;
          case "Date":
          case "Time":
            results.fields.dates.push(info);
            break;
        }
      });
      results.summary = {
        sections: results.sections.length,
        inputs: results.fields.inputs.length,
        checkboxes: results.fields.checkboxes.length,
        comboboxes: results.fields.comboboxes.length,
        integers: results.fields.integers.length,
        dates: results.fields.dates.length
      };
      return results;
    }
    function adminDiscoverActionPaneTabs(document3) {
      const results = { formName: null, activeTab: null, tabs: [] };
      const mainForm = getMainForm(document3);
      if (mainForm)
        results.formName = mainForm.getAttribute("data-dyn-form-name");
      document3.querySelectorAll('[role="tab"]').forEach((el) => {
        if (el.closest('.dialog-content, [data-dyn-form-name="SysQueryForm"]'))
          return;
        const controlName = el.getAttribute("data-dyn-controlname");
        const label = el.getAttribute("aria-label") || el.textContent?.trim();
        if (!controlName && !label)
          return;
        const isActive = el.getAttribute("aria-selected") === "true" || el.classList.contains("active");
        const tabInfo = { controlName: controlName || (label || "").replace(/\s+/g, ""), label, isActive };
        if (!results.tabs.some((t) => t.controlName === tabInfo.controlName)) {
          results.tabs.push(tabInfo);
          if (isActive)
            results.activeTab = tabInfo.controlName;
        }
      });
      document3.querySelectorAll('[role="tablist"]').forEach((tablist) => {
        if (tablist.closest(".dialog-content"))
          return;
        tablist.querySelectorAll('[role="tab"], button, [data-dyn-controlname]').forEach((el) => {
          const controlName = el.getAttribute("data-dyn-controlname");
          const label = el.getAttribute("aria-label") || el.textContent?.trim();
          if (!controlName && !label)
            return;
          if (results.tabs.some((t) => t.controlName === (controlName || label)))
            return;
          const isActive = el.getAttribute("aria-selected") === "true" || el.classList.contains("active");
          const tabInfo = { controlName: controlName || label, label, isActive };
          results.tabs.push(tabInfo);
          if (isActive)
            results.activeTab = tabInfo.controlName;
        });
      });
      return results;
    }
    function adminDiscoverFormInputs(document3, formName) {
      const form = formName ? document3.querySelector(`[data-dyn-form-name="${formName}"]`) : document3.querySelector("[data-dyn-form-name]:last-of-type");
      if (!form)
        return null;
      const actualFormName = form.getAttribute("data-dyn-form-name");
      const results = {
        formName: actualFormName,
        inputs: [],
        checkboxes: [],
        comboboxes: [],
        radioButtons: [],
        dateFields: [],
        timeFields: [],
        integerFields: [],
        stringFields: []
      };
      form.querySelectorAll("[data-dyn-controlname]").forEach((el) => {
        const role = el.getAttribute("data-dyn-role");
        const controlName = el.getAttribute("data-dyn-controlname");
        const label = el.querySelector("label")?.textContent?.trim() || el.getAttribute("aria-label") || el.getAttribute("title");
        if (!role)
          return;
        const info = { controlName, role, label };
        results.inputs.push(info);
        switch (role) {
          case "CheckBox":
          case "YesNo":
            results.checkboxes.push(info);
            break;
          case "ComboBox":
          case "DropdownList":
            results.comboboxes.push(info);
            break;
          case "RadioButton":
            results.radioButtons.push(info);
            break;
          case "Date":
            results.dateFields.push(info);
            break;
          case "Time":
            results.timeFields.push(info);
            break;
          case "Integer":
          case "Real":
            results.integerFields.push(info);
            break;
          case "String":
          case "Input":
            results.stringFields.push(info);
            break;
        }
      });
      return results;
    }
    function adminDiscoverEverything(document3, window3) {
      const results = {
        url: {
          full: window3.location.href,
          menuItem: new URLSearchParams(window3.location.search).get("mi"),
          company: new URLSearchParams(window3.location.search).get("cmp")
        },
        forms: [],
        byForm: {}
      };
      document3.querySelectorAll("[data-dyn-form-name]").forEach((formEl) => {
        const formName = formEl.getAttribute("data-dyn-form-name");
        const isVisible = formEl.offsetParent !== null;
        results.forms.push({ formName, isVisible });
        if (!isVisible)
          return;
        const formData = { tabs: [], sections: [], buttons: [], inputs: [], grids: [] };
        formEl.querySelectorAll('[data-dyn-role="PivotItem"]').forEach((el) => {
          formData.tabs.push({
            controlName: el.getAttribute("data-dyn-controlname"),
            label: el.textContent?.trim().split("\n")[0]
          });
        });
        formEl.querySelectorAll('[data-dyn-role="SectionPage"], [data-dyn-role="Group"]').forEach((el) => {
          const controlName = el.getAttribute("data-dyn-controlname");
          if (controlName && !/^\d+$/.test(controlName)) {
            formData.sections.push({
              controlName,
              label: el.querySelector("label, .section-header")?.textContent?.trim()
            });
          }
        });
        formEl.querySelectorAll('[data-dyn-role*="Button"]').forEach((el) => {
          const controlName = el.getAttribute("data-dyn-controlname");
          if (controlName && !/^\d+$/.test(controlName) && !controlName.includes("Clear")) {
            formData.buttons.push({
              controlName,
              role: el.getAttribute("data-dyn-role"),
              label: el.textContent?.trim().replace(/\s+/g, " ").substring(0, 50)
            });
          }
        });
        const inputRoles = ["Input", "String", "Integer", "Real", "Date", "Time", "CheckBox", "YesNo", "ComboBox", "RadioButton"];
        inputRoles.forEach((role) => {
          formEl.querySelectorAll(`[data-dyn-role="${role}"]`).forEach((el) => {
            const controlName = el.getAttribute("data-dyn-controlname");
            if (controlName) {
              formData.inputs.push({
                controlName,
                role,
                label: el.querySelector("label")?.textContent?.trim()
              });
            }
          });
        });
        formEl.querySelectorAll('[data-dyn-role="Grid"], [data-dyn-role="ReactList"]').forEach((el) => {
          formData.grids.push({
            controlName: el.getAttribute("data-dyn-controlname"),
            role: el.getAttribute("data-dyn-role")
          });
        });
        results.byForm[formName] = formData;
      });
      return results;
    }
    function adminGenerateStepsForTab(document3) {
      const tabData = adminDiscoverActiveTab(document3);
      if (!tabData.activeTab)
        return { activeTab: null, steps: [] };
      const steps = [];
      steps.push({ type: "tab-navigate", controlName: tabData.activeTab, displayText: `Switch to ${tabData.activeTab} tab`, value: "" });
      tabData.fields.inputs.forEach((f) => {
        steps.push({ type: "input", controlName: f.controlName, value: "", displayText: f.label || f.controlName });
      });
      tabData.fields.checkboxes.forEach((f) => {
        steps.push({ type: "checkbox", controlName: f.controlName, value: "true", displayText: f.label || f.controlName });
      });
      tabData.fields.comboboxes.forEach((f) => {
        steps.push({ type: "select", controlName: f.controlName, value: "", displayText: f.label || f.controlName });
      });
      tabData.fields.integers.forEach((f) => {
        steps.push({ type: "input", controlName: f.controlName, value: "", displayText: f.label || f.controlName });
      });
      tabData.fields.dates.forEach((f) => {
        steps.push({ type: "input", controlName: f.controlName, value: "", displayText: f.label || f.controlName });
      });
      return { activeTab: tabData.activeTab, steps };
    }
    return { started: true };
  }
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    startInjected({ windowObj: window, documentObj: document });
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luamVjdGVkL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb2dnaW5nLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9hc3luYy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvdGV4dC5qcyIsICJzcmMvaW5qZWN0ZWQvcnVudGltZS9lbmdpbmUtdXRpbHMuanMiLCAic3JjL2luamVjdGVkL3J1bnRpbWUvY29uZGl0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvcnVudGltZS90aW1pbmcuanMiLCAic3JjL2luamVjdGVkL3V0aWxzL2RvbS5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvbG9va3VwLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9jb21ib2JveC5qcyIsICJzcmMvaW5qZWN0ZWQvc3RlcHMvYWN0aW9uLWhlbHBlcnMuanMiLCAic3JjL2luamVjdGVkL3N0ZXBzL2FjdGlvbnMuanMiLCAic3JjL2luamVjdGVkL2luZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBEMzY1Rk8gRWxlbWVudCBJbnNwZWN0b3IgYW5kIERpc2NvdmVyeSBNb2R1bGVcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEQzNjVJbnNwZWN0b3Ige1xyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5pc0luc3BlY3RpbmcgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQgPSBudWxsO1xyXG4gICAgICAgIHRoaXMub3ZlcmxheSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHRoZSBmb3JtIG5hbWUgdGhhdCBjb250YWlucyBhbiBlbGVtZW50XHJcbiAgICBnZXRFbGVtZW50Rm9ybU5hbWUoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIExvb2sgZm9yIHRoZSBjbG9zZXN0IGZvcm0gY29udGFpbmVyXHJcbiAgICAgICAgY29uc3QgZm9ybUNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLWZvcm0tbmFtZV0nKTtcclxuICAgICAgICBpZiAoZm9ybUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICByZXR1cm4gZm9ybUNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCBmb3JtIHZpYSBkYXRhLWR5bi1jb250cm9sbmFtZSBvbiBhIGZvcm0tbGV2ZWwgY29udGFpbmVyXHJcbiAgICAgICAgY29uc3QgZm9ybUVsZW1lbnQgPSBlbGVtZW50LmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiRm9ybVwiXScpO1xyXG4gICAgICAgIGlmIChmb3JtRWxlbWVudCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZm9ybUVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8IGZvcm1FbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIHRoZSB3b3Jrc3BhY2Ugb3IgcGFnZSBjb250YWluZXJcclxuICAgICAgICBjb25zdCB3b3Jrc3BhY2UgPSBlbGVtZW50LmNsb3Nlc3QoJy53b3Jrc3BhY2UtY29udGVudCwgLndvcmtzcGFjZSwgW2RhdGEtZHluLXJvbGU9XCJXb3Jrc3BhY2VcIl0nKTtcclxuICAgICAgICBpZiAod29ya3NwYWNlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHdvcmtzcGFjZU5hbWUgPSB3b3Jrc3BhY2UuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAod29ya3NwYWNlTmFtZSkgcmV0dXJuIHdvcmtzcGFjZU5hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBkaWFsb2cvbW9kYWwgY29udGV4dFxyXG4gICAgICAgIGNvbnN0IGRpYWxvZyA9IGVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyLCAubW9kYWwtY29udGVudCcpO1xyXG4gICAgICAgIGlmIChkaWFsb2cpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhbG9nTmFtZSA9IGRpYWxvZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaWFsb2cucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZV0nKT8uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGRpYWxvZ05hbWUpIHJldHVybiBkaWFsb2dOYW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCB0aGUgcm9vdCBmb3JtIGJ5IHdhbGtpbmcgdXAgdGhlIERPTVxyXG4gICAgICAgIGxldCBjdXJyZW50ID0gZWxlbWVudDtcclxuICAgICAgICB3aGlsZSAoY3VycmVudCAmJiBjdXJyZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKGN1cnJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdGb3JtJyA/IGN1cnJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIDogbnVsbCk7XHJcbiAgICAgICAgICAgIGlmIChmb3JtTmFtZSkgcmV0dXJuIGZvcm1OYW1lO1xyXG4gICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gJ1Vua25vd24nO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCB0aGUgYWN0aXZlL2ZvY3VzZWQgZm9ybSBuYW1lXHJcbiAgICBnZXRBY3RpdmVGb3JtTmFtZSgpIHtcclxuICAgICAgICAvLyBDaGVjayBmb3IgYWN0aXZlIGRpYWxvZyBmaXJzdCAoY2hpbGQgZm9ybXMgYXJlIHR5cGljYWxseSBkaWFsb2dzKVxyXG4gICAgICAgIGNvbnN0IGFjdGl2ZURpYWxvZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1yb2xlPVwiRGlhbG9nXCJdOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSksIC5kaWFsb2ctY29udGFpbmVyOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknKTtcclxuICAgICAgICBpZiAoYWN0aXZlRGlhbG9nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpYWxvZ0Zvcm0gPSBhY3RpdmVEaWFsb2cucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZV0nKTtcclxuICAgICAgICAgICAgaWYgKGRpYWxvZ0Zvcm0pIHJldHVybiBkaWFsb2dGb3JtLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgICAgIHJldHVybiBhY3RpdmVEaWFsb2cuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgZm9jdXNlZCBlbGVtZW50IGFuZCBnZXQgaXRzIGZvcm1cclxuICAgICAgICBjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcclxuICAgICAgICBpZiAoYWN0aXZlRWxlbWVudCAmJiBhY3RpdmVFbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoYWN0aXZlRWxlbWVudCk7XHJcbiAgICAgICAgICAgIGlmIChmb3JtTmFtZSAmJiBmb3JtTmFtZSAhPT0gJ1Vua25vd24nKSByZXR1cm4gZm9ybU5hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIExvb2sgZm9yIHRoZSB0b3Btb3N0L2FjdGl2ZSBmb3JtIHNlY3Rpb25cclxuICAgICAgICBjb25zdCB2aXNpYmxlRm9ybXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgIGlmICh2aXNpYmxlRm9ybXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAvLyBSZXR1cm4gdGhlIGxhc3Qgb25lICh0eXBpY2FsbHkgdGhlIG1vc3QgcmVjZW50bHkgb3BlbmVkL3RvcG1vc3QpXHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSB2aXNpYmxlRm9ybXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzRWxlbWVudFZpc2libGUodmlzaWJsZUZvcm1zW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2aXNpYmxlRm9ybXNbaV0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXNjb3ZlciBhbGwgaW50ZXJhY3RpdmUgZWxlbWVudHMgb24gdGhlIHBhZ2VcclxuICAgIGRpc2NvdmVyRWxlbWVudHMoYWN0aXZlRm9ybU9ubHkgPSBmYWxzZSkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gW107XHJcbiAgICAgICAgY29uc3QgYWN0aXZlRm9ybSA9IGFjdGl2ZUZvcm1Pbmx5ID8gdGhpcy5nZXRBY3RpdmVGb3JtTmFtZSgpIDogbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIGFsbCBidXR0b25zXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJCdXR0b25cIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tbWFuZEJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJNZW51SXRlbUJ1dHRvblwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdGhpcy5nZXRFbGVtZW50VGV4dChlbCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHZpc2libGUgPSB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnYnV0dG9uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiB0ZXh0LFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdmlzaWJsZSxcclxuICAgICAgICAgICAgICAgIGFyaWFMYWJlbDogZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGlucHV0IGZpZWxkcyAoZXhwYW5kZWQgdG8gY2F0Y2ggbW9yZSBmaWVsZCB0eXBlcylcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIklucHV0XCJdLCBbZGF0YS1keW4tcm9sZT1cIk11bHRpbGluZUlucHV0XCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbWJvQm94XCJdLCBbZGF0YS1keW4tcm9sZT1cIlJlZmVyZW5jZUdyb3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIkxvb2t1cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJTZWdtZW50ZWRFbnRyeVwiXSwgaW5wdXRbZGF0YS1keW4tY29udHJvbG5hbWVdLCBpbnB1dFtyb2xlPVwidGV4dGJveFwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICAvLyBHZXQgY29udHJvbCBuYW1lIGZyb20gZWxlbWVudCBvciBwYXJlbnRcclxuICAgICAgICAgICAgbGV0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBsZXQgdGFyZ2V0RWxlbWVudCA9IGVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gSWYgbm90IGZvdW5kLCBjaGVjayBwYXJlbnQgZWxlbWVudCAoY29tbW9uIGZvciBTZWdtZW50ZWRFbnRyeSBmaWVsZHMgbGlrZSBBY2NvdW50KVxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUgPSBwYXJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEVsZW1lbnQgPSBwYXJlbnQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBhZGRlZCAoYXZvaWQgZHVwbGljYXRlcylcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjb25zdCBmaWVsZEluZm8gPSB0aGlzLmRldGVjdEZpZWxkVHlwZSh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2lucHV0JyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBsYWJlbCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZSh0YXJnZXRFbGVtZW50KSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRJbmZvLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiB0YXJnZXRFbGVtZW50XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGFsbCBjaGVja2JveGVzL3RvZ2dsZXNcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkNoZWNrQm94XCJdLCBpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl1bZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGxldCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgbGV0IHRhcmdldEVsZW1lbnQgPSBlbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIENoZWNrIHBhcmVudCBpZiBub3QgZm91bmRcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lID0gcGFyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRFbGVtZW50ID0gcGFyZW50O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldEVsZW1lbnRMYWJlbCh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgY29uc3QgY2hlY2tib3ggPSB0YXJnZXRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpIHx8IHRhcmdldEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzQ2hlY2tlZCA9IGNoZWNrYm94LmNoZWNrZWQgfHwgY2hlY2tib3guZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnY2hlY2tib3gnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKHRhcmdldEVsZW1lbnQpLFxyXG4gICAgICAgICAgICAgICAgY2hlY2tlZDogaXNDaGVja2VkLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiB0YXJnZXRFbGVtZW50XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGFsbCByYWRpbyBidXR0b24gZ3JvdXBzXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiUmFkaW9CdXR0b25cIl0sIFtyb2xlPVwicmFkaW9ncm91cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJGcmFtZU9wdGlvbkJ1dHRvblwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldEVsZW1lbnRMYWJlbChlbCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkUmFkaW8gPSBlbC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl06Y2hlY2tlZCwgW3JvbGU9XCJyYWRpb1wiXVthcmlhLWNoZWNrZWQ9XCJ0cnVlXCJdJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHNlbGVjdGVkUmFkaW8/LnZhbHVlIHx8IHNlbGVjdGVkUmFkaW8/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3JhZGlvJyxcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXG4gICAgICAgICAgICAgICAgY3VycmVudFZhbHVlOiBjdXJyZW50VmFsdWUsXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRmluZCBhY3Rpb24gcGFuZSB0YWJzIChBcHBCYXIgdGFicylcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJBcHBCYXJUYWJcIl0sIC5hcHBCYXJUYWIsIFtyb2xlPVwidGFiXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICAvLyBTa2lwIHRhYnMgaW5zaWRlIGRpYWxvZ3MvZmx5b3V0c1xuICAgICAgICAgICAgaWYgKGVsLmNsb3Nlc3QoJy5kaWFsb2ctY29udGVudCwgW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyLCAuZmx5b3V0LWNvbnRhaW5lciwgW3JvbGU9XCJkaWFsb2dcIl0nKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdGhpcy5nZXRFbGVtZW50VGV4dChlbCk7XG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHxcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpIHx8XG4gICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWxlY3RlZCcpO1xuXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnYWN0aW9uLXBhbmUtdGFiJyxcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRleHQsXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcbiAgICAgICAgICAgICAgICBpc0FjdGl2ZTogaXNBY3RpdmUsXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRmluZCBhbGwgdHJhZGl0aW9uYWwgRDM2NSBncmlkcy90YWJsZXNcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRoaXMuZ2V0RWxlbWVudExhYmVsKGVsKSB8fCAnR3JpZCcsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIERpc2NvdmVyIGdyaWQgY29sdW1ucyBmb3IgaW5wdXRcclxuICAgICAgICAgICAgdGhpcy5kaXNjb3ZlckdyaWRDb2x1bW5zKGVsLCBjb250cm9sTmFtZSwgZm9ybU5hbWUsIGVsZW1lbnRzKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcyAoLnJlYWN0R3JpZClcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmVhY3RHcmlkJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogJ1JlYWN0IEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiAnLnJlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBleHBhbmRhYmxlIHNlY3Rpb25zIChGYXN0VGFicywgR3JvdXBzLCBTZWN0aW9uUGFnZXMpXHJcbiAgICAgICAgLy8gVGhlc2UgYXJlIGNvbGxhcHNpYmxlIHNlY3Rpb25zIGluIEQzNjUgZGlhbG9ncyBhbmQgZm9ybXNcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyb3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlXCJdLCBbZGF0YS1keW4tcm9sZT1cIlRhYlBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiRmFzdFRhYlwiXSwgLnNlY3Rpb24tcGFnZSwgLmZhc3R0YWInKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBhZGRlZFxyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGFjdHVhbGx5IGFuIGV4cGFuZGFibGUgc2VjdGlvblxyXG4gICAgICAgICAgICAvLyBMb29rIGZvciBoZWFkZXIgZWxlbWVudHMgb3IgYXJpYS1leHBhbmRlZCBhdHRyaWJ1dGVcclxuICAgICAgICAgICAgY29uc3QgaGFzSGVhZGVyID0gZWwucXVlcnlTZWxlY3RvcignLnNlY3Rpb24taGVhZGVyLCAuZ3JvdXAtaGVhZGVyLCBbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdLCAuc2VjdGlvbi1wYWdlLWNhcHRpb24sIGJ1dHRvblthcmlhLWV4cGFuZGVkXScpO1xyXG4gICAgICAgICAgICBjb25zdCBpc0V4cGFuZGFibGUgPSBlbC5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNpYmxlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ3NlY3Rpb24tcGFnZScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzSGVhZGVyICE9PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdHcm91cCcgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ1NlY3Rpb25QYWdlJztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghaXNFeHBhbmRhYmxlKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgY3VycmVudCBleHBhbmRlZCBzdGF0ZVxyXG4gICAgICAgICAgICBjb25zdCBpc0V4cGFuZGVkID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIWVsLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RXhwYW5kYWJsZVNlY3Rpb25MYWJlbChlbCkgfHwgY29udHJvbE5hbWU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdzZWN0aW9uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBsYWJlbCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXHJcbiAgICAgICAgICAgICAgICBpc0V4cGFuZGVkOiBpc0V4cGFuZGVkLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIERpc2NvdmVyIFJlYWN0IGdyaWQgY29sdW1ucyBmb3IgaW5wdXRcclxuICAgICAgICAgICAgdGhpcy5kaXNjb3ZlclJlYWN0R3JpZENvbHVtbnMoZWwsIGZvcm1OYW1lLCBlbGVtZW50cyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50cztcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgcmVhZGFibGUgdGV4dCBmcm9tIGFuIGVsZW1lbnRcclxuICAgIGdldEVsZW1lbnRUZXh0KGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbCBmaXJzdFxyXG4gICAgICAgIGxldCB0ZXh0ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcclxuICAgICAgICBpZiAodGV4dCAmJiB0ZXh0LnRyaW0oKSkgcmV0dXJuIHRleHQudHJpbSgpO1xyXG5cclxuICAgICAgICAvLyBUcnkgdGV4dCBjb250ZW50IChleGNsdWRpbmcgY2hpbGQgYnV0dG9ucy9pY29ucylcclxuICAgICAgICBjb25zdCBjbG9uZSA9IGVsZW1lbnQuY2xvbmVOb2RlKHRydWUpO1xyXG4gICAgICAgIGNsb25lLnF1ZXJ5U2VsZWN0b3JBbGwoJy5idXR0b24taWNvbiwgLmZhLCAuZ2x5cGhpY29uJykuZm9yRWFjaChpY29uID0+IGljb24ucmVtb3ZlKCkpO1xyXG4gICAgICAgIHRleHQgPSBjbG9uZS50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuXHJcbiAgICAgICAgLy8gVHJ5IHRpdGxlIGF0dHJpYnV0ZVxyXG4gICAgICAgIHRleHQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgndGl0bGUnKTtcclxuICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNvbnRyb2wgbmFtZVxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBpbnB1dCBmaWVsZHNcclxuICAgIGdldEVsZW1lbnRMYWJlbChlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IGFyaWEtbGFiZWxcclxuICAgICAgICBsZXQgbGFiZWwgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmIChsYWJlbCAmJiBsYWJlbC50cmltKCkpIHJldHVybiBsYWJlbC50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSBhc3NvY2lhdGVkIGxhYmVsIGVsZW1lbnRcclxuICAgICAgICBjb25zdCBsYWJlbEVsZW1lbnQgPSBlbGVtZW50LmNsb3Nlc3QoJy5keW4tbGFiZWwtd3JhcHBlcicpPy5xdWVyeVNlbGVjdG9yKCcuZHluLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGxhYmVsRWxlbWVudCkgcmV0dXJuIGxhYmVsRWxlbWVudC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG5cclxuICAgICAgICAvLyBUcnkgcGFyZW50IGNvbnRhaW5lciBsYWJlbFxyXG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAnKTtcclxuICAgICAgICBpZiAoY29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lckxhYmVsID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk7XHJcbiAgICAgICAgICAgIGlmIChjb250YWluZXJMYWJlbCkgcmV0dXJuIGNvbnRhaW5lckxhYmVsLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGYWxsYmFjayB0byBjb250cm9sIG5hbWVcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJ1Vua25vd24nO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGdyaWQgY29sdW1ucyBmb3IgaW5wdXQvZWRpdGluZ1xyXG4gICAgZGlzY292ZXJHcmlkQ29sdW1ucyhncmlkRWxlbWVudCwgZ3JpZE5hbWUsIGZvcm1OYW1lLCBlbGVtZW50cykge1xyXG4gICAgICAgIGNvbnN0IGFkZGVkQ29sdW1ucyA9IG5ldyBTZXQoKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXRob2QgMTogRmluZCBjb2x1bW4gaGVhZGVyc1xyXG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0sIC5keW4taGVhZGVyQ2VsbCcpO1xyXG4gICAgICAgIGhlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gaGVhZGVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gaGVhZGVyLnRleHRDb250ZW50Py50cmltKCkgfHwgaGVhZGVyLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGAke2Rpc3BsYXlUZXh0fWAsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogZ3JpZE5hbWUsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoaGVhZGVyKSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0hlYWRlcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGhlYWRlclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXRob2QgMjogRmluZCBjZWxscyB3aXRoIGlucHV0cyBpbiB0aGUgYWN0aXZlL3NlbGVjdGVkIHJvd1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1zZWxlY3RlZD1cInRydWVcIl0sIFthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmR5bi1zZWxlY3RlZFJvdycpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tcm9sZT1cIlJvd1wiXTpmaXJzdC1vZi10eXBlLCBbcm9sZT1cInJvd1wiXTpub3QoW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0pOmZpcnN0LW9mLXR5cGUnKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgIC8vIEZpbmQgYWxsIGlucHV0IGZpZWxkcyBpbiB0aGUgcm93XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYWN0aXZlUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgY2VsbHMuZm9yRWFjaChjZWxsID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBjZWxsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBjZWxsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaGFzSW5wdXQgPSBjZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBzZWxlY3QsIHRleHRhcmVhJykgIT09IG51bGwgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydJbnB1dCcsICdDb21ib0JveCcsICdMb29rdXAnLCAnUmVmZXJlbmNlR3JvdXAnLCAnU2VnbWVudGVkRW50cnknXS5pbmNsdWRlcyhyb2xlKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGhhc0lucHV0IHx8IHJvbGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoY2VsbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGNlbGwpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IGhhc0lucHV0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogY2VsbFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWV0aG9kIDM6IEZpbmQgYW55IGVkaXRhYmxlIGlucHV0cyBpbnNpZGUgdGhlIGdyaWQgYm9keVxyXG4gICAgICAgIGNvbnN0IGdyaWRJbnB1dHMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIklucHV0XCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbWJvQm94XCJdLCBbZGF0YS1keW4tcm9sZT1cIkxvb2t1cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJSZWZlcmVuY2VHcm91cFwiXScpO1xyXG4gICAgICAgIGdyaWRJbnB1dHMuZm9yRWFjaChpbnB1dCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IHRoaXMuZ2V0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCB0aGlzLmdldEVsZW1lbnRMYWJlbChpbnB1dCkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoaW5wdXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogZ3JpZE5hbWUsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoaW5wdXQpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgIHJvbGU6IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaW5wdXRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEdldCBsYWJlbCBmb3IgYSBncmlkIGNvbHVtbiBieSBsb29raW5nIGF0IHRoZSBoZWFkZXJcclxuICAgIGdldEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sdW1uQ29udHJvbE5hbWUpIHtcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCB0aGUgaGVhZGVyIGNlbGwgZm9yIHRoaXMgY29sdW1uXHJcbiAgICAgICAgY29uc3QgaGVhZGVyID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl1bZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbHVtbkNvbnRyb2xOYW1lfVwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl1bZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbHVtbkNvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIGhlYWRlciBieSBwYXJ0aWFsIG1hdGNoIChjb2x1bW4gbmFtZSBtaWdodCBiZSBkaWZmZXJlbnQgaW4gaGVhZGVyIHZzIGNlbGwpXHJcbiAgICAgICAgY29uc3QgYWxsSGVhZGVycyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlck5hbWUgPSBoLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGhlYWRlck5hbWUgJiYgKGNvbHVtbkNvbnRyb2xOYW1lLmluY2x1ZGVzKGhlYWRlck5hbWUpIHx8IGhlYWRlck5hbWUuaW5jbHVkZXMoY29sdW1uQ29udHJvbE5hbWUpKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IGgudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXNjb3ZlciBjb2x1bW5zIGluIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzXHJcbiAgICBkaXNjb3ZlclJlYWN0R3JpZENvbHVtbnMoZ3JpZEVsZW1lbnQsIGZvcm1OYW1lLCBlbGVtZW50cykge1xyXG4gICAgICAgIGNvbnN0IGFkZGVkQ29sdW1ucyA9IG5ldyBTZXQoKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBHZXQgY29sdW1uIGhlYWRlcnMgZnJvbSAuZHluLWhlYWRlckNlbGwgZWxlbWVudHNcclxuICAgICAgICBjb25zdCBoZWFkZXJDZWxscyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5maXhlZERhdGFUYWJsZUxheW91dF9oZWFkZXIgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgaGVhZGVyQ2VsbHMuZm9yRWFjaCgoaGVhZGVyLCBjb2xJbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGhlYWRlci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb250cm9sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IGhlYWRlci5xdWVyeVNlbGVjdG9yKCcuZHluLWhlYWRlckNlbGxMYWJlbCcpO1xyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpIHx8IGNvbnRyb2xOYW1lO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgZ3JpZE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgZ3JpZFR5cGU6ICdyZWFjdCcsXHJcbiAgICAgICAgICAgICAgICBjb2x1bW5JbmRleDogY29sSW5kZXgsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoaGVhZGVyKSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgLmR5bi1oZWFkZXJDZWxsW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNIZWFkZXI6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBoZWFkZXJcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWxzbyBsb29rIGZvciBlZGl0YWJsZSBpbnB1dHMgaW5zaWRlIHRoZSBib2R5IHJvd3NcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHksIC5maXhlZERhdGFUYWJsZUxheW91dF9yb3dzQ29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGJvZHlDb250YWluZXIpIHtcclxuICAgICAgICAgICAgLy8gRmluZCBhY3RpdmUvc2VsZWN0ZWQgcm93IGZpcnN0LCBvciBmYWxsYmFjayB0byBmaXJzdCByb3dcclxuICAgICAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4ucHVibGljX2ZpeGVkRGF0YVRhYmxlUm93X21haW4nKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgICAgIC8vIEZpbmQgYWxsIGNlbGxzIHdpdGggZGF0YS1keW4tY29udHJvbG5hbWVcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYWN0aXZlUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgICAgIGNlbGxzLmZvckVhY2goY2VsbCA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm9sZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzSW5wdXQgPSBjZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBzZWxlY3QsIHRleHRhcmVhJykgIT09IG51bGwgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnSW5wdXQnLCAnQ29tYm9Cb3gnLCAnTG9va3VwJywgJ1JlZmVyZW5jZUdyb3VwJywgJ1NlZ21lbnRlZEVudHJ5J10uaW5jbHVkZXMocm9sZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IHRoaXMuZ2V0UmVhY3RHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoY2VsbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyaWROYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZFR5cGU6ICdyZWFjdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShjZWxsKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpc0VkaXRhYmxlOiBoYXNJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZFR5cGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGNlbGxcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgYW55IGVkaXRhYmxlIGlucHV0cyBpbiB0aGUgZ3JpZCBib2R5XHJcbiAgICAgICAgY29uc3QgZ3JpZElucHV0cyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIC5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIC5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCAuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSBbZGF0YS1keW4tcm9sZT1cIlJlZmVyZW5jZUdyb3VwXCJdJyk7XHJcbiAgICAgICAgZ3JpZElucHV0cy5mb3JFYWNoKGlucHV0ID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRSZWFjdEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgdGhpcy5nZXRFbGVtZW50TGFiZWwoaW5wdXQpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGlucHV0KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgZ3JpZE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgZ3JpZFR5cGU6ICdyZWFjdCcsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoaW5wdXQpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgIHJvbGU6IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaW5wdXRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEdldCBsYWJlbCBmb3IgYSBSZWFjdCBncmlkIGNvbHVtbiBieSBsb29raW5nIGF0IHRoZSBoZWFkZXJcclxuICAgIGdldFJlYWN0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2x1bW5Db250cm9sTmFtZSkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIgY2VsbCB3aXRoIG1hdGNoaW5nIGNvbnRyb2xuYW1lXHJcbiAgICAgICAgY29uc3QgaGVhZGVyID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcihgLmR5bi1oZWFkZXJDZWxsW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2x1bW5Db250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoaGVhZGVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gaGVhZGVyLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBQYXJ0aWFsIG1hdGNoXHJcbiAgICAgICAgY29uc3QgYWxsSGVhZGVycyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5keW4taGVhZGVyQ2VsbFtkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGggb2YgYWxsSGVhZGVycykge1xyXG4gICAgICAgICAgICBjb25zdCBoZWFkZXJOYW1lID0gaC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmIChoZWFkZXJOYW1lICYmIChjb2x1bW5Db250cm9sTmFtZS5pbmNsdWRlcyhoZWFkZXJOYW1lKSB8fCBoZWFkZXJOYW1lLmluY2x1ZGVzKGNvbHVtbkNvbnRyb2xOYW1lKSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gaC5xdWVyeVNlbGVjdG9yKCcuZHluLWhlYWRlckNlbGxMYWJlbCcpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGgudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEZXRlY3QgZmllbGQgdHlwZSAoZW51bSwgbG9va3VwLCBmcmVldGV4dCwgZXRjLilcclxuICAgIGRldGVjdEZpZWxkVHlwZShlbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTZWdtZW50ZWRFbnRyeSBmaWVsZHMgKGxpa2UgQWNjb3VudCkgaGF2ZSBzcGVjaWFsIGxvb2t1cFxyXG4gICAgICAgIGlmIChyb2xlID09PSAnU2VnbWVudGVkRW50cnknKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHR5cGU6ICdzZWdtZW50ZWQtbG9va3VwJywgcm9sZTogcm9sZSB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgbG9va3VwIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IGhhc0xvb2t1cEJ1dHRvbiA9IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmaWVsZC1oYXNMb29rdXBCdXR0b24nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubG9va3VwLWJ1dHRvbicpICE9PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50Lm5leHRFbGVtZW50U2libGluZz8uY2xhc3NMaXN0LmNvbnRhaW5zKCdsb29rdXAtYnV0dG9uJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIENvbWJvQm94L0Ryb3Bkb3duXHJcbiAgICAgICAgY29uc3QgaXNDb21ib0JveCA9IHJvbGUgPT09ICdDb21ib0JveCcgfHwgZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbWJvQm94Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIHNlbGVjdCBlbGVtZW50XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdzZWxlY3QnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBNdWx0aWxpbmVJbnB1dCBkZXRlY3Rpb25cclxuICAgICAgICBjb25zdCBpc011bHRpbGluZSA9IHJvbGUgPT09ICdNdWx0aWxpbmVJbnB1dCc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGV0ZWN0IG51bWVyaWMgZmllbGRzXHJcbiAgICAgICAgY29uc3QgaXNOdW1lcmljID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwibnVtYmVyXCJdJykgIT09IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGV0ZWN0IGRhdGUgZmllbGRzXHJcbiAgICAgICAgY29uc3QgaXNEYXRlID0gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2RhdGUtZmllbGQnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImRhdGVcIl0nKSAhPT0gbnVsbDtcclxuXHJcbiAgICAgICAgLy8gQnVpbGQgZmllbGQgdHlwZSBpbmZvXHJcbiAgICAgICAgY29uc3QgZmllbGRJbmZvID0ge1xyXG4gICAgICAgICAgICBjb250cm9sVHlwZTogcm9sZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAndGV4dCdcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBpZiAoaXNNdWx0aWxpbmUpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICd0ZXh0YXJlYSc7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pc011bHRpbGluZSA9IHRydWU7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc0NvbWJvQm94IHx8IHNlbGVjdCkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ2VudW0nO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaXNFbnVtID0gdHJ1ZTtcclxuICAgICAgICAgICAgZmllbGRJbmZvLnZhbHVlcyA9IHRoaXMuZXh0cmFjdEVudW1WYWx1ZXMoZWxlbWVudCwgc2VsZWN0KTtcclxuICAgICAgICB9IGVsc2UgaWYgKGhhc0xvb2t1cEJ1dHRvbikge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ2xvb2t1cCc7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pc0xvb2t1cCA9IHRydWU7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5hbGxvd0ZyZWV0ZXh0ID0gIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdsb29rdXAtb25seScpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnbnVtYmVyJztcclxuICAgICAgICB9IGVsc2UgaWYgKGlzRGF0ZSkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ2RhdGUnO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gR2V0IG1heCBsZW5ndGggaWYgYXZhaWxhYmxlXHJcbiAgICAgICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYScpO1xyXG4gICAgICAgIGlmIChpbnB1dCAmJiBpbnB1dC5tYXhMZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5tYXhMZW5ndGggPSBpbnB1dC5tYXhMZW5ndGg7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZmllbGRJbmZvO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEV4dHJhY3QgZW51bSB2YWx1ZXMgZnJvbSBkcm9wZG93blxyXG4gICAgZXh0cmFjdEVudW1WYWx1ZXMoZWxlbWVudCwgc2VsZWN0RWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdCA9IHNlbGVjdEVsZW1lbnQgfHwgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdzZWxlY3QnKTtcclxuICAgICAgICBpZiAoIXNlbGVjdCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIHJldHVybiBBcnJheS5mcm9tKHNlbGVjdC5vcHRpb25zKVxyXG4gICAgICAgICAgICAuZmlsdGVyKG9wdCA9PiBvcHQudmFsdWUgIT09ICcnKVxyXG4gICAgICAgICAgICAubWFwKG9wdCA9PiAoe1xyXG4gICAgICAgICAgICAgICAgdmFsdWU6IG9wdC52YWx1ZSxcclxuICAgICAgICAgICAgICAgIHRleHQ6IG9wdC50ZXh0LnRyaW0oKVxyXG4gICAgICAgICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBleHBhbmRhYmxlIHNlY3Rpb25zXHJcbiAgICBnZXRFeHBhbmRhYmxlU2VjdGlvbkxhYmVsKGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCB0aGUgaGVhZGVyL2NhcHRpb24gZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGhlYWRlclNlbGVjdG9ycyA9IFtcclxuICAgICAgICAgICAgJy5zZWN0aW9uLXBhZ2UtY2FwdGlvbicsXHJcbiAgICAgICAgICAgICcuc2VjdGlvbi1oZWFkZXInLFxyXG4gICAgICAgICAgICAnLmdyb3VwLWhlYWRlcicsXHJcbiAgICAgICAgICAgICcuZmFzdHRhYi1oZWFkZXInLFxyXG4gICAgICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZUhlYWRlclwiXScsXHJcbiAgICAgICAgICAgICdidXR0b25bYXJpYS1leHBhbmRlZF0gc3BhbicsXHJcbiAgICAgICAgICAgICdidXR0b24gc3BhbicsXHJcbiAgICAgICAgICAgICcuY2FwdGlvbicsXHJcbiAgICAgICAgICAgICdsZWdlbmQnXHJcbiAgICAgICAgXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIGhlYWRlclNlbGVjdG9ycykge1xyXG4gICAgICAgICAgICBjb25zdCBoZWFkZXIgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgICAgICBpZiAoaGVhZGVyKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gaGVhZGVyLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGFyaWEtbGFiZWxcclxuICAgICAgICBjb25zdCBhcmlhTGFiZWwgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmIChhcmlhTGFiZWwpIHJldHVybiBhcmlhTGFiZWw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRoZSBidXR0b24ncyB0ZXh0IGlmIHRoZSBzZWN0aW9uIGhhcyBhIHRvZ2dsZSBidXR0b25cclxuICAgICAgICBjb25zdCB0b2dnbGVCdG4gPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpO1xyXG4gICAgICAgIGlmICh0b2dnbGVCdG4pIHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRvZ2dsZUJ0bi50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dCAmJiB0ZXh0Lmxlbmd0aCA8IDEwMCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGlmIGVsZW1lbnQgaXMgdmlzaWJsZVxyXG4gICAgaXNFbGVtZW50VmlzaWJsZShlbGVtZW50KSB7XHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmIFxyXG4gICAgICAgICAgICAgICB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgICAgICB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU3RhcnQgaW50ZXJhY3RpdmUgZWxlbWVudCBwaWNrZXJcclxuICAgIHN0YXJ0RWxlbWVudFBpY2tlcihjYWxsYmFjaykge1xyXG4gICAgICAgIHRoaXMuaXNJbnNwZWN0aW5nID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnBpY2tlckNhbGxiYWNrID0gY2FsbGJhY2s7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5vdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5LnN0eWxlLmNzc1RleHQgPSBgXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBmaXhlZDtcclxuICAgICAgICAgICAgdG9wOiAwO1xyXG4gICAgICAgICAgICBsZWZ0OiAwO1xyXG4gICAgICAgICAgICB3aWR0aDogMTAwJTtcclxuICAgICAgICAgICAgaGVpZ2h0OiAxMDAlO1xyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDEwMiwgMTI2LCAyMzQsIDAuMSk7XHJcbiAgICAgICAgICAgIHotaW5kZXg6IDk5OTk5ODtcclxuICAgICAgICAgICAgY3Vyc29yOiBjcm9zc2hhaXI7XHJcbiAgICAgICAgYDtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMub3ZlcmxheSk7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBoaWdobGlnaHQgZWxlbWVudFxyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5jc3NUZXh0ID0gYFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XHJcbiAgICAgICAgICAgIGJvcmRlcjogMnB4IHNvbGlkICM2NjdlZWE7XHJcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcclxuICAgICAgICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XHJcbiAgICAgICAgICAgIHotaW5kZXg6IDk5OTk5OTtcclxuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMXMgZWFzZTtcclxuICAgICAgICBgO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5oaWdobGlnaHRFbGVtZW50KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyc1xyXG4gICAgICAgIHRoaXMubW91c2VNb3ZlSGFuZGxlciA9IChlKSA9PiB0aGlzLmhhbmRsZU1vdXNlTW92ZShlKTtcclxuICAgICAgICB0aGlzLmNsaWNrSGFuZGxlciA9IChlKSA9PiB0aGlzLmhhbmRsZUNsaWNrKGUpO1xyXG4gICAgICAgIHRoaXMuZXNjYXBlSGFuZGxlciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHRoaXMuc3RvcEVsZW1lbnRQaWNrZXIoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdXNlTW92ZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5jbGlja0hhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmVzY2FwZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGhhbmRsZU1vdXNlTW92ZShlKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludChlLmNsaWVudFgsIGUuY2xpZW50WSk7XHJcbiAgICAgICAgaWYgKCF0YXJnZXQgfHwgdGFyZ2V0ID09PSB0aGlzLm92ZXJsYXkgfHwgdGFyZ2V0ID09PSB0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gRmluZCBjbG9zZXN0IEQzNjUgY29udHJvbFxyXG4gICAgICAgIGNvbnN0IGNvbnRyb2wgPSB0YXJnZXQuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIGlmICghY29udHJvbCkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5oaWdobGlnaHRFbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBFbnN1cmUgaGlnaGxpZ2h0IGVsZW1lbnQgZXhpc3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGlnaGxpZ2h0IHRoZSBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IGNvbnRyb2wuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS50b3AgPSByZWN0LnRvcCArIHdpbmRvdy5zY3JvbGxZICsgJ3B4JztcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUubGVmdCA9IHJlY3QubGVmdCArIHdpbmRvdy5zY3JvbGxYICsgJ3B4JztcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUud2lkdGggPSByZWN0LndpZHRoICsgJ3B4JztcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gcmVjdC5oZWlnaHQgKyAncHgnO1xyXG5cclxuICAgICAgICAvLyBTaG93IHRvb2x0aXBcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIGNvbnN0IHJvbGUgPSBjb250cm9sLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgYCR7cm9sZX06ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlQ2xpY2soZSkge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG5cclxuICAgICAgICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcclxuICAgICAgICBjb25zdCBjb250cm9sID0gdGFyZ2V0Py5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBjb250cm9sLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgY29uc3Qgcm9sZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGNvbnRyb2wpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZWxlbWVudEluZm8gPSB7XHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRleHQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgaWYgKHJvbGUgPT09ICdJbnB1dCcgfHwgcm9sZSA9PT0gJ011bHRpbGluZUlucHV0JyB8fCByb2xlID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgICAgICAgICBlbGVtZW50SW5mby5maWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjb250cm9sKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5waWNrZXJDYWxsYmFjayhlbGVtZW50SW5mbyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnN0b3BFbGVtZW50UGlja2VyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgc3RvcEVsZW1lbnRQaWNrZXIoKSB7XHJcbiAgICAgICAgdGhpcy5pc0luc3BlY3RpbmcgPSBmYWxzZTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5vdmVybGF5KSB7XHJcbiAgICAgICAgICAgIHRoaXMub3ZlcmxheS5yZW1vdmUoKTtcclxuICAgICAgICAgICAgdGhpcy5vdmVybGF5ID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRoaXMuaGlnaGxpZ2h0RWxlbWVudCkge1xyXG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdXNlTW92ZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5jbGlja0hhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmVzY2FwZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlYXJjaCBlbGVtZW50cyBieSB0ZXh0XHJcbiAgICBmaW5kRWxlbWVudEJ5VGV4dCh0ZXh0LCBlbGVtZW50VHlwZSA9IG51bGwpIHtcclxuICAgICAgICBjb25zdCBlbGVtZW50cyA9IHRoaXMuZGlzY292ZXJFbGVtZW50cygpO1xyXG4gICAgICAgIGNvbnN0IHNlYXJjaFRleHQgPSB0ZXh0LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudHMuZmlsdGVyKGVsID0+IHtcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRUeXBlICYmIGVsLnR5cGUgIT09IGVsZW1lbnRUeXBlKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IGVsLmRpc3BsYXlUZXh0LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFyaWFMYWJlbCA9IChlbC5hcmlhTGFiZWwgfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuY29udHJvbE5hbWUudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBkaXNwbGF5VGV4dC5pbmNsdWRlcyhzZWFyY2hUZXh0KSB8fFxyXG4gICAgICAgICAgICAgICAgICAgYXJpYUxhYmVsLmluY2x1ZGVzKHNlYXJjaFRleHQpIHx8XHJcbiAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZS5pbmNsdWRlcyhzZWFyY2hUZXh0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gRXhwb3J0IGZvciB1c2UgaW4gY29udGVudCBzY3JpcHRcclxuIiwgImV4cG9ydCBmdW5jdGlvbiBzZW5kTG9nKGxldmVsLCBtZXNzYWdlKSB7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfTE9HJyxcbiAgICAgICAgbG9nOiB7IGxldmVsLCBtZXNzYWdlIH1cbiAgICB9LCAnKicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9nU3RlcChtZXNzYWdlKSB7XG4gICAgc2VuZExvZygnaW5mbycsIG1lc3NhZ2UpO1xuICAgIGNvbnNvbGUubG9nKCdbRDM2NSBBdXRvbWF0aW9uXScsIG1lc3NhZ2UpO1xufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBzbGVlcChtcykge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSkge1xuICAgIGNvbnN0IGlzVGV4dEFyZWEgPSBpbnB1dC50YWdOYW1lID09PSAnVEVYVEFSRUEnO1xuICAgIGNvbnN0IGRlc2NyaXB0b3IgPSBpc1RleHRBcmVhXG4gICAgICAgID8gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih3aW5kb3cuSFRNTFRleHRBcmVhRWxlbWVudC5wcm90b3R5cGUsICd2YWx1ZScpXG4gICAgICAgIDogT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih3aW5kb3cuSFRNTElucHV0RWxlbWVudC5wcm90b3R5cGUsICd2YWx1ZScpO1xuXG4gICAgaWYgKGRlc2NyaXB0b3IgJiYgZGVzY3JpcHRvci5zZXQpIHtcbiAgICAgICAgZGVzY3JpcHRvci5zZXQuY2FsbChpbnB1dCwgdmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGlucHV0LnZhbHVlID0gdmFsdWU7XG4gICAgfVxufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVUZXh0KHZhbHVlKSB7XHJcbiAgICByZXR1cm4gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRvTG93ZXJDYXNlKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb2VyY2VCb29sZWFuKHZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHJldHVybiB2YWx1ZTtcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSByZXR1cm4gdmFsdWUgIT09IDAgJiYgIU51bWJlci5pc05hTih2YWx1ZSk7XHJcblxyXG4gICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQodmFsdWUpO1xyXG4gICAgaWYgKHRleHQgPT09ICcnKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgaWYgKFsndHJ1ZScsICcxJywgJ3llcycsICd5JywgJ29uJywgJ2NoZWNrZWQnXS5pbmNsdWRlcyh0ZXh0KSkgcmV0dXJuIHRydWU7XHJcbiAgICBpZiAoWydmYWxzZScsICcwJywgJ25vJywgJ24nLCAnb2ZmJywgJ3VuY2hlY2tlZCddLmluY2x1ZGVzKHRleHQpKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcbiIsICJleHBvcnQgZnVuY3Rpb24gZ2V0V29ya2Zsb3dFcnJvckRlZmF1bHRzKHNldHRpbmdzKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbW9kZTogc2V0dGluZ3M/LmVycm9yRGVmYXVsdE1vZGUgfHwgJ2ZhaWwnLFxuICAgICAgICByZXRyeUNvdW50OiBOdW1iZXIuaXNGaW5pdGUoc2V0dGluZ3M/LmVycm9yRGVmYXVsdFJldHJ5Q291bnQpID8gc2V0dGluZ3MuZXJyb3JEZWZhdWx0UmV0cnlDb3VudCA6IDAsXG4gICAgICAgIHJldHJ5RGVsYXk6IE51bWJlci5pc0Zpbml0ZShzZXR0aW5ncz8uZXJyb3JEZWZhdWx0UmV0cnlEZWxheSkgPyBzZXR0aW5ncy5lcnJvckRlZmF1bHRSZXRyeURlbGF5IDogMTAwMCxcbiAgICAgICAgZ290b0xhYmVsOiBzZXR0aW5ncz8uZXJyb3JEZWZhdWx0R290b0xhYmVsIHx8ICcnXG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0ZXBFcnJvckNvbmZpZyhzdGVwLCBzZXR0aW5ncykge1xuICAgIGNvbnN0IGRlZmF1bHRzID0gZ2V0V29ya2Zsb3dFcnJvckRlZmF1bHRzKHNldHRpbmdzKTtcbiAgICBjb25zdCBtb2RlID0gc3RlcD8ub25FcnJvck1vZGUgJiYgc3RlcC5vbkVycm9yTW9kZSAhPT0gJ2RlZmF1bHQnID8gc3RlcC5vbkVycm9yTW9kZSA6IGRlZmF1bHRzLm1vZGU7XG4gICAgY29uc3QgcmV0cnlDb3VudCA9IE51bWJlci5pc0Zpbml0ZShzdGVwPy5vbkVycm9yUmV0cnlDb3VudCkgPyBzdGVwLm9uRXJyb3JSZXRyeUNvdW50IDogZGVmYXVsdHMucmV0cnlDb3VudDtcbiAgICBjb25zdCByZXRyeURlbGF5ID0gTnVtYmVyLmlzRmluaXRlKHN0ZXA/Lm9uRXJyb3JSZXRyeURlbGF5KSA/IHN0ZXAub25FcnJvclJldHJ5RGVsYXkgOiBkZWZhdWx0cy5yZXRyeURlbGF5O1xuICAgIGNvbnN0IGdvdG9MYWJlbCA9IHN0ZXA/Lm9uRXJyb3JHb3RvTGFiZWwgfHwgZGVmYXVsdHMuZ290b0xhYmVsO1xuICAgIHJldHVybiB7IG1vZGUsIHJldHJ5Q291bnQsIHJldHJ5RGVsYXksIGdvdG9MYWJlbCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZExvb3BQYWlycyhzdGVwc0xpc3QsIG9uSXNzdWUgPSAoKSA9PiB7fSkge1xuICAgIGNvbnN0IHN0YWNrID0gW107XG4gICAgY29uc3QgcGFpcnMgPSBbXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RlcHNMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdGVwc0xpc3RbaV07XG4gICAgICAgIGlmICghcyB8fCAhcy50eXBlKSBjb250aW51ZTtcblxuICAgICAgICBpZiAocy50eXBlID09PSAnbG9vcC1zdGFydCcpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goeyBzdGFydEluZGV4OiBpLCBpZDogcy5pZCB9KTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHMudHlwZSAhPT0gJ2xvb3AtZW5kJykgY29udGludWU7XG5cbiAgICAgICAgbGV0IG1hdGNoZWQgPSBudWxsO1xuICAgICAgICBpZiAocy5sb29wUmVmKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBqID0gc3RhY2subGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhY2tbal0uaWQgPT09IHMubG9vcFJlZikge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVkID0geyBzdGFydEluZGV4OiBzdGFja1tqXS5zdGFydEluZGV4LCBlbmRJbmRleDogaSB9O1xuICAgICAgICAgICAgICAgICAgICBzdGFjay5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbWF0Y2hlZCkge1xuICAgICAgICAgICAgY29uc3QgbGFzdCA9IHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgaWYgKGxhc3QpIHtcbiAgICAgICAgICAgICAgICBtYXRjaGVkID0geyBzdGFydEluZGV4OiBsYXN0LnN0YXJ0SW5kZXgsIGVuZEluZGV4OiBpIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG9uSXNzdWUoYFVubWF0Y2hlZCBsb29wLWVuZCBhdCBpbmRleCAke2l9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobWF0Y2hlZCkgcGFpcnMucHVzaChtYXRjaGVkKTtcbiAgICB9XG5cbiAgICBpZiAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVtIG9mIHN0YWNrKSB7XG4gICAgICAgICAgICBvbklzc3VlKGBVbmNsb3NlZCBsb29wLXN0YXJ0IGF0IGluZGV4ICR7cmVtLnN0YXJ0SW5kZXh9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwYWlycy5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0SW5kZXggLSBiLnN0YXJ0SW5kZXgpO1xuICAgIHJldHVybiBwYWlycztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRJZlBhaXJzKHN0ZXBzTGlzdCwgb25Jc3N1ZSA9ICgpID0+IHt9KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbXTtcbiAgICBjb25zdCBpZlRvRWxzZSA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBpZlRvRW5kID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGVsc2VUb0VuZCA9IG5ldyBNYXAoKTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RlcHNMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdGVwc0xpc3RbaV07XG4gICAgICAgIGlmICghcyB8fCAhcy50eXBlKSBjb250aW51ZTtcblxuICAgICAgICBpZiAocy50eXBlID09PSAnaWYtc3RhcnQnKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKHsgaWZJbmRleDogaSwgZWxzZUluZGV4OiBudWxsIH0pO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocy50eXBlID09PSAnZWxzZScpIHtcbiAgICAgICAgICAgIGlmIChzdGFjay5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBvbklzc3VlKGBFbHNlIHdpdGhvdXQgbWF0Y2hpbmcgaWYtc3RhcnQgYXQgaW5kZXggJHtpfWApO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCB0b3AgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIGlmICh0b3AuZWxzZUluZGV4ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdG9wLmVsc2VJbmRleCA9IGk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG9uSXNzdWUoYE11bHRpcGxlIGVsc2UgYmxvY2tzIGZvciBpZi1zdGFydCBhdCBpbmRleCAke3RvcC5pZkluZGV4fWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocy50eXBlICE9PSAnaWYtZW5kJykgY29udGludWU7XG5cbiAgICAgICAgY29uc3QgdG9wID0gc3RhY2sucG9wKCk7XG4gICAgICAgIGlmICghdG9wKSB7XG4gICAgICAgICAgICBvbklzc3VlKGBJZi1lbmQgd2l0aG91dCBtYXRjaGluZyBpZi1zdGFydCBhdCBpbmRleCAke2l9YCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmVG9FbmQuc2V0KHRvcC5pZkluZGV4LCBpKTtcbiAgICAgICAgaWYgKHRvcC5lbHNlSW5kZXggIT09IG51bGwpIHtcbiAgICAgICAgICAgIGlmVG9FbHNlLnNldCh0b3AuaWZJbmRleCwgdG9wLmVsc2VJbmRleCk7XG4gICAgICAgICAgICBlbHNlVG9FbmQuc2V0KHRvcC5lbHNlSW5kZXgsIGkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHN0YWNrLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGNvbnN0IHJlbSBvZiBzdGFjaykge1xuICAgICAgICAgICAgb25Jc3N1ZShgVW5jbG9zZWQgaWYtc3RhcnQgYXQgaW5kZXggJHtyZW0uaWZJbmRleH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IGlmVG9FbHNlLCBpZlRvRW5kLCBlbHNlVG9FbmQgfTtcbn1cbiIsICJpbXBvcnQgeyBub3JtYWxpemVUZXh0IH0gZnJvbSAnLi4vdXRpbHMvdGV4dC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0Um93VmFsdWUoZmllbGRNYXBwaW5nLCBjdXJyZW50Um93KSB7XG4gICAgaWYgKCFjdXJyZW50Um93IHx8ICFmaWVsZE1hcHBpbmcpIHJldHVybiAnJztcbiAgICBsZXQgdmFsdWUgPSBjdXJyZW50Um93W2ZpZWxkTWFwcGluZ107XG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgJiYgZmllbGRNYXBwaW5nLmluY2x1ZGVzKCc6JykpIHtcbiAgICAgICAgY29uc3QgZmllbGROYW1lID0gZmllbGRNYXBwaW5nLnNwbGl0KCc6JykucG9wKCk7XG4gICAgICAgIHZhbHVlID0gY3VycmVudFJvd1tmaWVsZE5hbWVdO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbHVlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiAnJztcbiAgICBjb25zdCBhcmlhID0gZWxlbWVudC5nZXRBdHRyaWJ1dGU/LignYXJpYS1sYWJlbCcpO1xuICAgIGlmIChhcmlhKSByZXR1cm4gYXJpYS50cmltKCk7XG4gICAgY29uc3QgdGV4dCA9IGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKTtcbiAgICByZXR1cm4gdGV4dCB8fCAnJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVsZW1lbnRWYWx1ZUZvckNvbmRpdGlvbihlbGVtZW50KSB7XG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gJyc7XG4gICAgaWYgKCd2YWx1ZScgaW4gZWxlbWVudCAmJiBlbGVtZW50LnZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhlbGVtZW50LnZhbHVlID8/ICcnKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZhbHVhdGVDb25kaXRpb24oc3RlcCwgY3VycmVudFJvdywgZGVwcyA9IHt9KSB7XG4gICAgY29uc3QgZmluZEVsZW1lbnQgPSBkZXBzLmZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0IHx8ICgoKSA9PiBudWxsKTtcbiAgICBjb25zdCBpc1Zpc2libGUgPSBkZXBzLmlzRWxlbWVudFZpc2libGUgfHwgKCgpID0+IGZhbHNlKTtcbiAgICBjb25zdCB0eXBlID0gc3RlcD8uY29uZGl0aW9uVHlwZSB8fCAndWktdmlzaWJsZSc7XG5cbiAgICBpZiAodHlwZS5zdGFydHNXaXRoKCd1aS0nKSkge1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IHN0ZXA/LmNvbmRpdGlvbkNvbnRyb2xOYW1lIHx8IHN0ZXA/LmNvbnRyb2xOYW1lIHx8ICcnO1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gY29udHJvbE5hbWUgPyBmaW5kRWxlbWVudChjb250cm9sTmFtZSkgOiBudWxsO1xuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSAndWktdmlzaWJsZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuICEhZWxlbWVudCAmJiBpc1Zpc2libGUoZWxlbWVudCk7XG4gICAgICAgICAgICBjYXNlICd1aS1oaWRkZW4nOlxuICAgICAgICAgICAgICAgIHJldHVybiAhZWxlbWVudCB8fCAhaXNWaXNpYmxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgY2FzZSAndWktZXhpc3RzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gISFlbGVtZW50O1xuICAgICAgICAgICAgY2FzZSAndWktbm90LWV4aXN0cyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuICFlbGVtZW50O1xuICAgICAgICAgICAgY2FzZSAndWktdGV4dC1lcXVhbHMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChnZXRFbGVtZW50VGV4dEZvckNvbmRpdGlvbihlbGVtZW50KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsID09PSBleHBlY3RlZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3VpLXRleHQtY29udGFpbnMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChnZXRFbGVtZW50VGV4dEZvckNvbmRpdGlvbihlbGVtZW50KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsLmluY2x1ZGVzKGV4cGVjdGVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3VpLXZhbHVlLWVxdWFscyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRWYWx1ZUZvckNvbmRpdGlvbihlbGVtZW50KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsID09PSBleHBlY3RlZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3VpLXZhbHVlLWNvbnRhaW5zJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoZ2V0RWxlbWVudFZhbHVlRm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZS5zdGFydHNXaXRoKCdkYXRhLScpKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZyA9IHN0ZXA/LmNvbmRpdGlvbkZpZWxkTWFwcGluZyB8fCAnJztcbiAgICAgICAgY29uc3QgYWN0dWFsUmF3ID0gZXh0cmFjdFJvd1ZhbHVlKGZpZWxkTWFwcGluZywgY3VycmVudFJvdyk7XG4gICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoYWN0dWFsUmF3KTtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcblxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtZXF1YWxzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsID09PSBleHBlY3RlZDtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtbm90LWVxdWFscyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCAhPT0gZXhwZWN0ZWQ7XG4gICAgICAgICAgICBjYXNlICdkYXRhLWNvbnRhaW5zJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsLmluY2x1ZGVzKGV4cGVjdGVkKTtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtZW1wdHknOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09ICcnO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1ub3QtZW1wdHknOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgIT09ICcnO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG4iLCAiY29uc3QgREVGQVVMVF9TRVRUSU5HUyA9IE9iamVjdC5mcmVlemUoe1xuICAgIGRlbGF5QWZ0ZXJDbGljazogODAwLFxuICAgIGRlbGF5QWZ0ZXJJbnB1dDogNDAwLFxuICAgIGRlbGF5QWZ0ZXJTYXZlOiAxMDAwXG59KTtcblxuY29uc3QgQkFTRV9USU1JTkdTID0gT2JqZWN0LmZyZWV6ZSh7XG4gICAgUVVJQ0tfUkVUUllfREVMQVk6IDUwLFxuICAgIElOUFVUX1NFVFRMRV9ERUxBWTogMTAwLFxuICAgIEZMT1dfU1RBQklMSVRZX1BPTExfREVMQVk6IDEyMCxcbiAgICBNRURJVU1fU0VUVExFX0RFTEFZOiAxNTAsXG4gICAgSU5URVJSVVBUSU9OX1BPTExfREVMQVk6IDE1MCxcbiAgICBBTklNQVRJT05fREVMQVk6IDIwMCxcbiAgICBNRVNTQUdFX0NMT1NFX0RFTEFZOiAyNTAsXG4gICAgVUlfVVBEQVRFX0RFTEFZOiAzMDAsXG4gICAgRElBTE9HX0FDVElPTl9ERUxBWTogMzUwLFxuICAgIFBPU1RfSU5QVVRfREVMQVk6IDQwMCxcbiAgICBERUZBVUxUX1dBSVRfU1RFUF9ERUxBWTogNTAwLFxuICAgIFNBVkVfU0VUVExFX0RFTEFZOiA2MDAsXG4gICAgQ0xJQ0tfQU5JTUFUSU9OX0RFTEFZOiA4MDAsXG4gICAgVkFMSURBVElPTl9XQUlUOiAxMDAwXG59KTtcblxuY29uc3QgVElNSU5HX0NIQU5ORUwgPSBPYmplY3QuZnJlZXplKHtcbiAgICBRVUlDS19SRVRSWV9ERUxBWTogJ2lucHV0JyxcbiAgICBJTlBVVF9TRVRUTEVfREVMQVk6ICdpbnB1dCcsXG4gICAgRkxPV19TVEFCSUxJVFlfUE9MTF9ERUxBWTogJ2dlbmVyYWwnLFxuICAgIE1FRElVTV9TRVRUTEVfREVMQVk6ICdpbnB1dCcsXG4gICAgSU5URVJSVVBUSU9OX1BPTExfREVMQVk6ICdpbnB1dCcsXG4gICAgQU5JTUFUSU9OX0RFTEFZOiAnaW5wdXQnLFxuICAgIE1FU1NBR0VfQ0xPU0VfREVMQVk6ICdjbGljaycsXG4gICAgVUlfVVBEQVRFX0RFTEFZOiAnY2xpY2snLFxuICAgIERJQUxPR19BQ1RJT05fREVMQVk6ICdjbGljaycsXG4gICAgUE9TVF9JTlBVVF9ERUxBWTogJ2lucHV0JyxcbiAgICBERUZBVUxUX1dBSVRfU1RFUF9ERUxBWTogJ2NsaWNrJyxcbiAgICBTQVZFX1NFVFRMRV9ERUxBWTogJ3NhdmUnLFxuICAgIENMSUNLX0FOSU1BVElPTl9ERUxBWTogJ2NsaWNrJyxcbiAgICBWQUxJREFUSU9OX1dBSVQ6ICdzYXZlJ1xufSk7XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZURlbGF5KHZhbHVlLCBmYWxsYmFjaykge1xuICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSB8fCBwYXJzZWQgPD0gMCkgcmV0dXJuIGZhbGxiYWNrO1xuICAgIHJldHVybiBwYXJzZWQ7XG59XG5cbmZ1bmN0aW9uIHJvdW5kRGVsYXkodmFsdWUpIHtcbiAgICByZXR1cm4gTWF0aC5tYXgoMTAsIE1hdGgucm91bmQodmFsdWUpKTtcbn1cblxuZnVuY3Rpb24gZ2V0U3BlZWRQcm9maWxlKHNjYWxlcykge1xuICAgIGNvbnN0IGF2ZXJhZ2VTY2FsZSA9IChzY2FsZXMuY2xpY2sgKyBzY2FsZXMuaW5wdXQgKyBzY2FsZXMuc2F2ZSkgLyAzO1xuICAgIGlmIChhdmVyYWdlU2NhbGUgPD0gMC45KSByZXR1cm4gJ2Zhc3QnO1xuICAgIGlmIChhdmVyYWdlU2NhbGUgPj0gMS4xKSByZXR1cm4gJ3Nsb3cnO1xuICAgIHJldHVybiAnbm9ybWFsJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFdvcmtmbG93VGltaW5ncyhzZXR0aW5ncyA9IHt9KSB7XG4gICAgY29uc3QgbWVyZ2VkID0ge1xuICAgICAgICBkZWxheUFmdGVyQ2xpY2s6IG5vcm1hbGl6ZURlbGF5KHNldHRpbmdzLmRlbGF5QWZ0ZXJDbGljaywgREVGQVVMVF9TRVRUSU5HUy5kZWxheUFmdGVyQ2xpY2spLFxuICAgICAgICBkZWxheUFmdGVySW5wdXQ6IG5vcm1hbGl6ZURlbGF5KHNldHRpbmdzLmRlbGF5QWZ0ZXJJbnB1dCwgREVGQVVMVF9TRVRUSU5HUy5kZWxheUFmdGVySW5wdXQpLFxuICAgICAgICBkZWxheUFmdGVyU2F2ZTogbm9ybWFsaXplRGVsYXkoc2V0dGluZ3MuZGVsYXlBZnRlclNhdmUsIERFRkFVTFRfU0VUVElOR1MuZGVsYXlBZnRlclNhdmUpXG4gICAgfTtcblxuICAgIGNvbnN0IHNjYWxlcyA9IHtcbiAgICAgICAgY2xpY2s6IG1lcmdlZC5kZWxheUFmdGVyQ2xpY2sgLyBERUZBVUxUX1NFVFRJTkdTLmRlbGF5QWZ0ZXJDbGljayxcbiAgICAgICAgaW5wdXQ6IG1lcmdlZC5kZWxheUFmdGVySW5wdXQgLyBERUZBVUxUX1NFVFRJTkdTLmRlbGF5QWZ0ZXJJbnB1dCxcbiAgICAgICAgc2F2ZTogbWVyZ2VkLmRlbGF5QWZ0ZXJTYXZlIC8gREVGQVVMVF9TRVRUSU5HUy5kZWxheUFmdGVyU2F2ZVxuICAgIH07XG4gICAgc2NhbGVzLmdlbmVyYWwgPSAoc2NhbGVzLmNsaWNrICsgc2NhbGVzLmlucHV0ICsgc2NhbGVzLnNhdmUpIC8gMztcblxuICAgIGNvbnN0IHRpbWluZ3MgPSB7fTtcbiAgICBPYmplY3QuZW50cmllcyhCQVNFX1RJTUlOR1MpLmZvckVhY2goKFtrZXksIGJhc2VWYWx1ZV0pID0+IHtcbiAgICAgICAgY29uc3QgY2hhbm5lbCA9IFRJTUlOR19DSEFOTkVMW2tleV0gfHwgJ2dlbmVyYWwnO1xuICAgICAgICBjb25zdCBzY2FsZSA9IHNjYWxlc1tjaGFubmVsXSB8fCBzY2FsZXMuZ2VuZXJhbDtcbiAgICAgICAgdGltaW5nc1trZXldID0gcm91bmREZWxheShiYXNlVmFsdWUgKiBzY2FsZSk7XG4gICAgfSk7XG5cbiAgICB0aW1pbmdzLnN5c3RlbVNwZWVkID0gZ2V0U3BlZWRQcm9maWxlKHNjYWxlcyk7XG4gICAgdGltaW5ncy5zZXR0aW5ncyA9IG1lcmdlZDtcbiAgICByZXR1cm4gdGltaW5ncztcbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHtcclxuICAgIGNvbnN0IGFsbE1hdGNoZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG5cclxuICAgIGlmIChhbGxNYXRjaGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcbiAgICBpZiAoYWxsTWF0Y2hlcy5sZW5ndGggPT09IDEpIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG5cclxuICAgIC8vIE11bHRpcGxlIG1hdGNoZXMgLSBwcmVmZXIgdGhlIG9uZSBpbiB0aGUgYWN0aXZlL3RvcG1vc3QgY29udGV4dFxyXG5cclxuICAgIC8vIFByaW9yaXR5IDE6IEVsZW1lbnQgaW4gYW4gYWN0aXZlIGRpYWxvZy9tb2RhbCAoY2hpbGQgZm9ybXMpXHJcbiAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICBjb25zdCBkaWFsb2cgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpO1xyXG4gICAgICAgIGlmIChkaWFsb2cgJiYgaXNFbGVtZW50VmlzaWJsZShkaWFsb2cpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBkaWFsb2cgY29udGV4dGApO1xyXG4gICAgICAgICAgICByZXR1cm4gZWw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDI6IEVsZW1lbnQgaW4gYSBGYXN0VGFiIG9yIFRhYlBhZ2UgdGhhdCdzIGV4cGFuZGVkL2FjdGl2ZVxyXG4gICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgY29uc3QgdGFiUGFnZSA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgLnRhYlBhZ2UnKTtcclxuICAgICAgICBpZiAodGFiUGFnZSkge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgdGFiIGlzIGV4cGFuZGVkXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSB0YWJQYWdlLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YWJQYWdlLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXRhYlBhZ2UuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuICAgICAgICAgICAgaWYgKGlzRXhwYW5kZWQgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBleHBhbmRlZCB0YWIgY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDM6IEVsZW1lbnQgaW4gdGhlIGZvcm0gY29udGV4dCB0aGF0IGhhcyBmb2N1cyBvciB3YXMgcmVjZW50bHkgaW50ZXJhY3RlZCB3aXRoXHJcbiAgICBjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcclxuICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtQ29udGV4dCA9IGFjdGl2ZUVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLWZvcm0tbmFtZV0sIFtkYXRhLWR5bi1yb2xlPVwiRm9ybVwiXScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dC5jb250YWlucyhlbCkgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gYWN0aXZlIGZvcm0gY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSA0OiBBbnkgdmlzaWJsZSBlbGVtZW50IChwcmVmZXIgbGF0ZXIgb25lcyBhcyB0aGV5J3JlIG9mdGVuIGluIGNoaWxkIGZvcm1zIHJlbmRlcmVkIG9uIHRvcClcclxuICAgIGNvbnN0IHZpc2libGVNYXRjaGVzID0gQXJyYXkuZnJvbShhbGxNYXRjaGVzKS5maWx0ZXIoZWwgPT4gaXNFbGVtZW50VmlzaWJsZShlbCkpO1xyXG4gICAgaWYgKHZpc2libGVNYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAvLyBSZXR1cm4gdGhlIGxhc3QgdmlzaWJsZSBtYXRjaCAob2Z0ZW4gdGhlIGNoaWxkIGZvcm0ncyBlbGVtZW50KVxyXG4gICAgICAgIHJldHVybiB2aXNpYmxlTWF0Y2hlc1t2aXNpYmxlTWF0Y2hlcy5sZW5ndGggLSAxXTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGYWxsYmFjazogZmlyc3QgbWF0Y2hcclxuICAgIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZShlbCkge1xyXG4gICAgaWYgKCFlbCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XHJcbiAgICByZXR1cm4gcmVjdC53aWR0aCA+IDAgJiZcclxuICAgICAgICAgICByZWN0LmhlaWdodCA+IDAgJiZcclxuICAgICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScgJiZcclxuICAgICAgICAgICBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgIHN0eWxlLm9wYWNpdHkgIT09ICcwJztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRDM2NUxvYWRpbmcoKSB7XHJcbiAgICAvLyBDaGVjayBmb3IgY29tbW9uIEQzNjUgbG9hZGluZyBpbmRpY2F0b3JzXHJcbiAgICBjb25zdCBsb2FkaW5nU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcuZHluLWxvYWRpbmctb3ZlcmxheTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1sb2FkaW5nLWluZGljYXRvcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1zcGlubmVyOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcubG9hZGluZy1pbmRpY2F0b3I6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tbWVzc2FnZUJ1c3k6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1sb2FkaW5nPVwidHJ1ZVwiXScsXHJcbiAgICAgICAgJy5idXN5LWluZGljYXRvcicsXHJcbiAgICAgICAgJy5keW4tbG9hZGluZ1N0dWI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tcHJvY2Vzc2luZ01zZzpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIGxvYWRpbmdTZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChlbCAmJiBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGZvciBBSkFYIHJlcXVlc3RzIGluIHByb2dyZXNzIChEMzY1IHNwZWNpZmljKVxyXG4gICAgaWYgKHdpbmRvdy4kZHluICYmIHdpbmRvdy4kZHluLmlzUHJvY2Vzc2luZykge1xyXG4gICAgICAgIHJldHVybiB3aW5kb3cuJGR5bi5pc1Byb2Nlc3NpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBmb3IgXCJQbGVhc2Ugd2FpdFwiIHByb2Nlc3NpbmcgbWVzc2FnZSBvdmVybGF5cy5cclxuICAgIC8vIEQzNjUgc2hvd3MgdGhlc2UgZHVyaW5nIHNlcnZlci1zaWRlIG9wZXJhdGlvbnMgKGUuZy4gYWZ0ZXIgY2xpY2tpbmcgT0tcclxuICAgIC8vIG9uIHRoZSBDcmVhdGUgU2FsZXMgT3JkZXIgZGlhbG9nKS5cclxuICAgIGlmIChpc0QzNjVQcm9jZXNzaW5nTWVzc2FnZSgpKSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogRGV0ZWN0IHRoZSBcIlBsZWFzZSB3YWl0LiBXZSdyZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdC5cIiBtZXNzYWdlIG92ZXJsYXlcclxuICogYW5kIHNpbWlsYXIgRDM2NSBwcm9jZXNzaW5nL2Jsb2NraW5nIG1lc3NhZ2VzLlxyXG4gKiBUaGVzZSBhcmUgbW9kYWwtc3R5bGUgbWVzc2FnZSBib3hlcyB0aGF0IGJsb2NrIHRoZSBVSSB3aGlsZSB0aGUgc2VydmVyXHJcbiAqIHByb2Nlc3NlcyBhIHJlcXVlc3QuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaXNEMzY1UHJvY2Vzc2luZ01lc3NhZ2UoKSB7XHJcbiAgICAvLyBQYXR0ZXJuIDE6IEQzNjUgbWVzc2FnZSBiYXIgLyBpbmZvIGJveCB3aXRoIFwiUGxlYXNlIHdhaXRcIiB0ZXh0XHJcbiAgICBjb25zdCBtZXNzYWdlU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcubWVzc2FnZUJhcicsXHJcbiAgICAgICAgJy5keW4tbWVzc2FnZUJhcicsXHJcbiAgICAgICAgJy5keW4tbXNnQm94JyxcclxuICAgICAgICAnLmR5bi1pbmZvQm94JyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJNc2dCb3hcIl0nLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkluZm9Cb3hcIl0nLFxyXG4gICAgICAgICcuZGlhbG9nLWNvbnRhaW5lcicsXHJcbiAgICAgICAgJ1tyb2xlPVwiZGlhbG9nXCJdJyxcclxuICAgICAgICAnW3JvbGU9XCJhbGVydGRpYWxvZ1wiXScsXHJcbiAgICAgICAgJy5zeXNCb3hDb250ZW50JyxcclxuICAgICAgICAnLnByb2Nlc3NpbmctZGlhbG9nJ1xyXG4gICAgXTtcclxuXHJcbiAgICBjb25zdCB3YWl0UGhyYXNlcyA9IFtcclxuICAgICAgICAncGxlYXNlIHdhaXQnLFxyXG4gICAgICAgICdwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdCcsXHJcbiAgICAgICAgJ3dlXFwncmUgcHJvY2Vzc2luZycsXHJcbiAgICAgICAgJ2JlaW5nIHByb2Nlc3NlZCcsXHJcbiAgICAgICAgJ3BsZWFzZSBiZSBwYXRpZW50JyxcclxuICAgICAgICAnb3BlcmF0aW9uIGluIHByb2dyZXNzJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIG1lc3NhZ2VTZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBlbGVtZW50cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xyXG4gICAgICAgIGZvciAoY29uc3QgZWwgb2YgZWxlbWVudHMpIHtcclxuICAgICAgICAgICAgaWYgKGVsICYmIGVsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgICAgIGlmICh3YWl0UGhyYXNlcy5zb21lKHBocmFzZSA9PiB0ZXh0LmluY2x1ZGVzKHBocmFzZSkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUGF0dGVybiAyOiBBbnkgdmlzaWJsZSBlbGVtZW50IGNvbnRhaW5pbmcgdGhlIHByb2Nlc3NpbmcgdGV4dCB0aGF0XHJcbiAgICAvLyBsb29rcyBsaWtlIGEgYmxvY2tpbmcgb3ZlcmxheSBvciBtb2RhbFxyXG4gICAgY29uc3Qgb3ZlcmxheXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICcubW9kYWwsIC5vdmVybGF5LCBbY2xhc3MqPVwib3ZlcmxheVwiXSwgW2NsYXNzKj1cIm1vZGFsXCJdLCBbY2xhc3MqPVwiYmxvY2tpbmdcIl0nXHJcbiAgICApO1xyXG4gICAgZm9yIChjb25zdCBlbCBvZiBvdmVybGF5cykge1xyXG4gICAgICAgIGlmIChlbCAmJiBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgaWYgKHdhaXRQaHJhc2VzLnNvbWUocGhyYXNlID0+IHRleHQuaW5jbHVkZXMocGhyYXNlKSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpIHtcclxuICAgIC8vIFByaW9yaXR5IDA6IElmIHdlIGhhdmUgYSBwZW5kaW5nLW5ldy1yb3cgbWFya2VyIChzZXQgYnkgd2FpdEZvck5ld0dyaWRSb3dcclxuICAgIC8vIGFmdGVyIGFuIFwiQWRkIGxpbmVcIiBjbGljayksIGxvb2sgaW4gVEhBVCBzcGVjaWZpYyByb3cgZmlyc3QuXHJcbiAgICAvLyBUaGlzIGVsaW1pbmF0ZXMgdGhlIHJhY2UgY29uZGl0aW9uIHdoZXJlIHRoZSBvbGQgcm93IGlzIHN0aWxsIHNlbGVjdGVkLlxyXG4gICAgY29uc3QgcGVuZGluZ05ldyA9IHdpbmRvdy5fX2QzNjVfcGVuZGluZ05ld1JvdztcclxuICAgIGlmIChwZW5kaW5nTmV3ICYmIHBlbmRpbmdOZXcucm93RWxlbWVudCAmJiAoRGF0ZS5ub3coKSAtIHBlbmRpbmdOZXcudGltZXN0YW1wIDwgMTUwMDApKSB7XHJcbiAgICAgICAgY29uc3QgY2VsbCA9IHBlbmRpbmdOZXcucm93RWxlbWVudC5xdWVyeVNlbGVjdG9yKFxyXG4gICAgICAgICAgICBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXHJcbiAgICAgICAgKTtcclxuICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJpb3JpdHkgMTogRmluZCBpbiBhbiBhY3RpdmUvc2VsZWN0ZWQgcm93ICh0cmFkaXRpb25hbCBEMzY1IGdyaWRzKVxyXG4gICAgY29uc3Qgc2VsZWN0ZWRSb3dzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXNlbGVjdGVkPVwidHJ1ZVwiXSwgW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZHluLXNlbGVjdGVkUm93Jyk7XHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiBzZWxlY3RlZFJvd3MpIHtcclxuICAgICAgICBjb25zdCBjZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNlbGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDI6IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIC0gZmluZCBhY3RpdmUgcm93XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICAvLyBMb29rIGZvciBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nKTtcclxuICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjZWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQcmlvcml0eSAzOiBJbiBib2R5IHJvd3MgLSBwcmVmZXIgdGhlIExBU1QgdmlzaWJsZSBjZWxsLlxyXG4gICAgICAgIC8vIEFmdGVyIFwiQWRkIGxpbmVcIiwgRDM2NSBhcHBlbmRzIGEgbmV3IHJvdyBhdCB0aGUgYm90dG9tLlxyXG4gICAgICAgIC8vIElmIHRoZSBhY3RpdmUtcm93IGF0dHJpYnV0ZSBoYXNuJ3QgYmVlbiBzZXQgeWV0IChyYWNlIGNvbmRpdGlvbiksXHJcbiAgICAgICAgLy8gcmV0dXJuaW5nIHRoZSBmaXJzdCBjZWxsIHdvdWxkIHRhcmdldCByb3cgMSBpbnN0ZWFkIG9mIHRoZSBuZXcgcm93LlxyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBsZXQgbGFzdFZpc2libGVDZWxsID0gbnVsbDtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGlmIGluIGhlYWRlclxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNJbkhlYWRlciA9IGNlbGwuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzSW5IZWFkZXIgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBsYXN0VmlzaWJsZUNlbGwgPSBjZWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChsYXN0VmlzaWJsZUNlbGwpIHJldHVybiBsYXN0VmlzaWJsZUNlbGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDQ6IFRyYWRpdGlvbmFsIEQzNjUgZ3JpZCBjb250ZXh0IC0gcHJlZmVyIGxhc3QgdmlzaWJsZSBjZWxsXHJcbiAgICBjb25zdCBncmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIGdyaWRzKSB7XHJcbiAgICAgICAgLy8gRmluZCBhbGwgbWF0Y2hpbmcgY2VsbHMgYW5kIHByZWZlciB2aXNpYmxlL2VkaXRhYmxlIG9uZXNcclxuICAgICAgICBjb25zdCBjZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBsZXQgbGFzdFZpc2libGVDZWxsID0gbnVsbDtcclxuICAgICAgICBmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyBpbiBhIGRhdGEgcm93IChub3QgaGVhZGVyKVxyXG4gICAgICAgICAgICBjb25zdCBpc0luSGVhZGVyID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0sIHRoZWFkJyk7XHJcbiAgICAgICAgICAgIGlmICghaXNJbkhlYWRlciAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgbGFzdFZpc2libGVDZWxsID0gY2VsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobGFzdFZpc2libGVDZWxsKSByZXR1cm4gbGFzdFZpc2libGVDZWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIHRvIHN0YW5kYXJkIGVsZW1lbnQgZmluZGluZ1xyXG4gICAgcmV0dXJuIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc0xvb2t1cEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICByZXR1cm4gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubG9va3VwLWJ1dHRvbiwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBCdXR0b25cIl0nKSAhPT0gbnVsbCB8fFxyXG4gICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gWycubG9va3VwLWJ1dHRvbicsICcubG9va3VwQnV0dG9uJywgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwQnV0dG9uXCJdJ107XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGRpcmVjdCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGRpcmVjdCkgcmV0dXJuIGRpcmVjdDtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAsIC5sb29rdXBGaWVsZCcpIHx8IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuICAgIGlmICghY29udGFpbmVyKSByZXR1cm4gbnVsbDtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgaW5Db250YWluZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGluQ29udGFpbmVyKSByZXR1cm4gaW5Db250YWluZXI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhcmlhQnV0dG9uID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblthcmlhLWxhYmVsKj1cIkxvb2t1cFwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiT3BlblwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VsZWN0XCJdJyk7XHJcbiAgICBpZiAoYXJpYUJ1dHRvbikgcmV0dXJuIGFyaWFCdXR0b247XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGVHbG9iYWwoZWxlbWVudCkge1xyXG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gZmFsc2U7XHJcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xyXG4gICAgcmV0dXJuIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmXHJcbiAgICAgICAgc3R5bGUudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwaWNrTmVhcmVzdFJvd3Mocm93cywgdGFyZ2V0RWxlbWVudCkge1xyXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkgcmV0dXJuIHJvd3M7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIGlmICghdGFyZ2V0UmVjdCkgcmV0dXJuIHJvd3M7XHJcbiAgICByZXR1cm4gcm93cy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICBjb25zdCByYSA9IGEuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgcmIgPSBiLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IGRhID0gTWF0aC5hYnMocmEubGVmdCAtIHRhcmdldFJlY3QubGVmdCkgKyBNYXRoLmFicyhyYS50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgY29uc3QgZGIgPSBNYXRoLmFicyhyYi5sZWZ0IC0gdGFyZ2V0UmVjdC5sZWZ0KSArIE1hdGguYWJzKHJiLnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICByZXR1cm4gZGEgLSBkYjtcclxuICAgIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogQ291bnQgdmlzaWJsZSBkYXRhIHJvd3MgaW4gYWxsIGdyaWRzIG9uIHRoZSBwYWdlLlxyXG4gKiBSZXR1cm5zIHRoZSB0b3RhbCBjb3VudCBhY3Jvc3MgUmVhY3QgRml4ZWREYXRhVGFibGUgYW5kIHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHMuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0R3JpZFJvd0NvdW50KCkge1xyXG4gICAgbGV0IGNvdW50ID0gMDtcclxuXHJcbiAgICAvLyBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkc1xyXG4gICAgY29uc3QgcmVhY3RHcmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgY29uc3QgYm9keUNvbnRhaW5lciA9IGdyaWQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHksIC5maXhlZERhdGFUYWJsZUxheW91dF9yb3dzQ29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGJvZHlDb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgICAgICcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbiwgW3JvbGU9XCJyb3dcIl06bm90KFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdKSdcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgLy8gT25seSBjb3VudCByb3dzIHRoYXQgYXJlIHZpc2libGUgYW5kIGhhdmUgY29udGVudCAobm90IGVtcHR5IHNwYWNlciByb3dzKVxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAocm93Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJiAhcm93LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUxheW91dF9oZWFkZXInKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvdW50Kys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJhZGl0aW9uYWwgRDM2NSBncmlkc1xyXG4gICAgaWYgKGNvdW50ID09PSAwKSB7XHJcbiAgICAgICAgY29uc3QgZ3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGdyaWQgb2YgZ3JpZHMpIHtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgICAgICdbZGF0YS1keW4tcm9sZT1cIlJvd1wiXTpub3QoW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0pLCAnICtcclxuICAgICAgICAgICAgICAgICdbcm9sZT1cInJvd1wiXTpub3QoW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0pOm5vdCh0aGVhZCBbcm9sZT1cInJvd1wiXSksICcgK1xyXG4gICAgICAgICAgICAgICAgJ3Rib2R5IHRyJ1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAocm93Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkgY291bnQrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY291bnQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgdGhlIERPTSBlbGVtZW50IG9mIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQvYWN0aXZlIGdyaWQgcm93LlxyXG4gKiBSZXR1cm5zIHsgcm93LCByb3dJbmRleCB9IG9yIG51bGwuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0R3JpZFNlbGVjdGVkUm93KCkge1xyXG4gICAgLy8gUmVhY3QgZ3JpZHNcclxuICAgIGNvbnN0IHJlYWN0R3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmVhY3RHcmlkJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgcmVhY3RHcmlkcykge1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmICghYm9keUNvbnRhaW5lcikgY29udGludWU7XHJcbiAgICAgICAgY29uc3QgYWxsUm93cyA9IEFycmF5LmZyb20oYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICAgICAnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4nXHJcbiAgICAgICAgKSkuZmlsdGVyKHIgPT4gci5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgIXIuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlcicpKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhbGxSb3dzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChhbGxSb3dzW2ldLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgIGFsbFJvd3NbaV0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb3ctYWN0aXZlJykgPT09ICd0cnVlJykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgcm93OiBhbGxSb3dzW2ldLCByb3dJbmRleDogaSwgdG90YWxSb3dzOiBhbGxSb3dzLmxlbmd0aCB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyYWRpdGlvbmFsIGdyaWRzXHJcbiAgICBjb25zdCBzZWxlY3RlZFJvd3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnXHJcbiAgICApO1xyXG4gICAgZm9yIChjb25zdCByb3cgb2Ygc2VsZWN0ZWRSb3dzKSB7XHJcbiAgICAgICAgaWYgKHJvdy5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgcm93LCByb3dJbmRleDogLTEsIHRvdGFsUm93czogLTEgfTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb2xsZWN0IGNvbXByZWhlbnNpdmUgZ3JpZCBzdGF0ZSBpbmZvcm1hdGlvbiBmb3IgZGlhZ25vc3RpY3MuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5zcGVjdEdyaWRTdGF0ZSgpIHtcclxuICAgIGNvbnN0IGdyaWRzID0gW107XHJcblxyXG4gICAgLy8gUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHNcclxuICAgIGNvbnN0IHJlYWN0R3JpZEVscyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRFbHMpIHtcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoIWJvZHlDb250YWluZXIpIGNvbnRpbnVlO1xyXG4gICAgICAgIGNvbnN0IGFsbFJvd3MgPSBBcnJheS5mcm9tKGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluJ1xyXG4gICAgICAgICkpLmZpbHRlcihyID0+IHIub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmICFyLmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUxheW91dF9oZWFkZXInKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJvd0RldGFpbHMgPSBhbGxSb3dzLm1hcCgocm93LCBpZHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHJvdy5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IHJvdy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvdy1hY3RpdmUnKSA9PT0gJ3RydWUnO1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsQ29udHJvbHMgPSBBcnJheS5mcm9tKHJvdy5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykpXHJcbiAgICAgICAgICAgICAgICAubWFwKGMgPT4gYy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykpO1xyXG4gICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9ICEhcm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGlkeCwgaXNTZWxlY3RlZCwgaXNBY3RpdmUsIGNlbGxDb250cm9scywgaGFzSW5wdXQgfTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgZ3JpZHMucHVzaCh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdSZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICB0b3RhbFJvd3M6IGFsbFJvd3MubGVuZ3RoLFxyXG4gICAgICAgICAgICBzZWxlY3RlZFJvd3M6IHJvd0RldGFpbHMuZmlsdGVyKHIgPT4gci5pc1NlbGVjdGVkKS5tYXAociA9PiByLmluZGV4KSxcclxuICAgICAgICAgICAgYWN0aXZlUm93czogcm93RGV0YWlscy5maWx0ZXIociA9PiByLmlzQWN0aXZlKS5tYXAociA9PiByLmluZGV4KSxcclxuICAgICAgICAgICAgcm93czogcm93RGV0YWlsc1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyYWRpdGlvbmFsIEQzNjUgZ3JpZHNcclxuICAgIGNvbnN0IHRyYWRHcmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHRyYWRHcmlkcykge1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZ3JpZC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJ3Vua25vd24nO1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKGdyaWQucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiUm93XCJdLCBbcm9sZT1cInJvd1wiXTpub3QodGhlYWQgW3JvbGU9XCJyb3dcIl0pLCB0Ym9keSB0cidcclxuICAgICAgICApKS5maWx0ZXIociA9PiByLm9mZnNldFBhcmVudCAhPT0gbnVsbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJvd0RldGFpbHMgPSByb3dzLm1hcCgocm93LCBpZHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHJvdy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuY2xhc3NMaXN0LmNvbnRhaW5zKCdkeW4tc2VsZWN0ZWRSb3cnKTtcclxuICAgICAgICAgICAgY29uc3QgY2VsbENvbnRyb2xzID0gQXJyYXkuZnJvbShyb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpKVxyXG4gICAgICAgICAgICAgICAgLm1hcChjID0+IGMuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGlkeCwgaXNTZWxlY3RlZCwgY2VsbENvbnRyb2xzIH07XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGdyaWRzLnB1c2goe1xyXG4gICAgICAgICAgICB0eXBlOiAnVHJhZGl0aW9uYWxHcmlkJyxcclxuICAgICAgICAgICAgY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgIHRvdGFsUm93czogcm93cy5sZW5ndGgsXHJcbiAgICAgICAgICAgIHNlbGVjdGVkUm93czogcm93RGV0YWlscy5maWx0ZXIociA9PiByLmlzU2VsZWN0ZWQpLm1hcChyID0+IHIuaW5kZXgpLFxyXG4gICAgICAgICAgICByb3dzOiByb3dEZXRhaWxzXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBncmlkQ291bnQ6IGdyaWRzLmxlbmd0aCxcclxuICAgICAgICBncmlkcyxcclxuICAgICAgICBwZW5kaW5nTmV3Um93OiAhIXdpbmRvdy5fX2QzNjVfcGVuZGluZ05ld1JvdyxcclxuICAgICAgICBwZW5kaW5nTmV3Um93RGF0YTogd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93IHx8IG51bGxcclxuICAgIH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9va3VwRmlsdGVySW5wdXQobG9va3VwRG9jaykge1xyXG4gICAgaWYgKCFsb29rdXBEb2NrKSByZXR1cm4gbnVsbDtcclxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBBcnJheS5mcm9tKFxyXG4gICAgICAgIGxvb2t1cERvY2sucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInRleHRcIl0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJylcclxuICAgICk7XHJcbiAgICBpZiAoIWNhbmRpZGF0ZXMubGVuZ3RoKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAvLyBQcmVmZXIgaW5wdXRzIGluc2lkZSBzZWdtZW50ZWQgZW50cnkgZmx5b3V0IChNYWluQWNjb3VudCBpbnB1dCBpbiB0aGUgcmlnaHQgcGFuZWwpXHJcbiAgICBjb25zdCBzZWdtZW50SW5wdXQgPSBjYW5kaWRhdGVzLmZpbmQoaW5wdXQgPT4gaW5wdXQuY2xvc2VzdCgnLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQnKSk7XHJcbiAgICBpZiAoc2VnbWVudElucHV0KSByZXR1cm4gc2VnbWVudElucHV0O1xyXG5cclxuICAgIC8vIFNvbWUgZmx5b3V0cyB3cmFwIHRoZSBpbnB1dCBpbiBhIGNvbnRhaW5lcjsgdHJ5IHRvIGZpbmQgdGhlIGFjdHVhbCBpbnB1dCBpbnNpZGVcclxuICAgIGNvbnN0IHNlZ21lbnRDb250YWluZXIgPSBsb29rdXBEb2NrLnF1ZXJ5U2VsZWN0b3IoJy5zZWdtZW50ZWRFbnRyeS1mbHlvdXRTZWdtZW50IC5zZWdtZW50ZWRFbnRyeS1zZWdtZW50SW5wdXQnKTtcclxuICAgIGlmIChzZWdtZW50Q29udGFpbmVyKSB7XHJcbiAgICAgICAgY29uc3QgaW5uZXIgPSBzZWdtZW50Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgICAgICBpZiAoaW5uZXIpIHJldHVybiBpbm5lcjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmVmZXIgaW5wdXRzIGluc2lkZSBncmlkIGhlYWRlci90b29sYmFyIG9yIG5lYXIgdGhlIHRvcC1yaWdodCAobGlrZSB0aGUgbWFya2VkIGJveClcclxuICAgIGNvbnN0IGhlYWRlckNhbmRpZGF0ZSA9IGNhbmRpZGF0ZXMuZmluZChpbnB1dCA9PlxyXG4gICAgICAgIGlucHV0LmNsb3Nlc3QoJy5sb29rdXAtaGVhZGVyLCAubG9va3VwLXRvb2xiYXIsIC5ncmlkLWhlYWRlciwgW3JvbGU9XCJ0b29sYmFyXCJdJylcclxuICAgICk7XHJcbiAgICBpZiAoaGVhZGVyQ2FuZGlkYXRlKSByZXR1cm4gaGVhZGVyQ2FuZGlkYXRlO1xyXG5cclxuICAgIGxldCBiZXN0ID0gY2FuZGlkYXRlc1swXTtcclxuICAgIGxldCBiZXN0U2NvcmUgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XHJcbiAgICBmb3IgKGNvbnN0IGlucHV0IG9mIGNhbmRpZGF0ZXMpIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gaW5wdXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3Qgc2NvcmUgPSByZWN0LnRvcCAqIDIgKyByZWN0LmxlZnQ7IC8vIGJpYXMgdG93YXJkcyB0b3Agcm93XHJcbiAgICAgICAgaWYgKHNjb3JlIDwgYmVzdFNjb3JlKSB7XHJcbiAgICAgICAgICAgIGJlc3RTY29yZSA9IHNjb3JlO1xyXG4gICAgICAgICAgICBiZXN0ID0gaW5wdXQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJlc3Q7XHJcbn1cclxuIiwgImltcG9ydCB7IHNsZWVwIH0gZnJvbSAnLi9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGlzRWxlbWVudFZpc2libGVHbG9iYWwsIHBpY2tOZWFyZXN0Um93cyB9IGZyb20gJy4vZG9tLmpzJztcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTG9va3VwUG9wdXAodGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcubG9va3VwLWJ1dHRvbkNvbnRhaW5lcicsXHJcbiAgICAgICAgJy5sb29rdXBEb2NrLWJ1dHRvbkNvbnRhaW5lcicsXHJcbiAgICAgICAgJ1tyb2xlPVwiZGlhbG9nXCJdJyxcclxuICAgICAgICAnLmxvb2t1cC1mbHlvdXQnLFxyXG4gICAgICAgICcubG9va3VwRmx5b3V0JyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0nLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkxvb2t1cEdyaWRcIl0nLFxyXG4gICAgICAgICcubG9va3VwLWNvbnRhaW5lcicsXHJcbiAgICAgICAgJy5sb29rdXAnLFxyXG4gICAgICAgICdbcm9sZT1cImdyaWRcIl0nLFxyXG4gICAgICAgICd0YWJsZSdcclxuICAgIF07XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9wdXAgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICAgICAgaWYgKCFwb3B1cCkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChwb3B1cC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdtZXNzYWdlQ2VudGVyJykpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAocG9wdXAuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPT09ICdBY3Rpb24gY2VudGVyJykgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZUdsb2JhbChwb3B1cCkpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gcG9wdXA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cERvY2ssIHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDMwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBsZXQgcm93cyA9IGxvb2t1cERvY2s/LnF1ZXJ5U2VsZWN0b3JBbGw/LigndHJbZGF0YS1keW4tcm93XSwgLmxvb2t1cC1yb3csIFtyb2xlPVwicm93XCJdJykgfHwgW107XHJcbiAgICAgICAgaWYgKHJvd3MubGVuZ3RoKSByZXR1cm4gcm93cztcclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IGZpbmQgdmlzaWJsZSBsb29rdXAgcm93cyBhbnl3aGVyZSAoc29tZSBkb2NrcyByZW5kZXIgb3V0c2lkZSB0aGUgY29udGFpbmVyKVxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFJvd3MgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXScpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpO1xyXG4gICAgICAgIGlmIChnbG9iYWxSb3dzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGlja05lYXJlc3RSb3dzKGdsb2JhbFJvd3MsIHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIFtdO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDMwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIGNvbnN0IHRhcmdldFJlY3QgPSB0YXJnZXRFbGVtZW50Py5nZXRCb3VuZGluZ0NsaWVudFJlY3Q/LigpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGRvY2tzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubG9va3VwRG9jay1idXR0b25Db250YWluZXInKSlcclxuICAgICAgICAgICAgLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGRvY2sgPT4gIWRvY2suY2xhc3NMaXN0Py5jb250YWlucygnbWVzc2FnZUNlbnRlcicpKTtcclxuXHJcbiAgICAgICAgaWYgKGRvY2tzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjb25zdCB3aXRoUm93cyA9IGRvY2tzLmZpbHRlcihkb2NrID0+IGRvY2sucXVlcnlTZWxlY3RvcigndHJbZGF0YS1keW4tcm93XSwgLmxvb2t1cC1yb3csIFtyb2xlPVwicm93XCJdLCBbcm9sZT1cImdyaWRcIl0sIHRhYmxlJykpO1xyXG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gd2l0aFJvd3MubGVuZ3RoID8gd2l0aFJvd3MgOiBkb2NrcztcclxuICAgICAgICAgICAgY29uc3QgYmVzdCA9IHBpY2tOZWFyZXN0RG9jayhjYW5kaWRhdGVzLCB0YXJnZXRSZWN0KTtcclxuICAgICAgICAgICAgaWYgKGJlc3QpIHJldHVybiBiZXN0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwaWNrTmVhcmVzdERvY2soZG9ja3MsIHRhcmdldFJlY3QpIHtcclxuICAgIGlmICghZG9ja3MubGVuZ3RoKSByZXR1cm4gbnVsbDtcclxuICAgIGlmICghdGFyZ2V0UmVjdCkgcmV0dXJuIGRvY2tzWzBdO1xyXG4gICAgbGV0IGJlc3QgPSBkb2Nrc1swXTtcclxuICAgIGxldCBiZXN0U2NvcmUgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XHJcbiAgICBmb3IgKGNvbnN0IGRvY2sgb2YgZG9ja3MpIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gZG9jay5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBkeCA9IE1hdGguYWJzKHJlY3QubGVmdCAtIHRhcmdldFJlY3QubGVmdCk7XHJcbiAgICAgICAgY29uc3QgZHkgPSBNYXRoLmFicyhyZWN0LnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICBjb25zdCBzY29yZSA9IGR4ICsgZHk7XHJcbiAgICAgICAgaWYgKHNjb3JlIDwgYmVzdFNjb3JlKSB7XHJcbiAgICAgICAgICAgIGJlc3RTY29yZSA9IHNjb3JlO1xyXG4gICAgICAgICAgICBiZXN0ID0gZG9jaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYmVzdDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMaXN0Ym94Rm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbJ1tyb2xlPVwibGlzdGJveFwiXScsICcuZHJvcERvd25MaXN0JywgJy5jb21ib0JveERyb3BEb3duJywgJy5kcm9wZG93bi1tZW51JywgJy5kcm9wZG93bi1saXN0J107XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBsaXN0cyA9IHNlbGVjdG9ycy5mbGF0TWFwKHNlbCA9PiBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsKSkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbCk7XHJcbiAgICAgICAgaWYgKGxpc3RzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGlja05lYXJlc3REb2NrKGxpc3RzLCB0YXJnZXRSZWN0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxpc3Rib3hGb3JJbnB1dChpbnB1dCwgdGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGxpbmtlZCA9IGdldExpc3Rib3hGcm9tSW5wdXQoaW5wdXQpO1xyXG4gICAgICAgIGlmIChsaW5rZWQgJiYgaXNFbGVtZW50VmlzaWJsZUdsb2JhbChsaW5rZWQpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBsaW5rZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGZhbGxiYWNrID0gYXdhaXQgd2FpdEZvckxpc3Rib3hGb3JFbGVtZW50KHRhcmdldEVsZW1lbnQsIDIwMCk7XHJcbiAgICAgICAgaWYgKGZhbGxiYWNrKSByZXR1cm4gZmFsbGJhY2s7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGlzdGJveEZyb21JbnB1dChpbnB1dCkge1xyXG4gICAgaWYgKCFpbnB1dCkgcmV0dXJuIG51bGw7XHJcbiAgICBjb25zdCBpZCA9IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycpIHx8IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1vd25zJyk7XHJcbiAgICBpZiAoaWQpIHtcclxuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcclxuICAgICAgICBpZiAoZWwpIHJldHVybiBlbDtcclxuICAgIH1cclxuICAgIGNvbnN0IGFjdGl2ZUlkID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnKTtcclxuICAgIGlmIChhY3RpdmVJZCkge1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZUlkKTtcclxuICAgICAgICBjb25zdCBsaXN0ID0gYWN0aXZlPy5jbG9zZXN0Py4oJ1tyb2xlPVwibGlzdGJveFwiXScpO1xyXG4gICAgICAgIGlmIChsaXN0KSByZXR1cm4gbGlzdDtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbWJvQm94QnV0dG9uKGVsZW1lbnQpIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnLmxvb2t1cEJ1dHRvbicsXHJcbiAgICAgICAgJy5jb21ib0JveC1idXR0b24nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtZHJvcERvd25CdXR0b24nLFxyXG4gICAgICAgICcuZHJvcGRvd25CdXR0b24nLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkRyb3BEb3duQnV0dG9uXCJdJyxcclxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwiT3BlblwiXScsXHJcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIlNlbGVjdFwiXSdcclxuICAgIF07XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGJ0biA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGJ0bikgcmV0dXJuIGJ0bjtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAnKSB8fCBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuIG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGJ0biA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoYnRuKSByZXR1cm4gYnRuO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0Q29tYm9PcHRpb25zKGxpc3Rib3gpIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnW3JvbGU9XCJvcHRpb25cIl0nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtbGlzdEl0ZW0nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtaXRlbScsXHJcbiAgICAgICAgJ2xpJyxcclxuICAgICAgICAnLmRyb3Bkb3duLWxpc3QtaXRlbScsXHJcbiAgICAgICAgJy5jb21ib0JveEl0ZW0nLFxyXG4gICAgICAgICcuZHJvcERvd25MaXN0SXRlbScsXHJcbiAgICAgICAgJy5kcm9wZG93bi1pdGVtJ1xyXG4gICAgXTtcclxuICAgIGNvbnN0IGZvdW5kID0gW107XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGxpc3Rib3gucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKGVsKSkgZm91bmQucHVzaChlbCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm91bmQubGVuZ3RoID8gZm91bmQgOiBBcnJheS5mcm9tKGxpc3Rib3guY2hpbGRyZW4pLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgc2xlZXAsIHNldE5hdGl2ZVZhbHVlIH0gZnJvbSAnLi9hc3luYy5qcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHlwZVZhbHVlU2xvd2x5KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBpbnB1dC5jbGljayA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBUeXBlIGNoYXJhY3RlciBieSBjaGFyYWN0ZXJcclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGJ1ZmZlcik7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDgwKTsgLy8gODBtcyBwZXIgY2hhcmFjdGVyXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuYmx1cigpO1xyXG4gICAgYXdhaXQgc2xlZXAoODAwKTsgLy8gV2FpdCBmb3IgdmFsaWRhdGlvblxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHlwZVZhbHVlV2l0aElucHV0RXZlbnRzKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBpbnB1dC5jbGljayA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoODApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlID8/ICcnKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGJ1ZmZlcik7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHsgZGF0YTogY2hhciwgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDYwKTtcclxuICAgIH1cclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9ySW5wdXRWYWx1ZShpbnB1dCwgdmFsdWUsIHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IGV4cGVjdGVkID0gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCk7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudCA9IFN0cmluZyhpbnB1dD8udmFsdWUgPz8gJycpLnRyaW0oKTtcclxuICAgICAgICBpZiAoY3VycmVudCA9PT0gZXhwZWN0ZWQpIHJldHVybiB0cnVlO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRWYWx1ZU9uY2UoaW5wdXQsIHZhbHVlLCBjbGVhckZpcnN0ID0gZmFsc2UpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgaWYgKGNsZWFyRmlyc3QpIHtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBleHBlY3RlZCA9IFN0cmluZyh2YWx1ZSA/PyAnJykudHJpbSgpO1xyXG4gICAgYXdhaXQgc2V0VmFsdWVPbmNlKGlucHV0LCB2YWx1ZSwgdHJ1ZSk7XHJcbiAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG4gICAgaWYgKFN0cmluZyhpbnB1dC52YWx1ZSA/PyAnJykudHJpbSgpICE9PSBleHBlY3RlZCkge1xyXG4gICAgICAgIGF3YWl0IHR5cGVWYWx1ZVNsb3dseShpbnB1dCwgZXhwZWN0ZWQpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT0gOCBDb21ib0JveCBJbnB1dCBNZXRob2RzID09PT09PT09PT09PVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCAxOiBCYXNpYyBzZXRWYWx1ZSAoZmFzdCBidXQgbWF5IG5vdCB0cmlnZ2VyIEQzNjUgZmlsdGVyaW5nKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QxKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCAyOiBQYXN0ZSBzaW11bGF0aW9uIHdpdGggSW5wdXRFdmVudFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QyKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQ2xlYXIgZmlyc3RcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBTaW11bGF0ZSBwYXN0ZVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2JlZm9yZWlucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21QYXN0ZScsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMzogQ2hhcmFjdGVyLWJ5LWNoYXJhY3RlciB3aXRoIGZ1bGwga2V5IGV2ZW50cyAoUkVDT01NRU5ERUQpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBDbGVhciB0aGUgaW5wdXQgZmlyc3RcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBrZXlkb3duXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgYmVmb3JlaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSB2YWx1ZVxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGlucHV0IGV2ZW50XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGtleXVwXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA0OiBDaGFyYWN0ZXItYnktY2hhcmFjdGVyIHdpdGgga2V5cHJlc3MgKGxlZ2FjeSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNChpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGNvbnN0IGNoYXJDb2RlID0gY2hhci5jaGFyQ29kZUF0KDApO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8ga2V5ZG93blxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8ga2V5cHJlc3MgKGRlcHJlY2F0ZWQgYnV0IHN0aWxsIHVzZWQgYnkgc29tZSBmcmFtZXdvcmtzKVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXByZXNzJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBjaGFyQ29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gYmVmb3JlaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSB2YWx1ZVxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICAvLyBpbnB1dFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8ga2V5dXBcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA1OiBleGVjQ29tbWFuZCBpbnNlcnRUZXh0XHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDUoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBTZWxlY3QgYWxsIGFuZCBkZWxldGVcclxuICAgIGlucHV0LnNlbGVjdCgpO1xyXG4gICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2RlbGV0ZScpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIEluc2VydCB0ZXh0XHJcbiAgICBkb2N1bWVudC5leGVjQ29tbWFuZCgnaW5zZXJ0VGV4dCcsIGZhbHNlLCB2YWx1ZSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA2OiBQYXN0ZSArIEJhY2tzcGFjZSB3b3JrYXJvdW5kXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDYoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBTZXQgdmFsdWUgZGlyZWN0bHkgKGxpa2UgcGFzdGUpXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBBZGQgYSBjaGFyYWN0ZXIgYW5kIGRlbGV0ZSBpdCB0byB0cmlnZ2VyIGZpbHRlcmluZ1xyXG4gICAgY29uc3QgdmFsdWVXaXRoRXh0cmEgPSB2YWx1ZSArICdYJztcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZVdpdGhFeHRyYSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgIGRhdGE6ICdYJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBOb3cgZGVsZXRlIHRoYXQgY2hhcmFjdGVyIHdpdGggYSByZWFsIGJhY2tzcGFjZSBldmVudFxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHtcclxuICAgICAgICBrZXk6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGNvZGU6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGtleUNvZGU6IDgsXHJcbiAgICAgICAgd2hpY2g6IDgsXHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHtcclxuICAgICAgICBrZXk6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGNvZGU6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGtleUNvZGU6IDgsXHJcbiAgICAgICAgd2hpY2g6IDgsXHJcbiAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNzogRDM2NSBpbnRlcm5hbCBtZWNoYW5pc20gdHJpZ2dlclxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q3KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2V0IHZhbHVlIHdpdGggZnVsbCBldmVudCBzZXF1ZW5jZSB1c2VkIGJ5IEQzNjVcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFR5cGUgY2hhcmFjdGVyIGJ5IGNoYXJhY3RlciBidXQgYWxzbyBkaXNwYXRjaCBvbiB0aGUgcGFyZW50IGNvbnRyb2xcclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGNvbnN0IHBhcmVudCA9IGlucHV0LmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlXScpIHx8IGlucHV0LnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBpbnB1dC52YWx1ZSArIGNoYXI7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBhIGNvbXByZWhlbnNpdmUgZXZlbnQgc2V0XHJcbiAgICAgICAgY29uc3Qga2V5Ym9hcmRFdmVudEluaXQgPSB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBjb21wb3NlZDogdHJ1ZSxcclxuICAgICAgICAgICAgdmlldzogd2luZG93XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBvbiBpbnB1dCBhbmQgcG90ZW50aWFsbHkgYnViYmxlIHRvIEQzNjUgaGFuZGxlcnNcclxuICAgICAgICBjb25zdCBrZXlkb3duRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIGtleWJvYXJkRXZlbnRJbml0KTtcclxuICAgICAgICBjb25zdCBrZXl1cEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywga2V5Ym9hcmRFdmVudEluaXQpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KGtleWRvd25FdmVudCk7XHJcblxyXG4gICAgICAgIC8vIFNldCB2YWx1ZSBCRUZPUkUgaW5wdXQgZXZlbnRcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyLFxyXG4gICAgICAgICAgICBjb21wb3NlZDogdHJ1ZSxcclxuICAgICAgICAgICAgdmlldzogd2luZG93XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KGtleXVwRXZlbnQpO1xyXG5cclxuICAgICAgICAvLyBBbHNvIGRpc3BhdGNoIG9uIHBhcmVudCBmb3IgRDM2NSBjb250cm9sc1xyXG4gICAgICAgIGlmIChwYXJlbnQgJiYgcGFyZW50ICE9PSBpbnB1dCkge1xyXG4gICAgICAgICAgICBwYXJlbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5hbCBjaGFuZ2UgZXZlbnRcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIC8vIFRyeSB0byB0cmlnZ2VyIEQzNjUncyBWYWx1ZUNoYW5nZWQgY29tbWFuZFxyXG4gICAgaWYgKHBhcmVudCkge1xyXG4gICAgICAgIHBhcmVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnVmFsdWVDaGFuZ2VkJywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBkZXRhaWw6IHsgdmFsdWU6IHZhbHVlIH1cclxuICAgICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA4OiBDb21wb3NpdGlvbiBldmVudHMgKElNRS1zdHlsZSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kOChpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gU3RhcnQgY29tcG9zaXRpb25cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoJ2NvbXBvc2l0aW9uc3RhcnQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgIGRhdGE6ICcnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGN1cnJlbnRWYWx1ZSA9ICcnO1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjdXJyZW50VmFsdWUgKz0gc3RyaW5nVmFsdWVbaV07XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoJ2NvbXBvc2l0aW9udXBkYXRlJywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBkYXRhOiBjdXJyZW50VmFsdWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0Q29tcG9zaXRpb25UZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY3VycmVudFZhbHVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRW5kIGNvbXBvc2l0aW9uXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbmVuZCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tQ29tcG9zaXRpb24nLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEhlbHBlciB0byBnZXQga2V5IGNvZGUgZnJvbSBjaGFyYWN0ZXJcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRLZXlDb2RlKGNoYXIpIHtcclxuICAgIGNvbnN0IHVwcGVyQ2hhciA9IGNoYXIudG9VcHBlckNhc2UoKTtcclxuICAgIGlmICh1cHBlckNoYXIgPj0gJ0EnICYmIHVwcGVyQ2hhciA8PSAnWicpIHtcclxuICAgICAgICByZXR1cm4gJ0tleScgKyB1cHBlckNoYXI7XHJcbiAgICB9XHJcbiAgICBpZiAoY2hhciA+PSAnMCcgJiYgY2hhciA8PSAnOScpIHtcclxuICAgICAgICByZXR1cm4gJ0RpZ2l0JyArIGNoYXI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBzcGVjaWFsS2V5cyA9IHtcclxuICAgICAgICAnICc6ICdTcGFjZScsXHJcbiAgICAgICAgJy0nOiAnTWludXMnLFxyXG4gICAgICAgICc9JzogJ0VxdWFsJyxcclxuICAgICAgICAnWyc6ICdCcmFja2V0TGVmdCcsXHJcbiAgICAgICAgJ10nOiAnQnJhY2tldFJpZ2h0JyxcclxuICAgICAgICAnXFxcXCc6ICdCYWNrc2xhc2gnLFxyXG4gICAgICAgICc7JzogJ1NlbWljb2xvbicsXHJcbiAgICAgICAgXCInXCI6ICdRdW90ZScsXHJcbiAgICAgICAgJywnOiAnQ29tbWEnLFxyXG4gICAgICAgICcuJzogJ1BlcmlvZCcsXHJcbiAgICAgICAgJy8nOiAnU2xhc2gnLFxyXG4gICAgICAgICdgJzogJ0JhY2txdW90ZSdcclxuICAgIH07XHJcbiAgICByZXR1cm4gc3BlY2lhbEtleXNbY2hhcl0gfHwgJ1VuaWRlbnRpZmllZCc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEaXNwYXRjaGVyIGZ1bmN0aW9uIC0gdXNlcyB0aGUgc2VsZWN0ZWQgaW5wdXQgbWV0aG9kIGZyb20gc2V0dGluZ3NcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgbWV0aG9kKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgW0QzNjVdIFVzaW5nIGNvbWJvYm94IGlucHV0IG1ldGhvZDogJHttZXRob2R9YCk7XHJcblxyXG4gICAgc3dpdGNoIChtZXRob2QpIHtcclxuICAgICAgICBjYXNlICdtZXRob2QxJzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QxKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kMic6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMihpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDMnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q0JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q0KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNSc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDYnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDYoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q3JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q3KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kOCc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kOChpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMyhpbnB1dCwgdmFsdWUpOyAvLyBEZWZhdWx0IHRvIG1ldGhvZCAzXHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb21taXRDb21ib1ZhbHVlKGlucHV0LCB2YWx1ZSwgZWxlbWVudCkge1xyXG4gICAgaWYgKCFpbnB1dCkgcmV0dXJuO1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnZm9jdXNvdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VzY2FwZScsIGNvZGU6ICdFc2NhcGUnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFc2NhcGUnLCBjb2RlOiAnRXNjYXBlJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5ibHVyKCk7XHJcbiAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB9XHJcbiAgICBkb2N1bWVudC5ib2R5Py5jbGljaz8uKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkaXNwYXRjaENsaWNrU2VxdWVuY2UodGFyZ2V0KSB7XHJcbiAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVydXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmNsaWNrKCk7XHJcbn1cclxuIiwgImV4cG9ydCBmdW5jdGlvbiBwYXJzZUdyaWRBbmRDb2x1bW4oY29udHJvbE5hbWUpIHtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKGNvbnRyb2xOYW1lIHx8ICcnKTtcbiAgICBjb25zdCBsYXN0VW5kZXJzY29yZUlkeCA9IHRleHQubGFzdEluZGV4T2YoJ18nKTtcbiAgICBpZiAobGFzdFVuZGVyc2NvcmVJZHggPD0gMCB8fCBsYXN0VW5kZXJzY29yZUlkeCA9PT0gdGV4dC5sZW5ndGggLSAxKSB7XG4gICAgICAgIHJldHVybiB7IGdyaWROYW1lOiB0ZXh0LCBjb2x1bW5OYW1lOiAnJyB9O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBncmlkTmFtZTogdGV4dC5zdWJzdHJpbmcoMCwgbGFzdFVuZGVyc2NvcmVJZHgpLFxuICAgICAgICBjb2x1bW5OYW1lOiB0ZXh0LnN1YnN0cmluZyhsYXN0VW5kZXJzY29yZUlkeCArIDEpXG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmlsdGVyRmllbGRQYXR0ZXJucyhjb250cm9sTmFtZSwgZ3JpZE5hbWUsIGNvbHVtbk5hbWUpIHtcbiAgICByZXR1cm4gW1xuICAgICAgICBgRmlsdGVyRmllbGRfJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV8ke2NvbHVtbk5hbWV9X0lucHV0XzBgLFxuICAgICAgICBgRmlsdGVyRmllbGRfJHtjb250cm9sTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Y29udHJvbE5hbWV9X0lucHV0XzBgLFxuICAgICAgICBgRmlsdGVyRmllbGRfJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYCR7Y29udHJvbE5hbWV9X0ZpbHRlckZpZWxkX0lucHV0YCxcbiAgICAgICAgYCR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fRmlsdGVyRmllbGRgXG4gICAgXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQXBwbHlCdXR0b25QYXR0ZXJucyhjb250cm9sTmFtZSwgZ3JpZE5hbWUsIGNvbHVtbk5hbWUpIHtcbiAgICByZXR1cm4gW1xuICAgICAgICBgJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV9BcHBseUZpbHRlcnNgLFxuICAgICAgICBgJHtjb250cm9sTmFtZX1fQXBwbHlGaWx0ZXJzYCxcbiAgICAgICAgYCR7Z3JpZE5hbWV9X0FwcGx5RmlsdGVyc2AsXG4gICAgICAgICdBcHBseUZpbHRlcnMnXG4gICAgXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZpbHRlck1ldGhvZFNlYXJjaFRlcm1zKG1ldGhvZCkge1xuICAgIGNvbnN0IG1ldGhvZE1hcHBpbmdzID0ge1xuICAgICAgICAnaXMgZXhhY3RseSc6IFsnaXMgZXhhY3RseScsICdlcXVhbHMnLCAnaXMgZXF1YWwgdG8nLCAnPSddLFxuICAgICAgICBjb250YWluczogWydjb250YWlucycsICdsaWtlJ10sXG4gICAgICAgICdiZWdpbnMgd2l0aCc6IFsnYmVnaW5zIHdpdGgnLCAnc3RhcnRzIHdpdGgnXSxcbiAgICAgICAgJ2lzIG5vdCc6IFsnaXMgbm90JywgJ25vdCBlcXVhbCcsICchPScsICc8PiddLFxuICAgICAgICAnZG9lcyBub3QgY29udGFpbic6IFsnZG9lcyBub3QgY29udGFpbicsICdub3QgbGlrZSddLFxuICAgICAgICAnaXMgb25lIG9mJzogWydpcyBvbmUgb2YnLCAnaW4nXSxcbiAgICAgICAgYWZ0ZXI6IFsnYWZ0ZXInLCAnZ3JlYXRlciB0aGFuJywgJz4nXSxcbiAgICAgICAgYmVmb3JlOiBbJ2JlZm9yZScsICdsZXNzIHRoYW4nLCAnPCddLFxuICAgICAgICBtYXRjaGVzOiBbJ21hdGNoZXMnLCAncmVnZXgnLCAncGF0dGVybiddXG4gICAgfTtcbiAgICByZXR1cm4gbWV0aG9kTWFwcGluZ3NbbWV0aG9kXSB8fCBbU3RyaW5nKG1ldGhvZCB8fCAnJyldO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGV4dEluY2x1ZGVzQW55KHRleHQsIHRlcm1zKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFRleHQgPSBTdHJpbmcodGV4dCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICByZXR1cm4gKHRlcm1zIHx8IFtdKS5zb21lKHRlcm0gPT4gbm9ybWFsaXplZFRleHQuaW5jbHVkZXMoU3RyaW5nKHRlcm0gfHwgJycpLnRvTG93ZXJDYXNlKCkpKTtcbn1cbiIsICJpbXBvcnQgeyBsb2dTdGVwIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2luZy5qcyc7XHJcbmltcG9ydCB7IHNldE5hdGl2ZVZhbHVlLCBzbGVlcCB9IGZyb20gJy4uL3V0aWxzL2FzeW5jLmpzJztcclxuaW1wb3J0IHsgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsIGlzRWxlbWVudFZpc2libGUsIGlzRDM2NUxvYWRpbmcsIGlzRDM2NVByb2Nlc3NpbmdNZXNzYWdlLCBmaW5kR3JpZENlbGxFbGVtZW50LCBoYXNMb29rdXBCdXR0b24sIGZpbmRMb29rdXBCdXR0b24sIGZpbmRMb29rdXBGaWx0ZXJJbnB1dCwgZ2V0R3JpZFJvd0NvdW50LCBnZXRHcmlkU2VsZWN0ZWRSb3cgfSBmcm9tICcuLi91dGlscy9kb20uanMnO1xyXG5pbXBvcnQgeyB3YWl0Rm9yTG9va3VwUG9wdXAsIHdhaXRGb3JMb29rdXBSb3dzLCB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQsIHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQsIGNvbGxlY3RDb21ib09wdGlvbnMsIGZpbmRDb21ib0JveEJ1dHRvbiB9IGZyb20gJy4uL3V0aWxzL2xvb2t1cC5qcyc7XHJcbmltcG9ydCB7IHR5cGVWYWx1ZVNsb3dseSwgdHlwZVZhbHVlV2l0aElucHV0RXZlbnRzLCB3YWl0Rm9ySW5wdXRWYWx1ZSwgc2V0VmFsdWVPbmNlLCBzZXRWYWx1ZVdpdGhWZXJpZnksIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QgYXMgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZFdpdGhNb2RlLCBjb21taXRDb21ib1ZhbHVlLCBkaXNwYXRjaENsaWNrU2VxdWVuY2UgfSBmcm9tICcuLi91dGlscy9jb21ib2JveC5qcyc7XHJcbmltcG9ydCB7IGNvZXJjZUJvb2xlYW4sIG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuLi91dGlscy90ZXh0LmpzJztcclxuaW1wb3J0IHsgTmF2aWdhdGlvbkludGVycnVwdEVycm9yIH0gZnJvbSAnLi4vcnVudGltZS9lcnJvcnMuanMnO1xyXG5pbXBvcnQgeyBnZXRXb3JrZmxvd1RpbWluZ3MgfSBmcm9tICcuLi9ydW50aW1lL3RpbWluZy5qcyc7XHJcbmltcG9ydCB7IHBhcnNlR3JpZEFuZENvbHVtbiwgYnVpbGRGaWx0ZXJGaWVsZFBhdHRlcm5zLCBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMsIGdldEZpbHRlck1ldGhvZFNlYXJjaFRlcm1zLCB0ZXh0SW5jbHVkZXNBbnkgfSBmcm9tICcuL2FjdGlvbi1oZWxwZXJzLmpzJztcclxuXHJcbmZ1bmN0aW9uIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGNvbnN0IG1ldGhvZCA9IGNvbWJvTWV0aG9kT3ZlcnJpZGUgfHwgd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uY29tYm9TZWxlY3RNb2RlIHx8ICdtZXRob2QzJztcclxuICAgIHJldHVybiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUoaW5wdXQsIHZhbHVlLCBtZXRob2QpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRUaW1pbmdzKCkge1xyXG4gICAgcmV0dXJuIGdldFdvcmtmbG93VGltaW5ncyh3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzIHx8IHt9KTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvclRpbWluZyhrZXkpIHtcclxuICAgIGF3YWl0IHNsZWVwKGdldFRpbWluZ3MoKVtrZXldKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSB7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ1NlZ21lbnRlZEVudHJ5JykgcmV0dXJuIHRydWU7XHJcbiAgICBpZiAoZWxlbWVudC5jbG9zZXN0Py4oJ1tkYXRhLWR5bi1yb2xlPVwiU2VnbWVudGVkRW50cnlcIl0nKSkgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgY29uc3QgY2xhc3NMaXN0ID0gZWxlbWVudC5jbGFzc0xpc3Q7XHJcbiAgICBpZiAoY2xhc3NMaXN0ICYmIChjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZEVudHJ5JykgfHxcclxuICAgICAgICBjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZC1lbnRyeScpIHx8XHJcbiAgICAgICAgY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWdtZW50ZWRFbnRyeS1zZWdtZW50SW5wdXQnKSkpIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gISFlbGVtZW50LnF1ZXJ5U2VsZWN0b3I/LignLnNlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCwgLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsaWNrRWxlbWVudChjb250cm9sTmFtZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBEZXRlY3QgaWYgdGhpcyBpcyBhbiBcIkFkZCBsaW5lXCIgLyBcIk5ld1wiIGJ1dHRvbiBjbGljayBvbiBhIGdyaWQuXHJcbiAgICAvLyBJZiBzbywgd2UgcmVjb3JkIHRoZSByb3cgY291bnQgYmVmb3JlIGNsaWNraW5nIHNvIHdlIGNhbiB3YWl0IGZvclxyXG4gICAgLy8gdGhlIG5ldyByb3cgdG8gYWN0dWFsbHkgYXBwZWFyIGFuZCBiZWNvbWUgc2VsZWN0ZWQgYWZ0ZXJ3YXJkcy5cclxuICAgIGNvbnN0IGlzQWRkTGluZUNsaWNrID0gaXNHcmlkQWRkTGluZUJ1dHRvbihjb250cm9sTmFtZSwgZWxlbWVudCk7XHJcbiAgICBsZXQgcm93Q291bnRCZWZvcmUgPSAwO1xyXG4gICAgbGV0IHNlbGVjdGVkUm93QmVmb3JlID0gbnVsbDtcclxuICAgIGlmIChpc0FkZExpbmVDbGljaykge1xyXG4gICAgICAgIHJvd0NvdW50QmVmb3JlID0gZ2V0R3JpZFJvd0NvdW50KCk7XHJcbiAgICAgICAgc2VsZWN0ZWRSb3dCZWZvcmUgPSBnZXRHcmlkU2VsZWN0ZWRSb3coKTtcclxuICAgICAgICBsb2dTdGVwKGBBZGQtbGluZSBkZXRlY3RlZCAoXCIke2NvbnRyb2xOYW1lfVwiKS4gUm93cyBiZWZvcmU6ICR7cm93Q291bnRCZWZvcmV9LCBgICtcclxuICAgICAgICAgICAgICAgIGBzZWxlY3RlZCByb3cgaW5kZXg6ICR7c2VsZWN0ZWRSb3dCZWZvcmU/LnJvd0luZGV4ID8/ICdub25lJ31gKTtcclxuICAgIH1cclxuXHJcbiAgICBlbGVtZW50LmNsaWNrKCk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdDTElDS19BTklNQVRJT05fREVMQVknKTtcclxuXHJcbiAgICAvLyBBZnRlciB0aGUgZml4ZWQgZGVsYXksIHBvbGwgYnJpZWZseSB3aGlsZSBEMzY1IGlzIHN0aWxsIGxvYWRpbmcuXHJcbiAgICAvLyBUaGlzIHByZXZlbnRzIHRoZSBzdGVwIGZyb20gY29tcGxldGluZyBiZWZvcmUgYSBzZXJ2ZXItdHJpZ2dlcmVkXHJcbiAgICAvLyBkaWFsb2cgKGUuZy4gZGVsZXRlIGNvbmZpcm1hdGlvbikgaGFzIGJlZW4gcmVuZGVyZWQgaW50byB0aGUgRE9NLlxyXG4gICAgY29uc3QgbWF4TG9hZGluZ1BvbGxzID0gMjA7ICAgICAgICAgICAvLyB1cCB0byB+MiBzIGFkZGl0aW9uYWwgd2FpdFxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXhMb2FkaW5nUG9sbHM7IGkrKykge1xyXG4gICAgICAgIGlmICghaXNEMzY1TG9hZGluZygpKSBicmVhaztcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFdhaXQgZm9yIFwiUGxlYXNlIHdhaXQuIFdlJ3JlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LlwiIG1lc3NhZ2VzLlxyXG4gICAgLy8gRDM2NSBzaG93cyB0aGVzZSBkdXJpbmcgc2VydmVyLXNpZGUgb3BlcmF0aW9ucyAoZS5nLiBhZnRlciBjbGlja2luZyBPS1xyXG4gICAgLy8gb24gdGhlIENyZWF0ZSBTYWxlcyBPcmRlciBkaWFsb2cpLiAgV2UgcG9sbCB3aXRoIGEgZ2VuZXJvdXMgdGltZW91dFxyXG4gICAgLy8gc2luY2UgdGhlc2Ugb3BlcmF0aW9ucyBjYW4gdGFrZSAzMCsgc2Vjb25kcy5cclxuICAgIGlmIChpc0QzNjVQcm9jZXNzaW5nTWVzc2FnZSgpKSB7XHJcbiAgICAgICAgbG9nU3RlcChgUHJvY2Vzc2luZyBtZXNzYWdlIGRldGVjdGVkIGFmdGVyIGNsaWNraW5nIFwiJHtjb250cm9sTmFtZX1cIi4gV2FpdGluZyBmb3IgaXQgdG8gY2xlYXIuLi5gKTtcclxuICAgICAgICBjb25zdCBwcm9jZXNzaW5nU3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgICAgIGNvbnN0IG1heFByb2Nlc3NpbmdXYWl0ID0gMTIwMDAwOyAvLyB1cCB0byAyIG1pbnV0ZXMgZm9yIGhlYXZ5IG9wZXJhdGlvbnNcclxuICAgICAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHByb2Nlc3NpbmdTdGFydCA8IG1heFByb2Nlc3NpbmdXYWl0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgICAgIGlmICghaXNEMzY1UHJvY2Vzc2luZ01lc3NhZ2UoKSAmJiAhaXNEMzY1TG9hZGluZygpKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBFeHRyYSBzdGFiaWxpc2F0aW9uOiBEMzY1IG1heSBmbGFzaCBuZXcgVUkgZWxlbWVudHNcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzRDM2NVByb2Nlc3NpbmdNZXNzYWdlKCkgJiYgIWlzRDM2NUxvYWRpbmcoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYFByb2Nlc3NpbmcgbWVzc2FnZSBjbGVhcmVkIGFmdGVyICR7TWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIHByb2Nlc3NpbmdTdGFydCkgLyAxMDAwKX1zYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGlzRDM2NVByb2Nlc3NpbmdNZXNzYWdlKCkpIHtcclxuICAgICAgICAgICAgbG9nU3RlcChgV2FybmluZzogUHJvY2Vzc2luZyBtZXNzYWdlIHN0aWxsIHZpc2libGUgYWZ0ZXIgJHttYXhQcm9jZXNzaW5nV2FpdCAvIDEwMDB9c2ApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgXCJBZGQgbGluZVwiIGNsaWNrcywgd2FpdCB1bnRpbCB0aGUgbmV3IHJvdyBhY3R1YWxseSBhcHBlYXJzIGluXHJcbiAgICAvLyB0aGUgRE9NIGFuZCBpcyBtYXJrZWQgYXMgc2VsZWN0ZWQvYWN0aXZlLiAgVGhpcyBjbG9zZXMgdGhlIHJhY2VcclxuICAgIC8vIGNvbmRpdGlvbiB3aGVyZSBgc2V0R3JpZENlbGxWYWx1ZWAgd291bGQgdGFyZ2V0IHRoZSBvbGQgcm93LlxyXG4gICAgaWYgKGlzQWRkTGluZUNsaWNrKSB7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvck5ld0dyaWRSb3cocm93Q291bnRCZWZvcmUsIHNlbGVjdGVkUm93QmVmb3JlLCA4MDAwKTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIERldGVjdCB3aGV0aGVyIGEgY29udHJvbE5hbWUgLyBlbGVtZW50IHJlcHJlc2VudHMgYSBncmlkIFwiQWRkIGxpbmVcIiBvclxyXG4gKiBcIk5ld1wiIGJ1dHRvbi4gIENoZWNrcyBib3RoIHRoZSBjb250cm9sIG5hbWUgYW5kIHRoZSBlbGVtZW50J3MgbGFiZWwvdGV4dC5cclxuICovXHJcbmZ1bmN0aW9uIGlzR3JpZEFkZExpbmVCdXR0b24oY29udHJvbE5hbWUsIGVsZW1lbnQpIHtcclxuICAgIGNvbnN0IG5hbWUgPSAoY29udHJvbE5hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAvLyBDb21tb24gRDM2NSBjb250cm9sIG5hbWVzIGZvciBhZGQtbGluZSBidXR0b25zXHJcbiAgICBjb25zdCBhZGRMaW5lTmFtZXMgPSBbXHJcbiAgICAgICAgJ3N5c3RlbWRlZmluZWRuZXdidXR0b24nLCAnbGluZXN0cmlwbmV3JywgJ25ld2xpbmUnLFxyXG4gICAgICAgICdhZGRsaW5lJywgJ2FkZF9saW5lJywgJ2dyaWRhZGRuZXcnLCAnYnV0dG9uY3JlYXRlJyxcclxuICAgICAgICAnbmV3YnV0dG9uJywgJ3N5c3RlbWRlZmluZWRhZGRidXR0b24nXHJcbiAgICBdO1xyXG4gICAgaWYgKGFkZExpbmVOYW1lcy5zb21lKG4gPT4gbmFtZS5pbmNsdWRlcyhuKSkpIHJldHVybiB0cnVlO1xyXG5cclxuICAgIC8vIENoZWNrIHZpc2libGUgbGFiZWwgLyBhcmlhLWxhYmVsXHJcbiAgICBjb25zdCBsYWJlbCA9IChlbGVtZW50Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBjb25zdCBhcmlhTGFiZWwgPSAoZWxlbWVudD8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBjb25zdCBjb21iaW5lZCA9IGAke2xhYmVsfSAke2FyaWFMYWJlbH1gO1xyXG4gICAgaWYgKC9cXGJhZGRcXHMqbGluZVxcYi8udGVzdChjb21iaW5lZCkgfHwgL1xcYm5ld1xccypsaW5lXFxiLy50ZXN0KGNvbWJpbmVkKSB8fFxyXG4gICAgICAgIC9cXCtcXHMqYWRkXFxzKmxpbmUvaS50ZXN0KGNvbWJpbmVkKSkge1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGlmIGVsZW1lbnQgaXMgaW5zaWRlIGEgZ3JpZCB0b29sYmFyIGFyZWFcclxuICAgIGNvbnN0IHRvb2xiYXIgPSBlbGVtZW50Py5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkFjdGlvblBhbmVcIl0sIFtyb2xlPVwidG9vbGJhclwiXSwgLmJ1dHRvblN0cmlwJyk7XHJcbiAgICBpZiAodG9vbGJhciAmJiAvXFxibmV3XFxiL2kudGVzdChjb21iaW5lZCkpIHJldHVybiB0cnVlO1xyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEFmdGVyIGNsaWNraW5nIGFuIFwiQWRkIGxpbmVcIiBidXR0b24sIHdhaXQgZm9yIHRoZSBncmlkIHRvIHJlZmxlY3QgdGhlXHJcbiAqIG5ldyByb3cuICBXZSByZXF1aXJlOlxyXG4gKiAgIDEuIFRoZSB2aXNpYmxlIHJvdyBjb3VudCBoYXMgaW5jcmVhc2VkLCBPUlxyXG4gKiAgIDIuIEEgZGlmZmVyZW50IHJvdyBpcyBub3cgc2VsZWN0ZWQgKGl0cyBpbmRleCBjaGFuZ2VkKSwgQU5EXHJcbiAqICAgMy4gVGhlIG5ld2x5IHNlbGVjdGVkIHJvdyBpcyBOT1QgdGhlIHNhbWUgcm93IHRoYXQgd2FzIHNlbGVjdGVkIGJlZm9yZS5cclxuICpcclxuICogV2UgYWxzbyBzdG9yZSBhIG1hcmtlciBvbiBgd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93YCBzbyB0aGF0XHJcbiAqIGBmaW5kR3JpZENlbGxFbGVtZW50YCBjYW4gcHJlZmVyIHRoZSBjb3JyZWN0IHJvdyBpZiB0aGUgYGFyaWEtc2VsZWN0ZWRgXHJcbiAqIGF0dHJpYnV0ZSBoYXNuJ3QgZmxpcHBlZCB5ZXQuXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yTmV3R3JpZFJvdyhyb3dDb3VudEJlZm9yZSwgc2VsZWN0ZWRSb3dCZWZvcmUsIHRpbWVvdXQgPSA4MDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCBwcmV2SWR4ID0gc2VsZWN0ZWRSb3dCZWZvcmU/LnJvd0luZGV4ID8/IC0xO1xyXG4gICAgbGV0IHNldHRsZWQgPSBmYWxzZTtcclxuXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dCkge1xyXG4gICAgICAgIC8vIFdhaXQgZm9yIGxvYWRpbmcgdG8gY29tcGxldGUgZmlyc3RcclxuICAgICAgICBpZiAoaXNEMzY1TG9hZGluZygpKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudENvdW50ID0gZ2V0R3JpZFJvd0NvdW50KCk7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFNlbGVjdGVkID0gZ2V0R3JpZFNlbGVjdGVkUm93KCk7XHJcbiAgICAgICAgY29uc3QgY3VySWR4ID0gY3VycmVudFNlbGVjdGVkPy5yb3dJbmRleCA/PyAtMTtcclxuXHJcbiAgICAgICAgLy8gU3VjY2VzcyBjb25kaXRpb25zOlxyXG4gICAgICAgIC8vICAgYSkgUm93IGNvdW50IHdlbnQgdXAgQU5EIGEgcm93IGlzIG5vdyBzZWxlY3RlZFxyXG4gICAgICAgIC8vICAgYikgQSByb3cgaXMgc2VsZWN0ZWQgQU5EIGl0cyBpbmRleCBpcyBoaWdoZXIgdGhhbiB0aGUgb2xkIG9uZVxyXG4gICAgICAgIC8vICAgICAgKGhhbmRsZXMgY2FzZXMgd2hlcmUgRE9NIHJvdyBjb3VudCBzdGF5cyB0aGUgc2FtZSBkdWUgdG9cclxuICAgICAgICAvLyAgICAgICB2aXJ0dWFsaXNhdGlvbiBidXQgRDM2NSBtb3ZlZCB0aGUgc2VsZWN0aW9uIHRvIGEgbmV3IHJvdylcclxuICAgICAgICBjb25zdCByb3dDb3VudEluY3JlYXNlZCA9IGN1cnJlbnRDb3VudCA+IHJvd0NvdW50QmVmb3JlO1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdGlvbkNoYW5nZWRUb05ld2VyUm93ID0gY3VySWR4ID49IDAgJiYgY3VySWR4ICE9PSBwcmV2SWR4ICYmIGN1cklkeCA+PSBwcmV2SWR4O1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdGlvbkV4aXN0cyA9IGN1cklkeCA+PSAwO1xyXG5cclxuICAgICAgICBpZiAoKHJvd0NvdW50SW5jcmVhc2VkICYmIHNlbGVjdGlvbkV4aXN0cykgfHwgc2VsZWN0aW9uQ2hhbmdlZFRvTmV3ZXJSb3cpIHtcclxuICAgICAgICAgICAgLy8gRXh0cmEgc3RhYmlsaXNhdGlvbjogd2FpdCBhIHNob3J0IHBlcmlvZCBhbmQgdmVyaWZ5IHRoZSBzZWxlY3Rpb24gaXMgc3RhYmxlXHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDE1MCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHZlcmlmeVNlbGVjdGVkID0gZ2V0R3JpZFNlbGVjdGVkUm93KCk7XHJcbiAgICAgICAgICAgIGlmICh2ZXJpZnlTZWxlY3RlZCAmJiB2ZXJpZnlTZWxlY3RlZC5yb3dJbmRleCA9PT0gY3VySWR4KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTdG9yZSB0aGlzIHJvdyBlbGVtZW50IHNvIGZpbmRHcmlkQ2VsbEVsZW1lbnQgY2FuIHVzZSBpdFxyXG4gICAgICAgICAgICAgICAgd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93ID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJvd0VsZW1lbnQ6IGN1cnJlbnRTZWxlY3RlZC5yb3csXHJcbiAgICAgICAgICAgICAgICAgICAgcm93SW5kZXg6IGN1cklkeCxcclxuICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBsb2dTdGVwKGBOZXcgZ3JpZCByb3cgY29uZmlybWVkLiBSb3dzOiAke3Jvd0NvdW50QmVmb3JlfSAtPiAke2N1cnJlbnRDb3VudH0sIGAgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBgc2VsZWN0ZWQgcm93OiAke3ByZXZJZHh9IC0+ICR7Y3VySWR4fWApO1xyXG4gICAgICAgICAgICAgICAgc2V0dGxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTIwKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXNldHRsZWQpIHtcclxuICAgICAgICAvLyBFdmVuIGlmIHdlIHRpbWVkIG91dCwgdHJ5IHRvIG1hcmsgdGhlIGxhc3QgdmlzaWJsZSByb3cgYXMgcGVuZGluZ1xyXG4gICAgICAgIC8vIHNvIGZpbmRHcmlkQ2VsbEVsZW1lbnQgaGFzIGEgYmV0dGVyIGZhbGxiYWNrLlxyXG4gICAgICAgIGNvbnN0IGxhc3RTZWxlY3RlZCA9IGdldEdyaWRTZWxlY3RlZFJvdygpO1xyXG4gICAgICAgIGlmIChsYXN0U2VsZWN0ZWQpIHtcclxuICAgICAgICAgICAgd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93ID0ge1xyXG4gICAgICAgICAgICAgICAgcm93RWxlbWVudDogbGFzdFNlbGVjdGVkLnJvdyxcclxuICAgICAgICAgICAgICAgIHJvd0luZGV4OiBsYXN0U2VsZWN0ZWQucm93SW5kZXgsXHJcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogd2FpdEZvck5ld0dyaWRSb3cgdGltZWQgb3V0IGFmdGVyICR7dGltZW91dH1tcy4gYCArXHJcbiAgICAgICAgICAgICAgICBgUm93czogJHtyb3dDb3VudEJlZm9yZX0gLT4gJHtnZXRHcmlkUm93Q291bnQoKX0sIGAgK1xyXG4gICAgICAgICAgICAgICAgYHNlbGVjdGVkOiAke3ByZXZJZHh9IC0+ICR7bGFzdFNlbGVjdGVkPy5yb3dJbmRleCA/PyAnbm9uZSd9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseUdyaWRGaWx0ZXIoY29udHJvbE5hbWUsIGZpbHRlclZhbHVlLCBmaWx0ZXJNZXRob2QgPSAnaXMgZXhhY3RseScsIGNvbWJvTWV0aG9kT3ZlcnJpZGUgPSAnJykge1xyXG4gICAgXHJcbiAgICAvLyBFeHRyYWN0IGdyaWQgbmFtZSBhbmQgY29sdW1uIG5hbWUgZnJvbSBjb250cm9sTmFtZVxyXG4gICAgLy8gRm9ybWF0OiBHcmlkTmFtZV9Db2x1bW5OYW1lIChlLmcuLCBcIkdyaWRSZWFkT25seU1hcmt1cFRhYmxlX01hcmt1cENvZGVcIilcclxuICAgIGNvbnN0IHsgZ3JpZE5hbWUsIGNvbHVtbk5hbWUgfSA9IHBhcnNlR3JpZEFuZENvbHVtbihjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIFxyXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGZpbmQgZmlsdGVyIGlucHV0IHdpdGggbXVsdGlwbGUgcGF0dGVybnNcclxuICAgIGFzeW5jIGZ1bmN0aW9uIGZpbmRGaWx0ZXJJbnB1dCgpIHtcclxuICAgICAgICAvLyBEMzY1IGNyZWF0ZXMgZmlsdGVyIGlucHV0cyB3aXRoIHZhcmlvdXMgcGF0dGVybnNcclxuICAgICAgICBjb25zdCBmaWx0ZXJGaWVsZFBhdHRlcm5zID0gYnVpbGRGaWx0ZXJGaWVsZFBhdHRlcm5zKGNvbnRyb2xOYW1lLCBncmlkTmFtZSwgY29sdW1uTmFtZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IGZpbHRlcklucHV0ID0gbnVsbDtcclxuICAgICAgICBsZXQgZmlsdGVyRmllbGRDb250YWluZXIgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBleGFjdCBwYXR0ZXJucyBmaXJzdFxyXG4gICAgICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBmaWx0ZXJGaWVsZFBhdHRlcm5zKSB7XHJcbiAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtwYXR0ZXJufVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVyRmllbGRDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGZpbHRlcklucHV0ID0gZmlsdGVyRmllbGRDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHBhcnRpYWwgbWF0Y2ggb24gRmlsdGVyRmllbGQgY29udGFpbmluZyB0aGUgY29sdW1uIG5hbWVcclxuICAgICAgICBjb25zdCBwYXJ0aWFsTWF0Y2hlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXVtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCIke2NvbHVtbk5hbWV9XCJdYCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBjb250YWluZXIgb2YgcGFydGlhbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXI6IGNvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBGaW5kIGFueSB2aXNpYmxlIGZpbHRlciBpbnB1dCBpbiBmaWx0ZXIgZHJvcGRvd24vZmx5b3V0IGFyZWFcclxuICAgICAgICAvLyBMb29rIGZvciBpbnB1dHMgaW5zaWRlIGZpbHRlci1yZWxhdGVkIGNvbnRhaW5lcnNcclxuICAgICAgICBjb25zdCBmaWx0ZXJDb250YWluZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmR5bi1maWx0ZXItcG9wdXAsIC5maWx0ZXItcGFuZWwsIFtkYXRhLWR5bi1yb2xlPVwiRmlsdGVyUGFuZVwiXSwgW2NsYXNzKj1cImZpbHRlclwiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIGZpbHRlckNvbnRhaW5lcnMpIHtcclxuICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKTpub3QoW3JlYWRvbmx5XSknKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBjb250YWluZXIgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBMYXN0IHJlc29ydDogQW55IHZpc2libGUgRmlsdGVyRmllbGQgaW5wdXRcclxuICAgICAgICBjb25zdCB2aXNpYmxlRmlsdGVySW5wdXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlckZpZWxkXCJdIGlucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGlucCBvZiB2aXNpYmxlRmlsdGVySW5wdXRzKSB7XHJcbiAgICAgICAgICAgIGlmIChpbnAub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lciA9IGlucC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl0nKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0OiBpbnAsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQ6IG51bGwsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBudWxsIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZpcnN0LCBjaGVjayBpZiB0aGUgZmlsdGVyIHBhbmVsIGlzIGFscmVhZHkgb3BlblxyXG4gICAgbGV0IHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH0gPSBhd2FpdCBmaW5kRmlsdGVySW5wdXQoKTtcclxuICAgIFxyXG4gICAgLy8gSWYgZmlsdGVyIGlucHV0IG5vdCBmb3VuZCwgd2UgbmVlZCB0byBjbGljayB0aGUgY29sdW1uIGhlYWRlciB0byBvcGVuIHRoZSBmaWx0ZXIgZHJvcGRvd25cclxuICAgIGlmICghZmlsdGVySW5wdXQpIHtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIHRoZSBhY3R1YWwgaGVhZGVyIGNlbGxcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBsZXQgY2xpY2tUYXJnZXQgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGlmIChoLmNsYXNzTGlzdC5jb250YWlucygnZHluLWhlYWRlckNlbGwnKSB8fCBcclxuICAgICAgICAgICAgICAgIGguaWQ/LmluY2x1ZGVzKCdoZWFkZXInKSB8fFxyXG4gICAgICAgICAgICAgICAgaC5jbG9zZXN0KCcuZHluLWhlYWRlckNlbGwnKSB8fFxyXG4gICAgICAgICAgICAgICAgaC5jbG9zZXN0KCdbcm9sZT1cImNvbHVtbmhlYWRlclwiXScpKSB7XHJcbiAgICAgICAgICAgICAgICBjbGlja1RhcmdldCA9IGg7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgYnkgSUQgcGF0dGVyblxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbaWQqPVwiJHtjb250cm9sTmFtZX1cIl1baWQqPVwiaGVhZGVyXCJdYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGZpcnN0IGVsZW1lbnQgd2l0aCBjb250cm9sTmFtZVxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmlsdGVyIGNvbHVtbiBoZWFkZXIgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0NMSUNLX0FOSU1BVElPTl9ERUxBWScpOyAvLyBXYWl0IGxvbmdlciBmb3IgZHJvcGRvd24gdG8gb3BlblxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJldHJ5IGZpbmRpbmcgdGhlIGZpbHRlciBpbnB1dCB3aXRoIGEgd2FpdCBsb29wXHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCAxMDsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgICAgICAgICh7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9ID0gYXdhaXQgZmluZEZpbHRlcklucHV0KCkpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQpIGJyZWFrO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghZmlsdGVySW5wdXQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZpbHRlciBpbnB1dCBub3QgZm91bmQuIE1ha2Ugc3VyZSB0aGUgZmlsdGVyIGRyb3Bkb3duIGlzIG9wZW4uIEV4cGVjdGVkIHBhdHRlcm46IEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNDogU2V0IHRoZSBmaWx0ZXIgbWV0aG9kIGlmIG5vdCBcImlzIGV4YWN0bHlcIiAoZGVmYXVsdClcclxuICAgIGlmIChmaWx0ZXJNZXRob2QgJiYgZmlsdGVyTWV0aG9kICE9PSAnaXMgZXhhY3RseScpIHtcclxuICAgICAgICBhd2FpdCBzZXRGaWx0ZXJNZXRob2QoZmlsdGVyRmllbGRDb250YWluZXIsIGZpbHRlck1ldGhvZCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNTogRW50ZXIgdGhlIGZpbHRlciB2YWx1ZVxyXG4gICAgZmlsdGVySW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOUFVUX1NFVFRMRV9ERUxBWScpO1xyXG4gICAgZmlsdGVySW5wdXQuc2VsZWN0KCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlIGZpcnN0XHJcbiAgICBmaWx0ZXJJbnB1dC52YWx1ZSA9ICcnO1xyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOUFVUX1NFVFRMRV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBUeXBlIHVzaW5nIHRoZSBzZWxlY3RlZCBtZXRob2Qgc28gdGhpcyBjYW4gYmUgb3ZlcnJpZGRlbiBwZXIgc3RlcC5cclxuICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoZmlsdGVySW5wdXQsIFN0cmluZyhmaWx0ZXJWYWx1ZSA/PyAnJyksIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgaWYgKG5vcm1hbGl6ZVRleHQoZmlsdGVySW5wdXQudmFsdWUpICE9PSBub3JtYWxpemVUZXh0KGZpbHRlclZhbHVlKSkge1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGZpbHRlcklucHV0LCBTdHJpbmcoZmlsdGVyVmFsdWUgPz8gJycpKTtcclxuICAgIH1cclxuICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBTdGVwIDY6IEFwcGx5IHRoZSBmaWx0ZXIgLSBmaW5kIGFuZCBjbGljayB0aGUgQXBwbHkgYnV0dG9uXHJcbiAgICAvLyBJTVBPUlRBTlQ6IFRoZSBwYXR0ZXJuIGlzIHtHcmlkTmFtZX1fe0NvbHVtbk5hbWV9X0FwcGx5RmlsdGVycywgbm90IGp1c3Qge0dyaWROYW1lfV9BcHBseUZpbHRlcnNcclxuICAgIGNvbnN0IGFwcGx5QnRuUGF0dGVybnMgPSBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKTtcclxuICAgIFxyXG4gICAgbGV0IGFwcGx5QnRuID0gbnVsbDtcclxuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBhcHBseUJ0blBhdHRlcm5zKSB7XHJcbiAgICAgICAgYXBwbHlCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke3BhdHRlcm59XCJdYCk7XHJcbiAgICAgICAgaWYgKGFwcGx5QnRuICYmIGFwcGx5QnRuLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZhbGxiYWNrOiBmaW5kIGFueSB2aXNpYmxlIEFwcGx5RmlsdGVycyBidXR0b25cclxuICAgIGlmICghYXBwbHlCdG4gfHwgYXBwbHlCdG4ub2Zmc2V0UGFyZW50ID09PSBudWxsKSB7XHJcbiAgICAgICAgY29uc3QgYWxsQXBwbHlCdG5zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkFwcGx5RmlsdGVyc1wiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgYnRuIG9mIGFsbEFwcGx5QnRucykge1xyXG4gICAgICAgICAgICBpZiAoYnRuLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgYXBwbHlCdG4gPSBidG47XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGFwcGx5QnRuKSB7XHJcbiAgICAgICAgYXBwbHlCdG4uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdWQUxJREFUSU9OX1dBSVQnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHByZXNzaW5nIEVudGVyIGFzIGFsdGVybmF0aXZlXHJcbiAgICAgICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsgXHJcbiAgICAgICAgICAgIGtleTogJ0VudGVyJywga2V5Q29kZTogMTMsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBcclxuICAgICAgICAgICAga2V5OiAnRW50ZXInLCBrZXlDb2RlOiAxMywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSBcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVkFMSURBVElPTl9XQUlUJyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0VW50aWxDb25kaXRpb24oY29udHJvbE5hbWUsIGNvbmRpdGlvbiwgZXhwZWN0ZWRWYWx1ZSwgdGltZW91dCkge1xyXG4gICAgXHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgLy8gVHJhY2sgd2hldGhlciBEMzY1IGlzIGFjdGl2ZWx5IHByb2Nlc3NpbmcgXHUyMDEzIGlmIHNvIHdlIGV4dGVuZCB0aGUgZGVhZGxpbmVcclxuICAgIC8vIHNvIHRoYXQgXCJQbGVhc2Ugd2FpdFwiIG1lc3NhZ2VzIGRvbid0IGNhdXNlIHNwdXJpb3VzIHRpbWVvdXRzLlxyXG4gICAgbGV0IGVmZmVjdGl2ZVRpbWVvdXQgPSB0aW1lb3V0O1xyXG4gICAgXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IGVmZmVjdGl2ZVRpbWVvdXQpIHtcclxuICAgICAgICAvLyBJZiBEMzY1IGlzIHNob3dpbmcgYSBcIlBsZWFzZSB3YWl0XCIgcHJvY2Vzc2luZyBtZXNzYWdlLCBleHRlbmQgdGhlXHJcbiAgICAgICAgLy8gZGVhZGxpbmUgc28gd2UgZG9uJ3QgdGltZSBvdXQgZHVyaW5nIHNlcnZlci1zaWRlIG9wZXJhdGlvbnMuXHJcbiAgICAgICAgaWYgKGlzRDM2NUxvYWRpbmcoKSB8fCBpc0QzNjVQcm9jZXNzaW5nTWVzc2FnZSgpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVsYXBzZWQgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xyXG4gICAgICAgICAgICAvLyBFeHRlbmQgYnkgdXAgdG8gNjAgcyB0b3RhbCAob24gdG9wIG9mIG9yaWdpbmFsIHRpbWVvdXQpXHJcbiAgICAgICAgICAgIGlmIChlZmZlY3RpdmVUaW1lb3V0IC0gZWxhcHNlZCA8IDUwMDApIHtcclxuICAgICAgICAgICAgICAgIGVmZmVjdGl2ZVRpbWVvdXQgPSBNYXRoLm1pbihlbGFwc2VkICsgMTAwMDAsIHRpbWVvdXQgKyA2MDAwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgY29uZGl0aW9uTWV0ID0gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChjb25kaXRpb24pIHtcclxuICAgICAgICAgICAgY2FzZSAndmlzaWJsZSc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGV4aXN0cyBhbmQgaXMgdmlzaWJsZSAoaGFzIGxheW91dClcclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGVsZW1lbnQgJiYgZWxlbWVudC5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdoaWRkZW4nOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBkb2Vzbid0IGV4aXN0IG9yIGlzIG5vdCB2aXNpYmxlXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSAhZWxlbWVudCB8fCBlbGVtZW50Lm9mZnNldFBhcmVudCA9PT0gbnVsbCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgPT09ICdoaWRkZW4nIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkuZGlzcGxheSA9PT0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnZXhpc3RzJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGluIERPTVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCAhPT0gbnVsbDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ25vdC1leGlzdHMnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBkb2VzIG5vdCBleGlzdCBpbiBET01cclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGVsZW1lbnQgPT09IG51bGw7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdlbmFibGVkJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGFuZCBpcyBub3QgZGlzYWJsZWRcclxuICAgICAgICAgICAgICAgIGlmIChlbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBidXR0b24sIHNlbGVjdCwgdGV4dGFyZWEnKSB8fCBlbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9ICFpbnB1dC5kaXNhYmxlZCAmJiAhaW5wdXQuaGFzQXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdoYXMtdmFsdWUnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBoYXMgYSBzcGVjaWZpYyB2YWx1ZVxyXG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QnKSB8fCBlbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGlucHV0LnZhbHVlIHx8IGlucHV0LnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGN1cnJlbnRWYWx1ZS50cmltKCkgPT09IFN0cmluZyhleHBlY3RlZFZhbHVlKS50cmltKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvbmRpdGlvbk1ldCkge1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTsgLy8gU21hbGwgc3RhYmlsaXR5IGRlbGF5XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnSU5QVVRfU0VUVExFX0RFTEFZJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcihgVGltZW91dCB3YWl0aW5nIGZvciBcIiR7Y29udHJvbE5hbWV9XCIgdG8gYmUgJHtjb25kaXRpb259ICh3YWl0ZWQgJHt0aW1lb3V0fW1zKWApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0SW5wdXRWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGZpZWxkVHlwZSwgY29tYm9NZXRob2RPdmVycmlkZSA9ICcnKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIC8vIEZvciBTZWdtZW50ZWRFbnRyeSBmaWVsZHMgKEFjY291bnQsIGV0YyksIHVzZSBsb29rdXAgYnV0dG9uIGFwcHJvYWNoXHJcbiAgICBpZiAoZmllbGRUeXBlPy50eXBlID09PSAnc2VnbWVudGVkLWxvb2t1cCcgfHwgaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSkge1xyXG4gICAgICAgIGF3YWl0IHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgQ29tYm9Cb3gvZW51bSBmaWVsZHMsIG9wZW4gZHJvcGRvd24gYW5kIHNlbGVjdFxyXG4gICAgaWYgKGZpZWxkVHlwZT8uaW5wdXRUeXBlID09PSAnZW51bScgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0NvbWJvQm94Jykge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgUmFkaW9CdXR0b24vRnJhbWVPcHRpb25CdXR0b24gZ3JvdXBzLCBjbGljayB0aGUgY29ycmVjdCBvcHRpb25cclxuICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgaWYgKHJvbGUgPT09ICdSYWRpb0J1dHRvbicgfHwgcm9sZSA9PT0gJ0ZyYW1lT3B0aW9uQnV0dG9uJyB8fCBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwicmFkaW9cIl0sIGlucHV0W3R5cGU9XCJyYWRpb1wiXScpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0UmFkaW9CdXR0b25WYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKGBJbnB1dCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgLy8gRm9jdXMgdGhlIGlucHV0IGZpcnN0XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnTUVESVVNX1NFVFRMRV9ERUxBWScpO1xyXG5cclxuICAgIGlmIChpbnB1dC50YWdOYW1lICE9PSAnU0VMRUNUJykge1xyXG4gICAgICAgIC8vIFVzZSB0aGUgc2VsZWN0ZWQgY29tYm9ib3ggaW5wdXQgbWV0aG9kXHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnUE9TVF9JTlBVVF9ERUxBWScpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0R3JpZENlbGxWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGZpZWxkVHlwZSwgd2FpdEZvclZhbGlkYXRpb24gPSBmYWxzZSwgY29tYm9NZXRob2RPdmVycmlkZSA9ICcnKSB7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIHRoZSBncmlkIHRvIGhhdmUgYW4gYWN0aXZlL3NlbGVjdGVkIHJvdyBiZWZvcmUgZmluZGluZyB0aGUgY2VsbC5cclxuICAgIC8vIEFmdGVyIFwiQWRkIGxpbmVcIiwgRDM2NSdzIFJlYWN0IGdyaWQgbWF5IHRha2UgYSBtb21lbnQgdG8gbWFyayB0aGUgbmV3IHJvd1xyXG4gICAgLy8gYXMgYWN0aXZlLiAgV2l0aG91dCB0aGlzIHdhaXQgdGhlIGZhbGxiYWNrIHNjYW4gaW4gZmluZEdyaWRDZWxsRWxlbWVudCBjYW5cclxuICAgIC8vIHJldHVybiBhIGNlbGwgZnJvbSBhIGRpZmZlcmVudCAoZWFybGllcikgcm93LCBjYXVzaW5nIGRhdGEgdG8gYmUgd3JpdHRlblxyXG4gICAgLy8gdG8gdGhlIHdyb25nIGxpbmUuXHJcbiAgICBhd2FpdCB3YWl0Rm9yQWN0aXZlR3JpZFJvdyhjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIGNlbGwgZWxlbWVudCAtIHByZWZlciB0aGUgb25lIGluIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3dcclxuICAgIGxldCBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIGlmICghZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBjbGlja2luZyBvbiB0aGUgZ3JpZCByb3cgZmlyc3QgdG8gYWN0aXZhdGUgaXRcclxuICAgICAgICBhd2FpdCBhY3RpdmF0ZUdyaWRSb3coY29udHJvbE5hbWUpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIGVsZW1lbnQgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHcmlkIGNlbGwgZWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcywgd2UgbmVlZCB0byBjbGljayBvbiB0aGUgY2VsbCB0byBlbnRlciBlZGl0IG1vZGVcclxuICAgIC8vIEZpbmQgdGhlIGFjdHVhbCBjZWxsIGNvbnRhaW5lciAoZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4pXHJcbiAgICBjb25zdCByZWFjdENlbGwgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpIHx8IGVsZW1lbnQ7XHJcbiAgICBjb25zdCBpc1JlYWN0R3JpZCA9ICEhZWxlbWVudC5jbG9zZXN0KCcucmVhY3RHcmlkJyk7XHJcbiAgICBcclxuICAgIC8vIENsaWNrIG9uIHRoZSBjZWxsIHRvIGFjdGl2YXRlIGl0IGZvciBlZGl0aW5nXHJcbiAgICByZWFjdENlbGwuY2xpY2soKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBGb3IgUmVhY3QgZ3JpZHMsIEQzNjUgcmVuZGVycyBpbnB1dCBmaWVsZHMgZHluYW1pY2FsbHkgYWZ0ZXIgY2xpY2tpbmdcclxuICAgIC8vIFdlIG5lZWQgdG8gcmUtZmluZCB0aGUgZWxlbWVudCBhZnRlciBjbGlja2luZyBhcyBEMzY1IG1heSBoYXZlIHJlcGxhY2VkIHRoZSBET01cclxuICAgIGlmIChpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpOyAvLyBFeHRyYSB3YWl0IGZvciBSZWFjdCB0byByZW5kZXIgaW5wdXRcclxuICAgICAgICBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgR3JpZCBjZWxsIGVsZW1lbnQgbm90IGZvdW5kIGFmdGVyIGNsaWNrOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGhlIGNsaWNrIHNob3VsZCBhY3RpdmF0ZSB0aGUgY2VsbCAtIG5vdyBmaW5kIHRoZSBpbnB1dFxyXG4gICAgbGV0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGlucHV0IGZvdW5kIGRpcmVjdGx5LCBsb29rIGluIHRoZSBjZWxsIGNvbnRhaW5lclxyXG4gICAgaWYgKCFpbnB1dCAmJiBpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGNvbnN0IGNlbGxDb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpO1xyXG4gICAgICAgIGlmIChjZWxsQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGlucHV0ID0gY2VsbENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBJZiBubyBpbnB1dCBmb3VuZCBkaXJlY3RseSwgdHJ5IGdldHRpbmcgaXQgYWZ0ZXIgY2xpY2sgYWN0aXZhdGlvbiB3aXRoIHJldHJ5XHJcbiAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCA1OyBhdHRlbXB0KyspIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCAmJiBpbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQWxzbyBjaGVjayBpZiBhIG5ldyBpbnB1dCBhcHBlYXJlZCBpbiB0aGUgY2VsbFxyXG4gICAgICAgICAgICBjb25zdCBjZWxsQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKTtcclxuICAgICAgICAgICAgaWYgKGNlbGxDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGlucHV0ID0gY2VsbENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQgJiYgaW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU3RpbGwgbm8gaW5wdXQ/IENoZWNrIGlmIHRoZSBlbGVtZW50IGl0c2VsZiBpcyBhbiBpbnB1dFxyXG4gICAgaWYgKCFpbnB1dCAmJiAoZWxlbWVudC50YWdOYW1lID09PSAnSU5QVVQnIHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJyB8fCBlbGVtZW50LnRhZ05hbWUgPT09ICdTRUxFQ1QnKSkge1xyXG4gICAgICAgIGlucHV0ID0gZWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIGZpbmQgaW5wdXQgaW4gdGhlIHBhcmVudCByb3dcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICBjb25zdCByb3cgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluLCBbZGF0YS1keW4tcm9sZT1cIlJvd1wiXSwgW3JvbGU9XCJyb3dcIl0sIHRyJyk7XHJcbiAgICAgICAgaWYgKHJvdykge1xyXG4gICAgICAgICAgICBjb25zdCBwb3NzaWJsZUlucHV0cyA9IHJvdy5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSBpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSB0ZXh0YXJlYWApO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGlucCBvZiBwb3NzaWJsZUlucHV0cykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlucC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbnB1dCA9IGlucDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTGFzdCByZXNvcnQ6IGZpbmQgYW55IHZpc2libGUgaW5wdXQgaW4gdGhlIGFjdGl2ZSBjZWxsIGFyZWFcclxuICAgIGlmICghaW5wdXQgJiYgaXNSZWFjdEdyaWQpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVDZWxsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmR5bi1hY3RpdmVSb3dDZWxsLCAuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW46Zm9jdXMtd2l0aGluJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZUNlbGwpIHtcclxuICAgICAgICAgICAgaW5wdXQgPSBhY3RpdmVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYElucHV0IG5vdCBmb3VuZCBpbiBncmlkIGNlbGw6ICR7Y29udHJvbE5hbWV9LiBUaGUgY2VsbCBtYXkgbmVlZCB0byBiZSBjbGlja2VkIHRvIGJlY29tZSBlZGl0YWJsZS5gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGZpZWxkIHR5cGUgYW5kIHVzZSBhcHByb3ByaWF0ZSBzZXR0ZXJcclxuICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgXHJcbiAgICBpZiAoZmllbGRUeXBlPy50eXBlID09PSAnc2VnbWVudGVkLWxvb2t1cCcgfHwgcm9sZSA9PT0gJ1NlZ21lbnRlZEVudHJ5JyB8fCBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZmllbGRUeXBlPy5pbnB1dFR5cGUgPT09ICdlbnVtJyB8fCByb2xlID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBmb3IgbG9va3VwIGZpZWxkc1xyXG4gICAgaWYgKHJvbGUgPT09ICdMb29rdXAnIHx8IHJvbGUgPT09ICdSZWZlcmVuY2VHcm91cCcgfHwgaGFzTG9va3VwQnV0dG9uKGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0TG9va3VwU2VsZWN0VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0YW5kYXJkIGlucHV0IC0gZm9jdXMgYW5kIHNldCB2YWx1ZVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOUFVUX1NFVFRMRV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBDbGVhciBleGlzdGluZyB2YWx1ZVxyXG4gICAgaW5wdXQuc2VsZWN0Py4oKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1FVSUNLX1JFVFJZX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIFVzZSB0aGUgc3RhbmRhcmQgaW5wdXQgbWV0aG9kXHJcbiAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIEZvciBncmlkIGNlbGxzLCB3ZSBuZWVkIHRvIHByb3Blcmx5IGNvbW1pdCB0aGUgdmFsdWVcclxuICAgIC8vIEQzNjUgUmVhY3QgZ3JpZHMgcmVxdWlyZSB0aGUgY2VsbCB0byBsb3NlIGZvY3VzIGZvciB2YWxpZGF0aW9uIHRvIG9jY3VyXHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAxOiBQcmVzcyBFbnRlciB0byBjb25maXJtIHRoZSB2YWx1ZSAoaW1wb3J0YW50IGZvciBsb29rdXAgZmllbGRzIGxpa2UgSXRlbUlkKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBrZXlDb2RlOiAxMywgd2hpY2g6IDEzLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGtleUNvZGU6IDEzLCB3aGljaDogMTMsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAyOiBUYWIgb3V0IHRvIG1vdmUgdG8gbmV4dCBjZWxsICh0cmlnZ2VycyBibHVyIGFuZCB2YWxpZGF0aW9uKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGtleUNvZGU6IDksIHdoaWNoOiA5LCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywga2V5Q29kZTogOSwgd2hpY2g6IDksIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAzOiBEaXNwYXRjaCBibHVyIGV2ZW50IGV4cGxpY2l0bHlcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUsIHJlbGF0ZWRUYXJnZXQ6IG51bGwgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCA0OiBDbGljayBvdXRzaWRlIHRoZSBjZWxsIHRvIGVuc3VyZSBmb2N1cyBpcyBsb3N0XHJcbiAgICAvLyBGaW5kIGFub3RoZXIgY2VsbCBvciB0aGUgcm93IGNvbnRhaW5lciB0byBjbGlja1xyXG4gICAgY29uc3Qgcm93ID0gaW5wdXQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4sIFtkYXRhLWR5bi1yb2xlPVwiUm93XCJdJyk7XHJcbiAgICBpZiAocm93KSB7XHJcbiAgICAgICAgY29uc3Qgb3RoZXJDZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbjpub3QoOmZvY3VzLXdpdGhpbiknKTtcclxuICAgICAgICBpZiAob3RoZXJDZWxsICYmIG90aGVyQ2VsbCAhPT0gaW5wdXQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJykpIHtcclxuICAgICAgICAgICAgb3RoZXJDZWxsLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gV2FpdCBmb3IgRDM2NSB0byBwcm9jZXNzL3ZhbGlkYXRlIHRoZSB2YWx1ZSAoc2VydmVyLXNpZGUgbG9va3VwIGZvciBJdGVtSWQsIGV0Yy4pXHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdERUZBVUxUX1dBSVRfU1RFUF9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBJZiB3YWl0Rm9yVmFsaWRhdGlvbiBpcyBlbmFibGVkLCB3YWl0IGZvciBEMzY1IHRvIGNvbXBsZXRlIHRoZSBsb29rdXAgdmFsaWRhdGlvblxyXG4gICAgLy8gVGhpcyBpcyBpbXBvcnRhbnQgZm9yIGZpZWxkcyBsaWtlIEl0ZW1JZCB0aGF0IHRyaWdnZXIgc2VydmVyLXNpZGUgdmFsaWRhdGlvblxyXG4gICAgaWYgKHdhaXRGb3JWYWxpZGF0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gV2FpdCBmb3IgYW55IGxvYWRpbmcgaW5kaWNhdG9ycyB0byBhcHBlYXIgYW5kIGRpc2FwcGVhclxyXG4gICAgICAgIC8vIEQzNjUgc2hvd3MgYSBsb2FkaW5nIHNwaW5uZXIgZHVyaW5nIHNlcnZlci1zaWRlIGxvb2t1cHNcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yRDM2NVZhbGlkYXRpb24oY29udHJvbE5hbWUsIDUwMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yRDM2NVZhbGlkYXRpb24oY29udHJvbE5hbWUsIHRpbWVvdXQgPSA1MDAwKSB7XHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgbGV0IGxhc3RMb2FkaW5nU3RhdGUgPSBmYWxzZTtcclxuICAgIGxldCBzZWVuTG9hZGluZyA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IHRpbWVvdXQpIHtcclxuICAgICAgICAvLyBDaGVjayBmb3IgRDM2NSBsb2FkaW5nIGluZGljYXRvcnNcclxuICAgICAgICBjb25zdCBpc0xvYWRpbmcgPSBpc0QzNjVMb2FkaW5nKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzTG9hZGluZyAmJiAhbGFzdExvYWRpbmdTdGF0ZSkge1xyXG4gICAgICAgICAgICBzZWVuTG9hZGluZyA9IHRydWU7XHJcbiAgICAgICAgfSBlbHNlIGlmICghaXNMb2FkaW5nICYmIGxhc3RMb2FkaW5nU3RhdGUgJiYgc2VlbkxvYWRpbmcpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7IC8vIEV4dHJhIGJ1ZmZlciBhZnRlciBsb2FkaW5nIGNvbXBsZXRlc1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGFzdExvYWRpbmdTdGF0ZSA9IGlzTG9hZGluZztcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIGNoZWNrIGlmIHRoZSBjZWxsIG5vdyBzaG93cyB2YWxpZGF0ZWQgY29udGVudCAoZS5nLiwgcHJvZHVjdCBuYW1lIGFwcGVhcmVkKVxyXG4gICAgICAgIC8vIEZvciBJdGVtSWQsIEQzNjUgc2hvd3MgdGhlIGl0ZW0gbnVtYmVyIGFuZCBuYW1lIGFmdGVyIHZhbGlkYXRpb25cclxuICAgICAgICBjb25zdCBjZWxsID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgaWYgKGNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbFRleHQgPSBjZWxsLnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgICAgICBjb25zdCBoYXNNdWx0aXBsZVZhbHVlcyA9IGNlbGxUZXh0LnNwbGl0KC9cXHN7Mix9fFxcbi8pLmZpbHRlcih0ID0+IHQudHJpbSgpKS5sZW5ndGggPiAxO1xyXG4gICAgICAgICAgICBpZiAoaGFzTXVsdGlwbGVWYWx1ZXMpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnSU5QVVRfU0VUVExFX0RFTEFZJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIElmIHdlIHNhdyBsb2FkaW5nIGF0IHNvbWUgcG9pbnQsIHdhaXQgYSBiaXQgbW9yZSBhZnRlciB0aW1lb3V0XHJcbiAgICBpZiAoc2VlbkxvYWRpbmcpIHtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdERUZBVUxUX1dBSVRfU1RFUF9ERUxBWScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBXYWl0IGZvciB0aGUgZ3JpZCB0byBoYXZlIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3cgdGhhdCBjb250YWlucyB0aGUgdGFyZ2V0XHJcbiAqIGNvbnRyb2wuICBEMzY1IFJlYWN0IGdyaWRzIHVwZGF0ZSBgYXJpYS1zZWxlY3RlZGAgYXN5bmNocm9ub3VzbHkgYWZ0ZXJcclxuICogYWN0aW9ucyBsaWtlIFwiQWRkIGxpbmVcIiwgc28gd2UgcG9sbCBmb3IgYSBzaG9ydCBwZXJpb2QgYmVmb3JlIGdpdmluZyB1cC5cclxuICpcclxuICogSU1QT1JUQU5UOiBJZiBhIHBlbmRpbmctbmV3LXJvdyBtYXJrZXIgZXhpc3RzIChzZXQgYnkgYHdhaXRGb3JOZXdHcmlkUm93YFxyXG4gKiBhZnRlciBhbiBcIkFkZCBsaW5lXCIgY2xpY2spLCB3ZSB2ZXJpZnkgdGhhdCB0aGUgc2VsZWN0ZWQgcm93IG1hdGNoZXMgdGhhdFxyXG4gKiBtYXJrZXIuICBUaGlzIHByZXZlbnRzIHJldHVybmluZyBgdHJ1ZWAgd2hlbiB0aGUgT0xEIHJvdyBpcyBzdGlsbFxyXG4gKiBhcmlhLXNlbGVjdGVkIGJ1dCB0aGUgTkVXIHJvdyBoYXNuJ3QgYmVlbiBtYXJrZWQgeWV0LlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckFjdGl2ZUdyaWRSb3coY29udHJvbE5hbWUsIHRpbWVvdXQgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCBwZW5kaW5nTmV3ID0gd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93O1xyXG4gICAgLy8gQ29uc2lkZXIgdGhlIG1hcmtlciBzdGFsZSBhZnRlciAxNSBzZWNvbmRzXHJcbiAgICBjb25zdCBtYXJrZXJGcmVzaCA9IHBlbmRpbmdOZXcgJiYgKERhdGUubm93KCkgLSBwZW5kaW5nTmV3LnRpbWVzdGFtcCA8IDE1MDAwKTtcclxuXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dCkge1xyXG4gICAgICAgIC8vIElmIHdlIGhhdmUgYSBwZW5kaW5nLW5ldy1yb3cgbWFya2VyLCB0cnkgdG8gZmluZCBjb250cm9sTmFtZSBpblxyXG4gICAgICAgIC8vIFRIQVQgc3BlY2lmaWMgcm93IGZpcnN0LlxyXG4gICAgICAgIGlmIChtYXJrZXJGcmVzaCAmJiBwZW5kaW5nTmV3LnJvd0VsZW1lbnQpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHBlbmRpbmdOZXcucm93RWxlbWVudC5xdWVyeVNlbGVjdG9yKFxyXG4gICAgICAgICAgICAgICAgYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVGhlIHBlbmRpbmcgcm93IGNvbnRhaW5zIG91ciBjb250cm9sIC0gZ29vZCwgYnV0IHZlcmlmeSBpdFxyXG4gICAgICAgICAgICAgICAgLy8gaXMgYWN0dWFsbHkgc2VsZWN0ZWQgLyBhY3RpdmUgbm93LlxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHBlbmRpbmdOZXcucm93RWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZ05ldy5yb3dFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZ05ldy5yb3dFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm93LWFjdGl2ZScpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZW5kaW5nTmV3LnJvd0VsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkeW4tc2VsZWN0ZWRSb3cnKTtcclxuICAgICAgICAgICAgICAgIGlmIChpc1NlbGVjdGVkKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVHJhZGl0aW9uYWwgZ3JpZCBzZWxlY3RlZCByb3dzXHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRSb3dzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgJ1tkYXRhLWR5bi1zZWxlY3RlZD1cInRydWVcIl0sIFthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmR5bi1zZWxlY3RlZFJvdydcclxuICAgICAgICApO1xyXG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIHNlbGVjdGVkUm93cykge1xyXG4gICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGEgcGVuZGluZyBtYXJrZXIsIHNraXAgcm93cyB0aGF0IGRvbid0IG1hdGNoIGl0IFx1MjAxM1xyXG4gICAgICAgICAgICAvLyB0aGlzIHByZXZlbnRzIHJldHVybmluZyB0cnVlIGZvciB0aGUgb2xkL3ByZXZpb3VzIHJvdy5cclxuICAgICAgICAgICAgaWYgKG1hcmtlckZyZXNoICYmIHBlbmRpbmdOZXcucm93RWxlbWVudCAmJiByb3cgIT09IHBlbmRpbmdOZXcucm93RWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGFjdGl2ZSByb3dcclxuICAgICAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihcclxuICAgICAgICAgICAgICAgICcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgJyArXHJcbiAgICAgICAgICAgICAgICAnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgICAgIGlmIChtYXJrZXJGcmVzaCAmJiBwZW5kaW5nTmV3LnJvd0VsZW1lbnQgJiYgYWN0aXZlUm93ICE9PSBwZW5kaW5nTmV3LnJvd0VsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgICAgIGlmIChjZWxsICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdJTlBVVF9TRVRUTEVfREVMQVknKTtcclxuICAgIH1cclxuICAgIC8vIFRpbWVkIG91dCBcdTIwMTMgY2xlYXIgdGhlIHBlbmRpbmcgbWFya2VyIHNvIHdlIGRvbid0IGtlZXAgYmxvY2tpbmdcclxuICAgIC8vIGZ1dHVyZSBjYWxscyBpZiBzb21ldGhpbmcgd2VudCB3cm9uZy5cclxuICAgIGlmIChtYXJrZXJGcmVzaCkge1xyXG4gICAgICAgIGxvZ1N0ZXAoYHdhaXRGb3JBY3RpdmVHcmlkUm93OiB0aW1lZCBvdXQgd2FpdGluZyBmb3IgcGVuZGluZyBuZXcgcm93IHRvIGNvbnRhaW4gXCIke2NvbnRyb2xOYW1lfVwiLiBDbGVhcmluZyBtYXJrZXIuYCk7XHJcbiAgICAgICAgZGVsZXRlIHdpbmRvdy5fX2QzNjVfcGVuZGluZ05ld1JvdztcclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlR3JpZFJvdyhjb250cm9sTmFtZSkge1xyXG4gICAgLy8gVHJ5IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIGZpcnN0XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICAgICAgLy8gRmluZCB0aGUgcm93IGNvbnRhaW5pbmcgdGhpcyBjZWxsXHJcbiAgICAgICAgICAgICAgICBjb25zdCByb3cgPSBjZWxsLmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocm93KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2xpY2sgb24gdGhlIHJvdyB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgICAgICAgICByb3cuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHNcclxuICAgIGNvbnN0IGdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgZ3JpZHMpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBjZWxsXHJcbiAgICAgICAgY29uc3QgY2VsbCA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICAvLyBGaW5kIHRoZSByb3cgY29udGFpbmluZyB0aGlzIGNlbGxcclxuICAgICAgICAgICAgY29uc3Qgcm93ID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIlJvd1wiXSwgW3JvbGU9XCJyb3dcIl0sIHRyJyk7XHJcbiAgICAgICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgICAgIC8vIENsaWNrIG9uIHRoZSByb3cgdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgICAgICByb3cuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRMb29rdXBTZWxlY3RWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUgPSAnJykge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gbG9va3VwIGZpZWxkJyk7XHJcblxyXG4gICAgY29uc3QgbG9va3VwQnV0dG9uID0gZmluZExvb2t1cEJ1dHRvbihlbGVtZW50KTtcclxuICAgIGlmIChsb29rdXBCdXR0b24pIHtcclxuICAgICAgICBsb29rdXBCdXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdDTElDS19BTklNQVRJT05fREVMQVknKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIG9wZW4gYnkgZm9jdXNpbmcgYW5kIGtleWJvYXJkXHJcbiAgICAgICAgaW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdJTlBVVF9TRVRUTEVfREVMQVknKTtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBhd2FpdCBvcGVuTG9va3VwQnlLZXlib2FyZChpbnB1dCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbG9va3VwRG9jayA9IGF3YWl0IHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudChlbGVtZW50KTtcclxuICAgIGlmICghbG9va3VwRG9jaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9va3VwIGZseW91dCBub3QgZm91bmQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBUcnkgdHlwaW5nIGludG8gYSBsb29rdXAgZmx5b3V0IGlucHV0IGlmIHByZXNlbnQgKGUuZy4sIE1haW5BY2NvdW50KVxyXG4gICAgY29uc3QgZG9ja0lucHV0ID0gZmluZExvb2t1cEZpbHRlcklucHV0KGxvb2t1cERvY2spO1xyXG4gICAgaWYgKGRvY2tJbnB1dCkge1xyXG4gICAgICAgIGRvY2tJbnB1dC5jbGljaygpO1xyXG4gICAgICAgIGRvY2tJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1FVSUNLX1JFVFJZX0RFTEFZJyk7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChkb2NrSW5wdXQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlKTtcclxuICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnU0FWRV9TRVRUTEVfREVMQVknKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb3dzID0gYXdhaXQgd2FpdEZvckxvb2t1cFJvd3MobG9va3VwRG9jaywgZWxlbWVudCk7XHJcbiAgICBpZiAoIXJvd3MubGVuZ3RoKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29rdXAgbGlzdCBpcyBlbXB0eScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNlYXJjaFZhbHVlID0gU3RyaW5nKHZhbHVlID8/ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgbGV0IG1hdGNoZWQgPSBmYWxzZTtcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm93LnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBjb25zdCBmaXJzdENlbGwgPSByb3cucXVlcnlTZWxlY3RvcignW3JvbGU9XCJncmlkY2VsbFwiXSwgdGQnKTtcclxuICAgICAgICBjb25zdCBmaXJzdFRleHQgPSBmaXJzdENlbGwgPyBmaXJzdENlbGwudGV4dENvbnRlbnQudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiAnJztcclxuICAgICAgICBpZiAoZmlyc3RUZXh0ID09PSBzZWFyY2hWYWx1ZSB8fCB0ZXh0LmluY2x1ZGVzKHNlYXJjaFZhbHVlKSkge1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaXJzdENlbGwgfHwgcm93O1xyXG4gICAgICAgICAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICB0YXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIC8vIFNvbWUgRDM2NSBsb29rdXBzIHJlcXVpcmUgRW50ZXIgb3IgZG91YmxlLWNsaWNrIHRvIGNvbW1pdCBzZWxlY3Rpb25cclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2RibGNsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIGlmICghYXBwbGllZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IGEgc2Vjb25kIGNvbW1pdCBwYXNzIGlmIHRoZSB2YWx1ZSBkaWQgbm90IHN0aWNrXHJcbiAgICAgICAgICAgICAgICB0YXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExvb2t1cCB2YWx1ZSBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBEMzY1IGNoZWNrYm94ZXMgY2FuIGJlOlxyXG4gICAgLy8gMS4gU3RhbmRhcmQgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdXHJcbiAgICAvLyAyLiBDdXN0b20gdG9nZ2xlIHdpdGggcm9sZT1cImNoZWNrYm94XCIgb3Igcm9sZT1cInN3aXRjaFwiXHJcbiAgICAvLyAzLiBFbGVtZW50IHdpdGggYXJpYS1jaGVja2VkIGF0dHJpYnV0ZSAodGhlIGNvbnRhaW5lciBpdHNlbGYpXHJcbiAgICAvLyA0LiBFbGVtZW50IHdpdGggZGF0YS1keW4tcm9sZT1cIkNoZWNrQm94XCJcclxuICAgIFxyXG4gICAgbGV0IGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKTtcclxuICAgIGxldCBpc0N1c3RvbVRvZ2dsZSA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgY3VzdG9tIHRvZ2dsZSBlbGVtZW50XHJcbiAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiY2hlY2tib3hcIl0sIFtyb2xlPVwic3dpdGNoXCJdJyk7XHJcbiAgICAgICAgaWYgKGNoZWNrYm94KSB7XHJcbiAgICAgICAgICAgIGlzQ3VzdG9tVG9nZ2xlID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHtcclxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZWxlbWVudCBpdHNlbGYgaXMgdGhlIHRvZ2dsZSAoRDM2NSBvZnRlbiBkb2VzIHRoaXMpXHJcbiAgICAgICAgaWYgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSA9PT0gJ2NoZWNrYm94JyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnc3dpdGNoJyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnQ2hlY2tCb3gnKSB7XHJcbiAgICAgICAgICAgIGNoZWNrYm94ID0gZWxlbWVudDtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkge1xyXG4gICAgICAgIC8vIExhc3QgcmVzb3J0OiBmaW5kIGFueSBjbGlja2FibGUgdG9nZ2xlLWxpa2UgZWxlbWVudFxyXG4gICAgICAgIGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b24sIFt0YWJpbmRleD1cIjBcIl0nKTtcclxuICAgICAgICBpZiAoY2hlY2tib3gpIHtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkgdGhyb3cgbmV3IEVycm9yKGBDaGVja2JveCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9LiBFbGVtZW50IEhUTUw6ICR7ZWxlbWVudC5vdXRlckhUTUwuc3Vic3RyaW5nKDAsIDIwMCl9YCk7XHJcblxyXG4gICAgY29uc3Qgc2hvdWxkQ2hlY2sgPSBjb2VyY2VCb29sZWFuKHZhbHVlKTtcclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgc3RhdGVcclxuICAgIGxldCBpc0N1cnJlbnRseUNoZWNrZWQ7XHJcbiAgICBpZiAoaXNDdXN0b21Ub2dnbGUpIHtcclxuICAgICAgICBpc0N1cnJlbnRseUNoZWNrZWQgPSBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZScgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoZWNrZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3guY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2RhdGEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlzQ3VycmVudGx5Q2hlY2tlZCA9IGNoZWNrYm94LmNoZWNrZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT25seSBjbGljayBpZiBzdGF0ZSBuZWVkcyB0byBjaGFuZ2VcclxuICAgIGlmIChzaG91bGRDaGVjayAhPT0gaXNDdXJyZW50bHlDaGVja2VkKSB7XHJcbiAgICAgICAgY2hlY2tib3guY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGb3IgY3VzdG9tIHRvZ2dsZXMsIGFsc28gdHJ5IGRpc3BhdGNoaW5nIGV2ZW50cyBpZiBjbGljayBkaWRuJ3Qgd29ya1xyXG4gICAgICAgIGlmIChpc0N1c3RvbVRvZ2dsZSkge1xyXG4gICAgICAgICAgICBjaGVja2JveC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBjaGVja2JveC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcGVuTG9va3VwQnlLZXlib2FyZChpbnB1dCkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1FVSUNLX1JFVFJZX0RFTEFZJyk7XHJcbiAgICAvLyBUcnkgQWx0K0Rvd24gdGhlbiBGNCAoY29tbW9uIEQzNjUvV2luIGNvbnRyb2xzKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGFsdEtleTogdHJ1ZSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGFsdEtleTogdHJ1ZSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdNRURJVU1fU0VUVExFX0RFTEFZJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdGNCcsIGNvZGU6ICdGNCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Y0JywgY29kZTogJ0Y0JywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KSB7XHJcbiAgICAvLyBEMzY1IHNlZ21lbnRlZCBsb29rdXBzIG9mdGVuIHZhbGlkYXRlIG9uIFRhYi9FbnRlciBhbmQgYmx1clxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQ0xJQ0tfQU5JTUFUSU9OX0RFTEFZJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbG9zZURpYWxvZyhmb3JtTmFtZSwgYWN0aW9uID0gJ29rJykge1xyXG4gICAgY29uc3QgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1mb3JtLW5hbWU9XCIke2Zvcm1OYW1lfVwiXWApO1xyXG4gICAgaWYgKCFmb3JtKSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogRm9ybSAke2Zvcm1OYW1lfSBub3QgZm91bmQgdG8gY2xvc2VgKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCBidXR0b25OYW1lO1xyXG4gICAgaWYgKGZvcm1OYW1lID09PSAnU3lzUmVjdXJyZW5jZScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ0NvbW1hbmRCdXR0b25PaycgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9IGVsc2UgaWYgKGZvcm1OYW1lID09PSAnU3lzUXVlcnlGb3JtJykge1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnT2tCdXR0b24nIDogJ0NhbmNlbEJ1dHRvbic7XHJcbiAgICB9IGVsc2UgaWYgKGZvcm1OYW1lID09PSAnU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtJykge1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnQ29tbWFuZEJ1dHRvbicgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFRyeSBnZW5lcmljIG5hbWVzXHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdDb21tYW5kQnV0dG9uJyA6ICdDb21tYW5kQnV0dG9uQ2FuY2VsJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgYnV0dG9uID0gZm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2J1dHRvbk5hbWV9XCJdYCk7XHJcbiAgICBpZiAoYnV0dG9uKSB7XHJcbiAgICAgICAgYnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgICAgICBsb2dTdGVwKGBEaWFsb2cgJHtmb3JtTmFtZX0gY2xvc2VkIHdpdGggJHthY3Rpb24udG9VcHBlckNhc2UoKX1gKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogJHthY3Rpb24udG9VcHBlckNhc2UoKX0gYnV0dG9uIG5vdCBmb3VuZCBpbiAke2Zvcm1OYW1lfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRDdXJyZW50Um93VmFsdWUoZmllbGRNYXBwaW5nKSB7XHJcbiAgICBpZiAoIWZpZWxkTWFwcGluZykgcmV0dXJuICcnO1xyXG4gICAgY29uc3Qgcm93ID0gd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50RGF0YVJvdyB8fCB7fTtcclxuICAgIGNvbnN0IGRpcmVjdCA9IHJvd1tmaWVsZE1hcHBpbmddO1xyXG4gICAgaWYgKGRpcmVjdCAhPT0gdW5kZWZpbmVkICYmIGRpcmVjdCAhPT0gbnVsbCkge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmcoZGlyZWN0KTtcclxuICAgIH1cclxuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGZpZWxkTWFwcGluZy5pbmNsdWRlcygnOicpID8gZmllbGRNYXBwaW5nLnNwbGl0KCc6JykucG9wKCkgOiBmaWVsZE1hcHBpbmc7XHJcbiAgICBjb25zdCB2YWx1ZSA9IHJvd1tmaWVsZE5hbWVdO1xyXG4gICAgcmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwgPyAnJyA6IFN0cmluZyh2YWx1ZSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVEeW5hbWljVGV4dCh0ZXh0KSB7XHJcbiAgICBpZiAodHlwZW9mIHRleHQgIT09ICdzdHJpbmcnIHx8ICF0ZXh0KSByZXR1cm4gdGV4dCB8fCAnJztcclxuXHJcbiAgICBsZXQgcmVzb2x2ZWQgPSB0ZXh0O1xyXG4gICAgaWYgKC9fX0QzNjVfUEFSQU1fQ0xJUEJPQVJEX1thLXowLTlfXStfXy9pLnRlc3QocmVzb2x2ZWQpKSB7XHJcbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuY2xpcGJvYXJkPy5yZWFkVGV4dCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaXBib2FyZCBBUEkgbm90IGF2YWlsYWJsZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBjbGlwYm9hcmRUZXh0ID0gYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC5yZWFkVGV4dCgpO1xyXG4gICAgICAgIHJlc29sdmVkID0gcmVzb2x2ZWQucmVwbGFjZSgvX19EMzY1X1BBUkFNX0NMSVBCT0FSRF9bYS16MC05X10rX18vZ2ksIGNsaXBib2FyZFRleHQgPz8gJycpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlc29sdmVkID0gcmVzb2x2ZWQucmVwbGFjZSgvX19EMzY1X1BBUkFNX0RBVEFfKFtBLVphLXowLTklLl9+LV0qKV9fL2csIChfLCBlbmNvZGVkRmllbGQpID0+IHtcclxuICAgICAgICBjb25zdCBmaWVsZCA9IGRlY29kZVVSSUNvbXBvbmVudChlbmNvZGVkRmllbGQgfHwgJycpO1xyXG4gICAgICAgIHJldHVybiBnZXRDdXJyZW50Um93VmFsdWUoZmllbGQpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc29sdmVkO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbmF2aWdhdGVUb0Zvcm0oc3RlcCkge1xyXG4gICAgY29uc3QgeyBuYXZpZ2F0ZU1ldGhvZCwgbWVudUl0ZW1OYW1lLCBtZW51SXRlbVR5cGUsIG5hdmlnYXRlVXJsLCBob3N0UmVsYXRpdmVQYXRoLCB3YWl0Rm9yTG9hZCwgb3BlbkluTmV3VGFiIH0gPSBzdGVwO1xyXG5cclxuICAgIGNvbnN0IHJlc29sdmVkTWVudUl0ZW1OYW1lID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KG1lbnVJdGVtTmFtZSB8fCAnJyk7XHJcbiAgICBjb25zdCByZXNvbHZlZE5hdmlnYXRlVXJsID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KG5hdmlnYXRlVXJsIHx8ICcnKTtcclxuICAgIGNvbnN0IHJlc29sdmVkSG9zdFJlbGF0aXZlUGF0aCA9IGF3YWl0IHJlc29sdmVEeW5hbWljVGV4dChob3N0UmVsYXRpdmVQYXRoIHx8ICcnKTtcclxuXHJcbiAgICBsb2dTdGVwKGBOYXZpZ2F0aW5nIHRvIGZvcm06ICR7cmVzb2x2ZWRNZW51SXRlbU5hbWUgfHwgcmVzb2x2ZWROYXZpZ2F0ZVVybH1gKTtcclxuICAgIFxyXG4gICAgbGV0IHRhcmdldFVybDtcclxuICAgIGNvbnN0IGJhc2VVcmwgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lO1xyXG4gICAgXHJcbiAgICBpZiAobmF2aWdhdGVNZXRob2QgPT09ICd1cmwnICYmIHJlc29sdmVkTmF2aWdhdGVVcmwpIHtcclxuICAgICAgICAvLyBVc2UgZnVsbCBVUkwgcGF0aCBwcm92aWRlZFxyXG4gICAgICAgIHRhcmdldFVybCA9IHJlc29sdmVkTmF2aWdhdGVVcmwuc3RhcnRzV2l0aCgnaHR0cCcpID8gcmVzb2x2ZWROYXZpZ2F0ZVVybCA6IGJhc2VVcmwgKyByZXNvbHZlZE5hdmlnYXRlVXJsO1xyXG4gICAgfSBlbHNlIGlmIChuYXZpZ2F0ZU1ldGhvZCA9PT0gJ2hvc3RSZWxhdGl2ZScgJiYgcmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoKSB7XHJcbiAgICAgICAgLy8gUmV1c2UgY3VycmVudCBob3N0IGR5bmFtaWNhbGx5LCBhcHBlbmQgcHJvdmlkZWQgcGF0aC9xdWVyeS5cclxuICAgICAgICBjb25zdCByZWxhdGl2ZVBhcnQgPSBTdHJpbmcocmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoKS50cmltKCk7XHJcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHJlbGF0aXZlUGFydC5zdGFydHNXaXRoKCcvJykgfHwgcmVsYXRpdmVQYXJ0LnN0YXJ0c1dpdGgoJz8nKVxyXG4gICAgICAgICAgICA/IHJlbGF0aXZlUGFydFxyXG4gICAgICAgICAgICA6IGAvJHtyZWxhdGl2ZVBhcnR9YDtcclxuICAgICAgICB0YXJnZXRVcmwgPSBgJHt3aW5kb3cubG9jYXRpb24ucHJvdG9jb2x9Ly8ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fSR7bm9ybWFsaXplZH1gO1xyXG4gICAgfSBlbHNlIGlmIChyZXNvbHZlZE1lbnVJdGVtTmFtZSkge1xyXG4gICAgICAgIC8vIEJ1aWxkIFVSTCBmcm9tIG1lbnUgaXRlbSBuYW1lXHJcbiAgICAgICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcclxuICAgICAgICBwYXJhbXMuZGVsZXRlKCdxJyk7XHJcbiAgICAgICAgY29uc3QgdHlwZVByZWZpeCA9IChtZW51SXRlbVR5cGUgJiYgbWVudUl0ZW1UeXBlICE9PSAnRGlzcGxheScpID8gYCR7bWVudUl0ZW1UeXBlfTpgIDogJyc7XHJcbiAgICAgICAgY29uc3QgcmF3TWVudUl0ZW0gPSBTdHJpbmcocmVzb2x2ZWRNZW51SXRlbU5hbWUpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gU3VwcG9ydCBleHRlbmRlZCBpbnB1dCBsaWtlOlxyXG4gICAgICAgIC8vIFwiU3lzVGFibGVCcm93c2VyJnRhYmxlTmFtZT1JbnZlbnRUYWJsZVwiXHJcbiAgICAgICAgLy8gc28gZXh0cmEgcXVlcnkgcGFyYW1zIGFyZSBhcHBlbmRlZCBhcyByZWFsIFVSTCBwYXJhbXMsIG5vdCBlbmNvZGVkIGludG8gbWkuXHJcbiAgICAgICAgY29uc3Qgc2VwYXJhdG9ySW5kZXggPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgLi4uWyc/JywgJyYnXVxyXG4gICAgICAgICAgICAgICAgLm1hcChjaCA9PiByYXdNZW51SXRlbS5pbmRleE9mKGNoKSlcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIoaWR4ID0+IGlkeCA+PSAwKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGxldCBtZW51SXRlbUJhc2UgPSByYXdNZW51SXRlbTtcclxuICAgICAgICBsZXQgZXh0cmFRdWVyeSA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHNlcGFyYXRvckluZGV4KSkge1xyXG4gICAgICAgICAgICBtZW51SXRlbUJhc2UgPSByYXdNZW51SXRlbS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpO1xyXG4gICAgICAgICAgICBleHRyYVF1ZXJ5ID0gcmF3TWVudUl0ZW0uc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKS50cmltKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBwYXJhbXMuc2V0KCdtaScsIGAke3R5cGVQcmVmaXh9JHttZW51SXRlbUJhc2V9YCk7XHJcblxyXG4gICAgICAgIGlmIChleHRyYVF1ZXJ5KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGV4dHJhcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoZXh0cmFRdWVyeSk7XHJcbiAgICAgICAgICAgIGV4dHJhcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoa2V5ICYmIGtleSAhPT0gJ21pJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhcmFtcy5zZXQoa2V5LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGFyZ2V0VXJsID0gYmFzZVVybCArICc/JyArIHBhcmFtcy50b1N0cmluZygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05hdmlnYXRlIHN0ZXAgcmVxdWlyZXMgZWl0aGVyIG1lbnVJdGVtTmFtZSBvciBuYXZpZ2F0ZVVybCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBOYXZpZ2F0aW5nIHRvOiAke3RhcmdldFVybH1gKTtcclxuXHJcbiAgICBpZiAob3BlbkluTmV3VGFiKSB7XHJcbiAgICAgICAgd2luZG93Lm9wZW4odGFyZ2V0VXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyJyk7XHJcbiAgICAgICAgbG9nU3RlcCgnT3BlbmVkIG5hdmlnYXRpb24gdGFyZ2V0IGluIGEgbmV3IHRhYicpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTYXZlIHBlbmRpbmcgd29ya2Zsb3cgc3RhdGUgZGlyZWN0bHkgaW4gc2Vzc2lvblN0b3JhZ2UgYmVmb3JlIG5hdmlnYXRpb25cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldE1lbnVJdGVtTmFtZSA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdtaScpIHx8ICcnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElNUE9SVEFOVDogUGVyc2lzdCBwZW5kaW5nIG5hdmlnYXRpb24gc3RhdGUgZnJvbSB0aGUgY3VycmVudGx5IGV4ZWN1dGluZyB3b3JrZmxvdy5cclxuICAgICAgICAvLyBQcmVmZXIgY3VycmVudCB3b3JrZmxvdyBjb250ZXh0IGZpcnN0LCB0aGVuIGl0cyBvcmlnaW5hbC9mdWxsIHdvcmtmbG93IHdoZW4gcHJlc2VudC5cclxuICAgICAgICBjb25zdCBjdXJyZW50V29ya2Zsb3cgPSB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyB8fCBudWxsO1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsV29ya2Zsb3cgPSBjdXJyZW50V29ya2Zsb3c/Ll9vcmlnaW5hbFdvcmtmbG93IHx8IGN1cnJlbnRXb3JrZmxvdyB8fCB3aW5kb3cuZDM2NU9yaWdpbmFsV29ya2Zsb3cgfHwgbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwZW5kaW5nU3RhdGUgPSB7XHJcbiAgICAgICAgICAgIHdvcmtmbG93OiBvcmlnaW5hbFdvcmtmbG93LFxyXG4gICAgICAgICAgICB3b3JrZmxvd0lkOiBvcmlnaW5hbFdvcmtmbG93Py5pZCB8fCAnJyxcclxuICAgICAgICAgICAgbmV4dFN0ZXBJbmRleDogKHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudFN0ZXBJbmRleCA/PyAwKSArIDEsXHJcbiAgICAgICAgICAgIGN1cnJlbnRSb3dJbmRleDogd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50Um93SW5kZXggfHwgMCxcclxuICAgICAgICAgICAgdG90YWxSb3dzOiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LnRvdGFsUm93cyB8fCAwLFxyXG4gICAgICAgICAgICBkYXRhOiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnREYXRhUm93IHx8IG51bGwsXHJcbiAgICAgICAgICAgIHRhcmdldE1lbnVJdGVtTmFtZTogdGFyZ2V0TWVudUl0ZW1OYW1lLFxyXG4gICAgICAgICAgICB3YWl0Rm9yTG9hZDogd2FpdEZvckxvYWQgfHwgMzAwMCxcclxuICAgICAgICAgICAgc2F2ZWRBdDogRGF0ZS5ub3coKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9wZW5kaW5nX3dvcmtmbG93JywgSlNPTi5zdHJpbmdpZnkocGVuZGluZ1N0YXRlKSk7XHJcbiAgICAgICAgbG9nU3RlcChgU2F2ZWQgd29ya2Zsb3cgc3RhdGUgZm9yIG5hdmlnYXRpb24gKG5leHRTdGVwSW5kZXg6ICR7cGVuZGluZ1N0YXRlLm5leHRTdGVwSW5kZXh9KWApO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUud2FybignW0QzNjVdIEZhaWxlZCB0byBzYXZlIHdvcmtmbG93IHN0YXRlIGluIHNlc3Npb25TdG9yYWdlOicsIGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTaWduYWwgbmF2aWdhdGlvbiBpcyBhYm91dCB0byBoYXBwZW4gLSB3b3JrZmxvdyBzdGF0ZSB3aWxsIGJlIHNhdmVkIGJ5IHRoZSBleHRlbnNpb25cclxuICAgIC8vIFdlIG5lZWQgdG8gd2FpdCBmb3IgdGhlIHN0YXRlIHRvIGJlIHNhdmVkIGJlZm9yZSBuYXZpZ2F0aW5nXHJcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX05BVklHQVRJTkcnLFxyXG4gICAgICAgIHRhcmdldFVybDogdGFyZ2V0VXJsLFxyXG4gICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwXHJcbiAgICB9LCAnKicpO1xyXG4gICAgXHJcbiAgICAvLyBXYWl0IGxvbmdlciB0byBlbnN1cmUgdGhlIGZ1bGwgY2hhaW4gY29tcGxldGVzOlxyXG4gICAgLy8gcG9zdE1lc3NhZ2UgLT4gY29udGVudC5qcyAtPiBiYWNrZ3JvdW5kLmpzIC0+IHBvcHVwIC0+IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdFxyXG4gICAgLy8gVGhpcyBjaGFpbiBpbnZvbHZlcyBtdWx0aXBsZSBhc3luYyBob3BzLCBzbyB3ZSBuZWVkIHN1ZmZpY2llbnQgdGltZVxyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgIFxyXG4gICAgLy8gTmF2aWdhdGUgLSB0aGlzIHdpbGwgY2F1c2UgcGFnZSByZWxvYWQsIHNjcmlwdCBjb250ZXh0IHdpbGwgYmUgbG9zdFxyXG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0YXJnZXRVcmw7XHJcbiAgICBcclxuICAgIC8vIFRoaXMgY29kZSB3b24ndCBleGVjdXRlIGR1ZSB0byBwYWdlIG5hdmlnYXRpb24sIGJ1dCBrZWVwIGl0IGZvciByZWZlcmVuY2VcclxuICAgIC8vIFRoZSB3b3JrZmxvdyB3aWxsIGJlIHJlc3VtZWQgYnkgdGhlIGNvbnRlbnQgc2NyaXB0IGFmdGVyIHBhZ2UgbG9hZFxyXG4gICAgYXdhaXQgc2xlZXAod2FpdEZvckxvYWQgfHwgMzAwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZVRhYihjb250cm9sTmFtZSkge1xyXG4gICAgbG9nU3RlcChgQWN0aXZhdGluZyB0YWI6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIHRhYiBlbGVtZW50IC0gY291bGQgYmUgdGhlIHRhYiBjb250ZW50IG9yIHRoZSB0YWIgYnV0dG9uIGl0c2VsZlxyXG4gICAgbGV0IHRhYkVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vdCBmb3VuZCBkaXJlY3RseSwgdHJ5IGZpbmRpbmcgYnkgbG9va2luZyBmb3IgdGFiIGhlYWRlcnMvbGlua3NcclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIHRoZSB0YWIgbGluay9idXR0b24gdGhhdCByZWZlcmVuY2VzIHRoaXMgdGFiXHJcbiAgICAgICAgdGFiRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9X2hlYWRlclwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdIFtyb2xlPVwidGFiXCJdYCkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2FyaWEtY29udHJvbHM9XCIke2NvbnRyb2xOYW1lfVwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGFbaHJlZio9XCIke2NvbnRyb2xOYW1lfVwiXSwgYnV0dG9uW2RhdGEtdGFyZ2V0Kj1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVGFiIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgRDM2NSBwYXJhbWV0ZXIgZm9ybXMgd2l0aCB2ZXJ0aWNhbCB0YWJzLCB0aGUgY2xpY2thYmxlIGVsZW1lbnQgc3RydWN0dXJlIHZhcmllc1xyXG4gICAgLy8gVHJ5IG11bHRpcGxlIGFwcHJvYWNoZXMgdG8gZmluZCBhbmQgY2xpY2sgdGhlIHJpZ2h0IGVsZW1lbnRcclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMTogTG9vayBmb3IgdGhlIHRhYiBsaW5rIGluc2lkZSBhIHBpdm90L3RhYiBzdHJ1Y3R1cmVcclxuICAgIGxldCBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3RvcignLnBpdm90LWxpbmssIC50YWItbGluaywgW3JvbGU9XCJ0YWJcIl0nKTtcclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMjogVGhlIGVsZW1lbnQgaXRzZWxmIG1pZ2h0IGJlIHRoZSBsaW5rXHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0ICYmICh0YWJFbGVtZW50LnRhZ05hbWUgPT09ICdBJyB8fCB0YWJFbGVtZW50LnRhZ05hbWUgPT09ICdCVVRUT04nIHx8IHRhYkVsZW1lbnQuZ2V0QXR0cmlidXRlKCdyb2xlJykgPT09ICd0YWInKSkge1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMzogRm9yIHZlcnRpY2FsIHRhYnMsIGxvb2sgZm9yIHRoZSBhbmNob3Igb3IgbGluayBlbGVtZW50XHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2EsIGJ1dHRvbicpIHx8IHRhYkVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDQ6IEZvciBQaXZvdEl0ZW0sIGZpbmQgdGhlIGhlYWRlciBlbGVtZW50XHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0IHx8IGNsaWNrVGFyZ2V0ID09PSB0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGNvbnRyb2xOYW1lICsgJ19oZWFkZXInO1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtoZWFkZXJOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXJFbCkge1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlckVsLnF1ZXJ5U2VsZWN0b3IoJ2EsIGJ1dHRvbiwgLnBpdm90LWxpbmsnKSB8fCBoZWFkZXJFbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYENsaWNraW5nIHRhYiBlbGVtZW50OiAke2NsaWNrVGFyZ2V0Py50YWdOYW1lIHx8ICd1bmtub3duJ31gKTtcclxuICAgIFxyXG4gICAgLy8gRm9jdXMgYW5kIGNsaWNrXHJcbiAgICBpZiAoY2xpY2tUYXJnZXQuZm9jdXMpIGNsaWNrVGFyZ2V0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdJTlBVVF9TRVRUTEVfREVMQVknKTtcclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZVxyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgXHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgIFxyXG4gICAgLy8gQWxzbyB0cnkgdHJpZ2dlcmluZyB0aGUgRDM2NSBpbnRlcm5hbCBjb250cm9sXHJcbiAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuQWN0aXZhdGVUYWIgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLkFjdGl2YXRlVGFiKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBBY3RpdmF0ZVRhYiBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5hY3RpdmF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuYWN0aXZhdGUoKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgYWN0aXZhdGUgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuc2VsZWN0ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5zZWxlY3QoKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgc2VsZWN0IG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYEQzNjUgY29udHJvbCBtZXRob2QgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIHRhYiBjb250ZW50IHRvIGxvYWRcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0NMSUNLX0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgdGhlIHRhYiBpcyBub3cgYWN0aXZlIGJ5IGNoZWNraW5nIGZvciB2aXNpYmxlIGNvbnRlbnRcclxuICAgIGNvbnN0IHRhYkNvbnRlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgaWYgKHRhYkNvbnRlbnQpIHtcclxuICAgICAgICBjb25zdCBpc1Zpc2libGUgPSB0YWJDb250ZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbDtcclxuICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IHRhYkNvbnRlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFiQ29udGVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYkNvbnRlbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicpICE9PSAndHJ1ZSc7XHJcbiAgICAgICAgbG9nU3RlcChgVGFiICR7Y29udHJvbE5hbWV9IHZpc2liaWxpdHkgY2hlY2s6IHZpc2libGU9JHtpc1Zpc2libGV9LCBhY3RpdmU9JHtpc0FjdGl2ZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgVGFiICR7Y29udHJvbE5hbWV9IGFjdGl2YXRlZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWN0aXZhdGVBY3Rpb25QYW5lVGFiKGNvbnRyb2xOYW1lKSB7XHJcbiAgICBsb2dTdGVwKGBBY3RpdmF0aW5nIGFjdGlvbiBwYW5lIHRhYjogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICBsZXQgdGFiRWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuXHJcbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgICAgIGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgIGAuYXBwQmFyVGFiW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICBgLmFwcEJhclRhYiBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgIGBbcm9sZT1cInRhYlwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICAgICAgdGFiRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgICAgICBpZiAodGFiRWxlbWVudCkgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWN0aW9uIHBhbmUgdGFiIG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xyXG5cclxuICAgIGNvbnN0IGhlYWRlciA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCcuYXBwQmFyVGFiLWhlYWRlciwgLmFwcEJhclRhYkhlYWRlciwgLmFwcEJhclRhYl9oZWFkZXInKTtcclxuICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlcjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmb2N1c1NlbGVjdG9yID0gdGFiRWxlbWVudC5nZXRBdHRyaWJ1dGU/LignZGF0YS1keW4tZm9jdXMnKTtcclxuICAgIGlmIChmb2N1c1NlbGVjdG9yKSB7XHJcbiAgICAgICAgY29uc3QgZm9jdXNUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoZm9jdXNTZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGZvY3VzVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZm9jdXNUYXJnZXQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0YWJFbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdyb2xlJykgPT09ICd0YWInKSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChjbGlja1RhcmdldCA9PT0gdGFiRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbmlzaCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCdidXR0b24sIGEsIFtyb2xlPVwidGFiXCJdJyk7XHJcbiAgICAgICAgaWYgKGJ1dHRvbmlzaCkgY2xpY2tUYXJnZXQgPSBidXR0b25pc2g7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNsaWNrVGFyZ2V0Py5mb2N1cykgY2xpY2tUYXJnZXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOUFVUX1NFVFRMRV9ERUxBWScpO1xyXG4gICAgZGlzcGF0Y2hDbGlja1NlcXVlbmNlKGNsaWNrVGFyZ2V0KTtcclxuXHJcbiAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuYWN0aXZhdGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLmFjdGl2YXRlKCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLnNlbGVjdCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuc2VsZWN0KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYEFjdGlvbiBwYW5lIGNvbnRyb2wgbWV0aG9kIGZhaWxlZDogJHtlLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1NBVkVfU0VUVExFX0RFTEFZJyk7XHJcbiAgICBsb2dTdGVwKGBBY3Rpb24gcGFuZSB0YWIgJHtjb250cm9sTmFtZX0gYWN0aXZhdGVkYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleHBhbmRPckNvbGxhcHNlU2VjdGlvbihjb250cm9sTmFtZSwgYWN0aW9uKSB7XHJcbiAgICBsb2dTdGVwKGAke2FjdGlvbiA9PT0gJ2V4cGFuZCcgPyAnRXhwYW5kaW5nJyA6ICdDb2xsYXBzaW5nJ30gc2VjdGlvbjogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIFxyXG4gICAgY29uc3Qgc2VjdGlvbiA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghc2VjdGlvbikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgU2VjdGlvbiBlbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRDM2NSBzZWN0aW9ucyBjYW4gaGF2ZSB2YXJpb3VzIHN0cnVjdHVyZXMuIFRoZSB0b2dnbGUgYnV0dG9uIGlzIHVzdWFsbHk6XHJcbiAgICAvLyAxLiBBIGJ1dHRvbiB3aXRoIGFyaWEtZXhwYW5kZWQgaW5zaWRlIHRoZSBzZWN0aW9uXHJcbiAgICAvLyAyLiBBIHNlY3Rpb24gaGVhZGVyIGVsZW1lbnRcclxuICAgIC8vIDMuIFRoZSBzZWN0aW9uIGl0c2VsZiBtaWdodCBiZSBjbGlja2FibGVcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgdG9nZ2xlIGJ1dHRvbiAtIHRoaXMgaXMgY3J1Y2lhbCBmb3IgRDM2NSBkaWFsb2dzXHJcbiAgICBsZXQgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCdidXR0b25bYXJpYS1leHBhbmRlZF0nKTtcclxuICAgIFxyXG4gICAgLy8gSWYgbm90IGZvdW5kLCB0cnkgb3RoZXIgY29tbW9uIHBhdHRlcm5zXHJcbiAgICBpZiAoIXRvZ2dsZUJ1dHRvbikge1xyXG4gICAgICAgIHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb24ucXVlcnlTZWxlY3RvcignLnNlY3Rpb24tcGFnZS1jYXB0aW9uLCAuc2VjdGlvbi1oZWFkZXIsIC5ncm91cC1oZWFkZXIsIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRm9yIFN5c09wZXJhdGlvblRlbXBsYXRlRm9ybSBzZWN0aW9ucyAoUmVjb3JkcyB0byBpbmNsdWRlLCBSdW4gaW4gdGhlIGJhY2tncm91bmQpXHJcbiAgICAvLyB0aGUgYnV0dG9uIGlzIG9mdGVuIGEgZGlyZWN0IGNoaWxkIG9yIHNpYmxpbmdcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCdidXR0b24nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHNlY3Rpb24gaXRzZWxmIGhhcyBhcmlhLWV4cGFuZGVkIChpdCBtaWdodCBiZSB0aGUgY2xpY2thYmxlIGVsZW1lbnQpXHJcbiAgICBpZiAoIXRvZ2dsZUJ1dHRvbiAmJiBzZWN0aW9uLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgc3RhdGUgZnJvbSB2YXJpb3VzIHNvdXJjZXNcclxuICAgIGxldCBpc0V4cGFuZGVkID0gZmFsc2U7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIHRoZSB0b2dnbGUgYnV0dG9uJ3MgYXJpYS1leHBhbmRlZFxyXG4gICAgaWYgKHRvZ2dsZUJ1dHRvbiAmJiB0b2dnbGVCdXR0b24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICBpc0V4cGFuZGVkID0gdG9nZ2xlQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2UgaWYgKHNlY3Rpb24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICBpc0V4cGFuZGVkID0gc2VjdGlvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBjbGFzcy1iYXNlZCBkZXRlY3Rpb25cclxuICAgICAgICBpc0V4cGFuZGVkID0gc2VjdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgIXNlY3Rpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSBjdXJyZW50IHN0YXRlOiAke2lzRXhwYW5kZWQgPyAnZXhwYW5kZWQnIDogJ2NvbGxhcHNlZCd9YCk7XHJcbiAgICBcclxuICAgIGNvbnN0IG5lZWRzVG9nZ2xlID0gKGFjdGlvbiA9PT0gJ2V4cGFuZCcgJiYgIWlzRXhwYW5kZWQpIHx8IChhY3Rpb24gPT09ICdjb2xsYXBzZScgJiYgaXNFeHBhbmRlZCk7XHJcbiAgICBcclxuICAgIGlmIChuZWVkc1RvZ2dsZSkge1xyXG4gICAgICAgIC8vIENsaWNrIHRoZSB0b2dnbGUgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gdG9nZ2xlQnV0dG9uIHx8IHNlY3Rpb247XHJcbiAgICAgICAgbG9nU3RlcChgQ2xpY2tpbmcgdG9nZ2xlIGVsZW1lbnQ6ICR7Y2xpY2tUYXJnZXQudGFnTmFtZX0sIGNsYXNzPSR7Y2xpY2tUYXJnZXQuY2xhc3NOYW1lfWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc3BhdGNoIGZ1bGwgY2xpY2sgc2VxdWVuY2UgZm9yIEQzNjUgUmVhY3QgY29tcG9uZW50c1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVydXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgRDM2NSBpbnRlcm5hbCBjb250cm9sIEFQSVxyXG4gICAgICAgIGlmICh0eXBlb2YgJGR5biAhPT0gJ3VuZGVmaW5lZCcgJiYgJGR5bi5jb250cm9scykge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29udHJvbCA9ICRkeW4uY29udHJvbHNbY29udHJvbE5hbWVdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNvbnRyb2wpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBUcnkgdmFyaW91cyBEMzY1IG1ldGhvZHNcclxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuRXhwYW5kZWRDaGFuZ2VkID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEV4cGFuZGVkQ2hhbmdlZCB0YWtlcyAwIGZvciBleHBhbmQsIDEgZm9yIGNvbGxhcHNlIGluIEQzNjVcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5FeHBhbmRlZENoYW5nZWQoYWN0aW9uID09PSAnY29sbGFwc2UnID8gMSA6IDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgRXhwYW5kZWRDaGFuZ2VkKCR7YWN0aW9uID09PSAnY29sbGFwc2UnID8gMSA6IDB9KSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuZXhwYW5kID09PSAnZnVuY3Rpb24nICYmIGFjdGlvbiA9PT0gJ2V4cGFuZCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5leHBhbmQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIGV4cGFuZCgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5jb2xsYXBzZSA9PT0gJ2Z1bmN0aW9uJyAmJiBhY3Rpb24gPT09ICdjb2xsYXBzZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5jb2xsYXBzZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgY29sbGFwc2UoKSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wudG9nZ2xlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wudG9nZ2xlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCB0b2dnbGUoKSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgbG9nU3RlcChgRDM2NSBjb250cm9sIG1ldGhvZCBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKGBTZWN0aW9uICR7Y29udHJvbE5hbWV9IGFscmVhZHkgJHthY3Rpb259ZWQsIG5vIHRvZ2dsZSBuZWVkZWRgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSAke2FjdGlvbn1lZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlUXVlcnlGaWx0ZXIodGFibGVOYW1lLCBmaWVsZE5hbWUsIGNyaXRlcmlhVmFsdWUsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgbG9nU3RlcChgQ29uZmlndXJpbmcgcXVlcnkgZmlsdGVyOiAke3RhYmxlTmFtZSA/IHRhYmxlTmFtZSArICcuJyA6ICcnfSR7ZmllbGROYW1lfSA9ICR7Y3JpdGVyaWFWYWx1ZX1gKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCBvciBvcGVuIHRoZSBxdWVyeSBmaWx0ZXIgZGlhbG9nXHJcbiAgICBsZXQgcXVlcnlGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpO1xyXG4gICAgaWYgKCFxdWVyeUZvcm0pIHtcclxuICAgICAgICAvLyBUcnkgdG8gb3BlbiB0aGUgcXVlcnkgZGlhbG9nIHZpYSBRdWVyeSBidXR0b25cclxuICAgICAgICBjb25zdCBmaWx0ZXJCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJRdWVyeVNlbGVjdEJ1dHRvblwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJRdWVyeVwiXScpO1xyXG4gICAgICAgIGlmIChmaWx0ZXJCdXR0b24pIHtcclxuICAgICAgICAgICAgZmlsdGVyQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1ZBTElEQVRJT05fV0FJVCcpO1xyXG4gICAgICAgICAgICBxdWVyeUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXF1ZXJ5Rm9ybSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUXVlcnkgZmlsdGVyIGRpYWxvZyAoU3lzUXVlcnlGb3JtKSBub3QgZm91bmQuIE1ha2Ugc3VyZSB0aGUgZmlsdGVyIGRpYWxvZyBpcyBvcGVuLicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gZmluZCBlbGVtZW50IHdpdGhpbiBxdWVyeSBmb3JtXHJcbiAgICBjb25zdCBmaW5kSW5RdWVyeSA9IChuYW1lKSA9PiBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtuYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICAvLyBJZiBzYXZlZFF1ZXJ5IGlzIHNwZWNpZmllZCwgc2VsZWN0IGl0IGZyb20gdGhlIGRyb3Bkb3duIGZpcnN0XHJcbiAgICBpZiAob3B0aW9ucy5zYXZlZFF1ZXJ5KSB7XHJcbiAgICAgICAgY29uc3Qgc2F2ZWRRdWVyeUJveCA9IGZpbmRJblF1ZXJ5KCdTYXZlZFF1ZXJpZXNCb3gnKTtcclxuICAgICAgICBpZiAoc2F2ZWRRdWVyeUJveCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IHNhdmVkUXVlcnlCb3gucXVlcnlTZWxlY3RvcignaW5wdXQnKTtcclxuICAgICAgICAgICAgaWYgKGlucHV0KSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBvcHRpb25zLnNhdmVkUXVlcnksIG9wdGlvbnMuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIE1ha2Ugc3VyZSB3ZSdyZSBvbiB0aGUgUmFuZ2UgdGFiXHJcbiAgICBjb25zdCByYW5nZVRhYiA9IGZpbmRJblF1ZXJ5KCdSYW5nZVRhYicpIHx8IGZpbmRJblF1ZXJ5KCdSYW5nZVRhYl9oZWFkZXInKTtcclxuICAgIGlmIChyYW5nZVRhYiAmJiAhcmFuZ2VUYWIuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSAmJiByYW5nZVRhYi5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSAhPT0gJ3RydWUnKSB7XHJcbiAgICAgICAgcmFuZ2VUYWIuY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2xpY2sgQWRkIHRvIGFkZCBhIG5ldyBmaWx0ZXIgcm93XHJcbiAgICBjb25zdCBhZGRCdXR0b24gPSBmaW5kSW5RdWVyeSgnUmFuZ2VBZGQnKTtcclxuICAgIGlmIChhZGRCdXR0b24pIHtcclxuICAgICAgICBhZGRCdXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdERUZBVUxUX1dBSVRfU1RFUF9ERUxBWScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUaGUgZ3JpZCB1c2VzIFJlYWN0TGlzdCAtIGZpbmQgdGhlIGxhc3Qgcm93IChuZXdseSBhZGRlZCkgYW5kIGZpbGwgaW4gdmFsdWVzXHJcbiAgICBjb25zdCBncmlkID0gZmluZEluUXVlcnkoJ1JhbmdlR3JpZCcpO1xyXG4gICAgaWYgKCFncmlkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdSYW5nZSBncmlkIG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBHZXQgYWxsIHJvd3MgYW5kIGZpbmQgdGhlIGxhc3Qgb25lIChtb3N0IHJlY2VudGx5IGFkZGVkKVxyXG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyb3dcIl0sIHRyLCAubGlzdC1yb3cnKTtcclxuICAgIGNvbnN0IGxhc3RSb3cgPSByb3dzW3Jvd3MubGVuZ3RoIC0gMV0gfHwgZ3JpZDtcclxuICAgIFxyXG4gICAgLy8gU2V0IHRhYmxlIG5hbWUgaWYgcHJvdmlkZWRcclxuICAgIGlmICh0YWJsZU5hbWUpIHtcclxuICAgICAgICBjb25zdCB0YWJsZUNlbGwgPSBsYXN0Um93LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVGFibGVcIl0nKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VUYWJsZVwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RUYWJsZUNlbGwgPSB0YWJsZUNlbGwubGVuZ3RoID8gdGFibGVDZWxsW3RhYmxlQ2VsbC5sZW5ndGggLSAxXSA6IHRhYmxlQ2VsbDtcclxuICAgICAgICBpZiAobGFzdFRhYmxlQ2VsbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGxhc3RUYWJsZUNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBsYXN0VGFibGVDZWxsO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCB0YWJsZU5hbWUsIG9wdGlvbnMuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgZmllbGQgbmFtZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKGZpZWxkTmFtZSkge1xyXG4gICAgICAgIGNvbnN0IGZpZWxkQ2VsbHMgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlRmllbGRcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0RmllbGRDZWxsID0gZmllbGRDZWxsc1tmaWVsZENlbGxzLmxlbmd0aCAtIDFdIHx8IGdyaWQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VGaWVsZFwiXScpO1xyXG4gICAgICAgIGlmIChsYXN0RmllbGRDZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbGFzdEZpZWxkQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGxhc3RGaWVsZENlbGw7XHJcbiAgICAgICAgICAgIC8vIENsaWNrIHRvIG9wZW4gZHJvcGRvd24vZm9jdXNcclxuICAgICAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgZmllbGROYW1lLCBvcHRpb25zLmNvbWJvU2VsZWN0TW9kZSB8fCAnJyk7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGNyaXRlcmlhIHZhbHVlIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoY3JpdGVyaWFWYWx1ZSkge1xyXG4gICAgICAgIGNvbnN0IHZhbHVlQ2VsbHMgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVmFsdWVcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0VmFsdWVDZWxsID0gdmFsdWVDZWxsc1t2YWx1ZUNlbGxzLmxlbmd0aCAtIDFdIHx8IGdyaWQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VWYWx1ZVwiXScpO1xyXG4gICAgICAgIGlmIChsYXN0VmFsdWVDZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbGFzdFZhbHVlQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGxhc3RWYWx1ZUNlbGw7XHJcbiAgICAgICAgICAgIGlucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGNyaXRlcmlhVmFsdWUsIG9wdGlvbnMuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdRdWVyeSBmaWx0ZXIgY29uZmlndXJlZCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlQmF0Y2hQcm9jZXNzaW5nKGVuYWJsZWQsIHRhc2tEZXNjcmlwdGlvbiwgYmF0Y2hHcm91cCwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgICBsb2dTdGVwKGBDb25maWd1cmluZyBiYXRjaCBwcm9jZXNzaW5nOiAke2VuYWJsZWQgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnfWApO1xyXG4gICAgXHJcbiAgICAvLyBXYWl0IGZvciBkaWFsb2cgdG8gYmUgcmVhZHlcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSBiYXRjaCBwcm9jZXNzaW5nIGNoZWNrYm94IC0gY29udHJvbCBuYW1lIGlzIEZsZDFfMSBpbiBTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cclxuICAgIGNvbnN0IGJhdGNoVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWU9XCJGbGQxXzFcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCgnRmxkMV8xJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiRmxkMV8xXCJdJyk7XHJcbiAgICBcclxuICAgIGlmIChiYXRjaFRvZ2dsZSkge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGFjdHVhbCBjaGVja2JveCBpbnB1dCBvciB0b2dnbGUgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgY2hlY2tib3ggPSBiYXRjaFRvZ2dsZS5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignLnRvZ2dsZS1idXR0b24nKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBjaGVja2JveD8uY2hlY2tlZCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLmNsYXNzTGlzdC5jb250YWlucygnb24nKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudFN0YXRlICE9PSBlbmFibGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gY2hlY2tib3ggfHwgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignYnV0dG9uLCAudG9nZ2xlLXN3aXRjaCwgbGFiZWwnKSB8fCBiYXRjaFRvZ2dsZTtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxvZ1N0ZXAoJ1dhcm5pbmc6IEJhdGNoIHByb2Nlc3NpbmcgdG9nZ2xlIChGbGQxXzEpIG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgdGFzayBkZXNjcmlwdGlvbiBpZiBwcm92aWRlZCBhbmQgYmF0Y2ggaXMgZW5hYmxlZCAoRmxkMl8xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgdGFza0Rlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkMl8xJywgdGFza0Rlc2NyaXB0aW9uKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGJhdGNoIGdyb3VwIGlmIHByb3ZpZGVkIGFuZCBiYXRjaCBpcyBlbmFibGVkIChGbGQzXzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBiYXRjaEdyb3VwKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkM18xJywgYmF0Y2hHcm91cCk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBQcml2YXRlIGFuZCBDcml0aWNhbCBvcHRpb25zIGlmIHByb3ZpZGVkIChGbGQ0XzEgYW5kIEZsZDVfMSlcclxuICAgIGlmIChlbmFibGVkICYmIG9wdGlvbnMucHJpdmF0ZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q2hlY2tib3goJ0ZsZDRfMScsIG9wdGlvbnMucHJpdmF0ZSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChlbmFibGVkICYmIG9wdGlvbnMuY3JpdGljYWxKb2IgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGF3YWl0IHNldENoZWNrYm94KCdGbGQ1XzEnLCBvcHRpb25zLmNyaXRpY2FsSm9iKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IE1vbml0b3JpbmcgY2F0ZWdvcnkgaWYgc3BlY2lmaWVkIChGbGQ2XzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLm1vbml0b3JpbmdDYXRlZ29yeSkge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoJ0ZsZDZfMScsIG9wdGlvbnMubW9uaXRvcmluZ0NhdGVnb3J5KTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcCgnQmF0Y2ggcHJvY2Vzc2luZyBjb25maWd1cmVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVSZWN1cnJlbmNlKHN0ZXApIHtcclxuICAgIGNvbnN0IHsgcGF0dGVyblVuaXQsIHBhdHRlcm5Db3VudCwgZW5kRGF0ZU9wdGlvbiwgZW5kQWZ0ZXJDb3VudCwgZW5kQnlEYXRlLCBzdGFydERhdGUsIHN0YXJ0VGltZSwgdGltZXpvbmUgfSA9IHN0ZXA7XHJcbiAgICBcclxuICAgIGNvbnN0IHBhdHRlcm5Vbml0cyA9IFsnbWludXRlcycsICdob3VycycsICdkYXlzJywgJ3dlZWtzJywgJ21vbnRocycsICd5ZWFycyddO1xyXG4gICAgbG9nU3RlcChgQ29uZmlndXJpbmcgcmVjdXJyZW5jZTogZXZlcnkgJHtwYXR0ZXJuQ291bnR9ICR7cGF0dGVyblVuaXRzW3BhdHRlcm5Vbml0IHx8IDBdfWApO1xyXG4gICAgXHJcbiAgICAvLyBDbGljayBSZWN1cnJlbmNlIGJ1dHRvbiB0byBvcGVuIGRpYWxvZyBpZiBub3QgYWxyZWFkeSBvcGVuXHJcbiAgICBsZXQgcmVjdXJyZW5jZUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUmVjdXJyZW5jZVwiXScpO1xyXG4gICAgaWYgKCFyZWN1cnJlbmNlRm9ybSkge1xyXG4gICAgICAgIC8vIE1udUl0bV8xIGlzIHRoZSBSZWN1cnJlbmNlIGJ1dHRvbiBpbiBTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cclxuICAgICAgICBjb25zdCByZWN1cnJlbmNlQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNbnVJdG1fMVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoJ01udUl0bV8xJyk7XHJcbiAgICAgICAgaWYgKHJlY3VycmVuY2VCdXR0b24pIHtcclxuICAgICAgICAgICAgcmVjdXJyZW5jZUJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdWQUxJREFUSU9OX1dBSVQnKTtcclxuICAgICAgICAgICAgcmVjdXJyZW5jZUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUmVjdXJyZW5jZVwiXScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFyZWN1cnJlbmNlRm9ybSkge1xyXG4gICAgICAgIGxvZ1N0ZXAoJ1dhcm5pbmc6IENvdWxkIG5vdCBvcGVuIFN5c1JlY3VycmVuY2UgZGlhbG9nJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gZmluZCBlbGVtZW50IHdpdGhpbiByZWN1cnJlbmNlIGZvcm1cclxuICAgIGNvbnN0IGZpbmRJblJlY3VycmVuY2UgPSAobmFtZSkgPT4gcmVjdXJyZW5jZUZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtuYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICAvLyBTZXQgc3RhcnQgZGF0ZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHN0YXJ0RGF0ZSkge1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0RGF0ZUlucHV0ID0gZmluZEluUmVjdXJyZW5jZSgnU3RhcnREYXRlJyk/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEluUmVjdXJyZW5jZSgnU3RhcnREYXRlJyk7XHJcbiAgICAgICAgaWYgKHN0YXJ0RGF0ZUlucHV0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oc3RhcnREYXRlSW5wdXQsIHN0YXJ0RGF0ZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHN0YXJ0IHRpbWUgaWYgcHJvdmlkZWRcclxuICAgIGlmIChzdGFydFRpbWUpIHtcclxuICAgICAgICBjb25zdCBzdGFydFRpbWVJbnB1dCA9IGZpbmRJblJlY3VycmVuY2UoJ1N0YXJ0VGltZScpPy5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmRJblJlY3VycmVuY2UoJ1N0YXJ0VGltZScpO1xyXG4gICAgICAgIGlmIChzdGFydFRpbWVJbnB1dCkge1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKHN0YXJ0VGltZUlucHV0LCBzdGFydFRpbWUpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCB0aW1lem9uZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHRpbWV6b25lKSB7XHJcbiAgICAgICAgY29uc3QgdGltZXpvbmVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnVGltZXpvbmUnKTtcclxuICAgICAgICBpZiAodGltZXpvbmVDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gdGltZXpvbmVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgdGltZXpvbmUpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBwYXR0ZXJuIHVuaXQgKHJhZGlvIGJ1dHRvbnM6IE1pbnV0ZXM9MCwgSG91cnM9MSwgRGF5cz0yLCBXZWVrcz0zLCBNb250aHM9NCwgWWVhcnM9NSlcclxuICAgIGlmIChwYXR0ZXJuVW5pdCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgY29uc3QgcGF0dGVyblVuaXRDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnUGF0dGVyblVuaXQnKTtcclxuICAgICAgICBpZiAocGF0dGVyblVuaXRDb250cm9sKSB7XHJcbiAgICAgICAgICAgIC8vIFJhZGlvIGJ1dHRvbnMgYXJlIHR5cGljYWxseSByZW5kZXJlZCBhcyBhIGdyb3VwIHdpdGggbXVsdGlwbGUgb3B0aW9uc1xyXG4gICAgICAgICAgICBjb25zdCByYWRpb0lucHV0cyA9IHBhdHRlcm5Vbml0Q29udHJvbC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0nKTtcclxuICAgICAgICAgICAgaWYgKHJhZGlvSW5wdXRzLmxlbmd0aCA+IHBhdHRlcm5Vbml0KSB7XHJcbiAgICAgICAgICAgICAgICByYWRpb0lucHV0c1twYXR0ZXJuVW5pdF0uY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7IC8vIFdhaXQgZm9yIFVJIHRvIHVwZGF0ZSB3aXRoIGFwcHJvcHJpYXRlIGludGVydmFsIGZpZWxkXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUcnkgY2xpY2tpbmcgdGhlIG50aCBvcHRpb24gbGFiZWwvYnV0dG9uXHJcbiAgICAgICAgICAgICAgICBjb25zdCByYWRpb09wdGlvbnMgPSBwYXR0ZXJuVW5pdENvbnRyb2wucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyYWRpb1wiXSwgbGFiZWwsIGJ1dHRvbicpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJhZGlvT3B0aW9ucy5sZW5ndGggPiBwYXR0ZXJuVW5pdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJhZGlvT3B0aW9uc1twYXR0ZXJuVW5pdF0uY2xpY2soKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdERUZBVUxUX1dBSVRfU1RFUF9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgaW50ZXJ2YWwgY291bnQgYmFzZWQgb24gcGF0dGVybiB1bml0XHJcbiAgICAvLyBUaGUgdmlzaWJsZSBpbnB1dCBmaWVsZCBjaGFuZ2VzIGJhc2VkIG9uIHNlbGVjdGVkIHBhdHRlcm4gdW5pdFxyXG4gICAgaWYgKHBhdHRlcm5Db3VudCkge1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbE5hbWVzID0gWydNaW51dGVJbnQnLCAnSG91ckludCcsICdEYXlJbnQnLCAnV2Vla0ludCcsICdNb250aEludCcsICdZZWFySW50J107XHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sTmFtZSA9IGNvdW50Q29udHJvbE5hbWVzW3BhdHRlcm5Vbml0IHx8IDBdO1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoY291bnRDb250cm9sTmFtZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvdW50Q29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGNvdW50Q29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGNvdW50Q29udHJvbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgcGF0dGVybkNvdW50LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBlbmQgZGF0ZSBvcHRpb25zXHJcbiAgICBpZiAoZW5kRGF0ZU9wdGlvbiA9PT0gJ25vRW5kRGF0ZScpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIk5vIGVuZCBkYXRlXCIgZ3JvdXAgKEVuZERhdGUxKVxyXG4gICAgICAgIGNvbnN0IG5vRW5kRGF0ZUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTEnKTtcclxuICAgICAgICBpZiAobm9FbmREYXRlR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBub0VuZERhdGVHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBub0VuZERhdGVHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQWZ0ZXInICYmIGVuZEFmdGVyQ291bnQpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIkVuZCBhZnRlclwiIGdyb3VwIChFbmREYXRlMikgYW5kIHNldCBjb3VudFxyXG4gICAgICAgIGNvbnN0IGVuZEFmdGVyR3JvdXAgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlMicpO1xyXG4gICAgICAgIGlmIChlbmRBZnRlckdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJhZGlvID0gZW5kQWZ0ZXJHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBlbmRBZnRlckdyb3VwO1xyXG4gICAgICAgICAgICByYWRpby5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gU2V0IHRoZSBjb3VudCAoRW5kRGF0ZUludClcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlSW50Jyk7XHJcbiAgICAgICAgaWYgKGNvdW50Q29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGNvdW50Q29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGNvdW50Q29udHJvbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgZW5kQWZ0ZXJDb3VudC50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQnknICYmIGVuZEJ5RGF0ZSkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGJ5XCIgZ3JvdXAgKEVuZERhdGUzKSBhbmQgc2V0IGRhdGVcclxuICAgICAgICBjb25zdCBlbmRCeUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTMnKTtcclxuICAgICAgICBpZiAoZW5kQnlHcm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCByYWRpbyA9IGVuZEJ5R3JvdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdLCBbcm9sZT1cInJhZGlvXCJdJykgfHwgZW5kQnlHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFNldCB0aGUgZW5kIGRhdGUgKEVuZERhdGVEYXRlKVxyXG4gICAgICAgIGNvbnN0IGRhdGVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZURhdGUnKTtcclxuICAgICAgICBpZiAoZGF0ZUNvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBkYXRlQ29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGRhdGVDb250cm9sO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBlbmRCeURhdGUpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoJ1JlY3VycmVuY2UgY29uZmlndXJlZCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dEVsZW1lbnQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGlmICghaW5wdXRFbGVtZW50KSByZXR1cm47XHJcbiAgICBcclxuICAgIC8vIEZvY3VzIHRoZSBpbnB1dFxyXG4gICAgaW5wdXRFbGVtZW50LmZvY3VzKCk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdJTlBVVF9TRVRUTEVfREVMQVknKTtcclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgZXhpc3RpbmcgdmFsdWVcclxuICAgIGlucHV0RWxlbWVudC5zZWxlY3Q/LigpO1xyXG4gICAgXHJcbiAgICBpZiAoY29tYm9NZXRob2RPdmVycmlkZSAmJiBpbnB1dEVsZW1lbnQudGFnTmFtZSAhPT0gJ1NFTEVDVCcpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0RWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBLZWVwIGV4aXN0aW5nIGJlaGF2aW9yIGZvciBjYWxsZXJzIHRoYXQgZG8gbm90IHJlcXVlc3QgYW4gb3ZlcnJpZGVcclxuICAgICAgICBpbnB1dEVsZW1lbnQudmFsdWUgPSB2YWx1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZXZlbnRzXHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRGaWx0ZXJNZXRob2QoZmlsdGVyQ29udGFpbmVyLCBtZXRob2QpIHtcclxuICAgIC8vIEZpbmQgdGhlIGZpbHRlciBvcGVyYXRvciBkcm9wZG93biBuZWFyIHRoZSBmaWx0ZXIgaW5wdXRcclxuICAgIC8vIEQzNjUgdXNlcyB2YXJpb3VzIHBhdHRlcm5zIGZvciB0aGUgb3BlcmF0b3IgZHJvcGRvd25cclxuICAgIGNvbnN0IG9wZXJhdG9yUGF0dGVybnMgPSBbXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJPcGVyYXRvclwiXScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJfT3BlcmF0b3JcIl0nLFxyXG4gICAgICAgICcuZmlsdGVyLW9wZXJhdG9yJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSdcclxuICAgIF07XHJcbiAgICBcclxuICAgIGxldCBvcGVyYXRvckRyb3Bkb3duID0gbnVsbDtcclxuICAgIGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IGZpbHRlckNvbnRhaW5lcj8ucGFyZW50RWxlbWVudCB8fCBkb2N1bWVudDtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIG9wZXJhdG9yUGF0dGVybnMpIHtcclxuICAgICAgICBvcGVyYXRvckRyb3Bkb3duID0gc2VhcmNoQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IocGF0dGVybik7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yRHJvcGRvd24gJiYgb3BlcmF0b3JEcm9wZG93bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIW9wZXJhdG9yRHJvcGRvd24pIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENsaWNrIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBjb25zdCBkcm9wZG93bkJ1dHRvbiA9IG9wZXJhdG9yRHJvcGRvd24ucXVlcnlTZWxlY3RvcignYnV0dG9uLCBbcm9sZT1cImNvbWJvYm94XCJdLCAuZHluLWNvbWJvQm94LWJ1dHRvbicpIHx8IG9wZXJhdG9yRHJvcGRvd247XHJcbiAgICBkcm9wZG93bkJ1dHRvbi5jbGljaygpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgYW5kIGNsaWNrIHRoZSBtYXRjaGluZyBvcHRpb25cclxuICAgIGNvbnN0IHNlYXJjaFRlcm1zID0gZ2V0RmlsdGVyTWV0aG9kU2VhcmNoVGVybXMobWV0aG9kKTtcclxuICAgIFxyXG4gICAgLy8gTG9vayBmb3Igb3B0aW9ucyBpbiBsaXN0Ym94L2Ryb3Bkb3duXHJcbiAgICBjb25zdCBvcHRpb25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJvcHRpb25cIl0sIFtyb2xlPVwibGlzdGl0ZW1cIl0sIC5keW4tbGlzdFZpZXctaXRlbScpO1xyXG4gICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBvcHQudGV4dENvbnRlbnQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBpZiAodGV4dEluY2x1ZGVzQW55KHRleHQsIHNlYXJjaFRlcm1zKSkge1xyXG4gICAgICAgICAgICBvcHQuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSBzZWxlY3QgZWxlbWVudFxyXG4gICAgY29uc3Qgc2VsZWN0RWwgPSBvcGVyYXRvckRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgaWYgKHNlbGVjdEVsKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBvcHQgb2Ygc2VsZWN0RWwub3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gb3B0LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0SW5jbHVkZXNBbnkodGV4dCwgc2VhcmNoVGVybXMpKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxlY3RFbC52YWx1ZSA9IG9wdC52YWx1ZTtcclxuICAgICAgICAgICAgICAgIHNlbGVjdEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFJhZGlvQnV0dG9uVmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIGxvZ1N0ZXAoYFNldHRpbmcgcmFkaW8gYnV0dG9uIHZhbHVlOiAke3ZhbHVlfWApO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIGFsbCByYWRpbyBvcHRpb25zIGluIHRoaXMgZ3JvdXBcclxuICAgIGNvbnN0IHJhZGlvSW5wdXRzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0nKTtcclxuICAgIGNvbnN0IHJhZGlvUm9sZXMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicmFkaW9cIl0nKTtcclxuICAgIGNvbnN0IG9wdGlvbnMgPSByYWRpb0lucHV0cy5sZW5ndGggPiAwID8gQXJyYXkuZnJvbShyYWRpb0lucHV0cykgOiBBcnJheS5mcm9tKHJhZGlvUm9sZXMpO1xyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAvLyBUcnkgZmluZGluZyBjbGlja2FibGUgbGFiZWxzL2J1dHRvbnMgdGhhdCBhY3QgYXMgcmFkaW8gb3B0aW9uc1xyXG4gICAgICAgIGNvbnN0IGxhYmVsQnV0dG9ucyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnbGFiZWwsIGJ1dHRvbiwgW2RhdGEtZHluLXJvbGU9XCJSYWRpb0J1dHRvblwiXScpO1xyXG4gICAgICAgIG9wdGlvbnMucHVzaCguLi5BcnJheS5mcm9tKGxhYmVsQnV0dG9ucykpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIHJhZGlvIG9wdGlvbnMgZm91bmQgaW4gZWxlbWVudGApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBGb3VuZCAke29wdGlvbnMubGVuZ3RofSByYWRpbyBvcHRpb25zYCk7XHJcbiAgICBcclxuICAgIC8vIFRyeSB0byBtYXRjaCBieSBpbmRleCAoaWYgdmFsdWUgaXMgYSBudW1iZXIgb3IgbnVtZXJpYyBzdHJpbmcpXHJcbiAgICBjb25zdCBudW1WYWx1ZSA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XHJcbiAgICBpZiAoIWlzTmFOKG51bVZhbHVlKSAmJiBudW1WYWx1ZSA+PSAwICYmIG51bVZhbHVlIDwgb3B0aW9ucy5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXRPcHRpb24gPSBvcHRpb25zW251bVZhbHVlXTtcclxuICAgICAgICBsb2dTdGVwKGBDbGlja2luZyByYWRpbyBvcHRpb24gYXQgaW5kZXggJHtudW1WYWx1ZX1gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDbGljayB0aGUgcmFkaW8gb3B0aW9uIG9yIGl0cyBhc3NvY2lhdGVkIGxhYmVsXHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSB0YXJnZXRPcHRpb24udGFnTmFtZSA9PT0gJ0lOUFVUJyBcclxuICAgICAgICAgICAgPyAodGFyZ2V0T3B0aW9uLmNsb3Nlc3QoJ2xhYmVsJykgfHwgdGFyZ2V0T3B0aW9uLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJykgfHwgdGFyZ2V0T3B0aW9uKVxyXG4gICAgICAgICAgICA6IHRhcmdldE9wdGlvbjtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEaXNwYXRjaCBmdWxsIGNsaWNrIHNlcXVlbmNlXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJ1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIHRyeSBjbGlja2luZyB0aGUgaW5wdXQgZGlyZWN0bHlcclxuICAgICAgICBpZiAodGFyZ2V0T3B0aW9uLnRhZ05hbWUgPT09ICdJTlBVVCcpIHtcclxuICAgICAgICAgICAgdGFyZ2V0T3B0aW9uLmNoZWNrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB0YXJnZXRPcHRpb24uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gbWF0Y2ggYnkgbGFiZWwgdGV4dFxyXG4gICAgY29uc3Qgc2VhcmNoVmFsdWUgPSBTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgbGFiZWwgPSBvcHRpb24uY2xvc2VzdCgnbGFiZWwnKSB8fCBvcHRpb24ucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcignbGFiZWwnKTtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkudG9Mb3dlckNhc2UoKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICBvcHRpb24uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LnRvTG93ZXJDYXNlKCkgfHxcclxuICAgICAgICAgICAgICAgICAgICBvcHRpb24udGV4dENvbnRlbnQ/LnRyaW0oKS50b0xvd2VyQ2FzZSgpIHx8ICcnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0ZXh0LmluY2x1ZGVzKHNlYXJjaFZhbHVlKSB8fCBzZWFyY2hWYWx1ZS5pbmNsdWRlcyh0ZXh0KSkge1xyXG4gICAgICAgICAgICBsb2dTdGVwKGBDbGlja2luZyByYWRpbyBvcHRpb24gd2l0aCB0ZXh0OiAke3RleHR9YCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gbGFiZWwgfHwgb3B0aW9uO1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG9wdGlvbi50YWdOYW1lID09PSAnSU5QVVQnKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb24uY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBvcHRpb24uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcihgUmFkaW8gb3B0aW9uIG5vdCBmb3VuZCBmb3IgdmFsdWU6ICR7dmFsdWV9YCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRTZWdtZW50ZWRFbnRyeVZhbHVlKGVsZW1lbnQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBTZWdtZW50ZWRFbnRyeScpO1xyXG5cclxuICAgIC8vIEZpbmQgdGhlIGxvb2t1cCBidXR0b25cclxuICAgIGNvbnN0IGxvb2t1cEJ1dHRvbiA9IGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGxvb2t1cCBidXR0b24sIHRyeSBrZXlib2FyZCB0byBvcGVuIHRoZSBmbHlvdXQgZmlyc3RcclxuICAgIGlmICghbG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENsaWNrIHRoZSBsb29rdXAgYnV0dG9uIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBpZiAobG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgbG9va3VwQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQ0xJQ0tfQU5JTUFUSU9OX0RFTEFZJyk7IC8vIFdhaXQgZm9yIGxvb2t1cCB0byBsb2FkXHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCB0aGUgbG9va3VwIHBvcHVwL2ZseW91dFxyXG4gICAgY29uc3QgbG9va3VwUG9wdXAgPSBhd2FpdCB3YWl0Rm9yTG9va3VwUG9wdXAoKTtcclxuICAgIGlmICghbG9va3VwUG9wdXApIHtcclxuICAgICAgICBpZiAoIXdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3M/LnN1cHByZXNzTG9va3VwV2FybmluZ3MpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdMb29rdXAgcG9wdXAgbm90IGZvdW5kLCB0cnlpbmcgZGlyZWN0IGlucHV0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgYSBkb2NrZWQgbG9va3VwIGZseW91dCBleGlzdHMgKHNlZ21lbnRlZCBlbnRyeSksIHR5cGUgaW50byBpdHMgZmlsdGVyIGlucHV0XHJcbiAgICBjb25zdCBkb2NrID0gYXdhaXQgd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KGVsZW1lbnQsIDE1MDApO1xyXG4gICAgaWYgKGRvY2spIHtcclxuICAgICAgICBjb25zdCBkb2NrSW5wdXQgPSBmaW5kTG9va3VwRmlsdGVySW5wdXQoZG9jayk7XHJcbiAgICAgICAgaWYgKGRvY2tJbnB1dCkge1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnUVVJQ0tfUkVUUllfREVMQVknKTtcclxuICAgICAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChkb2NrSW5wdXQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlKTtcclxuICAgICAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQ0xJQ0tfQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFR5cGUgdmFsdWUgaW4gdGhlIHNlYXJjaC9maWx0ZXIgZmllbGQgb2YgdGhlIGxvb2t1cFxyXG4gICAgY29uc3QgbG9va3VwSW5wdXQgPSBsb29rdXBQb3B1cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwidGV4dFwiXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmIChsb29rdXBJbnB1dCkge1xyXG4gICAgICAgIGxvb2t1cElucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1FVSUNLX1JFVFJZX0RFTEFZJyk7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChsb29rdXBJbnB1dCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgIGxvb2t1cElucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVkFMSURBVElPTl9XQUlUJyk7IC8vIFdhaXQgZm9yIHNlcnZlciBmaWx0ZXJcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBhbmQgY2xpY2sgdGhlIG1hdGNoaW5nIHJvd1xyXG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cFBvcHVwLCBlbGVtZW50LCA1MDAwKTtcclxuICAgIGxldCBmb3VuZE1hdGNoID0gZmFsc2U7XHJcbiAgICBcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm93LnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XHJcbiAgICAgICAgaWYgKHRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSByb3cucXVlcnlTZWxlY3RvcignW3JvbGU9XCJncmlkY2VsbFwiXSwgdGQnKTtcclxuICAgICAgICAgICAgKGNlbGwgfHwgcm93KS5jbGljaygpO1xyXG4gICAgICAgICAgICBmb3VuZE1hdGNoID0gdHJ1ZTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFmb3VuZE1hdGNoKSB7XHJcbiAgICAgICAgY29uc3Qgc2FtcGxlID0gQXJyYXkuZnJvbShyb3dzKS5zbGljZSgwLCA4KS5tYXAociA9PiByLnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykpO1xyXG4gICAgICAgIGlmICghd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uc3VwcHJlc3NMb29rdXBXYXJuaW5ncykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ05vIG1hdGNoaW5nIGxvb2t1cCB2YWx1ZSBmb3VuZCwgY2xvc2luZyBwb3B1cCcsIHsgdmFsdWUsIHNhbXBsZSB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gVHJ5IHRvIGNsb3NlIHRoZSBwb3B1cFxyXG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gbG9va3VwUG9wdXAucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiQ2xvc2VcIl0sIC5jbG9zZS1idXR0b24nKTtcclxuICAgICAgICBpZiAoY2xvc2VCdG4pIGNsb3NlQnRuLmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gZGlyZWN0IHR5cGluZ1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUgPSAnJykge1xyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0sIHNlbGVjdCcpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gQ29tYm9Cb3gnKTtcclxuXHJcbiAgICAvLyBJZiBpdCdzIGEgbmF0aXZlIHNlbGVjdCwgdXNlIG9wdGlvbiBzZWxlY3Rpb25cclxuICAgIGlmIChpbnB1dC50YWdOYW1lID09PSAnU0VMRUNUJykge1xyXG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBBcnJheS5mcm9tKGlucHV0Lm9wdGlvbnMpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IG9wdGlvbnMuZmluZChvcHQgPT4gb3B0LnRleHQudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKSkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLmZpbmQob3B0ID0+IG9wdC50ZXh0LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpKSk7XHJcbiAgICAgICAgaWYgKCF0YXJnZXQpIHRocm93IG5ldyBFcnJvcihgT3B0aW9uIG5vdCBmb3VuZDogJHt2YWx1ZX1gKTtcclxuICAgICAgICBpbnB1dC52YWx1ZSA9IHRhcmdldC52YWx1ZTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9wZW4gdGhlIGRyb3Bkb3duIChidXR0b24gcHJlZmVycmVkKVxyXG4gICAgY29uc3QgY29tYm9CdXR0b24gPSBmaW5kQ29tYm9Cb3hCdXR0b24oZWxlbWVudCk7XHJcbiAgICBpZiAoY29tYm9CdXR0b24pIHtcclxuICAgICAgICBjb21ib0J1dHRvbi5jbGljaygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBpbnB1dC5jbGljaz8uKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcblxyXG4gICAgLy8gVHJ5IHR5cGluZyB0byBmaWx0ZXIgd2hlbiBhbGxvd2VkICh1c2Ugc2VsZWN0ZWQgaW5wdXQgbWV0aG9kKVxyXG4gICAgaWYgKCFpbnB1dC5yZWFkT25seSAmJiAhaW5wdXQuZGlzYWJsZWQpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBsaXN0Ym94IG5lYXIgdGhlIGZpZWxkIG9yIGxpbmtlZCB2aWEgYXJpYS1jb250cm9sc1xyXG4gICAgY29uc3QgbGlzdGJveCA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsaXN0Ym94KSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IHByZXNzIEVudGVyIHRvIGNvbW1pdCB0eXBlZCB2YWx1ZVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG9wdGlvbnMgPSBjb2xsZWN0Q29tYm9PcHRpb25zKGxpc3Rib3gpO1xyXG4gICAgY29uc3Qgc2VhcmNoID0gbm9ybWFsaXplVGV4dCh2YWx1ZSk7XHJcbiAgICBsZXQgbWF0Y2hlZCA9IGZhbHNlO1xyXG4gICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KG9wdGlvbi50ZXh0Q29udGVudCk7XHJcbiAgICAgICAgaWYgKHRleHQgPT09IHNlYXJjaCB8fCB0ZXh0LmluY2x1ZGVzKHNlYXJjaCkpIHtcclxuICAgICAgICAgICAgLy8gVHJ5IHRvIG1hcmsgc2VsZWN0aW9uIGZvciBBUklBLWJhc2VkIGNvbWJvYm94ZXNcclxuICAgICAgICAgICAgb3B0aW9ucy5mb3JFYWNoKG9wdCA9PiBvcHQuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ2ZhbHNlJykpO1xyXG4gICAgICAgICAgICBvcHRpb24uc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ3RydWUnKTtcclxuICAgICAgICAgICAgaWYgKCFvcHRpb24uaWQpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5pZCA9IGBkMzY1b3B0XyR7RGF0ZS5ub3coKX1fJHtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMCl9YDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcsIG9wdGlvbi5pZCk7XHJcblxyXG4gICAgICAgICAgICBvcHRpb24uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnIH0pO1xyXG4gICAgICAgICAgICBjb25zdCBvcHRpb25UZXh0ID0gb3B0aW9uLnRleHRDb250ZW50LnRyaW0oKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENsaWNrIHRoZSBvcHRpb24gdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZShvcHRpb24pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCA4MDApO1xyXG4gICAgICAgICAgICBpZiAoIWFwcGxpZWQpIHtcclxuICAgICAgICAgICAgICAgIC8vIFNvbWUgRDM2NSBjb21ib3MgY29tbWl0IG9uIGtleSBzZWxlY3Rpb24gcmF0aGVyIHRoYW4gY2xpY2tcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdBcnJvd0Rvd24nLCBjb2RlOiAnQXJyb3dEb3duJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEZvcmNlIGlucHV0IHZhbHVlIHVwZGF0ZSBmb3IgRDM2NSBjb21ib2JveGVzXHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1BPU1RfSU5QVVRfREVMQVknKTtcclxuICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZVRleHQoaW5wdXQudmFsdWUpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvblRleHQpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21taXRDb21ib1ZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIGlucHV0LnZhbHVlLCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFtYXRjaGVkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcHRpb24gbm90IGZvdW5kOiAke3ZhbHVlfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0Q2hlY2tib3goY29udHJvbE5hbWUsIGNoZWNrZWQpIHtcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICBpZiAoIWNvbnRhaW5lcikge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6IENoZWNrYm94ICR7Y29udHJvbE5hbWV9IG5vdCBmb3VuZGApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgY2hlY2tib3ggPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXIucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXScpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBjaGVja2JveD8uY2hlY2tlZCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpO1xyXG4gICAgXHJcbiAgICBpZiAoY3VycmVudFN0YXRlICE9PSBjaGVja2VkKSB7XHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSBjaGVja2JveCB8fCBjb250YWluZXIucXVlcnlTZWxlY3RvcignbGFiZWwsIGJ1dHRvbicpIHx8IGNvbnRhaW5lcjtcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgfVxyXG59XHJcbiIsICJpbXBvcnQgRDM2NUluc3BlY3RvciBmcm9tICcuL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzJztcclxuaW1wb3J0IHsgbG9nU3RlcCwgc2VuZExvZyB9IGZyb20gJy4vdXRpbHMvbG9nZ2luZy5qcyc7XHJcbmltcG9ydCB7IHNsZWVwIH0gZnJvbSAnLi91dGlscy9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGNvZXJjZUJvb2xlYW4sIG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuL3V0aWxzL3RleHQuanMnO1xyXG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuL3J1bnRpbWUvZXJyb3JzLmpzJztcclxuaW1wb3J0IHsgZ2V0U3RlcEVycm9yQ29uZmlnLCBmaW5kTG9vcFBhaXJzLCBmaW5kSWZQYWlycyB9IGZyb20gJy4vcnVudGltZS9lbmdpbmUtdXRpbHMuanMnO1xyXG5pbXBvcnQgeyBldmFsdWF0ZUNvbmRpdGlvbiB9IGZyb20gJy4vcnVudGltZS9jb25kaXRpb25zLmpzJztcclxuaW1wb3J0IHsgZ2V0V29ya2Zsb3dUaW1pbmdzIH0gZnJvbSAnLi9ydW50aW1lL3RpbWluZy5qcyc7XHJcbmltcG9ydCB7IGNsaWNrRWxlbWVudCwgYXBwbHlHcmlkRmlsdGVyLCB3YWl0VW50aWxDb25kaXRpb24sIHNldElucHV0VmFsdWUsIHNldEdyaWRDZWxsVmFsdWUsIHNldExvb2t1cFNlbGVjdFZhbHVlLCBzZXRDaGVja2JveFZhbHVlLCBuYXZpZ2F0ZVRvRm9ybSwgYWN0aXZhdGVUYWIsIGFjdGl2YXRlQWN0aW9uUGFuZVRhYiwgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24sIGNvbmZpZ3VyZVF1ZXJ5RmlsdGVyLCBjb25maWd1cmVCYXRjaFByb2Nlc3NpbmcsIGNsb3NlRGlhbG9nLCBjb25maWd1cmVSZWN1cnJlbmNlIH0gZnJvbSAnLi9zdGVwcy9hY3Rpb25zLmpzJztcclxuaW1wb3J0IHsgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsIGlzRWxlbWVudFZpc2libGUsIGlzRDM2NUxvYWRpbmcsIGluc3BlY3RHcmlkU3RhdGUgfSBmcm9tICcuL3V0aWxzL2RvbS5qcyc7XHJcblxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0SW5qZWN0ZWQoeyB3aW5kb3dPYmogPSBnbG9iYWxUaGlzLndpbmRvdywgZG9jdW1lbnRPYmogPSBnbG9iYWxUaGlzLmRvY3VtZW50LCBpbnNwZWN0b3JGYWN0b3J5ID0gKCkgPT4gbmV3IEQzNjVJbnNwZWN0b3IoKSB9ID0ge30pIHtcclxuICAgIGlmICghd2luZG93T2JqIHx8ICFkb2N1bWVudE9iaikge1xyXG4gICAgICAgIHJldHVybiB7IHN0YXJ0ZWQ6IGZhbHNlLCByZWFzb246ICdtaXNzaW5nLXdpbmRvdy1vci1kb2N1bWVudCcgfTtcclxuICAgIH1cclxuICAgIGNvbnN0IHdpbmRvdyA9IHdpbmRvd09iajtcclxuICAgIGNvbnN0IGRvY3VtZW50ID0gZG9jdW1lbnRPYmo7XHJcbiAgICBjb25zdCBuYXZpZ2F0b3IgPSB3aW5kb3dPYmoubmF2aWdhdG9yIHx8IGdsb2JhbFRoaXMubmF2aWdhdG9yO1xyXG5cclxuICAgIHdpbmRvdy5EMzY1SW5zcGVjdG9yID0gRDM2NUluc3BlY3RvcjtcclxuXHJcbiAgICAvLyA9PT09PT0gSW5pdGlhbGl6ZSBhbmQgTGlzdGVuIGZvciBNZXNzYWdlcyA9PT09PT1cclxuXHJcbiAgICAvLyBQcmV2ZW50IGR1cGxpY2F0ZSBpbml0aWFsaXphdGlvblxyXG4gICAgaWYgKHdpbmRvdy5kMzY1SW5qZWN0ZWRTY3JpcHRMb2FkZWQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnRDM2NSBpbmplY3RlZCBzY3JpcHQgYWxyZWFkeSBsb2FkZWQsIHNraXBwaW5nLi4uJyk7XHJcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ2FscmVhZHktbG9hZGVkJyB9O1xyXG4gICAgfVxyXG5cclxuICAgIHdpbmRvdy5kMzY1SW5qZWN0ZWRTY3JpcHRMb2FkZWQgPSB0cnVlO1xyXG5cclxuICAgIC8vIENyZWF0ZSBpbnNwZWN0b3IgaW5zdGFuY2VcclxuICAgIGNvbnN0IGluc3BlY3RvciA9IGluc3BlY3RvckZhY3RvcnkoKTtcclxuXHJcbiAgICAvLyA9PT09PT0gV29ya2Zsb3cgRXhlY3V0aW9uIEVuZ2luZSA9PT09PT1cclxuICAgIGxldCBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IHt9O1xyXG4gICAgd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzO1xyXG4gICAgY29uc3QgZ2V0VGltaW5ncyA9ICgpID0+IGdldFdvcmtmbG93VGltaW5ncyhjdXJyZW50V29ya2Zsb3dTZXR0aW5ncyk7XHJcbiAgICBjb25zdCB3YWl0Rm9yVGltaW5nID0gYXN5bmMgKGtleSkgPT4ge1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKGdldFRpbWluZ3MoKVtrZXldKTtcclxuICAgIH07XHJcbiAgICBsZXQgY3VycmVudFdvcmtmbG93ID0gbnVsbDtcclxuICAgIGxldCBleGVjdXRpb25Db250cm9sID0ge1xyXG4gICAgICAgIGlzUGF1c2VkOiBmYWxzZSxcclxuICAgICAgICBpc1N0b3BwZWQ6IGZhbHNlLFxyXG4gICAgICAgIGN1cnJlbnRTdGVwSW5kZXg6IDAsXHJcbiAgICAgICAgY3VycmVudFJvd0luZGV4OiAwLFxyXG4gICAgICAgIHRvdGFsUm93czogMCxcclxuICAgICAgICBwcm9jZXNzZWRSb3dzOiAwLFxyXG4gICAgICAgIGN1cnJlbnREYXRhUm93OiBudWxsLFxyXG4gICAgICAgIHBlbmRpbmdGbG93U2lnbmFsOiAnbm9uZScsXHJcbiAgICAgICAgcGVuZGluZ0ludGVycnVwdGlvbkRlY2lzaW9uOiBudWxsLFxyXG4gICAgICAgIHJ1bk9wdGlvbnM6IHtcclxuICAgICAgICAgICAgc2tpcFJvd3M6IDAsXHJcbiAgICAgICAgICAgIGxpbWl0Um93czogMCxcclxuICAgICAgICAgICAgZHJ5UnVuOiBmYWxzZSxcclxuICAgICAgICAgICAgbGVhcm5pbmdNb2RlOiBmYWxzZSxcclxuICAgICAgICAgICAgcnVuVW50aWxJbnRlcmNlcHRpb246IGZhbHNlXHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBTaW5nbGUgdW5pZmllZCBtZXNzYWdlIGxpc3RlbmVyXHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xyXG4gICAgICAgIGlmIChldmVudC5zb3VyY2UgIT09IHdpbmRvdykgcmV0dXJuO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc2NvdmVyeSByZXF1ZXN0c1xyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X0RJU0NPVkVSX0VMRU1FTlRTJykge1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVGb3JtT25seSA9IGV2ZW50LmRhdGEuYWN0aXZlRm9ybU9ubHkgfHwgZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gaW5zcGVjdG9yLmRpc2NvdmVyRWxlbWVudHMoYWN0aXZlRm9ybU9ubHkpO1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVGb3JtID0gaW5zcGVjdG9yLmdldEFjdGl2ZUZvcm1OYW1lKCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9FTEVNRU5UU19ESVNDT1ZFUkVEJyxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnRzOiBlbGVtZW50cy5tYXAoZWwgPT4gKHtcclxuICAgICAgICAgICAgICAgICAgICAuLi5lbCxcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB1bmRlZmluZWQgLy8gUmVtb3ZlIERPTSByZWZlcmVuY2UgZm9yIHNlcmlhbGl6YXRpb25cclxuICAgICAgICAgICAgICAgIH0pKSxcclxuICAgICAgICAgICAgICAgIGFjdGl2ZUZvcm06IGFjdGl2ZUZvcm1cclxuICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUQVJUX1BJQ0tFUicpIHtcclxuICAgICAgICAgICAgaW5zcGVjdG9yLnN0YXJ0RWxlbWVudFBpY2tlcigoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgLy8gQWRkIGZvcm0gbmFtZSB0byBwaWNrZWQgZWxlbWVudFxyXG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBpbnNwZWN0b3IuZ2V0RWxlbWVudEZvcm1OYW1lKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7ZWxlbWVudC5jb250cm9sTmFtZX1cIl1gKSk7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X0VMRU1FTlRfUElDS0VEJyxcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB7IC4uLmVsZW1lbnQsIGZvcm1OYW1lIH1cclxuICAgICAgICAgICAgICAgIH0sICcqJyk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RPUF9QSUNLRVInKSB7XHJcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWRtaW4gaW5zcGVjdGlvbiB0b29scyAtIHJ1biBkaXNjb3ZlcnkgZnVuY3Rpb25zIGFuZCByZXR1cm4gcmVzdWx0c1xyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X0FETUlOX0lOU1BFQ1QnKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGluc3BlY3Rpb25UeXBlID0gZXZlbnQuZGF0YS5pbnNwZWN0aW9uVHlwZTtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBldmVudC5kYXRhLmZvcm1OYW1lO1xyXG4gICAgICAgICAgICBsZXQgcmVzdWx0O1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IHJ1bkFkbWluSW5zcGVjdGlvbihpbnNwZWN0b3IsIGluc3BlY3Rpb25UeXBlLCBmb3JtTmFtZSwgZG9jdW1lbnQsIHdpbmRvdyk7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB7IHN1Y2Nlc3M6IHRydWUsIGluc3BlY3Rpb25UeXBlLCBkYXRhIH07XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHsgc3VjY2VzczogZmFsc2UsIGluc3BlY3Rpb25UeXBlLCBlcnJvcjogZS5tZXNzYWdlIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfQURNSU5fSU5TUEVDVElPTl9SRVNVTFQnLCByZXN1bHQgfSwgJyonKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X0VYRUNVVEVfV09SS0ZMT1cnKSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGVXb3JrZmxvdyhldmVudC5kYXRhLndvcmtmbG93LCBldmVudC5kYXRhLmRhdGEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfTkFWX0JVVFRPTlNfVVBEQVRFJykge1xyXG4gICAgICAgICAgICB1cGRhdGVOYXZCdXR0b25zKGV2ZW50LmRhdGEucGF5bG9hZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEV4ZWN1dGlvbiBjb250cm9sc1xyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1BBVVNFX1dPUktGTE9XJykge1xyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfUkVTVU1FX1dPUktGTE9XJykge1xyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUT1BfV09SS0ZMT1cnKSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9BUFBMWV9JTlRFUlJVUFRJT05fREVDSVNJT04nKSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0ludGVycnVwdGlvbkRlY2lzaW9uID0gZXZlbnQuZGF0YS5wYXlsb2FkIHx8IG51bGw7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBsZXQgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gbnVsbDtcclxuICAgIGxldCBuYXZCdXR0b25zUmV0cnlUaW1lciA9IG51bGw7XHJcbiAgICBsZXQgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIgPSBudWxsO1xyXG5cclxuICAgIGZ1bmN0aW9uIHVwZGF0ZU5hdkJ1dHRvbnMocGF5bG9hZCkge1xyXG4gICAgICAgIHBlbmRpbmdOYXZCdXR0b25zUGF5bG9hZCA9IHBheWxvYWQgfHwgbnVsbDtcclxuICAgICAgICByZW5kZXJOYXZCdXR0b25zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVuZGVyTmF2QnV0dG9ucygpIHtcclxuICAgICAgICBjb25zdCBwYXlsb2FkID0gcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkO1xyXG4gICAgICAgIGlmICghcGF5bG9hZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBuYXZHcm91cCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduYXZpZ2F0aW9uTWFpbkFjdGlvbkdyb3VwJyk7XHJcbiAgICAgICAgaWYgKCFuYXZHcm91cCkge1xyXG4gICAgICAgICAgICBpZiAoIW5hdkJ1dHRvbnNSZXRyeVRpbWVyKSB7XHJcbiAgICAgICAgICAgICAgICBuYXZCdXR0b25zUmV0cnlUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIG5hdkJ1dHRvbnNSZXRyeVRpbWVyID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICByZW5kZXJOYXZCdXR0b25zKCk7XHJcbiAgICAgICAgICAgICAgICB9LCAxMDAwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBleGlzdGluZ0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkMzY1LW5hdi1idXR0b25zLWNvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChleGlzdGluZ0NvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBleGlzdGluZ0NvbnRhaW5lci5yZW1vdmUoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvbnMgPSBBcnJheS5pc0FycmF5KHBheWxvYWQuYnV0dG9ucykgPyBwYXlsb2FkLmJ1dHRvbnMgOiBbXTtcclxuICAgICAgICBpZiAoIWJ1dHRvbnMubGVuZ3RoKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRNZW51SXRlbSA9IChwYXlsb2FkLm1lbnVJdGVtIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgICAgICBjb25zdCB2aXNpYmxlQnV0dG9ucyA9IGJ1dHRvbnMuZmlsdGVyKChidXR0b24pID0+IHtcclxuICAgICAgICAgICAgY29uc3QgbWVudUl0ZW1zID0gQXJyYXkuaXNBcnJheShidXR0b24ubWVudUl0ZW1zKSA/IGJ1dHRvbi5tZW51SXRlbXMgOiBbXTtcclxuICAgICAgICAgICAgaWYgKCFtZW51SXRlbXMubGVuZ3RoKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgaWYgKCFjdXJyZW50TWVudUl0ZW0pIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgcmV0dXJuIG1lbnVJdGVtcy5zb21lKChpdGVtKSA9PiAoaXRlbSB8fCAnJykudG9Mb3dlckNhc2UoKSA9PT0gY3VycmVudE1lbnVJdGVtKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKCF2aXNpYmxlQnV0dG9ucy5sZW5ndGgpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgY29udGFpbmVyLmlkID0gJ2QzNjUtbmF2LWJ1dHRvbnMtY29udGFpbmVyJztcclxuICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcclxuICAgICAgICBjb250YWluZXIuc3R5bGUuZ2FwID0gJzZweCc7XHJcbiAgICAgICAgY29udGFpbmVyLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcclxuICAgICAgICBjb250YWluZXIuc3R5bGUubWFyZ2luUmlnaHQgPSAnNnB4JztcclxuXHJcbiAgICAgICAgY29uc3QgcnVuQnV0dG9uV29ya2Zsb3cgPSBhc3luYyAoYnV0dG9uQ29uZmlnKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHdvcmtmbG93ID0gYnV0dG9uQ29uZmlnLndvcmtmbG93O1xyXG4gICAgICAgICAgICBpZiAoIXdvcmtmbG93KSB7XHJcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBXb3JrZmxvdyBub3QgZm91bmQgZm9yIG5hdiBidXR0b246ICR7YnV0dG9uQ29uZmlnLm5hbWUgfHwgYnV0dG9uQ29uZmlnLmlkfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB3b3JrZmxvdy5kYXRhU291cmNlcz8ucHJpbWFyeT8uZGF0YSB8fCB3b3JrZmxvdy5kYXRhU291cmNlPy5kYXRhIHx8IFtdO1xyXG4gICAgICAgICAgICBleGVjdXRlV29ya2Zsb3cod29ya2Zsb3csIGRhdGEpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IGNyZWF0ZVN0eWxlZEJ1dHRvbiA9IChsYWJlbCwgdGl0bGUgPSAnJykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBidXR0b25FbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xyXG4gICAgICAgICAgICBidXR0b25FbC50eXBlID0gJ2J1dHRvbic7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLXNlYXJjaCc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnRleHRDb250ZW50ID0gbGFiZWw7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnRpdGxlID0gdGl0bGU7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmhlaWdodCA9ICcyNHB4JztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUucGFkZGluZyA9ICcwIDhweCc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc0cHgnO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4zNSknO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5iYWNrZ3JvdW5kID0gJ3JnYmEoMjU1LDI1NSwyNTUsMC4xMiknO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5jb2xvciA9ICcjZmZmZmZmJztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmZvbnRXZWlnaHQgPSAnNjAwJztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUubGluZUhlaWdodCA9ICcyMnB4JztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS53aGl0ZVNwYWNlID0gJ25vd3JhcCc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2NlbnRlcic7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmJveFNoYWRvdyA9ICdpbnNldCAwIDAgMCAxcHggcmdiYSgyNTUsMjU1LDI1NSwwLjA4KSc7XHJcbiAgICAgICAgICAgIHJldHVybiBidXR0b25FbDtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBjbG9zZUFsbEdyb3VwTWVudXMgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1kMzY1LW5hdi1ncm91cC1tZW51XScpLmZvckVhY2goKG1lbnUpID0+IHtcclxuICAgICAgICAgICAgICAgIG1lbnUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3Qgc3RhbmRhbG9uZUJ1dHRvbnMgPSBbXTtcclxuICAgICAgICBjb25zdCBncm91cGVkQnV0dG9ucyA9IG5ldyBNYXAoKTtcclxuXHJcbiAgICAgICAgdmlzaWJsZUJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwTmFtZSA9IChidXR0b25Db25maWcuZ3JvdXAgfHwgJycpLnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKCFncm91cE5hbWUpIHtcclxuICAgICAgICAgICAgICAgIHN0YW5kYWxvbmVCdXR0b25zLnB1c2goYnV0dG9uQ29uZmlnKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoIWdyb3VwZWRCdXR0b25zLmhhcyhncm91cE5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICBncm91cGVkQnV0dG9ucy5zZXQoZ3JvdXBOYW1lLCBbXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuZ2V0KGdyb3VwTmFtZSkucHVzaChidXR0b25Db25maWcpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBzdGFuZGFsb25lQnV0dG9ucy5mb3JFYWNoKChidXR0b25Db25maWcpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYnV0dG9uV3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBidXR0b25XcmFwcGVyLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLWNvbXBhbnkgbmF2aWdhdGlvbkJhci1waW5uZWRFbGVtZW50JztcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbkVsID0gY3JlYXRlU3R5bGVkQnV0dG9uKGJ1dHRvbkNvbmZpZy5uYW1lIHx8IGJ1dHRvbkNvbmZpZy53b3JrZmxvd05hbWUgfHwgJ1dvcmtmbG93JywgYnV0dG9uQ29uZmlnLm5hbWUgfHwgJycpO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zZXRBdHRyaWJ1dGUoJ2RhdGEtZDM2NS1uYXYtYnV0dG9uLWlkJywgYnV0dG9uQ29uZmlnLmlkIHx8ICcnKTtcclxuICAgICAgICAgICAgYnV0dG9uRWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpKTtcclxuXHJcbiAgICAgICAgICAgIGJ1dHRvbldyYXBwZXIuYXBwZW5kQ2hpbGQoYnV0dG9uRWwpO1xyXG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoYnV0dG9uV3JhcHBlcik7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIEFycmF5LmZyb20oZ3JvdXBlZEJ1dHRvbnMuZW50cmllcygpKVxyXG4gICAgICAgICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSlcclxuICAgICAgICAgICAgLmZvckVhY2goKFtncm91cE5hbWUsIGdyb3VwSXRlbXNdKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cFdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5jbGFzc05hbWUgPSAnbmF2aWdhdGlvbkJhci1jb21wYW55IG5hdmlnYXRpb25CYXItcGlubmVkRWxlbWVudCc7XHJcbiAgICAgICAgICAgICAgICBncm91cFdyYXBwZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwQnV0dG9uID0gY3JlYXRlU3R5bGVkQnV0dG9uKGAke2dyb3VwTmFtZX0gXFx1MjVCRWAsIGdyb3VwTmFtZSk7XHJcbiAgICAgICAgICAgICAgICBncm91cEJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtZDM2NS1uYXYtZ3JvdXAnLCBncm91cE5hbWUpO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYm9yZGVyQ29sb3IgPSAncmdiYSgyNTUsMjU1LDI1NSwwLjU1KSc7XHJcbiAgICAgICAgICAgICAgICBncm91cEJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3JnYmEoMjU1LDI1NSwyNTUsMC4yKSc7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBNZW51ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc2V0QXR0cmlidXRlKCdkYXRhLWQzNjUtbmF2LWdyb3VwLW1lbnUnLCBncm91cE5hbWUpO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS50b3AgPSAnMjhweCc7XHJcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUubGVmdCA9ICcwJztcclxuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5taW5XaWR0aCA9ICcyMzBweCc7XHJcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUubWF4V2lkdGggPSAnMzIwcHgnO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLm1heEhlaWdodCA9ICczMjBweCc7XHJcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUub3ZlcmZsb3dZID0gJ2F1dG8nO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJhY2tncm91bmQgPSAnI2ZjZmRmZic7XHJcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCByZ2JhKDMwLDQxLDU5LDAuMTYpJztcclxuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnMTBweCc7XHJcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuYm94U2hhZG93ID0gJzAgMTRweCAyOHB4IHJnYmEoMCwwLDAsMC4yOCknO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLnBhZGRpbmcgPSAnOHB4JztcclxuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLnpJbmRleCA9ICcyMTQ3NDgzMDAwJztcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIudGV4dENvbnRlbnQgPSBncm91cE5hbWU7XHJcbiAgICAgICAgICAgICAgICBncm91cEhlYWRlci5zdHlsZS5mb250U2l6ZSA9ICcxMXB4JztcclxuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmZvbnRXZWlnaHQgPSAnNzAwJztcclxuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmNvbG9yID0gJyM0NzU1NjknO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUubWFyZ2luID0gJzAgMnB4IDZweCAycHgnO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUucGFkZGluZ0JvdHRvbSA9ICc2cHgnO1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCAjZTJlOGYwJztcclxuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5hcHBlbmRDaGlsZChncm91cEhlYWRlcik7XHJcblxyXG4gICAgICAgICAgICAgICAgZ3JvdXBJdGVtc1xyXG4gICAgICAgICAgICAgICAgICAgIC5zbGljZSgpXHJcbiAgICAgICAgICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IChhLm5hbWUgfHwgJycpLmxvY2FsZUNvbXBhcmUoYi5uYW1lIHx8ICcnKSlcclxuICAgICAgICAgICAgICAgICAgICAuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW1CdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24udGV4dENvbnRlbnQgPSBidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdyc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24udGl0bGUgPSBidXR0b25Db25maWcubmFtZSB8fCAnJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS53aWR0aCA9ICcxMDAlJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYm9yZGVyID0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZjI5MzcnO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc0cHgnO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLnBhZGRpbmcgPSAnOHB4IDlweCc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuZm9udFdlaWdodCA9ICc2MDAnO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmxpbmVIZWlnaHQgPSAnMS4zJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnM3B4JztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudHJhbnNpdGlvbiA9ICdiYWNrZ3JvdW5kIC4xNXMgZWFzZSwgY29sb3IgLjE1cyBlYXNlJztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICcjZThlZGZmJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuY29sb3IgPSAnIzFlM2E4YSc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jb2xvciA9ICcjMWYyOTM3JztcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsb3NlQWxsR3JvdXBNZW51cygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcnVuQnV0dG9uV29ya2Zsb3coYnV0dG9uQ29uZmlnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncm91cE1lbnUuYXBwZW5kQ2hpbGQoaXRlbUJ1dHRvbik7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc09wZW4gPSBncm91cE1lbnUuc3R5bGUuZGlzcGxheSA9PT0gJ2Jsb2NrJztcclxuICAgICAgICAgICAgICAgICAgICBjbG9zZUFsbEdyb3VwTWVudXMoKTtcclxuICAgICAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuZGlzcGxheSA9IGlzT3BlbiA/ICdub25lJyA6ICdibG9jayc7XHJcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9IGlzT3BlbiA/ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMiknIDogJ3JnYmEoMjU1LDI1NSwyNTUsMC4zMiknO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZ3JvdXBXcmFwcGVyLmFwcGVuZENoaWxkKGdyb3VwQnV0dG9uKTtcclxuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5hcHBlbmRDaGlsZChncm91cE1lbnUpO1xyXG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwV3JhcHBlcik7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICBuYXZHcm91cC5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBuYXZHcm91cC5maXJzdENoaWxkKTtcclxuXHJcbiAgICAgICAgaWYgKG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyKSB7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBuYXZCdXR0b25zT3V0c2lkZUNsaWNrSGFuZGxlciA9IChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInKTtcclxuICAgICAgICAgICAgaWYgKCFhY3RpdmUgfHwgYWN0aXZlLmNvbnRhaW5zKGV2ZW50LnRhcmdldCkpIHJldHVybjtcclxuICAgICAgICAgICAgYWN0aXZlLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWQzNjUtbmF2LWdyb3VwLW1lbnVdJykuZm9yRWFjaCgobWVudSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHVuaGFuZGxlZFVuZXhwZWN0ZWRFdmVudEtleXMgPSBuZXcgU2V0KCk7XHJcbiAgICAvLyBUcmFjayBtZXNzYWdlIGJhciBtZXNzYWdlcyBhbHJlYWR5IGFja25vd2xlZGdlZCBkdXJpbmcgdGhpcyBleGVjdXRpb24gcnVuXHJcbiAgICAvLyBzbyB0aGUgc2FtZSBub24tYmxvY2tpbmcgd2FybmluZyBkb2Vzbid0IHRyaWdnZXIgcmVwZWF0ZWQgcGF1c2VzLlxyXG4gICAgY29uc3QgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMgPSBuZXcgU2V0KCk7XHJcblxyXG4gICAgLy8gSGVscGVyIHRvIGNoZWNrIGFuZCB3YWl0IGZvciBwYXVzZS9zdG9wXHJcbiAgICBhc3luYyBmdW5jdGlvbiBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKSB7XHJcbiAgICAgICAgaWYgKGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHdoaWxlIChleGVjdXRpb25Db250cm9sLmlzUGF1c2VkKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICBpZiAoZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRUZW1wbGF0ZVRleHQodGV4dCkge1xyXG4gICAgICAgIHJldHVybiBub3JtYWxpemVUZXh0KHRleHQgfHwgJycpLnJlcGxhY2UoL1xcYltcXGQsLl0rXFxiL2csICcjJykudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGNyZWF0ZVVzZXJTdG9wRXJyb3IobWVzc2FnZSA9ICdXb3JrZmxvdyBzdG9wcGVkIGJ5IHVzZXInKSB7XHJcbiAgICAgICAgY29uc3QgZXJyID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xyXG4gICAgICAgIGVyci5pc1VzZXJTdG9wID0gdHJ1ZTtcclxuICAgICAgICBlcnIubm9SZXRyeSA9IHRydWU7XHJcbiAgICAgICAgcmV0dXJuIGVycjtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBpc01lc3NhZ2VCYXJDbG9zZVZpc2libGUoKSB7XHJcbiAgICAgICAgY29uc3QgY2xvc2VCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyQ2xvc2VcIl0nKTtcclxuICAgICAgICByZXR1cm4gY2xvc2VCdG4gJiYgaXNFbGVtZW50VmlzaWJsZShjbG9zZUJ0bik7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc2hvcnRlbkZvckxvZyh0ZXh0LCBtYXggPSAyMjApIHtcclxuICAgICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplVGV4dCh0ZXh0IHx8ICcnKTtcclxuICAgICAgICBpZiAobm9ybWFsaXplZC5sZW5ndGggPD0gbWF4KSByZXR1cm4gbm9ybWFsaXplZDtcclxuICAgICAgICByZXR1cm4gYCR7bm9ybWFsaXplZC5zbGljZSgwLCBtYXgpfS4uLmA7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gY29uc3VtZVBlbmRpbmdGbG93U2lnbmFsKCkge1xyXG4gICAgICAgIGNvbnN0IHNpZ25hbCA9IGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0Zsb3dTaWduYWwgfHwgJ25vbmUnO1xyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0Zsb3dTaWduYWwgPSAnbm9uZSc7XHJcbiAgICAgICAgcmV0dXJuIHNpZ25hbDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBzdGFydEludGVycnVwdGlvbkFjdGlvblJlY29yZGVyKCkge1xyXG4gICAgICAgIGNvbnN0IGNhcHR1cmVkID0gW107XHJcbiAgICAgICAgY29uc3QgY2xpY2tIYW5kbGVyID0gKGV2dCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBldnQudGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCA/IGV2dC50YXJnZXQgOiBudWxsO1xyXG4gICAgICAgICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xyXG4gICAgICAgICAgICBjb25zdCBidXR0b24gPSB0YXJnZXQuY2xvc2VzdCgnYnV0dG9uLCBbcm9sZT1cImJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdJyk7XHJcbiAgICAgICAgICAgIGlmICghYnV0dG9uIHx8ICFpc0VsZW1lbnRWaXNpYmxlKGJ1dHRvbikpIHJldHVybjtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBidXR0b24uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICcnO1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dChidXR0b24udGV4dENvbnRlbnQgfHwgYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSAmJiAhdGV4dCkgcmV0dXJuO1xyXG4gICAgICAgICAgICBjYXB0dXJlZC5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdjbGlja0J1dHRvbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIHRleHRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgc3RvcCgpIHtcclxuICAgICAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xpY2tIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjYXB0dXJlZC5zbGljZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBjb2xsZWN0RGlhbG9nQnV0dG9ucyhkaWFsb2dFbCkge1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdG9ycyA9ICdidXR0b24sIFtyb2xlPVwiYnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0nO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbnMgPSBbXTtcclxuICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xyXG4gICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3JzKS5mb3JFYWNoKChidXR0b25FbCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWlzRWxlbWVudFZpc2libGUoYnV0dG9uRWwpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gYnV0dG9uRWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICcnO1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dChidXR0b25FbC50ZXh0Q29udGVudCB8fCBidXR0b25FbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke2NvbnRyb2xOYW1lLnRvTG93ZXJDYXNlKCl9fCR7dGV4dH1gO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lICYmICF0ZXh0KSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChzZWVuLmhhcyhrZXkpKSByZXR1cm47XHJcbiAgICAgICAgICAgIHNlZW4uYWRkKGtleSk7XHJcbiAgICAgICAgICAgIGJ1dHRvbnMucHVzaCh7IGNvbnRyb2xOYW1lLCB0ZXh0LCBlbGVtZW50OiBidXR0b25FbCB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gYnV0dG9ucztcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBpc0xpa2VseU1vZGFsRGlhbG9nKGRpYWxvZ0VsLCB0ZXh0LCBidXR0b25zKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dExlbmd0aCA9IG5vcm1hbGl6ZVRleHQodGV4dCB8fCAnJykubGVuZ3RoO1xyXG4gICAgICAgIGlmICghYnV0dG9ucy5sZW5ndGgpIHJldHVybiBmYWxzZTtcclxuICAgICAgICBpZiAodGV4dExlbmd0aCA+IDQ1MCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBjb25zdCBmb3JtSW5wdXRzID0gZGlhbG9nRWwucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKTtcclxuICAgICAgICBpZiAoZm9ybUlucHV0cy5sZW5ndGggPiA4KSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGhhc1N0YXRpY1RleHQgPSAhIWRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZvcm1TdGF0aWNUZXh0Q29udHJvbDFcIl0nKTtcclxuICAgICAgICBjb25zdCBoYXNMaWdodGJveENsYXNzID0gZGlhbG9nRWwuY2xhc3NMaXN0Py5jb250YWlucygncm9vdENvbnRlbnQtbGlnaHRCb3gnKTtcclxuICAgICAgICBjb25zdCBoYXNCdXR0b25Hcm91cCA9ICEhZGlhbG9nRWwucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiQnV0dG9uR3JvdXBcIl0nKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGhhc1N0YXRpY1RleHQgfHwgaGFzTGlnaHRib3hDbGFzcyB8fCBoYXNCdXR0b25Hcm91cDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkZXRlY3RVbmV4cGVjdGVkRXZlbnRzKCkge1xyXG4gICAgICAgIGNvbnN0IGV2ZW50cyA9IFtdO1xyXG4gICAgICAgIGNvbnN0IHNlZW5FdmVudEtleXMgPSBuZXcgU2V0KCk7XHJcblxyXG4gICAgICAgIC8vIC0tLSBEaWFsb2dzIC0tLVxyXG4gICAgICAgIGNvbnN0IGRpYWxvZ1NlbGVjdG9ycyA9ICdbcm9sZT1cImRpYWxvZ1wiXSwgW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyJztcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGRpYWxvZ1NlbGVjdG9ycykuZm9yRWFjaCgoZGlhbG9nRWwpID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGRpYWxvZ0VsKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAvLyBQcmVmZXIgdGhlIGRlZGljYXRlZCBzdGF0aWMtdGV4dCBjb250cm9sLCB0aGVuIGhlYWRpbmcgdGFncy5cclxuICAgICAgICAgICAgLy8gQXZvaWQgdGhlIG92ZXJseS1icm9hZCBbY2xhc3MqPVwiY29udGVudFwiXSB3aGljaCBjYW4gbWF0Y2ggd3JhcHBlclxyXG4gICAgICAgICAgICAvLyBlbGVtZW50cyB3aG9zZSB0ZXh0Q29udGVudCBpbmNsdWRlcyBidXR0b24gbGFiZWxzLlxyXG4gICAgICAgICAgICBjb25zdCB0ZXh0RWwgPVxyXG4gICAgICAgICAgICAgICAgZGlhbG9nRWwucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiRm9ybVN0YXRpY1RleHRDb250cm9sMVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICBkaWFsb2dFbC5xdWVyeVNlbGVjdG9yKCdoMSwgaDIsIGgzJykgfHxcclxuICAgICAgICAgICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ1tjbGFzcyo9XCJtZXNzYWdlXCJdJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KHRleHRFbD8udGV4dENvbnRlbnQgfHwgZGlhbG9nRWwudGV4dENvbnRlbnQgfHwgJycpO1xyXG4gICAgICAgICAgICBjb25zdCBidXR0b25zID0gY29sbGVjdERpYWxvZ0J1dHRvbnMoZGlhbG9nRWwpO1xyXG4gICAgICAgICAgICBpZiAoIWlzTGlrZWx5TW9kYWxEaWFsb2coZGlhbG9nRWwsIHRleHQsIGJ1dHRvbnMpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlVGV4dCA9IGdldFRlbXBsYXRlVGV4dCh0ZXh0KTtcclxuICAgICAgICAgICAgY29uc3Qga2V5ID0gYGRpYWxvZ3wke3RlbXBsYXRlVGV4dH1gO1xyXG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVGV4dCB8fCBzZWVuRXZlbnRLZXlzLmhhcyhrZXkpKSByZXR1cm47XHJcbiAgICAgICAgICAgIHNlZW5FdmVudEtleXMuYWRkKGtleSk7XHJcbiAgICAgICAgICAgIGV2ZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIGtpbmQ6ICdkaWFsb2cnLFxyXG4gICAgICAgICAgICAgICAgdGV4dCxcclxuICAgICAgICAgICAgICAgIHRlbXBsYXRlVGV4dCxcclxuICAgICAgICAgICAgICAgIGJ1dHRvbnMsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBkaWFsb2dFbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gLS0tIE1lc3NhZ2UgYmFyIGVudHJpZXMgLS0tXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm1lc3NhZ2VCYXItbWVzc2FnZUVudHJ5JykuZm9yRWFjaCgoZW50cnlFbCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWlzRWxlbWVudFZpc2libGUoZW50cnlFbCkpIHJldHVybjtcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZUVsID0gZW50cnlFbC5xdWVyeVNlbGVjdG9yKCcubWVzc2FnZUJhci1tZXNzYWdlJykgfHwgZW50cnlFbDtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQobWVzc2FnZUVsLnRleHRDb250ZW50IHx8ICcnKTtcclxuICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVUZXh0ID0gZ2V0VGVtcGxhdGVUZXh0KHRleHQpO1xyXG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgbWVzc2FnZUJhcnwke3RlbXBsYXRlVGV4dH1gO1xyXG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVGV4dCB8fCBzZWVuRXZlbnRLZXlzLmhhcyhrZXkpKSByZXR1cm47XHJcbiAgICAgICAgICAgIHNlZW5FdmVudEtleXMuYWRkKGtleSk7XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIG1lc3NhZ2UtYmFyIGVudHJpZXMgdGhhdCB3ZXJlIGFscmVhZHkgYWNrbm93bGVkZ2VkIGluIHRoaXMgcnVuXHJcbiAgICAgICAgICAgIC8vIHNvIHRoZSBzYW1lIG5vbi1ibG9ja2luZyB3YXJuaW5nIGRvZXNuJ3QgY2F1c2UgcmVwZWF0ZWQgcGF1c2VzLlxyXG4gICAgICAgICAgICBpZiAoYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuaGFzKGtleSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIENvbGxlY3QgY2xvc2UgLyB0b2dnbGUgY29udHJvbHMgcGx1cyBjb250ZXh0dWFsIHZpc2libGUgYnV0dG9uc1xyXG4gICAgICAgICAgICAvLyAoZS5nLiBPSy9DYW5jZWwgb24gdGhlIGFjdGl2ZSBmb3JtKSBzbyB0aGUgdXNlciBjYW4gY2hvb3NlIHRoZW0uXHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xzID0gW107XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xLZXlzID0gbmV3IFNldCgpO1xyXG4gICAgICAgICAgICBjb25zdCBwdXNoQ29udHJvbCA9IChjb250cm9sKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtub3JtYWxpemVUZXh0KGNvbnRyb2w/LmNvbnRyb2xOYW1lIHx8ICcnKX18JHtub3JtYWxpemVUZXh0KGNvbnRyb2w/LnRleHQgfHwgJycpfWA7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWtleSB8fCBjb250cm9sS2V5cy5oYXMoa2V5KSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgY29udHJvbEtleXMuYWRkKGtleSk7XHJcbiAgICAgICAgICAgICAgICBjb250cm9scy5wdXNoKGNvbnRyb2wpO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xvc2VCdXR0b24gPVxyXG4gICAgICAgICAgICAgICAgZW50cnlFbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyQ2xvc2VcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyQ2xvc2VcIl0nKSkuZmluZChpc0VsZW1lbnRWaXNpYmxlKSB8fFxyXG4gICAgICAgICAgICAgICAgbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgdG9nZ2xlQnV0dG9uID1cclxuICAgICAgICAgICAgICAgIGVudHJ5RWwucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiTWVzc2FnZUJhclRvZ2dsZVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJUb2dnbGVcIl0nKSkuZmluZChpc0VsZW1lbnRWaXNpYmxlKSB8fFxyXG4gICAgICAgICAgICAgICAgbnVsbDtcclxuICAgICAgICAgICAgaWYgKGNsb3NlQnV0dG9uICYmIGlzRWxlbWVudFZpc2libGUoY2xvc2VCdXR0b24pKSB7XHJcbiAgICAgICAgICAgICAgICBwdXNoQ29udHJvbCh7IGNvbnRyb2xOYW1lOiAnTWVzc2FnZUJhckNsb3NlJywgdGV4dDogbm9ybWFsaXplVGV4dChjbG9zZUJ1dHRvbi50ZXh0Q29udGVudCB8fCAnJyksIGVsZW1lbnQ6IGNsb3NlQnV0dG9uLCB2aXNpYmxlOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0b2dnbGVCdXR0b24gJiYgaXNFbGVtZW50VmlzaWJsZSh0b2dnbGVCdXR0b24pKSB7XHJcbiAgICAgICAgICAgICAgICBwdXNoQ29udHJvbCh7IGNvbnRyb2xOYW1lOiAnTWVzc2FnZUJhclRvZ2dsZScsIHRleHQ6IG5vcm1hbGl6ZVRleHQodG9nZ2xlQnV0dG9uLnRleHRDb250ZW50IHx8ICcnKSwgZWxlbWVudDogdG9nZ2xlQnV0dG9uLCB2aXNpYmxlOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjb250ZXh0Um9vdCA9XHJcbiAgICAgICAgICAgICAgICBlbnRyeUVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdLCBbcm9sZT1cImRpYWxvZ1wiXSwgLnJvb3RDb250ZW50LCAucm9vdENvbnRlbnQtbGlnaHRCb3gnKSB8fFxyXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvblNlbGVjdG9ycyA9ICdbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0sIGJ1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0nO1xyXG4gICAgICAgICAgICBjb250ZXh0Um9vdC5xdWVyeVNlbGVjdG9yQWxsKGJ1dHRvblNlbGVjdG9ycykuZm9yRWFjaCgoYnRuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGJ0bi5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0VmFsdWUgPSBub3JtYWxpemVUZXh0KGJ0bi50ZXh0Q29udGVudCB8fCBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KGNvbnRyb2xOYW1lIHx8IHRleHRWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpc1ByaW1hcnlBY3Rpb24gPVxyXG4gICAgICAgICAgICAgICAgICAgIFsnb2snLCAnY2FuY2VsJywgJ3llcycsICdubycsICdjbG9zZScsICdyZW1vdmUnLCAnZGVsZXRlJywgJ3NhdmUnLCAnbmV3J10uaW5jbHVkZXModG9rZW4pIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ3JlbW92ZScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2NhbmNlbCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2Nsb3NlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnbGluZXN0cmlwJykgfHxcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0VmFsdWUgPT09ICdyZW1vdmUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dFZhbHVlID09PSAnZGVsZXRlJztcclxuICAgICAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZShidG4pIHx8ICghY29udHJvbE5hbWUgJiYgIXRleHRWYWx1ZSkgfHwgIWlzUHJpbWFyeUFjdGlvbikgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgcHVzaENvbnRyb2woeyBjb250cm9sTmFtZSwgdGV4dDogdGV4dFZhbHVlLCBlbGVtZW50OiBidG4sIHZpc2libGU6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHNjYW4gZ2xvYmFsbHkgZm9yIHZpc2libGUgcmVtZWRpYXRpb24gYWN0aW9ucyB0aGF0IG1heSBiZVxyXG4gICAgICAgICAgICAvLyBvdXRzaWRlIHRoZSBtZXNzYWdlLWJhci9mb3JtIHdyYXBwZXIgKGUuZy4gTGluZVN0cmlwRGVsZXRlIGluIHRvb2xiYXIpLlxyXG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGJ1dHRvblNlbGVjdG9ycykuZm9yRWFjaCgoYnRuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGJ0bi5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0VmFsdWUgPSBub3JtYWxpemVUZXh0KGJ0bi50ZXh0Q29udGVudCB8fCBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KGNvbnRyb2xOYW1lIHx8IHRleHRWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpc0xpa2VseUZpeEFjdGlvbiA9XHJcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ3JlbW92ZScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2NhbmNlbCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2Nsb3NlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnbGluZXN0cmlwZGVsZXRlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0VmFsdWUgPT09ICdyZW1vdmUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dFZhbHVlID09PSAnZGVsZXRlJztcclxuICAgICAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZShidG4pIHx8ICFpc0xpa2VseUZpeEFjdGlvbikgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgcHVzaENvbnRyb2woeyBjb250cm9sTmFtZSwgdGV4dDogdGV4dFZhbHVlLCBlbGVtZW50OiBidG4sIHZpc2libGU6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgZXZlbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAga2luZDogJ21lc3NhZ2VCYXInLFxyXG4gICAgICAgICAgICAgICAgdGV4dCxcclxuICAgICAgICAgICAgICAgIHRlbXBsYXRlVGV4dCxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xzLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZW50cnlFbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGV2ZW50cztcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBtYXRjaEhhbmRsZXJUb0V2ZW50KGhhbmRsZXIsIGV2ZW50KSB7XHJcbiAgICAgICAgY29uc3QgdHJpZ2dlciA9IGhhbmRsZXI/LnRyaWdnZXIgfHwge307XHJcbiAgICAgICAgaWYgKHRyaWdnZXIua2luZCAhPT0gZXZlbnQua2luZCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IHRyaWdnZXJUZW1wbGF0ZSA9IGdlbmVyYWxpemVJbnRlcnJ1cHRpb25UZXh0KHRyaWdnZXIudGV4dFRlbXBsYXRlIHx8ICcnKTtcclxuICAgICAgICBjb25zdCBldmVudFRlbXBsYXRlID0gZ2VuZXJhbGl6ZUludGVycnVwdGlvblRleHQoZXZlbnQudGVtcGxhdGVUZXh0IHx8IGV2ZW50LnRleHQgfHwgJycpO1xyXG4gICAgICAgIGNvbnN0IHRyaWdnZXJNYXRjaE1vZGUgPSBub3JtYWxpemVUZXh0KHRyaWdnZXIubWF0Y2hNb2RlIHx8ICcnKTtcclxuXHJcbiAgICAgICAgaWYgKHRyaWdnZXJNYXRjaE1vZGUgPT09ICdyZWdleCcpIHtcclxuICAgICAgICAgICAgLy8gUmVnZXggbW9kZTogdXNlIHRyaWdnZXIucmVnZXggb3IgdHJpZ2dlci50ZXh0VGVtcGxhdGUgYXMgYSByZWdleFxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGF0dGVybiA9IHRyaWdnZXIucmVnZXggfHwgdHJpZ2dlci50ZXh0VGVtcGxhdGUgfHwgJyc7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXBhdHRlcm4pIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGV2ZW50VGV4dCA9IG5vcm1hbGl6ZVRleHQoZXZlbnQudGVtcGxhdGVUZXh0IHx8IGV2ZW50LnRleHQgfHwgJycpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCEobmV3IFJlZ0V4cChwYXR0ZXJuLCAnaScpKS50ZXN0KGV2ZW50VGV4dCkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHRyaWdnZXJNYXRjaE1vZGUgPT09ICdleGFjdCcpIHtcclxuICAgICAgICAgICAgaWYgKHRyaWdnZXJUZW1wbGF0ZSAmJiB0cmlnZ2VyVGVtcGxhdGUgIT09IGV2ZW50VGVtcGxhdGUpIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBDb250YWlucyBtb2RlIChkZWZhdWx0KVxyXG4gICAgICAgICAgICBpZiAodHJpZ2dlclRlbXBsYXRlICYmICEoZXZlbnRUZW1wbGF0ZS5pbmNsdWRlcyh0cmlnZ2VyVGVtcGxhdGUpIHx8IHRyaWdnZXJUZW1wbGF0ZS5pbmNsdWRlcyhldmVudFRlbXBsYXRlKSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcmVxdWlyZWRDb250cm9scyA9IEFycmF5LmlzQXJyYXkodHJpZ2dlci5yZXF1aXJlZENvbnRyb2xzKSA/IHRyaWdnZXIucmVxdWlyZWRDb250cm9scyA6IFtdO1xyXG4gICAgICAgIGlmIChyZXF1aXJlZENvbnRyb2xzLmxlbmd0aCAmJiBldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcclxuICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlID0gbmV3IFNldCgoZXZlbnQuY29udHJvbHMgfHwgW10pLm1hcChjdHJsID0+IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCBjdHJsLnRleHQgfHwgJycpKSk7XHJcbiAgICAgICAgICAgIGlmICghcmVxdWlyZWRDb250cm9scy5ldmVyeShuYW1lID0+IGF2YWlsYWJsZS5oYXMobm9ybWFsaXplVGV4dChuYW1lKSkpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJlcXVpcmVkQnV0dG9ucyA9IEFycmF5LmlzQXJyYXkodHJpZ2dlci5yZXF1aXJlZEJ1dHRvbnMpID8gdHJpZ2dlci5yZXF1aXJlZEJ1dHRvbnMgOiBbXTtcclxuICAgICAgICBpZiAocmVxdWlyZWRCdXR0b25zLmxlbmd0aCAmJiBldmVudC5raW5kID09PSAnZGlhbG9nJykge1xyXG4gICAgICAgICAgICBjb25zdCBhdmFpbGFibGUgPSBuZXcgU2V0KChldmVudC5idXR0b25zIHx8IFtdKS5tYXAoYnRuID0+IG5vcm1hbGl6ZVRleHQoYnRuLmNvbnRyb2xOYW1lIHx8IGJ0bi50ZXh0IHx8ICcnKSkpO1xyXG4gICAgICAgICAgICByZXR1cm4gcmVxdWlyZWRCdXR0b25zLmV2ZXJ5KG5hbWUgPT4gYXZhaWxhYmxlLmhhcyhub3JtYWxpemVUZXh0KG5hbWUpKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdlbmVyYWxpemVJbnRlcnJ1cHRpb25UZXh0KHJhd1RleHQpIHtcclxuICAgICAgICBsZXQgdmFsdWUgPSBub3JtYWxpemVUZXh0KHJhd1RleHQgfHwgJycpO1xyXG4gICAgICAgIGlmICghdmFsdWUpIHJldHVybiAnJztcclxuXHJcbiAgICAgICAgdmFsdWUgPSB2YWx1ZVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxiY3VzdG9tZXJcXHMrXFxkK1xcYi9naSwgJ2N1c3RvbWVyIHtudW1iZXJ9JylcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcYml0ZW0gbnVtYmVyXFxzK1thLXowLTlfLV0rXFxiL2dpLCAnaXRlbSBudW1iZXIge3ZhbHVlfScpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGJcXGRbXFxkLC4vLV0qXFxiL2csICd7bnVtYmVyfScpO1xyXG5cclxuICAgICAgICAvLyBHZW5lcmFsaXplIGR1cGxpY2F0ZSBjcmVhdGUtcmVjb3JkIGludGVycnVwdGlvbnMgYWNyb3NzIHRhYmxlcy9maWVsZHMuXHJcbiAgICAgICAgLy8gRXhhbXBsZTpcclxuICAgICAgICAvLyBjYW5ub3QgY3JlYXRlIGEgcmVjb3JkIGluIHRyYW5zbGF0aW9ucyAobGFuZ3VhZ2V4dCkuIGxhbmd1YWdlOiBlbi11cy4gdGhlIHJlY29yZCBhbHJlYWR5IGV4aXN0cy5cclxuICAgICAgICAvLyAtPiBjYW5ub3QgY3JlYXRlIGEgcmVjb3JkIGluIHtyZWNvcmR9LiB7ZmllbGR9OiB7dmFsdWV9LiB0aGUgcmVjb3JkIGFscmVhZHkgZXhpc3RzLlxyXG4gICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZShcclxuICAgICAgICAgICAgLyhcXGJjYW5ub3QgY3JlYXRlIGEgcmVjb3JkIGluICkoW14uXSs/KShcXC4pL2ksXHJcbiAgICAgICAgICAgICckMXtyZWNvcmR9JDMnXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKFxyXG4gICAgICAgICAgICAvXFxiZmllbGRcXHMrWydcIl0/KFteJ1wiLl0rPylbJ1wiXT9cXHMrbXVzdCBiZSBmaWxsZWQgaW5cXC4/L2ksXHJcbiAgICAgICAgICAgIFwiZmllbGQgJ3tmaWVsZH0nIG11c3QgYmUgZmlsbGVkIGluLlwiXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKFxyXG4gICAgICAgICAgICAvXFxiW2Etel1bYS16MC05IF8oKS8tXSpcXHMrY2Fubm90IGJlIGRlbGV0ZWQgd2hpbGUgZGVwZW5kZW50XFxzK1thLXpdW2EtejAtOSBfKCkvLV0qXFxzK2V4aXN0XFwuPy9pLFxyXG4gICAgICAgICAgICAne2VudGl0eX0gY2Fubm90IGJlIGRlbGV0ZWQgd2hpbGUgZGVwZW5kZW50IHtkZXBlbmRlbmN5fSBleGlzdC4nXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKFxyXG4gICAgICAgICAgICAvXFxiZGVsZXRlIGRlcGVuZGVudFxccytbYS16XVthLXowLTkgXygpLy1dKlxccythbmQgdHJ5IGFnYWluXFwuPy9pLFxyXG4gICAgICAgICAgICAnZGVsZXRlIGRlcGVuZGVudCB7ZGVwZW5kZW5jeX0gYW5kIHRyeSBhZ2Fpbi4nXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKFxyXG4gICAgICAgICAgICAvKFxcLlxccyopKFthLXpdW2EtejAtOSBfKCkvLV0qKShcXHMqOlxccyopKFteLl0rPykoXFwuXFxzKnRoZSByZWNvcmQgYWxyZWFkeSBleGlzdHNcXC4/KS9pLFxyXG4gICAgICAgICAgICAnJDF7ZmllbGR9OiB7dmFsdWV9JDUnXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gTm9ybWFsaXplIGR1cGxpY2F0ZS1yZWNvcmQgc3R5bGUgbWVzc2FnZXMgc28gdmFyeWluZyBrZXkgdmFsdWVzXHJcbiAgICAgICAgLy8gKGUuZy4gXCIxLCAxXCIgdnMgXCJGUi1FVS1OUiwgRlItRVUtTlJcIikgbWFwIHRvIG9uZSBoYW5kbGVyLlxyXG4gICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZShcclxuICAgICAgICAgICAgLyhcXGJbYS16XVthLXowLTkgXygpLy1dKlxccyo6XFxzKikoW14uXSs/KShcXC5cXHMqdGhlIHJlY29yZCBhbHJlYWR5IGV4aXN0c1xcLj8pL2ksXHJcbiAgICAgICAgICAgICd7ZmllbGR9OiB7dmFsdWV9JDMnXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZVRleHQodmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmRNYXRjaGluZ0hhbmRsZXIoZXZlbnQpIHtcclxuICAgICAgICBjb25zdCBoYW5kbGVycyA9IEFycmF5LmlzQXJyYXkoY3VycmVudFdvcmtmbG93Py51bmV4cGVjdGVkRXZlbnRIYW5kbGVycylcclxuICAgICAgICAgICAgPyBjdXJyZW50V29ya2Zsb3cudW5leHBlY3RlZEV2ZW50SGFuZGxlcnNcclxuICAgICAgICAgICAgOiBbXTtcclxuICAgICAgICBjb25zdCBzb3J0ZWQgPSBoYW5kbGVyc1xyXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICAgICAgICAgIC5zbGljZSgpXHJcbiAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYj8ucHJpb3JpdHkgfHwgMCkgLSBOdW1iZXIoYT8ucHJpb3JpdHkgfHwgMCkpO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGhhbmRsZXIgb2Ygc29ydGVkKSB7XHJcbiAgICAgICAgICAgIGlmIChoYW5kbGVyPy5lbmFibGVkID09PSBmYWxzZSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaEhhbmRsZXJUb0V2ZW50KGhhbmRsZXIsIGV2ZW50KSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZmluZERpYWxvZ0J1dHRvbihldmVudCwgdGFyZ2V0TmFtZSkge1xyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dCh0YXJnZXROYW1lIHx8ICcnKTtcclxuICAgICAgICBpZiAoIWV4cGVjdGVkKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBjb25zdCBidXR0b25zID0gQXJyYXkuaXNBcnJheShldmVudD8uYnV0dG9ucykgPyBldmVudC5idXR0b25zIDogW107XHJcbiAgICAgICAgcmV0dXJuIGJ1dHRvbnMuZmluZChidG4gPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBieUNvbnRyb2wgPSBub3JtYWxpemVUZXh0KGJ0bi5jb250cm9sTmFtZSB8fCAnJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ5VGV4dCA9IG5vcm1hbGl6ZVRleHQoYnRuLnRleHQgfHwgJycpO1xyXG4gICAgICAgICAgICByZXR1cm4gYnlDb250cm9sID09PSBleHBlY3RlZCB8fCBieVRleHQgPT09IGV4cGVjdGVkO1xyXG4gICAgICAgIH0pIHx8IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZmluZE1lc3NhZ2VCYXJDb250cm9sKGV2ZW50LCB0YXJnZXROYW1lKSB7XHJcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHRhcmdldE5hbWUgfHwgJycpO1xyXG4gICAgICAgIGlmICghZXhwZWN0ZWQpIHJldHVybiBudWxsO1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xzID0gQXJyYXkuaXNBcnJheShldmVudD8uY29udHJvbHMpID8gZXZlbnQuY29udHJvbHMgOiBbXTtcclxuICAgICAgICByZXR1cm4gY29udHJvbHMuZmluZChjdHJsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYnlDb250cm9sID0gbm9ybWFsaXplVGV4dChjdHJsLmNvbnRyb2xOYW1lIHx8ICcnKTtcclxuICAgICAgICAgICAgY29uc3QgYnlUZXh0ID0gbm9ybWFsaXplVGV4dChjdHJsLnRleHQgfHwgJycpO1xyXG4gICAgICAgICAgICByZXR1cm4gYnlDb250cm9sID09PSBleHBlY3RlZCB8fCBieVRleHQgPT09IGV4cGVjdGVkO1xyXG4gICAgICAgIH0pIHx8IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gY29sbGVjdEdsb2JhbFJlbWVkaWF0aW9uQ29udHJvbHMoKSB7XHJcbiAgICAgICAgY29uc3QgY29udHJvbHMgPSBbXTtcclxuICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvblNlbGVjdG9ycyA9ICdbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0sIGJ1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0nO1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYnV0dG9uU2VsZWN0b3JzKS5mb3JFYWNoKChidG4pID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ0bikpIHJldHVybjtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBidG4uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICcnO1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dChidG4udGV4dENvbnRlbnQgfHwgYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnKTtcclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KGNvbnRyb2xOYW1lIHx8IHRleHQpO1xyXG4gICAgICAgICAgICBjb25zdCBpc1JlbWVkaWF0aW9uQWN0aW9uID1cclxuICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdyZW1vdmUnKSB8fFxyXG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpIHx8XHJcbiAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnY2FuY2VsJykgfHxcclxuICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdjbG9zZScpIHx8XHJcbiAgICAgICAgICAgICAgICB0b2tlbiA9PT0gJ29rJyB8fFxyXG4gICAgICAgICAgICAgICAgdG9rZW4gPT09ICd5ZXMnIHx8XHJcbiAgICAgICAgICAgICAgICB0b2tlbiA9PT0gJ25vJztcclxuICAgICAgICAgICAgaWYgKCFpc1JlbWVkaWF0aW9uQWN0aW9uKSByZXR1cm47XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke25vcm1hbGl6ZVRleHQoY29udHJvbE5hbWUpfXwke3RleHR9YDtcclxuICAgICAgICAgICAgaWYgKHNlZW4uaGFzKGtleSkpIHJldHVybjtcclxuICAgICAgICAgICAgc2Vlbi5hZGQoa2V5KTtcclxuICAgICAgICAgICAgY29udHJvbHMucHVzaCh7IGNvbnRyb2xOYW1lLCB0ZXh0LCBlbGVtZW50OiBidG4sIHZpc2libGU6IHRydWUgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGNvbnRyb2xzO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmRHbG9iYWxDbGlja2FibGUodGFyZ2V0TmFtZSkge1xyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dCh0YXJnZXROYW1lIHx8ICcnKTtcclxuICAgICAgICBpZiAoIWV4cGVjdGVkKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBjb25zdCBjb250cm9scyA9IGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCk7XHJcbiAgICAgICAgcmV0dXJuIGNvbnRyb2xzLmZpbmQoKGN0cmwpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYnlDb250cm9sID0gbm9ybWFsaXplVGV4dChjdHJsLmNvbnRyb2xOYW1lIHx8ICcnKTtcclxuICAgICAgICAgICAgY29uc3QgYnlUZXh0ID0gbm9ybWFsaXplVGV4dChjdHJsLnRleHQgfHwgJycpO1xyXG4gICAgICAgICAgICByZXR1cm4gYnlDb250cm9sID09PSBleHBlY3RlZCB8fCBieVRleHQgPT09IGV4cGVjdGVkO1xyXG4gICAgICAgIH0pIHx8IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gbm9ybWFsaXplSGFuZGxlckFjdGlvbnMoaGFuZGxlcikge1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGhhbmRsZXI/LmFjdGlvbnMpICYmIGhhbmRsZXIuYWN0aW9ucy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXIuYWN0aW9ucy5maWx0ZXIoQm9vbGVhbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChoYW5kbGVyPy5hY3Rpb24pIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtoYW5kbGVyLmFjdGlvbl07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZWNvcmRMZWFybmVkUnVsZShydWxlKSB7XHJcbiAgICAgICAgaWYgKCFjdXJyZW50V29ya2Zsb3cgfHwgIXJ1bGUpIHJldHVybjtcclxuICAgICAgICBjdXJyZW50V29ya2Zsb3cudW5leHBlY3RlZEV2ZW50SGFuZGxlcnMgPSBBcnJheS5pc0FycmF5KGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVycylcclxuICAgICAgICAgICAgPyBjdXJyZW50V29ya2Zsb3cudW5leHBlY3RlZEV2ZW50SGFuZGxlcnNcclxuICAgICAgICAgICAgOiBbXTtcclxuXHJcbiAgICAgICAgY29uc3Qga2V5ID0gSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICB0cmlnZ2VyOiBydWxlLnRyaWdnZXIsXHJcbiAgICAgICAgICAgIGFjdGlvbnM6IEFycmF5LmlzQXJyYXkocnVsZT8uYWN0aW9ucykgPyBydWxlLmFjdGlvbnMgOiBbcnVsZT8uYWN0aW9uXS5maWx0ZXIoQm9vbGVhbiksXHJcbiAgICAgICAgICAgIG91dGNvbWU6IHJ1bGU/Lm91dGNvbWUgfHwgJ25leHQtc3RlcCdcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBleGlzdHMgPSBjdXJyZW50V29ya2Zsb3cudW5leHBlY3RlZEV2ZW50SGFuZGxlcnMuc29tZShleGlzdGluZyA9PlxyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICAgICAgICB0cmlnZ2VyOiBleGlzdGluZz8udHJpZ2dlcixcclxuICAgICAgICAgICAgICAgIGFjdGlvbnM6IEFycmF5LmlzQXJyYXkoZXhpc3Rpbmc/LmFjdGlvbnMpID8gZXhpc3RpbmcuYWN0aW9ucyA6IFtleGlzdGluZz8uYWN0aW9uXS5maWx0ZXIoQm9vbGVhbiksXHJcbiAgICAgICAgICAgICAgICBvdXRjb21lOiBleGlzdGluZz8ub3V0Y29tZSB8fCAnbmV4dC1zdGVwJ1xyXG4gICAgICAgICAgICB9KSA9PT0ga2V5XHJcbiAgICAgICAgKTtcclxuICAgICAgICBpZiAoZXhpc3RzKSByZXR1cm47XHJcblxyXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVycy5wdXNoKHJ1bGUpO1xyXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0xFQVJOSU5HX1JVTEUnLFxyXG4gICAgICAgICAgICBwYXlsb2FkOiB7XHJcbiAgICAgICAgICAgICAgICB3b3JrZmxvd0lkOiBjdXJyZW50V29ya2Zsb3c/LmlkIHx8ICcnLFxyXG4gICAgICAgICAgICAgICAgcnVsZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSwgJyonKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVSdWxlRnJvbUV2ZW50KGV2ZW50LCBhY3Rpb25zLCBvdXRjb21lID0gJ25leHQtc3RlcCcsIG1hdGNoTW9kZSA9ICdjb250YWlucycpIHtcclxuICAgICAgICBjb25zdCByZXF1aXJlZEJ1dHRvbnMgPSBldmVudC5raW5kID09PSAnZGlhbG9nJ1xyXG4gICAgICAgICAgICA/IChldmVudC5idXR0b25zIHx8IFtdKS5tYXAoYnRuID0+IGJ0bi5jb250cm9sTmFtZSB8fCBidG4udGV4dCkuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICAgICAgICAgIDogW107XHJcbiAgICAgICAgY29uc3QgcmVxdWlyZWRDb250cm9scyA9IGV2ZW50LmtpbmQgPT09ICdtZXNzYWdlQmFyJ1xyXG4gICAgICAgICAgICA/IChldmVudC5jb250cm9scyB8fCBbXSkubWFwKGN0cmwgPT4gY3RybC5jb250cm9sTmFtZSB8fCBjdHJsLnRleHQpLmZpbHRlcihCb29sZWFuKVxyXG4gICAgICAgICAgICA6IFtdO1xyXG4gICAgICAgIGNvbnN0IGFjdGlvbkxpc3QgPSBBcnJheS5pc0FycmF5KGFjdGlvbnMpID8gYWN0aW9ucy5maWx0ZXIoQm9vbGVhbikgOiBbXTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBpZDogYHJ1bGVfJHtEYXRlLm5vdygpfV8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMTYpLnNsaWNlKDIsIDgpfWAsXHJcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgcHJpb3JpdHk6IDEwMCxcclxuICAgICAgICAgICAgbW9kZTogJ2F1dG8nLFxyXG4gICAgICAgICAgICB0cmlnZ2VyOiB7XHJcbiAgICAgICAgICAgICAgICBraW5kOiBldmVudC5raW5kLFxyXG4gICAgICAgICAgICAgICAgdGV4dFRlbXBsYXRlOiBnZW5lcmFsaXplSW50ZXJydXB0aW9uVGV4dChldmVudC50ZW1wbGF0ZVRleHQgfHwgZXZlbnQudGV4dCB8fCAnJyksXHJcbiAgICAgICAgICAgICAgICBtYXRjaE1vZGU6IG5vcm1hbGl6ZVRleHQobWF0Y2hNb2RlIHx8ICcnKSA9PT0gJ2V4YWN0JyA/ICdleGFjdCcgOiAnY29udGFpbnMnLFxyXG4gICAgICAgICAgICAgICAgcmVxdWlyZWRCdXR0b25zLFxyXG4gICAgICAgICAgICAgICAgcmVxdWlyZWRDb250cm9sc1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBhY3Rpb25zOiBhY3Rpb25MaXN0LFxyXG4gICAgICAgICAgICBhY3Rpb246IGFjdGlvbkxpc3RbMF0gfHwgbnVsbCxcclxuICAgICAgICAgICAgb3V0Y29tZTogbm9ybWFsaXplRmxvd091dGNvbWUob3V0Y29tZSlcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIG5vcm1hbGl6ZUZsb3dPdXRjb21lKHJhd091dGNvbWUpIHtcclxuICAgICAgICBjb25zdCB2YWx1ZSA9IG5vcm1hbGl6ZVRleHQocmF3T3V0Y29tZSB8fCAnJyk7XHJcbiAgICAgICAgaWYgKHZhbHVlID09PSAnY29udGludWUtbG9vcCcgfHwgdmFsdWUgPT09ICdjb250aW51ZScpIHJldHVybiAnY29udGludWUtbG9vcCc7XHJcbiAgICAgICAgaWYgKHZhbHVlID09PSAncmVwZWF0LWxvb3AnIHx8IHZhbHVlID09PSAncmVwZWF0JyB8fCB2YWx1ZSA9PT0gJ3JldHJ5LWxvb3AnKSByZXR1cm4gJ3JlcGVhdC1sb29wJztcclxuICAgICAgICBpZiAodmFsdWUgPT09ICdicmVhay1sb29wJyB8fCB2YWx1ZSA9PT0gJ2JyZWFrJykgcmV0dXJuICdicmVhay1sb29wJztcclxuICAgICAgICBpZiAodmFsdWUgPT09ICdzdG9wJyB8fCB2YWx1ZSA9PT0gJ2ZhaWwnKSByZXR1cm4gJ3N0b3AnO1xyXG4gICAgICAgIHJldHVybiAnbmV4dC1zdGVwJztcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBpc0Jlbmlnbk1lc3NhZ2VCYXJFdmVudChldmVudCkge1xyXG4gICAgICAgIGlmICghZXZlbnQgfHwgZXZlbnQua2luZCAhPT0gJ21lc3NhZ2VCYXInKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQoZXZlbnQudGV4dCB8fCAnJyk7XHJcbiAgICAgICAgcmV0dXJuIHRleHQuaW5jbHVkZXMoJ25ld3JlY29yZGFjdGlvbiBidXR0b24gc2hvdWxkIG5vdCByZS10cmlnZ2VyIHRoZSBuZXcgdGFzaycpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JGbG93VHJhbnNpdGlvblN0YWJpbGl0eSgpIHtcclxuICAgICAgICBjb25zdCBtYXhDaGVja3MgPSAxNjtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1heENoZWNrczsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxvYWRpbmcgPSBpc0QzNjVMb2FkaW5nKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHZpc2libGVEaWFsb2cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImRpYWxvZ1wiXTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pLCBbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyk7XHJcbiAgICAgICAgICAgIGlmICghbG9hZGluZyAmJiAhdmlzaWJsZURpYWxvZykge1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnRkxPV19TVEFCSUxJVFlfUE9MTF9ERUxBWScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yRXZlbnRSZXNvbHV0aW9uKGV2ZW50LCB0aW1lb3V0TXMgPSAzMDAwKSB7XHJcbiAgICAgICAgaWYgKCFldmVudCkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XHJcbiAgICAgICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydGVkQXQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtpbmQgPT09ICdkaWFsb2cnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkaWFsb2dFbCA9IGV2ZW50LmVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkaWFsb2dTdGlsbFZpc2libGUgPSAhIWRpYWxvZ0VsICYmIGRpYWxvZ0VsLmlzQ29ubmVjdGVkICYmIGlzRWxlbWVudFZpc2libGUoZGlhbG9nRWwpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFkaWFsb2dTdGlsbFZpc2libGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gJ21lc3NhZ2VCYXInKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeUVsID0gZXZlbnQuZWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5U3RpbGxWaXNpYmxlID0gISFlbnRyeUVsICYmIGVudHJ5RWwuaXNDb25uZWN0ZWQgJiYgaXNFbGVtZW50VmlzaWJsZShlbnRyeUVsKTtcclxuICAgICAgICAgICAgICAgIGlmICghZW50cnlTdGlsbFZpc2libGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0ZMT1dfU1RBQklMSVRZX1BPTExfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gYnVpbGRSdWxlQWN0aW9uRnJvbU9wdGlvbihldmVudCwgb3B0aW9uKSB7XHJcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZENvbnRyb2wgPSBub3JtYWxpemVUZXh0KG9wdGlvbj8uY29udHJvbE5hbWUgfHwgJycpO1xyXG4gICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicgJiYgbm9ybWFsaXplZENvbnRyb2wgPT09ICdtZXNzYWdlYmFyY2xvc2UnKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnY2xvc2VNZXNzYWdlQmFyJyxcclxuICAgICAgICAgICAgICAgIGJ1dHRvbkNvbnRyb2xOYW1lOiBvcHRpb24uY29udHJvbE5hbWUgfHwgJycsXHJcbiAgICAgICAgICAgICAgICBidXR0b25UZXh0OiBvcHRpb24udGV4dCB8fCAnJ1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0eXBlOiAnY2xpY2tCdXR0b24nLFxyXG4gICAgICAgICAgICBidXR0b25Db250cm9sTmFtZTogb3B0aW9uPy5jb250cm9sTmFtZSB8fCAnJyxcclxuICAgICAgICAgICAgYnV0dG9uVGV4dDogb3B0aW9uPy50ZXh0IHx8ICcnXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBhcHBseVNpbmdsZUFjdGlvbihldmVudCwgYWN0aW9uKSB7XHJcbiAgICAgICAgaWYgKGFjdGlvbj8udHlwZSA9PT0gJ2NsaWNrQnV0dG9uJyAmJiBldmVudC5raW5kID09PSAnZGlhbG9nJykge1xyXG4gICAgICAgICAgICBjb25zdCBidXR0b24gPSBmaW5kRGlhbG9nQnV0dG9uKGV2ZW50LCBhY3Rpb24uYnV0dG9uQ29udHJvbE5hbWUgfHwgYWN0aW9uLmJ1dHRvblRleHQpO1xyXG4gICAgICAgICAgICBpZiAoYnV0dG9uPy5lbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICBidXR0b24uZWxlbWVudC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnRElBTE9HX0FDVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvckV2ZW50UmVzb2x1dGlvbihldmVudCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGFjdGlvbj8udHlwZSA9PT0gJ2NsaWNrQnV0dG9uJyAmJiBldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbCA9IGZpbmRNZXNzYWdlQmFyQ29udHJvbChldmVudCwgYWN0aW9uLmJ1dHRvbkNvbnRyb2xOYW1lIHx8IGFjdGlvbi5idXR0b25UZXh0KTtcclxuICAgICAgICAgICAgaWYgKGNvbnRyb2w/LmVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIGNvbnRyb2wuZWxlbWVudC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnRElBTE9HX0FDVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdjbGlja0J1dHRvbicpIHtcclxuICAgICAgICAgICAgY29uc3QgZ2xvYmFsQ29udHJvbCA9IGZpbmRHbG9iYWxDbGlja2FibGUoYWN0aW9uLmJ1dHRvbkNvbnRyb2xOYW1lIHx8IGFjdGlvbi5idXR0b25UZXh0KTtcclxuICAgICAgICAgICAgaWYgKCFnbG9iYWxDb250cm9sPy5lbGVtZW50KSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIGdsb2JhbENvbnRyb2wuZWxlbWVudC5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdESUFMT0dfQUNUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnZGlhbG9nJyB8fCBldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JFdmVudFJlc29sdXRpb24oZXZlbnQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGFjdGlvbj8udHlwZSA9PT0gJ2Nsb3NlTWVzc2FnZUJhcicgJiYgZXZlbnQua2luZCA9PT0gJ21lc3NhZ2VCYXInKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZyb21PcHRpb24gPSBmaW5kTWVzc2FnZUJhckNvbnRyb2woZXZlbnQsIGFjdGlvbi5idXR0b25Db250cm9sTmFtZSB8fCBhY3Rpb24uYnV0dG9uVGV4dCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGZyb21Db250cm9scyA9IChldmVudC5jb250cm9scyB8fCBbXSkuZmluZChjdHJsID0+IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCAnJykgPT09ICdtZXNzYWdlYmFyY2xvc2UnKTtcclxuICAgICAgICAgICAgY29uc3QgZnJvbUVudHJ5ID1cclxuICAgICAgICAgICAgICAgIGV2ZW50LmVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3I/LignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiTWVzc2FnZUJhckNsb3NlXCJdJykgfHwgbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgZnJvbVBhZ2UgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJDbG9zZVwiXScpKS5maW5kKGlzRWxlbWVudFZpc2libGUpIHx8IG51bGw7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlRWxlbWVudCA9IGZyb21PcHRpb24/LmVsZW1lbnQgfHwgZnJvbUNvbnRyb2xzPy5lbGVtZW50IHx8IGZyb21FbnRyeSB8fCBmcm9tUGFnZTtcclxuICAgICAgICAgICAgaWYgKCFjbG9zZUVsZW1lbnQgfHwgIWlzRWxlbWVudFZpc2libGUoY2xvc2VFbGVtZW50KSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBjbG9zZUVsZW1lbnQuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnTUVTU0FHRV9DTE9TRV9ERUxBWScpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRXZlbnRSZXNvbHV0aW9uKGV2ZW50KTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYWN0aW9uPy50eXBlID09PSAnc3RvcCcpIHtcclxuICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGFjdGlvbj8udHlwZSA9PT0gJ25vbmUnO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGFwcGx5SGFuZGxlcihldmVudCwgaGFuZGxlcikge1xyXG4gICAgICAgIGNvbnN0IGFjdGlvbnMgPSBub3JtYWxpemVIYW5kbGVyQWN0aW9ucyhoYW5kbGVyKTtcclxuICAgICAgICBpZiAoIWFjdGlvbnMubGVuZ3RoKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBsZXQgaGFuZGxlZCA9IGZhbHNlO1xyXG4gICAgICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudEV2ZW50cyA9IGRldGVjdFVuZXhwZWN0ZWRFdmVudHMoKTtcclxuICAgICAgICAgICAgY29uc3QgYWN0aXZlRXZlbnQgPSBjdXJyZW50RXZlbnRzLmZpbmQoKGNhbmRpZGF0ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjYW5kaWRhdGUgfHwgY2FuZGlkYXRlLmtpbmQgIT09IGV2ZW50LmtpbmQpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGlmIChjYW5kaWRhdGUuZWxlbWVudCAmJiBldmVudC5lbGVtZW50ICYmIGNhbmRpZGF0ZS5lbGVtZW50ID09PSBldmVudC5lbGVtZW50KSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZVRlbXBsYXRlID0gbm9ybWFsaXplVGV4dChjYW5kaWRhdGUudGVtcGxhdGVUZXh0IHx8ICcnKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGV2ZW50VGVtcGxhdGUgPSBub3JtYWxpemVUZXh0KGV2ZW50LnRlbXBsYXRlVGV4dCB8fCAnJyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FuZGlkYXRlVGVtcGxhdGUgJiYgZXZlbnRUZW1wbGF0ZSAmJiBjYW5kaWRhdGVUZW1wbGF0ZSA9PT0gZXZlbnRUZW1wbGF0ZTtcclxuICAgICAgICAgICAgfSkgfHwgY3VycmVudEV2ZW50c1swXSB8fCBldmVudDtcclxuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IGFwcGx5U2luZ2xlQWN0aW9uKGFjdGl2ZUV2ZW50LCBhY3Rpb24pO1xyXG4gICAgICAgICAgICBoYW5kbGVkID0gaGFuZGxlZCB8fCBhcHBsaWVkO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaGFuZGxlZDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBhc2tVc2VyQW5kSGFuZGxlRXZlbnQgcmVtb3ZlZCBcdTIwMTQgbGVhcm5pbmcgbW9kZSB1c2VzIHRoZSByZWNvcmRlci1iYXNlZFxyXG4gICAgLy8gYXBwcm9hY2ggaW4gaGFuZGxlVW5leHBlY3RlZEV2ZW50cyB3aGljaCBjYXB0dXJlcyB1c2VyIGNsaWNrcyBvbiB0aGVcclxuICAgIC8vIGFjdHVhbCBEMzY1IHBhZ2UgYW5kIGF1dG9tYXRpY2FsbHkgY3JlYXRlcyBydWxlcyBmcm9tIHRoZW0uXHJcblxyXG4gICAgZnVuY3Rpb24gaW5mZXJGbG93T3V0Y29tZUZyb21BY3Rpb24oYWN0aW9uLCBldmVudCkge1xyXG4gICAgICAgIGNvbnN0IHRva2VuID0gbm9ybWFsaXplVGV4dChhY3Rpb24/LmNvbnRyb2xOYW1lIHx8IGFjdGlvbj8udGV4dCB8fCAnJyk7XHJcbiAgICAgICAgaWYgKCF0b2tlbikgcmV0dXJuICduZXh0LXN0ZXAnO1xyXG4gICAgICAgIGlmICh0b2tlbi5pbmNsdWRlcygnc3RvcCcpKSByZXR1cm4gJ3N0b3AnO1xyXG4gICAgICAgIGlmICh0b2tlbi5pbmNsdWRlcygnY2FuY2VsJykgfHwgdG9rZW4uaW5jbHVkZXMoJ2Nsb3NlJykgfHwgdG9rZW4gPT09ICdubycpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50Py5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiAnY29udGludWUtbG9vcCc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuICduZXh0LXN0ZXAnO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gJ25leHQtc3RlcCc7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gYnVpbGRJbnRlcnJ1cHRpb25PcHRpb25zKGV2ZW50KSB7XHJcbiAgICAgICAgY29uc3QgZGVkdXBlID0gbmV3IFNldCgpO1xyXG4gICAgICAgIGNvbnN0IGFsbCA9IFtdO1xyXG4gICAgICAgIGNvbnN0IHB1c2hVbmlxdWUgPSAoaXRlbSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBvcHRpb24gPSB7XHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogaXRlbT8uY29udHJvbE5hbWUgfHwgJycsXHJcbiAgICAgICAgICAgICAgICB0ZXh0OiBpdGVtPy50ZXh0IHx8ICcnXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke25vcm1hbGl6ZVRleHQob3B0aW9uLmNvbnRyb2xOYW1lKX18JHtub3JtYWxpemVUZXh0KG9wdGlvbi50ZXh0KX1gO1xyXG4gICAgICAgICAgICBpZiAoZGVkdXBlLmhhcyhrZXkpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGRlZHVwZS5hZGQoa2V5KTtcclxuICAgICAgICAgICAgYWxsLnB1c2gob3B0aW9uKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBpZiAoZXZlbnQua2luZCA9PT0gJ2RpYWxvZycpIHtcclxuICAgICAgICAgICAgKGV2ZW50LmJ1dHRvbnMgfHwgW10pLmZvckVhY2gocHVzaFVuaXF1ZSk7XHJcbiAgICAgICAgICAgIGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCkuZm9yRWFjaChwdXNoVW5pcXVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAoZXZlbnQuY29udHJvbHMgfHwgW10pLmZvckVhY2gocHVzaFVuaXF1ZSk7XHJcbiAgICAgICAgICAgIGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCkuZm9yRWFjaChwdXNoVW5pcXVlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHNjb3JlID0gKG9wdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5vcm1hbGl6ZVRleHQob3B0LmNvbnRyb2xOYW1lIHx8IG9wdC50ZXh0IHx8ICcnKTtcclxuICAgICAgICAgICAgaWYgKHRva2VuID09PSAncmVtb3ZlJyB8fCB0b2tlbi5pbmNsdWRlcygncmVtb3ZlJykgfHwgdG9rZW4gPT09ICdkZWxldGUnIHx8IHRva2VuLmluY2x1ZGVzKCdkZWxldGUnKSkgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgICBpZiAodG9rZW4gPT09ICdjYW5jZWwnIHx8IHRva2VuLmluY2x1ZGVzKCdjYW5jZWwnKSkgcmV0dXJuIDA7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbiA9PT0gJ2Nsb3NlJyB8fCB0b2tlbi5pbmNsdWRlcygnY2xvc2UnKSkgcmV0dXJuIDE7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbiA9PT0gJ25vJykgcmV0dXJuIDI7XHJcbiAgICAgICAgICAgIGlmICh0b2tlbi5zdGFydHNXaXRoKCdtZXNzYWdlYmFyJykpIHJldHVybiAxMDtcclxuICAgICAgICAgICAgcmV0dXJuIDU7XHJcbiAgICAgICAgfTtcclxuICAgICAgICByZXR1cm4gYWxsLnNvcnQoKGEsIGIpID0+IHNjb3JlKGEpIC0gc2NvcmUoYikpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGZpbmRFdmVudE9wdGlvbkVsZW1lbnQoZXZlbnQsIG9wdGlvbikge1xyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkQ29udHJvbCA9IG5vcm1hbGl6ZVRleHQob3B0aW9uPy5jb250cm9sTmFtZSB8fCAnJyk7XHJcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRUZXh0ID0gbm9ybWFsaXplVGV4dChvcHRpb24/LnRleHQgfHwgJycpO1xyXG4gICAgICAgIGNvbnN0IGRpYWxvZ0J1dHRvbiA9IChldmVudC5idXR0b25zIHx8IFtdKS5maW5kKGJ0biA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ5Q29udHJvbCA9IG5vcm1hbGl6ZVRleHQoYnRuLmNvbnRyb2xOYW1lIHx8ICcnKTtcclxuICAgICAgICAgICAgY29uc3QgYnlUZXh0ID0gbm9ybWFsaXplVGV4dChidG4udGV4dCB8fCAnJyk7XHJcbiAgICAgICAgICAgIHJldHVybiAoZXhwZWN0ZWRDb250cm9sICYmIGJ5Q29udHJvbCA9PT0gZXhwZWN0ZWRDb250cm9sKSB8fCAoZXhwZWN0ZWRUZXh0ICYmIGJ5VGV4dCA9PT0gZXhwZWN0ZWRUZXh0KTtcclxuICAgICAgICB9KT8uZWxlbWVudCB8fCBudWxsO1xyXG4gICAgICAgIGlmIChkaWFsb2dCdXR0b24pIHJldHVybiBkaWFsb2dCdXR0b247XHJcblxyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VDb250cm9sID0gKGV2ZW50LmNvbnRyb2xzIHx8IFtdKS5maW5kKGN0cmwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBieUNvbnRyb2wgPSBub3JtYWxpemVUZXh0KGN0cmwuY29udHJvbE5hbWUgfHwgJycpO1xyXG4gICAgICAgICAgICBjb25zdCBieVRleHQgPSBub3JtYWxpemVUZXh0KGN0cmwudGV4dCB8fCAnJyk7XHJcbiAgICAgICAgICAgIHJldHVybiAoZXhwZWN0ZWRDb250cm9sICYmIGJ5Q29udHJvbCA9PT0gZXhwZWN0ZWRDb250cm9sKSB8fCAoZXhwZWN0ZWRUZXh0ICYmIGJ5VGV4dCA9PT0gZXhwZWN0ZWRUZXh0KTtcclxuICAgICAgICB9KT8uZWxlbWVudCB8fCBudWxsO1xyXG4gICAgICAgIGlmIChtZXNzYWdlQ29udHJvbCkgcmV0dXJuIG1lc3NhZ2VDb250cm9sO1xyXG5cclxuICAgICAgICByZXR1cm4gZmluZEdsb2JhbENsaWNrYWJsZShvcHRpb24/LmNvbnRyb2xOYW1lIHx8IG9wdGlvbj8udGV4dCB8fCAnJyk/LmVsZW1lbnQgfHwgbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiByZXF1ZXN0SW50ZXJydXB0aW9uRGVjaXNpb24oZXZlbnQpIHtcclxuICAgICAgICBjb25zdCByZXF1ZXN0SWQgPSBgaW50cl8ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygxNikuc2xpY2UoMiwgOCl9YDtcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLnBlbmRpbmdJbnRlcnJ1cHRpb25EZWNpc2lvbiA9IG51bGw7XHJcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IHRydWU7XHJcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxyXG4gICAgICAgICAgICBwcm9ncmVzczoge1xyXG4gICAgICAgICAgICAgICAgcGhhc2U6ICdwYXVzZWRGb3JJbnRlcnJ1cHRpb24nLFxyXG4gICAgICAgICAgICAgICAga2luZDogZXZlbnQua2luZCxcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHNob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCwgMTgwKSxcclxuICAgICAgICAgICAgICAgIHN0ZXBJbmRleDogZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCAnKicpO1xyXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0lOVEVSUlVQVElPTicsXHJcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcclxuICAgICAgICAgICAgICAgIHJlcXVlc3RJZCxcclxuICAgICAgICAgICAgICAgIHdvcmtmbG93SWQ6IGN1cnJlbnRXb3JrZmxvdz8uaWQgfHwgJycsXHJcbiAgICAgICAgICAgICAgICBzdGVwSW5kZXg6IGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleCxcclxuICAgICAgICAgICAgICAgIGtpbmQ6IGV2ZW50LmtpbmQsXHJcbiAgICAgICAgICAgICAgICB0ZXh0OiBzaG9ydGVuRm9yTG9nKGV2ZW50LnRleHQsIDYwMCksXHJcbiAgICAgICAgICAgICAgICBvcHRpb25zOiBidWlsZEludGVycnVwdGlvbk9wdGlvbnMoZXZlbnQpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCAnKicpO1xyXG5cclxuICAgICAgICB3aGlsZSAoIWV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRlY2lzaW9uID0gZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb247XHJcbiAgICAgICAgICAgIGlmIChkZWNpc2lvbiAmJiBkZWNpc2lvbi5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCkge1xyXG4gICAgICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb24gPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlY2lzaW9uO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOVEVSUlVQVElPTl9QT0xMX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBhcHBseUludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50LCBkZWNpc2lvbikge1xyXG4gICAgICAgIGNvbnN0IGFjdGlvblR5cGUgPSBkZWNpc2lvbj8uYWN0aW9uVHlwZSB8fCAnbm9uZSc7XHJcbiAgICAgICAgaWYgKGFjdGlvblR5cGUgPT09ICdzdG9wJykge1xyXG4gICAgICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgY2xpY2tlZE9wdGlvbiA9IG51bGw7XHJcbiAgICAgICAgbGV0IGNsaWNrZWRGb2xsb3d1cE9wdGlvbiA9IG51bGw7XHJcbiAgICAgICAgaWYgKGFjdGlvblR5cGUgPT09ICdjbGlja09wdGlvbicpIHtcclxuICAgICAgICAgICAgY29uc3Qgb3B0aW9uID0gZGVjaXNpb24/LnNlbGVjdGVkT3B0aW9uIHx8IHt9O1xyXG4gICAgICAgICAgICBjb25zdCBlbGVtZW50ID0gZmluZEV2ZW50T3B0aW9uRWxlbWVudChldmVudCwgb3B0aW9uKTtcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnQgJiYgdHlwZW9mIGVsZW1lbnQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGNsaWNrZWRPcHRpb24gPSBvcHRpb247XHJcbiAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdESUFMT0dfQUNUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBmb2xsb3d1cCA9IGRlY2lzaW9uPy5zZWxlY3RlZEZvbGxvd3VwT3B0aW9uIHx8IG51bGw7XHJcbiAgICAgICAgICAgICAgICBpZiAoZm9sbG93dXAgJiYgbm9ybWFsaXplVGV4dChmb2xsb3d1cC5jb250cm9sTmFtZSB8fCBmb2xsb3d1cC50ZXh0IHx8ICcnKSAhPT0gbm9ybWFsaXplVGV4dChvcHRpb24uY29udHJvbE5hbWUgfHwgb3B0aW9uLnRleHQgfHwgJycpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVmcmVzaEV2ZW50cyA9IGRldGVjdFVuZXhwZWN0ZWRFdmVudHMoKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmb2xsb3d1cEV2ZW50ID0gcmVmcmVzaEV2ZW50c1swXSB8fCBldmVudDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmb2xsb3d1cEVsZW1lbnQgPSBmaW5kRXZlbnRPcHRpb25FbGVtZW50KGZvbGxvd3VwRXZlbnQsIGZvbGxvd3VwKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sbG93dXBFbGVtZW50ICYmIHR5cGVvZiBmb2xsb3d1cEVsZW1lbnQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sbG93dXBFbGVtZW50LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsaWNrZWRGb2xsb3d1cE9wdGlvbiA9IGZvbGxvd3VwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdESUFMT0dfQUNUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBTZWxlY3RlZCBmb2xsb3ctdXAgb3B0aW9uIG5vdCBmb3VuZDogJHtmb2xsb3d1cC5jb250cm9sTmFtZSB8fCBmb2xsb3d1cC50ZXh0IHx8ICd1bmtub3duJ31gKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFNlbGVjdGVkIGludGVycnVwdGlvbiBvcHRpb24gbm90IGZvdW5kOiAke29wdGlvbi5jb250cm9sTmFtZSB8fCBvcHRpb24udGV4dCB8fCAndW5rbm93bid9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChkZWNpc2lvbj8uc2F2ZVJ1bGUgJiYgY2xpY2tlZE9wdGlvbikge1xyXG4gICAgICAgICAgICBjb25zdCBhY3Rpb25zID0gW2J1aWxkUnVsZUFjdGlvbkZyb21PcHRpb24oZXZlbnQsIGNsaWNrZWRPcHRpb24pXTtcclxuICAgICAgICAgICAgaWYgKGNsaWNrZWRGb2xsb3d1cE9wdGlvbikge1xyXG4gICAgICAgICAgICAgICAgYWN0aW9ucy5wdXNoKGJ1aWxkUnVsZUFjdGlvbkZyb21PcHRpb24oZXZlbnQsIGNsaWNrZWRGb2xsb3d1cE9wdGlvbikpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJlY29yZExlYXJuZWRSdWxlKGNyZWF0ZVJ1bGVGcm9tRXZlbnQoZXZlbnQsIGFjdGlvbnMsIGRlY2lzaW9uPy5vdXRjb21lIHx8ICduZXh0LXN0ZXAnLCBkZWNpc2lvbj8ubWF0Y2hNb2RlIHx8ICdjb250YWlucycpKTtcclxuICAgICAgICAgICAgc2VuZExvZygnc3VjY2VzcycsIGBMZWFybmVkICR7ZXZlbnQua2luZH0gaGFuZGxlcjogJHtjbGlja2VkT3B0aW9uLmNvbnRyb2xOYW1lIHx8IGNsaWNrZWRPcHRpb24udGV4dCB8fCAnYWN0aW9uJ30ke2NsaWNrZWRGb2xsb3d1cE9wdGlvbiA/ICcgLT4gZm9sbG93LXVwJyA6ICcnfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgb3V0Y29tZSA9IG5vcm1hbGl6ZUZsb3dPdXRjb21lKGRlY2lzaW9uPy5vdXRjb21lIHx8ICduZXh0LXN0ZXAnKTtcclxuICAgICAgICBpZiAob3V0Y29tZSA9PT0gJ3N0b3AnKSB7XHJcbiAgICAgICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG91dGNvbWUgPT09ICdjb250aW51ZS1sb29wJyB8fCBvdXRjb21lID09PSAnYnJlYWstbG9vcCcgfHwgb3V0Y29tZSA9PT0gJ3JlcGVhdC1sb29wJykge1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRmxvd1RyYW5zaXRpb25TdGFiaWxpdHkoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiBvdXRjb21lIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChldmVudD8ua2luZCA9PT0gJ2RpYWxvZycpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvckZsb3dUcmFuc2l0aW9uU3RhYmlsaXR5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlVW5leHBlY3RlZEV2ZW50cyhsZWFybmluZ01vZGUpIHtcclxuICAgICAgICBjb25zdCBtYXhEZXB0aCA9IDY7XHJcbiAgICAgICAgZm9yIChsZXQgZGVwdGggPSAwOyBkZXB0aCA8IG1heERlcHRoOyBkZXB0aCsrKSB7XHJcbiAgICAgICAgICAgIGxldCBldmVudHMgPSBkZXRlY3RVbmV4cGVjdGVkRXZlbnRzKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBubyBldmVudHMgZm91bmQgb24gdGhlIGZpcnN0IGNoZWNrLCBwb2xsIGJyaWVmbHkgdG8gY2F0Y2hcclxuICAgICAgICAgICAgLy8gZGlhbG9ncyB0aGF0IGFyZSBzdGlsbCByZW5kZXJpbmcuICBEMzY1IGNvbmZpcm1hdGlvbiBkaWFsb2dzXHJcbiAgICAgICAgICAgIC8vIChlLmcuIGRlbGV0ZSByZWNvcmQpIHJlbmRlciBhc3luY2hyb25vdXNseSBhbmQgbWF5IG5vdCB0cmlnZ2VyXHJcbiAgICAgICAgICAgIC8vIGFueSBsb2FkaW5nIGluZGljYXRvciwgc28gd2UgYWx3YXlzIHBvbGwgYSBmZXcgdGltZXMgcmF0aGVyXHJcbiAgICAgICAgICAgIC8vIHRoYW4gZ2F0aW5nIG9uIGlzRDM2NUxvYWRpbmcoKS4gIElmIEQzNjUgSVMgbG9hZGluZyB3ZSBleHRlbmRcclxuICAgICAgICAgICAgLy8gdGhlIHdpbmRvdyB0byBnaXZlIGhlYXZpZXIgc2VydmVyIG9wZXJhdGlvbnMgdGltZSB0byBmaW5pc2guXHJcbiAgICAgICAgICAgIGlmICghZXZlbnRzLmxlbmd0aCAmJiBkZXB0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmFzZVBvbGxBdHRlbXB0cyA9IDU7ICAgICAgICAvLyB+NjAwIG1zIG1pbmltdW0gd2luZG93XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsb2FkaW5nID0gaXNEMzY1TG9hZGluZygpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcG9sbEF0dGVtcHRzID0gbG9hZGluZyA/IGJhc2VQb2xsQXR0ZW1wdHMgKiAyIDogYmFzZVBvbGxBdHRlbXB0cztcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IHAgPSAwOyBwIDwgcG9sbEF0dGVtcHRzOyBwKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdGTE9XX1NUQUJJTElUWV9QT0xMX0RFTEFZJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzID0gZGV0ZWN0VW5leHBlY3RlZEV2ZW50cygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudHMubGVuZ3RoKSBicmVhazsgICAgICAvLyBkaWFsb2cgYXBwZWFyZWRcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICghZXZlbnRzLmxlbmd0aCkgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoIWV2ZW50cy5sZW5ndGgpIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XHJcblxyXG4gICAgICAgICAgICBjb25zdCBldmVudCA9IGV2ZW50c1swXTtcclxuXHJcbiAgICAgICAgICAgIGlmIChpc0Jlbmlnbk1lc3NhZ2VCYXJFdmVudChldmVudCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGBtZXNzYWdlQmFyfCR7ZXZlbnQudGVtcGxhdGVUZXh0fWA7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmhhcyhrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBJZ25vcmluZyBiZW5pZ24gbWVzc2FnZSBiYXI6ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0LCAxMjApfWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuYWRkKGtleSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gLS0tIFRyeSBzYXZlZCBoYW5kbGVycyBmaXJzdCAod29ya3MgaW4gQk9USCBtb2RlcykgLS0tXHJcbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZXIgPSBmaW5kTWF0Y2hpbmdIYW5kbGVyKGV2ZW50KTtcclxuICAgICAgICAgICAgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5tb2RlICE9PSAnYWx3YXlzQXNrJykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlZCA9IGF3YWl0IGFwcGx5SGFuZGxlcihldmVudCwgaGFuZGxlcik7XHJcbiAgICAgICAgICAgICAgICBpZiAoaGFuZGxlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgQXBwbGllZCBsZWFybmVkIGhhbmRsZXIgZm9yICR7ZXZlbnQua2luZH06ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGVyT3V0Y29tZSA9IG5vcm1hbGl6ZUZsb3dPdXRjb21lKGhhbmRsZXI/Lm91dGNvbWUgfHwgJ25leHQtc3RlcCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChoYW5kbGVyT3V0Y29tZSA9PT0gJ3N0b3AnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhbmRsZXJPdXRjb21lID09PSAnY29udGludWUtbG9vcCcgfHwgaGFuZGxlck91dGNvbWUgPT09ICdicmVhay1sb29wJyB8fCBoYW5kbGVyT3V0Y29tZSA9PT0gJ3JlcGVhdC1sb29wJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRmxvd1RyYW5zaXRpb25TdGFiaWxpdHkoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiBoYW5kbGVyT3V0Y29tZSB9O1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAoZXZlbnQua2luZCA9PT0gJ2RpYWxvZycpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvckZsb3dUcmFuc2l0aW9uU3RhYmlsaXR5KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIE1hcmsgbWVzc2FnZSBiYXIgYXMgYWNrbm93bGVkZ2VkIHNvIGl0IGRvZXNuJ3QgcmUtdHJpZ2dlciBpZlxyXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZSBiYXIgcGVyc2lzdHMgYWZ0ZXIgdGhlIGhhbmRsZXIgcmFuIChlLmcuIGNsb3NlIGJ1dHRvbiBoaWRkZW4pLlxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuYWRkKGBtZXNzYWdlQmFyfCR7ZXZlbnQudGVtcGxhdGVUZXh0fWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gLS0tIE5vbi1ibG9ja2luZyBtZXNzYWdlIGJhciBoYW5kbGluZyAtLS1cclxuICAgICAgICAgICAgLy8gTWVzc2FnZSBiYXJzIGRvbid0IGJsb2NrIHRoZSBVSS4gSW4gbGVhcm5pbmcgbW9kZSB3ZSBwYXVzZSBPTkNFIHRvXHJcbiAgICAgICAgICAgIC8vIGxldCB0aGUgdXNlciBkZWNpZGUsIHRoZW4gYWNrbm93bGVkZ2UgdGhlIGtleSBzbyBpdCBkb2Vzbid0IHJlcGVhdC5cclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtpbmQgPT09ICdtZXNzYWdlQmFyJykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGxlYXJuaW5nTW9kZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTGVhcm5pbmcgbW9kZTogbWVzc2FnZSBiYXIgZGV0ZWN0ZWQsIGRlY2lzaW9uIHJlcXVpcmVkOiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCl9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVjaXNpb24gPSBhd2FpdCByZXF1ZXN0SW50ZXJydXB0aW9uRGVjaXNpb24oZXZlbnQpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFwcGx5SW50ZXJydXB0aW9uRGVjaXNpb24oZXZlbnQsIGRlY2lzaW9uKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgJiYgcmVzdWx0LnNpZ25hbCAhPT0gJ25vbmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmFkZChgbWVzc2FnZUJhcnwke2V2ZW50LnRlbXBsYXRlVGV4dH1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIE5vbi1sZWFybmluZyBtb2RlOiBqdXN0IGxvZyBvbmNlXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YDtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXVuaGFuZGxlZFVuZXhwZWN0ZWRFdmVudEtleXMuaGFzKGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdW5oYW5kbGVkVW5leHBlY3RlZEV2ZW50S2V5cy5hZGQoa2V5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBNZXNzYWdlIGJhciBkZXRlY3RlZCB3aXRoIG5vIGhhbmRsZXI6ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBNYXJrIGFzIGFja25vd2xlZGdlZCBzbyBpdCBkb2Vzbid0IHJlLXRyaWdnZXIgb24gc3Vic2VxdWVudCBzdGVwc1xyXG4gICAgICAgICAgICAgICAgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuYWRkKGBtZXNzYWdlQmFyfCR7ZXZlbnQudGVtcGxhdGVUZXh0fWApO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIC0tLSBCbG9ja2luZyBkaWFsb2cgaGFuZGxpbmcgLS0tXHJcbiAgICAgICAgICAgIGlmIChsZWFybmluZ01vZGUpIHtcclxuICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTGVhcm5pbmcgbW9kZTogZGlhbG9nIHJlcXVpcmVzIGRlY2lzaW9uOiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCl9YCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkZWNpc2lvbiA9IGF3YWl0IHJlcXVlc3RJbnRlcnJ1cHRpb25EZWNpc2lvbihldmVudCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseUludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50LCBkZWNpc2lvbik7XHJcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgJiYgcmVzdWx0LnNpZ25hbCAhPT0gJ25vbmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBOb24tbGVhcm5pbmcgbW9kZSB3aXRoIG5vIGhhbmRsZXI6IGxvZyBvbmNlIGFuZCByZXR1cm5cclxuICAgICAgICAgICAgY29uc3Qga2V5ID0gYCR7ZXZlbnQua2luZH18JHtldmVudC50ZW1wbGF0ZVRleHR9YDtcclxuICAgICAgICAgICAgaWYgKCF1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmhhcyhrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICB1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmFkZChrZXkpO1xyXG4gICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBVbmV4cGVjdGVkICR7ZXZlbnQua2luZH0gZGV0ZWN0ZWQgd2l0aCBubyBoYW5kbGVyOiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCl9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcclxuICAgIH1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVXb3JrZmxvdyh3b3JrZmxvdywgZGF0YSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICAvLyBDbGVhciBhbnkgc3RhbGUgcGVuZGluZyBuYXZpZ2F0aW9uIHN0YXRlIGJlZm9yZSBzdGFydGluZyBhIG5ldyBydW5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBzZXNzaW9uU3RvcmFnZS5yZW1vdmVJdGVtKCdkMzY1X3BlbmRpbmdfd29ya2Zsb3cnKTtcclxuICAgICAgICAgICAgaWYgKHdvcmtmbG93Py5pZCkge1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9hY3RpdmVfd29ya2Zsb3dfaWQnLCB3b3JrZmxvdy5pZCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIC8vIElnbm9yZSBzZXNzaW9uU3RvcmFnZSBlcnJvcnMgKGUuZy4sIGluIHJlc3RyaWN0ZWQgY29udGV4dHMpXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFN0YXJ0aW5nIHdvcmtmbG93OiAke3dvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB8fCAndW5uYW1lZCd9YCk7XHJcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogeyBwaGFzZTogJ3dvcmtmbG93U3RhcnQnLCB3b3JrZmxvdzogd29ya2Zsb3c/Lm5hbWUgfHwgd29ya2Zsb3c/LmlkIH0gfSwgJyonKTtcclxuICAgICAgICAvLyBSZXNldCBleGVjdXRpb24gY29udHJvbFxyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCA9IGZhbHNlO1xyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0ludGVycnVwdGlvbkRlY2lzaW9uID0gbnVsbDtcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnMgPSB3b3JrZmxvdy5ydW5PcHRpb25zIHx8IHsgc2tpcFJvd3M6IDAsIGxpbWl0Um93czogMCwgZHJ5UnVuOiBmYWxzZSwgbGVhcm5pbmdNb2RlOiBmYWxzZSwgcnVuVW50aWxJbnRlcmNlcHRpb246IGZhbHNlIH07XHJcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQgPSB3b3JrZmxvdz8uX29yaWdpbmFsU3RhcnRJbmRleCB8fCAwO1xyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleCA9IGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0O1xyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucHJvY2Vzc2VkUm93cyA9IDA7XHJcbiAgICAgICAgdW5oYW5kbGVkVW5leHBlY3RlZEV2ZW50S2V5cy5jbGVhcigpO1xyXG4gICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmNsZWFyKCk7XHJcbiAgICAgICAgY3VycmVudFdvcmtmbG93ID0gd29ya2Zsb3c7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWx3YXlzIHJlZnJlc2ggb3JpZ2luYWwtd29ya2Zsb3cgcG9pbnRlciB0byBhdm9pZCBzdGFsZSByZXN1bWUgc3RhdGVcclxuICAgICAgICAvLyBmcm9tIGEgcHJldmlvdXNseSBleGVjdXRlZCB3b3JrZmxvdyBpbiB0aGUgc2FtZSBwYWdlIGNvbnRleHQuXHJcbiAgICAgICAgd2luZG93LmQzNjVPcmlnaW5hbFdvcmtmbG93ID0gd29ya2Zsb3c/Ll9vcmlnaW5hbFdvcmtmbG93IHx8IHdvcmtmbG93O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gd29ya2Zsb3c/LnNldHRpbmdzIHx8IHt9O1xyXG4gICAgICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncztcclxuICAgICAgICAvLyBFeHBvc2UgY3VycmVudCB3b3JrZmxvdyBhbmQgZXhlY3V0aW9uIGNvbnRyb2wgdG8gaW5qZWN0ZWQgYWN0aW9uIG1vZHVsZXNcclxuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyA9IGN1cnJlbnRXb3JrZmxvdztcclxuICAgICAgICB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2wgPSBleGVjdXRpb25Db250cm9sO1xyXG4gICAgICAgIGNvbnN0IHN0ZXBzID0gd29ya2Zsb3cuc3RlcHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gR2V0IGRhdGEgZnJvbSBuZXcgZGF0YVNvdXJjZXMgc3RydWN0dXJlIG9yIGxlZ2FjeSBkYXRhU291cmNlXHJcbiAgICAgICAgbGV0IHByaW1hcnlEYXRhID0gW107XHJcbiAgICAgICAgbGV0IGRldGFpbFNvdXJjZXMgPSB7fTtcclxuICAgICAgICBsZXQgcmVsYXRpb25zaGlwcyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh3b3JrZmxvdy5kYXRhU291cmNlcykge1xyXG4gICAgICAgICAgICBwcmltYXJ5RGF0YSA9IHdvcmtmbG93LmRhdGFTb3VyY2VzLnByaW1hcnk/LmRhdGEgfHwgW107XHJcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcHMgPSB3b3JrZmxvdy5kYXRhU291cmNlcy5yZWxhdGlvbnNoaXBzIHx8IFtdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gSW5kZXggZGV0YWlsIGRhdGEgc291cmNlcyBieSBJRFxyXG4gICAgICAgICAgICAod29ya2Zsb3cuZGF0YVNvdXJjZXMuZGV0YWlscyB8fCBbXSkuZm9yRWFjaChkZXRhaWwgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGRldGFpbC5kYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsU291cmNlc1tkZXRhaWwuaWRdID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBkZXRhaWwuZGF0YSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZGV0YWlsLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkczogZGV0YWlsLmZpZWxkc1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZGF0YSkge1xyXG4gICAgICAgICAgICAvLyBMZWdhY3kgZm9ybWF0XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gQXJyYXkuaXNBcnJheShkYXRhKSA/IGRhdGEgOiBbZGF0YV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElmIG5vIGRhdGEsIHVzZSBhIHNpbmdsZSBlbXB0eSByb3cgdG8gcnVuIHN0ZXBzIG9uY2VcclxuICAgICAgICBpZiAocHJpbWFyeURhdGEubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gW3t9XTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEV4ZWN1dGUgd29ya2Zsb3cgd2l0aCBsb29wIHN1cHBvcnRcclxuICAgICAgICBhd2FpdCBleGVjdXRlU3RlcHNXaXRoTG9vcHMoc3RlcHMsIHByaW1hcnlEYXRhLCBkZXRhaWxTb3VyY2VzLCByZWxhdGlvbnNoaXBzLCB3b3JrZmxvdy5zZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIGNvbnN0IHByb2Nlc3NlZFJvd3MgPSBleGVjdXRpb25Db250cm9sLnByb2Nlc3NlZFJvd3MgPiAwXHJcbiAgICAgICAgICAgID8gZXhlY3V0aW9uQ29udHJvbC5wcm9jZXNzZWRSb3dzXHJcbiAgICAgICAgICAgIDogcHJpbWFyeURhdGEubGVuZ3RoO1xyXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgV29ya2Zsb3cgY29tcGxldGU6IHByb2Nlc3NlZCAke3Byb2Nlc3NlZFJvd3N9IHJvd3NgKTtcclxuICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19DT01QTEVURScsXHJcbiAgICAgICAgICAgIHJlc3VsdDogeyBwcm9jZXNzZWQ6IHByb2Nlc3NlZFJvd3MgfVxyXG4gICAgICAgIH0sICcqJyk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIC8vIE5hdmlnYXRpb24gaW50ZXJydXB0cyBhcmUgbm90IGVycm9ycyAtIHRoZSB3b3JrZmxvdyB3aWxsIHJlc3VtZSBhZnRlciBwYWdlIGxvYWRcclxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCAnV29ya2Zsb3cgcGF1c2VkIGZvciBuYXZpZ2F0aW9uIC0gd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkcycpO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIERvbid0IHJlcG9ydCBhcyBlcnJvciBvciBjb21wbGV0ZVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWVycm9yIHx8ICFlcnJvci5fcmVwb3J0ZWQpIHtcclxuICAgICAgICAgICAgc2VuZExvZygnZXJyb3InLCBgV29ya2Zsb3cgZXJyb3I6ICR7ZXJyb3I/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycm9yKX1gKTtcclxuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0VSUk9SJyxcclxuICAgICAgICAgICAgICAgIGVycm9yOiBlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpLFxyXG4gICAgICAgICAgICAgICAgc3RhY2s6IGVycm9yPy5zdGFja1xyXG4gICAgICAgICAgICB9LCAnKicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0U3RlcEZha2VyUmFuZG9tSXRlbShsaXN0KSB7XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkobGlzdCkgfHwgIWxpc3QubGVuZ3RoKSByZXR1cm4gJyc7XHJcbiAgICByZXR1cm4gbGlzdFtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBsaXN0Lmxlbmd0aCldO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5lcmF0ZVN0ZXBGYWtlclZhbHVlKGdlbmVyYXRvck5hbWUpIHtcclxuICAgIGNvbnN0IGZpcnN0TmFtZXMgPSBbJ0phbWVzJywgJ01hcnknLCAnSm9obicsICdQYXRyaWNpYScsICdSb2JlcnQnLCAnSmVubmlmZXInLCAnTWljaGFlbCcsICdMaW5kYScsICdEYXZpZCcsICdFbGl6YWJldGgnLCAnV2lsbGlhbScsICdCYXJiYXJhJywgJ1JpY2hhcmQnLCAnU3VzYW4nLCAnSm9zZXBoJywgJ0plc3NpY2EnXTtcclxuICAgIGNvbnN0IGxhc3ROYW1lcyA9IFsnU21pdGgnLCAnSm9obnNvbicsICdXaWxsaWFtcycsICdCcm93bicsICdKb25lcycsICdHYXJjaWEnLCAnTWlsbGVyJywgJ0RhdmlzJywgJ01hcnRpbmV6JywgJ0xvcGV6JywgJ0dvbnphbGV6JywgJ1dpbHNvbicsICdBbmRlcnNvbicsICdUaG9tYXMnLCAnVGF5bG9yJywgJ01vb3JlJ107XHJcbiAgICBjb25zdCB3b3JkcyA9IFsnYWxwaGEnLCAnYnJhdm8nLCAnY2hhcmxpZScsICdkZWx0YScsICdlY2hvJywgJ2ZveHRyb3QnLCAnYXBleCcsICdib2x0JywgJ2NyZXN0JywgJ2Rhd24nLCAnZW1iZXInLCAnZmxpbnQnXTtcclxuXHJcbiAgICBjb25zdCBuYW1lID0gU3RyaW5nKGdlbmVyYXRvck5hbWUgfHwgJ0ZpcnN0IE5hbWUnKTtcclxuICAgIGlmIChuYW1lID09PSAnRmlyc3QgTmFtZScpIHJldHVybiBnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGZpcnN0TmFtZXMpO1xyXG4gICAgaWYgKG5hbWUgPT09ICdMYXN0IE5hbWUnKSByZXR1cm4gZ2V0U3RlcEZha2VyUmFuZG9tSXRlbShsYXN0TmFtZXMpO1xyXG4gICAgaWYgKG5hbWUgPT09ICdGdWxsIE5hbWUnKSByZXR1cm4gYCR7Z2V0U3RlcEZha2VyUmFuZG9tSXRlbShmaXJzdE5hbWVzKX0gJHtnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGxhc3ROYW1lcyl9YDtcclxuICAgIGlmIChuYW1lID09PSAnRW1haWwnKSB7XHJcbiAgICAgICAgY29uc3QgZmlyc3QgPSBnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGZpcnN0TmFtZXMpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgY29uc3QgbGFzdCA9IGdldFN0ZXBGYWtlclJhbmRvbUl0ZW0obGFzdE5hbWVzKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIHJldHVybiBgJHtmaXJzdH0uJHtsYXN0fUBleGFtcGxlLmNvbWA7XHJcbiAgICB9XHJcbiAgICBpZiAobmFtZSA9PT0gJ051bWJlcicpIHJldHVybiBTdHJpbmcoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDApKTtcclxuICAgIGlmIChuYW1lID09PSAnRGVjaW1hbCcpIHJldHVybiAoTWF0aC5yYW5kb20oKSAqIDEwMDAwKS50b0ZpeGVkKDIpO1xyXG4gICAgaWYgKG5hbWUgPT09ICdEYXRlJykge1xyXG4gICAgICAgIGNvbnN0IG9mZnNldERheXMgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAzNjUgKiAzKTtcclxuICAgICAgICBjb25zdCBkID0gbmV3IERhdGUoRGF0ZS5ub3coKSAtIG9mZnNldERheXMgKiAyNCAqIDYwICogNjAgKiAxMDAwKTtcclxuICAgICAgICByZXR1cm4gZC50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcclxuICAgIH1cclxuICAgIGlmIChuYW1lID09PSAnVVVJRCcpIHtcclxuICAgICAgICByZXR1cm4gJ3h4eHh4eHh4LXh4eHgtNHh4eC15eHh4LXh4eHh4eHh4eHh4eCcucmVwbGFjZSgvW3h5XS9nLCAoYykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCByID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTYpO1xyXG4gICAgICAgICAgICBjb25zdCB2ID0gYyA9PT0gJ3gnID8gciA6IChyICYgMHgzIHwgMHg4KTtcclxuICAgICAgICAgICAgcmV0dXJuIHYudG9TdHJpbmcoMTYpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgaWYgKG5hbWUgPT09ICdCb29sZWFuJykgcmV0dXJuIE1hdGgucmFuZG9tKCkgPCAwLjUgPyAndHJ1ZScgOiAnZmFsc2UnO1xyXG4gICAgaWYgKG5hbWUgPT09ICdXb3JkJykgcmV0dXJuIGdldFN0ZXBGYWtlclJhbmRvbUl0ZW0od29yZHMpO1xyXG4gICAgaWYgKG5hbWUgPT09ICdMb3JlbSBTZW50ZW5jZScpIHtcclxuICAgICAgICBjb25zdCBwaWNrZWQgPSBbLi4ud29yZHNdLnNvcnQoKCkgPT4gTWF0aC5yYW5kb20oKSAtIDAuNSkuc2xpY2UoMCwgNSk7XHJcbiAgICAgICAgY29uc3Qgc2VudGVuY2UgPSBwaWNrZWQuam9pbignICcpO1xyXG4gICAgICAgIHJldHVybiBzZW50ZW5jZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHNlbnRlbmNlLnNsaWNlKDEpO1xyXG4gICAgfVxyXG4gICAgaWYgKG5hbWUgPT09ICdTZXF1ZW50aWFsJykge1xyXG4gICAgICAgIHdpbmRvdy5fX2QzNjVTdGVwRmFrZXJTZXEgPSAod2luZG93Ll9fZDM2NVN0ZXBGYWtlclNlcSB8fCAwKSArIDE7XHJcbiAgICAgICAgcmV0dXJuIFN0cmluZyh3aW5kb3cuX19kMzY1U3RlcEZha2VyU2VxKTtcclxuICAgIH1cclxuICAgIHJldHVybiBnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGZpcnN0TmFtZXMpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlU3RlcFZhbHVlKHN0ZXAsIGN1cnJlbnRSb3cpIHtcclxuICAgIGNvbnN0IHNvdXJjZSA9IHN0ZXA/LnZhbHVlU291cmNlIHx8IChzdGVwPy5maWVsZE1hcHBpbmcgPyAnZGF0YScgOiAnc3RhdGljJyk7XHJcblxyXG4gICAgaWYgKHNvdXJjZSA9PT0gJ2NsaXBib2FyZCcpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpZiAoIW5hdmlnYXRvci5jbGlwYm9hcmQ/LnJlYWRUZXh0KSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaXBib2FyZCBBUEkgbm90IGF2YWlsYWJsZScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLnJlYWRUZXh0KCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0ZXh0ID8/ICcnO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYENsaXBib2FyZCByZWFkIGZhaWxlZDogJHtlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpfWApO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaXBib2FyZCByZWFkIGZhaWxlZCcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoc291cmNlID09PSAnZGF0YScpIHtcclxuICAgICAgICBjb25zdCByb3cgPSBjdXJyZW50Um93IHx8IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwge307XHJcbiAgICAgICAgY29uc3QgZmllbGQgPSBzdGVwPy5maWVsZE1hcHBpbmcgfHwgJyc7XHJcbiAgICAgICAgaWYgKCFmaWVsZCkgcmV0dXJuICcnO1xyXG4gICAgICAgIGNvbnN0IHZhbHVlID0gcm93W2ZpZWxkXTtcclxuICAgICAgICByZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoc291cmNlID09PSAnZmFrZXInKSB7XHJcbiAgICAgICAgcmV0dXJuIGdlbmVyYXRlU3RlcEZha2VyVmFsdWUoc3RlcD8uZmFrZXJHZW5lcmF0b3IgfHwgJ0ZpcnN0IE5hbWUnKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoc291cmNlID09PSAncmFuZG9tLWNvbnN0YW50Jykge1xyXG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBTdHJpbmcoc3RlcD8ucmFuZG9tVmFsdWVzIHx8ICcnKVxyXG4gICAgICAgICAgICAuc3BsaXQoJywnKVxyXG4gICAgICAgICAgICAubWFwKCh2YWx1ZSkgPT4gdmFsdWUudHJpbSgpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgICAgIGlmICghb3B0aW9ucy5sZW5ndGgpIHJldHVybiAnJztcclxuICAgICAgICByZXR1cm4gb3B0aW9uc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBvcHRpb25zLmxlbmd0aCldO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBzdGVwPy52YWx1ZSA/PyAnJztcclxufVxyXG5cclxuLy8gRXhlY3V0ZSBhIHNpbmdsZSBzdGVwIChtYXBzIHN0ZXAudHlwZSB0byBhY3Rpb24gZnVuY3Rpb25zKVxyXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlU2luZ2xlU3RlcChzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnRSb3csIGRldGFpbFNvdXJjZXMsIHNldHRpbmdzLCBkcnlSdW4sIGxlYXJuaW5nTW9kZSkge1xyXG4gICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4ID0gdHlwZW9mIHN0ZXAuX2Fic29sdXRlSW5kZXggPT09ICdudW1iZXInXHJcbiAgICAgICAgPyBzdGVwLl9hYnNvbHV0ZUluZGV4XHJcbiAgICAgICAgOiAoZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQgfHwgMCkgKyBzdGVwSW5kZXg7XHJcbiAgICBjb25zdCBzdGVwTGFiZWwgPSBzdGVwLmRpc3BsYXlUZXh0IHx8IHN0ZXAuY29udHJvbE5hbWUgfHwgc3RlcC50eXBlIHx8IGBzdGVwICR7c3RlcEluZGV4fWA7XHJcbiAgICAvLyBDb21wdXRlIGFic29sdXRlIHN0ZXAgaW5kZXggKGFscmVhZHkgc3RvcmVkIG9uIGV4ZWN1dGlvbkNvbnRyb2wpXHJcbiAgICBjb25zdCBhYnNvbHV0ZVN0ZXBJbmRleCA9IGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleDtcclxuICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxyXG4gICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcFN0YXJ0Jywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XHJcbiAgICB9LCAnKicpO1xyXG4gICAgbGV0IHdhaXRUYXJnZXQgPSAnJztcclxuICAgIGxldCBzaG91bGRXYWl0QmVmb3JlID0gZmFsc2U7XHJcbiAgICBsZXQgc2hvdWxkV2FpdEFmdGVyID0gZmFsc2U7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIC8vIE5vcm1hbGl6ZSBzdGVwIHR5cGUgKGFsbG93IGJvdGggY2FtZWxDYXNlIGFuZCBkYXNoLXNlcGFyYXRlZCB0eXBlcylcclxuICAgICAgICBjb25zdCBzdGVwVHlwZSA9IChzdGVwLnR5cGUgfHwgJycpLnJlcGxhY2UoLy0oW2Etel0pL2csIChfLCBjKSA9PiBjLnRvVXBwZXJDYXNlKCkpO1xyXG4gICAgICAgIGxvZ1N0ZXAoYFN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9OiAke3N0ZXBUeXBlfSAtPiAke3N0ZXBMYWJlbH1gKTtcclxuXHJcbiAgICAgICAgLy8gSW4gbGVhcm5pbmcgbW9kZTpcclxuICAgICAgICAvLyAxLiBDaGVjayBmb3IgdW5leHBlY3RlZCBldmVudHMgKGRpYWxvZ3MvbWVzc2FnZXMpIGZyb20gdGhlIHByZXZpb3VzIHN0ZXAuXHJcbiAgICAgICAgLy8gICAgSWYgb25lIGlzIGZvdW5kIHRoZSB1c2VyIGlzIHBhdXNlZCB0byBoYW5kbGUgaXQsIHNvIHdlIHNraXAgdGhlXHJcbiAgICAgICAgLy8gICAgc2VwYXJhdGUgY29uZmlybWF0aW9uIHBhdXNlIHRvIGF2b2lkIGEgZG91YmxlLXBhdXNlLlxyXG4gICAgICAgIC8vIDIuIElmIG5vIGludGVycnVwdGlvbiB3YXMgZm91bmQsIHBhdXNlIGZvciBzdGVwIGNvbmZpcm1hdGlvbi5cclxuICAgICAgICBjb25zdCBydW5VbnRpbEludGVyY2VwdGlvbiA9ICEhZXhlY3V0aW9uQ29udHJvbC5ydW5PcHRpb25zPy5ydW5VbnRpbEludGVyY2VwdGlvbjtcclxuICAgICAgICBpZiAobGVhcm5pbmdNb2RlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGludGVycnVwdGlvbiA9IGF3YWl0IGhhbmRsZVVuZXhwZWN0ZWRFdmVudHModHJ1ZSk7XHJcbiAgICAgICAgICAgIGlmIChpbnRlcnJ1cHRpb24/LnNpZ25hbCAmJiBpbnRlcnJ1cHRpb24uc2lnbmFsICE9PSAnbm9uZScpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcnJ1cHRpb247XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIE9ubHkgcGF1c2UgZm9yIGNvbmZpcm1hdGlvbiBpZiBoYW5kbGVVbmV4cGVjdGVkRXZlbnRzIGRpZG4ndFxyXG4gICAgICAgICAgICAvLyBhbHJlYWR5IHBhdXNlIChpLmUuIHRoZXJlIHdlcmUgbm8gZXZlbnRzIHRvIGhhbmRsZSkuXHJcbiAgICAgICAgICAgIGlmICghcnVuVW50aWxJbnRlcmNlcHRpb24pIHtcclxuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgTGVhcm5pbmcgbW9kZTogY29uZmlybSBzdGVwICR7YWJzb2x1dGVTdGVwSW5kZXggKyAxfSAoJHtzdGVwTGFiZWx9KS4gUmVzdW1lIHRvIGNvbnRpbnVlLmApO1xyXG4gICAgICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcclxuICAgICAgICAgICAgICAgICAgICBwcm9ncmVzczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwaGFzZTogJ3BhdXNlZEZvckNvbmZpcm1hdGlvbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0ZXBOYW1lOiBzdGVwTGFiZWwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXhcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LCAnKicpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlc3BlY3QgZHJ5IHJ1biBtb2RlXHJcbiAgICAgICAgaWYgKGRyeVJ1bikge1xyXG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYERyeSBydW4gLSBza2lwcGluZyBhY3Rpb246ICR7c3RlcC50eXBlfSAke3N0ZXAuY29udHJvbE5hbWUgfHwgJyd9YCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXHJcbiAgICAgICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBEb25lJywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XHJcbiAgICAgICAgICAgIH0sICcqJyk7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgcmVzb2x2ZWRWYWx1ZSA9IG51bGw7XHJcbiAgICAgICAgaWYgKFsnaW5wdXQnLCAnc2VsZWN0JywgJ2xvb2t1cFNlbGVjdCcsICdncmlkSW5wdXQnLCAnZmlsdGVyJywgJ3F1ZXJ5RmlsdGVyJ10uaW5jbHVkZXMoc3RlcFR5cGUpKSB7XHJcbiAgICAgICAgICAgIHJlc29sdmVkVmFsdWUgPSBhd2FpdCByZXNvbHZlU3RlcFZhbHVlKHN0ZXAsIGN1cnJlbnRSb3cpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgd2FpdFRhcmdldCA9IHN0ZXAud2FpdFRhcmdldENvbnRyb2xOYW1lIHx8IHN0ZXAuY29udHJvbE5hbWUgfHwgJyc7XHJcbiAgICAgICAgc2hvdWxkV2FpdEJlZm9yZSA9ICEhc3RlcC53YWl0VW50aWxWaXNpYmxlO1xyXG4gICAgICAgIHNob3VsZFdhaXRBZnRlciA9ICEhc3RlcC53YWl0VW50aWxIaWRkZW47XHJcblxyXG4gICAgICAgIGlmICgoc2hvdWxkV2FpdEJlZm9yZSB8fCBzaG91bGRXYWl0QWZ0ZXIpICYmICF3YWl0VGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgV2FpdCBvcHRpb24gc2V0IGJ1dCBubyBjb250cm9sIG5hbWUgb24gc3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX1gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChzaG91bGRXYWl0QmVmb3JlICYmIHdhaXRUYXJnZXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICd2aXNpYmxlJywgbnVsbCwgNTAwMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHN0ZXBUeXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NsaWNrJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGNsaWNrRWxlbWVudChzdGVwLmNvbnRyb2xOYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnaW5wdXQnOlxyXG4gICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlLCBzdGVwLmZpZWxkVHlwZSwgc3RlcC5jb21ib1NlbGVjdE1vZGUgfHwgJycpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdsb29rdXBTZWxlY3QnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0TG9va3VwU2VsZWN0VmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5jb21ib1NlbGVjdE1vZGUgfHwgJycpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdjaGVja2JveCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRDaGVja2JveFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIGNvZXJjZUJvb2xlYW4oc3RlcC52YWx1ZSkpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdncmlkSW5wdXQnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0R3JpZENlbGxWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlLCBzdGVwLmZpZWxkVHlwZSwgISFzdGVwLndhaXRGb3JWYWxpZGF0aW9uLCBzdGVwLmNvbWJvU2VsZWN0TW9kZSB8fCAnJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2ZpbHRlcic6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBhcHBseUdyaWRGaWx0ZXIoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWx0ZXJNZXRob2QgfHwgJ2lzIGV4YWN0bHknLCBzdGVwLmNvbWJvU2VsZWN0TW9kZSB8fCAnJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAncXVlcnlGaWx0ZXInOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgY29uZmlndXJlUXVlcnlGaWx0ZXIoc3RlcC50YWJsZU5hbWUsIHN0ZXAuZmllbGROYW1lLCByZXNvbHZlZFZhbHVlLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2F2ZWRRdWVyeTogc3RlcC5zYXZlZFF1ZXJ5LFxyXG4gICAgICAgICAgICAgICAgICAgIGNsb3NlRGlhbG9nQWZ0ZXI6IHN0ZXAuY2xvc2VEaWFsb2dBZnRlcixcclxuICAgICAgICAgICAgICAgICAgICBjb21ib1NlbGVjdE1vZGU6IHN0ZXAuY29tYm9TZWxlY3RNb2RlIHx8ICcnXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnd2FpdCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcChOdW1iZXIoc3RlcC5kdXJhdGlvbikgfHwgZ2V0VGltaW5ncygpLkRFRkFVTFRfV0FJVF9TVEVQX0RFTEFZKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnd2FpdFVudGlsJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbihcclxuICAgICAgICAgICAgICAgICAgICBzdGVwLmNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAud2FpdENvbmRpdGlvbiB8fCAndmlzaWJsZScsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RlcC53YWl0VmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RlcC50aW1lb3V0IHx8IDEwMDAwXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICduYXZpZ2F0ZSc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBuYXZpZ2F0ZVRvRm9ybShzdGVwKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnYWN0aXZhdGVUYWInOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgYWN0aXZhdGVUYWIoc3RlcC5jb250cm9sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAndGFiTmF2aWdhdGUnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgYWN0aXZhdGVUYWIoc3RlcC5jb250cm9sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnYWN0aW9uUGFuZVRhYic6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBhY3RpdmF0ZUFjdGlvblBhbmVUYWIoc3RlcC5jb250cm9sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2V4cGFuZFNlY3Rpb24nOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oc3RlcC5jb250cm9sTmFtZSwgJ2V4cGFuZCcpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdjb2xsYXBzZVNlY3Rpb24nOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oc3RlcC5jb250cm9sTmFtZSwgJ2NvbGxhcHNlJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2Nsb3NlRGlhbG9nJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHN0ZXAgdHlwZTogJHtzdGVwLnR5cGV9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc2hvdWxkV2FpdEFmdGVyICYmIHdhaXRUYXJnZXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICdoaWRkZW4nLCBudWxsLCA1MDAwKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHBvc3RJbnRlcnJ1cHRpb24gPSBhd2FpdCBoYW5kbGVVbmV4cGVjdGVkRXZlbnRzKGxlYXJuaW5nTW9kZSk7XHJcbiAgICAgICAgaWYgKHBvc3RJbnRlcnJ1cHRpb24/LnNpZ25hbCAmJiBwb3N0SW50ZXJydXB0aW9uLnNpZ25hbCAhPT0gJ25vbmUnKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwb3N0SW50ZXJydXB0aW9uO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxyXG4gICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBEb25lJywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XHJcbiAgICAgICAgfSwgJyonKTtcclxuICAgICAgICBjb25zdCBwZW5kaW5nU2lnbmFsID0gY29uc3VtZVBlbmRpbmdGbG93U2lnbmFsKCk7XHJcbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiBwZW5kaW5nU2lnbmFsIH07XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAvLyBSZS10aHJvdyBuYXZpZ2F0aW9uIGludGVycnVwdHMgZm9yIHVwc3RyZWFtIGhhbmRsaW5nXHJcbiAgICAgICAgaWYgKGVyciAmJiBlcnIuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB0aHJvdyBlcnI7XHJcblxyXG4gICAgICAgIC8vIExlYXJuaW5nLW1vZGUgcmVjb3ZlcnkgcGF0aDogaWYgYSBkaWFsb2cvbWVzc2FnZSBhcHBlYXJlZCBkdXJpbmcgdGhlIHN0ZXAsXHJcbiAgICAgICAgLy8gaGFuZGxlIGl0IGZpcnN0LCB0aGVuIHJlLWNoZWNrIHBvc3QtYWN0aW9uIHdhaXQgY29uZGl0aW9uIG9uY2UuXHJcbiAgICAgICAgaWYgKGxlYXJuaW5nTW9kZSAmJiAhZXJyPy5pc1VzZXJTdG9wKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBlbmRpbmcgPSBkZXRlY3RVbmV4cGVjdGVkRXZlbnRzKCk7XHJcbiAgICAgICAgICAgIGlmIChwZW5kaW5nLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBMZWFybmluZyBtb2RlOiBpbnRlcnJ1cHRpb24gZGV0ZWN0ZWQgZHVyaW5nIHN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9LiBBc2tpbmcgZm9yIGhhbmRsaW5nLi4uYCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBoYW5kbGVVbmV4cGVjdGVkRXZlbnRzKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHNob3VsZFdhaXRBZnRlciAmJiB3YWl0VGFyZ2V0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICdoaWRkZW4nLCBudWxsLCAyNTAwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGVuZGluZ1NpZ25hbCA9IGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IHBlbmRpbmdTaWduYWwgfTtcclxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChfKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTGVhcm5pbmcgbW9kZSBvdmVycmlkZTogY29udGludWluZyBldmVuIHRob3VnaCBcIiR7d2FpdFRhcmdldH1cIiBpcyBzdGlsbCB2aXNpYmxlIGFmdGVyIGludGVycnVwdGlvbiBoYW5kbGluZy5gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGVuZGluZ1NpZ25hbCA9IGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IHBlbmRpbmdTaWduYWwgfTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYEVycm9yIGV4ZWN1dGluZyBzdGVwICR7YWJzb2x1dGVTdGVwSW5kZXggKyAxfTogJHtlcnI/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycil9YCk7XHJcbiAgICAgICAgdGhyb3cgZXJyO1xyXG4gICAgfVxyXG59XHJcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTdGVwc1dpdGhMb29wcyhzdGVwcywgcHJpbWFyeURhdGEsIGRldGFpbFNvdXJjZXMsIHJlbGF0aW9uc2hpcHMsIHNldHRpbmdzKSB7XHJcbiAgICAvLyBBcHBseSBza2lwL2xpbWl0IHJvd3MgZnJvbSBydW4gb3B0aW9uc1xyXG4gICAgY29uc3QgeyBza2lwUm93cyA9IDAsIGxpbWl0Um93cyA9IDAsIGRyeVJ1biA9IGZhbHNlLCBsZWFybmluZ01vZGUgPSBmYWxzZSB9ID0gZXhlY3V0aW9uQ29udHJvbC5ydW5PcHRpb25zO1xyXG4gICAgXHJcbiAgICBjb25zdCBvcmlnaW5hbFRvdGFsUm93cyA9IHByaW1hcnlEYXRhLmxlbmd0aDtcclxuICAgIGxldCBzdGFydFJvd051bWJlciA9IDA7IC8vIFRoZSBzdGFydGluZyByb3cgbnVtYmVyIGZvciBkaXNwbGF5XHJcbiAgICBcclxuICAgIGlmIChza2lwUm93cyA+IDApIHtcclxuICAgICAgICBwcmltYXJ5RGF0YSA9IHByaW1hcnlEYXRhLnNsaWNlKHNraXBSb3dzKTtcclxuICAgICAgICBzdGFydFJvd051bWJlciA9IHNraXBSb3dzO1xyXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgU2tpcHBlZCBmaXJzdCAke3NraXBSb3dzfSByb3dzYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChsaW1pdFJvd3MgPiAwICYmIHByaW1hcnlEYXRhLmxlbmd0aCA+IGxpbWl0Um93cykge1xyXG4gICAgICAgIHByaW1hcnlEYXRhID0gcHJpbWFyeURhdGEuc2xpY2UoMCwgbGltaXRSb3dzKTtcclxuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYExpbWl0ZWQgdG8gJHtsaW1pdFJvd3N9IHJvd3NgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgdG90YWxSb3dzVG9Qcm9jZXNzID0gcHJpbWFyeURhdGEubGVuZ3RoO1xyXG4gICAgZXhlY3V0aW9uQ29udHJvbC50b3RhbFJvd3MgPSBvcmlnaW5hbFRvdGFsUm93cztcclxuICAgIFxyXG4gICAgLy8gRmluZCBsb29wIHN0cnVjdHVyZXNcclxuICAgIGNvbnN0IGxvb3BQYWlycyA9IGZpbmRMb29wUGFpcnMoc3RlcHMsIChtZXNzYWdlKSA9PiBzZW5kTG9nKCdlcnJvcicsIG1lc3NhZ2UpKTtcclxuICAgIGNvbnN0IGlmUGFpcnMgPSBmaW5kSWZQYWlycyhzdGVwcywgKG1lc3NhZ2UpID0+IHNlbmRMb2coJ2Vycm9yJywgbWVzc2FnZSkpO1xyXG4gICAgY29uc3QgbGFiZWxNYXAgPSBuZXcgTWFwKCk7XHJcbiAgICBzdGVwcy5mb3JFYWNoKChzdGVwLCBpbmRleCkgPT4ge1xyXG4gICAgICAgIGlmIChzdGVwPy50eXBlID09PSAnbGFiZWwnICYmIHN0ZXAubGFiZWxOYW1lKSB7XHJcbiAgICAgICAgICAgIGxhYmVsTWFwLnNldChzdGVwLmxhYmVsTmFtZSwgaW5kZXgpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIElmIG5vIGxvb3BzLCBleGVjdXRlIGFsbCBzdGVwcyBmb3IgZWFjaCBwcmltYXJ5IGRhdGEgcm93IChsZWdhY3kgYmVoYXZpb3IpXHJcbiAgICBpZiAobG9vcFBhaXJzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGZvciAobGV0IHJvd0luZGV4ID0gMDsgcm93SW5kZXggPCBwcmltYXJ5RGF0YS5sZW5ndGg7IHJvd0luZGV4KyspIHtcclxuICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXHJcblxyXG4gICAgICAgICAgICBjb25zdCByb3cgPSBwcmltYXJ5RGF0YVtyb3dJbmRleF07XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlSb3dOdW1iZXIgPSBzdGFydFJvd051bWJlciArIHJvd0luZGV4OyAvLyBBY3R1YWwgcm93IG51bWJlciBpbiBvcmlnaW5hbCBkYXRhXHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFJvd0luZGV4ID0gZGlzcGxheVJvd051bWJlcjtcclxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wcm9jZXNzZWRSb3dzID0gcm93SW5kZXggKyAxO1xyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnREYXRhUm93ID0gcm93O1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgcm93UHJvZ3Jlc3MgPSB7XHJcbiAgICAgICAgICAgICAgICBwaGFzZTogJ3Jvd1N0YXJ0JyxcclxuICAgICAgICAgICAgICAgIHJvdzogZGlzcGxheVJvd051bWJlcixcclxuICAgICAgICAgICAgICAgIHRvdGFsUm93czogb3JpZ2luYWxUb3RhbFJvd3MsXHJcbiAgICAgICAgICAgICAgICBwcm9jZXNzZWRSb3dzOiByb3dJbmRleCArIDEsXHJcbiAgICAgICAgICAgICAgICB0b3RhbFRvUHJvY2VzczogdG90YWxSb3dzVG9Qcm9jZXNzLFxyXG4gICAgICAgICAgICAgICAgc3RlcDogJ1Byb2Nlc3Npbmcgcm93J1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFByb2Nlc3Npbmcgcm93ICR7ZGlzcGxheVJvd051bWJlciArIDF9LyR7b3JpZ2luYWxUb3RhbFJvd3N9YCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHJvd1Byb2dyZXNzIH0sICcqJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoMCwgc3RlcHMubGVuZ3RoLCByb3cpO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdicmVhay1sb29wJyB8fCByZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xvb3AgY29udHJvbCBzaWduYWwgdXNlZCBvdXRzaWRlIG9mIGEgbG9vcCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBsb29wUGFpck1hcCA9IG5ldyBNYXAobG9vcFBhaXJzLm1hcChwYWlyID0+IFtwYWlyLnN0YXJ0SW5kZXgsIHBhaXIuZW5kSW5kZXhdKSk7XHJcbiAgICBjb25zdCBpbml0aWFsRGF0YVJvdyA9IHByaW1hcnlEYXRhWzBdIHx8IHt9O1xyXG5cclxuICAgIGNvbnN0IHJlc29sdmVMb29wRGF0YSA9IChsb29wRGF0YVNvdXJjZSwgY3VycmVudERhdGFSb3cpID0+IHtcclxuICAgICAgICBsZXQgbG9vcERhdGEgPSBwcmltYXJ5RGF0YTtcclxuXHJcbiAgICAgICAgaWYgKGxvb3BEYXRhU291cmNlICE9PSAncHJpbWFyeScgJiYgZGV0YWlsU291cmNlc1tsb29wRGF0YVNvdXJjZV0pIHtcclxuICAgICAgICAgICAgY29uc3QgZGV0YWlsU291cmNlID0gZGV0YWlsU291cmNlc1tsb29wRGF0YVNvdXJjZV07XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uc0ZvckRldGFpbCA9IChyZWxhdGlvbnNoaXBzIHx8IFtdKS5maWx0ZXIociA9PiByLmRldGFpbElkID09PSBsb29wRGF0YVNvdXJjZSk7XHJcbiAgICAgICAgICAgIGlmICghcmVsYXRpb25zRm9yRGV0YWlsLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBsb29wRGF0YTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgbG9vcFN0YWNrID0gQXJyYXkuaXNBcnJheShjdXJyZW50RGF0YVJvdz8uX19kMzY1X2xvb3Bfc3RhY2spXHJcbiAgICAgICAgICAgICAgICA/IGN1cnJlbnREYXRhUm93Ll9fZDM2NV9sb29wX3N0YWNrXHJcbiAgICAgICAgICAgICAgICA6IFtdO1xyXG4gICAgICAgICAgICBjb25zdCBwYXJlbnRMb29wU291cmNlSWQgPSBsb29wU3RhY2subGVuZ3RoID8gbG9vcFN0YWNrW2xvb3BTdGFjay5sZW5ndGggLSAxXSA6ICcnO1xyXG4gICAgICAgICAgICBpZiAoIXBhcmVudExvb3BTb3VyY2VJZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVG9wLWxldmVsIGxvb3A6IGRvIG5vdCBhcHBseSByZWxhdGlvbnNoaXAgZmlsdGVyaW5nLlxyXG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBsb29wRGF0YTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgcGFyZW50U2NvcGVkUmVsYXRpb25zID0gcmVsYXRpb25zRm9yRGV0YWlsLmZpbHRlcihyZWwgPT4gKHJlbC5wYXJlbnRTb3VyY2VJZCB8fCAnJykgPT09IHBhcmVudExvb3BTb3VyY2VJZCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZVJlbGF0aW9ucyA9IHBhcmVudFNjb3BlZFJlbGF0aW9ucy5sZW5ndGggPyBwYXJlbnRTY29wZWRSZWxhdGlvbnMgOiByZWxhdGlvbnNGb3JEZXRhaWw7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUGFyZW50VmFsdWUgPSAocmVsLCBwYWlyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBleHBsaWNpdEtleSA9IHJlbD8ucGFyZW50U291cmNlSWQgPyBgJHtyZWwucGFyZW50U291cmNlSWR9OiR7cGFpci5wcmltYXJ5RmllbGR9YCA6ICcnO1xyXG4gICAgICAgICAgICAgICAgaWYgKGV4cGxpY2l0S2V5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwbGljaXRWYWx1ZSA9IGN1cnJlbnREYXRhUm93Py5bZXhwbGljaXRLZXldO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChleHBsaWNpdFZhbHVlICE9PSB1bmRlZmluZWQgJiYgZXhwbGljaXRWYWx1ZSAhPT0gbnVsbCAmJiBTdHJpbmcoZXhwbGljaXRWYWx1ZSkgIT09ICcnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBleHBsaWNpdFZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnN0IGZhbGxiYWNrVmFsdWUgPSBjdXJyZW50RGF0YVJvdz8uW3BhaXIucHJpbWFyeUZpZWxkXTtcclxuICAgICAgICAgICAgICAgIGlmIChmYWxsYmFja1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgZmFsbGJhY2tWYWx1ZSAhPT0gbnVsbCAmJiBTdHJpbmcoZmFsbGJhY2tWYWx1ZSkgIT09ICcnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbGxiYWNrVmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRSZWxhdGlvbiA9IGNhbmRpZGF0ZVJlbGF0aW9ucy5maW5kKChyZWwpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZ3MgPSBBcnJheS5pc0FycmF5KHJlbD8uZmllbGRNYXBwaW5ncykgJiYgcmVsLmZpZWxkTWFwcGluZ3MubGVuZ3RoXHJcbiAgICAgICAgICAgICAgICAgICAgPyByZWwuZmllbGRNYXBwaW5nc1xyXG4gICAgICAgICAgICAgICAgICAgIDogKHJlbD8ucHJpbWFyeUZpZWxkICYmIHJlbD8uZGV0YWlsRmllbGRcclxuICAgICAgICAgICAgICAgICAgICAgICAgPyBbeyBwcmltYXJ5RmllbGQ6IHJlbC5wcmltYXJ5RmllbGQsIGRldGFpbEZpZWxkOiByZWwuZGV0YWlsRmllbGQgfV1cclxuICAgICAgICAgICAgICAgICAgICA6IFtdKTtcclxuICAgICAgICAgICAgICAgIGlmICghZmllbGRNYXBwaW5ncy5sZW5ndGgpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmaWVsZE1hcHBpbmdzLmV2ZXJ5KChwYWlyKSA9PiByZXNvbHZlUGFyZW50VmFsdWUocmVsLCBwYWlyKSAhPT0gdW5kZWZpbmVkKTtcclxuICAgICAgICAgICAgfSkgfHwgbnVsbDtcclxuXHJcbiAgICAgICAgICAgIGlmICghc2VsZWN0ZWRSZWxhdGlvbikge1xyXG4gICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBSZWxhdGlvbnNoaXAgZmlsdGVyIGZvciAke2xvb3BEYXRhU291cmNlfSBjb3VsZCBub3QgcmVzb2x2ZSBwYXJlbnQgdmFsdWVzLiBMb29wIHdpbGwgcHJvY2VzcyAwIHJvd3MuYCk7XHJcbiAgICAgICAgICAgICAgICBsb29wRGF0YSA9IFtdO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZE1hcHBpbmdzID0gQXJyYXkuaXNBcnJheShzZWxlY3RlZFJlbGF0aW9uLmZpZWxkTWFwcGluZ3MpICYmIHNlbGVjdGVkUmVsYXRpb24uZmllbGRNYXBwaW5ncy5sZW5ndGhcclxuICAgICAgICAgICAgICAgID8gc2VsZWN0ZWRSZWxhdGlvbi5maWVsZE1hcHBpbmdzXHJcbiAgICAgICAgICAgICAgICA6IFt7IHByaW1hcnlGaWVsZDogc2VsZWN0ZWRSZWxhdGlvbi5wcmltYXJ5RmllbGQsIGRldGFpbEZpZWxkOiBzZWxlY3RlZFJlbGF0aW9uLmRldGFpbEZpZWxkIH1dO1xyXG5cclxuICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YS5maWx0ZXIoKGRldGFpbFJvdykgPT4gc2VsZWN0ZWRNYXBwaW5ncy5ldmVyeSgocGFpcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50VmFsdWUgPSByZXNvbHZlUGFyZW50VmFsdWUoc2VsZWN0ZWRSZWxhdGlvbiwgcGFpcik7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZFZhbHVlID0gZGV0YWlsUm93Py5bcGFpci5kZXRhaWxGaWVsZF07XHJcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50VmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNoaWxkVmFsdWUgPT09IHVuZGVmaW5lZCB8fCBjaGlsZFZhbHVlID09PSBudWxsKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gU3RyaW5nKGNoaWxkVmFsdWUpID09PSBTdHJpbmcocGFyZW50VmFsdWUpO1xyXG4gICAgICAgICAgICB9KSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gbG9vcERhdGE7XHJcbiAgICB9O1xyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTdGVwV2l0aEhhbmRsaW5nKHN0ZXAsIHN0ZXBJbmRleCwgY3VycmVudERhdGFSb3cpIHtcclxuICAgICAgICBjb25zdCB7IG1vZGUsIHJldHJ5Q291bnQsIHJldHJ5RGVsYXksIGdvdG9MYWJlbCB9ID0gZ2V0U3RlcEVycm9yQ29uZmlnKHN0ZXAsIHNldHRpbmdzKTtcclxuICAgICAgICBsZXQgYXR0ZW1wdCA9IDA7XHJcblxyXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzdGVwUmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVNpbmdsZVN0ZXAoc3RlcCwgc3RlcEluZGV4LCBjdXJyZW50RGF0YVJvdywgZGV0YWlsU291cmNlcywgc2V0dGluZ3MsIGRyeVJ1biwgbGVhcm5pbmdNb2RlKTtcclxuICAgICAgICAgICAgICAgIGlmIChzdGVwUmVzdWx0Py5zaWduYWwgJiYgc3RlcFJlc3VsdC5zaWduYWwgIT09ICdub25lJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogc3RlcFJlc3VsdC5zaWduYWwgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnN0IHBlbmRpbmdTaWduYWwgPSBjb25zdW1lUGVuZGluZ0Zsb3dTaWduYWwoKTtcclxuICAgICAgICAgICAgICAgIGlmIChwZW5kaW5nU2lnbmFsICE9PSAnbm9uZScpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IHBlbmRpbmdTaWduYWwgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgaWYgKGVyciAmJiBlcnIuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB0aHJvdyBlcnI7XHJcbiAgICAgICAgICAgICAgICBpZiAoZXJyICYmIChlcnIuaXNVc2VyU3RvcCB8fCBlcnIubm9SZXRyeSkpIHRocm93IGVycjtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAocmV0cnlDb3VudCA+IDAgJiYgYXR0ZW1wdCA8IHJldHJ5Q291bnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBhdHRlbXB0ICs9IDE7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBSZXRyeWluZyBzdGVwICR7c3RlcEluZGV4ICsgMX0gKCR7YXR0ZW1wdH0vJHtyZXRyeUNvdW50fSkgYWZ0ZXIgZXJyb3I6ICR7ZXJyPy5tZXNzYWdlIHx8IFN0cmluZyhlcnIpfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXRyeURlbGF5ID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcChyZXRyeURlbGF5KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgc3dpdGNoIChtb2RlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnc2tpcCc6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ3NraXAnIH07XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnZ290byc6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2dvdG8nLCBsYWJlbDogZ290b0xhYmVsIH07XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnYnJlYWstbG9vcCc6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2JyZWFrLWxvb3AnIH07XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnY29udGludWUtbG9vcCc6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2NvbnRpbnVlLWxvb3AnIH07XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAncmVwZWF0LWxvb3AnOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdyZXBlYXQtbG9vcCcgfTtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlICdmYWlsJzpcclxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVJhbmdlKHN0YXJ0SWR4LCBlbmRJZHgsIGN1cnJlbnREYXRhUm93KSB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnREYXRhUm93KSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudERhdGFSb3cgPSBjdXJyZW50RGF0YVJvdztcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IGlkeCA9IHN0YXJ0SWR4O1xyXG5cclxuICAgICAgICB3aGlsZSAoaWR4IDwgZW5kSWR4KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxyXG5cclxuICAgICAgICAgICAgY29uc3Qgc3RlcCA9IHN0ZXBzW2lkeF07XHJcblxyXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnbGFiZWwnKSB7XHJcbiAgICAgICAgICAgICAgICBpZHgrKztcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnZ290bycpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldEluZGV4ID0gbGFiZWxNYXAuZ2V0KHN0ZXAuZ290b0xhYmVsKTtcclxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHb3RvIGxhYmVsIG5vdCBmb3VuZDogJHtzdGVwLmdvdG9MYWJlbCB8fCAnJ31gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRJbmRleCA8IHN0YXJ0SWR4IHx8IHRhcmdldEluZGV4ID49IGVuZElkeCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2dvdG8nLCB0YXJnZXRJbmRleCB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWR4ID0gdGFyZ2V0SW5kZXg7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2lmLXN0YXJ0Jykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29uZGl0aW9uTWV0ID0gZXZhbHVhdGVDb25kaXRpb24oc3RlcCwgY3VycmVudERhdGFSb3csIHtcclxuICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCxcclxuICAgICAgICAgICAgICAgICAgICBpc0VsZW1lbnRWaXNpYmxlXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVuZEluZGV4ID0gaWZQYWlycy5pZlRvRW5kLmdldChpZHgpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZWxzZUluZGV4ID0gaWZQYWlycy5pZlRvRWxzZS5nZXQoaWR4KTtcclxuICAgICAgICAgICAgICAgIGlmIChlbmRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJZi1zdGFydCBhdCBpbmRleCAke2lkeH0gaGFzIG5vIG1hdGNoaW5nIGlmLWVuZGApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjb25kaXRpb25NZXQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZHgrKztcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZWxzZUluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZHggPSBlbHNlSW5kZXggKyAxO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBpZHggPSBlbmRJbmRleCArIDE7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2Vsc2UnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRJbmRleCA9IGlmUGFpcnMuZWxzZVRvRW5kLmdldChpZHgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGVuZEluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZHggPSBlbmRJbmRleCArIDE7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGlkeCsrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdpZi1lbmQnKSB7XHJcbiAgICAgICAgICAgICAgICBpZHgrKztcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnY29udGludWUtbG9vcCcpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2NvbnRpbnVlLWxvb3AnIH07XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdyZXBlYXQtbG9vcCcpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ3JlcGVhdC1sb29wJyB9O1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnYnJlYWstbG9vcCcpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2JyZWFrLWxvb3AnIH07XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbG9vcEVuZElkeCA9IGxvb3BQYWlyTWFwLmdldChpZHgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGxvb3BFbmRJZHggPT09IHVuZGVmaW5lZCB8fCBsb29wRW5kSWR4IDw9IGlkeCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTG9vcCBzdGFydCBhdCBpbmRleCAke2lkeH0gaGFzIG5vIG1hdGNoaW5nIGVuZGApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BNb2RlID0gc3RlcC5sb29wTW9kZSB8fCAnZGF0YSc7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGxvb3BNb2RlID09PSAnY291bnQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9vcENvdW50ID0gTnVtYmVyKHN0ZXAubG9vcENvdW50KSB8fCAwO1xyXG4gICAgICAgICAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wudG90YWxSb3dzID0gbG9vcENvdW50O1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgRW50ZXJpbmcgbG9vcDogJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ30gKGNvdW50PSR7bG9vcENvdW50fSlgKTtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpdGVySW5kZXggPSAwOyBpdGVySW5kZXggPCBsb29wQ291bnQ7IGl0ZXJJbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBleGVjdXRpb25Db250cm9sLnByb2Nlc3NlZFJvd3MgPSBpdGVySW5kZXggKyAxO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdsb29wSXRlcmF0aW9uJywgaXRlcmF0aW9uOiBpdGVySW5kZXggKyAxLCB0b3RhbDogbG9vcENvdW50LCBzdGVwOiBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCI6IGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bG9vcENvdW50fWAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAnKicpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKGlkeCArIDEsIGxvb3BFbmRJZHgsIGN1cnJlbnREYXRhUm93KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcpIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJykgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ3JlcGVhdC1sb29wJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlckluZGV4ID0gTWF0aC5tYXgoLTEsIGl0ZXJJbmRleCAtIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZHggPSBsb29wRW5kSWR4ICsgMTtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZiAobG9vcE1vZGUgPT09ICd3aGlsZScpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXhJdGVyYXRpb25zID0gTnVtYmVyKHN0ZXAubG9vcE1heEl0ZXJhdGlvbnMpIHx8IDEwMDtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgaXRlckluZGV4ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB3aGlsZSAoaXRlckluZGV4IDwgbWF4SXRlcmF0aW9ucykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFldmFsdWF0ZUNvbmRpdGlvbihzdGVwLCBjdXJyZW50RGF0YVJvdywge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0VsZW1lbnRWaXNpYmxlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKSBicmVhaztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ2xvb3BJdGVyYXRpb24nLCBpdGVyYXRpb246IGl0ZXJJbmRleCArIDEsIHRvdGFsOiBtYXhJdGVyYXRpb25zLCBzdGVwOiBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCI6IGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bWF4SXRlcmF0aW9uc31gIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgJyonKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVSYW5nZShpZHggKyAxLCBsb29wRW5kSWR4LCBjdXJyZW50RGF0YVJvdyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnKSBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJJbmRleCsrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdnb3RvJykgcmV0dXJuIHJlc3VsdDtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJJbmRleCsrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZXJJbmRleCA+PSBtYXhJdGVyYXRpb25zKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCIgaGl0IG1heCBpdGVyYXRpb25zICgke21heEl0ZXJhdGlvbnN9KWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gbG9vcEVuZElkeCArIDE7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgbG9vcERhdGFTb3VyY2UgPSBzdGVwLmxvb3BEYXRhU291cmNlIHx8ICdwcmltYXJ5JztcclxuICAgICAgICAgICAgICAgIGxldCBsb29wRGF0YSA9IHJlc29sdmVMb29wRGF0YShsb29wRGF0YVNvdXJjZSwgY3VycmVudERhdGFSb3cpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IGl0ZXJhdGlvbiBsaW1pdFxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlcmF0aW9uTGltaXQgPSBzdGVwLml0ZXJhdGlvbkxpbWl0IHx8IDA7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXRlcmF0aW9uTGltaXQgPiAwICYmIGxvb3BEYXRhLmxlbmd0aCA+IGl0ZXJhdGlvbkxpbWl0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbG9vcERhdGEgPSBsb29wRGF0YS5zbGljZSgwLCBpdGVyYXRpb25MaW1pdCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBFbnRlcmluZyBsb29wOiAke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfSAoc291cmNlPSR7bG9vcERhdGFTb3VyY2V9KSAtICR7bG9vcERhdGEubGVuZ3RofSBpdGVyYXRpb25zYCk7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpdGVySW5kZXggPSAwOyBpdGVySW5kZXggPCBsb29wRGF0YS5sZW5ndGg7IGl0ZXJJbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZXJTb3VyY2VSb3cgPSBsb29wRGF0YVtpdGVySW5kZXhdIHx8IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZXJSb3cgPSB7IC4uLmN1cnJlbnREYXRhUm93LCAuLi5pdGVyU291cmNlUm93IH07XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyZW50U3RhY2sgPSBBcnJheS5pc0FycmF5KGN1cnJlbnREYXRhUm93Py5fX2QzNjVfbG9vcF9zdGFjaylcclxuICAgICAgICAgICAgICAgICAgICAgICAgPyBjdXJyZW50RGF0YVJvdy5fX2QzNjVfbG9vcF9zdGFja1xyXG4gICAgICAgICAgICAgICAgICAgICAgICA6IFtdO1xyXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJSb3cuX19kMzY1X2xvb3Bfc3RhY2sgPSBbLi4ucGFyZW50U3RhY2ssIGxvb3BEYXRhU291cmNlXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobG9vcERhdGFTb3VyY2UgIT09ICdwcmltYXJ5Jykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBPYmplY3QuZW50cmllcyhpdGVyU291cmNlUm93KS5mb3JFYWNoKChbZmllbGQsIHZhbHVlXSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlclJvd1tgJHtsb29wRGF0YVNvdXJjZX06JHtmaWVsZH1gXSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNQcmltYXJ5TG9vcCA9IGxvb3BEYXRhU291cmNlID09PSAncHJpbWFyeSc7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG90YWxSb3dzRm9yTG9vcCA9IGlzUHJpbWFyeUxvb3AgPyBvcmlnaW5hbFRvdGFsUm93cyA6IGxvb3BEYXRhLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b3RhbFRvUHJvY2Vzc0Zvckxvb3AgPSBsb29wRGF0YS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheVJvd051bWJlciA9IGlzUHJpbWFyeUxvb3AgPyBzdGFydFJvd051bWJlciArIGl0ZXJJbmRleCA6IGl0ZXJJbmRleDtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9vcFJvd1Byb2dyZXNzID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwaGFzZTogJ3Jvd1N0YXJ0JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm93OiBkaXNwbGF5Um93TnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0b3RhbFJvd3M6IHRvdGFsUm93c0Zvckxvb3AsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFJvd3M6IGl0ZXJJbmRleCArIDEsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsVG9Qcm9jZXNzOiB0b3RhbFRvUHJvY2Vzc0Zvckxvb3AsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0ZXA6ICdQcm9jZXNzaW5nIHJvdydcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgTG9vcCBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke2xvb3BEYXRhLmxlbmd0aH0gZm9yIGxvb3AgJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31gKTtcclxuICAgICAgICAgICAgICAgICAgICBleGVjdXRpb25Db250cm9sLnByb2Nlc3NlZFJvd3MgPSBpdGVySW5kZXggKyAxO1xyXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IGxvb3BSb3dQcm9ncmVzcyB9LCAnKicpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiB7IHBoYXNlOiAnbG9vcEl0ZXJhdGlvbicsIGl0ZXJhdGlvbjogaXRlckluZGV4ICsgMSwgdG90YWw6IGxvb3BEYXRhLmxlbmd0aCwgc3RlcDogYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiOiBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke2xvb3BEYXRhLmxlbmd0aH1gIH0gfSwgJyonKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRXhlY3V0ZSBzdGVwcyBpbnNpZGUgdGhlIGxvb3AgKHN1cHBvcnRzIG5lc3RlZCBsb29wcylcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgaXRlclJvdyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcpIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnKSBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdyZXBlYXQtbG9vcCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlckluZGV4ID0gTWF0aC5tYXgoLTEsIGl0ZXJJbmRleCAtIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWR4ID0gbG9vcEVuZElkeCArIDE7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2xvb3AtZW5kJykge1xyXG4gICAgICAgICAgICAgICAgaWR4Kys7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVN0ZXBXaXRoSGFuZGxpbmcoc3RlcCwgaWR4LCBjdXJyZW50RGF0YVJvdyk7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ3NraXAnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnbm9uZScpIHtcclxuICAgICAgICAgICAgICAgIGlkeCsrO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldEluZGV4ID0gbGFiZWxNYXAuZ2V0KHJlc3VsdC5sYWJlbCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgR290byBsYWJlbCBub3QgZm91bmQ6ICR7cmVzdWx0LmxhYmVsIHx8ICcnfWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldEluZGV4IDwgc3RhcnRJZHggfHwgdGFyZ2V0SW5kZXggPj0gZW5kSWR4KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnZ290bycsIHRhcmdldEluZGV4IH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZHggPSB0YXJnZXRJbmRleDtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdyZXBlYXQtbG9vcCcpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWR4Kys7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZmluYWxSZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoMCwgc3RlcHMubGVuZ3RoLCBpbml0aWFsRGF0YVJvdyk7XHJcbiAgICBpZiAoZmluYWxSZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IGZpbmFsUmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJyB8fCBmaW5hbFJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29wIGNvbnRyb2wgc2lnbmFsIHVzZWQgb3V0c2lkZSBvZiBhIGxvb3AnKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gPT09PT09IEFkbWluIEluc3BlY3Rpb24gRnVuY3Rpb25zID09PT09PVxyXG5mdW5jdGlvbiBydW5BZG1pbkluc3BlY3Rpb24oaW5zcGVjdG9yLCBpbnNwZWN0aW9uVHlwZSwgZm9ybU5hbWVQYXJhbSwgZG9jdW1lbnQsIHdpbmRvdykge1xyXG4gICAgc3dpdGNoIChpbnNwZWN0aW9uVHlwZSkge1xyXG4gICAgICAgIGNhc2UgJ3NjYW5QYWdlJzpcclxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJFdmVyeXRoaW5nKGRvY3VtZW50LCB3aW5kb3cpO1xyXG4gICAgICAgIGNhc2UgJ29wZW5Gb3Jtcyc6XHJcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyT3BlbkZvcm1zKGRvY3VtZW50LCB3aW5kb3cpO1xyXG4gICAgICAgIGNhc2UgJ2JhdGNoRGlhbG9nJzpcclxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJCYXRjaERpYWxvZyhkb2N1bWVudCk7XHJcbiAgICAgICAgY2FzZSAncmVjdXJyZW5jZURpYWxvZyc6XHJcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyUmVjdXJyZW5jZURpYWxvZyhkb2N1bWVudCk7XHJcbiAgICAgICAgY2FzZSAnZmlsdGVyRGlhbG9nJzpcclxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJGaWx0ZXJEaWFsb2coZG9jdW1lbnQpO1xyXG4gICAgICAgIGNhc2UgJ2Zvcm1UYWJzJzpcclxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJUYWJzKGRvY3VtZW50KTtcclxuICAgICAgICBjYXNlICdhY3RpdmVUYWInOlxyXG4gICAgICAgICAgICByZXR1cm4gYWRtaW5EaXNjb3ZlckFjdGl2ZVRhYihkb2N1bWVudCk7XHJcbiAgICAgICAgY2FzZSAnYWN0aW9uUGFuZVRhYnMnOlxyXG4gICAgICAgICAgICByZXR1cm4gYWRtaW5EaXNjb3ZlckFjdGlvblBhbmVUYWJzKGRvY3VtZW50KTtcclxuICAgICAgICBjYXNlICdmb3JtSW5wdXRzJzpcclxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJGb3JtSW5wdXRzKGRvY3VtZW50LCBmb3JtTmFtZVBhcmFtKTtcclxuICAgICAgICBjYXNlICdnZW5lcmF0ZVN0ZXBzJzpcclxuICAgICAgICAgICAgcmV0dXJuIGFkbWluR2VuZXJhdGVTdGVwc0ZvclRhYihkb2N1bWVudCk7XHJcbiAgICAgICAgY2FzZSAnZ3JpZFN0YXRlJzpcclxuICAgICAgICAgICAgcmV0dXJuIGluc3BlY3RHcmlkU3RhdGUoKTtcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gaW5zcGVjdGlvbiB0eXBlOiAnICsgaW5zcGVjdGlvblR5cGUpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRNYWluRm9ybShkb2N1bWVudCkge1xyXG4gICAgY29uc3QgZm9ybXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgbGV0IG1haW5Gb3JtID0gbnVsbDtcclxuICAgIGZvcm1zLmZvckVhY2goZiA9PiB7XHJcbiAgICAgICAgY29uc3QgbmFtZSA9IGYuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICBpZiAobmFtZSAhPT0gJ0RlZmF1bHREYXNoYm9hcmQnICYmIGYub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIG1haW5Gb3JtID0gZjtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBtYWluRm9ybTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWRtaW5EaXNjb3Zlck9wZW5Gb3Jtcyhkb2N1bWVudCwgd2luZG93KSB7XHJcbiAgICBjb25zdCByZXN1bHRzID0ge1xyXG4gICAgICAgIGN1cnJlbnRVcmw6IHtcclxuICAgICAgICAgICAgZnVsbDogd2luZG93LmxvY2F0aW9uLmhyZWYsXHJcbiAgICAgICAgICAgIG1lbnVJdGVtOiBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldCgnbWknKSxcclxuICAgICAgICAgICAgY29tcGFueTogbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoJ2NtcCcpXHJcbiAgICAgICAgfSxcclxuICAgICAgICBmb3JtczogW10sXHJcbiAgICAgICAgZGlhbG9nU3RhY2s6IFtdXHJcbiAgICB9O1xyXG5cclxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgIGNvbnN0IGlzRGlhbG9nID0gZWwuY2xvc2VzdCgnLmRpYWxvZy1jb250YWluZXInKSAhPT0gbnVsbCB8fFxyXG4gICAgICAgICAgICBmb3JtTmFtZS5pbmNsdWRlcygnRGlhbG9nJykgfHwgZm9ybU5hbWUuaW5jbHVkZXMoJ0Zvcm0nKSB8fFxyXG4gICAgICAgICAgICBmb3JtTmFtZSA9PT0gJ1N5c1JlY3VycmVuY2UnIHx8IGZvcm1OYW1lID09PSAnU3lzUXVlcnlGb3JtJztcclxuICAgICAgICBjb25zdCBpc1Zpc2libGUgPSBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGw7XHJcblxyXG4gICAgICAgIHJlc3VsdHMuZm9ybXMucHVzaCh7IGZvcm1OYW1lLCBpc0RpYWxvZywgaXNWaXNpYmxlIH0pO1xyXG4gICAgICAgIGlmIChpc0RpYWxvZyAmJiBpc1Zpc2libGUpIHtcclxuICAgICAgICAgICAgcmVzdWx0cy5kaWFsb2dTdGFjay5wdXNoKGZvcm1OYW1lKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJlc3VsdHMuZGlhbG9nU3RhY2sucmV2ZXJzZSgpO1xyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJCYXRjaERpYWxvZyhkb2N1bWVudCkge1xyXG4gICAgY29uc3QgcmVzdWx0cyA9IHtcclxuICAgICAgICBkaWFsb2dGb3VuZDogZmFsc2UsIGZvcm1OYW1lOiBudWxsLFxyXG4gICAgICAgIGFsbENvbnRyb2xzOiBbXSwgaW5wdXRGaWVsZHM6IFtdLCBjaGVja2JveGVzOiBbXSwgY29tYm9ib3hlczogW10sIGJ1dHRvbnM6IFtdLCBncm91cHM6IFtdLCB0b2dnbGVzOiBbXVxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBkaWFsb2dGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXScpIHx8XHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZSo9XCJEaWFsb2dcIl0nKSB8fFxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5kaWFsb2ctY29udGVudCBbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG5cclxuICAgIGlmICghZGlhbG9nRm9ybSkgcmV0dXJuIHJlc3VsdHM7XHJcblxyXG4gICAgcmVzdWx0cy5kaWFsb2dGb3VuZCA9IHRydWU7XHJcbiAgICByZXN1bHRzLmZvcm1OYW1lID0gZGlhbG9nRm9ybS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG5cclxuICAgIGRpYWxvZ0Zvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgIGNvbnN0IGluZm8gPSB7XHJcbiAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXHJcbiAgICAgICAgICAgIHJvbGU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpLFxyXG4gICAgICAgICAgICBjb250cm9sVHlwZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sdHlwZScpLFxyXG4gICAgICAgICAgICBsYWJlbDogZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJylcclxuICAgICAgICB9O1xyXG4gICAgICAgIHJlc3VsdHMuYWxsQ29udHJvbHMucHVzaChpbmZvKTtcclxuICAgICAgICBjb25zdCByb2xlID0gKGluZm8ucm9sZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBpZiAocm9sZS5pbmNsdWRlcygnaW5wdXQnKSB8fCByb2xlID09PSAnc3RyaW5nJyB8fCByb2xlID09PSAnaW50ZWdlcicgfHwgcm9sZSA9PT0gJ3JlYWwnKSByZXN1bHRzLmlucHV0RmllbGRzLnB1c2goaW5mbyk7XHJcbiAgICAgICAgZWxzZSBpZiAocm9sZS5pbmNsdWRlcygnY2hlY2tib3gnKSB8fCByb2xlID09PSAneWVzbm8nKSByZXN1bHRzLmNoZWNrYm94ZXMucHVzaChpbmZvKTtcclxuICAgICAgICBlbHNlIGlmIChyb2xlLmluY2x1ZGVzKCdjb21ib2JveCcpIHx8IHJvbGUgPT09ICdkcm9wZG93bicpIHJlc3VsdHMuY29tYm9ib3hlcy5wdXNoKGluZm8pO1xyXG4gICAgICAgIGVsc2UgaWYgKHJvbGUuaW5jbHVkZXMoJ2J1dHRvbicpKSByZXN1bHRzLmJ1dHRvbnMucHVzaChpbmZvKTtcclxuICAgICAgICBlbHNlIGlmIChyb2xlID09PSAnZ3JvdXAnKSByZXN1bHRzLmdyb3Vwcy5wdXNoKGluZm8pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgZGlhbG9nRm9ybS5xdWVyeVNlbGVjdG9yQWxsKCcudG9nZ2xlLCBbcm9sZT1cInN3aXRjaFwiXSwgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIGlmIChjb250YWluZXIpIHtcclxuICAgICAgICAgICAgcmVzdWx0cy50b2dnbGVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXHJcbiAgICAgICAgICAgICAgICByb2xlOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBsYWJlbDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKCksXHJcbiAgICAgICAgICAgICAgICBpc0NoZWNrZWQ6IGVsLmNoZWNrZWQgfHwgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJSZWN1cnJlbmNlRGlhbG9nKGRvY3VtZW50KSB7XHJcbiAgICBjb25zdCByZXN1bHRzID0ge1xyXG4gICAgICAgIGRpYWxvZ0ZvdW5kOiBmYWxzZSwgZm9ybU5hbWU6ICdTeXNSZWN1cnJlbmNlJyxcclxuICAgICAgICBzdGFydERhdGVUaW1lOiB7fSwgZW5kT3B0aW9uczoge30sIHBhdHRlcm46IHt9LCBidXR0b25zOiBbXSwgYWxsQ29udHJvbHM6IFtdXHJcbiAgICB9O1xyXG4gICAgY29uc3QgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICBpZiAoIWZvcm0pIHJldHVybiByZXN1bHRzO1xyXG4gICAgcmVzdWx0cy5kaWFsb2dGb3VuZCA9IHRydWU7XHJcblxyXG4gICAgZm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgIGNvbnN0IGxhYmVsID0gZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcclxuICAgICAgICBjb25zdCBpbmZvID0geyBjb250cm9sTmFtZSwgcm9sZSwgbGFiZWwgfTtcclxuICAgICAgICByZXN1bHRzLmFsbENvbnRyb2xzLnB1c2goaW5mbyk7XHJcblxyXG4gICAgICAgIGNvbnN0IG5hbWVMb3dlciA9IChjb250cm9sTmFtZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBpZiAobmFtZUxvd2VyID09PSAnc3RhcnRkYXRlJykgcmVzdWx0cy5zdGFydERhdGVUaW1lLnN0YXJ0RGF0ZSA9IGluZm87XHJcbiAgICAgICAgZWxzZSBpZiAobmFtZUxvd2VyID09PSAnc3RhcnR0aW1lJykgcmVzdWx0cy5zdGFydERhdGVUaW1lLnN0YXJ0VGltZSA9IGluZm87XHJcbiAgICAgICAgZWxzZSBpZiAobmFtZUxvd2VyID09PSAndGltZXpvbmUnKSByZXN1bHRzLnN0YXJ0RGF0ZVRpbWUudGltZXpvbmUgPSBpbmZvO1xyXG4gICAgICAgIGVsc2UgaWYgKG5hbWVMb3dlciA9PT0gJ2VuZGRhdGVpbnQnKSByZXN1bHRzLmVuZE9wdGlvbnMuY291bnQgPSBpbmZvO1xyXG4gICAgICAgIGVsc2UgaWYgKG5hbWVMb3dlciA9PT0gJ2VuZGRhdGVkYXRlJykgcmVzdWx0cy5lbmRPcHRpb25zLmVuZERhdGUgPSBpbmZvO1xyXG4gICAgICAgIGVsc2UgaWYgKG5hbWVMb3dlciA9PT0gJ3BhdHRlcm51bml0JykgcmVzdWx0cy5wYXR0ZXJuLnVuaXQgPSBpbmZvO1xyXG4gICAgICAgIGVsc2UgaWYgKHJvbGUgPT09ICdDb21tYW5kQnV0dG9uJykgcmVzdWx0cy5idXR0b25zLnB1c2goaW5mbyk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiByZXN1bHRzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyRmlsdGVyRGlhbG9nKGRvY3VtZW50KSB7XHJcbiAgICBjb25zdCByZXN1bHRzID0ge1xyXG4gICAgICAgIGRpYWxvZ0ZvdW5kOiBmYWxzZSwgZm9ybU5hbWU6ICdTeXNRdWVyeUZvcm0nLFxyXG4gICAgICAgIHRhYnM6IFtdLCBncmlkSW5mbzoge30sIHNhdmVkUXVlcmllczogbnVsbCwgYnV0dG9uczogW10sIGNoZWNrYm94ZXM6IFtdLCBhbGxDb250cm9sczogW11cclxuICAgIH07XHJcbiAgICBjb25zdCBxdWVyeUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJyk7XHJcbiAgICBpZiAoIXF1ZXJ5Rm9ybSkgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICByZXN1bHRzLmRpYWxvZ0ZvdW5kID0gdHJ1ZTtcclxuXHJcbiAgICBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJQaXZvdEl0ZW1cIl0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICByZXN1bHRzLnRhYnMucHVzaCh7XHJcbiAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXHJcbiAgICAgICAgICAgIGxhYmVsOiBlbC50ZXh0Q29udGVudD8udHJpbSgpLnNwbGl0KCdcXG4nKVswXSxcclxuICAgICAgICAgICAgaXNWaXNpYmxlOiBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGxcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGdyaWQgPSBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VHcmlkXCJdJyk7XHJcbiAgICBpZiAoZ3JpZCkge1xyXG4gICAgICAgIHJlc3VsdHMuZ3JpZEluZm8gPSB7IGNvbnRyb2xOYW1lOiAnUmFuZ2VHcmlkJywgcm9sZTogZ3JpZC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSB9O1xyXG4gICAgfVxyXG5cclxuICAgIHF1ZXJ5Rm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgIGNvbnN0IGxhYmVsID0gZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICBjb25zdCBpbmZvID0geyBjb250cm9sTmFtZSwgcm9sZSwgbGFiZWwgfTtcclxuICAgICAgICByZXN1bHRzLmFsbENvbnRyb2xzLnB1c2goaW5mbyk7XHJcbiAgICAgICAgaWYgKGNvbnRyb2xOYW1lID09PSAnU2F2ZWRRdWVyaWVzQm94JykgcmVzdWx0cy5zYXZlZFF1ZXJpZXMgPSBpbmZvO1xyXG4gICAgICAgIGVsc2UgaWYgKHJvbGUgPT09ICdDb21tYW5kQnV0dG9uJyB8fCByb2xlID09PSAnQnV0dG9uJykgcmVzdWx0cy5idXR0b25zLnB1c2goaW5mbyk7XHJcbiAgICAgICAgZWxzZSBpZiAocm9sZSA9PT0gJ0NoZWNrQm94JykgcmVzdWx0cy5jaGVja2JveGVzLnB1c2goaW5mbyk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiByZXN1bHRzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyVGFicyhkb2N1bWVudCkge1xyXG4gICAgY29uc3QgcmVzdWx0cyA9IHsgZm9ybU5hbWU6IG51bGwsIGFjdGl2ZVRhYjogbnVsbCwgdGFiczogW10gfTtcclxuICAgIGNvbnN0IG1haW5Gb3JtID0gZ2V0TWFpbkZvcm0oZG9jdW1lbnQpO1xyXG4gICAgaWYgKCFtYWluRm9ybSkgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICByZXN1bHRzLmZvcm1OYW1lID0gbWFpbkZvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuXHJcbiAgICBtYWluRm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIlBpdm90SXRlbVwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIGNvbnN0IGlzQWN0aXZlID0gZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckVsID0gbWFpbkZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1faGVhZGVyXCJdYCk7XHJcbiAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXJFbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fFxyXG4gICAgICAgICAgICBlbC5xdWVyeVNlbGVjdG9yKCcucGl2b3QtbGluay10ZXh0Jyk/LnRleHRDb250ZW50Py50cmltKCkgfHxcclxuICAgICAgICAgICAgZWwudGV4dENvbnRlbnQ/LnRyaW0oKS5zcGxpdCgnXFxuJylbMF07XHJcblxyXG4gICAgICAgIHJlc3VsdHMudGFicy5wdXNoKHsgY29udHJvbE5hbWUsIGxhYmVsOiAobGFiZWwgfHwgJycpLnN1YnN0cmluZygwLCA1MCksIGlzQWN0aXZlIH0pO1xyXG4gICAgICAgIGlmIChpc0FjdGl2ZSkgcmVzdWx0cy5hY3RpdmVUYWIgPSBjb250cm9sTmFtZTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJBY3RpdmVUYWIoZG9jdW1lbnQpIHtcclxuICAgIGNvbnN0IHJlc3VsdHMgPSB7XHJcbiAgICAgICAgZm9ybU5hbWU6IG51bGwsIGFjdGl2ZVRhYjogbnVsbCwgc2VjdGlvbnM6IFtdLFxyXG4gICAgICAgIGZpZWxkczogeyBpbnB1dHM6IFtdLCBjaGVja2JveGVzOiBbXSwgY29tYm9ib3hlczogW10sIGludGVnZXJzOiBbXSwgZGF0ZXM6IFtdIH0sXHJcbiAgICAgICAgc3VtbWFyeToge31cclxuICAgIH07XHJcbiAgICBjb25zdCBtYWluRm9ybSA9IGdldE1haW5Gb3JtKGRvY3VtZW50KTtcclxuICAgIGlmICghbWFpbkZvcm0pIHJldHVybiByZXN1bHRzO1xyXG4gICAgcmVzdWx0cy5mb3JtTmFtZSA9IG1haW5Gb3JtLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcblxyXG4gICAgY29uc3QgYWN0aXZlVGFiRWwgPSBtYWluRm9ybS5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tcm9sZT1cIlBpdm90SXRlbVwiXS5hY3RpdmUsIFtkYXRhLWR5bi1yb2xlPVwiUGl2b3RJdGVtXCJdW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdJyk7XHJcbiAgICBpZiAoYWN0aXZlVGFiRWwpIHJlc3VsdHMuYWN0aXZlVGFiID0gYWN0aXZlVGFiRWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG5cclxuICAgIG1haW5Gb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgIGlmIChlbC5vZmZzZXRQYXJlbnQgPT09IG51bGwpIHJldHVybjtcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICBpZiAoIWNvbnRyb2xOYW1lIHx8IC9eXFxkKyQvLnRlc3QoY29udHJvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgaGVhZGVyRWwgPSBlbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdLCAuc2VjdGlvbi1oZWFkZXInKTtcclxuICAgICAgICBjb25zdCBsYWJlbCA9IGhlYWRlckVsPy50ZXh0Q29udGVudD8udHJpbSgpPy5zcGxpdCgnXFxuJylbMF07XHJcbiAgICAgICAgY29uc3QgaXNFeHBhbmRlZCA9ICFlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpICYmIGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpICE9PSAnZmFsc2UnO1xyXG4gICAgICAgIHJlc3VsdHMuc2VjdGlvbnMucHVzaCh7IGNvbnRyb2xOYW1lLCBsYWJlbDogKGxhYmVsIHx8ICcnKS5zdWJzdHJpbmcoMCwgNTApLCBpc0V4cGFuZGVkIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgbWFpbkZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgIGlmIChlbC5vZmZzZXRQYXJlbnQgPT09IG51bGwpIHJldHVybjtcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICBjb25zdCByb2xlID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgY29uc3QgbGFiZWwgPSBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmICghcm9sZSB8fCAhY29udHJvbE5hbWUgfHwgL15cXGQrJC8udGVzdChjb250cm9sTmFtZSkpIHJldHVybjtcclxuICAgICAgICBjb25zdCBpbmZvID0geyBjb250cm9sTmFtZSwgbGFiZWw6IChsYWJlbCB8fCAnJykuc3Vic3RyaW5nKDAsIDQwKSB9O1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHJvbGUpIHtcclxuICAgICAgICAgICAgY2FzZSAnSW5wdXQnOiBjYXNlICdTdHJpbmcnOiByZXN1bHRzLmZpZWxkcy5pbnB1dHMucHVzaChpbmZvKTsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ0NoZWNrQm94JzogY2FzZSAnWWVzTm8nOiByZXN1bHRzLmZpZWxkcy5jaGVja2JveGVzLnB1c2goaW5mbyk7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdDb21ib0JveCc6IGNhc2UgJ0Ryb3Bkb3duTGlzdCc6IHJlc3VsdHMuZmllbGRzLmNvbWJvYm94ZXMucHVzaChpbmZvKTsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ0ludGVnZXInOiBjYXNlICdSZWFsJzogcmVzdWx0cy5maWVsZHMuaW50ZWdlcnMucHVzaChpbmZvKTsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ0RhdGUnOiBjYXNlICdUaW1lJzogcmVzdWx0cy5maWVsZHMuZGF0ZXMucHVzaChpbmZvKTsgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmVzdWx0cy5zdW1tYXJ5ID0ge1xyXG4gICAgICAgIHNlY3Rpb25zOiByZXN1bHRzLnNlY3Rpb25zLmxlbmd0aCxcclxuICAgICAgICBpbnB1dHM6IHJlc3VsdHMuZmllbGRzLmlucHV0cy5sZW5ndGgsXHJcbiAgICAgICAgY2hlY2tib3hlczogcmVzdWx0cy5maWVsZHMuY2hlY2tib3hlcy5sZW5ndGgsXHJcbiAgICAgICAgY29tYm9ib3hlczogcmVzdWx0cy5maWVsZHMuY29tYm9ib3hlcy5sZW5ndGgsXHJcbiAgICAgICAgaW50ZWdlcnM6IHJlc3VsdHMuZmllbGRzLmludGVnZXJzLmxlbmd0aCxcclxuICAgICAgICBkYXRlczogcmVzdWx0cy5maWVsZHMuZGF0ZXMubGVuZ3RoXHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJBY3Rpb25QYW5lVGFicyhkb2N1bWVudCkge1xyXG4gICAgY29uc3QgcmVzdWx0cyA9IHsgZm9ybU5hbWU6IG51bGwsIGFjdGl2ZVRhYjogbnVsbCwgdGFiczogW10gfTtcclxuICAgIGNvbnN0IG1haW5Gb3JtID0gZ2V0TWFpbkZvcm0oZG9jdW1lbnQpO1xyXG4gICAgaWYgKG1haW5Gb3JtKSByZXN1bHRzLmZvcm1OYW1lID0gbWFpbkZvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuXHJcbiAgICAvLyBNZXRob2QgMTogcm9sZT1cInRhYlwiIG91dHNpZGUgZGlhbG9nc1xyXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJ0YWJcIl0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICBpZiAoZWwuY2xvc2VzdCgnLmRpYWxvZy1jb250ZW50LCBbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJykpIHJldHVybjtcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICBjb25zdCBsYWJlbCA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGVsLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgaWYgKCFjb250cm9sTmFtZSAmJiAhbGFiZWwpIHJldHVybjtcclxuICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHwgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKTtcclxuICAgICAgICBjb25zdCB0YWJJbmZvID0geyBjb250cm9sTmFtZTogY29udHJvbE5hbWUgfHwgKGxhYmVsIHx8ICcnKS5yZXBsYWNlKC9cXHMrL2csICcnKSwgbGFiZWwsIGlzQWN0aXZlIH07XHJcbiAgICAgICAgaWYgKCFyZXN1bHRzLnRhYnMuc29tZSh0ID0+IHQuY29udHJvbE5hbWUgPT09IHRhYkluZm8uY29udHJvbE5hbWUpKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdHMudGFicy5wdXNoKHRhYkluZm8pO1xyXG4gICAgICAgICAgICBpZiAoaXNBY3RpdmUpIHJlc3VsdHMuYWN0aXZlVGFiID0gdGFiSW5mby5jb250cm9sTmFtZTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBNZXRob2QgMjogdGFibGlzdFxyXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJ0YWJsaXN0XCJdJykuZm9yRWFjaCh0YWJsaXN0ID0+IHtcclxuICAgICAgICBpZiAodGFibGlzdC5jbG9zZXN0KCcuZGlhbG9nLWNvbnRlbnQnKSkgcmV0dXJuO1xyXG4gICAgICAgIHRhYmxpc3QucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJ0YWJcIl0sIGJ1dHRvbiwgW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBlbC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lICYmICFsYWJlbCkgcmV0dXJuO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0cy50YWJzLnNvbWUodCA9PiB0LmNvbnRyb2xOYW1lID09PSAoY29udHJvbE5hbWUgfHwgbGFiZWwpKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHwgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKTtcclxuICAgICAgICAgICAgY29uc3QgdGFiSW5mbyA9IHsgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lIHx8IGxhYmVsLCBsYWJlbCwgaXNBY3RpdmUgfTtcclxuICAgICAgICAgICAgcmVzdWx0cy50YWJzLnB1c2godGFiSW5mbyk7XHJcbiAgICAgICAgICAgIGlmIChpc0FjdGl2ZSkgcmVzdWx0cy5hY3RpdmVUYWIgPSB0YWJJbmZvLmNvbnRyb2xOYW1lO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJGb3JtSW5wdXRzKGRvY3VtZW50LCBmb3JtTmFtZSkge1xyXG4gICAgY29uc3QgZm9ybSA9IGZvcm1OYW1lXHJcbiAgICAgICAgPyBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tZm9ybS1uYW1lPVwiJHtmb3JtTmFtZX1cIl1gKVxyXG4gICAgICAgIDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZV06bGFzdC1vZi10eXBlJyk7XHJcblxyXG4gICAgaWYgKCFmb3JtKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICBjb25zdCBhY3R1YWxGb3JtTmFtZSA9IGZvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgIGNvbnN0IHJlc3VsdHMgPSB7XHJcbiAgICAgICAgZm9ybU5hbWU6IGFjdHVhbEZvcm1OYW1lLFxyXG4gICAgICAgIGlucHV0czogW10sIGNoZWNrYm94ZXM6IFtdLCBjb21ib2JveGVzOiBbXSwgcmFkaW9CdXR0b25zOiBbXSxcclxuICAgICAgICBkYXRlRmllbGRzOiBbXSwgdGltZUZpZWxkczogW10sIGludGVnZXJGaWVsZHM6IFtdLCBzdHJpbmdGaWVsZHM6IFtdXHJcbiAgICB9O1xyXG5cclxuICAgIGZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgIGNvbnN0IHJvbGUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICBjb25zdCBsYWJlbCA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKCkgfHwgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgZWwuZ2V0QXR0cmlidXRlKCd0aXRsZScpO1xyXG4gICAgICAgIGlmICghcm9sZSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGluZm8gPSB7IGNvbnRyb2xOYW1lLCByb2xlLCBsYWJlbCB9O1xyXG4gICAgICAgIHJlc3VsdHMuaW5wdXRzLnB1c2goaW5mbyk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAocm9sZSkge1xyXG4gICAgICAgICAgICBjYXNlICdDaGVja0JveCc6IGNhc2UgJ1llc05vJzogcmVzdWx0cy5jaGVja2JveGVzLnB1c2goaW5mbyk7IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdDb21ib0JveCc6IGNhc2UgJ0Ryb3Bkb3duTGlzdCc6IHJlc3VsdHMuY29tYm9ib3hlcy5wdXNoKGluZm8pOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnUmFkaW9CdXR0b24nOiByZXN1bHRzLnJhZGlvQnV0dG9ucy5wdXNoKGluZm8pOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnRGF0ZSc6IHJlc3VsdHMuZGF0ZUZpZWxkcy5wdXNoKGluZm8pOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnVGltZSc6IHJlc3VsdHMudGltZUZpZWxkcy5wdXNoKGluZm8pOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnSW50ZWdlcic6IGNhc2UgJ1JlYWwnOiByZXN1bHRzLmludGVnZXJGaWVsZHMucHVzaChpbmZvKTsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ1N0cmluZyc6IGNhc2UgJ0lucHV0JzogcmVzdWx0cy5zdHJpbmdGaWVsZHMucHVzaChpbmZvKTsgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJFdmVyeXRoaW5nKGRvY3VtZW50LCB3aW5kb3cpIHtcclxuICAgIGNvbnN0IHJlc3VsdHMgPSB7XHJcbiAgICAgICAgdXJsOiB7XHJcbiAgICAgICAgICAgIGZ1bGw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxyXG4gICAgICAgICAgICBtZW51SXRlbTogbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoJ21pJyksXHJcbiAgICAgICAgICAgIGNvbXBhbnk6IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdjbXAnKVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZm9ybXM6IFtdLFxyXG4gICAgICAgIGJ5Rm9ybToge31cclxuICAgIH07XHJcblxyXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWZvcm0tbmFtZV0nKS5mb3JFYWNoKGZvcm1FbCA9PiB7XHJcbiAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBmb3JtRWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICBjb25zdCBpc1Zpc2libGUgPSBmb3JtRWwub2Zmc2V0UGFyZW50ICE9PSBudWxsO1xyXG4gICAgICAgIHJlc3VsdHMuZm9ybXMucHVzaCh7IGZvcm1OYW1lLCBpc1Zpc2libGUgfSk7XHJcbiAgICAgICAgaWYgKCFpc1Zpc2libGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgZm9ybURhdGEgPSB7IHRhYnM6IFtdLCBzZWN0aW9uczogW10sIGJ1dHRvbnM6IFtdLCBpbnB1dHM6IFtdLCBncmlkczogW10gfTtcclxuXHJcbiAgICAgICAgZm9ybUVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiUGl2b3RJdGVtXCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGZvcm1EYXRhLnRhYnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpLFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6IGVsLnRleHRDb250ZW50Py50cmltKCkuc3BsaXQoJ1xcbicpWzBdXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBmb3JtRWwucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJHcm91cFwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGNvbnRyb2xOYW1lICYmICEvXlxcZCskLy50ZXN0KGNvbnRyb2xOYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgZm9ybURhdGEuc2VjdGlvbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsLCAuc2VjdGlvbi1oZWFkZXInKT8udGV4dENvbnRlbnQ/LnRyaW0oKVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgZm9ybUVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlKj1cIkJ1dHRvblwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGNvbnRyb2xOYW1lICYmICEvXlxcZCskLy50ZXN0KGNvbnRyb2xOYW1lKSAmJiAhY29udHJvbE5hbWUuaW5jbHVkZXMoJ0NsZWFyJykpIHtcclxuICAgICAgICAgICAgICAgIGZvcm1EYXRhLmJ1dHRvbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgcm9sZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6IGVsLnRleHRDb250ZW50Py50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnN1YnN0cmluZygwLCA1MClcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGlucHV0Um9sZXMgPSBbJ0lucHV0JywgJ1N0cmluZycsICdJbnRlZ2VyJywgJ1JlYWwnLCAnRGF0ZScsICdUaW1lJywgJ0NoZWNrQm94JywgJ1llc05vJywgJ0NvbWJvQm94JywgJ1JhZGlvQnV0dG9uJ107XHJcbiAgICAgICAgaW5wdXRSb2xlcy5mb3JFYWNoKHJvbGUgPT4ge1xyXG4gICAgICAgICAgICBmb3JtRWwucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLXJvbGU9XCIke3JvbGV9XCJdYCkuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgIGlmIChjb250cm9sTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1EYXRhLmlucHV0cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUsIHJvbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsOiBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBmb3JtRWwucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdLCBbZGF0YS1keW4tcm9sZT1cIlJlYWN0TGlzdFwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBmb3JtRGF0YS5ncmlkcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXHJcbiAgICAgICAgICAgICAgICByb2xlOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmVzdWx0cy5ieUZvcm1bZm9ybU5hbWVdID0gZm9ybURhdGE7XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gcmVzdWx0cztcclxufVxyXG5cclxuZnVuY3Rpb24gYWRtaW5HZW5lcmF0ZVN0ZXBzRm9yVGFiKGRvY3VtZW50KSB7XHJcbiAgICBjb25zdCB0YWJEYXRhID0gYWRtaW5EaXNjb3ZlckFjdGl2ZVRhYihkb2N1bWVudCk7XHJcbiAgICBpZiAoIXRhYkRhdGEuYWN0aXZlVGFiKSByZXR1cm4geyBhY3RpdmVUYWI6IG51bGwsIHN0ZXBzOiBbXSB9O1xyXG5cclxuICAgIGNvbnN0IHN0ZXBzID0gW107XHJcbiAgICBzdGVwcy5wdXNoKHsgdHlwZTogJ3RhYi1uYXZpZ2F0ZScsIGNvbnRyb2xOYW1lOiB0YWJEYXRhLmFjdGl2ZVRhYiwgZGlzcGxheVRleHQ6IGBTd2l0Y2ggdG8gJHt0YWJEYXRhLmFjdGl2ZVRhYn0gdGFiYCwgdmFsdWU6ICcnIH0pO1xyXG5cclxuICAgIHRhYkRhdGEuZmllbGRzLmlucHV0cy5mb3JFYWNoKGYgPT4ge1xyXG4gICAgICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAnaW5wdXQnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICcnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xyXG4gICAgfSk7XHJcbiAgICB0YWJEYXRhLmZpZWxkcy5jaGVja2JveGVzLmZvckVhY2goZiA9PiB7XHJcbiAgICAgICAgc3RlcHMucHVzaCh7IHR5cGU6ICdjaGVja2JveCcsIGNvbnRyb2xOYW1lOiBmLmNvbnRyb2xOYW1lLCB2YWx1ZTogJ3RydWUnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xyXG4gICAgfSk7XHJcbiAgICB0YWJEYXRhLmZpZWxkcy5jb21ib2JveGVzLmZvckVhY2goZiA9PiB7XHJcbiAgICAgICAgc3RlcHMucHVzaCh7IHR5cGU6ICdzZWxlY3QnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICcnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xyXG4gICAgfSk7XHJcbiAgICB0YWJEYXRhLmZpZWxkcy5pbnRlZ2Vycy5mb3JFYWNoKGYgPT4ge1xyXG4gICAgICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAnaW5wdXQnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICcnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xyXG4gICAgfSk7XHJcbiAgICB0YWJEYXRhLmZpZWxkcy5kYXRlcy5mb3JFYWNoKGYgPT4ge1xyXG4gICAgICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAnaW5wdXQnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICcnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHsgYWN0aXZlVGFiOiB0YWJEYXRhLmFjdGl2ZVRhYiwgc3RlcHMgfTtcclxufVxyXG5cclxuICAgIHJldHVybiB7IHN0YXJ0ZWQ6IHRydWUgfTtcclxufVxyXG5cclxuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgIHN0YXJ0SW5qZWN0ZWQoeyB3aW5kb3dPYmo6IHdpbmRvdywgZG9jdW1lbnRPYmo6IGRvY3VtZW50IH0pO1xyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBRUEsTUFBcUIsZ0JBQXJCLE1BQW1DO0FBQUEsSUFDL0IsY0FBYztBQUNWLFdBQUssZUFBZTtBQUNwQixXQUFLLG1CQUFtQjtBQUN4QixXQUFLLFVBQVU7QUFBQSxJQUNuQjtBQUFBO0FBQUEsSUFHQSxtQkFBbUIsU0FBUztBQUV4QixZQUFNLGdCQUFnQixRQUFRLFFBQVEsc0JBQXNCO0FBQzVELFVBQUksZUFB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LGFBQWEsT0FBTyxRQUFRLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDckgsQ0FBQztBQUNELGNBQVEsT0FBTyxXQUFXLFFBQVEsT0FBSztBQUNuQyxjQUFNLEtBQUssRUFBRSxNQUFNLFVBQVUsYUFBYSxFQUFFLGFBQWEsT0FBTyxJQUFJLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDL0csQ0FBQztBQUNELGNBQVEsT0FBTyxTQUFTLFFBQVEsT0FBSztBQUNqQyxjQUFNLEtBQUssRUFBRSxNQUFNLFNBQVMsYUFBYSxFQUFFLGFBQWEsT0FBTyxJQUFJLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDOUcsQ0FBQztBQUNELGNBQVEsT0FBTyxNQUFNLFFBQVEsT0FBSztBQUM5QixjQUFNLEtBQUssRUFBRSxNQUFNLFNBQVMsYUFBYSxFQUFFLGFBQWEsT0FBTyxJQUFJLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDOUcsQ0FBQztBQUVELGFBQU8sRUFBRSxXQUFXLFFBQVEsV0FBVyxNQUFNO0FBQUEsSUFDakQ7QUFFSSxXQUFPLEVBQUUsU0FBUyxLQUFLO0FBQUEsRUFDM0I7QUFFQSxNQUFJLE9BQU8sV0FBVyxlQUFlLE9BQU8sYUFBYSxhQUFhO0FBQ2xFLGtCQUFjLEVBQUUsV0FBVyxRQUFRLGFBQWEsU0FBUyxDQUFDO0FBQUEsRUFDOUQ7IiwKICAibmFtZXMiOiBbImhhc0xvb2t1cEJ1dHRvbiIsICJ0b3AiLCAiY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZCIsICJmaWx0ZXJJbnB1dCIsICJmaWx0ZXJGaWVsZENvbnRhaW5lciIsICJyb3ciLCAib3B0aW9ucyIsICJ3aW5kb3ciLCAiZG9jdW1lbnQiLCAibmF2aWdhdG9yIiwgImdldFRpbWluZ3MiLCAid2FpdEZvclRpbWluZyIsICJrZXkiLCAicmVzdWx0IiwgImluc3BlY3RvciJdCn0K
