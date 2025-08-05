# Create App Service Plan
resource "azurerm_service_plan" "quote_service" {
  name                = "${var.project_name}-asp"
  resource_group_name = azurerm_resource_group.quote_service.name
  location            = azurerm_resource_group.quote_service.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku

  tags = var.common_tags
}

# Create App Service
resource "azurerm_linux_web_app" "quote_service" {
  name                = "${var.project_name}-app-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.quote_service.name
  location            = azurerm_service_plan.quote_service.location
  service_plan_id     = azurerm_service_plan.quote_service.id

  virtual_network_subnet_id = azurerm_subnet.app_service.id

  site_config {
    always_on                         = true
    container_registry_use_managed_identity = true
    
    application_stack {
      docker_image_name = "${azurerm_container_registry.quote_service.login_server}/quote-service:latest"
    }

    health_check_path                 = "/health"
    health_check_eviction_time_in_min = 2
  }

  app_settings = {
    "NODE_ENV"                              = "production"
    "PORT"                                  = "3000"
    "DATABASE_URL"                          = "postgresql://${var.db_admin_username}:${var.db_admin_password}@${azurerm_postgresql_flexible_server.quote_service.fqdn}:5432/quotes?sslmode=require"
    "REDIS_URL"                             = "rediss://:${azurerm_redis_cache.quote_service.primary_access_key}@${azurerm_redis_cache.quote_service.hostname}:6380"
    "DOCKER_REGISTRY_SERVER_URL"           = "https://${azurerm_container_registry.quote_service.login_server}"
    "DOCKER_REGISTRY_SERVER_USERNAME"      = azurerm_container_registry.quote_service.admin_username
    "DOCKER_REGISTRY_SERVER_PASSWORD"      = azurerm_container_registry.quote_service.admin_password
    "WEBSITES_ENABLE_APP_SERVICE_STORAGE"  = "false"
    "APPINSIGHTS_INSTRUMENTATIONKEY"       = azurerm_application_insights.quote_service.instrumentation_key
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.quote_service.connection_string
  }

  identity {
    type = "SystemAssigned"
  }

  logs {
    detailed_error_messages = true
    failed_request_tracing  = true

    application_logs {
      file_system_level = "Information"
    }

    http_logs {
      file_system {
        retention_in_days = 7
        retention_in_mb   = 35
      }
    }
  }

  tags = var.common_tags
}

# Grant the App Service managed identity access to the container registry
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.quote_service.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.quote_service.identity[0].principal_id
}

# Custom domain and SSL (optional)
# resource "azurerm_app_service_custom_hostname_binding" "quote_service" {
#   hostname            = "quotes.yourdomain.com"
#   app_service_name    = azurerm_linux_web_app.quote_service.name
#   resource_group_name = azurerm_resource_group.quote_service.name
# }

# Auto-scaling settings
resource "azurerm_monitor_autoscale_setting" "quote_service" {
  name                = "${var.project_name}-autoscale"
  resource_group_name = azurerm_resource_group.quote_service.name
  location            = azurerm_resource_group.quote_service.location
  target_resource_id  = azurerm_service_plan.quote_service.id

  profile {
    name = "default"

    capacity {
      default = 1
      minimum = 1
      maximum = 3
    }

    rule {
      metric_trigger {
        metric_name        = "CpuPercentage"
        metric_resource_id = azurerm_service_plan.quote_service.id
        time_grain         = "PT1M"
        statistic          = "Average"
        time_window        = "PT5M"
        time_aggregation   = "Average"
        operator           = "GreaterThan"
        threshold          = 70
      }

      scale_action {
        direction = "Increase"
        type      = "ChangeCount"
        value     = "1"
        cooldown  = "PT5M"
      }
    }

    rule {
      metric_trigger {
        metric_name        = "CpuPercentage"
        metric_resource_id = azurerm_service_plan.quote_service.id
        time_grain         = "PT1M"
        statistic          = "Average"
        time_window        = "PT5M"
        time_aggregation   = "Average"
        operator           = "LessThan"
        threshold          = 30
      }

      scale_action {
        direction = "Decrease"
        type      = "ChangeCount"
        value     = "1"
        cooldown  = "PT5M"
      }
    }
  }

  tags = var.common_tags
}