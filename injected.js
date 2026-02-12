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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luamVjdGVkL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb2dnaW5nLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9hc3luYy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvdGV4dC5qcyIsICJzcmMvaW5qZWN0ZWQvcnVudGltZS9lbmdpbmUtdXRpbHMuanMiLCAic3JjL2luamVjdGVkL3J1bnRpbWUvY29uZGl0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvZG9tLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb29rdXAuanMiLCAic3JjL2luamVjdGVkL3V0aWxzL2NvbWJvYm94LmpzIiwgInNyYy9pbmplY3RlZC9zdGVwcy9hY3Rpb24taGVscGVycy5qcyIsICJzcmMvaW5qZWN0ZWQvc3RlcHMvYWN0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEQzNjVGTyBFbGVtZW50IEluc3BlY3RvciBhbmQgRGlzY292ZXJ5IE1vZHVsZVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRDM2NUluc3BlY3RvciB7XHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudCA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5ID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgdGhlIGZvcm0gbmFtZSB0aGF0IGNvbnRhaW5zIGFuIGVsZW1lbnRcclxuICAgIGdldEVsZW1lbnRGb3JtTmFtZShlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gTG9vayBmb3IgdGhlIGNsb3Nlc3QgZm9ybSBjb250YWluZXJcclxuICAgICAgICBjb25zdCBmb3JtQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgIGlmIChmb3JtQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb3JtQ29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIGZvcm0gdmlhIGRhdGEtZHluLWNvbnRyb2xuYW1lIG9uIGEgZm9ybS1sZXZlbCBjb250YWluZXJcclxuICAgICAgICBjb25zdCBmb3JtRWxlbWVudCA9IGVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJGb3JtXCJdJyk7XHJcbiAgICAgICAgaWYgKGZvcm1FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb3JtRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgZm9ybUVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgdGhlIHdvcmtzcGFjZSBvciBwYWdlIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IHdvcmtzcGFjZSA9IGVsZW1lbnQuY2xvc2VzdCgnLndvcmtzcGFjZS1jb250ZW50LCAud29ya3NwYWNlLCBbZGF0YS1keW4tcm9sZT1cIldvcmtzcGFjZVwiXScpO1xyXG4gICAgICAgIGlmICh3b3Jrc3BhY2UpIHtcclxuICAgICAgICAgICAgY29uc3Qgd29ya3NwYWNlTmFtZSA9IHdvcmtzcGFjZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICh3b3Jrc3BhY2VOYW1lKSByZXR1cm4gd29ya3NwYWNlTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGRpYWxvZy9tb2RhbCBjb250ZXh0XHJcbiAgICAgICAgY29uc3QgZGlhbG9nID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5tb2RhbC1jb250ZW50Jyk7XHJcbiAgICAgICAgaWYgKGRpYWxvZykge1xyXG4gICAgICAgICAgICBjb25zdCBkaWFsb2dOYW1lID0gZGlhbG9nLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoZGlhbG9nTmFtZSkgcmV0dXJuIGRpYWxvZ05hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSByb290IGZvcm0gYnkgd2Fsa2luZyB1cCB0aGUgRE9NXHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBlbGVtZW50O1xyXG4gICAgICAgIHdoaWxlIChjdXJyZW50ICYmIGN1cnJlbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBjdXJyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0Zvcm0nID8gY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgOiBudWxsKTtcclxuICAgICAgICAgICAgaWYgKGZvcm1OYW1lKSByZXR1cm4gZm9ybU5hbWU7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHRoZSBhY3RpdmUvZm9jdXNlZCBmb3JtIG5hbWVcclxuICAgIGdldEFjdGl2ZUZvcm1OYW1lKCkge1xyXG4gICAgICAgIC8vIENoZWNrIGZvciBhY3RpdmUgZGlhbG9nIGZpcnN0IChjaGlsZCBmb3JtcyBhcmUgdHlwaWNhbGx5IGRpYWxvZ3MpXHJcbiAgICAgICAgY29uc3QgYWN0aXZlRGlhbG9nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl06bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKSwgLmRpYWxvZy1jb250YWluZXI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVEaWFsb2cpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhbG9nRm9ybSA9IGFjdGl2ZURpYWxvZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgICAgICBpZiAoZGlhbG9nRm9ybSkgcmV0dXJuIGRpYWxvZ0Zvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICAgICAgcmV0dXJuIGFjdGl2ZURpYWxvZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBmb2N1c2VkIGVsZW1lbnQgYW5kIGdldCBpdHMgZm9ybVxyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xyXG4gICAgICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShhY3RpdmVFbGVtZW50KTtcclxuICAgICAgICAgICAgaWYgKGZvcm1OYW1lICYmIGZvcm1OYW1lICE9PSAnVW5rbm93bicpIHJldHVybiBmb3JtTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTG9vayBmb3IgdGhlIHRvcG1vc3QvYWN0aXZlIGZvcm0gc2VjdGlvblxyXG4gICAgICAgIGNvbnN0IHZpc2libGVGb3JtcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XHJcbiAgICAgICAgaWYgKHZpc2libGVGb3Jtcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIFJldHVybiB0aGUgbGFzdCBvbmUgKHR5cGljYWxseSB0aGUgbW9zdCByZWNlbnRseSBvcGVuZWQvdG9wbW9zdClcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHZpc2libGVGb3Jtcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNFbGVtZW50VmlzaWJsZSh2aXNpYmxlRm9ybXNbaV0pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZpc2libGVGb3Jtc1tpXS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGFsbCBpbnRlcmFjdGl2ZSBlbGVtZW50cyBvbiB0aGUgcGFnZVxyXG4gICAgZGlzY292ZXJFbGVtZW50cyhhY3RpdmVGb3JtT25seSA9IGZhbHNlKSB7XHJcbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSBbXTtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtID0gYWN0aXZlRm9ybU9ubHkgPyB0aGlzLmdldEFjdGl2ZUZvcm1OYW1lKCkgOiBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGJ1dHRvbnNcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIk1lbnVJdGVtQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGVsKTtcclxuICAgICAgICAgICAgY29uc3QgdmlzaWJsZSA9IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdidXR0b24nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRleHQsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB2aXNpYmxlLFxyXG4gICAgICAgICAgICAgICAgYXJpYUxhYmVsOiBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbGwgaW5wdXQgZmllbGRzIChleHBhbmRlZCB0byBjYXRjaCBtb3JlIGZpZWxkIHR5cGVzKVxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTXVsdGlsaW5lSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlNlZ21lbnRlZEVudHJ5XCJdLCBpbnB1dFtkYXRhLWR5bi1jb250cm9sbmFtZV0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIC8vIEdldCBjb250cm9sIG5hbWUgZnJvbSBlbGVtZW50IG9yIHBhcmVudFxyXG4gICAgICAgICAgICBsZXQgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGxldCB0YXJnZXRFbGVtZW50ID0gZWw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBJZiBub3QgZm91bmQsIGNoZWNrIHBhcmVudCBlbGVtZW50IChjb21tb24gZm9yIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyBsaWtlIEFjY291bnQpXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSA9IHBhcmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0RWxlbWVudCA9IHBhcmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGFkZGVkIChhdm9pZCBkdXBsaWNhdGVzKVxyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZSh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFbGVtZW50TGFiZWwodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkSW5mbyA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnaW5wdXQnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKHRhcmdldEVsZW1lbnQpLFxyXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZEluZm8sXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHRhcmdldEVsZW1lbnRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGNoZWNrYm94ZXMvdG9nZ2xlc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ2hlY2tCb3hcIl0sIGlucHV0W3R5cGU9XCJjaGVja2JveFwiXVtkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgbGV0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBsZXQgdGFyZ2V0RWxlbWVudCA9IGVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQ2hlY2sgcGFyZW50IGlmIG5vdCBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUgPSBwYXJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEVsZW1lbnQgPSBwYXJlbnQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjb25zdCBjaGVja2JveCA9IHRhcmdldEVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHwgdGFyZ2V0RWxlbWVudDtcclxuICAgICAgICAgICAgY29uc3QgaXNDaGVja2VkID0gY2hlY2tib3guY2hlY2tlZCB8fCBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdjaGVja2JveCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUodGFyZ2V0RWxlbWVudCksXHJcbiAgICAgICAgICAgICAgICBjaGVja2VkOiBpc0NoZWNrZWQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHRhcmdldEVsZW1lbnRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYWxsIHJhZGlvIGJ1dHRvbiBncm91cHNcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJSYWRpb0J1dHRvblwiXSwgW3JvbGU9XCJyYWRpb2dyb3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIkZyYW1lT3B0aW9uQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKGVsKTtcclxuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRSYWRpbyA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXTpjaGVja2VkLCBbcm9sZT1cInJhZGlvXCJdW2FyaWEtY2hlY2tlZD1cInRydWVcIl0nKTtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gc2VsZWN0ZWRSYWRpbz8udmFsdWUgfHwgc2VsZWN0ZWRSYWRpbz8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJyc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncmFkaW8nLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcbiAgICAgICAgICAgICAgICBjdXJyZW50VmFsdWU6IGN1cnJlbnRWYWx1ZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBGaW5kIGFjdGlvbiBwYW5lIHRhYnMgKEFwcEJhciB0YWJzKVxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkFwcEJhclRhYlwiXSwgLmFwcEJhclRhYiwgW3JvbGU9XCJ0YWJcIl1bZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XG5cbiAgICAgICAgICAgIC8vIFNraXAgdGFicyBpbnNpZGUgZGlhbG9ncy9mbHlvdXRzXG4gICAgICAgICAgICBpZiAoZWwuY2xvc2VzdCgnLmRpYWxvZy1jb250ZW50LCBbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGVsKTtcbiAgICAgICAgICAgIGNvbnN0IGlzQWN0aXZlID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykgfHxcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ3NlbGVjdGVkJyk7XG5cbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdhY3Rpb24tcGFuZS10YWInLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiBpc0FjdGl2ZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBGaW5kIGFsbCB0cmFkaXRpb25hbCBEMzY1IGdyaWRzL3RhYmxlc1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGhpcy5nZXRFbGVtZW50TGFiZWwoZWwpIHx8ICdHcmlkJyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRGlzY292ZXIgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLmRpc2NvdmVyR3JpZENvbHVtbnMoZWwsIGNvbnRyb2xOYW1lLCBmb3JtTmFtZSwgZWxlbWVudHMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzICgucmVhY3RHcmlkKVxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiAnUmVhY3QgR3JpZCcsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6ICcucmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGV4cGFuZGFibGUgc2VjdGlvbnMgKEZhc3RUYWJzLCBHcm91cHMsIFNlY3Rpb25QYWdlcylcclxuICAgICAgICAvLyBUaGVzZSBhcmUgY29sbGFwc2libGUgc2VjdGlvbnMgaW4gRDM2NSBkaWFsb2dzIGFuZCBmb3Jtc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJGYXN0VGFiXCJdLCAuc2VjdGlvbi1wYWdlLCAuZmFzdHRhYicpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGFkZGVkXHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYWN0dWFsbHkgYW4gZXhwYW5kYWJsZSBzZWN0aW9uXHJcbiAgICAgICAgICAgIC8vIExvb2sgZm9yIGhlYWRlciBlbGVtZW50cyBvciBhcmlhLWV4cGFuZGVkIGF0dHJpYnV0ZVxyXG4gICAgICAgICAgICBjb25zdCBoYXNIZWFkZXIgPSBlbC5xdWVyeVNlbGVjdG9yKCcuc2VjdGlvbi1oZWFkZXIsIC5ncm91cC1oZWFkZXIsIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0sIC5zZWN0aW9uLXBhZ2UtY2FwdGlvbiwgYnV0dG9uW2FyaWEtZXhwYW5kZWRdJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kYWJsZSA9IGVsLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2libGUnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnc2VjdGlvbi1wYWdlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNIZWFkZXIgIT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0dyb3VwJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnU2VjdGlvblBhZ2UnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFpc0V4cGFuZGFibGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIERldGVybWluZSBjdXJyZW50IGV4cGFuZGVkIHN0YXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFeHBhbmRhYmxlU2VjdGlvbkxhYmVsKGVsKSB8fCBjb250cm9sTmFtZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ3NlY3Rpb24nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcclxuICAgICAgICAgICAgICAgIGlzRXhwYW5kZWQ6IGlzRXhwYW5kZWQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRGlzY292ZXIgUmVhY3QgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLmRpc2NvdmVyUmVhY3RHcmlkQ29sdW1ucyhlbCwgZm9ybU5hbWUsIGVsZW1lbnRzKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCByZWFkYWJsZSB0ZXh0IGZyb20gYW4gZWxlbWVudFxyXG4gICAgZ2V0RWxlbWVudFRleHQoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBhcmlhLWxhYmVsIGZpcnN0XHJcbiAgICAgICAgbGV0IHRleHQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmICh0ZXh0ICYmIHRleHQudHJpbSgpKSByZXR1cm4gdGV4dC50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSB0ZXh0IGNvbnRlbnQgKGV4Y2x1ZGluZyBjaGlsZCBidXR0b25zL2ljb25zKVxyXG4gICAgICAgIGNvbnN0IGNsb25lID0gZWxlbWVudC5jbG9uZU5vZGUodHJ1ZSk7XHJcbiAgICAgICAgY2xvbmUucXVlcnlTZWxlY3RvckFsbCgnLmJ1dHRvbi1pY29uLCAuZmEsIC5nbHlwaGljb24nKS5mb3JFYWNoKGljb24gPT4gaWNvbi5yZW1vdmUoKSk7XHJcbiAgICAgICAgdGV4dCA9IGNsb25lLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG5cclxuICAgICAgICAvLyBUcnkgdGl0bGUgYXR0cmlidXRlXHJcbiAgICAgICAgdGV4dCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd0aXRsZScpO1xyXG4gICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gY29udHJvbCBuYW1lXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICdVbmtub3duJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGlucHV0IGZpZWxkc1xyXG4gICAgZ2V0RWxlbWVudExhYmVsKGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbFxyXG4gICAgICAgIGxldCBsYWJlbCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGxhYmVsICYmIGxhYmVsLnRyaW0oKSkgcmV0dXJuIGxhYmVsLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gVHJ5IGFzc29jaWF0ZWQgbGFiZWwgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGxhYmVsRWxlbWVudCA9IGVsZW1lbnQuY2xvc2VzdCgnLmR5bi1sYWJlbC13cmFwcGVyJyk/LnF1ZXJ5U2VsZWN0b3IoJy5keW4tbGFiZWwnKTtcclxuICAgICAgICBpZiAobGFiZWxFbGVtZW50KSByZXR1cm4gbGFiZWxFbGVtZW50LnRleHRDb250ZW50Py50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSBwYXJlbnQgY29udGFpbmVyIGxhYmVsXHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuaW5wdXRfY29udGFpbmVyLCAuZm9ybS1ncm91cCcpO1xyXG4gICAgICAgIGlmIChjb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyTGFiZWwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignbGFiZWwnKTtcclxuICAgICAgICAgICAgaWYgKGNvbnRhaW5lckxhYmVsKSByZXR1cm4gY29udGFpbmVyTGFiZWwudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNvbnRyb2wgbmFtZVxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzY292ZXIgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dC9lZGl0aW5nXHJcbiAgICBkaXNjb3ZlckdyaWRDb2x1bW5zKGdyaWRFbGVtZW50LCBncmlkTmFtZSwgZm9ybU5hbWUsIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgY29uc3QgYWRkZWRDb2x1bW5zID0gbmV3IFNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAxOiBGaW5kIGNvbHVtbiBoZWFkZXJzXHJcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXSwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgaGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBoZWFkZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoZWFkZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogYCR7ZGlzcGxheVRleHR9YCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShoZWFkZXIpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzSGVhZGVyOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaGVhZGVyXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAyOiBGaW5kIGNlbGxzIHdpdGggaW5wdXRzIGluIHRoZSBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXNlbGVjdGVkPVwidHJ1ZVwiXSwgW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZHluLXNlbGVjdGVkUm93JykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1yb2xlPVwiUm93XCJdOmZpcnN0LW9mLXR5cGUsIFtyb2xlPVwicm93XCJdOm5vdChbcm9sZT1cImNvbHVtbmhlYWRlclwiXSk6Zmlyc3Qtb2YtdHlwZScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgLy8gRmluZCBhbGwgaW5wdXQgZmllbGRzIGluIHRoZSByb3dcclxuICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICBjZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY29uc3Qgcm9sZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9IGNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ0lucHV0JywgJ0NvbWJvQm94JywgJ0xvb2t1cCcsICdSZWZlcmVuY2VHcm91cCcsICdTZWdtZW50ZWRFbnRyeSddLmluY2x1ZGVzKHJvbGUpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoaGFzSW5wdXQgfHwgcm9sZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjZWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZE5hbWU6IGdyaWROYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoY2VsbCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogaGFzSW5wdXQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBjZWxsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXRob2QgMzogRmluZCBhbnkgZWRpdGFibGUgaW5wdXRzIGluc2lkZSB0aGUgZ3JpZCBib2R5XHJcbiAgICAgICAgY29uc3QgZ3JpZElucHV0cyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlJlZmVyZW5jZUdyb3VwXCJdJyk7XHJcbiAgICAgICAgZ3JpZElucHV0cy5mb3JFYWNoKGlucHV0ID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IHRoaXMuZ2V0RWxlbWVudExhYmVsKGlucHV0KSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShpbnB1dCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShpbnB1dCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBpbnB1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBhIGdyaWQgY29sdW1uIGJ5IGxvb2tpbmcgYXQgdGhlIGhlYWRlclxyXG4gICAgZ2V0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2x1bW5Db250cm9sTmFtZSkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIgY2VsbCBmb3IgdGhpcyBjb2x1bW5cclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gaGVhZGVyLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgaGVhZGVyIGJ5IHBhcnRpYWwgbWF0Y2ggKGNvbHVtbiBuYW1lIG1pZ2h0IGJlIGRpZmZlcmVudCBpbiBoZWFkZXIgdnMgY2VsbClcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGFsbEhlYWRlcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGguZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoaGVhZGVyTmFtZSAmJiAoY29sdW1uQ29udHJvbE5hbWUuaW5jbHVkZXMoaGVhZGVyTmFtZSkgfHwgaGVhZGVyTmFtZS5pbmNsdWRlcyhjb2x1bW5Db250cm9sTmFtZSkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gaC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGNvbHVtbnMgaW4gUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHNcclxuICAgIGRpc2NvdmVyUmVhY3RHcmlkQ29sdW1ucyhncmlkRWxlbWVudCwgZm9ybU5hbWUsIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgY29uc3QgYWRkZWRDb2x1bW5zID0gbmV3IFNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEdldCBjb2x1bW4gaGVhZGVycyBmcm9tIC5keW4taGVhZGVyQ2VsbCBlbGVtZW50c1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckNlbGxzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciAuZHluLWhlYWRlckNlbGwnKTtcclxuICAgICAgICBoZWFkZXJDZWxscy5mb3JFYWNoKChoZWFkZXIsIGNvbEluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gaGVhZGVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbnRyb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gaGVhZGVyLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaGVhZGVyLnRleHRDb250ZW50Py50cmltKCkgfHwgY29udHJvbE5hbWU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgIGNvbHVtbkluZGV4OiBjb2xJbmRleCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShoZWFkZXIpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGAuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0hlYWRlcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGhlYWRlclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIGxvb2sgZm9yIGVkaXRhYmxlIGlucHV0cyBpbnNpZGUgdGhlIGJvZHkgcm93c1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAvLyBGaW5kIGFjdGl2ZS9zZWxlY3RlZCByb3cgZmlyc3QsIG9yIGZhbGxiYWNrIHRvIGZpcnN0IHJvd1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVSb3cgPSBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbltkYXRhLWR5bi1yb3ctYWN0aXZlPVwidHJ1ZVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbi5wdWJsaWNfZml4ZWREYXRhVGFibGVSb3dfbWFpbicpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZVJvdykge1xyXG4gICAgICAgICAgICAgICAgLy8gRmluZCBhbGwgY2VsbHMgd2l0aCBkYXRhLWR5bi1jb250cm9sbmFtZVxyXG4gICAgICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICAgICAgY2VsbHMuZm9yRWFjaChjZWxsID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByb2xlID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9IGNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydJbnB1dCcsICdDb21ib0JveCcsICdMb29rdXAnLCAnUmVmZXJlbmNlR3JvdXAnLCAnU2VnbWVudGVkRW50cnknXS5pbmNsdWRlcyhyb2xlKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRSZWFjdEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjZWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGNlbGwpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IGhhc0lucHV0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogY2VsbFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbnkgZWRpdGFibGUgaW5wdXRzIGluIHRoZSBncmlkIGJvZHlcclxuICAgICAgICBjb25zdCBncmlkSW5wdXRzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJJbnB1dFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0sIC5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0nKTtcclxuICAgICAgICBncmlkSW5wdXRzLmZvckVhY2goaW5wdXQgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldFJlYWN0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCB0aGlzLmdldEVsZW1lbnRMYWJlbChpbnB1dCkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoaW5wdXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShpbnB1dCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBpbnB1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBhIFJlYWN0IGdyaWQgY29sdW1uIGJ5IGxvb2tpbmcgYXQgdGhlIGhlYWRlclxyXG4gICAgZ2V0UmVhY3RHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbHVtbkNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGhlYWRlciBjZWxsIHdpdGggbWF0Y2hpbmcgY29udHJvbG5hbWVcclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKGAuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbHVtbkNvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXIucXVlcnlTZWxlY3RvcignLmR5bi1oZWFkZXJDZWxsTGFiZWwnKTtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFBhcnRpYWwgbWF0Y2hcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmR5bi1oZWFkZXJDZWxsW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlck5hbWUgPSBoLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGhlYWRlck5hbWUgJiYgKGNvbHVtbkNvbnRyb2xOYW1lLmluY2x1ZGVzKGhlYWRlck5hbWUpIHx8IGhlYWRlck5hbWUuaW5jbHVkZXMoY29sdW1uQ29udHJvbE5hbWUpKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERldGVjdCBmaWVsZCB0eXBlIChlbnVtLCBsb29rdXAsIGZyZWV0ZXh0LCBldGMuKVxyXG4gICAgZGV0ZWN0RmllbGRUeXBlKGVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCByb2xlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyAobGlrZSBBY2NvdW50KSBoYXZlIHNwZWNpYWwgbG9va3VwXHJcbiAgICAgICAgaWYgKHJvbGUgPT09ICdTZWdtZW50ZWRFbnRyeScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgdHlwZTogJ3NlZ21lbnRlZC1sb29rdXAnLCByb2xlOiByb2xlIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBsb29rdXAgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgaGFzTG9va3VwQnV0dG9uID0gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5sb29rdXAtYnV0dG9uJykgIT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgQ29tYm9Cb3gvRHJvcGRvd25cclxuICAgICAgICBjb25zdCBpc0NvbWJvQm94ID0gcm9sZSA9PT0gJ0NvbWJvQm94JyB8fCBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnY29tYm9Cb3gnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3Igc2VsZWN0IGVsZW1lbnRcclxuICAgICAgICBjb25zdCBzZWxlY3QgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE11bHRpbGluZUlucHV0IGRldGVjdGlvblxyXG4gICAgICAgIGNvbnN0IGlzTXVsdGlsaW5lID0gcm9sZSA9PT0gJ011bHRpbGluZUlucHV0JztcclxuICAgICAgICBcclxuICAgICAgICAvLyBEZXRlY3QgbnVtZXJpYyBmaWVsZHNcclxuICAgICAgICBjb25zdCBpc051bWVyaWMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJudW1iZXJcIl0nKSAhPT0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEZXRlY3QgZGF0ZSBmaWVsZHNcclxuICAgICAgICBjb25zdCBpc0RhdGUgPSBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZGF0ZS1maWVsZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiZGF0ZVwiXScpICE9PSBudWxsO1xyXG5cclxuICAgICAgICAvLyBCdWlsZCBmaWVsZCB0eXBlIGluZm9cclxuICAgICAgICBjb25zdCBmaWVsZEluZm8gPSB7XHJcbiAgICAgICAgICAgIGNvbnRyb2xUeXBlOiByb2xlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICd0ZXh0J1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGlmIChpc011bHRpbGluZSkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ3RleHRhcmVhJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzTXVsdGlsaW5lID0gdHJ1ZTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzQ29tYm9Cb3ggfHwgc2VsZWN0KSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnZW51bSc7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pc0VudW0gPSB0cnVlO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8udmFsdWVzID0gdGhpcy5leHRyYWN0RW51bVZhbHVlcyhlbGVtZW50LCBzZWxlY3QpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaGFzTG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnbG9va3VwJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzTG9va3VwID0gdHJ1ZTtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmFsbG93RnJlZXRleHQgPSAhZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1vbmx5Jyk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc051bWVyaWMpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdudW1iZXInO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNEYXRlKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnZGF0ZSc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBHZXQgbWF4IGxlbmd0aCBpZiBhdmFpbGFibGVcclxuICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhJyk7XHJcbiAgICAgICAgaWYgKGlucHV0ICYmIGlucHV0Lm1heExlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLm1heExlbmd0aCA9IGlucHV0Lm1heExlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBmaWVsZEluZm87XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRXh0cmFjdCBlbnVtIHZhbHVlcyBmcm9tIGRyb3Bkb3duXHJcbiAgICBleHRyYWN0RW51bVZhbHVlcyhlbGVtZW50LCBzZWxlY3RFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ID0gc2VsZWN0RWxlbWVudCB8fCBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgICAgIGlmICghc2VsZWN0KSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgcmV0dXJuIEFycmF5LmZyb20oc2VsZWN0Lm9wdGlvbnMpXHJcbiAgICAgICAgICAgIC5maWx0ZXIob3B0ID0+IG9wdC52YWx1ZSAhPT0gJycpXHJcbiAgICAgICAgICAgIC5tYXAob3B0ID0+ICh7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZTogb3B0LnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgdGV4dDogb3B0LnRleHQudHJpbSgpXHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGV4cGFuZGFibGUgc2VjdGlvbnNcclxuICAgIGdldEV4cGFuZGFibGVTZWN0aW9uTGFiZWwoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIvY2FwdGlvbiBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgaGVhZGVyU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICAgICAnLnNlY3Rpb24tcGFnZS1jYXB0aW9uJyxcclxuICAgICAgICAgICAgJy5zZWN0aW9uLWhlYWRlcicsXHJcbiAgICAgICAgICAgICcuZ3JvdXAtaGVhZGVyJyxcclxuICAgICAgICAgICAgJy5mYXN0dGFiLWhlYWRlcicsXHJcbiAgICAgICAgICAgICdbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdJyxcclxuICAgICAgICAgICAgJ2J1dHRvblthcmlhLWV4cGFuZGVkXSBzcGFuJyxcclxuICAgICAgICAgICAgJ2J1dHRvbiBzcGFuJyxcclxuICAgICAgICAgICAgJy5jYXB0aW9uJyxcclxuICAgICAgICAgICAgJ2xlZ2VuZCdcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgaGVhZGVyU2VsZWN0b3JzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbFxyXG4gICAgICAgIGNvbnN0IGFyaWFMYWJlbCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGFyaWFMYWJlbCkgcmV0dXJuIGFyaWFMYWJlbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdGhlIGJ1dHRvbidzIHRleHQgaWYgdGhlIHNlY3Rpb24gaGFzIGEgdG9nZ2xlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IHRvZ2dsZUJ0biA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignYnV0dG9uJyk7XHJcbiAgICAgICAgaWYgKHRvZ2dsZUJ0bikge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdG9nZ2xlQnRuLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0ICYmIHRleHQubGVuZ3RoIDwgMTAwKSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgZWxlbWVudCBpcyB2aXNpYmxlXHJcbiAgICBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQpIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgIT09ICdub25lJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBTdGFydCBpbnRlcmFjdGl2ZSBlbGVtZW50IHBpY2tlclxyXG4gICAgc3RhcnRFbGVtZW50UGlja2VyKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgdGhpcy5pc0luc3BlY3RpbmcgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMucGlja2VyQ2FsbGJhY2sgPSBjYWxsYmFjaztcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIG92ZXJsYXlcclxuICAgICAgICB0aGlzLm92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLm92ZXJsYXkuc3R5bGUuY3NzVGV4dCA9IGBcclxuICAgICAgICAgICAgcG9zaXRpb246IGZpeGVkO1xyXG4gICAgICAgICAgICB0b3A6IDA7XHJcbiAgICAgICAgICAgIGxlZnQ6IDA7XHJcbiAgICAgICAgICAgIHdpZHRoOiAxMDAlO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IDEwMCU7XHJcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcclxuICAgICAgICAgICAgei1pbmRleDogOTk5OTk4O1xyXG4gICAgICAgICAgICBjdXJzb3I6IGNyb3NzaGFpcjtcclxuICAgICAgICBgO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5vdmVybGF5KTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGhpZ2hsaWdodCBlbGVtZW50XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmNzc1RleHQgPSBgXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgICAgICAgICAgYm9yZGVyOiAycHggc29saWQgIzY2N2VlYTtcclxuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xyXG4gICAgICAgICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcclxuICAgICAgICAgICAgei1pbmRleDogOTk5OTk5O1xyXG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4xcyBlYXNlO1xyXG4gICAgICAgIGA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXJzXHJcbiAgICAgICAgdGhpcy5tb3VzZU1vdmVIYW5kbGVyID0gKGUpID0+IHRoaXMuaGFuZGxlTW91c2VNb3ZlKGUpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tIYW5kbGVyID0gKGUpID0+IHRoaXMuaGFuZGxlQ2xpY2soZSk7XHJcbiAgICAgICAgdGhpcy5lc2NhcGVIYW5kbGVyID0gKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgdGhpcy5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2VNb3ZlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuZXNjYXBlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlTW91c2VNb3ZlKGUpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcclxuICAgICAgICBpZiAoIXRhcmdldCB8fCB0YXJnZXQgPT09IHRoaXMub3ZlcmxheSB8fCB0YXJnZXQgPT09IHRoaXMuaGlnaGxpZ2h0RWxlbWVudCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGNsb3Nlc3QgRDM2NSBjb250cm9sXHJcbiAgICAgICAgY29uc3QgY29udHJvbCA9IHRhcmdldC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgaWYgKCFjb250cm9sKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVuc3VyZSBoaWdobGlnaHQgZWxlbWVudCBleGlzdHNcclxuICAgICAgICBpZiAoIXRoaXMuaGlnaGxpZ2h0RWxlbWVudCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIaWdobGlnaHQgdGhlIGVsZW1lbnRcclxuICAgICAgICBjb25zdCByZWN0ID0gY29udHJvbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLnRvcCA9IHJlY3QudG9wICsgd2luZG93LnNjcm9sbFkgKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5sZWZ0ID0gcmVjdC5sZWZ0ICsgd2luZG93LnNjcm9sbFggKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS53aWR0aCA9IHJlY3Qud2lkdGggKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5oZWlnaHQgPSByZWN0LmhlaWdodCArICdweCc7XHJcblxyXG4gICAgICAgIC8vIFNob3cgdG9vbHRpcFxyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnNldEF0dHJpYnV0ZSgndGl0bGUnLCBgJHtyb2xlfTogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVDbGljayhlKSB7XHJcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2wgPSB0YXJnZXQ/LmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBjb25zdCByb2xlID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRoaXMuZ2V0RWxlbWVudFRleHQoY29udHJvbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBlbGVtZW50SW5mbyA9IHtcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBpZiAocm9sZSA9PT0gJ0lucHV0JyB8fCByb2xlID09PSAnTXVsdGlsaW5lSW5wdXQnIHx8IHJvbGUgPT09ICdDb21ib0JveCcpIHtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnRJbmZvLmZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGNvbnRyb2wpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBpY2tlckNhbGxiYWNrKGVsZW1lbnRJbmZvKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc3RvcEVsZW1lbnRQaWNrZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBzdG9wRWxlbWVudFBpY2tlcigpIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLm92ZXJsYXkpIHtcclxuICAgICAgICAgICAgdGhpcy5vdmVybGF5LnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLm92ZXJsYXkgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5oaWdobGlnaHRFbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5yZW1vdmUoKTtcclxuICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2VNb3ZlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuZXNjYXBlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2VhcmNoIGVsZW1lbnRzIGJ5IHRleHRcclxuICAgIGZpbmRFbGVtZW50QnlUZXh0KHRleHQsIGVsZW1lbnRUeXBlID0gbnVsbCkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gdGhpcy5kaXNjb3ZlckVsZW1lbnRzKCk7XHJcbiAgICAgICAgY29uc3Qgc2VhcmNoVGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKS50cmltKCk7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50cy5maWx0ZXIoZWwgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZWxlbWVudFR5cGUgJiYgZWwudHlwZSAhPT0gZWxlbWVudFR5cGUpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gZWwuZGlzcGxheVRleHQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgYXJpYUxhYmVsID0gKGVsLmFyaWFMYWJlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5jb250cm9sTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIGRpc3BsYXlUZXh0LmluY2x1ZGVzKHNlYXJjaFRleHQpIHx8XHJcbiAgICAgICAgICAgICAgICAgICBhcmlhTGFiZWwuaW5jbHVkZXMoc2VhcmNoVGV4dCkgfHxcclxuICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lLmluY2x1ZGVzKHNlYXJjaFRleHQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBFeHBvcnQgZm9yIHVzZSBpbiBjb250ZW50IHNjcmlwdFxyXG4iLCAiZXhwb3J0IGZ1bmN0aW9uIHNlbmRMb2cobGV2ZWwsIG1lc3NhZ2UpIHtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19MT0cnLFxuICAgICAgICBsb2c6IHsgbGV2ZWwsIG1lc3NhZ2UgfVxuICAgIH0sICcqJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2dTdGVwKG1lc3NhZ2UpIHtcbiAgICBzZW5kTG9nKCdpbmZvJywgbWVzc2FnZSk7XG4gICAgY29uc29sZS5sb2coJ1tEMzY1IEF1dG9tYXRpb25dJywgbWVzc2FnZSk7XG59XG4iLCAiZXhwb3J0IGZ1bmN0aW9uIHNsZWVwKG1zKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKSB7XG4gICAgY29uc3QgaXNUZXh0QXJlYSA9IGlucHV0LnRhZ05hbWUgPT09ICdURVhUQVJFQSc7XG4gICAgY29uc3QgZGVzY3JpcHRvciA9IGlzVGV4dEFyZWFcbiAgICAgICAgPyBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MVGV4dEFyZWFFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJylcbiAgICAgICAgOiBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MSW5wdXRFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJyk7XG5cbiAgICBpZiAoZGVzY3JpcHRvciAmJiBkZXNjcmlwdG9yLnNldCkge1xuICAgICAgICBkZXNjcmlwdG9yLnNldC5jYWxsKGlucHV0LCB2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaW5wdXQudmFsdWUgPSB2YWx1ZTtcbiAgICB9XG59XG4iLCAiZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVRleHQodmFsdWUpIHtcclxuICAgIHJldHVybiBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb3dlckNhc2UoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvZXJjZUJvb2xlYW4odmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuIHZhbHVlO1xyXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiB2YWx1ZSAhPT0gMCAmJiAhTnVtYmVyLmlzTmFOKHZhbHVlKTtcclxuXHJcbiAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dCh2YWx1ZSk7XHJcbiAgICBpZiAodGV4dCA9PT0gJycpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoWyd0cnVlJywgJzEnLCAneWVzJywgJ3knLCAnb24nLCAnY2hlY2tlZCddLmluY2x1ZGVzKHRleHQpKSByZXR1cm4gdHJ1ZTtcclxuICAgIGlmIChbJ2ZhbHNlJywgJzAnLCAnbm8nLCAnbicsICdvZmYnLCAndW5jaGVja2VkJ10uaW5jbHVkZXModGV4dCkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuIiwgImV4cG9ydCBmdW5jdGlvbiBnZXRXb3JrZmxvd0Vycm9yRGVmYXVsdHMoc2V0dGluZ3MpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBtb2RlOiBzZXR0aW5ncz8uZXJyb3JEZWZhdWx0TW9kZSB8fCAnZmFpbCcsXG4gICAgICAgIHJldHJ5Q291bnQ6IE51bWJlci5pc0Zpbml0ZShzZXR0aW5ncz8uZXJyb3JEZWZhdWx0UmV0cnlDb3VudCkgPyBzZXR0aW5ncy5lcnJvckRlZmF1bHRSZXRyeUNvdW50IDogMCxcbiAgICAgICAgcmV0cnlEZWxheTogTnVtYmVyLmlzRmluaXRlKHNldHRpbmdzPy5lcnJvckRlZmF1bHRSZXRyeURlbGF5KSA/IHNldHRpbmdzLmVycm9yRGVmYXVsdFJldHJ5RGVsYXkgOiAxMDAwLFxuICAgICAgICBnb3RvTGFiZWw6IHNldHRpbmdzPy5lcnJvckRlZmF1bHRHb3RvTGFiZWwgfHwgJydcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RlcEVycm9yQ29uZmlnKHN0ZXAsIHNldHRpbmdzKSB7XG4gICAgY29uc3QgZGVmYXVsdHMgPSBnZXRXb3JrZmxvd0Vycm9yRGVmYXVsdHMoc2V0dGluZ3MpO1xuICAgIGNvbnN0IG1vZGUgPSBzdGVwPy5vbkVycm9yTW9kZSAmJiBzdGVwLm9uRXJyb3JNb2RlICE9PSAnZGVmYXVsdCcgPyBzdGVwLm9uRXJyb3JNb2RlIDogZGVmYXVsdHMubW9kZTtcbiAgICBjb25zdCByZXRyeUNvdW50ID0gTnVtYmVyLmlzRmluaXRlKHN0ZXA/Lm9uRXJyb3JSZXRyeUNvdW50KSA/IHN0ZXAub25FcnJvclJldHJ5Q291bnQgOiBkZWZhdWx0cy5yZXRyeUNvdW50O1xuICAgIGNvbnN0IHJldHJ5RGVsYXkgPSBOdW1iZXIuaXNGaW5pdGUoc3RlcD8ub25FcnJvclJldHJ5RGVsYXkpID8gc3RlcC5vbkVycm9yUmV0cnlEZWxheSA6IGRlZmF1bHRzLnJldHJ5RGVsYXk7XG4gICAgY29uc3QgZ290b0xhYmVsID0gc3RlcD8ub25FcnJvckdvdG9MYWJlbCB8fCBkZWZhdWx0cy5nb3RvTGFiZWw7XG4gICAgcmV0dXJuIHsgbW9kZSwgcmV0cnlDb3VudCwgcmV0cnlEZWxheSwgZ290b0xhYmVsIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9vcFBhaXJzKHN0ZXBzTGlzdCwgb25Jc3N1ZSA9ICgpID0+IHt9KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbXTtcbiAgICBjb25zdCBwYWlycyA9IFtdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN0ZXBzTGlzdFtpXTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnR5cGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xuICAgICAgICAgICAgc3RhY2sucHVzaCh7IHN0YXJ0SW5kZXg6IGksIGlkOiBzLmlkIH0pO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocy50eXBlICE9PSAnbG9vcC1lbmQnKSBjb250aW51ZTtcblxuICAgICAgICBsZXQgbWF0Y2hlZCA9IG51bGw7XG4gICAgICAgIGlmIChzLmxvb3BSZWYpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGogPSBzdGFjay5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFja1tqXS5pZCA9PT0gcy5sb29wUmVmKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZWQgPSB7IHN0YXJ0SW5kZXg6IHN0YWNrW2pdLnN0YXJ0SW5kZXgsIGVuZEluZGV4OiBpIH07XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnNwbGljZShqLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFtYXRjaGVkKSB7XG4gICAgICAgICAgICBjb25zdCBsYXN0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgICAgICBpZiAobGFzdCkge1xuICAgICAgICAgICAgICAgIG1hdGNoZWQgPSB7IHN0YXJ0SW5kZXg6IGxhc3Quc3RhcnRJbmRleCwgZW5kSW5kZXg6IGkgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb25Jc3N1ZShgVW5tYXRjaGVkIGxvb3AtZW5kIGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtYXRjaGVkKSBwYWlycy5wdXNoKG1hdGNoZWQpO1xuICAgIH1cblxuICAgIGlmIChzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChjb25zdCByZW0gb2Ygc3RhY2spIHtcbiAgICAgICAgICAgIG9uSXNzdWUoYFVuY2xvc2VkIGxvb3Atc3RhcnQgYXQgaW5kZXggJHtyZW0uc3RhcnRJbmRleH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhaXJzLnNvcnQoKGEsIGIpID0+IGEuc3RhcnRJbmRleCAtIGIuc3RhcnRJbmRleCk7XG4gICAgcmV0dXJuIHBhaXJzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZElmUGFpcnMoc3RlcHNMaXN0LCBvbklzc3VlID0gKCkgPT4ge30pIHtcbiAgICBjb25zdCBzdGFjayA9IFtdO1xuICAgIGNvbnN0IGlmVG9FbHNlID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGlmVG9FbmQgPSBuZXcgTWFwKCk7XG4gICAgY29uc3QgZWxzZVRvRW5kID0gbmV3IE1hcCgpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN0ZXBzTGlzdFtpXTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnR5cGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdpZi1zdGFydCcpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goeyBpZkluZGV4OiBpLCBlbHNlSW5kZXg6IG51bGwgfSk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdlbHNlJykge1xuICAgICAgICAgICAgaWYgKHN0YWNrLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG9uSXNzdWUoYEVsc2Ugd2l0aG91dCBtYXRjaGluZyBpZi1zdGFydCBhdCBpbmRleCAke2l9YCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHRvcCA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgaWYgKHRvcC5lbHNlSW5kZXggPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICB0b3AuZWxzZUluZGV4ID0gaTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb25Jc3N1ZShgTXVsdGlwbGUgZWxzZSBibG9ja3MgZm9yIGlmLXN0YXJ0IGF0IGluZGV4ICR7dG9wLmlmSW5kZXh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzLnR5cGUgIT09ICdpZi1lbmQnKSBjb250aW51ZTtcblxuICAgICAgICBjb25zdCB0b3AgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKCF0b3ApIHtcbiAgICAgICAgICAgIG9uSXNzdWUoYElmLWVuZCB3aXRob3V0IG1hdGNoaW5nIGlmLXN0YXJ0IGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWZUb0VuZC5zZXQodG9wLmlmSW5kZXgsIGkpO1xuICAgICAgICBpZiAodG9wLmVsc2VJbmRleCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgaWZUb0Vsc2Uuc2V0KHRvcC5pZkluZGV4LCB0b3AuZWxzZUluZGV4KTtcbiAgICAgICAgICAgIGVsc2VUb0VuZC5zZXQodG9wLmVsc2VJbmRleCwgaSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVtIG9mIHN0YWNrKSB7XG4gICAgICAgICAgICBvbklzc3VlKGBVbmNsb3NlZCBpZi1zdGFydCBhdCBpbmRleCAke3JlbS5pZkluZGV4fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgaWZUb0Vsc2UsIGlmVG9FbmQsIGVsc2VUb0VuZCB9O1xufVxuIiwgImltcG9ydCB7IG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuLi91dGlscy90ZXh0LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RSb3dWYWx1ZShmaWVsZE1hcHBpbmcsIGN1cnJlbnRSb3cpIHtcbiAgICBpZiAoIWN1cnJlbnRSb3cgfHwgIWZpZWxkTWFwcGluZykgcmV0dXJuICcnO1xuICAgIGxldCB2YWx1ZSA9IGN1cnJlbnRSb3dbZmllbGRNYXBwaW5nXTtcbiAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCAmJiBmaWVsZE1hcHBpbmcuaW5jbHVkZXMoJzonKSkge1xuICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBmaWVsZE1hcHBpbmcuc3BsaXQoJzonKS5wb3AoKTtcbiAgICAgICAgdmFsdWUgPSBjdXJyZW50Um93W2ZpZWxkTmFtZV07XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCkge1xuICAgIGlmICghZWxlbWVudCkgcmV0dXJuICcnO1xuICAgIGNvbnN0IGFyaWEgPSBlbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdhcmlhLWxhYmVsJyk7XG4gICAgaWYgKGFyaWEpIHJldHVybiBhcmlhLnRyaW0oKTtcbiAgICBjb25zdCB0ZXh0ID0gZWxlbWVudC50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgIHJldHVybiB0ZXh0IHx8ICcnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWxlbWVudFZhbHVlRm9yQ29uZGl0aW9uKGVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiAnJztcbiAgICBpZiAoJ3ZhbHVlJyBpbiBlbGVtZW50ICYmIGVsZW1lbnQudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gU3RyaW5nKGVsZW1lbnQudmFsdWUgPz8gJycpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmFsdWF0ZUNvbmRpdGlvbihzdGVwLCBjdXJyZW50Um93LCBkZXBzID0ge30pIHtcbiAgICBjb25zdCBmaW5kRWxlbWVudCA9IGRlcHMuZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQgfHwgKCgpID0+IG51bGwpO1xuICAgIGNvbnN0IGlzVmlzaWJsZSA9IGRlcHMuaXNFbGVtZW50VmlzaWJsZSB8fCAoKCkgPT4gZmFsc2UpO1xuICAgIGNvbnN0IHR5cGUgPSBzdGVwPy5jb25kaXRpb25UeXBlIHx8ICd1aS12aXNpYmxlJztcblxuICAgIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ3VpLScpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gc3RlcD8uY29uZGl0aW9uQ29udHJvbE5hbWUgfHwgc3RlcD8uY29udHJvbE5hbWUgfHwgJyc7XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBjb250cm9sTmFtZSA/IGZpbmRFbGVtZW50KGNvbnRyb2xOYW1lKSA6IG51bGw7XG5cbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICBjYXNlICd1aS12aXNpYmxlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gISFlbGVtZW50ICYmIGlzVmlzaWJsZShlbGVtZW50KTtcbiAgICAgICAgICAgIGNhc2UgJ3VpLWhpZGRlbic6XG4gICAgICAgICAgICAgICAgcmV0dXJuICFlbGVtZW50IHx8ICFpc1Zpc2libGUoZWxlbWVudCk7XG4gICAgICAgICAgICBjYXNlICd1aS1leGlzdHMnOlxuICAgICAgICAgICAgICAgIHJldHVybiAhIWVsZW1lbnQ7XG4gICAgICAgICAgICBjYXNlICd1aS1ub3QtZXhpc3RzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gIWVsZW1lbnQ7XG4gICAgICAgICAgICBjYXNlICd1aS10ZXh0LWVxdWFscyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdGV4dC1jb250YWlucyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdmFsdWUtZXF1YWxzJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoZ2V0RWxlbWVudFZhbHVlRm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdmFsdWUtY29udGFpbnMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChnZXRFbGVtZW50VmFsdWVGb3JDb25kaXRpb24oZWxlbWVudCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dChzdGVwPy5jb25kaXRpb25WYWx1ZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbC5pbmNsdWRlcyhleHBlY3RlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ2RhdGEtJykpIHtcbiAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gc3RlcD8uY29uZGl0aW9uRmllbGRNYXBwaW5nIHx8ICcnO1xuICAgICAgICBjb25zdCBhY3R1YWxSYXcgPSBleHRyYWN0Um93VmFsdWUoZmllbGRNYXBwaW5nLCBjdXJyZW50Um93KTtcbiAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChhY3R1YWxSYXcpO1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1lcXVhbHMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1ub3QtZXF1YWxzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsICE9PSBleHBlY3RlZDtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtY29udGFpbnMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1lbXB0eSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCA9PT0gJyc7XG4gICAgICAgICAgICBjYXNlICdkYXRhLW5vdC1lbXB0eSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCAhPT0gJyc7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHtcclxuICAgIGNvbnN0IGFsbE1hdGNoZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG5cclxuICAgIGlmIChhbGxNYXRjaGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcbiAgICBpZiAoYWxsTWF0Y2hlcy5sZW5ndGggPT09IDEpIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG5cclxuICAgIC8vIE11bHRpcGxlIG1hdGNoZXMgLSBwcmVmZXIgdGhlIG9uZSBpbiB0aGUgYWN0aXZlL3RvcG1vc3QgY29udGV4dFxyXG5cclxuICAgIC8vIFByaW9yaXR5IDE6IEVsZW1lbnQgaW4gYW4gYWN0aXZlIGRpYWxvZy9tb2RhbCAoY2hpbGQgZm9ybXMpXHJcbiAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICBjb25zdCBkaWFsb2cgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpO1xyXG4gICAgICAgIGlmIChkaWFsb2cgJiYgaXNFbGVtZW50VmlzaWJsZShkaWFsb2cpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBkaWFsb2cgY29udGV4dGApO1xyXG4gICAgICAgICAgICByZXR1cm4gZWw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDI6IEVsZW1lbnQgaW4gYSBGYXN0VGFiIG9yIFRhYlBhZ2UgdGhhdCdzIGV4cGFuZGVkL2FjdGl2ZVxyXG4gICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgY29uc3QgdGFiUGFnZSA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgLnRhYlBhZ2UnKTtcclxuICAgICAgICBpZiAodGFiUGFnZSkge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgdGFiIGlzIGV4cGFuZGVkXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSB0YWJQYWdlLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YWJQYWdlLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXRhYlBhZ2UuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuICAgICAgICAgICAgaWYgKGlzRXhwYW5kZWQgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBleHBhbmRlZCB0YWIgY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDM6IEVsZW1lbnQgaW4gdGhlIGZvcm0gY29udGV4dCB0aGF0IGhhcyBmb2N1cyBvciB3YXMgcmVjZW50bHkgaW50ZXJhY3RlZCB3aXRoXHJcbiAgICBjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcclxuICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtQ29udGV4dCA9IGFjdGl2ZUVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLWZvcm0tbmFtZV0sIFtkYXRhLWR5bi1yb2xlPVwiRm9ybVwiXScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dC5jb250YWlucyhlbCkgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gYWN0aXZlIGZvcm0gY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSA0OiBBbnkgdmlzaWJsZSBlbGVtZW50IChwcmVmZXIgbGF0ZXIgb25lcyBhcyB0aGV5J3JlIG9mdGVuIGluIGNoaWxkIGZvcm1zIHJlbmRlcmVkIG9uIHRvcClcclxuICAgIGNvbnN0IHZpc2libGVNYXRjaGVzID0gQXJyYXkuZnJvbShhbGxNYXRjaGVzKS5maWx0ZXIoZWwgPT4gaXNFbGVtZW50VmlzaWJsZShlbCkpO1xyXG4gICAgaWYgKHZpc2libGVNYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAvLyBSZXR1cm4gdGhlIGxhc3QgdmlzaWJsZSBtYXRjaCAob2Z0ZW4gdGhlIGNoaWxkIGZvcm0ncyBlbGVtZW50KVxyXG4gICAgICAgIHJldHVybiB2aXNpYmxlTWF0Y2hlc1t2aXNpYmxlTWF0Y2hlcy5sZW5ndGggLSAxXTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGYWxsYmFjazogZmlyc3QgbWF0Y2hcclxuICAgIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZShlbCkge1xyXG4gICAgaWYgKCFlbCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XHJcbiAgICByZXR1cm4gcmVjdC53aWR0aCA+IDAgJiZcclxuICAgICAgICAgICByZWN0LmhlaWdodCA+IDAgJiZcclxuICAgICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScgJiZcclxuICAgICAgICAgICBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgIHN0eWxlLm9wYWNpdHkgIT09ICcwJztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRDM2NUxvYWRpbmcoKSB7XHJcbiAgICAvLyBDaGVjayBmb3IgY29tbW9uIEQzNjUgbG9hZGluZyBpbmRpY2F0b3JzXHJcbiAgICBjb25zdCBsb2FkaW5nU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcuZHluLWxvYWRpbmctb3ZlcmxheTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1sb2FkaW5nLWluZGljYXRvcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1zcGlubmVyOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcubG9hZGluZy1pbmRpY2F0b3I6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tbWVzc2FnZUJ1c3k6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1sb2FkaW5nPVwidHJ1ZVwiXScsXHJcbiAgICAgICAgJy5idXN5LWluZGljYXRvcicsXHJcbiAgICAgICAgJy5keW4tbG9hZGluZ1N0dWI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKSdcclxuICAgIF07XHJcblxyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBsb2FkaW5nU2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoZWwgJiYgZWwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBmb3IgQUpBWCByZXF1ZXN0cyBpbiBwcm9ncmVzcyAoRDM2NSBzcGVjaWZpYylcclxuICAgIGlmICh3aW5kb3cuJGR5biAmJiB3aW5kb3cuJGR5bi5pc1Byb2Nlc3NpbmcpIHtcclxuICAgICAgICByZXR1cm4gd2luZG93LiRkeW4uaXNQcm9jZXNzaW5nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSkge1xyXG4gICAgLy8gRmlyc3QsIHRyeSB0byBmaW5kIGluIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3cgKHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHMpXHJcbiAgICBjb25zdCBzZWxlY3RlZFJvd3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnKTtcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHNlbGVjdGVkUm93cykge1xyXG4gICAgICAgIGNvbnN0IGNlbGwgPSByb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJ5IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIC0gZmluZCBhY3RpdmUgcm93XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICAvLyBMb29rIGZvciBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nKTtcclxuICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjZWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBUcnkgZmluZGluZyBpbiBib2R5IHJvd3NcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxscyA9IGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGlmIGluIGhlYWRlclxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNJbkhlYWRlciA9IGNlbGwuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzSW5IZWFkZXIgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBUcnkgdG8gZmluZCBpbiB0cmFkaXRpb25hbCBEMzY1IGdyaWQgY29udGV4dFxyXG4gICAgY29uc3QgZ3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiBncmlkcykge1xyXG4gICAgICAgIC8vIEZpbmQgYWxsIG1hdGNoaW5nIGNlbGxzIGFuZCBwcmVmZXIgdmlzaWJsZS9lZGl0YWJsZSBvbmVzXHJcbiAgICAgICAgY29uc3QgY2VsbHMgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIGl0J3MgaW4gYSBkYXRhIHJvdyAobm90IGhlYWRlcilcclxuICAgICAgICAgICAgY29uc3QgaXNJbkhlYWRlciA9IGNlbGwuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdLCB0aGVhZCcpO1xyXG4gICAgICAgICAgICBpZiAoIWlzSW5IZWFkZXIgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjZWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIHRvIHN0YW5kYXJkIGVsZW1lbnQgZmluZGluZ1xyXG4gICAgcmV0dXJuIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc0xvb2t1cEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICByZXR1cm4gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubG9va3VwLWJ1dHRvbiwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBCdXR0b25cIl0nKSAhPT0gbnVsbCB8fFxyXG4gICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gWycubG9va3VwLWJ1dHRvbicsICcubG9va3VwQnV0dG9uJywgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwQnV0dG9uXCJdJ107XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGRpcmVjdCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGRpcmVjdCkgcmV0dXJuIGRpcmVjdDtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAsIC5sb29rdXBGaWVsZCcpIHx8IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuICAgIGlmICghY29udGFpbmVyKSByZXR1cm4gbnVsbDtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgaW5Db250YWluZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGluQ29udGFpbmVyKSByZXR1cm4gaW5Db250YWluZXI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhcmlhQnV0dG9uID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblthcmlhLWxhYmVsKj1cIkxvb2t1cFwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiT3BlblwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VsZWN0XCJdJyk7XHJcbiAgICBpZiAoYXJpYUJ1dHRvbikgcmV0dXJuIGFyaWFCdXR0b247XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGVHbG9iYWwoZWxlbWVudCkge1xyXG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gZmFsc2U7XHJcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xyXG4gICAgcmV0dXJuIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmXHJcbiAgICAgICAgc3R5bGUudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwaWNrTmVhcmVzdFJvd3Mocm93cywgdGFyZ2V0RWxlbWVudCkge1xyXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkgcmV0dXJuIHJvd3M7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIGlmICghdGFyZ2V0UmVjdCkgcmV0dXJuIHJvd3M7XHJcbiAgICByZXR1cm4gcm93cy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICBjb25zdCByYSA9IGEuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgcmIgPSBiLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IGRhID0gTWF0aC5hYnMocmEubGVmdCAtIHRhcmdldFJlY3QubGVmdCkgKyBNYXRoLmFicyhyYS50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgY29uc3QgZGIgPSBNYXRoLmFicyhyYi5sZWZ0IC0gdGFyZ2V0UmVjdC5sZWZ0KSArIE1hdGguYWJzKHJiLnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICByZXR1cm4gZGEgLSBkYjtcclxuICAgIH0pO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZExvb2t1cEZpbHRlcklucHV0KGxvb2t1cERvY2spIHtcclxuICAgIGlmICghbG9va3VwRG9jaykgcmV0dXJuIG51bGw7XHJcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gQXJyYXkuZnJvbShcclxuICAgICAgICBsb29rdXBEb2NrLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdLCBpbnB1dFtyb2xlPVwidGV4dGJveFwiXScpXHJcbiAgICApO1xyXG4gICAgaWYgKCFjYW5kaWRhdGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgLy8gUHJlZmVyIGlucHV0cyBpbnNpZGUgc2VnbWVudGVkIGVudHJ5IGZseW91dCAoTWFpbkFjY291bnQgaW5wdXQgaW4gdGhlIHJpZ2h0IHBhbmVsKVxyXG4gICAgY29uc3Qgc2VnbWVudElucHV0ID0gY2FuZGlkYXRlcy5maW5kKGlucHV0ID0+IGlucHV0LmNsb3Nlc3QoJy5zZWdtZW50ZWRFbnRyeS1mbHlvdXRTZWdtZW50JykpO1xyXG4gICAgaWYgKHNlZ21lbnRJbnB1dCkgcmV0dXJuIHNlZ21lbnRJbnB1dDtcclxuXHJcbiAgICAvLyBTb21lIGZseW91dHMgd3JhcCB0aGUgaW5wdXQgaW4gYSBjb250YWluZXI7IHRyeSB0byBmaW5kIHRoZSBhY3R1YWwgaW5wdXQgaW5zaWRlXHJcbiAgICBjb25zdCBzZWdtZW50Q29udGFpbmVyID0gbG9va3VwRG9jay5xdWVyeVNlbGVjdG9yKCcuc2VnbWVudGVkRW50cnktZmx5b3V0U2VnbWVudCAuc2VnbWVudGVkRW50cnktc2VnbWVudElucHV0Jyk7XHJcbiAgICBpZiAoc2VnbWVudENvbnRhaW5lcikge1xyXG4gICAgICAgIGNvbnN0IGlubmVyID0gc2VnbWVudENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICAgICAgaWYgKGlubmVyKSByZXR1cm4gaW5uZXI7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJlZmVyIGlucHV0cyBpbnNpZGUgZ3JpZCBoZWFkZXIvdG9vbGJhciBvciBuZWFyIHRoZSB0b3AtcmlnaHQgKGxpa2UgdGhlIG1hcmtlZCBib3gpXHJcbiAgICBjb25zdCBoZWFkZXJDYW5kaWRhdGUgPSBjYW5kaWRhdGVzLmZpbmQoaW5wdXQgPT5cclxuICAgICAgICBpbnB1dC5jbG9zZXN0KCcubG9va3VwLWhlYWRlciwgLmxvb2t1cC10b29sYmFyLCAuZ3JpZC1oZWFkZXIsIFtyb2xlPVwidG9vbGJhclwiXScpXHJcbiAgICApO1xyXG4gICAgaWYgKGhlYWRlckNhbmRpZGF0ZSkgcmV0dXJuIGhlYWRlckNhbmRpZGF0ZTtcclxuXHJcbiAgICBsZXQgYmVzdCA9IGNhbmRpZGF0ZXNbMF07XHJcbiAgICBsZXQgYmVzdFNjb3JlID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xyXG4gICAgZm9yIChjb25zdCBpbnB1dCBvZiBjYW5kaWRhdGVzKSB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IGlucHV0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IHNjb3JlID0gcmVjdC50b3AgKiAyICsgcmVjdC5sZWZ0OyAvLyBiaWFzIHRvd2FyZHMgdG9wIHJvd1xyXG4gICAgICAgIGlmIChzY29yZSA8IGJlc3RTY29yZSkge1xyXG4gICAgICAgICAgICBiZXN0U2NvcmUgPSBzY29yZTtcclxuICAgICAgICAgICAgYmVzdCA9IGlucHV0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBiZXN0O1xyXG59XHJcbiIsICJpbXBvcnQgeyBzbGVlcCB9IGZyb20gJy4vYXN5bmMuanMnO1xyXG5pbXBvcnQgeyBpc0VsZW1lbnRWaXNpYmxlR2xvYmFsLCBwaWNrTmVhcmVzdFJvd3MgfSBmcm9tICcuL2RvbS5qcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvb2t1cFBvcHVwKHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnLmxvb2t1cC1idXR0b25Db250YWluZXInLFxyXG4gICAgICAgICcubG9va3VwRG9jay1idXR0b25Db250YWluZXInLFxyXG4gICAgICAgICdbcm9sZT1cImRpYWxvZ1wiXScsXHJcbiAgICAgICAgJy5sb29rdXAtZmx5b3V0JyxcclxuICAgICAgICAnLmxvb2t1cEZseW91dCcsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJMb29rdXBHcmlkXCJdJyxcclxuICAgICAgICAnLmxvb2t1cC1jb250YWluZXInLFxyXG4gICAgICAgICcubG9va3VwJyxcclxuICAgICAgICAnW3JvbGU9XCJncmlkXCJdJyxcclxuICAgICAgICAndGFibGUnXHJcbiAgICBdO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcHVwID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmICghcG9wdXApIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAocG9wdXAuY2xhc3NMaXN0Py5jb250YWlucygnbWVzc2FnZUNlbnRlcicpKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKHBvcHVwLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpID09PSAnQWN0aW9uIGNlbnRlcicpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAoIWlzRWxlbWVudFZpc2libGVHbG9iYWwocG9wdXApKSBjb250aW51ZTtcclxuICAgICAgICAgICAgcmV0dXJuIHBvcHVwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTG9va3VwUm93cyhsb29rdXBEb2NrLCB0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAzMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgbGV0IHJvd3MgPSBsb29rdXBEb2NrPy5xdWVyeVNlbGVjdG9yQWxsPy4oJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXScpIHx8IFtdO1xyXG4gICAgICAgIGlmIChyb3dzLmxlbmd0aCkgcmV0dXJuIHJvd3M7XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBmaW5kIHZpc2libGUgbG9va3VwIHJvd3MgYW55d2hlcmUgKHNvbWUgZG9ja3MgcmVuZGVyIG91dHNpZGUgdGhlIGNvbnRhaW5lcilcclxuICAgICAgICBjb25zdCBnbG9iYWxSb3dzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd0cltkYXRhLWR5bi1yb3ddLCAubG9va3VwLXJvdywgW3JvbGU9XCJyb3dcIl0nKSlcclxuICAgICAgICAgICAgLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKTtcclxuICAgICAgICBpZiAoZ2xvYmFsUm93cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBpY2tOZWFyZXN0Um93cyhnbG9iYWxSb3dzLCB0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBbXTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAzMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBkb2NrcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmxvb2t1cERvY2stYnV0dG9uQ29udGFpbmVyJykpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbClcclxuICAgICAgICAgICAgLmZpbHRlcihkb2NrID0+ICFkb2NrLmNsYXNzTGlzdD8uY29udGFpbnMoJ21lc3NhZ2VDZW50ZXInKSk7XHJcblxyXG4gICAgICAgIGlmIChkb2Nrcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3Qgd2l0aFJvd3MgPSBkb2Nrcy5maWx0ZXIoZG9jayA9PiBkb2NrLnF1ZXJ5U2VsZWN0b3IoJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXSwgW3JvbGU9XCJncmlkXCJdLCB0YWJsZScpKTtcclxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IHdpdGhSb3dzLmxlbmd0aCA/IHdpdGhSb3dzIDogZG9ja3M7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlc3QgPSBwaWNrTmVhcmVzdERvY2soY2FuZGlkYXRlcywgdGFyZ2V0UmVjdCk7XHJcbiAgICAgICAgICAgIGlmIChiZXN0KSByZXR1cm4gYmVzdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcGlja05lYXJlc3REb2NrKGRvY2tzLCB0YXJnZXRSZWN0KSB7XHJcbiAgICBpZiAoIWRvY2tzLmxlbmd0aCkgcmV0dXJuIG51bGw7XHJcbiAgICBpZiAoIXRhcmdldFJlY3QpIHJldHVybiBkb2Nrc1swXTtcclxuICAgIGxldCBiZXN0ID0gZG9ja3NbMF07XHJcbiAgICBsZXQgYmVzdFNjb3JlID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xyXG4gICAgZm9yIChjb25zdCBkb2NrIG9mIGRvY2tzKSB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IGRvY2suZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgZHggPSBNYXRoLmFicyhyZWN0LmxlZnQgLSB0YXJnZXRSZWN0LmxlZnQpO1xyXG4gICAgICAgIGNvbnN0IGR5ID0gTWF0aC5hYnMocmVjdC50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgY29uc3Qgc2NvcmUgPSBkeCArIGR5O1xyXG4gICAgICAgIGlmIChzY29yZSA8IGJlc3RTY29yZSkge1xyXG4gICAgICAgICAgICBiZXN0U2NvcmUgPSBzY29yZTtcclxuICAgICAgICAgICAgYmVzdCA9IGRvY2s7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJlc3Q7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTGlzdGJveEZvckVsZW1lbnQodGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gWydbcm9sZT1cImxpc3Rib3hcIl0nLCAnLmRyb3BEb3duTGlzdCcsICcuY29tYm9Cb3hEcm9wRG93bicsICcuZHJvcGRvd24tbWVudScsICcuZHJvcGRvd24tbGlzdCddO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRhcmdldEVsZW1lbnQ/LmdldEJvdW5kaW5nQ2xpZW50UmVjdD8uKCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgbGlzdHMgPSBzZWxlY3RvcnMuZmxhdE1hcChzZWwgPT4gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHNlbCkpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpO1xyXG4gICAgICAgIGlmIChsaXN0cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBpY2tOZWFyZXN0RG9jayhsaXN0cywgdGFyZ2V0UmVjdCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBsaW5rZWQgPSBnZXRMaXN0Ym94RnJvbUlucHV0KGlucHV0KTtcclxuICAgICAgICBpZiAobGlua2VkICYmIGlzRWxlbWVudFZpc2libGVHbG9iYWwobGlua2VkKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gbGlua2VkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBmYWxsYmFjayA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCAyMDApO1xyXG4gICAgICAgIGlmIChmYWxsYmFjaykgcmV0dXJuIGZhbGxiYWNrO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3Rib3hGcm9tSW5wdXQoaW5wdXQpIHtcclxuICAgIGlmICghaW5wdXQpIHJldHVybiBudWxsO1xyXG4gICAgY29uc3QgaWQgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnKSB8fCBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2FyaWEtb3ducycpO1xyXG4gICAgaWYgKGlkKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XHJcbiAgICAgICAgaWYgKGVsKSByZXR1cm4gZWw7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhY3RpdmVJZCA9IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jyk7XHJcbiAgICBpZiAoYWN0aXZlSWQpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVJZCk7XHJcbiAgICAgICAgY29uc3QgbGlzdCA9IGFjdGl2ZT8uY2xvc2VzdD8uKCdbcm9sZT1cImxpc3Rib3hcIl0nKTtcclxuICAgICAgICBpZiAobGlzdCkgcmV0dXJuIGxpc3Q7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb21ib0JveEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJy5sb29rdXBCdXR0b24nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtYnV0dG9uJyxcclxuICAgICAgICAnLmNvbWJvQm94LWRyb3BEb3duQnV0dG9uJyxcclxuICAgICAgICAnLmRyb3Bkb3duQnV0dG9uJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJEcm9wRG93bkJ1dHRvblwiXScsXHJcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIk9wZW5cIl0nLFxyXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJTZWxlY3RcIl0nXHJcbiAgICBdO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBidG4gPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChidG4pIHJldHVybiBidG47XHJcbiAgICB9XHJcbiAgICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5pbnB1dF9jb250YWluZXIsIC5mb3JtLWdyb3VwJykgfHwgZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybiBudWxsO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBidG4gPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGJ0bikgcmV0dXJuIGJ0bjtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29sbGVjdENvbWJvT3B0aW9ucyhsaXN0Ym94KSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJ1tyb2xlPVwib3B0aW9uXCJdJyxcclxuICAgICAgICAnLmNvbWJvQm94LWxpc3RJdGVtJyxcclxuICAgICAgICAnLmNvbWJvQm94LWl0ZW0nLFxyXG4gICAgICAgICdsaScsXHJcbiAgICAgICAgJy5kcm9wZG93bi1saXN0LWl0ZW0nLFxyXG4gICAgICAgICcuY29tYm9Cb3hJdGVtJyxcclxuICAgICAgICAnLmRyb3BEb3duTGlzdEl0ZW0nLFxyXG4gICAgICAgICcuZHJvcGRvd24taXRlbSdcclxuICAgIF07XHJcbiAgICBjb25zdCBmb3VuZCA9IFtdO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBsaXN0Ym94LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50VmlzaWJsZUdsb2JhbChlbCkpIGZvdW5kLnB1c2goZWwpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvdW5kLmxlbmd0aCA/IGZvdW5kIDogQXJyYXkuZnJvbShsaXN0Ym94LmNoaWxkcmVuKS5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbCk7XHJcbn1cclxuIiwgImltcG9ydCB7IHNsZWVwLCBzZXROYXRpdmVWYWx1ZSB9IGZyb20gJy4vYXN5bmMuanMnO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHR5cGVWYWx1ZVNsb3dseShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgaW5wdXQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gVHlwZSBjaGFyYWN0ZXIgYnkgY2hhcmFjdGVyXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBidWZmZXIpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MCk7IC8vIDgwbXMgcGVyIGNoYXJhY3RlclxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmJsdXIoKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7IC8vIFdhaXQgZm9yIHZhbGlkYXRpb25cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHR5cGVWYWx1ZVdpdGhJbnB1dEV2ZW50cyhpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgaW5wdXQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJyk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBidWZmZXIpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7IGRhdGE6IGNoYXIsIGlucHV0VHlwZTogJ2luc2VydFRleHQnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvcklucHV0VmFsdWUoaW5wdXQsIHZhbHVlLCB0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBleHBlY3RlZCA9IFN0cmluZyh2YWx1ZSA/PyAnJykudHJpbSgpO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSBTdHJpbmcoaW5wdXQ/LnZhbHVlID8/ICcnKS50cmltKCk7XHJcbiAgICAgICAgaWYgKGN1cnJlbnQgPT09IGV4cGVjdGVkKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0VmFsdWVPbmNlKGlucHV0LCB2YWx1ZSwgY2xlYXJGaXJzdCA9IGZhbHNlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIGlmIChjbGVhckZpcnN0KSB7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZXhwZWN0ZWQgPSBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKTtcclxuICAgIGF3YWl0IHNldFZhbHVlT25jZShpbnB1dCwgdmFsdWUsIHRydWUpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIGlmIChTdHJpbmcoaW5wdXQudmFsdWUgPz8gJycpLnRyaW0oKSAhPT0gZXhwZWN0ZWQpIHtcclxuICAgICAgICBhd2FpdCB0eXBlVmFsdWVTbG93bHkoaW5wdXQsIGV4cGVjdGVkKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gPT09PT09PT09PT09IDggQ29tYm9Cb3ggSW5wdXQgTWV0aG9kcyA9PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMTogQmFzaWMgc2V0VmFsdWUgKGZhc3QgYnV0IG1heSBub3QgdHJpZ2dlciBEMzY1IGZpbHRlcmluZylcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kMShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMjogUGFzdGUgc2ltdWxhdGlvbiB3aXRoIElucHV0RXZlbnRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kMihpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIENsZWFyIGZpcnN0XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gU2ltdWxhdGUgcGFzdGVcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbVBhc3RlJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDM6IENoYXJhY3Rlci1ieS1jaGFyYWN0ZXIgd2l0aCBmdWxsIGtleSBldmVudHMgKFJFQ09NTUVOREVEKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QzKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQ2xlYXIgdGhlIGlucHV0IGZpcnN0XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBidWZmZXI7XHJcblxyXG4gICAgICAgIC8vIEZpcmUga2V5ZG93blxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGJlZm9yZWlucHV0XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnYmVmb3JlaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdmFsdWVcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBpbnB1dCBldmVudFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBrZXl1cFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNDogQ2hhcmFjdGVyLWJ5LWNoYXJhY3RlciB3aXRoIGtleXByZXNzIChsZWdhY3kpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDQoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBjb25zdCBjaGFyQ29kZSA9IGNoYXIuY2hhckNvZGVBdCgwKTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBidWZmZXI7XHJcblxyXG4gICAgICAgIC8vIGtleWRvd25cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGtleXByZXNzIChkZXByZWNhdGVkIGJ1dCBzdGlsbCB1c2VkIGJ5IHNvbWUgZnJhbWV3b3JrcylcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlwcmVzcycsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgY2hhckNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGJlZm9yZWlucHV0XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnYmVmb3JlaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdmFsdWVcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgLy8gaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGtleXVwXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNTogZXhlY0NvbW1hbmQgaW5zZXJ0VGV4dFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q1KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2VsZWN0IGFsbCBhbmQgZGVsZXRlXHJcbiAgICBpbnB1dC5zZWxlY3QoKTtcclxuICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdkZWxldGUnKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBJbnNlcnQgdGV4dFxyXG4gICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2luc2VydFRleHQnLCBmYWxzZSwgdmFsdWUpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNjogUGFzdGUgKyBCYWNrc3BhY2Ugd29ya2Fyb3VuZFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q2KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2V0IHZhbHVlIGRpcmVjdGx5IChsaWtlIHBhc3RlKVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbVBhc3RlJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQWRkIGEgY2hhcmFjdGVyIGFuZCBkZWxldGUgaXQgdG8gdHJpZ2dlciBmaWx0ZXJpbmdcclxuICAgIGNvbnN0IHZhbHVlV2l0aEV4dHJhID0gdmFsdWUgKyAnWCc7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWVXaXRoRXh0cmEpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICBkYXRhOiAnWCdcclxuICAgIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gTm93IGRlbGV0ZSB0aGF0IGNoYXJhY3RlciB3aXRoIGEgcmVhbCBiYWNrc3BhY2UgZXZlbnRcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAga2V5OiAnQmFja3NwYWNlJyxcclxuICAgICAgICBjb2RlOiAnQmFja3NwYWNlJyxcclxuICAgICAgICBrZXlDb2RlOiA4LFxyXG4gICAgICAgIHdoaWNoOiA4LFxyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAga2V5OiAnQmFja3NwYWNlJyxcclxuICAgICAgICBjb2RlOiAnQmFja3NwYWNlJyxcclxuICAgICAgICBrZXlDb2RlOiA4LFxyXG4gICAgICAgIHdoaWNoOiA4LFxyXG4gICAgICAgIGJ1YmJsZXM6IHRydWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDc6IEQzNjUgaW50ZXJuYWwgbWVjaGFuaXNtIHRyaWdnZXJcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNyhpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIFNldCB2YWx1ZSB3aXRoIGZ1bGwgZXZlbnQgc2VxdWVuY2UgdXNlZCBieSBEMzY1XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBUeXBlIGNoYXJhY3RlciBieSBjaGFyYWN0ZXIgYnV0IGFsc28gZGlzcGF0Y2ggb24gdGhlIHBhcmVudCBjb250cm9sXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBpbnB1dC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZV0nKSB8fCBpbnB1dC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gaW5wdXQudmFsdWUgKyBjaGFyO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgYSBjb21wcmVoZW5zaXZlIGV2ZW50IHNldFxyXG4gICAgICAgIGNvbnN0IGtleWJvYXJkRXZlbnRJbml0ID0ge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgY29tcG9zZWQ6IHRydWUsXHJcbiAgICAgICAgICAgIHZpZXc6IHdpbmRvd1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEZpcmUgb24gaW5wdXQgYW5kIHBvdGVudGlhbGx5IGJ1YmJsZSB0byBEMzY1IGhhbmRsZXJzXHJcbiAgICAgICAgY29uc3Qga2V5ZG93bkV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCBrZXlib2FyZEV2ZW50SW5pdCk7XHJcbiAgICAgICAgY29uc3Qga2V5dXBFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIGtleWJvYXJkRXZlbnRJbml0KTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChrZXlkb3duRXZlbnQpO1xyXG5cclxuICAgICAgICAvLyBTZXQgdmFsdWUgQkVGT1JFIGlucHV0IGV2ZW50XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhcixcclxuICAgICAgICAgICAgY29tcG9zZWQ6IHRydWUsXHJcbiAgICAgICAgICAgIHZpZXc6IHdpbmRvd1xyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChrZXl1cEV2ZW50KTtcclxuXHJcbiAgICAgICAgLy8gQWxzbyBkaXNwYXRjaCBvbiBwYXJlbnQgZm9yIEQzNjUgY29udHJvbHNcclxuICAgICAgICBpZiAocGFyZW50ICYmIHBhcmVudCAhPT0gaW5wdXQpIHtcclxuICAgICAgICAgICAgcGFyZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluYWwgY2hhbmdlIGV2ZW50XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgICAvLyBUcnkgdG8gdHJpZ2dlciBEMzY1J3MgVmFsdWVDaGFuZ2VkIGNvbW1hbmRcclxuICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICBwYXJlbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ1ZhbHVlQ2hhbmdlZCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgZGV0YWlsOiB7IHZhbHVlOiB2YWx1ZSB9XHJcbiAgICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgODogQ29tcG9zaXRpb24gZXZlbnRzIChJTUUtc3R5bGUpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDgoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFN0YXJ0IGNvbXBvc2l0aW9uXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbnN0YXJ0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICBkYXRhOiAnJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBjdXJyZW50VmFsdWUgPSAnJztcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY3VycmVudFZhbHVlICs9IHN0cmluZ1ZhbHVlW2ldO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbnVwZGF0ZScsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgZGF0YTogY3VycmVudFZhbHVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydENvbXBvc2l0aW9uVGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGN1cnJlbnRWYWx1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEVuZCBjb21wb3NpdGlvblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgQ29tcG9zaXRpb25FdmVudCgnY29tcG9zaXRpb25lbmQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbUNvbXBvc2l0aW9uJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBIZWxwZXIgdG8gZ2V0IGtleSBjb2RlIGZyb20gY2hhcmFjdGVyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0S2V5Q29kZShjaGFyKSB7XHJcbiAgICBjb25zdCB1cHBlckNoYXIgPSBjaGFyLnRvVXBwZXJDYXNlKCk7XHJcbiAgICBpZiAodXBwZXJDaGFyID49ICdBJyAmJiB1cHBlckNoYXIgPD0gJ1onKSB7XHJcbiAgICAgICAgcmV0dXJuICdLZXknICsgdXBwZXJDaGFyO1xyXG4gICAgfVxyXG4gICAgaWYgKGNoYXIgPj0gJzAnICYmIGNoYXIgPD0gJzknKSB7XHJcbiAgICAgICAgcmV0dXJuICdEaWdpdCcgKyBjaGFyO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgc3BlY2lhbEtleXMgPSB7XHJcbiAgICAgICAgJyAnOiAnU3BhY2UnLFxyXG4gICAgICAgICctJzogJ01pbnVzJyxcclxuICAgICAgICAnPSc6ICdFcXVhbCcsXHJcbiAgICAgICAgJ1snOiAnQnJhY2tldExlZnQnLFxyXG4gICAgICAgICddJzogJ0JyYWNrZXRSaWdodCcsXHJcbiAgICAgICAgJ1xcXFwnOiAnQmFja3NsYXNoJyxcclxuICAgICAgICAnOyc6ICdTZW1pY29sb24nLFxyXG4gICAgICAgIFwiJ1wiOiAnUXVvdGUnLFxyXG4gICAgICAgICcsJzogJ0NvbW1hJyxcclxuICAgICAgICAnLic6ICdQZXJpb2QnLFxyXG4gICAgICAgICcvJzogJ1NsYXNoJyxcclxuICAgICAgICAnYCc6ICdCYWNrcXVvdGUnXHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIHNwZWNpYWxLZXlzW2NoYXJdIHx8ICdVbmlkZW50aWZpZWQnO1xyXG59XHJcblxyXG4vKipcclxuICogRGlzcGF0Y2hlciBmdW5jdGlvbiAtIHVzZXMgdGhlIHNlbGVjdGVkIGlucHV0IG1ldGhvZCBmcm9tIHNldHRpbmdzXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUsIG1ldGhvZCkge1xyXG4gICAgY29uc29sZS5sb2coYFtEMzY1XSBVc2luZyBjb21ib2JveCBpbnB1dCBtZXRob2Q6ICR7bWV0aG9kfWApO1xyXG5cclxuICAgIHN3aXRjaCAobWV0aG9kKSB7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kMSc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDInOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDIoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2QzJzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QzKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNCc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNChpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDUnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDUoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q2JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q2KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNyc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNyhpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDgnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDgoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBkZWZhdWx0OiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKTsgLy8gRGVmYXVsdCB0byBtZXRob2QgM1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29tbWl0Q29tYm9WYWx1ZShpbnB1dCwgdmFsdWUsIGVsZW1lbnQpIHtcclxuICAgIGlmICghaW5wdXQpIHJldHVybjtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2ZvY3Vzb3V0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFc2NhcGUnLCBjb2RlOiAnRXNjYXBlJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRXNjYXBlJywgY29kZTogJ0VzY2FwZScsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuYmx1cigpO1xyXG4gICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgfVxyXG4gICAgZG9jdW1lbnQuYm9keT8uY2xpY2s/LigpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGlzcGF0Y2hDbGlja1NlcXVlbmNlKHRhcmdldCkge1xyXG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcnVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5jbGljaygpO1xyXG59XHJcbiIsICJleHBvcnQgZnVuY3Rpb24gcGFyc2VHcmlkQW5kQ29sdW1uKGNvbnRyb2xOYW1lKSB7XG4gICAgY29uc3QgdGV4dCA9IFN0cmluZyhjb250cm9sTmFtZSB8fCAnJyk7XG4gICAgY29uc3QgbGFzdFVuZGVyc2NvcmVJZHggPSB0ZXh0Lmxhc3RJbmRleE9mKCdfJyk7XG4gICAgaWYgKGxhc3RVbmRlcnNjb3JlSWR4IDw9IDAgfHwgbGFzdFVuZGVyc2NvcmVJZHggPT09IHRleHQubGVuZ3RoIC0gMSkge1xuICAgICAgICByZXR1cm4geyBncmlkTmFtZTogdGV4dCwgY29sdW1uTmFtZTogJycgfTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ3JpZE5hbWU6IHRleHQuc3Vic3RyaW5nKDAsIGxhc3RVbmRlcnNjb3JlSWR4KSxcbiAgICAgICAgY29sdW1uTmFtZTogdGV4dC5zdWJzdHJpbmcobGFzdFVuZGVyc2NvcmVJZHggKyAxKVxuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEZpbHRlckZpZWxkUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Y29udHJvbE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXG4gICAgICAgIGBGaWx0ZXJGaWVsZF8ke2NvbnRyb2xOYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXG4gICAgICAgIGAke2NvbnRyb2xOYW1lfV9GaWx0ZXJGaWVsZF9JbnB1dGAsXG4gICAgICAgIGAke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9X0ZpbHRlckZpZWxkYFxuICAgIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgYCR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fQXBwbHlGaWx0ZXJzYCxcbiAgICAgICAgYCR7Y29udHJvbE5hbWV9X0FwcGx5RmlsdGVyc2AsXG4gICAgICAgIGAke2dyaWROYW1lfV9BcHBseUZpbHRlcnNgLFxuICAgICAgICAnQXBwbHlGaWx0ZXJzJ1xuICAgIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWx0ZXJNZXRob2RTZWFyY2hUZXJtcyhtZXRob2QpIHtcbiAgICBjb25zdCBtZXRob2RNYXBwaW5ncyA9IHtcbiAgICAgICAgJ2lzIGV4YWN0bHknOiBbJ2lzIGV4YWN0bHknLCAnZXF1YWxzJywgJ2lzIGVxdWFsIHRvJywgJz0nXSxcbiAgICAgICAgY29udGFpbnM6IFsnY29udGFpbnMnLCAnbGlrZSddLFxuICAgICAgICAnYmVnaW5zIHdpdGgnOiBbJ2JlZ2lucyB3aXRoJywgJ3N0YXJ0cyB3aXRoJ10sXG4gICAgICAgICdpcyBub3QnOiBbJ2lzIG5vdCcsICdub3QgZXF1YWwnLCAnIT0nLCAnPD4nXSxcbiAgICAgICAgJ2RvZXMgbm90IGNvbnRhaW4nOiBbJ2RvZXMgbm90IGNvbnRhaW4nLCAnbm90IGxpa2UnXSxcbiAgICAgICAgJ2lzIG9uZSBvZic6IFsnaXMgb25lIG9mJywgJ2luJ10sXG4gICAgICAgIGFmdGVyOiBbJ2FmdGVyJywgJ2dyZWF0ZXIgdGhhbicsICc+J10sXG4gICAgICAgIGJlZm9yZTogWydiZWZvcmUnLCAnbGVzcyB0aGFuJywgJzwnXSxcbiAgICAgICAgbWF0Y2hlczogWydtYXRjaGVzJywgJ3JlZ2V4JywgJ3BhdHRlcm4nXVxuICAgIH07XG4gICAgcmV0dXJuIG1ldGhvZE1hcHBpbmdzW21ldGhvZF0gfHwgW1N0cmluZyhtZXRob2QgfHwgJycpXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRleHRJbmNsdWRlc0FueSh0ZXh0LCB0ZXJtcykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRUZXh0ID0gU3RyaW5nKHRleHQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuICh0ZXJtcyB8fCBbXSkuc29tZSh0ZXJtID0+IG5vcm1hbGl6ZWRUZXh0LmluY2x1ZGVzKFN0cmluZyh0ZXJtIHx8ICcnKS50b0xvd2VyQ2FzZSgpKSk7XG59XG4iLCAiaW1wb3J0IHsgbG9nU3RlcCB9IGZyb20gJy4uL3V0aWxzL2xvZ2dpbmcuanMnO1xyXG5pbXBvcnQgeyBzZXROYXRpdmVWYWx1ZSwgc2xlZXAgfSBmcm9tICcuLi91dGlscy9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0LCBpc0VsZW1lbnRWaXNpYmxlLCBpc0QzNjVMb2FkaW5nLCBmaW5kR3JpZENlbGxFbGVtZW50LCBoYXNMb29rdXBCdXR0b24sIGZpbmRMb29rdXBCdXR0b24sIGZpbmRMb29rdXBGaWx0ZXJJbnB1dCB9IGZyb20gJy4uL3V0aWxzL2RvbS5qcyc7XHJcbmltcG9ydCB7IHdhaXRGb3JMb29rdXBQb3B1cCwgd2FpdEZvckxvb2t1cFJvd3MsIHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudCwgd2FpdEZvckxpc3Rib3hGb3JJbnB1dCwgY29sbGVjdENvbWJvT3B0aW9ucywgZmluZENvbWJvQm94QnV0dG9uIH0gZnJvbSAnLi4vdXRpbHMvbG9va3VwLmpzJztcbmltcG9ydCB7IHR5cGVWYWx1ZVNsb3dseSwgdHlwZVZhbHVlV2l0aElucHV0RXZlbnRzLCB3YWl0Rm9ySW5wdXRWYWx1ZSwgc2V0VmFsdWVPbmNlLCBzZXRWYWx1ZVdpdGhWZXJpZnksIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QgYXMgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZFdpdGhNb2RlLCBjb21taXRDb21ib1ZhbHVlLCBkaXNwYXRjaENsaWNrU2VxdWVuY2UgfSBmcm9tICcuLi91dGlscy9jb21ib2JveC5qcyc7XG5pbXBvcnQgeyBjb2VyY2VCb29sZWFuLCBub3JtYWxpemVUZXh0IH0gZnJvbSAnLi4vdXRpbHMvdGV4dC5qcyc7XG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuLi9ydW50aW1lL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBwYXJzZUdyaWRBbmRDb2x1bW4sIGJ1aWxkRmlsdGVyRmllbGRQYXR0ZXJucywgYnVpbGRBcHBseUJ1dHRvblBhdHRlcm5zLCBnZXRGaWx0ZXJNZXRob2RTZWFyY2hUZXJtcywgdGV4dEluY2x1ZGVzQW55IH0gZnJvbSAnLi9hY3Rpb24taGVscGVycy5qcyc7XG5cclxuZnVuY3Rpb24gY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUpIHtcclxuICAgIGNvbnN0IG1ldGhvZCA9IHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3M/LmNvbWJvU2VsZWN0TW9kZSB8fCAnbWV0aG9kMyc7XHJcbiAgICByZXR1cm4gY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZFdpdGhNb2RlKGlucHV0LCB2YWx1ZSwgbWV0aG9kKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSB7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ1NlZ21lbnRlZEVudHJ5JykgcmV0dXJuIHRydWU7XHJcbiAgICBpZiAoZWxlbWVudC5jbG9zZXN0Py4oJ1tkYXRhLWR5bi1yb2xlPVwiU2VnbWVudGVkRW50cnlcIl0nKSkgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgY29uc3QgY2xhc3NMaXN0ID0gZWxlbWVudC5jbGFzc0xpc3Q7XHJcbiAgICBpZiAoY2xhc3NMaXN0ICYmIChjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZEVudHJ5JykgfHxcclxuICAgICAgICBjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZC1lbnRyeScpIHx8XHJcbiAgICAgICAgY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWdtZW50ZWRFbnRyeS1zZWdtZW50SW5wdXQnKSkpIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gISFlbGVtZW50LnF1ZXJ5U2VsZWN0b3I/LignLnNlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCwgLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsaWNrRWxlbWVudChjb250cm9sTmFtZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIFxyXG4gICAgZWxlbWVudC5jbGljaygpO1xyXG4gICAgYXdhaXQgc2xlZXAoODAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5R3JpZEZpbHRlcihjb250cm9sTmFtZSwgZmlsdGVyVmFsdWUsIGZpbHRlck1ldGhvZCA9ICdpcyBleGFjdGx5Jykge1xyXG4gICAgY29uc29sZS5sb2coYEFwcGx5aW5nIGZpbHRlcjogJHtjb250cm9sTmFtZX0gJHtmaWx0ZXJNZXRob2R9IFwiJHtmaWx0ZXJWYWx1ZX1cImApO1xyXG4gICAgXHJcbiAgICAvLyBFeHRyYWN0IGdyaWQgbmFtZSBhbmQgY29sdW1uIG5hbWUgZnJvbSBjb250cm9sTmFtZVxyXG4gICAgLy8gRm9ybWF0OiBHcmlkTmFtZV9Db2x1bW5OYW1lIChlLmcuLCBcIkdyaWRSZWFkT25seU1hcmt1cFRhYmxlX01hcmt1cENvZGVcIilcclxuICAgIGNvbnN0IHsgZ3JpZE5hbWUsIGNvbHVtbk5hbWUgfSA9IHBhcnNlR3JpZEFuZENvbHVtbihjb250cm9sTmFtZSk7XG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgICBHcmlkOiAke2dyaWROYW1lfSwgQ29sdW1uOiAke2NvbHVtbk5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiB0byBmaW5kIGZpbHRlciBpbnB1dCB3aXRoIG11bHRpcGxlIHBhdHRlcm5zXHJcbiAgICBhc3luYyBmdW5jdGlvbiBmaW5kRmlsdGVySW5wdXQoKSB7XHJcbiAgICAgICAgLy8gRDM2NSBjcmVhdGVzIGZpbHRlciBpbnB1dHMgd2l0aCB2YXJpb3VzIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgZmlsdGVyRmllbGRQYXR0ZXJucyA9IGJ1aWxkRmlsdGVyRmllbGRQYXR0ZXJucyhjb250cm9sTmFtZSwgZ3JpZE5hbWUsIGNvbHVtbk5hbWUpO1xuICAgICAgICBcclxuICAgICAgICBsZXQgZmlsdGVySW5wdXQgPSBudWxsO1xyXG4gICAgICAgIGxldCBmaWx0ZXJGaWVsZENvbnRhaW5lciA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGV4YWN0IHBhdHRlcm5zIGZpcnN0XHJcbiAgICAgICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIGZpbHRlckZpZWxkUGF0dGVybnMpIHtcclxuICAgICAgICAgICAgZmlsdGVyRmllbGRDb250YWluZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke3BhdHRlcm59XCJdYCk7XHJcbiAgICAgICAgICAgIGlmIChmaWx0ZXJGaWVsZENvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBmaWx0ZXJGaWVsZENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsdGVyRmllbGRDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQnKTtcclxuICAgICAgICAgICAgICAgIGlmIChmaWx0ZXJJbnB1dCAmJiBmaWx0ZXJJbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGb3VuZCBmaWx0ZXIgZmllbGQ6ICR7cGF0dGVybn1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXIgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgcGFydGlhbCBtYXRjaCBvbiBGaWx0ZXJGaWVsZCBjb250YWluaW5nIHRoZSBjb2x1bW4gbmFtZVxyXG4gICAgICAgIGNvbnN0IHBhcnRpYWxNYXRjaGVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlckZpZWxkXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIiR7Y29sdW1uTmFtZX1cIl1gKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNvbnRhaW5lciBvZiBwYXJ0aWFsTWF0Y2hlcykge1xyXG4gICAgICAgICAgICBmaWx0ZXJJbnB1dCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pJyk7XHJcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJbnB1dCAmJiBmaWx0ZXJJbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIGZpbHRlciBmaWVsZCAocGFydGlhbCBtYXRjaCk6ICR7Y29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKX1gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lcjogY29udGFpbmVyIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IEZpbmQgYW55IHZpc2libGUgZmlsdGVyIGlucHV0IGluIGZpbHRlciBkcm9wZG93bi9mbHlvdXQgYXJlYVxyXG4gICAgICAgIC8vIExvb2sgZm9yIGlucHV0cyBpbnNpZGUgZmlsdGVyLXJlbGF0ZWQgY29udGFpbmVyc1xyXG4gICAgICAgIGNvbnN0IGZpbHRlckNvbnRhaW5lcnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuZHluLWZpbHRlci1wb3B1cCwgLmZpbHRlci1wYW5lbCwgW2RhdGEtZHluLXJvbGU9XCJGaWx0ZXJQYW5lXCJdLCBbY2xhc3MqPVwiZmlsdGVyXCJdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBjb250YWluZXIgb2YgZmlsdGVyQ29udGFpbmVycykge1xyXG4gICAgICAgICAgICBmaWx0ZXJJbnB1dCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pOm5vdChbcmVhZG9ubHldKScpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGb3VuZCBmaWx0ZXIgaW5wdXQgaW4gZmlsdGVyIGNvbnRhaW5lcmApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBjb250YWluZXIgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBMYXN0IHJlc29ydDogQW55IHZpc2libGUgRmlsdGVyRmllbGQgaW5wdXRcclxuICAgICAgICBjb25zdCB2aXNpYmxlRmlsdGVySW5wdXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlckZpZWxkXCJdIGlucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGlucCBvZiB2aXNpYmxlRmlsdGVySW5wdXRzKSB7XHJcbiAgICAgICAgICAgIGlmIChpbnAub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lciA9IGlucC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl0nKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIHZpc2libGUgZmlsdGVyIGZpZWxkOiAke2ZpbHRlckZpZWxkQ29udGFpbmVyPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyl9YCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dDogaW5wLCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0OiBudWxsLCBmaWx0ZXJGaWVsZENvbnRhaW5lcjogbnVsbCB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGaXJzdCwgY2hlY2sgaWYgdGhlIGZpbHRlciBwYW5lbCBpcyBhbHJlYWR5IG9wZW5cclxuICAgIGxldCB7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9ID0gYXdhaXQgZmluZEZpbHRlcklucHV0KCk7XHJcbiAgICBcclxuICAgIC8vIElmIGZpbHRlciBpbnB1dCBub3QgZm91bmQsIHdlIG5lZWQgdG8gY2xpY2sgdGhlIGNvbHVtbiBoZWFkZXIgdG8gb3BlbiB0aGUgZmlsdGVyIGRyb3Bkb3duXHJcbiAgICBpZiAoIWZpbHRlcklucHV0KSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgRmlsdGVyIHBhbmVsIG5vdCBvcGVuLCBjbGlja2luZyBoZWFkZXIgdG8gb3Blbi4uLmApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgdGhlIGFjdHVhbCBoZWFkZXIgY2VsbFxyXG4gICAgICAgIGNvbnN0IGFsbEhlYWRlcnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGxldCBjbGlja1RhcmdldCA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGFsbEhlYWRlcnMpIHtcclxuICAgICAgICAgICAgaWYgKGguY2xhc3NMaXN0LmNvbnRhaW5zKCdkeW4taGVhZGVyQ2VsbCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgaC5pZD8uaW5jbHVkZXMoJ2hlYWRlcicpIHx8XHJcbiAgICAgICAgICAgICAgICBoLmNsb3Nlc3QoJy5keW4taGVhZGVyQ2VsbCcpIHx8XHJcbiAgICAgICAgICAgICAgICBoLmNsb3Nlc3QoJ1tyb2xlPVwiY29sdW1uaGVhZGVyXCJdJykpIHtcclxuICAgICAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gaDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBieSBJRCBwYXR0ZXJuXHJcbiAgICAgICAgaWYgKCFjbGlja1RhcmdldCkge1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtpZCo9XCIke2NvbnRyb2xOYW1lfVwiXVtpZCo9XCJoZWFkZXJcIl1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gZmlyc3QgZWxlbWVudCB3aXRoIGNvbnRyb2xOYW1lXHJcbiAgICAgICAgaWYgKCFjbGlja1RhcmdldCkge1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGaWx0ZXIgY29sdW1uIGhlYWRlciBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODAwKTsgLy8gV2FpdCBsb25nZXIgZm9yIGRyb3Bkb3duIHRvIG9wZW5cclxuICAgICAgICBcclxuICAgICAgICAvLyBSZXRyeSBmaW5kaW5nIHRoZSBmaWx0ZXIgaW5wdXQgd2l0aCBhIHdhaXQgbG9vcFxyXG4gICAgICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgMTA7IGF0dGVtcHQrKykge1xyXG4gICAgICAgICAgICAoeyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXIgfSA9IGF3YWl0IGZpbmRGaWx0ZXJJbnB1dCgpKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0KSBicmVhaztcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghZmlsdGVySW5wdXQpIHtcclxuICAgICAgICAvLyBEZWJ1ZzogTG9nIHdoYXQgZWxlbWVudHMgd2UgY2FuIGZpbmRcclxuICAgICAgICBjb25zdCBhbGxGaWx0ZXJGaWVsZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl0nKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBEZWJ1ZzogRm91bmQgJHthbGxGaWx0ZXJGaWVsZHMubGVuZ3RofSBGaWx0ZXJGaWVsZCBlbGVtZW50czpgKTtcclxuICAgICAgICBhbGxGaWx0ZXJGaWVsZHMuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAgLSAke2VsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKX0sIHZpc2libGU6ICR7ZWwub2Zmc2V0UGFyZW50ICE9PSBudWxsfWApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmlsdGVyIGlucHV0IG5vdCBmb3VuZC4gTWFrZSBzdXJlIHRoZSBmaWx0ZXIgZHJvcGRvd24gaXMgb3Blbi4gRXhwZWN0ZWQgcGF0dGVybjogRmlsdGVyRmllbGRfJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV8ke2NvbHVtbk5hbWV9X0lucHV0XzBgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU3RlcCA0OiBTZXQgdGhlIGZpbHRlciBtZXRob2QgaWYgbm90IFwiaXMgZXhhY3RseVwiIChkZWZhdWx0KVxyXG4gICAgaWYgKGZpbHRlck1ldGhvZCAmJiBmaWx0ZXJNZXRob2QgIT09ICdpcyBleGFjdGx5Jykge1xyXG4gICAgICAgIGF3YWl0IHNldEZpbHRlck1ldGhvZChmaWx0ZXJGaWVsZENvbnRhaW5lciwgZmlsdGVyTWV0aG9kKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU3RlcCA1OiBFbnRlciB0aGUgZmlsdGVyIHZhbHVlXHJcbiAgICBmaWx0ZXJJbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIGZpbHRlcklucHV0LnNlbGVjdCgpO1xyXG4gICAgXHJcbiAgICAvLyBDbGVhciBleGlzdGluZyB2YWx1ZSBmaXJzdFxyXG4gICAgZmlsdGVySW5wdXQudmFsdWUgPSAnJztcclxuICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgXHJcbiAgICAvLyBTZXQgdGhlIHZhbHVlIHVzaW5nIG5hdGl2ZSBzZXR0ZXJcclxuICAgIHNldE5hdGl2ZVZhbHVlKGZpbHRlcklucHV0LCBmaWx0ZXJWYWx1ZSk7XHJcbiAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBTdGVwIDY6IEFwcGx5IHRoZSBmaWx0ZXIgLSBmaW5kIGFuZCBjbGljayB0aGUgQXBwbHkgYnV0dG9uXHJcbiAgICAvLyBJTVBPUlRBTlQ6IFRoZSBwYXR0ZXJuIGlzIHtHcmlkTmFtZX1fe0NvbHVtbk5hbWV9X0FwcGx5RmlsdGVycywgbm90IGp1c3Qge0dyaWROYW1lfV9BcHBseUZpbHRlcnNcclxuICAgIGNvbnN0IGFwcGx5QnRuUGF0dGVybnMgPSBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKTtcbiAgICBcclxuICAgIGxldCBhcHBseUJ0biA9IG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgYXBwbHlCdG5QYXR0ZXJucykge1xyXG4gICAgICAgIGFwcGx5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtwYXR0ZXJufVwiXWApO1xyXG4gICAgICAgIGlmIChhcHBseUJ0biAmJiBhcHBseUJ0bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgYXBwbHkgYnV0dG9uOiAke3BhdHRlcm59YCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmFsbGJhY2s6IGZpbmQgYW55IHZpc2libGUgQXBwbHlGaWx0ZXJzIGJ1dHRvblxyXG4gICAgaWYgKCFhcHBseUJ0biB8fCBhcHBseUJ0bi5vZmZzZXRQYXJlbnQgPT09IG51bGwpIHtcclxuICAgICAgICBjb25zdCBhbGxBcHBseUJ0bnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiQXBwbHlGaWx0ZXJzXCJdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBidG4gb2YgYWxsQXBwbHlCdG5zKSB7XHJcbiAgICAgICAgICAgIGlmIChidG4ub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBhcHBseUJ0biA9IGJ0bjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoYXBwbHlCdG4pIHtcclxuICAgICAgICBhcHBseUJ0bi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBGaWx0ZXIgYXBwbGllZDogXCIke2ZpbHRlclZhbHVlfVwiYCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFRyeSBwcmVzc2luZyBFbnRlciBhcyBhbHRlcm5hdGl2ZVxyXG4gICAgICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IFxyXG4gICAgICAgICAgICBrZXk6ICdFbnRlcicsIGtleUNvZGU6IDEzLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsgXHJcbiAgICAgICAgICAgIGtleTogJ0VudGVyJywga2V5Q29kZTogMTMsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBGaWx0ZXIgYXBwbGllZCB2aWEgRW50ZXI6IFwiJHtmaWx0ZXJWYWx1ZX1cImApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdFVudGlsQ29uZGl0aW9uKGNvbnRyb2xOYW1lLCBjb25kaXRpb24sIGV4cGVjdGVkVmFsdWUsIHRpbWVvdXQpIHtcclxuICAgIGNvbnNvbGUubG9nKGBXYWl0aW5nIGZvcjogJHtjb250cm9sTmFtZX0gdG8gYmUgJHtjb25kaXRpb259ICh0aW1lb3V0OiAke3RpbWVvdXR9bXMpYCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICBcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDwgdGltZW91dCkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBjb25kaXRpb25NZXQgPSBmYWxzZTtcclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKGNvbmRpdGlvbikge1xyXG4gICAgICAgICAgICBjYXNlICd2aXNpYmxlJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGFuZCBpcyB2aXNpYmxlIChoYXMgbGF5b3V0KVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCAmJiBlbGVtZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJiBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgIT09ICdub25lJztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2hpZGRlbic6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGRvZXNuJ3QgZXhpc3Qgb3IgaXMgbm90IHZpc2libGVcclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9ICFlbGVtZW50IHx8IGVsZW1lbnQub2Zmc2V0UGFyZW50ID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ID09PSAnbm9uZSc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdleGlzdHMnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBleGlzdHMgaW4gRE9NXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBlbGVtZW50ICE9PSBudWxsO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnbm90LWV4aXN0cyc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGRvZXMgbm90IGV4aXN0IGluIERPTVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCA9PT0gbnVsbDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2VuYWJsZWQnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBleGlzdHMgYW5kIGlzIG5vdCBkaXNhYmxlZFxyXG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIGJ1dHRvbiwgc2VsZWN0LCB0ZXh0YXJlYScpIHx8IGVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gIWlucHV0LmRpc2FibGVkICYmICFpbnB1dC5oYXNBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2hhcy12YWx1ZSc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGhhcyBhIHNwZWNpZmljIHZhbHVlXHJcbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCcpIHx8IGVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gaW5wdXQudmFsdWUgfHwgaW5wdXQudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gY3VycmVudFZhbHVlLnRyaW0oKSA9PT0gU3RyaW5nKGV4cGVjdGVkVmFsdWUpLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29uZGl0aW9uTWV0KSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBDb25kaXRpb24gbWV0OiAke2NvbnRyb2xOYW1lfSBpcyAke2NvbmRpdGlvbn1gKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTsgLy8gU21hbGwgc3RhYmlsaXR5IGRlbGF5XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBUaW1lb3V0IHdhaXRpbmcgZm9yIFwiJHtjb250cm9sTmFtZX1cIiB0byBiZSAke2NvbmRpdGlvbn0gKHdhaXRlZCAke3RpbWVvdXR9bXMpYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRJbnB1dFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSwgZmllbGRUeXBlKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIC8vIEZvciBTZWdtZW50ZWRFbnRyeSBmaWVsZHMgKEFjY291bnQsIGV0YyksIHVzZSBsb29rdXAgYnV0dG9uIGFwcHJvYWNoXHJcbiAgICBpZiAoZmllbGRUeXBlPy50eXBlID09PSAnc2VnbWVudGVkLWxvb2t1cCcgfHwgaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSkge1xyXG4gICAgICAgIGF3YWl0IHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgQ29tYm9Cb3gvZW51bSBmaWVsZHMsIG9wZW4gZHJvcGRvd24gYW5kIHNlbGVjdFxyXG4gICAgaWYgKGZpZWxkVHlwZT8uaW5wdXRUeXBlID09PSAnZW51bScgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0NvbWJvQm94Jykge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgUmFkaW9CdXR0b24vRnJhbWVPcHRpb25CdXR0b24gZ3JvdXBzLCBjbGljayB0aGUgY29ycmVjdCBvcHRpb25cclxuICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgaWYgKHJvbGUgPT09ICdSYWRpb0J1dHRvbicgfHwgcm9sZSA9PT0gJ0ZyYW1lT3B0aW9uQnV0dG9uJyB8fCBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwicmFkaW9cIl0sIGlucHV0W3R5cGU9XCJyYWRpb1wiXScpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0UmFkaW9CdXR0b25WYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKGBJbnB1dCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgLy8gRm9jdXMgdGhlIGlucHV0IGZpcnN0XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuXHJcbiAgICBpZiAoaW5wdXQudGFnTmFtZSAhPT0gJ1NFTEVDVCcpIHtcclxuICAgICAgICAvLyBVc2UgdGhlIHNlbGVjdGVkIGNvbWJvYm94IGlucHV0IG1ldGhvZFxyXG4gICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXNwYXRjaCBldmVudHNcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDQwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRHcmlkQ2VsbFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSwgZmllbGRUeXBlLCB3YWl0Rm9yVmFsaWRhdGlvbiA9IGZhbHNlKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgU2V0dGluZyBncmlkIGNlbGwgdmFsdWU6ICR7Y29udHJvbE5hbWV9ID0gXCIke3ZhbHVlfVwiICh3YWl0Rm9yVmFsaWRhdGlvbj0ke3dhaXRGb3JWYWxpZGF0aW9ufSlgKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgY2VsbCBlbGVtZW50IC0gcHJlZmVyIHRoZSBvbmUgaW4gYW4gYWN0aXZlL3NlbGVjdGVkIHJvd1xyXG4gICAgbGV0IGVsZW1lbnQgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgIFxyXG4gICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IGNsaWNraW5nIG9uIHRoZSBncmlkIHJvdyBmaXJzdCB0byBhY3RpdmF0ZSBpdFxyXG4gICAgICAgIGF3YWl0IGFjdGl2YXRlR3JpZFJvdyhjb250cm9sTmFtZSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghZWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgR3JpZCBjZWxsIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHMsIHdlIG5lZWQgdG8gY2xpY2sgb24gdGhlIGNlbGwgdG8gZW50ZXIgZWRpdCBtb2RlXHJcbiAgICAvLyBGaW5kIHRoZSBhY3R1YWwgY2VsbCBjb250YWluZXIgKGZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluKVxyXG4gICAgY29uc3QgcmVhY3RDZWxsID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKSB8fCBlbGVtZW50O1xyXG4gICAgY29uc3QgaXNSZWFjdEdyaWQgPSAhIWVsZW1lbnQuY2xvc2VzdCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgXHJcbiAgICAvLyBDbGljayBvbiB0aGUgY2VsbCB0byBhY3RpdmF0ZSBpdCBmb3IgZWRpdGluZ1xyXG4gICAgY29uc29sZS5sb2coYCAgQ2xpY2tpbmcgY2VsbCB0byBhY3RpdmF0ZTogaXNSZWFjdEdyaWQ9JHtpc1JlYWN0R3JpZH1gKTtcclxuICAgIHJlYWN0Q2VsbC5jbGljaygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gRm9yIFJlYWN0IGdyaWRzLCBEMzY1IHJlbmRlcnMgaW5wdXQgZmllbGRzIGR5bmFtaWNhbGx5IGFmdGVyIGNsaWNraW5nXHJcbiAgICAvLyBXZSBuZWVkIHRvIHJlLWZpbmQgdGhlIGVsZW1lbnQgYWZ0ZXIgY2xpY2tpbmcgYXMgRDM2NSBtYXkgaGF2ZSByZXBsYWNlZCB0aGUgRE9NXHJcbiAgICBpZiAoaXNSZWFjdEdyaWQpIHtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApOyAvLyBFeHRyYSB3YWl0IGZvciBSZWFjdCB0byByZW5kZXIgaW5wdXRcclxuICAgICAgICBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgR3JpZCBjZWxsIGVsZW1lbnQgbm90IGZvdW5kIGFmdGVyIGNsaWNrOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGhlIGNsaWNrIHNob3VsZCBhY3RpdmF0ZSB0aGUgY2VsbCAtIG5vdyBmaW5kIHRoZSBpbnB1dFxyXG4gICAgbGV0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGlucHV0IGZvdW5kIGRpcmVjdGx5LCBsb29rIGluIHRoZSBjZWxsIGNvbnRhaW5lclxyXG4gICAgaWYgKCFpbnB1dCAmJiBpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGNvbnN0IGNlbGxDb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpO1xyXG4gICAgICAgIGlmIChjZWxsQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGlucHV0ID0gY2VsbENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBJZiBubyBpbnB1dCBmb3VuZCBkaXJlY3RseSwgdHJ5IGdldHRpbmcgaXQgYWZ0ZXIgY2xpY2sgYWN0aXZhdGlvbiB3aXRoIHJldHJ5XHJcbiAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCA1OyBhdHRlbXB0KyspIHtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICAgICAgaWYgKGlucHV0ICYmIGlucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBBbHNvIGNoZWNrIGlmIGEgbmV3IGlucHV0IGFwcGVhcmVkIGluIHRoZSBjZWxsXHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxDb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpO1xyXG4gICAgICAgICAgICBpZiAoY2VsbENvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQgPSBjZWxsQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICAgICAgICAgIGlmIChpbnB1dCAmJiBpbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGlsbCBubyBpbnB1dD8gQ2hlY2sgaWYgdGhlIGVsZW1lbnQgaXRzZWxmIGlzIGFuIGlucHV0XHJcbiAgICBpZiAoIWlucHV0ICYmIChlbGVtZW50LnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgZWxlbWVudC50YWdOYW1lID09PSAnVEVYVEFSRUEnIHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gJ1NFTEVDVCcpKSB7XHJcbiAgICAgICAgaW5wdXQgPSBlbGVtZW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gZmluZCBpbnB1dCBpbiB0aGUgcGFyZW50IHJvd1xyXG4gICAgaWYgKCFpbnB1dCkge1xyXG4gICAgICAgIGNvbnN0IHJvdyA9IGVsZW1lbnQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4sIFtkYXRhLWR5bi1yb2xlPVwiUm93XCJdLCBbcm9sZT1cInJvd1wiXSwgdHInKTtcclxuICAgICAgICBpZiAocm93KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvc3NpYmxlSW5wdXRzID0gcm93LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdIGlucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdIHRleHRhcmVhYCk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgaW5wIG9mIHBvc3NpYmxlSW5wdXRzKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5wLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlucHV0ID0gaW5wO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBMYXN0IHJlc29ydDogZmluZCBhbnkgdmlzaWJsZSBpbnB1dCBpbiB0aGUgYWN0aXZlIGNlbGwgYXJlYVxyXG4gICAgaWYgKCFpbnB1dCAmJiBpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUNlbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuZHluLWFjdGl2ZVJvd0NlbGwsIC5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbjpmb2N1cy13aXRoaW4nKTtcclxuICAgICAgICBpZiAoYWN0aXZlQ2VsbCkge1xyXG4gICAgICAgICAgICBpbnB1dCA9IGFjdGl2ZUNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFpbnB1dCkge1xyXG4gICAgICAgIC8vIExvZyBhdmFpbGFibGUgZWxlbWVudHMgZm9yIGRlYnVnZ2luZ1xyXG4gICAgICAgIGNvbnN0IGdyaWRDb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5yZWFjdEdyaWQsIFtkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgICAgIGNvbnN0IGFsbElucHV0cyA9IGdyaWRDb250YWluZXI/LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQXZhaWxhYmxlIGlucHV0cyBpbiBncmlkOicsIEFycmF5LmZyb20oYWxsSW5wdXRzIHx8IFtdKS5tYXAoaSA9PiAoe1xyXG4gICAgICAgICAgICBuYW1lOiBpLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKT8uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpLFxyXG4gICAgICAgICAgICB2aXNpYmxlOiBpLm9mZnNldFBhcmVudCAhPT0gbnVsbFxyXG4gICAgICAgIH0pKSk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnB1dCBub3QgZm91bmQgaW4gZ3JpZCBjZWxsOiAke2NvbnRyb2xOYW1lfS4gVGhlIGNlbGwgbWF5IG5lZWQgdG8gYmUgY2xpY2tlZCB0byBiZWNvbWUgZWRpdGFibGUuYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIERldGVybWluZSBmaWVsZCB0eXBlIGFuZCB1c2UgYXBwcm9wcmlhdGUgc2V0dGVyXHJcbiAgICBjb25zdCByb2xlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgIFxyXG4gICAgaWYgKGZpZWxkVHlwZT8udHlwZSA9PT0gJ3NlZ21lbnRlZC1sb29rdXAnIHx8IHJvbGUgPT09ICdTZWdtZW50ZWRFbnRyeScgfHwgaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSkge1xyXG4gICAgICAgIGF3YWl0IHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGZpZWxkVHlwZT8uaW5wdXRUeXBlID09PSAnZW51bScgfHwgcm9sZSA9PT0gJ0NvbWJvQm94Jykge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgZm9yIGxvb2t1cCBmaWVsZHNcclxuICAgIGlmIChyb2xlID09PSAnTG9va3VwJyB8fCByb2xlID09PSAnUmVmZXJlbmNlR3JvdXAnIHx8IGhhc0xvb2t1cEJ1dHRvbihlbGVtZW50KSkge1xyXG4gICAgICAgIGF3YWl0IHNldExvb2t1cFNlbGVjdFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGFuZGFyZCBpbnB1dCAtIGZvY3VzIGFuZCBzZXQgdmFsdWVcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgXHJcbiAgICAvLyBDbGVhciBleGlzdGluZyB2YWx1ZVxyXG4gICAgaW5wdXQuc2VsZWN0Py4oKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIFxyXG4gICAgLy8gVXNlIHRoZSBzdGFuZGFyZCBpbnB1dCBtZXRob2RcclxuICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlKTtcclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZXZlbnRzXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgXHJcbiAgICAvLyBGb3IgZ3JpZCBjZWxscywgd2UgbmVlZCB0byBwcm9wZXJseSBjb21taXQgdGhlIHZhbHVlXHJcbiAgICAvLyBEMzY1IFJlYWN0IGdyaWRzIHJlcXVpcmUgdGhlIGNlbGwgdG8gbG9zZSBmb2N1cyBmb3IgdmFsaWRhdGlvbiB0byBvY2N1clxyXG4gICAgXHJcbiAgICAvLyBNZXRob2QgMTogUHJlc3MgRW50ZXIgdG8gY29uZmlybSB0aGUgdmFsdWUgKGltcG9ydGFudCBmb3IgbG9va3VwIGZpZWxkcyBsaWtlIEl0ZW1JZClcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywga2V5Q29kZTogMTMsIHdoaWNoOiAxMywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBrZXlDb2RlOiAxMywgd2hpY2g6IDEzLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAyOiBUYWIgb3V0IHRvIG1vdmUgdG8gbmV4dCBjZWxsICh0cmlnZ2VycyBibHVyIGFuZCB2YWxpZGF0aW9uKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGtleUNvZGU6IDksIHdoaWNoOiA5LCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywga2V5Q29kZTogOSwgd2hpY2g6IDksIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIFxyXG4gICAgLy8gTWV0aG9kIDM6IERpc3BhdGNoIGJsdXIgZXZlbnQgZXhwbGljaXRseVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRm9jdXNFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSwgcmVsYXRlZFRhcmdldDogbnVsbCB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgXHJcbiAgICAvLyBNZXRob2QgNDogQ2xpY2sgb3V0c2lkZSB0aGUgY2VsbCB0byBlbnN1cmUgZm9jdXMgaXMgbG9zdFxyXG4gICAgLy8gRmluZCBhbm90aGVyIGNlbGwgb3IgdGhlIHJvdyBjb250YWluZXIgdG8gY2xpY2tcclxuICAgIGNvbnN0IHJvdyA9IGlucHV0LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluLCBbZGF0YS1keW4tcm9sZT1cIlJvd1wiXScpO1xyXG4gICAgaWYgKHJvdykge1xyXG4gICAgICAgIGNvbnN0IG90aGVyQ2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW46bm90KDpmb2N1cy13aXRoaW4pJyk7XHJcbiAgICAgICAgaWYgKG90aGVyQ2VsbCAmJiBvdGhlckNlbGwgIT09IGlucHV0LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpKSB7XHJcbiAgICAgICAgICAgIG90aGVyQ2VsbC5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gV2FpdCBmb3IgRDM2NSB0byBwcm9jZXNzL3ZhbGlkYXRlIHRoZSB2YWx1ZSAoc2VydmVyLXNpZGUgbG9va3VwIGZvciBJdGVtSWQsIGV0Yy4pXHJcbiAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgXHJcbiAgICAvLyBJZiB3YWl0Rm9yVmFsaWRhdGlvbiBpcyBlbmFibGVkLCB3YWl0IGZvciBEMzY1IHRvIGNvbXBsZXRlIHRoZSBsb29rdXAgdmFsaWRhdGlvblxyXG4gICAgLy8gVGhpcyBpcyBpbXBvcnRhbnQgZm9yIGZpZWxkcyBsaWtlIEl0ZW1JZCB0aGF0IHRyaWdnZXIgc2VydmVyLXNpZGUgdmFsaWRhdGlvblxyXG4gICAgaWYgKHdhaXRGb3JWYWxpZGF0aW9uKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgV2FpdGluZyBmb3IgRDM2NSB2YWxpZGF0aW9uIG9mICR7Y29udHJvbE5hbWV9Li4uYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gV2FpdCBmb3IgYW55IGxvYWRpbmcgaW5kaWNhdG9ycyB0byBhcHBlYXIgYW5kIGRpc2FwcGVhclxyXG4gICAgICAgIC8vIEQzNjUgc2hvd3MgYSBsb2FkaW5nIHNwaW5uZXIgZHVyaW5nIHNlcnZlci1zaWRlIGxvb2t1cHNcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yRDM2NVZhbGlkYXRpb24oY29udHJvbE5hbWUsIDUwMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgICBHcmlkIGNlbGwgdmFsdWUgc2V0OiAke2NvbnRyb2xOYW1lfSA9IFwiJHt2YWx1ZX1cImApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckQzNjVWYWxpZGF0aW9uKGNvbnRyb2xOYW1lLCB0aW1lb3V0ID0gNTAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgIGxldCBsYXN0TG9hZGluZ1N0YXRlID0gZmFsc2U7XHJcbiAgICBsZXQgc2VlbkxvYWRpbmcgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydFRpbWUgPCB0aW1lb3V0KSB7XHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIEQzNjUgbG9hZGluZyBpbmRpY2F0b3JzXHJcbiAgICAgICAgY29uc3QgaXNMb2FkaW5nID0gaXNEMzY1TG9hZGluZygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpc0xvYWRpbmcgJiYgIWxhc3RMb2FkaW5nU3RhdGUpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJyAgICBEMzY1IHZhbGlkYXRpb24gc3RhcnRlZCAobG9hZGluZyBpbmRpY2F0b3IgYXBwZWFyZWQpJyk7XHJcbiAgICAgICAgICAgIHNlZW5Mb2FkaW5nID0gdHJ1ZTtcclxuICAgICAgICB9IGVsc2UgaWYgKCFpc0xvYWRpbmcgJiYgbGFzdExvYWRpbmdTdGF0ZSAmJiBzZWVuTG9hZGluZykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnICAgIEQzNjUgdmFsaWRhdGlvbiBjb21wbGV0ZWQgKGxvYWRpbmcgaW5kaWNhdG9yIGdvbmUpJyk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7IC8vIEV4dHJhIGJ1ZmZlciBhZnRlciBsb2FkaW5nIGNvbXBsZXRlc1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGFzdExvYWRpbmdTdGF0ZSA9IGlzTG9hZGluZztcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIGNoZWNrIGlmIHRoZSBjZWxsIG5vdyBzaG93cyB2YWxpZGF0ZWQgY29udGVudCAoZS5nLiwgcHJvZHVjdCBuYW1lIGFwcGVhcmVkKVxyXG4gICAgICAgIC8vIEZvciBJdGVtSWQsIEQzNjUgc2hvd3MgdGhlIGl0ZW0gbnVtYmVyIGFuZCBuYW1lIGFmdGVyIHZhbGlkYXRpb25cclxuICAgICAgICBjb25zdCBjZWxsID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgaWYgKGNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbFRleHQgPSBjZWxsLnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgICAgICBjb25zdCBoYXNNdWx0aXBsZVZhbHVlcyA9IGNlbGxUZXh0LnNwbGl0KC9cXHN7Mix9fFxcbi8pLmZpbHRlcih0ID0+IHQudHJpbSgpKS5sZW5ndGggPiAxO1xyXG4gICAgICAgICAgICBpZiAoaGFzTXVsdGlwbGVWYWx1ZXMpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCcgICAgRDM2NSB2YWxpZGF0aW9uIGNvbXBsZXRlZCAoY2VsbCBjb250ZW50IHVwZGF0ZWQpJyk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSWYgd2Ugc2F3IGxvYWRpbmcgYXQgc29tZSBwb2ludCwgd2FpdCBhIGJpdCBtb3JlIGFmdGVyIHRpbWVvdXRcclxuICAgIGlmIChzZWVuTG9hZGluZykge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCcgICAgVmFsaWRhdGlvbiB0aW1lb3V0IHJlYWNoZWQsIGJ1dCBzYXcgbG9hZGluZyAtIHdhaXRpbmcgZXh0cmEgdGltZScpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKCcgICAgVmFsaWRhdGlvbiB3YWl0IGNvbXBsZXRlZCAodGltZW91dCBvciBubyBsb2FkaW5nIGRldGVjdGVkKScpO1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWN0aXZhdGVHcmlkUm93KGNvbnRyb2xOYW1lKSB7XHJcbiAgICAvLyBUcnkgUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHMgZmlyc3RcclxuICAgIGNvbnN0IHJlYWN0R3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmVhY3RHcmlkJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgcmVhY3RHcmlkcykge1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgICAgIGlmIChjZWxsKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBGaW5kIHRoZSByb3cgY29udGFpbmluZyB0aGlzIGNlbGxcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IGNlbGwuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4nKTtcclxuICAgICAgICAgICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDbGljayBvbiB0aGUgcm93IHRvIHNlbGVjdCBpdFxyXG4gICAgICAgICAgICAgICAgICAgIHJvdy5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSB0cmFkaXRpb25hbCBEMzY1IGdyaWRzXHJcbiAgICBjb25zdCBncmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIGdyaWRzKSB7XHJcbiAgICAgICAgLy8gRmluZCB0aGUgY2VsbFxyXG4gICAgICAgIGNvbnN0IGNlbGwgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGNlbGwpIHtcclxuICAgICAgICAgICAgLy8gRmluZCB0aGUgcm93IGNvbnRhaW5pbmcgdGhpcyBjZWxsXHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IGNlbGwuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJSb3dcIl0sIFtyb2xlPVwicm93XCJdLCB0cicpO1xyXG4gICAgICAgICAgICBpZiAocm93KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDbGljayBvbiB0aGUgcm93IHRvIHNlbGVjdCBpdFxyXG4gICAgICAgICAgICAgICAgcm93LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRMb29rdXBTZWxlY3RWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmICghaW5wdXQpIHRocm93IG5ldyBFcnJvcignSW5wdXQgbm90IGZvdW5kIGluIGxvb2t1cCBmaWVsZCcpO1xyXG5cclxuICAgIGNvbnN0IGxvb2t1cEJ1dHRvbiA9IGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCk7XHJcbiAgICBpZiAobG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgbG9va3VwQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIG9wZW4gYnkgZm9jdXNpbmcgYW5kIGtleWJvYXJkXHJcbiAgICAgICAgaW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IG9wZW5Mb29rdXBCeUtleWJvYXJkKGlucHV0KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBsb29rdXBEb2NrID0gYXdhaXQgd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsb29rdXBEb2NrKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29rdXAgZmx5b3V0IG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyeSB0eXBpbmcgaW50byBhIGxvb2t1cCBmbHlvdXQgaW5wdXQgaWYgcHJlc2VudCAoZS5nLiwgTWFpbkFjY291bnQpXHJcbiAgICBjb25zdCBkb2NrSW5wdXQgPSBmaW5kTG9va3VwRmlsdGVySW5wdXQobG9va3VwRG9jayk7XHJcbiAgICBpZiAoZG9ja0lucHV0KSB7XHJcbiAgICAgICAgZG9ja0lucHV0LmNsaWNrKCk7XHJcbiAgICAgICAgZG9ja0lucHV0LmZvY3VzKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoZG9ja0lucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDYwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cERvY2ssIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9va3VwIGxpc3QgaXMgZW1wdHknKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZWFyY2hWYWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgIGxldCBtYXRjaGVkID0gZmFsc2U7XHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IHJvdy50ZXh0Q29udGVudC50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RDZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiZ3JpZGNlbGxcIl0sIHRkJyk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RUZXh0ID0gZmlyc3RDZWxsID8gZmlyc3RDZWxsLnRleHRDb250ZW50LnRyaW0oKS50b0xvd2VyQ2FzZSgpIDogJyc7XHJcbiAgICAgICAgaWYgKGZpcnN0VGV4dCA9PT0gc2VhcmNoVmFsdWUgfHwgdGV4dC5pbmNsdWRlcyhzZWFyY2hWYWx1ZSkpIHtcclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZmlyc3RDZWxsIHx8IHJvdztcclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgdGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIG1hdGNoZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICAvLyBTb21lIEQzNjUgbG9va3VwcyByZXF1aXJlIEVudGVyIG9yIGRvdWJsZS1jbGljayB0byBjb21taXQgc2VsZWN0aW9uXHJcbiAgICAgICAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdkYmxjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFwcGxpZWQgPSBhd2FpdCB3YWl0Rm9ySW5wdXRWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgICAgICBpZiAoIWFwcGxpZWQpIHtcclxuICAgICAgICAgICAgICAgIC8vIFRyeSBhIHNlY29uZCBjb21taXQgcGFzcyBpZiB0aGUgdmFsdWUgZGlkIG5vdCBzdGlja1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExvb2t1cCB2YWx1ZSBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBEMzY1IGNoZWNrYm94ZXMgY2FuIGJlOlxyXG4gICAgLy8gMS4gU3RhbmRhcmQgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdXHJcbiAgICAvLyAyLiBDdXN0b20gdG9nZ2xlIHdpdGggcm9sZT1cImNoZWNrYm94XCIgb3Igcm9sZT1cInN3aXRjaFwiXHJcbiAgICAvLyAzLiBFbGVtZW50IHdpdGggYXJpYS1jaGVja2VkIGF0dHJpYnV0ZSAodGhlIGNvbnRhaW5lciBpdHNlbGYpXHJcbiAgICAvLyA0LiBFbGVtZW50IHdpdGggZGF0YS1keW4tcm9sZT1cIkNoZWNrQm94XCJcclxuICAgIFxyXG4gICAgbGV0IGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKTtcclxuICAgIGxldCBpc0N1c3RvbVRvZ2dsZSA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgY3VzdG9tIHRvZ2dsZSBlbGVtZW50XHJcbiAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiY2hlY2tib3hcIl0sIFtyb2xlPVwic3dpdGNoXCJdJyk7XHJcbiAgICAgICAgaWYgKGNoZWNrYm94KSB7XHJcbiAgICAgICAgICAgIGlzQ3VzdG9tVG9nZ2xlID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHtcclxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZWxlbWVudCBpdHNlbGYgaXMgdGhlIHRvZ2dsZSAoRDM2NSBvZnRlbiBkb2VzIHRoaXMpXHJcbiAgICAgICAgaWYgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSA9PT0gJ2NoZWNrYm94JyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnc3dpdGNoJyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnQ2hlY2tCb3gnKSB7XHJcbiAgICAgICAgICAgIGNoZWNrYm94ID0gZWxlbWVudDtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkge1xyXG4gICAgICAgIC8vIExhc3QgcmVzb3J0OiBmaW5kIGFueSBjbGlja2FibGUgdG9nZ2xlLWxpa2UgZWxlbWVudFxyXG4gICAgICAgIGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b24sIFt0YWJpbmRleD1cIjBcIl0nKTtcclxuICAgICAgICBpZiAoY2hlY2tib3gpIHtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkgdGhyb3cgbmV3IEVycm9yKGBDaGVja2JveCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9LiBFbGVtZW50IEhUTUw6ICR7ZWxlbWVudC5vdXRlckhUTUwuc3Vic3RyaW5nKDAsIDIwMCl9YCk7XHJcblxyXG4gICAgY29uc3Qgc2hvdWxkQ2hlY2sgPSBjb2VyY2VCb29sZWFuKHZhbHVlKTtcclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgc3RhdGVcclxuICAgIGxldCBpc0N1cnJlbnRseUNoZWNrZWQ7XHJcbiAgICBpZiAoaXNDdXN0b21Ub2dnbGUpIHtcclxuICAgICAgICBpc0N1cnJlbnRseUNoZWNrZWQgPSBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZScgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoZWNrZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3guY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2RhdGEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlzQ3VycmVudGx5Q2hlY2tlZCA9IGNoZWNrYm94LmNoZWNrZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT25seSBjbGljayBpZiBzdGF0ZSBuZWVkcyB0byBjaGFuZ2VcclxuICAgIGlmIChzaG91bGRDaGVjayAhPT0gaXNDdXJyZW50bHlDaGVja2VkKSB7XHJcbiAgICAgICAgY2hlY2tib3guY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZvciBjdXN0b20gdG9nZ2xlcywgYWxzbyB0cnkgZGlzcGF0Y2hpbmcgZXZlbnRzIGlmIGNsaWNrIGRpZG4ndCB3b3JrXHJcbiAgICAgICAgaWYgKGlzQ3VzdG9tVG9nZ2xlKSB7XHJcbiAgICAgICAgICAgIGNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5Mb29rdXBCeUtleWJvYXJkKGlucHV0KSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgLy8gVHJ5IEFsdCtEb3duIHRoZW4gRjQgKGNvbW1vbiBEMzY1L1dpbiBjb250cm9scylcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBhbHRLZXk6IHRydWUsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBhbHRLZXk6IHRydWUsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Y0JywgY29kZTogJ0Y0JywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRjQnLCBjb2RlOiAnRjQnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21taXRMb29rdXBWYWx1ZShpbnB1dCkge1xyXG4gICAgLy8gRDM2NSBzZWdtZW50ZWQgbG9va3VwcyBvZnRlbiB2YWxpZGF0ZSBvbiBUYWIvRW50ZXIgYW5kIGJsdXJcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbG9zZURpYWxvZyhmb3JtTmFtZSwgYWN0aW9uID0gJ29rJykge1xuICAgIGNvbnN0IGZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tZm9ybS1uYW1lPVwiJHtmb3JtTmFtZX1cIl1gKTtcclxuICAgIGlmICghZm9ybSkge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6IEZvcm0gJHtmb3JtTmFtZX0gbm90IGZvdW5kIHRvIGNsb3NlYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsZXQgYnV0dG9uTmFtZTtcclxuICAgIGlmIChmb3JtTmFtZSA9PT0gJ1N5c1JlY3VycmVuY2UnKSB7XHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdDb21tYW5kQnV0dG9uT2snIDogJ0NvbW1hbmRCdXR0b25DYW5jZWwnO1xyXG4gICAgfSBlbHNlIGlmIChmb3JtTmFtZSA9PT0gJ1N5c1F1ZXJ5Rm9ybScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ09rQnV0dG9uJyA6ICdDYW5jZWxCdXR0b24nO1xyXG4gICAgfSBlbHNlIGlmIChmb3JtTmFtZSA9PT0gJ1N5c09wZXJhdGlvblRlbXBsYXRlRm9ybScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ0NvbW1hbmRCdXR0b24nIDogJ0NvbW1hbmRCdXR0b25DYW5jZWwnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBUcnkgZ2VuZXJpYyBuYW1lc1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnQ29tbWFuZEJ1dHRvbicgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IGJ1dHRvbiA9IGZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtidXR0b25OYW1lfVwiXWApO1xyXG4gICAgaWYgKGJ1dHRvbikge1xyXG4gICAgICAgIGJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgbG9nU3RlcChgRGlhbG9nICR7Zm9ybU5hbWV9IGNsb3NlZCB3aXRoICR7YWN0aW9uLnRvVXBwZXJDYXNlKCl9YCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6ICR7YWN0aW9uLnRvVXBwZXJDYXNlKCl9IGJ1dHRvbiBub3QgZm91bmQgaW4gJHtmb3JtTmFtZX1gKTtcclxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0Q3VycmVudFJvd1ZhbHVlKGZpZWxkTWFwcGluZykge1xuICAgIGlmICghZmllbGRNYXBwaW5nKSByZXR1cm4gJyc7XG4gICAgY29uc3Qgcm93ID0gd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50RGF0YVJvdyB8fCB7fTtcbiAgICBjb25zdCBkaXJlY3QgPSByb3dbZmllbGRNYXBwaW5nXTtcbiAgICBpZiAoZGlyZWN0ICE9PSB1bmRlZmluZWQgJiYgZGlyZWN0ICE9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBTdHJpbmcoZGlyZWN0KTtcbiAgICB9XG4gICAgY29uc3QgZmllbGROYW1lID0gZmllbGRNYXBwaW5nLmluY2x1ZGVzKCc6JykgPyBmaWVsZE1hcHBpbmcuc3BsaXQoJzonKS5wb3AoKSA6IGZpZWxkTWFwcGluZztcbiAgICBjb25zdCB2YWx1ZSA9IHJvd1tmaWVsZE5hbWVdO1xuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlRHluYW1pY1RleHQodGV4dCkge1xuICAgIGlmICh0eXBlb2YgdGV4dCAhPT0gJ3N0cmluZycgfHwgIXRleHQpIHJldHVybiB0ZXh0IHx8ICcnO1xuXG4gICAgbGV0IHJlc29sdmVkID0gdGV4dDtcbiAgICBpZiAoL19fRDM2NV9QQVJBTV9DTElQQk9BUkRfW2EtejAtOV9dK19fL2kudGVzdChyZXNvbHZlZCkpIHtcbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuY2xpcGJvYXJkPy5yZWFkVGV4dCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDbGlwYm9hcmQgQVBJIG5vdCBhdmFpbGFibGUnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjbGlwYm9hcmRUZXh0ID0gYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC5yZWFkVGV4dCgpO1xuICAgICAgICByZXNvbHZlZCA9IHJlc29sdmVkLnJlcGxhY2UoL19fRDM2NV9QQVJBTV9DTElQQk9BUkRfW2EtejAtOV9dK19fL2dpLCBjbGlwYm9hcmRUZXh0ID8/ICcnKTtcbiAgICB9XG5cbiAgICByZXNvbHZlZCA9IHJlc29sdmVkLnJlcGxhY2UoL19fRDM2NV9QQVJBTV9EQVRBXyhbQS1aYS16MC05JS5ffi1dKilfXy9nLCAoXywgZW5jb2RlZEZpZWxkKSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gZGVjb2RlVVJJQ29tcG9uZW50KGVuY29kZWRGaWVsZCB8fCAnJyk7XG4gICAgICAgIHJldHVybiBnZXRDdXJyZW50Um93VmFsdWUoZmllbGQpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc29sdmVkO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbmF2aWdhdGVUb0Zvcm0oc3RlcCkge1xuICAgIGNvbnN0IHsgbmF2aWdhdGVNZXRob2QsIG1lbnVJdGVtTmFtZSwgbWVudUl0ZW1UeXBlLCBuYXZpZ2F0ZVVybCwgaG9zdFJlbGF0aXZlUGF0aCwgd2FpdEZvckxvYWQsIG9wZW5Jbk5ld1RhYiB9ID0gc3RlcDtcblxuICAgIGNvbnN0IHJlc29sdmVkTWVudUl0ZW1OYW1lID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KG1lbnVJdGVtTmFtZSB8fCAnJyk7XG4gICAgY29uc3QgcmVzb2x2ZWROYXZpZ2F0ZVVybCA9IGF3YWl0IHJlc29sdmVEeW5hbWljVGV4dChuYXZpZ2F0ZVVybCB8fCAnJyk7XG4gICAgY29uc3QgcmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KGhvc3RSZWxhdGl2ZVBhdGggfHwgJycpO1xuXG4gICAgbG9nU3RlcChgTmF2aWdhdGluZyB0byBmb3JtOiAke3Jlc29sdmVkTWVudUl0ZW1OYW1lIHx8IHJlc29sdmVkTmF2aWdhdGVVcmx9YCk7XG4gICAgXG4gICAgbGV0IHRhcmdldFVybDtcbiAgICBjb25zdCBiYXNlVXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZTtcbiAgICBcbiAgICBpZiAobmF2aWdhdGVNZXRob2QgPT09ICd1cmwnICYmIHJlc29sdmVkTmF2aWdhdGVVcmwpIHtcbiAgICAgICAgLy8gVXNlIGZ1bGwgVVJMIHBhdGggcHJvdmlkZWRcbiAgICAgICAgdGFyZ2V0VXJsID0gcmVzb2x2ZWROYXZpZ2F0ZVVybC5zdGFydHNXaXRoKCdodHRwJykgPyByZXNvbHZlZE5hdmlnYXRlVXJsIDogYmFzZVVybCArIHJlc29sdmVkTmF2aWdhdGVVcmw7XG4gICAgfSBlbHNlIGlmIChuYXZpZ2F0ZU1ldGhvZCA9PT0gJ2hvc3RSZWxhdGl2ZScgJiYgcmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoKSB7XG4gICAgICAgIC8vIFJldXNlIGN1cnJlbnQgaG9zdCBkeW5hbWljYWxseSwgYXBwZW5kIHByb3ZpZGVkIHBhdGgvcXVlcnkuXG4gICAgICAgIGNvbnN0IHJlbGF0aXZlUGFydCA9IFN0cmluZyhyZXNvbHZlZEhvc3RSZWxhdGl2ZVBhdGgpLnRyaW0oKTtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHJlbGF0aXZlUGFydC5zdGFydHNXaXRoKCcvJykgfHwgcmVsYXRpdmVQYXJ0LnN0YXJ0c1dpdGgoJz8nKVxuICAgICAgICAgICAgPyByZWxhdGl2ZVBhcnRcbiAgICAgICAgICAgIDogYC8ke3JlbGF0aXZlUGFydH1gO1xuICAgICAgICB0YXJnZXRVcmwgPSBgJHt3aW5kb3cubG9jYXRpb24ucHJvdG9jb2x9Ly8ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fSR7bm9ybWFsaXplZH1gO1xuICAgIH0gZWxzZSBpZiAocmVzb2x2ZWRNZW51SXRlbU5hbWUpIHtcbiAgICAgICAgLy8gQnVpbGQgVVJMIGZyb20gbWVudSBpdGVtIG5hbWVcbiAgICAgICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbiAgICAgICAgcGFyYW1zLmRlbGV0ZSgncScpO1xuICAgICAgICBjb25zdCB0eXBlUHJlZml4ID0gKG1lbnVJdGVtVHlwZSAmJiBtZW51SXRlbVR5cGUgIT09ICdEaXNwbGF5JykgPyBgJHttZW51SXRlbVR5cGV9OmAgOiAnJztcbiAgICAgICAgY29uc3QgcmF3TWVudUl0ZW0gPSBTdHJpbmcocmVzb2x2ZWRNZW51SXRlbU5hbWUpLnRyaW0oKTtcblxuICAgICAgICAvLyBTdXBwb3J0IGV4dGVuZGVkIGlucHV0IGxpa2U6XG4gICAgICAgIC8vIFwiU3lzVGFibGVCcm93c2VyJnRhYmxlTmFtZT1JbnZlbnRUYWJsZVwiXG4gICAgICAgIC8vIHNvIGV4dHJhIHF1ZXJ5IHBhcmFtcyBhcmUgYXBwZW5kZWQgYXMgcmVhbCBVUkwgcGFyYW1zLCBub3QgZW5jb2RlZCBpbnRvIG1pLlxuICAgICAgICBjb25zdCBzZXBhcmF0b3JJbmRleCA9IE1hdGgubWluKFxuICAgICAgICAgICAgLi4uWyc/JywgJyYnXVxuICAgICAgICAgICAgICAgIC5tYXAoY2ggPT4gcmF3TWVudUl0ZW0uaW5kZXhPZihjaCkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihpZHggPT4gaWR4ID49IDApXG4gICAgICAgICk7XG5cbiAgICAgICAgbGV0IG1lbnVJdGVtQmFzZSA9IHJhd01lbnVJdGVtO1xuICAgICAgICBsZXQgZXh0cmFRdWVyeSA9ICcnO1xuXG4gICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoc2VwYXJhdG9ySW5kZXgpKSB7XG4gICAgICAgICAgICBtZW51SXRlbUJhc2UgPSByYXdNZW51SXRlbS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpO1xuICAgICAgICAgICAgZXh0cmFRdWVyeSA9IHJhd01lbnVJdGVtLnNsaWNlKHNlcGFyYXRvckluZGV4ICsgMSkudHJpbSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgcGFyYW1zLnNldCgnbWknLCBgJHt0eXBlUHJlZml4fSR7bWVudUl0ZW1CYXNlfWApO1xuXG4gICAgICAgIGlmIChleHRyYVF1ZXJ5KSB7XG4gICAgICAgICAgICBjb25zdCBleHRyYXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGV4dHJhUXVlcnkpO1xuICAgICAgICAgICAgZXh0cmFzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5ICYmIGtleSAhPT0gJ21pJykge1xuICAgICAgICAgICAgICAgICAgICBwYXJhbXMuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGFyZ2V0VXJsID0gYmFzZVVybCArICc/JyArIHBhcmFtcy50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTmF2aWdhdGUgc3RlcCByZXF1aXJlcyBlaXRoZXIgbWVudUl0ZW1OYW1lIG9yIG5hdmlnYXRlVXJsJyk7XG4gICAgfVxuICAgIFxyXG4gICAgbG9nU3RlcChgTmF2aWdhdGluZyB0bzogJHt0YXJnZXRVcmx9YCk7XG5cbiAgICBpZiAob3BlbkluTmV3VGFiKSB7XG4gICAgICAgIHdpbmRvdy5vcGVuKHRhcmdldFVybCwgJ19ibGFuaycsICdub29wZW5lcicpO1xuICAgICAgICBsb2dTdGVwKCdPcGVuZWQgbmF2aWdhdGlvbiB0YXJnZXQgaW4gYSBuZXcgdGFiJyk7XG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTYXZlIHBlbmRpbmcgd29ya2Zsb3cgc3RhdGUgZGlyZWN0bHkgaW4gc2Vzc2lvblN0b3JhZ2UgYmVmb3JlIG5hdmlnYXRpb25cbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodGFyZ2V0VXJsKTtcclxuICAgICAgICBjb25zdCB0YXJnZXRNZW51SXRlbU5hbWUgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbWknKSB8fCAnJztcclxuICAgICAgICBcclxuICAgICAgICAvLyBJTVBPUlRBTlQ6IFBlcnNpc3QgcGVuZGluZyBuYXZpZ2F0aW9uIHN0YXRlIGZyb20gdGhlIGN1cnJlbnRseSBleGVjdXRpbmcgd29ya2Zsb3cuXG4gICAgICAgIC8vIFByZWZlciBjdXJyZW50IHdvcmtmbG93IGNvbnRleHQgZmlyc3QsIHRoZW4gaXRzIG9yaWdpbmFsL2Z1bGwgd29ya2Zsb3cgd2hlbiBwcmVzZW50LlxuICAgICAgICBjb25zdCBjdXJyZW50V29ya2Zsb3cgPSB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyB8fCBudWxsO1xuICAgICAgICBjb25zdCBvcmlnaW5hbFdvcmtmbG93ID0gY3VycmVudFdvcmtmbG93Py5fb3JpZ2luYWxXb3JrZmxvdyB8fCBjdXJyZW50V29ya2Zsb3cgfHwgd2luZG93LmQzNjVPcmlnaW5hbFdvcmtmbG93IHx8IG51bGw7XG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHBlbmRpbmdTdGF0ZSA9IHtcclxuICAgICAgICAgICAgd29ya2Zsb3c6IG9yaWdpbmFsV29ya2Zsb3csXHJcbiAgICAgICAgICAgIHdvcmtmbG93SWQ6IG9yaWdpbmFsV29ya2Zsb3c/LmlkIHx8ICcnLFxyXG4gICAgICAgICAgICBuZXh0U3RlcEluZGV4OiAod2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50U3RlcEluZGV4ID8/IDApICsgMSxcclxuICAgICAgICAgICAgY3VycmVudFJvd0luZGV4OiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnRSb3dJbmRleCB8fCAwLFxyXG4gICAgICAgICAgICB0b3RhbFJvd3M6IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8udG90YWxSb3dzIHx8IDAsXHJcbiAgICAgICAgICAgIGRhdGE6IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwgbnVsbCxcclxuICAgICAgICAgICAgdGFyZ2V0TWVudUl0ZW1OYW1lOiB0YXJnZXRNZW51SXRlbU5hbWUsXHJcbiAgICAgICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwLFxyXG4gICAgICAgICAgICBzYXZlZEF0OiBEYXRlLm5vdygpXHJcbiAgICAgICAgfTtcclxuICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdkMzY1X3BlbmRpbmdfd29ya2Zsb3cnLCBKU09OLnN0cmluZ2lmeShwZW5kaW5nU3RhdGUpKTtcclxuICAgICAgICBsb2dTdGVwKGBTYXZlZCB3b3JrZmxvdyBzdGF0ZSBmb3IgbmF2aWdhdGlvbiAobmV4dFN0ZXBJbmRleDogJHtwZW5kaW5nU3RhdGUubmV4dFN0ZXBJbmRleH0pYCk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCdbRDM2NV0gRmFpbGVkIHRvIHNhdmUgd29ya2Zsb3cgc3RhdGUgaW4gc2Vzc2lvblN0b3JhZ2U6JywgZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNpZ25hbCBuYXZpZ2F0aW9uIGlzIGFib3V0IHRvIGhhcHBlbiAtIHdvcmtmbG93IHN0YXRlIHdpbGwgYmUgc2F2ZWQgYnkgdGhlIGV4dGVuc2lvblxyXG4gICAgLy8gV2UgbmVlZCB0byB3YWl0IGZvciB0aGUgc3RhdGUgdG8gYmUgc2F2ZWQgYmVmb3JlIG5hdmlnYXRpbmdcclxuICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfTkFWSUdBVElORycsXHJcbiAgICAgICAgdGFyZ2V0VXJsOiB0YXJnZXRVcmwsXHJcbiAgICAgICAgd2FpdEZvckxvYWQ6IHdhaXRGb3JMb2FkIHx8IDMwMDBcclxuICAgIH0sICcqJyk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgbG9uZ2VyIHRvIGVuc3VyZSB0aGUgZnVsbCBjaGFpbiBjb21wbGV0ZXM6XHJcbiAgICAvLyBwb3N0TWVzc2FnZSAtPiBjb250ZW50LmpzIC0+IGJhY2tncm91bmQuanMgLT4gcG9wdXAgLT4gY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0XHJcbiAgICAvLyBUaGlzIGNoYWluIGludm9sdmVzIG11bHRpcGxlIGFzeW5jIGhvcHMsIHNvIHdlIG5lZWQgc3VmZmljaWVudCB0aW1lXHJcbiAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgXHJcbiAgICAvLyBOYXZpZ2F0ZSAtIHRoaXMgd2lsbCBjYXVzZSBwYWdlIHJlbG9hZCwgc2NyaXB0IGNvbnRleHQgd2lsbCBiZSBsb3N0XHJcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRhcmdldFVybDtcclxuICAgIFxyXG4gICAgLy8gVGhpcyBjb2RlIHdvbid0IGV4ZWN1dGUgZHVlIHRvIHBhZ2UgbmF2aWdhdGlvbiwgYnV0IGtlZXAgaXQgZm9yIHJlZmVyZW5jZVxyXG4gICAgLy8gVGhlIHdvcmtmbG93IHdpbGwgYmUgcmVzdW1lZCBieSB0aGUgY29udGVudCBzY3JpcHQgYWZ0ZXIgcGFnZSBsb2FkXHJcbiAgICBhd2FpdCBzbGVlcCh3YWl0Rm9yTG9hZCB8fCAzMDAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlVGFiKGNvbnRyb2xOYW1lKSB7XG4gICAgbG9nU3RlcChgQWN0aXZhdGluZyB0YWI6ICR7Y29udHJvbE5hbWV9YCk7XG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSB0YWIgZWxlbWVudCAtIGNvdWxkIGJlIHRoZSB0YWIgY29udGVudCBvciB0aGUgdGFiIGJ1dHRvbiBpdHNlbGZcclxuICAgIGxldCB0YWJFbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBub3QgZm91bmQgZGlyZWN0bHksIHRyeSBmaW5kaW5nIGJ5IGxvb2tpbmcgZm9yIHRhYiBoZWFkZXJzL2xpbmtzXHJcbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgZmluZGluZyB0aGUgdGFiIGxpbmsvYnV0dG9uIHRoYXQgcmVmZXJlbmNlcyB0aGlzIHRhYlxyXG4gICAgICAgIHRhYkVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfV9oZWFkZXJcIl1gKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSBbcm9sZT1cInRhYlwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFthcmlhLWNvbnRyb2xzPVwiJHtjb250cm9sTmFtZX1cIl1gKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBhW2hyZWYqPVwiJHtjb250cm9sTmFtZX1cIl0sIGJ1dHRvbltkYXRhLXRhcmdldCo9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRhYiBlbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRm9yIEQzNjUgcGFyYW1ldGVyIGZvcm1zIHdpdGggdmVydGljYWwgdGFicywgdGhlIGNsaWNrYWJsZSBlbGVtZW50IHN0cnVjdHVyZSB2YXJpZXNcclxuICAgIC8vIFRyeSBtdWx0aXBsZSBhcHByb2FjaGVzIHRvIGZpbmQgYW5kIGNsaWNrIHRoZSByaWdodCBlbGVtZW50XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDE6IExvb2sgZm9yIHRoZSB0YWIgbGluayBpbnNpZGUgYSBwaXZvdC90YWIgc3RydWN0dXJlXHJcbiAgICBsZXQgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5waXZvdC1saW5rLCAudGFiLWxpbmssIFtyb2xlPVwidGFiXCJdJyk7XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDI6IFRoZSBlbGVtZW50IGl0c2VsZiBtaWdodCBiZSB0aGUgbGlua1xyXG4gICAgaWYgKCFjbGlja1RhcmdldCAmJiAodGFiRWxlbWVudC50YWdOYW1lID09PSAnQScgfHwgdGFiRWxlbWVudC50YWdOYW1lID09PSAnQlVUVE9OJyB8fCB0YWJFbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAndGFiJykpIHtcclxuICAgICAgICBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDM6IEZvciB2ZXJ0aWNhbCB0YWJzLCBsb29rIGZvciB0aGUgYW5jaG9yIG9yIGxpbmsgZWxlbWVudFxyXG4gICAgaWYgKCFjbGlja1RhcmdldCkge1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudC5xdWVyeVNlbGVjdG9yKCdhLCBidXR0b24nKSB8fCB0YWJFbGVtZW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBBcHByb2FjaCA0OiBGb3IgUGl2b3RJdGVtLCBmaW5kIHRoZSBoZWFkZXIgZWxlbWVudFxyXG4gICAgaWYgKCFjbGlja1RhcmdldCB8fCBjbGlja1RhcmdldCA9PT0gdGFiRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IGhlYWRlck5hbWUgPSBjb250cm9sTmFtZSArICdfaGVhZGVyJztcclxuICAgICAgICBjb25zdCBoZWFkZXJFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7aGVhZGVyTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoaGVhZGVyRWwpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBoZWFkZXJFbC5xdWVyeVNlbGVjdG9yKCdhLCBidXR0b24sIC5waXZvdC1saW5rJykgfHwgaGVhZGVyRWw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBDbGlja2luZyB0YWIgZWxlbWVudDogJHtjbGlja1RhcmdldD8udGFnTmFtZSB8fCAndW5rbm93bid9YCk7XHJcbiAgICBcclxuICAgIC8vIEZvY3VzIGFuZCBjbGlja1xyXG4gICAgaWYgKGNsaWNrVGFyZ2V0LmZvY3VzKSBjbGlja1RhcmdldC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZVxyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBBbHNvIHRyeSB0cmlnZ2VyaW5nIHRoZSBEMzY1IGludGVybmFsIGNvbnRyb2xcclxuICAgIGlmICh0eXBlb2YgJGR5biAhPT0gJ3VuZGVmaW5lZCcgJiYgJGR5bi5jb250cm9scykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2wgPSAkZHluLmNvbnRyb2xzW2NvbnRyb2xOYW1lXTtcclxuICAgICAgICAgICAgaWYgKGNvbnRyb2wpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29udHJvbC5BY3RpdmF0ZVRhYiA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuQWN0aXZhdGVUYWIodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIEFjdGl2YXRlVGFiIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLmFjdGl2YXRlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5hY3RpdmF0ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBhY3RpdmF0ZSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5zZWxlY3QgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLnNlbGVjdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBzZWxlY3Qgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgbG9nU3RlcChgRDM2NSBjb250cm9sIG1ldGhvZCBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gV2FpdCBmb3IgdGFiIGNvbnRlbnQgdG8gbG9hZFxyXG4gICAgYXdhaXQgc2xlZXAoODAwKTtcclxuICAgIFxyXG4gICAgLy8gVmVyaWZ5IHRoZSB0YWIgaXMgbm93IGFjdGl2ZSBieSBjaGVja2luZyBmb3IgdmlzaWJsZSBjb250ZW50XHJcbiAgICBjb25zdCB0YWJDb250ZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgIGlmICh0YWJDb250ZW50KSB7XHJcbiAgICAgICAgY29uc3QgaXNWaXNpYmxlID0gdGFiQ29udGVudC5vZmZzZXRQYXJlbnQgIT09IG51bGw7XHJcbiAgICAgICAgY29uc3QgaXNBY3RpdmUgPSB0YWJDb250ZW50LmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYkNvbnRlbnQuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0YWJDb250ZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nKSAhPT0gJ3RydWUnO1xyXG4gICAgICAgIGxvZ1N0ZXAoYFRhYiAke2NvbnRyb2xOYW1lfSB2aXNpYmlsaXR5IGNoZWNrOiB2aXNpYmxlPSR7aXNWaXNpYmxlfSwgYWN0aXZlPSR7aXNBY3RpdmV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYFRhYiAke2NvbnRyb2xOYW1lfSBhY3RpdmF0ZWRgKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlQWN0aW9uUGFuZVRhYihjb250cm9sTmFtZSkge1xuICAgIGxvZ1N0ZXAoYEFjdGl2YXRpbmcgYWN0aW9uIHBhbmUgdGFiOiAke2NvbnRyb2xOYW1lfWApO1xuXG4gICAgbGV0IHRhYkVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XG5cbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcbiAgICAgICAgY29uc3Qgc2VsZWN0b3JzID0gW1xuICAgICAgICAgICAgYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgIGAuYXBwQmFyVGFiW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxuICAgICAgICAgICAgYC5hcHBCYXJUYWIgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxuICAgICAgICAgICAgYFtyb2xlPVwidGFiXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXG4gICAgICAgIF07XG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG4gICAgICAgICAgICB0YWJFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgICAgICBpZiAodGFiRWxlbWVudCkgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBY3Rpb24gcGFuZSB0YWIgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xuICAgIH1cblxuICAgIGxldCBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQ7XG5cbiAgICBjb25zdCBoZWFkZXIgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3I/LignLmFwcEJhclRhYi1oZWFkZXIsIC5hcHBCYXJUYWJIZWFkZXIsIC5hcHBCYXJUYWJfaGVhZGVyJyk7XG4gICAgaWYgKGhlYWRlcikge1xuICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlcjtcbiAgICB9XG5cbiAgICBjb25zdCBmb2N1c1NlbGVjdG9yID0gdGFiRWxlbWVudC5nZXRBdHRyaWJ1dGU/LignZGF0YS1keW4tZm9jdXMnKTtcbiAgICBpZiAoZm9jdXNTZWxlY3Rvcikge1xuICAgICAgICBjb25zdCBmb2N1c1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcihmb2N1c1NlbGVjdG9yKTtcbiAgICAgICAgaWYgKGZvY3VzVGFyZ2V0KSB7XG4gICAgICAgICAgICBjbGlja1RhcmdldCA9IGZvY3VzVGFyZ2V0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRhYkVsZW1lbnQuZ2V0QXR0cmlidXRlPy4oJ3JvbGUnKSA9PT0gJ3RhYicpIHtcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xuICAgIH1cblxuICAgIGlmIChjbGlja1RhcmdldCA9PT0gdGFiRWxlbWVudCkge1xuICAgICAgICBjb25zdCBidXR0b25pc2ggPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3I/LignYnV0dG9uLCBhLCBbcm9sZT1cInRhYlwiXScpO1xuICAgICAgICBpZiAoYnV0dG9uaXNoKSBjbGlja1RhcmdldCA9IGJ1dHRvbmlzaDtcbiAgICB9XG5cbiAgICBpZiAoY2xpY2tUYXJnZXQ/LmZvY3VzKSBjbGlja1RhcmdldC5mb2N1cygpO1xuICAgIGF3YWl0IHNsZWVwKDEwMCk7XG4gICAgZGlzcGF0Y2hDbGlja1NlcXVlbmNlKGNsaWNrVGFyZ2V0KTtcblxuICAgIGlmICh0eXBlb2YgJGR5biAhPT0gJ3VuZGVmaW5lZCcgJiYgJGR5bi5jb250cm9scykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbCA9ICRkeW4uY29udHJvbHNbY29udHJvbE5hbWVdO1xuICAgICAgICAgICAgaWYgKGNvbnRyb2wpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuYWN0aXZhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5hY3RpdmF0ZSgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuc2VsZWN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuc2VsZWN0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBsb2dTdGVwKGBBY3Rpb24gcGFuZSBjb250cm9sIG1ldGhvZCBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXdhaXQgc2xlZXAoNjAwKTtcbiAgICBsb2dTdGVwKGBBY3Rpb24gcGFuZSB0YWIgJHtjb250cm9sTmFtZX0gYWN0aXZhdGVkYCk7XG59XG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKGNvbnRyb2xOYW1lLCBhY3Rpb24pIHtcclxuICAgIGxvZ1N0ZXAoYCR7YWN0aW9uID09PSAnZXhwYW5kJyA/ICdFeHBhbmRpbmcnIDogJ0NvbGxhcHNpbmcnfSBzZWN0aW9uOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBzZWN0aW9uID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFzZWN0aW9uKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBTZWN0aW9uIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEMzY1IHNlY3Rpb25zIGNhbiBoYXZlIHZhcmlvdXMgc3RydWN0dXJlcy4gVGhlIHRvZ2dsZSBidXR0b24gaXMgdXN1YWxseTpcclxuICAgIC8vIDEuIEEgYnV0dG9uIHdpdGggYXJpYS1leHBhbmRlZCBpbnNpZGUgdGhlIHNlY3Rpb25cclxuICAgIC8vIDIuIEEgc2VjdGlvbiBoZWFkZXIgZWxlbWVudFxyXG4gICAgLy8gMy4gVGhlIHNlY3Rpb24gaXRzZWxmIG1pZ2h0IGJlIGNsaWNrYWJsZVxyXG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSB0b2dnbGUgYnV0dG9uIC0gdGhpcyBpcyBjcnVjaWFsIGZvciBEMzY1IGRpYWxvZ3NcclxuICAgIGxldCB0b2dnbGVCdXR0b24gPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblthcmlhLWV4cGFuZGVkXScpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBub3QgZm91bmQsIHRyeSBvdGhlciBjb21tb24gcGF0dGVybnNcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCcuc2VjdGlvbi1wYWdlLWNhcHRpb24sIC5zZWN0aW9uLWhlYWRlciwgLmdyb3VwLWhlYWRlciwgW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZUhlYWRlclwiXScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtIHNlY3Rpb25zIChSZWNvcmRzIHRvIGluY2x1ZGUsIFJ1biBpbiB0aGUgYmFja2dyb3VuZClcclxuICAgIC8vIHRoZSBidXR0b24gaXMgb2Z0ZW4gYSBkaXJlY3QgY2hpbGQgb3Igc2libGluZ1xyXG4gICAgaWYgKCF0b2dnbGVCdXR0b24pIHtcclxuICAgICAgICB0b2dnbGVCdXR0b24gPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBpZiB0aGUgc2VjdGlvbiBpdHNlbGYgaGFzIGFyaWEtZXhwYW5kZWQgKGl0IG1pZ2h0IGJlIHRoZSBjbGlja2FibGUgZWxlbWVudClcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uICYmIHNlY3Rpb24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICB0b2dnbGVCdXR0b24gPSBzZWN0aW9uO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEZXRlcm1pbmUgY3VycmVudCBzdGF0ZSBmcm9tIHZhcmlvdXMgc291cmNlc1xyXG4gICAgbGV0IGlzRXhwYW5kZWQgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgdGhlIHRvZ2dsZSBidXR0b24ncyBhcmlhLWV4cGFuZGVkXHJcbiAgICBpZiAodG9nZ2xlQnV0dG9uICYmIHRvZ2dsZUJ1dHRvbi5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSkge1xyXG4gICAgICAgIGlzRXhwYW5kZWQgPSB0b2dnbGVCdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJztcclxuICAgIH0gZWxzZSBpZiAoc2VjdGlvbi5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSkge1xyXG4gICAgICAgIGlzRXhwYW5kZWQgPSBzZWN0aW9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNsYXNzLWJhc2VkIGRldGVjdGlvblxyXG4gICAgICAgIGlzRXhwYW5kZWQgPSBzZWN0aW9uLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAhc2VjdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBTZWN0aW9uICR7Y29udHJvbE5hbWV9IGN1cnJlbnQgc3RhdGU6ICR7aXNFeHBhbmRlZCA/ICdleHBhbmRlZCcgOiAnY29sbGFwc2VkJ31gKTtcclxuICAgIFxyXG4gICAgY29uc3QgbmVlZHNUb2dnbGUgPSAoYWN0aW9uID09PSAnZXhwYW5kJyAmJiAhaXNFeHBhbmRlZCkgfHwgKGFjdGlvbiA9PT0gJ2NvbGxhcHNlJyAmJiBpc0V4cGFuZGVkKTtcclxuICAgIFxyXG4gICAgaWYgKG5lZWRzVG9nZ2xlKSB7XHJcbiAgICAgICAgLy8gQ2xpY2sgdGhlIHRvZ2dsZSBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSB0b2dnbGVCdXR0b24gfHwgc2VjdGlvbjtcclxuICAgICAgICBsb2dTdGVwKGBDbGlja2luZyB0b2dnbGUgZWxlbWVudDogJHtjbGlja1RhcmdldC50YWdOYW1lfSwgY2xhc3M9JHtjbGlja1RhcmdldC5jbGFzc05hbWV9YCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZSBmb3IgRDM2NSBSZWFjdCBjb21wb25lbnRzXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJ1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBEMzY1IGludGVybmFsIGNvbnRyb2wgQVBJXHJcbiAgICAgICAgaWYgKHR5cGVvZiAkZHluICE9PSAndW5kZWZpbmVkJyAmJiAkZHluLmNvbnRyb2xzKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRyeSB2YXJpb3VzIEQzNjUgbWV0aG9kc1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29udHJvbC5FeHBhbmRlZENoYW5nZWQgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRXhwYW5kZWRDaGFuZ2VkIHRha2VzIDAgZm9yIGV4cGFuZCwgMSBmb3IgY29sbGFwc2UgaW4gRDM2NVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLkV4cGFuZGVkQ2hhbmdlZChhY3Rpb24gPT09ICdjb2xsYXBzZScgPyAxIDogMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBFeHBhbmRlZENoYW5nZWQoJHthY3Rpb24gPT09ICdjb2xsYXBzZScgPyAxIDogMH0pIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5leHBhbmQgPT09ICdmdW5jdGlvbicgJiYgYWN0aW9uID09PSAnZXhwYW5kJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLmV4cGFuZCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgZXhwYW5kKCkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLmNvbGxhcHNlID09PSAnZnVuY3Rpb24nICYmIGFjdGlvbiA9PT0gJ2NvbGxhcHNlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLmNvbGxhcHNlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBjb2xsYXBzZSgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC50b2dnbGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC50b2dnbGUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIHRvZ2dsZSgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICBsb2dTdGVwKGBEMzY1IGNvbnRyb2wgbWV0aG9kIGZhaWxlZDogJHtlLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSBhbHJlYWR5ICR7YWN0aW9ufWVkLCBubyB0b2dnbGUgbmVlZGVkYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYFNlY3Rpb24gJHtjb250cm9sTmFtZX0gJHthY3Rpb259ZWRgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZVF1ZXJ5RmlsdGVyKHRhYmxlTmFtZSwgZmllbGROYW1lLCBjcml0ZXJpYVZhbHVlLCBvcHRpb25zID0ge30pIHtcclxuICAgIGxvZ1N0ZXAoYENvbmZpZ3VyaW5nIHF1ZXJ5IGZpbHRlcjogJHt0YWJsZU5hbWUgPyB0YWJsZU5hbWUgKyAnLicgOiAnJ30ke2ZpZWxkTmFtZX0gPSAke2NyaXRlcmlhVmFsdWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgb3Igb3BlbiB0aGUgcXVlcnkgZmlsdGVyIGRpYWxvZ1xyXG4gICAgbGV0IHF1ZXJ5Rm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNRdWVyeUZvcm1cIl0nKTtcclxuICAgIGlmICghcXVlcnlGb3JtKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIG9wZW4gdGhlIHF1ZXJ5IGRpYWxvZyB2aWEgUXVlcnkgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUXVlcnlTZWxlY3RCdXR0b25cIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiUXVlcnlcIl0nKTtcclxuICAgICAgICBpZiAoZmlsdGVyQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIGZpbHRlckJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTtcclxuICAgICAgICAgICAgcXVlcnlGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFxdWVyeUZvcm0pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1F1ZXJ5IGZpbHRlciBkaWFsb2cgKFN5c1F1ZXJ5Rm9ybSkgbm90IGZvdW5kLiBNYWtlIHN1cmUgdGhlIGZpbHRlciBkaWFsb2cgaXMgb3Blbi4nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSGVscGVyIHRvIGZpbmQgZWxlbWVudCB3aXRoaW4gcXVlcnkgZm9ybVxyXG4gICAgY29uc3QgZmluZEluUXVlcnkgPSAobmFtZSkgPT4gcXVlcnlGb3JtLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7bmFtZX1cIl1gKTtcclxuICAgIFxyXG4gICAgLy8gSWYgc2F2ZWRRdWVyeSBpcyBzcGVjaWZpZWQsIHNlbGVjdCBpdCBmcm9tIHRoZSBkcm9wZG93biBmaXJzdFxyXG4gICAgaWYgKG9wdGlvbnMuc2F2ZWRRdWVyeSkge1xyXG4gICAgICAgIGNvbnN0IHNhdmVkUXVlcnlCb3ggPSBmaW5kSW5RdWVyeSgnU2F2ZWRRdWVyaWVzQm94Jyk7XHJcbiAgICAgICAgaWYgKHNhdmVkUXVlcnlCb3gpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBzYXZlZFF1ZXJ5Qm94LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBvcHRpb25zLnNhdmVkUXVlcnkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTWFrZSBzdXJlIHdlJ3JlIG9uIHRoZSBSYW5nZSB0YWJcclxuICAgIGNvbnN0IHJhbmdlVGFiID0gZmluZEluUXVlcnkoJ1JhbmdlVGFiJykgfHwgZmluZEluUXVlcnkoJ1JhbmdlVGFiX2hlYWRlcicpO1xyXG4gICAgaWYgKHJhbmdlVGFiICYmICFyYW5nZVRhYi5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpICYmIHJhbmdlVGFiLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpICE9PSAndHJ1ZScpIHtcclxuICAgICAgICByYW5nZVRhYi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENsaWNrIEFkZCB0byBhZGQgYSBuZXcgZmlsdGVyIHJvd1xyXG4gICAgY29uc3QgYWRkQnV0dG9uID0gZmluZEluUXVlcnkoJ1JhbmdlQWRkJyk7XHJcbiAgICBpZiAoYWRkQnV0dG9uKSB7XHJcbiAgICAgICAgYWRkQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGhlIGdyaWQgdXNlcyBSZWFjdExpc3QgLSBmaW5kIHRoZSBsYXN0IHJvdyAobmV3bHkgYWRkZWQpIGFuZCBmaWxsIGluIHZhbHVlc1xyXG4gICAgY29uc3QgZ3JpZCA9IGZpbmRJblF1ZXJ5KCdSYW5nZUdyaWQnKTtcclxuICAgIGlmICghZ3JpZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUmFuZ2UgZ3JpZCBub3QgZm91bmQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGFsbCByb3dzIGFuZCBmaW5kIHRoZSBsYXN0IG9uZSAobW9zdCByZWNlbnRseSBhZGRlZClcclxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicm93XCJdLCB0ciwgLmxpc3Qtcm93Jyk7XHJcbiAgICBjb25zdCBsYXN0Um93ID0gcm93c1tyb3dzLmxlbmd0aCAtIDFdIHx8IGdyaWQ7XHJcbiAgICBcclxuICAgIC8vIFNldCB0YWJsZSBuYW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAodGFibGVOYW1lKSB7XHJcbiAgICAgICAgY29uc3QgdGFibGVDZWxsID0gbGFzdFJvdy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVRhYmxlXCJdJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVGFibGVcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0VGFibGVDZWxsID0gdGFibGVDZWxsLmxlbmd0aCA/IHRhYmxlQ2VsbFt0YWJsZUNlbGwubGVuZ3RoIC0gMV0gOiB0YWJsZUNlbGw7XHJcbiAgICAgICAgaWYgKGxhc3RUYWJsZUNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0VGFibGVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdFRhYmxlQ2VsbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgdGFibGVOYW1lKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBmaWVsZCBuYW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoZmllbGROYW1lKSB7XHJcbiAgICAgICAgY29uc3QgZmllbGRDZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VGaWVsZFwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RGaWVsZENlbGwgPSBmaWVsZENlbGxzW2ZpZWxkQ2VsbHMubGVuZ3RoIC0gMV0gfHwgZ3JpZC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZUZpZWxkXCJdJyk7XHJcbiAgICAgICAgaWYgKGxhc3RGaWVsZENlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0RmllbGRDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdEZpZWxkQ2VsbDtcclxuICAgICAgICAgICAgLy8gQ2xpY2sgdG8gb3BlbiBkcm9wZG93bi9mb2N1c1xyXG4gICAgICAgICAgICBpbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGZpZWxkTmFtZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgY3JpdGVyaWEgdmFsdWUgaWYgcHJvdmlkZWRcclxuICAgIGlmIChjcml0ZXJpYVZhbHVlKSB7XHJcbiAgICAgICAgY29uc3QgdmFsdWVDZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VWYWx1ZVwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RWYWx1ZUNlbGwgPSB2YWx1ZUNlbGxzW3ZhbHVlQ2VsbHMubGVuZ3RoIC0gMV0gfHwgZ3JpZC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVZhbHVlXCJdJyk7XHJcbiAgICAgICAgaWYgKGxhc3RWYWx1ZUNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0VmFsdWVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdFZhbHVlQ2VsbDtcclxuICAgICAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBjcml0ZXJpYVZhbHVlKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoJ1F1ZXJ5IGZpbHRlciBjb25maWd1cmVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVCYXRjaFByb2Nlc3NpbmcoZW5hYmxlZCwgdGFza0Rlc2NyaXB0aW9uLCBiYXRjaEdyb3VwLCBvcHRpb25zID0ge30pIHtcclxuICAgIGxvZ1N0ZXAoYENvbmZpZ3VyaW5nIGJhdGNoIHByb2Nlc3Npbmc6ICR7ZW5hYmxlZCA/ICdlbmFibGVkJyA6ICdkaXNhYmxlZCd9YCk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIGRpYWxvZyB0byBiZSByZWFkeVxyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgYmF0Y2ggcHJvY2Vzc2luZyBjaGVja2JveCAtIGNvbnRyb2wgbmFtZSBpcyBGbGQxXzEgaW4gU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXHJcbiAgICBjb25zdCBiYXRjaFRvZ2dsZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cIl0gW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiRmxkMV8xXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoJ0ZsZDFfMScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZsZDFfMVwiXScpO1xyXG4gICAgXHJcbiAgICBpZiAoYmF0Y2hUb2dnbGUpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBhY3R1YWwgY2hlY2tib3ggaW5wdXQgb3IgdG9nZ2xlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IGNoZWNrYm94ID0gYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJy50b2dnbGUtYnV0dG9uJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gY2hlY2tib3g/LmNoZWNrZWQgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5jbGFzc0xpc3QuY29udGFpbnMoJ29uJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRTdGF0ZSAhPT0gZW5hYmxlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGNoZWNrYm94IHx8IGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgLnRvZ2dsZS1zd2l0Y2gsIGxhYmVsJykgfHwgYmF0Y2hUb2dnbGU7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKCdXYXJuaW5nOiBCYXRjaCBwcm9jZXNzaW5nIHRvZ2dsZSAoRmxkMV8xKSBub3QgZm91bmQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHRhc2sgZGVzY3JpcHRpb24gaWYgcHJvdmlkZWQgYW5kIGJhdGNoIGlzIGVuYWJsZWQgKEZsZDJfMSlcclxuICAgIGlmIChlbmFibGVkICYmIHRhc2tEZXNjcmlwdGlvbikge1xyXG4gICAgICAgIGF3YWl0IHNldElucHV0VmFsdWUoJ0ZsZDJfMScsIHRhc2tEZXNjcmlwdGlvbik7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGJhdGNoIGdyb3VwIGlmIHByb3ZpZGVkIGFuZCBiYXRjaCBpcyBlbmFibGVkIChGbGQzXzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBiYXRjaEdyb3VwKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkM18xJywgYmF0Y2hHcm91cCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IFByaXZhdGUgYW5kIENyaXRpY2FsIG9wdGlvbnMgaWYgcHJvdmlkZWQgKEZsZDRfMSBhbmQgRmxkNV8xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgb3B0aW9ucy5wcml2YXRlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBzZXRDaGVja2JveCgnRmxkNF8xJywgb3B0aW9ucy5wcml2YXRlKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLmNyaXRpY2FsSm9iICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBzZXRDaGVja2JveCgnRmxkNV8xJywgb3B0aW9ucy5jcml0aWNhbEpvYik7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IE1vbml0b3JpbmcgY2F0ZWdvcnkgaWYgc3BlY2lmaWVkIChGbGQ2XzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLm1vbml0b3JpbmdDYXRlZ29yeSkge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoJ0ZsZDZfMScsIG9wdGlvbnMubW9uaXRvcmluZ0NhdGVnb3J5KTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdCYXRjaCBwcm9jZXNzaW5nIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZVJlY3VycmVuY2Uoc3RlcCkge1xyXG4gICAgY29uc3QgeyBwYXR0ZXJuVW5pdCwgcGF0dGVybkNvdW50LCBlbmREYXRlT3B0aW9uLCBlbmRBZnRlckNvdW50LCBlbmRCeURhdGUsIHN0YXJ0RGF0ZSwgc3RhcnRUaW1lLCB0aW1lem9uZSB9ID0gc3RlcDtcclxuICAgIFxyXG4gICAgY29uc3QgcGF0dGVyblVuaXRzID0gWydtaW51dGVzJywgJ2hvdXJzJywgJ2RheXMnLCAnd2Vla3MnLCAnbW9udGhzJywgJ3llYXJzJ107XHJcbiAgICBsb2dTdGVwKGBDb25maWd1cmluZyByZWN1cnJlbmNlOiBldmVyeSAke3BhdHRlcm5Db3VudH0gJHtwYXR0ZXJuVW5pdHNbcGF0dGVyblVuaXQgfHwgMF19YCk7XHJcbiAgICBcclxuICAgIC8vIENsaWNrIFJlY3VycmVuY2UgYnV0dG9uIHRvIG9wZW4gZGlhbG9nIGlmIG5vdCBhbHJlYWR5IG9wZW5cclxuICAgIGxldCByZWN1cnJlbmNlRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICBpZiAoIXJlY3VycmVuY2VGb3JtKSB7XHJcbiAgICAgICAgLy8gTW51SXRtXzEgaXMgdGhlIFJlY3VycmVuY2UgYnV0dG9uIGluIFN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVxyXG4gICAgICAgIGNvbnN0IHJlY3VycmVuY2VCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1udUl0bV8xXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCgnTW51SXRtXzEnKTtcclxuICAgICAgICBpZiAocmVjdXJyZW5jZUJ1dHRvbikge1xyXG4gICAgICAgICAgICByZWN1cnJlbmNlQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgICAgICByZWN1cnJlbmNlRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXJlY3VycmVuY2VGb3JtKSB7XHJcbiAgICAgICAgbG9nU3RlcCgnV2FybmluZzogQ291bGQgbm90IG9wZW4gU3lzUmVjdXJyZW5jZSBkaWFsb2cnKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBmaW5kIGVsZW1lbnQgd2l0aGluIHJlY3VycmVuY2UgZm9ybVxyXG4gICAgY29uc3QgZmluZEluUmVjdXJyZW5jZSA9IChuYW1lKSA9PiByZWN1cnJlbmNlRm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke25hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIC8vIFNldCBzdGFydCBkYXRlIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoc3RhcnREYXRlKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnREYXRlSW5wdXQgPSBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydERhdGUnKT8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydERhdGUnKTtcclxuICAgICAgICBpZiAoc3RhcnREYXRlSW5wdXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShzdGFydERhdGVJbnB1dCwgc3RhcnREYXRlKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBzdGFydCB0aW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoc3RhcnRUaW1lKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRUaW1lSW5wdXQgPSBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydFRpbWUnKT8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydFRpbWUnKTtcclxuICAgICAgICBpZiAoc3RhcnRUaW1lSW5wdXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShzdGFydFRpbWVJbnB1dCwgc3RhcnRUaW1lKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCB0aW1lem9uZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHRpbWV6b25lKSB7XHJcbiAgICAgICAgY29uc3QgdGltZXpvbmVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnVGltZXpvbmUnKTtcclxuICAgICAgICBpZiAodGltZXpvbmVDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gdGltZXpvbmVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCB0aW1lem9uZSk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgcGF0dGVybiB1bml0IChyYWRpbyBidXR0b25zOiBNaW51dGVzPTAsIEhvdXJzPTEsIERheXM9MiwgV2Vla3M9MywgTW9udGhzPTQsIFllYXJzPTUpXHJcbiAgICBpZiAocGF0dGVyblVuaXQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGNvbnN0IHBhdHRlcm5Vbml0Q29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoJ1BhdHRlcm5Vbml0Jyk7XHJcbiAgICAgICAgaWYgKHBhdHRlcm5Vbml0Q29udHJvbCkge1xyXG4gICAgICAgICAgICAvLyBSYWRpbyBidXR0b25zIGFyZSB0eXBpY2FsbHkgcmVuZGVyZWQgYXMgYSBncm91cCB3aXRoIG11bHRpcGxlIG9wdGlvbnNcclxuICAgICAgICAgICAgY29uc3QgcmFkaW9JbnB1dHMgPSBwYXR0ZXJuVW5pdENvbnRyb2wucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInJhZGlvXCJdJyk7XHJcbiAgICAgICAgICAgIGlmIChyYWRpb0lucHV0cy5sZW5ndGggPiBwYXR0ZXJuVW5pdCkge1xyXG4gICAgICAgICAgICAgICAgcmFkaW9JbnB1dHNbcGF0dGVyblVuaXRdLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApOyAvLyBXYWl0IGZvciBVSSB0byB1cGRhdGUgd2l0aCBhcHByb3ByaWF0ZSBpbnRlcnZhbCBmaWVsZFxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IGNsaWNraW5nIHRoZSBudGggb3B0aW9uIGxhYmVsL2J1dHRvblxyXG4gICAgICAgICAgICAgICAgY29uc3QgcmFkaW9PcHRpb25zID0gcGF0dGVyblVuaXRDb250cm9sLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicmFkaW9cIl0sIGxhYmVsLCBidXR0b24nKTtcclxuICAgICAgICAgICAgICAgIGlmIChyYWRpb09wdGlvbnMubGVuZ3RoID4gcGF0dGVyblVuaXQpIHtcclxuICAgICAgICAgICAgICAgICAgICByYWRpb09wdGlvbnNbcGF0dGVyblVuaXRdLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGludGVydmFsIGNvdW50IGJhc2VkIG9uIHBhdHRlcm4gdW5pdFxyXG4gICAgLy8gVGhlIHZpc2libGUgaW5wdXQgZmllbGQgY2hhbmdlcyBiYXNlZCBvbiBzZWxlY3RlZCBwYXR0ZXJuIHVuaXRcclxuICAgIGlmIChwYXR0ZXJuQ291bnQpIHtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2xOYW1lcyA9IFsnTWludXRlSW50JywgJ0hvdXJJbnQnLCAnRGF5SW50JywgJ1dlZWtJbnQnLCAnTW9udGhJbnQnLCAnWWVhckludCddO1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbE5hbWUgPSBjb3VudENvbnRyb2xOYW1lc1twYXR0ZXJuVW5pdCB8fCAwXTtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKGNvdW50Q29udHJvbE5hbWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb3VudENvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBjb3VudENvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBjb3VudENvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIHBhdHRlcm5Db3VudC50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBlbmQgZGF0ZSBvcHRpb25zXHJcbiAgICBpZiAoZW5kRGF0ZU9wdGlvbiA9PT0gJ25vRW5kRGF0ZScpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIk5vIGVuZCBkYXRlXCIgZ3JvdXAgKEVuZERhdGUxKVxyXG4gICAgICAgIGNvbnN0IG5vRW5kRGF0ZUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTEnKTtcclxuICAgICAgICBpZiAobm9FbmREYXRlR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBub0VuZERhdGVHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBub0VuZERhdGVHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGVuZERhdGVPcHRpb24gPT09ICdlbmRBZnRlcicgJiYgZW5kQWZ0ZXJDb3VudCkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGFmdGVyXCIgZ3JvdXAgKEVuZERhdGUyKSBhbmQgc2V0IGNvdW50XHJcbiAgICAgICAgY29uc3QgZW5kQWZ0ZXJHcm91cCA9IGZpbmRJblJlY3VycmVuY2UoJ0VuZERhdGUyJyk7XHJcbiAgICAgICAgaWYgKGVuZEFmdGVyR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBlbmRBZnRlckdyb3VwLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXSwgW3JvbGU9XCJyYWRpb1wiXScpIHx8IGVuZEFmdGVyR3JvdXA7XHJcbiAgICAgICAgICAgIHJhZGlvLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFNldCB0aGUgY291bnQgKEVuZERhdGVJbnQpXHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZUludCcpO1xyXG4gICAgICAgIGlmIChjb3VudENvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBjb3VudENvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBjb3VudENvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGVuZEFmdGVyQ291bnQudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQnknICYmIGVuZEJ5RGF0ZSkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGJ5XCIgZ3JvdXAgKEVuZERhdGUzKSBhbmQgc2V0IGRhdGVcclxuICAgICAgICBjb25zdCBlbmRCeUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTMnKTtcclxuICAgICAgICBpZiAoZW5kQnlHcm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCByYWRpbyA9IGVuZEJ5R3JvdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdLCBbcm9sZT1cInJhZGlvXCJdJykgfHwgZW5kQnlHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gU2V0IHRoZSBlbmQgZGF0ZSAoRW5kRGF0ZURhdGUpXHJcbiAgICAgICAgY29uc3QgZGF0ZUNvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlRGF0ZScpO1xyXG4gICAgICAgIGlmIChkYXRlQ29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRhdGVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgZGF0ZUNvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGVuZEJ5RGF0ZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdSZWN1cnJlbmNlIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXRFbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgaWYgKCFpbnB1dEVsZW1lbnQpIHJldHVybjtcclxuICAgIFxyXG4gICAgLy8gRm9jdXMgdGhlIGlucHV0XHJcbiAgICBpbnB1dEVsZW1lbnQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlXHJcbiAgICBpbnB1dEVsZW1lbnQuc2VsZWN0Py4oKTtcclxuICAgIFxyXG4gICAgLy8gU2V0IHRoZSB2YWx1ZVxyXG4gICAgaW5wdXRFbGVtZW50LnZhbHVlID0gdmFsdWU7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXRFbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0RmlsdGVyTWV0aG9kKGZpbHRlckNvbnRhaW5lciwgbWV0aG9kKSB7XHJcbiAgICAvLyBGaW5kIHRoZSBmaWx0ZXIgb3BlcmF0b3IgZHJvcGRvd24gbmVhciB0aGUgZmlsdGVyIGlucHV0XHJcbiAgICAvLyBEMzY1IHVzZXMgdmFyaW91cyBwYXR0ZXJucyBmb3IgdGhlIG9wZXJhdG9yIGRyb3Bkb3duXHJcbiAgICBjb25zdCBvcGVyYXRvclBhdHRlcm5zID0gW1xyXG4gICAgICAgICdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyT3BlcmF0b3JcIl0nLFxyXG4gICAgICAgICdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiX09wZXJhdG9yXCJdJyxcclxuICAgICAgICAnLmZpbHRlci1vcGVyYXRvcicsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0nXHJcbiAgICBdO1xyXG4gICAgXHJcbiAgICBsZXQgb3BlcmF0b3JEcm9wZG93biA9IG51bGw7XHJcbiAgICBjb25zdCBzZWFyY2hDb250YWluZXIgPSBmaWx0ZXJDb250YWluZXI/LnBhcmVudEVsZW1lbnQgfHwgZG9jdW1lbnQ7XHJcbiAgICBcclxuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBvcGVyYXRvclBhdHRlcm5zKSB7XHJcbiAgICAgICAgb3BlcmF0b3JEcm9wZG93biA9IHNlYXJjaENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKHBhdHRlcm4pO1xyXG4gICAgICAgIGlmIChvcGVyYXRvckRyb3Bkb3duICYmIG9wZXJhdG9yRHJvcGRvd24ub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFvcGVyYXRvckRyb3Bkb3duKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNkEwIEZpbHRlciBvcGVyYXRvciBkcm9wZG93biBub3QgZm91bmQsIHVzaW5nIGRlZmF1bHQgbWV0aG9kYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDbGljayB0byBvcGVuIHRoZSBkcm9wZG93blxyXG4gICAgY29uc3QgZHJvcGRvd25CdXR0b24gPSBvcGVyYXRvckRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgW3JvbGU9XCJjb21ib2JveFwiXSwgLmR5bi1jb21ib0JveC1idXR0b24nKSB8fCBvcGVyYXRvckRyb3Bkb3duO1xyXG4gICAgZHJvcGRvd25CdXR0b24uY2xpY2soKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgYW5kIGNsaWNrIHRoZSBtYXRjaGluZyBvcHRpb25cclxuICAgIGNvbnN0IHNlYXJjaFRlcm1zID0gZ2V0RmlsdGVyTWV0aG9kU2VhcmNoVGVybXMobWV0aG9kKTtcbiAgICBcclxuICAgIC8vIExvb2sgZm9yIG9wdGlvbnMgaW4gbGlzdGJveC9kcm9wZG93blxyXG4gICAgY29uc3Qgb3B0aW9ucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwib3B0aW9uXCJdLCBbcm9sZT1cImxpc3RpdGVtXCJdLCAuZHluLWxpc3RWaWV3LWl0ZW0nKTtcclxuICAgIGZvciAoY29uc3Qgb3B0IG9mIG9wdGlvbnMpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gb3B0LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmICh0ZXh0SW5jbHVkZXNBbnkodGV4dCwgc2VhcmNoVGVybXMpKSB7XG4gICAgICAgICAgICBvcHQuY2xpY2soKTtcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICBTZXQgZmlsdGVyIG1ldGhvZDogJHttZXRob2R9YCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSBzZWxlY3QgZWxlbWVudFxyXG4gICAgY29uc3Qgc2VsZWN0RWwgPSBvcGVyYXRvckRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgaWYgKHNlbGVjdEVsKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBvcHQgb2Ygc2VsZWN0RWwub3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gb3B0LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAodGV4dEluY2x1ZGVzQW55KHRleHQsIHNlYXJjaFRlcm1zKSkge1xuICAgICAgICAgICAgICAgIHNlbGVjdEVsLnZhbHVlID0gb3B0LnZhbHVlO1xuICAgICAgICAgICAgICAgIHNlbGVjdEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgU2V0IGZpbHRlciBtZXRob2Q6ICR7bWV0aG9kfWApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGAgIFx1MjZBMCBDb3VsZCBub3Qgc2V0IGZpbHRlciBtZXRob2QgXCIke21ldGhvZH1cIiwgdXNpbmcgZGVmYXVsdGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0UmFkaW9CdXR0b25WYWx1ZShlbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgbG9nU3RlcChgU2V0dGluZyByYWRpbyBidXR0b24gdmFsdWU6ICR7dmFsdWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgYWxsIHJhZGlvIG9wdGlvbnMgaW4gdGhpcyBncm91cFxyXG4gICAgY29uc3QgcmFkaW9JbnB1dHMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXScpO1xyXG4gICAgY29uc3QgcmFkaW9Sb2xlcyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyYWRpb1wiXScpO1xyXG4gICAgY29uc3Qgb3B0aW9ucyA9IHJhZGlvSW5wdXRzLmxlbmd0aCA+IDAgPyBBcnJheS5mcm9tKHJhZGlvSW5wdXRzKSA6IEFycmF5LmZyb20ocmFkaW9Sb2xlcyk7XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIGNsaWNrYWJsZSBsYWJlbHMvYnV0dG9ucyB0aGF0IGFjdCBhcyByYWRpbyBvcHRpb25zXHJcbiAgICAgICAgY29uc3QgbGFiZWxCdXR0b25zID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdsYWJlbCwgYnV0dG9uLCBbZGF0YS1keW4tcm9sZT1cIlJhZGlvQnV0dG9uXCJdJyk7XHJcbiAgICAgICAgb3B0aW9ucy5wdXNoKC4uLkFycmF5LmZyb20obGFiZWxCdXR0b25zKSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gcmFkaW8gb3B0aW9ucyBmb3VuZCBpbiBlbGVtZW50YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYEZvdW5kICR7b3B0aW9ucy5sZW5ndGh9IHJhZGlvIG9wdGlvbnNgKTtcclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIG1hdGNoIGJ5IGluZGV4IChpZiB2YWx1ZSBpcyBhIG51bWJlciBvciBudW1lcmljIHN0cmluZylcclxuICAgIGNvbnN0IG51bVZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKTtcclxuICAgIGlmICghaXNOYU4obnVtVmFsdWUpICYmIG51bVZhbHVlID49IDAgJiYgbnVtVmFsdWUgPCBvcHRpb25zLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldE9wdGlvbiA9IG9wdGlvbnNbbnVtVmFsdWVdO1xyXG4gICAgICAgIGxvZ1N0ZXAoYENsaWNraW5nIHJhZGlvIG9wdGlvbiBhdCBpbmRleCAke251bVZhbHVlfWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENsaWNrIHRoZSByYWRpbyBvcHRpb24gb3IgaXRzIGFzc29jaWF0ZWQgbGFiZWxcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IHRhcmdldE9wdGlvbi50YWdOYW1lID09PSAnSU5QVVQnIFxyXG4gICAgICAgICAgICA/ICh0YXJnZXRPcHRpb24uY2xvc2VzdCgnbGFiZWwnKSB8fCB0YXJnZXRPcHRpb24ucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcignbGFiZWwnKSB8fCB0YXJnZXRPcHRpb24pXHJcbiAgICAgICAgICAgIDogdGFyZ2V0T3B0aW9uO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc3BhdGNoIGZ1bGwgY2xpY2sgc2VxdWVuY2VcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcnVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFsc28gdHJ5IGNsaWNraW5nIHRoZSBpbnB1dCBkaXJlY3RseVxyXG4gICAgICAgIGlmICh0YXJnZXRPcHRpb24udGFnTmFtZSA9PT0gJ0lOUFVUJykge1xyXG4gICAgICAgICAgICB0YXJnZXRPcHRpb24uY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHRhcmdldE9wdGlvbi5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSB0byBtYXRjaCBieSBsYWJlbCB0ZXh0XHJcbiAgICBjb25zdCBzZWFyY2hWYWx1ZSA9IFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKTtcclxuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcclxuICAgICAgICBjb25zdCBsYWJlbCA9IG9wdGlvbi5jbG9zZXN0KCdsYWJlbCcpIHx8IG9wdGlvbi5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpO1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKS50b0xvd2VyQ2FzZSgpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKT8udG9Mb3dlckNhc2UoKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbi50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkgfHwgJyc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRleHQuaW5jbHVkZXMoc2VhcmNoVmFsdWUpIHx8IHNlYXJjaFZhbHVlLmluY2x1ZGVzKHRleHQpKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYENsaWNraW5nIHJhZGlvIG9wdGlvbiB3aXRoIHRleHQ6ICR7dGV4dH1gKTtcclxuICAgICAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSBsYWJlbCB8fCBvcHRpb247XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob3B0aW9uLnRhZ05hbWUgPT09ICdJTlBVVCcpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBSYWRpbyBvcHRpb24gbm90IGZvdW5kIGZvciB2YWx1ZTogJHt2YWx1ZX1gKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBTZWdtZW50ZWRFbnRyeScpO1xyXG5cclxuICAgIC8vIEZpbmQgdGhlIGxvb2t1cCBidXR0b25cclxuICAgIGNvbnN0IGxvb2t1cEJ1dHRvbiA9IGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGxvb2t1cCBidXR0b24sIHRyeSBrZXlib2FyZCB0byBvcGVuIHRoZSBmbHlvdXQgZmlyc3RcclxuICAgIGlmICghbG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENsaWNrIHRoZSBsb29rdXAgYnV0dG9uIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBpZiAobG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgbG9va3VwQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODAwKTsgLy8gV2FpdCBmb3IgbG9va3VwIHRvIGxvYWRcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5kIHRoZSBsb29rdXAgcG9wdXAvZmx5b3V0XHJcbiAgICBjb25zdCBsb29rdXBQb3B1cCA9IGF3YWl0IHdhaXRGb3JMb29rdXBQb3B1cCgpO1xyXG4gICAgaWYgKCFsb29rdXBQb3B1cCkge1xyXG4gICAgICAgIGlmICghd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uc3VwcHJlc3NMb29rdXBXYXJuaW5ncykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ0xvb2t1cCBwb3B1cCBub3QgZm91bmQsIHRyeWluZyBkaXJlY3QgaW5wdXQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBhIGRvY2tlZCBsb29rdXAgZmx5b3V0IGV4aXN0cyAoc2VnbWVudGVkIGVudHJ5KSwgdHlwZSBpbnRvIGl0cyBmaWx0ZXIgaW5wdXRcclxuICAgIGNvbnN0IGRvY2sgPSBhd2FpdCB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQoZWxlbWVudCwgMTUwMCk7XHJcbiAgICBpZiAoZG9jaykge1xyXG4gICAgICAgIGNvbnN0IGRvY2tJbnB1dCA9IGZpbmRMb29rdXBGaWx0ZXJJbnB1dChkb2NrKTtcclxuICAgICAgICBpZiAoZG9ja0lucHV0KSB7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAgICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoZG9ja0lucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFR5cGUgdmFsdWUgaW4gdGhlIHNlYXJjaC9maWx0ZXIgZmllbGQgb2YgdGhlIGxvb2t1cFxyXG4gICAgY29uc3QgbG9va3VwSW5wdXQgPSBsb29rdXBQb3B1cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwidGV4dFwiXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmIChsb29rdXBJbnB1dCkge1xyXG4gICAgICAgIGxvb2t1cElucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGxvb2t1cElucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTsgLy8gV2FpdCBmb3Igc2VydmVyIGZpbHRlclxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5kIGFuZCBjbGljayB0aGUgbWF0Y2hpbmcgcm93XHJcbiAgICBjb25zdCByb3dzID0gYXdhaXQgd2FpdEZvckxvb2t1cFJvd3MobG9va3VwUG9wdXAsIGVsZW1lbnQsIDUwMDApO1xyXG4gICAgbGV0IGZvdW5kTWF0Y2ggPSBmYWxzZTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSByb3cudGV4dENvbnRlbnQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcclxuICAgICAgICBpZiAodGV4dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKSkpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImdyaWRjZWxsXCJdLCB0ZCcpO1xyXG4gICAgICAgICAgICAoY2VsbCB8fCByb3cpLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGZvdW5kTWF0Y2ggPSB0cnVlO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWZvdW5kTWF0Y2gpIHtcclxuICAgICAgICBjb25zdCBzYW1wbGUgPSBBcnJheS5mcm9tKHJvd3MpLnNsaWNlKDAsIDgpLm1hcChyID0+IHIudGV4dENvbnRlbnQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKSk7XHJcbiAgICAgICAgaWYgKCF3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzPy5zdXBwcmVzc0xvb2t1cFdhcm5pbmdzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignTm8gbWF0Y2hpbmcgbG9va3VwIHZhbHVlIGZvdW5kLCBjbG9zaW5nIHBvcHVwJywgeyB2YWx1ZSwgc2FtcGxlIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBUcnkgdG8gY2xvc2UgdGhlIHBvcHVwXHJcbiAgICAgICAgY29uc3QgY2xvc2VCdG4gPSBsb29rdXBQb3B1cC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJDbG9zZVwiXSwgLmNsb3NlLWJ1dHRvbicpO1xyXG4gICAgICAgIGlmIChjbG9zZUJ0bikgY2xvc2VCdG4uY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBkaXJlY3QgdHlwaW5nXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDb21ib0JveFZhbHVlKGVsZW1lbnQsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXSwgc2VsZWN0Jyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBDb21ib0JveCcpO1xyXG5cclxuICAgIC8vIElmIGl0J3MgYSBuYXRpdmUgc2VsZWN0LCB1c2Ugb3B0aW9uIHNlbGVjdGlvblxyXG4gICAgaWYgKGlucHV0LnRhZ05hbWUgPT09ICdTRUxFQ1QnKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmZyb20oaW5wdXQub3B0aW9ucyk7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gb3B0aW9ucy5maW5kKG9wdCA9PiBvcHQudGV4dC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuZmluZChvcHQgPT4gb3B0LnRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpKTtcclxuICAgICAgICBpZiAoIXRhcmdldCkgdGhyb3cgbmV3IEVycm9yKGBPcHRpb24gbm90IGZvdW5kOiAke3ZhbHVlfWApO1xyXG4gICAgICAgIGlucHV0LnZhbHVlID0gdGFyZ2V0LnZhbHVlO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBPcGVuIHRoZSBkcm9wZG93biAoYnV0dG9uIHByZWZlcnJlZClcclxuICAgIGNvbnN0IGNvbWJvQnV0dG9uID0gZmluZENvbWJvQm94QnV0dG9uKGVsZW1lbnQpO1xyXG4gICAgaWYgKGNvbWJvQnV0dG9uKSB7XHJcbiAgICAgICAgY29tYm9CdXR0b24uY2xpY2soKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcblxyXG4gICAgLy8gVHJ5IHR5cGluZyB0byBmaWx0ZXIgd2hlbiBhbGxvd2VkICh1c2Ugc2VsZWN0ZWQgaW5wdXQgbWV0aG9kKVxyXG4gICAgaWYgKCFpbnB1dC5yZWFkT25seSAmJiAhaW5wdXQuZGlzYWJsZWQpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBsaXN0Ym94IG5lYXIgdGhlIGZpZWxkIG9yIGxpbmtlZCB2aWEgYXJpYS1jb250cm9sc1xyXG4gICAgY29uc3QgbGlzdGJveCA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsaXN0Ym94KSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IHByZXNzIEVudGVyIHRvIGNvbW1pdCB0eXBlZCB2YWx1ZVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgb3B0aW9ucyA9IGNvbGxlY3RDb21ib09wdGlvbnMobGlzdGJveCk7XHJcbiAgICBjb25zdCBzZWFyY2ggPSBub3JtYWxpemVUZXh0KHZhbHVlKTtcclxuICAgIGxldCBtYXRjaGVkID0gZmFsc2U7XHJcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQob3B0aW9uLnRleHRDb250ZW50KTtcclxuICAgICAgICBpZiAodGV4dCA9PT0gc2VhcmNoIHx8IHRleHQuaW5jbHVkZXMoc2VhcmNoKSkge1xyXG4gICAgICAgICAgICAvLyBUcnkgdG8gbWFyayBzZWxlY3Rpb24gZm9yIEFSSUEtYmFzZWQgY29tYm9ib3hlc1xyXG4gICAgICAgICAgICBvcHRpb25zLmZvckVhY2gob3B0ID0+IG9wdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAnZmFsc2UnKSk7XHJcbiAgICAgICAgICAgIG9wdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAndHJ1ZScpO1xyXG4gICAgICAgICAgICBpZiAoIW9wdGlvbi5pZCkge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9uLmlkID0gYGQzNjVvcHRfJHtEYXRlLm5vdygpfV8ke01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwKX1gO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jywgb3B0aW9uLmlkKTtcclxuXHJcbiAgICAgICAgICAgIG9wdGlvbi5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcgfSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvblRleHQgPSBvcHRpb24udGV4dENvbnRlbnQudHJpbSgpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xpY2sgdGhlIG9wdGlvbiB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgZGlzcGF0Y2hDbGlja1NlcXVlbmNlKG9wdGlvbik7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhcHBsaWVkID0gYXdhaXQgd2FpdEZvcklucHV0VmFsdWUoaW5wdXQsIG9wdGlvblRleHQsIDgwMCk7XHJcbiAgICAgICAgICAgIGlmICghYXBwbGllZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gU29tZSBEMzY1IGNvbWJvcyBjb21taXQgb24ga2V5IHNlbGVjdGlvbiByYXRoZXIgdGhhbiBjbGlja1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gRm9yY2UgaW5wdXQgdmFsdWUgdXBkYXRlIGZvciBEMzY1IGNvbWJvYm94ZXNcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNDAwKTtcclxuICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZVRleHQoaW5wdXQudmFsdWUpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvblRleHQpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21taXRDb21ib1ZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIGlucHV0LnZhbHVlLCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wdGlvbiBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveChjb250cm9sTmFtZSwgY2hlY2tlZCkge1xyXG4gICAgY29uc3QgY29udGFpbmVyID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIGlmICghY29udGFpbmVyKSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogQ2hlY2tib3ggJHtjb250cm9sTmFtZX0gbm90IGZvdW5kYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBjaGVja2JveCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImNoZWNrYm94XCJdJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGNoZWNrYm94Py5jaGVja2VkIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ29uJyk7XHJcbiAgICBcclxuICAgIGlmIChjdXJyZW50U3RhdGUgIT09IGNoZWNrZWQpIHtcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGNoZWNrYm94IHx8IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdsYWJlbCwgYnV0dG9uJykgfHwgY29udGFpbmVyO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICB9XHJcbn1cclxuIiwgImltcG9ydCBEMzY1SW5zcGVjdG9yIGZyb20gJy4vaW5zcGVjdG9yL0QzNjVJbnNwZWN0b3IuanMnO1xyXG5pbXBvcnQgeyBsb2dTdGVwLCBzZW5kTG9nIH0gZnJvbSAnLi91dGlscy9sb2dnaW5nLmpzJztcbmltcG9ydCB7IHNsZWVwIH0gZnJvbSAnLi91dGlscy9hc3luYy5qcyc7XG5pbXBvcnQgeyBjb2VyY2VCb29sZWFuLCBub3JtYWxpemVUZXh0IH0gZnJvbSAnLi91dGlscy90ZXh0LmpzJztcbmltcG9ydCB7IE5hdmlnYXRpb25JbnRlcnJ1cHRFcnJvciB9IGZyb20gJy4vcnVudGltZS9lcnJvcnMuanMnO1xuaW1wb3J0IHsgZ2V0U3RlcEVycm9yQ29uZmlnLCBmaW5kTG9vcFBhaXJzLCBmaW5kSWZQYWlycyB9IGZyb20gJy4vcnVudGltZS9lbmdpbmUtdXRpbHMuanMnO1xuaW1wb3J0IHsgZXZhbHVhdGVDb25kaXRpb24gfSBmcm9tICcuL3J1bnRpbWUvY29uZGl0aW9ucy5qcyc7XG5pbXBvcnQgeyBjbGlja0VsZW1lbnQsIGFwcGx5R3JpZEZpbHRlciwgd2FpdFVudGlsQ29uZGl0aW9uLCBzZXRJbnB1dFZhbHVlLCBzZXRHcmlkQ2VsbFZhbHVlLCBzZXRMb29rdXBTZWxlY3RWYWx1ZSwgc2V0Q2hlY2tib3hWYWx1ZSwgbmF2aWdhdGVUb0Zvcm0sIGFjdGl2YXRlVGFiLCBhY3RpdmF0ZUFjdGlvblBhbmVUYWIsIGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uLCBjb25maWd1cmVRdWVyeUZpbHRlciwgY29uZmlndXJlQmF0Y2hQcm9jZXNzaW5nLCBjbG9zZURpYWxvZywgY29uZmlndXJlUmVjdXJyZW5jZSB9IGZyb20gJy4vc3RlcHMvYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCwgaXNFbGVtZW50VmlzaWJsZSB9IGZyb20gJy4vdXRpbHMvZG9tLmpzJztcblxuXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRJbmplY3RlZCh7IHdpbmRvd09iaiA9IGdsb2JhbFRoaXMud2luZG93LCBkb2N1bWVudE9iaiA9IGdsb2JhbFRoaXMuZG9jdW1lbnQsIGluc3BlY3RvckZhY3RvcnkgPSAoKSA9PiBuZXcgRDM2NUluc3BlY3RvcigpIH0gPSB7fSkge1xuICAgIGlmICghd2luZG93T2JqIHx8ICFkb2N1bWVudE9iaikge1xuICAgICAgICByZXR1cm4geyBzdGFydGVkOiBmYWxzZSwgcmVhc29uOiAnbWlzc2luZy13aW5kb3ctb3ItZG9jdW1lbnQnIH07XG4gICAgfVxuICAgIGNvbnN0IHdpbmRvdyA9IHdpbmRvd09iajtcbiAgICBjb25zdCBkb2N1bWVudCA9IGRvY3VtZW50T2JqO1xuICAgIGNvbnN0IG5hdmlnYXRvciA9IHdpbmRvd09iai5uYXZpZ2F0b3IgfHwgZ2xvYmFsVGhpcy5uYXZpZ2F0b3I7XG5cbiAgICB3aW5kb3cuRDM2NUluc3BlY3RvciA9IEQzNjVJbnNwZWN0b3I7XG5cbiAgICAvLyA9PT09PT0gSW5pdGlhbGl6ZSBhbmQgTGlzdGVuIGZvciBNZXNzYWdlcyA9PT09PT1cblxuICAgIC8vIFByZXZlbnQgZHVwbGljYXRlIGluaXRpYWxpemF0aW9uXG4gICAgaWYgKHdpbmRvdy5kMzY1SW5qZWN0ZWRTY3JpcHRMb2FkZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0QzNjUgaW5qZWN0ZWQgc2NyaXB0IGFscmVhZHkgbG9hZGVkLCBza2lwcGluZy4uLicpO1xuICAgICAgICByZXR1cm4geyBzdGFydGVkOiBmYWxzZSwgcmVhc29uOiAnYWxyZWFkeS1sb2FkZWQnIH07XG4gICAgfVxuXG4gICAgd2luZG93LmQzNjVJbmplY3RlZFNjcmlwdExvYWRlZCA9IHRydWU7XG5cbiAgICAvLyBDcmVhdGUgaW5zcGVjdG9yIGluc3RhbmNlXG4gICAgY29uc3QgaW5zcGVjdG9yID0gaW5zcGVjdG9yRmFjdG9yeSgpO1xuXHJcbiAgICAvLyA9PT09PT0gV29ya2Zsb3cgRXhlY3V0aW9uIEVuZ2luZSA9PT09PT1cclxuICAgIGxldCBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IHt9O1xyXG4gICAgd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzO1xyXG4gICAgbGV0IGN1cnJlbnRXb3JrZmxvdyA9IG51bGw7XHJcbiAgICBsZXQgZXhlY3V0aW9uQ29udHJvbCA9IHtcclxuICAgICAgICBpc1BhdXNlZDogZmFsc2UsXHJcbiAgICAgICAgaXNTdG9wcGVkOiBmYWxzZSxcclxuICAgICAgICBjdXJyZW50U3RlcEluZGV4OiAwLFxyXG4gICAgICAgIGN1cnJlbnRSb3dJbmRleDogMCxcclxuICAgICAgICB0b3RhbFJvd3M6IDAsXHJcbiAgICAgICAgY3VycmVudERhdGFSb3c6IG51bGwsXHJcbiAgICAgICAgcnVuT3B0aW9uczoge1xyXG4gICAgICAgICAgICBza2lwUm93czogMCxcclxuICAgICAgICAgICAgbGltaXRSb3dzOiAwLFxyXG4gICAgICAgICAgICBkcnlSdW46IGZhbHNlXHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBTaW5nbGUgdW5pZmllZCBtZXNzYWdlIGxpc3RlbmVyXHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xyXG4gICAgICAgIGlmIChldmVudC5zb3VyY2UgIT09IHdpbmRvdykgcmV0dXJuO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc2NvdmVyeSByZXF1ZXN0c1xyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X0RJU0NPVkVSX0VMRU1FTlRTJykge1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVGb3JtT25seSA9IGV2ZW50LmRhdGEuYWN0aXZlRm9ybU9ubHkgfHwgZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gaW5zcGVjdG9yLmRpc2NvdmVyRWxlbWVudHMoYWN0aXZlRm9ybU9ubHkpO1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVGb3JtID0gaW5zcGVjdG9yLmdldEFjdGl2ZUZvcm1OYW1lKCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9FTEVNRU5UU19ESVNDT1ZFUkVEJyxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnRzOiBlbGVtZW50cy5tYXAoZWwgPT4gKHtcclxuICAgICAgICAgICAgICAgICAgICAuLi5lbCxcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB1bmRlZmluZWQgLy8gUmVtb3ZlIERPTSByZWZlcmVuY2UgZm9yIHNlcmlhbGl6YXRpb25cclxuICAgICAgICAgICAgICAgIH0pKSxcclxuICAgICAgICAgICAgICAgIGFjdGl2ZUZvcm06IGFjdGl2ZUZvcm1cclxuICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUQVJUX1BJQ0tFUicpIHtcclxuICAgICAgICAgICAgaW5zcGVjdG9yLnN0YXJ0RWxlbWVudFBpY2tlcigoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgLy8gQWRkIGZvcm0gbmFtZSB0byBwaWNrZWQgZWxlbWVudFxyXG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBpbnNwZWN0b3IuZ2V0RWxlbWVudEZvcm1OYW1lKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7ZWxlbWVudC5jb250cm9sTmFtZX1cIl1gKSk7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X0VMRU1FTlRfUElDS0VEJyxcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB7IC4uLmVsZW1lbnQsIGZvcm1OYW1lIH1cclxuICAgICAgICAgICAgICAgIH0sICcqJyk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RPUF9QSUNLRVInKSB7XHJcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfRVhFQ1VURV9XT1JLRkxPVycpIHtcclxuICAgICAgICAgICAgZXhlY3V0ZVdvcmtmbG93KGV2ZW50LmRhdGEud29ya2Zsb3csIGV2ZW50LmRhdGEuZGF0YSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9OQVZfQlVUVE9OU19VUERBVEUnKSB7XHJcbiAgICAgICAgICAgIHVwZGF0ZU5hdkJ1dHRvbnMoZXZlbnQuZGF0YS5wYXlsb2FkKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRXhlY3V0aW9uIGNvbnRyb2xzXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfUEFVU0VfV09SS0ZMT1cnKSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9SRVNVTUVfV09SS0ZMT1cnKSB7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RPUF9XT1JLRkxPVycpIHtcclxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgbGV0IHBlbmRpbmdOYXZCdXR0b25zUGF5bG9hZCA9IG51bGw7XG4gICAgbGV0IG5hdkJ1dHRvbnNSZXRyeVRpbWVyID0gbnVsbDtcbiAgICBsZXQgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIgPSBudWxsO1xuXHJcbiAgICBmdW5jdGlvbiB1cGRhdGVOYXZCdXR0b25zKHBheWxvYWQpIHtcclxuICAgICAgICBwZW5kaW5nTmF2QnV0dG9uc1BheWxvYWQgPSBwYXlsb2FkIHx8IG51bGw7XHJcbiAgICAgICAgcmVuZGVyTmF2QnV0dG9ucygpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlbmRlck5hdkJ1dHRvbnMoKSB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBwZW5kaW5nTmF2QnV0dG9uc1BheWxvYWQ7XG4gICAgICAgIGlmICghcGF5bG9hZCkgcmV0dXJuO1xuXHJcbiAgICAgICAgY29uc3QgbmF2R3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmF2aWdhdGlvbk1haW5BY3Rpb25Hcm91cCcpO1xyXG4gICAgICAgIGlmICghbmF2R3JvdXApIHtcclxuICAgICAgICAgICAgaWYgKCFuYXZCdXR0b25zUmV0cnlUaW1lcikge1xyXG4gICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBuYXZCdXR0b25zUmV0cnlUaW1lciA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyTmF2QnV0dG9ucygpO1xyXG4gICAgICAgICAgICAgICAgfSwgMTAwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZXhpc3RpbmdDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInKTtcclxuICAgICAgICBpZiAoZXhpc3RpbmdDb250YWluZXIpIHtcclxuICAgICAgICAgICAgZXhpc3RpbmdDb250YWluZXIucmVtb3ZlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBidXR0b25zID0gQXJyYXkuaXNBcnJheShwYXlsb2FkLmJ1dHRvbnMpID8gcGF5bG9hZC5idXR0b25zIDogW107XHJcbiAgICAgICAgaWYgKCFidXR0b25zLmxlbmd0aCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBjdXJyZW50TWVudUl0ZW0gPSAocGF5bG9hZC5tZW51SXRlbSB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICAgICAgY29uc3QgdmlzaWJsZUJ1dHRvbnMgPSBidXR0b25zLmZpbHRlcigoYnV0dG9uKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lbnVJdGVtcyA9IEFycmF5LmlzQXJyYXkoYnV0dG9uLm1lbnVJdGVtcykgPyBidXR0b24ubWVudUl0ZW1zIDogW107XHJcbiAgICAgICAgICAgIGlmICghbWVudUl0ZW1zLmxlbmd0aCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIGlmICghY3VycmVudE1lbnVJdGVtKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybiBtZW51SXRlbXMuc29tZSgoaXRlbSkgPT4gKGl0ZW0gfHwgJycpLnRvTG93ZXJDYXNlKCkgPT09IGN1cnJlbnRNZW51SXRlbSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICghdmlzaWJsZUJ1dHRvbnMubGVuZ3RoKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBjb250YWluZXIuaWQgPSAnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgY29udGFpbmVyLnN0eWxlLmdhcCA9ICc2cHgnO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgICAgICBjb250YWluZXIuc3R5bGUubWFyZ2luUmlnaHQgPSAnNnB4JztcblxuICAgICAgICBjb25zdCBydW5CdXR0b25Xb3JrZmxvdyA9IGFzeW5jIChidXR0b25Db25maWcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtmbG93ID0gYnV0dG9uQ29uZmlnLndvcmtmbG93O1xuICAgICAgICAgICAgaWYgKCF3b3JrZmxvdykge1xuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFdvcmtmbG93IG5vdCBmb3VuZCBmb3IgbmF2IGJ1dHRvbjogJHtidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcuaWR9YCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHdvcmtmbG93LmRhdGFTb3VyY2VzPy5wcmltYXJ5Py5kYXRhIHx8IHdvcmtmbG93LmRhdGFTb3VyY2U/LmRhdGEgfHwgW107XG4gICAgICAgICAgICBleGVjdXRlV29ya2Zsb3cod29ya2Zsb3csIGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGNyZWF0ZVN0eWxlZEJ1dHRvbiA9IChsYWJlbCwgdGl0bGUgPSAnJykgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLXNlYXJjaCc7XG4gICAgICAgICAgICBidXR0b25FbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgICAgICAgICAgYnV0dG9uRWwudGl0bGUgPSB0aXRsZTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmhlaWdodCA9ICcyNHB4JztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLnBhZGRpbmcgPSAnMCA4cHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzRweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4zNSknO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMTIpJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmNvbG9yID0gJyNmZmZmZmYnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5saW5lSGVpZ2h0ID0gJzIycHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUud2hpdGVTcGFjZSA9ICdub3dyYXAnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtZmxleCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdjZW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm94U2hhZG93ID0gJ2luc2V0IDAgMCAwIDFweCByZ2JhKDI1NSwyNTUsMjU1LDAuMDgpJztcbiAgICAgICAgICAgIHJldHVybiBidXR0b25FbDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjbG9zZUFsbEdyb3VwTWVudXMgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudV0nKS5mb3JFYWNoKChtZW51KSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc3RhbmRhbG9uZUJ1dHRvbnMgPSBbXTtcbiAgICAgICAgY29uc3QgZ3JvdXBlZEJ1dHRvbnMgPSBuZXcgTWFwKCk7XG5cbiAgICAgICAgdmlzaWJsZUJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBncm91cE5hbWUgPSAoYnV0dG9uQ29uZmlnLmdyb3VwIHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoIWdyb3VwTmFtZSkge1xuICAgICAgICAgICAgICAgIHN0YW5kYWxvbmVCdXR0b25zLnB1c2goYnV0dG9uQ29uZmlnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWdyb3VwZWRCdXR0b25zLmhhcyhncm91cE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuc2V0KGdyb3VwTmFtZSwgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuZ2V0KGdyb3VwTmFtZSkucHVzaChidXR0b25Db25maWcpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdGFuZGFsb25lQnV0dG9ucy5mb3JFYWNoKChidXR0b25Db25maWcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbldyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGJ1dHRvbldyYXBwZXIuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItY29tcGFueSBuYXZpZ2F0aW9uQmFyLXBpbm5lZEVsZW1lbnQnO1xuXG4gICAgICAgICAgICBjb25zdCBidXR0b25FbCA9IGNyZWF0ZVN0eWxlZEJ1dHRvbihidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdycsIGJ1dHRvbkNvbmZpZy5uYW1lIHx8ICcnKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1idXR0b24taWQnLCBidXR0b25Db25maWcuaWQgfHwgJycpO1xuICAgICAgICAgICAgYnV0dG9uRWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpKTtcblxuICAgICAgICAgICAgYnV0dG9uV3JhcHBlci5hcHBlbmRDaGlsZChidXR0b25FbCk7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoYnV0dG9uV3JhcHBlcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEFycmF5LmZyb20oZ3JvdXBlZEJ1dHRvbnMuZW50cmllcygpKVxuICAgICAgICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpXG4gICAgICAgICAgICAuZm9yRWFjaCgoW2dyb3VwTmFtZSwgZ3JvdXBJdGVtc10pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cFdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICBncm91cFdyYXBwZXIuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItY29tcGFueSBuYXZpZ2F0aW9uQmFyLXBpbm5lZEVsZW1lbnQnO1xuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEJ1dHRvbiA9IGNyZWF0ZVN0eWxlZEJ1dHRvbihgJHtncm91cE5hbWV9IFxcdTI1QkVgLCBncm91cE5hbWUpO1xuICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1ncm91cCcsIGdyb3VwTmFtZSk7XG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYm9yZGVyQ29sb3IgPSAncmdiYSgyNTUsMjU1LDI1NSwwLjU1KSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMiknO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBNZW51ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1ncm91cC1tZW51JywgZ3JvdXBOYW1lKTtcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS50b3AgPSAnMjhweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmxlZnQgPSAnMCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLm1pbldpZHRoID0gJzIzMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUubWF4V2lkdGggPSAnMzIwcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5tYXhIZWlnaHQgPSAnMzIwcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5vdmVyZmxvd1kgPSAnYXV0byc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJhY2tncm91bmQgPSAnI2ZjZmRmZic7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgcmdiYSgzMCw0MSw1OSwwLjE2KSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJvcmRlclJhZGl1cyA9ICcxMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuYm94U2hhZG93ID0gJzAgMTRweCAyOHB4IHJnYmEoMCwwLDAsMC4yOCknO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5wYWRkaW5nID0gJzhweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLnpJbmRleCA9ICcyMTQ3NDgzMDAwJztcblxuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwSGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIudGV4dENvbnRlbnQgPSBncm91cE5hbWU7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuZm9udFNpemUgPSAnMTFweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuZm9udFdlaWdodCA9ICc3MDAnO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmNvbG9yID0gJyM0NzU1NjknO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLm1hcmdpbiA9ICcwIDJweCA2cHggMnB4JztcbiAgICAgICAgICAgICAgICBncm91cEhlYWRlci5zdHlsZS5wYWRkaW5nQm90dG9tID0gJzZweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCAjZTJlOGYwJztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuYXBwZW5kQ2hpbGQoZ3JvdXBIZWFkZXIpO1xuXG4gICAgICAgICAgICAgICAgZ3JvdXBJdGVtc1xuICAgICAgICAgICAgICAgICAgICAuc2xpY2UoKVxuICAgICAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gKGEubmFtZSB8fCAnJykubG9jYWxlQ29tcGFyZShiLm5hbWUgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICAuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVtQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24udGV4dENvbnRlbnQgPSBidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnRpdGxlID0gYnV0dG9uQ29uZmlnLm5hbWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudGV4dEFsaWduID0gJ2xlZnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5ib3JkZXIgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jb2xvciA9ICcjMWYyOTM3JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYm9yZGVyUmFkaXVzID0gJzRweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLnBhZGRpbmcgPSAnOHB4IDlweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmZvbnRTaXplID0gJzEycHgnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmxpbmVIZWlnaHQgPSAnMS4zJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUubWFyZ2luQm90dG9tID0gJzNweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudHJhbnNpdGlvbiA9ICdiYWNrZ3JvdW5kIC4xNXMgZWFzZSwgY29sb3IgLjE1cyBlYXNlJztcblxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICcjZThlZGZmJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZTNhOGEnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZjI5MzcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbG9zZUFsbEdyb3VwTWVudXMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwTWVudS5hcHBlbmRDaGlsZChpdGVtQnV0dG9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBncm91cEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNPcGVuID0gZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPT09ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGNsb3NlQWxsR3JvdXBNZW51cygpO1xuICAgICAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuZGlzcGxheSA9IGlzT3BlbiA/ICdub25lJyA6ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSBpc09wZW4gPyAncmdiYSgyNTUsMjU1LDI1NSwwLjIpJyA6ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMzIpJztcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5hcHBlbmRDaGlsZChncm91cEJ1dHRvbik7XG4gICAgICAgICAgICAgICAgZ3JvdXBXcmFwcGVyLmFwcGVuZENoaWxkKGdyb3VwTWVudSk7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwV3JhcHBlcik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICBuYXZHcm91cC5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBuYXZHcm91cC5maXJzdENoaWxkKTtcblxuICAgICAgICBpZiAobmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInKTtcbiAgICAgICAgICAgIGlmICghYWN0aXZlIHx8IGFjdGl2ZS5jb250YWlucyhldmVudC50YXJnZXQpKSByZXR1cm47XG4gICAgICAgICAgICBhY3RpdmUucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudV0nKS5mb3JFYWNoKChtZW51KSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xuICAgIH1cblxyXG4gICAgLy8gSGVscGVyIHRvIGNoZWNrIGFuZCB3YWl0IGZvciBwYXVzZS9zdG9wXHJcbiAgICBhc3luYyBmdW5jdGlvbiBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKSB7XHJcbiAgICBpZiAoZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dvcmtmbG93IHN0b3BwZWQgYnkgdXNlcicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB3aGlsZSAoZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCkge1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgaWYgKGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignV29ya2Zsb3cgc3RvcHBlZCBieSB1c2VyJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlV29ya2Zsb3cod29ya2Zsb3csIGRhdGEpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgLy8gQ2xlYXIgYW55IHN0YWxlIHBlbmRpbmcgbmF2aWdhdGlvbiBzdGF0ZSBiZWZvcmUgc3RhcnRpbmcgYSBuZXcgcnVuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbSgnZDM2NV9wZW5kaW5nX3dvcmtmbG93Jyk7XHJcbiAgICAgICAgICAgIGlmICh3b3JrZmxvdz8uaWQpIHtcclxuICAgICAgICAgICAgICAgIHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oJ2QzNjVfYWN0aXZlX3dvcmtmbG93X2lkJywgd29ya2Zsb3cuaWQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAvLyBJZ25vcmUgc2Vzc2lvblN0b3JhZ2UgZXJyb3JzIChlLmcuLCBpbiByZXN0cmljdGVkIGNvbnRleHRzKVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc2VuZExvZygnaW5mbycsIGBTdGFydGluZyB3b3JrZmxvdzogJHt3b3JrZmxvdz8ubmFtZSB8fCB3b3JrZmxvdz8uaWQgfHwgJ3VubmFtZWQnfWApO1xyXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHsgcGhhc2U6ICd3b3JrZmxvd1N0YXJ0Jywgd29ya2Zsb3c6IHdvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB9IH0sICcqJyk7XHJcbiAgICAgICAgLy8gUmVzZXQgZXhlY3V0aW9uIGNvbnRyb2xcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XHJcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQgPSBmYWxzZTtcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnMgPSB3b3JrZmxvdy5ydW5PcHRpb25zIHx8IHsgc2tpcFJvd3M6IDAsIGxpbWl0Um93czogMCwgZHJ5UnVuOiBmYWxzZSB9O1xyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0ID0gd29ya2Zsb3c/Ll9vcmlnaW5hbFN0YXJ0SW5kZXggfHwgMDtcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnRTdGVwSW5kZXggPSBleGVjdXRpb25Db250cm9sLnN0ZXBJbmRleE9mZnNldDtcclxuICAgICAgICBjdXJyZW50V29ya2Zsb3cgPSB3b3JrZmxvdztcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHdheXMgcmVmcmVzaCBvcmlnaW5hbC13b3JrZmxvdyBwb2ludGVyIHRvIGF2b2lkIHN0YWxlIHJlc3VtZSBzdGF0ZVxuICAgICAgICAvLyBmcm9tIGEgcHJldmlvdXNseSBleGVjdXRlZCB3b3JrZmxvdyBpbiB0aGUgc2FtZSBwYWdlIGNvbnRleHQuXG4gICAgICAgIHdpbmRvdy5kMzY1T3JpZ2luYWxXb3JrZmxvdyA9IHdvcmtmbG93Py5fb3JpZ2luYWxXb3JrZmxvdyB8fCB3b3JrZmxvdztcbiAgICAgICAgXHJcbiAgICAgICAgY3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSB3b3JrZmxvdz8uc2V0dGluZ3MgfHwge307XHJcbiAgICAgICAgd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzO1xyXG4gICAgICAgIC8vIEV4cG9zZSBjdXJyZW50IHdvcmtmbG93IGFuZCBleGVjdXRpb24gY29udHJvbCB0byBpbmplY3RlZCBhY3Rpb24gbW9kdWxlc1xyXG4gICAgICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93ID0gY3VycmVudFdvcmtmbG93O1xyXG4gICAgICAgIHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbCA9IGV4ZWN1dGlvbkNvbnRyb2w7XHJcbiAgICAgICAgY29uc3Qgc3RlcHMgPSB3b3JrZmxvdy5zdGVwcztcclxuICAgICAgICBcclxuICAgICAgICAvLyBHZXQgZGF0YSBmcm9tIG5ldyBkYXRhU291cmNlcyBzdHJ1Y3R1cmUgb3IgbGVnYWN5IGRhdGFTb3VyY2VcclxuICAgICAgICBsZXQgcHJpbWFyeURhdGEgPSBbXTtcclxuICAgICAgICBsZXQgZGV0YWlsU291cmNlcyA9IHt9O1xyXG4gICAgICAgIGxldCByZWxhdGlvbnNoaXBzID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHdvcmtmbG93LmRhdGFTb3VyY2VzKSB7XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gd29ya2Zsb3cuZGF0YVNvdXJjZXMucHJpbWFyeT8uZGF0YSB8fCBbXTtcclxuICAgICAgICAgICAgcmVsYXRpb25zaGlwcyA9IHdvcmtmbG93LmRhdGFTb3VyY2VzLnJlbGF0aW9uc2hpcHMgfHwgW107XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBJbmRleCBkZXRhaWwgZGF0YSBzb3VyY2VzIGJ5IElEXHJcbiAgICAgICAgICAgICh3b3JrZmxvdy5kYXRhU291cmNlcy5kZXRhaWxzIHx8IFtdKS5mb3JFYWNoKGRldGFpbCA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZGV0YWlsLmRhdGEpIHtcclxuICAgICAgICAgICAgICAgICAgICBkZXRhaWxTb3VyY2VzW2RldGFpbC5pZF0gPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IGRldGFpbC5kYXRhLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBkZXRhaWwubmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmllbGRzOiBkZXRhaWwuZmllbGRzXHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChkYXRhKSB7XHJcbiAgICAgICAgICAgIC8vIExlZ2FjeSBmb3JtYXRcclxuICAgICAgICAgICAgcHJpbWFyeURhdGEgPSBBcnJheS5pc0FycmF5KGRhdGEpID8gZGF0YSA6IFtkYXRhXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSWYgbm8gZGF0YSwgdXNlIGEgc2luZ2xlIGVtcHR5IHJvdyB0byBydW4gc3RlcHMgb25jZVxyXG4gICAgICAgIGlmIChwcmltYXJ5RGF0YS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcHJpbWFyeURhdGEgPSBbe31dO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRXhlY3V0ZSB3b3JrZmxvdyB3aXRoIGxvb3Agc3VwcG9ydFxyXG4gICAgICAgIGF3YWl0IGV4ZWN1dGVTdGVwc1dpdGhMb29wcyhzdGVwcywgcHJpbWFyeURhdGEsIGRldGFpbFNvdXJjZXMsIHJlbGF0aW9uc2hpcHMsIHdvcmtmbG93LnNldHRpbmdzKTtcclxuXHJcbiAgICAgICAgc2VuZExvZygnaW5mbycsIGBXb3JrZmxvdyBjb21wbGV0ZTogcHJvY2Vzc2VkICR7cHJpbWFyeURhdGEubGVuZ3RofSByb3dzYCk7XHJcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfQ09NUExFVEUnLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHsgcHJvY2Vzc2VkOiBwcmltYXJ5RGF0YS5sZW5ndGggfVxyXG4gICAgICAgIH0sICcqJyk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIC8vIE5hdmlnYXRpb24gaW50ZXJydXB0cyBhcmUgbm90IGVycm9ycyAtIHRoZSB3b3JrZmxvdyB3aWxsIHJlc3VtZSBhZnRlciBwYWdlIGxvYWRcclxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCAnV29ya2Zsb3cgcGF1c2VkIGZvciBuYXZpZ2F0aW9uIC0gd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkcycpO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIERvbid0IHJlcG9ydCBhcyBlcnJvciBvciBjb21wbGV0ZVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWVycm9yIHx8ICFlcnJvci5fcmVwb3J0ZWQpIHtcclxuICAgICAgICAgICAgc2VuZExvZygnZXJyb3InLCBgV29ya2Zsb3cgZXJyb3I6ICR7ZXJyb3I/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycm9yKX1gKTtcclxuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0VSUk9SJyxcclxuICAgICAgICAgICAgICAgIGVycm9yOiBlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpLFxyXG4gICAgICAgICAgICAgICAgc3RhY2s6IGVycm9yPy5zdGFja1xyXG4gICAgICAgICAgICB9LCAnKicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVN0ZXBWYWx1ZShzdGVwLCBjdXJyZW50Um93KSB7XG4gICAgY29uc3Qgc291cmNlID0gc3RlcD8udmFsdWVTb3VyY2UgfHwgKHN0ZXA/LmZpZWxkTWFwcGluZyA/ICdkYXRhJyA6ICdzdGF0aWMnKTtcclxuXHJcbiAgICBpZiAoc291cmNlID09PSAnY2xpcGJvYXJkJykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmICghbmF2aWdhdG9yLmNsaXBib2FyZD8ucmVhZFRleHQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2xpcGJvYXJkIEFQSSBub3QgYXZhaWxhYmxlJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQucmVhZFRleHQoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHQgPz8gJyc7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgc2VuZExvZygnZXJyb3InLCBgQ2xpcGJvYXJkIHJlYWQgZmFpbGVkOiAke2Vycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2xpcGJvYXJkIHJlYWQgZmFpbGVkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChzb3VyY2UgPT09ICdkYXRhJykge1xyXG4gICAgICAgIGNvbnN0IHJvdyA9IGN1cnJlbnRSb3cgfHwgd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50RGF0YVJvdyB8fCB7fTtcclxuICAgICAgICBjb25zdCBmaWVsZCA9IHN0ZXA/LmZpZWxkTWFwcGluZyB8fCAnJztcclxuICAgICAgICBpZiAoIWZpZWxkKSByZXR1cm4gJyc7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSByb3dbZmllbGRdO1xyXG4gICAgICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xyXG4gICAgfVxyXG5cbiAgICByZXR1cm4gc3RlcD8udmFsdWUgPz8gJyc7XG59XG5cbi8vIEV4ZWN1dGUgYSBzaW5nbGUgc3RlcCAobWFwcyBzdGVwLnR5cGUgdG8gYWN0aW9uIGZ1bmN0aW9ucylcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTaW5nbGVTdGVwKHN0ZXAsIHN0ZXBJbmRleCwgY3VycmVudFJvdywgZGV0YWlsU291cmNlcywgc2V0dGluZ3MsIGRyeVJ1bikge1xuICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleCA9IHR5cGVvZiBzdGVwLl9hYnNvbHV0ZUluZGV4ID09PSAnbnVtYmVyJ1xyXG4gICAgICAgID8gc3RlcC5fYWJzb2x1dGVJbmRleFxyXG4gICAgICAgIDogKGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0IHx8IDApICsgc3RlcEluZGV4O1xyXG4gICAgY29uc3Qgc3RlcExhYmVsID0gc3RlcC5kaXNwbGF5VGV4dCB8fCBzdGVwLmNvbnRyb2xOYW1lIHx8IHN0ZXAudHlwZSB8fCBgc3RlcCAke3N0ZXBJbmRleH1gO1xyXG4gICAgLy8gQ29tcHV0ZSBhYnNvbHV0ZSBzdGVwIGluZGV4IChhbHJlYWR5IHN0b3JlZCBvbiBleGVjdXRpb25Db250cm9sKVxyXG4gICAgY29uc3QgYWJzb2x1dGVTdGVwSW5kZXggPSBleGVjdXRpb25Db250cm9sLmN1cnJlbnRTdGVwSW5kZXg7XHJcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcclxuICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBTdGFydCcsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxyXG4gICAgfSwgJyonKTtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgLy8gTm9ybWFsaXplIHN0ZXAgdHlwZSAoYWxsb3cgYm90aCBjYW1lbENhc2UgYW5kIGRhc2gtc2VwYXJhdGVkIHR5cGVzKVxyXG4gICAgICAgIGNvbnN0IHN0ZXBUeXBlID0gKHN0ZXAudHlwZSB8fCAnJykucmVwbGFjZSgvLShbYS16XSkvZywgKF8sIGMpID0+IGMudG9VcHBlckNhc2UoKSk7XHJcbiAgICAgICAgbG9nU3RlcChgU3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX06ICR7c3RlcFR5cGV9IC0+ICR7c3RlcExhYmVsfWApO1xyXG5cclxuICAgICAgICAvLyBSZXNwZWN0IGRyeSBydW4gbW9kZVxyXG4gICAgICAgIGlmIChkcnlSdW4pIHtcclxuICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBEcnkgcnVuIC0gc2tpcHBpbmcgYWN0aW9uOiAke3N0ZXAudHlwZX0gJHtzdGVwLmNvbnRyb2xOYW1lIHx8ICcnfWApO1xyXG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxyXG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwRG9uZScsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxyXG4gICAgICAgICAgICB9LCAnKicpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgcmVzb2x2ZWRWYWx1ZSA9IG51bGw7XHJcbiAgICAgICAgaWYgKFsnaW5wdXQnLCAnc2VsZWN0JywgJ2xvb2t1cFNlbGVjdCcsICdncmlkSW5wdXQnLCAnZmlsdGVyJywgJ3F1ZXJ5RmlsdGVyJ10uaW5jbHVkZXMoc3RlcFR5cGUpKSB7XHJcbiAgICAgICAgICAgIHJlc29sdmVkVmFsdWUgPSBhd2FpdCByZXNvbHZlU3RlcFZhbHVlKHN0ZXAsIGN1cnJlbnRSb3cpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgd2FpdFRhcmdldCA9IHN0ZXAud2FpdFRhcmdldENvbnRyb2xOYW1lIHx8IHN0ZXAuY29udHJvbE5hbWUgfHwgJyc7XHJcbiAgICAgICAgY29uc3Qgc2hvdWxkV2FpdEJlZm9yZSA9ICEhc3RlcC53YWl0VW50aWxWaXNpYmxlO1xyXG4gICAgICAgIGNvbnN0IHNob3VsZFdhaXRBZnRlciA9ICEhc3RlcC53YWl0VW50aWxIaWRkZW47XHJcblxyXG4gICAgICAgIGlmICgoc2hvdWxkV2FpdEJlZm9yZSB8fCBzaG91bGRXYWl0QWZ0ZXIpICYmICF3YWl0VGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgV2FpdCBvcHRpb24gc2V0IGJ1dCBubyBjb250cm9sIG5hbWUgb24gc3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX1gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChzaG91bGRXYWl0QmVmb3JlICYmIHdhaXRUYXJnZXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICd2aXNpYmxlJywgbnVsbCwgNTAwMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHN0ZXBUeXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NsaWNrJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGNsaWNrRWxlbWVudChzdGVwLmNvbnRyb2xOYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnaW5wdXQnOlxyXG4gICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlLCBzdGVwLmZpZWxkVHlwZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2xvb2t1cFNlbGVjdCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRMb29rdXBTZWxlY3RWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnY2hlY2tib3gnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0Q2hlY2tib3hWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCBjb2VyY2VCb29sZWFuKHN0ZXAudmFsdWUpKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnZ3JpZElucHV0JzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNldEdyaWRDZWxsVmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWVsZFR5cGUsICEhc3RlcC53YWl0Rm9yVmFsaWRhdGlvbik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2ZpbHRlcic6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBhcHBseUdyaWRGaWx0ZXIoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWx0ZXJNZXRob2QgfHwgJ2lzIGV4YWN0bHknKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdxdWVyeUZpbHRlcic6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjb25maWd1cmVRdWVyeUZpbHRlcihzdGVwLnRhYmxlTmFtZSwgc3RlcC5maWVsZE5hbWUsIHJlc29sdmVkVmFsdWUsIHtcclxuICAgICAgICAgICAgICAgICAgICBzYXZlZFF1ZXJ5OiBzdGVwLnNhdmVkUXVlcnksXHJcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VEaWFsb2dBZnRlcjogc3RlcC5jbG9zZURpYWxvZ0FmdGVyXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnd2FpdCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcChOdW1iZXIoc3RlcC5kdXJhdGlvbikgfHwgNTAwKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnd2FpdFVudGlsJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbihcclxuICAgICAgICAgICAgICAgICAgICBzdGVwLmNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAud2FpdENvbmRpdGlvbiB8fCAndmlzaWJsZScsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RlcC53YWl0VmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RlcC50aW1lb3V0IHx8IDEwMDAwXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICduYXZpZ2F0ZSc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBuYXZpZ2F0ZVRvRm9ybShzdGVwKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnYWN0aXZhdGVUYWInOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFjdGl2YXRlVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAndGFiTmF2aWdhdGUnOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFjdGl2YXRlVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYWN0aW9uUGFuZVRhYic6XG4gICAgICAgICAgICAgICAgYXdhaXQgYWN0aXZhdGVBY3Rpb25QYW5lVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXHJcbiAgICAgICAgICAgIGNhc2UgJ2V4cGFuZFNlY3Rpb24nOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oc3RlcC5jb250cm9sTmFtZSwgJ2V4cGFuZCcpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdjb2xsYXBzZVNlY3Rpb24nOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oc3RlcC5jb250cm9sTmFtZSwgJ2NvbGxhcHNlJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2Nsb3NlRGlhbG9nJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHN0ZXAgdHlwZTogJHtzdGVwLnR5cGV9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc2hvdWxkV2FpdEFmdGVyICYmIHdhaXRUYXJnZXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICdoaWRkZW4nLCBudWxsLCA1MDAwKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcclxuICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwRG9uZScsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxyXG4gICAgICAgIH0sICcqJyk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAvLyBSZS10aHJvdyBuYXZpZ2F0aW9uIGludGVycnVwdHMgZm9yIHVwc3RyZWFtIGhhbmRsaW5nXHJcbiAgICAgICAgaWYgKGVyciAmJiBlcnIuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB0aHJvdyBlcnI7XHJcbiAgICAgICAgc2VuZExvZygnZXJyb3InLCBgRXJyb3IgZXhlY3V0aW5nIHN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9OiAke2Vycj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyKX1gKTtcclxuICAgICAgICB0aHJvdyBlcnI7XHJcbiAgICB9XHJcbn1cclxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVN0ZXBzV2l0aExvb3BzKHN0ZXBzLCBwcmltYXJ5RGF0YSwgZGV0YWlsU291cmNlcywgcmVsYXRpb25zaGlwcywgc2V0dGluZ3MpIHtcclxuICAgIC8vIEFwcGx5IHNraXAvbGltaXQgcm93cyBmcm9tIHJ1biBvcHRpb25zXHJcbiAgICBjb25zdCB7IHNraXBSb3dzID0gMCwgbGltaXRSb3dzID0gMCwgZHJ5UnVuID0gZmFsc2UgfSA9IGV4ZWN1dGlvbkNvbnRyb2wucnVuT3B0aW9ucztcclxuICAgIFxyXG4gICAgY29uc3Qgb3JpZ2luYWxUb3RhbFJvd3MgPSBwcmltYXJ5RGF0YS5sZW5ndGg7XHJcbiAgICBsZXQgc3RhcnRSb3dOdW1iZXIgPSAwOyAvLyBUaGUgc3RhcnRpbmcgcm93IG51bWJlciBmb3IgZGlzcGxheVxyXG4gICAgXHJcbiAgICBpZiAoc2tpcFJvd3MgPiAwKSB7XHJcbiAgICAgICAgcHJpbWFyeURhdGEgPSBwcmltYXJ5RGF0YS5zbGljZShza2lwUm93cyk7XHJcbiAgICAgICAgc3RhcnRSb3dOdW1iZXIgPSBza2lwUm93cztcclxuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFNraXBwZWQgZmlyc3QgJHtza2lwUm93c30gcm93c2ApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAobGltaXRSb3dzID4gMCAmJiBwcmltYXJ5RGF0YS5sZW5ndGggPiBsaW1pdFJvd3MpIHtcclxuICAgICAgICBwcmltYXJ5RGF0YSA9IHByaW1hcnlEYXRhLnNsaWNlKDAsIGxpbWl0Um93cyk7XHJcbiAgICAgICAgc2VuZExvZygnaW5mbycsIGBMaW1pdGVkIHRvICR7bGltaXRSb3dzfSByb3dzYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IHRvdGFsUm93c1RvUHJvY2VzcyA9IHByaW1hcnlEYXRhLmxlbmd0aDtcbiAgICBleGVjdXRpb25Db250cm9sLnRvdGFsUm93cyA9IG9yaWdpbmFsVG90YWxSb3dzO1xuICAgIFxuICAgIC8vIEZpbmQgbG9vcCBzdHJ1Y3R1cmVzXG4gICAgY29uc3QgbG9vcFBhaXJzID0gZmluZExvb3BQYWlycyhzdGVwcywgKG1lc3NhZ2UpID0+IHNlbmRMb2coJ2Vycm9yJywgbWVzc2FnZSkpO1xuICAgIGNvbnN0IGlmUGFpcnMgPSBmaW5kSWZQYWlycyhzdGVwcywgKG1lc3NhZ2UpID0+IHNlbmRMb2coJ2Vycm9yJywgbWVzc2FnZSkpO1xuICAgIGNvbnN0IGxhYmVsTWFwID0gbmV3IE1hcCgpO1xuICAgIHN0ZXBzLmZvckVhY2goKHN0ZXAsIGluZGV4KSA9PiB7XG4gICAgICAgIGlmIChzdGVwPy50eXBlID09PSAnbGFiZWwnICYmIHN0ZXAubGFiZWxOYW1lKSB7XG4gICAgICAgICAgICBsYWJlbE1hcC5zZXQoc3RlcC5sYWJlbE5hbWUsIGluZGV4KTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSWYgbm8gbG9vcHMsIGV4ZWN1dGUgYWxsIHN0ZXBzIGZvciBlYWNoIHByaW1hcnkgZGF0YSByb3cgKGxlZ2FjeSBiZWhhdmlvcilcbiAgICBpZiAobG9vcFBhaXJzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBmb3IgKGxldCByb3dJbmRleCA9IDA7IHJvd0luZGV4IDwgcHJpbWFyeURhdGEubGVuZ3RoOyByb3dJbmRleCsrKSB7XG4gICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTsgLy8gQ2hlY2sgZm9yIHBhdXNlL3N0b3BcblxuICAgICAgICAgICAgY29uc3Qgcm93ID0gcHJpbWFyeURhdGFbcm93SW5kZXhdO1xuICAgICAgICAgICAgY29uc3QgZGlzcGxheVJvd051bWJlciA9IHN0YXJ0Um93TnVtYmVyICsgcm93SW5kZXg7IC8vIEFjdHVhbCByb3cgbnVtYmVyIGluIG9yaWdpbmFsIGRhdGFcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFJvd0luZGV4ID0gZGlzcGxheVJvd051bWJlcjtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudERhdGFSb3cgPSByb3c7XG5cbiAgICAgICAgICAgIGNvbnN0IHJvd1Byb2dyZXNzID0ge1xuICAgICAgICAgICAgICAgIHBoYXNlOiAncm93U3RhcnQnLFxuICAgICAgICAgICAgICAgIHJvdzogZGlzcGxheVJvd051bWJlcixcbiAgICAgICAgICAgICAgICB0b3RhbFJvd3M6IG9yaWdpbmFsVG90YWxSb3dzLFxuICAgICAgICAgICAgICAgIHByb2Nlc3NlZFJvd3M6IHJvd0luZGV4ICsgMSxcbiAgICAgICAgICAgICAgICB0b3RhbFRvUHJvY2VzczogdG90YWxSb3dzVG9Qcm9jZXNzLFxuICAgICAgICAgICAgICAgIHN0ZXA6ICdQcm9jZXNzaW5nIHJvdydcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFByb2Nlc3Npbmcgcm93ICR7ZGlzcGxheVJvd051bWJlciArIDF9LyR7b3JpZ2luYWxUb3RhbFJvd3N9YCk7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiByb3dQcm9ncmVzcyB9LCAnKicpO1xuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoMCwgc3RlcHMubGVuZ3RoLCByb3cpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJykge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTG9vcCBjb250cm9sIHNpZ25hbCB1c2VkIG91dHNpZGUgb2YgYSBsb29wJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxyXG4gICAgY29uc3QgbG9vcFBhaXJNYXAgPSBuZXcgTWFwKGxvb3BQYWlycy5tYXAocGFpciA9PiBbcGFpci5zdGFydEluZGV4LCBwYWlyLmVuZEluZGV4XSkpO1xyXG4gICAgY29uc3QgaW5pdGlhbERhdGFSb3cgPSBwcmltYXJ5RGF0YVswXSB8fCB7fTtcclxuXHJcbiAgICBjb25zdCByZXNvbHZlTG9vcERhdGEgPSAobG9vcERhdGFTb3VyY2UsIGN1cnJlbnREYXRhUm93KSA9PiB7XG4gICAgICAgIGxldCBsb29wRGF0YSA9IHByaW1hcnlEYXRhO1xuXG4gICAgICAgIGlmIChsb29wRGF0YVNvdXJjZSAhPT0gJ3ByaW1hcnknICYmIGRldGFpbFNvdXJjZXNbbG9vcERhdGFTb3VyY2VdKSB7XG4gICAgICAgICAgICBjb25zdCBkZXRhaWxTb3VyY2UgPSBkZXRhaWxTb3VyY2VzW2xvb3BEYXRhU291cmNlXTtcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uc0ZvckRldGFpbCA9IChyZWxhdGlvbnNoaXBzIHx8IFtdKS5maWx0ZXIociA9PiByLmRldGFpbElkID09PSBsb29wRGF0YVNvdXJjZSk7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aW9uc0ZvckRldGFpbC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBsb29wRGF0YSA9IGRldGFpbFNvdXJjZS5kYXRhO1xuICAgICAgICAgICAgICAgIHJldHVybiBsb29wRGF0YTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbG9vcFN0YWNrID0gQXJyYXkuaXNBcnJheShjdXJyZW50RGF0YVJvdz8uX19kMzY1X2xvb3Bfc3RhY2spXG4gICAgICAgICAgICAgICAgPyBjdXJyZW50RGF0YVJvdy5fX2QzNjVfbG9vcF9zdGFja1xuICAgICAgICAgICAgICAgIDogW107XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRMb29wU291cmNlSWQgPSBsb29wU3RhY2subGVuZ3RoID8gbG9vcFN0YWNrW2xvb3BTdGFjay5sZW5ndGggLSAxXSA6ICcnO1xuICAgICAgICAgICAgaWYgKCFwYXJlbnRMb29wU291cmNlSWQpIHtcbiAgICAgICAgICAgICAgICAvLyBUb3AtbGV2ZWwgbG9vcDogZG8gbm90IGFwcGx5IHJlbGF0aW9uc2hpcCBmaWx0ZXJpbmcuXG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9vcERhdGE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcmVudFNjb3BlZFJlbGF0aW9ucyA9IHJlbGF0aW9uc0ZvckRldGFpbC5maWx0ZXIocmVsID0+IChyZWwucGFyZW50U291cmNlSWQgfHwgJycpID09PSBwYXJlbnRMb29wU291cmNlSWQpO1xuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlUmVsYXRpb25zID0gcGFyZW50U2NvcGVkUmVsYXRpb25zLmxlbmd0aCA/IHBhcmVudFNjb3BlZFJlbGF0aW9ucyA6IHJlbGF0aW9uc0ZvckRldGFpbDtcblxuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZVBhcmVudFZhbHVlID0gKHJlbCwgcGFpcikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGxpY2l0S2V5ID0gcmVsPy5wYXJlbnRTb3VyY2VJZCA/IGAke3JlbC5wYXJlbnRTb3VyY2VJZH06JHtwYWlyLnByaW1hcnlGaWVsZH1gIDogJyc7XG4gICAgICAgICAgICAgICAgaWYgKGV4cGxpY2l0S2V5KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cGxpY2l0VmFsdWUgPSBjdXJyZW50RGF0YVJvdz8uW2V4cGxpY2l0S2V5XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4cGxpY2l0VmFsdWUgIT09IHVuZGVmaW5lZCAmJiBleHBsaWNpdFZhbHVlICE9PSBudWxsICYmIFN0cmluZyhleHBsaWNpdFZhbHVlKSAhPT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBleHBsaWNpdFZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZhbGxiYWNrVmFsdWUgPSBjdXJyZW50RGF0YVJvdz8uW3BhaXIucHJpbWFyeUZpZWxkXTtcbiAgICAgICAgICAgICAgICBpZiAoZmFsbGJhY2tWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIGZhbGxiYWNrVmFsdWUgIT09IG51bGwgJiYgU3RyaW5nKGZhbGxiYWNrVmFsdWUpICE9PSAnJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsbGJhY2tWYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkUmVsYXRpb24gPSBjYW5kaWRhdGVSZWxhdGlvbnMuZmluZCgocmVsKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmllbGRNYXBwaW5ncyA9IEFycmF5LmlzQXJyYXkocmVsPy5maWVsZE1hcHBpbmdzKSAmJiByZWwuZmllbGRNYXBwaW5ncy5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgPyByZWwuZmllbGRNYXBwaW5nc1xuICAgICAgICAgICAgICAgICAgICA6IChyZWw/LnByaW1hcnlGaWVsZCAmJiByZWw/LmRldGFpbEZpZWxkXG4gICAgICAgICAgICAgICAgICAgICAgICA/IFt7IHByaW1hcnlGaWVsZDogcmVsLnByaW1hcnlGaWVsZCwgZGV0YWlsRmllbGQ6IHJlbC5kZXRhaWxGaWVsZCB9XVxuICAgICAgICAgICAgICAgICAgICA6IFtdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZpZWxkTWFwcGluZ3MubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkTWFwcGluZ3MuZXZlcnkoKHBhaXIpID0+IHJlc29sdmVQYXJlbnRWYWx1ZShyZWwsIHBhaXIpICE9PSB1bmRlZmluZWQpO1xuICAgICAgICAgICAgfSkgfHwgbnVsbDtcblxuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZFJlbGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBSZWxhdGlvbnNoaXAgZmlsdGVyIGZvciAke2xvb3BEYXRhU291cmNlfSBjb3VsZCBub3QgcmVzb2x2ZSBwYXJlbnQgdmFsdWVzLiBMb29wIHdpbGwgcHJvY2VzcyAwIHJvd3MuYCk7XG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBbXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9vcERhdGE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkTWFwcGluZ3MgPSBBcnJheS5pc0FycmF5KHNlbGVjdGVkUmVsYXRpb24uZmllbGRNYXBwaW5ncykgJiYgc2VsZWN0ZWRSZWxhdGlvbi5maWVsZE1hcHBpbmdzLmxlbmd0aFxuICAgICAgICAgICAgICAgID8gc2VsZWN0ZWRSZWxhdGlvbi5maWVsZE1hcHBpbmdzXG4gICAgICAgICAgICAgICAgOiBbeyBwcmltYXJ5RmllbGQ6IHNlbGVjdGVkUmVsYXRpb24ucHJpbWFyeUZpZWxkLCBkZXRhaWxGaWVsZDogc2VsZWN0ZWRSZWxhdGlvbi5kZXRhaWxGaWVsZCB9XTtcblxuICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YS5maWx0ZXIoKGRldGFpbFJvdykgPT4gc2VsZWN0ZWRNYXBwaW5ncy5ldmVyeSgocGFpcikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudFZhbHVlID0gcmVzb2x2ZVBhcmVudFZhbHVlKHNlbGVjdGVkUmVsYXRpb24sIHBhaXIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkVmFsdWUgPSBkZXRhaWxSb3c/LltwYWlyLmRldGFpbEZpZWxkXTtcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50VmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChjaGlsZFZhbHVlID09PSB1bmRlZmluZWQgfHwgY2hpbGRWYWx1ZSA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybiBTdHJpbmcoY2hpbGRWYWx1ZSkgPT09IFN0cmluZyhwYXJlbnRWYWx1ZSk7XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbG9vcERhdGE7XG4gICAgfTtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTdGVwV2l0aEhhbmRsaW5nKHN0ZXAsIHN0ZXBJbmRleCwgY3VycmVudERhdGFSb3cpIHtcbiAgICAgICAgY29uc3QgeyBtb2RlLCByZXRyeUNvdW50LCByZXRyeURlbGF5LCBnb3RvTGFiZWwgfSA9IGdldFN0ZXBFcnJvckNvbmZpZyhzdGVwLCBzZXR0aW5ncyk7XG4gICAgICAgIGxldCBhdHRlbXB0ID0gMDtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBleGVjdXRlU2luZ2xlU3RlcChzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnREYXRhUm93LCBkZXRhaWxTb3VyY2VzLCBzZXR0aW5ncywgZHJ5UnVuKTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAmJiBlcnIuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB0aHJvdyBlcnI7XG5cbiAgICAgICAgICAgICAgICBpZiAocmV0cnlDb3VudCA+IDAgJiYgYXR0ZW1wdCA8IHJldHJ5Q291bnQpIHtcbiAgICAgICAgICAgICAgICAgICAgYXR0ZW1wdCArPSAxO1xuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFJldHJ5aW5nIHN0ZXAgJHtzdGVwSW5kZXggKyAxfSAoJHthdHRlbXB0fS8ke3JldHJ5Q291bnR9KSBhZnRlciBlcnJvcjogJHtlcnI/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycil9YCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXRyeURlbGF5ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAocmV0cnlEZWxheSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgc3dpdGNoIChtb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3NraXAnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnc2tpcCcgfTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnZ290byc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdnb3RvJywgbGFiZWw6IGdvdG9MYWJlbCB9O1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdicmVhay1sb29wJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2JyZWFrLWxvb3AnIH07XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbnRpbnVlLWxvb3AnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnY29udGludWUtbG9vcCcgfTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnZmFpbCc6XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVJhbmdlKHN0YXJ0SWR4LCBlbmRJZHgsIGN1cnJlbnREYXRhUm93KSB7XG4gICAgICAgIGlmIChjdXJyZW50RGF0YVJvdykge1xuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50RGF0YVJvdyA9IGN1cnJlbnREYXRhUm93O1xuICAgICAgICB9XG4gICAgICAgIGxldCBpZHggPSBzdGFydElkeDtcclxuXHJcbiAgICAgICAgd2hpbGUgKGlkeCA8IGVuZElkeCkge1xuICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXG5cbiAgICAgICAgICAgIGNvbnN0IHN0ZXAgPSBzdGVwc1tpZHhdO1xuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnbGFiZWwnKSB7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdnb3RvJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldEluZGV4ID0gbGFiZWxNYXAuZ2V0KHN0ZXAuZ290b0xhYmVsKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdvdG8gbGFiZWwgbm90IGZvdW5kOiAke3N0ZXAuZ290b0xhYmVsIHx8ICcnfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPCBzdGFydElkeCB8fCB0YXJnZXRJbmRleCA+PSBlbmRJZHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnZ290bycsIHRhcmdldEluZGV4IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlkeCA9IHRhcmdldEluZGV4O1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnaWYtc3RhcnQnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29uZGl0aW9uTWV0ID0gZXZhbHVhdGVDb25kaXRpb24oc3RlcCwgY3VycmVudERhdGFSb3csIHtcbiAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsXG4gICAgICAgICAgICAgICAgICAgIGlzRWxlbWVudFZpc2libGVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRJbmRleCA9IGlmUGFpcnMuaWZUb0VuZC5nZXQoaWR4KTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbHNlSW5kZXggPSBpZlBhaXJzLmlmVG9FbHNlLmdldChpZHgpO1xuICAgICAgICAgICAgICAgIGlmIChlbmRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSWYtc3RhcnQgYXQgaW5kZXggJHtpZHh9IGhhcyBubyBtYXRjaGluZyBpZi1lbmRgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9uTWV0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZWxzZUluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZWxzZUluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZHggPSBlbmRJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnZWxzZScpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRJbmRleCA9IGlmUGFpcnMuZWxzZVRvRW5kLmdldChpZHgpO1xuICAgICAgICAgICAgICAgIGlmIChlbmRJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGVuZEluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdpZi1lbmQnKSB7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdjb250aW51ZS1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2NvbnRpbnVlLWxvb3AnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdicmVhay1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2JyZWFrLWxvb3AnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BFbmRJZHggPSBsb29wUGFpck1hcC5nZXQoaWR4KTtcbiAgICAgICAgICAgICAgICBpZiAobG9vcEVuZElkeCA9PT0gdW5kZWZpbmVkIHx8IGxvb3BFbmRJZHggPD0gaWR4KSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTG9vcCBzdGFydCBhdCBpbmRleCAke2lkeH0gaGFzIG5vIG1hdGNoaW5nIGVuZGApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BNb2RlID0gc3RlcC5sb29wTW9kZSB8fCAnZGF0YSc7XG5cbiAgICAgICAgICAgICAgICBpZiAobG9vcE1vZGUgPT09ICdjb3VudCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9vcENvdW50ID0gTnVtYmVyKHN0ZXAubG9vcENvdW50KSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYEVudGVyaW5nIGxvb3A6ICR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9IChjb3VudD0ke2xvb3BDb3VudH0pYCk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGl0ZXJJbmRleCA9IDA7IGl0ZXJJbmRleCA8IGxvb3BDb3VudDsgaXRlckluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdsb29wSXRlcmF0aW9uJywgaXRlcmF0aW9uOiBpdGVySW5kZXggKyAxLCB0b3RhbDogbG9vcENvdW50LCBzdGVwOiBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCI6IGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bG9vcENvdW50fWAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgJyonKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKGlkeCArIDEsIGxvb3BFbmRJZHgsIGN1cnJlbnREYXRhUm93KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnKSBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2dvdG8nKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gbG9vcEVuZElkeCArIDE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChsb29wTW9kZSA9PT0gJ3doaWxlJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXhJdGVyYXRpb25zID0gTnVtYmVyKHN0ZXAubG9vcE1heEl0ZXJhdGlvbnMpIHx8IDEwMDtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGl0ZXJJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChpdGVySW5kZXggPCBtYXhJdGVyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZXZhbHVhdGVDb25kaXRpb24oc3RlcCwgY3VycmVudERhdGFSb3csIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0VsZW1lbnRWaXNpYmxlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSkgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnbG9vcEl0ZXJhdGlvbicsIGl0ZXJhdGlvbjogaXRlckluZGV4ICsgMSwgdG90YWw6IG1heEl0ZXJhdGlvbnMsIHN0ZXA6IGBMb29wIFwiJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31cIjogaXRlcmF0aW9uICR7aXRlckluZGV4ICsgMX0vJHttYXhJdGVyYXRpb25zfWAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgJyonKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKGlkeCArIDEsIGxvb3BFbmRJZHgsIGN1cnJlbnREYXRhUm93KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnKSBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlckluZGV4Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdnb3RvJykgcmV0dXJuIHJlc3VsdDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlckluZGV4Kys7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXRlckluZGV4ID49IG1heEl0ZXJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCIgaGl0IG1heCBpdGVyYXRpb25zICgke21heEl0ZXJhdGlvbnN9KWApO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gbG9vcEVuZElkeCArIDE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BEYXRhU291cmNlID0gc3RlcC5sb29wRGF0YVNvdXJjZSB8fCAncHJpbWFyeSc7XG4gICAgICAgICAgICAgICAgbGV0IGxvb3BEYXRhID0gcmVzb2x2ZUxvb3BEYXRhKGxvb3BEYXRhU291cmNlLCBjdXJyZW50RGF0YVJvdyk7XG5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBpdGVyYXRpb24gbGltaXRcbiAgICAgICAgICAgICAgICBjb25zdCBpdGVyYXRpb25MaW1pdCA9IHN0ZXAuaXRlcmF0aW9uTGltaXQgfHwgMDtcbiAgICAgICAgICAgICAgICBpZiAoaXRlcmF0aW9uTGltaXQgPiAwICYmIGxvb3BEYXRhLmxlbmd0aCA+IGl0ZXJhdGlvbkxpbWl0KSB7XG4gICAgICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gbG9vcERhdGEuc2xpY2UoMCwgaXRlcmF0aW9uTGltaXQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgRW50ZXJpbmcgbG9vcDogJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ30gKHNvdXJjZT0ke2xvb3BEYXRhU291cmNlfSkgLSAke2xvb3BEYXRhLmxlbmd0aH0gaXRlcmF0aW9uc2ApO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGl0ZXJJbmRleCA9IDA7IGl0ZXJJbmRleCA8IGxvb3BEYXRhLmxlbmd0aDsgaXRlckluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXRlclNvdXJjZVJvdyA9IGxvb3BEYXRhW2l0ZXJJbmRleF0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZXJSb3cgPSB7IC4uLmN1cnJlbnREYXRhUm93LCAuLi5pdGVyU291cmNlUm93IH07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudFN0YWNrID0gQXJyYXkuaXNBcnJheShjdXJyZW50RGF0YVJvdz8uX19kMzY1X2xvb3Bfc3RhY2spXG4gICAgICAgICAgICAgICAgICAgICAgICA/IGN1cnJlbnREYXRhUm93Ll9fZDM2NV9sb29wX3N0YWNrXG4gICAgICAgICAgICAgICAgICAgICAgICA6IFtdO1xuICAgICAgICAgICAgICAgICAgICBpdGVyUm93Ll9fZDM2NV9sb29wX3N0YWNrID0gWy4uLnBhcmVudFN0YWNrLCBsb29wRGF0YVNvdXJjZV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChsb29wRGF0YVNvdXJjZSAhPT0gJ3ByaW1hcnknKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBPYmplY3QuZW50cmllcyhpdGVyU291cmNlUm93KS5mb3JFYWNoKChbZmllbGQsIHZhbHVlXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJSb3dbYCR7bG9vcERhdGFTb3VyY2V9OiR7ZmllbGR9YF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzUHJpbWFyeUxvb3AgPSBsb29wRGF0YVNvdXJjZSA9PT0gJ3ByaW1hcnknO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b3RhbFJvd3NGb3JMb29wID0gaXNQcmltYXJ5TG9vcCA/IG9yaWdpbmFsVG90YWxSb3dzIDogbG9vcERhdGEubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b3RhbFRvUHJvY2Vzc0Zvckxvb3AgPSBsb29wRGF0YS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlSb3dOdW1iZXIgPSBpc1ByaW1hcnlMb29wID8gc3RhcnRSb3dOdW1iZXIgKyBpdGVySW5kZXggOiBpdGVySW5kZXg7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9vcFJvd1Byb2dyZXNzID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGhhc2U6ICdyb3dTdGFydCcsXG4gICAgICAgICAgICAgICAgICAgICAgICByb3c6IGRpc3BsYXlSb3dOdW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICB0b3RhbFJvd3M6IHRvdGFsUm93c0Zvckxvb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRSb3dzOiBpdGVySW5kZXggKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxUb1Byb2Nlc3M6IHRvdGFsVG9Qcm9jZXNzRm9yTG9vcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0ZXA6ICdQcm9jZXNzaW5nIHJvdydcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBMb29wIGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bG9vcERhdGEubGVuZ3RofSBmb3IgbG9vcCAke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfWApO1xuICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiBsb29wUm93UHJvZ3Jlc3MgfSwgJyonKTtcblxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiB7IHBoYXNlOiAnbG9vcEl0ZXJhdGlvbicsIGl0ZXJhdGlvbjogaXRlckluZGV4ICsgMSwgdG90YWw6IGxvb3BEYXRhLmxlbmd0aCwgc3RlcDogYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiOiBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke2xvb3BEYXRhLmxlbmd0aH1gIH0gfSwgJyonKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBFeGVjdXRlIHN0ZXBzIGluc2lkZSB0aGUgbG9vcCAoc3VwcG9ydHMgbmVzdGVkIGxvb3BzKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgaXRlclJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnKSBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdnb3RvJykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZHggPSBsb29wRW5kSWR4ICsgMTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2xvb3AtZW5kJykge1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlU3RlcFdpdGhIYW5kbGluZyhzdGVwLCBpZHgsIGN1cnJlbnREYXRhUm93KTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ3NraXAnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2dvdG8nKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0SW5kZXggPSBsYWJlbE1hcC5nZXQocmVzdWx0LmxhYmVsKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdvdG8gbGFiZWwgbm90IGZvdW5kOiAke3Jlc3VsdC5sYWJlbCB8fCAnJ31gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldEluZGV4IDwgc3RhcnRJZHggfHwgdGFyZ2V0SW5kZXggPj0gZW5kSWR4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2dvdG8nLCB0YXJnZXRJbmRleCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZHggPSB0YXJnZXRJbmRleDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICB9XG5cclxuICAgIGNvbnN0IGZpbmFsUmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKDAsIHN0ZXBzLmxlbmd0aCwgaW5pdGlhbERhdGFSb3cpO1xuICAgIGlmIChmaW5hbFJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcgfHwgZmluYWxSZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9vcCBjb250cm9sIHNpZ25hbCB1c2VkIG91dHNpZGUgb2YgYSBsb29wJyk7XG4gICAgfVxufVxuXG4gICAgcmV0dXJuIHsgc3RhcnRlZDogdHJ1ZSB9O1xufVxuXG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgIHN0YXJ0SW5qZWN0ZWQoeyB3aW5kb3dPYmo6IHdpbmRvdywgZG9jdW1lbnRPYmo6IGRvY3VtZW50IH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFFQSxNQUFxQixnQkFBckIsTUFBbUM7QUFBQSxJQUMvQixjQUFjO0FBQ1YsV0FBSyxlQUFlO0FBQ3BCLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssVUFBVTtBQUFBLElBQ25CO0FBQUE7QUFBQSxJQUdBLG1CQUFtQixTQUFT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QUFFLFFBQVEsUUFBUSxZQUFZO0FBQUEsWUFDekM7QUFDQSxrQkFBTTtBQUNOO0FBQUEsVUFDSjtBQUNBLGNBQUksUUFBUSxXQUFXLGdCQUFnQixRQUFRLFdBQVcsaUJBQWlCO0FBQ3ZFLG1CQUFPO0FBQUEsVUFDWDtBQUNBO0FBQUEsUUFDSjtBQUNBLGVBQU8sRUFBRSxRQUFRLE9BQU87QUFBQSxNQUM1QjtBQUVBLFlBQU0sY0FBYyxNQUFNLGFBQWEsR0FBRyxNQUFNLFFBQVEsY0FBYztBQUN0RSxVQUFJLGFBQWEsV0FBVyxnQkFBZ0IsYUFBYSxXQUFXLGlCQUFpQjtBQUNqRixjQUFNLElBQUksTUFBTSw0Q0FBNEM7QUFBQSxNQUNoRTtBQUFBLElBQ0o7QUFFSSxXQUFPLEVBQUUsU0FBUyxLQUFLO0FBQUEsRUFDM0I7QUFFQSxNQUFJLE9BQU8sV0FBVyxlQUFlLE9BQU8sYUFBYSxhQUFhO0FBQ2xFLGtCQUFjLEVBQUUsV0FBVyxRQUFRLGFBQWEsU0FBUyxDQUFDO0FBQUEsRUFDOUQ7IiwKICAibmFtZXMiOiBbImhhc0xvb2t1cEJ1dHRvbiIsICJ0b3AiLCAiY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZCIsICJmaWx0ZXJJbnB1dCIsICJmaWx0ZXJGaWVsZENvbnRhaW5lciIsICJyb3ciLCAib3B0aW9ucyIsICJ3aW5kb3ciLCAiZG9jdW1lbnQiLCAibmF2aWdhdG9yIiwgInJlc3VsdCJdCn0K
