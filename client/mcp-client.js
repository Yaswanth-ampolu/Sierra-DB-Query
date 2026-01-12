/**
 * Sierra DB Query - MCP Browser Client
 * Full-featured browser client for testing MCP server connections
 */

class MCPClient {
  constructor() {
    this.serverUrl = '';
    this.sessionId = null;
    this.tools = [];
    this.connectionString = '';
    this.selectedTool = null;
    this.requestId = 0;
    this.lastResults = '';

    this.initElements();
    this.attachEventListeners();
  }

  initElements() {
    // Connection elements
    this.serverUrlInput = document.getElementById('serverUrl');
    this.connectionStringInput = document.getElementById('connectionString');
    this.connectBtn = document.getElementById('connectBtn');
    this.disconnectBtn = document.getElementById('disconnectBtn');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.togglePasswordBtn = document.getElementById('togglePassword');

    // Tools elements
    this.toolsList = document.getElementById('toolsList');
    this.toolCount = document.getElementById('toolCount');
    this.quickActions = document.getElementById('quickActions');

    // Executor elements
    this.executorTitle = document.getElementById('executorTitle');
    this.executorForm = document.getElementById('executorForm');
    this.clearFormBtn = document.getElementById('clearFormBtn');

    // Results elements
    this.resultsContainer = document.getElementById('resultsContainer');
    this.clearResultsBtn = document.getElementById('clearResultsBtn');
    this.copyResultsBtn = document.getElementById('copyResultsBtn');

    // Logs elements
    this.logsContainer = document.getElementById('logsContainer');
    this.clearLogsBtn = document.getElementById('clearLogsBtn');

    // Modal elements
    this.queryModal = document.getElementById('queryModal');
    this.sqlQueryInput = document.getElementById('sqlQuery');
    this.expectRowsCheckbox = document.getElementById('expectRows');
    this.closeQueryModalBtn = document.getElementById('closeQueryModal');
    this.cancelQueryBtn = document.getElementById('cancelQueryBtn');
    this.runQueryBtn = document.getElementById('runQueryBtn');
  }

