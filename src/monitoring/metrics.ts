import { logger } from '../config/logger';
import { redisClient } from '../config/redis';
import { config } from '../config/env';

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
}

export interface CounterMetric {
  name: string;
  value: number;
  tags?: Record<string, string>;
}

export interface GaugeMetric {
  name: string;
  value: number;
  tags?: Record<string, string>;
}

export interface HistogramMetric {
  name: string;
  values: number[];
  tags?: Record<string, string>;
}

export interface TimerMetric {
  name: string;
  duration: number;
  tags?: Record<string, string>;
}

/**
 * Metrics collector for application monitoring
 */
export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private timers = new Map<string, number[]>();
  private metricPoints: MetricPoint[] = [];
  private readonly maxMetricPoints = 10000;

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
    const key = this.createMetricKey(name, tags);
    const currentValue = this.counters.get(key) || 0;
    this.counters.set(key, currentValue + value);

    this.recordMetricPoint({
      name,
      value: currentValue + value,
      timestamp: Date.now(),
      tags,
      type: 'counter',
    });

    logger.debug('Counter incremented', { name, value, tags, total: currentValue + value });
  }

  /**
   * Set a gauge metric
   */
  setGauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.createMetricKey(name, tags);
    this.gauges.set(key, value);

    this.recordMetricPoint({
      name,
      value,
      timestamp: Date.now(),
      tags,
      type: 'gauge',
    });

    logger.debug('Gauge set', { name, value, tags });
  }

  /**
   * Record a histogram value
   */
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.createMetricKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    
    // Keep only last 1000 values to prevent memory issues
    if (values.length > 1000) {
      values.splice(0, values.length - 1000);
    }
    
    this.histograms.set(key, values);

    this.recordMetricPoint({
      name,
      value,
      timestamp: Date.now(),
      tags,
      type: 'histogram',
    });

    logger.debug('Histogram recorded', { name, value, tags });
  }

  /**
   * Record a timer metric
   */
  recordTimer(name: string, duration: number, tags?: Record<string, string>): void {
    const key = this.createMetricKey(name, tags);
    const durations = this.timers.get(key) || [];
    durations.push(duration);
    
    // Keep only last 1000 values
    if (durations.length > 1000) {
      durations.splice(0, durations.length - 1000);
    }
    
    this.timers.set(key, durations);

    this.recordMetricPoint({
      name,
      value: duration,
      timestamp: Date.now(),
      tags,
      type: 'timer',
    });

    logger.debug('Timer recorded', { name, duration, tags });
  }

  /**
   * Create a timer that automatically records when finished
   */
  startTimer(name: string, tags?: Record<string, string>): () => void {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.recordTimer(name, duration, tags);
    };
  }

  /**
   * Get counter value
   */
  getCounter(name: string, tags?: Record<string, string>): number {
    const key = this.createMetricKey(name, tags);
    return this.counters.get(key) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string, tags?: Record<string, string>): number {
    const key = this.createMetricKey(name, tags);
    return this.gauges.get(key) || 0;
  }

  /**
   * Get histogram statistics
   */
  getHistogramStats(name: string, tags?: Record<string, string>): {
    count: number;
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = this.createMetricKey(name, tags);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: sum / count,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  /**
   * Get timer statistics
   */
  getTimerStats(name: string, tags?: Record<string, string>): {
    count: number;
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = this.createMetricKey(name, tags);
    const durations = this.timers.get(key);
    
    if (!durations || durations.length === 0) {
      return null;
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean: sum / count,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  /**
   * Get all metrics summary
   */
  getAllMetrics(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, any>;
    timers: Record<string, any>;
    timestamp: string;
  } {
    const histogramStats: Record<string, any> = {};
    for (const [key] of this.histograms) {
      const [name, tags] = this.parseMetricKey(key);
      histogramStats[key] = this.getHistogramStats(name, tags);
    }

    const timerStats: Record<string, any> = {};
    for (const [key] of this.timers) {
      const [name, tags] = this.parseMetricKey(key);
      timerStats[key] = this.getTimerStats(name, tags);
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: histogramStats,
      timers: timerStats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = [];

    // Export counters
    for (const [key, value] of this.counters) {
      const [name, tags] = this.parseMetricKey(key);
      const tagsStr = tags ? this.formatPrometheusTags(tags) : '';
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${tagsStr} ${value}`);
    }

    // Export gauges
    for (const [key, value] of this.gauges) {
      const [name, tags] = this.parseMetricKey(key);
      const tagsStr = tags ? this.formatPrometheusTags(tags) : '';
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${tagsStr} ${value}`);
    }

    // Export histograms
    for (const [key] of this.histograms) {
      const [name, tags] = this.parseMetricKey(key);
      const stats = this.getHistogramStats(name, tags);
      if (stats) {
        const tagsStr = tags ? this.formatPrometheusTags(tags) : '';
        lines.push(`# TYPE ${name} histogram`);
        lines.push(`${name}_count${tagsStr} ${stats.count}`);
        lines.push(`${name}_sum${tagsStr} ${stats.mean * stats.count}`);
        lines.push(`${name}_bucket{le="0.5"${tags ? ',' + Object.entries(tags).map(([k, v]) => `${k}="${v}"`).join(',') : ''}} ${stats.p50}`);
        lines.push(`${name}_bucket{le="0.95"${tags ? ',' + Object.entries(tags).map(([k, v]) => `${k}="${v}"`).join(',') : ''}} ${stats.p95}`);
        lines.push(`${name}_bucket{le="0.99"${tags ? ',' + Object.entries(tags).map(([k, v]) => `${k}="${v}"`).join(',') : ''}} ${stats.p99}`);
        lines.push(`${name}_bucket{le="+Inf"${tags ? ',' + Object.entries(tags).map(([k, v]) => `${k}="${v}"`).join(',') : ''}} ${stats.count}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Persist metrics to Redis
   */
  async persistMetrics(): Promise<void> {
    if (!config.METRICS_ENABLED) return;

    try {
      await redisClient.connect();
      const metricsKey = `metrics:${Date.now()}`;
      const metrics = this.getAllMetrics();
      
      await redisClient.set(
        metricsKey,
        JSON.stringify(metrics),
        7200 // 2 hours TTL
      );

      logger.debug('Metrics persisted to Redis', { key: metricsKey });
    } catch (error) {
      logger.error('Failed to persist metrics to Redis', { error });
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timers.clear();
    this.metricPoints = [];
    logger.info('All metrics cleared');
  }

  /**
   * Record a metric point
   */
  private recordMetricPoint(point: MetricPoint): void {
    this.metricPoints.push(point);

    // Keep only recent metric points
    if (this.metricPoints.length > this.maxMetricPoints) {
      this.metricPoints = this.metricPoints.slice(-this.maxMetricPoints);
    }
  }

  /**
   * Create a unique key for a metric with tags
   */
  private createMetricKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    
    const sortedTags = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    
    return `${name}{${sortedTags}}`;
  }

  /**
   * Parse a metric key back to name and tags
   */
  private parseMetricKey(key: string): [string, Record<string, string> | undefined] {
    const match = key.match(/^([^{]+)(?:\{(.+)\})?$/);
    if (!match) {
      return [key, undefined];
    }

    const [, name, tagsStr] = match;
    if (!tagsStr) {
      return [name, undefined];
    }

    const tags: Record<string, string> = {};
    tagsStr.split(',').forEach(tagPair => {
      const [k, v] = tagPair.split(':');
      if (k && v) {
        tags[k] = v;
      }
    });

    return [name, tags];
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Format tags for Prometheus export
   */
  private formatPrometheusTags(tags: Record<string, string>): string {
    const tagPairs = Object.entries(tags).map(([k, v]) => `${k}="${v}"`);
    return tagPairs.length > 0 ? `{${tagPairs.join(',')}}` : '';
  }
}

// Global metrics collector instance
export const metricsCollector = new MetricsCollector();

// Application-specific metrics helpers
export const AppMetrics = {
  // Request metrics
  incrementRequestCount: (method: string, endpoint: string, status: number) => {
    metricsCollector.incrementCounter('http_requests_total', 1, {
      method,
      endpoint,
      status: status.toString(),
    });
  },

  recordRequestDuration: (method: string, endpoint: string, duration: number) => {
    metricsCollector.recordTimer('http_request_duration_ms', duration, {
      method,
      endpoint,
    });
  },

  // Database metrics
  incrementDatabaseQuery: (operation: string, table?: string) => {
    metricsCollector.incrementCounter('database_queries_total', 1, {
      operation,
      table: table || 'unknown',
    });
  },

  recordDatabaseQueryDuration: (operation: string, duration: number, table?: string) => {
    metricsCollector.recordTimer('database_query_duration_ms', duration, {
      operation,
      table: table || 'unknown',
    });
  },

  // Cache metrics
  incrementCacheHit: (operation: string) => {
    metricsCollector.incrementCounter('cache_hits_total', 1, { operation });
  },

  incrementCacheMiss: (operation: string) => {
    metricsCollector.incrementCounter('cache_misses_total', 1, { operation });
  },

  // External API metrics
  incrementExternalAPICall: (api: string, status: number) => {
    metricsCollector.incrementCounter('external_api_calls_total', 1, {
      api,
      status: status.toString(),
    });
  },

  recordExternalAPIResponseTime: (api: string, duration: number) => {
    metricsCollector.recordTimer('external_api_response_time_ms', duration, { api });
  },

  // Business metrics
  incrementQuoteRequested: (source: string) => {
    metricsCollector.incrementCounter('quotes_requested_total', 1, { source });
  },

  incrementQuoteLiked: () => {
    metricsCollector.incrementCounter('quotes_liked_total', 1);
  },

  incrementSimilarQuoteRequested: () => {
    metricsCollector.incrementCounter('similar_quotes_requested_total', 1);
  },

  // System metrics
  setActiveConnections: (count: number) => {
    metricsCollector.setGauge('active_connections', count);
  },

  setMemoryUsage: (heapUsed: number, heapTotal: number, rss: number) => {
    metricsCollector.setGauge('memory_heap_used_bytes', heapUsed);
    metricsCollector.setGauge('memory_heap_total_bytes', heapTotal);
    metricsCollector.setGauge('memory_rss_bytes', rss);
  },

  setUptime: (seconds: number) => {
    metricsCollector.setGauge('uptime_seconds', seconds);
  },
};