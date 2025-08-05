# Configure the Azure Provider
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~>3.0"
    }
  }
}

# Configure the Microsoft Azure Provider
provider "azurerm" {
  features {}
}

# Create a resource group
resource "azurerm_resource_group" "quote_service" {
  name     = var.resource_group_name
  location = var.location

  tags = var.common_tags
}

# Create a virtual network
resource "azurerm_virtual_network" "quote_service" {
  name                = "${var.project_name}-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.quote_service.location
  resource_group_name = azurerm_resource_group.quote_service.name

  tags = var.common_tags
}

# Create a subnet for the app service
resource "azurerm_subnet" "app_service" {
  name                 = "${var.project_name}-app-subnet"
  resource_group_name  = azurerm_resource_group.quote_service.name
  virtual_network_name = azurerm_virtual_network.quote_service.name
  address_prefixes     = ["10.0.1.0/24"]

  delegation {
    name = "app-service-delegation"
    service_delegation {
      name    = "Microsoft.Web/serverFarms"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

# Create a subnet for the database
resource "azurerm_subnet" "database" {
  name                 = "${var.project_name}-db-subnet"
  resource_group_name  = azurerm_resource_group.quote_service.name
  virtual_network_name = azurerm_virtual_network.quote_service.name
  address_prefixes     = ["10.0.2.0/24"]

  service_endpoints = ["Microsoft.Storage"]

  delegation {
    name = "database-delegation"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}