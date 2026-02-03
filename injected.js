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
      const originalWorkflow = window.d365OriginalWorkflow || window.d365CurrentWorkflow || null;
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
        executionControl.stepIndexOffset = workflow?._originalStartIndex || 0;
        executionControl.currentStepIndex = executionControl.stepIndexOffset;
        currentWorkflow = workflow;
        if (workflow._originalWorkflow) {
          window.d365OriginalWorkflow = workflow._originalWorkflow;
        } else if (!workflow._isResume) {
          window.d365OriginalWorkflow = workflow;
        }
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
      executionControl.currentStepIndex = typeof step._absoluteIndex === "number" ? step._absoluteIndex : (executionControl.stepIndexOffset || 0) + stepIndex;
      const stepLabel = step.displayText || step.controlName || step.type || `step ${stepIndex}`;
      const absoluteStepIndex = executionControl.currentStepIndex;
      window.postMessage({
        type: "D365_WORKFLOW_PROGRESS",
        progress: { phase: "stepStart", stepName: stepLabel, stepIndex: absoluteStepIndex, localStepIndex: stepIndex }
      }, "*");
      try {
        const stepType = (step.type || "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        logStep(`Step ${absoluteStepIndex + 1}: ${stepType} -> ${stepLabel}`);
        if (dryRun) {
          sendLog("info", `Dry run - skipping action: ${step.type} ${step.controlName || ""}`);
          window.postMessage({
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
        window.postMessage({
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luamVjdGVkL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb2dnaW5nLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9hc3luYy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvdGV4dC5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvZG9tLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb29rdXAuanMiLCAic3JjL2luamVjdGVkL3V0aWxzL2NvbWJvYm94LmpzIiwgInNyYy9pbmplY3RlZC9zdGVwcy9hY3Rpb25zLmpzIiwgInNyYy9pbmplY3RlZC9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gRDM2NUZPIEVsZW1lbnQgSW5zcGVjdG9yIGFuZCBEaXNjb3ZlcnkgTW9kdWxlXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEMzY1SW5zcGVjdG9yIHtcclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIHRoaXMuaXNJbnNwZWN0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gbnVsbDtcclxuICAgICAgICB0aGlzLm92ZXJsYXkgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCB0aGUgZm9ybSBuYW1lIHRoYXQgY29udGFpbnMgYW4gZWxlbWVudFxyXG4gICAgZ2V0RWxlbWVudEZvcm1OYW1lKGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBMb29rIGZvciB0aGUgY2xvc2VzdCBmb3JtIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IGZvcm1Db250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XHJcbiAgICAgICAgaWYgKGZvcm1Db250YWluZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZvcm1Db250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgZm9ybSB2aWEgZGF0YS1keW4tY29udHJvbG5hbWUgb24gYSBmb3JtLWxldmVsIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IGZvcm1FbGVtZW50ID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkZvcm1cIl0nKTtcclxuICAgICAgICBpZiAoZm9ybUVsZW1lbnQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZvcm1FbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCBmb3JtRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgZmluZGluZyB0aGUgd29ya3NwYWNlIG9yIHBhZ2UgY29udGFpbmVyXHJcbiAgICAgICAgY29uc3Qgd29ya3NwYWNlID0gZWxlbWVudC5jbG9zZXN0KCcud29ya3NwYWNlLWNvbnRlbnQsIC53b3Jrc3BhY2UsIFtkYXRhLWR5bi1yb2xlPVwiV29ya3NwYWNlXCJdJyk7XHJcbiAgICAgICAgaWYgKHdvcmtzcGFjZSkge1xyXG4gICAgICAgICAgICBjb25zdCB3b3Jrc3BhY2VOYW1lID0gd29ya3NwYWNlLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKHdvcmtzcGFjZU5hbWUpIHJldHVybiB3b3Jrc3BhY2VOYW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgZGlhbG9nL21vZGFsIGNvbnRleHRcclxuICAgICAgICBjb25zdCBkaWFsb2cgPSBlbGVtZW50LmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiRGlhbG9nXCJdLCAuZGlhbG9nLWNvbnRhaW5lciwgLm1vZGFsLWNvbnRlbnQnKTtcclxuICAgICAgICBpZiAoZGlhbG9nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpYWxvZ05hbWUgPSBkaWFsb2cuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk/LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dOYW1lKSByZXR1cm4gZGlhbG9nTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIHJvb3QgZm9ybSBieSB3YWxraW5nIHVwIHRoZSBET01cclxuICAgICAgICBsZXQgY3VycmVudCA9IGVsZW1lbnQ7XHJcbiAgICAgICAgd2hpbGUgKGN1cnJlbnQgJiYgY3VycmVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IGN1cnJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChjdXJyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnRm9ybScgPyBjdXJyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSA6IG51bGwpO1xyXG4gICAgICAgICAgICBpZiAoZm9ybU5hbWUpIHJldHVybiBmb3JtTmFtZTtcclxuICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQucGFyZW50RWxlbWVudDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuICdVbmtub3duJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgdGhlIGFjdGl2ZS9mb2N1c2VkIGZvcm0gbmFtZVxyXG4gICAgZ2V0QWN0aXZlRm9ybU5hbWUoKSB7XHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGFjdGl2ZSBkaWFsb2cgZmlyc3QgKGNoaWxkIGZvcm1zIGFyZSB0eXBpY2FsbHkgZGlhbG9ncylcclxuICAgICAgICBjb25zdCBhY3RpdmVEaWFsb2cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pLCAuZGlhbG9nLWNvbnRhaW5lcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZURpYWxvZykge1xyXG4gICAgICAgICAgICBjb25zdCBkaWFsb2dGb3JtID0gYWN0aXZlRGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XHJcbiAgICAgICAgICAgIGlmIChkaWFsb2dGb3JtKSByZXR1cm4gZGlhbG9nRm9ybS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICByZXR1cm4gYWN0aXZlRGlhbG9nLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGZvY3VzZWQgZWxlbWVudCBhbmQgZ2V0IGl0cyBmb3JtXHJcbiAgICAgICAgY29uc3QgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XHJcbiAgICAgICAgaWYgKGFjdGl2ZUVsZW1lbnQgJiYgYWN0aXZlRWxlbWVudCAhPT0gZG9jdW1lbnQuYm9keSkge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGFjdGl2ZUVsZW1lbnQpO1xyXG4gICAgICAgICAgICBpZiAoZm9ybU5hbWUgJiYgZm9ybU5hbWUgIT09ICdVbmtub3duJykgcmV0dXJuIGZvcm1OYW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBMb29rIGZvciB0aGUgdG9wbW9zdC9hY3RpdmUgZm9ybSBzZWN0aW9uXHJcbiAgICAgICAgY29uc3QgdmlzaWJsZUZvcm1zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWZvcm0tbmFtZV0nKTtcclxuICAgICAgICBpZiAodmlzaWJsZUZvcm1zLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgLy8gUmV0dXJuIHRoZSBsYXN0IG9uZSAodHlwaWNhbGx5IHRoZSBtb3N0IHJlY2VudGx5IG9wZW5lZC90b3Btb3N0KVxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gdmlzaWJsZUZvcm1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pc0VsZW1lbnRWaXNpYmxlKHZpc2libGVGb3Jtc1tpXSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmlzaWJsZUZvcm1zW2ldLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzY292ZXIgYWxsIGludGVyYWN0aXZlIGVsZW1lbnRzIG9uIHRoZSBwYWdlXHJcbiAgICBkaXNjb3ZlckVsZW1lbnRzKGFjdGl2ZUZvcm1Pbmx5ID0gZmFsc2UpIHtcclxuICAgICAgICBjb25zdCBlbGVtZW50cyA9IFtdO1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUZvcm0gPSBhY3RpdmVGb3JtT25seSA/IHRoaXMuZ2V0QWN0aXZlRm9ybU5hbWUoKSA6IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbGwgYnV0dG9uc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0sIFtkYXRhLWR5bi1yb2xlPVwiTWVudUl0ZW1CdXR0b25cIl0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRoaXMuZ2V0RWxlbWVudFRleHQoZWwpO1xyXG4gICAgICAgICAgICBjb25zdCB2aXNpYmxlID0gdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2J1dHRvbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHZpc2libGUsXHJcbiAgICAgICAgICAgICAgICBhcmlhTGFiZWw6IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIGFsbCBpbnB1dCBmaWVsZHMgKGV4cGFuZGVkIHRvIGNhdGNoIG1vcmUgZmllbGQgdHlwZXMpXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJJbnB1dFwiXSwgW2RhdGEtZHluLXJvbGU9XCJNdWx0aWxpbmVJbnB1dFwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSwgW2RhdGEtZHluLXJvbGU9XCJSZWZlcmVuY2VHcm91cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiU2VnbWVudGVkRW50cnlcIl0sIGlucHV0W2RhdGEtZHluLWNvbnRyb2xuYW1lXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgLy8gR2V0IGNvbnRyb2wgbmFtZSBmcm9tIGVsZW1lbnQgb3IgcGFyZW50XHJcbiAgICAgICAgICAgIGxldCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgbGV0IHRhcmdldEVsZW1lbnQgPSBlbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIElmIG5vdCBmb3VuZCwgY2hlY2sgcGFyZW50IGVsZW1lbnQgKGNvbW1vbiBmb3IgU2VnbWVudGVkRW50cnkgZmllbGRzIGxpa2UgQWNjb3VudClcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lID0gcGFyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRFbGVtZW50ID0gcGFyZW50O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAvLyBTa2lwIGlmIGFscmVhZHkgYWRkZWQgKGF2b2lkIGR1cGxpY2F0ZXMpXHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldEVsZW1lbnRMYWJlbCh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgY29uc3QgZmllbGRJbmZvID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdpbnB1dCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUodGFyZ2V0RWxlbWVudCksXHJcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkSW5mbyxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogdGFyZ2V0RWxlbWVudFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbGwgY2hlY2tib3hlcy90b2dnbGVzXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJDaGVja0JveFwiXSwgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBsZXQgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGxldCB0YXJnZXRFbGVtZW50ID0gZWw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBDaGVjayBwYXJlbnQgaWYgbm90IGZvdW5kXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSA9IHBhcmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0RWxlbWVudCA9IHBhcmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZSh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFbGVtZW50TGFiZWwodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrYm94ID0gdGFyZ2V0RWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fCB0YXJnZXRFbGVtZW50O1xyXG4gICAgICAgICAgICBjb25zdCBpc0NoZWNrZWQgPSBjaGVja2JveC5jaGVja2VkIHx8IGNoZWNrYm94LmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2NoZWNrYm94JyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBsYWJlbCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZSh0YXJnZXRFbGVtZW50KSxcclxuICAgICAgICAgICAgICAgIGNoZWNrZWQ6IGlzQ2hlY2tlZCxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogdGFyZ2V0RWxlbWVudFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbGwgcmFkaW8gYnV0dG9uIGdyb3Vwc1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIlJhZGlvQnV0dG9uXCJdLCBbcm9sZT1cInJhZGlvZ3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiRnJhbWVPcHRpb25CdXR0b25cIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFbGVtZW50TGFiZWwoZWwpO1xyXG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZFJhZGlvID0gZWwucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdOmNoZWNrZWQsIFtyb2xlPVwicmFkaW9cIl1bYXJpYS1jaGVja2VkPVwidHJ1ZVwiXScpO1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBzZWxlY3RlZFJhZGlvPy52YWx1ZSB8fCBzZWxlY3RlZFJhZGlvPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdyYWRpbycsXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBsYWJlbCxcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxuICAgICAgICAgICAgICAgIGN1cnJlbnRWYWx1ZTogY3VycmVudFZhbHVlLFxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEZpbmQgYWN0aW9uIHBhbmUgdGFicyAoQXBwQmFyIHRhYnMpXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQXBwQmFyVGFiXCJdLCAuYXBwQmFyVGFiLCBbcm9sZT1cInRhYlwiXVtkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcblxuICAgICAgICAgICAgLy8gU2tpcCB0YWJzIGluc2lkZSBkaWFsb2dzL2ZseW91dHNcbiAgICAgICAgICAgIGlmIChlbC5jbG9zZXN0KCcuZGlhbG9nLWNvbnRlbnQsIFtkYXRhLWR5bi1yb2xlPVwiRGlhbG9nXCJdLCAuZGlhbG9nLWNvbnRhaW5lciwgLmZseW91dC1jb250YWluZXIsIFtyb2xlPVwiZGlhbG9nXCJdJykpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcblxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRoaXMuZ2V0RWxlbWVudFRleHQoZWwpO1xuICAgICAgICAgICAgY29uc3QgaXNBY3RpdmUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XG4gICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSB8fFxuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnc2VsZWN0ZWQnKTtcblxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2FjdGlvbi1wYW5lLXRhYicsXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiB0ZXh0LFxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXG4gICAgICAgICAgICAgICAgaXNBY3RpdmU6IGlzQWN0aXZlLFxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEZpbmQgYWxsIHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHMvdGFibGVzXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiB0aGlzLmdldEVsZW1lbnRMYWJlbChlbCkgfHwgJ0dyaWQnLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBEaXNjb3ZlciBncmlkIGNvbHVtbnMgZm9yIGlucHV0XHJcbiAgICAgICAgICAgIHRoaXMuZGlzY292ZXJHcmlkQ29sdW1ucyhlbCwgY29udHJvbE5hbWUsIGZvcm1OYW1lLCBlbGVtZW50cyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHMgKC5yZWFjdEdyaWQpXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6ICdSZWFjdCBHcmlkJyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogJy5yZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgZXhwYW5kYWJsZSBzZWN0aW9ucyAoRmFzdFRhYnMsIEdyb3VwcywgU2VjdGlvblBhZ2VzKVxyXG4gICAgICAgIC8vIFRoZXNlIGFyZSBjb2xsYXBzaWJsZSBzZWN0aW9ucyBpbiBEMzY1IGRpYWxvZ3MgYW5kIGZvcm1zXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcm91cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJUYWJQYWdlXCJdLCBbZGF0YS1keW4tcm9sZT1cIkZhc3RUYWJcIl0sIC5zZWN0aW9uLXBhZ2UsIC5mYXN0dGFiJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBTa2lwIGlmIGFscmVhZHkgYWRkZWRcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhY3R1YWxseSBhbiBleHBhbmRhYmxlIHNlY3Rpb25cclxuICAgICAgICAgICAgLy8gTG9vayBmb3IgaGVhZGVyIGVsZW1lbnRzIG9yIGFyaWEtZXhwYW5kZWQgYXR0cmlidXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGhhc0hlYWRlciA9IGVsLnF1ZXJ5U2VsZWN0b3IoJy5zZWN0aW9uLWhlYWRlciwgLmdyb3VwLWhlYWRlciwgW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZUhlYWRlclwiXSwgLnNlY3Rpb24tcGFnZS1jYXB0aW9uLCBidXR0b25bYXJpYS1leHBhbmRlZF0nKTtcclxuICAgICAgICAgICAgY29uc3QgaXNFeHBhbmRhYmxlID0gZWwuaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzaWJsZScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWN0aW9uLXBhZ2UnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc0hlYWRlciAhPT0gbnVsbCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnR3JvdXAnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdTZWN0aW9uUGFnZSc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWlzRXhwYW5kYWJsZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgZXhwYW5kZWQgc3RhdGVcclxuICAgICAgICAgICAgY29uc3QgaXNFeHBhbmRlZCA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmRlZCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICFlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldEV4cGFuZGFibGVTZWN0aW9uTGFiZWwoZWwpIHx8IGNvbnRyb2xOYW1lO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2VjdGlvbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgaXNFeHBhbmRlZDogaXNFeHBhbmRlZCxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBEaXNjb3ZlciBSZWFjdCBncmlkIGNvbHVtbnMgZm9yIGlucHV0XHJcbiAgICAgICAgICAgIHRoaXMuZGlzY292ZXJSZWFjdEdyaWRDb2x1bW5zKGVsLCBmb3JtTmFtZSwgZWxlbWVudHMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudHM7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHJlYWRhYmxlIHRleHQgZnJvbSBhbiBlbGVtZW50XHJcbiAgICBnZXRFbGVtZW50VGV4dChlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IGFyaWEtbGFiZWwgZmlyc3RcclxuICAgICAgICBsZXQgdGV4dCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKHRleHQgJiYgdGV4dC50cmltKCkpIHJldHVybiB0ZXh0LnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gVHJ5IHRleHQgY29udGVudCAoZXhjbHVkaW5nIGNoaWxkIGJ1dHRvbnMvaWNvbnMpXHJcbiAgICAgICAgY29uc3QgY2xvbmUgPSBlbGVtZW50LmNsb25lTm9kZSh0cnVlKTtcclxuICAgICAgICBjbG9uZS5xdWVyeVNlbGVjdG9yQWxsKCcuYnV0dG9uLWljb24sIC5mYSwgLmdseXBoaWNvbicpLmZvckVhY2goaWNvbiA9PiBpY29uLnJlbW92ZSgpKTtcclxuICAgICAgICB0ZXh0ID0gY2xvbmUudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcblxyXG4gICAgICAgIC8vIFRyeSB0aXRsZSBhdHRyaWJ1dGVcclxuICAgICAgICB0ZXh0ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJyk7XHJcbiAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG5cclxuICAgICAgICAvLyBGYWxsYmFjayB0byBjb250cm9sIG5hbWVcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJ1Vua25vd24nO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCBsYWJlbCBmb3IgaW5wdXQgZmllbGRzXHJcbiAgICBnZXRFbGVtZW50TGFiZWwoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBhcmlhLWxhYmVsXHJcbiAgICAgICAgbGV0IGxhYmVsID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcclxuICAgICAgICBpZiAobGFiZWwgJiYgbGFiZWwudHJpbSgpKSByZXR1cm4gbGFiZWwudHJpbSgpO1xyXG5cclxuICAgICAgICAvLyBUcnkgYXNzb2NpYXRlZCBsYWJlbCBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgbGFiZWxFbGVtZW50ID0gZWxlbWVudC5jbG9zZXN0KCcuZHluLWxhYmVsLXdyYXBwZXInKT8ucXVlcnlTZWxlY3RvcignLmR5bi1sYWJlbCcpO1xyXG4gICAgICAgIGlmIChsYWJlbEVsZW1lbnQpIHJldHVybiBsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gVHJ5IHBhcmVudCBjb250YWluZXIgbGFiZWxcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5pbnB1dF9jb250YWluZXIsIC5mb3JtLWdyb3VwJyk7XHJcbiAgICAgICAgaWYgKGNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBjb25zdCBjb250YWluZXJMYWJlbCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpO1xyXG4gICAgICAgICAgICBpZiAoY29udGFpbmVyTGFiZWwpIHJldHVybiBjb250YWluZXJMYWJlbC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gY29udHJvbCBuYW1lXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICdVbmtub3duJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXNjb3ZlciBncmlkIGNvbHVtbnMgZm9yIGlucHV0L2VkaXRpbmdcclxuICAgIGRpc2NvdmVyR3JpZENvbHVtbnMoZ3JpZEVsZW1lbnQsIGdyaWROYW1lLCBmb3JtTmFtZSwgZWxlbWVudHMpIHtcclxuICAgICAgICBjb25zdCBhZGRlZENvbHVtbnMgPSBuZXcgU2V0KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWV0aG9kIDE6IEZpbmQgY29sdW1uIGhlYWRlcnNcclxuICAgICAgICBjb25zdCBoZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdLCAuZHluLWhlYWRlckNlbGwnKTtcclxuICAgICAgICBoZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGhlYWRlci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpIHx8IGhlYWRlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBgJHtkaXNwbGF5VGV4dH1gLFxyXG4gICAgICAgICAgICAgICAgZ3JpZE5hbWU6IGdyaWROYW1lLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGhlYWRlciksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNIZWFkZXI6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBoZWFkZXJcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWV0aG9kIDI6IEZpbmQgY2VsbHMgd2l0aCBpbnB1dHMgaW4gdGhlIGFjdGl2ZS9zZWxlY3RlZCByb3dcclxuICAgICAgICBjb25zdCBhY3RpdmVSb3cgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXJvbGU9XCJSb3dcIl06Zmlyc3Qtb2YtdHlwZSwgW3JvbGU9XCJyb3dcIl06bm90KFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdKTpmaXJzdC1vZi10eXBlJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGFjdGl2ZVJvdykge1xyXG4gICAgICAgICAgICAvLyBGaW5kIGFsbCBpbnB1dCBmaWVsZHMgaW4gdGhlIHJvd1xyXG4gICAgICAgICAgICBjb25zdCBjZWxscyA9IGFjdGl2ZVJvdy5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgIGNlbGxzLmZvckVhY2goY2VsbCA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBjb25zdCByb2xlID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGhhc0lucHV0ID0gY2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgc2VsZWN0LCB0ZXh0YXJlYScpICE9PSBudWxsIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnSW5wdXQnLCAnQ29tYm9Cb3gnLCAnTG9va3VwJywgJ1JlZmVyZW5jZUdyb3VwJywgJ1NlZ21lbnRlZEVudHJ5J10uaW5jbHVkZXMocm9sZSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChoYXNJbnB1dCB8fCByb2xlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IHRoaXMuZ2V0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGNlbGwpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkTmFtZTogZ3JpZE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShjZWxsKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpc0VkaXRhYmxlOiBoYXNJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZFR5cGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGNlbGxcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAzOiBGaW5kIGFueSBlZGl0YWJsZSBpbnB1dHMgaW5zaWRlIHRoZSBncmlkIGJvZHlcclxuICAgICAgICBjb25zdCBncmlkSW5wdXRzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJJbnB1dFwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0nKTtcclxuICAgICAgICBncmlkSW5wdXRzLmZvckVhY2goaW5wdXQgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgdGhpcy5nZXRFbGVtZW50TGFiZWwoaW5wdXQpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGlucHV0KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgZ3JpZE5hbWU6IGdyaWROYW1lLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGlucHV0KSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0VkaXRhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZFR5cGUsXHJcbiAgICAgICAgICAgICAgICByb2xlOiBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGlucHV0XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGEgZ3JpZCBjb2x1bW4gYnkgbG9va2luZyBhdCB0aGUgaGVhZGVyXHJcbiAgICBnZXRHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbHVtbkNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGhlYWRlciBjZWxsIGZvciB0aGlzIGNvbHVtblxyXG4gICAgICAgIGNvbnN0IGhlYWRlciA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2x1bW5Db250cm9sTmFtZX1cIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2x1bW5Db250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoaGVhZGVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCBoZWFkZXIgYnkgcGFydGlhbCBtYXRjaCAoY29sdW1uIG5hbWUgbWlnaHQgYmUgZGlmZmVyZW50IGluIGhlYWRlciB2cyBjZWxsKVxyXG4gICAgICAgIGNvbnN0IGFsbEhlYWRlcnMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGggb2YgYWxsSGVhZGVycykge1xyXG4gICAgICAgICAgICBjb25zdCBoZWFkZXJOYW1lID0gaC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmIChoZWFkZXJOYW1lICYmIChjb2x1bW5Db250cm9sTmFtZS5pbmNsdWRlcyhoZWFkZXJOYW1lKSB8fCBoZWFkZXJOYW1lLmluY2x1ZGVzKGNvbHVtbkNvbnRyb2xOYW1lKSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBoLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzY292ZXIgY29sdW1ucyBpbiBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkc1xyXG4gICAgZGlzY292ZXJSZWFjdEdyaWRDb2x1bW5zKGdyaWRFbGVtZW50LCBmb3JtTmFtZSwgZWxlbWVudHMpIHtcclxuICAgICAgICBjb25zdCBhZGRlZENvbHVtbnMgPSBuZXcgU2V0KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gR2V0IGNvbHVtbiBoZWFkZXJzIGZyb20gLmR5bi1oZWFkZXJDZWxsIGVsZW1lbnRzXHJcbiAgICAgICAgY29uc3QgaGVhZGVyQ2VsbHMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfaGVhZGVyIC5keW4taGVhZGVyQ2VsbCcpO1xyXG4gICAgICAgIGhlYWRlckNlbGxzLmZvckVhY2goKGhlYWRlciwgY29sSW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBoZWFkZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29udHJvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29udHJvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXIucXVlcnlTZWxlY3RvcignLmR5bi1oZWFkZXJDZWxsTGFiZWwnKTtcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBjb250cm9sTmFtZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGdyaWRUeXBlOiAncmVhY3QnLFxyXG4gICAgICAgICAgICAgICAgY29sdW1uSW5kZXg6IGNvbEluZGV4LFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGhlYWRlciksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYC5keW4taGVhZGVyQ2VsbFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzSGVhZGVyOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaGVhZGVyXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFsc28gbG9vayBmb3IgZWRpdGFibGUgaW5wdXRzIGluc2lkZSB0aGUgYm9keSByb3dzXHJcbiAgICAgICAgY29uc3QgYm9keUNvbnRhaW5lciA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIC8vIEZpbmQgYWN0aXZlL3NlbGVjdGVkIHJvdyBmaXJzdCwgb3IgZmFsbGJhY2sgdG8gZmlyc3Qgcm93XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2RhdGEtZHluLXJvdy1hY3RpdmU9XCJ0cnVlXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluLnB1YmxpY19maXhlZERhdGFUYWJsZVJvd19tYWluJyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBGaW5kIGFsbCBjZWxscyB3aXRoIGRhdGEtZHluLWNvbnRyb2xuYW1lXHJcbiAgICAgICAgICAgICAgICBjb25zdCBjZWxscyA9IGFjdGl2ZVJvdy5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgICAgICBjZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBjZWxsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBjZWxsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc0lucHV0ID0gY2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgc2VsZWN0LCB0ZXh0YXJlYScpICE9PSBudWxsIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ0lucHV0JywgJ0NvbWJvQm94JywgJ0xvb2t1cCcsICdSZWZlcmVuY2VHcm91cCcsICdTZWdtZW50ZWRFbnRyeSddLmluY2x1ZGVzKHJvbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldFJlYWN0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGNlbGwpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyaWRUeXBlOiAncmVhY3QnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoY2VsbCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogaGFzSW5wdXQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBjZWxsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIGFueSBlZGl0YWJsZSBpbnB1dHMgaW4gdGhlIGdyaWQgYm9keVxyXG4gICAgICAgIGNvbnN0IGdyaWRJbnB1dHMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSBbZGF0YS1keW4tcm9sZT1cIklucHV0XCJdLCAuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSBbZGF0YS1keW4tcm9sZT1cIkNvbWJvQm94XCJdLCAuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSBbZGF0YS1keW4tcm9sZT1cIkxvb2t1cFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJSZWZlcmVuY2VHcm91cFwiXScpO1xyXG4gICAgICAgIGdyaWRJbnB1dHMuZm9yRWFjaChpbnB1dCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IHRoaXMuZ2V0UmVhY3RHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IHRoaXMuZ2V0RWxlbWVudExhYmVsKGlucHV0KSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShpbnB1dCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGdyaWRUeXBlOiAncmVhY3QnLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGlucHV0KSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0VkaXRhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZFR5cGUsXHJcbiAgICAgICAgICAgICAgICByb2xlOiBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGlucHV0XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGEgUmVhY3QgZ3JpZCBjb2x1bW4gYnkgbG9va2luZyBhdCB0aGUgaGVhZGVyXHJcbiAgICBnZXRSZWFjdEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sdW1uQ29udHJvbE5hbWUpIHtcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCB0aGUgaGVhZGVyIGNlbGwgd2l0aCBtYXRjaGluZyBjb250cm9sbmFtZVxyXG4gICAgICAgIGNvbnN0IGhlYWRlciA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYC5keW4taGVhZGVyQ2VsbFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IGhlYWRlci5xdWVyeVNlbGVjdG9yKCcuZHluLWhlYWRlckNlbGxMYWJlbCcpO1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaGVhZGVyLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUGFydGlhbCBtYXRjaFxyXG4gICAgICAgIGNvbnN0IGFsbEhlYWRlcnMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGFsbEhlYWRlcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGguZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoaGVhZGVyTmFtZSAmJiAoY29sdW1uQ29udHJvbE5hbWUuaW5jbHVkZXMoaGVhZGVyTmFtZSkgfHwgaGVhZGVyTmFtZS5pbmNsdWRlcyhjb2x1bW5Db250cm9sTmFtZSkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsYWJlbCA9IGgucXVlcnlTZWxlY3RvcignLmR5bi1oZWFkZXJDZWxsTGFiZWwnKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGV0ZWN0IGZpZWxkIHR5cGUgKGVudW0sIGxvb2t1cCwgZnJlZXRleHQsIGV0Yy4pXHJcbiAgICBkZXRlY3RGaWVsZFR5cGUoZWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU2VnbWVudGVkRW50cnkgZmllbGRzIChsaWtlIEFjY291bnQpIGhhdmUgc3BlY2lhbCBsb29rdXBcclxuICAgICAgICBpZiAocm9sZSA9PT0gJ1NlZ21lbnRlZEVudHJ5Jykge1xyXG4gICAgICAgICAgICByZXR1cm4geyB0eXBlOiAnc2VnbWVudGVkLWxvb2t1cCcsIHJvbGU6IHJvbGUgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGxvb2t1cCBidXR0b25cclxuICAgICAgICBjb25zdCBoYXNMb29rdXBCdXR0b24gPSBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZmllbGQtaGFzTG9va3VwQnV0dG9uJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQucXVlcnlTZWxlY3RvcignLmxvb2t1cC1idXR0b24nKSAhPT0gbnVsbCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5uZXh0RWxlbWVudFNpYmxpbmc/LmNsYXNzTGlzdC5jb250YWlucygnbG9va3VwLWJ1dHRvbicpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBDb21ib0JveC9Ecm9wZG93blxyXG4gICAgICAgIGNvbnN0IGlzQ29tYm9Cb3ggPSByb2xlID09PSAnQ29tYm9Cb3gnIHx8IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb21ib0JveCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBzZWxlY3QgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IHNlbGVjdCA9IGVsZW1lbnQucXVlcnlTZWxlY3Rvcignc2VsZWN0Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTXVsdGlsaW5lSW5wdXQgZGV0ZWN0aW9uXHJcbiAgICAgICAgY29uc3QgaXNNdWx0aWxpbmUgPSByb2xlID09PSAnTXVsdGlsaW5lSW5wdXQnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERldGVjdCBudW1lcmljIGZpZWxkc1xyXG4gICAgICAgIGNvbnN0IGlzTnVtZXJpYyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cIm51bWJlclwiXScpICE9PSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERldGVjdCBkYXRlIGZpZWxkc1xyXG4gICAgICAgIGNvbnN0IGlzRGF0ZSA9IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkYXRlLWZpZWxkJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJkYXRlXCJdJykgIT09IG51bGw7XHJcblxyXG4gICAgICAgIC8vIEJ1aWxkIGZpZWxkIHR5cGUgaW5mb1xyXG4gICAgICAgIGNvbnN0IGZpZWxkSW5mbyA9IHtcclxuICAgICAgICAgICAgY29udHJvbFR5cGU6IHJvbGUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ3RleHQnXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgaWYgKGlzTXVsdGlsaW5lKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAndGV4dGFyZWEnO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaXNNdWx0aWxpbmUgPSB0cnVlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNDb21ib0JveCB8fCBzZWxlY3QpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdlbnVtJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzRW51bSA9IHRydWU7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby52YWx1ZXMgPSB0aGlzLmV4dHJhY3RFbnVtVmFsdWVzKGVsZW1lbnQsIHNlbGVjdCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChoYXNMb29rdXBCdXR0b24pIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdsb29rdXAnO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaXNMb29rdXAgPSB0cnVlO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uYWxsb3dGcmVldGV4dCA9ICFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnbG9va3VwLW9ubHknKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzTnVtZXJpYykge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ251bWJlcic7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc0RhdGUpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdkYXRlJztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEdldCBtYXggbGVuZ3RoIGlmIGF2YWlsYWJsZVxyXG4gICAgICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEnKTtcclxuICAgICAgICBpZiAoaW5wdXQgJiYgaW5wdXQubWF4TGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8ubWF4TGVuZ3RoID0gaW5wdXQubWF4TGVuZ3RoO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGZpZWxkSW5mbztcclxuICAgIH1cclxuXHJcbiAgICAvLyBFeHRyYWN0IGVudW0gdmFsdWVzIGZyb20gZHJvcGRvd25cclxuICAgIGV4dHJhY3RFbnVtVmFsdWVzKGVsZW1lbnQsIHNlbGVjdEVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzZWxlY3QgPSBzZWxlY3RFbGVtZW50IHx8IGVsZW1lbnQucXVlcnlTZWxlY3Rvcignc2VsZWN0Jyk7XHJcbiAgICAgICAgaWYgKCFzZWxlY3QpIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbShzZWxlY3Qub3B0aW9ucylcclxuICAgICAgICAgICAgLmZpbHRlcihvcHQgPT4gb3B0LnZhbHVlICE9PSAnJylcclxuICAgICAgICAgICAgLm1hcChvcHQgPT4gKHtcclxuICAgICAgICAgICAgICAgIHZhbHVlOiBvcHQudmFsdWUsXHJcbiAgICAgICAgICAgICAgICB0ZXh0OiBvcHQudGV4dC50cmltKClcclxuICAgICAgICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCBsYWJlbCBmb3IgZXhwYW5kYWJsZSBzZWN0aW9uc1xyXG4gICAgZ2V0RXhwYW5kYWJsZVNlY3Rpb25MYWJlbChlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGhlYWRlci9jYXB0aW9uIGVsZW1lbnRcclxuICAgICAgICBjb25zdCBoZWFkZXJTZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgICAgICcuc2VjdGlvbi1wYWdlLWNhcHRpb24nLFxyXG4gICAgICAgICAgICAnLnNlY3Rpb24taGVhZGVyJyxcclxuICAgICAgICAgICAgJy5ncm91cC1oZWFkZXInLFxyXG4gICAgICAgICAgICAnLmZhc3R0YWItaGVhZGVyJyxcclxuICAgICAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0nLFxyXG4gICAgICAgICAgICAnYnV0dG9uW2FyaWEtZXhwYW5kZWRdIHNwYW4nLFxyXG4gICAgICAgICAgICAnYnV0dG9uIHNwYW4nLFxyXG4gICAgICAgICAgICAnLmNhcHRpb24nLFxyXG4gICAgICAgICAgICAnbGVnZW5kJ1xyXG4gICAgICAgIF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBoZWFkZXJTZWxlY3RvcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICAgICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBhcmlhLWxhYmVsXHJcbiAgICAgICAgY29uc3QgYXJpYUxhYmVsID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcclxuICAgICAgICBpZiAoYXJpYUxhYmVsKSByZXR1cm4gYXJpYUxhYmVsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0aGUgYnV0dG9uJ3MgdGV4dCBpZiB0aGUgc2VjdGlvbiBoYXMgYSB0b2dnbGUgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgdG9nZ2xlQnRuID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b24nKTtcclxuICAgICAgICBpZiAodG9nZ2xlQnRuKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0b2dnbGVCdG4udGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHRleHQgJiYgdGV4dC5sZW5ndGggPCAxMDApIHJldHVybiB0ZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBpZiBlbGVtZW50IGlzIHZpc2libGVcclxuICAgIGlzRWxlbWVudFZpc2libGUoZWxlbWVudCkge1xyXG4gICAgICAgIHJldHVybiBlbGVtZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJiBcclxuICAgICAgICAgICAgICAgd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICAgICAgICAgd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkuZGlzcGxheSAhPT0gJ25vbmUnO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFN0YXJ0IGludGVyYWN0aXZlIGVsZW1lbnQgcGlja2VyXHJcbiAgICBzdGFydEVsZW1lbnRQaWNrZXIoY2FsbGJhY2spIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5waWNrZXJDYWxsYmFjayA9IGNhbGxiYWNrO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgb3ZlcmxheVxyXG4gICAgICAgIHRoaXMub3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMub3ZlcmxheS5zdHlsZS5jc3NUZXh0ID0gYFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogZml4ZWQ7XHJcbiAgICAgICAgICAgIHRvcDogMDtcclxuICAgICAgICAgICAgbGVmdDogMDtcclxuICAgICAgICAgICAgd2lkdGg6IDEwMCU7XHJcbiAgICAgICAgICAgIGhlaWdodDogMTAwJTtcclxuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xyXG4gICAgICAgICAgICB6LWluZGV4OiA5OTk5OTg7XHJcbiAgICAgICAgICAgIGN1cnNvcjogY3Jvc3NoYWlyO1xyXG4gICAgICAgIGA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLm92ZXJsYXkpO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgaGlnaGxpZ2h0IGVsZW1lbnRcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuY3NzVGV4dCA9IGBcclxuICAgICAgICAgICAgcG9zaXRpb246IGFic29sdXRlO1xyXG4gICAgICAgICAgICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDEwMiwgMTI2LCAyMzQsIDAuMSk7XHJcbiAgICAgICAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xyXG4gICAgICAgICAgICB6LWluZGV4OiA5OTk5OTk7XHJcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjFzIGVhc2U7XHJcbiAgICAgICAgYDtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMuaGlnaGxpZ2h0RWxlbWVudCk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lcnNcclxuICAgICAgICB0aGlzLm1vdXNlTW92ZUhhbmRsZXIgPSAoZSkgPT4gdGhpcy5oYW5kbGVNb3VzZU1vdmUoZSk7XHJcbiAgICAgICAgdGhpcy5jbGlja0hhbmRsZXIgPSAoZSkgPT4gdGhpcy5oYW5kbGVDbGljayhlKTtcclxuICAgICAgICB0aGlzLmVzY2FwZUhhbmRsZXIgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB0aGlzLnN0b3BFbGVtZW50UGlja2VyKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3VzZU1vdmVIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuY2xpY2tIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5lc2NhcGVIYW5kbGVyLCB0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVNb3VzZU1vdmUoZSkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xyXG4gICAgICAgIGlmICghdGFyZ2V0IHx8IHRhcmdldCA9PT0gdGhpcy5vdmVybGF5IHx8IHRhcmdldCA9PT0gdGhpcy5oaWdobGlnaHRFbGVtZW50KSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEZpbmQgY2xvc2VzdCBEMzY1IGNvbnRyb2xcclxuICAgICAgICBjb25zdCBjb250cm9sID0gdGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICBpZiAoIWNvbnRyb2wpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaGlnaGxpZ2h0RWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRW5zdXJlIGhpZ2hsaWdodCBlbGVtZW50IGV4aXN0c1xyXG4gICAgICAgIGlmICghdGhpcy5oaWdobGlnaHRFbGVtZW50KSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEhpZ2hsaWdodCB0aGUgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IHJlY3QgPSBjb250cm9sLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUudG9wID0gcmVjdC50b3AgKyB3aW5kb3cuc2Nyb2xsWSArICdweCc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmxlZnQgPSByZWN0LmxlZnQgKyB3aW5kb3cuc2Nyb2xsWCArICdweCc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLndpZHRoID0gcmVjdC53aWR0aCArICdweCc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmhlaWdodCA9IHJlY3QuaGVpZ2h0ICsgJ3B4JztcclxuXHJcbiAgICAgICAgLy8gU2hvdyB0b29sdGlwXHJcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBjb250cm9sLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICBjb25zdCByb2xlID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc2V0QXR0cmlidXRlKCd0aXRsZScsIGAke3JvbGV9OiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG5cclxuICAgIGhhbmRsZUNsaWNrKGUpIHtcclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuXHJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludChlLmNsaWVudFgsIGUuY2xpZW50WSk7XHJcbiAgICAgICAgY29uc3QgY29udHJvbCA9IHRhcmdldD8uY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBjb250cm9sLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdGhpcy5nZXRFbGVtZW50VGV4dChjb250cm9sKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRJbmZvID0ge1xyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiB0ZXh0LFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWBcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIGlmIChyb2xlID09PSAnSW5wdXQnIHx8IHJvbGUgPT09ICdNdWx0aWxpbmVJbnB1dCcgfHwgcm9sZSA9PT0gJ0NvbWJvQm94Jykge1xyXG4gICAgICAgICAgICAgICAgZWxlbWVudEluZm8uZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoY29udHJvbCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMucGlja2VyQ2FsbGJhY2soZWxlbWVudEluZm8pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIHN0b3BFbGVtZW50UGlja2VyKCkge1xyXG4gICAgICAgIHRoaXMuaXNJbnNwZWN0aW5nID0gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRoaXMub3ZlcmxheSkge1xyXG4gICAgICAgICAgICB0aGlzLm92ZXJsYXkucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIHRoaXMub3ZlcmxheSA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3VzZU1vdmVIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuY2xpY2tIYW5kbGVyLCB0cnVlKTtcclxuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5lc2NhcGVIYW5kbGVyLCB0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTZWFyY2ggZWxlbWVudHMgYnkgdGV4dFxyXG4gICAgZmluZEVsZW1lbnRCeVRleHQodGV4dCwgZWxlbWVudFR5cGUgPSBudWxsKSB7XHJcbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSB0aGlzLmRpc2NvdmVyRWxlbWVudHMoKTtcclxuICAgICAgICBjb25zdCBzZWFyY2hUZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLmZpbHRlcihlbCA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50VHlwZSAmJiBlbC50eXBlICE9PSBlbGVtZW50VHlwZSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSBlbC5kaXNwbGF5VGV4dC50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBjb25zdCBhcmlhTGFiZWwgPSAoZWwuYXJpYUxhYmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmNvbnRyb2xOYW1lLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gZGlzcGxheVRleHQuaW5jbHVkZXMoc2VhcmNoVGV4dCkgfHxcclxuICAgICAgICAgICAgICAgICAgIGFyaWFMYWJlbC5pbmNsdWRlcyhzZWFyY2hUZXh0KSB8fFxyXG4gICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUuaW5jbHVkZXMoc2VhcmNoVGV4dCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEV4cG9ydCBmb3IgdXNlIGluIGNvbnRlbnQgc2NyaXB0XHJcbiIsICJleHBvcnQgZnVuY3Rpb24gc2VuZExvZyhsZXZlbCwgbWVzc2FnZSkge1xuICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0xPRycsXG4gICAgICAgIGxvZzogeyBsZXZlbCwgbWVzc2FnZSB9XG4gICAgfSwgJyonKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvZ1N0ZXAobWVzc2FnZSkge1xuICAgIHNlbmRMb2coJ2luZm8nLCBtZXNzYWdlKTtcbiAgICBjb25zb2xlLmxvZygnW0QzNjUgQXV0b21hdGlvbl0nLCBtZXNzYWdlKTtcbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gc2xlZXAobXMpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpIHtcbiAgICBjb25zdCBpc1RleHRBcmVhID0gaW5wdXQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJztcbiAgICBjb25zdCBkZXNjcmlwdG9yID0gaXNUZXh0QXJlYVxuICAgICAgICA/IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3Iod2luZG93LkhUTUxUZXh0QXJlYUVsZW1lbnQucHJvdG90eXBlLCAndmFsdWUnKVxuICAgICAgICA6IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3Iod2luZG93LkhUTUxJbnB1dEVsZW1lbnQucHJvdG90eXBlLCAndmFsdWUnKTtcblxuICAgIGlmIChkZXNjcmlwdG9yICYmIGRlc2NyaXB0b3Iuc2V0KSB7XG4gICAgICAgIGRlc2NyaXB0b3Iuc2V0LmNhbGwoaW5wdXQsIHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBpbnB1dC52YWx1ZSA9IHZhbHVlO1xuICAgIH1cbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplVGV4dCh2YWx1ZSkge1xyXG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSA/PyAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKS50b0xvd2VyQ2FzZSgpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29lcmNlQm9vbGVhbih2YWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdmFsdWU7XHJcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykgcmV0dXJuIHZhbHVlICE9PSAwICYmICFOdW1iZXIuaXNOYU4odmFsdWUpO1xyXG5cclxuICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KHZhbHVlKTtcclxuICAgIGlmICh0ZXh0ID09PSAnJykgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIGlmIChbJ3RydWUnLCAnMScsICd5ZXMnLCAneScsICdvbicsICdjaGVja2VkJ10uaW5jbHVkZXModGV4dCkpIHJldHVybiB0cnVlO1xyXG4gICAgaWYgKFsnZmFsc2UnLCAnMCcsICdubycsICduJywgJ29mZicsICd1bmNoZWNrZWQnXS5pbmNsdWRlcyh0ZXh0KSkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG4iLCAiZXhwb3J0IGZ1bmN0aW9uIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKSB7XHJcbiAgICBjb25zdCBhbGxNYXRjaGVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuXHJcbiAgICBpZiAoYWxsTWF0Y2hlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xyXG4gICAgaWYgKGFsbE1hdGNoZXMubGVuZ3RoID09PSAxKSByZXR1cm4gYWxsTWF0Y2hlc1swXTtcclxuXHJcbiAgICAvLyBNdWx0aXBsZSBtYXRjaGVzIC0gcHJlZmVyIHRoZSBvbmUgaW4gdGhlIGFjdGl2ZS90b3Btb3N0IGNvbnRleHRcclxuXHJcbiAgICAvLyBQcmlvcml0eSAxOiBFbGVtZW50IGluIGFuIGFjdGl2ZSBkaWFsb2cvbW9kYWwgKGNoaWxkIGZvcm1zKVxyXG4gICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgY29uc3QgZGlhbG9nID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyLCAuZmx5b3V0LWNvbnRhaW5lciwgW3JvbGU9XCJkaWFsb2dcIl0nKTtcclxuICAgICAgICBpZiAoZGlhbG9nICYmIGlzRWxlbWVudFZpc2libGUoZGlhbG9nKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gZGlhbG9nIGNvbnRleHRgKTtcclxuICAgICAgICAgICAgcmV0dXJuIGVsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSAyOiBFbGVtZW50IGluIGEgRmFzdFRhYiBvciBUYWJQYWdlIHRoYXQncyBleHBhbmRlZC9hY3RpdmVcclxuICAgIGZvciAoY29uc3QgZWwgb2YgYWxsTWF0Y2hlcykge1xyXG4gICAgICAgIGNvbnN0IHRhYlBhZ2UgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIlRhYlBhZ2VcIl0sIC50YWJQYWdlJyk7XHJcbiAgICAgICAgaWYgKHRhYlBhZ2UpIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIHRhYiBpcyBleHBhbmRlZFxyXG4gICAgICAgICAgICBjb25zdCBpc0V4cGFuZGVkID0gdGFiUGFnZS5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFiUGFnZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICF0YWJQYWdlLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJyk7XHJcbiAgICAgICAgICAgIGlmIChpc0V4cGFuZGVkICYmIGlzRWxlbWVudFZpc2libGUoZWwpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gZXhwYW5kZWQgdGFiIGNvbnRleHRgKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBlbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSAzOiBFbGVtZW50IGluIHRoZSBmb3JtIGNvbnRleHQgdGhhdCBoYXMgZm9jdXMgb3Igd2FzIHJlY2VudGx5IGludGVyYWN0ZWQgd2l0aFxyXG4gICAgY29uc3QgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XHJcbiAgICBpZiAoYWN0aXZlRWxlbWVudCAmJiBhY3RpdmVFbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlRm9ybUNvbnRleHQgPSBhY3RpdmVFbGVtZW50LmNsb3Nlc3QoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdLCBbZGF0YS1keW4tcm9sZT1cIkZvcm1cIl0nKTtcclxuICAgICAgICBpZiAoYWN0aXZlRm9ybUNvbnRleHQpIHtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYWN0aXZlRm9ybUNvbnRleHQuY29udGFpbnMoZWwpICYmIGlzRWxlbWVudFZpc2libGUoZWwpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYEZvdW5kICR7Y29udHJvbE5hbWV9IGluIGFjdGl2ZSBmb3JtIGNvbnRleHRgKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZWw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJpb3JpdHkgNDogQW55IHZpc2libGUgZWxlbWVudCAocHJlZmVyIGxhdGVyIG9uZXMgYXMgdGhleSdyZSBvZnRlbiBpbiBjaGlsZCBmb3JtcyByZW5kZXJlZCBvbiB0b3ApXHJcbiAgICBjb25zdCB2aXNpYmxlTWF0Y2hlcyA9IEFycmF5LmZyb20oYWxsTWF0Y2hlcykuZmlsdGVyKGVsID0+IGlzRWxlbWVudFZpc2libGUoZWwpKTtcclxuICAgIGlmICh2aXNpYmxlTWF0Y2hlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgLy8gUmV0dXJuIHRoZSBsYXN0IHZpc2libGUgbWF0Y2ggKG9mdGVuIHRoZSBjaGlsZCBmb3JtJ3MgZWxlbWVudClcclxuICAgICAgICByZXR1cm4gdmlzaWJsZU1hdGNoZXNbdmlzaWJsZU1hdGNoZXMubGVuZ3RoIC0gMV07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmFsbGJhY2s6IGZpcnN0IG1hdGNoXHJcbiAgICByZXR1cm4gYWxsTWF0Y2hlc1swXTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGUoZWwpIHtcclxuICAgIGlmICghZWwpIHJldHVybiBmYWxzZTtcclxuICAgIGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIGNvbnN0IHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpO1xyXG4gICAgcmV0dXJuIHJlY3Qud2lkdGggPiAwICYmXHJcbiAgICAgICAgICAgcmVjdC5oZWlnaHQgPiAwICYmXHJcbiAgICAgICAgICAgc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnICYmXHJcbiAgICAgICAgICAgc3R5bGUudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICAgICBzdHlsZS5vcGFjaXR5ICE9PSAnMCc7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0QzNjVMb2FkaW5nKCkge1xyXG4gICAgLy8gQ2hlY2sgZm9yIGNvbW1vbiBEMzY1IGxvYWRpbmcgaW5kaWNhdG9yc1xyXG4gICAgY29uc3QgbG9hZGluZ1NlbGVjdG9ycyA9IFtcclxuICAgICAgICAnLmR5bi1sb2FkaW5nLW92ZXJsYXk6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tbG9hZGluZy1pbmRpY2F0b3I6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tc3Bpbm5lcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmxvYWRpbmctaW5kaWNhdG9yOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcuZHluLW1lc3NhZ2VCdXN5Om5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICdbZGF0YS1keW4tbG9hZGluZz1cInRydWVcIl0nLFxyXG4gICAgICAgICcuYnVzeS1pbmRpY2F0b3InLFxyXG4gICAgICAgICcuZHluLWxvYWRpbmdTdHViOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknXHJcbiAgICBdO1xyXG5cclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgbG9hZGluZ1NlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGVsICYmIGVsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgZm9yIEFKQVggcmVxdWVzdHMgaW4gcHJvZ3Jlc3MgKEQzNjUgc3BlY2lmaWMpXHJcbiAgICBpZiAod2luZG93LiRkeW4gJiYgd2luZG93LiRkeW4uaXNQcm9jZXNzaW5nKSB7XHJcbiAgICAgICAgcmV0dXJuIHdpbmRvdy4kZHluLmlzUHJvY2Vzc2luZygpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpIHtcclxuICAgIC8vIEZpcnN0LCB0cnkgdG8gZmluZCBpbiBhbiBhY3RpdmUvc2VsZWN0ZWQgcm93ICh0cmFkaXRpb25hbCBEMzY1IGdyaWRzKVxyXG4gICAgY29uc3Qgc2VsZWN0ZWRSb3dzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXNlbGVjdGVkPVwidHJ1ZVwiXSwgW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZHluLXNlbGVjdGVkUm93Jyk7XHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiBzZWxlY3RlZFJvd3MpIHtcclxuICAgICAgICBjb25zdCBjZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNlbGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyeSBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcyAtIGZpbmQgYWN0aXZlIHJvd1xyXG4gICAgY29uc3QgcmVhY3RHcmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgLy8gTG9vayBmb3IgYWN0aXZlL3NlbGVjdGVkIHJvd1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2RhdGEtZHluLXJvdy1hY3RpdmU9XCJ0cnVlXCJdJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZVJvdykge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gYWN0aXZlUm93LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgICAgIGlmIChjZWxsICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgaW4gYm9keSByb3dzXHJcbiAgICAgICAgY29uc3QgYm9keUNvbnRhaW5lciA9IGdyaWQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHksIC5maXhlZERhdGFUYWJsZUxheW91dF9yb3dzQ29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGJvZHlDb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xyXG4gICAgICAgICAgICAgICAgLy8gU2tpcCBpZiBpbiBoZWFkZXJcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzSW5IZWFkZXIgPSBjZWxsLmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUxheW91dF9oZWFkZXIsIC5keW4taGVhZGVyQ2VsbCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFpc0luSGVhZGVyICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNlbGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJ5IHRvIGZpbmQgaW4gdHJhZGl0aW9uYWwgRDM2NSBncmlkIGNvbnRleHRcclxuICAgIGNvbnN0IGdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgZ3JpZHMpIHtcclxuICAgICAgICAvLyBGaW5kIGFsbCBtYXRjaGluZyBjZWxscyBhbmQgcHJlZmVyIHZpc2libGUvZWRpdGFibGUgb25lc1xyXG4gICAgICAgIGNvbnN0IGNlbGxzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGluIGEgZGF0YSByb3cgKG5vdCBoZWFkZXIpXHJcbiAgICAgICAgICAgIGNvbnN0IGlzSW5IZWFkZXIgPSBjZWxsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXSwgdGhlYWQnKTtcclxuICAgICAgICAgICAgaWYgKCFpc0luSGVhZGVyICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBGYWxsYmFjayB0byBzdGFuZGFyZCBlbGVtZW50IGZpbmRpbmdcclxuICAgIHJldHVybiBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBoYXNMb29rdXBCdXR0b24oZWxlbWVudCkge1xyXG4gICAgcmV0dXJuIGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmaWVsZC1oYXNMb29rdXBCdXR0b24nKSB8fFxyXG4gICAgICAgIGVsZW1lbnQucXVlcnlTZWxlY3RvcignLmxvb2t1cC1idXR0b24sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwQnV0dG9uXCJdJykgIT09IG51bGwgfHxcclxuICAgICAgICBlbGVtZW50Lm5leHRFbGVtZW50U2libGluZz8uY2xhc3NMaXN0LmNvbnRhaW5zKCdsb29rdXAtYnV0dG9uJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9va3VwQnV0dG9uKGVsZW1lbnQpIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFsnLmxvb2t1cC1idXR0b24nLCAnLmxvb2t1cEJ1dHRvbicsICdbZGF0YS1keW4tcm9sZT1cIkxvb2t1cEJ1dHRvblwiXSddO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBkaXJlY3QgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChkaXJlY3QpIHJldHVybiBkaXJlY3Q7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5pbnB1dF9jb250YWluZXIsIC5mb3JtLWdyb3VwLCAubG9va3VwRmllbGQnKSB8fCBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuIG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGluQ29udGFpbmVyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChpbkNvbnRhaW5lcikgcmV0dXJuIGluQ29udGFpbmVyO1xyXG4gICAgfVxyXG4gICAgY29uc3QgYXJpYUJ1dHRvbiA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdidXR0b25bYXJpYS1sYWJlbCo9XCJMb29rdXBcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIk9wZW5cIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIlNlbGVjdFwiXScpO1xyXG4gICAgaWYgKGFyaWFCdXR0b24pIHJldHVybiBhcmlhQnV0dG9uO1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKGVsZW1lbnQpIHtcclxuICAgIGlmICghZWxlbWVudCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcclxuICAgIHJldHVybiBlbGVtZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJlxyXG4gICAgICAgIHN0eWxlLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcGlja05lYXJlc3RSb3dzKHJvd3MsIHRhcmdldEVsZW1lbnQpIHtcclxuICAgIGlmICghcm93cy5sZW5ndGgpIHJldHVybiByb3dzO1xyXG4gICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRhcmdldEVsZW1lbnQ/LmdldEJvdW5kaW5nQ2xpZW50UmVjdD8uKCk7XHJcbiAgICBpZiAoIXRhcmdldFJlY3QpIHJldHVybiByb3dzO1xyXG4gICAgcmV0dXJuIHJvd3Muc2xpY2UoKS5zb3J0KChhLCBiKSA9PiB7XHJcbiAgICAgICAgY29uc3QgcmEgPSBhLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IHJiID0gYi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBkYSA9IE1hdGguYWJzKHJhLmxlZnQgLSB0YXJnZXRSZWN0LmxlZnQpICsgTWF0aC5hYnMocmEudG9wIC0gdGFyZ2V0UmVjdC5ib3R0b20pO1xyXG4gICAgICAgIGNvbnN0IGRiID0gTWF0aC5hYnMocmIubGVmdCAtIHRhcmdldFJlY3QubGVmdCkgKyBNYXRoLmFicyhyYi50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgcmV0dXJuIGRhIC0gZGI7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMb29rdXBGaWx0ZXJJbnB1dChsb29rdXBEb2NrKSB7XHJcbiAgICBpZiAoIWxvb2t1cERvY2spIHJldHVybiBudWxsO1xyXG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmZyb20oXHJcbiAgICAgICAgbG9va3VwRG9jay5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwidGV4dFwiXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKVxyXG4gICAgKTtcclxuICAgIGlmICghY2FuZGlkYXRlcy5sZW5ndGgpIHJldHVybiBudWxsO1xyXG5cclxuICAgIC8vIFByZWZlciBpbnB1dHMgaW5zaWRlIHNlZ21lbnRlZCBlbnRyeSBmbHlvdXQgKE1haW5BY2NvdW50IGlucHV0IGluIHRoZSByaWdodCBwYW5lbClcclxuICAgIGNvbnN0IHNlZ21lbnRJbnB1dCA9IGNhbmRpZGF0ZXMuZmluZChpbnB1dCA9PiBpbnB1dC5jbG9zZXN0KCcuc2VnbWVudGVkRW50cnktZmx5b3V0U2VnbWVudCcpKTtcclxuICAgIGlmIChzZWdtZW50SW5wdXQpIHJldHVybiBzZWdtZW50SW5wdXQ7XHJcblxyXG4gICAgLy8gU29tZSBmbHlvdXRzIHdyYXAgdGhlIGlucHV0IGluIGEgY29udGFpbmVyOyB0cnkgdG8gZmluZCB0aGUgYWN0dWFsIGlucHV0IGluc2lkZVxyXG4gICAgY29uc3Qgc2VnbWVudENvbnRhaW5lciA9IGxvb2t1cERvY2sucXVlcnlTZWxlY3RvcignLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQgLnNlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCcpO1xyXG4gICAgaWYgKHNlZ21lbnRDb250YWluZXIpIHtcclxuICAgICAgICBjb25zdCBpbm5lciA9IHNlZ21lbnRDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgICAgIGlmIChpbm5lcikgcmV0dXJuIGlubmVyO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFByZWZlciBpbnB1dHMgaW5zaWRlIGdyaWQgaGVhZGVyL3Rvb2xiYXIgb3IgbmVhciB0aGUgdG9wLXJpZ2h0IChsaWtlIHRoZSBtYXJrZWQgYm94KVxyXG4gICAgY29uc3QgaGVhZGVyQ2FuZGlkYXRlID0gY2FuZGlkYXRlcy5maW5kKGlucHV0ID0+XHJcbiAgICAgICAgaW5wdXQuY2xvc2VzdCgnLmxvb2t1cC1oZWFkZXIsIC5sb29rdXAtdG9vbGJhciwgLmdyaWQtaGVhZGVyLCBbcm9sZT1cInRvb2xiYXJcIl0nKVxyXG4gICAgKTtcclxuICAgIGlmIChoZWFkZXJDYW5kaWRhdGUpIHJldHVybiBoZWFkZXJDYW5kaWRhdGU7XHJcblxyXG4gICAgbGV0IGJlc3QgPSBjYW5kaWRhdGVzWzBdO1xyXG4gICAgbGV0IGJlc3RTY29yZSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcclxuICAgIGZvciAoY29uc3QgaW5wdXQgb2YgY2FuZGlkYXRlcykge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSBpbnB1dC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBzY29yZSA9IHJlY3QudG9wICogMiArIHJlY3QubGVmdDsgLy8gYmlhcyB0b3dhcmRzIHRvcCByb3dcclxuICAgICAgICBpZiAoc2NvcmUgPCBiZXN0U2NvcmUpIHtcclxuICAgICAgICAgICAgYmVzdFNjb3JlID0gc2NvcmU7XHJcbiAgICAgICAgICAgIGJlc3QgPSBpbnB1dDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYmVzdDtcclxufVxyXG4iLCAiaW1wb3J0IHsgc2xlZXAgfSBmcm9tICcuL2FzeW5jLmpzJztcclxuaW1wb3J0IHsgaXNFbGVtZW50VmlzaWJsZUdsb2JhbCwgcGlja05lYXJlc3RSb3dzIH0gZnJvbSAnLi9kb20uanMnO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMb29rdXBQb3B1cCh0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJy5sb29rdXAtYnV0dG9uQ29udGFpbmVyJyxcclxuICAgICAgICAnLmxvb2t1cERvY2stYnV0dG9uQ29udGFpbmVyJyxcclxuICAgICAgICAnW3JvbGU9XCJkaWFsb2dcIl0nLFxyXG4gICAgICAgICcubG9va3VwLWZseW91dCcsXHJcbiAgICAgICAgJy5sb29rdXBGbHlvdXQnLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkxvb2t1cFwiXScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwR3JpZFwiXScsXHJcbiAgICAgICAgJy5sb29rdXAtY29udGFpbmVyJyxcclxuICAgICAgICAnLmxvb2t1cCcsXHJcbiAgICAgICAgJ1tyb2xlPVwiZ3JpZFwiXScsXHJcbiAgICAgICAgJ3RhYmxlJ1xyXG4gICAgXTtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgICAgICBjb25zdCBwb3B1cCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgICAgICBpZiAoIXBvcHVwKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKHBvcHVwLmNsYXNzTGlzdD8uY29udGFpbnMoJ21lc3NhZ2VDZW50ZXInKSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChwb3B1cC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSA9PT0gJ0FjdGlvbiBjZW50ZXInKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKHBvcHVwKSkgY29udGludWU7XHJcbiAgICAgICAgICAgIHJldHVybiBwb3B1cDtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvb2t1cFJvd3MobG9va3VwRG9jaywgdGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMzAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGxldCByb3dzID0gbG9va3VwRG9jaz8ucXVlcnlTZWxlY3RvckFsbD8uKCd0cltkYXRhLWR5bi1yb3ddLCAubG9va3VwLXJvdywgW3JvbGU9XCJyb3dcIl0nKSB8fCBbXTtcclxuICAgICAgICBpZiAocm93cy5sZW5ndGgpIHJldHVybiByb3dzO1xyXG5cclxuICAgICAgICAvLyBGYWxsYmFjazogZmluZCB2aXNpYmxlIGxvb2t1cCByb3dzIGFueXdoZXJlIChzb21lIGRvY2tzIHJlbmRlciBvdXRzaWRlIHRoZSBjb250YWluZXIpXHJcbiAgICAgICAgY29uc3QgZ2xvYmFsUm93cyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndHJbZGF0YS1keW4tcm93XSwgLmxvb2t1cC1yb3csIFtyb2xlPVwicm93XCJdJykpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbCk7XHJcbiAgICAgICAgaWYgKGdsb2JhbFJvd3MubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwaWNrTmVhcmVzdFJvd3MoZ2xvYmFsUm93cywgdGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDE1MCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gW107XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQodGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMzAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRhcmdldEVsZW1lbnQ/LmdldEJvdW5kaW5nQ2xpZW50UmVjdD8uKCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgZG9ja3MgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5sb29rdXBEb2NrLWJ1dHRvbkNvbnRhaW5lcicpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoZG9jayA9PiAhZG9jay5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdtZXNzYWdlQ2VudGVyJykpO1xyXG5cclxuICAgICAgICBpZiAoZG9ja3MubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHdpdGhSb3dzID0gZG9ja3MuZmlsdGVyKGRvY2sgPT4gZG9jay5xdWVyeVNlbGVjdG9yKCd0cltkYXRhLWR5bi1yb3ddLCAubG9va3VwLXJvdywgW3JvbGU9XCJyb3dcIl0sIFtyb2xlPVwiZ3JpZFwiXSwgdGFibGUnKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSB3aXRoUm93cy5sZW5ndGggPyB3aXRoUm93cyA6IGRvY2tzO1xyXG4gICAgICAgICAgICBjb25zdCBiZXN0ID0gcGlja05lYXJlc3REb2NrKGNhbmRpZGF0ZXMsIHRhcmdldFJlY3QpO1xyXG4gICAgICAgICAgICBpZiAoYmVzdCkgcmV0dXJuIGJlc3Q7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBpY2tOZWFyZXN0RG9jayhkb2NrcywgdGFyZ2V0UmVjdCkge1xyXG4gICAgaWYgKCFkb2Nrcy5sZW5ndGgpIHJldHVybiBudWxsO1xyXG4gICAgaWYgKCF0YXJnZXRSZWN0KSByZXR1cm4gZG9ja3NbMF07XHJcbiAgICBsZXQgYmVzdCA9IGRvY2tzWzBdO1xyXG4gICAgbGV0IGJlc3RTY29yZSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcclxuICAgIGZvciAoY29uc3QgZG9jayBvZiBkb2Nrcykge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSBkb2NrLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IGR4ID0gTWF0aC5hYnMocmVjdC5sZWZ0IC0gdGFyZ2V0UmVjdC5sZWZ0KTtcclxuICAgICAgICBjb25zdCBkeSA9IE1hdGguYWJzKHJlY3QudG9wIC0gdGFyZ2V0UmVjdC5ib3R0b20pO1xyXG4gICAgICAgIGNvbnN0IHNjb3JlID0gZHggKyBkeTtcclxuICAgICAgICBpZiAoc2NvcmUgPCBiZXN0U2NvcmUpIHtcclxuICAgICAgICAgICAgYmVzdFNjb3JlID0gc2NvcmU7XHJcbiAgICAgICAgICAgIGJlc3QgPSBkb2NrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBiZXN0O1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxpc3Rib3hGb3JFbGVtZW50KHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFsnW3JvbGU9XCJsaXN0Ym94XCJdJywgJy5kcm9wRG93bkxpc3QnLCAnLmNvbWJvQm94RHJvcERvd24nLCAnLmRyb3Bkb3duLW1lbnUnLCAnLmRyb3Bkb3duLWxpc3QnXTtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIGNvbnN0IHRhcmdldFJlY3QgPSB0YXJnZXRFbGVtZW50Py5nZXRCb3VuZGluZ0NsaWVudFJlY3Q/LigpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGxpc3RzID0gc2VsZWN0b3JzLmZsYXRNYXAoc2VsID0+IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChzZWwpKSlcclxuICAgICAgICAgICAgLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKTtcclxuICAgICAgICBpZiAobGlzdHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwaWNrTmVhcmVzdERvY2sobGlzdHMsIHRhcmdldFJlY3QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTGlzdGJveEZvcklucHV0KGlucHV0LCB0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgbGlua2VkID0gZ2V0TGlzdGJveEZyb21JbnB1dChpbnB1dCk7XHJcbiAgICAgICAgaWYgKGxpbmtlZCAmJiBpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKGxpbmtlZCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGxpbmtlZDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZmFsbGJhY2sgPSBhd2FpdCB3YWl0Rm9yTGlzdGJveEZvckVsZW1lbnQodGFyZ2V0RWxlbWVudCwgMjAwKTtcclxuICAgICAgICBpZiAoZmFsbGJhY2spIHJldHVybiBmYWxsYmFjaztcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRMaXN0Ym94RnJvbUlucHV0KGlucHV0KSB7XHJcbiAgICBpZiAoIWlucHV0KSByZXR1cm4gbnVsbDtcclxuICAgIGNvbnN0IGlkID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJykgfHwgaW5wdXQuZ2V0QXR0cmlidXRlKCdhcmlhLW93bnMnKTtcclxuICAgIGlmIChpZCkge1xyXG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xyXG4gICAgICAgIGlmIChlbCkgcmV0dXJuIGVsO1xyXG4gICAgfVxyXG4gICAgY29uc3QgYWN0aXZlSWQgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcpO1xyXG4gICAgaWYgKGFjdGl2ZUlkKSB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlSWQpO1xyXG4gICAgICAgIGNvbnN0IGxpc3QgPSBhY3RpdmU/LmNsb3Nlc3Q/LignW3JvbGU9XCJsaXN0Ym94XCJdJyk7XHJcbiAgICAgICAgaWYgKGxpc3QpIHJldHVybiBsaXN0O1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kQ29tYm9Cb3hCdXR0b24oZWxlbWVudCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcubG9va3VwQnV0dG9uJyxcclxuICAgICAgICAnLmNvbWJvQm94LWJ1dHRvbicsXHJcbiAgICAgICAgJy5jb21ib0JveC1kcm9wRG93bkJ1dHRvbicsXHJcbiAgICAgICAgJy5kcm9wZG93bkJ1dHRvbicsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiRHJvcERvd25CdXR0b25cIl0nLFxyXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJPcGVuXCJdJyxcclxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VsZWN0XCJdJ1xyXG4gICAgXTtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgYnRuID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoYnRuKSByZXR1cm4gYnRuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuaW5wdXRfY29udGFpbmVyLCAuZm9ybS1ncm91cCcpIHx8IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuICAgIGlmICghY29udGFpbmVyKSByZXR1cm4gbnVsbDtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgYnRuID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChidG4pIHJldHVybiBidG47XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbGxlY3RDb21ib09wdGlvbnMobGlzdGJveCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAgICdbcm9sZT1cIm9wdGlvblwiXScsXHJcbiAgICAgICAgJy5jb21ib0JveC1saXN0SXRlbScsXHJcbiAgICAgICAgJy5jb21ib0JveC1pdGVtJyxcclxuICAgICAgICAnbGknLFxyXG4gICAgICAgICcuZHJvcGRvd24tbGlzdC1pdGVtJyxcclxuICAgICAgICAnLmNvbWJvQm94SXRlbScsXHJcbiAgICAgICAgJy5kcm9wRG93bkxpc3RJdGVtJyxcclxuICAgICAgICAnLmRyb3Bkb3duLWl0ZW0nXHJcbiAgICBdO1xyXG4gICAgY29uc3QgZm91bmQgPSBbXTtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgbGlzdGJveC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgaWYgKGlzRWxlbWVudFZpc2libGVHbG9iYWwoZWwpKSBmb3VuZC5wdXNoKGVsKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiBmb3VuZC5sZW5ndGggPyBmb3VuZCA6IEFycmF5LmZyb20obGlzdGJveC5jaGlsZHJlbikuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBzbGVlcCwgc2V0TmF0aXZlVmFsdWUgfSBmcm9tICcuL2FzeW5jLmpzJztcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0eXBlVmFsdWVTbG93bHkoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIGlucHV0LmNsaWNrID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgIH1cclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFR5cGUgY2hhcmFjdGVyIGJ5IGNoYXJhY3RlclxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgYnVmZmVyKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODApOyAvLyA4MG1zIHBlciBjaGFyYWN0ZXJcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5ibHVyKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg4MDApOyAvLyBXYWl0IGZvciB2YWxpZGF0aW9uXHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0eXBlVmFsdWVXaXRoSW5wdXRFdmVudHMoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIGlucHV0LmNsaWNrID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgIH1cclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg4MCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUgPz8gJycpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgYnVmZmVyKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0JywgeyBkYXRhOiBjaGFyLCBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNjApO1xyXG4gICAgfVxyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCB2YWx1ZSwgdGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3QgZXhwZWN0ZWQgPSBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKTtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBjdXJyZW50ID0gU3RyaW5nKGlucHV0Py52YWx1ZSA/PyAnJykudHJpbSgpO1xyXG4gICAgICAgIGlmIChjdXJyZW50ID09PSBleHBlY3RlZCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFZhbHVlT25jZShpbnB1dCwgdmFsdWUsIGNsZWFyRmlyc3QgPSBmYWxzZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBpZiAoY2xlYXJGaXJzdCkge1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGNvbnN0IGV4cGVjdGVkID0gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCk7XHJcbiAgICBhd2FpdCBzZXRWYWx1ZU9uY2UoaW5wdXQsIHZhbHVlLCB0cnVlKTtcclxuICAgIGF3YWl0IHNsZWVwKDE1MCk7XHJcbiAgICBpZiAoU3RyaW5nKGlucHV0LnZhbHVlID8/ICcnKS50cmltKCkgIT09IGV4cGVjdGVkKSB7XHJcbiAgICAgICAgYXdhaXQgdHlwZVZhbHVlU2xvd2x5KGlucHV0LCBleHBlY3RlZCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PSA4IENvbWJvQm94IElucHV0IE1ldGhvZHMgPT09PT09PT09PT09XHJcblxyXG4vKipcclxuICogTWV0aG9kIDE6IEJhc2ljIHNldFZhbHVlIChmYXN0IGJ1dCBtYXkgbm90IHRyaWdnZXIgRDM2NSBmaWx0ZXJpbmcpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDEoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDI6IFBhc3RlIHNpbXVsYXRpb24gd2l0aCBJbnB1dEV2ZW50XHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDIoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBDbGVhciBmaXJzdFxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnZGVsZXRlQ29udGVudEJhY2t3YXJkJ1xyXG4gICAgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFNpbXVsYXRlIHBhc3RlXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnYmVmb3JlaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21QYXN0ZScsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbVBhc3RlJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCAzOiBDaGFyYWN0ZXItYnktY2hhcmFjdGVyIHdpdGggZnVsbCBrZXkgZXZlbnRzIChSRUNPTU1FTkRFRClcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kMyhpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIENsZWFyIHRoZSBpbnB1dCBmaXJzdFxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnZGVsZXRlQ29udGVudEJhY2t3YXJkJ1xyXG4gICAgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gYnVmZmVyO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGtleWRvd25cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBiZWZvcmVpbnB1dFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2JlZm9yZWlucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIHZhbHVlXHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgaW5wdXQgZXZlbnRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUga2V5dXBcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDQ6IENoYXJhY3Rlci1ieS1jaGFyYWN0ZXIgd2l0aCBrZXlwcmVzcyAobGVnYWN5KVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q0KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnZGVsZXRlQ29udGVudEJhY2t3YXJkJ1xyXG4gICAgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgY29uc3QgY2hhckNvZGUgPSBjaGFyLmNoYXJDb2RlQXQoMCk7XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gYnVmZmVyO1xyXG5cclxuICAgICAgICAvLyBrZXlkb3duXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBrZXlwcmVzcyAoZGVwcmVjYXRlZCBidXQgc3RpbGwgdXNlZCBieSBzb21lIGZyYW1ld29ya3MpXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5cHJlc3MnLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGNoYXJDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBiZWZvcmVpbnB1dFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2JlZm9yZWlucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIHZhbHVlXHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIC8vIGlucHV0XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBrZXl1cFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDU6IGV4ZWNDb21tYW5kIGluc2VydFRleHRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIFNlbGVjdCBhbGwgYW5kIGRlbGV0ZVxyXG4gICAgaW5wdXQuc2VsZWN0KCk7XHJcbiAgICBkb2N1bWVudC5leGVjQ29tbWFuZCgnZGVsZXRlJyk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gSW5zZXJ0IHRleHRcclxuICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdpbnNlcnRUZXh0JywgZmFsc2UsIHZhbHVlKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDY6IFBhc3RlICsgQmFja3NwYWNlIHdvcmthcm91bmRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNihpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIFNldCB2YWx1ZSBkaXJlY3RseSAobGlrZSBwYXN0ZSlcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21QYXN0ZScsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIEFkZCBhIGNoYXJhY3RlciBhbmQgZGVsZXRlIGl0IHRvIHRyaWdnZXIgZmlsdGVyaW5nXHJcbiAgICBjb25zdCB2YWx1ZVdpdGhFeHRyYSA9IHZhbHVlICsgJ1gnO1xyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlV2l0aEV4dHJhKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgZGF0YTogJ1gnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIE5vdyBkZWxldGUgdGhhdCBjaGFyYWN0ZXIgd2l0aCBhIHJlYWwgYmFja3NwYWNlIGV2ZW50XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywge1xyXG4gICAgICAgIGtleTogJ0JhY2tzcGFjZScsXHJcbiAgICAgICAgY29kZTogJ0JhY2tzcGFjZScsXHJcbiAgICAgICAga2V5Q29kZTogOCxcclxuICAgICAgICB3aGljaDogOCxcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnZGVsZXRlQ29udGVudEJhY2t3YXJkJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywge1xyXG4gICAgICAgIGtleTogJ0JhY2tzcGFjZScsXHJcbiAgICAgICAgY29kZTogJ0JhY2tzcGFjZScsXHJcbiAgICAgICAga2V5Q29kZTogOCxcclxuICAgICAgICB3aGljaDogOCxcclxuICAgICAgICBidWJibGVzOiB0cnVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA3OiBEMzY1IGludGVybmFsIG1lY2hhbmlzbSB0cmlnZ2VyXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDcoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBTZXQgdmFsdWUgd2l0aCBmdWxsIGV2ZW50IHNlcXVlbmNlIHVzZWQgYnkgRDM2NVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gVHlwZSBjaGFyYWN0ZXIgYnkgY2hhcmFjdGVyIGJ1dCBhbHNvIGRpc3BhdGNoIG9uIHRoZSBwYXJlbnQgY29udHJvbFxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgY29uc3QgcGFyZW50ID0gaW5wdXQuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGVdJykgfHwgaW5wdXQucGFyZW50RWxlbWVudDtcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGlucHV0LnZhbHVlICsgY2hhcjtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGEgY29tcHJlaGVuc2l2ZSBldmVudCBzZXRcclxuICAgICAgICBjb25zdCBrZXlib2FyZEV2ZW50SW5pdCA9IHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGNvbXBvc2VkOiB0cnVlLFxyXG4gICAgICAgICAgICB2aWV3OiB3aW5kb3dcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBGaXJlIG9uIGlucHV0IGFuZCBwb3RlbnRpYWxseSBidWJibGUgdG8gRDM2NSBoYW5kbGVyc1xyXG4gICAgICAgIGNvbnN0IGtleWRvd25FdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywga2V5Ym9hcmRFdmVudEluaXQpO1xyXG4gICAgICAgIGNvbnN0IGtleXVwRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCBrZXlib2FyZEV2ZW50SW5pdCk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQoa2V5ZG93bkV2ZW50KTtcclxuXHJcbiAgICAgICAgLy8gU2V0IHZhbHVlIEJFRk9SRSBpbnB1dCBldmVudFxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvbXBvc2VkOiB0cnVlLFxyXG4gICAgICAgICAgICB2aWV3OiB3aW5kb3dcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQoa2V5dXBFdmVudCk7XHJcblxyXG4gICAgICAgIC8vIEFsc28gZGlzcGF0Y2ggb24gcGFyZW50IGZvciBEMzY1IGNvbnRyb2xzXHJcbiAgICAgICAgaWYgKHBhcmVudCAmJiBwYXJlbnQgIT09IGlucHV0KSB7XHJcbiAgICAgICAgICAgIHBhcmVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZpbmFsIGNoYW5nZSBldmVudFxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcblxyXG4gICAgLy8gVHJ5IHRvIHRyaWdnZXIgRDM2NSdzIFZhbHVlQ2hhbmdlZCBjb21tYW5kXHJcbiAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgICAgcGFyZW50LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdWYWx1ZUNoYW5nZWQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGRldGFpbDogeyB2YWx1ZTogdmFsdWUgfVxyXG4gICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDg6IENvbXBvc2l0aW9uIGV2ZW50cyAoSU1FLXN0eWxlKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q4KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBTdGFydCBjb21wb3NpdGlvblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgQ29tcG9zaXRpb25FdmVudCgnY29tcG9zaXRpb25zdGFydCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgZGF0YTogJydcclxuICAgIH0pKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgY3VycmVudFZhbHVlID0gJyc7XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGN1cnJlbnRWYWx1ZSArPSBzdHJpbmdWYWx1ZVtpXTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgQ29tcG9zaXRpb25FdmVudCgnY29tcG9zaXRpb251cGRhdGUnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGRhdGE6IGN1cnJlbnRWYWx1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRDb21wb3NpdGlvblRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjdXJyZW50VmFsdWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFbmQgY29tcG9zaXRpb25cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoJ2NvbXBvc2l0aW9uZW5kJywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21Db21wb3NpdGlvbicsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogSGVscGVyIHRvIGdldCBrZXkgY29kZSBmcm9tIGNoYXJhY3RlclxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEtleUNvZGUoY2hhcikge1xyXG4gICAgY29uc3QgdXBwZXJDaGFyID0gY2hhci50b1VwcGVyQ2FzZSgpO1xyXG4gICAgaWYgKHVwcGVyQ2hhciA+PSAnQScgJiYgdXBwZXJDaGFyIDw9ICdaJykge1xyXG4gICAgICAgIHJldHVybiAnS2V5JyArIHVwcGVyQ2hhcjtcclxuICAgIH1cclxuICAgIGlmIChjaGFyID49ICcwJyAmJiBjaGFyIDw9ICc5Jykge1xyXG4gICAgICAgIHJldHVybiAnRGlnaXQnICsgY2hhcjtcclxuICAgIH1cclxuICAgIGNvbnN0IHNwZWNpYWxLZXlzID0ge1xyXG4gICAgICAgICcgJzogJ1NwYWNlJyxcclxuICAgICAgICAnLSc6ICdNaW51cycsXHJcbiAgICAgICAgJz0nOiAnRXF1YWwnLFxyXG4gICAgICAgICdbJzogJ0JyYWNrZXRMZWZ0JyxcclxuICAgICAgICAnXSc6ICdCcmFja2V0UmlnaHQnLFxyXG4gICAgICAgICdcXFxcJzogJ0JhY2tzbGFzaCcsXHJcbiAgICAgICAgJzsnOiAnU2VtaWNvbG9uJyxcclxuICAgICAgICBcIidcIjogJ1F1b3RlJyxcclxuICAgICAgICAnLCc6ICdDb21tYScsXHJcbiAgICAgICAgJy4nOiAnUGVyaW9kJyxcclxuICAgICAgICAnLyc6ICdTbGFzaCcsXHJcbiAgICAgICAgJ2AnOiAnQmFja3F1b3RlJ1xyXG4gICAgfTtcclxuICAgIHJldHVybiBzcGVjaWFsS2V5c1tjaGFyXSB8fCAnVW5pZGVudGlmaWVkJztcclxufVxyXG5cclxuLyoqXHJcbiAqIERpc3BhdGNoZXIgZnVuY3Rpb24gLSB1c2VzIHRoZSBzZWxlY3RlZCBpbnB1dCBtZXRob2QgZnJvbSBzZXR0aW5nc1xyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlLCBtZXRob2QpIHtcclxuICAgIGNvbnNvbGUubG9nKGBbRDM2NV0gVXNpbmcgY29tYm9ib3ggaW5wdXQgbWV0aG9kOiAke21ldGhvZH1gKTtcclxuXHJcbiAgICBzd2l0Y2ggKG1ldGhvZCkge1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDEnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDEoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2QyJzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QyKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kMyc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMyhpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDQnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDQoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q1JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q1KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNic6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNihpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDcnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDcoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q4JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q4KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QzKGlucHV0LCB2YWx1ZSk7IC8vIERlZmF1bHQgdG8gbWV0aG9kIDNcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIHZhbHVlLCBlbGVtZW50KSB7XHJcbiAgICBpZiAoIWlucHV0KSByZXR1cm47XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdmb2N1c291dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRXNjYXBlJywgY29kZTogJ0VzY2FwZScsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VzY2FwZScsIGNvZGU6ICdFc2NhcGUnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmJsdXIoKTtcclxuICAgIGlmIChlbGVtZW50KSB7XHJcbiAgICAgICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIH1cclxuICAgIGRvY3VtZW50LmJvZHk/LmNsaWNrPy4oKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZSh0YXJnZXQpIHtcclxuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJ1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuY2xpY2soKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgbG9nU3RlcCB9IGZyb20gJy4uL3V0aWxzL2xvZ2dpbmcuanMnO1xyXG5pbXBvcnQgeyBzZXROYXRpdmVWYWx1ZSwgc2xlZXAgfSBmcm9tICcuLi91dGlscy9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0LCBpc0VsZW1lbnRWaXNpYmxlLCBpc0QzNjVMb2FkaW5nLCBmaW5kR3JpZENlbGxFbGVtZW50LCBoYXNMb29rdXBCdXR0b24sIGZpbmRMb29rdXBCdXR0b24sIGZpbmRMb29rdXBGaWx0ZXJJbnB1dCB9IGZyb20gJy4uL3V0aWxzL2RvbS5qcyc7XHJcbmltcG9ydCB7IHdhaXRGb3JMb29rdXBQb3B1cCwgd2FpdEZvckxvb2t1cFJvd3MsIHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudCwgd2FpdEZvckxpc3Rib3hGb3JJbnB1dCwgY29sbGVjdENvbWJvT3B0aW9ucywgZmluZENvbWJvQm94QnV0dG9uIH0gZnJvbSAnLi4vdXRpbHMvbG9va3VwLmpzJztcclxuaW1wb3J0IHsgdHlwZVZhbHVlU2xvd2x5LCB0eXBlVmFsdWVXaXRoSW5wdXRFdmVudHMsIHdhaXRGb3JJbnB1dFZhbHVlLCBzZXRWYWx1ZU9uY2UsIHNldFZhbHVlV2l0aFZlcmlmeSwgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZCBhcyBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUsIGNvbW1pdENvbWJvVmFsdWUsIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZSB9IGZyb20gJy4uL3V0aWxzL2NvbWJvYm94LmpzJztcclxuaW1wb3J0IHsgY29lcmNlQm9vbGVhbiwgbm9ybWFsaXplVGV4dCB9IGZyb20gJy4uL3V0aWxzL3RleHQuanMnO1xyXG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuLi9ydW50aW1lL2Vycm9ycy5qcyc7XHJcblxyXG5mdW5jdGlvbiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgY29uc3QgbWV0aG9kID0gd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uY29tYm9TZWxlY3RNb2RlIHx8ICdtZXRob2QzJztcclxuICAgIHJldHVybiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUoaW5wdXQsIHZhbHVlLCBtZXRob2QpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpIHtcclxuICAgIGlmICghZWxlbWVudCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIGlmIChlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnU2VnbWVudGVkRW50cnknKSByZXR1cm4gdHJ1ZTtcclxuICAgIGlmIChlbGVtZW50LmNsb3Nlc3Q/LignW2RhdGEtZHluLXJvbGU9XCJTZWdtZW50ZWRFbnRyeVwiXScpKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICBjb25zdCBjbGFzc0xpc3QgPSBlbGVtZW50LmNsYXNzTGlzdDtcclxuICAgIGlmIChjbGFzc0xpc3QgJiYgKGNsYXNzTGlzdC5jb250YWlucygnc2VnbWVudGVkRW50cnknKSB8fFxyXG4gICAgICAgIGNsYXNzTGlzdC5jb250YWlucygnc2VnbWVudGVkLWVudHJ5JykgfHxcclxuICAgICAgICBjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCcpKSkge1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiAhIWVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCcuc2VnbWVudGVkRW50cnktc2VnbWVudElucHV0LCAuc2VnbWVudGVkRW50cnktZmx5b3V0U2VnbWVudCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xpY2tFbGVtZW50KGNvbnRyb2xOYW1lKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgXHJcbiAgICBlbGVtZW50LmNsaWNrKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlHcmlkRmlsdGVyKGNvbnRyb2xOYW1lLCBmaWx0ZXJWYWx1ZSwgZmlsdGVyTWV0aG9kID0gJ2lzIGV4YWN0bHknKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgQXBwbHlpbmcgZmlsdGVyOiAke2NvbnRyb2xOYW1lfSAke2ZpbHRlck1ldGhvZH0gXCIke2ZpbHRlclZhbHVlfVwiYCk7XHJcbiAgICBcclxuICAgIC8vIEV4dHJhY3QgZ3JpZCBuYW1lIGFuZCBjb2x1bW4gbmFtZSBmcm9tIGNvbnRyb2xOYW1lXHJcbiAgICAvLyBGb3JtYXQ6IEdyaWROYW1lX0NvbHVtbk5hbWUgKGUuZy4sIFwiR3JpZFJlYWRPbmx5TWFya3VwVGFibGVfTWFya3VwQ29kZVwiKVxyXG4gICAgY29uc3QgbGFzdFVuZGVyc2NvcmVJZHggPSBjb250cm9sTmFtZS5sYXN0SW5kZXhPZignXycpO1xyXG4gICAgY29uc3QgZ3JpZE5hbWUgPSBjb250cm9sTmFtZS5zdWJzdHJpbmcoMCwgbGFzdFVuZGVyc2NvcmVJZHgpO1xyXG4gICAgY29uc3QgY29sdW1uTmFtZSA9IGNvbnRyb2xOYW1lLnN1YnN0cmluZyhsYXN0VW5kZXJzY29yZUlkeCArIDEpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgICBHcmlkOiAke2dyaWROYW1lfSwgQ29sdW1uOiAke2NvbHVtbk5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiB0byBmaW5kIGZpbHRlciBpbnB1dCB3aXRoIG11bHRpcGxlIHBhdHRlcm5zXHJcbiAgICBhc3luYyBmdW5jdGlvbiBmaW5kRmlsdGVySW5wdXQoKSB7XHJcbiAgICAgICAgLy8gRDM2NSBjcmVhdGVzIGZpbHRlciBpbnB1dHMgd2l0aCB2YXJpb3VzIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgZmlsdGVyRmllbGRQYXR0ZXJucyA9IFtcclxuICAgICAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcclxuICAgICAgICAgICAgYEZpbHRlckZpZWxkXyR7Y29udHJvbE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXHJcbiAgICAgICAgICAgIGBGaWx0ZXJGaWVsZF8ke2NvbnRyb2xOYW1lfV9JbnB1dF8wYCxcclxuICAgICAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXHJcbiAgICAgICAgICAgIC8vIEFkZGl0aW9uYWwgcGF0dGVybnMgZm9yIGRpZmZlcmVudCBEMzY1IHZlcnNpb25zXHJcbiAgICAgICAgICAgIGAke2NvbnRyb2xOYW1lfV9GaWx0ZXJGaWVsZF9JbnB1dGAsXHJcbiAgICAgICAgICAgIGAke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9X0ZpbHRlckZpZWxkYFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IGZpbHRlcklucHV0ID0gbnVsbDtcclxuICAgICAgICBsZXQgZmlsdGVyRmllbGRDb250YWluZXIgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBleGFjdCBwYXR0ZXJucyBmaXJzdFxyXG4gICAgICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBmaWx0ZXJGaWVsZFBhdHRlcm5zKSB7XHJcbiAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtwYXR0ZXJufVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVyRmllbGRDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGZpbHRlcklucHV0ID0gZmlsdGVyRmllbGRDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgZmlsdGVyIGZpZWxkOiAke3BhdHRlcm59YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHBhcnRpYWwgbWF0Y2ggb24gRmlsdGVyRmllbGQgY29udGFpbmluZyB0aGUgY29sdW1uIG5hbWVcclxuICAgICAgICBjb25zdCBwYXJ0aWFsTWF0Y2hlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXVtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCIke2NvbHVtbk5hbWV9XCJdYCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBjb250YWluZXIgb2YgcGFydGlhbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGb3VuZCBmaWx0ZXIgZmllbGQgKHBhcnRpYWwgbWF0Y2gpOiAke2NvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyl9YCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXI6IGNvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBGaW5kIGFueSB2aXNpYmxlIGZpbHRlciBpbnB1dCBpbiBmaWx0ZXIgZHJvcGRvd24vZmx5b3V0IGFyZWFcclxuICAgICAgICAvLyBMb29rIGZvciBpbnB1dHMgaW5zaWRlIGZpbHRlci1yZWxhdGVkIGNvbnRhaW5lcnNcclxuICAgICAgICBjb25zdCBmaWx0ZXJDb250YWluZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmR5bi1maWx0ZXItcG9wdXAsIC5maWx0ZXItcGFuZWwsIFtkYXRhLWR5bi1yb2xlPVwiRmlsdGVyUGFuZVwiXSwgW2NsYXNzKj1cImZpbHRlclwiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIGZpbHRlckNvbnRhaW5lcnMpIHtcclxuICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKTpub3QoW3JlYWRvbmx5XSknKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgZmlsdGVyIGlucHV0IGluIGZpbHRlciBjb250YWluZXJgKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lcjogY29udGFpbmVyIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTGFzdCByZXNvcnQ6IEFueSB2aXNpYmxlIEZpbHRlckZpZWxkIGlucHV0XHJcbiAgICAgICAgY29uc3QgdmlzaWJsZUZpbHRlcklucHV0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXSBpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBpbnAgb2YgdmlzaWJsZUZpbHRlcklucHV0cykge1xyXG4gICAgICAgICAgICBpZiAoaW5wLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgZmlsdGVyRmllbGRDb250YWluZXIgPSBpbnAuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlckZpZWxkXCJdJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGb3VuZCB2aXNpYmxlIGZpbHRlciBmaWVsZDogJHtmaWx0ZXJGaWVsZENvbnRhaW5lcj8uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQ6IGlucCwgZmlsdGVyRmllbGRDb250YWluZXIgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dDogbnVsbCwgZmlsdGVyRmllbGRDb250YWluZXI6IG51bGwgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmlyc3QsIGNoZWNrIGlmIHRoZSBmaWx0ZXIgcGFuZWwgaXMgYWxyZWFkeSBvcGVuXHJcbiAgICBsZXQgeyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXIgfSA9IGF3YWl0IGZpbmRGaWx0ZXJJbnB1dCgpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBmaWx0ZXIgaW5wdXQgbm90IGZvdW5kLCB3ZSBuZWVkIHRvIGNsaWNrIHRoZSBjb2x1bW4gaGVhZGVyIHRvIG9wZW4gdGhlIGZpbHRlciBkcm9wZG93blxyXG4gICAgaWYgKCFmaWx0ZXJJbnB1dCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIEZpbHRlciBwYW5lbCBub3Qgb3BlbiwgY2xpY2tpbmcgaGVhZGVyIHRvIG9wZW4uLi5gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIHRoZSBhY3R1YWwgaGVhZGVyIGNlbGxcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBsZXQgY2xpY2tUYXJnZXQgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGlmIChoLmNsYXNzTGlzdC5jb250YWlucygnZHluLWhlYWRlckNlbGwnKSB8fCBcclxuICAgICAgICAgICAgICAgIGguaWQ/LmluY2x1ZGVzKCdoZWFkZXInKSB8fFxyXG4gICAgICAgICAgICAgICAgaC5jbG9zZXN0KCcuZHluLWhlYWRlckNlbGwnKSB8fFxyXG4gICAgICAgICAgICAgICAgaC5jbG9zZXN0KCdbcm9sZT1cImNvbHVtbmhlYWRlclwiXScpKSB7XHJcbiAgICAgICAgICAgICAgICBjbGlja1RhcmdldCA9IGg7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgYnkgSUQgcGF0dGVyblxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbaWQqPVwiJHtjb250cm9sTmFtZX1cIl1baWQqPVwiaGVhZGVyXCJdYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGZpcnN0IGVsZW1lbnQgd2l0aCBjb250cm9sTmFtZVxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmlsdGVyIGNvbHVtbiBoZWFkZXIgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDgwMCk7IC8vIFdhaXQgbG9uZ2VyIGZvciBkcm9wZG93biB0byBvcGVuXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUmV0cnkgZmluZGluZyB0aGUgZmlsdGVyIGlucHV0IHdpdGggYSB3YWl0IGxvb3BcclxuICAgICAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDEwOyBhdHRlbXB0KyspIHtcclxuICAgICAgICAgICAgKHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH0gPSBhd2FpdCBmaW5kRmlsdGVySW5wdXQoKSk7XHJcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJbnB1dCkgYnJlYWs7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWZpbHRlcklucHV0KSB7XHJcbiAgICAgICAgLy8gRGVidWc6IExvZyB3aGF0IGVsZW1lbnRzIHdlIGNhbiBmaW5kXHJcbiAgICAgICAgY29uc3QgYWxsRmlsdGVyRmllbGRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlckZpZWxkXCJdJyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgRGVidWc6IEZvdW5kICR7YWxsRmlsdGVyRmllbGRzLmxlbmd0aH0gRmlsdGVyRmllbGQgZWxlbWVudHM6YCk7XHJcbiAgICAgICAgYWxsRmlsdGVyRmllbGRzLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgIC0gJHtlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyl9LCB2aXNpYmxlOiAke2VsLm9mZnNldFBhcmVudCAhPT0gbnVsbH1gKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZpbHRlciBpbnB1dCBub3QgZm91bmQuIE1ha2Ugc3VyZSB0aGUgZmlsdGVyIGRyb3Bkb3duIGlzIG9wZW4uIEV4cGVjdGVkIHBhdHRlcm46IEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNDogU2V0IHRoZSBmaWx0ZXIgbWV0aG9kIGlmIG5vdCBcImlzIGV4YWN0bHlcIiAoZGVmYXVsdClcclxuICAgIGlmIChmaWx0ZXJNZXRob2QgJiYgZmlsdGVyTWV0aG9kICE9PSAnaXMgZXhhY3RseScpIHtcclxuICAgICAgICBhd2FpdCBzZXRGaWx0ZXJNZXRob2QoZmlsdGVyRmllbGRDb250YWluZXIsIGZpbHRlck1ldGhvZCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNTogRW50ZXIgdGhlIGZpbHRlciB2YWx1ZVxyXG4gICAgZmlsdGVySW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBmaWx0ZXJJbnB1dC5zZWxlY3QoKTtcclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgZXhpc3RpbmcgdmFsdWUgZmlyc3RcclxuICAgIGZpbHRlcklucHV0LnZhbHVlID0gJyc7XHJcbiAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gU2V0IHRoZSB2YWx1ZSB1c2luZyBuYXRpdmUgc2V0dGVyXHJcbiAgICBzZXROYXRpdmVWYWx1ZShmaWx0ZXJJbnB1dCwgZmlsdGVyVmFsdWUpO1xyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gU3RlcCA2OiBBcHBseSB0aGUgZmlsdGVyIC0gZmluZCBhbmQgY2xpY2sgdGhlIEFwcGx5IGJ1dHRvblxyXG4gICAgLy8gSU1QT1JUQU5UOiBUaGUgcGF0dGVybiBpcyB7R3JpZE5hbWV9X3tDb2x1bW5OYW1lfV9BcHBseUZpbHRlcnMsIG5vdCBqdXN0IHtHcmlkTmFtZX1fQXBwbHlGaWx0ZXJzXHJcbiAgICBjb25zdCBhcHBseUJ0blBhdHRlcm5zID0gW1xyXG4gICAgICAgIGAke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9X0FwcGx5RmlsdGVyc2AsICAvLyBNb3N0IGNvbW1vbjogR3JpZFJlYWRPbmx5TWFya3VwVGFibGVfTWFya3VwQ29kZV9BcHBseUZpbHRlcnNcclxuICAgICAgICBgJHtjb250cm9sTmFtZX1fQXBwbHlGaWx0ZXJzYCxcclxuICAgICAgICBgJHtncmlkTmFtZX1fQXBwbHlGaWx0ZXJzYCxcclxuICAgICAgICBgQXBwbHlGaWx0ZXJzYFxyXG4gICAgXTtcclxuICAgIFxyXG4gICAgbGV0IGFwcGx5QnRuID0gbnVsbDtcclxuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBhcHBseUJ0blBhdHRlcm5zKSB7XHJcbiAgICAgICAgYXBwbHlCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke3BhdHRlcm59XCJdYCk7XHJcbiAgICAgICAgaWYgKGFwcGx5QnRuICYmIGFwcGx5QnRuLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGb3VuZCBhcHBseSBidXR0b246ICR7cGF0dGVybn1gKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGYWxsYmFjazogZmluZCBhbnkgdmlzaWJsZSBBcHBseUZpbHRlcnMgYnV0dG9uXHJcbiAgICBpZiAoIWFwcGx5QnRuIHx8IGFwcGx5QnRuLm9mZnNldFBhcmVudCA9PT0gbnVsbCkge1xyXG4gICAgICAgIGNvbnN0IGFsbEFwcGx5QnRucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJBcHBseUZpbHRlcnNcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGJ0biBvZiBhbGxBcHBseUJ0bnMpIHtcclxuICAgICAgICAgICAgaWYgKGJ0bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGFwcGx5QnRuID0gYnRuO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChhcHBseUJ0bikge1xyXG4gICAgICAgIGFwcGx5QnRuLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwMCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNzEzIEZpbHRlciBhcHBsaWVkOiBcIiR7ZmlsdGVyVmFsdWV9XCJgKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHByZXNzaW5nIEVudGVyIGFzIGFsdGVybmF0aXZlXHJcbiAgICAgICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsgXHJcbiAgICAgICAgICAgIGtleTogJ0VudGVyJywga2V5Q29kZTogMTMsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBcclxuICAgICAgICAgICAga2V5OiAnRW50ZXInLCBrZXlDb2RlOiAxMywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSBcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwMCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNzEzIEZpbHRlciBhcHBsaWVkIHZpYSBFbnRlcjogXCIke2ZpbHRlclZhbHVlfVwiYCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0VW50aWxDb25kaXRpb24oY29udHJvbE5hbWUsIGNvbmRpdGlvbiwgZXhwZWN0ZWRWYWx1ZSwgdGltZW91dCkge1xyXG4gICAgY29uc29sZS5sb2coYFdhaXRpbmcgZm9yOiAke2NvbnRyb2xOYW1lfSB0byBiZSAke2NvbmRpdGlvbn0gKHRpbWVvdXQ6ICR7dGltZW91dH1tcylgKTtcclxuICAgIFxyXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgIFxyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydFRpbWUgPCB0aW1lb3V0KSB7XHJcbiAgICAgICAgY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IGNvbmRpdGlvbk1ldCA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAoY29uZGl0aW9uKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ3Zpc2libGUnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBleGlzdHMgYW5kIGlzIHZpc2libGUgKGhhcyBsYXlvdXQpXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBlbGVtZW50ICYmIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkuZGlzcGxheSAhPT0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnaGlkZGVuJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZG9lc24ndCBleGlzdCBvciBpcyBub3QgdmlzaWJsZVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gIWVsZW1lbnQgfHwgZWxlbWVudC5vZmZzZXRQYXJlbnQgPT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS52aXNpYmlsaXR5ID09PSAnaGlkZGVuJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgPT09ICdub25lJztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2V4aXN0cyc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGV4aXN0cyBpbiBET01cclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGVsZW1lbnQgIT09IG51bGw7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdub3QtZXhpc3RzJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZG9lcyBub3QgZXhpc3QgaW4gRE9NXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBlbGVtZW50ID09PSBudWxsO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnZW5hYmxlZCc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGV4aXN0cyBhbmQgaXMgbm90IGRpc2FibGVkXHJcbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgYnV0dG9uLCBzZWxlY3QsIHRleHRhcmVhJykgfHwgZWxlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSAhaW5wdXQuZGlzYWJsZWQgJiYgIWlucHV0Lmhhc0F0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnaGFzLXZhbHVlJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgaGFzIGEgc3BlY2lmaWMgdmFsdWVcclxuICAgICAgICAgICAgICAgIGlmIChlbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0JykgfHwgZWxlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBpbnB1dC52YWx1ZSB8fCBpbnB1dC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBjdXJyZW50VmFsdWUudHJpbSgpID09PSBTdHJpbmcoZXhwZWN0ZWRWYWx1ZSkudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb25kaXRpb25NZXQpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgXHUyNzEzIENvbmRpdGlvbiBtZXQ6ICR7Y29udHJvbE5hbWV9IGlzICR7Y29uZGl0aW9ufWApO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApOyAvLyBTbWFsbCBzdGFiaWxpdHkgZGVsYXlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFRpbWVvdXQgd2FpdGluZyBmb3IgXCIke2NvbnRyb2xOYW1lfVwiIHRvIGJlICR7Y29uZGl0aW9ufSAod2FpdGVkICR7dGltZW91dH1tcylgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldElucHV0VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlLCBmaWVsZFR5cGUpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgLy8gRm9yIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyAoQWNjb3VudCwgZXRjKSwgdXNlIGxvb2t1cCBidXR0b24gYXBwcm9hY2hcclxuICAgIGlmIChmaWVsZFR5cGU/LnR5cGUgPT09ICdzZWdtZW50ZWQtbG9va3VwJyB8fCBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvciBDb21ib0JveC9lbnVtIGZpZWxkcywgb3BlbiBkcm9wZG93biBhbmQgc2VsZWN0XHJcbiAgICBpZiAoZmllbGRUeXBlPy5pbnB1dFR5cGUgPT09ICdlbnVtJyB8fCBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvciBSYWRpb0J1dHRvbi9GcmFtZU9wdGlvbkJ1dHRvbiBncm91cHMsIGNsaWNrIHRoZSBjb3JyZWN0IG9wdGlvblxyXG4gICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICBpZiAocm9sZSA9PT0gJ1JhZGlvQnV0dG9uJyB8fCByb2xlID09PSAnRnJhbWVPcHRpb25CdXR0b24nIHx8IGVsZW1lbnQucXVlcnlTZWxlY3RvcignW3JvbGU9XCJyYWRpb1wiXSwgaW5wdXRbdHlwZT1cInJhZGlvXCJdJykpIHtcclxuICAgICAgICBhd2FpdCBzZXRSYWRpb0J1dHRvblZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoYElucHV0IG5vdCBmb3VuZCBpbjogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBGb2N1cyB0aGUgaW5wdXQgZmlyc3RcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG5cclxuICAgIGlmIChpbnB1dC50YWdOYW1lICE9PSAnU0VMRUNUJykge1xyXG4gICAgICAgIC8vIFVzZSB0aGUgc2VsZWN0ZWQgY29tYm9ib3ggaW5wdXQgbWV0aG9kXHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNDAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEdyaWRDZWxsVmFsdWUoY29udHJvbE5hbWUsIHZhbHVlLCBmaWVsZFR5cGUsIHdhaXRGb3JWYWxpZGF0aW9uID0gZmFsc2UpIHtcclxuICAgIGNvbnNvbGUubG9nKGBTZXR0aW5nIGdyaWQgY2VsbCB2YWx1ZTogJHtjb250cm9sTmFtZX0gPSBcIiR7dmFsdWV9XCIgKHdhaXRGb3JWYWxpZGF0aW9uPSR7d2FpdEZvclZhbGlkYXRpb259KWApO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSBjZWxsIGVsZW1lbnQgLSBwcmVmZXIgdGhlIG9uZSBpbiBhbiBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICBsZXQgZWxlbWVudCA9IGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpO1xyXG4gICAgXHJcbiAgICBpZiAoIWVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgY2xpY2tpbmcgb24gdGhlIGdyaWQgcm93IGZpcnN0IHRvIGFjdGl2YXRlIGl0XHJcbiAgICAgICAgYXdhaXQgYWN0aXZhdGVHcmlkUm93KGNvbnRyb2xOYW1lKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIGVsZW1lbnQgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHcmlkIGNlbGwgZWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcywgd2UgbmVlZCB0byBjbGljayBvbiB0aGUgY2VsbCB0byBlbnRlciBlZGl0IG1vZGVcclxuICAgIC8vIEZpbmQgdGhlIGFjdHVhbCBjZWxsIGNvbnRhaW5lciAoZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4pXHJcbiAgICBjb25zdCByZWFjdENlbGwgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpIHx8IGVsZW1lbnQ7XHJcbiAgICBjb25zdCBpc1JlYWN0R3JpZCA9ICEhZWxlbWVudC5jbG9zZXN0KCcucmVhY3RHcmlkJyk7XHJcbiAgICBcclxuICAgIC8vIENsaWNrIG9uIHRoZSBjZWxsIHRvIGFjdGl2YXRlIGl0IGZvciBlZGl0aW5nXHJcbiAgICBjb25zb2xlLmxvZyhgICBDbGlja2luZyBjZWxsIHRvIGFjdGl2YXRlOiBpc1JlYWN0R3JpZD0ke2lzUmVhY3RHcmlkfWApO1xyXG4gICAgcmVhY3RDZWxsLmNsaWNrKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBGb3IgUmVhY3QgZ3JpZHMsIEQzNjUgcmVuZGVycyBpbnB1dCBmaWVsZHMgZHluYW1pY2FsbHkgYWZ0ZXIgY2xpY2tpbmdcclxuICAgIC8vIFdlIG5lZWQgdG8gcmUtZmluZCB0aGUgZWxlbWVudCBhZnRlciBjbGlja2luZyBhcyBEMzY1IG1heSBoYXZlIHJlcGxhY2VkIHRoZSBET01cclxuICAgIGlmIChpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7IC8vIEV4dHJhIHdhaXQgZm9yIFJlYWN0IHRvIHJlbmRlciBpbnB1dFxyXG4gICAgICAgIGVsZW1lbnQgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgICAgICBpZiAoIWVsZW1lbnQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHcmlkIGNlbGwgZWxlbWVudCBub3QgZm91bmQgYWZ0ZXIgY2xpY2s6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUaGUgY2xpY2sgc2hvdWxkIGFjdGl2YXRlIHRoZSBjZWxsIC0gbm93IGZpbmQgdGhlIGlucHV0XHJcbiAgICBsZXQgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgIFxyXG4gICAgLy8gSWYgbm8gaW5wdXQgZm91bmQgZGlyZWN0bHksIGxvb2sgaW4gdGhlIGNlbGwgY29udGFpbmVyXHJcbiAgICBpZiAoIWlucHV0ICYmIGlzUmVhY3RHcmlkKSB7XHJcbiAgICAgICAgY29uc3QgY2VsbENvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJyk7XHJcbiAgICAgICAgaWYgKGNlbGxDb250YWluZXIpIHtcclxuICAgICAgICAgICAgaW5wdXQgPSBjZWxsQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGlucHV0IGZvdW5kIGRpcmVjdGx5LCB0cnkgZ2V0dGluZyBpdCBhZnRlciBjbGljayBhY3RpdmF0aW9uIHdpdGggcmV0cnlcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDU7IGF0dGVtcHQrKykge1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgICAgICAgICBpZiAoaW5wdXQgJiYgaW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEFsc28gY2hlY2sgaWYgYSBuZXcgaW5wdXQgYXBwZWFyZWQgaW4gdGhlIGNlbGxcclxuICAgICAgICAgICAgY29uc3QgY2VsbENvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJyk7XHJcbiAgICAgICAgICAgIGlmIChjZWxsQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dCA9IGNlbGxDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGlucHV0ICYmIGlucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0aWxsIG5vIGlucHV0PyBDaGVjayBpZiB0aGUgZWxlbWVudCBpdHNlbGYgaXMgYW4gaW5wdXRcclxuICAgIGlmICghaW5wdXQgJiYgKGVsZW1lbnQudGFnTmFtZSA9PT0gJ0lOUFVUJyB8fCBlbGVtZW50LnRhZ05hbWUgPT09ICdURVhUQVJFQScgfHwgZWxlbWVudC50YWdOYW1lID09PSAnU0VMRUNUJykpIHtcclxuICAgICAgICBpbnB1dCA9IGVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSB0byBmaW5kIGlucHV0IGluIHRoZSBwYXJlbnQgcm93XHJcbiAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgY29uc3Qgcm93ID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbiwgW2RhdGEtZHluLXJvbGU9XCJSb3dcIl0sIFtyb2xlPVwicm93XCJdLCB0cicpO1xyXG4gICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9zc2libGVJbnB1dHMgPSByb3cucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl0gaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl0gdGV4dGFyZWFgKTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBpbnAgb2YgcG9zc2libGVJbnB1dHMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChpbnAub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5wdXQgPSBpbnA7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIExhc3QgcmVzb3J0OiBmaW5kIGFueSB2aXNpYmxlIGlucHV0IGluIHRoZSBhY3RpdmUgY2VsbCBhcmVhXHJcbiAgICBpZiAoIWlucHV0ICYmIGlzUmVhY3RHcmlkKSB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlQ2VsbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5keW4tYWN0aXZlUm93Q2VsbCwgLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluOmZvY3VzLXdpdGhpbicpO1xyXG4gICAgICAgIGlmIChhY3RpdmVDZWxsKSB7XHJcbiAgICAgICAgICAgIGlucHV0ID0gYWN0aXZlQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgLy8gTG9nIGF2YWlsYWJsZSBlbGVtZW50cyBmb3IgZGVidWdnaW5nXHJcbiAgICAgICAgY29uc3QgZ3JpZENvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLnJlYWN0R3JpZCwgW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJyk7XHJcbiAgICAgICAgY29uc3QgYWxsSW5wdXRzID0gZ3JpZENvbnRhaW5lcj8ucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdBdmFpbGFibGUgaW5wdXRzIGluIGdyaWQ6JywgQXJyYXkuZnJvbShhbGxJbnB1dHMgfHwgW10pLm1hcChpID0+ICh7XHJcbiAgICAgICAgICAgIG5hbWU6IGkuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXHJcbiAgICAgICAgICAgIHZpc2libGU6IGkub2Zmc2V0UGFyZW50ICE9PSBudWxsXHJcbiAgICAgICAgfSkpKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYElucHV0IG5vdCBmb3VuZCBpbiBncmlkIGNlbGw6ICR7Y29udHJvbE5hbWV9LiBUaGUgY2VsbCBtYXkgbmVlZCB0byBiZSBjbGlja2VkIHRvIGJlY29tZSBlZGl0YWJsZS5gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGZpZWxkIHR5cGUgYW5kIHVzZSBhcHByb3ByaWF0ZSBzZXR0ZXJcclxuICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgXHJcbiAgICBpZiAoZmllbGRUeXBlPy50eXBlID09PSAnc2VnbWVudGVkLWxvb2t1cCcgfHwgcm9sZSA9PT0gJ1NlZ21lbnRlZEVudHJ5JyB8fCBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZmllbGRUeXBlPy5pbnB1dFR5cGUgPT09ICdlbnVtJyB8fCByb2xlID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBmb3IgbG9va3VwIGZpZWxkc1xyXG4gICAgaWYgKHJvbGUgPT09ICdMb29rdXAnIHx8IHJvbGUgPT09ICdSZWZlcmVuY2VHcm91cCcgfHwgaGFzTG9va3VwQnV0dG9uKGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0TG9va3VwU2VsZWN0VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0YW5kYXJkIGlucHV0IC0gZm9jdXMgYW5kIHNldCB2YWx1ZVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlXHJcbiAgICBpbnB1dC5zZWxlY3Q/LigpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgXHJcbiAgICAvLyBVc2UgdGhlIHN0YW5kYXJkIGlucHV0IG1ldGhvZFxyXG4gICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUpO1xyXG4gICAgXHJcbiAgICAvLyBEaXNwYXRjaCBldmVudHNcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBcclxuICAgIC8vIEZvciBncmlkIGNlbGxzLCB3ZSBuZWVkIHRvIHByb3Blcmx5IGNvbW1pdCB0aGUgdmFsdWVcclxuICAgIC8vIEQzNjUgUmVhY3QgZ3JpZHMgcmVxdWlyZSB0aGUgY2VsbCB0byBsb3NlIGZvY3VzIGZvciB2YWxpZGF0aW9uIHRvIG9jY3VyXHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAxOiBQcmVzcyBFbnRlciB0byBjb25maXJtIHRoZSB2YWx1ZSAoaW1wb3J0YW50IGZvciBsb29rdXAgZmllbGRzIGxpa2UgSXRlbUlkKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBrZXlDb2RlOiAxMywgd2hpY2g6IDEzLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGtleUNvZGU6IDEzLCB3aGljaDogMTMsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gTWV0aG9kIDI6IFRhYiBvdXQgdG8gbW92ZSB0byBuZXh0IGNlbGwgKHRyaWdnZXJzIGJsdXIgYW5kIHZhbGlkYXRpb24pXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywga2V5Q29kZTogOSwgd2hpY2g6IDksIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBrZXlDb2RlOiA5LCB3aGljaDogOSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgXHJcbiAgICAvLyBNZXRob2QgMzogRGlzcGF0Y2ggYmx1ciBldmVudCBleHBsaWNpdGx5XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBGb2N1c0V2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlLCByZWxhdGVkVGFyZ2V0OiBudWxsIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCA0OiBDbGljayBvdXRzaWRlIHRoZSBjZWxsIHRvIGVuc3VyZSBmb2N1cyBpcyBsb3N0XHJcbiAgICAvLyBGaW5kIGFub3RoZXIgY2VsbCBvciB0aGUgcm93IGNvbnRhaW5lciB0byBjbGlja1xyXG4gICAgY29uc3Qgcm93ID0gaW5wdXQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4sIFtkYXRhLWR5bi1yb2xlPVwiUm93XCJdJyk7XHJcbiAgICBpZiAocm93KSB7XHJcbiAgICAgICAgY29uc3Qgb3RoZXJDZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbjpub3QoOmZvY3VzLXdpdGhpbiknKTtcclxuICAgICAgICBpZiAob3RoZXJDZWxsICYmIG90aGVyQ2VsbCAhPT0gaW5wdXQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJykpIHtcclxuICAgICAgICAgICAgb3RoZXJDZWxsLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBXYWl0IGZvciBEMzY1IHRvIHByb2Nlc3MvdmFsaWRhdGUgdGhlIHZhbHVlIChzZXJ2ZXItc2lkZSBsb29rdXAgZm9yIEl0ZW1JZCwgZXRjLilcclxuICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICBcclxuICAgIC8vIElmIHdhaXRGb3JWYWxpZGF0aW9uIGlzIGVuYWJsZWQsIHdhaXQgZm9yIEQzNjUgdG8gY29tcGxldGUgdGhlIGxvb2t1cCB2YWxpZGF0aW9uXHJcbiAgICAvLyBUaGlzIGlzIGltcG9ydGFudCBmb3IgZmllbGRzIGxpa2UgSXRlbUlkIHRoYXQgdHJpZ2dlciBzZXJ2ZXItc2lkZSB2YWxpZGF0aW9uXHJcbiAgICBpZiAod2FpdEZvclZhbGlkYXRpb24pIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBXYWl0aW5nIGZvciBEMzY1IHZhbGlkYXRpb24gb2YgJHtjb250cm9sTmFtZX0uLi5gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBXYWl0IGZvciBhbnkgbG9hZGluZyBpbmRpY2F0b3JzIHRvIGFwcGVhciBhbmQgZGlzYXBwZWFyXHJcbiAgICAgICAgLy8gRDM2NSBzaG93cyBhIGxvYWRpbmcgc3Bpbm5lciBkdXJpbmcgc2VydmVyLXNpZGUgbG9va3Vwc1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JEMzY1VmFsaWRhdGlvbihjb250cm9sTmFtZSwgNTAwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGAgIEdyaWQgY2VsbCB2YWx1ZSBzZXQ6ICR7Y29udHJvbE5hbWV9ID0gXCIke3ZhbHVlfVwiYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yRDM2NVZhbGlkYXRpb24oY29udHJvbE5hbWUsIHRpbWVvdXQgPSA1MDAwKSB7XHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgbGV0IGxhc3RMb2FkaW5nU3RhdGUgPSBmYWxzZTtcclxuICAgIGxldCBzZWVuTG9hZGluZyA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IHRpbWVvdXQpIHtcclxuICAgICAgICAvLyBDaGVjayBmb3IgRDM2NSBsb2FkaW5nIGluZGljYXRvcnNcclxuICAgICAgICBjb25zdCBpc0xvYWRpbmcgPSBpc0QzNjVMb2FkaW5nKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzTG9hZGluZyAmJiAhbGFzdExvYWRpbmdTdGF0ZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnICAgIEQzNjUgdmFsaWRhdGlvbiBzdGFydGVkIChsb2FkaW5nIGluZGljYXRvciBhcHBlYXJlZCknKTtcclxuICAgICAgICAgICAgc2VlbkxvYWRpbmcgPSB0cnVlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoIWlzTG9hZGluZyAmJiBsYXN0TG9hZGluZ1N0YXRlICYmIHNlZW5Mb2FkaW5nKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCcgICAgRDM2NSB2YWxpZGF0aW9uIGNvbXBsZXRlZCAobG9hZGluZyBpbmRpY2F0b3IgZ29uZSknKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTsgLy8gRXh0cmEgYnVmZmVyIGFmdGVyIGxvYWRpbmcgY29tcGxldGVzXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsYXN0TG9hZGluZ1N0YXRlID0gaXNMb2FkaW5nO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFsc28gY2hlY2sgaWYgdGhlIGNlbGwgbm93IHNob3dzIHZhbGlkYXRlZCBjb250ZW50IChlLmcuLCBwcm9kdWN0IG5hbWUgYXBwZWFyZWQpXHJcbiAgICAgICAgLy8gRm9yIEl0ZW1JZCwgRDM2NSBzaG93cyB0aGUgaXRlbSBudW1iZXIgYW5kIG5hbWUgYWZ0ZXIgdmFsaWRhdGlvblxyXG4gICAgICAgIGNvbnN0IGNlbGwgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsVGV4dCA9IGNlbGwudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhc011bHRpcGxlVmFsdWVzID0gY2VsbFRleHQuc3BsaXQoL1xcc3syLH18XFxuLykuZmlsdGVyKHQgPT4gdC50cmltKCkpLmxlbmd0aCA+IDE7XHJcbiAgICAgICAgICAgIGlmIChoYXNNdWx0aXBsZVZhbHVlcykge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJyAgICBEMzY1IHZhbGlkYXRpb24gY29tcGxldGVkIChjZWxsIGNvbnRlbnQgdXBkYXRlZCknKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBJZiB3ZSBzYXcgbG9hZGluZyBhdCBzb21lIHBvaW50LCB3YWl0IGEgYml0IG1vcmUgYWZ0ZXIgdGltZW91dFxyXG4gICAgaWYgKHNlZW5Mb2FkaW5nKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJyAgICBWYWxpZGF0aW9uIHRpbWVvdXQgcmVhY2hlZCwgYnV0IHNhdyBsb2FkaW5nIC0gd2FpdGluZyBleHRyYSB0aW1lJyk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJyAgICBWYWxpZGF0aW9uIHdhaXQgY29tcGxldGVkICh0aW1lb3V0IG9yIG5vIGxvYWRpbmcgZGV0ZWN0ZWQpJyk7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZUdyaWRSb3coY29udHJvbE5hbWUpIHtcclxuICAgIC8vIFRyeSBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcyBmaXJzdFxyXG4gICAgY29uc3QgcmVhY3RHcmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgY29uc3QgYm9keUNvbnRhaW5lciA9IGdyaWQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHksIC5maXhlZERhdGFUYWJsZUxheW91dF9yb3dzQ29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGJvZHlDb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGNlbGwpIHtcclxuICAgICAgICAgICAgICAgIC8vIEZpbmQgdGhlIHJvdyBjb250YWluaW5nIHRoaXMgY2VsbFxyXG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gY2VsbC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbicpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJvdykge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENsaWNrIG9uIHRoZSByb3cgdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgICAgICAgICAgcm93LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHNcclxuICAgIGNvbnN0IGdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgZ3JpZHMpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBjZWxsXHJcbiAgICAgICAgY29uc3QgY2VsbCA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICAvLyBGaW5kIHRoZSByb3cgY29udGFpbmluZyB0aGlzIGNlbGxcclxuICAgICAgICAgICAgY29uc3Qgcm93ID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIlJvd1wiXSwgW3JvbGU9XCJyb3dcIl0sIHRyJyk7XHJcbiAgICAgICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgICAgIC8vIENsaWNrIG9uIHRoZSByb3cgdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgICAgICByb3cuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldExvb2t1cFNlbGVjdFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gbG9va3VwIGZpZWxkJyk7XHJcblxyXG4gICAgY29uc3QgbG9va3VwQnV0dG9uID0gZmluZExvb2t1cEJ1dHRvbihlbGVtZW50KTtcclxuICAgIGlmIChsb29rdXBCdXR0b24pIHtcclxuICAgICAgICBsb29rdXBCdXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBUcnkgdG8gb3BlbiBieSBmb2N1c2luZyBhbmQga2V5Ym9hcmRcclxuICAgICAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGxvb2t1cERvY2sgPSBhd2FpdCB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQoZWxlbWVudCk7XHJcbiAgICBpZiAoIWxvb2t1cERvY2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xvb2t1cCBmbHlvdXQgbm90IGZvdW5kJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJ5IHR5cGluZyBpbnRvIGEgbG9va3VwIGZseW91dCBpbnB1dCBpZiBwcmVzZW50IChlLmcuLCBNYWluQWNjb3VudClcclxuICAgIGNvbnN0IGRvY2tJbnB1dCA9IGZpbmRMb29rdXBGaWx0ZXJJbnB1dChsb29rdXBEb2NrKTtcclxuICAgIGlmIChkb2NrSW5wdXQpIHtcclxuICAgICAgICBkb2NrSW5wdXQuY2xpY2soKTtcclxuICAgICAgICBkb2NrSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChkb2NrSW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNjAwKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb3dzID0gYXdhaXQgd2FpdEZvckxvb2t1cFJvd3MobG9va3VwRG9jaywgZWxlbWVudCk7XHJcbiAgICBpZiAoIXJvd3MubGVuZ3RoKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29rdXAgbGlzdCBpcyBlbXB0eScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNlYXJjaFZhbHVlID0gU3RyaW5nKHZhbHVlID8/ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgbGV0IG1hdGNoZWQgPSBmYWxzZTtcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm93LnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBjb25zdCBmaXJzdENlbGwgPSByb3cucXVlcnlTZWxlY3RvcignW3JvbGU9XCJncmlkY2VsbFwiXSwgdGQnKTtcclxuICAgICAgICBjb25zdCBmaXJzdFRleHQgPSBmaXJzdENlbGwgPyBmaXJzdENlbGwudGV4dENvbnRlbnQudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiAnJztcclxuICAgICAgICBpZiAoZmlyc3RUZXh0ID09PSBzZWFyY2hWYWx1ZSB8fCB0ZXh0LmluY2x1ZGVzKHNlYXJjaFZhbHVlKSkge1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaXJzdENlbGwgfHwgcm93O1xyXG4gICAgICAgICAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICB0YXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgICAgIC8vIFNvbWUgRDM2NSBsb29rdXBzIHJlcXVpcmUgRW50ZXIgb3IgZG91YmxlLWNsaWNrIHRvIGNvbW1pdCBzZWxlY3Rpb25cclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2RibGNsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIGlmICghYXBwbGllZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IGEgc2Vjb25kIGNvbW1pdCBwYXNzIGlmIHRoZSB2YWx1ZSBkaWQgbm90IHN0aWNrXHJcbiAgICAgICAgICAgICAgICB0YXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghbWF0Y2hlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTG9va3VwIHZhbHVlIG5vdCBmb3VuZDogJHt2YWx1ZX1gKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldENoZWNrYm94VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIC8vIEQzNjUgY2hlY2tib3hlcyBjYW4gYmU6XHJcbiAgICAvLyAxLiBTdGFuZGFyZCBpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl1cclxuICAgIC8vIDIuIEN1c3RvbSB0b2dnbGUgd2l0aCByb2xlPVwiY2hlY2tib3hcIiBvciByb2xlPVwic3dpdGNoXCJcclxuICAgIC8vIDMuIEVsZW1lbnQgd2l0aCBhcmlhLWNoZWNrZWQgYXR0cmlidXRlICh0aGUgY29udGFpbmVyIGl0c2VsZilcclxuICAgIC8vIDQuIEVsZW1lbnQgd2l0aCBkYXRhLWR5bi1yb2xlPVwiQ2hlY2tCb3hcIlxyXG4gICAgXHJcbiAgICBsZXQgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpO1xyXG4gICAgbGV0IGlzQ3VzdG9tVG9nZ2xlID0gZmFsc2U7XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHtcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCBjdXN0b20gdG9nZ2xlIGVsZW1lbnRcclxuICAgICAgICBjaGVja2JveCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXSwgW3JvbGU9XCJzd2l0Y2hcIl0nKTtcclxuICAgICAgICBpZiAoY2hlY2tib3gpIHtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkge1xyXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBlbGVtZW50IGl0c2VsZiBpcyB0aGUgdG9nZ2xlIChEMzY1IG9mdGVuIGRvZXMgdGhpcylcclxuICAgICAgICBpZiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpICE9PSBudWxsIHx8IFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnY2hlY2tib3gnIHx8XHJcbiAgICAgICAgICAgIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdyb2xlJykgPT09ICdzd2l0Y2gnIHx8XHJcbiAgICAgICAgICAgIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdDaGVja0JveCcpIHtcclxuICAgICAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50O1xyXG4gICAgICAgICAgICBpc0N1c3RvbVRvZ2dsZSA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB7XHJcbiAgICAgICAgLy8gTGFzdCByZXNvcnQ6IGZpbmQgYW55IGNsaWNrYWJsZSB0b2dnbGUtbGlrZSBlbGVtZW50XHJcbiAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgW3RhYmluZGV4PVwiMFwiXScpO1xyXG4gICAgICAgIGlmIChjaGVja2JveCkge1xyXG4gICAgICAgICAgICBpc0N1c3RvbVRvZ2dsZSA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB0aHJvdyBuZXcgRXJyb3IoYENoZWNrYm94IG5vdCBmb3VuZCBpbjogJHtjb250cm9sTmFtZX0uIEVsZW1lbnQgSFRNTDogJHtlbGVtZW50Lm91dGVySFRNTC5zdWJzdHJpbmcoMCwgMjAwKX1gKTtcclxuXHJcbiAgICBjb25zdCBzaG91bGRDaGVjayA9IGNvZXJjZUJvb2xlYW4odmFsdWUpO1xyXG4gICAgXHJcbiAgICAvLyBEZXRlcm1pbmUgY3VycmVudCBzdGF0ZVxyXG4gICAgbGV0IGlzQ3VycmVudGx5Q2hlY2tlZDtcclxuICAgIGlmIChpc0N1c3RvbVRvZ2dsZSkge1xyXG4gICAgICAgIGlzQ3VycmVudGx5Q2hlY2tlZCA9IGNoZWNrYm94LmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJyB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LmNsYXNzTGlzdC5jb250YWlucygnY2hlY2tlZCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5jbGFzc0xpc3QuY29udGFpbnMoJ29uJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LmdldEF0dHJpYnV0ZSgnZGF0YS1jaGVja2VkJykgPT09ICd0cnVlJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaXNDdXJyZW50bHlDaGVja2VkID0gY2hlY2tib3guY2hlY2tlZDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBPbmx5IGNsaWNrIGlmIHN0YXRlIG5lZWRzIHRvIGNoYW5nZVxyXG4gICAgaWYgKHNob3VsZENoZWNrICE9PSBpc0N1cnJlbnRseUNoZWNrZWQpIHtcclxuICAgICAgICBjaGVja2JveC5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRm9yIGN1c3RvbSB0b2dnbGVzLCBhbHNvIHRyeSBkaXNwYXRjaGluZyBldmVudHMgaWYgY2xpY2sgZGlkbid0IHdvcmtcclxuICAgICAgICBpZiAoaXNDdXN0b21Ub2dnbGUpIHtcclxuICAgICAgICAgICAgY2hlY2tib3guZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgY2hlY2tib3guZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAvLyBUcnkgQWx0K0Rvd24gdGhlbiBGNCAoY29tbW9uIEQzNjUvV2luIGNvbnRyb2xzKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGFsdEtleTogdHJ1ZSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGFsdEtleTogdHJ1ZSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRjQnLCBjb2RlOiAnRjQnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdGNCcsIGNvZGU6ICdGNCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KSB7XHJcbiAgICAvLyBEMzY1IHNlZ21lbnRlZCBsb29rdXBzIG9mdGVuIHZhbGlkYXRlIG9uIFRhYi9FbnRlciBhbmQgYmx1clxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoODAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsb3NlRGlhbG9nKGZvcm1OYW1lLCBhY3Rpb24gPSAnb2snKSB7XHJcbiAgICBjb25zdCBmb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWZvcm0tbmFtZT1cIiR7Zm9ybU5hbWV9XCJdYCk7XHJcbiAgICBpZiAoIWZvcm0pIHtcclxuICAgICAgICBsb2dTdGVwKGBXYXJuaW5nOiBGb3JtICR7Zm9ybU5hbWV9IG5vdCBmb3VuZCB0byBjbG9zZWApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbGV0IGJ1dHRvbk5hbWU7XHJcbiAgICBpZiAoZm9ybU5hbWUgPT09ICdTeXNSZWN1cnJlbmNlJykge1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnQ29tbWFuZEJ1dHRvbk9rJyA6ICdDb21tYW5kQnV0dG9uQ2FuY2VsJztcclxuICAgIH0gZWxzZSBpZiAoZm9ybU5hbWUgPT09ICdTeXNRdWVyeUZvcm0nKSB7XHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdPa0J1dHRvbicgOiAnQ2FuY2VsQnV0dG9uJztcclxuICAgIH0gZWxzZSBpZiAoZm9ybU5hbWUgPT09ICdTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm0nKSB7XHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdDb21tYW5kQnV0dG9uJyA6ICdDb21tYW5kQnV0dG9uQ2FuY2VsJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IGdlbmVyaWMgbmFtZXNcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ0NvbW1hbmRCdXR0b24nIDogJ0NvbW1hbmRCdXR0b25DYW5jZWwnO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBidXR0b24gPSBmb3JtLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7YnV0dG9uTmFtZX1cIl1gKTtcclxuICAgIGlmIChidXR0b24pIHtcclxuICAgICAgICBidXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgIGxvZ1N0ZXAoYERpYWxvZyAke2Zvcm1OYW1lfSBjbG9zZWQgd2l0aCAke2FjdGlvbi50b1VwcGVyQ2FzZSgpfWApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKGBXYXJuaW5nOiAke2FjdGlvbi50b1VwcGVyQ2FzZSgpfSBidXR0b24gbm90IGZvdW5kIGluICR7Zm9ybU5hbWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBuYXZpZ2F0ZVRvRm9ybShzdGVwKSB7XHJcbiAgICBjb25zdCB7IG5hdmlnYXRlTWV0aG9kLCBtZW51SXRlbU5hbWUsIG1lbnVJdGVtVHlwZSwgbmF2aWdhdGVVcmwsIHdhaXRGb3JMb2FkIH0gPSBzdGVwO1xyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBOYXZpZ2F0aW5nIHRvIGZvcm06ICR7bWVudUl0ZW1OYW1lIHx8IG5hdmlnYXRlVXJsfWApO1xyXG4gICAgXHJcbiAgICBsZXQgdGFyZ2V0VXJsO1xyXG4gICAgY29uc3QgYmFzZVVybCA9IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4gKyB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWU7XHJcbiAgICBcclxuICAgIGlmIChuYXZpZ2F0ZU1ldGhvZCA9PT0gJ3VybCcgJiYgbmF2aWdhdGVVcmwpIHtcclxuICAgICAgICAvLyBVc2UgZnVsbCBVUkwgcGF0aCBwcm92aWRlZFxyXG4gICAgICAgIHRhcmdldFVybCA9IG5hdmlnYXRlVXJsLnN0YXJ0c1dpdGgoJ2h0dHAnKSA/IG5hdmlnYXRlVXJsIDogYmFzZVVybCArIG5hdmlnYXRlVXJsO1xyXG4gICAgfSBlbHNlIGlmIChtZW51SXRlbU5hbWUpIHtcclxuICAgICAgICAvLyBCdWlsZCBVUkwgZnJvbSBtZW51IGl0ZW0gbmFtZVxyXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XHJcbiAgICAgICAgcGFyYW1zLmRlbGV0ZSgncScpO1xyXG4gICAgICAgIGNvbnN0IHR5cGVQcmVmaXggPSAobWVudUl0ZW1UeXBlICYmIG1lbnVJdGVtVHlwZSAhPT0gJ0Rpc3BsYXknKSA/IGAke21lbnVJdGVtVHlwZX06YCA6ICcnO1xyXG4gICAgICAgIHBhcmFtcy5zZXQoJ21pJywgYCR7dHlwZVByZWZpeH0ke21lbnVJdGVtTmFtZX1gKTtcclxuXHJcbiAgICAgICAgdGFyZ2V0VXJsID0gYmFzZVVybCArICc/JyArIHBhcmFtcy50b1N0cmluZygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05hdmlnYXRlIHN0ZXAgcmVxdWlyZXMgZWl0aGVyIG1lbnVJdGVtTmFtZSBvciBuYXZpZ2F0ZVVybCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBOYXZpZ2F0aW5nIHRvOiAke3RhcmdldFVybH1gKTtcclxuXHJcbiAgICAvLyBTYXZlIHBlbmRpbmcgd29ya2Zsb3cgc3RhdGUgZGlyZWN0bHkgaW4gc2Vzc2lvblN0b3JhZ2UgYmVmb3JlIG5hdmlnYXRpb25cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldE1lbnVJdGVtTmFtZSA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdtaScpIHx8ICcnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElNUE9SVEFOVDogVXNlIHRoZSBPUklHSU5BTCBmdWxsIHdvcmtmbG93LCBub3QgdGhlIGN1cnJlbnQgKHBvc3NpYmx5IHNsaWNlZCkgb25lXHJcbiAgICAgICAgLy8gVGhpcyBwcmV2ZW50cyBkb3VibGUtc2xpY2luZyBvbiBzdWJzZXF1ZW50IG5hdmlnYXRpb24gcmVzdW1lc1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsV29ya2Zsb3cgPSB3aW5kb3cuZDM2NU9yaWdpbmFsV29ya2Zsb3cgfHwgd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3cgfHwgbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwZW5kaW5nU3RhdGUgPSB7XHJcbiAgICAgICAgICAgIHdvcmtmbG93OiBvcmlnaW5hbFdvcmtmbG93LFxyXG4gICAgICAgICAgICB3b3JrZmxvd0lkOiBvcmlnaW5hbFdvcmtmbG93Py5pZCB8fCAnJyxcclxuICAgICAgICAgICAgbmV4dFN0ZXBJbmRleDogKHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudFN0ZXBJbmRleCA/PyAwKSArIDEsXHJcbiAgICAgICAgICAgIGN1cnJlbnRSb3dJbmRleDogd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50Um93SW5kZXggfHwgMCxcclxuICAgICAgICAgICAgdG90YWxSb3dzOiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LnRvdGFsUm93cyB8fCAwLFxyXG4gICAgICAgICAgICBkYXRhOiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnREYXRhUm93IHx8IG51bGwsXHJcbiAgICAgICAgICAgIHRhcmdldE1lbnVJdGVtTmFtZTogdGFyZ2V0TWVudUl0ZW1OYW1lLFxyXG4gICAgICAgICAgICB3YWl0Rm9yTG9hZDogd2FpdEZvckxvYWQgfHwgMzAwMCxcclxuICAgICAgICAgICAgc2F2ZWRBdDogRGF0ZS5ub3coKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9wZW5kaW5nX3dvcmtmbG93JywgSlNPTi5zdHJpbmdpZnkocGVuZGluZ1N0YXRlKSk7XHJcbiAgICAgICAgbG9nU3RlcChgU2F2ZWQgd29ya2Zsb3cgc3RhdGUgZm9yIG5hdmlnYXRpb24gKG5leHRTdGVwSW5kZXg6ICR7cGVuZGluZ1N0YXRlLm5leHRTdGVwSW5kZXh9KWApO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUud2FybignW0QzNjVdIEZhaWxlZCB0byBzYXZlIHdvcmtmbG93IHN0YXRlIGluIHNlc3Npb25TdG9yYWdlOicsIGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTaWduYWwgbmF2aWdhdGlvbiBpcyBhYm91dCB0byBoYXBwZW4gLSB3b3JrZmxvdyBzdGF0ZSB3aWxsIGJlIHNhdmVkIGJ5IHRoZSBleHRlbnNpb25cclxuICAgIC8vIFdlIG5lZWQgdG8gd2FpdCBmb3IgdGhlIHN0YXRlIHRvIGJlIHNhdmVkIGJlZm9yZSBuYXZpZ2F0aW5nXHJcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX05BVklHQVRJTkcnLFxyXG4gICAgICAgIHRhcmdldFVybDogdGFyZ2V0VXJsLFxyXG4gICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwXHJcbiAgICB9LCAnKicpO1xyXG4gICAgXHJcbiAgICAvLyBXYWl0IGxvbmdlciB0byBlbnN1cmUgdGhlIGZ1bGwgY2hhaW4gY29tcGxldGVzOlxyXG4gICAgLy8gcG9zdE1lc3NhZ2UgLT4gY29udGVudC5qcyAtPiBiYWNrZ3JvdW5kLmpzIC0+IHBvcHVwIC0+IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdFxyXG4gICAgLy8gVGhpcyBjaGFpbiBpbnZvbHZlcyBtdWx0aXBsZSBhc3luYyBob3BzLCBzbyB3ZSBuZWVkIHN1ZmZpY2llbnQgdGltZVxyXG4gICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIFxyXG4gICAgLy8gTmF2aWdhdGUgLSB0aGlzIHdpbGwgY2F1c2UgcGFnZSByZWxvYWQsIHNjcmlwdCBjb250ZXh0IHdpbGwgYmUgbG9zdFxyXG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0YXJnZXRVcmw7XHJcbiAgICBcclxuICAgIC8vIFRoaXMgY29kZSB3b24ndCBleGVjdXRlIGR1ZSB0byBwYWdlIG5hdmlnYXRpb24sIGJ1dCBrZWVwIGl0IGZvciByZWZlcmVuY2VcclxuICAgIC8vIFRoZSB3b3JrZmxvdyB3aWxsIGJlIHJlc3VtZWQgYnkgdGhlIGNvbnRlbnQgc2NyaXB0IGFmdGVyIHBhZ2UgbG9hZFxyXG4gICAgYXdhaXQgc2xlZXAod2FpdEZvckxvYWQgfHwgMzAwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZVRhYihjb250cm9sTmFtZSkge1xuICAgIGxvZ1N0ZXAoYEFjdGl2YXRpbmcgdGFiOiAke2NvbnRyb2xOYW1lfWApO1xuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgdGFiIGVsZW1lbnQgLSBjb3VsZCBiZSB0aGUgdGFiIGNvbnRlbnQgb3IgdGhlIHRhYiBidXR0b24gaXRzZWxmXHJcbiAgICBsZXQgdGFiRWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIFxyXG4gICAgLy8gSWYgbm90IGZvdW5kIGRpcmVjdGx5LCB0cnkgZmluZGluZyBieSBsb29raW5nIGZvciB0YWIgaGVhZGVycy9saW5rc1xyXG4gICAgaWYgKCF0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgdGhlIHRhYiBsaW5rL2J1dHRvbiB0aGF0IHJlZmVyZW5jZXMgdGhpcyB0YWJcclxuICAgICAgICB0YWJFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1faGVhZGVyXCJdYCkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl0gW3JvbGU9XCJ0YWJcIl1gKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbYXJpYS1jb250cm9scz1cIiR7Y29udHJvbE5hbWV9XCJdYCkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgYVtocmVmKj1cIiR7Y29udHJvbE5hbWV9XCJdLCBidXR0b25bZGF0YS10YXJnZXQqPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCF0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUYWIgZWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBEMzY1IHBhcmFtZXRlciBmb3JtcyB3aXRoIHZlcnRpY2FsIHRhYnMsIHRoZSBjbGlja2FibGUgZWxlbWVudCBzdHJ1Y3R1cmUgdmFyaWVzXHJcbiAgICAvLyBUcnkgbXVsdGlwbGUgYXBwcm9hY2hlcyB0byBmaW5kIGFuZCBjbGljayB0aGUgcmlnaHQgZWxlbWVudFxyXG4gICAgXHJcbiAgICAvLyBBcHByb2FjaCAxOiBMb29rIGZvciB0aGUgdGFiIGxpbmsgaW5zaWRlIGEgcGl2b3QvdGFiIHN0cnVjdHVyZVxyXG4gICAgbGV0IGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcucGl2b3QtbGluaywgLnRhYi1saW5rLCBbcm9sZT1cInRhYlwiXScpO1xyXG4gICAgXHJcbiAgICAvLyBBcHByb2FjaCAyOiBUaGUgZWxlbWVudCBpdHNlbGYgbWlnaHQgYmUgdGhlIGxpbmtcclxuICAgIGlmICghY2xpY2tUYXJnZXQgJiYgKHRhYkVsZW1lbnQudGFnTmFtZSA9PT0gJ0EnIHx8IHRhYkVsZW1lbnQudGFnTmFtZSA9PT0gJ0JVVFRPTicgfHwgdGFiRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSA9PT0gJ3RhYicpKSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBBcHByb2FjaCAzOiBGb3IgdmVydGljYWwgdGFicywgbG9vayBmb3IgdGhlIGFuY2hvciBvciBsaW5rIGVsZW1lbnRcclxuICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3RvcignYSwgYnV0dG9uJykgfHwgdGFiRWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggNDogRm9yIFBpdm90SXRlbSwgZmluZCB0aGUgaGVhZGVyIGVsZW1lbnRcclxuICAgIGlmICghY2xpY2tUYXJnZXQgfHwgY2xpY2tUYXJnZXQgPT09IHRhYkVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCBoZWFkZXJOYW1lID0gY29udHJvbE5hbWUgKyAnX2hlYWRlcic7XHJcbiAgICAgICAgY29uc3QgaGVhZGVyRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2hlYWRlck5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGhlYWRlckVsKSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gaGVhZGVyRWwucXVlcnlTZWxlY3RvcignYSwgYnV0dG9uLCAucGl2b3QtbGluaycpIHx8IGhlYWRlckVsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgQ2xpY2tpbmcgdGFiIGVsZW1lbnQ6ICR7Y2xpY2tUYXJnZXQ/LnRhZ05hbWUgfHwgJ3Vua25vd24nfWApO1xyXG4gICAgXHJcbiAgICAvLyBGb2N1cyBhbmQgY2xpY2tcclxuICAgIGlmIChjbGlja1RhcmdldC5mb2N1cykgY2xpY2tUYXJnZXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGZ1bGwgY2xpY2sgc2VxdWVuY2VcclxuICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XHJcbiAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICAgIFxyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gQWxzbyB0cnkgdHJpZ2dlcmluZyB0aGUgRDM2NSBpbnRlcm5hbCBjb250cm9sXHJcbiAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuQWN0aXZhdGVUYWIgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLkFjdGl2YXRlVGFiKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBBY3RpdmF0ZVRhYiBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5hY3RpdmF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuYWN0aXZhdGUoKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgYWN0aXZhdGUgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuc2VsZWN0ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5zZWxlY3QoKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgc2VsZWN0IG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYEQzNjUgY29udHJvbCBtZXRob2QgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIHRhYiBjb250ZW50IHRvIGxvYWRcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbiAgICBcclxuICAgIC8vIFZlcmlmeSB0aGUgdGFiIGlzIG5vdyBhY3RpdmUgYnkgY2hlY2tpbmcgZm9yIHZpc2libGUgY29udGVudFxyXG4gICAgY29uc3QgdGFiQ29udGVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICBpZiAodGFiQ29udGVudCkge1xyXG4gICAgICAgIGNvbnN0IGlzVmlzaWJsZSA9IHRhYkNvbnRlbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsO1xyXG4gICAgICAgIGNvbnN0IGlzQWN0aXZlID0gdGFiQ29udGVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0YWJDb250ZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFiQ29udGVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJykgIT09ICd0cnVlJztcclxuICAgICAgICBsb2dTdGVwKGBUYWIgJHtjb250cm9sTmFtZX0gdmlzaWJpbGl0eSBjaGVjazogdmlzaWJsZT0ke2lzVmlzaWJsZX0sIGFjdGl2ZT0ke2lzQWN0aXZlfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBUYWIgJHtjb250cm9sTmFtZX0gYWN0aXZhdGVkYCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZUFjdGlvblBhbmVUYWIoY29udHJvbE5hbWUpIHtcbiAgICBsb2dTdGVwKGBBY3RpdmF0aW5nIGFjdGlvbiBwYW5lIHRhYjogJHtjb250cm9sTmFtZX1gKTtcblxuICAgIGxldCB0YWJFbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xuXG4gICAgaWYgKCF0YWJFbGVtZW50KSB7XG4gICAgICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcbiAgICAgICAgICAgIGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXG4gICAgICAgICAgICBgLmFwcEJhclRhYltkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgIGAuYXBwQmFyVGFiIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgIGBbcm9sZT1cInRhYlwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYFxuICAgICAgICBdO1xuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xuICAgICAgICAgICAgdGFiRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICAgICAgaWYgKHRhYkVsZW1lbnQpIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCF0YWJFbGVtZW50KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWN0aW9uIHBhbmUgdGFiIG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcbiAgICB9XG5cbiAgICBsZXQgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xuXG4gICAgY29uc3QgaGVhZGVyID0gdGFiRWxlbWVudC5xdWVyeVNlbGVjdG9yPy4oJy5hcHBCYXJUYWItaGVhZGVyLCAuYXBwQmFyVGFiSGVhZGVyLCAuYXBwQmFyVGFiX2hlYWRlcicpO1xuICAgIGlmIChoZWFkZXIpIHtcbiAgICAgICAgY2xpY2tUYXJnZXQgPSBoZWFkZXI7XG4gICAgfVxuXG4gICAgY29uc3QgZm9jdXNTZWxlY3RvciA9IHRhYkVsZW1lbnQuZ2V0QXR0cmlidXRlPy4oJ2RhdGEtZHluLWZvY3VzJyk7XG4gICAgaWYgKGZvY3VzU2VsZWN0b3IpIHtcbiAgICAgICAgY29uc3QgZm9jdXNUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoZm9jdXNTZWxlY3Rvcik7XG4gICAgICAgIGlmIChmb2N1c1RhcmdldCkge1xuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBmb2N1c1RhcmdldDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0YWJFbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdyb2xlJykgPT09ICd0YWInKSB7XG4gICAgICAgIGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudDtcbiAgICB9XG5cbiAgICBpZiAoY2xpY2tUYXJnZXQgPT09IHRhYkVsZW1lbnQpIHtcbiAgICAgICAgY29uc3QgYnV0dG9uaXNoID0gdGFiRWxlbWVudC5xdWVyeVNlbGVjdG9yPy4oJ2J1dHRvbiwgYSwgW3JvbGU9XCJ0YWJcIl0nKTtcbiAgICAgICAgaWYgKGJ1dHRvbmlzaCkgY2xpY2tUYXJnZXQgPSBidXR0b25pc2g7XG4gICAgfVxuXG4gICAgaWYgKGNsaWNrVGFyZ2V0Py5mb2N1cykgY2xpY2tUYXJnZXQuZm9jdXMoKTtcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xuICAgIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZShjbGlja1RhcmdldCk7XG5cbiAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2wgPSAkZHluLmNvbnRyb2xzW2NvbnRyb2xOYW1lXTtcbiAgICAgICAgICAgIGlmIChjb250cm9sKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb250cm9sLmFjdGl2YXRlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuYWN0aXZhdGUoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLnNlbGVjdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBjb250cm9sLnNlbGVjdCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nU3RlcChgQWN0aW9uIHBhbmUgY29udHJvbCBtZXRob2QgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGF3YWl0IHNsZWVwKDYwMCk7XG4gICAgbG9nU3RlcChgQWN0aW9uIHBhbmUgdGFiICR7Y29udHJvbE5hbWV9IGFjdGl2YXRlZGApO1xufVxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleHBhbmRPckNvbGxhcHNlU2VjdGlvbihjb250cm9sTmFtZSwgYWN0aW9uKSB7XHJcbiAgICBsb2dTdGVwKGAke2FjdGlvbiA9PT0gJ2V4cGFuZCcgPyAnRXhwYW5kaW5nJyA6ICdDb2xsYXBzaW5nJ30gc2VjdGlvbjogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIFxyXG4gICAgY29uc3Qgc2VjdGlvbiA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghc2VjdGlvbikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgU2VjdGlvbiBlbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRDM2NSBzZWN0aW9ucyBjYW4gaGF2ZSB2YXJpb3VzIHN0cnVjdHVyZXMuIFRoZSB0b2dnbGUgYnV0dG9uIGlzIHVzdWFsbHk6XHJcbiAgICAvLyAxLiBBIGJ1dHRvbiB3aXRoIGFyaWEtZXhwYW5kZWQgaW5zaWRlIHRoZSBzZWN0aW9uXHJcbiAgICAvLyAyLiBBIHNlY3Rpb24gaGVhZGVyIGVsZW1lbnRcclxuICAgIC8vIDMuIFRoZSBzZWN0aW9uIGl0c2VsZiBtaWdodCBiZSBjbGlja2FibGVcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgdG9nZ2xlIGJ1dHRvbiAtIHRoaXMgaXMgY3J1Y2lhbCBmb3IgRDM2NSBkaWFsb2dzXHJcbiAgICBsZXQgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCdidXR0b25bYXJpYS1leHBhbmRlZF0nKTtcclxuICAgIFxyXG4gICAgLy8gSWYgbm90IGZvdW5kLCB0cnkgb3RoZXIgY29tbW9uIHBhdHRlcm5zXHJcbiAgICBpZiAoIXRvZ2dsZUJ1dHRvbikge1xyXG4gICAgICAgIHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb24ucXVlcnlTZWxlY3RvcignLnNlY3Rpb24tcGFnZS1jYXB0aW9uLCAuc2VjdGlvbi1oZWFkZXIsIC5ncm91cC1oZWFkZXIsIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRm9yIFN5c09wZXJhdGlvblRlbXBsYXRlRm9ybSBzZWN0aW9ucyAoUmVjb3JkcyB0byBpbmNsdWRlLCBSdW4gaW4gdGhlIGJhY2tncm91bmQpXHJcbiAgICAvLyB0aGUgYnV0dG9uIGlzIG9mdGVuIGEgZGlyZWN0IGNoaWxkIG9yIHNpYmxpbmdcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCdidXR0b24nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHNlY3Rpb24gaXRzZWxmIGhhcyBhcmlhLWV4cGFuZGVkIChpdCBtaWdodCBiZSB0aGUgY2xpY2thYmxlIGVsZW1lbnQpXHJcbiAgICBpZiAoIXRvZ2dsZUJ1dHRvbiAmJiBzZWN0aW9uLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgc3RhdGUgZnJvbSB2YXJpb3VzIHNvdXJjZXNcclxuICAgIGxldCBpc0V4cGFuZGVkID0gZmFsc2U7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIHRoZSB0b2dnbGUgYnV0dG9uJ3MgYXJpYS1leHBhbmRlZFxyXG4gICAgaWYgKHRvZ2dsZUJ1dHRvbiAmJiB0b2dnbGVCdXR0b24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICBpc0V4cGFuZGVkID0gdG9nZ2xlQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2UgaWYgKHNlY3Rpb24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICBpc0V4cGFuZGVkID0gc2VjdGlvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBjbGFzcy1iYXNlZCBkZXRlY3Rpb25cclxuICAgICAgICBpc0V4cGFuZGVkID0gc2VjdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgIXNlY3Rpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSBjdXJyZW50IHN0YXRlOiAke2lzRXhwYW5kZWQgPyAnZXhwYW5kZWQnIDogJ2NvbGxhcHNlZCd9YCk7XHJcbiAgICBcclxuICAgIGNvbnN0IG5lZWRzVG9nZ2xlID0gKGFjdGlvbiA9PT0gJ2V4cGFuZCcgJiYgIWlzRXhwYW5kZWQpIHx8IChhY3Rpb24gPT09ICdjb2xsYXBzZScgJiYgaXNFeHBhbmRlZCk7XHJcbiAgICBcclxuICAgIGlmIChuZWVkc1RvZ2dsZSkge1xyXG4gICAgICAgIC8vIENsaWNrIHRoZSB0b2dnbGUgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gdG9nZ2xlQnV0dG9uIHx8IHNlY3Rpb247XHJcbiAgICAgICAgbG9nU3RlcChgQ2xpY2tpbmcgdG9nZ2xlIGVsZW1lbnQ6ICR7Y2xpY2tUYXJnZXQudGFnTmFtZX0sIGNsYXNzPSR7Y2xpY2tUYXJnZXQuY2xhc3NOYW1lfWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc3BhdGNoIGZ1bGwgY2xpY2sgc2VxdWVuY2UgZm9yIEQzNjUgUmVhY3QgY29tcG9uZW50c1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVydXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgRDM2NSBpbnRlcm5hbCBjb250cm9sIEFQSVxyXG4gICAgICAgIGlmICh0eXBlb2YgJGR5biAhPT0gJ3VuZGVmaW5lZCcgJiYgJGR5bi5jb250cm9scykge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29udHJvbCA9ICRkeW4uY29udHJvbHNbY29udHJvbE5hbWVdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNvbnRyb2wpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBUcnkgdmFyaW91cyBEMzY1IG1ldGhvZHNcclxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuRXhwYW5kZWRDaGFuZ2VkID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEV4cGFuZGVkQ2hhbmdlZCB0YWtlcyAwIGZvciBleHBhbmQsIDEgZm9yIGNvbGxhcHNlIGluIEQzNjVcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5FeHBhbmRlZENoYW5nZWQoYWN0aW9uID09PSAnY29sbGFwc2UnID8gMSA6IDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgRXhwYW5kZWRDaGFuZ2VkKCR7YWN0aW9uID09PSAnY29sbGFwc2UnID8gMSA6IDB9KSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuZXhwYW5kID09PSAnZnVuY3Rpb24nICYmIGFjdGlvbiA9PT0gJ2V4cGFuZCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5leHBhbmQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIGV4cGFuZCgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5jb2xsYXBzZSA9PT0gJ2Z1bmN0aW9uJyAmJiBhY3Rpb24gPT09ICdjb2xsYXBzZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5jb2xsYXBzZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgY29sbGFwc2UoKSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wudG9nZ2xlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wudG9nZ2xlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCB0b2dnbGUoKSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgbG9nU3RlcChgRDM2NSBjb250cm9sIG1ldGhvZCBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFNlY3Rpb24gJHtjb250cm9sTmFtZX0gYWxyZWFkeSAke2FjdGlvbn1lZCwgbm8gdG9nZ2xlIG5lZWRlZGApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBTZWN0aW9uICR7Y29udHJvbE5hbWV9ICR7YWN0aW9ufWVkYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVRdWVyeUZpbHRlcih0YWJsZU5hbWUsIGZpZWxkTmFtZSwgY3JpdGVyaWFWYWx1ZSwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgICBsb2dTdGVwKGBDb25maWd1cmluZyBxdWVyeSBmaWx0ZXI6ICR7dGFibGVOYW1lID8gdGFibGVOYW1lICsgJy4nIDogJyd9JHtmaWVsZE5hbWV9ID0gJHtjcml0ZXJpYVZhbHVlfWApO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIG9yIG9wZW4gdGhlIHF1ZXJ5IGZpbHRlciBkaWFsb2dcclxuICAgIGxldCBxdWVyeUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJyk7XHJcbiAgICBpZiAoIXF1ZXJ5Rm9ybSkge1xyXG4gICAgICAgIC8vIFRyeSB0byBvcGVuIHRoZSBxdWVyeSBkaWFsb2cgdmlhIFF1ZXJ5IGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IGZpbHRlckJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlF1ZXJ5U2VsZWN0QnV0dG9uXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cIl0gW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIlF1ZXJ5XCJdJyk7XHJcbiAgICAgICAgaWYgKGZpbHRlckJ1dHRvbikge1xyXG4gICAgICAgICAgICBmaWx0ZXJCdXR0b24uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMTAwMCk7XHJcbiAgICAgICAgICAgIHF1ZXJ5Rm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNRdWVyeUZvcm1cIl0nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghcXVlcnlGb3JtKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdRdWVyeSBmaWx0ZXIgZGlhbG9nIChTeXNRdWVyeUZvcm0pIG5vdCBmb3VuZC4gTWFrZSBzdXJlIHRoZSBmaWx0ZXIgZGlhbG9nIGlzIG9wZW4uJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBmaW5kIGVsZW1lbnQgd2l0aGluIHF1ZXJ5IGZvcm1cclxuICAgIGNvbnN0IGZpbmRJblF1ZXJ5ID0gKG5hbWUpID0+IHF1ZXJ5Rm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke25hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIC8vIElmIHNhdmVkUXVlcnkgaXMgc3BlY2lmaWVkLCBzZWxlY3QgaXQgZnJvbSB0aGUgZHJvcGRvd24gZmlyc3RcclxuICAgIGlmIChvcHRpb25zLnNhdmVkUXVlcnkpIHtcclxuICAgICAgICBjb25zdCBzYXZlZFF1ZXJ5Qm94ID0gZmluZEluUXVlcnkoJ1NhdmVkUXVlcmllc0JveCcpO1xyXG4gICAgICAgIGlmIChzYXZlZFF1ZXJ5Qm94KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gc2F2ZWRRdWVyeUJveC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpO1xyXG4gICAgICAgICAgICBpZiAoaW5wdXQpIHtcclxuICAgICAgICAgICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgb3B0aW9ucy5zYXZlZFF1ZXJ5KTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIE1ha2Ugc3VyZSB3ZSdyZSBvbiB0aGUgUmFuZ2UgdGFiXHJcbiAgICBjb25zdCByYW5nZVRhYiA9IGZpbmRJblF1ZXJ5KCdSYW5nZVRhYicpIHx8IGZpbmRJblF1ZXJ5KCdSYW5nZVRhYl9oZWFkZXInKTtcclxuICAgIGlmIChyYW5nZVRhYiAmJiAhcmFuZ2VUYWIuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSAmJiByYW5nZVRhYi5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSAhPT0gJ3RydWUnKSB7XHJcbiAgICAgICAgcmFuZ2VUYWIuY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDbGljayBBZGQgdG8gYWRkIGEgbmV3IGZpbHRlciByb3dcclxuICAgIGNvbnN0IGFkZEJ1dHRvbiA9IGZpbmRJblF1ZXJ5KCdSYW5nZUFkZCcpO1xyXG4gICAgaWYgKGFkZEJ1dHRvbikge1xyXG4gICAgICAgIGFkZEJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRoZSBncmlkIHVzZXMgUmVhY3RMaXN0IC0gZmluZCB0aGUgbGFzdCByb3cgKG5ld2x5IGFkZGVkKSBhbmQgZmlsbCBpbiB2YWx1ZXNcclxuICAgIGNvbnN0IGdyaWQgPSBmaW5kSW5RdWVyeSgnUmFuZ2VHcmlkJyk7XHJcbiAgICBpZiAoIWdyaWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JhbmdlIGdyaWQgbm90IGZvdW5kJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEdldCBhbGwgcm93cyBhbmQgZmluZCB0aGUgbGFzdCBvbmUgKG1vc3QgcmVjZW50bHkgYWRkZWQpXHJcbiAgICBjb25zdCByb3dzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cInJvd1wiXSwgdHIsIC5saXN0LXJvdycpO1xyXG4gICAgY29uc3QgbGFzdFJvdyA9IHJvd3Nbcm93cy5sZW5ndGggLSAxXSB8fCBncmlkO1xyXG4gICAgXHJcbiAgICAvLyBTZXQgdGFibGUgbmFtZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHRhYmxlTmFtZSkge1xyXG4gICAgICAgIGNvbnN0IHRhYmxlQ2VsbCA9IGxhc3RSb3cucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VUYWJsZVwiXScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVRhYmxlXCJdJyk7XHJcbiAgICAgICAgY29uc3QgbGFzdFRhYmxlQ2VsbCA9IHRhYmxlQ2VsbC5sZW5ndGggPyB0YWJsZUNlbGxbdGFibGVDZWxsLmxlbmd0aCAtIDFdIDogdGFibGVDZWxsO1xyXG4gICAgICAgIGlmIChsYXN0VGFibGVDZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbGFzdFRhYmxlQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGxhc3RUYWJsZUNlbGw7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIHRhYmxlTmFtZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgZmllbGQgbmFtZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKGZpZWxkTmFtZSkge1xyXG4gICAgICAgIGNvbnN0IGZpZWxkQ2VsbHMgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlRmllbGRcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0RmllbGRDZWxsID0gZmllbGRDZWxsc1tmaWVsZENlbGxzLmxlbmd0aCAtIDFdIHx8IGdyaWQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VGaWVsZFwiXScpO1xyXG4gICAgICAgIGlmIChsYXN0RmllbGRDZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbGFzdEZpZWxkQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGxhc3RGaWVsZENlbGw7XHJcbiAgICAgICAgICAgIC8vIENsaWNrIHRvIG9wZW4gZHJvcGRvd24vZm9jdXNcclxuICAgICAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBmaWVsZE5hbWUpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGNyaXRlcmlhIHZhbHVlIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoY3JpdGVyaWFWYWx1ZSkge1xyXG4gICAgICAgIGNvbnN0IHZhbHVlQ2VsbHMgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVmFsdWVcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0VmFsdWVDZWxsID0gdmFsdWVDZWxsc1t2YWx1ZUNlbGxzLmxlbmd0aCAtIDFdIHx8IGdyaWQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VWYWx1ZVwiXScpO1xyXG4gICAgICAgIGlmIChsYXN0VmFsdWVDZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbGFzdFZhbHVlQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGxhc3RWYWx1ZUNlbGw7XHJcbiAgICAgICAgICAgIGlucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgY3JpdGVyaWFWYWx1ZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdRdWVyeSBmaWx0ZXIgY29uZmlndXJlZCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlQmF0Y2hQcm9jZXNzaW5nKGVuYWJsZWQsIHRhc2tEZXNjcmlwdGlvbiwgYmF0Y2hHcm91cCwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgICBsb2dTdGVwKGBDb25maWd1cmluZyBiYXRjaCBwcm9jZXNzaW5nOiAke2VuYWJsZWQgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnfWApO1xyXG4gICAgXHJcbiAgICAvLyBXYWl0IGZvciBkaWFsb2cgdG8gYmUgcmVhZHlcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIGJhdGNoIHByb2Nlc3NpbmcgY2hlY2tib3ggLSBjb250cm9sIG5hbWUgaXMgRmxkMV8xIGluIFN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVxyXG4gICAgY29uc3QgYmF0Y2hUb2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZsZDFfMVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KCdGbGQxXzEnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJGbGQxXzFcIl0nKTtcclxuICAgIFxyXG4gICAgaWYgKGJhdGNoVG9nZ2xlKSB7XHJcbiAgICAgICAgLy8gRmluZCB0aGUgYWN0dWFsIGNoZWNrYm94IGlucHV0IG9yIHRvZ2dsZSBidXR0b25cclxuICAgICAgICBjb25zdCBjaGVja2JveCA9IGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiY2hlY2tib3hcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5xdWVyeVNlbGVjdG9yKCcudG9nZ2xlLWJ1dHRvbicpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGNoZWNrYm94Py5jaGVja2VkIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50U3RhdGUgIT09IGVuYWJsZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSBjaGVja2JveCB8fCBiYXRjaFRvZ2dsZS5xdWVyeVNlbGVjdG9yKCdidXR0b24sIC50b2dnbGUtc3dpdGNoLCBsYWJlbCcpIHx8IGJhdGNoVG9nZ2xlO1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbG9nU3RlcCgnV2FybmluZzogQmF0Y2ggcHJvY2Vzc2luZyB0b2dnbGUgKEZsZDFfMSkgbm90IGZvdW5kJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCB0YXNrIGRlc2NyaXB0aW9uIGlmIHByb3ZpZGVkIGFuZCBiYXRjaCBpcyBlbmFibGVkIChGbGQyXzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiB0YXNrRGVzY3JpcHRpb24pIHtcclxuICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlKCdGbGQyXzEnLCB0YXNrRGVzY3JpcHRpb24pO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBiYXRjaCBncm91cCBpZiBwcm92aWRlZCBhbmQgYmF0Y2ggaXMgZW5hYmxlZCAoRmxkM18xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgYmF0Y2hHcm91cCkge1xyXG4gICAgICAgIGF3YWl0IHNldElucHV0VmFsdWUoJ0ZsZDNfMScsIGJhdGNoR3JvdXApO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBQcml2YXRlIGFuZCBDcml0aWNhbCBvcHRpb25zIGlmIHByb3ZpZGVkIChGbGQ0XzEgYW5kIEZsZDVfMSlcclxuICAgIGlmIChlbmFibGVkICYmIG9wdGlvbnMucHJpdmF0ZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q2hlY2tib3goJ0ZsZDRfMScsIG9wdGlvbnMucHJpdmF0ZSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGVuYWJsZWQgJiYgb3B0aW9ucy5jcml0aWNhbEpvYiAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q2hlY2tib3goJ0ZsZDVfMScsIG9wdGlvbnMuY3JpdGljYWxKb2IpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBNb25pdG9yaW5nIGNhdGVnb3J5IGlmIHNwZWNpZmllZCAoRmxkNl8xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgb3B0aW9ucy5tb25pdG9yaW5nQ2F0ZWdvcnkpIHtcclxuICAgICAgICBhd2FpdCBzZXRDb21ib0JveFZhbHVlKCdGbGQ2XzEnLCBvcHRpb25zLm1vbml0b3JpbmdDYXRlZ29yeSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcCgnQmF0Y2ggcHJvY2Vzc2luZyBjb25maWd1cmVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVSZWN1cnJlbmNlKHN0ZXApIHtcclxuICAgIGNvbnN0IHsgcGF0dGVyblVuaXQsIHBhdHRlcm5Db3VudCwgZW5kRGF0ZU9wdGlvbiwgZW5kQWZ0ZXJDb3VudCwgZW5kQnlEYXRlLCBzdGFydERhdGUsIHN0YXJ0VGltZSwgdGltZXpvbmUgfSA9IHN0ZXA7XHJcbiAgICBcclxuICAgIGNvbnN0IHBhdHRlcm5Vbml0cyA9IFsnbWludXRlcycsICdob3VycycsICdkYXlzJywgJ3dlZWtzJywgJ21vbnRocycsICd5ZWFycyddO1xyXG4gICAgbG9nU3RlcChgQ29uZmlndXJpbmcgcmVjdXJyZW5jZTogZXZlcnkgJHtwYXR0ZXJuQ291bnR9ICR7cGF0dGVyblVuaXRzW3BhdHRlcm5Vbml0IHx8IDBdfWApO1xyXG4gICAgXHJcbiAgICAvLyBDbGljayBSZWN1cnJlbmNlIGJ1dHRvbiB0byBvcGVuIGRpYWxvZyBpZiBub3QgYWxyZWFkeSBvcGVuXHJcbiAgICBsZXQgcmVjdXJyZW5jZUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUmVjdXJyZW5jZVwiXScpO1xyXG4gICAgaWYgKCFyZWN1cnJlbmNlRm9ybSkge1xyXG4gICAgICAgIC8vIE1udUl0bV8xIGlzIHRoZSBSZWN1cnJlbmNlIGJ1dHRvbiBpbiBTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cclxuICAgICAgICBjb25zdCByZWN1cnJlbmNlQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNbnVJdG1fMVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoJ01udUl0bV8xJyk7XHJcbiAgICAgICAgaWYgKHJlY3VycmVuY2VCdXR0b24pIHtcclxuICAgICAgICAgICAgcmVjdXJyZW5jZUJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTtcclxuICAgICAgICAgICAgcmVjdXJyZW5jZUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUmVjdXJyZW5jZVwiXScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFyZWN1cnJlbmNlRm9ybSkge1xyXG4gICAgICAgIGxvZ1N0ZXAoJ1dhcm5pbmc6IENvdWxkIG5vdCBvcGVuIFN5c1JlY3VycmVuY2UgZGlhbG9nJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gZmluZCBlbGVtZW50IHdpdGhpbiByZWN1cnJlbmNlIGZvcm1cclxuICAgIGNvbnN0IGZpbmRJblJlY3VycmVuY2UgPSAobmFtZSkgPT4gcmVjdXJyZW5jZUZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtuYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICAvLyBTZXQgc3RhcnQgZGF0ZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHN0YXJ0RGF0ZSkge1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0RGF0ZUlucHV0ID0gZmluZEluUmVjdXJyZW5jZSgnU3RhcnREYXRlJyk/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEluUmVjdXJyZW5jZSgnU3RhcnREYXRlJyk7XHJcbiAgICAgICAgaWYgKHN0YXJ0RGF0ZUlucHV0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oc3RhcnREYXRlSW5wdXQsIHN0YXJ0RGF0ZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgc3RhcnQgdGltZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHN0YXJ0VGltZSkge1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0VGltZUlucHV0ID0gZmluZEluUmVjdXJyZW5jZSgnU3RhcnRUaW1lJyk/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEluUmVjdXJyZW5jZSgnU3RhcnRUaW1lJyk7XHJcbiAgICAgICAgaWYgKHN0YXJ0VGltZUlucHV0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oc3RhcnRUaW1lSW5wdXQsIHN0YXJ0VGltZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgdGltZXpvbmUgaWYgcHJvdmlkZWRcclxuICAgIGlmICh0aW1lem9uZSkge1xyXG4gICAgICAgIGNvbnN0IHRpbWV6b25lQ29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoJ1RpbWV6b25lJyk7XHJcbiAgICAgICAgaWYgKHRpbWV6b25lQ29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IHRpbWV6b25lQ29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpO1xyXG4gICAgICAgICAgICBpZiAoaW5wdXQpIHtcclxuICAgICAgICAgICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgdGltZXpvbmUpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHBhdHRlcm4gdW5pdCAocmFkaW8gYnV0dG9uczogTWludXRlcz0wLCBIb3Vycz0xLCBEYXlzPTIsIFdlZWtzPTMsIE1vbnRocz00LCBZZWFycz01KVxyXG4gICAgaWYgKHBhdHRlcm5Vbml0ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBjb25zdCBwYXR0ZXJuVW5pdENvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdQYXR0ZXJuVW5pdCcpO1xyXG4gICAgICAgIGlmIChwYXR0ZXJuVW5pdENvbnRyb2wpIHtcclxuICAgICAgICAgICAgLy8gUmFkaW8gYnV0dG9ucyBhcmUgdHlwaWNhbGx5IHJlbmRlcmVkIGFzIGEgZ3JvdXAgd2l0aCBtdWx0aXBsZSBvcHRpb25zXHJcbiAgICAgICAgICAgIGNvbnN0IHJhZGlvSW5wdXRzID0gcGF0dGVyblVuaXRDb250cm9sLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXScpO1xyXG4gICAgICAgICAgICBpZiAocmFkaW9JbnB1dHMubGVuZ3RoID4gcGF0dGVyblVuaXQpIHtcclxuICAgICAgICAgICAgICAgIHJhZGlvSW5wdXRzW3BhdHRlcm5Vbml0XS5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTsgLy8gV2FpdCBmb3IgVUkgdG8gdXBkYXRlIHdpdGggYXBwcm9wcmlhdGUgaW50ZXJ2YWwgZmllbGRcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIFRyeSBjbGlja2luZyB0aGUgbnRoIG9wdGlvbiBsYWJlbC9idXR0b25cclxuICAgICAgICAgICAgICAgIGNvbnN0IHJhZGlvT3B0aW9ucyA9IHBhdHRlcm5Vbml0Q29udHJvbC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cInJhZGlvXCJdLCBsYWJlbCwgYnV0dG9uJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocmFkaW9PcHRpb25zLmxlbmd0aCA+IHBhdHRlcm5Vbml0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmFkaW9PcHRpb25zW3BhdHRlcm5Vbml0XS5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBpbnRlcnZhbCBjb3VudCBiYXNlZCBvbiBwYXR0ZXJuIHVuaXRcclxuICAgIC8vIFRoZSB2aXNpYmxlIGlucHV0IGZpZWxkIGNoYW5nZXMgYmFzZWQgb24gc2VsZWN0ZWQgcGF0dGVybiB1bml0XHJcbiAgICBpZiAocGF0dGVybkNvdW50KSB7XHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sTmFtZXMgPSBbJ01pbnV0ZUludCcsICdIb3VySW50JywgJ0RheUludCcsICdXZWVrSW50JywgJ01vbnRoSW50JywgJ1llYXJJbnQnXTtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2xOYW1lID0gY291bnRDb250cm9sTmFtZXNbcGF0dGVyblVuaXQgfHwgMF07XHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sID0gZmluZEluUmVjdXJyZW5jZShjb3VudENvbnRyb2xOYW1lKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY291bnRDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gY291bnRDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgY291bnRDb250cm9sO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBwYXR0ZXJuQ291bnQudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgZW5kIGRhdGUgb3B0aW9uc1xyXG4gICAgaWYgKGVuZERhdGVPcHRpb24gPT09ICdub0VuZERhdGUnKSB7XHJcbiAgICAgICAgLy8gQ2xpY2sgb24gXCJObyBlbmQgZGF0ZVwiIGdyb3VwIChFbmREYXRlMSlcclxuICAgICAgICBjb25zdCBub0VuZERhdGVHcm91cCA9IGZpbmRJblJlY3VycmVuY2UoJ0VuZERhdGUxJyk7XHJcbiAgICAgICAgaWYgKG5vRW5kRGF0ZUdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJhZGlvID0gbm9FbmREYXRlR3JvdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdLCBbcm9sZT1cInJhZGlvXCJdJykgfHwgbm9FbmREYXRlR3JvdXA7XHJcbiAgICAgICAgICAgIHJhZGlvLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQWZ0ZXInICYmIGVuZEFmdGVyQ291bnQpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIkVuZCBhZnRlclwiIGdyb3VwIChFbmREYXRlMikgYW5kIHNldCBjb3VudFxyXG4gICAgICAgIGNvbnN0IGVuZEFmdGVyR3JvdXAgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlMicpO1xyXG4gICAgICAgIGlmIChlbmRBZnRlckdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJhZGlvID0gZW5kQWZ0ZXJHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBlbmRBZnRlckdyb3VwO1xyXG4gICAgICAgICAgICByYWRpby5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBTZXQgdGhlIGNvdW50IChFbmREYXRlSW50KVxyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoJ0VuZERhdGVJbnQnKTtcclxuICAgICAgICBpZiAoY291bnRDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gY291bnRDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgY291bnRDb250cm9sO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBlbmRBZnRlckNvdW50LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoZW5kRGF0ZU9wdGlvbiA9PT0gJ2VuZEJ5JyAmJiBlbmRCeURhdGUpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIkVuZCBieVwiIGdyb3VwIChFbmREYXRlMykgYW5kIHNldCBkYXRlXHJcbiAgICAgICAgY29uc3QgZW5kQnlHcm91cCA9IGZpbmRJblJlY3VycmVuY2UoJ0VuZERhdGUzJyk7XHJcbiAgICAgICAgaWYgKGVuZEJ5R3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBlbmRCeUdyb3VwLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXSwgW3JvbGU9XCJyYWRpb1wiXScpIHx8IGVuZEJ5R3JvdXA7XHJcbiAgICAgICAgICAgIHJhZGlvLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFNldCB0aGUgZW5kIGRhdGUgKEVuZERhdGVEYXRlKVxyXG4gICAgICAgIGNvbnN0IGRhdGVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZURhdGUnKTtcclxuICAgICAgICBpZiAoZGF0ZUNvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBkYXRlQ29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGRhdGVDb250cm9sO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBlbmRCeURhdGUpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcCgnUmVjdXJyZW5jZSBjb25maWd1cmVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0RWxlbWVudCwgdmFsdWUpIHtcclxuICAgIGlmICghaW5wdXRFbGVtZW50KSByZXR1cm47XHJcbiAgICBcclxuICAgIC8vIEZvY3VzIHRoZSBpbnB1dFxyXG4gICAgaW5wdXRFbGVtZW50LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgXHJcbiAgICAvLyBDbGVhciBleGlzdGluZyB2YWx1ZVxyXG4gICAgaW5wdXRFbGVtZW50LnNlbGVjdD8uKCk7XHJcbiAgICBcclxuICAgIC8vIFNldCB0aGUgdmFsdWVcclxuICAgIGlucHV0RWxlbWVudC52YWx1ZSA9IHZhbHVlO1xyXG4gICAgXHJcbiAgICAvLyBEaXNwYXRjaCBldmVudHNcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXRFbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXRFbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEZpbHRlck1ldGhvZChmaWx0ZXJDb250YWluZXIsIG1ldGhvZCkge1xyXG4gICAgLy8gRmluZCB0aGUgZmlsdGVyIG9wZXJhdG9yIGRyb3Bkb3duIG5lYXIgdGhlIGZpbHRlciBpbnB1dFxyXG4gICAgLy8gRDM2NSB1c2VzIHZhcmlvdXMgcGF0dGVybnMgZm9yIHRoZSBvcGVyYXRvciBkcm9wZG93blxyXG4gICAgY29uc3Qgb3BlcmF0b3JQYXR0ZXJucyA9IFtcclxuICAgICAgICAnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlck9wZXJhdG9yXCJdJyxcclxuICAgICAgICAnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIl9PcGVyYXRvclwiXScsXHJcbiAgICAgICAgJy5maWx0ZXItb3BlcmF0b3InLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkNvbWJvQm94XCJdJ1xyXG4gICAgXTtcclxuICAgIFxyXG4gICAgbGV0IG9wZXJhdG9yRHJvcGRvd24gPSBudWxsO1xyXG4gICAgY29uc3Qgc2VhcmNoQ29udGFpbmVyID0gZmlsdGVyQ29udGFpbmVyPy5wYXJlbnRFbGVtZW50IHx8IGRvY3VtZW50O1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2Ygb3BlcmF0b3JQYXR0ZXJucykge1xyXG4gICAgICAgIG9wZXJhdG9yRHJvcGRvd24gPSBzZWFyY2hDb250YWluZXIucXVlcnlTZWxlY3RvcihwYXR0ZXJuKTtcclxuICAgICAgICBpZiAob3BlcmF0b3JEcm9wZG93biAmJiBvcGVyYXRvckRyb3Bkb3duLm9mZnNldFBhcmVudCAhPT0gbnVsbCkgYnJlYWs7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghb3BlcmF0b3JEcm9wZG93bikge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjZBMCBGaWx0ZXIgb3BlcmF0b3IgZHJvcGRvd24gbm90IGZvdW5kLCB1c2luZyBkZWZhdWx0IG1ldGhvZGApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2xpY2sgdG8gb3BlbiB0aGUgZHJvcGRvd25cclxuICAgIGNvbnN0IGRyb3Bkb3duQnV0dG9uID0gb3BlcmF0b3JEcm9wZG93bi5xdWVyeVNlbGVjdG9yKCdidXR0b24sIFtyb2xlPVwiY29tYm9ib3hcIl0sIC5keW4tY29tYm9Cb3gtYnV0dG9uJykgfHwgb3BlcmF0b3JEcm9wZG93bjtcclxuICAgIGRyb3Bkb3duQnV0dG9uLmNsaWNrKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIGFuZCBjbGljayB0aGUgbWF0Y2hpbmcgb3B0aW9uXHJcbiAgICBjb25zdCBtZXRob2RNYXBwaW5ncyA9IHtcclxuICAgICAgICAnaXMgZXhhY3RseSc6IFsnaXMgZXhhY3RseScsICdlcXVhbHMnLCAnaXMgZXF1YWwgdG8nLCAnPSddLFxyXG4gICAgICAgICdjb250YWlucyc6IFsnY29udGFpbnMnLCAnbGlrZSddLFxyXG4gICAgICAgICdiZWdpbnMgd2l0aCc6IFsnYmVnaW5zIHdpdGgnLCAnc3RhcnRzIHdpdGgnXSxcclxuICAgICAgICAnaXMgbm90JzogWydpcyBub3QnLCAnbm90IGVxdWFsJywgJyE9JywgJzw+J10sXHJcbiAgICAgICAgJ2RvZXMgbm90IGNvbnRhaW4nOiBbJ2RvZXMgbm90IGNvbnRhaW4nLCAnbm90IGxpa2UnXSxcclxuICAgICAgICAnaXMgb25lIG9mJzogWydpcyBvbmUgb2YnLCAnaW4nXSxcclxuICAgICAgICAnYWZ0ZXInOiBbJ2FmdGVyJywgJ2dyZWF0ZXIgdGhhbicsICc+J10sXHJcbiAgICAgICAgJ2JlZm9yZSc6IFsnYmVmb3JlJywgJ2xlc3MgdGhhbicsICc8J10sXHJcbiAgICAgICAgJ21hdGNoZXMnOiBbJ21hdGNoZXMnLCAncmVnZXgnLCAncGF0dGVybiddXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBjb25zdCBzZWFyY2hUZXJtcyA9IG1ldGhvZE1hcHBpbmdzW21ldGhvZF0gfHwgW21ldGhvZF07XHJcbiAgICBcclxuICAgIC8vIExvb2sgZm9yIG9wdGlvbnMgaW4gbGlzdGJveC9kcm9wZG93blxyXG4gICAgY29uc3Qgb3B0aW9ucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwib3B0aW9uXCJdLCBbcm9sZT1cImxpc3RpdGVtXCJdLCAuZHluLWxpc3RWaWV3LWl0ZW0nKTtcclxuICAgIGZvciAoY29uc3Qgb3B0IG9mIG9wdGlvbnMpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gb3B0LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgZm9yIChjb25zdCB0ZXJtIG9mIHNlYXJjaFRlcm1zKSB7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0LmluY2x1ZGVzKHRlcm0udG9Mb3dlckNhc2UoKSkpIHtcclxuICAgICAgICAgICAgICAgIG9wdC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFNldCBmaWx0ZXIgbWV0aG9kOiAke21ldGhvZH1gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHNlbGVjdCBlbGVtZW50XHJcbiAgICBjb25zdCBzZWxlY3RFbCA9IG9wZXJhdG9yRHJvcGRvd24ucXVlcnlTZWxlY3Rvcignc2VsZWN0Jyk7XHJcbiAgICBpZiAoc2VsZWN0RWwpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IG9wdCBvZiBzZWxlY3RFbC5vcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBvcHQudGV4dENvbnRlbnQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCB0ZXJtIG9mIHNlYXJjaFRlcm1zKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGV4dC5pbmNsdWRlcyh0ZXJtLnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0RWwudmFsdWUgPSBvcHQudmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0RWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBTZXQgZmlsdGVyIG1ldGhvZDogJHttZXRob2R9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgICBcdTI2QTAgQ291bGQgbm90IHNldCBmaWx0ZXIgbWV0aG9kIFwiJHttZXRob2R9XCIsIHVzaW5nIGRlZmF1bHRgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFJhZGlvQnV0dG9uVmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIGxvZ1N0ZXAoYFNldHRpbmcgcmFkaW8gYnV0dG9uIHZhbHVlOiAke3ZhbHVlfWApO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIGFsbCByYWRpbyBvcHRpb25zIGluIHRoaXMgZ3JvdXBcclxuICAgIGNvbnN0IHJhZGlvSW5wdXRzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0nKTtcclxuICAgIGNvbnN0IHJhZGlvUm9sZXMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicmFkaW9cIl0nKTtcclxuICAgIGNvbnN0IG9wdGlvbnMgPSByYWRpb0lucHV0cy5sZW5ndGggPiAwID8gQXJyYXkuZnJvbShyYWRpb0lucHV0cykgOiBBcnJheS5mcm9tKHJhZGlvUm9sZXMpO1xyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAvLyBUcnkgZmluZGluZyBjbGlja2FibGUgbGFiZWxzL2J1dHRvbnMgdGhhdCBhY3QgYXMgcmFkaW8gb3B0aW9uc1xyXG4gICAgICAgIGNvbnN0IGxhYmVsQnV0dG9ucyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnbGFiZWwsIGJ1dHRvbiwgW2RhdGEtZHluLXJvbGU9XCJSYWRpb0J1dHRvblwiXScpO1xyXG4gICAgICAgIG9wdGlvbnMucHVzaCguLi5BcnJheS5mcm9tKGxhYmVsQnV0dG9ucykpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIHJhZGlvIG9wdGlvbnMgZm91bmQgaW4gZWxlbWVudGApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBGb3VuZCAke29wdGlvbnMubGVuZ3RofSByYWRpbyBvcHRpb25zYCk7XHJcbiAgICBcclxuICAgIC8vIFRyeSB0byBtYXRjaCBieSBpbmRleCAoaWYgdmFsdWUgaXMgYSBudW1iZXIgb3IgbnVtZXJpYyBzdHJpbmcpXHJcbiAgICBjb25zdCBudW1WYWx1ZSA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XHJcbiAgICBpZiAoIWlzTmFOKG51bVZhbHVlKSAmJiBudW1WYWx1ZSA+PSAwICYmIG51bVZhbHVlIDwgb3B0aW9ucy5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXRPcHRpb24gPSBvcHRpb25zW251bVZhbHVlXTtcclxuICAgICAgICBsb2dTdGVwKGBDbGlja2luZyByYWRpbyBvcHRpb24gYXQgaW5kZXggJHtudW1WYWx1ZX1gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDbGljayB0aGUgcmFkaW8gb3B0aW9uIG9yIGl0cyBhc3NvY2lhdGVkIGxhYmVsXHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSB0YXJnZXRPcHRpb24udGFnTmFtZSA9PT0gJ0lOUFVUJyBcclxuICAgICAgICAgICAgPyAodGFyZ2V0T3B0aW9uLmNsb3Nlc3QoJ2xhYmVsJykgfHwgdGFyZ2V0T3B0aW9uLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJykgfHwgdGFyZ2V0T3B0aW9uKVxyXG4gICAgICAgICAgICA6IHRhcmdldE9wdGlvbjtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEaXNwYXRjaCBmdWxsIGNsaWNrIHNlcXVlbmNlXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJ1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIHRyeSBjbGlja2luZyB0aGUgaW5wdXQgZGlyZWN0bHlcclxuICAgICAgICBpZiAodGFyZ2V0T3B0aW9uLnRhZ05hbWUgPT09ICdJTlBVVCcpIHtcclxuICAgICAgICAgICAgdGFyZ2V0T3B0aW9uLmNoZWNrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB0YXJnZXRPcHRpb24uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gbWF0Y2ggYnkgbGFiZWwgdGV4dFxyXG4gICAgY29uc3Qgc2VhcmNoVmFsdWUgPSBTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgbGFiZWwgPSBvcHRpb24uY2xvc2VzdCgnbGFiZWwnKSB8fCBvcHRpb24ucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcignbGFiZWwnKTtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkudG9Mb3dlckNhc2UoKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICBvcHRpb24uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LnRvTG93ZXJDYXNlKCkgfHxcclxuICAgICAgICAgICAgICAgICAgICBvcHRpb24udGV4dENvbnRlbnQ/LnRyaW0oKS50b0xvd2VyQ2FzZSgpIHx8ICcnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0ZXh0LmluY2x1ZGVzKHNlYXJjaFZhbHVlKSB8fCBzZWFyY2hWYWx1ZS5pbmNsdWRlcyh0ZXh0KSkge1xyXG4gICAgICAgICAgICBsb2dTdGVwKGBDbGlja2luZyByYWRpbyBvcHRpb24gd2l0aCB0ZXh0OiAke3RleHR9YCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gbGFiZWwgfHwgb3B0aW9uO1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG9wdGlvbi50YWdOYW1lID09PSAnSU5QVVQnKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb24uY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBvcHRpb24uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcihgUmFkaW8gb3B0aW9uIG5vdCBmb3VuZCBmb3IgdmFsdWU6ICR7dmFsdWV9YCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRTZWdtZW50ZWRFbnRyeVZhbHVlKGVsZW1lbnQsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gU2VnbWVudGVkRW50cnknKTtcclxuXHJcbiAgICAvLyBGaW5kIHRoZSBsb29rdXAgYnV0dG9uXHJcbiAgICBjb25zdCBsb29rdXBCdXR0b24gPSBmaW5kTG9va3VwQnV0dG9uKGVsZW1lbnQpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBubyBsb29rdXAgYnV0dG9uLCB0cnkga2V5Ym9hcmQgdG8gb3BlbiB0aGUgZmx5b3V0IGZpcnN0XHJcbiAgICBpZiAoIWxvb2t1cEJ1dHRvbikge1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IG9wZW5Mb29rdXBCeUtleWJvYXJkKGlucHV0KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDbGljayB0aGUgbG9va3VwIGJ1dHRvbiB0byBvcGVuIHRoZSBkcm9wZG93blxyXG4gICAgaWYgKGxvb2t1cEJ1dHRvbikge1xyXG4gICAgICAgIGxvb2t1cEJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDgwMCk7IC8vIFdhaXQgZm9yIGxvb2t1cCB0byBsb2FkXHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCB0aGUgbG9va3VwIHBvcHVwL2ZseW91dFxyXG4gICAgY29uc3QgbG9va3VwUG9wdXAgPSBhd2FpdCB3YWl0Rm9yTG9va3VwUG9wdXAoKTtcclxuICAgIGlmICghbG9va3VwUG9wdXApIHtcclxuICAgICAgICBpZiAoIXdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3M/LnN1cHByZXNzTG9va3VwV2FybmluZ3MpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdMb29rdXAgcG9wdXAgbm90IGZvdW5kLCB0cnlpbmcgZGlyZWN0IGlucHV0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgYSBkb2NrZWQgbG9va3VwIGZseW91dCBleGlzdHMgKHNlZ21lbnRlZCBlbnRyeSksIHR5cGUgaW50byBpdHMgZmlsdGVyIGlucHV0XHJcbiAgICBjb25zdCBkb2NrID0gYXdhaXQgd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KGVsZW1lbnQsIDE1MDApO1xyXG4gICAgaWYgKGRvY2spIHtcclxuICAgICAgICBjb25zdCBkb2NrSW5wdXQgPSBmaW5kTG9va3VwRmlsdGVySW5wdXQoZG9jayk7XHJcbiAgICAgICAgaWYgKGRvY2tJbnB1dCkge1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGRvY2tJbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBUeXBlIHZhbHVlIGluIHRoZSBzZWFyY2gvZmlsdGVyIGZpZWxkIG9mIHRoZSBsb29rdXBcclxuICAgIGNvbnN0IGxvb2t1cElucHV0ID0gbG9va3VwUG9wdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInRleHRcIl0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICBpZiAobG9va3VwSW5wdXQpIHtcclxuICAgICAgICBsb29rdXBJbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChsb29rdXBJbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGxvb2t1cElucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwMCk7IC8vIFdhaXQgZm9yIHNlcnZlciBmaWx0ZXJcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBhbmQgY2xpY2sgdGhlIG1hdGNoaW5nIHJvd1xyXG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cFBvcHVwLCBlbGVtZW50LCA1MDAwKTtcclxuICAgIGxldCBmb3VuZE1hdGNoID0gZmFsc2U7XHJcbiAgICBcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm93LnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XHJcbiAgICAgICAgaWYgKHRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSByb3cucXVlcnlTZWxlY3RvcignW3JvbGU9XCJncmlkY2VsbFwiXSwgdGQnKTtcclxuICAgICAgICAgICAgKGNlbGwgfHwgcm93KS5jbGljaygpO1xyXG4gICAgICAgICAgICBmb3VuZE1hdGNoID0gdHJ1ZTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFmb3VuZE1hdGNoKSB7XHJcbiAgICAgICAgY29uc3Qgc2FtcGxlID0gQXJyYXkuZnJvbShyb3dzKS5zbGljZSgwLCA4KS5tYXAociA9PiByLnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykpO1xyXG4gICAgICAgIGlmICghd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uc3VwcHJlc3NMb29rdXBXYXJuaW5ncykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ05vIG1hdGNoaW5nIGxvb2t1cCB2YWx1ZSBmb3VuZCwgY2xvc2luZyBwb3B1cCcsIHsgdmFsdWUsIHNhbXBsZSB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gVHJ5IHRvIGNsb3NlIHRoZSBwb3B1cFxyXG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gbG9va3VwUG9wdXAucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiQ2xvc2VcIl0sIC5jbG9zZS1idXR0b24nKTtcclxuICAgICAgICBpZiAoY2xvc2VCdG4pIGNsb3NlQnRuLmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gZGlyZWN0IHR5cGluZ1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0sIHNlbGVjdCcpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gQ29tYm9Cb3gnKTtcclxuXHJcbiAgICAvLyBJZiBpdCdzIGEgbmF0aXZlIHNlbGVjdCwgdXNlIG9wdGlvbiBzZWxlY3Rpb25cclxuICAgIGlmIChpbnB1dC50YWdOYW1lID09PSAnU0VMRUNUJykge1xyXG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBBcnJheS5mcm9tKGlucHV0Lm9wdGlvbnMpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IG9wdGlvbnMuZmluZChvcHQgPT4gb3B0LnRleHQudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKSkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLmZpbmQob3B0ID0+IG9wdC50ZXh0LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpKSk7XHJcbiAgICAgICAgaWYgKCF0YXJnZXQpIHRocm93IG5ldyBFcnJvcihgT3B0aW9uIG5vdCBmb3VuZDogJHt2YWx1ZX1gKTtcclxuICAgICAgICBpbnB1dC52YWx1ZSA9IHRhcmdldC52YWx1ZTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT3BlbiB0aGUgZHJvcGRvd24gKGJ1dHRvbiBwcmVmZXJyZWQpXHJcbiAgICBjb25zdCBjb21ib0J1dHRvbiA9IGZpbmRDb21ib0JveEJ1dHRvbihlbGVtZW50KTtcclxuICAgIGlmIChjb21ib0J1dHRvbikge1xyXG4gICAgICAgIGNvbWJvQnV0dG9uLmNsaWNrKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlucHV0LmNsaWNrPy4oKTtcclxuICAgIH1cclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG5cclxuICAgIC8vIFRyeSB0eXBpbmcgdG8gZmlsdGVyIHdoZW4gYWxsb3dlZCAodXNlIHNlbGVjdGVkIGlucHV0IG1ldGhvZClcclxuICAgIGlmICghaW5wdXQucmVhZE9ubHkgJiYgIWlucHV0LmRpc2FibGVkKSB7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZpbmQgbGlzdGJveCBuZWFyIHRoZSBmaWVsZCBvciBsaW5rZWQgdmlhIGFyaWEtY29udHJvbHNcclxuICAgIGNvbnN0IGxpc3Rib3ggPSBhd2FpdCB3YWl0Rm9yTGlzdGJveEZvcklucHV0KGlucHV0LCBlbGVtZW50KTtcclxuICAgIGlmICghbGlzdGJveCkge1xyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBwcmVzcyBFbnRlciB0byBjb21taXQgdHlwZWQgdmFsdWVcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG9wdGlvbnMgPSBjb2xsZWN0Q29tYm9PcHRpb25zKGxpc3Rib3gpO1xyXG4gICAgY29uc3Qgc2VhcmNoID0gbm9ybWFsaXplVGV4dCh2YWx1ZSk7XHJcbiAgICBsZXQgbWF0Y2hlZCA9IGZhbHNlO1xyXG4gICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KG9wdGlvbi50ZXh0Q29udGVudCk7XHJcbiAgICAgICAgaWYgKHRleHQgPT09IHNlYXJjaCB8fCB0ZXh0LmluY2x1ZGVzKHNlYXJjaCkpIHtcclxuICAgICAgICAgICAgLy8gVHJ5IHRvIG1hcmsgc2VsZWN0aW9uIGZvciBBUklBLWJhc2VkIGNvbWJvYm94ZXNcclxuICAgICAgICAgICAgb3B0aW9ucy5mb3JFYWNoKG9wdCA9PiBvcHQuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ2ZhbHNlJykpO1xyXG4gICAgICAgICAgICBvcHRpb24uc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ3RydWUnKTtcclxuICAgICAgICAgICAgaWYgKCFvcHRpb24uaWQpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5pZCA9IGBkMzY1b3B0XyR7RGF0ZS5ub3coKX1fJHtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMCl9YDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcsIG9wdGlvbi5pZCk7XHJcblxyXG4gICAgICAgICAgICBvcHRpb24uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnIH0pO1xyXG4gICAgICAgICAgICBjb25zdCBvcHRpb25UZXh0ID0gb3B0aW9uLnRleHRDb250ZW50LnRyaW0oKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENsaWNrIHRoZSBvcHRpb24gdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZShvcHRpb24pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCA4MDApO1xyXG4gICAgICAgICAgICBpZiAoIWFwcGxpZWQpIHtcclxuICAgICAgICAgICAgICAgIC8vIFNvbWUgRDM2NSBjb21ib3MgY29tbWl0IG9uIGtleSBzZWxlY3Rpb24gcmF0aGVyIHRoYW4gY2xpY2tcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdBcnJvd0Rvd24nLCBjb2RlOiAnQXJyb3dEb3duJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEZvcmNlIGlucHV0IHZhbHVlIHVwZGF0ZSBmb3IgRDM2NSBjb21ib2JveGVzXHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDQwMCk7XHJcbiAgICAgICAgICAgIGlmIChub3JtYWxpemVUZXh0KGlucHV0LnZhbHVlKSAhPT0gbm9ybWFsaXplVGV4dChvcHRpb25UZXh0KSkge1xyXG4gICAgICAgICAgICAgICAgY29tbWl0Q29tYm9WYWx1ZShpbnB1dCwgb3B0aW9uVGV4dCwgZWxlbWVudCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjb21taXRDb21ib1ZhbHVlKGlucHV0LCBpbnB1dC52YWx1ZSwgZWxlbWVudCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIG1hdGNoZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFtYXRjaGVkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcHRpb24gbm90IGZvdW5kOiAke3ZhbHVlfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0Q2hlY2tib3goY29udHJvbE5hbWUsIGNoZWNrZWQpIHtcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICBpZiAoIWNvbnRhaW5lcikge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6IENoZWNrYm94ICR7Y29udHJvbE5hbWV9IG5vdCBmb3VuZGApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgY2hlY2tib3ggPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXIucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXScpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBjaGVja2JveD8uY2hlY2tlZCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpO1xyXG4gICAgXHJcbiAgICBpZiAoY3VycmVudFN0YXRlICE9PSBjaGVja2VkKSB7XHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSBjaGVja2JveCB8fCBjb250YWluZXIucXVlcnlTZWxlY3RvcignbGFiZWwsIGJ1dHRvbicpIHx8IGNvbnRhaW5lcjtcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgfVxyXG59XHJcbiIsICJpbXBvcnQgRDM2NUluc3BlY3RvciBmcm9tICcuL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzJztcclxuaW1wb3J0IHsgbG9nU3RlcCwgc2VuZExvZyB9IGZyb20gJy4vdXRpbHMvbG9nZ2luZy5qcyc7XHJcbmltcG9ydCB7IHNsZWVwIH0gZnJvbSAnLi91dGlscy9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGNvZXJjZUJvb2xlYW4sIG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuL3V0aWxzL3RleHQuanMnO1xyXG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuL3J1bnRpbWUvZXJyb3JzLmpzJztcclxuaW1wb3J0IHsgY2xpY2tFbGVtZW50LCBhcHBseUdyaWRGaWx0ZXIsIHdhaXRVbnRpbENvbmRpdGlvbiwgc2V0SW5wdXRWYWx1ZSwgc2V0R3JpZENlbGxWYWx1ZSwgc2V0TG9va3VwU2VsZWN0VmFsdWUsIHNldENoZWNrYm94VmFsdWUsIG5hdmlnYXRlVG9Gb3JtLCBhY3RpdmF0ZVRhYiwgYWN0aXZhdGVBY3Rpb25QYW5lVGFiLCBleHBhbmRPckNvbGxhcHNlU2VjdGlvbiwgY29uZmlndXJlUXVlcnlGaWx0ZXIsIGNvbmZpZ3VyZUJhdGNoUHJvY2Vzc2luZywgY2xvc2VEaWFsb2csIGNvbmZpZ3VyZVJlY3VycmVuY2UgfSBmcm9tICcuL3N0ZXBzL2FjdGlvbnMuanMnO1xuXHJcblxyXG53aW5kb3cuRDM2NUluc3BlY3RvciA9IEQzNjVJbnNwZWN0b3I7XHJcblxyXG4vLyA9PT09PT0gSW5pdGlhbGl6ZSBhbmQgTGlzdGVuIGZvciBNZXNzYWdlcyA9PT09PT1cclxuXHJcbi8vIFByZXZlbnQgZHVwbGljYXRlIGluaXRpYWxpemF0aW9uXHJcbmlmICh3aW5kb3cuZDM2NUluamVjdGVkU2NyaXB0TG9hZGVkKSB7XHJcbiAgICBjb25zb2xlLmxvZygnRDM2NSBpbmplY3RlZCBzY3JpcHQgYWxyZWFkeSBsb2FkZWQsIHNraXBwaW5nLi4uJyk7XHJcbn0gZWxzZSB7XHJcbiAgICB3aW5kb3cuZDM2NUluamVjdGVkU2NyaXB0TG9hZGVkID0gdHJ1ZTtcclxuXHJcbiAgICAvLyBDcmVhdGUgaW5zcGVjdG9yIGluc3RhbmNlXHJcbiAgICBjb25zdCBpbnNwZWN0b3IgPSBuZXcgRDM2NUluc3BlY3RvcigpO1xyXG5cclxuICAgIC8vID09PT09PSBXb3JrZmxvdyBFeGVjdXRpb24gRW5naW5lID09PT09PVxyXG4gICAgbGV0IGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0ge307XHJcbiAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gY3VycmVudFdvcmtmbG93U2V0dGluZ3M7XHJcbiAgICBsZXQgY3VycmVudFdvcmtmbG93ID0gbnVsbDtcclxuICAgIGxldCBleGVjdXRpb25Db250cm9sID0ge1xyXG4gICAgICAgIGlzUGF1c2VkOiBmYWxzZSxcclxuICAgICAgICBpc1N0b3BwZWQ6IGZhbHNlLFxyXG4gICAgICAgIGN1cnJlbnRTdGVwSW5kZXg6IDAsXHJcbiAgICAgICAgY3VycmVudFJvd0luZGV4OiAwLFxyXG4gICAgICAgIHRvdGFsUm93czogMCxcclxuICAgICAgICBjdXJyZW50RGF0YVJvdzogbnVsbCxcclxuICAgICAgICBydW5PcHRpb25zOiB7XHJcbiAgICAgICAgICAgIHNraXBSb3dzOiAwLFxyXG4gICAgICAgICAgICBsaW1pdFJvd3M6IDAsXHJcbiAgICAgICAgICAgIGRyeVJ1bjogZmFsc2VcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFNpbmdsZSB1bmlmaWVkIG1lc3NhZ2UgbGlzdGVuZXJcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgaWYgKGV2ZW50LnNvdXJjZSAhPT0gd2luZG93KSByZXR1cm47XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGlzY292ZXJ5IHJlcXVlc3RzXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfRElTQ09WRVJfRUxFTUVOVFMnKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUZvcm1Pbmx5ID0gZXZlbnQuZGF0YS5hY3RpdmVGb3JtT25seSB8fCBmYWxzZTtcclxuICAgICAgICAgICAgY29uc3QgZWxlbWVudHMgPSBpbnNwZWN0b3IuZGlzY292ZXJFbGVtZW50cyhhY3RpdmVGb3JtT25seSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUZvcm0gPSBpbnNwZWN0b3IuZ2V0QWN0aXZlRm9ybU5hbWUoKTtcclxuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X0VMRU1FTlRTX0RJU0NPVkVSRUQnLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudHM6IGVsZW1lbnRzLm1hcChlbCA9PiAoe1xyXG4gICAgICAgICAgICAgICAgICAgIC4uLmVsLFxyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHVuZGVmaW5lZCAvLyBSZW1vdmUgRE9NIHJlZmVyZW5jZSBmb3Igc2VyaWFsaXphdGlvblxyXG4gICAgICAgICAgICAgICAgfSkpLFxyXG4gICAgICAgICAgICAgICAgYWN0aXZlRm9ybTogYWN0aXZlRm9ybVxyXG4gICAgICAgICAgICB9LCAnKicpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RBUlRfUElDS0VSJykge1xyXG4gICAgICAgICAgICBpbnNwZWN0b3Iuc3RhcnRFbGVtZW50UGlja2VyKChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAvLyBBZGQgZm9ybSBuYW1lIHRvIHBpY2tlZCBlbGVtZW50XHJcbiAgICAgICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IGluc3BlY3Rvci5nZXRFbGVtZW50Rm9ybU5hbWUoZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtlbGVtZW50LmNvbnRyb2xOYW1lfVwiXWApKTtcclxuICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfRUxFTUVOVF9QSUNLRUQnLFxyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHsgLi4uZWxlbWVudCwgZm9ybU5hbWUgfVxyXG4gICAgICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9TVE9QX1BJQ0tFUicpIHtcclxuICAgICAgICAgICAgaW5zcGVjdG9yLnN0b3BFbGVtZW50UGlja2VyKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9FWEVDVVRFX1dPUktGTE9XJykge1xyXG4gICAgICAgICAgICBleGVjdXRlV29ya2Zsb3coZXZlbnQuZGF0YS53b3JrZmxvdywgZXZlbnQuZGF0YS5kYXRhKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X05BVl9CVVRUT05TX1VQREFURScpIHtcclxuICAgICAgICAgICAgdXBkYXRlTmF2QnV0dG9ucyhldmVudC5kYXRhLnBheWxvYWQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBFeGVjdXRpb24gY29udHJvbHNcclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9QQVVTRV9XT1JLRkxPVycpIHtcclxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1JFU1VNRV9XT1JLRkxPVycpIHtcclxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9TVE9QX1dPUktGTE9XJykge1xyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBsZXQgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gbnVsbDtcclxuICAgIGxldCBuYXZCdXR0b25zUmV0cnlUaW1lciA9IG51bGw7XHJcblxyXG4gICAgZnVuY3Rpb24gdXBkYXRlTmF2QnV0dG9ucyhwYXlsb2FkKSB7XHJcbiAgICAgICAgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gcGF5bG9hZCB8fCBudWxsO1xyXG4gICAgICAgIHJlbmRlck5hdkJ1dHRvbnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW5kZXJOYXZCdXR0b25zKCkge1xyXG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBwZW5kaW5nTmF2QnV0dG9uc1BheWxvYWQ7XHJcbiAgICAgICAgaWYgKCFwYXlsb2FkKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IG5hdkdyb3VwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25hdmlnYXRpb25NYWluQWN0aW9uR3JvdXAnKTtcclxuICAgICAgICBpZiAoIW5hdkdyb3VwKSB7XHJcbiAgICAgICAgICAgIGlmICghbmF2QnV0dG9uc1JldHJ5VGltZXIpIHtcclxuICAgICAgICAgICAgICAgIG5hdkJ1dHRvbnNSZXRyeVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlbmRlck5hdkJ1dHRvbnMoKTtcclxuICAgICAgICAgICAgICAgIH0sIDEwMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2QzNjUtbmF2LWJ1dHRvbnMtY29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGV4aXN0aW5nQ29udGFpbmVyLnJlbW92ZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IEFycmF5LmlzQXJyYXkocGF5bG9hZC5idXR0b25zKSA/IHBheWxvYWQuYnV0dG9ucyA6IFtdO1xyXG4gICAgICAgIGlmICghYnV0dG9ucy5sZW5ndGgpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudE1lbnVJdGVtID0gKHBheWxvYWQubWVudUl0ZW0gfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHZpc2libGVCdXR0b25zID0gYnV0dG9ucy5maWx0ZXIoKGJ1dHRvbikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBtZW51SXRlbXMgPSBBcnJheS5pc0FycmF5KGJ1dHRvbi5tZW51SXRlbXMpID8gYnV0dG9uLm1lbnVJdGVtcyA6IFtdO1xyXG4gICAgICAgICAgICBpZiAoIW1lbnVJdGVtcy5sZW5ndGgpIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICBpZiAoIWN1cnJlbnRNZW51SXRlbSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gbWVudUl0ZW1zLnNvbWUoKGl0ZW0pID0+IChpdGVtIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSBjdXJyZW50TWVudUl0ZW0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoIXZpc2libGVCdXR0b25zLmxlbmd0aCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBjb250YWluZXIuaWQgPSAnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInO1xyXG4gICAgICAgIGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgIGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnNnB4JztcclxuICAgICAgICBjb250YWluZXIuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xyXG4gICAgICAgIGNvbnRhaW5lci5zdHlsZS5tYXJnaW5SaWdodCA9ICc2cHgnO1xyXG5cclxuICAgICAgICB2aXNpYmxlQnV0dG9ucy5mb3JFYWNoKChidXR0b25Db25maWcpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYnV0dG9uV3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBidXR0b25XcmFwcGVyLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLWNvbXBhbnkgbmF2aWdhdGlvbkJhci1waW5uZWRFbGVtZW50JztcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbkVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnR5cGUgPSAnYnV0dG9uJztcclxuICAgICAgICAgICAgYnV0dG9uRWwuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItc2VhcmNoJztcclxuICAgICAgICAgICAgYnV0dG9uRWwudGV4dENvbnRlbnQgPSBidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdyc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnRpdGxlID0gYnV0dG9uQ29uZmlnLm5hbWUgfHwgJyc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1idXR0b24taWQnLCBidXR0b25Db25maWcuaWQgfHwgJycpO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5oZWlnaHQgPSAnMjRweCc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLnBhZGRpbmcgPSAnMCA4cHgnO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnNHB4JztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMzUpJztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMTIpJztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuY29sb3IgPSAnI2ZmZmZmZic7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmZvbnRTaXplID0gJzEycHgnO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmxpbmVIZWlnaHQgPSAnMjJweCc7XHJcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUud2hpdGVTcGFjZSA9ICdub3dyYXAnO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1mbGV4JztcclxuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5ib3hTaGFkb3cgPSAnaW5zZXQgMCAwIDAgMXB4IHJnYmEoMjU1LDI1NSwyNTUsMC4wOCknO1xyXG5cclxuICAgICAgICAgICAgYnV0dG9uRWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB3b3JrZmxvdyA9IGJ1dHRvbkNvbmZpZy53b3JrZmxvdztcclxuICAgICAgICAgICAgICAgIGlmICghd29ya2Zsb3cpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBXb3JrZmxvdyBub3QgZm91bmQgZm9yIG5hdiBidXR0b246ICR7YnV0dG9uQ29uZmlnLm5hbWUgfHwgYnV0dG9uQ29uZmlnLmlkfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB3b3JrZmxvdy5kYXRhU291cmNlcz8ucHJpbWFyeT8uZGF0YSB8fCB3b3JrZmxvdy5kYXRhU291cmNlPy5kYXRhIHx8IFtdO1xyXG4gICAgICAgICAgICAgICAgZXhlY3V0ZVdvcmtmbG93KHdvcmtmbG93LCBkYXRhKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBidXR0b25XcmFwcGVyLmFwcGVuZENoaWxkKGJ1dHRvbkVsKTtcclxuICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGJ1dHRvbldyYXBwZXIpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBuYXZHcm91cC5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBuYXZHcm91cC5maXJzdENoaWxkKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBIZWxwZXIgdG8gY2hlY2sgYW5kIHdhaXQgZm9yIHBhdXNlL3N0b3BcclxuICAgIGFzeW5jIGZ1bmN0aW9uIGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpIHtcclxuICAgIGlmIChleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignV29ya2Zsb3cgc3RvcHBlZCBieSB1c2VyJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHdoaWxlIChleGVjdXRpb25Db250cm9sLmlzUGF1c2VkKSB7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICBpZiAoZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdXb3JrZmxvdyBzdG9wcGVkIGJ5IHVzZXInKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVXb3JrZmxvdyh3b3JrZmxvdywgZGF0YSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICAvLyBDbGVhciBhbnkgc3RhbGUgcGVuZGluZyBuYXZpZ2F0aW9uIHN0YXRlIGJlZm9yZSBzdGFydGluZyBhIG5ldyBydW5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBzZXNzaW9uU3RvcmFnZS5yZW1vdmVJdGVtKCdkMzY1X3BlbmRpbmdfd29ya2Zsb3cnKTtcclxuICAgICAgICAgICAgaWYgKHdvcmtmbG93Py5pZCkge1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9hY3RpdmVfd29ya2Zsb3dfaWQnLCB3b3JrZmxvdy5pZCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIC8vIElnbm9yZSBzZXNzaW9uU3RvcmFnZSBlcnJvcnMgKGUuZy4sIGluIHJlc3RyaWN0ZWQgY29udGV4dHMpXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFN0YXJ0aW5nIHdvcmtmbG93OiAke3dvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB8fCAndW5uYW1lZCd9YCk7XHJcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogeyBwaGFzZTogJ3dvcmtmbG93U3RhcnQnLCB3b3JrZmxvdzogd29ya2Zsb3c/Lm5hbWUgfHwgd29ya2Zsb3c/LmlkIH0gfSwgJyonKTtcclxuICAgICAgICAvLyBSZXNldCBleGVjdXRpb24gY29udHJvbFxyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcclxuICAgICAgICBleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCA9IGZhbHNlO1xyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucnVuT3B0aW9ucyA9IHdvcmtmbG93LnJ1bk9wdGlvbnMgfHwgeyBza2lwUm93czogMCwgbGltaXRSb3dzOiAwLCBkcnlSdW46IGZhbHNlIH07XHJcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQgPSB3b3JrZmxvdz8uX29yaWdpbmFsU3RhcnRJbmRleCB8fCAwO1xyXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleCA9IGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0O1xyXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvdyA9IHdvcmtmbG93O1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFByZXNlcnZlIHRoZSBvcmlnaW5hbCBmdWxsIHdvcmtmbG93IGZvciBuYXZpZ2F0aW9uIHJlc3VtZVxyXG4gICAgICAgIC8vIElmIHRoaXMgaXMgYSByZXN1bWVkIHdvcmtmbG93LCBpdCBtYXkgaGF2ZSBfb3JpZ2luYWxXb3JrZmxvdyBhdHRhY2hlZFxyXG4gICAgICAgIC8vIE90aGVyd2lzZSwgdGhpcyBJUyB0aGUgb3JpZ2luYWwgd29ya2Zsb3cgKGZpcnN0IHJ1bilcclxuICAgICAgICBpZiAod29ya2Zsb3cuX29yaWdpbmFsV29ya2Zsb3cpIHtcclxuICAgICAgICAgICAgd2luZG93LmQzNjVPcmlnaW5hbFdvcmtmbG93ID0gd29ya2Zsb3cuX29yaWdpbmFsV29ya2Zsb3c7XHJcbiAgICAgICAgfSBlbHNlIGlmICghd29ya2Zsb3cuX2lzUmVzdW1lKSB7XHJcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBmcmVzaCBydW4sIHN0b3JlIHRoZSBmdWxsIHdvcmtmbG93IGFzIHRoZSBvcmlnaW5hbFxyXG4gICAgICAgICAgICB3aW5kb3cuZDM2NU9yaWdpbmFsV29ya2Zsb3cgPSB3b3JrZmxvdztcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gSWYgX2lzUmVzdW1lIGJ1dCBubyBfb3JpZ2luYWxXb3JrZmxvdywga2VlcCBleGlzdGluZyBkMzY1T3JpZ2luYWxXb3JrZmxvd1xyXG4gICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gd29ya2Zsb3c/LnNldHRpbmdzIHx8IHt9O1xyXG4gICAgICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncztcclxuICAgICAgICAvLyBFeHBvc2UgY3VycmVudCB3b3JrZmxvdyBhbmQgZXhlY3V0aW9uIGNvbnRyb2wgdG8gaW5qZWN0ZWQgYWN0aW9uIG1vZHVsZXNcclxuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyA9IGN1cnJlbnRXb3JrZmxvdztcclxuICAgICAgICB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2wgPSBleGVjdXRpb25Db250cm9sO1xyXG4gICAgICAgIGNvbnN0IHN0ZXBzID0gd29ya2Zsb3cuc3RlcHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gR2V0IGRhdGEgZnJvbSBuZXcgZGF0YVNvdXJjZXMgc3RydWN0dXJlIG9yIGxlZ2FjeSBkYXRhU291cmNlXHJcbiAgICAgICAgbGV0IHByaW1hcnlEYXRhID0gW107XHJcbiAgICAgICAgbGV0IGRldGFpbFNvdXJjZXMgPSB7fTtcclxuICAgICAgICBsZXQgcmVsYXRpb25zaGlwcyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh3b3JrZmxvdy5kYXRhU291cmNlcykge1xyXG4gICAgICAgICAgICBwcmltYXJ5RGF0YSA9IHdvcmtmbG93LmRhdGFTb3VyY2VzLnByaW1hcnk/LmRhdGEgfHwgW107XHJcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcHMgPSB3b3JrZmxvdy5kYXRhU291cmNlcy5yZWxhdGlvbnNoaXBzIHx8IFtdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gSW5kZXggZGV0YWlsIGRhdGEgc291cmNlcyBieSBJRFxyXG4gICAgICAgICAgICAod29ya2Zsb3cuZGF0YVNvdXJjZXMuZGV0YWlscyB8fCBbXSkuZm9yRWFjaChkZXRhaWwgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGRldGFpbC5kYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsU291cmNlc1tkZXRhaWwuaWRdID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBkZXRhaWwuZGF0YSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZGV0YWlsLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkczogZGV0YWlsLmZpZWxkc1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZGF0YSkge1xyXG4gICAgICAgICAgICAvLyBMZWdhY3kgZm9ybWF0XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gQXJyYXkuaXNBcnJheShkYXRhKSA/IGRhdGEgOiBbZGF0YV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElmIG5vIGRhdGEsIHVzZSBhIHNpbmdsZSBlbXB0eSByb3cgdG8gcnVuIHN0ZXBzIG9uY2VcclxuICAgICAgICBpZiAocHJpbWFyeURhdGEubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gW3t9XTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEV4ZWN1dGUgd29ya2Zsb3cgd2l0aCBsb29wIHN1cHBvcnRcclxuICAgICAgICBhd2FpdCBleGVjdXRlU3RlcHNXaXRoTG9vcHMoc3RlcHMsIHByaW1hcnlEYXRhLCBkZXRhaWxTb3VyY2VzLCByZWxhdGlvbnNoaXBzLCB3b3JrZmxvdy5zZXR0aW5ncyk7XHJcblxyXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgV29ya2Zsb3cgY29tcGxldGU6IHByb2Nlc3NlZCAke3ByaW1hcnlEYXRhLmxlbmd0aH0gcm93c2ApO1xyXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0NPTVBMRVRFJyxcclxuICAgICAgICAgICAgcmVzdWx0OiB7IHByb2Nlc3NlZDogcHJpbWFyeURhdGEubGVuZ3RoIH1cclxuICAgICAgICB9LCAnKicpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAvLyBOYXZpZ2F0aW9uIGludGVycnVwdHMgYXJlIG5vdCBlcnJvcnMgLSB0aGUgd29ya2Zsb3cgd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkXHJcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmlzTmF2aWdhdGlvbkludGVycnVwdCkge1xyXG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgJ1dvcmtmbG93IHBhdXNlZCBmb3IgbmF2aWdhdGlvbiAtIHdpbGwgcmVzdW1lIGFmdGVyIHBhZ2UgbG9hZHMnKTtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBEb24ndCByZXBvcnQgYXMgZXJyb3Igb3IgY29tcGxldGVcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFlcnJvciB8fCAhZXJyb3IuX3JlcG9ydGVkKSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFdvcmtmbG93IGVycm9yOiAke2Vycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19FUlJPUicsXHJcbiAgICAgICAgICAgICAgICBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycm9yKSxcclxuICAgICAgICAgICAgICAgIHN0YWNrOiBlcnJvcj8uc3RhY2tcclxuICAgICAgICAgICAgfSwgJyonKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVTdGVwVmFsdWUoc3RlcCwgY3VycmVudFJvdykge1xyXG4gICAgY29uc3Qgc291cmNlID0gc3RlcD8udmFsdWVTb3VyY2UgfHwgKHN0ZXA/LmZpZWxkTWFwcGluZyA/ICdkYXRhJyA6ICdzdGF0aWMnKTtcclxuXHJcbiAgICBpZiAoc291cmNlID09PSAnY2xpcGJvYXJkJykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmICghbmF2aWdhdG9yLmNsaXBib2FyZD8ucmVhZFRleHQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2xpcGJvYXJkIEFQSSBub3QgYXZhaWxhYmxlJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQucmVhZFRleHQoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHQgPz8gJyc7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgc2VuZExvZygnZXJyb3InLCBgQ2xpcGJvYXJkIHJlYWQgZmFpbGVkOiAke2Vycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2xpcGJvYXJkIHJlYWQgZmFpbGVkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChzb3VyY2UgPT09ICdkYXRhJykge1xyXG4gICAgICAgIGNvbnN0IHJvdyA9IGN1cnJlbnRSb3cgfHwgd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50RGF0YVJvdyB8fCB7fTtcclxuICAgICAgICBjb25zdCBmaWVsZCA9IHN0ZXA/LmZpZWxkTWFwcGluZyB8fCAnJztcclxuICAgICAgICBpZiAoIWZpZWxkKSByZXR1cm4gJyc7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSByb3dbZmllbGRdO1xyXG4gICAgICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBzdGVwPy52YWx1ZSA/PyAnJztcclxufVxyXG5cclxuLy8gRXhlY3V0ZSBhIHNpbmdsZSBzdGVwIChtYXBzIHN0ZXAudHlwZSB0byBhY3Rpb24gZnVuY3Rpb25zKVxyXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlU2luZ2xlU3RlcChzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnRSb3csIGRldGFpbFNvdXJjZXMsIHNldHRpbmdzLCBkcnlSdW4pIHtcclxuICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleCA9IHR5cGVvZiBzdGVwLl9hYnNvbHV0ZUluZGV4ID09PSAnbnVtYmVyJ1xyXG4gICAgICAgID8gc3RlcC5fYWJzb2x1dGVJbmRleFxyXG4gICAgICAgIDogKGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0IHx8IDApICsgc3RlcEluZGV4O1xyXG4gICAgY29uc3Qgc3RlcExhYmVsID0gc3RlcC5kaXNwbGF5VGV4dCB8fCBzdGVwLmNvbnRyb2xOYW1lIHx8IHN0ZXAudHlwZSB8fCBgc3RlcCAke3N0ZXBJbmRleH1gO1xyXG4gICAgLy8gQ29tcHV0ZSBhYnNvbHV0ZSBzdGVwIGluZGV4IChhbHJlYWR5IHN0b3JlZCBvbiBleGVjdXRpb25Db250cm9sKVxyXG4gICAgY29uc3QgYWJzb2x1dGVTdGVwSW5kZXggPSBleGVjdXRpb25Db250cm9sLmN1cnJlbnRTdGVwSW5kZXg7XHJcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcclxuICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBTdGFydCcsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxyXG4gICAgfSwgJyonKTtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgLy8gTm9ybWFsaXplIHN0ZXAgdHlwZSAoYWxsb3cgYm90aCBjYW1lbENhc2UgYW5kIGRhc2gtc2VwYXJhdGVkIHR5cGVzKVxyXG4gICAgICAgIGNvbnN0IHN0ZXBUeXBlID0gKHN0ZXAudHlwZSB8fCAnJykucmVwbGFjZSgvLShbYS16XSkvZywgKF8sIGMpID0+IGMudG9VcHBlckNhc2UoKSk7XHJcbiAgICAgICAgbG9nU3RlcChgU3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX06ICR7c3RlcFR5cGV9IC0+ICR7c3RlcExhYmVsfWApO1xyXG5cclxuICAgICAgICAvLyBSZXNwZWN0IGRyeSBydW4gbW9kZVxyXG4gICAgICAgIGlmIChkcnlSdW4pIHtcclxuICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBEcnkgcnVuIC0gc2tpcHBpbmcgYWN0aW9uOiAke3N0ZXAudHlwZX0gJHtzdGVwLmNvbnRyb2xOYW1lIHx8ICcnfWApO1xyXG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxyXG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwRG9uZScsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxyXG4gICAgICAgICAgICB9LCAnKicpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgcmVzb2x2ZWRWYWx1ZSA9IG51bGw7XHJcbiAgICAgICAgaWYgKFsnaW5wdXQnLCAnc2VsZWN0JywgJ2xvb2t1cFNlbGVjdCcsICdncmlkSW5wdXQnLCAnZmlsdGVyJywgJ3F1ZXJ5RmlsdGVyJ10uaW5jbHVkZXMoc3RlcFR5cGUpKSB7XHJcbiAgICAgICAgICAgIHJlc29sdmVkVmFsdWUgPSBhd2FpdCByZXNvbHZlU3RlcFZhbHVlKHN0ZXAsIGN1cnJlbnRSb3cpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgd2FpdFRhcmdldCA9IHN0ZXAud2FpdFRhcmdldENvbnRyb2xOYW1lIHx8IHN0ZXAuY29udHJvbE5hbWUgfHwgJyc7XHJcbiAgICAgICAgY29uc3Qgc2hvdWxkV2FpdEJlZm9yZSA9ICEhc3RlcC53YWl0VW50aWxWaXNpYmxlO1xyXG4gICAgICAgIGNvbnN0IHNob3VsZFdhaXRBZnRlciA9ICEhc3RlcC53YWl0VW50aWxIaWRkZW47XHJcblxyXG4gICAgICAgIGlmICgoc2hvdWxkV2FpdEJlZm9yZSB8fCBzaG91bGRXYWl0QWZ0ZXIpICYmICF3YWl0VGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgV2FpdCBvcHRpb24gc2V0IGJ1dCBubyBjb250cm9sIG5hbWUgb24gc3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX1gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChzaG91bGRXYWl0QmVmb3JlICYmIHdhaXRUYXJnZXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICd2aXNpYmxlJywgbnVsbCwgNTAwMCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHN0ZXBUeXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2NsaWNrJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGNsaWNrRWxlbWVudChzdGVwLmNvbnRyb2xOYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnaW5wdXQnOlxyXG4gICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlLCBzdGVwLmZpZWxkVHlwZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2xvb2t1cFNlbGVjdCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRMb29rdXBTZWxlY3RWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnY2hlY2tib3gnOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0Q2hlY2tib3hWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCBjb2VyY2VCb29sZWFuKHN0ZXAudmFsdWUpKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnZ3JpZElucHV0JzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNldEdyaWRDZWxsVmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWVsZFR5cGUsICEhc3RlcC53YWl0Rm9yVmFsaWRhdGlvbik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2ZpbHRlcic6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBhcHBseUdyaWRGaWx0ZXIoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWx0ZXJNZXRob2QgfHwgJ2lzIGV4YWN0bHknKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdxdWVyeUZpbHRlcic6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBjb25maWd1cmVRdWVyeUZpbHRlcihzdGVwLnRhYmxlTmFtZSwgc3RlcC5maWVsZE5hbWUsIHJlc29sdmVkVmFsdWUsIHtcclxuICAgICAgICAgICAgICAgICAgICBzYXZlZFF1ZXJ5OiBzdGVwLnNhdmVkUXVlcnksXHJcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VEaWFsb2dBZnRlcjogc3RlcC5jbG9zZURpYWxvZ0FmdGVyXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnd2FpdCc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcChOdW1iZXIoc3RlcC5kdXJhdGlvbikgfHwgNTAwKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnd2FpdFVudGlsJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbihcclxuICAgICAgICAgICAgICAgICAgICBzdGVwLmNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAud2FpdENvbmRpdGlvbiB8fCAndmlzaWJsZScsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RlcC53YWl0VmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RlcC50aW1lb3V0IHx8IDEwMDAwXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICduYXZpZ2F0ZSc6XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBuYXZpZ2F0ZVRvRm9ybShzdGVwKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnYWN0aXZhdGVUYWInOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFjdGl2YXRlVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAndGFiTmF2aWdhdGUnOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFjdGl2YXRlVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYWN0aW9uUGFuZVRhYic6XG4gICAgICAgICAgICAgICAgYXdhaXQgYWN0aXZhdGVBY3Rpb25QYW5lVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXHJcbiAgICAgICAgICAgIGNhc2UgJ2V4cGFuZFNlY3Rpb24nOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oc3RlcC5jb250cm9sTmFtZSwgJ2V4cGFuZCcpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdjb2xsYXBzZVNlY3Rpb24nOlxyXG4gICAgICAgICAgICAgICAgYXdhaXQgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oc3RlcC5jb250cm9sTmFtZSwgJ2NvbGxhcHNlJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2Nsb3NlRGlhbG9nJzpcclxuICAgICAgICAgICAgICAgIGF3YWl0IGNsb3NlRGlhbG9nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHN0ZXAgdHlwZTogJHtzdGVwLnR5cGV9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc2hvdWxkV2FpdEFmdGVyICYmIHdhaXRUYXJnZXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICdoaWRkZW4nLCBudWxsLCA1MDAwKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcclxuICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwRG9uZScsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxyXG4gICAgICAgIH0sICcqJyk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAvLyBSZS10aHJvdyBuYXZpZ2F0aW9uIGludGVycnVwdHMgZm9yIHVwc3RyZWFtIGhhbmRsaW5nXHJcbiAgICAgICAgaWYgKGVyciAmJiBlcnIuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB0aHJvdyBlcnI7XHJcbiAgICAgICAgc2VuZExvZygnZXJyb3InLCBgRXJyb3IgZXhlY3V0aW5nIHN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9OiAke2Vycj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyKX1gKTtcclxuICAgICAgICB0aHJvdyBlcnI7XHJcbiAgICB9XHJcbn1cclxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVN0ZXBzV2l0aExvb3BzKHN0ZXBzLCBwcmltYXJ5RGF0YSwgZGV0YWlsU291cmNlcywgcmVsYXRpb25zaGlwcywgc2V0dGluZ3MpIHtcclxuICAgIC8vIEFwcGx5IHNraXAvbGltaXQgcm93cyBmcm9tIHJ1biBvcHRpb25zXHJcbiAgICBjb25zdCB7IHNraXBSb3dzID0gMCwgbGltaXRSb3dzID0gMCwgZHJ5UnVuID0gZmFsc2UgfSA9IGV4ZWN1dGlvbkNvbnRyb2wucnVuT3B0aW9ucztcclxuICAgIFxyXG4gICAgY29uc3Qgb3JpZ2luYWxUb3RhbFJvd3MgPSBwcmltYXJ5RGF0YS5sZW5ndGg7XHJcbiAgICBsZXQgc3RhcnRSb3dOdW1iZXIgPSAwOyAvLyBUaGUgc3RhcnRpbmcgcm93IG51bWJlciBmb3IgZGlzcGxheVxyXG4gICAgXHJcbiAgICBpZiAoc2tpcFJvd3MgPiAwKSB7XHJcbiAgICAgICAgcHJpbWFyeURhdGEgPSBwcmltYXJ5RGF0YS5zbGljZShza2lwUm93cyk7XHJcbiAgICAgICAgc3RhcnRSb3dOdW1iZXIgPSBza2lwUm93cztcclxuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFNraXBwZWQgZmlyc3QgJHtza2lwUm93c30gcm93c2ApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAobGltaXRSb3dzID4gMCAmJiBwcmltYXJ5RGF0YS5sZW5ndGggPiBsaW1pdFJvd3MpIHtcclxuICAgICAgICBwcmltYXJ5RGF0YSA9IHByaW1hcnlEYXRhLnNsaWNlKDAsIGxpbWl0Um93cyk7XHJcbiAgICAgICAgc2VuZExvZygnaW5mbycsIGBMaW1pdGVkIHRvICR7bGltaXRSb3dzfSByb3dzYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IHRvdGFsUm93c1RvUHJvY2VzcyA9IHByaW1hcnlEYXRhLmxlbmd0aDtcclxuICAgIGV4ZWN1dGlvbkNvbnRyb2wudG90YWxSb3dzID0gb3JpZ2luYWxUb3RhbFJvd3M7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgbG9vcCBzdHJ1Y3R1cmVzXHJcbiAgICBjb25zdCBsb29wUGFpcnMgPSBmaW5kTG9vcFBhaXJzKHN0ZXBzKTtcclxuXHJcbiAgICAvLyBIZWxwZXI6IGZpbmQgbWF0Y2hpbmcgbG9vcCBzdGFydC9lbmQgcGFpcnMgc3VwcG9ydGluZyBuZXN0ZWQgbG9vcHMgYW5kIGV4cGxpY2l0IGxvb3BSZWYgbGlua2luZ1xyXG4gICAgZnVuY3Rpb24gZmluZExvb3BQYWlycyhzdGVwc0xpc3QpIHtcclxuICAgICAgICBjb25zdCBzdGFjayA9IFtdO1xyXG4gICAgICAgIGNvbnN0IHBhaXJzID0gW107XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RlcHNMaXN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHMgPSBzdGVwc0xpc3RbaV07XHJcbiAgICAgICAgICAgIGlmICghcyB8fCAhcy50eXBlKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGlmIChzLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xyXG4gICAgICAgICAgICAgICAgLy8gcHVzaCBzdGFydCB3aXRoIGl0cyBpZCAoaWYgcHJlc2VudCkgc28gbG9vcC1lbmQgY2FuIG1hdGNoIGJ5IGxvb3BSZWZcclxuICAgICAgICAgICAgICAgIHN0YWNrLnB1c2goeyBzdGFydEluZGV4OiBpLCBpZDogcy5pZCB9KTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChzLnR5cGUgPT09ICdsb29wLWVuZCcpIHtcclxuICAgICAgICAgICAgICAgIGxldCBtYXRjaGVkID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBJZiBsb29wLWVuZCByZWZlcmVuY2VzIGEgc3BlY2lmaWMgc3RhcnQgaWQsIHRyeSB0byBtYXRjaCB0aGF0XHJcbiAgICAgICAgICAgICAgICBpZiAocy5sb29wUmVmKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IHN0YWNrLmxlbmd0aCAtIDE7IGogPj0gMDsgai0tKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGFja1tqXS5pZCA9PT0gcy5sb29wUmVmKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkID0geyBzdGFydEluZGV4OiBzdGFja1tqXS5zdGFydEluZGV4LCBlbmRJbmRleDogaSB9O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2suc3BsaWNlKGosIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2s6IG1hdGNoIHRoZSBtb3N0IHJlY2VudCB1bm1hdGNoZWQgbG9vcC1zdGFydCAoTElGTylcclxuICAgICAgICAgICAgICAgIGlmICghbWF0Y2hlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhc3QgPSBzdGFjay5wb3AoKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobGFzdCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkID0geyBzdGFydEluZGV4OiBsYXN0LnN0YXJ0SW5kZXgsIGVuZEluZGV4OiBpIH07XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVW5tYXRjaGVkIGxvb3AtZW5kIC0gaWdub3JlIGJ1dCBsb2dcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnZXJyb3InLCBgVW5tYXRjaGVkIGxvb3AtZW5kIGF0IGluZGV4ICR7aX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZWQpIHBhaXJzLnB1c2gobWF0Y2hlZCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChzdGFjay5sZW5ndGgpIHtcclxuICAgICAgICAgICAgLy8gU29tZSBsb29wLXN0YXJ0cyB3ZXJlIG5vdCBjbG9zZWRcclxuICAgICAgICAgICAgZm9yIChjb25zdCByZW0gb2Ygc3RhY2spIHtcclxuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFVuY2xvc2VkIGxvb3Atc3RhcnQgYXQgaW5kZXggJHtyZW0uc3RhcnRJbmRleH1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU29ydCBwYWlycyBieSBzdGFydCBpbmRleCBhc2NlbmRpbmdcclxuICAgICAgICBwYWlycy5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0SW5kZXggLSBiLnN0YXJ0SW5kZXgpO1xyXG4gICAgICAgIHJldHVybiBwYWlycztcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBubyBsb29wcywgZXhlY3V0ZSBhbGwgc3RlcHMgZm9yIGVhY2ggcHJpbWFyeSBkYXRhIHJvdyAobGVnYWN5IGJlaGF2aW9yKVxyXG4gICAgaWYgKGxvb3BQYWlycy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICBmb3IgKGxldCByb3dJbmRleCA9IDA7IHJvd0luZGV4IDwgcHJpbWFyeURhdGEubGVuZ3RoOyByb3dJbmRleCsrKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxyXG5cclxuICAgICAgICAgICAgY29uc3Qgcm93ID0gcHJpbWFyeURhdGFbcm93SW5kZXhdO1xyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5Um93TnVtYmVyID0gc3RhcnRSb3dOdW1iZXIgKyByb3dJbmRleDsgLy8gQWN0dWFsIHJvdyBudW1iZXIgaW4gb3JpZ2luYWwgZGF0YVxyXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnRSb3dJbmRleCA9IGRpc3BsYXlSb3dOdW1iZXI7XHJcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudERhdGFSb3cgPSByb3c7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByb3dQcm9ncmVzcyA9IHtcclxuICAgICAgICAgICAgICAgIHBoYXNlOiAncm93U3RhcnQnLFxyXG4gICAgICAgICAgICAgICAgcm93OiBkaXNwbGF5Um93TnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgdG90YWxSb3dzOiBvcmlnaW5hbFRvdGFsUm93cyxcclxuICAgICAgICAgICAgICAgIHByb2Nlc3NlZFJvd3M6IHJvd0luZGV4ICsgMSxcclxuICAgICAgICAgICAgICAgIHRvdGFsVG9Qcm9jZXNzOiB0b3RhbFJvd3NUb1Byb2Nlc3MsXHJcbiAgICAgICAgICAgICAgICBzdGVwOiAnUHJvY2Vzc2luZyByb3cnXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgUHJvY2Vzc2luZyByb3cgJHtkaXNwbGF5Um93TnVtYmVyICsgMX0vJHtvcmlnaW5hbFRvdGFsUm93c31gKTtcclxuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogcm93UHJvZ3Jlc3MgfSwgJyonKTtcclxuXHJcbiAgICAgICAgICAgIGZvciAobGV0IHN0ZXBJbmRleCA9IDA7IHN0ZXBJbmRleCA8IHN0ZXBzLmxlbmd0aDsgc3RlcEluZGV4KyspIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxyXG4gICAgICAgICAgICAgICAgYXdhaXQgZXhlY3V0ZVNpbmdsZVN0ZXAoc3RlcHNbc3RlcEluZGV4XSwgc3RlcEluZGV4LCByb3csIHt9LCBzZXR0aW5ncywgZHJ5UnVuKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbG9vcFBhaXJNYXAgPSBuZXcgTWFwKGxvb3BQYWlycy5tYXAocGFpciA9PiBbcGFpci5zdGFydEluZGV4LCBwYWlyLmVuZEluZGV4XSkpO1xyXG4gICAgY29uc3QgaW5pdGlhbERhdGFSb3cgPSBwcmltYXJ5RGF0YVswXSB8fCB7fTtcclxuXHJcbiAgICBjb25zdCByZXNvbHZlTG9vcERhdGEgPSAobG9vcERhdGFTb3VyY2UsIGN1cnJlbnREYXRhUm93KSA9PiB7XHJcbiAgICAgICAgbGV0IGxvb3BEYXRhID0gcHJpbWFyeURhdGE7XHJcblxyXG4gICAgICAgIGlmIChsb29wRGF0YVNvdXJjZSAhPT0gJ3ByaW1hcnknICYmIGRldGFpbFNvdXJjZXNbbG9vcERhdGFTb3VyY2VdKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRldGFpbFNvdXJjZSA9IGRldGFpbFNvdXJjZXNbbG9vcERhdGFTb3VyY2VdO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgdGhlcmUncyBhIHJlbGF0aW9uc2hpcCwgZmlsdGVyIGRldGFpbCBkYXRhIGJ5IHRoZSBjdXJyZW50IHByaW1hcnkgcm93XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbCA9IHJlbGF0aW9uc2hpcHMuZmluZChyID0+IHIuZGV0YWlsSWQgPT09IGxvb3BEYXRhU291cmNlKTtcclxuICAgICAgICAgICAgaWYgKHJlbCAmJiBjdXJyZW50RGF0YVJvd1tyZWwucHJpbWFyeUZpZWxkXSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBsb29wRGF0YSA9IGRldGFpbFNvdXJjZS5kYXRhLmZpbHRlcihkID0+IFxyXG4gICAgICAgICAgICAgICAgICAgIFN0cmluZyhkW3JlbC5kZXRhaWxGaWVsZF0pID09PSBTdHJpbmcoY3VycmVudERhdGFSb3dbcmVsLnByaW1hcnlGaWVsZF0pXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBleGVjdXRlUmFuZ2UgPSBhc3luYyAoc3RhcnRJZHgsIGVuZElkeCwgY3VycmVudERhdGFSb3cpID0+IHtcclxuICAgICAgICBpZiAoY3VycmVudERhdGFSb3cpIHtcclxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50RGF0YVJvdyA9IGN1cnJlbnREYXRhUm93O1xyXG4gICAgICAgIH1cclxuICAgICAgICBsZXQgaWR4ID0gc3RhcnRJZHg7XHJcblxyXG4gICAgICAgIHdoaWxlIChpZHggPCBlbmRJZHgpIHtcclxuICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXHJcblxyXG4gICAgICAgICAgICBjb25zdCBzdGVwID0gc3RlcHNbaWR4XTtcclxuXHJcbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbG9vcEVuZElkeCA9IGxvb3BQYWlyTWFwLmdldChpZHgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGxvb3BFbmRJZHggPT09IHVuZGVmaW5lZCB8fCBsb29wRW5kSWR4IDw9IGlkeCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTG9vcCBzdGFydCBhdCBpbmRleCAke2lkeH0gaGFzIG5vIG1hdGNoaW5nIGVuZGApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BEYXRhU291cmNlID0gc3RlcC5sb29wRGF0YVNvdXJjZSB8fCAncHJpbWFyeSc7XHJcbiAgICAgICAgICAgICAgICBsZXQgbG9vcERhdGEgPSByZXNvbHZlTG9vcERhdGEobG9vcERhdGFTb3VyY2UsIGN1cnJlbnREYXRhUm93KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBBcHBseSBpdGVyYXRpb24gbGltaXRcclxuICAgICAgICAgICAgICAgIGNvbnN0IGl0ZXJhdGlvbkxpbWl0ID0gc3RlcC5pdGVyYXRpb25MaW1pdCB8fCAwO1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZXJhdGlvbkxpbWl0ID4gMCAmJiBsb29wRGF0YS5sZW5ndGggPiBpdGVyYXRpb25MaW1pdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gbG9vcERhdGEuc2xpY2UoMCwgaXRlcmF0aW9uTGltaXQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgRW50ZXJpbmcgbG9vcDogJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ30gKHNvdXJjZT0ke2xvb3BEYXRhU291cmNlfSkgLSAke2xvb3BEYXRhLmxlbmd0aH0gaXRlcmF0aW9uc2ApO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaXRlckluZGV4ID0gMDsgaXRlckluZGV4IDwgbG9vcERhdGEubGVuZ3RoOyBpdGVySW5kZXgrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxyXG5cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVyUm93ID0geyAuLi5jdXJyZW50RGF0YVJvdywgLi4ubG9vcERhdGFbaXRlckluZGV4XSB9O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzUHJpbWFyeUxvb3AgPSBsb29wRGF0YVNvdXJjZSA9PT0gJ3ByaW1hcnknO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRvdGFsUm93c0Zvckxvb3AgPSBpc1ByaW1hcnlMb29wID8gb3JpZ2luYWxUb3RhbFJvd3MgOiBsb29wRGF0YS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG90YWxUb1Byb2Nlc3NGb3JMb29wID0gbG9vcERhdGEubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlSb3dOdW1iZXIgPSBpc1ByaW1hcnlMb29wID8gc3RhcnRSb3dOdW1iZXIgKyBpdGVySW5kZXggOiBpdGVySW5kZXg7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BSb3dQcm9ncmVzcyA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGhhc2U6ICdyb3dTdGFydCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvdzogZGlzcGxheVJvd051bWJlcixcclxuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxSb3dzOiB0b3RhbFJvd3NGb3JMb29wLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRSb3dzOiBpdGVySW5kZXggKyAxLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0b3RhbFRvUHJvY2VzczogdG90YWxUb1Byb2Nlc3NGb3JMb29wLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGVwOiAnUHJvY2Vzc2luZyByb3cnXHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYExvb3AgaXRlcmF0aW9uICR7aXRlckluZGV4ICsgMX0vJHtsb29wRGF0YS5sZW5ndGh9IGZvciBsb29wICR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogbG9vcFJvd1Byb2dyZXNzIH0sICcqJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdsb29wSXRlcmF0aW9uJywgaXRlcmF0aW9uOiBpdGVySW5kZXggKyAxLCB0b3RhbDogbG9vcERhdGEubGVuZ3RoLCBzdGVwOiBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCI6IGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bG9vcERhdGEubGVuZ3RofWAgfSB9LCAnKicpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBFeGVjdXRlIHN0ZXBzIGluc2lkZSB0aGUgbG9vcCAoc3VwcG9ydHMgbmVzdGVkIGxvb3BzKVxyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGV4ZWN1dGVSYW5nZShpZHggKyAxLCBsb29wRW5kSWR4LCBpdGVyUm93KTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZHggPSBsb29wRW5kSWR4ICsgMTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnbG9vcC1lbmQnKSB7XHJcbiAgICAgICAgICAgICAgICBpZHgrKztcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBhd2FpdCBleGVjdXRlU2luZ2xlU3RlcChzdGVwLCBpZHgsIGN1cnJlbnREYXRhUm93LCBkZXRhaWxTb3VyY2VzLCBzZXR0aW5ncywgZXhlY3V0aW9uQ29udHJvbC5ydW5PcHRpb25zLmRyeVJ1bik7XHJcbiAgICAgICAgICAgIGlkeCsrO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgZXhlY3V0ZVJhbmdlKDAsIHN0ZXBzLmxlbmd0aCwgaW5pdGlhbERhdGFSb3cpO1xyXG59XHJcblxyXG5cclxufSAvLyBFbmQgb2YgaW5qZWN0ZWQgc2NyaXB0IGluaXRpYWxpemF0aW9uIGd1YXJkXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBRUEsTUFBcUIsZ0JBQXJCLE1BQW1DO0FBQUEsSUFDL0IsY0FBYztBQUNWLFdBQUssZUFBZTtBQUNwQixXQUFLLG1CQUFtQjtBQUN4QixXQUFLLFVBQVU7QUFBQSxJQUNuQjtBQUFBO0FBQUEsSUFHQSxtQkFBbUIsU0FBUztBQUV4QixZQUFNLGdCQUFnQixRQUFRLFFBQVEsc0JBQXNCO0FBQzVELFVBQUksZUFBZTtBQUNmLGVBQU8sY0FBYyxhQUFhLG9CQUFvQjtBQUFBLE1BQzFEO0FBR0EsWUFBTSxjQUFjLFFBQVEsUUFBUSx3QkFBd0I7QUFDNUQsVUFBSSxhQUFhO0FBQ2IsZUFBTyxZQUFZLGFBQWEsc0JBQXNCLEtBQUssWUFBWSxhQUFhLG9CQUFvQjtBQUFBLE1BQzVHO0FBR0EsWUFBTSxZQUFZLFFBQVEsUUFBUSw2REFBNkQ7QUFDL0YsVUFBSSxXQUFXO0FBQ1gsY0FBTSxnQkFBZ0IsVUFBVSxhQUFhLHNCQUFzQjtBQUNuRSxZQUFJO0FBQWUsaUJBQU87QUFBQSxNQUM5QjtBQUdBLFlBQU0sU0FBUyxRQUFRLFFBQVEsNkRBQTZEO0FBQzVGLFVBQUksUUFBUTtBQUNSLGNBQU0sYUFBYSxPQUFPLGFBQWEsc0JBQXNCLEtBQzFDLE9BQU8sY0FBYyxzQkFBc0IsR0FBRyxhQUFhLG9CQUFvQjtBQUNsRyxZQUFJO0FBQVksaUJB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
