/**
 * Local Executor - Manages persistent interactive Claude CLI process
 * Uses Happy CLI wrapper approach to load Claude in-process
 */
import { spawn } from 'node:child_process';
import { readlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class LocalExecutor {
    config;
    claudePath;
    process = null;
    pendingPermissions = new Map();
    onPermissionRequest;
    constructor(config) {
        this.config = config;
        this.claudePath = config.claudePath || 'claude';
    }
    setPermissionCallback(callback) {
        this.onPermissionRequest = callback;
    }
    async connect() {
        console.log('[Local Executor] Verifying Claude CLI exists');
    }
    async disconnect() {
        console.log('[Local Executor] Disconnecting');
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
    /**
     * Start interactive Claude process with Happy CLI wrapper
     * Loads Claude CLI in-process using the wrapper approach
     */
    async startInteractiveSession(callbacks) {
        if (this.process) {
            throw new Error('Session already running');
        }
        // Resolve symlink to actual cli.js
        let resolvedPath = this.claudePath;
        try {
            if (existsSync(this.claudePath)) {
                const realPath = readlinkSync(this.claudePath);
                if (!realPath.startsWith('/')) {
                    const path = await import('path');
                    resolvedPath = path.join(path.dirname(this.claudePath), realPath);
                }
                else {
                    resolvedPath = realPath;
                }
            }
        }
        catch {
            // Not a symlink, use original
        }
        console.log(`[Local Executor] Starting Claude with Happy CLI wrapper: ${resolvedPath}`);
        console.log(`[Local Executor] Node path: ${this.config.nodePath || 'node'}`);
        // Ensure working directory exists
        const { mkdirSync } = await import('fs');
        try {
            mkdirSync(this.config.workingDir, { recursive: true });
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                throw new Error(`Failed to create working directory: ${error.message}`);
            }
        }
        const nodePath = this.config.nodePath || 'node';
        const wrapperPath = join(__dirname, 'claude-wrapper.cjs');
        console.log(`[Local Executor] Using wrapper: ${wrapperPath}`);
        // Spawn Claude CLI with Happy CLI wrapper in programmatic mode
        this.process = spawn(nodePath, [
            wrapperPath,
            resolvedPath,
            '--output-format=stream-json',
            '--input-format=stream-json',
            '--permission-prompt-tool=stdio',
            '--verbose'
        ], {
            cwd: this.config.workingDir,
            env: {
                ...process.env,
                PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
                DISABLE_AUTOUPDATER: '1',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        console.log(`[Local Executor] Claude process spawned with PID ${this.process.pid}`);
        // Handle stdout - parse for control_request and forward relevant messages
        this.process.stdout?.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const msg = JSON.parse(line);
                    // Handle permission requests (control_request) - don't forward to frontend
                    if (msg.type === 'control_request' && msg.request?.subtype === 'can_use_tool') {
                        this.handlePermissionRequest(msg);
                        continue;
                    }
                    // Only forward assistant/system/user messages, not control messages
                    if (msg.type === 'assistant' || msg.type === 'system' || msg.type === 'user' || msg.type === 'result') {
                        callbacks.onOutput(line + '\n');
                    }
                }
                catch {
                    // Not JSON, pass through as-is (error messages, etc.)
                    callbacks.onOutput(line + '\n');
                }
            }
        });
        // Handle stderr
        this.process.stderr?.on('data', (data) => {
            callbacks.onError(data.toString());
        });
        // Handle exit
        this.process.on('exit', (code) => {
            console.log(`[Local Executor] Claude process exited with code ${code}`);
            this.process = null;
            callbacks.onExit(code);
        });
    }
    /**
     * Send message to Claude process in stream-json format
     */
    async sendMessage(message) {
        if (!this.process) {
            throw new Error('No active Claude process');
        }
        // Format message as stream-json (newline-delimited JSON)
        // Claude CLI expects full Anthropic API message format
        const jsonMessage = JSON.stringify({
            type: 'user',
            message: {
                role: 'user',
                content: message,
            }
        });
        console.log(`[Local Executor] Writing to stdin (stream-json): ${message.substring(0, 50)}...`);
        this.process.stdin?.write(jsonMessage + '\n');
    }
    async fileExists(path) {
        try {
            const fs = await import('fs/promises');
            await fs.access(path);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Handle permission request from Claude CLI
     */
    handlePermissionRequest(msg) {
        const requestId = msg.request_id;
        const toolName = msg.request.tool_name;
        const input = msg.request.input;
        console.log(`[Local Executor] Permission request: ${toolName}`);
        // Create promise that will be resolved when user responds
        const promise = new Promise((resolve, reject) => {
            this.pendingPermissions.set(requestId, {
                resolve: (approved) => resolve({ approved, input }),
                reject
            });
        });
        // Notify callback
        if (this.onPermissionRequest) {
            this.onPermissionRequest({ requestId, toolName, input });
        }
        // Wait for response and send back to Claude
        promise.then(({ approved, input }) => {
            this.sendPermissionResponse(requestId, approved, input);
        }).catch((error) => {
            console.error('[Local Executor] Permission request error:', error);
            this.sendPermissionResponse(requestId, false, input);
        });
    }
    /**
     * Respond to a permission request
     */
    respondToPermission(requestId, approved) {
        console.log(`[Local Executor] respondToPermission called for request ${requestId}: ${approved ? 'approved' : 'denied'}`);
        const pending = this.pendingPermissions.get(requestId);
        if (pending) {
            console.log(`[Local Executor] Found pending permission, resolving...`);
            this.pendingPermissions.delete(requestId);
            pending.resolve(approved);
        }
        else {
            console.error(`[Local Executor] No pending permission found for request ${requestId}`);
            console.error(`[Local Executor] Pending permissions:`, Array.from(this.pendingPermissions.keys()));
        }
    }
    /**
     * Send permission response back to Claude CLI via stdin
     */
    sendPermissionResponse(requestId, approved, originalInput) {
        if (!this.process) {
            console.error('[Local Executor] Cannot send permission response - no process');
            return;
        }
        const response = {
            type: 'control_response',
            response: {
                subtype: 'success',
                request_id: requestId,
                response: {
                    behavior: approved ? 'allow' : 'deny',
                    ...(approved ? { updatedInput: originalInput } : { message: 'User denied permission' })
                }
            }
        };
        console.log(`[Local Executor] Sending permission response for request ${requestId}: ${approved ? 'allow' : 'deny'}`);
        console.log(`[Local Executor] Response JSON:`, JSON.stringify(response));
        this.process.stdin?.write(JSON.stringify(response) + '\n');
        console.log(`[Local Executor] Permission response sent successfully`);
    }
}
