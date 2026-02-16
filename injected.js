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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luamVjdGVkL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb2dnaW5nLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9hc3luYy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvdGV4dC5qcyIsICJzcmMvaW5qZWN0ZWQvcnVudGltZS9lbmdpbmUtdXRpbHMuanMiLCAic3JjL2luamVjdGVkL3J1bnRpbWUvY29uZGl0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvcnVudGltZS90aW1pbmcuanMiLCAic3JjL2luamVjdGVkL3V0aWxzL2RvbS5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvbG9va3VwLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9jb21ib2JveC5qcyIsICJzcmMvaW5qZWN0ZWQvc3RlcHMvYWN0aW9uLWhlbHBlcnMuanMiLCAic3JjL2luamVjdGVkL3N0ZXBzL2FjdGlvbnMuanMiLCAic3JjL2luamVjdGVkL2luZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBEMzY1Rk8gRWxlbWVudCBJbnNwZWN0b3IgYW5kIERpc2NvdmVyeSBNb2R1bGVcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEQzNjVJbnNwZWN0b3Ige1xyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5pc0luc3BlY3RpbmcgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQgPSBudWxsO1xyXG4gICAgICAgIHRoaXMub3ZlcmxheSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHRoZSBmb3JtIG5hbWUgdGhhdCBjb250YWlucyBhbiBlbGVtZW50XHJcbiAgICBnZXRFbGVtZW50Rm9ybU5hbWUoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIExvb2sgZm9yIHRoZSBjbG9zZXN0IGZvcm0gY29udGFpbmVyXHJcbiAgICAgICAgY29uc3QgZm9ybUNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLWZvcm0tbmFtZV0nKTtcclxuICAgICAgICBpZiAoZm9ybUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICByZXR1cm4gZm9ybUNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCBmb3JtIHZpYSBkYXRhLWR5bi1jb250cm9sbmFtZSBvbiBhIGZvcm0tbGV2ZWwgY29udGFpbmVyXHJcbiAgICAgICAgY29uc3QgZm9ybUVsZW1lbnQgPSBlbGVtZW50LmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiRm9ybVwiXScpO1xyXG4gICAgICAgIGlmIChmb3JtRWxlbWVudCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZm9ybUVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8IGZvcm1FbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIHRoZSB3b3Jrc3BhY2Ugb3IgcGFnZSBjb250YWluZXJcclxuICAgICAgICBjb25zdCB3b3Jrc3BhY2UgPSBlbGVtZW50LmNsb3Nlc3QoJy53b3Jrc3BhY2UtY29udGVudCwgLndvcmtzcGFjZSwgW2RhdGEtZHluLXJvbGU9XCJXb3Jrc3BhY2VcIl0nKTtcclxuICAgICAgICBpZiAod29ya3NwYWNlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHdvcmtzcGFjZU5hbWUgPSB3b3Jrc3BhY2UuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAod29ya3NwYWNlTmFtZSkgcmV0dXJuIHdvcmtzcGFjZU5hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBkaWFsb2cvbW9kYWwgY29udGV4dFxyXG4gICAgICAgIGNvbnN0IGRpYWxvZyA9IGVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyLCAubW9kYWwtY29udGVudCcpO1xyXG4gICAgICAgIGlmIChkaWFsb2cpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhbG9nTmFtZSA9IGRpYWxvZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaWFsb2cucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZV0nKT8uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGRpYWxvZ05hbWUpIHJldHVybiBkaWFsb2dOYW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCB0aGUgcm9vdCBmb3JtIGJ5IHdhbGtpbmcgdXAgdGhlIERPTVxyXG4gICAgICAgIGxldCBjdXJyZW50ID0gZWxlbWVudDtcclxuICAgICAgICB3aGlsZSAoY3VycmVudCAmJiBjdXJyZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKGN1cnJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdGb3JtJyA/IGN1cnJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIDogbnVsbCk7XHJcbiAgICAgICAgICAgIGlmIChmb3JtTmFtZSkgcmV0dXJuIGZvcm1OYW1lO1xyXG4gICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gJ1Vua25vd24nO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCB0aGUgYWN0aXZlL2ZvY3VzZWQgZm9ybSBuYW1lXHJcbiAgICBnZXRBY3RpdmVGb3JtTmFtZSgpIHtcclxuICAgICAgICAvLyBDaGVjayBmb3IgYWN0aXZlIGRpYWxvZyBmaXJzdCAoY2hpbGQgZm9ybXMgYXJlIHR5cGljYWxseSBkaWFsb2dzKVxyXG4gICAgICAgIGNvbnN0IGFjdGl2ZURpYWxvZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1yb2xlPVwiRGlhbG9nXCJdOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSksIC5kaWFsb2ctY29udGFpbmVyOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknKTtcclxuICAgICAgICBpZiAoYWN0aXZlRGlhbG9nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpYWxvZ0Zvcm0gPSBhY3RpdmVEaWFsb2cucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZV0nKTtcclxuICAgICAgICAgICAgaWYgKGRpYWxvZ0Zvcm0pIHJldHVybiBkaWFsb2dGb3JtLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgICAgIHJldHVybiBhY3RpdmVEaWFsb2cuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgZm9jdXNlZCBlbGVtZW50IGFuZCBnZXQgaXRzIGZvcm1cclxuICAgICAgICBjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcclxuICAgICAgICBpZiAoYWN0aXZlRWxlbWVudCAmJiBhY3RpdmVFbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoYWN0aXZlRWxlbWVudCk7XHJcbiAgICAgICAgICAgIGlmIChmb3JtTmFtZSAmJiBmb3JtTmFtZSAhPT0gJ1Vua25vd24nKSByZXR1cm4gZm9ybU5hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIExvb2sgZm9yIHRoZSB0b3Btb3N0L2FjdGl2ZSBmb3JtIHNlY3Rpb25cclxuICAgICAgICBjb25zdCB2aXNpYmxlRm9ybXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgIGlmICh2aXNpYmxlRm9ybXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAvLyBSZXR1cm4gdGhlIGxhc3Qgb25lICh0eXBpY2FsbHkgdGhlIG1vc3QgcmVjZW50bHkgb3BlbmVkL3RvcG1vc3QpXHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSB2aXNpYmxlRm9ybXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzRWxlbWVudFZpc2libGUodmlzaWJsZUZvcm1zW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2aXNpYmxlRm9ybXNbaV0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXNjb3ZlciBhbGwgaW50ZXJhY3RpdmUgZWxlbWVudHMgb24gdGhlIHBhZ2VcclxuICAgIGRpc2NvdmVyRWxlbWVudHMoYWN0aXZlRm9ybU9ubHkgPSBmYWxzZSkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gW107XHJcbiAgICAgICAgY29uc3QgYWN0aXZlRm9ybSA9IGFjdGl2ZUZvcm1Pbmx5ID8gdGhpcy5nZXRBY3RpdmVGb3JtTmFtZSgpIDogbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIGFsbCBidXR0b25zXHJcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJCdXR0b25cIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tbWFuZEJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJNZW51SXRlbUJ1dHRvblwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdGhpcy5nZXRFbGVtZW50VGV4dChlbCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHZpc2libGUgPSB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnYnV0dG9uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiB0ZXh0LFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdmlzaWJsZSxcclxuICAgICAgICAgICAgICAgIGFyaWFMYWJlbDogZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGlucHV0IGZpZWxkcyAoZXhwYW5kZWQgdG8gY2F0Y2ggbW9yZSBmaWVsZCB0eXBlcylcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIklucHV0XCJdLCBbZGF0YS1keW4tcm9sZT1cIk11bHRpbGluZUlucHV0XCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbWJvQm94XCJdLCBbZGF0YS1keW4tcm9sZT1cIlJlZmVyZW5jZUdyb3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIkxvb2t1cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJTZWdtZW50ZWRFbnRyeVwiXSwgaW5wdXRbZGF0YS1keW4tY29udHJvbG5hbWVdLCBpbnB1dFtyb2xlPVwidGV4dGJveFwiXScpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICAvLyBHZXQgY29udHJvbCBuYW1lIGZyb20gZWxlbWVudCBvciBwYXJlbnRcclxuICAgICAgICAgICAgbGV0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBsZXQgdGFyZ2V0RWxlbWVudCA9IGVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gSWYgbm90IGZvdW5kLCBjaGVjayBwYXJlbnQgZWxlbWVudCAoY29tbW9uIGZvciBTZWdtZW50ZWRFbnRyeSBmaWVsZHMgbGlrZSBBY2NvdW50KVxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUgPSBwYXJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEVsZW1lbnQgPSBwYXJlbnQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBhZGRlZCAoYXZvaWQgZHVwbGljYXRlcylcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjb25zdCBmaWVsZEluZm8gPSB0aGlzLmRldGVjdEZpZWxkVHlwZSh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2lucHV0JyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBsYWJlbCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZSh0YXJnZXRFbGVtZW50KSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRJbmZvLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiB0YXJnZXRFbGVtZW50XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGFsbCBjaGVja2JveGVzL3RvZ2dsZXNcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkNoZWNrQm94XCJdLCBpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl1bZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGxldCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgbGV0IHRhcmdldEVsZW1lbnQgPSBlbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIENoZWNrIHBhcmVudCBpZiBub3QgZm91bmRcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gZWwuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lID0gcGFyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRFbGVtZW50ID0gcGFyZW50O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldEVsZW1lbnRMYWJlbCh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgY29uc3QgY2hlY2tib3ggPSB0YXJnZXRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpIHx8IHRhcmdldEVsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzQ2hlY2tlZCA9IGNoZWNrYm94LmNoZWNrZWQgfHwgY2hlY2tib3guZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnY2hlY2tib3gnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKHRhcmdldEVsZW1lbnQpLFxyXG4gICAgICAgICAgICAgICAgY2hlY2tlZDogaXNDaGVja2VkLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiB0YXJnZXRFbGVtZW50XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGFsbCByYWRpbyBidXR0b24gZ3JvdXBzXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiUmFkaW9CdXR0b25cIl0sIFtyb2xlPVwicmFkaW9ncm91cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJGcmFtZU9wdGlvbkJ1dHRvblwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLmdldEVsZW1lbnRMYWJlbChlbCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkUmFkaW8gPSBlbC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl06Y2hlY2tlZCwgW3JvbGU9XCJyYWRpb1wiXVthcmlhLWNoZWNrZWQ9XCJ0cnVlXCJdJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHNlbGVjdGVkUmFkaW8/LnZhbHVlIHx8IHNlbGVjdGVkUmFkaW8/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3JhZGlvJyxcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXG4gICAgICAgICAgICAgICAgY3VycmVudFZhbHVlOiBjdXJyZW50VmFsdWUsXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRmluZCBhY3Rpb24gcGFuZSB0YWJzIChBcHBCYXIgdGFicylcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJBcHBCYXJUYWJcIl0sIC5hcHBCYXJUYWIsIFtyb2xlPVwidGFiXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICAvLyBTa2lwIHRhYnMgaW5zaWRlIGRpYWxvZ3MvZmx5b3V0c1xuICAgICAgICAgICAgaWYgKGVsLmNsb3Nlc3QoJy5kaWFsb2ctY29udGVudCwgW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyLCAuZmx5b3V0LWNvbnRhaW5lciwgW3JvbGU9XCJkaWFsb2dcIl0nKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdGhpcy5nZXRFbGVtZW50VGV4dChlbCk7XG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHxcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpIHx8XG4gICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWxlY3RlZCcpO1xuXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnYWN0aW9uLXBhbmUtdGFiJyxcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRleHQsXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcbiAgICAgICAgICAgICAgICBpc0FjdGl2ZTogaXNBY3RpdmUsXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRmluZCBhbGwgdHJhZGl0aW9uYWwgRDM2NSBncmlkcy90YWJsZXNcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRoaXMuZ2V0RWxlbWVudExhYmVsKGVsKSB8fCAnR3JpZCcsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIERpc2NvdmVyIGdyaWQgY29sdW1ucyBmb3IgaW5wdXRcclxuICAgICAgICAgICAgdGhpcy5kaXNjb3ZlckdyaWRDb2x1bW5zKGVsLCBjb250cm9sTmFtZSwgZm9ybU5hbWUsIGVsZW1lbnRzKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcyAoLnJlYWN0R3JpZClcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmVhY3RHcmlkJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogJ1JlYWN0IEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiAnLnJlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRmluZCBleHBhbmRhYmxlIHNlY3Rpb25zIChGYXN0VGFicywgR3JvdXBzLCBTZWN0aW9uUGFnZXMpXHJcbiAgICAgICAgLy8gVGhlc2UgYXJlIGNvbGxhcHNpYmxlIHNlY3Rpb25zIGluIEQzNjUgZGlhbG9ncyBhbmQgZm9ybXNcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyb3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlXCJdLCBbZGF0YS1keW4tcm9sZT1cIlRhYlBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiRmFzdFRhYlwiXSwgLnNlY3Rpb24tcGFnZSwgLmZhc3R0YWInKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBhZGRlZFxyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGFjdHVhbGx5IGFuIGV4cGFuZGFibGUgc2VjdGlvblxyXG4gICAgICAgICAgICAvLyBMb29rIGZvciBoZWFkZXIgZWxlbWVudHMgb3IgYXJpYS1leHBhbmRlZCBhdHRyaWJ1dGVcclxuICAgICAgICAgICAgY29uc3QgaGFzSGVhZGVyID0gZWwucXVlcnlTZWxlY3RvcignLnNlY3Rpb24taGVhZGVyLCAuZ3JvdXAtaGVhZGVyLCBbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdLCAuc2VjdGlvbi1wYWdlLWNhcHRpb24sIGJ1dHRvblthcmlhLWV4cGFuZGVkXScpO1xyXG4gICAgICAgICAgICBjb25zdCBpc0V4cGFuZGFibGUgPSBlbC5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNpYmxlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ3NlY3Rpb24tcGFnZScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzSGVhZGVyICE9PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgPT09ICdHcm91cCcgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ1NlY3Rpb25QYWdlJztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghaXNFeHBhbmRhYmxlKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgY3VycmVudCBleHBhbmRlZCBzdGF0ZVxyXG4gICAgICAgICAgICBjb25zdCBpc0V4cGFuZGVkID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIWVsLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RXhwYW5kYWJsZVNlY3Rpb25MYWJlbChlbCkgfHwgY29udHJvbE5hbWU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdzZWN0aW9uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBsYWJlbCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXHJcbiAgICAgICAgICAgICAgICBpc0V4cGFuZGVkOiBpc0V4cGFuZGVkLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIERpc2NvdmVyIFJlYWN0IGdyaWQgY29sdW1ucyBmb3IgaW5wdXRcclxuICAgICAgICAgICAgdGhpcy5kaXNjb3ZlclJlYWN0R3JpZENvbHVtbnMoZWwsIGZvcm1OYW1lLCBlbGVtZW50cyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50cztcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgcmVhZGFibGUgdGV4dCBmcm9tIGFuIGVsZW1lbnRcclxuICAgIGdldEVsZW1lbnRUZXh0KGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbCBmaXJzdFxyXG4gICAgICAgIGxldCB0ZXh0ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcclxuICAgICAgICBpZiAodGV4dCAmJiB0ZXh0LnRyaW0oKSkgcmV0dXJuIHRleHQudHJpbSgpO1xyXG5cclxuICAgICAgICAvLyBUcnkgdGV4dCBjb250ZW50IChleGNsdWRpbmcgY2hpbGQgYnV0dG9ucy9pY29ucylcclxuICAgICAgICBjb25zdCBjbG9uZSA9IGVsZW1lbnQuY2xvbmVOb2RlKHRydWUpO1xyXG4gICAgICAgIGNsb25lLnF1ZXJ5U2VsZWN0b3JBbGwoJy5idXR0b24taWNvbiwgLmZhLCAuZ2x5cGhpY29uJykuZm9yRWFjaChpY29uID0+IGljb24ucmVtb3ZlKCkpO1xyXG4gICAgICAgIHRleHQgPSBjbG9uZS50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuXHJcbiAgICAgICAgLy8gVHJ5IHRpdGxlIGF0dHJpYnV0ZVxyXG4gICAgICAgIHRleHQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgndGl0bGUnKTtcclxuICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNvbnRyb2wgbmFtZVxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBpbnB1dCBmaWVsZHNcclxuICAgIGdldEVsZW1lbnRMYWJlbChlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IGFyaWEtbGFiZWxcclxuICAgICAgICBsZXQgbGFiZWwgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmIChsYWJlbCAmJiBsYWJlbC50cmltKCkpIHJldHVybiBsYWJlbC50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSBhc3NvY2lhdGVkIGxhYmVsIGVsZW1lbnRcclxuICAgICAgICBjb25zdCBsYWJlbEVsZW1lbnQgPSBlbGVtZW50LmNsb3Nlc3QoJy5keW4tbGFiZWwtd3JhcHBlcicpPy5xdWVyeVNlbGVjdG9yKCcuZHluLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGxhYmVsRWxlbWVudCkgcmV0dXJuIGxhYmVsRWxlbWVudC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG5cclxuICAgICAgICAvLyBUcnkgcGFyZW50IGNvbnRhaW5lciBsYWJlbFxyXG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAnKTtcclxuICAgICAgICBpZiAoY29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lckxhYmVsID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk7XHJcbiAgICAgICAgICAgIGlmIChjb250YWluZXJMYWJlbCkgcmV0dXJuIGNvbnRhaW5lckxhYmVsLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGYWxsYmFjayB0byBjb250cm9sIG5hbWVcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJ1Vua25vd24nO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGdyaWQgY29sdW1ucyBmb3IgaW5wdXQvZWRpdGluZ1xyXG4gICAgZGlzY292ZXJHcmlkQ29sdW1ucyhncmlkRWxlbWVudCwgZ3JpZE5hbWUsIGZvcm1OYW1lLCBlbGVtZW50cykge1xyXG4gICAgICAgIGNvbnN0IGFkZGVkQ29sdW1ucyA9IG5ldyBTZXQoKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXRob2QgMTogRmluZCBjb2x1bW4gaGVhZGVyc1xyXG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0sIC5keW4taGVhZGVyQ2VsbCcpO1xyXG4gICAgICAgIGhlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gaGVhZGVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gaGVhZGVyLnRleHRDb250ZW50Py50cmltKCkgfHwgaGVhZGVyLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGAke2Rpc3BsYXlUZXh0fWAsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogZ3JpZE5hbWUsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoaGVhZGVyKSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0hlYWRlcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGhlYWRlclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXRob2QgMjogRmluZCBjZWxscyB3aXRoIGlucHV0cyBpbiB0aGUgYWN0aXZlL3NlbGVjdGVkIHJvd1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1zZWxlY3RlZD1cInRydWVcIl0sIFthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmR5bi1zZWxlY3RlZFJvdycpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tcm9sZT1cIlJvd1wiXTpmaXJzdC1vZi10eXBlLCBbcm9sZT1cInJvd1wiXTpub3QoW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0pOmZpcnN0LW9mLXR5cGUnKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgIC8vIEZpbmQgYWxsIGlucHV0IGZpZWxkcyBpbiB0aGUgcm93XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYWN0aXZlUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgY2VsbHMuZm9yRWFjaChjZWxsID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBjZWxsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBjZWxsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaGFzSW5wdXQgPSBjZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBzZWxlY3QsIHRleHRhcmVhJykgIT09IG51bGwgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydJbnB1dCcsICdDb21ib0JveCcsICdMb29rdXAnLCAnUmVmZXJlbmNlR3JvdXAnLCAnU2VnbWVudGVkRW50cnknXS5pbmNsdWRlcyhyb2xlKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGhhc0lucHV0IHx8IHJvbGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoY2VsbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGNlbGwpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IGhhc0lucHV0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogY2VsbFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWV0aG9kIDM6IEZpbmQgYW55IGVkaXRhYmxlIGlucHV0cyBpbnNpZGUgdGhlIGdyaWQgYm9keVxyXG4gICAgICAgIGNvbnN0IGdyaWRJbnB1dHMgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIklucHV0XCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbWJvQm94XCJdLCBbZGF0YS1keW4tcm9sZT1cIkxvb2t1cFwiXSwgW2RhdGEtZHluLXJvbGU9XCJSZWZlcmVuY2VHcm91cFwiXScpO1xyXG4gICAgICAgIGdyaWRJbnB1dHMuZm9yRWFjaChpbnB1dCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IHRoaXMuZ2V0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCB0aGlzLmdldEVsZW1lbnRMYWJlbChpbnB1dCkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoaW5wdXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogZ3JpZE5hbWUsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoaW5wdXQpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgIHJvbGU6IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaW5wdXRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEdldCBsYWJlbCBmb3IgYSBncmlkIGNvbHVtbiBieSBsb29raW5nIGF0IHRoZSBoZWFkZXJcclxuICAgIGdldEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sdW1uQ29udHJvbE5hbWUpIHtcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCB0aGUgaGVhZGVyIGNlbGwgZm9yIHRoaXMgY29sdW1uXHJcbiAgICAgICAgY29uc3QgaGVhZGVyID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl1bZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbHVtbkNvbnRyb2xOYW1lfVwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl1bZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbHVtbkNvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIGhlYWRlciBieSBwYXJ0aWFsIG1hdGNoIChjb2x1bW4gbmFtZSBtaWdodCBiZSBkaWZmZXJlbnQgaW4gaGVhZGVyIHZzIGNlbGwpXHJcbiAgICAgICAgY29uc3QgYWxsSGVhZGVycyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlck5hbWUgPSBoLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGhlYWRlck5hbWUgJiYgKGNvbHVtbkNvbnRyb2xOYW1lLmluY2x1ZGVzKGhlYWRlck5hbWUpIHx8IGhlYWRlck5hbWUuaW5jbHVkZXMoY29sdW1uQ29udHJvbE5hbWUpKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IGgudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXNjb3ZlciBjb2x1bW5zIGluIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzXHJcbiAgICBkaXNjb3ZlclJlYWN0R3JpZENvbHVtbnMoZ3JpZEVsZW1lbnQsIGZvcm1OYW1lLCBlbGVtZW50cykge1xyXG4gICAgICAgIGNvbnN0IGFkZGVkQ29sdW1ucyA9IG5ldyBTZXQoKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBHZXQgY29sdW1uIGhlYWRlcnMgZnJvbSAuZHluLWhlYWRlckNlbGwgZWxlbWVudHNcclxuICAgICAgICBjb25zdCBoZWFkZXJDZWxscyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5maXhlZERhdGFUYWJsZUxheW91dF9oZWFkZXIgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgaGVhZGVyQ2VsbHMuZm9yRWFjaCgoaGVhZGVyLCBjb2xJbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGhlYWRlci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb250cm9sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IGhlYWRlci5xdWVyeVNlbGVjdG9yKCcuZHluLWhlYWRlckNlbGxMYWJlbCcpO1xyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpIHx8IGNvbnRyb2xOYW1lO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgZ3JpZE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgZ3JpZFR5cGU6ICdyZWFjdCcsXHJcbiAgICAgICAgICAgICAgICBjb2x1bW5JbmRleDogY29sSW5kZXgsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoaGVhZGVyKSxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgLmR5bi1oZWFkZXJDZWxsW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNIZWFkZXI6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBoZWFkZXJcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWxzbyBsb29rIGZvciBlZGl0YWJsZSBpbnB1dHMgaW5zaWRlIHRoZSBib2R5IHJvd3NcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHksIC5maXhlZERhdGFUYWJsZUxheW91dF9yb3dzQ29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGJvZHlDb250YWluZXIpIHtcclxuICAgICAgICAgICAgLy8gRmluZCBhY3RpdmUvc2VsZWN0ZWQgcm93IGZpcnN0LCBvciBmYWxsYmFjayB0byBmaXJzdCByb3dcclxuICAgICAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4ucHVibGljX2ZpeGVkRGF0YVRhYmxlUm93X21haW4nKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgICAgIC8vIEZpbmQgYWxsIGNlbGxzIHdpdGggZGF0YS1keW4tY29udHJvbG5hbWVcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYWN0aXZlUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgICAgIGNlbGxzLmZvckVhY2goY2VsbCA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghY29sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbE5hbWUpKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm9sZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzSW5wdXQgPSBjZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBzZWxlY3QsIHRleHRhcmVhJykgIT09IG51bGwgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnSW5wdXQnLCAnQ29tYm9Cb3gnLCAnTG9va3VwJywgJ1JlZmVyZW5jZUdyb3VwJywgJ1NlZ21lbnRlZEVudHJ5J10uaW5jbHVkZXMocm9sZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IHRoaXMuZ2V0UmVhY3RHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoY2VsbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyaWROYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZFR5cGU6ICdyZWFjdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShjZWxsKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpc0VkaXRhYmxlOiBoYXNJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZFR5cGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGNlbGxcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgYW55IGVkaXRhYmxlIGlucHV0cyBpbiB0aGUgZ3JpZCBib2R5XHJcbiAgICAgICAgY29uc3QgZ3JpZElucHV0cyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIC5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIC5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCAuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSBbZGF0YS1keW4tcm9sZT1cIlJlZmVyZW5jZUdyb3VwXCJdJyk7XHJcbiAgICAgICAgZ3JpZElucHV0cy5mb3JFYWNoKGlucHV0ID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRSZWFjdEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgdGhpcy5nZXRFbGVtZW50TGFiZWwoaW5wdXQpIHx8IGNvbE5hbWU7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGlucHV0KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGRpc3BsYXlUZXh0LFxyXG4gICAgICAgICAgICAgICAgZ3JpZE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgZ3JpZFR5cGU6ICdyZWFjdCcsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoaW5wdXQpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgIHJvbGU6IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaW5wdXRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEdldCBsYWJlbCBmb3IgYSBSZWFjdCBncmlkIGNvbHVtbiBieSBsb29raW5nIGF0IHRoZSBoZWFkZXJcclxuICAgIGdldFJlYWN0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2x1bW5Db250cm9sTmFtZSkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIgY2VsbCB3aXRoIG1hdGNoaW5nIGNvbnRyb2xuYW1lXHJcbiAgICAgICAgY29uc3QgaGVhZGVyID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcihgLmR5bi1oZWFkZXJDZWxsW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2x1bW5Db250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoaGVhZGVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gaGVhZGVyLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBQYXJ0aWFsIG1hdGNoXHJcbiAgICAgICAgY29uc3QgYWxsSGVhZGVycyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5keW4taGVhZGVyQ2VsbFtkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGggb2YgYWxsSGVhZGVycykge1xyXG4gICAgICAgICAgICBjb25zdCBoZWFkZXJOYW1lID0gaC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmIChoZWFkZXJOYW1lICYmIChjb2x1bW5Db250cm9sTmFtZS5pbmNsdWRlcyhoZWFkZXJOYW1lKSB8fCBoZWFkZXJOYW1lLmluY2x1ZGVzKGNvbHVtbkNvbnRyb2xOYW1lKSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gaC5xdWVyeVNlbGVjdG9yKCcuZHluLWhlYWRlckNlbGxMYWJlbCcpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGgudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEZXRlY3QgZmllbGQgdHlwZSAoZW51bSwgbG9va3VwLCBmcmVldGV4dCwgZXRjLilcclxuICAgIGRldGVjdEZpZWxkVHlwZShlbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTZWdtZW50ZWRFbnRyeSBmaWVsZHMgKGxpa2UgQWNjb3VudCkgaGF2ZSBzcGVjaWFsIGxvb2t1cFxyXG4gICAgICAgIGlmIChyb2xlID09PSAnU2VnbWVudGVkRW50cnknKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHR5cGU6ICdzZWdtZW50ZWQtbG9va3VwJywgcm9sZTogcm9sZSB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgbG9va3VwIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IGhhc0xvb2t1cEJ1dHRvbiA9IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmaWVsZC1oYXNMb29rdXBCdXR0b24nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubG9va3VwLWJ1dHRvbicpICE9PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50Lm5leHRFbGVtZW50U2libGluZz8uY2xhc3NMaXN0LmNvbnRhaW5zKCdsb29rdXAtYnV0dG9uJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIENvbWJvQm94L0Ryb3Bkb3duXHJcbiAgICAgICAgY29uc3QgaXNDb21ib0JveCA9IHJvbGUgPT09ICdDb21ib0JveCcgfHwgZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbWJvQm94Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIHNlbGVjdCBlbGVtZW50XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdzZWxlY3QnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBNdWx0aWxpbmVJbnB1dCBkZXRlY3Rpb25cclxuICAgICAgICBjb25zdCBpc011bHRpbGluZSA9IHJvbGUgPT09ICdNdWx0aWxpbmVJbnB1dCc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGV0ZWN0IG51bWVyaWMgZmllbGRzXHJcbiAgICAgICAgY29uc3QgaXNOdW1lcmljID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwibnVtYmVyXCJdJykgIT09IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGV0ZWN0IGRhdGUgZmllbGRzXHJcbiAgICAgICAgY29uc3QgaXNEYXRlID0gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2RhdGUtZmllbGQnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImRhdGVcIl0nKSAhPT0gbnVsbDtcclxuXHJcbiAgICAgICAgLy8gQnVpbGQgZmllbGQgdHlwZSBpbmZvXHJcbiAgICAgICAgY29uc3QgZmllbGRJbmZvID0ge1xyXG4gICAgICAgICAgICBjb250cm9sVHlwZTogcm9sZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAndGV4dCdcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBpZiAoaXNNdWx0aWxpbmUpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICd0ZXh0YXJlYSc7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pc011bHRpbGluZSA9IHRydWU7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc0NvbWJvQm94IHx8IHNlbGVjdCkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ2VudW0nO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaXNFbnVtID0gdHJ1ZTtcclxuICAgICAgICAgICAgZmllbGRJbmZvLnZhbHVlcyA9IHRoaXMuZXh0cmFjdEVudW1WYWx1ZXMoZWxlbWVudCwgc2VsZWN0KTtcclxuICAgICAgICB9IGVsc2UgaWYgKGhhc0xvb2t1cEJ1dHRvbikge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ2xvb2t1cCc7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pc0xvb2t1cCA9IHRydWU7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5hbGxvd0ZyZWV0ZXh0ID0gIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdsb29rdXAtb25seScpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnbnVtYmVyJztcclxuICAgICAgICB9IGVsc2UgaWYgKGlzRGF0ZSkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ2RhdGUnO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gR2V0IG1heCBsZW5ndGggaWYgYXZhaWxhYmxlXHJcbiAgICAgICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYScpO1xyXG4gICAgICAgIGlmIChpbnB1dCAmJiBpbnB1dC5tYXhMZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5tYXhMZW5ndGggPSBpbnB1dC5tYXhMZW5ndGg7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZmllbGRJbmZvO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEV4dHJhY3QgZW51bSB2YWx1ZXMgZnJvbSBkcm9wZG93blxyXG4gICAgZXh0cmFjdEVudW1WYWx1ZXMoZWxlbWVudCwgc2VsZWN0RWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdCA9IHNlbGVjdEVsZW1lbnQgfHwgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdzZWxlY3QnKTtcclxuICAgICAgICBpZiAoIXNlbGVjdCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIHJldHVybiBBcnJheS5mcm9tKHNlbGVjdC5vcHRpb25zKVxyXG4gICAgICAgICAgICAuZmlsdGVyKG9wdCA9PiBvcHQudmFsdWUgIT09ICcnKVxyXG4gICAgICAgICAgICAubWFwKG9wdCA9PiAoe1xyXG4gICAgICAgICAgICAgICAgdmFsdWU6IG9wdC52YWx1ZSxcclxuICAgICAgICAgICAgICAgIHRleHQ6IG9wdC50ZXh0LnRyaW0oKVxyXG4gICAgICAgICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBleHBhbmRhYmxlIHNlY3Rpb25zXHJcbiAgICBnZXRFeHBhbmRhYmxlU2VjdGlvbkxhYmVsKGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgdG8gZmluZCB0aGUgaGVhZGVyL2NhcHRpb24gZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGhlYWRlclNlbGVjdG9ycyA9IFtcclxuICAgICAgICAgICAgJy5zZWN0aW9uLXBhZ2UtY2FwdGlvbicsXHJcbiAgICAgICAgICAgICcuc2VjdGlvbi1oZWFkZXInLFxyXG4gICAgICAgICAgICAnLmdyb3VwLWhlYWRlcicsXHJcbiAgICAgICAgICAgICcuZmFzdHRhYi1oZWFkZXInLFxyXG4gICAgICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZUhlYWRlclwiXScsXHJcbiAgICAgICAgICAgICdidXR0b25bYXJpYS1leHBhbmRlZF0gc3BhbicsXHJcbiAgICAgICAgICAgICdidXR0b24gc3BhbicsXHJcbiAgICAgICAgICAgICcuY2FwdGlvbicsXHJcbiAgICAgICAgICAgICdsZWdlbmQnXHJcbiAgICAgICAgXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIGhlYWRlclNlbGVjdG9ycykge1xyXG4gICAgICAgICAgICBjb25zdCBoZWFkZXIgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgICAgICBpZiAoaGVhZGVyKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gaGVhZGVyLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGFyaWEtbGFiZWxcclxuICAgICAgICBjb25zdCBhcmlhTGFiZWwgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmIChhcmlhTGFiZWwpIHJldHVybiBhcmlhTGFiZWw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRoZSBidXR0b24ncyB0ZXh0IGlmIHRoZSBzZWN0aW9uIGhhcyBhIHRvZ2dsZSBidXR0b25cclxuICAgICAgICBjb25zdCB0b2dnbGVCdG4gPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpO1xyXG4gICAgICAgIGlmICh0b2dnbGVCdG4pIHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRvZ2dsZUJ0bi50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dCAmJiB0ZXh0Lmxlbmd0aCA8IDEwMCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGlmIGVsZW1lbnQgaXMgdmlzaWJsZVxyXG4gICAgaXNFbGVtZW50VmlzaWJsZShlbGVtZW50KSB7XHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmIFxyXG4gICAgICAgICAgICAgICB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgICAgICB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU3RhcnQgaW50ZXJhY3RpdmUgZWxlbWVudCBwaWNrZXJcclxuICAgIHN0YXJ0RWxlbWVudFBpY2tlcihjYWxsYmFjaykge1xyXG4gICAgICAgIHRoaXMuaXNJbnNwZWN0aW5nID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnBpY2tlckNhbGxiYWNrID0gY2FsbGJhY2s7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5vdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5LnN0eWxlLmNzc1RleHQgPSBgXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBmaXhlZDtcclxuICAgICAgICAgICAgdG9wOiAwO1xyXG4gICAgICAgICAgICBsZWZ0OiAwO1xyXG4gICAgICAgICAgICB3aWR0aDogMTAwJTtcclxuICAgICAgICAgICAgaGVpZ2h0OiAxMDAlO1xyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDEwMiwgMTI2LCAyMzQsIDAuMSk7XHJcbiAgICAgICAgICAgIHotaW5kZXg6IDk5OTk5ODtcclxuICAgICAgICAgICAgY3Vyc29yOiBjcm9zc2hhaXI7XHJcbiAgICAgICAgYDtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMub3ZlcmxheSk7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBoaWdobGlnaHQgZWxlbWVudFxyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5jc3NUZXh0ID0gYFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XHJcbiAgICAgICAgICAgIGJvcmRlcjogMnB4IHNvbGlkICM2NjdlZWE7XHJcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcclxuICAgICAgICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XHJcbiAgICAgICAgICAgIHotaW5kZXg6IDk5OTk5OTtcclxuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMXMgZWFzZTtcclxuICAgICAgICBgO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5oaWdobGlnaHRFbGVtZW50KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyc1xyXG4gICAgICAgIHRoaXMubW91c2VNb3ZlSGFuZGxlciA9IChlKSA9PiB0aGlzLmhhbmRsZU1vdXNlTW92ZShlKTtcclxuICAgICAgICB0aGlzLmNsaWNrSGFuZGxlciA9IChlKSA9PiB0aGlzLmhhbmRsZUNsaWNrKGUpO1xyXG4gICAgICAgIHRoaXMuZXNjYXBlSGFuZGxlciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHRoaXMuc3RvcEVsZW1lbnRQaWNrZXIoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdXNlTW92ZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5jbGlja0hhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmVzY2FwZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGhhbmRsZU1vdXNlTW92ZShlKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludChlLmNsaWVudFgsIGUuY2xpZW50WSk7XHJcbiAgICAgICAgaWYgKCF0YXJnZXQgfHwgdGFyZ2V0ID09PSB0aGlzLm92ZXJsYXkgfHwgdGFyZ2V0ID09PSB0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gRmluZCBjbG9zZXN0IEQzNjUgY29udHJvbFxyXG4gICAgICAgIGNvbnN0IGNvbnRyb2wgPSB0YXJnZXQuY2xvc2VzdCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIGlmICghY29udHJvbCkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5oaWdobGlnaHRFbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBFbnN1cmUgaGlnaGxpZ2h0IGVsZW1lbnQgZXhpc3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSGlnaGxpZ2h0IHRoZSBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IGNvbnRyb2wuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS50b3AgPSByZWN0LnRvcCArIHdpbmRvdy5zY3JvbGxZICsgJ3B4JztcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUubGVmdCA9IHJlY3QubGVmdCArIHdpbmRvdy5zY3JvbGxYICsgJ3B4JztcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUud2lkdGggPSByZWN0LndpZHRoICsgJ3B4JztcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gcmVjdC5oZWlnaHQgKyAncHgnO1xyXG5cclxuICAgICAgICAvLyBTaG93IHRvb2x0aXBcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIGNvbnN0IHJvbGUgPSBjb250cm9sLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgYCR7cm9sZX06ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlQ2xpY2soZSkge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG5cclxuICAgICAgICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcclxuICAgICAgICBjb25zdCBjb250cm9sID0gdGFyZ2V0Py5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBjb250cm9sLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgY29uc3Qgcm9sZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGNvbnRyb2wpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZWxlbWVudEluZm8gPSB7XHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRleHQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgaWYgKHJvbGUgPT09ICdJbnB1dCcgfHwgcm9sZSA9PT0gJ011bHRpbGluZUlucHV0JyB8fCByb2xlID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgICAgICAgICBlbGVtZW50SW5mby5maWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjb250cm9sKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5waWNrZXJDYWxsYmFjayhlbGVtZW50SW5mbyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnN0b3BFbGVtZW50UGlja2VyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgc3RvcEVsZW1lbnRQaWNrZXIoKSB7XHJcbiAgICAgICAgdGhpcy5pc0luc3BlY3RpbmcgPSBmYWxzZTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5vdmVybGF5KSB7XHJcbiAgICAgICAgICAgIHRoaXMub3ZlcmxheS5yZW1vdmUoKTtcclxuICAgICAgICAgICAgdGhpcy5vdmVybGF5ID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRoaXMuaGlnaGxpZ2h0RWxlbWVudCkge1xyXG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdXNlTW92ZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5jbGlja0hhbmRsZXIsIHRydWUpO1xyXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmVzY2FwZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlYXJjaCBlbGVtZW50cyBieSB0ZXh0XHJcbiAgICBmaW5kRWxlbWVudEJ5VGV4dCh0ZXh0LCBlbGVtZW50VHlwZSA9IG51bGwpIHtcclxuICAgICAgICBjb25zdCBlbGVtZW50cyA9IHRoaXMuZGlzY292ZXJFbGVtZW50cygpO1xyXG4gICAgICAgIGNvbnN0IHNlYXJjaFRleHQgPSB0ZXh0LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudHMuZmlsdGVyKGVsID0+IHtcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRUeXBlICYmIGVsLnR5cGUgIT09IGVsZW1lbnRUeXBlKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5VGV4dCA9IGVsLmRpc3BsYXlUZXh0LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFyaWFMYWJlbCA9IChlbC5hcmlhTGFiZWwgfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuY29udHJvbE5hbWUudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBkaXNwbGF5VGV4dC5pbmNsdWRlcyhzZWFyY2hUZXh0KSB8fFxyXG4gICAgICAgICAgICAgICAgICAgYXJpYUxhYmVsLmluY2x1ZGVzKHNlYXJjaFRleHQpIHx8XHJcbiAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZS5pbmNsdWRlcyhzZWFyY2hUZXh0KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gRXhwb3J0IGZvciB1c2UgaW4gY29udGVudCBzY3JpcHRcclxuIiwgImV4cG9ydCBmdW5jdGlvbiBzZW5kTG9nKGxldmVsLCBtZXNzYWdlKSB7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfTE9HJyxcbiAgICAgICAgbG9nOiB7IGxldmVsLCBtZXNzYWdlIH1cbiAgICB9LCAnKicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9nU3RlcChtZXNzYWdlKSB7XG4gICAgc2VuZExvZygnaW5mbycsIG1lc3NhZ2UpO1xuICAgIGNvbnNvbGUubG9nKCdbRDM2NSBBdXRvbWF0aW9uXScsIG1lc3NhZ2UpO1xufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBzbGVlcChtcykge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSkge1xuICAgIGNvbnN0IGlzVGV4dEFyZWEgPSBpbnB1dC50YWdOYW1lID09PSAnVEVYVEFSRUEnO1xuICAgIGNvbnN0IGRlc2NyaXB0b3IgPSBpc1RleHRBcmVhXG4gICAgICAgID8gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih3aW5kb3cuSFRNTFRleHRBcmVhRWxlbWVudC5wcm90b3R5cGUsICd2YWx1ZScpXG4gICAgICAgIDogT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih3aW5kb3cuSFRNTElucHV0RWxlbWVudC5wcm90b3R5cGUsICd2YWx1ZScpO1xuXG4gICAgaWYgKGRlc2NyaXB0b3IgJiYgZGVzY3JpcHRvci5zZXQpIHtcbiAgICAgICAgZGVzY3JpcHRvci5zZXQuY2FsbChpbnB1dCwgdmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGlucHV0LnZhbHVlID0gdmFsdWU7XG4gICAgfVxufVxuIiwgImV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVUZXh0KHZhbHVlKSB7XHJcbiAgICByZXR1cm4gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRvTG93ZXJDYXNlKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb2VyY2VCb29sZWFuKHZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHJldHVybiB2YWx1ZTtcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSByZXR1cm4gdmFsdWUgIT09IDAgJiYgIU51bWJlci5pc05hTih2YWx1ZSk7XHJcblxyXG4gICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQodmFsdWUpO1xyXG4gICAgaWYgKHRleHQgPT09ICcnKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgaWYgKFsndHJ1ZScsICcxJywgJ3llcycsICd5JywgJ29uJywgJ2NoZWNrZWQnXS5pbmNsdWRlcyh0ZXh0KSkgcmV0dXJuIHRydWU7XHJcbiAgICBpZiAoWydmYWxzZScsICcwJywgJ25vJywgJ24nLCAnb2ZmJywgJ3VuY2hlY2tlZCddLmluY2x1ZGVzKHRleHQpKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcbiIsICJleHBvcnQgZnVuY3Rpb24gZ2V0V29ya2Zsb3dFcnJvckRlZmF1bHRzKHNldHRpbmdzKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbW9kZTogc2V0dGluZ3M/LmVycm9yRGVmYXVsdE1vZGUgfHwgJ2ZhaWwnLFxuICAgICAgICByZXRyeUNvdW50OiBOdW1iZXIuaXNGaW5pdGUoc2V0dGluZ3M/LmVycm9yRGVmYXVsdFJldHJ5Q291bnQpID8gc2V0dGluZ3MuZXJyb3JEZWZhdWx0UmV0cnlDb3VudCA6IDAsXG4gICAgICAgIHJldHJ5RGVsYXk6IE51bWJlci5pc0Zpbml0ZShzZXR0aW5ncz8uZXJyb3JEZWZhdWx0UmV0cnlEZWxheSkgPyBzZXR0aW5ncy5lcnJvckRlZmF1bHRSZXRyeURlbGF5IDogMTAwMCxcbiAgICAgICAgZ290b0xhYmVsOiBzZXR0aW5ncz8uZXJyb3JEZWZhdWx0R290b0xhYmVsIHx8ICcnXG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0ZXBFcnJvckNvbmZpZyhzdGVwLCBzZXR0aW5ncykge1xuICAgIGNvbnN0IGRlZmF1bHRzID0gZ2V0V29ya2Zsb3dFcnJvckRlZmF1bHRzKHNldHRpbmdzKTtcbiAgICBjb25zdCBtb2RlID0gc3RlcD8ub25FcnJvck1vZGUgJiYgc3RlcC5vbkVycm9yTW9kZSAhPT0gJ2RlZmF1bHQnID8gc3RlcC5vbkVycm9yTW9kZSA6IGRlZmF1bHRzLm1vZGU7XG4gICAgY29uc3QgcmV0cnlDb3VudCA9IE51bWJlci5pc0Zpbml0ZShzdGVwPy5vbkVycm9yUmV0cnlDb3VudCkgPyBzdGVwLm9uRXJyb3JSZXRyeUNvdW50IDogZGVmYXVsdHMucmV0cnlDb3VudDtcbiAgICBjb25zdCByZXRyeURlbGF5ID0gTnVtYmVyLmlzRmluaXRlKHN0ZXA/Lm9uRXJyb3JSZXRyeURlbGF5KSA/IHN0ZXAub25FcnJvclJldHJ5RGVsYXkgOiBkZWZhdWx0cy5yZXRyeURlbGF5O1xuICAgIGNvbnN0IGdvdG9MYWJlbCA9IHN0ZXA/Lm9uRXJyb3JHb3RvTGFiZWwgfHwgZGVmYXVsdHMuZ290b0xhYmVsO1xuICAgIHJldHVybiB7IG1vZGUsIHJldHJ5Q291bnQsIHJldHJ5RGVsYXksIGdvdG9MYWJlbCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZExvb3BQYWlycyhzdGVwc0xpc3QsIG9uSXNzdWUgPSAoKSA9PiB7fSkge1xuICAgIGNvbnN0IHN0YWNrID0gW107XG4gICAgY29uc3QgcGFpcnMgPSBbXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RlcHNMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdGVwc0xpc3RbaV07XG4gICAgICAgIGlmICghcyB8fCAhcy50eXBlKSBjb250aW51ZTtcblxuICAgICAgICBpZiAocy50eXBlID09PSAnbG9vcC1zdGFydCcpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goeyBzdGFydEluZGV4OiBpLCBpZDogcy5pZCB9KTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHMudHlwZSAhPT0gJ2xvb3AtZW5kJykgY29udGludWU7XG5cbiAgICAgICAgbGV0IG1hdGNoZWQgPSBudWxsO1xuICAgICAgICBpZiAocy5sb29wUmVmKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBqID0gc3RhY2subGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhY2tbal0uaWQgPT09IHMubG9vcFJlZikge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVkID0geyBzdGFydEluZGV4OiBzdGFja1tqXS5zdGFydEluZGV4LCBlbmRJbmRleDogaSB9O1xuICAgICAgICAgICAgICAgICAgICBzdGFjay5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbWF0Y2hlZCkge1xuICAgICAgICAgICAgY29uc3QgbGFzdCA9IHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgaWYgKGxhc3QpIHtcbiAgICAgICAgICAgICAgICBtYXRjaGVkID0geyBzdGFydEluZGV4OiBsYXN0LnN0YXJ0SW5kZXgsIGVuZEluZGV4OiBpIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG9uSXNzdWUoYFVubWF0Y2hlZCBsb29wLWVuZCBhdCBpbmRleCAke2l9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobWF0Y2hlZCkgcGFpcnMucHVzaChtYXRjaGVkKTtcbiAgICB9XG5cbiAgICBpZiAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVtIG9mIHN0YWNrKSB7XG4gICAgICAgICAgICBvbklzc3VlKGBVbmNsb3NlZCBsb29wLXN0YXJ0IGF0IGluZGV4ICR7cmVtLnN0YXJ0SW5kZXh9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwYWlycy5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0SW5kZXggLSBiLnN0YXJ0SW5kZXgpO1xuICAgIHJldHVybiBwYWlycztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRJZlBhaXJzKHN0ZXBzTGlzdCwgb25Jc3N1ZSA9ICgpID0+IHt9KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbXTtcbiAgICBjb25zdCBpZlRvRWxzZSA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBpZlRvRW5kID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGVsc2VUb0VuZCA9IG5ldyBNYXAoKTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RlcHNMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdGVwc0xpc3RbaV07XG4gICAgICAgIGlmICghcyB8fCAhcy50eXBlKSBjb250aW51ZTtcblxuICAgICAgICBpZiAocy50eXBlID09PSAnaWYtc3RhcnQnKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKHsgaWZJbmRleDogaSwgZWxzZUluZGV4OiBudWxsIH0pO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocy50eXBlID09PSAnZWxzZScpIHtcbiAgICAgICAgICAgIGlmIChzdGFjay5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBvbklzc3VlKGBFbHNlIHdpdGhvdXQgbWF0Y2hpbmcgaWYtc3RhcnQgYXQgaW5kZXggJHtpfWApO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCB0b3AgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIGlmICh0b3AuZWxzZUluZGV4ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdG9wLmVsc2VJbmRleCA9IGk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG9uSXNzdWUoYE11bHRpcGxlIGVsc2UgYmxvY2tzIGZvciBpZi1zdGFydCBhdCBpbmRleCAke3RvcC5pZkluZGV4fWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocy50eXBlICE9PSAnaWYtZW5kJykgY29udGludWU7XG5cbiAgICAgICAgY29uc3QgdG9wID0gc3RhY2sucG9wKCk7XG4gICAgICAgIGlmICghdG9wKSB7XG4gICAgICAgICAgICBvbklzc3VlKGBJZi1lbmQgd2l0aG91dCBtYXRjaGluZyBpZi1zdGFydCBhdCBpbmRleCAke2l9YCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmVG9FbmQuc2V0KHRvcC5pZkluZGV4LCBpKTtcbiAgICAgICAgaWYgKHRvcC5lbHNlSW5kZXggIT09IG51bGwpIHtcbiAgICAgICAgICAgIGlmVG9FbHNlLnNldCh0b3AuaWZJbmRleCwgdG9wLmVsc2VJbmRleCk7XG4gICAgICAgICAgICBlbHNlVG9FbmQuc2V0KHRvcC5lbHNlSW5kZXgsIGkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHN0YWNrLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGNvbnN0IHJlbSBvZiBzdGFjaykge1xuICAgICAgICAgICAgb25Jc3N1ZShgVW5jbG9zZWQgaWYtc3RhcnQgYXQgaW5kZXggJHtyZW0uaWZJbmRleH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IGlmVG9FbHNlLCBpZlRvRW5kLCBlbHNlVG9FbmQgfTtcbn1cbiIsICJpbXBvcnQgeyBub3JtYWxpemVUZXh0IH0gZnJvbSAnLi4vdXRpbHMvdGV4dC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0Um93VmFsdWUoZmllbGRNYXBwaW5nLCBjdXJyZW50Um93KSB7XG4gICAgaWYgKCFjdXJyZW50Um93IHx8ICFmaWVsZE1hcHBpbmcpIHJldHVybiAnJztcbiAgICBsZXQgdmFsdWUgPSBjdXJyZW50Um93W2ZpZWxkTWFwcGluZ107XG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgJiYgZmllbGRNYXBwaW5nLmluY2x1ZGVzKCc6JykpIHtcbiAgICAgICAgY29uc3QgZmllbGROYW1lID0gZmllbGRNYXBwaW5nLnNwbGl0KCc6JykucG9wKCk7XG4gICAgICAgIHZhbHVlID0gY3VycmVudFJvd1tmaWVsZE5hbWVdO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbHVlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiAnJztcbiAgICBjb25zdCBhcmlhID0gZWxlbWVudC5nZXRBdHRyaWJ1dGU/LignYXJpYS1sYWJlbCcpO1xuICAgIGlmIChhcmlhKSByZXR1cm4gYXJpYS50cmltKCk7XG4gICAgY29uc3QgdGV4dCA9IGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKTtcbiAgICByZXR1cm4gdGV4dCB8fCAnJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVsZW1lbnRWYWx1ZUZvckNvbmRpdGlvbihlbGVtZW50KSB7XG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gJyc7XG4gICAgaWYgKCd2YWx1ZScgaW4gZWxlbWVudCAmJiBlbGVtZW50LnZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhlbGVtZW50LnZhbHVlID8/ICcnKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZhbHVhdGVDb25kaXRpb24oc3RlcCwgY3VycmVudFJvdywgZGVwcyA9IHt9KSB7XG4gICAgY29uc3QgZmluZEVsZW1lbnQgPSBkZXBzLmZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0IHx8ICgoKSA9PiBudWxsKTtcbiAgICBjb25zdCBpc1Zpc2libGUgPSBkZXBzLmlzRWxlbWVudFZpc2libGUgfHwgKCgpID0+IGZhbHNlKTtcbiAgICBjb25zdCB0eXBlID0gc3RlcD8uY29uZGl0aW9uVHlwZSB8fCAndWktdmlzaWJsZSc7XG5cbiAgICBpZiAodHlwZS5zdGFydHNXaXRoKCd1aS0nKSkge1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IHN0ZXA/LmNvbmRpdGlvbkNvbnRyb2xOYW1lIHx8IHN0ZXA/LmNvbnRyb2xOYW1lIHx8ICcnO1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gY29udHJvbE5hbWUgPyBmaW5kRWxlbWVudChjb250cm9sTmFtZSkgOiBudWxsO1xuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSAndWktdmlzaWJsZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuICEhZWxlbWVudCAmJiBpc1Zpc2libGUoZWxlbWVudCk7XG4gICAgICAgICAgICBjYXNlICd1aS1oaWRkZW4nOlxuICAgICAgICAgICAgICAgIHJldHVybiAhZWxlbWVudCB8fCAhaXNWaXNpYmxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgY2FzZSAndWktZXhpc3RzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gISFlbGVtZW50O1xuICAgICAgICAgICAgY2FzZSAndWktbm90LWV4aXN0cyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuICFlbGVtZW50O1xuICAgICAgICAgICAgY2FzZSAndWktdGV4dC1lcXVhbHMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChnZXRFbGVtZW50VGV4dEZvckNvbmRpdGlvbihlbGVtZW50KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsID09PSBleHBlY3RlZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3VpLXRleHQtY29udGFpbnMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChnZXRFbGVtZW50VGV4dEZvckNvbmRpdGlvbihlbGVtZW50KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsLmluY2x1ZGVzKGV4cGVjdGVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3VpLXZhbHVlLWVxdWFscyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRWYWx1ZUZvckNvbmRpdGlvbihlbGVtZW50KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsID09PSBleHBlY3RlZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3VpLXZhbHVlLWNvbnRhaW5zJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoZ2V0RWxlbWVudFZhbHVlRm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZS5zdGFydHNXaXRoKCdkYXRhLScpKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkTWFwcGluZyA9IHN0ZXA/LmNvbmRpdGlvbkZpZWxkTWFwcGluZyB8fCAnJztcbiAgICAgICAgY29uc3QgYWN0dWFsUmF3ID0gZXh0cmFjdFJvd1ZhbHVlKGZpZWxkTWFwcGluZywgY3VycmVudFJvdyk7XG4gICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoYWN0dWFsUmF3KTtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHN0ZXA/LmNvbmRpdGlvblZhbHVlIHx8ICcnKTtcblxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtZXF1YWxzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsID09PSBleHBlY3RlZDtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtbm90LWVxdWFscyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCAhPT0gZXhwZWN0ZWQ7XG4gICAgICAgICAgICBjYXNlICdkYXRhLWNvbnRhaW5zJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsLmluY2x1ZGVzKGV4cGVjdGVkKTtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtZW1wdHknOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09ICcnO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1ub3QtZW1wdHknOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgIT09ICcnO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG4iLCAiY29uc3QgREVGQVVMVF9TRVRUSU5HUyA9IE9iamVjdC5mcmVlemUoe1xuICAgIGRlbGF5QWZ0ZXJDbGljazogODAwLFxuICAgIGRlbGF5QWZ0ZXJJbnB1dDogNDAwLFxuICAgIGRlbGF5QWZ0ZXJTYXZlOiAxMDAwXG59KTtcblxuY29uc3QgQkFTRV9USU1JTkdTID0gT2JqZWN0LmZyZWV6ZSh7XG4gICAgUVVJQ0tfUkVUUllfREVMQVk6IDUwLFxuICAgIElOUFVUX1NFVFRMRV9ERUxBWTogMTAwLFxuICAgIEZMT1dfU1RBQklMSVRZX1BPTExfREVMQVk6IDEyMCxcbiAgICBNRURJVU1fU0VUVExFX0RFTEFZOiAxNTAsXG4gICAgSU5URVJSVVBUSU9OX1BPTExfREVMQVk6IDE1MCxcbiAgICBBTklNQVRJT05fREVMQVk6IDIwMCxcbiAgICBNRVNTQUdFX0NMT1NFX0RFTEFZOiAyNTAsXG4gICAgVUlfVVBEQVRFX0RFTEFZOiAzMDAsXG4gICAgRElBTE9HX0FDVElPTl9ERUxBWTogMzUwLFxuICAgIFBPU1RfSU5QVVRfREVMQVk6IDQwMCxcbiAgICBERUZBVUxUX1dBSVRfU1RFUF9ERUxBWTogNTAwLFxuICAgIFNBVkVfU0VUVExFX0RFTEFZOiA2MDAsXG4gICAgQ0xJQ0tfQU5JTUFUSU9OX0RFTEFZOiA4MDAsXG4gICAgVkFMSURBVElPTl9XQUlUOiAxMDAwXG59KTtcblxuY29uc3QgVElNSU5HX0NIQU5ORUwgPSBPYmplY3QuZnJlZXplKHtcbiAgICBRVUlDS19SRVRSWV9ERUxBWTogJ2lucHV0JyxcbiAgICBJTlBVVF9TRVRUTEVfREVMQVk6ICdpbnB1dCcsXG4gICAgRkxPV19TVEFCSUxJVFlfUE9MTF9ERUxBWTogJ2dlbmVyYWwnLFxuICAgIE1FRElVTV9TRVRUTEVfREVMQVk6ICdpbnB1dCcsXG4gICAgSU5URVJSVVBUSU9OX1BPTExfREVMQVk6ICdpbnB1dCcsXG4gICAgQU5JTUFUSU9OX0RFTEFZOiAnaW5wdXQnLFxuICAgIE1FU1NBR0VfQ0xPU0VfREVMQVk6ICdjbGljaycsXG4gICAgVUlfVVBEQVRFX0RFTEFZOiAnY2xpY2snLFxuICAgIERJQUxPR19BQ1RJT05fREVMQVk6ICdjbGljaycsXG4gICAgUE9TVF9JTlBVVF9ERUxBWTogJ2lucHV0JyxcbiAgICBERUZBVUxUX1dBSVRfU1RFUF9ERUxBWTogJ2NsaWNrJyxcbiAgICBTQVZFX1NFVFRMRV9ERUxBWTogJ3NhdmUnLFxuICAgIENMSUNLX0FOSU1BVElPTl9ERUxBWTogJ2NsaWNrJyxcbiAgICBWQUxJREFUSU9OX1dBSVQ6ICdzYXZlJ1xufSk7XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZURlbGF5KHZhbHVlLCBmYWxsYmFjaykge1xuICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSB8fCBwYXJzZWQgPD0gMCkgcmV0dXJuIGZhbGxiYWNrO1xuICAgIHJldHVybiBwYXJzZWQ7XG59XG5cbmZ1bmN0aW9uIHJvdW5kRGVsYXkodmFsdWUpIHtcbiAgICByZXR1cm4gTWF0aC5tYXgoMTAsIE1hdGgucm91bmQodmFsdWUpKTtcbn1cblxuZnVuY3Rpb24gZ2V0U3BlZWRQcm9maWxlKHNjYWxlcykge1xuICAgIGNvbnN0IGF2ZXJhZ2VTY2FsZSA9IChzY2FsZXMuY2xpY2sgKyBzY2FsZXMuaW5wdXQgKyBzY2FsZXMuc2F2ZSkgLyAzO1xuICAgIGlmIChhdmVyYWdlU2NhbGUgPD0gMC45KSByZXR1cm4gJ2Zhc3QnO1xuICAgIGlmIChhdmVyYWdlU2NhbGUgPj0gMS4xKSByZXR1cm4gJ3Nsb3cnO1xuICAgIHJldHVybiAnbm9ybWFsJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFdvcmtmbG93VGltaW5ncyhzZXR0aW5ncyA9IHt9KSB7XG4gICAgY29uc3QgbWVyZ2VkID0ge1xuICAgICAgICBkZWxheUFmdGVyQ2xpY2s6IG5vcm1hbGl6ZURlbGF5KHNldHRpbmdzLmRlbGF5QWZ0ZXJDbGljaywgREVGQVVMVF9TRVRUSU5HUy5kZWxheUFmdGVyQ2xpY2spLFxuICAgICAgICBkZWxheUFmdGVySW5wdXQ6IG5vcm1hbGl6ZURlbGF5KHNldHRpbmdzLmRlbGF5QWZ0ZXJJbnB1dCwgREVGQVVMVF9TRVRUSU5HUy5kZWxheUFmdGVySW5wdXQpLFxuICAgICAgICBkZWxheUFmdGVyU2F2ZTogbm9ybWFsaXplRGVsYXkoc2V0dGluZ3MuZGVsYXlBZnRlclNhdmUsIERFRkFVTFRfU0VUVElOR1MuZGVsYXlBZnRlclNhdmUpXG4gICAgfTtcblxuICAgIGNvbnN0IHNjYWxlcyA9IHtcbiAgICAgICAgY2xpY2s6IG1lcmdlZC5kZWxheUFmdGVyQ2xpY2sgLyBERUZBVUxUX1NFVFRJTkdTLmRlbGF5QWZ0ZXJDbGljayxcbiAgICAgICAgaW5wdXQ6IG1lcmdlZC5kZWxheUFmdGVySW5wdXQgLyBERUZBVUxUX1NFVFRJTkdTLmRlbGF5QWZ0ZXJJbnB1dCxcbiAgICAgICAgc2F2ZTogbWVyZ2VkLmRlbGF5QWZ0ZXJTYXZlIC8gREVGQVVMVF9TRVRUSU5HUy5kZWxheUFmdGVyU2F2ZVxuICAgIH07XG4gICAgc2NhbGVzLmdlbmVyYWwgPSAoc2NhbGVzLmNsaWNrICsgc2NhbGVzLmlucHV0ICsgc2NhbGVzLnNhdmUpIC8gMztcblxuICAgIGNvbnN0IHRpbWluZ3MgPSB7fTtcbiAgICBPYmplY3QuZW50cmllcyhCQVNFX1RJTUlOR1MpLmZvckVhY2goKFtrZXksIGJhc2VWYWx1ZV0pID0+IHtcbiAgICAgICAgY29uc3QgY2hhbm5lbCA9IFRJTUlOR19DSEFOTkVMW2tleV0gfHwgJ2dlbmVyYWwnO1xuICAgICAgICBjb25zdCBzY2FsZSA9IHNjYWxlc1tjaGFubmVsXSB8fCBzY2FsZXMuZ2VuZXJhbDtcbiAgICAgICAgdGltaW5nc1trZXldID0gcm91bmREZWxheShiYXNlVmFsdWUgKiBzY2FsZSk7XG4gICAgfSk7XG5cbiAgICB0aW1pbmdzLnN5c3RlbVNwZWVkID0gZ2V0U3BlZWRQcm9maWxlKHNjYWxlcyk7XG4gICAgdGltaW5ncy5zZXR0aW5ncyA9IG1lcmdlZDtcbiAgICByZXR1cm4gdGltaW5ncztcbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHtcclxuICAgIGNvbnN0IGFsbE1hdGNoZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG5cclxuICAgIGlmIChhbGxNYXRjaGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcbiAgICBpZiAoYWxsTWF0Y2hlcy5sZW5ndGggPT09IDEpIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG5cclxuICAgIC8vIE11bHRpcGxlIG1hdGNoZXMgLSBwcmVmZXIgdGhlIG9uZSBpbiB0aGUgYWN0aXZlL3RvcG1vc3QgY29udGV4dFxyXG5cclxuICAgIC8vIFByaW9yaXR5IDE6IEVsZW1lbnQgaW4gYW4gYWN0aXZlIGRpYWxvZy9tb2RhbCAoY2hpbGQgZm9ybXMpXHJcbiAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICBjb25zdCBkaWFsb2cgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpO1xyXG4gICAgICAgIGlmIChkaWFsb2cgJiYgaXNFbGVtZW50VmlzaWJsZShkaWFsb2cpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBkaWFsb2cgY29udGV4dGApO1xyXG4gICAgICAgICAgICByZXR1cm4gZWw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDI6IEVsZW1lbnQgaW4gYSBGYXN0VGFiIG9yIFRhYlBhZ2UgdGhhdCdzIGV4cGFuZGVkL2FjdGl2ZVxyXG4gICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgY29uc3QgdGFiUGFnZSA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgLnRhYlBhZ2UnKTtcclxuICAgICAgICBpZiAodGFiUGFnZSkge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgdGFiIGlzIGV4cGFuZGVkXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSB0YWJQYWdlLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YWJQYWdlLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXRhYlBhZ2UuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuICAgICAgICAgICAgaWYgKGlzRXhwYW5kZWQgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBleHBhbmRlZCB0YWIgY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDM6IEVsZW1lbnQgaW4gdGhlIGZvcm0gY29udGV4dCB0aGF0IGhhcyBmb2N1cyBvciB3YXMgcmVjZW50bHkgaW50ZXJhY3RlZCB3aXRoXHJcbiAgICBjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcclxuICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtQ29udGV4dCA9IGFjdGl2ZUVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLWZvcm0tbmFtZV0sIFtkYXRhLWR5bi1yb2xlPVwiRm9ybVwiXScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dC5jb250YWlucyhlbCkgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gYWN0aXZlIGZvcm0gY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSA0OiBBbnkgdmlzaWJsZSBlbGVtZW50IChwcmVmZXIgbGF0ZXIgb25lcyBhcyB0aGV5J3JlIG9mdGVuIGluIGNoaWxkIGZvcm1zIHJlbmRlcmVkIG9uIHRvcClcclxuICAgIGNvbnN0IHZpc2libGVNYXRjaGVzID0gQXJyYXkuZnJvbShhbGxNYXRjaGVzKS5maWx0ZXIoZWwgPT4gaXNFbGVtZW50VmlzaWJsZShlbCkpO1xyXG4gICAgaWYgKHZpc2libGVNYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAvLyBSZXR1cm4gdGhlIGxhc3QgdmlzaWJsZSBtYXRjaCAob2Z0ZW4gdGhlIGNoaWxkIGZvcm0ncyBlbGVtZW50KVxyXG4gICAgICAgIHJldHVybiB2aXNpYmxlTWF0Y2hlc1t2aXNpYmxlTWF0Y2hlcy5sZW5ndGggLSAxXTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGYWxsYmFjazogZmlyc3QgbWF0Y2hcclxuICAgIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZShlbCkge1xyXG4gICAgaWYgKCFlbCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XHJcbiAgICByZXR1cm4gcmVjdC53aWR0aCA+IDAgJiZcclxuICAgICAgICAgICByZWN0LmhlaWdodCA+IDAgJiZcclxuICAgICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScgJiZcclxuICAgICAgICAgICBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgIHN0eWxlLm9wYWNpdHkgIT09ICcwJztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRDM2NUxvYWRpbmcoKSB7XHJcbiAgICAvLyBDaGVjayBmb3IgY29tbW9uIEQzNjUgbG9hZGluZyBpbmRpY2F0b3JzXHJcbiAgICBjb25zdCBsb2FkaW5nU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcuZHluLWxvYWRpbmctb3ZlcmxheTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1sb2FkaW5nLWluZGljYXRvcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1zcGlubmVyOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcubG9hZGluZy1pbmRpY2F0b3I6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tbWVzc2FnZUJ1c3k6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1sb2FkaW5nPVwidHJ1ZVwiXScsXHJcbiAgICAgICAgJy5idXN5LWluZGljYXRvcicsXHJcbiAgICAgICAgJy5keW4tbG9hZGluZ1N0dWI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tcHJvY2Vzc2luZ01zZzpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIGxvYWRpbmdTZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChlbCAmJiBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGZvciBBSkFYIHJlcXVlc3RzIGluIHByb2dyZXNzIChEMzY1IHNwZWNpZmljKVxyXG4gICAgaWYgKHdpbmRvdy4kZHluICYmIHdpbmRvdy4kZHluLmlzUHJvY2Vzc2luZykge1xyXG4gICAgICAgIHJldHVybiB3aW5kb3cuJGR5bi5pc1Byb2Nlc3NpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBmb3IgXCJQbGVhc2Ugd2FpdFwiIHByb2Nlc3NpbmcgbWVzc2FnZSBvdmVybGF5cy5cclxuICAgIC8vIEQzNjUgc2hvd3MgdGhlc2UgZHVyaW5nIHNlcnZlci1zaWRlIG9wZXJhdGlvbnMgKGUuZy4gYWZ0ZXIgY2xpY2tpbmcgT0tcclxuICAgIC8vIG9uIHRoZSBDcmVhdGUgU2FsZXMgT3JkZXIgZGlhbG9nKS5cclxuICAgIGlmIChpc0QzNjVQcm9jZXNzaW5nTWVzc2FnZSgpKSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogRGV0ZWN0IHRoZSBcIlBsZWFzZSB3YWl0LiBXZSdyZSBwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdC5cIiBtZXNzYWdlIG92ZXJsYXlcclxuICogYW5kIHNpbWlsYXIgRDM2NSBwcm9jZXNzaW5nL2Jsb2NraW5nIG1lc3NhZ2VzLlxyXG4gKiBUaGVzZSBhcmUgbW9kYWwtc3R5bGUgbWVzc2FnZSBib3hlcyB0aGF0IGJsb2NrIHRoZSBVSSB3aGlsZSB0aGUgc2VydmVyXHJcbiAqIHByb2Nlc3NlcyBhIHJlcXVlc3QuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaXNEMzY1UHJvY2Vzc2luZ01lc3NhZ2UoKSB7XHJcbiAgICAvLyBQYXR0ZXJuIDE6IEQzNjUgbWVzc2FnZSBiYXIgLyBpbmZvIGJveCB3aXRoIFwiUGxlYXNlIHdhaXRcIiB0ZXh0XHJcbiAgICBjb25zdCBtZXNzYWdlU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcubWVzc2FnZUJhcicsXHJcbiAgICAgICAgJy5keW4tbWVzc2FnZUJhcicsXHJcbiAgICAgICAgJy5keW4tbXNnQm94JyxcclxuICAgICAgICAnLmR5bi1pbmZvQm94JyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJNc2dCb3hcIl0nLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkluZm9Cb3hcIl0nLFxyXG4gICAgICAgICcuZGlhbG9nLWNvbnRhaW5lcicsXHJcbiAgICAgICAgJ1tyb2xlPVwiZGlhbG9nXCJdJyxcclxuICAgICAgICAnW3JvbGU9XCJhbGVydGRpYWxvZ1wiXScsXHJcbiAgICAgICAgJy5zeXNCb3hDb250ZW50JyxcclxuICAgICAgICAnLnByb2Nlc3NpbmctZGlhbG9nJ1xyXG4gICAgXTtcclxuXHJcbiAgICBjb25zdCB3YWl0UGhyYXNlcyA9IFtcclxuICAgICAgICAncGxlYXNlIHdhaXQnLFxyXG4gICAgICAgICdwcm9jZXNzaW5nIHlvdXIgcmVxdWVzdCcsXHJcbiAgICAgICAgJ3dlXFwncmUgcHJvY2Vzc2luZycsXHJcbiAgICAgICAgJ2JlaW5nIHByb2Nlc3NlZCcsXHJcbiAgICAgICAgJ3BsZWFzZSBiZSBwYXRpZW50JyxcclxuICAgICAgICAnb3BlcmF0aW9uIGluIHByb2dyZXNzJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIG1lc3NhZ2VTZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBlbGVtZW50cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xyXG4gICAgICAgIGZvciAoY29uc3QgZWwgb2YgZWxlbWVudHMpIHtcclxuICAgICAgICAgICAgaWYgKGVsICYmIGVsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgICAgIGlmICh3YWl0UGhyYXNlcy5zb21lKHBocmFzZSA9PiB0ZXh0LmluY2x1ZGVzKHBocmFzZSkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUGF0dGVybiAyOiBBbnkgdmlzaWJsZSBlbGVtZW50IGNvbnRhaW5pbmcgdGhlIHByb2Nlc3NpbmcgdGV4dCB0aGF0XHJcbiAgICAvLyBsb29rcyBsaWtlIGEgYmxvY2tpbmcgb3ZlcmxheSBvciBtb2RhbFxyXG4gICAgY29uc3Qgb3ZlcmxheXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICcubW9kYWwsIC5vdmVybGF5LCBbY2xhc3MqPVwib3ZlcmxheVwiXSwgW2NsYXNzKj1cIm1vZGFsXCJdLCBbY2xhc3MqPVwiYmxvY2tpbmdcIl0nXHJcbiAgICApO1xyXG4gICAgZm9yIChjb25zdCBlbCBvZiBvdmVybGF5cykge1xyXG4gICAgICAgIGlmIChlbCAmJiBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgaWYgKHdhaXRQaHJhc2VzLnNvbWUocGhyYXNlID0+IHRleHQuaW5jbHVkZXMocGhyYXNlKSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpIHtcclxuICAgIC8vIFByaW9yaXR5IDA6IElmIHdlIGhhdmUgYSBwZW5kaW5nLW5ldy1yb3cgbWFya2VyIChzZXQgYnkgd2FpdEZvck5ld0dyaWRSb3dcclxuICAgIC8vIGFmdGVyIGFuIFwiQWRkIGxpbmVcIiBjbGljayksIGxvb2sgaW4gVEhBVCBzcGVjaWZpYyByb3cgZmlyc3QuXHJcbiAgICAvLyBUaGlzIGVsaW1pbmF0ZXMgdGhlIHJhY2UgY29uZGl0aW9uIHdoZXJlIHRoZSBvbGQgcm93IGlzIHN0aWxsIHNlbGVjdGVkLlxyXG4gICAgY29uc3QgcGVuZGluZ05ldyA9IHdpbmRvdy5fX2QzNjVfcGVuZGluZ05ld1JvdztcclxuICAgIGlmIChwZW5kaW5nTmV3ICYmIHBlbmRpbmdOZXcucm93RWxlbWVudCAmJiAoRGF0ZS5ub3coKSAtIHBlbmRpbmdOZXcudGltZXN0YW1wIDwgMTUwMDApKSB7XHJcbiAgICAgICAgY29uc3QgY2VsbCA9IHBlbmRpbmdOZXcucm93RWxlbWVudC5xdWVyeVNlbGVjdG9yKFxyXG4gICAgICAgICAgICBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXHJcbiAgICAgICAgKTtcclxuICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJpb3JpdHkgMTogRmluZCBpbiBhbiBhY3RpdmUvc2VsZWN0ZWQgcm93ICh0cmFkaXRpb25hbCBEMzY1IGdyaWRzKVxyXG4gICAgY29uc3Qgc2VsZWN0ZWRSb3dzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXNlbGVjdGVkPVwidHJ1ZVwiXSwgW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZHluLXNlbGVjdGVkUm93Jyk7XHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiBzZWxlY3RlZFJvd3MpIHtcclxuICAgICAgICBjb25zdCBjZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNlbGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDI6IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIC0gZmluZCBhY3RpdmUgcm93XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICAvLyBMb29rIGZvciBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nKTtcclxuICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjZWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQcmlvcml0eSAzOiBJbiBib2R5IHJvd3MgLSBwcmVmZXIgdGhlIExBU1QgdmlzaWJsZSBjZWxsLlxyXG4gICAgICAgIC8vIEFmdGVyIFwiQWRkIGxpbmVcIiwgRDM2NSBhcHBlbmRzIGEgbmV3IHJvdyBhdCB0aGUgYm90dG9tLlxyXG4gICAgICAgIC8vIElmIHRoZSBhY3RpdmUtcm93IGF0dHJpYnV0ZSBoYXNuJ3QgYmVlbiBzZXQgeWV0IChyYWNlIGNvbmRpdGlvbiksXHJcbiAgICAgICAgLy8gcmV0dXJuaW5nIHRoZSBmaXJzdCBjZWxsIHdvdWxkIHRhcmdldCByb3cgMSBpbnN0ZWFkIG9mIHRoZSBuZXcgcm93LlxyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBsZXQgbGFzdFZpc2libGVDZWxsID0gbnVsbDtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGlmIGluIGhlYWRlclxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNJbkhlYWRlciA9IGNlbGwuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzSW5IZWFkZXIgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBsYXN0VmlzaWJsZUNlbGwgPSBjZWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChsYXN0VmlzaWJsZUNlbGwpIHJldHVybiBsYXN0VmlzaWJsZUNlbGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDQ6IFRyYWRpdGlvbmFsIEQzNjUgZ3JpZCBjb250ZXh0IC0gcHJlZmVyIGxhc3QgdmlzaWJsZSBjZWxsXHJcbiAgICBjb25zdCBncmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIGdyaWRzKSB7XHJcbiAgICAgICAgLy8gRmluZCBhbGwgbWF0Y2hpbmcgY2VsbHMgYW5kIHByZWZlciB2aXNpYmxlL2VkaXRhYmxlIG9uZXNcclxuICAgICAgICBjb25zdCBjZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBsZXQgbGFzdFZpc2libGVDZWxsID0gbnVsbDtcclxuICAgICAgICBmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyBpbiBhIGRhdGEgcm93IChub3QgaGVhZGVyKVxyXG4gICAgICAgICAgICBjb25zdCBpc0luSGVhZGVyID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0sIHRoZWFkJyk7XHJcbiAgICAgICAgICAgIGlmICghaXNJbkhlYWRlciAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgbGFzdFZpc2libGVDZWxsID0gY2VsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobGFzdFZpc2libGVDZWxsKSByZXR1cm4gbGFzdFZpc2libGVDZWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIHRvIHN0YW5kYXJkIGVsZW1lbnQgZmluZGluZ1xyXG4gICAgcmV0dXJuIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc0xvb2t1cEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICByZXR1cm4gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubG9va3VwLWJ1dHRvbiwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBCdXR0b25cIl0nKSAhPT0gbnVsbCB8fFxyXG4gICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gWycubG9va3VwLWJ1dHRvbicsICcubG9va3VwQnV0dG9uJywgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwQnV0dG9uXCJdJ107XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGRpcmVjdCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGRpcmVjdCkgcmV0dXJuIGRpcmVjdDtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAsIC5sb29rdXBGaWVsZCcpIHx8IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuICAgIGlmICghY29udGFpbmVyKSByZXR1cm4gbnVsbDtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgaW5Db250YWluZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGluQ29udGFpbmVyKSByZXR1cm4gaW5Db250YWluZXI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhcmlhQnV0dG9uID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblthcmlhLWxhYmVsKj1cIkxvb2t1cFwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiT3BlblwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VsZWN0XCJdJyk7XHJcbiAgICBpZiAoYXJpYUJ1dHRvbikgcmV0dXJuIGFyaWFCdXR0b247XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGVHbG9iYWwoZWxlbWVudCkge1xyXG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gZmFsc2U7XHJcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xyXG4gICAgcmV0dXJuIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmXHJcbiAgICAgICAgc3R5bGUudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwaWNrTmVhcmVzdFJvd3Mocm93cywgdGFyZ2V0RWxlbWVudCkge1xyXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkgcmV0dXJuIHJvd3M7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIGlmICghdGFyZ2V0UmVjdCkgcmV0dXJuIHJvd3M7XHJcbiAgICByZXR1cm4gcm93cy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICBjb25zdCByYSA9IGEuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgcmIgPSBiLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IGRhID0gTWF0aC5hYnMocmEubGVmdCAtIHRhcmdldFJlY3QubGVmdCkgKyBNYXRoLmFicyhyYS50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgY29uc3QgZGIgPSBNYXRoLmFicyhyYi5sZWZ0IC0gdGFyZ2V0UmVjdC5sZWZ0KSArIE1hdGguYWJzKHJiLnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICByZXR1cm4gZGEgLSBkYjtcclxuICAgIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogQ291bnQgdmlzaWJsZSBkYXRhIHJvd3MgaW4gYWxsIGdyaWRzIG9uIHRoZSBwYWdlLlxyXG4gKiBSZXR1cm5zIHRoZSB0b3RhbCBjb3VudCBhY3Jvc3MgUmVhY3QgRml4ZWREYXRhVGFibGUgYW5kIHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHMuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0R3JpZFJvd0NvdW50KCkge1xyXG4gICAgbGV0IGNvdW50ID0gMDtcclxuXHJcbiAgICAvLyBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkc1xyXG4gICAgY29uc3QgcmVhY3RHcmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgY29uc3QgYm9keUNvbnRhaW5lciA9IGdyaWQucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHksIC5maXhlZERhdGFUYWJsZUxheW91dF9yb3dzQ29udGFpbmVyJyk7XHJcbiAgICAgICAgaWYgKGJvZHlDb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgICAgICcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbiwgW3JvbGU9XCJyb3dcIl06bm90KFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdKSdcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgLy8gT25seSBjb3VudCByb3dzIHRoYXQgYXJlIHZpc2libGUgYW5kIGhhdmUgY29udGVudCAobm90IGVtcHR5IHNwYWNlciByb3dzKVxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAocm93Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJiAhcm93LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUxheW91dF9oZWFkZXInKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvdW50Kys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJhZGl0aW9uYWwgRDM2NSBncmlkc1xyXG4gICAgaWYgKGNvdW50ID09PSAwKSB7XHJcbiAgICAgICAgY29uc3QgZ3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGdyaWQgb2YgZ3JpZHMpIHtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgICAgICdbZGF0YS1keW4tcm9sZT1cIlJvd1wiXTpub3QoW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0pLCAnICtcclxuICAgICAgICAgICAgICAgICdbcm9sZT1cInJvd1wiXTpub3QoW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0pOm5vdCh0aGVhZCBbcm9sZT1cInJvd1wiXSksICcgK1xyXG4gICAgICAgICAgICAgICAgJ3Rib2R5IHRyJ1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAocm93Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkgY291bnQrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY291bnQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgdGhlIERPTSBlbGVtZW50IG9mIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQvYWN0aXZlIGdyaWQgcm93LlxyXG4gKiBSZXR1cm5zIHsgcm93LCByb3dJbmRleCB9IG9yIG51bGwuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0R3JpZFNlbGVjdGVkUm93KCkge1xyXG4gICAgLy8gUmVhY3QgZ3JpZHNcclxuICAgIGNvbnN0IHJlYWN0R3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmVhY3RHcmlkJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgcmVhY3RHcmlkcykge1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmICghYm9keUNvbnRhaW5lcikgY29udGludWU7XHJcbiAgICAgICAgY29uc3QgYWxsUm93cyA9IEFycmF5LmZyb20oYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICAgICAnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4nXHJcbiAgICAgICAgKSkuZmlsdGVyKHIgPT4gci5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgIXIuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlcicpKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhbGxSb3dzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChhbGxSb3dzW2ldLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgIGFsbFJvd3NbaV0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb3ctYWN0aXZlJykgPT09ICd0cnVlJykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgcm93OiBhbGxSb3dzW2ldLCByb3dJbmRleDogaSwgdG90YWxSb3dzOiBhbGxSb3dzLmxlbmd0aCB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyYWRpdGlvbmFsIGdyaWRzXHJcbiAgICBjb25zdCBzZWxlY3RlZFJvd3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnXHJcbiAgICApO1xyXG4gICAgZm9yIChjb25zdCByb3cgb2Ygc2VsZWN0ZWRSb3dzKSB7XHJcbiAgICAgICAgaWYgKHJvdy5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgcm93LCByb3dJbmRleDogLTEsIHRvdGFsUm93czogLTEgfTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb2xsZWN0IGNvbXByZWhlbnNpdmUgZ3JpZCBzdGF0ZSBpbmZvcm1hdGlvbiBmb3IgZGlhZ25vc3RpY3MuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5zcGVjdEdyaWRTdGF0ZSgpIHtcclxuICAgIGNvbnN0IGdyaWRzID0gW107XHJcblxyXG4gICAgLy8gUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHNcclxuICAgIGNvbnN0IHJlYWN0R3JpZEVscyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRFbHMpIHtcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoIWJvZHlDb250YWluZXIpIGNvbnRpbnVlO1xyXG4gICAgICAgIGNvbnN0IGFsbFJvd3MgPSBBcnJheS5mcm9tKGJvZHlDb250YWluZXIucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluJ1xyXG4gICAgICAgICkpLmZpbHRlcihyID0+IHIub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmICFyLmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUxheW91dF9oZWFkZXInKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJvd0RldGFpbHMgPSBhbGxSb3dzLm1hcCgocm93LCBpZHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHJvdy5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IHJvdy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvdy1hY3RpdmUnKSA9PT0gJ3RydWUnO1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsQ29udHJvbHMgPSBBcnJheS5mcm9tKHJvdy5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykpXHJcbiAgICAgICAgICAgICAgICAubWFwKGMgPT4gYy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykpO1xyXG4gICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9ICEhcm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGlkeCwgaXNTZWxlY3RlZCwgaXNBY3RpdmUsIGNlbGxDb250cm9scywgaGFzSW5wdXQgfTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgZ3JpZHMucHVzaCh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdSZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICB0b3RhbFJvd3M6IGFsbFJvd3MubGVuZ3RoLFxyXG4gICAgICAgICAgICBzZWxlY3RlZFJvd3M6IHJvd0RldGFpbHMuZmlsdGVyKHIgPT4gci5pc1NlbGVjdGVkKS5tYXAociA9PiByLmluZGV4KSxcclxuICAgICAgICAgICAgYWN0aXZlUm93czogcm93RGV0YWlscy5maWx0ZXIociA9PiByLmlzQWN0aXZlKS5tYXAociA9PiByLmluZGV4KSxcclxuICAgICAgICAgICAgcm93czogcm93RGV0YWlsc1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyYWRpdGlvbmFsIEQzNjUgZ3JpZHNcclxuICAgIGNvbnN0IHRyYWRHcmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHRyYWRHcmlkcykge1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZ3JpZC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJ3Vua25vd24nO1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKGdyaWQucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiUm93XCJdLCBbcm9sZT1cInJvd1wiXTpub3QodGhlYWQgW3JvbGU9XCJyb3dcIl0pLCB0Ym9keSB0cidcclxuICAgICAgICApKS5maWx0ZXIociA9PiByLm9mZnNldFBhcmVudCAhPT0gbnVsbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJvd0RldGFpbHMgPSByb3dzLm1hcCgocm93LCBpZHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHJvdy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuY2xhc3NMaXN0LmNvbnRhaW5zKCdkeW4tc2VsZWN0ZWRSb3cnKTtcclxuICAgICAgICAgICAgY29uc3QgY2VsbENvbnRyb2xzID0gQXJyYXkuZnJvbShyb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpKVxyXG4gICAgICAgICAgICAgICAgLm1hcChjID0+IGMuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGlkeCwgaXNTZWxlY3RlZCwgY2VsbENvbnRyb2xzIH07XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGdyaWRzLnB1c2goe1xyXG4gICAgICAgICAgICB0eXBlOiAnVHJhZGl0aW9uYWxHcmlkJyxcclxuICAgICAgICAgICAgY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgIHRvdGFsUm93czogcm93cy5sZW5ndGgsXHJcbiAgICAgICAgICAgIHNlbGVjdGVkUm93czogcm93RGV0YWlscy5maWx0ZXIociA9PiByLmlzU2VsZWN0ZWQpLm1hcChyID0+IHIuaW5kZXgpLFxyXG4gICAgICAgICAgICByb3dzOiByb3dEZXRhaWxzXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBncmlkQ291bnQ6IGdyaWRzLmxlbmd0aCxcclxuICAgICAgICBncmlkcyxcclxuICAgICAgICBwZW5kaW5nTmV3Um93OiAhIXdpbmRvdy5fX2QzNjVfcGVuZGluZ05ld1JvdyxcclxuICAgICAgICBwZW5kaW5nTmV3Um93RGF0YTogd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93IHx8IG51bGxcclxuICAgIH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9va3VwRmlsdGVySW5wdXQobG9va3VwRG9jaykge1xyXG4gICAgaWYgKCFsb29rdXBEb2NrKSByZXR1cm4gbnVsbDtcclxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBBcnJheS5mcm9tKFxyXG4gICAgICAgIGxvb2t1cERvY2sucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInRleHRcIl0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJylcclxuICAgICk7XHJcbiAgICBpZiAoIWNhbmRpZGF0ZXMubGVuZ3RoKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAvLyBQcmVmZXIgaW5wdXRzIGluc2lkZSBzZWdtZW50ZWQgZW50cnkgZmx5b3V0IChNYWluQWNjb3VudCBpbnB1dCBpbiB0aGUgcmlnaHQgcGFuZWwpXHJcbiAgICBjb25zdCBzZWdtZW50SW5wdXQgPSBjYW5kaWRhdGVzLmZpbmQoaW5wdXQgPT4gaW5wdXQuY2xvc2VzdCgnLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQnKSk7XHJcbiAgICBpZiAoc2VnbWVudElucHV0KSByZXR1cm4gc2VnbWVudElucHV0O1xyXG5cclxuICAgIC8vIFNvbWUgZmx5b3V0cyB3cmFwIHRoZSBpbnB1dCBpbiBhIGNvbnRhaW5lcjsgdHJ5IHRvIGZpbmQgdGhlIGFjdHVhbCBpbnB1dCBpbnNpZGVcclxuICAgIGNvbnN0IHNlZ21lbnRDb250YWluZXIgPSBsb29rdXBEb2NrLnF1ZXJ5U2VsZWN0b3IoJy5zZWdtZW50ZWRFbnRyeS1mbHlvdXRTZWdtZW50IC5zZWdtZW50ZWRFbnRyeS1zZWdtZW50SW5wdXQnKTtcclxuICAgIGlmIChzZWdtZW50Q29udGFpbmVyKSB7XHJcbiAgICAgICAgY29uc3QgaW5uZXIgPSBzZWdtZW50Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgICAgICBpZiAoaW5uZXIpIHJldHVybiBpbm5lcjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmVmZXIgaW5wdXRzIGluc2lkZSBncmlkIGhlYWRlci90b29sYmFyIG9yIG5lYXIgdGhlIHRvcC1yaWdodCAobGlrZSB0aGUgbWFya2VkIGJveClcclxuICAgIGNvbnN0IGhlYWRlckNhbmRpZGF0ZSA9IGNhbmRpZGF0ZXMuZmluZChpbnB1dCA9PlxyXG4gICAgICAgIGlucHV0LmNsb3Nlc3QoJy5sb29rdXAtaGVhZGVyLCAubG9va3VwLXRvb2xiYXIsIC5ncmlkLWhlYWRlciwgW3JvbGU9XCJ0b29sYmFyXCJdJylcclxuICAgICk7XHJcbiAgICBpZiAoaGVhZGVyQ2FuZGlkYXRlKSByZXR1cm4gaGVhZGVyQ2FuZGlkYXRlO1xyXG5cclxuICAgIGxldCBiZXN0ID0gY2FuZGlkYXRlc1swXTtcclxuICAgIGxldCBiZXN0U2NvcmUgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XHJcbiAgICBmb3IgKGNvbnN0IGlucHV0IG9mIGNhbmRpZGF0ZXMpIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gaW5wdXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3Qgc2NvcmUgPSByZWN0LnRvcCAqIDIgKyByZWN0LmxlZnQ7IC8vIGJpYXMgdG93YXJkcyB0b3Agcm93XHJcbiAgICAgICAgaWYgKHNjb3JlIDwgYmVzdFNjb3JlKSB7XHJcbiAgICAgICAgICAgIGJlc3RTY29yZSA9IHNjb3JlO1xyXG4gICAgICAgICAgICBiZXN0ID0gaW5wdXQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJlc3Q7XHJcbn1cclxuIiwgImltcG9ydCB7IHNsZWVwIH0gZnJvbSAnLi9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGlzRWxlbWVudFZpc2libGVHbG9iYWwsIHBpY2tOZWFyZXN0Um93cyB9IGZyb20gJy4vZG9tLmpzJztcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTG9va3VwUG9wdXAodGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcubG9va3VwLWJ1dHRvbkNvbnRhaW5lcicsXHJcbiAgICAgICAgJy5sb29rdXBEb2NrLWJ1dHRvbkNvbnRhaW5lcicsXHJcbiAgICAgICAgJ1tyb2xlPVwiZGlhbG9nXCJdJyxcclxuICAgICAgICAnLmxvb2t1cC1mbHlvdXQnLFxyXG4gICAgICAgICcubG9va3VwRmx5b3V0JyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0nLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkxvb2t1cEdyaWRcIl0nLFxyXG4gICAgICAgICcubG9va3VwLWNvbnRhaW5lcicsXHJcbiAgICAgICAgJy5sb29rdXAnLFxyXG4gICAgICAgICdbcm9sZT1cImdyaWRcIl0nLFxyXG4gICAgICAgICd0YWJsZSdcclxuICAgIF07XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9wdXAgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICAgICAgaWYgKCFwb3B1cCkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChwb3B1cC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdtZXNzYWdlQ2VudGVyJykpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAocG9wdXAuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPT09ICdBY3Rpb24gY2VudGVyJykgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZUdsb2JhbChwb3B1cCkpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gcG9wdXA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cERvY2ssIHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDMwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBsZXQgcm93cyA9IGxvb2t1cERvY2s/LnF1ZXJ5U2VsZWN0b3JBbGw/LigndHJbZGF0YS1keW4tcm93XSwgLmxvb2t1cC1yb3csIFtyb2xlPVwicm93XCJdJykgfHwgW107XHJcbiAgICAgICAgaWYgKHJvd3MubGVuZ3RoKSByZXR1cm4gcm93cztcclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IGZpbmQgdmlzaWJsZSBsb29rdXAgcm93cyBhbnl3aGVyZSAoc29tZSBkb2NrcyByZW5kZXIgb3V0c2lkZSB0aGUgY29udGFpbmVyKVxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFJvd3MgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXScpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpO1xyXG4gICAgICAgIGlmIChnbG9iYWxSb3dzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGlja05lYXJlc3RSb3dzKGdsb2JhbFJvd3MsIHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIFtdO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDMwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIGNvbnN0IHRhcmdldFJlY3QgPSB0YXJnZXRFbGVtZW50Py5nZXRCb3VuZGluZ0NsaWVudFJlY3Q/LigpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGRvY2tzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubG9va3VwRG9jay1idXR0b25Db250YWluZXInKSlcclxuICAgICAgICAgICAgLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGRvY2sgPT4gIWRvY2suY2xhc3NMaXN0Py5jb250YWlucygnbWVzc2FnZUNlbnRlcicpKTtcclxuXHJcbiAgICAgICAgaWYgKGRvY2tzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjb25zdCB3aXRoUm93cyA9IGRvY2tzLmZpbHRlcihkb2NrID0+IGRvY2sucXVlcnlTZWxlY3RvcigndHJbZGF0YS1keW4tcm93XSwgLmxvb2t1cC1yb3csIFtyb2xlPVwicm93XCJdLCBbcm9sZT1cImdyaWRcIl0sIHRhYmxlJykpO1xyXG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gd2l0aFJvd3MubGVuZ3RoID8gd2l0aFJvd3MgOiBkb2NrcztcclxuICAgICAgICAgICAgY29uc3QgYmVzdCA9IHBpY2tOZWFyZXN0RG9jayhjYW5kaWRhdGVzLCB0YXJnZXRSZWN0KTtcclxuICAgICAgICAgICAgaWYgKGJlc3QpIHJldHVybiBiZXN0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwaWNrTmVhcmVzdERvY2soZG9ja3MsIHRhcmdldFJlY3QpIHtcclxuICAgIGlmICghZG9ja3MubGVuZ3RoKSByZXR1cm4gbnVsbDtcclxuICAgIGlmICghdGFyZ2V0UmVjdCkgcmV0dXJuIGRvY2tzWzBdO1xyXG4gICAgbGV0IGJlc3QgPSBkb2Nrc1swXTtcclxuICAgIGxldCBiZXN0U2NvcmUgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XHJcbiAgICBmb3IgKGNvbnN0IGRvY2sgb2YgZG9ja3MpIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gZG9jay5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBkeCA9IE1hdGguYWJzKHJlY3QubGVmdCAtIHRhcmdldFJlY3QubGVmdCk7XHJcbiAgICAgICAgY29uc3QgZHkgPSBNYXRoLmFicyhyZWN0LnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICBjb25zdCBzY29yZSA9IGR4ICsgZHk7XHJcbiAgICAgICAgaWYgKHNjb3JlIDwgYmVzdFNjb3JlKSB7XHJcbiAgICAgICAgICAgIGJlc3RTY29yZSA9IHNjb3JlO1xyXG4gICAgICAgICAgICBiZXN0ID0gZG9jaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYmVzdDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMaXN0Ym94Rm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbJ1tyb2xlPVwibGlzdGJveFwiXScsICcuZHJvcERvd25MaXN0JywgJy5jb21ib0JveERyb3BEb3duJywgJy5kcm9wZG93bi1tZW51JywgJy5kcm9wZG93bi1saXN0J107XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBsaXN0cyA9IHNlbGVjdG9ycy5mbGF0TWFwKHNlbCA9PiBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsKSkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbCk7XHJcbiAgICAgICAgaWYgKGxpc3RzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGlja05lYXJlc3REb2NrKGxpc3RzLCB0YXJnZXRSZWN0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxpc3Rib3hGb3JJbnB1dChpbnB1dCwgdGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGxpbmtlZCA9IGdldExpc3Rib3hGcm9tSW5wdXQoaW5wdXQpO1xyXG4gICAgICAgIGlmIChsaW5rZWQgJiYgaXNFbGVtZW50VmlzaWJsZUdsb2JhbChsaW5rZWQpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBsaW5rZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGZhbGxiYWNrID0gYXdhaXQgd2FpdEZvckxpc3Rib3hGb3JFbGVtZW50KHRhcmdldEVsZW1lbnQsIDIwMCk7XHJcbiAgICAgICAgaWYgKGZhbGxiYWNrKSByZXR1cm4gZmFsbGJhY2s7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGlzdGJveEZyb21JbnB1dChpbnB1dCkge1xyXG4gICAgaWYgKCFpbnB1dCkgcmV0dXJuIG51bGw7XHJcbiAgICBjb25zdCBpZCA9IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycpIHx8IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1vd25zJyk7XHJcbiAgICBpZiAoaWQpIHtcclxuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcclxuICAgICAgICBpZiAoZWwpIHJldHVybiBlbDtcclxuICAgIH1cclxuICAgIGNvbnN0IGFjdGl2ZUlkID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnKTtcclxuICAgIGlmIChhY3RpdmVJZCkge1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZUlkKTtcclxuICAgICAgICBjb25zdCBsaXN0ID0gYWN0aXZlPy5jbG9zZXN0Py4oJ1tyb2xlPVwibGlzdGJveFwiXScpO1xyXG4gICAgICAgIGlmIChsaXN0KSByZXR1cm4gbGlzdDtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZENvbWJvQm94QnV0dG9uKGVsZW1lbnQpIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnLmxvb2t1cEJ1dHRvbicsXHJcbiAgICAgICAgJy5jb21ib0JveC1idXR0b24nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtZHJvcERvd25CdXR0b24nLFxyXG4gICAgICAgICcuZHJvcGRvd25CdXR0b24nLFxyXG4gICAgICAgICdbZGF0YS1keW4tcm9sZT1cIkRyb3BEb3duQnV0dG9uXCJdJyxcclxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwiT3BlblwiXScsXHJcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIlNlbGVjdFwiXSdcclxuICAgIF07XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGJ0biA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGJ0bikgcmV0dXJuIGJ0bjtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAnKSB8fCBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuIG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGJ0biA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoYnRuKSByZXR1cm4gYnRuO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0Q29tYm9PcHRpb25zKGxpc3Rib3gpIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnW3JvbGU9XCJvcHRpb25cIl0nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtbGlzdEl0ZW0nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtaXRlbScsXHJcbiAgICAgICAgJ2xpJyxcclxuICAgICAgICAnLmRyb3Bkb3duLWxpc3QtaXRlbScsXHJcbiAgICAgICAgJy5jb21ib0JveEl0ZW0nLFxyXG4gICAgICAgICcuZHJvcERvd25MaXN0SXRlbScsXHJcbiAgICAgICAgJy5kcm9wZG93bi1pdGVtJ1xyXG4gICAgXTtcclxuICAgIGNvbnN0IGZvdW5kID0gW107XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGxpc3Rib3gucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGlmIChpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKGVsKSkgZm91bmQucHVzaChlbCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm91bmQubGVuZ3RoID8gZm91bmQgOiBBcnJheS5mcm9tKGxpc3Rib3guY2hpbGRyZW4pLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgc2xlZXAsIHNldE5hdGl2ZVZhbHVlIH0gZnJvbSAnLi9hc3luYy5qcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHlwZVZhbHVlU2xvd2x5KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBpbnB1dC5jbGljayA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBUeXBlIGNoYXJhY3RlciBieSBjaGFyYWN0ZXJcclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGJ1ZmZlcik7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDgwKTsgLy8gODBtcyBwZXIgY2hhcmFjdGVyXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuYmx1cigpO1xyXG4gICAgYXdhaXQgc2xlZXAoODAwKTsgLy8gV2FpdCBmb3IgdmFsaWRhdGlvblxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHlwZVZhbHVlV2l0aElucHV0RXZlbnRzKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBpbnB1dC5jbGljayA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGlucHV0LmNsaWNrKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoODApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlID8/ICcnKTtcclxuICAgIGxldCBidWZmZXIgPSAnJztcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgYnVmZmVyICs9IGNoYXI7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGJ1ZmZlcik7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHsgZGF0YTogY2hhciwgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6IGNoYXIsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDYwKTtcclxuICAgIH1cclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9ySW5wdXRWYWx1ZShpbnB1dCwgdmFsdWUsIHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IGV4cGVjdGVkID0gU3RyaW5nKHZhbHVlID8/ICcnKS50cmltKCk7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudCA9IFN0cmluZyhpbnB1dD8udmFsdWUgPz8gJycpLnRyaW0oKTtcclxuICAgICAgICBpZiAoY3VycmVudCA9PT0gZXhwZWN0ZWQpIHJldHVybiB0cnVlO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRWYWx1ZU9uY2UoaW5wdXQsIHZhbHVlLCBjbGVhckZpcnN0ID0gZmFsc2UpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgaWYgKGNsZWFyRmlyc3QpIHtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBjb25zdCBleHBlY3RlZCA9IFN0cmluZyh2YWx1ZSA/PyAnJykudHJpbSgpO1xyXG4gICAgYXdhaXQgc2V0VmFsdWVPbmNlKGlucHV0LCB2YWx1ZSwgdHJ1ZSk7XHJcbiAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG4gICAgaWYgKFN0cmluZyhpbnB1dC52YWx1ZSA/PyAnJykudHJpbSgpICE9PSBleHBlY3RlZCkge1xyXG4gICAgICAgIGF3YWl0IHR5cGVWYWx1ZVNsb3dseShpbnB1dCwgZXhwZWN0ZWQpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT0gOCBDb21ib0JveCBJbnB1dCBNZXRob2RzID09PT09PT09PT09PVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCAxOiBCYXNpYyBzZXRWYWx1ZSAoZmFzdCBidXQgbWF5IG5vdCB0cmlnZ2VyIEQzNjUgZmlsdGVyaW5nKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QxKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCAyOiBQYXN0ZSBzaW11bGF0aW9uIHdpdGggSW5wdXRFdmVudFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QyKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQ2xlYXIgZmlyc3RcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBTaW11bGF0ZSBwYXN0ZVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2JlZm9yZWlucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydEZyb21QYXN0ZScsXHJcbiAgICAgICAgZGF0YTogdmFsdWVcclxuICAgIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMzogQ2hhcmFjdGVyLWJ5LWNoYXJhY3RlciB3aXRoIGZ1bGwga2V5IGV2ZW50cyAoUkVDT01NRU5ERUQpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBDbGVhciB0aGUgaW5wdXQgZmlyc3RcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBrZXlkb3duXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyLmNoYXJDb2RlQXQoMCksXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIEZpcmUgYmVmb3JlaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSB2YWx1ZVxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGlucHV0IGV2ZW50XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGtleXVwXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA0OiBDaGFyYWN0ZXItYnktY2hhcmFjdGVyIHdpdGgga2V5cHJlc3MgKGxlZ2FjeSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNChpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGNvbnN0IGNoYXJDb2RlID0gY2hhci5jaGFyQ29kZUF0KDApO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGJ1ZmZlcjtcclxuXHJcbiAgICAgICAgLy8ga2V5ZG93blxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8ga2V5cHJlc3MgKGRlcHJlY2F0ZWQgYnV0IHN0aWxsIHVzZWQgYnkgc29tZSBmcmFtZXdvcmtzKVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXByZXNzJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBjaGFyQ29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gYmVmb3JlaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSB2YWx1ZVxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICAvLyBpbnB1dFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8ga2V5dXBcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA1OiBleGVjQ29tbWFuZCBpbnNlcnRUZXh0XHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDUoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBTZWxlY3QgYWxsIGFuZCBkZWxldGVcclxuICAgIGlucHV0LnNlbGVjdCgpO1xyXG4gICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2RlbGV0ZScpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIEluc2VydCB0ZXh0XHJcbiAgICBkb2N1bWVudC5leGVjQ29tbWFuZCgnaW5zZXJ0VGV4dCcsIGZhbHNlLCB2YWx1ZSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA2OiBQYXN0ZSArIEJhY2tzcGFjZSB3b3JrYXJvdW5kXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDYoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBTZXQgdmFsdWUgZGlyZWN0bHkgKGxpa2UgcGFzdGUpXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICAvLyBBZGQgYSBjaGFyYWN0ZXIgYW5kIGRlbGV0ZSBpdCB0byB0cmlnZ2VyIGZpbHRlcmluZ1xyXG4gICAgY29uc3QgdmFsdWVXaXRoRXh0cmEgPSB2YWx1ZSArICdYJztcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZVdpdGhFeHRyYSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgIGRhdGE6ICdYJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBOb3cgZGVsZXRlIHRoYXQgY2hhcmFjdGVyIHdpdGggYSByZWFsIGJhY2tzcGFjZSBldmVudFxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHtcclxuICAgICAgICBrZXk6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGNvZGU6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGtleUNvZGU6IDgsXHJcbiAgICAgICAgd2hpY2g6IDgsXHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGlucHV0VHlwZTogJ2RlbGV0ZUNvbnRlbnRCYWNrd2FyZCdcclxuICAgIH0pKTtcclxuXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHtcclxuICAgICAgICBrZXk6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGNvZGU6ICdCYWNrc3BhY2UnLFxyXG4gICAgICAgIGtleUNvZGU6IDgsXHJcbiAgICAgICAgd2hpY2g6IDgsXHJcbiAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNzogRDM2NSBpbnRlcm5hbCBtZWNoYW5pc20gdHJpZ2dlclxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q3KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2V0IHZhbHVlIHdpdGggZnVsbCBldmVudCBzZXF1ZW5jZSB1c2VkIGJ5IEQzNjVcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFR5cGUgY2hhcmFjdGVyIGJ5IGNoYXJhY3RlciBidXQgYWxzbyBkaXNwYXRjaCBvbiB0aGUgcGFyZW50IGNvbnRyb2xcclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGNvbnN0IHBhcmVudCA9IGlucHV0LmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlXScpIHx8IGlucHV0LnBhcmVudEVsZW1lbnQ7XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBpbnB1dC52YWx1ZSArIGNoYXI7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBhIGNvbXByZWhlbnNpdmUgZXZlbnQgc2V0XHJcbiAgICAgICAgY29uc3Qga2V5Ym9hcmRFdmVudEluaXQgPSB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBjb21wb3NlZDogdHJ1ZSxcclxuICAgICAgICAgICAgdmlldzogd2luZG93XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBvbiBpbnB1dCBhbmQgcG90ZW50aWFsbHkgYnViYmxlIHRvIEQzNjUgaGFuZGxlcnNcclxuICAgICAgICBjb25zdCBrZXlkb3duRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIGtleWJvYXJkRXZlbnRJbml0KTtcclxuICAgICAgICBjb25zdCBrZXl1cEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywga2V5Ym9hcmRFdmVudEluaXQpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KGtleWRvd25FdmVudCk7XHJcblxyXG4gICAgICAgIC8vIFNldCB2YWx1ZSBCRUZPUkUgaW5wdXQgZXZlbnRcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyLFxyXG4gICAgICAgICAgICBjb21wb3NlZDogdHJ1ZSxcclxuICAgICAgICAgICAgdmlldzogd2luZG93XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KGtleXVwRXZlbnQpO1xyXG5cclxuICAgICAgICAvLyBBbHNvIGRpc3BhdGNoIG9uIHBhcmVudCBmb3IgRDM2NSBjb250cm9sc1xyXG4gICAgICAgIGlmIChwYXJlbnQgJiYgcGFyZW50ICE9PSBpbnB1dCkge1xyXG4gICAgICAgICAgICBwYXJlbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5hbCBjaGFuZ2UgZXZlbnRcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIC8vIFRyeSB0byB0cmlnZ2VyIEQzNjUncyBWYWx1ZUNoYW5nZWQgY29tbWFuZFxyXG4gICAgaWYgKHBhcmVudCkge1xyXG4gICAgICAgIHBhcmVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnVmFsdWVDaGFuZ2VkJywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBkZXRhaWw6IHsgdmFsdWU6IHZhbHVlIH1cclxuICAgICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE1ldGhvZCA4OiBDb21wb3NpdGlvbiBldmVudHMgKElNRS1zdHlsZSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kOChpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCAnJyk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gU3RhcnQgY29tcG9zaXRpb25cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoJ2NvbXBvc2l0aW9uc3RhcnQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgIGRhdGE6ICcnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGN1cnJlbnRWYWx1ZSA9ICcnO1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjdXJyZW50VmFsdWUgKz0gc3RyaW5nVmFsdWVbaV07XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoJ2NvbXBvc2l0aW9udXBkYXRlJywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBkYXRhOiBjdXJyZW50VmFsdWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBjdXJyZW50VmFsdWUpO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0Q29tcG9zaXRpb25UZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY3VycmVudFZhbHVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRW5kIGNvbXBvc2l0aW9uXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbmVuZCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tQ29tcG9zaXRpb24nLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcblxyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIHJldHVybiBpbnB1dC52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEhlbHBlciB0byBnZXQga2V5IGNvZGUgZnJvbSBjaGFyYWN0ZXJcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRLZXlDb2RlKGNoYXIpIHtcclxuICAgIGNvbnN0IHVwcGVyQ2hhciA9IGNoYXIudG9VcHBlckNhc2UoKTtcclxuICAgIGlmICh1cHBlckNoYXIgPj0gJ0EnICYmIHVwcGVyQ2hhciA8PSAnWicpIHtcclxuICAgICAgICByZXR1cm4gJ0tleScgKyB1cHBlckNoYXI7XHJcbiAgICB9XHJcbiAgICBpZiAoY2hhciA+PSAnMCcgJiYgY2hhciA8PSAnOScpIHtcclxuICAgICAgICByZXR1cm4gJ0RpZ2l0JyArIGNoYXI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBzcGVjaWFsS2V5cyA9IHtcclxuICAgICAgICAnICc6ICdTcGFjZScsXHJcbiAgICAgICAgJy0nOiAnTWludXMnLFxyXG4gICAgICAgICc9JzogJ0VxdWFsJyxcclxuICAgICAgICAnWyc6ICdCcmFja2V0TGVmdCcsXHJcbiAgICAgICAgJ10nOiAnQnJhY2tldFJpZ2h0JyxcclxuICAgICAgICAnXFxcXCc6ICdCYWNrc2xhc2gnLFxyXG4gICAgICAgICc7JzogJ1NlbWljb2xvbicsXHJcbiAgICAgICAgXCInXCI6ICdRdW90ZScsXHJcbiAgICAgICAgJywnOiAnQ29tbWEnLFxyXG4gICAgICAgICcuJzogJ1BlcmlvZCcsXHJcbiAgICAgICAgJy8nOiAnU2xhc2gnLFxyXG4gICAgICAgICdgJzogJ0JhY2txdW90ZSdcclxuICAgIH07XHJcbiAgICByZXR1cm4gc3BlY2lhbEtleXNbY2hhcl0gfHwgJ1VuaWRlbnRpZmllZCc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEaXNwYXRjaGVyIGZ1bmN0aW9uIC0gdXNlcyB0aGUgc2VsZWN0ZWQgaW5wdXQgbWV0aG9kIGZyb20gc2V0dGluZ3NcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgbWV0aG9kKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgW0QzNjVdIFVzaW5nIGNvbWJvYm94IGlucHV0IG1ldGhvZDogJHttZXRob2R9YCk7XHJcblxyXG4gICAgc3dpdGNoIChtZXRob2QpIHtcclxuICAgICAgICBjYXNlICdtZXRob2QxJzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QxKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kMic6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMihpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDMnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q0JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q0KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNSc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDYnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDYoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q3JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q3KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kOCc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kOChpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMyhpbnB1dCwgdmFsdWUpOyAvLyBEZWZhdWx0IHRvIG1ldGhvZCAzXHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb21taXRDb21ib1ZhbHVlKGlucHV0LCB2YWx1ZSwgZWxlbWVudCkge1xyXG4gICAgaWYgKCFpbnB1dCkgcmV0dXJuO1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnZm9jdXNvdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VzY2FwZScsIGNvZGU6ICdFc2NhcGUnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFc2NhcGUnLCBjb2RlOiAnRXNjYXBlJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5ibHVyKCk7XHJcbiAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB9XHJcbiAgICBkb2N1bWVudC5ib2R5Py5jbGljaz8uKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkaXNwYXRjaENsaWNrU2VxdWVuY2UodGFyZ2V0KSB7XHJcbiAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVydXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmNsaWNrKCk7XHJcbn1cclxuIiwgImV4cG9ydCBmdW5jdGlvbiBwYXJzZUdyaWRBbmRDb2x1bW4oY29udHJvbE5hbWUpIHtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKGNvbnRyb2xOYW1lIHx8ICcnKTtcbiAgICBjb25zdCBsYXN0VW5kZXJzY29yZUlkeCA9IHRleHQubGFzdEluZGV4T2YoJ18nKTtcbiAgICBpZiAobGFzdFVuZGVyc2NvcmVJZHggPD0gMCB8fCBsYXN0VW5kZXJzY29yZUlkeCA9PT0gdGV4dC5sZW5ndGggLSAxKSB7XG4gICAgICAgIHJldHVybiB7IGdyaWROYW1lOiB0ZXh0LCBjb2x1bW5OYW1lOiAnJyB9O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBncmlkTmFtZTogdGV4dC5zdWJzdHJpbmcoMCwgbGFzdFVuZGVyc2NvcmVJZHgpLFxuICAgICAgICBjb2x1bW5OYW1lOiB0ZXh0LnN1YnN0cmluZyhsYXN0VW5kZXJzY29yZUlkeCArIDEpXG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRmlsdGVyRmllbGRQYXR0ZXJucyhjb250cm9sTmFtZSwgZ3JpZE5hbWUsIGNvbHVtbk5hbWUpIHtcbiAgICByZXR1cm4gW1xuICAgICAgICBgRmlsdGVyRmllbGRfJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV8ke2NvbHVtbk5hbWV9X0lucHV0XzBgLFxuICAgICAgICBgRmlsdGVyRmllbGRfJHtjb250cm9sTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Y29udHJvbE5hbWV9X0lucHV0XzBgLFxuICAgICAgICBgRmlsdGVyRmllbGRfJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYCR7Y29udHJvbE5hbWV9X0ZpbHRlckZpZWxkX0lucHV0YCxcbiAgICAgICAgYCR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fRmlsdGVyRmllbGRgXG4gICAgXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQXBwbHlCdXR0b25QYXR0ZXJucyhjb250cm9sTmFtZSwgZ3JpZE5hbWUsIGNvbHVtbk5hbWUpIHtcbiAgICByZXR1cm4gW1xuICAgICAgICBgJHtncmlkTmFtZX1fJHtjb2x1bW5OYW1lfV9BcHBseUZpbHRlcnNgLFxuICAgICAgICBgJHtjb250cm9sTmFtZX1fQXBwbHlGaWx0ZXJzYCxcbiAgICAgICAgYCR7Z3JpZE5hbWV9X0FwcGx5RmlsdGVyc2AsXG4gICAgICAgICdBcHBseUZpbHRlcnMnXG4gICAgXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZpbHRlck1ldGhvZFNlYXJjaFRlcm1zKG1ldGhvZCkge1xuICAgIGNvbnN0IG1ldGhvZE1hcHBpbmdzID0ge1xuICAgICAgICAnaXMgZXhhY3RseSc6IFsnaXMgZXhhY3RseScsICdlcXVhbHMnLCAnaXMgZXF1YWwgdG8nLCAnPSddLFxuICAgICAgICBjb250YWluczogWydjb250YWlucycsICdsaWtlJ10sXG4gICAgICAgICdiZWdpbnMgd2l0aCc6IFsnYmVnaW5zIHdpdGgnLCAnc3RhcnRzIHdpdGgnXSxcbiAgICAgICAgJ2lzIG5vdCc6IFsnaXMgbm90JywgJ25vdCBlcXVhbCcsICchPScsICc8PiddLFxuICAgICAgICAnZG9lcyBub3QgY29udGFpbic6IFsnZG9lcyBub3QgY29udGFpbicsICdub3QgbGlrZSddLFxuICAgICAgICAnaXMgb25lIG9mJzogWydpcyBvbmUgb2YnLCAnaW4nXSxcbiAgICAgICAgYWZ0ZXI6IFsnYWZ0ZXInLCAnZ3JlYXRlciB0aGFuJywgJz4nXSxcbiAgICAgICAgYmVmb3JlOiBbJ2JlZm9yZScsICdsZXNzIHRoYW4nLCAnPCddLFxuICAgICAgICBtYXRjaGVzOiBbJ21hdGNoZXMnLCAncmVnZXgnLCAncGF0dGVybiddXG4gICAgfTtcbiAgICByZXR1cm4gbWV0aG9kTWFwcGluZ3NbbWV0aG9kXSB8fCBbU3RyaW5nKG1ldGhvZCB8fCAnJyldO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGV4dEluY2x1ZGVzQW55KHRleHQsIHRlcm1zKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFRleHQgPSBTdHJpbmcodGV4dCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICByZXR1cm4gKHRlcm1zIHx8IFtdKS5zb21lKHRlcm0gPT4gbm9ybWFsaXplZFRleHQuaW5jbHVkZXMoU3RyaW5nKHRlcm0gfHwgJycpLnRvTG93ZXJDYXNlKCkpKTtcbn1cbiIsICJpbXBvcnQgeyBsb2dTdGVwIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2luZy5qcyc7XHJcbmltcG9ydCB7IHNldE5hdGl2ZVZhbHVlLCBzbGVlcCB9IGZyb20gJy4uL3V0aWxzL2FzeW5jLmpzJztcclxuaW1wb3J0IHsgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsIGlzRWxlbWVudFZpc2libGUsIGlzRDM2NUxvYWRpbmcsIGlzRDM2NVByb2Nlc3NpbmdNZXNzYWdlLCBmaW5kR3JpZENlbGxFbGVtZW50LCBoYXNMb29rdXBCdXR0b24sIGZpbmRMb29rdXBCdXR0b24sIGZpbmRMb29rdXBGaWx0ZXJJbnB1dCwgZ2V0R3JpZFJvd0NvdW50LCBnZXRHcmlkU2VsZWN0ZWRSb3cgfSBmcm9tICcuLi91dGlscy9kb20uanMnO1xyXG5pbXBvcnQgeyB3YWl0Rm9yTG9va3VwUG9wdXAsIHdhaXRGb3JMb29rdXBSb3dzLCB3YWl0Rm9yTG9va3VwRG9ja0ZvckVsZW1lbnQsIHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQsIGNvbGxlY3RDb21ib09wdGlvbnMsIGZpbmRDb21ib0JveEJ1dHRvbiB9IGZyb20gJy4uL3V0aWxzL2xvb2t1cC5qcyc7XHJcbmltcG9ydCB7IHR5cGVWYWx1ZVNsb3dseSwgdHlwZVZhbHVlV2l0aElucHV0RXZlbnRzLCB3YWl0Rm9ySW5wdXRWYWx1ZSwgc2V0VmFsdWVPbmNlLCBzZXRWYWx1ZVdpdGhWZXJpZnksIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QgYXMgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZFdpdGhNb2RlLCBjb21taXRDb21ib1ZhbHVlLCBkaXNwYXRjaENsaWNrU2VxdWVuY2UgfSBmcm9tICcuLi91dGlscy9jb21ib2JveC5qcyc7XHJcbmltcG9ydCB7IGNvZXJjZUJvb2xlYW4sIG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuLi91dGlscy90ZXh0LmpzJztcclxuaW1wb3J0IHsgTmF2aWdhdGlvbkludGVycnVwdEVycm9yIH0gZnJvbSAnLi4vcnVudGltZS9lcnJvcnMuanMnO1xyXG5pbXBvcnQgeyBnZXRXb3JrZmxvd1RpbWluZ3MgfSBmcm9tICcuLi9ydW50aW1lL3RpbWluZy5qcyc7XHJcbmltcG9ydCB7IHBhcnNlR3JpZEFuZENvbHVtbiwgYnVpbGRGaWx0ZXJGaWVsZFBhdHRlcm5zLCBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMsIGdldEZpbHRlck1ldGhvZFNlYXJjaFRlcm1zLCB0ZXh0SW5jbHVkZXNBbnkgfSBmcm9tICcuL2FjdGlvbi1oZWxwZXJzLmpzJztcclxuXHJcbmZ1bmN0aW9uIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGNvbnN0IG1ldGhvZCA9IGNvbWJvTWV0aG9kT3ZlcnJpZGUgfHwgd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uY29tYm9TZWxlY3RNb2RlIHx8ICdtZXRob2QzJztcclxuICAgIHJldHVybiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUoaW5wdXQsIHZhbHVlLCBtZXRob2QpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRUaW1pbmdzKCkge1xyXG4gICAgcmV0dXJuIGdldFdvcmtmbG93VGltaW5ncyh3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzIHx8IHt9KTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvclRpbWluZyhrZXkpIHtcclxuICAgIGF3YWl0IHNsZWVwKGdldFRpbWluZ3MoKVtrZXldKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSB7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ1NlZ21lbnRlZEVudHJ5JykgcmV0dXJuIHRydWU7XHJcbiAgICBpZiAoZWxlbWVudC5jbG9zZXN0Py4oJ1tkYXRhLWR5bi1yb2xlPVwiU2VnbWVudGVkRW50cnlcIl0nKSkgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgY29uc3QgY2xhc3NMaXN0ID0gZWxlbWVudC5jbGFzc0xpc3Q7XHJcbiAgICBpZiAoY2xhc3NMaXN0ICYmIChjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZEVudHJ5JykgfHxcclxuICAgICAgICBjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZC1lbnRyeScpIHx8XHJcbiAgICAgICAgY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWdtZW50ZWRFbnRyeS1zZWdtZW50SW5wdXQnKSkpIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gISFlbGVtZW50LnF1ZXJ5U2VsZWN0b3I/LignLnNlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCwgLnNlZ21lbnRlZEVudHJ5LWZseW91dFNlZ21lbnQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsaWNrRWxlbWVudChjb250cm9sTmFtZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBEZXRlY3QgaWYgdGhpcyBpcyBhbiBcIkFkZCBsaW5lXCIgLyBcIk5ld1wiIGJ1dHRvbiBjbGljayBvbiBhIGdyaWQuXHJcbiAgICAvLyBJZiBzbywgd2UgcmVjb3JkIHRoZSByb3cgY291bnQgYmVmb3JlIGNsaWNraW5nIHNvIHdlIGNhbiB3YWl0IGZvclxyXG4gICAgLy8gdGhlIG5ldyByb3cgdG8gYWN0dWFsbHkgYXBwZWFyIGFuZCBiZWNvbWUgc2VsZWN0ZWQgYWZ0ZXJ3YXJkcy5cclxuICAgIGNvbnN0IGlzQWRkTGluZUNsaWNrID0gaXNHcmlkQWRkTGluZUJ1dHRvbihjb250cm9sTmFtZSwgZWxlbWVudCk7XHJcbiAgICBsZXQgcm93Q291bnRCZWZvcmUgPSAwO1xyXG4gICAgbGV0IHNlbGVjdGVkUm93QmVmb3JlID0gbnVsbDtcclxuICAgIGlmIChpc0FkZExpbmVDbGljaykge1xyXG4gICAgICAgIHJvd0NvdW50QmVmb3JlID0gZ2V0R3JpZFJvd0NvdW50KCk7XHJcbiAgICAgICAgc2VsZWN0ZWRSb3dCZWZvcmUgPSBnZXRHcmlkU2VsZWN0ZWRSb3coKTtcclxuICAgICAgICBsb2dTdGVwKGBBZGQtbGluZSBkZXRlY3RlZCAoXCIke2NvbnRyb2xOYW1lfVwiKS4gUm93cyBiZWZvcmU6ICR7cm93Q291bnRCZWZvcmV9LCBgICtcclxuICAgICAgICAgICAgICAgIGBzZWxlY3RlZCByb3cgaW5kZXg6ICR7c2VsZWN0ZWRSb3dCZWZvcmU/LnJvd0luZGV4ID8/ICdub25lJ31gKTtcclxuICAgIH1cclxuXHJcbiAgICBlbGVtZW50LmNsaWNrKCk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdDTElDS19BTklNQVRJT05fREVMQVknKTtcclxuXHJcbiAgICAvLyBBZnRlciB0aGUgZml4ZWQgZGVsYXksIHBvbGwgYnJpZWZseSB3aGlsZSBEMzY1IGlzIHN0aWxsIGxvYWRpbmcuXHJcbiAgICAvLyBUaGlzIHByZXZlbnRzIHRoZSBzdGVwIGZyb20gY29tcGxldGluZyBiZWZvcmUgYSBzZXJ2ZXItdHJpZ2dlcmVkXHJcbiAgICAvLyBkaWFsb2cgKGUuZy4gZGVsZXRlIGNvbmZpcm1hdGlvbikgaGFzIGJlZW4gcmVuZGVyZWQgaW50byB0aGUgRE9NLlxyXG4gICAgY29uc3QgbWF4TG9hZGluZ1BvbGxzID0gMjA7ICAgICAgICAgICAvLyB1cCB0byB+MiBzIGFkZGl0aW9uYWwgd2FpdFxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXhMb2FkaW5nUG9sbHM7IGkrKykge1xyXG4gICAgICAgIGlmICghaXNEMzY1TG9hZGluZygpKSBicmVhaztcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFdhaXQgZm9yIFwiUGxlYXNlIHdhaXQuIFdlJ3JlIHByb2Nlc3NpbmcgeW91ciByZXF1ZXN0LlwiIG1lc3NhZ2VzLlxyXG4gICAgLy8gRDM2NSBzaG93cyB0aGVzZSBkdXJpbmcgc2VydmVyLXNpZGUgb3BlcmF0aW9ucyAoZS5nLiBhZnRlciBjbGlja2luZyBPS1xyXG4gICAgLy8gb24gdGhlIENyZWF0ZSBTYWxlcyBPcmRlciBkaWFsb2cpLiAgV2UgcG9sbCB3aXRoIGEgZ2VuZXJvdXMgdGltZW91dFxyXG4gICAgLy8gc2luY2UgdGhlc2Ugb3BlcmF0aW9ucyBjYW4gdGFrZSAzMCsgc2Vjb25kcy5cclxuICAgIGlmIChpc0QzNjVQcm9jZXNzaW5nTWVzc2FnZSgpKSB7XHJcbiAgICAgICAgbG9nU3RlcChgUHJvY2Vzc2luZyBtZXNzYWdlIGRldGVjdGVkIGFmdGVyIGNsaWNraW5nIFwiJHtjb250cm9sTmFtZX1cIi4gV2FpdGluZyBmb3IgaXQgdG8gY2xlYXIuLi5gKTtcclxuICAgICAgICBjb25zdCBwcm9jZXNzaW5nU3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgICAgIGNvbnN0IG1heFByb2Nlc3NpbmdXYWl0ID0gMTIwMDAwOyAvLyB1cCB0byAyIG1pbnV0ZXMgZm9yIGhlYXZ5IG9wZXJhdGlvbnNcclxuICAgICAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHByb2Nlc3NpbmdTdGFydCA8IG1heFByb2Nlc3NpbmdXYWl0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgICAgIGlmICghaXNEMzY1UHJvY2Vzc2luZ01lc3NhZ2UoKSAmJiAhaXNEMzY1TG9hZGluZygpKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBFeHRyYSBzdGFiaWxpc2F0aW9uOiBEMzY1IG1heSBmbGFzaCBuZXcgVUkgZWxlbWVudHNcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzRDM2NVByb2Nlc3NpbmdNZXNzYWdlKCkgJiYgIWlzRDM2NUxvYWRpbmcoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYFByb2Nlc3NpbmcgbWVzc2FnZSBjbGVhcmVkIGFmdGVyICR7TWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIHByb2Nlc3NpbmdTdGFydCkgLyAxMDAwKX1zYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGlzRDM2NVByb2Nlc3NpbmdNZXNzYWdlKCkpIHtcclxuICAgICAgICAgICAgbG9nU3RlcChgV2FybmluZzogUHJvY2Vzc2luZyBtZXNzYWdlIHN0aWxsIHZpc2libGUgYWZ0ZXIgJHttYXhQcm9jZXNzaW5nV2FpdCAvIDEwMDB9c2ApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgXCJBZGQgbGluZVwiIGNsaWNrcywgd2FpdCB1bnRpbCB0aGUgbmV3IHJvdyBhY3R1YWxseSBhcHBlYXJzIGluXHJcbiAgICAvLyB0aGUgRE9NIGFuZCBpcyBtYXJrZWQgYXMgc2VsZWN0ZWQvYWN0aXZlLiAgVGhpcyBjbG9zZXMgdGhlIHJhY2VcclxuICAgIC8vIGNvbmRpdGlvbiB3aGVyZSBgc2V0R3JpZENlbGxWYWx1ZWAgd291bGQgdGFyZ2V0IHRoZSBvbGQgcm93LlxyXG4gICAgaWYgKGlzQWRkTGluZUNsaWNrKSB7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvck5ld0dyaWRSb3cocm93Q291bnRCZWZvcmUsIHNlbGVjdGVkUm93QmVmb3JlLCA4MDAwKTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIERldGVjdCB3aGV0aGVyIGEgY29udHJvbE5hbWUgLyBlbGVtZW50IHJlcHJlc2VudHMgYSBncmlkIFwiQWRkIGxpbmVcIiBvclxyXG4gKiBcIk5ld1wiIGJ1dHRvbi4gIENoZWNrcyBib3RoIHRoZSBjb250cm9sIG5hbWUgYW5kIHRoZSBlbGVtZW50J3MgbGFiZWwvdGV4dC5cclxuICovXHJcbmZ1bmN0aW9uIGlzR3JpZEFkZExpbmVCdXR0b24oY29udHJvbE5hbWUsIGVsZW1lbnQpIHtcclxuICAgIGNvbnN0IG5hbWUgPSAoY29udHJvbE5hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAvLyBDb21tb24gRDM2NSBjb250cm9sIG5hbWVzIGZvciBhZGQtbGluZSBidXR0b25zXHJcbiAgICBjb25zdCBhZGRMaW5lTmFtZXMgPSBbXHJcbiAgICAgICAgJ3N5c3RlbWRlZmluZWRuZXdidXR0b24nLCAnbGluZXN0cmlwbmV3JywgJ25ld2xpbmUnLFxyXG4gICAgICAgICdhZGRsaW5lJywgJ2FkZF9saW5lJywgJ2dyaWRhZGRuZXcnLCAnYnV0dG9uY3JlYXRlJyxcclxuICAgICAgICAnbmV3YnV0dG9uJywgJ3N5c3RlbWRlZmluZWRhZGRidXR0b24nXHJcbiAgICBdO1xyXG4gICAgaWYgKGFkZExpbmVOYW1lcy5zb21lKG4gPT4gbmFtZS5pbmNsdWRlcyhuKSkpIHJldHVybiB0cnVlO1xyXG5cclxuICAgIC8vIENoZWNrIHZpc2libGUgbGFiZWwgLyBhcmlhLWxhYmVsXHJcbiAgICBjb25zdCBsYWJlbCA9IChlbGVtZW50Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBjb25zdCBhcmlhTGFiZWwgPSAoZWxlbWVudD8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBjb25zdCBjb21iaW5lZCA9IGAke2xhYmVsfSAke2FyaWFMYWJlbH1gO1xyXG4gICAgaWYgKC9cXGJhZGRcXHMqbGluZVxcYi8udGVzdChjb21iaW5lZCkgfHwgL1xcYm5ld1xccypsaW5lXFxiLy50ZXN0KGNvbWJpbmVkKSB8fFxyXG4gICAgICAgIC9cXCtcXHMqYWRkXFxzKmxpbmUvaS50ZXN0KGNvbWJpbmVkKSkge1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGlmIGVsZW1lbnQgaXMgaW5zaWRlIGEgZ3JpZCB0b29sYmFyIGFyZWFcclxuICAgIGNvbnN0IHRvb2xiYXIgPSBlbGVtZW50Py5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkFjdGlvblBhbmVcIl0sIFtyb2xlPVwidG9vbGJhclwiXSwgLmJ1dHRvblN0cmlwJyk7XHJcbiAgICBpZiAodG9vbGJhciAmJiAvXFxibmV3XFxiL2kudGVzdChjb21iaW5lZCkpIHJldHVybiB0cnVlO1xyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEFmdGVyIGNsaWNraW5nIGFuIFwiQWRkIGxpbmVcIiBidXR0b24sIHdhaXQgZm9yIHRoZSBncmlkIHRvIHJlZmxlY3QgdGhlXHJcbiAqIG5ldyByb3cuICBXZSByZXF1aXJlOlxyXG4gKiAgIDEuIFRoZSB2aXNpYmxlIHJvdyBjb3VudCBoYXMgaW5jcmVhc2VkLCBPUlxyXG4gKiAgIDIuIEEgZGlmZmVyZW50IHJvdyBpcyBub3cgc2VsZWN0ZWQgKGl0cyBpbmRleCBjaGFuZ2VkKSwgQU5EXHJcbiAqICAgMy4gVGhlIG5ld2x5IHNlbGVjdGVkIHJvdyBpcyBOT1QgdGhlIHNhbWUgcm93IHRoYXQgd2FzIHNlbGVjdGVkIGJlZm9yZS5cclxuICpcclxuICogV2UgYWxzbyBzdG9yZSBhIG1hcmtlciBvbiBgd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93YCBzbyB0aGF0XHJcbiAqIGBmaW5kR3JpZENlbGxFbGVtZW50YCBjYW4gcHJlZmVyIHRoZSBjb3JyZWN0IHJvdyBpZiB0aGUgYGFyaWEtc2VsZWN0ZWRgXHJcbiAqIGF0dHJpYnV0ZSBoYXNuJ3QgZmxpcHBlZCB5ZXQuXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yTmV3R3JpZFJvdyhyb3dDb3VudEJlZm9yZSwgc2VsZWN0ZWRSb3dCZWZvcmUsIHRpbWVvdXQgPSA4MDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCBwcmV2SWR4ID0gc2VsZWN0ZWRSb3dCZWZvcmU/LnJvd0luZGV4ID8/IC0xO1xyXG4gICAgbGV0IHNldHRsZWQgPSBmYWxzZTtcclxuXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dCkge1xyXG4gICAgICAgIC8vIFdhaXQgZm9yIGxvYWRpbmcgdG8gY29tcGxldGUgZmlyc3RcclxuICAgICAgICBpZiAoaXNEMzY1TG9hZGluZygpKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudENvdW50ID0gZ2V0R3JpZFJvd0NvdW50KCk7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFNlbGVjdGVkID0gZ2V0R3JpZFNlbGVjdGVkUm93KCk7XHJcbiAgICAgICAgY29uc3QgY3VySWR4ID0gY3VycmVudFNlbGVjdGVkPy5yb3dJbmRleCA/PyAtMTtcclxuXHJcbiAgICAgICAgLy8gU3VjY2VzcyBjb25kaXRpb25zOlxyXG4gICAgICAgIC8vICAgYSkgUm93IGNvdW50IHdlbnQgdXAgQU5EIGEgcm93IGlzIG5vdyBzZWxlY3RlZFxyXG4gICAgICAgIC8vICAgYikgQSByb3cgaXMgc2VsZWN0ZWQgQU5EIGl0cyBpbmRleCBpcyBoaWdoZXIgdGhhbiB0aGUgb2xkIG9uZVxyXG4gICAgICAgIC8vICAgICAgKGhhbmRsZXMgY2FzZXMgd2hlcmUgRE9NIHJvdyBjb3VudCBzdGF5cyB0aGUgc2FtZSBkdWUgdG9cclxuICAgICAgICAvLyAgICAgICB2aXJ0dWFsaXNhdGlvbiBidXQgRDM2NSBtb3ZlZCB0aGUgc2VsZWN0aW9uIHRvIGEgbmV3IHJvdylcclxuICAgICAgICBjb25zdCByb3dDb3VudEluY3JlYXNlZCA9IGN1cnJlbnRDb3VudCA+IHJvd0NvdW50QmVmb3JlO1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdGlvbkNoYW5nZWRUb05ld2VyUm93ID0gY3VySWR4ID49IDAgJiYgY3VySWR4ICE9PSBwcmV2SWR4ICYmIGN1cklkeCA+PSBwcmV2SWR4O1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdGlvbkV4aXN0cyA9IGN1cklkeCA+PSAwO1xyXG5cclxuICAgICAgICBpZiAoKHJvd0NvdW50SW5jcmVhc2VkICYmIHNlbGVjdGlvbkV4aXN0cykgfHwgc2VsZWN0aW9uQ2hhbmdlZFRvTmV3ZXJSb3cpIHtcclxuICAgICAgICAgICAgLy8gRXh0cmEgc3RhYmlsaXNhdGlvbjogd2FpdCBhIHNob3J0IHBlcmlvZCBhbmQgdmVyaWZ5IHRoZSBzZWxlY3Rpb24gaXMgc3RhYmxlXHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDE1MCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHZlcmlmeVNlbGVjdGVkID0gZ2V0R3JpZFNlbGVjdGVkUm93KCk7XHJcbiAgICAgICAgICAgIGlmICh2ZXJpZnlTZWxlY3RlZCAmJiB2ZXJpZnlTZWxlY3RlZC5yb3dJbmRleCA9PT0gY3VySWR4KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTdG9yZSB0aGlzIHJvdyBlbGVtZW50IHNvIGZpbmRHcmlkQ2VsbEVsZW1lbnQgY2FuIHVzZSBpdFxyXG4gICAgICAgICAgICAgICAgd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93ID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJvd0VsZW1lbnQ6IGN1cnJlbnRTZWxlY3RlZC5yb3csXHJcbiAgICAgICAgICAgICAgICAgICAgcm93SW5kZXg6IGN1cklkeCxcclxuICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBsb2dTdGVwKGBOZXcgZ3JpZCByb3cgY29uZmlybWVkLiBSb3dzOiAke3Jvd0NvdW50QmVmb3JlfSAtPiAke2N1cnJlbnRDb3VudH0sIGAgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBgc2VsZWN0ZWQgcm93OiAke3ByZXZJZHh9IC0+ICR7Y3VySWR4fWApO1xyXG4gICAgICAgICAgICAgICAgc2V0dGxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTIwKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXNldHRsZWQpIHtcclxuICAgICAgICAvLyBFdmVuIGlmIHdlIHRpbWVkIG91dCwgdHJ5IHRvIG1hcmsgdGhlIGxhc3QgdmlzaWJsZSByb3cgYXMgcGVuZGluZ1xyXG4gICAgICAgIC8vIHNvIGZpbmRHcmlkQ2VsbEVsZW1lbnQgaGFzIGEgYmV0dGVyIGZhbGxiYWNrLlxyXG4gICAgICAgIGNvbnN0IGxhc3RTZWxlY3RlZCA9IGdldEdyaWRTZWxlY3RlZFJvdygpO1xyXG4gICAgICAgIGlmIChsYXN0U2VsZWN0ZWQpIHtcclxuICAgICAgICAgICAgd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93ID0ge1xyXG4gICAgICAgICAgICAgICAgcm93RWxlbWVudDogbGFzdFNlbGVjdGVkLnJvdyxcclxuICAgICAgICAgICAgICAgIHJvd0luZGV4OiBsYXN0U2VsZWN0ZWQucm93SW5kZXgsXHJcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogd2FpdEZvck5ld0dyaWRSb3cgdGltZWQgb3V0IGFmdGVyICR7dGltZW91dH1tcy4gYCArXHJcbiAgICAgICAgICAgICAgICBgUm93czogJHtyb3dDb3VudEJlZm9yZX0gLT4gJHtnZXRHcmlkUm93Q291bnQoKX0sIGAgK1xyXG4gICAgICAgICAgICAgICAgYHNlbGVjdGVkOiAke3ByZXZJZHh9IC0+ICR7bGFzdFNlbGVjdGVkPy5yb3dJbmRleCA/PyAnbm9uZSd9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseUdyaWRGaWx0ZXIoY29udHJvbE5hbWUsIGZpbHRlclZhbHVlLCBmaWx0ZXJNZXRob2QgPSAnaXMgZXhhY3RseScsIGNvbWJvTWV0aG9kT3ZlcnJpZGUgPSAnJykge1xyXG4gICAgXHJcbiAgICAvLyBFeHRyYWN0IGdyaWQgbmFtZSBhbmQgY29sdW1uIG5hbWUgZnJvbSBjb250cm9sTmFtZVxyXG4gICAgLy8gRm9ybWF0OiBHcmlkTmFtZV9Db2x1bW5OYW1lIChlLmcuLCBcIkdyaWRSZWFkT25seU1hcmt1cFRhYmxlX01hcmt1cENvZGVcIilcclxuICAgIGNvbnN0IHsgZ3JpZE5hbWUsIGNvbHVtbk5hbWUgfSA9IHBhcnNlR3JpZEFuZENvbHVtbihjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIFxyXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGZpbmQgZmlsdGVyIGlucHV0IHdpdGggbXVsdGlwbGUgcGF0dGVybnNcclxuICAgIGFzeW5jIGZ1bmN0aW9uIGZpbmRGaWx0ZXJJbnB1dCgpIHtcclxuICAgICAgICAvLyBEMzY1IGNyZWF0ZXMgZmlsdGVyIGlucHV0cyB3aXRoIHZhcmlvdXMgcGF0dGVybnNcclxuICAgICAgICBjb25zdCBmaWx0ZXJGaWVsZFBhdHRlcm5zID0gYnVpbGRGaWx0ZXJGaWVsZFBhdHRlcm5zKGNvbnRyb2xOYW1lLCBncmlkTmFtZSwgY29sdW1uTmFtZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IGZpbHRlcklucHV0ID0gbnVsbDtcclxuICAgICAgICBsZXQgZmlsdGVyRmllbGRDb250YWluZXIgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBleGFjdCBwYXR0ZXJucyBmaXJzdFxyXG4gICAgICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBmaWx0ZXJGaWVsZFBhdHRlcm5zKSB7XHJcbiAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtwYXR0ZXJufVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVyRmllbGRDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGZpbHRlcklucHV0ID0gZmlsdGVyRmllbGRDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHBhcnRpYWwgbWF0Y2ggb24gRmlsdGVyRmllbGQgY29udGFpbmluZyB0aGUgY29sdW1uIG5hbWVcclxuICAgICAgICBjb25zdCBwYXJ0aWFsTWF0Y2hlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXVtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCIke2NvbHVtbk5hbWV9XCJdYCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBjb250YWluZXIgb2YgcGFydGlhbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQgJiYgZmlsdGVySW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXI6IGNvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBGaW5kIGFueSB2aXNpYmxlIGZpbHRlciBpbnB1dCBpbiBmaWx0ZXIgZHJvcGRvd24vZmx5b3V0IGFyZWFcclxuICAgICAgICAvLyBMb29rIGZvciBpbnB1dHMgaW5zaWRlIGZpbHRlci1yZWxhdGVkIGNvbnRhaW5lcnNcclxuICAgICAgICBjb25zdCBmaWx0ZXJDb250YWluZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmR5bi1maWx0ZXItcG9wdXAsIC5maWx0ZXItcGFuZWwsIFtkYXRhLWR5bi1yb2xlPVwiRmlsdGVyUGFuZVwiXSwgW2NsYXNzKj1cImZpbHRlclwiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIGZpbHRlckNvbnRhaW5lcnMpIHtcclxuICAgICAgICAgICAgZmlsdGVySW5wdXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKTpub3QoW3JlYWRvbmx5XSknKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBjb250YWluZXIgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBMYXN0IHJlc29ydDogQW55IHZpc2libGUgRmlsdGVyRmllbGQgaW5wdXRcclxuICAgICAgICBjb25zdCB2aXNpYmxlRmlsdGVySW5wdXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkZpbHRlckZpZWxkXCJdIGlucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGlucCBvZiB2aXNpYmxlRmlsdGVySW5wdXRzKSB7XHJcbiAgICAgICAgICAgIGlmIChpbnAub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lciA9IGlucC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl0nKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0OiBpbnAsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQ6IG51bGwsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBudWxsIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZpcnN0LCBjaGVjayBpZiB0aGUgZmlsdGVyIHBhbmVsIGlzIGFscmVhZHkgb3BlblxyXG4gICAgbGV0IHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH0gPSBhd2FpdCBmaW5kRmlsdGVySW5wdXQoKTtcclxuICAgIFxyXG4gICAgLy8gSWYgZmlsdGVyIGlucHV0IG5vdCBmb3VuZCwgd2UgbmVlZCB0byBjbGljayB0aGUgY29sdW1uIGhlYWRlciB0byBvcGVuIHRoZSBmaWx0ZXIgZHJvcGRvd25cclxuICAgIGlmICghZmlsdGVySW5wdXQpIHtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaW5kIHRoZSBhY3R1YWwgaGVhZGVyIGNlbGxcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBsZXQgY2xpY2tUYXJnZXQgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGlmIChoLmNsYXNzTGlzdC5jb250YWlucygnZHluLWhlYWRlckNlbGwnKSB8fCBcclxuICAgICAgICAgICAgICAgIGguaWQ/LmluY2x1ZGVzKCdoZWFkZXInKSB8fFxyXG4gICAgICAgICAgICAgICAgaC5jbG9zZXN0KCcuZHluLWhlYWRlckNlbGwnKSB8fFxyXG4gICAgICAgICAgICAgICAgaC5jbG9zZXN0KCdbcm9sZT1cImNvbHVtbmhlYWRlclwiXScpKSB7XHJcbiAgICAgICAgICAgICAgICBjbGlja1RhcmdldCA9IGg7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgYnkgSUQgcGF0dGVyblxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbaWQqPVwiJHtjb250cm9sTmFtZX1cIl1baWQqPVwiaGVhZGVyXCJdYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGZpcnN0IGVsZW1lbnQgd2l0aCBjb250cm9sTmFtZVxyXG4gICAgICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmlsdGVyIGNvbHVtbiBoZWFkZXIgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0NMSUNLX0FOSU1BVElPTl9ERUxBWScpOyAvLyBXYWl0IGxvbmdlciBmb3IgZHJvcGRvd24gdG8gb3BlblxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJldHJ5IGZpbmRpbmcgdGhlIGZpbHRlciBpbnB1dCB3aXRoIGEgd2FpdCBsb29wXHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCAxMDsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgICAgICAgICh7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9ID0gYXdhaXQgZmluZEZpbHRlcklucHV0KCkpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQpIGJyZWFrO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghZmlsdGVySW5wdXQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZpbHRlciBpbnB1dCBub3QgZm91bmQuIE1ha2Ugc3VyZSB0aGUgZmlsdGVyIGRyb3Bkb3duIGlzIG9wZW4uIEV4cGVjdGVkIHBhdHRlcm46IEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNDogU2V0IHRoZSBmaWx0ZXIgbWV0aG9kIGlmIG5vdCBcImlzIGV4YWN0bHlcIiAoZGVmYXVsdClcclxuICAgIGlmIChmaWx0ZXJNZXRob2QgJiYgZmlsdGVyTWV0aG9kICE9PSAnaXMgZXhhY3RseScpIHtcclxuICAgICAgICBhd2FpdCBzZXRGaWx0ZXJNZXRob2QoZmlsdGVyRmllbGRDb250YWluZXIsIGZpbHRlck1ldGhvZCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0ZXAgNTogRW50ZXIgdGhlIGZpbHRlciB2YWx1ZVxyXG4gICAgZmlsdGVySW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOUFVUX1NFVFRMRV9ERUxBWScpO1xyXG4gICAgZmlsdGVySW5wdXQuc2VsZWN0KCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlIGZpcnN0XHJcbiAgICBmaWx0ZXJJbnB1dC52YWx1ZSA9ICcnO1xyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOUFVUX1NFVFRMRV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBUeXBlIHVzaW5nIHRoZSBzZWxlY3RlZCBtZXRob2Qgc28gdGhpcyBjYW4gYmUgb3ZlcnJpZGRlbiBwZXIgc3RlcC5cclxuICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoZmlsdGVySW5wdXQsIFN0cmluZyhmaWx0ZXJWYWx1ZSA/PyAnJyksIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgaWYgKG5vcm1hbGl6ZVRleHQoZmlsdGVySW5wdXQudmFsdWUpICE9PSBub3JtYWxpemVUZXh0KGZpbHRlclZhbHVlKSkge1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGZpbHRlcklucHV0LCBTdHJpbmcoZmlsdGVyVmFsdWUgPz8gJycpKTtcclxuICAgIH1cclxuICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBTdGVwIDY6IEFwcGx5IHRoZSBmaWx0ZXIgLSBmaW5kIGFuZCBjbGljayB0aGUgQXBwbHkgYnV0dG9uXHJcbiAgICAvLyBJTVBPUlRBTlQ6IFRoZSBwYXR0ZXJuIGlzIHtHcmlkTmFtZX1fe0NvbHVtbk5hbWV9X0FwcGx5RmlsdGVycywgbm90IGp1c3Qge0dyaWROYW1lfV9BcHBseUZpbHRlcnNcclxuICAgIGNvbnN0IGFwcGx5QnRuUGF0dGVybnMgPSBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKTtcclxuICAgIFxyXG4gICAgbGV0IGFwcGx5QnRuID0gbnVsbDtcclxuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBhcHBseUJ0blBhdHRlcm5zKSB7XHJcbiAgICAgICAgYXBwbHlCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke3BhdHRlcm59XCJdYCk7XHJcbiAgICAgICAgaWYgKGFwcGx5QnRuICYmIGFwcGx5QnRuLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZhbGxiYWNrOiBmaW5kIGFueSB2aXNpYmxlIEFwcGx5RmlsdGVycyBidXR0b25cclxuICAgIGlmICghYXBwbHlCdG4gfHwgYXBwbHlCdG4ub2Zmc2V0UGFyZW50ID09PSBudWxsKSB7XHJcbiAgICAgICAgY29uc3QgYWxsQXBwbHlCdG5zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lKj1cIkFwcGx5RmlsdGVyc1wiXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgYnRuIG9mIGFsbEFwcGx5QnRucykge1xyXG4gICAgICAgICAgICBpZiAoYnRuLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgYXBwbHlCdG4gPSBidG47XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGFwcGx5QnRuKSB7XHJcbiAgICAgICAgYXBwbHlCdG4uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdWQUxJREFUSU9OX1dBSVQnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHByZXNzaW5nIEVudGVyIGFzIGFsdGVybmF0aXZlXHJcbiAgICAgICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsgXHJcbiAgICAgICAgICAgIGtleTogJ0VudGVyJywga2V5Q29kZTogMTMsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBcclxuICAgICAgICAgICAga2V5OiAnRW50ZXInLCBrZXlDb2RlOiAxMywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSBcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVkFMSURBVElPTl9XQUlUJyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0VW50aWxDb25kaXRpb24oY29udHJvbE5hbWUsIGNvbmRpdGlvbiwgZXhwZWN0ZWRWYWx1ZSwgdGltZW91dCkge1xyXG4gICAgXHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgLy8gVHJhY2sgd2hldGhlciBEMzY1IGlzIGFjdGl2ZWx5IHByb2Nlc3NpbmcgXHUyMDEzIGlmIHNvIHdlIGV4dGVuZCB0aGUgZGVhZGxpbmVcclxuICAgIC8vIHNvIHRoYXQgXCJQbGVhc2Ugd2FpdFwiIG1lc3NhZ2VzIGRvbid0IGNhdXNlIHNwdXJpb3VzIHRpbWVvdXRzLlxyXG4gICAgbGV0IGVmZmVjdGl2ZVRpbWVvdXQgPSB0aW1lb3V0O1xyXG4gICAgXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IGVmZmVjdGl2ZVRpbWVvdXQpIHtcclxuICAgICAgICAvLyBJZiBEMzY1IGlzIHNob3dpbmcgYSBcIlBsZWFzZSB3YWl0XCIgcHJvY2Vzc2luZyBtZXNzYWdlLCBleHRlbmQgdGhlXHJcbiAgICAgICAgLy8gZGVhZGxpbmUgc28gd2UgZG9uJ3QgdGltZSBvdXQgZHVyaW5nIHNlcnZlci1zaWRlIG9wZXJhdGlvbnMuXHJcbiAgICAgICAgaWYgKGlzRDM2NUxvYWRpbmcoKSB8fCBpc0QzNjVQcm9jZXNzaW5nTWVzc2FnZSgpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVsYXBzZWQgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xyXG4gICAgICAgICAgICAvLyBFeHRlbmQgYnkgdXAgdG8gNjAgcyB0b3RhbCAob24gdG9wIG9mIG9yaWdpbmFsIHRpbWVvdXQpXHJcbiAgICAgICAgICAgIGlmIChlZmZlY3RpdmVUaW1lb3V0IC0gZWxhcHNlZCA8IDUwMDApIHtcclxuICAgICAgICAgICAgICAgIGVmZmVjdGl2ZVRpbWVvdXQgPSBNYXRoLm1pbihlbGFwc2VkICsgMTAwMDAsIHRpbWVvdXQgKyA2MDAwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgY29uZGl0aW9uTWV0ID0gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChjb25kaXRpb24pIHtcclxuICAgICAgICAgICAgY2FzZSAndmlzaWJsZSc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGV4aXN0cyBhbmQgaXMgdmlzaWJsZSAoaGFzIGxheW91dClcclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGVsZW1lbnQgJiYgZWxlbWVudC5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdoaWRkZW4nOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBkb2Vzbid0IGV4aXN0IG9yIGlzIG5vdCB2aXNpYmxlXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSAhZWxlbWVudCB8fCBlbGVtZW50Lm9mZnNldFBhcmVudCA9PT0gbnVsbCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgPT09ICdoaWRkZW4nIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkuZGlzcGxheSA9PT0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnZXhpc3RzJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGluIERPTVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCAhPT0gbnVsbDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ25vdC1leGlzdHMnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBkb2VzIG5vdCBleGlzdCBpbiBET01cclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGVsZW1lbnQgPT09IG51bGw7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdlbmFibGVkJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGFuZCBpcyBub3QgZGlzYWJsZWRcclxuICAgICAgICAgICAgICAgIGlmIChlbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBidXR0b24sIHNlbGVjdCwgdGV4dGFyZWEnKSB8fCBlbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9ICFpbnB1dC5kaXNhYmxlZCAmJiAhaW5wdXQuaGFzQXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdoYXMtdmFsdWUnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBoYXMgYSBzcGVjaWZpYyB2YWx1ZVxyXG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QnKSB8fCBlbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGlucHV0LnZhbHVlIHx8IGlucHV0LnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9IGN1cnJlbnRWYWx1ZS50cmltKCkgPT09IFN0cmluZyhleHBlY3RlZFZhbHVlKS50cmltKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvbmRpdGlvbk1ldCkge1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTsgLy8gU21hbGwgc3RhYmlsaXR5IGRlbGF5XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnSU5QVVRfU0VUVExFX0RFTEFZJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcihgVGltZW91dCB3YWl0aW5nIGZvciBcIiR7Y29udHJvbE5hbWV9XCIgdG8gYmUgJHtjb25kaXRpb259ICh3YWl0ZWQgJHt0aW1lb3V0fW1zKWApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0SW5wdXRWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGZpZWxkVHlwZSwgY29tYm9NZXRob2RPdmVycmlkZSA9ICcnKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIC8vIEZvciBTZWdtZW50ZWRFbnRyeSBmaWVsZHMgKEFjY291bnQsIGV0YyksIHVzZSBsb29rdXAgYnV0dG9uIGFwcHJvYWNoXHJcbiAgICBpZiAoZmllbGRUeXBlPy50eXBlID09PSAnc2VnbWVudGVkLWxvb2t1cCcgfHwgaXNTZWdtZW50ZWRFbnRyeShlbGVtZW50KSkge1xyXG4gICAgICAgIGF3YWl0IHNldFNlZ21lbnRlZEVudHJ5VmFsdWUoZWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgQ29tYm9Cb3gvZW51bSBmaWVsZHMsIG9wZW4gZHJvcGRvd24gYW5kIHNlbGVjdFxyXG4gICAgaWYgKGZpZWxkVHlwZT8uaW5wdXRUeXBlID09PSAnZW51bScgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0NvbWJvQm94Jykge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3IgUmFkaW9CdXR0b24vRnJhbWVPcHRpb25CdXR0b24gZ3JvdXBzLCBjbGljayB0aGUgY29ycmVjdCBvcHRpb25cclxuICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgaWYgKHJvbGUgPT09ICdSYWRpb0J1dHRvbicgfHwgcm9sZSA9PT0gJ0ZyYW1lT3B0aW9uQnV0dG9uJyB8fCBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwicmFkaW9cIl0sIGlucHV0W3R5cGU9XCJyYWRpb1wiXScpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0UmFkaW9CdXR0b25WYWx1ZShlbGVtZW50LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKGBJbnB1dCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgLy8gRm9jdXMgdGhlIGlucHV0IGZpcnN0XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnTUVESVVNX1NFVFRMRV9ERUxBWScpO1xyXG5cclxuICAgIGlmIChpbnB1dC50YWdOYW1lICE9PSAnU0VMRUNUJykge1xyXG4gICAgICAgIC8vIFVzZSB0aGUgc2VsZWN0ZWQgY29tYm9ib3ggaW5wdXQgbWV0aG9kXHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnUE9TVF9JTlBVVF9ERUxBWScpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0R3JpZENlbGxWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGZpZWxkVHlwZSwgd2FpdEZvclZhbGlkYXRpb24gPSBmYWxzZSwgY29tYm9NZXRob2RPdmVycmlkZSA9ICcnKSB7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIHRoZSBncmlkIHRvIGhhdmUgYW4gYWN0aXZlL3NlbGVjdGVkIHJvdyBiZWZvcmUgZmluZGluZyB0aGUgY2VsbC5cclxuICAgIC8vIEFmdGVyIFwiQWRkIGxpbmVcIiwgRDM2NSdzIFJlYWN0IGdyaWQgbWF5IHRha2UgYSBtb21lbnQgdG8gbWFyayB0aGUgbmV3IHJvd1xyXG4gICAgLy8gYXMgYWN0aXZlLiAgV2l0aG91dCB0aGlzIHdhaXQgdGhlIGZhbGxiYWNrIHNjYW4gaW4gZmluZEdyaWRDZWxsRWxlbWVudCBjYW5cclxuICAgIC8vIHJldHVybiBhIGNlbGwgZnJvbSBhIGRpZmZlcmVudCAoZWFybGllcikgcm93LCBjYXVzaW5nIGRhdGEgdG8gYmUgd3JpdHRlblxyXG4gICAgLy8gdG8gdGhlIHdyb25nIGxpbmUuXHJcbiAgICBhd2FpdCB3YWl0Rm9yQWN0aXZlR3JpZFJvdyhjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIGNlbGwgZWxlbWVudCAtIHByZWZlciB0aGUgb25lIGluIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3dcclxuICAgIGxldCBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIGlmICghZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBjbGlja2luZyBvbiB0aGUgZ3JpZCByb3cgZmlyc3QgdG8gYWN0aXZhdGUgaXRcclxuICAgICAgICBhd2FpdCBhY3RpdmF0ZUdyaWRSb3coY29udHJvbE5hbWUpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIGVsZW1lbnQgPSBmaW5kR3JpZENlbGxFbGVtZW50KGNvbnRyb2xOYW1lKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHcmlkIGNlbGwgZWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBSZWFjdCBGaXhlZERhdGFUYWJsZSBncmlkcywgd2UgbmVlZCB0byBjbGljayBvbiB0aGUgY2VsbCB0byBlbnRlciBlZGl0IG1vZGVcclxuICAgIC8vIEZpbmQgdGhlIGFjdHVhbCBjZWxsIGNvbnRhaW5lciAoZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4pXHJcbiAgICBjb25zdCByZWFjdENlbGwgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpIHx8IGVsZW1lbnQ7XHJcbiAgICBjb25zdCBpc1JlYWN0R3JpZCA9ICEhZWxlbWVudC5jbG9zZXN0KCcucmVhY3RHcmlkJyk7XHJcbiAgICBcclxuICAgIC8vIENsaWNrIG9uIHRoZSBjZWxsIHRvIGFjdGl2YXRlIGl0IGZvciBlZGl0aW5nXHJcbiAgICByZWFjdENlbGwuY2xpY2soKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBGb3IgUmVhY3QgZ3JpZHMsIEQzNjUgcmVuZGVycyBpbnB1dCBmaWVsZHMgZHluYW1pY2FsbHkgYWZ0ZXIgY2xpY2tpbmdcclxuICAgIC8vIFdlIG5lZWQgdG8gcmUtZmluZCB0aGUgZWxlbWVudCBhZnRlciBjbGlja2luZyBhcyBEMzY1IG1heSBoYXZlIHJlcGxhY2VkIHRoZSBET01cclxuICAgIGlmIChpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpOyAvLyBFeHRyYSB3YWl0IGZvciBSZWFjdCB0byByZW5kZXIgaW5wdXRcclxuICAgICAgICBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgaWYgKCFlbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgR3JpZCBjZWxsIGVsZW1lbnQgbm90IGZvdW5kIGFmdGVyIGNsaWNrOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGhlIGNsaWNrIHNob3VsZCBhY3RpdmF0ZSB0aGUgY2VsbCAtIG5vdyBmaW5kIHRoZSBpbnB1dFxyXG4gICAgbGV0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGlucHV0IGZvdW5kIGRpcmVjdGx5LCBsb29rIGluIHRoZSBjZWxsIGNvbnRhaW5lclxyXG4gICAgaWYgKCFpbnB1dCAmJiBpc1JlYWN0R3JpZCkge1xyXG4gICAgICAgIGNvbnN0IGNlbGxDb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbicpO1xyXG4gICAgICAgIGlmIChjZWxsQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGlucHV0ID0gY2VsbENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBJZiBubyBpbnB1dCBmb3VuZCBkaXJlY3RseSwgdHJ5IGdldHRpbmcgaXQgYWZ0ZXIgY2xpY2sgYWN0aXZhdGlvbiB3aXRoIHJldHJ5XHJcbiAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCA1OyBhdHRlbXB0KyspIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCAmJiBpbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQWxzbyBjaGVjayBpZiBhIG5ldyBpbnB1dCBhcHBlYXJlZCBpbiB0aGUgY2VsbFxyXG4gICAgICAgICAgICBjb25zdCBjZWxsQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKTtcclxuICAgICAgICAgICAgaWYgKGNlbGxDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGlucHV0ID0gY2VsbENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQgJiYgaW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU3RpbGwgbm8gaW5wdXQ/IENoZWNrIGlmIHRoZSBlbGVtZW50IGl0c2VsZiBpcyBhbiBpbnB1dFxyXG4gICAgaWYgKCFpbnB1dCAmJiAoZWxlbWVudC50YWdOYW1lID09PSAnSU5QVVQnIHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJyB8fCBlbGVtZW50LnRhZ05hbWUgPT09ICdTRUxFQ1QnKSkge1xyXG4gICAgICAgIGlucHV0ID0gZWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIGZpbmQgaW5wdXQgaW4gdGhlIHBhcmVudCByb3dcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICBjb25zdCByb3cgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluLCBbZGF0YS1keW4tcm9sZT1cIlJvd1wiXSwgW3JvbGU9XCJyb3dcIl0sIHRyJyk7XHJcbiAgICAgICAgaWYgKHJvdykge1xyXG4gICAgICAgICAgICBjb25zdCBwb3NzaWJsZUlucHV0cyA9IHJvdy5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSBpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSB0ZXh0YXJlYWApO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGlucCBvZiBwb3NzaWJsZUlucHV0cykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlucC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbnB1dCA9IGlucDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTGFzdCByZXNvcnQ6IGZpbmQgYW55IHZpc2libGUgaW5wdXQgaW4gdGhlIGFjdGl2ZSBjZWxsIGFyZWFcclxuICAgIGlmICghaW5wdXQgJiYgaXNSZWFjdEdyaWQpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVDZWxsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmR5bi1hY3RpdmVSb3dDZWxsLCAuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW46Zm9jdXMtd2l0aGluJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZUNlbGwpIHtcclxuICAgICAgICAgICAgaW5wdXQgPSBhY3RpdmVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYElucHV0IG5vdCBmb3VuZCBpbiBncmlkIGNlbGw6ICR7Y29udHJvbE5hbWV9LiBUaGUgY2VsbCBtYXkgbmVlZCB0byBiZSBjbGlja2VkIHRvIGJlY29tZSBlZGl0YWJsZS5gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGZpZWxkIHR5cGUgYW5kIHVzZSBhcHByb3ByaWF0ZSBzZXR0ZXJcclxuICAgIGNvbnN0IHJvbGUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xyXG4gICAgXHJcbiAgICBpZiAoZmllbGRUeXBlPy50eXBlID09PSAnc2VnbWVudGVkLWxvb2t1cCcgfHwgcm9sZSA9PT0gJ1NlZ21lbnRlZEVudHJ5JyB8fCBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZmllbGRUeXBlPy5pbnB1dFR5cGUgPT09ICdlbnVtJyB8fCByb2xlID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBmb3IgbG9va3VwIGZpZWxkc1xyXG4gICAgaWYgKHJvbGUgPT09ICdMb29rdXAnIHx8IHJvbGUgPT09ICdSZWZlcmVuY2VHcm91cCcgfHwgaGFzTG9va3VwQnV0dG9uKGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0TG9va3VwU2VsZWN0VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFN0YW5kYXJkIGlucHV0IC0gZm9jdXMgYW5kIHNldCB2YWx1ZVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOUFVUX1NFVFRMRV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBDbGVhciBleGlzdGluZyB2YWx1ZVxyXG4gICAgaW5wdXQuc2VsZWN0Py4oKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1FVSUNLX1JFVFJZX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIFVzZSB0aGUgc3RhbmRhcmQgaW5wdXQgbWV0aG9kXHJcbiAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIEZvciBncmlkIGNlbGxzLCB3ZSBuZWVkIHRvIHByb3Blcmx5IGNvbW1pdCB0aGUgdmFsdWVcclxuICAgIC8vIEQzNjUgUmVhY3QgZ3JpZHMgcmVxdWlyZSB0aGUgY2VsbCB0byBsb3NlIGZvY3VzIGZvciB2YWxpZGF0aW9uIHRvIG9jY3VyXHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAxOiBQcmVzcyBFbnRlciB0byBjb25maXJtIHRoZSB2YWx1ZSAoaW1wb3J0YW50IGZvciBsb29rdXAgZmllbGRzIGxpa2UgSXRlbUlkKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBrZXlDb2RlOiAxMywgd2hpY2g6IDEzLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGtleUNvZGU6IDEzLCB3aGljaDogMTMsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAyOiBUYWIgb3V0IHRvIG1vdmUgdG8gbmV4dCBjZWxsICh0cmlnZ2VycyBibHVyIGFuZCB2YWxpZGF0aW9uKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGtleUNvZGU6IDksIHdoaWNoOiA5LCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywga2V5Q29kZTogOSwgd2hpY2g6IDksIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAzOiBEaXNwYXRjaCBibHVyIGV2ZW50IGV4cGxpY2l0bHlcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUsIHJlbGF0ZWRUYXJnZXQ6IG51bGwgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCA0OiBDbGljayBvdXRzaWRlIHRoZSBjZWxsIHRvIGVuc3VyZSBmb2N1cyBpcyBsb3N0XHJcbiAgICAvLyBGaW5kIGFub3RoZXIgY2VsbCBvciB0aGUgcm93IGNvbnRhaW5lciB0byBjbGlja1xyXG4gICAgY29uc3Qgcm93ID0gaW5wdXQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW4sIFtkYXRhLWR5bi1yb2xlPVwiUm93XCJdJyk7XHJcbiAgICBpZiAocm93KSB7XHJcbiAgICAgICAgY29uc3Qgb3RoZXJDZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbjpub3QoOmZvY3VzLXdpdGhpbiknKTtcclxuICAgICAgICBpZiAob3RoZXJDZWxsICYmIG90aGVyQ2VsbCAhPT0gaW5wdXQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJykpIHtcclxuICAgICAgICAgICAgb3RoZXJDZWxsLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gV2FpdCBmb3IgRDM2NSB0byBwcm9jZXNzL3ZhbGlkYXRlIHRoZSB2YWx1ZSAoc2VydmVyLXNpZGUgbG9va3VwIGZvciBJdGVtSWQsIGV0Yy4pXHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdERUZBVUxUX1dBSVRfU1RFUF9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBJZiB3YWl0Rm9yVmFsaWRhdGlvbiBpcyBlbmFibGVkLCB3YWl0IGZvciBEMzY1IHRvIGNvbXBsZXRlIHRoZSBsb29rdXAgdmFsaWRhdGlvblxyXG4gICAgLy8gVGhpcyBpcyBpbXBvcnRhbnQgZm9yIGZpZWxkcyBsaWtlIEl0ZW1JZCB0aGF0IHRyaWdnZXIgc2VydmVyLXNpZGUgdmFsaWRhdGlvblxyXG4gICAgaWYgKHdhaXRGb3JWYWxpZGF0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gV2FpdCBmb3IgYW55IGxvYWRpbmcgaW5kaWNhdG9ycyB0byBhcHBlYXIgYW5kIGRpc2FwcGVhclxyXG4gICAgICAgIC8vIEQzNjUgc2hvd3MgYSBsb2FkaW5nIHNwaW5uZXIgZHVyaW5nIHNlcnZlci1zaWRlIGxvb2t1cHNcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yRDM2NVZhbGlkYXRpb24oY29udHJvbE5hbWUsIDUwMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yRDM2NVZhbGlkYXRpb24oY29udHJvbE5hbWUsIHRpbWVvdXQgPSA1MDAwKSB7XHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgbGV0IGxhc3RMb2FkaW5nU3RhdGUgPSBmYWxzZTtcclxuICAgIGxldCBzZWVuTG9hZGluZyA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IHRpbWVvdXQpIHtcclxuICAgICAgICAvLyBDaGVjayBmb3IgRDM2NSBsb2FkaW5nIGluZGljYXRvcnNcclxuICAgICAgICBjb25zdCBpc0xvYWRpbmcgPSBpc0QzNjVMb2FkaW5nKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzTG9hZGluZyAmJiAhbGFzdExvYWRpbmdTdGF0ZSkge1xyXG4gICAgICAgICAgICBzZWVuTG9hZGluZyA9IHRydWU7XHJcbiAgICAgICAgfSBlbHNlIGlmICghaXNMb2FkaW5nICYmIGxhc3RMb2FkaW5nU3RhdGUgJiYgc2VlbkxvYWRpbmcpIHtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7IC8vIEV4dHJhIGJ1ZmZlciBhZnRlciBsb2FkaW5nIGNvbXBsZXRlc1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGFzdExvYWRpbmdTdGF0ZSA9IGlzTG9hZGluZztcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIGNoZWNrIGlmIHRoZSBjZWxsIG5vdyBzaG93cyB2YWxpZGF0ZWQgY29udGVudCAoZS5nLiwgcHJvZHVjdCBuYW1lIGFwcGVhcmVkKVxyXG4gICAgICAgIC8vIEZvciBJdGVtSWQsIEQzNjUgc2hvd3MgdGhlIGl0ZW0gbnVtYmVyIGFuZCBuYW1lIGFmdGVyIHZhbGlkYXRpb25cclxuICAgICAgICBjb25zdCBjZWxsID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICAgICAgaWYgKGNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbFRleHQgPSBjZWxsLnRleHRDb250ZW50IHx8ICcnO1xyXG4gICAgICAgICAgICBjb25zdCBoYXNNdWx0aXBsZVZhbHVlcyA9IGNlbGxUZXh0LnNwbGl0KC9cXHN7Mix9fFxcbi8pLmZpbHRlcih0ID0+IHQudHJpbSgpKS5sZW5ndGggPiAxO1xyXG4gICAgICAgICAgICBpZiAoaGFzTXVsdGlwbGVWYWx1ZXMpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnSU5QVVRfU0VUVExFX0RFTEFZJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIElmIHdlIHNhdyBsb2FkaW5nIGF0IHNvbWUgcG9pbnQsIHdhaXQgYSBiaXQgbW9yZSBhZnRlciB0aW1lb3V0XHJcbiAgICBpZiAoc2VlbkxvYWRpbmcpIHtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdERUZBVUxUX1dBSVRfU1RFUF9ERUxBWScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBXYWl0IGZvciB0aGUgZ3JpZCB0byBoYXZlIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3cgdGhhdCBjb250YWlucyB0aGUgdGFyZ2V0XHJcbiAqIGNvbnRyb2wuICBEMzY1IFJlYWN0IGdyaWRzIHVwZGF0ZSBgYXJpYS1zZWxlY3RlZGAgYXN5bmNocm9ub3VzbHkgYWZ0ZXJcclxuICogYWN0aW9ucyBsaWtlIFwiQWRkIGxpbmVcIiwgc28gd2UgcG9sbCBmb3IgYSBzaG9ydCBwZXJpb2QgYmVmb3JlIGdpdmluZyB1cC5cclxuICpcclxuICogSU1QT1JUQU5UOiBJZiBhIHBlbmRpbmctbmV3LXJvdyBtYXJrZXIgZXhpc3RzIChzZXQgYnkgYHdhaXRGb3JOZXdHcmlkUm93YFxyXG4gKiBhZnRlciBhbiBcIkFkZCBsaW5lXCIgY2xpY2spLCB3ZSB2ZXJpZnkgdGhhdCB0aGUgc2VsZWN0ZWQgcm93IG1hdGNoZXMgdGhhdFxyXG4gKiBtYXJrZXIuICBUaGlzIHByZXZlbnRzIHJldHVybmluZyBgdHJ1ZWAgd2hlbiB0aGUgT0xEIHJvdyBpcyBzdGlsbFxyXG4gKiBhcmlhLXNlbGVjdGVkIGJ1dCB0aGUgTkVXIHJvdyBoYXNuJ3QgYmVlbiBtYXJrZWQgeWV0LlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckFjdGl2ZUdyaWRSb3coY29udHJvbE5hbWUsIHRpbWVvdXQgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCBwZW5kaW5nTmV3ID0gd2luZG93Ll9fZDM2NV9wZW5kaW5nTmV3Um93O1xyXG4gICAgLy8gQ29uc2lkZXIgdGhlIG1hcmtlciBzdGFsZSBhZnRlciAxNSBzZWNvbmRzXHJcbiAgICBjb25zdCBtYXJrZXJGcmVzaCA9IHBlbmRpbmdOZXcgJiYgKERhdGUubm93KCkgLSBwZW5kaW5nTmV3LnRpbWVzdGFtcCA8IDE1MDAwKTtcclxuXHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dCkge1xyXG4gICAgICAgIC8vIElmIHdlIGhhdmUgYSBwZW5kaW5nLW5ldy1yb3cgbWFya2VyLCB0cnkgdG8gZmluZCBjb250cm9sTmFtZSBpblxyXG4gICAgICAgIC8vIFRIQVQgc3BlY2lmaWMgcm93IGZpcnN0LlxyXG4gICAgICAgIGlmIChtYXJrZXJGcmVzaCAmJiBwZW5kaW5nTmV3LnJvd0VsZW1lbnQpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHBlbmRpbmdOZXcucm93RWxlbWVudC5xdWVyeVNlbGVjdG9yKFxyXG4gICAgICAgICAgICAgICAgYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVGhlIHBlbmRpbmcgcm93IGNvbnRhaW5zIG91ciBjb250cm9sIC0gZ29vZCwgYnV0IHZlcmlmeSBpdFxyXG4gICAgICAgICAgICAgICAgLy8gaXMgYWN0dWFsbHkgc2VsZWN0ZWQgLyBhY3RpdmUgbm93LlxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHBlbmRpbmdOZXcucm93RWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZ05ldy5yb3dFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZ05ldy5yb3dFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm93LWFjdGl2ZScpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZW5kaW5nTmV3LnJvd0VsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkeW4tc2VsZWN0ZWRSb3cnKTtcclxuICAgICAgICAgICAgICAgIGlmIChpc1NlbGVjdGVkKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVHJhZGl0aW9uYWwgZ3JpZCBzZWxlY3RlZCByb3dzXHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRSb3dzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAgICAgJ1tkYXRhLWR5bi1zZWxlY3RlZD1cInRydWVcIl0sIFthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmR5bi1zZWxlY3RlZFJvdydcclxuICAgICAgICApO1xyXG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIHNlbGVjdGVkUm93cykge1xyXG4gICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGEgcGVuZGluZyBtYXJrZXIsIHNraXAgcm93cyB0aGF0IGRvbid0IG1hdGNoIGl0IFx1MjAxM1xyXG4gICAgICAgICAgICAvLyB0aGlzIHByZXZlbnRzIHJldHVybmluZyB0cnVlIGZvciB0aGUgb2xkL3ByZXZpb3VzIHJvdy5cclxuICAgICAgICAgICAgaWYgKG1hcmtlckZyZXNoICYmIHBlbmRpbmdOZXcucm93RWxlbWVudCAmJiByb3cgIT09IHBlbmRpbmdOZXcucm93RWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGFjdGl2ZSByb3dcclxuICAgICAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihcclxuICAgICAgICAgICAgICAgICcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgJyArXHJcbiAgICAgICAgICAgICAgICAnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgICAgIGlmIChtYXJrZXJGcmVzaCAmJiBwZW5kaW5nTmV3LnJvd0VsZW1lbnQgJiYgYWN0aXZlUm93ICE9PSBwZW5kaW5nTmV3LnJvd0VsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgICAgIGlmIChjZWxsICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdJTlBVVF9TRVRUTEVfREVMQVknKTtcclxuICAgIH1cclxuICAgIC8vIFRpbWVkIG91dCBcdTIwMTMgY2xlYXIgdGhlIHBlbmRpbmcgbWFya2VyIHNvIHdlIGRvbid0IGtlZXAgYmxvY2tpbmdcclxuICAgIC8vIGZ1dHVyZSBjYWxscyBpZiBzb21ldGhpbmcgd2VudCB3cm9uZy5cclxuICAgIGlmIChtYXJrZXJGcmVzaCkge1xyXG4gICAgICAgIGxvZ1N0ZXAoYHdhaXRGb3JBY3RpdmVHcmlkUm93OiB0aW1lZCBvdXQgd2FpdGluZyBmb3IgcGVuZGluZyBuZXcgcm93IHRvIGNvbnRhaW4gXCIke2NvbnRyb2xOYW1lfVwiLiBDbGVhcmluZyBtYXJrZXIuYCk7XHJcbiAgICAgICAgZGVsZXRlIHdpbmRvdy5fX2QzNjVfcGVuZGluZ05ld1JvdztcclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlR3JpZFJvdyhjb250cm9sTmFtZSkge1xyXG4gICAgLy8gVHJ5IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIGZpcnN0XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICAgICAgLy8gRmluZCB0aGUgcm93IGNvbnRhaW5pbmcgdGhpcyBjZWxsXHJcbiAgICAgICAgICAgICAgICBjb25zdCByb3cgPSBjZWxsLmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocm93KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2xpY2sgb24gdGhlIHJvdyB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgICAgICAgICByb3cuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHNcclxuICAgIGNvbnN0IGdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdJyk7XHJcbiAgICBmb3IgKGNvbnN0IGdyaWQgb2YgZ3JpZHMpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBjZWxsXHJcbiAgICAgICAgY29uc3QgY2VsbCA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICAvLyBGaW5kIHRoZSByb3cgY29udGFpbmluZyB0aGlzIGNlbGxcclxuICAgICAgICAgICAgY29uc3Qgcm93ID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIlJvd1wiXSwgW3JvbGU9XCJyb3dcIl0sIHRyJyk7XHJcbiAgICAgICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgICAgIC8vIENsaWNrIG9uIHRoZSByb3cgdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgICAgICByb3cuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRMb29rdXBTZWxlY3RWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUgPSAnJykge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gbG9va3VwIGZpZWxkJyk7XHJcblxyXG4gICAgY29uc3QgbG9va3VwQnV0dG9uID0gZmluZExvb2t1cEJ1dHRvbihlbGVtZW50KTtcclxuICAgIGlmIChsb29rdXBCdXR0b24pIHtcclxuICAgICAgICBsb29rdXBCdXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdDTElDS19BTklNQVRJT05fREVMQVknKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIG9wZW4gYnkgZm9jdXNpbmcgYW5kIGtleWJvYXJkXHJcbiAgICAgICAgaW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdJTlBVVF9TRVRUTEVfREVMQVknKTtcclxuICAgICAgICBhd2FpdCBzZXRWYWx1ZVdpdGhWZXJpZnkoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBhd2FpdCBvcGVuTG9va3VwQnlLZXlib2FyZChpbnB1dCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbG9va3VwRG9jayA9IGF3YWl0IHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudChlbGVtZW50KTtcclxuICAgIGlmICghbG9va3VwRG9jaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9va3VwIGZseW91dCBub3QgZm91bmQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBUcnkgdHlwaW5nIGludG8gYSBsb29rdXAgZmx5b3V0IGlucHV0IGlmIHByZXNlbnQgKGUuZy4sIE1haW5BY2NvdW50KVxyXG4gICAgY29uc3QgZG9ja0lucHV0ID0gZmluZExvb2t1cEZpbHRlcklucHV0KGxvb2t1cERvY2spO1xyXG4gICAgaWYgKGRvY2tJbnB1dCkge1xyXG4gICAgICAgIGRvY2tJbnB1dC5jbGljaygpO1xyXG4gICAgICAgIGRvY2tJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1FVSUNLX1JFVFJZX0RFTEFZJyk7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChkb2NrSW5wdXQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlKTtcclxuICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnU0FWRV9TRVRUTEVfREVMQVknKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb3dzID0gYXdhaXQgd2FpdEZvckxvb2t1cFJvd3MobG9va3VwRG9jaywgZWxlbWVudCk7XHJcbiAgICBpZiAoIXJvd3MubGVuZ3RoKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29rdXAgbGlzdCBpcyBlbXB0eScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNlYXJjaFZhbHVlID0gU3RyaW5nKHZhbHVlID8/ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgbGV0IG1hdGNoZWQgPSBmYWxzZTtcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm93LnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBjb25zdCBmaXJzdENlbGwgPSByb3cucXVlcnlTZWxlY3RvcignW3JvbGU9XCJncmlkY2VsbFwiXSwgdGQnKTtcclxuICAgICAgICBjb25zdCBmaXJzdFRleHQgPSBmaXJzdENlbGwgPyBmaXJzdENlbGwudGV4dENvbnRlbnQudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiAnJztcclxuICAgICAgICBpZiAoZmlyc3RUZXh0ID09PSBzZWFyY2hWYWx1ZSB8fCB0ZXh0LmluY2x1ZGVzKHNlYXJjaFZhbHVlKSkge1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaXJzdENlbGwgfHwgcm93O1xyXG4gICAgICAgICAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICB0YXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIC8vIFNvbWUgRDM2NSBsb29rdXBzIHJlcXVpcmUgRW50ZXIgb3IgZG91YmxlLWNsaWNrIHRvIGNvbW1pdCBzZWxlY3Rpb25cclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2RibGNsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIGlmICghYXBwbGllZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IGEgc2Vjb25kIGNvbW1pdCBwYXNzIGlmIHRoZSB2YWx1ZSBkaWQgbm90IHN0aWNrXHJcbiAgICAgICAgICAgICAgICB0YXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExvb2t1cCB2YWx1ZSBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBEMzY1IGNoZWNrYm94ZXMgY2FuIGJlOlxyXG4gICAgLy8gMS4gU3RhbmRhcmQgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdXHJcbiAgICAvLyAyLiBDdXN0b20gdG9nZ2xlIHdpdGggcm9sZT1cImNoZWNrYm94XCIgb3Igcm9sZT1cInN3aXRjaFwiXHJcbiAgICAvLyAzLiBFbGVtZW50IHdpdGggYXJpYS1jaGVja2VkIGF0dHJpYnV0ZSAodGhlIGNvbnRhaW5lciBpdHNlbGYpXHJcbiAgICAvLyA0LiBFbGVtZW50IHdpdGggZGF0YS1keW4tcm9sZT1cIkNoZWNrQm94XCJcclxuICAgIFxyXG4gICAgbGV0IGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKTtcclxuICAgIGxldCBpc0N1c3RvbVRvZ2dsZSA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgY3VzdG9tIHRvZ2dsZSBlbGVtZW50XHJcbiAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiY2hlY2tib3hcIl0sIFtyb2xlPVwic3dpdGNoXCJdJyk7XHJcbiAgICAgICAgaWYgKGNoZWNrYm94KSB7XHJcbiAgICAgICAgICAgIGlzQ3VzdG9tVG9nZ2xlID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHtcclxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZWxlbWVudCBpdHNlbGYgaXMgdGhlIHRvZ2dsZSAoRDM2NSBvZnRlbiBkb2VzIHRoaXMpXHJcbiAgICAgICAgaWYgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSA9PT0gJ2NoZWNrYm94JyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnc3dpdGNoJyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnQ2hlY2tCb3gnKSB7XHJcbiAgICAgICAgICAgIGNoZWNrYm94ID0gZWxlbWVudDtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkge1xyXG4gICAgICAgIC8vIExhc3QgcmVzb3J0OiBmaW5kIGFueSBjbGlja2FibGUgdG9nZ2xlLWxpa2UgZWxlbWVudFxyXG4gICAgICAgIGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b24sIFt0YWJpbmRleD1cIjBcIl0nKTtcclxuICAgICAgICBpZiAoY2hlY2tib3gpIHtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkgdGhyb3cgbmV3IEVycm9yKGBDaGVja2JveCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9LiBFbGVtZW50IEhUTUw6ICR7ZWxlbWVudC5vdXRlckhUTUwuc3Vic3RyaW5nKDAsIDIwMCl9YCk7XHJcblxyXG4gICAgY29uc3Qgc2hvdWxkQ2hlY2sgPSBjb2VyY2VCb29sZWFuKHZhbHVlKTtcclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgc3RhdGVcclxuICAgIGxldCBpc0N1cnJlbnRseUNoZWNrZWQ7XHJcbiAgICBpZiAoaXNDdXN0b21Ub2dnbGUpIHtcclxuICAgICAgICBpc0N1cnJlbnRseUNoZWNrZWQgPSBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZScgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoZWNrZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3guY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2RhdGEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlzQ3VycmVudGx5Q2hlY2tlZCA9IGNoZWNrYm94LmNoZWNrZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT25seSBjbGljayBpZiBzdGF0ZSBuZWVkcyB0byBjaGFuZ2VcclxuICAgIGlmIChzaG91bGRDaGVjayAhPT0gaXNDdXJyZW50bHlDaGVja2VkKSB7XHJcbiAgICAgICAgY2hlY2tib3guY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBGb3IgY3VzdG9tIHRvZ2dsZXMsIGFsc28gdHJ5IGRpc3BhdGNoaW5nIGV2ZW50cyBpZiBjbGljayBkaWRuJ3Qgd29ya1xyXG4gICAgICAgIGlmIChpc0N1c3RvbVRvZ2dsZSkge1xyXG4gICAgICAgICAgICBjaGVja2JveC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBjaGVja2JveC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcGVuTG9va3VwQnlLZXlib2FyZChpbnB1dCkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1FVSUNLX1JFVFJZX0RFTEFZJyk7XHJcbiAgICAvLyBUcnkgQWx0K0Rvd24gdGhlbiBGNCAoY29tbW9uIEQzNjUvV2luIGNvbnRyb2xzKVxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGFsdEtleTogdHJ1ZSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGFsdEtleTogdHJ1ZSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdNRURJVU1fU0VUVExFX0RFTEFZJyk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdGNCcsIGNvZGU6ICdGNCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Y0JywgY29kZTogJ0Y0JywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KSB7XHJcbiAgICAvLyBEMzY1IHNlZ21lbnRlZCBsb29rdXBzIG9mdGVuIHZhbGlkYXRlIG9uIFRhYi9FbnRlciBhbmQgYmx1clxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQ0xJQ0tfQU5JTUFUSU9OX0RFTEFZJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbG9zZURpYWxvZyhmb3JtTmFtZSwgYWN0aW9uID0gJ29rJykge1xyXG4gICAgY29uc3QgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1mb3JtLW5hbWU9XCIke2Zvcm1OYW1lfVwiXWApO1xyXG4gICAgaWYgKCFmb3JtKSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogRm9ybSAke2Zvcm1OYW1lfSBub3QgZm91bmQgdG8gY2xvc2VgKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCBidXR0b25OYW1lO1xyXG4gICAgaWYgKGZvcm1OYW1lID09PSAnU3lzUmVjdXJyZW5jZScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ0NvbW1hbmRCdXR0b25PaycgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9IGVsc2UgaWYgKGZvcm1OYW1lID09PSAnU3lzUXVlcnlGb3JtJykge1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnT2tCdXR0b24nIDogJ0NhbmNlbEJ1dHRvbic7XHJcbiAgICB9IGVsc2UgaWYgKGZvcm1OYW1lID09PSAnU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtJykge1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnQ29tbWFuZEJ1dHRvbicgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFRyeSBnZW5lcmljIG5hbWVzXHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdDb21tYW5kQnV0dG9uJyA6ICdDb21tYW5kQnV0dG9uQ2FuY2VsJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgYnV0dG9uID0gZm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2J1dHRvbk5hbWV9XCJdYCk7XHJcbiAgICBpZiAoYnV0dG9uKSB7XHJcbiAgICAgICAgYnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgICAgICBsb2dTdGVwKGBEaWFsb2cgJHtmb3JtTmFtZX0gY2xvc2VkIHdpdGggJHthY3Rpb24udG9VcHBlckNhc2UoKX1gKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogJHthY3Rpb24udG9VcHBlckNhc2UoKX0gYnV0dG9uIG5vdCBmb3VuZCBpbiAke2Zvcm1OYW1lfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRDdXJyZW50Um93VmFsdWUoZmllbGRNYXBwaW5nKSB7XHJcbiAgICBpZiAoIWZpZWxkTWFwcGluZykgcmV0dXJuICcnO1xyXG4gICAgY29uc3Qgcm93ID0gd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50RGF0YVJvdyB8fCB7fTtcclxuICAgIGNvbnN0IGRpcmVjdCA9IHJvd1tmaWVsZE1hcHBpbmddO1xyXG4gICAgaWYgKGRpcmVjdCAhPT0gdW5kZWZpbmVkICYmIGRpcmVjdCAhPT0gbnVsbCkge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmcoZGlyZWN0KTtcclxuICAgIH1cclxuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGZpZWxkTWFwcGluZy5pbmNsdWRlcygnOicpID8gZmllbGRNYXBwaW5nLnNwbGl0KCc6JykucG9wKCkgOiBmaWVsZE1hcHBpbmc7XHJcbiAgICBjb25zdCB2YWx1ZSA9IHJvd1tmaWVsZE5hbWVdO1xyXG4gICAgcmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwgPyAnJyA6IFN0cmluZyh2YWx1ZSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVEeW5hbWljVGV4dCh0ZXh0KSB7XHJcbiAgICBpZiAodHlwZW9mIHRleHQgIT09ICdzdHJpbmcnIHx8ICF0ZXh0KSByZXR1cm4gdGV4dCB8fCAnJztcclxuXHJcbiAgICBsZXQgcmVzb2x2ZWQgPSB0ZXh0O1xyXG4gICAgaWYgKC9fX0QzNjVfUEFSQU1fQ0xJUEJPQVJEX1thLXowLTlfXStfXy9pLnRlc3QocmVzb2x2ZWQpKSB7XHJcbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuY2xpcGJvYXJkPy5yZWFkVGV4dCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaXBib2FyZCBBUEkgbm90IGF2YWlsYWJsZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBjbGlwYm9hcmRUZXh0ID0gYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC5yZWFkVGV4dCgpO1xyXG4gICAgICAgIHJlc29sdmVkID0gcmVzb2x2ZWQucmVwbGFjZSgvX19EMzY1X1BBUkFNX0NMSVBCT0FSRF9bYS16MC05X10rX18vZ2ksIGNsaXBib2FyZFRleHQgPz8gJycpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlc29sdmVkID0gcmVzb2x2ZWQucmVwbGFjZSgvX19EMzY1X1BBUkFNX0RBVEFfKFtBLVphLXowLTklLl9+LV0qKV9fL2csIChfLCBlbmNvZGVkRmllbGQpID0+IHtcclxuICAgICAgICBjb25zdCBmaWVsZCA9IGRlY29kZVVSSUNvbXBvbmVudChlbmNvZGVkRmllbGQgfHwgJycpO1xyXG4gICAgICAgIHJldHVybiBnZXRDdXJyZW50Um93VmFsdWUoZmllbGQpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc29sdmVkO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbmF2aWdhdGVUb0Zvcm0oc3RlcCkge1xyXG4gICAgY29uc3QgeyBuYXZpZ2F0ZU1ldGhvZCwgbWVudUl0ZW1OYW1lLCBtZW51SXRlbVR5cGUsIG5hdmlnYXRlVXJsLCBob3N0UmVsYXRpdmVQYXRoLCB3YWl0Rm9yTG9hZCwgb3BlbkluTmV3VGFiIH0gPSBzdGVwO1xyXG5cclxuICAgIGNvbnN0IHJlc29sdmVkTWVudUl0ZW1OYW1lID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KG1lbnVJdGVtTmFtZSB8fCAnJyk7XHJcbiAgICBjb25zdCByZXNvbHZlZE5hdmlnYXRlVXJsID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KG5hdmlnYXRlVXJsIHx8ICcnKTtcclxuICAgIGNvbnN0IHJlc29sdmVkSG9zdFJlbGF0aXZlUGF0aCA9IGF3YWl0IHJlc29sdmVEeW5hbWljVGV4dChob3N0UmVsYXRpdmVQYXRoIHx8ICcnKTtcclxuXHJcbiAgICBsb2dTdGVwKGBOYXZpZ2F0aW5nIHRvIGZvcm06ICR7cmVzb2x2ZWRNZW51SXRlbU5hbWUgfHwgcmVzb2x2ZWROYXZpZ2F0ZVVybH1gKTtcclxuICAgIFxyXG4gICAgbGV0IHRhcmdldFVybDtcclxuICAgIGNvbnN0IGJhc2VVcmwgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lO1xyXG4gICAgXHJcbiAgICBpZiAobmF2aWdhdGVNZXRob2QgPT09ICd1cmwnICYmIHJlc29sdmVkTmF2aWdhdGVVcmwpIHtcclxuICAgICAgICAvLyBVc2UgZnVsbCBVUkwgcGF0aCBwcm92aWRlZFxyXG4gICAgICAgIHRhcmdldFVybCA9IHJlc29sdmVkTmF2aWdhdGVVcmwuc3RhcnRzV2l0aCgnaHR0cCcpID8gcmVzb2x2ZWROYXZpZ2F0ZVVybCA6IGJhc2VVcmwgKyByZXNvbHZlZE5hdmlnYXRlVXJsO1xyXG4gICAgfSBlbHNlIGlmIChuYXZpZ2F0ZU1ldGhvZCA9PT0gJ2hvc3RSZWxhdGl2ZScgJiYgcmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoKSB7XHJcbiAgICAgICAgLy8gUmV1c2UgY3VycmVudCBob3N0IGR5bmFtaWNhbGx5LCBhcHBlbmQgcHJvdmlkZWQgcGF0aC9xdWVyeS5cclxuICAgICAgICBjb25zdCByZWxhdGl2ZVBhcnQgPSBTdHJpbmcocmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoKS50cmltKCk7XHJcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHJlbGF0aXZlUGFydC5zdGFydHNXaXRoKCcvJykgfHwgcmVsYXRpdmVQYXJ0LnN0YXJ0c1dpdGgoJz8nKVxyXG4gICAgICAgICAgICA/IHJlbGF0aXZlUGFydFxyXG4gICAgICAgICAgICA6IGAvJHtyZWxhdGl2ZVBhcnR9YDtcclxuICAgICAgICB0YXJnZXRVcmwgPSBgJHt3aW5kb3cubG9jYXRpb24ucHJvdG9jb2x9Ly8ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fSR7bm9ybWFsaXplZH1gO1xyXG4gICAgfSBlbHNlIGlmIChyZXNvbHZlZE1lbnVJdGVtTmFtZSkge1xyXG4gICAgICAgIC8vIEJ1aWxkIFVSTCBmcm9tIG1lbnUgaXRlbSBuYW1lXHJcbiAgICAgICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcclxuICAgICAgICBwYXJhbXMuZGVsZXRlKCdxJyk7XHJcbiAgICAgICAgY29uc3QgdHlwZVByZWZpeCA9IChtZW51SXRlbVR5cGUgJiYgbWVudUl0ZW1UeXBlICE9PSAnRGlzcGxheScpID8gYCR7bWVudUl0ZW1UeXBlfTpgIDogJyc7XHJcbiAgICAgICAgY29uc3QgcmF3TWVudUl0ZW0gPSBTdHJpbmcocmVzb2x2ZWRNZW51SXRlbU5hbWUpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gU3VwcG9ydCBleHRlbmRlZCBpbnB1dCBsaWtlOlxyXG4gICAgICAgIC8vIFwiU3lzVGFibGVCcm93c2VyJnRhYmxlTmFtZT1JbnZlbnRUYWJsZVwiXHJcbiAgICAgICAgLy8gc28gZXh0cmEgcXVlcnkgcGFyYW1zIGFyZSBhcHBlbmRlZCBhcyByZWFsIFVSTCBwYXJhbXMsIG5vdCBlbmNvZGVkIGludG8gbWkuXHJcbiAgICAgICAgY29uc3Qgc2VwYXJhdG9ySW5kZXggPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgLi4uWyc/JywgJyYnXVxyXG4gICAgICAgICAgICAgICAgLm1hcChjaCA9PiByYXdNZW51SXRlbS5pbmRleE9mKGNoKSlcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIoaWR4ID0+IGlkeCA+PSAwKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGxldCBtZW51SXRlbUJhc2UgPSByYXdNZW51SXRlbTtcclxuICAgICAgICBsZXQgZXh0cmFRdWVyeSA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHNlcGFyYXRvckluZGV4KSkge1xyXG4gICAgICAgICAgICBtZW51SXRlbUJhc2UgPSByYXdNZW51SXRlbS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpO1xyXG4gICAgICAgICAgICBleHRyYVF1ZXJ5ID0gcmF3TWVudUl0ZW0uc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKS50cmltKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBwYXJhbXMuc2V0KCdtaScsIGAke3R5cGVQcmVmaXh9JHttZW51SXRlbUJhc2V9YCk7XHJcblxyXG4gICAgICAgIGlmIChleHRyYVF1ZXJ5KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGV4dHJhcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoZXh0cmFRdWVyeSk7XHJcbiAgICAgICAgICAgIGV4dHJhcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoa2V5ICYmIGtleSAhPT0gJ21pJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhcmFtcy5zZXQoa2V5LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGFyZ2V0VXJsID0gYmFzZVVybCArICc/JyArIHBhcmFtcy50b1N0cmluZygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05hdmlnYXRlIHN0ZXAgcmVxdWlyZXMgZWl0aGVyIG1lbnVJdGVtTmFtZSBvciBuYXZpZ2F0ZVVybCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBOYXZpZ2F0aW5nIHRvOiAke3RhcmdldFVybH1gKTtcclxuXHJcbiAgICBpZiAob3BlbkluTmV3VGFiKSB7XHJcbiAgICAgICAgd2luZG93Lm9wZW4odGFyZ2V0VXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyJyk7XHJcbiAgICAgICAgbG9nU3RlcCgnT3BlbmVkIG5hdmlnYXRpb24gdGFyZ2V0IGluIGEgbmV3IHRhYicpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTYXZlIHBlbmRpbmcgd29ya2Zsb3cgc3RhdGUgZGlyZWN0bHkgaW4gc2Vzc2lvblN0b3JhZ2UgYmVmb3JlIG5hdmlnYXRpb25cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldE1lbnVJdGVtTmFtZSA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdtaScpIHx8ICcnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIElNUE9SVEFOVDogUGVyc2lzdCBwZW5kaW5nIG5hdmlnYXRpb24gc3RhdGUgZnJvbSB0aGUgY3VycmVudGx5IGV4ZWN1dGluZyB3b3JrZmxvdy5cclxuICAgICAgICAvLyBQcmVmZXIgY3VycmVudCB3b3JrZmxvdyBjb250ZXh0IGZpcnN0LCB0aGVuIGl0cyBvcmlnaW5hbC9mdWxsIHdvcmtmbG93IHdoZW4gcHJlc2VudC5cclxuICAgICAgICBjb25zdCBjdXJyZW50V29ya2Zsb3cgPSB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyB8fCBudWxsO1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsV29ya2Zsb3cgPSBjdXJyZW50V29ya2Zsb3c/Ll9vcmlnaW5hbFdvcmtmbG93IHx8IGN1cnJlbnRXb3JrZmxvdyB8fCB3aW5kb3cuZDM2NU9yaWdpbmFsV29ya2Zsb3cgfHwgbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwZW5kaW5nU3RhdGUgPSB7XHJcbiAgICAgICAgICAgIHdvcmtmbG93OiBvcmlnaW5hbFdvcmtmbG93LFxyXG4gICAgICAgICAgICB3b3JrZmxvd0lkOiBvcmlnaW5hbFdvcmtmbG93Py5pZCB8fCAnJyxcclxuICAgICAgICAgICAgbmV4dFN0ZXBJbmRleDogKHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudFN0ZXBJbmRleCA/PyAwKSArIDEsXHJcbiAgICAgICAgICAgIGN1cnJlbnRSb3dJbmRleDogd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50Um93SW5kZXggfHwgMCxcclxuICAgICAgICAgICAgdG90YWxSb3dzOiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LnRvdGFsUm93cyB8fCAwLFxyXG4gICAgICAgICAgICBkYXRhOiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnREYXRhUm93IHx8IG51bGwsXHJcbiAgICAgICAgICAgIHRhcmdldE1lbnVJdGVtTmFtZTogdGFyZ2V0TWVudUl0ZW1OYW1lLFxyXG4gICAgICAgICAgICB3YWl0Rm9yTG9hZDogd2FpdEZvckxvYWQgfHwgMzAwMCxcclxuICAgICAgICAgICAgc2F2ZWRBdDogRGF0ZS5ub3coKVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9wZW5kaW5nX3dvcmtmbG93JywgSlNPTi5zdHJpbmdpZnkocGVuZGluZ1N0YXRlKSk7XHJcbiAgICAgICAgbG9nU3RlcChgU2F2ZWQgd29ya2Zsb3cgc3RhdGUgZm9yIG5hdmlnYXRpb24gKG5leHRTdGVwSW5kZXg6ICR7cGVuZGluZ1N0YXRlLm5leHRTdGVwSW5kZXh9KWApO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUud2FybignW0QzNjVdIEZhaWxlZCB0byBzYXZlIHdvcmtmbG93IHN0YXRlIGluIHNlc3Npb25TdG9yYWdlOicsIGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTaWduYWwgbmF2aWdhdGlvbiBpcyBhYm91dCB0byBoYXBwZW4gLSB3b3JrZmxvdyBzdGF0ZSB3aWxsIGJlIHNhdmVkIGJ5IHRoZSBleHRlbnNpb25cclxuICAgIC8vIFdlIG5lZWQgdG8gd2FpdCBmb3IgdGhlIHN0YXRlIHRvIGJlIHNhdmVkIGJlZm9yZSBuYXZpZ2F0aW5nXHJcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX05BVklHQVRJTkcnLFxyXG4gICAgICAgIHRhcmdldFVybDogdGFyZ2V0VXJsLFxyXG4gICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwXHJcbiAgICB9LCAnKicpO1xyXG4gICAgXHJcbiAgICAvLyBXYWl0IGxvbmdlciB0byBlbnN1cmUgdGhlIGZ1bGwgY2hhaW4gY29tcGxldGVzOlxyXG4gICAgLy8gcG9zdE1lc3NhZ2UgLT4gY29udGVudC5qcyAtPiBiYWNrZ3JvdW5kLmpzIC0+IHBvcHVwIC0+IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdFxyXG4gICAgLy8gVGhpcyBjaGFpbiBpbnZvbHZlcyBtdWx0aXBsZSBhc3luYyBob3BzLCBzbyB3ZSBuZWVkIHN1ZmZpY2llbnQgdGltZVxyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgIFxyXG4gICAgLy8gTmF2aWdhdGUgLSB0aGlzIHdpbGwgY2F1c2UgcGFnZSByZWxvYWQsIHNjcmlwdCBjb250ZXh0IHdpbGwgYmUgbG9zdFxyXG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0YXJnZXRVcmw7XHJcbiAgICBcclxuICAgIC8vIFRoaXMgY29kZSB3b24ndCBleGVjdXRlIGR1ZSB0byBwYWdlIG5hdmlnYXRpb24sIGJ1dCBrZWVwIGl0IGZvciByZWZlcmVuY2VcclxuICAgIC8vIFRoZSB3b3JrZmxvdyB3aWxsIGJlIHJlc3VtZWQgYnkgdGhlIGNvbnRlbnQgc2NyaXB0IGFmdGVyIHBhZ2UgbG9hZFxyXG4gICAgYXdhaXQgc2xlZXAod2FpdEZvckxvYWQgfHwgMzAwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZVRhYihjb250cm9sTmFtZSkge1xyXG4gICAgbG9nU3RlcChgQWN0aXZhdGluZyB0YWI6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIHRhYiBlbGVtZW50IC0gY291bGQgYmUgdGhlIHRhYiBjb250ZW50IG9yIHRoZSB0YWIgYnV0dG9uIGl0c2VsZlxyXG4gICAgbGV0IHRhYkVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vdCBmb3VuZCBkaXJlY3RseSwgdHJ5IGZpbmRpbmcgYnkgbG9va2luZyBmb3IgdGFiIGhlYWRlcnMvbGlua3NcclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBmaW5kaW5nIHRoZSB0YWIgbGluay9idXR0b24gdGhhdCByZWZlcmVuY2VzIHRoaXMgdGFiXHJcbiAgICAgICAgdGFiRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9X2hlYWRlclwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdIFtyb2xlPVwidGFiXCJdYCkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2FyaWEtY29udHJvbHM9XCIke2NvbnRyb2xOYW1lfVwiXWApIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGFbaHJlZio9XCIke2NvbnRyb2xOYW1lfVwiXSwgYnV0dG9uW2RhdGEtdGFyZ2V0Kj1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVGFiIGVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGb3IgRDM2NSBwYXJhbWV0ZXIgZm9ybXMgd2l0aCB2ZXJ0aWNhbCB0YWJzLCB0aGUgY2xpY2thYmxlIGVsZW1lbnQgc3RydWN0dXJlIHZhcmllc1xyXG4gICAgLy8gVHJ5IG11bHRpcGxlIGFwcHJvYWNoZXMgdG8gZmluZCBhbmQgY2xpY2sgdGhlIHJpZ2h0IGVsZW1lbnRcclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMTogTG9vayBmb3IgdGhlIHRhYiBsaW5rIGluc2lkZSBhIHBpdm90L3RhYiBzdHJ1Y3R1cmVcclxuICAgIGxldCBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3RvcignLnBpdm90LWxpbmssIC50YWItbGluaywgW3JvbGU9XCJ0YWJcIl0nKTtcclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMjogVGhlIGVsZW1lbnQgaXRzZWxmIG1pZ2h0IGJlIHRoZSBsaW5rXHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0ICYmICh0YWJFbGVtZW50LnRhZ05hbWUgPT09ICdBJyB8fCB0YWJFbGVtZW50LnRhZ05hbWUgPT09ICdCVVRUT04nIHx8IHRhYkVsZW1lbnQuZ2V0QXR0cmlidXRlKCdyb2xlJykgPT09ICd0YWInKSkge1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggMzogRm9yIHZlcnRpY2FsIHRhYnMsIGxvb2sgZm9yIHRoZSBhbmNob3Igb3IgbGluayBlbGVtZW50XHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2EsIGJ1dHRvbicpIHx8IHRhYkVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEFwcHJvYWNoIDQ6IEZvciBQaXZvdEl0ZW0sIGZpbmQgdGhlIGhlYWRlciBlbGVtZW50XHJcbiAgICBpZiAoIWNsaWNrVGFyZ2V0IHx8IGNsaWNrVGFyZ2V0ID09PSB0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGNvbnRyb2xOYW1lICsgJ19oZWFkZXInO1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtoZWFkZXJOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXJFbCkge1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlckVsLnF1ZXJ5U2VsZWN0b3IoJ2EsIGJ1dHRvbiwgLnBpdm90LWxpbmsnKSB8fCBoZWFkZXJFbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYENsaWNraW5nIHRhYiBlbGVtZW50OiAke2NsaWNrVGFyZ2V0Py50YWdOYW1lIHx8ICd1bmtub3duJ31gKTtcclxuICAgIFxyXG4gICAgLy8gRm9jdXMgYW5kIGNsaWNrXHJcbiAgICBpZiAoY2xpY2tUYXJnZXQuZm9jdXMpIGNsaWNrVGFyZ2V0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdJTlBVVF9TRVRUTEVfREVMQVknKTtcclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZVxyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG4gICAgXHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgIFxyXG4gICAgLy8gQWxzbyB0cnkgdHJpZ2dlcmluZyB0aGUgRDM2NSBpbnRlcm5hbCBjb250cm9sXHJcbiAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuQWN0aXZhdGVUYWIgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLkFjdGl2YXRlVGFiKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBBY3RpdmF0ZVRhYiBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5hY3RpdmF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuYWN0aXZhdGUoKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgYWN0aXZhdGUgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuc2VsZWN0ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5zZWxlY3QoKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgc2VsZWN0IG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYEQzNjUgY29udHJvbCBtZXRob2QgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIHRhYiBjb250ZW50IHRvIGxvYWRcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0NMSUNLX0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgdGhlIHRhYiBpcyBub3cgYWN0aXZlIGJ5IGNoZWNraW5nIGZvciB2aXNpYmxlIGNvbnRlbnRcclxuICAgIGNvbnN0IHRhYkNvbnRlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgaWYgKHRhYkNvbnRlbnQpIHtcclxuICAgICAgICBjb25zdCBpc1Zpc2libGUgPSB0YWJDb250ZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbDtcclxuICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IHRhYkNvbnRlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFiQ29udGVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYkNvbnRlbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicpICE9PSAndHJ1ZSc7XHJcbiAgICAgICAgbG9nU3RlcChgVGFiICR7Y29udHJvbE5hbWV9IHZpc2liaWxpdHkgY2hlY2s6IHZpc2libGU9JHtpc1Zpc2libGV9LCBhY3RpdmU9JHtpc0FjdGl2ZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgVGFiICR7Y29udHJvbE5hbWV9IGFjdGl2YXRlZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWN0aXZhdGVBY3Rpb25QYW5lVGFiKGNvbnRyb2xOYW1lKSB7XHJcbiAgICBsb2dTdGVwKGBBY3RpdmF0aW5nIGFjdGlvbiBwYW5lIHRhYjogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICBsZXQgdGFiRWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuXHJcbiAgICBpZiAoIXRhYkVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgICAgIGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgIGAuYXBwQmFyVGFiW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICBgLmFwcEJhclRhYiBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgIGBbcm9sZT1cInRhYlwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYFxyXG4gICAgICAgIF07XHJcbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICAgICAgdGFiRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgICAgICBpZiAodGFiRWxlbWVudCkgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWN0aW9uIHBhbmUgdGFiIG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xyXG5cclxuICAgIGNvbnN0IGhlYWRlciA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCcuYXBwQmFyVGFiLWhlYWRlciwgLmFwcEJhclRhYkhlYWRlciwgLmFwcEJhclRhYl9oZWFkZXInKTtcclxuICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICBjbGlja1RhcmdldCA9IGhlYWRlcjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmb2N1c1NlbGVjdG9yID0gdGFiRWxlbWVudC5nZXRBdHRyaWJ1dGU/LignZGF0YS1keW4tZm9jdXMnKTtcclxuICAgIGlmIChmb2N1c1NlbGVjdG9yKSB7XHJcbiAgICAgICAgY29uc3QgZm9jdXNUYXJnZXQgPSB0YWJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoZm9jdXNTZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGZvY3VzVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZm9jdXNUYXJnZXQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0YWJFbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdyb2xlJykgPT09ICd0YWInKSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChjbGlja1RhcmdldCA9PT0gdGFiRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbmlzaCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCdidXR0b24sIGEsIFtyb2xlPVwidGFiXCJdJyk7XHJcbiAgICAgICAgaWYgKGJ1dHRvbmlzaCkgY2xpY2tUYXJnZXQgPSBidXR0b25pc2g7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNsaWNrVGFyZ2V0Py5mb2N1cykgY2xpY2tUYXJnZXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0lOUFVUX1NFVFRMRV9ERUxBWScpO1xyXG4gICAgZGlzcGF0Y2hDbGlja1NlcXVlbmNlKGNsaWNrVGFyZ2V0KTtcclxuXHJcbiAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuYWN0aXZhdGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLmFjdGl2YXRlKCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLnNlbGVjdCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuc2VsZWN0KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYEFjdGlvbiBwYW5lIGNvbnRyb2wgbWV0aG9kIGZhaWxlZDogJHtlLm1lc3NhZ2V9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1NBVkVfU0VUVExFX0RFTEFZJyk7XHJcbiAgICBsb2dTdGVwKGBBY3Rpb24gcGFuZSB0YWIgJHtjb250cm9sTmFtZX0gYWN0aXZhdGVkYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleHBhbmRPckNvbGxhcHNlU2VjdGlvbihjb250cm9sTmFtZSwgYWN0aW9uKSB7XHJcbiAgICBsb2dTdGVwKGAke2FjdGlvbiA9PT0gJ2V4cGFuZCcgPyAnRXhwYW5kaW5nJyA6ICdDb2xsYXBzaW5nJ30gc2VjdGlvbjogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIFxyXG4gICAgY29uc3Qgc2VjdGlvbiA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghc2VjdGlvbikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgU2VjdGlvbiBlbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRDM2NSBzZWN0aW9ucyBjYW4gaGF2ZSB2YXJpb3VzIHN0cnVjdHVyZXMuIFRoZSB0b2dnbGUgYnV0dG9uIGlzIHVzdWFsbHk6XHJcbiAgICAvLyAxLiBBIGJ1dHRvbiB3aXRoIGFyaWEtZXhwYW5kZWQgaW5zaWRlIHRoZSBzZWN0aW9uXHJcbiAgICAvLyAyLiBBIHNlY3Rpb24gaGVhZGVyIGVsZW1lbnRcclxuICAgIC8vIDMuIFRoZSBzZWN0aW9uIGl0c2VsZiBtaWdodCBiZSBjbGlja2FibGVcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgdG9nZ2xlIGJ1dHRvbiAtIHRoaXMgaXMgY3J1Y2lhbCBmb3IgRDM2NSBkaWFsb2dzXHJcbiAgICBsZXQgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCdidXR0b25bYXJpYS1leHBhbmRlZF0nKTtcclxuICAgIFxyXG4gICAgLy8gSWYgbm90IGZvdW5kLCB0cnkgb3RoZXIgY29tbW9uIHBhdHRlcm5zXHJcbiAgICBpZiAoIXRvZ2dsZUJ1dHRvbikge1xyXG4gICAgICAgIHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb24ucXVlcnlTZWxlY3RvcignLnNlY3Rpb24tcGFnZS1jYXB0aW9uLCAuc2VjdGlvbi1oZWFkZXIsIC5ncm91cC1oZWFkZXIsIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRm9yIFN5c09wZXJhdGlvblRlbXBsYXRlRm9ybSBzZWN0aW9ucyAoUmVjb3JkcyB0byBpbmNsdWRlLCBSdW4gaW4gdGhlIGJhY2tncm91bmQpXHJcbiAgICAvLyB0aGUgYnV0dG9uIGlzIG9mdGVuIGEgZGlyZWN0IGNoaWxkIG9yIHNpYmxpbmdcclxuICAgIGlmICghdG9nZ2xlQnV0dG9uKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbi5xdWVyeVNlbGVjdG9yKCdidXR0b24nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHNlY3Rpb24gaXRzZWxmIGhhcyBhcmlhLWV4cGFuZGVkIChpdCBtaWdodCBiZSB0aGUgY2xpY2thYmxlIGVsZW1lbnQpXHJcbiAgICBpZiAoIXRvZ2dsZUJ1dHRvbiAmJiBzZWN0aW9uLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpKSB7XHJcbiAgICAgICAgdG9nZ2xlQnV0dG9uID0gc2VjdGlvbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgc3RhdGUgZnJvbSB2YXJpb3VzIHNvdXJjZXNcclxuICAgIGxldCBpc0V4cGFuZGVkID0gZmFsc2U7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIHRoZSB0b2dnbGUgYnV0dG9uJ3MgYXJpYS1leHBhbmRlZFxyXG4gICAgaWYgKHRvZ2dsZUJ1dHRvbiAmJiB0b2dnbGVCdXR0b24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICBpc0V4cGFuZGVkID0gdG9nZ2xlQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2UgaWYgKHNlY3Rpb24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykpIHtcclxuICAgICAgICBpc0V4cGFuZGVkID0gc2VjdGlvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBjbGFzcy1iYXNlZCBkZXRlY3Rpb25cclxuICAgICAgICBpc0V4cGFuZGVkID0gc2VjdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgIXNlY3Rpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSBjdXJyZW50IHN0YXRlOiAke2lzRXhwYW5kZWQgPyAnZXhwYW5kZWQnIDogJ2NvbGxhcHNlZCd9YCk7XHJcbiAgICBcclxuICAgIGNvbnN0IG5lZWRzVG9nZ2xlID0gKGFjdGlvbiA9PT0gJ2V4cGFuZCcgJiYgIWlzRXhwYW5kZWQpIHx8IChhY3Rpb24gPT09ICdjb2xsYXBzZScgJiYgaXNFeHBhbmRlZCk7XHJcbiAgICBcclxuICAgIGlmIChuZWVkc1RvZ2dsZSkge1xyXG4gICAgICAgIC8vIENsaWNrIHRoZSB0b2dnbGUgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gdG9nZ2xlQnV0dG9uIHx8IHNlY3Rpb247XHJcbiAgICAgICAgbG9nU3RlcChgQ2xpY2tpbmcgdG9nZ2xlIGVsZW1lbnQ6ICR7Y2xpY2tUYXJnZXQudGFnTmFtZX0sIGNsYXNzPSR7Y2xpY2tUYXJnZXQuY2xhc3NOYW1lfWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc3BhdGNoIGZ1bGwgY2xpY2sgc2VxdWVuY2UgZm9yIEQzNjUgUmVhY3QgY29tcG9uZW50c1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVydXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgRDM2NSBpbnRlcm5hbCBjb250cm9sIEFQSVxyXG4gICAgICAgIGlmICh0eXBlb2YgJGR5biAhPT0gJ3VuZGVmaW5lZCcgJiYgJGR5bi5jb250cm9scykge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29udHJvbCA9ICRkeW4uY29udHJvbHNbY29udHJvbE5hbWVdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNvbnRyb2wpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBUcnkgdmFyaW91cyBEMzY1IG1ldGhvZHNcclxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuRXhwYW5kZWRDaGFuZ2VkID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEV4cGFuZGVkQ2hhbmdlZCB0YWtlcyAwIGZvciBleHBhbmQsIDEgZm9yIGNvbGxhcHNlIGluIEQzNjVcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5FeHBhbmRlZENoYW5nZWQoYWN0aW9uID09PSAnY29sbGFwc2UnID8gMSA6IDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgRXhwYW5kZWRDaGFuZ2VkKCR7YWN0aW9uID09PSAnY29sbGFwc2UnID8gMSA6IDB9KSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuZXhwYW5kID09PSAnZnVuY3Rpb24nICYmIGFjdGlvbiA9PT0gJ2V4cGFuZCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5leHBhbmQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIGV4cGFuZCgpIG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5jb2xsYXBzZSA9PT0gJ2Z1bmN0aW9uJyAmJiBhY3Rpb24gPT09ICdjb2xsYXBzZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbC5jb2xsYXBzZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgY29sbGFwc2UoKSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wudG9nZ2xlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wudG9nZ2xlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCB0b2dnbGUoKSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgbG9nU3RlcChgRDM2NSBjb250cm9sIG1ldGhvZCBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKGBTZWN0aW9uICR7Y29udHJvbE5hbWV9IGFscmVhZHkgJHthY3Rpb259ZWQsIG5vIHRvZ2dsZSBuZWVkZWRgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSAke2FjdGlvbn1lZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlUXVlcnlGaWx0ZXIodGFibGVOYW1lLCBmaWVsZE5hbWUsIGNyaXRlcmlhVmFsdWUsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgbG9nU3RlcChgQ29uZmlndXJpbmcgcXVlcnkgZmlsdGVyOiAke3RhYmxlTmFtZSA/IHRhYmxlTmFtZSArICcuJyA6ICcnfSR7ZmllbGROYW1lfSA9ICR7Y3JpdGVyaWFWYWx1ZX1gKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCBvciBvcGVuIHRoZSBxdWVyeSBmaWx0ZXIgZGlhbG9nXHJcbiAgICBsZXQgcXVlcnlGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpO1xyXG4gICAgaWYgKCFxdWVyeUZvcm0pIHtcclxuICAgICAgICAvLyBUcnkgdG8gb3BlbiB0aGUgcXVlcnkgZGlhbG9nIHZpYSBRdWVyeSBidXR0b25cclxuICAgICAgICBjb25zdCBmaWx0ZXJCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJRdWVyeVNlbGVjdEJ1dHRvblwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJRdWVyeVwiXScpO1xyXG4gICAgICAgIGlmIChmaWx0ZXJCdXR0b24pIHtcclxuICAgICAgICAgICAgZmlsdGVyQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1ZBTElEQVRJT05fV0FJVCcpO1xyXG4gICAgICAgICAgICBxdWVyeUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXF1ZXJ5Rm9ybSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUXVlcnkgZmlsdGVyIGRpYWxvZyAoU3lzUXVlcnlGb3JtKSBub3QgZm91bmQuIE1ha2Ugc3VyZSB0aGUgZmlsdGVyIGRpYWxvZyBpcyBvcGVuLicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gZmluZCBlbGVtZW50IHdpdGhpbiBxdWVyeSBmb3JtXHJcbiAgICBjb25zdCBmaW5kSW5RdWVyeSA9IChuYW1lKSA9PiBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtuYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICAvLyBJZiBzYXZlZFF1ZXJ5IGlzIHNwZWNpZmllZCwgc2VsZWN0IGl0IGZyb20gdGhlIGRyb3Bkb3duIGZpcnN0XHJcbiAgICBpZiAob3B0aW9ucy5zYXZlZFF1ZXJ5KSB7XHJcbiAgICAgICAgY29uc3Qgc2F2ZWRRdWVyeUJveCA9IGZpbmRJblF1ZXJ5KCdTYXZlZFF1ZXJpZXNCb3gnKTtcclxuICAgICAgICBpZiAoc2F2ZWRRdWVyeUJveCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IHNhdmVkUXVlcnlCb3gucXVlcnlTZWxlY3RvcignaW5wdXQnKTtcclxuICAgICAgICAgICAgaWYgKGlucHV0KSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBvcHRpb25zLnNhdmVkUXVlcnksIG9wdGlvbnMuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIE1ha2Ugc3VyZSB3ZSdyZSBvbiB0aGUgUmFuZ2UgdGFiXHJcbiAgICBjb25zdCByYW5nZVRhYiA9IGZpbmRJblF1ZXJ5KCdSYW5nZVRhYicpIHx8IGZpbmRJblF1ZXJ5KCdSYW5nZVRhYl9oZWFkZXInKTtcclxuICAgIGlmIChyYW5nZVRhYiAmJiAhcmFuZ2VUYWIuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSAmJiByYW5nZVRhYi5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSAhPT0gJ3RydWUnKSB7XHJcbiAgICAgICAgcmFuZ2VUYWIuY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2xpY2sgQWRkIHRvIGFkZCBhIG5ldyBmaWx0ZXIgcm93XHJcbiAgICBjb25zdCBhZGRCdXR0b24gPSBmaW5kSW5RdWVyeSgnUmFuZ2VBZGQnKTtcclxuICAgIGlmIChhZGRCdXR0b24pIHtcclxuICAgICAgICBhZGRCdXR0b24uY2xpY2soKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdERUZBVUxUX1dBSVRfU1RFUF9ERUxBWScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUaGUgZ3JpZCB1c2VzIFJlYWN0TGlzdCAtIGZpbmQgdGhlIGxhc3Qgcm93IChuZXdseSBhZGRlZCkgYW5kIGZpbGwgaW4gdmFsdWVzXHJcbiAgICBjb25zdCBncmlkID0gZmluZEluUXVlcnkoJ1JhbmdlR3JpZCcpO1xyXG4gICAgaWYgKCFncmlkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdSYW5nZSBncmlkIG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBHZXQgYWxsIHJvd3MgYW5kIGZpbmQgdGhlIGxhc3Qgb25lIChtb3N0IHJlY2VudGx5IGFkZGVkKVxyXG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyb3dcIl0sIHRyLCAubGlzdC1yb3cnKTtcclxuICAgIGNvbnN0IGxhc3RSb3cgPSByb3dzW3Jvd3MubGVuZ3RoIC0gMV0gfHwgZ3JpZDtcclxuICAgIFxyXG4gICAgLy8gU2V0IHRhYmxlIG5hbWUgaWYgcHJvdmlkZWRcclxuICAgIGlmICh0YWJsZU5hbWUpIHtcclxuICAgICAgICBjb25zdCB0YWJsZUNlbGwgPSBsYXN0Um93LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVGFibGVcIl0nKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VUYWJsZVwiXScpO1xyXG4gICAgICAgIGNvbnN0IGxhc3RUYWJsZUNlbGwgPSB0YWJsZUNlbGwubGVuZ3RoID8gdGFibGVDZWxsW3RhYmxlQ2VsbC5sZW5ndGggLSAxXSA6IHRhYmxlQ2VsbDtcclxuICAgICAgICBpZiAobGFzdFRhYmxlQ2VsbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGxhc3RUYWJsZUNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBsYXN0VGFibGVDZWxsO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCB0YWJsZU5hbWUsIG9wdGlvbnMuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgZmllbGQgbmFtZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKGZpZWxkTmFtZSkge1xyXG4gICAgICAgIGNvbnN0IGZpZWxkQ2VsbHMgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlRmllbGRcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0RmllbGRDZWxsID0gZmllbGRDZWxsc1tmaWVsZENlbGxzLmxlbmd0aCAtIDFdIHx8IGdyaWQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VGaWVsZFwiXScpO1xyXG4gICAgICAgIGlmIChsYXN0RmllbGRDZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbGFzdEZpZWxkQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGxhc3RGaWVsZENlbGw7XHJcbiAgICAgICAgICAgIC8vIENsaWNrIHRvIG9wZW4gZHJvcGRvd24vZm9jdXNcclxuICAgICAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgZmllbGROYW1lLCBvcHRpb25zLmNvbWJvU2VsZWN0TW9kZSB8fCAnJyk7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGNyaXRlcmlhIHZhbHVlIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoY3JpdGVyaWFWYWx1ZSkge1xyXG4gICAgICAgIGNvbnN0IHZhbHVlQ2VsbHMgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVmFsdWVcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0VmFsdWVDZWxsID0gdmFsdWVDZWxsc1t2YWx1ZUNlbGxzLmxlbmd0aCAtIDFdIHx8IGdyaWQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VWYWx1ZVwiXScpO1xyXG4gICAgICAgIGlmIChsYXN0VmFsdWVDZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbGFzdFZhbHVlQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGxhc3RWYWx1ZUNlbGw7XHJcbiAgICAgICAgICAgIGlucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGNyaXRlcmlhVmFsdWUsIG9wdGlvbnMuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdRdWVyeSBmaWx0ZXIgY29uZmlndXJlZCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlQmF0Y2hQcm9jZXNzaW5nKGVuYWJsZWQsIHRhc2tEZXNjcmlwdGlvbiwgYmF0Y2hHcm91cCwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgICBsb2dTdGVwKGBDb25maWd1cmluZyBiYXRjaCBwcm9jZXNzaW5nOiAke2VuYWJsZWQgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnfWApO1xyXG4gICAgXHJcbiAgICAvLyBXYWl0IGZvciBkaWFsb2cgdG8gYmUgcmVhZHlcclxuICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIHRoZSBiYXRjaCBwcm9jZXNzaW5nIGNoZWNrYm94IC0gY29udHJvbCBuYW1lIGlzIEZsZDFfMSBpbiBTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cclxuICAgIGNvbnN0IGJhdGNoVG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWU9XCJGbGQxXzFcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCgnRmxkMV8xJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiRmxkMV8xXCJdJyk7XHJcbiAgICBcclxuICAgIGlmIChiYXRjaFRvZ2dsZSkge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGFjdHVhbCBjaGVja2JveCBpbnB1dCBvciB0b2dnbGUgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgY2hlY2tib3ggPSBiYXRjaFRvZ2dsZS5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignLnRvZ2dsZS1idXR0b24nKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBjaGVja2JveD8uY2hlY2tlZCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLmNsYXNzTGlzdC5jb250YWlucygnb24nKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudFN0YXRlICE9PSBlbmFibGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gY2hlY2tib3ggfHwgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignYnV0dG9uLCAudG9nZ2xlLXN3aXRjaCwgbGFiZWwnKSB8fCBiYXRjaFRvZ2dsZTtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxvZ1N0ZXAoJ1dhcm5pbmc6IEJhdGNoIHByb2Nlc3NpbmcgdG9nZ2xlIChGbGQxXzEpIG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgdGFzayBkZXNjcmlwdGlvbiBpZiBwcm92aWRlZCBhbmQgYmF0Y2ggaXMgZW5hYmxlZCAoRmxkMl8xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgdGFza0Rlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkMl8xJywgdGFza0Rlc2NyaXB0aW9uKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGJhdGNoIGdyb3VwIGlmIHByb3ZpZGVkIGFuZCBiYXRjaCBpcyBlbmFibGVkIChGbGQzXzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBiYXRjaEdyb3VwKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkM18xJywgYmF0Y2hHcm91cCk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBQcml2YXRlIGFuZCBDcml0aWNhbCBvcHRpb25zIGlmIHByb3ZpZGVkIChGbGQ0XzEgYW5kIEZsZDVfMSlcclxuICAgIGlmIChlbmFibGVkICYmIG9wdGlvbnMucHJpdmF0ZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q2hlY2tib3goJ0ZsZDRfMScsIG9wdGlvbnMucHJpdmF0ZSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChlbmFibGVkICYmIG9wdGlvbnMuY3JpdGljYWxKb2IgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGF3YWl0IHNldENoZWNrYm94KCdGbGQ1XzEnLCBvcHRpb25zLmNyaXRpY2FsSm9iKTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IE1vbml0b3JpbmcgY2F0ZWdvcnkgaWYgc3BlY2lmaWVkIChGbGQ2XzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLm1vbml0b3JpbmdDYXRlZ29yeSkge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoJ0ZsZDZfMScsIG9wdGlvbnMubW9uaXRvcmluZ0NhdGVnb3J5KTtcclxuICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdBTklNQVRJT05fREVMQVknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcCgnQmF0Y2ggcHJvY2Vzc2luZyBjb25maWd1cmVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVSZWN1cnJlbmNlKHN0ZXApIHtcclxuICAgIGNvbnN0IHsgcGF0dGVyblVuaXQsIHBhdHRlcm5Db3VudCwgZW5kRGF0ZU9wdGlvbiwgZW5kQWZ0ZXJDb3VudCwgZW5kQnlEYXRlLCBzdGFydERhdGUsIHN0YXJ0VGltZSwgdGltZXpvbmUgfSA9IHN0ZXA7XHJcbiAgICBcclxuICAgIGNvbnN0IHBhdHRlcm5Vbml0cyA9IFsnbWludXRlcycsICdob3VycycsICdkYXlzJywgJ3dlZWtzJywgJ21vbnRocycsICd5ZWFycyddO1xyXG4gICAgbG9nU3RlcChgQ29uZmlndXJpbmcgcmVjdXJyZW5jZTogZXZlcnkgJHtwYXR0ZXJuQ291bnR9ICR7cGF0dGVyblVuaXRzW3BhdHRlcm5Vbml0IHx8IDBdfWApO1xyXG4gICAgXHJcbiAgICAvLyBDbGljayBSZWN1cnJlbmNlIGJ1dHRvbiB0byBvcGVuIGRpYWxvZyBpZiBub3QgYWxyZWFkeSBvcGVuXHJcbiAgICBsZXQgcmVjdXJyZW5jZUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUmVjdXJyZW5jZVwiXScpO1xyXG4gICAgaWYgKCFyZWN1cnJlbmNlRm9ybSkge1xyXG4gICAgICAgIC8vIE1udUl0bV8xIGlzIHRoZSBSZWN1cnJlbmNlIGJ1dHRvbiBpbiBTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cclxuICAgICAgICBjb25zdCByZWN1cnJlbmNlQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXSBbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNbnVJdG1fMVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoJ01udUl0bV8xJyk7XHJcbiAgICAgICAgaWYgKHJlY3VycmVuY2VCdXR0b24pIHtcclxuICAgICAgICAgICAgcmVjdXJyZW5jZUJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdWQUxJREFUSU9OX1dBSVQnKTtcclxuICAgICAgICAgICAgcmVjdXJyZW5jZUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUmVjdXJyZW5jZVwiXScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFyZWN1cnJlbmNlRm9ybSkge1xyXG4gICAgICAgIGxvZ1N0ZXAoJ1dhcm5pbmc6IENvdWxkIG5vdCBvcGVuIFN5c1JlY3VycmVuY2UgZGlhbG9nJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gZmluZCBlbGVtZW50IHdpdGhpbiByZWN1cnJlbmNlIGZvcm1cclxuICAgIGNvbnN0IGZpbmRJblJlY3VycmVuY2UgPSAobmFtZSkgPT4gcmVjdXJyZW5jZUZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtuYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICAvLyBTZXQgc3RhcnQgZGF0ZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHN0YXJ0RGF0ZSkge1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0RGF0ZUlucHV0ID0gZmluZEluUmVjdXJyZW5jZSgnU3RhcnREYXRlJyk/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEluUmVjdXJyZW5jZSgnU3RhcnREYXRlJyk7XHJcbiAgICAgICAgaWYgKHN0YXJ0RGF0ZUlucHV0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oc3RhcnREYXRlSW5wdXQsIHN0YXJ0RGF0ZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHN0YXJ0IHRpbWUgaWYgcHJvdmlkZWRcclxuICAgIGlmIChzdGFydFRpbWUpIHtcclxuICAgICAgICBjb25zdCBzdGFydFRpbWVJbnB1dCA9IGZpbmRJblJlY3VycmVuY2UoJ1N0YXJ0VGltZScpPy5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmRJblJlY3VycmVuY2UoJ1N0YXJ0VGltZScpO1xyXG4gICAgICAgIGlmIChzdGFydFRpbWVJbnB1dCkge1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKHN0YXJ0VGltZUlucHV0LCBzdGFydFRpbWUpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCB0aW1lem9uZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHRpbWV6b25lKSB7XHJcbiAgICAgICAgY29uc3QgdGltZXpvbmVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnVGltZXpvbmUnKTtcclxuICAgICAgICBpZiAodGltZXpvbmVDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gdGltZXpvbmVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgdGltZXpvbmUpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBwYXR0ZXJuIHVuaXQgKHJhZGlvIGJ1dHRvbnM6IE1pbnV0ZXM9MCwgSG91cnM9MSwgRGF5cz0yLCBXZWVrcz0zLCBNb250aHM9NCwgWWVhcnM9NSlcclxuICAgIGlmIChwYXR0ZXJuVW5pdCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgY29uc3QgcGF0dGVyblVuaXRDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnUGF0dGVyblVuaXQnKTtcclxuICAgICAgICBpZiAocGF0dGVyblVuaXRDb250cm9sKSB7XHJcbiAgICAgICAgICAgIC8vIFJhZGlvIGJ1dHRvbnMgYXJlIHR5cGljYWxseSByZW5kZXJlZCBhcyBhIGdyb3VwIHdpdGggbXVsdGlwbGUgb3B0aW9uc1xyXG4gICAgICAgICAgICBjb25zdCByYWRpb0lucHV0cyA9IHBhdHRlcm5Vbml0Q29udHJvbC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0nKTtcclxuICAgICAgICAgICAgaWYgKHJhZGlvSW5wdXRzLmxlbmd0aCA+IHBhdHRlcm5Vbml0KSB7XHJcbiAgICAgICAgICAgICAgICByYWRpb0lucHV0c1twYXR0ZXJuVW5pdF0uY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7IC8vIFdhaXQgZm9yIFVJIHRvIHVwZGF0ZSB3aXRoIGFwcHJvcHJpYXRlIGludGVydmFsIGZpZWxkXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUcnkgY2xpY2tpbmcgdGhlIG50aCBvcHRpb24gbGFiZWwvYnV0dG9uXHJcbiAgICAgICAgICAgICAgICBjb25zdCByYWRpb09wdGlvbnMgPSBwYXR0ZXJuVW5pdENvbnRyb2wucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJyYWRpb1wiXSwgbGFiZWwsIGJ1dHRvbicpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJhZGlvT3B0aW9ucy5sZW5ndGggPiBwYXR0ZXJuVW5pdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJhZGlvT3B0aW9uc1twYXR0ZXJuVW5pdF0uY2xpY2soKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdERUZBVUxUX1dBSVRfU1RFUF9ERUxBWScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgaW50ZXJ2YWwgY291bnQgYmFzZWQgb24gcGF0dGVybiB1bml0XHJcbiAgICAvLyBUaGUgdmlzaWJsZSBpbnB1dCBmaWVsZCBjaGFuZ2VzIGJhc2VkIG9uIHNlbGVjdGVkIHBhdHRlcm4gdW5pdFxyXG4gICAgaWYgKHBhdHRlcm5Db3VudCkge1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbE5hbWVzID0gWydNaW51dGVJbnQnLCAnSG91ckludCcsICdEYXlJbnQnLCAnV2Vla0ludCcsICdNb250aEludCcsICdZZWFySW50J107XHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sTmFtZSA9IGNvdW50Q29udHJvbE5hbWVzW3BhdHRlcm5Vbml0IHx8IDBdO1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoY291bnRDb250cm9sTmFtZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvdW50Q29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGNvdW50Q29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGNvdW50Q29udHJvbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgcGF0dGVybkNvdW50LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBlbmQgZGF0ZSBvcHRpb25zXHJcbiAgICBpZiAoZW5kRGF0ZU9wdGlvbiA9PT0gJ25vRW5kRGF0ZScpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIk5vIGVuZCBkYXRlXCIgZ3JvdXAgKEVuZERhdGUxKVxyXG4gICAgICAgIGNvbnN0IG5vRW5kRGF0ZUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTEnKTtcclxuICAgICAgICBpZiAobm9FbmREYXRlR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBub0VuZERhdGVHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBub0VuZERhdGVHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQWZ0ZXInICYmIGVuZEFmdGVyQ291bnQpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIkVuZCBhZnRlclwiIGdyb3VwIChFbmREYXRlMikgYW5kIHNldCBjb3VudFxyXG4gICAgICAgIGNvbnN0IGVuZEFmdGVyR3JvdXAgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlMicpO1xyXG4gICAgICAgIGlmIChlbmRBZnRlckdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJhZGlvID0gZW5kQWZ0ZXJHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBlbmRBZnRlckdyb3VwO1xyXG4gICAgICAgICAgICByYWRpby5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gU2V0IHRoZSBjb3VudCAoRW5kRGF0ZUludClcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlSW50Jyk7XHJcbiAgICAgICAgaWYgKGNvdW50Q29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGNvdW50Q29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGNvdW50Q29udHJvbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgZW5kQWZ0ZXJDb3VudC50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQnknICYmIGVuZEJ5RGF0ZSkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGJ5XCIgZ3JvdXAgKEVuZERhdGUzKSBhbmQgc2V0IGRhdGVcclxuICAgICAgICBjb25zdCBlbmRCeUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTMnKTtcclxuICAgICAgICBpZiAoZW5kQnlHcm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCByYWRpbyA9IGVuZEJ5R3JvdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdLCBbcm9sZT1cInJhZGlvXCJdJykgfHwgZW5kQnlHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFNldCB0aGUgZW5kIGRhdGUgKEVuZERhdGVEYXRlKVxyXG4gICAgICAgIGNvbnN0IGRhdGVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZURhdGUnKTtcclxuICAgICAgICBpZiAoZGF0ZUNvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBkYXRlQ29udHJvbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGRhdGVDb250cm9sO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBlbmRCeURhdGUpO1xyXG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdVSV9VUERBVEVfREVMQVknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoJ1JlY3VycmVuY2UgY29uZmlndXJlZCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dEVsZW1lbnQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGlmICghaW5wdXRFbGVtZW50KSByZXR1cm47XHJcbiAgICBcclxuICAgIC8vIEZvY3VzIHRoZSBpbnB1dFxyXG4gICAgaW5wdXRFbGVtZW50LmZvY3VzKCk7XHJcbiAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdJTlBVVF9TRVRUTEVfREVMQVknKTtcclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgZXhpc3RpbmcgdmFsdWVcclxuICAgIGlucHV0RWxlbWVudC5zZWxlY3Q/LigpO1xyXG4gICAgXHJcbiAgICBpZiAoY29tYm9NZXRob2RPdmVycmlkZSAmJiBpbnB1dEVsZW1lbnQudGFnTmFtZSAhPT0gJ1NFTEVDVCcpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0RWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBLZWVwIGV4aXN0aW5nIGJlaGF2aW9yIGZvciBjYWxsZXJzIHRoYXQgZG8gbm90IHJlcXVlc3QgYW4gb3ZlcnJpZGVcclxuICAgICAgICBpbnB1dEVsZW1lbnQudmFsdWUgPSB2YWx1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZXZlbnRzXHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRGaWx0ZXJNZXRob2QoZmlsdGVyQ29udGFpbmVyLCBtZXRob2QpIHtcclxuICAgIC8vIEZpbmQgdGhlIGZpbHRlciBvcGVyYXRvciBkcm9wZG93biBuZWFyIHRoZSBmaWx0ZXIgaW5wdXRcclxuICAgIC8vIEQzNjUgdXNlcyB2YXJpb3VzIHBhdHRlcm5zIGZvciB0aGUgb3BlcmF0b3IgZHJvcGRvd25cclxuICAgIGNvbnN0IG9wZXJhdG9yUGF0dGVybnMgPSBbXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJPcGVyYXRvclwiXScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJfT3BlcmF0b3JcIl0nLFxyXG4gICAgICAgICcuZmlsdGVyLW9wZXJhdG9yJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSdcclxuICAgIF07XHJcbiAgICBcclxuICAgIGxldCBvcGVyYXRvckRyb3Bkb3duID0gbnVsbDtcclxuICAgIGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IGZpbHRlckNvbnRhaW5lcj8ucGFyZW50RWxlbWVudCB8fCBkb2N1bWVudDtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIG9wZXJhdG9yUGF0dGVybnMpIHtcclxuICAgICAgICBvcGVyYXRvckRyb3Bkb3duID0gc2VhcmNoQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IocGF0dGVybik7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yRHJvcGRvd24gJiYgb3BlcmF0b3JEcm9wZG93bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIW9wZXJhdG9yRHJvcGRvd24pIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENsaWNrIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBjb25zdCBkcm9wZG93bkJ1dHRvbiA9IG9wZXJhdG9yRHJvcGRvd24ucXVlcnlTZWxlY3RvcignYnV0dG9uLCBbcm9sZT1cImNvbWJvYm94XCJdLCAuZHluLWNvbWJvQm94LWJ1dHRvbicpIHx8IG9wZXJhdG9yRHJvcGRvd247XHJcbiAgICBkcm9wZG93bkJ1dHRvbi5jbGljaygpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgYW5kIGNsaWNrIHRoZSBtYXRjaGluZyBvcHRpb25cclxuICAgIGNvbnN0IHNlYXJjaFRlcm1zID0gZ2V0RmlsdGVyTWV0aG9kU2VhcmNoVGVybXMobWV0aG9kKTtcclxuICAgIFxyXG4gICAgLy8gTG9vayBmb3Igb3B0aW9ucyBpbiBsaXN0Ym94L2Ryb3Bkb3duXHJcbiAgICBjb25zdCBvcHRpb25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJvcHRpb25cIl0sIFtyb2xlPVwibGlzdGl0ZW1cIl0sIC5keW4tbGlzdFZpZXctaXRlbScpO1xyXG4gICAgZm9yIChjb25zdCBvcHQgb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBvcHQudGV4dENvbnRlbnQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBpZiAodGV4dEluY2x1ZGVzQW55KHRleHQsIHNlYXJjaFRlcm1zKSkge1xyXG4gICAgICAgICAgICBvcHQuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSBzZWxlY3QgZWxlbWVudFxyXG4gICAgY29uc3Qgc2VsZWN0RWwgPSBvcGVyYXRvckRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgaWYgKHNlbGVjdEVsKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBvcHQgb2Ygc2VsZWN0RWwub3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gb3B0LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0SW5jbHVkZXNBbnkodGV4dCwgc2VhcmNoVGVybXMpKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxlY3RFbC52YWx1ZSA9IG9wdC52YWx1ZTtcclxuICAgICAgICAgICAgICAgIHNlbGVjdEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFJhZGlvQnV0dG9uVmFsdWUoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIGxvZ1N0ZXAoYFNldHRpbmcgcmFkaW8gYnV0dG9uIHZhbHVlOiAke3ZhbHVlfWApO1xyXG4gICAgXHJcbiAgICAvLyBGaW5kIGFsbCByYWRpbyBvcHRpb25zIGluIHRoaXMgZ3JvdXBcclxuICAgIGNvbnN0IHJhZGlvSW5wdXRzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0nKTtcclxuICAgIGNvbnN0IHJhZGlvUm9sZXMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicmFkaW9cIl0nKTtcclxuICAgIGNvbnN0IG9wdGlvbnMgPSByYWRpb0lucHV0cy5sZW5ndGggPiAwID8gQXJyYXkuZnJvbShyYWRpb0lucHV0cykgOiBBcnJheS5mcm9tKHJhZGlvUm9sZXMpO1xyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAvLyBUcnkgZmluZGluZyBjbGlja2FibGUgbGFiZWxzL2J1dHRvbnMgdGhhdCBhY3QgYXMgcmFkaW8gb3B0aW9uc1xyXG4gICAgICAgIGNvbnN0IGxhYmVsQnV0dG9ucyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnbGFiZWwsIGJ1dHRvbiwgW2RhdGEtZHluLXJvbGU9XCJSYWRpb0J1dHRvblwiXScpO1xyXG4gICAgICAgIG9wdGlvbnMucHVzaCguLi5BcnJheS5mcm9tKGxhYmVsQnV0dG9ucykpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIHJhZGlvIG9wdGlvbnMgZm91bmQgaW4gZWxlbWVudGApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBGb3VuZCAke29wdGlvbnMubGVuZ3RofSByYWRpbyBvcHRpb25zYCk7XHJcbiAgICBcclxuICAgIC8vIFRyeSB0byBtYXRjaCBieSBpbmRleCAoaWYgdmFsdWUgaXMgYSBudW1iZXIgb3IgbnVtZXJpYyBzdHJpbmcpXHJcbiAgICBjb25zdCBudW1WYWx1ZSA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XHJcbiAgICBpZiAoIWlzTmFOKG51bVZhbHVlKSAmJiBudW1WYWx1ZSA+PSAwICYmIG51bVZhbHVlIDwgb3B0aW9ucy5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXRPcHRpb24gPSBvcHRpb25zW251bVZhbHVlXTtcclxuICAgICAgICBsb2dTdGVwKGBDbGlja2luZyByYWRpbyBvcHRpb24gYXQgaW5kZXggJHtudW1WYWx1ZX1gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDbGljayB0aGUgcmFkaW8gb3B0aW9uIG9yIGl0cyBhc3NvY2lhdGVkIGxhYmVsXHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSB0YXJnZXRPcHRpb24udGFnTmFtZSA9PT0gJ0lOUFVUJyBcclxuICAgICAgICAgICAgPyAodGFyZ2V0T3B0aW9uLmNsb3Nlc3QoJ2xhYmVsJykgfHwgdGFyZ2V0T3B0aW9uLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJykgfHwgdGFyZ2V0T3B0aW9uKVxyXG4gICAgICAgICAgICA6IHRhcmdldE9wdGlvbjtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEaXNwYXRjaCBmdWxsIGNsaWNrIHNlcXVlbmNlXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJ1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIHRyeSBjbGlja2luZyB0aGUgaW5wdXQgZGlyZWN0bHlcclxuICAgICAgICBpZiAodGFyZ2V0T3B0aW9uLnRhZ05hbWUgPT09ICdJTlBVVCcpIHtcclxuICAgICAgICAgICAgdGFyZ2V0T3B0aW9uLmNoZWNrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICB0YXJnZXRPcHRpb24uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gbWF0Y2ggYnkgbGFiZWwgdGV4dFxyXG4gICAgY29uc3Qgc2VhcmNoVmFsdWUgPSBTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgbGFiZWwgPSBvcHRpb24uY2xvc2VzdCgnbGFiZWwnKSB8fCBvcHRpb24ucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcignbGFiZWwnKTtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkudG9Mb3dlckNhc2UoKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICBvcHRpb24uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LnRvTG93ZXJDYXNlKCkgfHxcclxuICAgICAgICAgICAgICAgICAgICBvcHRpb24udGV4dENvbnRlbnQ/LnRyaW0oKS50b0xvd2VyQ2FzZSgpIHx8ICcnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0ZXh0LmluY2x1ZGVzKHNlYXJjaFZhbHVlKSB8fCBzZWFyY2hWYWx1ZS5pbmNsdWRlcyh0ZXh0KSkge1xyXG4gICAgICAgICAgICBsb2dTdGVwKGBDbGlja2luZyByYWRpbyBvcHRpb24gd2l0aCB0ZXh0OiAke3RleHR9YCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gbGFiZWwgfHwgb3B0aW9uO1xyXG4gICAgICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG9wdGlvbi50YWdOYW1lID09PSAnSU5QVVQnKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb24uY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBvcHRpb24uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RFRkFVTFRfV0FJVF9TVEVQX0RFTEFZJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcihgUmFkaW8gb3B0aW9uIG5vdCBmb3VuZCBmb3IgdmFsdWU6ICR7dmFsdWV9YCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRTZWdtZW50ZWRFbnRyeVZhbHVlKGVsZW1lbnQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBTZWdtZW50ZWRFbnRyeScpO1xyXG5cclxuICAgIC8vIEZpbmQgdGhlIGxvb2t1cCBidXR0b25cclxuICAgIGNvbnN0IGxvb2t1cEJ1dHRvbiA9IGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGxvb2t1cCBidXR0b24sIHRyeSBrZXlib2FyZCB0byBvcGVuIHRoZSBmbHlvdXQgZmlyc3RcclxuICAgIGlmICghbG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgb3Blbkxvb2t1cEJ5S2V5Ym9hcmQoaW5wdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENsaWNrIHRoZSBsb29rdXAgYnV0dG9uIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBpZiAobG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgbG9va3VwQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQ0xJQ0tfQU5JTUFUSU9OX0RFTEFZJyk7IC8vIFdhaXQgZm9yIGxvb2t1cCB0byBsb2FkXHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCB0aGUgbG9va3VwIHBvcHVwL2ZseW91dFxyXG4gICAgY29uc3QgbG9va3VwUG9wdXAgPSBhd2FpdCB3YWl0Rm9yTG9va3VwUG9wdXAoKTtcclxuICAgIGlmICghbG9va3VwUG9wdXApIHtcclxuICAgICAgICBpZiAoIXdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3M/LnN1cHByZXNzTG9va3VwV2FybmluZ3MpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdMb29rdXAgcG9wdXAgbm90IGZvdW5kLCB0cnlpbmcgZGlyZWN0IGlucHV0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgYSBkb2NrZWQgbG9va3VwIGZseW91dCBleGlzdHMgKHNlZ21lbnRlZCBlbnRyeSksIHR5cGUgaW50byBpdHMgZmlsdGVyIGlucHV0XHJcbiAgICBjb25zdCBkb2NrID0gYXdhaXQgd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KGVsZW1lbnQsIDE1MDApO1xyXG4gICAgaWYgKGRvY2spIHtcclxuICAgICAgICBjb25zdCBkb2NrSW5wdXQgPSBmaW5kTG9va3VwRmlsdGVySW5wdXQoZG9jayk7XHJcbiAgICAgICAgaWYgKGRvY2tJbnB1dCkge1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnUVVJQ0tfUkVUUllfREVMQVknKTtcclxuICAgICAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChkb2NrSW5wdXQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlKTtcclxuICAgICAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGRvY2tJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnQ0xJQ0tfQU5JTUFUSU9OX0RFTEFZJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFR5cGUgdmFsdWUgaW4gdGhlIHNlYXJjaC9maWx0ZXIgZmllbGQgb2YgdGhlIGxvb2t1cFxyXG4gICAgY29uc3QgbG9va3VwSW5wdXQgPSBsb29rdXBQb3B1cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwidGV4dFwiXSwgaW5wdXRbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmIChsb29rdXBJbnB1dCkge1xyXG4gICAgICAgIGxvb2t1cElucHV0LmNsaWNrPy4oKTtcclxuICAgICAgICBsb29rdXBJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1FVSUNLX1JFVFJZX0RFTEFZJyk7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChsb29rdXBJbnB1dCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgIGxvb2t1cElucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVkFMSURBVElPTl9XQUlUJyk7IC8vIFdhaXQgZm9yIHNlcnZlciBmaWx0ZXJcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBhbmQgY2xpY2sgdGhlIG1hdGNoaW5nIHJvd1xyXG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cFBvcHVwLCBlbGVtZW50LCA1MDAwKTtcclxuICAgIGxldCBmb3VuZE1hdGNoID0gZmFsc2U7XHJcbiAgICBcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm93LnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XHJcbiAgICAgICAgaWYgKHRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSByb3cucXVlcnlTZWxlY3RvcignW3JvbGU9XCJncmlkY2VsbFwiXSwgdGQnKTtcclxuICAgICAgICAgICAgKGNlbGwgfHwgcm93KS5jbGljaygpO1xyXG4gICAgICAgICAgICBmb3VuZE1hdGNoID0gdHJ1ZTtcclxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnREVGQVVMVF9XQUlUX1NURVBfREVMQVknKTtcclxuICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFmb3VuZE1hdGNoKSB7XHJcbiAgICAgICAgY29uc3Qgc2FtcGxlID0gQXJyYXkuZnJvbShyb3dzKS5zbGljZSgwLCA4KS5tYXAociA9PiByLnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykpO1xyXG4gICAgICAgIGlmICghd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uc3VwcHJlc3NMb29rdXBXYXJuaW5ncykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ05vIG1hdGNoaW5nIGxvb2t1cCB2YWx1ZSBmb3VuZCwgY2xvc2luZyBwb3B1cCcsIHsgdmFsdWUsIHNhbXBsZSB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gVHJ5IHRvIGNsb3NlIHRoZSBwb3B1cFxyXG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gbG9va3VwUG9wdXAucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiQ2xvc2VcIl0sIC5jbG9zZS1idXR0b24nKTtcclxuICAgICAgICBpZiAoY2xvc2VCdG4pIGNsb3NlQnRuLmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gZGlyZWN0IHR5cGluZ1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldENvbWJvQm94VmFsdWUoZWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUgPSAnJykge1xyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0sIHNlbGVjdCcpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gQ29tYm9Cb3gnKTtcclxuXHJcbiAgICAvLyBJZiBpdCdzIGEgbmF0aXZlIHNlbGVjdCwgdXNlIG9wdGlvbiBzZWxlY3Rpb25cclxuICAgIGlmIChpbnB1dC50YWdOYW1lID09PSAnU0VMRUNUJykge1xyXG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBBcnJheS5mcm9tKGlucHV0Lm9wdGlvbnMpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IG9wdGlvbnMuZmluZChvcHQgPT4gb3B0LnRleHQudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IFN0cmluZyh2YWx1ZSkudG9Mb3dlckNhc2UoKSkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLmZpbmQob3B0ID0+IG9wdC50ZXh0LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpKSk7XHJcbiAgICAgICAgaWYgKCF0YXJnZXQpIHRocm93IG5ldyBFcnJvcihgT3B0aW9uIG5vdCBmb3VuZDogJHt2YWx1ZX1gKTtcclxuICAgICAgICBpbnB1dC52YWx1ZSA9IHRhcmdldC52YWx1ZTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9wZW4gdGhlIGRyb3Bkb3duIChidXR0b24gcHJlZmVycmVkKVxyXG4gICAgY29uc3QgY29tYm9CdXR0b24gPSBmaW5kQ29tYm9Cb3hCdXR0b24oZWxlbWVudCk7XHJcbiAgICBpZiAoY29tYm9CdXR0b24pIHtcclxuICAgICAgICBjb21ib0J1dHRvbi5jbGljaygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBpbnB1dC5jbGljaz8uKCk7XHJcbiAgICB9XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgd2FpdEZvclRpbWluZygnQU5JTUFUSU9OX0RFTEFZJyk7XHJcblxyXG4gICAgLy8gVHJ5IHR5cGluZyB0byBmaWx0ZXIgd2hlbiBhbGxvd2VkICh1c2Ugc2VsZWN0ZWQgaW5wdXQgbWV0aG9kKVxyXG4gICAgaWYgKCFpbnB1dC5yZWFkT25seSAmJiAhaW5wdXQuZGlzYWJsZWQpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBsaXN0Ym94IG5lYXIgdGhlIGZpZWxkIG9yIGxpbmtlZCB2aWEgYXJpYS1jb250cm9sc1xyXG4gICAgY29uc3QgbGlzdGJveCA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsaXN0Ym94KSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IHByZXNzIEVudGVyIHRvIGNvbW1pdCB0eXBlZCB2YWx1ZVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnVUlfVVBEQVRFX0RFTEFZJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG9wdGlvbnMgPSBjb2xsZWN0Q29tYm9PcHRpb25zKGxpc3Rib3gpO1xyXG4gICAgY29uc3Qgc2VhcmNoID0gbm9ybWFsaXplVGV4dCh2YWx1ZSk7XHJcbiAgICBsZXQgbWF0Y2hlZCA9IGZhbHNlO1xyXG4gICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KG9wdGlvbi50ZXh0Q29udGVudCk7XHJcbiAgICAgICAgaWYgKHRleHQgPT09IHNlYXJjaCB8fCB0ZXh0LmluY2x1ZGVzKHNlYXJjaCkpIHtcclxuICAgICAgICAgICAgLy8gVHJ5IHRvIG1hcmsgc2VsZWN0aW9uIGZvciBBUklBLWJhc2VkIGNvbWJvYm94ZXNcclxuICAgICAgICAgICAgb3B0aW9ucy5mb3JFYWNoKG9wdCA9PiBvcHQuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ2ZhbHNlJykpO1xyXG4gICAgICAgICAgICBvcHRpb24uc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ3RydWUnKTtcclxuICAgICAgICAgICAgaWYgKCFvcHRpb24uaWQpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbi5pZCA9IGBkMzY1b3B0XyR7RGF0ZS5ub3coKX1fJHtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMCl9YDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcsIG9wdGlvbi5pZCk7XHJcblxyXG4gICAgICAgICAgICBvcHRpb24uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnIH0pO1xyXG4gICAgICAgICAgICBjb25zdCBvcHRpb25UZXh0ID0gb3B0aW9uLnRleHRDb250ZW50LnRyaW0oKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENsaWNrIHRoZSBvcHRpb24gdG8gc2VsZWN0IGl0XHJcbiAgICAgICAgICAgIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZShvcHRpb24pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IHdhaXRGb3JJbnB1dFZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCA4MDApO1xyXG4gICAgICAgICAgICBpZiAoIWFwcGxpZWQpIHtcclxuICAgICAgICAgICAgICAgIC8vIFNvbWUgRDM2NSBjb21ib3MgY29tbWl0IG9uIGtleSBzZWxlY3Rpb24gcmF0aGVyIHRoYW4gY2xpY2tcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdBcnJvd0Rvd24nLCBjb2RlOiAnQXJyb3dEb3duJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEZvcmNlIGlucHV0IHZhbHVlIHVwZGF0ZSBmb3IgRDM2NSBjb21ib2JveGVzXHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1BPU1RfSU5QVVRfREVMQVknKTtcclxuICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZVRleHQoaW5wdXQudmFsdWUpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvblRleHQpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21taXRDb21ib1ZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIGlucHV0LnZhbHVlLCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ1VJX1VQREFURV9ERUxBWScpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFtYXRjaGVkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBPcHRpb24gbm90IGZvdW5kOiAke3ZhbHVlfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0Q2hlY2tib3goY29udHJvbE5hbWUsIGNoZWNrZWQpIHtcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICBpZiAoIWNvbnRhaW5lcikge1xyXG4gICAgICAgIGxvZ1N0ZXAoYFdhcm5pbmc6IENoZWNrYm94ICR7Y29udHJvbE5hbWV9IG5vdCBmb3VuZGApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgY2hlY2tib3ggPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXIucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXScpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBjaGVja2JveD8uY2hlY2tlZCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpO1xyXG4gICAgXHJcbiAgICBpZiAoY3VycmVudFN0YXRlICE9PSBjaGVja2VkKSB7XHJcbiAgICAgICAgY29uc3QgY2xpY2tUYXJnZXQgPSBjaGVja2JveCB8fCBjb250YWluZXIucXVlcnlTZWxlY3RvcignbGFiZWwsIGJ1dHRvbicpIHx8IGNvbnRhaW5lcjtcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgfVxyXG59XHJcbiIsICJpbXBvcnQgRDM2NUluc3BlY3RvciBmcm9tICcuL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzJztcbmltcG9ydCB7IGxvZ1N0ZXAsIHNlbmRMb2cgfSBmcm9tICcuL3V0aWxzL2xvZ2dpbmcuanMnO1xuaW1wb3J0IHsgc2xlZXAgfSBmcm9tICcuL3V0aWxzL2FzeW5jLmpzJztcbmltcG9ydCB7IGNvZXJjZUJvb2xlYW4sIG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuL3V0aWxzL3RleHQuanMnO1xuaW1wb3J0IHsgTmF2aWdhdGlvbkludGVycnVwdEVycm9yIH0gZnJvbSAnLi9ydW50aW1lL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBnZXRTdGVwRXJyb3JDb25maWcsIGZpbmRMb29wUGFpcnMsIGZpbmRJZlBhaXJzIH0gZnJvbSAnLi9ydW50aW1lL2VuZ2luZS11dGlscy5qcyc7XG5pbXBvcnQgeyBldmFsdWF0ZUNvbmRpdGlvbiB9IGZyb20gJy4vcnVudGltZS9jb25kaXRpb25zLmpzJztcbmltcG9ydCB7IGdldFdvcmtmbG93VGltaW5ncyB9IGZyb20gJy4vcnVudGltZS90aW1pbmcuanMnO1xuaW1wb3J0IHsgY2xpY2tFbGVtZW50LCBhcHBseUdyaWRGaWx0ZXIsIHdhaXRVbnRpbENvbmRpdGlvbiwgc2V0SW5wdXRWYWx1ZSwgc2V0R3JpZENlbGxWYWx1ZSwgc2V0TG9va3VwU2VsZWN0VmFsdWUsIHNldENoZWNrYm94VmFsdWUsIG5hdmlnYXRlVG9Gb3JtLCBhY3RpdmF0ZVRhYiwgYWN0aXZhdGVBY3Rpb25QYW5lVGFiLCBleHBhbmRPckNvbGxhcHNlU2VjdGlvbiwgY29uZmlndXJlUXVlcnlGaWx0ZXIsIGNvbmZpZ3VyZUJhdGNoUHJvY2Vzc2luZywgY2xvc2VEaWFsb2csIGNvbmZpZ3VyZVJlY3VycmVuY2UgfSBmcm9tICcuL3N0ZXBzL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsIGlzRWxlbWVudFZpc2libGUsIGlzRDM2NUxvYWRpbmcsIGluc3BlY3RHcmlkU3RhdGUgfSBmcm9tICcuL3V0aWxzL2RvbS5qcyc7XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0SW5qZWN0ZWQoeyB3aW5kb3dPYmogPSBnbG9iYWxUaGlzLndpbmRvdywgZG9jdW1lbnRPYmogPSBnbG9iYWxUaGlzLmRvY3VtZW50LCBpbnNwZWN0b3JGYWN0b3J5ID0gKCkgPT4gbmV3IEQzNjVJbnNwZWN0b3IoKSB9ID0ge30pIHtcbiAgICBpZiAoIXdpbmRvd09iaiB8fCAhZG9jdW1lbnRPYmopIHtcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ21pc3Npbmctd2luZG93LW9yLWRvY3VtZW50JyB9O1xuICAgIH1cbiAgICBjb25zdCB3aW5kb3cgPSB3aW5kb3dPYmo7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBkb2N1bWVudE9iajtcbiAgICBjb25zdCBuYXZpZ2F0b3IgPSB3aW5kb3dPYmoubmF2aWdhdG9yIHx8IGdsb2JhbFRoaXMubmF2aWdhdG9yO1xuXG4gICAgd2luZG93LkQzNjVJbnNwZWN0b3IgPSBEMzY1SW5zcGVjdG9yO1xuXG4gICAgLy8gPT09PT09IEluaXRpYWxpemUgYW5kIExpc3RlbiBmb3IgTWVzc2FnZXMgPT09PT09XG5cbiAgICAvLyBQcmV2ZW50IGR1cGxpY2F0ZSBpbml0aWFsaXphdGlvblxuICAgIGlmICh3aW5kb3cuZDM2NUluamVjdGVkU2NyaXB0TG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdEMzY1IGluamVjdGVkIHNjcmlwdCBhbHJlYWR5IGxvYWRlZCwgc2tpcHBpbmcuLi4nKTtcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ2FscmVhZHktbG9hZGVkJyB9O1xuICAgIH1cblxuICAgIHdpbmRvdy5kMzY1SW5qZWN0ZWRTY3JpcHRMb2FkZWQgPSB0cnVlO1xuXG4gICAgLy8gQ3JlYXRlIGluc3BlY3RvciBpbnN0YW5jZVxuICAgIGNvbnN0IGluc3BlY3RvciA9IGluc3BlY3RvckZhY3RvcnkoKTtcblxuICAgIC8vID09PT09PSBXb3JrZmxvdyBFeGVjdXRpb24gRW5naW5lID09PT09PVxuICAgIGxldCBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IHt9O1xuICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncztcbiAgICBjb25zdCBnZXRUaW1pbmdzID0gKCkgPT4gZ2V0V29ya2Zsb3dUaW1pbmdzKGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzKTtcbiAgICBjb25zdCB3YWl0Rm9yVGltaW5nID0gYXN5bmMgKGtleSkgPT4ge1xuICAgICAgICBhd2FpdCBzbGVlcChnZXRUaW1pbmdzKClba2V5XSk7XG4gICAgfTtcbiAgICBsZXQgY3VycmVudFdvcmtmbG93ID0gbnVsbDtcbiAgICBsZXQgZXhlY3V0aW9uQ29udHJvbCA9IHtcbiAgICAgICAgaXNQYXVzZWQ6IGZhbHNlLFxuICAgICAgICBpc1N0b3BwZWQ6IGZhbHNlLFxuICAgICAgICBjdXJyZW50U3RlcEluZGV4OiAwLFxuICAgICAgICBjdXJyZW50Um93SW5kZXg6IDAsXG4gICAgICAgIHRvdGFsUm93czogMCxcbiAgICAgICAgcHJvY2Vzc2VkUm93czogMCxcbiAgICAgICAgY3VycmVudERhdGFSb3c6IG51bGwsXG4gICAgICAgIHBlbmRpbmdGbG93U2lnbmFsOiAnbm9uZScsXG4gICAgICAgIHBlbmRpbmdJbnRlcnJ1cHRpb25EZWNpc2lvbjogbnVsbCxcbiAgICAgICAgcnVuT3B0aW9uczoge1xuICAgICAgICAgICAgc2tpcFJvd3M6IDAsXG4gICAgICAgICAgICBsaW1pdFJvd3M6IDAsXG4gICAgICAgICAgICBkcnlSdW46IGZhbHNlLFxuICAgICAgICAgICAgbGVhcm5pbmdNb2RlOiBmYWxzZSxcbiAgICAgICAgICAgIHJ1blVudGlsSW50ZXJjZXB0aW9uOiBmYWxzZVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIFNpbmdsZSB1bmlmaWVkIG1lc3NhZ2UgbGlzdGVuZXJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoZXZlbnQuc291cmNlICE9PSB3aW5kb3cpIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIC8vIERpc2NvdmVyeSByZXF1ZXN0c1xuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9ESVNDT1ZFUl9FTEVNRU5UUycpIHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUZvcm1Pbmx5ID0gZXZlbnQuZGF0YS5hY3RpdmVGb3JtT25seSB8fCBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gaW5zcGVjdG9yLmRpc2NvdmVyRWxlbWVudHMoYWN0aXZlRm9ybU9ubHkpO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRm9ybSA9IGluc3BlY3Rvci5nZXRBY3RpdmVGb3JtTmFtZSgpO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9FTEVNRU5UU19ESVNDT1ZFUkVEJyxcbiAgICAgICAgICAgICAgICBlbGVtZW50czogZWxlbWVudHMubWFwKGVsID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIC4uLmVsLFxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB1bmRlZmluZWQgLy8gUmVtb3ZlIERPTSByZWZlcmVuY2UgZm9yIHNlcmlhbGl6YXRpb25cbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgYWN0aXZlRm9ybTogYWN0aXZlRm9ybVxuICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUQVJUX1BJQ0tFUicpIHtcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdGFydEVsZW1lbnRQaWNrZXIoKGVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBBZGQgZm9ybSBuYW1lIHRvIHBpY2tlZCBlbGVtZW50XG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBpbnNwZWN0b3IuZ2V0RWxlbWVudEZvcm1OYW1lKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7ZWxlbWVudC5jb250cm9sTmFtZX1cIl1gKSk7XG4gICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfRUxFTUVOVF9QSUNLRUQnLFxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB7IC4uLmVsZW1lbnQsIGZvcm1OYW1lIH1cbiAgICAgICAgICAgICAgICB9LCAnKicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9TVE9QX1BJQ0tFUicpIHtcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdG9wRWxlbWVudFBpY2tlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWRtaW4gaW5zcGVjdGlvbiB0b29scyAtIHJ1biBkaXNjb3ZlcnkgZnVuY3Rpb25zIGFuZCByZXR1cm4gcmVzdWx0c1xuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9BRE1JTl9JTlNQRUNUJykge1xuICAgICAgICAgICAgY29uc3QgaW5zcGVjdGlvblR5cGUgPSBldmVudC5kYXRhLmluc3BlY3Rpb25UeXBlO1xuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBldmVudC5kYXRhLmZvcm1OYW1lO1xuICAgICAgICAgICAgbGV0IHJlc3VsdDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IHJ1bkFkbWluSW5zcGVjdGlvbihpbnNwZWN0b3IsIGluc3BlY3Rpb25UeXBlLCBmb3JtTmFtZSwgZG9jdW1lbnQsIHdpbmRvdyk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0geyBzdWNjZXNzOiB0cnVlLCBpbnNwZWN0aW9uVHlwZSwgZGF0YSB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHsgc3VjY2VzczogZmFsc2UsIGluc3BlY3Rpb25UeXBlLCBlcnJvcjogZS5tZXNzYWdlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9BRE1JTl9JTlNQRUNUSU9OX1JFU1VMVCcsIHJlc3VsdCB9LCAnKicpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfRVhFQ1VURV9XT1JLRkxPVycpIHtcbiAgICAgICAgICAgIGV4ZWN1dGVXb3JrZmxvdyhldmVudC5kYXRhLndvcmtmbG93LCBldmVudC5kYXRhLmRhdGEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfTkFWX0JVVFRPTlNfVVBEQVRFJykge1xuICAgICAgICAgICAgdXBkYXRlTmF2QnV0dG9ucyhldmVudC5kYXRhLnBheWxvYWQpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBFeGVjdXRpb24gY29udHJvbHNcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfUEFVU0VfV09SS0ZMT1cnKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9SRVNVTUVfV09SS0ZMT1cnKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RPUF9XT1JLRkxPVycpIHtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9BUFBMWV9JTlRFUlJVUFRJT05fREVDSVNJT04nKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLnBlbmRpbmdJbnRlcnJ1cHRpb25EZWNpc2lvbiA9IGV2ZW50LmRhdGEucGF5bG9hZCB8fCBudWxsO1xuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBsZXQgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gbnVsbDtcbiAgICBsZXQgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBudWxsO1xuICAgIGxldCBuYXZCdXR0b25zT3V0c2lkZUNsaWNrSGFuZGxlciA9IG51bGw7XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVOYXZCdXR0b25zKHBheWxvYWQpIHtcbiAgICAgICAgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gcGF5bG9hZCB8fCBudWxsO1xuICAgICAgICByZW5kZXJOYXZCdXR0b25zKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyTmF2QnV0dG9ucygpIHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IHBlbmRpbmdOYXZCdXR0b25zUGF5bG9hZDtcbiAgICAgICAgaWYgKCFwYXlsb2FkKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgbmF2R3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmF2aWdhdGlvbk1haW5BY3Rpb25Hcm91cCcpO1xuICAgICAgICBpZiAoIW5hdkdyb3VwKSB7XG4gICAgICAgICAgICBpZiAoIW5hdkJ1dHRvbnNSZXRyeVRpbWVyKSB7XG4gICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJOYXZCdXR0b25zKCk7XG4gICAgICAgICAgICAgICAgfSwgMTAwMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleGlzdGluZ0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkMzY1LW5hdi1idXR0b25zLWNvbnRhaW5lcicpO1xuICAgICAgICBpZiAoZXhpc3RpbmdDb250YWluZXIpIHtcbiAgICAgICAgICAgIGV4aXN0aW5nQ29udGFpbmVyLnJlbW92ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IEFycmF5LmlzQXJyYXkocGF5bG9hZC5idXR0b25zKSA/IHBheWxvYWQuYnV0dG9ucyA6IFtdO1xuICAgICAgICBpZiAoIWJ1dHRvbnMubGVuZ3RoKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgY3VycmVudE1lbnVJdGVtID0gKHBheWxvYWQubWVudUl0ZW0gfHwgJycpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgY29uc3QgdmlzaWJsZUJ1dHRvbnMgPSBidXR0b25zLmZpbHRlcigoYnV0dG9uKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtZW51SXRlbXMgPSBBcnJheS5pc0FycmF5KGJ1dHRvbi5tZW51SXRlbXMpID8gYnV0dG9uLm1lbnVJdGVtcyA6IFtdO1xuICAgICAgICAgICAgaWYgKCFtZW51SXRlbXMubGVuZ3RoKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGlmICghY3VycmVudE1lbnVJdGVtKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gbWVudUl0ZW1zLnNvbWUoKGl0ZW0pID0+IChpdGVtIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSBjdXJyZW50TWVudUl0ZW0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIXZpc2libGVCdXR0b25zLmxlbmd0aCkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBjb250YWluZXIuaWQgPSAnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgY29udGFpbmVyLnN0eWxlLmdhcCA9ICc2cHgnO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgICAgICBjb250YWluZXIuc3R5bGUubWFyZ2luUmlnaHQgPSAnNnB4JztcblxuICAgICAgICBjb25zdCBydW5CdXR0b25Xb3JrZmxvdyA9IGFzeW5jIChidXR0b25Db25maWcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtmbG93ID0gYnV0dG9uQ29uZmlnLndvcmtmbG93O1xuICAgICAgICAgICAgaWYgKCF3b3JrZmxvdykge1xuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFdvcmtmbG93IG5vdCBmb3VuZCBmb3IgbmF2IGJ1dHRvbjogJHtidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcuaWR9YCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHdvcmtmbG93LmRhdGFTb3VyY2VzPy5wcmltYXJ5Py5kYXRhIHx8IHdvcmtmbG93LmRhdGFTb3VyY2U/LmRhdGEgfHwgW107XG4gICAgICAgICAgICBleGVjdXRlV29ya2Zsb3cod29ya2Zsb3csIGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGNyZWF0ZVN0eWxlZEJ1dHRvbiA9IChsYWJlbCwgdGl0bGUgPSAnJykgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLXNlYXJjaCc7XG4gICAgICAgICAgICBidXR0b25FbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgICAgICAgICAgYnV0dG9uRWwudGl0bGUgPSB0aXRsZTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmhlaWdodCA9ICcyNHB4JztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLnBhZGRpbmcgPSAnMCA4cHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzRweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4zNSknO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMTIpJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmNvbG9yID0gJyNmZmZmZmYnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5saW5lSGVpZ2h0ID0gJzIycHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUud2hpdGVTcGFjZSA9ICdub3dyYXAnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtZmxleCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdjZW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm94U2hhZG93ID0gJ2luc2V0IDAgMCAwIDFweCByZ2JhKDI1NSwyNTUsMjU1LDAuMDgpJztcbiAgICAgICAgICAgIHJldHVybiBidXR0b25FbDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjbG9zZUFsbEdyb3VwTWVudXMgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudV0nKS5mb3JFYWNoKChtZW51KSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc3RhbmRhbG9uZUJ1dHRvbnMgPSBbXTtcbiAgICAgICAgY29uc3QgZ3JvdXBlZEJ1dHRvbnMgPSBuZXcgTWFwKCk7XG5cbiAgICAgICAgdmlzaWJsZUJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBncm91cE5hbWUgPSAoYnV0dG9uQ29uZmlnLmdyb3VwIHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoIWdyb3VwTmFtZSkge1xuICAgICAgICAgICAgICAgIHN0YW5kYWxvbmVCdXR0b25zLnB1c2goYnV0dG9uQ29uZmlnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWdyb3VwZWRCdXR0b25zLmhhcyhncm91cE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuc2V0KGdyb3VwTmFtZSwgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuZ2V0KGdyb3VwTmFtZSkucHVzaChidXR0b25Db25maWcpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdGFuZGFsb25lQnV0dG9ucy5mb3JFYWNoKChidXR0b25Db25maWcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbldyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGJ1dHRvbldyYXBwZXIuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItY29tcGFueSBuYXZpZ2F0aW9uQmFyLXBpbm5lZEVsZW1lbnQnO1xuXG4gICAgICAgICAgICBjb25zdCBidXR0b25FbCA9IGNyZWF0ZVN0eWxlZEJ1dHRvbihidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdycsIGJ1dHRvbkNvbmZpZy5uYW1lIHx8ICcnKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1idXR0b24taWQnLCBidXR0b25Db25maWcuaWQgfHwgJycpO1xuICAgICAgICAgICAgYnV0dG9uRWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpKTtcblxuICAgICAgICAgICAgYnV0dG9uV3JhcHBlci5hcHBlbmRDaGlsZChidXR0b25FbCk7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoYnV0dG9uV3JhcHBlcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEFycmF5LmZyb20oZ3JvdXBlZEJ1dHRvbnMuZW50cmllcygpKVxuICAgICAgICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpXG4gICAgICAgICAgICAuZm9yRWFjaCgoW2dyb3VwTmFtZSwgZ3JvdXBJdGVtc10pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cFdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICBncm91cFdyYXBwZXIuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItY29tcGFueSBuYXZpZ2F0aW9uQmFyLXBpbm5lZEVsZW1lbnQnO1xuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEJ1dHRvbiA9IGNyZWF0ZVN0eWxlZEJ1dHRvbihgJHtncm91cE5hbWV9IFxcdTI1QkVgLCBncm91cE5hbWUpO1xuICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1ncm91cCcsIGdyb3VwTmFtZSk7XG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYm9yZGVyQ29sb3IgPSAncmdiYSgyNTUsMjU1LDI1NSwwLjU1KSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMiknO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBNZW51ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1ncm91cC1tZW51JywgZ3JvdXBOYW1lKTtcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS50b3AgPSAnMjhweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmxlZnQgPSAnMCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLm1pbldpZHRoID0gJzIzMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUubWF4V2lkdGggPSAnMzIwcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5tYXhIZWlnaHQgPSAnMzIwcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5vdmVyZmxvd1kgPSAnYXV0byc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJhY2tncm91bmQgPSAnI2ZjZmRmZic7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgcmdiYSgzMCw0MSw1OSwwLjE2KSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJvcmRlclJhZGl1cyA9ICcxMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuYm94U2hhZG93ID0gJzAgMTRweCAyOHB4IHJnYmEoMCwwLDAsMC4yOCknO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5wYWRkaW5nID0gJzhweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLnpJbmRleCA9ICcyMTQ3NDgzMDAwJztcblxuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwSGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIudGV4dENvbnRlbnQgPSBncm91cE5hbWU7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuZm9udFNpemUgPSAnMTFweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuZm9udFdlaWdodCA9ICc3MDAnO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmNvbG9yID0gJyM0NzU1NjknO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLm1hcmdpbiA9ICcwIDJweCA2cHggMnB4JztcbiAgICAgICAgICAgICAgICBncm91cEhlYWRlci5zdHlsZS5wYWRkaW5nQm90dG9tID0gJzZweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCAjZTJlOGYwJztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuYXBwZW5kQ2hpbGQoZ3JvdXBIZWFkZXIpO1xuXG4gICAgICAgICAgICAgICAgZ3JvdXBJdGVtc1xuICAgICAgICAgICAgICAgICAgICAuc2xpY2UoKVxuICAgICAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gKGEubmFtZSB8fCAnJykubG9jYWxlQ29tcGFyZShiLm5hbWUgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICAuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVtQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24udGV4dENvbnRlbnQgPSBidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnRpdGxlID0gYnV0dG9uQ29uZmlnLm5hbWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudGV4dEFsaWduID0gJ2xlZnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5ib3JkZXIgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jb2xvciA9ICcjMWYyOTM3JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYm9yZGVyUmFkaXVzID0gJzRweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLnBhZGRpbmcgPSAnOHB4IDlweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmZvbnRTaXplID0gJzEycHgnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmxpbmVIZWlnaHQgPSAnMS4zJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUubWFyZ2luQm90dG9tID0gJzNweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudHJhbnNpdGlvbiA9ICdiYWNrZ3JvdW5kIC4xNXMgZWFzZSwgY29sb3IgLjE1cyBlYXNlJztcblxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICcjZThlZGZmJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZTNhOGEnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZjI5MzcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbG9zZUFsbEdyb3VwTWVudXMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwTWVudS5hcHBlbmRDaGlsZChpdGVtQnV0dG9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBncm91cEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNPcGVuID0gZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPT09ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGNsb3NlQWxsR3JvdXBNZW51cygpO1xuICAgICAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuZGlzcGxheSA9IGlzT3BlbiA/ICdub25lJyA6ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSBpc09wZW4gPyAncmdiYSgyNTUsMjU1LDI1NSwwLjIpJyA6ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMzIpJztcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5hcHBlbmRDaGlsZChncm91cEJ1dHRvbik7XG4gICAgICAgICAgICAgICAgZ3JvdXBXcmFwcGVyLmFwcGVuZENoaWxkKGdyb3VwTWVudSk7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwV3JhcHBlcik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICBuYXZHcm91cC5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBuYXZHcm91cC5maXJzdENoaWxkKTtcblxuICAgICAgICBpZiAobmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInKTtcbiAgICAgICAgICAgIGlmICghYWN0aXZlIHx8IGFjdGl2ZS5jb250YWlucyhldmVudC50YXJnZXQpKSByZXR1cm47XG4gICAgICAgICAgICBhY3RpdmUucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudV0nKS5mb3JFYWNoKChtZW51KSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHVuaGFuZGxlZFVuZXhwZWN0ZWRFdmVudEtleXMgPSBuZXcgU2V0KCk7XG4gICAgLy8gVHJhY2sgbWVzc2FnZSBiYXIgbWVzc2FnZXMgYWxyZWFkeSBhY2tub3dsZWRnZWQgZHVyaW5nIHRoaXMgZXhlY3V0aW9uIHJ1blxuICAgIC8vIHNvIHRoZSBzYW1lIG5vbi1ibG9ja2luZyB3YXJuaW5nIGRvZXNuJ3QgdHJpZ2dlciByZXBlYXRlZCBwYXVzZXMuXG4gICAgY29uc3QgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMgPSBuZXcgU2V0KCk7XG5cbiAgICAvLyBIZWxwZXIgdG8gY2hlY2sgYW5kIHdhaXQgZm9yIHBhdXNlL3N0b3BcbiAgICBhc3luYyBmdW5jdGlvbiBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKSB7XG4gICAgICAgIGlmIChleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCkge1xuICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQpIHtcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0FOSU1BVElPTl9ERUxBWScpO1xuICAgICAgICAgICAgaWYgKGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0VGVtcGxhdGVUZXh0KHRleHQpIHtcbiAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZVRleHQodGV4dCB8fCAnJykucmVwbGFjZSgvXFxiW1xcZCwuXStcXGIvZywgJyMnKS50cmltKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlVXNlclN0b3BFcnJvcihtZXNzYWdlID0gJ1dvcmtmbG93IHN0b3BwZWQgYnkgdXNlcicpIHtcbiAgICAgICAgY29uc3QgZXJyID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgICBlcnIuaXNVc2VyU3RvcCA9IHRydWU7XG4gICAgICAgIGVyci5ub1JldHJ5ID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIGVycjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc01lc3NhZ2VCYXJDbG9zZVZpc2libGUoKSB7XG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiTWVzc2FnZUJhckNsb3NlXCJdJyk7XG4gICAgICAgIHJldHVybiBjbG9zZUJ0biAmJiBpc0VsZW1lbnRWaXNpYmxlKGNsb3NlQnRuKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaG9ydGVuRm9yTG9nKHRleHQsIG1heCA9IDIyMCkge1xuICAgICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplVGV4dCh0ZXh0IHx8ICcnKTtcbiAgICAgICAgaWYgKG5vcm1hbGl6ZWQubGVuZ3RoIDw9IG1heCkgcmV0dXJuIG5vcm1hbGl6ZWQ7XG4gICAgICAgIHJldHVybiBgJHtub3JtYWxpemVkLnNsaWNlKDAsIG1heCl9Li4uYDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb25zdW1lUGVuZGluZ0Zsb3dTaWduYWwoKSB7XG4gICAgICAgIGNvbnN0IHNpZ25hbCA9IGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0Zsb3dTaWduYWwgfHwgJ25vbmUnO1xuICAgICAgICBleGVjdXRpb25Db250cm9sLnBlbmRpbmdGbG93U2lnbmFsID0gJ25vbmUnO1xuICAgICAgICByZXR1cm4gc2lnbmFsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN0YXJ0SW50ZXJydXB0aW9uQWN0aW9uUmVjb3JkZXIoKSB7XG4gICAgICAgIGNvbnN0IGNhcHR1cmVkID0gW107XG4gICAgICAgIGNvbnN0IGNsaWNrSGFuZGxlciA9IChldnQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGV2dC50YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ID8gZXZ0LnRhcmdldCA6IG51bGw7XG4gICAgICAgICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uID0gdGFyZ2V0LmNsb3Nlc3QoJ2J1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tbWFuZEJ1dHRvblwiXScpO1xuICAgICAgICAgICAgaWYgKCFidXR0b24gfHwgIWlzRWxlbWVudFZpc2libGUoYnV0dG9uKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBidXR0b24uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQoYnV0dG9uLnRleHRDb250ZW50IHx8IGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lICYmICF0ZXh0KSByZXR1cm47XG4gICAgICAgICAgICBjYXB0dXJlZC5wdXNoKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnY2xpY2tCdXR0b24nLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lLFxuICAgICAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsaWNrSGFuZGxlciwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdG9wKCkge1xuICAgICAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xpY2tIYW5kbGVyLCB0cnVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FwdHVyZWQuc2xpY2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb2xsZWN0RGlhbG9nQnV0dG9ucyhkaWFsb2dFbCkge1xuICAgICAgICBjb25zdCBzZWxlY3RvcnMgPSAnYnV0dG9uLCBbcm9sZT1cImJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdJztcbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IFtdO1xuICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xuICAgICAgICBkaWFsb2dFbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9ycykuZm9yRWFjaCgoYnV0dG9uRWwpID0+IHtcbiAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZShidXR0b25FbCkpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gYnV0dG9uRWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQoYnV0dG9uRWwudGV4dENvbnRlbnQgfHwgYnV0dG9uRWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpO1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gYCR7Y29udHJvbE5hbWUudG9Mb3dlckNhc2UoKX18JHt0ZXh0fWA7XG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lICYmICF0ZXh0KSByZXR1cm47XG4gICAgICAgICAgICBpZiAoc2Vlbi5oYXMoa2V5KSkgcmV0dXJuO1xuICAgICAgICAgICAgc2Vlbi5hZGQoa2V5KTtcbiAgICAgICAgICAgIGJ1dHRvbnMucHVzaCh7IGNvbnRyb2xOYW1lLCB0ZXh0LCBlbGVtZW50OiBidXR0b25FbCB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBidXR0b25zO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzTGlrZWx5TW9kYWxEaWFsb2coZGlhbG9nRWwsIHRleHQsIGJ1dHRvbnMpIHtcbiAgICAgICAgY29uc3QgdGV4dExlbmd0aCA9IG5vcm1hbGl6ZVRleHQodGV4dCB8fCAnJykubGVuZ3RoO1xuICAgICAgICBpZiAoIWJ1dHRvbnMubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmICh0ZXh0TGVuZ3RoID4gNDUwKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgY29uc3QgZm9ybUlucHV0cyA9IGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCBzZWxlY3QsIHRleHRhcmVhJyk7XG4gICAgICAgIGlmIChmb3JtSW5wdXRzLmxlbmd0aCA+IDgpIHJldHVybiBmYWxzZTtcblxuICAgICAgICBjb25zdCBoYXNTdGF0aWNUZXh0ID0gISFkaWFsb2dFbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJGb3JtU3RhdGljVGV4dENvbnRyb2wxXCJdJyk7XG4gICAgICAgIGNvbnN0IGhhc0xpZ2h0Ym94Q2xhc3MgPSBkaWFsb2dFbC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdyb290Q29udGVudC1saWdodEJveCcpO1xuICAgICAgICBjb25zdCBoYXNCdXR0b25Hcm91cCA9ICEhZGlhbG9nRWwucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiQnV0dG9uR3JvdXBcIl0nKTtcblxuICAgICAgICByZXR1cm4gaGFzU3RhdGljVGV4dCB8fCBoYXNMaWdodGJveENsYXNzIHx8IGhhc0J1dHRvbkdyb3VwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRldGVjdFVuZXhwZWN0ZWRFdmVudHMoKSB7XG4gICAgICAgIGNvbnN0IGV2ZW50cyA9IFtdO1xuICAgICAgICBjb25zdCBzZWVuRXZlbnRLZXlzID0gbmV3IFNldCgpO1xuXG4gICAgICAgIC8vIC0tLSBEaWFsb2dzIC0tLVxuICAgICAgICBjb25zdCBkaWFsb2dTZWxlY3RvcnMgPSAnW3JvbGU9XCJkaWFsb2dcIl0sIFtkYXRhLWR5bi1yb2xlPVwiRGlhbG9nXCJdLCAuZGlhbG9nLWNvbnRhaW5lcic7XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoZGlhbG9nU2VsZWN0b3JzKS5mb3JFYWNoKChkaWFsb2dFbCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGRpYWxvZ0VsKSkgcmV0dXJuO1xuICAgICAgICAgICAgLy8gUHJlZmVyIHRoZSBkZWRpY2F0ZWQgc3RhdGljLXRleHQgY29udHJvbCwgdGhlbiBoZWFkaW5nIHRhZ3MuXG4gICAgICAgICAgICAvLyBBdm9pZCB0aGUgb3Zlcmx5LWJyb2FkIFtjbGFzcyo9XCJjb250ZW50XCJdIHdoaWNoIGNhbiBtYXRjaCB3cmFwcGVyXG4gICAgICAgICAgICAvLyBlbGVtZW50cyB3aG9zZSB0ZXh0Q29udGVudCBpbmNsdWRlcyBidXR0b24gbGFiZWxzLlxuICAgICAgICAgICAgY29uc3QgdGV4dEVsID1cbiAgICAgICAgICAgICAgICBkaWFsb2dFbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJGb3JtU3RhdGljVGV4dENvbnRyb2wxXCJdJykgfHxcbiAgICAgICAgICAgICAgICBkaWFsb2dFbC5xdWVyeVNlbGVjdG9yKCdoMSwgaDIsIGgzJykgfHxcbiAgICAgICAgICAgICAgICBkaWFsb2dFbC5xdWVyeVNlbGVjdG9yKCdbY2xhc3MqPVwibWVzc2FnZVwiXScpO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQodGV4dEVsPy50ZXh0Q29udGVudCB8fCBkaWFsb2dFbC50ZXh0Q29udGVudCB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBidXR0b25zID0gY29sbGVjdERpYWxvZ0J1dHRvbnMoZGlhbG9nRWwpO1xuICAgICAgICAgICAgaWYgKCFpc0xpa2VseU1vZGFsRGlhbG9nKGRpYWxvZ0VsLCB0ZXh0LCBidXR0b25zKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVUZXh0ID0gZ2V0VGVtcGxhdGVUZXh0KHRleHQpO1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gYGRpYWxvZ3wke3RlbXBsYXRlVGV4dH1gO1xuICAgICAgICAgICAgaWYgKCF0ZW1wbGF0ZVRleHQgfHwgc2VlbkV2ZW50S2V5cy5oYXMoa2V5KSkgcmV0dXJuO1xuICAgICAgICAgICAgc2VlbkV2ZW50S2V5cy5hZGQoa2V5KTtcbiAgICAgICAgICAgIGV2ZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICBraW5kOiAnZGlhbG9nJyxcbiAgICAgICAgICAgICAgICB0ZXh0LFxuICAgICAgICAgICAgICAgIHRlbXBsYXRlVGV4dCxcbiAgICAgICAgICAgICAgICBidXR0b25zLFxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGRpYWxvZ0VsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gLS0tIE1lc3NhZ2UgYmFyIGVudHJpZXMgLS0tXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5tZXNzYWdlQmFyLW1lc3NhZ2VFbnRyeScpLmZvckVhY2goKGVudHJ5RWwpID0+IHtcbiAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZShlbnRyeUVsKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZUVsID0gZW50cnlFbC5xdWVyeVNlbGVjdG9yKCcubWVzc2FnZUJhci1tZXNzYWdlJykgfHwgZW50cnlFbDtcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KG1lc3NhZ2VFbC50ZXh0Q29udGVudCB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZVRleHQgPSBnZXRUZW1wbGF0ZVRleHQodGV4dCk7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgbWVzc2FnZUJhcnwke3RlbXBsYXRlVGV4dH1gO1xuICAgICAgICAgICAgaWYgKCF0ZW1wbGF0ZVRleHQgfHwgc2VlbkV2ZW50S2V5cy5oYXMoa2V5KSkgcmV0dXJuO1xuICAgICAgICAgICAgc2VlbkV2ZW50S2V5cy5hZGQoa2V5KTtcblxuICAgICAgICAgICAgLy8gU2tpcCBtZXNzYWdlLWJhciBlbnRyaWVzIHRoYXQgd2VyZSBhbHJlYWR5IGFja25vd2xlZGdlZCBpbiB0aGlzIHJ1blxuICAgICAgICAgICAgLy8gc28gdGhlIHNhbWUgbm9uLWJsb2NraW5nIHdhcm5pbmcgZG9lc24ndCBjYXVzZSByZXBlYXRlZCBwYXVzZXMuXG4gICAgICAgICAgICBpZiAoYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuaGFzKGtleSkpIHJldHVybjtcblxuICAgICAgICAgICAgLy8gQ29sbGVjdCBjbG9zZSAvIHRvZ2dsZSBjb250cm9scyBwbHVzIGNvbnRleHR1YWwgdmlzaWJsZSBidXR0b25zXG4gICAgICAgICAgICAvLyAoZS5nLiBPSy9DYW5jZWwgb24gdGhlIGFjdGl2ZSBmb3JtKSBzbyB0aGUgdXNlciBjYW4gY2hvb3NlIHRoZW0uXG4gICAgICAgICAgICBjb25zdCBjb250cm9scyA9IFtdO1xuICAgICAgICAgICAgY29uc3QgY29udHJvbEtleXMgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICBjb25zdCBwdXNoQ29udHJvbCA9IChjb250cm9sKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYCR7bm9ybWFsaXplVGV4dChjb250cm9sPy5jb250cm9sTmFtZSB8fCAnJyl9fCR7bm9ybWFsaXplVGV4dChjb250cm9sPy50ZXh0IHx8ICcnKX1gO1xuICAgICAgICAgICAgICAgIGlmICgha2V5IHx8IGNvbnRyb2xLZXlzLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICAgICAgY29udHJvbEtleXMuYWRkKGtleSk7XG4gICAgICAgICAgICAgICAgY29udHJvbHMucHVzaChjb250cm9sKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGNsb3NlQnV0dG9uID1cbiAgICAgICAgICAgICAgICBlbnRyeUVsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJDbG9zZVwiXScpIHx8XG4gICAgICAgICAgICAgICAgQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyQ2xvc2VcIl0nKSkuZmluZChpc0VsZW1lbnRWaXNpYmxlKSB8fFxuICAgICAgICAgICAgICAgIG51bGw7XG4gICAgICAgICAgICBjb25zdCB0b2dnbGVCdXR0b24gPVxuICAgICAgICAgICAgICAgIGVudHJ5RWwucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiTWVzc2FnZUJhclRvZ2dsZVwiXScpIHx8XG4gICAgICAgICAgICAgICAgQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyVG9nZ2xlXCJdJykpLmZpbmQoaXNFbGVtZW50VmlzaWJsZSkgfHxcbiAgICAgICAgICAgICAgICBudWxsO1xuICAgICAgICAgICAgaWYgKGNsb3NlQnV0dG9uICYmIGlzRWxlbWVudFZpc2libGUoY2xvc2VCdXR0b24pKSB7XG4gICAgICAgICAgICAgICAgcHVzaENvbnRyb2woeyBjb250cm9sTmFtZTogJ01lc3NhZ2VCYXJDbG9zZScsIHRleHQ6IG5vcm1hbGl6ZVRleHQoY2xvc2VCdXR0b24udGV4dENvbnRlbnQgfHwgJycpLCBlbGVtZW50OiBjbG9zZUJ1dHRvbiwgdmlzaWJsZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b2dnbGVCdXR0b24gJiYgaXNFbGVtZW50VmlzaWJsZSh0b2dnbGVCdXR0b24pKSB7XG4gICAgICAgICAgICAgICAgcHVzaENvbnRyb2woeyBjb250cm9sTmFtZTogJ01lc3NhZ2VCYXJUb2dnbGUnLCB0ZXh0OiBub3JtYWxpemVUZXh0KHRvZ2dsZUJ1dHRvbi50ZXh0Q29udGVudCB8fCAnJyksIGVsZW1lbnQ6IHRvZ2dsZUJ1dHRvbiwgdmlzaWJsZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGV4dFJvb3QgPVxuICAgICAgICAgICAgICAgIGVudHJ5RWwuY2xvc2VzdCgnW2RhdGEtZHluLWZvcm0tbmFtZV0sIFtyb2xlPVwiZGlhbG9nXCJdLCAucm9vdENvbnRlbnQsIC5yb290Q29udGVudC1saWdodEJveCcpIHx8XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBidXR0b25TZWxlY3RvcnMgPSAnW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdLCBidXR0b24sIFtyb2xlPVwiYnV0dG9uXCJdJztcbiAgICAgICAgICAgIGNvbnRleHRSb290LnF1ZXJ5U2VsZWN0b3JBbGwoYnV0dG9uU2VsZWN0b3JzKS5mb3JFYWNoKChidG4pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGJ0bi5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dFZhbHVlID0gbm9ybWFsaXplVGV4dChidG4udGV4dENvbnRlbnQgfHwgYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5vcm1hbGl6ZVRleHQoY29udHJvbE5hbWUgfHwgdGV4dFZhbHVlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpc1ByaW1hcnlBY3Rpb24gPVxuICAgICAgICAgICAgICAgICAgICBbJ29rJywgJ2NhbmNlbCcsICd5ZXMnLCAnbm8nLCAnY2xvc2UnLCAncmVtb3ZlJywgJ2RlbGV0ZScsICdzYXZlJywgJ25ldyddLmluY2x1ZGVzKHRva2VuKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygncmVtb3ZlJykgfHxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdjYW5jZWwnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnY2xvc2UnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnbGluZXN0cmlwJykgfHxcbiAgICAgICAgICAgICAgICAgICAgdGV4dFZhbHVlID09PSAncmVtb3ZlJyB8fFxuICAgICAgICAgICAgICAgICAgICB0ZXh0VmFsdWUgPT09ICdkZWxldGUnO1xuICAgICAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZShidG4pIHx8ICghY29udHJvbE5hbWUgJiYgIXRleHRWYWx1ZSkgfHwgIWlzUHJpbWFyeUFjdGlvbikgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHB1c2hDb250cm9sKHsgY29udHJvbE5hbWUsIHRleHQ6IHRleHRWYWx1ZSwgZWxlbWVudDogYnRuLCB2aXNpYmxlOiB0cnVlIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBzY2FuIGdsb2JhbGx5IGZvciB2aXNpYmxlIHJlbWVkaWF0aW9uIGFjdGlvbnMgdGhhdCBtYXkgYmVcbiAgICAgICAgICAgIC8vIG91dHNpZGUgdGhlIG1lc3NhZ2UtYmFyL2Zvcm0gd3JhcHBlciAoZS5nLiBMaW5lU3RyaXBEZWxldGUgaW4gdG9vbGJhcikuXG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGJ1dHRvblNlbGVjdG9ycykuZm9yRWFjaCgoYnRuKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBidG4uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICcnO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleHRWYWx1ZSA9IG5vcm1hbGl6ZVRleHQoYnRuLnRleHRDb250ZW50IHx8IGJ0bi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KGNvbnRyb2xOYW1lIHx8IHRleHRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNMaWtlbHlGaXhBY3Rpb24gPVxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygncmVtb3ZlJykgfHxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdjYW5jZWwnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnY2xvc2UnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnbGluZXN0cmlwZGVsZXRlJykgfHxcbiAgICAgICAgICAgICAgICAgICAgdGV4dFZhbHVlID09PSAncmVtb3ZlJyB8fFxuICAgICAgICAgICAgICAgICAgICB0ZXh0VmFsdWUgPT09ICdkZWxldGUnO1xuICAgICAgICAgICAgICAgIGlmICghaXNFbGVtZW50VmlzaWJsZShidG4pIHx8ICFpc0xpa2VseUZpeEFjdGlvbikgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHB1c2hDb250cm9sKHsgY29udHJvbE5hbWUsIHRleHQ6IHRleHRWYWx1ZSwgZWxlbWVudDogYnRuLCB2aXNpYmxlOiB0cnVlIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGV2ZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICBraW5kOiAnbWVzc2FnZUJhcicsXG4gICAgICAgICAgICAgICAgdGV4dCxcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZVRleHQsXG4gICAgICAgICAgICAgICAgY29udHJvbHMsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZW50cnlFbFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBldmVudHM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWF0Y2hIYW5kbGVyVG9FdmVudChoYW5kbGVyLCBldmVudCkge1xuICAgICAgICBjb25zdCB0cmlnZ2VyID0gaGFuZGxlcj8udHJpZ2dlciB8fCB7fTtcbiAgICAgICAgaWYgKHRyaWdnZXIua2luZCAhPT0gZXZlbnQua2luZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjb25zdCB0cmlnZ2VyVGVtcGxhdGUgPSBnZW5lcmFsaXplSW50ZXJydXB0aW9uVGV4dCh0cmlnZ2VyLnRleHRUZW1wbGF0ZSB8fCAnJyk7XG4gICAgICAgIGNvbnN0IGV2ZW50VGVtcGxhdGUgPSBnZW5lcmFsaXplSW50ZXJydXB0aW9uVGV4dChldmVudC50ZW1wbGF0ZVRleHQgfHwgZXZlbnQudGV4dCB8fCAnJyk7XG4gICAgICAgIGNvbnN0IHRyaWdnZXJNYXRjaE1vZGUgPSBub3JtYWxpemVUZXh0KHRyaWdnZXIubWF0Y2hNb2RlIHx8ICcnKTtcbiAgICAgICAgY29uc3QgbWF0Y2hNb2RlID0gdHJpZ2dlck1hdGNoTW9kZSA9PT0gJ2V4YWN0JyA/ICdleGFjdCcgOiAnY29udGFpbnMnO1xuXG4gICAgICAgIGlmICh0cmlnZ2VyVGVtcGxhdGUpIHtcbiAgICAgICAgICAgIGlmIChtYXRjaE1vZGUgPT09ICdleGFjdCcpIHtcbiAgICAgICAgICAgICAgICBpZiAodHJpZ2dlclRlbXBsYXRlICE9PSBldmVudFRlbXBsYXRlKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCEoZXZlbnRUZW1wbGF0ZS5pbmNsdWRlcyh0cmlnZ2VyVGVtcGxhdGUpIHx8IHRyaWdnZXJUZW1wbGF0ZS5pbmNsdWRlcyhldmVudFRlbXBsYXRlKSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHJpZ2dlck1hdGNoTW9kZSA9PT0gJ3JlZ2V4Jykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gdHJpZ2dlci5yZWdleCB8fCB0cmlnZ2VyLnRleHRUZW1wbGF0ZSB8fCAnJztcbiAgICAgICAgICAgICAgICBpZiAoIXBhdHRlcm4gfHwgIShuZXcgUmVnRXhwKHBhdHRlcm4sICdpJykpLnRlc3QoZXZlbnQudGVtcGxhdGVUZXh0IHx8IGV2ZW50LnRleHQgfHwgJycpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlcXVpcmVkQ29udHJvbHMgPSBBcnJheS5pc0FycmF5KHRyaWdnZXIucmVxdWlyZWRDb250cm9scykgPyB0cmlnZ2VyLnJlcXVpcmVkQ29udHJvbHMgOiBbXTtcbiAgICAgICAgaWYgKHJlcXVpcmVkQ29udHJvbHMubGVuZ3RoICYmIGV2ZW50LmtpbmQgPT09ICdtZXNzYWdlQmFyJykge1xuICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlID0gbmV3IFNldCgoZXZlbnQuY29udHJvbHMgfHwgW10pLm1hcChjdHJsID0+IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCBjdHJsLnRleHQgfHwgJycpKSk7XG4gICAgICAgICAgICBpZiAoIXJlcXVpcmVkQ29udHJvbHMuZXZlcnkobmFtZSA9PiBhdmFpbGFibGUuaGFzKG5vcm1hbGl6ZVRleHQobmFtZSkpKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlcXVpcmVkQnV0dG9ucyA9IEFycmF5LmlzQXJyYXkodHJpZ2dlci5yZXF1aXJlZEJ1dHRvbnMpID8gdHJpZ2dlci5yZXF1aXJlZEJ1dHRvbnMgOiBbXTtcbiAgICAgICAgaWYgKHJlcXVpcmVkQnV0dG9ucy5sZW5ndGggJiYgZXZlbnQua2luZCA9PT0gJ2RpYWxvZycpIHtcbiAgICAgICAgICAgIGNvbnN0IGF2YWlsYWJsZSA9IG5ldyBTZXQoKGV2ZW50LmJ1dHRvbnMgfHwgW10pLm1hcChidG4gPT4gbm9ybWFsaXplVGV4dChidG4uY29udHJvbE5hbWUgfHwgYnRuLnRleHQgfHwgJycpKSk7XG4gICAgICAgICAgICByZXR1cm4gcmVxdWlyZWRCdXR0b25zLmV2ZXJ5KG5hbWUgPT4gYXZhaWxhYmxlLmhhcyhub3JtYWxpemVUZXh0KG5hbWUpKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2VuZXJhbGl6ZUludGVycnVwdGlvblRleHQocmF3VGV4dCkge1xuICAgICAgICBsZXQgdmFsdWUgPSBub3JtYWxpemVUZXh0KHJhd1RleHQgfHwgJycpO1xuICAgICAgICBpZiAoIXZhbHVlKSByZXR1cm4gJyc7XG5cbiAgICAgICAgdmFsdWUgPSB2YWx1ZVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcYmN1c3RvbWVyXFxzK1xcZCtcXGIvZ2ksICdjdXN0b21lciB7bnVtYmVyfScpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxiaXRlbSBudW1iZXJcXHMrW2EtejAtOV8tXStcXGIvZ2ksICdpdGVtIG51bWJlciB7dmFsdWV9JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGJcXGRbXFxkLC4vLV0qXFxiL2csICd7bnVtYmVyfScpO1xuXG4gICAgICAgIC8vIEdlbmVyYWxpemUgZHVwbGljYXRlIGNyZWF0ZS1yZWNvcmQgaW50ZXJydXB0aW9ucyBhY3Jvc3MgdGFibGVzL2ZpZWxkcy5cbiAgICAgICAgLy8gRXhhbXBsZTpcbiAgICAgICAgLy8gY2Fubm90IGNyZWF0ZSBhIHJlY29yZCBpbiB0cmFuc2xhdGlvbnMgKGxhbmd1YWdleHQpLiBsYW5ndWFnZTogZW4tdXMuIHRoZSByZWNvcmQgYWxyZWFkeSBleGlzdHMuXG4gICAgICAgIC8vIC0+IGNhbm5vdCBjcmVhdGUgYSByZWNvcmQgaW4ge3JlY29yZH0uIHtmaWVsZH06IHt2YWx1ZX0uIHRoZSByZWNvcmQgYWxyZWFkeSBleGlzdHMuXG4gICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZShcbiAgICAgICAgICAgIC8oXFxiY2Fubm90IGNyZWF0ZSBhIHJlY29yZCBpbiApKFteLl0rPykoXFwuKS9pLFxuICAgICAgICAgICAgJyQxe3JlY29yZH0kMydcbiAgICAgICAgKTtcblxuICAgICAgICB2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoXG4gICAgICAgICAgICAvXFxiZmllbGRcXHMrWydcIl0/KFteJ1wiLl0rPylbJ1wiXT9cXHMrbXVzdCBiZSBmaWxsZWQgaW5cXC4/L2ksXG4gICAgICAgICAgICBcImZpZWxkICd7ZmllbGR9JyBtdXN0IGJlIGZpbGxlZCBpbi5cIlxuICAgICAgICApO1xuXG4gICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZShcbiAgICAgICAgICAgIC9cXGJbYS16XVthLXowLTkgXygpLy1dKlxccytjYW5ub3QgYmUgZGVsZXRlZCB3aGlsZSBkZXBlbmRlbnRcXHMrW2Etel1bYS16MC05IF8oKS8tXSpcXHMrZXhpc3RcXC4/L2ksXG4gICAgICAgICAgICAne2VudGl0eX0gY2Fubm90IGJlIGRlbGV0ZWQgd2hpbGUgZGVwZW5kZW50IHtkZXBlbmRlbmN5fSBleGlzdC4nXG4gICAgICAgICk7XG5cbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKFxuICAgICAgICAgICAgL1xcYmRlbGV0ZSBkZXBlbmRlbnRcXHMrW2Etel1bYS16MC05IF8oKS8tXSpcXHMrYW5kIHRyeSBhZ2FpblxcLj8vaSxcbiAgICAgICAgICAgICdkZWxldGUgZGVwZW5kZW50IHtkZXBlbmRlbmN5fSBhbmQgdHJ5IGFnYWluLidcbiAgICAgICAgKTtcblxuICAgICAgICB2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoXG4gICAgICAgICAgICAvKFxcLlxccyopKFthLXpdW2EtejAtOSBfKCkvLV0qKShcXHMqOlxccyopKFteLl0rPykoXFwuXFxzKnRoZSByZWNvcmQgYWxyZWFkeSBleGlzdHNcXC4/KS9pLFxuICAgICAgICAgICAgJyQxe2ZpZWxkfToge3ZhbHVlfSQ1J1xuICAgICAgICApO1xuXG4gICAgICAgIC8vIE5vcm1hbGl6ZSBkdXBsaWNhdGUtcmVjb3JkIHN0eWxlIG1lc3NhZ2VzIHNvIHZhcnlpbmcga2V5IHZhbHVlc1xuICAgICAgICAvLyAoZS5nLiBcIjEsIDFcIiB2cyBcIkZSLUVVLU5SLCBGUi1FVS1OUlwiKSBtYXAgdG8gb25lIGhhbmRsZXIuXG4gICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZShcbiAgICAgICAgICAgIC8oXFxiW2Etel1bYS16MC05IF8oKS8tXSpcXHMqOlxccyopKFteLl0rPykoXFwuXFxzKnRoZSByZWNvcmQgYWxyZWFkeSBleGlzdHNcXC4/KS9pLFxuICAgICAgICAgICAgJ3tmaWVsZH06IHt2YWx1ZX0kMydcbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gbm9ybWFsaXplVGV4dCh2YWx1ZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZE1hdGNoaW5nSGFuZGxlcihldmVudCkge1xuICAgICAgICBjb25zdCBoYW5kbGVycyA9IEFycmF5LmlzQXJyYXkoY3VycmVudFdvcmtmbG93Py51bmV4cGVjdGVkRXZlbnRIYW5kbGVycylcbiAgICAgICAgICAgID8gY3VycmVudFdvcmtmbG93LnVuZXhwZWN0ZWRFdmVudEhhbmRsZXJzXG4gICAgICAgICAgICA6IFtdO1xuICAgICAgICBjb25zdCBzb3J0ZWQgPSBoYW5kbGVyc1xuICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgICAgICAgLnNsaWNlKClcbiAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYj8ucHJpb3JpdHkgfHwgMCkgLSBOdW1iZXIoYT8ucHJpb3JpdHkgfHwgMCkpO1xuXG4gICAgICAgIGZvciAoY29uc3QgaGFuZGxlciBvZiBzb3J0ZWQpIHtcbiAgICAgICAgICAgIGlmIChoYW5kbGVyPy5lbmFibGVkID09PSBmYWxzZSkgY29udGludWU7XG4gICAgICAgICAgICBpZiAobWF0Y2hIYW5kbGVyVG9FdmVudChoYW5kbGVyLCBldmVudCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaGFuZGxlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kRGlhbG9nQnV0dG9uKGV2ZW50LCB0YXJnZXROYW1lKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dCh0YXJnZXROYW1lIHx8ICcnKTtcbiAgICAgICAgaWYgKCFleHBlY3RlZCkgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IGJ1dHRvbnMgPSBBcnJheS5pc0FycmF5KGV2ZW50Py5idXR0b25zKSA/IGV2ZW50LmJ1dHRvbnMgOiBbXTtcbiAgICAgICAgcmV0dXJuIGJ1dHRvbnMuZmluZChidG4gPT4ge1xuICAgICAgICAgICAgY29uc3QgYnlDb250cm9sID0gbm9ybWFsaXplVGV4dChidG4uY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICAgICAgY29uc3QgYnlUZXh0ID0gbm9ybWFsaXplVGV4dChidG4udGV4dCB8fCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gYnlDb250cm9sID09PSBleHBlY3RlZCB8fCBieVRleHQgPT09IGV4cGVjdGVkO1xuICAgICAgICB9KSB8fCBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbmRNZXNzYWdlQmFyQ29udHJvbChldmVudCwgdGFyZ2V0TmFtZSkge1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQodGFyZ2V0TmFtZSB8fCAnJyk7XG4gICAgICAgIGlmICghZXhwZWN0ZWQpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBjb250cm9scyA9IEFycmF5LmlzQXJyYXkoZXZlbnQ/LmNvbnRyb2xzKSA/IGV2ZW50LmNvbnRyb2xzIDogW107XG4gICAgICAgIHJldHVybiBjb250cm9scy5maW5kKGN0cmwgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnlDb250cm9sID0gbm9ybWFsaXplVGV4dChjdHJsLmNvbnRyb2xOYW1lIHx8ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGJ5VGV4dCA9IG5vcm1hbGl6ZVRleHQoY3RybC50ZXh0IHx8ICcnKTtcbiAgICAgICAgICAgIHJldHVybiBieUNvbnRyb2wgPT09IGV4cGVjdGVkIHx8IGJ5VGV4dCA9PT0gZXhwZWN0ZWQ7XG4gICAgICAgIH0pIHx8IG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29sbGVjdEdsb2JhbFJlbWVkaWF0aW9uQ29udHJvbHMoKSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xzID0gW107XG4gICAgICAgIGNvbnN0IHNlZW4gPSBuZXcgU2V0KCk7XG4gICAgICAgIGNvbnN0IGJ1dHRvblNlbGVjdG9ycyA9ICdbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0sIGJ1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0nO1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGJ1dHRvblNlbGVjdG9ycykuZm9yRWFjaCgoYnRuKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzRWxlbWVudFZpc2libGUoYnRuKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBidG4uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQoYnRuLnRleHRDb250ZW50IHx8IGJ0bi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5vcm1hbGl6ZVRleHQoY29udHJvbE5hbWUgfHwgdGV4dCk7XG4gICAgICAgICAgICBjb25zdCBpc1JlbWVkaWF0aW9uQWN0aW9uID1cbiAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygncmVtb3ZlJykgfHxcbiAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnZGVsZXRlJykgfHxcbiAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnY2FuY2VsJykgfHxcbiAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnY2xvc2UnKSB8fFxuICAgICAgICAgICAgICAgIHRva2VuID09PSAnb2snIHx8XG4gICAgICAgICAgICAgICAgdG9rZW4gPT09ICd5ZXMnIHx8XG4gICAgICAgICAgICAgICAgdG9rZW4gPT09ICdubyc7XG4gICAgICAgICAgICBpZiAoIWlzUmVtZWRpYXRpb25BY3Rpb24pIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke25vcm1hbGl6ZVRleHQoY29udHJvbE5hbWUpfXwke3RleHR9YDtcbiAgICAgICAgICAgIGlmIChzZWVuLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICBzZWVuLmFkZChrZXkpO1xuICAgICAgICAgICAgY29udHJvbHMucHVzaCh7IGNvbnRyb2xOYW1lLCB0ZXh0LCBlbGVtZW50OiBidG4sIHZpc2libGU6IHRydWUgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY29udHJvbHM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZEdsb2JhbENsaWNrYWJsZSh0YXJnZXROYW1lKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dCh0YXJnZXROYW1lIHx8ICcnKTtcbiAgICAgICAgaWYgKCFleHBlY3RlZCkgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xzID0gY29sbGVjdEdsb2JhbFJlbWVkaWF0aW9uQ29udHJvbHMoKTtcbiAgICAgICAgcmV0dXJuIGNvbnRyb2xzLmZpbmQoKGN0cmwpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ5Q29udHJvbCA9IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBieVRleHQgPSBub3JtYWxpemVUZXh0KGN0cmwudGV4dCB8fCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gYnlDb250cm9sID09PSBleHBlY3RlZCB8fCBieVRleHQgPT09IGV4cGVjdGVkO1xuICAgICAgICB9KSB8fCBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG5vcm1hbGl6ZUhhbmRsZXJBY3Rpb25zKGhhbmRsZXIpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaGFuZGxlcj8uYWN0aW9ucykgJiYgaGFuZGxlci5hY3Rpb25zLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXIuYWN0aW9ucy5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGhhbmRsZXI/LmFjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFtoYW5kbGVyLmFjdGlvbl07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlY29yZExlYXJuZWRSdWxlKHJ1bGUpIHtcbiAgICAgICAgaWYgKCFjdXJyZW50V29ya2Zsb3cgfHwgIXJ1bGUpIHJldHVybjtcbiAgICAgICAgY3VycmVudFdvcmtmbG93LnVuZXhwZWN0ZWRFdmVudEhhbmRsZXJzID0gQXJyYXkuaXNBcnJheShjdXJyZW50V29ya2Zsb3cudW5leHBlY3RlZEV2ZW50SGFuZGxlcnMpXG4gICAgICAgICAgICA/IGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVyc1xuICAgICAgICAgICAgOiBbXTtcblxuICAgICAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICB0cmlnZ2VyOiBydWxlLnRyaWdnZXIsXG4gICAgICAgICAgICBhY3Rpb25zOiBBcnJheS5pc0FycmF5KHJ1bGU/LmFjdGlvbnMpID8gcnVsZS5hY3Rpb25zIDogW3J1bGU/LmFjdGlvbl0uZmlsdGVyKEJvb2xlYW4pLFxuICAgICAgICAgICAgb3V0Y29tZTogcnVsZT8ub3V0Y29tZSB8fCAnbmV4dC1zdGVwJ1xuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RzID0gY3VycmVudFdvcmtmbG93LnVuZXhwZWN0ZWRFdmVudEhhbmRsZXJzLnNvbWUoZXhpc3RpbmcgPT5cbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICB0cmlnZ2VyOiBleGlzdGluZz8udHJpZ2dlcixcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBBcnJheS5pc0FycmF5KGV4aXN0aW5nPy5hY3Rpb25zKSA/IGV4aXN0aW5nLmFjdGlvbnMgOiBbZXhpc3Rpbmc/LmFjdGlvbl0uZmlsdGVyKEJvb2xlYW4pLFxuICAgICAgICAgICAgICAgIG91dGNvbWU6IGV4aXN0aW5nPy5vdXRjb21lIHx8ICduZXh0LXN0ZXAnXG4gICAgICAgICAgICB9KSA9PT0ga2V5XG4gICAgICAgICk7XG4gICAgICAgIGlmIChleGlzdHMpIHJldHVybjtcblxuICAgICAgICBjdXJyZW50V29ya2Zsb3cudW5leHBlY3RlZEV2ZW50SGFuZGxlcnMucHVzaChydWxlKTtcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0xFQVJOSU5HX1JVTEUnLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHdvcmtmbG93SWQ6IGN1cnJlbnRXb3JrZmxvdz8uaWQgfHwgJycsXG4gICAgICAgICAgICAgICAgcnVsZVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCAnKicpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVJ1bGVGcm9tRXZlbnQoZXZlbnQsIGFjdGlvbnMsIG91dGNvbWUgPSAnbmV4dC1zdGVwJywgbWF0Y2hNb2RlID0gJ2NvbnRhaW5zJykge1xuICAgICAgICBjb25zdCByZXF1aXJlZEJ1dHRvbnMgPSBldmVudC5raW5kID09PSAnZGlhbG9nJ1xuICAgICAgICAgICAgPyAoZXZlbnQuYnV0dG9ucyB8fCBbXSkubWFwKGJ0biA9PiBidG4uY29udHJvbE5hbWUgfHwgYnRuLnRleHQpLmZpbHRlcihCb29sZWFuKVxuICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgY29uc3QgcmVxdWlyZWRDb250cm9scyA9IGV2ZW50LmtpbmQgPT09ICdtZXNzYWdlQmFyJ1xuICAgICAgICAgICAgPyAoZXZlbnQuY29udHJvbHMgfHwgW10pLm1hcChjdHJsID0+IGN0cmwuY29udHJvbE5hbWUgfHwgY3RybC50ZXh0KS5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgIDogW107XG4gICAgICAgIGNvbnN0IGFjdGlvbkxpc3QgPSBBcnJheS5pc0FycmF5KGFjdGlvbnMpID8gYWN0aW9ucy5maWx0ZXIoQm9vbGVhbikgOiBbXTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlkOiBgcnVsZV8ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygxNikuc2xpY2UoMiwgOCl9YCxcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgIHByaW9yaXR5OiAxMDAsXG4gICAgICAgICAgICBtb2RlOiAnYXV0bycsXG4gICAgICAgICAgICB0cmlnZ2VyOiB7XG4gICAgICAgICAgICAgICAga2luZDogZXZlbnQua2luZCxcbiAgICAgICAgICAgICAgICB0ZXh0VGVtcGxhdGU6IGdlbmVyYWxpemVJbnRlcnJ1cHRpb25UZXh0KGV2ZW50LnRlbXBsYXRlVGV4dCB8fCBldmVudC50ZXh0IHx8ICcnKSxcbiAgICAgICAgICAgICAgICBtYXRjaE1vZGU6IG5vcm1hbGl6ZVRleHQobWF0Y2hNb2RlIHx8ICcnKSA9PT0gJ2V4YWN0JyA/ICdleGFjdCcgOiAnY29udGFpbnMnLFxuICAgICAgICAgICAgICAgIHJlcXVpcmVkQnV0dG9ucyxcbiAgICAgICAgICAgICAgICByZXF1aXJlZENvbnRyb2xzXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYWN0aW9uczogYWN0aW9uTGlzdCxcbiAgICAgICAgICAgIGFjdGlvbjogYWN0aW9uTGlzdFswXSB8fCBudWxsLFxuICAgICAgICAgICAgb3V0Y29tZTogbm9ybWFsaXplRmxvd091dGNvbWUob3V0Y29tZSlcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub3JtYWxpemVGbG93T3V0Y29tZShyYXdPdXRjb21lKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gbm9ybWFsaXplVGV4dChyYXdPdXRjb21lIHx8ICcnKTtcbiAgICAgICAgaWYgKHZhbHVlID09PSAnY29udGludWUtbG9vcCcgfHwgdmFsdWUgPT09ICdjb250aW51ZScpIHJldHVybiAnY29udGludWUtbG9vcCc7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gJ3JlcGVhdC1sb29wJyB8fCB2YWx1ZSA9PT0gJ3JlcGVhdCcgfHwgdmFsdWUgPT09ICdyZXRyeS1sb29wJykgcmV0dXJuICdyZXBlYXQtbG9vcCc7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gJ2JyZWFrLWxvb3AnIHx8IHZhbHVlID09PSAnYnJlYWsnKSByZXR1cm4gJ2JyZWFrLWxvb3AnO1xuICAgICAgICBpZiAodmFsdWUgPT09ICdzdG9wJyB8fCB2YWx1ZSA9PT0gJ2ZhaWwnKSByZXR1cm4gJ3N0b3AnO1xuICAgICAgICByZXR1cm4gJ25leHQtc3RlcCc7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNCZW5pZ25NZXNzYWdlQmFyRXZlbnQoZXZlbnQpIHtcbiAgICAgICAgaWYgKCFldmVudCB8fCBldmVudC5raW5kICE9PSAnbWVzc2FnZUJhcicpIHJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQoZXZlbnQudGV4dCB8fCAnJyk7XG4gICAgICAgIHJldHVybiB0ZXh0LmluY2x1ZGVzKCduZXdyZWNvcmRhY3Rpb24gYnV0dG9uIHNob3VsZCBub3QgcmUtdHJpZ2dlciB0aGUgbmV3IHRhc2snKTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yRmxvd1RyYW5zaXRpb25TdGFiaWxpdHkoKSB7XG4gICAgICAgIGNvbnN0IG1heENoZWNrcyA9IDE2O1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1heENoZWNrczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBsb2FkaW5nID0gaXNEMzY1TG9hZGluZygpO1xuICAgICAgICAgICAgY29uc3QgdmlzaWJsZURpYWxvZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiZGlhbG9nXCJdOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSksIFtkYXRhLWR5bi1yb2xlPVwiRGlhbG9nXCJdOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknKTtcbiAgICAgICAgICAgIGlmICghbG9hZGluZyAmJiAhdmlzaWJsZURpYWxvZykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnRkxPV19TVEFCSUxJVFlfUE9MTF9ERUxBWScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckV2ZW50UmVzb2x1dGlvbihldmVudCwgdGltZW91dE1zID0gMzAwMCkge1xuICAgICAgICBpZiAoIWV2ZW50KSByZXR1cm47XG4gICAgICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRlZEF0IDwgdGltZW91dE1zKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2luZCA9PT0gJ2RpYWxvZycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkaWFsb2dFbCA9IGV2ZW50LmVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgY29uc3QgZGlhbG9nU3RpbGxWaXNpYmxlID0gISFkaWFsb2dFbCAmJiBkaWFsb2dFbC5pc0Nvbm5lY3RlZCAmJiBpc0VsZW1lbnRWaXNpYmxlKGRpYWxvZ0VsKTtcbiAgICAgICAgICAgICAgICBpZiAoIWRpYWxvZ1N0aWxsVmlzaWJsZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeUVsID0gZXZlbnQuZWxlbWVudDtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeVN0aWxsVmlzaWJsZSA9ICEhZW50cnlFbCAmJiBlbnRyeUVsLmlzQ29ubmVjdGVkICYmIGlzRWxlbWVudFZpc2libGUoZW50cnlFbCk7XG4gICAgICAgICAgICAgICAgaWYgKCFlbnRyeVN0aWxsVmlzaWJsZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0ZMT1dfU1RBQklMSVRZX1BPTExfREVMQVknKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkUnVsZUFjdGlvbkZyb21PcHRpb24oZXZlbnQsIG9wdGlvbikge1xuICAgICAgICBjb25zdCBub3JtYWxpemVkQ29udHJvbCA9IG5vcm1hbGl6ZVRleHQob3B0aW9uPy5jb250cm9sTmFtZSB8fCAnJyk7XG4gICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicgJiYgbm9ybWFsaXplZENvbnRyb2wgPT09ICdtZXNzYWdlYmFyY2xvc2UnKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdjbG9zZU1lc3NhZ2VCYXInLFxuICAgICAgICAgICAgICAgIGJ1dHRvbkNvbnRyb2xOYW1lOiBvcHRpb24uY29udHJvbE5hbWUgfHwgJycsXG4gICAgICAgICAgICAgICAgYnV0dG9uVGV4dDogb3B0aW9uLnRleHQgfHwgJydcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdjbGlja0J1dHRvbicsXG4gICAgICAgICAgICBidXR0b25Db250cm9sTmFtZTogb3B0aW9uPy5jb250cm9sTmFtZSB8fCAnJyxcbiAgICAgICAgICAgIGJ1dHRvblRleHQ6IG9wdGlvbj8udGV4dCB8fCAnJ1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGFwcGx5U2luZ2xlQWN0aW9uKGV2ZW50LCBhY3Rpb24pIHtcbiAgICAgICAgaWYgKGFjdGlvbj8udHlwZSA9PT0gJ2NsaWNrQnV0dG9uJyAmJiBldmVudC5raW5kID09PSAnZGlhbG9nJykge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uID0gZmluZERpYWxvZ0J1dHRvbihldmVudCwgYWN0aW9uLmJ1dHRvbkNvbnRyb2xOYW1lIHx8IGFjdGlvbi5idXR0b25UZXh0KTtcbiAgICAgICAgICAgIGlmIChidXR0b24/LmVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICBidXR0b24uZWxlbWVudC5jbGljaygpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RJQUxPR19BQ1RJT05fREVMQVknKTtcbiAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRXZlbnRSZXNvbHV0aW9uKGV2ZW50KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdjbGlja0J1dHRvbicgJiYgZXZlbnQua2luZCA9PT0gJ21lc3NhZ2VCYXInKSB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sID0gZmluZE1lc3NhZ2VCYXJDb250cm9sKGV2ZW50LCBhY3Rpb24uYnV0dG9uQ29udHJvbE5hbWUgfHwgYWN0aW9uLmJ1dHRvblRleHQpO1xuICAgICAgICAgICAgaWYgKGNvbnRyb2w/LmVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICBjb250cm9sLmVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdESUFMT0dfQUNUSU9OX0RFTEFZJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYWN0aW9uPy50eXBlID09PSAnY2xpY2tCdXR0b24nKSB7XG4gICAgICAgICAgICBjb25zdCBnbG9iYWxDb250cm9sID0gZmluZEdsb2JhbENsaWNrYWJsZShhY3Rpb24uYnV0dG9uQ29udHJvbE5hbWUgfHwgYWN0aW9uLmJ1dHRvblRleHQpO1xuICAgICAgICAgICAgaWYgKCFnbG9iYWxDb250cm9sPy5lbGVtZW50KSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBnbG9iYWxDb250cm9sLmVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JUaW1pbmcoJ0RJQUxPR19BQ1RJT05fREVMQVknKTtcbiAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnZGlhbG9nJyB8fCBldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRXZlbnRSZXNvbHV0aW9uKGV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFjdGlvbj8udHlwZSA9PT0gJ2Nsb3NlTWVzc2FnZUJhcicgJiYgZXZlbnQua2luZCA9PT0gJ21lc3NhZ2VCYXInKSB7XG4gICAgICAgICAgICBjb25zdCBmcm9tT3B0aW9uID0gZmluZE1lc3NhZ2VCYXJDb250cm9sKGV2ZW50LCBhY3Rpb24uYnV0dG9uQ29udHJvbE5hbWUgfHwgYWN0aW9uLmJ1dHRvblRleHQpO1xuICAgICAgICAgICAgY29uc3QgZnJvbUNvbnRyb2xzID0gKGV2ZW50LmNvbnRyb2xzIHx8IFtdKS5maW5kKGN0cmwgPT4gbm9ybWFsaXplVGV4dChjdHJsLmNvbnRyb2xOYW1lIHx8ICcnKSA9PT0gJ21lc3NhZ2ViYXJjbG9zZScpO1xuICAgICAgICAgICAgY29uc3QgZnJvbUVudHJ5ID1cbiAgICAgICAgICAgICAgICBldmVudC5lbGVtZW50Py5xdWVyeVNlbGVjdG9yPy4oJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJDbG9zZVwiXScpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCBmcm9tUGFnZSA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiTWVzc2FnZUJhckNsb3NlXCJdJykpLmZpbmQoaXNFbGVtZW50VmlzaWJsZSkgfHwgbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGNsb3NlRWxlbWVudCA9IGZyb21PcHRpb24/LmVsZW1lbnQgfHwgZnJvbUNvbnRyb2xzPy5lbGVtZW50IHx8IGZyb21FbnRyeSB8fCBmcm9tUGFnZTtcbiAgICAgICAgICAgIGlmICghY2xvc2VFbGVtZW50IHx8ICFpc0VsZW1lbnRWaXNpYmxlKGNsb3NlRWxlbWVudCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGNsb3NlRWxlbWVudC5jbGljaygpO1xuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnTUVTU0FHRV9DTE9TRV9ERUxBWScpO1xuICAgICAgICAgICAgYXdhaXQgd2FpdEZvckV2ZW50UmVzb2x1dGlvbihldmVudCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdzdG9wJykge1xuICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFjdGlvbj8udHlwZSA9PT0gJ25vbmUnO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGFwcGx5SGFuZGxlcihldmVudCwgaGFuZGxlcikge1xuICAgICAgICBjb25zdCBhY3Rpb25zID0gbm9ybWFsaXplSGFuZGxlckFjdGlvbnMoaGFuZGxlcik7XG4gICAgICAgIGlmICghYWN0aW9ucy5sZW5ndGgpIHJldHVybiB0cnVlO1xuICAgICAgICBsZXQgaGFuZGxlZCA9IGZhbHNlO1xuICAgICAgICBmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXZlbnRzID0gZGV0ZWN0VW5leHBlY3RlZEV2ZW50cygpO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRXZlbnQgPSBjdXJyZW50RXZlbnRzLmZpbmQoKGNhbmRpZGF0ZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghY2FuZGlkYXRlIHx8IGNhbmRpZGF0ZS5raW5kICE9PSBldmVudC5raW5kKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKGNhbmRpZGF0ZS5lbGVtZW50ICYmIGV2ZW50LmVsZW1lbnQgJiYgY2FuZGlkYXRlLmVsZW1lbnQgPT09IGV2ZW50LmVsZW1lbnQpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZVRlbXBsYXRlID0gbm9ybWFsaXplVGV4dChjYW5kaWRhdGUudGVtcGxhdGVUZXh0IHx8ICcnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBldmVudFRlbXBsYXRlID0gbm9ybWFsaXplVGV4dChldmVudC50ZW1wbGF0ZVRleHQgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBjYW5kaWRhdGVUZW1wbGF0ZSAmJiBldmVudFRlbXBsYXRlICYmIGNhbmRpZGF0ZVRlbXBsYXRlID09PSBldmVudFRlbXBsYXRlO1xuICAgICAgICAgICAgfSkgfHwgY3VycmVudEV2ZW50c1swXSB8fCBldmVudDtcbiAgICAgICAgICAgIGNvbnN0IGFwcGxpZWQgPSBhd2FpdCBhcHBseVNpbmdsZUFjdGlvbihhY3RpdmVFdmVudCwgYWN0aW9uKTtcbiAgICAgICAgICAgIGhhbmRsZWQgPSBoYW5kbGVkIHx8IGFwcGxpZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhhbmRsZWQ7XG4gICAgfVxuXG4gICAgLy8gYXNrVXNlckFuZEhhbmRsZUV2ZW50IHJlbW92ZWQgXHUyMDE0IGxlYXJuaW5nIG1vZGUgdXNlcyB0aGUgcmVjb3JkZXItYmFzZWRcbiAgICAvLyBhcHByb2FjaCBpbiBoYW5kbGVVbmV4cGVjdGVkRXZlbnRzIHdoaWNoIGNhcHR1cmVzIHVzZXIgY2xpY2tzIG9uIHRoZVxuICAgIC8vIGFjdHVhbCBEMzY1IHBhZ2UgYW5kIGF1dG9tYXRpY2FsbHkgY3JlYXRlcyBydWxlcyBmcm9tIHRoZW0uXG5cbiAgICBmdW5jdGlvbiBpbmZlckZsb3dPdXRjb21lRnJvbUFjdGlvbihhY3Rpb24sIGV2ZW50KSB7XG4gICAgICAgIGNvbnN0IHRva2VuID0gbm9ybWFsaXplVGV4dChhY3Rpb24/LmNvbnRyb2xOYW1lIHx8IGFjdGlvbj8udGV4dCB8fCAnJyk7XG4gICAgICAgIGlmICghdG9rZW4pIHJldHVybiAnbmV4dC1zdGVwJztcbiAgICAgICAgaWYgKHRva2VuLmluY2x1ZGVzKCdzdG9wJykpIHJldHVybiAnc3RvcCc7XG4gICAgICAgIGlmICh0b2tlbi5pbmNsdWRlcygnY2FuY2VsJykgfHwgdG9rZW4uaW5jbHVkZXMoJ2Nsb3NlJykgfHwgdG9rZW4gPT09ICdubycpIHtcbiAgICAgICAgICAgIGlmIChldmVudD8ua2luZCA9PT0gJ21lc3NhZ2VCYXInKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdjb250aW51ZS1sb29wJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAnbmV4dC1zdGVwJztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJ25leHQtc3RlcCc7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRJbnRlcnJ1cHRpb25PcHRpb25zKGV2ZW50KSB7XG4gICAgICAgIGNvbnN0IGRlZHVwZSA9IG5ldyBTZXQoKTtcbiAgICAgICAgY29uc3QgYWxsID0gW107XG4gICAgICAgIGNvbnN0IHB1c2hVbmlxdWUgPSAoaXRlbSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3B0aW9uID0ge1xuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBpdGVtPy5jb250cm9sTmFtZSB8fCAnJyxcbiAgICAgICAgICAgICAgICB0ZXh0OiBpdGVtPy50ZXh0IHx8ICcnXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gYCR7bm9ybWFsaXplVGV4dChvcHRpb24uY29udHJvbE5hbWUpfXwke25vcm1hbGl6ZVRleHQob3B0aW9uLnRleHQpfWA7XG4gICAgICAgICAgICBpZiAoZGVkdXBlLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICBkZWR1cGUuYWRkKGtleSk7XG4gICAgICAgICAgICBhbGwucHVzaChvcHRpb24pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChldmVudC5raW5kID09PSAnZGlhbG9nJykge1xuICAgICAgICAgICAgKGV2ZW50LmJ1dHRvbnMgfHwgW10pLmZvckVhY2gocHVzaFVuaXF1ZSk7XG4gICAgICAgICAgICBjb2xsZWN0R2xvYmFsUmVtZWRpYXRpb25Db250cm9scygpLmZvckVhY2gocHVzaFVuaXF1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAoZXZlbnQuY29udHJvbHMgfHwgW10pLmZvckVhY2gocHVzaFVuaXF1ZSk7XG4gICAgICAgICAgICBjb2xsZWN0R2xvYmFsUmVtZWRpYXRpb25Db250cm9scygpLmZvckVhY2gocHVzaFVuaXF1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzY29yZSA9IChvcHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gbm9ybWFsaXplVGV4dChvcHQuY29udHJvbE5hbWUgfHwgb3B0LnRleHQgfHwgJycpO1xuICAgICAgICAgICAgaWYgKHRva2VuID09PSAncmVtb3ZlJyB8fCB0b2tlbi5pbmNsdWRlcygncmVtb3ZlJykgfHwgdG9rZW4gPT09ICdkZWxldGUnIHx8IHRva2VuLmluY2x1ZGVzKCdkZWxldGUnKSkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKHRva2VuID09PSAnY2FuY2VsJyB8fCB0b2tlbi5pbmNsdWRlcygnY2FuY2VsJykpIHJldHVybiAwO1xuICAgICAgICAgICAgaWYgKHRva2VuID09PSAnY2xvc2UnIHx8IHRva2VuLmluY2x1ZGVzKCdjbG9zZScpKSByZXR1cm4gMTtcbiAgICAgICAgICAgIGlmICh0b2tlbiA9PT0gJ25vJykgcmV0dXJuIDI7XG4gICAgICAgICAgICBpZiAodG9rZW4uc3RhcnRzV2l0aCgnbWVzc2FnZWJhcicpKSByZXR1cm4gMTA7XG4gICAgICAgICAgICByZXR1cm4gNTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGFsbC5zb3J0KChhLCBiKSA9PiBzY29yZShhKSAtIHNjb3JlKGIpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kRXZlbnRPcHRpb25FbGVtZW50KGV2ZW50LCBvcHRpb24pIHtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRDb250cm9sID0gbm9ybWFsaXplVGV4dChvcHRpb24/LmNvbnRyb2xOYW1lIHx8ICcnKTtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRUZXh0ID0gbm9ybWFsaXplVGV4dChvcHRpb24/LnRleHQgfHwgJycpO1xuICAgICAgICBjb25zdCBkaWFsb2dCdXR0b24gPSAoZXZlbnQuYnV0dG9ucyB8fCBbXSkuZmluZChidG4gPT4ge1xuICAgICAgICAgICAgY29uc3QgYnlDb250cm9sID0gbm9ybWFsaXplVGV4dChidG4uY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICAgICAgY29uc3QgYnlUZXh0ID0gbm9ybWFsaXplVGV4dChidG4udGV4dCB8fCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gKGV4cGVjdGVkQ29udHJvbCAmJiBieUNvbnRyb2wgPT09IGV4cGVjdGVkQ29udHJvbCkgfHwgKGV4cGVjdGVkVGV4dCAmJiBieVRleHQgPT09IGV4cGVjdGVkVGV4dCk7XG4gICAgICAgIH0pPy5lbGVtZW50IHx8IG51bGw7XG4gICAgICAgIGlmIChkaWFsb2dCdXR0b24pIHJldHVybiBkaWFsb2dCdXR0b247XG5cbiAgICAgICAgY29uc3QgbWVzc2FnZUNvbnRyb2wgPSAoZXZlbnQuY29udHJvbHMgfHwgW10pLmZpbmQoY3RybCA9PiB7XG4gICAgICAgICAgICBjb25zdCBieUNvbnRyb2wgPSBub3JtYWxpemVUZXh0KGN0cmwuY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICAgICAgY29uc3QgYnlUZXh0ID0gbm9ybWFsaXplVGV4dChjdHJsLnRleHQgfHwgJycpO1xuICAgICAgICAgICAgcmV0dXJuIChleHBlY3RlZENvbnRyb2wgJiYgYnlDb250cm9sID09PSBleHBlY3RlZENvbnRyb2wpIHx8IChleHBlY3RlZFRleHQgJiYgYnlUZXh0ID09PSBleHBlY3RlZFRleHQpO1xuICAgICAgICB9KT8uZWxlbWVudCB8fCBudWxsO1xuICAgICAgICBpZiAobWVzc2FnZUNvbnRyb2wpIHJldHVybiBtZXNzYWdlQ29udHJvbDtcblxuICAgICAgICByZXR1cm4gZmluZEdsb2JhbENsaWNrYWJsZShvcHRpb24/LmNvbnRyb2xOYW1lIHx8IG9wdGlvbj8udGV4dCB8fCAnJyk/LmVsZW1lbnQgfHwgbnVsbDtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiByZXF1ZXN0SW50ZXJydXB0aW9uRGVjaXNpb24oZXZlbnQpIHtcbiAgICAgICAgY29uc3QgcmVxdWVzdElkID0gYGludHJfJHtEYXRlLm5vdygpfV8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMTYpLnNsaWNlKDIsIDgpfWA7XG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0ludGVycnVwdGlvbkRlY2lzaW9uID0gbnVsbDtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IHRydWU7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICBwcm9ncmVzczoge1xuICAgICAgICAgICAgICAgIHBoYXNlOiAncGF1c2VkRm9ySW50ZXJydXB0aW9uJyxcbiAgICAgICAgICAgICAgICBraW5kOiBldmVudC5raW5kLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHNob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCwgMTgwKSxcbiAgICAgICAgICAgICAgICBzdGVwSW5kZXg6IGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleFxuICAgICAgICAgICAgfVxuICAgICAgICB9LCAnKicpO1xuICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfSU5URVJSVVBUSU9OJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgICAgd29ya2Zsb3dJZDogY3VycmVudFdvcmtmbG93Py5pZCB8fCAnJyxcbiAgICAgICAgICAgICAgICBzdGVwSW5kZXg6IGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleCxcbiAgICAgICAgICAgICAgICBraW5kOiBldmVudC5raW5kLFxuICAgICAgICAgICAgICAgIHRleHQ6IHNob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCwgNjAwKSxcbiAgICAgICAgICAgICAgICBvcHRpb25zOiBidWlsZEludGVycnVwdGlvbk9wdGlvbnMoZXZlbnQpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sICcqJyk7XG5cbiAgICAgICAgd2hpbGUgKCFleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCkge1xuICAgICAgICAgICAgY29uc3QgZGVjaXNpb24gPSBleGVjdXRpb25Db250cm9sLnBlbmRpbmdJbnRlcnJ1cHRpb25EZWNpc2lvbjtcbiAgICAgICAgICAgIGlmIChkZWNpc2lvbiAmJiBkZWNpc2lvbi5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCkge1xuICAgICAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0ludGVycnVwdGlvbkRlY2lzaW9uID0gbnVsbDtcbiAgICAgICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlY2lzaW9uO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnSU5URVJSVVBUSU9OX1BPTExfREVMQVknKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gYXBwbHlJbnRlcnJ1cHRpb25EZWNpc2lvbihldmVudCwgZGVjaXNpb24pIHtcbiAgICAgICAgY29uc3QgYWN0aW9uVHlwZSA9IGRlY2lzaW9uPy5hY3Rpb25UeXBlIHx8ICdub25lJztcbiAgICAgICAgaWYgKGFjdGlvblR5cGUgPT09ICdzdG9wJykge1xuICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGNsaWNrZWRPcHRpb24gPSBudWxsO1xuICAgICAgICBsZXQgY2xpY2tlZEZvbGxvd3VwT3B0aW9uID0gbnVsbDtcbiAgICAgICAgaWYgKGFjdGlvblR5cGUgPT09ICdjbGlja09wdGlvbicpIHtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbiA9IGRlY2lzaW9uPy5zZWxlY3RlZE9wdGlvbiB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRXZlbnRPcHRpb25FbGVtZW50KGV2ZW50LCBvcHRpb24pO1xuICAgICAgICAgICAgaWYgKGVsZW1lbnQgJiYgdHlwZW9mIGVsZW1lbnQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50LmNsaWNrKCk7XG4gICAgICAgICAgICAgICAgY2xpY2tlZE9wdGlvbiA9IG9wdGlvbjtcbiAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdESUFMT0dfQUNUSU9OX0RFTEFZJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZm9sbG93dXAgPSBkZWNpc2lvbj8uc2VsZWN0ZWRGb2xsb3d1cE9wdGlvbiB8fCBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChmb2xsb3d1cCAmJiBub3JtYWxpemVUZXh0KGZvbGxvd3VwLmNvbnRyb2xOYW1lIHx8IGZvbGxvd3VwLnRleHQgfHwgJycpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvbi5jb250cm9sTmFtZSB8fCBvcHRpb24udGV4dCB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVmcmVzaEV2ZW50cyA9IGRldGVjdFVuZXhwZWN0ZWRFdmVudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9sbG93dXBFdmVudCA9IHJlZnJlc2hFdmVudHNbMF0gfHwgZXZlbnQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvbGxvd3VwRWxlbWVudCA9IGZpbmRFdmVudE9wdGlvbkVsZW1lbnQoZm9sbG93dXBFdmVudCwgZm9sbG93dXApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sbG93dXBFbGVtZW50ICYmIHR5cGVvZiBmb2xsb3d1cEVsZW1lbnQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGxvd3VwRWxlbWVudC5jbGljaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xpY2tlZEZvbGxvd3VwT3B0aW9uID0gZm9sbG93dXA7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yVGltaW5nKCdESUFMT0dfQUNUSU9OX0RFTEFZJyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFNlbGVjdGVkIGZvbGxvdy11cCBvcHRpb24gbm90IGZvdW5kOiAke2ZvbGxvd3VwLmNvbnRyb2xOYW1lIHx8IGZvbGxvd3VwLnRleHQgfHwgJ3Vua25vd24nfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFNlbGVjdGVkIGludGVycnVwdGlvbiBvcHRpb24gbm90IGZvdW5kOiAke29wdGlvbi5jb250cm9sTmFtZSB8fCBvcHRpb24udGV4dCB8fCAndW5rbm93bid9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZGVjaXNpb24/LnNhdmVSdWxlICYmIGNsaWNrZWRPcHRpb24pIHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGlvbnMgPSBbYnVpbGRSdWxlQWN0aW9uRnJvbU9wdGlvbihldmVudCwgY2xpY2tlZE9wdGlvbildO1xuICAgICAgICAgICAgaWYgKGNsaWNrZWRGb2xsb3d1cE9wdGlvbikge1xuICAgICAgICAgICAgICAgIGFjdGlvbnMucHVzaChidWlsZFJ1bGVBY3Rpb25Gcm9tT3B0aW9uKGV2ZW50LCBjbGlja2VkRm9sbG93dXBPcHRpb24pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlY29yZExlYXJuZWRSdWxlKGNyZWF0ZVJ1bGVGcm9tRXZlbnQoZXZlbnQsIGFjdGlvbnMsIGRlY2lzaW9uPy5vdXRjb21lIHx8ICduZXh0LXN0ZXAnLCBkZWNpc2lvbj8ubWF0Y2hNb2RlIHx8ICdjb250YWlucycpKTtcbiAgICAgICAgICAgIHNlbmRMb2coJ3N1Y2Nlc3MnLCBgTGVhcm5lZCAke2V2ZW50LmtpbmR9IGhhbmRsZXI6ICR7Y2xpY2tlZE9wdGlvbi5jb250cm9sTmFtZSB8fCBjbGlja2VkT3B0aW9uLnRleHQgfHwgJ2FjdGlvbid9JHtjbGlja2VkRm9sbG93dXBPcHRpb24gPyAnIC0+IGZvbGxvdy11cCcgOiAnJ31gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG91dGNvbWUgPSBub3JtYWxpemVGbG93T3V0Y29tZShkZWNpc2lvbj8ub3V0Y29tZSB8fCAnbmV4dC1zdGVwJyk7XG4gICAgICAgIGlmIChvdXRjb21lID09PSAnc3RvcCcpIHtcbiAgICAgICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3V0Y29tZSA9PT0gJ2NvbnRpbnVlLWxvb3AnIHx8IG91dGNvbWUgPT09ICdicmVhay1sb29wJyB8fCBvdXRjb21lID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRmxvd1RyYW5zaXRpb25TdGFiaWxpdHkoKTtcbiAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogb3V0Y29tZSB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChldmVudD8ua2luZCA9PT0gJ2RpYWxvZycpIHtcbiAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JGbG93VHJhbnNpdGlvblN0YWJpbGl0eSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlVW5leHBlY3RlZEV2ZW50cyhsZWFybmluZ01vZGUpIHtcbiAgICAgICAgY29uc3QgbWF4RGVwdGggPSA2O1xuICAgICAgICBmb3IgKGxldCBkZXB0aCA9IDA7IGRlcHRoIDwgbWF4RGVwdGg7IGRlcHRoKyspIHtcbiAgICAgICAgICAgIGxldCBldmVudHMgPSBkZXRlY3RVbmV4cGVjdGVkRXZlbnRzKCk7XG5cbiAgICAgICAgICAgIC8vIElmIG5vIGV2ZW50cyBmb3VuZCBvbiB0aGUgZmlyc3QgY2hlY2ssIHBvbGwgYnJpZWZseSB0byBjYXRjaFxuICAgICAgICAgICAgLy8gZGlhbG9ncyB0aGF0IGFyZSBzdGlsbCByZW5kZXJpbmcuICBEMzY1IGNvbmZpcm1hdGlvbiBkaWFsb2dzXG4gICAgICAgICAgICAvLyAoZS5nLiBkZWxldGUgcmVjb3JkKSByZW5kZXIgYXN5bmNocm9ub3VzbHkgYW5kIG1heSBub3QgdHJpZ2dlclxuICAgICAgICAgICAgLy8gYW55IGxvYWRpbmcgaW5kaWNhdG9yLCBzbyB3ZSBhbHdheXMgcG9sbCBhIGZldyB0aW1lcyByYXRoZXJcbiAgICAgICAgICAgIC8vIHRoYW4gZ2F0aW5nIG9uIGlzRDM2NUxvYWRpbmcoKS4gIElmIEQzNjUgSVMgbG9hZGluZyB3ZSBleHRlbmRcbiAgICAgICAgICAgIC8vIHRoZSB3aW5kb3cgdG8gZ2l2ZSBoZWF2aWVyIHNlcnZlciBvcGVyYXRpb25zIHRpbWUgdG8gZmluaXNoLlxuICAgICAgICAgICAgaWYgKCFldmVudHMubGVuZ3RoICYmIGRlcHRoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmFzZVBvbGxBdHRlbXB0cyA9IDU7ICAgICAgICAvLyB+NjAwIG1zIG1pbmltdW0gd2luZG93XG4gICAgICAgICAgICAgICAgY29uc3QgbG9hZGluZyA9IGlzRDM2NUxvYWRpbmcoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwb2xsQXR0ZW1wdHMgPSBsb2FkaW5nID8gYmFzZVBvbGxBdHRlbXB0cyAqIDIgOiBiYXNlUG9sbEF0dGVtcHRzO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IHAgPSAwOyBwIDwgcG9sbEF0dGVtcHRzOyBwKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclRpbWluZygnRkxPV19TVEFCSUxJVFlfUE9MTF9ERUxBWScpO1xuICAgICAgICAgICAgICAgICAgICBldmVudHMgPSBkZXRlY3RVbmV4cGVjdGVkRXZlbnRzKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudHMubGVuZ3RoKSBicmVhazsgICAgICAvLyBkaWFsb2cgYXBwZWFyZWRcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFldmVudHMubGVuZ3RoKSByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFldmVudHMubGVuZ3RoKSByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuXG4gICAgICAgICAgICBjb25zdCBldmVudCA9IGV2ZW50c1swXTtcblxuICAgICAgICAgICAgaWYgKGlzQmVuaWduTWVzc2FnZUJhckV2ZW50KGV2ZW50KSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGBtZXNzYWdlQmFyfCR7ZXZlbnQudGVtcGxhdGVUZXh0fWA7XG4gICAgICAgICAgICAgICAgaWYgKCFhY2tub3dsZWRnZWRNZXNzYWdlQmFyS2V5cy5oYXMoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYElnbm9yaW5nIGJlbmlnbiBtZXNzYWdlIGJhcjogJHtzaG9ydGVuRm9yTG9nKGV2ZW50LnRleHQsIDEyMCl9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmFkZChrZXkpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyAtLS0gVHJ5IHNhdmVkIGhhbmRsZXJzIGZpcnN0ICh3b3JrcyBpbiBCT1RIIG1vZGVzKSAtLS1cbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZXIgPSBmaW5kTWF0Y2hpbmdIYW5kbGVyKGV2ZW50KTtcbiAgICAgICAgICAgIGlmIChoYW5kbGVyICYmIGhhbmRsZXIubW9kZSAhPT0gJ2Fsd2F5c0FzaycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGVkID0gYXdhaXQgYXBwbHlIYW5kbGVyKGV2ZW50LCBoYW5kbGVyKTtcbiAgICAgICAgICAgICAgICBpZiAoaGFuZGxlZCkge1xuICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYEFwcGxpZWQgbGVhcm5lZCBoYW5kbGVyIGZvciAke2V2ZW50LmtpbmR9OiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCl9YCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZXJPdXRjb21lID0gbm9ybWFsaXplRmxvd091dGNvbWUoaGFuZGxlcj8ub3V0Y29tZSB8fCAnbmV4dC1zdGVwJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChoYW5kbGVyT3V0Y29tZSA9PT0gJ3N0b3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhbmRsZXJPdXRjb21lID09PSAnY29udGludWUtbG9vcCcgfHwgaGFuZGxlck91dGNvbWUgPT09ICdicmVhay1sb29wJyB8fCBoYW5kbGVyT3V0Y29tZSA9PT0gJ3JlcGVhdC1sb29wJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvckZsb3dUcmFuc2l0aW9uU3RhYmlsaXR5KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IGhhbmRsZXJPdXRjb21lIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LmtpbmQgPT09ICdkaWFsb2cnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRmxvd1RyYW5zaXRpb25TdGFiaWxpdHkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBNYXJrIG1lc3NhZ2UgYmFyIGFzIGFja25vd2xlZGdlZCBzbyBpdCBkb2Vzbid0IHJlLXRyaWdnZXIgaWZcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGJhciBwZXJzaXN0cyBhZnRlciB0aGUgaGFuZGxlciByYW4gKGUuZy4gY2xvc2UgYnV0dG9uIGhpZGRlbikuXG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmFkZChgbWVzc2FnZUJhcnwke2V2ZW50LnRlbXBsYXRlVGV4dH1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIC0tLSBOb24tYmxvY2tpbmcgbWVzc2FnZSBiYXIgaGFuZGxpbmcgLS0tXG4gICAgICAgICAgICAvLyBNZXNzYWdlIGJhcnMgZG9uJ3QgYmxvY2sgdGhlIFVJLiBJbiBsZWFybmluZyBtb2RlIHdlIHBhdXNlIE9OQ0UgdG9cbiAgICAgICAgICAgIC8vIGxldCB0aGUgdXNlciBkZWNpZGUsIHRoZW4gYWNrbm93bGVkZ2UgdGhlIGtleSBzbyBpdCBkb2Vzbid0IHJlcGVhdC5cbiAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICBpZiAobGVhcm5pbmdNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTGVhcm5pbmcgbW9kZTogbWVzc2FnZSBiYXIgZGV0ZWN0ZWQsIGRlY2lzaW9uIHJlcXVpcmVkOiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCl9YCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgcmVxdWVzdEludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXBwbHlJbnRlcnJ1cHRpb25EZWNpc2lvbihldmVudCwgZGVjaXNpb24pO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgJiYgcmVzdWx0LnNpZ25hbCAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY2tub3dsZWRnZWRNZXNzYWdlQmFyS2V5cy5hZGQoYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm9uLWxlYXJuaW5nIG1vZGU6IGp1c3QgbG9nIG9uY2VcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmFkZChrZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBNZXNzYWdlIGJhciBkZXRlY3RlZCB3aXRoIG5vIGhhbmRsZXI6ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBNYXJrIGFzIGFja25vd2xlZGdlZCBzbyBpdCBkb2Vzbid0IHJlLXRyaWdnZXIgb24gc3Vic2VxdWVudCBzdGVwc1xuICAgICAgICAgICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmFkZChgbWVzc2FnZUJhcnwke2V2ZW50LnRlbXBsYXRlVGV4dH1gKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gLS0tIEJsb2NraW5nIGRpYWxvZyBoYW5kbGluZyAtLS1cbiAgICAgICAgICAgIGlmIChsZWFybmluZ01vZGUpIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYExlYXJuaW5nIG1vZGU6IGRpYWxvZyByZXF1aXJlcyBkZWNpc2lvbjogJHtzaG9ydGVuRm9yTG9nKGV2ZW50LnRleHQpfWApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgcmVxdWVzdEludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50KTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseUludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50LCBkZWNpc2lvbik7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsICYmIHJlc3VsdC5zaWduYWwgIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTm9uLWxlYXJuaW5nIG1vZGUgd2l0aCBubyBoYW5kbGVyOiBsb2cgb25jZSBhbmQgcmV0dXJuXG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtldmVudC5raW5kfXwke2V2ZW50LnRlbXBsYXRlVGV4dH1gO1xuICAgICAgICAgICAgaWYgKCF1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgdW5oYW5kbGVkVW5leHBlY3RlZEV2ZW50S2V5cy5hZGQoa2V5KTtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFVuZXhwZWN0ZWQgJHtldmVudC5raW5kfSBkZXRlY3RlZCB3aXRoIG5vIGhhbmRsZXI6ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICB9XG5cbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVXb3JrZmxvdyh3b3JrZmxvdywgZGF0YSkge1xuICAgIHRyeSB7XG4gICAgICAgIC8vIENsZWFyIGFueSBzdGFsZSBwZW5kaW5nIG5hdmlnYXRpb24gc3RhdGUgYmVmb3JlIHN0YXJ0aW5nIGEgbmV3IHJ1blxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbSgnZDM2NV9wZW5kaW5nX3dvcmtmbG93Jyk7XG4gICAgICAgICAgICBpZiAod29ya2Zsb3c/LmlkKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9hY3RpdmVfd29ya2Zsb3dfaWQnLCB3b3JrZmxvdy5pZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIElnbm9yZSBzZXNzaW9uU3RvcmFnZSBlcnJvcnMgKGUuZy4sIGluIHJlc3RyaWN0ZWQgY29udGV4dHMpXG4gICAgICAgIH1cblxuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFN0YXJ0aW5nIHdvcmtmbG93OiAke3dvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB8fCAndW5uYW1lZCd9YCk7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHsgcGhhc2U6ICd3b3JrZmxvd1N0YXJ0Jywgd29ya2Zsb3c6IHdvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB9IH0sICcqJyk7XG4gICAgICAgIC8vIFJlc2V0IGV4ZWN1dGlvbiBjb250cm9sXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQgPSBmYWxzZTtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb24gPSBudWxsO1xuICAgICAgICBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnMgPSB3b3JrZmxvdy5ydW5PcHRpb25zIHx8IHsgc2tpcFJvd3M6IDAsIGxpbWl0Um93czogMCwgZHJ5UnVuOiBmYWxzZSwgbGVhcm5pbmdNb2RlOiBmYWxzZSwgcnVuVW50aWxJbnRlcmNlcHRpb246IGZhbHNlIH07XG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0ID0gd29ya2Zsb3c/Ll9vcmlnaW5hbFN0YXJ0SW5kZXggfHwgMDtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4ID0gZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQ7XG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucHJvY2Vzc2VkUm93cyA9IDA7XG4gICAgICAgIHVuaGFuZGxlZFVuZXhwZWN0ZWRFdmVudEtleXMuY2xlYXIoKTtcbiAgICAgICAgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuY2xlYXIoKTtcbiAgICAgICAgY3VycmVudFdvcmtmbG93ID0gd29ya2Zsb3c7XG4gICAgICAgIFxuICAgICAgICAvLyBBbHdheXMgcmVmcmVzaCBvcmlnaW5hbC13b3JrZmxvdyBwb2ludGVyIHRvIGF2b2lkIHN0YWxlIHJlc3VtZSBzdGF0ZVxuICAgICAgICAvLyBmcm9tIGEgcHJldmlvdXNseSBleGVjdXRlZCB3b3JrZmxvdyBpbiB0aGUgc2FtZSBwYWdlIGNvbnRleHQuXG4gICAgICAgIHdpbmRvdy5kMzY1T3JpZ2luYWxXb3JrZmxvdyA9IHdvcmtmbG93Py5fb3JpZ2luYWxXb3JrZmxvdyB8fCB3b3JrZmxvdztcbiAgICAgICAgXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gd29ya2Zsb3c/LnNldHRpbmdzIHx8IHt9O1xuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gY3VycmVudFdvcmtmbG93U2V0dGluZ3M7XG4gICAgICAgIC8vIEV4cG9zZSBjdXJyZW50IHdvcmtmbG93IGFuZCBleGVjdXRpb24gY29udHJvbCB0byBpbmplY3RlZCBhY3Rpb24gbW9kdWxlc1xuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyA9IGN1cnJlbnRXb3JrZmxvdztcbiAgICAgICAgd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sID0gZXhlY3V0aW9uQ29udHJvbDtcbiAgICAgICAgY29uc3Qgc3RlcHMgPSB3b3JrZmxvdy5zdGVwcztcbiAgICAgICAgXG4gICAgICAgIC8vIEdldCBkYXRhIGZyb20gbmV3IGRhdGFTb3VyY2VzIHN0cnVjdHVyZSBvciBsZWdhY3kgZGF0YVNvdXJjZVxuICAgICAgICBsZXQgcHJpbWFyeURhdGEgPSBbXTtcbiAgICAgICAgbGV0IGRldGFpbFNvdXJjZXMgPSB7fTtcbiAgICAgICAgbGV0IHJlbGF0aW9uc2hpcHMgPSBbXTtcbiAgICAgICAgXG4gICAgICAgIGlmICh3b3JrZmxvdy5kYXRhU291cmNlcykge1xuICAgICAgICAgICAgcHJpbWFyeURhdGEgPSB3b3JrZmxvdy5kYXRhU291cmNlcy5wcmltYXJ5Py5kYXRhIHx8IFtdO1xuICAgICAgICAgICAgcmVsYXRpb25zaGlwcyA9IHdvcmtmbG93LmRhdGFTb3VyY2VzLnJlbGF0aW9uc2hpcHMgfHwgW107XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEluZGV4IGRldGFpbCBkYXRhIHNvdXJjZXMgYnkgSURcbiAgICAgICAgICAgICh3b3JrZmxvdy5kYXRhU291cmNlcy5kZXRhaWxzIHx8IFtdKS5mb3JFYWNoKGRldGFpbCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRldGFpbC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbFNvdXJjZXNbZGV0YWlsLmlkXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IGRldGFpbC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZGV0YWlsLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZHM6IGRldGFpbC5maWVsZHNcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChkYXRhKSB7XG4gICAgICAgICAgICAvLyBMZWdhY3kgZm9ybWF0XG4gICAgICAgICAgICBwcmltYXJ5RGF0YSA9IEFycmF5LmlzQXJyYXkoZGF0YSkgPyBkYXRhIDogW2RhdGFdO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBJZiBubyBkYXRhLCB1c2UgYSBzaW5nbGUgZW1wdHkgcm93IHRvIHJ1biBzdGVwcyBvbmNlXG4gICAgICAgIGlmIChwcmltYXJ5RGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gW3t9XTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEV4ZWN1dGUgd29ya2Zsb3cgd2l0aCBsb29wIHN1cHBvcnRcbiAgICAgICAgYXdhaXQgZXhlY3V0ZVN0ZXBzV2l0aExvb3BzKHN0ZXBzLCBwcmltYXJ5RGF0YSwgZGV0YWlsU291cmNlcywgcmVsYXRpb25zaGlwcywgd29ya2Zsb3cuc2V0dGluZ3MpO1xuXG4gICAgICAgIGNvbnN0IHByb2Nlc3NlZFJvd3MgPSBleGVjdXRpb25Db250cm9sLnByb2Nlc3NlZFJvd3MgPiAwXG4gICAgICAgICAgICA/IGV4ZWN1dGlvbkNvbnRyb2wucHJvY2Vzc2VkUm93c1xuICAgICAgICAgICAgOiBwcmltYXJ5RGF0YS5sZW5ndGg7XG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgV29ya2Zsb3cgY29tcGxldGU6IHByb2Nlc3NlZCAke3Byb2Nlc3NlZFJvd3N9IHJvd3NgKTtcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0NPTVBMRVRFJyxcbiAgICAgICAgICAgIHJlc3VsdDogeyBwcm9jZXNzZWQ6IHByb2Nlc3NlZFJvd3MgfVxuICAgICAgICB9LCAnKicpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIC8vIE5hdmlnYXRpb24gaW50ZXJydXB0cyBhcmUgbm90IGVycm9ycyAtIHRoZSB3b3JrZmxvdyB3aWxsIHJlc3VtZSBhZnRlciBwYWdlIGxvYWRcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmlzTmF2aWdhdGlvbkludGVycnVwdCkge1xuICAgICAgICAgICAgc2VuZExvZygnaW5mbycsICdXb3JrZmxvdyBwYXVzZWQgZm9yIG5hdmlnYXRpb24gLSB3aWxsIHJlc3VtZSBhZnRlciBwYWdlIGxvYWRzJyk7XG4gICAgICAgICAgICByZXR1cm47IC8vIERvbid0IHJlcG9ydCBhcyBlcnJvciBvciBjb21wbGV0ZVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAoIWVycm9yIHx8ICFlcnJvci5fcmVwb3J0ZWQpIHtcbiAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFdvcmtmbG93IGVycm9yOiAke2Vycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvcil9YCk7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX0VSUk9SJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycm9yKSxcbiAgICAgICAgICAgICAgICBzdGFjazogZXJyb3I/LnN0YWNrXG4gICAgICAgICAgICB9LCAnKicpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGxpc3QpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkobGlzdCkgfHwgIWxpc3QubGVuZ3RoKSByZXR1cm4gJyc7XG4gICAgcmV0dXJuIGxpc3RbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbGlzdC5sZW5ndGgpXTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVTdGVwRmFrZXJWYWx1ZShnZW5lcmF0b3JOYW1lKSB7XG4gICAgY29uc3QgZmlyc3ROYW1lcyA9IFsnSmFtZXMnLCAnTWFyeScsICdKb2huJywgJ1BhdHJpY2lhJywgJ1JvYmVydCcsICdKZW5uaWZlcicsICdNaWNoYWVsJywgJ0xpbmRhJywgJ0RhdmlkJywgJ0VsaXphYmV0aCcsICdXaWxsaWFtJywgJ0JhcmJhcmEnLCAnUmljaGFyZCcsICdTdXNhbicsICdKb3NlcGgnLCAnSmVzc2ljYSddO1xuICAgIGNvbnN0IGxhc3ROYW1lcyA9IFsnU21pdGgnLCAnSm9obnNvbicsICdXaWxsaWFtcycsICdCcm93bicsICdKb25lcycsICdHYXJjaWEnLCAnTWlsbGVyJywgJ0RhdmlzJywgJ01hcnRpbmV6JywgJ0xvcGV6JywgJ0dvbnphbGV6JywgJ1dpbHNvbicsICdBbmRlcnNvbicsICdUaG9tYXMnLCAnVGF5bG9yJywgJ01vb3JlJ107XG4gICAgY29uc3Qgd29yZHMgPSBbJ2FscGhhJywgJ2JyYXZvJywgJ2NoYXJsaWUnLCAnZGVsdGEnLCAnZWNobycsICdmb3h0cm90JywgJ2FwZXgnLCAnYm9sdCcsICdjcmVzdCcsICdkYXduJywgJ2VtYmVyJywgJ2ZsaW50J107XG5cbiAgICBjb25zdCBuYW1lID0gU3RyaW5nKGdlbmVyYXRvck5hbWUgfHwgJ0ZpcnN0IE5hbWUnKTtcbiAgICBpZiAobmFtZSA9PT0gJ0ZpcnN0IE5hbWUnKSByZXR1cm4gZ2V0U3RlcEZha2VyUmFuZG9tSXRlbShmaXJzdE5hbWVzKTtcbiAgICBpZiAobmFtZSA9PT0gJ0xhc3QgTmFtZScpIHJldHVybiBnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGxhc3ROYW1lcyk7XG4gICAgaWYgKG5hbWUgPT09ICdGdWxsIE5hbWUnKSByZXR1cm4gYCR7Z2V0U3RlcEZha2VyUmFuZG9tSXRlbShmaXJzdE5hbWVzKX0gJHtnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGxhc3ROYW1lcyl9YDtcbiAgICBpZiAobmFtZSA9PT0gJ0VtYWlsJykge1xuICAgICAgICBjb25zdCBmaXJzdCA9IGdldFN0ZXBGYWtlclJhbmRvbUl0ZW0oZmlyc3ROYW1lcykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgbGFzdCA9IGdldFN0ZXBGYWtlclJhbmRvbUl0ZW0obGFzdE5hbWVzKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gYCR7Zmlyc3R9LiR7bGFzdH1AZXhhbXBsZS5jb21gO1xuICAgIH1cbiAgICBpZiAobmFtZSA9PT0gJ051bWJlcicpIHJldHVybiBTdHJpbmcoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDApKTtcbiAgICBpZiAobmFtZSA9PT0gJ0RlY2ltYWwnKSByZXR1cm4gKE1hdGgucmFuZG9tKCkgKiAxMDAwMCkudG9GaXhlZCgyKTtcbiAgICBpZiAobmFtZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgIGNvbnN0IG9mZnNldERheXMgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAzNjUgKiAzKTtcbiAgICAgICAgY29uc3QgZCA9IG5ldyBEYXRlKERhdGUubm93KCkgLSBvZmZzZXREYXlzICogMjQgKiA2MCAqIDYwICogMTAwMCk7XG4gICAgICAgIHJldHVybiBkLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICAgIH1cbiAgICBpZiAobmFtZSA9PT0gJ1VVSUQnKSB7XG4gICAgICAgIHJldHVybiAneHh4eHh4eHgteHh4eC00eHh4LXl4eHgteHh4eHh4eHh4eHh4Jy5yZXBsYWNlKC9beHldL2csIChjKSA9PiB7XG4gICAgICAgICAgICBjb25zdCByID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTYpO1xuICAgICAgICAgICAgY29uc3QgdiA9IGMgPT09ICd4JyA/IHIgOiAociAmIDB4MyB8IDB4OCk7XG4gICAgICAgICAgICByZXR1cm4gdi50b1N0cmluZygxNik7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAobmFtZSA9PT0gJ0Jvb2xlYW4nKSByZXR1cm4gTWF0aC5yYW5kb20oKSA8IDAuNSA/ICd0cnVlJyA6ICdmYWxzZSc7XG4gICAgaWYgKG5hbWUgPT09ICdXb3JkJykgcmV0dXJuIGdldFN0ZXBGYWtlclJhbmRvbUl0ZW0od29yZHMpO1xuICAgIGlmIChuYW1lID09PSAnTG9yZW0gU2VudGVuY2UnKSB7XG4gICAgICAgIGNvbnN0IHBpY2tlZCA9IFsuLi53b3Jkc10uc29ydCgoKSA9PiBNYXRoLnJhbmRvbSgpIC0gMC41KS5zbGljZSgwLCA1KTtcbiAgICAgICAgY29uc3Qgc2VudGVuY2UgPSBwaWNrZWQuam9pbignICcpO1xuICAgICAgICByZXR1cm4gc2VudGVuY2UuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzZW50ZW5jZS5zbGljZSgxKTtcbiAgICB9XG4gICAgaWYgKG5hbWUgPT09ICdTZXF1ZW50aWFsJykge1xuICAgICAgICB3aW5kb3cuX19kMzY1U3RlcEZha2VyU2VxID0gKHdpbmRvdy5fX2QzNjVTdGVwRmFrZXJTZXEgfHwgMCkgKyAxO1xuICAgICAgICByZXR1cm4gU3RyaW5nKHdpbmRvdy5fX2QzNjVTdGVwRmFrZXJTZXEpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0U3RlcEZha2VyUmFuZG9tSXRlbShmaXJzdE5hbWVzKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVN0ZXBWYWx1ZShzdGVwLCBjdXJyZW50Um93KSB7XG4gICAgY29uc3Qgc291cmNlID0gc3RlcD8udmFsdWVTb3VyY2UgfHwgKHN0ZXA/LmZpZWxkTWFwcGluZyA/ICdkYXRhJyA6ICdzdGF0aWMnKTtcblxuICAgIGlmIChzb3VyY2UgPT09ICdjbGlwYm9hcmQnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoIW5hdmlnYXRvci5jbGlwYm9hcmQ/LnJlYWRUZXh0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDbGlwYm9hcmQgQVBJIG5vdCBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLnJlYWRUZXh0KCk7XG4gICAgICAgICAgICByZXR1cm4gdGV4dCA/PyAnJztcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYENsaXBib2FyZCByZWFkIGZhaWxlZDogJHtlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpfWApO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDbGlwYm9hcmQgcmVhZCBmYWlsZWQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzb3VyY2UgPT09ICdkYXRhJykge1xuICAgICAgICBjb25zdCByb3cgPSBjdXJyZW50Um93IHx8IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwge307XG4gICAgICAgIGNvbnN0IGZpZWxkID0gc3RlcD8uZmllbGRNYXBwaW5nIHx8ICcnO1xuICAgICAgICBpZiAoIWZpZWxkKSByZXR1cm4gJyc7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gcm93W2ZpZWxkXTtcbiAgICAgICAgcmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwgPyAnJyA6IFN0cmluZyh2YWx1ZSk7XG4gICAgfVxuXG4gICAgaWYgKHNvdXJjZSA9PT0gJ2Zha2VyJykge1xuICAgICAgICByZXR1cm4gZ2VuZXJhdGVTdGVwRmFrZXJWYWx1ZShzdGVwPy5mYWtlckdlbmVyYXRvciB8fCAnRmlyc3QgTmFtZScpO1xuICAgIH1cblxuICAgIGlmIChzb3VyY2UgPT09ICdyYW5kb20tY29uc3RhbnQnKSB7XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBTdHJpbmcoc3RlcD8ucmFuZG9tVmFsdWVzIHx8ICcnKVxuICAgICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAgIC5tYXAoKHZhbHVlKSA9PiB2YWx1ZS50cmltKCkpXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICBpZiAoIW9wdGlvbnMubGVuZ3RoKSByZXR1cm4gJyc7XG4gICAgICAgIHJldHVybiBvcHRpb25zW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG9wdGlvbnMubGVuZ3RoKV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0ZXA/LnZhbHVlID8/ICcnO1xufVxuXG4vLyBFeGVjdXRlIGEgc2luZ2xlIHN0ZXAgKG1hcHMgc3RlcC50eXBlIHRvIGFjdGlvbiBmdW5jdGlvbnMpXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlU2luZ2xlU3RlcChzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnRSb3csIGRldGFpbFNvdXJjZXMsIHNldHRpbmdzLCBkcnlSdW4sIGxlYXJuaW5nTW9kZSkge1xuICAgIGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleCA9IHR5cGVvZiBzdGVwLl9hYnNvbHV0ZUluZGV4ID09PSAnbnVtYmVyJ1xuICAgICAgICA/IHN0ZXAuX2Fic29sdXRlSW5kZXhcbiAgICAgICAgOiAoZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQgfHwgMCkgKyBzdGVwSW5kZXg7XG4gICAgY29uc3Qgc3RlcExhYmVsID0gc3RlcC5kaXNwbGF5VGV4dCB8fCBzdGVwLmNvbnRyb2xOYW1lIHx8IHN0ZXAudHlwZSB8fCBgc3RlcCAke3N0ZXBJbmRleH1gO1xuICAgIC8vIENvbXB1dGUgYWJzb2x1dGUgc3RlcCBpbmRleCAoYWxyZWFkeSBzdG9yZWQgb24gZXhlY3V0aW9uQ29udHJvbClcbiAgICBjb25zdCBhYnNvbHV0ZVN0ZXBJbmRleCA9IGV4ZWN1dGlvbkNvbnRyb2wuY3VycmVudFN0ZXBJbmRleDtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcFN0YXJ0Jywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XG4gICAgfSwgJyonKTtcbiAgICBsZXQgd2FpdFRhcmdldCA9ICcnO1xuICAgIGxldCBzaG91bGRXYWl0QmVmb3JlID0gZmFsc2U7XG4gICAgbGV0IHNob3VsZFdhaXRBZnRlciA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICAgIC8vIE5vcm1hbGl6ZSBzdGVwIHR5cGUgKGFsbG93IGJvdGggY2FtZWxDYXNlIGFuZCBkYXNoLXNlcGFyYXRlZCB0eXBlcylcbiAgICAgICAgY29uc3Qgc3RlcFR5cGUgPSAoc3RlcC50eXBlIHx8ICcnKS5yZXBsYWNlKC8tKFthLXpdKS9nLCAoXywgYykgPT4gYy50b1VwcGVyQ2FzZSgpKTtcbiAgICAgICAgbG9nU3RlcChgU3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX06ICR7c3RlcFR5cGV9IC0+ICR7c3RlcExhYmVsfWApO1xuXG4gICAgICAgIC8vIEluIGxlYXJuaW5nIG1vZGU6XG4gICAgICAgIC8vIDEuIENoZWNrIGZvciB1bmV4cGVjdGVkIGV2ZW50cyAoZGlhbG9ncy9tZXNzYWdlcykgZnJvbSB0aGUgcHJldmlvdXMgc3RlcC5cbiAgICAgICAgLy8gICAgSWYgb25lIGlzIGZvdW5kIHRoZSB1c2VyIGlzIHBhdXNlZCB0byBoYW5kbGUgaXQsIHNvIHdlIHNraXAgdGhlXG4gICAgICAgIC8vICAgIHNlcGFyYXRlIGNvbmZpcm1hdGlvbiBwYXVzZSB0byBhdm9pZCBhIGRvdWJsZS1wYXVzZS5cbiAgICAgICAgLy8gMi4gSWYgbm8gaW50ZXJydXB0aW9uIHdhcyBmb3VuZCwgcGF1c2UgZm9yIHN0ZXAgY29uZmlybWF0aW9uLlxuICAgICAgICBjb25zdCBydW5VbnRpbEludGVyY2VwdGlvbiA9ICEhZXhlY3V0aW9uQ29udHJvbC5ydW5PcHRpb25zPy5ydW5VbnRpbEludGVyY2VwdGlvbjtcbiAgICAgICAgaWYgKGxlYXJuaW5nTW9kZSkge1xuICAgICAgICAgICAgY29uc3QgaW50ZXJydXB0aW9uID0gYXdhaXQgaGFuZGxlVW5leHBlY3RlZEV2ZW50cyh0cnVlKTtcbiAgICAgICAgICAgIGlmIChpbnRlcnJ1cHRpb24/LnNpZ25hbCAmJiBpbnRlcnJ1cHRpb24uc2lnbmFsICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaW50ZXJydXB0aW9uO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPbmx5IHBhdXNlIGZvciBjb25maXJtYXRpb24gaWYgaGFuZGxlVW5leHBlY3RlZEV2ZW50cyBkaWRuJ3RcbiAgICAgICAgICAgIC8vIGFscmVhZHkgcGF1c2UgKGkuZS4gdGhlcmUgd2VyZSBubyBldmVudHMgdG8gaGFuZGxlKS5cbiAgICAgICAgICAgIGlmICghcnVuVW50aWxJbnRlcmNlcHRpb24pIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYExlYXJuaW5nIG1vZGU6IGNvbmZpcm0gc3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX0gKCR7c3RlcExhYmVsfSkuIFJlc3VtZSB0byBjb250aW51ZS5gKTtcbiAgICAgICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwaGFzZTogJ3BhdXNlZEZvckNvbmZpcm1hdGlvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGVwTmFtZTogc3RlcExhYmVsLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlc3BlY3QgZHJ5IHJ1biBtb2RlXG4gICAgICAgIGlmIChkcnlSdW4pIHtcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgRHJ5IHJ1biAtIHNraXBwaW5nIGFjdGlvbjogJHtzdGVwLnR5cGV9ICR7c3RlcC5jb250cm9sTmFtZSB8fCAnJ31gKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cbiAgICAgICAgICAgIH0sICcqJyk7XG4gICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHJlc29sdmVkVmFsdWUgPSBudWxsO1xuICAgICAgICBpZiAoWydpbnB1dCcsICdzZWxlY3QnLCAnbG9va3VwU2VsZWN0JywgJ2dyaWRJbnB1dCcsICdmaWx0ZXInLCAncXVlcnlGaWx0ZXInXS5pbmNsdWRlcyhzdGVwVHlwZSkpIHtcbiAgICAgICAgICAgIHJlc29sdmVkVmFsdWUgPSBhd2FpdCByZXNvbHZlU3RlcFZhbHVlKHN0ZXAsIGN1cnJlbnRSb3cpO1xuICAgICAgICB9XG5cbiAgICAgICAgd2FpdFRhcmdldCA9IHN0ZXAud2FpdFRhcmdldENvbnRyb2xOYW1lIHx8IHN0ZXAuY29udHJvbE5hbWUgfHwgJyc7XG4gICAgICAgIHNob3VsZFdhaXRCZWZvcmUgPSAhIXN0ZXAud2FpdFVudGlsVmlzaWJsZTtcbiAgICAgICAgc2hvdWxkV2FpdEFmdGVyID0gISFzdGVwLndhaXRVbnRpbEhpZGRlbjtcblxuICAgICAgICBpZiAoKHNob3VsZFdhaXRCZWZvcmUgfHwgc2hvdWxkV2FpdEFmdGVyKSAmJiAhd2FpdFRhcmdldCkge1xuICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBXYWl0IG9wdGlvbiBzZXQgYnV0IG5vIGNvbnRyb2wgbmFtZSBvbiBzdGVwICR7YWJzb2x1dGVTdGVwSW5kZXggKyAxfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZFdhaXRCZWZvcmUgJiYgd2FpdFRhcmdldCkge1xuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICd2aXNpYmxlJywgbnVsbCwgNTAwMCk7XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2ggKHN0ZXBUeXBlKSB7XG4gICAgICAgICAgICBjYXNlICdjbGljayc6XG4gICAgICAgICAgICAgICAgYXdhaXQgY2xpY2tFbGVtZW50KHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdpbnB1dCc6XG4gICAgICAgICAgICBjYXNlICdzZWxlY3QnOlxuICAgICAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWVsZFR5cGUsIHN0ZXAuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnbG9va3VwU2VsZWN0JzpcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRMb29rdXBTZWxlY3RWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlLCBzdGVwLmNvbWJvU2VsZWN0TW9kZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2NoZWNrYm94JzpcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRDaGVja2JveFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIGNvZXJjZUJvb2xlYW4oc3RlcC52YWx1ZSkpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdncmlkSW5wdXQnOlxuICAgICAgICAgICAgICAgIGF3YWl0IHNldEdyaWRDZWxsVmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWVsZFR5cGUsICEhc3RlcC53YWl0Rm9yVmFsaWRhdGlvbiwgc3RlcC5jb21ib1NlbGVjdE1vZGUgfHwgJycpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdmaWx0ZXInOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFwcGx5R3JpZEZpbHRlcihzdGVwLmNvbnRyb2xOYW1lLCByZXNvbHZlZFZhbHVlLCBzdGVwLmZpbHRlck1ldGhvZCB8fCAnaXMgZXhhY3RseScsIHN0ZXAuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3F1ZXJ5RmlsdGVyJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBjb25maWd1cmVRdWVyeUZpbHRlcihzdGVwLnRhYmxlTmFtZSwgc3RlcC5maWVsZE5hbWUsIHJlc29sdmVkVmFsdWUsIHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZWRRdWVyeTogc3RlcC5zYXZlZFF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBjbG9zZURpYWxvZ0FmdGVyOiBzdGVwLmNsb3NlRGlhbG9nQWZ0ZXIsXG4gICAgICAgICAgICAgICAgICAgIGNvbWJvU2VsZWN0TW9kZTogc3RlcC5jb21ib1NlbGVjdE1vZGUgfHwgJydcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnd2FpdCc6XG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoTnVtYmVyKHN0ZXAuZHVyYXRpb24pIHx8IGdldFRpbWluZ3MoKS5ERUZBVUxUX1dBSVRfU1RFUF9ERUxBWSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ3dhaXRVbnRpbCc6XG4gICAgICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKFxuICAgICAgICAgICAgICAgICAgICBzdGVwLmNvbnRyb2xOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzdGVwLndhaXRDb25kaXRpb24gfHwgJ3Zpc2libGUnLFxuICAgICAgICAgICAgICAgICAgICBzdGVwLndhaXRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgc3RlcC50aW1lb3V0IHx8IDEwMDAwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnbmF2aWdhdGUnOlxuICAgICAgICAgICAgICAgIGF3YWl0IG5hdmlnYXRlVG9Gb3JtKHN0ZXApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdhY3RpdmF0ZVRhYic6XG4gICAgICAgICAgICAgICAgYXdhaXQgYWN0aXZhdGVUYWIoc3RlcC5jb250cm9sTmFtZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd0YWJOYXZpZ2F0ZSc6XG4gICAgICAgICAgICAgICAgYXdhaXQgYWN0aXZhdGVUYWIoc3RlcC5jb250cm9sTmFtZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdhY3Rpb25QYW5lVGFiJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBhY3RpdmF0ZUFjdGlvblBhbmVUYWIoc3RlcC5jb250cm9sTmFtZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2V4cGFuZFNlY3Rpb24nOlxuICAgICAgICAgICAgICAgIGF3YWl0IGV4cGFuZE9yQ29sbGFwc2VTZWN0aW9uKHN0ZXAuY29udHJvbE5hbWUsICdleHBhbmQnKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnY29sbGFwc2VTZWN0aW9uJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBleHBhbmRPckNvbGxhcHNlU2VjdGlvbihzdGVwLmNvbnRyb2xOYW1lLCAnY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnY2xvc2VEaWFsb2cnOlxuICAgICAgICAgICAgICAgIGF3YWl0IGNsb3NlRGlhbG9nKCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBzdGVwIHR5cGU6ICR7c3RlcC50eXBlfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZFdhaXRBZnRlciAmJiB3YWl0VGFyZ2V0KSB7XG4gICAgICAgICAgICBhd2FpdCB3YWl0VW50aWxDb25kaXRpb24od2FpdFRhcmdldCwgJ2hpZGRlbicsIG51bGwsIDUwMDApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcG9zdEludGVycnVwdGlvbiA9IGF3YWl0IGhhbmRsZVVuZXhwZWN0ZWRFdmVudHMobGVhcm5pbmdNb2RlKTtcbiAgICAgICAgaWYgKHBvc3RJbnRlcnJ1cHRpb24/LnNpZ25hbCAmJiBwb3N0SW50ZXJydXB0aW9uLnNpZ25hbCAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gcG9zdEludGVycnVwdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBEb25lJywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XG4gICAgICAgIH0sICcqJyk7XG4gICAgICAgIGNvbnN0IHBlbmRpbmdTaWduYWwgPSBjb25zdW1lUGVuZGluZ0Zsb3dTaWduYWwoKTtcbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiBwZW5kaW5nU2lnbmFsIH07XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIC8vIFJlLXRocm93IG5hdmlnYXRpb24gaW50ZXJydXB0cyBmb3IgdXBzdHJlYW0gaGFuZGxpbmdcbiAgICAgICAgaWYgKGVyciAmJiBlcnIuaXNOYXZpZ2F0aW9uSW50ZXJydXB0KSB0aHJvdyBlcnI7XG5cbiAgICAgICAgLy8gTGVhcm5pbmctbW9kZSByZWNvdmVyeSBwYXRoOiBpZiBhIGRpYWxvZy9tZXNzYWdlIGFwcGVhcmVkIGR1cmluZyB0aGUgc3RlcCxcbiAgICAgICAgLy8gaGFuZGxlIGl0IGZpcnN0LCB0aGVuIHJlLWNoZWNrIHBvc3QtYWN0aW9uIHdhaXQgY29uZGl0aW9uIG9uY2UuXG4gICAgICAgIGlmIChsZWFybmluZ01vZGUgJiYgIWVycj8uaXNVc2VyU3RvcCkge1xuICAgICAgICAgICAgY29uc3QgcGVuZGluZyA9IGRldGVjdFVuZXhwZWN0ZWRFdmVudHMoKTtcbiAgICAgICAgICAgIGlmIChwZW5kaW5nLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTGVhcm5pbmcgbW9kZTogaW50ZXJydXB0aW9uIGRldGVjdGVkIGR1cmluZyBzdGVwICR7YWJzb2x1dGVTdGVwSW5kZXggKyAxfS4gQXNraW5nIGZvciBoYW5kbGluZy4uLmApO1xuICAgICAgICAgICAgICAgIGF3YWl0IGhhbmRsZVVuZXhwZWN0ZWRFdmVudHModHJ1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHNob3VsZFdhaXRBZnRlciAmJiB3YWl0VGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0VW50aWxDb25kaXRpb24od2FpdFRhcmdldCwgJ2hpZGRlbicsIG51bGwsIDI1MDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwRG9uZScsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBlbmRpbmdTaWduYWwgPSBjb25zdW1lUGVuZGluZ0Zsb3dTaWduYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogcGVuZGluZ1NpZ25hbCB9O1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYExlYXJuaW5nIG1vZGUgb3ZlcnJpZGU6IGNvbnRpbnVpbmcgZXZlbiB0aG91Z2ggXCIke3dhaXRUYXJnZXR9XCIgaXMgc3RpbGwgdmlzaWJsZSBhZnRlciBpbnRlcnJ1cHRpb24gaGFuZGxpbmcuYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBEb25lJywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAnKicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGVuZGluZ1NpZ25hbCA9IGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiBwZW5kaW5nU2lnbmFsIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBFcnJvciBleGVjdXRpbmcgc3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX06ICR7ZXJyPy5tZXNzYWdlIHx8IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB0aHJvdyBlcnI7XG4gICAgfVxufVxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVN0ZXBzV2l0aExvb3BzKHN0ZXBzLCBwcmltYXJ5RGF0YSwgZGV0YWlsU291cmNlcywgcmVsYXRpb25zaGlwcywgc2V0dGluZ3MpIHtcbiAgICAvLyBBcHBseSBza2lwL2xpbWl0IHJvd3MgZnJvbSBydW4gb3B0aW9uc1xuICAgIGNvbnN0IHsgc2tpcFJvd3MgPSAwLCBsaW1pdFJvd3MgPSAwLCBkcnlSdW4gPSBmYWxzZSwgbGVhcm5pbmdNb2RlID0gZmFsc2UgfSA9IGV4ZWN1dGlvbkNvbnRyb2wucnVuT3B0aW9ucztcbiAgICBcbiAgICBjb25zdCBvcmlnaW5hbFRvdGFsUm93cyA9IHByaW1hcnlEYXRhLmxlbmd0aDtcbiAgICBsZXQgc3RhcnRSb3dOdW1iZXIgPSAwOyAvLyBUaGUgc3RhcnRpbmcgcm93IG51bWJlciBmb3IgZGlzcGxheVxuICAgIFxuICAgIGlmIChza2lwUm93cyA+IDApIHtcbiAgICAgICAgcHJpbWFyeURhdGEgPSBwcmltYXJ5RGF0YS5zbGljZShza2lwUm93cyk7XG4gICAgICAgIHN0YXJ0Um93TnVtYmVyID0gc2tpcFJvd3M7XG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgU2tpcHBlZCBmaXJzdCAke3NraXBSb3dzfSByb3dzYCk7XG4gICAgfVxuICAgIFxuICAgIGlmIChsaW1pdFJvd3MgPiAwICYmIHByaW1hcnlEYXRhLmxlbmd0aCA+IGxpbWl0Um93cykge1xuICAgICAgICBwcmltYXJ5RGF0YSA9IHByaW1hcnlEYXRhLnNsaWNlKDAsIGxpbWl0Um93cyk7XG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgTGltaXRlZCB0byAke2xpbWl0Um93c30gcm93c2ApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCB0b3RhbFJvd3NUb1Byb2Nlc3MgPSBwcmltYXJ5RGF0YS5sZW5ndGg7XG4gICAgZXhlY3V0aW9uQ29udHJvbC50b3RhbFJvd3MgPSBvcmlnaW5hbFRvdGFsUm93cztcbiAgICBcbiAgICAvLyBGaW5kIGxvb3Agc3RydWN0dXJlc1xuICAgIGNvbnN0IGxvb3BQYWlycyA9IGZpbmRMb29wUGFpcnMoc3RlcHMsIChtZXNzYWdlKSA9PiBzZW5kTG9nKCdlcnJvcicsIG1lc3NhZ2UpKTtcbiAgICBjb25zdCBpZlBhaXJzID0gZmluZElmUGFpcnMoc3RlcHMsIChtZXNzYWdlKSA9PiBzZW5kTG9nKCdlcnJvcicsIG1lc3NhZ2UpKTtcbiAgICBjb25zdCBsYWJlbE1hcCA9IG5ldyBNYXAoKTtcbiAgICBzdGVwcy5mb3JFYWNoKChzdGVwLCBpbmRleCkgPT4ge1xuICAgICAgICBpZiAoc3RlcD8udHlwZSA9PT0gJ2xhYmVsJyAmJiBzdGVwLmxhYmVsTmFtZSkge1xuICAgICAgICAgICAgbGFiZWxNYXAuc2V0KHN0ZXAubGFiZWxOYW1lLCBpbmRleCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIElmIG5vIGxvb3BzLCBleGVjdXRlIGFsbCBzdGVwcyBmb3IgZWFjaCBwcmltYXJ5IGRhdGEgcm93IChsZWdhY3kgYmVoYXZpb3IpXG4gICAgaWYgKGxvb3BQYWlycy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgZm9yIChsZXQgcm93SW5kZXggPSAwOyByb3dJbmRleCA8IHByaW1hcnlEYXRhLmxlbmd0aDsgcm93SW5kZXgrKykge1xuICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXG5cbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IHByaW1hcnlEYXRhW3Jvd0luZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlSb3dOdW1iZXIgPSBzdGFydFJvd051bWJlciArIHJvd0luZGV4OyAvLyBBY3R1YWwgcm93IG51bWJlciBpbiBvcmlnaW5hbCBkYXRhXG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnRSb3dJbmRleCA9IGRpc3BsYXlSb3dOdW1iZXI7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLnByb2Nlc3NlZFJvd3MgPSByb3dJbmRleCArIDE7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnREYXRhUm93ID0gcm93O1xuXG4gICAgICAgICAgICBjb25zdCByb3dQcm9ncmVzcyA9IHtcbiAgICAgICAgICAgICAgICBwaGFzZTogJ3Jvd1N0YXJ0JyxcbiAgICAgICAgICAgICAgICByb3c6IGRpc3BsYXlSb3dOdW1iZXIsXG4gICAgICAgICAgICAgICAgdG90YWxSb3dzOiBvcmlnaW5hbFRvdGFsUm93cyxcbiAgICAgICAgICAgICAgICBwcm9jZXNzZWRSb3dzOiByb3dJbmRleCArIDEsXG4gICAgICAgICAgICAgICAgdG90YWxUb1Byb2Nlc3M6IHRvdGFsUm93c1RvUHJvY2VzcyxcbiAgICAgICAgICAgICAgICBzdGVwOiAnUHJvY2Vzc2luZyByb3cnXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBQcm9jZXNzaW5nIHJvdyAke2Rpc3BsYXlSb3dOdW1iZXIgKyAxfS8ke29yaWdpbmFsVG90YWxSb3dzfWApO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogcm93UHJvZ3Jlc3MgfSwgJyonKTtcblxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKDAsIHN0ZXBzLmxlbmd0aCwgcm93KTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdyZXBlYXQtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xvb3AgY29udHJvbCBzaWduYWwgdXNlZCBvdXRzaWRlIG9mIGEgbG9vcCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBsb29wUGFpck1hcCA9IG5ldyBNYXAobG9vcFBhaXJzLm1hcChwYWlyID0+IFtwYWlyLnN0YXJ0SW5kZXgsIHBhaXIuZW5kSW5kZXhdKSk7XG4gICAgY29uc3QgaW5pdGlhbERhdGFSb3cgPSBwcmltYXJ5RGF0YVswXSB8fCB7fTtcblxuICAgIGNvbnN0IHJlc29sdmVMb29wRGF0YSA9IChsb29wRGF0YVNvdXJjZSwgY3VycmVudERhdGFSb3cpID0+IHtcbiAgICAgICAgbGV0IGxvb3BEYXRhID0gcHJpbWFyeURhdGE7XG5cbiAgICAgICAgaWYgKGxvb3BEYXRhU291cmNlICE9PSAncHJpbWFyeScgJiYgZGV0YWlsU291cmNlc1tsb29wRGF0YVNvdXJjZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGRldGFpbFNvdXJjZSA9IGRldGFpbFNvdXJjZXNbbG9vcERhdGFTb3VyY2VdO1xuICAgICAgICAgICAgY29uc3QgcmVsYXRpb25zRm9yRGV0YWlsID0gKHJlbGF0aW9uc2hpcHMgfHwgW10pLmZpbHRlcihyID0+IHIuZGV0YWlsSWQgPT09IGxvb3BEYXRhU291cmNlKTtcbiAgICAgICAgICAgIGlmICghcmVsYXRpb25zRm9yRGV0YWlsLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gZGV0YWlsU291cmNlLmRhdGE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvb3BEYXRhO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBsb29wU3RhY2sgPSBBcnJheS5pc0FycmF5KGN1cnJlbnREYXRhUm93Py5fX2QzNjVfbG9vcF9zdGFjaylcbiAgICAgICAgICAgICAgICA/IGN1cnJlbnREYXRhUm93Ll9fZDM2NV9sb29wX3N0YWNrXG4gICAgICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudExvb3BTb3VyY2VJZCA9IGxvb3BTdGFjay5sZW5ndGggPyBsb29wU3RhY2tbbG9vcFN0YWNrLmxlbmd0aCAtIDFdIDogJyc7XG4gICAgICAgICAgICBpZiAoIXBhcmVudExvb3BTb3VyY2VJZCkge1xuICAgICAgICAgICAgICAgIC8vIFRvcC1sZXZlbCBsb29wOiBkbyBub3QgYXBwbHkgcmVsYXRpb25zaGlwIGZpbHRlcmluZy5cbiAgICAgICAgICAgICAgICBsb29wRGF0YSA9IGRldGFpbFNvdXJjZS5kYXRhO1xuICAgICAgICAgICAgICAgIHJldHVybiBsb29wRGF0YTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcGFyZW50U2NvcGVkUmVsYXRpb25zID0gcmVsYXRpb25zRm9yRGV0YWlsLmZpbHRlcihyZWwgPT4gKHJlbC5wYXJlbnRTb3VyY2VJZCB8fCAnJykgPT09IHBhcmVudExvb3BTb3VyY2VJZCk7XG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVSZWxhdGlvbnMgPSBwYXJlbnRTY29wZWRSZWxhdGlvbnMubGVuZ3RoID8gcGFyZW50U2NvcGVkUmVsYXRpb25zIDogcmVsYXRpb25zRm9yRGV0YWlsO1xuXG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUGFyZW50VmFsdWUgPSAocmVsLCBwYWlyKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhwbGljaXRLZXkgPSByZWw/LnBhcmVudFNvdXJjZUlkID8gYCR7cmVsLnBhcmVudFNvdXJjZUlkfToke3BhaXIucHJpbWFyeUZpZWxkfWAgOiAnJztcbiAgICAgICAgICAgICAgICBpZiAoZXhwbGljaXRLZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwbGljaXRWYWx1ZSA9IGN1cnJlbnREYXRhUm93Py5bZXhwbGljaXRLZXldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXhwbGljaXRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIGV4cGxpY2l0VmFsdWUgIT09IG51bGwgJiYgU3RyaW5nKGV4cGxpY2l0VmFsdWUpICE9PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4cGxpY2l0VmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgZmFsbGJhY2tWYWx1ZSA9IGN1cnJlbnREYXRhUm93Py5bcGFpci5wcmltYXJ5RmllbGRdO1xuICAgICAgICAgICAgICAgIGlmIChmYWxsYmFja1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgZmFsbGJhY2tWYWx1ZSAhPT0gbnVsbCAmJiBTdHJpbmcoZmFsbGJhY2tWYWx1ZSkgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxsYmFja1ZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRSZWxhdGlvbiA9IGNhbmRpZGF0ZVJlbGF0aW9ucy5maW5kKChyZWwpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWVsZE1hcHBpbmdzID0gQXJyYXkuaXNBcnJheShyZWw/LmZpZWxkTWFwcGluZ3MpICYmIHJlbC5maWVsZE1hcHBpbmdzLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICA/IHJlbC5maWVsZE1hcHBpbmdzXG4gICAgICAgICAgICAgICAgICAgIDogKHJlbD8ucHJpbWFyeUZpZWxkICYmIHJlbD8uZGV0YWlsRmllbGRcbiAgICAgICAgICAgICAgICAgICAgICAgID8gW3sgcHJpbWFyeUZpZWxkOiByZWwucHJpbWFyeUZpZWxkLCBkZXRhaWxGaWVsZDogcmVsLmRldGFpbEZpZWxkIH1dXG4gICAgICAgICAgICAgICAgICAgIDogW10pO1xuICAgICAgICAgICAgICAgIGlmICghZmllbGRNYXBwaW5ncy5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmllbGRNYXBwaW5ncy5ldmVyeSgocGFpcikgPT4gcmVzb2x2ZVBhcmVudFZhbHVlKHJlbCwgcGFpcikgIT09IHVuZGVmaW5lZCk7XG4gICAgICAgICAgICB9KSB8fCBudWxsO1xuXG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkUmVsYXRpb24pIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFJlbGF0aW9uc2hpcCBmaWx0ZXIgZm9yICR7bG9vcERhdGFTb3VyY2V9IGNvdWxkIG5vdCByZXNvbHZlIHBhcmVudCB2YWx1ZXMuIExvb3Agd2lsbCBwcm9jZXNzIDAgcm93cy5gKTtcbiAgICAgICAgICAgICAgICBsb29wRGF0YSA9IFtdO1xuICAgICAgICAgICAgICAgIHJldHVybiBsb29wRGF0YTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRNYXBwaW5ncyA9IEFycmF5LmlzQXJyYXkoc2VsZWN0ZWRSZWxhdGlvbi5maWVsZE1hcHBpbmdzKSAmJiBzZWxlY3RlZFJlbGF0aW9uLmZpZWxkTWFwcGluZ3MubGVuZ3RoXG4gICAgICAgICAgICAgICAgPyBzZWxlY3RlZFJlbGF0aW9uLmZpZWxkTWFwcGluZ3NcbiAgICAgICAgICAgICAgICA6IFt7IHByaW1hcnlGaWVsZDogc2VsZWN0ZWRSZWxhdGlvbi5wcmltYXJ5RmllbGQsIGRldGFpbEZpZWxkOiBzZWxlY3RlZFJlbGF0aW9uLmRldGFpbEZpZWxkIH1dO1xuXG4gICAgICAgICAgICBsb29wRGF0YSA9IGRldGFpbFNvdXJjZS5kYXRhLmZpbHRlcigoZGV0YWlsUm93KSA9PiBzZWxlY3RlZE1hcHBpbmdzLmV2ZXJ5KChwYWlyKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50VmFsdWUgPSByZXNvbHZlUGFyZW50VmFsdWUoc2VsZWN0ZWRSZWxhdGlvbiwgcGFpcik7XG4gICAgICAgICAgICAgICAgY29uc3QgY2hpbGRWYWx1ZSA9IGRldGFpbFJvdz8uW3BhaXIuZGV0YWlsRmllbGRdO1xuICAgICAgICAgICAgICAgIGlmIChwYXJlbnRWYWx1ZSA9PT0gdW5kZWZpbmVkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKGNoaWxkVmFsdWUgPT09IHVuZGVmaW5lZCB8fCBjaGlsZFZhbHVlID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFN0cmluZyhjaGlsZFZhbHVlKSA9PT0gU3RyaW5nKHBhcmVudFZhbHVlKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsb29wRGF0YTtcbiAgICB9O1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVN0ZXBXaXRoSGFuZGxpbmcoc3RlcCwgc3RlcEluZGV4LCBjdXJyZW50RGF0YVJvdykge1xuICAgICAgICBjb25zdCB7IG1vZGUsIHJldHJ5Q291bnQsIHJldHJ5RGVsYXksIGdvdG9MYWJlbCB9ID0gZ2V0U3RlcEVycm9yQ29uZmlnKHN0ZXAsIHNldHRpbmdzKTtcbiAgICAgICAgbGV0IGF0dGVtcHQgPSAwO1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0ZXBSZXN1bHQgPSBhd2FpdCBleGVjdXRlU2luZ2xlU3RlcChzdGVwLCBzdGVwSW5kZXgsIGN1cnJlbnREYXRhUm93LCBkZXRhaWxTb3VyY2VzLCBzZXR0aW5ncywgZHJ5UnVuLCBsZWFybmluZ01vZGUpO1xuICAgICAgICAgICAgICAgIGlmIChzdGVwUmVzdWx0Py5zaWduYWwgJiYgc3RlcFJlc3VsdC5zaWduYWwgIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdW1lUGVuZGluZ0Zsb3dTaWduYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiBzdGVwUmVzdWx0LnNpZ25hbCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwZW5kaW5nU2lnbmFsID0gY29uc3VtZVBlbmRpbmdGbG93U2lnbmFsKCk7XG4gICAgICAgICAgICAgICAgaWYgKHBlbmRpbmdTaWduYWwgIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IHBlbmRpbmdTaWduYWwgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgJiYgZXJyLmlzTmF2aWdhdGlvbkludGVycnVwdCkgdGhyb3cgZXJyO1xuICAgICAgICAgICAgICAgIGlmIChlcnIgJiYgKGVyci5pc1VzZXJTdG9wIHx8IGVyci5ub1JldHJ5KSkgdGhyb3cgZXJyO1xuXG4gICAgICAgICAgICAgICAgaWYgKHJldHJ5Q291bnQgPiAwICYmIGF0dGVtcHQgPCByZXRyeUNvdW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dGVtcHQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBSZXRyeWluZyBzdGVwICR7c3RlcEluZGV4ICsgMX0gKCR7YXR0ZW1wdH0vJHtyZXRyeUNvdW50fSkgYWZ0ZXIgZXJyb3I6ICR7ZXJyPy5tZXNzYWdlIHx8IFN0cmluZyhlcnIpfWApO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmV0cnlEZWxheSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKHJldHJ5RGVsYXkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHN3aXRjaCAobW9kZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdza2lwJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ3NraXAnIH07XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2dvdG8nOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnZ290bycsIGxhYmVsOiBnb3RvTGFiZWwgfTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnYnJlYWstbG9vcCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdicmVhay1sb29wJyB9O1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdjb250aW51ZS1sb29wJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2NvbnRpbnVlLWxvb3AnIH07XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3JlcGVhdC1sb29wJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ3JlcGVhdC1sb29wJyB9O1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdmYWlsJzpcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBleGVjdXRlUmFuZ2Uoc3RhcnRJZHgsIGVuZElkeCwgY3VycmVudERhdGFSb3cpIHtcbiAgICAgICAgaWYgKGN1cnJlbnREYXRhUm93KSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnREYXRhUm93ID0gY3VycmVudERhdGFSb3c7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGlkeCA9IHN0YXJ0SWR4O1xuXG4gICAgICAgIHdoaWxlIChpZHggPCBlbmRJZHgpIHtcbiAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxuXG4gICAgICAgICAgICBjb25zdCBzdGVwID0gc3RlcHNbaWR4XTtcblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2xhYmVsJykge1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnZ290bycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRJbmRleCA9IGxhYmVsTWFwLmdldChzdGVwLmdvdG9MYWJlbCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldEluZGV4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHb3RvIGxhYmVsIG5vdCBmb3VuZDogJHtzdGVwLmdvdG9MYWJlbCB8fCAnJ31gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldEluZGV4IDwgc3RhcnRJZHggfHwgdGFyZ2V0SW5kZXggPj0gZW5kSWR4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2dvdG8nLCB0YXJnZXRJbmRleCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZHggPSB0YXJnZXRJbmRleDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2lmLXN0YXJ0Jykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbmRpdGlvbk1ldCA9IGV2YWx1YXRlQ29uZGl0aW9uKHN0ZXAsIGN1cnJlbnREYXRhUm93LCB7XG4gICAgICAgICAgICAgICAgICAgIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0LFxuICAgICAgICAgICAgICAgICAgICBpc0VsZW1lbnRWaXNpYmxlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5kSW5kZXggPSBpZlBhaXJzLmlmVG9FbmQuZ2V0KGlkeCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZWxzZUluZGV4ID0gaWZQYWlycy5pZlRvRWxzZS5nZXQoaWR4KTtcbiAgICAgICAgICAgICAgICBpZiAoZW5kSW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYElmLXN0YXJ0IGF0IGluZGV4ICR7aWR4fSBoYXMgbm8gbWF0Y2hpbmcgaWYtZW5kYCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbk1ldCkge1xuICAgICAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGVsc2VJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGVsc2VJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZW5kSW5kZXggKyAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2Vsc2UnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5kSW5kZXggPSBpZlBhaXJzLmVsc2VUb0VuZC5nZXQoaWR4KTtcbiAgICAgICAgICAgICAgICBpZiAoZW5kSW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBpZHggPSBlbmRJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnaWYtZW5kJykge1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnY29udGludWUtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdjb250aW51ZS1sb29wJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAncmVwZWF0LWxvb3AnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdicmVhay1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2JyZWFrLWxvb3AnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BFbmRJZHggPSBsb29wUGFpck1hcC5nZXQoaWR4KTtcbiAgICAgICAgICAgICAgICBpZiAobG9vcEVuZElkeCA9PT0gdW5kZWZpbmVkIHx8IGxvb3BFbmRJZHggPD0gaWR4KSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTG9vcCBzdGFydCBhdCBpbmRleCAke2lkeH0gaGFzIG5vIG1hdGNoaW5nIGVuZGApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BNb2RlID0gc3RlcC5sb29wTW9kZSB8fCAnZGF0YSc7XG5cbiAgICAgICAgICAgICAgICBpZiAobG9vcE1vZGUgPT09ICdjb3VudCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9vcENvdW50ID0gTnVtYmVyKHN0ZXAubG9vcENvdW50KSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBleGVjdXRpb25Db250cm9sLnRvdGFsUm93cyA9IGxvb3BDb3VudDtcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBFbnRlcmluZyBsb29wOiAke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfSAoY291bnQ9JHtsb29wQ291bnR9KWApO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpdGVySW5kZXggPSAwOyBpdGVySW5kZXggPCBsb29wQ291bnQ7IGl0ZXJJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucHJvY2Vzc2VkUm93cyA9IGl0ZXJJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ2xvb3BJdGVyYXRpb24nLCBpdGVyYXRpb246IGl0ZXJJbmRleCArIDEsIHRvdGFsOiBsb29wQ291bnQsIHN0ZXA6IGBMb29wIFwiJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31cIjogaXRlcmF0aW9uICR7aXRlckluZGV4ICsgMX0vJHtsb29wQ291bnR9YCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAnKicpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgY3VycmVudERhdGFSb3cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlckluZGV4ID0gTWF0aC5tYXgoLTEsIGl0ZXJJbmRleCAtIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZHggPSBsb29wRW5kSWR4ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGxvb3BNb2RlID09PSAnd2hpbGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1heEl0ZXJhdGlvbnMgPSBOdW1iZXIoc3RlcC5sb29wTWF4SXRlcmF0aW9ucykgfHwgMTAwO1xuICAgICAgICAgICAgICAgICAgICBsZXQgaXRlckluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgd2hpbGUgKGl0ZXJJbmRleCA8IG1heEl0ZXJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFldmFsdWF0ZUNvbmRpdGlvbihzdGVwLCBjdXJyZW50RGF0YVJvdywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzRWxlbWVudFZpc2libGVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKSBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdsb29wSXRlcmF0aW9uJywgaXRlcmF0aW9uOiBpdGVySW5kZXggKyAxLCB0b3RhbDogbWF4SXRlcmF0aW9ucywgc3RlcDogYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiOiBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke21heEl0ZXJhdGlvbnN9YCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAnKicpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgY3VycmVudERhdGFSb3cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcpIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVySW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ3JlcGVhdC1sb29wJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHJldHVybiByZXN1bHQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJJbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZXJJbmRleCA+PSBtYXhJdGVyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiIGhpdCBtYXggaXRlcmF0aW9ucyAoJHttYXhJdGVyYXRpb25zfSlgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGxvb3BFbmRJZHggKyAxO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBsb29wRGF0YVNvdXJjZSA9IHN0ZXAubG9vcERhdGFTb3VyY2UgfHwgJ3ByaW1hcnknO1xuICAgICAgICAgICAgICAgIGxldCBsb29wRGF0YSA9IHJlc29sdmVMb29wRGF0YShsb29wRGF0YVNvdXJjZSwgY3VycmVudERhdGFSb3cpO1xuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgaXRlcmF0aW9uIGxpbWl0XG4gICAgICAgICAgICAgICAgY29uc3QgaXRlcmF0aW9uTGltaXQgPSBzdGVwLml0ZXJhdGlvbkxpbWl0IHx8IDA7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZXJhdGlvbkxpbWl0ID4gMCAmJiBsb29wRGF0YS5sZW5ndGggPiBpdGVyYXRpb25MaW1pdCkge1xuICAgICAgICAgICAgICAgICAgICBsb29wRGF0YSA9IGxvb3BEYXRhLnNsaWNlKDAsIGl0ZXJhdGlvbkxpbWl0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYEVudGVyaW5nIGxvb3A6ICR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9IChzb3VyY2U9JHtsb29wRGF0YVNvdXJjZX0pIC0gJHtsb29wRGF0YS5sZW5ndGh9IGl0ZXJhdGlvbnNgKTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpdGVySW5kZXggPSAwOyBpdGVySW5kZXggPCBsb29wRGF0YS5sZW5ndGg7IGl0ZXJJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZXJTb3VyY2VSb3cgPSBsb29wRGF0YVtpdGVySW5kZXhdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVyUm93ID0geyAuLi5jdXJyZW50RGF0YVJvdywgLi4uaXRlclNvdXJjZVJvdyB9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRTdGFjayA9IEFycmF5LmlzQXJyYXkoY3VycmVudERhdGFSb3c/Ll9fZDM2NV9sb29wX3N0YWNrKVxuICAgICAgICAgICAgICAgICAgICAgICAgPyBjdXJyZW50RGF0YVJvdy5fX2QzNjVfbG9vcF9zdGFja1xuICAgICAgICAgICAgICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgICAgICAgICAgICAgaXRlclJvdy5fX2QzNjVfbG9vcF9zdGFjayA9IFsuLi5wYXJlbnRTdGFjaywgbG9vcERhdGFTb3VyY2VdO1xuICAgICAgICAgICAgICAgICAgICBpZiAobG9vcERhdGFTb3VyY2UgIT09ICdwcmltYXJ5Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmVudHJpZXMoaXRlclNvdXJjZVJvdykuZm9yRWFjaCgoW2ZpZWxkLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVyUm93W2Ake2xvb3BEYXRhU291cmNlfToke2ZpZWxkfWBdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc1ByaW1hcnlMb29wID0gbG9vcERhdGFTb3VyY2UgPT09ICdwcmltYXJ5JztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG90YWxSb3dzRm9yTG9vcCA9IGlzUHJpbWFyeUxvb3AgPyBvcmlnaW5hbFRvdGFsUm93cyA6IGxvb3BEYXRhLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG90YWxUb1Byb2Nlc3NGb3JMb29wID0gbG9vcERhdGEubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGF5Um93TnVtYmVyID0gaXNQcmltYXJ5TG9vcCA/IHN0YXJ0Um93TnVtYmVyICsgaXRlckluZGV4IDogaXRlckluZGV4O1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BSb3dQcm9ncmVzcyA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBoYXNlOiAncm93U3RhcnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcm93OiBkaXNwbGF5Um93TnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxSb3dzOiB0b3RhbFJvd3NGb3JMb29wLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkUm93czogaXRlckluZGV4ICsgMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsVG9Qcm9jZXNzOiB0b3RhbFRvUHJvY2Vzc0Zvckxvb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGVwOiAnUHJvY2Vzc2luZyByb3cnXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgTG9vcCBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke2xvb3BEYXRhLmxlbmd0aH0gZm9yIGxvb3AgJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31gKTtcbiAgICAgICAgICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wcm9jZXNzZWRSb3dzID0gaXRlckluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogbG9vcFJvd1Byb2dyZXNzIH0sICcqJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLCBwcm9ncmVzczogeyBwaGFzZTogJ2xvb3BJdGVyYXRpb24nLCBpdGVyYXRpb246IGl0ZXJJbmRleCArIDEsIHRvdGFsOiBsb29wRGF0YS5sZW5ndGgsIHN0ZXA6IGBMb29wIFwiJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ31cIjogaXRlcmF0aW9uICR7aXRlckluZGV4ICsgMX0vJHtsb29wRGF0YS5sZW5ndGh9YCB9IH0sICcqJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRXhlY3V0ZSBzdGVwcyBpbnNpZGUgdGhlIGxvb3AgKHN1cHBvcnRzIG5lc3RlZCBsb29wcylcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKGlkeCArIDEsIGxvb3BFbmRJZHgsIGl0ZXJSb3cpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdicmVhay1sb29wJykgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVySW5kZXggPSBNYXRoLm1heCgtMSwgaXRlckluZGV4IC0gMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdnb3RvJykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZHggPSBsb29wRW5kSWR4ICsgMTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2xvb3AtZW5kJykge1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlU3RlcFdpdGhIYW5kbGluZyhzdGVwLCBpZHgsIGN1cnJlbnREYXRhUm93KTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ3NraXAnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2dvdG8nKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0SW5kZXggPSBsYWJlbE1hcC5nZXQocmVzdWx0LmxhYmVsKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdvdG8gbGFiZWwgbm90IGZvdW5kOiAke3Jlc3VsdC5sYWJlbCB8fCAnJ31gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldEluZGV4IDwgc3RhcnRJZHggfHwgdGFyZ2V0SW5kZXggPj0gZW5kSWR4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2dvdG8nLCB0YXJnZXRJbmRleCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZHggPSB0YXJnZXRJbmRleDtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdyZXBlYXQtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICB9XG5cbiAgICBjb25zdCBmaW5hbFJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVSYW5nZSgwLCBzdGVwcy5sZW5ndGgsIGluaXRpYWxEYXRhUm93KTtcbiAgICBpZiAoZmluYWxSZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnIHx8IGZpbmFsUmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJyB8fCBmaW5hbFJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9vcCBjb250cm9sIHNpZ25hbCB1c2VkIG91dHNpZGUgb2YgYSBsb29wJyk7XG4gICAgfVxufVxuXG4vLyA9PT09PT0gQWRtaW4gSW5zcGVjdGlvbiBGdW5jdGlvbnMgPT09PT09XG5mdW5jdGlvbiBydW5BZG1pbkluc3BlY3Rpb24oaW5zcGVjdG9yLCBpbnNwZWN0aW9uVHlwZSwgZm9ybU5hbWVQYXJhbSwgZG9jdW1lbnQsIHdpbmRvdykge1xuICAgIHN3aXRjaCAoaW5zcGVjdGlvblR5cGUpIHtcbiAgICAgICAgY2FzZSAnc2NhblBhZ2UnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJFdmVyeXRoaW5nKGRvY3VtZW50LCB3aW5kb3cpO1xuICAgICAgICBjYXNlICdvcGVuRm9ybXMnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJPcGVuRm9ybXMoZG9jdW1lbnQsIHdpbmRvdyk7XG4gICAgICAgIGNhc2UgJ2JhdGNoRGlhbG9nJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyQmF0Y2hEaWFsb2coZG9jdW1lbnQpO1xuICAgICAgICBjYXNlICdyZWN1cnJlbmNlRGlhbG9nJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyUmVjdXJyZW5jZURpYWxvZyhkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2ZpbHRlckRpYWxvZyc6XG4gICAgICAgICAgICByZXR1cm4gYWRtaW5EaXNjb3ZlckZpbHRlckRpYWxvZyhkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2Zvcm1UYWJzJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyVGFicyhkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZVRhYic6XG4gICAgICAgICAgICByZXR1cm4gYWRtaW5EaXNjb3ZlckFjdGl2ZVRhYihkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2FjdGlvblBhbmVUYWJzJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyQWN0aW9uUGFuZVRhYnMoZG9jdW1lbnQpO1xuICAgICAgICBjYXNlICdmb3JtSW5wdXRzJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyRm9ybUlucHV0cyhkb2N1bWVudCwgZm9ybU5hbWVQYXJhbSk7XG4gICAgICAgIGNhc2UgJ2dlbmVyYXRlU3RlcHMnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluR2VuZXJhdGVTdGVwc0ZvclRhYihkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2dyaWRTdGF0ZSc6XG4gICAgICAgICAgICByZXR1cm4gaW5zcGVjdEdyaWRTdGF0ZSgpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGluc3BlY3Rpb24gdHlwZTogJyArIGluc3BlY3Rpb25UeXBlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldE1haW5Gb3JtKGRvY3VtZW50KSB7XG4gICAgY29uc3QgZm9ybXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xuICAgIGxldCBtYWluRm9ybSA9IG51bGw7XG4gICAgZm9ybXMuZm9yRWFjaChmID0+IHtcbiAgICAgICAgY29uc3QgbmFtZSA9IGYuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcbiAgICAgICAgaWYgKG5hbWUgIT09ICdEZWZhdWx0RGFzaGJvYXJkJyAmJiBmLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgbWFpbkZvcm0gPSBmO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG1haW5Gb3JtO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyT3BlbkZvcm1zKGRvY3VtZW50LCB3aW5kb3cpIHtcbiAgICBjb25zdCByZXN1bHRzID0ge1xuICAgICAgICBjdXJyZW50VXJsOiB7XG4gICAgICAgICAgICBmdWxsOiB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgICAgICAgIG1lbnVJdGVtOiBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldCgnbWknKSxcbiAgICAgICAgICAgIGNvbXBhbnk6IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdjbXAnKVxuICAgICAgICB9LFxuICAgICAgICBmb3JtczogW10sXG4gICAgICAgIGRpYWxvZ1N0YWNrOiBbXVxuICAgIH07XG5cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBjb25zdCBmb3JtTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XG4gICAgICAgIGNvbnN0IGlzRGlhbG9nID0gZWwuY2xvc2VzdCgnLmRpYWxvZy1jb250YWluZXInKSAhPT0gbnVsbCB8fFxuICAgICAgICAgICAgZm9ybU5hbWUuaW5jbHVkZXMoJ0RpYWxvZycpIHx8IGZvcm1OYW1lLmluY2x1ZGVzKCdGb3JtJykgfHxcbiAgICAgICAgICAgIGZvcm1OYW1lID09PSAnU3lzUmVjdXJyZW5jZScgfHwgZm9ybU5hbWUgPT09ICdTeXNRdWVyeUZvcm0nO1xuICAgICAgICBjb25zdCBpc1Zpc2libGUgPSBlbC5vZmZzZXRQYXJlbnQgIT09IG51bGw7XG5cbiAgICAgICAgcmVzdWx0cy5mb3Jtcy5wdXNoKHsgZm9ybU5hbWUsIGlzRGlhbG9nLCBpc1Zpc2libGUgfSk7XG4gICAgICAgIGlmIChpc0RpYWxvZyAmJiBpc1Zpc2libGUpIHtcbiAgICAgICAgICAgIHJlc3VsdHMuZGlhbG9nU3RhY2sucHVzaChmb3JtTmFtZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXN1bHRzLmRpYWxvZ1N0YWNrLnJldmVyc2UoKTtcbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3ZlckJhdGNoRGlhbG9nKGRvY3VtZW50KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IHtcbiAgICAgICAgZGlhbG9nRm91bmQ6IGZhbHNlLCBmb3JtTmFtZTogbnVsbCxcbiAgICAgICAgYWxsQ29udHJvbHM6IFtdLCBpbnB1dEZpZWxkczogW10sIGNoZWNrYm94ZXM6IFtdLCBjb21ib2JveGVzOiBbXSwgYnV0dG9uczogW10sIGdyb3VwczogW10sIHRvZ2dsZXM6IFtdXG4gICAgfTtcblxuICAgIGNvbnN0IGRpYWxvZ0Zvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdJykgfHxcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZSo9XCJEaWFsb2dcIl0nKSB8fFxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuZGlhbG9nLWNvbnRlbnQgW2RhdGEtZHluLWZvcm0tbmFtZV0nKTtcblxuICAgIGlmICghZGlhbG9nRm9ybSkgcmV0dXJuIHJlc3VsdHM7XG5cbiAgICByZXN1bHRzLmRpYWxvZ0ZvdW5kID0gdHJ1ZTtcbiAgICByZXN1bHRzLmZvcm1OYW1lID0gZGlhbG9nRm9ybS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xuXG4gICAgZGlhbG9nRm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGNvbnN0IGluZm8gPSB7XG4gICAgICAgICAgICBjb250cm9sTmFtZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpLFxuICAgICAgICAgICAgcm9sZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXG4gICAgICAgICAgICBjb250cm9sVHlwZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sdHlwZScpLFxuICAgICAgICAgICAgbGFiZWw6IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKCkgfHwgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgZWwuZ2V0QXR0cmlidXRlKCd0aXRsZScpXG4gICAgICAgIH07XG4gICAgICAgIHJlc3VsdHMuYWxsQ29udHJvbHMucHVzaChpbmZvKTtcbiAgICAgICAgY29uc3Qgcm9sZSA9IChpbmZvLnJvbGUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChyb2xlLmluY2x1ZGVzKCdpbnB1dCcpIHx8IHJvbGUgPT09ICdzdHJpbmcnIHx8IHJvbGUgPT09ICdpbnRlZ2VyJyB8fCByb2xlID09PSAncmVhbCcpIHJlc3VsdHMuaW5wdXRGaWVsZHMucHVzaChpbmZvKTtcbiAgICAgICAgZWxzZSBpZiAocm9sZS5pbmNsdWRlcygnY2hlY2tib3gnKSB8fCByb2xlID09PSAneWVzbm8nKSByZXN1bHRzLmNoZWNrYm94ZXMucHVzaChpbmZvKTtcbiAgICAgICAgZWxzZSBpZiAocm9sZS5pbmNsdWRlcygnY29tYm9ib3gnKSB8fCByb2xlID09PSAnZHJvcGRvd24nKSByZXN1bHRzLmNvbWJvYm94ZXMucHVzaChpbmZvKTtcbiAgICAgICAgZWxzZSBpZiAocm9sZS5pbmNsdWRlcygnYnV0dG9uJykpIHJlc3VsdHMuYnV0dG9ucy5wdXNoKGluZm8pO1xuICAgICAgICBlbHNlIGlmIChyb2xlID09PSAnZ3JvdXAnKSByZXN1bHRzLmdyb3Vwcy5wdXNoKGluZm8pO1xuICAgIH0pO1xuXG4gICAgZGlhbG9nRm9ybS5xdWVyeVNlbGVjdG9yQWxsKCcudG9nZ2xlLCBbcm9sZT1cInN3aXRjaFwiXSwgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcbiAgICAgICAgaWYgKGNvbnRhaW5lcikge1xuICAgICAgICAgICAgcmVzdWx0cy50b2dnbGVzLnB1c2goe1xuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpLFxuICAgICAgICAgICAgICAgIHJvbGU6IGNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSxcbiAgICAgICAgICAgICAgICBsYWJlbDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKCksXG4gICAgICAgICAgICAgICAgaXNDaGVja2VkOiBlbC5jaGVja2VkIHx8IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJykgPT09ICd0cnVlJ1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3ZlclJlY3VycmVuY2VEaWFsb2coZG9jdW1lbnQpIHtcbiAgICBjb25zdCByZXN1bHRzID0ge1xuICAgICAgICBkaWFsb2dGb3VuZDogZmFsc2UsIGZvcm1OYW1lOiAnU3lzUmVjdXJyZW5jZScsXG4gICAgICAgIHN0YXJ0RGF0ZVRpbWU6IHt9LCBlbmRPcHRpb25zOiB7fSwgcGF0dGVybjoge30sIGJ1dHRvbnM6IFtdLCBhbGxDb250cm9sczogW11cbiAgICB9O1xuICAgIGNvbnN0IGZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUmVjdXJyZW5jZVwiXScpO1xuICAgIGlmICghZm9ybSkgcmV0dXJuIHJlc3VsdHM7XG4gICAgcmVzdWx0cy5kaWFsb2dGb3VuZCA9IHRydWU7XG5cbiAgICBmb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgIGNvbnN0IHJvbGUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuICAgICAgICBjb25zdCBpbmZvID0geyBjb250cm9sTmFtZSwgcm9sZSwgbGFiZWwgfTtcbiAgICAgICAgcmVzdWx0cy5hbGxDb250cm9scy5wdXNoKGluZm8pO1xuXG4gICAgICAgIGNvbnN0IG5hbWVMb3dlciA9IChjb250cm9sTmFtZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgaWYgKG5hbWVMb3dlciA9PT0gJ3N0YXJ0ZGF0ZScpIHJlc3VsdHMuc3RhcnREYXRlVGltZS5zdGFydERhdGUgPSBpbmZvO1xuICAgICAgICBlbHNlIGlmIChuYW1lTG93ZXIgPT09ICdzdGFydHRpbWUnKSByZXN1bHRzLnN0YXJ0RGF0ZVRpbWUuc3RhcnRUaW1lID0gaW5mbztcbiAgICAgICAgZWxzZSBpZiAobmFtZUxvd2VyID09PSAndGltZXpvbmUnKSByZXN1bHRzLnN0YXJ0RGF0ZVRpbWUudGltZXpvbmUgPSBpbmZvO1xuICAgICAgICBlbHNlIGlmIChuYW1lTG93ZXIgPT09ICdlbmRkYXRlaW50JykgcmVzdWx0cy5lbmRPcHRpb25zLmNvdW50ID0gaW5mbztcbiAgICAgICAgZWxzZSBpZiAobmFtZUxvd2VyID09PSAnZW5kZGF0ZWRhdGUnKSByZXN1bHRzLmVuZE9wdGlvbnMuZW5kRGF0ZSA9IGluZm87XG4gICAgICAgIGVsc2UgaWYgKG5hbWVMb3dlciA9PT0gJ3BhdHRlcm51bml0JykgcmVzdWx0cy5wYXR0ZXJuLnVuaXQgPSBpbmZvO1xuICAgICAgICBlbHNlIGlmIChyb2xlID09PSAnQ29tbWFuZEJ1dHRvbicpIHJlc3VsdHMuYnV0dG9ucy5wdXNoKGluZm8pO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyRmlsdGVyRGlhbG9nKGRvY3VtZW50KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IHtcbiAgICAgICAgZGlhbG9nRm91bmQ6IGZhbHNlLCBmb3JtTmFtZTogJ1N5c1F1ZXJ5Rm9ybScsXG4gICAgICAgIHRhYnM6IFtdLCBncmlkSW5mbzoge30sIHNhdmVkUXVlcmllczogbnVsbCwgYnV0dG9uczogW10sIGNoZWNrYm94ZXM6IFtdLCBhbGxDb250cm9sczogW11cbiAgICB9O1xuICAgIGNvbnN0IHF1ZXJ5Rm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNRdWVyeUZvcm1cIl0nKTtcbiAgICBpZiAoIXF1ZXJ5Rm9ybSkgcmV0dXJuIHJlc3VsdHM7XG4gICAgcmVzdWx0cy5kaWFsb2dGb3VuZCA9IHRydWU7XG5cbiAgICBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJQaXZvdEl0ZW1cIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgcmVzdWx0cy50YWJzLnB1c2goe1xuICAgICAgICAgICAgY29udHJvbE5hbWU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSxcbiAgICAgICAgICAgIGxhYmVsOiBlbC50ZXh0Q29udGVudD8udHJpbSgpLnNwbGl0KCdcXG4nKVswXSxcbiAgICAgICAgICAgIGlzVmlzaWJsZTogZWwub2Zmc2V0UGFyZW50ICE9PSBudWxsXG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JpZCA9IHF1ZXJ5Rm9ybS5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZUdyaWRcIl0nKTtcbiAgICBpZiAoZ3JpZCkge1xuICAgICAgICByZXN1bHRzLmdyaWRJbmZvID0geyBjb250cm9sTmFtZTogJ1JhbmdlR3JpZCcsIHJvbGU6IGdyaWQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJykgfTtcbiAgICB9XG5cbiAgICBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgY29uc3Qgcm9sZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xuICAgICAgICBjb25zdCBsYWJlbCA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKCk7XG4gICAgICAgIGNvbnN0IGluZm8gPSB7IGNvbnRyb2xOYW1lLCByb2xlLCBsYWJlbCB9O1xuICAgICAgICByZXN1bHRzLmFsbENvbnRyb2xzLnB1c2goaW5mbyk7XG4gICAgICAgIGlmIChjb250cm9sTmFtZSA9PT0gJ1NhdmVkUXVlcmllc0JveCcpIHJlc3VsdHMuc2F2ZWRRdWVyaWVzID0gaW5mbztcbiAgICAgICAgZWxzZSBpZiAocm9sZSA9PT0gJ0NvbW1hbmRCdXR0b24nIHx8IHJvbGUgPT09ICdCdXR0b24nKSByZXN1bHRzLmJ1dHRvbnMucHVzaChpbmZvKTtcbiAgICAgICAgZWxzZSBpZiAocm9sZSA9PT0gJ0NoZWNrQm94JykgcmVzdWx0cy5jaGVja2JveGVzLnB1c2goaW5mbyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJUYWJzKGRvY3VtZW50KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IHsgZm9ybU5hbWU6IG51bGwsIGFjdGl2ZVRhYjogbnVsbCwgdGFiczogW10gfTtcbiAgICBjb25zdCBtYWluRm9ybSA9IGdldE1haW5Gb3JtKGRvY3VtZW50KTtcbiAgICBpZiAoIW1haW5Gb3JtKSByZXR1cm4gcmVzdWx0cztcbiAgICByZXN1bHRzLmZvcm1OYW1lID0gbWFpbkZvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcblxuICAgIG1haW5Gb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiUGl2b3RJdGVtXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykgfHwgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJztcbiAgICAgICAgY29uc3QgaGVhZGVyRWwgPSBtYWluRm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfV9oZWFkZXJcIl1gKTtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXJFbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fFxuICAgICAgICAgICAgZWwucXVlcnlTZWxlY3RvcignLnBpdm90LWxpbmstdGV4dCcpPy50ZXh0Q29udGVudD8udHJpbSgpIHx8XG4gICAgICAgICAgICBlbC50ZXh0Q29udGVudD8udHJpbSgpLnNwbGl0KCdcXG4nKVswXTtcblxuICAgICAgICByZXN1bHRzLnRhYnMucHVzaCh7IGNvbnRyb2xOYW1lLCBsYWJlbDogKGxhYmVsIHx8ICcnKS5zdWJzdHJpbmcoMCwgNTApLCBpc0FjdGl2ZSB9KTtcbiAgICAgICAgaWYgKGlzQWN0aXZlKSByZXN1bHRzLmFjdGl2ZVRhYiA9IGNvbnRyb2xOYW1lO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyQWN0aXZlVGFiKGRvY3VtZW50KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IHtcbiAgICAgICAgZm9ybU5hbWU6IG51bGwsIGFjdGl2ZVRhYjogbnVsbCwgc2VjdGlvbnM6IFtdLFxuICAgICAgICBmaWVsZHM6IHsgaW5wdXRzOiBbXSwgY2hlY2tib3hlczogW10sIGNvbWJvYm94ZXM6IFtdLCBpbnRlZ2VyczogW10sIGRhdGVzOiBbXSB9LFxuICAgICAgICBzdW1tYXJ5OiB7fVxuICAgIH07XG4gICAgY29uc3QgbWFpbkZvcm0gPSBnZXRNYWluRm9ybShkb2N1bWVudCk7XG4gICAgaWYgKCFtYWluRm9ybSkgcmV0dXJuIHJlc3VsdHM7XG4gICAgcmVzdWx0cy5mb3JtTmFtZSA9IG1haW5Gb3JtLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XG5cbiAgICBjb25zdCBhY3RpdmVUYWJFbCA9IG1haW5Gb3JtLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1yb2xlPVwiUGl2b3RJdGVtXCJdLmFjdGl2ZSwgW2RhdGEtZHluLXJvbGU9XCJQaXZvdEl0ZW1cIl1bYXJpYS1zZWxlY3RlZD1cInRydWVcIl0nKTtcbiAgICBpZiAoYWN0aXZlVGFiRWwpIHJlc3VsdHMuYWN0aXZlVGFiID0gYWN0aXZlVGFiRWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuXG4gICAgbWFpbkZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJUYWJQYWdlXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGlmIChlbC5vZmZzZXRQYXJlbnQgPT09IG51bGwpIHJldHVybjtcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgIGlmICghY29udHJvbE5hbWUgfHwgL15cXGQrJC8udGVzdChjb250cm9sTmFtZSkpIHJldHVybjtcbiAgICAgICAgY29uc3QgaGVhZGVyRWwgPSBlbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdLCAuc2VjdGlvbi1oZWFkZXInKTtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXJFbD8udGV4dENvbnRlbnQ/LnRyaW0oKT8uc3BsaXQoJ1xcbicpWzBdO1xuICAgICAgICBjb25zdCBpc0V4cGFuZGVkID0gIWVsLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJykgJiYgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgIT09ICdmYWxzZSc7XG4gICAgICAgIHJlc3VsdHMuc2VjdGlvbnMucHVzaCh7IGNvbnRyb2xOYW1lLCBsYWJlbDogKGxhYmVsIHx8ICcnKS5zdWJzdHJpbmcoMCwgNTApLCBpc0V4cGFuZGVkIH0pO1xuICAgIH0pO1xuXG4gICAgbWFpbkZvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBpZiAoZWwub2Zmc2V0UGFyZW50ID09PSBudWxsKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICBjb25zdCByb2xlID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcbiAgICAgICAgaWYgKCFyb2xlIHx8ICFjb250cm9sTmFtZSB8fCAvXlxcZCskLy50ZXN0KGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xuICAgICAgICBjb25zdCBpbmZvID0geyBjb250cm9sTmFtZSwgbGFiZWw6IChsYWJlbCB8fCAnJykuc3Vic3RyaW5nKDAsIDQwKSB9O1xuXG4gICAgICAgIHN3aXRjaCAocm9sZSkge1xuICAgICAgICAgICAgY2FzZSAnSW5wdXQnOiBjYXNlICdTdHJpbmcnOiByZXN1bHRzLmZpZWxkcy5pbnB1dHMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdDaGVja0JveCc6IGNhc2UgJ1llc05vJzogcmVzdWx0cy5maWVsZHMuY2hlY2tib3hlcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0NvbWJvQm94JzogY2FzZSAnRHJvcGRvd25MaXN0JzogcmVzdWx0cy5maWVsZHMuY29tYm9ib3hlcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0ludGVnZXInOiBjYXNlICdSZWFsJzogcmVzdWx0cy5maWVsZHMuaW50ZWdlcnMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdEYXRlJzogY2FzZSAnVGltZSc6IHJlc3VsdHMuZmllbGRzLmRhdGVzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXN1bHRzLnN1bW1hcnkgPSB7XG4gICAgICAgIHNlY3Rpb25zOiByZXN1bHRzLnNlY3Rpb25zLmxlbmd0aCxcbiAgICAgICAgaW5wdXRzOiByZXN1bHRzLmZpZWxkcy5pbnB1dHMubGVuZ3RoLFxuICAgICAgICBjaGVja2JveGVzOiByZXN1bHRzLmZpZWxkcy5jaGVja2JveGVzLmxlbmd0aCxcbiAgICAgICAgY29tYm9ib3hlczogcmVzdWx0cy5maWVsZHMuY29tYm9ib3hlcy5sZW5ndGgsXG4gICAgICAgIGludGVnZXJzOiByZXN1bHRzLmZpZWxkcy5pbnRlZ2Vycy5sZW5ndGgsXG4gICAgICAgIGRhdGVzOiByZXN1bHRzLmZpZWxkcy5kYXRlcy5sZW5ndGhcbiAgICB9O1xuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyQWN0aW9uUGFuZVRhYnMoZG9jdW1lbnQpIHtcbiAgICBjb25zdCByZXN1bHRzID0geyBmb3JtTmFtZTogbnVsbCwgYWN0aXZlVGFiOiBudWxsLCB0YWJzOiBbXSB9O1xuICAgIGNvbnN0IG1haW5Gb3JtID0gZ2V0TWFpbkZvcm0oZG9jdW1lbnQpO1xuICAgIGlmIChtYWluRm9ybSkgcmVzdWx0cy5mb3JtTmFtZSA9IG1haW5Gb3JtLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XG5cbiAgICAvLyBNZXRob2QgMTogcm9sZT1cInRhYlwiIG91dHNpZGUgZGlhbG9nc1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwidGFiXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGlmIChlbC5jbG9zZXN0KCcuZGlhbG9nLWNvbnRlbnQsIFtkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNRdWVyeUZvcm1cIl0nKSkgcmV0dXJuO1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBlbC50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgICAgICBpZiAoIWNvbnRyb2xOYW1lICYmICFsYWJlbCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHwgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKTtcbiAgICAgICAgY29uc3QgdGFiSW5mbyA9IHsgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lIHx8IChsYWJlbCB8fCAnJykucmVwbGFjZSgvXFxzKy9nLCAnJyksIGxhYmVsLCBpc0FjdGl2ZSB9O1xuICAgICAgICBpZiAoIXJlc3VsdHMudGFicy5zb21lKHQgPT4gdC5jb250cm9sTmFtZSA9PT0gdGFiSW5mby5jb250cm9sTmFtZSkpIHtcbiAgICAgICAgICAgIHJlc3VsdHMudGFicy5wdXNoKHRhYkluZm8pO1xuICAgICAgICAgICAgaWYgKGlzQWN0aXZlKSByZXN1bHRzLmFjdGl2ZVRhYiA9IHRhYkluZm8uY29udHJvbE5hbWU7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIE1ldGhvZCAyOiB0YWJsaXN0XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJ0YWJsaXN0XCJdJykuZm9yRWFjaCh0YWJsaXN0ID0+IHtcbiAgICAgICAgaWYgKHRhYmxpc3QuY2xvc2VzdCgnLmRpYWxvZy1jb250ZW50JykpIHJldHVybjtcbiAgICAgICAgdGFibGlzdC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cInRhYlwiXSwgYnV0dG9uLCBbZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgZWwudGV4dENvbnRlbnQ/LnRyaW0oKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUgJiYgIWxhYmVsKSByZXR1cm47XG4gICAgICAgICAgICBpZiAocmVzdWx0cy50YWJzLnNvbWUodCA9PiB0LmNvbnRyb2xOYW1lID09PSAoY29udHJvbE5hbWUgfHwgbGFiZWwpKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgaXNBY3RpdmUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8IGVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJyk7XG4gICAgICAgICAgICBjb25zdCB0YWJJbmZvID0geyBjb250cm9sTmFtZTogY29udHJvbE5hbWUgfHwgbGFiZWwsIGxhYmVsLCBpc0FjdGl2ZSB9O1xuICAgICAgICAgICAgcmVzdWx0cy50YWJzLnB1c2godGFiSW5mbyk7XG4gICAgICAgICAgICBpZiAoaXNBY3RpdmUpIHJlc3VsdHMuYWN0aXZlVGFiID0gdGFiSW5mby5jb250cm9sTmFtZTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3ZlckZvcm1JbnB1dHMoZG9jdW1lbnQsIGZvcm1OYW1lKSB7XG4gICAgY29uc3QgZm9ybSA9IGZvcm1OYW1lXG4gICAgICAgID8gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWZvcm0tbmFtZT1cIiR7Zm9ybU5hbWV9XCJdYClcbiAgICAgICAgOiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXTpsYXN0LW9mLXR5cGUnKTtcblxuICAgIGlmICghZm9ybSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBhY3R1YWxGb3JtTmFtZSA9IGZvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcbiAgICBjb25zdCByZXN1bHRzID0ge1xuICAgICAgICBmb3JtTmFtZTogYWN0dWFsRm9ybU5hbWUsXG4gICAgICAgIGlucHV0czogW10sIGNoZWNrYm94ZXM6IFtdLCBjb21ib2JveGVzOiBbXSwgcmFkaW9CdXR0b25zOiBbXSxcbiAgICAgICAgZGF0ZUZpZWxkczogW10sIHRpbWVGaWVsZHM6IFtdLCBpbnRlZ2VyRmllbGRzOiBbXSwgc3RyaW5nRmllbGRzOiBbXVxuICAgIH07XG5cbiAgICBmb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgY29uc3Qgcm9sZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGVsLmdldEF0dHJpYnV0ZSgndGl0bGUnKTtcbiAgICAgICAgaWYgKCFyb2xlKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGluZm8gPSB7IGNvbnRyb2xOYW1lLCByb2xlLCBsYWJlbCB9O1xuICAgICAgICByZXN1bHRzLmlucHV0cy5wdXNoKGluZm8pO1xuXG4gICAgICAgIHN3aXRjaCAocm9sZSkge1xuICAgICAgICAgICAgY2FzZSAnQ2hlY2tCb3gnOiBjYXNlICdZZXNObyc6IHJlc3VsdHMuY2hlY2tib3hlcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0NvbWJvQm94JzogY2FzZSAnRHJvcGRvd25MaXN0JzogcmVzdWx0cy5jb21ib2JveGVzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnUmFkaW9CdXR0b24nOiByZXN1bHRzLnJhZGlvQnV0dG9ucy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0RhdGUnOiByZXN1bHRzLmRhdGVGaWVsZHMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdUaW1lJzogcmVzdWx0cy50aW1lRmllbGRzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnSW50ZWdlcic6IGNhc2UgJ1JlYWwnOiByZXN1bHRzLmludGVnZXJGaWVsZHMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdTdHJpbmcnOiBjYXNlICdJbnB1dCc6IHJlc3VsdHMuc3RyaW5nRmllbGRzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3ZlckV2ZXJ5dGhpbmcoZG9jdW1lbnQsIHdpbmRvdykge1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7XG4gICAgICAgIHVybDoge1xuICAgICAgICAgICAgZnVsbDogd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICAgICAgICBtZW51SXRlbTogbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoJ21pJyksXG4gICAgICAgICAgICBjb21wYW55OiBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldCgnY21wJylcbiAgICAgICAgfSxcbiAgICAgICAgZm9ybXM6IFtdLFxuICAgICAgICBieUZvcm06IHt9XG4gICAgfTtcblxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJykuZm9yRWFjaChmb3JtRWwgPT4ge1xuICAgICAgICBjb25zdCBmb3JtTmFtZSA9IGZvcm1FbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xuICAgICAgICBjb25zdCBpc1Zpc2libGUgPSBmb3JtRWwub2Zmc2V0UGFyZW50ICE9PSBudWxsO1xuICAgICAgICByZXN1bHRzLmZvcm1zLnB1c2goeyBmb3JtTmFtZSwgaXNWaXNpYmxlIH0pO1xuICAgICAgICBpZiAoIWlzVmlzaWJsZSkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGZvcm1EYXRhID0geyB0YWJzOiBbXSwgc2VjdGlvbnM6IFtdLCBidXR0b25zOiBbXSwgaW5wdXRzOiBbXSwgZ3JpZHM6IFtdIH07XG5cbiAgICAgICAgZm9ybUVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiUGl2b3RJdGVtXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBmb3JtRGF0YS50YWJzLnB1c2goe1xuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXG4gICAgICAgICAgICAgICAgbGFiZWw6IGVsLnRleHRDb250ZW50Py50cmltKCkuc3BsaXQoJ1xcbicpWzBdXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZm9ybUVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiR3JvdXBcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgaWYgKGNvbnRyb2xOYW1lICYmICEvXlxcZCskLy50ZXN0KGNvbnRyb2xOYW1lKSkge1xuICAgICAgICAgICAgICAgIGZvcm1EYXRhLnNlY3Rpb25zLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsLCAuc2VjdGlvbi1oZWFkZXInKT8udGV4dENvbnRlbnQ/LnRyaW0oKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBmb3JtRWwucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGUqPVwiQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmIChjb250cm9sTmFtZSAmJiAhL15cXGQrJC8udGVzdChjb250cm9sTmFtZSkgJiYgIWNvbnRyb2xOYW1lLmluY2x1ZGVzKCdDbGVhcicpKSB7XG4gICAgICAgICAgICAgICAgZm9ybURhdGEuYnV0dG9ucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHJvbGU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpLFxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogZWwudGV4dENvbnRlbnQ/LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykuc3Vic3RyaW5nKDAsIDUwKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBpbnB1dFJvbGVzID0gWydJbnB1dCcsICdTdHJpbmcnLCAnSW50ZWdlcicsICdSZWFsJywgJ0RhdGUnLCAnVGltZScsICdDaGVja0JveCcsICdZZXNObycsICdDb21ib0JveCcsICdSYWRpb0J1dHRvbiddO1xuICAgICAgICBpbnB1dFJvbGVzLmZvckVhY2gocm9sZSA9PiB7XG4gICAgICAgICAgICBmb3JtRWwucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLXJvbGU9XCIke3JvbGV9XCJdYCkuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICAgICAgaWYgKGNvbnRyb2xOYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvcm1EYXRhLmlucHV0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lLCByb2xlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWw6IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKClcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZvcm1FbC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiUmVhY3RMaXN0XCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBmb3JtRGF0YS5ncmlkcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpLFxuICAgICAgICAgICAgICAgIHJvbGU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmVzdWx0cy5ieUZvcm1bZm9ybU5hbWVdID0gZm9ybURhdGE7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5HZW5lcmF0ZVN0ZXBzRm9yVGFiKGRvY3VtZW50KSB7XG4gICAgY29uc3QgdGFiRGF0YSA9IGFkbWluRGlzY292ZXJBY3RpdmVUYWIoZG9jdW1lbnQpO1xuICAgIGlmICghdGFiRGF0YS5hY3RpdmVUYWIpIHJldHVybiB7IGFjdGl2ZVRhYjogbnVsbCwgc3RlcHM6IFtdIH07XG5cbiAgICBjb25zdCBzdGVwcyA9IFtdO1xuICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAndGFiLW5hdmlnYXRlJywgY29udHJvbE5hbWU6IHRhYkRhdGEuYWN0aXZlVGFiLCBkaXNwbGF5VGV4dDogYFN3aXRjaCB0byAke3RhYkRhdGEuYWN0aXZlVGFifSB0YWJgLCB2YWx1ZTogJycgfSk7XG5cbiAgICB0YWJEYXRhLmZpZWxkcy5pbnB1dHMuZm9yRWFjaChmID0+IHtcbiAgICAgICAgc3RlcHMucHVzaCh7IHR5cGU6ICdpbnB1dCcsIGNvbnRyb2xOYW1lOiBmLmNvbnRyb2xOYW1lLCB2YWx1ZTogJycsIGRpc3BsYXlUZXh0OiBmLmxhYmVsIHx8IGYuY29udHJvbE5hbWUgfSk7XG4gICAgfSk7XG4gICAgdGFiRGF0YS5maWVsZHMuY2hlY2tib3hlcy5mb3JFYWNoKGYgPT4ge1xuICAgICAgICBzdGVwcy5wdXNoKHsgdHlwZTogJ2NoZWNrYm94JywgY29udHJvbE5hbWU6IGYuY29udHJvbE5hbWUsIHZhbHVlOiAndHJ1ZScsIGRpc3BsYXlUZXh0OiBmLmxhYmVsIHx8IGYuY29udHJvbE5hbWUgfSk7XG4gICAgfSk7XG4gICAgdGFiRGF0YS5maWVsZHMuY29tYm9ib3hlcy5mb3JFYWNoKGYgPT4ge1xuICAgICAgICBzdGVwcy5wdXNoKHsgdHlwZTogJ3NlbGVjdCcsIGNvbnRyb2xOYW1lOiBmLmNvbnRyb2xOYW1lLCB2YWx1ZTogJycsIGRpc3BsYXlUZXh0OiBmLmxhYmVsIHx8IGYuY29udHJvbE5hbWUgfSk7XG4gICAgfSk7XG4gICAgdGFiRGF0YS5maWVsZHMuaW50ZWdlcnMuZm9yRWFjaChmID0+IHtcbiAgICAgICAgc3RlcHMucHVzaCh7IHR5cGU6ICdpbnB1dCcsIGNvbnRyb2xOYW1lOiBmLmNvbnRyb2xOYW1lLCB2YWx1ZTogJycsIGRpc3BsYXlUZXh0OiBmLmxhYmVsIHx8IGYuY29udHJvbE5hbWUgfSk7XG4gICAgfSk7XG4gICAgdGFiRGF0YS5maWVsZHMuZGF0ZXMuZm9yRWFjaChmID0+IHtcbiAgICAgICAgc3RlcHMucHVzaCh7IHR5cGU6ICdpbnB1dCcsIGNvbnRyb2xOYW1lOiBmLmNvbnRyb2xOYW1lLCB2YWx1ZTogJycsIGRpc3BsYXlUZXh0OiBmLmxhYmVsIHx8IGYuY29udHJvbE5hbWUgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4geyBhY3RpdmVUYWI6IHRhYkRhdGEuYWN0aXZlVGFiLCBzdGVwcyB9O1xufVxuXG4gICAgcmV0dXJuIHsgc3RhcnRlZDogdHJ1ZSB9O1xufVxuXG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgIHN0YXJ0SW5qZWN0ZWQoeyB3aW5kb3dPYmo6IHdpbmRvdywgZG9jdW1lbnRPYmo6IGRvY3VtZW50IH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFFQSxNQUFxQixnQkFBckIsTUFBbUM7QUFBQSxJQUMvQixjQUFjO0FBQ1YsV0FBSyxlQUFlO0FBQ3BCLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssVUFBVTtBQUFBLElBQ25CO0FBQUE7QUFBQSxJQUdBLG1CQUFtQixTQUFTO0FBRXhCLFlBQU0sZ0JBQWdCLFFBQVEsUUFBUSxzQkFBc0I7QUFDNUQsVUFBSSxlQUFlO0FBQ2YsZUFBTyxjQUFjLGFBQWEsb0JBQW9CO0FBQUEsTUFDMUQ7QUFHQSxZQUFNLGNBQWMsUUFBUSxRQUFRLHdCQUF3QjtBQUM1RCxVQUFJLGFBQWE7QUFDYixlQUFPLFlBQVksYUFBYSxzQkFBc0IsS0FBSyxZQUFZLGFBQWEsb0JBQW9CO0FBQUEsTUFDNUc7QUFHQSxZQUFNLFlBQVksUUFBUSxRQUFRLDZEQUE2RDtBQUMvRixVQUFJLFdBQVc7QUFDWCxjQUFNLGdCQUFnQixVQUFVLGFBQWEsc0JBQXNCO0FBQ25FLFlBQUk7QUFBZSxpQkFBTztBQUFBLE1BQzlCO0FBR0EsWUFBTSxTQUFTLFFBQVEsUUFBUSw2REFBNkQ7QUFDNUYsVUFBSSxRQUFRO0FBQ1IsY0FBTSxhQUFhLE9BQU8sYUFBYSxzQkFBc0IsS0FDMUMsT0FBTyxjQUFjLHNCQUFzQixHQUFHLGFBQWEsb0JBQW9CO0FBQ2xHLFlBQUk7QUFBWSxpQkFBTztBQUFBLE1BQzNCO0FBR0EsVUFBSSxVQUFVO0FBQ2QsYUFBTyxXQUFXLFlBQVksU0FBUyxNQUFNO0FBQ3pDLGNBQU0sV0FBVyxRQUFRLGFBQWEsb0JBQW9CLE1BQ3pDLFFBQVEsYUFBYSxlQUFlLE1BQU0sU0FBUyxRQUFRLGFBQWEsc0JBQXNCLElBQUk7QUFDbkgsWUFBSTtBQUFVLGlCQUFPO0FBQ3JCLGtCQUFVLFFB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QU0sUUFBUSxDQUFDO0FBQ2YsWUFBTSxLQUFLLEVBQUUsTUFBTSxnQkFBZ0IsYUFBYSxRQUFRLFdBQVcsYUFBYSxhQUFhLFFBQVEsU0FBUyxRQUFRLE9BQU8sR0FBRyxDQUFDO0FBRWpJLGNBQVEsT0FBTyxPQUFPLFFBQVEsT0FBSztBQUMvQixjQUFNLEtBQUssRUFBRSxNQUFNLFNBQVMsYUFBYSxFQUFFLGFBQWEsT0FBTyxJQUFJLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDOUcsQ0FBQztBQUNELGNBQVEsT0FBTyxXQUFXLFFBQVEsT0FBSztBQUNuQyxjQUFNLEtBQUssRUFBRSxNQUFNLFlBQVksYUFBYSxFQUFFLGFBQWEsT0FBTyxRQUFRLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDckgsQ0FBQztBQUNELGNBQVEsT0FBTyxXQUFXLFFBQVEsT0FBSztBQUNuQyxjQUFNLEtBQUssRUFBRSxNQUFNLFVBQVUsYUFBYSxFQUFFLGFBQWEsT0FBTyxJQUFJLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDL0csQ0FBQztBQUNELGNBQVEsT0FBTyxTQUFTLFFBQVEsT0FBSztBQUNqQyxjQUFNLEtBQUssRUFBRSxNQUFNLFNBQVMsYUFBYSxFQUFFLGFBQWEsT0FBTyxJQUFJLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDOUcsQ0FBQztBQUNELGNBQVEsT0FBTyxNQUFNLFFBQVEsT0FBSztBQUM5QixjQUFNLEtBQUssRUFBRSxNQUFNLFNBQVMsYUFBYSxFQUFFLGFBQWEsT0FBTyxJQUFJLGFBQWEsRUFBRSxTQUFTLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDOUcsQ0FBQztBQUVELGFBQU8sRUFBRSxXQUFXLFFBQVEsV0FBVyxNQUFNO0FBQUEsSUFDakQ7QUFFSSxXQUFPLEVBQUUsU0FBUyxLQUFLO0FBQUEsRUFDM0I7QUFFQSxNQUFJLE9BQU8sV0FBVyxlQUFlLE9BQU8sYUFBYSxhQUFhO0FBQ2xFLGtCQUFjLEVBQUUsV0FBVyxRQUFRLGFBQWEsU0FBUyxDQUFDO0FBQUEsRUFDOUQ7IiwKICAibmFtZXMiOiBbImhhc0xvb2t1cEJ1dHRvbiIsICJ0b3AiLCAiY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZCIsICJmaWx0ZXJJbnB1dCIsICJmaWx0ZXJGaWVsZENvbnRhaW5lciIsICJyb3ciLCAib3B0aW9ucyIsICJ3aW5kb3ciLCAiZG9jdW1lbnQiLCAibmF2aWdhdG9yIiwgImdldFRpbWluZ3MiLCAid2FpdEZvclRpbWluZyIsICJrZXkiLCAicmVzdWx0IiwgImluc3BlY3RvciJdCn0K
