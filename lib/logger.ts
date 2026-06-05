/**
 * Centralized logging system for production monitoring
 */

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

export interface LogContext {
    userId?: string;
    conversationId?: string;
    messageId?: string;
    action?: string;
    duration?: number;
    metadata?: Record<string, any>;
    operation?: string;
    securityEvent?: string;
    error?: string;
    stack?: string;
}

class Logger {
    private isDevelopment = process.env.NODE_ENV === 'development';

    private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? JSON.stringify(context) : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message} ${contextStr}`;
    }

    debug(message: string, context?: LogContext) {
        if (this.isDevelopment) {
            console.debug(this.formatMessage(LogLevel.DEBUG, message, context));
        }
    }

    info(message: string, context?: LogContext) {
        console.info(this.formatMessage(LogLevel.INFO, message, context));

        // TODO: Send to logging service (e.g., Datadog, Logtail)
        this.sendToLoggingService(LogLevel.INFO, message, context);
    }

    warn(message: string, context?: LogContext) {
        console.warn(this.formatMessage(LogLevel.WARN, message, context));

        // TODO: Send to logging service
        this.sendToLoggingService(LogLevel.WARN, message, context);
    }

    error(message: string, error?: Error, context?: LogContext) {
        const errorContext = {
            ...context,
            error: error?.message,
            stack: error?.stack,
        };

        console.error(this.formatMessage(LogLevel.ERROR, message, errorContext));

        // TODO: Send to error tracking (Sentry)
        this.sendToErrorTracking(message, error, errorContext);

        // TODO: Send to logging service
        this.sendToLoggingService(LogLevel.ERROR, message, errorContext);
    }

    /**
     * Log performance metrics
     */
    performance(operation: string, duration: number, context?: LogContext) {
        this.info(`Performance: ${operation}`, {
            ...context,
            duration,
            operation,
        });
    }

    /**
     * Log security events
     */
    security(event: string, context?: LogContext) {
        this.warn(`Security: ${event}`, {
            ...context,
            securityEvent: event,
        });
    }

    private sendToLoggingService(level: LogLevel, message: string, context?: LogContext) {
        // TODO: Implement logging service integration
        // Example: Datadog, Logtail, CloudWatch
        if (process.env.LOGTAIL_TOKEN) {
            // Send to Logtail
        }
    }

    private sendToErrorTracking(message: string, error?: Error, context?: LogContext) {
        // TODO: Implement Sentry or similar
        if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
            // Sentry.captureException(error, { extra: context });
        }
    }
}

export const logger = new Logger();

/**
 * Performance monitoring decorator
 */
export function measurePerformance(operation: string) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const start = Date.now();
            try {
                const result = await originalMethod.apply(this, args);
                const duration = Date.now() - start;
                logger.performance(operation, duration);
                return result;
            } catch (error) {
                const duration = Date.now() - start;
                logger.error(`${operation} failed`, error as Error, { duration });
                throw error;
            }
        };

        return descriptor;
    };
}
