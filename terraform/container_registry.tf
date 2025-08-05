# Create Azure Container Registry
resource "azurerm_container_registry" "quote_service" {
  name                = "${replace(var.project_name, "-", "")}acr${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.quote_service.name
  location            = azurerm_resource_group.quote_service.location
  sku                 = var.container_registry_sku
  admin_enabled       = true

  tags = var.common_tags
}

# Random string for unique naming
resource "random_string" "suffix" {
  length  = 4
  special = false
  upper   = false
}