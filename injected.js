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
  async function navigateToForm(step) {
    const { navigateMethod, menuItemName, menuItemType, navigateUrl, waitForLoad } = step;
    logStep(`Navigating to form: ${menuItemName || navigateUrl}`);
    let targetUrl;
    const baseUrl = window.location.origin + window.location.pathname;
    if (navigateMethod === "url" && navigateUrl) {
      targetUrl = navigateUrl.startsWith("http") ? navigateUrl : baseUrl + navigateUrl;
    } else if (menuItemName) {
      const params = new URLSearchParams(window.location.search);
      params.delete("q");
      const typePrefix = menuItemType && menuItemType !== "Display" ? `${menuItemType}:` : "";
      params.set("mi", `${typePrefix}${menuItemName}`);
      targetUrl = baseUrl + "?" + params.toString();
    } else {
      throw new Error("Navigate step requires either menuItemName or navigateUrl");
    }
    logStep(`Navigating to: ${targetUrl}`);
    try {
      const url = new URL(targetUrl);
      const targetMenuItemName = url.searchParams.get("mi") || "";
      const pendingState = {
        workflow: window.d365CurrentWorkflow || null,
        workflowId: window.d365CurrentWorkflow?.id || "",
        nextStepIndex: (window.d365ExecutionControl?.currentStepIndex ?? 0) + 1,
        currentRowIndex: window.d365ExecutionControl?.currentRowIndex || 0,
        totalRows: window.d365ExecutionControl?.totalRows || 0,
        data: window.d365ExecutionControl?.currentDataRow || null,
        targetMenuItemName,
        waitForLoad: waitForLoad || 3e3,
        savedAt: Date.now()
      };
      sessionStorage.setItem("d365_pending_workflow", JSON.stringify(pendingState));
      logStep("Saved workflow state for navigation");
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
  window.D365Inspector = D365Inspector;
  if (window.d365InjectedScriptLoaded) {
    console.log("D365 injected script already loaded, skipping...");
  } else {
    let updateNavButtons = function(payload) {
      pendingNavButtonsPayload = payload || null;
      renderNavButtons();
    }, renderNavButtons = function() {
      const payload = pendingNavButtonsPayload;
      if (!payload)
        return;
      const navGroup = document.getElementById("navigationMainActionGroup");
      if (!navGroup) {
        if (!navButtonsRetryTimer) {
          navButtonsRetryTimer = setTimeout(() => {
            navButtonsRetryTimer = null;
            renderNavButtons();
          }, 1e3);
        }
        return;
      }
      const existingContainer = document.getElementById("d365-nav-buttons-container");
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
      const container = document.createElement("div");
      container.id = "d365-nav-buttons-container";
      container.style.display = "flex";
      container.style.gap = "6px";
      container.style.alignItems = "center";
      container.style.marginRight = "6px";
      visibleButtons.forEach((buttonConfig) => {
        const buttonWrapper = document.createElement("div");
        buttonWrapper.className = "navigationBar-company navigationBar-pinnedElement";
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        buttonEl.className = "navigationBar-search";
        buttonEl.textContent = buttonConfig.name || buttonConfig.workflowName || "Workflow";
        buttonEl.title = buttonConfig.name || "";
        buttonEl.setAttribute("data-d365-nav-button-id", buttonConfig.id || "");
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
        buttonEl.addEventListener("click", async () => {
          const workflow = buttonConfig.workflow;
          if (!workflow) {
            sendLog("error", `Workflow not found for nav button: ${buttonConfig.name || buttonConfig.id}`);
            return;
          }
          const data = workflow.dataSources?.primary?.data || workflow.dataSource?.data || [];
          executeWorkflow(workflow, data);
        });
        buttonWrapper.appendChild(buttonEl);
        container.appendChild(buttonWrapper);
      });
      navGroup.insertBefore(container, navGroup.firstChild);
    };
    window.d365InjectedScriptLoaded = true;
    const inspector = new D365Inspector();
    let currentWorkflowSettings = {};
    window.d365CurrentWorkflowSettings = currentWorkflowSettings;
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
    window.addEventListener("message", (event) => {
      if (event.source !== window)
        return;
      if (event.data.type === "D365_DISCOVER_ELEMENTS") {
        const activeFormOnly = event.data.activeFormOnly || false;
        const elements = inspector.discoverElements(activeFormOnly);
        const activeForm = inspector.getActiveFormName();
        window.postMessage({
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
          const formName = inspector.getElementFormName(document.querySelector(`[data-dyn-controlname="${element.controlName}"]`));
          window.postMessage({
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
        window.postMessage({ type: "D365_WORKFLOW_PROGRESS", progress: { phase: "workflowStart", workflow: workflow?.name || workflow?.id } }, "*");
        executionControl.isPaused = false;
        executionControl.isStopped = false;
        executionControl.runOptions = workflow.runOptions || { skipRows: 0, limitRows: 0, dryRun: false };
        currentWorkflow = workflow;
        currentWorkflowSettings = workflow?.settings || {};
        window.d365CurrentWorkflowSettings = currentWorkflowSettings;
        window.d365CurrentWorkflow = currentWorkflow;
        window.d365ExecutionControl = executionControl;
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
        window.postMessage({
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
          window.postMessage({
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
          if (!navigator.clipboard?.readText) {
            throw new Error("Clipboard API not available");
          }
          const text = await navigator.clipboard.readText();
          return text ?? "";
        } catch (error) {
          sendLog("error", `Clipboard read failed: ${error?.message || String(error)}`);
          throw new Error("Clipboard read failed");
        }
      }
      if (source === "data") {
        const row = currentRow || window.d365ExecutionControl?.currentDataRow || {};
        const field = step?.fieldMapping || "";
        if (!field)
          return "";
        const value = row[field];
        return value === void 0 || value === null ? "" : String(value);
      }
      return step?.value ?? "";
    }
    async function executeSingleStep(step, stepIndex, currentRow, detailSources, settings, dryRun) {
      const stepLabel = step.displayText || step.controlName || step.type || `step ${stepIndex}`;
      window.postMessage({
        type: "D365_WORKFLOW_PROGRESS",
        progress: { phase: "stepStart", stepName: stepLabel, stepIndex }
      }, "*");
      try {
        const stepType = (step.type || "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        logStep(`Step ${stepIndex + 1}: ${stepType} -> ${stepLabel}`);
        if (dryRun) {
          sendLog("info", `Dry run - skipping action: ${step.type} ${step.controlName || ""}`);
          window.postMessage({
            type: "D365_WORKFLOW_PROGRESS",
            progress: { phase: "stepDone", stepName: stepLabel, stepIndex }
          }, "*");
          return;
        }
        let resolvedValue = null;
        if (["input", "select", "lookupSelect", "gridInput", "filter", "queryFilter"].includes(stepType)) {
          resolvedValue = await resolveStepValue(step, currentRow);
        }
        switch (stepType) {
          case "click":
            if (step.waitUntilVisible)
              await waitUntilCondition(step.controlName, "visible", null, 5e3);
            await clickElement(step.controlName);
            break;
          case "input":
          case "select":
            if (step.waitUntilVisible)
              await waitUntilCondition(step.controlName, "visible", null, 5e3);
            await setInputValue(step.controlName, resolvedValue, step.fieldType);
            break;
          case "lookupSelect":
            if (step.waitUntilVisible)
              await waitUntilCondition(step.controlName, "visible", null, 5e3);
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
        window.postMessage({
          type: "D365_WORKFLOW_PROGRESS",
          progress: { phase: "stepDone", stepName: stepLabel, stepIndex }
        }, "*");
      } catch (err) {
        if (err && err.isNavigationInterrupt)
          throw err;
        sendLog("error", `Error executing step ${stepIndex + 1}: ${err?.message || String(err)}`);
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
      const loopPairs = findLoopPairs(steps);
      function findLoopPairs(stepsList) {
        const stack = [];
        const pairs = [];
        for (let i = 0; i < stepsList.length; i++) {
          const s = stepsList[i];
          if (!s || !s.type)
            continue;
          if (s.type === "loop-start") {
            stack.push({ startIndex: i, id: s.id });
          } else if (s.type === "loop-end") {
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
                sendLog("error", `Unmatched loop-end at index ${i}`);
              }
            }
            if (matched)
              pairs.push(matched);
          }
        }
        if (stack.length) {
          for (const rem of stack) {
            sendLog("error", `Unclosed loop-start at index ${rem.startIndex}`);
          }
        }
        pairs.sort((a, b) => a.startIndex - b.startIndex);
        return pairs;
      }
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
          window.postMessage({ type: "D365_WORKFLOW_PROGRESS", progress: rowProgress }, "*");
          for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
            await checkExecutionControl();
            await executeSingleStep(steps[stepIndex], stepIndex, row, {}, settings, dryRun);
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
          const rel = relationships.find((r) => r.detailId === loopDataSource);
          if (rel && currentDataRow[rel.primaryField] !== void 0) {
            loopData = detailSource.data.filter(
              (d) => String(d[rel.detailField]) === String(currentDataRow[rel.primaryField])
            );
          } else {
            loopData = detailSource.data;
          }
        }
        return loopData;
      };
      const executeRange = async (startIdx, endIdx, currentDataRow) => {
        if (currentDataRow) {
          executionControl.currentDataRow = currentDataRow;
        }
        let idx = startIdx;
        while (idx < endIdx) {
          await checkExecutionControl();
          const step = steps[idx];
          if (step.type === "loop-start") {
            const loopEndIdx = loopPairMap.get(idx);
            if (loopEndIdx === void 0 || loopEndIdx <= idx) {
              throw new Error(`Loop start at index ${idx} has no matching end`);
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
              const iterRow = { ...currentDataRow, ...loopData[iterIndex] };
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
              window.postMessage({ type: "D365_WORKFLOW_PROGRESS", progress: loopRowProgress }, "*");
              window.postMessage({ type: "D365_WORKFLOW_PROGRESS", progress: { phase: "loopIteration", iteration: iterIndex + 1, total: loopData.length, step: `Loop "${step.loopName || "Loop"}": iteration ${iterIndex + 1}/${loopData.length}` } }, "*");
              await executeRange(idx + 1, loopEndIdx, iterRow);
            }
            idx = loopEndIdx + 1;
            continue;
          }
          if (step.type === "loop-end") {
            idx++;
            continue;
          }
          await executeSingleStep(step, idx, currentDataRow, detailSources, settings, executionControl.runOptions.dryRun);
          idx++;
        }
      };
      await executeRange(0, steps.length, initialDataRow);
    }
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luamVjdGVkL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb2dnaW5nLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9hc3luYy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvdGV4dC5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvZG9tLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb29rdXAuanMiLCAic3JjL2luamVjdGVkL3V0aWxzL2NvbWJvYm94LmpzIiwgInNyYy9pbmplY3RlZC9zdGVwcy9hY3Rpb25zLmpzIiwgInNyYy9pbmplY3RlZC9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gRDM2NUZPIEVsZW1lbnQgSW5zcGVjdG9yIGFuZCBEaXNjb3ZlcnkgTW9kdWxlXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEMzY1SW5zcGVjdG9yIHtcclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIHRoaXMuaXNJbnNwZWN0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gbnVsbDtcclxuICAgICAgICB0aGlzLm92ZXJsYXkgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCB0aGUgZm9ybSBuYW1lIHRoYXQgY29udGFpbnMgYW4gZWxlbWVudFxyXG4gICAgZ2V0RWxlbWVudEZvcm1OYW1lKGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBMb29rIGZvciB0aGUgY2xvc2VzdCBmb3JtIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IGZvcm1Db250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XHJcbiAgICAgICAgaWYgKGZvcm1Db250YWluZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZvcm1Db250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgZm9ybSB2aWEgZGF0YS1keW4tY29udHJvbG5hbWUgb24gYSBmb3JtLWxldmVsIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IGZvcm1FbGVtZW50ID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkZvcm1cIl0nKTtcclxuICAgICAgICBpZiAoZm9ybUVsZW1lbnQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZvcm1FbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCBmb3JtRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgZmluZGluZyB0aGUgd29ya3NwYWNlIG9yIHBhZ2UgY29udGFpbmVyXHJcbiAgICAgICAgY29uc3Qgd29ya3NwYWNlID0gZWxlbWVudC5jbG9zZXN0KCcud29ya3NwYWNlLWNvbnRlbnQsIC53b3Jrc3BhY2UsIFtkYXRhLWR5bi1yb2xlPVwiV29ya3NwYWNlXCJdJyk7XHJcbiAgICAgICAgaWYgKHdvcmtzcGFjZSkge1xyXG4gICAgICAgICAgICBjb25zdCB3b3Jrc3BhY2VOYW1lID0gd29ya3NwYWNlLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKHdvcmtzcGFjZU5hbWUpIHJldHVybiB3b3Jrc3BhY2VOYW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgZGlhbG9nL21vZGFsIGNvbnRleHRcclxuICAgICAgICBjb25zdCBkaWFsb2cgPSBlbGVtZW50LmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiRGlhbG9nXCJdLCAuZGlhbG9nLWNvbnRhaW5lciwgLm1vZGFsLWNvbnRlbnQnKTtcclxuICAgICAgICBpZiAoZGlhbG9nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpYWxvZ05hbWUgPSBkaWFsb2cuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk/LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dOYW1lKSByZXR1cm4gZGlhbG9nTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIHJvb3QgZm9ybSBieSB3YWxraW5nIHVwIHRoZSBET01cclxuICAgICAgICBsZXQgY3VycmVudCA9IGVsZW1lbnQ7XHJcbiAgICAgICAgd2hpbGUgKGN1cnJlbnQgJiYgY3VycmVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IGN1cnJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChjdXJyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnRm9ybScgPyBjdXJyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSA6IG51bGwpO1xyXG4gICAgICAgICAgICBpZiAoZm9ybU5hbWUpIHJldHVybiBmb3JtTmFtZTtcclxuICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQucGFyZW50RWxlbWVudDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuICdVbmtub3duJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgdGhlIGFjdGl2ZS9mb2N1c2VkIGZvcm0gbmFtZVxyXG4gICAgZ2V0QWN0aXZlRm9ybU5hbWUoKSB7XHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGFjdGl2ZSBkaWFsb2cgZmlyc3QgKGNoaWxkIGZvcm1zIGFyZSB0eXBpY2FsbHkgZGlhbG9ncylcclxuICAgICAgICBjb25zdCBhY3RpdmVEaWFsb2cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pLCAuZGlhbG9nLWNvbnRhaW5lcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZURpYWxvZykge1xyXG4gICAgICAgICAgICBjb25zdCBkaWFsb2dGb3JtID0gYWN0aXZlRGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dGb3JtKSByZXR1cm4gZGlhbG9nRm9ybS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICByZXR1cm4gYWN0aXZlRGlhbG9nLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGZvY3VzZWQgZWxlbWVudCBhbmQgZ2V0IGl0cyBmb3JtXHJcbiAgICAgICAgY29uc3QgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XHJcbiAgICAgICAgaWYgKGFjdGl2ZUVsZW1lbnQgJiYgYWN0aXZlRWxlbWVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGFjdGl2ZUVsZW1lbnQpO1xyXG4gICAgICAgICAgICBpZiAoZm9ybU5hbWUgJiYgZm9ybU5hbWUgIT09ICdVbmtub3duJykgcmV0dXJuIGZvcm1OYW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBMb29rIGZvciB0aGUgdG9wbW9zdC9hY3RpdmUgZm9ybSBzZWN0aW9uXHJcbiAgICAgICAgY29uc3QgdmlzaWJsZUZvcm1zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWZvcm0tbmFtZV0nKTtcclxuICAgICAgICBpZiAodmlzaWJsZUZvcm1zLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgLy8gUmV0dXJuIHRoZSBsYXN0IG9uZSAodHlwaWNhbGx5IHRoZSBtb3N0IHJlY2VudGx5IG9wZW5lZC90b3Btb3N0KVxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gdmlzaWJsZUZvcm1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pc0VsZW1lbnRWaXNpYmxlKHZpc2libGVGb3Jtc1tpXSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmlzaWJsZUZvcm1zW2ldLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzY292ZXIgYWxsIGludGVyYWN0aXZlIGVsZW1lbnRzIG9uIHRoZSBwYWdlXHJcbiAgICBkaXNjb3ZlckVsZW1lbnRzKGFjdGl2ZUZvcm1Pbmx5ID0gZmFsc2UpIHtcclxuICAgICAgICBjb25zdCBlbGVtZW50cyA9IFtdO1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUZvcm0gPSBhY3RpdmVGb3JtT25seSA/IHRoaXMuZ2V0QWN0aXZlRm9ybU5hbWUoKSA6IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbGwgYnV0dG9uc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0sIFtkYXRhLWR5bi1yb2xlPVwiTWVudUl0ZW1CdXR0b25cIl0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRoaXMuZ2V0RWxlbWVudFRleHQoZWwpO1xyXG4gICAgICAgICAgICBjb25zdCB2aXNpYmxlID0gdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2J1dHRvbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHZpc2libGUsXHJcbiAgICAgICAgICAgICAgICBhcmlhTGFiZWw6IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIGFsbCBpbnB1dCBmaWVsZHMgKGV4cGFuZGVkIHRvIGNhdGNoIG1vcmUgZmllbGQgdHlwZXMpXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJJbnB1dFwiXSwgW2RhdGEtZHluLXJvbGU9XCJNdWx0aWxpbmVJbnB1dFwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSwgW2RhdGEtZHluLXJvbGU9XCJSZWZlcmVuY2VHcm91cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiU2VnbWVudGVkRW50cnlcIl0sIGlucHV0W2RhdGEtZHluLWNvbnRyb2xuYW1lXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgLy8gR2V0IGNvbnRyb2wgbmFtZSBmcm9tIGVsZW1lbnQgb3IgcGFyZW50XHJcbiAgICAgICAgICAgIGxldCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgbGV0IHRhcmdldEVsZW1lbnQgPSBlbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCBmb3VuZCwgY2hlY2sgcGFyZW50IGVsZW1lbnQgKGNvbW1vbiBmb3IgU2VnbWVudGVkRW50cnkgZmllbGRzIGxpa2UgQWNjb3VudClcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lID0gcGFyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRFbGVtZW50ID0gcGFyZW50O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIGlmIGFscmVhZHkgYWRkZWQgKGF2b2lkIGR1cGxpY2F0ZXMpXHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldEVsZW1lbnRMYWJlbCh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgY29uc3QgZmllbGRJbmZvID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdpbnB1dCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUodGFyZ2V0RWxlbWVudCksXHJcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkSW5mbyxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogdGFyZ2V0RWxlbWVudFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbGwgY2hlY2tib3hlcy90b2dnbGVzXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJDaGVja0JveFwiXSwgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBsZXQgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGxldCB0YXJnZXRFbGVtZW50ID0gZWw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBDaGVjayBwYXJlbnQgaWYgbm90IGZvdW5kXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSA9IHBhcmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0RWxlbWVudCA9IHBhcmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZSh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFbGVtZW50TGFiZWwodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrYm94ID0gdGFyZ2V0RWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fCB0YXJnZXRFbGVtZW50O1xyXG4gICAgICAgICAgICBjb25zdCBpc0NoZWNrZWQgPSBjaGVja2JveC5jaGVja2VkIHx8IGNoZWNrYm94LmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2NoZWNrYm94JyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBsYWJlbCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZSh0YXJnZXRFbGVtZW50KSxcclxuICAgICAgICAgICAgICAgIGNoZWNrZWQ6IGlzQ2hlY2tlZCxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogdGFyZ2V0RWxlbWVudFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbGwgcmFkaW8gYnV0dG9uIGdyb3Vwc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiUmFkaW9CdXR0b25cIl0sIFtyb2xlPVwicmFkaW9ncm91cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJGcmFtZU9wdGlvbkJ1dHRvblwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKGVsKTtcclxuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRSYWRpbyA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXTpjaGVja2VkLCBbcm9sZT1cInJhZGlvXCJdW2FyaWEtY2hlY2tlZD1cInRydWVcIl0nKTtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gc2VsZWN0ZWRSYWRpbz8udmFsdWUgfHwgc2VsZWN0ZWRSYWRpbz8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJyc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdyYWRpbycsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudFZhbHVlOiBjdXJyZW50VmFsdWUsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGFsbCB0cmFkaXRpb25hbCBEMzY1IGdyaWRzL3RhYmxlc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiB0aGlzLmdldEVsZW1lbnRMYWJlbChlbCkgfHwgJ0dyaWQnLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBEaXNjb3ZlciBncmlkIGNvbHVtbnMgZm9yIGlucHV0XHJcbiAgICAgICAgICAgIHRoaXMuZGlzY292ZXJHcmlkQ29sdW1ucyhlbCwgY29udHJvbE5hbWUsIGZvcm1OYW1lLCBlbGVtZW50cyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHMgKC5yZWFjdEdyaWQpXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6ICdSZWFjdCBHcmlkJyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogJy5yZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgZXhwYW5kYWJsZSBzZWN0aW9ucyAoRmFzdFRhYnMsIEdyb3VwcywgU2VjdGlvblBhZ2VzKVxyXG4gICAgICAgIC8vIFRoZXNlIGFyZSBjb2xsYXBzaWJsZSBzZWN0aW9ucyBpbiBEMzY1IGRpYWxvZ3MgYW5kIGZvcm1zXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcm91cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJUYWJQYWdlXCJdLCBbZGF0YS1keW4tcm9sZT1cIkZhc3RUYWJcIl0sIC5zZWN0aW9uLXBhZ2UsIC5mYXN0dGFiJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBTa2lwIGlmIGFscmVhZHkgYWRkZWRcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhY3R1YWxseSBhbiBleHBhbmRhYmxlIHNlY3Rpb25cclxuICAgICAgICAgICAgLy8gTG9vayBmb3IgaGVhZGVyIGVsZW1lbnRzIG9yIGFyaWEtZXhwYW5kZWQgYXR0cmlidXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGhhc0hlYWRlciA9IGVsLnF1ZXJ5U2VsZWN0b3IoJy5zZWN0aW9uLWhlYWRlciwgLmdyb3VwLWhlYWRlciwgW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZUhlYWRlclwiXSwgLnNlY3Rpb24tcGFnZS1jYXB0aW9uLCBidXR0b25bYXJpYS1leHBhbmRlZF0nKTtcclxuICAgICAgICAgICAgY29uc3QgaXNFeHBhbmRhYmxlID0gZWwuaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzaWJsZScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWN0aW9uLXBhZ2UnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc0hlYWRlciAhPT0gbnVsbCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnR3JvdXAnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdTZWN0aW9uUGFnZSc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWlzRXhwYW5kYWJsZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgZXhwYW5kZWQgc3RhdGVcclxuICAgICAgICAgICAgY29uc3QgaXNFeHBhbmRlZCA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmRlZCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICFlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldEV4cGFuZGFibGVTZWN0aW9uTGFiZWwoZWwpIHx8IGNvbnRyb2xOYW1lO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2VjdGlvbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgaXNFeHBhbmRlZDogaXNFeHBhbmRlZCxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBEaXNjb3ZlciBSZWFjdCBncmlkIGNvbHVtbnMgZm9yIGlucHV0XHJcbiAgICAgICAgICAgIHRoaXMuZGlzY292ZXJSZWFjdEdyaWRDb2x1bW5zKGVsLCBmb3JtTmFtZSwgZWxlbWVudHMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudHM7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHJlYWRhYmxlIHRleHQgZnJvbSBhbiBlbGVtZW50XHJcbiAgICBnZXRFbGVtZW50VGV4dChlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IGFyaWEtbGFiZWwgZmlyc3RcclxuICAgICAgICBsZXQgdGV4dCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKHRleHQgJiYgdGV4dC50cmltKCkpIHJldHVybiB0ZXh0LnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gVHJ5IHRleHQgY29udGVudCAoZXhjbHVkaW5nIGNoaWxkIGJ1dHRvbnMvaWNvbnMpXHJcbiAgICAgICAgY29uc3QgY2xvbmUgPSBlbGVtZW50LmNsb25lTm9kZSh0cnVlKTtcclxuICAgICAgICBjbG9uZS5xdWVyeVNlbGVjdG9yQWxsKCcuYnV0dG9uLWljb24sIC5mYSwgLmdseXBoaWNvbicpLmZvckVhY2goaWNvbiA9PiBpY29uLnJlbW92ZSgpKTtcclxuICAgICAgICB0ZXh0ID0gY2xvbmUudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcblxyXG4gICAgICAgIC8vIFRyeSB0aXRsZSBhdHRyaWJ1dGVcclxuICAgICAgICB0ZXh0ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJyk7XHJcbiAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG5cclxuICAgICAgICAvLyBGYWxsYmFjayB0byBjb250cm9sIG5hbWVcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJ1Vua25vd24nO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCBsYWJlbCBmb3IgaW5wdXQgZmllbGRzXHJcbiAgICBnZXRFbGVtZW50TGFiZWwoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBhcmlhLWxhYmVsXHJcbiAgICAgICAgbGV0IGxhYmVsID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcclxuICAgICAgICBpZiAobGFiZWwgJiYgbGFiZWwudHJpbSgpKSByZXR1cm4gbGFiZWwudHJpbSgpO1xyXG5cclxuICAgICAgICAvLyBUcnkgYXNzb2NpYXRlZCBsYWJlbCBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgbGFiZWxFbGVtZW50ID0gZWxlbWVudC5jbG9zZXN0KCcuZHluLWxhYmVsLXdyYXBwZXInKT8ucXVlcnlTZWxlY3RvcignLmR5bi1sYWJlbCcpO1xyXG4gICAgICAgIGlmIChsYWJlbEVsZW1lbnQpIHJldHVybiBsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gVHJ5IHBhcmVudCBjb250YWluZXIgbGFiZWxcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5pbnB1dF9jb250YWluZXIsIC5mb3JtLWdyb3VwJyk7XHJcbiAgICAgICAgaWYgKGNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBjb25zdCBjb250YWluZXJMYWJlbCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpO1xyXG4gICAgICAgICAgICBpZiAoY29udGFpbmVyTGFiZWwpIHJldHVybiBjb250YWluZXJMYWJlbC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gY29udHJvbCBuYW1lXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICdVbmtub3duJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXNjb3ZlciBncmlkIGNvbHVtbnMgZm9yIGlucHV0L2VkaXRpbmdcclxuICAgIGRpc2NvdmVyR3JpZENvbHVtbnMoZ3JpZEVsZW1lbnQsIGdyaWROYW1lLCBmb3JtTmFtZSwgZWxlbWVudHMpIHtcclxuICAgICAgICBjb25zdCBhZGRlZENvbHVtbnMgPSBuZXcgU2V0KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWV0aG9kIDE6IEZpbmQgY29sdW1uIGhlYWRlcnNcclxuICAgICAgICBjb25zdCBoZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdLCAuZHluLWhlYWRlckNlbGwnKTtcclxuICAgICAgICBoZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGhlYWRlci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpIHx8IGhlYWRlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBgJHtkaXNwbGF5VGV4dH1gLFxyXG4gICAgICAgICAgICAgICAgZ3JpZE5hbWU6IGdyaWROYW1lLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGhlYWRlciksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNIZWFkZXI6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBoZWFkZXJcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWV0aG9kIDI6IEZpbmQgY2VsbHMgd2l0aCBpbnB1dHMgaW4gdGhlIGFjdGl2ZS9zZWxlY3RlZCByb3dcclxuICAgICAgICBjb25zdCBhY3RpdmVSb3cgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXJvbGU9XCJSb3dcIl06Zmlyc3Qtb2YtdHlwZSwgW3JvbGU9XCJyb3dcIl06bm90KFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdKTpmaXJzdC1vZi10eXBlJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGFjdGl2ZVJvdykge1xyXG4gICAgICAgICAgICAvLyBGaW5kIGFsbCBpbnB1dCBmaWVsZHMgaW4gdGhlIHJvd1xyXG4gICAgICAgICAgICBjb25zdCBjZWxscyA9IGFjdGl2ZVJvdy5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgIGNlbGxzLmZvckVhY2goY2VsbCA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBjb25zdCByb2xlID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGhhc0lucHV0ID0gY2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgc2VsZWN0LCB0ZXh0YXJlYScpICE9PSBudWxsIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnSW5wdXQnLCAnQ29tYm9Cb3gnLCAnTG9va3VwJywgJ1JlZmVyZW5jZUdyb3VwJywgJ1NlZ21lbnRlZEVudHJ5J10uaW5jbHVkZXMocm9sZSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChoYXNJbnB1dCB8fCByb2xlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IHRoaXMuZ2V0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGNlbGwpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkTmFtZTogZ3JpZE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShjZWxsKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpc0VkaXRhYmxlOiBoYXNJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZFR5cGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGNlbGxcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAzOiBGaW5kIGFueSBlZGl0YWJsZSBpbnB1dHMgaW5zaWRlIHRoZSBncmlkIGJvZHlcclxuICAgICAgICBjb25zdCBncmlkSW5wdXRzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJJbnB1dFwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0nKTtcclxuICAgICAgICBncmlkSW5wdXRzLmZvckVhY2goaW5wdXQgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgdGhpcy5nZXRFbGVtZW50TGFiZWwoaW5wdXQpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGlucHV0KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgZ3JpZE5hbWU6IGdyaWROYW1lLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGlucHV0KSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0VkaXRhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZFR5cGUsXHJcbiAgICAgICAgICAgICAgICByb2xlOiBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGlucHV0XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGEgZ3JpZCBjb2x1bW4gYnkgbG9va2luZyBhdCB0aGUgaGVhZGVyXHJcbiAgICBnZXRHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbHVtbkNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGhlYWRlciBjZWxsIGZvciB0aGlzIGNvbHVtblxyXG4gICAgICAgIGNvbnN0IGhlYWRlciA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2x1bW5Db250cm9sTmFtZX1cIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2x1bW5Db250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoaGVhZGVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCBoZWFkZXIgYnkgcGFydGlhbCBtYXRjaCAoY29sdW1uIG5hbWUgbWlnaHQgYmUgZGlmZmVyZW50IGluIGhlYWRlciB2cyBjZWxsKVxyXG4gICAgICAgIGNvbnN0IGFsbEhlYWRlcnMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGggb2YgYWxsSGVhZGVycykge1xyXG4gICAgICAgICAgICBjb25zdCBoZWFkZXJOYW1lID0gaC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmIChoZWFkZXJOYW1lICYmIChjb2x1bW5Db250cm9sTmFtZS5pbmNsdWRlcyhoZWFkZXJOYW1lKSB8fCBoZWFkZXJOYW1lLmluY2x1ZGVzKGNvbHVtbkNvbnRyb2xOYW1lKSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBoLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzY292ZXIgY29sdW1ucyBpbiBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkc1xyXG4gICAgZGlzY292ZXJSZWFjdEdyaWRDb2x1bW5zKGdyaWRFbGVtZW50LCBmb3JtTmFtZSwgZWxlbWVudHMpIHtcclxuICAgICAgICBjb25zdCBhZGRlZENvbHVtbnMgPSBuZXcgU2V0KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gR2V0IGNvbHVtbiBoZWFkZXJzIGZyb20gLmR5bi1oZWFkZXJDZWxsIGVsZW1lbnRzXHJcbiAgICAgICAgY29uc3QgaGVhZGVyQ2VsbHMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfaGVhZGVyIC5keW4taGVhZGVyQ2VsbCcpO1xyXG4gICAgICAgIGhlYWRlckNlbGxzLmZvckVhY2goKGhlYWRlciwgY29sSW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBoZWFkZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29udHJvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29udHJvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXIucXVlcnlTZWxlY3RvcignLmR5bi1oZWFkZXJDZWxsTGFiZWwnKTtcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBjb250cm9sTmFtZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGdyaWRUeXBlOiAncmVhY3QnLFxyXG4gICAgICAgICAgICAgICAgY29sdW1uSW5kZXg6IGNvbEluZGV4LFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGhlYWRlciksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYC5keW4taGVhZGVyQ2VsbFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzSGVhZGVyOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaGVhZGVyXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFsc28gbG9vayBmb3IgZWRpdGFibGUgaW5wdXRzIGluc2lkZSB0aGUgYm9keSByb3dzXHJcbiAgICAgICAgY29uc3QgYm9keUNvbnRhaW5lciA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIC8vIEZpbmQgYWN0aXZlL3NlbGVjdGVkIHJvdyBmaXJzdCwgb3IgZmFsbGJhY2sgdG8gZmlyc3Qgcm93XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2RhdGEtZHluLXJvdy1hY3RpdmU9XCJ0cnVlXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluLnB1YmxpY19maXhlZERhdGFUYWJsZVJvd19tYWluJyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBGaW5kIGFsbCBjZWxscyB3aXRoIGRhdGEtZHluLWNvbnRyb2xuYW1lXHJcbiAgICAgICAgICAgICAgICBjb25zdCBjZWxscyA9IGFjdGl2ZVJvdy5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgICAgICBjZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBjZWxsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBjZWxsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc0lucHV0ID0gY2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgc2VsZWN0LCB0ZXh0YXJlYScpICE9PSBudWxsIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ0lucHV0JywgJ0NvbWJvQm94JywgJ0xvb2t1cCcsICdSZWZlcmVuY2VHcm91cCcsICdTZWdtZW50ZWRFbnRyeSddLmluY2x1ZGVzKHJvbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldFJlYWN0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGNlbGwpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyaWRUeXBlOiAncmVhY3QnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoY2VsbCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogaGFzSW5wdXQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBjZWxsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIGFueSBlZGl0YWJsZSBpbnB1dHMgaW4gdGhlIGdyaWQgYm9keVxyXG4gICAgICAgIGNvbnN0IGdyaWRJbnB1dHMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSBbZGF0YS1keW4tcm9sZT1cIklucHV0XCJdLCAuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSBbZGF0YS1keW4tcm9sZT1cIkNvbWJvQm94XCJdLCAuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSBbZGF0YS1keW4tcm9sZT1cIkxvb2t1cFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJSZWZlcmVuY2VHcm91cFwiXScpO1xyXG4gICAgICAgIGdyaWRJbnB1dHMuZm9yRWFjaChpbnB1dCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IHRoaXMuZ2V0UmVhY3RHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IHRoaXMuZ2V0RWxlbWVudExhYmVsKGlucHV0KSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShpbnB1dCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGdyaWRUeXBlOiAncmVhY3QnLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGlucHV0KSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0VkaXRhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZFR5cGUsXHJcbiAgICAgICAgICAgICAgICByb2xlOiBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGlucHV0XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGEgUmVhY3QgZ3JpZCBjb2x1bW4gYnkgbG9va2luZyBhdCB0aGUgaGVhZGVyXHJcbiAgICBnZXRSZWFjdEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sdW1uQ29udHJvbE5hbWUpIHtcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCB0aGUgaGVhZGVyIGNlbGwgd2l0aCBtYXRjaGluZyBjb250cm9sbmFtZVxyXG4gICAgICAgIGNvbnN0IGhlYWRlciA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYC5keW4taGVhZGVyQ2VsbFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IGhlYWRlci5xdWVyeVNlbGVjdG9yKCcuZHluLWhlYWRlckNlbGxMYWJlbCcpO1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaGVhZGVyLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUGFydGlhbCBtYXRjaFxyXG4gICAgICAgIGNvbnN0IGFsbEhlYWRlcnMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGFsbEhlYWRlcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGguZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoaGVhZGVyTmFtZSAmJiAoY29sdW1uQ29udHJvbE5hbWUuaW5jbHVkZXMoaGVhZGVyTmFtZSkgfHwgaGVhZGVyTmFtZS5pbmNsdWRlcyhjb2x1bW5Db250cm9sTmFtZSkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsYWJlbCA9IGgucXVlcnlTZWxlY3RvcignLmR5bi1oZWFkZXJDZWxsTGFiZWwnKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGV0ZWN0IGZpZWxkIHR5cGUgKGVudW0sIGxvb2t1cCwgZnJlZXRleHQsIGV0Yy4pXHJcbiAgICBkZXRlY3RGaWVsZFR5cGUoZWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU2VnbWVudGVkRW50cnkgZmllbGRzIChsaWtlIEFjY291bnQpIGhhdmUgc3BlY2lhbCBsb29rdXBcclxuICAgICAgICBpZiAocm9sZSA9PT0gJ1NlZ21lbnRlZEVudHJ5Jykge1xyXG4gICAgICAgICAgICByZXR1cm4geyB0eXBlOiAnc2VnbWVudGVkLWxvb2t1cCcsIHJvbGU6IHJvbGUgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGxvb2t1cCBidXR0b25cclxuICAgICAgICBjb25zdCBoYXNMb29rdXBCdXR0b24gPSBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmllbGQtaGFzTG9va3VwQnV0dG9uJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQucXVlcnlTZWxlY3RvcignLmxvb2t1cC1idXR0b24nKSAhPT0gbnVsbCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5uZXh0RWxlbWVudFNpYmxpbmc/LmNsYXNzTGlzdC5jb250YWlucygnbG9va3VwLWJ1dHRvbicpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBDb21ib0JveC9Ecm9wZG93blxyXG4gICAgICAgIGNvbnN0IGlzQ29tYm9Cb3ggPSByb2xlID09PSAnQ29tYm9Cb3gnIHx8IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb21ib0JveCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBzZWxlY3QgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IHNlbGVjdCA9IGVsZW1lbnQucXVlcnlTZWxlY3Rvcignc2VsZWN0Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTXVsdGlsaW5lSW5wdXQgZGV0ZWN0aW9uXHJcbiAgICAgICAgY29uc3QgaXNNdWx0aWxpbmUgPSByb2xlID09PSAnTXVsdGlsaW5lSW5wdXQnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERldGVjdCBudW1lcmljIGZpZWxkc1xyXG4gICAgICAgIGNvbnN0IGlzTnVtZXJpYyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cIm51bWJlclwiXScpICE9PSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERldGVjdCBkYXRlIGZpZWxkc1xyXG4gICAgICAgIGNvbnN0IGlzRGF0ZSA9IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkYXRlLWZpZWxkJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJkYXRlXCJdJykgIT09IG51bGw7XHJcblxyXG4gICAgICAgIC8vIEJ1aWxkIGZpZWxkIHR5cGUgaW5mb1xyXG4gICAgICAgIGNvbnN0IGZpZWxkSW5mbyA9IHtcclxuICAgICAgICAgICAgY29udHJvbFR5cGU6IHJvbGUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ3RleHQnXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgaWYgKGlzTXVsdGlsaW5lKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAndGV4dGFyZWEnO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaXNNdWx0aWxpbmUgPSB0cnVlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNDb21ib0JveCB8fCBzZWxlY3QpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdlbnVtJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzRW51bSA9IHRydWU7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby52YWx1ZXMgPSB0aGlzLmV4dHJhY3RFbnVtVmFsdWVzKGVsZW1lbnQsIHNlbGVjdCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChoYXNMb29rdXBCdXR0b24pIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdsb29rdXAnO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaXNMb29rdXAgPSB0cnVlO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uYWxsb3dGcmVldGV4dCA9ICFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnbG9va3VwLW9ubHknKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzTnVtZXJpYykge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ251bWJlcic7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc0RhdGUpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdkYXRlJztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEdldCBtYXggbGVuZ3RoIGlmIGF2YWlsYWJsZVxyXG4gICAgICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEnKTtcclxuICAgICAgICBpZiAoaW5wdXQgJiYgaW5wdXQubWF4TGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8ubWF4TGVuZ3RoID0gaW5wdXQubWF4TGVuZ3RoO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGZpZWxkSW5mbztcclxuICAgIH1cclxuXHJcbiAgICAvLyBFeHRyYWN0IGVudW0gdmFsdWVzIGZyb20gZHJvcGRvd25cclxuICAgIGV4dHJhY3RFbnVtVmFsdWVzKGVsZW1lbnQsIHNlbGVjdEVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzZWxlY3QgPSBzZWxlY3RFbGVtZW50IHx8IGVsZW1lbnQucXVlcnlTZWxlY3Rvcignc2VsZWN0Jyk7XHJcbiAgICAgICAgaWYgKCFzZWxlY3QpIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbShzZWxlY3Qub3B0aW9ucylcclxuICAgICAgICAgICAgLmZpbHRlcihvcHQgPT4gb3B0LnZhbHVlICE9PSAnJylcclxuICAgICAgICAgICAgLm1hcChvcHQgPT4gKHtcclxuICAgICAgICAgICAgICAgIHZhbHVlOiBvcHQudmFsdWUsXHJcbiAgICAgICAgICAgICAgICB0ZXh0OiBvcHQudGV4dC50cmltKClcclxuICAgICAgICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCBsYWJlbCBmb3IgZXhwYW5kYWJsZSBzZWN0aW9uc1xyXG4gICAgZ2V0RXhwYW5kYWJsZVNlY3Rpb25MYWJlbChlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGhlYWRlci9jYXB0aW9uIGVsZW1lbnRcclxuICAgICAgICBjb25zdCBoZWFkZXJTZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgICAgICcuc2VjdGlvbi1wYWdlLWNhcHRpb24nLFxyXG4gICAgICAgICAgICAnLnNlY3Rpb24taGVhZGVyJyxcclxuICAgICAgICAgICAgJy5ncm91cC1oZWFkZXInLFxyXG4gICAgICAgICAgICAnLmZhc3R0YWItaGVhZGVyJyxcclxuICAgICAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0nLFxyXG4gICAgICAgICAgICAnYnV0dG9uW2FyaWEtZXhwYW5kZWRdIHNwYW4nLFxyXG4gICAgICAgICAgICAnYnV0dG9uIHNwYW4nLFxyXG4gICAgICAgICAgICAnLmNhcHRpb24nLFxyXG4gICAgICAgICAgICAnbGVnZW5kJ1xyXG4gICAgICAgIF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBoZWFkZXJTZWxlY3RvcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICAgICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBhcmlhLWxhYmVsXHJcbiAgICAgICAgY29uc3QgYXJpYUxhYmVsID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcclxuICAgICAgICBpZiAoYXJpYUxhYmVsKSByZXR1cm4gYXJpYUxhYmVsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0aGUgYnV0dG9uJ3MgdGV4dCBpZiB0aGUgc2VjdGlvbiBoYXMgYSB0b2dnbGUgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgdG9nZ2xlQnRuID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b24nKTtcclxuICAgICAgICBpZiAodG9nZ2xlQnRuKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0b2dnbGVCdG4udGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHRleHQgJiYgdGV4dC5sZW5ndGggPCAxMDApIHJldHVybiB0ZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBpZiBlbGVtZW50IGlzIHZpc2libGVcclxuICAgIGlzRWxlbWVudFZpc2libGUoZWxlbWVudCkge1xyXG4gICAgICAgIHJldHVybiBlbGVtZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJiBcclxuICAgICAgICAgICAgICAgd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICAgICAgICAgd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkuZGlzcGxheSAhPT0gJ25vbmUnO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFN0YXJ0IGludGVyYWN0aXZlIGVsZW1lbnQgcGlja2VyXHJcbiAgICBzdGFydEVsZW1lbnRQaWNrZXIoY2FsbGJhY2spIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5waWNrZXJDYWxsYmFjayA9IGNhbGxiYWNrO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgb3ZlcmxheVxyXG4gICAgICAgIHRoaXMub3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMub3ZlcmxheS5zdHlsZS5jc3NUZXh0ID0gYFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogZml4ZWQ7XHJcbiAgICAgICAgICAgIHRvcDogMDtcclxuICAgICAgICAgICAgbGVmdDogMDtcclxuICAgICAgICAgICAgd2lkdGg6IDEwMCU7XHJcbiAgICAgICAgICAgIGhlaWdodDogMTAwJTtcclxuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xyXG4gICAgICAgICAgICB6LWluZGV4OiA5OTk5OTg7XHJcbiAgICAgICAgICAgIGN1cnNvcjogY3Jvc3NoYWlyO1xyXG4gICAgICAgIGA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLm92ZXJsYXkpO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgaGlnaGxpZ2h0IGVsZW1lbnRcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuY3NzVGV4dCA9IGBcclxuICAgICAgICAgICAgcG9zaXRpb246IGFic29sdXRlO1xyXG4gICAgICAgICAgICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDEwMiwgMTI2LCAyMzQsIDAuMSk7XHJcbiAgICAgICAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xyXG4gICAgICAgICAgICB6LWluZGV4OiA5OTk5OTk7XHJcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjFzIGVhc2U7XHJcbiAgICAgICAgYDtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMuaGlnaGxpZ2h0RWxlbWVudCk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lcnNcclxuICAgICAgICB0aGlzLm1vdXNlTW92ZUhhbmRsZXIgPSAoZSkgPT4gdGhpcy5oYW5kbGVNb3VzZU1vdmUoZSk7XHJcbiAgICAgICAgdGhpcy5jbGlja0hhbmRsZXIgPSAoZSkgPT4gdGhpcy5oYW5kbGVDbGljayhlKTtcclxuICAgICAgICB0aGlzLmVzY2FwZUhhbmRsZXIgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB0aGlzLnN0b3BFbGVtZW50UGlja2VyKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3VzZU1vdmVIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuY2xpY2tIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5lc2NhcGVIYW5kbGVyLCB0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVNb3VzZU1vdmUoZSkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xyXG4gICAgICAgIGlmICghdGFyZ2V0IHx8IHRhcmdldCA9PT0gdGhpcy5vdmVybGF5IHx8IHRhcmdldCA9PT0gdGhpcy5oaWdobGlnaHRFbGVtZW50KSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpbmQgY2xvc2VzdCBEMzY1IGNvbnRyb2xcclxuICAgICAgICBjb25zdCBjb250cm9sID0gdGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICBpZiAoIWNvbnRyb2wpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaGlnaGxpZ2h0RWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRW5zdXJlIGhpZ2hsaWdodCBlbGVtZW50IGV4aXN0c1xyXG4gICAgICAgIGlmICghdGhpcy5oaWdobGlnaHRFbGVtZW50KSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhpZ2hsaWdodCB0aGUgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IHJlY3QgPSBjb250cm9sLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUudG9wID0gcmVjdC50b3AgKyB3aW5kb3cuc2Nyb2xsWSArICdweCc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmxlZnQgPSByZWN0LmxlZnQgKyB3aW5kb3cuc2Nyb2xsWCArICdweCc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLndpZHRoID0gcmVjdC53aWR0aCArICdweCc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmhlaWdodCA9IHJlY3QuaGVpZ2h0ICsgJ3B4JztcclxuXHJcbiAgICAgICAgLy8gU2hvdyB0b29sdGlwXHJcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBjb250cm9sLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICBjb25zdCByb2xlID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc2V0QXR0cmlidXRlKCd0aXRsZScsIGAke3JvbGV9OiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG5cclxuICAgIGhhbmRsZUNsaWNrKGUpIHtcclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuXHJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludChlLmNsaWVudFgsIGUuY2xpZW50WSk7XHJcbiAgICAgICAgY29uc3QgY29udHJvbCA9IHRhcmdldD8uY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBjb250cm9sLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdGhpcy5nZXRFbGVtZW50VGV4dChjb250cm9sKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRJbmZvID0ge1xyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiB0ZXh0LFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWBcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIGlmIChyb2xlID09PSAnSW5wdXQnIHx8IHJvbGUgPT09ICdNdWx0aWxpbmVJbnB1dCcgfHwgcm9sZSA9PT0gJ0NvbWJvQm94Jykge1xyXG4gICAgICAgICAgICAgICAgZWxlbWVudEluZm8uZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoY29udHJvbCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMucGlja2VyQ2FsbGJhY2soZWxlbWVudEluZm8pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIHN0b3BFbGVtZW50UGlja2VyKCkge1xyXG4gICAgICAgIHRoaXMuaXNJbnNwZWN0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRoaXMub3ZlcmxheSkge1xyXG4gICAgICAgICAgICB0aGlzLm92ZXJsYXkucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIHRoaXMub3ZlcmxheSA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3VzZU1vdmVIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuY2xpY2tIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5lc2NhcGVIYW5kbGVyLCB0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTZWFyY2ggZWxlbWVudHMgYnkgdGV4dFxyXG4gICAgZmluZEVsZW1lbnRCeVRleHQodGV4dCwgZWxlbWVudFR5cGUgPSBudWxsKSB7XHJcbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSB0aGlzLmRpc2NvdmVyRWxlbWVudHMoKTtcclxuICAgICAgICBjb25zdCBzZWFyY2hUZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLmZpbHRlcihlbCA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50VHlwZSAmJiBlbC50eXBlICE9PSBlbGVtZW50VHlwZSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSBlbC5kaXNwbGF5VGV4dC50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBjb25zdCBhcmlhTGFiZWwgPSAoZWwuYXJpYUxhYmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmNvbnRyb2xOYW1lLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gZGlzcGxheVRleHQuaW5jbHVkZXMoc2VhcmNoVGV4dCkgfHxcclxuICAgICAgICAgICAgICAgICAgIGFyaWFMYWJlbC5pbmNsdWRlcyhzZWFyY2hUZXh0KSB8fFxyXG4gICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUuaW5jbHVkZXMoc2VhcmNoVGV4dCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEV4cG9ydCBmb3IgdXNlIGluIGNvbnRlbnQgc2NyaXB0XHJcbiIsICJleHBvcnQgZnVuY3Rpb24gc2VuZExvZyhsZXZlbCwgbWVzc2FnZSkge1xuICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0xPRycsXG4gICAgICAgIGxvZzogeyBsZXZlbCwgbWVzc2FnZSB9XG4gICAgfSwgJyonKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvZ1N0ZXAobWVzc2FnZSkge1xuICAgIHNlbmRMb2coJ2luZm8nLCBtZXNzYWdlKTtcbiAgICBjb25zb2xlLmxvZygnW0QzNjUgQXV0b21hdGlvbl0nLCBtZXNzYWdlKTtcbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gc2xlZXAobXMpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpIHtcbiAgICBjb25zdCBpc1RleHRBcmVhID0gaW5wdXQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJztcbiAgICBjb25zdCBkZXNjcmlwdG9yID0gaXNUZXh0QXJlYVxuICAgICAgICA/IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3Iod2luZG93LkhUTUxUZXh0QXJlYUVsZW1lbnQucHJvdG90eXBlLCAndmFsdWUnKVxuICAgICAgICA6IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3Iod2luZG93LkhUTUxJbnB1dEVsZW1lbnQucHJvdG90eXBlLCAndmFsdWUnKTtcblxuICAgIGlmIChkZXNjcmlwdG9yICYmIGRlc2NyaXB0b3Iuc2V0KSB7XG4gICAgICAgIGRlc2NyaXB0b3Iuc2V0LmNhbGwoaW5wdXQsIHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBpbnB1dC52YWx1ZSA9IHZhbHVlO1xuICAgIH1cbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplVGV4dCh2YWx1ZSkge1xyXG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSA/PyAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKS50b0xvd2VyQ2FzZSgpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29lcmNlQm9vbGVhbih2YWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdmFsdWU7XHJcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykgcmV0dXJuIHZhbHVlICE9PSAwICYmICFOdW1iZXIuaXNOYU4odmFsdWUpO1xyXG5cclxuICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KHZhbHVlKTtcclxuICAgIGlmICh0ZXh0ID09PSAnJykgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIGlmIChbJ3RydWUnLCAnMScsICd5ZXMnLCAneScsICdvbicsICdjaGVja2VkJ10uaW5jbHVkZXModGV4dCkpIHJldHVybiB0cnVlO1xyXG4gICAgaWYgKFsnZmFsc2UnLCAnMCcsICdubycsICduJywgJ29mZicsICd1bmNoZWNrZWQnXS5pbmNsdWRlcyh0ZXh0KSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG4iLCAiZXhwb3J0IGZ1bmN0aW9uIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKSB7XHJcbiAgICBjb25zdCBhbGxNYXRjaGVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuXHJcbiAgICBpZiAoYWxsTWF0Y2hlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xyXG4gICAgaWYgKGFsbE1hdGNoZXMubGVuZ3RoID09PSAxKSByZXR1cm4gYWxsTWF0Y2hlc1swXTtcclxuXHJcbiAgICAvLyBNdWx0aXBsZSBtYXRjaGVzIC0gcHJlZmVyIHRoZSBvbmUgaW4gdGhlIGFjdGl2ZS90b3Btb3N0IGNvbnRleHRcclxuXHJcbiAgICAvLyBQcmlvcml0eSAxOiBFbGVtZW50IGluIGFuIGFjdGl2ZSBkaWFsb2cvbW9kYWwgKGNoaWxkIGZvcm1zKVxyXG4gICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgY29uc3QgZGlhbG9nID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyLCAuZmx5b3V0LWNvbnRhaW5lciwgW3JvbGU9XCJkaWFsb2dcIl0nKTtcclxuICAgICAgICBpZiAoZGlhbG9nICYmIGlzRWxlbWVudFZpc2libGUoZGlhbG9nKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gZGlhbG9nIGNvbnRleHRgKTtcclxuICAgICAgICAgICAgcmV0dXJuIGVsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSAyOiBFbGVtZW50IGluIGEgRmFzdFRhYiBvciBUYWJQYWdlIHRoYXQncyBleHBhbmRlZC9hY3RpdmVcclxuICAgIGZvciAoY29uc3QgZWwgb2YgYWxsTWF0Y2hlcykge1xyXG4gICAgICAgIGNvbnN0IHRhYlBhZ2UgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIlRhYlBhZ2VcIl0sIC50YWJQYWdlJyk7XHJcbiAgICAgICAgaWYgKHRhYlBhZ2UpIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIHRhYiBpcyBleHBhbmRlZFxyXG4gICAgICAgICAgICBjb25zdCBpc0V4cGFuZGVkID0gdGFiUGFnZS5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFiUGFnZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICF0YWJQYWdlLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJyk7XHJcbiAgICAgICAgICAgIGlmIChpc0V4cGFuZGVkICYmIGlzRWxlbWVudFZpc2libGUoZWwpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gZXhwYW5kZWQgdGFiIGNvbnRleHRgKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBlbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSAzOiBFbGVtZW50IGluIHRoZSBmb3JtIGNvbnRleHQgdGhhdCBoYXMgZm9jdXMgb3Igd2FzIHJlY2VudGx5IGludGVyYWN0ZWQgd2l0aFxyXG4gICAgY29uc3QgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XHJcbiAgICBpZiAoYWN0aXZlRWxlbWVudCAmJiBhY3RpdmVFbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlRm9ybUNvbnRleHQgPSBhY3RpdmVFbGVtZW50LmNsb3Nlc3QoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdLCBbZGF0YS1keW4tcm9sZT1cIkZvcm1cIl0nKTtcclxuICAgICAgICBpZiAoYWN0aXZlRm9ybUNvbnRleHQpIHtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYWN0aXZlRm9ybUNvbnRleHQuY29udGFpbnMoZWwpICYmIGlzRWxlbWVudFZpc2libGUoZWwpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYEZvdW5kICR7Y29udHJvbE5hbWV9IGluIGFjdGl2ZSBmb3JtIGNvbnRleHRgKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZWw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJpb3JpdHkgNDogQW55IHZpc2libGUgZWxlbWVudCAocHJlZmVyIGxhdGVyIG9uZXMgYXMgdGhleSdyZSBvZnRlbiBpbiBjaGlsZCBmb3JtcyByZW5kZXJlZCBvbiB0b3ApXHJcbiAgICBjb25zdCB2aXNpYmxlTWF0Y2hlcyA9IEFycmF5LmZyb20oYWxsTWF0Y2hlcykuZmlsdGVyKGVsID0+IGlzRWxlbWVudFZpc2libGUoZWwpKTtcclxuICAgIGlmICh2aXNpYmxlTWF0Y2hlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgLy8gUmV0dXJuIHRoZSBsYXN0IHZpc2libGUgbWF0Y2ggKG9mdGVuIHRoZSBjaGlsZCBmb3JtJ3MgZWxlbWVudClcclxuICAgICAgICByZXR1cm4gdmlzaWJsZU1hdGNoZXNbdmlzaWJsZU1hdGNoZXMubGVuZ3RoIC0gMV07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmFsbGJhY2s6IGZpcnN0IG1hdGNoXHJcbiAgICByZXR1cm4gYWxsTWF0Y2hlc1swXTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGUoZWwpIHtcclxuICAgIGlmICghZWwpIHJldHVybiBmYWxzZTtcclxuICAgIGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIGNvbnN0IHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpO1xyXG4gICAgcmV0dXJuIHJlY3Qud2lkdGggPiAwICYmXHJcbiAgICAgICAgICAgcmVjdC5oZWlnaHQgPiAwICYmXHJcbiAgICAgICAgICAgc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnICYmXHJcbiAgICAgICAgICAgc3R5bGUudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICAgICBzdHlsZS5vcGFjaXR5ICE9PSAnMCc7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0QzNjVMb2FkaW5nKCkge1xyXG4gICAgLy8gQ2hlY2sgZm9yIGNvbW1vbiBEMzY1IGxvYWRpbmcgaW5kaWNhdG9yc1xyXG4gICAgY29uc3QgbG9hZGluZ1NlbGVjdG9ycyA9IFtcclxuICAgICAgICAnLmR5bi1sb2FkaW5nLW92ZXJsYXk6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tbG9hZGluZy1pbmRpY2F0b3I6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tc3Bpbm5lcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmxvYWRpbmctaW5kaWNhdG9yOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcuZHluLW1lc3NhZ2VCdXN5Om5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICdbZGF0YS1keW4tbG9hZGluZz1cInRydWVcIl0nLFxyXG4gICAgICAgICcuYnVzeS1pbmRpY2F0b3InLFxyXG4gICAgICAgICcuZHluLWxvYWRpbmdTdHViOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknXHJcbiAgICBdO1xyXG5cclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgbG9hZGluZ1NlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGVsICYmIGVsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgZm9yIEFKQVggcmVxdWVzdHMgaW4gcHJvZ3Jlc3MgKEQzNjUgc3BlY2lmaWMpXHJcbiAgICBpZiAod2luZG93LiRkeW4gJiYgd2luZG93LiRkeW4uaXNQcm9jZXNzaW5nKSB7XHJcbiAgICAgICAgcmV0dXJuIHdpbmRvdy4kZHluLmlzUHJvY2Vzc2luZygpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpIHtcclxuICAgIC8vIEZpcnN0LCB0cnkgdG8gZmluZCBpbiBhbiBhY3RpdmUvc2VsZWN0ZWQgcm93ICh0cmFkaXRpb25hbCBEMzY1IGdyaWRzKVxyXG4gICAgY29uc3Qgc2VsZWN0ZWRSb3dzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXNlbGVjdGVkPVwidHJ1ZVwiXSwgW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZHluLXNlbGVjdGVkUm93Jyk7XHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiBzZWxlY3RlZFJvd3MpIHtcclxuICAgICAgICBjb25zdCBjZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNlbGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyeSBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcyAtIGZpbmQgYWN0aXZlIHJvd1xyXG4gICAgY29uc3QgcmVhY3RHcmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgLy8gTG9vayBmb3IgYWN0aXZlL3NlbGVjdGVkIHJvd1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2RhdGEtZHluLXJvdy1hY3RpdmU9XCJ0cnVlXCJdJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZVJvdykge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gYWN0aXZlUm93LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgICAgIGlmIChjZWxsICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgaW4gYm9keSByb3dzXHJcbiAgICAgICAgY29uc3QgYm9keUNvbnRhaW5lciA9IGdyaWQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHksIC5maXhlZERhdGFUYWJsZUxheW91dF9yb3dzQ29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGJvZHlDb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xyXG4gICAgICAgICAgICAgICAgLy8gU2tpcCBpZiBpbiBoZWFkZXJcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzSW5IZWFkZXIgPSBjZWxsLmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUxheW91dF9oZWFkZXIsIC5keW4taGVhZGVyQ2VsbCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFpc0luSGVhZGVyICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNlbGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJ5IHRvIGZpbmQgaW4gdHJhZGl0aW9uYWwgRDM2NSBncmlkIGNvbnRleHRcclxuICAgIGNvbnN0IGdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgZ3JpZHMpIHtcclxuICAgICAgICAvLyBGaW5kIGFsbCBtYXRjaGluZyBjZWxscyBhbmQgcHJlZmVyIHZpc2libGUvZWRpdGFibGUgb25lc1xyXG4gICAgICAgIGNvbnN0IGNlbGxzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGluIGEgZGF0YSByb3cgKG5vdCBoZWFkZXIpXHJcbiAgICAgICAgICAgIGNvbnN0IGlzSW5IZWFkZXIgPSBjZWxsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXSwgdGhlYWQnKTtcclxuICAgICAgICAgICAgaWYgKCFpc0luSGVhZGVyICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBGYWxsYmFjayB0byBzdGFuZGFyZCBlbGVtZW50IGZpbmRpbmdcclxuICAgIHJldHVybiBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBoYXNMb29rdXBCdXR0b24oZWxlbWVudCkge1xyXG4gICAgcmV0dXJuIGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmaWVsZC1oYXNMb29rdXBCdXR0b24nKSB8fFxyXG4gICAgICAgIGVsZW1lbnQucXVlcnlTZWxlY3RvcignLmxvb2t1cC1idXR0b24sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwQnV0dG9uXCJdJykgIT09IG51bGwgfHxcclxuICAgICAgICBlbGVtZW50Lm5leHRFbGVtZW50U2libGluZz8uY2xhc3NMaXN0LmNvbnRhaW5zKCdsb29rdXAtYnV0dG9uJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9va3VwQnV0dG9uKGVsZW1lbnQpIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFsnLmxvb2t1cC1idXR0b24nLCAnLmxvb2t1cEJ1dHRvbicsICdbZGF0YS1keW4tcm9sZT1cIkxvb2t1cEJ1dHRvblwiXSddO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBkaXJlY3QgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChkaXJlY3QpIHJldHVybiBkaXJlY3Q7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5pbnB1dF9jb250YWluZXIsIC5mb3JtLWdyb3VwLCAubG9va3VwRmllbGQnKSB8fCBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuIG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGluQ29udGFpbmVyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChpbkNvbnRhaW5lcikgcmV0dXJuIGluQ29udGFpbmVyO1xyXG4gICAgfVxyXG4gICAgY29uc3QgYXJpYUJ1dHRvbiA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdidXR0b25bYXJpYS1sYWJlbCo9XCJMb29rdXBcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIk9wZW5cIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIlNlbGVjdFwiXScpO1xyXG4gICAgaWYgKGFyaWFCdXR0b24pIHJldHVybiBhcmlhQnV0dG9uO1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKGVsZW1lbnQpIHtcclxuICAgIGlmICghZWxlbWVudCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcclxuICAgIHJldHVybiBlbGVtZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJlxyXG4gICAgICAgIHN0eWxlLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcGlja05lYXJlc3RSb3dzKHJvd3MsIHRhcmdldEVsZW1lbnQpIHtcclxuICAgIGlmICghcm93cy5sZW5ndGgpIHJldHVybiByb3dzO1xyXG4gICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRhcmdldEVsZW1lbnQ/LmdldEJvdW5kaW5nQ2xpZW50UmVjdD8uKCk7XHJcbiAgICBpZiAoIXRhcmdldFJlY3QpIHJldHVybiByb3dzO1xyXG4gICAgcmV0dXJuIHJvd3Muc2xpY2UoKS5zb3J0KChhLCBiKSA9PiB7XHJcbiAgICAgICAgY29uc3QgcmEgPSBhLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IHJiID0gYi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBkYSA9IE1hdGguYWJzKHJhLmxlZnQgLSB0YXJnZXRSZWN0LmxlZnQpICsgTWF0aC5hYnMocmEudG9wIC0gdGFyZ2V0UmVjdC5ib3R0b20pO1xyXG4gICAgICAgIGNvbnN0IGRiID0gTWF0aC5hYnMocmIubGVmdCAtIHRhcmdldFJlY3QubGVmdCkgKyBNYXRoLmFicyhyYi50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgcmV0dXJuIGRhIC0gZGI7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMb29rdXBGaWx0ZXJJbnB1dChsb29rdXBEb2NrKSB7XHJcbiAgICBpZiAoIWxvb2t1cERvY2spIHJldHVybiBudWxsO1xyXG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmZyb20oXHJcbiAgICAgICAgbG9va3VwRG9jay5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwidGV4dFwiXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKVxyXG4gICAgKTtcclxuICAgIGlmICghY2FuZGlkYXRlcy5sZW5ndGgpIHJldHVybiBudWxsO1xyXG5cclxuICAgIC8vIFByZWZlciBpbnB1dHMgaW5zaWRlIHNlZ21lbnRlZCBlbnRyeSBmbHlvdXQgKE1haW5BY2NvdW50IGlucHV0IGluIHRoZSByaWdodCBwYW5lbClcclxuICAgIGNvbnN0IHNlZ21lbnRJbnB1dCA9IGNhbmRpZGF0ZXMuZmluZChpbnB1dCA9PiBpbnB1dC5jbG9zZXN0KCcuc2VnbWVudGVkRW50cnktZmx5b3V0U2VnbWVudCcpKTtcclxuICAgIGlmIChzZWdtZW50SW5wdXQpIHJldHVybiBzZWdtZW50SW5wdXQ7XHJcblxyXG4gICAgLy8gU29tZSBmbHlvdXRzIHdyYXAgdGhlIGlucHV0IGluIGEgY29udGFpbmVyOyB0cnkgdG8gZmluZCB0aGUgYWN0dWFsIGlucHV0IGluc2lkZVxyXG4gICAgY29uc3Qgc2VnbWVudENvbnRhaW5lciA9IGxvb2t1cERvY2sucXVlcnlTZWxlY3RvcignLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQgLnNlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCcpO1xyXG4gICAgaWYgKHNlZ21lbnRDb250YWluZXIpIHtcclxuICAgICAgICBjb25zdCBpbm5lciA9IHNlZ21lbnRDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgICAgIGlmIChpbm5lcikgcmV0dXJuIGlubmVyO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFByZWZlciBpbnB1dHMgaW5zaWRlIGdyaWQgaGVhZGVyL3Rvb2xiYXIgb3IgbmVhciB0aGUgdG9wLXJpZ2h0IChsaWtlIHRoZSBtYXJrZWQgYm94KVxyXG4gICAgY29uc3QgaGVhZGVyQ2FuZGlkYXRlID0gY2FuZGlkYXRlcy5maW5kKGlucHV0ID0+XHJcbiAgICAgICAgaW5wdXQuY2xvc2VzdCgnLmxvb2t1cC1oZWFkZXIsIC5sb29rdXAtdG9vbGJhciwgLmdyaWQtaGVhZGVyLCBbcm9sZT1cInRvb2xiYXJcIl0nKVxyXG4gICAgKTtcclxuICAgIGlmIChoZWFkZXJDYW5kaWRhdGUpIHJldHVybiBoZWFkZXJDYW5kaWRhdGU7XHJcblxyXG4gICAgbGV0IGJlc3QgPSBjYW5kaWRhdGVzWzBdO1xyXG4gICAgbGV0IGJlc3RTY29yZSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcclxuICAgIGZvciAoY29uc3QgaW5wdXQgb2YgY2FuZGlkYXRlcykge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSBpbnB1dC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBzY29yZSA9IHJlY3QudG9wICogMiArIHJlY3QubGVmdDsgLy8gYmlhcyB0b3dhcmRzIHRvcCByb3dcclxuICAgICAgICBpZiAoc2NvcmUgPCBiZXN0U2NvcmUpIHtcclxuICAgICAgICAgICAgYmVzdFNjb3JlID0gc2NvcmU7XHJcbiAgICAgICAgICAgIGJlc3QgPSBpbnB1dDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYmVzdDtcclxufVxyXG4iLCAiaW1wb3J0IHsgc2xlZXAgfSBmcm9tICcuL2FzeW5jLmpzJztcclxuaW1wb3J0IHsgaXNFbGVtZW50VmlzaWJsZUdsb2JhbCwgcGlja05lYXJlc3RSb3dzIH0gZnJvbSAnLi9kb20uanMnO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMb29rdXBQb3B1cCh0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJy5sb29rdXAtYnV0dG9uQ29udGFpbmVyJyxcclxuICAgICAgICAnLmxvb2t1cERvY2stYnV0dG9uQ29udGFpbmVyJyxcclxuICAgICAgICAnW3JvbGU9XCJkaWFsb2dcIl0nLFxyXG4gICAgICAgICcubG9va3VwLWZseW91dCcsXHJcbiAgICAgICAgJy5sb29rdXBGbHlvdXQnLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkxvb2t1cFwiXScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwR3JpZFwiXScsXHJcbiAgICAgICAgJy5sb29rdXAtY29udGFpbmVyJyxcclxuICAgICAgICAnLmxvb2t1cCcsXHJcbiAgICAgICAgJ1tyb2xlPVwiZ3JpZFwiXScsXHJcbiAgICAgICAgJ3RhYmxlJ1xyXG4gICAgXTtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgICAgICBjb25zdCBwb3B1cCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgICAgICBpZiAoIXBvcHVwKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKHBvcHVwLmNsYXNzTGlzdD8uY29udGFpbnMoJ21lc3NhZ2VDZW50ZXInKSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChwb3B1cC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSA9PT0gJ0FjdGlvbiBjZW50ZXInKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKHBvcHVwKSkgY29udGludWU7XHJcbiAgICAgICAgICAgIHJldHVybiBwb3B1cDtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvb2t1cFJvd3MobG9va3VwRG9jaywgdGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMzAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGxldCByb3dzID0gbG9va3VwRG9jaz8ucXVlcnlTZWxlY3RvckFsbD8uKCd0cltkYXRhLWR5bi1yb3ddLCAubG9va3VwLXJvdywgW3JvbGU9XCJyb3dcIl0nKSB8fCBbXTtcclxuICAgICAgICBpZiAocm93cy5sZW5ndGgpIHJldHVybiByb3dzO1xyXG5cclxuICAgICAgICAvLyBGYWxsYmFjazogZmluZCB2aXNpYmxlIGxvb2t1cCByb3dzIGFueXdoZXJlIChzb21lIGRvY2tzIHJlbmRlciBvdXRzaWRlIHRoZSBjb250YWluZXIpXHJcbiAgICAgICAgY29uc3QgZ2xvYmFsUm93cyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndHJbZGF0YS1keW4tcm93XSwgLmxvb2t1cC1yb3csIFtyb2xlPVwicm93XCJdJykpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbCk7XHJcbiAgICAgICAgaWYgKGdsb2JhbFJvd3MubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwaWNrTmVhcmVzdFJvd3MoZ2xvYmFsUm93cywgdGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDE1MCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gW107XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQodGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMzAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRhcmdldEVsZW1lbnQ/LmdldEJvdW5kaW5nQ2xpZW50UmVjdD8uKCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgZG9ja3MgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5sb29rdXBEb2NrLWJ1dHRvbkNvbnRhaW5lcicpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoZG9jayA9PiAhZG9jay5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdtZXNzYWdlQ2VudGVyJykpO1xyXG5cclxuICAgICAgICBpZiAoZG9ja3MubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHdpdGhSb3dzID0gZG9ja3MuZmlsdGVyKGRvY2sgPT4gZG9jay5xdWVyeVNlbGVjdG9yKCd0cltkYXRhLWR5bi1yb3ddLCAubG9va3VwLXJvdywgW3JvbGU9XCJyb3dcIl0sIFtyb2xlPVwiZ3JpZFwiXSwgdGFibGUnKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSB3aXRoUm93cy5sZW5ndGggPyB3aXRoUm93cyA6IGRvY2tzO1xyXG4gICAgICAgICAgICBjb25zdCBiZXN0ID0gcGlja05lYXJlc3REb2NrKGNhbmRpZGF0ZXMsIHRhcmdldFJlY3QpO1xyXG4gICAgICAgICAgICBpZiAoYmVzdCkgcmV0dXJuIGJlc3Q7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBpY2tOZWFyZXN0RG9jayhkb2NrcywgdGFyZ2V0UmVjdCkge1xyXG4gICAgaWYgKCFkb2Nrcy5sZW5ndGgpIHJldHVybiBudWxsO1xyXG4gICAgaWYgKCF0YXJnZXRSZWN0KSByZXR1cm4gZG9ja3NbMF07XHJcbiAgICBsZXQgYmVzdCA9IGRvY2tzWzBdO1xyXG4gICAgbGV0IGJlc3RTY29yZSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcclxuICAgIGZvciAoY29uc3QgZG9jayBvZiBkb2Nrcykge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSBkb2NrLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IGR4ID0gTWF0aC5hYnMocmVjdC5sZWZ0IC0gdGFyZ2V0UmVjdC5sZWZ0KTtcclxuICAgICAgICBjb25zdCBkeSA9IE1hdGguYWJzKHJlY3QudG9wIC0gdGFyZ2V0UmVjdC5ib3R0b20pO1xyXG4gICAgICAgIGNvbnN0IHNjb3JlID0gZHggKyBkeTtcclxuICAgICAgICBpZiAoc2NvcmUgPCBiZXN0U2NvcmUpIHtcclxuICAgICAgICAgICAgYmVzdFNjb3JlID0gc2NvcmU7XHJcbiAgICAgICAgICAgIGJlc3QgPSBkb2NrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBiZXN0O1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxpc3Rib3hGb3JFbGVtZW50KHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFsnW3JvbGU9XCJsaXN0Ym94XCJdJywgJy5kcm9wRG93bkxpc3QnLCAnLmNvbWJvQm94RHJvcERvd24nLCAnLmRyb3Bkb3duLW1lbnUnLCAnLmRyb3Bkb3duLWxpc3QnXTtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIGNvbnN0IHRhcmdldFJlY3QgPSB0YXJnZXRFbGVtZW50Py5nZXRCb3VuZGluZ0NsaWVudFJlY3Q/LigpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGxpc3RzID0gc2VsZWN0b3JzLmZsYXRNYXAoc2VsID0+IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChzZWwpKSlcclxuICAgICAgICAgICAgLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKTtcclxuICAgICAgICBpZiAobGlzdHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwaWNrTmVhcmVzdERvY2sobGlzdHMsIHRhcmdldFJlY3QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTGlzdGJveEZvcklucHV0KGlucHV0LCB0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgbGlua2VkID0gZ2V0TGlzdGJveEZyb21JbnB1dChpbnB1dCk7XHJcbiAgICAgICAgaWYgKGxpbmtlZCAmJiBpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKGxpbmtlZCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGxpbmtlZDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZmFsbGJhY2sgPSBhd2FpdCB3YWl0Rm9yTGlzdGJveEZvckVsZW1lbnQodGFyZ2V0RWxlbWVudCwgMjAwKTtcclxuICAgICAgICBpZiAoZmFsbGJhY2spIHJldHVybiBmYWxsYmFjaztcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRMaXN0Ym94RnJvbUlucHV0KGlucHV0KSB7XHJcbiAgICBpZiAoIWlucHV0KSByZXR1cm4gbnVsbDtcclxuICAgIGNvbnN0IGlkID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJykgfHwgaW5wdXQuZ2V0QXR0cmlidXRlKCdhcmlhLW93bnMnKTtcclxuICAgIGlmIChpZCkge1xyXG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xyXG4gICAgICAgIGlmIChlbCkgcmV0dXJuIGVsO1xyXG4gICAgfVxyXG4gICAgY29uc3QgYWN0aXZlSWQgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcpO1xyXG4gICAgaWYgKGFjdGl2ZUlkKSB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlSWQpO1xyXG4gICAgICAgIGNvbnN0IGxpc3QgPSBhY3RpdmU/LmNsb3Nlc3Q/LignW3JvbGU9XCJsaXN0Ym94XCJdJyk7XHJcbiAgICAgICAgaWYgKGxpc3QpIHJldHVybiBsaXN0O1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kQ29tYm9Cb3hCdXR0b24oZWxlbWVudCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcubG9va3VwQnV0dG9uJyxcclxuICAgICAgICAnLmNvbWJvQm94LWJ1dHRvbicsXHJcbiAgICAgICAgJy5jb21ib0JveC1kcm9wRG93bkJ1dHRvbicsXHJcbiAgICAgICAgJy5kcm9wZG93bkJ1dHRvbicsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiRHJvcERvd25CdXR0b25cIl0nLFxyXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJPcGVuXCJdJyxcclxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VsZWN0XCJdJ1xyXG4gICAgXTtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgYnRuID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoYnRuKSByZXR1cm4gYnRuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuaW5wdXRfY29udGFpbmVyLCAuZm9ybS1ncm91cCcpIHx8IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuICAgIGlmICghY29udGFpbmVyKSByZXR1cm4gbnVsbDtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgYnRuID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChidG4pIHJldHVybiBidG47XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbGxlY3RDb21ib09wdGlvbnMobGlzdGJveCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAgICdbcm9sZT1cIm9wdGlvblwiXScsXHJcbiAgICAgICAgJy5jb21ib0JveC1saXN0SXRlbScsXHJcbiAgICAgICAgJy5jb21ib0JveC1pdGVtJyxcclxuICAgICAgICAnbGknLFxyXG4gICAgICAgICcuZHJvcGRvd24tbGlzdC1pdGVtJyxcclxuICAgICAgICAnLmNvbWJvQm94SXRlbScsXHJcbiAgICAgICAgJy5kcm9wRG93bkxpc3RJdGVtJyxcclxuICAgICAgICAnLmRyb3Bkb3duLWl0ZW0nXHJcbiAgICBdO1xyXG4gICAgY29uc3QgZm91bmQgPSBbXTtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgbGlzdGJveC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgaWYgKGlzRWxlbWVudFZpc2libGVHbG9iYWwoZWwpKSBmb3VuZC5wdXNoKGVsKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiBmb3VuZC5sZW5ndGggPyBmb3VuZCA6IEFycmF5LmZyb20obGlzdGJveC5jaGlsZHJlbikuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBzbGVlcCwgc2V0TmF0aXZlVmFsdWUgfSBmcm9tICcuL2FzeW5jLmpzJztcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0eXBlVmFsdWVTbG93bHkoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIGlucHV0LmNsaWNrID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgIH1cclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFR5cGUgY2hhcmFjdGVyIGJ5IGNoYXJhY3RlclxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgYnVmZmVyKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODApOyAvLyA4MG1zIHBlciBjaGFyYWN0ZXJcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5ibHVyKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg4MDApOyAvLyBXYWl0IGZvciB2YWxpZGF0aW9uXHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0eXBlVmFsdWVXaXRoSW5wdXRFdmVudHMoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIGlucHV0LmNsaWNrID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgIH1cclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg4MCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUgPz8gJycpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgYnVmZmVyKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0JywgeyBkYXRhOiBjaGFyLCBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNjApO1xyXG4gICAgfVxyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCB2YWx1ZSwgdGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3QgZXhwZWN0ZWQgPSBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKTtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBjdXJyZW50ID0gU3RyaW5nKGlucHV0Py52YWx1ZSA/PyAnJykudHJpbSgpO1xyXG4gICAgICAgIGlmIChjdXJyZW50ID09PSBleHBlY3RlZCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFZhbHVlT25jZShpbnB1dCwgdmFsdWUsIGNsZWFyRmlyc3QgPSBmYWxzZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBpZiAoY2xlYXJGaXJzdCkge1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGV4cGVjdGVkID0gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCk7XHJcbiAgICBhd2FpdCBzZXRWYWx1ZU9uY2UoaW5wdXQsIHZhbHVlLCB0cnVlKTtcclxuICAgIGF3YWl0IHNsZWVwKDE1MCk7XHJcbiAgICBpZiAoU3RyaW5nKGlucHV0LnZhbHVlID8/ICcnKS50cmltKCkgIT09IGV4cGVjdGVkKSB7XHJcbiAgICAgICAgYXdhaXQgdHlwZVZhbHVlU2xvd2x5KGlucHV0LCBleHBlY3RlZCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PSA4IENvbWJvQm94IElucHV0IE1ldGhvZHMgPT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogTWV0aG9kIDE6IEJhc2ljIHNldFZhbHVlIChmYXN0IGJ1dCBtYXkgbm90IHRyaWdnZXIgRDM2NSBmaWx0ZXJpbmcpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDEoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDI6IFBhc3RlIHNpbXVsYXRpb24gd2l0aCBJbnB1dEV2ZW50XHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDIoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBDbGVhciBmaXJzdFxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnZGVsZXRlQ29udGVudEJhY2t3YXJkJ1xyXG4gICAgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFNpbXVsYXRlIHBhc3RlXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnYmVmb3JlaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21QYXN0ZScsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbVBhc3RlJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCAzOiBDaGFyYWN0ZXItYnktY2hhcmFjdGVyIHdpdGggZnVsbCBrZXkgZXZlbnRzIChSRUNPTU1FTkRFRClcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kMyhpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIENsZWFyIHRoZSBpbnB1dCBmaXJzdFxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnZGVsZXRlQ29udGVudEJhY2t3YXJkJ1xyXG4gICAgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gYnVmZmVyO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGtleWRvd25cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBiZWZvcmVpbnB1dFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2JlZm9yZWlucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIHZhbHVlXHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgaW5wdXQgZXZlbnRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUga2V5dXBcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDQ6IENoYXJhY3Rlci1ieS1jaGFyYWN0ZXIgd2l0aCBrZXlwcmVzcyAobGVnYWN5KVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q0KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnZGVsZXRlQ29udGVudEJhY2t3YXJkJ1xyXG4gICAgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgY29uc3QgY2hhckNvZGUgPSBjaGFyLmNoYXJDb2RlQXQoMCk7XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gYnVmZmVyO1xyXG5cclxuICAgICAgICAvLyBrZXlkb3duXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBrZXlwcmVzcyAoZGVwcmVjYXRlZCBidXQgc3RpbGwgdXNlZCBieSBzb21lIGZyYW1ld29ya3MpXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5cHJlc3MnLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGNoYXJDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBiZWZvcmVpbnB1dFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2JlZm9yZWlucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIHZhbHVlXHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIC8vIGlucHV0XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBrZXl1cFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDU6IGV4ZWNDb21tYW5kIGluc2VydFRleHRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIFNlbGVjdCBhbGwgYW5kIGRlbGV0ZVxyXG4gICAgaW5wdXQuc2VsZWN0KCk7XHJcbiAgICBkb2N1bWVudC5leGVjQ29tbWFuZCgnZGVsZXRlJyk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gSW5zZXJ0IHRleHRcclxuICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdpbnNlcnRUZXh0JywgZmFsc2UsIHZhbHVlKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDY6IFBhc3RlICsgQmFja3NwYWNlIHdvcmthcm91bmRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNihpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIFNldCB2YWx1ZSBkaXJlY3RseSAobGlrZSBwYXN0ZSlcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21QYXN0ZScsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIEFkZCBhIGNoYXJhY3RlciBhbmQgZGVsZXRlIGl0IHRvIHRyaWdnZXIgZmlsdGVyaW5nXHJcbiAgICBjb25zdCB2YWx1ZVdpdGhFeHRyYSA9IHZhbHVlICsgJ1gnO1xyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlV2l0aEV4dHJhKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgZGF0YTogJ1gnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIE5vdyBkZWxldGUgdGhhdCBjaGFyYWN0ZXIgd2l0aCBhIHJlYWwgYmFja3NwYWNlIGV2ZW50XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywge1xyXG4gICAgICAgIGtleTogJ0JhY2tzcGFjZScsXHJcbiAgICAgICAgY29kZTogJ0JhY2tzcGFjZScsXHJcbiAgICAgICAga2V5Q29kZTogOCxcclxuICAgICAgICB3aGljaDogOCxcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnZGVsZXRlQ29udGVudEJhY2t3YXJkJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywge1xyXG4gICAgICAgIGtleTogJ0JhY2tzcGFjZScsXHJcbiAgICAgICAgY29kZTogJ0JhY2tzcGFjZScsXHJcbiAgICAgICAga2V5Q29kZTogOCxcclxuICAgICAgICB3aGljaDogOCxcclxuICAgICAgICBidWJibGVzOiB0cnVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA3OiBEMzY1IGludGVybmFsIG1lY2hhbmlzbSB0cmlnZ2VyXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDcoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBTZXQgdmFsdWUgd2l0aCBmdWxsIGV2ZW50IHNlcXVlbmNlIHVzZWQgYnkgRDM2NVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gVHlwZSBjaGFyYWN0ZXIgYnkgY2hhcmFjdGVyIGJ1dCBhbHNvIGRpc3BhdGNoIG9uIHRoZSBwYXJlbnQgY29udHJvbFxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgY29uc3QgcGFyZW50ID0gaW5wdXQuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGVdJykgfHwgaW5wdXQucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGlucHV0LnZhbHVlICsgY2hhcjtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGEgY29tcHJlaGVuc2l2ZSBldmVudCBzZXRcclxuICAgICAgICBjb25zdCBrZXlib2FyZEV2ZW50SW5pdCA9IHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGNvbXBvc2VkOiB0cnVlLFxyXG4gICAgICAgICAgICB2aWV3OiB3aW5kb3dcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBGaXJlIG9uIGlucHV0IGFuZCBwb3RlbnRpYWxseSBidWJibGUgdG8gRDM2NSBoYW5kbGVyc1xyXG4gICAgICAgIGNvbnN0IGtleWRvd25FdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywga2V5Ym9hcmRFdmVudEluaXQpO1xyXG4gICAgICAgIGNvbnN0IGtleXVwRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCBrZXlib2FyZEV2ZW50SW5pdCk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQoa2V5ZG93bkV2ZW50KTtcclxuXHJcbiAgICAgICAgLy8gU2V0IHZhbHVlIEJFRk9SRSBpbnB1dCBldmVudFxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvbXBvc2VkOiB0cnVlLFxyXG4gICAgICAgICAgICB2aWV3OiB3aW5kb3dcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQoa2V5dXBFdmVudCk7XHJcblxyXG4gICAgICAgIC8vIEFsc28gZGlzcGF0Y2ggb24gcGFyZW50IGZvciBEMzY1IGNvbnRyb2xzXHJcbiAgICAgICAgaWYgKHBhcmVudCAmJiBwYXJlbnQgIT09IGlucHV0KSB7XHJcbiAgICAgICAgICAgIHBhcmVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZpbmFsIGNoYW5nZSBldmVudFxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcblxyXG4gICAgLy8gVHJ5IHRvIHRyaWdnZXIgRDM2NSdzIFZhbHVlQ2hhbmdlZCBjb21tYW5kXHJcbiAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgICAgcGFyZW50LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdWYWx1ZUNoYW5nZWQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGRldGFpbDogeyB2YWx1ZTogdmFsdWUgfVxyXG4gICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDg6IENvbXBvc2l0aW9uIGV2ZW50cyAoSU1FLXN0eWxlKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q4KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBTdGFydCBjb21wb3NpdGlvblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgQ29tcG9zaXRpb25FdmVudCgnY29tcG9zaXRpb25zdGFydCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgZGF0YTogJydcclxuICAgIH0pKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgY3VycmVudFZhbHVlID0gJyc7XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGN1cnJlbnRWYWx1ZSArPSBzdHJpbmdWYWx1ZVtpXTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgQ29tcG9zaXRpb25FdmVudCgnY29tcG9zaXRpb251cGRhdGUnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGRhdGE6IGN1cnJlbnRWYWx1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRDb21wb3NpdGlvblRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjdXJyZW50VmFsdWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFbmQgY29tcG9zaXRpb25cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoJ2NvbXBvc2l0aW9uZW5kJywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21Db21wb3NpdGlvbicsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogSGVscGVyIHRvIGdldCBrZXkgY29kZSBmcm9tIGNoYXJhY3RlclxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEtleUNvZGUoY2hhcikge1xyXG4gICAgY29uc3QgdXBwZXJDaGFyID0gY2hhci50b1VwcGVyQ2FzZSgpO1xyXG4gICAgaWYgKHVwcGVyQ2hhciA+PSAnQScgJiYgdXBwZXJDaGFyIDw9ICdaJykge1xyXG4gICAgICAgIHJldHVybiAnS2V5JyArIHVwcGVyQ2hhcjtcclxuICAgIH1cclxuICAgIGlmIChjaGFyID49ICcwJyAmJiBjaGFyIDw9ICc5Jykge1xyXG4gICAgICAgIHJldHVybiAnRGlnaXQnICsgY2hhcjtcclxuICAgIH1cclxuICAgIGNvbnN0IHNwZWNpYWxLZXlzID0ge1xyXG4gICAgICAgICcgJzogJ1NwYWNlJyxcclxuICAgICAgICAnLSc6ICdNaW51cycsXHJcbiAgICAgICAgJz0nOiAnRXF1YWwnLFxyXG4gICAgICAgICdbJzogJ0JyYWNrZXRMZWZ0JyxcclxuICAgICAgICAnXSc6ICdCcmFja2V0UmlnaHQnLFxyXG4gICAgICAgICdcXFxcJzogJ0JhY2tzbGFzaCcsXHJcbiAgICAgICAgJzsnOiAnU2VtaWNvbG9uJyxcclxuICAgICAgICBcIidcIjogJ1F1b3RlJyxcclxuICAgICAgICAnLCc6ICdDb21tYScsXHJcbiAgICAgICAgJy4nOiAnUGVyaW9kJyxcclxuICAgICAgICAnLyc6ICdTbGFzaCcsXHJcbiAgICAgICAgJ2AnOiAnQmFja3F1b3RlJ1xyXG4gICAgfTtcclxuICAgIHJldHVybiBzcGVjaWFsS2V5c1tjaGFyXSB8fCAnVW5pZGVudGlmaWVkJztcclxufVxyXG5cclxuLyoqXHJcbiAqIERpc3BhdGNoZXIgZnVuY3Rpb24gLSB1c2VzIHRoZSBzZWxlY3RlZCBpbnB1dCBtZXRob2QgZnJvbSBzZXR0aW5nc1xyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlLCBtZXRob2QpIHtcclxuICAgIGNvbnNvbGUubG9nKGBbRDM2NV0gVXNpbmcgY29tYm9ib3ggaW5wdXQgbWV0aG9kOiAke21ldGhvZH1gKTtcclxuXHJcbiAgICBzd2l0Y2ggKG1ldGhvZCkge1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDEnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDEoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2QyJzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QyKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kMyc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMyhpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDQnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDQoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q1JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q1KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNic6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNihpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDcnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDcoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q4JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q4KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QzKGlucHV0LCB2YWx1ZSk7IC8vIERlZmF1bHQgdG8gbWV0aG9kIDNcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIHZhbHVlLCBlbGVtZW50KSB7XHJcbiAgICBpZiAoIWlucHV0KSByZXR1cm47XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdmb2N1c291dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRXNjYXBlJywgY29kZTogJ0VzY2FwZScsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VzY2FwZScsIGNvZGU6ICdFc2NhcGUnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmJsdXIoKTtcclxuICAgIGlmIChlbGVtZW50KSB7XHJcbiAgICAgICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIH1cclxuICAgIGRvY3VtZW50LmJvZHk/LmNsaWNrPy4oKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZSh0YXJnZXQpIHtcclxuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJ1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuY2xpY2soKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgbG9nU3RlcCB9IGZyb20gJy4uL3V0aWxzL2xvZ2dpbmcuanMnO1xyXG5pbXBvcnQgeyBzZXROYXRpdmVWYWx1ZSwgc2xlZXAgfSBmcm9tICcuLi91dGlscy9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0LCBpc0VsZW1lbnRWaXNpYmxlLCBpc0QzNjVMb2FkaW5nLCBmaW5kR3JpZENlbGxFbGVtZW50LCBoYXNMb29rdXBCdXR0b24sIGZpbmRMb29rdXBCdXR0b24sIGZpbmRMb29rdXBGaWx0ZXJJbnB1dCB9IGZyb20gJy4uL3V0aWxzL2RvbS5qcyc7XHJcbmltcG9ydCB7IHdhaXRGb3JMb29rdXBQb3B1cCwgd2FpdEZvckxvb2t1cFJvd3MsIHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudCwgd2FpdEZvckxpc3Rib3hGb3JJbnB1dCwgY29sbGVjdENvbWJvT3B0aW9ucywgZmluZENvbWJvQm94QnV0dG9uIH0gZnJvbSAnLi4vdXRpbHMvbG9va3VwLmpzJztcclxuaW1wb3J0IHsgdHlwZVZhbHVlU2xvd2x5LCB0eXBlVmFsdWVXaXRoSW5wdXRFdmVudHMsIHdhaXRGb3JJbnB1dFZhbHVlLCBzZXRWYWx1ZU9uY2UsIHNldFZhbHVlV2l0aFZlcmlmeSwgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZCBhcyBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUsIGNvbW1pdENvbWJvVmFsdWUsIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZSB9IGZyb20gJy4uL3V0aWxzL2NvbWJvYm94LmpzJztcclxuaW1wb3J0IHsgY29lcmNlQm9vbGVhbiwgbm9ybWFsaXplVGV4dCB9IGZyb20gJy4uL3V0aWxzL3RleHQuanMnO1xyXG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuLi9ydW50aW1lL2Vycm9ycy5qcyc7XHJcblxyXG5mdW5jdGlvbiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgY29uc3QgbWV0aG9kID0gd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uY29tYm9TZWxlY3RNb2RlIHx8ICdtZXRob2QzJztcclxuICAgIHJldHVybiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUoaW5wdXQsIHZhbHVlLCBtZXRob2QpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpIHtcclxuICAgIGlmICghZWxlbWVudCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIGlmIChlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnU2VnbWVudGVkRW50cnknKSByZXR1cm4gdHJ1ZTtcclxuICAgIGlmIChlbGVtZW50LmNsb3Nlc3Q/LignW2RhdGEtZHluLXJvbGU9XCJTZWdtZW50ZWRFbnRyeVwiXScpKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICBjb25zdCBjbGFzc0xpc3QgPSBlbGVtZW50LmNsYXNzTGlzdDtcclxuICAgIGlmIChjbGFzc0xpc3QgJiYgKGNsYXNzTGlzdC5jb250YWlucygnc2VnbWVudGVkRW50cnknKSB8fFxyXG4gICAgICAgIGNsYXNzTGlzdC5jb250YWlucygnc2VnbWVudGVkLWVudHJ5JykgfHxcclxuICAgICAgICBjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCcpKSkge1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiAhIWVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCcuc2VnbWVudGVkRW50cnktc2VnbWVudElucHV0LCAuc2VnbWVudGVkRW50cnktZmx5b3V0U2VnbWVudCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xpY2tFbGVtZW50KGNvbnRyb2xOYW1lKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgXHJcbiAgICBlbGVtZW50LmNsaWNrKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlHcmlkRmlsdGVyKGNvbnRyb2xOYW1lLCBmaWx0ZXJWYWx1ZSwgZmlsdGVyTWV0aG9kID0gJ2lzIGV4YWN0bHknKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgQXBwbHlpbmcgZmlsdGVyOiAke2NvbnRyb2xOYW1lfSAke2ZpbHRlck1ldGhvZH0gXCIke2ZpbHRlclZhbHVlfVwiYCk7XHJcbiAgICBcclxuICAgIC8vIEV4dHJhY3QgZ3JpZCBuYW1lIGFuZCBjb2x1bW4gbmFtZSBmcm9tIGNvbnRyb2xOYW1lXHJcbiAgICAvLyBGb3JtYXQ6IEdyaWROYW1lX0NvbHVtbk5hbWUgKGUuZy4sIFwiR3JpZFJlYWRPbmx5TWFya3VwVGFibGVfTWFya3VwQ29kZVwiKVxyXG4gICAgY29uc3QgbGFzdFVuZGVyc2NvcmVJZHggPSBjb250cm9sTmFtZS5sYXN0SW5kZXhPZignXycpO1xyXG4gICAgY29uc3QgZ3JpZE5hbWUgPSBjb250cm9sTmFtZS5zdWJzdHJpbmcoMCwgbGFzdFVuZGVyc2NvcmVJZHgpO1xyXG4gICAgY29uc3QgY29sdW1uTmFtZSA9IGNvbnRyb2xOYW1lLnN1YnN0cmluZyhsYXN0VW5kZXJzY29yZUlkeCArIDEpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgICBHcmlkOiAke2dyaWROYW1lfSwgQ29sdW1uOiAke2NvbHVtbk5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiB0byBmaW5kIGZpbHRlciBpbnB1dCB3aXRoIG11bHRpcGxlIHBhdHRlcm5zXHJcbiAgICBhc3luYyBmdW5jdGlvbiBmaW5kRmlsdGVySW5wdXQoKSB7XHJcbiAgICAgICAgLy8gRDM2NSBjcmVhdGVzIGZpbHRlciBpbnB1dHMgd2l0aCB2YXJpb3VzIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgZmlsdGVyRmllbGRQYXR0ZXJucyA9IFtcclxuICAgICAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcclxuICAgICAgICAgICAgYEZpbHRlckZpZWxkXyR7Y29udHJvbE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXHJcbiAgICAgICAgICAgIGBGaWx0ZXJGaWVsZF8ke2NvbnRyb2xOYW1lfV9JbnB1dF8wYCxcclxuICAgICAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXHJcbiAgICAgICAgICAgIC8vIEFkZGl0aW9uYWwgcGF0dGVybnMgZm9yIGRpZmZlcmVudCBEMzY1IHZlcnNpb25zXHJcbiAgICAgICAgICAgIGAke2NvbnRyb2xOYW1lfV9GaWx0ZXJGaWVsZF9JbnB1dGAsXHJcbiAgICAgICAgICAgIGAke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9X0ZpbHRlckZpZWxkYFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IGZpbHRlcklucHV0ID0gbnVsbDtcclxuICAgICAgICBsZXQgZmlsdGVyRmllbGRDb250YWluZXIgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBleGFjdCBwYXR0ZXJucyBmaXJzdFxyXG4gICAgICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBmaWx0ZXJGaWVsZFBhdHRlcm5zKSB7XHJcbiAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtwYXR0ZXJufVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVyRmllbGRDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGZpbHRlcklucHV0ID0gZmlsdGVyRmllbGRDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgZmlsdGVyIGZpZWxkOiAke3BhdHRlcm59YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHBhcnRpYWwgbWF0Y2ggb24gRmlsdGVyRmllbGQgY29udGFpbmluZyB0aGUgY29sdW1uIG5hbWVcclxuICAgICAgICBjb25zdCBwYXJ0aWFsTWF0Y2hlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXVtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCIke2NvbHVtbk5hbWV9XCJdYCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBjb250YWluZXIgb2YgcGFydGlhbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGb3VuZCBmaWx0ZXIgZmllbGQgKHBhcnRpYWwgbWF0Y2gpOiAke2NvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyl9YCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXI6IGNvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBGaW5kIGFueSB2aXNpYmxlIGZpbHRlciBpbnB1dCBpbiBmaWx0ZXIgZHJvcGRvd24vZmx5b3V0IGFyZWFcclxuICAgICAgICAvLyBMb29rIGZvciBpbnB1dHMgaW5zaWRlIGZpbHRlci1yZWxhdGVkIGNvbnRhaW5lcnNcclxuICAgICAgICBjb25zdCBmaWx0ZXJDb250YWluZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmR5bi1maWx0ZXItcG9wdXAsIC5maWx0ZXItcGFuZWwsIFtkYXRhLWR5bi1yb2xlPVwiRmlsdGVyUGFuZVwiXSwgW2NsYXNzKj1cImZpbHRlclwiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIGZpbHRlckNvbnRhaW5lcnMpIHtcclxuICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKTpub3QoW3JlYWRvbmx5XSknKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgZmlsdGVyIGlucHV0IGluIGZpbHRlciBjb250YWluZXJgKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lcjogY29udGFpbmVyIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTGFzdCByZXNvcnQ6IEFueSB2aXNpYmxlIEZpbHRlckZpZWxkIGlucHV0XHJcbiAgICAgICAgY29uc3QgdmlzaWJsZUZpbHRlcklucHV0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXSBpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBpbnAgb2YgdmlzaWJsZUZpbHRlcklucHV0cykge1xyXG4gICAgICAgICAgICBpZiAoaW5wLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgZmlsdGVyRmllbGRDb250YWluZXIgPSBpbnAuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlckZpZWxkXCJdJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGb3VuZCB2aXNpYmxlIGZpbHRlciBmaWVsZDogJHtmaWx0ZXJGaWVsZENvbnRhaW5lcj8uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQ6IGlucCwgZmlsdGVyRmllbGRDb250YWluZXIgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dDogbnVsbCwgZmlsdGVyRmllbGRDb250YWluZXI6IG51bGwgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmlyc3QsIGNoZWNrIGlmIHRoZSBmaWx0ZXIgcGFuZWwgaXMgYWxyZWFkeSBvcGVuXHJcbiAgICBsZXQgeyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXIgfSA9IGF3YWl0IGZpbmRGaWx0ZXJJbnB1dCgpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBmaWx0ZXIgaW5wdXQgbm90IGZvdW5kLCB3ZSBuZWVkIHRvIGNsaWNrIHRoZSBjb2x1bW4gaGVhZGVyIHRvIG9wZW4gdGhlIGZpbHRlciBkcm9wZG93blxyXG4gICAgaWYgKCFmaWx0ZXJJbnB1dCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIEZpbHRlciBwYW5lbCBub3Qgb3BlbiwgY2xpY2tpbmcgaGVhZGVyIHRvIG9wZW4uLi5gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIHRoZSBhY3R1YWwgaGVhZGVyIGNlbGxcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBsZXQgY2xpY2tUYXJnZXQgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGlmIChoLmNsYXNzTGlzdC5jb250YWlucygnZHluLWhlYWRlckNlbGwnKSB8fCBcclxuICAgICAgICAgICAgICAgIGguaWQ/LmluY2x1ZGVzKCdoZWFkZXInKSB8fFxyXG4gICAgICAgICAgICAgICAgaC5jbG9zZXN0KCcuZHluLWhlYWRlckNlbGwnKSB8fFxyXG4gICAgICAgICAgICAgICAgaC5jbG9zZXN0KCdbcm9sZT1cImNvbHVtbmhlYWRlclwiXScpKSB7XHJcbiAgICAgICAgICAgICAgICBjbGlja1RhcmdldCA9IGg7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgYnkgSUQgcGF0dGVyblxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbaWQqPVwiJHtjb250cm9sTmFtZX1cIl1baWQqPVwiaGVhZGVyXCJdYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGZpcnN0IGVsZW1lbnQgd2l0aCBjb250cm9sTmFtZVxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmlsdGVyIGNvbHVtbiBoZWFkZXIgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDgwMCk7IC8vIFdhaXQgbG9uZ2VyIGZvciBkcm9wZG93biB0byBvcGVuXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUmV0cnkgZmluZGluZyB0aGUgZmlsdGVyIGlucHV0IHdpdGggYSB3YWl0IGxvb3BcclxuICAgICAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDEwOyBhdHRlbXB0KyspIHtcclxuICAgICAgICAgICAgKHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH0gPSBhd2FpdCBmaW5kRmlsdGVySW5wdXQoKSk7XHJcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJbnB1dCkgYnJlYWs7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWZpbHRlcklucHV0KSB7XHJcbiAgICAgICAgLy8gRGVidWc6IExvZyB3aGF0IGVsZW1lbnRzIHdlIGNhbiBmaW5kXHJcbiAgICAgICAgY29uc3QgYWxsRmlsdGVyRmllbGRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlckZpZWxkXCJdJyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgRGVidWc6IEZvdW5kICR7YWxsRmlsdGVyRmllbGRzLmxlbmd0aH0gRmlsdGVyRmllbGQgZWxlbWVudHM6YCk7XHJcbiAgICAgICAgYWxsRmlsdGVyRmllbGRzLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgIC0gJHtlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyl9LCB2aXNpYmxlOiAke2VsLm9mZnNldFBhcmVudCAhPT0gbnVsbH1gKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZpbHRlciBpbnB1dCBub3QgZm91bmQuIE1ha2Ugc3VyZSB0aGUgZmlsdGVyIGRyb3Bkb3duIGlzIG9wZW4uIEV4cGVjdGVkIHBhdHRlcm46IEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNDogU2V0IHRoZSBmaWx0ZXIgbWV0aG9kIGlmIG5vdCBcImlzIGV4YWN0bHlcIiAoZGVmYXVsdClcclxuICAgIGlmIChmaWx0ZXJNZXRob2QgJiYgZmlsdGVyTWV0aG9kICE9PSAnaXMgZXhhY3RseScpIHtcclxuICAgICAgICBhd2FpdCBzZXRGaWx0ZXJNZXRob2QoZmlsdGVyRmllbGRDb250YWluZXIsIGZpbHRlck1ldGhvZCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNTogRW50ZXIgdGhlIGZpbHRlciB2YWx1ZVxyXG4gICAgZmlsdGVySW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBmaWx0ZXJJbnB1dC5zZWxlY3QoKTtcclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgZXhpc3RpbmcgdmFsdWUgZmlyc3RcclxuICAgIGZpbHRlcklucHV0LnZhbHVlID0gJyc7XHJcbiAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gU2V0IHRoZSB2YWx1ZSB1c2luZyBuYXRpdmUgc2V0dGVyXHJcbiAgICBzZXROYXRpdmVWYWx1ZShmaWx0ZXJJbnB1dCwgZmlsdGVyVmFsdWUpO1xyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gU3RlcCA2OiBBcHBseSB0aGUgZmlsdGVyIC0gZmluZCBhbmQgY2xpY2sgdGhlIEFwcGx5IGJ1dHRvblxyXG4gICAgLy8gSU1QT1JUQU5UOiBUaGUgcGF0dGVybiBpcyB7R3JpZE5hbWV9X3tDb2x1bW5OYW1lfV9BcHBseUZpbHRlcnMsIG5vdCBqdXN0IHtHcmlkTmFtZX1fQXBwbHlGaWx0ZXJzXHJcbiAgICBjb25zdCBhcHBseUJ0blBhdHRlcm5zID0gW1xyXG4gICAgICAgIGAke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9X0FwcGx5RmlsdGVyc2AsICAvLyBNb3N0IGNvbW1vbjogR3JpZFJlYWRPbmx5TWFya3VwVGFibGVfTWFya3VwQ29kZV9BcHBseUZpbHRlcnNcclxuICAgICAgICBgJHtjb250cm9sTmFtZX1fQXBwbHlGaWx0ZXJzYCxcclxuICAgICAgICBgJHtncmlkTmFtZX1fQXBwbHlGaWx0ZXJzYCxcclxuICAgICAgICBgQXBwbHlGaWx0ZXJzYFxyXG4gICAgXTtcclxuICAgIFxyXG4gICAgbGV0IGFwcGx5QnRuID0gbnVsbDtcclxuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBhcHBseUJ0blBhdHRlcm5zKSB7XHJcbiAgICAgICAgYXBwbHlCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke3BhdHRlcm59XCJdYCk7XHJcbiAgICAgICAgaWYgKGFwcGx5QnRuICYmIGFwcGx5QnRuLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGb3VuZCBhcHBseSBidXR0b246ICR7cGF0dGVybn1gKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGYWxsYmFjazogZmluZCBhbnkgdmlzaWJsZSBBcHBseUZpbHRlcnMgYnV0dG9uXHJcbiAgICBpZiAoIWFwcGx5QnRuIHx8IGFwcGx5QnRuLm9mZnNldFBhcmVudCA9PT0gbnVsbCkge1xyXG4gICAgICAgIGNvbnN0IGFsbEFwcGx5QnRucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJBcHBseUZpbHRlcnNcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGJ0biBvZiBhbGxBcHBseUJ0bnMpIHtcclxuICAgICAgICAgICAgaWYgKGJ0bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGFwcGx5QnRuID0gYnRuO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChhcHBseUJ0bikge1xyXG4gICAgICAgIGFwcGx5QnRuLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwMCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNzEzIEZpbHRlciBhcHBsaWVkOiBcIiR7ZmlsdGVyVmFsdWV9XCJgKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHByZXNzaW5nIEVudGVyIGFzIGFsdGVybmF0aXZlXHJcbiAgICAgICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsgXHJcbiAgICAgICAgICAgIGtleTogJ0VudGVyJywga2V5Q29kZTogMTMsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBcclxuICAgICAgICAgICAga2V5OiAnRW50ZXInLCBrZXlDb2RlOiAxMywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSBcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwMCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNzEzIEZpbHRlciBhcHBsaWVkIHZpYSBFbnRlcjogXCIke2ZpbHRlclZhbHVlfVwiYCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0VW50aWxDb25kaXRpb24oY29udHJvbE5hbWUsIGNvbmRpdGlvbiwgZXhwZWN0ZWRWYWx1ZSwgdGltZW91dCkge1xyXG4gICAgY29uc29sZS5sb2coYFdhaXRpbmcgZm9yOiAke2NvbnRyb2xOYW1lfSB0byBiZSAke2NvbmRpdGlvbn0gKHRpbWVvdXQ6ICR7dGltZW91dH1tcylgKTtcclxuICAgIFxyXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgIFxyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydFRpbWUgPCB0aW1lb3V0KSB7XHJcbiAgICAgICAgY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IGNvbmRpdGlvbk1ldCA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAoY29uZGl0aW9uKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ3Zpc2libGUnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBleGlzdHMgYW5kIGlzIHZpc2libGUgKGhhcyBsYXlvdXQpXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBlbGVtZW50ICYmIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkuZGlzcGxheSAhPT0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnaGlkZGVuJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZG9lc24ndCBleGlzdCBvciBpcyBub3QgdmlzaWJsZVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gIWVsZW1lbnQgfHwgZWxlbWVudC5vZmZzZXRQYXJlbnQgPT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS52aXNpYmlsaXR5ID09PSAnaGlkZGVuJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgPT09ICdub25lJztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2V4aXN0cyc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGV4aXN0cyBpbiBET01cclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGVsZW1lbnQgIT09IG51bGw7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdub3QtZXhpc3RzJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZG9lcyBub3QgZXhpc3QgaW4gRE9NXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBlbGVtZW50ID09PSBudWxsO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnZW5hYmxlZCc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGV4aXN0cyBhbmQgaXMgbm90IGRpc2FibGVkXHJcbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgYnV0dG9uLCBzZWxlY3QsIHRleHRhcmVhJykgfHwgZWxlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSAhaW5wdXQuZGlzYWJsZWQgJiYgIWlucHV0Lmhhc0F0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnaGFzLXZhbHVlJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgaGFzIGEgc3BlY2lmaWMgdmFsdWVcclxuICAgICAgICAgICAgICAgIGlmIChlbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0JykgfHwgZWxlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBpbnB1dC52YWx1ZSB8fCBpbnB1dC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBjdXJyZW50VmFsdWUudHJpbSgpID09PSBTdHJpbmcoZXhwZWN0ZWRWYWx1ZSkudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb25kaXRpb25NZXQpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNzEzIENvbmRpdGlvbiBtZXQ6ICR7Y29udHJvbE5hbWV9IGlzICR7Y29uZGl0aW9ufWApO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApOyAvLyBTbWFsbCBzdGFiaWxpdHkgZGVsYXlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRpbWVvdXQgd2FpdGluZyBmb3IgXCIke2NvbnRyb2xOYW1lfVwiIHRvIGJlICR7Y29uZGl0aW9ufSAod2FpdGVkICR7dGltZW91dH1tcylgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldElucHV0VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlLCBmaWVsZFR5cGUpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgLy8gRm9yIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyAoQWNjb3VudCwgZXRjKSwgdXNlIGxvb2t1cCBidXR0b24gYXBwcm9hY2hcclxuICAgIGlmIChmaWVsZFR5cGU/LnR5cGUgPT09ICdzZWdtZW50ZWQtbG9va3VwJyB8fCBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvciBDb21ib0JveC9lbnVtIGZpZWxkcywgb3BlbiBkcm9wZG93biBhbmQgc2VsZWN0XHJcbiAgICBpZiAoZmllbGRUeXBlPy5pbnB1dFR5cGUgPT09ICdlbnVtJyB8fCBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvciBSYWRpb0J1dHRvbi9GcmFtZU9wdGlvbkJ1dHRvbiBncm91cHMsIGNsaWNrIHRoZSBjb3JyZWN0IG9wdGlvblxyXG4gICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICBpZiAocm9sZSA9PT0gJ1JhZGlvQnV0dG9uJyB8fCByb2xlID09PSAnRnJhbWVPcHRpb25CdXR0b24nIHx8IGVsZW1lbnQucXVlcnlTZWxlY3RvcignW3JvbGU9XCJyYWRpb1wiXSwgaW5wdXRbdHlwZT1cInJhZGlvXCJdJykpIHtcclxuICAgICAgICBhd2FpdCBzZXRSYWRpb0J1dHRvblZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoYElucHV0IG5vdCBmb3VuZCBpbjogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBGb2N1cyB0aGUgaW5wdXQgZmlyc3RcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG5cclxuICAgIGlmIChpbnB1dC50YWdOYW1lICE9PSAnU0VMRUNUJykge1xyXG4gICAgICAgIC8vIFVzZSB0aGUgc2VsZWN0ZWQgY29tYm9ib3ggaW5wdXQgbWV0aG9kXHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNDAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEdyaWRDZWxsVmFsdWUoY29udHJvbE5hbWUsIHZhbHVlLCBmaWVsZFR5cGUsIHdhaXRGb3JWYWxpZGF0aW9uID0gZmFsc2UpIHtcclxuICAgIGNvbnNvbGUubG9nKGBTZXR0aW5nIGdyaWQgY2VsbCB2YWx1ZTogJHtjb250cm9sTmFtZX0gPSBcIiR7dmFsdWV9XCIgKHdhaXRGb3JWYWxpZGF0aW9uPSR7d2FpdEZvclZhbGlkYXRpb259KWApO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSBjZWxsIGVsZW1lbnQgLSBwcmVmZXIgdGhlIG9uZSBpbiBhbiBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICBsZXQgZWxlbWVudCA9IGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpO1xyXG4gICAgXHJcbiAgICBpZiAoIWVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgY2xpY2tpbmcgb24gdGhlIGdyaWQgcm93IGZpcnN0IHRvIGFjdGl2YXRlIGl0XHJcbiAgICAgICAgYXdhaXQgYWN0aXZhdGVHcmlkUm93KGNvbnRyb2xOYW1lKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIGVsZW1lbnQgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHcmlkIGNlbGwgZWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcywgd2UgbmVlZCB0byBjbGljayBvbiB0aGUgY2VsbCB0byBlbnRlciBlZGl0IG1vZGVcclxuICAgIC8vIEZpbmQgdGhlIGFjdHVhbCBjZWxsIGNvbnRhaW5lciAoZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4pXHJcbiAgICBjb25zdCByZWFjdENlbGwgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpIHx8IGVsZW1lbnQ7XHJcbiAgICBjb25zdCBpc1JlYWN0R3JpZCA9ICEhZWxlbWVudC5jbG9zZXN0KCcucmVhY3RHcmlkJyk7XHJcbiAgICBcclxuICAgIC8vIENsaWNrIG9uIHRoZSBjZWxsIHRvIGFjdGl2YXRlIGl0IGZvciBlZGl0aW5nXHJcbiAgICBjb25zb2xlLmxvZyhgICBDbGlja2luZyBjZWxsIHRvIGFjdGl2YXRlOiBpc1JlYWN0R3JpZD0ke2lzUmVhY3RHcmlkfWApO1xyXG4gICAgcmVhY3RDZWxsLmNsaWNrKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBGb3IgUmVhY3QgZ3JpZHMsIEQzNjUgcmVuZGVycyBpbnB1dCBmaWVsZHMgZHluYW1pY2FsbHkgYWZ0ZXIgY2xpY2tpbmdcclxuICAgIC8vIFdlIG5lZWQgdG8gcmUtZmluZCB0aGUgZWxlbWVudCBhZnRlciBjbGlja2luZyBhcyBEMzY1IG1heSBoYXZlIHJlcGxhY2VkIHRoZSBET01cclxuICAgIGlmIChpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7IC8vIEV4dHJhIHdhaXQgZm9yIFJlYWN0IHRvIHJlbmRlciBpbnB1dFxyXG4gICAgICAgIGVsZW1lbnQgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgICAgICBpZiAoIWVsZW1lbnQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHcmlkIGNlbGwgZWxlbWVudCBub3QgZm91bmQgYWZ0ZXIgY2xpY2s6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUaGUgY2xpY2sgc2hvdWxkIGFjdGl2YXRlIHRoZSBjZWxsIC0gbm93IGZpbmQgdGhlIGlucHV0XHJcbiAgICBsZXQgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgIFxyXG4gICAgLy8gSWYgbm8gaW5wdXQgZm91bmQgZGlyZWN0bHksIGxvb2sgaW4gdGhlIGNlbGwgY29udGFpbmVyXHJcbiAgICBpZiAoIWlucHV0ICYmIGlzUmVhY3RHcmlkKSB7XHJcbiAgICAgICAgY29uc3QgY2VsbENvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJyk7XHJcbiAgICAgICAgaWYgKGNlbGxDb250YWluZXIpIHtcclxuICAgICAgICAgICAgaW5wdXQgPSBjZWxsQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGlucHV0IGZvdW5kIGRpcmVjdGx5LCB0cnkgZ2V0dGluZyBpdCBhZnRlciBjbGljayBhY3RpdmF0aW9uIHdpdGggcmV0cnlcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDU7IGF0dGVtcHQrKykge1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgICAgICAgICBpZiAoaW5wdXQgJiYgaW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEFsc28gY2hlY2sgaWYgYSBuZXcgaW5wdXQgYXBwZWFyZWQgaW4gdGhlIGNlbGxcclxuICAgICAgICAgICAgY29uc3QgY2VsbENvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJyk7XHJcbiAgICAgICAgICAgIGlmIChjZWxsQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dCA9IGNlbGxDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGlucHV0ICYmIGlucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0aWxsIG5vIGlucHV0PyBDaGVjayBpZiB0aGUgZWxlbWVudCBpdHNlbGYgaXMgYW4gaW5wdXRcclxuICAgIGlmICghaW5wdXQgJiYgKGVsZW1lbnQudGFnTmFtZSA9PT0gJ0lOUFVUJyB8fCBlbGVtZW50LnRhZ05hbWUgPT09ICdURVhUQVJFQScgfHwgZWxlbWVudC50YWdOYW1lID09PSAnU0VMRUNUJykpIHtcclxuICAgICAgICBpbnB1dCA9IGVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSB0byBmaW5kIGlucHV0IGluIHRoZSBwYXJlbnQgcm93XHJcbiAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgY29uc3Qgcm93ID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbiwgW2RhdGEtZHluLXJvbGU9XCJSb3dcIl0sIFtyb2xlPVwicm93XCJdLCB0cicpO1xyXG4gICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9zc2libGVJbnB1dHMgPSByb3cucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl0gaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl0gdGV4dGFyZWFgKTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBpbnAgb2YgcG9zc2libGVJbnB1dHMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChpbnAub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5wdXQgPSBpbnA7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIExhc3QgcmVzb3J0OiBmaW5kIGFueSB2aXNpYmxlIGlucHV0IGluIHRoZSBhY3RpdmUgY2VsbCBhcmVhXHJcbiAgICBpZiAoIWlucHV0ICYmIGlzUmVhY3RHcmlkKSB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlQ2VsbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5keW4tYWN0aXZlUm93Q2VsbCwgLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluOmZvY3VzLXdpdGhpbicpO1xyXG4gICAgICAgIGlmIChhY3RpdmVDZWxsKSB7XHJcbiAgICAgICAgICAgIGlucHV0ID0gYWN0aXZlQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgLy8gTG9nIGF2YWlsYWJsZSBlbGVtZW50cyBmb3IgZGVidWdnaW5nXHJcbiAgICAgICAgY29uc3QgZ3JpZENvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLnJlYWN0R3JpZCwgW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJyk7XHJcbiAgICAgICAgY29uc3QgYWxsSW5wdXRzID0gZ3JpZENvbnRhaW5lcj8ucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdBdmFpbGFibGUgaW5wdXRzIGluIGdyaWQ6JywgQXJyYXkuZnJvbShhbGxJbnB1dHMgfHwgW10pLm1hcChpID0+ICh7XHJcbiAgICAgICAgICAgIG5hbWU6IGkuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXHJcbiAgICAgICAgICAgIHZpc2libGU6IGkub2Zmc2V0UGFyZW50ICE9PSBudWxsXHJcbiAgICAgICAgfSkpKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYElucHV0IG5vdCBmb3VuZCBpbiBncmlkIGNlbGw6ICR7Y29udHJvbE5hbWV9LiBUaGUgY2VsbCBtYXkgbmVlZCB0byBiZSBjbGlja2VkIHRvIGJlY29tZSBlZGl0YWJsZS5gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGZpZWxkIHR5cGUgYW5kIHVzZSBhcHByb3ByaWF0ZSBzZXR0ZXJcclxuICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgXHJcbiAgICBpZiAoZmllbGRUeXBlPy50eXBlID09PSAnc2VnbWVudGVkLWxvb2t1cCcgfHwgcm9sZSA9PT0gJ1NlZ21lbnRlZEVudHJ5JyB8fCBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZmllbGRUeXBlPy5pbnB1dFR5cGUgPT09ICdlbnVtJyB8fCByb2xlID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBmb3IgbG9va3VwIGZpZWxkc1xyXG4gICAgaWYgKHJvbGUgPT09ICdMb29rdXAnIHx8IHJvbGUgPT09ICdSZWZlcmVuY2VHcm91cCcgfHwgaGFzTG9va3VwQnV0dG9uKGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0TG9va3VwU2VsZWN0VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0YW5kYXJkIGlucHV0IC0gZm9jdXMgYW5kIHNldCB2YWx1ZVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlXHJcbiAgICBpbnB1dC5zZWxlY3Q/LigpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgXHJcbiAgICAvLyBVc2UgdGhlIHN0YW5kYXJkIGlucHV0IG1ldGhvZFxyXG4gICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUpO1xyXG4gICAgXHJcbiAgICAvLyBEaXNwYXRjaCBldmVudHNcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBcclxuICAgIC8vIEZvciBncmlkIGNlbGxzLCB3ZSBuZWVkIHRvIHByb3Blcmx5IGNvbW1pdCB0aGUgdmFsdWVcclxuICAgIC8vIEQzNjUgUmVhY3QgZ3JpZHMgcmVxdWlyZSB0aGUgY2VsbCB0byBsb3NlIGZvY3VzIGZvciB2YWxpZGF0aW9uIHRvIG9jY3VyXHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAxOiBQcmVzcyBFbnRlciB0byBjb25maXJtIHRoZSB2YWx1ZSAoaW1wb3J0YW50IGZvciBsb29rdXAgZmllbGRzIGxpa2UgSXRlbUlkKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBrZXlDb2RlOiAxMywgd2hpY2g6IDEzLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGtleUNvZGU6IDEzLCB3aGljaDogMTMsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gTWV0aG9kIDI6IFRhYiBvdXQgdG8gbW92ZSB0byBuZXh0IGNlbGwgKHRyaWdnZXJzIGJsdXIgYW5kIHZhbGlkYXRpb24pXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywga2V5Q29kZTogOSwgd2hpY2g6IDksIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBrZXlDb2RlOiA5LCB3aGljaDogOSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgXHJcbiAgICAvLyBNZXRob2QgMzogRGlzcGF0Y2ggYmx1ciBldmVudCBleHBsaWNpdGx5XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBGb2N1c0V2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlLCByZWxhdGVkVGFyZ2V0OiBudWxsIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCA0OiBDbGljayBvdXRzaWRlIHRoZSBjZWxsIHRvIGVuc3VyZSBmb2N1cyBpcyBsb3N0XHJcbiAgICAvLyBGaW5kIGFub3RoZXIgY2VsbCBvciB0aGUgcm93IGNvbnRhaW5lciB0byBjbGlja1xyXG4gICAgY29uc3Qgcm93ID0gaW5wdXQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4sIFtkYXRhLWR5bi1yb2xlPVwiUm93XCJdJyk7XHJcbiAgICBpZiAocm93KSB7XHJcbiAgICAgICAgY29uc3Qgb3RoZXJDZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbjpub3QoOmZvY3VzLXdpdGhpbiknKTtcclxuICAgICAgICBpZiAob3RoZXJDZWxsICYmIG90aGVyQ2VsbCAhPT0gaW5wdXQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJykpIHtcclxuICAgICAgICAgICAgb3RoZXJDZWxsLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBXYWl0IGZvciBEMzY1IHRvIHByb2Nlc3MvdmFsaWRhdGUgdGhlIHZhbHVlIChzZXJ2ZXItc2lkZSBsb29rdXAgZm9yIEl0ZW1JZCwgZXRjLilcclxuICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICBcclxuICAgIC8vIElmIHdhaXRGb3JWYWxpZGF0aW9uIGlzIGVuYWJsZWQsIHdhaXQgZm9yIEQzNjUgdG8gY29tcGxldGUgdGhlIGxvb2t1cCB2YWxpZGF0aW9uXHJcbiAgICAvLyBUaGlzIGlzIGltcG9ydGFudCBmb3IgZmllbGRzIGxpa2UgSXRlbUlkIHRoYXQgdHJpZ2dlciBzZXJ2ZXItc2lkZSB2YWxpZGF0aW9uXHJcbiAgICBpZiAod2FpdEZvclZhbGlkYXRpb24pIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBXYWl0aW5nIGZvciBEMzY1IHZhbGlkYXRpb24gb2YgJHtjb250cm9sTmFtZX0uLi5gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBXYWl0IGZvciBhbnkgbG9hZGluZyBpbmRpY2F0b3JzIHRvIGFwcGVhciBhbmQgZGlzYXBwZWFyXHJcbiAgICAgICAgLy8gRDM2NSBzaG93cyBhIGxvYWRpbmcgc3Bpbm5lciBkdXJpbmcgc2VydmVyLXNpZGUgbG9va3Vwc1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JEMzY1VmFsaWRhdGlvbihjb250cm9sTmFtZSwgNTAwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGAgIEdyaWQgY2VsbCB2YWx1ZSBzZXQ6ICR7Y29udHJvbE5hbWV9ID0gXCIke3ZhbHVlfVwiYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yRDM2NVZhbGlkYXRpb24oY29udHJvbE5hbWUsIHRpbWVvdXQgPSA1MDAwKSB7XHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgbGV0IGxhc3RMb2FkaW5nU3RhdGUgPSBmYWxzZTtcclxuICAgIGxldCBzZWVuTG9hZGluZyA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IHRpbWVvdXQpIHtcclxuICAgICAgICAvLyBDaGVjayBmb3IgRDM2NSBsb2FkaW5nIGluZGljYXRvcnNcclxuICAgICAgICBjb25zdCBpc0xvYWRpbmcgPSBpc0QzNjVMb2FkaW5nKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzTG9hZGluZyAmJiAhbGFzdExvYWRpbmdTdGF0ZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnICAgIEQzNjUgdmFsaWRhdGlvbiBzdGFydGVkIChsb2FkaW5nIGluZGljYXRvciBhcHBlYXJlZCknKTtcclxuICAgICAgICAgICAgc2VlbkxvYWRpbmcgPSB0cnVlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoIWlzTG9hZGluZyAmJiBsYXN0TG9hZGluZ1N0YXRlICYmIHNlZW5Mb2FkaW5nKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCcgICAgRDM2NSB2YWxpZGF0aW9uIGNvbXBsZXRlZCAobG9hZGluZyBpbmRpY2F0b3IgZ29uZSknKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTsgLy8gRXh0cmEgYnVmZmVyIGFmdGVyIGxvYWRpbmcgY29tcGxldGVzXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsYXN0TG9hZGluZ1N0YXRlID0gaXNMb2FkaW5nO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFsc28gY2hlY2sgaWYgdGhlIGNlbGwgbm93IHNob3dzIHZhbGlkYXRlZCBjb250ZW50IChlLmcuLCBwcm9kdWN0IG5hbWUgYXBwZWFyZWQpXHJcbiAgICAgICAgLy8gRm9yIEl0ZW1JZCwgRDM2NSBzaG93cyB0aGUgaXRlbSBudW1iZXIgYW5kIG5hbWUgYWZ0ZXIgdmFsaWRhdGlvblxyXG4gICAgICAgIGNvbnN0IGNlbGwgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsVGV4dCA9IGNlbGwudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhc011bHRpcGxlVmFsdWVzID0gY2VsbFRleHQuc3BsaXQoL1xcc3syLH18XFxuLykuZmlsdGVyKHQgPT4gdC50cmltKCkpLmxlbmd0aCA+IDE7XHJcbiAgICAgICAgICAgIGlmIChoYXNNdWx0aXBsZVZhbHVlcykge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJyAgICBEMzY1IHZhbGlkYXRpb24gY29tcGxldGVkIChjZWxsIGNvbnRlbnQgdXBkYXRlZCknKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBJZiB3ZSBzYXcgbG9hZGluZyBhdCBzb21lIHBvaW50LCB3YWl0IGEgYml0IG1vcmUgYWZ0ZXIgdGltZW91dFxyXG4gICAgaWYgKHNlZW5Mb2FkaW5nKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJyAgICBWYWxpZGF0aW9uIHRpbWVvdXQgcmVhY2hlZCwgYnV0IHNhdyBsb2FkaW5nIC0gd2FpdGluZyBleHRyYSB0aW1lJyk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJyAgICBWYWxpZGF0aW9uIHdhaXQgY29tcGxldGVkICh0aW1lb3V0IG9yIG5vIGxvYWRpbmcgZGV0ZWN0ZWQpJyk7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZUdyaWRSb3coY29udHJvbE5hbWUpIHtcclxuICAgIC8vIFRyeSBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcyBmaXJzdFxyXG4gICAgY29uc3QgcmVhY3RHcmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgY29uc3QgYm9keUNvbnRhaW5lciA9IGdyaWQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHksIC5maXhlZERhdGFUYWJsZUxheW91dF9yb3dzQ29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGJvZHlDb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGNlbGwpIHtcclxuICAgICAgICAgICAgICAgIC8vIEZpbmQgdGhlIHJvdyBjb250YWluaW5nIHRoaXMgY2VsbFxyXG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gY2VsbC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbicpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJvdykge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENsaWNrIG9uIHRoZSByb3cgdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgICAgICAgICAgcm93LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHNcclxuICAgIGNvbnN0IGdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgZ3JpZHMpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBjZWxsXHJcbiAgICAgICAgY29uc3QgY2VsbCA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICAvLyBGaW5kIHRoZSByb3cgY29udGFpbmluZyB0aGlzIGNlbGxcclxuICAgICAgICAgICAgY29uc3Qgcm93ID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIlJvd1wiXSwgW3JvbGU9XCJyb3dcIl0sIHRyJyk7XHJcbiAgICAgICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgICAgIC8vIENsaWNrIG9uIHRoZSByb3cgdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgICAgICByb3cuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldExvb2t1cFNlbGVjdFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gbG9va3VwIGZpZWxkJyk7XHJcblxyXG4gICAgY29uc3QgbG9va3VwQnV0dG9uID0gZmluZExvb2t1cEJ1dHRvbihlbGVtZW50KTtcclxuICAgIGlmIChsb29rdXBCdXR0b24pIHtcclxuICAgICAgICBsb29rdXBCdXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBUcnkgdG8gb3BlbiBieSBmb2N1c2luZyBhbmQga2V5Ym9hcmRcclxuICAgICAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGxvb2t1cERvY2sgPSBhd2FpdCB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQoZWxlbWVudCk7XHJcbiAgICBpZiAoIWxvb2t1cERvY2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xvb2t1cCBmbHlvdXQgbm90IGZvdW5kJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJ5IHR5cGluZyBpbnRvIGEgbG9va3VwIGZseW91dCBpbnB1dCBpZiBwcmVzZW50IChlLmcuLCBNYWluQWNjb3VudClcclxuICAgIGNvbnN0IGRvY2tJbnB1dCA9IGZpbmRMb29rdXBGaWx0ZXJJbnB1dChsb29rdXBEb2NrKTtcclxuICAgIGlmIChkb2NrSW5wdXQpIHtcclxuICAgICAgICBkb2NrSW5wdXQuY2xpY2soKTtcclxuICAgICAgICBkb2NrSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChkb2NrSW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNjAwKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb3dzID0gYXdhaXQgd2FpdEZvckxvb2t1cFJvd3MobG9va3VwRG9jaywgZWxlbWVudCk7XHJcbiAgICBpZiAoIXJvd3MubGVuZ3RoKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29rdXAgbGlzdCBpcyBlbXB0eScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNlYXJjaFZhbHVlID0gU3RyaW5nKHZhbHVlID8/ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgbGV0IG1hdGNoZWQgPSBmYWxzZTtcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm93LnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBjb25zdCBmaXJzdENlbGwgPSByb3cucXVlcnlTZWxlY3RvcignW3JvbGU9XCJncmlkY2VsbFwiXSwgdGQnKTtcclxuICAgICAgICBjb25zdCBmaXJzdFRleHQgPSBmaXJzdENlbGwgPyBmaXJzdENlbGwudGV4dENvbnRlbnQudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiAnJztcclxuICAgICAgICBpZiAoZmlyc3RUZXh0ID09PSBzZWFyY2hWYWx1ZSB8fCB0ZXh0LmluY2x1ZGVzKHNlYXJjaFZhbHVlKSkge1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaXJzdENlbGwgfHwgcm93O1xyXG4gICAgICAgICAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICB0YXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgICAgIC8vIFNvbWUgRDM2NSBsb29rdXBzIHJlcXVpcmUgRW50ZXIgb3IgZG91YmxlLWNsaWNrIHRvIGNvbW1pdCBzZWxlY3Rpb25cclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2RibGNsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIGlmICghYXBwbGllZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IGEgc2Vjb25kIGNvbW1pdCBwYXNzIGlmIHRoZSB2YWx1ZSBkaWQgbm90IHN0aWNrXHJcbiAgICAgICAgICAgICAgICB0YXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghbWF0Y2hlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTG9va3VwIHZhbHVlIG5vdCBmb3VuZDogJHt2YWx1ZX1gKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldENoZWNrYm94VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIC8vIEQzNjUgY2hlY2tib3hlcyBjYW4gYmU6XHJcbiAgICAvLyAxLiBTdGFuZGFyZCBpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl1cclxuICAgIC8vIDIuIEN1c3RvbSB0b2dnbGUgd2l0aCByb2xlPVwiY2hlY2tib3hcIiBvciByb2xlPVwic3dpdGNoXCJcclxuICAgIC8vIDMuIEVsZW1lbnQgd2l0aCBhcmlhLWNoZWNrZWQgYXR0cmlidXRlICh0aGUgY29udGFpbmVyIGl0c2VsZilcclxuICAgIC8vIDQuIEVsZW1lbnQgd2l0aCBkYXRhLWR5bi1yb2xlPVwiQ2hlY2tCb3hcIlxyXG4gICAgXHJcbiAgICBsZXQgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpO1xyXG4gICAgbGV0IGlzQ3VzdG9tVG9nZ2xlID0gZmFsc2U7XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHtcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCBjdXN0b20gdG9nZ2xlIGVsZW1lbnRcclxuICAgICAgICBjaGVja2JveCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXSwgW3JvbGU9XCJzd2l0Y2hcIl0nKTtcclxuICAgICAgICBpZiAoY2hlY2tib3gpIHtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkge1xyXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBlbGVtZW50IGl0c2VsZiBpcyB0aGUgdG9nZ2xlIChEMzY1IG9mdGVuIGRvZXMgdGhpcylcclxuICAgICAgICBpZiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpICE9PSBudWxsIHx8IFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnY2hlY2tib3gnIHx8XHJcbiAgICAgICAgICAgIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdyb2xlJykgPT09ICdzd2l0Y2gnIHx8XHJcbiAgICAgICAgICAgIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdDaGVja0JveCcpIHtcclxuICAgICAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50O1xyXG4gICAgICAgICAgICBpc0N1c3RvbVRvZ2dsZSA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB7XHJcbiAgICAgICAgLy8gTGFzdCByZXNvcnQ6IGZpbmQgYW55IGNsaWNrYWJsZSB0b2dnbGUtbGlrZSBlbGVtZW50XHJcbiAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgW3RhYmluZGV4PVwiMFwiXScpO1xyXG4gICAgICAgIGlmIChjaGVja2JveCkge1xyXG4gICAgICAgICAgICBpc0N1c3RvbVRvZ2dsZSA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB0aHJvdyBuZXcgRXJyb3IoYENoZWNrYm94IG5vdCBmb3VuZCBpbjogJHtjb250cm9sTmFtZX0uIEVsZW1lbnQgSFRNTDogJHtlbGVtZW50Lm91dGVySFRNTC5zdWJzdHJpbmcoMCwgMjAwKX1gKTtcclxuXHJcbiAgICBjb25zdCBzaG91bGRDaGVjayA9IGNvZXJjZUJvb2xlYW4odmFsdWUpO1xyXG4gICAgXHJcbiAgICAvLyBEZXRlcm1pbmUgY3VycmVudCBzdGF0ZVxyXG4gICAgbGV0IGlzQ3VycmVudGx5Q2hlY2tlZDtcclxuICAgIGlmIChpc0N1c3RvbVRvZ2dsZSkge1xyXG4gICAgICAgIGlzQ3VycmVudGx5Q2hlY2tlZCA9IGNoZWNrYm94LmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJyB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LmNsYXNzTGlzdC5jb250YWlucygnY2hlY2tlZCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5jbGFzc0xpc3QuY29udGFpbnMoJ29uJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LmdldEF0dHJpYnV0ZSgnZGF0YS1jaGVja2VkJykgPT09ICd0cnVlJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaXNDdXJyZW50bHlDaGVja2VkID0gY2hlY2tib3guY2hlY2tlZDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBPbmx5IGNsaWNrIGlmIHN0YXRlIG5lZWRzIHRvIGNoYW5nZVxyXG4gICAgaWYgKHNob3VsZENoZWNrICE9PSBpc0N1cnJlbnRseUNoZWNrZWQpIHtcclxuICAgICAgICBjaGVja2JveC5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRm9yIGN1c3RvbSB0b2dnbGVzLCBhbHNvIHRyeSBkaXNwYXRjaGluZyBldmVudHMgaWYgY2xpY2sgZGlkbid0IHdvcmtcclxuICAgICAgICBpZiAoaXNDdXN0b21Ub2dnbGUpIHtcclxuICAgICAgICAgICAgY2hlY2tib3guZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgY2hlY2tib3guZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAvLyBUcnkgQWx0K0Rvd24gdGhlbiBGNCAoY29tbW9uIEQzNjUvV2luIGNvbnRyb2xzKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGFsdEtleTogdHJ1ZSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGFsdEtleTogdHJ1ZSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRjQnLCBjb2RlOiAnRjQnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdGNCcsIGNvZGU6ICdGNCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KSB7XHJcbiAgICAvLyBEMzY1IHNlZ21lbnRlZCBsb29rdXBzIG9mdGVuIHZhbGlkYXRlIG9uIFRhYi9FbnRlciBhbmQgYmx1clxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoODAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsb3NlRGlhbG9nKGZvcm1OYW1lLCBhY3Rpb24gPSAnb2snKSB7XHJcbiAgICBjb25zdCBmb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWZvcm0tbmFtZT1cIiR7Zm9ybU5hbWV9XCJdYCk7XHJcbiAgICBpZiAoIWZvcm0pIHtcclxuICAgICAgICBsb2dTdGVwKGBXYXJuaW5nOiBGb3JtICR7Zm9ybU5hbWV9IG5vdCBmb3VuZCB0byBjbG9zZWApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbGV0IGJ1dHRvbk5hbWU7XHJcbiAgICBpZiAoZm9ybU5hbWUgPT09ICdTeXNSZWN1cnJlbmNlJykge1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnQ29tbWFuZEJ1dHRvbk9rJyA6ICdDb21tYW5kQnV0dG9uQ2FuY2VsJztcclxuICAgIH0gZWxzZSBpZiAoZm9ybU5hbWUgPT09ICdTeXNRdWVyeUZvcm0nKSB7XHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdPa0J1dHRvbicgOiAnQ2FuY2VsQnV0dG9uJztcclxuICAgIH0gZWxzZSBpZiAoZm9ybU5hbWUgPT09ICdTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm0nKSB7XHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdDb21tYW5kQnV0dG9uJyA6ICdDb21tYW5kQnV0dG9uQ2FuY2VsJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IGdlbmVyaWMgbmFtZXNcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ0NvbW1hbmRCdXR0b24nIDogJ0NvbW1hbmRCdXR0b25DYW5jZWwnO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBidXR0b24gPSBmb3JtLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7YnV0dG9uTmFtZX1cIl1gKTtcclxuICAgIGlmIChidXR0b24pIHtcclxuICAgICAgICBidXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgIGxvZ1N0ZXAoYERpYWxvZyAke2Zvcm1OYW1lfSBjbG9zZWQgd2l0aCAke2FjdGlvbi50b1VwcGVyQ2FzZSgpfWApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKGBXYXJuaW5nOiAke2FjdGlvbi50b1VwcGVyQ2FzZSgpfSBidXR0b24gbm90IGZvdW5kIGluICR7Zm9ybU5hbWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBuYXZpZ2F0ZVRvRm9ybShzdGVwKSB7XG4gICAgY29uc3QgeyBuYXZpZ2F0ZU1ldGhvZCwgbWVudUl0ZW1OYW1lLCBtZW51SXRlbVR5cGUsIG5hdmlnYXRlVXJsLCB3YWl0Rm9yTG9hZCB9ID0gc3RlcDtcbiAgICBcclxuICAgIGxvZ1N0ZXAoYE5hdmlnYXRpbmcgdG8gZm9ybTogJHttZW51SXRlbU5hbWUgfHwgbmF2aWdhdGVVcmx9YCk7XHJcbiAgICBcclxuICAgIGxldCB0YXJnZXRVcmw7XHJcbiAgICBjb25zdCBiYXNlVXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZTtcclxuICAgIFxyXG4gICAgaWYgKG5hdmlnYXRlTWV0aG9kID09PSAndXJsJyAmJiBuYXZpZ2F0ZVVybCkge1xyXG4gICAgICAgIC8vIFVzZSBmdWxsIFVSTCBwYXRoIHByb3ZpZGVkXHJcbiAgICAgICAgdGFyZ2V0VXJsID0gbmF2aWdhdGVVcmwuc3RhcnRzV2l0aCgnaHR0cCcpID8gbmF2aWdhdGVVcmwgOiBiYXNlVXJsICsgbmF2aWdhdGVVcmw7XHJcbiAgICB9IGVsc2UgaWYgKG1lbnVJdGVtTmFtZSkge1xyXG4gICAgICAgIC8vIEJ1aWxkIFVSTCBmcm9tIG1lbnUgaXRlbSBuYW1lXHJcbiAgICAgICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbiAgICAgICAgcGFyYW1zLmRlbGV0ZSgncScpO1xuICAgICAgICBjb25zdCB0eXBlUHJlZml4ID0gKG1lbnVJdGVtVHlwZSAmJiBtZW51SXRlbVR5cGUgIT09ICdEaXNwbGF5JykgPyBgJHttZW51SXRlbVR5cGV9OmAgOiAnJztcbiAgICAgICAgcGFyYW1zLnNldCgnbWknLCBgJHt0eXBlUHJlZml4fSR7bWVudUl0ZW1OYW1lfWApO1xuXG4gICAgICAgIHRhcmdldFVybCA9IGJhc2VVcmwgKyAnPycgKyBwYXJhbXMudG9TdHJpbmcoKTtcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTmF2aWdhdGUgc3RlcCByZXF1aXJlcyBlaXRoZXIgbWVudUl0ZW1OYW1lIG9yIG5hdmlnYXRlVXJsJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYE5hdmlnYXRpbmcgdG86ICR7dGFyZ2V0VXJsfWApO1xyXG5cclxuICAgIC8vIFNhdmUgcGVuZGluZyB3b3JrZmxvdyBzdGF0ZSBkaXJlY3RseSBpbiBzZXNzaW9uU3RvcmFnZSBiZWZvcmUgbmF2aWdhdGlvblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHRhcmdldFVybCk7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0TWVudUl0ZW1OYW1lID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ21pJykgfHwgJyc7XHJcbiAgICAgICAgY29uc3QgcGVuZGluZ1N0YXRlID0ge1xuICAgICAgICAgICAgd29ya2Zsb3c6IHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93IHx8IG51bGwsXG4gICAgICAgICAgICB3b3JrZmxvd0lkOiB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdz8uaWQgfHwgJycsXG4gICAgICAgICAgICBuZXh0U3RlcEluZGV4OiAod2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50U3RlcEluZGV4ID8/IDApICsgMSxcbiAgICAgICAgICAgIGN1cnJlbnRSb3dJbmRleDogd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50Um93SW5kZXggfHwgMCxcbiAgICAgICAgICAgIHRvdGFsUm93czogd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy50b3RhbFJvd3MgfHwgMCxcbiAgICAgICAgICAgIGRhdGE6IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwgbnVsbCxcclxuICAgICAgICAgICAgdGFyZ2V0TWVudUl0ZW1OYW1lOiB0YXJnZXRNZW51SXRlbU5hbWUsXHJcbiAgICAgICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwLFxyXG4gICAgICAgICAgICBzYXZlZEF0OiBEYXRlLm5vdygpXHJcbiAgICAgICAgfTtcclxuICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdkMzY1X3BlbmRpbmdfd29ya2Zsb3cnLCBKU09OLnN0cmluZ2lmeShwZW5kaW5nU3RhdGUpKTtcclxuICAgICAgICBsb2dTdGVwKCdTYXZlZCB3b3JrZmxvdyBzdGF0ZSBmb3IgbmF2aWdhdGlvbicpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUud2FybignW0QzNjVdIEZhaWxlZCB0byBzYXZlIHdvcmtmbG93IHN0YXRlIGluIHNlc3Npb25TdG9yYWdlOicsIGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTaWduYWwgbmF2aWdhdGlvbiBpcyBhYm91dCB0byBoYXBwZW4gLSB3b3JrZmxvdyBzdGF0ZSB3aWxsIGJlIHNhdmVkIGJ5IHRoZSBleHRlbnNpb25cclxuICAgIC8vIFdlIG5lZWQgdG8gd2FpdCBmb3IgdGhlIHN0YXRlIHRvIGJlIHNhdmVkIGJlZm9yZSBuYXZpZ2F0aW5nXHJcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX05BVklHQVRJTkcnLFxyXG4gICAgICAgIHRhcmdldFVybDogdGFyZ2V0VXJsLFxyXG4gICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwXHJcbiAgICB9LCAnKicpO1xyXG4gICAgXHJcbiAgICAvLyBXYWl0IGxvbmdlciB0byBlbnN1cmUgdGhlIGZ1bGwgY2hhaW4gY29tcGxldGVzOlxyXG4gICAgLy8gcG9zdE1lc3NhZ2UgLT4gY29udGVudC5qcyAtPiBiYWNrZ3JvdW5kLmpzIC0+IHBvcHVwIC0+IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdFxyXG4gICAgLy8gVGhpcyBjaGFpbiBpbnZvbHZlcyBtdWx0aXBsZSBhc3luYyBob3BzLCBzbyB3ZSBuZWVkIHN1ZmZpY2llbnQgdGltZVxyXG4gICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIFxyXG4gICAgLy8gTmF2aWdhdGUgLSB0aGlzIHdpbGwgY2F1c2UgcGFnZSByZWxvYWQsIHNjcmlwdCBjb250ZXh0IHdpbGwgYmUgbG9zdFxyXG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0YXJnZXRVcmw7XHJcbiAgICBcclxuICAgIC8vIFRoaXMgY29kZSB3b24ndCBleGVjdXRlIGR1ZSB0byBwYWdlIG5hdmlnYXRpb24sIGJ1dCBrZWVwIGl0IGZvciByZWZlcmVuY2VcclxuICAgIC8vIFRoZSB3b3JrZmxvdyB3aWxsIGJlIHJlc3VtZWQgYnkgdGhlIGNvbnRlbnQgc2NyaXB0IGFmdGVyIHBhZ2UgbG9hZFxyXG4gICAgYXdhaXQgc2xlZXAod2FpdEZvckxvYWQgfHwgMzAwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZVRhYihjb250cm9sTmFtZSkge1xyXG4gICAgbG9nU3RlcChgQWN0aXZhdGluZyB0YWI6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIHRhYiBlbGVtZW50IC0gY291bGQgYmUgdGhlIHRhYiBjb250ZW50IG9yIHRoZSB0YWIgYnV0dG9uIGl0c2VsZlxyXG4gICAgbGV0IHRhYkVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vdCBmb3VuZCBkaXJlY3RseSwgdHJ5IGZpbmRpbmcgYnkgbG9va2luZyBmb3IgdGFiIGhlYWRlcnMvbGlua3NcclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIHRoZSB0YWIgbGluay9idXR0b24gdGhhdCByZWZlcmVuY2VzIHRoaXMgdGFiXHJcbiAgICAgICAgdGFiRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9X2hlYWRlclwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdIFtyb2xlPVwidGFiXCJdYCkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2FyaWEtY29udHJvbHM9XCIke2NvbnRyb2xOYW1lfVwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGFbaHJlZio9XCIke2NvbnRyb2xOYW1lfVwiXSwgYnV0dG9uW2RhdGEtdGFyZ2V0Kj1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVGFiIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgRDM2NSBwYXJhbWV0ZXIgZm9ybXMgd2l0aCB2ZXJ0aWNhbCB0YWJzLCB0aGUgY2xpY2thYmxlIGVsZW1lbnQgc3RydWN0dXJlIHZhcmllc1xyXG4gICAgLy8gVHJ5IG11bHRpcGxlIGFwcHJvYWNoZXMgdG8gZmluZCBhbmQgY2xpY2sgdGhlIHJpZ2h0IGVsZW1lbnRcclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMTogTG9vayBmb3IgdGhlIHRhYiBsaW5rIGluc2lkZSBhIHBpdm90L3RhYiBzdHJ1Y3R1cmVcclxuICAgIGxldCBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3RvcignLnBpdm90LWxpbmssIC50YWItbGluaywgW3JvbGU9XCJ0YWJcIl0nKTtcclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMjogVGhlIGVsZW1lbnQgaXRzZWxmIG1pZ2h0IGJlIHRoZSBsaW5rXHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0ICYmICh0YWJFbGVtZW50LnRhZ05hbWUgPT09ICdBJyB8fCB0YWJFbGVtZW50LnRhZ05hbWUgPT09ICdCVVRUT04nIHx8IHRhYkVsZW1lbnQuZ2V0QXR0cmlidXRlKCdyb2xlJykgPT09ICd0YWInKSkge1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMzogRm9yIHZlcnRpY2FsIHRhYnMsIGxvb2sgZm9yIHRoZSBhbmNob3Igb3IgbGluayBlbGVtZW50XHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2EsIGJ1dHRvbicpIHx8IHRhYkVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDQ6IEZvciBQaXZvdEl0ZW0sIGZpbmQgdGhlIGhlYWRlciBlbGVtZW50XHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0IHx8IGNsaWNrVGFyZ2V0ID09PSB0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGNvbnRyb2xOYW1lICsgJ19oZWFkZXInO1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtoZWFkZXJOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXJFbCkge1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlckVsLnF1ZXJ5U2VsZWN0b3IoJ2EsIGJ1dHRvbiwgLnBpdm90LWxpbmsnKSB8fCBoZWFkZXJFbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYENsaWNraW5nIHRhYiBlbGVtZW50OiAke2NsaWNrVGFyZ2V0Py50YWdOYW1lIHx8ICd1bmtub3duJ31gKTtcclxuICAgIFxyXG4gICAgLy8gRm9jdXMgYW5kIGNsaWNrXHJcbiAgICBpZiAoY2xpY2tUYXJnZXQuZm9jdXMpIGNsaWNrVGFyZ2V0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgXHJcbiAgICAvLyBEaXNwYXRjaCBmdWxsIGNsaWNrIHNlcXVlbmNlXHJcbiAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XHJcbiAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XHJcbiAgICBcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIEFsc28gdHJ5IHRyaWdnZXJpbmcgdGhlIEQzNjUgaW50ZXJuYWwgY29udHJvbFxyXG4gICAgaWYgKHR5cGVvZiAkZHluICE9PSAndW5kZWZpbmVkJyAmJiAkZHluLmNvbnRyb2xzKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbCA9ICRkeW4uY29udHJvbHNbY29udHJvbE5hbWVdO1xyXG4gICAgICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb250cm9sLkFjdGl2YXRlVGFiID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5BY3RpdmF0ZVRhYih0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgQWN0aXZhdGVUYWIgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuYWN0aXZhdGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLmFjdGl2YXRlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIGFjdGl2YXRlIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLnNlbGVjdCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuc2VsZWN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIHNlbGVjdCBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBsb2dTdGVwKGBEMzY1IGNvbnRyb2wgbWV0aG9kIGZhaWxlZDogJHtlLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBXYWl0IGZvciB0YWIgY29udGVudCB0byBsb2FkXHJcbiAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgdGhlIHRhYiBpcyBub3cgYWN0aXZlIGJ5IGNoZWNraW5nIGZvciB2aXNpYmxlIGNvbnRlbnRcclxuICAgIGNvbnN0IHRhYkNvbnRlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgaWYgKHRhYkNvbnRlbnQpIHtcclxuICAgICAgICBjb25zdCBpc1Zpc2libGUgPSB0YWJDb250ZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbDtcclxuICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IHRhYkNvbnRlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFiQ29udGVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYkNvbnRlbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicpICE9PSAndHJ1ZSc7XHJcbiAgICAgICAgbG9nU3RlcChgVGFiICR7Y29udHJvbE5hbWV9IHZpc2liaWxpdHkgY2hlY2s6IHZpc2libGU9JHtpc1Zpc2libGV9LCBhY3RpdmU9JHtpc0FjdGl2ZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgVGFiICR7Y29udHJvbE5hbWV9IGFjdGl2YXRlZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oY29udHJvbE5hbWUsIGFjdGlvbikge1xyXG4gICAgbG9nU3RlcChgJHthY3Rpb24gPT09ICdleHBhbmQnID8gJ0V4cGFuZGluZycgOiAnQ29sbGFwc2luZyd9IHNlY3Rpb246ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHNlY3Rpb24gPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIXNlY3Rpb24pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFNlY3Rpb24gZWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEQzNjUgc2VjdGlvbnMgY2FuIGhhdmUgdmFyaW91cyBzdHJ1Y3R1cmVzLiBUaGUgdG9nZ2xlIGJ1dHRvbiBpcyB1c3VhbGx5OlxyXG4gICAgLy8gMS4gQSBidXR0b24gd2l0aCBhcmlhLWV4cGFuZGVkIGluc2lkZSB0aGUgc2VjdGlvblxyXG4gICAgLy8gMi4gQSBzZWN0aW9uIGhlYWRlciBlbGVtZW50XHJcbiAgICAvLyAzLiBUaGUgc2VjdGlvbiBpdHNlbGYgbWlnaHQgYmUgY2xpY2thYmxlXHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIHRvZ2dsZSBidXR0b24gLSB0aGlzIGlzIGNydWNpYWwgZm9yIEQzNjUgZGlhbG9nc1xyXG4gICAgbGV0IHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb24ucXVlcnlTZWxlY3RvcignYnV0dG9uW2FyaWEtZXhwYW5kZWRdJyk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vdCBmb3VuZCwgdHJ5IG90aGVyIGNvbW1vbiBwYXR0ZXJuc1xyXG4gICAgaWYgKCF0b2dnbGVCdXR0b24pIHtcclxuICAgICAgICB0b2dnbGVCdXR0b24gPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJy5zZWN0aW9uLXBhZ2UtY2FwdGlvbiwgLnNlY3Rpb24taGVhZGVyLCAuZ3JvdXAtaGVhZGVyLCBbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm0gc2VjdGlvbnMgKFJlY29yZHMgdG8gaW5jbHVkZSwgUnVuIGluIHRoZSBiYWNrZ3JvdW5kKVxyXG4gICAgLy8gdGhlIGJ1dHRvbiBpcyBvZnRlbiBhIGRpcmVjdCBjaGlsZCBvciBzaWJsaW5nXHJcbiAgICBpZiAoIXRvZ2dsZUJ1dHRvbikge1xyXG4gICAgICAgIHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb24ucXVlcnlTZWxlY3RvcignYnV0dG9uJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENoZWNrIGlmIHRoZSBzZWN0aW9uIGl0c2VsZiBoYXMgYXJpYS1leHBhbmRlZCAoaXQgbWlnaHQgYmUgdGhlIGNsaWNrYWJsZSBlbGVtZW50KVxyXG4gICAgaWYgKCF0b2dnbGVCdXR0b24gJiYgc2VjdGlvbi5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSkge1xyXG4gICAgICAgIHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb247XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIERldGVybWluZSBjdXJyZW50IHN0YXRlIGZyb20gdmFyaW91cyBzb3VyY2VzXHJcbiAgICBsZXQgaXNFeHBhbmRlZCA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayB0aGUgdG9nZ2xlIGJ1dHRvbidzIGFyaWEtZXhwYW5kZWRcclxuICAgIGlmICh0b2dnbGVCdXR0b24gJiYgdG9nZ2xlQnV0dG9uLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpKSB7XHJcbiAgICAgICAgaXNFeHBhbmRlZCA9IHRvZ2dsZUJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgfSBlbHNlIGlmIChzZWN0aW9uLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpKSB7XHJcbiAgICAgICAgaXNFeHBhbmRlZCA9IHNlY3Rpb24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gY2xhc3MtYmFzZWQgZGV0ZWN0aW9uXHJcbiAgICAgICAgaXNFeHBhbmRlZCA9IHNlY3Rpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmRlZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICFzZWN0aW9uLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYFNlY3Rpb24gJHtjb250cm9sTmFtZX0gY3VycmVudCBzdGF0ZTogJHtpc0V4cGFuZGVkID8gJ2V4cGFuZGVkJyA6ICdjb2xsYXBzZWQnfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBuZWVkc1RvZ2dsZSA9IChhY3Rpb24gPT09ICdleHBhbmQnICYmICFpc0V4cGFuZGVkKSB8fCAoYWN0aW9uID09PSAnY29sbGFwc2UnICYmIGlzRXhwYW5kZWQpO1xyXG4gICAgXHJcbiAgICBpZiAobmVlZHNUb2dnbGUpIHtcclxuICAgICAgICAvLyBDbGljayB0aGUgdG9nZ2xlIGVsZW1lbnRcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IHRvZ2dsZUJ1dHRvbiB8fCBzZWN0aW9uO1xyXG4gICAgICAgIGxvZ1N0ZXAoYENsaWNraW5nIHRvZ2dsZSBlbGVtZW50OiAke2NsaWNrVGFyZ2V0LnRhZ05hbWV9LCBjbGFzcz0ke2NsaWNrVGFyZ2V0LmNsYXNzTmFtZX1gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEaXNwYXRjaCBmdWxsIGNsaWNrIHNlcXVlbmNlIGZvciBEMzY1IFJlYWN0IGNvbXBvbmVudHNcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcnVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IEQzNjUgaW50ZXJuYWwgY29udHJvbCBBUElcclxuICAgICAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRyb2wgPSAkZHluLmNvbnRyb2xzW2NvbnRyb2xOYW1lXTtcclxuICAgICAgICAgICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ5IHZhcmlvdXMgRDM2NSBtZXRob2RzXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb250cm9sLkV4cGFuZGVkQ2hhbmdlZCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBFeHBhbmRlZENoYW5nZWQgdGFrZXMgMCBmb3IgZXhwYW5kLCAxIGZvciBjb2xsYXBzZSBpbiBEMzY1XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuRXhwYW5kZWRDaGFuZ2VkKGFjdGlvbiA9PT0gJ2NvbGxhcHNlJyA/IDEgOiAwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIEV4cGFuZGVkQ2hhbmdlZCgke2FjdGlvbiA9PT0gJ2NvbGxhcHNlJyA/IDEgOiAwfSkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLmV4cGFuZCA9PT0gJ2Z1bmN0aW9uJyAmJiBhY3Rpb24gPT09ICdleHBhbmQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuZXhwYW5kKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBleHBhbmQoKSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuY29sbGFwc2UgPT09ICdmdW5jdGlvbicgJiYgYWN0aW9uID09PSAnY29sbGFwc2UnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuY29sbGFwc2UoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIGNvbGxhcHNlKCkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLnRvZ2dsZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLnRvZ2dsZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgdG9nZ2xlKCkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYEQzNjUgY29udHJvbCBtZXRob2QgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKGBTZWN0aW9uICR7Y29udHJvbE5hbWV9IGFscmVhZHkgJHthY3Rpb259ZWQsIG5vIHRvZ2dsZSBuZWVkZWRgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSAke2FjdGlvbn1lZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlUXVlcnlGaWx0ZXIodGFibGVOYW1lLCBmaWVsZE5hbWUsIGNyaXRlcmlhVmFsdWUsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgbG9nU3RlcChgQ29uZmlndXJpbmcgcXVlcnkgZmlsdGVyOiAke3RhYmxlTmFtZSA/IHRhYmxlTmFtZSArICcuJyA6ICcnfSR7ZmllbGROYW1lfSA9ICR7Y3JpdGVyaWFWYWx1ZX1gKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCBvciBvcGVuIHRoZSBxdWVyeSBmaWx0ZXIgZGlhbG9nXHJcbiAgICBsZXQgcXVlcnlGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpO1xyXG4gICAgaWYgKCFxdWVyeUZvcm0pIHtcclxuICAgICAgICAvLyBUcnkgdG8gb3BlbiB0aGUgcXVlcnkgZGlhbG9nIHZpYSBRdWVyeSBidXR0b25cclxuICAgICAgICBjb25zdCBmaWx0ZXJCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJRdWVyeVNlbGVjdEJ1dHRvblwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJRdWVyeVwiXScpO1xyXG4gICAgICAgIGlmIChmaWx0ZXJCdXR0b24pIHtcclxuICAgICAgICAgICAgZmlsdGVyQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgICAgICBxdWVyeUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXF1ZXJ5Rm9ybSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUXVlcnkgZmlsdGVyIGRpYWxvZyAoU3lzUXVlcnlGb3JtKSBub3QgZm91bmQuIE1ha2Ugc3VyZSB0aGUgZmlsdGVyIGRpYWxvZyBpcyBvcGVuLicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gZmluZCBlbGVtZW50IHdpdGhpbiBxdWVyeSBmb3JtXHJcbiAgICBjb25zdCBmaW5kSW5RdWVyeSA9IChuYW1lKSA9PiBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtuYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICAvLyBJZiBzYXZlZFF1ZXJ5IGlzIHNwZWNpZmllZCwgc2VsZWN0IGl0IGZyb20gdGhlIGRyb3Bkb3duIGZpcnN0XHJcbiAgICBpZiAob3B0aW9ucy5zYXZlZFF1ZXJ5KSB7XHJcbiAgICAgICAgY29uc3Qgc2F2ZWRRdWVyeUJveCA9IGZpbmRJblF1ZXJ5KCdTYXZlZFF1ZXJpZXNCb3gnKTtcclxuICAgICAgICBpZiAoc2F2ZWRRdWVyeUJveCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IHNhdmVkUXVlcnlCb3gucXVlcnlTZWxlY3RvcignaW5wdXQnKTtcclxuICAgICAgICAgICAgaWYgKGlucHV0KSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIG9wdGlvbnMuc2F2ZWRRdWVyeSk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBNYWtlIHN1cmUgd2UncmUgb24gdGhlIFJhbmdlIHRhYlxyXG4gICAgY29uc3QgcmFuZ2VUYWIgPSBmaW5kSW5RdWVyeSgnUmFuZ2VUYWInKSB8fCBmaW5kSW5RdWVyeSgnUmFuZ2VUYWJfaGVhZGVyJyk7XHJcbiAgICBpZiAocmFuZ2VUYWIgJiYgIXJhbmdlVGFiLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykgJiYgcmFuZ2VUYWIuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgIT09ICd0cnVlJykge1xyXG4gICAgICAgIHJhbmdlVGFiLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2xpY2sgQWRkIHRvIGFkZCBhIG5ldyBmaWx0ZXIgcm93XHJcbiAgICBjb25zdCBhZGRCdXR0b24gPSBmaW5kSW5RdWVyeSgnUmFuZ2VBZGQnKTtcclxuICAgIGlmIChhZGRCdXR0b24pIHtcclxuICAgICAgICBhZGRCdXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUaGUgZ3JpZCB1c2VzIFJlYWN0TGlzdCAtIGZpbmQgdGhlIGxhc3Qgcm93IChuZXdseSBhZGRlZCkgYW5kIGZpbGwgaW4gdmFsdWVzXHJcbiAgICBjb25zdCBncmlkID0gZmluZEluUXVlcnkoJ1JhbmdlR3JpZCcpO1xyXG4gICAgaWYgKCFncmlkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdSYW5nZSBncmlkIG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBHZXQgYWxsIHJvd3MgYW5kIGZpbmQgdGhlIGxhc3Qgb25lIChtb3N0IHJlY2VudGx5IGFkZGVkKVxyXG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyb3dcIl0sIHRyLCAubGlzdC1yb3cnKTtcclxuICAgIGNvbnN0IGxhc3RSb3cgPSByb3dzW3Jvd3MubGVuZ3RoIC0gMV0gfHwgZ3JpZDtcclxuICAgIFxyXG4gICAgLy8gU2V0IHRhYmxlIG5hbWUgaWYgcHJvdmlkZWRcclxuICAgIGlmICh0YWJsZU5hbWUpIHtcclxuICAgICAgICBjb25zdCB0YWJsZUNlbGwgPSBsYXN0Um93LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVGFibGVcIl0nKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VUYWJsZVwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RUYWJsZUNlbGwgPSB0YWJsZUNlbGwubGVuZ3RoID8gdGFibGVDZWxsW3RhYmxlQ2VsbC5sZW5ndGggLSAxXSA6IHRhYmxlQ2VsbDtcclxuICAgICAgICBpZiAobGFzdFRhYmxlQ2VsbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGxhc3RUYWJsZUNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBsYXN0VGFibGVDZWxsO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCB0YWJsZU5hbWUpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGZpZWxkIG5hbWUgaWYgcHJvdmlkZWRcclxuICAgIGlmIChmaWVsZE5hbWUpIHtcclxuICAgICAgICBjb25zdCBmaWVsZENlbGxzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZUZpZWxkXCJdJyk7XHJcbiAgICAgICAgY29uc3QgbGFzdEZpZWxkQ2VsbCA9IGZpZWxkQ2VsbHNbZmllbGRDZWxscy5sZW5ndGggLSAxXSB8fCBncmlkLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlRmllbGRcIl0nKTtcclxuICAgICAgICBpZiAobGFzdEZpZWxkQ2VsbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGxhc3RGaWVsZENlbGwucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBsYXN0RmllbGRDZWxsO1xyXG4gICAgICAgICAgICAvLyBDbGljayB0byBvcGVuIGRyb3Bkb3duL2ZvY3VzXHJcbiAgICAgICAgICAgIGlucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgZmllbGROYW1lKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBjcml0ZXJpYSB2YWx1ZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKGNyaXRlcmlhVmFsdWUpIHtcclxuICAgICAgICBjb25zdCB2YWx1ZUNlbGxzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVZhbHVlXCJdJyk7XHJcbiAgICAgICAgY29uc3QgbGFzdFZhbHVlQ2VsbCA9IHZhbHVlQ2VsbHNbdmFsdWVDZWxscy5sZW5ndGggLSAxXSB8fCBncmlkLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVmFsdWVcIl0nKTtcclxuICAgICAgICBpZiAobGFzdFZhbHVlQ2VsbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGxhc3RWYWx1ZUNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBsYXN0VmFsdWVDZWxsO1xyXG4gICAgICAgICAgICBpbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGNyaXRlcmlhVmFsdWUpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcCgnUXVlcnkgZmlsdGVyIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZUJhdGNoUHJvY2Vzc2luZyhlbmFibGVkLCB0YXNrRGVzY3JpcHRpb24sIGJhdGNoR3JvdXAsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgbG9nU3RlcChgQ29uZmlndXJpbmcgYmF0Y2ggcHJvY2Vzc2luZzogJHtlbmFibGVkID8gJ2VuYWJsZWQnIDogJ2Rpc2FibGVkJ31gKTtcclxuICAgIFxyXG4gICAgLy8gV2FpdCBmb3IgZGlhbG9nIHRvIGJlIHJlYWR5XHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSBiYXRjaCBwcm9jZXNzaW5nIGNoZWNrYm94IC0gY29udHJvbCBuYW1lIGlzIEZsZDFfMSBpbiBTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cclxuICAgIGNvbnN0IGJhdGNoVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWU9XCJGbGQxXzFcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCgnRmxkMV8xJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiRmxkMV8xXCJdJyk7XHJcbiAgICBcclxuICAgIGlmIChiYXRjaFRvZ2dsZSkge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGFjdHVhbCBjaGVja2JveCBpbnB1dCBvciB0b2dnbGUgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgY2hlY2tib3ggPSBiYXRjaFRvZ2dsZS5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignLnRvZ2dsZS1idXR0b24nKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBjaGVja2JveD8uY2hlY2tlZCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLmNsYXNzTGlzdC5jb250YWlucygnb24nKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudFN0YXRlICE9PSBlbmFibGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gY2hlY2tib3ggfHwgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignYnV0dG9uLCAudG9nZ2xlLXN3aXRjaCwgbGFiZWwnKSB8fCBiYXRjaFRvZ2dsZTtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxvZ1N0ZXAoJ1dhcm5pbmc6IEJhdGNoIHByb2Nlc3NpbmcgdG9nZ2xlIChGbGQxXzEpIG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgdGFzayBkZXNjcmlwdGlvbiBpZiBwcm92aWRlZCBhbmQgYmF0Y2ggaXMgZW5hYmxlZCAoRmxkMl8xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgdGFza0Rlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkMl8xJywgdGFza0Rlc2NyaXB0aW9uKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgYmF0Y2ggZ3JvdXAgaWYgcHJvdmlkZWQgYW5kIGJhdGNoIGlzIGVuYWJsZWQgKEZsZDNfMSlcclxuICAgIGlmIChlbmFibGVkICYmIGJhdGNoR3JvdXApIHtcclxuICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlKCdGbGQzXzEnLCBiYXRjaEdyb3VwKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgUHJpdmF0ZSBhbmQgQ3JpdGljYWwgb3B0aW9ucyBpZiBwcm92aWRlZCAoRmxkNF8xIGFuZCBGbGQ1XzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLnByaXZhdGUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGF3YWl0IHNldENoZWNrYm94KCdGbGQ0XzEnLCBvcHRpb25zLnByaXZhdGUpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChlbmFibGVkICYmIG9wdGlvbnMuY3JpdGljYWxKb2IgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGF3YWl0IHNldENoZWNrYm94KCdGbGQ1XzEnLCBvcHRpb25zLmNyaXRpY2FsSm9iKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgTW9uaXRvcmluZyBjYXRlZ29yeSBpZiBzcGVjaWZpZWQgKEZsZDZfMSlcclxuICAgIGlmIChlbmFibGVkICYmIG9wdGlvbnMubW9uaXRvcmluZ0NhdGVnb3J5KSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q29tYm9Cb3hWYWx1ZSgnRmxkNl8xJywgb3B0aW9ucy5tb25pdG9yaW5nQ2F0ZWdvcnkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoJ0JhdGNoIHByb2Nlc3NpbmcgY29uZmlndXJlZCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlUmVjdXJyZW5jZShzdGVwKSB7XHJcbiAgICBjb25zdCB7IHBhdHRlcm5Vbml0LCBwYXR0ZXJuQ291bnQsIGVuZERhdGVPcHRpb24sIGVuZEFmdGVyQ291bnQsIGVuZEJ5RGF0ZSwgc3RhcnREYXRlLCBzdGFydFRpbWUsIHRpbWV6b25lIH0gPSBzdGVwO1xyXG4gICAgXHJcbiAgICBjb25zdCBwYXR0ZXJuVW5pdHMgPSBbJ21pbnV0ZXMnLCAnaG91cnMnLCAnZGF5cycsICd3ZWVrcycsICdtb250aHMnLCAneWVhcnMnXTtcclxuICAgIGxvZ1N0ZXAoYENvbmZpZ3VyaW5nIHJlY3VycmVuY2U6IGV2ZXJ5ICR7cGF0dGVybkNvdW50fSAke3BhdHRlcm5Vbml0c1twYXR0ZXJuVW5pdCB8fCAwXX1gKTtcclxuICAgIFxyXG4gICAgLy8gQ2xpY2sgUmVjdXJyZW5jZSBidXR0b24gdG8gb3BlbiBkaWFsb2cgaWYgbm90IGFscmVhZHkgb3BlblxyXG4gICAgbGV0IHJlY3VycmVuY2VGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1JlY3VycmVuY2VcIl0nKTtcclxuICAgIGlmICghcmVjdXJyZW5jZUZvcm0pIHtcclxuICAgICAgICAvLyBNbnVJdG1fMSBpcyB0aGUgUmVjdXJyZW5jZSBidXR0b24gaW4gU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXHJcbiAgICAgICAgY29uc3QgcmVjdXJyZW5jZUJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cIl0gW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiTW51SXRtXzFcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KCdNbnVJdG1fMScpO1xyXG4gICAgICAgIGlmIChyZWN1cnJlbmNlQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIHJlY3VycmVuY2VCdXR0b24uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMTAwMCk7XHJcbiAgICAgICAgICAgIHJlY3VycmVuY2VGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1JlY3VycmVuY2VcIl0nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghcmVjdXJyZW5jZUZvcm0pIHtcclxuICAgICAgICBsb2dTdGVwKCdXYXJuaW5nOiBDb3VsZCBub3Qgb3BlbiBTeXNSZWN1cnJlbmNlIGRpYWxvZycpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSGVscGVyIHRvIGZpbmQgZWxlbWVudCB3aXRoaW4gcmVjdXJyZW5jZSBmb3JtXHJcbiAgICBjb25zdCBmaW5kSW5SZWN1cnJlbmNlID0gKG5hbWUpID0+IHJlY3VycmVuY2VGb3JtLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7bmFtZX1cIl1gKTtcclxuICAgIFxyXG4gICAgLy8gU2V0IHN0YXJ0IGRhdGUgaWYgcHJvdmlkZWRcclxuICAgIGlmIChzdGFydERhdGUpIHtcclxuICAgICAgICBjb25zdCBzdGFydERhdGVJbnB1dCA9IGZpbmRJblJlY3VycmVuY2UoJ1N0YXJ0RGF0ZScpPy5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmRJblJlY3VycmVuY2UoJ1N0YXJ0RGF0ZScpO1xyXG4gICAgICAgIGlmIChzdGFydERhdGVJbnB1dCkge1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKHN0YXJ0RGF0ZUlucHV0LCBzdGFydERhdGUpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHN0YXJ0IHRpbWUgaWYgcHJvdmlkZWRcclxuICAgIGlmIChzdGFydFRpbWUpIHtcclxuICAgICAgICBjb25zdCBzdGFydFRpbWVJbnB1dCA9IGZpbmRJblJlY3VycmVuY2UoJ1N0YXJ0VGltZScpPy5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmRJblJlY3VycmVuY2UoJ1N0YXJ0VGltZScpO1xyXG4gICAgICAgIGlmIChzdGFydFRpbWVJbnB1dCkge1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKHN0YXJ0VGltZUlucHV0LCBzdGFydFRpbWUpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHRpbWV6b25lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAodGltZXpvbmUpIHtcclxuICAgICAgICBjb25zdCB0aW1lem9uZUNvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdUaW1lem9uZScpO1xyXG4gICAgICAgIGlmICh0aW1lem9uZUNvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSB0aW1lem9uZUNvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKTtcclxuICAgICAgICAgICAgaWYgKGlucHV0KSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIHRpbWV6b25lKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBwYXR0ZXJuIHVuaXQgKHJhZGlvIGJ1dHRvbnM6IE1pbnV0ZXM9MCwgSG91cnM9MSwgRGF5cz0yLCBXZWVrcz0zLCBNb250aHM9NCwgWWVhcnM9NSlcclxuICAgIGlmIChwYXR0ZXJuVW5pdCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgY29uc3QgcGF0dGVyblVuaXRDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnUGF0dGVyblVuaXQnKTtcclxuICAgICAgICBpZiAocGF0dGVyblVuaXRDb250cm9sKSB7XHJcbiAgICAgICAgICAgIC8vIFJhZGlvIGJ1dHRvbnMgYXJlIHR5cGljYWxseSByZW5kZXJlZCBhcyBhIGdyb3VwIHdpdGggbXVsdGlwbGUgb3B0aW9uc1xyXG4gICAgICAgICAgICBjb25zdCByYWRpb0lucHV0cyA9IHBhdHRlcm5Vbml0Q29udHJvbC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0nKTtcclxuICAgICAgICAgICAgaWYgKHJhZGlvSW5wdXRzLmxlbmd0aCA+IHBhdHRlcm5Vbml0KSB7XHJcbiAgICAgICAgICAgICAgICByYWRpb0lucHV0c1twYXR0ZXJuVW5pdF0uY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7IC8vIFdhaXQgZm9yIFVJIHRvIHVwZGF0ZSB3aXRoIGFwcHJvcHJpYXRlIGludGVydmFsIGZpZWxkXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUcnkgY2xpY2tpbmcgdGhlIG50aCBvcHRpb24gbGFiZWwvYnV0dG9uXHJcbiAgICAgICAgICAgICAgICBjb25zdCByYWRpb09wdGlvbnMgPSBwYXR0ZXJuVW5pdENvbnRyb2wucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyYWRpb1wiXSwgbGFiZWwsIGJ1dHRvbicpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJhZGlvT3B0aW9ucy5sZW5ndGggPiBwYXR0ZXJuVW5pdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJhZGlvT3B0aW9uc1twYXR0ZXJuVW5pdF0uY2xpY2soKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgaW50ZXJ2YWwgY291bnQgYmFzZWQgb24gcGF0dGVybiB1bml0XHJcbiAgICAvLyBUaGUgdmlzaWJsZSBpbnB1dCBmaWVsZCBjaGFuZ2VzIGJhc2VkIG9uIHNlbGVjdGVkIHBhdHRlcm4gdW5pdFxyXG4gICAgaWYgKHBhdHRlcm5Db3VudCkge1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbE5hbWVzID0gWydNaW51dGVJbnQnLCAnSG91ckludCcsICdEYXlJbnQnLCAnV2Vla0ludCcsICdNb250aEludCcsICdZZWFySW50J107XHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sTmFtZSA9IGNvdW50Q29udHJvbE5hbWVzW3BhdHRlcm5Vbml0IHx8IDBdO1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoY291bnRDb250cm9sTmFtZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvdW50Q29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGNvdW50Q29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGNvdW50Q29udHJvbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgcGF0dGVybkNvdW50LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGVuZCBkYXRlIG9wdGlvbnNcclxuICAgIGlmIChlbmREYXRlT3B0aW9uID09PSAnbm9FbmREYXRlJykge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiTm8gZW5kIGRhdGVcIiBncm91cCAoRW5kRGF0ZTEpXHJcbiAgICAgICAgY29uc3Qgbm9FbmREYXRlR3JvdXAgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlMScpO1xyXG4gICAgICAgIGlmIChub0VuZERhdGVHcm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCByYWRpbyA9IG5vRW5kRGF0ZUdyb3VwLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXSwgW3JvbGU9XCJyYWRpb1wiXScpIHx8IG5vRW5kRGF0ZUdyb3VwO1xyXG4gICAgICAgICAgICByYWRpby5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoZW5kRGF0ZU9wdGlvbiA9PT0gJ2VuZEFmdGVyJyAmJiBlbmRBZnRlckNvdW50KSB7XHJcbiAgICAgICAgLy8gQ2xpY2sgb24gXCJFbmQgYWZ0ZXJcIiBncm91cCAoRW5kRGF0ZTIpIGFuZCBzZXQgY291bnRcclxuICAgICAgICBjb25zdCBlbmRBZnRlckdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTInKTtcclxuICAgICAgICBpZiAoZW5kQWZ0ZXJHcm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCByYWRpbyA9IGVuZEFmdGVyR3JvdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdLCBbcm9sZT1cInJhZGlvXCJdJykgfHwgZW5kQWZ0ZXJHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gU2V0IHRoZSBjb3VudCAoRW5kRGF0ZUludClcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlSW50Jyk7XHJcbiAgICAgICAgaWYgKGNvdW50Q29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGNvdW50Q29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGNvdW50Q29udHJvbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgZW5kQWZ0ZXJDb3VudC50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGVuZERhdGVPcHRpb24gPT09ICdlbmRCeScgJiYgZW5kQnlEYXRlKSB7XHJcbiAgICAgICAgLy8gQ2xpY2sgb24gXCJFbmQgYnlcIiBncm91cCAoRW5kRGF0ZTMpIGFuZCBzZXQgZGF0ZVxyXG4gICAgICAgIGNvbnN0IGVuZEJ5R3JvdXAgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlMycpO1xyXG4gICAgICAgIGlmIChlbmRCeUdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJhZGlvID0gZW5kQnlHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBlbmRCeUdyb3VwO1xyXG4gICAgICAgICAgICByYWRpby5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBTZXQgdGhlIGVuZCBkYXRlIChFbmREYXRlRGF0ZSlcclxuICAgICAgICBjb25zdCBkYXRlQ29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoJ0VuZERhdGVEYXRlJyk7XHJcbiAgICAgICAgaWYgKGRhdGVDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZGF0ZUNvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBkYXRlQ29udHJvbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgZW5kQnlEYXRlKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoJ1JlY3VycmVuY2UgY29uZmlndXJlZCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dEVsZW1lbnQsIHZhbHVlKSB7XHJcbiAgICBpZiAoIWlucHV0RWxlbWVudCkgcmV0dXJuO1xyXG4gICAgXHJcbiAgICAvLyBGb2N1cyB0aGUgaW5wdXRcclxuICAgIGlucHV0RWxlbWVudC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgZXhpc3RpbmcgdmFsdWVcclxuICAgIGlucHV0RWxlbWVudC5zZWxlY3Q/LigpO1xyXG4gICAgXHJcbiAgICAvLyBTZXQgdGhlIHZhbHVlXHJcbiAgICBpbnB1dEVsZW1lbnQudmFsdWUgPSB2YWx1ZTtcclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZXZlbnRzXHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRGaWx0ZXJNZXRob2QoZmlsdGVyQ29udGFpbmVyLCBtZXRob2QpIHtcclxuICAgIC8vIEZpbmQgdGhlIGZpbHRlciBvcGVyYXRvciBkcm9wZG93biBuZWFyIHRoZSBmaWx0ZXIgaW5wdXRcclxuICAgIC8vIEQzNjUgdXNlcyB2YXJpb3VzIHBhdHRlcm5zIGZvciB0aGUgb3BlcmF0b3IgZHJvcGRvd25cclxuICAgIGNvbnN0IG9wZXJhdG9yUGF0dGVybnMgPSBbXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJPcGVyYXRvclwiXScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJfT3BlcmF0b3JcIl0nLFxyXG4gICAgICAgICcuZmlsdGVyLW9wZXJhdG9yJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSdcclxuICAgIF07XHJcbiAgICBcclxuICAgIGxldCBvcGVyYXRvckRyb3Bkb3duID0gbnVsbDtcclxuICAgIGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IGZpbHRlckNvbnRhaW5lcj8ucGFyZW50RWxlbWVudCB8fCBkb2N1bWVudDtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIG9wZXJhdG9yUGF0dGVybnMpIHtcclxuICAgICAgICBvcGVyYXRvckRyb3Bkb3duID0gc2VhcmNoQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IocGF0dGVybik7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yRHJvcGRvd24gJiYgb3BlcmF0b3JEcm9wZG93bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIW9wZXJhdG9yRHJvcGRvd24pIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBcdTI2QTAgRmlsdGVyIG9wZXJhdG9yIGRyb3Bkb3duIG5vdCBmb3VuZCwgdXNpbmcgZGVmYXVsdCBtZXRob2RgKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENsaWNrIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBjb25zdCBkcm9wZG93bkJ1dHRvbiA9IG9wZXJhdG9yRHJvcGRvd24ucXVlcnlTZWxlY3RvcignYnV0dG9uLCBbcm9sZT1cImNvbWJvYm94XCJdLCAuZHluLWNvbWJvQm94LWJ1dHRvbicpIHx8IG9wZXJhdG9yRHJvcGRvd247XHJcbiAgICBkcm9wZG93bkJ1dHRvbi5jbGljaygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCBhbmQgY2xpY2sgdGhlIG1hdGNoaW5nIG9wdGlvblxyXG4gICAgY29uc3QgbWV0aG9kTWFwcGluZ3MgPSB7XHJcbiAgICAgICAgJ2lzIGV4YWN0bHknOiBbJ2lzIGV4YWN0bHknLCAnZXF1YWxzJywgJ2lzIGVxdWFsIHRvJywgJz0nXSxcclxuICAgICAgICAnY29udGFpbnMnOiBbJ2NvbnRhaW5zJywgJ2xpa2UnXSxcclxuICAgICAgICAnYmVnaW5zIHdpdGgnOiBbJ2JlZ2lucyB3aXRoJywgJ3N0YXJ0cyB3aXRoJ10sXHJcbiAgICAgICAgJ2lzIG5vdCc6IFsnaXMgbm90JywgJ25vdCBlcXVhbCcsICchPScsICc8PiddLFxyXG4gICAgICAgICdkb2VzIG5vdCBjb250YWluJzogWydkb2VzIG5vdCBjb250YWluJywgJ25vdCBsaWtlJ10sXHJcbiAgICAgICAgJ2lzIG9uZSBvZic6IFsnaXMgb25lIG9mJywgJ2luJ10sXHJcbiAgICAgICAgJ2FmdGVyJzogWydhZnRlcicsICdncmVhdGVyIHRoYW4nLCAnPiddLFxyXG4gICAgICAgICdiZWZvcmUnOiBbJ2JlZm9yZScsICdsZXNzIHRoYW4nLCAnPCddLFxyXG4gICAgICAgICdtYXRjaGVzJzogWydtYXRjaGVzJywgJ3JlZ2V4JywgJ3BhdHRlcm4nXVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgY29uc3Qgc2VhcmNoVGVybXMgPSBtZXRob2RNYXBwaW5nc1ttZXRob2RdIHx8IFttZXRob2RdO1xyXG4gICAgXHJcbiAgICAvLyBMb29rIGZvciBvcHRpb25zIGluIGxpc3Rib3gvZHJvcGRvd25cclxuICAgIGNvbnN0IG9wdGlvbnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cIm9wdGlvblwiXSwgW3JvbGU9XCJsaXN0aXRlbVwiXSwgLmR5bi1saXN0Vmlldy1pdGVtJyk7XHJcbiAgICBmb3IgKGNvbnN0IG9wdCBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IG9wdC50ZXh0Q29udGVudC50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGZvciAoY29uc3QgdGVybSBvZiBzZWFyY2hUZXJtcykge1xyXG4gICAgICAgICAgICBpZiAodGV4dC5pbmNsdWRlcyh0ZXJtLnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgICAgICBvcHQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBTZXQgZmlsdGVyIG1ldGhvZDogJHttZXRob2R9YCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSBzZWxlY3QgZWxlbWVudFxyXG4gICAgY29uc3Qgc2VsZWN0RWwgPSBvcGVyYXRvckRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgaWYgKHNlbGVjdEVsKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBvcHQgb2Ygc2VsZWN0RWwub3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gb3B0LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgdGVybSBvZiBzZWFyY2hUZXJtcykge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQuaW5jbHVkZXModGVybS50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdEVsLnZhbHVlID0gb3B0LnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgU2V0IGZpbHRlciBtZXRob2Q6ICR7bWV0aG9kfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYCAgXHUyNkEwIENvdWxkIG5vdCBzZXQgZmlsdGVyIG1ldGhvZCBcIiR7bWV0aG9kfVwiLCB1c2luZyBkZWZhdWx0YCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRSYWRpb0J1dHRvblZhbHVlKGVsZW1lbnQsIHZhbHVlKSB7XHJcbiAgICBsb2dTdGVwKGBTZXR0aW5nIHJhZGlvIGJ1dHRvbiB2YWx1ZTogJHt2YWx1ZX1gKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCBhbGwgcmFkaW8gb3B0aW9ucyBpbiB0aGlzIGdyb3VwXHJcbiAgICBjb25zdCByYWRpb0lucHV0cyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInJhZGlvXCJdJyk7XHJcbiAgICBjb25zdCByYWRpb1JvbGVzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cInJhZGlvXCJdJyk7XHJcbiAgICBjb25zdCBvcHRpb25zID0gcmFkaW9JbnB1dHMubGVuZ3RoID4gMCA/IEFycmF5LmZyb20ocmFkaW9JbnB1dHMpIDogQXJyYXkuZnJvbShyYWRpb1JvbGVzKTtcclxuICAgIFxyXG4gICAgaWYgKG9wdGlvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgY2xpY2thYmxlIGxhYmVscy9idXR0b25zIHRoYXQgYWN0IGFzIHJhZGlvIG9wdGlvbnNcclxuICAgICAgICBjb25zdCBsYWJlbEJ1dHRvbnMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2xhYmVsLCBidXR0b24sIFtkYXRhLWR5bi1yb2xlPVwiUmFkaW9CdXR0b25cIl0nKTtcclxuICAgICAgICBvcHRpb25zLnB1c2goLi4uQXJyYXkuZnJvbShsYWJlbEJ1dHRvbnMpKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKG9wdGlvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyByYWRpbyBvcHRpb25zIGZvdW5kIGluIGVsZW1lbnRgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgRm91bmQgJHtvcHRpb25zLmxlbmd0aH0gcmFkaW8gb3B0aW9uc2ApO1xyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gbWF0Y2ggYnkgaW5kZXggKGlmIHZhbHVlIGlzIGEgbnVtYmVyIG9yIG51bWVyaWMgc3RyaW5nKVxyXG4gICAgY29uc3QgbnVtVmFsdWUgPSBwYXJzZUludCh2YWx1ZSwgMTApO1xyXG4gICAgaWYgKCFpc05hTihudW1WYWx1ZSkgJiYgbnVtVmFsdWUgPj0gMCAmJiBudW1WYWx1ZSA8IG9wdGlvbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0T3B0aW9uID0gb3B0aW9uc1tudW1WYWx1ZV07XHJcbiAgICAgICAgbG9nU3RlcChgQ2xpY2tpbmcgcmFkaW8gb3B0aW9uIGF0IGluZGV4ICR7bnVtVmFsdWV9YCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2xpY2sgdGhlIHJhZGlvIG9wdGlvbiBvciBpdHMgYXNzb2NpYXRlZCBsYWJlbFxyXG4gICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gdGFyZ2V0T3B0aW9uLnRhZ05hbWUgPT09ICdJTlBVVCcgXHJcbiAgICAgICAgICAgID8gKHRhcmdldE9wdGlvbi5jbG9zZXN0KCdsYWJlbCcpIHx8IHRhcmdldE9wdGlvbi5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpIHx8IHRhcmdldE9wdGlvbilcclxuICAgICAgICAgICAgOiB0YXJnZXRPcHRpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZVxyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVydXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWxzbyB0cnkgY2xpY2tpbmcgdGhlIGlucHV0IGRpcmVjdGx5XHJcbiAgICAgICAgaWYgKHRhcmdldE9wdGlvbi50YWdOYW1lID09PSAnSU5QVVQnKSB7XHJcbiAgICAgICAgICAgIHRhcmdldE9wdGlvbi5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGFyZ2V0T3B0aW9uLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIG1hdGNoIGJ5IGxhYmVsIHRleHRcclxuICAgIGNvbnN0IHNlYXJjaFZhbHVlID0gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IGxhYmVsID0gb3B0aW9uLmNsb3Nlc3QoJ2xhYmVsJykgfHwgb3B0aW9uLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgb3B0aW9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpPy50b0xvd2VyQ2FzZSgpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgb3B0aW9uLnRleHRDb250ZW50Py50cmltKCkudG9Mb3dlckNhc2UoKSB8fCAnJztcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGV4dC5pbmNsdWRlcyhzZWFyY2hWYWx1ZSkgfHwgc2VhcmNoVmFsdWUuaW5jbHVkZXModGV4dCkpIHtcclxuICAgICAgICAgICAgbG9nU3RlcChgQ2xpY2tpbmcgcmFkaW8gb3B0aW9uIHdpdGggdGV4dDogJHt0ZXh0fWApO1xyXG4gICAgICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGxhYmVsIHx8IG9wdGlvbjtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChvcHRpb24udGFnTmFtZSA9PT0gJ0lOUFVUJykge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9uLmNoZWNrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgb3B0aW9uLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFJhZGlvIG9wdGlvbiBub3QgZm91bmQgZm9yIHZhbHVlOiAke3ZhbHVlfWApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmICghaW5wdXQpIHRocm93IG5ldyBFcnJvcignSW5wdXQgbm90IGZvdW5kIGluIFNlZ21lbnRlZEVudHJ5Jyk7XHJcblxyXG4gICAgLy8gRmluZCB0aGUgbG9va3VwIGJ1dHRvblxyXG4gICAgY29uc3QgbG9va3VwQnV0dG9uID0gZmluZExvb2t1cEJ1dHRvbihlbGVtZW50KTtcclxuICAgIFxyXG4gICAgLy8gSWYgbm8gbG9va3VwIGJ1dHRvbiwgdHJ5IGtleWJvYXJkIHRvIG9wZW4gdGhlIGZseW91dCBmaXJzdFxyXG4gICAgaWYgKCFsb29rdXBCdXR0b24pIHtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBhd2FpdCBvcGVuTG9va3VwQnlLZXlib2FyZChpbnB1dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2xpY2sgdGhlIGxvb2t1cCBidXR0b24gdG8gb3BlbiB0aGUgZHJvcGRvd25cclxuICAgIGlmIChsb29rdXBCdXR0b24pIHtcclxuICAgICAgICBsb29rdXBCdXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MDApOyAvLyBXYWl0IGZvciBsb29rdXAgdG8gbG9hZFxyXG4gICAgfVxyXG5cclxuICAgIC8vIEZpbmQgdGhlIGxvb2t1cCBwb3B1cC9mbHlvdXRcclxuICAgIGNvbnN0IGxvb2t1cFBvcHVwID0gYXdhaXQgd2FpdEZvckxvb2t1cFBvcHVwKCk7XHJcbiAgICBpZiAoIWxvb2t1cFBvcHVwKSB7XHJcbiAgICAgICAgaWYgKCF3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzPy5zdXBwcmVzc0xvb2t1cFdhcm5pbmdzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignTG9va3VwIHBvcHVwIG5vdCBmb3VuZCwgdHJ5aW5nIGRpcmVjdCBpbnB1dCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIGEgZG9ja2VkIGxvb2t1cCBmbHlvdXQgZXhpc3RzIChzZWdtZW50ZWQgZW50cnkpLCB0eXBlIGludG8gaXRzIGZpbHRlciBpbnB1dFxyXG4gICAgY29uc3QgZG9jayA9IGF3YWl0IHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudChlbGVtZW50LCAxNTAwKTtcclxuICAgIGlmIChkb2NrKSB7XHJcbiAgICAgICAgY29uc3QgZG9ja0lucHV0ID0gZmluZExvb2t1cEZpbHRlcklucHV0KGRvY2spO1xyXG4gICAgICAgIGlmIChkb2NrSW5wdXQpIHtcclxuICAgICAgICAgICAgZG9ja0lucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICAgICAgZG9ja0lucHV0LmZvY3VzKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgICAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChkb2NrSW5wdXQsIHZhbHVlKTtcclxuICAgICAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoODAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHlwZSB2YWx1ZSBpbiB0aGUgc2VhcmNoL2ZpbHRlciBmaWVsZCBvZiB0aGUgbG9va3VwXHJcbiAgICBjb25zdCBsb29rdXBJbnB1dCA9IGxvb2t1cFBvcHVwLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdLCBpbnB1dFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgaWYgKGxvb2t1cElucHV0KSB7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgIGxvb2t1cElucHV0LmZvY3VzKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QobG9va3VwSW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGxvb2t1cElucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMDApOyAvLyBXYWl0IGZvciBzZXJ2ZXIgZmlsdGVyXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZpbmQgYW5kIGNsaWNrIHRoZSBtYXRjaGluZyByb3dcclxuICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3YWl0Rm9yTG9va3VwUm93cyhsb29rdXBQb3B1cCwgZWxlbWVudCwgNTAwMCk7XHJcbiAgICBsZXQgZm91bmRNYXRjaCA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IHJvdy50ZXh0Q29udGVudC50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xyXG4gICAgICAgIGlmICh0ZXh0LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiZ3JpZGNlbGxcIl0sIHRkJyk7XHJcbiAgICAgICAgICAgIChjZWxsIHx8IHJvdykuY2xpY2soKTtcclxuICAgICAgICAgICAgZm91bmRNYXRjaCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghZm91bmRNYXRjaCkge1xyXG4gICAgICAgIGNvbnN0IHNhbXBsZSA9IEFycmF5LmZyb20ocm93cykuc2xpY2UoMCwgOCkubWFwKHIgPT4gci50ZXh0Q29udGVudC50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpKTtcclxuICAgICAgICBpZiAoIXdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3M/LnN1cHByZXNzTG9va3VwV2FybmluZ3MpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdObyBtYXRjaGluZyBsb29rdXAgdmFsdWUgZm91bmQsIGNsb3NpbmcgcG9wdXAnLCB7IHZhbHVlLCBzYW1wbGUgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFRyeSB0byBjbG9zZSB0aGUgcG9wdXBcclxuICAgICAgICBjb25zdCBjbG9zZUJ0biA9IGxvb2t1cFBvcHVwLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkNsb3NlXCJdLCAuY2xvc2UtYnV0dG9uJyk7XHJcbiAgICAgICAgaWYgKGNsb3NlQnRuKSBjbG9zZUJ0bi5jbGljaygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGRpcmVjdCB0eXBpbmdcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdLCBzZWxlY3QnKTtcclxuICAgIGlmICghaW5wdXQpIHRocm93IG5ldyBFcnJvcignSW5wdXQgbm90IGZvdW5kIGluIENvbWJvQm94Jyk7XHJcblxyXG4gICAgLy8gSWYgaXQncyBhIG5hdGl2ZSBzZWxlY3QsIHVzZSBvcHRpb24gc2VsZWN0aW9uXHJcbiAgICBpZiAoaW5wdXQudGFnTmFtZSA9PT0gJ1NFTEVDVCcpIHtcclxuICAgICAgICBjb25zdCBvcHRpb25zID0gQXJyYXkuZnJvbShpbnB1dC5vcHRpb25zKTtcclxuICAgICAgICBjb25zdCB0YXJnZXQgPSBvcHRpb25zLmZpbmQob3B0ID0+IG9wdC50ZXh0LnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSBTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5maW5kKG9wdCA9PiBvcHQudGV4dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKSkpO1xyXG4gICAgICAgIGlmICghdGFyZ2V0KSB0aHJvdyBuZXcgRXJyb3IoYE9wdGlvbiBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICAgICAgaW5wdXQudmFsdWUgPSB0YXJnZXQudmFsdWU7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9wZW4gdGhlIGRyb3Bkb3duIChidXR0b24gcHJlZmVycmVkKVxyXG4gICAgY29uc3QgY29tYm9CdXR0b24gPSBmaW5kQ29tYm9Cb3hCdXR0b24oZWxlbWVudCk7XHJcbiAgICBpZiAoY29tYm9CdXR0b24pIHtcclxuICAgICAgICBjb21ib0J1dHRvbi5jbGljaygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBpbnB1dC5jbGljaz8uKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuXHJcbiAgICAvLyBUcnkgdHlwaW5nIHRvIGZpbHRlciB3aGVuIGFsbG93ZWQgKHVzZSBzZWxlY3RlZCBpbnB1dCBtZXRob2QpXHJcbiAgICBpZiAoIWlucHV0LnJlYWRPbmx5ICYmICFpbnB1dC5kaXNhYmxlZCkge1xyXG4gICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5kIGxpc3Rib3ggbmVhciB0aGUgZmllbGQgb3IgbGlua2VkIHZpYSBhcmlhLWNvbnRyb2xzXHJcbiAgICBjb25zdCBsaXN0Ym94ID0gYXdhaXQgd2FpdEZvckxpc3Rib3hGb3JJbnB1dChpbnB1dCwgZWxlbWVudCk7XHJcbiAgICBpZiAoIWxpc3Rib3gpIHtcclxuICAgICAgICAvLyBGYWxsYmFjazogcHJlc3MgRW50ZXIgdG8gY29tbWl0IHR5cGVkIHZhbHVlXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBvcHRpb25zID0gY29sbGVjdENvbWJvT3B0aW9ucyhsaXN0Ym94KTtcclxuICAgIGNvbnN0IHNlYXJjaCA9IG5vcm1hbGl6ZVRleHQodmFsdWUpO1xyXG4gICAgbGV0IG1hdGNoZWQgPSBmYWxzZTtcclxuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dChvcHRpb24udGV4dENvbnRlbnQpO1xyXG4gICAgICAgIGlmICh0ZXh0ID09PSBzZWFyY2ggfHwgdGV4dC5pbmNsdWRlcyhzZWFyY2gpKSB7XHJcbiAgICAgICAgICAgIC8vIFRyeSB0byBtYXJrIHNlbGVjdGlvbiBmb3IgQVJJQS1iYXNlZCBjb21ib2JveGVzXHJcbiAgICAgICAgICAgIG9wdGlvbnMuZm9yRWFjaChvcHQgPT4gb3B0LnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsICdmYWxzZScpKTtcclxuICAgICAgICAgICAgb3B0aW9uLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsICd0cnVlJyk7XHJcbiAgICAgICAgICAgIGlmICghb3B0aW9uLmlkKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb24uaWQgPSBgZDM2NW9wdF8ke0RhdGUubm93KCl9XyR7TWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDApfWA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaW5wdXQuc2V0QXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnLCBvcHRpb24uaWQpO1xyXG5cclxuICAgICAgICAgICAgb3B0aW9uLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICduZWFyZXN0JyB9KTtcclxuICAgICAgICAgICAgY29uc3Qgb3B0aW9uVGV4dCA9IG9wdGlvbi50ZXh0Q29udGVudC50cmltKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBDbGljayB0aGUgb3B0aW9uIHRvIHNlbGVjdCBpdFxyXG4gICAgICAgICAgICBkaXNwYXRjaENsaWNrU2VxdWVuY2Uob3B0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGFwcGxpZWQgPSBhd2FpdCB3YWl0Rm9ySW5wdXRWYWx1ZShpbnB1dCwgb3B0aW9uVGV4dCwgODAwKTtcclxuICAgICAgICAgICAgaWYgKCFhcHBsaWVkKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTb21lIEQzNjUgY29tYm9zIGNvbW1pdCBvbiBrZXkgc2VsZWN0aW9uIHJhdGhlciB0aGFuIGNsaWNrXHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdBcnJvd0Rvd24nLCBjb2RlOiAnQXJyb3dEb3duJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBGb3JjZSBpbnB1dCB2YWx1ZSB1cGRhdGUgZm9yIEQzNjUgY29tYm9ib3hlc1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg0MDApO1xyXG4gICAgICAgICAgICBpZiAobm9ybWFsaXplVGV4dChpbnB1dC52YWx1ZSkgIT09IG5vcm1hbGl6ZVRleHQob3B0aW9uVGV4dCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIG9wdGlvblRleHQsIGVsZW1lbnQpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY29tbWl0Q29tYm9WYWx1ZShpbnB1dCwgaW5wdXQudmFsdWUsIGVsZW1lbnQpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBtYXRjaGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghbWF0Y2hlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgT3B0aW9uIG5vdCBmb3VuZDogJHt2YWx1ZX1gKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldENoZWNrYm94KGNvbnRyb2xOYW1lLCBjaGVja2VkKSB7XHJcbiAgICBjb25zdCBjb250YWluZXIgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgIFxyXG4gICAgaWYgKCFjb250YWluZXIpIHtcclxuICAgICAgICBsb2dTdGVwKGBXYXJuaW5nOiBDaGVja2JveCAke2NvbnRyb2xOYW1lfSBub3QgZm91bmRgKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IGNoZWNrYm94ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiY2hlY2tib3hcIl0nKTtcclxuICAgIFxyXG4gICAgY29uc3QgY3VycmVudFN0YXRlID0gY2hlY2tib3g/LmNoZWNrZWQgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnb24nKTtcclxuICAgIFxyXG4gICAgaWYgKGN1cnJlbnRTdGF0ZSAhPT0gY2hlY2tlZCkge1xyXG4gICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gY2hlY2tib3ggfHwgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsLCBidXR0b24nKSB8fCBjb250YWluZXI7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgIH1cclxufVxyXG4iLCAiaW1wb3J0IEQzNjVJbnNwZWN0b3IgZnJvbSAnLi9pbnNwZWN0b3IvRDM2NUluc3BlY3Rvci5qcyc7XHJcbmltcG9ydCB7IGxvZ1N0ZXAsIHNlbmRMb2cgfSBmcm9tICcuL3V0aWxzL2xvZ2dpbmcuanMnO1xyXG5pbXBvcnQgeyBzbGVlcCB9IGZyb20gJy4vdXRpbHMvYXN5bmMuanMnO1xyXG5pbXBvcnQgeyBjb2VyY2VCb29sZWFuLCBub3JtYWxpemVUZXh0IH0gZnJvbSAnLi91dGlscy90ZXh0LmpzJztcclxuaW1wb3J0IHsgTmF2aWdhdGlvbkludGVycnVwdEVycm9yIH0gZnJvbSAnLi9ydW50aW1lL2Vycm9ycy5qcyc7XHJcbmltcG9ydCB7IGNsaWNrRWxlbWVudCwgYXBwbHlHcmlkRmlsdGVyLCB3YWl0VW50aWxDb25kaXRpb24sIHNldElucHV0VmFsdWUsIHNldEdyaWRDZWxsVmFsdWUsIHNldExvb2t1cFNlbGVjdFZhbHVlLCBzZXRDaGVja2JveFZhbHVlLCBuYXZpZ2F0ZVRvRm9ybSwgYWN0aXZhdGVUYWIsIGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uLCBjb25maWd1cmVRdWVyeUZpbHRlciwgY29uZmlndXJlQmF0Y2hQcm9jZXNzaW5nLCBjbG9zZURpYWxvZywgY29uZmlndXJlUmVjdXJyZW5jZSB9IGZyb20gJy4vc3RlcHMvYWN0aW9ucy5qcyc7XHJcblxyXG5cclxud2luZG93LkQzNjVJbnNwZWN0b3IgPSBEMzY1SW5zcGVjdG9yO1xyXG5cclxuLy8gPT09PT09IEluaXRpYWxpemUgYW5kIExpc3RlbiBmb3IgTWVzc2FnZXMgPT09PT09XHJcblxyXG4vLyBQcmV2ZW50IGR1cGxpY2F0ZSBpbml0aWFsaXphdGlvblxyXG5pZiAod2luZG93LmQzNjVJbmplY3RlZFNjcmlwdExvYWRlZCkge1xyXG4gICAgY29uc29sZS5sb2coJ0QzNjUgaW5qZWN0ZWQgc2NyaXB0IGFscmVhZHkgbG9hZGVkLCBza2lwcGluZy4uLicpO1xyXG59IGVsc2Uge1xyXG4gICAgd2luZG93LmQzNjVJbmplY3RlZFNjcmlwdExvYWRlZCA9IHRydWU7XHJcblxyXG4gICAgLy8gQ3JlYXRlIGluc3BlY3RvciBpbnN0YW5jZVxyXG4gICAgY29uc3QgaW5zcGVjdG9yID0gbmV3IEQzNjVJbnNwZWN0b3IoKTtcclxuXHJcbiAgICAvLyA9PT09PT0gV29ya2Zsb3cgRXhlY3V0aW9uIEVuZ2luZSA9PT09PT1cclxuICAgIGxldCBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IHt9O1xyXG4gICAgd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzO1xyXG4gICAgbGV0IGN1cnJlbnRXb3JrZmxvdyA9IG51bGw7XHJcbiAgICBsZXQgZXhlY3V0aW9uQ29udHJvbCA9IHtcclxuICAgICAgICBpc1BhdXNlZDogZmFsc2UsXHJcbiAgICAgICAgaXNTdG9wcGVkOiBmYWxzZSxcclxuICAgICAgICBjdXJyZW50U3RlcEluZGV4OiAwLFxyXG4gICAgICAgIGN1cnJlbnRSb3dJbmRleDogMCxcclxuICAgICAgICB0b3RhbFJvd3M6IDAsXHJcbiAgICAgICAgY3VycmVudERhdGFSb3c6IG51bGwsXHJcbiAgICAgICAgcnVuT3B0aW9uczoge1xyXG4gICAgICAgICAgICBza2lwUm93czogMCxcclxuICAgICAgICAgICAgbGltaXRSb3dzOiAwLFxyXG4gICAgICAgICAgICBkcnlSdW46IGZhbHNlXHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBTaW5nbGUgdW5pZmllZCBtZXNzYWdlIGxpc3RlbmVyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCAoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKGV2ZW50LnNvdXJjZSAhPT0gd2luZG93KSByZXR1cm47XG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc2NvdmVyeSByZXF1ZXN0c1xyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X0RJU0NPVkVSX0VMRU1FTlRTJykge1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVGb3JtT25seSA9IGV2ZW50LmRhdGEuYWN0aXZlRm9ybU9ubHkgfHwgZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gaW5zcGVjdG9yLmRpc2NvdmVyRWxlbWVudHMoYWN0aXZlRm9ybU9ubHkpO1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVGb3JtID0gaW5zcGVjdG9yLmdldEFjdGl2ZUZvcm1OYW1lKCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9FTEVNRU5UU19ESVNDT1ZFUkVEJyxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnRzOiBlbGVtZW50cy5tYXAoZWwgPT4gKHtcclxuICAgICAgICAgICAgICAgICAgICAuLi5lbCxcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB1bmRlZmluZWQgLy8gUmVtb3ZlIERPTSByZWZlcmVuY2UgZm9yIHNlcmlhbGl6YXRpb25cclxuICAgICAgICAgICAgICAgIH0pKSxcclxuICAgICAgICAgICAgICAgIGFjdGl2ZUZvcm06IGFjdGl2ZUZvcm1cclxuICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUQVJUX1BJQ0tFUicpIHtcclxuICAgICAgICAgICAgaW5zcGVjdG9yLnN0YXJ0RWxlbWVudFBpY2tlcigoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgLy8gQWRkIGZvcm0gbmFtZSB0byBwaWNrZWQgZWxlbWVudFxyXG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBpbnNwZWN0b3IuZ2V0RWxlbWVudEZvcm1OYW1lKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7ZWxlbWVudC5jb250cm9sTmFtZX1cIl1gKSk7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X0VMRU1FTlRfUElDS0VEJyxcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB7IC4uLmVsZW1lbnQsIGZvcm1OYW1lIH1cclxuICAgICAgICAgICAgICAgIH0sICcqJyk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RPUF9QSUNLRVInKSB7XHJcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfRVhFQ1VURV9XT1JLRkxPVycpIHtcbiAgICAgICAgICAgIGV4ZWN1dGVXb3JrZmxvdyhldmVudC5kYXRhLndvcmtmbG93LCBldmVudC5kYXRhLmRhdGEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfTkFWX0JVVFRPTlNfVVBEQVRFJykge1xuICAgICAgICAgICAgdXBkYXRlTmF2QnV0dG9ucyhldmVudC5kYXRhLnBheWxvYWQpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBFeGVjdXRpb24gY29udHJvbHNcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfUEFVU0VfV09SS0ZMT1cnKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9SRVNVTUVfV09SS0ZMT1cnKSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RPUF9XT1JLRkxPVycpIHtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgbGV0IHBlbmRpbmdOYXZCdXR0b25zUGF5bG9hZCA9IG51bGw7XG4gICAgbGV0IG5hdkJ1dHRvbnNSZXRyeVRpbWVyID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIHVwZGF0ZU5hdkJ1dHRvbnMocGF5bG9hZCkge1xuICAgICAgICBwZW5kaW5nTmF2QnV0dG9uc1BheWxvYWQgPSBwYXlsb2FkIHx8IG51bGw7XG4gICAgICAgIHJlbmRlck5hdkJ1dHRvbnMoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJOYXZCdXR0b25zKCkge1xuICAgICAgICBjb25zdCBwYXlsb2FkID0gcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkO1xuICAgICAgICBpZiAoIXBheWxvYWQpIHJldHVybjtcblxuICAgICAgICBjb25zdCBuYXZHcm91cCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduYXZpZ2F0aW9uTWFpbkFjdGlvbkdyb3VwJyk7XG4gICAgICAgIGlmICghbmF2R3JvdXApIHtcbiAgICAgICAgICAgIGlmICghbmF2QnV0dG9uc1JldHJ5VGltZXIpIHtcbiAgICAgICAgICAgICAgICBuYXZCdXR0b25zUmV0cnlUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBuYXZCdXR0b25zUmV0cnlUaW1lciA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlck5hdkJ1dHRvbnMoKTtcbiAgICAgICAgICAgICAgICB9LCAxMDAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2QzNjUtbmF2LWJ1dHRvbnMtY29udGFpbmVyJyk7XG4gICAgICAgIGlmIChleGlzdGluZ0NvbnRhaW5lcikge1xuICAgICAgICAgICAgZXhpc3RpbmdDb250YWluZXIucmVtb3ZlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBidXR0b25zID0gQXJyYXkuaXNBcnJheShwYXlsb2FkLmJ1dHRvbnMpID8gcGF5bG9hZC5idXR0b25zIDogW107XG4gICAgICAgIGlmICghYnV0dG9ucy5sZW5ndGgpIHJldHVybjtcblxuICAgICAgICBjb25zdCBjdXJyZW50TWVudUl0ZW0gPSAocGF5bG9hZC5tZW51SXRlbSB8fCAnJykudG9Mb3dlckNhc2UoKTtcblxuICAgICAgICBjb25zdCB2aXNpYmxlQnV0dG9ucyA9IGJ1dHRvbnMuZmlsdGVyKChidXR0b24pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG1lbnVJdGVtcyA9IEFycmF5LmlzQXJyYXkoYnV0dG9uLm1lbnVJdGVtcykgPyBidXR0b24ubWVudUl0ZW1zIDogW107XG4gICAgICAgICAgICBpZiAoIW1lbnVJdGVtcy5sZW5ndGgpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgaWYgKCFjdXJyZW50TWVudUl0ZW0pIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiBtZW51SXRlbXMuc29tZSgoaXRlbSkgPT4gKGl0ZW0gfHwgJycpLnRvTG93ZXJDYXNlKCkgPT09IGN1cnJlbnRNZW51SXRlbSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICghdmlzaWJsZUJ1dHRvbnMubGVuZ3RoKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGNvbnRhaW5lci5pZCA9ICdkMzY1LW5hdi1idXR0b25zLWNvbnRhaW5lcic7XG4gICAgICAgIGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuZ2FwID0gJzZweCc7XG4gICAgICAgIGNvbnRhaW5lci5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG4gICAgICAgIGNvbnRhaW5lci5zdHlsZS5tYXJnaW5SaWdodCA9ICc2cHgnO1xuXG4gICAgICAgIHZpc2libGVCdXR0b25zLmZvckVhY2goKGJ1dHRvbkNvbmZpZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uV3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgYnV0dG9uV3JhcHBlci5jbGFzc05hbWUgPSAnbmF2aWdhdGlvbkJhci1jb21wYW55IG5hdmlnYXRpb25CYXItcGlubmVkRWxlbWVudCc7XG5cbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbkVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICBidXR0b25FbC50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgICAgICBidXR0b25FbC5jbGFzc05hbWUgPSAnbmF2aWdhdGlvbkJhci1zZWFyY2gnO1xuICAgICAgICAgICAgYnV0dG9uRWwudGV4dENvbnRlbnQgPSBidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdyc7XG4gICAgICAgICAgICBidXR0b25FbC50aXRsZSA9IGJ1dHRvbkNvbmZpZy5uYW1lIHx8ICcnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc2V0QXR0cmlidXRlKCdkYXRhLWQzNjUtbmF2LWJ1dHRvbi1pZCcsIGJ1dHRvbkNvbmZpZy5pZCB8fCAnJyk7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5oZWlnaHQgPSAnMjRweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5wYWRkaW5nID0gJzAgOHB4JztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc0cHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMzUpJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmJhY2tncm91bmQgPSAncmdiYSgyNTUsMjU1LDI1NSwwLjEyKSc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5jb2xvciA9ICcjZmZmZmZmJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmZvbnRTaXplID0gJzEycHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZm9udFdlaWdodCA9ICc2MDAnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUubGluZUhlaWdodCA9ICcyMnB4JztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLndoaXRlU3BhY2UgPSAnbm93cmFwJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnY2VudGVyJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmJveFNoYWRvdyA9ICdpbnNldCAwIDAgMCAxcHggcmdiYSgyNTUsMjU1LDI1NSwwLjA4KSc7XG5cbiAgICAgICAgICAgIGJ1dHRvbkVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHdvcmtmbG93ID0gYnV0dG9uQ29uZmlnLndvcmtmbG93O1xuICAgICAgICAgICAgICAgIGlmICghd29ya2Zsb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnZXJyb3InLCBgV29ya2Zsb3cgbm90IGZvdW5kIGZvciBuYXYgYnV0dG9uOiAke2J1dHRvbkNvbmZpZy5uYW1lIHx8IGJ1dHRvbkNvbmZpZy5pZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gd29ya2Zsb3cuZGF0YVNvdXJjZXM/LnByaW1hcnk/LmRhdGEgfHwgd29ya2Zsb3cuZGF0YVNvdXJjZT8uZGF0YSB8fCBbXTtcbiAgICAgICAgICAgICAgICBleGVjdXRlV29ya2Zsb3cod29ya2Zsb3csIGRhdGEpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGJ1dHRvbldyYXBwZXIuYXBwZW5kQ2hpbGQoYnV0dG9uRWwpO1xuICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGJ1dHRvbldyYXBwZXIpO1xuICAgICAgICB9KTtcblxuICAgICAgICBuYXZHcm91cC5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBuYXZHcm91cC5maXJzdENoaWxkKTtcbiAgICB9XG5cclxuICAgIC8vIEhlbHBlciB0byBjaGVjayBhbmQgd2FpdCBmb3IgcGF1c2Uvc3RvcFxyXG4gICAgYXN5bmMgZnVuY3Rpb24gY2hlY2tFeGVjdXRpb25Db250cm9sKCkge1xyXG4gICAgaWYgKGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdXb3JrZmxvdyBzdG9wcGVkIGJ5IHVzZXInKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgd2hpbGUgKGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQpIHtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgIGlmIChleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dvcmtmbG93IHN0b3BwZWQgYnkgdXNlcicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVdvcmtmbG93KHdvcmtmbG93LCBkYXRhKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gQ2xlYXIgYW55IHN0YWxlIHBlbmRpbmcgbmF2aWdhdGlvbiBzdGF0ZSBiZWZvcmUgc3RhcnRpbmcgYSBuZXcgcnVuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBzZXNzaW9uU3RvcmFnZS5yZW1vdmVJdGVtKCdkMzY1X3BlbmRpbmdfd29ya2Zsb3cnKTtcbiAgICAgICAgICAgIGlmICh3b3JrZmxvdz8uaWQpIHtcbiAgICAgICAgICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdkMzY1X2FjdGl2ZV93b3JrZmxvd19pZCcsIHdvcmtmbG93LmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgLy8gSWdub3JlIHNlc3Npb25TdG9yYWdlIGVycm9ycyAoZS5nLiwgaW4gcmVzdHJpY3RlZCBjb250ZXh0cylcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgU3RhcnRpbmcgd29ya2Zsb3c6ICR7d29ya2Zsb3c/Lm5hbWUgfHwgd29ya2Zsb3c/LmlkIHx8ICd1bm5hbWVkJ31gKTtcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogeyBwaGFzZTogJ3dvcmtmbG93U3RhcnQnLCB3b3JrZmxvdzogd29ya2Zsb3c/Lm5hbWUgfHwgd29ya2Zsb3c/LmlkIH0gfSwgJyonKTtcbiAgICAgICAgLy8gUmVzZXQgZXhlY3V0aW9uIGNvbnRyb2xcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XHJcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQgPSBmYWxzZTtcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnMgPSB3b3JrZmxvdy5ydW5PcHRpb25zIHx8IHsgc2tpcFJvd3M6IDAsIGxpbWl0Um93czogMCwgZHJ5UnVuOiBmYWxzZSB9O1xyXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvdyA9IHdvcmtmbG93O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gd29ya2Zsb3c/LnNldHRpbmdzIHx8IHt9O1xyXG4gICAgICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncztcclxuICAgICAgICAvLyBFeHBvc2UgY3VycmVudCB3b3JrZmxvdyBhbmQgZXhlY3V0aW9uIGNvbnRyb2wgdG8gaW5qZWN0ZWQgYWN0aW9uIG1vZHVsZXNcclxuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyA9IGN1cnJlbnRXb3JrZmxvdztcclxuICAgICAgICB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2wgPSBleGVjdXRpb25Db250cm9sO1xyXG4gICAgICAgIGNvbnN0IHN0ZXBzID0gd29ya2Zsb3cuc3RlcHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gR2V0IGRhdGEgZnJvbSBuZXcgZGF0YVNvdXJjZXMgc3RydWN0dXJlIG9yIGxlZ2FjeSBkYXRhU291cmNlXHJcbiAgICAgICAgbGV0IHByaW1hcnlEYXRhID0gW107XHJcbiAgICAgICAgbGV0IGRldGFpbFNvdXJjZXMgPSB7fTtcclxuICAgICAgICBsZXQgcmVsYXRpb25zaGlwcyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh3b3JrZmxvdy5kYXRhU291cmNlcykge1xyXG4gICAgICAgICAgICBwcmltYXJ5RGF0YSA9IHdvcmtmbG93LmRhdGFTb3VyY2VzLnByaW1hcnk/LmRhdGEgfHwgW107XHJcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcHMgPSB3b3JrZmxvdy5kYXRhU291cmNlcy5yZWxhdGlvbnNoaXBzIHx8IFtdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gSW5kZXggZGV0YWlsIGRhdGEgc291cmNlcyBieSBJRFxyXG4gICAgICAgICAgICAod29ya2Zsb3cuZGF0YVNvdXJjZXMuZGV0YWlscyB8fCBbXSkuZm9yRWFjaChkZXRhaWwgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGRldGFpbC5kYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsU291cmNlc1tkZXRhaWwuaWRdID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBkZXRhaWwuZGF0YSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZGV0YWlsLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkczogZGV0YWlsLmZpZWxkc1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZGF0YSkge1xyXG4gICAgICAgICAgICAvLyBMZWdhY3kgZm9ybWF0XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gQXJyYXkuaXNBcnJheShkYXRhKSA/IGRhdGEgOiBbZGF0YV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElmIG5vIGRhdGEsIHVzZSBhIHNpbmdsZSBlbXB0eSByb3cgdG8gcnVuIHN0ZXBzIG9uY2VcclxuICAgICAgICBpZiAocHJpbWFyeURhdGEubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gW3t9XTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEV4ZWN1dGUgd29ya2Zsb3cgd2l0aCBsb29wIHN1cHBvcnRcclxuICAgICAgICBhd2FpdCBleGVjdXRlU3RlcHNXaXRoTG9vcHMoc3RlcHMsIHByaW1hcnlEYXRhLCBkZXRhaWxTb3VyY2VzLCByZWxhdGlvbnNoaXBzLCB3b3JrZmxvdy5zZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgV29ya2Zsb3cgY29tcGxldGU6IHByb2Nlc3NlZCAke3ByaW1hcnlEYXRhLmxlbmd0aH0gcm93c2ApO1xyXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0NPTVBMRVRFJyxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IHByb2Nlc3NlZDogcHJpbWFyeURhdGEubGVuZ3RoIH1cclxuICAgICAgICB9LCAnKicpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAvLyBOYXZpZ2F0aW9uIGludGVycnVwdHMgYXJlIG5vdCBlcnJvcnMgLSB0aGUgd29ya2Zsb3cgd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkXHJcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmlzTmF2aWdhdGlvbkludGVycnVwdCkge1xyXG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgJ1dvcmtmbG93IHBhdXNlZCBmb3IgbmF2aWdhdGlvbiAtIHdpbGwgcmVzdW1lIGFmdGVyIHBhZ2UgbG9hZHMnKTtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBEb24ndCByZXBvcnQgYXMgZXJyb3Igb3IgY29tcGxldGVcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFlcnJvciB8fCAhZXJyb3IuX3JlcG9ydGVkKSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFdvcmtmbG93IGVycm9yOiAke2Vycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19FUlJPUicsXHJcbiAgICAgICAgICAgICAgICBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycm9yKSxcclxuICAgICAgICAgICAgICAgIHN0YWNrOiBlcnJvcj8uc3RhY2tcclxuICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVTdGVwVmFsdWUoc3RlcCwgY3VycmVudFJvdykge1xuICAgIGNvbnN0IHNvdXJjZSA9IHN0ZXA/LnZhbHVlU291cmNlIHx8IChzdGVwPy5maWVsZE1hcHBpbmcgPyAnZGF0YScgOiAnc3RhdGljJyk7XG5cbiAgICBpZiAoc291cmNlID09PSAnY2xpcGJvYXJkJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFuYXZpZ2F0b3IuY2xpcGJvYXJkPy5yZWFkVGV4dCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2xpcGJvYXJkIEFQSSBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC5yZWFkVGV4dCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRleHQgPz8gJyc7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBDbGlwYm9hcmQgcmVhZCBmYWlsZWQ6ICR7ZXJyb3I/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycm9yKX1gKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2xpcGJvYXJkIHJlYWQgZmFpbGVkJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc291cmNlID09PSAnZGF0YScpIHtcbiAgICAgICAgY29uc3Qgcm93ID0gY3VycmVudFJvdyB8fCB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnREYXRhUm93IHx8IHt9O1xuICAgICAgICBjb25zdCBmaWVsZCA9IHN0ZXA/LmZpZWxkTWFwcGluZyB8fCAnJztcbiAgICAgICAgaWYgKCFmaWVsZCkgcmV0dXJuICcnO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHJvd1tmaWVsZF07XG4gICAgICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xuICAgIH1cblxuICAgIHJldHVybiBzdGVwPy52YWx1ZSA/PyAnJztcbn1cblxuLy8gRXhlY3V0ZSBhIHNpbmdsZSBzdGVwIChtYXBzIHN0ZXAudHlwZSB0byBhY3Rpb24gZnVuY3Rpb25zKVxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVNpbmdsZVN0ZXAoc3RlcCwgc3RlcEluZGV4LCBjdXJyZW50Um93LCBkZXRhaWxTb3VyY2VzLCBzZXR0aW5ncywgZHJ5UnVuKSB7XG4gICAgY29uc3Qgc3RlcExhYmVsID0gc3RlcC5kaXNwbGF5VGV4dCB8fCBzdGVwLmNvbnRyb2xOYW1lIHx8IHN0ZXAudHlwZSB8fCBgc3RlcCAke3N0ZXBJbmRleH1gO1xyXG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXHJcbiAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwU3RhcnQnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IHN0ZXBJbmRleCB9XHJcbiAgICB9LCAnKicpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgICAvLyBOb3JtYWxpemUgc3RlcCB0eXBlIChhbGxvdyBib3RoIGNhbWVsQ2FzZSBhbmQgZGFzaC1zZXBhcmF0ZWQgdHlwZXMpXHJcbiAgICAgICAgY29uc3Qgc3RlcFR5cGUgPSAoc3RlcC50eXBlIHx8ICcnKS5yZXBsYWNlKC8tKFthLXpdKS9nLCAoXywgYykgPT4gYy50b1VwcGVyQ2FzZSgpKTtcclxuICAgICAgICBsb2dTdGVwKGBTdGVwICR7c3RlcEluZGV4ICsgMX06ICR7c3RlcFR5cGV9IC0+ICR7c3RlcExhYmVsfWApO1xyXG5cclxuICAgICAgICAvLyBSZXNwZWN0IGRyeSBydW4gbW9kZVxyXG4gICAgICAgIGlmIChkcnlSdW4pIHtcclxuICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBEcnkgcnVuIC0gc2tpcHBpbmcgYWN0aW9uOiAke3N0ZXAudHlwZX0gJHtzdGVwLmNvbnRyb2xOYW1lIHx8ICcnfWApO1xyXG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxyXG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwRG9uZScsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogc3RlcEluZGV4IH1cclxuICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHJlc29sdmVkVmFsdWUgPSBudWxsO1xuICAgICAgICBpZiAoWydpbnB1dCcsICdzZWxlY3QnLCAnbG9va3VwU2VsZWN0JywgJ2dyaWRJbnB1dCcsICdmaWx0ZXInLCAncXVlcnlGaWx0ZXInXS5pbmNsdWRlcyhzdGVwVHlwZSkpIHtcbiAgICAgICAgICAgIHJlc29sdmVkVmFsdWUgPSBhd2FpdCByZXNvbHZlU3RlcFZhbHVlKHN0ZXAsIGN1cnJlbnRSb3cpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3dpdGNoIChzdGVwVHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnY2xpY2snOlxuICAgICAgICAgICAgICAgIGlmIChzdGVwLndhaXRVbnRpbFZpc2libGUpIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbihzdGVwLmNvbnRyb2xOYW1lLCAndmlzaWJsZScsIG51bGwsIDUwMDApO1xuICAgICAgICAgICAgICAgIGF3YWl0IGNsaWNrRWxlbWVudChzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnaW5wdXQnOlxuICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzpcbiAgICAgICAgICAgICAgICBpZiAoc3RlcC53YWl0VW50aWxWaXNpYmxlKSBhd2FpdCB3YWl0VW50aWxDb25kaXRpb24oc3RlcC5jb250cm9sTmFtZSwgJ3Zpc2libGUnLCBudWxsLCA1MDAwKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIHJlc29sdmVkVmFsdWUsIHN0ZXAuZmllbGRUeXBlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnbG9va3VwU2VsZWN0JzpcbiAgICAgICAgICAgICAgICBpZiAoc3RlcC53YWl0VW50aWxWaXNpYmxlKSBhd2FpdCB3YWl0VW50aWxDb25kaXRpb24oc3RlcC5jb250cm9sTmFtZSwgJ3Zpc2libGUnLCBudWxsLCA1MDAwKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRMb29rdXBTZWxlY3RWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxyXG4gICAgICAgICAgICBjYXNlICdjaGVja2JveCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRDaGVja2JveFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIGNvZXJjZUJvb2xlYW4oc3RlcC52YWx1ZSkpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdncmlkSW5wdXQnOlxuICAgICAgICAgICAgICAgIGF3YWl0IHNldEdyaWRDZWxsVmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWVsZFR5cGUsICEhc3RlcC53YWl0Rm9yVmFsaWRhdGlvbik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2ZpbHRlcic6XG4gICAgICAgICAgICAgICAgYXdhaXQgYXBwbHlHcmlkRmlsdGVyKHN0ZXAuY29udHJvbE5hbWUsIHJlc29sdmVkVmFsdWUsIHN0ZXAuZmlsdGVyTWV0aG9kIHx8ICdpcyBleGFjdGx5Jyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdxdWVyeUZpbHRlcic6XG4gICAgICAgICAgICAgICAgYXdhaXQgY29uZmlndXJlUXVlcnlGaWx0ZXIoc3RlcC50YWJsZU5hbWUsIHN0ZXAuZmllbGROYW1lLCByZXNvbHZlZFZhbHVlLCB7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVkUXVlcnk6IHN0ZXAuc2F2ZWRRdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VEaWFsb2dBZnRlcjogc3RlcC5jbG9zZURpYWxvZ0FmdGVyXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cclxuICAgICAgICAgICAgY2FzZSAnd2FpdCc6XG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoTnVtYmVyKHN0ZXAuZHVyYXRpb24pIHx8IDUwMCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ3dhaXRVbnRpbCc6XG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKFxuICAgICAgICAgICAgICAgICAgICBzdGVwLmNvbnRyb2xOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzdGVwLndhaXRDb25kaXRpb24gfHwgJ3Zpc2libGUnLFxuICAgICAgICAgICAgICAgICAgICBzdGVwLndhaXRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgc3RlcC50aW1lb3V0IHx8IDEwMDAwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnbmF2aWdhdGUnOlxuICAgICAgICAgICAgICAgIGF3YWl0IG5hdmlnYXRlVG9Gb3JtKHN0ZXApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXHJcbiAgICAgICAgICAgIGNhc2UgJ2FjdGl2YXRlVGFiJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBhY3RpdmF0ZVRhYihzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3RhYk5hdmlnYXRlJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBhY3RpdmF0ZVRhYihzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxyXG4gICAgICAgICAgICBjYXNlICdleHBhbmRTZWN0aW9uJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKHN0ZXAuY29udHJvbE5hbWUsICdleHBhbmQnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnY29sbGFwc2VTZWN0aW9uJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKHN0ZXAuY29udHJvbE5hbWUsICdjb2xsYXBzZScpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdjbG9zZURpYWxvZyc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjbG9zZURpYWxvZygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBzdGVwIHR5cGU6ICR7c3RlcC50eXBlfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxyXG4gICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBEb25lJywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBzdGVwSW5kZXggfVxyXG4gICAgICAgIH0sICcqJyk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAvLyBSZS10aHJvdyBuYXZpZ2F0aW9uIGludGVycnVwdHMgZm9yIHVwc3RyZWFtIGhhbmRsaW5nXHJcbiAgICAgICAgaWYgKGVyciAmJiBlcnIuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB0aHJvdyBlcnI7XHJcbiAgICAgICAgc2VuZExvZygnZXJyb3InLCBgRXJyb3IgZXhlY3V0aW5nIHN0ZXAgJHtzdGVwSW5kZXggKyAxfTogJHtlcnI/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycil9YCk7XHJcbiAgICAgICAgdGhyb3cgZXJyO1xyXG4gICAgfVxyXG59XHJcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTdGVwc1dpdGhMb29wcyhzdGVwcywgcHJpbWFyeURhdGEsIGRldGFpbFNvdXJjZXMsIHJlbGF0aW9uc2hpcHMsIHNldHRpbmdzKSB7XHJcbiAgICAvLyBBcHBseSBza2lwL2xpbWl0IHJvd3MgZnJvbSBydW4gb3B0aW9uc1xyXG4gICAgY29uc3QgeyBza2lwUm93cyA9IDAsIGxpbWl0Um93cyA9IDAsIGRyeVJ1biA9IGZhbHNlIH0gPSBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnM7XHJcbiAgICBcclxuICAgIGNvbnN0IG9yaWdpbmFsVG90YWxSb3dzID0gcHJpbWFyeURhdGEubGVuZ3RoO1xyXG4gICAgbGV0IHN0YXJ0Um93TnVtYmVyID0gMDsgLy8gVGhlIHN0YXJ0aW5nIHJvdyBudW1iZXIgZm9yIGRpc3BsYXlcclxuICAgIFxyXG4gICAgaWYgKHNraXBSb3dzID4gMCkge1xyXG4gICAgICAgIHByaW1hcnlEYXRhID0gcHJpbWFyeURhdGEuc2xpY2Uoc2tpcFJvd3MpO1xyXG4gICAgICAgIHN0YXJ0Um93TnVtYmVyID0gc2tpcFJvd3M7XHJcbiAgICAgICAgc2VuZExvZygnaW5mbycsIGBTa2lwcGVkIGZpcnN0ICR7c2tpcFJvd3N9IHJvd3NgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGxpbWl0Um93cyA+IDAgJiYgcHJpbWFyeURhdGEubGVuZ3RoID4gbGltaXRSb3dzKSB7XHJcbiAgICAgICAgcHJpbWFyeURhdGEgPSBwcmltYXJ5RGF0YS5zbGljZSgwLCBsaW1pdFJvd3MpO1xyXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgTGltaXRlZCB0byAke2xpbWl0Um93c30gcm93c2ApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCB0b3RhbFJvd3NUb1Byb2Nlc3MgPSBwcmltYXJ5RGF0YS5sZW5ndGg7XHJcbiAgICBleGVjdXRpb25Db250cm9sLnRvdGFsUm93cyA9IG9yaWdpbmFsVG90YWxSb3dzO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIGxvb3Agc3RydWN0dXJlc1xyXG4gICAgY29uc3QgbG9vcFBhaXJzID0gZmluZExvb3BQYWlycyhzdGVwcyk7XHJcblxyXG4gICAgLy8gSGVscGVyOiBmaW5kIG1hdGNoaW5nIGxvb3Agc3RhcnQvZW5kIHBhaXJzIHN1cHBvcnRpbmcgbmVzdGVkIGxvb3BzIGFuZCBleHBsaWNpdCBsb29wUmVmIGxpbmtpbmdcclxuICAgIGZ1bmN0aW9uIGZpbmRMb29wUGFpcnMoc3RlcHNMaXN0KSB7XHJcbiAgICAgICAgY29uc3Qgc3RhY2sgPSBbXTtcclxuICAgICAgICBjb25zdCBwYWlycyA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ZXBzTGlzdC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBzID0gc3RlcHNMaXN0W2ldO1xyXG4gICAgICAgICAgICBpZiAoIXMgfHwgIXMudHlwZSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBpZiAocy50eXBlID09PSAnbG9vcC1zdGFydCcpIHtcclxuICAgICAgICAgICAgICAgIC8vIHB1c2ggc3RhcnQgd2l0aCBpdHMgaWQgKGlmIHByZXNlbnQpIHNvIGxvb3AtZW5kIGNhbiBtYXRjaCBieSBsb29wUmVmXHJcbiAgICAgICAgICAgICAgICBzdGFjay5wdXNoKHsgc3RhcnRJbmRleDogaSwgaWQ6IHMuaWQgfSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocy50eXBlID09PSAnbG9vcC1lbmQnKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgbWF0Y2hlZCA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gSWYgbG9vcC1lbmQgcmVmZXJlbmNlcyBhIHNwZWNpZmljIHN0YXJ0IGlkLCB0cnkgdG8gbWF0Y2ggdGhhdFxyXG4gICAgICAgICAgICAgICAgaWYgKHMubG9vcFJlZikge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSBzdGFjay5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhY2tbal0uaWQgPT09IHMubG9vcFJlZikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlZCA9IHsgc3RhcnRJbmRleDogc3RhY2tbal0uc3RhcnRJbmRleCwgZW5kSW5kZXg6IGkgfTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrLnNwbGljZShqLCAxKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBtYXRjaCB0aGUgbW9zdCByZWNlbnQgdW5tYXRjaGVkIGxvb3Atc3RhcnQgKExJRk8pXHJcbiAgICAgICAgICAgICAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0ID0gc3RhY2sucG9wKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxhc3QpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlZCA9IHsgc3RhcnRJbmRleDogbGFzdC5zdGFydEluZGV4LCBlbmRJbmRleDogaSB9O1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFVubWF0Y2hlZCBsb29wLWVuZCAtIGlnbm9yZSBidXQgbG9nXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFVubWF0Y2hlZCBsb29wLWVuZCBhdCBpbmRleCAke2l9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChtYXRjaGVkKSBwYWlycy5wdXNoKG1hdGNoZWQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc3RhY2subGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIC8vIFNvbWUgbG9vcC1zdGFydHMgd2VyZSBub3QgY2xvc2VkXHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgcmVtIG9mIHN0YWNrKSB7XHJcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBVbmNsb3NlZCBsb29wLXN0YXJ0IGF0IGluZGV4ICR7cmVtLnN0YXJ0SW5kZXh9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNvcnQgcGFpcnMgYnkgc3RhcnQgaW5kZXggYXNjZW5kaW5nXHJcbiAgICAgICAgcGFpcnMuc29ydCgoYSwgYikgPT4gYS5zdGFydEluZGV4IC0gYi5zdGFydEluZGV4KTtcclxuICAgICAgICByZXR1cm4gcGFpcnM7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgbm8gbG9vcHMsIGV4ZWN1dGUgYWxsIHN0ZXBzIGZvciBlYWNoIHByaW1hcnkgZGF0YSByb3cgKGxlZ2FjeSBiZWhhdmlvcilcclxuICAgIGlmIChsb29wUGFpcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgZm9yIChsZXQgcm93SW5kZXggPSAwOyByb3dJbmRleCA8IHByaW1hcnlEYXRhLmxlbmd0aDsgcm93SW5kZXgrKykge1xyXG4gICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTsgLy8gQ2hlY2sgZm9yIHBhdXNlL3N0b3BcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IHByaW1hcnlEYXRhW3Jvd0luZGV4XTtcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVJvd051bWJlciA9IHN0YXJ0Um93TnVtYmVyICsgcm93SW5kZXg7IC8vIEFjdHVhbCByb3cgbnVtYmVyIGluIG9yaWdpbmFsIGRhdGFcclxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50Um93SW5kZXggPSBkaXNwbGF5Um93TnVtYmVyO1xyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnREYXRhUm93ID0gcm93O1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgcm93UHJvZ3Jlc3MgPSB7XHJcbiAgICAgICAgICAgICAgICBwaGFzZTogJ3Jvd1N0YXJ0JyxcclxuICAgICAgICAgICAgICAgIHJvdzogZGlzcGxheVJvd051bWJlcixcclxuICAgICAgICAgICAgICAgIHRvdGFsUm93czogb3JpZ2luYWxUb3RhbFJvd3MsXHJcbiAgICAgICAgICAgICAgICBwcm9jZXNzZWRSb3dzOiByb3dJbmRleCArIDEsXHJcbiAgICAgICAgICAgICAgICB0b3RhbFRvUHJvY2VzczogdG90YWxSb3dzVG9Qcm9jZXNzLFxyXG4gICAgICAgICAgICAgICAgc3RlcDogJ1Byb2Nlc3Npbmcgcm93J1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFByb2Nlc3Npbmcgcm93ICR7ZGlzcGxheVJvd051bWJlciArIDF9LyR7b3JpZ2luYWxUb3RhbFJvd3N9YCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHJvd1Byb2dyZXNzIH0sICcqJyk7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBzdGVwSW5kZXggPSAwOyBzdGVwSW5kZXggPCBzdGVwcy5sZW5ndGg7IHN0ZXBJbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTsgLy8gQ2hlY2sgZm9yIHBhdXNlL3N0b3BcclxuICAgICAgICAgICAgICAgIGF3YWl0IGV4ZWN1dGVTaW5nbGVTdGVwKHN0ZXBzW3N0ZXBJbmRleF0sIHN0ZXBJbmRleCwgcm93LCB7fSwgc2V0dGluZ3MsIGRyeVJ1bik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGxvb3BQYWlyTWFwID0gbmV3IE1hcChsb29wUGFpcnMubWFwKHBhaXIgPT4gW3BhaXIuc3RhcnRJbmRleCwgcGFpci5lbmRJbmRleF0pKTtcclxuICAgIGNvbnN0IGluaXRpYWxEYXRhUm93ID0gcHJpbWFyeURhdGFbMF0gfHwge307XHJcblxyXG4gICAgY29uc3QgcmVzb2x2ZUxvb3BEYXRhID0gKGxvb3BEYXRhU291cmNlLCBjdXJyZW50RGF0YVJvdykgPT4ge1xyXG4gICAgICAgIGxldCBsb29wRGF0YSA9IHByaW1hcnlEYXRhO1xyXG5cclxuICAgICAgICBpZiAobG9vcERhdGFTb3VyY2UgIT09ICdwcmltYXJ5JyAmJiBkZXRhaWxTb3VyY2VzW2xvb3BEYXRhU291cmNlXSkge1xyXG4gICAgICAgICAgICBjb25zdCBkZXRhaWxTb3VyY2UgPSBkZXRhaWxTb3VyY2VzW2xvb3BEYXRhU291cmNlXTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoZXJlJ3MgYSByZWxhdGlvbnNoaXAsIGZpbHRlciBkZXRhaWwgZGF0YSBieSB0aGUgY3VycmVudCBwcmltYXJ5IHJvd1xyXG4gICAgICAgICAgICBjb25zdCByZWwgPSByZWxhdGlvbnNoaXBzLmZpbmQociA9PiByLmRldGFpbElkID09PSBsb29wRGF0YVNvdXJjZSk7XHJcbiAgICAgICAgICAgIGlmIChyZWwgJiYgY3VycmVudERhdGFSb3dbcmVsLnByaW1hcnlGaWVsZF0gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YS5maWx0ZXIoZCA9PiBcclxuICAgICAgICAgICAgICAgICAgICBTdHJpbmcoZFtyZWwuZGV0YWlsRmllbGRdKSA9PT0gU3RyaW5nKGN1cnJlbnREYXRhUm93W3JlbC5wcmltYXJ5RmllbGRdKVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gZGV0YWlsU291cmNlLmRhdGE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBsb29wRGF0YTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgZXhlY3V0ZVJhbmdlID0gYXN5bmMgKHN0YXJ0SWR4LCBlbmRJZHgsIGN1cnJlbnREYXRhUm93KSA9PiB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnREYXRhUm93KSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudERhdGFSb3cgPSBjdXJyZW50RGF0YVJvdztcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IGlkeCA9IHN0YXJ0SWR4O1xyXG5cclxuICAgICAgICB3aGlsZSAoaWR4IDwgZW5kSWR4KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxyXG5cclxuICAgICAgICAgICAgY29uc3Qgc3RlcCA9IHN0ZXBzW2lkeF07XHJcblxyXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnbG9vcC1zdGFydCcpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BFbmRJZHggPSBsb29wUGFpck1hcC5nZXQoaWR4KTtcclxuICAgICAgICAgICAgICAgIGlmIChsb29wRW5kSWR4ID09PSB1bmRlZmluZWQgfHwgbG9vcEVuZElkeCA8PSBpZHgpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExvb3Agc3RhcnQgYXQgaW5kZXggJHtpZHh9IGhhcyBubyBtYXRjaGluZyBlbmRgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBsb29wRGF0YVNvdXJjZSA9IHN0ZXAubG9vcERhdGFTb3VyY2UgfHwgJ3ByaW1hcnknO1xyXG4gICAgICAgICAgICAgICAgbGV0IGxvb3BEYXRhID0gcmVzb2x2ZUxvb3BEYXRhKGxvb3BEYXRhU291cmNlLCBjdXJyZW50RGF0YVJvdyk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgaXRlcmF0aW9uIGxpbWl0XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpdGVyYXRpb25MaW1pdCA9IHN0ZXAuaXRlcmF0aW9uTGltaXQgfHwgMDtcclxuICAgICAgICAgICAgICAgIGlmIChpdGVyYXRpb25MaW1pdCA+IDAgJiYgbG9vcERhdGEubGVuZ3RoID4gaXRlcmF0aW9uTGltaXQpIHtcclxuICAgICAgICAgICAgICAgICAgICBsb29wRGF0YSA9IGxvb3BEYXRhLnNsaWNlKDAsIGl0ZXJhdGlvbkxpbWl0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYEVudGVyaW5nIGxvb3A6ICR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9IChzb3VyY2U9JHtsb29wRGF0YVNvdXJjZX0pIC0gJHtsb29wRGF0YS5sZW5ndGh9IGl0ZXJhdGlvbnNgKTtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGl0ZXJJbmRleCA9IDA7IGl0ZXJJbmRleCA8IGxvb3BEYXRhLmxlbmd0aDsgaXRlckluZGV4KyspIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTsgLy8gQ2hlY2sgZm9yIHBhdXNlL3N0b3BcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXRlclJvdyA9IHsgLi4uY3VycmVudERhdGFSb3csIC4uLmxvb3BEYXRhW2l0ZXJJbmRleF0gfTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc1ByaW1hcnlMb29wID0gbG9vcERhdGFTb3VyY2UgPT09ICdwcmltYXJ5JztcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b3RhbFJvd3NGb3JMb29wID0gaXNQcmltYXJ5TG9vcCA/IG9yaWdpbmFsVG90YWxSb3dzIDogbG9vcERhdGEubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRvdGFsVG9Qcm9jZXNzRm9yTG9vcCA9IGxvb3BEYXRhLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGF5Um93TnVtYmVyID0gaXNQcmltYXJ5TG9vcCA/IHN0YXJ0Um93TnVtYmVyICsgaXRlckluZGV4IDogaXRlckluZGV4O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsb29wUm93UHJvZ3Jlc3MgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBoYXNlOiAncm93U3RhcnQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByb3c6IGRpc3BsYXlSb3dOdW1iZXIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsUm93czogdG90YWxSb3dzRm9yTG9vcCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkUm93czogaXRlckluZGV4ICsgMSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxUb1Byb2Nlc3M6IHRvdGFsVG9Qcm9jZXNzRm9yTG9vcCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3RlcDogJ1Byb2Nlc3Npbmcgcm93J1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBMb29wIGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bG9vcERhdGEubGVuZ3RofSBmb3IgbG9vcCAke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IGxvb3BSb3dQcm9ncmVzcyB9LCAnKicpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiB7IHBoYXNlOiAnbG9vcEl0ZXJhdGlvbicsIGl0ZXJhdGlvbjogaXRlckluZGV4ICsgMSwgdG90YWw6IGxvb3BEYXRhLmxlbmd0aCwgc3RlcDogYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiOiBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke2xvb3BEYXRhLmxlbmd0aH1gIH0gfSwgJyonKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRXhlY3V0ZSBzdGVwcyBpbnNpZGUgdGhlIGxvb3AgKHN1cHBvcnRzIG5lc3RlZCBsb29wcylcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgaXRlclJvdyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWR4ID0gbG9vcEVuZElkeCArIDE7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2xvb3AtZW5kJykge1xyXG4gICAgICAgICAgICAgICAgaWR4Kys7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgYXdhaXQgZXhlY3V0ZVNpbmdsZVN0ZXAoc3RlcCwgaWR4LCBjdXJyZW50RGF0YVJvdywgZGV0YWlsU291cmNlcywgc2V0dGluZ3MsIGV4ZWN1dGlvbkNvbnRyb2wucnVuT3B0aW9ucy5kcnlSdW4pO1xyXG4gICAgICAgICAgICBpZHgrKztcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IGV4ZWN1dGVSYW5nZSgwLCBzdGVwcy5sZW5ndGgsIGluaXRpYWxEYXRhUm93KTtcclxufVxyXG5cclxuXHJcbn0gLy8gRW5kIG9mIGluamVjdGVkIHNjcmlwdCBpbml0aWFsaXphdGlvbiBndWFyZFxyXG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUVBLE1BQXFCLGdCQUFyQixNQUFtQztBQUFBLElBQy9CLGNBQWM7QUFDVixXQUFLLGVBQWU7QUFDcEIsV0FBSyxtQkFBbUI7QUFDeEIsV0FBSyxVQUFVO0FBQUEsSUFDbkI7QUFBQTtBQUFBLElBR0EsbUJBQW1CLFNBQVM7QUFFeEIsWUFBTSxnQkFBZ0IsUUFBUSxRQUFRLHNCQUFzQjtBQUM1RCxVQUFJLGVBQWU7QUFDZixlQUFPLGNBQWMsYUFBYSxvQkFBb0I7QUFBQSxNQUMxRDtBQUdBLFlBQU0sY0FBYyxRQUFRLFFBQVEsd0JBQXdCO0FBQzVELFVBQUksYUFBYTtBQUNiLGVBQU8sWUFBWSxhQUFhLHNCQUFzQixLQUFLLFlBQVksYUFBYSxvQkFBb0I7QUFBQSxNQUM1RztBQUdBLFlBQU0sWUFBWSxRQUFR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QUEsZ0JBQ1AsS0FBSztBQUFBLGdCQUNMLFdBQVc7QUFBQSxnQkFDWCxlQUFlLFlBQVk7QUFBQSxnQkFDM0IsZ0JBQWdCO0FBQUEsZ0JBQ2hCLE1BQU07QUFBQSxjQUNWO0FBQ0Esc0JBQVEsUUFBUSxrQkFBa0IsWUFBWSxDQUFDLElBQUksU0FBUyxNQUFNLGFBQWEsS0FBSyxZQUFZLE1BQU0sRUFBRTtBQUN4RyxxQkFBTyxZQUFZLEVBQUUsTUFBTSwwQkFBMEIsVUFBVSxnQkFBZ0IsR0FBRyxHQUFHO0FBRXJGLHFCQUFPLFlBQVksRUFBRSxNQUFNLDBCQUEwQixVQUFVLEVBQUUsT0FBTyxpQkFBaUIsV0FBVyxZQUFZLEdBQUcsT0FBTyxTQUFTLFFBQVEsTUFBTSxTQUFTLEtBQUssWUFBWSxNQUFNLGdCQUFnQixZQUFZLENBQUMsSUFBSSxTQUFTLE1BQU0sR0FBRyxFQUFFLEdBQUcsR0FBRztBQUc1TyxvQkFBTSxhQUFhLE1BQU0sR0FBRyxZQUFZLE9BQU87QUFBQSxZQUNuRDtBQUVBLGtCQUFNLGFBQWE7QUFDbkI7QUFBQSxVQUNKO0FBRUEsY0FBSSxLQUFLLFNBQVMsWUFBWTtBQUMxQjtBQUNBO0FBQUEsVUFDSjtBQUVBLGdCQUFNLGtCQUFrQixNQUFNLEtBQUssZ0JBQWdCLGVBQWUsVUFBVSxpQkFBaUIsV0FBVyxNQUFNO0FBQzlHO0FBQUEsUUFDSjtBQUFBLE1BQ0o7QUFFQSxZQUFNLGFBQWEsR0FBRyxNQUFNLFFBQVEsY0FBYztBQUFBLElBQ3REO0FBQUEsRUFHQTsiLAogICJuYW1lcyI6IFsiaGFzTG9va3VwQnV0dG9uIiwgImNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QiLCAiZmlsdGVySW5wdXQiLCAiZmlsdGVyRmllbGRDb250YWluZXIiLCAicm93IiwgIm9wdGlvbnMiXQp9Cg==
