# Create a private DNS zone for PostgreSQL
resource "azurerm_private_dns_zone" "postgres" {
  name                = "${var.project_name}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.quote_service.name

  tags = var.common_tags
}

# Link the private DNS zone to the virtual network
resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "${var.project_name}-postgres-dns-link"
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  virtual_network_id    = azurerm_virtual_network.quote_service.id
  resource_group_name   = azurerm_resource_group.quote_service.name

  tags = var.common_tags
}

# Create PostgreSQL Flexible Server
resource "azurerm_postgresql_flexible_server" "quote_service" {
  name                   = "${var.project_name}-postgres"
  resource_group_name    = azurerm_resource_group.quote_service.name
  location               = azurerm_resource_group.quote_service.location
  version                = "14"
  delegated_subnet_id    = azurerm_subnet.database.id
  private_dns_zone_id    = azurerm_private_dns_zone.postgres.id
  administrator_login    = var.db_admin_username
  administrator_password = var.db_admin_password
  zone                   = "1"

  storage_mb = var.postgres_storage_mb

  sku_name = var.postgres_sku

  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  high_availability {
    mode = "ZoneRedundant"
  }

  maintenance_window {
    day_of_week  = 0
    start_hour   = 8
    start_minute = 0
  }

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]

  tags = var.common_tags
}

# Create PostgreSQL database
resource "azurerm_postgresql_flexible_server_database" "quote_service" {
  name      = "quotes"
  server_id = azurerm_postgresql_flexible_server.quote_service.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

# PostgreSQL server configuration
resource "azurerm_postgresql_flexible_server_configuration" "quote_service" {
  for_each = {
    "azure.extensions"                = "uuid-ossp"
    "shared_preload_libraries"        = "pg_stat_statements"
    "log_statement"                   = "all"
    "log_min_duration_statement"      = "1000"
    "log_checkpoints"                 = "on"
    "log_connections"                 = "on"
    "log_disconnections"              = "on"
    "log_lock_waits"                  = "on"
    "log_temp_files"                  = "0"
    "track_activities"                = "on"
    "track_counts"                    = "on"
    "track_io_timing"                 = "on"
    "track_functions"                 = "all"
  }

  name      = each.key
  server_id = azurerm_postgresql_flexible_server.quote_service.id
  value     = each.value
}