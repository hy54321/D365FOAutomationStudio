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
      '.dyn-loadingStub:not([style*="display: none"])'
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
    return false;
  }
  function findGridCellElement(controlName) {
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
  function comboInputWithSelectedMethod2(input, value) {
    const method = window.d365CurrentWorkflowSettings?.comboSelectMode || "method3";
    return comboInputWithSelectedMethod(input, value, method);
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
    element.click();
    await sleep(800);
  }
  async function applyGridFilter(controlName, filterValue, filterMethod = "is exactly") {
    console.log(`Applying filter: ${controlName} ${filterMethod} "${filterValue}"`);
    const { gridName, columnName } = parseGridAndColumn(controlName);
    console.log(`  Grid: ${gridName}, Column: ${columnName}`);
    async function findFilterInput() {
      const filterFieldPatterns = buildFilterFieldPatterns(controlName, gridName, columnName);
      let filterInput2 = null;
      let filterFieldContainer2 = null;
      for (const pattern of filterFieldPatterns) {
        filterFieldContainer2 = document.querySelector(`[data-dyn-controlname="${pattern}"]`);
        if (filterFieldContainer2) {
          filterInput2 = filterFieldContainer2.querySelector('input:not([type="hidden"])') || filterFieldContainer2.querySelector("input");
          if (filterInput2 && filterInput2.offsetParent !== null) {
            console.log(`  Found filter field: ${pattern}`);
            return { filterInput: filterInput2, filterFieldContainer: filterFieldContainer2 };
          }
        }
      }
      const partialMatches = document.querySelectorAll(`[data-dyn-controlname*="FilterField"][data-dyn-controlname*="${columnName}"]`);
      for (const container of partialMatches) {
        filterInput2 = container.querySelector('input:not([type="hidden"])');
        if (filterInput2 && filterInput2.offsetParent !== null) {
          console.log(`  Found filter field (partial match): ${container.getAttribute("data-dyn-controlname")}`);
          return { filterInput: filterInput2, filterFieldContainer: container };
        }
      }
      const filterContainers = document.querySelectorAll('.dyn-filter-popup, .filter-panel, [data-dyn-role="FilterPane"], [class*="filter"]');
      for (const container of filterContainers) {
        filterInput2 = container.querySelector('input:not([type="hidden"]):not([readonly])');
        if (filterInput2 && filterInput2.offsetParent !== null) {
          console.log(`  Found filter input in filter container`);
          return { filterInput: filterInput2, filterFieldContainer: container };
        }
      }
      const visibleFilterInputs = document.querySelectorAll('[data-dyn-controlname*="FilterField"] input:not([type="hidden"])');
      for (const inp of visibleFilterInputs) {
        if (inp.offsetParent !== null) {
          filterFieldContainer2 = inp.closest('[data-dyn-controlname*="FilterField"]');
          console.log(`  Found visible filter field: ${filterFieldContainer2?.getAttribute("data-dyn-controlname")}`);
          return { filterInput: inp, filterFieldContainer: filterFieldContainer2 };
        }
      }
      return { filterInput: null, filterFieldContainer: null };
    }
    let { filterInput, filterFieldContainer } = await findFilterInput();
    if (!filterInput) {
      console.log(`  Filter panel not open, clicking header to open...`);
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
      await sleep(800);
      for (let attempt = 0; attempt < 10; attempt++) {
        ({ filterInput, filterFieldContainer } = await findFilterInput());
        if (filterInput)
          break;
        await sleep(200);
      }
    }
    if (!filterInput) {
      const allFilterFields = document.querySelectorAll('[data-dyn-controlname*="FilterField"]');
      console.log(`  Debug: Found ${allFilterFields.length} FilterField elements:`);
      allFilterFields.forEach((el) => {
        console.log(`    - ${el.getAttribute("data-dyn-controlname")}, visible: ${el.offsetParent !== null}`);
      });
      throw new Error(`Filter input not found. Make sure the filter dropdown is open. Expected pattern: FilterField_${gridName}_${columnName}_${columnName}_Input_0`);
    }
    if (filterMethod && filterMethod !== "is exactly") {
      await setFilterMethod(filterFieldContainer, filterMethod);
    }
    filterInput.focus();
    await sleep(100);
    filterInput.select();
    filterInput.value = "";
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(100);
    setNativeValue(filterInput, filterValue);
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));
    filterInput.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(300);
    const applyBtnPatterns = buildApplyButtonPatterns(controlName, gridName, columnName);
    let applyBtn = null;
    for (const pattern of applyBtnPatterns) {
      applyBtn = document.querySelector(`[data-dyn-controlname="${pattern}"]`);
      if (applyBtn && applyBtn.offsetParent !== null) {
        console.log(`  Found apply button: ${pattern}`);
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
      await sleep(1e3);
      console.log(`  \u2713 Filter applied: "${filterValue}"`);
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
      await sleep(1e3);
      console.log(`  \u2713 Filter applied via Enter: "${filterValue}"`);
    }
  }
  async function waitUntilCondition(controlName, condition, expectedValue, timeout) {
    console.log(`Waiting for: ${controlName} to be ${condition} (timeout: ${timeout}ms)`);
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
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
        console.log(`  \u2713 Condition met: ${controlName} is ${condition}`);
        await sleep(200);
        return;
      }
      await sleep(100);
    }
    throw new Error(`Timeout waiting for "${controlName}" to be ${condition} (waited ${timeout}ms)`);
  }
  async function setInputValue(controlName, value, fieldType) {
    const element = findElementInActiveContext(controlName);
    if (!element)
      throw new Error(`Element not found: ${controlName}`);
    if (fieldType?.type === "segmented-lookup" || isSegmentedEntry(element)) {
      await setSegmentedEntryValue(element, value);
      return;
    }
    if (fieldType?.inputType === "enum" || element.getAttribute("data-dyn-role") === "ComboBox") {
      await setComboBoxValue(element, value);
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
    await sleep(150);
    if (input.tagName !== "SELECT") {
      await comboInputWithSelectedMethod2(input, value);
    } else {
      setNativeValue(input, value);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await sleep(400);
  }
  async function setGridCellValue(controlName, value, fieldType, waitForValidation = false) {
    console.log(`Setting grid cell value: ${controlName} = "${value}" (waitForValidation=${waitForValidation})`);
    await waitForActiveGridRow(controlName);
    let element = findGridCellElement(controlName);
    if (!element) {
      await activateGridRow(controlName);
      await sleep(300);
      element = findGridCellElement(controlName);
    }
    if (!element) {
      throw new Error(`Grid cell element not found: ${controlName}`);
    }
    const reactCell = element.closest(".fixedDataTableCellLayout_main") || element;
    const isReactGrid = !!element.closest(".reactGrid");
    console.log(`  Clicking cell to activate: isReactGrid=${isReactGrid}`);
    reactCell.click();
    await sleep(300);
    if (isReactGrid) {
      await sleep(200);
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
        await sleep(200);
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
      const gridContainer = element.closest('.reactGrid, [data-dyn-role="Grid"]');
      const allInputs = gridContainer?.querySelectorAll('input:not([type="hidden"])');
      console.log("Available inputs in grid:", Array.from(allInputs || []).map((i) => ({
        name: i.closest("[data-dyn-controlname]")?.getAttribute("data-dyn-controlname"),
        visible: i.offsetParent !== null
      })));
      throw new Error(`Input not found in grid cell: ${controlName}. The cell may need to be clicked to become editable.`);
    }
    const role = element.getAttribute("data-dyn-role");
    if (fieldType?.type === "segmented-lookup" || role === "SegmentedEntry" || isSegmentedEntry(element)) {
      await setSegmentedEntryValue(element, value);
      return;
    }
    if (fieldType?.inputType === "enum" || role === "ComboBox") {
      await setComboBoxValue(element, value);
      return;
    }
    if (role === "Lookup" || role === "ReferenceGroup" || hasLookupButton(element)) {
      await setLookupSelectValue(controlName, value);
      return;
    }
    input.focus();
    await sleep(100);
    input.select?.();
    await sleep(50);
    await comboInputWithSelectedMethod2(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(200);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    await sleep(300);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", keyCode: 9, which: 9, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", code: "Tab", keyCode: 9, which: 9, bubbles: true }));
    await sleep(200);
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true, relatedTarget: null }));
    await sleep(200);
    const row = input.closest('.fixedDataTableRowLayout_main, [data-dyn-role="Row"]');
    if (row) {
      const otherCell = row.querySelector(".fixedDataTableCellLayout_main:not(:focus-within)");
      if (otherCell && otherCell !== input.closest(".fixedDataTableCellLayout_main")) {
        otherCell.click();
        await sleep(200);
      }
    }
    await sleep(500);
    if (waitForValidation) {
      console.log(`  Waiting for D365 validation of ${controlName}...`);
      await waitForD365Validation(controlName, 5e3);
    }
    console.log(`  Grid cell value set: ${controlName} = "${value}"`);
  }
  async function waitForD365Validation(controlName, timeout = 5e3) {
    const startTime = Date.now();
    let lastLoadingState = false;
    let seenLoading = false;
    while (Date.now() - startTime < timeout) {
      const isLoading = isD365Loading();
      if (isLoading && !lastLoadingState) {
        console.log("    D365 validation started (loading indicator appeared)");
        seenLoading = true;
      } else if (!isLoading && lastLoadingState && seenLoading) {
        console.log("    D365 validation completed (loading indicator gone)");
        await sleep(300);
        return true;
      }
      lastLoadingState = isLoading;
      const cell = findGridCellElement(controlName);
      if (cell) {
        const cellText = cell.textContent || "";
        const hasMultipleValues = cellText.split(/\s{2,}|\n/).filter((t) => t.trim()).length > 1;
        if (hasMultipleValues) {
          console.log("    D365 validation completed (cell content updated)");
          await sleep(200);
          return true;
        }
      }
      await sleep(100);
    }
    if (seenLoading) {
      console.log("    Validation timeout reached, but saw loading - waiting extra time");
      await sleep(500);
    }
    console.log("    Validation wait completed (timeout or no loading detected)");
    return false;
  }
  async function waitForActiveGridRow(controlName, timeout = 2e3) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const selectedRows = document.querySelectorAll(
        '[data-dyn-selected="true"], [aria-selected="true"], .dyn-selectedRow'
      );
      for (const row of selectedRows) {
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
          const cell = activeRow.querySelector(`[data-dyn-controlname="${controlName}"]`);
          if (cell && cell.offsetParent !== null)
            return true;
        }
      }
      await sleep(100);
    }
    console.log(`[D365] waitForActiveGridRow: no active row found for ${controlName} within ${timeout}ms, proceeding with fallback`);
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
            await sleep(200);
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
          await sleep(200);
          return true;
        }
      }
    }
    return false;
  }
  async function setLookupSelectValue(controlName, value) {
    const element = findElementInActiveContext(controlName);
    if (!element)
      throw new Error(`Element not found: ${controlName}`);
    const input = element.querySelector('input, [role="textbox"]');
    if (!input)
      throw new Error("Input not found in lookup field");
    const lookupButton = findLookupButton(element);
    if (lookupButton) {
      lookupButton.click();
      await sleep(800);
    } else {
      input.focus();
      await sleep(100);
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
      await sleep(50);
      await comboInputWithSelectedMethod2(dockInput, value);
      dockInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      dockInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      await sleep(600);
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
        await sleep(500);
        target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
        await commitLookupValue(input);
        const applied = await waitForInputValue(input, value);
        if (!applied) {
          target.click();
          await sleep(200);
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
      await sleep(300);
      if (isCustomToggle) {
        checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        checkbox.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      }
    }
  }
  async function openLookupByKeyboard(input) {
    input.focus();
    await sleep(50);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", altKey: true, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", code: "ArrowDown", altKey: true, bubbles: true }));
    await sleep(150);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "F4", code: "F4", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "F4", code: "F4", bubbles: true }));
    await sleep(300);
  }
  async function commitLookupValue(input) {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", code: "Tab", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await sleep(800);
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
      await sleep(500);
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
      await sleep(300);
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
    await sleep(500);
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
    await sleep(100);
    clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    clickTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    clickTarget.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await sleep(300);
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
    await sleep(800);
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
    await sleep(100);
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
    await sleep(600);
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
      await sleep(500);
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
      await sleep(300);
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
        await sleep(1e3);
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
          await sleep(300);
          await setInputValueInForm(input, options.savedQuery);
          await sleep(500);
        }
      }
    }
    const rangeTab = findInQuery("RangeTab") || findInQuery("RangeTab_header");
    if (rangeTab && !rangeTab.classList.contains("active") && rangeTab.getAttribute("aria-selected") !== "true") {
      rangeTab.click();
      await sleep(300);
    }
    const addButton = findInQuery("RangeAdd");
    if (addButton) {
      addButton.click();
      await sleep(500);
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
        await setInputValueInForm(input, tableName);
        await sleep(300);
      }
    }
    if (fieldName) {
      const fieldCells = grid.querySelectorAll('[data-dyn-controlname="RangeField"]');
      const lastFieldCell = fieldCells[fieldCells.length - 1] || grid.querySelector('[data-dyn-controlname="RangeField"]');
      if (lastFieldCell) {
        const input = lastFieldCell.querySelector("input") || lastFieldCell;
        input.click?.();
        await sleep(200);
        await setInputValueInForm(input, fieldName);
        await sleep(300);
      }
    }
    if (criteriaValue) {
      const valueCells = grid.querySelectorAll('[data-dyn-controlname="RangeValue"]');
      const lastValueCell = valueCells[valueCells.length - 1] || grid.querySelector('[data-dyn-controlname="RangeValue"]');
      if (lastValueCell) {
        const input = lastValueCell.querySelector("input") || lastValueCell;
        input.click?.();
        await sleep(200);
        await setInputValueInForm(input, criteriaValue);
        await sleep(300);
      }
    }
    logStep("Query filter configured");
  }
  async function configureBatchProcessing(enabled, taskDescription, batchGroup, options = {}) {
    logStep(`Configuring batch processing: ${enabled ? "enabled" : "disabled"}`);
    await sleep(300);
    const batchToggle = document.querySelector('[data-dyn-form-name="SysOperationTemplateForm"] [data-dyn-controlname="Fld1_1"]') || findElementInActiveContext("Fld1_1") || document.querySelector('[data-dyn-controlname="Fld1_1"]');
    if (batchToggle) {
      const checkbox = batchToggle.querySelector('input[type="checkbox"]') || batchToggle.querySelector('[role="checkbox"]') || batchToggle.querySelector(".toggle-button");
      const currentState = checkbox?.checked || batchToggle.classList.contains("on") || batchToggle.getAttribute("aria-checked") === "true";
      if (currentState !== enabled) {
        const clickTarget = checkbox || batchToggle.querySelector("button, .toggle-switch, label") || batchToggle;
        clickTarget.click();
        await sleep(500);
      }
    } else {
      logStep("Warning: Batch processing toggle (Fld1_1) not found");
    }
    if (enabled && taskDescription) {
      await setInputValue("Fld2_1", taskDescription);
      await sleep(200);
    }
    if (enabled && batchGroup) {
      await setInputValue("Fld3_1", batchGroup);
      await sleep(200);
    }
    if (enabled && options.private !== void 0) {
      await setCheckbox("Fld4_1", options.private);
      await sleep(200);
    }
    if (enabled && options.criticalJob !== void 0) {
      await setCheckbox("Fld5_1", options.criticalJob);
      await sleep(200);
    }
    if (enabled && options.monitoringCategory) {
      await setComboBoxValue("Fld6_1", options.monitoringCategory);
      await sleep(200);
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
        await sleep(1e3);
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
        await sleep(300);
      }
    }
    if (startTime) {
      const startTimeInput = findInRecurrence("StartTime")?.querySelector("input") || findInRecurrence("StartTime");
      if (startTimeInput) {
        await setInputValueInForm(startTimeInput, startTime);
        await sleep(300);
      }
    }
    if (timezone) {
      const timezoneControl = findInRecurrence("Timezone");
      if (timezoneControl) {
        const input = timezoneControl.querySelector("input");
        if (input) {
          input.click();
          await sleep(200);
          await setInputValueInForm(input, timezone);
          await sleep(300);
        }
      }
    }
    if (patternUnit !== void 0) {
      const patternUnitControl = findInRecurrence("PatternUnit");
      if (patternUnitControl) {
        const radioInputs = patternUnitControl.querySelectorAll('input[type="radio"]');
        if (radioInputs.length > patternUnit) {
          radioInputs[patternUnit].click();
          await sleep(500);
        } else {
          const radioOptions = patternUnitControl.querySelectorAll('[role="radio"], label, button');
          if (radioOptions.length > patternUnit) {
            radioOptions[patternUnit].click();
            await sleep(500);
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
        await sleep(300);
      }
    }
    if (endDateOption === "noEndDate") {
      const noEndDateGroup = findInRecurrence("EndDate1");
      if (noEndDateGroup) {
        const radio = noEndDateGroup.querySelector('input[type="radio"], [role="radio"]') || noEndDateGroup;
        radio.click();
        await sleep(300);
      }
    } else if (endDateOption === "endAfter" && endAfterCount) {
      const endAfterGroup = findInRecurrence("EndDate2");
      if (endAfterGroup) {
        const radio = endAfterGroup.querySelector('input[type="radio"], [role="radio"]') || endAfterGroup;
        radio.click();
        await sleep(300);
      }
      const countControl = findInRecurrence("EndDateInt");
      if (countControl) {
        const input = countControl.querySelector("input") || countControl;
        await setInputValueInForm(input, endAfterCount.toString());
        await sleep(300);
      }
    } else if (endDateOption === "endBy" && endByDate) {
      const endByGroup = findInRecurrence("EndDate3");
      if (endByGroup) {
        const radio = endByGroup.querySelector('input[type="radio"], [role="radio"]') || endByGroup;
        radio.click();
        await sleep(300);
      }
      const dateControl = findInRecurrence("EndDateDate");
      if (dateControl) {
        const input = dateControl.querySelector("input") || dateControl;
        await setInputValueInForm(input, endByDate);
        await sleep(300);
      }
    }
    logStep("Recurrence configured");
  }
  async function setInputValueInForm(inputElement, value) {
    if (!inputElement)
      return;
    inputElement.focus();
    await sleep(100);
    inputElement.select?.();
    inputElement.value = value;
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
      console.log(`  \u26A0 Filter operator dropdown not found, using default method`);
      return;
    }
    const dropdownButton = operatorDropdown.querySelector('button, [role="combobox"], .dyn-comboBox-button') || operatorDropdown;
    dropdownButton.click();
    await sleep(300);
    const searchTerms = getFilterMethodSearchTerms(method);
    const options = document.querySelectorAll('[role="option"], [role="listitem"], .dyn-listView-item');
    for (const opt of options) {
      const text = opt.textContent.toLowerCase();
      if (textIncludesAny(text, searchTerms)) {
        opt.click();
        await sleep(200);
        console.log(`  Set filter method: ${method}`);
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
          await sleep(200);
          console.log(`  Set filter method: ${method}`);
          return;
        }
      }
    }
    console.log(`  \u26A0 Could not set filter method "${method}", using default`);
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
      await sleep(500);
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
        await sleep(500);
        return;
      }
    }
    throw new Error(`Radio option not found for value: ${value}`);
  }
  async function setSegmentedEntryValue(element, value) {
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
      await sleep(800);
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
        await sleep(50);
        await comboInputWithSelectedMethod2(dockInput, value);
        dockInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        dockInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
        await sleep(800);
      }
    }
    const lookupInput = lookupPopup.querySelector('input[type="text"], input[role="textbox"]');
    if (lookupInput) {
      lookupInput.click?.();
      lookupInput.focus();
      await sleep(50);
      await comboInputWithSelectedMethod2(lookupInput, value);
      lookupInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      lookupInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      await sleep(1e3);
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
        await sleep(500);
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
      await sleep(300);
      await setValueWithVerify(input, value);
      await commitLookupValue(input);
    }
  }
  async function setComboBoxValue(element, value) {
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
      await sleep(300);
      return;
    }
    const comboButton = findComboBoxButton(element);
    if (comboButton) {
      comboButton.click();
    } else {
      input.click?.();
    }
    input.focus();
    await sleep(200);
    if (!input.readOnly && !input.disabled) {
      await comboInputWithSelectedMethod2(input, value);
    }
    const listbox = await waitForListboxForInput(input, element);
    if (!listbox) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      await sleep(300);
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
        await sleep(400);
        if (normalizeText(input.value) !== normalizeText(optionText)) {
          commitComboValue(input, optionText, element);
        } else {
          commitComboValue(input, input.value, element);
        }
        matched = true;
        await sleep(300);
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
    let currentWorkflow = null;
    let executionControl = {
      isPaused: false,
      isStopped: false,
      currentStepIndex: 0,
      currentRowIndex: 0,
      totalRows: 0,
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
        await sleep(200);
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
      const matchMode = triggerMatchMode === "exact" ? "exact" : "contains";
      if (triggerTemplate) {
        if (matchMode === "exact") {
          if (triggerTemplate !== eventTemplate)
            return false;
        } else if (!(eventTemplate.includes(triggerTemplate) || triggerTemplate.includes(eventTemplate))) {
          return false;
        }
      }
      if (triggerMatchMode === "regex") {
        try {
          const pattern = trigger.regex || trigger.textTemplate || "";
          if (!pattern || !new RegExp(pattern, "i").test(event.templateText || event.text || "")) {
            return false;
          }
        } catch (error) {
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
        /(\b[a-z][a-z0-9 _()/-]*\s*:\s*)([^.]+?)(\.\s*the record already exists\.?)/i,
        "$1{value}$3"
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
        await sleep(120);
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
          await sleep(350);
          return true;
        }
      }
      if (action?.type === "clickButton" && event.kind === "messageBar") {
        const control = findMessageBarControl(event, action.buttonControlName || action.buttonText);
        if (control?.element) {
          control.element.click();
          await sleep(350);
          return true;
        }
      }
      if (action?.type === "clickButton") {
        const globalControl = findGlobalClickable(action.buttonControlName || action.buttonText);
        if (!globalControl?.element)
          return false;
        globalControl.element.click();
        await sleep(350);
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
        await sleep(250);
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
        const activeEvent = currentEvents[0] || event;
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
        await sleep(150);
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
          await sleep(350);
          const followup = decision?.selectedFollowupOption || null;
          if (followup && normalizeText(followup.controlName || followup.text || "") !== normalizeText(option.controlName || option.text || "")) {
            const refreshEvents = detectUnexpectedEvents();
            const followupEvent = refreshEvents[0] || event;
            const followupElement = findEventOptionElement(followupEvent, followup);
            if (followupElement && typeof followupElement.click === "function") {
              followupElement.click();
              clickedFollowupOption = followup;
              await sleep(350);
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
      return { signal: "none" };
    }
    async function handleUnexpectedEvents(learningMode) {
      const maxDepth = 6;
      for (let depth = 0; depth < maxDepth; depth++) {
        const events = detectUnexpectedEvents();
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
        sendLog("info", `Workflow complete: processed ${primaryData.length} rows`);
        window2.postMessage({
          type: "D365_WORKFLOW_COMPLETE",
          result: { processed: primaryData.length }
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
            await setInputValue(step.controlName, resolvedValue, step.fieldType);
            break;
          case "lookupSelect":
            await setLookupSelectValue(step.controlName, resolvedValue);
            break;
          case "checkbox":
            await setCheckboxValue(step.controlName, coerceBoolean(step.value));
            break;
          case "gridInput":
            await setGridCellValue(step.controlName, resolvedValue, step.fieldType, !!step.waitForValidation);
            break;
          case "filter":
            await applyGridFilter(step.controlName, resolvedValue, step.filterMethod || "is exactly");
            break;
          case "queryFilter":
            await configureQueryFilter(step.tableName, step.fieldName, resolvedValue, {
              savedQuery: step.savedQuery,
              closeDialogAfter: step.closeDialogAfter
            });
            break;
          case "wait":
            await sleep(Number(step.duration) || 500);
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
              sendLog("info", `Entering loop: ${step.loopName || "Loop"} (count=${loopCount})`);
              for (let iterIndex = 0; iterIndex < loopCount; iterIndex++) {
                await checkExecutionControl();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luamVjdGVkL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb2dnaW5nLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9hc3luYy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvdGV4dC5qcyIsICJzcmMvaW5qZWN0ZWQvcnVudGltZS9lbmdpbmUtdXRpbHMuanMiLCAic3JjL2luamVjdGVkL3J1bnRpbWUvY29uZGl0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvZG9tLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb29rdXAuanMiLCAic3JjL2luamVjdGVkL3V0aWxzL2NvbWJvYm94LmpzIiwgInNyYy9pbmplY3RlZC9zdGVwcy9hY3Rpb24taGVscGVycy5qcyIsICJzcmMvaW5qZWN0ZWQvc3RlcHMvYWN0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEQzNjVGTyBFbGVtZW50IEluc3BlY3RvciBhbmQgRGlzY292ZXJ5IE1vZHVsZVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRDM2NUluc3BlY3RvciB7XHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudCA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5ID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgdGhlIGZvcm0gbmFtZSB0aGF0IGNvbnRhaW5zIGFuIGVsZW1lbnRcclxuICAgIGdldEVsZW1lbnRGb3JtTmFtZShlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gTG9vayBmb3IgdGhlIGNsb3Nlc3QgZm9ybSBjb250YWluZXJcclxuICAgICAgICBjb25zdCBmb3JtQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgIGlmIChmb3JtQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb3JtQ29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIGZvcm0gdmlhIGRhdGEtZHluLWNvbnRyb2xuYW1lIG9uIGEgZm9ybS1sZXZlbCBjb250YWluZXJcclxuICAgICAgICBjb25zdCBmb3JtRWxlbWVudCA9IGVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJGb3JtXCJdJyk7XHJcbiAgICAgICAgaWYgKGZvcm1FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb3JtRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgZm9ybUVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgdGhlIHdvcmtzcGFjZSBvciBwYWdlIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IHdvcmtzcGFjZSA9IGVsZW1lbnQuY2xvc2VzdCgnLndvcmtzcGFjZS1jb250ZW50LCAud29ya3NwYWNlLCBbZGF0YS1keW4tcm9sZT1cIldvcmtzcGFjZVwiXScpO1xyXG4gICAgICAgIGlmICh3b3Jrc3BhY2UpIHtcclxuICAgICAgICAgICAgY29uc3Qgd29ya3NwYWNlTmFtZSA9IHdvcmtzcGFjZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICh3b3Jrc3BhY2VOYW1lKSByZXR1cm4gd29ya3NwYWNlTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGRpYWxvZy9tb2RhbCBjb250ZXh0XHJcbiAgICAgICAgY29uc3QgZGlhbG9nID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5tb2RhbC1jb250ZW50Jyk7XHJcbiAgICAgICAgaWYgKGRpYWxvZykge1xyXG4gICAgICAgICAgICBjb25zdCBkaWFsb2dOYW1lID0gZGlhbG9nLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoZGlhbG9nTmFtZSkgcmV0dXJuIGRpYWxvZ05hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSByb290IGZvcm0gYnkgd2Fsa2luZyB1cCB0aGUgRE9NXHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBlbGVtZW50O1xyXG4gICAgICAgIHdoaWxlIChjdXJyZW50ICYmIGN1cnJlbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBjdXJyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0Zvcm0nID8gY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgOiBudWxsKTtcclxuICAgICAgICAgICAgaWYgKGZvcm1OYW1lKSByZXR1cm4gZm9ybU5hbWU7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHRoZSBhY3RpdmUvZm9jdXNlZCBmb3JtIG5hbWVcclxuICAgIGdldEFjdGl2ZUZvcm1OYW1lKCkge1xyXG4gICAgICAgIC8vIENoZWNrIGZvciBhY3RpdmUgZGlhbG9nIGZpcnN0IChjaGlsZCBmb3JtcyBhcmUgdHlwaWNhbGx5IGRpYWxvZ3MpXHJcbiAgICAgICAgY29uc3QgYWN0aXZlRGlhbG9nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl06bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKSwgLmRpYWxvZy1jb250YWluZXI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVEaWFsb2cpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhbG9nRm9ybSA9IGFjdGl2ZURpYWxvZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgICAgICBpZiAoZGlhbG9nRm9ybSkgcmV0dXJuIGRpYWxvZ0Zvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICAgICAgcmV0dXJuIGFjdGl2ZURpYWxvZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBmb2N1c2VkIGVsZW1lbnQgYW5kIGdldCBpdHMgZm9ybVxyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xyXG4gICAgICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShhY3RpdmVFbGVtZW50KTtcclxuICAgICAgICAgICAgaWYgKGZvcm1OYW1lICYmIGZvcm1OYW1lICE9PSAnVW5rbm93bicpIHJldHVybiBmb3JtTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTG9vayBmb3IgdGhlIHRvcG1vc3QvYWN0aXZlIGZvcm0gc2VjdGlvblxyXG4gICAgICAgIGNvbnN0IHZpc2libGVGb3JtcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XHJcbiAgICAgICAgaWYgKHZpc2libGVGb3Jtcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIFJldHVybiB0aGUgbGFzdCBvbmUgKHR5cGljYWxseSB0aGUgbW9zdCByZWNlbnRseSBvcGVuZWQvdG9wbW9zdClcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHZpc2libGVGb3Jtcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNFbGVtZW50VmlzaWJsZSh2aXNpYmxlRm9ybXNbaV0pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZpc2libGVGb3Jtc1tpXS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGFsbCBpbnRlcmFjdGl2ZSBlbGVtZW50cyBvbiB0aGUgcGFnZVxyXG4gICAgZGlzY292ZXJFbGVtZW50cyhhY3RpdmVGb3JtT25seSA9IGZhbHNlKSB7XHJcbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSBbXTtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtID0gYWN0aXZlRm9ybU9ubHkgPyB0aGlzLmdldEFjdGl2ZUZvcm1OYW1lKCkgOiBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGJ1dHRvbnNcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIk1lbnVJdGVtQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGVsKTtcclxuICAgICAgICAgICAgY29uc3QgdmlzaWJsZSA9IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdidXR0b24nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRleHQsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB2aXNpYmxlLFxyXG4gICAgICAgICAgICAgICAgYXJpYUxhYmVsOiBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbGwgaW5wdXQgZmllbGRzIChleHBhbmRlZCB0byBjYXRjaCBtb3JlIGZpZWxkIHR5cGVzKVxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTXVsdGlsaW5lSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlNlZ21lbnRlZEVudHJ5XCJdLCBpbnB1dFtkYXRhLWR5bi1jb250cm9sbmFtZV0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIC8vIEdldCBjb250cm9sIG5hbWUgZnJvbSBlbGVtZW50IG9yIHBhcmVudFxyXG4gICAgICAgICAgICBsZXQgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGxldCB0YXJnZXRFbGVtZW50ID0gZWw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBJZiBub3QgZm91bmQsIGNoZWNrIHBhcmVudCBlbGVtZW50IChjb21tb24gZm9yIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyBsaWtlIEFjY291bnQpXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSA9IHBhcmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0RWxlbWVudCA9IHBhcmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGFkZGVkIChhdm9pZCBkdXBsaWNhdGVzKVxyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZSh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFbGVtZW50TGFiZWwodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkSW5mbyA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnaW5wdXQnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKHRhcmdldEVsZW1lbnQpLFxyXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZEluZm8sXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHRhcmdldEVsZW1lbnRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGNoZWNrYm94ZXMvdG9nZ2xlc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ2hlY2tCb3hcIl0sIGlucHV0W3R5cGU9XCJjaGVja2JveFwiXVtkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgbGV0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBsZXQgdGFyZ2V0RWxlbWVudCA9IGVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQ2hlY2sgcGFyZW50IGlmIG5vdCBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUgPSBwYXJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEVsZW1lbnQgPSBwYXJlbnQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjb25zdCBjaGVja2JveCA9IHRhcmdldEVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHwgdGFyZ2V0RWxlbWVudDtcclxuICAgICAgICAgICAgY29uc3QgaXNDaGVja2VkID0gY2hlY2tib3guY2hlY2tlZCB8fCBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdjaGVja2JveCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUodGFyZ2V0RWxlbWVudCksXHJcbiAgICAgICAgICAgICAgICBjaGVja2VkOiBpc0NoZWNrZWQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHRhcmdldEVsZW1lbnRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYWxsIHJhZGlvIGJ1dHRvbiBncm91cHNcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJSYWRpb0J1dHRvblwiXSwgW3JvbGU9XCJyYWRpb2dyb3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIkZyYW1lT3B0aW9uQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKGVsKTtcclxuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRSYWRpbyA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXTpjaGVja2VkLCBbcm9sZT1cInJhZGlvXCJdW2FyaWEtY2hlY2tlZD1cInRydWVcIl0nKTtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gc2VsZWN0ZWRSYWRpbz8udmFsdWUgfHwgc2VsZWN0ZWRSYWRpbz8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJyc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncmFkaW8nLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcbiAgICAgICAgICAgICAgICBjdXJyZW50VmFsdWU6IGN1cnJlbnRWYWx1ZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBGaW5kIGFjdGlvbiBwYW5lIHRhYnMgKEFwcEJhciB0YWJzKVxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkFwcEJhclRhYlwiXSwgLmFwcEJhclRhYiwgW3JvbGU9XCJ0YWJcIl1bZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XG5cbiAgICAgICAgICAgIC8vIFNraXAgdGFicyBpbnNpZGUgZGlhbG9ncy9mbHlvdXRzXG4gICAgICAgICAgICBpZiAoZWwuY2xvc2VzdCgnLmRpYWxvZy1jb250ZW50LCBbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGVsKTtcbiAgICAgICAgICAgIGNvbnN0IGlzQWN0aXZlID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykgfHxcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ3NlbGVjdGVkJyk7XG5cbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdhY3Rpb24tcGFuZS10YWInLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiBpc0FjdGl2ZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBGaW5kIGFsbCB0cmFkaXRpb25hbCBEMzY1IGdyaWRzL3RhYmxlc1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGhpcy5nZXRFbGVtZW50TGFiZWwoZWwpIHx8ICdHcmlkJyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRGlzY292ZXIgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLmRpc2NvdmVyR3JpZENvbHVtbnMoZWwsIGNvbnRyb2xOYW1lLCBmb3JtTmFtZSwgZWxlbWVudHMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzICgucmVhY3RHcmlkKVxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiAnUmVhY3QgR3JpZCcsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6ICcucmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGV4cGFuZGFibGUgc2VjdGlvbnMgKEZhc3RUYWJzLCBHcm91cHMsIFNlY3Rpb25QYWdlcylcclxuICAgICAgICAvLyBUaGVzZSBhcmUgY29sbGFwc2libGUgc2VjdGlvbnMgaW4gRDM2NSBkaWFsb2dzIGFuZCBmb3Jtc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJGYXN0VGFiXCJdLCAuc2VjdGlvbi1wYWdlLCAuZmFzdHRhYicpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGFkZGVkXHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYWN0dWFsbHkgYW4gZXhwYW5kYWJsZSBzZWN0aW9uXHJcbiAgICAgICAgICAgIC8vIExvb2sgZm9yIGhlYWRlciBlbGVtZW50cyBvciBhcmlhLWV4cGFuZGVkIGF0dHJpYnV0ZVxyXG4gICAgICAgICAgICBjb25zdCBoYXNIZWFkZXIgPSBlbC5xdWVyeVNlbGVjdG9yKCcuc2VjdGlvbi1oZWFkZXIsIC5ncm91cC1oZWFkZXIsIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0sIC5zZWN0aW9uLXBhZ2UtY2FwdGlvbiwgYnV0dG9uW2FyaWEtZXhwYW5kZWRdJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kYWJsZSA9IGVsLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2libGUnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnc2VjdGlvbi1wYWdlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNIZWFkZXIgIT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0dyb3VwJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnU2VjdGlvblBhZ2UnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFpc0V4cGFuZGFibGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIERldGVybWluZSBjdXJyZW50IGV4cGFuZGVkIHN0YXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFeHBhbmRhYmxlU2VjdGlvbkxhYmVsKGVsKSB8fCBjb250cm9sTmFtZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ3NlY3Rpb24nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcclxuICAgICAgICAgICAgICAgIGlzRXhwYW5kZWQ6IGlzRXhwYW5kZWQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRGlzY292ZXIgUmVhY3QgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLmRpc2NvdmVyUmVhY3RHcmlkQ29sdW1ucyhlbCwgZm9ybU5hbWUsIGVsZW1lbnRzKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCByZWFkYWJsZSB0ZXh0IGZyb20gYW4gZWxlbWVudFxyXG4gICAgZ2V0RWxlbWVudFRleHQoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBhcmlhLWxhYmVsIGZpcnN0XHJcbiAgICAgICAgbGV0IHRleHQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmICh0ZXh0ICYmIHRleHQudHJpbSgpKSByZXR1cm4gdGV4dC50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSB0ZXh0IGNvbnRlbnQgKGV4Y2x1ZGluZyBjaGlsZCBidXR0b25zL2ljb25zKVxyXG4gICAgICAgIGNvbnN0IGNsb25lID0gZWxlbWVudC5jbG9uZU5vZGUodHJ1ZSk7XHJcbiAgICAgICAgY2xvbmUucXVlcnlTZWxlY3RvckFsbCgnLmJ1dHRvbi1pY29uLCAuZmEsIC5nbHlwaGljb24nKS5mb3JFYWNoKGljb24gPT4gaWNvbi5yZW1vdmUoKSk7XHJcbiAgICAgICAgdGV4dCA9IGNsb25lLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG5cclxuICAgICAgICAvLyBUcnkgdGl0bGUgYXR0cmlidXRlXHJcbiAgICAgICAgdGV4dCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd0aXRsZScpO1xyXG4gICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gY29udHJvbCBuYW1lXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICdVbmtub3duJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGlucHV0IGZpZWxkc1xyXG4gICAgZ2V0RWxlbWVudExhYmVsKGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbFxyXG4gICAgICAgIGxldCBsYWJlbCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGxhYmVsICYmIGxhYmVsLnRyaW0oKSkgcmV0dXJuIGxhYmVsLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gVHJ5IGFzc29jaWF0ZWQgbGFiZWwgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGxhYmVsRWxlbWVudCA9IGVsZW1lbnQuY2xvc2VzdCgnLmR5bi1sYWJlbC13cmFwcGVyJyk/LnF1ZXJ5U2VsZWN0b3IoJy5keW4tbGFiZWwnKTtcclxuICAgICAgICBpZiAobGFiZWxFbGVtZW50KSByZXR1cm4gbGFiZWxFbGVtZW50LnRleHRDb250ZW50Py50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSBwYXJlbnQgY29udGFpbmVyIGxhYmVsXHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuaW5wdXRfY29udGFpbmVyLCAuZm9ybS1ncm91cCcpO1xyXG4gICAgICAgIGlmIChjb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyTGFiZWwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignbGFiZWwnKTtcclxuICAgICAgICAgICAgaWYgKGNvbnRhaW5lckxhYmVsKSByZXR1cm4gY29udGFpbmVyTGFiZWwudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNvbnRyb2wgbmFtZVxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzY292ZXIgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dC9lZGl0aW5nXHJcbiAgICBkaXNjb3ZlckdyaWRDb2x1bW5zKGdyaWRFbGVtZW50LCBncmlkTmFtZSwgZm9ybU5hbWUsIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgY29uc3QgYWRkZWRDb2x1bW5zID0gbmV3IFNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAxOiBGaW5kIGNvbHVtbiBoZWFkZXJzXHJcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXSwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgaGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBoZWFkZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoZWFkZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogYCR7ZGlzcGxheVRleHR9YCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShoZWFkZXIpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzSGVhZGVyOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaGVhZGVyXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAyOiBGaW5kIGNlbGxzIHdpdGggaW5wdXRzIGluIHRoZSBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXNlbGVjdGVkPVwidHJ1ZVwiXSwgW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZHluLXNlbGVjdGVkUm93JykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1yb2xlPVwiUm93XCJdOmZpcnN0LW9mLXR5cGUsIFtyb2xlPVwicm93XCJdOm5vdChbcm9sZT1cImNvbHVtbmhlYWRlclwiXSk6Zmlyc3Qtb2YtdHlwZScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgLy8gRmluZCBhbGwgaW5wdXQgZmllbGRzIGluIHRoZSByb3dcclxuICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICBjZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY29uc3Qgcm9sZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9IGNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ0lucHV0JywgJ0NvbWJvQm94JywgJ0xvb2t1cCcsICdSZWZlcmVuY2VHcm91cCcsICdTZWdtZW50ZWRFbnRyeSddLmluY2x1ZGVzKHJvbGUpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoaGFzSW5wdXQgfHwgcm9sZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjZWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZE5hbWU6IGdyaWROYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoY2VsbCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogaGFzSW5wdXQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBjZWxsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXRob2QgMzogRmluZCBhbnkgZWRpdGFibGUgaW5wdXRzIGluc2lkZSB0aGUgZ3JpZCBib2R5XHJcbiAgICAgICAgY29uc3QgZ3JpZElucHV0cyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlJlZmVyZW5jZUdyb3VwXCJdJyk7XHJcbiAgICAgICAgZ3JpZElucHV0cy5mb3JFYWNoKGlucHV0ID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IHRoaXMuZ2V0RWxlbWVudExhYmVsKGlucHV0KSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShpbnB1dCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShpbnB1dCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBpbnB1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBhIGdyaWQgY29sdW1uIGJ5IGxvb2tpbmcgYXQgdGhlIGhlYWRlclxyXG4gICAgZ2V0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2x1bW5Db250cm9sTmFtZSkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIgY2VsbCBmb3IgdGhpcyBjb2x1bW5cclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gaGVhZGVyLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgaGVhZGVyIGJ5IHBhcnRpYWwgbWF0Y2ggKGNvbHVtbiBuYW1lIG1pZ2h0IGJlIGRpZmZlcmVudCBpbiBoZWFkZXIgdnMgY2VsbClcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGFsbEhlYWRlcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGguZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoaGVhZGVyTmFtZSAmJiAoY29sdW1uQ29udHJvbE5hbWUuaW5jbHVkZXMoaGVhZGVyTmFtZSkgfHwgaGVhZGVyTmFtZS5pbmNsdWRlcyhjb2x1bW5Db250cm9sTmFtZSkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gaC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGNvbHVtbnMgaW4gUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHNcclxuICAgIGRpc2NvdmVyUmVhY3RHcmlkQ29sdW1ucyhncmlkRWxlbWVudCwgZm9ybU5hbWUsIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgY29uc3QgYWRkZWRDb2x1bW5zID0gbmV3IFNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEdldCBjb2x1bW4gaGVhZGVycyBmcm9tIC5keW4taGVhZGVyQ2VsbCBlbGVtZW50c1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckNlbGxzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciAuZHluLWhlYWRlckNlbGwnKTtcclxuICAgICAgICBoZWFkZXJDZWxscy5mb3JFYWNoKChoZWFkZXIsIGNvbEluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gaGVhZGVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbnRyb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gaGVhZGVyLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaGVhZGVyLnRleHRDb250ZW50Py50cmltKCkgfHwgY29udHJvbE5hbWU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgIGNvbHVtbkluZGV4OiBjb2xJbmRleCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShoZWFkZXIpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGAuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0hlYWRlcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGhlYWRlclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIGxvb2sgZm9yIGVkaXRhYmxlIGlucHV0cyBpbnNpZGUgdGhlIGJvZHkgcm93c1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAvLyBGaW5kIGFjdGl2ZS9zZWxlY3RlZCByb3cgZmlyc3QsIG9yIGZhbGxiYWNrIHRvIGZpcnN0IHJvd1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVSb3cgPSBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbltkYXRhLWR5bi1yb3ctYWN0aXZlPVwidHJ1ZVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbi5wdWJsaWNfZml4ZWREYXRhVGFibGVSb3dfbWFpbicpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZVJvdykge1xyXG4gICAgICAgICAgICAgICAgLy8gRmluZCBhbGwgY2VsbHMgd2l0aCBkYXRhLWR5bi1jb250cm9sbmFtZVxyXG4gICAgICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICAgICAgY2VsbHMuZm9yRWFjaChjZWxsID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByb2xlID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9IGNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydJbnB1dCcsICdDb21ib0JveCcsICdMb29rdXAnLCAnUmVmZXJlbmNlR3JvdXAnLCAnU2VnbWVudGVkRW50cnknXS5pbmNsdWRlcyhyb2xlKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRSZWFjdEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjZWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGNlbGwpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IGhhc0lucHV0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogY2VsbFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbnkgZWRpdGFibGUgaW5wdXRzIGluIHRoZSBncmlkIGJvZHlcclxuICAgICAgICBjb25zdCBncmlkSW5wdXRzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJJbnB1dFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0sIC5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0nKTtcclxuICAgICAgICBncmlkSW5wdXRzLmZvckVhY2goaW5wdXQgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldFJlYWN0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCB0aGlzLmdldEVsZW1lbnRMYWJlbChpbnB1dCkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoaW5wdXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShpbnB1dCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBpbnB1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBhIFJlYWN0IGdyaWQgY29sdW1uIGJ5IGxvb2tpbmcgYXQgdGhlIGhlYWRlclxyXG4gICAgZ2V0UmVhY3RHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbHVtbkNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGhlYWRlciBjZWxsIHdpdGggbWF0Y2hpbmcgY29udHJvbG5hbWVcclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKGAuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbHVtbkNvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXIucXVlcnlTZWxlY3RvcignLmR5bi1oZWFkZXJDZWxsTGFiZWwnKTtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFBhcnRpYWwgbWF0Y2hcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmR5bi1oZWFkZXJDZWxsW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlck5hbWUgPSBoLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGhlYWRlck5hbWUgJiYgKGNvbHVtbkNvbnRyb2xOYW1lLmluY2x1ZGVzKGhlYWRlck5hbWUpIHx8IGhlYWRlck5hbWUuaW5jbHVkZXMoY29sdW1uQ29udHJvbE5hbWUpKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERldGVjdCBmaWVsZCB0eXBlIChlbnVtLCBsb29rdXAsIGZyZWV0ZXh0LCBldGMuKVxyXG4gICAgZGV0ZWN0RmllbGRUeXBlKGVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCByb2xlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyAobGlrZSBBY2NvdW50KSBoYXZlIHNwZWNpYWwgbG9va3VwXHJcbiAgICAgICAgaWYgKHJvbGUgPT09ICdTZWdtZW50ZWRFbnRyeScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgdHlwZTogJ3NlZ21lbnRlZC1sb29rdXAnLCByb2xlOiByb2xlIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBsb29rdXAgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgaGFzTG9va3VwQnV0dG9uID0gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5sb29rdXAtYnV0dG9uJykgIT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgQ29tYm9Cb3gvRHJvcGRvd25cclxuICAgICAgICBjb25zdCBpc0NvbWJvQm94ID0gcm9sZSA9PT0gJ0NvbWJvQm94JyB8fCBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnY29tYm9Cb3gnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3Igc2VsZWN0IGVsZW1lbnRcclxuICAgICAgICBjb25zdCBzZWxlY3QgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE11bHRpbGluZUlucHV0IGRldGVjdGlvblxyXG4gICAgICAgIGNvbnN0IGlzTXVsdGlsaW5lID0gcm9sZSA9PT0gJ011bHRpbGluZUlucHV0JztcclxuICAgICAgICBcclxuICAgICAgICAvLyBEZXRlY3QgbnVtZXJpYyBmaWVsZHNcclxuICAgICAgICBjb25zdCBpc051bWVyaWMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJudW1iZXJcIl0nKSAhPT0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEZXRlY3QgZGF0ZSBmaWVsZHNcclxuICAgICAgICBjb25zdCBpc0RhdGUgPSBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZGF0ZS1maWVsZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiZGF0ZVwiXScpICE9PSBudWxsO1xyXG5cclxuICAgICAgICAvLyBCdWlsZCBmaWVsZCB0eXBlIGluZm9cclxuICAgICAgICBjb25zdCBmaWVsZEluZm8gPSB7XHJcbiAgICAgICAgICAgIGNvbnRyb2xUeXBlOiByb2xlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICd0ZXh0J1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGlmIChpc011bHRpbGluZSkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ3RleHRhcmVhJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzTXVsdGlsaW5lID0gdHJ1ZTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzQ29tYm9Cb3ggfHwgc2VsZWN0KSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnZW51bSc7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pc0VudW0gPSB0cnVlO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8udmFsdWVzID0gdGhpcy5leHRyYWN0RW51bVZhbHVlcyhlbGVtZW50LCBzZWxlY3QpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaGFzTG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnbG9va3VwJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzTG9va3VwID0gdHJ1ZTtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmFsbG93RnJlZXRleHQgPSAhZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1vbmx5Jyk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc051bWVyaWMpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdudW1iZXInO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNEYXRlKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnZGF0ZSc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBHZXQgbWF4IGxlbmd0aCBpZiBhdmFpbGFibGVcclxuICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhJyk7XHJcbiAgICAgICAgaWYgKGlucHV0ICYmIGlucHV0Lm1heExlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLm1heExlbmd0aCA9IGlucHV0Lm1heExlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBmaWVsZEluZm87XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRXh0cmFjdCBlbnVtIHZhbHVlcyBmcm9tIGRyb3Bkb3duXHJcbiAgICBleHRyYWN0RW51bVZhbHVlcyhlbGVtZW50LCBzZWxlY3RFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ID0gc2VsZWN0RWxlbWVudCB8fCBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgICAgIGlmICghc2VsZWN0KSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgcmV0dXJuIEFycmF5LmZyb20oc2VsZWN0Lm9wdGlvbnMpXHJcbiAgICAgICAgICAgIC5maWx0ZXIob3B0ID0+IG9wdC52YWx1ZSAhPT0gJycpXHJcbiAgICAgICAgICAgIC5tYXAob3B0ID0+ICh7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZTogb3B0LnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgdGV4dDogb3B0LnRleHQudHJpbSgpXHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGV4cGFuZGFibGUgc2VjdGlvbnNcclxuICAgIGdldEV4cGFuZGFibGVTZWN0aW9uTGFiZWwoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIvY2FwdGlvbiBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgaGVhZGVyU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICAgICAnLnNlY3Rpb24tcGFnZS1jYXB0aW9uJyxcclxuICAgICAgICAgICAgJy5zZWN0aW9uLWhlYWRlcicsXHJcbiAgICAgICAgICAgICcuZ3JvdXAtaGVhZGVyJyxcclxuICAgICAgICAgICAgJy5mYXN0dGFiLWhlYWRlcicsXHJcbiAgICAgICAgICAgICdbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdJyxcclxuICAgICAgICAgICAgJ2J1dHRvblthcmlhLWV4cGFuZGVkXSBzcGFuJyxcclxuICAgICAgICAgICAgJ2J1dHRvbiBzcGFuJyxcclxuICAgICAgICAgICAgJy5jYXB0aW9uJyxcclxuICAgICAgICAgICAgJ2xlZ2VuZCdcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgaGVhZGVyU2VsZWN0b3JzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbFxyXG4gICAgICAgIGNvbnN0IGFyaWFMYWJlbCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGFyaWFMYWJlbCkgcmV0dXJuIGFyaWFMYWJlbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdGhlIGJ1dHRvbidzIHRleHQgaWYgdGhlIHNlY3Rpb24gaGFzIGEgdG9nZ2xlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IHRvZ2dsZUJ0biA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignYnV0dG9uJyk7XHJcbiAgICAgICAgaWYgKHRvZ2dsZUJ0bikge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdG9nZ2xlQnRuLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0ICYmIHRleHQubGVuZ3RoIDwgMTAwKSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgZWxlbWVudCBpcyB2aXNpYmxlXHJcbiAgICBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQpIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgIT09ICdub25lJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBTdGFydCBpbnRlcmFjdGl2ZSBlbGVtZW50IHBpY2tlclxyXG4gICAgc3RhcnRFbGVtZW50UGlja2VyKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgdGhpcy5pc0luc3BlY3RpbmcgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMucGlja2VyQ2FsbGJhY2sgPSBjYWxsYmFjaztcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIG92ZXJsYXlcclxuICAgICAgICB0aGlzLm92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLm92ZXJsYXkuc3R5bGUuY3NzVGV4dCA9IGBcclxuICAgICAgICAgICAgcG9zaXRpb246IGZpeGVkO1xyXG4gICAgICAgICAgICB0b3A6IDA7XHJcbiAgICAgICAgICAgIGxlZnQ6IDA7XHJcbiAgICAgICAgICAgIHdpZHRoOiAxMDAlO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IDEwMCU7XHJcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcclxuICAgICAgICAgICAgei1pbmRleDogOTk5OTk4O1xyXG4gICAgICAgICAgICBjdXJzb3I6IGNyb3NzaGFpcjtcclxuICAgICAgICBgO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5vdmVybGF5KTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGhpZ2hsaWdodCBlbGVtZW50XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmNzc1RleHQgPSBgXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgICAgICAgICAgYm9yZGVyOiAycHggc29saWQgIzY2N2VlYTtcclxuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xyXG4gICAgICAgICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcclxuICAgICAgICAgICAgei1pbmRleDogOTk5OTk5O1xyXG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4xcyBlYXNlO1xyXG4gICAgICAgIGA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXJzXHJcbiAgICAgICAgdGhpcy5tb3VzZU1vdmVIYW5kbGVyID0gKGUpID0+IHRoaXMuaGFuZGxlTW91c2VNb3ZlKGUpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tIYW5kbGVyID0gKGUpID0+IHRoaXMuaGFuZGxlQ2xpY2soZSk7XHJcbiAgICAgICAgdGhpcy5lc2NhcGVIYW5kbGVyID0gKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgdGhpcy5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2VNb3ZlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuZXNjYXBlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlTW91c2VNb3ZlKGUpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcclxuICAgICAgICBpZiAoIXRhcmdldCB8fCB0YXJnZXQgPT09IHRoaXMub3ZlcmxheSB8fCB0YXJnZXQgPT09IHRoaXMuaGlnaGxpZ2h0RWxlbWVudCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGNsb3Nlc3QgRDM2NSBjb250cm9sXHJcbiAgICAgICAgY29uc3QgY29udHJvbCA9IHRhcmdldC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgaWYgKCFjb250cm9sKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVuc3VyZSBoaWdobGlnaHQgZWxlbWVudCBleGlzdHNcclxuICAgICAgICBpZiAoIXRoaXMuaGlnaGxpZ2h0RWxlbWVudCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIaWdobGlnaHQgdGhlIGVsZW1lbnRcclxuICAgICAgICBjb25zdCByZWN0ID0gY29udHJvbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLnRvcCA9IHJlY3QudG9wICsgd2luZG93LnNjcm9sbFkgKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5sZWZ0ID0gcmVjdC5sZWZ0ICsgd2luZG93LnNjcm9sbFggKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS53aWR0aCA9IHJlY3Qud2lkdGggKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5oZWlnaHQgPSByZWN0LmhlaWdodCArICdweCc7XHJcblxyXG4gICAgICAgIC8vIFNob3cgdG9vbHRpcFxyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnNldEF0dHJpYnV0ZSgndGl0bGUnLCBgJHtyb2xlfTogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVDbGljayhlKSB7XHJcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2wgPSB0YXJnZXQ/LmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBjb25zdCByb2xlID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRoaXMuZ2V0RWxlbWVudFRleHQoY29udHJvbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBlbGVtZW50SW5mbyA9IHtcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBpZiAocm9sZSA9PT0gJ0lucHV0JyB8fCByb2xlID09PSAnTXVsdGlsaW5lSW5wdXQnIHx8IHJvbGUgPT09ICdDb21ib0JveCcpIHtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnRJbmZvLmZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGNvbnRyb2wpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBpY2tlckNhbGxiYWNrKGVsZW1lbnRJbmZvKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc3RvcEVsZW1lbnRQaWNrZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBzdG9wRWxlbWVudFBpY2tlcigpIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLm92ZXJsYXkpIHtcclxuICAgICAgICAgICAgdGhpcy5vdmVybGF5LnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLm92ZXJsYXkgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5oaWdobGlnaHRFbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5yZW1vdmUoKTtcclxuICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2VNb3ZlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuZXNjYXBlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2VhcmNoIGVsZW1lbnRzIGJ5IHRleHRcclxuICAgIGZpbmRFbGVtZW50QnlUZXh0KHRleHQsIGVsZW1lbnRUeXBlID0gbnVsbCkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gdGhpcy5kaXNjb3ZlckVsZW1lbnRzKCk7XHJcbiAgICAgICAgY29uc3Qgc2VhcmNoVGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKS50cmltKCk7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50cy5maWx0ZXIoZWwgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZWxlbWVudFR5cGUgJiYgZWwudHlwZSAhPT0gZWxlbWVudFR5cGUpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gZWwuZGlzcGxheVRleHQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgYXJpYUxhYmVsID0gKGVsLmFyaWFMYWJlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5jb250cm9sTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIGRpc3BsYXlUZXh0LmluY2x1ZGVzKHNlYXJjaFRleHQpIHx8XHJcbiAgICAgICAgICAgICAgICAgICBhcmlhTGFiZWwuaW5jbHVkZXMoc2VhcmNoVGV4dCkgfHxcclxuICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lLmluY2x1ZGVzKHNlYXJjaFRleHQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBFeHBvcnQgZm9yIHVzZSBpbiBjb250ZW50IHNjcmlwdFxyXG4iLCAiZXhwb3J0IGZ1bmN0aW9uIHNlbmRMb2cobGV2ZWwsIG1lc3NhZ2UpIHtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19MT0cnLFxuICAgICAgICBsb2c6IHsgbGV2ZWwsIG1lc3NhZ2UgfVxuICAgIH0sICcqJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2dTdGVwKG1lc3NhZ2UpIHtcbiAgICBzZW5kTG9nKCdpbmZvJywgbWVzc2FnZSk7XG4gICAgY29uc29sZS5sb2coJ1tEMzY1IEF1dG9tYXRpb25dJywgbWVzc2FnZSk7XG59XG4iLCAiZXhwb3J0IGZ1bmN0aW9uIHNsZWVwKG1zKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKSB7XG4gICAgY29uc3QgaXNUZXh0QXJlYSA9IGlucHV0LnRhZ05hbWUgPT09ICdURVhUQVJFQSc7XG4gICAgY29uc3QgZGVzY3JpcHRvciA9IGlzVGV4dEFyZWFcbiAgICAgICAgPyBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MVGV4dEFyZWFFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJylcbiAgICAgICAgOiBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MSW5wdXRFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJyk7XG5cbiAgICBpZiAoZGVzY3JpcHRvciAmJiBkZXNjcmlwdG9yLnNldCkge1xuICAgICAgICBkZXNjcmlwdG9yLnNldC5jYWxsKGlucHV0LCB2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaW5wdXQudmFsdWUgPSB2YWx1ZTtcbiAgICB9XG59XG4iLCAiZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVRleHQodmFsdWUpIHtcclxuICAgIHJldHVybiBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb3dlckNhc2UoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvZXJjZUJvb2xlYW4odmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuIHZhbHVlO1xyXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiB2YWx1ZSAhPT0gMCAmJiAhTnVtYmVyLmlzTmFOKHZhbHVlKTtcclxuXHJcbiAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dCh2YWx1ZSk7XHJcbiAgICBpZiAodGV4dCA9PT0gJycpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoWyd0cnVlJywgJzEnLCAneWVzJywgJ3knLCAnb24nLCAnY2hlY2tlZCddLmluY2x1ZGVzKHRleHQpKSByZXR1cm4gdHJ1ZTtcclxuICAgIGlmIChbJ2ZhbHNlJywgJzAnLCAnbm8nLCAnbicsICdvZmYnLCAndW5jaGVja2VkJ10uaW5jbHVkZXModGV4dCkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuIiwgImV4cG9ydCBmdW5jdGlvbiBnZXRXb3JrZmxvd0Vycm9yRGVmYXVsdHMoc2V0dGluZ3MpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBtb2RlOiBzZXR0aW5ncz8uZXJyb3JEZWZhdWx0TW9kZSB8fCAnZmFpbCcsXG4gICAgICAgIHJldHJ5Q291bnQ6IE51bWJlci5pc0Zpbml0ZShzZXR0aW5ncz8uZXJyb3JEZWZhdWx0UmV0cnlDb3VudCkgPyBzZXR0aW5ncy5lcnJvckRlZmF1bHRSZXRyeUNvdW50IDogMCxcbiAgICAgICAgcmV0cnlEZWxheTogTnVtYmVyLmlzRmluaXRlKHNldHRpbmdzPy5lcnJvckRlZmF1bHRSZXRyeURlbGF5KSA/IHNldHRpbmdzLmVycm9yRGVmYXVsdFJldHJ5RGVsYXkgOiAxMDAwLFxuICAgICAgICBnb3RvTGFiZWw6IHNldHRpbmdzPy5lcnJvckRlZmF1bHRHb3RvTGFiZWwgfHwgJydcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RlcEVycm9yQ29uZmlnKHN0ZXAsIHNldHRpbmdzKSB7XG4gICAgY29uc3QgZGVmYXVsdHMgPSBnZXRXb3JrZmxvd0Vycm9yRGVmYXVsdHMoc2V0dGluZ3MpO1xuICAgIGNvbnN0IG1vZGUgPSBzdGVwPy5vbkVycm9yTW9kZSAmJiBzdGVwLm9uRXJyb3JNb2RlICE9PSAnZGVmYXVsdCcgPyBzdGVwLm9uRXJyb3JNb2RlIDogZGVmYXVsdHMubW9kZTtcbiAgICBjb25zdCByZXRyeUNvdW50ID0gTnVtYmVyLmlzRmluaXRlKHN0ZXA/Lm9uRXJyb3JSZXRyeUNvdW50KSA/IHN0ZXAub25FcnJvclJldHJ5Q291bnQgOiBkZWZhdWx0cy5yZXRyeUNvdW50O1xuICAgIGNvbnN0IHJldHJ5RGVsYXkgPSBOdW1iZXIuaXNGaW5pdGUoc3RlcD8ub25FcnJvclJldHJ5RGVsYXkpID8gc3RlcC5vbkVycm9yUmV0cnlEZWxheSA6IGRlZmF1bHRzLnJldHJ5RGVsYXk7XG4gICAgY29uc3QgZ290b0xhYmVsID0gc3RlcD8ub25FcnJvckdvdG9MYWJlbCB8fCBkZWZhdWx0cy5nb3RvTGFiZWw7XG4gICAgcmV0dXJuIHsgbW9kZSwgcmV0cnlDb3VudCwgcmV0cnlEZWxheSwgZ290b0xhYmVsIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9vcFBhaXJzKHN0ZXBzTGlzdCwgb25Jc3N1ZSA9ICgpID0+IHt9KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbXTtcbiAgICBjb25zdCBwYWlycyA9IFtdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN0ZXBzTGlzdFtpXTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnR5cGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xuICAgICAgICAgICAgc3RhY2sucHVzaCh7IHN0YXJ0SW5kZXg6IGksIGlkOiBzLmlkIH0pO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocy50eXBlICE9PSAnbG9vcC1lbmQnKSBjb250aW51ZTtcblxuICAgICAgICBsZXQgbWF0Y2hlZCA9IG51bGw7XG4gICAgICAgIGlmIChzLmxvb3BSZWYpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGogPSBzdGFjay5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFja1tqXS5pZCA9PT0gcy5sb29wUmVmKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZWQgPSB7IHN0YXJ0SW5kZXg6IHN0YWNrW2pdLnN0YXJ0SW5kZXgsIGVuZEluZGV4OiBpIH07XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnNwbGljZShqLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFtYXRjaGVkKSB7XG4gICAgICAgICAgICBjb25zdCBsYXN0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgICAgICBpZiAobGFzdCkge1xuICAgICAgICAgICAgICAgIG1hdGNoZWQgPSB7IHN0YXJ0SW5kZXg6IGxhc3Quc3RhcnRJbmRleCwgZW5kSW5kZXg6IGkgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb25Jc3N1ZShgVW5tYXRjaGVkIGxvb3AtZW5kIGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtYXRjaGVkKSBwYWlycy5wdXNoKG1hdGNoZWQpO1xuICAgIH1cblxuICAgIGlmIChzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChjb25zdCByZW0gb2Ygc3RhY2spIHtcbiAgICAgICAgICAgIG9uSXNzdWUoYFVuY2xvc2VkIGxvb3Atc3RhcnQgYXQgaW5kZXggJHtyZW0uc3RhcnRJbmRleH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhaXJzLnNvcnQoKGEsIGIpID0+IGEuc3RhcnRJbmRleCAtIGIuc3RhcnRJbmRleCk7XG4gICAgcmV0dXJuIHBhaXJzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZElmUGFpcnMoc3RlcHNMaXN0LCBvbklzc3VlID0gKCkgPT4ge30pIHtcbiAgICBjb25zdCBzdGFjayA9IFtdO1xuICAgIGNvbnN0IGlmVG9FbHNlID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGlmVG9FbmQgPSBuZXcgTWFwKCk7XG4gICAgY29uc3QgZWxzZVRvRW5kID0gbmV3IE1hcCgpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN0ZXBzTGlzdFtpXTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnR5cGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdpZi1zdGFydCcpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goeyBpZkluZGV4OiBpLCBlbHNlSW5kZXg6IG51bGwgfSk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdlbHNlJykge1xuICAgICAgICAgICAgaWYgKHN0YWNrLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG9uSXNzdWUoYEVsc2Ugd2l0aG91dCBtYXRjaGluZyBpZi1zdGFydCBhdCBpbmRleCAke2l9YCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHRvcCA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgaWYgKHRvcC5lbHNlSW5kZXggPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICB0b3AuZWxzZUluZGV4ID0gaTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb25Jc3N1ZShgTXVsdGlwbGUgZWxzZSBibG9ja3MgZm9yIGlmLXN0YXJ0IGF0IGluZGV4ICR7dG9wLmlmSW5kZXh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzLnR5cGUgIT09ICdpZi1lbmQnKSBjb250aW51ZTtcblxuICAgICAgICBjb25zdCB0b3AgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKCF0b3ApIHtcbiAgICAgICAgICAgIG9uSXNzdWUoYElmLWVuZCB3aXRob3V0IG1hdGNoaW5nIGlmLXN0YXJ0IGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWZUb0VuZC5zZXQodG9wLmlmSW5kZXgsIGkpO1xuICAgICAgICBpZiAodG9wLmVsc2VJbmRleCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgaWZUb0Vsc2Uuc2V0KHRvcC5pZkluZGV4LCB0b3AuZWxzZUluZGV4KTtcbiAgICAgICAgICAgIGVsc2VUb0VuZC5zZXQodG9wLmVsc2VJbmRleCwgaSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVtIG9mIHN0YWNrKSB7XG4gICAgICAgICAgICBvbklzc3VlKGBVbmNsb3NlZCBpZi1zdGFydCBhdCBpbmRleCAke3JlbS5pZkluZGV4fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgaWZUb0Vsc2UsIGlmVG9FbmQsIGVsc2VUb0VuZCB9O1xufVxuIiwgImltcG9ydCB7IG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuLi91dGlscy90ZXh0LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RSb3dWYWx1ZShmaWVsZE1hcHBpbmcsIGN1cnJlbnRSb3cpIHtcbiAgICBpZiAoIWN1cnJlbnRSb3cgfHwgIWZpZWxkTWFwcGluZykgcmV0dXJuICcnO1xuICAgIGxldCB2YWx1ZSA9IGN1cnJlbnRSb3dbZmllbGRNYXBwaW5nXTtcbiAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCAmJiBmaWVsZE1hcHBpbmcuaW5jbHVkZXMoJzonKSkge1xuICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBmaWVsZE1hcHBpbmcuc3BsaXQoJzonKS5wb3AoKTtcbiAgICAgICAgdmFsdWUgPSBjdXJyZW50Um93W2ZpZWxkTmFtZV07XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCkge1xuICAgIGlmICghZWxlbWVudCkgcmV0dXJuICcnO1xuICAgIGNvbnN0IGFyaWEgPSBlbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdhcmlhLWxhYmVsJyk7XG4gICAgaWYgKGFyaWEpIHJldHVybiBhcmlhLnRyaW0oKTtcbiAgICBjb25zdCB0ZXh0ID0gZWxlbWVudC50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgIHJldHVybiB0ZXh0IHx8ICcnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWxlbWVudFZhbHVlRm9yQ29uZGl0aW9uKGVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiAnJztcbiAgICBpZiAoJ3ZhbHVlJyBpbiBlbGVtZW50ICYmIGVsZW1lbnQudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gU3RyaW5nKGVsZW1lbnQudmFsdWUgPz8gJycpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmFsdWF0ZUNvbmRpdGlvbihzdGVwLCBjdXJyZW50Um93LCBkZXBzID0ge30pIHtcbiAgICBjb25zdCBmaW5kRWxlbWVudCA9IGRlcHMuZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQgfHwgKCgpID0+IG51bGwpO1xuICAgIGNvbnN0IGlzVmlzaWJsZSA9IGRlcHMuaXNFbGVtZW50VmlzaWJsZSB8fCAoKCkgPT4gZmFsc2UpO1xuICAgIGNvbnN0IHR5cGUgPSBzdGVwPy5jb25kaXRpb25UeXBlIHx8ICd1aS12aXNpYmxlJztcblxuICAgIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ3VpLScpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gc3RlcD8uY29uZGl0aW9uQ29udHJvbE5hbWUgfHwgc3RlcD8uY29udHJvbE5hbWUgfHwgJyc7XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBjb250cm9sTmFtZSA/IGZpbmRFbGVtZW50KGNvbnRyb2xOYW1lKSA6IG51bGw7XG5cbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICBjYXNlICd1aS12aXNpYmxlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gISFlbGVtZW50ICYmIGlzVmlzaWJsZShlbGVtZW50KTtcbiAgICAgICAgICAgIGNhc2UgJ3VpLWhpZGRlbic6XG4gICAgICAgICAgICAgICAgcmV0dXJuICFlbGVtZW50IHx8ICFpc1Zpc2libGUoZWxlbWVudCk7XG4gICAgICAgICAgICBjYXNlICd1aS1leGlzdHMnOlxuICAgICAgICAgICAgICAgIHJldHVybiAhIWVsZW1lbnQ7XG4gICAgICAgICAgICBjYXNlICd1aS1ub3QtZXhpc3RzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gIWVsZW1lbnQ7XG4gICAgICAgICAgICBjYXNlICd1aS10ZXh0LWVxdWFscyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdGV4dC1jb250YWlucyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdmFsdWUtZXF1YWxzJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoZ2V0RWxlbWVudFZhbHVlRm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdmFsdWUtY29udGFpbnMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChnZXRFbGVtZW50VmFsdWVGb3JDb25kaXRpb24oZWxlbWVudCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dChzdGVwPy5jb25kaXRpb25WYWx1ZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbC5pbmNsdWRlcyhleHBlY3RlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ2RhdGEtJykpIHtcbiAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gc3RlcD8uY29uZGl0aW9uRmllbGRNYXBwaW5nIHx8ICcnO1xuICAgICAgICBjb25zdCBhY3R1YWxSYXcgPSBleHRyYWN0Um93VmFsdWUoZmllbGRNYXBwaW5nLCBjdXJyZW50Um93KTtcbiAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChhY3R1YWxSYXcpO1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1lcXVhbHMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1ub3QtZXF1YWxzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsICE9PSBleHBlY3RlZDtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtY29udGFpbnMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1lbXB0eSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCA9PT0gJyc7XG4gICAgICAgICAgICBjYXNlICdkYXRhLW5vdC1lbXB0eSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCAhPT0gJyc7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHtcclxuICAgIGNvbnN0IGFsbE1hdGNoZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG5cclxuICAgIGlmIChhbGxNYXRjaGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcbiAgICBpZiAoYWxsTWF0Y2hlcy5sZW5ndGggPT09IDEpIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG5cclxuICAgIC8vIE11bHRpcGxlIG1hdGNoZXMgLSBwcmVmZXIgdGhlIG9uZSBpbiB0aGUgYWN0aXZlL3RvcG1vc3QgY29udGV4dFxyXG5cclxuICAgIC8vIFByaW9yaXR5IDE6IEVsZW1lbnQgaW4gYW4gYWN0aXZlIGRpYWxvZy9tb2RhbCAoY2hpbGQgZm9ybXMpXHJcbiAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICBjb25zdCBkaWFsb2cgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpO1xyXG4gICAgICAgIGlmIChkaWFsb2cgJiYgaXNFbGVtZW50VmlzaWJsZShkaWFsb2cpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBkaWFsb2cgY29udGV4dGApO1xyXG4gICAgICAgICAgICByZXR1cm4gZWw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDI6IEVsZW1lbnQgaW4gYSBGYXN0VGFiIG9yIFRhYlBhZ2UgdGhhdCdzIGV4cGFuZGVkL2FjdGl2ZVxyXG4gICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgY29uc3QgdGFiUGFnZSA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgLnRhYlBhZ2UnKTtcclxuICAgICAgICBpZiAodGFiUGFnZSkge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgdGFiIGlzIGV4cGFuZGVkXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSB0YWJQYWdlLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YWJQYWdlLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXRhYlBhZ2UuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuICAgICAgICAgICAgaWYgKGlzRXhwYW5kZWQgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBleHBhbmRlZCB0YWIgY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDM6IEVsZW1lbnQgaW4gdGhlIGZvcm0gY29udGV4dCB0aGF0IGhhcyBmb2N1cyBvciB3YXMgcmVjZW50bHkgaW50ZXJhY3RlZCB3aXRoXHJcbiAgICBjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcclxuICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtQ29udGV4dCA9IGFjdGl2ZUVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLWZvcm0tbmFtZV0sIFtkYXRhLWR5bi1yb2xlPVwiRm9ybVwiXScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dC5jb250YWlucyhlbCkgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gYWN0aXZlIGZvcm0gY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSA0OiBBbnkgdmlzaWJsZSBlbGVtZW50IChwcmVmZXIgbGF0ZXIgb25lcyBhcyB0aGV5J3JlIG9mdGVuIGluIGNoaWxkIGZvcm1zIHJlbmRlcmVkIG9uIHRvcClcclxuICAgIGNvbnN0IHZpc2libGVNYXRjaGVzID0gQXJyYXkuZnJvbShhbGxNYXRjaGVzKS5maWx0ZXIoZWwgPT4gaXNFbGVtZW50VmlzaWJsZShlbCkpO1xyXG4gICAgaWYgKHZpc2libGVNYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAvLyBSZXR1cm4gdGhlIGxhc3QgdmlzaWJsZSBtYXRjaCAob2Z0ZW4gdGhlIGNoaWxkIGZvcm0ncyBlbGVtZW50KVxyXG4gICAgICAgIHJldHVybiB2aXNpYmxlTWF0Y2hlc1t2aXNpYmxlTWF0Y2hlcy5sZW5ndGggLSAxXTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGYWxsYmFjazogZmlyc3QgbWF0Y2hcclxuICAgIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZShlbCkge1xyXG4gICAgaWYgKCFlbCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XHJcbiAgICByZXR1cm4gcmVjdC53aWR0aCA+IDAgJiZcclxuICAgICAgICAgICByZWN0LmhlaWdodCA+IDAgJiZcclxuICAgICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScgJiZcclxuICAgICAgICAgICBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgIHN0eWxlLm9wYWNpdHkgIT09ICcwJztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRDM2NUxvYWRpbmcoKSB7XHJcbiAgICAvLyBDaGVjayBmb3IgY29tbW9uIEQzNjUgbG9hZGluZyBpbmRpY2F0b3JzXHJcbiAgICBjb25zdCBsb2FkaW5nU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcuZHluLWxvYWRpbmctb3ZlcmxheTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1sb2FkaW5nLWluZGljYXRvcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1zcGlubmVyOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcubG9hZGluZy1pbmRpY2F0b3I6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tbWVzc2FnZUJ1c3k6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1sb2FkaW5nPVwidHJ1ZVwiXScsXHJcbiAgICAgICAgJy5idXN5LWluZGljYXRvcicsXHJcbiAgICAgICAgJy5keW4tbG9hZGluZ1N0dWI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKSdcclxuICAgIF07XHJcblxyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBsb2FkaW5nU2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoZWwgJiYgZWwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBmb3IgQUpBWCByZXF1ZXN0cyBpbiBwcm9ncmVzcyAoRDM2NSBzcGVjaWZpYylcclxuICAgIGlmICh3aW5kb3cuJGR5biAmJiB3aW5kb3cuJGR5bi5pc1Byb2Nlc3NpbmcpIHtcclxuICAgICAgICByZXR1cm4gd2luZG93LiRkeW4uaXNQcm9jZXNzaW5nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSkge1xyXG4gICAgLy8gRmlyc3QsIHRyeSB0byBmaW5kIGluIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3cgKHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHMpXHJcbiAgICBjb25zdCBzZWxlY3RlZFJvd3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnKTtcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHNlbGVjdGVkUm93cykge1xyXG4gICAgICAgIGNvbnN0IGNlbGwgPSByb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJ5IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIC0gZmluZCBhY3RpdmUgcm93XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICAvLyBMb29rIGZvciBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nKTtcclxuICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjZWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBUcnkgZmluZGluZyBpbiBib2R5IHJvd3MgLSBwcmVmZXIgdGhlIExBU1QgdmlzaWJsZSBjZWxsLlxyXG4gICAgICAgIC8vIEFmdGVyIFwiQWRkIGxpbmVcIiwgRDM2NSBhcHBlbmRzIGEgbmV3IHJvdyBhdCB0aGUgYm90dG9tLlxyXG4gICAgICAgIC8vIElmIHRoZSBhY3RpdmUtcm93IGF0dHJpYnV0ZSBoYXNuJ3QgYmVlbiBzZXQgeWV0IChyYWNlIGNvbmRpdGlvbiksXHJcbiAgICAgICAgLy8gcmV0dXJuaW5nIHRoZSBmaXJzdCBjZWxsIHdvdWxkIHRhcmdldCByb3cgMSBpbnN0ZWFkIG9mIHRoZSBuZXcgcm93LlxyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBsZXQgbGFzdFZpc2libGVDZWxsID0gbnVsbDtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGlmIGluIGhlYWRlclxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNJbkhlYWRlciA9IGNlbGwuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzSW5IZWFkZXIgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBsYXN0VmlzaWJsZUNlbGwgPSBjZWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChsYXN0VmlzaWJsZUNlbGwpIHJldHVybiBsYXN0VmlzaWJsZUNlbGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyeSB0byBmaW5kIGluIHRyYWRpdGlvbmFsIEQzNjUgZ3JpZCBjb250ZXh0IC0gcHJlZmVyIGxhc3QgdmlzaWJsZSBjZWxsXHJcbiAgICBjb25zdCBncmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIGdyaWRzKSB7XHJcbiAgICAgICAgLy8gRmluZCBhbGwgbWF0Y2hpbmcgY2VsbHMgYW5kIHByZWZlciB2aXNpYmxlL2VkaXRhYmxlIG9uZXNcclxuICAgICAgICBjb25zdCBjZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBsZXQgbGFzdFZpc2libGVDZWxsID0gbnVsbDtcclxuICAgICAgICBmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyBpbiBhIGRhdGEgcm93IChub3QgaGVhZGVyKVxyXG4gICAgICAgICAgICBjb25zdCBpc0luSGVhZGVyID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0sIHRoZWFkJyk7XHJcbiAgICAgICAgICAgIGlmICghaXNJbkhlYWRlciAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgbGFzdFZpc2libGVDZWxsID0gY2VsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobGFzdFZpc2libGVDZWxsKSByZXR1cm4gbGFzdFZpc2libGVDZWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIHRvIHN0YW5kYXJkIGVsZW1lbnQgZmluZGluZ1xyXG4gICAgcmV0dXJuIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc0xvb2t1cEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICByZXR1cm4gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubG9va3VwLWJ1dHRvbiwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBCdXR0b25cIl0nKSAhPT0gbnVsbCB8fFxyXG4gICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gWycubG9va3VwLWJ1dHRvbicsICcubG9va3VwQnV0dG9uJywgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwQnV0dG9uXCJdJ107XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGRpcmVjdCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGRpcmVjdCkgcmV0dXJuIGRpcmVjdDtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAsIC5sb29rdXBGaWVsZCcpIHx8IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuICAgIGlmICghY29udGFpbmVyKSByZXR1cm4gbnVsbDtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgaW5Db250YWluZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGluQ29udGFpbmVyKSByZXR1cm4gaW5Db250YWluZXI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhcmlhQnV0dG9uID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblthcmlhLWxhYmVsKj1cIkxvb2t1cFwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiT3BlblwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VsZWN0XCJdJyk7XHJcbiAgICBpZiAoYXJpYUJ1dHRvbikgcmV0dXJuIGFyaWFCdXR0b247XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGVHbG9iYWwoZWxlbWVudCkge1xyXG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gZmFsc2U7XHJcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xyXG4gICAgcmV0dXJuIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmXHJcbiAgICAgICAgc3R5bGUudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwaWNrTmVhcmVzdFJvd3Mocm93cywgdGFyZ2V0RWxlbWVudCkge1xyXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkgcmV0dXJuIHJvd3M7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIGlmICghdGFyZ2V0UmVjdCkgcmV0dXJuIHJvd3M7XHJcbiAgICByZXR1cm4gcm93cy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICBjb25zdCByYSA9IGEuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgcmIgPSBiLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IGRhID0gTWF0aC5hYnMocmEubGVmdCAtIHRhcmdldFJlY3QubGVmdCkgKyBNYXRoLmFicyhyYS50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgY29uc3QgZGIgPSBNYXRoLmFicyhyYi5sZWZ0IC0gdGFyZ2V0UmVjdC5sZWZ0KSArIE1hdGguYWJzKHJiLnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICByZXR1cm4gZGEgLSBkYjtcclxuICAgIH0pO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZExvb2t1cEZpbHRlcklucHV0KGxvb2t1cERvY2spIHtcclxuICAgIGlmICghbG9va3VwRG9jaykgcmV0dXJuIG51bGw7XHJcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gQXJyYXkuZnJvbShcclxuICAgICAgICBsb29rdXBEb2NrLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdLCBpbnB1dFtyb2xlPVwidGV4dGJveFwiXScpXHJcbiAgICApO1xyXG4gICAgaWYgKCFjYW5kaWRhdGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgLy8gUHJlZmVyIGlucHV0cyBpbnNpZGUgc2VnbWVudGVkIGVudHJ5IGZseW91dCAoTWFpbkFjY291bnQgaW5wdXQgaW4gdGhlIHJpZ2h0IHBhbmVsKVxyXG4gICAgY29uc3Qgc2VnbWVudElucHV0ID0gY2FuZGlkYXRlcy5maW5kKGlucHV0ID0+IGlucHV0LmNsb3Nlc3QoJy5zZWdtZW50ZWRFbnRyeS1mbHlvdXRTZWdtZW50JykpO1xyXG4gICAgaWYgKHNlZ21lbnRJbnB1dCkgcmV0dXJuIHNlZ21lbnRJbnB1dDtcclxuXHJcbiAgICAvLyBTb21lIGZseW91dHMgd3JhcCB0aGUgaW5wdXQgaW4gYSBjb250YWluZXI7IHRyeSB0byBmaW5kIHRoZSBhY3R1YWwgaW5wdXQgaW5zaWRlXHJcbiAgICBjb25zdCBzZWdtZW50Q29udGFpbmVyID0gbG9va3VwRG9jay5xdWVyeVNlbGVjdG9yKCcuc2VnbWVudGVkRW50cnktZmx5b3V0U2VnbWVudCAuc2VnbWVudGVkRW50cnktc2VnbWVudElucHV0Jyk7XHJcbiAgICBpZiAoc2VnbWVudENvbnRhaW5lcikge1xyXG4gICAgICAgIGNvbnN0IGlubmVyID0gc2VnbWVudENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICAgICAgaWYgKGlubmVyKSByZXR1cm4gaW5uZXI7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJlZmVyIGlucHV0cyBpbnNpZGUgZ3JpZCBoZWFkZXIvdG9vbGJhciBvciBuZWFyIHRoZSB0b3AtcmlnaHQgKGxpa2UgdGhlIG1hcmtlZCBib3gpXHJcbiAgICBjb25zdCBoZWFkZXJDYW5kaWRhdGUgPSBjYW5kaWRhdGVzLmZpbmQoaW5wdXQgPT5cclxuICAgICAgICBpbnB1dC5jbG9zZXN0KCcubG9va3VwLWhlYWRlciwgLmxvb2t1cC10b29sYmFyLCAuZ3JpZC1oZWFkZXIsIFtyb2xlPVwidG9vbGJhclwiXScpXHJcbiAgICApO1xyXG4gICAgaWYgKGhlYWRlckNhbmRpZGF0ZSkgcmV0dXJuIGhlYWRlckNhbmRpZGF0ZTtcclxuXHJcbiAgICBsZXQgYmVzdCA9IGNhbmRpZGF0ZXNbMF07XHJcbiAgICBsZXQgYmVzdFNjb3JlID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xyXG4gICAgZm9yIChjb25zdCBpbnB1dCBvZiBjYW5kaWRhdGVzKSB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IGlucHV0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IHNjb3JlID0gcmVjdC50b3AgKiAyICsgcmVjdC5sZWZ0OyAvLyBiaWFzIHRvd2FyZHMgdG9wIHJvd1xyXG4gICAgICAgIGlmIChzY29yZSA8IGJlc3RTY29yZSkge1xyXG4gICAgICAgICAgICBiZXN0U2NvcmUgPSBzY29yZTtcclxuICAgICAgICAgICAgYmVzdCA9IGlucHV0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBiZXN0O1xyXG59XHJcbiIsICJpbXBvcnQgeyBzbGVlcCB9IGZyb20gJy4vYXN5bmMuanMnO1xyXG5pbXBvcnQgeyBpc0VsZW1lbnRWaXNpYmxlR2xvYmFsLCBwaWNrTmVhcmVzdFJvd3MgfSBmcm9tICcuL2RvbS5qcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvb2t1cFBvcHVwKHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnLmxvb2t1cC1idXR0b25Db250YWluZXInLFxyXG4gICAgICAgICcubG9va3VwRG9jay1idXR0b25Db250YWluZXInLFxyXG4gICAgICAgICdbcm9sZT1cImRpYWxvZ1wiXScsXHJcbiAgICAgICAgJy5sb29rdXAtZmx5b3V0JyxcclxuICAgICAgICAnLmxvb2t1cEZseW91dCcsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJMb29rdXBHcmlkXCJdJyxcclxuICAgICAgICAnLmxvb2t1cC1jb250YWluZXInLFxyXG4gICAgICAgICcubG9va3VwJyxcclxuICAgICAgICAnW3JvbGU9XCJncmlkXCJdJyxcclxuICAgICAgICAndGFibGUnXHJcbiAgICBdO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcHVwID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmICghcG9wdXApIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAocG9wdXAuY2xhc3NMaXN0Py5jb250YWlucygnbWVzc2FnZUNlbnRlcicpKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKHBvcHVwLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpID09PSAnQWN0aW9uIGNlbnRlcicpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAoIWlzRWxlbWVudFZpc2libGVHbG9iYWwocG9wdXApKSBjb250aW51ZTtcclxuICAgICAgICAgICAgcmV0dXJuIHBvcHVwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTG9va3VwUm93cyhsb29rdXBEb2NrLCB0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAzMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgbGV0IHJvd3MgPSBsb29rdXBEb2NrPy5xdWVyeVNlbGVjdG9yQWxsPy4oJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXScpIHx8IFtdO1xyXG4gICAgICAgIGlmIChyb3dzLmxlbmd0aCkgcmV0dXJuIHJvd3M7XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBmaW5kIHZpc2libGUgbG9va3VwIHJvd3MgYW55d2hlcmUgKHNvbWUgZG9ja3MgcmVuZGVyIG91dHNpZGUgdGhlIGNvbnRhaW5lcilcclxuICAgICAgICBjb25zdCBnbG9iYWxSb3dzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd0cltkYXRhLWR5bi1yb3ddLCAubG9va3VwLXJvdywgW3JvbGU9XCJyb3dcIl0nKSlcclxuICAgICAgICAgICAgLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKTtcclxuICAgICAgICBpZiAoZ2xvYmFsUm93cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBpY2tOZWFyZXN0Um93cyhnbG9iYWxSb3dzLCB0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBbXTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAzMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBkb2NrcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmxvb2t1cERvY2stYnV0dG9uQ29udGFpbmVyJykpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbClcclxuICAgICAgICAgICAgLmZpbHRlcihkb2NrID0+ICFkb2NrLmNsYXNzTGlzdD8uY29udGFpbnMoJ21lc3NhZ2VDZW50ZXInKSk7XHJcblxyXG4gICAgICAgIGlmIChkb2Nrcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3Qgd2l0aFJvd3MgPSBkb2Nrcy5maWx0ZXIoZG9jayA9PiBkb2NrLnF1ZXJ5U2VsZWN0b3IoJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXSwgW3JvbGU9XCJncmlkXCJdLCB0YWJsZScpKTtcclxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IHdpdGhSb3dzLmxlbmd0aCA/IHdpdGhSb3dzIDogZG9ja3M7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlc3QgPSBwaWNrTmVhcmVzdERvY2soY2FuZGlkYXRlcywgdGFyZ2V0UmVjdCk7XHJcbiAgICAgICAgICAgIGlmIChiZXN0KSByZXR1cm4gYmVzdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcGlja05lYXJlc3REb2NrKGRvY2tzLCB0YXJnZXRSZWN0KSB7XHJcbiAgICBpZiAoIWRvY2tzLmxlbmd0aCkgcmV0dXJuIG51bGw7XHJcbiAgICBpZiAoIXRhcmdldFJlY3QpIHJldHVybiBkb2Nrc1swXTtcclxuICAgIGxldCBiZXN0ID0gZG9ja3NbMF07XHJcbiAgICBsZXQgYmVzdFNjb3JlID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xyXG4gICAgZm9yIChjb25zdCBkb2NrIG9mIGRvY2tzKSB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IGRvY2suZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgZHggPSBNYXRoLmFicyhyZWN0LmxlZnQgLSB0YXJnZXRSZWN0LmxlZnQpO1xyXG4gICAgICAgIGNvbnN0IGR5ID0gTWF0aC5hYnMocmVjdC50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgY29uc3Qgc2NvcmUgPSBkeCArIGR5O1xyXG4gICAgICAgIGlmIChzY29yZSA8IGJlc3RTY29yZSkge1xyXG4gICAgICAgICAgICBiZXN0U2NvcmUgPSBzY29yZTtcclxuICAgICAgICAgICAgYmVzdCA9IGRvY2s7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJlc3Q7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTGlzdGJveEZvckVsZW1lbnQodGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gWydbcm9sZT1cImxpc3Rib3hcIl0nLCAnLmRyb3BEb3duTGlzdCcsICcuY29tYm9Cb3hEcm9wRG93bicsICcuZHJvcGRvd24tbWVudScsICcuZHJvcGRvd24tbGlzdCddO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRhcmdldEVsZW1lbnQ/LmdldEJvdW5kaW5nQ2xpZW50UmVjdD8uKCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgbGlzdHMgPSBzZWxlY3RvcnMuZmxhdE1hcChzZWwgPT4gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHNlbCkpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpO1xyXG4gICAgICAgIGlmIChsaXN0cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBpY2tOZWFyZXN0RG9jayhsaXN0cywgdGFyZ2V0UmVjdCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBsaW5rZWQgPSBnZXRMaXN0Ym94RnJvbUlucHV0KGlucHV0KTtcclxuICAgICAgICBpZiAobGlua2VkICYmIGlzRWxlbWVudFZpc2libGVHbG9iYWwobGlua2VkKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gbGlua2VkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBmYWxsYmFjayA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCAyMDApO1xyXG4gICAgICAgIGlmIChmYWxsYmFjaykgcmV0dXJuIGZhbGxiYWNrO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3Rib3hGcm9tSW5wdXQoaW5wdXQpIHtcclxuICAgIGlmICghaW5wdXQpIHJldHVybiBudWxsO1xyXG4gICAgY29uc3QgaWQgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnKSB8fCBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2FyaWEtb3ducycpO1xyXG4gICAgaWYgKGlkKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XHJcbiAgICAgICAgaWYgKGVsKSByZXR1cm4gZWw7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhY3RpdmVJZCA9IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jyk7XHJcbiAgICBpZiAoYWN0aXZlSWQpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVJZCk7XHJcbiAgICAgICAgY29uc3QgbGlzdCA9IGFjdGl2ZT8uY2xvc2VzdD8uKCdbcm9sZT1cImxpc3Rib3hcIl0nKTtcclxuICAgICAgICBpZiAobGlzdCkgcmV0dXJuIGxpc3Q7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb21ib0JveEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJy5sb29rdXBCdXR0b24nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtYnV0dG9uJyxcclxuICAgICAgICAnLmNvbWJvQm94LWRyb3BEb3duQnV0dG9uJyxcclxuICAgICAgICAnLmRyb3Bkb3duQnV0dG9uJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJEcm9wRG93bkJ1dHRvblwiXScsXHJcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIk9wZW5cIl0nLFxyXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJTZWxlY3RcIl0nXHJcbiAgICBdO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBidG4gPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChidG4pIHJldHVybiBidG47XHJcbiAgICB9XHJcbiAgICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5pbnB1dF9jb250YWluZXIsIC5mb3JtLWdyb3VwJykgfHwgZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybiBudWxsO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBidG4gPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGJ0bikgcmV0dXJuIGJ0bjtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29sbGVjdENvbWJvT3B0aW9ucyhsaXN0Ym94KSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJ1tyb2xlPVwib3B0aW9uXCJdJyxcclxuICAgICAgICAnLmNvbWJvQm94LWxpc3RJdGVtJyxcclxuICAgICAgICAnLmNvbWJvQm94LWl0ZW0nLFxyXG4gICAgICAgICdsaScsXHJcbiAgICAgICAgJy5kcm9wZG93bi1saXN0LWl0ZW0nLFxyXG4gICAgICAgICcuY29tYm9Cb3hJdGVtJyxcclxuICAgICAgICAnLmRyb3BEb3duTGlzdEl0ZW0nLFxyXG4gICAgICAgICcuZHJvcGRvd24taXRlbSdcclxuICAgIF07XHJcbiAgICBjb25zdCBmb3VuZCA9IFtdO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBsaXN0Ym94LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50VmlzaWJsZUdsb2JhbChlbCkpIGZvdW5kLnB1c2goZWwpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvdW5kLmxlbmd0aCA/IGZvdW5kIDogQXJyYXkuZnJvbShsaXN0Ym94LmNoaWxkcmVuKS5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbCk7XHJcbn1cclxuIiwgImltcG9ydCB7IHNsZWVwLCBzZXROYXRpdmVWYWx1ZSB9IGZyb20gJy4vYXN5bmMuanMnO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHR5cGVWYWx1ZVNsb3dseShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgaW5wdXQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gVHlwZSBjaGFyYWN0ZXIgYnkgY2hhcmFjdGVyXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBidWZmZXIpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MCk7IC8vIDgwbXMgcGVyIGNoYXJhY3RlclxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmJsdXIoKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7IC8vIFdhaXQgZm9yIHZhbGlkYXRpb25cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHR5cGVWYWx1ZVdpdGhJbnB1dEV2ZW50cyhpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgaW5wdXQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJyk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBidWZmZXIpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7IGRhdGE6IGNoYXIsIGlucHV0VHlwZTogJ2luc2VydFRleHQnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvcklucHV0VmFsdWUoaW5wdXQsIHZhbHVlLCB0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBleHBlY3RlZCA9IFN0cmluZyh2YWx1ZSA/PyAnJykudHJpbSgpO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSBTdHJpbmcoaW5wdXQ/LnZhbHVlID8/ICcnKS50cmltKCk7XHJcbiAgICAgICAgaWYgKGN1cnJlbnQgPT09IGV4cGVjdGVkKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0VmFsdWVPbmNlKGlucHV0LCB2YWx1ZSwgY2xlYXJGaXJzdCA9IGZhbHNlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIGlmIChjbGVhckZpcnN0KSB7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZXhwZWN0ZWQgPSBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKTtcclxuICAgIGF3YWl0IHNldFZhbHVlT25jZShpbnB1dCwgdmFsdWUsIHRydWUpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIGlmIChTdHJpbmcoaW5wdXQudmFsdWUgPz8gJycpLnRyaW0oKSAhPT0gZXhwZWN0ZWQpIHtcclxuICAgICAgICBhd2FpdCB0eXBlVmFsdWVTbG93bHkoaW5wdXQsIGV4cGVjdGVkKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gPT09PT09PT09PT09IDggQ29tYm9Cb3ggSW5wdXQgTWV0aG9kcyA9PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMTogQmFzaWMgc2V0VmFsdWUgKGZhc3QgYnV0IG1heSBub3QgdHJpZ2dlciBEMzY1IGZpbHRlcmluZylcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kMShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMjogUGFzdGUgc2ltdWxhdGlvbiB3aXRoIElucHV0RXZlbnRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kMihpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIENsZWFyIGZpcnN0XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gU2ltdWxhdGUgcGFzdGVcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbVBhc3RlJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDM6IENoYXJhY3Rlci1ieS1jaGFyYWN0ZXIgd2l0aCBmdWxsIGtleSBldmVudHMgKFJFQ09NTUVOREVEKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QzKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQ2xlYXIgdGhlIGlucHV0IGZpcnN0XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBidWZmZXI7XHJcblxyXG4gICAgICAgIC8vIEZpcmUga2V5ZG93blxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGJlZm9yZWlucHV0XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnYmVmb3JlaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdmFsdWVcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBpbnB1dCBldmVudFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBrZXl1cFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNDogQ2hhcmFjdGVyLWJ5LWNoYXJhY3RlciB3aXRoIGtleXByZXNzIChsZWdhY3kpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDQoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBjb25zdCBjaGFyQ29kZSA9IGNoYXIuY2hhckNvZGVBdCgwKTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBidWZmZXI7XHJcblxyXG4gICAgICAgIC8vIGtleWRvd25cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGtleXByZXNzIChkZXByZWNhdGVkIGJ1dCBzdGlsbCB1c2VkIGJ5IHNvbWUgZnJhbWV3b3JrcylcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlwcmVzcycsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgY2hhckNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGJlZm9yZWlucHV0XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnYmVmb3JlaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdmFsdWVcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgLy8gaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGtleXVwXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNTogZXhlY0NvbW1hbmQgaW5zZXJ0VGV4dFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q1KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2VsZWN0IGFsbCBhbmQgZGVsZXRlXHJcbiAgICBpbnB1dC5zZWxlY3QoKTtcclxuICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdkZWxldGUnKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBJbnNlcnQgdGV4dFxyXG4gICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2luc2VydFRleHQnLCBmYWxzZSwgdmFsdWUpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNjogUGFzdGUgKyBCYWNrc3BhY2Ugd29ya2Fyb3VuZFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q2KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2V0IHZhbHVlIGRpcmVjdGx5IChsaWtlIHBhc3RlKVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbVBhc3RlJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQWRkIGEgY2hhcmFjdGVyIGFuZCBkZWxldGUgaXQgdG8gdHJpZ2dlciBmaWx0ZXJpbmdcclxuICAgIGNvbnN0IHZhbHVlV2l0aEV4dHJhID0gdmFsdWUgKyAnWCc7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWVXaXRoRXh0cmEpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICBkYXRhOiAnWCdcclxuICAgIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gTm93IGRlbGV0ZSB0aGF0IGNoYXJhY3RlciB3aXRoIGEgcmVhbCBiYWNrc3BhY2UgZXZlbnRcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAga2V5OiAnQmFja3NwYWNlJyxcclxuICAgICAgICBjb2RlOiAnQmFja3NwYWNlJyxcclxuICAgICAgICBrZXlDb2RlOiA4LFxyXG4gICAgICAgIHdoaWNoOiA4LFxyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAga2V5OiAnQmFja3NwYWNlJyxcclxuICAgICAgICBjb2RlOiAnQmFja3NwYWNlJyxcclxuICAgICAgICBrZXlDb2RlOiA4LFxyXG4gICAgICAgIHdoaWNoOiA4LFxyXG4gICAgICAgIGJ1YmJsZXM6IHRydWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDc6IEQzNjUgaW50ZXJuYWwgbWVjaGFuaXNtIHRyaWdnZXJcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNyhpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIFNldCB2YWx1ZSB3aXRoIGZ1bGwgZXZlbnQgc2VxdWVuY2UgdXNlZCBieSBEMzY1XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBUeXBlIGNoYXJhY3RlciBieSBjaGFyYWN0ZXIgYnV0IGFsc28gZGlzcGF0Y2ggb24gdGhlIHBhcmVudCBjb250cm9sXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBpbnB1dC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZV0nKSB8fCBpbnB1dC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gaW5wdXQudmFsdWUgKyBjaGFyO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgYSBjb21wcmVoZW5zaXZlIGV2ZW50IHNldFxyXG4gICAgICAgIGNvbnN0IGtleWJvYXJkRXZlbnRJbml0ID0ge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgY29tcG9zZWQ6IHRydWUsXHJcbiAgICAgICAgICAgIHZpZXc6IHdpbmRvd1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEZpcmUgb24gaW5wdXQgYW5kIHBvdGVudGlhbGx5IGJ1YmJsZSB0byBEMzY1IGhhbmRsZXJzXHJcbiAgICAgICAgY29uc3Qga2V5ZG93bkV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCBrZXlib2FyZEV2ZW50SW5pdCk7XHJcbiAgICAgICAgY29uc3Qga2V5dXBFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIGtleWJvYXJkRXZlbnRJbml0KTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChrZXlkb3duRXZlbnQpO1xyXG5cclxuICAgICAgICAvLyBTZXQgdmFsdWUgQkVGT1JFIGlucHV0IGV2ZW50XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhcixcclxuICAgICAgICAgICAgY29tcG9zZWQ6IHRydWUsXHJcbiAgICAgICAgICAgIHZpZXc6IHdpbmRvd1xyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChrZXl1cEV2ZW50KTtcclxuXHJcbiAgICAgICAgLy8gQWxzbyBkaXNwYXRjaCBvbiBwYXJlbnQgZm9yIEQzNjUgY29udHJvbHNcclxuICAgICAgICBpZiAocGFyZW50ICYmIHBhcmVudCAhPT0gaW5wdXQpIHtcclxuICAgICAgICAgICAgcGFyZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluYWwgY2hhbmdlIGV2ZW50XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgICAvLyBUcnkgdG8gdHJpZ2dlciBEMzY1J3MgVmFsdWVDaGFuZ2VkIGNvbW1hbmRcclxuICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICBwYXJlbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ1ZhbHVlQ2hhbmdlZCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgZGV0YWlsOiB7IHZhbHVlOiB2YWx1ZSB9XHJcbiAgICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgODogQ29tcG9zaXRpb24gZXZlbnRzIChJTUUtc3R5bGUpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDgoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFN0YXJ0IGNvbXBvc2l0aW9uXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbnN0YXJ0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICBkYXRhOiAnJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBjdXJyZW50VmFsdWUgPSAnJztcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY3VycmVudFZhbHVlICs9IHN0cmluZ1ZhbHVlW2ldO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbnVwZGF0ZScsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgZGF0YTogY3VycmVudFZhbHVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydENvbXBvc2l0aW9uVGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGN1cnJlbnRWYWx1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEVuZCBjb21wb3NpdGlvblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgQ29tcG9zaXRpb25FdmVudCgnY29tcG9zaXRpb25lbmQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbUNvbXBvc2l0aW9uJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBIZWxwZXIgdG8gZ2V0IGtleSBjb2RlIGZyb20gY2hhcmFjdGVyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0S2V5Q29kZShjaGFyKSB7XHJcbiAgICBjb25zdCB1cHBlckNoYXIgPSBjaGFyLnRvVXBwZXJDYXNlKCk7XHJcbiAgICBpZiAodXBwZXJDaGFyID49ICdBJyAmJiB1cHBlckNoYXIgPD0gJ1onKSB7XHJcbiAgICAgICAgcmV0dXJuICdLZXknICsgdXBwZXJDaGFyO1xyXG4gICAgfVxyXG4gICAgaWYgKGNoYXIgPj0gJzAnICYmIGNoYXIgPD0gJzknKSB7XHJcbiAgICAgICAgcmV0dXJuICdEaWdpdCcgKyBjaGFyO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgc3BlY2lhbEtleXMgPSB7XHJcbiAgICAgICAgJyAnOiAnU3BhY2UnLFxyXG4gICAgICAgICctJzogJ01pbnVzJyxcclxuICAgICAgICAnPSc6ICdFcXVhbCcsXHJcbiAgICAgICAgJ1snOiAnQnJhY2tldExlZnQnLFxyXG4gICAgICAgICddJzogJ0JyYWNrZXRSaWdodCcsXHJcbiAgICAgICAgJ1xcXFwnOiAnQmFja3NsYXNoJyxcclxuICAgICAgICAnOyc6ICdTZW1pY29sb24nLFxyXG4gICAgICAgIFwiJ1wiOiAnUXVvdGUnLFxyXG4gICAgICAgICcsJzogJ0NvbW1hJyxcclxuICAgICAgICAnLic6ICdQZXJpb2QnLFxyXG4gICAgICAgICcvJzogJ1NsYXNoJyxcclxuICAgICAgICAnYCc6ICdCYWNrcXVvdGUnXHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIHNwZWNpYWxLZXlzW2NoYXJdIHx8ICdVbmlkZW50aWZpZWQnO1xyXG59XHJcblxyXG4vKipcclxuICogRGlzcGF0Y2hlciBmdW5jdGlvbiAtIHVzZXMgdGhlIHNlbGVjdGVkIGlucHV0IG1ldGhvZCBmcm9tIHNldHRpbmdzXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUsIG1ldGhvZCkge1xyXG4gICAgY29uc29sZS5sb2coYFtEMzY1XSBVc2luZyBjb21ib2JveCBpbnB1dCBtZXRob2Q6ICR7bWV0aG9kfWApO1xyXG5cclxuICAgIHN3aXRjaCAobWV0aG9kKSB7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kMSc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDInOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDIoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2QzJzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QzKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNCc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNChpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDUnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDUoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q2JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q2KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNyc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNyhpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDgnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDgoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBkZWZhdWx0OiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKTsgLy8gRGVmYXVsdCB0byBtZXRob2QgM1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29tbWl0Q29tYm9WYWx1ZShpbnB1dCwgdmFsdWUsIGVsZW1lbnQpIHtcclxuICAgIGlmICghaW5wdXQpIHJldHVybjtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2ZvY3Vzb3V0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFc2NhcGUnLCBjb2RlOiAnRXNjYXBlJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRXNjYXBlJywgY29kZTogJ0VzY2FwZScsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuYmx1cigpO1xyXG4gICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgfVxyXG4gICAgZG9jdW1lbnQuYm9keT8uY2xpY2s/LigpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGlzcGF0Y2hDbGlja1NlcXVlbmNlKHRhcmdldCkge1xyXG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcnVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5jbGljaygpO1xyXG59XHJcbiIsICJleHBvcnQgZnVuY3Rpb24gcGFyc2VHcmlkQW5kQ29sdW1uKGNvbnRyb2xOYW1lKSB7XG4gICAgY29uc3QgdGV4dCA9IFN0cmluZyhjb250cm9sTmFtZSB8fCAnJyk7XG4gICAgY29uc3QgbGFzdFVuZGVyc2NvcmVJZHggPSB0ZXh0Lmxhc3RJbmRleE9mKCdfJyk7XG4gICAgaWYgKGxhc3RVbmRlcnNjb3JlSWR4IDw9IDAgfHwgbGFzdFVuZGVyc2NvcmVJZHggPT09IHRleHQubGVuZ3RoIC0gMSkge1xuICAgICAgICByZXR1cm4geyBncmlkTmFtZTogdGV4dCwgY29sdW1uTmFtZTogJycgfTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ3JpZE5hbWU6IHRleHQuc3Vic3RyaW5nKDAsIGxhc3RVbmRlcnNjb3JlSWR4KSxcbiAgICAgICAgY29sdW1uTmFtZTogdGV4dC5zdWJzdHJpbmcobGFzdFVuZGVyc2NvcmVJZHggKyAxKVxuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEZpbHRlckZpZWxkUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Y29udHJvbE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXG4gICAgICAgIGBGaWx0ZXJGaWVsZF8ke2NvbnRyb2xOYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXG4gICAgICAgIGAke2NvbnRyb2xOYW1lfV9GaWx0ZXJGaWVsZF9JbnB1dGAsXG4gICAgICAgIGAke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9X0ZpbHRlckZpZWxkYFxuICAgIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgYCR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fQXBwbHlGaWx0ZXJzYCxcbiAgICAgICAgYCR7Y29udHJvbE5hbWV9X0FwcGx5RmlsdGVyc2AsXG4gICAgICAgIGAke2dyaWROYW1lfV9BcHBseUZpbHRlcnNgLFxuICAgICAgICAnQXBwbHlGaWx0ZXJzJ1xuICAgIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWx0ZXJNZXRob2RTZWFyY2hUZXJtcyhtZXRob2QpIHtcbiAgICBjb25zdCBtZXRob2RNYXBwaW5ncyA9IHtcbiAgICAgICAgJ2lzIGV4YWN0bHknOiBbJ2lzIGV4YWN0bHknLCAnZXF1YWxzJywgJ2lzIGVxdWFsIHRvJywgJz0nXSxcbiAgICAgICAgY29udGFpbnM6IFsnY29udGFpbnMnLCAnbGlrZSddLFxuICAgICAgICAnYmVnaW5zIHdpdGgnOiBbJ2JlZ2lucyB3aXRoJywgJ3N0YXJ0cyB3aXRoJ10sXG4gICAgICAgICdpcyBub3QnOiBbJ2lzIG5vdCcsICdub3QgZXF1YWwnLCAnIT0nLCAnPD4nXSxcbiAgICAgICAgJ2RvZXMgbm90IGNvbnRhaW4nOiBbJ2RvZXMgbm90IGNvbnRhaW4nLCAnbm90IGxpa2UnXSxcbiAgICAgICAgJ2lzIG9uZSBvZic6IFsnaXMgb25lIG9mJywgJ2luJ10sXG4gICAgICAgIGFmdGVyOiBbJ2FmdGVyJywgJ2dyZWF0ZXIgdGhhbicsICc+J10sXG4gICAgICAgIGJlZm9yZTogWydiZWZvcmUnLCAnbGVzcyB0aGFuJywgJzwnXSxcbiAgICAgICAgbWF0Y2hlczogWydtYXRjaGVzJywgJ3JlZ2V4JywgJ3BhdHRlcm4nXVxuICAgIH07XG4gICAgcmV0dXJuIG1ldGhvZE1hcHBpbmdzW21ldGhvZF0gfHwgW1N0cmluZyhtZXRob2QgfHwgJycpXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRleHRJbmNsdWRlc0FueSh0ZXh0LCB0ZXJtcykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRUZXh0ID0gU3RyaW5nKHRleHQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuICh0ZXJtcyB8fCBbXSkuc29tZSh0ZXJtID0+IG5vcm1hbGl6ZWRUZXh0LmluY2x1ZGVzKFN0cmluZyh0ZXJtIHx8ICcnKS50b0xvd2VyQ2FzZSgpKSk7XG59XG4iLCAiaW1wb3J0IHsgbG9nU3RlcCB9IGZyb20gJy4uL3V0aWxzL2xvZ2dpbmcuanMnO1xyXG5pbXBvcnQgeyBzZXROYXRpdmVWYWx1ZSwgc2xlZXAgfSBmcm9tICcuLi91dGlscy9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0LCBpc0VsZW1lbnRWaXNpYmxlLCBpc0QzNjVMb2FkaW5nLCBmaW5kR3JpZENlbGxFbGVtZW50LCBoYXNMb29rdXBCdXR0b24sIGZpbmRMb29rdXBCdXR0b24sIGZpbmRMb29rdXBGaWx0ZXJJbnB1dCB9IGZyb20gJy4uL3V0aWxzL2RvbS5qcyc7XHJcbmltcG9ydCB7IHdhaXRGb3JMb29rdXBQb3B1cCwgd2FpdEZvckxvb2t1cFJvd3MsIHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudCwgd2FpdEZvckxpc3Rib3hGb3JJbnB1dCwgY29sbGVjdENvbWJvT3B0aW9ucywgZmluZENvbWJvQm94QnV0dG9uIH0gZnJvbSAnLi4vdXRpbHMvbG9va3VwLmpzJztcclxuaW1wb3J0IHsgdHlwZVZhbHVlU2xvd2x5LCB0eXBlVmFsdWVXaXRoSW5wdXRFdmVudHMsIHdhaXRGb3JJbnB1dFZhbHVlLCBzZXRWYWx1ZU9uY2UsIHNldFZhbHVlV2l0aFZlcmlmeSwgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZCBhcyBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUsIGNvbW1pdENvbWJvVmFsdWUsIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZSB9IGZyb20gJy4uL3V0aWxzL2NvbWJvYm94LmpzJztcclxuaW1wb3J0IHsgY29lcmNlQm9vbGVhbiwgbm9ybWFsaXplVGV4dCB9IGZyb20gJy4uL3V0aWxzL3RleHQuanMnO1xyXG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuLi9ydW50aW1lL2Vycm9ycy5qcyc7XHJcbmltcG9ydCB7IHBhcnNlR3JpZEFuZENvbHVtbiwgYnVpbGRGaWx0ZXJGaWVsZFBhdHRlcm5zLCBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMsIGdldEZpbHRlck1ldGhvZFNlYXJjaFRlcm1zLCB0ZXh0SW5jbHVkZXNBbnkgfSBmcm9tICcuL2FjdGlvbi1oZWxwZXJzLmpzJztcclxuXHJcbmZ1bmN0aW9uIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBtZXRob2QgPSB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzPy5jb21ib1NlbGVjdE1vZGUgfHwgJ21ldGhvZDMnO1xyXG4gICAgcmV0dXJuIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2RXaXRoTW9kZShpbnB1dCwgdmFsdWUsIG1ldGhvZCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzU2VnbWVudGVkRW50cnkoZWxlbWVudCkge1xyXG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgaWYgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdTZWdtZW50ZWRFbnRyeScpIHJldHVybiB0cnVlO1xyXG4gICAgaWYgKGVsZW1lbnQuY2xvc2VzdD8uKCdbZGF0YS1keW4tcm9sZT1cIlNlZ21lbnRlZEVudHJ5XCJdJykpIHJldHVybiB0cnVlO1xyXG5cclxuICAgIGNvbnN0IGNsYXNzTGlzdCA9IGVsZW1lbnQuY2xhc3NMaXN0O1xyXG4gICAgaWYgKGNsYXNzTGlzdCAmJiAoY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWdtZW50ZWRFbnRyeScpIHx8XHJcbiAgICAgICAgY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWdtZW50ZWQtZW50cnknKSB8fFxyXG4gICAgICAgIGNsYXNzTGlzdC5jb250YWlucygnc2VnbWVudGVkRW50cnktc2VnbWVudElucHV0JykpKSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuICEhZWxlbWVudC5xdWVyeVNlbGVjdG9yPy4oJy5zZWdtZW50ZWRFbnRyeS1zZWdtZW50SW5wdXQsIC5zZWdtZW50ZWRFbnRyeS1mbHlvdXRTZWdtZW50Jyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbGlja0VsZW1lbnQoY29udHJvbE5hbWUpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICBcclxuICAgIGVsZW1lbnQuY2xpY2soKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseUdyaWRGaWx0ZXIoY29udHJvbE5hbWUsIGZpbHRlclZhbHVlLCBmaWx0ZXJNZXRob2QgPSAnaXMgZXhhY3RseScpIHtcclxuICAgIGNvbnNvbGUubG9nKGBBcHBseWluZyBmaWx0ZXI6ICR7Y29udHJvbE5hbWV9ICR7ZmlsdGVyTWV0aG9kfSBcIiR7ZmlsdGVyVmFsdWV9XCJgKTtcclxuICAgIFxyXG4gICAgLy8gRXh0cmFjdCBncmlkIG5hbWUgYW5kIGNvbHVtbiBuYW1lIGZyb20gY29udHJvbE5hbWVcclxuICAgIC8vIEZvcm1hdDogR3JpZE5hbWVfQ29sdW1uTmFtZSAoZS5nLiwgXCJHcmlkUmVhZE9ubHlNYXJrdXBUYWJsZV9NYXJrdXBDb2RlXCIpXHJcbiAgICBjb25zdCB7IGdyaWROYW1lLCBjb2x1bW5OYW1lIH0gPSBwYXJzZUdyaWRBbmRDb2x1bW4oY29udHJvbE5hbWUpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgICBHcmlkOiAke2dyaWROYW1lfSwgQ29sdW1uOiAke2NvbHVtbk5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiB0byBmaW5kIGZpbHRlciBpbnB1dCB3aXRoIG11bHRpcGxlIHBhdHRlcm5zXHJcbiAgICBhc3luYyBmdW5jdGlvbiBmaW5kRmlsdGVySW5wdXQoKSB7XHJcbiAgICAgICAgLy8gRDM2NSBjcmVhdGVzIGZpbHRlciBpbnB1dHMgd2l0aCB2YXJpb3VzIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgZmlsdGVyRmllbGRQYXR0ZXJucyA9IGJ1aWxkRmlsdGVyRmllbGRQYXR0ZXJucyhjb250cm9sTmFtZSwgZ3JpZE5hbWUsIGNvbHVtbk5hbWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBmaWx0ZXJJbnB1dCA9IG51bGw7XHJcbiAgICAgICAgbGV0IGZpbHRlckZpZWxkQ29udGFpbmVyID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgZXhhY3QgcGF0dGVybnMgZmlyc3RcclxuICAgICAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgZmlsdGVyRmllbGRQYXR0ZXJucykge1xyXG4gICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7cGF0dGVybn1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlckZpZWxkQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBmaWx0ZXJJbnB1dCA9IGZpbHRlckZpZWxkQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIGZpbHRlciBmaWVsZDogJHtwYXR0ZXJufWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBwYXJ0aWFsIG1hdGNoIG9uIEZpbHRlckZpZWxkIGNvbnRhaW5pbmcgdGhlIGNvbHVtbiBuYW1lXHJcbiAgICAgICAgY29uc3QgcGFydGlhbE1hdGNoZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl1bZGF0YS1keW4tY29udHJvbG5hbWUqPVwiJHtjb2x1bW5OYW1lfVwiXWApO1xyXG4gICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIHBhcnRpYWxNYXRjaGVzKSB7XHJcbiAgICAgICAgICAgIGZpbHRlcklucHV0ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgZmlsdGVyIGZpZWxkIChwYXJ0aWFsIG1hdGNoKTogJHtjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBjb250YWluZXIgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjazogRmluZCBhbnkgdmlzaWJsZSBmaWx0ZXIgaW5wdXQgaW4gZmlsdGVyIGRyb3Bkb3duL2ZseW91dCBhcmVhXHJcbiAgICAgICAgLy8gTG9vayBmb3IgaW5wdXRzIGluc2lkZSBmaWx0ZXItcmVsYXRlZCBjb250YWluZXJzXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQ29udGFpbmVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5keW4tZmlsdGVyLXBvcHVwLCAuZmlsdGVyLXBhbmVsLCBbZGF0YS1keW4tcm9sZT1cIkZpbHRlclBhbmVcIl0sIFtjbGFzcyo9XCJmaWx0ZXJcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNvbnRhaW5lciBvZiBmaWx0ZXJDb250YWluZXJzKSB7XHJcbiAgICAgICAgICAgIGZpbHRlcklucHV0ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSk6bm90KFtyZWFkb25seV0pJyk7XHJcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJbnB1dCAmJiBmaWx0ZXJJbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIGZpbHRlciBpbnB1dCBpbiBmaWx0ZXIgY29udGFpbmVyYCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXI6IGNvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIExhc3QgcmVzb3J0OiBBbnkgdmlzaWJsZSBGaWx0ZXJGaWVsZCBpbnB1dFxyXG4gICAgICAgIGNvbnN0IHZpc2libGVGaWx0ZXJJbnB1dHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl0gaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaW5wIG9mIHZpc2libGVGaWx0ZXJJbnB1dHMpIHtcclxuICAgICAgICAgICAgaWYgKGlucC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyID0gaW5wLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXScpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgdmlzaWJsZSBmaWx0ZXIgZmllbGQ6ICR7ZmlsdGVyRmllbGRDb250YWluZXI/LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKX1gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0OiBpbnAsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQ6IG51bGwsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBudWxsIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZpcnN0LCBjaGVjayBpZiB0aGUgZmlsdGVyIHBhbmVsIGlzIGFscmVhZHkgb3BlblxyXG4gICAgbGV0IHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH0gPSBhd2FpdCBmaW5kRmlsdGVySW5wdXQoKTtcclxuICAgIFxyXG4gICAgLy8gSWYgZmlsdGVyIGlucHV0IG5vdCBmb3VuZCwgd2UgbmVlZCB0byBjbGljayB0aGUgY29sdW1uIGhlYWRlciB0byBvcGVuIHRoZSBmaWx0ZXIgZHJvcGRvd25cclxuICAgIGlmICghZmlsdGVySW5wdXQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBGaWx0ZXIgcGFuZWwgbm90IG9wZW4sIGNsaWNraW5nIGhlYWRlciB0byBvcGVuLi4uYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCB0aGUgYWN0dWFsIGhlYWRlciBjZWxsXHJcbiAgICAgICAgY29uc3QgYWxsSGVhZGVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgbGV0IGNsaWNrVGFyZ2V0ID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IGggb2YgYWxsSGVhZGVycykge1xyXG4gICAgICAgICAgICBpZiAoaC5jbGFzc0xpc3QuY29udGFpbnMoJ2R5bi1oZWFkZXJDZWxsJykgfHwgXHJcbiAgICAgICAgICAgICAgICBoLmlkPy5pbmNsdWRlcygnaGVhZGVyJykgfHxcclxuICAgICAgICAgICAgICAgIGguY2xvc2VzdCgnLmR5bi1oZWFkZXJDZWxsJykgfHxcclxuICAgICAgICAgICAgICAgIGguY2xvc2VzdCgnW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0nKSkge1xyXG4gICAgICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBoO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGJ5IElEIHBhdHRlcm5cclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2lkKj1cIiR7Y29udHJvbE5hbWV9XCJdW2lkKj1cImhlYWRlclwiXWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBmaXJzdCBlbGVtZW50IHdpdGggY29udHJvbE5hbWVcclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjbGlja1RhcmdldCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZpbHRlciBjb2x1bW4gaGVhZGVyIG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MDApOyAvLyBXYWl0IGxvbmdlciBmb3IgZHJvcGRvd24gdG8gb3BlblxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJldHJ5IGZpbmRpbmcgdGhlIGZpbHRlciBpbnB1dCB3aXRoIGEgd2FpdCBsb29wXHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCAxMDsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgICAgICAgICh7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9ID0gYXdhaXQgZmluZEZpbHRlcklucHV0KCkpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQpIGJyZWFrO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFmaWx0ZXJJbnB1dCkge1xyXG4gICAgICAgIC8vIERlYnVnOiBMb2cgd2hhdCBlbGVtZW50cyB3ZSBjYW4gZmluZFxyXG4gICAgICAgIGNvbnN0IGFsbEZpbHRlckZpZWxkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXScpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIERlYnVnOiBGb3VuZCAke2FsbEZpbHRlckZpZWxkcy5sZW5ndGh9IEZpbHRlckZpZWxkIGVsZW1lbnRzOmApO1xyXG4gICAgICAgIGFsbEZpbHRlckZpZWxkcy5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgICAtICR7ZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpfSwgdmlzaWJsZTogJHtlbC5vZmZzZXRQYXJlbnQgIT09IG51bGx9YCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGaWx0ZXIgaW5wdXQgbm90IGZvdW5kLiBNYWtlIHN1cmUgdGhlIGZpbHRlciBkcm9wZG93biBpcyBvcGVuLiBFeHBlY3RlZCBwYXR0ZXJuOiBGaWx0ZXJGaWVsZF8ke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGVwIDQ6IFNldCB0aGUgZmlsdGVyIG1ldGhvZCBpZiBub3QgXCJpcyBleGFjdGx5XCIgKGRlZmF1bHQpXHJcbiAgICBpZiAoZmlsdGVyTWV0aG9kICYmIGZpbHRlck1ldGhvZCAhPT0gJ2lzIGV4YWN0bHknKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0RmlsdGVyTWV0aG9kKGZpbHRlckZpZWxkQ29udGFpbmVyLCBmaWx0ZXJNZXRob2QpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGVwIDU6IEVudGVyIHRoZSBmaWx0ZXIgdmFsdWVcclxuICAgIGZpbHRlcklucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgZmlsdGVySW5wdXQuc2VsZWN0KCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlIGZpcnN0XHJcbiAgICBmaWx0ZXJJbnB1dC52YWx1ZSA9ICcnO1xyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIFNldCB0aGUgdmFsdWUgdXNpbmcgbmF0aXZlIHNldHRlclxyXG4gICAgc2V0TmF0aXZlVmFsdWUoZmlsdGVySW5wdXQsIGZpbHRlclZhbHVlKTtcclxuICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNjogQXBwbHkgdGhlIGZpbHRlciAtIGZpbmQgYW5kIGNsaWNrIHRoZSBBcHBseSBidXR0b25cclxuICAgIC8vIElNUE9SVEFOVDogVGhlIHBhdHRlcm4gaXMge0dyaWROYW1lfV97Q29sdW1uTmFtZX1fQXBwbHlGaWx0ZXJzLCBub3QganVzdCB7R3JpZE5hbWV9X0FwcGx5RmlsdGVyc1xyXG4gICAgY29uc3QgYXBwbHlCdG5QYXR0ZXJucyA9IGJ1aWxkQXBwbHlCdXR0b25QYXR0ZXJucyhjb250cm9sTmFtZSwgZ3JpZE5hbWUsIGNvbHVtbk5hbWUpO1xyXG4gICAgXHJcbiAgICBsZXQgYXBwbHlCdG4gPSBudWxsO1xyXG4gICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIGFwcGx5QnRuUGF0dGVybnMpIHtcclxuICAgICAgICBhcHBseUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7cGF0dGVybn1cIl1gKTtcclxuICAgICAgICBpZiAoYXBwbHlCdG4gJiYgYXBwbHlCdG4ub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIGFwcGx5IGJ1dHRvbjogJHtwYXR0ZXJufWApO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZhbGxiYWNrOiBmaW5kIGFueSB2aXNpYmxlIEFwcGx5RmlsdGVycyBidXR0b25cclxuICAgIGlmICghYXBwbHlCdG4gfHwgYXBwbHlCdG4ub2Zmc2V0UGFyZW50ID09PSBudWxsKSB7XHJcbiAgICAgICAgY29uc3QgYWxsQXBwbHlCdG5zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkFwcGx5RmlsdGVyc1wiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgYnRuIG9mIGFsbEFwcGx5QnRucykge1xyXG4gICAgICAgICAgICBpZiAoYnRuLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgYXBwbHlCdG4gPSBidG47XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGFwcGx5QnRuKSB7XHJcbiAgICAgICAgYXBwbHlCdG4uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBcdTI3MTMgRmlsdGVyIGFwcGxpZWQ6IFwiJHtmaWx0ZXJWYWx1ZX1cImApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBUcnkgcHJlc3NpbmcgRW50ZXIgYXMgYWx0ZXJuYXRpdmVcclxuICAgICAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBcclxuICAgICAgICAgICAga2V5OiAnRW50ZXInLCBrZXlDb2RlOiAxMywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSBcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IFxyXG4gICAgICAgICAgICBrZXk6ICdFbnRlcicsIGtleUNvZGU6IDEzLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBcdTI3MTMgRmlsdGVyIGFwcGxpZWQgdmlhIEVudGVyOiBcIiR7ZmlsdGVyVmFsdWV9XCJgKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRVbnRpbENvbmRpdGlvbihjb250cm9sTmFtZSwgY29uZGl0aW9uLCBleHBlY3RlZFZhbHVlLCB0aW1lb3V0KSB7XHJcbiAgICBjb25zb2xlLmxvZyhgV2FpdGluZyBmb3I6ICR7Y29udHJvbE5hbWV9IHRvIGJlICR7Y29uZGl0aW9ufSAodGltZW91dDogJHt0aW1lb3V0fW1zKWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IHRpbWVvdXQpIHtcclxuICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgY29uZGl0aW9uTWV0ID0gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChjb25kaXRpb24pIHtcclxuICAgICAgICAgICAgY2FzZSAndmlzaWJsZSc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGV4aXN0cyBhbmQgaXMgdmlzaWJsZSAoaGFzIGxheW91dClcclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGVsZW1lbnQgJiYgZWxlbWVudC5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdoaWRkZW4nOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBkb2Vzbid0IGV4aXN0IG9yIGlzIG5vdCB2aXNpYmxlXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSAhZWxlbWVudCB8fCBlbGVtZW50Lm9mZnNldFBhcmVudCA9PT0gbnVsbCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgPT09ICdoaWRkZW4nIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkuZGlzcGxheSA9PT0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnZXhpc3RzJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGluIERPTVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCAhPT0gbnVsbDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ25vdC1leGlzdHMnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBkb2VzIG5vdCBleGlzdCBpbiBET01cclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGVsZW1lbnQgPT09IG51bGw7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdlbmFibGVkJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGFuZCBpcyBub3QgZGlzYWJsZWRcclxuICAgICAgICAgICAgICAgIGlmIChlbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBidXR0b24sIHNlbGVjdCwgdGV4dGFyZWEnKSB8fCBlbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9ICFpbnB1dC5kaXNhYmxlZCAmJiAhaW5wdXQuaGFzQXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdoYXMtdmFsdWUnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBoYXMgYSBzcGVjaWZpYyB2YWx1ZVxyXG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QnKSB8fCBlbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGlucHV0LnZhbHVlIHx8IGlucHV0LnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGN1cnJlbnRWYWx1ZS50cmltKCkgPT09IFN0cmluZyhleHBlY3RlZFZhbHVlKS50cmltKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvbmRpdGlvbk1ldCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICBcdTI3MTMgQ29uZGl0aW9uIG1ldDogJHtjb250cm9sTmFtZX0gaXMgJHtjb25kaXRpb259YCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7IC8vIFNtYWxsIHN0YWJpbGl0eSBkZWxheVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcihgVGltZW91dCB3YWl0aW5nIGZvciBcIiR7Y29udHJvbE5hbWV9XCIgdG8gYmUgJHtjb25kaXRpb259ICh3YWl0ZWQgJHt0aW1lb3V0fW1zKWApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0SW5wdXRWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGZpZWxkVHlwZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBGb3IgU2VnbWVudGVkRW50cnkgZmllbGRzIChBY2NvdW50LCBldGMpLCB1c2UgbG9va3VwIGJ1dHRvbiBhcHByb2FjaFxyXG4gICAgaWYgKGZpZWxkVHlwZT8udHlwZSA9PT0gJ3NlZ21lbnRlZC1sb29rdXAnIHx8IGlzU2VnbWVudGVkRW50cnkoZWxlbWVudCkpIHtcclxuICAgICAgICBhd2FpdCBzZXRTZWdtZW50ZWRFbnRyeVZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yIENvbWJvQm94L2VudW0gZmllbGRzLCBvcGVuIGRyb3Bkb3duIGFuZCBzZWxlY3RcclxuICAgIGlmIChmaWVsZFR5cGU/LmlucHV0VHlwZSA9PT0gJ2VudW0nIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdDb21ib0JveCcpIHtcclxuICAgICAgICBhd2FpdCBzZXRDb21ib0JveFZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yIFJhZGlvQnV0dG9uL0ZyYW1lT3B0aW9uQnV0dG9uIGdyb3VwcywgY2xpY2sgdGhlIGNvcnJlY3Qgb3B0aW9uXHJcbiAgICBjb25zdCByb2xlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgIGlmIChyb2xlID09PSAnUmFkaW9CdXR0b24nIHx8IHJvbGUgPT09ICdGcmFtZU9wdGlvbkJ1dHRvbicgfHwgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cInJhZGlvXCJdLCBpbnB1dFt0eXBlPVwicmFkaW9cIl0nKSkge1xyXG4gICAgICAgIGF3YWl0IHNldFJhZGlvQnV0dG9uVmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgIGlmICghaW5wdXQpIHRocm93IG5ldyBFcnJvcihgSW5wdXQgbm90IGZvdW5kIGluOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIC8vIEZvY3VzIHRoZSBpbnB1dCBmaXJzdFxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDE1MCk7XHJcblxyXG4gICAgaWYgKGlucHV0LnRhZ05hbWUgIT09ICdTRUxFQ1QnKSB7XHJcbiAgICAgICAgLy8gVXNlIHRoZSBzZWxlY3RlZCBjb21ib2JveCBpbnB1dCBtZXRob2RcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzcGF0Y2ggZXZlbnRzXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg0MDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0R3JpZENlbGxWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGZpZWxkVHlwZSwgd2FpdEZvclZhbGlkYXRpb24gPSBmYWxzZSkge1xyXG4gICAgY29uc29sZS5sb2coYFNldHRpbmcgZ3JpZCBjZWxsIHZhbHVlOiAke2NvbnRyb2xOYW1lfSA9IFwiJHt2YWx1ZX1cIiAod2FpdEZvclZhbGlkYXRpb249JHt3YWl0Rm9yVmFsaWRhdGlvbn0pYCk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIHRoZSBncmlkIHRvIGhhdmUgYW4gYWN0aXZlL3NlbGVjdGVkIHJvdyBiZWZvcmUgZmluZGluZyB0aGUgY2VsbC5cclxuICAgIC8vIEFmdGVyIFwiQWRkIGxpbmVcIiwgRDM2NSdzIFJlYWN0IGdyaWQgbWF5IHRha2UgYSBtb21lbnQgdG8gbWFyayB0aGUgbmV3IHJvd1xyXG4gICAgLy8gYXMgYWN0aXZlLiAgV2l0aG91dCB0aGlzIHdhaXQgdGhlIGZhbGxiYWNrIHNjYW4gaW4gZmluZEdyaWRDZWxsRWxlbWVudCBjYW5cclxuICAgIC8vIHJldHVybiBhIGNlbGwgZnJvbSBhIGRpZmZlcmVudCAoZWFybGllcikgcm93LCBjYXVzaW5nIGRhdGEgdG8gYmUgd3JpdHRlblxyXG4gICAgLy8gdG8gdGhlIHdyb25nIGxpbmUuXHJcbiAgICBhd2FpdCB3YWl0Rm9yQWN0aXZlR3JpZFJvdyhjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIGNlbGwgZWxlbWVudCAtIHByZWZlciB0aGUgb25lIGluIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3dcclxuICAgIGxldCBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIGlmICghZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBjbGlja2luZyBvbiB0aGUgZ3JpZCByb3cgZmlyc3QgdG8gYWN0aXZhdGUgaXRcclxuICAgICAgICBhd2FpdCBhY3RpdmF0ZUdyaWRSb3coY29udHJvbE5hbWUpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgZWxlbWVudCA9IGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWVsZW1lbnQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdyaWQgY2VsbCBlbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRm9yIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzLCB3ZSBuZWVkIHRvIGNsaWNrIG9uIHRoZSBjZWxsIHRvIGVudGVyIGVkaXQgbW9kZVxyXG4gICAgLy8gRmluZCB0aGUgYWN0dWFsIGNlbGwgY29udGFpbmVyIChmaXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbilcclxuICAgIGNvbnN0IHJlYWN0Q2VsbCA9IGVsZW1lbnQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJykgfHwgZWxlbWVudDtcclxuICAgIGNvbnN0IGlzUmVhY3RHcmlkID0gISFlbGVtZW50LmNsb3Nlc3QoJy5yZWFjdEdyaWQnKTtcclxuICAgIFxyXG4gICAgLy8gQ2xpY2sgb24gdGhlIGNlbGwgdG8gYWN0aXZhdGUgaXQgZm9yIGVkaXRpbmdcclxuICAgIGNvbnNvbGUubG9nKGAgIENsaWNraW5nIGNlbGwgdG8gYWN0aXZhdGU6IGlzUmVhY3RHcmlkPSR7aXNSZWFjdEdyaWR9YCk7XHJcbiAgICByZWFjdENlbGwuY2xpY2soKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIEZvciBSZWFjdCBncmlkcywgRDM2NSByZW5kZXJzIGlucHV0IGZpZWxkcyBkeW5hbWljYWxseSBhZnRlciBjbGlja2luZ1xyXG4gICAgLy8gV2UgbmVlZCB0byByZS1maW5kIHRoZSBlbGVtZW50IGFmdGVyIGNsaWNraW5nIGFzIEQzNjUgbWF5IGhhdmUgcmVwbGFjZWQgdGhlIERPTVxyXG4gICAgaWYgKGlzUmVhY3RHcmlkKSB7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTsgLy8gRXh0cmEgd2FpdCBmb3IgUmVhY3QgdG8gcmVuZGVyIGlucHV0XHJcbiAgICAgICAgZWxlbWVudCA9IGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpO1xyXG4gICAgICAgIGlmICghZWxlbWVudCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdyaWQgY2VsbCBlbGVtZW50IG5vdCBmb3VuZCBhZnRlciBjbGljazogJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRoZSBjbGljayBzaG91bGQgYWN0aXZhdGUgdGhlIGNlbGwgLSBub3cgZmluZCB0aGUgaW5wdXRcclxuICAgIGxldCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBubyBpbnB1dCBmb3VuZCBkaXJlY3RseSwgbG9vayBpbiB0aGUgY2VsbCBjb250YWluZXJcclxuICAgIGlmICghaW5wdXQgJiYgaXNSZWFjdEdyaWQpIHtcclxuICAgICAgICBjb25zdCBjZWxsQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKTtcclxuICAgICAgICBpZiAoY2VsbENvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBpbnB1dCA9IGNlbGxDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSWYgbm8gaW5wdXQgZm91bmQgZGlyZWN0bHksIHRyeSBnZXR0aW5nIGl0IGFmdGVyIGNsaWNrIGFjdGl2YXRpb24gd2l0aCByZXRyeVxyXG4gICAgaWYgKCFpbnB1dCkge1xyXG4gICAgICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgNTsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgIGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCAmJiBpbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQWxzbyBjaGVjayBpZiBhIG5ldyBpbnB1dCBhcHBlYXJlZCBpbiB0aGUgY2VsbFxyXG4gICAgICAgICAgICBjb25zdCBjZWxsQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKTtcclxuICAgICAgICAgICAgaWYgKGNlbGxDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGlucHV0ID0gY2VsbENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQgJiYgaW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU3RpbGwgbm8gaW5wdXQ/IENoZWNrIGlmIHRoZSBlbGVtZW50IGl0c2VsZiBpcyBhbiBpbnB1dFxyXG4gICAgaWYgKCFpbnB1dCAmJiAoZWxlbWVudC50YWdOYW1lID09PSAnSU5QVVQnIHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJyB8fCBlbGVtZW50LnRhZ05hbWUgPT09ICdTRUxFQ1QnKSkge1xyXG4gICAgICAgIGlucHV0ID0gZWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIGZpbmQgaW5wdXQgaW4gdGhlIHBhcmVudCByb3dcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICBjb25zdCByb3cgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluLCBbZGF0YS1keW4tcm9sZT1cIlJvd1wiXSwgW3JvbGU9XCJyb3dcIl0sIHRyJyk7XHJcbiAgICAgICAgaWYgKHJvdykge1xyXG4gICAgICAgICAgICBjb25zdCBwb3NzaWJsZUlucHV0cyA9IHJvdy5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSBpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSB0ZXh0YXJlYWApO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGlucCBvZiBwb3NzaWJsZUlucHV0cykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlucC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbnB1dCA9IGlucDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTGFzdCByZXNvcnQ6IGZpbmQgYW55IHZpc2libGUgaW5wdXQgaW4gdGhlIGFjdGl2ZSBjZWxsIGFyZWFcclxuICAgIGlmICghaW5wdXQgJiYgaXNSZWFjdEdyaWQpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVDZWxsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmR5bi1hY3RpdmVSb3dDZWxsLCAuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW46Zm9jdXMtd2l0aGluJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZUNlbGwpIHtcclxuICAgICAgICAgICAgaW5wdXQgPSBhY3RpdmVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICAvLyBMb2cgYXZhaWxhYmxlIGVsZW1lbnRzIGZvciBkZWJ1Z2dpbmdcclxuICAgICAgICBjb25zdCBncmlkQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcucmVhY3RHcmlkLCBbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKTtcclxuICAgICAgICBjb25zdCBhbGxJbnB1dHMgPSBncmlkQ29udGFpbmVyPy5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pJyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0F2YWlsYWJsZSBpbnB1dHMgaW4gZ3JpZDonLCBBcnJheS5mcm9tKGFsbElucHV0cyB8fCBbXSkubWFwKGkgPT4gKHtcclxuICAgICAgICAgICAgbmFtZTogaS5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk/LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSxcclxuICAgICAgICAgICAgdmlzaWJsZTogaS5vZmZzZXRQYXJlbnQgIT09IG51bGxcclxuICAgICAgICB9KSkpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW5wdXQgbm90IGZvdW5kIGluIGdyaWQgY2VsbDogJHtjb250cm9sTmFtZX0uIFRoZSBjZWxsIG1heSBuZWVkIHRvIGJlIGNsaWNrZWQgdG8gYmVjb21lIGVkaXRhYmxlLmApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEZXRlcm1pbmUgZmllbGQgdHlwZSBhbmQgdXNlIGFwcHJvcHJpYXRlIHNldHRlclxyXG4gICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICBcclxuICAgIGlmIChmaWVsZFR5cGU/LnR5cGUgPT09ICdzZWdtZW50ZWQtbG9va3VwJyB8fCByb2xlID09PSAnU2VnbWVudGVkRW50cnknIHx8IGlzU2VnbWVudGVkRW50cnkoZWxlbWVudCkpIHtcclxuICAgICAgICBhd2FpdCBzZXRTZWdtZW50ZWRFbnRyeVZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChmaWVsZFR5cGU/LmlucHV0VHlwZSA9PT0gJ2VudW0nIHx8IHJvbGUgPT09ICdDb21ib0JveCcpIHtcclxuICAgICAgICBhd2FpdCBzZXRDb21ib0JveFZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENoZWNrIGZvciBsb29rdXAgZmllbGRzXHJcbiAgICBpZiAocm9sZSA9PT0gJ0xvb2t1cCcgfHwgcm9sZSA9PT0gJ1JlZmVyZW5jZUdyb3VwJyB8fCBoYXNMb29rdXBCdXR0b24oZWxlbWVudCkpIHtcclxuICAgICAgICBhd2FpdCBzZXRMb29rdXBTZWxlY3RWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU3RhbmRhcmQgaW5wdXQgLSBmb2N1cyBhbmQgc2V0IHZhbHVlXHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgZXhpc3RpbmcgdmFsdWVcclxuICAgIGlucHV0LnNlbGVjdD8uKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICBcclxuICAgIC8vIFVzZSB0aGUgc3RhbmRhcmQgaW5wdXQgbWV0aG9kXHJcbiAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIFxyXG4gICAgLy8gRm9yIGdyaWQgY2VsbHMsIHdlIG5lZWQgdG8gcHJvcGVybHkgY29tbWl0IHRoZSB2YWx1ZVxyXG4gICAgLy8gRDM2NSBSZWFjdCBncmlkcyByZXF1aXJlIHRoZSBjZWxsIHRvIGxvc2UgZm9jdXMgZm9yIHZhbGlkYXRpb24gdG8gb2NjdXJcclxuICAgIFxyXG4gICAgLy8gTWV0aG9kIDE6IFByZXNzIEVudGVyIHRvIGNvbmZpcm0gdGhlIHZhbHVlIChpbXBvcnRhbnQgZm9yIGxvb2t1cCBmaWVsZHMgbGlrZSBJdGVtSWQpXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGtleUNvZGU6IDEzLCB3aGljaDogMTMsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywga2V5Q29kZTogMTMsIHdoaWNoOiAxMywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBNZXRob2QgMjogVGFiIG91dCB0byBtb3ZlIHRvIG5leHQgY2VsbCAodHJpZ2dlcnMgYmx1ciBhbmQgdmFsaWRhdGlvbilcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBrZXlDb2RlOiA5LCB3aGljaDogOSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGtleUNvZGU6IDksIHdoaWNoOiA5LCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAzOiBEaXNwYXRjaCBibHVyIGV2ZW50IGV4cGxpY2l0bHlcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUsIHJlbGF0ZWRUYXJnZXQ6IG51bGwgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIFxyXG4gICAgLy8gTWV0aG9kIDQ6IENsaWNrIG91dHNpZGUgdGhlIGNlbGwgdG8gZW5zdXJlIGZvY3VzIGlzIGxvc3RcclxuICAgIC8vIEZpbmQgYW5vdGhlciBjZWxsIG9yIHRoZSByb3cgY29udGFpbmVyIHRvIGNsaWNrXHJcbiAgICBjb25zdCByb3cgPSBpbnB1dC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbiwgW2RhdGEtZHluLXJvbGU9XCJSb3dcIl0nKTtcclxuICAgIGlmIChyb3cpIHtcclxuICAgICAgICBjb25zdCBvdGhlckNlbGwgPSByb3cucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluOm5vdCg6Zm9jdXMtd2l0aGluKScpO1xyXG4gICAgICAgIGlmIChvdGhlckNlbGwgJiYgb3RoZXJDZWxsICE9PSBpbnB1dC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKSkge1xyXG4gICAgICAgICAgICBvdGhlckNlbGwuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIEQzNjUgdG8gcHJvY2Vzcy92YWxpZGF0ZSB0aGUgdmFsdWUgKHNlcnZlci1zaWRlIGxvb2t1cCBmb3IgSXRlbUlkLCBldGMuKVxyXG4gICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIFxyXG4gICAgLy8gSWYgd2FpdEZvclZhbGlkYXRpb24gaXMgZW5hYmxlZCwgd2FpdCBmb3IgRDM2NSB0byBjb21wbGV0ZSB0aGUgbG9va3VwIHZhbGlkYXRpb25cclxuICAgIC8vIFRoaXMgaXMgaW1wb3J0YW50IGZvciBmaWVsZHMgbGlrZSBJdGVtSWQgdGhhdCB0cmlnZ2VyIHNlcnZlci1zaWRlIHZhbGlkYXRpb25cclxuICAgIGlmICh3YWl0Rm9yVmFsaWRhdGlvbikge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFdhaXRpbmcgZm9yIEQzNjUgdmFsaWRhdGlvbiBvZiAke2NvbnRyb2xOYW1lfS4uLmApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFdhaXQgZm9yIGFueSBsb2FkaW5nIGluZGljYXRvcnMgdG8gYXBwZWFyIGFuZCBkaXNhcHBlYXJcclxuICAgICAgICAvLyBEMzY1IHNob3dzIGEgbG9hZGluZyBzcGlubmVyIGR1cmluZyBzZXJ2ZXItc2lkZSBsb29rdXBzXHJcbiAgICAgICAgYXdhaXQgd2FpdEZvckQzNjVWYWxpZGF0aW9uKGNvbnRyb2xOYW1lLCA1MDAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYCAgR3JpZCBjZWxsIHZhbHVlIHNldDogJHtjb250cm9sTmFtZX0gPSBcIiR7dmFsdWV9XCJgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JEMzY1VmFsaWRhdGlvbihjb250cm9sTmFtZSwgdGltZW91dCA9IDUwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICBsZXQgbGFzdExvYWRpbmdTdGF0ZSA9IGZhbHNlO1xyXG4gICAgbGV0IHNlZW5Mb2FkaW5nID0gZmFsc2U7XHJcbiAgICBcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDwgdGltZW91dCkge1xyXG4gICAgICAgIC8vIENoZWNrIGZvciBEMzY1IGxvYWRpbmcgaW5kaWNhdG9yc1xyXG4gICAgICAgIGNvbnN0IGlzTG9hZGluZyA9IGlzRDM2NUxvYWRpbmcoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXNMb2FkaW5nICYmICFsYXN0TG9hZGluZ1N0YXRlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCcgICAgRDM2NSB2YWxpZGF0aW9uIHN0YXJ0ZWQgKGxvYWRpbmcgaW5kaWNhdG9yIGFwcGVhcmVkKScpO1xyXG4gICAgICAgICAgICBzZWVuTG9hZGluZyA9IHRydWU7XHJcbiAgICAgICAgfSBlbHNlIGlmICghaXNMb2FkaW5nICYmIGxhc3RMb2FkaW5nU3RhdGUgJiYgc2VlbkxvYWRpbmcpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJyAgICBEMzY1IHZhbGlkYXRpb24gY29tcGxldGVkIChsb2FkaW5nIGluZGljYXRvciBnb25lKScpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApOyAvLyBFeHRyYSBidWZmZXIgYWZ0ZXIgbG9hZGluZyBjb21wbGV0ZXNcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGxhc3RMb2FkaW5nU3RhdGUgPSBpc0xvYWRpbmc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWxzbyBjaGVjayBpZiB0aGUgY2VsbCBub3cgc2hvd3MgdmFsaWRhdGVkIGNvbnRlbnQgKGUuZy4sIHByb2R1Y3QgbmFtZSBhcHBlYXJlZClcclxuICAgICAgICAvLyBGb3IgSXRlbUlkLCBEMzY1IHNob3dzIHRoZSBpdGVtIG51bWJlciBhbmQgbmFtZSBhZnRlciB2YWxpZGF0aW9uXHJcbiAgICAgICAgY29uc3QgY2VsbCA9IGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpO1xyXG4gICAgICAgIGlmIChjZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxUZXh0ID0gY2VsbC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICAgICAgY29uc3QgaGFzTXVsdGlwbGVWYWx1ZXMgPSBjZWxsVGV4dC5zcGxpdCgvXFxzezIsfXxcXG4vKS5maWx0ZXIodCA9PiB0LnRyaW0oKSkubGVuZ3RoID4gMTtcclxuICAgICAgICAgICAgaWYgKGhhc011bHRpcGxlVmFsdWVzKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnICAgIEQzNjUgdmFsaWRhdGlvbiBjb21wbGV0ZWQgKGNlbGwgY29udGVudCB1cGRhdGVkKScpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIElmIHdlIHNhdyBsb2FkaW5nIGF0IHNvbWUgcG9pbnQsIHdhaXQgYSBiaXQgbW9yZSBhZnRlciB0aW1lb3V0XHJcbiAgICBpZiAoc2VlbkxvYWRpbmcpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnICAgIFZhbGlkYXRpb24gdGltZW91dCByZWFjaGVkLCBidXQgc2F3IGxvYWRpbmcgLSB3YWl0aW5nIGV4dHJhIHRpbWUnKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZygnICAgIFZhbGlkYXRpb24gd2FpdCBjb21wbGV0ZWQgKHRpbWVvdXQgb3Igbm8gbG9hZGluZyBkZXRlY3RlZCknKTtcclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFdhaXQgZm9yIHRoZSBncmlkIHRvIGhhdmUgYW4gYWN0aXZlL3NlbGVjdGVkIHJvdyB0aGF0IGNvbnRhaW5zIHRoZSB0YXJnZXRcclxuICogY29udHJvbC4gIEQzNjUgUmVhY3QgZ3JpZHMgdXBkYXRlIGBhcmlhLXNlbGVjdGVkYCBhc3luY2hyb25vdXNseSBhZnRlclxyXG4gKiBhY3Rpb25zIGxpa2UgXCJBZGQgbGluZVwiLCBzbyB3ZSBwb2xsIGZvciBhIHNob3J0IHBlcmlvZCBiZWZvcmUgZ2l2aW5nIHVwLlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckFjdGl2ZUdyaWRSb3coY29udHJvbE5hbWUsIHRpbWVvdXQgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dCkge1xyXG4gICAgICAgIC8vIFRyYWRpdGlvbmFsIGdyaWQgc2VsZWN0ZWQgcm93c1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdGVkUm93cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoXHJcbiAgICAgICAgICAgICdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnXHJcbiAgICAgICAgKTtcclxuICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiBzZWxlY3RlZFJvd3MpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGFjdGl2ZSByb3dcclxuICAgICAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihcclxuICAgICAgICAgICAgICAgICcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgJyArXHJcbiAgICAgICAgICAgICAgICAnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgICAgIGlmIChjZWxsICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgLy8gTm8gYWN0aXZlIHJvdyBmb3VuZCB3aXRoaW4gdGltZW91dCBcdTIwMTMgY2FsbGVyIHdpbGwgcHJvY2VlZCB3aXRoIGZhbGxiYWNrXHJcbiAgICBjb25zb2xlLmxvZyhgW0QzNjVdIHdhaXRGb3JBY3RpdmVHcmlkUm93OiBubyBhY3RpdmUgcm93IGZvdW5kIGZvciAke2NvbnRyb2xOYW1lfSB3aXRoaW4gJHt0aW1lb3V0fW1zLCBwcm9jZWVkaW5nIHdpdGggZmFsbGJhY2tgKTtcclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlR3JpZFJvdyhjb250cm9sTmFtZSkge1xyXG4gICAgLy8gVHJ5IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIGZpcnN0XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICAgICAgLy8gRmluZCB0aGUgcm93IGNvbnRhaW5pbmcgdGhpcyBjZWxsXHJcbiAgICAgICAgICAgICAgICBjb25zdCByb3cgPSBjZWxsLmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocm93KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2xpY2sgb24gdGhlIHJvdyB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgICAgICAgICByb3cuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgdHJhZGl0aW9uYWwgRDM2NSBncmlkc1xyXG4gICAgY29uc3QgZ3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiBncmlkcykge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGNlbGxcclxuICAgICAgICBjb25zdCBjZWxsID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChjZWxsKSB7XHJcbiAgICAgICAgICAgIC8vIEZpbmQgdGhlIHJvdyBjb250YWluaW5nIHRoaXMgY2VsbFxyXG4gICAgICAgICAgICBjb25zdCByb3cgPSBjZWxsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiUm93XCJdLCBbcm9sZT1cInJvd1wiXSwgdHInKTtcclxuICAgICAgICAgICAgaWYgKHJvdykge1xyXG4gICAgICAgICAgICAgICAgLy8gQ2xpY2sgb24gdGhlIHJvdyB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgICAgIHJvdy5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0TG9va3VwU2VsZWN0VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBsb29rdXAgZmllbGQnKTtcclxuXHJcbiAgICBjb25zdCBsb29rdXBCdXR0b24gPSBmaW5kTG9va3VwQnV0dG9uKGVsZW1lbnQpO1xyXG4gICAgaWYgKGxvb2t1cEJ1dHRvbikge1xyXG4gICAgICAgIGxvb2t1cEJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFRyeSB0byBvcGVuIGJ5IGZvY3VzaW5nIGFuZCBrZXlib2FyZFxyXG4gICAgICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBhd2FpdCBvcGVuTG9va3VwQnlLZXlib2FyZChpbnB1dCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbG9va3VwRG9jayA9IGF3YWl0IHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudChlbGVtZW50KTtcclxuICAgIGlmICghbG9va3VwRG9jaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9va3VwIGZseW91dCBub3QgZm91bmQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBUcnkgdHlwaW5nIGludG8gYSBsb29rdXAgZmx5b3V0IGlucHV0IGlmIHByZXNlbnQgKGUuZy4sIE1haW5BY2NvdW50KVxyXG4gICAgY29uc3QgZG9ja0lucHV0ID0gZmluZExvb2t1cEZpbHRlcklucHV0KGxvb2t1cERvY2spO1xyXG4gICAgaWYgKGRvY2tJbnB1dCkge1xyXG4gICAgICAgIGRvY2tJbnB1dC5jbGljaygpO1xyXG4gICAgICAgIGRvY2tJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGRvY2tJbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGRvY2tJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGRvY2tJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg2MDApO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3YWl0Rm9yTG9va3VwUm93cyhsb29rdXBEb2NrLCBlbGVtZW50KTtcclxuICAgIGlmICghcm93cy5sZW5ndGgpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xvb2t1cCBsaXN0IGlzIGVtcHR5Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2VhcmNoVmFsdWUgPSBTdHJpbmcodmFsdWUgPz8gJycpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBsZXQgbWF0Y2hlZCA9IGZhbHNlO1xyXG4gICAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSByb3cudGV4dENvbnRlbnQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGNvbnN0IGZpcnN0Q2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImdyaWRjZWxsXCJdLCB0ZCcpO1xyXG4gICAgICAgIGNvbnN0IGZpcnN0VGV4dCA9IGZpcnN0Q2VsbCA/IGZpcnN0Q2VsbC50ZXh0Q29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA6ICcnO1xyXG4gICAgICAgIGlmIChmaXJzdFRleHQgPT09IHNlYXJjaFZhbHVlIHx8IHRleHQuaW5jbHVkZXMoc2VhcmNoVmFsdWUpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGZpcnN0Q2VsbCB8fCByb3c7XHJcbiAgICAgICAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIHRhcmdldC5jbGljaygpO1xyXG4gICAgICAgICAgICBtYXRjaGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgLy8gU29tZSBEMzY1IGxvb2t1cHMgcmVxdWlyZSBFbnRlciBvciBkb3VibGUtY2xpY2sgdG8gY29tbWl0IHNlbGVjdGlvblxyXG4gICAgICAgICAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnZGJsY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICBjb25zdCBhcHBsaWVkID0gYXdhaXQgd2FpdEZvcklucHV0VmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICAgICAgaWYgKCFhcHBsaWVkKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUcnkgYSBzZWNvbmQgY29tbWl0IHBhc3MgaWYgdGhlIHZhbHVlIGRpZCBub3Qgc3RpY2tcclxuICAgICAgICAgICAgICAgIHRhcmdldC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFtYXRjaGVkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBMb29rdXAgdmFsdWUgbm90IGZvdW5kOiAke3ZhbHVlfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0Q2hlY2tib3hWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgLy8gRDM2NSBjaGVja2JveGVzIGNhbiBiZTpcclxuICAgIC8vIDEuIFN0YW5kYXJkIGlucHV0W3R5cGU9XCJjaGVja2JveFwiXVxyXG4gICAgLy8gMi4gQ3VzdG9tIHRvZ2dsZSB3aXRoIHJvbGU9XCJjaGVja2JveFwiIG9yIHJvbGU9XCJzd2l0Y2hcIlxyXG4gICAgLy8gMy4gRWxlbWVudCB3aXRoIGFyaWEtY2hlY2tlZCBhdHRyaWJ1dGUgKHRoZSBjb250YWluZXIgaXRzZWxmKVxyXG4gICAgLy8gNC4gRWxlbWVudCB3aXRoIGRhdGEtZHluLXJvbGU9XCJDaGVja0JveFwiXHJcbiAgICBcclxuICAgIGxldCBjaGVja2JveCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJyk7XHJcbiAgICBsZXQgaXNDdXN0b21Ub2dnbGUgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIGN1c3RvbSB0b2dnbGUgZWxlbWVudFxyXG4gICAgICAgIGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImNoZWNrYm94XCJdLCBbcm9sZT1cInN3aXRjaFwiXScpO1xyXG4gICAgICAgIGlmIChjaGVja2JveCkge1xyXG4gICAgICAgICAgICBpc0N1c3RvbVRvZ2dsZSA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB7XHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGVsZW1lbnQgaXRzZWxmIGlzIHRoZSB0b2dnbGUgKEQzNjUgb2Z0ZW4gZG9lcyB0aGlzKVxyXG4gICAgICAgIGlmIChlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgIT09IG51bGwgfHwgXHJcbiAgICAgICAgICAgIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdyb2xlJykgPT09ICdjaGVja2JveCcgfHxcclxuICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSA9PT0gJ3N3aXRjaCcgfHxcclxuICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0NoZWNrQm94Jykge1xyXG4gICAgICAgICAgICBjaGVja2JveCA9IGVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGlzQ3VzdG9tVG9nZ2xlID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHtcclxuICAgICAgICAvLyBMYXN0IHJlc29ydDogZmluZCBhbnkgY2xpY2thYmxlIHRvZ2dsZS1saWtlIGVsZW1lbnRcclxuICAgICAgICBjaGVja2JveCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignYnV0dG9uLCBbdGFiaW5kZXg9XCIwXCJdJyk7XHJcbiAgICAgICAgaWYgKGNoZWNrYm94KSB7XHJcbiAgICAgICAgICAgIGlzQ3VzdG9tVG9nZ2xlID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHRocm93IG5ldyBFcnJvcihgQ2hlY2tib3ggbm90IGZvdW5kIGluOiAke2NvbnRyb2xOYW1lfS4gRWxlbWVudCBIVE1MOiAke2VsZW1lbnQub3V0ZXJIVE1MLnN1YnN0cmluZygwLCAyMDApfWApO1xyXG5cclxuICAgIGNvbnN0IHNob3VsZENoZWNrID0gY29lcmNlQm9vbGVhbih2YWx1ZSk7XHJcbiAgICBcclxuICAgIC8vIERldGVybWluZSBjdXJyZW50IHN0YXRlXHJcbiAgICBsZXQgaXNDdXJyZW50bHlDaGVja2VkO1xyXG4gICAgaWYgKGlzQ3VzdG9tVG9nZ2xlKSB7XHJcbiAgICAgICAgaXNDdXJyZW50bHlDaGVja2VkID0gY2hlY2tib3guZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3guY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGVja2VkJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LmNsYXNzTGlzdC5jb250YWlucygnb24nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3guZ2V0QXR0cmlidXRlKCdkYXRhLWNoZWNrZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBpc0N1cnJlbnRseUNoZWNrZWQgPSBjaGVja2JveC5jaGVja2VkO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9ubHkgY2xpY2sgaWYgc3RhdGUgbmVlZHMgdG8gY2hhbmdlXHJcbiAgICBpZiAoc2hvdWxkQ2hlY2sgIT09IGlzQ3VycmVudGx5Q2hlY2tlZCkge1xyXG4gICAgICAgIGNoZWNrYm94LmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGb3IgY3VzdG9tIHRvZ2dsZXMsIGFsc28gdHJ5IGRpc3BhdGNoaW5nIGV2ZW50cyBpZiBjbGljayBkaWRuJ3Qgd29ya1xyXG4gICAgICAgIGlmIChpc0N1c3RvbVRvZ2dsZSkge1xyXG4gICAgICAgICAgICBjaGVja2JveC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBjaGVja2JveC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcGVuTG9va3VwQnlLZXlib2FyZChpbnB1dCkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIC8vIFRyeSBBbHQrRG93biB0aGVuIEY0IChjb21tb24gRDM2NS9XaW4gY29udHJvbHMpXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdBcnJvd0Rvd24nLCBjb2RlOiAnQXJyb3dEb3duJywgYWx0S2V5OiB0cnVlLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdBcnJvd0Rvd24nLCBjb2RlOiAnQXJyb3dEb3duJywgYWx0S2V5OiB0cnVlLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDE1MCk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdGNCcsIGNvZGU6ICdGNCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Y0JywgY29kZTogJ0Y0JywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpIHtcclxuICAgIC8vIEQzNjUgc2VnbWVudGVkIGxvb2t1cHMgb2Z0ZW4gdmFsaWRhdGUgb24gVGFiL0VudGVyIGFuZCBibHVyXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xvc2VEaWFsb2coZm9ybU5hbWUsIGFjdGlvbiA9ICdvaycpIHtcclxuICAgIGNvbnN0IGZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tZm9ybS1uYW1lPVwiJHtmb3JtTmFtZX1cIl1gKTtcclxuICAgIGlmICghZm9ybSkge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6IEZvcm0gJHtmb3JtTmFtZX0gbm90IGZvdW5kIHRvIGNsb3NlYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsZXQgYnV0dG9uTmFtZTtcclxuICAgIGlmIChmb3JtTmFtZSA9PT0gJ1N5c1JlY3VycmVuY2UnKSB7XHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdDb21tYW5kQnV0dG9uT2snIDogJ0NvbW1hbmRCdXR0b25DYW5jZWwnO1xyXG4gICAgfSBlbHNlIGlmIChmb3JtTmFtZSA9PT0gJ1N5c1F1ZXJ5Rm9ybScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ09rQnV0dG9uJyA6ICdDYW5jZWxCdXR0b24nO1xyXG4gICAgfSBlbHNlIGlmIChmb3JtTmFtZSA9PT0gJ1N5c09wZXJhdGlvblRlbXBsYXRlRm9ybScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ0NvbW1hbmRCdXR0b24nIDogJ0NvbW1hbmRCdXR0b25DYW5jZWwnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBUcnkgZ2VuZXJpYyBuYW1lc1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnQ29tbWFuZEJ1dHRvbicgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IGJ1dHRvbiA9IGZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtidXR0b25OYW1lfVwiXWApO1xyXG4gICAgaWYgKGJ1dHRvbikge1xyXG4gICAgICAgIGJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgbG9nU3RlcChgRGlhbG9nICR7Zm9ybU5hbWV9IGNsb3NlZCB3aXRoICR7YWN0aW9uLnRvVXBwZXJDYXNlKCl9YCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6ICR7YWN0aW9uLnRvVXBwZXJDYXNlKCl9IGJ1dHRvbiBub3QgZm91bmQgaW4gJHtmb3JtTmFtZX1gKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Q3VycmVudFJvd1ZhbHVlKGZpZWxkTWFwcGluZykge1xyXG4gICAgaWYgKCFmaWVsZE1hcHBpbmcpIHJldHVybiAnJztcclxuICAgIGNvbnN0IHJvdyA9IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwge307XHJcbiAgICBjb25zdCBkaXJlY3QgPSByb3dbZmllbGRNYXBwaW5nXTtcclxuICAgIGlmIChkaXJlY3QgIT09IHVuZGVmaW5lZCAmJiBkaXJlY3QgIT09IG51bGwpIHtcclxuICAgICAgICByZXR1cm4gU3RyaW5nKGRpcmVjdCk7XHJcbiAgICB9XHJcbiAgICBjb25zdCBmaWVsZE5hbWUgPSBmaWVsZE1hcHBpbmcuaW5jbHVkZXMoJzonKSA/IGZpZWxkTWFwcGluZy5zcGxpdCgnOicpLnBvcCgpIDogZmllbGRNYXBwaW5nO1xyXG4gICAgY29uc3QgdmFsdWUgPSByb3dbZmllbGROYW1lXTtcclxuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlRHluYW1pY1RleHQodGV4dCkge1xyXG4gICAgaWYgKHR5cGVvZiB0ZXh0ICE9PSAnc3RyaW5nJyB8fCAhdGV4dCkgcmV0dXJuIHRleHQgfHwgJyc7XHJcblxyXG4gICAgbGV0IHJlc29sdmVkID0gdGV4dDtcclxuICAgIGlmICgvX19EMzY1X1BBUkFNX0NMSVBCT0FSRF9bYS16MC05X10rX18vaS50ZXN0KHJlc29sdmVkKSkge1xyXG4gICAgICAgIGlmICghbmF2aWdhdG9yLmNsaXBib2FyZD8ucmVhZFRleHQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDbGlwYm9hcmQgQVBJIG5vdCBhdmFpbGFibGUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgY2xpcGJvYXJkVGV4dCA9IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQucmVhZFRleHQoKTtcclxuICAgICAgICByZXNvbHZlZCA9IHJlc29sdmVkLnJlcGxhY2UoL19fRDM2NV9QQVJBTV9DTElQQk9BUkRfW2EtejAtOV9dK19fL2dpLCBjbGlwYm9hcmRUZXh0ID8/ICcnKTtcclxuICAgIH1cclxuXHJcbiAgICByZXNvbHZlZCA9IHJlc29sdmVkLnJlcGxhY2UoL19fRDM2NV9QQVJBTV9EQVRBXyhbQS1aYS16MC05JS5ffi1dKilfXy9nLCAoXywgZW5jb2RlZEZpZWxkKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZmllbGQgPSBkZWNvZGVVUklDb21wb25lbnQoZW5jb2RlZEZpZWxkIHx8ICcnKTtcclxuICAgICAgICByZXR1cm4gZ2V0Q3VycmVudFJvd1ZhbHVlKGZpZWxkKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiByZXNvbHZlZDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG5hdmlnYXRlVG9Gb3JtKHN0ZXApIHtcclxuICAgIGNvbnN0IHsgbmF2aWdhdGVNZXRob2QsIG1lbnVJdGVtTmFtZSwgbWVudUl0ZW1UeXBlLCBuYXZpZ2F0ZVVybCwgaG9zdFJlbGF0aXZlUGF0aCwgd2FpdEZvckxvYWQsIG9wZW5Jbk5ld1RhYiB9ID0gc3RlcDtcclxuXHJcbiAgICBjb25zdCByZXNvbHZlZE1lbnVJdGVtTmFtZSA9IGF3YWl0IHJlc29sdmVEeW5hbWljVGV4dChtZW51SXRlbU5hbWUgfHwgJycpO1xyXG4gICAgY29uc3QgcmVzb2x2ZWROYXZpZ2F0ZVVybCA9IGF3YWl0IHJlc29sdmVEeW5hbWljVGV4dChuYXZpZ2F0ZVVybCB8fCAnJyk7XHJcbiAgICBjb25zdCByZXNvbHZlZEhvc3RSZWxhdGl2ZVBhdGggPSBhd2FpdCByZXNvbHZlRHluYW1pY1RleHQoaG9zdFJlbGF0aXZlUGF0aCB8fCAnJyk7XHJcblxyXG4gICAgbG9nU3RlcChgTmF2aWdhdGluZyB0byBmb3JtOiAke3Jlc29sdmVkTWVudUl0ZW1OYW1lIHx8IHJlc29sdmVkTmF2aWdhdGVVcmx9YCk7XHJcbiAgICBcclxuICAgIGxldCB0YXJnZXRVcmw7XHJcbiAgICBjb25zdCBiYXNlVXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZTtcclxuICAgIFxyXG4gICAgaWYgKG5hdmlnYXRlTWV0aG9kID09PSAndXJsJyAmJiByZXNvbHZlZE5hdmlnYXRlVXJsKSB7XHJcbiAgICAgICAgLy8gVXNlIGZ1bGwgVVJMIHBhdGggcHJvdmlkZWRcclxuICAgICAgICB0YXJnZXRVcmwgPSByZXNvbHZlZE5hdmlnYXRlVXJsLnN0YXJ0c1dpdGgoJ2h0dHAnKSA/IHJlc29sdmVkTmF2aWdhdGVVcmwgOiBiYXNlVXJsICsgcmVzb2x2ZWROYXZpZ2F0ZVVybDtcclxuICAgIH0gZWxzZSBpZiAobmF2aWdhdGVNZXRob2QgPT09ICdob3N0UmVsYXRpdmUnICYmIHJlc29sdmVkSG9zdFJlbGF0aXZlUGF0aCkge1xyXG4gICAgICAgIC8vIFJldXNlIGN1cnJlbnQgaG9zdCBkeW5hbWljYWxseSwgYXBwZW5kIHByb3ZpZGVkIHBhdGgvcXVlcnkuXHJcbiAgICAgICAgY29uc3QgcmVsYXRpdmVQYXJ0ID0gU3RyaW5nKHJlc29sdmVkSG9zdFJlbGF0aXZlUGF0aCkudHJpbSgpO1xyXG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSByZWxhdGl2ZVBhcnQuc3RhcnRzV2l0aCgnLycpIHx8IHJlbGF0aXZlUGFydC5zdGFydHNXaXRoKCc/JylcclxuICAgICAgICAgICAgPyByZWxhdGl2ZVBhcnRcclxuICAgICAgICAgICAgOiBgLyR7cmVsYXRpdmVQYXJ0fWA7XHJcbiAgICAgICAgdGFyZ2V0VXJsID0gYCR7d2luZG93LmxvY2F0aW9uLnByb3RvY29sfS8vJHt3aW5kb3cubG9jYXRpb24uaG9zdH0ke25vcm1hbGl6ZWR9YDtcclxuICAgIH0gZWxzZSBpZiAocmVzb2x2ZWRNZW51SXRlbU5hbWUpIHtcclxuICAgICAgICAvLyBCdWlsZCBVUkwgZnJvbSBtZW51IGl0ZW0gbmFtZVxyXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XHJcbiAgICAgICAgcGFyYW1zLmRlbGV0ZSgncScpO1xyXG4gICAgICAgIGNvbnN0IHR5cGVQcmVmaXggPSAobWVudUl0ZW1UeXBlICYmIG1lbnVJdGVtVHlwZSAhPT0gJ0Rpc3BsYXknKSA/IGAke21lbnVJdGVtVHlwZX06YCA6ICcnO1xyXG4gICAgICAgIGNvbnN0IHJhd01lbnVJdGVtID0gU3RyaW5nKHJlc29sdmVkTWVudUl0ZW1OYW1lKS50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFN1cHBvcnQgZXh0ZW5kZWQgaW5wdXQgbGlrZTpcclxuICAgICAgICAvLyBcIlN5c1RhYmxlQnJvd3NlciZ0YWJsZU5hbWU9SW52ZW50VGFibGVcIlxyXG4gICAgICAgIC8vIHNvIGV4dHJhIHF1ZXJ5IHBhcmFtcyBhcmUgYXBwZW5kZWQgYXMgcmVhbCBVUkwgcGFyYW1zLCBub3QgZW5jb2RlZCBpbnRvIG1pLlxyXG4gICAgICAgIGNvbnN0IHNlcGFyYXRvckluZGV4ID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgIC4uLlsnPycsICcmJ11cclxuICAgICAgICAgICAgICAgIC5tYXAoY2ggPT4gcmF3TWVudUl0ZW0uaW5kZXhPZihjaCkpXHJcbiAgICAgICAgICAgICAgICAuZmlsdGVyKGlkeCA9PiBpZHggPj0gMClcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBsZXQgbWVudUl0ZW1CYXNlID0gcmF3TWVudUl0ZW07XHJcbiAgICAgICAgbGV0IGV4dHJhUXVlcnkgPSAnJztcclxuXHJcbiAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShzZXBhcmF0b3JJbmRleCkpIHtcclxuICAgICAgICAgICAgbWVudUl0ZW1CYXNlID0gcmF3TWVudUl0ZW0uc2xpY2UoMCwgc2VwYXJhdG9ySW5kZXgpLnRyaW0oKTtcclxuICAgICAgICAgICAgZXh0cmFRdWVyeSA9IHJhd01lbnVJdGVtLnNsaWNlKHNlcGFyYXRvckluZGV4ICsgMSkudHJpbSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcGFyYW1zLnNldCgnbWknLCBgJHt0eXBlUHJlZml4fSR7bWVudUl0ZW1CYXNlfWApO1xyXG5cclxuICAgICAgICBpZiAoZXh0cmFRdWVyeSkge1xyXG4gICAgICAgICAgICBjb25zdCBleHRyYXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGV4dHJhUXVlcnkpO1xyXG4gICAgICAgICAgICBleHRyYXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGtleSAmJiBrZXkgIT09ICdtaScpIHtcclxuICAgICAgICAgICAgICAgICAgICBwYXJhbXMuc2V0KGtleSwgdmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRhcmdldFVybCA9IGJhc2VVcmwgKyAnPycgKyBwYXJhbXMudG9TdHJpbmcoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdOYXZpZ2F0ZSBzdGVwIHJlcXVpcmVzIGVpdGhlciBtZW51SXRlbU5hbWUgb3IgbmF2aWdhdGVVcmwnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgTmF2aWdhdGluZyB0bzogJHt0YXJnZXRVcmx9YCk7XHJcblxyXG4gICAgaWYgKG9wZW5Jbk5ld1RhYikge1xyXG4gICAgICAgIHdpbmRvdy5vcGVuKHRhcmdldFVybCwgJ19ibGFuaycsICdub29wZW5lcicpO1xyXG4gICAgICAgIGxvZ1N0ZXAoJ09wZW5lZCBuYXZpZ2F0aW9uIHRhcmdldCBpbiBhIG5ldyB0YWInKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTYXZlIHBlbmRpbmcgd29ya2Zsb3cgc3RhdGUgZGlyZWN0bHkgaW4gc2Vzc2lvblN0b3JhZ2UgYmVmb3JlIG5hdmlnYXRpb25cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldE1lbnVJdGVtTmFtZSA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdtaScpIHx8ICcnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElNUE9SVEFOVDogUGVyc2lzdCBwZW5kaW5nIG5hdmlnYXRpb24gc3RhdGUgZnJvbSB0aGUgY3VycmVudGx5IGV4ZWN1dGluZyB3b3JrZmxvdy5cclxuICAgICAgICAvLyBQcmVmZXIgY3VycmVudCB3b3JrZmxvdyBjb250ZXh0IGZpcnN0LCB0aGVuIGl0cyBvcmlnaW5hbC9mdWxsIHdvcmtmbG93IHdoZW4gcHJlc2VudC5cclxuICAgICAgICBjb25zdCBjdXJyZW50V29ya2Zsb3cgPSB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyB8fCBudWxsO1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsV29ya2Zsb3cgPSBjdXJyZW50V29ya2Zsb3c/Ll9vcmlnaW5hbFdvcmtmbG93IHx8IGN1cnJlbnRXb3JrZmxvdyB8fCB3aW5kb3cuZDM2NU9yaWdpbmFsV29ya2Zsb3cgfHwgbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwZW5kaW5nU3RhdGUgPSB7XHJcbiAgICAgICAgICAgIHdvcmtmbG93OiBvcmlnaW5hbFdvcmtmbG93LFxyXG4gICAgICAgICAgICB3b3JrZmxvd0lkOiBvcmlnaW5hbFdvcmtmbG93Py5pZCB8fCAnJyxcclxuICAgICAgICAgICAgbmV4dFN0ZXBJbmRleDogKHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudFN0ZXBJbmRleCA/PyAwKSArIDEsXHJcbiAgICAgICAgICAgIGN1cnJlbnRSb3dJbmRleDogd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50Um93SW5kZXggfHwgMCxcclxuICAgICAgICAgICAgdG90YWxSb3dzOiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LnRvdGFsUm93cyB8fCAwLFxyXG4gICAgICAgICAgICBkYXRhOiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnREYXRhUm93IHx8IG51bGwsXHJcbiAgICAgICAgICAgIHRhcmdldE1lbnVJdGVtTmFtZTogdGFyZ2V0TWVudUl0ZW1OYW1lLFxyXG4gICAgICAgICAgICB3YWl0Rm9yTG9hZDogd2FpdEZvckxvYWQgfHwgMzAwMCxcclxuICAgICAgICAgICAgc2F2ZWRBdDogRGF0ZS5ub3coKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9wZW5kaW5nX3dvcmtmbG93JywgSlNPTi5zdHJpbmdpZnkocGVuZGluZ1N0YXRlKSk7XHJcbiAgICAgICAgbG9nU3RlcChgU2F2ZWQgd29ya2Zsb3cgc3RhdGUgZm9yIG5hdmlnYXRpb24gKG5leHRTdGVwSW5kZXg6ICR7cGVuZGluZ1N0YXRlLm5leHRTdGVwSW5kZXh9KWApO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUud2FybignW0QzNjVdIEZhaWxlZCB0byBzYXZlIHdvcmtmbG93IHN0YXRlIGluIHNlc3Npb25TdG9yYWdlOicsIGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTaWduYWwgbmF2aWdhdGlvbiBpcyBhYm91dCB0byBoYXBwZW4gLSB3b3JrZmxvdyBzdGF0ZSB3aWxsIGJlIHNhdmVkIGJ5IHRoZSBleHRlbnNpb25cclxuICAgIC8vIFdlIG5lZWQgdG8gd2FpdCBmb3IgdGhlIHN0YXRlIHRvIGJlIHNhdmVkIGJlZm9yZSBuYXZpZ2F0aW5nXHJcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX05BVklHQVRJTkcnLFxyXG4gICAgICAgIHRhcmdldFVybDogdGFyZ2V0VXJsLFxyXG4gICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwXHJcbiAgICB9LCAnKicpO1xyXG4gICAgXHJcbiAgICAvLyBXYWl0IGxvbmdlciB0byBlbnN1cmUgdGhlIGZ1bGwgY2hhaW4gY29tcGxldGVzOlxyXG4gICAgLy8gcG9zdE1lc3NhZ2UgLT4gY29udGVudC5qcyAtPiBiYWNrZ3JvdW5kLmpzIC0+IHBvcHVwIC0+IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdFxyXG4gICAgLy8gVGhpcyBjaGFpbiBpbnZvbHZlcyBtdWx0aXBsZSBhc3luYyBob3BzLCBzbyB3ZSBuZWVkIHN1ZmZpY2llbnQgdGltZVxyXG4gICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIFxyXG4gICAgLy8gTmF2aWdhdGUgLSB0aGlzIHdpbGwgY2F1c2UgcGFnZSByZWxvYWQsIHNjcmlwdCBjb250ZXh0IHdpbGwgYmUgbG9zdFxyXG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0YXJnZXRVcmw7XHJcbiAgICBcclxuICAgIC8vIFRoaXMgY29kZSB3b24ndCBleGVjdXRlIGR1ZSB0byBwYWdlIG5hdmlnYXRpb24sIGJ1dCBrZWVwIGl0IGZvciByZWZlcmVuY2VcclxuICAgIC8vIFRoZSB3b3JrZmxvdyB3aWxsIGJlIHJlc3VtZWQgYnkgdGhlIGNvbnRlbnQgc2NyaXB0IGFmdGVyIHBhZ2UgbG9hZFxyXG4gICAgYXdhaXQgc2xlZXAod2FpdEZvckxvYWQgfHwgMzAwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZVRhYihjb250cm9sTmFtZSkge1xyXG4gICAgbG9nU3RlcChgQWN0aXZhdGluZyB0YWI6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIHRhYiBlbGVtZW50IC0gY291bGQgYmUgdGhlIHRhYiBjb250ZW50IG9yIHRoZSB0YWIgYnV0dG9uIGl0c2VsZlxyXG4gICAgbGV0IHRhYkVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vdCBmb3VuZCBkaXJlY3RseSwgdHJ5IGZpbmRpbmcgYnkgbG9va2luZyBmb3IgdGFiIGhlYWRlcnMvbGlua3NcclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIHRoZSB0YWIgbGluay9idXR0b24gdGhhdCByZWZlcmVuY2VzIHRoaXMgdGFiXHJcbiAgICAgICAgdGFiRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9X2hlYWRlclwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdIFtyb2xlPVwidGFiXCJdYCkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2FyaWEtY29udHJvbHM9XCIke2NvbnRyb2xOYW1lfVwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGFbaHJlZio9XCIke2NvbnRyb2xOYW1lfVwiXSwgYnV0dG9uW2RhdGEtdGFyZ2V0Kj1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVGFiIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgRDM2NSBwYXJhbWV0ZXIgZm9ybXMgd2l0aCB2ZXJ0aWNhbCB0YWJzLCB0aGUgY2xpY2thYmxlIGVsZW1lbnQgc3RydWN0dXJlIHZhcmllc1xyXG4gICAgLy8gVHJ5IG11bHRpcGxlIGFwcHJvYWNoZXMgdG8gZmluZCBhbmQgY2xpY2sgdGhlIHJpZ2h0IGVsZW1lbnRcclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMTogTG9vayBmb3IgdGhlIHRhYiBsaW5rIGluc2lkZSBhIHBpdm90L3RhYiBzdHJ1Y3R1cmVcclxuICAgIGxldCBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3RvcignLnBpdm90LWxpbmssIC50YWItbGluaywgW3JvbGU9XCJ0YWJcIl0nKTtcclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMjogVGhlIGVsZW1lbnQgaXRzZWxmIG1pZ2h0IGJlIHRoZSBsaW5rXHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0ICYmICh0YWJFbGVtZW50LnRhZ05hbWUgPT09ICdBJyB8fCB0YWJFbGVtZW50LnRhZ05hbWUgPT09ICdCVVRUT04nIHx8IHRhYkVsZW1lbnQuZ2V0QXR0cmlidXRlKCdyb2xlJykgPT09ICd0YWInKSkge1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMzogRm9yIHZlcnRpY2FsIHRhYnMsIGxvb2sgZm9yIHRoZSBhbmNob3Igb3IgbGluayBlbGVtZW50XHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2EsIGJ1dHRvbicpIHx8IHRhYkVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDQ6IEZvciBQaXZvdEl0ZW0sIGZpbmQgdGhlIGhlYWRlciBlbGVtZW50XHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0IHx8IGNsaWNrVGFyZ2V0ID09PSB0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGNvbnRyb2xOYW1lICsgJ19oZWFkZXInO1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtoZWFkZXJOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXJFbCkge1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlckVsLnF1ZXJ5U2VsZWN0b3IoJ2EsIGJ1dHRvbiwgLnBpdm90LWxpbmsnKSB8fCBoZWFkZXJFbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYENsaWNraW5nIHRhYiBlbGVtZW50OiAke2NsaWNrVGFyZ2V0Py50YWdOYW1lIHx8ICd1bmtub3duJ31gKTtcclxuICAgIFxyXG4gICAgLy8gRm9jdXMgYW5kIGNsaWNrXHJcbiAgICBpZiAoY2xpY2tUYXJnZXQuZm9jdXMpIGNsaWNrVGFyZ2V0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgXHJcbiAgICAvLyBEaXNwYXRjaCBmdWxsIGNsaWNrIHNlcXVlbmNlXHJcbiAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XHJcbiAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XHJcbiAgICBcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIEFsc28gdHJ5IHRyaWdnZXJpbmcgdGhlIEQzNjUgaW50ZXJuYWwgY29udHJvbFxyXG4gICAgaWYgKHR5cGVvZiAkZHluICE9PSAndW5kZWZpbmVkJyAmJiAkZHluLmNvbnRyb2xzKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbCA9ICRkeW4uY29udHJvbHNbY29udHJvbE5hbWVdO1xyXG4gICAgICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb250cm9sLkFjdGl2YXRlVGFiID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5BY3RpdmF0ZVRhYih0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgQWN0aXZhdGVUYWIgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuYWN0aXZhdGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLmFjdGl2YXRlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIGFjdGl2YXRlIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLnNlbGVjdCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuc2VsZWN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIHNlbGVjdCBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBsb2dTdGVwKGBEMzY1IGNvbnRyb2wgbWV0aG9kIGZhaWxlZDogJHtlLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBXYWl0IGZvciB0YWIgY29udGVudCB0byBsb2FkXHJcbiAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgdGhlIHRhYiBpcyBub3cgYWN0aXZlIGJ5IGNoZWNraW5nIGZvciB2aXNpYmxlIGNvbnRlbnRcclxuICAgIGNvbnN0IHRhYkNvbnRlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgaWYgKHRhYkNvbnRlbnQpIHtcclxuICAgICAgICBjb25zdCBpc1Zpc2libGUgPSB0YWJDb250ZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbDtcclxuICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IHRhYkNvbnRlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFiQ29udGVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYkNvbnRlbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicpICE9PSAndHJ1ZSc7XHJcbiAgICAgICAgbG9nU3RlcChgVGFiICR7Y29udHJvbE5hbWV9IHZpc2liaWxpdHkgY2hlY2s6IHZpc2libGU9JHtpc1Zpc2libGV9LCBhY3RpdmU9JHtpc0FjdGl2ZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgVGFiICR7Y29udHJvbE5hbWV9IGFjdGl2YXRlZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWN0aXZhdGVBY3Rpb25QYW5lVGFiKGNvbnRyb2xOYW1lKSB7XHJcbiAgICBsb2dTdGVwKGBBY3RpdmF0aW5nIGFjdGlvbiBwYW5lIHRhYjogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICBsZXQgdGFiRWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuXHJcbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgICAgIGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgIGAuYXBwQmFyVGFiW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICBgLmFwcEJhclRhYiBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgIGBbcm9sZT1cInRhYlwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICAgICAgdGFiRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgICAgICBpZiAodGFiRWxlbWVudCkgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWN0aW9uIHBhbmUgdGFiIG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xyXG5cclxuICAgIGNvbnN0IGhlYWRlciA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCcuYXBwQmFyVGFiLWhlYWRlciwgLmFwcEJhclRhYkhlYWRlciwgLmFwcEJhclRhYl9oZWFkZXInKTtcclxuICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlcjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmb2N1c1NlbGVjdG9yID0gdGFiRWxlbWVudC5nZXRBdHRyaWJ1dGU/LignZGF0YS1keW4tZm9jdXMnKTtcclxuICAgIGlmIChmb2N1c1NlbGVjdG9yKSB7XHJcbiAgICAgICAgY29uc3QgZm9jdXNUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoZm9jdXNTZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGZvY3VzVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZm9jdXNUYXJnZXQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0YWJFbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdyb2xlJykgPT09ICd0YWInKSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChjbGlja1RhcmdldCA9PT0gdGFiRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbmlzaCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCdidXR0b24sIGEsIFtyb2xlPVwidGFiXCJdJyk7XHJcbiAgICAgICAgaWYgKGJ1dHRvbmlzaCkgY2xpY2tUYXJnZXQgPSBidXR0b25pc2g7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNsaWNrVGFyZ2V0Py5mb2N1cykgY2xpY2tUYXJnZXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBkaXNwYXRjaENsaWNrU2VxdWVuY2UoY2xpY2tUYXJnZXQpO1xyXG5cclxuICAgIGlmICh0eXBlb2YgJGR5biAhPT0gJ3VuZGVmaW5lZCcgJiYgJGR5bi5jb250cm9scykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2wgPSAkZHluLmNvbnRyb2xzW2NvbnRyb2xOYW1lXTtcclxuICAgICAgICAgICAgaWYgKGNvbnRyb2wpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29udHJvbC5hY3RpdmF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuYWN0aXZhdGUoKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuc2VsZWN0ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5zZWxlY3QoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgbG9nU3RlcChgQWN0aW9uIHBhbmUgY29udHJvbCBtZXRob2QgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoNjAwKTtcclxuICAgIGxvZ1N0ZXAoYEFjdGlvbiBwYW5lIHRhYiAke2NvbnRyb2xOYW1lfSBhY3RpdmF0ZWRgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKGNvbnRyb2xOYW1lLCBhY3Rpb24pIHtcclxuICAgIGxvZ1N0ZXAoYCR7YWN0aW9uID09PSAnZXhwYW5kJyA/ICdFeHBhbmRpbmcnIDogJ0NvbGxhcHNpbmcnfSBzZWN0aW9uOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBzZWN0aW9uID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFzZWN0aW9uKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBTZWN0aW9uIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEMzY1IHNlY3Rpb25zIGNhbiBoYXZlIHZhcmlvdXMgc3RydWN0dXJlcy4gVGhlIHRvZ2dsZSBidXR0b24gaXMgdXN1YWxseTpcclxuICAgIC8vIDEuIEEgYnV0dG9uIHdpdGggYXJpYS1leHBhbmRlZCBpbnNpZGUgdGhlIHNlY3Rpb25cclxuICAgIC8vIDIuIEEgc2VjdGlvbiBoZWFkZXIgZWxlbWVudFxyXG4gICAgLy8gMy4gVGhlIHNlY3Rpb24gaXRzZWxmIG1pZ2h0IGJlIGNsaWNrYWJsZVxyXG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSB0b2dnbGUgYnV0dG9uIC0gdGhpcyBpcyBjcnVjaWFsIGZvciBEMzY1IGRpYWxvZ3NcclxuICAgIGxldCB0b2dnbGVCdXR0b24gPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblthcmlhLWV4cGFuZGVkXScpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBub3QgZm91bmQsIHRyeSBvdGhlciBjb21tb24gcGF0dGVybnNcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCcuc2VjdGlvbi1wYWdlLWNhcHRpb24sIC5zZWN0aW9uLWhlYWRlciwgLmdyb3VwLWhlYWRlciwgW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZUhlYWRlclwiXScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtIHNlY3Rpb25zIChSZWNvcmRzIHRvIGluY2x1ZGUsIFJ1biBpbiB0aGUgYmFja2dyb3VuZClcclxuICAgIC8vIHRoZSBidXR0b24gaXMgb2Z0ZW4gYSBkaXJlY3QgY2hpbGQgb3Igc2libGluZ1xyXG4gICAgaWYgKCF0b2dnbGVCdXR0b24pIHtcclxuICAgICAgICB0b2dnbGVCdXR0b24gPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBpZiB0aGUgc2VjdGlvbiBpdHNlbGYgaGFzIGFyaWEtZXhwYW5kZWQgKGl0IG1pZ2h0IGJlIHRoZSBjbGlja2FibGUgZWxlbWVudClcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uICYmIHNlY3Rpb24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICB0b2dnbGVCdXR0b24gPSBzZWN0aW9uO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEZXRlcm1pbmUgY3VycmVudCBzdGF0ZSBmcm9tIHZhcmlvdXMgc291cmNlc1xyXG4gICAgbGV0IGlzRXhwYW5kZWQgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgdGhlIHRvZ2dsZSBidXR0b24ncyBhcmlhLWV4cGFuZGVkXHJcbiAgICBpZiAodG9nZ2xlQnV0dG9uICYmIHRvZ2dsZUJ1dHRvbi5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSkge1xyXG4gICAgICAgIGlzRXhwYW5kZWQgPSB0b2dnbGVCdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJztcclxuICAgIH0gZWxzZSBpZiAoc2VjdGlvbi5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSkge1xyXG4gICAgICAgIGlzRXhwYW5kZWQgPSBzZWN0aW9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNsYXNzLWJhc2VkIGRldGVjdGlvblxyXG4gICAgICAgIGlzRXhwYW5kZWQgPSBzZWN0aW9uLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAhc2VjdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBTZWN0aW9uICR7Y29udHJvbE5hbWV9IGN1cnJlbnQgc3RhdGU6ICR7aXNFeHBhbmRlZCA/ICdleHBhbmRlZCcgOiAnY29sbGFwc2VkJ31gKTtcclxuICAgIFxyXG4gICAgY29uc3QgbmVlZHNUb2dnbGUgPSAoYWN0aW9uID09PSAnZXhwYW5kJyAmJiAhaXNFeHBhbmRlZCkgfHwgKGFjdGlvbiA9PT0gJ2NvbGxhcHNlJyAmJiBpc0V4cGFuZGVkKTtcclxuICAgIFxyXG4gICAgaWYgKG5lZWRzVG9nZ2xlKSB7XHJcbiAgICAgICAgLy8gQ2xpY2sgdGhlIHRvZ2dsZSBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSB0b2dnbGVCdXR0b24gfHwgc2VjdGlvbjtcclxuICAgICAgICBsb2dTdGVwKGBDbGlja2luZyB0b2dnbGUgZWxlbWVudDogJHtjbGlja1RhcmdldC50YWdOYW1lfSwgY2xhc3M9JHtjbGlja1RhcmdldC5jbGFzc05hbWV9YCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZSBmb3IgRDM2NSBSZWFjdCBjb21wb25lbnRzXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJ1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBEMzY1IGludGVybmFsIGNvbnRyb2wgQVBJXHJcbiAgICAgICAgaWYgKHR5cGVvZiAkZHluICE9PSAndW5kZWZpbmVkJyAmJiAkZHluLmNvbnRyb2xzKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRyeSB2YXJpb3VzIEQzNjUgbWV0aG9kc1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29udHJvbC5FeHBhbmRlZENoYW5nZWQgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRXhwYW5kZWRDaGFuZ2VkIHRha2VzIDAgZm9yIGV4cGFuZCwgMSBmb3IgY29sbGFwc2UgaW4gRDM2NVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLkV4cGFuZGVkQ2hhbmdlZChhY3Rpb24gPT09ICdjb2xsYXBzZScgPyAxIDogMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBFeHBhbmRlZENoYW5nZWQoJHthY3Rpb24gPT09ICdjb2xsYXBzZScgPyAxIDogMH0pIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5leHBhbmQgPT09ICdmdW5jdGlvbicgJiYgYWN0aW9uID09PSAnZXhwYW5kJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLmV4cGFuZCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgZXhwYW5kKCkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLmNvbGxhcHNlID09PSAnZnVuY3Rpb24nICYmIGFjdGlvbiA9PT0gJ2NvbGxhcHNlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLmNvbGxhcHNlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBjb2xsYXBzZSgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC50b2dnbGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC50b2dnbGUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIHRvZ2dsZSgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICBsb2dTdGVwKGBEMzY1IGNvbnRyb2wgbWV0aG9kIGZhaWxlZDogJHtlLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSBhbHJlYWR5ICR7YWN0aW9ufWVkLCBubyB0b2dnbGUgbmVlZGVkYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYFNlY3Rpb24gJHtjb250cm9sTmFtZX0gJHthY3Rpb259ZWRgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZVF1ZXJ5RmlsdGVyKHRhYmxlTmFtZSwgZmllbGROYW1lLCBjcml0ZXJpYVZhbHVlLCBvcHRpb25zID0ge30pIHtcclxuICAgIGxvZ1N0ZXAoYENvbmZpZ3VyaW5nIHF1ZXJ5IGZpbHRlcjogJHt0YWJsZU5hbWUgPyB0YWJsZU5hbWUgKyAnLicgOiAnJ30ke2ZpZWxkTmFtZX0gPSAke2NyaXRlcmlhVmFsdWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgb3Igb3BlbiB0aGUgcXVlcnkgZmlsdGVyIGRpYWxvZ1xyXG4gICAgbGV0IHF1ZXJ5Rm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNRdWVyeUZvcm1cIl0nKTtcclxuICAgIGlmICghcXVlcnlGb3JtKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIG9wZW4gdGhlIHF1ZXJ5IGRpYWxvZyB2aWEgUXVlcnkgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUXVlcnlTZWxlY3RCdXR0b25cIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiUXVlcnlcIl0nKTtcclxuICAgICAgICBpZiAoZmlsdGVyQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIGZpbHRlckJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTtcclxuICAgICAgICAgICAgcXVlcnlGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFxdWVyeUZvcm0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1F1ZXJ5IGZpbHRlciBkaWFsb2cgKFN5c1F1ZXJ5Rm9ybSkgbm90IGZvdW5kLiBNYWtlIHN1cmUgdGhlIGZpbHRlciBkaWFsb2cgaXMgb3Blbi4nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSGVscGVyIHRvIGZpbmQgZWxlbWVudCB3aXRoaW4gcXVlcnkgZm9ybVxyXG4gICAgY29uc3QgZmluZEluUXVlcnkgPSAobmFtZSkgPT4gcXVlcnlGb3JtLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7bmFtZX1cIl1gKTtcclxuICAgIFxyXG4gICAgLy8gSWYgc2F2ZWRRdWVyeSBpcyBzcGVjaWZpZWQsIHNlbGVjdCBpdCBmcm9tIHRoZSBkcm9wZG93biBmaXJzdFxyXG4gICAgaWYgKG9wdGlvbnMuc2F2ZWRRdWVyeSkge1xyXG4gICAgICAgIGNvbnN0IHNhdmVkUXVlcnlCb3ggPSBmaW5kSW5RdWVyeSgnU2F2ZWRRdWVyaWVzQm94Jyk7XHJcbiAgICAgICAgaWYgKHNhdmVkUXVlcnlCb3gpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBzYXZlZFF1ZXJ5Qm94LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBvcHRpb25zLnNhdmVkUXVlcnkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTWFrZSBzdXJlIHdlJ3JlIG9uIHRoZSBSYW5nZSB0YWJcclxuICAgIGNvbnN0IHJhbmdlVGFiID0gZmluZEluUXVlcnkoJ1JhbmdlVGFiJykgfHwgZmluZEluUXVlcnkoJ1JhbmdlVGFiX2hlYWRlcicpO1xyXG4gICAgaWYgKHJhbmdlVGFiICYmICFyYW5nZVRhYi5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpICYmIHJhbmdlVGFiLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpICE9PSAndHJ1ZScpIHtcclxuICAgICAgICByYW5nZVRhYi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENsaWNrIEFkZCB0byBhZGQgYSBuZXcgZmlsdGVyIHJvd1xyXG4gICAgY29uc3QgYWRkQnV0dG9uID0gZmluZEluUXVlcnkoJ1JhbmdlQWRkJyk7XHJcbiAgICBpZiAoYWRkQnV0dG9uKSB7XHJcbiAgICAgICAgYWRkQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGhlIGdyaWQgdXNlcyBSZWFjdExpc3QgLSBmaW5kIHRoZSBsYXN0IHJvdyAobmV3bHkgYWRkZWQpIGFuZCBmaWxsIGluIHZhbHVlc1xyXG4gICAgY29uc3QgZ3JpZCA9IGZpbmRJblF1ZXJ5KCdSYW5nZUdyaWQnKTtcclxuICAgIGlmICghZ3JpZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUmFuZ2UgZ3JpZCBub3QgZm91bmQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGFsbCByb3dzIGFuZCBmaW5kIHRoZSBsYXN0IG9uZSAobW9zdCByZWNlbnRseSBhZGRlZClcclxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicm93XCJdLCB0ciwgLmxpc3Qtcm93Jyk7XHJcbiAgICBjb25zdCBsYXN0Um93ID0gcm93c1tyb3dzLmxlbmd0aCAtIDFdIHx8IGdyaWQ7XHJcbiAgICBcclxuICAgIC8vIFNldCB0YWJsZSBuYW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAodGFibGVOYW1lKSB7XHJcbiAgICAgICAgY29uc3QgdGFibGVDZWxsID0gbGFzdFJvdy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVRhYmxlXCJdJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVGFibGVcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0VGFibGVDZWxsID0gdGFibGVDZWxsLmxlbmd0aCA/IHRhYmxlQ2VsbFt0YWJsZUNlbGwubGVuZ3RoIC0gMV0gOiB0YWJsZUNlbGw7XHJcbiAgICAgICAgaWYgKGxhc3RUYWJsZUNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0VGFibGVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdFRhYmxlQ2VsbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgdGFibGVOYW1lKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBmaWVsZCBuYW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoZmllbGROYW1lKSB7XHJcbiAgICAgICAgY29uc3QgZmllbGRDZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VGaWVsZFwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RGaWVsZENlbGwgPSBmaWVsZENlbGxzW2ZpZWxkQ2VsbHMubGVuZ3RoIC0gMV0gfHwgZ3JpZC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZUZpZWxkXCJdJyk7XHJcbiAgICAgICAgaWYgKGxhc3RGaWVsZENlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0RmllbGRDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdEZpZWxkQ2VsbDtcclxuICAgICAgICAgICAgLy8gQ2xpY2sgdG8gb3BlbiBkcm9wZG93bi9mb2N1c1xyXG4gICAgICAgICAgICBpbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGZpZWxkTmFtZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgY3JpdGVyaWEgdmFsdWUgaWYgcHJvdmlkZWRcclxuICAgIGlmIChjcml0ZXJpYVZhbHVlKSB7XHJcbiAgICAgICAgY29uc3QgdmFsdWVDZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VWYWx1ZVwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RWYWx1ZUNlbGwgPSB2YWx1ZUNlbGxzW3ZhbHVlQ2VsbHMubGVuZ3RoIC0gMV0gfHwgZ3JpZC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVZhbHVlXCJdJyk7XHJcbiAgICAgICAgaWYgKGxhc3RWYWx1ZUNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0VmFsdWVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdFZhbHVlQ2VsbDtcclxuICAgICAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBjcml0ZXJpYVZhbHVlKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoJ1F1ZXJ5IGZpbHRlciBjb25maWd1cmVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVCYXRjaFByb2Nlc3NpbmcoZW5hYmxlZCwgdGFza0Rlc2NyaXB0aW9uLCBiYXRjaEdyb3VwLCBvcHRpb25zID0ge30pIHtcclxuICAgIGxvZ1N0ZXAoYENvbmZpZ3VyaW5nIGJhdGNoIHByb2Nlc3Npbmc6ICR7ZW5hYmxlZCA/ICdlbmFibGVkJyA6ICdkaXNhYmxlZCd9YCk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIGRpYWxvZyB0byBiZSByZWFkeVxyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgYmF0Y2ggcHJvY2Vzc2luZyBjaGVja2JveCAtIGNvbnRyb2wgbmFtZSBpcyBGbGQxXzEgaW4gU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXHJcbiAgICBjb25zdCBiYXRjaFRvZ2dsZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cIl0gW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiRmxkMV8xXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoJ0ZsZDFfMScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZsZDFfMVwiXScpO1xyXG4gICAgXHJcbiAgICBpZiAoYmF0Y2hUb2dnbGUpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBhY3R1YWwgY2hlY2tib3ggaW5wdXQgb3IgdG9nZ2xlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IGNoZWNrYm94ID0gYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJy50b2dnbGUtYnV0dG9uJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gY2hlY2tib3g/LmNoZWNrZWQgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5jbGFzc0xpc3QuY29udGFpbnMoJ29uJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRTdGF0ZSAhPT0gZW5hYmxlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGNoZWNrYm94IHx8IGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgLnRvZ2dsZS1zd2l0Y2gsIGxhYmVsJykgfHwgYmF0Y2hUb2dnbGU7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKCdXYXJuaW5nOiBCYXRjaCBwcm9jZXNzaW5nIHRvZ2dsZSAoRmxkMV8xKSBub3QgZm91bmQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHRhc2sgZGVzY3JpcHRpb24gaWYgcHJvdmlkZWQgYW5kIGJhdGNoIGlzIGVuYWJsZWQgKEZsZDJfMSlcclxuICAgIGlmIChlbmFibGVkICYmIHRhc2tEZXNjcmlwdGlvbikge1xyXG4gICAgICAgIGF3YWl0IHNldElucHV0VmFsdWUoJ0ZsZDJfMScsIHRhc2tEZXNjcmlwdGlvbik7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGJhdGNoIGdyb3VwIGlmIHByb3ZpZGVkIGFuZCBiYXRjaCBpcyBlbmFibGVkIChGbGQzXzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBiYXRjaEdyb3VwKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkM18xJywgYmF0Y2hHcm91cCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IFByaXZhdGUgYW5kIENyaXRpY2FsIG9wdGlvbnMgaWYgcHJvdmlkZWQgKEZsZDRfMSBhbmQgRmxkNV8xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgb3B0aW9ucy5wcml2YXRlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBzZXRDaGVja2JveCgnRmxkNF8xJywgb3B0aW9ucy5wcml2YXRlKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLmNyaXRpY2FsSm9iICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBzZXRDaGVja2JveCgnRmxkNV8xJywgb3B0aW9ucy5jcml0aWNhbEpvYik7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IE1vbml0b3JpbmcgY2F0ZWdvcnkgaWYgc3BlY2lmaWVkIChGbGQ2XzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLm1vbml0b3JpbmdDYXRlZ29yeSkge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoJ0ZsZDZfMScsIG9wdGlvbnMubW9uaXRvcmluZ0NhdGVnb3J5KTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdCYXRjaCBwcm9jZXNzaW5nIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZVJlY3VycmVuY2Uoc3RlcCkge1xyXG4gICAgY29uc3QgeyBwYXR0ZXJuVW5pdCwgcGF0dGVybkNvdW50LCBlbmREYXRlT3B0aW9uLCBlbmRBZnRlckNvdW50LCBlbmRCeURhdGUsIHN0YXJ0RGF0ZSwgc3RhcnRUaW1lLCB0aW1lem9uZSB9ID0gc3RlcDtcclxuICAgIFxyXG4gICAgY29uc3QgcGF0dGVyblVuaXRzID0gWydtaW51dGVzJywgJ2hvdXJzJywgJ2RheXMnLCAnd2Vla3MnLCAnbW9udGhzJywgJ3llYXJzJ107XHJcbiAgICBsb2dTdGVwKGBDb25maWd1cmluZyByZWN1cnJlbmNlOiBldmVyeSAke3BhdHRlcm5Db3VudH0gJHtwYXR0ZXJuVW5pdHNbcGF0dGVyblVuaXQgfHwgMF19YCk7XHJcbiAgICBcclxuICAgIC8vIENsaWNrIFJlY3VycmVuY2UgYnV0dG9uIHRvIG9wZW4gZGlhbG9nIGlmIG5vdCBhbHJlYWR5IG9wZW5cclxuICAgIGxldCByZWN1cnJlbmNlRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICBpZiAoIXJlY3VycmVuY2VGb3JtKSB7XHJcbiAgICAgICAgLy8gTW51SXRtXzEgaXMgdGhlIFJlY3VycmVuY2UgYnV0dG9uIGluIFN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVxyXG4gICAgICAgIGNvbnN0IHJlY3VycmVuY2VCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1udUl0bV8xXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCgnTW51SXRtXzEnKTtcclxuICAgICAgICBpZiAocmVjdXJyZW5jZUJ1dHRvbikge1xyXG4gICAgICAgICAgICByZWN1cnJlbmNlQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgICAgICByZWN1cnJlbmNlRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXJlY3VycmVuY2VGb3JtKSB7XHJcbiAgICAgICAgbG9nU3RlcCgnV2FybmluZzogQ291bGQgbm90IG9wZW4gU3lzUmVjdXJyZW5jZSBkaWFsb2cnKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBmaW5kIGVsZW1lbnQgd2l0aGluIHJlY3VycmVuY2UgZm9ybVxyXG4gICAgY29uc3QgZmluZEluUmVjdXJyZW5jZSA9IChuYW1lKSA9PiByZWN1cnJlbmNlRm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke25hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIC8vIFNldCBzdGFydCBkYXRlIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoc3RhcnREYXRlKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnREYXRlSW5wdXQgPSBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydERhdGUnKT8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydERhdGUnKTtcclxuICAgICAgICBpZiAoc3RhcnREYXRlSW5wdXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShzdGFydERhdGVJbnB1dCwgc3RhcnREYXRlKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBzdGFydCB0aW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoc3RhcnRUaW1lKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRUaW1lSW5wdXQgPSBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydFRpbWUnKT8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydFRpbWUnKTtcclxuICAgICAgICBpZiAoc3RhcnRUaW1lSW5wdXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShzdGFydFRpbWVJbnB1dCwgc3RhcnRUaW1lKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCB0aW1lem9uZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHRpbWV6b25lKSB7XHJcbiAgICAgICAgY29uc3QgdGltZXpvbmVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnVGltZXpvbmUnKTtcclxuICAgICAgICBpZiAodGltZXpvbmVDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gdGltZXpvbmVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCB0aW1lem9uZSk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgcGF0dGVybiB1bml0IChyYWRpbyBidXR0b25zOiBNaW51dGVzPTAsIEhvdXJzPTEsIERheXM9MiwgV2Vla3M9MywgTW9udGhzPTQsIFllYXJzPTUpXHJcbiAgICBpZiAocGF0dGVyblVuaXQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGNvbnN0IHBhdHRlcm5Vbml0Q29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoJ1BhdHRlcm5Vbml0Jyk7XHJcbiAgICAgICAgaWYgKHBhdHRlcm5Vbml0Q29udHJvbCkge1xyXG4gICAgICAgICAgICAvLyBSYWRpbyBidXR0b25zIGFyZSB0eXBpY2FsbHkgcmVuZGVyZWQgYXMgYSBncm91cCB3aXRoIG11bHRpcGxlIG9wdGlvbnNcclxuICAgICAgICAgICAgY29uc3QgcmFkaW9JbnB1dHMgPSBwYXR0ZXJuVW5pdENvbnRyb2wucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInJhZGlvXCJdJyk7XHJcbiAgICAgICAgICAgIGlmIChyYWRpb0lucHV0cy5sZW5ndGggPiBwYXR0ZXJuVW5pdCkge1xyXG4gICAgICAgICAgICAgICAgcmFkaW9JbnB1dHNbcGF0dGVyblVuaXRdLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApOyAvLyBXYWl0IGZvciBVSSB0byB1cGRhdGUgd2l0aCBhcHByb3ByaWF0ZSBpbnRlcnZhbCBmaWVsZFxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IGNsaWNraW5nIHRoZSBudGggb3B0aW9uIGxhYmVsL2J1dHRvblxyXG4gICAgICAgICAgICAgICAgY29uc3QgcmFkaW9PcHRpb25zID0gcGF0dGVyblVuaXRDb250cm9sLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicmFkaW9cIl0sIGxhYmVsLCBidXR0b24nKTtcclxuICAgICAgICAgICAgICAgIGlmIChyYWRpb09wdGlvbnMubGVuZ3RoID4gcGF0dGVyblVuaXQpIHtcclxuICAgICAgICAgICAgICAgICAgICByYWRpb09wdGlvbnNbcGF0dGVyblVuaXRdLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGludGVydmFsIGNvdW50IGJhc2VkIG9uIHBhdHRlcm4gdW5pdFxyXG4gICAgLy8gVGhlIHZpc2libGUgaW5wdXQgZmllbGQgY2hhbmdlcyBiYXNlZCBvbiBzZWxlY3RlZCBwYXR0ZXJuIHVuaXRcclxuICAgIGlmIChwYXR0ZXJuQ291bnQpIHtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2xOYW1lcyA9IFsnTWludXRlSW50JywgJ0hvdXJJbnQnLCAnRGF5SW50JywgJ1dlZWtJbnQnLCAnTW9udGhJbnQnLCAnWWVhckludCddO1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbE5hbWUgPSBjb3VudENvbnRyb2xOYW1lc1twYXR0ZXJuVW5pdCB8fCAwXTtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKGNvdW50Q29udHJvbE5hbWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb3VudENvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBjb3VudENvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBjb3VudENvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIHBhdHRlcm5Db3VudC50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBlbmQgZGF0ZSBvcHRpb25zXHJcbiAgICBpZiAoZW5kRGF0ZU9wdGlvbiA9PT0gJ25vRW5kRGF0ZScpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIk5vIGVuZCBkYXRlXCIgZ3JvdXAgKEVuZERhdGUxKVxyXG4gICAgICAgIGNvbnN0IG5vRW5kRGF0ZUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTEnKTtcclxuICAgICAgICBpZiAobm9FbmREYXRlR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBub0VuZERhdGVHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBub0VuZERhdGVHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGVuZERhdGVPcHRpb24gPT09ICdlbmRBZnRlcicgJiYgZW5kQWZ0ZXJDb3VudCkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGFmdGVyXCIgZ3JvdXAgKEVuZERhdGUyKSBhbmQgc2V0IGNvdW50XHJcbiAgICAgICAgY29uc3QgZW5kQWZ0ZXJHcm91cCA9IGZpbmRJblJlY3VycmVuY2UoJ0VuZERhdGUyJyk7XHJcbiAgICAgICAgaWYgKGVuZEFmdGVyR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBlbmRBZnRlckdyb3VwLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXSwgW3JvbGU9XCJyYWRpb1wiXScpIHx8IGVuZEFmdGVyR3JvdXA7XHJcbiAgICAgICAgICAgIHJhZGlvLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFNldCB0aGUgY291bnQgKEVuZERhdGVJbnQpXHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZUludCcpO1xyXG4gICAgICAgIGlmIChjb3VudENvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBjb3VudENvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBjb3VudENvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGVuZEFmdGVyQ291bnQudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQnknICYmIGVuZEJ5RGF0ZSkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGJ5XCIgZ3JvdXAgKEVuZERhdGUzKSBhbmQgc2V0IGRhdGVcclxuICAgICAgICBjb25zdCBlbmRCeUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTMnKTtcclxuICAgICAgICBpZiAoZW5kQnlHcm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCByYWRpbyA9IGVuZEJ5R3JvdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdLCBbcm9sZT1cInJhZGlvXCJdJykgfHwgZW5kQnlHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gU2V0IHRoZSBlbmQgZGF0ZSAoRW5kRGF0ZURhdGUpXHJcbiAgICAgICAgY29uc3QgZGF0ZUNvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlRGF0ZScpO1xyXG4gICAgICAgIGlmIChkYXRlQ29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRhdGVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgZGF0ZUNvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGVuZEJ5RGF0ZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdSZWN1cnJlbmNlIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXRFbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgaWYgKCFpbnB1dEVsZW1lbnQpIHJldHVybjtcclxuICAgIFxyXG4gICAgLy8gRm9jdXMgdGhlIGlucHV0XHJcbiAgICBpbnB1dEVsZW1lbnQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlXHJcbiAgICBpbnB1dEVsZW1lbnQuc2VsZWN0Py4oKTtcclxuICAgIFxyXG4gICAgLy8gU2V0IHRoZSB2YWx1ZVxyXG4gICAgaW5wdXRFbGVtZW50LnZhbHVlID0gdmFsdWU7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXRFbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0RmlsdGVyTWV0aG9kKGZpbHRlckNvbnRhaW5lciwgbWV0aG9kKSB7XHJcbiAgICAvLyBGaW5kIHRoZSBmaWx0ZXIgb3BlcmF0b3IgZHJvcGRvd24gbmVhciB0aGUgZmlsdGVyIGlucHV0XHJcbiAgICAvLyBEMzY1IHVzZXMgdmFyaW91cyBwYXR0ZXJucyBmb3IgdGhlIG9wZXJhdG9yIGRyb3Bkb3duXHJcbiAgICBjb25zdCBvcGVyYXRvclBhdHRlcm5zID0gW1xyXG4gICAgICAgICdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyT3BlcmF0b3JcIl0nLFxyXG4gICAgICAgICdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiX09wZXJhdG9yXCJdJyxcclxuICAgICAgICAnLmZpbHRlci1vcGVyYXRvcicsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0nXHJcbiAgICBdO1xyXG4gICAgXHJcbiAgICBsZXQgb3BlcmF0b3JEcm9wZG93biA9IG51bGw7XHJcbiAgICBjb25zdCBzZWFyY2hDb250YWluZXIgPSBmaWx0ZXJDb250YWluZXI/LnBhcmVudEVsZW1lbnQgfHwgZG9jdW1lbnQ7XHJcbiAgICBcclxuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBvcGVyYXRvclBhdHRlcm5zKSB7XHJcbiAgICAgICAgb3BlcmF0b3JEcm9wZG93biA9IHNlYXJjaENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKHBhdHRlcm4pO1xyXG4gICAgICAgIGlmIChvcGVyYXRvckRyb3Bkb3duICYmIG9wZXJhdG9yRHJvcGRvd24ub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFvcGVyYXRvckRyb3Bkb3duKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNkEwIEZpbHRlciBvcGVyYXRvciBkcm9wZG93biBub3QgZm91bmQsIHVzaW5nIGRlZmF1bHQgbWV0aG9kYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDbGljayB0byBvcGVuIHRoZSBkcm9wZG93blxyXG4gICAgY29uc3QgZHJvcGRvd25CdXR0b24gPSBvcGVyYXRvckRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgW3JvbGU9XCJjb21ib2JveFwiXSwgLmR5bi1jb21ib0JveC1idXR0b24nKSB8fCBvcGVyYXRvckRyb3Bkb3duO1xyXG4gICAgZHJvcGRvd25CdXR0b24uY2xpY2soKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgYW5kIGNsaWNrIHRoZSBtYXRjaGluZyBvcHRpb25cclxuICAgIGNvbnN0IHNlYXJjaFRlcm1zID0gZ2V0RmlsdGVyTWV0aG9kU2VhcmNoVGVybXMobWV0aG9kKTtcclxuICAgIFxyXG4gICAgLy8gTG9vayBmb3Igb3B0aW9ucyBpbiBsaXN0Ym94L2Ryb3Bkb3duXHJcbiAgICBjb25zdCBvcHRpb25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJvcHRpb25cIl0sIFtyb2xlPVwibGlzdGl0ZW1cIl0sIC5keW4tbGlzdFZpZXctaXRlbScpO1xyXG4gICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBvcHQudGV4dENvbnRlbnQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBpZiAodGV4dEluY2x1ZGVzQW55KHRleHQsIHNlYXJjaFRlcm1zKSkge1xyXG4gICAgICAgICAgICBvcHQuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgU2V0IGZpbHRlciBtZXRob2Q6ICR7bWV0aG9kfWApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgc2VsZWN0IGVsZW1lbnRcclxuICAgIGNvbnN0IHNlbGVjdEVsID0gb3BlcmF0b3JEcm9wZG93bi5xdWVyeVNlbGVjdG9yKCdzZWxlY3QnKTtcclxuICAgIGlmIChzZWxlY3RFbCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgb3B0IG9mIHNlbGVjdEVsLm9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG9wdC50ZXh0Q29udGVudC50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dEluY2x1ZGVzQW55KHRleHQsIHNlYXJjaFRlcm1zKSkge1xyXG4gICAgICAgICAgICAgICAgc2VsZWN0RWwudmFsdWUgPSBvcHQudmFsdWU7XHJcbiAgICAgICAgICAgICAgICBzZWxlY3RFbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBTZXQgZmlsdGVyIG1ldGhvZDogJHttZXRob2R9YCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGAgIFx1MjZBMCBDb3VsZCBub3Qgc2V0IGZpbHRlciBtZXRob2QgXCIke21ldGhvZH1cIiwgdXNpbmcgZGVmYXVsdGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0UmFkaW9CdXR0b25WYWx1ZShlbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgbG9nU3RlcChgU2V0dGluZyByYWRpbyBidXR0b24gdmFsdWU6ICR7dmFsdWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgYWxsIHJhZGlvIG9wdGlvbnMgaW4gdGhpcyBncm91cFxyXG4gICAgY29uc3QgcmFkaW9JbnB1dHMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXScpO1xyXG4gICAgY29uc3QgcmFkaW9Sb2xlcyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyYWRpb1wiXScpO1xyXG4gICAgY29uc3Qgb3B0aW9ucyA9IHJhZGlvSW5wdXRzLmxlbmd0aCA+IDAgPyBBcnJheS5mcm9tKHJhZGlvSW5wdXRzKSA6IEFycmF5LmZyb20ocmFkaW9Sb2xlcyk7XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIGNsaWNrYWJsZSBsYWJlbHMvYnV0dG9ucyB0aGF0IGFjdCBhcyByYWRpbyBvcHRpb25zXHJcbiAgICAgICAgY29uc3QgbGFiZWxCdXR0b25zID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdsYWJlbCwgYnV0dG9uLCBbZGF0YS1keW4tcm9sZT1cIlJhZGlvQnV0dG9uXCJdJyk7XHJcbiAgICAgICAgb3B0aW9ucy5wdXNoKC4uLkFycmF5LmZyb20obGFiZWxCdXR0b25zKSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gcmFkaW8gb3B0aW9ucyBmb3VuZCBpbiBlbGVtZW50YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYEZvdW5kICR7b3B0aW9ucy5sZW5ndGh9IHJhZGlvIG9wdGlvbnNgKTtcclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIG1hdGNoIGJ5IGluZGV4IChpZiB2YWx1ZSBpcyBhIG51bWJlciBvciBudW1lcmljIHN0cmluZylcclxuICAgIGNvbnN0IG51bVZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKTtcclxuICAgIGlmICghaXNOYU4obnVtVmFsdWUpICYmIG51bVZhbHVlID49IDAgJiYgbnVtVmFsdWUgPCBvcHRpb25zLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldE9wdGlvbiA9IG9wdGlvbnNbbnVtVmFsdWVdO1xyXG4gICAgICAgIGxvZ1N0ZXAoYENsaWNraW5nIHJhZGlvIG9wdGlvbiBhdCBpbmRleCAke251bVZhbHVlfWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENsaWNrIHRoZSByYWRpbyBvcHRpb24gb3IgaXRzIGFzc29jaWF0ZWQgbGFiZWxcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IHRhcmdldE9wdGlvbi50YWdOYW1lID09PSAnSU5QVVQnIFxyXG4gICAgICAgICAgICA/ICh0YXJnZXRPcHRpb24uY2xvc2VzdCgnbGFiZWwnKSB8fCB0YXJnZXRPcHRpb24ucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcignbGFiZWwnKSB8fCB0YXJnZXRPcHRpb24pXHJcbiAgICAgICAgICAgIDogdGFyZ2V0T3B0aW9uO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc3BhdGNoIGZ1bGwgY2xpY2sgc2VxdWVuY2VcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcnVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFsc28gdHJ5IGNsaWNraW5nIHRoZSBpbnB1dCBkaXJlY3RseVxyXG4gICAgICAgIGlmICh0YXJnZXRPcHRpb24udGFnTmFtZSA9PT0gJ0lOUFVUJykge1xyXG4gICAgICAgICAgICB0YXJnZXRPcHRpb24uY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHRhcmdldE9wdGlvbi5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSB0byBtYXRjaCBieSBsYWJlbCB0ZXh0XHJcbiAgICBjb25zdCBzZWFyY2hWYWx1ZSA9IFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKTtcclxuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcclxuICAgICAgICBjb25zdCBsYWJlbCA9IG9wdGlvbi5jbG9zZXN0KCdsYWJlbCcpIHx8IG9wdGlvbi5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpO1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKS50b0xvd2VyQ2FzZSgpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKT8udG9Mb3dlckNhc2UoKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbi50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkgfHwgJyc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRleHQuaW5jbHVkZXMoc2VhcmNoVmFsdWUpIHx8IHNlYXJjaFZhbHVlLmluY2x1ZGVzKHRleHQpKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYENsaWNraW5nIHJhZGlvIG9wdGlvbiB3aXRoIHRleHQ6ICR7dGV4dH1gKTtcclxuICAgICAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSBsYWJlbCB8fCBvcHRpb247XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob3B0aW9uLnRhZ05hbWUgPT09ICdJTlBVVCcpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBSYWRpbyBvcHRpb24gbm90IGZvdW5kIGZvciB2YWx1ZTogJHt2YWx1ZX1gKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBTZWdtZW50ZWRFbnRyeScpO1xyXG5cclxuICAgIC8vIEZpbmQgdGhlIGxvb2t1cCBidXR0b25cclxuICAgIGNvbnN0IGxvb2t1cEJ1dHRvbiA9IGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGxvb2t1cCBidXR0b24sIHRyeSBrZXlib2FyZCB0byBvcGVuIHRoZSBmbHlvdXQgZmlyc3RcclxuICAgIGlmICghbG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENsaWNrIHRoZSBsb29rdXAgYnV0dG9uIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBpZiAobG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgbG9va3VwQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODAwKTsgLy8gV2FpdCBmb3IgbG9va3VwIHRvIGxvYWRcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5kIHRoZSBsb29rdXAgcG9wdXAvZmx5b3V0XHJcbiAgICBjb25zdCBsb29rdXBQb3B1cCA9IGF3YWl0IHdhaXRGb3JMb29rdXBQb3B1cCgpO1xyXG4gICAgaWYgKCFsb29rdXBQb3B1cCkge1xyXG4gICAgICAgIGlmICghd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uc3VwcHJlc3NMb29rdXBXYXJuaW5ncykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ0xvb2t1cCBwb3B1cCBub3QgZm91bmQsIHRyeWluZyBkaXJlY3QgaW5wdXQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBhIGRvY2tlZCBsb29rdXAgZmx5b3V0IGV4aXN0cyAoc2VnbWVudGVkIGVudHJ5KSwgdHlwZSBpbnRvIGl0cyBmaWx0ZXIgaW5wdXRcclxuICAgIGNvbnN0IGRvY2sgPSBhd2FpdCB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQoZWxlbWVudCwgMTUwMCk7XHJcbiAgICBpZiAoZG9jaykge1xyXG4gICAgICAgIGNvbnN0IGRvY2tJbnB1dCA9IGZpbmRMb29rdXBGaWx0ZXJJbnB1dChkb2NrKTtcclxuICAgICAgICBpZiAoZG9ja0lucHV0KSB7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAgICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoZG9ja0lucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFR5cGUgdmFsdWUgaW4gdGhlIHNlYXJjaC9maWx0ZXIgZmllbGQgb2YgdGhlIGxvb2t1cFxyXG4gICAgY29uc3QgbG9va3VwSW5wdXQgPSBsb29rdXBQb3B1cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwidGV4dFwiXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmIChsb29rdXBJbnB1dCkge1xyXG4gICAgICAgIGxvb2t1cElucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGxvb2t1cElucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTsgLy8gV2FpdCBmb3Igc2VydmVyIGZpbHRlclxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5kIGFuZCBjbGljayB0aGUgbWF0Y2hpbmcgcm93XHJcbiAgICBjb25zdCByb3dzID0gYXdhaXQgd2FpdEZvckxvb2t1cFJvd3MobG9va3VwUG9wdXAsIGVsZW1lbnQsIDUwMDApO1xyXG4gICAgbGV0IGZvdW5kTWF0Y2ggPSBmYWxzZTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSByb3cudGV4dENvbnRlbnQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcclxuICAgICAgICBpZiAodGV4dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKSkpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImdyaWRjZWxsXCJdLCB0ZCcpO1xyXG4gICAgICAgICAgICAoY2VsbCB8fCByb3cpLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGZvdW5kTWF0Y2ggPSB0cnVlO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWZvdW5kTWF0Y2gpIHtcclxuICAgICAgICBjb25zdCBzYW1wbGUgPSBBcnJheS5mcm9tKHJvd3MpLnNsaWNlKDAsIDgpLm1hcChyID0+IHIudGV4dENvbnRlbnQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKSk7XHJcbiAgICAgICAgaWYgKCF3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzPy5zdXBwcmVzc0xvb2t1cFdhcm5pbmdzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignTm8gbWF0Y2hpbmcgbG9va3VwIHZhbHVlIGZvdW5kLCBjbG9zaW5nIHBvcHVwJywgeyB2YWx1ZSwgc2FtcGxlIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBUcnkgdG8gY2xvc2UgdGhlIHBvcHVwXHJcbiAgICAgICAgY29uc3QgY2xvc2VCdG4gPSBsb29rdXBQb3B1cC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJDbG9zZVwiXSwgLmNsb3NlLWJ1dHRvbicpO1xyXG4gICAgICAgIGlmIChjbG9zZUJ0bikgY2xvc2VCdG4uY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBkaXJlY3QgdHlwaW5nXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDb21ib0JveFZhbHVlKGVsZW1lbnQsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXSwgc2VsZWN0Jyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBDb21ib0JveCcpO1xyXG5cclxuICAgIC8vIElmIGl0J3MgYSBuYXRpdmUgc2VsZWN0LCB1c2Ugb3B0aW9uIHNlbGVjdGlvblxyXG4gICAgaWYgKGlucHV0LnRhZ05hbWUgPT09ICdTRUxFQ1QnKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmZyb20oaW5wdXQub3B0aW9ucyk7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gb3B0aW9ucy5maW5kKG9wdCA9PiBvcHQudGV4dC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuZmluZChvcHQgPT4gb3B0LnRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpKTtcclxuICAgICAgICBpZiAoIXRhcmdldCkgdGhyb3cgbmV3IEVycm9yKGBPcHRpb24gbm90IGZvdW5kOiAke3ZhbHVlfWApO1xyXG4gICAgICAgIGlucHV0LnZhbHVlID0gdGFyZ2V0LnZhbHVlO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBPcGVuIHRoZSBkcm9wZG93biAoYnV0dG9uIHByZWZlcnJlZClcclxuICAgIGNvbnN0IGNvbWJvQnV0dG9uID0gZmluZENvbWJvQm94QnV0dG9uKGVsZW1lbnQpO1xyXG4gICAgaWYgKGNvbWJvQnV0dG9uKSB7XHJcbiAgICAgICAgY29tYm9CdXR0b24uY2xpY2soKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcblxyXG4gICAgLy8gVHJ5IHR5cGluZyB0byBmaWx0ZXIgd2hlbiBhbGxvd2VkICh1c2Ugc2VsZWN0ZWQgaW5wdXQgbWV0aG9kKVxyXG4gICAgaWYgKCFpbnB1dC5yZWFkT25seSAmJiAhaW5wdXQuZGlzYWJsZWQpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBsaXN0Ym94IG5lYXIgdGhlIGZpZWxkIG9yIGxpbmtlZCB2aWEgYXJpYS1jb250cm9sc1xyXG4gICAgY29uc3QgbGlzdGJveCA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsaXN0Ym94KSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IHByZXNzIEVudGVyIHRvIGNvbW1pdCB0eXBlZCB2YWx1ZVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgb3B0aW9ucyA9IGNvbGxlY3RDb21ib09wdGlvbnMobGlzdGJveCk7XHJcbiAgICBjb25zdCBzZWFyY2ggPSBub3JtYWxpemVUZXh0KHZhbHVlKTtcclxuICAgIGxldCBtYXRjaGVkID0gZmFsc2U7XHJcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQob3B0aW9uLnRleHRDb250ZW50KTtcclxuICAgICAgICBpZiAodGV4dCA9PT0gc2VhcmNoIHx8IHRleHQuaW5jbHVkZXMoc2VhcmNoKSkge1xyXG4gICAgICAgICAgICAvLyBUcnkgdG8gbWFyayBzZWxlY3Rpb24gZm9yIEFSSUEtYmFzZWQgY29tYm9ib3hlc1xyXG4gICAgICAgICAgICBvcHRpb25zLmZvckVhY2gob3B0ID0+IG9wdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAnZmFsc2UnKSk7XHJcbiAgICAgICAgICAgIG9wdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAndHJ1ZScpO1xyXG4gICAgICAgICAgICBpZiAoIW9wdGlvbi5pZCkge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9uLmlkID0gYGQzNjVvcHRfJHtEYXRlLm5vdygpfV8ke01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwKX1gO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jywgb3B0aW9uLmlkKTtcclxuXHJcbiAgICAgICAgICAgIG9wdGlvbi5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcgfSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvblRleHQgPSBvcHRpb24udGV4dENvbnRlbnQudHJpbSgpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xpY2sgdGhlIG9wdGlvbiB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgZGlzcGF0Y2hDbGlja1NlcXVlbmNlKG9wdGlvbik7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhcHBsaWVkID0gYXdhaXQgd2FpdEZvcklucHV0VmFsdWUoaW5wdXQsIG9wdGlvblRleHQsIDgwMCk7XHJcbiAgICAgICAgICAgIGlmICghYXBwbGllZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gU29tZSBEMzY1IGNvbWJvcyBjb21taXQgb24ga2V5IHNlbGVjdGlvbiByYXRoZXIgdGhhbiBjbGlja1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gRm9yY2UgaW5wdXQgdmFsdWUgdXBkYXRlIGZvciBEMzY1IGNvbWJvYm94ZXNcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNDAwKTtcclxuICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZVRleHQoaW5wdXQudmFsdWUpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvblRleHQpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21taXRDb21ib1ZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIGlucHV0LnZhbHVlLCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wdGlvbiBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveChjb250cm9sTmFtZSwgY2hlY2tlZCkge1xyXG4gICAgY29uc3QgY29udGFpbmVyID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIGlmICghY29udGFpbmVyKSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogQ2hlY2tib3ggJHtjb250cm9sTmFtZX0gbm90IGZvdW5kYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBjaGVja2JveCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImNoZWNrYm94XCJdJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGNoZWNrYm94Py5jaGVja2VkIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ29uJyk7XHJcbiAgICBcclxuICAgIGlmIChjdXJyZW50U3RhdGUgIT09IGNoZWNrZWQpIHtcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGNoZWNrYm94IHx8IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdsYWJlbCwgYnV0dG9uJykgfHwgY29udGFpbmVyO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICB9XHJcbn1cclxuIiwgImltcG9ydCBEMzY1SW5zcGVjdG9yIGZyb20gJy4vaW5zcGVjdG9yL0QzNjVJbnNwZWN0b3IuanMnO1xuaW1wb3J0IHsgbG9nU3RlcCwgc2VuZExvZyB9IGZyb20gJy4vdXRpbHMvbG9nZ2luZy5qcyc7XG5pbXBvcnQgeyBzbGVlcCB9IGZyb20gJy4vdXRpbHMvYXN5bmMuanMnO1xuaW1wb3J0IHsgY29lcmNlQm9vbGVhbiwgbm9ybWFsaXplVGV4dCB9IGZyb20gJy4vdXRpbHMvdGV4dC5qcyc7XG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuL3J1bnRpbWUvZXJyb3JzLmpzJztcbmltcG9ydCB7IGdldFN0ZXBFcnJvckNvbmZpZywgZmluZExvb3BQYWlycywgZmluZElmUGFpcnMgfSBmcm9tICcuL3J1bnRpbWUvZW5naW5lLXV0aWxzLmpzJztcbmltcG9ydCB7IGV2YWx1YXRlQ29uZGl0aW9uIH0gZnJvbSAnLi9ydW50aW1lL2NvbmRpdGlvbnMuanMnO1xuaW1wb3J0IHsgY2xpY2tFbGVtZW50LCBhcHBseUdyaWRGaWx0ZXIsIHdhaXRVbnRpbENvbmRpdGlvbiwgc2V0SW5wdXRWYWx1ZSwgc2V0R3JpZENlbGxWYWx1ZSwgc2V0TG9va3VwU2VsZWN0VmFsdWUsIHNldENoZWNrYm94VmFsdWUsIG5hdmlnYXRlVG9Gb3JtLCBhY3RpdmF0ZVRhYiwgYWN0aXZhdGVBY3Rpb25QYW5lVGFiLCBleHBhbmRPckNvbGxhcHNlU2VjdGlvbiwgY29uZmlndXJlUXVlcnlGaWx0ZXIsIGNvbmZpZ3VyZUJhdGNoUHJvY2Vzc2luZywgY2xvc2VEaWFsb2csIGNvbmZpZ3VyZVJlY3VycmVuY2UgfSBmcm9tICcuL3N0ZXBzL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsIGlzRWxlbWVudFZpc2libGUsIGlzRDM2NUxvYWRpbmcgfSBmcm9tICcuL3V0aWxzL2RvbS5qcyc7XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0SW5qZWN0ZWQoeyB3aW5kb3dPYmogPSBnbG9iYWxUaGlzLndpbmRvdywgZG9jdW1lbnRPYmogPSBnbG9iYWxUaGlzLmRvY3VtZW50LCBpbnNwZWN0b3JGYWN0b3J5ID0gKCkgPT4gbmV3IEQzNjVJbnNwZWN0b3IoKSB9ID0ge30pIHtcbiAgICBpZiAoIXdpbmRvd09iaiB8fCAhZG9jdW1lbnRPYmopIHtcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ21pc3Npbmctd2luZG93LW9yLWRvY3VtZW50JyB9O1xuICAgIH1cbiAgICBjb25zdCB3aW5kb3cgPSB3aW5kb3dPYmo7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBkb2N1bWVudE9iajtcbiAgICBjb25zdCBuYXZpZ2F0b3IgPSB3aW5kb3dPYmoubmF2aWdhdG9yIHx8IGdsb2JhbFRoaXMubmF2aWdhdG9yO1xuXG4gICAgd2luZG93LkQzNjVJbnNwZWN0b3IgPSBEMzY1SW5zcGVjdG9yO1xuXG4gICAgLy8gPT09PT09IEluaXRpYWxpemUgYW5kIExpc3RlbiBmb3IgTWVzc2FnZXMgPT09PT09XG5cbiAgICAvLyBQcmV2ZW50IGR1cGxpY2F0ZSBpbml0aWFsaXphdGlvblxuICAgIGlmICh3aW5kb3cuZDM2NUluamVjdGVkU2NyaXB0TG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdEMzY1IGluamVjdGVkIHNjcmlwdCBhbHJlYWR5IGxvYWRlZCwgc2tpcHBpbmcuLi4nKTtcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ2FscmVhZHktbG9hZGVkJyB9O1xuICAgIH1cblxuICAgIHdpbmRvdy5kMzY1SW5qZWN0ZWRTY3JpcHRMb2FkZWQgPSB0cnVlO1xuXG4gICAgLy8gQ3JlYXRlIGluc3BlY3RvciBpbnN0YW5jZVxuICAgIGNvbnN0IGluc3BlY3RvciA9IGluc3BlY3RvckZhY3RvcnkoKTtcblxuICAgIC8vID09PT09PSBXb3JrZmxvdyBFeGVjdXRpb24gRW5naW5lID09PT09PVxuICAgIGxldCBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IHt9O1xuICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncztcbiAgICBsZXQgY3VycmVudFdvcmtmbG93ID0gbnVsbDtcbiAgICBsZXQgZXhlY3V0aW9uQ29udHJvbCA9IHtcbiAgICAgICAgaXNQYXVzZWQ6IGZhbHNlLFxuICAgICAgICBpc1N0b3BwZWQ6IGZhbHNlLFxuICAgICAgICBjdXJyZW50U3RlcEluZGV4OiAwLFxuICAgICAgICBjdXJyZW50Um93SW5kZXg6IDAsXG4gICAgICAgIHRvdGFsUm93czogMCxcbiAgICAgICAgY3VycmVudERhdGFSb3c6IG51bGwsXG4gICAgICAgIHBlbmRpbmdGbG93U2lnbmFsOiAnbm9uZScsXG4gICAgICAgIHBlbmRpbmdJbnRlcnJ1cHRpb25EZWNpc2lvbjogbnVsbCxcbiAgICAgICAgcnVuT3B0aW9uczoge1xuICAgICAgICAgICAgc2tpcFJvd3M6IDAsXG4gICAgICAgICAgICBsaW1pdFJvd3M6IDAsXG4gICAgICAgICAgICBkcnlSdW46IGZhbHNlLFxuICAgICAgICAgICAgbGVhcm5pbmdNb2RlOiBmYWxzZSxcbiAgICAgICAgICAgIHJ1blVudGlsSW50ZXJjZXB0aW9uOiBmYWxzZVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIFNpbmdsZSB1bmlmaWVkIG1lc3NhZ2UgbGlzdGVuZXJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoZXZlbnQuc291cmNlICE9PSB3aW5kb3cpIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIC8vIERpc2NvdmVyeSByZXF1ZXN0c1xuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9ESVNDT1ZFUl9FTEVNRU5UUycpIHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUZvcm1Pbmx5ID0gZXZlbnQuZGF0YS5hY3RpdmVGb3JtT25seSB8fCBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gaW5zcGVjdG9yLmRpc2NvdmVyRWxlbWVudHMoYWN0aXZlRm9ybU9ubHkpO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRm9ybSA9IGluc3BlY3Rvci5nZXRBY3RpdmVGb3JtTmFtZSgpO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9FTEVNRU5UU19ESVNDT1ZFUkVEJyxcbiAgICAgICAgICAgICAgICBlbGVtZW50czogZWxlbWVudHMubWFwKGVsID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIC4uLmVsLFxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB1bmRlZmluZWQgLy8gUmVtb3ZlIERPTSByZWZlcmVuY2UgZm9yIHNlcmlhbGl6YXRpb25cbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgYWN0aXZlRm9ybTogYWN0aXZlRm9ybVxuICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUQVJUX1BJQ0tFUicpIHtcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdGFydEVsZW1lbnRQaWNrZXIoKGVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBBZGQgZm9ybSBuYW1lIHRvIHBpY2tlZCBlbGVtZW50XG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBpbnNwZWN0b3IuZ2V0RWxlbWVudEZvcm1OYW1lKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7ZWxlbWVudC5jb250cm9sTmFtZX1cIl1gKSk7XG4gICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfRUxFTUVOVF9QSUNLRUQnLFxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB7IC4uLmVsZW1lbnQsIGZvcm1OYW1lIH1cbiAgICAgICAgICAgICAgICB9LCAnKicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9TVE9QX1BJQ0tFUicpIHtcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdG9wRWxlbWVudFBpY2tlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWRtaW4gaW5zcGVjdGlvbiB0b29scyAtIHJ1biBkaXNjb3ZlcnkgZnVuY3Rpb25zIGFuZCByZXR1cm4gcmVzdWx0c1xuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9BRE1JTl9JTlNQRUNUJykge1xuICAgICAgICAgICAgY29uc3QgaW5zcGVjdGlvblR5cGUgPSBldmVudC5kYXRhLmluc3BlY3Rpb25UeXBlO1xuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBldmVudC5kYXRhLmZvcm1OYW1lO1xuICAgICAgICAgICAgbGV0IHJlc3VsdDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IHJ1bkFkbWluSW5zcGVjdGlvbihpbnNwZWN0b3IsIGluc3BlY3Rpb25UeXBlLCBmb3JtTmFtZSwgZG9jdW1lbnQsIHdpbmRvdyk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0geyBzdWNjZXNzOiB0cnVlLCBpbnNwZWN0aW9uVHlwZSwgZGF0YSB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHsgc3VjY2VzczogZmFsc2UsIGluc3BlY3Rpb25UeXBlLCBlcnJvcjogZS5tZXNzYWdlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9BRE1JTl9JTlNQRUNUSU9OX1JFU1VMVCcsIHJlc3VsdCB9LCAnKicpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfRVhFQ1VURV9XT1JLRkxPVycpIHtcbiAgICAgICAgICAgIGV4ZWN1dGVXb3JrZmxvdyhldmVudC5kYXRhLndvcmtmbG93LCBldmVudC5kYXRhLmRhdGEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfTkFWX0JVVFRPTlNfVVBEQVRFJykge1xuICAgICAgICAgICAgdXBkYXRlTmF2QnV0dG9ucyhldmVudC5kYXRhLnBheWxvYWQpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBFeGVjdXRpb24gY29udHJvbHNcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfUEFVU0VfV09SS0ZMT1cnKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9SRVNVTUVfV09SS0ZMT1cnKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RPUF9XT1JLRkxPVycpIHtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9BUFBMWV9JTlRFUlJVUFRJT05fREVDSVNJT04nKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLnBlbmRpbmdJbnRlcnJ1cHRpb25EZWNpc2lvbiA9IGV2ZW50LmRhdGEucGF5bG9hZCB8fCBudWxsO1xuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBsZXQgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gbnVsbDtcbiAgICBsZXQgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBudWxsO1xuICAgIGxldCBuYXZCdXR0b25zT3V0c2lkZUNsaWNrSGFuZGxlciA9IG51bGw7XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVOYXZCdXR0b25zKHBheWxvYWQpIHtcbiAgICAgICAgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gcGF5bG9hZCB8fCBudWxsO1xuICAgICAgICByZW5kZXJOYXZCdXR0b25zKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyTmF2QnV0dG9ucygpIHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IHBlbmRpbmdOYXZCdXR0b25zUGF5bG9hZDtcbiAgICAgICAgaWYgKCFwYXlsb2FkKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgbmF2R3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmF2aWdhdGlvbk1haW5BY3Rpb25Hcm91cCcpO1xuICAgICAgICBpZiAoIW5hdkdyb3VwKSB7XG4gICAgICAgICAgICBpZiAoIW5hdkJ1dHRvbnNSZXRyeVRpbWVyKSB7XG4gICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJOYXZCdXR0b25zKCk7XG4gICAgICAgICAgICAgICAgfSwgMTAwMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleGlzdGluZ0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkMzY1LW5hdi1idXR0b25zLWNvbnRhaW5lcicpO1xuICAgICAgICBpZiAoZXhpc3RpbmdDb250YWluZXIpIHtcbiAgICAgICAgICAgIGV4aXN0aW5nQ29udGFpbmVyLnJlbW92ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IEFycmF5LmlzQXJyYXkocGF5bG9hZC5idXR0b25zKSA/IHBheWxvYWQuYnV0dG9ucyA6IFtdO1xuICAgICAgICBpZiAoIWJ1dHRvbnMubGVuZ3RoKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgY3VycmVudE1lbnVJdGVtID0gKHBheWxvYWQubWVudUl0ZW0gfHwgJycpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgY29uc3QgdmlzaWJsZUJ1dHRvbnMgPSBidXR0b25zLmZpbHRlcigoYnV0dG9uKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtZW51SXRlbXMgPSBBcnJheS5pc0FycmF5KGJ1dHRvbi5tZW51SXRlbXMpID8gYnV0dG9uLm1lbnVJdGVtcyA6IFtdO1xuICAgICAgICAgICAgaWYgKCFtZW51SXRlbXMubGVuZ3RoKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGlmICghY3VycmVudE1lbnVJdGVtKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gbWVudUl0ZW1zLnNvbWUoKGl0ZW0pID0+IChpdGVtIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSBjdXJyZW50TWVudUl0ZW0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIXZpc2libGVCdXR0b25zLmxlbmd0aCkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBjb250YWluZXIuaWQgPSAnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgY29udGFpbmVyLnN0eWxlLmdhcCA9ICc2cHgnO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgICAgICBjb250YWluZXIuc3R5bGUubWFyZ2luUmlnaHQgPSAnNnB4JztcblxuICAgICAgICBjb25zdCBydW5CdXR0b25Xb3JrZmxvdyA9IGFzeW5jIChidXR0b25Db25maWcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtmbG93ID0gYnV0dG9uQ29uZmlnLndvcmtmbG93O1xuICAgICAgICAgICAgaWYgKCF3b3JrZmxvdykge1xuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFdvcmtmbG93IG5vdCBmb3VuZCBmb3IgbmF2IGJ1dHRvbjogJHtidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcuaWR9YCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHdvcmtmbG93LmRhdGFTb3VyY2VzPy5wcmltYXJ5Py5kYXRhIHx8IHdvcmtmbG93LmRhdGFTb3VyY2U/LmRhdGEgfHwgW107XG4gICAgICAgICAgICBleGVjdXRlV29ya2Zsb3cod29ya2Zsb3csIGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGNyZWF0ZVN0eWxlZEJ1dHRvbiA9IChsYWJlbCwgdGl0bGUgPSAnJykgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLXNlYXJjaCc7XG4gICAgICAgICAgICBidXR0b25FbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgICAgICAgICAgYnV0dG9uRWwudGl0bGUgPSB0aXRsZTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmhlaWdodCA9ICcyNHB4JztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLnBhZGRpbmcgPSAnMCA4cHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzRweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4zNSknO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMTIpJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmNvbG9yID0gJyNmZmZmZmYnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5saW5lSGVpZ2h0ID0gJzIycHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUud2hpdGVTcGFjZSA9ICdub3dyYXAnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtZmxleCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdjZW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm94U2hhZG93ID0gJ2luc2V0IDAgMCAwIDFweCByZ2JhKDI1NSwyNTUsMjU1LDAuMDgpJztcbiAgICAgICAgICAgIHJldHVybiBidXR0b25FbDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjbG9zZUFsbEdyb3VwTWVudXMgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudV0nKS5mb3JFYWNoKChtZW51KSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc3RhbmRhbG9uZUJ1dHRvbnMgPSBbXTtcbiAgICAgICAgY29uc3QgZ3JvdXBlZEJ1dHRvbnMgPSBuZXcgTWFwKCk7XG5cbiAgICAgICAgdmlzaWJsZUJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBncm91cE5hbWUgPSAoYnV0dG9uQ29uZmlnLmdyb3VwIHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoIWdyb3VwTmFtZSkge1xuICAgICAgICAgICAgICAgIHN0YW5kYWxvbmVCdXR0b25zLnB1c2goYnV0dG9uQ29uZmlnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWdyb3VwZWRCdXR0b25zLmhhcyhncm91cE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuc2V0KGdyb3VwTmFtZSwgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuZ2V0KGdyb3VwTmFtZSkucHVzaChidXR0b25Db25maWcpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdGFuZGFsb25lQnV0dG9ucy5mb3JFYWNoKChidXR0b25Db25maWcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbldyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGJ1dHRvbldyYXBwZXIuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItY29tcGFueSBuYXZpZ2F0aW9uQmFyLXBpbm5lZEVsZW1lbnQnO1xuXG4gICAgICAgICAgICBjb25zdCBidXR0b25FbCA9IGNyZWF0ZVN0eWxlZEJ1dHRvbihidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdycsIGJ1dHRvbkNvbmZpZy5uYW1lIHx8ICcnKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1idXR0b24taWQnLCBidXR0b25Db25maWcuaWQgfHwgJycpO1xuICAgICAgICAgICAgYnV0dG9uRWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpKTtcblxuICAgICAgICAgICAgYnV0dG9uV3JhcHBlci5hcHBlbmRDaGlsZChidXR0b25FbCk7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoYnV0dG9uV3JhcHBlcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEFycmF5LmZyb20oZ3JvdXBlZEJ1dHRvbnMuZW50cmllcygpKVxuICAgICAgICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpXG4gICAgICAgICAgICAuZm9yRWFjaCgoW2dyb3VwTmFtZSwgZ3JvdXBJdGVtc10pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cFdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICBncm91cFdyYXBwZXIuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItY29tcGFueSBuYXZpZ2F0aW9uQmFyLXBpbm5lZEVsZW1lbnQnO1xuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEJ1dHRvbiA9IGNyZWF0ZVN0eWxlZEJ1dHRvbihgJHtncm91cE5hbWV9IFxcdTI1QkVgLCBncm91cE5hbWUpO1xuICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1ncm91cCcsIGdyb3VwTmFtZSk7XG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYm9yZGVyQ29sb3IgPSAncmdiYSgyNTUsMjU1LDI1NSwwLjU1KSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMiknO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBNZW51ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1ncm91cC1tZW51JywgZ3JvdXBOYW1lKTtcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS50b3AgPSAnMjhweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmxlZnQgPSAnMCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLm1pbldpZHRoID0gJzIzMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUubWF4V2lkdGggPSAnMzIwcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5tYXhIZWlnaHQgPSAnMzIwcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5vdmVyZmxvd1kgPSAnYXV0byc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJhY2tncm91bmQgPSAnI2ZjZmRmZic7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgcmdiYSgzMCw0MSw1OSwwLjE2KSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJvcmRlclJhZGl1cyA9ICcxMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuYm94U2hhZG93ID0gJzAgMTRweCAyOHB4IHJnYmEoMCwwLDAsMC4yOCknO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5wYWRkaW5nID0gJzhweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLnpJbmRleCA9ICcyMTQ3NDgzMDAwJztcblxuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwSGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIudGV4dENvbnRlbnQgPSBncm91cE5hbWU7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuZm9udFNpemUgPSAnMTFweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuZm9udFdlaWdodCA9ICc3MDAnO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmNvbG9yID0gJyM0NzU1NjknO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLm1hcmdpbiA9ICcwIDJweCA2cHggMnB4JztcbiAgICAgICAgICAgICAgICBncm91cEhlYWRlci5zdHlsZS5wYWRkaW5nQm90dG9tID0gJzZweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCAjZTJlOGYwJztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuYXBwZW5kQ2hpbGQoZ3JvdXBIZWFkZXIpO1xuXG4gICAgICAgICAgICAgICAgZ3JvdXBJdGVtc1xuICAgICAgICAgICAgICAgICAgICAuc2xpY2UoKVxuICAgICAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gKGEubmFtZSB8fCAnJykubG9jYWxlQ29tcGFyZShiLm5hbWUgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICAuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVtQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24udGV4dENvbnRlbnQgPSBidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnRpdGxlID0gYnV0dG9uQ29uZmlnLm5hbWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudGV4dEFsaWduID0gJ2xlZnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5ib3JkZXIgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jb2xvciA9ICcjMWYyOTM3JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYm9yZGVyUmFkaXVzID0gJzRweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLnBhZGRpbmcgPSAnOHB4IDlweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmZvbnRTaXplID0gJzEycHgnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmxpbmVIZWlnaHQgPSAnMS4zJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUubWFyZ2luQm90dG9tID0gJzNweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudHJhbnNpdGlvbiA9ICdiYWNrZ3JvdW5kIC4xNXMgZWFzZSwgY29sb3IgLjE1cyBlYXNlJztcblxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICcjZThlZGZmJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZTNhOGEnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZjI5MzcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbG9zZUFsbEdyb3VwTWVudXMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwTWVudS5hcHBlbmRDaGlsZChpdGVtQnV0dG9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBncm91cEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNPcGVuID0gZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPT09ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGNsb3NlQWxsR3JvdXBNZW51cygpO1xuICAgICAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuZGlzcGxheSA9IGlzT3BlbiA/ICdub25lJyA6ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSBpc09wZW4gPyAncmdiYSgyNTUsMjU1LDI1NSwwLjIpJyA6ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMzIpJztcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5hcHBlbmRDaGlsZChncm91cEJ1dHRvbik7XG4gICAgICAgICAgICAgICAgZ3JvdXBXcmFwcGVyLmFwcGVuZENoaWxkKGdyb3VwTWVudSk7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwV3JhcHBlcik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICBuYXZHcm91cC5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBuYXZHcm91cC5maXJzdENoaWxkKTtcblxuICAgICAgICBpZiAobmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInKTtcbiAgICAgICAgICAgIGlmICghYWN0aXZlIHx8IGFjdGl2ZS5jb250YWlucyhldmVudC50YXJnZXQpKSByZXR1cm47XG4gICAgICAgICAgICBhY3RpdmUucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudV0nKS5mb3JFYWNoKChtZW51KSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHVuaGFuZGxlZFVuZXhwZWN0ZWRFdmVudEtleXMgPSBuZXcgU2V0KCk7XG4gICAgLy8gVHJhY2sgbWVzc2FnZSBiYXIgbWVzc2FnZXMgYWxyZWFkeSBhY2tub3dsZWRnZWQgZHVyaW5nIHRoaXMgZXhlY3V0aW9uIHJ1blxuICAgIC8vIHNvIHRoZSBzYW1lIG5vbi1ibG9ja2luZyB3YXJuaW5nIGRvZXNuJ3QgdHJpZ2dlciByZXBlYXRlZCBwYXVzZXMuXG4gICAgY29uc3QgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMgPSBuZXcgU2V0KCk7XG5cbiAgICAvLyBIZWxwZXIgdG8gY2hlY2sgYW5kIHdhaXQgZm9yIHBhdXNlL3N0b3BcbiAgICBhc3luYyBmdW5jdGlvbiBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKSB7XG4gICAgICAgIGlmIChleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCkge1xuICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQpIHtcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XG4gICAgICAgICAgICBpZiAoZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRUZW1wbGF0ZVRleHQodGV4dCkge1xuICAgICAgICByZXR1cm4gbm9ybWFsaXplVGV4dCh0ZXh0IHx8ICcnKS5yZXBsYWNlKC9cXGJbXFxkLC5dK1xcYi9nLCAnIycpLnRyaW0oKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVVc2VyU3RvcEVycm9yKG1lc3NhZ2UgPSAnV29ya2Zsb3cgc3RvcHBlZCBieSB1c2VyJykge1xuICAgICAgICBjb25zdCBlcnIgPSBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICAgIGVyci5pc1VzZXJTdG9wID0gdHJ1ZTtcbiAgICAgICAgZXJyLm5vUmV0cnkgPSB0cnVlO1xuICAgICAgICByZXR1cm4gZXJyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzTWVzc2FnZUJhckNsb3NlVmlzaWJsZSgpIHtcbiAgICAgICAgY29uc3QgY2xvc2VCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyQ2xvc2VcIl0nKTtcbiAgICAgICAgcmV0dXJuIGNsb3NlQnRuICYmIGlzRWxlbWVudFZpc2libGUoY2xvc2VCdG4pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNob3J0ZW5Gb3JMb2codGV4dCwgbWF4ID0gMjIwKSB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVUZXh0KHRleHQgfHwgJycpO1xuICAgICAgICBpZiAobm9ybWFsaXplZC5sZW5ndGggPD0gbWF4KSByZXR1cm4gbm9ybWFsaXplZDtcbiAgICAgICAgcmV0dXJuIGAke25vcm1hbGl6ZWQuc2xpY2UoMCwgbWF4KX0uLi5gO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpIHtcbiAgICAgICAgY29uc3Qgc2lnbmFsID0gZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nRmxvd1NpZ25hbCB8fCAnbm9uZSc7XG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0Zsb3dTaWduYWwgPSAnbm9uZSc7XG4gICAgICAgIHJldHVybiBzaWduYWw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RhcnRJbnRlcnJ1cHRpb25BY3Rpb25SZWNvcmRlcigpIHtcbiAgICAgICAgY29uc3QgY2FwdHVyZWQgPSBbXTtcbiAgICAgICAgY29uc3QgY2xpY2tIYW5kbGVyID0gKGV2dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZXZ0LnRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQgPyBldnQudGFyZ2V0IDogbnVsbDtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBidXR0b24gPSB0YXJnZXQuY2xvc2VzdCgnYnV0dG9uLCBbcm9sZT1cImJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdJyk7XG4gICAgICAgICAgICBpZiAoIWJ1dHRvbiB8fCAhaXNFbGVtZW50VmlzaWJsZShidXR0b24pKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dChidXR0b24udGV4dENvbnRlbnQgfHwgYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUgJiYgIXRleHQpIHJldHVybjtcbiAgICAgICAgICAgIGNhcHR1cmVkLnB1c2goe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdjbGlja0J1dHRvbicsXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgdGV4dFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xpY2tIYW5kbGVyLCB0cnVlKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0b3AoKSB7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGlja0hhbmRsZXIsIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBjYXB0dXJlZC5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbGxlY3REaWFsb2dCdXR0b25zKGRpYWxvZ0VsKSB7XG4gICAgICAgIGNvbnN0IHNlbGVjdG9ycyA9ICdidXR0b24sIFtyb2xlPVwiYnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0nO1xuICAgICAgICBjb25zdCBidXR0b25zID0gW107XG4gICAgICAgIGNvbnN0IHNlZW4gPSBuZXcgU2V0KCk7XG4gICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3JzKS5mb3JFYWNoKChidXR0b25FbCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ1dHRvbkVsKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBidXR0b25FbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dChidXR0b25FbC50ZXh0Q29udGVudCB8fCBidXR0b25FbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtjb250cm9sTmFtZS50b0xvd2VyQ2FzZSgpfXwke3RleHR9YDtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUgJiYgIXRleHQpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChzZWVuLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICBzZWVuLmFkZChrZXkpO1xuICAgICAgICAgICAgYnV0dG9ucy5wdXNoKHsgY29udHJvbE5hbWUsIHRleHQsIGVsZW1lbnQ6IGJ1dHRvbkVsIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGJ1dHRvbnM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNMaWtlbHlNb2RhbERpYWxvZyhkaWFsb2dFbCwgdGV4dCwgYnV0dG9ucykge1xuICAgICAgICBjb25zdCB0ZXh0TGVuZ3RoID0gbm9ybWFsaXplVGV4dCh0ZXh0IHx8ICcnKS5sZW5ndGg7XG4gICAgICAgIGlmICghYnV0dG9ucy5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHRleHRMZW5ndGggPiA0NTApIHJldHVybiBmYWxzZTtcblxuICAgICAgICBjb25zdCBmb3JtSW5wdXRzID0gZGlhbG9nRWwucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKTtcbiAgICAgICAgaWYgKGZvcm1JbnB1dHMubGVuZ3RoID4gOCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IGhhc1N0YXRpY1RleHQgPSAhIWRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZvcm1TdGF0aWNUZXh0Q29udHJvbDFcIl0nKTtcbiAgICAgICAgY29uc3QgaGFzTGlnaHRib3hDbGFzcyA9IGRpYWxvZ0VsLmNsYXNzTGlzdD8uY29udGFpbnMoJ3Jvb3RDb250ZW50LWxpZ2h0Qm94Jyk7XG4gICAgICAgIGNvbnN0IGhhc0J1dHRvbkdyb3VwID0gISFkaWFsb2dFbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJCdXR0b25Hcm91cFwiXScpO1xuXG4gICAgICAgIHJldHVybiBoYXNTdGF0aWNUZXh0IHx8IGhhc0xpZ2h0Ym94Q2xhc3MgfHwgaGFzQnV0dG9uR3JvdXA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGV0ZWN0VW5leHBlY3RlZEV2ZW50cygpIHtcbiAgICAgICAgY29uc3QgZXZlbnRzID0gW107XG4gICAgICAgIGNvbnN0IHNlZW5FdmVudEtleXMgPSBuZXcgU2V0KCk7XG5cbiAgICAgICAgLy8gLS0tIERpYWxvZ3MgLS0tXG4gICAgICAgIGNvbnN0IGRpYWxvZ1NlbGVjdG9ycyA9ICdbcm9sZT1cImRpYWxvZ1wiXSwgW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyJztcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChkaWFsb2dTZWxlY3RvcnMpLmZvckVhY2goKGRpYWxvZ0VsKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzRWxlbWVudFZpc2libGUoZGlhbG9nRWwpKSByZXR1cm47XG4gICAgICAgICAgICAvLyBQcmVmZXIgdGhlIGRlZGljYXRlZCBzdGF0aWMtdGV4dCBjb250cm9sLCB0aGVuIGhlYWRpbmcgdGFncy5cbiAgICAgICAgICAgIC8vIEF2b2lkIHRoZSBvdmVybHktYnJvYWQgW2NsYXNzKj1cImNvbnRlbnRcIl0gd2hpY2ggY2FuIG1hdGNoIHdyYXBwZXJcbiAgICAgICAgICAgIC8vIGVsZW1lbnRzIHdob3NlIHRleHRDb250ZW50IGluY2x1ZGVzIGJ1dHRvbiBsYWJlbHMuXG4gICAgICAgICAgICBjb25zdCB0ZXh0RWwgPVxuICAgICAgICAgICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZvcm1TdGF0aWNUZXh0Q29udHJvbDFcIl0nKSB8fFxuICAgICAgICAgICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ2gxLCBoMiwgaDMnKSB8fFxuICAgICAgICAgICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ1tjbGFzcyo9XCJtZXNzYWdlXCJdJyk7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dCh0ZXh0RWw/LnRleHRDb250ZW50IHx8IGRpYWxvZ0VsLnRleHRDb250ZW50IHx8ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbnMgPSBjb2xsZWN0RGlhbG9nQnV0dG9ucyhkaWFsb2dFbCk7XG4gICAgICAgICAgICBpZiAoIWlzTGlrZWx5TW9kYWxEaWFsb2coZGlhbG9nRWwsIHRleHQsIGJ1dHRvbnMpKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZVRleHQgPSBnZXRUZW1wbGF0ZVRleHQodGV4dCk7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgZGlhbG9nfCR7dGVtcGxhdGVUZXh0fWA7XG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVGV4dCB8fCBzZWVuRXZlbnRLZXlzLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICBzZWVuRXZlbnRLZXlzLmFkZChrZXkpO1xuICAgICAgICAgICAgZXZlbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIGtpbmQ6ICdkaWFsb2cnLFxuICAgICAgICAgICAgICAgIHRleHQsXG4gICAgICAgICAgICAgICAgdGVtcGxhdGVUZXh0LFxuICAgICAgICAgICAgICAgIGJ1dHRvbnMsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZGlhbG9nRWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtLS0gTWVzc2FnZSBiYXIgZW50cmllcyAtLS1cbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm1lc3NhZ2VCYXItbWVzc2FnZUVudHJ5JykuZm9yRWFjaCgoZW50cnlFbCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGVudHJ5RWwpKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlRWwgPSBlbnRyeUVsLnF1ZXJ5U2VsZWN0b3IoJy5tZXNzYWdlQmFyLW1lc3NhZ2UnKSB8fCBlbnRyeUVsO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQobWVzc2FnZUVsLnRleHRDb250ZW50IHx8ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlVGV4dCA9IGdldFRlbXBsYXRlVGV4dCh0ZXh0KTtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGBtZXNzYWdlQmFyfCR7dGVtcGxhdGVUZXh0fWA7XG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVGV4dCB8fCBzZWVuRXZlbnRLZXlzLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICBzZWVuRXZlbnRLZXlzLmFkZChrZXkpO1xuXG4gICAgICAgICAgICAvLyBTa2lwIG1lc3NhZ2UtYmFyIGVudHJpZXMgdGhhdCB3ZXJlIGFscmVhZHkgYWNrbm93bGVkZ2VkIGluIHRoaXMgcnVuXG4gICAgICAgICAgICAvLyBzbyB0aGUgc2FtZSBub24tYmxvY2tpbmcgd2FybmluZyBkb2Vzbid0IGNhdXNlIHJlcGVhdGVkIHBhdXNlcy5cbiAgICAgICAgICAgIGlmIChhY2tub3dsZWRnZWRNZXNzYWdlQmFyS2V5cy5oYXMoa2V5KSkgcmV0dXJuO1xuXG4gICAgICAgICAgICAvLyBDb2xsZWN0IGNsb3NlIC8gdG9nZ2xlIGNvbnRyb2xzIHBsdXMgY29udGV4dHVhbCB2aXNpYmxlIGJ1dHRvbnNcbiAgICAgICAgICAgIC8vIChlLmcuIE9LL0NhbmNlbCBvbiB0aGUgYWN0aXZlIGZvcm0pIHNvIHRoZSB1c2VyIGNhbiBjaG9vc2UgdGhlbS5cbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xzID0gW107XG4gICAgICAgICAgICBjb25zdCBjb250cm9sS2V5cyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIGNvbnN0IHB1c2hDb250cm9sID0gKGNvbnRyb2wpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtub3JtYWxpemVUZXh0KGNvbnRyb2w/LmNvbnRyb2xOYW1lIHx8ICcnKX18JHtub3JtYWxpemVUZXh0KGNvbnRyb2w/LnRleHQgfHwgJycpfWA7XG4gICAgICAgICAgICAgICAgaWYgKCFrZXkgfHwgY29udHJvbEtleXMuaGFzKGtleSkpIHJldHVybjtcbiAgICAgICAgICAgICAgICBjb250cm9sS2V5cy5hZGQoa2V5KTtcbiAgICAgICAgICAgICAgICBjb250cm9scy5wdXNoKGNvbnRyb2wpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgY2xvc2VCdXR0b24gPVxuICAgICAgICAgICAgICAgIGVudHJ5RWwucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiTWVzc2FnZUJhckNsb3NlXCJdJykgfHxcbiAgICAgICAgICAgICAgICBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJDbG9zZVwiXScpKS5maW5kKGlzRWxlbWVudFZpc2libGUpIHx8XG4gICAgICAgICAgICAgICAgbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHRvZ2dsZUJ1dHRvbiA9XG4gICAgICAgICAgICAgICAgZW50cnlFbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyVG9nZ2xlXCJdJykgfHxcbiAgICAgICAgICAgICAgICBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJUb2dnbGVcIl0nKSkuZmluZChpc0VsZW1lbnRWaXNpYmxlKSB8fFxuICAgICAgICAgICAgICAgIG51bGw7XG4gICAgICAgICAgICBpZiAoY2xvc2VCdXR0b24gJiYgaXNFbGVtZW50VmlzaWJsZShjbG9zZUJ1dHRvbikpIHtcbiAgICAgICAgICAgICAgICBwdXNoQ29udHJvbCh7IGNvbnRyb2xOYW1lOiAnTWVzc2FnZUJhckNsb3NlJywgdGV4dDogbm9ybWFsaXplVGV4dChjbG9zZUJ1dHRvbi50ZXh0Q29udGVudCB8fCAnJyksIGVsZW1lbnQ6IGNsb3NlQnV0dG9uLCB2aXNpYmxlOiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRvZ2dsZUJ1dHRvbiAmJiBpc0VsZW1lbnRWaXNpYmxlKHRvZ2dsZUJ1dHRvbikpIHtcbiAgICAgICAgICAgICAgICBwdXNoQ29udHJvbCh7IGNvbnRyb2xOYW1lOiAnTWVzc2FnZUJhclRvZ2dsZScsIHRleHQ6IG5vcm1hbGl6ZVRleHQodG9nZ2xlQnV0dG9uLnRleHRDb250ZW50IHx8ICcnKSwgZWxlbWVudDogdG9nZ2xlQnV0dG9uLCB2aXNpYmxlOiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb250ZXh0Um9vdCA9XG4gICAgICAgICAgICAgICAgZW50cnlFbC5jbG9zZXN0KCdbZGF0YS1keW4tZm9ybS1uYW1lXSwgW3JvbGU9XCJkaWFsb2dcIl0sIC5yb290Q29udGVudCwgLnJvb3RDb250ZW50LWxpZ2h0Qm94JykgfHxcbiAgICAgICAgICAgICAgICBkb2N1bWVudDtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvblNlbGVjdG9ycyA9ICdbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0sIGJ1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0nO1xuICAgICAgICAgICAgY29udGV4dFJvb3QucXVlcnlTZWxlY3RvckFsbChidXR0b25TZWxlY3RvcnMpLmZvckVhY2goKGJ0bikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gYnRuLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnJztcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0VmFsdWUgPSBub3JtYWxpemVUZXh0KGJ0bi50ZXh0Q29udGVudCB8fCBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRva2VuID0gbm9ybWFsaXplVGV4dChjb250cm9sTmFtZSB8fCB0ZXh0VmFsdWUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzUHJpbWFyeUFjdGlvbiA9XG4gICAgICAgICAgICAgICAgICAgIFsnb2snLCAnY2FuY2VsJywgJ3llcycsICdubycsICdjbG9zZScsICdyZW1vdmUnLCAnZGVsZXRlJywgJ3NhdmUnLCAnbmV3J10uaW5jbHVkZXModG9rZW4pIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdyZW1vdmUnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnZGVsZXRlJykgfHxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2NhbmNlbCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdjbG9zZScpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdsaW5lc3RyaXAnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0ZXh0VmFsdWUgPT09ICdyZW1vdmUnIHx8XG4gICAgICAgICAgICAgICAgICAgIHRleHRWYWx1ZSA9PT0gJ2RlbGV0ZSc7XG4gICAgICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ0bikgfHwgKCFjb250cm9sTmFtZSAmJiAhdGV4dFZhbHVlKSB8fCAhaXNQcmltYXJ5QWN0aW9uKSByZXR1cm47XG4gICAgICAgICAgICAgICAgcHVzaENvbnRyb2woeyBjb250cm9sTmFtZSwgdGV4dDogdGV4dFZhbHVlLCBlbGVtZW50OiBidG4sIHZpc2libGU6IHRydWUgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHNjYW4gZ2xvYmFsbHkgZm9yIHZpc2libGUgcmVtZWRpYXRpb24gYWN0aW9ucyB0aGF0IG1heSBiZVxuICAgICAgICAgICAgLy8gb3V0c2lkZSB0aGUgbWVzc2FnZS1iYXIvZm9ybSB3cmFwcGVyIChlLmcuIExpbmVTdHJpcERlbGV0ZSBpbiB0b29sYmFyKS5cbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYnV0dG9uU2VsZWN0b3JzKS5mb3JFYWNoKChidG4pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGJ0bi5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dFZhbHVlID0gbm9ybWFsaXplVGV4dChidG4udGV4dENvbnRlbnQgfHwgYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5vcm1hbGl6ZVRleHQoY29udHJvbE5hbWUgfHwgdGV4dFZhbHVlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpc0xpa2VseUZpeEFjdGlvbiA9XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdyZW1vdmUnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnZGVsZXRlJykgfHxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2NhbmNlbCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdjbG9zZScpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdsaW5lc3RyaXBkZWxldGUnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0ZXh0VmFsdWUgPT09ICdyZW1vdmUnIHx8XG4gICAgICAgICAgICAgICAgICAgIHRleHRWYWx1ZSA9PT0gJ2RlbGV0ZSc7XG4gICAgICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ0bikgfHwgIWlzTGlrZWx5Rml4QWN0aW9uKSByZXR1cm47XG4gICAgICAgICAgICAgICAgcHVzaENvbnRyb2woeyBjb250cm9sTmFtZSwgdGV4dDogdGV4dFZhbHVlLCBlbGVtZW50OiBidG4sIHZpc2libGU6IHRydWUgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZXZlbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIGtpbmQ6ICdtZXNzYWdlQmFyJyxcbiAgICAgICAgICAgICAgICB0ZXh0LFxuICAgICAgICAgICAgICAgIHRlbXBsYXRlVGV4dCxcbiAgICAgICAgICAgICAgICBjb250cm9scyxcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbnRyeUVsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGV2ZW50cztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtYXRjaEhhbmRsZXJUb0V2ZW50KGhhbmRsZXIsIGV2ZW50KSB7XG4gICAgICAgIGNvbnN0IHRyaWdnZXIgPSBoYW5kbGVyPy50cmlnZ2VyIHx8IHt9O1xuICAgICAgICBpZiAodHJpZ2dlci5raW5kICE9PSBldmVudC5raW5kKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGNvbnN0IHRyaWdnZXJUZW1wbGF0ZSA9IGdlbmVyYWxpemVJbnRlcnJ1cHRpb25UZXh0KHRyaWdnZXIudGV4dFRlbXBsYXRlIHx8ICcnKTtcbiAgICAgICAgY29uc3QgZXZlbnRUZW1wbGF0ZSA9IGdlbmVyYWxpemVJbnRlcnJ1cHRpb25UZXh0KGV2ZW50LnRlbXBsYXRlVGV4dCB8fCBldmVudC50ZXh0IHx8ICcnKTtcbiAgICAgICAgY29uc3QgdHJpZ2dlck1hdGNoTW9kZSA9IG5vcm1hbGl6ZVRleHQodHJpZ2dlci5tYXRjaE1vZGUgfHwgJycpO1xuICAgICAgICBjb25zdCBtYXRjaE1vZGUgPSB0cmlnZ2VyTWF0Y2hNb2RlID09PSAnZXhhY3QnID8gJ2V4YWN0JyA6ICdjb250YWlucyc7XG5cbiAgICAgICAgaWYgKHRyaWdnZXJUZW1wbGF0ZSkge1xuICAgICAgICAgICAgaWYgKG1hdGNoTW9kZSA9PT0gJ2V4YWN0Jykge1xuICAgICAgICAgICAgICAgIGlmICh0cmlnZ2VyVGVtcGxhdGUgIT09IGV2ZW50VGVtcGxhdGUpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIShldmVudFRlbXBsYXRlLmluY2x1ZGVzKHRyaWdnZXJUZW1wbGF0ZSkgfHwgdHJpZ2dlclRlbXBsYXRlLmluY2x1ZGVzKGV2ZW50VGVtcGxhdGUpKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0cmlnZ2VyTWF0Y2hNb2RlID09PSAncmVnZXgnKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSB0cmlnZ2VyLnJlZ2V4IHx8IHRyaWdnZXIudGV4dFRlbXBsYXRlIHx8ICcnO1xuICAgICAgICAgICAgICAgIGlmICghcGF0dGVybiB8fCAhKG5ldyBSZWdFeHAocGF0dGVybiwgJ2knKSkudGVzdChldmVudC50ZW1wbGF0ZVRleHQgfHwgZXZlbnQudGV4dCB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVxdWlyZWRDb250cm9scyA9IEFycmF5LmlzQXJyYXkodHJpZ2dlci5yZXF1aXJlZENvbnRyb2xzKSA/IHRyaWdnZXIucmVxdWlyZWRDb250cm9scyA6IFtdO1xuICAgICAgICBpZiAocmVxdWlyZWRDb250cm9scy5sZW5ndGggJiYgZXZlbnQua2luZCA9PT0gJ21lc3NhZ2VCYXInKSB7XG4gICAgICAgICAgICBjb25zdCBhdmFpbGFibGUgPSBuZXcgU2V0KChldmVudC5jb250cm9scyB8fCBbXSkubWFwKGN0cmwgPT4gbm9ybWFsaXplVGV4dChjdHJsLmNvbnRyb2xOYW1lIHx8IGN0cmwudGV4dCB8fCAnJykpKTtcbiAgICAgICAgICAgIGlmICghcmVxdWlyZWRDb250cm9scy5ldmVyeShuYW1lID0+IGF2YWlsYWJsZS5oYXMobm9ybWFsaXplVGV4dChuYW1lKSkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVxdWlyZWRCdXR0b25zID0gQXJyYXkuaXNBcnJheSh0cmlnZ2VyLnJlcXVpcmVkQnV0dG9ucykgPyB0cmlnZ2VyLnJlcXVpcmVkQnV0dG9ucyA6IFtdO1xuICAgICAgICBpZiAocmVxdWlyZWRCdXR0b25zLmxlbmd0aCAmJiBldmVudC5raW5kID09PSAnZGlhbG9nJykge1xuICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlID0gbmV3IFNldCgoZXZlbnQuYnV0dG9ucyB8fCBbXSkubWFwKGJ0biA9PiBub3JtYWxpemVUZXh0KGJ0bi5jb250cm9sTmFtZSB8fCBidG4udGV4dCB8fCAnJykpKTtcbiAgICAgICAgICAgIHJldHVybiByZXF1aXJlZEJ1dHRvbnMuZXZlcnkobmFtZSA9PiBhdmFpbGFibGUuaGFzKG5vcm1hbGl6ZVRleHQobmFtZSkpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZW5lcmFsaXplSW50ZXJydXB0aW9uVGV4dChyYXdUZXh0KSB7XG4gICAgICAgIGxldCB2YWx1ZSA9IG5vcm1hbGl6ZVRleHQocmF3VGV4dCB8fCAnJyk7XG4gICAgICAgIGlmICghdmFsdWUpIHJldHVybiAnJztcblxuICAgICAgICB2YWx1ZSA9IHZhbHVlXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxiY3VzdG9tZXJcXHMrXFxkK1xcYi9naSwgJ2N1c3RvbWVyIHtudW1iZXJ9JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGJpdGVtIG51bWJlclxccytbYS16MC05Xy1dK1xcYi9naSwgJ2l0ZW0gbnVtYmVyIHt2YWx1ZX0nKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcYlxcZFtcXGQsLi8tXSpcXGIvZywgJ3tudW1iZXJ9Jyk7XG5cbiAgICAgICAgLy8gTm9ybWFsaXplIGR1cGxpY2F0ZS1yZWNvcmQgc3R5bGUgbWVzc2FnZXMgc28gdmFyeWluZyBrZXkgdmFsdWVzXG4gICAgICAgIC8vIChlLmcuIFwiMSwgMVwiIHZzIFwiRlItRVUtTlIsIEZSLUVVLU5SXCIpIG1hcCB0byBvbmUgaGFuZGxlci5cbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKFxuICAgICAgICAgICAgLyhcXGJbYS16XVthLXowLTkgXygpLy1dKlxccyo6XFxzKikoW14uXSs/KShcXC5cXHMqdGhlIHJlY29yZCBhbHJlYWR5IGV4aXN0c1xcLj8pL2ksXG4gICAgICAgICAgICAnJDF7dmFsdWV9JDMnXG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZVRleHQodmFsdWUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbmRNYXRjaGluZ0hhbmRsZXIoZXZlbnQpIHtcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBBcnJheS5pc0FycmF5KGN1cnJlbnRXb3JrZmxvdz8udW5leHBlY3RlZEV2ZW50SGFuZGxlcnMpXG4gICAgICAgICAgICA/IGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVyc1xuICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgY29uc3Qgc29ydGVkID0gaGFuZGxlcnNcbiAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgIC5zbGljZSgpXG4gICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gTnVtYmVyKGI/LnByaW9yaXR5IHx8IDApIC0gTnVtYmVyKGE/LnByaW9yaXR5IHx8IDApKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGhhbmRsZXIgb2Ygc29ydGVkKSB7XG4gICAgICAgICAgICBpZiAoaGFuZGxlcj8uZW5hYmxlZCA9PT0gZmFsc2UpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKG1hdGNoSGFuZGxlclRvRXZlbnQoaGFuZGxlciwgZXZlbnQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZERpYWxvZ0J1dHRvbihldmVudCwgdGFyZ2V0TmFtZSkge1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQodGFyZ2V0TmFtZSB8fCAnJyk7XG4gICAgICAgIGlmICghZXhwZWN0ZWQpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBidXR0b25zID0gQXJyYXkuaXNBcnJheShldmVudD8uYnV0dG9ucykgPyBldmVudC5idXR0b25zIDogW107XG4gICAgICAgIHJldHVybiBidXR0b25zLmZpbmQoYnRuID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ5Q29udHJvbCA9IG5vcm1hbGl6ZVRleHQoYnRuLmNvbnRyb2xOYW1lIHx8ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGJ5VGV4dCA9IG5vcm1hbGl6ZVRleHQoYnRuLnRleHQgfHwgJycpO1xuICAgICAgICAgICAgcmV0dXJuIGJ5Q29udHJvbCA9PT0gZXhwZWN0ZWQgfHwgYnlUZXh0ID09PSBleHBlY3RlZDtcbiAgICAgICAgfSkgfHwgbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kTWVzc2FnZUJhckNvbnRyb2woZXZlbnQsIHRhcmdldE5hbWUpIHtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHRhcmdldE5hbWUgfHwgJycpO1xuICAgICAgICBpZiAoIWV4cGVjdGVkKSByZXR1cm4gbnVsbDtcbiAgICAgICAgY29uc3QgY29udHJvbHMgPSBBcnJheS5pc0FycmF5KGV2ZW50Py5jb250cm9scykgPyBldmVudC5jb250cm9scyA6IFtdO1xuICAgICAgICByZXR1cm4gY29udHJvbHMuZmluZChjdHJsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ5Q29udHJvbCA9IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBieVRleHQgPSBub3JtYWxpemVUZXh0KGN0cmwudGV4dCB8fCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gYnlDb250cm9sID09PSBleHBlY3RlZCB8fCBieVRleHQgPT09IGV4cGVjdGVkO1xuICAgICAgICB9KSB8fCBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCkge1xuICAgICAgICBjb25zdCBjb250cm9scyA9IFtdO1xuICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xuICAgICAgICBjb25zdCBidXR0b25TZWxlY3RvcnMgPSAnW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdLCBidXR0b24sIFtyb2xlPVwiYnV0dG9uXCJdJztcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChidXR0b25TZWxlY3RvcnMpLmZvckVhY2goKGJ0bikgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ0bikpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gYnRuLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KGJ0bi50ZXh0Q29udGVudCB8fCBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpO1xuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KGNvbnRyb2xOYW1lIHx8IHRleHQpO1xuICAgICAgICAgICAgY29uc3QgaXNSZW1lZGlhdGlvbkFjdGlvbiA9XG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ3JlbW92ZScpIHx8XG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpIHx8XG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2NhbmNlbCcpIHx8XG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2Nsb3NlJykgfHxcbiAgICAgICAgICAgICAgICB0b2tlbiA9PT0gJ29rJyB8fFxuICAgICAgICAgICAgICAgIHRva2VuID09PSAneWVzJyB8fFxuICAgICAgICAgICAgICAgIHRva2VuID09PSAnbm8nO1xuICAgICAgICAgICAgaWYgKCFpc1JlbWVkaWF0aW9uQWN0aW9uKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtub3JtYWxpemVUZXh0KGNvbnRyb2xOYW1lKX18JHt0ZXh0fWA7XG4gICAgICAgICAgICBpZiAoc2Vlbi5oYXMoa2V5KSkgcmV0dXJuO1xuICAgICAgICAgICAgc2Vlbi5hZGQoa2V5KTtcbiAgICAgICAgICAgIGNvbnRyb2xzLnB1c2goeyBjb250cm9sTmFtZSwgdGV4dCwgZWxlbWVudDogYnRuLCB2aXNpYmxlOiB0cnVlIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNvbnRyb2xzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbmRHbG9iYWxDbGlja2FibGUodGFyZ2V0TmFtZSkge1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQodGFyZ2V0TmFtZSB8fCAnJyk7XG4gICAgICAgIGlmICghZXhwZWN0ZWQpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBjb250cm9scyA9IGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCk7XG4gICAgICAgIHJldHVybiBjb250cm9scy5maW5kKChjdHJsKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBieUNvbnRyb2wgPSBub3JtYWxpemVUZXh0KGN0cmwuY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICAgICAgY29uc3QgYnlUZXh0ID0gbm9ybWFsaXplVGV4dChjdHJsLnRleHQgfHwgJycpO1xuICAgICAgICAgICAgcmV0dXJuIGJ5Q29udHJvbCA9PT0gZXhwZWN0ZWQgfHwgYnlUZXh0ID09PSBleHBlY3RlZDtcbiAgICAgICAgfSkgfHwgbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub3JtYWxpemVIYW5kbGVyQWN0aW9ucyhoYW5kbGVyKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGhhbmRsZXI/LmFjdGlvbnMpICYmIGhhbmRsZXIuYWN0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVyLmFjdGlvbnMuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoYW5kbGVyPy5hY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBbaGFuZGxlci5hY3Rpb25dO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZWNvcmRMZWFybmVkUnVsZShydWxlKSB7XG4gICAgICAgIGlmICghY3VycmVudFdvcmtmbG93IHx8ICFydWxlKSByZXR1cm47XG4gICAgICAgIGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVycyA9IEFycmF5LmlzQXJyYXkoY3VycmVudFdvcmtmbG93LnVuZXhwZWN0ZWRFdmVudEhhbmRsZXJzKVxuICAgICAgICAgICAgPyBjdXJyZW50V29ya2Zsb3cudW5leHBlY3RlZEV2ZW50SGFuZGxlcnNcbiAgICAgICAgICAgIDogW107XG5cbiAgICAgICAgY29uc3Qga2V5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgdHJpZ2dlcjogcnVsZS50cmlnZ2VyLFxuICAgICAgICAgICAgYWN0aW9uczogQXJyYXkuaXNBcnJheShydWxlPy5hY3Rpb25zKSA/IHJ1bGUuYWN0aW9ucyA6IFtydWxlPy5hY3Rpb25dLmZpbHRlcihCb29sZWFuKSxcbiAgICAgICAgICAgIG91dGNvbWU6IHJ1bGU/Lm91dGNvbWUgfHwgJ25leHQtc3RlcCdcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGV4aXN0cyA9IGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVycy5zb21lKGV4aXN0aW5nID0+XG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgdHJpZ2dlcjogZXhpc3Rpbmc/LnRyaWdnZXIsXG4gICAgICAgICAgICAgICAgYWN0aW9uczogQXJyYXkuaXNBcnJheShleGlzdGluZz8uYWN0aW9ucykgPyBleGlzdGluZy5hY3Rpb25zIDogW2V4aXN0aW5nPy5hY3Rpb25dLmZpbHRlcihCb29sZWFuKSxcbiAgICAgICAgICAgICAgICBvdXRjb21lOiBleGlzdGluZz8ub3V0Y29tZSB8fCAnbmV4dC1zdGVwJ1xuICAgICAgICAgICAgfSkgPT09IGtleVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhpc3RzKSByZXR1cm47XG5cbiAgICAgICAgY3VycmVudFdvcmtmbG93LnVuZXhwZWN0ZWRFdmVudEhhbmRsZXJzLnB1c2gocnVsZSk7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19MRUFSTklOR19SVUxFJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICB3b3JrZmxvd0lkOiBjdXJyZW50V29ya2Zsb3c/LmlkIHx8ICcnLFxuICAgICAgICAgICAgICAgIHJ1bGVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgJyonKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVSdWxlRnJvbUV2ZW50KGV2ZW50LCBhY3Rpb25zLCBvdXRjb21lID0gJ25leHQtc3RlcCcsIG1hdGNoTW9kZSA9ICdjb250YWlucycpIHtcbiAgICAgICAgY29uc3QgcmVxdWlyZWRCdXR0b25zID0gZXZlbnQua2luZCA9PT0gJ2RpYWxvZydcbiAgICAgICAgICAgID8gKGV2ZW50LmJ1dHRvbnMgfHwgW10pLm1hcChidG4gPT4gYnRuLmNvbnRyb2xOYW1lIHx8IGJ0bi50ZXh0KS5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgIDogW107XG4gICAgICAgIGNvbnN0IHJlcXVpcmVkQ29udHJvbHMgPSBldmVudC5raW5kID09PSAnbWVzc2FnZUJhcidcbiAgICAgICAgICAgID8gKGV2ZW50LmNvbnRyb2xzIHx8IFtdKS5tYXAoY3RybCA9PiBjdHJsLmNvbnRyb2xOYW1lIHx8IGN0cmwudGV4dCkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAgICAgICA6IFtdO1xuICAgICAgICBjb25zdCBhY3Rpb25MaXN0ID0gQXJyYXkuaXNBcnJheShhY3Rpb25zKSA/IGFjdGlvbnMuZmlsdGVyKEJvb2xlYW4pIDogW107XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpZDogYHJ1bGVfJHtEYXRlLm5vdygpfV8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMTYpLnNsaWNlKDIsIDgpfWAsXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICAgICAgICBwcmlvcml0eTogMTAwLFxuICAgICAgICAgICAgbW9kZTogJ2F1dG8nLFxuICAgICAgICAgICAgdHJpZ2dlcjoge1xuICAgICAgICAgICAgICAgIGtpbmQ6IGV2ZW50LmtpbmQsXG4gICAgICAgICAgICAgICAgdGV4dFRlbXBsYXRlOiBnZW5lcmFsaXplSW50ZXJydXB0aW9uVGV4dChldmVudC50ZW1wbGF0ZVRleHQgfHwgZXZlbnQudGV4dCB8fCAnJyksXG4gICAgICAgICAgICAgICAgbWF0Y2hNb2RlOiBub3JtYWxpemVUZXh0KG1hdGNoTW9kZSB8fCAnJykgPT09ICdleGFjdCcgPyAnZXhhY3QnIDogJ2NvbnRhaW5zJyxcbiAgICAgICAgICAgICAgICByZXF1aXJlZEJ1dHRvbnMsXG4gICAgICAgICAgICAgICAgcmVxdWlyZWRDb250cm9sc1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFjdGlvbnM6IGFjdGlvbkxpc3QsXG4gICAgICAgICAgICBhY3Rpb246IGFjdGlvbkxpc3RbMF0gfHwgbnVsbCxcbiAgICAgICAgICAgIG91dGNvbWU6IG5vcm1hbGl6ZUZsb3dPdXRjb21lKG91dGNvbWUpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbm9ybWFsaXplRmxvd091dGNvbWUocmF3T3V0Y29tZSkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IG5vcm1hbGl6ZVRleHQocmF3T3V0Y29tZSB8fCAnJyk7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gJ2NvbnRpbnVlLWxvb3AnIHx8IHZhbHVlID09PSAnY29udGludWUnKSByZXR1cm4gJ2NvbnRpbnVlLWxvb3AnO1xuICAgICAgICBpZiAodmFsdWUgPT09ICdyZXBlYXQtbG9vcCcgfHwgdmFsdWUgPT09ICdyZXBlYXQnIHx8IHZhbHVlID09PSAncmV0cnktbG9vcCcpIHJldHVybiAncmVwZWF0LWxvb3AnO1xuICAgICAgICBpZiAodmFsdWUgPT09ICdicmVhay1sb29wJyB8fCB2YWx1ZSA9PT0gJ2JyZWFrJykgcmV0dXJuICdicmVhay1sb29wJztcbiAgICAgICAgaWYgKHZhbHVlID09PSAnc3RvcCcgfHwgdmFsdWUgPT09ICdmYWlsJykgcmV0dXJuICdzdG9wJztcbiAgICAgICAgcmV0dXJuICduZXh0LXN0ZXAnO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzQmVuaWduTWVzc2FnZUJhckV2ZW50KGV2ZW50KSB7XG4gICAgICAgIGlmICghZXZlbnQgfHwgZXZlbnQua2luZCAhPT0gJ21lc3NhZ2VCYXInKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KGV2ZW50LnRleHQgfHwgJycpO1xuICAgICAgICByZXR1cm4gdGV4dC5pbmNsdWRlcygnbmV3cmVjb3JkYWN0aW9uIGJ1dHRvbiBzaG91bGQgbm90IHJlLXRyaWdnZXIgdGhlIG5ldyB0YXNrJyk7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckZsb3dUcmFuc2l0aW9uU3RhYmlsaXR5KCkge1xuICAgICAgICBjb25zdCBtYXhDaGVja3MgPSAxNjtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXhDaGVja3M7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbG9hZGluZyA9IGlzRDM2NUxvYWRpbmcoKTtcbiAgICAgICAgICAgIGNvbnN0IHZpc2libGVEaWFsb2cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImRpYWxvZ1wiXTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pLCBbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyk7XG4gICAgICAgICAgICBpZiAoIWxvYWRpbmcgJiYgIXZpc2libGVEaWFsb2cpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEyMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZFJ1bGVBY3Rpb25Gcm9tT3B0aW9uKGV2ZW50LCBvcHRpb24pIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZENvbnRyb2wgPSBub3JtYWxpemVUZXh0KG9wdGlvbj8uY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICBpZiAoZXZlbnQua2luZCA9PT0gJ21lc3NhZ2VCYXInICYmIG5vcm1hbGl6ZWRDb250cm9sID09PSAnbWVzc2FnZWJhcmNsb3NlJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnY2xvc2VNZXNzYWdlQmFyJyxcbiAgICAgICAgICAgICAgICBidXR0b25Db250cm9sTmFtZTogb3B0aW9uLmNvbnRyb2xOYW1lIHx8ICcnLFxuICAgICAgICAgICAgICAgIGJ1dHRvblRleHQ6IG9wdGlvbi50ZXh0IHx8ICcnXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnY2xpY2tCdXR0b24nLFxuICAgICAgICAgICAgYnV0dG9uQ29udHJvbE5hbWU6IG9wdGlvbj8uY29udHJvbE5hbWUgfHwgJycsXG4gICAgICAgICAgICBidXR0b25UZXh0OiBvcHRpb24/LnRleHQgfHwgJydcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBhcHBseVNpbmdsZUFjdGlvbihldmVudCwgYWN0aW9uKSB7XG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdjbGlja0J1dHRvbicgJiYgZXZlbnQua2luZCA9PT0gJ2RpYWxvZycpIHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbiA9IGZpbmREaWFsb2dCdXR0b24oZXZlbnQsIGFjdGlvbi5idXR0b25Db250cm9sTmFtZSB8fCBhY3Rpb24uYnV0dG9uVGV4dCk7XG4gICAgICAgICAgICBpZiAoYnV0dG9uPy5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgYnV0dG9uLmVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzNTApO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFjdGlvbj8udHlwZSA9PT0gJ2NsaWNrQnV0dG9uJyAmJiBldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2wgPSBmaW5kTWVzc2FnZUJhckNvbnRyb2woZXZlbnQsIGFjdGlvbi5idXR0b25Db250cm9sTmFtZSB8fCBhY3Rpb24uYnV0dG9uVGV4dCk7XG4gICAgICAgICAgICBpZiAoY29udHJvbD8uZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIGNvbnRyb2wuZWxlbWVudC5jbGljaygpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDM1MCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYWN0aW9uPy50eXBlID09PSAnY2xpY2tCdXR0b24nKSB7XG4gICAgICAgICAgICBjb25zdCBnbG9iYWxDb250cm9sID0gZmluZEdsb2JhbENsaWNrYWJsZShhY3Rpb24uYnV0dG9uQ29udHJvbE5hbWUgfHwgYWN0aW9uLmJ1dHRvblRleHQpO1xuICAgICAgICAgICAgaWYgKCFnbG9iYWxDb250cm9sPy5lbGVtZW50KSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBnbG9iYWxDb250cm9sLmVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDM1MCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdjbG9zZU1lc3NhZ2VCYXInICYmIGV2ZW50LmtpbmQgPT09ICdtZXNzYWdlQmFyJykge1xuICAgICAgICAgICAgY29uc3QgZnJvbU9wdGlvbiA9IGZpbmRNZXNzYWdlQmFyQ29udHJvbChldmVudCwgYWN0aW9uLmJ1dHRvbkNvbnRyb2xOYW1lIHx8IGFjdGlvbi5idXR0b25UZXh0KTtcbiAgICAgICAgICAgIGNvbnN0IGZyb21Db250cm9scyA9IChldmVudC5jb250cm9scyB8fCBbXSkuZmluZChjdHJsID0+IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCAnJykgPT09ICdtZXNzYWdlYmFyY2xvc2UnKTtcbiAgICAgICAgICAgIGNvbnN0IGZyb21FbnRyeSA9XG4gICAgICAgICAgICAgICAgZXZlbnQuZWxlbWVudD8ucXVlcnlTZWxlY3Rvcj8uKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyQ2xvc2VcIl0nKSB8fCBudWxsO1xuICAgICAgICAgICAgY29uc3QgZnJvbVBhZ2UgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJDbG9zZVwiXScpKS5maW5kKGlzRWxlbWVudFZpc2libGUpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCBjbG9zZUVsZW1lbnQgPSBmcm9tT3B0aW9uPy5lbGVtZW50IHx8IGZyb21Db250cm9scz8uZWxlbWVudCB8fCBmcm9tRW50cnkgfHwgZnJvbVBhZ2U7XG4gICAgICAgICAgICBpZiAoIWNsb3NlRWxlbWVudCB8fCAhaXNFbGVtZW50VmlzaWJsZShjbG9zZUVsZW1lbnQpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBjbG9zZUVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDI1MCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdzdG9wJykge1xuICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFjdGlvbj8udHlwZSA9PT0gJ25vbmUnO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGFwcGx5SGFuZGxlcihldmVudCwgaGFuZGxlcikge1xuICAgICAgICBjb25zdCBhY3Rpb25zID0gbm9ybWFsaXplSGFuZGxlckFjdGlvbnMoaGFuZGxlcik7XG4gICAgICAgIGlmICghYWN0aW9ucy5sZW5ndGgpIHJldHVybiB0cnVlO1xuICAgICAgICBsZXQgaGFuZGxlZCA9IGZhbHNlO1xuICAgICAgICBmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXZlbnRzID0gZGV0ZWN0VW5leHBlY3RlZEV2ZW50cygpO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRXZlbnQgPSBjdXJyZW50RXZlbnRzWzBdIHx8IGV2ZW50O1xuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IGFwcGx5U2luZ2xlQWN0aW9uKGFjdGl2ZUV2ZW50LCBhY3Rpb24pO1xuICAgICAgICAgICAgaGFuZGxlZCA9IGhhbmRsZWQgfHwgYXBwbGllZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaGFuZGxlZDtcbiAgICB9XG5cbiAgICAvLyBhc2tVc2VyQW5kSGFuZGxlRXZlbnQgcmVtb3ZlZCBcdTIwMTQgbGVhcm5pbmcgbW9kZSB1c2VzIHRoZSByZWNvcmRlci1iYXNlZFxuICAgIC8vIGFwcHJvYWNoIGluIGhhbmRsZVVuZXhwZWN0ZWRFdmVudHMgd2hpY2ggY2FwdHVyZXMgdXNlciBjbGlja3Mgb24gdGhlXG4gICAgLy8gYWN0dWFsIEQzNjUgcGFnZSBhbmQgYXV0b21hdGljYWxseSBjcmVhdGVzIHJ1bGVzIGZyb20gdGhlbS5cblxuICAgIGZ1bmN0aW9uIGluZmVyRmxvd091dGNvbWVGcm9tQWN0aW9uKGFjdGlvbiwgZXZlbnQpIHtcbiAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KGFjdGlvbj8uY29udHJvbE5hbWUgfHwgYWN0aW9uPy50ZXh0IHx8ICcnKTtcbiAgICAgICAgaWYgKCF0b2tlbikgcmV0dXJuICduZXh0LXN0ZXAnO1xuICAgICAgICBpZiAodG9rZW4uaW5jbHVkZXMoJ3N0b3AnKSkgcmV0dXJuICdzdG9wJztcbiAgICAgICAgaWYgKHRva2VuLmluY2x1ZGVzKCdjYW5jZWwnKSB8fCB0b2tlbi5pbmNsdWRlcygnY2xvc2UnKSB8fCB0b2tlbiA9PT0gJ25vJykge1xuICAgICAgICAgICAgaWYgKGV2ZW50Py5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2NvbnRpbnVlLWxvb3AnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICduZXh0LXN0ZXAnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnbmV4dC1zdGVwJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZEludGVycnVwdGlvbk9wdGlvbnMoZXZlbnQpIHtcbiAgICAgICAgY29uc3QgZGVkdXBlID0gbmV3IFNldCgpO1xuICAgICAgICBjb25zdCBhbGwgPSBbXTtcbiAgICAgICAgY29uc3QgcHVzaFVuaXF1ZSA9IChpdGVtKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBvcHRpb24gPSB7XG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGl0ZW0/LmNvbnRyb2xOYW1lIHx8ICcnLFxuICAgICAgICAgICAgICAgIHRleHQ6IGl0ZW0/LnRleHQgfHwgJydcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtub3JtYWxpemVUZXh0KG9wdGlvbi5jb250cm9sTmFtZSl9fCR7bm9ybWFsaXplVGV4dChvcHRpb24udGV4dCl9YDtcbiAgICAgICAgICAgIGlmIChkZWR1cGUuaGFzKGtleSkpIHJldHVybjtcbiAgICAgICAgICAgIGRlZHVwZS5hZGQoa2V5KTtcbiAgICAgICAgICAgIGFsbC5wdXNoKG9wdGlvbik7XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV2ZW50LmtpbmQgPT09ICdkaWFsb2cnKSB7XG4gICAgICAgICAgICAoZXZlbnQuYnV0dG9ucyB8fCBbXSkuZm9yRWFjaChwdXNoVW5pcXVlKTtcbiAgICAgICAgICAgIGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCkuZm9yRWFjaChwdXNoVW5pcXVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIChldmVudC5jb250cm9scyB8fCBbXSkuZm9yRWFjaChwdXNoVW5pcXVlKTtcbiAgICAgICAgICAgIGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCkuZm9yRWFjaChwdXNoVW5pcXVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjb3JlID0gKG9wdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KG9wdC5jb250cm9sTmFtZSB8fCBvcHQudGV4dCB8fCAnJyk7XG4gICAgICAgICAgICBpZiAodG9rZW4gPT09ICdyZW1vdmUnIHx8IHRva2VuLmluY2x1ZGVzKCdyZW1vdmUnKSB8fCB0b2tlbiA9PT0gJ2RlbGV0ZScgfHwgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAodG9rZW4gPT09ICdjYW5jZWwnIHx8IHRva2VuLmluY2x1ZGVzKCdjYW5jZWwnKSkgcmV0dXJuIDA7XG4gICAgICAgICAgICBpZiAodG9rZW4gPT09ICdjbG9zZScgfHwgdG9rZW4uaW5jbHVkZXMoJ2Nsb3NlJykpIHJldHVybiAxO1xuICAgICAgICAgICAgaWYgKHRva2VuID09PSAnbm8nKSByZXR1cm4gMjtcbiAgICAgICAgICAgIGlmICh0b2tlbi5zdGFydHNXaXRoKCdtZXNzYWdlYmFyJykpIHJldHVybiAxMDtcbiAgICAgICAgICAgIHJldHVybiA1O1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gYWxsLnNvcnQoKGEsIGIpID0+IHNjb3JlKGEpIC0gc2NvcmUoYikpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbmRFdmVudE9wdGlvbkVsZW1lbnQoZXZlbnQsIG9wdGlvbikge1xuICAgICAgICBjb25zdCBleHBlY3RlZENvbnRyb2wgPSBub3JtYWxpemVUZXh0KG9wdGlvbj8uY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICBjb25zdCBleHBlY3RlZFRleHQgPSBub3JtYWxpemVUZXh0KG9wdGlvbj8udGV4dCB8fCAnJyk7XG4gICAgICAgIGNvbnN0IGRpYWxvZ0J1dHRvbiA9IChldmVudC5idXR0b25zIHx8IFtdKS5maW5kKGJ0biA9PiB7XG4gICAgICAgICAgICBjb25zdCBieUNvbnRyb2wgPSBub3JtYWxpemVUZXh0KGJ0bi5jb250cm9sTmFtZSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBieVRleHQgPSBub3JtYWxpemVUZXh0KGJ0bi50ZXh0IHx8ICcnKTtcbiAgICAgICAgICAgIHJldHVybiAoZXhwZWN0ZWRDb250cm9sICYmIGJ5Q29udHJvbCA9PT0gZXhwZWN0ZWRDb250cm9sKSB8fCAoZXhwZWN0ZWRUZXh0ICYmIGJ5VGV4dCA9PT0gZXhwZWN0ZWRUZXh0KTtcbiAgICAgICAgfSk/LmVsZW1lbnQgfHwgbnVsbDtcbiAgICAgICAgaWYgKGRpYWxvZ0J1dHRvbikgcmV0dXJuIGRpYWxvZ0J1dHRvbjtcblxuICAgICAgICBjb25zdCBtZXNzYWdlQ29udHJvbCA9IChldmVudC5jb250cm9scyB8fCBbXSkuZmluZChjdHJsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ5Q29udHJvbCA9IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBieVRleHQgPSBub3JtYWxpemVUZXh0KGN0cmwudGV4dCB8fCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gKGV4cGVjdGVkQ29udHJvbCAmJiBieUNvbnRyb2wgPT09IGV4cGVjdGVkQ29udHJvbCkgfHwgKGV4cGVjdGVkVGV4dCAmJiBieVRleHQgPT09IGV4cGVjdGVkVGV4dCk7XG4gICAgICAgIH0pPy5lbGVtZW50IHx8IG51bGw7XG4gICAgICAgIGlmIChtZXNzYWdlQ29udHJvbCkgcmV0dXJuIG1lc3NhZ2VDb250cm9sO1xuXG4gICAgICAgIHJldHVybiBmaW5kR2xvYmFsQ2xpY2thYmxlKG9wdGlvbj8uY29udHJvbE5hbWUgfHwgb3B0aW9uPy50ZXh0IHx8ICcnKT8uZWxlbWVudCB8fCBudWxsO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIHJlcXVlc3RJbnRlcnJ1cHRpb25EZWNpc2lvbihldmVudCkge1xuICAgICAgICBjb25zdCByZXF1ZXN0SWQgPSBgaW50cl8ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygxNikuc2xpY2UoMiwgOCl9YDtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb24gPSBudWxsO1xuICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgIHByb2dyZXNzOiB7XG4gICAgICAgICAgICAgICAgcGhhc2U6ICdwYXVzZWRGb3JJbnRlcnJ1cHRpb24nLFxuICAgICAgICAgICAgICAgIGtpbmQ6IGV2ZW50LmtpbmQsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogc2hvcnRlbkZvckxvZyhldmVudC50ZXh0LCAxODApLFxuICAgICAgICAgICAgICAgIHN0ZXBJbmRleDogZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sICcqJyk7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19JTlRFUlJVUFRJT04nLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgICB3b3JrZmxvd0lkOiBjdXJyZW50V29ya2Zsb3c/LmlkIHx8ICcnLFxuICAgICAgICAgICAgICAgIHN0ZXBJbmRleDogZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4LFxuICAgICAgICAgICAgICAgIGtpbmQ6IGV2ZW50LmtpbmQsXG4gICAgICAgICAgICAgICAgdGV4dDogc2hvcnRlbkZvckxvZyhldmVudC50ZXh0LCA2MDApLFxuICAgICAgICAgICAgICAgIG9wdGlvbnM6IGJ1aWxkSW50ZXJydXB0aW9uT3B0aW9ucyhldmVudClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgJyonKTtcblxuICAgICAgICB3aGlsZSAoIWV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkKSB7XG4gICAgICAgICAgICBjb25zdCBkZWNpc2lvbiA9IGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0ludGVycnVwdGlvbkRlY2lzaW9uO1xuICAgICAgICAgICAgaWYgKGRlY2lzaW9uICYmIGRlY2lzaW9uLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKSB7XG4gICAgICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGVjaXNpb247XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgxNTApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBhcHBseUludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50LCBkZWNpc2lvbikge1xuICAgICAgICBjb25zdCBhY3Rpb25UeXBlID0gZGVjaXNpb24/LmFjdGlvblR5cGUgfHwgJ25vbmUnO1xuICAgICAgICBpZiAoYWN0aW9uVHlwZSA9PT0gJ3N0b3AnKSB7XG4gICAgICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgY2xpY2tlZE9wdGlvbiA9IG51bGw7XG4gICAgICAgIGxldCBjbGlja2VkRm9sbG93dXBPcHRpb24gPSBudWxsO1xuICAgICAgICBpZiAoYWN0aW9uVHlwZSA9PT0gJ2NsaWNrT3B0aW9uJykge1xuICAgICAgICAgICAgY29uc3Qgb3B0aW9uID0gZGVjaXNpb24/LnNlbGVjdGVkT3B0aW9uIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgZWxlbWVudCA9IGZpbmRFdmVudE9wdGlvbkVsZW1lbnQoZXZlbnQsIG9wdGlvbik7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCAmJiB0eXBlb2YgZWxlbWVudC5jbGljayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgICAgICBjbGlja2VkT3B0aW9uID0gb3B0aW9uO1xuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDM1MCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZm9sbG93dXAgPSBkZWNpc2lvbj8uc2VsZWN0ZWRGb2xsb3d1cE9wdGlvbiB8fCBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChmb2xsb3d1cCAmJiBub3JtYWxpemVUZXh0KGZvbGxvd3VwLmNvbnRyb2xOYW1lIHx8IGZvbGxvd3VwLnRleHQgfHwgJycpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvbi5jb250cm9sTmFtZSB8fCBvcHRpb24udGV4dCB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVmcmVzaEV2ZW50cyA9IGRldGVjdFVuZXhwZWN0ZWRFdmVudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9sbG93dXBFdmVudCA9IHJlZnJlc2hFdmVudHNbMF0gfHwgZXZlbnQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvbGxvd3VwRWxlbWVudCA9IGZpbmRFdmVudE9wdGlvbkVsZW1lbnQoZm9sbG93dXBFdmVudCwgZm9sbG93dXApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sbG93dXBFbGVtZW50ICYmIHR5cGVvZiBmb2xsb3d1cEVsZW1lbnQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGxvd3VwRWxlbWVudC5jbGljaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xpY2tlZEZvbGxvd3VwT3B0aW9uID0gZm9sbG93dXA7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzNTApO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBTZWxlY3RlZCBmb2xsb3ctdXAgb3B0aW9uIG5vdCBmb3VuZDogJHtmb2xsb3d1cC5jb250cm9sTmFtZSB8fCBmb2xsb3d1cC50ZXh0IHx8ICd1bmtub3duJ31gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBTZWxlY3RlZCBpbnRlcnJ1cHRpb24gb3B0aW9uIG5vdCBmb3VuZDogJHtvcHRpb24uY29udHJvbE5hbWUgfHwgb3B0aW9uLnRleHQgfHwgJ3Vua25vd24nfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlY2lzaW9uPy5zYXZlUnVsZSAmJiBjbGlja2VkT3B0aW9uKSB7XG4gICAgICAgICAgICBjb25zdCBhY3Rpb25zID0gW2J1aWxkUnVsZUFjdGlvbkZyb21PcHRpb24oZXZlbnQsIGNsaWNrZWRPcHRpb24pXTtcbiAgICAgICAgICAgIGlmIChjbGlja2VkRm9sbG93dXBPcHRpb24pIHtcbiAgICAgICAgICAgICAgICBhY3Rpb25zLnB1c2goYnVpbGRSdWxlQWN0aW9uRnJvbU9wdGlvbihldmVudCwgY2xpY2tlZEZvbGxvd3VwT3B0aW9uKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWNvcmRMZWFybmVkUnVsZShjcmVhdGVSdWxlRnJvbUV2ZW50KGV2ZW50LCBhY3Rpb25zLCBkZWNpc2lvbj8ub3V0Y29tZSB8fCAnbmV4dC1zdGVwJywgZGVjaXNpb24/Lm1hdGNoTW9kZSB8fCAnY29udGFpbnMnKSk7XG4gICAgICAgICAgICBzZW5kTG9nKCdzdWNjZXNzJywgYExlYXJuZWQgJHtldmVudC5raW5kfSBoYW5kbGVyOiAke2NsaWNrZWRPcHRpb24uY29udHJvbE5hbWUgfHwgY2xpY2tlZE9wdGlvbi50ZXh0IHx8ICdhY3Rpb24nfSR7Y2xpY2tlZEZvbGxvd3VwT3B0aW9uID8gJyAtPiBmb2xsb3ctdXAnIDogJyd9YCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBvdXRjb21lID0gbm9ybWFsaXplRmxvd091dGNvbWUoZGVjaXNpb24/Lm91dGNvbWUgfHwgJ25leHQtc3RlcCcpO1xuICAgICAgICBpZiAob3V0Y29tZSA9PT0gJ3N0b3AnKSB7XG4gICAgICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG91dGNvbWUgPT09ICdjb250aW51ZS1sb29wJyB8fCBvdXRjb21lID09PSAnYnJlYWstbG9vcCcgfHwgb3V0Y29tZSA9PT0gJ3JlcGVhdC1sb29wJykge1xuICAgICAgICAgICAgYXdhaXQgd2FpdEZvckZsb3dUcmFuc2l0aW9uU3RhYmlsaXR5KCk7XG4gICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IG91dGNvbWUgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVVuZXhwZWN0ZWRFdmVudHMobGVhcm5pbmdNb2RlKSB7XG4gICAgICAgIGNvbnN0IG1heERlcHRoID0gNjtcbiAgICAgICAgZm9yIChsZXQgZGVwdGggPSAwOyBkZXB0aCA8IG1heERlcHRoOyBkZXB0aCsrKSB7XG4gICAgICAgICAgICBjb25zdCBldmVudHMgPSBkZXRlY3RVbmV4cGVjdGVkRXZlbnRzKCk7XG4gICAgICAgICAgICBpZiAoIWV2ZW50cy5sZW5ndGgpIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGV2ZW50ID0gZXZlbnRzWzBdO1xuXG4gICAgICAgICAgICBpZiAoaXNCZW5pZ25NZXNzYWdlQmFyRXZlbnQoZXZlbnQpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YDtcbiAgICAgICAgICAgICAgICBpZiAoIWFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgSWdub3JpbmcgYmVuaWduIG1lc3NhZ2UgYmFyOiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCwgMTIwKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuYWRkKGtleSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIC0tLSBUcnkgc2F2ZWQgaGFuZGxlcnMgZmlyc3QgKHdvcmtzIGluIEJPVEggbW9kZXMpIC0tLVxuICAgICAgICAgICAgY29uc3QgaGFuZGxlciA9IGZpbmRNYXRjaGluZ0hhbmRsZXIoZXZlbnQpO1xuICAgICAgICAgICAgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5tb2RlICE9PSAnYWx3YXlzQXNrJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZWQgPSBhd2FpdCBhcHBseUhhbmRsZXIoZXZlbnQsIGhhbmRsZXIpO1xuICAgICAgICAgICAgICAgIGlmIChoYW5kbGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgQXBwbGllZCBsZWFybmVkIGhhbmRsZXIgZm9yICR7ZXZlbnQua2luZH06ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlck91dGNvbWUgPSBub3JtYWxpemVGbG93T3V0Y29tZShoYW5kbGVyPy5vdXRjb21lIHx8ICduZXh0LXN0ZXAnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhbmRsZXJPdXRjb21lID09PSAnc3RvcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoaGFuZGxlck91dGNvbWUgPT09ICdjb250aW51ZS1sb29wJyB8fCBoYW5kbGVyT3V0Y29tZSA9PT0gJ2JyZWFrLWxvb3AnIHx8IGhhbmRsZXJPdXRjb21lID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRmxvd1RyYW5zaXRpb25TdGFiaWxpdHkoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogaGFuZGxlck91dGNvbWUgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBNYXJrIG1lc3NhZ2UgYmFyIGFzIGFja25vd2xlZGdlZCBzbyBpdCBkb2Vzbid0IHJlLXRyaWdnZXIgaWZcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGJhciBwZXJzaXN0cyBhZnRlciB0aGUgaGFuZGxlciByYW4gKGUuZy4gY2xvc2UgYnV0dG9uIGhpZGRlbikuXG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmFkZChgbWVzc2FnZUJhcnwke2V2ZW50LnRlbXBsYXRlVGV4dH1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIC0tLSBOb24tYmxvY2tpbmcgbWVzc2FnZSBiYXIgaGFuZGxpbmcgLS0tXG4gICAgICAgICAgICAvLyBNZXNzYWdlIGJhcnMgZG9uJ3QgYmxvY2sgdGhlIFVJLiBJbiBsZWFybmluZyBtb2RlIHdlIHBhdXNlIE9OQ0UgdG9cbiAgICAgICAgICAgIC8vIGxldCB0aGUgdXNlciBkZWNpZGUsIHRoZW4gYWNrbm93bGVkZ2UgdGhlIGtleSBzbyBpdCBkb2Vzbid0IHJlcGVhdC5cbiAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICBpZiAobGVhcm5pbmdNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTGVhcm5pbmcgbW9kZTogbWVzc2FnZSBiYXIgZGV0ZWN0ZWQsIGRlY2lzaW9uIHJlcXVpcmVkOiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCl9YCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgcmVxdWVzdEludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXBwbHlJbnRlcnJ1cHRpb25EZWNpc2lvbihldmVudCwgZGVjaXNpb24pO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgJiYgcmVzdWx0LnNpZ25hbCAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY2tub3dsZWRnZWRNZXNzYWdlQmFyS2V5cy5hZGQoYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm9uLWxlYXJuaW5nIG1vZGU6IGp1c3QgbG9nIG9uY2VcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmFkZChrZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBNZXNzYWdlIGJhciBkZXRlY3RlZCB3aXRoIG5vIGhhbmRsZXI6ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBNYXJrIGFzIGFja25vd2xlZGdlZCBzbyBpdCBkb2Vzbid0IHJlLXRyaWdnZXIgb24gc3Vic2VxdWVudCBzdGVwc1xuICAgICAgICAgICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmFkZChgbWVzc2FnZUJhcnwke2V2ZW50LnRlbXBsYXRlVGV4dH1gKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gLS0tIEJsb2NraW5nIGRpYWxvZyBoYW5kbGluZyAtLS1cbiAgICAgICAgICAgIGlmIChsZWFybmluZ01vZGUpIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYExlYXJuaW5nIG1vZGU6IGRpYWxvZyByZXF1aXJlcyBkZWNpc2lvbjogJHtzaG9ydGVuRm9yTG9nKGV2ZW50LnRleHQpfWApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgcmVxdWVzdEludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50KTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseUludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50LCBkZWNpc2lvbik7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsICYmIHJlc3VsdC5zaWduYWwgIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTm9uLWxlYXJuaW5nIG1vZGUgd2l0aCBubyBoYW5kbGVyOiBsb2cgb25jZSBhbmQgcmV0dXJuXG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtldmVudC5raW5kfXwke2V2ZW50LnRlbXBsYXRlVGV4dH1gO1xuICAgICAgICAgICAgaWYgKCF1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgdW5oYW5kbGVkVW5leHBlY3RlZEV2ZW50S2V5cy5hZGQoa2V5KTtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFVuZXhwZWN0ZWQgJHtldmVudC5raW5kfSBkZXRlY3RlZCB3aXRoIG5vIGhhbmRsZXI6ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICB9XG5cbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVXb3JrZmxvdyh3b3JrZmxvdywgZGF0YSkge1xuICAgIHRyeSB7XG4gICAgICAgIC8vIENsZWFyIGFueSBzdGFsZSBwZW5kaW5nIG5hdmlnYXRpb24gc3RhdGUgYmVmb3JlIHN0YXJ0aW5nIGEgbmV3IHJ1blxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbSgnZDM2NV9wZW5kaW5nX3dvcmtmbG93Jyk7XG4gICAgICAgICAgICBpZiAod29ya2Zsb3c/LmlkKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9hY3RpdmVfd29ya2Zsb3dfaWQnLCB3b3JrZmxvdy5pZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIElnbm9yZSBzZXNzaW9uU3RvcmFnZSBlcnJvcnMgKGUuZy4sIGluIHJlc3RyaWN0ZWQgY29udGV4dHMpXG4gICAgICAgIH1cblxuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFN0YXJ0aW5nIHdvcmtmbG93OiAke3dvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB8fCAndW5uYW1lZCd9YCk7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHsgcGhhc2U6ICd3b3JrZmxvd1N0YXJ0Jywgd29ya2Zsb3c6IHdvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB9IH0sICcqJyk7XG4gICAgICAgIC8vIFJlc2V0IGV4ZWN1dGlvbiBjb250cm9sXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQgPSBmYWxzZTtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb24gPSBudWxsO1xuICAgICAgICBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnMgPSB3b3JrZmxvdy5ydW5PcHRpb25zIHx8IHsgc2tpcFJvd3M6IDAsIGxpbWl0Um93czogMCwgZHJ5UnVuOiBmYWxzZSwgbGVhcm5pbmdNb2RlOiBmYWxzZSwgcnVuVW50aWxJbnRlcmNlcHRpb246IGZhbHNlIH07XG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0ID0gd29ya2Zsb3c/Ll9vcmlnaW5hbFN0YXJ0SW5kZXggfHwgMDtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4ID0gZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQ7XG4gICAgICAgIHVuaGFuZGxlZFVuZXhwZWN0ZWRFdmVudEtleXMuY2xlYXIoKTtcbiAgICAgICAgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuY2xlYXIoKTtcbiAgICAgICAgY3VycmVudFdvcmtmbG93ID0gd29ya2Zsb3c7XG4gICAgICAgIFxuICAgICAgICAvLyBBbHdheXMgcmVmcmVzaCBvcmlnaW5hbC13b3JrZmxvdyBwb2ludGVyIHRvIGF2b2lkIHN0YWxlIHJlc3VtZSBzdGF0ZVxuICAgICAgICAvLyBmcm9tIGEgcHJldmlvdXNseSBleGVjdXRlZCB3b3JrZmxvdyBpbiB0aGUgc2FtZSBwYWdlIGNvbnRleHQuXG4gICAgICAgIHdpbmRvdy5kMzY1T3JpZ2luYWxXb3JrZmxvdyA9IHdvcmtmbG93Py5fb3JpZ2luYWxXb3JrZmxvdyB8fCB3b3JrZmxvdztcbiAgICAgICAgXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gd29ya2Zsb3c/LnNldHRpbmdzIHx8IHt9O1xuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gY3VycmVudFdvcmtmbG93U2V0dGluZ3M7XG4gICAgICAgIC8vIEV4cG9zZSBjdXJyZW50IHdvcmtmbG93IGFuZCBleGVjdXRpb24gY29udHJvbCB0byBpbmplY3RlZCBhY3Rpb24gbW9kdWxlc1xuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyA9IGN1cnJlbnRXb3JrZmxvdztcbiAgICAgICAgd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sID0gZXhlY3V0aW9uQ29udHJvbDtcbiAgICAgICAgY29uc3Qgc3RlcHMgPSB3b3JrZmxvdy5zdGVwcztcbiAgICAgICAgXG4gICAgICAgIC8vIEdldCBkYXRhIGZyb20gbmV3IGRhdGFTb3VyY2VzIHN0cnVjdHVyZSBvciBsZWdhY3kgZGF0YVNvdXJjZVxuICAgICAgICBsZXQgcHJpbWFyeURhdGEgPSBbXTtcbiAgICAgICAgbGV0IGRldGFpbFNvdXJjZXMgPSB7fTtcbiAgICAgICAgbGV0IHJlbGF0aW9uc2hpcHMgPSBbXTtcbiAgICAgICAgXG4gICAgICAgIGlmICh3b3JrZmxvdy5kYXRhU291cmNlcykge1xuICAgICAgICAgICAgcHJpbWFyeURhdGEgPSB3b3JrZmxvdy5kYXRhU291cmNlcy5wcmltYXJ5Py5kYXRhIHx8IFtdO1xuICAgICAgICAgICAgcmVsYXRpb25zaGlwcyA9IHdvcmtmbG93LmRhdGFTb3VyY2VzLnJlbGF0aW9uc2hpcHMgfHwgW107XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEluZGV4IGRldGFpbCBkYXRhIHNvdXJjZXMgYnkgSURcbiAgICAgICAgICAgICh3b3JrZmxvdy5kYXRhU291cmNlcy5kZXRhaWxzIHx8IFtdKS5mb3JFYWNoKGRldGFpbCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRldGFpbC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbFNvdXJjZXNbZGV0YWlsLmlkXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IGRldGFpbC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZGV0YWlsLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZHM6IGRldGFpbC5maWVsZHNcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChkYXRhKSB7XG4gICAgICAgICAgICAvLyBMZWdhY3kgZm9ybWF0XG4gICAgICAgICAgICBwcmltYXJ5RGF0YSA9IEFycmF5LmlzQXJyYXkoZGF0YSkgPyBkYXRhIDogW2RhdGFdO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBJZiBubyBkYXRhLCB1c2UgYSBzaW5nbGUgZW1wdHkgcm93IHRvIHJ1biBzdGVwcyBvbmNlXG4gICAgICAgIGlmIChwcmltYXJ5RGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gW3t9XTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEV4ZWN1dGUgd29ya2Zsb3cgd2l0aCBsb29wIHN1cHBvcnRcbiAgICAgICAgYXdhaXQgZXhlY3V0ZVN0ZXBzV2l0aExvb3BzKHN0ZXBzLCBwcmltYXJ5RGF0YSwgZGV0YWlsU291cmNlcywgcmVsYXRpb25zaGlwcywgd29ya2Zsb3cuc2V0dGluZ3MpO1xuXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgV29ya2Zsb3cgY29tcGxldGU6IHByb2Nlc3NlZCAke3ByaW1hcnlEYXRhLmxlbmd0aH0gcm93c2ApO1xuICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfQ09NUExFVEUnLFxuICAgICAgICAgICAgcmVzdWx0OiB7IHByb2Nlc3NlZDogcHJpbWFyeURhdGEubGVuZ3RoIH1cbiAgICAgICAgfSwgJyonKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBOYXZpZ2F0aW9uIGludGVycnVwdHMgYXJlIG5vdCBlcnJvcnMgLSB0aGUgd29ya2Zsb3cgd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5pc05hdmlnYXRpb25JbnRlcnJ1cHQpIHtcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCAnV29ya2Zsb3cgcGF1c2VkIGZvciBuYXZpZ2F0aW9uIC0gd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkcycpO1xuICAgICAgICAgICAgcmV0dXJuOyAvLyBEb24ndCByZXBvcnQgYXMgZXJyb3Igb3IgY29tcGxldGVcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFlcnJvciB8fCAhZXJyb3IuX3JlcG9ydGVkKSB7XG4gICAgICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBXb3JrZmxvdyBlcnJvcjogJHtlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpfWApO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19FUlJPUicsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGVycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvciksXG4gICAgICAgICAgICAgICAgc3RhY2s6IGVycm9yPy5zdGFja1xuICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVN0ZXBWYWx1ZShzdGVwLCBjdXJyZW50Um93KSB7XG4gICAgY29uc3Qgc291cmNlID0gc3RlcD8udmFsdWVTb3VyY2UgfHwgKHN0ZXA/LmZpZWxkTWFwcGluZyA/ICdkYXRhJyA6ICdzdGF0aWMnKTtcblxuICAgIGlmIChzb3VyY2UgPT09ICdjbGlwYm9hcmQnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoIW5hdmlnYXRvci5jbGlwYm9hcmQ/LnJlYWRUZXh0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDbGlwYm9hcmQgQVBJIG5vdCBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLnJlYWRUZXh0KCk7XG4gICAgICAgICAgICByZXR1cm4gdGV4dCA/PyAnJztcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYENsaXBib2FyZCByZWFkIGZhaWxlZDogJHtlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpfWApO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDbGlwYm9hcmQgcmVhZCBmYWlsZWQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzb3VyY2UgPT09ICdkYXRhJykge1xuICAgICAgICBjb25zdCByb3cgPSBjdXJyZW50Um93IHx8IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwge307XG4gICAgICAgIGNvbnN0IGZpZWxkID0gc3RlcD8uZmllbGRNYXBwaW5nIHx8ICcnO1xuICAgICAgICBpZiAoIWZpZWxkKSByZXR1cm4gJyc7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gcm93W2ZpZWxkXTtcbiAgICAgICAgcmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwgPyAnJyA6IFN0cmluZyh2YWx1ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0ZXA/LnZhbHVlID8/ICcnO1xufVxuXG4vLyBFeGVjdXRlIGEgc2luZ2xlIHN0ZXAgKG1hcHMgc3RlcC50eXBlIHRvIGFjdGlvbiBmdW5jdGlvbnMpXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlU2luZ2xlU3RlcChzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnRSb3csIGRldGFpbFNvdXJjZXMsIHNldHRpbmdzLCBkcnlSdW4sIGxlYXJuaW5nTW9kZSkge1xuICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleCA9IHR5cGVvZiBzdGVwLl9hYnNvbHV0ZUluZGV4ID09PSAnbnVtYmVyJ1xuICAgICAgICA/IHN0ZXAuX2Fic29sdXRlSW5kZXhcbiAgICAgICAgOiAoZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQgfHwgMCkgKyBzdGVwSW5kZXg7XG4gICAgY29uc3Qgc3RlcExhYmVsID0gc3RlcC5kaXNwbGF5VGV4dCB8fCBzdGVwLmNvbnRyb2xOYW1lIHx8IHN0ZXAudHlwZSB8fCBgc3RlcCAke3N0ZXBJbmRleH1gO1xuICAgIC8vIENvbXB1dGUgYWJzb2x1dGUgc3RlcCBpbmRleCAoYWxyZWFkeSBzdG9yZWQgb24gZXhlY3V0aW9uQ29udHJvbClcbiAgICBjb25zdCBhYnNvbHV0ZVN0ZXBJbmRleCA9IGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleDtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcFN0YXJ0Jywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XG4gICAgfSwgJyonKTtcbiAgICBsZXQgd2FpdFRhcmdldCA9ICcnO1xuICAgIGxldCBzaG91bGRXYWl0QmVmb3JlID0gZmFsc2U7XG4gICAgbGV0IHNob3VsZFdhaXRBZnRlciA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICAgIC8vIE5vcm1hbGl6ZSBzdGVwIHR5cGUgKGFsbG93IGJvdGggY2FtZWxDYXNlIGFuZCBkYXNoLXNlcGFyYXRlZCB0eXBlcylcbiAgICAgICAgY29uc3Qgc3RlcFR5cGUgPSAoc3RlcC50eXBlIHx8ICcnKS5yZXBsYWNlKC8tKFthLXpdKS9nLCAoXywgYykgPT4gYy50b1VwcGVyQ2FzZSgpKTtcbiAgICAgICAgbG9nU3RlcChgU3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX06ICR7c3RlcFR5cGV9IC0+ICR7c3RlcExhYmVsfWApO1xuXG4gICAgICAgIC8vIEluIGxlYXJuaW5nIG1vZGU6XG4gICAgICAgIC8vIDEuIENoZWNrIGZvciB1bmV4cGVjdGVkIGV2ZW50cyAoZGlhbG9ncy9tZXNzYWdlcykgZnJvbSB0aGUgcHJldmlvdXMgc3RlcC5cbiAgICAgICAgLy8gICAgSWYgb25lIGlzIGZvdW5kIHRoZSB1c2VyIGlzIHBhdXNlZCB0byBoYW5kbGUgaXQsIHNvIHdlIHNraXAgdGhlXG4gICAgICAgIC8vICAgIHNlcGFyYXRlIGNvbmZpcm1hdGlvbiBwYXVzZSB0byBhdm9pZCBhIGRvdWJsZS1wYXVzZS5cbiAgICAgICAgLy8gMi4gSWYgbm8gaW50ZXJydXB0aW9uIHdhcyBmb3VuZCwgcGF1c2UgZm9yIHN0ZXAgY29uZmlybWF0aW9uLlxuICAgICAgICBjb25zdCBydW5VbnRpbEludGVyY2VwdGlvbiA9ICEhZXhlY3V0aW9uQ29udHJvbC5ydW5PcHRpb25zPy5ydW5VbnRpbEludGVyY2VwdGlvbjtcbiAgICAgICAgaWYgKGxlYXJuaW5nTW9kZSkge1xuICAgICAgICAgICAgY29uc3QgaW50ZXJydXB0aW9uID0gYXdhaXQgaGFuZGxlVW5leHBlY3RlZEV2ZW50cyh0cnVlKTtcbiAgICAgICAgICAgIGlmIChpbnRlcnJ1cHRpb24/LnNpZ25hbCAmJiBpbnRlcnJ1cHRpb24uc2lnbmFsICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaW50ZXJydXB0aW9uO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPbmx5IHBhdXNlIGZvciBjb25maXJtYXRpb24gaWYgaGFuZGxlVW5leHBlY3RlZEV2ZW50cyBkaWRuJ3RcbiAgICAgICAgICAgIC8vIGFscmVhZHkgcGF1c2UgKGkuZS4gdGhlcmUgd2VyZSBubyBldmVudHMgdG8gaGFuZGxlKS5cbiAgICAgICAgICAgIGlmICghcnVuVW50aWxJbnRlcmNlcHRpb24pIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYExlYXJuaW5nIG1vZGU6IGNvbmZpcm0gc3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX0gKCR7c3RlcExhYmVsfSkuIFJlc3VtZSB0byBjb250aW51ZS5gKTtcbiAgICAgICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaGFzZTogJ3BhdXNlZEZvckNvbmZpcm1hdGlvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGVwTmFtZTogc3RlcExhYmVsLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlc3BlY3QgZHJ5IHJ1biBtb2RlXG4gICAgICAgIGlmIChkcnlSdW4pIHtcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgRHJ5IHJ1biAtIHNraXBwaW5nIGFjdGlvbjogJHtzdGVwLnR5cGV9ICR7c3RlcC5jb250cm9sTmFtZSB8fCAnJ31gKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cbiAgICAgICAgICAgIH0sICcqJyk7XG4gICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHJlc29sdmVkVmFsdWUgPSBudWxsO1xuICAgICAgICBpZiAoWydpbnB1dCcsICdzZWxlY3QnLCAnbG9va3VwU2VsZWN0JywgJ2dyaWRJbnB1dCcsICdmaWx0ZXInLCAncXVlcnlGaWx0ZXInXS5pbmNsdWRlcyhzdGVwVHlwZSkpIHtcbiAgICAgICAgICAgIHJlc29sdmVkVmFsdWUgPSBhd2FpdCByZXNvbHZlU3RlcFZhbHVlKHN0ZXAsIGN1cnJlbnRSb3cpO1xuICAgICAgICB9XG5cbiAgICAgICAgd2FpdFRhcmdldCA9IHN0ZXAud2FpdFRhcmdldENvbnRyb2xOYW1lIHx8IHN0ZXAuY29udHJvbE5hbWUgfHwgJyc7XG4gICAgICAgIHNob3VsZFdhaXRCZWZvcmUgPSAhIXN0ZXAud2FpdFVudGlsVmlzaWJsZTtcbiAgICAgICAgc2hvdWxkV2FpdEFmdGVyID0gISFzdGVwLndhaXRVbnRpbEhpZGRlbjtcblxuICAgICAgICBpZiAoKHNob3VsZFdhaXRCZWZvcmUgfHwgc2hvdWxkV2FpdEFmdGVyKSAmJiAhd2FpdFRhcmdldCkge1xuICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBXYWl0IG9wdGlvbiBzZXQgYnV0IG5vIGNvbnRyb2wgbmFtZSBvbiBzdGVwICR7YWJzb2x1dGVTdGVwSW5kZXggKyAxfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZFdhaXRCZWZvcmUgJiYgd2FpdFRhcmdldCkge1xuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICd2aXNpYmxlJywgbnVsbCwgNTAwMCk7XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2ggKHN0ZXBUeXBlKSB7XG4gICAgICAgICAgICBjYXNlICdjbGljayc6XG4gICAgICAgICAgICAgICAgYXdhaXQgY2xpY2tFbGVtZW50KHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdpbnB1dCc6XG4gICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWVsZFR5cGUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdsb29rdXBTZWxlY3QnOlxuICAgICAgICAgICAgICAgIGF3YWl0IHNldExvb2t1cFNlbGVjdFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIHJlc29sdmVkVmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdjaGVja2JveCc6XG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0Q2hlY2tib3hWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCBjb2VyY2VCb29sZWFuKHN0ZXAudmFsdWUpKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnZ3JpZElucHV0JzpcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRHcmlkQ2VsbFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIHJlc29sdmVkVmFsdWUsIHN0ZXAuZmllbGRUeXBlLCAhIXN0ZXAud2FpdEZvclZhbGlkYXRpb24pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdmaWx0ZXInOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFwcGx5R3JpZEZpbHRlcihzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlLCBzdGVwLmZpbHRlck1ldGhvZCB8fCAnaXMgZXhhY3RseScpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAncXVlcnlGaWx0ZXInOlxuICAgICAgICAgICAgICAgIGF3YWl0IGNvbmZpZ3VyZVF1ZXJ5RmlsdGVyKHN0ZXAudGFibGVOYW1lLCBzdGVwLmZpZWxkTmFtZSwgcmVzb2x2ZWRWYWx1ZSwge1xuICAgICAgICAgICAgICAgICAgICBzYXZlZFF1ZXJ5OiBzdGVwLnNhdmVkUXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGNsb3NlRGlhbG9nQWZ0ZXI6IHN0ZXAuY2xvc2VEaWFsb2dBZnRlclxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICd3YWl0JzpcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcChOdW1iZXIoc3RlcC5kdXJhdGlvbikgfHwgNTAwKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnd2FpdFVudGlsJzpcbiAgICAgICAgICAgICAgICBhd2FpdCB3YWl0VW50aWxDb25kaXRpb24oXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAuY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAud2FpdENvbmRpdGlvbiB8fCAndmlzaWJsZScsXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAud2FpdFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBzdGVwLnRpbWVvdXQgfHwgMTAwMDBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICduYXZpZ2F0ZSc6XG4gICAgICAgICAgICAgICAgYXdhaXQgbmF2aWdhdGVUb0Zvcm0oc3RlcCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2FjdGl2YXRlVGFiJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBhY3RpdmF0ZVRhYihzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3RhYk5hdmlnYXRlJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBhY3RpdmF0ZVRhYihzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2FjdGlvblBhbmVUYWInOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFjdGl2YXRlQWN0aW9uUGFuZVRhYihzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnZXhwYW5kU2VjdGlvbic6XG4gICAgICAgICAgICAgICAgYXdhaXQgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oc3RlcC5jb250cm9sTmFtZSwgJ2V4cGFuZCcpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdjb2xsYXBzZVNlY3Rpb24nOlxuICAgICAgICAgICAgICAgIGF3YWl0IGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKHN0ZXAuY29udHJvbE5hbWUsICdjb2xsYXBzZScpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdjbG9zZURpYWxvZyc6XG4gICAgICAgICAgICAgICAgYXdhaXQgY2xvc2VEaWFsb2coKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHN0ZXAgdHlwZTogJHtzdGVwLnR5cGV9YCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2hvdWxkV2FpdEFmdGVyICYmIHdhaXRUYXJnZXQpIHtcbiAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbih3YWl0VGFyZ2V0LCAnaGlkZGVuJywgbnVsbCwgNTAwMCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwb3N0SW50ZXJydXB0aW9uID0gYXdhaXQgaGFuZGxlVW5leHBlY3RlZEV2ZW50cyhsZWFybmluZ01vZGUpO1xuICAgICAgICBpZiAocG9zdEludGVycnVwdGlvbj8uc2lnbmFsICYmIHBvc3RJbnRlcnJ1cHRpb24uc2lnbmFsICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgIHJldHVybiBwb3N0SW50ZXJydXB0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cbiAgICAgICAgfSwgJyonKTtcbiAgICAgICAgY29uc3QgcGVuZGluZ1NpZ25hbCA9IGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpO1xuICAgICAgICByZXR1cm4geyBzaWduYWw6IHBlbmRpbmdTaWduYWwgfTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgLy8gUmUtdGhyb3cgbmF2aWdhdGlvbiBpbnRlcnJ1cHRzIGZvciB1cHN0cmVhbSBoYW5kbGluZ1xuICAgICAgICBpZiAoZXJyICYmIGVyci5pc05hdmlnYXRpb25JbnRlcnJ1cHQpIHRocm93IGVycjtcblxuICAgICAgICAvLyBMZWFybmluZy1tb2RlIHJlY292ZXJ5IHBhdGg6IGlmIGEgZGlhbG9nL21lc3NhZ2UgYXBwZWFyZWQgZHVyaW5nIHRoZSBzdGVwLFxuICAgICAgICAvLyBoYW5kbGUgaXQgZmlyc3QsIHRoZW4gcmUtY2hlY2sgcG9zdC1hY3Rpb24gd2FpdCBjb25kaXRpb24gb25jZS5cbiAgICAgICAgaWYgKGxlYXJuaW5nTW9kZSAmJiAhZXJyPy5pc1VzZXJTdG9wKSB7XG4gICAgICAgICAgICBjb25zdCBwZW5kaW5nID0gZGV0ZWN0VW5leHBlY3RlZEV2ZW50cygpO1xuICAgICAgICAgICAgaWYgKHBlbmRpbmcubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBMZWFybmluZyBtb2RlOiBpbnRlcnJ1cHRpb24gZGV0ZWN0ZWQgZHVyaW5nIHN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9LiBBc2tpbmcgZm9yIGhhbmRsaW5nLi4uYCk7XG4gICAgICAgICAgICAgICAgYXdhaXQgaGFuZGxlVW5leHBlY3RlZEV2ZW50cyh0cnVlKTtcbiAgICAgICAgICAgICAgICBpZiAoc2hvdWxkV2FpdEFmdGVyICYmIHdhaXRUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbih3YWl0VGFyZ2V0LCAnaGlkZGVuJywgbnVsbCwgMjUwMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBEb25lJywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAnKicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGVuZGluZ1NpZ25hbCA9IGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiBwZW5kaW5nU2lnbmFsIH07XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTGVhcm5pbmcgbW9kZSBvdmVycmlkZTogY29udGludWluZyBldmVuIHRob3VnaCBcIiR7d2FpdFRhcmdldH1cIiBpcyBzdGlsbCB2aXNpYmxlIGFmdGVyIGludGVycnVwdGlvbiBoYW5kbGluZy5gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sICcqJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwZW5kaW5nU2lnbmFsID0gY29uc3VtZVBlbmRpbmdGbG93U2lnbmFsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IHBlbmRpbmdTaWduYWwgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYEVycm9yIGV4ZWN1dGluZyBzdGVwICR7YWJzb2x1dGVTdGVwSW5kZXggKyAxfTogJHtlcnI/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycil9YCk7XG4gICAgICAgIHRocm93IGVycjtcbiAgICB9XG59XG5hc3luYyBmdW5jdGlvbiBleGVjdXRlU3RlcHNXaXRoTG9vcHMoc3RlcHMsIHByaW1hcnlEYXRhLCBkZXRhaWxTb3VyY2VzLCByZWxhdGlvbnNoaXBzLCBzZXR0aW5ncykge1xuICAgIC8vIEFwcGx5IHNraXAvbGltaXQgcm93cyBmcm9tIHJ1biBvcHRpb25zXG4gICAgY29uc3QgeyBza2lwUm93cyA9IDAsIGxpbWl0Um93cyA9IDAsIGRyeVJ1biA9IGZhbHNlLCBsZWFybmluZ01vZGUgPSBmYWxzZSB9ID0gZXhlY3V0aW9uQ29udHJvbC5ydW5PcHRpb25zO1xuICAgIFxuICAgIGNvbnN0IG9yaWdpbmFsVG90YWxSb3dzID0gcHJpbWFyeURhdGEubGVuZ3RoO1xuICAgIGxldCBzdGFydFJvd051bWJlciA9IDA7IC8vIFRoZSBzdGFydGluZyByb3cgbnVtYmVyIGZvciBkaXNwbGF5XG4gICAgXG4gICAgaWYgKHNraXBSb3dzID4gMCkge1xuICAgICAgICBwcmltYXJ5RGF0YSA9IHByaW1hcnlEYXRhLnNsaWNlKHNraXBSb3dzKTtcbiAgICAgICAgc3RhcnRSb3dOdW1iZXIgPSBza2lwUm93cztcbiAgICAgICAgc2VuZExvZygnaW5mbycsIGBTa2lwcGVkIGZpcnN0ICR7c2tpcFJvd3N9IHJvd3NgKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGxpbWl0Um93cyA+IDAgJiYgcHJpbWFyeURhdGEubGVuZ3RoID4gbGltaXRSb3dzKSB7XG4gICAgICAgIHByaW1hcnlEYXRhID0gcHJpbWFyeURhdGEuc2xpY2UoMCwgbGltaXRSb3dzKTtcbiAgICAgICAgc2VuZExvZygnaW5mbycsIGBMaW1pdGVkIHRvICR7bGltaXRSb3dzfSByb3dzYCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHRvdGFsUm93c1RvUHJvY2VzcyA9IHByaW1hcnlEYXRhLmxlbmd0aDtcbiAgICBleGVjdXRpb25Db250cm9sLnRvdGFsUm93cyA9IG9yaWdpbmFsVG90YWxSb3dzO1xuICAgIFxuICAgIC8vIEZpbmQgbG9vcCBzdHJ1Y3R1cmVzXG4gICAgY29uc3QgbG9vcFBhaXJzID0gZmluZExvb3BQYWlycyhzdGVwcywgKG1lc3NhZ2UpID0+IHNlbmRMb2coJ2Vycm9yJywgbWVzc2FnZSkpO1xuICAgIGNvbnN0IGlmUGFpcnMgPSBmaW5kSWZQYWlycyhzdGVwcywgKG1lc3NhZ2UpID0+IHNlbmRMb2coJ2Vycm9yJywgbWVzc2FnZSkpO1xuICAgIGNvbnN0IGxhYmVsTWFwID0gbmV3IE1hcCgpO1xuICAgIHN0ZXBzLmZvckVhY2goKHN0ZXAsIGluZGV4KSA9PiB7XG4gICAgICAgIGlmIChzdGVwPy50eXBlID09PSAnbGFiZWwnICYmIHN0ZXAubGFiZWxOYW1lKSB7XG4gICAgICAgICAgICBsYWJlbE1hcC5zZXQoc3RlcC5sYWJlbE5hbWUsIGluZGV4KTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSWYgbm8gbG9vcHMsIGV4ZWN1dGUgYWxsIHN0ZXBzIGZvciBlYWNoIHByaW1hcnkgZGF0YSByb3cgKGxlZ2FjeSBiZWhhdmlvcilcbiAgICBpZiAobG9vcFBhaXJzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBmb3IgKGxldCByb3dJbmRleCA9IDA7IHJvd0luZGV4IDwgcHJpbWFyeURhdGEubGVuZ3RoOyByb3dJbmRleCsrKSB7XG4gICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTsgLy8gQ2hlY2sgZm9yIHBhdXNlL3N0b3BcblxuICAgICAgICAgICAgY29uc3Qgcm93ID0gcHJpbWFyeURhdGFbcm93SW5kZXhdO1xuICAgICAgICAgICAgY29uc3QgZGlzcGxheVJvd051bWJlciA9IHN0YXJ0Um93TnVtYmVyICsgcm93SW5kZXg7IC8vIEFjdHVhbCByb3cgbnVtYmVyIGluIG9yaWdpbmFsIGRhdGFcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFJvd0luZGV4ID0gZGlzcGxheVJvd051bWJlcjtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudERhdGFSb3cgPSByb3c7XG5cbiAgICAgICAgICAgIGNvbnN0IHJvd1Byb2dyZXNzID0ge1xuICAgICAgICAgICAgICAgIHBoYXNlOiAncm93U3RhcnQnLFxuICAgICAgICAgICAgICAgIHJvdzogZGlzcGxheVJvd051bWJlcixcbiAgICAgICAgICAgICAgICB0b3RhbFJvd3M6IG9yaWdpbmFsVG90YWxSb3dzLFxuICAgICAgICAgICAgICAgIHByb2Nlc3NlZFJvd3M6IHJvd0luZGV4ICsgMSxcbiAgICAgICAgICAgICAgICB0b3RhbFRvUHJvY2VzczogdG90YWxSb3dzVG9Qcm9jZXNzLFxuICAgICAgICAgICAgICAgIHN0ZXA6ICdQcm9jZXNzaW5nIHJvdydcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFByb2Nlc3Npbmcgcm93ICR7ZGlzcGxheVJvd051bWJlciArIDF9LyR7b3JpZ2luYWxUb3RhbFJvd3N9YCk7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiByb3dQcm9ncmVzcyB9LCAnKicpO1xuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoMCwgc3RlcHMubGVuZ3RoLCByb3cpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJyB8fCByZXN1bHQ/LnNpZ25hbCA9PT0gJ3JlcGVhdC1sb29wJykge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTG9vcCBjb250cm9sIHNpZ25hbCB1c2VkIG91dHNpZGUgb2YgYSBsb29wJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGxvb3BQYWlyTWFwID0gbmV3IE1hcChsb29wUGFpcnMubWFwKHBhaXIgPT4gW3BhaXIuc3RhcnRJbmRleCwgcGFpci5lbmRJbmRleF0pKTtcbiAgICBjb25zdCBpbml0aWFsRGF0YVJvdyA9IHByaW1hcnlEYXRhWzBdIHx8IHt9O1xuXG4gICAgY29uc3QgcmVzb2x2ZUxvb3BEYXRhID0gKGxvb3BEYXRhU291cmNlLCBjdXJyZW50RGF0YVJvdykgPT4ge1xuICAgICAgICBsZXQgbG9vcERhdGEgPSBwcmltYXJ5RGF0YTtcblxuICAgICAgICBpZiAobG9vcERhdGFTb3VyY2UgIT09ICdwcmltYXJ5JyAmJiBkZXRhaWxTb3VyY2VzW2xvb3BEYXRhU291cmNlXSkge1xuICAgICAgICAgICAgY29uc3QgZGV0YWlsU291cmNlID0gZGV0YWlsU291cmNlc1tsb29wRGF0YVNvdXJjZV07XG4gICAgICAgICAgICBjb25zdCByZWxhdGlvbnNGb3JEZXRhaWwgPSAocmVsYXRpb25zaGlwcyB8fCBbXSkuZmlsdGVyKHIgPT4gci5kZXRhaWxJZCA9PT0gbG9vcERhdGFTb3VyY2UpO1xuICAgICAgICAgICAgaWYgKCFyZWxhdGlvbnNGb3JEZXRhaWwubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9vcERhdGE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGxvb3BTdGFjayA9IEFycmF5LmlzQXJyYXkoY3VycmVudERhdGFSb3c/Ll9fZDM2NV9sb29wX3N0YWNrKVxuICAgICAgICAgICAgICAgID8gY3VycmVudERhdGFSb3cuX19kMzY1X2xvb3Bfc3RhY2tcbiAgICAgICAgICAgICAgICA6IFtdO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50TG9vcFNvdXJjZUlkID0gbG9vcFN0YWNrLmxlbmd0aCA/IGxvb3BTdGFja1tsb29wU3RhY2subGVuZ3RoIC0gMV0gOiAnJztcbiAgICAgICAgICAgIGlmICghcGFyZW50TG9vcFNvdXJjZUlkKSB7XG4gICAgICAgICAgICAgICAgLy8gVG9wLWxldmVsIGxvb3A6IGRvIG5vdCBhcHBseSByZWxhdGlvbnNoaXAgZmlsdGVyaW5nLlxuICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gZGV0YWlsU291cmNlLmRhdGE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwYXJlbnRTY29wZWRSZWxhdGlvbnMgPSByZWxhdGlvbnNGb3JEZXRhaWwuZmlsdGVyKHJlbCA9PiAocmVsLnBhcmVudFNvdXJjZUlkIHx8ICcnKSA9PT0gcGFyZW50TG9vcFNvdXJjZUlkKTtcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZVJlbGF0aW9ucyA9IHBhcmVudFNjb3BlZFJlbGF0aW9ucy5sZW5ndGggPyBwYXJlbnRTY29wZWRSZWxhdGlvbnMgOiByZWxhdGlvbnNGb3JEZXRhaWw7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVQYXJlbnRWYWx1ZSA9IChyZWwsIHBhaXIpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBsaWNpdEtleSA9IHJlbD8ucGFyZW50U291cmNlSWQgPyBgJHtyZWwucGFyZW50U291cmNlSWR9OiR7cGFpci5wcmltYXJ5RmllbGR9YCA6ICcnO1xuICAgICAgICAgICAgICAgIGlmIChleHBsaWNpdEtleSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBsaWNpdFZhbHVlID0gY3VycmVudERhdGFSb3c/LltleHBsaWNpdEtleV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChleHBsaWNpdFZhbHVlICE9PSB1bmRlZmluZWQgJiYgZXhwbGljaXRWYWx1ZSAhPT0gbnVsbCAmJiBTdHJpbmcoZXhwbGljaXRWYWx1ZSkgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXhwbGljaXRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBmYWxsYmFja1ZhbHVlID0gY3VycmVudERhdGFSb3c/LltwYWlyLnByaW1hcnlGaWVsZF07XG4gICAgICAgICAgICAgICAgaWYgKGZhbGxiYWNrVmFsdWUgIT09IHVuZGVmaW5lZCAmJiBmYWxsYmFja1ZhbHVlICE9PSBudWxsICYmIFN0cmluZyhmYWxsYmFja1ZhbHVlKSAhPT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbGxiYWNrVmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZFJlbGF0aW9uID0gY2FuZGlkYXRlUmVsYXRpb25zLmZpbmQoKHJlbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZ3MgPSBBcnJheS5pc0FycmF5KHJlbD8uZmllbGRNYXBwaW5ncykgJiYgcmVsLmZpZWxkTWFwcGluZ3MubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgID8gcmVsLmZpZWxkTWFwcGluZ3NcbiAgICAgICAgICAgICAgICAgICAgOiAocmVsPy5wcmltYXJ5RmllbGQgJiYgcmVsPy5kZXRhaWxGaWVsZFxuICAgICAgICAgICAgICAgICAgICAgICAgPyBbeyBwcmltYXJ5RmllbGQ6IHJlbC5wcmltYXJ5RmllbGQsIGRldGFpbEZpZWxkOiByZWwuZGV0YWlsRmllbGQgfV1cbiAgICAgICAgICAgICAgICAgICAgOiBbXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmaWVsZE1hcHBpbmdzLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybiBmaWVsZE1hcHBpbmdzLmV2ZXJ5KChwYWlyKSA9PiByZXNvbHZlUGFyZW50VmFsdWUocmVsLCBwYWlyKSAhPT0gdW5kZWZpbmVkKTtcbiAgICAgICAgICAgIH0pIHx8IG51bGw7XG5cbiAgICAgICAgICAgIGlmICghc2VsZWN0ZWRSZWxhdGlvbikge1xuICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgUmVsYXRpb25zaGlwIGZpbHRlciBmb3IgJHtsb29wRGF0YVNvdXJjZX0gY291bGQgbm90IHJlc29sdmUgcGFyZW50IHZhbHVlcy4gTG9vcCB3aWxsIHByb2Nlc3MgMCByb3dzLmApO1xuICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gW107XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZE1hcHBpbmdzID0gQXJyYXkuaXNBcnJheShzZWxlY3RlZFJlbGF0aW9uLmZpZWxkTWFwcGluZ3MpICYmIHNlbGVjdGVkUmVsYXRpb24uZmllbGRNYXBwaW5ncy5sZW5ndGhcbiAgICAgICAgICAgICAgICA/IHNlbGVjdGVkUmVsYXRpb24uZmllbGRNYXBwaW5nc1xuICAgICAgICAgICAgICAgIDogW3sgcHJpbWFyeUZpZWxkOiBzZWxlY3RlZFJlbGF0aW9uLnByaW1hcnlGaWVsZCwgZGV0YWlsRmllbGQ6IHNlbGVjdGVkUmVsYXRpb24uZGV0YWlsRmllbGQgfV07XG5cbiAgICAgICAgICAgIGxvb3BEYXRhID0gZGV0YWlsU291cmNlLmRhdGEuZmlsdGVyKChkZXRhaWxSb3cpID0+IHNlbGVjdGVkTWFwcGluZ3MuZXZlcnkoKHBhaXIpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRWYWx1ZSA9IHJlc29sdmVQYXJlbnRWYWx1ZShzZWxlY3RlZFJlbGF0aW9uLCBwYWlyKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZFZhbHVlID0gZGV0YWlsUm93Py5bcGFpci5kZXRhaWxGaWVsZF07XG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudFZhbHVlID09PSB1bmRlZmluZWQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoY2hpbGRWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IGNoaWxkVmFsdWUgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gU3RyaW5nKGNoaWxkVmFsdWUpID09PSBTdHJpbmcocGFyZW50VmFsdWUpO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xuICAgIH07XG5cbiAgICBhc3luYyBmdW5jdGlvbiBleGVjdXRlU3RlcFdpdGhIYW5kbGluZyhzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnREYXRhUm93KSB7XG4gICAgICAgIGNvbnN0IHsgbW9kZSwgcmV0cnlDb3VudCwgcmV0cnlEZWxheSwgZ290b0xhYmVsIH0gPSBnZXRTdGVwRXJyb3JDb25maWcoc3RlcCwgc2V0dGluZ3MpO1xuICAgICAgICBsZXQgYXR0ZW1wdCA9IDA7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RlcFJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVTaW5nbGVTdGVwKHN0ZXAsIHN0ZXBJbmRleCwgY3VycmVudERhdGFSb3csIGRldGFpbFNvdXJjZXMsIHNldHRpbmdzLCBkcnlSdW4sIGxlYXJuaW5nTW9kZSk7XG4gICAgICAgICAgICAgICAgaWYgKHN0ZXBSZXN1bHQ/LnNpZ25hbCAmJiBzdGVwUmVzdWx0LnNpZ25hbCAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IHN0ZXBSZXN1bHQuc2lnbmFsIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHBlbmRpbmdTaWduYWwgPSBjb25zdW1lUGVuZGluZ0Zsb3dTaWduYWwoKTtcbiAgICAgICAgICAgICAgICBpZiAocGVuZGluZ1NpZ25hbCAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogcGVuZGluZ1NpZ25hbCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAmJiBlcnIuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAmJiAoZXJyLmlzVXNlclN0b3AgfHwgZXJyLm5vUmV0cnkpKSB0aHJvdyBlcnI7XG5cbiAgICAgICAgICAgICAgICBpZiAocmV0cnlDb3VudCA+IDAgJiYgYXR0ZW1wdCA8IHJldHJ5Q291bnQpIHtcbiAgICAgICAgICAgICAgICAgICAgYXR0ZW1wdCArPSAxO1xuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFJldHJ5aW5nIHN0ZXAgJHtzdGVwSW5kZXggKyAxfSAoJHthdHRlbXB0fS8ke3JldHJ5Q291bnR9KSBhZnRlciBlcnJvcjogJHtlcnI/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycil9YCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXRyeURlbGF5ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAocmV0cnlEZWxheSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgc3dpdGNoIChtb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3NraXAnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnc2tpcCcgfTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnZ290byc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdnb3RvJywgbGFiZWw6IGdvdG9MYWJlbCB9O1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdicmVhay1sb29wJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2JyZWFrLWxvb3AnIH07XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbnRpbnVlLWxvb3AnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnY29udGludWUtbG9vcCcgfTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAncmVwZWF0LWxvb3AnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAncmVwZWF0LWxvb3AnIH07XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2ZhaWwnOlxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVSYW5nZShzdGFydElkeCwgZW5kSWR4LCBjdXJyZW50RGF0YVJvdykge1xuICAgICAgICBpZiAoY3VycmVudERhdGFSb3cpIHtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudERhdGFSb3cgPSBjdXJyZW50RGF0YVJvdztcbiAgICAgICAgfVxuICAgICAgICBsZXQgaWR4ID0gc3RhcnRJZHg7XG5cbiAgICAgICAgd2hpbGUgKGlkeCA8IGVuZElkeCkge1xuICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXG5cbiAgICAgICAgICAgIGNvbnN0IHN0ZXAgPSBzdGVwc1tpZHhdO1xuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnbGFiZWwnKSB7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdnb3RvJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldEluZGV4ID0gbGFiZWxNYXAuZ2V0KHN0ZXAuZ290b0xhYmVsKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdvdG8gbGFiZWwgbm90IGZvdW5kOiAke3N0ZXAuZ290b0xhYmVsIHx8ICcnfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPCBzdGFydElkeCB8fCB0YXJnZXRJbmRleCA+PSBlbmRJZHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnZ290bycsIHRhcmdldEluZGV4IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlkeCA9IHRhcmdldEluZGV4O1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnaWYtc3RhcnQnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29uZGl0aW9uTWV0ID0gZXZhbHVhdGVDb25kaXRpb24oc3RlcCwgY3VycmVudERhdGFSb3csIHtcbiAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsXG4gICAgICAgICAgICAgICAgICAgIGlzRWxlbWVudFZpc2libGVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRJbmRleCA9IGlmUGFpcnMuaWZUb0VuZC5nZXQoaWR4KTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbHNlSW5kZXggPSBpZlBhaXJzLmlmVG9FbHNlLmdldChpZHgpO1xuICAgICAgICAgICAgICAgIGlmIChlbmRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSWYtc3RhcnQgYXQgaW5kZXggJHtpZHh9IGhhcyBubyBtYXRjaGluZyBpZi1lbmRgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9uTWV0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZWxzZUluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZWxzZUluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZHggPSBlbmRJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnZWxzZScpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRJbmRleCA9IGlmUGFpcnMuZWxzZVRvRW5kLmdldChpZHgpO1xuICAgICAgICAgICAgICAgIGlmIChlbmRJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGVuZEluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdpZi1lbmQnKSB7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdjb250aW51ZS1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2NvbnRpbnVlLWxvb3AnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdyZXBlYXQtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdyZXBlYXQtbG9vcCcgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2JyZWFrLWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnYnJlYWstbG9vcCcgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2xvb3Atc3RhcnQnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbG9vcEVuZElkeCA9IGxvb3BQYWlyTWFwLmdldChpZHgpO1xuICAgICAgICAgICAgICAgIGlmIChsb29wRW5kSWR4ID09PSB1bmRlZmluZWQgfHwgbG9vcEVuZElkeCA8PSBpZHgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBMb29wIHN0YXJ0IGF0IGluZGV4ICR7aWR4fSBoYXMgbm8gbWF0Y2hpbmcgZW5kYCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgbG9vcE1vZGUgPSBzdGVwLmxvb3BNb2RlIHx8ICdkYXRhJztcblxuICAgICAgICAgICAgICAgIGlmIChsb29wTW9kZSA9PT0gJ2NvdW50Jykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsb29wQ291bnQgPSBOdW1iZXIoc3RlcC5sb29wQ291bnQpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgRW50ZXJpbmcgbG9vcDogJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ30gKGNvdW50PSR7bG9vcENvdW50fSlgKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaXRlckluZGV4ID0gMDsgaXRlckluZGV4IDwgbG9vcENvdW50OyBpdGVySW5kZXgrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ2xvb3BJdGVyYXRpb24nLCBpdGVyYXRpb246IGl0ZXJJbmRleCArIDEsIHRvdGFsOiBsb29wQ291bnQsIHN0ZXA6IGBMb29wIFwiJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31cIjogaXRlcmF0aW9uICR7aXRlckluZGV4ICsgMX0vJHtsb29wQ291bnR9YCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAnKicpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgY3VycmVudERhdGFSb3cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlckluZGV4ID0gTWF0aC5tYXgoLTEsIGl0ZXJJbmRleCAtIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZHggPSBsb29wRW5kSWR4ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGxvb3BNb2RlID09PSAnd2hpbGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1heEl0ZXJhdGlvbnMgPSBOdW1iZXIoc3RlcC5sb29wTWF4SXRlcmF0aW9ucykgfHwgMTAwO1xuICAgICAgICAgICAgICAgICAgICBsZXQgaXRlckluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgd2hpbGUgKGl0ZXJJbmRleCA8IG1heEl0ZXJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFldmFsdWF0ZUNvbmRpdGlvbihzdGVwLCBjdXJyZW50RGF0YVJvdywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzRWxlbWVudFZpc2libGVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKSBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdsb29wSXRlcmF0aW9uJywgaXRlcmF0aW9uOiBpdGVySW5kZXggKyAxLCB0b3RhbDogbWF4SXRlcmF0aW9ucywgc3RlcDogYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiOiBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke21heEl0ZXJhdGlvbnN9YCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAnKicpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgY3VycmVudERhdGFSb3cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVySW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ3JlcGVhdC1sb29wJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHJldHVybiByZXN1bHQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJJbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZXJJbmRleCA+PSBtYXhJdGVyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiIGhpdCBtYXggaXRlcmF0aW9ucyAoJHttYXhJdGVyYXRpb25zfSlgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGxvb3BFbmRJZHggKyAxO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBsb29wRGF0YVNvdXJjZSA9IHN0ZXAubG9vcERhdGFTb3VyY2UgfHwgJ3ByaW1hcnknO1xuICAgICAgICAgICAgICAgIGxldCBsb29wRGF0YSA9IHJlc29sdmVMb29wRGF0YShsb29wRGF0YVNvdXJjZSwgY3VycmVudERhdGFSb3cpO1xuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgaXRlcmF0aW9uIGxpbWl0XG4gICAgICAgICAgICAgICAgY29uc3QgaXRlcmF0aW9uTGltaXQgPSBzdGVwLml0ZXJhdGlvbkxpbWl0IHx8IDA7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZXJhdGlvbkxpbWl0ID4gMCAmJiBsb29wRGF0YS5sZW5ndGggPiBpdGVyYXRpb25MaW1pdCkge1xuICAgICAgICAgICAgICAgICAgICBsb29wRGF0YSA9IGxvb3BEYXRhLnNsaWNlKDAsIGl0ZXJhdGlvbkxpbWl0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYEVudGVyaW5nIGxvb3A6ICR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9IChzb3VyY2U9JHtsb29wRGF0YVNvdXJjZX0pIC0gJHtsb29wRGF0YS5sZW5ndGh9IGl0ZXJhdGlvbnNgKTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpdGVySW5kZXggPSAwOyBpdGVySW5kZXggPCBsb29wRGF0YS5sZW5ndGg7IGl0ZXJJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZXJTb3VyY2VSb3cgPSBsb29wRGF0YVtpdGVySW5kZXhdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVyUm93ID0geyAuLi5jdXJyZW50RGF0YVJvdywgLi4uaXRlclNvdXJjZVJvdyB9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRTdGFjayA9IEFycmF5LmlzQXJyYXkoY3VycmVudERhdGFSb3c/Ll9fZDM2NV9sb29wX3N0YWNrKVxuICAgICAgICAgICAgICAgICAgICAgICAgPyBjdXJyZW50RGF0YVJvdy5fX2QzNjVfbG9vcF9zdGFja1xuICAgICAgICAgICAgICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgICAgICAgICAgICAgaXRlclJvdy5fX2QzNjVfbG9vcF9zdGFjayA9IFsuLi5wYXJlbnRTdGFjaywgbG9vcERhdGFTb3VyY2VdO1xuICAgICAgICAgICAgICAgICAgICBpZiAobG9vcERhdGFTb3VyY2UgIT09ICdwcmltYXJ5Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmVudHJpZXMoaXRlclNvdXJjZVJvdykuZm9yRWFjaCgoW2ZpZWxkLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVyUm93W2Ake2xvb3BEYXRhU291cmNlfToke2ZpZWxkfWBdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc1ByaW1hcnlMb29wID0gbG9vcERhdGFTb3VyY2UgPT09ICdwcmltYXJ5JztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG90YWxSb3dzRm9yTG9vcCA9IGlzUHJpbWFyeUxvb3AgPyBvcmlnaW5hbFRvdGFsUm93cyA6IGxvb3BEYXRhLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG90YWxUb1Byb2Nlc3NGb3JMb29wID0gbG9vcERhdGEubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGF5Um93TnVtYmVyID0gaXNQcmltYXJ5TG9vcCA/IHN0YXJ0Um93TnVtYmVyICsgaXRlckluZGV4IDogaXRlckluZGV4O1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BSb3dQcm9ncmVzcyA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBoYXNlOiAncm93U3RhcnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcm93OiBkaXNwbGF5Um93TnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxSb3dzOiB0b3RhbFJvd3NGb3JMb29wLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkUm93czogaXRlckluZGV4ICsgMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsVG9Qcm9jZXNzOiB0b3RhbFRvUHJvY2Vzc0Zvckxvb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGVwOiAnUHJvY2Vzc2luZyByb3cnXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgTG9vcCBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke2xvb3BEYXRhLmxlbmd0aH0gZm9yIGxvb3AgJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31gKTtcbiAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogbG9vcFJvd1Byb2dyZXNzIH0sICcqJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogeyBwaGFzZTogJ2xvb3BJdGVyYXRpb24nLCBpdGVyYXRpb246IGl0ZXJJbmRleCArIDEsIHRvdGFsOiBsb29wRGF0YS5sZW5ndGgsIHN0ZXA6IGBMb29wIFwiJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31cIjogaXRlcmF0aW9uICR7aXRlckluZGV4ICsgMX0vJHtsb29wRGF0YS5sZW5ndGh9YCB9IH0sICcqJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRXhlY3V0ZSBzdGVwcyBpbnNpZGUgdGhlIGxvb3AgKHN1cHBvcnRzIG5lc3RlZCBsb29wcylcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKGlkeCArIDEsIGxvb3BFbmRJZHgsIGl0ZXJSb3cpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdicmVhay1sb29wJykgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVySW5kZXggPSBNYXRoLm1heCgtMSwgaXRlckluZGV4IC0gMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdnb3RvJykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZHggPSBsb29wRW5kSWR4ICsgMTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2xvb3AtZW5kJykge1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlU3RlcFdpdGhIYW5kbGluZyhzdGVwLCBpZHgsIGN1cnJlbnREYXRhUm93KTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ3NraXAnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2dvdG8nKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0SW5kZXggPSBsYWJlbE1hcC5nZXQocmVzdWx0LmxhYmVsKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdvdG8gbGFiZWwgbm90IGZvdW5kOiAke3Jlc3VsdC5sYWJlbCB8fCAnJ31gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldEluZGV4IDwgc3RhcnRJZHggfHwgdGFyZ2V0SW5kZXggPj0gZW5kSWR4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2dvdG8nLCB0YXJnZXRJbmRleCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZHggPSB0YXJnZXRJbmRleDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdyZXBlYXQtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICB9XG5cbiAgICBjb25zdCBmaW5hbFJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVSYW5nZSgwLCBzdGVwcy5sZW5ndGgsIGluaXRpYWxEYXRhUm93KTtcbiAgICBpZiAoZmluYWxSZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IGZpbmFsUmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJyB8fCBmaW5hbFJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9vcCBjb250cm9sIHNpZ25hbCB1c2VkIG91dHNpZGUgb2YgYSBsb29wJyk7XG4gICAgfVxufVxuXG4vLyA9PT09PT0gQWRtaW4gSW5zcGVjdGlvbiBGdW5jdGlvbnMgPT09PT09XG5mdW5jdGlvbiBydW5BZG1pbkluc3BlY3Rpb24oaW5zcGVjdG9yLCBpbnNwZWN0aW9uVHlwZSwgZm9ybU5hbWVQYXJhbSwgZG9jdW1lbnQsIHdpbmRvdykge1xuICAgIHN3aXRjaCAoaW5zcGVjdGlvblR5cGUpIHtcbiAgICAgICAgY2FzZSAnc2NhblBhZ2UnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJFdmVyeXRoaW5nKGRvY3VtZW50LCB3aW5kb3cpO1xuICAgICAgICBjYXNlICdvcGVuRm9ybXMnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJPcGVuRm9ybXMoZG9jdW1lbnQsIHdpbmRvdyk7XG4gICAgICAgIGNhc2UgJ2JhdGNoRGlhbG9nJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyQmF0Y2hEaWFsb2coZG9jdW1lbnQpO1xuICAgICAgICBjYXNlICdyZWN1cnJlbmNlRGlhbG9nJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyUmVjdXJyZW5jZURpYWxvZyhkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2ZpbHRlckRpYWxvZyc6XG4gICAgICAgICAgICByZXR1cm4gYWRtaW5EaXNjb3ZlckZpbHRlckRpYWxvZyhkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2Zvcm1UYWJzJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyVGFicyhkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZVRhYic6XG4gICAgICAgICAgICByZXR1cm4gYWRtaW5EaXNjb3ZlckFjdGl2ZVRhYihkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2FjdGlvblBhbmVUYWJzJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyQWN0aW9uUGFuZVRhYnMoZG9jdW1lbnQpO1xuICAgICAgICBjYXNlICdmb3JtSW5wdXRzJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyRm9ybUlucHV0cyhkb2N1bWVudCwgZm9ybU5hbWVQYXJhbSk7XG4gICAgICAgIGNhc2UgJ2dlbmVyYXRlU3RlcHMnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluR2VuZXJhdGVTdGVwc0ZvclRhYihkb2N1bWVudCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gaW5zcGVjdGlvbiB0eXBlOiAnICsgaW5zcGVjdGlvblR5cGUpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0TWFpbkZvcm0oZG9jdW1lbnQpIHtcbiAgICBjb25zdCBmb3JtcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XG4gICAgbGV0IG1haW5Gb3JtID0gbnVsbDtcbiAgICBmb3Jtcy5mb3JFYWNoKGYgPT4ge1xuICAgICAgICBjb25zdCBuYW1lID0gZi5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xuICAgICAgICBpZiAobmFtZSAhPT0gJ0RlZmF1bHREYXNoYm9hcmQnICYmIGYub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XG4gICAgICAgICAgICBtYWluRm9ybSA9IGY7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gbWFpbkZvcm07XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJPcGVuRm9ybXMoZG9jdW1lbnQsIHdpbmRvdykge1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7XG4gICAgICAgIGN1cnJlbnRVcmw6IHtcbiAgICAgICAgICAgIGZ1bGw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgICAgICAgbWVudUl0ZW06IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdtaScpLFxuICAgICAgICAgICAgY29tcGFueTogbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoJ2NtcCcpXG4gICAgICAgIH0sXG4gICAgICAgIGZvcm1zOiBbXSxcbiAgICAgICAgZGlhbG9nU3RhY2s6IFtdXG4gICAgfTtcblxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGNvbnN0IGZvcm1OYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcbiAgICAgICAgY29uc3QgaXNEaWFsb2cgPSBlbC5jbG9zZXN0KCcuZGlhbG9nLWNvbnRhaW5lcicpICE9PSBudWxsIHx8XG4gICAgICAgICAgICBmb3JtTmFtZS5pbmNsdWRlcygnRGlhbG9nJykgfHwgZm9ybU5hbWUuaW5jbHVkZXMoJ0Zvcm0nKSB8fFxuICAgICAgICAgICAgZm9ybU5hbWUgPT09ICdTeXNSZWN1cnJlbmNlJyB8fCBmb3JtTmFtZSA9PT0gJ1N5c1F1ZXJ5Rm9ybSc7XG4gICAgICAgIGNvbnN0IGlzVmlzaWJsZSA9IGVsLm9mZnNldFBhcmVudCAhPT0gbnVsbDtcblxuICAgICAgICByZXN1bHRzLmZvcm1zLnB1c2goeyBmb3JtTmFtZSwgaXNEaWFsb2csIGlzVmlzaWJsZSB9KTtcbiAgICAgICAgaWYgKGlzRGlhbG9nICYmIGlzVmlzaWJsZSkge1xuICAgICAgICAgICAgcmVzdWx0cy5kaWFsb2dTdGFjay5wdXNoKGZvcm1OYW1lKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJlc3VsdHMuZGlhbG9nU3RhY2sucmV2ZXJzZSgpO1xuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyQmF0Y2hEaWFsb2coZG9jdW1lbnQpIHtcbiAgICBjb25zdCByZXN1bHRzID0ge1xuICAgICAgICBkaWFsb2dGb3VuZDogZmFsc2UsIGZvcm1OYW1lOiBudWxsLFxuICAgICAgICBhbGxDb250cm9sczogW10sIGlucHV0RmllbGRzOiBbXSwgY2hlY2tib3hlczogW10sIGNvbWJvYm94ZXM6IFtdLCBidXR0b25zOiBbXSwgZ3JvdXBzOiBbXSwgdG9nZ2xlczogW11cbiAgICB9O1xuXG4gICAgY29uc3QgZGlhbG9nRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cIl0nKSB8fFxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lKj1cIkRpYWxvZ1wiXScpIHx8XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5kaWFsb2ctY29udGVudCBbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xuXG4gICAgaWYgKCFkaWFsb2dGb3JtKSByZXR1cm4gcmVzdWx0cztcblxuICAgIHJlc3VsdHMuZGlhbG9nRm91bmQgPSB0cnVlO1xuICAgIHJlc3VsdHMuZm9ybU5hbWUgPSBkaWFsb2dGb3JtLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XG5cbiAgICBkaWFsb2dGb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgY29uc3QgaW5mbyA9IHtcbiAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXG4gICAgICAgICAgICByb2xlOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSxcbiAgICAgICAgICAgIGNvbnRyb2xUeXBlOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2x0eXBlJyksXG4gICAgICAgICAgICBsYWJlbDogZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJylcbiAgICAgICAgfTtcbiAgICAgICAgcmVzdWx0cy5hbGxDb250cm9scy5wdXNoKGluZm8pO1xuICAgICAgICBjb25zdCByb2xlID0gKGluZm8ucm9sZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgaWYgKHJvbGUuaW5jbHVkZXMoJ2lucHV0JykgfHwgcm9sZSA9PT0gJ3N0cmluZycgfHwgcm9sZSA9PT0gJ2ludGVnZXInIHx8IHJvbGUgPT09ICdyZWFsJykgcmVzdWx0cy5pbnB1dEZpZWxkcy5wdXNoKGluZm8pO1xuICAgICAgICBlbHNlIGlmIChyb2xlLmluY2x1ZGVzKCdjaGVja2JveCcpIHx8IHJvbGUgPT09ICd5ZXNubycpIHJlc3VsdHMuY2hlY2tib3hlcy5wdXNoKGluZm8pO1xuICAgICAgICBlbHNlIGlmIChyb2xlLmluY2x1ZGVzKCdjb21ib2JveCcpIHx8IHJvbGUgPT09ICdkcm9wZG93bicpIHJlc3VsdHMuY29tYm9ib3hlcy5wdXNoKGluZm8pO1xuICAgICAgICBlbHNlIGlmIChyb2xlLmluY2x1ZGVzKCdidXR0b24nKSkgcmVzdWx0cy5idXR0b25zLnB1c2goaW5mbyk7XG4gICAgICAgIGVsc2UgaWYgKHJvbGUgPT09ICdncm91cCcpIHJlc3VsdHMuZ3JvdXBzLnB1c2goaW5mbyk7XG4gICAgfSk7XG5cbiAgICBkaWFsb2dGb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJy50b2dnbGUsIFtyb2xlPVwic3dpdGNoXCJdLCBpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xuICAgICAgICBpZiAoY29udGFpbmVyKSB7XG4gICAgICAgICAgICByZXN1bHRzLnRvZ2dsZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXG4gICAgICAgICAgICAgICAgcm9sZTogY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpLFxuICAgICAgICAgICAgICAgIGxhYmVsOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKSxcbiAgICAgICAgICAgICAgICBpc0NoZWNrZWQ6IGVsLmNoZWNrZWQgfHwgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyUmVjdXJyZW5jZURpYWxvZyhkb2N1bWVudCkge1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7XG4gICAgICAgIGRpYWxvZ0ZvdW5kOiBmYWxzZSwgZm9ybU5hbWU6ICdTeXNSZWN1cnJlbmNlJyxcbiAgICAgICAgc3RhcnREYXRlVGltZToge30sIGVuZE9wdGlvbnM6IHt9LCBwYXR0ZXJuOiB7fSwgYnV0dG9uczogW10sIGFsbENvbnRyb2xzOiBbXVxuICAgIH07XG4gICAgY29uc3QgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XG4gICAgaWYgKCFmb3JtKSByZXR1cm4gcmVzdWx0cztcbiAgICByZXN1bHRzLmRpYWxvZ0ZvdW5kID0gdHJ1ZTtcblxuICAgIGZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgY29uc3Qgcm9sZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xuICAgICAgICBjb25zdCBsYWJlbCA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKCkgfHwgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG4gICAgICAgIGNvbnN0IGluZm8gPSB7IGNvbnRyb2xOYW1lLCByb2xlLCBsYWJlbCB9O1xuICAgICAgICByZXN1bHRzLmFsbENvbnRyb2xzLnB1c2goaW5mbyk7XG5cbiAgICAgICAgY29uc3QgbmFtZUxvd2VyID0gKGNvbnRyb2xOYW1lIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAobmFtZUxvd2VyID09PSAnc3RhcnRkYXRlJykgcmVzdWx0cy5zdGFydERhdGVUaW1lLnN0YXJ0RGF0ZSA9IGluZm87XG4gICAgICAgIGVsc2UgaWYgKG5hbWVMb3dlciA9PT0gJ3N0YXJ0dGltZScpIHJlc3VsdHMuc3RhcnREYXRlVGltZS5zdGFydFRpbWUgPSBpbmZvO1xuICAgICAgICBlbHNlIGlmIChuYW1lTG93ZXIgPT09ICd0aW1lem9uZScpIHJlc3VsdHMuc3RhcnREYXRlVGltZS50aW1lem9uZSA9IGluZm87XG4gICAgICAgIGVsc2UgaWYgKG5hbWVMb3dlciA9PT0gJ2VuZGRhdGVpbnQnKSByZXN1bHRzLmVuZE9wdGlvbnMuY291bnQgPSBpbmZvO1xuICAgICAgICBlbHNlIGlmIChuYW1lTG93ZXIgPT09ICdlbmRkYXRlZGF0ZScpIHJlc3VsdHMuZW5kT3B0aW9ucy5lbmREYXRlID0gaW5mbztcbiAgICAgICAgZWxzZSBpZiAobmFtZUxvd2VyID09PSAncGF0dGVybnVuaXQnKSByZXN1bHRzLnBhdHRlcm4udW5pdCA9IGluZm87XG4gICAgICAgIGVsc2UgaWYgKHJvbGUgPT09ICdDb21tYW5kQnV0dG9uJykgcmVzdWx0cy5idXR0b25zLnB1c2goaW5mbyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJGaWx0ZXJEaWFsb2coZG9jdW1lbnQpIHtcbiAgICBjb25zdCByZXN1bHRzID0ge1xuICAgICAgICBkaWFsb2dGb3VuZDogZmFsc2UsIGZvcm1OYW1lOiAnU3lzUXVlcnlGb3JtJyxcbiAgICAgICAgdGFiczogW10sIGdyaWRJbmZvOiB7fSwgc2F2ZWRRdWVyaWVzOiBudWxsLCBidXR0b25zOiBbXSwgY2hlY2tib3hlczogW10sIGFsbENvbnRyb2xzOiBbXVxuICAgIH07XG4gICAgY29uc3QgcXVlcnlGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpO1xuICAgIGlmICghcXVlcnlGb3JtKSByZXR1cm4gcmVzdWx0cztcbiAgICByZXN1bHRzLmRpYWxvZ0ZvdW5kID0gdHJ1ZTtcblxuICAgIHF1ZXJ5Rm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIlBpdm90SXRlbVwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICByZXN1bHRzLnRhYnMucHVzaCh7XG4gICAgICAgICAgICBjb250cm9sTmFtZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpLFxuICAgICAgICAgICAgbGFiZWw6IGVsLnRleHRDb250ZW50Py50cmltKCkuc3BsaXQoJ1xcbicpWzBdLFxuICAgICAgICAgICAgaXNWaXNpYmxlOiBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGxcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncmlkID0gcXVlcnlGb3JtLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlR3JpZFwiXScpO1xuICAgIGlmIChncmlkKSB7XG4gICAgICAgIHJlc3VsdHMuZ3JpZEluZm8gPSB7IGNvbnRyb2xOYW1lOiAnUmFuZ2VHcmlkJywgcm9sZTogZ3JpZC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSB9O1xuICAgIH1cblxuICAgIHF1ZXJ5Rm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICBjb25zdCByb2xlID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKTtcbiAgICAgICAgY29uc3QgaW5mbyA9IHsgY29udHJvbE5hbWUsIHJvbGUsIGxhYmVsIH07XG4gICAgICAgIHJlc3VsdHMuYWxsQ29udHJvbHMucHVzaChpbmZvKTtcbiAgICAgICAgaWYgKGNvbnRyb2xOYW1lID09PSAnU2F2ZWRRdWVyaWVzQm94JykgcmVzdWx0cy5zYXZlZFF1ZXJpZXMgPSBpbmZvO1xuICAgICAgICBlbHNlIGlmIChyb2xlID09PSAnQ29tbWFuZEJ1dHRvbicgfHwgcm9sZSA9PT0gJ0J1dHRvbicpIHJlc3VsdHMuYnV0dG9ucy5wdXNoKGluZm8pO1xuICAgICAgICBlbHNlIGlmIChyb2xlID09PSAnQ2hlY2tCb3gnKSByZXN1bHRzLmNoZWNrYm94ZXMucHVzaChpbmZvKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3ZlclRhYnMoZG9jdW1lbnQpIHtcbiAgICBjb25zdCByZXN1bHRzID0geyBmb3JtTmFtZTogbnVsbCwgYWN0aXZlVGFiOiBudWxsLCB0YWJzOiBbXSB9O1xuICAgIGNvbnN0IG1haW5Gb3JtID0gZ2V0TWFpbkZvcm0oZG9jdW1lbnQpO1xuICAgIGlmICghbWFpbkZvcm0pIHJldHVybiByZXN1bHRzO1xuICAgIHJlc3VsdHMuZm9ybU5hbWUgPSBtYWluRm9ybS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xuXG4gICAgbWFpbkZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJQaXZvdEl0ZW1cIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgIGNvbnN0IGlzQWN0aXZlID0gZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnO1xuICAgICAgICBjb25zdCBoZWFkZXJFbCA9IG1haW5Gb3JtLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9X2hlYWRlclwiXWApO1xuICAgICAgICBjb25zdCBsYWJlbCA9IGhlYWRlckVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8XG4gICAgICAgICAgICBlbC5xdWVyeVNlbGVjdG9yKCcucGl2b3QtbGluay10ZXh0Jyk/LnRleHRDb250ZW50Py50cmltKCkgfHxcbiAgICAgICAgICAgIGVsLnRleHRDb250ZW50Py50cmltKCkuc3BsaXQoJ1xcbicpWzBdO1xuXG4gICAgICAgIHJlc3VsdHMudGFicy5wdXNoKHsgY29udHJvbE5hbWUsIGxhYmVsOiAobGFiZWwgfHwgJycpLnN1YnN0cmluZygwLCA1MCksIGlzQWN0aXZlIH0pO1xuICAgICAgICBpZiAoaXNBY3RpdmUpIHJlc3VsdHMuYWN0aXZlVGFiID0gY29udHJvbE5hbWU7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJBY3RpdmVUYWIoZG9jdW1lbnQpIHtcbiAgICBjb25zdCByZXN1bHRzID0ge1xuICAgICAgICBmb3JtTmFtZTogbnVsbCwgYWN0aXZlVGFiOiBudWxsLCBzZWN0aW9uczogW10sXG4gICAgICAgIGZpZWxkczogeyBpbnB1dHM6IFtdLCBjaGVja2JveGVzOiBbXSwgY29tYm9ib3hlczogW10sIGludGVnZXJzOiBbXSwgZGF0ZXM6IFtdIH0sXG4gICAgICAgIHN1bW1hcnk6IHt9XG4gICAgfTtcbiAgICBjb25zdCBtYWluRm9ybSA9IGdldE1haW5Gb3JtKGRvY3VtZW50KTtcbiAgICBpZiAoIW1haW5Gb3JtKSByZXR1cm4gcmVzdWx0cztcbiAgICByZXN1bHRzLmZvcm1OYW1lID0gbWFpbkZvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcblxuICAgIGNvbnN0IGFjdGl2ZVRhYkVsID0gbWFpbkZvcm0ucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXJvbGU9XCJQaXZvdEl0ZW1cIl0uYWN0aXZlLCBbZGF0YS1keW4tcm9sZT1cIlBpdm90SXRlbVwiXVthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXScpO1xuICAgIGlmIChhY3RpdmVUYWJFbCkgcmVzdWx0cy5hY3RpdmVUYWIgPSBhY3RpdmVUYWJFbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG5cbiAgICBtYWluRm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlXCJdLCBbZGF0YS1keW4tcm9sZT1cIlRhYlBhZ2VcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgaWYgKGVsLm9mZnNldFBhcmVudCA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgaWYgKCFjb250cm9sTmFtZSB8fCAvXlxcZCskLy50ZXN0KGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xuICAgICAgICBjb25zdCBoZWFkZXJFbCA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0sIC5zZWN0aW9uLWhlYWRlcicpO1xuICAgICAgICBjb25zdCBsYWJlbCA9IGhlYWRlckVsPy50ZXh0Q29udGVudD8udHJpbSgpPy5zcGxpdCgnXFxuJylbMF07XG4gICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSAhZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKSAmJiBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSAhPT0gJ2ZhbHNlJztcbiAgICAgICAgcmVzdWx0cy5zZWN0aW9ucy5wdXNoKHsgY29udHJvbE5hbWUsIGxhYmVsOiAobGFiZWwgfHwgJycpLnN1YnN0cmluZygwLCA1MCksIGlzRXhwYW5kZWQgfSk7XG4gICAgfSk7XG5cbiAgICBtYWluRm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGlmIChlbC5vZmZzZXRQYXJlbnQgPT09IG51bGwpIHJldHVybjtcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgIGNvbnN0IHJvbGUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuICAgICAgICBpZiAoIXJvbGUgfHwgIWNvbnRyb2xOYW1lIHx8IC9eXFxkKyQvLnRlc3QoY29udHJvbE5hbWUpKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGluZm8gPSB7IGNvbnRyb2xOYW1lLCBsYWJlbDogKGxhYmVsIHx8ICcnKS5zdWJzdHJpbmcoMCwgNDApIH07XG5cbiAgICAgICAgc3dpdGNoIChyb2xlKSB7XG4gICAgICAgICAgICBjYXNlICdJbnB1dCc6IGNhc2UgJ1N0cmluZyc6IHJlc3VsdHMuZmllbGRzLmlucHV0cy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0NoZWNrQm94JzogY2FzZSAnWWVzTm8nOiByZXN1bHRzLmZpZWxkcy5jaGVja2JveGVzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnQ29tYm9Cb3gnOiBjYXNlICdEcm9wZG93bkxpc3QnOiByZXN1bHRzLmZpZWxkcy5jb21ib2JveGVzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnSW50ZWdlcic6IGNhc2UgJ1JlYWwnOiByZXN1bHRzLmZpZWxkcy5pbnRlZ2Vycy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0RhdGUnOiBjYXNlICdUaW1lJzogcmVzdWx0cy5maWVsZHMuZGF0ZXMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJlc3VsdHMuc3VtbWFyeSA9IHtcbiAgICAgICAgc2VjdGlvbnM6IHJlc3VsdHMuc2VjdGlvbnMubGVuZ3RoLFxuICAgICAgICBpbnB1dHM6IHJlc3VsdHMuZmllbGRzLmlucHV0cy5sZW5ndGgsXG4gICAgICAgIGNoZWNrYm94ZXM6IHJlc3VsdHMuZmllbGRzLmNoZWNrYm94ZXMubGVuZ3RoLFxuICAgICAgICBjb21ib2JveGVzOiByZXN1bHRzLmZpZWxkcy5jb21ib2JveGVzLmxlbmd0aCxcbiAgICAgICAgaW50ZWdlcnM6IHJlc3VsdHMuZmllbGRzLmludGVnZXJzLmxlbmd0aCxcbiAgICAgICAgZGF0ZXM6IHJlc3VsdHMuZmllbGRzLmRhdGVzLmxlbmd0aFxuICAgIH07XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJBY3Rpb25QYW5lVGFicyhkb2N1bWVudCkge1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7IGZvcm1OYW1lOiBudWxsLCBhY3RpdmVUYWI6IG51bGwsIHRhYnM6IFtdIH07XG4gICAgY29uc3QgbWFpbkZvcm0gPSBnZXRNYWluRm9ybShkb2N1bWVudCk7XG4gICAgaWYgKG1haW5Gb3JtKSByZXN1bHRzLmZvcm1OYW1lID0gbWFpbkZvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcblxuICAgIC8vIE1ldGhvZCAxOiByb2xlPVwidGFiXCIgb3V0c2lkZSBkaWFsb2dzXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJ0YWJcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgaWYgKGVsLmNsb3Nlc3QoJy5kaWFsb2ctY29udGVudCwgW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICBjb25zdCBsYWJlbCA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGVsLnRleHRDb250ZW50Py50cmltKCk7XG4gICAgICAgIGlmICghY29udHJvbE5hbWUgJiYgIWxhYmVsKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGlzQWN0aXZlID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fCBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpO1xuICAgICAgICBjb25zdCB0YWJJbmZvID0geyBjb250cm9sTmFtZTogY29udHJvbE5hbWUgfHwgKGxhYmVsIHx8ICcnKS5yZXBsYWNlKC9cXHMrL2csICcnKSwgbGFiZWwsIGlzQWN0aXZlIH07XG4gICAgICAgIGlmICghcmVzdWx0cy50YWJzLnNvbWUodCA9PiB0LmNvbnRyb2xOYW1lID09PSB0YWJJbmZvLmNvbnRyb2xOYW1lKSkge1xuICAgICAgICAgICAgcmVzdWx0cy50YWJzLnB1c2godGFiSW5mbyk7XG4gICAgICAgICAgICBpZiAoaXNBY3RpdmUpIHJlc3VsdHMuYWN0aXZlVGFiID0gdGFiSW5mby5jb250cm9sTmFtZTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTWV0aG9kIDI6IHRhYmxpc3RcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cInRhYmxpc3RcIl0nKS5mb3JFYWNoKHRhYmxpc3QgPT4ge1xuICAgICAgICBpZiAodGFibGlzdC5jbG9zZXN0KCcuZGlhbG9nLWNvbnRlbnQnKSkgcmV0dXJuO1xuICAgICAgICB0YWJsaXN0LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwidGFiXCJdLCBidXR0b24sIFtkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBlbC50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSAmJiAhbGFiZWwpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLnRhYnMuc29tZSh0ID0+IHQuY29udHJvbE5hbWUgPT09IChjb250cm9sTmFtZSB8fCBsYWJlbCkpKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHwgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIGNvbnN0IHRhYkluZm8gPSB7IGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSB8fCBsYWJlbCwgbGFiZWwsIGlzQWN0aXZlIH07XG4gICAgICAgICAgICByZXN1bHRzLnRhYnMucHVzaCh0YWJJbmZvKTtcbiAgICAgICAgICAgIGlmIChpc0FjdGl2ZSkgcmVzdWx0cy5hY3RpdmVUYWIgPSB0YWJJbmZvLmNvbnRyb2xOYW1lO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyRm9ybUlucHV0cyhkb2N1bWVudCwgZm9ybU5hbWUpIHtcbiAgICBjb25zdCBmb3JtID0gZm9ybU5hbWVcbiAgICAgICAgPyBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tZm9ybS1uYW1lPVwiJHtmb3JtTmFtZX1cIl1gKVxuICAgICAgICA6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdOmxhc3Qtb2YtdHlwZScpO1xuXG4gICAgaWYgKCFmb3JtKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGFjdHVhbEZvcm1OYW1lID0gZm9ybS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7XG4gICAgICAgIGZvcm1OYW1lOiBhY3R1YWxGb3JtTmFtZSxcbiAgICAgICAgaW5wdXRzOiBbXSwgY2hlY2tib3hlczogW10sIGNvbWJvYm94ZXM6IFtdLCByYWRpb0J1dHRvbnM6IFtdLFxuICAgICAgICBkYXRlRmllbGRzOiBbXSwgdGltZUZpZWxkczogW10sIGludGVnZXJGaWVsZHM6IFtdLCBzdHJpbmdGaWVsZHM6IFtdXG4gICAgfTtcblxuICAgIGZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBjb25zdCByb2xlID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICBjb25zdCBsYWJlbCA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKCkgfHwgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgZWwuZ2V0QXR0cmlidXRlKCd0aXRsZScpO1xuICAgICAgICBpZiAoIXJvbGUpIHJldHVybjtcbiAgICAgICAgY29uc3QgaW5mbyA9IHsgY29udHJvbE5hbWUsIHJvbGUsIGxhYmVsIH07XG4gICAgICAgIHJlc3VsdHMuaW5wdXRzLnB1c2goaW5mbyk7XG5cbiAgICAgICAgc3dpdGNoIChyb2xlKSB7XG4gICAgICAgICAgICBjYXNlICdDaGVja0JveCc6IGNhc2UgJ1llc05vJzogcmVzdWx0cy5jaGVja2JveGVzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnQ29tYm9Cb3gnOiBjYXNlICdEcm9wZG93bkxpc3QnOiByZXN1bHRzLmNvbWJvYm94ZXMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdSYWRpb0J1dHRvbic6IHJlc3VsdHMucmFkaW9CdXR0b25zLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnRGF0ZSc6IHJlc3VsdHMuZGF0ZUZpZWxkcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ1RpbWUnOiByZXN1bHRzLnRpbWVGaWVsZHMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdJbnRlZ2VyJzogY2FzZSAnUmVhbCc6IHJlc3VsdHMuaW50ZWdlckZpZWxkcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ1N0cmluZyc6IGNhc2UgJ0lucHV0JzogcmVzdWx0cy5zdHJpbmdGaWVsZHMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyRXZlcnl0aGluZyhkb2N1bWVudCwgd2luZG93KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IHtcbiAgICAgICAgdXJsOiB7XG4gICAgICAgICAgICBmdWxsOiB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgICAgICAgIG1lbnVJdGVtOiBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldCgnbWknKSxcbiAgICAgICAgICAgIGNvbXBhbnk6IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdjbXAnKVxuICAgICAgICB9LFxuICAgICAgICBmb3JtczogW10sXG4gICAgICAgIGJ5Rm9ybToge31cbiAgICB9O1xuXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWZvcm0tbmFtZV0nKS5mb3JFYWNoKGZvcm1FbCA9PiB7XG4gICAgICAgIGNvbnN0IGZvcm1OYW1lID0gZm9ybUVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XG4gICAgICAgIGNvbnN0IGlzVmlzaWJsZSA9IGZvcm1FbC5vZmZzZXRQYXJlbnQgIT09IG51bGw7XG4gICAgICAgIHJlc3VsdHMuZm9ybXMucHVzaCh7IGZvcm1OYW1lLCBpc1Zpc2libGUgfSk7XG4gICAgICAgIGlmICghaXNWaXNpYmxlKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgZm9ybURhdGEgPSB7IHRhYnM6IFtdLCBzZWN0aW9uczogW10sIGJ1dHRvbnM6IFtdLCBpbnB1dHM6IFtdLCBncmlkczogW10gfTtcblxuICAgICAgICBmb3JtRWwucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJQaXZvdEl0ZW1cIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGZvcm1EYXRhLnRhYnMucHVzaCh7XG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSxcbiAgICAgICAgICAgICAgICBsYWJlbDogZWwudGV4dENvbnRlbnQ/LnRyaW0oKS5zcGxpdCgnXFxuJylbMF1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBmb3JtRWwucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJHcm91cFwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICBpZiAoY29udHJvbE5hbWUgJiYgIS9eXFxkKyQvLnRlc3QoY29udHJvbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgZm9ybURhdGEuc2VjdGlvbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lLFxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogZWwucXVlcnlTZWxlY3RvcignbGFiZWwsIC5zZWN0aW9uLWhlYWRlcicpPy50ZXh0Q29udGVudD8udHJpbSgpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZvcm1FbC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZSo9XCJCdXR0b25cIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgaWYgKGNvbnRyb2xOYW1lICYmICEvXlxcZCskLy50ZXN0KGNvbnRyb2xOYW1lKSAmJiAhY29udHJvbE5hbWUuaW5jbHVkZXMoJ0NsZWFyJykpIHtcbiAgICAgICAgICAgICAgICBmb3JtRGF0YS5idXR0b25zLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcm9sZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiBlbC50ZXh0Q29udGVudD8udHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKS5zdWJzdHJpbmcoMCwgNTApXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGlucHV0Um9sZXMgPSBbJ0lucHV0JywgJ1N0cmluZycsICdJbnRlZ2VyJywgJ1JlYWwnLCAnRGF0ZScsICdUaW1lJywgJ0NoZWNrQm94JywgJ1llc05vJywgJ0NvbWJvQm94JywgJ1JhZGlvQnV0dG9uJ107XG4gICAgICAgIGlucHV0Um9sZXMuZm9yRWFjaChyb2xlID0+IHtcbiAgICAgICAgICAgIGZvcm1FbC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tcm9sZT1cIiR7cm9sZX1cIl1gKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgICAgICBpZiAoY29udHJvbE5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9ybURhdGEuaW5wdXRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUsIHJvbGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbDogZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZm9ybUVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXSwgW2RhdGEtZHluLXJvbGU9XCJSZWFjdExpc3RcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGZvcm1EYXRhLmdyaWRzLnB1c2goe1xuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXG4gICAgICAgICAgICAgICAgcm9sZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJylcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXN1bHRzLmJ5Rm9ybVtmb3JtTmFtZV0gPSBmb3JtRGF0YTtcbiAgICB9KTtcblxuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkdlbmVyYXRlU3RlcHNGb3JUYWIoZG9jdW1lbnQpIHtcbiAgICBjb25zdCB0YWJEYXRhID0gYWRtaW5EaXNjb3ZlckFjdGl2ZVRhYihkb2N1bWVudCk7XG4gICAgaWYgKCF0YWJEYXRhLmFjdGl2ZVRhYikgcmV0dXJuIHsgYWN0aXZlVGFiOiBudWxsLCBzdGVwczogW10gfTtcblxuICAgIGNvbnN0IHN0ZXBzID0gW107XG4gICAgc3RlcHMucHVzaCh7IHR5cGU6ICd0YWItbmF2aWdhdGUnLCBjb250cm9sTmFtZTogdGFiRGF0YS5hY3RpdmVUYWIsIGRpc3BsYXlUZXh0OiBgU3dpdGNoIHRvICR7dGFiRGF0YS5hY3RpdmVUYWJ9IHRhYmAsIHZhbHVlOiAnJyB9KTtcblxuICAgIHRhYkRhdGEuZmllbGRzLmlucHV0cy5mb3JFYWNoKGYgPT4ge1xuICAgICAgICBzdGVwcy5wdXNoKHsgdHlwZTogJ2lucHV0JywgY29udHJvbE5hbWU6IGYuY29udHJvbE5hbWUsIHZhbHVlOiAnJywgZGlzcGxheVRleHQ6IGYubGFiZWwgfHwgZi5jb250cm9sTmFtZSB9KTtcbiAgICB9KTtcbiAgICB0YWJEYXRhLmZpZWxkcy5jaGVja2JveGVzLmZvckVhY2goZiA9PiB7XG4gICAgICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAnY2hlY2tib3gnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICd0cnVlJywgZGlzcGxheVRleHQ6IGYubGFiZWwgfHwgZi5jb250cm9sTmFtZSB9KTtcbiAgICB9KTtcbiAgICB0YWJEYXRhLmZpZWxkcy5jb21ib2JveGVzLmZvckVhY2goZiA9PiB7XG4gICAgICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAnc2VsZWN0JywgY29udHJvbE5hbWU6IGYuY29udHJvbE5hbWUsIHZhbHVlOiAnJywgZGlzcGxheVRleHQ6IGYubGFiZWwgfHwgZi5jb250cm9sTmFtZSB9KTtcbiAgICB9KTtcbiAgICB0YWJEYXRhLmZpZWxkcy5pbnRlZ2Vycy5mb3JFYWNoKGYgPT4ge1xuICAgICAgICBzdGVwcy5wdXNoKHsgdHlwZTogJ2lucHV0JywgY29udHJvbE5hbWU6IGYuY29udHJvbE5hbWUsIHZhbHVlOiAnJywgZGlzcGxheVRleHQ6IGYubGFiZWwgfHwgZi5jb250cm9sTmFtZSB9KTtcbiAgICB9KTtcbiAgICB0YWJEYXRhLmZpZWxkcy5kYXRlcy5mb3JFYWNoKGYgPT4ge1xuICAgICAgICBzdGVwcy5wdXNoKHsgdHlwZTogJ2lucHV0JywgY29udHJvbE5hbWU6IGYuY29udHJvbE5hbWUsIHZhbHVlOiAnJywgZGlzcGxheVRleHQ6IGYubGFiZWwgfHwgZi5jb250cm9sTmFtZSB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiB7IGFjdGl2ZVRhYjogdGFiRGF0YS5hY3RpdmVUYWIsIHN0ZXBzIH07XG59XG5cbiAgICByZXR1cm4geyBzdGFydGVkOiB0cnVlIH07XG59XG5cbmlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgc3RhcnRJbmplY3RlZCh7IHdpbmRvd09iajogd2luZG93LCBkb2N1bWVudE9iajogZG9jdW1lbnQgfSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUVBLE1BQXFCLGdCQUFyQixNQUFtQztBQUFBLElBQy9CLGNBQWM7QUFDVixXQUFLLGVBQWU7QUFDcEIsV0FBSyxtQkFBbUI7QUFDeEIsV0FBSyxVQUFVO0FBQUEsSUFDbkI7QUFBQTtBQUFBLElBR0EsbUJBQW1CLFNBQVM7QUFFeEIsWUFBTSxnQkFBZ0IsUUFBUSxRQUFRLHNCQUFzQjtBQUM1RCxVQUFJLGVBQWU7QUFDZixlQUFPLGNBQWMsYUFBYSxvQkFBb0I7QUFBQSxNQUMxRDtBQUdBLFlBQU0sY0FBYyxRQUFRLFFBQVEsd0JBQXdCO0FBQzVELFVBQUksYUFBYTtBQUNiLGVBQU8sWUFBWSxhQUFhLHNCQUFzQixLQUFLLFlBQVksYUFBYSxvQkFBb0I7QUFBQSxNQUM1RztBQUdBLFlBQU0sWUFBWSxRQUFRLFFBQVEsNkRBQTZEO0FBQy9GLFVBQUksV0FBVztBQUNYLGNBQU0sZ0JBQWdCLFVBQVUsYUFBYSxzQkFBc0I7QUFDbkUsWUFBSTtBQUFlLGlCQUFPO0FBQUEsTUFDOUI7QUFHQSxZQUFNLFNBQVMsUUFBUSxRQUFRLDZEQUE2RDtBQUM1RixVQUFJLFFBQVE7QUFDUixjQUFNLGFBQWEsT0FBTyxhQUFhLHNCQUFzQixLQUMxQyxPQUFPLGNBQWMsc0JBQXNCLEdBQUcsYUFBYSxvQkFBb0I7QUFDbEcsWUFBSTtBQUFZLGlCQUFPO0FBQUEsTUFDM0I7QUFHQSxVQUFJLFVBQVU7QUFDZCxhQUFPLFdBQVcsWUFBWSxTQUFTLE1BQU07QUFDekMsY0FBTSxX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
