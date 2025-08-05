# Monitoring and Observability

This document describes the comprehensive monitoring and observability features implemented in the Quote Service.

## Overview

The Quote Service includes a full monitoring stack with:

- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Request Tracing**: Distributed tracing with trace and span IDs
- **Metrics Collection**: Application and business metrics
- **Health Checks**: Comprehensive health monitoring
- **Performance Monitoring**: Request timing and system metrics

## Structured Logging

### Log Levels

- `FATAL`: System is unusable
- `ERROR`: Error conditions that need attention
- `WARN`: Warning conditions
- `INFO`: Informational messages (default)
- `DEBUG`: Debug-level messages
- `TRACE`: Very detailed debug information

### Log Format

All logs are structured JSON with the following base fields:

```json
{
  "level": "INFO",
  "time": "2024-01-01T12:00:00.000Z",
  "service": "quote-service",
  "version": "1.0.0",
  "environment": "production",
  "msg": "Request completed",
  "trace": {
    "traceId": "550e8400-e29b-41d4-a716-446655440000",
    "spanId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "requestId": "req_123456"
  }
}
```

### Specialized Loggers

The service provides specialized loggers for different contexts:

- `structuredLogger.request()` - HTTP request logging
- `structuredLogger.performance()` - Performance metrics
- `structuredLogger.database()` - Database operations
- `structuredLogger.cache()` - Cache operations
- `structuredLogger.external()` - External API calls
- `structuredLogger.business()` - Business logic events
- `structuredLogger.security()` - Security events
- `structuredLogger.audit()` - Audit trail
- `structuredLogger.health()` - Health check events

## Request Tracing

### Trace Context

Each request gets a trace context with:

- **Trace ID**: Unique identifier for the entire request flow
- **Span ID**: Unique identifier for this service's processing
- **Parent Span ID**: ID of the calling service (if applicable)
- **Request ID**: Unique identifier for this specific request
- **User ID**: Authenticated user identifier (if available)
- **Session ID**: User session identifier (if available)

### Headers

The service supports standard tracing headers:

- `X-Trace-ID`: Custom trace ID
- `X-Request-ID`: Request identifier
- `X-Parent-Span-ID`: Parent span ID
- `traceparent`: W3C Trace Context
- `X-B3-TraceId`: Zipkin B3 trace ID

### Child Spans

For internal operations, you can create child spans:

```typescript
import { createChildSpan } from '../middleware/tracing';

const childSpan = createChildSpan(request.trace, 'database-query', {
  table: 'quotes',
  operation: 'select'
});

childSpan.log('Executing query');
// ... perform operation
childSpan.finish();
```

## Metrics Collection

### Metric Types

- **Counters**: Monotonically increasing values (e.g., request count)
- **Gauges**: Point-in-time values (e.g., memory usage)
- **Histograms**: Distribution of values (e.g., response times)
- **Timers**: Duration measurements

### Application Metrics

#### HTTP Metrics
- `http_requests_total` - Total HTTP requests by method, endpoint, status
- `http_request_duration_ms` - Request duration histogram
- `http_errors_total` - HTTP errors by type and endpoint

#### Database Metrics
- `database_queries_total` - Database queries by operation and table
- `database_query_duration_ms` - Query duration histogram
- `database_errors_total` - Database errors by operation

#### Cache Metrics
- `cache_hits_total` - Cache hits by operation
- `cache_misses_total` - Cache misses by operation

#### External API Metrics
- `external_api_calls_total` - External API calls by service and status
- `external_api_response_time_ms` - API response time histogram
- `external_api_errors_total` - External API errors

#### Business Metrics
- `quotes_requested_total` - Quotes requested by source
- `quotes_liked_total` - Total quote likes
- `similar_quotes_requested_total` - Similar quote requests

#### System Metrics
- `memory_heap_used_bytes` - Heap memory usage
- `memory_heap_total_bytes` - Total heap memory
- `memory_rss_bytes` - Resident set size
- `uptime_seconds` - Process uptime
- `active_connections` - Active HTTP connections

### Metrics Endpoints

- `GET /metrics/prometheus` - Prometheus format metrics
- `GET /metrics/json` - JSON format metrics
- `GET /metrics/summary` - Human-readable summary

## Health Checks

### Endpoints

