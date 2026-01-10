type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: number;
    message: string;
    level: LogLevel;
}

class DebugLogger {
    private logs: LogEntry[] = [];
    private maxLogs = 100;
    private listeners: (() => void)[] = [];

    log(message: string, level: LogLevel = 'info') {
        const entry = { timestamp: Date.now(), message, level };
        this.logs.unshift(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
        console.log(`[DEBUG] ${message}`);
        this.notify();
    }

    error(message: string) {
        this.log(message, 'error');
    }

    warn(message: string) {
        this.log(message, 'warn');
    }

    getLogs() {
        return [...this.logs];
    }

    clear() {
        this.logs = [];
        this.notify();
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l());
    }
}

export const debugLog = new DebugLogger();
