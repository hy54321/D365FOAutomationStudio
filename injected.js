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
        for (const cell of cells) {
          const isInHeader = cell.closest(".fixedDataTableLayout_header, .dyn-headerCell");
          if (!isInHeader && cell.offsetParent !== null) {
            return cell;
          }
        }
      }
    }
    const grids = document.querySelectorAll('[data-dyn-role="Grid"]');
    for (const grid of grids) {
      const cells = grid.querySelectorAll(`[data-dyn-controlname="${controlName}"]`);
      for (const cell of cells) {
        const isInHeader = cell.closest('[data-dyn-role="ColumnHeader"], [role="columnheader"], thead');
        if (!isInHeader && cell.offsetParent !== null) {
          return cell;
        }
      }
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
    const lastUnderscoreIdx = controlName.lastIndexOf("_");
    const gridName = controlName.substring(0, lastUnderscoreIdx);
    const columnName = controlName.substring(lastUnderscoreIdx + 1);
    console.log(`  Grid: ${gridName}, Column: ${columnName}`);
    async function findFilterInput() {
      const filterFieldPatterns = [
        `FilterField_${gridName}_${columnName}_${columnName}_Input_0`,
        `FilterField_${controlName}_${columnName}_Input_0`,
        `FilterField_${controlName}_Input_0`,
        `FilterField_${gridName}_${columnName}_Input_0`,
        // Additional patterns for different D365 versions
        `${controlName}_FilterField_Input`,
        `${gridName}_${columnName}_FilterField`
      ];
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
    const applyBtnPatterns = [
      `${gridName}_${columnName}_ApplyFilters`,
      // Most common: GridReadOnlyMarkupTable_MarkupCode_ApplyFilters
      `${controlName}_ApplyFilters`,
      `${gridName}_ApplyFilters`,
      `ApplyFilters`
    ];
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
    const methodMappings = {
      "is exactly": ["is exactly", "equals", "is equal to", "="],
      "contains": ["contains", "like"],
      "begins with": ["begins with", "starts with"],
      "is not": ["is not", "not equal", "!=", "<>"],
      "does not contain": ["does not contain", "not like"],
      "is one of": ["is one of", "in"],
      "after": ["after", "greater than", ">"],
      "before": ["before", "less than", "<"],
      "matches": ["matches", "regex", "pattern"]
    };
    const searchTerms = methodMappings[method] || [method];
    const options = document.querySelectorAll('[role="option"], [role="listitem"], .dyn-listView-item');
    for (const opt of options) {
      const text = opt.textContent.toLowerCase();
      for (const term of searchTerms) {
        if (text.includes(term.toLowerCase())) {
          opt.click();
          await sleep(200);
          console.log(`  Set filter method: ${method}`);
          return;
        }
      }
    }
    const selectEl = operatorDropdown.querySelector("select");
    if (selectEl) {
      for (const opt of selectEl.options) {
        const text = opt.textContent.toLowerCase();
        for (const term of searchTerms) {
          if (text.includes(term.toLowerCase())) {
            selectEl.value = opt.value;
            selectEl.dispatchEvent(new Event("change", { bubbles: true }));
            await sleep(200);
            console.log(`  Set filter method: ${method}`);
            return;
          }
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
      runOptions: {
        skipRows: 0,
        limitRows: 0,
        dryRun: false
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
    async function checkExecutionControl() {
      if (executionControl.isStopped) {
        throw new Error("Workflow stopped by user");
      }
      while (executionControl.isPaused) {
        await sleep(200);
        if (executionControl.isStopped) {
          throw new Error("Workflow stopped by user");
        }
      }
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
        executionControl.runOptions = workflow.runOptions || { skipRows: 0, limitRows: 0, dryRun: false };
        executionControl.stepIndexOffset = workflow?._originalStartIndex || 0;
        executionControl.currentStepIndex = executionControl.stepIndexOffset;
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
    function evaluateCondition(step, currentRow) {
      const type = step?.conditionType || "ui-visible";
      if (type.startsWith("ui-")) {
        const controlName = step?.conditionControlName || step?.controlName || "";
        const element = controlName ? findElementInActiveContext(controlName) : null;
        switch (type) {
          case "ui-visible":
            return !!element && isElementVisible(element);
          case "ui-hidden":
            return !element || !isElementVisible(element);
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
    async function executeSingleStep(step, stepIndex, currentRow, detailSources, settings, dryRun) {
      executionControl.currentStepIndex = typeof step._absoluteIndex === "number" ? step._absoluteIndex : (executionControl.stepIndexOffset || 0) + stepIndex;
      const stepLabel = step.displayText || step.controlName || step.type || `step ${stepIndex}`;
      const absoluteStepIndex = executionControl.currentStepIndex;
      window2.postMessage({
        type: "D365_WORKFLOW_PROGRESS",
        progress: { phase: "stepStart", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
      }, "*");
      try {
        const stepType = (step.type || "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        logStep(`Step ${absoluteStepIndex + 1}: ${stepType} -> ${stepLabel}`);
        if (dryRun) {
          sendLog("info", `Dry run - skipping action: ${step.type} ${step.controlName || ""}`);
          window2.postMessage({
            type: "D365_WORKFLOW_PROGRESS",
            progress: { phase: "stepDone", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
          }, "*");
          return;
        }
        let resolvedValue = null;
        if (["input", "select", "lookupSelect", "gridInput", "filter", "queryFilter"].includes(stepType)) {
          resolvedValue = await resolveStepValue(step, currentRow);
        }
        const waitTarget = step.waitTargetControlName || step.controlName || "";
        const shouldWaitBefore = !!step.waitUntilVisible;
        const shouldWaitAfter = !!step.waitUntilHidden;
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
        window2.postMessage({
          type: "D365_WORKFLOW_PROGRESS",
          progress: { phase: "stepDone", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
        }, "*");
      } catch (err) {
        if (err && err.isNavigationInterrupt)
          throw err;
        sendLog("error", `Error executing step ${absoluteStepIndex + 1}: ${err?.message || String(err)}`);
        throw err;
      }
    }
    async function executeStepsWithLoops(steps, primaryData, detailSources, relationships, settings) {
      const { skipRows = 0, limitRows = 0, dryRun = false } = executionControl.runOptions;
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
          if (result?.signal === "break-loop" || result?.signal === "continue-loop") {
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
            await executeSingleStep(step, stepIndex, currentDataRow, detailSources, settings, dryRun);
            return { signal: "none" };
          } catch (err) {
            if (err && err.isNavigationInterrupt)
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
            const conditionMet = evaluateCondition(step, currentDataRow);
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
                if (!evaluateCondition(step, currentDataRow))
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
          if (result?.signal === "break-loop" || result?.signal === "continue-loop") {
            return result;
          }
          idx++;
        }
        return { signal: "none" };
      }
      const finalResult = await executeRange(0, steps.length, initialDataRow);
      if (finalResult?.signal === "break-loop" || finalResult?.signal === "continue-loop") {
        throw new Error("Loop control signal used outside of a loop");
      }
    }
    return { started: true };
  }
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    startInjected({ windowObj: window, documentObj: document });
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luamVjdGVkL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb2dnaW5nLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9hc3luYy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvdGV4dC5qcyIsICJzcmMvaW5qZWN0ZWQvcnVudGltZS9lbmdpbmUtdXRpbHMuanMiLCAic3JjL2luamVjdGVkL3V0aWxzL2RvbS5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvbG9va3VwLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9jb21ib2JveC5qcyIsICJzcmMvaW5qZWN0ZWQvc3RlcHMvYWN0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEQzNjVGTyBFbGVtZW50IEluc3BlY3RvciBhbmQgRGlzY292ZXJ5IE1vZHVsZVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRDM2NUluc3BlY3RvciB7XHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudCA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5ID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgdGhlIGZvcm0gbmFtZSB0aGF0IGNvbnRhaW5zIGFuIGVsZW1lbnRcclxuICAgIGdldEVsZW1lbnRGb3JtTmFtZShlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gTG9vayBmb3IgdGhlIGNsb3Nlc3QgZm9ybSBjb250YWluZXJcclxuICAgICAgICBjb25zdCBmb3JtQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgIGlmIChmb3JtQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb3JtQ29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIGZvcm0gdmlhIGRhdGEtZHluLWNvbnRyb2xuYW1lIG9uIGEgZm9ybS1sZXZlbCBjb250YWluZXJcclxuICAgICAgICBjb25zdCBmb3JtRWxlbWVudCA9IGVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJGb3JtXCJdJyk7XHJcbiAgICAgICAgaWYgKGZvcm1FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb3JtRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgZm9ybUVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgdGhlIHdvcmtzcGFjZSBvciBwYWdlIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IHdvcmtzcGFjZSA9IGVsZW1lbnQuY2xvc2VzdCgnLndvcmtzcGFjZS1jb250ZW50LCAud29ya3NwYWNlLCBbZGF0YS1keW4tcm9sZT1cIldvcmtzcGFjZVwiXScpO1xyXG4gICAgICAgIGlmICh3b3Jrc3BhY2UpIHtcclxuICAgICAgICAgICAgY29uc3Qgd29ya3NwYWNlTmFtZSA9IHdvcmtzcGFjZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICh3b3Jrc3BhY2VOYW1lKSByZXR1cm4gd29ya3NwYWNlTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGRpYWxvZy9tb2RhbCBjb250ZXh0XHJcbiAgICAgICAgY29uc3QgZGlhbG9nID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5tb2RhbC1jb250ZW50Jyk7XHJcbiAgICAgICAgaWYgKGRpYWxvZykge1xyXG4gICAgICAgICAgICBjb25zdCBkaWFsb2dOYW1lID0gZGlhbG9nLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoZGlhbG9nTmFtZSkgcmV0dXJuIGRpYWxvZ05hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSByb290IGZvcm0gYnkgd2Fsa2luZyB1cCB0aGUgRE9NXHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBlbGVtZW50O1xyXG4gICAgICAgIHdoaWxlIChjdXJyZW50ICYmIGN1cnJlbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBjdXJyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0Zvcm0nID8gY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgOiBudWxsKTtcclxuICAgICAgICAgICAgaWYgKGZvcm1OYW1lKSByZXR1cm4gZm9ybU5hbWU7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHRoZSBhY3RpdmUvZm9jdXNlZCBmb3JtIG5hbWVcclxuICAgIGdldEFjdGl2ZUZvcm1OYW1lKCkge1xyXG4gICAgICAgIC8vIENoZWNrIGZvciBhY3RpdmUgZGlhbG9nIGZpcnN0IChjaGlsZCBmb3JtcyBhcmUgdHlwaWNhbGx5IGRpYWxvZ3MpXHJcbiAgICAgICAgY29uc3QgYWN0aXZlRGlhbG9nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl06bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKSwgLmRpYWxvZy1jb250YWluZXI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVEaWFsb2cpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhbG9nRm9ybSA9IGFjdGl2ZURpYWxvZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgICAgICBpZiAoZGlhbG9nRm9ybSkgcmV0dXJuIGRpYWxvZ0Zvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICAgICAgcmV0dXJuIGFjdGl2ZURpYWxvZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBmb2N1c2VkIGVsZW1lbnQgYW5kIGdldCBpdHMgZm9ybVxyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xyXG4gICAgICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShhY3RpdmVFbGVtZW50KTtcclxuICAgICAgICAgICAgaWYgKGZvcm1OYW1lICYmIGZvcm1OYW1lICE9PSAnVW5rbm93bicpIHJldHVybiBmb3JtTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTG9vayBmb3IgdGhlIHRvcG1vc3QvYWN0aXZlIGZvcm0gc2VjdGlvblxyXG4gICAgICAgIGNvbnN0IHZpc2libGVGb3JtcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XHJcbiAgICAgICAgaWYgKHZpc2libGVGb3Jtcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIFJldHVybiB0aGUgbGFzdCBvbmUgKHR5cGljYWxseSB0aGUgbW9zdCByZWNlbnRseSBvcGVuZWQvdG9wbW9zdClcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHZpc2libGVGb3Jtcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNFbGVtZW50VmlzaWJsZSh2aXNpYmxlRm9ybXNbaV0pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZpc2libGVGb3Jtc1tpXS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGFsbCBpbnRlcmFjdGl2ZSBlbGVtZW50cyBvbiB0aGUgcGFnZVxyXG4gICAgZGlzY292ZXJFbGVtZW50cyhhY3RpdmVGb3JtT25seSA9IGZhbHNlKSB7XHJcbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSBbXTtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtID0gYWN0aXZlRm9ybU9ubHkgPyB0aGlzLmdldEFjdGl2ZUZvcm1OYW1lKCkgOiBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGJ1dHRvbnNcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIk1lbnVJdGVtQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGVsKTtcclxuICAgICAgICAgICAgY29uc3QgdmlzaWJsZSA9IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdidXR0b24nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRleHQsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB2aXNpYmxlLFxyXG4gICAgICAgICAgICAgICAgYXJpYUxhYmVsOiBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbGwgaW5wdXQgZmllbGRzIChleHBhbmRlZCB0byBjYXRjaCBtb3JlIGZpZWxkIHR5cGVzKVxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTXVsdGlsaW5lSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlNlZ21lbnRlZEVudHJ5XCJdLCBpbnB1dFtkYXRhLWR5bi1jb250cm9sbmFtZV0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIC8vIEdldCBjb250cm9sIG5hbWUgZnJvbSBlbGVtZW50IG9yIHBhcmVudFxyXG4gICAgICAgICAgICBsZXQgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGxldCB0YXJnZXRFbGVtZW50ID0gZWw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBJZiBub3QgZm91bmQsIGNoZWNrIHBhcmVudCBlbGVtZW50IChjb21tb24gZm9yIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyBsaWtlIEFjY291bnQpXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSA9IHBhcmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0RWxlbWVudCA9IHBhcmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGFkZGVkIChhdm9pZCBkdXBsaWNhdGVzKVxyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZSh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFbGVtZW50TGFiZWwodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkSW5mbyA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnaW5wdXQnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKHRhcmdldEVsZW1lbnQpLFxyXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZEluZm8sXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHRhcmdldEVsZW1lbnRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGNoZWNrYm94ZXMvdG9nZ2xlc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ2hlY2tCb3hcIl0sIGlucHV0W3R5cGU9XCJjaGVja2JveFwiXVtkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgbGV0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBsZXQgdGFyZ2V0RWxlbWVudCA9IGVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQ2hlY2sgcGFyZW50IGlmIG5vdCBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUgPSBwYXJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEVsZW1lbnQgPSBwYXJlbnQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjb25zdCBjaGVja2JveCA9IHRhcmdldEVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHwgdGFyZ2V0RWxlbWVudDtcclxuICAgICAgICAgICAgY29uc3QgaXNDaGVja2VkID0gY2hlY2tib3guY2hlY2tlZCB8fCBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdjaGVja2JveCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUodGFyZ2V0RWxlbWVudCksXHJcbiAgICAgICAgICAgICAgICBjaGVja2VkOiBpc0NoZWNrZWQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHRhcmdldEVsZW1lbnRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYWxsIHJhZGlvIGJ1dHRvbiBncm91cHNcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJSYWRpb0J1dHRvblwiXSwgW3JvbGU9XCJyYWRpb2dyb3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIkZyYW1lT3B0aW9uQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKGVsKTtcclxuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRSYWRpbyA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXTpjaGVja2VkLCBbcm9sZT1cInJhZGlvXCJdW2FyaWEtY2hlY2tlZD1cInRydWVcIl0nKTtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gc2VsZWN0ZWRSYWRpbz8udmFsdWUgfHwgc2VsZWN0ZWRSYWRpbz8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJyc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncmFkaW8nLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcbiAgICAgICAgICAgICAgICBjdXJyZW50VmFsdWU6IGN1cnJlbnRWYWx1ZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBGaW5kIGFjdGlvbiBwYW5lIHRhYnMgKEFwcEJhciB0YWJzKVxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkFwcEJhclRhYlwiXSwgLmFwcEJhclRhYiwgW3JvbGU9XCJ0YWJcIl1bZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XG5cbiAgICAgICAgICAgIC8vIFNraXAgdGFicyBpbnNpZGUgZGlhbG9ncy9mbHlvdXRzXG4gICAgICAgICAgICBpZiAoZWwuY2xvc2VzdCgnLmRpYWxvZy1jb250ZW50LCBbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGVsKTtcbiAgICAgICAgICAgIGNvbnN0IGlzQWN0aXZlID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykgfHxcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ3NlbGVjdGVkJyk7XG5cbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdhY3Rpb24tcGFuZS10YWInLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiBpc0FjdGl2ZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBGaW5kIGFsbCB0cmFkaXRpb25hbCBEMzY1IGdyaWRzL3RhYmxlc1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGhpcy5nZXRFbGVtZW50TGFiZWwoZWwpIHx8ICdHcmlkJyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRGlzY292ZXIgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLmRpc2NvdmVyR3JpZENvbHVtbnMoZWwsIGNvbnRyb2xOYW1lLCBmb3JtTmFtZSwgZWxlbWVudHMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzICgucmVhY3RHcmlkKVxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiAnUmVhY3QgR3JpZCcsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6ICcucmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGV4cGFuZGFibGUgc2VjdGlvbnMgKEZhc3RUYWJzLCBHcm91cHMsIFNlY3Rpb25QYWdlcylcclxuICAgICAgICAvLyBUaGVzZSBhcmUgY29sbGFwc2libGUgc2VjdGlvbnMgaW4gRDM2NSBkaWFsb2dzIGFuZCBmb3Jtc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJGYXN0VGFiXCJdLCAuc2VjdGlvbi1wYWdlLCAuZmFzdHRhYicpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGFkZGVkXHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYWN0dWFsbHkgYW4gZXhwYW5kYWJsZSBzZWN0aW9uXHJcbiAgICAgICAgICAgIC8vIExvb2sgZm9yIGhlYWRlciBlbGVtZW50cyBvciBhcmlhLWV4cGFuZGVkIGF0dHJpYnV0ZVxyXG4gICAgICAgICAgICBjb25zdCBoYXNIZWFkZXIgPSBlbC5xdWVyeVNlbGVjdG9yKCcuc2VjdGlvbi1oZWFkZXIsIC5ncm91cC1oZWFkZXIsIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0sIC5zZWN0aW9uLXBhZ2UtY2FwdGlvbiwgYnV0dG9uW2FyaWEtZXhwYW5kZWRdJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kYWJsZSA9IGVsLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2libGUnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnc2VjdGlvbi1wYWdlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNIZWFkZXIgIT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0dyb3VwJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnU2VjdGlvblBhZ2UnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFpc0V4cGFuZGFibGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIERldGVybWluZSBjdXJyZW50IGV4cGFuZGVkIHN0YXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFeHBhbmRhYmxlU2VjdGlvbkxhYmVsKGVsKSB8fCBjb250cm9sTmFtZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ3NlY3Rpb24nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcclxuICAgICAgICAgICAgICAgIGlzRXhwYW5kZWQ6IGlzRXhwYW5kZWQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRGlzY292ZXIgUmVhY3QgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLmRpc2NvdmVyUmVhY3RHcmlkQ29sdW1ucyhlbCwgZm9ybU5hbWUsIGVsZW1lbnRzKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCByZWFkYWJsZSB0ZXh0IGZyb20gYW4gZWxlbWVudFxyXG4gICAgZ2V0RWxlbWVudFRleHQoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBhcmlhLWxhYmVsIGZpcnN0XHJcbiAgICAgICAgbGV0IHRleHQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmICh0ZXh0ICYmIHRleHQudHJpbSgpKSByZXR1cm4gdGV4dC50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSB0ZXh0IGNvbnRlbnQgKGV4Y2x1ZGluZyBjaGlsZCBidXR0b25zL2ljb25zKVxyXG4gICAgICAgIGNvbnN0IGNsb25lID0gZWxlbWVudC5jbG9uZU5vZGUodHJ1ZSk7XHJcbiAgICAgICAgY2xvbmUucXVlcnlTZWxlY3RvckFsbCgnLmJ1dHRvbi1pY29uLCAuZmEsIC5nbHlwaGljb24nKS5mb3JFYWNoKGljb24gPT4gaWNvbi5yZW1vdmUoKSk7XHJcbiAgICAgICAgdGV4dCA9IGNsb25lLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG5cclxuICAgICAgICAvLyBUcnkgdGl0bGUgYXR0cmlidXRlXHJcbiAgICAgICAgdGV4dCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd0aXRsZScpO1xyXG4gICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gY29udHJvbCBuYW1lXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICdVbmtub3duJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGlucHV0IGZpZWxkc1xyXG4gICAgZ2V0RWxlbWVudExhYmVsKGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbFxyXG4gICAgICAgIGxldCBsYWJlbCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGxhYmVsICYmIGxhYmVsLnRyaW0oKSkgcmV0dXJuIGxhYmVsLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gVHJ5IGFzc29jaWF0ZWQgbGFiZWwgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGxhYmVsRWxlbWVudCA9IGVsZW1lbnQuY2xvc2VzdCgnLmR5bi1sYWJlbC13cmFwcGVyJyk/LnF1ZXJ5U2VsZWN0b3IoJy5keW4tbGFiZWwnKTtcclxuICAgICAgICBpZiAobGFiZWxFbGVtZW50KSByZXR1cm4gbGFiZWxFbGVtZW50LnRleHRDb250ZW50Py50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSBwYXJlbnQgY29udGFpbmVyIGxhYmVsXHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuaW5wdXRfY29udGFpbmVyLCAuZm9ybS1ncm91cCcpO1xyXG4gICAgICAgIGlmIChjb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyTGFiZWwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignbGFiZWwnKTtcclxuICAgICAgICAgICAgaWYgKGNvbnRhaW5lckxhYmVsKSByZXR1cm4gY29udGFpbmVyTGFiZWwudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNvbnRyb2wgbmFtZVxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzY292ZXIgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dC9lZGl0aW5nXHJcbiAgICBkaXNjb3ZlckdyaWRDb2x1bW5zKGdyaWRFbGVtZW50LCBncmlkTmFtZSwgZm9ybU5hbWUsIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgY29uc3QgYWRkZWRDb2x1bW5zID0gbmV3IFNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAxOiBGaW5kIGNvbHVtbiBoZWFkZXJzXHJcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXSwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgaGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBoZWFkZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoZWFkZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogYCR7ZGlzcGxheVRleHR9YCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShoZWFkZXIpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzSGVhZGVyOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaGVhZGVyXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAyOiBGaW5kIGNlbGxzIHdpdGggaW5wdXRzIGluIHRoZSBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXNlbGVjdGVkPVwidHJ1ZVwiXSwgW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZHluLXNlbGVjdGVkUm93JykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1yb2xlPVwiUm93XCJdOmZpcnN0LW9mLXR5cGUsIFtyb2xlPVwicm93XCJdOm5vdChbcm9sZT1cImNvbHVtbmhlYWRlclwiXSk6Zmlyc3Qtb2YtdHlwZScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgLy8gRmluZCBhbGwgaW5wdXQgZmllbGRzIGluIHRoZSByb3dcclxuICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICBjZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY29uc3Qgcm9sZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9IGNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ0lucHV0JywgJ0NvbWJvQm94JywgJ0xvb2t1cCcsICdSZWZlcmVuY2VHcm91cCcsICdTZWdtZW50ZWRFbnRyeSddLmluY2x1ZGVzKHJvbGUpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoaGFzSW5wdXQgfHwgcm9sZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjZWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZE5hbWU6IGdyaWROYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoY2VsbCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogaGFzSW5wdXQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBjZWxsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXRob2QgMzogRmluZCBhbnkgZWRpdGFibGUgaW5wdXRzIGluc2lkZSB0aGUgZ3JpZCBib2R5XHJcbiAgICAgICAgY29uc3QgZ3JpZElucHV0cyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlJlZmVyZW5jZUdyb3VwXCJdJyk7XHJcbiAgICAgICAgZ3JpZElucHV0cy5mb3JFYWNoKGlucHV0ID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IHRoaXMuZ2V0RWxlbWVudExhYmVsKGlucHV0KSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShpbnB1dCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShpbnB1dCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBpbnB1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBhIGdyaWQgY29sdW1uIGJ5IGxvb2tpbmcgYXQgdGhlIGhlYWRlclxyXG4gICAgZ2V0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2x1bW5Db250cm9sTmFtZSkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIgY2VsbCBmb3IgdGhpcyBjb2x1bW5cclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gaGVhZGVyLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgaGVhZGVyIGJ5IHBhcnRpYWwgbWF0Y2ggKGNvbHVtbiBuYW1lIG1pZ2h0IGJlIGRpZmZlcmVudCBpbiBoZWFkZXIgdnMgY2VsbClcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGFsbEhlYWRlcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGguZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoaGVhZGVyTmFtZSAmJiAoY29sdW1uQ29udHJvbE5hbWUuaW5jbHVkZXMoaGVhZGVyTmFtZSkgfHwgaGVhZGVyTmFtZS5pbmNsdWRlcyhjb2x1bW5Db250cm9sTmFtZSkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gaC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGNvbHVtbnMgaW4gUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHNcclxuICAgIGRpc2NvdmVyUmVhY3RHcmlkQ29sdW1ucyhncmlkRWxlbWVudCwgZm9ybU5hbWUsIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgY29uc3QgYWRkZWRDb2x1bW5zID0gbmV3IFNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEdldCBjb2x1bW4gaGVhZGVycyBmcm9tIC5keW4taGVhZGVyQ2VsbCBlbGVtZW50c1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckNlbGxzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciAuZHluLWhlYWRlckNlbGwnKTtcclxuICAgICAgICBoZWFkZXJDZWxscy5mb3JFYWNoKChoZWFkZXIsIGNvbEluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gaGVhZGVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbnRyb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gaGVhZGVyLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaGVhZGVyLnRleHRDb250ZW50Py50cmltKCkgfHwgY29udHJvbE5hbWU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgIGNvbHVtbkluZGV4OiBjb2xJbmRleCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShoZWFkZXIpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGAuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0hlYWRlcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGhlYWRlclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIGxvb2sgZm9yIGVkaXRhYmxlIGlucHV0cyBpbnNpZGUgdGhlIGJvZHkgcm93c1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAvLyBGaW5kIGFjdGl2ZS9zZWxlY3RlZCByb3cgZmlyc3QsIG9yIGZhbGxiYWNrIHRvIGZpcnN0IHJvd1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVSb3cgPSBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbltkYXRhLWR5bi1yb3ctYWN0aXZlPVwidHJ1ZVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbi5wdWJsaWNfZml4ZWREYXRhVGFibGVSb3dfbWFpbicpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZVJvdykge1xyXG4gICAgICAgICAgICAgICAgLy8gRmluZCBhbGwgY2VsbHMgd2l0aCBkYXRhLWR5bi1jb250cm9sbmFtZVxyXG4gICAgICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICAgICAgY2VsbHMuZm9yRWFjaChjZWxsID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByb2xlID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9IGNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydJbnB1dCcsICdDb21ib0JveCcsICdMb29rdXAnLCAnUmVmZXJlbmNlR3JvdXAnLCAnU2VnbWVudGVkRW50cnknXS5pbmNsdWRlcyhyb2xlKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRSZWFjdEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjZWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGNlbGwpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IGhhc0lucHV0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogY2VsbFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbnkgZWRpdGFibGUgaW5wdXRzIGluIHRoZSBncmlkIGJvZHlcclxuICAgICAgICBjb25zdCBncmlkSW5wdXRzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJJbnB1dFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0sIC5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0nKTtcclxuICAgICAgICBncmlkSW5wdXRzLmZvckVhY2goaW5wdXQgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldFJlYWN0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCB0aGlzLmdldEVsZW1lbnRMYWJlbChpbnB1dCkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoaW5wdXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShpbnB1dCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBpbnB1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBhIFJlYWN0IGdyaWQgY29sdW1uIGJ5IGxvb2tpbmcgYXQgdGhlIGhlYWRlclxyXG4gICAgZ2V0UmVhY3RHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbHVtbkNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGhlYWRlciBjZWxsIHdpdGggbWF0Y2hpbmcgY29udHJvbG5hbWVcclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKGAuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbHVtbkNvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXIucXVlcnlTZWxlY3RvcignLmR5bi1oZWFkZXJDZWxsTGFiZWwnKTtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFBhcnRpYWwgbWF0Y2hcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmR5bi1oZWFkZXJDZWxsW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlck5hbWUgPSBoLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGhlYWRlck5hbWUgJiYgKGNvbHVtbkNvbnRyb2xOYW1lLmluY2x1ZGVzKGhlYWRlck5hbWUpIHx8IGhlYWRlck5hbWUuaW5jbHVkZXMoY29sdW1uQ29udHJvbE5hbWUpKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERldGVjdCBmaWVsZCB0eXBlIChlbnVtLCBsb29rdXAsIGZyZWV0ZXh0LCBldGMuKVxyXG4gICAgZGV0ZWN0RmllbGRUeXBlKGVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCByb2xlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyAobGlrZSBBY2NvdW50KSBoYXZlIHNwZWNpYWwgbG9va3VwXHJcbiAgICAgICAgaWYgKHJvbGUgPT09ICdTZWdtZW50ZWRFbnRyeScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgdHlwZTogJ3NlZ21lbnRlZC1sb29rdXAnLCByb2xlOiByb2xlIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBsb29rdXAgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgaGFzTG9va3VwQnV0dG9uID0gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5sb29rdXAtYnV0dG9uJykgIT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgQ29tYm9Cb3gvRHJvcGRvd25cclxuICAgICAgICBjb25zdCBpc0NvbWJvQm94ID0gcm9sZSA9PT0gJ0NvbWJvQm94JyB8fCBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnY29tYm9Cb3gnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3Igc2VsZWN0IGVsZW1lbnRcclxuICAgICAgICBjb25zdCBzZWxlY3QgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE11bHRpbGluZUlucHV0IGRldGVjdGlvblxyXG4gICAgICAgIGNvbnN0IGlzTXVsdGlsaW5lID0gcm9sZSA9PT0gJ011bHRpbGluZUlucHV0JztcclxuICAgICAgICBcclxuICAgICAgICAvLyBEZXRlY3QgbnVtZXJpYyBmaWVsZHNcclxuICAgICAgICBjb25zdCBpc051bWVyaWMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJudW1iZXJcIl0nKSAhPT0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEZXRlY3QgZGF0ZSBmaWVsZHNcclxuICAgICAgICBjb25zdCBpc0RhdGUgPSBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZGF0ZS1maWVsZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiZGF0ZVwiXScpICE9PSBudWxsO1xyXG5cclxuICAgICAgICAvLyBCdWlsZCBmaWVsZCB0eXBlIGluZm9cclxuICAgICAgICBjb25zdCBmaWVsZEluZm8gPSB7XHJcbiAgICAgICAgICAgIGNvbnRyb2xUeXBlOiByb2xlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICd0ZXh0J1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGlmIChpc011bHRpbGluZSkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ3RleHRhcmVhJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzTXVsdGlsaW5lID0gdHJ1ZTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzQ29tYm9Cb3ggfHwgc2VsZWN0KSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnZW51bSc7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pc0VudW0gPSB0cnVlO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8udmFsdWVzID0gdGhpcy5leHRyYWN0RW51bVZhbHVlcyhlbGVtZW50LCBzZWxlY3QpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaGFzTG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnbG9va3VwJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzTG9va3VwID0gdHJ1ZTtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmFsbG93RnJlZXRleHQgPSAhZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1vbmx5Jyk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc051bWVyaWMpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdudW1iZXInO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNEYXRlKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnZGF0ZSc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBHZXQgbWF4IGxlbmd0aCBpZiBhdmFpbGFibGVcclxuICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhJyk7XHJcbiAgICAgICAgaWYgKGlucHV0ICYmIGlucHV0Lm1heExlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLm1heExlbmd0aCA9IGlucHV0Lm1heExlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBmaWVsZEluZm87XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRXh0cmFjdCBlbnVtIHZhbHVlcyBmcm9tIGRyb3Bkb3duXHJcbiAgICBleHRyYWN0RW51bVZhbHVlcyhlbGVtZW50LCBzZWxlY3RFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ID0gc2VsZWN0RWxlbWVudCB8fCBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgICAgIGlmICghc2VsZWN0KSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgcmV0dXJuIEFycmF5LmZyb20oc2VsZWN0Lm9wdGlvbnMpXHJcbiAgICAgICAgICAgIC5maWx0ZXIob3B0ID0+IG9wdC52YWx1ZSAhPT0gJycpXHJcbiAgICAgICAgICAgIC5tYXAob3B0ID0+ICh7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZTogb3B0LnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgdGV4dDogb3B0LnRleHQudHJpbSgpXHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGV4cGFuZGFibGUgc2VjdGlvbnNcclxuICAgIGdldEV4cGFuZGFibGVTZWN0aW9uTGFiZWwoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIvY2FwdGlvbiBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgaGVhZGVyU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICAgICAnLnNlY3Rpb24tcGFnZS1jYXB0aW9uJyxcclxuICAgICAgICAgICAgJy5zZWN0aW9uLWhlYWRlcicsXHJcbiAgICAgICAgICAgICcuZ3JvdXAtaGVhZGVyJyxcclxuICAgICAgICAgICAgJy5mYXN0dGFiLWhlYWRlcicsXHJcbiAgICAgICAgICAgICdbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdJyxcclxuICAgICAgICAgICAgJ2J1dHRvblthcmlhLWV4cGFuZGVkXSBzcGFuJyxcclxuICAgICAgICAgICAgJ2J1dHRvbiBzcGFuJyxcclxuICAgICAgICAgICAgJy5jYXB0aW9uJyxcclxuICAgICAgICAgICAgJ2xlZ2VuZCdcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgaGVhZGVyU2VsZWN0b3JzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbFxyXG4gICAgICAgIGNvbnN0IGFyaWFMYWJlbCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGFyaWFMYWJlbCkgcmV0dXJuIGFyaWFMYWJlbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdGhlIGJ1dHRvbidzIHRleHQgaWYgdGhlIHNlY3Rpb24gaGFzIGEgdG9nZ2xlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IHRvZ2dsZUJ0biA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignYnV0dG9uJyk7XHJcbiAgICAgICAgaWYgKHRvZ2dsZUJ0bikge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdG9nZ2xlQnRuLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0ICYmIHRleHQubGVuZ3RoIDwgMTAwKSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgZWxlbWVudCBpcyB2aXNpYmxlXHJcbiAgICBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQpIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgIT09ICdub25lJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBTdGFydCBpbnRlcmFjdGl2ZSBlbGVtZW50IHBpY2tlclxyXG4gICAgc3RhcnRFbGVtZW50UGlja2VyKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgdGhpcy5pc0luc3BlY3RpbmcgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMucGlja2VyQ2FsbGJhY2sgPSBjYWxsYmFjaztcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIG92ZXJsYXlcclxuICAgICAgICB0aGlzLm92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLm92ZXJsYXkuc3R5bGUuY3NzVGV4dCA9IGBcclxuICAgICAgICAgICAgcG9zaXRpb246IGZpeGVkO1xyXG4gICAgICAgICAgICB0b3A6IDA7XHJcbiAgICAgICAgICAgIGxlZnQ6IDA7XHJcbiAgICAgICAgICAgIHdpZHRoOiAxMDAlO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IDEwMCU7XHJcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcclxuICAgICAgICAgICAgei1pbmRleDogOTk5OTk4O1xyXG4gICAgICAgICAgICBjdXJzb3I6IGNyb3NzaGFpcjtcclxuICAgICAgICBgO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5vdmVybGF5KTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGhpZ2hsaWdodCBlbGVtZW50XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmNzc1RleHQgPSBgXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgICAgICAgICAgYm9yZGVyOiAycHggc29saWQgIzY2N2VlYTtcclxuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xyXG4gICAgICAgICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcclxuICAgICAgICAgICAgei1pbmRleDogOTk5OTk5O1xyXG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4xcyBlYXNlO1xyXG4gICAgICAgIGA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXJzXHJcbiAgICAgICAgdGhpcy5tb3VzZU1vdmVIYW5kbGVyID0gKGUpID0+IHRoaXMuaGFuZGxlTW91c2VNb3ZlKGUpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tIYW5kbGVyID0gKGUpID0+IHRoaXMuaGFuZGxlQ2xpY2soZSk7XHJcbiAgICAgICAgdGhpcy5lc2NhcGVIYW5kbGVyID0gKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgdGhpcy5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2VNb3ZlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuZXNjYXBlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlTW91c2VNb3ZlKGUpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcclxuICAgICAgICBpZiAoIXRhcmdldCB8fCB0YXJnZXQgPT09IHRoaXMub3ZlcmxheSB8fCB0YXJnZXQgPT09IHRoaXMuaGlnaGxpZ2h0RWxlbWVudCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGNsb3Nlc3QgRDM2NSBjb250cm9sXHJcbiAgICAgICAgY29uc3QgY29udHJvbCA9IHRhcmdldC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgaWYgKCFjb250cm9sKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVuc3VyZSBoaWdobGlnaHQgZWxlbWVudCBleGlzdHNcclxuICAgICAgICBpZiAoIXRoaXMuaGlnaGxpZ2h0RWxlbWVudCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIaWdobGlnaHQgdGhlIGVsZW1lbnRcclxuICAgICAgICBjb25zdCByZWN0ID0gY29udHJvbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLnRvcCA9IHJlY3QudG9wICsgd2luZG93LnNjcm9sbFkgKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5sZWZ0ID0gcmVjdC5sZWZ0ICsgd2luZG93LnNjcm9sbFggKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS53aWR0aCA9IHJlY3Qud2lkdGggKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5oZWlnaHQgPSByZWN0LmhlaWdodCArICdweCc7XHJcblxyXG4gICAgICAgIC8vIFNob3cgdG9vbHRpcFxyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnNldEF0dHJpYnV0ZSgndGl0bGUnLCBgJHtyb2xlfTogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVDbGljayhlKSB7XHJcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2wgPSB0YXJnZXQ/LmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBjb25zdCByb2xlID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRoaXMuZ2V0RWxlbWVudFRleHQoY29udHJvbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBlbGVtZW50SW5mbyA9IHtcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBpZiAocm9sZSA9PT0gJ0lucHV0JyB8fCByb2xlID09PSAnTXVsdGlsaW5lSW5wdXQnIHx8IHJvbGUgPT09ICdDb21ib0JveCcpIHtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnRJbmZvLmZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGNvbnRyb2wpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBpY2tlckNhbGxiYWNrKGVsZW1lbnRJbmZvKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc3RvcEVsZW1lbnRQaWNrZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBzdG9wRWxlbWVudFBpY2tlcigpIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLm92ZXJsYXkpIHtcclxuICAgICAgICAgICAgdGhpcy5vdmVybGF5LnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLm92ZXJsYXkgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5oaWdobGlnaHRFbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5yZW1vdmUoKTtcclxuICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2VNb3ZlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuZXNjYXBlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2VhcmNoIGVsZW1lbnRzIGJ5IHRleHRcclxuICAgIGZpbmRFbGVtZW50QnlUZXh0KHRleHQsIGVsZW1lbnRUeXBlID0gbnVsbCkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gdGhpcy5kaXNjb3ZlckVsZW1lbnRzKCk7XHJcbiAgICAgICAgY29uc3Qgc2VhcmNoVGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKS50cmltKCk7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50cy5maWx0ZXIoZWwgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZWxlbWVudFR5cGUgJiYgZWwudHlwZSAhPT0gZWxlbWVudFR5cGUpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gZWwuZGlzcGxheVRleHQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgYXJpYUxhYmVsID0gKGVsLmFyaWFMYWJlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5jb250cm9sTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIGRpc3BsYXlUZXh0LmluY2x1ZGVzKHNlYXJjaFRleHQpIHx8XHJcbiAgICAgICAgICAgICAgICAgICBhcmlhTGFiZWwuaW5jbHVkZXMoc2VhcmNoVGV4dCkgfHxcclxuICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lLmluY2x1ZGVzKHNlYXJjaFRleHQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBFeHBvcnQgZm9yIHVzZSBpbiBjb250ZW50IHNjcmlwdFxyXG4iLCAiZXhwb3J0IGZ1bmN0aW9uIHNlbmRMb2cobGV2ZWwsIG1lc3NhZ2UpIHtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19MT0cnLFxuICAgICAgICBsb2c6IHsgbGV2ZWwsIG1lc3NhZ2UgfVxuICAgIH0sICcqJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2dTdGVwKG1lc3NhZ2UpIHtcbiAgICBzZW5kTG9nKCdpbmZvJywgbWVzc2FnZSk7XG4gICAgY29uc29sZS5sb2coJ1tEMzY1IEF1dG9tYXRpb25dJywgbWVzc2FnZSk7XG59XG4iLCAiZXhwb3J0IGZ1bmN0aW9uIHNsZWVwKG1zKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKSB7XG4gICAgY29uc3QgaXNUZXh0QXJlYSA9IGlucHV0LnRhZ05hbWUgPT09ICdURVhUQVJFQSc7XG4gICAgY29uc3QgZGVzY3JpcHRvciA9IGlzVGV4dEFyZWFcbiAgICAgICAgPyBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MVGV4dEFyZWFFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJylcbiAgICAgICAgOiBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MSW5wdXRFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJyk7XG5cbiAgICBpZiAoZGVzY3JpcHRvciAmJiBkZXNjcmlwdG9yLnNldCkge1xuICAgICAgICBkZXNjcmlwdG9yLnNldC5jYWxsKGlucHV0LCB2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaW5wdXQudmFsdWUgPSB2YWx1ZTtcbiAgICB9XG59XG4iLCAiZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVRleHQodmFsdWUpIHtcclxuICAgIHJldHVybiBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb3dlckNhc2UoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvZXJjZUJvb2xlYW4odmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuIHZhbHVlO1xyXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiB2YWx1ZSAhPT0gMCAmJiAhTnVtYmVyLmlzTmFOKHZhbHVlKTtcclxuXHJcbiAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dCh2YWx1ZSk7XHJcbiAgICBpZiAodGV4dCA9PT0gJycpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoWyd0cnVlJywgJzEnLCAneWVzJywgJ3knLCAnb24nLCAnY2hlY2tlZCddLmluY2x1ZGVzKHRleHQpKSByZXR1cm4gdHJ1ZTtcclxuICAgIGlmIChbJ2ZhbHNlJywgJzAnLCAnbm8nLCAnbicsICdvZmYnLCAndW5jaGVja2VkJ10uaW5jbHVkZXModGV4dCkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuIiwgImV4cG9ydCBmdW5jdGlvbiBnZXRXb3JrZmxvd0Vycm9yRGVmYXVsdHMoc2V0dGluZ3MpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBtb2RlOiBzZXR0aW5ncz8uZXJyb3JEZWZhdWx0TW9kZSB8fCAnZmFpbCcsXG4gICAgICAgIHJldHJ5Q291bnQ6IE51bWJlci5pc0Zpbml0ZShzZXR0aW5ncz8uZXJyb3JEZWZhdWx0UmV0cnlDb3VudCkgPyBzZXR0aW5ncy5lcnJvckRlZmF1bHRSZXRyeUNvdW50IDogMCxcbiAgICAgICAgcmV0cnlEZWxheTogTnVtYmVyLmlzRmluaXRlKHNldHRpbmdzPy5lcnJvckRlZmF1bHRSZXRyeURlbGF5KSA/IHNldHRpbmdzLmVycm9yRGVmYXVsdFJldHJ5RGVsYXkgOiAxMDAwLFxuICAgICAgICBnb3RvTGFiZWw6IHNldHRpbmdzPy5lcnJvckRlZmF1bHRHb3RvTGFiZWwgfHwgJydcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RlcEVycm9yQ29uZmlnKHN0ZXAsIHNldHRpbmdzKSB7XG4gICAgY29uc3QgZGVmYXVsdHMgPSBnZXRXb3JrZmxvd0Vycm9yRGVmYXVsdHMoc2V0dGluZ3MpO1xuICAgIGNvbnN0IG1vZGUgPSBzdGVwPy5vbkVycm9yTW9kZSAmJiBzdGVwLm9uRXJyb3JNb2RlICE9PSAnZGVmYXVsdCcgPyBzdGVwLm9uRXJyb3JNb2RlIDogZGVmYXVsdHMubW9kZTtcbiAgICBjb25zdCByZXRyeUNvdW50ID0gTnVtYmVyLmlzRmluaXRlKHN0ZXA/Lm9uRXJyb3JSZXRyeUNvdW50KSA/IHN0ZXAub25FcnJvclJldHJ5Q291bnQgOiBkZWZhdWx0cy5yZXRyeUNvdW50O1xuICAgIGNvbnN0IHJldHJ5RGVsYXkgPSBOdW1iZXIuaXNGaW5pdGUoc3RlcD8ub25FcnJvclJldHJ5RGVsYXkpID8gc3RlcC5vbkVycm9yUmV0cnlEZWxheSA6IGRlZmF1bHRzLnJldHJ5RGVsYXk7XG4gICAgY29uc3QgZ290b0xhYmVsID0gc3RlcD8ub25FcnJvckdvdG9MYWJlbCB8fCBkZWZhdWx0cy5nb3RvTGFiZWw7XG4gICAgcmV0dXJuIHsgbW9kZSwgcmV0cnlDb3VudCwgcmV0cnlEZWxheSwgZ290b0xhYmVsIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9vcFBhaXJzKHN0ZXBzTGlzdCwgb25Jc3N1ZSA9ICgpID0+IHt9KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbXTtcbiAgICBjb25zdCBwYWlycyA9IFtdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN0ZXBzTGlzdFtpXTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnR5cGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xuICAgICAgICAgICAgc3RhY2sucHVzaCh7IHN0YXJ0SW5kZXg6IGksIGlkOiBzLmlkIH0pO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocy50eXBlICE9PSAnbG9vcC1lbmQnKSBjb250aW51ZTtcblxuICAgICAgICBsZXQgbWF0Y2hlZCA9IG51bGw7XG4gICAgICAgIGlmIChzLmxvb3BSZWYpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGogPSBzdGFjay5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFja1tqXS5pZCA9PT0gcy5sb29wUmVmKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZWQgPSB7IHN0YXJ0SW5kZXg6IHN0YWNrW2pdLnN0YXJ0SW5kZXgsIGVuZEluZGV4OiBpIH07XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnNwbGljZShqLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFtYXRjaGVkKSB7XG4gICAgICAgICAgICBjb25zdCBsYXN0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgICAgICBpZiAobGFzdCkge1xuICAgICAgICAgICAgICAgIG1hdGNoZWQgPSB7IHN0YXJ0SW5kZXg6IGxhc3Quc3RhcnRJbmRleCwgZW5kSW5kZXg6IGkgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb25Jc3N1ZShgVW5tYXRjaGVkIGxvb3AtZW5kIGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtYXRjaGVkKSBwYWlycy5wdXNoKG1hdGNoZWQpO1xuICAgIH1cblxuICAgIGlmIChzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChjb25zdCByZW0gb2Ygc3RhY2spIHtcbiAgICAgICAgICAgIG9uSXNzdWUoYFVuY2xvc2VkIGxvb3Atc3RhcnQgYXQgaW5kZXggJHtyZW0uc3RhcnRJbmRleH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhaXJzLnNvcnQoKGEsIGIpID0+IGEuc3RhcnRJbmRleCAtIGIuc3RhcnRJbmRleCk7XG4gICAgcmV0dXJuIHBhaXJzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZElmUGFpcnMoc3RlcHNMaXN0LCBvbklzc3VlID0gKCkgPT4ge30pIHtcbiAgICBjb25zdCBzdGFjayA9IFtdO1xuICAgIGNvbnN0IGlmVG9FbHNlID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGlmVG9FbmQgPSBuZXcgTWFwKCk7XG4gICAgY29uc3QgZWxzZVRvRW5kID0gbmV3IE1hcCgpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN0ZXBzTGlzdFtpXTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnR5cGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdpZi1zdGFydCcpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goeyBpZkluZGV4OiBpLCBlbHNlSW5kZXg6IG51bGwgfSk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdlbHNlJykge1xuICAgICAgICAgICAgaWYgKHN0YWNrLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG9uSXNzdWUoYEVsc2Ugd2l0aG91dCBtYXRjaGluZyBpZi1zdGFydCBhdCBpbmRleCAke2l9YCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHRvcCA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgaWYgKHRvcC5lbHNlSW5kZXggPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICB0b3AuZWxzZUluZGV4ID0gaTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb25Jc3N1ZShgTXVsdGlwbGUgZWxzZSBibG9ja3MgZm9yIGlmLXN0YXJ0IGF0IGluZGV4ICR7dG9wLmlmSW5kZXh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzLnR5cGUgIT09ICdpZi1lbmQnKSBjb250aW51ZTtcblxuICAgICAgICBjb25zdCB0b3AgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKCF0b3ApIHtcbiAgICAgICAgICAgIG9uSXNzdWUoYElmLWVuZCB3aXRob3V0IG1hdGNoaW5nIGlmLXN0YXJ0IGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWZUb0VuZC5zZXQodG9wLmlmSW5kZXgsIGkpO1xuICAgICAgICBpZiAodG9wLmVsc2VJbmRleCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgaWZUb0Vsc2Uuc2V0KHRvcC5pZkluZGV4LCB0b3AuZWxzZUluZGV4KTtcbiAgICAgICAgICAgIGVsc2VUb0VuZC5zZXQodG9wLmVsc2VJbmRleCwgaSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVtIG9mIHN0YWNrKSB7XG4gICAgICAgICAgICBvbklzc3VlKGBVbmNsb3NlZCBpZi1zdGFydCBhdCBpbmRleCAke3JlbS5pZkluZGV4fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgaWZUb0Vsc2UsIGlmVG9FbmQsIGVsc2VUb0VuZCB9O1xufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSkge1xyXG4gICAgY29uc3QgYWxsTWF0Y2hlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcblxyXG4gICAgaWYgKGFsbE1hdGNoZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcclxuICAgIGlmIChhbGxNYXRjaGVzLmxlbmd0aCA9PT0gMSkgcmV0dXJuIGFsbE1hdGNoZXNbMF07XHJcblxyXG4gICAgLy8gTXVsdGlwbGUgbWF0Y2hlcyAtIHByZWZlciB0aGUgb25lIGluIHRoZSBhY3RpdmUvdG9wbW9zdCBjb250ZXh0XHJcblxyXG4gICAgLy8gUHJpb3JpdHkgMTogRWxlbWVudCBpbiBhbiBhY3RpdmUgZGlhbG9nL21vZGFsIChjaGlsZCBmb3JtcylcclxuICAgIGZvciAoY29uc3QgZWwgb2YgYWxsTWF0Y2hlcykge1xyXG4gICAgICAgIGNvbnN0IGRpYWxvZyA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiRGlhbG9nXCJdLCAuZGlhbG9nLWNvbnRhaW5lciwgLmZseW91dC1jb250YWluZXIsIFtyb2xlPVwiZGlhbG9nXCJdJyk7XHJcbiAgICAgICAgaWYgKGRpYWxvZyAmJiBpc0VsZW1lbnRWaXNpYmxlKGRpYWxvZykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYEZvdW5kICR7Y29udHJvbE5hbWV9IGluIGRpYWxvZyBjb250ZXh0YCk7XHJcbiAgICAgICAgICAgIHJldHVybiBlbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJpb3JpdHkgMjogRWxlbWVudCBpbiBhIEZhc3RUYWIgb3IgVGFiUGFnZSB0aGF0J3MgZXhwYW5kZWQvYWN0aXZlXHJcbiAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICBjb25zdCB0YWJQYWdlID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJUYWJQYWdlXCJdLCAudGFiUGFnZScpO1xyXG4gICAgICAgIGlmICh0YWJQYWdlKSB7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSB0YWIgaXMgZXhwYW5kZWRcclxuICAgICAgICAgICAgY29uc3QgaXNFeHBhbmRlZCA9IHRhYlBhZ2UuY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmRlZCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhYlBhZ2UuZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhdGFiUGFnZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpO1xyXG4gICAgICAgICAgICBpZiAoaXNFeHBhbmRlZCAmJiBpc0VsZW1lbnRWaXNpYmxlKGVsKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYEZvdW5kICR7Y29udHJvbE5hbWV9IGluIGV4cGFuZGVkIHRhYiBjb250ZXh0YCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZWw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJpb3JpdHkgMzogRWxlbWVudCBpbiB0aGUgZm9ybSBjb250ZXh0IHRoYXQgaGFzIGZvY3VzIG9yIHdhcyByZWNlbnRseSBpbnRlcmFjdGVkIHdpdGhcclxuICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xyXG4gICAgaWYgKGFjdGl2ZUVsZW1lbnQgJiYgYWN0aXZlRWxlbWVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUZvcm1Db250ZXh0ID0gYWN0aXZlRWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tZm9ybS1uYW1lXSwgW2RhdGEtZHluLXJvbGU9XCJGb3JtXCJdJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZUZvcm1Db250ZXh0KSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgZWwgb2YgYWxsTWF0Y2hlcykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Db250ZXh0LmNvbnRhaW5zKGVsKSAmJiBpc0VsZW1lbnRWaXNpYmxlKGVsKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBhY3RpdmUgZm9ybSBjb250ZXh0YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDQ6IEFueSB2aXNpYmxlIGVsZW1lbnQgKHByZWZlciBsYXRlciBvbmVzIGFzIHRoZXkncmUgb2Z0ZW4gaW4gY2hpbGQgZm9ybXMgcmVuZGVyZWQgb24gdG9wKVxyXG4gICAgY29uc3QgdmlzaWJsZU1hdGNoZXMgPSBBcnJheS5mcm9tKGFsbE1hdGNoZXMpLmZpbHRlcihlbCA9PiBpc0VsZW1lbnRWaXNpYmxlKGVsKSk7XHJcbiAgICBpZiAodmlzaWJsZU1hdGNoZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIC8vIFJldHVybiB0aGUgbGFzdCB2aXNpYmxlIG1hdGNoIChvZnRlbiB0aGUgY2hpbGQgZm9ybSdzIGVsZW1lbnQpXHJcbiAgICAgICAgcmV0dXJuIHZpc2libGVNYXRjaGVzW3Zpc2libGVNYXRjaGVzLmxlbmd0aCAtIDFdO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrOiBmaXJzdCBtYXRjaFxyXG4gICAgcmV0dXJuIGFsbE1hdGNoZXNbMF07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0VsZW1lbnRWaXNpYmxlKGVsKSB7XHJcbiAgICBpZiAoIWVsKSByZXR1cm4gZmFsc2U7XHJcbiAgICBjb25zdCByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsKTtcclxuICAgIHJldHVybiByZWN0LndpZHRoID4gMCAmJlxyXG4gICAgICAgICAgIHJlY3QuaGVpZ2h0ID4gMCAmJlxyXG4gICAgICAgICAgIHN0eWxlLmRpc3BsYXkgIT09ICdub25lJyAmJlxyXG4gICAgICAgICAgIHN0eWxlLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgICAgc3R5bGUub3BhY2l0eSAhPT0gJzAnO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNEMzY1TG9hZGluZygpIHtcclxuICAgIC8vIENoZWNrIGZvciBjb21tb24gRDM2NSBsb2FkaW5nIGluZGljYXRvcnNcclxuICAgIGNvbnN0IGxvYWRpbmdTZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJy5keW4tbG9hZGluZy1vdmVybGF5Om5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcuZHluLWxvYWRpbmctaW5kaWNhdG9yOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcuZHluLXNwaW5uZXI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5sb2FkaW5nLWluZGljYXRvcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1tZXNzYWdlQnVzeTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnW2RhdGEtZHluLWxvYWRpbmc9XCJ0cnVlXCJdJyxcclxuICAgICAgICAnLmJ1c3ktaW5kaWNhdG9yJyxcclxuICAgICAgICAnLmR5bi1sb2FkaW5nU3R1Yjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIGxvYWRpbmdTZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChlbCAmJiBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGZvciBBSkFYIHJlcXVlc3RzIGluIHByb2dyZXNzIChEMzY1IHNwZWNpZmljKVxyXG4gICAgaWYgKHdpbmRvdy4kZHluICYmIHdpbmRvdy4kZHluLmlzUHJvY2Vzc2luZykge1xyXG4gICAgICAgIHJldHVybiB3aW5kb3cuJGR5bi5pc1Byb2Nlc3NpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKSB7XHJcbiAgICAvLyBGaXJzdCwgdHJ5IHRvIGZpbmQgaW4gYW4gYWN0aXZlL3NlbGVjdGVkIHJvdyAodHJhZGl0aW9uYWwgRDM2NSBncmlkcylcclxuICAgIGNvbnN0IHNlbGVjdGVkUm93cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1zZWxlY3RlZD1cInRydWVcIl0sIFthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmR5bi1zZWxlY3RlZFJvdycpO1xyXG4gICAgZm9yIChjb25zdCByb3cgb2Ygc2VsZWN0ZWRSb3dzKSB7XHJcbiAgICAgICAgY29uc3QgY2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChjZWxsICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjZWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBUcnkgUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHMgLSBmaW5kIGFjdGl2ZSByb3dcclxuICAgIGNvbnN0IHJlYWN0R3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmVhY3RHcmlkJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgcmVhY3RHcmlkcykge1xyXG4gICAgICAgIC8vIExvb2sgZm9yIGFjdGl2ZS9zZWxlY3RlZCByb3dcclxuICAgICAgICBjb25zdCBhY3RpdmVSb3cgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbltkYXRhLWR5bi1yb3ctYWN0aXZlPVwidHJ1ZVwiXScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IGFjdGl2ZVJvdy5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNlbGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIGluIGJvZHkgcm93c1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcclxuICAgICAgICAgICAgICAgIC8vIFNraXAgaWYgaW4gaGVhZGVyXHJcbiAgICAgICAgICAgICAgICBjb25zdCBpc0luSGVhZGVyID0gY2VsbC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVMYXlvdXRfaGVhZGVyLCAuZHluLWhlYWRlckNlbGwnKTtcclxuICAgICAgICAgICAgICAgIGlmICghaXNJbkhlYWRlciAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjZWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyeSB0byBmaW5kIGluIHRyYWRpdGlvbmFsIEQzNjUgZ3JpZCBjb250ZXh0XHJcbiAgICBjb25zdCBncmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIGdyaWRzKSB7XHJcbiAgICAgICAgLy8gRmluZCBhbGwgbWF0Y2hpbmcgY2VsbHMgYW5kIHByZWZlciB2aXNpYmxlL2VkaXRhYmxlIG9uZXNcclxuICAgICAgICBjb25zdCBjZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyBpbiBhIGRhdGEgcm93IChub3QgaGVhZGVyKVxyXG4gICAgICAgICAgICBjb25zdCBpc0luSGVhZGVyID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0sIHRoZWFkJyk7XHJcbiAgICAgICAgICAgIGlmICghaXNJbkhlYWRlciAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNlbGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmFsbGJhY2sgdG8gc3RhbmRhcmQgZWxlbWVudCBmaW5kaW5nXHJcbiAgICByZXR1cm4gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaGFzTG9va3VwQnV0dG9uKGVsZW1lbnQpIHtcclxuICAgIHJldHVybiBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmllbGQtaGFzTG9va3VwQnV0dG9uJykgfHxcclxuICAgICAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5sb29rdXAtYnV0dG9uLCBbZGF0YS1keW4tcm9sZT1cIkxvb2t1cEJ1dHRvblwiXScpICE9PSBudWxsIHx8XHJcbiAgICAgICAgZWxlbWVudC5uZXh0RWxlbWVudFNpYmxpbmc/LmNsYXNzTGlzdC5jb250YWlucygnbG9va3VwLWJ1dHRvbicpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZExvb2t1cEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbJy5sb29rdXAtYnV0dG9uJywgJy5sb29rdXBCdXR0b24nLCAnW2RhdGEtZHluLXJvbGU9XCJMb29rdXBCdXR0b25cIl0nXTtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgZGlyZWN0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoZGlyZWN0KSByZXR1cm4gZGlyZWN0O1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuaW5wdXRfY29udGFpbmVyLCAuZm9ybS1ncm91cCwgLmxvb2t1cEZpZWxkJykgfHwgZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybiBudWxsO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBpbkNvbnRhaW5lciA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoaW5Db250YWluZXIpIHJldHVybiBpbkNvbnRhaW5lcjtcclxuICAgIH1cclxuICAgIGNvbnN0IGFyaWFCdXR0b24gPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignYnV0dG9uW2FyaWEtbGFiZWwqPVwiTG9va3VwXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJPcGVuXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJTZWxlY3RcIl0nKTtcclxuICAgIGlmIChhcmlhQnV0dG9uKSByZXR1cm4gYXJpYUJ1dHRvbjtcclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZUdsb2JhbChlbGVtZW50KSB7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiBmYWxzZTtcclxuICAgIGNvbnN0IHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XHJcbiAgICByZXR1cm4gZWxlbWVudC5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiZcclxuICAgICAgICBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgIHN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBpY2tOZWFyZXN0Um93cyhyb3dzLCB0YXJnZXRFbGVtZW50KSB7XHJcbiAgICBpZiAoIXJvd3MubGVuZ3RoKSByZXR1cm4gcm93cztcclxuICAgIGNvbnN0IHRhcmdldFJlY3QgPSB0YXJnZXRFbGVtZW50Py5nZXRCb3VuZGluZ0NsaWVudFJlY3Q/LigpO1xyXG4gICAgaWYgKCF0YXJnZXRSZWN0KSByZXR1cm4gcm93cztcclxuICAgIHJldHVybiByb3dzLnNsaWNlKCkuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgIGNvbnN0IHJhID0gYS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCByYiA9IGIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgZGEgPSBNYXRoLmFicyhyYS5sZWZ0IC0gdGFyZ2V0UmVjdC5sZWZ0KSArIE1hdGguYWJzKHJhLnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICBjb25zdCBkYiA9IE1hdGguYWJzKHJiLmxlZnQgLSB0YXJnZXRSZWN0LmxlZnQpICsgTWF0aC5hYnMocmIudG9wIC0gdGFyZ2V0UmVjdC5ib3R0b20pO1xyXG4gICAgICAgIHJldHVybiBkYSAtIGRiO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9va3VwRmlsdGVySW5wdXQobG9va3VwRG9jaykge1xyXG4gICAgaWYgKCFsb29rdXBEb2NrKSByZXR1cm4gbnVsbDtcclxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBBcnJheS5mcm9tKFxyXG4gICAgICAgIGxvb2t1cERvY2sucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInRleHRcIl0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJylcclxuICAgICk7XHJcbiAgICBpZiAoIWNhbmRpZGF0ZXMubGVuZ3RoKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAvLyBQcmVmZXIgaW5wdXRzIGluc2lkZSBzZWdtZW50ZWQgZW50cnkgZmx5b3V0IChNYWluQWNjb3VudCBpbnB1dCBpbiB0aGUgcmlnaHQgcGFuZWwpXHJcbiAgICBjb25zdCBzZWdtZW50SW5wdXQgPSBjYW5kaWRhdGVzLmZpbmQoaW5wdXQgPT4gaW5wdXQuY2xvc2VzdCgnLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQnKSk7XHJcbiAgICBpZiAoc2VnbWVudElucHV0KSByZXR1cm4gc2VnbWVudElucHV0O1xyXG5cclxuICAgIC8vIFNvbWUgZmx5b3V0cyB3cmFwIHRoZSBpbnB1dCBpbiBhIGNvbnRhaW5lcjsgdHJ5IHRvIGZpbmQgdGhlIGFjdHVhbCBpbnB1dCBpbnNpZGVcclxuICAgIGNvbnN0IHNlZ21lbnRDb250YWluZXIgPSBsb29rdXBEb2NrLnF1ZXJ5U2VsZWN0b3IoJy5zZWdtZW50ZWRFbnRyeS1mbHlvdXRTZWdtZW50IC5zZWdtZW50ZWRFbnRyeS1zZWdtZW50SW5wdXQnKTtcclxuICAgIGlmIChzZWdtZW50Q29udGFpbmVyKSB7XHJcbiAgICAgICAgY29uc3QgaW5uZXIgPSBzZWdtZW50Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgICAgICBpZiAoaW5uZXIpIHJldHVybiBpbm5lcjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmVmZXIgaW5wdXRzIGluc2lkZSBncmlkIGhlYWRlci90b29sYmFyIG9yIG5lYXIgdGhlIHRvcC1yaWdodCAobGlrZSB0aGUgbWFya2VkIGJveClcclxuICAgIGNvbnN0IGhlYWRlckNhbmRpZGF0ZSA9IGNhbmRpZGF0ZXMuZmluZChpbnB1dCA9PlxyXG4gICAgICAgIGlucHV0LmNsb3Nlc3QoJy5sb29rdXAtaGVhZGVyLCAubG9va3VwLXRvb2xiYXIsIC5ncmlkLWhlYWRlciwgW3JvbGU9XCJ0b29sYmFyXCJdJylcclxuICAgICk7XHJcbiAgICBpZiAoaGVhZGVyQ2FuZGlkYXRlKSByZXR1cm4gaGVhZGVyQ2FuZGlkYXRlO1xyXG5cclxuICAgIGxldCBiZXN0ID0gY2FuZGlkYXRlc1swXTtcclxuICAgIGxldCBiZXN0U2NvcmUgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XHJcbiAgICBmb3IgKGNvbnN0IGlucHV0IG9mIGNhbmRpZGF0ZXMpIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gaW5wdXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3Qgc2NvcmUgPSByZWN0LnRvcCAqIDIgKyByZWN0LmxlZnQ7IC8vIGJpYXMgdG93YXJkcyB0b3Agcm93XHJcbiAgICAgICAgaWYgKHNjb3JlIDwgYmVzdFNjb3JlKSB7XHJcbiAgICAgICAgICAgIGJlc3RTY29yZSA9IHNjb3JlO1xyXG4gICAgICAgICAgICBiZXN0ID0gaW5wdXQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJlc3Q7XHJcbn1cclxuIiwgImltcG9ydCB7IHNsZWVwIH0gZnJvbSAnLi9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGlzRWxlbWVudFZpc2libGVHbG9iYWwsIHBpY2tOZWFyZXN0Um93cyB9IGZyb20gJy4vZG9tLmpzJztcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTG9va3VwUG9wdXAodGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcubG9va3VwLWJ1dHRvbkNvbnRhaW5lcicsXHJcbiAgICAgICAgJy5sb29rdXBEb2NrLWJ1dHRvbkNvbnRhaW5lcicsXHJcbiAgICAgICAgJ1tyb2xlPVwiZGlhbG9nXCJdJyxcclxuICAgICAgICAnLmxvb2t1cC1mbHlvdXQnLFxyXG4gICAgICAgICcubG9va3VwRmx5b3V0JyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0nLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkxvb2t1cEdyaWRcIl0nLFxyXG4gICAgICAgICcubG9va3VwLWNvbnRhaW5lcicsXHJcbiAgICAgICAgJy5sb29rdXAnLFxyXG4gICAgICAgICdbcm9sZT1cImdyaWRcIl0nLFxyXG4gICAgICAgICd0YWJsZSdcclxuICAgIF07XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9wdXAgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICAgICAgaWYgKCFwb3B1cCkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChwb3B1cC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdtZXNzYWdlQ2VudGVyJykpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAocG9wdXAuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPT09ICdBY3Rpb24gY2VudGVyJykgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZUdsb2JhbChwb3B1cCkpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gcG9wdXA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cERvY2ssIHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDMwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBsZXQgcm93cyA9IGxvb2t1cERvY2s/LnF1ZXJ5U2VsZWN0b3JBbGw/LigndHJbZGF0YS1keW4tcm93XSwgLmxvb2t1cC1yb3csIFtyb2xlPVwicm93XCJdJykgfHwgW107XHJcbiAgICAgICAgaWYgKHJvd3MubGVuZ3RoKSByZXR1cm4gcm93cztcclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IGZpbmQgdmlzaWJsZSBsb29rdXAgcm93cyBhbnl3aGVyZSAoc29tZSBkb2NrcyByZW5kZXIgb3V0c2lkZSB0aGUgY29udGFpbmVyKVxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFJvd3MgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXScpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpO1xyXG4gICAgICAgIGlmIChnbG9iYWxSb3dzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGlja05lYXJlc3RSb3dzKGdsb2JhbFJvd3MsIHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIFtdO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDMwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIGNvbnN0IHRhcmdldFJlY3QgPSB0YXJnZXRFbGVtZW50Py5nZXRCb3VuZGluZ0NsaWVudFJlY3Q/LigpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGRvY2tzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubG9va3VwRG9jay1idXR0b25Db250YWluZXInKSlcclxuICAgICAgICAgICAgLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGRvY2sgPT4gIWRvY2suY2xhc3NMaXN0Py5jb250YWlucygnbWVzc2FnZUNlbnRlcicpKTtcclxuXHJcbiAgICAgICAgaWYgKGRvY2tzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjb25zdCB3aXRoUm93cyA9IGRvY2tzLmZpbHRlcihkb2NrID0+IGRvY2sucXVlcnlTZWxlY3RvcigndHJbZGF0YS1keW4tcm93XSwgLmxvb2t1cC1yb3csIFtyb2xlPVwicm93XCJdLCBbcm9sZT1cImdyaWRcIl0sIHRhYmxlJykpO1xyXG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gd2l0aFJvd3MubGVuZ3RoID8gd2l0aFJvd3MgOiBkb2NrcztcclxuICAgICAgICAgICAgY29uc3QgYmVzdCA9IHBpY2tOZWFyZXN0RG9jayhjYW5kaWRhdGVzLCB0YXJnZXRSZWN0KTtcclxuICAgICAgICAgICAgaWYgKGJlc3QpIHJldHVybiBiZXN0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwaWNrTmVhcmVzdERvY2soZG9ja3MsIHRhcmdldFJlY3QpIHtcclxuICAgIGlmICghZG9ja3MubGVuZ3RoKSByZXR1cm4gbnVsbDtcclxuICAgIGlmICghdGFyZ2V0UmVjdCkgcmV0dXJuIGRvY2tzWzBdO1xyXG4gICAgbGV0IGJlc3QgPSBkb2Nrc1swXTtcclxuICAgIGxldCBiZXN0U2NvcmUgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XHJcbiAgICBmb3IgKGNvbnN0IGRvY2sgb2YgZG9ja3MpIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gZG9jay5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBkeCA9IE1hdGguYWJzKHJlY3QubGVmdCAtIHRhcmdldFJlY3QubGVmdCk7XHJcbiAgICAgICAgY29uc3QgZHkgPSBNYXRoLmFicyhyZWN0LnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICBjb25zdCBzY29yZSA9IGR4ICsgZHk7XHJcbiAgICAgICAgaWYgKHNjb3JlIDwgYmVzdFNjb3JlKSB7XHJcbiAgICAgICAgICAgIGJlc3RTY29yZSA9IHNjb3JlO1xyXG4gICAgICAgICAgICBiZXN0ID0gZG9jaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYmVzdDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMaXN0Ym94Rm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbJ1tyb2xlPVwibGlzdGJveFwiXScsICcuZHJvcERvd25MaXN0JywgJy5jb21ib0JveERyb3BEb3duJywgJy5kcm9wZG93bi1tZW51JywgJy5kcm9wZG93bi1saXN0J107XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBsaXN0cyA9IHNlbGVjdG9ycy5mbGF0TWFwKHNlbCA9PiBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsKSkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbCk7XHJcbiAgICAgICAgaWYgKGxpc3RzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGlja05lYXJlc3REb2NrKGxpc3RzLCB0YXJnZXRSZWN0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxpc3Rib3hGb3JJbnB1dChpbnB1dCwgdGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGxpbmtlZCA9IGdldExpc3Rib3hGcm9tSW5wdXQoaW5wdXQpO1xyXG4gICAgICAgIGlmIChsaW5rZWQgJiYgaXNFbGVtZW50VmlzaWJsZUdsb2JhbChsaW5rZWQpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBsaW5rZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGZhbGxiYWNrID0gYXdhaXQgd2FpdEZvckxpc3Rib3hGb3JFbGVtZW50KHRhcmdldEVsZW1lbnQsIDIwMCk7XHJcbiAgICAgICAgaWYgKGZhbGxiYWNrKSByZXR1cm4gZmFsbGJhY2s7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGlzdGJveEZyb21JbnB1dChpbnB1dCkge1xyXG4gICAgaWYgKCFpbnB1dCkgcmV0dXJuIG51bGw7XHJcbiAgICBjb25zdCBpZCA9IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycpIHx8IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1vd25zJyk7XHJcbiAgICBpZiAoaWQpIHtcclxuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcclxuICAgICAgICBpZiAoZWwpIHJldHVybiBlbDtcclxuICAgIH1cclxuICAgIGNvbnN0IGFjdGl2ZUlkID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnKTtcclxuICAgIGlmIChhY3RpdmVJZCkge1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZUlkKTtcclxuICAgICAgICBjb25zdCBsaXN0ID0gYWN0aXZlPy5jbG9zZXN0Py4oJ1tyb2xlPVwibGlzdGJveFwiXScpO1xyXG4gICAgICAgIGlmIChsaXN0KSByZXR1cm4gbGlzdDtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbWJvQm94QnV0dG9uKGVsZW1lbnQpIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnLmxvb2t1cEJ1dHRvbicsXHJcbiAgICAgICAgJy5jb21ib0JveC1idXR0b24nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtZHJvcERvd25CdXR0b24nLFxyXG4gICAgICAgICcuZHJvcGRvd25CdXR0b24nLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkRyb3BEb3duQnV0dG9uXCJdJyxcclxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwiT3BlblwiXScsXHJcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIlNlbGVjdFwiXSdcclxuICAgIF07XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGJ0biA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGJ0bikgcmV0dXJuIGJ0bjtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAnKSB8fCBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuIG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGJ0biA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoYnRuKSByZXR1cm4gYnRuO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0Q29tYm9PcHRpb25zKGxpc3Rib3gpIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnW3JvbGU9XCJvcHRpb25cIl0nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtbGlzdEl0ZW0nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtaXRlbScsXHJcbiAgICAgICAgJ2xpJyxcclxuICAgICAgICAnLmRyb3Bkb3duLWxpc3QtaXRlbScsXHJcbiAgICAgICAgJy5jb21ib0JveEl0ZW0nLFxyXG4gICAgICAgICcuZHJvcERvd25MaXN0SXRlbScsXHJcbiAgICAgICAgJy5kcm9wZG93bi1pdGVtJ1xyXG4gICAgXTtcclxuICAgIGNvbnN0IGZvdW5kID0gW107XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGxpc3Rib3gucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKGVsKSkgZm91bmQucHVzaChlbCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm91bmQubGVuZ3RoID8gZm91bmQgOiBBcnJheS5mcm9tKGxpc3Rib3guY2hpbGRyZW4pLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgc2xlZXAsIHNldE5hdGl2ZVZhbHVlIH0gZnJvbSAnLi9hc3luYy5qcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHlwZVZhbHVlU2xvd2x5KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBpbnB1dC5jbGljayA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBUeXBlIGNoYXJhY3RlciBieSBjaGFyYWN0ZXJcclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGJ1ZmZlcik7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDgwKTsgLy8gODBtcyBwZXIgY2hhcmFjdGVyXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuYmx1cigpO1xyXG4gICAgYXdhaXQgc2xlZXAoODAwKTsgLy8gV2FpdCBmb3IgdmFsaWRhdGlvblxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHlwZVZhbHVlV2l0aElucHV0RXZlbnRzKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBpbnB1dC5jbGljayA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoODApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlID8/ICcnKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGJ1ZmZlcik7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHsgZGF0YTogY2hhciwgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDYwKTtcclxuICAgIH1cclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9ySW5wdXRWYWx1ZShpbnB1dCwgdmFsdWUsIHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IGV4cGVjdGVkID0gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCk7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudCA9IFN0cmluZyhpbnB1dD8udmFsdWUgPz8gJycpLnRyaW0oKTtcclxuICAgICAgICBpZiAoY3VycmVudCA9PT0gZXhwZWN0ZWQpIHJldHVybiB0cnVlO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRWYWx1ZU9uY2UoaW5wdXQsIHZhbHVlLCBjbGVhckZpcnN0ID0gZmFsc2UpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgaWYgKGNsZWFyRmlyc3QpIHtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBleHBlY3RlZCA9IFN0cmluZyh2YWx1ZSA/PyAnJykudHJpbSgpO1xyXG4gICAgYXdhaXQgc2V0VmFsdWVPbmNlKGlucHV0LCB2YWx1ZSwgdHJ1ZSk7XHJcbiAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG4gICAgaWYgKFN0cmluZyhpbnB1dC52YWx1ZSA/PyAnJykudHJpbSgpICE9PSBleHBlY3RlZCkge1xyXG4gICAgICAgIGF3YWl0IHR5cGVWYWx1ZVNsb3dseShpbnB1dCwgZXhwZWN0ZWQpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT0gOCBDb21ib0JveCBJbnB1dCBNZXRob2RzID09PT09PT09PT09PVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCAxOiBCYXNpYyBzZXRWYWx1ZSAoZmFzdCBidXQgbWF5IG5vdCB0cmlnZ2VyIEQzNjUgZmlsdGVyaW5nKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QxKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCAyOiBQYXN0ZSBzaW11bGF0aW9uIHdpdGggSW5wdXRFdmVudFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QyKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQ2xlYXIgZmlyc3RcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBTaW11bGF0ZSBwYXN0ZVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2JlZm9yZWlucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21QYXN0ZScsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMzogQ2hhcmFjdGVyLWJ5LWNoYXJhY3RlciB3aXRoIGZ1bGwga2V5IGV2ZW50cyAoUkVDT01NRU5ERUQpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBDbGVhciB0aGUgaW5wdXQgZmlyc3RcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBrZXlkb3duXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgYmVmb3JlaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSB2YWx1ZVxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGlucHV0IGV2ZW50XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGtleXVwXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA0OiBDaGFyYWN0ZXItYnktY2hhcmFjdGVyIHdpdGgga2V5cHJlc3MgKGxlZ2FjeSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNChpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGNvbnN0IGNoYXJDb2RlID0gY2hhci5jaGFyQ29kZUF0KDApO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8ga2V5ZG93blxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8ga2V5cHJlc3MgKGRlcHJlY2F0ZWQgYnV0IHN0aWxsIHVzZWQgYnkgc29tZSBmcmFtZXdvcmtzKVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXByZXNzJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBjaGFyQ29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gYmVmb3JlaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSB2YWx1ZVxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICAvLyBpbnB1dFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8ga2V5dXBcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA1OiBleGVjQ29tbWFuZCBpbnNlcnRUZXh0XHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDUoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBTZWxlY3QgYWxsIGFuZCBkZWxldGVcclxuICAgIGlucHV0LnNlbGVjdCgpO1xyXG4gICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2RlbGV0ZScpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIEluc2VydCB0ZXh0XHJcbiAgICBkb2N1bWVudC5leGVjQ29tbWFuZCgnaW5zZXJ0VGV4dCcsIGZhbHNlLCB2YWx1ZSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA2OiBQYXN0ZSArIEJhY2tzcGFjZSB3b3JrYXJvdW5kXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDYoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBTZXQgdmFsdWUgZGlyZWN0bHkgKGxpa2UgcGFzdGUpXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBBZGQgYSBjaGFyYWN0ZXIgYW5kIGRlbGV0ZSBpdCB0byB0cmlnZ2VyIGZpbHRlcmluZ1xyXG4gICAgY29uc3QgdmFsdWVXaXRoRXh0cmEgPSB2YWx1ZSArICdYJztcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZVdpdGhFeHRyYSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgIGRhdGE6ICdYJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBOb3cgZGVsZXRlIHRoYXQgY2hhcmFjdGVyIHdpdGggYSByZWFsIGJhY2tzcGFjZSBldmVudFxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHtcclxuICAgICAgICBrZXk6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGNvZGU6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGtleUNvZGU6IDgsXHJcbiAgICAgICAgd2hpY2g6IDgsXHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHtcclxuICAgICAgICBrZXk6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGNvZGU6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGtleUNvZGU6IDgsXHJcbiAgICAgICAgd2hpY2g6IDgsXHJcbiAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNzogRDM2NSBpbnRlcm5hbCBtZWNoYW5pc20gdHJpZ2dlclxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q3KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2V0IHZhbHVlIHdpdGggZnVsbCBldmVudCBzZXF1ZW5jZSB1c2VkIGJ5IEQzNjVcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFR5cGUgY2hhcmFjdGVyIGJ5IGNoYXJhY3RlciBidXQgYWxzbyBkaXNwYXRjaCBvbiB0aGUgcGFyZW50IGNvbnRyb2xcclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGNvbnN0IHBhcmVudCA9IGlucHV0LmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlXScpIHx8IGlucHV0LnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBpbnB1dC52YWx1ZSArIGNoYXI7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBhIGNvbXByZWhlbnNpdmUgZXZlbnQgc2V0XHJcbiAgICAgICAgY29uc3Qga2V5Ym9hcmRFdmVudEluaXQgPSB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBjb21wb3NlZDogdHJ1ZSxcclxuICAgICAgICAgICAgdmlldzogd2luZG93XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBvbiBpbnB1dCBhbmQgcG90ZW50aWFsbHkgYnViYmxlIHRvIEQzNjUgaGFuZGxlcnNcclxuICAgICAgICBjb25zdCBrZXlkb3duRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIGtleWJvYXJkRXZlbnRJbml0KTtcclxuICAgICAgICBjb25zdCBrZXl1cEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywga2V5Ym9hcmRFdmVudEluaXQpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KGtleWRvd25FdmVudCk7XHJcblxyXG4gICAgICAgIC8vIFNldCB2YWx1ZSBCRUZPUkUgaW5wdXQgZXZlbnRcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyLFxyXG4gICAgICAgICAgICBjb21wb3NlZDogdHJ1ZSxcclxuICAgICAgICAgICAgdmlldzogd2luZG93XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KGtleXVwRXZlbnQpO1xyXG5cclxuICAgICAgICAvLyBBbHNvIGRpc3BhdGNoIG9uIHBhcmVudCBmb3IgRDM2NSBjb250cm9sc1xyXG4gICAgICAgIGlmIChwYXJlbnQgJiYgcGFyZW50ICE9PSBpbnB1dCkge1xyXG4gICAgICAgICAgICBwYXJlbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5hbCBjaGFuZ2UgZXZlbnRcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIC8vIFRyeSB0byB0cmlnZ2VyIEQzNjUncyBWYWx1ZUNoYW5nZWQgY29tbWFuZFxyXG4gICAgaWYgKHBhcmVudCkge1xyXG4gICAgICAgIHBhcmVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnVmFsdWVDaGFuZ2VkJywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBkZXRhaWw6IHsgdmFsdWU6IHZhbHVlIH1cclxuICAgICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA4OiBDb21wb3NpdGlvbiBldmVudHMgKElNRS1zdHlsZSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kOChpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gU3RhcnQgY29tcG9zaXRpb25cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoJ2NvbXBvc2l0aW9uc3RhcnQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgIGRhdGE6ICcnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGN1cnJlbnRWYWx1ZSA9ICcnO1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjdXJyZW50VmFsdWUgKz0gc3RyaW5nVmFsdWVbaV07XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoJ2NvbXBvc2l0aW9udXBkYXRlJywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBkYXRhOiBjdXJyZW50VmFsdWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0Q29tcG9zaXRpb25UZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY3VycmVudFZhbHVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRW5kIGNvbXBvc2l0aW9uXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbmVuZCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tQ29tcG9zaXRpb24nLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEhlbHBlciB0byBnZXQga2V5IGNvZGUgZnJvbSBjaGFyYWN0ZXJcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRLZXlDb2RlKGNoYXIpIHtcclxuICAgIGNvbnN0IHVwcGVyQ2hhciA9IGNoYXIudG9VcHBlckNhc2UoKTtcclxuICAgIGlmICh1cHBlckNoYXIgPj0gJ0EnICYmIHVwcGVyQ2hhciA8PSAnWicpIHtcclxuICAgICAgICByZXR1cm4gJ0tleScgKyB1cHBlckNoYXI7XHJcbiAgICB9XHJcbiAgICBpZiAoY2hhciA+PSAnMCcgJiYgY2hhciA8PSAnOScpIHtcclxuICAgICAgICByZXR1cm4gJ0RpZ2l0JyArIGNoYXI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBzcGVjaWFsS2V5cyA9IHtcclxuICAgICAgICAnICc6ICdTcGFjZScsXHJcbiAgICAgICAgJy0nOiAnTWludXMnLFxyXG4gICAgICAgICc9JzogJ0VxdWFsJyxcclxuICAgICAgICAnWyc6ICdCcmFja2V0TGVmdCcsXHJcbiAgICAgICAgJ10nOiAnQnJhY2tldFJpZ2h0JyxcclxuICAgICAgICAnXFxcXCc6ICdCYWNrc2xhc2gnLFxyXG4gICAgICAgICc7JzogJ1NlbWljb2xvbicsXHJcbiAgICAgICAgXCInXCI6ICdRdW90ZScsXHJcbiAgICAgICAgJywnOiAnQ29tbWEnLFxyXG4gICAgICAgICcuJzogJ1BlcmlvZCcsXHJcbiAgICAgICAgJy8nOiAnU2xhc2gnLFxyXG4gICAgICAgICdgJzogJ0JhY2txdW90ZSdcclxuICAgIH07XHJcbiAgICByZXR1cm4gc3BlY2lhbEtleXNbY2hhcl0gfHwgJ1VuaWRlbnRpZmllZCc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEaXNwYXRjaGVyIGZ1bmN0aW9uIC0gdXNlcyB0aGUgc2VsZWN0ZWQgaW5wdXQgbWV0aG9kIGZyb20gc2V0dGluZ3NcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgbWV0aG9kKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgW0QzNjVdIFVzaW5nIGNvbWJvYm94IGlucHV0IG1ldGhvZDogJHttZXRob2R9YCk7XHJcblxyXG4gICAgc3dpdGNoIChtZXRob2QpIHtcclxuICAgICAgICBjYXNlICdtZXRob2QxJzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QxKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kMic6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMihpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDMnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q0JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q0KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNSc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDYnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDYoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q3JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q3KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kOCc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kOChpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMyhpbnB1dCwgdmFsdWUpOyAvLyBEZWZhdWx0IHRvIG1ldGhvZCAzXHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb21taXRDb21ib1ZhbHVlKGlucHV0LCB2YWx1ZSwgZWxlbWVudCkge1xyXG4gICAgaWYgKCFpbnB1dCkgcmV0dXJuO1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnZm9jdXNvdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VzY2FwZScsIGNvZGU6ICdFc2NhcGUnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFc2NhcGUnLCBjb2RlOiAnRXNjYXBlJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5ibHVyKCk7XHJcbiAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB9XHJcbiAgICBkb2N1bWVudC5ib2R5Py5jbGljaz8uKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkaXNwYXRjaENsaWNrU2VxdWVuY2UodGFyZ2V0KSB7XHJcbiAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVydXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmNsaWNrKCk7XHJcbn1cclxuIiwgImltcG9ydCB7IGxvZ1N0ZXAgfSBmcm9tICcuLi91dGlscy9sb2dnaW5nLmpzJztcclxuaW1wb3J0IHsgc2V0TmF0aXZlVmFsdWUsIHNsZWVwIH0gZnJvbSAnLi4vdXRpbHMvYXN5bmMuanMnO1xyXG5pbXBvcnQgeyBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCwgaXNFbGVtZW50VmlzaWJsZSwgaXNEMzY1TG9hZGluZywgZmluZEdyaWRDZWxsRWxlbWVudCwgaGFzTG9va3VwQnV0dG9uLCBmaW5kTG9va3VwQnV0dG9uLCBmaW5kTG9va3VwRmlsdGVySW5wdXQgfSBmcm9tICcuLi91dGlscy9kb20uanMnO1xyXG5pbXBvcnQgeyB3YWl0Rm9yTG9va3VwUG9wdXAsIHdhaXRGb3JMb29rdXBSb3dzLCB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQsIHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQsIGNvbGxlY3RDb21ib09wdGlvbnMsIGZpbmRDb21ib0JveEJ1dHRvbiB9IGZyb20gJy4uL3V0aWxzL2xvb2t1cC5qcyc7XHJcbmltcG9ydCB7IHR5cGVWYWx1ZVNsb3dseSwgdHlwZVZhbHVlV2l0aElucHV0RXZlbnRzLCB3YWl0Rm9ySW5wdXRWYWx1ZSwgc2V0VmFsdWVPbmNlLCBzZXRWYWx1ZVdpdGhWZXJpZnksIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QgYXMgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZFdpdGhNb2RlLCBjb21taXRDb21ib1ZhbHVlLCBkaXNwYXRjaENsaWNrU2VxdWVuY2UgfSBmcm9tICcuLi91dGlscy9jb21ib2JveC5qcyc7XHJcbmltcG9ydCB7IGNvZXJjZUJvb2xlYW4sIG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuLi91dGlscy90ZXh0LmpzJztcclxuaW1wb3J0IHsgTmF2aWdhdGlvbkludGVycnVwdEVycm9yIH0gZnJvbSAnLi4vcnVudGltZS9lcnJvcnMuanMnO1xyXG5cclxuZnVuY3Rpb24gY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUpIHtcclxuICAgIGNvbnN0IG1ldGhvZCA9IHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3M/LmNvbWJvU2VsZWN0TW9kZSB8fCAnbWV0aG9kMyc7XHJcbiAgICByZXR1cm4gY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZFdpdGhNb2RlKGlucHV0LCB2YWx1ZSwgbWV0aG9kKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSB7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ1NlZ21lbnRlZEVudHJ5JykgcmV0dXJuIHRydWU7XHJcbiAgICBpZiAoZWxlbWVudC5jbG9zZXN0Py4oJ1tkYXRhLWR5bi1yb2xlPVwiU2VnbWVudGVkRW50cnlcIl0nKSkgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgY29uc3QgY2xhc3NMaXN0ID0gZWxlbWVudC5jbGFzc0xpc3Q7XHJcbiAgICBpZiAoY2xhc3NMaXN0ICYmIChjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZEVudHJ5JykgfHxcclxuICAgICAgICBjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZC1lbnRyeScpIHx8XHJcbiAgICAgICAgY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWdtZW50ZWRFbnRyeS1zZWdtZW50SW5wdXQnKSkpIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gISFlbGVtZW50LnF1ZXJ5U2VsZWN0b3I/LignLnNlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCwgLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsaWNrRWxlbWVudChjb250cm9sTmFtZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIFxyXG4gICAgZWxlbWVudC5jbGljaygpO1xyXG4gICAgYXdhaXQgc2xlZXAoODAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5R3JpZEZpbHRlcihjb250cm9sTmFtZSwgZmlsdGVyVmFsdWUsIGZpbHRlck1ldGhvZCA9ICdpcyBleGFjdGx5Jykge1xyXG4gICAgY29uc29sZS5sb2coYEFwcGx5aW5nIGZpbHRlcjogJHtjb250cm9sTmFtZX0gJHtmaWx0ZXJNZXRob2R9IFwiJHtmaWx0ZXJWYWx1ZX1cImApO1xyXG4gICAgXHJcbiAgICAvLyBFeHRyYWN0IGdyaWQgbmFtZSBhbmQgY29sdW1uIG5hbWUgZnJvbSBjb250cm9sTmFtZVxyXG4gICAgLy8gRm9ybWF0OiBHcmlkTmFtZV9Db2x1bW5OYW1lIChlLmcuLCBcIkdyaWRSZWFkT25seU1hcmt1cFRhYmxlX01hcmt1cENvZGVcIilcclxuICAgIGNvbnN0IGxhc3RVbmRlcnNjb3JlSWR4ID0gY29udHJvbE5hbWUubGFzdEluZGV4T2YoJ18nKTtcclxuICAgIGNvbnN0IGdyaWROYW1lID0gY29udHJvbE5hbWUuc3Vic3RyaW5nKDAsIGxhc3RVbmRlcnNjb3JlSWR4KTtcclxuICAgIGNvbnN0IGNvbHVtbk5hbWUgPSBjb250cm9sTmFtZS5zdWJzdHJpbmcobGFzdFVuZGVyc2NvcmVJZHggKyAxKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYCAgR3JpZDogJHtncmlkTmFtZX0sIENvbHVtbjogJHtjb2x1bW5OYW1lfWApO1xyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gZmluZCBmaWx0ZXIgaW5wdXQgd2l0aCBtdWx0aXBsZSBwYXR0ZXJuc1xyXG4gICAgYXN5bmMgZnVuY3Rpb24gZmluZEZpbHRlcklucHV0KCkge1xyXG4gICAgICAgIC8vIEQzNjUgY3JlYXRlcyBmaWx0ZXIgaW5wdXRzIHdpdGggdmFyaW91cyBwYXR0ZXJuc1xyXG4gICAgICAgIGNvbnN0IGZpbHRlckZpZWxkUGF0dGVybnMgPSBbXHJcbiAgICAgICAgICAgIGBGaWx0ZXJGaWVsZF8ke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXHJcbiAgICAgICAgICAgIGBGaWx0ZXJGaWVsZF8ke2NvbnRyb2xOYW1lfV8ke2NvbHVtbk5hbWV9X0lucHV0XzBgLFxyXG4gICAgICAgICAgICBgRmlsdGVyRmllbGRfJHtjb250cm9sTmFtZX1fSW5wdXRfMGAsXHJcbiAgICAgICAgICAgIGBGaWx0ZXJGaWVsZF8ke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9X0lucHV0XzBgLFxyXG4gICAgICAgICAgICAvLyBBZGRpdGlvbmFsIHBhdHRlcm5zIGZvciBkaWZmZXJlbnQgRDM2NSB2ZXJzaW9uc1xyXG4gICAgICAgICAgICBgJHtjb250cm9sTmFtZX1fRmlsdGVyRmllbGRfSW5wdXRgLFxyXG4gICAgICAgICAgICBgJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV9GaWx0ZXJGaWVsZGBcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBmaWx0ZXJJbnB1dCA9IG51bGw7XHJcbiAgICAgICAgbGV0IGZpbHRlckZpZWxkQ29udGFpbmVyID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgZXhhY3QgcGF0dGVybnMgZmlyc3RcclxuICAgICAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgZmlsdGVyRmllbGRQYXR0ZXJucykge1xyXG4gICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7cGF0dGVybn1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlckZpZWxkQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBmaWx0ZXJJbnB1dCA9IGZpbHRlckZpZWxkQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIGZpbHRlciBmaWVsZDogJHtwYXR0ZXJufWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBwYXJ0aWFsIG1hdGNoIG9uIEZpbHRlckZpZWxkIGNvbnRhaW5pbmcgdGhlIGNvbHVtbiBuYW1lXHJcbiAgICAgICAgY29uc3QgcGFydGlhbE1hdGNoZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl1bZGF0YS1keW4tY29udHJvbG5hbWUqPVwiJHtjb2x1bW5OYW1lfVwiXWApO1xyXG4gICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIHBhcnRpYWxNYXRjaGVzKSB7XHJcbiAgICAgICAgICAgIGZpbHRlcklucHV0ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgZmlsdGVyIGZpZWxkIChwYXJ0aWFsIG1hdGNoKTogJHtjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBjb250YWluZXIgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjazogRmluZCBhbnkgdmlzaWJsZSBmaWx0ZXIgaW5wdXQgaW4gZmlsdGVyIGRyb3Bkb3duL2ZseW91dCBhcmVhXHJcbiAgICAgICAgLy8gTG9vayBmb3IgaW5wdXRzIGluc2lkZSBmaWx0ZXItcmVsYXRlZCBjb250YWluZXJzXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQ29udGFpbmVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5keW4tZmlsdGVyLXBvcHVwLCAuZmlsdGVyLXBhbmVsLCBbZGF0YS1keW4tcm9sZT1cIkZpbHRlclBhbmVcIl0sIFtjbGFzcyo9XCJmaWx0ZXJcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNvbnRhaW5lciBvZiBmaWx0ZXJDb250YWluZXJzKSB7XHJcbiAgICAgICAgICAgIGZpbHRlcklucHV0ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSk6bm90KFtyZWFkb25seV0pJyk7XHJcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJbnB1dCAmJiBmaWx0ZXJJbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIGZpbHRlciBpbnB1dCBpbiBmaWx0ZXIgY29udGFpbmVyYCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXI6IGNvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIExhc3QgcmVzb3J0OiBBbnkgdmlzaWJsZSBGaWx0ZXJGaWVsZCBpbnB1dFxyXG4gICAgICAgIGNvbnN0IHZpc2libGVGaWx0ZXJJbnB1dHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl0gaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaW5wIG9mIHZpc2libGVGaWx0ZXJJbnB1dHMpIHtcclxuICAgICAgICAgICAgaWYgKGlucC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyID0gaW5wLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXScpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgdmlzaWJsZSBmaWx0ZXIgZmllbGQ6ICR7ZmlsdGVyRmllbGRDb250YWluZXI/LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKX1gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0OiBpbnAsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQ6IG51bGwsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBudWxsIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZpcnN0LCBjaGVjayBpZiB0aGUgZmlsdGVyIHBhbmVsIGlzIGFscmVhZHkgb3BlblxyXG4gICAgbGV0IHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH0gPSBhd2FpdCBmaW5kRmlsdGVySW5wdXQoKTtcclxuICAgIFxyXG4gICAgLy8gSWYgZmlsdGVyIGlucHV0IG5vdCBmb3VuZCwgd2UgbmVlZCB0byBjbGljayB0aGUgY29sdW1uIGhlYWRlciB0byBvcGVuIHRoZSBmaWx0ZXIgZHJvcGRvd25cclxuICAgIGlmICghZmlsdGVySW5wdXQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBGaWx0ZXIgcGFuZWwgbm90IG9wZW4sIGNsaWNraW5nIGhlYWRlciB0byBvcGVuLi4uYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCB0aGUgYWN0dWFsIGhlYWRlciBjZWxsXHJcbiAgICAgICAgY29uc3QgYWxsSGVhZGVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgbGV0IGNsaWNrVGFyZ2V0ID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IGggb2YgYWxsSGVhZGVycykge1xyXG4gICAgICAgICAgICBpZiAoaC5jbGFzc0xpc3QuY29udGFpbnMoJ2R5bi1oZWFkZXJDZWxsJykgfHwgXHJcbiAgICAgICAgICAgICAgICBoLmlkPy5pbmNsdWRlcygnaGVhZGVyJykgfHxcclxuICAgICAgICAgICAgICAgIGguY2xvc2VzdCgnLmR5bi1oZWFkZXJDZWxsJykgfHxcclxuICAgICAgICAgICAgICAgIGguY2xvc2VzdCgnW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0nKSkge1xyXG4gICAgICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBoO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGJ5IElEIHBhdHRlcm5cclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2lkKj1cIiR7Y29udHJvbE5hbWV9XCJdW2lkKj1cImhlYWRlclwiXWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBmaXJzdCBlbGVtZW50IHdpdGggY29udHJvbE5hbWVcclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjbGlja1RhcmdldCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZpbHRlciBjb2x1bW4gaGVhZGVyIG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MDApOyAvLyBXYWl0IGxvbmdlciBmb3IgZHJvcGRvd24gdG8gb3BlblxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJldHJ5IGZpbmRpbmcgdGhlIGZpbHRlciBpbnB1dCB3aXRoIGEgd2FpdCBsb29wXHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCAxMDsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgICAgICAgICh7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9ID0gYXdhaXQgZmluZEZpbHRlcklucHV0KCkpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQpIGJyZWFrO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFmaWx0ZXJJbnB1dCkge1xyXG4gICAgICAgIC8vIERlYnVnOiBMb2cgd2hhdCBlbGVtZW50cyB3ZSBjYW4gZmluZFxyXG4gICAgICAgIGNvbnN0IGFsbEZpbHRlckZpZWxkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXScpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIERlYnVnOiBGb3VuZCAke2FsbEZpbHRlckZpZWxkcy5sZW5ndGh9IEZpbHRlckZpZWxkIGVsZW1lbnRzOmApO1xyXG4gICAgICAgIGFsbEZpbHRlckZpZWxkcy5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgICAtICR7ZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpfSwgdmlzaWJsZTogJHtlbC5vZmZzZXRQYXJlbnQgIT09IG51bGx9YCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGaWx0ZXIgaW5wdXQgbm90IGZvdW5kLiBNYWtlIHN1cmUgdGhlIGZpbHRlciBkcm9wZG93biBpcyBvcGVuLiBFeHBlY3RlZCBwYXR0ZXJuOiBGaWx0ZXJGaWVsZF8ke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGVwIDQ6IFNldCB0aGUgZmlsdGVyIG1ldGhvZCBpZiBub3QgXCJpcyBleGFjdGx5XCIgKGRlZmF1bHQpXHJcbiAgICBpZiAoZmlsdGVyTWV0aG9kICYmIGZpbHRlck1ldGhvZCAhPT0gJ2lzIGV4YWN0bHknKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0RmlsdGVyTWV0aG9kKGZpbHRlckZpZWxkQ29udGFpbmVyLCBmaWx0ZXJNZXRob2QpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGVwIDU6IEVudGVyIHRoZSBmaWx0ZXIgdmFsdWVcclxuICAgIGZpbHRlcklucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgZmlsdGVySW5wdXQuc2VsZWN0KCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlIGZpcnN0XHJcbiAgICBmaWx0ZXJJbnB1dC52YWx1ZSA9ICcnO1xyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIFNldCB0aGUgdmFsdWUgdXNpbmcgbmF0aXZlIHNldHRlclxyXG4gICAgc2V0TmF0aXZlVmFsdWUoZmlsdGVySW5wdXQsIGZpbHRlclZhbHVlKTtcclxuICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNjogQXBwbHkgdGhlIGZpbHRlciAtIGZpbmQgYW5kIGNsaWNrIHRoZSBBcHBseSBidXR0b25cclxuICAgIC8vIElNUE9SVEFOVDogVGhlIHBhdHRlcm4gaXMge0dyaWROYW1lfV97Q29sdW1uTmFtZX1fQXBwbHlGaWx0ZXJzLCBub3QganVzdCB7R3JpZE5hbWV9X0FwcGx5RmlsdGVyc1xyXG4gICAgY29uc3QgYXBwbHlCdG5QYXR0ZXJucyA9IFtcclxuICAgICAgICBgJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV9BcHBseUZpbHRlcnNgLCAgLy8gTW9zdCBjb21tb246IEdyaWRSZWFkT25seU1hcmt1cFRhYmxlX01hcmt1cENvZGVfQXBwbHlGaWx0ZXJzXHJcbiAgICAgICAgYCR7Y29udHJvbE5hbWV9X0FwcGx5RmlsdGVyc2AsXHJcbiAgICAgICAgYCR7Z3JpZE5hbWV9X0FwcGx5RmlsdGVyc2AsXHJcbiAgICAgICAgYEFwcGx5RmlsdGVyc2BcclxuICAgIF07XHJcbiAgICBcclxuICAgIGxldCBhcHBseUJ0biA9IG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgYXBwbHlCdG5QYXR0ZXJucykge1xyXG4gICAgICAgIGFwcGx5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtwYXR0ZXJufVwiXWApO1xyXG4gICAgICAgIGlmIChhcHBseUJ0biAmJiBhcHBseUJ0bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgYXBwbHkgYnV0dG9uOiAke3BhdHRlcm59YCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmFsbGJhY2s6IGZpbmQgYW55IHZpc2libGUgQXBwbHlGaWx0ZXJzIGJ1dHRvblxyXG4gICAgaWYgKCFhcHBseUJ0biB8fCBhcHBseUJ0bi5vZmZzZXRQYXJlbnQgPT09IG51bGwpIHtcclxuICAgICAgICBjb25zdCBhbGxBcHBseUJ0bnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiQXBwbHlGaWx0ZXJzXCJdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBidG4gb2YgYWxsQXBwbHlCdG5zKSB7XHJcbiAgICAgICAgICAgIGlmIChidG4ub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBhcHBseUJ0biA9IGJ0bjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoYXBwbHlCdG4pIHtcclxuICAgICAgICBhcHBseUJ0bi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBGaWx0ZXIgYXBwbGllZDogXCIke2ZpbHRlclZhbHVlfVwiYCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFRyeSBwcmVzc2luZyBFbnRlciBhcyBhbHRlcm5hdGl2ZVxyXG4gICAgICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IFxyXG4gICAgICAgICAgICBrZXk6ICdFbnRlcicsIGtleUNvZGU6IDEzLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsgXHJcbiAgICAgICAgICAgIGtleTogJ0VudGVyJywga2V5Q29kZTogMTMsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBGaWx0ZXIgYXBwbGllZCB2aWEgRW50ZXI6IFwiJHtmaWx0ZXJWYWx1ZX1cImApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdFVudGlsQ29uZGl0aW9uKGNvbnRyb2xOYW1lLCBjb25kaXRpb24sIGV4cGVjdGVkVmFsdWUsIHRpbWVvdXQpIHtcclxuICAgIGNvbnNvbGUubG9nKGBXYWl0aW5nIGZvcjogJHtjb250cm9sTmFtZX0gdG8gYmUgJHtjb25kaXRpb259ICh0aW1lb3V0OiAke3RpbWVvdXR9bXMpYCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICBcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDwgdGltZW91dCkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBjb25kaXRpb25NZXQgPSBmYWxzZTtcclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKGNvbmRpdGlvbikge1xyXG4gICAgICAgICAgICBjYXNlICd2aXNpYmxlJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGFuZCBpcyB2aXNpYmxlIChoYXMgbGF5b3V0KVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCAmJiBlbGVtZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJiBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgIT09ICdub25lJztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2hpZGRlbic6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGRvZXNuJ3QgZXhpc3Qgb3IgaXMgbm90IHZpc2libGVcclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9ICFlbGVtZW50IHx8IGVsZW1lbnQub2Zmc2V0UGFyZW50ID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ID09PSAnbm9uZSc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdleGlzdHMnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBleGlzdHMgaW4gRE9NXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBlbGVtZW50ICE9PSBudWxsO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnbm90LWV4aXN0cyc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGRvZXMgbm90IGV4aXN0IGluIERPTVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCA9PT0gbnVsbDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2VuYWJsZWQnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBleGlzdHMgYW5kIGlzIG5vdCBkaXNhYmxlZFxyXG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIGJ1dHRvbiwgc2VsZWN0LCB0ZXh0YXJlYScpIHx8IGVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gIWlucHV0LmRpc2FibGVkICYmICFpbnB1dC5oYXNBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2hhcy12YWx1ZSc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGhhcyBhIHNwZWNpZmljIHZhbHVlXHJcbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCcpIHx8IGVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gaW5wdXQudmFsdWUgfHwgaW5wdXQudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gY3VycmVudFZhbHVlLnRyaW0oKSA9PT0gU3RyaW5nKGV4cGVjdGVkVmFsdWUpLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29uZGl0aW9uTWV0KSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBDb25kaXRpb24gbWV0OiAke2NvbnRyb2xOYW1lfSBpcyAke2NvbmRpdGlvbn1gKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTsgLy8gU21hbGwgc3RhYmlsaXR5IGRlbGF5XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBUaW1lb3V0IHdhaXRpbmcgZm9yIFwiJHtjb250cm9sTmFtZX1cIiB0byBiZSAke2NvbmRpdGlvbn0gKHdhaXRlZCAke3RpbWVvdXR9bXMpYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRJbnB1dFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSwgZmllbGRUeXBlKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIC8vIEZvciBTZWdtZW50ZWRFbnRyeSBmaWVsZHMgKEFjY291bnQsIGV0YyksIHVzZSBsb29rdXAgYnV0dG9uIGFwcHJvYWNoXHJcbiAgICBpZiAoZmllbGRUeXBlPy50eXBlID09PSAnc2VnbWVudGVkLWxvb2t1cCcgfHwgaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSkge1xyXG4gICAgICAgIGF3YWl0IHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgQ29tYm9Cb3gvZW51bSBmaWVsZHMsIG9wZW4gZHJvcGRvd24gYW5kIHNlbGVjdFxyXG4gICAgaWYgKGZpZWxkVHlwZT8uaW5wdXRUeXBlID09PSAnZW51bScgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0NvbWJvQm94Jykge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgUmFkaW9CdXR0b24vRnJhbWVPcHRpb25CdXR0b24gZ3JvdXBzLCBjbGljayB0aGUgY29ycmVjdCBvcHRpb25cclxuICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgaWYgKHJvbGUgPT09ICdSYWRpb0J1dHRvbicgfHwgcm9sZSA9PT0gJ0ZyYW1lT3B0aW9uQnV0dG9uJyB8fCBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwicmFkaW9cIl0sIGlucHV0W3R5cGU9XCJyYWRpb1wiXScpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0UmFkaW9CdXR0b25WYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKGBJbnB1dCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgLy8gRm9jdXMgdGhlIGlucHV0IGZpcnN0XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuXHJcbiAgICBpZiAoaW5wdXQudGFnTmFtZSAhPT0gJ1NFTEVDVCcpIHtcclxuICAgICAgICAvLyBVc2UgdGhlIHNlbGVjdGVkIGNvbWJvYm94IGlucHV0IG1ldGhvZFxyXG4gICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXNwYXRjaCBldmVudHNcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDQwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRHcmlkQ2VsbFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSwgZmllbGRUeXBlLCB3YWl0Rm9yVmFsaWRhdGlvbiA9IGZhbHNlKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgU2V0dGluZyBncmlkIGNlbGwgdmFsdWU6ICR7Y29udHJvbE5hbWV9ID0gXCIke3ZhbHVlfVwiICh3YWl0Rm9yVmFsaWRhdGlvbj0ke3dhaXRGb3JWYWxpZGF0aW9ufSlgKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgY2VsbCBlbGVtZW50IC0gcHJlZmVyIHRoZSBvbmUgaW4gYW4gYWN0aXZlL3NlbGVjdGVkIHJvd1xyXG4gICAgbGV0IGVsZW1lbnQgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgIFxyXG4gICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IGNsaWNraW5nIG9uIHRoZSBncmlkIHJvdyBmaXJzdCB0byBhY3RpdmF0ZSBpdFxyXG4gICAgICAgIGF3YWl0IGFjdGl2YXRlR3JpZFJvdyhjb250cm9sTmFtZSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghZWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR3JpZCBjZWxsIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHMsIHdlIG5lZWQgdG8gY2xpY2sgb24gdGhlIGNlbGwgdG8gZW50ZXIgZWRpdCBtb2RlXHJcbiAgICAvLyBGaW5kIHRoZSBhY3R1YWwgY2VsbCBjb250YWluZXIgKGZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluKVxyXG4gICAgY29uc3QgcmVhY3RDZWxsID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKSB8fCBlbGVtZW50O1xyXG4gICAgY29uc3QgaXNSZWFjdEdyaWQgPSAhIWVsZW1lbnQuY2xvc2VzdCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgXHJcbiAgICAvLyBDbGljayBvbiB0aGUgY2VsbCB0byBhY3RpdmF0ZSBpdCBmb3IgZWRpdGluZ1xyXG4gICAgY29uc29sZS5sb2coYCAgQ2xpY2tpbmcgY2VsbCB0byBhY3RpdmF0ZTogaXNSZWFjdEdyaWQ9JHtpc1JlYWN0R3JpZH1gKTtcclxuICAgIHJlYWN0Q2VsbC5jbGljaygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gRm9yIFJlYWN0IGdyaWRzLCBEMzY1IHJlbmRlcnMgaW5wdXQgZmllbGRzIGR5bmFtaWNhbGx5IGFmdGVyIGNsaWNraW5nXHJcbiAgICAvLyBXZSBuZWVkIHRvIHJlLWZpbmQgdGhlIGVsZW1lbnQgYWZ0ZXIgY2xpY2tpbmcgYXMgRDM2NSBtYXkgaGF2ZSByZXBsYWNlZCB0aGUgRE9NXHJcbiAgICBpZiAoaXNSZWFjdEdyaWQpIHtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApOyAvLyBFeHRyYSB3YWl0IGZvciBSZWFjdCB0byByZW5kZXIgaW5wdXRcclxuICAgICAgICBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgR3JpZCBjZWxsIGVsZW1lbnQgbm90IGZvdW5kIGFmdGVyIGNsaWNrOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGhlIGNsaWNrIHNob3VsZCBhY3RpdmF0ZSB0aGUgY2VsbCAtIG5vdyBmaW5kIHRoZSBpbnB1dFxyXG4gICAgbGV0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGlucHV0IGZvdW5kIGRpcmVjdGx5LCBsb29rIGluIHRoZSBjZWxsIGNvbnRhaW5lclxyXG4gICAgaWYgKCFpbnB1dCAmJiBpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGNvbnN0IGNlbGxDb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpO1xyXG4gICAgICAgIGlmIChjZWxsQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGlucHV0ID0gY2VsbENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBJZiBubyBpbnB1dCBmb3VuZCBkaXJlY3RseSwgdHJ5IGdldHRpbmcgaXQgYWZ0ZXIgY2xpY2sgYWN0aXZhdGlvbiB3aXRoIHJldHJ5XHJcbiAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCA1OyBhdHRlbXB0KyspIHtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICAgICAgaWYgKGlucHV0ICYmIGlucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBBbHNvIGNoZWNrIGlmIGEgbmV3IGlucHV0IGFwcGVhcmVkIGluIHRoZSBjZWxsXHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxDb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpO1xyXG4gICAgICAgICAgICBpZiAoY2VsbENvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQgPSBjZWxsQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICAgICAgICAgIGlmIChpbnB1dCAmJiBpbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGlsbCBubyBpbnB1dD8gQ2hlY2sgaWYgdGhlIGVsZW1lbnQgaXRzZWxmIGlzIGFuIGlucHV0XHJcbiAgICBpZiAoIWlucHV0ICYmIChlbGVtZW50LnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgZWxlbWVudC50YWdOYW1lID09PSAnVEVYVEFSRUEnIHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gJ1NFTEVDVCcpKSB7XHJcbiAgICAgICAgaW5wdXQgPSBlbGVtZW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gZmluZCBpbnB1dCBpbiB0aGUgcGFyZW50IHJvd1xyXG4gICAgaWYgKCFpbnB1dCkge1xyXG4gICAgICAgIGNvbnN0IHJvdyA9IGVsZW1lbnQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4sIFtkYXRhLWR5bi1yb2xlPVwiUm93XCJdLCBbcm9sZT1cInJvd1wiXSwgdHInKTtcclxuICAgICAgICBpZiAocm93KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvc3NpYmxlSW5wdXRzID0gcm93LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdIGlucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdIHRleHRhcmVhYCk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgaW5wIG9mIHBvc3NpYmxlSW5wdXRzKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5wLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlucHV0ID0gaW5wO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBMYXN0IHJlc29ydDogZmluZCBhbnkgdmlzaWJsZSBpbnB1dCBpbiB0aGUgYWN0aXZlIGNlbGwgYXJlYVxyXG4gICAgaWYgKCFpbnB1dCAmJiBpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUNlbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuZHluLWFjdGl2ZVJvd0NlbGwsIC5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbjpmb2N1cy13aXRoaW4nKTtcclxuICAgICAgICBpZiAoYWN0aXZlQ2VsbCkge1xyXG4gICAgICAgICAgICBpbnB1dCA9IGFjdGl2ZUNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFpbnB1dCkge1xyXG4gICAgICAgIC8vIExvZyBhdmFpbGFibGUgZWxlbWVudHMgZm9yIGRlYnVnZ2luZ1xyXG4gICAgICAgIGNvbnN0IGdyaWRDb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5yZWFjdEdyaWQsIFtkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgICAgIGNvbnN0IGFsbElucHV0cyA9IGdyaWRDb250YWluZXI/LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQXZhaWxhYmxlIGlucHV0cyBpbiBncmlkOicsIEFycmF5LmZyb20oYWxsSW5wdXRzIHx8IFtdKS5tYXAoaSA9PiAoe1xyXG4gICAgICAgICAgICBuYW1lOiBpLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKT8uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpLFxyXG4gICAgICAgICAgICB2aXNpYmxlOiBpLm9mZnNldFBhcmVudCAhPT0gbnVsbFxyXG4gICAgICAgIH0pKSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnB1dCBub3QgZm91bmQgaW4gZ3JpZCBjZWxsOiAke2NvbnRyb2xOYW1lfS4gVGhlIGNlbGwgbWF5IG5lZWQgdG8gYmUgY2xpY2tlZCB0byBiZWNvbWUgZWRpdGFibGUuYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIERldGVybWluZSBmaWVsZCB0eXBlIGFuZCB1c2UgYXBwcm9wcmlhdGUgc2V0dGVyXHJcbiAgICBjb25zdCByb2xlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgIFxyXG4gICAgaWYgKGZpZWxkVHlwZT8udHlwZSA9PT0gJ3NlZ21lbnRlZC1sb29rdXAnIHx8IHJvbGUgPT09ICdTZWdtZW50ZWRFbnRyeScgfHwgaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSkge1xyXG4gICAgICAgIGF3YWl0IHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGZpZWxkVHlwZT8uaW5wdXRUeXBlID09PSAnZW51bScgfHwgcm9sZSA9PT0gJ0NvbWJvQm94Jykge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgZm9yIGxvb2t1cCBmaWVsZHNcclxuICAgIGlmIChyb2xlID09PSAnTG9va3VwJyB8fCByb2xlID09PSAnUmVmZXJlbmNlR3JvdXAnIHx8IGhhc0xvb2t1cEJ1dHRvbihlbGVtZW50KSkge1xyXG4gICAgICAgIGF3YWl0IHNldExvb2t1cFNlbGVjdFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGFuZGFyZCBpbnB1dCAtIGZvY3VzIGFuZCBzZXQgdmFsdWVcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgXHJcbiAgICAvLyBDbGVhciBleGlzdGluZyB2YWx1ZVxyXG4gICAgaW5wdXQuc2VsZWN0Py4oKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIFxyXG4gICAgLy8gVXNlIHRoZSBzdGFuZGFyZCBpbnB1dCBtZXRob2RcclxuICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlKTtcclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZXZlbnRzXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgXHJcbiAgICAvLyBGb3IgZ3JpZCBjZWxscywgd2UgbmVlZCB0byBwcm9wZXJseSBjb21taXQgdGhlIHZhbHVlXHJcbiAgICAvLyBEMzY1IFJlYWN0IGdyaWRzIHJlcXVpcmUgdGhlIGNlbGwgdG8gbG9zZSBmb2N1cyBmb3IgdmFsaWRhdGlvbiB0byBvY2N1clxyXG4gICAgXHJcbiAgICAvLyBNZXRob2QgMTogUHJlc3MgRW50ZXIgdG8gY29uZmlybSB0aGUgdmFsdWUgKGltcG9ydGFudCBmb3IgbG9va3VwIGZpZWxkcyBsaWtlIEl0ZW1JZClcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywga2V5Q29kZTogMTMsIHdoaWNoOiAxMywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBrZXlDb2RlOiAxMywgd2hpY2g6IDEzLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAyOiBUYWIgb3V0IHRvIG1vdmUgdG8gbmV4dCBjZWxsICh0cmlnZ2VycyBibHVyIGFuZCB2YWxpZGF0aW9uKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGtleUNvZGU6IDksIHdoaWNoOiA5LCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywga2V5Q29kZTogOSwgd2hpY2g6IDksIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIFxyXG4gICAgLy8gTWV0aG9kIDM6IERpc3BhdGNoIGJsdXIgZXZlbnQgZXhwbGljaXRseVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRm9jdXNFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSwgcmVsYXRlZFRhcmdldDogbnVsbCB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgXHJcbiAgICAvLyBNZXRob2QgNDogQ2xpY2sgb3V0c2lkZSB0aGUgY2VsbCB0byBlbnN1cmUgZm9jdXMgaXMgbG9zdFxyXG4gICAgLy8gRmluZCBhbm90aGVyIGNlbGwgb3IgdGhlIHJvdyBjb250YWluZXIgdG8gY2xpY2tcclxuICAgIGNvbnN0IHJvdyA9IGlucHV0LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluLCBbZGF0YS1keW4tcm9sZT1cIlJvd1wiXScpO1xyXG4gICAgaWYgKHJvdykge1xyXG4gICAgICAgIGNvbnN0IG90aGVyQ2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW46bm90KDpmb2N1cy13aXRoaW4pJyk7XHJcbiAgICAgICAgaWYgKG90aGVyQ2VsbCAmJiBvdGhlckNlbGwgIT09IGlucHV0LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpKSB7XHJcbiAgICAgICAgICAgIG90aGVyQ2VsbC5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gV2FpdCBmb3IgRDM2NSB0byBwcm9jZXNzL3ZhbGlkYXRlIHRoZSB2YWx1ZSAoc2VydmVyLXNpZGUgbG9va3VwIGZvciBJdGVtSWQsIGV0Yy4pXHJcbiAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgXHJcbiAgICAvLyBJZiB3YWl0Rm9yVmFsaWRhdGlvbiBpcyBlbmFibGVkLCB3YWl0IGZvciBEMzY1IHRvIGNvbXBsZXRlIHRoZSBsb29rdXAgdmFsaWRhdGlvblxyXG4gICAgLy8gVGhpcyBpcyBpbXBvcnRhbnQgZm9yIGZpZWxkcyBsaWtlIEl0ZW1JZCB0aGF0IHRyaWdnZXIgc2VydmVyLXNpZGUgdmFsaWRhdGlvblxyXG4gICAgaWYgKHdhaXRGb3JWYWxpZGF0aW9uKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgV2FpdGluZyBmb3IgRDM2NSB2YWxpZGF0aW9uIG9mICR7Y29udHJvbE5hbWV9Li4uYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gV2FpdCBmb3IgYW55IGxvYWRpbmcgaW5kaWNhdG9ycyB0byBhcHBlYXIgYW5kIGRpc2FwcGVhclxyXG4gICAgICAgIC8vIEQzNjUgc2hvd3MgYSBsb2FkaW5nIHNwaW5uZXIgZHVyaW5nIHNlcnZlci1zaWRlIGxvb2t1cHNcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yRDM2NVZhbGlkYXRpb24oY29udHJvbE5hbWUsIDUwMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgICBHcmlkIGNlbGwgdmFsdWUgc2V0OiAke2NvbnRyb2xOYW1lfSA9IFwiJHt2YWx1ZX1cImApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckQzNjVWYWxpZGF0aW9uKGNvbnRyb2xOYW1lLCB0aW1lb3V0ID0gNTAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgIGxldCBsYXN0TG9hZGluZ1N0YXRlID0gZmFsc2U7XHJcbiAgICBsZXQgc2VlbkxvYWRpbmcgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydFRpbWUgPCB0aW1lb3V0KSB7XHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIEQzNjUgbG9hZGluZyBpbmRpY2F0b3JzXHJcbiAgICAgICAgY29uc3QgaXNMb2FkaW5nID0gaXNEMzY1TG9hZGluZygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpc0xvYWRpbmcgJiYgIWxhc3RMb2FkaW5nU3RhdGUpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJyAgICBEMzY1IHZhbGlkYXRpb24gc3RhcnRlZCAobG9hZGluZyBpbmRpY2F0b3IgYXBwZWFyZWQpJyk7XHJcbiAgICAgICAgICAgIHNlZW5Mb2FkaW5nID0gdHJ1ZTtcclxuICAgICAgICB9IGVsc2UgaWYgKCFpc0xvYWRpbmcgJiYgbGFzdExvYWRpbmdTdGF0ZSAmJiBzZWVuTG9hZGluZykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnICAgIEQzNjUgdmFsaWRhdGlvbiBjb21wbGV0ZWQgKGxvYWRpbmcgaW5kaWNhdG9yIGdvbmUpJyk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7IC8vIEV4dHJhIGJ1ZmZlciBhZnRlciBsb2FkaW5nIGNvbXBsZXRlc1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGFzdExvYWRpbmdTdGF0ZSA9IGlzTG9hZGluZztcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIGNoZWNrIGlmIHRoZSBjZWxsIG5vdyBzaG93cyB2YWxpZGF0ZWQgY29udGVudCAoZS5nLiwgcHJvZHVjdCBuYW1lIGFwcGVhcmVkKVxyXG4gICAgICAgIC8vIEZvciBJdGVtSWQsIEQzNjUgc2hvd3MgdGhlIGl0ZW0gbnVtYmVyIGFuZCBuYW1lIGFmdGVyIHZhbGlkYXRpb25cclxuICAgICAgICBjb25zdCBjZWxsID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgaWYgKGNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbFRleHQgPSBjZWxsLnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgICAgICBjb25zdCBoYXNNdWx0aXBsZVZhbHVlcyA9IGNlbGxUZXh0LnNwbGl0KC9cXHN7Mix9fFxcbi8pLmZpbHRlcih0ID0+IHQudHJpbSgpKS5sZW5ndGggPiAxO1xyXG4gICAgICAgICAgICBpZiAoaGFzTXVsdGlwbGVWYWx1ZXMpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCcgICAgRDM2NSB2YWxpZGF0aW9uIGNvbXBsZXRlZCAoY2VsbCBjb250ZW50IHVwZGF0ZWQpJyk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSWYgd2Ugc2F3IGxvYWRpbmcgYXQgc29tZSBwb2ludCwgd2FpdCBhIGJpdCBtb3JlIGFmdGVyIHRpbWVvdXRcclxuICAgIGlmIChzZWVuTG9hZGluZykge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCcgICAgVmFsaWRhdGlvbiB0aW1lb3V0IHJlYWNoZWQsIGJ1dCBzYXcgbG9hZGluZyAtIHdhaXRpbmcgZXh0cmEgdGltZScpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKCcgICAgVmFsaWRhdGlvbiB3YWl0IGNvbXBsZXRlZCAodGltZW91dCBvciBubyBsb2FkaW5nIGRldGVjdGVkKScpO1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWN0aXZhdGVHcmlkUm93KGNvbnRyb2xOYW1lKSB7XHJcbiAgICAvLyBUcnkgUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHMgZmlyc3RcclxuICAgIGNvbnN0IHJlYWN0R3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmVhY3RHcmlkJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgcmVhY3RHcmlkcykge1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgICAgIGlmIChjZWxsKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBGaW5kIHRoZSByb3cgY29udGFpbmluZyB0aGlzIGNlbGxcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IGNlbGwuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4nKTtcclxuICAgICAgICAgICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDbGljayBvbiB0aGUgcm93IHRvIHNlbGVjdCBpdFxyXG4gICAgICAgICAgICAgICAgICAgIHJvdy5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSB0cmFkaXRpb25hbCBEMzY1IGdyaWRzXHJcbiAgICBjb25zdCBncmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIGdyaWRzKSB7XHJcbiAgICAgICAgLy8gRmluZCB0aGUgY2VsbFxyXG4gICAgICAgIGNvbnN0IGNlbGwgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGNlbGwpIHtcclxuICAgICAgICAgICAgLy8gRmluZCB0aGUgcm93IGNvbnRhaW5pbmcgdGhpcyBjZWxsXHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IGNlbGwuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJSb3dcIl0sIFtyb2xlPVwicm93XCJdLCB0cicpO1xyXG4gICAgICAgICAgICBpZiAocm93KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDbGljayBvbiB0aGUgcm93IHRvIHNlbGVjdCBpdFxyXG4gICAgICAgICAgICAgICAgcm93LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRMb29rdXBTZWxlY3RWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmICghaW5wdXQpIHRocm93IG5ldyBFcnJvcignSW5wdXQgbm90IGZvdW5kIGluIGxvb2t1cCBmaWVsZCcpO1xyXG5cclxuICAgIGNvbnN0IGxvb2t1cEJ1dHRvbiA9IGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCk7XHJcbiAgICBpZiAobG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgbG9va3VwQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIG9wZW4gYnkgZm9jdXNpbmcgYW5kIGtleWJvYXJkXHJcbiAgICAgICAgaW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IG9wZW5Mb29rdXBCeUtleWJvYXJkKGlucHV0KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBsb29rdXBEb2NrID0gYXdhaXQgd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsb29rdXBEb2NrKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29rdXAgZmx5b3V0IG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyeSB0eXBpbmcgaW50byBhIGxvb2t1cCBmbHlvdXQgaW5wdXQgaWYgcHJlc2VudCAoZS5nLiwgTWFpbkFjY291bnQpXHJcbiAgICBjb25zdCBkb2NrSW5wdXQgPSBmaW5kTG9va3VwRmlsdGVySW5wdXQobG9va3VwRG9jayk7XHJcbiAgICBpZiAoZG9ja0lucHV0KSB7XHJcbiAgICAgICAgZG9ja0lucHV0LmNsaWNrKCk7XHJcbiAgICAgICAgZG9ja0lucHV0LmZvY3VzKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoZG9ja0lucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDYwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cERvY2ssIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9va3VwIGxpc3QgaXMgZW1wdHknKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZWFyY2hWYWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgIGxldCBtYXRjaGVkID0gZmFsc2U7XHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IHJvdy50ZXh0Q29udGVudC50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RDZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiZ3JpZGNlbGxcIl0sIHRkJyk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RUZXh0ID0gZmlyc3RDZWxsID8gZmlyc3RDZWxsLnRleHRDb250ZW50LnRyaW0oKS50b0xvd2VyQ2FzZSgpIDogJyc7XHJcbiAgICAgICAgaWYgKGZpcnN0VGV4dCA9PT0gc2VhcmNoVmFsdWUgfHwgdGV4dC5pbmNsdWRlcyhzZWFyY2hWYWx1ZSkpIHtcclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZmlyc3RDZWxsIHx8IHJvdztcclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgdGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIG1hdGNoZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICAvLyBTb21lIEQzNjUgbG9va3VwcyByZXF1aXJlIEVudGVyIG9yIGRvdWJsZS1jbGljayB0byBjb21taXQgc2VsZWN0aW9uXHJcbiAgICAgICAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdkYmxjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFwcGxpZWQgPSBhd2FpdCB3YWl0Rm9ySW5wdXRWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgICAgICBpZiAoIWFwcGxpZWQpIHtcclxuICAgICAgICAgICAgICAgIC8vIFRyeSBhIHNlY29uZCBjb21taXQgcGFzcyBpZiB0aGUgdmFsdWUgZGlkIG5vdCBzdGlja1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExvb2t1cCB2YWx1ZSBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBEMzY1IGNoZWNrYm94ZXMgY2FuIGJlOlxyXG4gICAgLy8gMS4gU3RhbmRhcmQgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdXHJcbiAgICAvLyAyLiBDdXN0b20gdG9nZ2xlIHdpdGggcm9sZT1cImNoZWNrYm94XCIgb3Igcm9sZT1cInN3aXRjaFwiXHJcbiAgICAvLyAzLiBFbGVtZW50IHdpdGggYXJpYS1jaGVja2VkIGF0dHJpYnV0ZSAodGhlIGNvbnRhaW5lciBpdHNlbGYpXHJcbiAgICAvLyA0LiBFbGVtZW50IHdpdGggZGF0YS1keW4tcm9sZT1cIkNoZWNrQm94XCJcclxuICAgIFxyXG4gICAgbGV0IGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKTtcclxuICAgIGxldCBpc0N1c3RvbVRvZ2dsZSA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgY3VzdG9tIHRvZ2dsZSBlbGVtZW50XHJcbiAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiY2hlY2tib3hcIl0sIFtyb2xlPVwic3dpdGNoXCJdJyk7XHJcbiAgICAgICAgaWYgKGNoZWNrYm94KSB7XHJcbiAgICAgICAgICAgIGlzQ3VzdG9tVG9nZ2xlID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHtcclxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZWxlbWVudCBpdHNlbGYgaXMgdGhlIHRvZ2dsZSAoRDM2NSBvZnRlbiBkb2VzIHRoaXMpXHJcbiAgICAgICAgaWYgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSA9PT0gJ2NoZWNrYm94JyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnc3dpdGNoJyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnQ2hlY2tCb3gnKSB7XHJcbiAgICAgICAgICAgIGNoZWNrYm94ID0gZWxlbWVudDtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkge1xyXG4gICAgICAgIC8vIExhc3QgcmVzb3J0OiBmaW5kIGFueSBjbGlja2FibGUgdG9nZ2xlLWxpa2UgZWxlbWVudFxyXG4gICAgICAgIGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b24sIFt0YWJpbmRleD1cIjBcIl0nKTtcclxuICAgICAgICBpZiAoY2hlY2tib3gpIHtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkgdGhyb3cgbmV3IEVycm9yKGBDaGVja2JveCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9LiBFbGVtZW50IEhUTUw6ICR7ZWxlbWVudC5vdXRlckhUTUwuc3Vic3RyaW5nKDAsIDIwMCl9YCk7XHJcblxyXG4gICAgY29uc3Qgc2hvdWxkQ2hlY2sgPSBjb2VyY2VCb29sZWFuKHZhbHVlKTtcclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgc3RhdGVcclxuICAgIGxldCBpc0N1cnJlbnRseUNoZWNrZWQ7XHJcbiAgICBpZiAoaXNDdXN0b21Ub2dnbGUpIHtcclxuICAgICAgICBpc0N1cnJlbnRseUNoZWNrZWQgPSBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZScgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoZWNrZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3guY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2RhdGEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlzQ3VycmVudGx5Q2hlY2tlZCA9IGNoZWNrYm94LmNoZWNrZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT25seSBjbGljayBpZiBzdGF0ZSBuZWVkcyB0byBjaGFuZ2VcclxuICAgIGlmIChzaG91bGRDaGVjayAhPT0gaXNDdXJyZW50bHlDaGVja2VkKSB7XHJcbiAgICAgICAgY2hlY2tib3guY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZvciBjdXN0b20gdG9nZ2xlcywgYWxzbyB0cnkgZGlzcGF0Y2hpbmcgZXZlbnRzIGlmIGNsaWNrIGRpZG4ndCB3b3JrXHJcbiAgICAgICAgaWYgKGlzQ3VzdG9tVG9nZ2xlKSB7XHJcbiAgICAgICAgICAgIGNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5Mb29rdXBCeUtleWJvYXJkKGlucHV0KSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgLy8gVHJ5IEFsdCtEb3duIHRoZW4gRjQgKGNvbW1vbiBEMzY1L1dpbiBjb250cm9scylcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBhbHRLZXk6IHRydWUsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBhbHRLZXk6IHRydWUsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Y0JywgY29kZTogJ0Y0JywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRjQnLCBjb2RlOiAnRjQnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21taXRMb29rdXBWYWx1ZShpbnB1dCkge1xyXG4gICAgLy8gRDM2NSBzZWdtZW50ZWQgbG9va3VwcyBvZnRlbiB2YWxpZGF0ZSBvbiBUYWIvRW50ZXIgYW5kIGJsdXJcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbG9zZURpYWxvZyhmb3JtTmFtZSwgYWN0aW9uID0gJ29rJykge1xuICAgIGNvbnN0IGZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tZm9ybS1uYW1lPVwiJHtmb3JtTmFtZX1cIl1gKTtcclxuICAgIGlmICghZm9ybSkge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6IEZvcm0gJHtmb3JtTmFtZX0gbm90IGZvdW5kIHRvIGNsb3NlYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsZXQgYnV0dG9uTmFtZTtcclxuICAgIGlmIChmb3JtTmFtZSA9PT0gJ1N5c1JlY3VycmVuY2UnKSB7XHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdDb21tYW5kQnV0dG9uT2snIDogJ0NvbW1hbmRCdXR0b25DYW5jZWwnO1xyXG4gICAgfSBlbHNlIGlmIChmb3JtTmFtZSA9PT0gJ1N5c1F1ZXJ5Rm9ybScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ09rQnV0dG9uJyA6ICdDYW5jZWxCdXR0b24nO1xyXG4gICAgfSBlbHNlIGlmIChmb3JtTmFtZSA9PT0gJ1N5c09wZXJhdGlvblRlbXBsYXRlRm9ybScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ0NvbW1hbmRCdXR0b24nIDogJ0NvbW1hbmRCdXR0b25DYW5jZWwnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBUcnkgZ2VuZXJpYyBuYW1lc1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnQ29tbWFuZEJ1dHRvbicgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IGJ1dHRvbiA9IGZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtidXR0b25OYW1lfVwiXWApO1xyXG4gICAgaWYgKGJ1dHRvbikge1xyXG4gICAgICAgIGJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgbG9nU3RlcChgRGlhbG9nICR7Zm9ybU5hbWV9IGNsb3NlZCB3aXRoICR7YWN0aW9uLnRvVXBwZXJDYXNlKCl9YCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6ICR7YWN0aW9uLnRvVXBwZXJDYXNlKCl9IGJ1dHRvbiBub3QgZm91bmQgaW4gJHtmb3JtTmFtZX1gKTtcclxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0Q3VycmVudFJvd1ZhbHVlKGZpZWxkTWFwcGluZykge1xuICAgIGlmICghZmllbGRNYXBwaW5nKSByZXR1cm4gJyc7XG4gICAgY29uc3Qgcm93ID0gd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50RGF0YVJvdyB8fCB7fTtcbiAgICBjb25zdCBkaXJlY3QgPSByb3dbZmllbGRNYXBwaW5nXTtcbiAgICBpZiAoZGlyZWN0ICE9PSB1bmRlZmluZWQgJiYgZGlyZWN0ICE9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBTdHJpbmcoZGlyZWN0KTtcbiAgICB9XG4gICAgY29uc3QgZmllbGROYW1lID0gZmllbGRNYXBwaW5nLmluY2x1ZGVzKCc6JykgPyBmaWVsZE1hcHBpbmcuc3BsaXQoJzonKS5wb3AoKSA6IGZpZWxkTWFwcGluZztcbiAgICBjb25zdCB2YWx1ZSA9IHJvd1tmaWVsZE5hbWVdO1xuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlRHluYW1pY1RleHQodGV4dCkge1xuICAgIGlmICh0eXBlb2YgdGV4dCAhPT0gJ3N0cmluZycgfHwgIXRleHQpIHJldHVybiB0ZXh0IHx8ICcnO1xuXG4gICAgbGV0IHJlc29sdmVkID0gdGV4dDtcbiAgICBpZiAoL19fRDM2NV9QQVJBTV9DTElQQk9BUkRfW2EtejAtOV9dK19fL2kudGVzdChyZXNvbHZlZCkpIHtcbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuY2xpcGJvYXJkPy5yZWFkVGV4dCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDbGlwYm9hcmQgQVBJIG5vdCBhdmFpbGFibGUnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjbGlwYm9hcmRUZXh0ID0gYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC5yZWFkVGV4dCgpO1xuICAgICAgICByZXNvbHZlZCA9IHJlc29sdmVkLnJlcGxhY2UoL19fRDM2NV9QQVJBTV9DTElQQk9BUkRfW2EtejAtOV9dK19fL2dpLCBjbGlwYm9hcmRUZXh0ID8/ICcnKTtcbiAgICB9XG5cbiAgICByZXNvbHZlZCA9IHJlc29sdmVkLnJlcGxhY2UoL19fRDM2NV9QQVJBTV9EQVRBXyhbQS1aYS16MC05JS5ffi1dKilfXy9nLCAoXywgZW5jb2RlZEZpZWxkKSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gZGVjb2RlVVJJQ29tcG9uZW50KGVuY29kZWRGaWVsZCB8fCAnJyk7XG4gICAgICAgIHJldHVybiBnZXRDdXJyZW50Um93VmFsdWUoZmllbGQpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc29sdmVkO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbmF2aWdhdGVUb0Zvcm0oc3RlcCkge1xuICAgIGNvbnN0IHsgbmF2aWdhdGVNZXRob2QsIG1lbnVJdGVtTmFtZSwgbWVudUl0ZW1UeXBlLCBuYXZpZ2F0ZVVybCwgaG9zdFJlbGF0aXZlUGF0aCwgd2FpdEZvckxvYWQsIG9wZW5Jbk5ld1RhYiB9ID0gc3RlcDtcblxuICAgIGNvbnN0IHJlc29sdmVkTWVudUl0ZW1OYW1lID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KG1lbnVJdGVtTmFtZSB8fCAnJyk7XG4gICAgY29uc3QgcmVzb2x2ZWROYXZpZ2F0ZVVybCA9IGF3YWl0IHJlc29sdmVEeW5hbWljVGV4dChuYXZpZ2F0ZVVybCB8fCAnJyk7XG4gICAgY29uc3QgcmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KGhvc3RSZWxhdGl2ZVBhdGggfHwgJycpO1xuXG4gICAgbG9nU3RlcChgTmF2aWdhdGluZyB0byBmb3JtOiAke3Jlc29sdmVkTWVudUl0ZW1OYW1lIHx8IHJlc29sdmVkTmF2aWdhdGVVcmx9YCk7XG4gICAgXG4gICAgbGV0IHRhcmdldFVybDtcbiAgICBjb25zdCBiYXNlVXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZTtcbiAgICBcbiAgICBpZiAobmF2aWdhdGVNZXRob2QgPT09ICd1cmwnICYmIHJlc29sdmVkTmF2aWdhdGVVcmwpIHtcbiAgICAgICAgLy8gVXNlIGZ1bGwgVVJMIHBhdGggcHJvdmlkZWRcbiAgICAgICAgdGFyZ2V0VXJsID0gcmVzb2x2ZWROYXZpZ2F0ZVVybC5zdGFydHNXaXRoKCdodHRwJykgPyByZXNvbHZlZE5hdmlnYXRlVXJsIDogYmFzZVVybCArIHJlc29sdmVkTmF2aWdhdGVVcmw7XG4gICAgfSBlbHNlIGlmIChuYXZpZ2F0ZU1ldGhvZCA9PT0gJ2hvc3RSZWxhdGl2ZScgJiYgcmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoKSB7XG4gICAgICAgIC8vIFJldXNlIGN1cnJlbnQgaG9zdCBkeW5hbWljYWxseSwgYXBwZW5kIHByb3ZpZGVkIHBhdGgvcXVlcnkuXG4gICAgICAgIGNvbnN0IHJlbGF0aXZlUGFydCA9IFN0cmluZyhyZXNvbHZlZEhvc3RSZWxhdGl2ZVBhdGgpLnRyaW0oKTtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHJlbGF0aXZlUGFydC5zdGFydHNXaXRoKCcvJykgfHwgcmVsYXRpdmVQYXJ0LnN0YXJ0c1dpdGgoJz8nKVxuICAgICAgICAgICAgPyByZWxhdGl2ZVBhcnRcbiAgICAgICAgICAgIDogYC8ke3JlbGF0aXZlUGFydH1gO1xuICAgICAgICB0YXJnZXRVcmwgPSBgJHt3aW5kb3cubG9jYXRpb24ucHJvdG9jb2x9Ly8ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fSR7bm9ybWFsaXplZH1gO1xuICAgIH0gZWxzZSBpZiAocmVzb2x2ZWRNZW51SXRlbU5hbWUpIHtcbiAgICAgICAgLy8gQnVpbGQgVVJMIGZyb20gbWVudSBpdGVtIG5hbWVcbiAgICAgICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbiAgICAgICAgcGFyYW1zLmRlbGV0ZSgncScpO1xuICAgICAgICBjb25zdCB0eXBlUHJlZml4ID0gKG1lbnVJdGVtVHlwZSAmJiBtZW51SXRlbVR5cGUgIT09ICdEaXNwbGF5JykgPyBgJHttZW51SXRlbVR5cGV9OmAgOiAnJztcbiAgICAgICAgY29uc3QgcmF3TWVudUl0ZW0gPSBTdHJpbmcocmVzb2x2ZWRNZW51SXRlbU5hbWUpLnRyaW0oKTtcblxuICAgICAgICAvLyBTdXBwb3J0IGV4dGVuZGVkIGlucHV0IGxpa2U6XG4gICAgICAgIC8vIFwiU3lzVGFibGVCcm93c2VyJnRhYmxlTmFtZT1JbnZlbnRUYWJsZVwiXG4gICAgICAgIC8vIHNvIGV4dHJhIHF1ZXJ5IHBhcmFtcyBhcmUgYXBwZW5kZWQgYXMgcmVhbCBVUkwgcGFyYW1zLCBub3QgZW5jb2RlZCBpbnRvIG1pLlxuICAgICAgICBjb25zdCBzZXBhcmF0b3JJbmRleCA9IE1hdGgubWluKFxuICAgICAgICAgICAgLi4uWyc/JywgJyYnXVxuICAgICAgICAgICAgICAgIC5tYXAoY2ggPT4gcmF3TWVudUl0ZW0uaW5kZXhPZihjaCkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihpZHggPT4gaWR4ID49IDApXG4gICAgICAgICk7XG5cbiAgICAgICAgbGV0IG1lbnVJdGVtQmFzZSA9IHJhd01lbnVJdGVtO1xuICAgICAgICBsZXQgZXh0cmFRdWVyeSA9ICcnO1xuXG4gICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoc2VwYXJhdG9ySW5kZXgpKSB7XG4gICAgICAgICAgICBtZW51SXRlbUJhc2UgPSByYXdNZW51SXRlbS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpO1xuICAgICAgICAgICAgZXh0cmFRdWVyeSA9IHJhd01lbnVJdGVtLnNsaWNlKHNlcGFyYXRvckluZGV4ICsgMSkudHJpbSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgcGFyYW1zLnNldCgnbWknLCBgJHt0eXBlUHJlZml4fSR7bWVudUl0ZW1CYXNlfWApO1xuXG4gICAgICAgIGlmIChleHRyYVF1ZXJ5KSB7XG4gICAgICAgICAgICBjb25zdCBleHRyYXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGV4dHJhUXVlcnkpO1xuICAgICAgICAgICAgZXh0cmFzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5ICYmIGtleSAhPT0gJ21pJykge1xuICAgICAgICAgICAgICAgICAgICBwYXJhbXMuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGFyZ2V0VXJsID0gYmFzZVVybCArICc/JyArIHBhcmFtcy50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTmF2aWdhdGUgc3RlcCByZXF1aXJlcyBlaXRoZXIgbWVudUl0ZW1OYW1lIG9yIG5hdmlnYXRlVXJsJyk7XG4gICAgfVxuICAgIFxyXG4gICAgbG9nU3RlcChgTmF2aWdhdGluZyB0bzogJHt0YXJnZXRVcmx9YCk7XG5cbiAgICBpZiAob3BlbkluTmV3VGFiKSB7XG4gICAgICAgIHdpbmRvdy5vcGVuKHRhcmdldFVybCwgJ19ibGFuaycsICdub29wZW5lcicpO1xuICAgICAgICBsb2dTdGVwKCdPcGVuZWQgbmF2aWdhdGlvbiB0YXJnZXQgaW4gYSBuZXcgdGFiJyk7XG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTYXZlIHBlbmRpbmcgd29ya2Zsb3cgc3RhdGUgZGlyZWN0bHkgaW4gc2Vzc2lvblN0b3JhZ2UgYmVmb3JlIG5hdmlnYXRpb25cbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodGFyZ2V0VXJsKTtcclxuICAgICAgICBjb25zdCB0YXJnZXRNZW51SXRlbU5hbWUgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbWknKSB8fCAnJztcclxuICAgICAgICBcclxuICAgICAgICAvLyBJTVBPUlRBTlQ6IFBlcnNpc3QgcGVuZGluZyBuYXZpZ2F0aW9uIHN0YXRlIGZyb20gdGhlIGN1cnJlbnRseSBleGVjdXRpbmcgd29ya2Zsb3cuXG4gICAgICAgIC8vIFByZWZlciBjdXJyZW50IHdvcmtmbG93IGNvbnRleHQgZmlyc3QsIHRoZW4gaXRzIG9yaWdpbmFsL2Z1bGwgd29ya2Zsb3cgd2hlbiBwcmVzZW50LlxuICAgICAgICBjb25zdCBjdXJyZW50V29ya2Zsb3cgPSB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyB8fCBudWxsO1xuICAgICAgICBjb25zdCBvcmlnaW5hbFdvcmtmbG93ID0gY3VycmVudFdvcmtmbG93Py5fb3JpZ2luYWxXb3JrZmxvdyB8fCBjdXJyZW50V29ya2Zsb3cgfHwgd2luZG93LmQzNjVPcmlnaW5hbFdvcmtmbG93IHx8IG51bGw7XG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHBlbmRpbmdTdGF0ZSA9IHtcclxuICAgICAgICAgICAgd29ya2Zsb3c6IG9yaWdpbmFsV29ya2Zsb3csXHJcbiAgICAgICAgICAgIHdvcmtmbG93SWQ6IG9yaWdpbmFsV29ya2Zsb3c/LmlkIHx8ICcnLFxyXG4gICAgICAgICAgICBuZXh0U3RlcEluZGV4OiAod2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50U3RlcEluZGV4ID8/IDApICsgMSxcclxuICAgICAgICAgICAgY3VycmVudFJvd0luZGV4OiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnRSb3dJbmRleCB8fCAwLFxyXG4gICAgICAgICAgICB0b3RhbFJvd3M6IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8udG90YWxSb3dzIHx8IDAsXHJcbiAgICAgICAgICAgIGRhdGE6IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwgbnVsbCxcclxuICAgICAgICAgICAgdGFyZ2V0TWVudUl0ZW1OYW1lOiB0YXJnZXRNZW51SXRlbU5hbWUsXHJcbiAgICAgICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwLFxyXG4gICAgICAgICAgICBzYXZlZEF0OiBEYXRlLm5vdygpXHJcbiAgICAgICAgfTtcclxuICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdkMzY1X3BlbmRpbmdfd29ya2Zsb3cnLCBKU09OLnN0cmluZ2lmeShwZW5kaW5nU3RhdGUpKTtcclxuICAgICAgICBsb2dTdGVwKGBTYXZlZCB3b3JrZmxvdyBzdGF0ZSBmb3IgbmF2aWdhdGlvbiAobmV4dFN0ZXBJbmRleDogJHtwZW5kaW5nU3RhdGUubmV4dFN0ZXBJbmRleH0pYCk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCdbRDM2NV0gRmFpbGVkIHRvIHNhdmUgd29ya2Zsb3cgc3RhdGUgaW4gc2Vzc2lvblN0b3JhZ2U6JywgZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNpZ25hbCBuYXZpZ2F0aW9uIGlzIGFib3V0IHRvIGhhcHBlbiAtIHdvcmtmbG93IHN0YXRlIHdpbGwgYmUgc2F2ZWQgYnkgdGhlIGV4dGVuc2lvblxyXG4gICAgLy8gV2UgbmVlZCB0byB3YWl0IGZvciB0aGUgc3RhdGUgdG8gYmUgc2F2ZWQgYmVmb3JlIG5hdmlnYXRpbmdcclxuICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfTkFWSUdBVElORycsXHJcbiAgICAgICAgdGFyZ2V0VXJsOiB0YXJnZXRVcmwsXHJcbiAgICAgICAgd2FpdEZvckxvYWQ6IHdhaXRGb3JMb2FkIHx8IDMwMDBcclxuICAgIH0sICcqJyk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgbG9uZ2VyIHRvIGVuc3VyZSB0aGUgZnVsbCBjaGFpbiBjb21wbGV0ZXM6XHJcbiAgICAvLyBwb3N0TWVzc2FnZSAtPiBjb250ZW50LmpzIC0+IGJhY2tncm91bmQuanMgLT4gcG9wdXAgLT4gY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0XHJcbiAgICAvLyBUaGlzIGNoYWluIGludm9sdmVzIG11bHRpcGxlIGFzeW5jIGhvcHMsIHNvIHdlIG5lZWQgc3VmZmljaWVudCB0aW1lXHJcbiAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgXHJcbiAgICAvLyBOYXZpZ2F0ZSAtIHRoaXMgd2lsbCBjYXVzZSBwYWdlIHJlbG9hZCwgc2NyaXB0IGNvbnRleHQgd2lsbCBiZSBsb3N0XHJcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRhcmdldFVybDtcclxuICAgIFxyXG4gICAgLy8gVGhpcyBjb2RlIHdvbid0IGV4ZWN1dGUgZHVlIHRvIHBhZ2UgbmF2aWdhdGlvbiwgYnV0IGtlZXAgaXQgZm9yIHJlZmVyZW5jZVxyXG4gICAgLy8gVGhlIHdvcmtmbG93IHdpbGwgYmUgcmVzdW1lZCBieSB0aGUgY29udGVudCBzY3JpcHQgYWZ0ZXIgcGFnZSBsb2FkXHJcbiAgICBhd2FpdCBzbGVlcCh3YWl0Rm9yTG9hZCB8fCAzMDAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlVGFiKGNvbnRyb2xOYW1lKSB7XG4gICAgbG9nU3RlcChgQWN0aXZhdGluZyB0YWI6ICR7Y29udHJvbE5hbWV9YCk7XG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSB0YWIgZWxlbWVudCAtIGNvdWxkIGJlIHRoZSB0YWIgY29udGVudCBvciB0aGUgdGFiIGJ1dHRvbiBpdHNlbGZcclxuICAgIGxldCB0YWJFbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBub3QgZm91bmQgZGlyZWN0bHksIHRyeSBmaW5kaW5nIGJ5IGxvb2tpbmcgZm9yIHRhYiBoZWFkZXJzL2xpbmtzXHJcbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgZmluZGluZyB0aGUgdGFiIGxpbmsvYnV0dG9uIHRoYXQgcmVmZXJlbmNlcyB0aGlzIHRhYlxyXG4gICAgICAgIHRhYkVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfV9oZWFkZXJcIl1gKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSBbcm9sZT1cInRhYlwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFthcmlhLWNvbnRyb2xzPVwiJHtjb250cm9sTmFtZX1cIl1gKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBhW2hyZWYqPVwiJHtjb250cm9sTmFtZX1cIl0sIGJ1dHRvbltkYXRhLXRhcmdldCo9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRhYiBlbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRm9yIEQzNjUgcGFyYW1ldGVyIGZvcm1zIHdpdGggdmVydGljYWwgdGFicywgdGhlIGNsaWNrYWJsZSBlbGVtZW50IHN0cnVjdHVyZSB2YXJpZXNcclxuICAgIC8vIFRyeSBtdWx0aXBsZSBhcHByb2FjaGVzIHRvIGZpbmQgYW5kIGNsaWNrIHRoZSByaWdodCBlbGVtZW50XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDE6IExvb2sgZm9yIHRoZSB0YWIgbGluayBpbnNpZGUgYSBwaXZvdC90YWIgc3RydWN0dXJlXHJcbiAgICBsZXQgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5waXZvdC1saW5rLCAudGFiLWxpbmssIFtyb2xlPVwidGFiXCJdJyk7XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDI6IFRoZSBlbGVtZW50IGl0c2VsZiBtaWdodCBiZSB0aGUgbGlua1xyXG4gICAgaWYgKCFjbGlja1RhcmdldCAmJiAodGFiRWxlbWVudC50YWdOYW1lID09PSAnQScgfHwgdGFiRWxlbWVudC50YWdOYW1lID09PSAnQlVUVE9OJyB8fCB0YWJFbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAndGFiJykpIHtcclxuICAgICAgICBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDM6IEZvciB2ZXJ0aWNhbCB0YWJzLCBsb29rIGZvciB0aGUgYW5jaG9yIG9yIGxpbmsgZWxlbWVudFxyXG4gICAgaWYgKCFjbGlja1RhcmdldCkge1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudC5xdWVyeVNlbGVjdG9yKCdhLCBidXR0b24nKSB8fCB0YWJFbGVtZW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBBcHByb2FjaCA0OiBGb3IgUGl2b3RJdGVtLCBmaW5kIHRoZSBoZWFkZXIgZWxlbWVudFxyXG4gICAgaWYgKCFjbGlja1RhcmdldCB8fCBjbGlja1RhcmdldCA9PT0gdGFiRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IGhlYWRlck5hbWUgPSBjb250cm9sTmFtZSArICdfaGVhZGVyJztcclxuICAgICAgICBjb25zdCBoZWFkZXJFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7aGVhZGVyTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoaGVhZGVyRWwpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBoZWFkZXJFbC5xdWVyeVNlbGVjdG9yKCdhLCBidXR0b24sIC5waXZvdC1saW5rJykgfHwgaGVhZGVyRWw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBDbGlja2luZyB0YWIgZWxlbWVudDogJHtjbGlja1RhcmdldD8udGFnTmFtZSB8fCAndW5rbm93bid9YCk7XHJcbiAgICBcclxuICAgIC8vIEZvY3VzIGFuZCBjbGlja1xyXG4gICAgaWYgKGNsaWNrVGFyZ2V0LmZvY3VzKSBjbGlja1RhcmdldC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZVxyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBBbHNvIHRyeSB0cmlnZ2VyaW5nIHRoZSBEMzY1IGludGVybmFsIGNvbnRyb2xcclxuICAgIGlmICh0eXBlb2YgJGR5biAhPT0gJ3VuZGVmaW5lZCcgJiYgJGR5bi5jb250cm9scykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2wgPSAkZHluLmNvbnRyb2xzW2NvbnRyb2xOYW1lXTtcclxuICAgICAgICAgICAgaWYgKGNvbnRyb2wpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29udHJvbC5BY3RpdmF0ZVRhYiA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuQWN0aXZhdGVUYWIodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIEFjdGl2YXRlVGFiIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLmFjdGl2YXRlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5hY3RpdmF0ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBhY3RpdmF0ZSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5zZWxlY3QgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLnNlbGVjdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBzZWxlY3Qgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgbG9nU3RlcChgRDM2NSBjb250cm9sIG1ldGhvZCBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gV2FpdCBmb3IgdGFiIGNvbnRlbnQgdG8gbG9hZFxyXG4gICAgYXdhaXQgc2xlZXAoODAwKTtcclxuICAgIFxyXG4gICAgLy8gVmVyaWZ5IHRoZSB0YWIgaXMgbm93IGFjdGl2ZSBieSBjaGVja2luZyBmb3IgdmlzaWJsZSBjb250ZW50XHJcbiAgICBjb25zdCB0YWJDb250ZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgIGlmICh0YWJDb250ZW50KSB7XHJcbiAgICAgICAgY29uc3QgaXNWaXNpYmxlID0gdGFiQ29udGVudC5vZmZzZXRQYXJlbnQgIT09IG51bGw7XHJcbiAgICAgICAgY29uc3QgaXNBY3RpdmUgPSB0YWJDb250ZW50LmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYkNvbnRlbnQuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0YWJDb250ZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nKSAhPT0gJ3RydWUnO1xyXG4gICAgICAgIGxvZ1N0ZXAoYFRhYiAke2NvbnRyb2xOYW1lfSB2aXNpYmlsaXR5IGNoZWNrOiB2aXNpYmxlPSR7aXNWaXNpYmxlfSwgYWN0aXZlPSR7aXNBY3RpdmV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYFRhYiAke2NvbnRyb2xOYW1lfSBhY3RpdmF0ZWRgKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlQWN0aW9uUGFuZVRhYihjb250cm9sTmFtZSkge1xuICAgIGxvZ1N0ZXAoYEFjdGl2YXRpbmcgYWN0aW9uIHBhbmUgdGFiOiAke2NvbnRyb2xOYW1lfWApO1xuXG4gICAgbGV0IHRhYkVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XG5cbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcbiAgICAgICAgY29uc3Qgc2VsZWN0b3JzID0gW1xuICAgICAgICAgICAgYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgIGAuYXBwQmFyVGFiW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxuICAgICAgICAgICAgYC5hcHBCYXJUYWIgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxuICAgICAgICAgICAgYFtyb2xlPVwidGFiXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXG4gICAgICAgIF07XG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG4gICAgICAgICAgICB0YWJFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICBpZiAodGFiRWxlbWVudCkgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBY3Rpb24gcGFuZSB0YWIgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xuICAgIH1cblxuICAgIGxldCBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQ7XG5cbiAgICBjb25zdCBoZWFkZXIgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3I/LignLmFwcEJhclRhYi1oZWFkZXIsIC5hcHBCYXJUYWJIZWFkZXIsIC5hcHBCYXJUYWJfaGVhZGVyJyk7XG4gICAgaWYgKGhlYWRlcikge1xuICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlcjtcbiAgICB9XG5cbiAgICBjb25zdCBmb2N1c1NlbGVjdG9yID0gdGFiRWxlbWVudC5nZXRBdHRyaWJ1dGU/LignZGF0YS1keW4tZm9jdXMnKTtcbiAgICBpZiAoZm9jdXNTZWxlY3Rvcikge1xuICAgICAgICBjb25zdCBmb2N1c1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcihmb2N1c1NlbGVjdG9yKTtcbiAgICAgICAgaWYgKGZvY3VzVGFyZ2V0KSB7XG4gICAgICAgICAgICBjbGlja1RhcmdldCA9IGZvY3VzVGFyZ2V0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRhYkVsZW1lbnQuZ2V0QXR0cmlidXRlPy4oJ3JvbGUnKSA9PT0gJ3RhYicpIHtcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xuICAgIH1cblxuICAgIGlmIChjbGlja1RhcmdldCA9PT0gdGFiRWxlbWVudCkge1xuICAgICAgICBjb25zdCBidXR0b25pc2ggPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3I/LignYnV0dG9uLCBhLCBbcm9sZT1cInRhYlwiXScpO1xuICAgICAgICBpZiAoYnV0dG9uaXNoKSBjbGlja1RhcmdldCA9IGJ1dHRvbmlzaDtcbiAgICB9XG5cbiAgICBpZiAoY2xpY2tUYXJnZXQ/LmZvY3VzKSBjbGlja1RhcmdldC5mb2N1cygpO1xuICAgIGF3YWl0IHNsZWVwKDEwMCk7XG4gICAgZGlzcGF0Y2hDbGlja1NlcXVlbmNlKGNsaWNrVGFyZ2V0KTtcblxuICAgIGlmICh0eXBlb2YgJGR5biAhPT0gJ3VuZGVmaW5lZCcgJiYgJGR5bi5jb250cm9scykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbCA9ICRkeW4uY29udHJvbHNbY29udHJvbE5hbWVdO1xuICAgICAgICAgICAgaWYgKGNvbnRyb2wpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuYWN0aXZhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5hY3RpdmF0ZSgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuc2VsZWN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuc2VsZWN0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBsb2dTdGVwKGBBY3Rpb24gcGFuZSBjb250cm9sIG1ldGhvZCBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXdhaXQgc2xlZXAoNjAwKTtcbiAgICBsb2dTdGVwKGBBY3Rpb24gcGFuZSB0YWIgJHtjb250cm9sTmFtZX0gYWN0aXZhdGVkYCk7XG59XG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKGNvbnRyb2xOYW1lLCBhY3Rpb24pIHtcclxuICAgIGxvZ1N0ZXAoYCR7YWN0aW9uID09PSAnZXhwYW5kJyA/ICdFeHBhbmRpbmcnIDogJ0NvbGxhcHNpbmcnfSBzZWN0aW9uOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBzZWN0aW9uID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFzZWN0aW9uKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBTZWN0aW9uIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEMzY1IHNlY3Rpb25zIGNhbiBoYXZlIHZhcmlvdXMgc3RydWN0dXJlcy4gVGhlIHRvZ2dsZSBidXR0b24gaXMgdXN1YWxseTpcclxuICAgIC8vIDEuIEEgYnV0dG9uIHdpdGggYXJpYS1leHBhbmRlZCBpbnNpZGUgdGhlIHNlY3Rpb25cclxuICAgIC8vIDIuIEEgc2VjdGlvbiBoZWFkZXIgZWxlbWVudFxyXG4gICAgLy8gMy4gVGhlIHNlY3Rpb24gaXRzZWxmIG1pZ2h0IGJlIGNsaWNrYWJsZVxyXG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSB0b2dnbGUgYnV0dG9uIC0gdGhpcyBpcyBjcnVjaWFsIGZvciBEMzY1IGRpYWxvZ3NcclxuICAgIGxldCB0b2dnbGVCdXR0b24gPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblthcmlhLWV4cGFuZGVkXScpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBub3QgZm91bmQsIHRyeSBvdGhlciBjb21tb24gcGF0dGVybnNcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCcuc2VjdGlvbi1wYWdlLWNhcHRpb24sIC5zZWN0aW9uLWhlYWRlciwgLmdyb3VwLWhlYWRlciwgW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZUhlYWRlclwiXScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtIHNlY3Rpb25zIChSZWNvcmRzIHRvIGluY2x1ZGUsIFJ1biBpbiB0aGUgYmFja2dyb3VuZClcclxuICAgIC8vIHRoZSBidXR0b24gaXMgb2Z0ZW4gYSBkaXJlY3QgY2hpbGQgb3Igc2libGluZ1xyXG4gICAgaWYgKCF0b2dnbGVCdXR0b24pIHtcclxuICAgICAgICB0b2dnbGVCdXR0b24gPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBpZiB0aGUgc2VjdGlvbiBpdHNlbGYgaGFzIGFyaWEtZXhwYW5kZWQgKGl0IG1pZ2h0IGJlIHRoZSBjbGlja2FibGUgZWxlbWVudClcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uICYmIHNlY3Rpb24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICB0b2dnbGVCdXR0b24gPSBzZWN0aW9uO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEZXRlcm1pbmUgY3VycmVudCBzdGF0ZSBmcm9tIHZhcmlvdXMgc291cmNlc1xyXG4gICAgbGV0IGlzRXhwYW5kZWQgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgdGhlIHRvZ2dsZSBidXR0b24ncyBhcmlhLWV4cGFuZGVkXHJcbiAgICBpZiAodG9nZ2xlQnV0dG9uICYmIHRvZ2dsZUJ1dHRvbi5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSkge1xyXG4gICAgICAgIGlzRXhwYW5kZWQgPSB0b2dnbGVCdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJztcclxuICAgIH0gZWxzZSBpZiAoc2VjdGlvbi5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSkge1xyXG4gICAgICAgIGlzRXhwYW5kZWQgPSBzZWN0aW9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNsYXNzLWJhc2VkIGRldGVjdGlvblxyXG4gICAgICAgIGlzRXhwYW5kZWQgPSBzZWN0aW9uLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAhc2VjdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBTZWN0aW9uICR7Y29udHJvbE5hbWV9IGN1cnJlbnQgc3RhdGU6ICR7aXNFeHBhbmRlZCA/ICdleHBhbmRlZCcgOiAnY29sbGFwc2VkJ31gKTtcclxuICAgIFxyXG4gICAgY29uc3QgbmVlZHNUb2dnbGUgPSAoYWN0aW9uID09PSAnZXhwYW5kJyAmJiAhaXNFeHBhbmRlZCkgfHwgKGFjdGlvbiA9PT0gJ2NvbGxhcHNlJyAmJiBpc0V4cGFuZGVkKTtcclxuICAgIFxyXG4gICAgaWYgKG5lZWRzVG9nZ2xlKSB7XHJcbiAgICAgICAgLy8gQ2xpY2sgdGhlIHRvZ2dsZSBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSB0b2dnbGVCdXR0b24gfHwgc2VjdGlvbjtcclxuICAgICAgICBsb2dTdGVwKGBDbGlja2luZyB0b2dnbGUgZWxlbWVudDogJHtjbGlja1RhcmdldC50YWdOYW1lfSwgY2xhc3M9JHtjbGlja1RhcmdldC5jbGFzc05hbWV9YCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZSBmb3IgRDM2NSBSZWFjdCBjb21wb25lbnRzXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJ1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBEMzY1IGludGVybmFsIGNvbnRyb2wgQVBJXHJcbiAgICAgICAgaWYgKHR5cGVvZiAkZHluICE9PSAndW5kZWZpbmVkJyAmJiAkZHluLmNvbnRyb2xzKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRyeSB2YXJpb3VzIEQzNjUgbWV0aG9kc1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29udHJvbC5FeHBhbmRlZENoYW5nZWQgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRXhwYW5kZWRDaGFuZ2VkIHRha2VzIDAgZm9yIGV4cGFuZCwgMSBmb3IgY29sbGFwc2UgaW4gRDM2NVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLkV4cGFuZGVkQ2hhbmdlZChhY3Rpb24gPT09ICdjb2xsYXBzZScgPyAxIDogMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBFeHBhbmRlZENoYW5nZWQoJHthY3Rpb24gPT09ICdjb2xsYXBzZScgPyAxIDogMH0pIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5leHBhbmQgPT09ICdmdW5jdGlvbicgJiYgYWN0aW9uID09PSAnZXhwYW5kJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLmV4cGFuZCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgZXhwYW5kKCkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLmNvbGxhcHNlID09PSAnZnVuY3Rpb24nICYmIGFjdGlvbiA9PT0gJ2NvbGxhcHNlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLmNvbGxhcHNlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBjb2xsYXBzZSgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC50b2dnbGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC50b2dnbGUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIHRvZ2dsZSgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICBsb2dTdGVwKGBEMzY1IGNvbnRyb2wgbWV0aG9kIGZhaWxlZDogJHtlLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSBhbHJlYWR5ICR7YWN0aW9ufWVkLCBubyB0b2dnbGUgbmVlZGVkYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYFNlY3Rpb24gJHtjb250cm9sTmFtZX0gJHthY3Rpb259ZWRgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZVF1ZXJ5RmlsdGVyKHRhYmxlTmFtZSwgZmllbGROYW1lLCBjcml0ZXJpYVZhbHVlLCBvcHRpb25zID0ge30pIHtcclxuICAgIGxvZ1N0ZXAoYENvbmZpZ3VyaW5nIHF1ZXJ5IGZpbHRlcjogJHt0YWJsZU5hbWUgPyB0YWJsZU5hbWUgKyAnLicgOiAnJ30ke2ZpZWxkTmFtZX0gPSAke2NyaXRlcmlhVmFsdWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgb3Igb3BlbiB0aGUgcXVlcnkgZmlsdGVyIGRpYWxvZ1xyXG4gICAgbGV0IHF1ZXJ5Rm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNRdWVyeUZvcm1cIl0nKTtcclxuICAgIGlmICghcXVlcnlGb3JtKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIG9wZW4gdGhlIHF1ZXJ5IGRpYWxvZyB2aWEgUXVlcnkgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUXVlcnlTZWxlY3RCdXR0b25cIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiUXVlcnlcIl0nKTtcclxuICAgICAgICBpZiAoZmlsdGVyQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIGZpbHRlckJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTtcclxuICAgICAgICAgICAgcXVlcnlGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFxdWVyeUZvcm0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1F1ZXJ5IGZpbHRlciBkaWFsb2cgKFN5c1F1ZXJ5Rm9ybSkgbm90IGZvdW5kLiBNYWtlIHN1cmUgdGhlIGZpbHRlciBkaWFsb2cgaXMgb3Blbi4nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSGVscGVyIHRvIGZpbmQgZWxlbWVudCB3aXRoaW4gcXVlcnkgZm9ybVxyXG4gICAgY29uc3QgZmluZEluUXVlcnkgPSAobmFtZSkgPT4gcXVlcnlGb3JtLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7bmFtZX1cIl1gKTtcclxuICAgIFxyXG4gICAgLy8gSWYgc2F2ZWRRdWVyeSBpcyBzcGVjaWZpZWQsIHNlbGVjdCBpdCBmcm9tIHRoZSBkcm9wZG93biBmaXJzdFxyXG4gICAgaWYgKG9wdGlvbnMuc2F2ZWRRdWVyeSkge1xyXG4gICAgICAgIGNvbnN0IHNhdmVkUXVlcnlCb3ggPSBmaW5kSW5RdWVyeSgnU2F2ZWRRdWVyaWVzQm94Jyk7XHJcbiAgICAgICAgaWYgKHNhdmVkUXVlcnlCb3gpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBzYXZlZFF1ZXJ5Qm94LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBvcHRpb25zLnNhdmVkUXVlcnkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTWFrZSBzdXJlIHdlJ3JlIG9uIHRoZSBSYW5nZSB0YWJcclxuICAgIGNvbnN0IHJhbmdlVGFiID0gZmluZEluUXVlcnkoJ1JhbmdlVGFiJykgfHwgZmluZEluUXVlcnkoJ1JhbmdlVGFiX2hlYWRlcicpO1xyXG4gICAgaWYgKHJhbmdlVGFiICYmICFyYW5nZVRhYi5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpICYmIHJhbmdlVGFiLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpICE9PSAndHJ1ZScpIHtcclxuICAgICAgICByYW5nZVRhYi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENsaWNrIEFkZCB0byBhZGQgYSBuZXcgZmlsdGVyIHJvd1xyXG4gICAgY29uc3QgYWRkQnV0dG9uID0gZmluZEluUXVlcnkoJ1JhbmdlQWRkJyk7XHJcbiAgICBpZiAoYWRkQnV0dG9uKSB7XHJcbiAgICAgICAgYWRkQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGhlIGdyaWQgdXNlcyBSZWFjdExpc3QgLSBmaW5kIHRoZSBsYXN0IHJvdyAobmV3bHkgYWRkZWQpIGFuZCBmaWxsIGluIHZhbHVlc1xyXG4gICAgY29uc3QgZ3JpZCA9IGZpbmRJblF1ZXJ5KCdSYW5nZUdyaWQnKTtcclxuICAgIGlmICghZ3JpZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUmFuZ2UgZ3JpZCBub3QgZm91bmQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGFsbCByb3dzIGFuZCBmaW5kIHRoZSBsYXN0IG9uZSAobW9zdCByZWNlbnRseSBhZGRlZClcclxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicm93XCJdLCB0ciwgLmxpc3Qtcm93Jyk7XHJcbiAgICBjb25zdCBsYXN0Um93ID0gcm93c1tyb3dzLmxlbmd0aCAtIDFdIHx8IGdyaWQ7XHJcbiAgICBcclxuICAgIC8vIFNldCB0YWJsZSBuYW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAodGFibGVOYW1lKSB7XHJcbiAgICAgICAgY29uc3QgdGFibGVDZWxsID0gbGFzdFJvdy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVRhYmxlXCJdJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVGFibGVcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0VGFibGVDZWxsID0gdGFibGVDZWxsLmxlbmd0aCA/IHRhYmxlQ2VsbFt0YWJsZUNlbGwubGVuZ3RoIC0gMV0gOiB0YWJsZUNlbGw7XHJcbiAgICAgICAgaWYgKGxhc3RUYWJsZUNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0VGFibGVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdFRhYmxlQ2VsbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgdGFibGVOYW1lKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBmaWVsZCBuYW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoZmllbGROYW1lKSB7XHJcbiAgICAgICAgY29uc3QgZmllbGRDZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VGaWVsZFwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RGaWVsZENlbGwgPSBmaWVsZENlbGxzW2ZpZWxkQ2VsbHMubGVuZ3RoIC0gMV0gfHwgZ3JpZC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZUZpZWxkXCJdJyk7XHJcbiAgICAgICAgaWYgKGxhc3RGaWVsZENlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0RmllbGRDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdEZpZWxkQ2VsbDtcclxuICAgICAgICAgICAgLy8gQ2xpY2sgdG8gb3BlbiBkcm9wZG93bi9mb2N1c1xyXG4gICAgICAgICAgICBpbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGZpZWxkTmFtZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgY3JpdGVyaWEgdmFsdWUgaWYgcHJvdmlkZWRcclxuICAgIGlmIChjcml0ZXJpYVZhbHVlKSB7XHJcbiAgICAgICAgY29uc3QgdmFsdWVDZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VWYWx1ZVwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RWYWx1ZUNlbGwgPSB2YWx1ZUNlbGxzW3ZhbHVlQ2VsbHMubGVuZ3RoIC0gMV0gfHwgZ3JpZC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVZhbHVlXCJdJyk7XHJcbiAgICAgICAgaWYgKGxhc3RWYWx1ZUNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0VmFsdWVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdFZhbHVlQ2VsbDtcclxuICAgICAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBjcml0ZXJpYVZhbHVlKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoJ1F1ZXJ5IGZpbHRlciBjb25maWd1cmVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVCYXRjaFByb2Nlc3NpbmcoZW5hYmxlZCwgdGFza0Rlc2NyaXB0aW9uLCBiYXRjaEdyb3VwLCBvcHRpb25zID0ge30pIHtcclxuICAgIGxvZ1N0ZXAoYENvbmZpZ3VyaW5nIGJhdGNoIHByb2Nlc3Npbmc6ICR7ZW5hYmxlZCA/ICdlbmFibGVkJyA6ICdkaXNhYmxlZCd9YCk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIGRpYWxvZyB0byBiZSByZWFkeVxyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgYmF0Y2ggcHJvY2Vzc2luZyBjaGVja2JveCAtIGNvbnRyb2wgbmFtZSBpcyBGbGQxXzEgaW4gU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXHJcbiAgICBjb25zdCBiYXRjaFRvZ2dsZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cIl0gW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiRmxkMV8xXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoJ0ZsZDFfMScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZsZDFfMVwiXScpO1xyXG4gICAgXHJcbiAgICBpZiAoYmF0Y2hUb2dnbGUpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBhY3R1YWwgY2hlY2tib3ggaW5wdXQgb3IgdG9nZ2xlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IGNoZWNrYm94ID0gYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJy50b2dnbGUtYnV0dG9uJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gY2hlY2tib3g/LmNoZWNrZWQgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5jbGFzc0xpc3QuY29udGFpbnMoJ29uJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRTdGF0ZSAhPT0gZW5hYmxlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGNoZWNrYm94IHx8IGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgLnRvZ2dsZS1zd2l0Y2gsIGxhYmVsJykgfHwgYmF0Y2hUb2dnbGU7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKCdXYXJuaW5nOiBCYXRjaCBwcm9jZXNzaW5nIHRvZ2dsZSAoRmxkMV8xKSBub3QgZm91bmQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHRhc2sgZGVzY3JpcHRpb24gaWYgcHJvdmlkZWQgYW5kIGJhdGNoIGlzIGVuYWJsZWQgKEZsZDJfMSlcclxuICAgIGlmIChlbmFibGVkICYmIHRhc2tEZXNjcmlwdGlvbikge1xyXG4gICAgICAgIGF3YWl0IHNldElucHV0VmFsdWUoJ0ZsZDJfMScsIHRhc2tEZXNjcmlwdGlvbik7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGJhdGNoIGdyb3VwIGlmIHByb3ZpZGVkIGFuZCBiYXRjaCBpcyBlbmFibGVkIChGbGQzXzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBiYXRjaEdyb3VwKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkM18xJywgYmF0Y2hHcm91cCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IFByaXZhdGUgYW5kIENyaXRpY2FsIG9wdGlvbnMgaWYgcHJvdmlkZWQgKEZsZDRfMSBhbmQgRmxkNV8xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgb3B0aW9ucy5wcml2YXRlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBzZXRDaGVja2JveCgnRmxkNF8xJywgb3B0aW9ucy5wcml2YXRlKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLmNyaXRpY2FsSm9iICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBzZXRDaGVja2JveCgnRmxkNV8xJywgb3B0aW9ucy5jcml0aWNhbEpvYik7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IE1vbml0b3JpbmcgY2F0ZWdvcnkgaWYgc3BlY2lmaWVkIChGbGQ2XzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLm1vbml0b3JpbmdDYXRlZ29yeSkge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoJ0ZsZDZfMScsIG9wdGlvbnMubW9uaXRvcmluZ0NhdGVnb3J5KTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdCYXRjaCBwcm9jZXNzaW5nIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZVJlY3VycmVuY2Uoc3RlcCkge1xyXG4gICAgY29uc3QgeyBwYXR0ZXJuVW5pdCwgcGF0dGVybkNvdW50LCBlbmREYXRlT3B0aW9uLCBlbmRBZnRlckNvdW50LCBlbmRCeURhdGUsIHN0YXJ0RGF0ZSwgc3RhcnRUaW1lLCB0aW1lem9uZSB9ID0gc3RlcDtcclxuICAgIFxyXG4gICAgY29uc3QgcGF0dGVyblVuaXRzID0gWydtaW51dGVzJywgJ2hvdXJzJywgJ2RheXMnLCAnd2Vla3MnLCAnbW9udGhzJywgJ3llYXJzJ107XHJcbiAgICBsb2dTdGVwKGBDb25maWd1cmluZyByZWN1cnJlbmNlOiBldmVyeSAke3BhdHRlcm5Db3VudH0gJHtwYXR0ZXJuVW5pdHNbcGF0dGVyblVuaXQgfHwgMF19YCk7XHJcbiAgICBcclxuICAgIC8vIENsaWNrIFJlY3VycmVuY2UgYnV0dG9uIHRvIG9wZW4gZGlhbG9nIGlmIG5vdCBhbHJlYWR5IG9wZW5cclxuICAgIGxldCByZWN1cnJlbmNlRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICBpZiAoIXJlY3VycmVuY2VGb3JtKSB7XHJcbiAgICAgICAgLy8gTW51SXRtXzEgaXMgdGhlIFJlY3VycmVuY2UgYnV0dG9uIGluIFN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVxyXG4gICAgICAgIGNvbnN0IHJlY3VycmVuY2VCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1udUl0bV8xXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCgnTW51SXRtXzEnKTtcclxuICAgICAgICBpZiAocmVjdXJyZW5jZUJ1dHRvbikge1xyXG4gICAgICAgICAgICByZWN1cnJlbmNlQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgICAgICByZWN1cnJlbmNlRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXJlY3VycmVuY2VGb3JtKSB7XHJcbiAgICAgICAgbG9nU3RlcCgnV2FybmluZzogQ291bGQgbm90IG9wZW4gU3lzUmVjdXJyZW5jZSBkaWFsb2cnKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBmaW5kIGVsZW1lbnQgd2l0aGluIHJlY3VycmVuY2UgZm9ybVxyXG4gICAgY29uc3QgZmluZEluUmVjdXJyZW5jZSA9IChuYW1lKSA9PiByZWN1cnJlbmNlRm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke25hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIC8vIFNldCBzdGFydCBkYXRlIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoc3RhcnREYXRlKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnREYXRlSW5wdXQgPSBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydERhdGUnKT8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydERhdGUnKTtcclxuICAgICAgICBpZiAoc3RhcnREYXRlSW5wdXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShzdGFydERhdGVJbnB1dCwgc3RhcnREYXRlKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBzdGFydCB0aW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoc3RhcnRUaW1lKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRUaW1lSW5wdXQgPSBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydFRpbWUnKT8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydFRpbWUnKTtcclxuICAgICAgICBpZiAoc3RhcnRUaW1lSW5wdXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShzdGFydFRpbWVJbnB1dCwgc3RhcnRUaW1lKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCB0aW1lem9uZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHRpbWV6b25lKSB7XHJcbiAgICAgICAgY29uc3QgdGltZXpvbmVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnVGltZXpvbmUnKTtcclxuICAgICAgICBpZiAodGltZXpvbmVDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gdGltZXpvbmVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCB0aW1lem9uZSk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgcGF0dGVybiB1bml0IChyYWRpbyBidXR0b25zOiBNaW51dGVzPTAsIEhvdXJzPTEsIERheXM9MiwgV2Vla3M9MywgTW9udGhzPTQsIFllYXJzPTUpXHJcbiAgICBpZiAocGF0dGVyblVuaXQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGNvbnN0IHBhdHRlcm5Vbml0Q29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoJ1BhdHRlcm5Vbml0Jyk7XHJcbiAgICAgICAgaWYgKHBhdHRlcm5Vbml0Q29udHJvbCkge1xyXG4gICAgICAgICAgICAvLyBSYWRpbyBidXR0b25zIGFyZSB0eXBpY2FsbHkgcmVuZGVyZWQgYXMgYSBncm91cCB3aXRoIG11bHRpcGxlIG9wdGlvbnNcclxuICAgICAgICAgICAgY29uc3QgcmFkaW9JbnB1dHMgPSBwYXR0ZXJuVW5pdENvbnRyb2wucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInJhZGlvXCJdJyk7XHJcbiAgICAgICAgICAgIGlmIChyYWRpb0lucHV0cy5sZW5ndGggPiBwYXR0ZXJuVW5pdCkge1xyXG4gICAgICAgICAgICAgICAgcmFkaW9JbnB1dHNbcGF0dGVyblVuaXRdLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApOyAvLyBXYWl0IGZvciBVSSB0byB1cGRhdGUgd2l0aCBhcHByb3ByaWF0ZSBpbnRlcnZhbCBmaWVsZFxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IGNsaWNraW5nIHRoZSBudGggb3B0aW9uIGxhYmVsL2J1dHRvblxyXG4gICAgICAgICAgICAgICAgY29uc3QgcmFkaW9PcHRpb25zID0gcGF0dGVyblVuaXRDb250cm9sLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicmFkaW9cIl0sIGxhYmVsLCBidXR0b24nKTtcclxuICAgICAgICAgICAgICAgIGlmIChyYWRpb09wdGlvbnMubGVuZ3RoID4gcGF0dGVyblVuaXQpIHtcclxuICAgICAgICAgICAgICAgICAgICByYWRpb09wdGlvbnNbcGF0dGVyblVuaXRdLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGludGVydmFsIGNvdW50IGJhc2VkIG9uIHBhdHRlcm4gdW5pdFxyXG4gICAgLy8gVGhlIHZpc2libGUgaW5wdXQgZmllbGQgY2hhbmdlcyBiYXNlZCBvbiBzZWxlY3RlZCBwYXR0ZXJuIHVuaXRcclxuICAgIGlmIChwYXR0ZXJuQ291bnQpIHtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2xOYW1lcyA9IFsnTWludXRlSW50JywgJ0hvdXJJbnQnLCAnRGF5SW50JywgJ1dlZWtJbnQnLCAnTW9udGhJbnQnLCAnWWVhckludCddO1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbE5hbWUgPSBjb3VudENvbnRyb2xOYW1lc1twYXR0ZXJuVW5pdCB8fCAwXTtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKGNvdW50Q29udHJvbE5hbWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb3VudENvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBjb3VudENvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBjb3VudENvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIHBhdHRlcm5Db3VudC50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBlbmQgZGF0ZSBvcHRpb25zXHJcbiAgICBpZiAoZW5kRGF0ZU9wdGlvbiA9PT0gJ25vRW5kRGF0ZScpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIk5vIGVuZCBkYXRlXCIgZ3JvdXAgKEVuZERhdGUxKVxyXG4gICAgICAgIGNvbnN0IG5vRW5kRGF0ZUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTEnKTtcclxuICAgICAgICBpZiAobm9FbmREYXRlR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBub0VuZERhdGVHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBub0VuZERhdGVHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGVuZERhdGVPcHRpb24gPT09ICdlbmRBZnRlcicgJiYgZW5kQWZ0ZXJDb3VudCkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGFmdGVyXCIgZ3JvdXAgKEVuZERhdGUyKSBhbmQgc2V0IGNvdW50XHJcbiAgICAgICAgY29uc3QgZW5kQWZ0ZXJHcm91cCA9IGZpbmRJblJlY3VycmVuY2UoJ0VuZERhdGUyJyk7XHJcbiAgICAgICAgaWYgKGVuZEFmdGVyR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBlbmRBZnRlckdyb3VwLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXSwgW3JvbGU9XCJyYWRpb1wiXScpIHx8IGVuZEFmdGVyR3JvdXA7XHJcbiAgICAgICAgICAgIHJhZGlvLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFNldCB0aGUgY291bnQgKEVuZERhdGVJbnQpXHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZUludCcpO1xyXG4gICAgICAgIGlmIChjb3VudENvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBjb3VudENvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBjb3VudENvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGVuZEFmdGVyQ291bnQudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQnknICYmIGVuZEJ5RGF0ZSkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGJ5XCIgZ3JvdXAgKEVuZERhdGUzKSBhbmQgc2V0IGRhdGVcclxuICAgICAgICBjb25zdCBlbmRCeUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTMnKTtcclxuICAgICAgICBpZiAoZW5kQnlHcm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCByYWRpbyA9IGVuZEJ5R3JvdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdLCBbcm9sZT1cInJhZGlvXCJdJykgfHwgZW5kQnlHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gU2V0IHRoZSBlbmQgZGF0ZSAoRW5kRGF0ZURhdGUpXHJcbiAgICAgICAgY29uc3QgZGF0ZUNvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlRGF0ZScpO1xyXG4gICAgICAgIGlmIChkYXRlQ29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRhdGVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgZGF0ZUNvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGVuZEJ5RGF0ZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdSZWN1cnJlbmNlIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXRFbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgaWYgKCFpbnB1dEVsZW1lbnQpIHJldHVybjtcclxuICAgIFxyXG4gICAgLy8gRm9jdXMgdGhlIGlucHV0XHJcbiAgICBpbnB1dEVsZW1lbnQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlXHJcbiAgICBpbnB1dEVsZW1lbnQuc2VsZWN0Py4oKTtcclxuICAgIFxyXG4gICAgLy8gU2V0IHRoZSB2YWx1ZVxyXG4gICAgaW5wdXRFbGVtZW50LnZhbHVlID0gdmFsdWU7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXRFbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0RmlsdGVyTWV0aG9kKGZpbHRlckNvbnRhaW5lciwgbWV0aG9kKSB7XHJcbiAgICAvLyBGaW5kIHRoZSBmaWx0ZXIgb3BlcmF0b3IgZHJvcGRvd24gbmVhciB0aGUgZmlsdGVyIGlucHV0XHJcbiAgICAvLyBEMzY1IHVzZXMgdmFyaW91cyBwYXR0ZXJucyBmb3IgdGhlIG9wZXJhdG9yIGRyb3Bkb3duXHJcbiAgICBjb25zdCBvcGVyYXRvclBhdHRlcm5zID0gW1xyXG4gICAgICAgICdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyT3BlcmF0b3JcIl0nLFxyXG4gICAgICAgICdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiX09wZXJhdG9yXCJdJyxcclxuICAgICAgICAnLmZpbHRlci1vcGVyYXRvcicsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0nXHJcbiAgICBdO1xyXG4gICAgXHJcbiAgICBsZXQgb3BlcmF0b3JEcm9wZG93biA9IG51bGw7XHJcbiAgICBjb25zdCBzZWFyY2hDb250YWluZXIgPSBmaWx0ZXJDb250YWluZXI/LnBhcmVudEVsZW1lbnQgfHwgZG9jdW1lbnQ7XHJcbiAgICBcclxuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBvcGVyYXRvclBhdHRlcm5zKSB7XHJcbiAgICAgICAgb3BlcmF0b3JEcm9wZG93biA9IHNlYXJjaENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKHBhdHRlcm4pO1xyXG4gICAgICAgIGlmIChvcGVyYXRvckRyb3Bkb3duICYmIG9wZXJhdG9yRHJvcGRvd24ub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFvcGVyYXRvckRyb3Bkb3duKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNkEwIEZpbHRlciBvcGVyYXRvciBkcm9wZG93biBub3QgZm91bmQsIHVzaW5nIGRlZmF1bHQgbWV0aG9kYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDbGljayB0byBvcGVuIHRoZSBkcm9wZG93blxyXG4gICAgY29uc3QgZHJvcGRvd25CdXR0b24gPSBvcGVyYXRvckRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgW3JvbGU9XCJjb21ib2JveFwiXSwgLmR5bi1jb21ib0JveC1idXR0b24nKSB8fCBvcGVyYXRvckRyb3Bkb3duO1xyXG4gICAgZHJvcGRvd25CdXR0b24uY2xpY2soKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgYW5kIGNsaWNrIHRoZSBtYXRjaGluZyBvcHRpb25cclxuICAgIGNvbnN0IG1ldGhvZE1hcHBpbmdzID0ge1xyXG4gICAgICAgICdpcyBleGFjdGx5JzogWydpcyBleGFjdGx5JywgJ2VxdWFscycsICdpcyBlcXVhbCB0bycsICc9J10sXHJcbiAgICAgICAgJ2NvbnRhaW5zJzogWydjb250YWlucycsICdsaWtlJ10sXHJcbiAgICAgICAgJ2JlZ2lucyB3aXRoJzogWydiZWdpbnMgd2l0aCcsICdzdGFydHMgd2l0aCddLFxyXG4gICAgICAgICdpcyBub3QnOiBbJ2lzIG5vdCcsICdub3QgZXF1YWwnLCAnIT0nLCAnPD4nXSxcclxuICAgICAgICAnZG9lcyBub3QgY29udGFpbic6IFsnZG9lcyBub3QgY29udGFpbicsICdub3QgbGlrZSddLFxyXG4gICAgICAgICdpcyBvbmUgb2YnOiBbJ2lzIG9uZSBvZicsICdpbiddLFxyXG4gICAgICAgICdhZnRlcic6IFsnYWZ0ZXInLCAnZ3JlYXRlciB0aGFuJywgJz4nXSxcclxuICAgICAgICAnYmVmb3JlJzogWydiZWZvcmUnLCAnbGVzcyB0aGFuJywgJzwnXSxcclxuICAgICAgICAnbWF0Y2hlcyc6IFsnbWF0Y2hlcycsICdyZWdleCcsICdwYXR0ZXJuJ11cclxuICAgIH07XHJcbiAgICBcclxuICAgIGNvbnN0IHNlYXJjaFRlcm1zID0gbWV0aG9kTWFwcGluZ3NbbWV0aG9kXSB8fCBbbWV0aG9kXTtcclxuICAgIFxyXG4gICAgLy8gTG9vayBmb3Igb3B0aW9ucyBpbiBsaXN0Ym94L2Ryb3Bkb3duXHJcbiAgICBjb25zdCBvcHRpb25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJvcHRpb25cIl0sIFtyb2xlPVwibGlzdGl0ZW1cIl0sIC5keW4tbGlzdFZpZXctaXRlbScpO1xyXG4gICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBvcHQudGV4dENvbnRlbnQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBmb3IgKGNvbnN0IHRlcm0gb2Ygc2VhcmNoVGVybXMpIHtcclxuICAgICAgICAgICAgaWYgKHRleHQuaW5jbHVkZXModGVybS50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICAgICAgb3B0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgU2V0IGZpbHRlciBtZXRob2Q6ICR7bWV0aG9kfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgc2VsZWN0IGVsZW1lbnRcclxuICAgIGNvbnN0IHNlbGVjdEVsID0gb3BlcmF0b3JEcm9wZG93bi5xdWVyeVNlbGVjdG9yKCdzZWxlY3QnKTtcclxuICAgIGlmIChzZWxlY3RFbCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgb3B0IG9mIHNlbGVjdEVsLm9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG9wdC50ZXh0Q29udGVudC50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRlcm0gb2Ygc2VhcmNoVGVybXMpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0LmluY2x1ZGVzKHRlcm0udG9Mb3dlckNhc2UoKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZWxlY3RFbC52YWx1ZSA9IG9wdC52YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBzZWxlY3RFbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFNldCBmaWx0ZXIgbWV0aG9kOiAke21ldGhvZH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGAgIFx1MjZBMCBDb3VsZCBub3Qgc2V0IGZpbHRlciBtZXRob2QgXCIke21ldGhvZH1cIiwgdXNpbmcgZGVmYXVsdGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0UmFkaW9CdXR0b25WYWx1ZShlbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgbG9nU3RlcChgU2V0dGluZyByYWRpbyBidXR0b24gdmFsdWU6ICR7dmFsdWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgYWxsIHJhZGlvIG9wdGlvbnMgaW4gdGhpcyBncm91cFxyXG4gICAgY29uc3QgcmFkaW9JbnB1dHMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXScpO1xyXG4gICAgY29uc3QgcmFkaW9Sb2xlcyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyYWRpb1wiXScpO1xyXG4gICAgY29uc3Qgb3B0aW9ucyA9IHJhZGlvSW5wdXRzLmxlbmd0aCA+IDAgPyBBcnJheS5mcm9tKHJhZGlvSW5wdXRzKSA6IEFycmF5LmZyb20ocmFkaW9Sb2xlcyk7XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIGNsaWNrYWJsZSBsYWJlbHMvYnV0dG9ucyB0aGF0IGFjdCBhcyByYWRpbyBvcHRpb25zXHJcbiAgICAgICAgY29uc3QgbGFiZWxCdXR0b25zID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdsYWJlbCwgYnV0dG9uLCBbZGF0YS1keW4tcm9sZT1cIlJhZGlvQnV0dG9uXCJdJyk7XHJcbiAgICAgICAgb3B0aW9ucy5wdXNoKC4uLkFycmF5LmZyb20obGFiZWxCdXR0b25zKSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gcmFkaW8gb3B0aW9ucyBmb3VuZCBpbiBlbGVtZW50YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYEZvdW5kICR7b3B0aW9ucy5sZW5ndGh9IHJhZGlvIG9wdGlvbnNgKTtcclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIG1hdGNoIGJ5IGluZGV4IChpZiB2YWx1ZSBpcyBhIG51bWJlciBvciBudW1lcmljIHN0cmluZylcclxuICAgIGNvbnN0IG51bVZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKTtcclxuICAgIGlmICghaXNOYU4obnVtVmFsdWUpICYmIG51bVZhbHVlID49IDAgJiYgbnVtVmFsdWUgPCBvcHRpb25zLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldE9wdGlvbiA9IG9wdGlvbnNbbnVtVmFsdWVdO1xyXG4gICAgICAgIGxvZ1N0ZXAoYENsaWNraW5nIHJhZGlvIG9wdGlvbiBhdCBpbmRleCAke251bVZhbHVlfWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENsaWNrIHRoZSByYWRpbyBvcHRpb24gb3IgaXRzIGFzc29jaWF0ZWQgbGFiZWxcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IHRhcmdldE9wdGlvbi50YWdOYW1lID09PSAnSU5QVVQnIFxyXG4gICAgICAgICAgICA/ICh0YXJnZXRPcHRpb24uY2xvc2VzdCgnbGFiZWwnKSB8fCB0YXJnZXRPcHRpb24ucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcignbGFiZWwnKSB8fCB0YXJnZXRPcHRpb24pXHJcbiAgICAgICAgICAgIDogdGFyZ2V0T3B0aW9uO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc3BhdGNoIGZ1bGwgY2xpY2sgc2VxdWVuY2VcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcnVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFsc28gdHJ5IGNsaWNraW5nIHRoZSBpbnB1dCBkaXJlY3RseVxyXG4gICAgICAgIGlmICh0YXJnZXRPcHRpb24udGFnTmFtZSA9PT0gJ0lOUFVUJykge1xyXG4gICAgICAgICAgICB0YXJnZXRPcHRpb24uY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHRhcmdldE9wdGlvbi5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSB0byBtYXRjaCBieSBsYWJlbCB0ZXh0XHJcbiAgICBjb25zdCBzZWFyY2hWYWx1ZSA9IFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKTtcclxuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcclxuICAgICAgICBjb25zdCBsYWJlbCA9IG9wdGlvbi5jbG9zZXN0KCdsYWJlbCcpIHx8IG9wdGlvbi5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpO1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKS50b0xvd2VyQ2FzZSgpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKT8udG9Mb3dlckNhc2UoKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbi50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkgfHwgJyc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRleHQuaW5jbHVkZXMoc2VhcmNoVmFsdWUpIHx8IHNlYXJjaFZhbHVlLmluY2x1ZGVzKHRleHQpKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYENsaWNraW5nIHJhZGlvIG9wdGlvbiB3aXRoIHRleHQ6ICR7dGV4dH1gKTtcclxuICAgICAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSBsYWJlbCB8fCBvcHRpb247XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob3B0aW9uLnRhZ05hbWUgPT09ICdJTlBVVCcpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBSYWRpbyBvcHRpb24gbm90IGZvdW5kIGZvciB2YWx1ZTogJHt2YWx1ZX1gKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBTZWdtZW50ZWRFbnRyeScpO1xyXG5cclxuICAgIC8vIEZpbmQgdGhlIGxvb2t1cCBidXR0b25cclxuICAgIGNvbnN0IGxvb2t1cEJ1dHRvbiA9IGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGxvb2t1cCBidXR0b24sIHRyeSBrZXlib2FyZCB0byBvcGVuIHRoZSBmbHlvdXQgZmlyc3RcclxuICAgIGlmICghbG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENsaWNrIHRoZSBsb29rdXAgYnV0dG9uIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBpZiAobG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgbG9va3VwQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODAwKTsgLy8gV2FpdCBmb3IgbG9va3VwIHRvIGxvYWRcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5kIHRoZSBsb29rdXAgcG9wdXAvZmx5b3V0XHJcbiAgICBjb25zdCBsb29rdXBQb3B1cCA9IGF3YWl0IHdhaXRGb3JMb29rdXBQb3B1cCgpO1xyXG4gICAgaWYgKCFsb29rdXBQb3B1cCkge1xyXG4gICAgICAgIGlmICghd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uc3VwcHJlc3NMb29rdXBXYXJuaW5ncykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ0xvb2t1cCBwb3B1cCBub3QgZm91bmQsIHRyeWluZyBkaXJlY3QgaW5wdXQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBhIGRvY2tlZCBsb29rdXAgZmx5b3V0IGV4aXN0cyAoc2VnbWVudGVkIGVudHJ5KSwgdHlwZSBpbnRvIGl0cyBmaWx0ZXIgaW5wdXRcclxuICAgIGNvbnN0IGRvY2sgPSBhd2FpdCB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQoZWxlbWVudCwgMTUwMCk7XHJcbiAgICBpZiAoZG9jaykge1xyXG4gICAgICAgIGNvbnN0IGRvY2tJbnB1dCA9IGZpbmRMb29rdXBGaWx0ZXJJbnB1dChkb2NrKTtcclxuICAgICAgICBpZiAoZG9ja0lucHV0KSB7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAgICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoZG9ja0lucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFR5cGUgdmFsdWUgaW4gdGhlIHNlYXJjaC9maWx0ZXIgZmllbGQgb2YgdGhlIGxvb2t1cFxyXG4gICAgY29uc3QgbG9va3VwSW5wdXQgPSBsb29rdXBQb3B1cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwidGV4dFwiXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmIChsb29rdXBJbnB1dCkge1xyXG4gICAgICAgIGxvb2t1cElucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGxvb2t1cElucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTsgLy8gV2FpdCBmb3Igc2VydmVyIGZpbHRlclxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5kIGFuZCBjbGljayB0aGUgbWF0Y2hpbmcgcm93XHJcbiAgICBjb25zdCByb3dzID0gYXdhaXQgd2FpdEZvckxvb2t1cFJvd3MobG9va3VwUG9wdXAsIGVsZW1lbnQsIDUwMDApO1xyXG4gICAgbGV0IGZvdW5kTWF0Y2ggPSBmYWxzZTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSByb3cudGV4dENvbnRlbnQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcclxuICAgICAgICBpZiAodGV4dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKSkpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImdyaWRjZWxsXCJdLCB0ZCcpO1xyXG4gICAgICAgICAgICAoY2VsbCB8fCByb3cpLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGZvdW5kTWF0Y2ggPSB0cnVlO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWZvdW5kTWF0Y2gpIHtcclxuICAgICAgICBjb25zdCBzYW1wbGUgPSBBcnJheS5mcm9tKHJvd3MpLnNsaWNlKDAsIDgpLm1hcChyID0+IHIudGV4dENvbnRlbnQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKSk7XHJcbiAgICAgICAgaWYgKCF3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzPy5zdXBwcmVzc0xvb2t1cFdhcm5pbmdzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignTm8gbWF0Y2hpbmcgbG9va3VwIHZhbHVlIGZvdW5kLCBjbG9zaW5nIHBvcHVwJywgeyB2YWx1ZSwgc2FtcGxlIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBUcnkgdG8gY2xvc2UgdGhlIHBvcHVwXHJcbiAgICAgICAgY29uc3QgY2xvc2VCdG4gPSBsb29rdXBQb3B1cC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJDbG9zZVwiXSwgLmNsb3NlLWJ1dHRvbicpO1xyXG4gICAgICAgIGlmIChjbG9zZUJ0bikgY2xvc2VCdG4uY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBkaXJlY3QgdHlwaW5nXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDb21ib0JveFZhbHVlKGVsZW1lbnQsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXSwgc2VsZWN0Jyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBDb21ib0JveCcpO1xyXG5cclxuICAgIC8vIElmIGl0J3MgYSBuYXRpdmUgc2VsZWN0LCB1c2Ugb3B0aW9uIHNlbGVjdGlvblxyXG4gICAgaWYgKGlucHV0LnRhZ05hbWUgPT09ICdTRUxFQ1QnKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmZyb20oaW5wdXQub3B0aW9ucyk7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gb3B0aW9ucy5maW5kKG9wdCA9PiBvcHQudGV4dC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuZmluZChvcHQgPT4gb3B0LnRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpKTtcclxuICAgICAgICBpZiAoIXRhcmdldCkgdGhyb3cgbmV3IEVycm9yKGBPcHRpb24gbm90IGZvdW5kOiAke3ZhbHVlfWApO1xyXG4gICAgICAgIGlucHV0LnZhbHVlID0gdGFyZ2V0LnZhbHVlO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBPcGVuIHRoZSBkcm9wZG93biAoYnV0dG9uIHByZWZlcnJlZClcclxuICAgIGNvbnN0IGNvbWJvQnV0dG9uID0gZmluZENvbWJvQm94QnV0dG9uKGVsZW1lbnQpO1xyXG4gICAgaWYgKGNvbWJvQnV0dG9uKSB7XHJcbiAgICAgICAgY29tYm9CdXR0b24uY2xpY2soKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcblxyXG4gICAgLy8gVHJ5IHR5cGluZyB0byBmaWx0ZXIgd2hlbiBhbGxvd2VkICh1c2Ugc2VsZWN0ZWQgaW5wdXQgbWV0aG9kKVxyXG4gICAgaWYgKCFpbnB1dC5yZWFkT25seSAmJiAhaW5wdXQuZGlzYWJsZWQpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBsaXN0Ym94IG5lYXIgdGhlIGZpZWxkIG9yIGxpbmtlZCB2aWEgYXJpYS1jb250cm9sc1xyXG4gICAgY29uc3QgbGlzdGJveCA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsaXN0Ym94KSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IHByZXNzIEVudGVyIHRvIGNvbW1pdCB0eXBlZCB2YWx1ZVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgb3B0aW9ucyA9IGNvbGxlY3RDb21ib09wdGlvbnMobGlzdGJveCk7XHJcbiAgICBjb25zdCBzZWFyY2ggPSBub3JtYWxpemVUZXh0KHZhbHVlKTtcclxuICAgIGxldCBtYXRjaGVkID0gZmFsc2U7XHJcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQob3B0aW9uLnRleHRDb250ZW50KTtcclxuICAgICAgICBpZiAodGV4dCA9PT0gc2VhcmNoIHx8IHRleHQuaW5jbHVkZXMoc2VhcmNoKSkge1xyXG4gICAgICAgICAgICAvLyBUcnkgdG8gbWFyayBzZWxlY3Rpb24gZm9yIEFSSUEtYmFzZWQgY29tYm9ib3hlc1xyXG4gICAgICAgICAgICBvcHRpb25zLmZvckVhY2gob3B0ID0+IG9wdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAnZmFsc2UnKSk7XHJcbiAgICAgICAgICAgIG9wdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAndHJ1ZScpO1xyXG4gICAgICAgICAgICBpZiAoIW9wdGlvbi5pZCkge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9uLmlkID0gYGQzNjVvcHRfJHtEYXRlLm5vdygpfV8ke01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwKX1gO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jywgb3B0aW9uLmlkKTtcclxuXHJcbiAgICAgICAgICAgIG9wdGlvbi5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcgfSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvblRleHQgPSBvcHRpb24udGV4dENvbnRlbnQudHJpbSgpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xpY2sgdGhlIG9wdGlvbiB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgZGlzcGF0Y2hDbGlja1NlcXVlbmNlKG9wdGlvbik7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhcHBsaWVkID0gYXdhaXQgd2FpdEZvcklucHV0VmFsdWUoaW5wdXQsIG9wdGlvblRleHQsIDgwMCk7XHJcbiAgICAgICAgICAgIGlmICghYXBwbGllZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gU29tZSBEMzY1IGNvbWJvcyBjb21taXQgb24ga2V5IHNlbGVjdGlvbiByYXRoZXIgdGhhbiBjbGlja1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gRm9yY2UgaW5wdXQgdmFsdWUgdXBkYXRlIGZvciBEMzY1IGNvbWJvYm94ZXNcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNDAwKTtcclxuICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZVRleHQoaW5wdXQudmFsdWUpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvblRleHQpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21taXRDb21ib1ZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIGlucHV0LnZhbHVlLCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wdGlvbiBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveChjb250cm9sTmFtZSwgY2hlY2tlZCkge1xyXG4gICAgY29uc3QgY29udGFpbmVyID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIGlmICghY29udGFpbmVyKSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogQ2hlY2tib3ggJHtjb250cm9sTmFtZX0gbm90IGZvdW5kYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBjaGVja2JveCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImNoZWNrYm94XCJdJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGNoZWNrYm94Py5jaGVja2VkIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ29uJyk7XHJcbiAgICBcclxuICAgIGlmIChjdXJyZW50U3RhdGUgIT09IGNoZWNrZWQpIHtcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGNoZWNrYm94IHx8IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdsYWJlbCwgYnV0dG9uJykgfHwgY29udGFpbmVyO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICB9XHJcbn1cclxuIiwgImltcG9ydCBEMzY1SW5zcGVjdG9yIGZyb20gJy4vaW5zcGVjdG9yL0QzNjVJbnNwZWN0b3IuanMnO1xyXG5pbXBvcnQgeyBsb2dTdGVwLCBzZW5kTG9nIH0gZnJvbSAnLi91dGlscy9sb2dnaW5nLmpzJztcbmltcG9ydCB7IHNsZWVwIH0gZnJvbSAnLi91dGlscy9hc3luYy5qcyc7XG5pbXBvcnQgeyBjb2VyY2VCb29sZWFuLCBub3JtYWxpemVUZXh0IH0gZnJvbSAnLi91dGlscy90ZXh0LmpzJztcbmltcG9ydCB7IE5hdmlnYXRpb25JbnRlcnJ1cHRFcnJvciB9IGZyb20gJy4vcnVudGltZS9lcnJvcnMuanMnO1xuaW1wb3J0IHsgZ2V0U3RlcEVycm9yQ29uZmlnLCBmaW5kTG9vcFBhaXJzLCBmaW5kSWZQYWlycyB9IGZyb20gJy4vcnVudGltZS9lbmdpbmUtdXRpbHMuanMnO1xuaW1wb3J0IHsgY2xpY2tFbGVtZW50LCBhcHBseUdyaWRGaWx0ZXIsIHdhaXRVbnRpbENvbmRpdGlvbiwgc2V0SW5wdXRWYWx1ZSwgc2V0R3JpZENlbGxWYWx1ZSwgc2V0TG9va3VwU2VsZWN0VmFsdWUsIHNldENoZWNrYm94VmFsdWUsIG5hdmlnYXRlVG9Gb3JtLCBhY3RpdmF0ZVRhYiwgYWN0aXZhdGVBY3Rpb25QYW5lVGFiLCBleHBhbmRPckNvbGxhcHNlU2VjdGlvbiwgY29uZmlndXJlUXVlcnlGaWx0ZXIsIGNvbmZpZ3VyZUJhdGNoUHJvY2Vzc2luZywgY2xvc2VEaWFsb2csIGNvbmZpZ3VyZVJlY3VycmVuY2UgfSBmcm9tICcuL3N0ZXBzL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsIGlzRWxlbWVudFZpc2libGUgfSBmcm9tICcuL3V0aWxzL2RvbS5qcyc7XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0SW5qZWN0ZWQoeyB3aW5kb3dPYmogPSBnbG9iYWxUaGlzLndpbmRvdywgZG9jdW1lbnRPYmogPSBnbG9iYWxUaGlzLmRvY3VtZW50LCBpbnNwZWN0b3JGYWN0b3J5ID0gKCkgPT4gbmV3IEQzNjVJbnNwZWN0b3IoKSB9ID0ge30pIHtcbiAgICBpZiAoIXdpbmRvd09iaiB8fCAhZG9jdW1lbnRPYmopIHtcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ21pc3Npbmctd2luZG93LW9yLWRvY3VtZW50JyB9O1xuICAgIH1cbiAgICBjb25zdCB3aW5kb3cgPSB3aW5kb3dPYmo7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBkb2N1bWVudE9iajtcbiAgICBjb25zdCBuYXZpZ2F0b3IgPSB3aW5kb3dPYmoubmF2aWdhdG9yIHx8IGdsb2JhbFRoaXMubmF2aWdhdG9yO1xuXG4gICAgd2luZG93LkQzNjVJbnNwZWN0b3IgPSBEMzY1SW5zcGVjdG9yO1xuXG4gICAgLy8gPT09PT09IEluaXRpYWxpemUgYW5kIExpc3RlbiBmb3IgTWVzc2FnZXMgPT09PT09XG5cbiAgICAvLyBQcmV2ZW50IGR1cGxpY2F0ZSBpbml0aWFsaXphdGlvblxuICAgIGlmICh3aW5kb3cuZDM2NUluamVjdGVkU2NyaXB0TG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdEMzY1IGluamVjdGVkIHNjcmlwdCBhbHJlYWR5IGxvYWRlZCwgc2tpcHBpbmcuLi4nKTtcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ2FscmVhZHktbG9hZGVkJyB9O1xuICAgIH1cblxuICAgIHdpbmRvdy5kMzY1SW5qZWN0ZWRTY3JpcHRMb2FkZWQgPSB0cnVlO1xuXG4gICAgLy8gQ3JlYXRlIGluc3BlY3RvciBpbnN0YW5jZVxuICAgIGNvbnN0IGluc3BlY3RvciA9IGluc3BlY3RvckZhY3RvcnkoKTtcblxyXG4gICAgLy8gPT09PT09IFdvcmtmbG93IEV4ZWN1dGlvbiBFbmdpbmUgPT09PT09XHJcbiAgICBsZXQgY3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSB7fTtcclxuICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncztcclxuICAgIGxldCBjdXJyZW50V29ya2Zsb3cgPSBudWxsO1xyXG4gICAgbGV0IGV4ZWN1dGlvbkNvbnRyb2wgPSB7XHJcbiAgICAgICAgaXNQYXVzZWQ6IGZhbHNlLFxyXG4gICAgICAgIGlzU3RvcHBlZDogZmFsc2UsXHJcbiAgICAgICAgY3VycmVudFN0ZXBJbmRleDogMCxcclxuICAgICAgICBjdXJyZW50Um93SW5kZXg6IDAsXHJcbiAgICAgICAgdG90YWxSb3dzOiAwLFxyXG4gICAgICAgIGN1cnJlbnREYXRhUm93OiBudWxsLFxyXG4gICAgICAgIHJ1bk9wdGlvbnM6IHtcclxuICAgICAgICAgICAgc2tpcFJvd3M6IDAsXHJcbiAgICAgICAgICAgIGxpbWl0Um93czogMCxcclxuICAgICAgICAgICAgZHJ5UnVuOiBmYWxzZVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgLy8gU2luZ2xlIHVuaWZpZWQgbWVzc2FnZSBsaXN0ZW5lclxyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICBpZiAoZXZlbnQuc291cmNlICE9PSB3aW5kb3cpIHJldHVybjtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEaXNjb3ZlcnkgcmVxdWVzdHNcclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9ESVNDT1ZFUl9FTEVNRU5UUycpIHtcclxuICAgICAgICAgICAgY29uc3QgYWN0aXZlRm9ybU9ubHkgPSBldmVudC5kYXRhLmFjdGl2ZUZvcm1Pbmx5IHx8IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBlbGVtZW50cyA9IGluc3BlY3Rvci5kaXNjb3ZlckVsZW1lbnRzKGFjdGl2ZUZvcm1Pbmx5KTtcclxuICAgICAgICAgICAgY29uc3QgYWN0aXZlRm9ybSA9IGluc3BlY3Rvci5nZXRBY3RpdmVGb3JtTmFtZSgpO1xyXG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfRUxFTUVOVFNfRElTQ09WRVJFRCcsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50czogZWxlbWVudHMubWFwKGVsID0+ICh7XHJcbiAgICAgICAgICAgICAgICAgICAgLi4uZWwsXHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogdW5kZWZpbmVkIC8vIFJlbW92ZSBET00gcmVmZXJlbmNlIGZvciBzZXJpYWxpemF0aW9uXHJcbiAgICAgICAgICAgICAgICB9KSksXHJcbiAgICAgICAgICAgICAgICBhY3RpdmVGb3JtOiBhY3RpdmVGb3JtXHJcbiAgICAgICAgICAgIH0sICcqJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9TVEFSVF9QSUNLRVInKSB7XHJcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdGFydEVsZW1lbnRQaWNrZXIoKGVsZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgICAgIC8vIEFkZCBmb3JtIG5hbWUgdG8gcGlja2VkIGVsZW1lbnRcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gaW5zcGVjdG9yLmdldEVsZW1lbnRGb3JtTmFtZShkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2VsZW1lbnQuY29udHJvbE5hbWV9XCJdYCkpO1xyXG4gICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9FTEVNRU5UX1BJQ0tFRCcsXHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogeyAuLi5lbGVtZW50LCBmb3JtTmFtZSB9XHJcbiAgICAgICAgICAgICAgICB9LCAnKicpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUT1BfUElDS0VSJykge1xyXG4gICAgICAgICAgICBpbnNwZWN0b3Iuc3RvcEVsZW1lbnRQaWNrZXIoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X0VYRUNVVEVfV09SS0ZMT1cnKSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGVXb3JrZmxvdyhldmVudC5kYXRhLndvcmtmbG93LCBldmVudC5kYXRhLmRhdGEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfTkFWX0JVVFRPTlNfVVBEQVRFJykge1xyXG4gICAgICAgICAgICB1cGRhdGVOYXZCdXR0b25zKGV2ZW50LmRhdGEucGF5bG9hZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEV4ZWN1dGlvbiBjb250cm9sc1xyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1BBVVNFX1dPUktGTE9XJykge1xyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfUkVTVU1FX1dPUktGTE9XJykge1xyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUT1BfV09SS0ZMT1cnKSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGxldCBwZW5kaW5nTmF2QnV0dG9uc1BheWxvYWQgPSBudWxsO1xuICAgIGxldCBuYXZCdXR0b25zUmV0cnlUaW1lciA9IG51bGw7XG4gICAgbGV0IG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyID0gbnVsbDtcblxyXG4gICAgZnVuY3Rpb24gdXBkYXRlTmF2QnV0dG9ucyhwYXlsb2FkKSB7XHJcbiAgICAgICAgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gcGF5bG9hZCB8fCBudWxsO1xyXG4gICAgICAgIHJlbmRlck5hdkJ1dHRvbnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW5kZXJOYXZCdXR0b25zKCkge1xuICAgICAgICBjb25zdCBwYXlsb2FkID0gcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkO1xuICAgICAgICBpZiAoIXBheWxvYWQpIHJldHVybjtcblxyXG4gICAgICAgIGNvbnN0IG5hdkdyb3VwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25hdmlnYXRpb25NYWluQWN0aW9uR3JvdXAnKTtcclxuICAgICAgICBpZiAoIW5hdkdyb3VwKSB7XHJcbiAgICAgICAgICAgIGlmICghbmF2QnV0dG9uc1JldHJ5VGltZXIpIHtcclxuICAgICAgICAgICAgICAgIG5hdkJ1dHRvbnNSZXRyeVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlbmRlck5hdkJ1dHRvbnMoKTtcclxuICAgICAgICAgICAgICAgIH0sIDEwMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2QzNjUtbmF2LWJ1dHRvbnMtY29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGV4aXN0aW5nQ29udGFpbmVyLnJlbW92ZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IEFycmF5LmlzQXJyYXkocGF5bG9hZC5idXR0b25zKSA/IHBheWxvYWQuYnV0dG9ucyA6IFtdO1xyXG4gICAgICAgIGlmICghYnV0dG9ucy5sZW5ndGgpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudE1lbnVJdGVtID0gKHBheWxvYWQubWVudUl0ZW0gfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHZpc2libGVCdXR0b25zID0gYnV0dG9ucy5maWx0ZXIoKGJ1dHRvbikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBtZW51SXRlbXMgPSBBcnJheS5pc0FycmF5KGJ1dHRvbi5tZW51SXRlbXMpID8gYnV0dG9uLm1lbnVJdGVtcyA6IFtdO1xyXG4gICAgICAgICAgICBpZiAoIW1lbnVJdGVtcy5sZW5ndGgpIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICBpZiAoIWN1cnJlbnRNZW51SXRlbSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gbWVudUl0ZW1zLnNvbWUoKGl0ZW0pID0+IChpdGVtIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSBjdXJyZW50TWVudUl0ZW0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoIXZpc2libGVCdXR0b25zLmxlbmd0aCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgY29udGFpbmVyLmlkID0gJ2QzNjUtbmF2LWJ1dHRvbnMtY29udGFpbmVyJztcbiAgICAgICAgY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICAgIGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnNnB4JztcbiAgICAgICAgY29udGFpbmVyLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcbiAgICAgICAgY29udGFpbmVyLnN0eWxlLm1hcmdpblJpZ2h0ID0gJzZweCc7XG5cbiAgICAgICAgY29uc3QgcnVuQnV0dG9uV29ya2Zsb3cgPSBhc3luYyAoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB3b3JrZmxvdyA9IGJ1dHRvbkNvbmZpZy53b3JrZmxvdztcbiAgICAgICAgICAgIGlmICghd29ya2Zsb3cpIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBXb3JrZmxvdyBub3QgZm91bmQgZm9yIG5hdiBidXR0b246ICR7YnV0dG9uQ29uZmlnLm5hbWUgfHwgYnV0dG9uQ29uZmlnLmlkfWApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB3b3JrZmxvdy5kYXRhU291cmNlcz8ucHJpbWFyeT8uZGF0YSB8fCB3b3JrZmxvdy5kYXRhU291cmNlPy5kYXRhIHx8IFtdO1xuICAgICAgICAgICAgZXhlY3V0ZVdvcmtmbG93KHdvcmtmbG93LCBkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjcmVhdGVTdHlsZWRCdXR0b24gPSAobGFiZWwsIHRpdGxlID0gJycpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbkVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICBidXR0b25FbC50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgICAgICBidXR0b25FbC5jbGFzc05hbWUgPSAnbmF2aWdhdGlvbkJhci1zZWFyY2gnO1xuICAgICAgICAgICAgYnV0dG9uRWwudGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnRpdGxlID0gdGl0bGU7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5oZWlnaHQgPSAnMjRweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5wYWRkaW5nID0gJzAgOHB4JztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc0cHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMzUpJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmJhY2tncm91bmQgPSAncmdiYSgyNTUsMjU1LDI1NSwwLjEyKSc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5jb2xvciA9ICcjZmZmZmZmJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmZvbnRTaXplID0gJzEycHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZm9udFdlaWdodCA9ICc2MDAnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUubGluZUhlaWdodCA9ICcyMnB4JztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLndoaXRlU3BhY2UgPSAnbm93cmFwJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnY2VudGVyJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmJveFNoYWRvdyA9ICdpbnNldCAwIDAgMCAxcHggcmdiYSgyNTUsMjU1LDI1NSwwLjA4KSc7XG4gICAgICAgICAgICByZXR1cm4gYnV0dG9uRWw7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgY2xvc2VBbGxHcm91cE1lbnVzID0gKCkgPT4ge1xuICAgICAgICAgICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWQzNjUtbmF2LWdyb3VwLW1lbnVdJykuZm9yRWFjaCgobWVudSkgPT4ge1xuICAgICAgICAgICAgICAgIG1lbnUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHN0YW5kYWxvbmVCdXR0b25zID0gW107XG4gICAgICAgIGNvbnN0IGdyb3VwZWRCdXR0b25zID0gbmV3IE1hcCgpO1xuXG4gICAgICAgIHZpc2libGVCdXR0b25zLmZvckVhY2goKGJ1dHRvbkNvbmZpZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBOYW1lID0gKGJ1dHRvbkNvbmZpZy5ncm91cCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgaWYgKCFncm91cE5hbWUpIHtcbiAgICAgICAgICAgICAgICBzdGFuZGFsb25lQnV0dG9ucy5wdXNoKGJ1dHRvbkNvbmZpZyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFncm91cGVkQnV0dG9ucy5oYXMoZ3JvdXBOYW1lKSkge1xuICAgICAgICAgICAgICAgIGdyb3VwZWRCdXR0b25zLnNldChncm91cE5hbWUsIFtdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdyb3VwZWRCdXR0b25zLmdldChncm91cE5hbWUpLnB1c2goYnV0dG9uQ29uZmlnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc3RhbmRhbG9uZUJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBidXR0b25XcmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBidXR0b25XcmFwcGVyLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLWNvbXBhbnkgbmF2aWdhdGlvbkJhci1waW5uZWRFbGVtZW50JztcblxuICAgICAgICAgICAgY29uc3QgYnV0dG9uRWwgPSBjcmVhdGVTdHlsZWRCdXR0b24oYnV0dG9uQ29uZmlnLm5hbWUgfHwgYnV0dG9uQ29uZmlnLndvcmtmbG93TmFtZSB8fCAnV29ya2Zsb3cnLCBidXR0b25Db25maWcubmFtZSB8fCAnJyk7XG4gICAgICAgICAgICBidXR0b25FbC5zZXRBdHRyaWJ1dGUoJ2RhdGEtZDM2NS1uYXYtYnV0dG9uLWlkJywgYnV0dG9uQ29uZmlnLmlkIHx8ICcnKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gcnVuQnV0dG9uV29ya2Zsb3coYnV0dG9uQ29uZmlnKSk7XG5cbiAgICAgICAgICAgIGJ1dHRvbldyYXBwZXIuYXBwZW5kQ2hpbGQoYnV0dG9uRWwpO1xuICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGJ1dHRvbldyYXBwZXIpO1xuICAgICAgICB9KTtcblxuICAgICAgICBBcnJheS5mcm9tKGdyb3VwZWRCdXR0b25zLmVudHJpZXMoKSlcbiAgICAgICAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKVxuICAgICAgICAgICAgLmZvckVhY2goKFtncm91cE5hbWUsIGdyb3VwSXRlbXNdKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBXcmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBXcmFwcGVyLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLWNvbXBhbnkgbmF2aWdhdGlvbkJhci1waW5uZWRFbGVtZW50JztcbiAgICAgICAgICAgICAgICBncm91cFdyYXBwZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBCdXR0b24gPSBjcmVhdGVTdHlsZWRCdXR0b24oYCR7Z3JvdXBOYW1lfSBcXHUyNUJFYCwgZ3JvdXBOYW1lKTtcbiAgICAgICAgICAgICAgICBncm91cEJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtZDM2NS1uYXYtZ3JvdXAnLCBncm91cE5hbWUpO1xuICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnN0eWxlLmJvcmRlckNvbG9yID0gJ3JnYmEoMjU1LDI1NSwyNTUsMC41NSknO1xuICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSAncmdiYSgyNTUsMjU1LDI1NSwwLjIpJztcblxuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwTWVudSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zZXRBdHRyaWJ1dGUoJ2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudScsIGdyb3VwTmFtZSk7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUudG9wID0gJzI4cHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5sZWZ0ID0gJzAnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5taW5XaWR0aCA9ICcyMzBweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLm1heFdpZHRoID0gJzMyMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUubWF4SGVpZ2h0ID0gJzMyMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUub3ZlcmZsb3dZID0gJ2F1dG8nO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5iYWNrZ3JvdW5kID0gJyNmY2ZkZmYnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHJnYmEoMzAsNDEsNTksMC4xNiknO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnMTBweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJveFNoYWRvdyA9ICcwIDE0cHggMjhweCByZ2JhKDAsMCwwLDAuMjgpJztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUucGFkZGluZyA9ICc4cHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS56SW5kZXggPSAnMjE0NzQ4MzAwMCc7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnRleHRDb250ZW50ID0gZ3JvdXBOYW1lO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmZvbnRTaXplID0gJzExcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmZvbnRXZWlnaHQgPSAnNzAwJztcbiAgICAgICAgICAgICAgICBncm91cEhlYWRlci5zdHlsZS5jb2xvciA9ICcjNDc1NTY5JztcbiAgICAgICAgICAgICAgICBncm91cEhlYWRlci5zdHlsZS5tYXJnaW4gPSAnMCAycHggNnB4IDJweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUucGFkZGluZ0JvdHRvbSA9ICc2cHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmJvcmRlckJvdHRvbSA9ICcxcHggc29saWQgI2UyZThmMCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LmFwcGVuZENoaWxkKGdyb3VwSGVhZGVyKTtcblxuICAgICAgICAgICAgICAgIGdyb3VwSXRlbXNcbiAgICAgICAgICAgICAgICAgICAgLnNsaWNlKClcbiAgICAgICAgICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IChhLm5hbWUgfHwgJycpLmxvY2FsZUNvbXBhcmUoYi5uYW1lIHx8ICcnKSlcbiAgICAgICAgICAgICAgICAgICAgLmZvckVhY2goKGJ1dHRvbkNvbmZpZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXRlbUJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnRleHRDb250ZW50ID0gYnV0dG9uQ29uZmlnLm5hbWUgfHwgYnV0dG9uQ29uZmlnLndvcmtmbG93TmFtZSB8fCAnV29ya2Zsb3cnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi50aXRsZSA9IGJ1dHRvbkNvbmZpZy5uYW1lIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLnRleHRBbGlnbiA9ICdsZWZ0JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYm9yZGVyID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuY29sb3IgPSAnIzFmMjkzNyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc0cHgnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5wYWRkaW5nID0gJzhweCA5cHgnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5mb250U2l6ZSA9ICcxMnB4JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuZm9udFdlaWdodCA9ICc2MDAnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5saW5lSGVpZ2h0ID0gJzEuMyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLm1hcmdpbkJvdHRvbSA9ICczcHgnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLnRyYW5zaXRpb24gPSAnYmFja2dyb3VuZCAuMTVzIGVhc2UsIGNvbG9yIC4xNXMgZWFzZSc7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSAnI2U4ZWRmZic7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jb2xvciA9ICcjMWUzYThhJztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICd0cmFuc3BhcmVudCc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jb2xvciA9ICcjMWYyOTM3JztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xvc2VBbGxHcm91cE1lbnVzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcnVuQnV0dG9uV29ya2Zsb3coYnV0dG9uQ29uZmlnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBncm91cE1lbnUuYXBwZW5kQ2hpbGQoaXRlbUJ1dHRvbik7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzT3BlbiA9IGdyb3VwTWVudS5zdHlsZS5kaXNwbGF5ID09PSAnYmxvY2snO1xuICAgICAgICAgICAgICAgICAgICBjbG9zZUFsbEdyb3VwTWVudXMoKTtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPSBpc09wZW4gPyAnbm9uZScgOiAnYmxvY2snO1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kID0gaXNPcGVuID8gJ3JnYmEoMjU1LDI1NSwyNTUsMC4yKScgOiAncmdiYSgyNTUsMjU1LDI1NSwwLjMyKSc7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBncm91cFdyYXBwZXIuYXBwZW5kQ2hpbGQoZ3JvdXBCdXR0b24pO1xuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5hcHBlbmRDaGlsZChncm91cE1lbnUpO1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChncm91cFdyYXBwZXIpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgbmF2R3JvdXAuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgbmF2R3JvdXAuZmlyc3RDaGlsZCk7XG5cbiAgICAgICAgaWYgKG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyKSB7XG4gICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycsIG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyLCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBuYXZCdXR0b25zT3V0c2lkZUNsaWNrSGFuZGxlciA9IChldmVudCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2QzNjUtbmF2LWJ1dHRvbnMtY29udGFpbmVyJyk7XG4gICAgICAgICAgICBpZiAoIWFjdGl2ZSB8fCBhY3RpdmUuY29udGFpbnMoZXZlbnQudGFyZ2V0KSkgcmV0dXJuO1xuICAgICAgICAgICAgYWN0aXZlLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWQzNjUtbmF2LWdyb3VwLW1lbnVdJykuZm9yRWFjaCgobWVudSkgPT4ge1xuICAgICAgICAgICAgICAgIG1lbnUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyLCB0cnVlKTtcbiAgICB9XG5cclxuICAgIC8vIEhlbHBlciB0byBjaGVjayBhbmQgd2FpdCBmb3IgcGF1c2Uvc3RvcFxyXG4gICAgYXN5bmMgZnVuY3Rpb24gY2hlY2tFeGVjdXRpb25Db250cm9sKCkge1xyXG4gICAgaWYgKGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdXb3JrZmxvdyBzdG9wcGVkIGJ5IHVzZXInKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgd2hpbGUgKGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQpIHtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgIGlmIChleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dvcmtmbG93IHN0b3BwZWQgYnkgdXNlcicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVdvcmtmbG93KHdvcmtmbG93LCBkYXRhKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIC8vIENsZWFyIGFueSBzdGFsZSBwZW5kaW5nIG5hdmlnYXRpb24gc3RhdGUgYmVmb3JlIHN0YXJ0aW5nIGEgbmV3IHJ1blxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHNlc3Npb25TdG9yYWdlLnJlbW92ZUl0ZW0oJ2QzNjVfcGVuZGluZ193b3JrZmxvdycpO1xyXG4gICAgICAgICAgICBpZiAod29ya2Zsb3c/LmlkKSB7XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdkMzY1X2FjdGl2ZV93b3JrZmxvd19pZCcsIHdvcmtmbG93LmlkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgLy8gSWdub3JlIHNlc3Npb25TdG9yYWdlIGVycm9ycyAoZS5nLiwgaW4gcmVzdHJpY3RlZCBjb250ZXh0cylcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgU3RhcnRpbmcgd29ya2Zsb3c6ICR7d29ya2Zsb3c/Lm5hbWUgfHwgd29ya2Zsb3c/LmlkIHx8ICd1bm5hbWVkJ31gKTtcclxuICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiB7IHBoYXNlOiAnd29ya2Zsb3dTdGFydCcsIHdvcmtmbG93OiB3b3JrZmxvdz8ubmFtZSB8fCB3b3JrZmxvdz8uaWQgfSB9LCAnKicpO1xyXG4gICAgICAgIC8vIFJlc2V0IGV4ZWN1dGlvbiBjb250cm9sXHJcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IGZhbHNlO1xyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkID0gZmFsc2U7XHJcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5ydW5PcHRpb25zID0gd29ya2Zsb3cucnVuT3B0aW9ucyB8fCB7IHNraXBSb3dzOiAwLCBsaW1pdFJvd3M6IDAsIGRyeVJ1bjogZmFsc2UgfTtcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLnN0ZXBJbmRleE9mZnNldCA9IHdvcmtmbG93Py5fb3JpZ2luYWxTdGFydEluZGV4IHx8IDA7XHJcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4ID0gZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQ7XHJcbiAgICAgICAgY3VycmVudFdvcmtmbG93ID0gd29ya2Zsb3c7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWx3YXlzIHJlZnJlc2ggb3JpZ2luYWwtd29ya2Zsb3cgcG9pbnRlciB0byBhdm9pZCBzdGFsZSByZXN1bWUgc3RhdGVcbiAgICAgICAgLy8gZnJvbSBhIHByZXZpb3VzbHkgZXhlY3V0ZWQgd29ya2Zsb3cgaW4gdGhlIHNhbWUgcGFnZSBjb250ZXh0LlxuICAgICAgICB3aW5kb3cuZDM2NU9yaWdpbmFsV29ya2Zsb3cgPSB3b3JrZmxvdz8uX29yaWdpbmFsV29ya2Zsb3cgfHwgd29ya2Zsb3c7XG4gICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gd29ya2Zsb3c/LnNldHRpbmdzIHx8IHt9O1xyXG4gICAgICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncztcclxuICAgICAgICAvLyBFeHBvc2UgY3VycmVudCB3b3JrZmxvdyBhbmQgZXhlY3V0aW9uIGNvbnRyb2wgdG8gaW5qZWN0ZWQgYWN0aW9uIG1vZHVsZXNcclxuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyA9IGN1cnJlbnRXb3JrZmxvdztcclxuICAgICAgICB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2wgPSBleGVjdXRpb25Db250cm9sO1xyXG4gICAgICAgIGNvbnN0IHN0ZXBzID0gd29ya2Zsb3cuc3RlcHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gR2V0IGRhdGEgZnJvbSBuZXcgZGF0YVNvdXJjZXMgc3RydWN0dXJlIG9yIGxlZ2FjeSBkYXRhU291cmNlXHJcbiAgICAgICAgbGV0IHByaW1hcnlEYXRhID0gW107XHJcbiAgICAgICAgbGV0IGRldGFpbFNvdXJjZXMgPSB7fTtcclxuICAgICAgICBsZXQgcmVsYXRpb25zaGlwcyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh3b3JrZmxvdy5kYXRhU291cmNlcykge1xyXG4gICAgICAgICAgICBwcmltYXJ5RGF0YSA9IHdvcmtmbG93LmRhdGFTb3VyY2VzLnByaW1hcnk/LmRhdGEgfHwgW107XHJcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcHMgPSB3b3JrZmxvdy5kYXRhU291cmNlcy5yZWxhdGlvbnNoaXBzIHx8IFtdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gSW5kZXggZGV0YWlsIGRhdGEgc291cmNlcyBieSBJRFxyXG4gICAgICAgICAgICAod29ya2Zsb3cuZGF0YVNvdXJjZXMuZGV0YWlscyB8fCBbXSkuZm9yRWFjaChkZXRhaWwgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGRldGFpbC5kYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsU291cmNlc1tkZXRhaWwuaWRdID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBkZXRhaWwuZGF0YSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZGV0YWlsLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkczogZGV0YWlsLmZpZWxkc1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZGF0YSkge1xyXG4gICAgICAgICAgICAvLyBMZWdhY3kgZm9ybWF0XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gQXJyYXkuaXNBcnJheShkYXRhKSA/IGRhdGEgOiBbZGF0YV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElmIG5vIGRhdGEsIHVzZSBhIHNpbmdsZSBlbXB0eSByb3cgdG8gcnVuIHN0ZXBzIG9uY2VcclxuICAgICAgICBpZiAocHJpbWFyeURhdGEubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gW3t9XTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEV4ZWN1dGUgd29ya2Zsb3cgd2l0aCBsb29wIHN1cHBvcnRcclxuICAgICAgICBhd2FpdCBleGVjdXRlU3RlcHNXaXRoTG9vcHMoc3RlcHMsIHByaW1hcnlEYXRhLCBkZXRhaWxTb3VyY2VzLCByZWxhdGlvbnNoaXBzLCB3b3JrZmxvdy5zZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgV29ya2Zsb3cgY29tcGxldGU6IHByb2Nlc3NlZCAke3ByaW1hcnlEYXRhLmxlbmd0aH0gcm93c2ApO1xyXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0NPTVBMRVRFJyxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IHByb2Nlc3NlZDogcHJpbWFyeURhdGEubGVuZ3RoIH1cclxuICAgICAgICB9LCAnKicpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAvLyBOYXZpZ2F0aW9uIGludGVycnVwdHMgYXJlIG5vdCBlcnJvcnMgLSB0aGUgd29ya2Zsb3cgd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkXHJcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmlzTmF2aWdhdGlvbkludGVycnVwdCkge1xyXG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgJ1dvcmtmbG93IHBhdXNlZCBmb3IgbmF2aWdhdGlvbiAtIHdpbGwgcmVzdW1lIGFmdGVyIHBhZ2UgbG9hZHMnKTtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBEb24ndCByZXBvcnQgYXMgZXJyb3Igb3IgY29tcGxldGVcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFlcnJvciB8fCAhZXJyb3IuX3JlcG9ydGVkKSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFdvcmtmbG93IGVycm9yOiAke2Vycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19FUlJPUicsXHJcbiAgICAgICAgICAgICAgICBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycm9yKSxcclxuICAgICAgICAgICAgICAgIHN0YWNrOiBlcnJvcj8uc3RhY2tcclxuICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVTdGVwVmFsdWUoc3RlcCwgY3VycmVudFJvdykge1xuICAgIGNvbnN0IHNvdXJjZSA9IHN0ZXA/LnZhbHVlU291cmNlIHx8IChzdGVwPy5maWVsZE1hcHBpbmcgPyAnZGF0YScgOiAnc3RhdGljJyk7XHJcblxyXG4gICAgaWYgKHNvdXJjZSA9PT0gJ2NsaXBib2FyZCcpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpZiAoIW5hdmlnYXRvci5jbGlwYm9hcmQ/LnJlYWRUZXh0KSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaXBib2FyZCBBUEkgbm90IGF2YWlsYWJsZScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLnJlYWRUZXh0KCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0ZXh0ID8/ICcnO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYENsaXBib2FyZCByZWFkIGZhaWxlZDogJHtlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpfWApO1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaXBib2FyZCByZWFkIGZhaWxlZCcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoc291cmNlID09PSAnZGF0YScpIHtcclxuICAgICAgICBjb25zdCByb3cgPSBjdXJyZW50Um93IHx8IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwge307XHJcbiAgICAgICAgY29uc3QgZmllbGQgPSBzdGVwPy5maWVsZE1hcHBpbmcgfHwgJyc7XHJcbiAgICAgICAgaWYgKCFmaWVsZCkgcmV0dXJuICcnO1xyXG4gICAgICAgIGNvbnN0IHZhbHVlID0gcm93W2ZpZWxkXTtcclxuICAgICAgICByZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbHVlKTtcclxuICAgIH1cclxuXG4gICAgcmV0dXJuIHN0ZXA/LnZhbHVlID8/ICcnO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Um93VmFsdWUoZmllbGRNYXBwaW5nLCBjdXJyZW50Um93KSB7XG4gICAgaWYgKCFjdXJyZW50Um93IHx8ICFmaWVsZE1hcHBpbmcpIHJldHVybiAnJztcbiAgICBsZXQgdmFsdWUgPSBjdXJyZW50Um93W2ZpZWxkTWFwcGluZ107XG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgJiYgZmllbGRNYXBwaW5nLmluY2x1ZGVzKCc6JykpIHtcbiAgICAgICAgY29uc3QgZmllbGROYW1lID0gZmllbGRNYXBwaW5nLnNwbGl0KCc6JykucG9wKCk7XG4gICAgICAgIHZhbHVlID0gY3VycmVudFJvd1tmaWVsZE5hbWVdO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCkge1xuICAgIGlmICghZWxlbWVudCkgcmV0dXJuICcnO1xuICAgIGNvbnN0IGFyaWEgPSBlbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdhcmlhLWxhYmVsJyk7XG4gICAgaWYgKGFyaWEpIHJldHVybiBhcmlhLnRyaW0oKTtcbiAgICBjb25zdCB0ZXh0ID0gZWxlbWVudC50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgIHJldHVybiB0ZXh0IHx8ICcnO1xufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50VmFsdWVGb3JDb25kaXRpb24oZWxlbWVudCkge1xuICAgIGlmICghZWxlbWVudCkgcmV0dXJuICcnO1xuICAgIGlmICgndmFsdWUnIGluIGVsZW1lbnQgJiYgZWxlbWVudC52YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBTdHJpbmcoZWxlbWVudC52YWx1ZSA/PyAnJyk7XG4gICAgfVxuICAgIHJldHVybiBnZXRFbGVtZW50VGV4dEZvckNvbmRpdGlvbihlbGVtZW50KTtcbn1cblxuZnVuY3Rpb24gZXZhbHVhdGVDb25kaXRpb24oc3RlcCwgY3VycmVudFJvdykge1xuICAgIGNvbnN0IHR5cGUgPSBzdGVwPy5jb25kaXRpb25UeXBlIHx8ICd1aS12aXNpYmxlJztcblxuICAgIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ3VpLScpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gc3RlcD8uY29uZGl0aW9uQ29udHJvbE5hbWUgfHwgc3RlcD8uY29udHJvbE5hbWUgfHwgJyc7XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBjb250cm9sTmFtZSA/IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKSA6IG51bGw7XG5cbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICBjYXNlICd1aS12aXNpYmxlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gISFlbGVtZW50ICYmIGlzRWxlbWVudFZpc2libGUoZWxlbWVudCk7XG4gICAgICAgICAgICBjYXNlICd1aS1oaWRkZW4nOlxuICAgICAgICAgICAgICAgIHJldHVybiAhZWxlbWVudCB8fCAhaXNFbGVtZW50VmlzaWJsZShlbGVtZW50KTtcbiAgICAgICAgICAgIGNhc2UgJ3VpLWV4aXN0cyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuICEhZWxlbWVudDtcbiAgICAgICAgICAgIGNhc2UgJ3VpLW5vdC1leGlzdHMnOlxuICAgICAgICAgICAgICAgIHJldHVybiAhZWxlbWVudDtcbiAgICAgICAgICAgIGNhc2UgJ3VpLXRleHQtZXF1YWxzJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dChzdGVwPy5jb25kaXRpb25WYWx1ZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCA9PT0gZXhwZWN0ZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlICd1aS10ZXh0LWNvbnRhaW5zJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dChzdGVwPy5jb25kaXRpb25WYWx1ZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbC5pbmNsdWRlcyhleHBlY3RlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlICd1aS12YWx1ZS1lcXVhbHMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChnZXRFbGVtZW50VmFsdWVGb3JDb25kaXRpb24oZWxlbWVudCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dChzdGVwPy5jb25kaXRpb25WYWx1ZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCA9PT0gZXhwZWN0ZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlICd1aS12YWx1ZS1jb250YWlucyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRWYWx1ZUZvckNvbmRpdGlvbihlbGVtZW50KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsLmluY2x1ZGVzKGV4cGVjdGVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGUuc3RhcnRzV2l0aCgnZGF0YS0nKSkge1xuICAgICAgICBjb25zdCBmaWVsZE1hcHBpbmcgPSBzdGVwPy5jb25kaXRpb25GaWVsZE1hcHBpbmcgfHwgJyc7XG4gICAgICAgIGNvbnN0IGFjdHVhbFJhdyA9IGV4dHJhY3RSb3dWYWx1ZShmaWVsZE1hcHBpbmcsIGN1cnJlbnRSb3cpO1xuICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGFjdHVhbFJhdyk7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dChzdGVwPy5jb25kaXRpb25WYWx1ZSB8fCAnJyk7XG5cbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICBjYXNlICdkYXRhLWVxdWFscyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCA9PT0gZXhwZWN0ZWQ7XG4gICAgICAgICAgICBjYXNlICdkYXRhLW5vdC1lcXVhbHMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgIT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1jb250YWlucyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbC5pbmNsdWRlcyhleHBlY3RlZCk7XG4gICAgICAgICAgICBjYXNlICdkYXRhLWVtcHR5JzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsID09PSAnJztcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtbm90LWVtcHR5JzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsICE9PSAnJztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vLyBFeGVjdXRlIGEgc2luZ2xlIHN0ZXAgKG1hcHMgc3RlcC50eXBlIHRvIGFjdGlvbiBmdW5jdGlvbnMpXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlU2luZ2xlU3RlcChzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnRSb3csIGRldGFpbFNvdXJjZXMsIHNldHRpbmdzLCBkcnlSdW4pIHtcbiAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnRTdGVwSW5kZXggPSB0eXBlb2Ygc3RlcC5fYWJzb2x1dGVJbmRleCA9PT0gJ251bWJlcidcclxuICAgICAgICA/IHN0ZXAuX2Fic29sdXRlSW5kZXhcclxuICAgICAgICA6IChleGVjdXRpb25Db250cm9sLnN0ZXBJbmRleE9mZnNldCB8fCAwKSArIHN0ZXBJbmRleDtcclxuICAgIGNvbnN0IHN0ZXBMYWJlbCA9IHN0ZXAuZGlzcGxheVRleHQgfHwgc3RlcC5jb250cm9sTmFtZSB8fCBzdGVwLnR5cGUgfHwgYHN0ZXAgJHtzdGVwSW5kZXh9YDtcclxuICAgIC8vIENvbXB1dGUgYWJzb2x1dGUgc3RlcCBpbmRleCAoYWxyZWFkeSBzdG9yZWQgb24gZXhlY3V0aW9uQ29udHJvbClcclxuICAgIGNvbnN0IGFic29sdXRlU3RlcEluZGV4ID0gZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4O1xyXG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXHJcbiAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwU3RhcnQnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cclxuICAgIH0sICcqJyk7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIC8vIE5vcm1hbGl6ZSBzdGVwIHR5cGUgKGFsbG93IGJvdGggY2FtZWxDYXNlIGFuZCBkYXNoLXNlcGFyYXRlZCB0eXBlcylcclxuICAgICAgICBjb25zdCBzdGVwVHlwZSA9IChzdGVwLnR5cGUgfHwgJycpLnJlcGxhY2UoLy0oW2Etel0pL2csIChfLCBjKSA9PiBjLnRvVXBwZXJDYXNlKCkpO1xyXG4gICAgICAgIGxvZ1N0ZXAoYFN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9OiAke3N0ZXBUeXBlfSAtPiAke3N0ZXBMYWJlbH1gKTtcclxuXHJcbiAgICAgICAgLy8gUmVzcGVjdCBkcnkgcnVuIG1vZGVcclxuICAgICAgICBpZiAoZHJ5UnVuKSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgRHJ5IHJ1biAtIHNraXBwaW5nIGFjdGlvbjogJHtzdGVwLnR5cGV9ICR7c3RlcC5jb250cm9sTmFtZSB8fCAnJ31gKTtcclxuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcclxuICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cclxuICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHJlc29sdmVkVmFsdWUgPSBudWxsO1xyXG4gICAgICAgIGlmIChbJ2lucHV0JywgJ3NlbGVjdCcsICdsb29rdXBTZWxlY3QnLCAnZ3JpZElucHV0JywgJ2ZpbHRlcicsICdxdWVyeUZpbHRlciddLmluY2x1ZGVzKHN0ZXBUeXBlKSkge1xyXG4gICAgICAgICAgICByZXNvbHZlZFZhbHVlID0gYXdhaXQgcmVzb2x2ZVN0ZXBWYWx1ZShzdGVwLCBjdXJyZW50Um93KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHdhaXRUYXJnZXQgPSBzdGVwLndhaXRUYXJnZXRDb250cm9sTmFtZSB8fCBzdGVwLmNvbnRyb2xOYW1lIHx8ICcnO1xyXG4gICAgICAgIGNvbnN0IHNob3VsZFdhaXRCZWZvcmUgPSAhIXN0ZXAud2FpdFVudGlsVmlzaWJsZTtcclxuICAgICAgICBjb25zdCBzaG91bGRXYWl0QWZ0ZXIgPSAhIXN0ZXAud2FpdFVudGlsSGlkZGVuO1xyXG5cclxuICAgICAgICBpZiAoKHNob3VsZFdhaXRCZWZvcmUgfHwgc2hvdWxkV2FpdEFmdGVyKSAmJiAhd2FpdFRhcmdldCkge1xyXG4gICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFdhaXQgb3B0aW9uIHNldCBidXQgbm8gY29udHJvbCBuYW1lIG9uIHN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc2hvdWxkV2FpdEJlZm9yZSAmJiB3YWl0VGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbih3YWl0VGFyZ2V0LCAndmlzaWJsZScsIG51bGwsIDUwMDApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoIChzdGVwVHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlICdjbGljayc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjbGlja0VsZW1lbnQoc3RlcC5jb250cm9sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2lucHV0JzpcclxuICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWVsZFR5cGUpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdsb29rdXBTZWxlY3QnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0TG9va3VwU2VsZWN0VmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2NoZWNrYm94JzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNldENoZWNrYm94VmFsdWUoc3RlcC5jb250cm9sTmFtZSwgY29lcmNlQm9vbGVhbihzdGVwLnZhbHVlKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2dyaWRJbnB1dCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRHcmlkQ2VsbFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIHJlc29sdmVkVmFsdWUsIHN0ZXAuZmllbGRUeXBlLCAhIXN0ZXAud2FpdEZvclZhbGlkYXRpb24pO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdmaWx0ZXInOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgYXBwbHlHcmlkRmlsdGVyKHN0ZXAuY29udHJvbE5hbWUsIHJlc29sdmVkVmFsdWUsIHN0ZXAuZmlsdGVyTWV0aG9kIHx8ICdpcyBleGFjdGx5Jyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAncXVlcnlGaWx0ZXInOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgY29uZmlndXJlUXVlcnlGaWx0ZXIoc3RlcC50YWJsZU5hbWUsIHN0ZXAuZmllbGROYW1lLCByZXNvbHZlZFZhbHVlLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2F2ZWRRdWVyeTogc3RlcC5zYXZlZFF1ZXJ5LFxyXG4gICAgICAgICAgICAgICAgICAgIGNsb3NlRGlhbG9nQWZ0ZXI6IHN0ZXAuY2xvc2VEaWFsb2dBZnRlclxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ3dhaXQnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoTnVtYmVyKHN0ZXAuZHVyYXRpb24pIHx8IDUwMCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ3dhaXRVbnRpbCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCB3YWl0VW50aWxDb25kaXRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgc3RlcC5jb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICBzdGVwLndhaXRDb25kaXRpb24gfHwgJ3Zpc2libGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAud2FpdFZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAudGltZW91dCB8fCAxMDAwMFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnbmF2aWdhdGUnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgbmF2aWdhdGVUb0Zvcm0oc3RlcCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2FjdGl2YXRlVGFiJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBhY3RpdmF0ZVRhYihzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3RhYk5hdmlnYXRlJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBhY3RpdmF0ZVRhYihzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2FjdGlvblBhbmVUYWInOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFjdGl2YXRlQWN0aW9uUGFuZVRhYihzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxyXG4gICAgICAgICAgICBjYXNlICdleHBhbmRTZWN0aW9uJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKHN0ZXAuY29udHJvbE5hbWUsICdleHBhbmQnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnY29sbGFwc2VTZWN0aW9uJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKHN0ZXAuY29udHJvbE5hbWUsICdjb2xsYXBzZScpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdjbG9zZURpYWxvZyc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjbG9zZURpYWxvZygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBzdGVwIHR5cGU6ICR7c3RlcC50eXBlfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHNob3VsZFdhaXRBZnRlciAmJiB3YWl0VGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbih3YWl0VGFyZ2V0LCAnaGlkZGVuJywgbnVsbCwgNTAwMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXHJcbiAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cclxuICAgICAgICB9LCAnKicpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgLy8gUmUtdGhyb3cgbmF2aWdhdGlvbiBpbnRlcnJ1cHRzIGZvciB1cHN0cmVhbSBoYW5kbGluZ1xyXG4gICAgICAgIGlmIChlcnIgJiYgZXJyLmlzTmF2aWdhdGlvbkludGVycnVwdCkgdGhyb3cgZXJyO1xyXG4gICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYEVycm9yIGV4ZWN1dGluZyBzdGVwICR7YWJzb2x1dGVTdGVwSW5kZXggKyAxfTogJHtlcnI/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycil9YCk7XHJcbiAgICAgICAgdGhyb3cgZXJyO1xyXG4gICAgfVxyXG59XHJcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTdGVwc1dpdGhMb29wcyhzdGVwcywgcHJpbWFyeURhdGEsIGRldGFpbFNvdXJjZXMsIHJlbGF0aW9uc2hpcHMsIHNldHRpbmdzKSB7XHJcbiAgICAvLyBBcHBseSBza2lwL2xpbWl0IHJvd3MgZnJvbSBydW4gb3B0aW9uc1xyXG4gICAgY29uc3QgeyBza2lwUm93cyA9IDAsIGxpbWl0Um93cyA9IDAsIGRyeVJ1biA9IGZhbHNlIH0gPSBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnM7XHJcbiAgICBcclxuICAgIGNvbnN0IG9yaWdpbmFsVG90YWxSb3dzID0gcHJpbWFyeURhdGEubGVuZ3RoO1xyXG4gICAgbGV0IHN0YXJ0Um93TnVtYmVyID0gMDsgLy8gVGhlIHN0YXJ0aW5nIHJvdyBudW1iZXIgZm9yIGRpc3BsYXlcclxuICAgIFxyXG4gICAgaWYgKHNraXBSb3dzID4gMCkge1xyXG4gICAgICAgIHByaW1hcnlEYXRhID0gcHJpbWFyeURhdGEuc2xpY2Uoc2tpcFJvd3MpO1xyXG4gICAgICAgIHN0YXJ0Um93TnVtYmVyID0gc2tpcFJvd3M7XHJcbiAgICAgICAgc2VuZExvZygnaW5mbycsIGBTa2lwcGVkIGZpcnN0ICR7c2tpcFJvd3N9IHJvd3NgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGxpbWl0Um93cyA+IDAgJiYgcHJpbWFyeURhdGEubGVuZ3RoID4gbGltaXRSb3dzKSB7XHJcbiAgICAgICAgcHJpbWFyeURhdGEgPSBwcmltYXJ5RGF0YS5zbGljZSgwLCBsaW1pdFJvd3MpO1xyXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgTGltaXRlZCB0byAke2xpbWl0Um93c30gcm93c2ApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCB0b3RhbFJvd3NUb1Byb2Nlc3MgPSBwcmltYXJ5RGF0YS5sZW5ndGg7XG4gICAgZXhlY3V0aW9uQ29udHJvbC50b3RhbFJvd3MgPSBvcmlnaW5hbFRvdGFsUm93cztcbiAgICBcbiAgICAvLyBGaW5kIGxvb3Agc3RydWN0dXJlc1xuICAgIGNvbnN0IGxvb3BQYWlycyA9IGZpbmRMb29wUGFpcnMoc3RlcHMsIChtZXNzYWdlKSA9PiBzZW5kTG9nKCdlcnJvcicsIG1lc3NhZ2UpKTtcbiAgICBjb25zdCBpZlBhaXJzID0gZmluZElmUGFpcnMoc3RlcHMsIChtZXNzYWdlKSA9PiBzZW5kTG9nKCdlcnJvcicsIG1lc3NhZ2UpKTtcbiAgICBjb25zdCBsYWJlbE1hcCA9IG5ldyBNYXAoKTtcbiAgICBzdGVwcy5mb3JFYWNoKChzdGVwLCBpbmRleCkgPT4ge1xuICAgICAgICBpZiAoc3RlcD8udHlwZSA9PT0gJ2xhYmVsJyAmJiBzdGVwLmxhYmVsTmFtZSkge1xuICAgICAgICAgICAgbGFiZWxNYXAuc2V0KHN0ZXAubGFiZWxOYW1lLCBpbmRleCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIElmIG5vIGxvb3BzLCBleGVjdXRlIGFsbCBzdGVwcyBmb3IgZWFjaCBwcmltYXJ5IGRhdGEgcm93IChsZWdhY3kgYmVoYXZpb3IpXG4gICAgaWYgKGxvb3BQYWlycy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgZm9yIChsZXQgcm93SW5kZXggPSAwOyByb3dJbmRleCA8IHByaW1hcnlEYXRhLmxlbmd0aDsgcm93SW5kZXgrKykge1xuICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXG5cbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IHByaW1hcnlEYXRhW3Jvd0luZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlSb3dOdW1iZXIgPSBzdGFydFJvd051bWJlciArIHJvd0luZGV4OyAvLyBBY3R1YWwgcm93IG51bWJlciBpbiBvcmlnaW5hbCBkYXRhXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnRSb3dJbmRleCA9IGRpc3BsYXlSb3dOdW1iZXI7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnREYXRhUm93ID0gcm93O1xuXG4gICAgICAgICAgICBjb25zdCByb3dQcm9ncmVzcyA9IHtcbiAgICAgICAgICAgICAgICBwaGFzZTogJ3Jvd1N0YXJ0JyxcbiAgICAgICAgICAgICAgICByb3c6IGRpc3BsYXlSb3dOdW1iZXIsXG4gICAgICAgICAgICAgICAgdG90YWxSb3dzOiBvcmlnaW5hbFRvdGFsUm93cyxcbiAgICAgICAgICAgICAgICBwcm9jZXNzZWRSb3dzOiByb3dJbmRleCArIDEsXG4gICAgICAgICAgICAgICAgdG90YWxUb1Byb2Nlc3M6IHRvdGFsUm93c1RvUHJvY2VzcyxcbiAgICAgICAgICAgICAgICBzdGVwOiAnUHJvY2Vzc2luZyByb3cnXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBQcm9jZXNzaW5nIHJvdyAke2Rpc3BsYXlSb3dOdW1iZXIgKyAxfS8ke29yaWdpbmFsVG90YWxSb3dzfWApO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogcm93UHJvZ3Jlc3MgfSwgJyonKTtcblxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKDAsIHN0ZXBzLmxlbmd0aCwgcm93KTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xvb3AgY29udHJvbCBzaWduYWwgdXNlZCBvdXRzaWRlIG9mIGEgbG9vcCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cclxuICAgIGNvbnN0IGxvb3BQYWlyTWFwID0gbmV3IE1hcChsb29wUGFpcnMubWFwKHBhaXIgPT4gW3BhaXIuc3RhcnRJbmRleCwgcGFpci5lbmRJbmRleF0pKTtcclxuICAgIGNvbnN0IGluaXRpYWxEYXRhUm93ID0gcHJpbWFyeURhdGFbMF0gfHwge307XHJcblxyXG4gICAgY29uc3QgcmVzb2x2ZUxvb3BEYXRhID0gKGxvb3BEYXRhU291cmNlLCBjdXJyZW50RGF0YVJvdykgPT4ge1xuICAgICAgICBsZXQgbG9vcERhdGEgPSBwcmltYXJ5RGF0YTtcblxuICAgICAgICBpZiAobG9vcERhdGFTb3VyY2UgIT09ICdwcmltYXJ5JyAmJiBkZXRhaWxTb3VyY2VzW2xvb3BEYXRhU291cmNlXSkge1xuICAgICAgICAgICAgY29uc3QgZGV0YWlsU291cmNlID0gZGV0YWlsU291cmNlc1tsb29wRGF0YVNvdXJjZV07XG4gICAgICAgICAgICBjb25zdCByZWxhdGlvbnNGb3JEZXRhaWwgPSAocmVsYXRpb25zaGlwcyB8fCBbXSkuZmlsdGVyKHIgPT4gci5kZXRhaWxJZCA9PT0gbG9vcERhdGFTb3VyY2UpO1xuICAgICAgICAgICAgaWYgKCFyZWxhdGlvbnNGb3JEZXRhaWwubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9vcERhdGE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGxvb3BTdGFjayA9IEFycmF5LmlzQXJyYXkoY3VycmVudERhdGFSb3c/Ll9fZDM2NV9sb29wX3N0YWNrKVxuICAgICAgICAgICAgICAgID8gY3VycmVudERhdGFSb3cuX19kMzY1X2xvb3Bfc3RhY2tcbiAgICAgICAgICAgICAgICA6IFtdO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50TG9vcFNvdXJjZUlkID0gbG9vcFN0YWNrLmxlbmd0aCA/IGxvb3BTdGFja1tsb29wU3RhY2subGVuZ3RoIC0gMV0gOiAnJztcbiAgICAgICAgICAgIGlmICghcGFyZW50TG9vcFNvdXJjZUlkKSB7XG4gICAgICAgICAgICAgICAgLy8gVG9wLWxldmVsIGxvb3A6IGRvIG5vdCBhcHBseSByZWxhdGlvbnNoaXAgZmlsdGVyaW5nLlxuICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gZGV0YWlsU291cmNlLmRhdGE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwYXJlbnRTY29wZWRSZWxhdGlvbnMgPSByZWxhdGlvbnNGb3JEZXRhaWwuZmlsdGVyKHJlbCA9PiAocmVsLnBhcmVudFNvdXJjZUlkIHx8ICcnKSA9PT0gcGFyZW50TG9vcFNvdXJjZUlkKTtcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZVJlbGF0aW9ucyA9IHBhcmVudFNjb3BlZFJlbGF0aW9ucy5sZW5ndGggPyBwYXJlbnRTY29wZWRSZWxhdGlvbnMgOiByZWxhdGlvbnNGb3JEZXRhaWw7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVQYXJlbnRWYWx1ZSA9IChyZWwsIHBhaXIpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBsaWNpdEtleSA9IHJlbD8ucGFyZW50U291cmNlSWQgPyBgJHtyZWwucGFyZW50U291cmNlSWR9OiR7cGFpci5wcmltYXJ5RmllbGR9YCA6ICcnO1xuICAgICAgICAgICAgICAgIGlmIChleHBsaWNpdEtleSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBsaWNpdFZhbHVlID0gY3VycmVudERhdGFSb3c/LltleHBsaWNpdEtleV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChleHBsaWNpdFZhbHVlICE9PSB1bmRlZmluZWQgJiYgZXhwbGljaXRWYWx1ZSAhPT0gbnVsbCAmJiBTdHJpbmcoZXhwbGljaXRWYWx1ZSkgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXhwbGljaXRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBmYWxsYmFja1ZhbHVlID0gY3VycmVudERhdGFSb3c/LltwYWlyLnByaW1hcnlGaWVsZF07XG4gICAgICAgICAgICAgICAgaWYgKGZhbGxiYWNrVmFsdWUgIT09IHVuZGVmaW5lZCAmJiBmYWxsYmFja1ZhbHVlICE9PSBudWxsICYmIFN0cmluZyhmYWxsYmFja1ZhbHVlKSAhPT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbGxiYWNrVmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZFJlbGF0aW9uID0gY2FuZGlkYXRlUmVsYXRpb25zLmZpbmQoKHJlbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZ3MgPSBBcnJheS5pc0FycmF5KHJlbD8uZmllbGRNYXBwaW5ncykgJiYgcmVsLmZpZWxkTWFwcGluZ3MubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgID8gcmVsLmZpZWxkTWFwcGluZ3NcbiAgICAgICAgICAgICAgICAgICAgOiAocmVsPy5wcmltYXJ5RmllbGQgJiYgcmVsPy5kZXRhaWxGaWVsZFxuICAgICAgICAgICAgICAgICAgICAgICAgPyBbeyBwcmltYXJ5RmllbGQ6IHJlbC5wcmltYXJ5RmllbGQsIGRldGFpbEZpZWxkOiByZWwuZGV0YWlsRmllbGQgfV1cbiAgICAgICAgICAgICAgICAgICAgOiBbXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmaWVsZE1hcHBpbmdzLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybiBmaWVsZE1hcHBpbmdzLmV2ZXJ5KChwYWlyKSA9PiByZXNvbHZlUGFyZW50VmFsdWUocmVsLCBwYWlyKSAhPT0gdW5kZWZpbmVkKTtcbiAgICAgICAgICAgIH0pIHx8IG51bGw7XG5cbiAgICAgICAgICAgIGlmICghc2VsZWN0ZWRSZWxhdGlvbikge1xuICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgUmVsYXRpb25zaGlwIGZpbHRlciBmb3IgJHtsb29wRGF0YVNvdXJjZX0gY291bGQgbm90IHJlc29sdmUgcGFyZW50IHZhbHVlcy4gTG9vcCB3aWxsIHByb2Nlc3MgMCByb3dzLmApO1xuICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gW107XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZE1hcHBpbmdzID0gQXJyYXkuaXNBcnJheShzZWxlY3RlZFJlbGF0aW9uLmZpZWxkTWFwcGluZ3MpICYmIHNlbGVjdGVkUmVsYXRpb24uZmllbGRNYXBwaW5ncy5sZW5ndGhcbiAgICAgICAgICAgICAgICA/IHNlbGVjdGVkUmVsYXRpb24uZmllbGRNYXBwaW5nc1xuICAgICAgICAgICAgICAgIDogW3sgcHJpbWFyeUZpZWxkOiBzZWxlY3RlZFJlbGF0aW9uLnByaW1hcnlGaWVsZCwgZGV0YWlsRmllbGQ6IHNlbGVjdGVkUmVsYXRpb24uZGV0YWlsRmllbGQgfV07XG5cbiAgICAgICAgICAgIGxvb3BEYXRhID0gZGV0YWlsU291cmNlLmRhdGEuZmlsdGVyKChkZXRhaWxSb3cpID0+IHNlbGVjdGVkTWFwcGluZ3MuZXZlcnkoKHBhaXIpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRWYWx1ZSA9IHJlc29sdmVQYXJlbnRWYWx1ZShzZWxlY3RlZFJlbGF0aW9uLCBwYWlyKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZFZhbHVlID0gZGV0YWlsUm93Py5bcGFpci5kZXRhaWxGaWVsZF07XG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudFZhbHVlID09PSB1bmRlZmluZWQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoY2hpbGRWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IGNoaWxkVmFsdWUgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gU3RyaW5nKGNoaWxkVmFsdWUpID09PSBTdHJpbmcocGFyZW50VmFsdWUpO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xuICAgIH07XG5cbiAgICBhc3luYyBmdW5jdGlvbiBleGVjdXRlU3RlcFdpdGhIYW5kbGluZyhzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnREYXRhUm93KSB7XG4gICAgICAgIGNvbnN0IHsgbW9kZSwgcmV0cnlDb3VudCwgcmV0cnlEZWxheSwgZ290b0xhYmVsIH0gPSBnZXRTdGVwRXJyb3JDb25maWcoc3RlcCwgc2V0dGluZ3MpO1xuICAgICAgICBsZXQgYXR0ZW1wdCA9IDA7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZXhlY3V0ZVNpbmdsZVN0ZXAoc3RlcCwgc3RlcEluZGV4LCBjdXJyZW50RGF0YVJvdywgZGV0YWlsU291cmNlcywgc2V0dGluZ3MsIGRyeVJ1bik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgJiYgZXJyLmlzTmF2aWdhdGlvbkludGVycnVwdCkgdGhyb3cgZXJyO1xuXG4gICAgICAgICAgICAgICAgaWYgKHJldHJ5Q291bnQgPiAwICYmIGF0dGVtcHQgPCByZXRyeUNvdW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dGVtcHQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBSZXRyeWluZyBzdGVwICR7c3RlcEluZGV4ICsgMX0gKCR7YXR0ZW1wdH0vJHtyZXRyeUNvdW50fSkgYWZ0ZXIgZXJyb3I6ICR7ZXJyPy5tZXNzYWdlIHx8IFN0cmluZyhlcnIpfWApO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmV0cnlEZWxheSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKHJldHJ5RGVsYXkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHN3aXRjaCAobW9kZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdza2lwJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ3NraXAnIH07XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2dvdG8nOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnZ290bycsIGxhYmVsOiBnb3RvTGFiZWwgfTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnYnJlYWstbG9vcCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdicmVhay1sb29wJyB9O1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdjb250aW51ZS1sb29wJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2NvbnRpbnVlLWxvb3AnIH07XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2ZhaWwnOlxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVSYW5nZShzdGFydElkeCwgZW5kSWR4LCBjdXJyZW50RGF0YVJvdykge1xuICAgICAgICBpZiAoY3VycmVudERhdGFSb3cpIHtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudERhdGFSb3cgPSBjdXJyZW50RGF0YVJvdztcbiAgICAgICAgfVxuICAgICAgICBsZXQgaWR4ID0gc3RhcnRJZHg7XHJcblxyXG4gICAgICAgIHdoaWxlIChpZHggPCBlbmRJZHgpIHtcbiAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxuXG4gICAgICAgICAgICBjb25zdCBzdGVwID0gc3RlcHNbaWR4XTtcblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2xhYmVsJykge1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnZ290bycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRJbmRleCA9IGxhYmVsTWFwLmdldChzdGVwLmdvdG9MYWJlbCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldEluZGV4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHb3RvIGxhYmVsIG5vdCBmb3VuZDogJHtzdGVwLmdvdG9MYWJlbCB8fCAnJ31gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldEluZGV4IDwgc3RhcnRJZHggfHwgdGFyZ2V0SW5kZXggPj0gZW5kSWR4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2dvdG8nLCB0YXJnZXRJbmRleCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZHggPSB0YXJnZXRJbmRleDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2lmLXN0YXJ0Jykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbmRpdGlvbk1ldCA9IGV2YWx1YXRlQ29uZGl0aW9uKHN0ZXAsIGN1cnJlbnREYXRhUm93KTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRJbmRleCA9IGlmUGFpcnMuaWZUb0VuZC5nZXQoaWR4KTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbHNlSW5kZXggPSBpZlBhaXJzLmlmVG9FbHNlLmdldChpZHgpO1xuICAgICAgICAgICAgICAgIGlmIChlbmRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSWYtc3RhcnQgYXQgaW5kZXggJHtpZHh9IGhhcyBubyBtYXRjaGluZyBpZi1lbmRgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9uTWV0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZWxzZUluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZWxzZUluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZHggPSBlbmRJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnZWxzZScpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRJbmRleCA9IGlmUGFpcnMuZWxzZVRvRW5kLmdldChpZHgpO1xuICAgICAgICAgICAgICAgIGlmIChlbmRJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGVuZEluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdpZi1lbmQnKSB7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdjb250aW51ZS1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2NvbnRpbnVlLWxvb3AnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdicmVhay1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2JyZWFrLWxvb3AnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BFbmRJZHggPSBsb29wUGFpck1hcC5nZXQoaWR4KTtcbiAgICAgICAgICAgICAgICBpZiAobG9vcEVuZElkeCA9PT0gdW5kZWZpbmVkIHx8IGxvb3BFbmRJZHggPD0gaWR4KSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTG9vcCBzdGFydCBhdCBpbmRleCAke2lkeH0gaGFzIG5vIG1hdGNoaW5nIGVuZGApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BNb2RlID0gc3RlcC5sb29wTW9kZSB8fCAnZGF0YSc7XG5cbiAgICAgICAgICAgICAgICBpZiAobG9vcE1vZGUgPT09ICdjb3VudCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9vcENvdW50ID0gTnVtYmVyKHN0ZXAubG9vcENvdW50KSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYEVudGVyaW5nIGxvb3A6ICR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9IChjb3VudD0ke2xvb3BDb3VudH0pYCk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGl0ZXJJbmRleCA9IDA7IGl0ZXJJbmRleCA8IGxvb3BDb3VudDsgaXRlckluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdsb29wSXRlcmF0aW9uJywgaXRlcmF0aW9uOiBpdGVySW5kZXggKyAxLCB0b3RhbDogbG9vcENvdW50LCBzdGVwOiBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCI6IGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bG9vcENvdW50fWAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgJyonKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKGlkeCArIDEsIGxvb3BFbmRJZHgsIGN1cnJlbnREYXRhUm93KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnKSBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2dvdG8nKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gbG9vcEVuZElkeCArIDE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChsb29wTW9kZSA9PT0gJ3doaWxlJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXhJdGVyYXRpb25zID0gTnVtYmVyKHN0ZXAubG9vcE1heEl0ZXJhdGlvbnMpIHx8IDEwMDtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGl0ZXJJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChpdGVySW5kZXggPCBtYXhJdGVyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZXZhbHVhdGVDb25kaXRpb24oc3RlcCwgY3VycmVudERhdGFSb3cpKSBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdsb29wSXRlcmF0aW9uJywgaXRlcmF0aW9uOiBpdGVySW5kZXggKyAxLCB0b3RhbDogbWF4SXRlcmF0aW9ucywgc3RlcDogYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiOiBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke21heEl0ZXJhdGlvbnN9YCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAnKicpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgY3VycmVudERhdGFSb3cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVySW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2dvdG8nKSByZXR1cm4gcmVzdWx0O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVySW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpdGVySW5kZXggPj0gbWF4SXRlcmF0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBMb29wIFwiJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31cIiBoaXQgbWF4IGl0ZXJhdGlvbnMgKCR7bWF4SXRlcmF0aW9uc30pYCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZHggPSBsb29wRW5kSWR4ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgbG9vcERhdGFTb3VyY2UgPSBzdGVwLmxvb3BEYXRhU291cmNlIHx8ICdwcmltYXJ5JztcbiAgICAgICAgICAgICAgICBsZXQgbG9vcERhdGEgPSByZXNvbHZlTG9vcERhdGEobG9vcERhdGFTb3VyY2UsIGN1cnJlbnREYXRhUm93KTtcblxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IGl0ZXJhdGlvbiBsaW1pdFxuICAgICAgICAgICAgICAgIGNvbnN0IGl0ZXJhdGlvbkxpbWl0ID0gc3RlcC5pdGVyYXRpb25MaW1pdCB8fCAwO1xuICAgICAgICAgICAgICAgIGlmIChpdGVyYXRpb25MaW1pdCA+IDAgJiYgbG9vcERhdGEubGVuZ3RoID4gaXRlcmF0aW9uTGltaXQpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9vcERhdGEgPSBsb29wRGF0YS5zbGljZSgwLCBpdGVyYXRpb25MaW1pdCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBFbnRlcmluZyBsb29wOiAke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfSAoc291cmNlPSR7bG9vcERhdGFTb3VyY2V9KSAtICR7bG9vcERhdGEubGVuZ3RofSBpdGVyYXRpb25zYCk7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaXRlckluZGV4ID0gMDsgaXRlckluZGV4IDwgbG9vcERhdGEubGVuZ3RoOyBpdGVySW5kZXgrKykge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTsgLy8gQ2hlY2sgZm9yIHBhdXNlL3N0b3BcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVyU291cmNlUm93ID0gbG9vcERhdGFbaXRlckluZGV4XSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXRlclJvdyA9IHsgLi4uY3VycmVudERhdGFSb3csIC4uLml0ZXJTb3VyY2VSb3cgfTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyZW50U3RhY2sgPSBBcnJheS5pc0FycmF5KGN1cnJlbnREYXRhUm93Py5fX2QzNjVfbG9vcF9zdGFjaylcbiAgICAgICAgICAgICAgICAgICAgICAgID8gY3VycmVudERhdGFSb3cuX19kMzY1X2xvb3Bfc3RhY2tcbiAgICAgICAgICAgICAgICAgICAgICAgIDogW107XG4gICAgICAgICAgICAgICAgICAgIGl0ZXJSb3cuX19kMzY1X2xvb3Bfc3RhY2sgPSBbLi4ucGFyZW50U3RhY2ssIGxvb3BEYXRhU291cmNlXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxvb3BEYXRhU291cmNlICE9PSAncHJpbWFyeScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIE9iamVjdC5lbnRyaWVzKGl0ZXJTb3VyY2VSb3cpLmZvckVhY2goKFtmaWVsZCwgdmFsdWVdKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlclJvd1tgJHtsb29wRGF0YVNvdXJjZX06JHtmaWVsZH1gXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNQcmltYXJ5TG9vcCA9IGxvb3BEYXRhU291cmNlID09PSAncHJpbWFyeSc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRvdGFsUm93c0Zvckxvb3AgPSBpc1ByaW1hcnlMb29wID8gb3JpZ2luYWxUb3RhbFJvd3MgOiBsb29wRGF0YS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRvdGFsVG9Qcm9jZXNzRm9yTG9vcCA9IGxvb3BEYXRhLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheVJvd051bWJlciA9IGlzUHJpbWFyeUxvb3AgPyBzdGFydFJvd051bWJlciArIGl0ZXJJbmRleCA6IGl0ZXJJbmRleDtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsb29wUm93UHJvZ3Jlc3MgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaGFzZTogJ3Jvd1N0YXJ0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvdzogZGlzcGxheVJvd051bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsUm93czogdG90YWxSb3dzRm9yTG9vcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFJvd3M6IGl0ZXJJbmRleCArIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICB0b3RhbFRvUHJvY2VzczogdG90YWxUb1Byb2Nlc3NGb3JMb29wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RlcDogJ1Byb2Nlc3Npbmcgcm93J1xuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYExvb3AgaXRlcmF0aW9uICR7aXRlckluZGV4ICsgMX0vJHtsb29wRGF0YS5sZW5ndGh9IGZvciBsb29wICR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9YCk7XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IGxvb3BSb3dQcm9ncmVzcyB9LCAnKicpO1xuXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdsb29wSXRlcmF0aW9uJywgaXRlcmF0aW9uOiBpdGVySW5kZXggKyAxLCB0b3RhbDogbG9vcERhdGEubGVuZ3RoLCBzdGVwOiBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCI6IGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bG9vcERhdGEubGVuZ3RofWAgfSB9LCAnKicpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEV4ZWN1dGUgc3RlcHMgaW5zaWRlIHRoZSBsb29wIChzdXBwb3J0cyBuZXN0ZWQgbG9vcHMpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVSYW5nZShpZHggKyAxLCBsb29wRW5kSWR4LCBpdGVyUm93KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJykgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2dvdG8nKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlkeCA9IGxvb3BFbmRJZHggKyAxO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnbG9vcC1lbmQnKSB7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVTdGVwV2l0aEhhbmRsaW5nKHN0ZXAsIGlkeCwgY3VycmVudERhdGFSb3cpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnc2tpcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdub25lJykge1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRJbmRleCA9IGxhYmVsTWFwLmdldChyZXN1bHQubGFiZWwpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgR290byBsYWJlbCBub3QgZm91bmQ6ICR7cmVzdWx0LmxhYmVsIHx8ICcnfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPCBzdGFydElkeCB8fCB0YXJnZXRJbmRleCA+PSBlbmRJZHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnZ290bycsIHRhcmdldEluZGV4IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlkeCA9IHRhcmdldEluZGV4O1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZHgrKztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgIH1cblxyXG4gICAgY29uc3QgZmluYWxSZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoMCwgc3RlcHMubGVuZ3RoLCBpbml0aWFsRGF0YVJvdyk7XG4gICAgaWYgKGZpbmFsUmVzdWx0Py5zaWduYWwgPT09ICdicmVhay1sb29wJyB8fCBmaW5hbFJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29wIGNvbnRyb2wgc2lnbmFsIHVzZWQgb3V0c2lkZSBvZiBhIGxvb3AnKTtcbiAgICB9XG59XG5cbiAgICByZXR1cm4geyBzdGFydGVkOiB0cnVlIH07XG59XG5cbmlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgc3RhcnRJbmplY3RlZCh7IHdpbmRvd09iajogd2luZG93LCBkb2N1bWVudE9iajogZG9jdW1lbnQgfSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUVBLE1BQXFCLGdCQUFyQixNQUFtQztBQUFBLElBQy9CLGNBQWM7QUFDVixXQUFLLGVBQWU7QUFDcEIsV0FBSyxtQkFBbUI7QUFDeEIsV0FBSyxVQUFVO0FBQUEsSUFDbkI7QUFBQTtBQUFBLElBR0EsbUJBQW1CLFNBQVM7QUFFeEIsWUFBTSxnQkFBZ0IsUUFBUSxRQUFRLHNCQUFzQjtBQUM1RCxVQUFJLGVBQWU7QUFDZixlQUFPLGNBQWMsYUFBYSxvQkFBb0I7QUFBQSxNQUMxRDtBQUdBLFlBQU0sY0FBYyxRQUFRLFFBQVEsd0JBQXdCO0FBQzVELFVBQUksYUFBYTtBQUNiLGVBQU8sWUFBWSxhQUFhLHNCQUFzQixLQUFLLFlBQVksYUFBYSxvQkFBb0I7QUFBQSxNQUM1RztBQUdBLFlBQU0sWUFBWSxRQUFRLFFBQVEsNkRBQTZEO0FBQy9GLFVBQUksV0FBVztBQUNYLGNBQU0sZ0JBQWdCLFVBQVUsYUFBYSxzQkFBc0I7QUFDbkUsWUFBSTtBQUFlLGlCQUFPO0FBQUEsTUFDOUI7QUFHQSxZQUFNLFNBQVMsUUFBUSxRQUFRLDZEQUE2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QUFPO0FBQUEsVUFDWDtBQUNBO0FBQUEsUUFDSjtBQUNBLGVBQU8sRUFBRSxRQUFRLE9BQU87QUFBQSxNQUM1QjtBQUVBLFlBQU0sY0FBYyxNQUFNLGFBQWEsR0FBRyxNQUFNLFFBQVEsY0FBYztBQUN0RSxVQUFJLGFBQWEsV0FBVyxnQkFBZ0IsYUFBYSxXQUFXLGlCQUFpQjtBQUNqRixjQUFNLElBQUksTUFBTSw0Q0FBNEM7QUFBQSxNQUNoRTtBQUFBLElBQ0o7QUFFSSxXQUFPLEVBQUUsU0FBUyxLQUFLO0FBQUEsRUFDM0I7QUFFQSxNQUFJLE9BQU8sV0FBVyxlQUFlLE9BQU8sYUFBYSxhQUFhO0FBQ2xFLGtCQUFjLEVBQUUsV0FBVyxRQUFRLGFBQWEsU0FBUyxDQUFDO0FBQUEsRUFDOUQ7IiwKICAibmFtZXMiOiBbImhhc0xvb2t1cEJ1dHRvbiIsICJ0b3AiLCAiY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZCIsICJmaWx0ZXJJbnB1dCIsICJmaWx0ZXJGaWVsZENvbnRhaW5lciIsICJyb3ciLCAib3B0aW9ucyIsICJ3aW5kb3ciLCAiZG9jdW1lbnQiLCAibmF2aWdhdG9yIiwgInJlc3VsdCJdCn0K
