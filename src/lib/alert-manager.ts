/**
 * Alert Manager
 * 
 * Система алертов для мониторинга критических метрик
 * - Правила алертов (error rate, response time, etc.)
 * - Webhook notifications (Slack, Discord, Email)
 * - Alert history и silencing
 */

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'firing' | 'resolved' | 'silenced';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  condition: (metrics: any) => boolean;
  threshold: number;
  enabled: boolean;
  notificationChannels: string[]; // 'webhook', 'log', etc.
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  value: number;
  threshold: number;
  firedAt: Date;
  resolvedAt?: Date;
  silencedUntil?: Date;
}

export interface AlertHistory {
  alerts: Alert[];
  totalFired: number;
  totalResolved: number;
  activeFiring: number;
}

/**
 * Alert Manager Class
 */
export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private maxHistorySize = 1000;

  constructor() {
    // Инициализация default rules
    this.initializeDefaultRules();
  }

  /**
   * Инициализация правил по умолчанию
   */
  private initializeDefaultRules(): void {
    // Rule 1: High Error Rate
    this.addRule({
      id: 'high_error_rate',
      name: 'High Error Rate',
      description: 'Error rate exceeds 5%',
      severity: 'critical',
      condition: (metrics) => metrics.errors.rate > 5,
      threshold: 5,
      enabled: true,
      notificationChannels: ['webhook', 'log']
    });

    // Rule 2: Slow Response Time (P95)
    this.addRule({
      id: 'slow_response_time',
      name: 'Slow Response Time',
      description: 'P95 response time exceeds 500ms',
      severity: 'warning',
      condition: (metrics) => metrics.performance.responseTime.p95 > 500,
      threshold: 500,
      enabled: true,
      notificationChannels: ['log']
    });

    // Rule 3: Very Slow Response Time (P95)
    this.addRule({
      id: 'very_slow_response_time',
      name: 'Very Slow Response Time',
      description: 'P95 response time exceeds 1000ms',
      severity: 'critical',
      condition: (metrics) => metrics.performance.responseTime.p95 > 1000,
      threshold: 1000,
      enabled: true,
      notificationChannels: ['webhook', 'log']
    });

    // Rule 4: Low Cache Hit Rate
    this.addRule({
      id: 'low_cache_hit_rate',
      name: 'Low Cache Hit Rate',
      description: 'Cache hit rate below 50%',
      severity: 'warning',
      condition: (metrics) => metrics.cache.hitRate < 50 && metrics.cache.hits + metrics.cache.misses > 100,
      threshold: 50,
      enabled: true,
      notificationChannels: ['log']
    });

    // Rule 5: High DB Query Time (P95)
    this.addRule({
      id: 'slow_db_queries',
      name: 'Slow Database Queries',
      description: 'P95 DB query time exceeds 200ms',
      severity: 'warning',
      condition: (metrics) => metrics.performance.dbQueryTime.p95 > 200,
      threshold: 200,
      enabled: true,
      notificationChannels: ['log']
    });

    // Rule 6: Very High Request Volume
    this.addRule({
      id: 'high_request_volume',
      name: 'High Request Volume',
      description: 'Request volume exceeds 10000 requests',
      severity: 'info',
      condition: (metrics) => metrics.requests.total > 10000,
      threshold: 10000,
      enabled: false, // Disabled by default
      notificationChannels: ['log']
    });
  }

  /**
   * Добавить правило
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Удалить правило
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Получить все правила
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Включить/выключить правило
   */
  toggleRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Проверить метрики на алерты
   */
  checkMetrics(metrics: any): Alert[] {
    const newAlerts: Alert[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        const isFiring = rule.condition(metrics);
        const existingAlert = this.activeAlerts.get(rule.id);

        if (isFiring && !existingAlert) {
          // Fire new alert
          const alert = this.fireAlert(rule, metrics);
          newAlerts.push(alert);
        } else if (!isFiring && existingAlert && existingAlert.status === 'firing') {
          // Resolve existing alert
          this.resolveAlert(rule.id);
        }
      } catch (error) {
        console.error(`Error checking rule ${rule.id}:`, error);
      }
    }

    return newAlerts;
  }

  /**
   * Fire новый алерт
   */
  private fireAlert(rule: AlertRule, metrics: any): Alert {
    const value = this.extractValue(rule, metrics);
    
    const alert: Alert = {
      id: `${rule.id}-${Date.now()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: 'firing',
      message: `${rule.description} (value: ${value.toFixed(2)}, threshold: ${rule.threshold})`,
      value,
      threshold: rule.threshold,
      firedAt: new Date()
    };

    this.activeAlerts.set(rule.id, alert);
    this.addToHistory(alert);

    // Send notifications
    this.sendNotifications(alert, rule.notificationChannels);

    return alert;
  }

  /**
   * Resolve алерт
   */
  private resolveAlert(ruleId: string): void {
    const alert = this.activeAlerts.get(ruleId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      this.activeAlerts.delete(ruleId);
      
      console.log(`✅ Alert resolved: ${alert.ruleName}`);
    }
  }

  /**
   * Silence алерт
   */
  silenceAlert(ruleId: string, durationMs: number): boolean {
    const alert = this.activeAlerts.get(ruleId);
    if (alert) {
      alert.status = 'silenced';
      alert.silencedUntil = new Date(Date.now() + durationMs);
      console.log(`🔇 Alert silenced: ${alert.ruleName} until ${alert.silencedUntil.toISOString()}`);
      return true;
    }
    return false;
  }

  /**
   * Извлечь значение метрики для правила
   */
  private extractValue(rule: AlertRule, metrics: any): number {
    // Map rule IDs to metric values
    const valueMap: Record<string, number> = {
      'high_error_rate': metrics.errors.rate,
      'slow_response_time': metrics.performance.responseTime.p95,
      'very_slow_response_time': metrics.performance.responseTime.p95,
      'low_cache_hit_rate': metrics.cache.hitRate,
      'slow_db_queries': metrics.performance.dbQueryTime.p95,
      'high_request_volume': metrics.requests.total
    };

    return valueMap[rule.id] || 0;
  }

  /**
   * Отправить уведомления
   */
  private sendNotifications(alert: Alert, channels: string[]): void {
    for (const channel of channels) {
      switch (channel) {
        case 'log':
          this.logAlert(alert);
          break;
        case 'webhook':
          // Webhook будет реализован позже
          console.log(`📢 Would send webhook for alert: ${alert.ruleName}`);
          break;
        default:
          console.warn(`Unknown notification channel: ${channel}`);
      }
    }
  }

  /**
   * Log алерт
   */
  private logAlert(alert: Alert): void {
    const emoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${emoji} ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
  }

  /**
   * Добавить в историю
   */
  private addToHistory(alert: Alert): void {
    this.alertHistory.unshift(alert);
    
    // Trim history if too large
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Получить активные алерты
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Получить историю алертов
   */
  getAlertHistory(limit: number = 100): AlertHistory {
    const alerts = this.alertHistory.slice(0, limit);
    const totalFired = this.alertHistory.length;
    const totalResolved = this.alertHistory.filter(a => a.status === 'resolved').length;
    const activeFiring = this.activeAlerts.size;

    return {
      alerts,
      totalFired,
      totalResolved,
      activeFiring
    };
  }

  /**
   * Очистить историю
   */
  clearHistory(): void {
    this.alertHistory = [];
  }
}

// Singleton instance
let alertManager: AlertManager | null = null;

export function getAlertManager(): AlertManager {
  if (!alertManager) {
    alertManager = new AlertManager();
  }
  return alertManager;
}
