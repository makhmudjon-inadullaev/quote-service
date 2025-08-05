# Create Redis Cache
resource "azurerm_redis_cache" "quote_service" {
  name                = "${var.project_name}-redis"
  location            = azurerm_resource_group.quote_service.location
  resource_group_name = azurerm_resource_group.quote_service.name
  capacity                    = var.redis_capacity
  family                      = var.redis_family
  sku_name                    = var.redis_sku
  public_network_access_enabled = true
  minimum_tls_version         = "1.2"

  redis_configuration {
    maxmemory_reserved              = 10
    maxmemory_delta                 = 2
    maxmemory_policy                = "allkeys-lru"
    notify_keyspace_events          = ""
  }

  patch_schedule {
    day_of_week    = "Sunday"
    start_hour_utc = 2
  }

  tags = var.common_tags
}

# Redis firewall rule to allow access from App Service
resource "azurerm_redis_firewall_rule" "app_service" {
  name               = "app-service-access"
  redis_cache_name   = azurerm_redis_cache.quote_service.name
  resource_group_name = azurerm_resource_group.quote_service.name
  start_ip           = "0.0.0.0"
  end_ip             = "255.255.255.255"
}