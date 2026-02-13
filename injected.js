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
  function comboInputWithSelectedMethod2(input, value, comboMethodOverride = "") {
    const method = comboMethodOverride || window.d365CurrentWorkflowSettings?.comboSelectMode || "method3";
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
  async function applyGridFilter(controlName, filterValue, filterMethod = "is exactly", comboMethodOverride = "") {
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
    await comboInputWithSelectedMethod2(filterInput, String(filterValue ?? ""), comboMethodOverride);
    if (normalizeText(filterInput.value) !== normalizeText(filterValue)) {
      setNativeValue(filterInput, String(filterValue ?? ""));
    }
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
    await sleep(150);
    if (input.tagName !== "SELECT") {
      await comboInputWithSelectedMethod2(input, value, comboMethodOverride);
    } else {
      setNativeValue(input, value);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await sleep(400);
  }
  async function setGridCellValue(controlName, value, fieldType, waitForValidation = false, comboMethodOverride = "") {
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
    await sleep(100);
    input.select?.();
    await sleep(50);
    await comboInputWithSelectedMethod2(input, value, comboMethodOverride);
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
      await comboInputWithSelectedMethod2(dockInput, value, comboMethodOverride);
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
          await setInputValueInForm(input, options.savedQuery, options.comboSelectMode || "");
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
        await setInputValueInForm(input, tableName, options.comboSelectMode || "");
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
        await setInputValueInForm(input, fieldName, options.comboSelectMode || "");
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
        await setInputValueInForm(input, criteriaValue, options.comboSelectMode || "");
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
  async function setInputValueInForm(inputElement, value, comboMethodOverride = "") {
    if (!inputElement)
      return;
    inputElement.focus();
    await sleep(100);
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
        await comboInputWithSelectedMethod2(dockInput, value, comboMethodOverride);
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
      await comboInputWithSelectedMethod2(lookupInput, value, comboMethodOverride);
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
      await comboInputWithSelectedMethod2(input, value, comboMethodOverride);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luamVjdGVkL2luc3BlY3Rvci9EMzY1SW5zcGVjdG9yLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb2dnaW5nLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9hc3luYy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvdGV4dC5qcyIsICJzcmMvaW5qZWN0ZWQvcnVudGltZS9lbmdpbmUtdXRpbHMuanMiLCAic3JjL2luamVjdGVkL3J1bnRpbWUvY29uZGl0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvdXRpbHMvZG9tLmpzIiwgInNyYy9pbmplY3RlZC91dGlscy9sb29rdXAuanMiLCAic3JjL2luamVjdGVkL3V0aWxzL2NvbWJvYm94LmpzIiwgInNyYy9pbmplY3RlZC9zdGVwcy9hY3Rpb24taGVscGVycy5qcyIsICJzcmMvaW5qZWN0ZWQvc3RlcHMvYWN0aW9ucy5qcyIsICJzcmMvaW5qZWN0ZWQvaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEQzNjVGTyBFbGVtZW50IEluc3BlY3RvciBhbmQgRGlzY292ZXJ5IE1vZHVsZVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRDM2NUluc3BlY3RvciB7XHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudCA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5ID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgdGhlIGZvcm0gbmFtZSB0aGF0IGNvbnRhaW5zIGFuIGVsZW1lbnRcclxuICAgIGdldEVsZW1lbnRGb3JtTmFtZShlbGVtZW50KSB7XHJcbiAgICAgICAgLy8gTG9vayBmb3IgdGhlIGNsb3Nlc3QgZm9ybSBjb250YWluZXJcclxuICAgICAgICBjb25zdCBmb3JtQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgIGlmIChmb3JtQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb3JtQ29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIGZvcm0gdmlhIGRhdGEtZHluLWNvbnRyb2xuYW1lIG9uIGEgZm9ybS1sZXZlbCBjb250YWluZXJcclxuICAgICAgICBjb25zdCBmb3JtRWxlbWVudCA9IGVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLXJvbGU9XCJGb3JtXCJdJyk7XHJcbiAgICAgICAgaWYgKGZvcm1FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmb3JtRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgZm9ybUVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgdGhlIHdvcmtzcGFjZSBvciBwYWdlIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IHdvcmtzcGFjZSA9IGVsZW1lbnQuY2xvc2VzdCgnLndvcmtzcGFjZS1jb250ZW50LCAud29ya3NwYWNlLCBbZGF0YS1keW4tcm9sZT1cIldvcmtzcGFjZVwiXScpO1xyXG4gICAgICAgIGlmICh3b3Jrc3BhY2UpIHtcclxuICAgICAgICAgICAgY29uc3Qgd29ya3NwYWNlTmFtZSA9IHdvcmtzcGFjZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGlmICh3b3Jrc3BhY2VOYW1lKSByZXR1cm4gd29ya3NwYWNlTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGRpYWxvZy9tb2RhbCBjb250ZXh0XHJcbiAgICAgICAgY29uc3QgZGlhbG9nID0gZWxlbWVudC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5tb2RhbC1jb250ZW50Jyk7XHJcbiAgICAgICAgaWYgKGRpYWxvZykge1xyXG4gICAgICAgICAgICBjb25zdCBkaWFsb2dOYW1lID0gZGlhbG9nLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoZGlhbG9nTmFtZSkgcmV0dXJuIGRpYWxvZ05hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSByb290IGZvcm0gYnkgd2Fsa2luZyB1cCB0aGUgRE9NXHJcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBlbGVtZW50O1xyXG4gICAgICAgIHdoaWxlIChjdXJyZW50ICYmIGN1cnJlbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBjdXJyZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0Zvcm0nID8gY3VycmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgOiBudWxsKTtcclxuICAgICAgICAgICAgaWYgKGZvcm1OYW1lKSByZXR1cm4gZm9ybU5hbWU7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHRoZSBhY3RpdmUvZm9jdXNlZCBmb3JtIG5hbWVcclxuICAgIGdldEFjdGl2ZUZvcm1OYW1lKCkge1xyXG4gICAgICAgIC8vIENoZWNrIGZvciBhY3RpdmUgZGlhbG9nIGZpcnN0IChjaGlsZCBmb3JtcyBhcmUgdHlwaWNhbGx5IGRpYWxvZ3MpXHJcbiAgICAgICAgY29uc3QgYWN0aXZlRGlhbG9nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl06bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKSwgLmRpYWxvZy1jb250YWluZXI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVEaWFsb2cpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhbG9nRm9ybSA9IGFjdGl2ZURpYWxvZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpO1xyXG4gICAgICAgICAgICBpZiAoZGlhbG9nRm9ybSkgcmV0dXJuIGRpYWxvZ0Zvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcclxuICAgICAgICAgICAgcmV0dXJuIGFjdGl2ZURpYWxvZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBmb2N1c2VkIGVsZW1lbnQgYW5kIGdldCBpdHMgZm9ybVxyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xyXG4gICAgICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShhY3RpdmVFbGVtZW50KTtcclxuICAgICAgICAgICAgaWYgKGZvcm1OYW1lICYmIGZvcm1OYW1lICE9PSAnVW5rbm93bicpIHJldHVybiBmb3JtTmFtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTG9vayBmb3IgdGhlIHRvcG1vc3QvYWN0aXZlIGZvcm0gc2VjdGlvblxyXG4gICAgICAgIGNvbnN0IHZpc2libGVGb3JtcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XHJcbiAgICAgICAgaWYgKHZpc2libGVGb3Jtcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIFJldHVybiB0aGUgbGFzdCBvbmUgKHR5cGljYWxseSB0aGUgbW9zdCByZWNlbnRseSBvcGVuZWQvdG9wbW9zdClcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHZpc2libGVGb3Jtcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNFbGVtZW50VmlzaWJsZSh2aXNpYmxlRm9ybXNbaV0pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZpc2libGVGb3Jtc1tpXS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGFsbCBpbnRlcmFjdGl2ZSBlbGVtZW50cyBvbiB0aGUgcGFnZVxyXG4gICAgZGlzY292ZXJFbGVtZW50cyhhY3RpdmVGb3JtT25seSA9IGZhbHNlKSB7XHJcbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSBbXTtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtID0gYWN0aXZlRm9ybU9ubHkgPyB0aGlzLmdldEFjdGl2ZUZvcm1OYW1lKCkgOiBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGJ1dHRvbnNcclxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIk1lbnVJdGVtQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGVsKTtcclxuICAgICAgICAgICAgY29uc3QgdmlzaWJsZSA9IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdidXR0b24nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IHRleHQsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB2aXNpYmxlLFxyXG4gICAgICAgICAgICAgICAgYXJpYUxhYmVsOiBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbGwgaW5wdXQgZmllbGRzIChleHBhbmRlZCB0byBjYXRjaCBtb3JlIGZpZWxkIHR5cGVzKVxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTXVsdGlsaW5lSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlNlZ21lbnRlZEVudHJ5XCJdLCBpbnB1dFtkYXRhLWR5bi1jb250cm9sbmFtZV0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgICAgIC8vIEdldCBjb250cm9sIG5hbWUgZnJvbSBlbGVtZW50IG9yIHBhcmVudFxyXG4gICAgICAgICAgICBsZXQgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgIGxldCB0YXJnZXRFbGVtZW50ID0gZWw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBJZiBub3QgZm91bmQsIGNoZWNrIHBhcmVudCBlbGVtZW50IChjb21tb24gZm9yIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyBsaWtlIEFjY291bnQpXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSA9IHBhcmVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0RWxlbWVudCA9IHBhcmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGFkZGVkIChhdm9pZCBkdXBsaWNhdGVzKVxyXG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc29tZShlID0+IGUuY29udHJvbE5hbWUgPT09IGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZSh0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFbGVtZW50TGFiZWwodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkSW5mbyA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnaW5wdXQnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKHRhcmdldEVsZW1lbnQpLFxyXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlOiBmaWVsZEluZm8sXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHRhcmdldEVsZW1lbnRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYWxsIGNoZWNrYm94ZXMvdG9nZ2xlc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ2hlY2tCb3hcIl0sIGlucHV0W3R5cGU9XCJjaGVja2JveFwiXVtkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgbGV0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBsZXQgdGFyZ2V0RWxlbWVudCA9IGVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQ2hlY2sgcGFyZW50IGlmIG5vdCBmb3VuZFxyXG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUgPSBwYXJlbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEVsZW1lbnQgPSBwYXJlbnQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcclxuICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnNvbWUoZSA9PiBlLmNvbnRyb2xOYW1lID09PSBjb250cm9sTmFtZSkpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUodGFyZ2V0RWxlbWVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKHRhcmdldEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBjb25zdCBjaGVja2JveCA9IHRhcmdldEVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHwgdGFyZ2V0RWxlbWVudDtcclxuICAgICAgICAgICAgY29uc3QgaXNDaGVja2VkID0gY2hlY2tib3guY2hlY2tlZCB8fCBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdjaGVja2JveCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUodGFyZ2V0RWxlbWVudCksXHJcbiAgICAgICAgICAgICAgICBjaGVja2VkOiBpc0NoZWNrZWQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IHRhcmdldEVsZW1lbnRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYWxsIHJhZGlvIGJ1dHRvbiBncm91cHNcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJSYWRpb0J1dHRvblwiXSwgW3JvbGU9XCJyYWRpb2dyb3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIkZyYW1lT3B0aW9uQnV0dG9uXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IHRoaXMuZ2V0RWxlbWVudExhYmVsKGVsKTtcclxuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRSYWRpbyA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXTpjaGVja2VkLCBbcm9sZT1cInJhZGlvXCJdW2FyaWEtY2hlY2tlZD1cInRydWVcIl0nKTtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gc2VsZWN0ZWRSYWRpbz8udmFsdWUgfHwgc2VsZWN0ZWRSYWRpbz8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJyc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncmFkaW8nLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogbGFiZWwsXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcbiAgICAgICAgICAgICAgICBjdXJyZW50VmFsdWU6IGN1cnJlbnRWYWx1ZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBGaW5kIGFjdGlvbiBwYW5lIHRhYnMgKEFwcEJhciB0YWJzKVxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkFwcEJhclRhYlwiXSwgLmFwcEJhclRhYiwgW3JvbGU9XCJ0YWJcIl1bZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XG5cbiAgICAgICAgICAgIC8vIFNraXAgdGFicyBpbnNpZGUgZGlhbG9ncy9mbHlvdXRzXG4gICAgICAgICAgICBpZiAoZWwuY2xvc2VzdCgnLmRpYWxvZy1jb250ZW50LCBbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0aGlzLmdldEVsZW1lbnRUZXh0KGVsKTtcbiAgICAgICAgICAgIGNvbnN0IGlzQWN0aXZlID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fFxuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykgfHxcbiAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ3NlbGVjdGVkJyk7XG5cbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdhY3Rpb24tcGFuZS10YWInLFxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiBpc0FjdGl2ZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBGaW5kIGFsbCB0cmFkaXRpb25hbCBEMzY1IGdyaWRzL3RhYmxlc1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1OYW1lID0gdGhpcy5nZXRFbGVtZW50Rm9ybU5hbWUoZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGFjdGl2ZSBmb3JtIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlRm9ybU9ubHkgJiYgYWN0aXZlRm9ybSAmJiBmb3JtTmFtZSAhPT0gYWN0aXZlRm9ybSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZCcsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGhpcy5nZXRFbGVtZW50TGFiZWwoZWwpIHx8ICdHcmlkJyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShlbCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRGlzY292ZXIgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLmRpc2NvdmVyR3JpZENvbHVtbnMoZWwsIGNvbnRyb2xOYW1lLCBmb3JtTmFtZSwgZWxlbWVudHMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzICgucmVhY3RHcmlkKVxyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZWFjdEdyaWQnKS5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSB0aGlzLmdldEVsZW1lbnRGb3JtTmFtZShlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgYWN0aXZlIGZvcm0gaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtT25seSAmJiBhY3RpdmVGb3JtICYmIGZvcm1OYW1lICE9PSBhY3RpdmVGb3JtKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkJyxcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiAncmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiAnUmVhY3QgR3JpZCcsXHJcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoZWwpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6ICcucmVhY3RHcmlkJyxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGV4cGFuZGFibGUgc2VjdGlvbnMgKEZhc3RUYWJzLCBHcm91cHMsIFNlY3Rpb25QYWdlcylcclxuICAgICAgICAvLyBUaGVzZSBhcmUgY29sbGFwc2libGUgc2VjdGlvbnMgaW4gRDM2NSBkaWFsb2dzIGFuZCBmb3Jtc1xyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JvdXBcIl0sIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgW2RhdGEtZHluLXJvbGU9XCJGYXN0VGFiXCJdLCAuc2VjdGlvbi1wYWdlLCAuZmFzdHRhYicpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGFkZGVkXHJcbiAgICAgICAgICAgIGlmIChlbGVtZW50cy5zb21lKGUgPT4gZS5jb250cm9sTmFtZSA9PT0gY29udHJvbE5hbWUpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEZvcm1OYW1lKGVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBhY3RpdmUgZm9ybSBpZiByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZUZvcm1Pbmx5ICYmIGFjdGl2ZUZvcm0gJiYgZm9ybU5hbWUgIT09IGFjdGl2ZUZvcm0pIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYWN0dWFsbHkgYW4gZXhwYW5kYWJsZSBzZWN0aW9uXHJcbiAgICAgICAgICAgIC8vIExvb2sgZm9yIGhlYWRlciBlbGVtZW50cyBvciBhcmlhLWV4cGFuZGVkIGF0dHJpYnV0ZVxyXG4gICAgICAgICAgICBjb25zdCBoYXNIZWFkZXIgPSBlbC5xdWVyeVNlbGVjdG9yKCcuc2VjdGlvbi1oZWFkZXIsIC5ncm91cC1oZWFkZXIsIFtkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VIZWFkZXJcIl0sIC5zZWN0aW9uLXBhZ2UtY2FwdGlvbiwgYnV0dG9uW2FyaWEtZXhwYW5kZWRdJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kYWJsZSA9IGVsLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2libGUnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnc2VjdGlvbi1wYWdlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNIZWFkZXIgIT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSA9PT0gJ0dyb3VwJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnU2VjdGlvblBhZ2UnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFpc0V4cGFuZGFibGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgIC8vIERldGVybWluZSBjdXJyZW50IGV4cGFuZGVkIHN0YXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRFeHBhbmRhYmxlU2VjdGlvbkxhYmVsKGVsKSB8fCBjb250cm9sTmFtZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ3NlY3Rpb24nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGlzcGxheVRleHQ6IGxhYmVsLFxyXG4gICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGVsKSxcclxuICAgICAgICAgICAgICAgIGlzRXhwYW5kZWQ6IGlzRXhwYW5kZWQsXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGVsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gRGlzY292ZXIgUmVhY3QgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLmRpc2NvdmVyUmVhY3RHcmlkQ29sdW1ucyhlbCwgZm9ybU5hbWUsIGVsZW1lbnRzKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCByZWFkYWJsZSB0ZXh0IGZyb20gYW4gZWxlbWVudFxyXG4gICAgZ2V0RWxlbWVudFRleHQoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBhcmlhLWxhYmVsIGZpcnN0XHJcbiAgICAgICAgbGV0IHRleHQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICAgIGlmICh0ZXh0ICYmIHRleHQudHJpbSgpKSByZXR1cm4gdGV4dC50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSB0ZXh0IGNvbnRlbnQgKGV4Y2x1ZGluZyBjaGlsZCBidXR0b25zL2ljb25zKVxyXG4gICAgICAgIGNvbnN0IGNsb25lID0gZWxlbWVudC5jbG9uZU5vZGUodHJ1ZSk7XHJcbiAgICAgICAgY2xvbmUucXVlcnlTZWxlY3RvckFsbCgnLmJ1dHRvbi1pY29uLCAuZmEsIC5nbHlwaGljb24nKS5mb3JFYWNoKGljb24gPT4gaWNvbi5yZW1vdmUoKSk7XHJcbiAgICAgICAgdGV4dCA9IGNsb25lLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG5cclxuICAgICAgICAvLyBUcnkgdGl0bGUgYXR0cmlidXRlXHJcbiAgICAgICAgdGV4dCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd0aXRsZScpO1xyXG4gICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gY29udHJvbCBuYW1lXHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpIHx8ICdVbmtub3duJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGlucHV0IGZpZWxkc1xyXG4gICAgZ2V0RWxlbWVudExhYmVsKGVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbFxyXG4gICAgICAgIGxldCBsYWJlbCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGxhYmVsICYmIGxhYmVsLnRyaW0oKSkgcmV0dXJuIGxhYmVsLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gVHJ5IGFzc29jaWF0ZWQgbGFiZWwgZWxlbWVudFxyXG4gICAgICAgIGNvbnN0IGxhYmVsRWxlbWVudCA9IGVsZW1lbnQuY2xvc2VzdCgnLmR5bi1sYWJlbC13cmFwcGVyJyk/LnF1ZXJ5U2VsZWN0b3IoJy5keW4tbGFiZWwnKTtcclxuICAgICAgICBpZiAobGFiZWxFbGVtZW50KSByZXR1cm4gbGFiZWxFbGVtZW50LnRleHRDb250ZW50Py50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFRyeSBwYXJlbnQgY29udGFpbmVyIGxhYmVsXHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuaW5wdXRfY29udGFpbmVyLCAuZm9ybS1ncm91cCcpO1xyXG4gICAgICAgIGlmIChjb250YWluZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyTGFiZWwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignbGFiZWwnKTtcclxuICAgICAgICAgICAgaWYgKGNvbnRhaW5lckxhYmVsKSByZXR1cm4gY29udGFpbmVyTGFiZWwudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGNvbnRyb2wgbmFtZVxyXG4gICAgICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnVW5rbm93bic7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGlzY292ZXIgZ3JpZCBjb2x1bW5zIGZvciBpbnB1dC9lZGl0aW5nXHJcbiAgICBkaXNjb3ZlckdyaWRDb2x1bW5zKGdyaWRFbGVtZW50LCBncmlkTmFtZSwgZm9ybU5hbWUsIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgY29uc3QgYWRkZWRDb2x1bW5zID0gbmV3IFNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAxOiBGaW5kIGNvbHVtbiBoZWFkZXJzXHJcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiQ29sdW1uSGVhZGVyXCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXSwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgaGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbE5hbWUgPSBoZWFkZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBoZWFkZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogYCR7ZGlzcGxheVRleHR9YCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShoZWFkZXIpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgIGlzSGVhZGVyOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZWxlbWVudDogaGVhZGVyXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1ldGhvZCAyOiBGaW5kIGNlbGxzIHdpdGggaW5wdXRzIGluIHRoZSBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXNlbGVjdGVkPVwidHJ1ZVwiXSwgW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZHluLXNlbGVjdGVkUm93JykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1yb2xlPVwiUm93XCJdOmZpcnN0LW9mLXR5cGUsIFtyb2xlPVwicm93XCJdOm5vdChbcm9sZT1cImNvbHVtbmhlYWRlclwiXSk6Zmlyc3Qtb2YtdHlwZScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgLy8gRmluZCBhbGwgaW5wdXQgZmllbGRzIGluIHRoZSByb3dcclxuICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICBjZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY29uc3Qgcm9sZSA9IGNlbGwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9IGNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ0lucHV0JywgJ0NvbWJvQm94JywgJ0xvb2t1cCcsICdSZWZlcmVuY2VHcm91cCcsICdTZWdtZW50ZWRFbnRyeSddLmluY2x1ZGVzKHJvbGUpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoaGFzSW5wdXQgfHwgcm9sZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFkZGVkQ29sdW1ucy5hZGQoY29sTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjZWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZE5hbWU6IGdyaWROYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2aXNpYmxlOiB0aGlzLmlzRWxlbWVudFZpc2libGUoY2VsbCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1OYW1lOiBmb3JtTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogaGFzSW5wdXQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBjZWxsXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXRob2QgMzogRmluZCBhbnkgZWRpdGFibGUgaW5wdXRzIGluc2lkZSB0aGUgZ3JpZCBib2R5XHJcbiAgICAgICAgY29uc3QgZ3JpZElucHV0cyA9IGdyaWRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiSW5wdXRcIl0sIFtkYXRhLWR5bi1yb2xlPVwiQ29tYm9Cb3hcIl0sIFtkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdLCBbZGF0YS1keW4tcm9sZT1cIlJlZmVyZW5jZUdyb3VwXCJdJyk7XHJcbiAgICAgICAgZ3JpZElucHV0cy5mb3JFYWNoKGlucHV0ID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29sTmFtZSA9IGlucHV0LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgYWRkZWRDb2x1bW5zLmFkZChjb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbE5hbWUpIHx8IHRoaXMuZ2V0RWxlbWVudExhYmVsKGlucHV0KSB8fCBjb2xOYW1lO1xyXG4gICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShpbnB1dCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29sTmFtZSxcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgIGdyaWROYW1lOiBncmlkTmFtZSxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShpbnB1dCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBpbnB1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBhIGdyaWQgY29sdW1uIGJ5IGxvb2tpbmcgYXQgdGhlIGhlYWRlclxyXG4gICAgZ2V0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2x1bW5Db250cm9sTmFtZSkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIgY2VsbCBmb3IgdGhpcyBjb2x1bW5cclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdLCBbcm9sZT1cImNvbHVtbmhlYWRlclwiXVtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sdW1uQ29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gaGVhZGVyLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgaGVhZGVyIGJ5IHBhcnRpYWwgbWF0Y2ggKGNvbHVtbiBuYW1lIG1pZ2h0IGJlIGRpZmZlcmVudCBpbiBoZWFkZXIgdnMgY2VsbClcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJDb2x1bW5IZWFkZXJcIl0sIFtyb2xlPVwiY29sdW1uaGVhZGVyXCJdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGFsbEhlYWRlcnMpIHtcclxuICAgICAgICAgICAgY29uc3QgaGVhZGVyTmFtZSA9IGguZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoaGVhZGVyTmFtZSAmJiAoY29sdW1uQ29udHJvbE5hbWUuaW5jbHVkZXMoaGVhZGVyTmFtZSkgfHwgaGVhZGVyTmFtZS5pbmNsdWRlcyhjb2x1bW5Db250cm9sTmFtZSkpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gaC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc2NvdmVyIGNvbHVtbnMgaW4gUmVhY3QgRml4ZWREYXRhVGFibGUgZ3JpZHNcclxuICAgIGRpc2NvdmVyUmVhY3RHcmlkQ29sdW1ucyhncmlkRWxlbWVudCwgZm9ybU5hbWUsIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgY29uc3QgYWRkZWRDb2x1bW5zID0gbmV3IFNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEdldCBjb2x1bW4gaGVhZGVycyBmcm9tIC5keW4taGVhZGVyQ2VsbCBlbGVtZW50c1xyXG4gICAgICAgIGNvbnN0IGhlYWRlckNlbGxzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciAuZHluLWhlYWRlckNlbGwnKTtcclxuICAgICAgICBoZWFkZXJDZWxscy5mb3JFYWNoKChoZWFkZXIsIGNvbEluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gaGVhZGVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKCFjb250cm9sTmFtZSB8fCBhZGRlZENvbHVtbnMuaGFzKGNvbnRyb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbnRyb2xOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gaGVhZGVyLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaGVhZGVyLnRleHRDb250ZW50Py50cmltKCkgfHwgY29udHJvbE5hbWU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdncmlkLWNvbHVtbicsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udHJvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgIGNvbHVtbkluZGV4OiBjb2xJbmRleCxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShoZWFkZXIpLFxyXG4gICAgICAgICAgICAgICAgc2VsZWN0b3I6IGAuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICBpc0hlYWRlcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGhlYWRlclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBbHNvIGxvb2sgZm9yIGVkaXRhYmxlIGlucHV0cyBpbnNpZGUgdGhlIGJvZHkgcm93c1xyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAvLyBGaW5kIGFjdGl2ZS9zZWxlY3RlZCByb3cgZmlyc3QsIG9yIGZhbGxiYWNrIHRvIGZpcnN0IHJvd1xyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVSb3cgPSBib2R5Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdLCAuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbltkYXRhLWR5bi1yb3ctYWN0aXZlPVwidHJ1ZVwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbi5wdWJsaWNfZml4ZWREYXRhVGFibGVSb3dfbWFpbicpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZVJvdykge1xyXG4gICAgICAgICAgICAgICAgLy8gRmluZCBhbGwgY2VsbHMgd2l0aCBkYXRhLWR5bi1jb250cm9sbmFtZVxyXG4gICAgICAgICAgICAgICAgY29uc3QgY2VsbHMgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgICAgICAgICAgY2VsbHMuZm9yRWFjaChjZWxsID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xOYW1lIHx8IGFkZGVkQ29sdW1ucy5oYXMoY29sTmFtZSkpIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCByb2xlID0gY2VsbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNJbnB1dCA9IGNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydJbnB1dCcsICdDb21ib0JveCcsICdMb29rdXAnLCAnUmVmZXJlbmNlR3JvdXAnLCAnU2VnbWVudGVkRW50cnknXS5pbmNsdWRlcyhyb2xlKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gdGhpcy5nZXRSZWFjdEdyaWRDb2x1bW5MYWJlbChncmlkRWxlbWVudCwgY29sTmFtZSkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSB0aGlzLmRldGVjdEZpZWxkVHlwZShjZWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2dyaWQtY29sdW1uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXlUZXh0OiBkaXNwbGF5VGV4dCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZE5hbWU6ICdyZWFjdEdyaWQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdGhpcy5pc0VsZW1lbnRWaXNpYmxlKGNlbGwpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtTmFtZTogZm9ybU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzRWRpdGFibGU6IGhhc0lucHV0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZFR5cGU6IGZpZWxkVHlwZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm9sZTogcm9sZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogY2VsbFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCBhbnkgZWRpdGFibGUgaW5wdXRzIGluIHRoZSBncmlkIGJvZHlcclxuICAgICAgICBjb25zdCBncmlkSW5wdXRzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJJbnB1dFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2JvZHkgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBcIl0sIC5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5IFtkYXRhLWR5bi1yb2xlPVwiUmVmZXJlbmNlR3JvdXBcIl0nKTtcclxuICAgICAgICBncmlkSW5wdXRzLmZvckVhY2goaW5wdXQgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBpZiAoIWNvbE5hbWUgfHwgYWRkZWRDb2x1bW5zLmhhcyhjb2xOYW1lKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBhZGRlZENvbHVtbnMuYWRkKGNvbE5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgZGlzcGxheVRleHQgPSB0aGlzLmdldFJlYWN0R3JpZENvbHVtbkxhYmVsKGdyaWRFbGVtZW50LCBjb2xOYW1lKSB8fCB0aGlzLmdldEVsZW1lbnRMYWJlbChpbnB1dCkgfHwgY29sTmFtZTtcclxuICAgICAgICAgICAgY29uc3QgZmllbGRUeXBlID0gdGhpcy5kZXRlY3RGaWVsZFR5cGUoaW5wdXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZWxlbWVudHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnZ3JpZC1jb2x1bW4nLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGNvbE5hbWUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogZGlzcGxheVRleHQsXHJcbiAgICAgICAgICAgICAgICBncmlkTmFtZTogJ3JlYWN0R3JpZCcsXHJcbiAgICAgICAgICAgICAgICBncmlkVHlwZTogJ3JlYWN0JyxcclxuICAgICAgICAgICAgICAgIHZpc2libGU6IHRoaXMuaXNFbGVtZW50VmlzaWJsZShpbnB1dCksXHJcbiAgICAgICAgICAgICAgICBzZWxlY3RvcjogYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29sTmFtZX1cIl1gLFxyXG4gICAgICAgICAgICAgICAgZm9ybU5hbWU6IGZvcm1OYW1lLFxyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZTogZmllbGRUeXBlLFxyXG4gICAgICAgICAgICAgICAgcm9sZTogaW5wdXQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXHJcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBpbnB1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGxhYmVsIGZvciBhIFJlYWN0IGdyaWQgY29sdW1uIGJ5IGxvb2tpbmcgYXQgdGhlIGhlYWRlclxyXG4gICAgZ2V0UmVhY3RHcmlkQ29sdW1uTGFiZWwoZ3JpZEVsZW1lbnQsIGNvbHVtbkNvbnRyb2xOYW1lKSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGhlYWRlciBjZWxsIHdpdGggbWF0Y2hpbmcgY29udHJvbG5hbWVcclxuICAgICAgICBjb25zdCBoZWFkZXIgPSBncmlkRWxlbWVudC5xdWVyeVNlbGVjdG9yKGAuZHluLWhlYWRlckNlbGxbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbHVtbkNvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoZWFkZXIucXVlcnlTZWxlY3RvcignLmR5bi1oZWFkZXJDZWxsTGFiZWwnKTtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGhlYWRlci50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICBpZiAodGV4dCkgcmV0dXJuIHRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFBhcnRpYWwgbWF0Y2hcclxuICAgICAgICBjb25zdCBhbGxIZWFkZXJzID0gZ3JpZEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmR5bi1oZWFkZXJDZWxsW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBhbGxIZWFkZXJzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlck5hbWUgPSBoLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcclxuICAgICAgICAgICAgaWYgKGhlYWRlck5hbWUgJiYgKGNvbHVtbkNvbnRyb2xOYW1lLmluY2x1ZGVzKGhlYWRlck5hbWUpIHx8IGhlYWRlck5hbWUuaW5jbHVkZXMoY29sdW1uQ29udHJvbE5hbWUpKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBoLnF1ZXJ5U2VsZWN0b3IoJy5keW4taGVhZGVyQ2VsbExhYmVsJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gbGFiZWw/LnRleHRDb250ZW50Py50cmltKCkgfHwgaC50ZXh0Q29udGVudD8udHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRleHQpIHJldHVybiB0ZXh0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERldGVjdCBmaWVsZCB0eXBlIChlbnVtLCBsb29rdXAsIGZyZWV0ZXh0LCBldGMuKVxyXG4gICAgZGV0ZWN0RmllbGRUeXBlKGVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCByb2xlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyAobGlrZSBBY2NvdW50KSBoYXZlIHNwZWNpYWwgbG9va3VwXHJcbiAgICAgICAgaWYgKHJvbGUgPT09ICdTZWdtZW50ZWRFbnRyeScpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgdHlwZTogJ3NlZ21lbnRlZC1sb29rdXAnLCByb2xlOiByb2xlIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBsb29rdXAgYnV0dG9uXHJcbiAgICAgICAgY29uc3QgaGFzTG9va3VwQnV0dG9uID0gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5sb29rdXAtYnV0dG9uJykgIT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgQ29tYm9Cb3gvRHJvcGRvd25cclxuICAgICAgICBjb25zdCBpc0NvbWJvQm94ID0gcm9sZSA9PT0gJ0NvbWJvQm94JyB8fCBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnY29tYm9Cb3gnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3Igc2VsZWN0IGVsZW1lbnRcclxuICAgICAgICBjb25zdCBzZWxlY3QgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE11bHRpbGluZUlucHV0IGRldGVjdGlvblxyXG4gICAgICAgIGNvbnN0IGlzTXVsdGlsaW5lID0gcm9sZSA9PT0gJ011bHRpbGluZUlucHV0JztcclxuICAgICAgICBcclxuICAgICAgICAvLyBEZXRlY3QgbnVtZXJpYyBmaWVsZHNcclxuICAgICAgICBjb25zdCBpc051bWVyaWMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJudW1iZXJcIl0nKSAhPT0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEZXRlY3QgZGF0ZSBmaWVsZHNcclxuICAgICAgICBjb25zdCBpc0RhdGUgPSBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZGF0ZS1maWVsZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiZGF0ZVwiXScpICE9PSBudWxsO1xyXG5cclxuICAgICAgICAvLyBCdWlsZCBmaWVsZCB0eXBlIGluZm9cclxuICAgICAgICBjb25zdCBmaWVsZEluZm8gPSB7XHJcbiAgICAgICAgICAgIGNvbnRyb2xUeXBlOiByb2xlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICd0ZXh0J1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGlmIChpc011bHRpbGluZSkge1xyXG4gICAgICAgICAgICBmaWVsZEluZm8uaW5wdXRUeXBlID0gJ3RleHRhcmVhJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzTXVsdGlsaW5lID0gdHJ1ZTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzQ29tYm9Cb3ggfHwgc2VsZWN0KSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnZW51bSc7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pc0VudW0gPSB0cnVlO1xyXG4gICAgICAgICAgICBmaWVsZEluZm8udmFsdWVzID0gdGhpcy5leHRyYWN0RW51bVZhbHVlcyhlbGVtZW50LCBzZWxlY3QpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaGFzTG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnbG9va3VwJztcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlzTG9va3VwID0gdHJ1ZTtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmFsbG93RnJlZXRleHQgPSAhZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1vbmx5Jyk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc051bWVyaWMpIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLmlucHV0VHlwZSA9ICdudW1iZXInO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNEYXRlKSB7XHJcbiAgICAgICAgICAgIGZpZWxkSW5mby5pbnB1dFR5cGUgPSAnZGF0ZSc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBHZXQgbWF4IGxlbmd0aCBpZiBhdmFpbGFibGVcclxuICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIHRleHRhcmVhJyk7XHJcbiAgICAgICAgaWYgKGlucHV0ICYmIGlucHV0Lm1heExlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgZmllbGRJbmZvLm1heExlbmd0aCA9IGlucHV0Lm1heExlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBmaWVsZEluZm87XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRXh0cmFjdCBlbnVtIHZhbHVlcyBmcm9tIGRyb3Bkb3duXHJcbiAgICBleHRyYWN0RW51bVZhbHVlcyhlbGVtZW50LCBzZWxlY3RFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ID0gc2VsZWN0RWxlbWVudCB8fCBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgICAgIGlmICghc2VsZWN0KSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgcmV0dXJuIEFycmF5LmZyb20oc2VsZWN0Lm9wdGlvbnMpXHJcbiAgICAgICAgICAgIC5maWx0ZXIob3B0ID0+IG9wdC52YWx1ZSAhPT0gJycpXHJcbiAgICAgICAgICAgIC5tYXAob3B0ID0+ICh7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZTogb3B0LnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgdGV4dDogb3B0LnRleHQudHJpbSgpXHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgbGFiZWwgZm9yIGV4cGFuZGFibGUgc2VjdGlvbnNcclxuICAgIGdldEV4cGFuZGFibGVTZWN0aW9uTGFiZWwoZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBoZWFkZXIvY2FwdGlvbiBlbGVtZW50XHJcbiAgICAgICAgY29uc3QgaGVhZGVyU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICAgICAnLnNlY3Rpb24tcGFnZS1jYXB0aW9uJyxcclxuICAgICAgICAgICAgJy5zZWN0aW9uLWhlYWRlcicsXHJcbiAgICAgICAgICAgICcuZ3JvdXAtaGVhZGVyJyxcclxuICAgICAgICAgICAgJy5mYXN0dGFiLWhlYWRlcicsXHJcbiAgICAgICAgICAgICdbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdJyxcclxuICAgICAgICAgICAgJ2J1dHRvblthcmlhLWV4cGFuZGVkXSBzcGFuJyxcclxuICAgICAgICAgICAgJ2J1dHRvbiBzcGFuJyxcclxuICAgICAgICAgICAgJy5jYXB0aW9uJyxcclxuICAgICAgICAgICAgJ2xlZ2VuZCdcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgaGVhZGVyU2VsZWN0b3JzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBoZWFkZXIudGV4dENvbnRlbnQ/LnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgYXJpYS1sYWJlbFxyXG4gICAgICAgIGNvbnN0IGFyaWFMYWJlbCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XHJcbiAgICAgICAgaWYgKGFyaWFMYWJlbCkgcmV0dXJuIGFyaWFMYWJlbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgdGhlIGJ1dHRvbidzIHRleHQgaWYgdGhlIHNlY3Rpb24gaGFzIGEgdG9nZ2xlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IHRvZ2dsZUJ0biA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignYnV0dG9uJyk7XHJcbiAgICAgICAgaWYgKHRvZ2dsZUJ0bikge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdG9nZ2xlQnRuLnRleHRDb250ZW50Py50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0ICYmIHRleHQubGVuZ3RoIDwgMTAwKSByZXR1cm4gdGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgZWxlbWVudCBpcyB2aXNpYmxlXHJcbiAgICBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQpIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudC5vZmZzZXRQYXJlbnQgIT09IG51bGwgJiYgXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nICYmXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgIT09ICdub25lJztcclxuICAgIH1cclxuXHJcbiAgICAvLyBTdGFydCBpbnRlcmFjdGl2ZSBlbGVtZW50IHBpY2tlclxyXG4gICAgc3RhcnRFbGVtZW50UGlja2VyKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgdGhpcy5pc0luc3BlY3RpbmcgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMucGlja2VyQ2FsbGJhY2sgPSBjYWxsYmFjaztcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIG92ZXJsYXlcclxuICAgICAgICB0aGlzLm92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLm92ZXJsYXkuc3R5bGUuY3NzVGV4dCA9IGBcclxuICAgICAgICAgICAgcG9zaXRpb246IGZpeGVkO1xyXG4gICAgICAgICAgICB0b3A6IDA7XHJcbiAgICAgICAgICAgIGxlZnQ6IDA7XHJcbiAgICAgICAgICAgIHdpZHRoOiAxMDAlO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IDEwMCU7XHJcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcclxuICAgICAgICAgICAgei1pbmRleDogOTk5OTk4O1xyXG4gICAgICAgICAgICBjdXJzb3I6IGNyb3NzaGFpcjtcclxuICAgICAgICBgO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5vdmVybGF5KTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGhpZ2hsaWdodCBlbGVtZW50XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLmNzc1RleHQgPSBgXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgICAgICAgICAgYm9yZGVyOiAycHggc29saWQgIzY2N2VlYTtcclxuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xyXG4gICAgICAgICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcclxuICAgICAgICAgICAgei1pbmRleDogOTk5OTk5O1xyXG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4xcyBlYXNlO1xyXG4gICAgICAgIGA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXJzXHJcbiAgICAgICAgdGhpcy5tb3VzZU1vdmVIYW5kbGVyID0gKGUpID0+IHRoaXMuaGFuZGxlTW91c2VNb3ZlKGUpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tIYW5kbGVyID0gKGUpID0+IHRoaXMuaGFuZGxlQ2xpY2soZSk7XHJcbiAgICAgICAgdGhpcy5lc2NhcGVIYW5kbGVyID0gKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgdGhpcy5zdG9wRWxlbWVudFBpY2tlcigpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2VNb3ZlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuZXNjYXBlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlTW91c2VNb3ZlKGUpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcclxuICAgICAgICBpZiAoIXRhcmdldCB8fCB0YXJnZXQgPT09IHRoaXMub3ZlcmxheSB8fCB0YXJnZXQgPT09IHRoaXMuaGlnaGxpZ2h0RWxlbWVudCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGNsb3Nlc3QgRDM2NSBjb250cm9sXHJcbiAgICAgICAgY29uc3QgY29udHJvbCA9IHRhcmdldC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XHJcbiAgICAgICAgaWYgKCFjb250cm9sKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmhpZ2hsaWdodEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEVuc3VyZSBoaWdobGlnaHQgZWxlbWVudCBleGlzdHNcclxuICAgICAgICBpZiAoIXRoaXMuaGlnaGxpZ2h0RWxlbWVudCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBIaWdobGlnaHQgdGhlIGVsZW1lbnRcclxuICAgICAgICBjb25zdCByZWN0ID0gY29udHJvbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICB0aGlzLmhpZ2hsaWdodEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnN0eWxlLnRvcCA9IHJlY3QudG9wICsgd2luZG93LnNjcm9sbFkgKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5sZWZ0ID0gcmVjdC5sZWZ0ICsgd2luZG93LnNjcm9sbFggKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS53aWR0aCA9IHJlY3Qud2lkdGggKyAncHgnO1xyXG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5zdHlsZS5oZWlnaHQgPSByZWN0LmhlaWdodCArICdweCc7XHJcblxyXG4gICAgICAgIC8vIFNob3cgdG9vbHRpcFxyXG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50LnNldEF0dHJpYnV0ZSgndGl0bGUnLCBgJHtyb2xlfTogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVDbGljayhlKSB7XHJcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xyXG4gICAgICAgIGNvbnN0IGNvbnRyb2wgPSB0YXJnZXQ/LmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xyXG4gICAgICAgICAgICBjb25zdCByb2xlID0gY29udHJvbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRoaXMuZ2V0RWxlbWVudFRleHQoY29udHJvbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBlbGVtZW50SW5mbyA9IHtcclxuICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSxcclxuICAgICAgICAgICAgICAgIHJvbGU6IHJvbGUsXHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5VGV4dDogdGV4dCxcclxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBpZiAocm9sZSA9PT0gJ0lucHV0JyB8fCByb2xlID09PSAnTXVsdGlsaW5lSW5wdXQnIHx8IHJvbGUgPT09ICdDb21ib0JveCcpIHtcclxuICAgICAgICAgICAgICAgIGVsZW1lbnRJbmZvLmZpZWxkVHlwZSA9IHRoaXMuZGV0ZWN0RmllbGRUeXBlKGNvbnRyb2wpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBpY2tlckNhbGxiYWNrKGVsZW1lbnRJbmZvKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc3RvcEVsZW1lbnRQaWNrZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBzdG9wRWxlbWVudFBpY2tlcigpIHtcclxuICAgICAgICB0aGlzLmlzSW5zcGVjdGluZyA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLm92ZXJsYXkpIHtcclxuICAgICAgICAgICAgdGhpcy5vdmVybGF5LnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLm92ZXJsYXkgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5oaWdobGlnaHRFbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0RWxlbWVudC5yZW1vdmUoKTtcclxuICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRFbGVtZW50ID0gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW91c2VNb3ZlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuZXNjYXBlSGFuZGxlciwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2VhcmNoIGVsZW1lbnRzIGJ5IHRleHRcclxuICAgIGZpbmRFbGVtZW50QnlUZXh0KHRleHQsIGVsZW1lbnRUeXBlID0gbnVsbCkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gdGhpcy5kaXNjb3ZlckVsZW1lbnRzKCk7XHJcbiAgICAgICAgY29uc3Qgc2VhcmNoVGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKS50cmltKCk7XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50cy5maWx0ZXIoZWwgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZWxlbWVudFR5cGUgJiYgZWwudHlwZSAhPT0gZWxlbWVudFR5cGUpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlUZXh0ID0gZWwuZGlzcGxheVRleHQudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgYXJpYUxhYmVsID0gKGVsLmFyaWFMYWJlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5jb250cm9sTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIGRpc3BsYXlUZXh0LmluY2x1ZGVzKHNlYXJjaFRleHQpIHx8XHJcbiAgICAgICAgICAgICAgICAgICBhcmlhTGFiZWwuaW5jbHVkZXMoc2VhcmNoVGV4dCkgfHxcclxuICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lLmluY2x1ZGVzKHNlYXJjaFRleHQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBFeHBvcnQgZm9yIHVzZSBpbiBjb250ZW50IHNjcmlwdFxyXG4iLCAiZXhwb3J0IGZ1bmN0aW9uIHNlbmRMb2cobGV2ZWwsIG1lc3NhZ2UpIHtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19MT0cnLFxuICAgICAgICBsb2c6IHsgbGV2ZWwsIG1lc3NhZ2UgfVxuICAgIH0sICcqJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2dTdGVwKG1lc3NhZ2UpIHtcbiAgICBzZW5kTG9nKCdpbmZvJywgbWVzc2FnZSk7XG4gICAgY29uc29sZS5sb2coJ1tEMzY1IEF1dG9tYXRpb25dJywgbWVzc2FnZSk7XG59XG4iLCAiZXhwb3J0IGZ1bmN0aW9uIHNsZWVwKG1zKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKSB7XG4gICAgY29uc3QgaXNUZXh0QXJlYSA9IGlucHV0LnRhZ05hbWUgPT09ICdURVhUQVJFQSc7XG4gICAgY29uc3QgZGVzY3JpcHRvciA9IGlzVGV4dEFyZWFcbiAgICAgICAgPyBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MVGV4dEFyZWFFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJylcbiAgICAgICAgOiBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHdpbmRvdy5IVE1MSW5wdXRFbGVtZW50LnByb3RvdHlwZSwgJ3ZhbHVlJyk7XG5cbiAgICBpZiAoZGVzY3JpcHRvciAmJiBkZXNjcmlwdG9yLnNldCkge1xuICAgICAgICBkZXNjcmlwdG9yLnNldC5jYWxsKGlucHV0LCB2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaW5wdXQudmFsdWUgPSB2YWx1ZTtcbiAgICB9XG59XG4iLCAiZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVRleHQodmFsdWUpIHtcclxuICAgIHJldHVybiBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb3dlckNhc2UoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvZXJjZUJvb2xlYW4odmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuIHZhbHVlO1xyXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiB2YWx1ZSAhPT0gMCAmJiAhTnVtYmVyLmlzTmFOKHZhbHVlKTtcclxuXHJcbiAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dCh2YWx1ZSk7XHJcbiAgICBpZiAodGV4dCA9PT0gJycpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoWyd0cnVlJywgJzEnLCAneWVzJywgJ3knLCAnb24nLCAnY2hlY2tlZCddLmluY2x1ZGVzKHRleHQpKSByZXR1cm4gdHJ1ZTtcclxuICAgIGlmIChbJ2ZhbHNlJywgJzAnLCAnbm8nLCAnbicsICdvZmYnLCAndW5jaGVja2VkJ10uaW5jbHVkZXModGV4dCkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuIiwgImV4cG9ydCBmdW5jdGlvbiBnZXRXb3JrZmxvd0Vycm9yRGVmYXVsdHMoc2V0dGluZ3MpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBtb2RlOiBzZXR0aW5ncz8uZXJyb3JEZWZhdWx0TW9kZSB8fCAnZmFpbCcsXG4gICAgICAgIHJldHJ5Q291bnQ6IE51bWJlci5pc0Zpbml0ZShzZXR0aW5ncz8uZXJyb3JEZWZhdWx0UmV0cnlDb3VudCkgPyBzZXR0aW5ncy5lcnJvckRlZmF1bHRSZXRyeUNvdW50IDogMCxcbiAgICAgICAgcmV0cnlEZWxheTogTnVtYmVyLmlzRmluaXRlKHNldHRpbmdzPy5lcnJvckRlZmF1bHRSZXRyeURlbGF5KSA/IHNldHRpbmdzLmVycm9yRGVmYXVsdFJldHJ5RGVsYXkgOiAxMDAwLFxuICAgICAgICBnb3RvTGFiZWw6IHNldHRpbmdzPy5lcnJvckRlZmF1bHRHb3RvTGFiZWwgfHwgJydcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RlcEVycm9yQ29uZmlnKHN0ZXAsIHNldHRpbmdzKSB7XG4gICAgY29uc3QgZGVmYXVsdHMgPSBnZXRXb3JrZmxvd0Vycm9yRGVmYXVsdHMoc2V0dGluZ3MpO1xuICAgIGNvbnN0IG1vZGUgPSBzdGVwPy5vbkVycm9yTW9kZSAmJiBzdGVwLm9uRXJyb3JNb2RlICE9PSAnZGVmYXVsdCcgPyBzdGVwLm9uRXJyb3JNb2RlIDogZGVmYXVsdHMubW9kZTtcbiAgICBjb25zdCByZXRyeUNvdW50ID0gTnVtYmVyLmlzRmluaXRlKHN0ZXA/Lm9uRXJyb3JSZXRyeUNvdW50KSA/IHN0ZXAub25FcnJvclJldHJ5Q291bnQgOiBkZWZhdWx0cy5yZXRyeUNvdW50O1xuICAgIGNvbnN0IHJldHJ5RGVsYXkgPSBOdW1iZXIuaXNGaW5pdGUoc3RlcD8ub25FcnJvclJldHJ5RGVsYXkpID8gc3RlcC5vbkVycm9yUmV0cnlEZWxheSA6IGRlZmF1bHRzLnJldHJ5RGVsYXk7XG4gICAgY29uc3QgZ290b0xhYmVsID0gc3RlcD8ub25FcnJvckdvdG9MYWJlbCB8fCBkZWZhdWx0cy5nb3RvTGFiZWw7XG4gICAgcmV0dXJuIHsgbW9kZSwgcmV0cnlDb3VudCwgcmV0cnlEZWxheSwgZ290b0xhYmVsIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9vcFBhaXJzKHN0ZXBzTGlzdCwgb25Jc3N1ZSA9ICgpID0+IHt9KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbXTtcbiAgICBjb25zdCBwYWlycyA9IFtdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN0ZXBzTGlzdFtpXTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnR5cGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdsb29wLXN0YXJ0Jykge1xuICAgICAgICAgICAgc3RhY2sucHVzaCh7IHN0YXJ0SW5kZXg6IGksIGlkOiBzLmlkIH0pO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocy50eXBlICE9PSAnbG9vcC1lbmQnKSBjb250aW51ZTtcblxuICAgICAgICBsZXQgbWF0Y2hlZCA9IG51bGw7XG4gICAgICAgIGlmIChzLmxvb3BSZWYpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGogPSBzdGFjay5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFja1tqXS5pZCA9PT0gcy5sb29wUmVmKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZWQgPSB7IHN0YXJ0SW5kZXg6IHN0YWNrW2pdLnN0YXJ0SW5kZXgsIGVuZEluZGV4OiBpIH07XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnNwbGljZShqLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFtYXRjaGVkKSB7XG4gICAgICAgICAgICBjb25zdCBsYXN0ID0gc3RhY2sucG9wKCk7XG4gICAgICAgICAgICBpZiAobGFzdCkge1xuICAgICAgICAgICAgICAgIG1hdGNoZWQgPSB7IHN0YXJ0SW5kZXg6IGxhc3Quc3RhcnRJbmRleCwgZW5kSW5kZXg6IGkgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb25Jc3N1ZShgVW5tYXRjaGVkIGxvb3AtZW5kIGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtYXRjaGVkKSBwYWlycy5wdXNoKG1hdGNoZWQpO1xuICAgIH1cblxuICAgIGlmIChzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChjb25zdCByZW0gb2Ygc3RhY2spIHtcbiAgICAgICAgICAgIG9uSXNzdWUoYFVuY2xvc2VkIGxvb3Atc3RhcnQgYXQgaW5kZXggJHtyZW0uc3RhcnRJbmRleH1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhaXJzLnNvcnQoKGEsIGIpID0+IGEuc3RhcnRJbmRleCAtIGIuc3RhcnRJbmRleCk7XG4gICAgcmV0dXJuIHBhaXJzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZElmUGFpcnMoc3RlcHNMaXN0LCBvbklzc3VlID0gKCkgPT4ge30pIHtcbiAgICBjb25zdCBzdGFjayA9IFtdO1xuICAgIGNvbnN0IGlmVG9FbHNlID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGlmVG9FbmQgPSBuZXcgTWFwKCk7XG4gICAgY29uc3QgZWxzZVRvRW5kID0gbmV3IE1hcCgpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN0ZXBzTGlzdFtpXTtcbiAgICAgICAgaWYgKCFzIHx8ICFzLnR5cGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdpZi1zdGFydCcpIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goeyBpZkluZGV4OiBpLCBlbHNlSW5kZXg6IG51bGwgfSk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzLnR5cGUgPT09ICdlbHNlJykge1xuICAgICAgICAgICAgaWYgKHN0YWNrLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG9uSXNzdWUoYEVsc2Ugd2l0aG91dCBtYXRjaGluZyBpZi1zdGFydCBhdCBpbmRleCAke2l9YCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHRvcCA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgaWYgKHRvcC5lbHNlSW5kZXggPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICB0b3AuZWxzZUluZGV4ID0gaTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb25Jc3N1ZShgTXVsdGlwbGUgZWxzZSBibG9ja3MgZm9yIGlmLXN0YXJ0IGF0IGluZGV4ICR7dG9wLmlmSW5kZXh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzLnR5cGUgIT09ICdpZi1lbmQnKSBjb250aW51ZTtcblxuICAgICAgICBjb25zdCB0b3AgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKCF0b3ApIHtcbiAgICAgICAgICAgIG9uSXNzdWUoYElmLWVuZCB3aXRob3V0IG1hdGNoaW5nIGlmLXN0YXJ0IGF0IGluZGV4ICR7aX1gKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWZUb0VuZC5zZXQodG9wLmlmSW5kZXgsIGkpO1xuICAgICAgICBpZiAodG9wLmVsc2VJbmRleCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgaWZUb0Vsc2Uuc2V0KHRvcC5pZkluZGV4LCB0b3AuZWxzZUluZGV4KTtcbiAgICAgICAgICAgIGVsc2VUb0VuZC5zZXQodG9wLmVsc2VJbmRleCwgaSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhY2subGVuZ3RoKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmVtIG9mIHN0YWNrKSB7XG4gICAgICAgICAgICBvbklzc3VlKGBVbmNsb3NlZCBpZi1zdGFydCBhdCBpbmRleCAke3JlbS5pZkluZGV4fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgaWZUb0Vsc2UsIGlmVG9FbmQsIGVsc2VUb0VuZCB9O1xufVxuIiwgImltcG9ydCB7IG5vcm1hbGl6ZVRleHQgfSBmcm9tICcuLi91dGlscy90ZXh0LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RSb3dWYWx1ZShmaWVsZE1hcHBpbmcsIGN1cnJlbnRSb3cpIHtcbiAgICBpZiAoIWN1cnJlbnRSb3cgfHwgIWZpZWxkTWFwcGluZykgcmV0dXJuICcnO1xuICAgIGxldCB2YWx1ZSA9IGN1cnJlbnRSb3dbZmllbGRNYXBwaW5nXTtcbiAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCAmJiBmaWVsZE1hcHBpbmcuaW5jbHVkZXMoJzonKSkge1xuICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBmaWVsZE1hcHBpbmcuc3BsaXQoJzonKS5wb3AoKTtcbiAgICAgICAgdmFsdWUgPSBjdXJyZW50Um93W2ZpZWxkTmFtZV07XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCkge1xuICAgIGlmICghZWxlbWVudCkgcmV0dXJuICcnO1xuICAgIGNvbnN0IGFyaWEgPSBlbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdhcmlhLWxhYmVsJyk7XG4gICAgaWYgKGFyaWEpIHJldHVybiBhcmlhLnRyaW0oKTtcbiAgICBjb25zdCB0ZXh0ID0gZWxlbWVudC50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgIHJldHVybiB0ZXh0IHx8ICcnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWxlbWVudFZhbHVlRm9yQ29uZGl0aW9uKGVsZW1lbnQpIHtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybiAnJztcbiAgICBpZiAoJ3ZhbHVlJyBpbiBlbGVtZW50ICYmIGVsZW1lbnQudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gU3RyaW5nKGVsZW1lbnQudmFsdWUgPz8gJycpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0RWxlbWVudFRleHRGb3JDb25kaXRpb24oZWxlbWVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmFsdWF0ZUNvbmRpdGlvbihzdGVwLCBjdXJyZW50Um93LCBkZXBzID0ge30pIHtcbiAgICBjb25zdCBmaW5kRWxlbWVudCA9IGRlcHMuZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQgfHwgKCgpID0+IG51bGwpO1xuICAgIGNvbnN0IGlzVmlzaWJsZSA9IGRlcHMuaXNFbGVtZW50VmlzaWJsZSB8fCAoKCkgPT4gZmFsc2UpO1xuICAgIGNvbnN0IHR5cGUgPSBzdGVwPy5jb25kaXRpb25UeXBlIHx8ICd1aS12aXNpYmxlJztcblxuICAgIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ3VpLScpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gc3RlcD8uY29uZGl0aW9uQ29udHJvbE5hbWUgfHwgc3RlcD8uY29udHJvbE5hbWUgfHwgJyc7XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBjb250cm9sTmFtZSA/IGZpbmRFbGVtZW50KGNvbnRyb2xOYW1lKSA6IG51bGw7XG5cbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICBjYXNlICd1aS12aXNpYmxlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gISFlbGVtZW50ICYmIGlzVmlzaWJsZShlbGVtZW50KTtcbiAgICAgICAgICAgIGNhc2UgJ3VpLWhpZGRlbic6XG4gICAgICAgICAgICAgICAgcmV0dXJuICFlbGVtZW50IHx8ICFpc1Zpc2libGUoZWxlbWVudCk7XG4gICAgICAgICAgICBjYXNlICd1aS1leGlzdHMnOlxuICAgICAgICAgICAgICAgIHJldHVybiAhIWVsZW1lbnQ7XG4gICAgICAgICAgICBjYXNlICd1aS1ub3QtZXhpc3RzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gIWVsZW1lbnQ7XG4gICAgICAgICAgICBjYXNlICd1aS10ZXh0LWVxdWFscyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdGV4dC1jb250YWlucyc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWwgPSBub3JtYWxpemVUZXh0KGdldEVsZW1lbnRUZXh0Rm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdmFsdWUtZXF1YWxzJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdHVhbCA9IG5vcm1hbGl6ZVRleHQoZ2V0RWxlbWVudFZhbHVlRm9yQ29uZGl0aW9uKGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAndWktdmFsdWUtY29udGFpbnMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChnZXRFbGVtZW50VmFsdWVGb3JDb25kaXRpb24oZWxlbWVudCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkID0gbm9ybWFsaXplVGV4dChzdGVwPy5jb25kaXRpb25WYWx1ZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbC5pbmNsdWRlcyhleHBlY3RlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ2RhdGEtJykpIHtcbiAgICAgICAgY29uc3QgZmllbGRNYXBwaW5nID0gc3RlcD8uY29uZGl0aW9uRmllbGRNYXBwaW5nIHx8ICcnO1xuICAgICAgICBjb25zdCBhY3R1YWxSYXcgPSBleHRyYWN0Um93VmFsdWUoZmllbGRNYXBwaW5nLCBjdXJyZW50Um93KTtcbiAgICAgICAgY29uc3QgYWN0dWFsID0gbm9ybWFsaXplVGV4dChhY3R1YWxSYXcpO1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQoc3RlcD8uY29uZGl0aW9uVmFsdWUgfHwgJycpO1xuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1lcXVhbHMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwgPT09IGV4cGVjdGVkO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1ub3QtZXF1YWxzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0dWFsICE9PSBleHBlY3RlZDtcbiAgICAgICAgICAgIGNhc2UgJ2RhdGEtY29udGFpbnMnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpO1xuICAgICAgICAgICAgY2FzZSAnZGF0YS1lbXB0eSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCA9PT0gJyc7XG4gICAgICAgICAgICBjYXNlICdkYXRhLW5vdC1lbXB0eSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdHVhbCAhPT0gJyc7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cbiIsICJleHBvcnQgZnVuY3Rpb24gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHtcclxuICAgIGNvbnN0IGFsbE1hdGNoZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG5cclxuICAgIGlmIChhbGxNYXRjaGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcbiAgICBpZiAoYWxsTWF0Y2hlcy5sZW5ndGggPT09IDEpIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG5cclxuICAgIC8vIE11bHRpcGxlIG1hdGNoZXMgLSBwcmVmZXIgdGhlIG9uZSBpbiB0aGUgYWN0aXZlL3RvcG1vc3QgY29udGV4dFxyXG5cclxuICAgIC8vIFByaW9yaXR5IDE6IEVsZW1lbnQgaW4gYW4gYWN0aXZlIGRpYWxvZy9tb2RhbCAoY2hpbGQgZm9ybXMpXHJcbiAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICBjb25zdCBkaWFsb2cgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXSwgLmRpYWxvZy1jb250YWluZXIsIC5mbHlvdXQtY29udGFpbmVyLCBbcm9sZT1cImRpYWxvZ1wiXScpO1xyXG4gICAgICAgIGlmIChkaWFsb2cgJiYgaXNFbGVtZW50VmlzaWJsZShkaWFsb2cpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBkaWFsb2cgY29udGV4dGApO1xyXG4gICAgICAgICAgICByZXR1cm4gZWw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDI6IEVsZW1lbnQgaW4gYSBGYXN0VGFiIG9yIFRhYlBhZ2UgdGhhdCdzIGV4cGFuZGVkL2FjdGl2ZVxyXG4gICAgZm9yIChjb25zdCBlbCBvZiBhbGxNYXRjaGVzKSB7XHJcbiAgICAgICAgY29uc3QgdGFiUGFnZSA9IGVsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXSwgLnRhYlBhZ2UnKTtcclxuICAgICAgICBpZiAodGFiUGFnZSkge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgdGFiIGlzIGV4cGFuZGVkXHJcbiAgICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPSB0YWJQYWdlLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YWJQYWdlLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXRhYlBhZ2UuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKTtcclxuICAgICAgICAgICAgaWYgKGlzRXhwYW5kZWQgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGb3VuZCAke2NvbnRyb2xOYW1lfSBpbiBleHBhbmRlZCB0YWIgY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFByaW9yaXR5IDM6IEVsZW1lbnQgaW4gdGhlIGZvcm0gY29udGV4dCB0aGF0IGhhcyBmb2N1cyBvciB3YXMgcmVjZW50bHkgaW50ZXJhY3RlZCB3aXRoXHJcbiAgICBjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcclxuICAgIGlmIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVGb3JtQ29udGV4dCA9IGFjdGl2ZUVsZW1lbnQuY2xvc2VzdCgnW2RhdGEtZHluLWZvcm0tbmFtZV0sIFtkYXRhLWR5bi1yb2xlPVwiRm9ybVwiXScpO1xyXG4gICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbE1hdGNoZXMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhY3RpdmVGb3JtQ29udGV4dC5jb250YWlucyhlbCkgJiYgaXNFbGVtZW50VmlzaWJsZShlbCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjb250cm9sTmFtZX0gaW4gYWN0aXZlIGZvcm0gY29udGV4dGApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmlvcml0eSA0OiBBbnkgdmlzaWJsZSBlbGVtZW50IChwcmVmZXIgbGF0ZXIgb25lcyBhcyB0aGV5J3JlIG9mdGVuIGluIGNoaWxkIGZvcm1zIHJlbmRlcmVkIG9uIHRvcClcclxuICAgIGNvbnN0IHZpc2libGVNYXRjaGVzID0gQXJyYXkuZnJvbShhbGxNYXRjaGVzKS5maWx0ZXIoZWwgPT4gaXNFbGVtZW50VmlzaWJsZShlbCkpO1xyXG4gICAgaWYgKHZpc2libGVNYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAvLyBSZXR1cm4gdGhlIGxhc3QgdmlzaWJsZSBtYXRjaCAob2Z0ZW4gdGhlIGNoaWxkIGZvcm0ncyBlbGVtZW50KVxyXG4gICAgICAgIHJldHVybiB2aXNpYmxlTWF0Y2hlc1t2aXNpYmxlTWF0Y2hlcy5sZW5ndGggLSAxXTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGYWxsYmFjazogZmlyc3QgbWF0Y2hcclxuICAgIHJldHVybiBhbGxNYXRjaGVzWzBdO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZShlbCkge1xyXG4gICAgaWYgKCFlbCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XHJcbiAgICByZXR1cm4gcmVjdC53aWR0aCA+IDAgJiZcclxuICAgICAgICAgICByZWN0LmhlaWdodCA+IDAgJiZcclxuICAgICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScgJiZcclxuICAgICAgICAgICBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgIHN0eWxlLm9wYWNpdHkgIT09ICcwJztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRDM2NUxvYWRpbmcoKSB7XHJcbiAgICAvLyBDaGVjayBmb3IgY29tbW9uIEQzNjUgbG9hZGluZyBpbmRpY2F0b3JzXHJcbiAgICBjb25zdCBsb2FkaW5nU2VsZWN0b3JzID0gW1xyXG4gICAgICAgICcuZHluLWxvYWRpbmctb3ZlcmxheTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1sb2FkaW5nLWluZGljYXRvcjpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyxcclxuICAgICAgICAnLmR5bi1zcGlubmVyOm5vdChbc3R5bGUqPVwiZGlzcGxheTogbm9uZVwiXSknLFxyXG4gICAgICAgICcubG9hZGluZy1pbmRpY2F0b3I6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJy5keW4tbWVzc2FnZUJ1c3k6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1sb2FkaW5nPVwidHJ1ZVwiXScsXHJcbiAgICAgICAgJy5idXN5LWluZGljYXRvcicsXHJcbiAgICAgICAgJy5keW4tbG9hZGluZ1N0dWI6bm90KFtzdHlsZSo9XCJkaXNwbGF5OiBub25lXCJdKSdcclxuICAgIF07XHJcblxyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBsb2FkaW5nU2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgICBpZiAoZWwgJiYgZWwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBmb3IgQUpBWCByZXF1ZXN0cyBpbiBwcm9ncmVzcyAoRDM2NSBzcGVjaWZpYylcclxuICAgIGlmICh3aW5kb3cuJGR5biAmJiB3aW5kb3cuJGR5bi5pc1Byb2Nlc3NpbmcpIHtcclxuICAgICAgICByZXR1cm4gd2luZG93LiRkeW4uaXNQcm9jZXNzaW5nKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSkge1xyXG4gICAgLy8gRmlyc3QsIHRyeSB0byBmaW5kIGluIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3cgKHRyYWRpdGlvbmFsIEQzNjUgZ3JpZHMpXHJcbiAgICBjb25zdCBzZWxlY3RlZFJvd3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnKTtcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHNlbGVjdGVkUm93cykge1xyXG4gICAgICAgIGNvbnN0IGNlbGwgPSByb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2VsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJ5IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIC0gZmluZCBhY3RpdmUgcm93XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICAvLyBMb29rIGZvciBhY3RpdmUvc2VsZWN0ZWQgcm93XHJcbiAgICAgICAgY29uc3QgYWN0aXZlUm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nKTtcclxuICAgICAgICBpZiAoYWN0aXZlUm93KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGNlbGwgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjZWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBUcnkgZmluZGluZyBpbiBib2R5IHJvd3MgLSBwcmVmZXIgdGhlIExBU1QgdmlzaWJsZSBjZWxsLlxyXG4gICAgICAgIC8vIEFmdGVyIFwiQWRkIGxpbmVcIiwgRDM2NSBhcHBlbmRzIGEgbmV3IHJvdyBhdCB0aGUgYm90dG9tLlxyXG4gICAgICAgIC8vIElmIHRoZSBhY3RpdmUtcm93IGF0dHJpYnV0ZSBoYXNuJ3QgYmVlbiBzZXQgeWV0IChyYWNlIGNvbmRpdGlvbiksXHJcbiAgICAgICAgLy8gcmV0dXJuaW5nIHRoZSBmaXJzdCBjZWxsIHdvdWxkIHRhcmdldCByb3cgMSBpbnN0ZWFkIG9mIHRoZSBuZXcgcm93LlxyXG4gICAgICAgIGNvbnN0IGJvZHlDb250YWluZXIgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoJy5maXhlZERhdGFUYWJsZUxheW91dF9ib2R5LCAuZml4ZWREYXRhVGFibGVMYXlvdXRfcm93c0NvbnRhaW5lcicpO1xyXG4gICAgICAgIGlmIChib2R5Q29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBsZXQgbGFzdFZpc2libGVDZWxsID0gbnVsbDtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGlmIGluIGhlYWRlclxyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNJbkhlYWRlciA9IGNlbGwuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlTGF5b3V0X2hlYWRlciwgLmR5bi1oZWFkZXJDZWxsJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzSW5IZWFkZXIgJiYgY2VsbC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBsYXN0VmlzaWJsZUNlbGwgPSBjZWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChsYXN0VmlzaWJsZUNlbGwpIHJldHVybiBsYXN0VmlzaWJsZUNlbGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyeSB0byBmaW5kIGluIHRyYWRpdGlvbmFsIEQzNjUgZ3JpZCBjb250ZXh0IC0gcHJlZmVyIGxhc3QgdmlzaWJsZSBjZWxsXHJcbiAgICBjb25zdCBncmlkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiR3JpZFwiXScpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIGdyaWRzKSB7XHJcbiAgICAgICAgLy8gRmluZCBhbGwgbWF0Y2hpbmcgY2VsbHMgYW5kIHByZWZlciB2aXNpYmxlL2VkaXRhYmxlIG9uZXNcclxuICAgICAgICBjb25zdCBjZWxscyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICBsZXQgbGFzdFZpc2libGVDZWxsID0gbnVsbDtcclxuICAgICAgICBmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyBpbiBhIGRhdGEgcm93IChub3QgaGVhZGVyKVxyXG4gICAgICAgICAgICBjb25zdCBpc0luSGVhZGVyID0gY2VsbC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZT1cIkNvbHVtbkhlYWRlclwiXSwgW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0sIHRoZWFkJyk7XHJcbiAgICAgICAgICAgIGlmICghaXNJbkhlYWRlciAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgbGFzdFZpc2libGVDZWxsID0gY2VsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobGFzdFZpc2libGVDZWxsKSByZXR1cm4gbGFzdFZpc2libGVDZWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIHRvIHN0YW5kYXJkIGVsZW1lbnQgZmluZGluZ1xyXG4gICAgcmV0dXJuIGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhc0xvb2t1cEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICByZXR1cm4gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2ZpZWxkLWhhc0xvb2t1cEJ1dHRvbicpIHx8XHJcbiAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubG9va3VwLWJ1dHRvbiwgW2RhdGEtZHluLXJvbGU9XCJMb29rdXBCdXR0b25cIl0nKSAhPT0gbnVsbCB8fFxyXG4gICAgICAgIGVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nPy5jbGFzc0xpc3QuY29udGFpbnMoJ2xvb2t1cC1idXR0b24nKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gWycubG9va3VwLWJ1dHRvbicsICcubG9va3VwQnV0dG9uJywgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwQnV0dG9uXCJdJ107XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgIGNvbnN0IGRpcmVjdCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGRpcmVjdCkgcmV0dXJuIGRpcmVjdDtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsZW1lbnQuY2xvc2VzdCgnLmlucHV0X2NvbnRhaW5lciwgLmZvcm0tZ3JvdXAsIC5sb29rdXBGaWVsZCcpIHx8IGVsZW1lbnQucGFyZW50RWxlbWVudDtcclxuICAgIGlmICghY29udGFpbmVyKSByZXR1cm4gbnVsbDtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgY29uc3QgaW5Db250YWluZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGluQ29udGFpbmVyKSByZXR1cm4gaW5Db250YWluZXI7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhcmlhQnV0dG9uID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblthcmlhLWxhYmVsKj1cIkxvb2t1cFwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiT3BlblwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VsZWN0XCJdJyk7XHJcbiAgICBpZiAoYXJpYUJ1dHRvbikgcmV0dXJuIGFyaWFCdXR0b247XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGVHbG9iYWwoZWxlbWVudCkge1xyXG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gZmFsc2U7XHJcbiAgICBjb25zdCBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xyXG4gICAgcmV0dXJuIGVsZW1lbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsICYmXHJcbiAgICAgICAgc3R5bGUudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwaWNrTmVhcmVzdFJvd3Mocm93cywgdGFyZ2V0RWxlbWVudCkge1xyXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkgcmV0dXJuIHJvd3M7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIGlmICghdGFyZ2V0UmVjdCkgcmV0dXJuIHJvd3M7XHJcbiAgICByZXR1cm4gcm93cy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICBjb25zdCByYSA9IGEuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgcmIgPSBiLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IGRhID0gTWF0aC5hYnMocmEubGVmdCAtIHRhcmdldFJlY3QubGVmdCkgKyBNYXRoLmFicyhyYS50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgY29uc3QgZGIgPSBNYXRoLmFicyhyYi5sZWZ0IC0gdGFyZ2V0UmVjdC5sZWZ0KSArIE1hdGguYWJzKHJiLnRvcCAtIHRhcmdldFJlY3QuYm90dG9tKTtcclxuICAgICAgICByZXR1cm4gZGEgLSBkYjtcclxuICAgIH0pO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluZExvb2t1cEZpbHRlcklucHV0KGxvb2t1cERvY2spIHtcclxuICAgIGlmICghbG9va3VwRG9jaykgcmV0dXJuIG51bGw7XHJcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gQXJyYXkuZnJvbShcclxuICAgICAgICBsb29rdXBEb2NrLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdLCBpbnB1dFtyb2xlPVwidGV4dGJveFwiXScpXHJcbiAgICApO1xyXG4gICAgaWYgKCFjYW5kaWRhdGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgLy8gUHJlZmVyIGlucHV0cyBpbnNpZGUgc2VnbWVudGVkIGVudHJ5IGZseW91dCAoTWFpbkFjY291bnQgaW5wdXQgaW4gdGhlIHJpZ2h0IHBhbmVsKVxyXG4gICAgY29uc3Qgc2VnbWVudElucHV0ID0gY2FuZGlkYXRlcy5maW5kKGlucHV0ID0+IGlucHV0LmNsb3Nlc3QoJy5zZWdtZW50ZWRFbnRyeS1mbHlvdXRTZWdtZW50JykpO1xyXG4gICAgaWYgKHNlZ21lbnRJbnB1dCkgcmV0dXJuIHNlZ21lbnRJbnB1dDtcclxuXHJcbiAgICAvLyBTb21lIGZseW91dHMgd3JhcCB0aGUgaW5wdXQgaW4gYSBjb250YWluZXI7IHRyeSB0byBmaW5kIHRoZSBhY3R1YWwgaW5wdXQgaW5zaWRlXHJcbiAgICBjb25zdCBzZWdtZW50Q29udGFpbmVyID0gbG9va3VwRG9jay5xdWVyeVNlbGVjdG9yKCcuc2VnbWVudGVkRW50cnktZmx5b3V0U2VnbWVudCAuc2VnbWVudGVkRW50cnktc2VnbWVudElucHV0Jyk7XHJcbiAgICBpZiAoc2VnbWVudENvbnRhaW5lcikge1xyXG4gICAgICAgIGNvbnN0IGlubmVyID0gc2VnbWVudENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgW3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICAgICAgaWYgKGlubmVyKSByZXR1cm4gaW5uZXI7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJlZmVyIGlucHV0cyBpbnNpZGUgZ3JpZCBoZWFkZXIvdG9vbGJhciBvciBuZWFyIHRoZSB0b3AtcmlnaHQgKGxpa2UgdGhlIG1hcmtlZCBib3gpXHJcbiAgICBjb25zdCBoZWFkZXJDYW5kaWRhdGUgPSBjYW5kaWRhdGVzLmZpbmQoaW5wdXQgPT5cclxuICAgICAgICBpbnB1dC5jbG9zZXN0KCcubG9va3VwLWhlYWRlciwgLmxvb2t1cC10b29sYmFyLCAuZ3JpZC1oZWFkZXIsIFtyb2xlPVwidG9vbGJhclwiXScpXHJcbiAgICApO1xyXG4gICAgaWYgKGhlYWRlckNhbmRpZGF0ZSkgcmV0dXJuIGhlYWRlckNhbmRpZGF0ZTtcclxuXHJcbiAgICBsZXQgYmVzdCA9IGNhbmRpZGF0ZXNbMF07XHJcbiAgICBsZXQgYmVzdFNjb3JlID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xyXG4gICAgZm9yIChjb25zdCBpbnB1dCBvZiBjYW5kaWRhdGVzKSB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IGlucHV0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IHNjb3JlID0gcmVjdC50b3AgKiAyICsgcmVjdC5sZWZ0OyAvLyBiaWFzIHRvd2FyZHMgdG9wIHJvd1xyXG4gICAgICAgIGlmIChzY29yZSA8IGJlc3RTY29yZSkge1xyXG4gICAgICAgICAgICBiZXN0U2NvcmUgPSBzY29yZTtcclxuICAgICAgICAgICAgYmVzdCA9IGlucHV0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBiZXN0O1xyXG59XHJcbiIsICJpbXBvcnQgeyBzbGVlcCB9IGZyb20gJy4vYXN5bmMuanMnO1xyXG5pbXBvcnQgeyBpc0VsZW1lbnRWaXNpYmxlR2xvYmFsLCBwaWNrTmVhcmVzdFJvd3MgfSBmcm9tICcuL2RvbS5qcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvb2t1cFBvcHVwKHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAnLmxvb2t1cC1idXR0b25Db250YWluZXInLFxyXG4gICAgICAgICcubG9va3VwRG9jay1idXR0b25Db250YWluZXInLFxyXG4gICAgICAgICdbcm9sZT1cImRpYWxvZ1wiXScsXHJcbiAgICAgICAgJy5sb29rdXAtZmx5b3V0JyxcclxuICAgICAgICAnLmxvb2t1cEZseW91dCcsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1yb2xlPVwiTG9va3VwXCJdJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJMb29rdXBHcmlkXCJdJyxcclxuICAgICAgICAnLmxvb2t1cC1jb250YWluZXInLFxyXG4gICAgICAgICcubG9va3VwJyxcclxuICAgICAgICAnW3JvbGU9XCJncmlkXCJdJyxcclxuICAgICAgICAndGFibGUnXHJcbiAgICBdO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcHVwID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmICghcG9wdXApIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAocG9wdXAuY2xhc3NMaXN0Py5jb250YWlucygnbWVzc2FnZUNlbnRlcicpKSBjb250aW51ZTtcclxuICAgICAgICAgICAgaWYgKHBvcHVwLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpID09PSAnQWN0aW9uIGNlbnRlcicpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAoIWlzRWxlbWVudFZpc2libGVHbG9iYWwocG9wdXApKSBjb250aW51ZTtcclxuICAgICAgICAgICAgcmV0dXJuIHBvcHVwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTG9va3VwUm93cyhsb29rdXBEb2NrLCB0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAzMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgbGV0IHJvd3MgPSBsb29rdXBEb2NrPy5xdWVyeVNlbGVjdG9yQWxsPy4oJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXScpIHx8IFtdO1xyXG4gICAgICAgIGlmIChyb3dzLmxlbmd0aCkgcmV0dXJuIHJvd3M7XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBmaW5kIHZpc2libGUgbG9va3VwIHJvd3MgYW55d2hlcmUgKHNvbWUgZG9ja3MgcmVuZGVyIG91dHNpZGUgdGhlIGNvbnRhaW5lcilcclxuICAgICAgICBjb25zdCBnbG9iYWxSb3dzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd0cltkYXRhLWR5bi1yb3ddLCAubG9va3VwLXJvdywgW3JvbGU9XCJyb3dcIl0nKSlcclxuICAgICAgICAgICAgLmZpbHRlcihpc0VsZW1lbnRWaXNpYmxlR2xvYmFsKTtcclxuICAgICAgICBpZiAoZ2xvYmFsUm93cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBpY2tOZWFyZXN0Um93cyhnbG9iYWxSb3dzLCB0YXJnZXRFbGVtZW50KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBbXTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCB0aW1lb3V0TXMgPSAzMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0RWxlbWVudD8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0Py4oKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBkb2NrcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmxvb2t1cERvY2stYnV0dG9uQ29udGFpbmVyJykpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbClcclxuICAgICAgICAgICAgLmZpbHRlcihkb2NrID0+ICFkb2NrLmNsYXNzTGlzdD8uY29udGFpbnMoJ21lc3NhZ2VDZW50ZXInKSk7XHJcblxyXG4gICAgICAgIGlmIChkb2Nrcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3Qgd2l0aFJvd3MgPSBkb2Nrcy5maWx0ZXIoZG9jayA9PiBkb2NrLnF1ZXJ5U2VsZWN0b3IoJ3RyW2RhdGEtZHluLXJvd10sIC5sb29rdXAtcm93LCBbcm9sZT1cInJvd1wiXSwgW3JvbGU9XCJncmlkXCJdLCB0YWJsZScpKTtcclxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IHdpdGhSb3dzLmxlbmd0aCA/IHdpdGhSb3dzIDogZG9ja3M7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlc3QgPSBwaWNrTmVhcmVzdERvY2soY2FuZGlkYXRlcywgdGFyZ2V0UmVjdCk7XHJcbiAgICAgICAgICAgIGlmIChiZXN0KSByZXR1cm4gYmVzdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcGlja05lYXJlc3REb2NrKGRvY2tzLCB0YXJnZXRSZWN0KSB7XHJcbiAgICBpZiAoIWRvY2tzLmxlbmd0aCkgcmV0dXJuIG51bGw7XHJcbiAgICBpZiAoIXRhcmdldFJlY3QpIHJldHVybiBkb2Nrc1swXTtcclxuICAgIGxldCBiZXN0ID0gZG9ja3NbMF07XHJcbiAgICBsZXQgYmVzdFNjb3JlID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xyXG4gICAgZm9yIChjb25zdCBkb2NrIG9mIGRvY2tzKSB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IGRvY2suZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgZHggPSBNYXRoLmFicyhyZWN0LmxlZnQgLSB0YXJnZXRSZWN0LmxlZnQpO1xyXG4gICAgICAgIGNvbnN0IGR5ID0gTWF0aC5hYnMocmVjdC50b3AgLSB0YXJnZXRSZWN0LmJvdHRvbSk7XHJcbiAgICAgICAgY29uc3Qgc2NvcmUgPSBkeCArIGR5O1xyXG4gICAgICAgIGlmIChzY29yZSA8IGJlc3RTY29yZSkge1xyXG4gICAgICAgICAgICBiZXN0U2NvcmUgPSBzY29yZTtcclxuICAgICAgICAgICAgYmVzdCA9IGRvY2s7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGJlc3Q7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTGlzdGJveEZvckVsZW1lbnQodGFyZ2V0RWxlbWVudCwgdGltZW91dE1zID0gMjAwMCkge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gWydbcm9sZT1cImxpc3Rib3hcIl0nLCAnLmRyb3BEb3duTGlzdCcsICcuY29tYm9Cb3hEcm9wRG93bicsICcuZHJvcGRvd24tbWVudScsICcuZHJvcGRvd24tbGlzdCddO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRhcmdldEVsZW1lbnQ/LmdldEJvdW5kaW5nQ2xpZW50UmVjdD8uKCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XHJcbiAgICAgICAgY29uc3QgbGlzdHMgPSBzZWxlY3RvcnMuZmxhdE1hcChzZWwgPT4gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHNlbCkpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGlzRWxlbWVudFZpc2libGVHbG9iYWwpO1xyXG4gICAgICAgIGlmIChsaXN0cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBpY2tOZWFyZXN0RG9jayhsaXN0cywgdGFyZ2V0UmVjdCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIHRhcmdldEVsZW1lbnQsIHRpbWVvdXRNcyA9IDIwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICBjb25zdCBsaW5rZWQgPSBnZXRMaXN0Ym94RnJvbUlucHV0KGlucHV0KTtcclxuICAgICAgICBpZiAobGlua2VkICYmIGlzRWxlbWVudFZpc2libGVHbG9iYWwobGlua2VkKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gbGlua2VkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBmYWxsYmFjayA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9yRWxlbWVudCh0YXJnZXRFbGVtZW50LCAyMDApO1xyXG4gICAgICAgIGlmIChmYWxsYmFjaykgcmV0dXJuIGZhbGxiYWNrO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3Rib3hGcm9tSW5wdXQoaW5wdXQpIHtcclxuICAgIGlmICghaW5wdXQpIHJldHVybiBudWxsO1xyXG4gICAgY29uc3QgaWQgPSBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnKSB8fCBpbnB1dC5nZXRBdHRyaWJ1dGUoJ2FyaWEtb3ducycpO1xyXG4gICAgaWYgKGlkKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XHJcbiAgICAgICAgaWYgKGVsKSByZXR1cm4gZWw7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhY3RpdmVJZCA9IGlucHV0LmdldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jyk7XHJcbiAgICBpZiAoYWN0aXZlSWQpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVJZCk7XHJcbiAgICAgICAgY29uc3QgbGlzdCA9IGFjdGl2ZT8uY2xvc2VzdD8uKCdbcm9sZT1cImxpc3Rib3hcIl0nKTtcclxuICAgICAgICBpZiAobGlzdCkgcmV0dXJuIGxpc3Q7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb21ib0JveEJ1dHRvbihlbGVtZW50KSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJy5sb29rdXBCdXR0b24nLFxyXG4gICAgICAgICcuY29tYm9Cb3gtYnV0dG9uJyxcclxuICAgICAgICAnLmNvbWJvQm94LWRyb3BEb3duQnV0dG9uJyxcclxuICAgICAgICAnLmRyb3Bkb3duQnV0dG9uJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJEcm9wRG93bkJ1dHRvblwiXScsXHJcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIk9wZW5cIl0nLFxyXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJTZWxlY3RcIl0nXHJcbiAgICBdO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBidG4gPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICAgIGlmIChidG4pIHJldHVybiBidG47XHJcbiAgICB9XHJcbiAgICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50LmNsb3Nlc3QoJy5pbnB1dF9jb250YWluZXIsIC5mb3JtLWdyb3VwJykgfHwgZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybiBudWxsO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBjb25zdCBidG4gPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGJ0bikgcmV0dXJuIGJ0bjtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29sbGVjdENvbWJvT3B0aW9ucyhsaXN0Ym94KSB7XHJcbiAgICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICAgICAgJ1tyb2xlPVwib3B0aW9uXCJdJyxcclxuICAgICAgICAnLmNvbWJvQm94LWxpc3RJdGVtJyxcclxuICAgICAgICAnLmNvbWJvQm94LWl0ZW0nLFxyXG4gICAgICAgICdsaScsXHJcbiAgICAgICAgJy5kcm9wZG93bi1saXN0LWl0ZW0nLFxyXG4gICAgICAgICcuY29tYm9Cb3hJdGVtJyxcclxuICAgICAgICAnLmRyb3BEb3duTGlzdEl0ZW0nLFxyXG4gICAgICAgICcuZHJvcGRvd24taXRlbSdcclxuICAgIF07XHJcbiAgICBjb25zdCBmb3VuZCA9IFtdO1xyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgICBsaXN0Ym94LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50VmlzaWJsZUdsb2JhbChlbCkpIGZvdW5kLnB1c2goZWwpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvdW5kLmxlbmd0aCA/IGZvdW5kIDogQXJyYXkuZnJvbShsaXN0Ym94LmNoaWxkcmVuKS5maWx0ZXIoaXNFbGVtZW50VmlzaWJsZUdsb2JhbCk7XHJcbn1cclxuIiwgImltcG9ydCB7IHNsZWVwLCBzZXROYXRpdmVWYWx1ZSB9IGZyb20gJy4vYXN5bmMuanMnO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHR5cGVWYWx1ZVNsb3dseShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgaW5wdXQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gVHlwZSBjaGFyYWN0ZXIgYnkgY2hhcmFjdGVyXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBidWZmZXIpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MCk7IC8vIDgwbXMgcGVyIGNoYXJhY3RlclxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmJsdXIoKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7IC8vIFdhaXQgZm9yIHZhbGlkYXRpb25cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHR5cGVWYWx1ZVdpdGhJbnB1dEV2ZW50cyhpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlmICh0eXBlb2YgaW5wdXQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJyk7XHJcbiAgICBsZXQgYnVmZmVyID0gJyc7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY2hhciA9IHN0cmluZ1ZhbHVlW2ldO1xyXG4gICAgICAgIGJ1ZmZlciArPSBjaGFyO1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCBidWZmZXIpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogY2hhciwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7IGRhdGE6IGNoYXIsIGlucHV0VHlwZTogJ2luc2VydFRleHQnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiBjaGFyLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvcklucHV0VmFsdWUoaW5wdXQsIHZhbHVlLCB0aW1lb3V0TXMgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBleHBlY3RlZCA9IFN0cmluZyh2YWx1ZSA/PyAnJykudHJpbSgpO1xyXG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSBTdHJpbmcoaW5wdXQ/LnZhbHVlID8/ICcnKS50cmltKCk7XHJcbiAgICAgICAgaWYgKGN1cnJlbnQgPT09IGV4cGVjdGVkKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0VmFsdWVPbmNlKGlucHV0LCB2YWx1ZSwgY2xlYXJGaXJzdCA9IGZhbHNlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIGlmIChjbGVhckZpcnN0KSB7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsICcnKTtcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuICAgIH1cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZXhwZWN0ZWQgPSBTdHJpbmcodmFsdWUgPz8gJycpLnRyaW0oKTtcclxuICAgIGF3YWl0IHNldFZhbHVlT25jZShpbnB1dCwgdmFsdWUsIHRydWUpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIGlmIChTdHJpbmcoaW5wdXQudmFsdWUgPz8gJycpLnRyaW0oKSAhPT0gZXhwZWN0ZWQpIHtcclxuICAgICAgICBhd2FpdCB0eXBlVmFsdWVTbG93bHkoaW5wdXQsIGV4cGVjdGVkKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gPT09PT09PT09PT09IDggQ29tYm9Cb3ggSW5wdXQgTWV0aG9kcyA9PT09PT09PT09PT1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMTogQmFzaWMgc2V0VmFsdWUgKGZhc3QgYnV0IG1heSBub3QgdHJpZ2dlciBEMzY1IGZpbHRlcmluZylcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kMShpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgMjogUGFzdGUgc2ltdWxhdGlvbiB3aXRoIElucHV0RXZlbnRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kMihpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIENsZWFyIGZpcnN0XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gU2ltdWxhdGUgcGFzdGVcclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdiZWZvcmVpbnB1dCcsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbVBhc3RlJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRGcm9tUGFzdGUnLFxyXG4gICAgICAgIGRhdGE6IHZhbHVlXHJcbiAgICB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDM6IENoYXJhY3Rlci1ieS1jaGFyYWN0ZXIgd2l0aCBmdWxsIGtleSBldmVudHMgKFJFQ09NTUVOREVEKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2QzKGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQ2xlYXIgdGhlIGlucHV0IGZpcnN0XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBidWZmZXI7XHJcblxyXG4gICAgICAgIC8vIEZpcmUga2V5ZG93blxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhci5jaGFyQ29kZUF0KDApLFxyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBGaXJlIGJlZm9yZWlucHV0XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnYmVmb3JlaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdmFsdWVcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBpbnB1dCBldmVudFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhclxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgLy8gRmlyZSBrZXl1cFxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNDogQ2hhcmFjdGVyLWJ5LWNoYXJhY3RlciB3aXRoIGtleXByZXNzIChsZWdhY3kpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDQoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgY29uc3Qgc3RyaW5nVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xyXG4gICAgbGV0IGJ1ZmZlciA9ICcnO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoYXIgPSBzdHJpbmdWYWx1ZVtpXTtcclxuICAgICAgICBjb25zdCBjaGFyQ29kZSA9IGNoYXIuY2hhckNvZGVBdCgwKTtcclxuICAgICAgICBidWZmZXIgKz0gY2hhcjtcclxuICAgICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSBidWZmZXI7XHJcblxyXG4gICAgICAgIC8vIGtleWRvd25cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGtleXByZXNzIChkZXByZWNhdGVkIGJ1dCBzdGlsbCB1c2VkIGJ5IHNvbWUgZnJhbWV3b3JrcylcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlwcmVzcycsIHtcclxuICAgICAgICAgICAga2V5OiBjaGFyLFxyXG4gICAgICAgICAgICBjb2RlOiBnZXRLZXlDb2RlKGNoYXIpLFxyXG4gICAgICAgICAgICBrZXlDb2RlOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgY2hhckNvZGU6IGNoYXJDb2RlLFxyXG4gICAgICAgICAgICB3aGljaDogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWVcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGJlZm9yZWlucHV0XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnYmVmb3JlaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydFRleHQnLFxyXG4gICAgICAgICAgICBkYXRhOiBjaGFyXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdmFsdWVcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgLy8gaW5wdXRcclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBJbnB1dEV2ZW50KCdpbnB1dCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0VGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGNoYXJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIC8vIGtleXVwXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAgICAgIGtleTogY2hhcixcclxuICAgICAgICAgICAgY29kZTogZ2V0S2V5Q29kZShjaGFyKSxcclxuICAgICAgICAgICAga2V5Q29kZTogY2hhckNvZGUsXHJcbiAgICAgICAgICAgIHdoaWNoOiBjaGFyQ29kZSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNTogZXhlY0NvbW1hbmQgaW5zZXJ0VGV4dFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q1KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2VsZWN0IGFsbCBhbmQgZGVsZXRlXHJcbiAgICBpbnB1dC5zZWxlY3QoKTtcclxuICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdkZWxldGUnKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBJbnNlcnQgdGV4dFxyXG4gICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2luc2VydFRleHQnLCBmYWxzZSwgdmFsdWUpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgNjogUGFzdGUgKyBCYWNrc3BhY2Ugd29ya2Fyb3VuZFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJvSW5wdXRNZXRob2Q2KGlucHV0LCB2YWx1ZSkge1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gU2V0IHZhbHVlIGRpcmVjdGx5IChsaWtlIHBhc3RlKVxyXG4gICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIHZhbHVlKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbVBhc3RlJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcblxyXG4gICAgLy8gQWRkIGEgY2hhcmFjdGVyIGFuZCBkZWxldGUgaXQgdG8gdHJpZ2dlciBmaWx0ZXJpbmdcclxuICAgIGNvbnN0IHZhbHVlV2l0aEV4dHJhID0gdmFsdWUgKyAnWCc7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWVXaXRoRXh0cmEpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICBkYXRhOiAnWCdcclxuICAgIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcblxyXG4gICAgLy8gTm93IGRlbGV0ZSB0aGF0IGNoYXJhY3RlciB3aXRoIGEgcmVhbCBiYWNrc3BhY2UgZXZlbnRcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7XHJcbiAgICAgICAga2V5OiAnQmFja3NwYWNlJyxcclxuICAgICAgICBjb2RlOiAnQmFja3NwYWNlJyxcclxuICAgICAgICBrZXlDb2RlOiA4LFxyXG4gICAgICAgIHdoaWNoOiA4LFxyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIHNldE5hdGl2ZVZhbHVlKGlucHV0LCB2YWx1ZSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6ICdkZWxldGVDb250ZW50QmFja3dhcmQnXHJcbiAgICB9KSk7XHJcblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7XHJcbiAgICAgICAga2V5OiAnQmFja3NwYWNlJyxcclxuICAgICAgICBjb2RlOiAnQmFja3NwYWNlJyxcclxuICAgICAgICBrZXlDb2RlOiA4LFxyXG4gICAgICAgIHdoaWNoOiA4LFxyXG4gICAgICAgIGJ1YmJsZXM6IHRydWVcclxuICAgIH0pKTtcclxuXHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgcmV0dXJuIGlucHV0LnZhbHVlO1xyXG59XHJcblxyXG4vKipcclxuICogTWV0aG9kIDc6IEQzNjUgaW50ZXJuYWwgbWVjaGFuaXNtIHRyaWdnZXJcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21ib0lucHV0TWV0aG9kNyhpbnB1dCwgdmFsdWUpIHtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG5cclxuICAgIC8vIFNldCB2YWx1ZSB3aXRoIGZ1bGwgZXZlbnQgc2VxdWVuY2UgdXNlZCBieSBEMzY1XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDUwKTtcclxuXHJcbiAgICAvLyBUeXBlIGNoYXJhY3RlciBieSBjaGFyYWN0ZXIgYnV0IGFsc28gZGlzcGF0Y2ggb24gdGhlIHBhcmVudCBjb250cm9sXHJcbiAgICBjb25zdCBzdHJpbmdWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBpbnB1dC5jbG9zZXN0KCdbZGF0YS1keW4tcm9sZV0nKSB8fCBpbnB1dC5wYXJlbnRFbGVtZW50O1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjaGFyID0gc3RyaW5nVmFsdWVbaV07XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gaW5wdXQudmFsdWUgKyBjaGFyO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgYSBjb21wcmVoZW5zaXZlIGV2ZW50IHNldFxyXG4gICAgICAgIGNvbnN0IGtleWJvYXJkRXZlbnRJbml0ID0ge1xyXG4gICAgICAgICAgICBrZXk6IGNoYXIsXHJcbiAgICAgICAgICAgIGNvZGU6IGdldEtleUNvZGUoY2hhciksXHJcbiAgICAgICAgICAgIGtleUNvZGU6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgd2hpY2g6IGNoYXIuY2hhckNvZGVBdCgwKSxcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICAgICAgY29tcG9zZWQ6IHRydWUsXHJcbiAgICAgICAgICAgIHZpZXc6IHdpbmRvd1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIEZpcmUgb24gaW5wdXQgYW5kIHBvdGVudGlhbGx5IGJ1YmJsZSB0byBEMzY1IGhhbmRsZXJzXHJcbiAgICAgICAgY29uc3Qga2V5ZG93bkV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCBrZXlib2FyZEV2ZW50SW5pdCk7XHJcbiAgICAgICAgY29uc3Qga2V5dXBFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIGtleWJvYXJkRXZlbnRJbml0KTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChrZXlkb3duRXZlbnQpO1xyXG5cclxuICAgICAgICAvLyBTZXQgdmFsdWUgQkVGT1JFIGlucHV0IGV2ZW50XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoaW5wdXQsIGN1cnJlbnRWYWx1ZSk7XHJcblxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgICAgICBpbnB1dFR5cGU6ICdpbnNlcnRUZXh0JyxcclxuICAgICAgICAgICAgZGF0YTogY2hhcixcclxuICAgICAgICAgICAgY29tcG9zZWQ6IHRydWUsXHJcbiAgICAgICAgICAgIHZpZXc6IHdpbmRvd1xyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChrZXl1cEV2ZW50KTtcclxuXHJcbiAgICAgICAgLy8gQWxzbyBkaXNwYXRjaCBvbiBwYXJlbnQgZm9yIEQzNjUgY29udHJvbHNcclxuICAgICAgICBpZiAocGFyZW50ICYmIHBhcmVudCAhPT0gaW5wdXQpIHtcclxuICAgICAgICAgICAgcGFyZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluYWwgY2hhbmdlIGV2ZW50XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgICAvLyBUcnkgdG8gdHJpZ2dlciBEMzY1J3MgVmFsdWVDaGFuZ2VkIGNvbW1hbmRcclxuICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgICBwYXJlbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ1ZhbHVlQ2hhbmdlZCcsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgZGV0YWlsOiB7IHZhbHVlOiB2YWx1ZSB9XHJcbiAgICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXRob2QgODogQ29tcG9zaXRpb24gZXZlbnRzIChJTUUtc3R5bGUpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dE1ldGhvZDgoaW5wdXQsIHZhbHVlKSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuXHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgJycpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG5cclxuICAgIC8vIFN0YXJ0IGNvbXBvc2l0aW9uXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbnN0YXJ0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICBkYXRhOiAnJ1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnN0IHN0cmluZ1ZhbHVlID0gU3RyaW5nKHZhbHVlKTtcclxuICAgIGxldCBjdXJyZW50VmFsdWUgPSAnJztcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0cmluZ1ZhbHVlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY3VycmVudFZhbHVlICs9IHN0cmluZ1ZhbHVlW2ldO1xyXG5cclxuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KCdjb21wb3NpdGlvbnVwZGF0ZScsIHtcclxuICAgICAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICAgICAgZGF0YTogY3VycmVudFZhbHVlXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgY3VycmVudFZhbHVlKTtcclxuXHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgSW5wdXRFdmVudCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgIGlucHV0VHlwZTogJ2luc2VydENvbXBvc2l0aW9uVGV4dCcsXHJcbiAgICAgICAgICAgIGRhdGE6IGN1cnJlbnRWYWx1ZVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEVuZCBjb21wb3NpdGlvblxyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgQ29tcG9zaXRpb25FdmVudCgnY29tcG9zaXRpb25lbmQnLCB7XHJcbiAgICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IElucHV0RXZlbnQoJ2lucHV0Jywge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiAnaW5zZXJ0RnJvbUNvbXBvc2l0aW9uJyxcclxuICAgICAgICBkYXRhOiB2YWx1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG5cclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICByZXR1cm4gaW5wdXQudmFsdWU7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBIZWxwZXIgdG8gZ2V0IGtleSBjb2RlIGZyb20gY2hhcmFjdGVyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0S2V5Q29kZShjaGFyKSB7XHJcbiAgICBjb25zdCB1cHBlckNoYXIgPSBjaGFyLnRvVXBwZXJDYXNlKCk7XHJcbiAgICBpZiAodXBwZXJDaGFyID49ICdBJyAmJiB1cHBlckNoYXIgPD0gJ1onKSB7XHJcbiAgICAgICAgcmV0dXJuICdLZXknICsgdXBwZXJDaGFyO1xyXG4gICAgfVxyXG4gICAgaWYgKGNoYXIgPj0gJzAnICYmIGNoYXIgPD0gJzknKSB7XHJcbiAgICAgICAgcmV0dXJuICdEaWdpdCcgKyBjaGFyO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgc3BlY2lhbEtleXMgPSB7XHJcbiAgICAgICAgJyAnOiAnU3BhY2UnLFxyXG4gICAgICAgICctJzogJ01pbnVzJyxcclxuICAgICAgICAnPSc6ICdFcXVhbCcsXHJcbiAgICAgICAgJ1snOiAnQnJhY2tldExlZnQnLFxyXG4gICAgICAgICddJzogJ0JyYWNrZXRSaWdodCcsXHJcbiAgICAgICAgJ1xcXFwnOiAnQmFja3NsYXNoJyxcclxuICAgICAgICAnOyc6ICdTZW1pY29sb24nLFxyXG4gICAgICAgIFwiJ1wiOiAnUXVvdGUnLFxyXG4gICAgICAgICcsJzogJ0NvbW1hJyxcclxuICAgICAgICAnLic6ICdQZXJpb2QnLFxyXG4gICAgICAgICcvJzogJ1NsYXNoJyxcclxuICAgICAgICAnYCc6ICdCYWNrcXVvdGUnXHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIHNwZWNpYWxLZXlzW2NoYXJdIHx8ICdVbmlkZW50aWZpZWQnO1xyXG59XHJcblxyXG4vKipcclxuICogRGlzcGF0Y2hlciBmdW5jdGlvbiAtIHVzZXMgdGhlIHNlbGVjdGVkIGlucHV0IG1ldGhvZCBmcm9tIHNldHRpbmdzXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUsIG1ldGhvZCkge1xyXG4gICAgY29uc29sZS5sb2coYFtEMzY1XSBVc2luZyBjb21ib2JveCBpbnB1dCBtZXRob2Q6ICR7bWV0aG9kfWApO1xyXG5cclxuICAgIHN3aXRjaCAobWV0aG9kKSB7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kMSc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kMShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDInOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDIoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2QzJzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2QzKGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNCc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNChpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDUnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDUoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBjYXNlICdtZXRob2Q2JzogcmV0dXJuIGF3YWl0IGNvbWJvSW5wdXRNZXRob2Q2KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgY2FzZSAnbWV0aG9kNyc6IHJldHVybiBhd2FpdCBjb21ib0lucHV0TWV0aG9kNyhpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGNhc2UgJ21ldGhvZDgnOiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDgoaW5wdXQsIHZhbHVlKTtcclxuICAgICAgICBkZWZhdWx0OiByZXR1cm4gYXdhaXQgY29tYm9JbnB1dE1ldGhvZDMoaW5wdXQsIHZhbHVlKTsgLy8gRGVmYXVsdCB0byBtZXRob2QgM1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29tbWl0Q29tYm9WYWx1ZShpbnB1dCwgdmFsdWUsIGVsZW1lbnQpIHtcclxuICAgIGlmICghaW5wdXQpIHJldHVybjtcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2ZvY3Vzb3V0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFc2NhcGUnLCBjb2RlOiAnRXNjYXBlJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRXNjYXBlJywgY29kZTogJ0VzY2FwZScsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuYmx1cigpO1xyXG4gICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgfVxyXG4gICAgZG9jdW1lbnQuYm9keT8uY2xpY2s/LigpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGlzcGF0Y2hDbGlja1NlcXVlbmNlKHRhcmdldCkge1xyXG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcnVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIHRhcmdldC5jbGljaygpO1xyXG59XHJcbiIsICJleHBvcnQgZnVuY3Rpb24gcGFyc2VHcmlkQW5kQ29sdW1uKGNvbnRyb2xOYW1lKSB7XG4gICAgY29uc3QgdGV4dCA9IFN0cmluZyhjb250cm9sTmFtZSB8fCAnJyk7XG4gICAgY29uc3QgbGFzdFVuZGVyc2NvcmVJZHggPSB0ZXh0Lmxhc3RJbmRleE9mKCdfJyk7XG4gICAgaWYgKGxhc3RVbmRlcnNjb3JlSWR4IDw9IDAgfHwgbGFzdFVuZGVyc2NvcmVJZHggPT09IHRleHQubGVuZ3RoIC0gMSkge1xuICAgICAgICByZXR1cm4geyBncmlkTmFtZTogdGV4dCwgY29sdW1uTmFtZTogJycgfTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ3JpZE5hbWU6IHRleHQuc3Vic3RyaW5nKDAsIGxhc3RVbmRlcnNjb3JlSWR4KSxcbiAgICAgICAgY29sdW1uTmFtZTogdGV4dC5zdWJzdHJpbmcobGFzdFVuZGVyc2NvcmVJZHggKyAxKVxuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEZpbHRlckZpZWxkUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fJHtjb2x1bW5OYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Y29udHJvbE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXG4gICAgICAgIGBGaWx0ZXJGaWVsZF8ke2NvbnRyb2xOYW1lfV9JbnB1dF8wYCxcbiAgICAgICAgYEZpbHRlckZpZWxkXyR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGAsXG4gICAgICAgIGAke2NvbnRyb2xOYW1lfV9GaWx0ZXJGaWVsZF9JbnB1dGAsXG4gICAgICAgIGAke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9X0ZpbHRlckZpZWxkYFxuICAgIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMoY29udHJvbE5hbWUsIGdyaWROYW1lLCBjb2x1bW5OYW1lKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgYCR7Z3JpZE5hbWV9XyR7Y29sdW1uTmFtZX1fQXBwbHlGaWx0ZXJzYCxcbiAgICAgICAgYCR7Y29udHJvbE5hbWV9X0FwcGx5RmlsdGVyc2AsXG4gICAgICAgIGAke2dyaWROYW1lfV9BcHBseUZpbHRlcnNgLFxuICAgICAgICAnQXBwbHlGaWx0ZXJzJ1xuICAgIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWx0ZXJNZXRob2RTZWFyY2hUZXJtcyhtZXRob2QpIHtcbiAgICBjb25zdCBtZXRob2RNYXBwaW5ncyA9IHtcbiAgICAgICAgJ2lzIGV4YWN0bHknOiBbJ2lzIGV4YWN0bHknLCAnZXF1YWxzJywgJ2lzIGVxdWFsIHRvJywgJz0nXSxcbiAgICAgICAgY29udGFpbnM6IFsnY29udGFpbnMnLCAnbGlrZSddLFxuICAgICAgICAnYmVnaW5zIHdpdGgnOiBbJ2JlZ2lucyB3aXRoJywgJ3N0YXJ0cyB3aXRoJ10sXG4gICAgICAgICdpcyBub3QnOiBbJ2lzIG5vdCcsICdub3QgZXF1YWwnLCAnIT0nLCAnPD4nXSxcbiAgICAgICAgJ2RvZXMgbm90IGNvbnRhaW4nOiBbJ2RvZXMgbm90IGNvbnRhaW4nLCAnbm90IGxpa2UnXSxcbiAgICAgICAgJ2lzIG9uZSBvZic6IFsnaXMgb25lIG9mJywgJ2luJ10sXG4gICAgICAgIGFmdGVyOiBbJ2FmdGVyJywgJ2dyZWF0ZXIgdGhhbicsICc+J10sXG4gICAgICAgIGJlZm9yZTogWydiZWZvcmUnLCAnbGVzcyB0aGFuJywgJzwnXSxcbiAgICAgICAgbWF0Y2hlczogWydtYXRjaGVzJywgJ3JlZ2V4JywgJ3BhdHRlcm4nXVxuICAgIH07XG4gICAgcmV0dXJuIG1ldGhvZE1hcHBpbmdzW21ldGhvZF0gfHwgW1N0cmluZyhtZXRob2QgfHwgJycpXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRleHRJbmNsdWRlc0FueSh0ZXh0LCB0ZXJtcykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRUZXh0ID0gU3RyaW5nKHRleHQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuICh0ZXJtcyB8fCBbXSkuc29tZSh0ZXJtID0+IG5vcm1hbGl6ZWRUZXh0LmluY2x1ZGVzKFN0cmluZyh0ZXJtIHx8ICcnKS50b0xvd2VyQ2FzZSgpKSk7XG59XG4iLCAiaW1wb3J0IHsgbG9nU3RlcCB9IGZyb20gJy4uL3V0aWxzL2xvZ2dpbmcuanMnO1xyXG5pbXBvcnQgeyBzZXROYXRpdmVWYWx1ZSwgc2xlZXAgfSBmcm9tICcuLi91dGlscy9hc3luYy5qcyc7XHJcbmltcG9ydCB7IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0LCBpc0VsZW1lbnRWaXNpYmxlLCBpc0QzNjVMb2FkaW5nLCBmaW5kR3JpZENlbGxFbGVtZW50LCBoYXNMb29rdXBCdXR0b24sIGZpbmRMb29rdXBCdXR0b24sIGZpbmRMb29rdXBGaWx0ZXJJbnB1dCB9IGZyb20gJy4uL3V0aWxzL2RvbS5qcyc7XHJcbmltcG9ydCB7IHdhaXRGb3JMb29rdXBQb3B1cCwgd2FpdEZvckxvb2t1cFJvd3MsIHdhaXRGb3JMb29rdXBEb2NrRm9yRWxlbWVudCwgd2FpdEZvckxpc3Rib3hGb3JJbnB1dCwgY29sbGVjdENvbWJvT3B0aW9ucywgZmluZENvbWJvQm94QnV0dG9uIH0gZnJvbSAnLi4vdXRpbHMvbG9va3VwLmpzJztcclxuaW1wb3J0IHsgdHlwZVZhbHVlU2xvd2x5LCB0eXBlVmFsdWVXaXRoSW5wdXRFdmVudHMsIHdhaXRGb3JJbnB1dFZhbHVlLCBzZXRWYWx1ZU9uY2UsIHNldFZhbHVlV2l0aFZlcmlmeSwgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZCBhcyBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUsIGNvbW1pdENvbWJvVmFsdWUsIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZSB9IGZyb20gJy4uL3V0aWxzL2NvbWJvYm94LmpzJztcclxuaW1wb3J0IHsgY29lcmNlQm9vbGVhbiwgbm9ybWFsaXplVGV4dCB9IGZyb20gJy4uL3V0aWxzL3RleHQuanMnO1xyXG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuLi9ydW50aW1lL2Vycm9ycy5qcyc7XHJcbmltcG9ydCB7IHBhcnNlR3JpZEFuZENvbHVtbiwgYnVpbGRGaWx0ZXJGaWVsZFBhdHRlcm5zLCBidWlsZEFwcGx5QnV0dG9uUGF0dGVybnMsIGdldEZpbHRlck1ldGhvZFNlYXJjaFRlcm1zLCB0ZXh0SW5jbHVkZXNBbnkgfSBmcm9tICcuL2FjdGlvbi1oZWxwZXJzLmpzJztcclxuXHJcbmZ1bmN0aW9uIGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoaW5wdXQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGNvbnN0IG1ldGhvZCA9IGNvbWJvTWV0aG9kT3ZlcnJpZGUgfHwgd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uY29tYm9TZWxlY3RNb2RlIHx8ICdtZXRob2QzJztcclxuICAgIHJldHVybiBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kV2l0aE1vZGUoaW5wdXQsIHZhbHVlLCBtZXRob2QpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpIHtcclxuICAgIGlmICghZWxlbWVudCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIGlmIChlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnU2VnbWVudGVkRW50cnknKSByZXR1cm4gdHJ1ZTtcclxuICAgIGlmIChlbGVtZW50LmNsb3Nlc3Q/LignW2RhdGEtZHluLXJvbGU9XCJTZWdtZW50ZWRFbnRyeVwiXScpKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICBjb25zdCBjbGFzc0xpc3QgPSBlbGVtZW50LmNsYXNzTGlzdDtcclxuICAgIGlmIChjbGFzc0xpc3QgJiYgKGNsYXNzTGlzdC5jb250YWlucygnc2VnbWVudGVkRW50cnknKSB8fFxyXG4gICAgICAgIGNsYXNzTGlzdC5jb250YWlucygnc2VnbWVudGVkLWVudHJ5JykgfHxcclxuICAgICAgICBjbGFzc0xpc3QuY29udGFpbnMoJ3NlZ21lbnRlZEVudHJ5LXNlZ21lbnRJbnB1dCcpKSkge1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiAhIWVsZW1lbnQucXVlcnlTZWxlY3Rvcj8uKCcuc2VnbWVudGVkRW50cnktc2VnbWVudElucHV0LCAuc2VnbWVudGVkRW50cnktZmx5b3V0U2VnbWVudCcpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xpY2tFbGVtZW50KGNvbnRyb2xOYW1lKSB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG4gICAgaWYgKCFlbGVtZW50KSB0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgXHJcbiAgICBlbGVtZW50LmNsaWNrKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlHcmlkRmlsdGVyKGNvbnRyb2xOYW1lLCBmaWx0ZXJWYWx1ZSwgZmlsdGVyTWV0aG9kID0gJ2lzIGV4YWN0bHknLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGNvbnNvbGUubG9nKGBBcHBseWluZyBmaWx0ZXI6ICR7Y29udHJvbE5hbWV9ICR7ZmlsdGVyTWV0aG9kfSBcIiR7ZmlsdGVyVmFsdWV9XCJgKTtcclxuICAgIFxyXG4gICAgLy8gRXh0cmFjdCBncmlkIG5hbWUgYW5kIGNvbHVtbiBuYW1lIGZyb20gY29udHJvbE5hbWVcclxuICAgIC8vIEZvcm1hdDogR3JpZE5hbWVfQ29sdW1uTmFtZSAoZS5nLiwgXCJHcmlkUmVhZE9ubHlNYXJrdXBUYWJsZV9NYXJrdXBDb2RlXCIpXHJcbiAgICBjb25zdCB7IGdyaWROYW1lLCBjb2x1bW5OYW1lIH0gPSBwYXJzZUdyaWRBbmRDb2x1bW4oY29udHJvbE5hbWUpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgICBHcmlkOiAke2dyaWROYW1lfSwgQ29sdW1uOiAke2NvbHVtbk5hbWV9YCk7XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciBmdW5jdGlvbiB0byBmaW5kIGZpbHRlciBpbnB1dCB3aXRoIG11bHRpcGxlIHBhdHRlcm5zXHJcbiAgICBhc3luYyBmdW5jdGlvbiBmaW5kRmlsdGVySW5wdXQoKSB7XHJcbiAgICAgICAgLy8gRDM2NSBjcmVhdGVzIGZpbHRlciBpbnB1dHMgd2l0aCB2YXJpb3VzIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgZmlsdGVyRmllbGRQYXR0ZXJucyA9IGJ1aWxkRmlsdGVyRmllbGRQYXR0ZXJucyhjb250cm9sTmFtZSwgZ3JpZE5hbWUsIGNvbHVtbk5hbWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBmaWx0ZXJJbnB1dCA9IG51bGw7XHJcbiAgICAgICAgbGV0IGZpbHRlckZpZWxkQ29udGFpbmVyID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUcnkgZXhhY3QgcGF0dGVybnMgZmlyc3RcclxuICAgICAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgZmlsdGVyRmllbGRQYXR0ZXJucykge1xyXG4gICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7cGF0dGVybn1cIl1gKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlckZpZWxkQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBmaWx0ZXJJbnB1dCA9IGZpbHRlckZpZWxkQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWx0ZXJGaWVsZENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIGZpbHRlciBmaWVsZDogJHtwYXR0ZXJufWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRyeSBwYXJ0aWFsIG1hdGNoIG9uIEZpbHRlckZpZWxkIGNvbnRhaW5pbmcgdGhlIGNvbHVtbiBuYW1lXHJcbiAgICAgICAgY29uc3QgcGFydGlhbE1hdGNoZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl1bZGF0YS1keW4tY29udHJvbG5hbWUqPVwiJHtjb2x1bW5OYW1lfVwiXWApO1xyXG4gICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIHBhcnRpYWxNYXRjaGVzKSB7XHJcbiAgICAgICAgICAgIGZpbHRlcklucHV0ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSknKTtcclxuICAgICAgICAgICAgaWYgKGZpbHRlcklucHV0ICYmIGZpbHRlcklucHV0Lm9mZnNldFBhcmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgZmlsdGVyIGZpZWxkIChwYXJ0aWFsIG1hdGNoKTogJHtjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBjb250YWluZXIgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjazogRmluZCBhbnkgdmlzaWJsZSBmaWx0ZXIgaW5wdXQgaW4gZmlsdGVyIGRyb3Bkb3duL2ZseW91dCBhcmVhXHJcbiAgICAgICAgLy8gTG9vayBmb3IgaW5wdXRzIGluc2lkZSBmaWx0ZXItcmVsYXRlZCBjb250YWluZXJzXHJcbiAgICAgICAgY29uc3QgZmlsdGVyQ29udGFpbmVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5keW4tZmlsdGVyLXBvcHVwLCAuZmlsdGVyLXBhbmVsLCBbZGF0YS1keW4tcm9sZT1cIkZpbHRlclBhbmVcIl0sIFtjbGFzcyo9XCJmaWx0ZXJcIl0nKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNvbnRhaW5lciBvZiBmaWx0ZXJDb250YWluZXJzKSB7XHJcbiAgICAgICAgICAgIGZpbHRlcklucHV0ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSk6bm90KFtyZWFkb25seV0pJyk7XHJcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJbnB1dCAmJiBmaWx0ZXJJbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvdW5kIGZpbHRlciBpbnB1dCBpbiBmaWx0ZXIgY29udGFpbmVyYCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJJbnB1dCwgZmlsdGVyRmllbGRDb250YWluZXI6IGNvbnRhaW5lciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIExhc3QgcmVzb3J0OiBBbnkgdmlzaWJsZSBGaWx0ZXJGaWVsZCBpbnB1dFxyXG4gICAgICAgIGNvbnN0IHZpc2libGVGaWx0ZXJJbnB1dHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiRmlsdGVyRmllbGRcIl0gaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKScpO1xyXG4gICAgICAgIGZvciAoY29uc3QgaW5wIG9mIHZpc2libGVGaWx0ZXJJbnB1dHMpIHtcclxuICAgICAgICAgICAgaWYgKGlucC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGZpbHRlckZpZWxkQ29udGFpbmVyID0gaW5wLmNsb3Nlc3QoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXScpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgdmlzaWJsZSBmaWx0ZXIgZmllbGQ6ICR7ZmlsdGVyRmllbGRDb250YWluZXI/LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKX1gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpbHRlcklucHV0OiBpbnAsIGZpbHRlckZpZWxkQ29udGFpbmVyIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHsgZmlsdGVySW5wdXQ6IG51bGwsIGZpbHRlckZpZWxkQ29udGFpbmVyOiBudWxsIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZpcnN0LCBjaGVjayBpZiB0aGUgZmlsdGVyIHBhbmVsIGlzIGFscmVhZHkgb3BlblxyXG4gICAgbGV0IHsgZmlsdGVySW5wdXQsIGZpbHRlckZpZWxkQ29udGFpbmVyIH0gPSBhd2FpdCBmaW5kRmlsdGVySW5wdXQoKTtcclxuICAgIFxyXG4gICAgLy8gSWYgZmlsdGVyIGlucHV0IG5vdCBmb3VuZCwgd2UgbmVlZCB0byBjbGljayB0aGUgY29sdW1uIGhlYWRlciB0byBvcGVuIHRoZSBmaWx0ZXIgZHJvcGRvd25cclxuICAgIGlmICghZmlsdGVySW5wdXQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBGaWx0ZXIgcGFuZWwgbm90IG9wZW4sIGNsaWNraW5nIGhlYWRlciB0byBvcGVuLi4uYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmluZCB0aGUgYWN0dWFsIGhlYWRlciBjZWxsXHJcbiAgICAgICAgY29uc3QgYWxsSGVhZGVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICAgICAgbGV0IGNsaWNrVGFyZ2V0ID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IGggb2YgYWxsSGVhZGVycykge1xyXG4gICAgICAgICAgICBpZiAoaC5jbGFzc0xpc3QuY29udGFpbnMoJ2R5bi1oZWFkZXJDZWxsJykgfHwgXHJcbiAgICAgICAgICAgICAgICBoLmlkPy5pbmNsdWRlcygnaGVhZGVyJykgfHxcclxuICAgICAgICAgICAgICAgIGguY2xvc2VzdCgnLmR5bi1oZWFkZXJDZWxsJykgfHxcclxuICAgICAgICAgICAgICAgIGguY2xvc2VzdCgnW3JvbGU9XCJjb2x1bW5oZWFkZXJcIl0nKSkge1xyXG4gICAgICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBoO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IGJ5IElEIHBhdHRlcm5cclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2lkKj1cIiR7Y29udHJvbE5hbWV9XCJdW2lkKj1cImhlYWRlclwiXWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGYWxsYmFjayB0byBmaXJzdCBlbGVtZW50IHdpdGggY29udHJvbE5hbWVcclxuICAgICAgICBpZiAoIWNsaWNrVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjbGlja1RhcmdldCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZpbHRlciBjb2x1bW4gaGVhZGVyIG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg4MDApOyAvLyBXYWl0IGxvbmdlciBmb3IgZHJvcGRvd24gdG8gb3BlblxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJldHJ5IGZpbmRpbmcgdGhlIGZpbHRlciBpbnB1dCB3aXRoIGEgd2FpdCBsb29wXHJcbiAgICAgICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCAxMDsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgICAgICAgICh7IGZpbHRlcklucHV0LCBmaWx0ZXJGaWVsZENvbnRhaW5lciB9ID0gYXdhaXQgZmluZEZpbHRlcklucHV0KCkpO1xyXG4gICAgICAgICAgICBpZiAoZmlsdGVySW5wdXQpIGJyZWFrO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFmaWx0ZXJJbnB1dCkge1xyXG4gICAgICAgIC8vIERlYnVnOiBMb2cgd2hhdCBlbGVtZW50cyB3ZSBjYW4gZmluZFxyXG4gICAgICAgIGNvbnN0IGFsbEZpbHRlckZpZWxkcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJGaWVsZFwiXScpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIERlYnVnOiBGb3VuZCAke2FsbEZpbHRlckZpZWxkcy5sZW5ndGh9IEZpbHRlckZpZWxkIGVsZW1lbnRzOmApO1xyXG4gICAgICAgIGFsbEZpbHRlckZpZWxkcy5mb3JFYWNoKGVsID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgICAtICR7ZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpfSwgdmlzaWJsZTogJHtlbC5vZmZzZXRQYXJlbnQgIT09IG51bGx9YCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGaWx0ZXIgaW5wdXQgbm90IGZvdW5kLiBNYWtlIHN1cmUgdGhlIGZpbHRlciBkcm9wZG93biBpcyBvcGVuLiBFeHBlY3RlZCBwYXR0ZXJuOiBGaWx0ZXJGaWVsZF8ke2dyaWROYW1lfV8ke2NvbHVtbk5hbWV9XyR7Y29sdW1uTmFtZX1fSW5wdXRfMGApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGVwIDQ6IFNldCB0aGUgZmlsdGVyIG1ldGhvZCBpZiBub3QgXCJpcyBleGFjdGx5XCIgKGRlZmF1bHQpXHJcbiAgICBpZiAoZmlsdGVyTWV0aG9kICYmIGZpbHRlck1ldGhvZCAhPT0gJ2lzIGV4YWN0bHknKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0RmlsdGVyTWV0aG9kKGZpbHRlckZpZWxkQ29udGFpbmVyLCBmaWx0ZXJNZXRob2QpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdGVwIDU6IEVudGVyIHRoZSBmaWx0ZXIgdmFsdWVcclxuICAgIGZpbHRlcklucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgZmlsdGVySW5wdXQuc2VsZWN0KCk7XHJcbiAgICBcclxuICAgIC8vIENsZWFyIGV4aXN0aW5nIHZhbHVlIGZpcnN0XHJcbiAgICBmaWx0ZXJJbnB1dC52YWx1ZSA9ICcnO1xyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIFR5cGUgdXNpbmcgdGhlIHNlbGVjdGVkIG1ldGhvZCBzbyB0aGlzIGNhbiBiZSBvdmVycmlkZGVuIHBlciBzdGVwLlxyXG4gICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChmaWx0ZXJJbnB1dCwgU3RyaW5nKGZpbHRlclZhbHVlID8/ICcnKSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICBpZiAobm9ybWFsaXplVGV4dChmaWx0ZXJJbnB1dC52YWx1ZSkgIT09IG5vcm1hbGl6ZVRleHQoZmlsdGVyVmFsdWUpKSB7XHJcbiAgICAgICAgc2V0TmF0aXZlVmFsdWUoZmlsdGVySW5wdXQsIFN0cmluZyhmaWx0ZXJWYWx1ZSA/PyAnJykpO1xyXG4gICAgfVxyXG4gICAgZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gU3RlcCA2OiBBcHBseSB0aGUgZmlsdGVyIC0gZmluZCBhbmQgY2xpY2sgdGhlIEFwcGx5IGJ1dHRvblxyXG4gICAgLy8gSU1QT1JUQU5UOiBUaGUgcGF0dGVybiBpcyB7R3JpZE5hbWV9X3tDb2x1bW5OYW1lfV9BcHBseUZpbHRlcnMsIG5vdCBqdXN0IHtHcmlkTmFtZX1fQXBwbHlGaWx0ZXJzXHJcbiAgICBjb25zdCBhcHBseUJ0blBhdHRlcm5zID0gYnVpbGRBcHBseUJ1dHRvblBhdHRlcm5zKGNvbnRyb2xOYW1lLCBncmlkTmFtZSwgY29sdW1uTmFtZSk7XHJcbiAgICBcclxuICAgIGxldCBhcHBseUJ0biA9IG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgYXBwbHlCdG5QYXR0ZXJucykge1xyXG4gICAgICAgIGFwcGx5QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtwYXR0ZXJufVwiXWApO1xyXG4gICAgICAgIGlmIChhcHBseUJ0biAmJiBhcHBseUJ0bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRm91bmQgYXBwbHkgYnV0dG9uOiAke3BhdHRlcm59YCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmFsbGJhY2s6IGZpbmQgYW55IHZpc2libGUgQXBwbHlGaWx0ZXJzIGJ1dHRvblxyXG4gICAgaWYgKCFhcHBseUJ0biB8fCBhcHBseUJ0bi5vZmZzZXRQYXJlbnQgPT09IG51bGwpIHtcclxuICAgICAgICBjb25zdCBhbGxBcHBseUJ0bnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWUqPVwiQXBwbHlGaWx0ZXJzXCJdJyk7XHJcbiAgICAgICAgZm9yIChjb25zdCBidG4gb2YgYWxsQXBwbHlCdG5zKSB7XHJcbiAgICAgICAgICAgIGlmIChidG4ub2Zmc2V0UGFyZW50ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBhcHBseUJ0biA9IGJ0bjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoYXBwbHlCdG4pIHtcclxuICAgICAgICBhcHBseUJ0bi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBGaWx0ZXIgYXBwbGllZDogXCIke2ZpbHRlclZhbHVlfVwiYCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFRyeSBwcmVzc2luZyBFbnRlciBhcyBhbHRlcm5hdGl2ZVxyXG4gICAgICAgIGZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IFxyXG4gICAgICAgICAgICBrZXk6ICdFbnRlcicsIGtleUNvZGU6IDEzLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBmaWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsgXHJcbiAgICAgICAgICAgIGtleTogJ0VudGVyJywga2V5Q29kZTogMTMsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBGaWx0ZXIgYXBwbGllZCB2aWEgRW50ZXI6IFwiJHtmaWx0ZXJWYWx1ZX1cImApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdFVudGlsQ29uZGl0aW9uKGNvbnRyb2xOYW1lLCBjb25kaXRpb24sIGV4cGVjdGVkVmFsdWUsIHRpbWVvdXQpIHtcclxuICAgIGNvbnNvbGUubG9nKGBXYWl0aW5nIGZvcjogJHtjb250cm9sTmFtZX0gdG8gYmUgJHtjb25kaXRpb259ICh0aW1lb3V0OiAke3RpbWVvdXR9bXMpYCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICBcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDwgdGltZW91dCkge1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBjb25kaXRpb25NZXQgPSBmYWxzZTtcclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKGNvbmRpdGlvbikge1xyXG4gICAgICAgICAgICBjYXNlICd2aXNpYmxlJzpcclxuICAgICAgICAgICAgICAgIC8vIEVsZW1lbnQgZXhpc3RzIGFuZCBpcyB2aXNpYmxlIChoYXMgbGF5b3V0KVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCAmJiBlbGVtZW50Lm9mZnNldFBhcmVudCAhPT0gbnVsbCAmJiBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmRpc3BsYXkgIT09ICdub25lJztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2hpZGRlbic6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGRvZXNuJ3QgZXhpc3Qgb3IgaXMgbm90IHZpc2libGVcclxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbk1ldCA9ICFlbGVtZW50IHx8IGVsZW1lbnQub2Zmc2V0UGFyZW50ID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ID09PSAnbm9uZSc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdleGlzdHMnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBleGlzdHMgaW4gRE9NXHJcbiAgICAgICAgICAgICAgICBjb25kaXRpb25NZXQgPSBlbGVtZW50ICE9PSBudWxsO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnbm90LWV4aXN0cyc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGRvZXMgbm90IGV4aXN0IGluIERPTVxyXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gZWxlbWVudCA9PT0gbnVsbDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2VuYWJsZWQnOlxyXG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBleGlzdHMgYW5kIGlzIG5vdCBkaXNhYmxlZFxyXG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIGJ1dHRvbiwgc2VsZWN0LCB0ZXh0YXJlYScpIHx8IGVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gIWlucHV0LmRpc2FibGVkICYmICFpbnB1dC5oYXNBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ2hhcy12YWx1ZSc6XHJcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IGhhcyBhIHNwZWNpZmljIHZhbHVlXHJcbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCcpIHx8IGVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gaW5wdXQudmFsdWUgfHwgaW5wdXQudGV4dENvbnRlbnQgfHwgJyc7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uZGl0aW9uTWV0ID0gY3VycmVudFZhbHVlLnRyaW0oKSA9PT0gU3RyaW5nKGV4cGVjdGVkVmFsdWUpLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29uZGl0aW9uTWV0KSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFx1MjcxMyBDb25kaXRpb24gbWV0OiAke2NvbnRyb2xOYW1lfSBpcyAke2NvbmRpdGlvbn1gKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTsgLy8gU21hbGwgc3RhYmlsaXR5IGRlbGF5XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBUaW1lb3V0IHdhaXRpbmcgZm9yIFwiJHtjb250cm9sTmFtZX1cIiB0byBiZSAke2NvbmRpdGlvbn0gKHdhaXRlZCAke3RpbWVvdXR9bXMpYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRJbnB1dFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSwgZmllbGRUeXBlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgLy8gRm9yIFNlZ21lbnRlZEVudHJ5IGZpZWxkcyAoQWNjb3VudCwgZXRjKSwgdXNlIGxvb2t1cCBidXR0b24gYXBwcm9hY2hcclxuICAgIGlmIChmaWVsZFR5cGU/LnR5cGUgPT09ICdzZWdtZW50ZWQtbG9va3VwJyB8fCBpc1NlZ21lbnRlZEVudHJ5KGVsZW1lbnQpKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvciBDb21ib0JveC9lbnVtIGZpZWxkcywgb3BlbiBkcm9wZG93biBhbmQgc2VsZWN0XHJcbiAgICBpZiAoZmllbGRUeXBlPy5pbnB1dFR5cGUgPT09ICdlbnVtJyB8fCBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnQ29tYm9Cb3gnKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvciBSYWRpb0J1dHRvbi9GcmFtZU9wdGlvbkJ1dHRvbiBncm91cHMsIGNsaWNrIHRoZSBjb3JyZWN0IG9wdGlvblxyXG4gICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICBpZiAocm9sZSA9PT0gJ1JhZGlvQnV0dG9uJyB8fCByb2xlID09PSAnRnJhbWVPcHRpb25CdXR0b24nIHx8IGVsZW1lbnQucXVlcnlTZWxlY3RvcignW3JvbGU9XCJyYWRpb1wiXSwgaW5wdXRbdHlwZT1cInJhZGlvXCJdJykpIHtcclxuICAgICAgICBhd2FpdCBzZXRSYWRpb0J1dHRvblZhbHVlKGVsZW1lbnQsIHZhbHVlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoYElucHV0IG5vdCBmb3VuZCBpbjogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBGb2N1cyB0aGUgaW5wdXQgZmlyc3RcclxuICAgIGlucHV0LmZvY3VzKCk7XHJcbiAgICBhd2FpdCBzbGVlcCgxNTApO1xyXG5cclxuICAgIGlmIChpbnB1dC50YWdOYW1lICE9PSAnU0VMRUNUJykge1xyXG4gICAgICAgIC8vIFVzZSB0aGUgc2VsZWN0ZWQgY29tYm9ib3ggaW5wdXQgbWV0aG9kXHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChpbnB1dCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBzZXROYXRpdmVWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoNDAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEdyaWRDZWxsVmFsdWUoY29udHJvbE5hbWUsIHZhbHVlLCBmaWVsZFR5cGUsIHdhaXRGb3JWYWxpZGF0aW9uID0gZmFsc2UsIGNvbWJvTWV0aG9kT3ZlcnJpZGUgPSAnJykge1xyXG4gICAgY29uc29sZS5sb2coYFNldHRpbmcgZ3JpZCBjZWxsIHZhbHVlOiAke2NvbnRyb2xOYW1lfSA9IFwiJHt2YWx1ZX1cIiAod2FpdEZvclZhbGlkYXRpb249JHt3YWl0Rm9yVmFsaWRhdGlvbn0pYCk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIHRoZSBncmlkIHRvIGhhdmUgYW4gYWN0aXZlL3NlbGVjdGVkIHJvdyBiZWZvcmUgZmluZGluZyB0aGUgY2VsbC5cclxuICAgIC8vIEFmdGVyIFwiQWRkIGxpbmVcIiwgRDM2NSdzIFJlYWN0IGdyaWQgbWF5IHRha2UgYSBtb21lbnQgdG8gbWFyayB0aGUgbmV3IHJvd1xyXG4gICAgLy8gYXMgYWN0aXZlLiAgV2l0aG91dCB0aGlzIHdhaXQgdGhlIGZhbGxiYWNrIHNjYW4gaW4gZmluZEdyaWRDZWxsRWxlbWVudCBjYW5cclxuICAgIC8vIHJldHVybiBhIGNlbGwgZnJvbSBhIGRpZmZlcmVudCAoZWFybGllcikgcm93LCBjYXVzaW5nIGRhdGEgdG8gYmUgd3JpdHRlblxyXG4gICAgLy8gdG8gdGhlIHdyb25nIGxpbmUuXHJcbiAgICBhd2FpdCB3YWl0Rm9yQWN0aXZlR3JpZFJvdyhjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIGNlbGwgZWxlbWVudCAtIHByZWZlciB0aGUgb25lIGluIGFuIGFjdGl2ZS9zZWxlY3RlZCByb3dcclxuICAgIGxldCBlbGVtZW50ID0gZmluZEdyaWRDZWxsRWxlbWVudChjb250cm9sTmFtZSk7XHJcbiAgICBcclxuICAgIGlmICghZWxlbWVudCkge1xyXG4gICAgICAgIC8vIFRyeSBjbGlja2luZyBvbiB0aGUgZ3JpZCByb3cgZmlyc3QgdG8gYWN0aXZhdGUgaXRcclxuICAgICAgICBhd2FpdCBhY3RpdmF0ZUdyaWRSb3coY29udHJvbE5hbWUpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgZWxlbWVudCA9IGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIWVsZW1lbnQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdyaWQgY2VsbCBlbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRm9yIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzLCB3ZSBuZWVkIHRvIGNsaWNrIG9uIHRoZSBjZWxsIHRvIGVudGVyIGVkaXQgbW9kZVxyXG4gICAgLy8gRmluZCB0aGUgYWN0dWFsIGNlbGwgY29udGFpbmVyIChmaXhlZERhdGFUYWJsZUNlbGxMYXlvdXRfbWFpbilcclxuICAgIGNvbnN0IHJlYWN0Q2VsbCA9IGVsZW1lbnQuY2xvc2VzdCgnLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluJykgfHwgZWxlbWVudDtcclxuICAgIGNvbnN0IGlzUmVhY3RHcmlkID0gISFlbGVtZW50LmNsb3Nlc3QoJy5yZWFjdEdyaWQnKTtcclxuICAgIFxyXG4gICAgLy8gQ2xpY2sgb24gdGhlIGNlbGwgdG8gYWN0aXZhdGUgaXQgZm9yIGVkaXRpbmdcclxuICAgIGNvbnNvbGUubG9nKGAgIENsaWNraW5nIGNlbGwgdG8gYWN0aXZhdGU6IGlzUmVhY3RHcmlkPSR7aXNSZWFjdEdyaWR9YCk7XHJcbiAgICByZWFjdENlbGwuY2xpY2soKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICBcclxuICAgIC8vIEZvciBSZWFjdCBncmlkcywgRDM2NSByZW5kZXJzIGlucHV0IGZpZWxkcyBkeW5hbWljYWxseSBhZnRlciBjbGlja2luZ1xyXG4gICAgLy8gV2UgbmVlZCB0byByZS1maW5kIHRoZSBlbGVtZW50IGFmdGVyIGNsaWNraW5nIGFzIEQzNjUgbWF5IGhhdmUgcmVwbGFjZWQgdGhlIERPTVxyXG4gICAgaWYgKGlzUmVhY3RHcmlkKSB7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTsgLy8gRXh0cmEgd2FpdCBmb3IgUmVhY3QgdG8gcmVuZGVyIGlucHV0XHJcbiAgICAgICAgZWxlbWVudCA9IGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpO1xyXG4gICAgICAgIGlmICghZWxlbWVudCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdyaWQgY2VsbCBlbGVtZW50IG5vdCBmb3VuZCBhZnRlciBjbGljazogJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRoZSBjbGljayBzaG91bGQgYWN0aXZhdGUgdGhlIGNlbGwgLSBub3cgZmluZCB0aGUgaW5wdXRcclxuICAgIGxldCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBubyBpbnB1dCBmb3VuZCBkaXJlY3RseSwgbG9vayBpbiB0aGUgY2VsbCBjb250YWluZXJcclxuICAgIGlmICghaW5wdXQgJiYgaXNSZWFjdEdyaWQpIHtcclxuICAgICAgICBjb25zdCBjZWxsQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKTtcclxuICAgICAgICBpZiAoY2VsbENvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBpbnB1dCA9IGNlbGxDb250YWluZXIucXVlcnlTZWxlY3RvcignaW5wdXQ6bm90KFt0eXBlPVwiaGlkZGVuXCJdKSwgdGV4dGFyZWEsIHNlbGVjdCcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSWYgbm8gaW5wdXQgZm91bmQgZGlyZWN0bHksIHRyeSBnZXR0aW5nIGl0IGFmdGVyIGNsaWNrIGFjdGl2YXRpb24gd2l0aCByZXRyeVxyXG4gICAgaWYgKCFpbnB1dCkge1xyXG4gICAgICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgNTsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgIGlucHV0ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCAmJiBpbnB1dC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQWxzbyBjaGVjayBpZiBhIG5ldyBpbnB1dCBhcHBlYXJlZCBpbiB0aGUgY2VsbFxyXG4gICAgICAgICAgICBjb25zdCBjZWxsQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKTtcclxuICAgICAgICAgICAgaWYgKGNlbGxDb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgIGlucHV0ID0gY2VsbENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQgJiYgaW5wdXQub2Zmc2V0UGFyZW50ICE9PSBudWxsKSBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU3RpbGwgbm8gaW5wdXQ/IENoZWNrIGlmIHRoZSBlbGVtZW50IGl0c2VsZiBpcyBhbiBpbnB1dFxyXG4gICAgaWYgKCFpbnB1dCAmJiAoZWxlbWVudC50YWdOYW1lID09PSAnSU5QVVQnIHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJyB8fCBlbGVtZW50LnRhZ05hbWUgPT09ICdTRUxFQ1QnKSkge1xyXG4gICAgICAgIGlucHV0ID0gZWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIGZpbmQgaW5wdXQgaW4gdGhlIHBhcmVudCByb3dcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICBjb25zdCByb3cgPSBlbGVtZW50LmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluLCBbZGF0YS1keW4tcm9sZT1cIlJvd1wiXSwgW3JvbGU9XCJyb3dcIl0sIHRyJyk7XHJcbiAgICAgICAgaWYgKHJvdykge1xyXG4gICAgICAgICAgICBjb25zdCBwb3NzaWJsZUlucHV0cyA9IHJvdy5xdWVyeVNlbGVjdG9yQWxsKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSBpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pLCBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXSB0ZXh0YXJlYWApO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGlucCBvZiBwb3NzaWJsZUlucHV0cykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlucC5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbnB1dCA9IGlucDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTGFzdCByZXNvcnQ6IGZpbmQgYW55IHZpc2libGUgaW5wdXQgaW4gdGhlIGFjdGl2ZSBjZWxsIGFyZWFcclxuICAgIGlmICghaW5wdXQgJiYgaXNSZWFjdEdyaWQpIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVDZWxsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmR5bi1hY3RpdmVSb3dDZWxsLCAuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW46Zm9jdXMtd2l0aGluJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZUNlbGwpIHtcclxuICAgICAgICAgICAgaW5wdXQgPSBhY3RpdmVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Om5vdChbdHlwZT1cImhpZGRlblwiXSksIHRleHRhcmVhLCBzZWxlY3QnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICAvLyBMb2cgYXZhaWxhYmxlIGVsZW1lbnRzIGZvciBkZWJ1Z2dpbmdcclxuICAgICAgICBjb25zdCBncmlkQ29udGFpbmVyID0gZWxlbWVudC5jbG9zZXN0KCcucmVhY3RHcmlkLCBbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKTtcclxuICAgICAgICBjb25zdCBhbGxJbnB1dHMgPSBncmlkQ29udGFpbmVyPy5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pJyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0F2YWlsYWJsZSBpbnB1dHMgaW4gZ3JpZDonLCBBcnJheS5mcm9tKGFsbElucHV0cyB8fCBbXSkubWFwKGkgPT4gKHtcclxuICAgICAgICAgICAgbmFtZTogaS5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk/LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSxcclxuICAgICAgICAgICAgdmlzaWJsZTogaS5vZmZzZXRQYXJlbnQgIT09IG51bGxcclxuICAgICAgICB9KSkpO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW5wdXQgbm90IGZvdW5kIGluIGdyaWQgY2VsbDogJHtjb250cm9sTmFtZX0uIFRoZSBjZWxsIG1heSBuZWVkIHRvIGJlIGNsaWNrZWQgdG8gYmVjb21lIGVkaXRhYmxlLmApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEZXRlcm1pbmUgZmllbGQgdHlwZSBhbmQgdXNlIGFwcHJvcHJpYXRlIHNldHRlclxyXG4gICAgY29uc3Qgcm9sZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XHJcbiAgICBcclxuICAgIGlmIChmaWVsZFR5cGU/LnR5cGUgPT09ICdzZWdtZW50ZWQtbG9va3VwJyB8fCByb2xlID09PSAnU2VnbWVudGVkRW50cnknIHx8IGlzU2VnbWVudGVkRW50cnkoZWxlbWVudCkpIHtcclxuICAgICAgICBhd2FpdCBzZXRTZWdtZW50ZWRFbnRyeVZhbHVlKGVsZW1lbnQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChmaWVsZFR5cGU/LmlucHV0VHlwZSA9PT0gJ2VudW0nIHx8IHJvbGUgPT09ICdDb21ib0JveCcpIHtcclxuICAgICAgICBhd2FpdCBzZXRDb21ib0JveFZhbHVlKGVsZW1lbnQsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENoZWNrIGZvciBsb29rdXAgZmllbGRzXHJcbiAgICBpZiAocm9sZSA9PT0gJ0xvb2t1cCcgfHwgcm9sZSA9PT0gJ1JlZmVyZW5jZUdyb3VwJyB8fCBoYXNMb29rdXBCdXR0b24oZWxlbWVudCkpIHtcclxuICAgICAgICBhd2FpdCBzZXRMb29rdXBTZWxlY3RWYWx1ZShjb250cm9sTmFtZSwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU3RhbmRhcmQgaW5wdXQgLSBmb2N1cyBhbmQgc2V0IHZhbHVlXHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgZXhpc3RpbmcgdmFsdWVcclxuICAgIGlucHV0LnNlbGVjdD8uKCk7XHJcbiAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICBcclxuICAgIC8vIFVzZSB0aGUgc3RhbmRhcmQgaW5wdXQgbWV0aG9kXHJcbiAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGV2ZW50c1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIFxyXG4gICAgLy8gRm9yIGdyaWQgY2VsbHMsIHdlIG5lZWQgdG8gcHJvcGVybHkgY29tbWl0IHRoZSB2YWx1ZVxyXG4gICAgLy8gRDM2NSBSZWFjdCBncmlkcyByZXF1aXJlIHRoZSBjZWxsIHRvIGxvc2UgZm9jdXMgZm9yIHZhbGlkYXRpb24gdG8gb2NjdXJcclxuICAgIFxyXG4gICAgLy8gTWV0aG9kIDE6IFByZXNzIEVudGVyIHRvIGNvbmZpcm0gdGhlIHZhbHVlIChpbXBvcnRhbnQgZm9yIGxvb2t1cCBmaWVsZHMgbGlrZSBJdGVtSWQpXHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGtleUNvZGU6IDEzLCB3aGljaDogMTMsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywga2V5Q29kZTogMTMsIHdoaWNoOiAxMywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgXHJcbiAgICAvLyBNZXRob2QgMjogVGFiIG91dCB0byBtb3ZlIHRvIG5leHQgY2VsbCAodHJpZ2dlcnMgYmx1ciBhbmQgdmFsaWRhdGlvbilcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBrZXlDb2RlOiA5LCB3aGljaDogOSwgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnVGFiJywgY29kZTogJ1RhYicsIGtleUNvZGU6IDksIHdoaWNoOiA5LCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICBcclxuICAgIC8vIE1ldGhvZCAzOiBEaXNwYXRjaCBibHVyIGV2ZW50IGV4cGxpY2l0bHlcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUsIHJlbGF0ZWRUYXJnZXQ6IG51bGwgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIFxyXG4gICAgLy8gTWV0aG9kIDQ6IENsaWNrIG91dHNpZGUgdGhlIGNlbGwgdG8gZW5zdXJlIGZvY3VzIGlzIGxvc3RcclxuICAgIC8vIEZpbmQgYW5vdGhlciBjZWxsIG9yIHRoZSByb3cgY29udGFpbmVyIHRvIGNsaWNrXHJcbiAgICBjb25zdCByb3cgPSBpbnB1dC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpbiwgW2RhdGEtZHluLXJvbGU9XCJSb3dcIl0nKTtcclxuICAgIGlmIChyb3cpIHtcclxuICAgICAgICBjb25zdCBvdGhlckNlbGwgPSByb3cucXVlcnlTZWxlY3RvcignLmZpeGVkRGF0YVRhYmxlQ2VsbExheW91dF9tYWluOm5vdCg6Zm9jdXMtd2l0aGluKScpO1xyXG4gICAgICAgIGlmIChvdGhlckNlbGwgJiYgb3RoZXJDZWxsICE9PSBpbnB1dC5jbG9zZXN0KCcuZml4ZWREYXRhVGFibGVDZWxsTGF5b3V0X21haW4nKSkge1xyXG4gICAgICAgICAgICBvdGhlckNlbGwuY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIEQzNjUgdG8gcHJvY2Vzcy92YWxpZGF0ZSB0aGUgdmFsdWUgKHNlcnZlci1zaWRlIGxvb2t1cCBmb3IgSXRlbUlkLCBldGMuKVxyXG4gICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIFxyXG4gICAgLy8gSWYgd2FpdEZvclZhbGlkYXRpb24gaXMgZW5hYmxlZCwgd2FpdCBmb3IgRDM2NSB0byBjb21wbGV0ZSB0aGUgbG9va3VwIHZhbGlkYXRpb25cclxuICAgIC8vIFRoaXMgaXMgaW1wb3J0YW50IGZvciBmaWVsZHMgbGlrZSBJdGVtSWQgdGhhdCB0cmlnZ2VyIHNlcnZlci1zaWRlIHZhbGlkYXRpb25cclxuICAgIGlmICh3YWl0Rm9yVmFsaWRhdGlvbikge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFdhaXRpbmcgZm9yIEQzNjUgdmFsaWRhdGlvbiBvZiAke2NvbnRyb2xOYW1lfS4uLmApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFdhaXQgZm9yIGFueSBsb2FkaW5nIGluZGljYXRvcnMgdG8gYXBwZWFyIGFuZCBkaXNhcHBlYXJcclxuICAgICAgICAvLyBEMzY1IHNob3dzIGEgbG9hZGluZyBzcGlubmVyIGR1cmluZyBzZXJ2ZXItc2lkZSBsb29rdXBzXHJcbiAgICAgICAgYXdhaXQgd2FpdEZvckQzNjVWYWxpZGF0aW9uKGNvbnRyb2xOYW1lLCA1MDAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYCAgR3JpZCBjZWxsIHZhbHVlIHNldDogJHtjb250cm9sTmFtZX0gPSBcIiR7dmFsdWV9XCJgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JEMzY1VmFsaWRhdGlvbihjb250cm9sTmFtZSwgdGltZW91dCA9IDUwMDApIHtcclxuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICBsZXQgbGFzdExvYWRpbmdTdGF0ZSA9IGZhbHNlO1xyXG4gICAgbGV0IHNlZW5Mb2FkaW5nID0gZmFsc2U7XHJcbiAgICBcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDwgdGltZW91dCkge1xyXG4gICAgICAgIC8vIENoZWNrIGZvciBEMzY1IGxvYWRpbmcgaW5kaWNhdG9yc1xyXG4gICAgICAgIGNvbnN0IGlzTG9hZGluZyA9IGlzRDM2NUxvYWRpbmcoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXNMb2FkaW5nICYmICFsYXN0TG9hZGluZ1N0YXRlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCcgICAgRDM2NSB2YWxpZGF0aW9uIHN0YXJ0ZWQgKGxvYWRpbmcgaW5kaWNhdG9yIGFwcGVhcmVkKScpO1xyXG4gICAgICAgICAgICBzZWVuTG9hZGluZyA9IHRydWU7XHJcbiAgICAgICAgfSBlbHNlIGlmICghaXNMb2FkaW5nICYmIGxhc3RMb2FkaW5nU3RhdGUgJiYgc2VlbkxvYWRpbmcpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJyAgICBEMzY1IHZhbGlkYXRpb24gY29tcGxldGVkIChsb2FkaW5nIGluZGljYXRvciBnb25lKScpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApOyAvLyBFeHRyYSBidWZmZXIgYWZ0ZXIgbG9hZGluZyBjb21wbGV0ZXNcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGxhc3RMb2FkaW5nU3RhdGUgPSBpc0xvYWRpbmc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWxzbyBjaGVjayBpZiB0aGUgY2VsbCBub3cgc2hvd3MgdmFsaWRhdGVkIGNvbnRlbnQgKGUuZy4sIHByb2R1Y3QgbmFtZSBhcHBlYXJlZClcclxuICAgICAgICAvLyBGb3IgSXRlbUlkLCBEMzY1IHNob3dzIHRoZSBpdGVtIG51bWJlciBhbmQgbmFtZSBhZnRlciB2YWxpZGF0aW9uXHJcbiAgICAgICAgY29uc3QgY2VsbCA9IGZpbmRHcmlkQ2VsbEVsZW1lbnQoY29udHJvbE5hbWUpO1xyXG4gICAgICAgIGlmIChjZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxUZXh0ID0gY2VsbC50ZXh0Q29udGVudCB8fCAnJztcclxuICAgICAgICAgICAgY29uc3QgaGFzTXVsdGlwbGVWYWx1ZXMgPSBjZWxsVGV4dC5zcGxpdCgvXFxzezIsfXxcXG4vKS5maWx0ZXIodCA9PiB0LnRyaW0oKSkubGVuZ3RoID4gMTtcclxuICAgICAgICAgICAgaWYgKGhhc011bHRpcGxlVmFsdWVzKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnICAgIEQzNjUgdmFsaWRhdGlvbiBjb21wbGV0ZWQgKGNlbGwgY29udGVudCB1cGRhdGVkKScpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIElmIHdlIHNhdyBsb2FkaW5nIGF0IHNvbWUgcG9pbnQsIHdhaXQgYSBiaXQgbW9yZSBhZnRlciB0aW1lb3V0XHJcbiAgICBpZiAoc2VlbkxvYWRpbmcpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnICAgIFZhbGlkYXRpb24gdGltZW91dCByZWFjaGVkLCBidXQgc2F3IGxvYWRpbmcgLSB3YWl0aW5nIGV4dHJhIHRpbWUnKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZygnICAgIFZhbGlkYXRpb24gd2FpdCBjb21wbGV0ZWQgKHRpbWVvdXQgb3Igbm8gbG9hZGluZyBkZXRlY3RlZCknKTtcclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFdhaXQgZm9yIHRoZSBncmlkIHRvIGhhdmUgYW4gYWN0aXZlL3NlbGVjdGVkIHJvdyB0aGF0IGNvbnRhaW5zIHRoZSB0YXJnZXRcclxuICogY29udHJvbC4gIEQzNjUgUmVhY3QgZ3JpZHMgdXBkYXRlIGBhcmlhLXNlbGVjdGVkYCBhc3luY2hyb25vdXNseSBhZnRlclxyXG4gKiBhY3Rpb25zIGxpa2UgXCJBZGQgbGluZVwiLCBzbyB3ZSBwb2xsIGZvciBhIHNob3J0IHBlcmlvZCBiZWZvcmUgZ2l2aW5nIHVwLlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckFjdGl2ZUdyaWRSb3coY29udHJvbE5hbWUsIHRpbWVvdXQgPSAyMDAwKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XHJcbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dCkge1xyXG4gICAgICAgIC8vIFRyYWRpdGlvbmFsIGdyaWQgc2VsZWN0ZWQgcm93c1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdGVkUm93cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoXHJcbiAgICAgICAgICAgICdbZGF0YS1keW4tc2VsZWN0ZWQ9XCJ0cnVlXCJdLCBbYXJpYS1zZWxlY3RlZD1cInRydWVcIl0sIC5keW4tc2VsZWN0ZWRSb3cnXHJcbiAgICAgICAgKTtcclxuICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiBzZWxlY3RlZFJvd3MpIHtcclxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCAmJiBjZWxsLm9mZnNldFBhcmVudCAhPT0gbnVsbCkgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFJlYWN0IEZpeGVkRGF0YVRhYmxlIGFjdGl2ZSByb3dcclxuICAgICAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgICAgIGZvciAoY29uc3QgZ3JpZCBvZiByZWFjdEdyaWRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihcclxuICAgICAgICAgICAgICAgICcuZml4ZWREYXRhVGFibGVSb3dMYXlvdXRfbWFpblthcmlhLXNlbGVjdGVkPVwidHJ1ZVwiXSwgJyArXHJcbiAgICAgICAgICAgICAgICAnLmZpeGVkRGF0YVRhYmxlUm93TGF5b3V0X21haW5bZGF0YS1keW4tcm93LWFjdGl2ZT1cInRydWVcIl0nXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVSb3cpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBhY3RpdmVSb3cucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgICAgICAgICAgICAgIGlmIChjZWxsICYmIGNlbGwub2Zmc2V0UGFyZW50ICE9PSBudWxsKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgfVxyXG4gICAgLy8gTm8gYWN0aXZlIHJvdyBmb3VuZCB3aXRoaW4gdGltZW91dCBcdTIwMTMgY2FsbGVyIHdpbGwgcHJvY2VlZCB3aXRoIGZhbGxiYWNrXHJcbiAgICBjb25zb2xlLmxvZyhgW0QzNjVdIHdhaXRGb3JBY3RpdmVHcmlkUm93OiBubyBhY3RpdmUgcm93IGZvdW5kIGZvciAke2NvbnRyb2xOYW1lfSB3aXRoaW4gJHt0aW1lb3V0fW1zLCBwcm9jZWVkaW5nIHdpdGggZmFsbGJhY2tgKTtcclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlR3JpZFJvdyhjb250cm9sTmFtZSkge1xyXG4gICAgLy8gVHJ5IFJlYWN0IEZpeGVkRGF0YVRhYmxlIGdyaWRzIGZpcnN0XHJcbiAgICBjb25zdCByZWFjdEdyaWRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnJlYWN0R3JpZCcpO1xyXG4gICAgZm9yIChjb25zdCBncmlkIG9mIHJlYWN0R3JpZHMpIHtcclxuICAgICAgICBjb25zdCBib2R5Q29udGFpbmVyID0gZ3JpZC5xdWVyeVNlbGVjdG9yKCcuZml4ZWREYXRhVGFibGVMYXlvdXRfYm9keSwgLmZpeGVkRGF0YVRhYmxlTGF5b3V0X3Jvd3NDb250YWluZXInKTtcclxuICAgICAgICBpZiAoYm9keUNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gYm9keUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgICAgICBpZiAoY2VsbCkge1xyXG4gICAgICAgICAgICAgICAgLy8gRmluZCB0aGUgcm93IGNvbnRhaW5pbmcgdGhpcyBjZWxsXHJcbiAgICAgICAgICAgICAgICBjb25zdCByb3cgPSBjZWxsLmNsb3Nlc3QoJy5maXhlZERhdGFUYWJsZVJvd0xheW91dF9tYWluJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAocm93KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2xpY2sgb24gdGhlIHJvdyB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgICAgICAgICByb3cuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgdHJhZGl0aW9uYWwgRDM2NSBncmlkc1xyXG4gICAgY29uc3QgZ3JpZHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIkdyaWRcIl0nKTtcclxuICAgIGZvciAoY29uc3QgZ3JpZCBvZiBncmlkcykge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGNlbGxcclxuICAgICAgICBjb25zdCBjZWxsID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWApO1xyXG4gICAgICAgIGlmIChjZWxsKSB7XHJcbiAgICAgICAgICAgIC8vIEZpbmQgdGhlIHJvdyBjb250YWluaW5nIHRoaXMgY2VsbFxyXG4gICAgICAgICAgICBjb25zdCByb3cgPSBjZWxsLmNsb3Nlc3QoJ1tkYXRhLWR5bi1yb2xlPVwiUm93XCJdLCBbcm9sZT1cInJvd1wiXSwgdHInKTtcclxuICAgICAgICAgICAgaWYgKHJvdykge1xyXG4gICAgICAgICAgICAgICAgLy8gQ2xpY2sgb24gdGhlIHJvdyB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgICAgIHJvdy5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0TG9va3VwU2VsZWN0VmFsdWUoY29udHJvbE5hbWUsIHZhbHVlLCBjb21ib01ldGhvZE92ZXJyaWRlID0gJycpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgRWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcblxyXG4gICAgY29uc3QgaW5wdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCBbcm9sZT1cInRleHRib3hcIl0nKTtcclxuICAgIGlmICghaW5wdXQpIHRocm93IG5ldyBFcnJvcignSW5wdXQgbm90IGZvdW5kIGluIGxvb2t1cCBmaWVsZCcpO1xyXG5cclxuICAgIGNvbnN0IGxvb2t1cEJ1dHRvbiA9IGZpbmRMb29rdXBCdXR0b24oZWxlbWVudCk7XHJcbiAgICBpZiAobG9va3VwQnV0dG9uKSB7XHJcbiAgICAgICAgbG9va3VwQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoODAwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIG9wZW4gYnkgZm9jdXNpbmcgYW5kIGtleWJvYXJkXHJcbiAgICAgICAgaW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDApO1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IG9wZW5Mb29rdXBCeUtleWJvYXJkKGlucHV0KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBsb29rdXBEb2NrID0gYXdhaXQgd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsb29rdXBEb2NrKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29rdXAgZmx5b3V0IG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyeSB0eXBpbmcgaW50byBhIGxvb2t1cCBmbHlvdXQgaW5wdXQgaWYgcHJlc2VudCAoZS5nLiwgTWFpbkFjY291bnQpXHJcbiAgICBjb25zdCBkb2NrSW5wdXQgPSBmaW5kTG9va3VwRmlsdGVySW5wdXQobG9va3VwRG9jayk7XHJcbiAgICBpZiAoZG9ja0lucHV0KSB7XHJcbiAgICAgICAgZG9ja0lucHV0LmNsaWNrKCk7XHJcbiAgICAgICAgZG9ja0lucHV0LmZvY3VzKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgICAgIGF3YWl0IGNvbWJvSW5wdXRXaXRoU2VsZWN0ZWRNZXRob2QoZG9ja0lucHV0LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDYwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cERvY2ssIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFyb3dzLmxlbmd0aCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTG9va3VwIGxpc3QgaXMgZW1wdHknKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZWFyY2hWYWx1ZSA9IFN0cmluZyh2YWx1ZSA/PyAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgIGxldCBtYXRjaGVkID0gZmFsc2U7XHJcbiAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IHJvdy50ZXh0Q29udGVudC50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RDZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiZ3JpZGNlbGxcIl0sIHRkJyk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RUZXh0ID0gZmlyc3RDZWxsID8gZmlyc3RDZWxsLnRleHRDb250ZW50LnRyaW0oKS50b0xvd2VyQ2FzZSgpIDogJyc7XHJcbiAgICAgICAgaWYgKGZpcnN0VGV4dCA9PT0gc2VhcmNoVmFsdWUgfHwgdGV4dC5pbmNsdWRlcyhzZWFyY2hWYWx1ZSkpIHtcclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZmlyc3RDZWxsIHx8IHJvdztcclxuICAgICAgICAgICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgdGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIG1hdGNoZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICAvLyBTb21lIEQzNjUgbG9va3VwcyByZXF1aXJlIEVudGVyIG9yIGRvdWJsZS1jbGljayB0byBjb21taXQgc2VsZWN0aW9uXHJcbiAgICAgICAgICAgIHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdkYmxjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBhd2FpdCBjb21taXRMb29rdXBWYWx1ZShpbnB1dCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFwcGxpZWQgPSBhd2FpdCB3YWl0Rm9ySW5wdXRWYWx1ZShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgICAgICBpZiAoIWFwcGxpZWQpIHtcclxuICAgICAgICAgICAgICAgIC8vIFRyeSBhIHNlY29uZCBjb21taXQgcGFzcyBpZiB0aGUgdmFsdWUgZGlkIG5vdCBzdGlja1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExvb2t1cCB2YWx1ZSBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveFZhbHVlKGNvbnRyb2xOYW1lLCB2YWx1ZSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBFbGVtZW50IG5vdCBmb3VuZDogJHtjb250cm9sTmFtZX1gKTtcclxuXHJcbiAgICAvLyBEMzY1IGNoZWNrYm94ZXMgY2FuIGJlOlxyXG4gICAgLy8gMS4gU3RhbmRhcmQgaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdXHJcbiAgICAvLyAyLiBDdXN0b20gdG9nZ2xlIHdpdGggcm9sZT1cImNoZWNrYm94XCIgb3Igcm9sZT1cInN3aXRjaFwiXHJcbiAgICAvLyAzLiBFbGVtZW50IHdpdGggYXJpYS1jaGVja2VkIGF0dHJpYnV0ZSAodGhlIGNvbnRhaW5lciBpdHNlbGYpXHJcbiAgICAvLyA0LiBFbGVtZW50IHdpdGggZGF0YS1keW4tcm9sZT1cIkNoZWNrQm94XCJcclxuICAgIFxyXG4gICAgbGV0IGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKTtcclxuICAgIGxldCBpc0N1c3RvbVRvZ2dsZSA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICBpZiAoIWNoZWNrYm94KSB7XHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgY3VzdG9tIHRvZ2dsZSBlbGVtZW50XHJcbiAgICAgICAgY2hlY2tib3ggPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tyb2xlPVwiY2hlY2tib3hcIl0sIFtyb2xlPVwic3dpdGNoXCJdJyk7XHJcbiAgICAgICAgaWYgKGNoZWNrYm94KSB7XHJcbiAgICAgICAgICAgIGlzQ3VzdG9tVG9nZ2xlID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghY2hlY2tib3gpIHtcclxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZWxlbWVudCBpdHNlbGYgaXMgdGhlIHRvZ2dsZSAoRDM2NSBvZnRlbiBkb2VzIHRoaXMpXHJcbiAgICAgICAgaWYgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSAhPT0gbnVsbCB8fCBcclxuICAgICAgICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSA9PT0gJ2NoZWNrYm94JyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgncm9sZScpID09PSAnc3dpdGNoJyB8fFxyXG4gICAgICAgICAgICBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpID09PSAnQ2hlY2tCb3gnKSB7XHJcbiAgICAgICAgICAgIGNoZWNrYm94ID0gZWxlbWVudDtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkge1xyXG4gICAgICAgIC8vIExhc3QgcmVzb3J0OiBmaW5kIGFueSBjbGlja2FibGUgdG9nZ2xlLWxpa2UgZWxlbWVudFxyXG4gICAgICAgIGNoZWNrYm94ID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b24sIFt0YWJpbmRleD1cIjBcIl0nKTtcclxuICAgICAgICBpZiAoY2hlY2tib3gpIHtcclxuICAgICAgICAgICAgaXNDdXN0b21Ub2dnbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFjaGVja2JveCkgdGhyb3cgbmV3IEVycm9yKGBDaGVja2JveCBub3QgZm91bmQgaW46ICR7Y29udHJvbE5hbWV9LiBFbGVtZW50IEhUTUw6ICR7ZWxlbWVudC5vdXRlckhUTUwuc3Vic3RyaW5nKDAsIDIwMCl9YCk7XHJcblxyXG4gICAgY29uc3Qgc2hvdWxkQ2hlY2sgPSBjb2VyY2VCb29sZWFuKHZhbHVlKTtcclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIGN1cnJlbnQgc3RhdGVcclxuICAgIGxldCBpc0N1cnJlbnRseUNoZWNrZWQ7XHJcbiAgICBpZiAoaXNDdXN0b21Ub2dnbGUpIHtcclxuICAgICAgICBpc0N1cnJlbnRseUNoZWNrZWQgPSBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZScgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoZWNrZWQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3guY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2RhdGEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlzQ3VycmVudGx5Q2hlY2tlZCA9IGNoZWNrYm94LmNoZWNrZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT25seSBjbGljayBpZiBzdGF0ZSBuZWVkcyB0byBjaGFuZ2VcclxuICAgIGlmIChzaG91bGRDaGVjayAhPT0gaXNDdXJyZW50bHlDaGVja2VkKSB7XHJcbiAgICAgICAgY2hlY2tib3guY2xpY2soKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZvciBjdXN0b20gdG9nZ2xlcywgYWxzbyB0cnkgZGlzcGF0Y2hpbmcgZXZlbnRzIGlmIGNsaWNrIGRpZG4ndCB3b3JrXHJcbiAgICAgICAgaWYgKGlzQ3VzdG9tVG9nZ2xlKSB7XHJcbiAgICAgICAgICAgIGNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgIGNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5Mb29rdXBCeUtleWJvYXJkKGlucHV0KSB7XHJcbiAgICBpbnB1dC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgLy8gVHJ5IEFsdCtEb3duIHRoZW4gRjQgKGNvbW1vbiBEMzY1L1dpbiBjb250cm9scylcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBhbHRLZXk6IHRydWUsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBhbHRLZXk6IHRydWUsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTUwKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0Y0JywgY29kZTogJ0Y0JywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRjQnLCBjb2RlOiAnRjQnLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21taXRMb29rdXBWYWx1ZShpbnB1dCkge1xyXG4gICAgLy8gRDM2NSBzZWdtZW50ZWQgbG9va3VwcyBvZnRlbiB2YWxpZGF0ZSBvbiBUYWIvRW50ZXIgYW5kIGJsdXJcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdUYWInLCBjb2RlOiAnVGFiJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbG9zZURpYWxvZyhmb3JtTmFtZSwgYWN0aW9uID0gJ29rJykge1xyXG4gICAgY29uc3QgZm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1mb3JtLW5hbWU9XCIke2Zvcm1OYW1lfVwiXWApO1xyXG4gICAgaWYgKCFmb3JtKSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogRm9ybSAke2Zvcm1OYW1lfSBub3QgZm91bmQgdG8gY2xvc2VgKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCBidXR0b25OYW1lO1xyXG4gICAgaWYgKGZvcm1OYW1lID09PSAnU3lzUmVjdXJyZW5jZScpIHtcclxuICAgICAgICBidXR0b25OYW1lID0gYWN0aW9uID09PSAnb2snID8gJ0NvbW1hbmRCdXR0b25PaycgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9IGVsc2UgaWYgKGZvcm1OYW1lID09PSAnU3lzUXVlcnlGb3JtJykge1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnT2tCdXR0b24nIDogJ0NhbmNlbEJ1dHRvbic7XHJcbiAgICB9IGVsc2UgaWYgKGZvcm1OYW1lID09PSAnU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtJykge1xyXG4gICAgICAgIGJ1dHRvbk5hbWUgPSBhY3Rpb24gPT09ICdvaycgPyAnQ29tbWFuZEJ1dHRvbicgOiAnQ29tbWFuZEJ1dHRvbkNhbmNlbCc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFRyeSBnZW5lcmljIG5hbWVzXHJcbiAgICAgICAgYnV0dG9uTmFtZSA9IGFjdGlvbiA9PT0gJ29rJyA/ICdDb21tYW5kQnV0dG9uJyA6ICdDb21tYW5kQnV0dG9uQ2FuY2VsJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgYnV0dG9uID0gZm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2J1dHRvbk5hbWV9XCJdYCk7XHJcbiAgICBpZiAoYnV0dG9uKSB7XHJcbiAgICAgICAgYnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICBsb2dTdGVwKGBEaWFsb2cgJHtmb3JtTmFtZX0gY2xvc2VkIHdpdGggJHthY3Rpb24udG9VcHBlckNhc2UoKX1gKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogJHthY3Rpb24udG9VcHBlckNhc2UoKX0gYnV0dG9uIG5vdCBmb3VuZCBpbiAke2Zvcm1OYW1lfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRDdXJyZW50Um93VmFsdWUoZmllbGRNYXBwaW5nKSB7XHJcbiAgICBpZiAoIWZpZWxkTWFwcGluZykgcmV0dXJuICcnO1xyXG4gICAgY29uc3Qgcm93ID0gd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50RGF0YVJvdyB8fCB7fTtcclxuICAgIGNvbnN0IGRpcmVjdCA9IHJvd1tmaWVsZE1hcHBpbmddO1xyXG4gICAgaWYgKGRpcmVjdCAhPT0gdW5kZWZpbmVkICYmIGRpcmVjdCAhPT0gbnVsbCkge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmcoZGlyZWN0KTtcclxuICAgIH1cclxuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGZpZWxkTWFwcGluZy5pbmNsdWRlcygnOicpID8gZmllbGRNYXBwaW5nLnNwbGl0KCc6JykucG9wKCkgOiBmaWVsZE1hcHBpbmc7XHJcbiAgICBjb25zdCB2YWx1ZSA9IHJvd1tmaWVsZE5hbWVdO1xyXG4gICAgcmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwgPyAnJyA6IFN0cmluZyh2YWx1ZSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVEeW5hbWljVGV4dCh0ZXh0KSB7XHJcbiAgICBpZiAodHlwZW9mIHRleHQgIT09ICdzdHJpbmcnIHx8ICF0ZXh0KSByZXR1cm4gdGV4dCB8fCAnJztcclxuXHJcbiAgICBsZXQgcmVzb2x2ZWQgPSB0ZXh0O1xyXG4gICAgaWYgKC9fX0QzNjVfUEFSQU1fQ0xJUEJPQVJEX1thLXowLTlfXStfXy9pLnRlc3QocmVzb2x2ZWQpKSB7XHJcbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuY2xpcGJvYXJkPy5yZWFkVGV4dCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NsaXBib2FyZCBBUEkgbm90IGF2YWlsYWJsZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBjbGlwYm9hcmRUZXh0ID0gYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC5yZWFkVGV4dCgpO1xyXG4gICAgICAgIHJlc29sdmVkID0gcmVzb2x2ZWQucmVwbGFjZSgvX19EMzY1X1BBUkFNX0NMSVBCT0FSRF9bYS16MC05X10rX18vZ2ksIGNsaXBib2FyZFRleHQgPz8gJycpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlc29sdmVkID0gcmVzb2x2ZWQucmVwbGFjZSgvX19EMzY1X1BBUkFNX0RBVEFfKFtBLVphLXowLTklLl9+LV0qKV9fL2csIChfLCBlbmNvZGVkRmllbGQpID0+IHtcclxuICAgICAgICBjb25zdCBmaWVsZCA9IGRlY29kZVVSSUNvbXBvbmVudChlbmNvZGVkRmllbGQgfHwgJycpO1xyXG4gICAgICAgIHJldHVybiBnZXRDdXJyZW50Um93VmFsdWUoZmllbGQpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc29sdmVkO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbmF2aWdhdGVUb0Zvcm0oc3RlcCkge1xyXG4gICAgY29uc3QgeyBuYXZpZ2F0ZU1ldGhvZCwgbWVudUl0ZW1OYW1lLCBtZW51SXRlbVR5cGUsIG5hdmlnYXRlVXJsLCBob3N0UmVsYXRpdmVQYXRoLCB3YWl0Rm9yTG9hZCwgb3BlbkluTmV3VGFiIH0gPSBzdGVwO1xyXG5cclxuICAgIGNvbnN0IHJlc29sdmVkTWVudUl0ZW1OYW1lID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KG1lbnVJdGVtTmFtZSB8fCAnJyk7XHJcbiAgICBjb25zdCByZXNvbHZlZE5hdmlnYXRlVXJsID0gYXdhaXQgcmVzb2x2ZUR5bmFtaWNUZXh0KG5hdmlnYXRlVXJsIHx8ICcnKTtcclxuICAgIGNvbnN0IHJlc29sdmVkSG9zdFJlbGF0aXZlUGF0aCA9IGF3YWl0IHJlc29sdmVEeW5hbWljVGV4dChob3N0UmVsYXRpdmVQYXRoIHx8ICcnKTtcclxuXHJcbiAgICBsb2dTdGVwKGBOYXZpZ2F0aW5nIHRvIGZvcm06ICR7cmVzb2x2ZWRNZW51SXRlbU5hbWUgfHwgcmVzb2x2ZWROYXZpZ2F0ZVVybH1gKTtcclxuICAgIFxyXG4gICAgbGV0IHRhcmdldFVybDtcclxuICAgIGNvbnN0IGJhc2VVcmwgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lO1xyXG4gICAgXHJcbiAgICBpZiAobmF2aWdhdGVNZXRob2QgPT09ICd1cmwnICYmIHJlc29sdmVkTmF2aWdhdGVVcmwpIHtcclxuICAgICAgICAvLyBVc2UgZnVsbCBVUkwgcGF0aCBwcm92aWRlZFxyXG4gICAgICAgIHRhcmdldFVybCA9IHJlc29sdmVkTmF2aWdhdGVVcmwuc3RhcnRzV2l0aCgnaHR0cCcpID8gcmVzb2x2ZWROYXZpZ2F0ZVVybCA6IGJhc2VVcmwgKyByZXNvbHZlZE5hdmlnYXRlVXJsO1xyXG4gICAgfSBlbHNlIGlmIChuYXZpZ2F0ZU1ldGhvZCA9PT0gJ2hvc3RSZWxhdGl2ZScgJiYgcmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoKSB7XHJcbiAgICAgICAgLy8gUmV1c2UgY3VycmVudCBob3N0IGR5bmFtaWNhbGx5LCBhcHBlbmQgcHJvdmlkZWQgcGF0aC9xdWVyeS5cclxuICAgICAgICBjb25zdCByZWxhdGl2ZVBhcnQgPSBTdHJpbmcocmVzb2x2ZWRIb3N0UmVsYXRpdmVQYXRoKS50cmltKCk7XHJcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHJlbGF0aXZlUGFydC5zdGFydHNXaXRoKCcvJykgfHwgcmVsYXRpdmVQYXJ0LnN0YXJ0c1dpdGgoJz8nKVxyXG4gICAgICAgICAgICA/IHJlbGF0aXZlUGFydFxyXG4gICAgICAgICAgICA6IGAvJHtyZWxhdGl2ZVBhcnR9YDtcclxuICAgICAgICB0YXJnZXRVcmwgPSBgJHt3aW5kb3cubG9jYXRpb24ucHJvdG9jb2x9Ly8ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fSR7bm9ybWFsaXplZH1gO1xyXG4gICAgfSBlbHNlIGlmIChyZXNvbHZlZE1lbnVJdGVtTmFtZSkge1xyXG4gICAgICAgIC8vIEJ1aWxkIFVSTCBmcm9tIG1lbnUgaXRlbSBuYW1lXHJcbiAgICAgICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcclxuICAgICAgICBwYXJhbXMuZGVsZXRlKCdxJyk7XHJcbiAgICAgICAgY29uc3QgdHlwZVByZWZpeCA9IChtZW51SXRlbVR5cGUgJiYgbWVudUl0ZW1UeXBlICE9PSAnRGlzcGxheScpID8gYCR7bWVudUl0ZW1UeXBlfTpgIDogJyc7XHJcbiAgICAgICAgY29uc3QgcmF3TWVudUl0ZW0gPSBTdHJpbmcocmVzb2x2ZWRNZW51SXRlbU5hbWUpLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gU3VwcG9ydCBleHRlbmRlZCBpbnB1dCBsaWtlOlxyXG4gICAgICAgIC8vIFwiU3lzVGFibGVCcm93c2VyJnRhYmxlTmFtZT1JbnZlbnRUYWJsZVwiXHJcbiAgICAgICAgLy8gc28gZXh0cmEgcXVlcnkgcGFyYW1zIGFyZSBhcHBlbmRlZCBhcyByZWFsIFVSTCBwYXJhbXMsIG5vdCBlbmNvZGVkIGludG8gbWkuXHJcbiAgICAgICAgY29uc3Qgc2VwYXJhdG9ySW5kZXggPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgLi4uWyc/JywgJyYnXVxyXG4gICAgICAgICAgICAgICAgLm1hcChjaCA9PiByYXdNZW51SXRlbS5pbmRleE9mKGNoKSlcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIoaWR4ID0+IGlkeCA+PSAwKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGxldCBtZW51SXRlbUJhc2UgPSByYXdNZW51SXRlbTtcclxuICAgICAgICBsZXQgZXh0cmFRdWVyeSA9ICcnO1xyXG5cclxuICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHNlcGFyYXRvckluZGV4KSkge1xyXG4gICAgICAgICAgICBtZW51SXRlbUJhc2UgPSByYXdNZW51SXRlbS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCkudHJpbSgpO1xyXG4gICAgICAgICAgICBleHRyYVF1ZXJ5ID0gcmF3TWVudUl0ZW0uc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKS50cmltKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBwYXJhbXMuc2V0KCdtaScsIGAke3R5cGVQcmVmaXh9JHttZW51SXRlbUJhc2V9YCk7XHJcblxyXG4gICAgICAgIGlmIChleHRyYVF1ZXJ5KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGV4dHJhcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoZXh0cmFRdWVyeSk7XHJcbiAgICAgICAgICAgIGV4dHJhcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoa2V5ICYmIGtleSAhPT0gJ21pJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhcmFtcy5zZXQoa2V5LCB2YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGFyZ2V0VXJsID0gYmFzZVVybCArICc/JyArIHBhcmFtcy50b1N0cmluZygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05hdmlnYXRlIHN0ZXAgcmVxdWlyZXMgZWl0aGVyIG1lbnVJdGVtTmFtZSBvciBuYXZpZ2F0ZVVybCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBOYXZpZ2F0aW5nIHRvOiAke3RhcmdldFVybH1gKTtcclxuXHJcbiAgICBpZiAob3BlbkluTmV3VGFiKSB7XHJcbiAgICAgICAgd2luZG93Lm9wZW4odGFyZ2V0VXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyJyk7XHJcbiAgICAgICAgbG9nU3RlcCgnT3BlbmVkIG5hdmlnYXRpb24gdGFyZ2V0IGluIGEgbmV3IHRhYicpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNhdmUgcGVuZGluZyB3b3JrZmxvdyBzdGF0ZSBkaXJlY3RseSBpbiBzZXNzaW9uU3RvcmFnZSBiZWZvcmUgbmF2aWdhdGlvblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHRhcmdldFVybCk7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0TWVudUl0ZW1OYW1lID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ21pJykgfHwgJyc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSU1QT1JUQU5UOiBQZXJzaXN0IHBlbmRpbmcgbmF2aWdhdGlvbiBzdGF0ZSBmcm9tIHRoZSBjdXJyZW50bHkgZXhlY3V0aW5nIHdvcmtmbG93LlxyXG4gICAgICAgIC8vIFByZWZlciBjdXJyZW50IHdvcmtmbG93IGNvbnRleHQgZmlyc3QsIHRoZW4gaXRzIG9yaWdpbmFsL2Z1bGwgd29ya2Zsb3cgd2hlbiBwcmVzZW50LlxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRXb3JrZmxvdyA9IHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93IHx8IG51bGw7XHJcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxXb3JrZmxvdyA9IGN1cnJlbnRXb3JrZmxvdz8uX29yaWdpbmFsV29ya2Zsb3cgfHwgY3VycmVudFdvcmtmbG93IHx8IHdpbmRvdy5kMzY1T3JpZ2luYWxXb3JrZmxvdyB8fCBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHBlbmRpbmdTdGF0ZSA9IHtcclxuICAgICAgICAgICAgd29ya2Zsb3c6IG9yaWdpbmFsV29ya2Zsb3csXHJcbiAgICAgICAgICAgIHdvcmtmbG93SWQ6IG9yaWdpbmFsV29ya2Zsb3c/LmlkIHx8ICcnLFxyXG4gICAgICAgICAgICBuZXh0U3RlcEluZGV4OiAod2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sPy5jdXJyZW50U3RlcEluZGV4ID8/IDApICsgMSxcclxuICAgICAgICAgICAgY3VycmVudFJvd0luZGV4OiB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnRSb3dJbmRleCB8fCAwLFxyXG4gICAgICAgICAgICB0b3RhbFJvd3M6IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8udG90YWxSb3dzIHx8IDAsXHJcbiAgICAgICAgICAgIGRhdGE6IHdpbmRvdy5kMzY1RXhlY3V0aW9uQ29udHJvbD8uY3VycmVudERhdGFSb3cgfHwgbnVsbCxcclxuICAgICAgICAgICAgdGFyZ2V0TWVudUl0ZW1OYW1lOiB0YXJnZXRNZW51SXRlbU5hbWUsXHJcbiAgICAgICAgICAgIHdhaXRGb3JMb2FkOiB3YWl0Rm9yTG9hZCB8fCAzMDAwLFxyXG4gICAgICAgICAgICBzYXZlZEF0OiBEYXRlLm5vdygpXHJcbiAgICAgICAgfTtcclxuICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdkMzY1X3BlbmRpbmdfd29ya2Zsb3cnLCBKU09OLnN0cmluZ2lmeShwZW5kaW5nU3RhdGUpKTtcclxuICAgICAgICBsb2dTdGVwKGBTYXZlZCB3b3JrZmxvdyBzdGF0ZSBmb3IgbmF2aWdhdGlvbiAobmV4dFN0ZXBJbmRleDogJHtwZW5kaW5nU3RhdGUubmV4dFN0ZXBJbmRleH0pYCk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCdbRDM2NV0gRmFpbGVkIHRvIHNhdmUgd29ya2Zsb3cgc3RhdGUgaW4gc2Vzc2lvblN0b3JhZ2U6JywgZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNpZ25hbCBuYXZpZ2F0aW9uIGlzIGFib3V0IHRvIGhhcHBlbiAtIHdvcmtmbG93IHN0YXRlIHdpbGwgYmUgc2F2ZWQgYnkgdGhlIGV4dGVuc2lvblxyXG4gICAgLy8gV2UgbmVlZCB0byB3YWl0IGZvciB0aGUgc3RhdGUgdG8gYmUgc2F2ZWQgYmVmb3JlIG5hdmlnYXRpbmdcclxuICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfTkFWSUdBVElORycsXHJcbiAgICAgICAgdGFyZ2V0VXJsOiB0YXJnZXRVcmwsXHJcbiAgICAgICAgd2FpdEZvckxvYWQ6IHdhaXRGb3JMb2FkIHx8IDMwMDBcclxuICAgIH0sICcqJyk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgbG9uZ2VyIHRvIGVuc3VyZSB0aGUgZnVsbCBjaGFpbiBjb21wbGV0ZXM6XHJcbiAgICAvLyBwb3N0TWVzc2FnZSAtPiBjb250ZW50LmpzIC0+IGJhY2tncm91bmQuanMgLT4gcG9wdXAgLT4gY2hyb21lLnNjcmlwdGluZy5leGVjdXRlU2NyaXB0XHJcbiAgICAvLyBUaGlzIGNoYWluIGludm9sdmVzIG11bHRpcGxlIGFzeW5jIGhvcHMsIHNvIHdlIG5lZWQgc3VmZmljaWVudCB0aW1lXHJcbiAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgXHJcbiAgICAvLyBOYXZpZ2F0ZSAtIHRoaXMgd2lsbCBjYXVzZSBwYWdlIHJlbG9hZCwgc2NyaXB0IGNvbnRleHQgd2lsbCBiZSBsb3N0XHJcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRhcmdldFVybDtcclxuICAgIFxyXG4gICAgLy8gVGhpcyBjb2RlIHdvbid0IGV4ZWN1dGUgZHVlIHRvIHBhZ2UgbmF2aWdhdGlvbiwgYnV0IGtlZXAgaXQgZm9yIHJlZmVyZW5jZVxyXG4gICAgLy8gVGhlIHdvcmtmbG93IHdpbGwgYmUgcmVzdW1lZCBieSB0aGUgY29udGVudCBzY3JpcHQgYWZ0ZXIgcGFnZSBsb2FkXHJcbiAgICBhd2FpdCBzbGVlcCh3YWl0Rm9yTG9hZCB8fCAzMDAwKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjdGl2YXRlVGFiKGNvbnRyb2xOYW1lKSB7XHJcbiAgICBsb2dTdGVwKGBBY3RpdmF0aW5nIHRhYjogJHtjb250cm9sTmFtZX1gKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgdGFiIGVsZW1lbnQgLSBjb3VsZCBiZSB0aGUgdGFiIGNvbnRlbnQgb3IgdGhlIHRhYiBidXR0b24gaXRzZWxmXHJcbiAgICBsZXQgdGFiRWxlbWVudCA9IGZpbmRFbGVtZW50SW5BY3RpdmVDb250ZXh0KGNvbnRyb2xOYW1lKTtcclxuICAgIFxyXG4gICAgLy8gSWYgbm90IGZvdW5kIGRpcmVjdGx5LCB0cnkgZmluZGluZyBieSBsb29raW5nIGZvciB0YWIgaGVhZGVycy9saW5rc1xyXG4gICAgaWYgKCF0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgdGhlIHRhYiBsaW5rL2J1dHRvbiB0aGF0IHJlZmVyZW5jZXMgdGhpcyB0YWJcclxuICAgICAgICB0YWJFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1faGVhZGVyXCJdYCkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl0gW3JvbGU9XCJ0YWJcIl1gKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbYXJpYS1jb250cm9scz1cIiR7Y29udHJvbE5hbWV9XCJdYCkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgYVtocmVmKj1cIiR7Y29udHJvbE5hbWV9XCJdLCBidXR0b25bZGF0YS10YXJnZXQqPVwiJHtjb250cm9sTmFtZX1cIl1gKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCF0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUYWIgZWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBEMzY1IHBhcmFtZXRlciBmb3JtcyB3aXRoIHZlcnRpY2FsIHRhYnMsIHRoZSBjbGlja2FibGUgZWxlbWVudCBzdHJ1Y3R1cmUgdmFyaWVzXHJcbiAgICAvLyBUcnkgbXVsdGlwbGUgYXBwcm9hY2hlcyB0byBmaW5kIGFuZCBjbGljayB0aGUgcmlnaHQgZWxlbWVudFxyXG4gICAgXHJcbiAgICAvLyBBcHByb2FjaCAxOiBMb29rIGZvciB0aGUgdGFiIGxpbmsgaW5zaWRlIGEgcGl2b3QvdGFiIHN0cnVjdHVyZVxyXG4gICAgbGV0IGNsaWNrVGFyZ2V0ID0gdGFiRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcucGl2b3QtbGluaywgLnRhYi1saW5rLCBbcm9sZT1cInRhYlwiXScpO1xyXG4gICAgXHJcbiAgICAvLyBBcHByb2FjaCAyOiBUaGUgZWxlbWVudCBpdHNlbGYgbWlnaHQgYmUgdGhlIGxpbmtcclxuICAgIGlmICghY2xpY2tUYXJnZXQgJiYgKHRhYkVsZW1lbnQudGFnTmFtZSA9PT0gJ0EnIHx8IHRhYkVsZW1lbnQudGFnTmFtZSA9PT0gJ0JVVFRPTicgfHwgdGFiRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSA9PT0gJ3RhYicpKSB7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQgPSB0YWJFbGVtZW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBBcHByb2FjaCAzOiBGb3IgdmVydGljYWwgdGFicywgbG9vayBmb3IgdGhlIGFuY2hvciBvciBsaW5rIGVsZW1lbnRcclxuICAgIGlmICghY2xpY2tUYXJnZXQpIHtcclxuICAgICAgICBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3RvcignYSwgYnV0dG9uJykgfHwgdGFiRWxlbWVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQXBwcm9hY2ggNDogRm9yIFBpdm90SXRlbSwgZmluZCB0aGUgaGVhZGVyIGVsZW1lbnRcclxuICAgIGlmICghY2xpY2tUYXJnZXQgfHwgY2xpY2tUYXJnZXQgPT09IHRhYkVsZW1lbnQpIHtcclxuICAgICAgICBjb25zdCBoZWFkZXJOYW1lID0gY29udHJvbE5hbWUgKyAnX2hlYWRlcic7XHJcbiAgICAgICAgY29uc3QgaGVhZGVyRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2hlYWRlck5hbWV9XCJdYCk7XHJcbiAgICAgICAgaWYgKGhlYWRlckVsKSB7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0ID0gaGVhZGVyRWwucXVlcnlTZWxlY3RvcignYSwgYnV0dG9uLCAucGl2b3QtbGluaycpIHx8IGhlYWRlckVsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgQ2xpY2tpbmcgdGFiIGVsZW1lbnQ6ICR7Y2xpY2tUYXJnZXQ/LnRhZ05hbWUgfHwgJ3Vua25vd24nfWApO1xyXG4gICAgXHJcbiAgICAvLyBGb2N1cyBhbmQgY2xpY2tcclxuICAgIGlmIChjbGlja1RhcmdldC5mb2N1cykgY2xpY2tUYXJnZXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDEwMCk7XHJcbiAgICBcclxuICAgIC8vIERpc3BhdGNoIGZ1bGwgY2xpY2sgc2VxdWVuY2VcclxuICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XHJcbiAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICAgIFxyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gQWxzbyB0cnkgdHJpZ2dlcmluZyB0aGUgRDM2NSBpbnRlcm5hbCBjb250cm9sXHJcbiAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250cm9sID0gJGR5bi5jb250cm9sc1tjb250cm9sTmFtZV07XHJcbiAgICAgICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRyb2wuQWN0aXZhdGVUYWIgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLkFjdGl2YXRlVGFiKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBBY3RpdmF0ZVRhYiBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5hY3RpdmF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuYWN0aXZhdGUoKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgYWN0aXZhdGUgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuc2VsZWN0ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5zZWxlY3QoKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgc2VsZWN0IG9uICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGxvZ1N0ZXAoYEQzNjUgY29udHJvbCBtZXRob2QgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIHRhYiBjb250ZW50IHRvIGxvYWRcclxuICAgIGF3YWl0IHNsZWVwKDgwMCk7XHJcbiAgICBcclxuICAgIC8vIFZlcmlmeSB0aGUgdGFiIGlzIG5vdyBhY3RpdmUgYnkgY2hlY2tpbmcgZm9yIHZpc2libGUgY29udGVudFxyXG4gICAgY29uc3QgdGFiQ29udGVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICBpZiAodGFiQ29udGVudCkge1xyXG4gICAgICAgIGNvbnN0IGlzVmlzaWJsZSA9IHRhYkNvbnRlbnQub2Zmc2V0UGFyZW50ICE9PSBudWxsO1xyXG4gICAgICAgIGNvbnN0IGlzQWN0aXZlID0gdGFiQ29udGVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0YWJDb250ZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZScgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFiQ29udGVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJykgIT09ICd0cnVlJztcclxuICAgICAgICBsb2dTdGVwKGBUYWIgJHtjb250cm9sTmFtZX0gdmlzaWJpbGl0eSBjaGVjazogdmlzaWJsZT0ke2lzVmlzaWJsZX0sIGFjdGl2ZT0ke2lzQWN0aXZlfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKGBUYWIgJHtjb250cm9sTmFtZX0gYWN0aXZhdGVkYCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY3RpdmF0ZUFjdGlvblBhbmVUYWIoY29udHJvbE5hbWUpIHtcclxuICAgIGxvZ1N0ZXAoYEFjdGl2YXRpbmcgYWN0aW9uIHBhbmUgdGFiOiAke2NvbnRyb2xOYW1lfWApO1xyXG5cclxuICAgIGxldCB0YWJFbGVtZW50ID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpO1xyXG5cclxuICAgIGlmICghdGFiRWxlbWVudCkge1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdG9ycyA9IFtcclxuICAgICAgICAgICAgYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgYC5hcHBCYXJUYWJbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke2NvbnRyb2xOYW1lfVwiXWAsXHJcbiAgICAgICAgICAgIGAuYXBwQmFyVGFiIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCxcclxuICAgICAgICAgICAgYFtyb2xlPVwidGFiXCJdW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1cIl1gXHJcbiAgICAgICAgXTtcclxuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICAgICAgICB0YWJFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgICAgIGlmICh0YWJFbGVtZW50KSBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBY3Rpb24gcGFuZSB0YWIgbm90IGZvdW5kOiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQ7XHJcblxyXG4gICAgY29uc3QgaGVhZGVyID0gdGFiRWxlbWVudC5xdWVyeVNlbGVjdG9yPy4oJy5hcHBCYXJUYWItaGVhZGVyLCAuYXBwQmFyVGFiSGVhZGVyLCAuYXBwQmFyVGFiX2hlYWRlcicpO1xyXG4gICAgaWYgKGhlYWRlcikge1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0ID0gaGVhZGVyO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGZvY3VzU2VsZWN0b3IgPSB0YWJFbGVtZW50LmdldEF0dHJpYnV0ZT8uKCdkYXRhLWR5bi1mb2N1cycpO1xyXG4gICAgaWYgKGZvY3VzU2VsZWN0b3IpIHtcclxuICAgICAgICBjb25zdCBmb2N1c1RhcmdldCA9IHRhYkVsZW1lbnQucXVlcnlTZWxlY3Rvcihmb2N1c1NlbGVjdG9yKTtcclxuICAgICAgICBpZiAoZm9jdXNUYXJnZXQpIHtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQgPSBmb2N1c1RhcmdldDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRhYkVsZW1lbnQuZ2V0QXR0cmlidXRlPy4oJ3JvbGUnKSA9PT0gJ3RhYicpIHtcclxuICAgICAgICBjbGlja1RhcmdldCA9IHRhYkVsZW1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNsaWNrVGFyZ2V0ID09PSB0YWJFbGVtZW50KSB7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uaXNoID0gdGFiRWxlbWVudC5xdWVyeVNlbGVjdG9yPy4oJ2J1dHRvbiwgYSwgW3JvbGU9XCJ0YWJcIl0nKTtcclxuICAgICAgICBpZiAoYnV0dG9uaXNoKSBjbGlja1RhcmdldCA9IGJ1dHRvbmlzaDtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoY2xpY2tUYXJnZXQ/LmZvY3VzKSBjbGlja1RhcmdldC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIGRpc3BhdGNoQ2xpY2tTZXF1ZW5jZShjbGlja1RhcmdldCk7XHJcblxyXG4gICAgaWYgKHR5cGVvZiAkZHluICE9PSAndW5kZWZpbmVkJyAmJiAkZHluLmNvbnRyb2xzKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgY29udHJvbCA9ICRkeW4uY29udHJvbHNbY29udHJvbE5hbWVdO1xyXG4gICAgICAgICAgICBpZiAoY29udHJvbCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb250cm9sLmFjdGl2YXRlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbC5hY3RpdmF0ZSgpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udHJvbC5zZWxlY3QgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250cm9sLnNlbGVjdCgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBsb2dTdGVwKGBBY3Rpb24gcGFuZSBjb250cm9sIG1ldGhvZCBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBzbGVlcCg2MDApO1xyXG4gICAgbG9nU3RlcChgQWN0aW9uIHBhbmUgdGFiICR7Y29udHJvbE5hbWV9IGFjdGl2YXRlZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oY29udHJvbE5hbWUsIGFjdGlvbikge1xyXG4gICAgbG9nU3RlcChgJHthY3Rpb24gPT09ICdleHBhbmQnID8gJ0V4cGFuZGluZycgOiAnQ29sbGFwc2luZyd9IHNlY3Rpb246ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHNlY3Rpb24gPSBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dChjb250cm9sTmFtZSk7XHJcbiAgICBpZiAoIXNlY3Rpb24pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFNlY3Rpb24gZWxlbWVudCBub3QgZm91bmQ6ICR7Y29udHJvbE5hbWV9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEQzNjUgc2VjdGlvbnMgY2FuIGhhdmUgdmFyaW91cyBzdHJ1Y3R1cmVzLiBUaGUgdG9nZ2xlIGJ1dHRvbiBpcyB1c3VhbGx5OlxyXG4gICAgLy8gMS4gQSBidXR0b24gd2l0aCBhcmlhLWV4cGFuZGVkIGluc2lkZSB0aGUgc2VjdGlvblxyXG4gICAgLy8gMi4gQSBzZWN0aW9uIGhlYWRlciBlbGVtZW50XHJcbiAgICAvLyAzLiBUaGUgc2VjdGlvbiBpdHNlbGYgbWlnaHQgYmUgY2xpY2thYmxlXHJcbiAgICBcclxuICAgIC8vIEZpbmQgdGhlIHRvZ2dsZSBidXR0b24gLSB0aGlzIGlzIGNydWNpYWwgZm9yIEQzNjUgZGlhbG9nc1xyXG4gICAgbGV0IHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb24ucXVlcnlTZWxlY3RvcignYnV0dG9uW2FyaWEtZXhwYW5kZWRdJyk7XHJcbiAgICBcclxuICAgIC8vIElmIG5vdCBmb3VuZCwgdHJ5IG90aGVyIGNvbW1vbiBwYXR0ZXJuc1xyXG4gICAgaWYgKCF0b2dnbGVCdXR0b24pIHtcclxuICAgICAgICB0b2dnbGVCdXR0b24gPSBzZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoJy5zZWN0aW9uLXBhZ2UtY2FwdGlvbiwgLnNlY3Rpb24taGVhZGVyLCAuZ3JvdXAtaGVhZGVyLCBbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlSGVhZGVyXCJdJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZvciBTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm0gc2VjdGlvbnMgKFJlY29yZHMgdG8gaW5jbHVkZSwgUnVuIGluIHRoZSBiYWNrZ3JvdW5kKVxyXG4gICAgLy8gdGhlIGJ1dHRvbiBpcyBvZnRlbiBhIGRpcmVjdCBjaGlsZCBvciBzaWJsaW5nXHJcbiAgICBpZiAoIXRvZ2dsZUJ1dHRvbikge1xyXG4gICAgICAgIHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb24ucXVlcnlTZWxlY3RvcignYnV0dG9uJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENoZWNrIGlmIHRoZSBzZWN0aW9uIGl0c2VsZiBoYXMgYXJpYS1leHBhbmRlZCAoaXQgbWlnaHQgYmUgdGhlIGNsaWNrYWJsZSBlbGVtZW50KVxyXG4gICAgaWYgKCF0b2dnbGVCdXR0b24gJiYgc2VjdGlvbi5oYXNBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSkge1xyXG4gICAgICAgIHRvZ2dsZUJ1dHRvbiA9IHNlY3Rpb247XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIERldGVybWluZSBjdXJyZW50IHN0YXRlIGZyb20gdmFyaW91cyBzb3VyY2VzXHJcbiAgICBsZXQgaXNFeHBhbmRlZCA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayB0aGUgdG9nZ2xlIGJ1dHRvbidzIGFyaWEtZXhwYW5kZWRcclxuICAgIGlmICh0b2dnbGVCdXR0b24gJiYgdG9nZ2xlQnV0dG9uLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpKSB7XHJcbiAgICAgICAgaXNFeHBhbmRlZCA9IHRvZ2dsZUJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnO1xyXG4gICAgfSBlbHNlIGlmIChzZWN0aW9uLmhhc0F0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpKSB7XHJcbiAgICAgICAgaXNFeHBhbmRlZCA9IHNlY3Rpb24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gY2xhc3MtYmFzZWQgZGV0ZWN0aW9uXHJcbiAgICAgICAgaXNFeHBhbmRlZCA9IHNlY3Rpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmRlZCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICFzZWN0aW9uLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoYFNlY3Rpb24gJHtjb250cm9sTmFtZX0gY3VycmVudCBzdGF0ZTogJHtpc0V4cGFuZGVkID8gJ2V4cGFuZGVkJyA6ICdjb2xsYXBzZWQnfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBuZWVkc1RvZ2dsZSA9IChhY3Rpb24gPT09ICdleHBhbmQnICYmICFpc0V4cGFuZGVkKSB8fCAoYWN0aW9uID09PSAnY29sbGFwc2UnICYmIGlzRXhwYW5kZWQpO1xyXG4gICAgXHJcbiAgICBpZiAobmVlZHNUb2dnbGUpIHtcclxuICAgICAgICAvLyBDbGljayB0aGUgdG9nZ2xlIGVsZW1lbnRcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IHRvZ2dsZUJ1dHRvbiB8fCBzZWN0aW9uO1xyXG4gICAgICAgIGxvZ1N0ZXAoYENsaWNraW5nIHRvZ2dsZSBlbGVtZW50OiAke2NsaWNrVGFyZ2V0LnRhZ05hbWV9LCBjbGFzcz0ke2NsaWNrVGFyZ2V0LmNsYXNzTmFtZX1gKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEaXNwYXRjaCBmdWxsIGNsaWNrIHNlcXVlbmNlIGZvciBEMzY1IFJlYWN0IGNvbXBvbmVudHNcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBQb2ludGVyRXZlbnQoJ3BvaW50ZXJkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcnVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBjbGlja1RhcmdldC5jbGljaygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVHJ5IEQzNjUgaW50ZXJuYWwgY29udHJvbCBBUElcclxuICAgICAgICBpZiAodHlwZW9mICRkeW4gIT09ICd1bmRlZmluZWQnICYmICRkeW4uY29udHJvbHMpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRyb2wgPSAkZHluLmNvbnRyb2xzW2NvbnRyb2xOYW1lXTtcclxuICAgICAgICAgICAgICAgIGlmIChjb250cm9sKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ5IHZhcmlvdXMgRDM2NSBtZXRob2RzXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb250cm9sLkV4cGFuZGVkQ2hhbmdlZCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBFeHBhbmRlZENoYW5nZWQgdGFrZXMgMCBmb3IgZXhwYW5kLCAxIGZvciBjb2xsYXBzZSBpbiBEMzY1XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuRXhwYW5kZWRDaGFuZ2VkKGFjdGlvbiA9PT0gJ2NvbGxhcHNlJyA/IDEgOiAwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIEV4cGFuZGVkQ2hhbmdlZCgke2FjdGlvbiA9PT0gJ2NvbGxhcHNlJyA/IDEgOiAwfSkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLmV4cGFuZCA9PT0gJ2Z1bmN0aW9uJyAmJiBhY3Rpb24gPT09ICdleHBhbmQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuZXhwYW5kKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYENhbGxlZCBleHBhbmQoKSBvbiAke2NvbnRyb2xOYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnRyb2wuY29sbGFwc2UgPT09ICdmdW5jdGlvbicgJiYgYWN0aW9uID09PSAnY29sbGFwc2UnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyb2wuY29sbGFwc2UoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nU3RlcChgQ2FsbGVkIGNvbGxhcHNlKCkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250cm9sLnRvZ2dsZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sLnRvZ2dsZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2dTdGVwKGBDYWxsZWQgdG9nZ2xlKCkgb24gJHtjb250cm9sTmFtZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgIGxvZ1N0ZXAoYEQzNjUgY29udHJvbCBtZXRob2QgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKGBTZWN0aW9uICR7Y29udHJvbE5hbWV9IGFscmVhZHkgJHthY3Rpb259ZWQsIG5vIHRvZ2dsZSBuZWVkZWRgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgU2VjdGlvbiAke2NvbnRyb2xOYW1lfSAke2FjdGlvbn1lZGApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29uZmlndXJlUXVlcnlGaWx0ZXIodGFibGVOYW1lLCBmaWVsZE5hbWUsIGNyaXRlcmlhVmFsdWUsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgbG9nU3RlcChgQ29uZmlndXJpbmcgcXVlcnkgZmlsdGVyOiAke3RhYmxlTmFtZSA/IHRhYmxlTmFtZSArICcuJyA6ICcnfSR7ZmllbGROYW1lfSA9ICR7Y3JpdGVyaWFWYWx1ZX1gKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCBvciBvcGVuIHRoZSBxdWVyeSBmaWx0ZXIgZGlhbG9nXHJcbiAgICBsZXQgcXVlcnlGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1F1ZXJ5Rm9ybVwiXScpO1xyXG4gICAgaWYgKCFxdWVyeUZvcm0pIHtcclxuICAgICAgICAvLyBUcnkgdG8gb3BlbiB0aGUgcXVlcnkgZGlhbG9nIHZpYSBRdWVyeSBidXR0b25cclxuICAgICAgICBjb25zdCBmaWx0ZXJCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJRdWVyeVNlbGVjdEJ1dHRvblwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJRdWVyeVwiXScpO1xyXG4gICAgICAgIGlmIChmaWx0ZXJCdXR0b24pIHtcclxuICAgICAgICAgICAgZmlsdGVyQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgICAgICBxdWVyeUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXF1ZXJ5Rm9ybSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUXVlcnkgZmlsdGVyIGRpYWxvZyAoU3lzUXVlcnlGb3JtKSBub3QgZm91bmQuIE1ha2Ugc3VyZSB0aGUgZmlsdGVyIGRpYWxvZyBpcyBvcGVuLicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIZWxwZXIgdG8gZmluZCBlbGVtZW50IHdpdGhpbiBxdWVyeSBmb3JtXHJcbiAgICBjb25zdCBmaW5kSW5RdWVyeSA9IChuYW1lKSA9PiBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtuYW1lfVwiXWApO1xyXG4gICAgXHJcbiAgICAvLyBJZiBzYXZlZFF1ZXJ5IGlzIHNwZWNpZmllZCwgc2VsZWN0IGl0IGZyb20gdGhlIGRyb3Bkb3duIGZpcnN0XHJcbiAgICBpZiAob3B0aW9ucy5zYXZlZFF1ZXJ5KSB7XHJcbiAgICAgICAgY29uc3Qgc2F2ZWRRdWVyeUJveCA9IGZpbmRJblF1ZXJ5KCdTYXZlZFF1ZXJpZXNCb3gnKTtcclxuICAgICAgICBpZiAoc2F2ZWRRdWVyeUJveCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IHNhdmVkUXVlcnlCb3gucXVlcnlTZWxlY3RvcignaW5wdXQnKTtcclxuICAgICAgICAgICAgaWYgKGlucHV0KSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5jbGljaygpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIG9wdGlvbnMuc2F2ZWRRdWVyeSwgb3B0aW9ucy5jb21ib1NlbGVjdE1vZGUgfHwgJycpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTWFrZSBzdXJlIHdlJ3JlIG9uIHRoZSBSYW5nZSB0YWJcclxuICAgIGNvbnN0IHJhbmdlVGFiID0gZmluZEluUXVlcnkoJ1JhbmdlVGFiJykgfHwgZmluZEluUXVlcnkoJ1JhbmdlVGFiX2hlYWRlcicpO1xyXG4gICAgaWYgKHJhbmdlVGFiICYmICFyYW5nZVRhYi5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpICYmIHJhbmdlVGFiLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpICE9PSAndHJ1ZScpIHtcclxuICAgICAgICByYW5nZVRhYi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENsaWNrIEFkZCB0byBhZGQgYSBuZXcgZmlsdGVyIHJvd1xyXG4gICAgY29uc3QgYWRkQnV0dG9uID0gZmluZEluUXVlcnkoJ1JhbmdlQWRkJyk7XHJcbiAgICBpZiAoYWRkQnV0dG9uKSB7XHJcbiAgICAgICAgYWRkQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGhlIGdyaWQgdXNlcyBSZWFjdExpc3QgLSBmaW5kIHRoZSBsYXN0IHJvdyAobmV3bHkgYWRkZWQpIGFuZCBmaWxsIGluIHZhbHVlc1xyXG4gICAgY29uc3QgZ3JpZCA9IGZpbmRJblF1ZXJ5KCdSYW5nZUdyaWQnKTtcclxuICAgIGlmICghZ3JpZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUmFuZ2UgZ3JpZCBub3QgZm91bmQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gR2V0IGFsbCByb3dzIGFuZCBmaW5kIHRoZSBsYXN0IG9uZSAobW9zdCByZWNlbnRseSBhZGRlZClcclxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicm93XCJdLCB0ciwgLmxpc3Qtcm93Jyk7XHJcbiAgICBjb25zdCBsYXN0Um93ID0gcm93c1tyb3dzLmxlbmd0aCAtIDFdIHx8IGdyaWQ7XHJcbiAgICBcclxuICAgIC8vIFNldCB0YWJsZSBuYW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAodGFibGVOYW1lKSB7XHJcbiAgICAgICAgY29uc3QgdGFibGVDZWxsID0gbGFzdFJvdy5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVRhYmxlXCJdJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVGFibGVcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0VGFibGVDZWxsID0gdGFibGVDZWxsLmxlbmd0aCA/IHRhYmxlQ2VsbFt0YWJsZUNlbGwubGVuZ3RoIC0gMV0gOiB0YWJsZUNlbGw7XHJcbiAgICAgICAgaWYgKGxhc3RUYWJsZUNlbGwpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBsYXN0VGFibGVDZWxsLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgbGFzdFRhYmxlQ2VsbDtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShpbnB1dCwgdGFibGVOYW1lLCBvcHRpb25zLmNvbWJvU2VsZWN0TW9kZSB8fCAnJyk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgZmllbGQgbmFtZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKGZpZWxkTmFtZSkge1xyXG4gICAgICAgIGNvbnN0IGZpZWxkQ2VsbHMgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlRmllbGRcIl0nKTtcclxuICAgICAgICBjb25zdCBsYXN0RmllbGRDZWxsID0gZmllbGRDZWxsc1tmaWVsZENlbGxzLmxlbmd0aCAtIDFdIHx8IGdyaWQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VGaWVsZFwiXScpO1xyXG4gICAgICAgIGlmIChsYXN0RmllbGRDZWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbGFzdEZpZWxkQ2VsbC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpIHx8IGxhc3RGaWVsZENlbGw7XHJcbiAgICAgICAgICAgIC8vIENsaWNrIHRvIG9wZW4gZHJvcGRvd24vZm9jdXNcclxuICAgICAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCBmaWVsZE5hbWUsIG9wdGlvbnMuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBjcml0ZXJpYSB2YWx1ZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKGNyaXRlcmlhVmFsdWUpIHtcclxuICAgICAgICBjb25zdCB2YWx1ZUNlbGxzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJSYW5nZVZhbHVlXCJdJyk7XHJcbiAgICAgICAgY29uc3QgbGFzdFZhbHVlQ2VsbCA9IHZhbHVlQ2VsbHNbdmFsdWVDZWxscy5sZW5ndGggLSAxXSB8fCBncmlkLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIlJhbmdlVmFsdWVcIl0nKTtcclxuICAgICAgICBpZiAobGFzdFZhbHVlQ2VsbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGxhc3RWYWx1ZUNlbGwucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBsYXN0VmFsdWVDZWxsO1xyXG4gICAgICAgICAgICBpbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGNyaXRlcmlhVmFsdWUsIG9wdGlvbnMuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvZ1N0ZXAoJ1F1ZXJ5IGZpbHRlciBjb25maWd1cmVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVCYXRjaFByb2Nlc3NpbmcoZW5hYmxlZCwgdGFza0Rlc2NyaXB0aW9uLCBiYXRjaEdyb3VwLCBvcHRpb25zID0ge30pIHtcclxuICAgIGxvZ1N0ZXAoYENvbmZpZ3VyaW5nIGJhdGNoIHByb2Nlc3Npbmc6ICR7ZW5hYmxlZCA/ICdlbmFibGVkJyA6ICdkaXNhYmxlZCd9YCk7XHJcbiAgICBcclxuICAgIC8vIFdhaXQgZm9yIGRpYWxvZyB0byBiZSByZWFkeVxyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCB0aGUgYmF0Y2ggcHJvY2Vzc2luZyBjaGVja2JveCAtIGNvbnRyb2wgbmFtZSBpcyBGbGQxXzEgaW4gU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXHJcbiAgICBjb25zdCBiYXRjaFRvZ2dsZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNPcGVyYXRpb25UZW1wbGF0ZUZvcm1cIl0gW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiRmxkMV8xXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoJ0ZsZDFfMScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZsZDFfMVwiXScpO1xyXG4gICAgXHJcbiAgICBpZiAoYmF0Y2hUb2dnbGUpIHtcclxuICAgICAgICAvLyBGaW5kIHRoZSBhY3R1YWwgY2hlY2tib3ggaW5wdXQgb3IgdG9nZ2xlIGJ1dHRvblxyXG4gICAgICAgIGNvbnN0IGNoZWNrYm94ID0gYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hUb2dnbGUucXVlcnlTZWxlY3RvcignW3JvbGU9XCJjaGVja2JveFwiXScpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJy50b2dnbGUtYnV0dG9uJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gY2hlY2tib3g/LmNoZWNrZWQgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5jbGFzc0xpc3QuY29udGFpbnMoJ29uJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFRvZ2dsZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRTdGF0ZSAhPT0gZW5hYmxlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGNoZWNrYm94IHx8IGJhdGNoVG9nZ2xlLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbiwgLnRvZ2dsZS1zd2l0Y2gsIGxhYmVsJykgfHwgYmF0Y2hUb2dnbGU7XHJcbiAgICAgICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDUwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dTdGVwKCdXYXJuaW5nOiBCYXRjaCBwcm9jZXNzaW5nIHRvZ2dsZSAoRmxkMV8xKSBub3QgZm91bmQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IHRhc2sgZGVzY3JpcHRpb24gaWYgcHJvdmlkZWQgYW5kIGJhdGNoIGlzIGVuYWJsZWQgKEZsZDJfMSlcclxuICAgIGlmIChlbmFibGVkICYmIHRhc2tEZXNjcmlwdGlvbikge1xyXG4gICAgICAgIGF3YWl0IHNldElucHV0VmFsdWUoJ0ZsZDJfMScsIHRhc2tEZXNjcmlwdGlvbik7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGJhdGNoIGdyb3VwIGlmIHByb3ZpZGVkIGFuZCBiYXRjaCBpcyBlbmFibGVkIChGbGQzXzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBiYXRjaEdyb3VwKSB7XHJcbiAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZSgnRmxkM18xJywgYmF0Y2hHcm91cCk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IFByaXZhdGUgYW5kIENyaXRpY2FsIG9wdGlvbnMgaWYgcHJvdmlkZWQgKEZsZDRfMSBhbmQgRmxkNV8xKVxyXG4gICAgaWYgKGVuYWJsZWQgJiYgb3B0aW9ucy5wcml2YXRlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBzZXRDaGVja2JveCgnRmxkNF8xJywgb3B0aW9ucy5wcml2YXRlKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLmNyaXRpY2FsSm9iICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhd2FpdCBzZXRDaGVja2JveCgnRmxkNV8xJywgb3B0aW9ucy5jcml0aWNhbEpvYik7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IE1vbml0b3JpbmcgY2F0ZWdvcnkgaWYgc3BlY2lmaWVkIChGbGQ2XzEpXHJcbiAgICBpZiAoZW5hYmxlZCAmJiBvcHRpb25zLm1vbml0b3JpbmdDYXRlZ29yeSkge1xyXG4gICAgICAgIGF3YWl0IHNldENvbWJvQm94VmFsdWUoJ0ZsZDZfMScsIG9wdGlvbnMubW9uaXRvcmluZ0NhdGVnb3J5KTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdCYXRjaCBwcm9jZXNzaW5nIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZVJlY3VycmVuY2Uoc3RlcCkge1xyXG4gICAgY29uc3QgeyBwYXR0ZXJuVW5pdCwgcGF0dGVybkNvdW50LCBlbmREYXRlT3B0aW9uLCBlbmRBZnRlckNvdW50LCBlbmRCeURhdGUsIHN0YXJ0RGF0ZSwgc3RhcnRUaW1lLCB0aW1lem9uZSB9ID0gc3RlcDtcclxuICAgIFxyXG4gICAgY29uc3QgcGF0dGVyblVuaXRzID0gWydtaW51dGVzJywgJ2hvdXJzJywgJ2RheXMnLCAnd2Vla3MnLCAnbW9udGhzJywgJ3llYXJzJ107XHJcbiAgICBsb2dTdGVwKGBDb25maWd1cmluZyByZWN1cnJlbmNlOiBldmVyeSAke3BhdHRlcm5Db3VudH0gJHtwYXR0ZXJuVW5pdHNbcGF0dGVyblVuaXQgfHwgMF19YCk7XHJcbiAgICBcclxuICAgIC8vIENsaWNrIFJlY3VycmVuY2UgYnV0dG9uIHRvIG9wZW4gZGlhbG9nIGlmIG5vdCBhbHJlYWR5IG9wZW5cclxuICAgIGxldCByZWN1cnJlbmNlRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICBpZiAoIXJlY3VycmVuY2VGb3JtKSB7XHJcbiAgICAgICAgLy8gTW51SXRtXzEgaXMgdGhlIFJlY3VycmVuY2UgYnV0dG9uIGluIFN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVxyXG4gICAgICAgIGNvbnN0IHJlY3VycmVuY2VCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzT3BlcmF0aW9uVGVtcGxhdGVGb3JtXCJdIFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1udUl0bV8xXCJdJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCgnTW51SXRtXzEnKTtcclxuICAgICAgICBpZiAocmVjdXJyZW5jZUJ1dHRvbikge1xyXG4gICAgICAgICAgICByZWN1cnJlbmNlQnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMDApO1xyXG4gICAgICAgICAgICByZWN1cnJlbmNlRm9ybSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWU9XCJTeXNSZWN1cnJlbmNlXCJdJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXJlY3VycmVuY2VGb3JtKSB7XHJcbiAgICAgICAgbG9nU3RlcCgnV2FybmluZzogQ291bGQgbm90IG9wZW4gU3lzUmVjdXJyZW5jZSBkaWFsb2cnKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEhlbHBlciB0byBmaW5kIGVsZW1lbnQgd2l0aGluIHJlY3VycmVuY2UgZm9ybVxyXG4gICAgY29uc3QgZmluZEluUmVjdXJyZW5jZSA9IChuYW1lKSA9PiByZWN1cnJlbmNlRm9ybS5xdWVyeVNlbGVjdG9yKGBbZGF0YS1keW4tY29udHJvbG5hbWU9XCIke25hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIC8vIFNldCBzdGFydCBkYXRlIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoc3RhcnREYXRlKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnREYXRlSW5wdXQgPSBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydERhdGUnKT8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydERhdGUnKTtcclxuICAgICAgICBpZiAoc3RhcnREYXRlSW5wdXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShzdGFydERhdGVJbnB1dCwgc3RhcnREYXRlKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBzdGFydCB0aW1lIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoc3RhcnRUaW1lKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRUaW1lSW5wdXQgPSBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydFRpbWUnKT8ucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kSW5SZWN1cnJlbmNlKCdTdGFydFRpbWUnKTtcclxuICAgICAgICBpZiAoc3RhcnRUaW1lSW5wdXQpIHtcclxuICAgICAgICAgICAgYXdhaXQgc2V0SW5wdXRWYWx1ZUluRm9ybShzdGFydFRpbWVJbnB1dCwgc3RhcnRUaW1lKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCB0aW1lem9uZSBpZiBwcm92aWRlZFxyXG4gICAgaWYgKHRpbWV6b25lKSB7XHJcbiAgICAgICAgY29uc3QgdGltZXpvbmVDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnVGltZXpvbmUnKTtcclxuICAgICAgICBpZiAodGltZXpvbmVDb250cm9sKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gdGltZXpvbmVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7XHJcbiAgICAgICAgICAgIGlmIChpbnB1dCkge1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlSW5Gb3JtKGlucHV0LCB0aW1lem9uZSk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTZXQgcGF0dGVybiB1bml0IChyYWRpbyBidXR0b25zOiBNaW51dGVzPTAsIEhvdXJzPTEsIERheXM9MiwgV2Vla3M9MywgTW9udGhzPTQsIFllYXJzPTUpXHJcbiAgICBpZiAocGF0dGVyblVuaXQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGNvbnN0IHBhdHRlcm5Vbml0Q29udHJvbCA9IGZpbmRJblJlY3VycmVuY2UoJ1BhdHRlcm5Vbml0Jyk7XHJcbiAgICAgICAgaWYgKHBhdHRlcm5Vbml0Q29udHJvbCkge1xyXG4gICAgICAgICAgICAvLyBSYWRpbyBidXR0b25zIGFyZSB0eXBpY2FsbHkgcmVuZGVyZWQgYXMgYSBncm91cCB3aXRoIG11bHRpcGxlIG9wdGlvbnNcclxuICAgICAgICAgICAgY29uc3QgcmFkaW9JbnB1dHMgPSBwYXR0ZXJuVW5pdENvbnRyb2wucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInJhZGlvXCJdJyk7XHJcbiAgICAgICAgICAgIGlmIChyYWRpb0lucHV0cy5sZW5ndGggPiBwYXR0ZXJuVW5pdCkge1xyXG4gICAgICAgICAgICAgICAgcmFkaW9JbnB1dHNbcGF0dGVyblVuaXRdLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApOyAvLyBXYWl0IGZvciBVSSB0byB1cGRhdGUgd2l0aCBhcHByb3ByaWF0ZSBpbnRlcnZhbCBmaWVsZFxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IGNsaWNraW5nIHRoZSBudGggb3B0aW9uIGxhYmVsL2J1dHRvblxyXG4gICAgICAgICAgICAgICAgY29uc3QgcmFkaW9PcHRpb25zID0gcGF0dGVyblVuaXRDb250cm9sLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwicmFkaW9cIl0sIGxhYmVsLCBidXR0b24nKTtcclxuICAgICAgICAgICAgICAgIGlmIChyYWRpb09wdGlvbnMubGVuZ3RoID4gcGF0dGVyblVuaXQpIHtcclxuICAgICAgICAgICAgICAgICAgICByYWRpb09wdGlvbnNbcGF0dGVyblVuaXRdLmNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2V0IGludGVydmFsIGNvdW50IGJhc2VkIG9uIHBhdHRlcm4gdW5pdFxyXG4gICAgLy8gVGhlIHZpc2libGUgaW5wdXQgZmllbGQgY2hhbmdlcyBiYXNlZCBvbiBzZWxlY3RlZCBwYXR0ZXJuIHVuaXRcclxuICAgIGlmIChwYXR0ZXJuQ291bnQpIHtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2xOYW1lcyA9IFsnTWludXRlSW50JywgJ0hvdXJJbnQnLCAnRGF5SW50JywgJ1dlZWtJbnQnLCAnTW9udGhJbnQnLCAnWWVhckludCddO1xyXG4gICAgICAgIGNvbnN0IGNvdW50Q29udHJvbE5hbWUgPSBjb3VudENvbnRyb2xOYW1lc1twYXR0ZXJuVW5pdCB8fCAwXTtcclxuICAgICAgICBjb25zdCBjb3VudENvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKGNvdW50Q29udHJvbE5hbWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb3VudENvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBjb3VudENvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBjb3VudENvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIHBhdHRlcm5Db3VudC50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNldCBlbmQgZGF0ZSBvcHRpb25zXHJcbiAgICBpZiAoZW5kRGF0ZU9wdGlvbiA9PT0gJ25vRW5kRGF0ZScpIHtcclxuICAgICAgICAvLyBDbGljayBvbiBcIk5vIGVuZCBkYXRlXCIgZ3JvdXAgKEVuZERhdGUxKVxyXG4gICAgICAgIGNvbnN0IG5vRW5kRGF0ZUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTEnKTtcclxuICAgICAgICBpZiAobm9FbmREYXRlR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBub0VuZERhdGVHcm91cC5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwicmFkaW9cIl0sIFtyb2xlPVwicmFkaW9cIl0nKSB8fCBub0VuZERhdGVHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGVuZERhdGVPcHRpb24gPT09ICdlbmRBZnRlcicgJiYgZW5kQWZ0ZXJDb3VudCkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGFmdGVyXCIgZ3JvdXAgKEVuZERhdGUyKSBhbmQgc2V0IGNvdW50XHJcbiAgICAgICAgY29uc3QgZW5kQWZ0ZXJHcm91cCA9IGZpbmRJblJlY3VycmVuY2UoJ0VuZERhdGUyJyk7XHJcbiAgICAgICAgaWYgKGVuZEFmdGVyR3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmFkaW8gPSBlbmRBZnRlckdyb3VwLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJyYWRpb1wiXSwgW3JvbGU9XCJyYWRpb1wiXScpIHx8IGVuZEFmdGVyR3JvdXA7XHJcbiAgICAgICAgICAgIHJhZGlvLmNsaWNrKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFNldCB0aGUgY291bnQgKEVuZERhdGVJbnQpXHJcbiAgICAgICAgY29uc3QgY291bnRDb250cm9sID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZUludCcpO1xyXG4gICAgICAgIGlmIChjb3VudENvbnRyb2wpIHtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBjb3VudENvbnRyb2wucXVlcnlTZWxlY3RvcignaW5wdXQnKSB8fCBjb3VudENvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGVuZEFmdGVyQ291bnQudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlbmREYXRlT3B0aW9uID09PSAnZW5kQnknICYmIGVuZEJ5RGF0ZSkge1xyXG4gICAgICAgIC8vIENsaWNrIG9uIFwiRW5kIGJ5XCIgZ3JvdXAgKEVuZERhdGUzKSBhbmQgc2V0IGRhdGVcclxuICAgICAgICBjb25zdCBlbmRCeUdyb3VwID0gZmluZEluUmVjdXJyZW5jZSgnRW5kRGF0ZTMnKTtcclxuICAgICAgICBpZiAoZW5kQnlHcm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCByYWRpbyA9IGVuZEJ5R3JvdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInJhZGlvXCJdLCBbcm9sZT1cInJhZGlvXCJdJykgfHwgZW5kQnlHcm91cDtcclxuICAgICAgICAgICAgcmFkaW8uY2xpY2soKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gU2V0IHRoZSBlbmQgZGF0ZSAoRW5kRGF0ZURhdGUpXHJcbiAgICAgICAgY29uc3QgZGF0ZUNvbnRyb2wgPSBmaW5kSW5SZWN1cnJlbmNlKCdFbmREYXRlRGF0ZScpO1xyXG4gICAgICAgIGlmIChkYXRlQ29udHJvbCkge1xyXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRhdGVDb250cm9sLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgfHwgZGF0ZUNvbnRyb2w7XHJcbiAgICAgICAgICAgIGF3YWl0IHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXQsIGVuZEJ5RGF0ZSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBsb2dTdGVwKCdSZWN1cnJlbmNlIGNvbmZpZ3VyZWQnKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldElucHV0VmFsdWVJbkZvcm0oaW5wdXRFbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSA9ICcnKSB7XHJcbiAgICBpZiAoIWlucHV0RWxlbWVudCkgcmV0dXJuO1xyXG4gICAgXHJcbiAgICAvLyBGb2N1cyB0aGUgaW5wdXRcclxuICAgIGlucHV0RWxlbWVudC5mb2N1cygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gQ2xlYXIgZXhpc3RpbmcgdmFsdWVcclxuICAgIGlucHV0RWxlbWVudC5zZWxlY3Q/LigpO1xyXG4gICAgXHJcbiAgICBpZiAoY29tYm9NZXRob2RPdmVycmlkZSAmJiBpbnB1dEVsZW1lbnQudGFnTmFtZSAhPT0gJ1NFTEVDVCcpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0RWxlbWVudCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBLZWVwIGV4aXN0aW5nIGJlaGF2aW9yIGZvciBjYWxsZXJzIHRoYXQgZG8gbm90IHJlcXVlc3QgYW4gb3ZlcnJpZGVcclxuICAgICAgICBpbnB1dEVsZW1lbnQudmFsdWUgPSB2YWx1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRGlzcGF0Y2ggZXZlbnRzXHJcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRGaWx0ZXJNZXRob2QoZmlsdGVyQ29udGFpbmVyLCBtZXRob2QpIHtcclxuICAgIC8vIEZpbmQgdGhlIGZpbHRlciBvcGVyYXRvciBkcm9wZG93biBuZWFyIHRoZSBmaWx0ZXIgaW5wdXRcclxuICAgIC8vIEQzNjUgdXNlcyB2YXJpb3VzIHBhdHRlcm5zIGZvciB0aGUgb3BlcmF0b3IgZHJvcGRvd25cclxuICAgIGNvbnN0IG9wZXJhdG9yUGF0dGVybnMgPSBbXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJGaWx0ZXJPcGVyYXRvclwiXScsXHJcbiAgICAgICAgJ1tkYXRhLWR5bi1jb250cm9sbmFtZSo9XCJfT3BlcmF0b3JcIl0nLFxyXG4gICAgICAgICcuZmlsdGVyLW9wZXJhdG9yJyxcclxuICAgICAgICAnW2RhdGEtZHluLXJvbGU9XCJDb21ib0JveFwiXSdcclxuICAgIF07XHJcbiAgICBcclxuICAgIGxldCBvcGVyYXRvckRyb3Bkb3duID0gbnVsbDtcclxuICAgIGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IGZpbHRlckNvbnRhaW5lcj8ucGFyZW50RWxlbWVudCB8fCBkb2N1bWVudDtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIG9wZXJhdG9yUGF0dGVybnMpIHtcclxuICAgICAgICBvcGVyYXRvckRyb3Bkb3duID0gc2VhcmNoQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IocGF0dGVybik7XHJcbiAgICAgICAgaWYgKG9wZXJhdG9yRHJvcGRvd24gJiYgb3BlcmF0b3JEcm9wZG93bi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIW9wZXJhdG9yRHJvcGRvd24pIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICBcdTI2QTAgRmlsdGVyIG9wZXJhdG9yIGRyb3Bkb3duIG5vdCBmb3VuZCwgdXNpbmcgZGVmYXVsdCBtZXRob2RgKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENsaWNrIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICBjb25zdCBkcm9wZG93bkJ1dHRvbiA9IG9wZXJhdG9yRHJvcGRvd24ucXVlcnlTZWxlY3RvcignYnV0dG9uLCBbcm9sZT1cImNvbWJvYm94XCJdLCAuZHluLWNvbWJvQm94LWJ1dHRvbicpIHx8IG9wZXJhdG9yRHJvcGRvd247XHJcbiAgICBkcm9wZG93bkJ1dHRvbi5jbGljaygpO1xyXG4gICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCBhbmQgY2xpY2sgdGhlIG1hdGNoaW5nIG9wdGlvblxyXG4gICAgY29uc3Qgc2VhcmNoVGVybXMgPSBnZXRGaWx0ZXJNZXRob2RTZWFyY2hUZXJtcyhtZXRob2QpO1xyXG4gICAgXHJcbiAgICAvLyBMb29rIGZvciBvcHRpb25zIGluIGxpc3Rib3gvZHJvcGRvd25cclxuICAgIGNvbnN0IG9wdGlvbnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cIm9wdGlvblwiXSwgW3JvbGU9XCJsaXN0aXRlbVwiXSwgLmR5bi1saXN0Vmlldy1pdGVtJyk7XHJcbiAgICBmb3IgKGNvbnN0IG9wdCBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IG9wdC50ZXh0Q29udGVudC50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGlmICh0ZXh0SW5jbHVkZXNBbnkodGV4dCwgc2VhcmNoVGVybXMpKSB7XHJcbiAgICAgICAgICAgIG9wdC5jbGljaygpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgyMDApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICBTZXQgZmlsdGVyIG1ldGhvZDogJHttZXRob2R9YCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRyeSBzZWxlY3QgZWxlbWVudFxyXG4gICAgY29uc3Qgc2VsZWN0RWwgPSBvcGVyYXRvckRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xyXG4gICAgaWYgKHNlbGVjdEVsKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBvcHQgb2Ygc2VsZWN0RWwub3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gb3B0LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIGlmICh0ZXh0SW5jbHVkZXNBbnkodGV4dCwgc2VhcmNoVGVybXMpKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxlY3RFbC52YWx1ZSA9IG9wdC52YWx1ZTtcclxuICAgICAgICAgICAgICAgIHNlbGVjdEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2xlZXAoMjAwKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFNldCBmaWx0ZXIgbWV0aG9kOiAke21ldGhvZH1gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYCAgXHUyNkEwIENvdWxkIG5vdCBzZXQgZmlsdGVyIG1ldGhvZCBcIiR7bWV0aG9kfVwiLCB1c2luZyBkZWZhdWx0YCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRSYWRpb0J1dHRvblZhbHVlKGVsZW1lbnQsIHZhbHVlKSB7XHJcbiAgICBsb2dTdGVwKGBTZXR0aW5nIHJhZGlvIGJ1dHRvbiB2YWx1ZTogJHt2YWx1ZX1gKTtcclxuICAgIFxyXG4gICAgLy8gRmluZCBhbGwgcmFkaW8gb3B0aW9ucyBpbiB0aGlzIGdyb3VwXHJcbiAgICBjb25zdCByYWRpb0lucHV0cyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT1cInJhZGlvXCJdJyk7XHJcbiAgICBjb25zdCByYWRpb1JvbGVzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cInJhZGlvXCJdJyk7XHJcbiAgICBjb25zdCBvcHRpb25zID0gcmFkaW9JbnB1dHMubGVuZ3RoID4gMCA/IEFycmF5LmZyb20ocmFkaW9JbnB1dHMpIDogQXJyYXkuZnJvbShyYWRpb1JvbGVzKTtcclxuICAgIFxyXG4gICAgaWYgKG9wdGlvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgLy8gVHJ5IGZpbmRpbmcgY2xpY2thYmxlIGxhYmVscy9idXR0b25zIHRoYXQgYWN0IGFzIHJhZGlvIG9wdGlvbnNcclxuICAgICAgICBjb25zdCBsYWJlbEJ1dHRvbnMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2xhYmVsLCBidXR0b24sIFtkYXRhLWR5bi1yb2xlPVwiUmFkaW9CdXR0b25cIl0nKTtcclxuICAgICAgICBvcHRpb25zLnB1c2goLi4uQXJyYXkuZnJvbShsYWJlbEJ1dHRvbnMpKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKG9wdGlvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyByYWRpbyBvcHRpb25zIGZvdW5kIGluIGVsZW1lbnRgKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9nU3RlcChgRm91bmQgJHtvcHRpb25zLmxlbmd0aH0gcmFkaW8gb3B0aW9uc2ApO1xyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gbWF0Y2ggYnkgaW5kZXggKGlmIHZhbHVlIGlzIGEgbnVtYmVyIG9yIG51bWVyaWMgc3RyaW5nKVxyXG4gICAgY29uc3QgbnVtVmFsdWUgPSBwYXJzZUludCh2YWx1ZSwgMTApO1xyXG4gICAgaWYgKCFpc05hTihudW1WYWx1ZSkgJiYgbnVtVmFsdWUgPj0gMCAmJiBudW1WYWx1ZSA8IG9wdGlvbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0T3B0aW9uID0gb3B0aW9uc1tudW1WYWx1ZV07XHJcbiAgICAgICAgbG9nU3RlcChgQ2xpY2tpbmcgcmFkaW8gb3B0aW9uIGF0IGluZGV4ICR7bnVtVmFsdWV9YCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2xpY2sgdGhlIHJhZGlvIG9wdGlvbiBvciBpdHMgYXNzb2NpYXRlZCBsYWJlbFxyXG4gICAgICAgIGNvbnN0IGNsaWNrVGFyZ2V0ID0gdGFyZ2V0T3B0aW9uLnRhZ05hbWUgPT09ICdJTlBVVCcgXHJcbiAgICAgICAgICAgID8gKHRhcmdldE9wdGlvbi5jbG9zZXN0KCdsYWJlbCcpIHx8IHRhcmdldE9wdGlvbi5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpIHx8IHRhcmdldE9wdGlvbilcclxuICAgICAgICAgICAgOiB0YXJnZXRPcHRpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRGlzcGF0Y2ggZnVsbCBjbGljayBzZXF1ZW5jZVxyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IFBvaW50ZXJFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgY2xpY2tUYXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVydXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWxzbyB0cnkgY2xpY2tpbmcgdGhlIGlucHV0IGRpcmVjdGx5XHJcbiAgICAgICAgaWYgKHRhcmdldE9wdGlvbi50YWdOYW1lID09PSAnSU5QVVQnKSB7XHJcbiAgICAgICAgICAgIHRhcmdldE9wdGlvbi5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGFyZ2V0T3B0aW9uLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIG1hdGNoIGJ5IGxhYmVsIHRleHRcclxuICAgIGNvbnN0IHNlYXJjaFZhbHVlID0gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xyXG4gICAgICAgIGNvbnN0IGxhYmVsID0gb3B0aW9uLmNsb3Nlc3QoJ2xhYmVsJykgfHwgb3B0aW9uLnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgb3B0aW9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpPy50b0xvd2VyQ2FzZSgpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgb3B0aW9uLnRleHRDb250ZW50Py50cmltKCkudG9Mb3dlckNhc2UoKSB8fCAnJztcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGV4dC5pbmNsdWRlcyhzZWFyY2hWYWx1ZSkgfHwgc2VhcmNoVmFsdWUuaW5jbHVkZXModGV4dCkpIHtcclxuICAgICAgICAgICAgbG9nU3RlcChgQ2xpY2tpbmcgcmFkaW8gb3B0aW9uIHdpdGggdGV4dDogJHt0ZXh0fWApO1xyXG4gICAgICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGxhYmVsIHx8IG9wdGlvbjtcclxuICAgICAgICAgICAgY2xpY2tUYXJnZXQuY2xpY2soKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChvcHRpb24udGFnTmFtZSA9PT0gJ0lOUFVUJykge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9uLmNoZWNrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgb3B0aW9uLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg1MDApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFJhZGlvIG9wdGlvbiBub3QgZm91bmQgZm9yIHZhbHVlOiAke3ZhbHVlfWApO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0U2VnbWVudGVkRW50cnlWYWx1ZShlbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSA9ICcnKSB7XHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXScpO1xyXG4gICAgaWYgKCFpbnB1dCkgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBub3QgZm91bmQgaW4gU2VnbWVudGVkRW50cnknKTtcclxuXHJcbiAgICAvLyBGaW5kIHRoZSBsb29rdXAgYnV0dG9uXHJcbiAgICBjb25zdCBsb29rdXBCdXR0b24gPSBmaW5kTG9va3VwQnV0dG9uKGVsZW1lbnQpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBubyBsb29rdXAgYnV0dG9uLCB0cnkga2V5Ym9hcmQgdG8gb3BlbiB0aGUgZmx5b3V0IGZpcnN0XHJcbiAgICBpZiAoIWxvb2t1cEJ1dHRvbikge1xyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IG9wZW5Mb29rdXBCeUtleWJvYXJkKGlucHV0KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDbGljayB0aGUgbG9va3VwIGJ1dHRvbiB0byBvcGVuIHRoZSBkcm9wZG93blxyXG4gICAgaWYgKGxvb2t1cEJ1dHRvbikge1xyXG4gICAgICAgIGxvb2t1cEJ1dHRvbi5jbGljaygpO1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDgwMCk7IC8vIFdhaXQgZm9yIGxvb2t1cCB0byBsb2FkXHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCB0aGUgbG9va3VwIHBvcHVwL2ZseW91dFxyXG4gICAgY29uc3QgbG9va3VwUG9wdXAgPSBhd2FpdCB3YWl0Rm9yTG9va3VwUG9wdXAoKTtcclxuICAgIGlmICghbG9va3VwUG9wdXApIHtcclxuICAgICAgICBpZiAoIXdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3M/LnN1cHByZXNzTG9va3VwV2FybmluZ3MpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdMb29rdXAgcG9wdXAgbm90IGZvdW5kLCB0cnlpbmcgZGlyZWN0IGlucHV0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHNldFZhbHVlV2l0aFZlcmlmeShpbnB1dCwgdmFsdWUpO1xyXG4gICAgICAgIGF3YWl0IGNvbW1pdExvb2t1cFZhbHVlKGlucHV0KTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgYSBkb2NrZWQgbG9va3VwIGZseW91dCBleGlzdHMgKHNlZ21lbnRlZCBlbnRyeSksIHR5cGUgaW50byBpdHMgZmlsdGVyIGlucHV0XHJcbiAgICBjb25zdCBkb2NrID0gYXdhaXQgd2FpdEZvckxvb2t1cERvY2tGb3JFbGVtZW50KGVsZW1lbnQsIDE1MDApO1xyXG4gICAgaWYgKGRvY2spIHtcclxuICAgICAgICBjb25zdCBkb2NrSW5wdXQgPSBmaW5kTG9va3VwRmlsdGVySW5wdXQoZG9jayk7XHJcbiAgICAgICAgaWYgKGRvY2tJbnB1dCkge1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuY2xpY2s/LigpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTApO1xyXG4gICAgICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGRvY2tJbnB1dCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgICAgICBkb2NrSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgZG9ja0lucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleXVwJywgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBhd2FpdCBzbGVlcCg4MDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBUeXBlIHZhbHVlIGluIHRoZSBzZWFyY2gvZmlsdGVyIGZpZWxkIG9mIHRoZSBsb29rdXBcclxuICAgIGNvbnN0IGxvb2t1cElucHV0ID0gbG9va3VwUG9wdXAucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cInRleHRcIl0sIGlucHV0W3JvbGU9XCJ0ZXh0Ym94XCJdJyk7XHJcbiAgICBpZiAobG9va3VwSW5wdXQpIHtcclxuICAgICAgICBsb29rdXBJbnB1dC5jbGljaz8uKCk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCg1MCk7XHJcbiAgICAgICAgYXdhaXQgY29tYm9JbnB1dFdpdGhTZWxlY3RlZE1ldGhvZChsb29rdXBJbnB1dCwgdmFsdWUsIGNvbWJvTWV0aG9kT3ZlcnJpZGUpO1xyXG4gICAgICAgIGxvb2t1cElucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgbG9va3VwSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMTAwMCk7IC8vIFdhaXQgZm9yIHNlcnZlciBmaWx0ZXJcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBhbmQgY2xpY2sgdGhlIG1hdGNoaW5nIHJvd1xyXG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IHdhaXRGb3JMb29rdXBSb3dzKGxvb2t1cFBvcHVwLCBlbGVtZW50LCA1MDAwKTtcclxuICAgIGxldCBmb3VuZE1hdGNoID0gZmFsc2U7XHJcbiAgICBcclxuICAgIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm93LnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XHJcbiAgICAgICAgaWYgKHRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSByb3cucXVlcnlTZWxlY3RvcignW3JvbGU9XCJncmlkY2VsbFwiXSwgdGQnKTtcclxuICAgICAgICAgICAgKGNlbGwgfHwgcm93KS5jbGljaygpO1xyXG4gICAgICAgICAgICBmb3VuZE1hdGNoID0gdHJ1ZTtcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNTAwKTtcclxuICAgICAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFmb3VuZE1hdGNoKSB7XHJcbiAgICAgICAgY29uc3Qgc2FtcGxlID0gQXJyYXkuZnJvbShyb3dzKS5zbGljZSgwLCA4KS5tYXAociA9PiByLnRleHRDb250ZW50LnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykpO1xyXG4gICAgICAgIGlmICghd2luZG93LmQzNjVDdXJyZW50V29ya2Zsb3dTZXR0aW5ncz8uc3VwcHJlc3NMb29rdXBXYXJuaW5ncykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ05vIG1hdGNoaW5nIGxvb2t1cCB2YWx1ZSBmb3VuZCwgY2xvc2luZyBwb3B1cCcsIHsgdmFsdWUsIHNhbXBsZSB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gVHJ5IHRvIGNsb3NlIHRoZSBwb3B1cFxyXG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gbG9va3VwUG9wdXAucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiQ2xvc2VcIl0sIC5jbG9zZS1idXR0b24nKTtcclxuICAgICAgICBpZiAoY2xvc2VCdG4pIGNsb3NlQnRuLmNsaWNrKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gZGlyZWN0IHR5cGluZ1xyXG4gICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgYXdhaXQgc2V0VmFsdWVXaXRoVmVyaWZ5KGlucHV0LCB2YWx1ZSk7XHJcbiAgICAgICAgYXdhaXQgY29tbWl0TG9va3VwVmFsdWUoaW5wdXQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0Q29tYm9Cb3hWYWx1ZShlbGVtZW50LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSA9ICcnKSB7XHJcbiAgICBjb25zdCBpbnB1dCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQsIFtyb2xlPVwidGV4dGJveFwiXSwgc2VsZWN0Jyk7XHJcbiAgICBpZiAoIWlucHV0KSB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IG5vdCBmb3VuZCBpbiBDb21ib0JveCcpO1xyXG5cclxuICAgIC8vIElmIGl0J3MgYSBuYXRpdmUgc2VsZWN0LCB1c2Ugb3B0aW9uIHNlbGVjdGlvblxyXG4gICAgaWYgKGlucHV0LnRhZ05hbWUgPT09ICdTRUxFQ1QnKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmZyb20oaW5wdXQub3B0aW9ucyk7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gb3B0aW9ucy5maW5kKG9wdCA9PiBvcHQudGV4dC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuZmluZChvcHQgPT4gb3B0LnRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCkpKTtcclxuICAgICAgICBpZiAoIXRhcmdldCkgdGhyb3cgbmV3IEVycm9yKGBPcHRpb24gbm90IGZvdW5kOiAke3ZhbHVlfWApO1xyXG4gICAgICAgIGlucHV0LnZhbHVlID0gdGFyZ2V0LnZhbHVlO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdibHVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBhd2FpdCBzbGVlcCgzMDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBPcGVuIHRoZSBkcm9wZG93biAoYnV0dG9uIHByZWZlcnJlZClcclxuICAgIGNvbnN0IGNvbWJvQnV0dG9uID0gZmluZENvbWJvQm94QnV0dG9uKGVsZW1lbnQpO1xyXG4gICAgaWYgKGNvbWJvQnV0dG9uKSB7XHJcbiAgICAgICAgY29tYm9CdXR0b24uY2xpY2soKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaW5wdXQuY2xpY2s/LigpO1xyXG4gICAgfVxyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGF3YWl0IHNsZWVwKDIwMCk7XHJcblxyXG4gICAgLy8gVHJ5IHR5cGluZyB0byBmaWx0ZXIgd2hlbiBhbGxvd2VkICh1c2Ugc2VsZWN0ZWQgaW5wdXQgbWV0aG9kKVxyXG4gICAgaWYgKCFpbnB1dC5yZWFkT25seSAmJiAhaW5wdXQuZGlzYWJsZWQpIHtcclxuICAgICAgICBhd2FpdCBjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kKGlucHV0LCB2YWx1ZSwgY29tYm9NZXRob2RPdmVycmlkZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBsaXN0Ym94IG5lYXIgdGhlIGZpZWxkIG9yIGxpbmtlZCB2aWEgYXJpYS1jb250cm9sc1xyXG4gICAgY29uc3QgbGlzdGJveCA9IGF3YWl0IHdhaXRGb3JMaXN0Ym94Rm9ySW5wdXQoaW5wdXQsIGVsZW1lbnQpO1xyXG4gICAgaWYgKCFsaXN0Ym94KSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IHByZXNzIEVudGVyIHRvIGNvbW1pdCB0eXBlZCB2YWx1ZVxyXG4gICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgYXdhaXQgc2xlZXAoMzAwKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgb3B0aW9ucyA9IGNvbGxlY3RDb21ib09wdGlvbnMobGlzdGJveCk7XHJcbiAgICBjb25zdCBzZWFyY2ggPSBub3JtYWxpemVUZXh0KHZhbHVlKTtcclxuICAgIGxldCBtYXRjaGVkID0gZmFsc2U7XHJcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQob3B0aW9uLnRleHRDb250ZW50KTtcclxuICAgICAgICBpZiAodGV4dCA9PT0gc2VhcmNoIHx8IHRleHQuaW5jbHVkZXMoc2VhcmNoKSkge1xyXG4gICAgICAgICAgICAvLyBUcnkgdG8gbWFyayBzZWxlY3Rpb24gZm9yIEFSSUEtYmFzZWQgY29tYm9ib3hlc1xyXG4gICAgICAgICAgICBvcHRpb25zLmZvckVhY2gob3B0ID0+IG9wdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAnZmFsc2UnKSk7XHJcbiAgICAgICAgICAgIG9wdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAndHJ1ZScpO1xyXG4gICAgICAgICAgICBpZiAoIW9wdGlvbi5pZCkge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9uLmlkID0gYGQzNjVvcHRfJHtEYXRlLm5vdygpfV8ke01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwKX1gO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jywgb3B0aW9uLmlkKTtcclxuXHJcbiAgICAgICAgICAgIG9wdGlvbi5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcgfSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvblRleHQgPSBvcHRpb24udGV4dENvbnRlbnQudHJpbSgpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xpY2sgdGhlIG9wdGlvbiB0byBzZWxlY3QgaXRcclxuICAgICAgICAgICAgZGlzcGF0Y2hDbGlja1NlcXVlbmNlKG9wdGlvbik7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhcHBsaWVkID0gYXdhaXQgd2FpdEZvcklucHV0VmFsdWUoaW5wdXQsIG9wdGlvblRleHQsIDgwMCk7XHJcbiAgICAgICAgICAgIGlmICghYXBwbGllZCkge1xyXG4gICAgICAgICAgICAgICAgLy8gU29tZSBEMzY1IGNvbWJvcyBjb21taXQgb24ga2V5IHNlbGVjdGlvbiByYXRoZXIgdGhhbiBjbGlja1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dEb3duJywgY29kZTogJ0Fycm93RG93bicsIGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5dXAnLCB7IGtleTogJ0Fycm93RG93bicsIGNvZGU6ICdBcnJvd0Rvd24nLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VudGVyJywgY29kZTogJ0VudGVyJywgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXl1cCcsIHsga2V5OiAnRW50ZXInLCBjb2RlOiAnRW50ZXInLCBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gRm9yY2UgaW5wdXQgdmFsdWUgdXBkYXRlIGZvciBEMzY1IGNvbWJvYm94ZXNcclxuICAgICAgICAgICAgYXdhaXQgc2xlZXAoNDAwKTtcclxuICAgICAgICAgICAgaWYgKG5vcm1hbGl6ZVRleHQoaW5wdXQudmFsdWUpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvblRleHQpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21taXRDb21ib1ZhbHVlKGlucHV0LCBvcHRpb25UZXh0LCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbW1pdENvbWJvVmFsdWUoaW5wdXQsIGlucHV0LnZhbHVlLCBlbGVtZW50KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDMwMCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW1hdGNoZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE9wdGlvbiBub3QgZm91bmQ6ICR7dmFsdWV9YCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGVja2JveChjb250cm9sTmFtZSwgY2hlY2tlZCkge1xyXG4gICAgY29uc3QgY29udGFpbmVyID0gZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQoY29udHJvbE5hbWUpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7Y29udHJvbE5hbWV9XCJdYCk7XHJcbiAgICBcclxuICAgIGlmICghY29udGFpbmVyKSB7XHJcbiAgICAgICAgbG9nU3RlcChgV2FybmluZzogQ2hlY2tib3ggJHtjb250cm9sTmFtZX0gbm90IGZvdW5kYCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBjaGVja2JveCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImNoZWNrYm94XCJdJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGNoZWNrYm94Py5jaGVja2VkIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSA9PT0gJ3RydWUnIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ29uJyk7XHJcbiAgICBcclxuICAgIGlmIChjdXJyZW50U3RhdGUgIT09IGNoZWNrZWQpIHtcclxuICAgICAgICBjb25zdCBjbGlja1RhcmdldCA9IGNoZWNrYm94IHx8IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdsYWJlbCwgYnV0dG9uJykgfHwgY29udGFpbmVyO1xyXG4gICAgICAgIGNsaWNrVGFyZ2V0LmNsaWNrKCk7XHJcbiAgICB9XHJcbn1cclxuIiwgImltcG9ydCBEMzY1SW5zcGVjdG9yIGZyb20gJy4vaW5zcGVjdG9yL0QzNjVJbnNwZWN0b3IuanMnO1xuaW1wb3J0IHsgbG9nU3RlcCwgc2VuZExvZyB9IGZyb20gJy4vdXRpbHMvbG9nZ2luZy5qcyc7XG5pbXBvcnQgeyBzbGVlcCB9IGZyb20gJy4vdXRpbHMvYXN5bmMuanMnO1xuaW1wb3J0IHsgY29lcmNlQm9vbGVhbiwgbm9ybWFsaXplVGV4dCB9IGZyb20gJy4vdXRpbHMvdGV4dC5qcyc7XG5pbXBvcnQgeyBOYXZpZ2F0aW9uSW50ZXJydXB0RXJyb3IgfSBmcm9tICcuL3J1bnRpbWUvZXJyb3JzLmpzJztcbmltcG9ydCB7IGdldFN0ZXBFcnJvckNvbmZpZywgZmluZExvb3BQYWlycywgZmluZElmUGFpcnMgfSBmcm9tICcuL3J1bnRpbWUvZW5naW5lLXV0aWxzLmpzJztcbmltcG9ydCB7IGV2YWx1YXRlQ29uZGl0aW9uIH0gZnJvbSAnLi9ydW50aW1lL2NvbmRpdGlvbnMuanMnO1xuaW1wb3J0IHsgY2xpY2tFbGVtZW50LCBhcHBseUdyaWRGaWx0ZXIsIHdhaXRVbnRpbENvbmRpdGlvbiwgc2V0SW5wdXRWYWx1ZSwgc2V0R3JpZENlbGxWYWx1ZSwgc2V0TG9va3VwU2VsZWN0VmFsdWUsIHNldENoZWNrYm94VmFsdWUsIG5hdmlnYXRlVG9Gb3JtLCBhY3RpdmF0ZVRhYiwgYWN0aXZhdGVBY3Rpb25QYW5lVGFiLCBleHBhbmRPckNvbGxhcHNlU2VjdGlvbiwgY29uZmlndXJlUXVlcnlGaWx0ZXIsIGNvbmZpZ3VyZUJhdGNoUHJvY2Vzc2luZywgY2xvc2VEaWFsb2csIGNvbmZpZ3VyZVJlY3VycmVuY2UgfSBmcm9tICcuL3N0ZXBzL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsIGlzRWxlbWVudFZpc2libGUsIGlzRDM2NUxvYWRpbmcgfSBmcm9tICcuL3V0aWxzL2RvbS5qcyc7XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0SW5qZWN0ZWQoeyB3aW5kb3dPYmogPSBnbG9iYWxUaGlzLndpbmRvdywgZG9jdW1lbnRPYmogPSBnbG9iYWxUaGlzLmRvY3VtZW50LCBpbnNwZWN0b3JGYWN0b3J5ID0gKCkgPT4gbmV3IEQzNjVJbnNwZWN0b3IoKSB9ID0ge30pIHtcbiAgICBpZiAoIXdpbmRvd09iaiB8fCAhZG9jdW1lbnRPYmopIHtcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ21pc3Npbmctd2luZG93LW9yLWRvY3VtZW50JyB9O1xuICAgIH1cbiAgICBjb25zdCB3aW5kb3cgPSB3aW5kb3dPYmo7XG4gICAgY29uc3QgZG9jdW1lbnQgPSBkb2N1bWVudE9iajtcbiAgICBjb25zdCBuYXZpZ2F0b3IgPSB3aW5kb3dPYmoubmF2aWdhdG9yIHx8IGdsb2JhbFRoaXMubmF2aWdhdG9yO1xuXG4gICAgd2luZG93LkQzNjVJbnNwZWN0b3IgPSBEMzY1SW5zcGVjdG9yO1xuXG4gICAgLy8gPT09PT09IEluaXRpYWxpemUgYW5kIExpc3RlbiBmb3IgTWVzc2FnZXMgPT09PT09XG5cbiAgICAvLyBQcmV2ZW50IGR1cGxpY2F0ZSBpbml0aWFsaXphdGlvblxuICAgIGlmICh3aW5kb3cuZDM2NUluamVjdGVkU2NyaXB0TG9hZGVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdEMzY1IGluamVjdGVkIHNjcmlwdCBhbHJlYWR5IGxvYWRlZCwgc2tpcHBpbmcuLi4nKTtcbiAgICAgICAgcmV0dXJuIHsgc3RhcnRlZDogZmFsc2UsIHJlYXNvbjogJ2FscmVhZHktbG9hZGVkJyB9O1xuICAgIH1cblxuICAgIHdpbmRvdy5kMzY1SW5qZWN0ZWRTY3JpcHRMb2FkZWQgPSB0cnVlO1xuXG4gICAgLy8gQ3JlYXRlIGluc3BlY3RvciBpbnN0YW5jZVxuICAgIGNvbnN0IGluc3BlY3RvciA9IGluc3BlY3RvckZhY3RvcnkoKTtcblxuICAgIC8vID09PT09PSBXb3JrZmxvdyBFeGVjdXRpb24gRW5naW5lID09PT09PVxuICAgIGxldCBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncyA9IHt9O1xuICAgIHdpbmRvdy5kMzY1Q3VycmVudFdvcmtmbG93U2V0dGluZ3MgPSBjdXJyZW50V29ya2Zsb3dTZXR0aW5ncztcbiAgICBsZXQgY3VycmVudFdvcmtmbG93ID0gbnVsbDtcbiAgICBsZXQgZXhlY3V0aW9uQ29udHJvbCA9IHtcbiAgICAgICAgaXNQYXVzZWQ6IGZhbHNlLFxuICAgICAgICBpc1N0b3BwZWQ6IGZhbHNlLFxuICAgICAgICBjdXJyZW50U3RlcEluZGV4OiAwLFxuICAgICAgICBjdXJyZW50Um93SW5kZXg6IDAsXG4gICAgICAgIHRvdGFsUm93czogMCxcbiAgICAgICAgY3VycmVudERhdGFSb3c6IG51bGwsXG4gICAgICAgIHBlbmRpbmdGbG93U2lnbmFsOiAnbm9uZScsXG4gICAgICAgIHBlbmRpbmdJbnRlcnJ1cHRpb25EZWNpc2lvbjogbnVsbCxcbiAgICAgICAgcnVuT3B0aW9uczoge1xuICAgICAgICAgICAgc2tpcFJvd3M6IDAsXG4gICAgICAgICAgICBsaW1pdFJvd3M6IDAsXG4gICAgICAgICAgICBkcnlSdW46IGZhbHNlLFxuICAgICAgICAgICAgbGVhcm5pbmdNb2RlOiBmYWxzZSxcbiAgICAgICAgICAgIHJ1blVudGlsSW50ZXJjZXB0aW9uOiBmYWxzZVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIFNpbmdsZSB1bmlmaWVkIG1lc3NhZ2UgbGlzdGVuZXJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoZXZlbnQuc291cmNlICE9PSB3aW5kb3cpIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIC8vIERpc2NvdmVyeSByZXF1ZXN0c1xuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9ESVNDT1ZFUl9FTEVNRU5UUycpIHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUZvcm1Pbmx5ID0gZXZlbnQuZGF0YS5hY3RpdmVGb3JtT25seSB8fCBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRzID0gaW5zcGVjdG9yLmRpc2NvdmVyRWxlbWVudHMoYWN0aXZlRm9ybU9ubHkpO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRm9ybSA9IGluc3BlY3Rvci5nZXRBY3RpdmVGb3JtTmFtZSgpO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9FTEVNRU5UU19ESVNDT1ZFUkVEJyxcbiAgICAgICAgICAgICAgICBlbGVtZW50czogZWxlbWVudHMubWFwKGVsID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIC4uLmVsLFxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB1bmRlZmluZWQgLy8gUmVtb3ZlIERPTSByZWZlcmVuY2UgZm9yIHNlcmlhbGl6YXRpb25cbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgYWN0aXZlRm9ybTogYWN0aXZlRm9ybVxuICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09ICdEMzY1X1NUQVJUX1BJQ0tFUicpIHtcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdGFydEVsZW1lbnRQaWNrZXIoKGVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBBZGQgZm9ybSBuYW1lIHRvIHBpY2tlZCBlbGVtZW50XG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBpbnNwZWN0b3IuZ2V0RWxlbWVudEZvcm1OYW1lKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1jb250cm9sbmFtZT1cIiR7ZWxlbWVudC5jb250cm9sTmFtZX1cIl1gKSk7XG4gICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfRUxFTUVOVF9QSUNLRUQnLFxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiB7IC4uLmVsZW1lbnQsIGZvcm1OYW1lIH1cbiAgICAgICAgICAgICAgICB9LCAnKicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9TVE9QX1BJQ0tFUicpIHtcbiAgICAgICAgICAgIGluc3BlY3Rvci5zdG9wRWxlbWVudFBpY2tlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWRtaW4gaW5zcGVjdGlvbiB0b29scyAtIHJ1biBkaXNjb3ZlcnkgZnVuY3Rpb25zIGFuZCByZXR1cm4gcmVzdWx0c1xuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9BRE1JTl9JTlNQRUNUJykge1xuICAgICAgICAgICAgY29uc3QgaW5zcGVjdGlvblR5cGUgPSBldmVudC5kYXRhLmluc3BlY3Rpb25UeXBlO1xuICAgICAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBldmVudC5kYXRhLmZvcm1OYW1lO1xuICAgICAgICAgICAgbGV0IHJlc3VsdDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IHJ1bkFkbWluSW5zcGVjdGlvbihpbnNwZWN0b3IsIGluc3BlY3Rpb25UeXBlLCBmb3JtTmFtZSwgZG9jdW1lbnQsIHdpbmRvdyk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0geyBzdWNjZXNzOiB0cnVlLCBpbnNwZWN0aW9uVHlwZSwgZGF0YSB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHsgc3VjY2VzczogZmFsc2UsIGluc3BlY3Rpb25UeXBlLCBlcnJvcjogZS5tZXNzYWdlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9BRE1JTl9JTlNQRUNUSU9OX1JFU1VMVCcsIHJlc3VsdCB9LCAnKicpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfRVhFQ1VURV9XT1JLRkxPVycpIHtcbiAgICAgICAgICAgIGV4ZWN1dGVXb3JrZmxvdyhldmVudC5kYXRhLndvcmtmbG93LCBldmVudC5kYXRhLmRhdGEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfTkFWX0JVVFRPTlNfVVBEQVRFJykge1xuICAgICAgICAgICAgdXBkYXRlTmF2QnV0dG9ucyhldmVudC5kYXRhLnBheWxvYWQpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBFeGVjdXRpb24gY29udHJvbHNcbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfUEFVU0VfV09SS0ZMT1cnKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9SRVNVTUVfV09SS0ZMT1cnKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ0QzNjVfU1RPUF9XT1JLRkxPVycpIHtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSAnRDM2NV9BUFBMWV9JTlRFUlJVUFRJT05fREVDSVNJT04nKSB7XG4gICAgICAgICAgICBleGVjdXRpb25Db250cm9sLnBlbmRpbmdJbnRlcnJ1cHRpb25EZWNpc2lvbiA9IGV2ZW50LmRhdGEucGF5bG9hZCB8fCBudWxsO1xuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBsZXQgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gbnVsbDtcbiAgICBsZXQgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBudWxsO1xuICAgIGxldCBuYXZCdXR0b25zT3V0c2lkZUNsaWNrSGFuZGxlciA9IG51bGw7XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVOYXZCdXR0b25zKHBheWxvYWQpIHtcbiAgICAgICAgcGVuZGluZ05hdkJ1dHRvbnNQYXlsb2FkID0gcGF5bG9hZCB8fCBudWxsO1xuICAgICAgICByZW5kZXJOYXZCdXR0b25zKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyTmF2QnV0dG9ucygpIHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IHBlbmRpbmdOYXZCdXR0b25zUGF5bG9hZDtcbiAgICAgICAgaWYgKCFwYXlsb2FkKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgbmF2R3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmF2aWdhdGlvbk1haW5BY3Rpb25Hcm91cCcpO1xuICAgICAgICBpZiAoIW5hdkdyb3VwKSB7XG4gICAgICAgICAgICBpZiAoIW5hdkJ1dHRvbnNSZXRyeVRpbWVyKSB7XG4gICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbmF2QnV0dG9uc1JldHJ5VGltZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJOYXZCdXR0b25zKCk7XG4gICAgICAgICAgICAgICAgfSwgMTAwMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleGlzdGluZ0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkMzY1LW5hdi1idXR0b25zLWNvbnRhaW5lcicpO1xuICAgICAgICBpZiAoZXhpc3RpbmdDb250YWluZXIpIHtcbiAgICAgICAgICAgIGV4aXN0aW5nQ29udGFpbmVyLnJlbW92ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IEFycmF5LmlzQXJyYXkocGF5bG9hZC5idXR0b25zKSA/IHBheWxvYWQuYnV0dG9ucyA6IFtdO1xuICAgICAgICBpZiAoIWJ1dHRvbnMubGVuZ3RoKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgY3VycmVudE1lbnVJdGVtID0gKHBheWxvYWQubWVudUl0ZW0gfHwgJycpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgY29uc3QgdmlzaWJsZUJ1dHRvbnMgPSBidXR0b25zLmZpbHRlcigoYnV0dG9uKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtZW51SXRlbXMgPSBBcnJheS5pc0FycmF5KGJ1dHRvbi5tZW51SXRlbXMpID8gYnV0dG9uLm1lbnVJdGVtcyA6IFtdO1xuICAgICAgICAgICAgaWYgKCFtZW51SXRlbXMubGVuZ3RoKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGlmICghY3VycmVudE1lbnVJdGVtKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gbWVudUl0ZW1zLnNvbWUoKGl0ZW0pID0+IChpdGVtIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSBjdXJyZW50TWVudUl0ZW0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIXZpc2libGVCdXR0b25zLmxlbmd0aCkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBjb250YWluZXIuaWQgPSAnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgY29udGFpbmVyLnN0eWxlLmdhcCA9ICc2cHgnO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgICAgICBjb250YWluZXIuc3R5bGUubWFyZ2luUmlnaHQgPSAnNnB4JztcblxuICAgICAgICBjb25zdCBydW5CdXR0b25Xb3JrZmxvdyA9IGFzeW5jIChidXR0b25Db25maWcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtmbG93ID0gYnV0dG9uQ29uZmlnLndvcmtmbG93O1xuICAgICAgICAgICAgaWYgKCF3b3JrZmxvdykge1xuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2Vycm9yJywgYFdvcmtmbG93IG5vdCBmb3VuZCBmb3IgbmF2IGJ1dHRvbjogJHtidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcuaWR9YCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHdvcmtmbG93LmRhdGFTb3VyY2VzPy5wcmltYXJ5Py5kYXRhIHx8IHdvcmtmbG93LmRhdGFTb3VyY2U/LmRhdGEgfHwgW107XG4gICAgICAgICAgICBleGVjdXRlV29ya2Zsb3cod29ya2Zsb3csIGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGNyZWF0ZVN0eWxlZEJ1dHRvbiA9IChsYWJlbCwgdGl0bGUgPSAnJykgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLmNsYXNzTmFtZSA9ICduYXZpZ2F0aW9uQmFyLXNlYXJjaCc7XG4gICAgICAgICAgICBidXR0b25FbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgICAgICAgICAgYnV0dG9uRWwudGl0bGUgPSB0aXRsZTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmhlaWdodCA9ICcyNHB4JztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLnBhZGRpbmcgPSAnMCA4cHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzRweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4zNSknO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMTIpJztcbiAgICAgICAgICAgIGJ1dHRvbkVsLnN0eWxlLmNvbG9yID0gJyNmZmZmZmYnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZm9udFNpemUgPSAnMTJweCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5saW5lSGVpZ2h0ID0gJzIycHgnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUud2hpdGVTcGFjZSA9ICdub3dyYXAnO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtZmxleCc7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG4gICAgICAgICAgICBidXR0b25FbC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdjZW50ZXInO1xuICAgICAgICAgICAgYnV0dG9uRWwuc3R5bGUuYm94U2hhZG93ID0gJ2luc2V0IDAgMCAwIDFweCByZ2JhKDI1NSwyNTUsMjU1LDAuMDgpJztcbiAgICAgICAgICAgIHJldHVybiBidXR0b25FbDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjbG9zZUFsbEdyb3VwTWVudXMgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudV0nKS5mb3JFYWNoKChtZW51KSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc3RhbmRhbG9uZUJ1dHRvbnMgPSBbXTtcbiAgICAgICAgY29uc3QgZ3JvdXBlZEJ1dHRvbnMgPSBuZXcgTWFwKCk7XG5cbiAgICAgICAgdmlzaWJsZUJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBncm91cE5hbWUgPSAoYnV0dG9uQ29uZmlnLmdyb3VwIHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoIWdyb3VwTmFtZSkge1xuICAgICAgICAgICAgICAgIHN0YW5kYWxvbmVCdXR0b25zLnB1c2goYnV0dG9uQ29uZmlnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWdyb3VwZWRCdXR0b25zLmhhcyhncm91cE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuc2V0KGdyb3VwTmFtZSwgW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBlZEJ1dHRvbnMuZ2V0KGdyb3VwTmFtZSkucHVzaChidXR0b25Db25maWcpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdGFuZGFsb25lQnV0dG9ucy5mb3JFYWNoKChidXR0b25Db25maWcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbldyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGJ1dHRvbldyYXBwZXIuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItY29tcGFueSBuYXZpZ2F0aW9uQmFyLXBpbm5lZEVsZW1lbnQnO1xuXG4gICAgICAgICAgICBjb25zdCBidXR0b25FbCA9IGNyZWF0ZVN0eWxlZEJ1dHRvbihidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdycsIGJ1dHRvbkNvbmZpZy5uYW1lIHx8ICcnKTtcbiAgICAgICAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1idXR0b24taWQnLCBidXR0b25Db25maWcuaWQgfHwgJycpO1xuICAgICAgICAgICAgYnV0dG9uRWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpKTtcblxuICAgICAgICAgICAgYnV0dG9uV3JhcHBlci5hcHBlbmRDaGlsZChidXR0b25FbCk7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoYnV0dG9uV3JhcHBlcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEFycmF5LmZyb20oZ3JvdXBlZEJ1dHRvbnMuZW50cmllcygpKVxuICAgICAgICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpXG4gICAgICAgICAgICAuZm9yRWFjaCgoW2dyb3VwTmFtZSwgZ3JvdXBJdGVtc10pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cFdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICBncm91cFdyYXBwZXIuY2xhc3NOYW1lID0gJ25hdmlnYXRpb25CYXItY29tcGFueSBuYXZpZ2F0aW9uQmFyLXBpbm5lZEVsZW1lbnQnO1xuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEJ1dHRvbiA9IGNyZWF0ZVN0eWxlZEJ1dHRvbihgJHtncm91cE5hbWV9IFxcdTI1QkVgLCBncm91cE5hbWUpO1xuICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1ncm91cCcsIGdyb3VwTmFtZSk7XG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYm9yZGVyQ29sb3IgPSAncmdiYSgyNTUsMjU1LDI1NSwwLjU1KSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBCdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMiknO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBNZW51ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnNldEF0dHJpYnV0ZSgnZGF0YS1kMzY1LW5hdi1ncm91cC1tZW51JywgZ3JvdXBOYW1lKTtcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS50b3AgPSAnMjhweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmxlZnQgPSAnMCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLm1pbldpZHRoID0gJzIzMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUubWF4V2lkdGggPSAnMzIwcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5tYXhIZWlnaHQgPSAnMzIwcHgnO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5vdmVyZmxvd1kgPSAnYXV0byc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJhY2tncm91bmQgPSAnI2ZjZmRmZic7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgcmdiYSgzMCw0MSw1OSwwLjE2KSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmJvcmRlclJhZGl1cyA9ICcxMHB4JztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuYm94U2hhZG93ID0gJzAgMTRweCAyOHB4IHJnYmEoMCwwLDAsMC4yOCknO1xuICAgICAgICAgICAgICAgIGdyb3VwTWVudS5zdHlsZS5wYWRkaW5nID0gJzhweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgZ3JvdXBNZW51LnN0eWxlLnpJbmRleCA9ICcyMTQ3NDgzMDAwJztcblxuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwSGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIudGV4dENvbnRlbnQgPSBncm91cE5hbWU7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuZm9udFNpemUgPSAnMTFweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuZm9udFdlaWdodCA9ICc3MDAnO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLmNvbG9yID0gJyM0NzU1NjknO1xuICAgICAgICAgICAgICAgIGdyb3VwSGVhZGVyLnN0eWxlLm1hcmdpbiA9ICcwIDJweCA2cHggMnB4JztcbiAgICAgICAgICAgICAgICBncm91cEhlYWRlci5zdHlsZS5wYWRkaW5nQm90dG9tID0gJzZweCc7XG4gICAgICAgICAgICAgICAgZ3JvdXBIZWFkZXIuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCAjZTJlOGYwJztcbiAgICAgICAgICAgICAgICBncm91cE1lbnUuYXBwZW5kQ2hpbGQoZ3JvdXBIZWFkZXIpO1xuXG4gICAgICAgICAgICAgICAgZ3JvdXBJdGVtc1xuICAgICAgICAgICAgICAgICAgICAuc2xpY2UoKVxuICAgICAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gKGEubmFtZSB8fCAnJykubG9jYWxlQ29tcGFyZShiLm5hbWUgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICAuZm9yRWFjaCgoYnV0dG9uQ29uZmlnKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVtQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24udGV4dENvbnRlbnQgPSBidXR0b25Db25maWcubmFtZSB8fCBidXR0b25Db25maWcud29ya2Zsb3dOYW1lIHx8ICdXb3JrZmxvdyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnRpdGxlID0gYnV0dG9uQ29uZmlnLm5hbWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudGV4dEFsaWduID0gJ2xlZnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5ib3JkZXIgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5jb2xvciA9ICcjMWYyOTM3JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYm9yZGVyUmFkaXVzID0gJzRweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLnBhZGRpbmcgPSAnOHB4IDlweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmZvbnRTaXplID0gJzEycHgnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5mb250V2VpZ2h0ID0gJzYwMCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmxpbmVIZWlnaHQgPSAnMS4zJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUubWFyZ2luQm90dG9tID0gJzNweCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUudHJhbnNpdGlvbiA9ICdiYWNrZ3JvdW5kIC4xNXMgZWFzZSwgY29sb3IgLjE1cyBlYXNlJztcblxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uc3R5bGUuYmFja2dyb3VuZCA9ICcjZThlZGZmJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZTNhOGEnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtQnV0dG9uLnN0eWxlLmNvbG9yID0gJyMxZjI5MzcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbG9zZUFsbEdyb3VwTWVudXMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBydW5CdXR0b25Xb3JrZmxvdyhidXR0b25Db25maWcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwTWVudS5hcHBlbmRDaGlsZChpdGVtQnV0dG9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBncm91cEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNPcGVuID0gZ3JvdXBNZW51LnN0eWxlLmRpc3BsYXkgPT09ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGNsb3NlQWxsR3JvdXBNZW51cygpO1xuICAgICAgICAgICAgICAgICAgICBncm91cE1lbnUuc3R5bGUuZGlzcGxheSA9IGlzT3BlbiA/ICdub25lJyA6ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnV0dG9uLnN0eWxlLmJhY2tncm91bmQgPSBpc09wZW4gPyAncmdiYSgyNTUsMjU1LDI1NSwwLjIpJyA6ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMzIpJztcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGdyb3VwV3JhcHBlci5hcHBlbmRDaGlsZChncm91cEJ1dHRvbik7XG4gICAgICAgICAgICAgICAgZ3JvdXBXcmFwcGVyLmFwcGVuZENoaWxkKGdyb3VwTWVudSk7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwV3JhcHBlcik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICBuYXZHcm91cC5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBuYXZHcm91cC5maXJzdENoaWxkKTtcblxuICAgICAgICBpZiAobmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIG5hdkJ1dHRvbnNPdXRzaWRlQ2xpY2tIYW5kbGVyID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZDM2NS1uYXYtYnV0dG9ucy1jb250YWluZXInKTtcbiAgICAgICAgICAgIGlmICghYWN0aXZlIHx8IGFjdGl2ZS5jb250YWlucyhldmVudC50YXJnZXQpKSByZXR1cm47XG4gICAgICAgICAgICBhY3RpdmUucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZDM2NS1uYXYtZ3JvdXAtbWVudV0nKS5mb3JFYWNoKChtZW51KSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbmF2QnV0dG9uc091dHNpZGVDbGlja0hhbmRsZXIsIHRydWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHVuaGFuZGxlZFVuZXhwZWN0ZWRFdmVudEtleXMgPSBuZXcgU2V0KCk7XG4gICAgLy8gVHJhY2sgbWVzc2FnZSBiYXIgbWVzc2FnZXMgYWxyZWFkeSBhY2tub3dsZWRnZWQgZHVyaW5nIHRoaXMgZXhlY3V0aW9uIHJ1blxuICAgIC8vIHNvIHRoZSBzYW1lIG5vbi1ibG9ja2luZyB3YXJuaW5nIGRvZXNuJ3QgdHJpZ2dlciByZXBlYXRlZCBwYXVzZXMuXG4gICAgY29uc3QgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMgPSBuZXcgU2V0KCk7XG5cbiAgICAvLyBIZWxwZXIgdG8gY2hlY2sgYW5kIHdhaXQgZm9yIHBhdXNlL3N0b3BcbiAgICBhc3luYyBmdW5jdGlvbiBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKSB7XG4gICAgICAgIGlmIChleGVjdXRpb25Db250cm9sLmlzU3RvcHBlZCkge1xuICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQpIHtcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDIwMCk7XG4gICAgICAgICAgICBpZiAoZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRUZW1wbGF0ZVRleHQodGV4dCkge1xuICAgICAgICByZXR1cm4gbm9ybWFsaXplVGV4dCh0ZXh0IHx8ICcnKS5yZXBsYWNlKC9cXGJbXFxkLC5dK1xcYi9nLCAnIycpLnRyaW0oKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVVc2VyU3RvcEVycm9yKG1lc3NhZ2UgPSAnV29ya2Zsb3cgc3RvcHBlZCBieSB1c2VyJykge1xuICAgICAgICBjb25zdCBlcnIgPSBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICAgIGVyci5pc1VzZXJTdG9wID0gdHJ1ZTtcbiAgICAgICAgZXJyLm5vUmV0cnkgPSB0cnVlO1xuICAgICAgICByZXR1cm4gZXJyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzTWVzc2FnZUJhckNsb3NlVmlzaWJsZSgpIHtcbiAgICAgICAgY29uc3QgY2xvc2VCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyQ2xvc2VcIl0nKTtcbiAgICAgICAgcmV0dXJuIGNsb3NlQnRuICYmIGlzRWxlbWVudFZpc2libGUoY2xvc2VCdG4pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNob3J0ZW5Gb3JMb2codGV4dCwgbWF4ID0gMjIwKSB7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVUZXh0KHRleHQgfHwgJycpO1xuICAgICAgICBpZiAobm9ybWFsaXplZC5sZW5ndGggPD0gbWF4KSByZXR1cm4gbm9ybWFsaXplZDtcbiAgICAgICAgcmV0dXJuIGAke25vcm1hbGl6ZWQuc2xpY2UoMCwgbWF4KX0uLi5gO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpIHtcbiAgICAgICAgY29uc3Qgc2lnbmFsID0gZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nRmxvd1NpZ25hbCB8fCAnbm9uZSc7XG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0Zsb3dTaWduYWwgPSAnbm9uZSc7XG4gICAgICAgIHJldHVybiBzaWduYWw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RhcnRJbnRlcnJ1cHRpb25BY3Rpb25SZWNvcmRlcigpIHtcbiAgICAgICAgY29uc3QgY2FwdHVyZWQgPSBbXTtcbiAgICAgICAgY29uc3QgY2xpY2tIYW5kbGVyID0gKGV2dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZXZ0LnRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQgPyBldnQudGFyZ2V0IDogbnVsbDtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBidXR0b24gPSB0YXJnZXQuY2xvc2VzdCgnYnV0dG9uLCBbcm9sZT1cImJ1dHRvblwiXSwgW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdJyk7XG4gICAgICAgICAgICBpZiAoIWJ1dHRvbiB8fCAhaXNFbGVtZW50VmlzaWJsZShidXR0b24pKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dChidXR0b24udGV4dENvbnRlbnQgfHwgYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnKTtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUgJiYgIXRleHQpIHJldHVybjtcbiAgICAgICAgICAgIGNhcHR1cmVkLnB1c2goe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdjbGlja0J1dHRvbicsXG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgdGV4dFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xpY2tIYW5kbGVyLCB0cnVlKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0b3AoKSB7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGlja0hhbmRsZXIsIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBjYXB0dXJlZC5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbGxlY3REaWFsb2dCdXR0b25zKGRpYWxvZ0VsKSB7XG4gICAgICAgIGNvbnN0IHNlbGVjdG9ycyA9ICdidXR0b24sIFtyb2xlPVwiYnV0dG9uXCJdLCBbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0nO1xuICAgICAgICBjb25zdCBidXR0b25zID0gW107XG4gICAgICAgIGNvbnN0IHNlZW4gPSBuZXcgU2V0KCk7XG4gICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3JzKS5mb3JFYWNoKChidXR0b25FbCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ1dHRvbkVsKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBidXR0b25FbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dChidXR0b25FbC50ZXh0Q29udGVudCB8fCBidXR0b25FbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtjb250cm9sTmFtZS50b0xvd2VyQ2FzZSgpfXwke3RleHR9YDtcbiAgICAgICAgICAgIGlmICghY29udHJvbE5hbWUgJiYgIXRleHQpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChzZWVuLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICBzZWVuLmFkZChrZXkpO1xuICAgICAgICAgICAgYnV0dG9ucy5wdXNoKHsgY29udHJvbE5hbWUsIHRleHQsIGVsZW1lbnQ6IGJ1dHRvbkVsIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGJ1dHRvbnM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNMaWtlbHlNb2RhbERpYWxvZyhkaWFsb2dFbCwgdGV4dCwgYnV0dG9ucykge1xuICAgICAgICBjb25zdCB0ZXh0TGVuZ3RoID0gbm9ybWFsaXplVGV4dCh0ZXh0IHx8ICcnKS5sZW5ndGg7XG4gICAgICAgIGlmICghYnV0dG9ucy5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHRleHRMZW5ndGggPiA0NTApIHJldHVybiBmYWxzZTtcblxuICAgICAgICBjb25zdCBmb3JtSW5wdXRzID0gZGlhbG9nRWwucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEnKTtcbiAgICAgICAgaWYgKGZvcm1JbnB1dHMubGVuZ3RoID4gOCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IGhhc1N0YXRpY1RleHQgPSAhIWRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZvcm1TdGF0aWNUZXh0Q29udHJvbDFcIl0nKTtcbiAgICAgICAgY29uc3QgaGFzTGlnaHRib3hDbGFzcyA9IGRpYWxvZ0VsLmNsYXNzTGlzdD8uY29udGFpbnMoJ3Jvb3RDb250ZW50LWxpZ2h0Qm94Jyk7XG4gICAgICAgIGNvbnN0IGhhc0J1dHRvbkdyb3VwID0gISFkaWFsb2dFbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJCdXR0b25Hcm91cFwiXScpO1xuXG4gICAgICAgIHJldHVybiBoYXNTdGF0aWNUZXh0IHx8IGhhc0xpZ2h0Ym94Q2xhc3MgfHwgaGFzQnV0dG9uR3JvdXA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGV0ZWN0VW5leHBlY3RlZEV2ZW50cygpIHtcbiAgICAgICAgY29uc3QgZXZlbnRzID0gW107XG4gICAgICAgIGNvbnN0IHNlZW5FdmVudEtleXMgPSBuZXcgU2V0KCk7XG5cbiAgICAgICAgLy8gLS0tIERpYWxvZ3MgLS0tXG4gICAgICAgIGNvbnN0IGRpYWxvZ1NlbGVjdG9ycyA9ICdbcm9sZT1cImRpYWxvZ1wiXSwgW2RhdGEtZHluLXJvbGU9XCJEaWFsb2dcIl0sIC5kaWFsb2ctY29udGFpbmVyJztcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChkaWFsb2dTZWxlY3RvcnMpLmZvckVhY2goKGRpYWxvZ0VsKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzRWxlbWVudFZpc2libGUoZGlhbG9nRWwpKSByZXR1cm47XG4gICAgICAgICAgICAvLyBQcmVmZXIgdGhlIGRlZGljYXRlZCBzdGF0aWMtdGV4dCBjb250cm9sLCB0aGVuIGhlYWRpbmcgdGFncy5cbiAgICAgICAgICAgIC8vIEF2b2lkIHRoZSBvdmVybHktYnJvYWQgW2NsYXNzKj1cImNvbnRlbnRcIl0gd2hpY2ggY2FuIG1hdGNoIHdyYXBwZXJcbiAgICAgICAgICAgIC8vIGVsZW1lbnRzIHdob3NlIHRleHRDb250ZW50IGluY2x1ZGVzIGJ1dHRvbiBsYWJlbHMuXG4gICAgICAgICAgICBjb25zdCB0ZXh0RWwgPVxuICAgICAgICAgICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIkZvcm1TdGF0aWNUZXh0Q29udHJvbDFcIl0nKSB8fFxuICAgICAgICAgICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ2gxLCBoMiwgaDMnKSB8fFxuICAgICAgICAgICAgICAgIGRpYWxvZ0VsLnF1ZXJ5U2VsZWN0b3IoJ1tjbGFzcyo9XCJtZXNzYWdlXCJdJyk7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gbm9ybWFsaXplVGV4dCh0ZXh0RWw/LnRleHRDb250ZW50IHx8IGRpYWxvZ0VsLnRleHRDb250ZW50IHx8ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbnMgPSBjb2xsZWN0RGlhbG9nQnV0dG9ucyhkaWFsb2dFbCk7XG4gICAgICAgICAgICBpZiAoIWlzTGlrZWx5TW9kYWxEaWFsb2coZGlhbG9nRWwsIHRleHQsIGJ1dHRvbnMpKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZVRleHQgPSBnZXRUZW1wbGF0ZVRleHQodGV4dCk7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgZGlhbG9nfCR7dGVtcGxhdGVUZXh0fWA7XG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVGV4dCB8fCBzZWVuRXZlbnRLZXlzLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICBzZWVuRXZlbnRLZXlzLmFkZChrZXkpO1xuICAgICAgICAgICAgZXZlbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIGtpbmQ6ICdkaWFsb2cnLFxuICAgICAgICAgICAgICAgIHRleHQsXG4gICAgICAgICAgICAgICAgdGVtcGxhdGVUZXh0LFxuICAgICAgICAgICAgICAgIGJ1dHRvbnMsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZGlhbG9nRWxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtLS0gTWVzc2FnZSBiYXIgZW50cmllcyAtLS1cbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm1lc3NhZ2VCYXItbWVzc2FnZUVudHJ5JykuZm9yRWFjaCgoZW50cnlFbCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGVudHJ5RWwpKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlRWwgPSBlbnRyeUVsLnF1ZXJ5U2VsZWN0b3IoJy5tZXNzYWdlQmFyLW1lc3NhZ2UnKSB8fCBlbnRyeUVsO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQobWVzc2FnZUVsLnRleHRDb250ZW50IHx8ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlVGV4dCA9IGdldFRlbXBsYXRlVGV4dCh0ZXh0KTtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGBtZXNzYWdlQmFyfCR7dGVtcGxhdGVUZXh0fWA7XG4gICAgICAgICAgICBpZiAoIXRlbXBsYXRlVGV4dCB8fCBzZWVuRXZlbnRLZXlzLmhhcyhrZXkpKSByZXR1cm47XG4gICAgICAgICAgICBzZWVuRXZlbnRLZXlzLmFkZChrZXkpO1xuXG4gICAgICAgICAgICAvLyBTa2lwIG1lc3NhZ2UtYmFyIGVudHJpZXMgdGhhdCB3ZXJlIGFscmVhZHkgYWNrbm93bGVkZ2VkIGluIHRoaXMgcnVuXG4gICAgICAgICAgICAvLyBzbyB0aGUgc2FtZSBub24tYmxvY2tpbmcgd2FybmluZyBkb2Vzbid0IGNhdXNlIHJlcGVhdGVkIHBhdXNlcy5cbiAgICAgICAgICAgIGlmIChhY2tub3dsZWRnZWRNZXNzYWdlQmFyS2V5cy5oYXMoa2V5KSkgcmV0dXJuO1xuXG4gICAgICAgICAgICAvLyBDb2xsZWN0IGNsb3NlIC8gdG9nZ2xlIGNvbnRyb2xzIHBsdXMgY29udGV4dHVhbCB2aXNpYmxlIGJ1dHRvbnNcbiAgICAgICAgICAgIC8vIChlLmcuIE9LL0NhbmNlbCBvbiB0aGUgYWN0aXZlIGZvcm0pIHNvIHRoZSB1c2VyIGNhbiBjaG9vc2UgdGhlbS5cbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xzID0gW107XG4gICAgICAgICAgICBjb25zdCBjb250cm9sS2V5cyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIGNvbnN0IHB1c2hDb250cm9sID0gKGNvbnRyb2wpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtub3JtYWxpemVUZXh0KGNvbnRyb2w/LmNvbnRyb2xOYW1lIHx8ICcnKX18JHtub3JtYWxpemVUZXh0KGNvbnRyb2w/LnRleHQgfHwgJycpfWA7XG4gICAgICAgICAgICAgICAgaWYgKCFrZXkgfHwgY29udHJvbEtleXMuaGFzKGtleSkpIHJldHVybjtcbiAgICAgICAgICAgICAgICBjb250cm9sS2V5cy5hZGQoa2V5KTtcbiAgICAgICAgICAgICAgICBjb250cm9scy5wdXNoKGNvbnRyb2wpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgY2xvc2VCdXR0b24gPVxuICAgICAgICAgICAgICAgIGVudHJ5RWwucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiTWVzc2FnZUJhckNsb3NlXCJdJykgfHxcbiAgICAgICAgICAgICAgICBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJDbG9zZVwiXScpKS5maW5kKGlzRWxlbWVudFZpc2libGUpIHx8XG4gICAgICAgICAgICAgICAgbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHRvZ2dsZUJ1dHRvbiA9XG4gICAgICAgICAgICAgICAgZW50cnlFbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyVG9nZ2xlXCJdJykgfHxcbiAgICAgICAgICAgICAgICBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJUb2dnbGVcIl0nKSkuZmluZChpc0VsZW1lbnRWaXNpYmxlKSB8fFxuICAgICAgICAgICAgICAgIG51bGw7XG4gICAgICAgICAgICBpZiAoY2xvc2VCdXR0b24gJiYgaXNFbGVtZW50VmlzaWJsZShjbG9zZUJ1dHRvbikpIHtcbiAgICAgICAgICAgICAgICBwdXNoQ29udHJvbCh7IGNvbnRyb2xOYW1lOiAnTWVzc2FnZUJhckNsb3NlJywgdGV4dDogbm9ybWFsaXplVGV4dChjbG9zZUJ1dHRvbi50ZXh0Q29udGVudCB8fCAnJyksIGVsZW1lbnQ6IGNsb3NlQnV0dG9uLCB2aXNpYmxlOiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRvZ2dsZUJ1dHRvbiAmJiBpc0VsZW1lbnRWaXNpYmxlKHRvZ2dsZUJ1dHRvbikpIHtcbiAgICAgICAgICAgICAgICBwdXNoQ29udHJvbCh7IGNvbnRyb2xOYW1lOiAnTWVzc2FnZUJhclRvZ2dsZScsIHRleHQ6IG5vcm1hbGl6ZVRleHQodG9nZ2xlQnV0dG9uLnRleHRDb250ZW50IHx8ICcnKSwgZWxlbWVudDogdG9nZ2xlQnV0dG9uLCB2aXNpYmxlOiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb250ZXh0Um9vdCA9XG4gICAgICAgICAgICAgICAgZW50cnlFbC5jbG9zZXN0KCdbZGF0YS1keW4tZm9ybS1uYW1lXSwgW3JvbGU9XCJkaWFsb2dcIl0sIC5yb290Q29udGVudCwgLnJvb3RDb250ZW50LWxpZ2h0Qm94JykgfHxcbiAgICAgICAgICAgICAgICBkb2N1bWVudDtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvblNlbGVjdG9ycyA9ICdbZGF0YS1keW4tcm9sZT1cIkNvbW1hbmRCdXR0b25cIl0sIGJ1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0nO1xuICAgICAgICAgICAgY29udGV4dFJvb3QucXVlcnlTZWxlY3RvckFsbChidXR0b25TZWxlY3RvcnMpLmZvckVhY2goKGJ0bikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gYnRuLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnJztcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0VmFsdWUgPSBub3JtYWxpemVUZXh0KGJ0bi50ZXh0Q29udGVudCB8fCBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRva2VuID0gbm9ybWFsaXplVGV4dChjb250cm9sTmFtZSB8fCB0ZXh0VmFsdWUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzUHJpbWFyeUFjdGlvbiA9XG4gICAgICAgICAgICAgICAgICAgIFsnb2snLCAnY2FuY2VsJywgJ3llcycsICdubycsICdjbG9zZScsICdyZW1vdmUnLCAnZGVsZXRlJywgJ3NhdmUnLCAnbmV3J10uaW5jbHVkZXModG9rZW4pIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdyZW1vdmUnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnZGVsZXRlJykgfHxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2NhbmNlbCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdjbG9zZScpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdsaW5lc3RyaXAnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0ZXh0VmFsdWUgPT09ICdyZW1vdmUnIHx8XG4gICAgICAgICAgICAgICAgICAgIHRleHRWYWx1ZSA9PT0gJ2RlbGV0ZSc7XG4gICAgICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ0bikgfHwgKCFjb250cm9sTmFtZSAmJiAhdGV4dFZhbHVlKSB8fCAhaXNQcmltYXJ5QWN0aW9uKSByZXR1cm47XG4gICAgICAgICAgICAgICAgcHVzaENvbnRyb2woeyBjb250cm9sTmFtZSwgdGV4dDogdGV4dFZhbHVlLCBlbGVtZW50OiBidG4sIHZpc2libGU6IHRydWUgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHNjYW4gZ2xvYmFsbHkgZm9yIHZpc2libGUgcmVtZWRpYXRpb24gYWN0aW9ucyB0aGF0IG1heSBiZVxuICAgICAgICAgICAgLy8gb3V0c2lkZSB0aGUgbWVzc2FnZS1iYXIvZm9ybSB3cmFwcGVyIChlLmcuIExpbmVTdHJpcERlbGV0ZSBpbiB0b29sYmFyKS5cbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYnV0dG9uU2VsZWN0b3JzKS5mb3JFYWNoKChidG4pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGJ0bi5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJykgfHwgJyc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dFZhbHVlID0gbm9ybWFsaXplVGV4dChidG4udGV4dENvbnRlbnQgfHwgYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5vcm1hbGl6ZVRleHQoY29udHJvbE5hbWUgfHwgdGV4dFZhbHVlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpc0xpa2VseUZpeEFjdGlvbiA9XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdyZW1vdmUnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pbmNsdWRlcygnZGVsZXRlJykgfHxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2NhbmNlbCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdjbG9zZScpIHx8XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmluY2x1ZGVzKCdsaW5lc3RyaXBkZWxldGUnKSB8fFxuICAgICAgICAgICAgICAgICAgICB0ZXh0VmFsdWUgPT09ICdyZW1vdmUnIHx8XG4gICAgICAgICAgICAgICAgICAgIHRleHRWYWx1ZSA9PT0gJ2RlbGV0ZSc7XG4gICAgICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ0bikgfHwgIWlzTGlrZWx5Rml4QWN0aW9uKSByZXR1cm47XG4gICAgICAgICAgICAgICAgcHVzaENvbnRyb2woeyBjb250cm9sTmFtZSwgdGV4dDogdGV4dFZhbHVlLCBlbGVtZW50OiBidG4sIHZpc2libGU6IHRydWUgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZXZlbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIGtpbmQ6ICdtZXNzYWdlQmFyJyxcbiAgICAgICAgICAgICAgICB0ZXh0LFxuICAgICAgICAgICAgICAgIHRlbXBsYXRlVGV4dCxcbiAgICAgICAgICAgICAgICBjb250cm9scyxcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbnRyeUVsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGV2ZW50cztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtYXRjaEhhbmRsZXJUb0V2ZW50KGhhbmRsZXIsIGV2ZW50KSB7XG4gICAgICAgIGNvbnN0IHRyaWdnZXIgPSBoYW5kbGVyPy50cmlnZ2VyIHx8IHt9O1xuICAgICAgICBpZiAodHJpZ2dlci5raW5kICE9PSBldmVudC5raW5kKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGNvbnN0IHRyaWdnZXJUZW1wbGF0ZSA9IGdlbmVyYWxpemVJbnRlcnJ1cHRpb25UZXh0KHRyaWdnZXIudGV4dFRlbXBsYXRlIHx8ICcnKTtcbiAgICAgICAgY29uc3QgZXZlbnRUZW1wbGF0ZSA9IGdlbmVyYWxpemVJbnRlcnJ1cHRpb25UZXh0KGV2ZW50LnRlbXBsYXRlVGV4dCB8fCBldmVudC50ZXh0IHx8ICcnKTtcbiAgICAgICAgY29uc3QgdHJpZ2dlck1hdGNoTW9kZSA9IG5vcm1hbGl6ZVRleHQodHJpZ2dlci5tYXRjaE1vZGUgfHwgJycpO1xuICAgICAgICBjb25zdCBtYXRjaE1vZGUgPSB0cmlnZ2VyTWF0Y2hNb2RlID09PSAnZXhhY3QnID8gJ2V4YWN0JyA6ICdjb250YWlucyc7XG5cbiAgICAgICAgaWYgKHRyaWdnZXJUZW1wbGF0ZSkge1xuICAgICAgICAgICAgaWYgKG1hdGNoTW9kZSA9PT0gJ2V4YWN0Jykge1xuICAgICAgICAgICAgICAgIGlmICh0cmlnZ2VyVGVtcGxhdGUgIT09IGV2ZW50VGVtcGxhdGUpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIShldmVudFRlbXBsYXRlLmluY2x1ZGVzKHRyaWdnZXJUZW1wbGF0ZSkgfHwgdHJpZ2dlclRlbXBsYXRlLmluY2x1ZGVzKGV2ZW50VGVtcGxhdGUpKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0cmlnZ2VyTWF0Y2hNb2RlID09PSAncmVnZXgnKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSB0cmlnZ2VyLnJlZ2V4IHx8IHRyaWdnZXIudGV4dFRlbXBsYXRlIHx8ICcnO1xuICAgICAgICAgICAgICAgIGlmICghcGF0dGVybiB8fCAhKG5ldyBSZWdFeHAocGF0dGVybiwgJ2knKSkudGVzdChldmVudC50ZW1wbGF0ZVRleHQgfHwgZXZlbnQudGV4dCB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVxdWlyZWRDb250cm9scyA9IEFycmF5LmlzQXJyYXkodHJpZ2dlci5yZXF1aXJlZENvbnRyb2xzKSA/IHRyaWdnZXIucmVxdWlyZWRDb250cm9scyA6IFtdO1xuICAgICAgICBpZiAocmVxdWlyZWRDb250cm9scy5sZW5ndGggJiYgZXZlbnQua2luZCA9PT0gJ21lc3NhZ2VCYXInKSB7XG4gICAgICAgICAgICBjb25zdCBhdmFpbGFibGUgPSBuZXcgU2V0KChldmVudC5jb250cm9scyB8fCBbXSkubWFwKGN0cmwgPT4gbm9ybWFsaXplVGV4dChjdHJsLmNvbnRyb2xOYW1lIHx8IGN0cmwudGV4dCB8fCAnJykpKTtcbiAgICAgICAgICAgIGlmICghcmVxdWlyZWRDb250cm9scy5ldmVyeShuYW1lID0+IGF2YWlsYWJsZS5oYXMobm9ybWFsaXplVGV4dChuYW1lKSkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVxdWlyZWRCdXR0b25zID0gQXJyYXkuaXNBcnJheSh0cmlnZ2VyLnJlcXVpcmVkQnV0dG9ucykgPyB0cmlnZ2VyLnJlcXVpcmVkQnV0dG9ucyA6IFtdO1xuICAgICAgICBpZiAocmVxdWlyZWRCdXR0b25zLmxlbmd0aCAmJiBldmVudC5raW5kID09PSAnZGlhbG9nJykge1xuICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlID0gbmV3IFNldCgoZXZlbnQuYnV0dG9ucyB8fCBbXSkubWFwKGJ0biA9PiBub3JtYWxpemVUZXh0KGJ0bi5jb250cm9sTmFtZSB8fCBidG4udGV4dCB8fCAnJykpKTtcbiAgICAgICAgICAgIHJldHVybiByZXF1aXJlZEJ1dHRvbnMuZXZlcnkobmFtZSA9PiBhdmFpbGFibGUuaGFzKG5vcm1hbGl6ZVRleHQobmFtZSkpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZW5lcmFsaXplSW50ZXJydXB0aW9uVGV4dChyYXdUZXh0KSB7XG4gICAgICAgIGxldCB2YWx1ZSA9IG5vcm1hbGl6ZVRleHQocmF3VGV4dCB8fCAnJyk7XG4gICAgICAgIGlmICghdmFsdWUpIHJldHVybiAnJztcblxuICAgICAgICB2YWx1ZSA9IHZhbHVlXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxiY3VzdG9tZXJcXHMrXFxkK1xcYi9naSwgJ2N1c3RvbWVyIHtudW1iZXJ9JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGJpdGVtIG51bWJlclxccytbYS16MC05Xy1dK1xcYi9naSwgJ2l0ZW0gbnVtYmVyIHt2YWx1ZX0nKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcYlxcZFtcXGQsLi8tXSpcXGIvZywgJ3tudW1iZXJ9Jyk7XG5cbiAgICAgICAgLy8gTm9ybWFsaXplIGR1cGxpY2F0ZS1yZWNvcmQgc3R5bGUgbWVzc2FnZXMgc28gdmFyeWluZyBrZXkgdmFsdWVzXG4gICAgICAgIC8vIChlLmcuIFwiMSwgMVwiIHZzIFwiRlItRVUtTlIsIEZSLUVVLU5SXCIpIG1hcCB0byBvbmUgaGFuZGxlci5cbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKFxuICAgICAgICAgICAgLyhcXGJbYS16XVthLXowLTkgXygpLy1dKlxccyo6XFxzKikoW14uXSs/KShcXC5cXHMqdGhlIHJlY29yZCBhbHJlYWR5IGV4aXN0c1xcLj8pL2ksXG4gICAgICAgICAgICAnJDF7dmFsdWV9JDMnXG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZVRleHQodmFsdWUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbmRNYXRjaGluZ0hhbmRsZXIoZXZlbnQpIHtcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBBcnJheS5pc0FycmF5KGN1cnJlbnRXb3JrZmxvdz8udW5leHBlY3RlZEV2ZW50SGFuZGxlcnMpXG4gICAgICAgICAgICA/IGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVyc1xuICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgY29uc3Qgc29ydGVkID0gaGFuZGxlcnNcbiAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgIC5zbGljZSgpXG4gICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gTnVtYmVyKGI/LnByaW9yaXR5IHx8IDApIC0gTnVtYmVyKGE/LnByaW9yaXR5IHx8IDApKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGhhbmRsZXIgb2Ygc29ydGVkKSB7XG4gICAgICAgICAgICBpZiAoaGFuZGxlcj8uZW5hYmxlZCA9PT0gZmFsc2UpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKG1hdGNoSGFuZGxlclRvRXZlbnQoaGFuZGxlciwgZXZlbnQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZERpYWxvZ0J1dHRvbihldmVudCwgdGFyZ2V0TmFtZSkge1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQodGFyZ2V0TmFtZSB8fCAnJyk7XG4gICAgICAgIGlmICghZXhwZWN0ZWQpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBidXR0b25zID0gQXJyYXkuaXNBcnJheShldmVudD8uYnV0dG9ucykgPyBldmVudC5idXR0b25zIDogW107XG4gICAgICAgIHJldHVybiBidXR0b25zLmZpbmQoYnRuID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ5Q29udHJvbCA9IG5vcm1hbGl6ZVRleHQoYnRuLmNvbnRyb2xOYW1lIHx8ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGJ5VGV4dCA9IG5vcm1hbGl6ZVRleHQoYnRuLnRleHQgfHwgJycpO1xuICAgICAgICAgICAgcmV0dXJuIGJ5Q29udHJvbCA9PT0gZXhwZWN0ZWQgfHwgYnlUZXh0ID09PSBleHBlY3RlZDtcbiAgICAgICAgfSkgfHwgbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kTWVzc2FnZUJhckNvbnRyb2woZXZlbnQsIHRhcmdldE5hbWUpIHtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSBub3JtYWxpemVUZXh0KHRhcmdldE5hbWUgfHwgJycpO1xuICAgICAgICBpZiAoIWV4cGVjdGVkKSByZXR1cm4gbnVsbDtcbiAgICAgICAgY29uc3QgY29udHJvbHMgPSBBcnJheS5pc0FycmF5KGV2ZW50Py5jb250cm9scykgPyBldmVudC5jb250cm9scyA6IFtdO1xuICAgICAgICByZXR1cm4gY29udHJvbHMuZmluZChjdHJsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ5Q29udHJvbCA9IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBieVRleHQgPSBub3JtYWxpemVUZXh0KGN0cmwudGV4dCB8fCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gYnlDb250cm9sID09PSBleHBlY3RlZCB8fCBieVRleHQgPT09IGV4cGVjdGVkO1xuICAgICAgICB9KSB8fCBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCkge1xuICAgICAgICBjb25zdCBjb250cm9scyA9IFtdO1xuICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xuICAgICAgICBjb25zdCBidXR0b25TZWxlY3RvcnMgPSAnW2RhdGEtZHluLXJvbGU9XCJDb21tYW5kQnV0dG9uXCJdLCBidXR0b24sIFtyb2xlPVwiYnV0dG9uXCJdJztcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChidXR0b25TZWxlY3RvcnMpLmZvckVhY2goKGJ0bikgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc0VsZW1lbnRWaXNpYmxlKGJ0bikpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gYnRuLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KGJ0bi50ZXh0Q29udGVudCB8fCBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycpO1xuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KGNvbnRyb2xOYW1lIHx8IHRleHQpO1xuICAgICAgICAgICAgY29uc3QgaXNSZW1lZGlhdGlvbkFjdGlvbiA9XG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ3JlbW92ZScpIHx8XG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpIHx8XG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2NhbmNlbCcpIHx8XG4gICAgICAgICAgICAgICAgdG9rZW4uaW5jbHVkZXMoJ2Nsb3NlJykgfHxcbiAgICAgICAgICAgICAgICB0b2tlbiA9PT0gJ29rJyB8fFxuICAgICAgICAgICAgICAgIHRva2VuID09PSAneWVzJyB8fFxuICAgICAgICAgICAgICAgIHRva2VuID09PSAnbm8nO1xuICAgICAgICAgICAgaWYgKCFpc1JlbWVkaWF0aW9uQWN0aW9uKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtub3JtYWxpemVUZXh0KGNvbnRyb2xOYW1lKX18JHt0ZXh0fWA7XG4gICAgICAgICAgICBpZiAoc2Vlbi5oYXMoa2V5KSkgcmV0dXJuO1xuICAgICAgICAgICAgc2Vlbi5hZGQoa2V5KTtcbiAgICAgICAgICAgIGNvbnRyb2xzLnB1c2goeyBjb250cm9sTmFtZSwgdGV4dCwgZWxlbWVudDogYnRuLCB2aXNpYmxlOiB0cnVlIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNvbnRyb2xzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbmRHbG9iYWxDbGlja2FibGUodGFyZ2V0TmFtZSkge1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IG5vcm1hbGl6ZVRleHQodGFyZ2V0TmFtZSB8fCAnJyk7XG4gICAgICAgIGlmICghZXhwZWN0ZWQpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBjb250cm9scyA9IGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCk7XG4gICAgICAgIHJldHVybiBjb250cm9scy5maW5kKChjdHJsKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBieUNvbnRyb2wgPSBub3JtYWxpemVUZXh0KGN0cmwuY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICAgICAgY29uc3QgYnlUZXh0ID0gbm9ybWFsaXplVGV4dChjdHJsLnRleHQgfHwgJycpO1xuICAgICAgICAgICAgcmV0dXJuIGJ5Q29udHJvbCA9PT0gZXhwZWN0ZWQgfHwgYnlUZXh0ID09PSBleHBlY3RlZDtcbiAgICAgICAgfSkgfHwgbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub3JtYWxpemVIYW5kbGVyQWN0aW9ucyhoYW5kbGVyKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGhhbmRsZXI/LmFjdGlvbnMpICYmIGhhbmRsZXIuYWN0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVyLmFjdGlvbnMuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoYW5kbGVyPy5hY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBbaGFuZGxlci5hY3Rpb25dO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZWNvcmRMZWFybmVkUnVsZShydWxlKSB7XG4gICAgICAgIGlmICghY3VycmVudFdvcmtmbG93IHx8ICFydWxlKSByZXR1cm47XG4gICAgICAgIGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVycyA9IEFycmF5LmlzQXJyYXkoY3VycmVudFdvcmtmbG93LnVuZXhwZWN0ZWRFdmVudEhhbmRsZXJzKVxuICAgICAgICAgICAgPyBjdXJyZW50V29ya2Zsb3cudW5leHBlY3RlZEV2ZW50SGFuZGxlcnNcbiAgICAgICAgICAgIDogW107XG5cbiAgICAgICAgY29uc3Qga2V5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgdHJpZ2dlcjogcnVsZS50cmlnZ2VyLFxuICAgICAgICAgICAgYWN0aW9uczogQXJyYXkuaXNBcnJheShydWxlPy5hY3Rpb25zKSA/IHJ1bGUuYWN0aW9ucyA6IFtydWxlPy5hY3Rpb25dLmZpbHRlcihCb29sZWFuKSxcbiAgICAgICAgICAgIG91dGNvbWU6IHJ1bGU/Lm91dGNvbWUgfHwgJ25leHQtc3RlcCdcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGV4aXN0cyA9IGN1cnJlbnRXb3JrZmxvdy51bmV4cGVjdGVkRXZlbnRIYW5kbGVycy5zb21lKGV4aXN0aW5nID0+XG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgdHJpZ2dlcjogZXhpc3Rpbmc/LnRyaWdnZXIsXG4gICAgICAgICAgICAgICAgYWN0aW9uczogQXJyYXkuaXNBcnJheShleGlzdGluZz8uYWN0aW9ucykgPyBleGlzdGluZy5hY3Rpb25zIDogW2V4aXN0aW5nPy5hY3Rpb25dLmZpbHRlcihCb29sZWFuKSxcbiAgICAgICAgICAgICAgICBvdXRjb21lOiBleGlzdGluZz8ub3V0Y29tZSB8fCAnbmV4dC1zdGVwJ1xuICAgICAgICAgICAgfSkgPT09IGtleVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhpc3RzKSByZXR1cm47XG5cbiAgICAgICAgY3VycmVudFdvcmtmbG93LnVuZXhwZWN0ZWRFdmVudEhhbmRsZXJzLnB1c2gocnVsZSk7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19MRUFSTklOR19SVUxFJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICB3b3JrZmxvd0lkOiBjdXJyZW50V29ya2Zsb3c/LmlkIHx8ICcnLFxuICAgICAgICAgICAgICAgIHJ1bGVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgJyonKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVSdWxlRnJvbUV2ZW50KGV2ZW50LCBhY3Rpb25zLCBvdXRjb21lID0gJ25leHQtc3RlcCcsIG1hdGNoTW9kZSA9ICdjb250YWlucycpIHtcbiAgICAgICAgY29uc3QgcmVxdWlyZWRCdXR0b25zID0gZXZlbnQua2luZCA9PT0gJ2RpYWxvZydcbiAgICAgICAgICAgID8gKGV2ZW50LmJ1dHRvbnMgfHwgW10pLm1hcChidG4gPT4gYnRuLmNvbnRyb2xOYW1lIHx8IGJ0bi50ZXh0KS5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgIDogW107XG4gICAgICAgIGNvbnN0IHJlcXVpcmVkQ29udHJvbHMgPSBldmVudC5raW5kID09PSAnbWVzc2FnZUJhcidcbiAgICAgICAgICAgID8gKGV2ZW50LmNvbnRyb2xzIHx8IFtdKS5tYXAoY3RybCA9PiBjdHJsLmNvbnRyb2xOYW1lIHx8IGN0cmwudGV4dCkuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAgICAgICA6IFtdO1xuICAgICAgICBjb25zdCBhY3Rpb25MaXN0ID0gQXJyYXkuaXNBcnJheShhY3Rpb25zKSA/IGFjdGlvbnMuZmlsdGVyKEJvb2xlYW4pIDogW107XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpZDogYHJ1bGVfJHtEYXRlLm5vdygpfV8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMTYpLnNsaWNlKDIsIDgpfWAsXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICAgICAgICBwcmlvcml0eTogMTAwLFxuICAgICAgICAgICAgbW9kZTogJ2F1dG8nLFxuICAgICAgICAgICAgdHJpZ2dlcjoge1xuICAgICAgICAgICAgICAgIGtpbmQ6IGV2ZW50LmtpbmQsXG4gICAgICAgICAgICAgICAgdGV4dFRlbXBsYXRlOiBnZW5lcmFsaXplSW50ZXJydXB0aW9uVGV4dChldmVudC50ZW1wbGF0ZVRleHQgfHwgZXZlbnQudGV4dCB8fCAnJyksXG4gICAgICAgICAgICAgICAgbWF0Y2hNb2RlOiBub3JtYWxpemVUZXh0KG1hdGNoTW9kZSB8fCAnJykgPT09ICdleGFjdCcgPyAnZXhhY3QnIDogJ2NvbnRhaW5zJyxcbiAgICAgICAgICAgICAgICByZXF1aXJlZEJ1dHRvbnMsXG4gICAgICAgICAgICAgICAgcmVxdWlyZWRDb250cm9sc1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFjdGlvbnM6IGFjdGlvbkxpc3QsXG4gICAgICAgICAgICBhY3Rpb246IGFjdGlvbkxpc3RbMF0gfHwgbnVsbCxcbiAgICAgICAgICAgIG91dGNvbWU6IG5vcm1hbGl6ZUZsb3dPdXRjb21lKG91dGNvbWUpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbm9ybWFsaXplRmxvd091dGNvbWUocmF3T3V0Y29tZSkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IG5vcm1hbGl6ZVRleHQocmF3T3V0Y29tZSB8fCAnJyk7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gJ2NvbnRpbnVlLWxvb3AnIHx8IHZhbHVlID09PSAnY29udGludWUnKSByZXR1cm4gJ2NvbnRpbnVlLWxvb3AnO1xuICAgICAgICBpZiAodmFsdWUgPT09ICdyZXBlYXQtbG9vcCcgfHwgdmFsdWUgPT09ICdyZXBlYXQnIHx8IHZhbHVlID09PSAncmV0cnktbG9vcCcpIHJldHVybiAncmVwZWF0LWxvb3AnO1xuICAgICAgICBpZiAodmFsdWUgPT09ICdicmVhay1sb29wJyB8fCB2YWx1ZSA9PT0gJ2JyZWFrJykgcmV0dXJuICdicmVhay1sb29wJztcbiAgICAgICAgaWYgKHZhbHVlID09PSAnc3RvcCcgfHwgdmFsdWUgPT09ICdmYWlsJykgcmV0dXJuICdzdG9wJztcbiAgICAgICAgcmV0dXJuICduZXh0LXN0ZXAnO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzQmVuaWduTWVzc2FnZUJhckV2ZW50KGV2ZW50KSB7XG4gICAgICAgIGlmICghZXZlbnQgfHwgZXZlbnQua2luZCAhPT0gJ21lc3NhZ2VCYXInKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KGV2ZW50LnRleHQgfHwgJycpO1xuICAgICAgICByZXR1cm4gdGV4dC5pbmNsdWRlcygnbmV3cmVjb3JkYWN0aW9uIGJ1dHRvbiBzaG91bGQgbm90IHJlLXRyaWdnZXIgdGhlIG5ldyB0YXNrJyk7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckZsb3dUcmFuc2l0aW9uU3RhYmlsaXR5KCkge1xuICAgICAgICBjb25zdCBtYXhDaGVja3MgPSAxNjtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXhDaGVja3M7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbG9hZGluZyA9IGlzRDM2NUxvYWRpbmcoKTtcbiAgICAgICAgICAgIGNvbnN0IHZpc2libGVEaWFsb2cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbcm9sZT1cImRpYWxvZ1wiXTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pLCBbZGF0YS1keW4tcm9sZT1cIkRpYWxvZ1wiXTpub3QoW3N0eWxlKj1cImRpc3BsYXk6IG5vbmVcIl0pJyk7XG4gICAgICAgICAgICBpZiAoIWxvYWRpbmcgJiYgIXZpc2libGVEaWFsb2cpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDEyMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZFJ1bGVBY3Rpb25Gcm9tT3B0aW9uKGV2ZW50LCBvcHRpb24pIHtcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZENvbnRyb2wgPSBub3JtYWxpemVUZXh0KG9wdGlvbj8uY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICBpZiAoZXZlbnQua2luZCA9PT0gJ21lc3NhZ2VCYXInICYmIG5vcm1hbGl6ZWRDb250cm9sID09PSAnbWVzc2FnZWJhcmNsb3NlJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnY2xvc2VNZXNzYWdlQmFyJyxcbiAgICAgICAgICAgICAgICBidXR0b25Db250cm9sTmFtZTogb3B0aW9uLmNvbnRyb2xOYW1lIHx8ICcnLFxuICAgICAgICAgICAgICAgIGJ1dHRvblRleHQ6IG9wdGlvbi50ZXh0IHx8ICcnXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnY2xpY2tCdXR0b24nLFxuICAgICAgICAgICAgYnV0dG9uQ29udHJvbE5hbWU6IG9wdGlvbj8uY29udHJvbE5hbWUgfHwgJycsXG4gICAgICAgICAgICBidXR0b25UZXh0OiBvcHRpb24/LnRleHQgfHwgJydcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBhcHBseVNpbmdsZUFjdGlvbihldmVudCwgYWN0aW9uKSB7XG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdjbGlja0J1dHRvbicgJiYgZXZlbnQua2luZCA9PT0gJ2RpYWxvZycpIHtcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbiA9IGZpbmREaWFsb2dCdXR0b24oZXZlbnQsIGFjdGlvbi5idXR0b25Db250cm9sTmFtZSB8fCBhY3Rpb24uYnV0dG9uVGV4dCk7XG4gICAgICAgICAgICBpZiAoYnV0dG9uPy5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgYnV0dG9uLmVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzNTApO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFjdGlvbj8udHlwZSA9PT0gJ2NsaWNrQnV0dG9uJyAmJiBldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRyb2wgPSBmaW5kTWVzc2FnZUJhckNvbnRyb2woZXZlbnQsIGFjdGlvbi5idXR0b25Db250cm9sTmFtZSB8fCBhY3Rpb24uYnV0dG9uVGV4dCk7XG4gICAgICAgICAgICBpZiAoY29udHJvbD8uZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIGNvbnRyb2wuZWxlbWVudC5jbGljaygpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDM1MCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYWN0aW9uPy50eXBlID09PSAnY2xpY2tCdXR0b24nKSB7XG4gICAgICAgICAgICBjb25zdCBnbG9iYWxDb250cm9sID0gZmluZEdsb2JhbENsaWNrYWJsZShhY3Rpb24uYnV0dG9uQ29udHJvbE5hbWUgfHwgYWN0aW9uLmJ1dHRvblRleHQpO1xuICAgICAgICAgICAgaWYgKCFnbG9iYWxDb250cm9sPy5lbGVtZW50KSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBnbG9iYWxDb250cm9sLmVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDM1MCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdjbG9zZU1lc3NhZ2VCYXInICYmIGV2ZW50LmtpbmQgPT09ICdtZXNzYWdlQmFyJykge1xuICAgICAgICAgICAgY29uc3QgZnJvbU9wdGlvbiA9IGZpbmRNZXNzYWdlQmFyQ29udHJvbChldmVudCwgYWN0aW9uLmJ1dHRvbkNvbnRyb2xOYW1lIHx8IGFjdGlvbi5idXR0b25UZXh0KTtcbiAgICAgICAgICAgIGNvbnN0IGZyb21Db250cm9scyA9IChldmVudC5jb250cm9scyB8fCBbXSkuZmluZChjdHJsID0+IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCAnJykgPT09ICdtZXNzYWdlYmFyY2xvc2UnKTtcbiAgICAgICAgICAgIGNvbnN0IGZyb21FbnRyeSA9XG4gICAgICAgICAgICAgICAgZXZlbnQuZWxlbWVudD8ucXVlcnlTZWxlY3Rvcj8uKCdbZGF0YS1keW4tY29udHJvbG5hbWU9XCJNZXNzYWdlQmFyQ2xvc2VcIl0nKSB8fCBudWxsO1xuICAgICAgICAgICAgY29uc3QgZnJvbVBhZ2UgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZT1cIk1lc3NhZ2VCYXJDbG9zZVwiXScpKS5maW5kKGlzRWxlbWVudFZpc2libGUpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCBjbG9zZUVsZW1lbnQgPSBmcm9tT3B0aW9uPy5lbGVtZW50IHx8IGZyb21Db250cm9scz8uZWxlbWVudCB8fCBmcm9tRW50cnkgfHwgZnJvbVBhZ2U7XG4gICAgICAgICAgICBpZiAoIWNsb3NlRWxlbWVudCB8fCAhaXNFbGVtZW50VmlzaWJsZShjbG9zZUVsZW1lbnQpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBjbG9zZUVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKDI1MCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24/LnR5cGUgPT09ICdzdG9wJykge1xuICAgICAgICAgICAgdGhyb3cgY3JlYXRlVXNlclN0b3BFcnJvcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFjdGlvbj8udHlwZSA9PT0gJ25vbmUnO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGFwcGx5SGFuZGxlcihldmVudCwgaGFuZGxlcikge1xuICAgICAgICBjb25zdCBhY3Rpb25zID0gbm9ybWFsaXplSGFuZGxlckFjdGlvbnMoaGFuZGxlcik7XG4gICAgICAgIGlmICghYWN0aW9ucy5sZW5ndGgpIHJldHVybiB0cnVlO1xuICAgICAgICBsZXQgaGFuZGxlZCA9IGZhbHNlO1xuICAgICAgICBmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXZlbnRzID0gZGV0ZWN0VW5leHBlY3RlZEV2ZW50cygpO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRXZlbnQgPSBjdXJyZW50RXZlbnRzWzBdIHx8IGV2ZW50O1xuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IGF3YWl0IGFwcGx5U2luZ2xlQWN0aW9uKGFjdGl2ZUV2ZW50LCBhY3Rpb24pO1xuICAgICAgICAgICAgaGFuZGxlZCA9IGhhbmRsZWQgfHwgYXBwbGllZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaGFuZGxlZDtcbiAgICB9XG5cbiAgICAvLyBhc2tVc2VyQW5kSGFuZGxlRXZlbnQgcmVtb3ZlZCBcdTIwMTQgbGVhcm5pbmcgbW9kZSB1c2VzIHRoZSByZWNvcmRlci1iYXNlZFxuICAgIC8vIGFwcHJvYWNoIGluIGhhbmRsZVVuZXhwZWN0ZWRFdmVudHMgd2hpY2ggY2FwdHVyZXMgdXNlciBjbGlja3Mgb24gdGhlXG4gICAgLy8gYWN0dWFsIEQzNjUgcGFnZSBhbmQgYXV0b21hdGljYWxseSBjcmVhdGVzIHJ1bGVzIGZyb20gdGhlbS5cblxuICAgIGZ1bmN0aW9uIGluZmVyRmxvd091dGNvbWVGcm9tQWN0aW9uKGFjdGlvbiwgZXZlbnQpIHtcbiAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KGFjdGlvbj8uY29udHJvbE5hbWUgfHwgYWN0aW9uPy50ZXh0IHx8ICcnKTtcbiAgICAgICAgaWYgKCF0b2tlbikgcmV0dXJuICduZXh0LXN0ZXAnO1xuICAgICAgICBpZiAodG9rZW4uaW5jbHVkZXMoJ3N0b3AnKSkgcmV0dXJuICdzdG9wJztcbiAgICAgICAgaWYgKHRva2VuLmluY2x1ZGVzKCdjYW5jZWwnKSB8fCB0b2tlbi5pbmNsdWRlcygnY2xvc2UnKSB8fCB0b2tlbiA9PT0gJ25vJykge1xuICAgICAgICAgICAgaWYgKGV2ZW50Py5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2NvbnRpbnVlLWxvb3AnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICduZXh0LXN0ZXAnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnbmV4dC1zdGVwJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBidWlsZEludGVycnVwdGlvbk9wdGlvbnMoZXZlbnQpIHtcbiAgICAgICAgY29uc3QgZGVkdXBlID0gbmV3IFNldCgpO1xuICAgICAgICBjb25zdCBhbGwgPSBbXTtcbiAgICAgICAgY29uc3QgcHVzaFVuaXF1ZSA9IChpdGVtKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBvcHRpb24gPSB7XG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGl0ZW0/LmNvbnRyb2xOYW1lIHx8ICcnLFxuICAgICAgICAgICAgICAgIHRleHQ6IGl0ZW0/LnRleHQgfHwgJydcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtub3JtYWxpemVUZXh0KG9wdGlvbi5jb250cm9sTmFtZSl9fCR7bm9ybWFsaXplVGV4dChvcHRpb24udGV4dCl9YDtcbiAgICAgICAgICAgIGlmIChkZWR1cGUuaGFzKGtleSkpIHJldHVybjtcbiAgICAgICAgICAgIGRlZHVwZS5hZGQoa2V5KTtcbiAgICAgICAgICAgIGFsbC5wdXNoKG9wdGlvbik7XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV2ZW50LmtpbmQgPT09ICdkaWFsb2cnKSB7XG4gICAgICAgICAgICAoZXZlbnQuYnV0dG9ucyB8fCBbXSkuZm9yRWFjaChwdXNoVW5pcXVlKTtcbiAgICAgICAgICAgIGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCkuZm9yRWFjaChwdXNoVW5pcXVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIChldmVudC5jb250cm9scyB8fCBbXSkuZm9yRWFjaChwdXNoVW5pcXVlKTtcbiAgICAgICAgICAgIGNvbGxlY3RHbG9iYWxSZW1lZGlhdGlvbkNvbnRyb2xzKCkuZm9yRWFjaChwdXNoVW5pcXVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjb3JlID0gKG9wdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBub3JtYWxpemVUZXh0KG9wdC5jb250cm9sTmFtZSB8fCBvcHQudGV4dCB8fCAnJyk7XG4gICAgICAgICAgICBpZiAodG9rZW4gPT09ICdyZW1vdmUnIHx8IHRva2VuLmluY2x1ZGVzKCdyZW1vdmUnKSB8fCB0b2tlbiA9PT0gJ2RlbGV0ZScgfHwgdG9rZW4uaW5jbHVkZXMoJ2RlbGV0ZScpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAodG9rZW4gPT09ICdjYW5jZWwnIHx8IHRva2VuLmluY2x1ZGVzKCdjYW5jZWwnKSkgcmV0dXJuIDA7XG4gICAgICAgICAgICBpZiAodG9rZW4gPT09ICdjbG9zZScgfHwgdG9rZW4uaW5jbHVkZXMoJ2Nsb3NlJykpIHJldHVybiAxO1xuICAgICAgICAgICAgaWYgKHRva2VuID09PSAnbm8nKSByZXR1cm4gMjtcbiAgICAgICAgICAgIGlmICh0b2tlbi5zdGFydHNXaXRoKCdtZXNzYWdlYmFyJykpIHJldHVybiAxMDtcbiAgICAgICAgICAgIHJldHVybiA1O1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gYWxsLnNvcnQoKGEsIGIpID0+IHNjb3JlKGEpIC0gc2NvcmUoYikpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbmRFdmVudE9wdGlvbkVsZW1lbnQoZXZlbnQsIG9wdGlvbikge1xuICAgICAgICBjb25zdCBleHBlY3RlZENvbnRyb2wgPSBub3JtYWxpemVUZXh0KG9wdGlvbj8uY29udHJvbE5hbWUgfHwgJycpO1xuICAgICAgICBjb25zdCBleHBlY3RlZFRleHQgPSBub3JtYWxpemVUZXh0KG9wdGlvbj8udGV4dCB8fCAnJyk7XG4gICAgICAgIGNvbnN0IGRpYWxvZ0J1dHRvbiA9IChldmVudC5idXR0b25zIHx8IFtdKS5maW5kKGJ0biA9PiB7XG4gICAgICAgICAgICBjb25zdCBieUNvbnRyb2wgPSBub3JtYWxpemVUZXh0KGJ0bi5jb250cm9sTmFtZSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBieVRleHQgPSBub3JtYWxpemVUZXh0KGJ0bi50ZXh0IHx8ICcnKTtcbiAgICAgICAgICAgIHJldHVybiAoZXhwZWN0ZWRDb250cm9sICYmIGJ5Q29udHJvbCA9PT0gZXhwZWN0ZWRDb250cm9sKSB8fCAoZXhwZWN0ZWRUZXh0ICYmIGJ5VGV4dCA9PT0gZXhwZWN0ZWRUZXh0KTtcbiAgICAgICAgfSk/LmVsZW1lbnQgfHwgbnVsbDtcbiAgICAgICAgaWYgKGRpYWxvZ0J1dHRvbikgcmV0dXJuIGRpYWxvZ0J1dHRvbjtcblxuICAgICAgICBjb25zdCBtZXNzYWdlQ29udHJvbCA9IChldmVudC5jb250cm9scyB8fCBbXSkuZmluZChjdHJsID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ5Q29udHJvbCA9IG5vcm1hbGl6ZVRleHQoY3RybC5jb250cm9sTmFtZSB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBieVRleHQgPSBub3JtYWxpemVUZXh0KGN0cmwudGV4dCB8fCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gKGV4cGVjdGVkQ29udHJvbCAmJiBieUNvbnRyb2wgPT09IGV4cGVjdGVkQ29udHJvbCkgfHwgKGV4cGVjdGVkVGV4dCAmJiBieVRleHQgPT09IGV4cGVjdGVkVGV4dCk7XG4gICAgICAgIH0pPy5lbGVtZW50IHx8IG51bGw7XG4gICAgICAgIGlmIChtZXNzYWdlQ29udHJvbCkgcmV0dXJuIG1lc3NhZ2VDb250cm9sO1xuXG4gICAgICAgIHJldHVybiBmaW5kR2xvYmFsQ2xpY2thYmxlKG9wdGlvbj8uY29udHJvbE5hbWUgfHwgb3B0aW9uPy50ZXh0IHx8ICcnKT8uZWxlbWVudCB8fCBudWxsO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIHJlcXVlc3RJbnRlcnJ1cHRpb25EZWNpc2lvbihldmVudCkge1xuICAgICAgICBjb25zdCByZXF1ZXN0SWQgPSBgaW50cl8ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygxNikuc2xpY2UoMiwgOCl9YDtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb24gPSBudWxsO1xuICAgICAgICBleGVjdXRpb25Db250cm9sLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgIHByb2dyZXNzOiB7XG4gICAgICAgICAgICAgICAgcGhhc2U6ICdwYXVzZWRGb3JJbnRlcnJ1cHRpb24nLFxuICAgICAgICAgICAgICAgIGtpbmQ6IGV2ZW50LmtpbmQsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogc2hvcnRlbkZvckxvZyhldmVudC50ZXh0LCAxODApLFxuICAgICAgICAgICAgICAgIHN0ZXBJbmRleDogZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sICcqJyk7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19JTlRFUlJVUFRJT04nLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgICB3b3JrZmxvd0lkOiBjdXJyZW50V29ya2Zsb3c/LmlkIHx8ICcnLFxuICAgICAgICAgICAgICAgIHN0ZXBJbmRleDogZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4LFxuICAgICAgICAgICAgICAgIGtpbmQ6IGV2ZW50LmtpbmQsXG4gICAgICAgICAgICAgICAgdGV4dDogc2hvcnRlbkZvckxvZyhldmVudC50ZXh0LCA2MDApLFxuICAgICAgICAgICAgICAgIG9wdGlvbnM6IGJ1aWxkSW50ZXJydXB0aW9uT3B0aW9ucyhldmVudClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgJyonKTtcblxuICAgICAgICB3aGlsZSAoIWV4ZWN1dGlvbkNvbnRyb2wuaXNTdG9wcGVkKSB7XG4gICAgICAgICAgICBjb25zdCBkZWNpc2lvbiA9IGV4ZWN1dGlvbkNvbnRyb2wucGVuZGluZ0ludGVycnVwdGlvbkRlY2lzaW9uO1xuICAgICAgICAgICAgaWYgKGRlY2lzaW9uICYmIGRlY2lzaW9uLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKSB7XG4gICAgICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGVjaXNpb247XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBzbGVlcCgxNTApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBhcHBseUludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50LCBkZWNpc2lvbikge1xuICAgICAgICBjb25zdCBhY3Rpb25UeXBlID0gZGVjaXNpb24/LmFjdGlvblR5cGUgfHwgJ25vbmUnO1xuICAgICAgICBpZiAoYWN0aW9uVHlwZSA9PT0gJ3N0b3AnKSB7XG4gICAgICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgY2xpY2tlZE9wdGlvbiA9IG51bGw7XG4gICAgICAgIGxldCBjbGlja2VkRm9sbG93dXBPcHRpb24gPSBudWxsO1xuICAgICAgICBpZiAoYWN0aW9uVHlwZSA9PT0gJ2NsaWNrT3B0aW9uJykge1xuICAgICAgICAgICAgY29uc3Qgb3B0aW9uID0gZGVjaXNpb24/LnNlbGVjdGVkT3B0aW9uIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgZWxlbWVudCA9IGZpbmRFdmVudE9wdGlvbkVsZW1lbnQoZXZlbnQsIG9wdGlvbik7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCAmJiB0eXBlb2YgZWxlbWVudC5jbGljayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuY2xpY2soKTtcbiAgICAgICAgICAgICAgICBjbGlja2VkT3B0aW9uID0gb3B0aW9uO1xuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKDM1MCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZm9sbG93dXAgPSBkZWNpc2lvbj8uc2VsZWN0ZWRGb2xsb3d1cE9wdGlvbiB8fCBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChmb2xsb3d1cCAmJiBub3JtYWxpemVUZXh0KGZvbGxvd3VwLmNvbnRyb2xOYW1lIHx8IGZvbGxvd3VwLnRleHQgfHwgJycpICE9PSBub3JtYWxpemVUZXh0KG9wdGlvbi5jb250cm9sTmFtZSB8fCBvcHRpb24udGV4dCB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVmcmVzaEV2ZW50cyA9IGRldGVjdFVuZXhwZWN0ZWRFdmVudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9sbG93dXBFdmVudCA9IHJlZnJlc2hFdmVudHNbMF0gfHwgZXZlbnQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvbGxvd3VwRWxlbWVudCA9IGZpbmRFdmVudE9wdGlvbkVsZW1lbnQoZm9sbG93dXBFdmVudCwgZm9sbG93dXApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sbG93dXBFbGVtZW50ICYmIHR5cGVvZiBmb2xsb3d1cEVsZW1lbnQuY2xpY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGxvd3VwRWxlbWVudC5jbGljaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xpY2tlZEZvbGxvd3VwT3B0aW9uID0gZm9sbG93dXA7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcCgzNTApO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBTZWxlY3RlZCBmb2xsb3ctdXAgb3B0aW9uIG5vdCBmb3VuZDogJHtmb2xsb3d1cC5jb250cm9sTmFtZSB8fCBmb2xsb3d1cC50ZXh0IHx8ICd1bmtub3duJ31gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBTZWxlY3RlZCBpbnRlcnJ1cHRpb24gb3B0aW9uIG5vdCBmb3VuZDogJHtvcHRpb24uY29udHJvbE5hbWUgfHwgb3B0aW9uLnRleHQgfHwgJ3Vua25vd24nfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlY2lzaW9uPy5zYXZlUnVsZSAmJiBjbGlja2VkT3B0aW9uKSB7XG4gICAgICAgICAgICBjb25zdCBhY3Rpb25zID0gW2J1aWxkUnVsZUFjdGlvbkZyb21PcHRpb24oZXZlbnQsIGNsaWNrZWRPcHRpb24pXTtcbiAgICAgICAgICAgIGlmIChjbGlja2VkRm9sbG93dXBPcHRpb24pIHtcbiAgICAgICAgICAgICAgICBhY3Rpb25zLnB1c2goYnVpbGRSdWxlQWN0aW9uRnJvbU9wdGlvbihldmVudCwgY2xpY2tlZEZvbGxvd3VwT3B0aW9uKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWNvcmRMZWFybmVkUnVsZShjcmVhdGVSdWxlRnJvbUV2ZW50KGV2ZW50LCBhY3Rpb25zLCBkZWNpc2lvbj8ub3V0Y29tZSB8fCAnbmV4dC1zdGVwJywgZGVjaXNpb24/Lm1hdGNoTW9kZSB8fCAnY29udGFpbnMnKSk7XG4gICAgICAgICAgICBzZW5kTG9nKCdzdWNjZXNzJywgYExlYXJuZWQgJHtldmVudC5raW5kfSBoYW5kbGVyOiAke2NsaWNrZWRPcHRpb24uY29udHJvbE5hbWUgfHwgY2xpY2tlZE9wdGlvbi50ZXh0IHx8ICdhY3Rpb24nfSR7Y2xpY2tlZEZvbGxvd3VwT3B0aW9uID8gJyAtPiBmb2xsb3ctdXAnIDogJyd9YCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBvdXRjb21lID0gbm9ybWFsaXplRmxvd091dGNvbWUoZGVjaXNpb24/Lm91dGNvbWUgfHwgJ25leHQtc3RlcCcpO1xuICAgICAgICBpZiAob3V0Y29tZSA9PT0gJ3N0b3AnKSB7XG4gICAgICAgICAgICB0aHJvdyBjcmVhdGVVc2VyU3RvcEVycm9yKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG91dGNvbWUgPT09ICdjb250aW51ZS1sb29wJyB8fCBvdXRjb21lID09PSAnYnJlYWstbG9vcCcgfHwgb3V0Y29tZSA9PT0gJ3JlcGVhdC1sb29wJykge1xuICAgICAgICAgICAgYXdhaXQgd2FpdEZvckZsb3dUcmFuc2l0aW9uU3RhYmlsaXR5KCk7XG4gICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IG91dGNvbWUgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVVuZXhwZWN0ZWRFdmVudHMobGVhcm5pbmdNb2RlKSB7XG4gICAgICAgIGNvbnN0IG1heERlcHRoID0gNjtcbiAgICAgICAgZm9yIChsZXQgZGVwdGggPSAwOyBkZXB0aCA8IG1heERlcHRoOyBkZXB0aCsrKSB7XG4gICAgICAgICAgICBjb25zdCBldmVudHMgPSBkZXRlY3RVbmV4cGVjdGVkRXZlbnRzKCk7XG4gICAgICAgICAgICBpZiAoIWV2ZW50cy5sZW5ndGgpIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGV2ZW50ID0gZXZlbnRzWzBdO1xuXG4gICAgICAgICAgICBpZiAoaXNCZW5pZ25NZXNzYWdlQmFyRXZlbnQoZXZlbnQpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YDtcbiAgICAgICAgICAgICAgICBpZiAoIWFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgSWdub3JpbmcgYmVuaWduIG1lc3NhZ2UgYmFyOiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCwgMTIwKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuYWRkKGtleSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIC0tLSBUcnkgc2F2ZWQgaGFuZGxlcnMgZmlyc3QgKHdvcmtzIGluIEJPVEggbW9kZXMpIC0tLVxuICAgICAgICAgICAgY29uc3QgaGFuZGxlciA9IGZpbmRNYXRjaGluZ0hhbmRsZXIoZXZlbnQpO1xuICAgICAgICAgICAgaWYgKGhhbmRsZXIgJiYgaGFuZGxlci5tb2RlICE9PSAnYWx3YXlzQXNrJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZWQgPSBhd2FpdCBhcHBseUhhbmRsZXIoZXZlbnQsIGhhbmRsZXIpO1xuICAgICAgICAgICAgICAgIGlmIChoYW5kbGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgQXBwbGllZCBsZWFybmVkIGhhbmRsZXIgZm9yICR7ZXZlbnQua2luZH06ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlck91dGNvbWUgPSBub3JtYWxpemVGbG93T3V0Y29tZShoYW5kbGVyPy5vdXRjb21lIHx8ICduZXh0LXN0ZXAnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhbmRsZXJPdXRjb21lID09PSAnc3RvcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGNyZWF0ZVVzZXJTdG9wRXJyb3IoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoaGFuZGxlck91dGNvbWUgPT09ICdjb250aW51ZS1sb29wJyB8fCBoYW5kbGVyT3V0Y29tZSA9PT0gJ2JyZWFrLWxvb3AnIHx8IGhhbmRsZXJPdXRjb21lID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yRmxvd1RyYW5zaXRpb25TdGFiaWxpdHkoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogaGFuZGxlck91dGNvbWUgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBNYXJrIG1lc3NhZ2UgYmFyIGFzIGFja25vd2xlZGdlZCBzbyBpdCBkb2Vzbid0IHJlLXRyaWdnZXIgaWZcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGJhciBwZXJzaXN0cyBhZnRlciB0aGUgaGFuZGxlciByYW4gKGUuZy4gY2xvc2UgYnV0dG9uIGhpZGRlbikuXG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmFkZChgbWVzc2FnZUJhcnwke2V2ZW50LnRlbXBsYXRlVGV4dH1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIC0tLSBOb24tYmxvY2tpbmcgbWVzc2FnZSBiYXIgaGFuZGxpbmcgLS0tXG4gICAgICAgICAgICAvLyBNZXNzYWdlIGJhcnMgZG9uJ3QgYmxvY2sgdGhlIFVJLiBJbiBsZWFybmluZyBtb2RlIHdlIHBhdXNlIE9OQ0UgdG9cbiAgICAgICAgICAgIC8vIGxldCB0aGUgdXNlciBkZWNpZGUsIHRoZW4gYWNrbm93bGVkZ2UgdGhlIGtleSBzbyBpdCBkb2Vzbid0IHJlcGVhdC5cbiAgICAgICAgICAgIGlmIChldmVudC5raW5kID09PSAnbWVzc2FnZUJhcicpIHtcbiAgICAgICAgICAgICAgICBpZiAobGVhcm5pbmdNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTGVhcm5pbmcgbW9kZTogbWVzc2FnZSBiYXIgZGV0ZWN0ZWQsIGRlY2lzaW9uIHJlcXVpcmVkOiAke3Nob3J0ZW5Gb3JMb2coZXZlbnQudGV4dCl9YCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgcmVxdWVzdEludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXBwbHlJbnRlcnJ1cHRpb25EZWNpc2lvbihldmVudCwgZGVjaXNpb24pO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgJiYgcmVzdWx0LnNpZ25hbCAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY2tub3dsZWRnZWRNZXNzYWdlQmFyS2V5cy5hZGQoYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm9uLWxlYXJuaW5nIG1vZGU6IGp1c3QgbG9nIG9uY2VcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYG1lc3NhZ2VCYXJ8JHtldmVudC50ZW1wbGF0ZVRleHR9YDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmFkZChrZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBNZXNzYWdlIGJhciBkZXRlY3RlZCB3aXRoIG5vIGhhbmRsZXI6ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBNYXJrIGFzIGFja25vd2xlZGdlZCBzbyBpdCBkb2Vzbid0IHJlLXRyaWdnZXIgb24gc3Vic2VxdWVudCBzdGVwc1xuICAgICAgICAgICAgICAgIGFja25vd2xlZGdlZE1lc3NhZ2VCYXJLZXlzLmFkZChgbWVzc2FnZUJhcnwke2V2ZW50LnRlbXBsYXRlVGV4dH1gKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gLS0tIEJsb2NraW5nIGRpYWxvZyBoYW5kbGluZyAtLS1cbiAgICAgICAgICAgIGlmIChsZWFybmluZ01vZGUpIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYExlYXJuaW5nIG1vZGU6IGRpYWxvZyByZXF1aXJlcyBkZWNpc2lvbjogJHtzaG9ydGVuRm9yTG9nKGV2ZW50LnRleHQpfWApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgcmVxdWVzdEludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50KTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseUludGVycnVwdGlvbkRlY2lzaW9uKGV2ZW50LCBkZWNpc2lvbik7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsICYmIHJlc3VsdC5zaWduYWwgIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTm9uLWxlYXJuaW5nIG1vZGUgd2l0aCBubyBoYW5kbGVyOiBsb2cgb25jZSBhbmQgcmV0dXJuXG4gICAgICAgICAgICBjb25zdCBrZXkgPSBgJHtldmVudC5raW5kfXwke2V2ZW50LnRlbXBsYXRlVGV4dH1gO1xuICAgICAgICAgICAgaWYgKCF1bmhhbmRsZWRVbmV4cGVjdGVkRXZlbnRLZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgdW5oYW5kbGVkVW5leHBlY3RlZEV2ZW50S2V5cy5hZGQoa2V5KTtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYFVuZXhwZWN0ZWQgJHtldmVudC5raW5kfSBkZXRlY3RlZCB3aXRoIG5vIGhhbmRsZXI6ICR7c2hvcnRlbkZvckxvZyhldmVudC50ZXh0KX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICB9XG5cbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVXb3JrZmxvdyh3b3JrZmxvdywgZGF0YSkge1xuICAgIHRyeSB7XG4gICAgICAgIC8vIENsZWFyIGFueSBzdGFsZSBwZW5kaW5nIG5hdmlnYXRpb24gc3RhdGUgYmVmb3JlIHN0YXJ0aW5nIGEgbmV3IHJ1blxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbSgnZDM2NV9wZW5kaW5nX3dvcmtmbG93Jyk7XG4gICAgICAgICAgICBpZiAod29ya2Zsb3c/LmlkKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnZDM2NV9hY3RpdmVfd29ya2Zsb3dfaWQnLCB3b3JrZmxvdy5pZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIElnbm9yZSBzZXNzaW9uU3RvcmFnZSBlcnJvcnMgKGUuZy4sIGluIHJlc3RyaWN0ZWQgY29udGV4dHMpXG4gICAgICAgIH1cblxuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFN0YXJ0aW5nIHdvcmtmbG93OiAke3dvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB8fCAndW5uYW1lZCd9YCk7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHsgcGhhc2U6ICd3b3JrZmxvd1N0YXJ0Jywgd29ya2Zsb3c6IHdvcmtmbG93Py5uYW1lIHx8IHdvcmtmbG93Py5pZCB9IH0sICcqJyk7XG4gICAgICAgIC8vIFJlc2V0IGV4ZWN1dGlvbiBjb250cm9sXG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1N0b3BwZWQgPSBmYWxzZTtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5wZW5kaW5nSW50ZXJydXB0aW9uRGVjaXNpb24gPSBudWxsO1xuICAgICAgICBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnMgPSB3b3JrZmxvdy5ydW5PcHRpb25zIHx8IHsgc2tpcFJvd3M6IDAsIGxpbWl0Um93czogMCwgZHJ5UnVuOiBmYWxzZSwgbGVhcm5pbmdNb2RlOiBmYWxzZSwgcnVuVW50aWxJbnRlcmNlcHRpb246IGZhbHNlIH07XG4gICAgICAgIGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0ID0gd29ya2Zsb3c/Ll9vcmlnaW5hbFN0YXJ0SW5kZXggfHwgMDtcbiAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50U3RlcEluZGV4ID0gZXhlY3V0aW9uQ29udHJvbC5zdGVwSW5kZXhPZmZzZXQ7XG4gICAgICAgIHVuaGFuZGxlZFVuZXhwZWN0ZWRFdmVudEtleXMuY2xlYXIoKTtcbiAgICAgICAgYWNrbm93bGVkZ2VkTWVzc2FnZUJhcktleXMuY2xlYXIoKTtcbiAgICAgICAgY3VycmVudFdvcmtmbG93ID0gd29ya2Zsb3c7XG4gICAgICAgIFxuICAgICAgICAvLyBBbHdheXMgcmVmcmVzaCBvcmlnaW5hbC13b3JrZmxvdyBwb2ludGVyIHRvIGF2b2lkIHN0YWxlIHJlc3VtZSBzdGF0ZVxuICAgICAgICAvLyBmcm9tIGEgcHJldmlvdXNseSBleGVjdXRlZCB3b3JrZmxvdyBpbiB0aGUgc2FtZSBwYWdlIGNvbnRleHQuXG4gICAgICAgIHdpbmRvdy5kMzY1T3JpZ2luYWxXb3JrZmxvdyA9IHdvcmtmbG93Py5fb3JpZ2luYWxXb3JrZmxvdyB8fCB3b3JrZmxvdztcbiAgICAgICAgXG4gICAgICAgIGN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gd29ya2Zsb3c/LnNldHRpbmdzIHx8IHt9O1xuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvd1NldHRpbmdzID0gY3VycmVudFdvcmtmbG93U2V0dGluZ3M7XG4gICAgICAgIC8vIEV4cG9zZSBjdXJyZW50IHdvcmtmbG93IGFuZCBleGVjdXRpb24gY29udHJvbCB0byBpbmplY3RlZCBhY3Rpb24gbW9kdWxlc1xuICAgICAgICB3aW5kb3cuZDM2NUN1cnJlbnRXb3JrZmxvdyA9IGN1cnJlbnRXb3JrZmxvdztcbiAgICAgICAgd2luZG93LmQzNjVFeGVjdXRpb25Db250cm9sID0gZXhlY3V0aW9uQ29udHJvbDtcbiAgICAgICAgY29uc3Qgc3RlcHMgPSB3b3JrZmxvdy5zdGVwcztcbiAgICAgICAgXG4gICAgICAgIC8vIEdldCBkYXRhIGZyb20gbmV3IGRhdGFTb3VyY2VzIHN0cnVjdHVyZSBvciBsZWdhY3kgZGF0YVNvdXJjZVxuICAgICAgICBsZXQgcHJpbWFyeURhdGEgPSBbXTtcbiAgICAgICAgbGV0IGRldGFpbFNvdXJjZXMgPSB7fTtcbiAgICAgICAgbGV0IHJlbGF0aW9uc2hpcHMgPSBbXTtcbiAgICAgICAgXG4gICAgICAgIGlmICh3b3JrZmxvdy5kYXRhU291cmNlcykge1xuICAgICAgICAgICAgcHJpbWFyeURhdGEgPSB3b3JrZmxvdy5kYXRhU291cmNlcy5wcmltYXJ5Py5kYXRhIHx8IFtdO1xuICAgICAgICAgICAgcmVsYXRpb25zaGlwcyA9IHdvcmtmbG93LmRhdGFTb3VyY2VzLnJlbGF0aW9uc2hpcHMgfHwgW107XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEluZGV4IGRldGFpbCBkYXRhIHNvdXJjZXMgYnkgSURcbiAgICAgICAgICAgICh3b3JrZmxvdy5kYXRhU291cmNlcy5kZXRhaWxzIHx8IFtdKS5mb3JFYWNoKGRldGFpbCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRldGFpbC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbFNvdXJjZXNbZGV0YWlsLmlkXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IGRldGFpbC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZGV0YWlsLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZHM6IGRldGFpbC5maWVsZHNcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChkYXRhKSB7XG4gICAgICAgICAgICAvLyBMZWdhY3kgZm9ybWF0XG4gICAgICAgICAgICBwcmltYXJ5RGF0YSA9IEFycmF5LmlzQXJyYXkoZGF0YSkgPyBkYXRhIDogW2RhdGFdO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBJZiBubyBkYXRhLCB1c2UgYSBzaW5nbGUgZW1wdHkgcm93IHRvIHJ1biBzdGVwcyBvbmNlXG4gICAgICAgIGlmIChwcmltYXJ5RGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHByaW1hcnlEYXRhID0gW3t9XTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEV4ZWN1dGUgd29ya2Zsb3cgd2l0aCBsb29wIHN1cHBvcnRcbiAgICAgICAgYXdhaXQgZXhlY3V0ZVN0ZXBzV2l0aExvb3BzKHN0ZXBzLCBwcmltYXJ5RGF0YSwgZGV0YWlsU291cmNlcywgcmVsYXRpb25zaGlwcywgd29ya2Zsb3cuc2V0dGluZ3MpO1xuXG4gICAgICAgIHNlbmRMb2coJ2luZm8nLCBgV29ya2Zsb3cgY29tcGxldGU6IHByb2Nlc3NlZCAke3ByaW1hcnlEYXRhLmxlbmd0aH0gcm93c2ApO1xuICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfQ09NUExFVEUnLFxuICAgICAgICAgICAgcmVzdWx0OiB7IHByb2Nlc3NlZDogcHJpbWFyeURhdGEubGVuZ3RoIH1cbiAgICAgICAgfSwgJyonKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBOYXZpZ2F0aW9uIGludGVycnVwdHMgYXJlIG5vdCBlcnJvcnMgLSB0aGUgd29ya2Zsb3cgd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5pc05hdmlnYXRpb25JbnRlcnJ1cHQpIHtcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCAnV29ya2Zsb3cgcGF1c2VkIGZvciBuYXZpZ2F0aW9uIC0gd2lsbCByZXN1bWUgYWZ0ZXIgcGFnZSBsb2FkcycpO1xuICAgICAgICAgICAgcmV0dXJuOyAvLyBEb24ndCByZXBvcnQgYXMgZXJyb3Igb3IgY29tcGxldGVcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFlcnJvciB8fCAhZXJyb3IuX3JlcG9ydGVkKSB7XG4gICAgICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBXb3JrZmxvdyBlcnJvcjogJHtlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpfWApO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19FUlJPUicsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGVycm9yPy5tZXNzYWdlIHx8IFN0cmluZyhlcnJvciksXG4gICAgICAgICAgICAgICAgc3RhY2s6IGVycm9yPy5zdGFja1xuICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0U3RlcEZha2VyUmFuZG9tSXRlbShsaXN0KSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpIHx8ICFsaXN0Lmxlbmd0aCkgcmV0dXJuICcnO1xuICAgIHJldHVybiBsaXN0W01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGxpc3QubGVuZ3RoKV07XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlU3RlcEZha2VyVmFsdWUoZ2VuZXJhdG9yTmFtZSkge1xuICAgIGNvbnN0IGZpcnN0TmFtZXMgPSBbJ0phbWVzJywgJ01hcnknLCAnSm9obicsICdQYXRyaWNpYScsICdSb2JlcnQnLCAnSmVubmlmZXInLCAnTWljaGFlbCcsICdMaW5kYScsICdEYXZpZCcsICdFbGl6YWJldGgnLCAnV2lsbGlhbScsICdCYXJiYXJhJywgJ1JpY2hhcmQnLCAnU3VzYW4nLCAnSm9zZXBoJywgJ0plc3NpY2EnXTtcbiAgICBjb25zdCBsYXN0TmFtZXMgPSBbJ1NtaXRoJywgJ0pvaG5zb24nLCAnV2lsbGlhbXMnLCAnQnJvd24nLCAnSm9uZXMnLCAnR2FyY2lhJywgJ01pbGxlcicsICdEYXZpcycsICdNYXJ0aW5leicsICdMb3BleicsICdHb256YWxleicsICdXaWxzb24nLCAnQW5kZXJzb24nLCAnVGhvbWFzJywgJ1RheWxvcicsICdNb29yZSddO1xuICAgIGNvbnN0IHdvcmRzID0gWydhbHBoYScsICdicmF2bycsICdjaGFybGllJywgJ2RlbHRhJywgJ2VjaG8nLCAnZm94dHJvdCcsICdhcGV4JywgJ2JvbHQnLCAnY3Jlc3QnLCAnZGF3bicsICdlbWJlcicsICdmbGludCddO1xuXG4gICAgY29uc3QgbmFtZSA9IFN0cmluZyhnZW5lcmF0b3JOYW1lIHx8ICdGaXJzdCBOYW1lJyk7XG4gICAgaWYgKG5hbWUgPT09ICdGaXJzdCBOYW1lJykgcmV0dXJuIGdldFN0ZXBGYWtlclJhbmRvbUl0ZW0oZmlyc3ROYW1lcyk7XG4gICAgaWYgKG5hbWUgPT09ICdMYXN0IE5hbWUnKSByZXR1cm4gZ2V0U3RlcEZha2VyUmFuZG9tSXRlbShsYXN0TmFtZXMpO1xuICAgIGlmIChuYW1lID09PSAnRnVsbCBOYW1lJykgcmV0dXJuIGAke2dldFN0ZXBGYWtlclJhbmRvbUl0ZW0oZmlyc3ROYW1lcyl9ICR7Z2V0U3RlcEZha2VyUmFuZG9tSXRlbShsYXN0TmFtZXMpfWA7XG4gICAgaWYgKG5hbWUgPT09ICdFbWFpbCcpIHtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGZpcnN0TmFtZXMpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGxhc3QgPSBnZXRTdGVwRmFrZXJSYW5kb21JdGVtKGxhc3ROYW1lcykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgcmV0dXJuIGAke2ZpcnN0fS4ke2xhc3R9QGV4YW1wbGUuY29tYDtcbiAgICB9XG4gICAgaWYgKG5hbWUgPT09ICdOdW1iZXInKSByZXR1cm4gU3RyaW5nKE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwKSk7XG4gICAgaWYgKG5hbWUgPT09ICdEZWNpbWFsJykgcmV0dXJuIChNYXRoLnJhbmRvbSgpICogMTAwMDApLnRvRml4ZWQoMik7XG4gICAgaWYgKG5hbWUgPT09ICdEYXRlJykge1xuICAgICAgICBjb25zdCBvZmZzZXREYXlzID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMzY1ICogMyk7XG4gICAgICAgIGNvbnN0IGQgPSBuZXcgRGF0ZShEYXRlLm5vdygpIC0gb2Zmc2V0RGF5cyAqIDI0ICogNjAgKiA2MCAqIDEwMDApO1xuICAgICAgICByZXR1cm4gZC50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgICB9XG4gICAgaWYgKG5hbWUgPT09ICdVVUlEJykge1xuICAgICAgICByZXR1cm4gJ3h4eHh4eHh4LXh4eHgtNHh4eC15eHh4LXh4eHh4eHh4eHh4eCcucmVwbGFjZSgvW3h5XS9nLCAoYykgPT4ge1xuICAgICAgICAgICAgY29uc3QgciA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDE2KTtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBjID09PSAneCcgPyByIDogKHIgJiAweDMgfCAweDgpO1xuICAgICAgICAgICAgcmV0dXJuIHYudG9TdHJpbmcoMTYpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKG5hbWUgPT09ICdCb29sZWFuJykgcmV0dXJuIE1hdGgucmFuZG9tKCkgPCAwLjUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuICAgIGlmIChuYW1lID09PSAnV29yZCcpIHJldHVybiBnZXRTdGVwRmFrZXJSYW5kb21JdGVtKHdvcmRzKTtcbiAgICBpZiAobmFtZSA9PT0gJ0xvcmVtIFNlbnRlbmNlJykge1xuICAgICAgICBjb25zdCBwaWNrZWQgPSBbLi4ud29yZHNdLnNvcnQoKCkgPT4gTWF0aC5yYW5kb20oKSAtIDAuNSkuc2xpY2UoMCwgNSk7XG4gICAgICAgIGNvbnN0IHNlbnRlbmNlID0gcGlja2VkLmpvaW4oJyAnKTtcbiAgICAgICAgcmV0dXJuIHNlbnRlbmNlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc2VudGVuY2Uuc2xpY2UoMSk7XG4gICAgfVxuICAgIGlmIChuYW1lID09PSAnU2VxdWVudGlhbCcpIHtcbiAgICAgICAgd2luZG93Ll9fZDM2NVN0ZXBGYWtlclNlcSA9ICh3aW5kb3cuX19kMzY1U3RlcEZha2VyU2VxIHx8IDApICsgMTtcbiAgICAgICAgcmV0dXJuIFN0cmluZyh3aW5kb3cuX19kMzY1U3RlcEZha2VyU2VxKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFN0ZXBGYWtlclJhbmRvbUl0ZW0oZmlyc3ROYW1lcyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVTdGVwVmFsdWUoc3RlcCwgY3VycmVudFJvdykge1xuICAgIGNvbnN0IHNvdXJjZSA9IHN0ZXA/LnZhbHVlU291cmNlIHx8IChzdGVwPy5maWVsZE1hcHBpbmcgPyAnZGF0YScgOiAnc3RhdGljJyk7XG5cbiAgICBpZiAoc291cmNlID09PSAnY2xpcGJvYXJkJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFuYXZpZ2F0b3IuY2xpcGJvYXJkPy5yZWFkVGV4dCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2xpcGJvYXJkIEFQSSBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC5yZWFkVGV4dCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRleHQgPz8gJyc7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBzZW5kTG9nKCdlcnJvcicsIGBDbGlwYm9hcmQgcmVhZCBmYWlsZWQ6ICR7ZXJyb3I/Lm1lc3NhZ2UgfHwgU3RyaW5nKGVycm9yKX1gKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2xpcGJvYXJkIHJlYWQgZmFpbGVkJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc291cmNlID09PSAnZGF0YScpIHtcbiAgICAgICAgY29uc3Qgcm93ID0gY3VycmVudFJvdyB8fCB3aW5kb3cuZDM2NUV4ZWN1dGlvbkNvbnRyb2w/LmN1cnJlbnREYXRhUm93IHx8IHt9O1xuICAgICAgICBjb25zdCBmaWVsZCA9IHN0ZXA/LmZpZWxkTWFwcGluZyB8fCAnJztcbiAgICAgICAgaWYgKCFmaWVsZCkgcmV0dXJuICcnO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHJvd1tmaWVsZF07XG4gICAgICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsID8gJycgOiBTdHJpbmcodmFsdWUpO1xuICAgIH1cblxuICAgIGlmIChzb3VyY2UgPT09ICdmYWtlcicpIHtcbiAgICAgICAgcmV0dXJuIGdlbmVyYXRlU3RlcEZha2VyVmFsdWUoc3RlcD8uZmFrZXJHZW5lcmF0b3IgfHwgJ0ZpcnN0IE5hbWUnKTtcbiAgICB9XG5cbiAgICBpZiAoc291cmNlID09PSAncmFuZG9tLWNvbnN0YW50Jykge1xuICAgICAgICBjb25zdCBvcHRpb25zID0gU3RyaW5nKHN0ZXA/LnJhbmRvbVZhbHVlcyB8fCAnJylcbiAgICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgICAubWFwKCh2YWx1ZSkgPT4gdmFsdWUudHJpbSgpKVxuICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgaWYgKCFvcHRpb25zLmxlbmd0aCkgcmV0dXJuICcnO1xuICAgICAgICByZXR1cm4gb3B0aW9uc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBvcHRpb25zLmxlbmd0aCldO1xuICAgIH1cblxuICAgIHJldHVybiBzdGVwPy52YWx1ZSA/PyAnJztcbn1cblxuLy8gRXhlY3V0ZSBhIHNpbmdsZSBzdGVwIChtYXBzIHN0ZXAudHlwZSB0byBhY3Rpb24gZnVuY3Rpb25zKVxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVNpbmdsZVN0ZXAoc3RlcCwgc3RlcEluZGV4LCBjdXJyZW50Um93LCBkZXRhaWxTb3VyY2VzLCBzZXR0aW5ncywgZHJ5UnVuLCBsZWFybmluZ01vZGUpIHtcbiAgICBleGVjdXRpb25Db250cm9sLmN1cnJlbnRTdGVwSW5kZXggPSB0eXBlb2Ygc3RlcC5fYWJzb2x1dGVJbmRleCA9PT0gJ251bWJlcidcbiAgICAgICAgPyBzdGVwLl9hYnNvbHV0ZUluZGV4XG4gICAgICAgIDogKGV4ZWN1dGlvbkNvbnRyb2wuc3RlcEluZGV4T2Zmc2V0IHx8IDApICsgc3RlcEluZGV4O1xuICAgIGNvbnN0IHN0ZXBMYWJlbCA9IHN0ZXAuZGlzcGxheVRleHQgfHwgc3RlcC5jb250cm9sTmFtZSB8fCBzdGVwLnR5cGUgfHwgYHN0ZXAgJHtzdGVwSW5kZXh9YDtcbiAgICAvLyBDb21wdXRlIGFic29sdXRlIHN0ZXAgaW5kZXggKGFscmVhZHkgc3RvcmVkIG9uIGV4ZWN1dGlvbkNvbnRyb2wpXG4gICAgY29uc3QgYWJzb2x1dGVTdGVwSW5kZXggPSBleGVjdXRpb25Db250cm9sLmN1cnJlbnRTdGVwSW5kZXg7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBTdGFydCcsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxuICAgIH0sICcqJyk7XG4gICAgbGV0IHdhaXRUYXJnZXQgPSAnJztcbiAgICBsZXQgc2hvdWxkV2FpdEJlZm9yZSA9IGZhbHNlO1xuICAgIGxldCBzaG91bGRXYWl0QWZ0ZXIgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgICAvLyBOb3JtYWxpemUgc3RlcCB0eXBlIChhbGxvdyBib3RoIGNhbWVsQ2FzZSBhbmQgZGFzaC1zZXBhcmF0ZWQgdHlwZXMpXG4gICAgICAgIGNvbnN0IHN0ZXBUeXBlID0gKHN0ZXAudHlwZSB8fCAnJykucmVwbGFjZSgvLShbYS16XSkvZywgKF8sIGMpID0+IGMudG9VcHBlckNhc2UoKSk7XG4gICAgICAgIGxvZ1N0ZXAoYFN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9OiAke3N0ZXBUeXBlfSAtPiAke3N0ZXBMYWJlbH1gKTtcblxuICAgICAgICAvLyBJbiBsZWFybmluZyBtb2RlOlxuICAgICAgICAvLyAxLiBDaGVjayBmb3IgdW5leHBlY3RlZCBldmVudHMgKGRpYWxvZ3MvbWVzc2FnZXMpIGZyb20gdGhlIHByZXZpb3VzIHN0ZXAuXG4gICAgICAgIC8vICAgIElmIG9uZSBpcyBmb3VuZCB0aGUgdXNlciBpcyBwYXVzZWQgdG8gaGFuZGxlIGl0LCBzbyB3ZSBza2lwIHRoZVxuICAgICAgICAvLyAgICBzZXBhcmF0ZSBjb25maXJtYXRpb24gcGF1c2UgdG8gYXZvaWQgYSBkb3VibGUtcGF1c2UuXG4gICAgICAgIC8vIDIuIElmIG5vIGludGVycnVwdGlvbiB3YXMgZm91bmQsIHBhdXNlIGZvciBzdGVwIGNvbmZpcm1hdGlvbi5cbiAgICAgICAgY29uc3QgcnVuVW50aWxJbnRlcmNlcHRpb24gPSAhIWV4ZWN1dGlvbkNvbnRyb2wucnVuT3B0aW9ucz8ucnVuVW50aWxJbnRlcmNlcHRpb247XG4gICAgICAgIGlmIChsZWFybmluZ01vZGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGludGVycnVwdGlvbiA9IGF3YWl0IGhhbmRsZVVuZXhwZWN0ZWRFdmVudHModHJ1ZSk7XG4gICAgICAgICAgICBpZiAoaW50ZXJydXB0aW9uPy5zaWduYWwgJiYgaW50ZXJydXB0aW9uLnNpZ25hbCAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGludGVycnVwdGlvbjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gT25seSBwYXVzZSBmb3IgY29uZmlybWF0aW9uIGlmIGhhbmRsZVVuZXhwZWN0ZWRFdmVudHMgZGlkbid0XG4gICAgICAgICAgICAvLyBhbHJlYWR5IHBhdXNlIChpLmUuIHRoZXJlIHdlcmUgbm8gZXZlbnRzIHRvIGhhbmRsZSkuXG4gICAgICAgICAgICBpZiAoIXJ1blVudGlsSW50ZXJjZXB0aW9uKSB7XG4gICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBMZWFybmluZyBtb2RlOiBjb25maXJtIHN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9ICgke3N0ZXBMYWJlbH0pLiBSZXN1bWUgdG8gY29udGludWUuYCk7XG4gICAgICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5pc1BhdXNlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICAgICAgICAgICAgICBwcm9ncmVzczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGhhc2U6ICdwYXVzZWRGb3JDb25maXJtYXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RlcE5hbWU6IHN0ZXBMYWJlbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXhcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sICcqJyk7XG4gICAgICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXNwZWN0IGRyeSBydW4gbW9kZVxuICAgICAgICBpZiAoZHJ5UnVuKSB7XG4gICAgICAgICAgICBzZW5kTG9nKCdpbmZvJywgYERyeSBydW4gLSBza2lwcGluZyBhY3Rpb246ICR7c3RlcC50eXBlfSAke3N0ZXAuY29udHJvbE5hbWUgfHwgJyd9YCk7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ3N0ZXBEb25lJywgc3RlcE5hbWU6IHN0ZXBMYWJlbCwgc3RlcEluZGV4OiBhYnNvbHV0ZVN0ZXBJbmRleCwgbG9jYWxTdGVwSW5kZXg6IHN0ZXBJbmRleCB9XG4gICAgICAgICAgICB9LCAnKicpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnbm9uZScgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCByZXNvbHZlZFZhbHVlID0gbnVsbDtcbiAgICAgICAgaWYgKFsnaW5wdXQnLCAnc2VsZWN0JywgJ2xvb2t1cFNlbGVjdCcsICdncmlkSW5wdXQnLCAnZmlsdGVyJywgJ3F1ZXJ5RmlsdGVyJ10uaW5jbHVkZXMoc3RlcFR5cGUpKSB7XG4gICAgICAgICAgICByZXNvbHZlZFZhbHVlID0gYXdhaXQgcmVzb2x2ZVN0ZXBWYWx1ZShzdGVwLCBjdXJyZW50Um93KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHdhaXRUYXJnZXQgPSBzdGVwLndhaXRUYXJnZXRDb250cm9sTmFtZSB8fCBzdGVwLmNvbnRyb2xOYW1lIHx8ICcnO1xuICAgICAgICBzaG91bGRXYWl0QmVmb3JlID0gISFzdGVwLndhaXRVbnRpbFZpc2libGU7XG4gICAgICAgIHNob3VsZFdhaXRBZnRlciA9ICEhc3RlcC53YWl0VW50aWxIaWRkZW47XG5cbiAgICAgICAgaWYgKChzaG91bGRXYWl0QmVmb3JlIHx8IHNob3VsZFdhaXRBZnRlcikgJiYgIXdhaXRUYXJnZXQpIHtcbiAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgV2FpdCBvcHRpb24gc2V0IGJ1dCBubyBjb250cm9sIG5hbWUgb24gc3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzaG91bGRXYWl0QmVmb3JlICYmIHdhaXRUYXJnZXQpIHtcbiAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbih3YWl0VGFyZ2V0LCAndmlzaWJsZScsIG51bGwsIDUwMDApO1xuICAgICAgICB9XG5cbiAgICAgICAgc3dpdGNoIChzdGVwVHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnY2xpY2snOlxuICAgICAgICAgICAgICAgIGF3YWl0IGNsaWNrRWxlbWVudChzdGVwLmNvbnRyb2xOYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnaW5wdXQnOlxuICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzpcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRJbnB1dFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIHJlc29sdmVkVmFsdWUsIHN0ZXAuZmllbGRUeXBlLCBzdGVwLmNvbWJvU2VsZWN0TW9kZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2xvb2t1cFNlbGVjdCc6XG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0TG9va3VwU2VsZWN0VmFsdWUoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5jb21ib1NlbGVjdE1vZGUgfHwgJycpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdjaGVja2JveCc6XG4gICAgICAgICAgICAgICAgYXdhaXQgc2V0Q2hlY2tib3hWYWx1ZShzdGVwLmNvbnRyb2xOYW1lLCBjb2VyY2VCb29sZWFuKHN0ZXAudmFsdWUpKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnZ3JpZElucHV0JzpcbiAgICAgICAgICAgICAgICBhd2FpdCBzZXRHcmlkQ2VsbFZhbHVlKHN0ZXAuY29udHJvbE5hbWUsIHJlc29sdmVkVmFsdWUsIHN0ZXAuZmllbGRUeXBlLCAhIXN0ZXAud2FpdEZvclZhbGlkYXRpb24sIHN0ZXAuY29tYm9TZWxlY3RNb2RlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnZmlsdGVyJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBhcHBseUdyaWRGaWx0ZXIoc3RlcC5jb250cm9sTmFtZSwgcmVzb2x2ZWRWYWx1ZSwgc3RlcC5maWx0ZXJNZXRob2QgfHwgJ2lzIGV4YWN0bHknLCBzdGVwLmNvbWJvU2VsZWN0TW9kZSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdxdWVyeUZpbHRlcic6XG4gICAgICAgICAgICAgICAgYXdhaXQgY29uZmlndXJlUXVlcnlGaWx0ZXIoc3RlcC50YWJsZU5hbWUsIHN0ZXAuZmllbGROYW1lLCByZXNvbHZlZFZhbHVlLCB7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVkUXVlcnk6IHN0ZXAuc2F2ZWRRdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VEaWFsb2dBZnRlcjogc3RlcC5jbG9zZURpYWxvZ0FmdGVyLFxuICAgICAgICAgICAgICAgICAgICBjb21ib1NlbGVjdE1vZGU6IHN0ZXAuY29tYm9TZWxlY3RNb2RlIHx8ICcnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ3dhaXQnOlxuICAgICAgICAgICAgICAgIGF3YWl0IHNsZWVwKE51bWJlcihzdGVwLmR1cmF0aW9uKSB8fCA1MDApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICd3YWl0VW50aWwnOlxuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRVbnRpbENvbmRpdGlvbihcbiAgICAgICAgICAgICAgICAgICAgc3RlcC5jb250cm9sTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc3RlcC53YWl0Q29uZGl0aW9uIHx8ICd2aXNpYmxlJyxcbiAgICAgICAgICAgICAgICAgICAgc3RlcC53YWl0VmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAudGltZW91dCB8fCAxMDAwMFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ25hdmlnYXRlJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBuYXZpZ2F0ZVRvRm9ybShzdGVwKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnYWN0aXZhdGVUYWInOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFjdGl2YXRlVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAndGFiTmF2aWdhdGUnOlxuICAgICAgICAgICAgICAgIGF3YWl0IGFjdGl2YXRlVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYWN0aW9uUGFuZVRhYic6XG4gICAgICAgICAgICAgICAgYXdhaXQgYWN0aXZhdGVBY3Rpb25QYW5lVGFiKHN0ZXAuY29udHJvbE5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdleHBhbmRTZWN0aW9uJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBleHBhbmRPckNvbGxhcHNlU2VjdGlvbihzdGVwLmNvbnRyb2xOYW1lLCAnZXhwYW5kJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2NvbGxhcHNlU2VjdGlvbic6XG4gICAgICAgICAgICAgICAgYXdhaXQgZXhwYW5kT3JDb2xsYXBzZVNlY3Rpb24oc3RlcC5jb250cm9sTmFtZSwgJ2NvbGxhcHNlJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2Nsb3NlRGlhbG9nJzpcbiAgICAgICAgICAgICAgICBhd2FpdCBjbG9zZURpYWxvZygpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgc3RlcCB0eXBlOiAke3N0ZXAudHlwZX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzaG91bGRXYWl0QWZ0ZXIgJiYgd2FpdFRhcmdldCkge1xuICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICdoaWRkZW4nLCBudWxsLCA1MDAwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBvc3RJbnRlcnJ1cHRpb24gPSBhd2FpdCBoYW5kbGVVbmV4cGVjdGVkRXZlbnRzKGxlYXJuaW5nTW9kZSk7XG4gICAgICAgIGlmIChwb3N0SW50ZXJydXB0aW9uPy5zaWduYWwgJiYgcG9zdEludGVycnVwdGlvbi5zaWduYWwgIT09ICdub25lJykge1xuICAgICAgICAgICAgcmV0dXJuIHBvc3RJbnRlcnJ1cHRpb247XG4gICAgICAgIH1cblxuICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwRG9uZScsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxuICAgICAgICB9LCAnKicpO1xuICAgICAgICBjb25zdCBwZW5kaW5nU2lnbmFsID0gY29uc3VtZVBlbmRpbmdGbG93U2lnbmFsKCk7XG4gICAgICAgIHJldHVybiB7IHNpZ25hbDogcGVuZGluZ1NpZ25hbCB9O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAvLyBSZS10aHJvdyBuYXZpZ2F0aW9uIGludGVycnVwdHMgZm9yIHVwc3RyZWFtIGhhbmRsaW5nXG4gICAgICAgIGlmIChlcnIgJiYgZXJyLmlzTmF2aWdhdGlvbkludGVycnVwdCkgdGhyb3cgZXJyO1xuXG4gICAgICAgIC8vIExlYXJuaW5nLW1vZGUgcmVjb3ZlcnkgcGF0aDogaWYgYSBkaWFsb2cvbWVzc2FnZSBhcHBlYXJlZCBkdXJpbmcgdGhlIHN0ZXAsXG4gICAgICAgIC8vIGhhbmRsZSBpdCBmaXJzdCwgdGhlbiByZS1jaGVjayBwb3N0LWFjdGlvbiB3YWl0IGNvbmRpdGlvbiBvbmNlLlxuICAgICAgICBpZiAobGVhcm5pbmdNb2RlICYmICFlcnI/LmlzVXNlclN0b3ApIHtcbiAgICAgICAgICAgIGNvbnN0IHBlbmRpbmcgPSBkZXRlY3RVbmV4cGVjdGVkRXZlbnRzKCk7XG4gICAgICAgICAgICBpZiAocGVuZGluZy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzZW5kTG9nKCd3YXJuaW5nJywgYExlYXJuaW5nIG1vZGU6IGludGVycnVwdGlvbiBkZXRlY3RlZCBkdXJpbmcgc3RlcCAke2Fic29sdXRlU3RlcEluZGV4ICsgMX0uIEFza2luZyBmb3IgaGFuZGxpbmcuLi5gKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBoYW5kbGVVbmV4cGVjdGVkRXZlbnRzKHRydWUpO1xuICAgICAgICAgICAgICAgIGlmIChzaG91bGRXYWl0QWZ0ZXIgJiYgd2FpdFRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgd2FpdFVudGlsQ29uZGl0aW9uKHdhaXRUYXJnZXQsICdoaWRkZW4nLCBudWxsLCAyNTAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnc3RlcERvbmUnLCBzdGVwTmFtZTogc3RlcExhYmVsLCBzdGVwSW5kZXg6IGFic29sdXRlU3RlcEluZGV4LCBsb2NhbFN0ZXBJbmRleDogc3RlcEluZGV4IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sICcqJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwZW5kaW5nU2lnbmFsID0gY29uc3VtZVBlbmRpbmdGbG93U2lnbmFsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6IHBlbmRpbmdTaWduYWwgfTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBMZWFybmluZyBtb2RlIG92ZXJyaWRlOiBjb250aW51aW5nIGV2ZW4gdGhvdWdoIFwiJHt3YWl0VGFyZ2V0fVwiIGlzIHN0aWxsIHZpc2libGUgYWZ0ZXIgaW50ZXJydXB0aW9uIGhhbmRsaW5nLmApO1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M6IHsgcGhhc2U6ICdzdGVwRG9uZScsIHN0ZXBOYW1lOiBzdGVwTGFiZWwsIHN0ZXBJbmRleDogYWJzb2x1dGVTdGVwSW5kZXgsIGxvY2FsU3RlcEluZGV4OiBzdGVwSW5kZXggfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgJyonKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBlbmRpbmdTaWduYWwgPSBjb25zdW1lUGVuZGluZ0Zsb3dTaWduYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogcGVuZGluZ1NpZ25hbCB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc2VuZExvZygnZXJyb3InLCBgRXJyb3IgZXhlY3V0aW5nIHN0ZXAgJHthYnNvbHV0ZVN0ZXBJbmRleCArIDF9OiAke2Vycj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbn1cbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTdGVwc1dpdGhMb29wcyhzdGVwcywgcHJpbWFyeURhdGEsIGRldGFpbFNvdXJjZXMsIHJlbGF0aW9uc2hpcHMsIHNldHRpbmdzKSB7XG4gICAgLy8gQXBwbHkgc2tpcC9saW1pdCByb3dzIGZyb20gcnVuIG9wdGlvbnNcbiAgICBjb25zdCB7IHNraXBSb3dzID0gMCwgbGltaXRSb3dzID0gMCwgZHJ5UnVuID0gZmFsc2UsIGxlYXJuaW5nTW9kZSA9IGZhbHNlIH0gPSBleGVjdXRpb25Db250cm9sLnJ1bk9wdGlvbnM7XG4gICAgXG4gICAgY29uc3Qgb3JpZ2luYWxUb3RhbFJvd3MgPSBwcmltYXJ5RGF0YS5sZW5ndGg7XG4gICAgbGV0IHN0YXJ0Um93TnVtYmVyID0gMDsgLy8gVGhlIHN0YXJ0aW5nIHJvdyBudW1iZXIgZm9yIGRpc3BsYXlcbiAgICBcbiAgICBpZiAoc2tpcFJvd3MgPiAwKSB7XG4gICAgICAgIHByaW1hcnlEYXRhID0gcHJpbWFyeURhdGEuc2xpY2Uoc2tpcFJvd3MpO1xuICAgICAgICBzdGFydFJvd051bWJlciA9IHNraXBSb3dzO1xuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYFNraXBwZWQgZmlyc3QgJHtza2lwUm93c30gcm93c2ApO1xuICAgIH1cbiAgICBcbiAgICBpZiAobGltaXRSb3dzID4gMCAmJiBwcmltYXJ5RGF0YS5sZW5ndGggPiBsaW1pdFJvd3MpIHtcbiAgICAgICAgcHJpbWFyeURhdGEgPSBwcmltYXJ5RGF0YS5zbGljZSgwLCBsaW1pdFJvd3MpO1xuICAgICAgICBzZW5kTG9nKCdpbmZvJywgYExpbWl0ZWQgdG8gJHtsaW1pdFJvd3N9IHJvd3NgKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgdG90YWxSb3dzVG9Qcm9jZXNzID0gcHJpbWFyeURhdGEubGVuZ3RoO1xuICAgIGV4ZWN1dGlvbkNvbnRyb2wudG90YWxSb3dzID0gb3JpZ2luYWxUb3RhbFJvd3M7XG4gICAgXG4gICAgLy8gRmluZCBsb29wIHN0cnVjdHVyZXNcbiAgICBjb25zdCBsb29wUGFpcnMgPSBmaW5kTG9vcFBhaXJzKHN0ZXBzLCAobWVzc2FnZSkgPT4gc2VuZExvZygnZXJyb3InLCBtZXNzYWdlKSk7XG4gICAgY29uc3QgaWZQYWlycyA9IGZpbmRJZlBhaXJzKHN0ZXBzLCAobWVzc2FnZSkgPT4gc2VuZExvZygnZXJyb3InLCBtZXNzYWdlKSk7XG4gICAgY29uc3QgbGFiZWxNYXAgPSBuZXcgTWFwKCk7XG4gICAgc3RlcHMuZm9yRWFjaCgoc3RlcCwgaW5kZXgpID0+IHtcbiAgICAgICAgaWYgKHN0ZXA/LnR5cGUgPT09ICdsYWJlbCcgJiYgc3RlcC5sYWJlbE5hbWUpIHtcbiAgICAgICAgICAgIGxhYmVsTWFwLnNldChzdGVwLmxhYmVsTmFtZSwgaW5kZXgpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBJZiBubyBsb29wcywgZXhlY3V0ZSBhbGwgc3RlcHMgZm9yIGVhY2ggcHJpbWFyeSBkYXRhIHJvdyAobGVnYWN5IGJlaGF2aW9yKVxuICAgIGlmIChsb29wUGFpcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGZvciAobGV0IHJvd0luZGV4ID0gMDsgcm93SW5kZXggPCBwcmltYXJ5RGF0YS5sZW5ndGg7IHJvd0luZGV4KyspIHtcbiAgICAgICAgICAgIGF3YWl0IGNoZWNrRXhlY3V0aW9uQ29udHJvbCgpOyAvLyBDaGVjayBmb3IgcGF1c2Uvc3RvcFxuXG4gICAgICAgICAgICBjb25zdCByb3cgPSBwcmltYXJ5RGF0YVtyb3dJbmRleF07XG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5Um93TnVtYmVyID0gc3RhcnRSb3dOdW1iZXIgKyByb3dJbmRleDsgLy8gQWN0dWFsIHJvdyBudW1iZXIgaW4gb3JpZ2luYWwgZGF0YVxuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50Um93SW5kZXggPSBkaXNwbGF5Um93TnVtYmVyO1xuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50RGF0YVJvdyA9IHJvdztcblxuICAgICAgICAgICAgY29uc3Qgcm93UHJvZ3Jlc3MgPSB7XG4gICAgICAgICAgICAgICAgcGhhc2U6ICdyb3dTdGFydCcsXG4gICAgICAgICAgICAgICAgcm93OiBkaXNwbGF5Um93TnVtYmVyLFxuICAgICAgICAgICAgICAgIHRvdGFsUm93czogb3JpZ2luYWxUb3RhbFJvd3MsXG4gICAgICAgICAgICAgICAgcHJvY2Vzc2VkUm93czogcm93SW5kZXggKyAxLFxuICAgICAgICAgICAgICAgIHRvdGFsVG9Qcm9jZXNzOiB0b3RhbFJvd3NUb1Byb2Nlc3MsXG4gICAgICAgICAgICAgICAgc3RlcDogJ1Byb2Nlc3Npbmcgcm93J1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgUHJvY2Vzc2luZyByb3cgJHtkaXNwbGF5Um93TnVtYmVyICsgMX0vJHtvcmlnaW5hbFRvdGFsUm93c31gKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJywgcHJvZ3Jlc3M6IHJvd1Byb2dyZXNzIH0sICcqJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVSYW5nZSgwLCBzdGVwcy5sZW5ndGgsIHJvdyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdicmVhay1sb29wJyB8fCByZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnIHx8IHJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29wIGNvbnRyb2wgc2lnbmFsIHVzZWQgb3V0c2lkZSBvZiBhIGxvb3AnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbG9vcFBhaXJNYXAgPSBuZXcgTWFwKGxvb3BQYWlycy5tYXAocGFpciA9PiBbcGFpci5zdGFydEluZGV4LCBwYWlyLmVuZEluZGV4XSkpO1xuICAgIGNvbnN0IGluaXRpYWxEYXRhUm93ID0gcHJpbWFyeURhdGFbMF0gfHwge307XG5cbiAgICBjb25zdCByZXNvbHZlTG9vcERhdGEgPSAobG9vcERhdGFTb3VyY2UsIGN1cnJlbnREYXRhUm93KSA9PiB7XG4gICAgICAgIGxldCBsb29wRGF0YSA9IHByaW1hcnlEYXRhO1xuXG4gICAgICAgIGlmIChsb29wRGF0YVNvdXJjZSAhPT0gJ3ByaW1hcnknICYmIGRldGFpbFNvdXJjZXNbbG9vcERhdGFTb3VyY2VdKSB7XG4gICAgICAgICAgICBjb25zdCBkZXRhaWxTb3VyY2UgPSBkZXRhaWxTb3VyY2VzW2xvb3BEYXRhU291cmNlXTtcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uc0ZvckRldGFpbCA9IChyZWxhdGlvbnNoaXBzIHx8IFtdKS5maWx0ZXIociA9PiByLmRldGFpbElkID09PSBsb29wRGF0YVNvdXJjZSk7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aW9uc0ZvckRldGFpbC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBsb29wRGF0YSA9IGRldGFpbFNvdXJjZS5kYXRhO1xuICAgICAgICAgICAgICAgIHJldHVybiBsb29wRGF0YTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbG9vcFN0YWNrID0gQXJyYXkuaXNBcnJheShjdXJyZW50RGF0YVJvdz8uX19kMzY1X2xvb3Bfc3RhY2spXG4gICAgICAgICAgICAgICAgPyBjdXJyZW50RGF0YVJvdy5fX2QzNjVfbG9vcF9zdGFja1xuICAgICAgICAgICAgICAgIDogW107XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRMb29wU291cmNlSWQgPSBsb29wU3RhY2subGVuZ3RoID8gbG9vcFN0YWNrW2xvb3BTdGFjay5sZW5ndGggLSAxXSA6ICcnO1xuICAgICAgICAgICAgaWYgKCFwYXJlbnRMb29wU291cmNlSWQpIHtcbiAgICAgICAgICAgICAgICAvLyBUb3AtbGV2ZWwgbG9vcDogZG8gbm90IGFwcGx5IHJlbGF0aW9uc2hpcCBmaWx0ZXJpbmcuXG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9vcERhdGE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcmVudFNjb3BlZFJlbGF0aW9ucyA9IHJlbGF0aW9uc0ZvckRldGFpbC5maWx0ZXIocmVsID0+IChyZWwucGFyZW50U291cmNlSWQgfHwgJycpID09PSBwYXJlbnRMb29wU291cmNlSWQpO1xuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlUmVsYXRpb25zID0gcGFyZW50U2NvcGVkUmVsYXRpb25zLmxlbmd0aCA/IHBhcmVudFNjb3BlZFJlbGF0aW9ucyA6IHJlbGF0aW9uc0ZvckRldGFpbDtcblxuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZVBhcmVudFZhbHVlID0gKHJlbCwgcGFpcikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGxpY2l0S2V5ID0gcmVsPy5wYXJlbnRTb3VyY2VJZCA/IGAke3JlbC5wYXJlbnRTb3VyY2VJZH06JHtwYWlyLnByaW1hcnlGaWVsZH1gIDogJyc7XG4gICAgICAgICAgICAgICAgaWYgKGV4cGxpY2l0S2V5KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cGxpY2l0VmFsdWUgPSBjdXJyZW50RGF0YVJvdz8uW2V4cGxpY2l0S2V5XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4cGxpY2l0VmFsdWUgIT09IHVuZGVmaW5lZCAmJiBleHBsaWNpdFZhbHVlICE9PSBudWxsICYmIFN0cmluZyhleHBsaWNpdFZhbHVlKSAhPT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBleHBsaWNpdFZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZhbGxiYWNrVmFsdWUgPSBjdXJyZW50RGF0YVJvdz8uW3BhaXIucHJpbWFyeUZpZWxkXTtcbiAgICAgICAgICAgICAgICBpZiAoZmFsbGJhY2tWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIGZhbGxiYWNrVmFsdWUgIT09IG51bGwgJiYgU3RyaW5nKGZhbGxiYWNrVmFsdWUpICE9PSAnJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsbGJhY2tWYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkUmVsYXRpb24gPSBjYW5kaWRhdGVSZWxhdGlvbnMuZmluZCgocmVsKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmllbGRNYXBwaW5ncyA9IEFycmF5LmlzQXJyYXkocmVsPy5maWVsZE1hcHBpbmdzKSAmJiByZWwuZmllbGRNYXBwaW5ncy5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgPyByZWwuZmllbGRNYXBwaW5nc1xuICAgICAgICAgICAgICAgICAgICA6IChyZWw/LnByaW1hcnlGaWVsZCAmJiByZWw/LmRldGFpbEZpZWxkXG4gICAgICAgICAgICAgICAgICAgICAgICA/IFt7IHByaW1hcnlGaWVsZDogcmVsLnByaW1hcnlGaWVsZCwgZGV0YWlsRmllbGQ6IHJlbC5kZXRhaWxGaWVsZCB9XVxuICAgICAgICAgICAgICAgICAgICA6IFtdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZpZWxkTWFwcGluZ3MubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkTWFwcGluZ3MuZXZlcnkoKHBhaXIpID0+IHJlc29sdmVQYXJlbnRWYWx1ZShyZWwsIHBhaXIpICE9PSB1bmRlZmluZWQpO1xuICAgICAgICAgICAgfSkgfHwgbnVsbDtcblxuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZFJlbGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgc2VuZExvZygnd2FybmluZycsIGBSZWxhdGlvbnNoaXAgZmlsdGVyIGZvciAke2xvb3BEYXRhU291cmNlfSBjb3VsZCBub3QgcmVzb2x2ZSBwYXJlbnQgdmFsdWVzLiBMb29wIHdpbGwgcHJvY2VzcyAwIHJvd3MuYCk7XG4gICAgICAgICAgICAgICAgbG9vcERhdGEgPSBbXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9vcERhdGE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkTWFwcGluZ3MgPSBBcnJheS5pc0FycmF5KHNlbGVjdGVkUmVsYXRpb24uZmllbGRNYXBwaW5ncykgJiYgc2VsZWN0ZWRSZWxhdGlvbi5maWVsZE1hcHBpbmdzLmxlbmd0aFxuICAgICAgICAgICAgICAgID8gc2VsZWN0ZWRSZWxhdGlvbi5maWVsZE1hcHBpbmdzXG4gICAgICAgICAgICAgICAgOiBbeyBwcmltYXJ5RmllbGQ6IHNlbGVjdGVkUmVsYXRpb24ucHJpbWFyeUZpZWxkLCBkZXRhaWxGaWVsZDogc2VsZWN0ZWRSZWxhdGlvbi5kZXRhaWxGaWVsZCB9XTtcblxuICAgICAgICAgICAgbG9vcERhdGEgPSBkZXRhaWxTb3VyY2UuZGF0YS5maWx0ZXIoKGRldGFpbFJvdykgPT4gc2VsZWN0ZWRNYXBwaW5ncy5ldmVyeSgocGFpcikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudFZhbHVlID0gcmVzb2x2ZVBhcmVudFZhbHVlKHNlbGVjdGVkUmVsYXRpb24sIHBhaXIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkVmFsdWUgPSBkZXRhaWxSb3c/LltwYWlyLmRldGFpbEZpZWxkXTtcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50VmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChjaGlsZFZhbHVlID09PSB1bmRlZmluZWQgfHwgY2hpbGRWYWx1ZSA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybiBTdHJpbmcoY2hpbGRWYWx1ZSkgPT09IFN0cmluZyhwYXJlbnRWYWx1ZSk7XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbG9vcERhdGE7XG4gICAgfTtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTdGVwV2l0aEhhbmRsaW5nKHN0ZXAsIHN0ZXBJbmRleCwgY3VycmVudERhdGFSb3cpIHtcbiAgICAgICAgY29uc3QgeyBtb2RlLCByZXRyeUNvdW50LCByZXRyeURlbGF5LCBnb3RvTGFiZWwgfSA9IGdldFN0ZXBFcnJvckNvbmZpZyhzdGVwLCBzZXR0aW5ncyk7XG4gICAgICAgIGxldCBhdHRlbXB0ID0gMDtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdGVwUmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVNpbmdsZVN0ZXAoc3RlcCwgc3RlcEluZGV4LCBjdXJyZW50RGF0YVJvdywgZGV0YWlsU291cmNlcywgc2V0dGluZ3MsIGRyeVJ1biwgbGVhcm5pbmdNb2RlKTtcbiAgICAgICAgICAgICAgICBpZiAoc3RlcFJlc3VsdD8uc2lnbmFsICYmIHN0ZXBSZXN1bHQuc2lnbmFsICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3VtZVBlbmRpbmdGbG93U2lnbmFsKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogc3RlcFJlc3VsdC5zaWduYWwgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcGVuZGluZ1NpZ25hbCA9IGNvbnN1bWVQZW5kaW5nRmxvd1NpZ25hbCgpO1xuICAgICAgICAgICAgICAgIGlmIChwZW5kaW5nU2lnbmFsICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiBwZW5kaW5nU2lnbmFsIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ25vbmUnIH07XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICYmIGVyci5pc05hdmlnYXRpb25JbnRlcnJ1cHQpIHRocm93IGVycjtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICYmIChlcnIuaXNVc2VyU3RvcCB8fCBlcnIubm9SZXRyeSkpIHRocm93IGVycjtcblxuICAgICAgICAgICAgICAgIGlmIChyZXRyeUNvdW50ID4gMCAmJiBhdHRlbXB0IDwgcmV0cnlDb3VudCkge1xuICAgICAgICAgICAgICAgICAgICBhdHRlbXB0ICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgUmV0cnlpbmcgc3RlcCAke3N0ZXBJbmRleCArIDF9ICgke2F0dGVtcHR9LyR7cmV0cnlDb3VudH0pIGFmdGVyIGVycm9yOiAke2Vycj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJldHJ5RGVsYXkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBzbGVlcChyZXRyeURlbGF5KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzd2l0Y2ggKG1vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnc2tpcCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdza2lwJyB9O1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdnb3RvJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ2dvdG8nLCBsYWJlbDogZ290b0xhYmVsIH07XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2JyZWFrLWxvb3AnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnYnJlYWstbG9vcCcgfTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnY29udGludWUtbG9vcCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdjb250aW51ZS1sb29wJyB9O1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdyZXBlYXQtbG9vcCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdyZXBlYXQtbG9vcCcgfTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnZmFpbCc6XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVJhbmdlKHN0YXJ0SWR4LCBlbmRJZHgsIGN1cnJlbnREYXRhUm93KSB7XG4gICAgICAgIGlmIChjdXJyZW50RGF0YVJvdykge1xuICAgICAgICAgICAgZXhlY3V0aW9uQ29udHJvbC5jdXJyZW50RGF0YVJvdyA9IGN1cnJlbnREYXRhUm93O1xuICAgICAgICB9XG4gICAgICAgIGxldCBpZHggPSBzdGFydElkeDtcblxuICAgICAgICB3aGlsZSAoaWR4IDwgZW5kSWR4KSB7XG4gICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTsgLy8gQ2hlY2sgZm9yIHBhdXNlL3N0b3BcblxuICAgICAgICAgICAgY29uc3Qgc3RlcCA9IHN0ZXBzW2lkeF07XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdsYWJlbCcpIHtcbiAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2dvdG8nKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0SW5kZXggPSBsYWJlbE1hcC5nZXQoc3RlcC5nb3RvTGFiZWwpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgR290byBsYWJlbCBub3QgZm91bmQ6ICR7c3RlcC5nb3RvTGFiZWwgfHwgJyd9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRJbmRleCA8IHN0YXJ0SWR4IHx8IHRhcmdldEluZGV4ID49IGVuZElkeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdnb3RvJywgdGFyZ2V0SW5kZXggfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWR4ID0gdGFyZ2V0SW5kZXg7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdpZi1zdGFydCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb25kaXRpb25NZXQgPSBldmFsdWF0ZUNvbmRpdGlvbihzdGVwLCBjdXJyZW50RGF0YVJvdywge1xuICAgICAgICAgICAgICAgICAgICBmaW5kRWxlbWVudEluQWN0aXZlQ29udGV4dCxcbiAgICAgICAgICAgICAgICAgICAgaXNFbGVtZW50VmlzaWJsZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZEluZGV4ID0gaWZQYWlycy5pZlRvRW5kLmdldChpZHgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsc2VJbmRleCA9IGlmUGFpcnMuaWZUb0Vsc2UuZ2V0KGlkeCk7XG4gICAgICAgICAgICAgICAgaWYgKGVuZEluZGV4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJZi1zdGFydCBhdCBpbmRleCAke2lkeH0gaGFzIG5vIG1hdGNoaW5nIGlmLWVuZGApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChjb25kaXRpb25NZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChlbHNlSW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBpZHggPSBlbHNlSW5kZXggKyAxO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGVuZEluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGVwLnR5cGUgPT09ICdlbHNlJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZEluZGV4ID0gaWZQYWlycy5lbHNlVG9FbmQuZ2V0KGlkeCk7XG4gICAgICAgICAgICAgICAgaWYgKGVuZEluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZW5kSW5kZXggKyAxO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2lmLWVuZCcpIHtcbiAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ2NvbnRpbnVlLWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnY29udGludWUtbG9vcCcgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0ZXAudHlwZSA9PT0gJ3JlcGVhdC1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHNpZ25hbDogJ3JlcGVhdC1sb29wJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnYnJlYWstbG9vcCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzaWduYWw6ICdicmVhay1sb29wJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnbG9vcC1zdGFydCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsb29wRW5kSWR4ID0gbG9vcFBhaXJNYXAuZ2V0KGlkeCk7XG4gICAgICAgICAgICAgICAgaWYgKGxvb3BFbmRJZHggPT09IHVuZGVmaW5lZCB8fCBsb29wRW5kSWR4IDw9IGlkeCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExvb3Agc3RhcnQgYXQgaW5kZXggJHtpZHh9IGhhcyBubyBtYXRjaGluZyBlbmRgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBsb29wTW9kZSA9IHN0ZXAubG9vcE1vZGUgfHwgJ2RhdGEnO1xuXG4gICAgICAgICAgICAgICAgaWYgKGxvb3BNb2RlID09PSAnY291bnQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BDb3VudCA9IE51bWJlcihzdGVwLmxvb3BDb3VudCkgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBFbnRlcmluZyBsb29wOiAke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfSAoY291bnQ9JHtsb29wQ291bnR9KWApO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpdGVySW5kZXggPSAwOyBpdGVySW5kZXggPCBsb29wQ291bnQ7IGl0ZXJJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBjaGVja0V4ZWN1dGlvbkNvbnRyb2woKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0QzNjVfV09SS0ZMT1dfUFJPR1JFU1MnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2dyZXNzOiB7IHBoYXNlOiAnbG9vcEl0ZXJhdGlvbicsIGl0ZXJhdGlvbjogaXRlckluZGV4ICsgMSwgdG90YWw6IGxvb3BDb3VudCwgc3RlcDogYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiOiBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke2xvb3BDb3VudH1gIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sICcqJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVSYW5nZShpZHggKyAxLCBsb29wRW5kSWR4LCBjdXJyZW50RGF0YVJvdyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdicmVhay1sb29wJykgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJykgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdyZXBlYXQtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVySW5kZXggPSBNYXRoLm1heCgtMSwgaXRlckluZGV4IC0gMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdnb3RvJykgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGxvb3BFbmRJZHggKyAxO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAobG9vcE1vZGUgPT09ICd3aGlsZScpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF4SXRlcmF0aW9ucyA9IE51bWJlcihzdGVwLmxvb3BNYXhJdGVyYXRpb25zKSB8fCAxMDA7XG4gICAgICAgICAgICAgICAgICAgIGxldCBpdGVySW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSAoaXRlckluZGV4IDwgbWF4SXRlcmF0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWV2YWx1YXRlQ29uZGl0aW9uKHN0ZXAsIGN1cnJlbnREYXRhUm93LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluZEVsZW1lbnRJbkFjdGl2ZUNvbnRleHQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNFbGVtZW50VmlzaWJsZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSkpIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdEMzY1X1dPUktGTE9XX1BST0dSRVNTJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9ncmVzczogeyBwaGFzZTogJ2xvb3BJdGVyYXRpb24nLCBpdGVyYXRpb246IGl0ZXJJbmRleCArIDEsIHRvdGFsOiBtYXhJdGVyYXRpb25zLCBzdGVwOiBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCI6IGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bWF4SXRlcmF0aW9uc31gIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sICcqJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVSYW5nZShpZHggKyAxLCBsb29wRW5kSWR4LCBjdXJyZW50RGF0YVJvdyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdicmVhay1sb29wJykgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJJbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAncmVwZWF0LWxvb3AnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdnb3RvJykgcmV0dXJuIHJlc3VsdDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlckluZGV4Kys7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXRlckluZGV4ID49IG1heEl0ZXJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRMb2coJ3dhcm5pbmcnLCBgTG9vcCBcIiR7c3RlcC5sb29wTmFtZSB8fCAnTG9vcCd9XCIgaGl0IG1heCBpdGVyYXRpb25zICgke21heEl0ZXJhdGlvbnN9KWApO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gbG9vcEVuZElkeCArIDE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGxvb3BEYXRhU291cmNlID0gc3RlcC5sb29wRGF0YVNvdXJjZSB8fCAncHJpbWFyeSc7XG4gICAgICAgICAgICAgICAgbGV0IGxvb3BEYXRhID0gcmVzb2x2ZUxvb3BEYXRhKGxvb3BEYXRhU291cmNlLCBjdXJyZW50RGF0YVJvdyk7XG5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBpdGVyYXRpb24gbGltaXRcbiAgICAgICAgICAgICAgICBjb25zdCBpdGVyYXRpb25MaW1pdCA9IHN0ZXAuaXRlcmF0aW9uTGltaXQgfHwgMDtcbiAgICAgICAgICAgICAgICBpZiAoaXRlcmF0aW9uTGltaXQgPiAwICYmIGxvb3BEYXRhLmxlbmd0aCA+IGl0ZXJhdGlvbkxpbWl0KSB7XG4gICAgICAgICAgICAgICAgICAgIGxvb3BEYXRhID0gbG9vcERhdGEuc2xpY2UoMCwgaXRlcmF0aW9uTGltaXQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHNlbmRMb2coJ2luZm8nLCBgRW50ZXJpbmcgbG9vcDogJHtzdGVwLmxvb3BOYW1lIHx8ICdMb29wJ30gKHNvdXJjZT0ke2xvb3BEYXRhU291cmNlfSkgLSAke2xvb3BEYXRhLmxlbmd0aH0gaXRlcmF0aW9uc2ApO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGl0ZXJJbmRleCA9IDA7IGl0ZXJJbmRleCA8IGxvb3BEYXRhLmxlbmd0aDsgaXRlckluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgY2hlY2tFeGVjdXRpb25Db250cm9sKCk7IC8vIENoZWNrIGZvciBwYXVzZS9zdG9wXG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXRlclNvdXJjZVJvdyA9IGxvb3BEYXRhW2l0ZXJJbmRleF0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZXJSb3cgPSB7IC4uLmN1cnJlbnREYXRhUm93LCAuLi5pdGVyU291cmNlUm93IH07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudFN0YWNrID0gQXJyYXkuaXNBcnJheShjdXJyZW50RGF0YVJvdz8uX19kMzY1X2xvb3Bfc3RhY2spXG4gICAgICAgICAgICAgICAgICAgICAgICA/IGN1cnJlbnREYXRhUm93Ll9fZDM2NV9sb29wX3N0YWNrXG4gICAgICAgICAgICAgICAgICAgICAgICA6IFtdO1xuICAgICAgICAgICAgICAgICAgICBpdGVyUm93Ll9fZDM2NV9sb29wX3N0YWNrID0gWy4uLnBhcmVudFN0YWNrLCBsb29wRGF0YVNvdXJjZV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChsb29wRGF0YVNvdXJjZSAhPT0gJ3ByaW1hcnknKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBPYmplY3QuZW50cmllcyhpdGVyU291cmNlUm93KS5mb3JFYWNoKChbZmllbGQsIHZhbHVlXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJSb3dbYCR7bG9vcERhdGFTb3VyY2V9OiR7ZmllbGR9YF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzUHJpbWFyeUxvb3AgPSBsb29wRGF0YVNvdXJjZSA9PT0gJ3ByaW1hcnknO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b3RhbFJvd3NGb3JMb29wID0gaXNQcmltYXJ5TG9vcCA/IG9yaWdpbmFsVG90YWxSb3dzIDogbG9vcERhdGEubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b3RhbFRvUHJvY2Vzc0Zvckxvb3AgPSBsb29wRGF0YS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlSb3dOdW1iZXIgPSBpc1ByaW1hcnlMb29wID8gc3RhcnRSb3dOdW1iZXIgKyBpdGVySW5kZXggOiBpdGVySW5kZXg7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9vcFJvd1Byb2dyZXNzID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGhhc2U6ICdyb3dTdGFydCcsXG4gICAgICAgICAgICAgICAgICAgICAgICByb3c6IGRpc3BsYXlSb3dOdW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICB0b3RhbFJvd3M6IHRvdGFsUm93c0Zvckxvb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRSb3dzOiBpdGVySW5kZXggKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxUb1Byb2Nlc3M6IHRvdGFsVG9Qcm9jZXNzRm9yTG9vcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0ZXA6ICdQcm9jZXNzaW5nIHJvdydcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZExvZygnaW5mbycsIGBMb29wIGl0ZXJhdGlvbiAke2l0ZXJJbmRleCArIDF9LyR7bG9vcERhdGEubGVuZ3RofSBmb3IgbG9vcCAke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfWApO1xuICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiBsb29wUm93UHJvZ3Jlc3MgfSwgJyonKTtcblxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoeyB0eXBlOiAnRDM2NV9XT1JLRkxPV19QUk9HUkVTUycsIHByb2dyZXNzOiB7IHBoYXNlOiAnbG9vcEl0ZXJhdGlvbicsIGl0ZXJhdGlvbjogaXRlckluZGV4ICsgMSwgdG90YWw6IGxvb3BEYXRhLmxlbmd0aCwgc3RlcDogYExvb3AgXCIke3N0ZXAubG9vcE5hbWUgfHwgJ0xvb3AnfVwiOiBpdGVyYXRpb24gJHtpdGVySW5kZXggKyAxfS8ke2xvb3BEYXRhLmxlbmd0aH1gIH0gfSwgJyonKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBFeGVjdXRlIHN0ZXBzIGluc2lkZSB0aGUgbG9vcCAoc3VwcG9ydHMgbmVzdGVkIGxvb3BzKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlUmFuZ2UoaWR4ICsgMSwgbG9vcEVuZElkeCwgaXRlclJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2JyZWFrLWxvb3AnKSBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnY29udGludWUtbG9vcCcpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Py5zaWduYWwgPT09ICdyZXBlYXQtbG9vcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJJbmRleCA9IE1hdGgubWF4KC0xLCBpdGVySW5kZXggLSAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQ/LnNpZ25hbCA9PT0gJ2dvdG8nKSByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlkeCA9IGxvb3BFbmRJZHggKyAxO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RlcC50eXBlID09PSAnbG9vcC1lbmQnKSB7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVTdGVwV2l0aEhhbmRsaW5nKHN0ZXAsIGlkeCwgY3VycmVudERhdGFSb3cpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnc2tpcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdub25lJykge1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnZ290bycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRJbmRleCA9IGxhYmVsTWFwLmdldChyZXN1bHQubGFiZWwpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgR290byBsYWJlbCBub3QgZm91bmQ6ICR7cmVzdWx0LmxhYmVsIHx8ICcnfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0SW5kZXggPCBzdGFydElkeCB8fCB0YXJnZXRJbmRleCA+PSBlbmRJZHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc2lnbmFsOiAnZ290bycsIHRhcmdldEluZGV4IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlkeCA9IHRhcmdldEluZGV4O1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcgfHwgcmVzdWx0Py5zaWduYWwgPT09ICdjb250aW51ZS1sb29wJyB8fCByZXN1bHQ/LnNpZ25hbCA9PT0gJ3JlcGVhdC1sb29wJykge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZHgrKztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzaWduYWw6ICdub25lJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IGZpbmFsUmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVJhbmdlKDAsIHN0ZXBzLmxlbmd0aCwgaW5pdGlhbERhdGFSb3cpO1xuICAgIGlmIChmaW5hbFJlc3VsdD8uc2lnbmFsID09PSAnYnJlYWstbG9vcCcgfHwgZmluYWxSZXN1bHQ/LnNpZ25hbCA9PT0gJ2NvbnRpbnVlLWxvb3AnIHx8IGZpbmFsUmVzdWx0Py5zaWduYWwgPT09ICdyZXBlYXQtbG9vcCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMb29wIGNvbnRyb2wgc2lnbmFsIHVzZWQgb3V0c2lkZSBvZiBhIGxvb3AnKTtcbiAgICB9XG59XG5cbi8vID09PT09PSBBZG1pbiBJbnNwZWN0aW9uIEZ1bmN0aW9ucyA9PT09PT1cbmZ1bmN0aW9uIHJ1bkFkbWluSW5zcGVjdGlvbihpbnNwZWN0b3IsIGluc3BlY3Rpb25UeXBlLCBmb3JtTmFtZVBhcmFtLCBkb2N1bWVudCwgd2luZG93KSB7XG4gICAgc3dpdGNoIChpbnNwZWN0aW9uVHlwZSkge1xuICAgICAgICBjYXNlICdzY2FuUGFnZSc6XG4gICAgICAgICAgICByZXR1cm4gYWRtaW5EaXNjb3ZlckV2ZXJ5dGhpbmcoZG9jdW1lbnQsIHdpbmRvdyk7XG4gICAgICAgIGNhc2UgJ29wZW5Gb3Jtcyc6XG4gICAgICAgICAgICByZXR1cm4gYWRtaW5EaXNjb3Zlck9wZW5Gb3Jtcyhkb2N1bWVudCwgd2luZG93KTtcbiAgICAgICAgY2FzZSAnYmF0Y2hEaWFsb2cnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJCYXRjaERpYWxvZyhkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ3JlY3VycmVuY2VEaWFsb2cnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJSZWN1cnJlbmNlRGlhbG9nKGRvY3VtZW50KTtcbiAgICAgICAgY2FzZSAnZmlsdGVyRGlhbG9nJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyRmlsdGVyRGlhbG9nKGRvY3VtZW50KTtcbiAgICAgICAgY2FzZSAnZm9ybVRhYnMnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJUYWJzKGRvY3VtZW50KTtcbiAgICAgICAgY2FzZSAnYWN0aXZlVGFiJzpcbiAgICAgICAgICAgIHJldHVybiBhZG1pbkRpc2NvdmVyQWN0aXZlVGFiKGRvY3VtZW50KTtcbiAgICAgICAgY2FzZSAnYWN0aW9uUGFuZVRhYnMnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJBY3Rpb25QYW5lVGFicyhkb2N1bWVudCk7XG4gICAgICAgIGNhc2UgJ2Zvcm1JbnB1dHMnOlxuICAgICAgICAgICAgcmV0dXJuIGFkbWluRGlzY292ZXJGb3JtSW5wdXRzKGRvY3VtZW50LCBmb3JtTmFtZVBhcmFtKTtcbiAgICAgICAgY2FzZSAnZ2VuZXJhdGVTdGVwcyc6XG4gICAgICAgICAgICByZXR1cm4gYWRtaW5HZW5lcmF0ZVN0ZXBzRm9yVGFiKGRvY3VtZW50KTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBpbnNwZWN0aW9uIHR5cGU6ICcgKyBpbnNwZWN0aW9uVHlwZSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRNYWluRm9ybShkb2N1bWVudCkge1xuICAgIGNvbnN0IGZvcm1zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWZvcm0tbmFtZV0nKTtcbiAgICBsZXQgbWFpbkZvcm0gPSBudWxsO1xuICAgIGZvcm1zLmZvckVhY2goZiA9PiB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBmLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XG4gICAgICAgIGlmIChuYW1lICE9PSAnRGVmYXVsdERhc2hib2FyZCcgJiYgZi5vZmZzZXRQYXJlbnQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIG1haW5Gb3JtID0gZjtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBtYWluRm9ybTtcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3Zlck9wZW5Gb3Jtcyhkb2N1bWVudCwgd2luZG93KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IHtcbiAgICAgICAgY3VycmVudFVybDoge1xuICAgICAgICAgICAgZnVsbDogd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICAgICAgICBtZW51SXRlbTogbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoJ21pJyksXG4gICAgICAgICAgICBjb21wYW55OiBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldCgnY21wJylcbiAgICAgICAgfSxcbiAgICAgICAgZm9ybXM6IFtdLFxuICAgICAgICBkaWFsb2dTdGFjazogW11cbiAgICB9O1xuXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWZvcm0tbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xuICAgICAgICBjb25zdCBpc0RpYWxvZyA9IGVsLmNsb3Nlc3QoJy5kaWFsb2ctY29udGFpbmVyJykgIT09IG51bGwgfHxcbiAgICAgICAgICAgIGZvcm1OYW1lLmluY2x1ZGVzKCdEaWFsb2cnKSB8fCBmb3JtTmFtZS5pbmNsdWRlcygnRm9ybScpIHx8XG4gICAgICAgICAgICBmb3JtTmFtZSA9PT0gJ1N5c1JlY3VycmVuY2UnIHx8IGZvcm1OYW1lID09PSAnU3lzUXVlcnlGb3JtJztcbiAgICAgICAgY29uc3QgaXNWaXNpYmxlID0gZWwub2Zmc2V0UGFyZW50ICE9PSBudWxsO1xuXG4gICAgICAgIHJlc3VsdHMuZm9ybXMucHVzaCh7IGZvcm1OYW1lLCBpc0RpYWxvZywgaXNWaXNpYmxlIH0pO1xuICAgICAgICBpZiAoaXNEaWFsb2cgJiYgaXNWaXNpYmxlKSB7XG4gICAgICAgICAgICByZXN1bHRzLmRpYWxvZ1N0YWNrLnB1c2goZm9ybU5hbWUpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmVzdWx0cy5kaWFsb2dTdGFjay5yZXZlcnNlKCk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJCYXRjaERpYWxvZyhkb2N1bWVudCkge1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7XG4gICAgICAgIGRpYWxvZ0ZvdW5kOiBmYWxzZSwgZm9ybU5hbWU6IG51bGwsXG4gICAgICAgIGFsbENvbnRyb2xzOiBbXSwgaW5wdXRGaWVsZHM6IFtdLCBjaGVja2JveGVzOiBbXSwgY29tYm9ib3hlczogW10sIGJ1dHRvbnM6IFtdLCBncm91cHM6IFtdLCB0b2dnbGVzOiBbXVxuICAgIH07XG5cbiAgICBjb25zdCBkaWFsb2dGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c09wZXJhdGlvblRlbXBsYXRlRm9ybVwiXScpIHx8XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWR5bi1mb3JtLW5hbWUqPVwiRGlhbG9nXCJdJykgfHxcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmRpYWxvZy1jb250ZW50IFtkYXRhLWR5bi1mb3JtLW5hbWVdJyk7XG5cbiAgICBpZiAoIWRpYWxvZ0Zvcm0pIHJldHVybiByZXN1bHRzO1xuXG4gICAgcmVzdWx0cy5kaWFsb2dGb3VuZCA9IHRydWU7XG4gICAgcmVzdWx0cy5mb3JtTmFtZSA9IGRpYWxvZ0Zvcm0uZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcblxuICAgIGRpYWxvZ0Zvcm0ucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBjb25zdCBpbmZvID0ge1xuICAgICAgICAgICAgY29udHJvbE5hbWU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSxcbiAgICAgICAgICAgIHJvbGU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpLFxuICAgICAgICAgICAgY29udHJvbFR5cGU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbHR5cGUnKSxcbiAgICAgICAgICAgIGxhYmVsOiBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpIHx8IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGVsLmdldEF0dHJpYnV0ZSgndGl0bGUnKVxuICAgICAgICB9O1xuICAgICAgICByZXN1bHRzLmFsbENvbnRyb2xzLnB1c2goaW5mbyk7XG4gICAgICAgIGNvbnN0IHJvbGUgPSAoaW5mby5yb2xlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAocm9sZS5pbmNsdWRlcygnaW5wdXQnKSB8fCByb2xlID09PSAnc3RyaW5nJyB8fCByb2xlID09PSAnaW50ZWdlcicgfHwgcm9sZSA9PT0gJ3JlYWwnKSByZXN1bHRzLmlucHV0RmllbGRzLnB1c2goaW5mbyk7XG4gICAgICAgIGVsc2UgaWYgKHJvbGUuaW5jbHVkZXMoJ2NoZWNrYm94JykgfHwgcm9sZSA9PT0gJ3llc25vJykgcmVzdWx0cy5jaGVja2JveGVzLnB1c2goaW5mbyk7XG4gICAgICAgIGVsc2UgaWYgKHJvbGUuaW5jbHVkZXMoJ2NvbWJvYm94JykgfHwgcm9sZSA9PT0gJ2Ryb3Bkb3duJykgcmVzdWx0cy5jb21ib2JveGVzLnB1c2goaW5mbyk7XG4gICAgICAgIGVsc2UgaWYgKHJvbGUuaW5jbHVkZXMoJ2J1dHRvbicpKSByZXN1bHRzLmJ1dHRvbnMucHVzaChpbmZvKTtcbiAgICAgICAgZWxzZSBpZiAocm9sZSA9PT0gJ2dyb3VwJykgcmVzdWx0cy5ncm91cHMucHVzaChpbmZvKTtcbiAgICB9KTtcblxuICAgIGRpYWxvZ0Zvcm0ucXVlcnlTZWxlY3RvckFsbCgnLnRvZ2dsZSwgW3JvbGU9XCJzd2l0Y2hcIl0sIGlucHV0W3R5cGU9XCJjaGVja2JveFwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBjb25zdCBjb250YWluZXIgPSBlbC5jbG9zZXN0KCdbZGF0YS1keW4tY29udHJvbG5hbWVdJyk7XG4gICAgICAgIGlmIChjb250YWluZXIpIHtcbiAgICAgICAgICAgIHJlc3VsdHMudG9nZ2xlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSxcbiAgICAgICAgICAgICAgICByb2xlOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyksXG4gICAgICAgICAgICAgICAgbGFiZWw6IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpLFxuICAgICAgICAgICAgICAgIGlzQ2hlY2tlZDogZWwuY2hlY2tlZCB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAndHJ1ZSdcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJSZWN1cnJlbmNlRGlhbG9nKGRvY3VtZW50KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IHtcbiAgICAgICAgZGlhbG9nRm91bmQ6IGZhbHNlLCBmb3JtTmFtZTogJ1N5c1JlY3VycmVuY2UnLFxuICAgICAgICBzdGFydERhdGVUaW1lOiB7fSwgZW5kT3B0aW9uczoge30sIHBhdHRlcm46IHt9LCBidXR0b25zOiBbXSwgYWxsQ29udHJvbHM6IFtdXG4gICAgfTtcbiAgICBjb25zdCBmb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZT1cIlN5c1JlY3VycmVuY2VcIl0nKTtcbiAgICBpZiAoIWZvcm0pIHJldHVybiByZXN1bHRzO1xuICAgIHJlc3VsdHMuZGlhbG9nRm91bmQgPSB0cnVlO1xuXG4gICAgZm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICBjb25zdCByb2xlID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1yb2xlJyk7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcbiAgICAgICAgY29uc3QgaW5mbyA9IHsgY29udHJvbE5hbWUsIHJvbGUsIGxhYmVsIH07XG4gICAgICAgIHJlc3VsdHMuYWxsQ29udHJvbHMucHVzaChpbmZvKTtcblxuICAgICAgICBjb25zdCBuYW1lTG93ZXIgPSAoY29udHJvbE5hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChuYW1lTG93ZXIgPT09ICdzdGFydGRhdGUnKSByZXN1bHRzLnN0YXJ0RGF0ZVRpbWUuc3RhcnREYXRlID0gaW5mbztcbiAgICAgICAgZWxzZSBpZiAobmFtZUxvd2VyID09PSAnc3RhcnR0aW1lJykgcmVzdWx0cy5zdGFydERhdGVUaW1lLnN0YXJ0VGltZSA9IGluZm87XG4gICAgICAgIGVsc2UgaWYgKG5hbWVMb3dlciA9PT0gJ3RpbWV6b25lJykgcmVzdWx0cy5zdGFydERhdGVUaW1lLnRpbWV6b25lID0gaW5mbztcbiAgICAgICAgZWxzZSBpZiAobmFtZUxvd2VyID09PSAnZW5kZGF0ZWludCcpIHJlc3VsdHMuZW5kT3B0aW9ucy5jb3VudCA9IGluZm87XG4gICAgICAgIGVsc2UgaWYgKG5hbWVMb3dlciA9PT0gJ2VuZGRhdGVkYXRlJykgcmVzdWx0cy5lbmRPcHRpb25zLmVuZERhdGUgPSBpbmZvO1xuICAgICAgICBlbHNlIGlmIChuYW1lTG93ZXIgPT09ICdwYXR0ZXJudW5pdCcpIHJlc3VsdHMucGF0dGVybi51bml0ID0gaW5mbztcbiAgICAgICAgZWxzZSBpZiAocm9sZSA9PT0gJ0NvbW1hbmRCdXR0b24nKSByZXN1bHRzLmJ1dHRvbnMucHVzaChpbmZvKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3ZlckZpbHRlckRpYWxvZyhkb2N1bWVudCkge1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7XG4gICAgICAgIGRpYWxvZ0ZvdW5kOiBmYWxzZSwgZm9ybU5hbWU6ICdTeXNRdWVyeUZvcm0nLFxuICAgICAgICB0YWJzOiBbXSwgZ3JpZEluZm86IHt9LCBzYXZlZFF1ZXJpZXM6IG51bGwsIGJ1dHRvbnM6IFtdLCBjaGVja2JveGVzOiBbXSwgYWxsQ29udHJvbHM6IFtdXG4gICAgfTtcbiAgICBjb25zdCBxdWVyeUZvcm0gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJyk7XG4gICAgaWYgKCFxdWVyeUZvcm0pIHJldHVybiByZXN1bHRzO1xuICAgIHJlc3VsdHMuZGlhbG9nRm91bmQgPSB0cnVlO1xuXG4gICAgcXVlcnlGb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiUGl2b3RJdGVtXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIHJlc3VsdHMudGFicy5wdXNoKHtcbiAgICAgICAgICAgIGNvbnRyb2xOYW1lOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyksXG4gICAgICAgICAgICBsYWJlbDogZWwudGV4dENvbnRlbnQ/LnRyaW0oKS5zcGxpdCgnXFxuJylbMF0sXG4gICAgICAgICAgICBpc1Zpc2libGU6IGVsLm9mZnNldFBhcmVudCAhPT0gbnVsbFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyaWQgPSBxdWVyeUZvcm0ucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiUmFuZ2VHcmlkXCJdJyk7XG4gICAgaWYgKGdyaWQpIHtcbiAgICAgICAgcmVzdWx0cy5ncmlkSW5mbyA9IHsgY29udHJvbE5hbWU6ICdSYW5nZUdyaWQnLCByb2xlOiBncmlkLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpIH07XG4gICAgfVxuXG4gICAgcXVlcnlGb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgIGNvbnN0IHJvbGUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgICAgICBjb25zdCBpbmZvID0geyBjb250cm9sTmFtZSwgcm9sZSwgbGFiZWwgfTtcbiAgICAgICAgcmVzdWx0cy5hbGxDb250cm9scy5wdXNoKGluZm8pO1xuICAgICAgICBpZiAoY29udHJvbE5hbWUgPT09ICdTYXZlZFF1ZXJpZXNCb3gnKSByZXN1bHRzLnNhdmVkUXVlcmllcyA9IGluZm87XG4gICAgICAgIGVsc2UgaWYgKHJvbGUgPT09ICdDb21tYW5kQnV0dG9uJyB8fCByb2xlID09PSAnQnV0dG9uJykgcmVzdWx0cy5idXR0b25zLnB1c2goaW5mbyk7XG4gICAgICAgIGVsc2UgaWYgKHJvbGUgPT09ICdDaGVja0JveCcpIHJlc3VsdHMuY2hlY2tib3hlcy5wdXNoKGluZm8pO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBhZG1pbkRpc2NvdmVyVGFicyhkb2N1bWVudCkge1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7IGZvcm1OYW1lOiBudWxsLCBhY3RpdmVUYWI6IG51bGwsIHRhYnM6IFtdIH07XG4gICAgY29uc3QgbWFpbkZvcm0gPSBnZXRNYWluRm9ybShkb2N1bWVudCk7XG4gICAgaWYgKCFtYWluRm9ybSkgcmV0dXJuIHJlc3VsdHM7XG4gICAgcmVzdWx0cy5mb3JtTmFtZSA9IG1haW5Gb3JtLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XG5cbiAgICBtYWluRm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIlBpdm90SXRlbVwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgY29uc3QgaXNBY3RpdmUgPSBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpIHx8IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcpID09PSAndHJ1ZSc7XG4gICAgICAgIGNvbnN0IGhlYWRlckVsID0gbWFpbkZvcm0ucXVlcnlTZWxlY3RvcihgW2RhdGEtZHluLWNvbnRyb2xuYW1lPVwiJHtjb250cm9sTmFtZX1faGVhZGVyXCJdYCk7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gaGVhZGVyRWw/LnRleHRDb250ZW50Py50cmltKCkgfHxcbiAgICAgICAgICAgIGVsLnF1ZXJ5U2VsZWN0b3IoJy5waXZvdC1saW5rLXRleHQnKT8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fFxuICAgICAgICAgICAgZWwudGV4dENvbnRlbnQ/LnRyaW0oKS5zcGxpdCgnXFxuJylbMF07XG5cbiAgICAgICAgcmVzdWx0cy50YWJzLnB1c2goeyBjb250cm9sTmFtZSwgbGFiZWw6IChsYWJlbCB8fCAnJykuc3Vic3RyaW5nKDAsIDUwKSwgaXNBY3RpdmUgfSk7XG4gICAgICAgIGlmIChpc0FjdGl2ZSkgcmVzdWx0cy5hY3RpdmVUYWIgPSBjb250cm9sTmFtZTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3ZlckFjdGl2ZVRhYihkb2N1bWVudCkge1xuICAgIGNvbnN0IHJlc3VsdHMgPSB7XG4gICAgICAgIGZvcm1OYW1lOiBudWxsLCBhY3RpdmVUYWI6IG51bGwsIHNlY3Rpb25zOiBbXSxcbiAgICAgICAgZmllbGRzOiB7IGlucHV0czogW10sIGNoZWNrYm94ZXM6IFtdLCBjb21ib2JveGVzOiBbXSwgaW50ZWdlcnM6IFtdLCBkYXRlczogW10gfSxcbiAgICAgICAgc3VtbWFyeToge31cbiAgICB9O1xuICAgIGNvbnN0IG1haW5Gb3JtID0gZ2V0TWFpbkZvcm0oZG9jdW1lbnQpO1xuICAgIGlmICghbWFpbkZvcm0pIHJldHVybiByZXN1bHRzO1xuICAgIHJlc3VsdHMuZm9ybU5hbWUgPSBtYWluRm9ybS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xuXG4gICAgY29uc3QgYWN0aXZlVGFiRWwgPSBtYWluRm9ybS5xdWVyeVNlbGVjdG9yKCdbZGF0YS1keW4tcm9sZT1cIlBpdm90SXRlbVwiXS5hY3RpdmUsIFtkYXRhLWR5bi1yb2xlPVwiUGl2b3RJdGVtXCJdW2FyaWEtc2VsZWN0ZWQ9XCJ0cnVlXCJdJyk7XG4gICAgaWYgKGFjdGl2ZVRhYkVsKSByZXN1bHRzLmFjdGl2ZVRhYiA9IGFjdGl2ZVRhYkVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcblxuICAgIG1haW5Gb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlPVwiU2VjdGlvblBhZ2VcIl0sIFtkYXRhLWR5bi1yb2xlPVwiVGFiUGFnZVwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBpZiAoZWwub2Zmc2V0UGFyZW50ID09PSBudWxsKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICBpZiAoIWNvbnRyb2xOYW1lIHx8IC9eXFxkKyQvLnRlc3QoY29udHJvbE5hbWUpKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGhlYWRlckVsID0gZWwucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLXJvbGU9XCJTZWN0aW9uUGFnZUhlYWRlclwiXSwgLnNlY3Rpb24taGVhZGVyJyk7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gaGVhZGVyRWw/LnRleHRDb250ZW50Py50cmltKCk/LnNwbGl0KCdcXG4nKVswXTtcbiAgICAgICAgY29uc3QgaXNFeHBhbmRlZCA9ICFlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpICYmIGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpICE9PSAnZmFsc2UnO1xuICAgICAgICByZXN1bHRzLnNlY3Rpb25zLnB1c2goeyBjb250cm9sTmFtZSwgbGFiZWw6IChsYWJlbCB8fCAnJykuc3Vic3RyaW5nKDAsIDUwKSwgaXNFeHBhbmRlZCB9KTtcbiAgICB9KTtcblxuICAgIG1haW5Gb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1jb250cm9sbmFtZV0nKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgaWYgKGVsLm9mZnNldFBhcmVudCA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgY29uc3Qgcm9sZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tcm9sZScpO1xuICAgICAgICBjb25zdCBsYWJlbCA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJyk/LnRleHRDb250ZW50Py50cmltKCkgfHwgZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG4gICAgICAgIGlmICghcm9sZSB8fCAhY29udHJvbE5hbWUgfHwgL15cXGQrJC8udGVzdChjb250cm9sTmFtZSkpIHJldHVybjtcbiAgICAgICAgY29uc3QgaW5mbyA9IHsgY29udHJvbE5hbWUsIGxhYmVsOiAobGFiZWwgfHwgJycpLnN1YnN0cmluZygwLCA0MCkgfTtcblxuICAgICAgICBzd2l0Y2ggKHJvbGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ0lucHV0JzogY2FzZSAnU3RyaW5nJzogcmVzdWx0cy5maWVsZHMuaW5wdXRzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnQ2hlY2tCb3gnOiBjYXNlICdZZXNObyc6IHJlc3VsdHMuZmllbGRzLmNoZWNrYm94ZXMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdDb21ib0JveCc6IGNhc2UgJ0Ryb3Bkb3duTGlzdCc6IHJlc3VsdHMuZmllbGRzLmNvbWJvYm94ZXMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdJbnRlZ2VyJzogY2FzZSAnUmVhbCc6IHJlc3VsdHMuZmllbGRzLmludGVnZXJzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnRGF0ZSc6IGNhc2UgJ1RpbWUnOiByZXN1bHRzLmZpZWxkcy5kYXRlcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmVzdWx0cy5zdW1tYXJ5ID0ge1xuICAgICAgICBzZWN0aW9uczogcmVzdWx0cy5zZWN0aW9ucy5sZW5ndGgsXG4gICAgICAgIGlucHV0czogcmVzdWx0cy5maWVsZHMuaW5wdXRzLmxlbmd0aCxcbiAgICAgICAgY2hlY2tib3hlczogcmVzdWx0cy5maWVsZHMuY2hlY2tib3hlcy5sZW5ndGgsXG4gICAgICAgIGNvbWJvYm94ZXM6IHJlc3VsdHMuZmllbGRzLmNvbWJvYm94ZXMubGVuZ3RoLFxuICAgICAgICBpbnRlZ2VyczogcmVzdWx0cy5maWVsZHMuaW50ZWdlcnMubGVuZ3RoLFxuICAgICAgICBkYXRlczogcmVzdWx0cy5maWVsZHMuZGF0ZXMubGVuZ3RoXG4gICAgfTtcbiAgICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gYWRtaW5EaXNjb3ZlckFjdGlvblBhbmVUYWJzKGRvY3VtZW50KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IHsgZm9ybU5hbWU6IG51bGwsIGFjdGl2ZVRhYjogbnVsbCwgdGFiczogW10gfTtcbiAgICBjb25zdCBtYWluRm9ybSA9IGdldE1haW5Gb3JtKGRvY3VtZW50KTtcbiAgICBpZiAobWFpbkZvcm0pIHJlc3VsdHMuZm9ybU5hbWUgPSBtYWluRm9ybS5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWZvcm0tbmFtZScpO1xuXG4gICAgLy8gTWV0aG9kIDE6IHJvbGU9XCJ0YWJcIiBvdXRzaWRlIGRpYWxvZ3NcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cInRhYlwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBpZiAoZWwuY2xvc2VzdCgnLmRpYWxvZy1jb250ZW50LCBbZGF0YS1keW4tZm9ybS1uYW1lPVwiU3lzUXVlcnlGb3JtXCJdJykpIHJldHVybjtcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgZWwudGV4dENvbnRlbnQ/LnRyaW0oKTtcbiAgICAgICAgaWYgKCFjb250cm9sTmFtZSAmJiAhbGFiZWwpIHJldHVybjtcbiAgICAgICAgY29uc3QgaXNBY3RpdmUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSA9PT0gJ3RydWUnIHx8IGVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJyk7XG4gICAgICAgIGNvbnN0IHRhYkluZm8gPSB7IGNvbnRyb2xOYW1lOiBjb250cm9sTmFtZSB8fCAobGFiZWwgfHwgJycpLnJlcGxhY2UoL1xccysvZywgJycpLCBsYWJlbCwgaXNBY3RpdmUgfTtcbiAgICAgICAgaWYgKCFyZXN1bHRzLnRhYnMuc29tZSh0ID0+IHQuY29udHJvbE5hbWUgPT09IHRhYkluZm8uY29udHJvbE5hbWUpKSB7XG4gICAgICAgICAgICByZXN1bHRzLnRhYnMucHVzaCh0YWJJbmZvKTtcbiAgICAgICAgICAgIGlmIChpc0FjdGl2ZSkgcmVzdWx0cy5hY3RpdmVUYWIgPSB0YWJJbmZvLmNvbnRyb2xOYW1lO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBNZXRob2QgMjogdGFibGlzdFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tyb2xlPVwidGFibGlzdFwiXScpLmZvckVhY2godGFibGlzdCA9PiB7XG4gICAgICAgIGlmICh0YWJsaXN0LmNsb3Nlc3QoJy5kaWFsb2ctY29udGVudCcpKSByZXR1cm47XG4gICAgICAgIHRhYmxpc3QucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJ0YWJcIl0sIGJ1dHRvbiwgW2RhdGEtZHluLWNvbnRyb2xuYW1lXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGVsLnRleHRDb250ZW50Py50cmltKCk7XG4gICAgICAgICAgICBpZiAoIWNvbnRyb2xOYW1lICYmICFsYWJlbCkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMudGFicy5zb21lKHQgPT4gdC5jb250cm9sTmFtZSA9PT0gKGNvbnRyb2xOYW1lIHx8IGxhYmVsKSkpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGlzQWN0aXZlID0gZWwuZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJykgPT09ICd0cnVlJyB8fCBlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgY29uc3QgdGFiSW5mbyA9IHsgY29udHJvbE5hbWU6IGNvbnRyb2xOYW1lIHx8IGxhYmVsLCBsYWJlbCwgaXNBY3RpdmUgfTtcbiAgICAgICAgICAgIHJlc3VsdHMudGFicy5wdXNoKHRhYkluZm8pO1xuICAgICAgICAgICAgaWYgKGlzQWN0aXZlKSByZXN1bHRzLmFjdGl2ZVRhYiA9IHRhYkluZm8uY29udHJvbE5hbWU7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJGb3JtSW5wdXRzKGRvY3VtZW50LCBmb3JtTmFtZSkge1xuICAgIGNvbnN0IGZvcm0gPSBmb3JtTmFtZVxuICAgICAgICA/IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWR5bi1mb3JtLW5hbWU9XCIke2Zvcm1OYW1lfVwiXWApXG4gICAgICAgIDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZHluLWZvcm0tbmFtZV06bGFzdC1vZi10eXBlJyk7XG5cbiAgICBpZiAoIWZvcm0pIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgYWN0dWFsRm9ybU5hbWUgPSBmb3JtLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tZm9ybS1uYW1lJyk7XG4gICAgY29uc3QgcmVzdWx0cyA9IHtcbiAgICAgICAgZm9ybU5hbWU6IGFjdHVhbEZvcm1OYW1lLFxuICAgICAgICBpbnB1dHM6IFtdLCBjaGVja2JveGVzOiBbXSwgY29tYm9ib3hlczogW10sIHJhZGlvQnV0dG9uczogW10sXG4gICAgICAgIGRhdGVGaWVsZHM6IFtdLCB0aW1lRmllbGRzOiBbXSwgaW50ZWdlckZpZWxkczogW10sIHN0cmluZ0ZpZWxkczogW11cbiAgICB9O1xuXG4gICAgZm9ybS5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tY29udHJvbG5hbWVdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGNvbnN0IHJvbGUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKTtcbiAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gZWwucXVlcnlTZWxlY3RvcignbGFiZWwnKT8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJyk7XG4gICAgICAgIGlmICghcm9sZSkgcmV0dXJuO1xuICAgICAgICBjb25zdCBpbmZvID0geyBjb250cm9sTmFtZSwgcm9sZSwgbGFiZWwgfTtcbiAgICAgICAgcmVzdWx0cy5pbnB1dHMucHVzaChpbmZvKTtcblxuICAgICAgICBzd2l0Y2ggKHJvbGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ0NoZWNrQm94JzogY2FzZSAnWWVzTm8nOiByZXN1bHRzLmNoZWNrYm94ZXMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdDb21ib0JveCc6IGNhc2UgJ0Ryb3Bkb3duTGlzdCc6IHJlc3VsdHMuY29tYm9ib3hlcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ1JhZGlvQnV0dG9uJzogcmVzdWx0cy5yYWRpb0J1dHRvbnMucHVzaChpbmZvKTsgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdEYXRlJzogcmVzdWx0cy5kYXRlRmllbGRzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnVGltZSc6IHJlc3VsdHMudGltZUZpZWxkcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0ludGVnZXInOiBjYXNlICdSZWFsJzogcmVzdWx0cy5pbnRlZ2VyRmllbGRzLnB1c2goaW5mbyk7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnU3RyaW5nJzogY2FzZSAnSW5wdXQnOiByZXN1bHRzLnN0cmluZ0ZpZWxkcy5wdXNoKGluZm8pOyBicmVhaztcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluRGlzY292ZXJFdmVyeXRoaW5nKGRvY3VtZW50LCB3aW5kb3cpIHtcbiAgICBjb25zdCByZXN1bHRzID0ge1xuICAgICAgICB1cmw6IHtcbiAgICAgICAgICAgIGZ1bGw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgICAgICAgbWVudUl0ZW06IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdtaScpLFxuICAgICAgICAgICAgY29tcGFueTogbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoJ2NtcCcpXG4gICAgICAgIH0sXG4gICAgICAgIGZvcm1zOiBbXSxcbiAgICAgICAgYnlGb3JtOiB7fVxuICAgIH07XG5cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tZm9ybS1uYW1lXScpLmZvckVhY2goZm9ybUVsID0+IHtcbiAgICAgICAgY29uc3QgZm9ybU5hbWUgPSBmb3JtRWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1mb3JtLW5hbWUnKTtcbiAgICAgICAgY29uc3QgaXNWaXNpYmxlID0gZm9ybUVsLm9mZnNldFBhcmVudCAhPT0gbnVsbDtcbiAgICAgICAgcmVzdWx0cy5mb3Jtcy5wdXNoKHsgZm9ybU5hbWUsIGlzVmlzaWJsZSB9KTtcbiAgICAgICAgaWYgKCFpc1Zpc2libGUpIHJldHVybjtcblxuICAgICAgICBjb25zdCBmb3JtRGF0YSA9IHsgdGFiczogW10sIHNlY3Rpb25zOiBbXSwgYnV0dG9uczogW10sIGlucHV0czogW10sIGdyaWRzOiBbXSB9O1xuXG4gICAgICAgIGZvcm1FbC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIlBpdm90SXRlbVwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgZm9ybURhdGEudGFicy5wdXNoKHtcbiAgICAgICAgICAgICAgICBjb250cm9sTmFtZTogZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpLFxuICAgICAgICAgICAgICAgIGxhYmVsOiBlbC50ZXh0Q29udGVudD8udHJpbSgpLnNwbGl0KCdcXG4nKVswXVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZvcm1FbC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1keW4tcm9sZT1cIlNlY3Rpb25QYWdlXCJdLCBbZGF0YS1keW4tcm9sZT1cIkdyb3VwXCJdJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb250cm9sTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKTtcbiAgICAgICAgICAgIGlmIChjb250cm9sTmFtZSAmJiAhL15cXGQrJC8udGVzdChjb250cm9sTmFtZSkpIHtcbiAgICAgICAgICAgICAgICBmb3JtRGF0YS5zZWN0aW9ucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgY29udHJvbE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCwgLnNlY3Rpb24taGVhZGVyJyk/LnRleHRDb250ZW50Py50cmltKClcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZm9ybUVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWR5bi1yb2xlKj1cIkJ1dHRvblwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29udHJvbE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLWNvbnRyb2xuYW1lJyk7XG4gICAgICAgICAgICBpZiAoY29udHJvbE5hbWUgJiYgIS9eXFxkKyQvLnRlc3QoY29udHJvbE5hbWUpICYmICFjb250cm9sTmFtZS5pbmNsdWRlcygnQ2xlYXInKSkge1xuICAgICAgICAgICAgICAgIGZvcm1EYXRhLmJ1dHRvbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRyb2xOYW1lLFxuICAgICAgICAgICAgICAgICAgICByb2xlOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKSxcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6IGVsLnRleHRDb250ZW50Py50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnN1YnN0cmluZygwLCA1MClcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgaW5wdXRSb2xlcyA9IFsnSW5wdXQnLCAnU3RyaW5nJywgJ0ludGVnZXInLCAnUmVhbCcsICdEYXRlJywgJ1RpbWUnLCAnQ2hlY2tCb3gnLCAnWWVzTm8nLCAnQ29tYm9Cb3gnLCAnUmFkaW9CdXR0b24nXTtcbiAgICAgICAgaW5wdXRSb2xlcy5mb3JFYWNoKHJvbGUgPT4ge1xuICAgICAgICAgICAgZm9ybUVsLnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWR5bi1yb2xlPVwiJHtyb2xlfVwiXWApLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWR5bi1jb250cm9sbmFtZScpO1xuICAgICAgICAgICAgICAgIGlmIChjb250cm9sTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBmb3JtRGF0YS5pbnB1dHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250cm9sTmFtZSwgcm9sZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsOiBlbC5xdWVyeVNlbGVjdG9yKCdsYWJlbCcpPy50ZXh0Q29udGVudD8udHJpbSgpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBmb3JtRWwucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtZHluLXJvbGU9XCJHcmlkXCJdLCBbZGF0YS1keW4tcm9sZT1cIlJlYWN0TGlzdFwiXScpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgZm9ybURhdGEuZ3JpZHMucHVzaCh7XG4gICAgICAgICAgICAgICAgY29udHJvbE5hbWU6IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1keW4tY29udHJvbG5hbWUnKSxcbiAgICAgICAgICAgICAgICByb2xlOiBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtZHluLXJvbGUnKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJlc3VsdHMuYnlGb3JtW2Zvcm1OYW1lXSA9IGZvcm1EYXRhO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGFkbWluR2VuZXJhdGVTdGVwc0ZvclRhYihkb2N1bWVudCkge1xuICAgIGNvbnN0IHRhYkRhdGEgPSBhZG1pbkRpc2NvdmVyQWN0aXZlVGFiKGRvY3VtZW50KTtcbiAgICBpZiAoIXRhYkRhdGEuYWN0aXZlVGFiKSByZXR1cm4geyBhY3RpdmVUYWI6IG51bGwsIHN0ZXBzOiBbXSB9O1xuXG4gICAgY29uc3Qgc3RlcHMgPSBbXTtcbiAgICBzdGVwcy5wdXNoKHsgdHlwZTogJ3RhYi1uYXZpZ2F0ZScsIGNvbnRyb2xOYW1lOiB0YWJEYXRhLmFjdGl2ZVRhYiwgZGlzcGxheVRleHQ6IGBTd2l0Y2ggdG8gJHt0YWJEYXRhLmFjdGl2ZVRhYn0gdGFiYCwgdmFsdWU6ICcnIH0pO1xuXG4gICAgdGFiRGF0YS5maWVsZHMuaW5wdXRzLmZvckVhY2goZiA9PiB7XG4gICAgICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAnaW5wdXQnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICcnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xuICAgIH0pO1xuICAgIHRhYkRhdGEuZmllbGRzLmNoZWNrYm94ZXMuZm9yRWFjaChmID0+IHtcbiAgICAgICAgc3RlcHMucHVzaCh7IHR5cGU6ICdjaGVja2JveCcsIGNvbnRyb2xOYW1lOiBmLmNvbnRyb2xOYW1lLCB2YWx1ZTogJ3RydWUnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xuICAgIH0pO1xuICAgIHRhYkRhdGEuZmllbGRzLmNvbWJvYm94ZXMuZm9yRWFjaChmID0+IHtcbiAgICAgICAgc3RlcHMucHVzaCh7IHR5cGU6ICdzZWxlY3QnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICcnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xuICAgIH0pO1xuICAgIHRhYkRhdGEuZmllbGRzLmludGVnZXJzLmZvckVhY2goZiA9PiB7XG4gICAgICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAnaW5wdXQnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICcnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xuICAgIH0pO1xuICAgIHRhYkRhdGEuZmllbGRzLmRhdGVzLmZvckVhY2goZiA9PiB7XG4gICAgICAgIHN0ZXBzLnB1c2goeyB0eXBlOiAnaW5wdXQnLCBjb250cm9sTmFtZTogZi5jb250cm9sTmFtZSwgdmFsdWU6ICcnLCBkaXNwbGF5VGV4dDogZi5sYWJlbCB8fCBmLmNvbnRyb2xOYW1lIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHsgYWN0aXZlVGFiOiB0YWJEYXRhLmFjdGl2ZVRhYiwgc3RlcHMgfTtcbn1cblxuICAgIHJldHVybiB7IHN0YXJ0ZWQ6IHRydWUgfTtcbn1cblxuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBzdGFydEluamVjdGVkKHsgd2luZG93T2JqOiB3aW5kb3csIGRvY3VtZW50T2JqOiBkb2N1bWVudCB9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBRUEsTUFBcUIsZ0JBQXJCLE1BQW1DO0FBQUEsSUFDL0IsY0FBYztBQUNW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UUFBUSxPQUFLO0FBQ2pDLGNBQU0sS0FBSyxFQUFFLE1BQU0sU0FBUyxhQUFhLEVBQUUsYUFBYSxPQUFPLElBQUksYUFBYSxFQUFFLFNBQVMsRUFBRSxZQUFZLENBQUM7QUFBQSxNQUM5RyxDQUFDO0FBQ0QsY0FBUSxPQUFPLE1BQU0sUUFBUSxPQUFLO0FBQzlCLGNBQU0sS0FBSyxFQUFFLE1BQU0sU0FBUyxhQUFhLEVBQUUsYUFBYSxPQUFPLElBQUksYUFBYSxFQUFFLFNBQVMsRUFBRSxZQUFZLENBQUM7QUFBQSxNQUM5RyxDQUFDO0FBRUQsYUFBTyxFQUFFLFdBQVcsUUFBUSxXQUFXLE1BQU07QUFBQSxJQUNqRDtBQUVJLFdBQU8sRUFBRSxTQUFTLEtBQUs7QUFBQSxFQUMzQjtBQUVBLE1BQUksT0FBTyxXQUFXLGVBQWUsT0FBTyxhQUFhLGFBQWE7QUFDbEUsa0JBQWMsRUFBRSxXQUFXLFFBQVEsYUFBYSxTQUFTLENBQUM7QUFBQSxFQUM5RDsiLAogICJuYW1lcyI6IFsiaGFzTG9va3VwQnV0dG9uIiwgInRvcCIsICJjb21ib0lucHV0V2l0aFNlbGVjdGVkTWV0aG9kIiwgImZpbHRlcklucHV0IiwgImZpbHRlckZpZWxkQ29udGFpbmVyIiwgInJvdyIsICJvcHRpb25zIiwgIndpbmRvdyIsICJkb2N1bWVudCIsICJuYXZpZ2F0b3IiLCAia2V5IiwgInJlc3VsdCIsICJpbnNwZWN0b3IiXQp9Cg==
