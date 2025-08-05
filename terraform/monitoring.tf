# Create Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "quote_service" {
  name                = "${var.project_name}-logs"
  location            = azurerm_resource_group.quote_service.location
  resource_group_name = azurerm_resource_group.quote_service.name
  sku                 = "PerGB2018"
  retention_in_days   = 30

  tags = var.common_tags
}

# Create Application Insights
resource "azurerm_application_insights" "quote_service" {
  name                = "${var.project_name}-insights"
  location            = azurerm_resource_group.quote_service.location
  resource_group_name = azurerm_resource_group.quote_service.name
  workspace_id        = azurerm_log_analytics_workspace.quote_service.id
  application_type    = "Node.JS"

  tags = var.common_tags
}

# Create Action Group for alerts
resource "azurerm_monitor_action_group" "quote_service" {
  name                = "${var.project_name}-alerts"
  resource_group_name = azurerm_resource_group.quote_service.name
  short_name          = "quotealerts"

  email_receiver {
    name          = "admin"
    email_address = "admin@yourdomain.com" # Change this to your email
  }

  tags = var.common_tags
}

# Create metric alerts
resource "azurerm_monitor_metric_alert" "high_cpu" {
  name                = "${var.project_name}-high-cpu"
  resource_group_name = azurerm_resource_group.quote_service.name
  scopes              = [azurerm_service_plan.quote_service.id]
  description         = "Alert when CPU usage is high"
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Web/serverfarms"
    metric_name      = "CpuPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.quote_service.id
  }

  tags = var.common_tags
}

resource "azurerm_monitor_metric_alert" "high_memory" {
  name                = "${var.project_name}-high-memory"
  resource_group_name = azurerm_resource_group.quote_service.name
  scopes              = [azurerm_service_plan.quote_service.id]
  description         = "Alert when memory usage is high"
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Web/serverfarms"
    metric_name      = "MemoryPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.quote_service.id
  }

  tags = var.common_tags
}

resource "azurerm_monitor_metric_alert" "response_time" {
  name                = "${var.project_name}-slow-response"
  resource_group_name = azurerm_resource_group.quote_service.name
  scopes              = [azurerm_linux_web_app.quote_service.id]
  description         = "Alert when response time is slow"
  severity            = 3
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "HttpResponseTime"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action {
    action_group_id = azurerm_monitor_action_group.quote_service.id
  }

  tags = var.common_tags
}

# Create availability test
resource "azurerm_application_insights_web_test" "quote_service" {
  name                    = "${var.project_name}-availability"
  location                = azurerm_resource_group.quote_service.location
  resource_group_name     = azurerm_resource_group.quote_service.name
  application_insights_id = azurerm_application_insights.quote_service.id
  kind                    = "ping"
  frequency               = 300
  timeout                 = 30
  enabled                 = true
  geo_locations           = ["us-tx-sn1-azr", "us-il-ch1-azr"]

  configuration = <<XML
<WebTest Name="${var.project_name}-availability" Id="ABD48585-0831-40CB-9069-682EA6BB3583" Enabled="True" CssProjectStructure="" CssIteration="" Timeout="30" WorkItemIds="" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010" Description="" CredentialUserName="" CredentialPassword="" PreAuthenticate="True" Proxy="default" StopOnError="False" RecordedResultFile="" ResultsLocale="">
  <Items>
    <Request Method="GET" Guid="a5f10126-e4cd-570d-961c-cea43999a200" Version="1.1" Url="https://${azurerm_linux_web_app.quote_service.default_hostname}/health" ThinkTime="0" Timeout="30" ParseDependentRequests="True" FollowRedirects="True" RecordResult="True" Cache="False" ResponseTimeGoal="0" Encoding="utf-8" ExpectedHttpStatusCode="200" ExpectedResponseUrl="" ReportingName="" IgnoreHttpStatusCode="False" />
  </Items>
</WebTest>
XML

  tags = var.common_tags
}