- `GET /health` - Comprehensive health check
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/database` - Database-specific health
- `GET /health/redis` - Redis-specific health
- `GET /health/external-apis` - External API health

### Health Status

- **healthy**: All systems operational
- **degraded**: Some non-critical systems down
- **unhealthy**: Critical systems down

### Health Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0",
  "services": {
    "database": {
      "status": "connected",
      "responseTime": 5
    },
    "redis": {
      "status": "connected",
      "responseTime": 2
    },
    "external_apis": {
      "quotable": {
        "status": "available",
        "responseTime": 150
      },
      "dummyjson": {
        "status": "available",
        "responseTime": 200
      }
    }
  },
  "performance": {
    "totalRequests": 1000,
    "averageResponseTime": 45.5,
    "errorRate": 0.5,
    "requestsPerSecond": 10.2,
    "memoryUsage": {
      "heapUsed": 45.2,
      "heapTotal": 67.1,
      "rss": 89.3
    }
  }
}
```

## Performance Monitoring

### Request Performance

Every request is automatically timed and logged with:

- Response time
- Memory usage snapshot
- CPU usage (if available)
- Request/response sizes

### Slow Request Detection

Requests taking longer than 2 seconds are automatically flagged:

```json
{
  "level": "WARN",
  "msg": "Slow request detected",
  "requestId": "req_123",
  "method": "GET",
  "url": "/api/quotes/random",
  "responseTime": 2500,
  "statusCode": 200
}
```

### Performance Headers

Response headers include performance information:

- `X-Response-Time`: Request processing time in milliseconds
- `X-Request-ID`: Unique request identifier

## Configuration

### Environment Variables

```bash
# Monitoring Configuration
METRICS_ENABLED=true
REQUEST_ID_HEADER=x-request-id
LOG_LEVEL=info

# Tracing Configuration
TRUST_PROXY=true

# Health Check Configuration
HEALTH_CHECK_TIMEOUT=5000
```

### Disabling Monitoring

To disable metrics collection:

```bash
METRICS_ENABLED=false
```

## Integration with External Systems

### Prometheus

The service exposes metrics in Prometheus format at `/metrics/prometheus`:

```
# TYPE http_requests_total counter
http_requests_total{method="GET",endpoint="/api/quotes/random",status="200"} 1000

# TYPE http_request_duration_ms histogram
http_request_duration_ms_count{method="GET",endpoint="/api/quotes/random"} 1000
http_request_duration_ms_sum{method="GET",endpoint="/api/quotes/random"} 45500
```

### Log Aggregation

Structured JSON logs can be easily ingested by:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Fluentd/Fluent Bit**
- **Grafana Loki**
- **Splunk**
- **DataDog**

### APM Integration

The tracing system is compatible with:

- **Jaeger**
- **Zipkin**
- **AWS X-Ray**
- **DataDog APM**
- **New Relic**

## Development vs Production

### Development

- Pretty-printed logs with colors
- Debug information included
- Query logging enabled
- Detailed error messages

### Production

- Structured JSON logs
- Optimized log levels
- Security-sensitive information filtered
- Performance optimized

## Monitoring Best Practices

1. **Use Correlation IDs**: Always include trace/request IDs in logs
2. **Log at Appropriate Levels**: Use DEBUG for development, INFO for production
3. **Include Context**: Add relevant metadata to log entries
4. **Monitor Key Metrics**: Track request rates, error rates, and response times
5. **Set Up Alerts**: Configure alerts for critical metrics and errors
6. **Regular Health Checks**: Monitor all health endpoints
7. **Performance Baselines**: Establish performance baselines and monitor deviations

## Troubleshooting

### High Memory Usage

Check memory metrics and look for:
- Memory leaks in application code
- Large response payloads
- Excessive caching

### Slow Requests

Investigate using:
- Request tracing logs
- Database query performance
- External API response times
- Cache hit rates

### High Error Rates

Analyze error logs for:
- Common error patterns
- External service failures
- Database connectivity issues
- Validation errors

## Example Queries

### Prometheus Queries

```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_errors_total[5m]) / rate(http_requests_total[5m])

# 95th percentile response time
histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))

# Memory usage
memory_heap_used_bytes / memory_heap_total_bytes
```

### Log Queries (JSON)

```json
// Find all errors in the last hour
{
  "level": "ERROR",
  "time": {
    "$gte": "2024-01-01T11:00:00.000Z"
  }
}

// Find slow requests
{
  "logType": "performance",
  "responseTime": {
    "$gte": 2000
  }
}

// Trace a specific request
{
  "trace.requestId": "req_123456"
}
```