  attachEventListeners() {
    // Connection
    this.connectBtn.addEventListener('click', () => this.connect());
    this.disconnectBtn.addEventListener('click', () => this.disconnect());
    this.togglePasswordBtn.addEventListener('click', () => this.togglePasswordVisibility());

    // Quick actions
    this.quickActions.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', () => this.executeQuickAction(btn.dataset.action));
    });

    // Form actions
    this.clearFormBtn.addEventListener('click', () => this.clearExecutorForm());
    this.clearResultsBtn.addEventListener('click', () => this.clearResults());
    this.copyResultsBtn.addEventListener('click', () => this.copyResults());
    this.clearLogsBtn.addEventListener('click', () => this.clearLogs());

    // Modal
    this.closeQueryModalBtn.addEventListener('click', () => this.closeModal());
    this.cancelQueryBtn.addEventListener('click', () => this.closeModal());
    this.runQueryBtn.addEventListener('click', () => this.executeQueryFromModal());
    this.queryModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
      if (e.key === 'Enter' && e.ctrlKey && this.queryModal.classList.contains('open')) {
        this.executeQueryFromModal();
      }
    });

    // Enter to connect
    this.connectionStringInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.connect();
    });
  }

  togglePasswordVisibility() {
    const type = this.connectionStringInput.type === 'password' ? 'text' : 'password';
    this.connectionStringInput.type = type;
  }

  log(type, method, data = null) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const time = new Date().toLocaleTimeString();
    const arrow = type === 'request' ? '→' : '←';

    entry.innerHTML = `
      <div class="log-time">${time}</div>
      <div><span class="log-method">${arrow} ${method}</span></div>
      ${data ? `<div class="log-content">${JSON.stringify(data, null, 2).substring(0, 200)}...</div>` : ''}
    `;

    this.logsContainer.insertBefore(entry, this.logsContainer.firstChild);
  }

  async sendRequest(method, params = {}) {
    const requestId = ++this.requestId;
    const body = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params
    };

    this.log('request', method);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };

    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    try {
      const response = await fetch(`${this.serverUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const newSessionId = response.headers.get('mcp-session-id');
      if (newSessionId) {
        this.sessionId = newSessionId;
      }

      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('text/event-stream')) {
        const text = await response.text();
        const events = this.parseSSE(text);

        for (const event of events) {
          if (event.data) {
            try {
              const parsed = JSON.parse(event.data);
              this.log('response', method, parsed);
              return parsed;
            } catch (e) {
              // Continue
            }
          }
        }
        return null;
      } else {
        const result = await response.json();
        this.log('response', method, result);
        return result;
      }
    } catch (error) {
      this.log('error', `Error: ${error.message}`);
      throw error;
    }
  }

  parseSSE(text) {
    const events = [];
    const lines = text.split('\n');
    let currentEvent = {};

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data = line.slice(5).trim();
      } else if (line === '' && (currentEvent.event || currentEvent.data)) {
        events.push(currentEvent);
        currentEvent = {};
      }
    }

    if (currentEvent.event || currentEvent.data) {
      events.push(currentEvent);
    }

    return events;
  }

  async connect() {
    this.serverUrl = this.serverUrlInput.value.trim().replace(/\/$/, '');
    this.connectionString = this.connectionStringInput.value.trim();

    if (!this.serverUrl) {
      this.showResult('error', 'Please enter a server URL');
      return;
    }

    // If already connected, disconnect first (silently)
    if (this.sessionId) {
      await this.disconnect(true);
    }

    this.connectBtn.disabled = true;
    this.connectBtn.innerHTML = '<span class="loading"></span> Connecting...';

    try {
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'sierra-browser-client',
          version: '1.0.0'
        }
      });

      if (initResult && initResult.result) {
        this.updateConnectionStatus(true);
        this.showResult('success', `Connected to ${initResult.result.serverInfo?.name || 'MCP Server'} v${initResult.result.serverInfo?.version || '?'}`);

        await this.sendNotification('notifications/initialized', {});
        await this.listTools();
      } else if (initResult && initResult.error) {
        throw new Error(initResult.error.message || 'Initialization failed');
      }
    } catch (error) {
      this.showResult('error', `Connection failed: ${error.message}`);
      this.updateConnectionStatus(false);
    } finally {
      this.connectBtn.disabled = false;
      this.connectBtn.textContent = 'Connect';
    }
  }

  async sendNotification(method, params = {}) {
    const body = {
      jsonrpc: '2.0',
      method,
      params
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    try {
      await fetch(`${this.serverUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
    } catch (error) {
      console.error('Notification error:', error);
    }
  }

  async disconnect(silent = false) {
    if (this.sessionId) {
      try {
        await fetch(`${this.serverUrl}/mcp`, {
          method: 'DELETE',
          headers: { 'mcp-session-id': this.sessionId }
        });
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }

    this.sessionId = null;
    this.tools = [];
    this.selectedTool = null;
    this.updateConnectionStatus(false);
    this.renderTools();
    this.clearExecutorForm();
    if (!silent) {
      this.showResult('success', 'Disconnected from server');
    }
  }

  updateConnectionStatus(connected) {
    const statusText = this.connectionStatus?.querySelector('.status-text');
    const quickActionBtns = this.quickActions?.querySelectorAll('.quick-action-btn');

    if (connected) {
      this.connectionStatus?.classList.add('connected');
      if (statusText) statusText.textContent = 'Connected';
      if (this.disconnectBtn) this.disconnectBtn.disabled = false;
      if (quickActionBtns) quickActionBtns.forEach(btn => btn.disabled = false);
    } else {
      this.connectionStatus?.classList.remove('connected');
      if (statusText) statusText.textContent = 'Disconnected';
      if (this.disconnectBtn) this.disconnectBtn.disabled = true;
      if (quickActionBtns) quickActionBtns.forEach(btn => btn.disabled = true);
    }
  }

  async listTools() {
    try {
      const result = await this.sendRequest('tools/list', {});

      if (result && result.result && result.result.tools) {
        this.tools = result.result.tools;
        this.renderTools();
        this.showResult('success', `Found ${this.tools.length} tools available`);
      } else if (result && result.error) {
        throw new Error(result.error.message);
      }
    } catch (error) {
      this.showResult('error', `Failed to list tools: ${error.message}`);
    }
  }

  renderTools() {
    this.toolCount.textContent = this.tools.length;

    if (this.tools.length === 0) {
      this.toolsList.innerHTML = `
        <div class="empty-state small">
          <p>Connect to see tools</p>
        </div>
      `;
      return;
    }

    this.toolsList.innerHTML = this.tools.map(tool => `
      <div class="tool-item" data-tool="${tool.name}">
        <h4>${this.formatToolName(tool.name)}</h4>
        <p>${tool.description?.substring(0, 60) || 'No description'}...</p>
      </div>
    `).join('');

    this.toolsList.querySelectorAll('.tool-item').forEach(item => {
      item.addEventListener('click', () => {
        const toolName = item.dataset.tool;
        this.selectTool(toolName);

        this.toolsList.querySelectorAll('.tool-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
    });
  }

  formatToolName(name) {
    return name.replace(/^sierra_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  selectTool(toolName) {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) return;

    this.selectedTool = tool;
    this.executorTitle.textContent = this.formatToolName(tool.name);
    this.renderToolForm(tool);
  }

  renderToolForm(tool) {
    const schema = tool.inputSchema;
    if (!schema || !schema.properties) {
      this.executorForm.innerHTML = `
        <p style="color: var(--text-muted);">This tool has no parameters.</p>
        <button class="btn btn-primary btn-execute" onclick="window.mcpClient.executeTool()">Execute</button>
      `;
      return;
    }

    const properties = schema.properties;
    const required = schema.required || [];

    let html = '<div class="form-section">';

    for (const [key, prop] of Object.entries(properties)) {
      const isRequired = required.includes(key);
      const propObj = prop;

      // Auto-fill connectionString
      let defaultValue = '';
      if (key === 'connectionString' && this.connectionString) {
        defaultValue = this.connectionString;
      }

      html += `
        <div class="form-group">
          <label for="field-${key}">
            ${key}${isRequired ? '<span class="required">*</span>' : ''}
            <span style="color: var(--text-muted); font-weight: 400;"> (${propObj.type || 'string'})</span>
          </label>
          ${propObj.description ? `<p style="font-size: 0.7rem; color: var(--text-muted); margin: 2px 0 6px;">${propObj.description}</p>` : ''}
          ${this.renderFormField(key, propObj, defaultValue)}
        </div>
      `;
    }

    html += '</div>';
    html += '<button class="btn btn-primary btn-execute" onclick="window.mcpClient.executeTool()">Execute Tool</button>';

    this.executorForm.innerHTML = html;
  }

  renderFormField(key, prop, defaultValue = '') {
    const id = `field-${key}`;
    const type = prop.type || 'string';

    // Enum select
    if (prop.enum) {
      return `
        <select id="${id}" data-key="${key}">
          ${prop.enum.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
      `;
    }

    // Boolean select
    if (type === 'boolean') {
      return `
        <select id="${id}" data-key="${key}">
          <option value="">-- Select --</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      `;
    }

    // Number input
    if (type === 'number' || type === 'integer') {
      return `<input type="number" id="${id}" data-key="${key}" value="${defaultValue}">`;
    }

    // Object/Array textarea
    if (type === 'object' || type === 'array') {
      const placeholder = type === 'array' ? '[]' : '{}';
      return `<textarea id="${id}" data-key="${key}" placeholder='${placeholder}'>${defaultValue}</textarea>`;
    }

    // Default text input
    return `<input type="text" id="${id}" data-key="${key}" value="${defaultValue}" placeholder="${prop.description || ''}">`;
  }

  getFormValues() {
    const inputs = this.executorForm.querySelectorAll('input, select, textarea');
    const values = {};

    inputs.forEach(input => {
      const key = input.dataset.key;
      if (!key) return;

      let value = input.value.trim();
      if (!value) return;

      // Parse types
      if (input.type === 'number') {
        value = Number(value);
      } else if (input.tagName === 'SELECT' && (value === 'true' || value === 'false')) {
        value = value === 'true';
      } else if (input.tagName === 'TEXTAREA') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Keep as string
        }
      }

      values[key] = value;
    });

    return values;
  }

  async executeTool() {
    if (!this.selectedTool) {
      this.showResult('error', 'No tool selected');
      return;
    }

    const args = this.getFormValues();
    await this.callTool(this.selectedTool.name, args);
  }

  async callTool(toolName, args) {
    const startTime = Date.now();

    try {
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });

      const elapsed = Date.now() - startTime;

      if (result && result.result) {
        this.displayToolResult(result.result, elapsed);
      } else if (result && result.error) {
        this.showResult('error', `Tool error: ${result.error.message}`);
      }
    } catch (error) {
      this.showResult('error', `Execution failed: ${error.message}`);
    }
  }

  displayToolResult(result, elapsed) {
    const content = result.content || [];
    const isError = result.isError;
    const time = new Date().toLocaleTimeString();

    let html = '';

    for (const item of content) {
      if (item.type === 'text') {
        let text = item.text;
        let formattedContent = '';

        // Try to parse and format JSON
        try {
          const parsed = JSON.parse(text);

          // If it's an array of objects, try to display as table
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
            formattedContent = this.renderTable(parsed);
          } else {
            formattedContent = `<pre>${this.escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
          }
        } catch (e) {
          formattedContent = `<pre>${this.escapeHtml(text)}</pre>`;
        }

        html += `
          <div class="result-item ${isError ? 'error' : 'success'}">
            <div class="result-time">${time} • ${elapsed}ms</div>
            ${formattedContent}
          </div>
        `;
      }
    }

    if (!html) {
      html = `<div class="result-item"><div class="result-time">${time}</div><pre>No content returned</pre></div>`;
    }

    this.lastResults = html;
    this.resultsContainer.innerHTML = html;
    this.copyResultsBtn.disabled = false;
  }

  renderTable(data) {
    if (!data.length) return '<pre>[]</pre>';

    const keys = Object.keys(data[0]);

    let html = '<div class="result-table-wrapper"><table class="result-table"><thead><tr>';
    html += keys.map(k => `<th>${this.escapeHtml(k)}</th>`).join('');
    html += '</tr></thead><tbody>';

    for (const row of data.slice(0, 100)) { // Limit to 100 rows
      html += '<tr>';
      html += keys.map(k => {
        let val = row[k];
        if (val === null) val = 'NULL';
        else if (typeof val === 'object') val = JSON.stringify(val);
        return `<td>${this.escapeHtml(String(val))}</td>`;
      }).join('');
      html += '</tr>';
    }

    html += '</tbody></table></div>';

    if (data.length > 100) {
      html += `<p style="color: var(--text-muted); margin-top: 8px;">Showing 100 of ${data.length} rows</p>`;
    }

    return html;
  }

  showResult(type, message) {
    const time = new Date().toLocaleTimeString();
    const html = `
      <div class="result-item ${type}">
        <div class="result-time">${time}</div>
        <pre>${this.escapeHtml(message)}</pre>
      </div>
    `;

    if (this.resultsContainer.querySelector('.empty-state')) {
      this.resultsContainer.innerHTML = html;
    } else {
      this.resultsContainer.innerHTML = html + this.resultsContainer.innerHTML;
    }
  }

  // Quick Actions
  async executeQuickAction(action) {
    switch (action) {
      case 'list-tables':
        await this.quickListTables();
        break;
      case 'list-enums':
        await this.quickListEnums();
        break;
      case 'run-query':
        this.openQueryModal();
        break;
      case 'db-stats':
        await this.quickDbStats();
        break;
    }
  }

  async quickListTables() {
    if (!this.connectionString) {
      this.showResult('error', 'Please enter a PostgreSQL connection string and click Connect first');
      return;
    }

    if (!this.connectionString.startsWith('postgresql://') && !this.connectionString.startsWith('postgres://')) {
      this.showResult('error', 'Invalid connection string. Must start with postgresql:// or postgres://');
      return;
    }

    await this.callTool('sierra_manage_schema', {
      connectionString: this.connectionString,
      operation: 'get_info'
    });
  }

  async quickListEnums() {
    if (!this.connectionString) {
      this.showResult('error', 'Please enter a connection string first');
      return;
    }

    await this.callTool('sierra_manage_schema', {
      connectionString: this.connectionString,
      operation: 'get_enums'
    });
  }

  async quickDbStats() {
    if (!this.connectionString) {
      this.showResult('error', 'Please enter a connection string first');
      return;
    }

    await this.callTool('sierra_analyze_database', {
      connectionString: this.connectionString,
      operation: 'overview'
    });
  }

  openQueryModal() {
    this.queryModal.classList.add('open');
    this.sqlQueryInput.focus();
  }

  closeModal() {
    this.queryModal.classList.remove('open');
  }

  async executeQueryFromModal() {
    const sql = this.sqlQueryInput.value.trim();
    if (!sql) {
      this.showResult('error', 'Please enter a SQL query');
      return;
    }

    if (!this.connectionString) {
      this.showResult('error', 'Please enter a connection string first');
      return;
    }

    this.closeModal();

    await this.callTool('sierra_execute_sql', {
      connectionString: this.connectionString,
      sql: sql,
      expectRows: this.expectRowsCheckbox.checked
    });
  }

  clearExecutorForm() {
    this.selectedTool = null;
    this.executorTitle.textContent = 'Tool Executor';
    this.executorForm.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
        </svg>
        <p>Select a tool or quick action to get started</p>
      </div>
    `;
    this.toolsList.querySelectorAll('.tool-item').forEach(i => i.classList.remove('active'));
  }

  clearResults() {
    this.lastResults = '';
    this.copyResultsBtn.disabled = true;
    this.resultsContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
        <p>Execute a tool to see results</p>
      </div>
    `;
  }

  async copyResults() {
    try {
      // Get text content from results
      const text = this.resultsContainer.innerText;
      await navigator.clipboard.writeText(text);
      this.showResult('success', 'Results copied to clipboard');
    } catch (e) {
      this.showResult('error', 'Failed to copy results');
    }
  }

  clearLogs() {
    this.logsContainer.innerHTML = '';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.mcpClient = new MCPClient();
});
